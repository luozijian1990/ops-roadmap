# eBPF 运维与故障排查学习笔记

## 第 1 章 · 运维为什么需要 eBPF

### eBPF 解决哪些传统运维工具解决不了的问题

`top`、`ps`、`vmstat` 等工具按周期采样，适合持续负载，却容易漏掉瞬间退出的进程、偶发系统调用、短暂丢包和特定请求的慢路径。eBPF 把程序挂到内核或用户态事件上，事件发生时立即执行，把“看见结果”推进到“看见过程”。

| 传统手段 | 盲区 | eBPF 补充 |
| --- | --- | --- |
| `top`、`ps` | 漏掉短时进程 | 监听 `execve` |
| `tcpdump` | 看不到协议栈决策 | 跟踪 `kfree_skb`、TC、XDP |
| 应用日志 | 依赖主动打印 | uprobe、USDT |
| 修改内核 | 发布和回滚成本高 | 动态加载和卸载 |

运维排障的关键不是“使用了新工具”，而是能把一个现象拆成可验证的事件。例如 CPU 飙高时，先判断是用户态计算、系统调用、软中断还是调度开销；网络延迟升高时，分别测量发送、协议栈、排队和应用读取时间。eBPF 可以在这些边界上留下时间戳和上下文。

一个典型的事件记录至少包含以下字段：

| 字段 | 用途 |
| --- | --- |
| 时间戳 | 计算耗时和事件顺序 |
| PID/TID/comm | 关联进程和线程 |
| cgroup ID | 关联容器或工作负载 |
| CPU ID | 判断调度和 NUMA 影响 |
| 事件类型 | 区分入口、返回、错误和丢弃 |
| 参数和返回值 | 验证业务假设 |

### eBPF 在监控、排障、网络和安全中的位置

eBPF 位于“内核事件”与“运维系统”之间。它负责采集和初步聚合，不负责替代 Prometheus、日志平台或告警系统。用户态程序应将结果转换成指标、日志、Trace span 或安全事件。

```mermaid
flowchart LR
    Kernel[内核事件] --> Probe[eBPF Probe]
    Probe --> Map[Map 聚合]
    Map --> Agent[用户态 Agent]
    Agent --> Metrics[指标]
    Agent --> Logs[结构化日志]
    Agent --> Traces[Trace]
    Agent --> Alert[告警平台]
```

在生产环境中，eBPF 常与现有工具组合：Prometheus 保存低基数趋势，日志平台保存异常事件，分布式追踪保存请求上下文，eBPF 负责补齐系统调用、调度和网络路径的细节。

如果只需要主机级 CPU 使用率，现有监控已经足够；当问题变成“哪个函数导致延迟”或“数据包在哪里被丢弃”时，才需要事件级观测。

它也有明确边界：程序不能任意睡眠或分配内核内存，不能依赖所有内核函数都稳定存在，也不能绕过权限模型读取任意进程数据。采集粒度越细，事件量和 CPU 成本越高；网络路径越早，能观察到的应用语义越少。

上线前要回答三个问题：数据是否真的能解释故障，采集开销是否低于故障成本，程序失效时是否有传统路径和卸载方法。只有三个问题都能回答，才适合把脚本放进生产节点。

### eBPF 如何在不改内核的情况下扩展观测能力

LLVM/Clang 将程序编译为 BPF 字节码，`bpf()` 系统调用把字节码提交给内核。验证器检查指针、边界、循环和 helper 权限，验证通过后才解释执行或 JIT 编译。

用户态生成并加载字节码，内核 verifier 通过后，程序才会挂载到 kprobe、uprobe、tracepoint 或 perf event。运维排障时可以沿这条链路定位失败：没有字节码是编译问题，verifier 拒绝是安全或兼容问题，没有事件输出则要检查挂载和 Map 读取。

从运行时结构看，eBPF 可以拆成五个部分：指令与寄存器负责执行受限程序，Verifier 检查安全性，JIT 或解释器执行指令，Helper 提供受控内核能力，Map 保存跨事件共享状态。事件探针只是触发上下文，程序仍需从上下文参数确认谁在什么时间做了什么。

| 模块 | 运维关注点 |
| --- | --- |
| 指令与寄存器 | 指令上限、栈大小 |
| Verifier | 加载日志、指针边界 |
| JIT/解释器 | 架构支持、执行开销 |
| Helper | 程序类型、权限 |
| Map | 内存、并发、生命周期 |

```mermaid
flowchart LR
    Source[源代码] --> LLVM[LLVM]
    LLVM --> Bytecode[BPF 字节码]
    Bytecode --> Verify[Verifier]
    Verify --> JIT[JIT]
    JIT --> Hook[挂载点]
```

编译和加载是两个不同阶段。编译失败通常是头文件、Clang 版本或 C 语法问题；加载失败则多半是 verifier、权限、程序类型或内核能力问题。排障时先判断失败发生在哪一层，避免反复修改业务逻辑却忽略环境问题。

```bash
# 查看当前系统是否暴露 BTF
ls -l /sys/kernel/btf/vmlinux
# 查看程序的 ELF section
llvm-readelf -S program.bpf.o
# 让 libbpf 输出详细加载日志
LIBBPF_DEBUG=1 ./ebpf-agent --once
```

### 程序、挂载点和 Map 怎样组成一条观测链路

内核程序在事件触发时读取上下文并更新 Map，用户态控制器负责加载、挂载、读取和展示结果。

运维上最容易忽略的是生命周期管理。工具进程退出时，自动创建的对象通常会被释放；如果对象被 pin 到 `/sys/fs/bpf`，则会继续存在，可能导致旧程序和新程序同时运行。部署系统应给每个版本使用独立目录，并在升级前清理过期 link。

```bash
sudo find /sys/fs/bpf -maxdepth 2 -type f -print
sudo bpftool prog show pinned /sys/fs/bpf/ebpf-agent/prog
```

```mermaid
sequenceDiagram
    participant E as 内核事件
    participant P as eBPF 程序
    participant M as BPF Map
    participant O as 运维工具
    E->>P: 触发
    P->>M: 更新状态
    O->>M: 读取
    O->>O: 聚合输出
```

## 第 2 章 · 部署工具链并跑通第一个观测案例

### 在 Linux 主机上准备 eBPF 排障环境

```bash
sudo apt-get update
sudo apt-get install -y clang llvm libbpf-dev linux-headers-$(uname -r) \
  bpftrace bpfcc-tools linux-tools-$(uname -r)
uname -r
bpftool version
sudo bpftrace -l 'tracepoint:syscalls:sys_enter_execve'
```

debugfs 未自动挂载时执行 `sudo mount -t debugfs debugfs /sys/kernel/debug`。生产环境应明确 `CAP_BPF`、`CAP_PERFMON` 等权限，不要长期依赖业务容器的 `--privileged`。

准备环境时要区分开发机、诊断机和生产节点。开发机需要完整 LLVM、内核头文件和调试符号；诊断机需要与目标内核匹配的 `bpftool` 和 BTF；生产节点可以只部署编译好的 CO-RE 对象和轻量用户态 Agent。

检查内核配置：

```bash
grep -E 'CONFIG_BPF|CONFIG_DEBUG_INFO_BTF|CONFIG_BPF_LSM' /boot/config-$(uname -r)
cat /proc/sys/kernel/unprivileged_bpf_disabled
cat /proc/sys/kernel/perf_event_paranoid
```

如果目标是 Kubernetes 节点，还要确认 Agent 运行在 host PID/network namespace，能访问 `/sys/fs/bpf`、`/sys/kernel/debug` 和宿主机 cgroup 树。

### bpftrace、BCC 和 libbpf 分别适合什么任务

| 工具 | 适合任务 | 特点 |
| --- | --- | --- |
| bpftrace | 临时排障 | 脚本短、反馈快 |
| BCC | 快速开发诊断工具 | Python 封装成熟 |
| libbpf | 长期生产运行 | CO-RE、低依赖 |
| bpftool | 查看对象和 Map | 贴近内核状态 |

常见路径是先用 bpftrace 验证假设，再用 BCC 做工具，稳定需求最终用 libbpf CO-RE 重写。

BCC 工具并不只服务网络：VFS、文件系统、调度器、内存和应用运行时都有对应工具。运维排障时先按故障域选现成工具，再决定是否需要自定义 eBPF 程序，能显著缩短定位时间。

| 故障域 | 首选工具 | 自定义方向 |
| --- | --- | --- |
| 文件和 VFS | `opensnoop`、`fileslower` | 特定路径和进程 |
| 调度和 CPU | `runqlat`、`offcputime` | cgroup 和线程关联 |
| 内存 | `memleak`、`slabratetop` | 按调用栈聚合 |
| 网络 | `tcpconnect`、`tcpretrans` | socket 和容器关联 |
| 进程 | `execsnoop`、`killsnoop` | 父子关系和退出码 |

工具名称只是入口。运行前仍需查看脚本使用的 probe，确认目标内核存在对应 tracepoint 或函数，并评估输出频率。

工具选择也取决于故障持续时间。五分钟内需要回答问题时，脚本启动速度和表达能力更重要；需要 24 小时持续采集时，事件丢失、内存上限、升级兼容和指标标签数量更重要。不要因为 libbpf 更底层，就把所有临时排障都做成完整 Agent。

### 用 BCC 观察一次系统调用

```python
from bcc import BPF

program = r"""
int trace_openat(struct pt_regs *ctx) {
    bpf_trace_printk("openat called\\n");
    return 0;
}
"""
b = BPF(text=program)
b.attach_kprobe(event="do_sys_openat2", fn_name="trace_openat")
b.trace_print()
```

开发期可以快速打印，生产排障应尽快增加 PID、进程名、cgroup 过滤，并改用结构化事件输出。

运行示例：

```bash
sudo python3 openat_trace.py
# 另一个终端触发事件
cat /etc/hosts >/dev/null
```

如果没有输出，依次检查目标函数是否存在、进程是否真的调用该函数、脚本是否有加载权限以及 trace pipe 是否被其他程序占用。注意不同发行版的内核函数名可能不同，优先改用对应 tracepoint。

### 如何确认程序已加载、挂载并产生数据

```bash
sudo bpftool prog show
sudo bpftool link show
sudo bpftool map show
sudo bpftool prog tracelog
```

没有程序通常是权限或 verifier 问题；有程序没有 link 要检查挂载点；Map 不更新则检查事件是否发生、过滤条件是否过严以及 namespace 是否正确。

可以按下面的顺序定位：

1. `bpftool prog show` 确认程序类型和 ID。
2. `bpftool link show` 确认 link 指向的 `ifindex`、tracepoint 或 cgroup。
3. 查看 Map 的 key/value 定义和当前计数。
4. 暂时移除过滤条件，确认事件触发后再逐步恢复。
5. 记录加载日志和内核版本，形成可复现的故障报告。

## 第 3 章 · 看懂 eBPF 的运行限制

### eBPF 程序为什么不会像进程一样常驻运行

eBPF 程序由事件驱动，执行有限工作后返回；持续状态放在 Map，持续输出由用户态程序完成。它不能在内核中等待磁盘、执行 DNS 或运行复杂业务逻辑，复杂处理必须交给用户态。

运维上，这意味着入口事件保存时间戳，返回事件计算差值；高频事件只更新计数器，低频异常才发送完整事件。把采集逻辑设计成“短路径 + Map 状态”，才能避免观测工具反过来放大故障。

```mermaid
stateDiagram-v2
    [*] --> Loaded
    Loaded --> Attached
    Attached --> Running: 事件触发
    Running --> Attached: 完成
    Attached --> Detached: 卸载
    Detached --> [*]
```

### 运维排障需要理解哪些字节码基础

eBPF 使用 64 位寄存器。验证器会追踪寄存器中保存的是标量、上下文指针、Map 指针还是内核内存指针，并限制访问范围。常见错误是读取未初始化寄存器、越界访问和把错误类型的指针传给 helper。

读取可变长度数据时必须先检查长度，再调用 `bpf_probe_read_kernel` 或 `bpf_probe_read_user`。访问 tracepoint 参数优先使用 `args->field`，不要假定不同内核的结构体偏移完全相同。

对运维人员而言，理解这些限制是为了读懂加载错误和评估工具风险，而不是手写指令。遇到 verifier 报错时，把复杂程序拆成“只读取 PID”“只更新计数器”“最后读取参数”三个阶段，能快速定位是哪一步破坏了类型或边界。

另外，eBPF 栈空间有限，大型结构体和深层函数调用会在加载阶段被拒绝。事件结构尽量使用定长整数和短字符串，把格式化、JSON 编码和标签补全放在用户态。

### 从源代码到内核执行中间经历了什么

```text
高级语言 -> LLVM IR -> BPF ELF -> bpf() -> verifier -> JIT -> 挂载点
```

查看指令：

```bash
llvm-objdump -S program.bpf.o
bpftool prog dump xlated id <PROG_ID>
```

解释执行便于调试，JIT 执行通常更快。可以用系统级 perf 观察程序自身开销，确认采集器没有成为被观测系统的新瓶颈。

### 验证器如何阻止不安全的排障脚本

验证器检查无限循环、指令上限、内存边界和 helper 权限。加载失败说明程序没有满足内核安全边界，应修正逻辑或权限，而不是绕过验证。

验证器拒绝程序并不表示业务逻辑错误。不支持的 helper、未检查的用户指针和错误的程序类型都会导致加载失败。把 verifier 加载测试纳入 CI，可以在发布前发现问题。

生产排障还要关注 verifier 的资源上限。一个包含大量分支和循环的程序，即使逻辑正确，也可能因为状态空间过大而无法验证；应减少分支、限制循环上界，并将字符串解析移到用户态。

上线前建议保留一个最小安全版本。新功能加载失败时自动回退到只采集核心计数的版本，保证节点仍然有基本可观测性。

### 加载失败时如何阅读 verifier 日志

```bash
sudo bpftool prog load program.bpf.o /sys/fs/bpf/demo \
  type tracepoint -d
```

从第一处 `invalid`、`pointer` 或寄存器错误读起，后续错误往往是连锁结果。优先确认程序类型、上下文边界、helper 参数和目标内核版本。

| 日志关键词 | 检查项 |
| --- | --- |
| `permission denied` | capabilities、sysctl、LSM |
| `invalid mem access` | 指针类型和边界 |
| `unknown func` | helper 是否被支持 |
| `loop detected` | 循环上界 |

## 第 4 章 · 掌握程序加载和数据取回

### bpf 系统调用负责哪些运维动作

`bpf()` 负责加载程序、创建和更新 Map、查询对象、固定对象以及创建链接。理解对象生命周期可以解释为什么工具退出后 pinned 对象仍存在，或主机重启后对象消失。

BPF 对象的运维生命周期可以分为创建 Map、加载程序、挂载 link、固定对象和查询对象。`pin` 让 Agent 重启后可以重新打开已有 Map，也意味着卸载时必须显式清理。

| 动作 | 典型命令 | 失败方向 |
| --- | --- | --- |
| 创建 Map | `BPF_MAP_CREATE` | 类型和内存上限 |
| 加载程序 | `BPF_PROG_LOAD` | verifier、权限、helper |
| 挂载 | `BPF_PROG_ATTACH` | 接口、tracepoint、cgroup |
| 固定 | `BPF_OBJ_PIN` | bpffs 和路径权限 |
| 查询 | `BPF_OBJ_GET` | ID、路径、对象生命周期 |

生产升级采用并行加载、健康验证、原子切换、旧版本清理的顺序。直接覆盖 pinned 文件会让排障人员无法判断当前 link 属于哪个版本。

生产 Agent 常把对象 pin 到 bpffs，并按版本隔离目录：

```bash
sudo mount -t bpf bpf /sys/fs/bpf
sudo mkdir -p /sys/fs/bpf/ebpf-agent/v1
```

升级时先加载新对象、验证新 link，再切换用户态读取路径，避免新旧 Map schema 不一致。

### Map 怎样保存指标、状态和配置

| 类型 | 典型用途 |
| --- | --- |
| Array | 固定槽位配置、CPU 统计 |
| Hash | PID、IP、端口映射 |
| LRU Hash | 有界连接缓存 |
| Ring Buffer | 事件输出 |
| LPM Trie | CIDR 策略 |

```bash
sudo bpftool map show
sudo bpftool map dump id <MAP_ID>
```

高频计数通常使用 per-CPU Map 减少锁竞争；连接缓存使用 LRU 限制内存；程序跳转或 sockmap 用于数据面组合。Map 不是无限数据库，必须设置容量并观察占用。

Map 有内存上限，高基数 key 会持续占用内核内存。对连接和地址使用 LRU 或定期清理；输出 Prometheus 时不要把完整 URL、命令行或随机 ID 直接作为 label。

### Helper 函数能读取和修改哪些内核信息

Helper 是内核暴露的受控 API，例如读取 PID、获取时间、访问 Map、读取用户字符串和重定向网络包。可用 helper 取决于程序类型，应以目标内核文档为准。

`bpf_get_current_pid_tgid()` 用于关联线程，`bpf_ktime_get_ns()` 用于延迟测量，`bpf_perf_event_output()` 把事件送到用户态。这些 helper 是 verifier 按上下文授权的内核入口，不是普通函数库。

读取用户字符串要处理截断和失败返回；保存状态时使用 ID 和标量，不要保存可能失效的内核指针。helper 返回负数时应计入错误指标，不能静默丢弃。

可用 helper 的检查方法：

```bash
bpftool feature probe kernel | rg 'helper|ringbuf|bpf_loop'
```

不要仅依据编译机头文件判断生产节点能力，最终以目标内核的 feature probe 和实际加载结果为准。

### 如何把内核事件稳定输出到用户态

`bpf_trace_printk` 只适合开发验证。正式工具使用 Perf Buffer 或 Ring Buffer，由用户态批量读取；同时统计 buffer 满导致的丢失事件。

事件结构应紧凑，内核态只发送必要字段，容器名称和服务名在用户态关联。突发流量下必须暴露 lost events 指标，否则看似稳定的结果可能只是数据被丢弃。

用户态读取线程应设置 poll 超时、退出信号和 backpressure 策略。对于安全事件，宁可降低采样率也不要无限堆积内存；对于性能计数，则可以在内核侧聚合后定期读取。

典型的用户态循环需要处理三种结果：正常事件、buffer 丢失和链接错误。三者分别进入不同指标，方便判断是“没有事件”“事件被丢弃”还是“程序已经失效”。

### 用 libbpf CO-RE 跨内核版本部署工具

CO-RE 根据目标内核 BTF 重定位结构字段，减少每台主机重新编译的需要：

```bash
test -r /sys/kernel/btf/vmlinux && echo BTF-ready
bpftool btf dump file /sys/kernel/btf/vmlinux format c | head
```

CO-RE 仍受程序类型、helper 和 BTF 完整性限制，发布时需要兼容性矩阵和降级方案。建议在 CI 中用最低支持内核、当前生产内核和开发内核运行加载测试。

`vmlinux.h` 把运行内核的 BTF 类型导出为单一头文件，减少传统内核头文件的依赖。它解决的是类型描述和字段重定位问题，不会自动解决 helper 不存在、程序类型不支持等运行时差异。

生成链路是：内核编译时保留 BTF，从 `/sys/kernel/btf/vmlinux` 读取，使用 `bpftool` 生成 `vmlinux.h`，Clang 编译 BPF 对象，再由 libbpf 在加载时完成字段重定位。

```bash
bpftool btf dump file /sys/kernel/btf/vmlinux format c > vmlinux.h
clang -O2 -g -target bpf -c trace.bpf.c -o trace.bpf.o
```

## 第 5 章 · 根据故障现象选择观测点

### 跟踪内核函数时如何选择 kprobe 或 tracepoint

`kprobe` 可动态插入可探测内核函数，适合快速验证内部路径；`tracepoint` 由内核定义字段和语义，稳定性通常更好。返回值需要 `kretprobe`，但会增加上下文管理和开销。

选择原则是先稳定、后深入：先用 tracepoint 确认事件是否发生，再用 kprobe 补充内部函数和调用栈。kprobe 目标被内联、改名或删除时会加载失败，因此生产工具要检测目标存在并允许跳过可选探针。

如果需要函数耗时，入口和返回必须使用同一线程维度保存状态；如果只需要调用次数，入口 probe 就足够。对高频函数要先做采样，否则 probe 本身可能改变调度和缓存行为。

排查期间要保存探针的加载时间和卸载时间，便于将观测结果与故障窗口对齐。卸载后观察指标是否恢复基线，也是验证采集开销的重要实验。

### 排查应用时如何选择 uprobe、uretprobe 或 USDT

`uprobe` 观察用户态函数入口，`uretprobe` 观察返回和耗时。编译型程序依赖 ELF 符号；解释型语言更适合跟踪解释器入口或 USDT 探针。

应用排障还要考虑进程重启和二进制替换。滚动发布时重新挂载，不能把旧版本地址缓存到全局配置中。

应用探针应带上请求或线程关联 ID，但不要把高基数请求参数全部送入内核事件。通常只在内核侧记录 PID、TID 和时间，用户态再结合应用 trace 做关联。

对高并发服务，优先做比例采样或只记录慢于阈值的返回事件。例如只输出超过 10 ms 的调用，能把事件量从每秒数万条降到可分析的规模。

### CPU 和性能问题如何使用 perf event 采样

perf event 可按 CPU 周期、指令、缓存 miss 或软件事件采样。它用统计方法定位热点，适合评估 CPU 成本和调用栈，不等同于记录每次函数调用。

采样频率越高，定位精度越好，采集开销和 buffer 压力也越大。先低频建立热点轮廓，再针对目标 PID、线程或 cgroup 提高频率。

采样结果要记录事件类型、频率、CPU 范围和时间窗口。只看 `Overhead` 百分比而不看样本数，容易把少量随机样本误认为稳定热点。

采样应避开发布、扩容和缓存预热阶段，或在报告中单独标记这些阶段。对比两次实验时，CPU 亲和性、频率调节和虚拟机 steal time 也要保持一致。

### 网络故障中 XDP、TC、socket 和 cgroup 各看哪里

XDP 位于驱动收包早期，适合早期丢弃和快速转发；TC 位于网卡队列附近，适合策略、整形和重定向；socket/cgroup 程序更接近进程和容器身份。

XDP 程序可以执行 Drop、Receive Local 或 Forward。它位于完整 TCP/IP 协议栈之前，适合 DDoS 过滤和高速转发，却不一定能拿到应用层身份。排障时不要用 XDP 的包计数直接替代 socket 层请求计数。

网络程序返回值决定包的下一步动作，例如 `XDP_PASS`、`XDP_DROP`、`XDP_REDIRECT`。上线前明确每个返回值的故障后果，并保留切回 PASS 或传统路径的开关。

挂载点越靠前，性能潜力越大，诊断字段越少。排障优先选择能提供足够上下文的 TC、socket 或 tracepoint，优化数据面再逐步前移到 XDP。

对网络程序要额外监控 action 计数、redirect 失败、Map 查找失败和异常返回值。没有这些指标，数据面“运行正常”可能只是所有包都走了 fallback。

### 用故障类型反推最合适的挂载点

| 现象 | 首选观测点 |
| --- | --- |
| 短时进程漏采 | `sys_enter_execve` |
| 内核函数延迟 | kprobe + kretprobe |
| 应用函数耗时 | uprobe + uretprobe |
| 网络早期丢包 | XDP、驱动统计 |
| 协议栈丢包 | `kfree_skb` |
| 容器异常执行 | LSM、cgroup、exec |

### eBPF Hook 点和运维场景速查

选择 Hook 时要同时考虑挂载位置、上下文内容、稳定性、执行开销和返回值语义：

| Hook / 类型 | 挂载位置 / 观察对象 | 主要特点 | 常见运维场景 |
| --- | --- | --- | --- |
| `tracepoint` | 内核预定义事件 | 字段和语义相对稳定 | syscall、调度、网络、块设备 I/O |
| `raw_tracepoint` | tracepoint 原始参数 | 更轻量、更底层 | 高频 tracing、低开销统计 |
| `kprobe` / `kretprobe` | 内核函数入口和返回 | 灵活但依赖内核实现 | 函数参数、返回值、疑难内核问题 |
| `fentry` / `fexit` | 内核函数入口和出口 | 基于 BPF trampoline，通常更低开销，依赖 BTF | 函数 tracing、耗时分析 |
| `uprobe` / `uretprobe` | 用户态程序或动态库函数 | 依赖符号和二进制版本 | libc、OpenSSL、应用函数 |
| `XDP` | 网卡驱动收包早期 | 网络栈前处理，性能极高 | DDoS、过滤、负载均衡、防火墙 |
| `TC` ingress / egress | Traffic Control | 可见完整 `skb`，可修改和重定向 | 容器流量、策略、QoS、NAT |
| `Socket` | Linux Socket 层 | 接近应用 TCP/UDP 连接 | 连接分析、socket 统计 |
| `Cgroup` | cgroup 和进程组边界 | 天然关联容器和进程 | `connect`、`bind`、容器网络策略 |
| `LSM` | Linux 安全决策点 | 可审计或阻断访问 | 文件、权限、运行时安全 |
| `perf_event` | CPU PMU 和性能事件 | 采样硬件或软件计数 | hotspot、cycles、cache miss |

几个边界尤其容易混淆：`tracepoint` 通常比猜测函数参数的 kprobe 稳定；`fentry/fexit` 需要 BTF 和较新的内核；XDP 虽然最早、最快，但应用身份和完整 `skb` 信息较少；`perf_event` 是统计采样，不是逐次调用追踪。

现场选择建议遵循“稳定性优先、距离现象最近、最后追求更早更快”：先用 tracepoint 或 socket 确认事实，再用 kprobe/fentry 深入内核路径，网络性能优化时才把处理前移到 TC 或 XDP。

## 第 6 章 · 内核故障排查实战

### 在主机上查找可用的内核跟踪点

```bash
sudo cat /sys/kernel/debug/tracing/events/syscalls/sys_enter_execve/format
sudo perf list
sudo bpftrace -l 'tracepoint:syscalls:*'
```

`/proc/kallsyms` 能提供符号列表，但内核函数是不稳定接口。优先使用 tracepoint，必须使用 kprobe 时记录函数名、内核版本和回滚方式。

### 用 bpftrace 确认函数参数和返回值

```bash
sudo bpftrace -lv tracepoint:syscalls:sys_enter_execve
sudo bpftrace -lv tracepoint:syscalls:sys_exit_execve
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_execve { printf("%d %s\\n", pid, str(args->filename)); }'
```

### 用 tracepoint 找出 top 看不到的短时进程

```bash
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_execve { printf("%d %s\\n", pid, str(args->filename)); }'
```

`top` 按间隔采样，短时进程可能在两次采样之间结束；事件触发可以完整记录创建过程。生产脚本应按 PID、comm、cgroup 或路径过滤。

排查时可以先不加过滤观察一分钟，确认事件量级后再限制目标：

```bash
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_execve { @[comm] = count(); }'
```

如果事件量很大，说明问题可能是部署脚本、健康检查或崩溃重启循环；如果只关心某个服务，则用 cgroup 或父进程关系进一步筛选。

### 用过滤、聚合和调用栈缩小故障范围

```bash
sudo bpftrace -e 'kprobe:vfs_read /comm == "nginx"/ { @[ustack] = count(); }'
sudo bpftrace -e 'kprobe:kfree_skb /comm == "curl"/ { print(kstack); }'
```

先过滤目标，再聚合计数，最后输出调用栈，是控制开销和提高可读性的基本顺序。

聚合结果适合回答“哪个路径最多”，调用栈适合回答“为什么发生”。二者要结合采样窗口和事件总数解读，不能把一次偶然调用栈当作稳定根因。

### 什么时候把临时脚本做成 BCC 或 libbpf 工具

一次性验证使用 bpftrace；需要参数解析、配置和多种输出时使用 BCC；需要跨主机分发、长期运行和低依赖时选择 libbpf。工具化时补充版本检测、权限提示、信号处理和自监控指标。

从脚本到工具的判断标准是重复性和风险，而不是代码量。脚本适合现场验证，团队工具要有稳定 CLI、过滤和 JSON 输出，平台组件还要有升级、租户隔离和审计。

### 内核符号变化时如何避免误判和误操作

记录 `uname -r`、BTF、程序版本和挂载点。加载前验证目标对象存在，加载后用 `bpftool` 确认 link，卸载时只删除本工具创建的 pinned 对象。

内核升级前在预发布节点执行探针回放，把缺失函数、字段变化和 verifier 差异记录到兼容矩阵。发生变化时优先切换到稳定 tracepoint，而不是强行恢复旧 kprobe。

## 第 7 章 · 应用性能与运行时排查

### 为编译型应用准备符号和 uprobe

```bash
readelf -Ws /path/to/app | less
nm -D /path/to/lib.so
```

uprobe 依赖目标二进制版本。容器升级后应通过 `/proc/<pid>/exe` 和实际 rootfs 定位文件，而不是假定宿主机路径。

挂载前先验证符号和进程：

```bash
PID=$(pgrep -n my-service)
readlink /proc/$PID/exe
readelf -Ws /proc/$PID/exe | rg 'target_function'
```

若程序被 strip、函数被内联或运行在 JIT 中，uprobe 可能没有可用符号，应改用 USDT、解释器入口或应用自身的 profiling 接口。

### Go、Java、Python 应用分别能观测到什么

Go 可跟踪部分符号，但内联和优化会改变函数边界；Java 方法由 JIT 生成，需要 perf map 或运行时探针；Python 应优先观察解释器函数、USDT 或现成运行时工具。报告中要标明观测的是应用、解释器还是 native 层。

同一个“接口变慢”现象可能来自不同层：Go 可能在 GC 或 syscall 等待，Java 可能在 safepoint 或 JIT 编译，Python 可能在解释器锁或 native 扩展。eBPF 结果必须和应用指标、运行时日志以及请求 trace 对齐。

应用层证据要和内核层证据使用同一时间基准。建议同时记录请求 ID、线程 ID 和单调时间戳，再用 trace 或日志平台完成跨层关联。

### 用 uprobe 和 uretprobe 定位函数慢在哪里

入口记录开始时间，返回事件按线程 ID 查找并计算耗时：

```text
uprobe:   start[tid] = nsecs
uretprobe: latency = nsecs - start[tid]
```

不能只按 PID 保存状态，因为一个进程可能有多个并发线程。递归、异常返回和线程退出都需要清理 Map。

耗时统计还要处理丢失返回事件、函数递归和跨 CPU 迁移。对高频函数建议使用直方图而不是保存每次原始耗时：

```text
latency_us < 10       -> bucket 0
10 <= latency_us < 100 -> bucket 1
latency_us >= 100     -> bucket 2
```

### 用 USDT 观察解释器和运行时关键事件

USDT 是应用或运行时主动提供的稳定探针，通常比猜测内部函数名更适合生产观测：

```bash
sudo bpftrace -l 'usdt:/usr/bin/python3:*'
```

USDT 参数描述通常比普通 uprobe 更明确，但探针名称和参数仍可能随版本变化。升级运行时后必须重新执行 `bpftrace -l`，并在 CI 或节点启动检查中验证探针存在。

### 应用调用栈和参数采集的常见陷阱

常见问题包括调试符号缺失、帧指针省略、JIT 地址无法解析、用户指针读取失败和参数结构变化。报告应保存 Build ID、镜像摘要、内核版本和采样命令。

当调用栈出现大量 `[unknown]` 时，先检查采样时使用的二进制是否仍在磁盘上，再检查动态库搜索路径和容器 rootfs。不要仅凭未知地址判断“应用没有执行该函数”。

如果无法补齐符号，仍可使用 syscall、调度、网络和内核 tracepoint 形成间接证据，并在报告中明确“函数级结论不可用”的限制。

## 第 8 章 · 网络问题定位与丢包排查

### 沿 Linux 网络协议栈确定观测位置

```mermaid
flowchart LR
    App[应用] --> Sock[Socket]
    Sock --> TCP[TCP UDP]
    TCP --> IP[IP 路由]
    IP --> TC[TC]
    TC --> Driver[网卡驱动]
    Driver --> XDP[XDP]
```

发送路径从应用到网卡，接收路径反向经过驱动、XDP、协议栈和 socket。不同位置看到的包集合不同，不能用一个抓包点解释全链路。

### 从 SKB 生命周期回溯丢包路径

SKB 是 Linux 网络栈描述数据包的核心结构。`consume_skb` 多表示正常释放，`kfree_skb` 常在异常或丢弃路径出现。跟踪释放函数并回溯调用栈，可以找到过滤器、路由、协议错误或资源不足所在的路径。

丢包排查必须区分“真正丢弃”和“引用计数归零”。同一个 SKB 可能在多个路径释放，`kfree_skb` 本身不是完整错误码。应结合调用栈、协议统计、网卡 drop 计数和应用重传数据共同判断。

排查步骤是先确认丢包发生在哪一跳，再判断是策略丢弃、校验失败、队列溢出还是对端关闭。把所有释放事件直接标记为“网络丢包”会产生大量误报。

### 用 kfree_skb 和调用栈定位丢包原因

```bash
sudo bpftrace -e 'kprobe:kfree_skb /comm == "curl"/ { printf("drop\\n"); print(kstack); }'
```

验证时同时生成可控流量、记录网卡统计和 tcpdump，再对照 eBPF 调用栈。如果只看到 `kfree_skb` 而没有业务请求，应检查过滤条件和进程上下文。

建议固定五元组和请求频率，先建立正常调用栈，再注入 MTU、连接跟踪、队列溢出等故障。这样可以比较正常释放与异常释放的调用路径，而不是只保存一张无法复现的截图。

### 网络过滤、捕获和重定向该选哪类程序

| 目标 | 推荐程序 |
| --- | --- |
| 尽早丢弃恶意包 | XDP |
| 队列策略和整形 | TC |
| 按进程控制 | cgroup/socket |
| 协议栈路径 | kprobe/tracepoint |
| 请求层观测 | uprobe/USDT |

### 把 tcpdump 结果和 eBPF 观测交叉验证

先确定每个工具的观测位置和时间窗口，再比较五元组、包数和错误码。XDP 已丢弃的包不会出现在高层 socket 抓包点；联合验证可以区分线路、驱动、协议栈和应用问题。

一个实用的证据表如下：

| 层 | 证据 | 结论 |
| --- | --- | --- |
| 网卡 | `ethtool -S` drop/error | 驱动或硬件方向 |
| XDP/TC | action 计数 | 早期策略方向 |
| 协议栈 | `kfree_skb` 调用栈 | 内核路径方向 |
| Socket | `ss -s`、连接状态 | 队列或连接资源 |
| 应用 | 超时、重试、trace | 业务感知结果 |

## 第 9 章 · 容器安全事件发现与阻断

### 容器进程的 namespace 和 cgroup 观测边界

容器是进程隔离与资源控制的组合。eBPF 在主机内核观察到宿主机 PID、mount namespace、network namespace 和 cgroup；工具需要把这些标识映射回容器、Pod 和工作负载。

同一个 PID 在容器内外可能不同，采集器应使用 host PID、cgroup ID 和 mount namespace 做关联。Kubernetes 场景还要补充 Pod UID、容器 ID、节点名和镜像摘要，否则安全事件只能定位到一串难以操作的数字。

身份关联失败时，安全事件仍可保留原始内核字段，但不能直接下发阻断动作。应先补齐容器元数据，再执行高风险策略。

### 发现容器中的异常执行和文件访问

跟踪 `execve`、文件打开、权限变化和网络连接，建立容器、进程、文件、命令行、时间事件。重点是检测偏离基线的行为，例如镜像中没有的 shell、敏感路径访问和异常外连。

检测规则应区分开发和生产工作负载。调试容器可能允许 shell，数据库容器却不应访问 `/etc/shadow`；规则要支持 namespace、cgroup、镜像签名和服务账号等上下文，避免单纯按命令名告警造成噪声。

事件字段要避免直接包含完整命令行和秘密参数，可以在采集端脱敏，在检测端使用哈希或白名单比对。

### 用 LSM、seccomp 和 cgroup 程序实施安全策略

LSM 适合在安全检查点实施访问控制；seccomp 限制系统调用集合；cgroup 程序按工作负载控制网络或进程行为。阻断策略上线前必须提供审计模式、白名单和回滚开关。

Kubernetes API 下发 SecurityPolicy 后，KubeArmor 将策略转换为内核侧的 LSM/eBPF 检查，并把事件带上容器身份写入日志。运维上要同时监控策略同步延迟、规则命中数和阻断失败数。策略执行链路是“API 对象 -> 节点 Agent -> LSM/eBPF hook -> 系统资源 -> 审计事件”。

阻断的优先级应低于证据完整性。先记录事件并验证误报率，再对高置信规则启用阻断；对生产核心服务设置超时和自动回退，避免安全策略本身造成大面积不可用。

审计模式运行期间要统计命中量、误报原因和业务影响。只有规则在多个版本、节点和异常场景中稳定后，才逐步扩大阻断范围。

### 从安全事件采集到告警和阻断

```mermaid
flowchart LR
    Event[内核安全事件] --> Collect[eBPF 采集]
    Collect --> Enrich[容器身份关联]
    Enrich --> Detect[规则检测]
    Detect --> Alert[告警]
    Detect --> Block[阻断隔离]
```

### Falco、Cilium 等现成工具如何落地安全能力

Falco 偏运行时检测和规则告警，Cilium 将 eBPF 用于网络策略、可观测性和服务通信。生产环境先评估兼容矩阵、事件丢失指标和升级策略，再决定是否自定义程序。

选型时重点查看规则覆盖范围、升级时的 link 管理、事件导出协议以及对 Kubernetes 身份的关联能力。自定义规则要纳入代码审查和回放测试。

Cilium 的数据面在 XDP、TC、socket 和 L7 proxy 之间组合多类 eBPF 程序。它说明“使用 eBPF”并不等于只挂一个 probe，而是由控制面写入 Map、多个挂载点共同完成策略和转发。

一条进入 Pod 的流量可能先经过物理网卡 XDP，再经过宿主机 TC、veth/Pod 侧 TC 或 socket hook，必要时进入用户态 L7 proxy。排查连接失败时，应先确认包在哪一层消失，再读取对应 Map 和 action 计数。

| 层次 | 常见职责 | 典型证据 |
| --- | --- | --- |
| XDP | 早期过滤、重定向 | action 计数 |
| TC | 路由、隧道、策略 | BPF link、TC 规则 |
| Socket | 服务发现、连接重定向 | sockmap、连接统计 |
| L7 proxy | HTTP/gRPC 策略 | proxy access log |

选型时重点查看规则覆盖范围、内核版本支持、升级时的 link 管理、事件导出协议以及对 Kubernetes 身份的关联能力。自定义规则要纳入代码审查和回放测试，避免只在真实攻击发生时验证。

## 第 10 章 · 用 eBPF 优化网络性能

### 用容器搭建 Nginx 负载均衡基线

```bash
docker run -itd --name=http1 --hostname=http1 feisky/webserver
docker run -itd --name=http2 --hostname=http2 feisky/webserver
docker run -itd --name=client alpine
docker run -itd --name=nginx nginx
```

先确认 Nginx 能轮询两个后端，再做性能对比，避免把配置错误误判为 eBPF 性能问题。

基线还应记录 Nginx worker 数、容器 CPU 限额、网卡队列、连接跟踪和内核版本。性能实验中一次只改变一个变量，并保存 `docker inspect`、配置文件和压测命令。

### 用 wrk 建立吞吐量和延迟基线

```bash
docker exec -it client sh
apk add curl wrk --update
wrk -c100 http://<nginx-ip>
```

记录并发连接数、持续时间、Requests/sec、平均延迟、P99 和错误数；优化前后保持相同请求、CPU 配额和网络拓扑。

除了应用层指标，还要同步采集节点侧的软中断、上下文切换、CPU cycles、网卡丢包和队列长度。吞吐提升但 CPU 消耗翻倍，或者平均延迟下降但 P99 上升，都不能视为无条件收益。

### 把转发逻辑前移到 XDP 和 TC

XDP 在驱动层快速判断和重定向，TC 适合协议栈附近的策略、隧道和负载均衡。路径越早，绕过的内核工作越多，但可获得的协议和应用信息越少。

XDP native、generic 和 offload 模式的性能与能力不同。网卡不支持 offload 时，程序仍可在驱动或 generic 模式运行，但应重新测量吞吐和 CPU 成本，不能直接套用硬件卸载结果。

### 用 Map 管理后端、连接和健康状态

后端 IP、端口、权重和连接状态放入 Map，由用户态控制器更新。数据面只做快速查表和转发，Map 更新要考虑原子替换、版本号和旧连接排空。

控制面与数据面要解耦：控制器负责服务发现、健康检查和配置版本，数据面只读取当前快照。更新失败时保留上一版本，健康检查连续失败时摘除后端，恢复后再逐步加权。

### 如何验证内核数据面的性能收益

性能收益要用对照实验验证：吞吐、尾延迟、每包 CPU cycles、软中断、丢包率和连接建立速率都要采集。只看 Requests/sec 容易忽略 CPU 饱和和尾延迟恶化。

建议至少做三组实验：传统 Nginx、eBPF 数据面、故障回退路径。每组重复多轮并报告中位数和高分位数，排除首次编译、连接预热和容器启动造成的偏差。

### 上线前必须补齐的观测、切换和回滚能力

生产方案要有健康检查、后端摘除、灰度比例、数据面回退、Map 版本管理和链路指标，并保留传统路径作为 fallback：

```bash
sudo bpftool link show
sudo bpftool link detach id <LINK_ID>
```

回滚演练要验证三件事：卸载后新连接能否进入传统路径，已有连接是否正常排空，控制器重启后是否会重新加载旧版本。没有演练过的回滚命令不能算生产能力。

## 第 11 章 · eBPF 生产运维方法论

### 从故障现象到挂载点的排障决策树

```mermaid
flowchart TD
    A[故障现象] --> B{CPU 调度问题}
    B -->|是| C[perf 或内核跟踪]
    A --> D{应用延迟}
    D -->|是| E[uprobe USDT]
    A --> F{网络丢包}
    F -->|是| G[XDP TC kfree_skb]
    A --> H{容器异常}
    H -->|是| I[LSM Cgroup Exec]
```

### 临时排障、团队工具和平台产品如何取舍

一次性验证使用 bpftrace；重复问题沉淀为带参数、过滤和输出格式的工具；跨集群长期运行的需求再纳入平台，统一权限、成本和数据保留治理。

工具进入平台前应有明确的 SLO：加载成功率、事件丢失率、CPU 和内存上限、数据延迟以及故障时的自动卸载时间。平台只负责通用生命周期，业务规则仍应保持可审查和可版本化。

还要定义使用边界：哪些探针允许线上启用，哪些只能在维护窗口运行，哪些字段禁止采集。权限审批和审计日志应覆盖加载、参数变更和卸载操作。

### 权限、内核版本和调试符号兼容性检查

上线前检查内核版本、BTF、helper、程序类型、`CAP_BPF`/`CAP_PERFMON`、debugfs 和目标二进制符号。兼容性矩阵应作为发布物的一部分。

检查结果应落成机器可读的 preflight 输出，部署系统据此决定通过、降级或跳过，而不是把加载失败写成普通业务日志。跳过某个可选探针时，要在指标中明确暴露原因。

兼容检查还应包含 CPU 架构、网卡驱动、虚拟化环境和容器运行时。相同内核版本在不同发行版配置下，也可能拥有不同的 BPF 能力。

### 控制采样开销并判断数据是否可信

高频事件优先过滤、采样和聚合；避免 `bpf_trace_printk`；记录 Ring Buffer 或 Perf Buffer 丢失数；报告中写明窗口、事件数和过滤条件。

可靠性判断至少包括：事件是否覆盖故障窗口、过滤条件是否排除了目标、时间戳是否使用单调时钟、符号是否匹配以及 buffer 是否发生丢失。采样结果必须带上这些元数据，才能支持复盘。

当数据不足以支持结论时，应明确标记为“线索”而不是“根因”。eBPF 观测应和指标、日志、trace、配置变更及节点事件组成证据链。

### 从实验脚本走向可维护的生产工具

生产工具至少应有内核和权限检查、启动与卸载流程、结构化输出、采样开关、丢失指标、版本化 Map schema、超时和信号处理、灰度与回滚文档。eBPF 的价值是快速取得可验证证据，同时不扩大原有故障。

最终交付物不只是一个 `.bpf.o` 文件，还应包括运行手册、兼容性矩阵、最小权限清单、指标说明、故障演练记录和数据保留策略。这样其他运维同学才能在没有原作者陪同的情况下安全使用。

建议为每个工具提供三个命令：`check` 做环境预检，`run` 启动观测，`stop` 清理 link 和 pinned 对象。文档同时给出正常输出、失败输出和最小回滚步骤，降低现场操作风险。

## 第 12 章 · 常见故障现场 Runbook

### CPU 飙高时如何用 eBPF 建立证据链

先用 `uptime`、`mpstat` 和 `pidstat` 判断是用户态、内核态、软中断还是调度竞争，再用 eBPF 观察高频函数或短时任务。不要一上来对所有 syscall 打印完整参数。

```bash
uptime
mpstat -P ALL 1
pidstat -u -w 1
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_execve { @[comm] = count(); }'
```

如果 `us` 高且某个进程占满 CPU，使用 perf event 或 uprobe 定位函数；如果 `sy` 和软中断高，优先检查网络、调度和上下文切换；如果短时进程数量异常，回到 `execve` 事件分析启动循环。

### top 看不到进程时如何追踪启动和退出

```bash
sudo bpftrace -e '
tracepoint:syscalls:sys_enter_execve
{
  printf("pid=%d ppid=%d comm=%s file=%s\\n", pid, ppid, comm, str(args->filename));
}'
```

先按命令名聚合，确认是否存在重启风暴；再把 PID、父 PID、cgroup 和命令行写入事件。对启动脚本、健康检查和 supervisor 管理的进程，应沿父子关系回溯真正的触发者。

### 应用延迟升高时如何组合 uprobe 和 trace

先从请求 trace 确认慢的是应用函数、系统调用还是下游网络，再选择 uprobe、uretprobe 或内核 tracepoint。入口保存 TID 级时间戳，返回时输出超过阈值的事件。

```text
if duration_us > 10000:
    emit(pid, tid, function, duration_us)
```

同时记录 GC、锁等待、调度延迟和网络 RTT，避免把应用线程被阻塞的时间误认为函数自身计算时间。符号解析失败时，报告应明确降级到运行时或 syscall 级结论。

### 网络丢包时如何从网卡追到应用

按网卡、XDP/TC、协议栈、socket、应用五层采证：

```bash
ethtool -S eth0
ip -s link show dev eth0
ss -s
sudo bpftrace -e 'kprobe:kfree_skb { @[kstack] = count(); }'
sudo tcpdump -ni eth0 host <CLIENT_IP>
```

每层都要记录时间窗口和五元组。只有协议栈丢弃、网卡错误、socket 队列和应用超时能够相互对齐时，才可以下结论。

### 容器出现异常行为时如何先审计再阻断

第一阶段只采集 exec、文件访问和网络连接，补齐容器身份并统计误报；第二阶段对高置信规则做告警；第三阶段才启用 LSM、cgroup 或网络阻断。每一步都保留旧策略和自动回退。

```text
事件 -> 身份关联 -> 规则命中 -> 审计 -> 人工确认 -> 灰度阻断
```

阻断动作要带原因、策略版本和过期时间，避免临时排障规则永久留在节点上。

### eBPF 数据面异常时如何快速回滚

回滚顺序是停止控制器更新、切回传统转发、卸载 eBPF link、保留 Map 快照、验证新连接和已有连接，最后再清理旧对象。

```bash
sudo bpftool link show
sudo bpftool map show
sudo bpftool link detach id <LINK_ID>
curl -fsS http://<SERVICE>/healthz
```

回滚记录要包含开始时间、影响范围、失败原因和恢复验证结果。只有经过演练的回滚流程，才适合在高峰期执行。

## 第 13 章 · 运维速查表与证据标准

### 用一张表判断应该观察哪一层

| 现象 | 先看什么 | 再看什么 | 避免的误判 |
| --- | --- | --- | --- |
| CPU 使用率高 | `mpstat`、`pidstat` | perf、run queue、软中断 | 把 idle 或 iowait 当计算热点 |
| 进程频繁重启 | exec 事件 | 父进程、退出码、cgroup | 只看当前存活进程 |
| 应用接口慢 | trace、uprobe | syscall、调度、网络 | 把线程阻塞时间算成函数耗时 |
| 连接失败 | socket、TC | XDP、路由、kfree_skb | 只看一个抓包点 |
| 容器越权 | exec、LSM | 文件、网络、身份 | 未关联容器身份就阻断 |

这张表体现一个重要原则：先用最接近现象的稳定观测点建立事实，再向更底层或更细粒度的 probe 深挖。底层并不自动意味着证据更好。

### 解释 BPF 程序类型时要同时说明入口和返回值

只写“使用 XDP”是不完整的。需要同时说明程序挂载到哪个接口、触发方向、返回值含义以及失败时的 fallback：

| 程序 | 入口 | 返回/动作 | 典型 fallback |
| --- | --- | --- | --- |
| XDP | 网卡驱动收包 | PASS、DROP、REDIRECT | PASS 到协议栈 |
| TC ingress | 网卡或 veth 入方向 | allow、drop、redirect | 继续协议栈 |
| cgroup skb | cgroup 网络路径 | 接受或拒绝 | 内核默认策略 |
| sockops | TCP socket 状态变化 | 更新 Map、重定向 | 普通 socket 路径 |
| LSM | 安全检查点 | allow、deny、audit | 现有 LSM 策略 |

写 Runbook 时把这些信息列出来，现场人员才能判断“卸载程序后流量会去哪里”。

### Map 和用户态输出如何避免把观测系统做成瓶颈

Map 负责状态，Ring Buffer/Perf Buffer 负责事件，用户态负责格式化和外部发送。三者职责不能混用：

```text
高频计数 -> per-CPU Map -> 周期读取 -> 指标
低频异常 -> Ring Buffer -> 用户态 enrich -> 日志或告警
调用栈   -> stackid Map -> 符号解析 -> 排障报告
```

如果把每个包、每次 syscall 都作为完整 JSON 写出，CPU、内存和网络开销会迅速上升。优先在内核侧聚合，再按需抽样原始事件。

### 生产排障报告应该包含哪些上下文

一份可复核的报告至少包含：

1. 故障开始和结束时间，以及时间基准。
2. 节点名、内核版本、CPU 架构和容器运行时。
3. BPF 程序类型、挂载点、Map schema 和工具版本。
4. 过滤条件、采样频率、事件总数和丢失数。
5. 目标二进制 Build ID、调试符号和镜像摘要。
6. 正常基线、异常样本、结论和未验证假设。
7. 卸载命令、回滚结果和后续改进项。

这些元数据决定了其他人能否复现结果，也决定了升级内核或应用后还能否使用旧报告。

### 把图片中的架构关系转成可执行检查

架构图的价值不在于记住方框，而在于把每条箭头转换成检查动作：用户态到 verifier 对应加载日志，程序到 Map 对应 Map 计数，XDP 到 TC 对应 action 统计，控制面到安全 hook 对应策略版本，控制器到数据面对应健康检查和回滚。

```bash
uname -r
bpftool feature probe kernel
bpftool prog show
bpftool link show
bpftool map show
tc filter show dev eth0 ingress
```

当这些命令的结果能够按时间顺序串起来时，架构理解才真正转化成运维能力。

## 第 14 章 · P0 深入：从加载失败到可复用工具

### 用运行时五个模块解释一次故障

当工具没有结果时，应按运行时模块逐层排查：

| 模块 | 需要确认的事实 | 常见故障 |
| --- | --- | --- |
| 指令与寄存器 | ELF 中有 BPF section，寄存器访问合法 | 编译 target 错误、栈超限 |
| Verifier | 程序通过安全检查 | 指针越界、循环无法证明终止 |
| Interpreter/JIT | 程序被实际执行 | 架构或内核能力差异 |
| Helper | 当前程序类型允许调用 | `unknown func` |
| Map/Buffer | 状态和事件能被用户态读到 | key 错误、buffer 丢失 |

```bash
llvm-readelf -S program.bpf.o
sudo bpftool prog show
sudo bpftool prog dump xlated id <PROG_ID>
sudo bpftool map show
```

这套顺序能把问题定位到编译、加载、执行、通信或展示阶段。

### 阅读 BPF 指令和 verifier 状态

`r1` 通常保存程序上下文，`r0` 保存返回值，`r10` 是只读栈指针。`ldx` 从指针读取，`stx` 向栈或 Map 写入，`call` 调用 helper，`exit` 结束程序。看到 `R0 !read_ok`，通常表示某条路径没有给返回寄存器赋值。

```text
r1 = ctx
r2 = map_key
call bpf_map_lookup_elem
if r0 == 0 goto exit
read r0->field
exit
```

Verifier 会为每条分支保存寄存器状态。先判断 Map lookup 是否为空，再访问字段，验证器才能证明安全；把边界检查写在读取位置附近，也能减少状态空间。

### 用 bpf 系统调用还原用户态动作

需要确认工具实际动作时，可以使用：

```bash
sudo strace -f -e bpf,perf_event_open,ioctl \
  bpftrace -e 'tracepoint:syscalls:sys_enter_execve { @[comm] = count(); }'
```

典型顺序是创建 Map、加载程序、打开 perf event、使用 `PERF_EVENT_IOC_SET_BPF` 绑定，再从 buffer 读取结果。加载成功但没有输出时，重点检查事件绑定和用户态读取。

### 用 BCC 和 libbpf 重写同一个 execve 工具

三种实现都可以采用“内核读取事件、Map/Buffer 传递、用户态格式化”的模型：

| 实现 | 运行时编译 | 依赖 | 长期运行能力 |
| --- | --- | --- | --- |
| bpftrace | 通常需要 | bpftrace、LLVM | 低 |
| BCC | 通常需要 | Python/C++、LLVM | 中 |
| libbpf | 预编译 ELF | libbpf、BTF | 高 |

从 BCC 迁移到 libbpf 时，不能只翻译语法，还要重做对象生命周期、Ring Buffer、退出信号、兼容性检查和指标导出。

### 从内核源码交叉引用到可用探针

选择 kprobe 前先找到函数声明、真正定义和调用点，确认目标场景确实会经过该函数：

```bash
rg -n 'kfree_skb\\s*\\(' /usr/src/linux
sudo bpftrace -l '*kfree_skb*'
```

函数存在不代表一定命中。内联、架构差异、错误路径未触发都可能造成零样本。最终要用可控请求验证命中次数，并保存内核版本和源码提交信息。

## 第 15 章 · P1 深入：网络数据面与容器安全

### XDP 的执行模式和运维取舍

XDP 有 generic、native/driver 和 offload 三种常见模式。generic 兼容性好但路径更晚；native 依赖网卡驱动，性能通常更好；offload 把程序交给网卡硬件，能力和调试方式受硬件限制。

| 模式 | 优点 | 风险 |
| --- | --- | --- |
| Generic | 几乎不依赖驱动 | 性能收益有限 |
| Native | 高性能、可重定向 | 驱动兼容性 |
| Offload | CPU 开销最低 | 硬件能力和可观测性受限 |

上线时先以 PASS 模式验证统计，再逐步启用 DROP 或 REDIRECT。必须监控 action 计数和 redirect 失败，保留卸载或回退开关。

### TC、HTB 与 direct-action 的区别

TC 位于网卡队列和协议栈之间，既能做 ingress/egress 策略，也能配合 qdisc 进行流量整形。HTB 用层级令牌桶把带宽拆成父子 class；direct-action 则让 BPF 程序直接返回动作，不再依赖传统 classifier 链。

排障时分别查看 BPF filter、qdisc 统计和网卡队列，不能只看某一个计数器：

```bash
tc qdisc show dev eth0
tc filter show dev eth0 ingress
tc -s filter show dev eth0 egress
```

### 程序类型的运维全景

常见程序类型可按运维任务分组：

| 分组 | 类型 | 典型场景 |
| --- | --- | --- |
| 跟踪 | KPROBE、TRACEPOINT、PERF_EVENT | 函数、事件、采样 |
| 用户态 | UPROBE、USDT | 应用和运行时 |
| 网络 | XDP、SCHED_CLS、SK_SKB、SOCK_OPS、SK_LOOKUP | 过滤、转发、连接 |
| 容器 | CGROUP_SKB、CGROUP_SOCK、CGROUP_DEVICE、CGROUP_SYSCTL | 工作负载策略 |
| 安全 | LSM | 访问控制和审计 |
| 扩展 | STRUCT_OPS、FLOW_DISSECTOR、LWT | 内核行为和协议处理 |

程序类型决定上下文、可用 helper、返回值和挂载方式。写工具说明时必须同时记录这四项。

### 容器身份关联和安全证据

安全事件至少要关联 host PID、容器 PID、cgroup ID、mount namespace、network namespace、Pod UID、容器 ID 和镜像摘要。只有命令名而没有身份上下文的事件，不足以触发阻断。

```bash
lsns -p <HOST_PID>
cat /proc/<HOST_PID>/status | rg 'NSpid|CapEff|CapBnd'
docker inspect <CONTAINER>
```

策略链路是 API 对象、节点 Agent、LSM/cgroup hook、资源访问和审计事件。排查时要比较策略版本和节点实际加载版本，防止控制面已更新而数据面仍执行旧策略。

### Cilium 多层数据面的排障方法

一条进入 Pod 的流量可能经过物理网卡 XDP、宿主机 TC、veth/Pod 侧 TC、socket hook 和 L7 proxy。每一层关注的信息不同：XDP 关注 action，TC 关注路由和策略，socket 关注连接重定向，L7 关注 HTTP/gRPC 语义。

```text
物理 NIC -> XDP -> host TC -> veth TC -> socket -> L7 proxy -> Pod
```

连接失败时从最接近故障现象的层开始，逐层比较包数、Map 状态、策略版本和应用日志，避免把 XDP 的包计数直接当成应用请求计数。

## 第 16 章 · P1 深入：应用符号与负载均衡实战

### 用户态符号、DWARF 和 Build ID

uprobe 能否命中取决于目标 ELF、符号和进程实际加载的文件。`-g` 保留 DWARF 调试信息，strip 会移除符号，Build ID 则用于确认采样数据和二进制是否匹配。

```bash
readelf -n /proc/<PID>/exe | rg 'Build ID'
readelf -Ws /proc/<PID>/exe | rg 'target_function'
```

容器场景应使用 `/proc/<PID>/root` 作为符号根目录。出现 `[unknown]` 时，先确认版本、动态库和 JIT 映射，再判断是否真的没有执行目标函数。

### Go、Java 和 Python 的运行时差异

Go 的内联和编译优化可能改变函数边界；Java 方法由 JIT 运行时生成，常需要 perf map 或运行时工具；Python 代码经过解释器执行，通常跟踪解释器函数或 USDT 更稳定。

| 运行时 | 优先观测 | 主要限制 |
| --- | --- | --- |
| Go | ELF 符号、syscall、runtime | 内联、goroutine 调度 |
| Java | USDT、JIT map、async profiler | JIT 地址变化 |
| Python | 解释器 probe、USDT | 函数级语义有限 |

应用慢请求分析不能只依赖函数耗时，还要结合 GC、锁等待、调度延迟、系统调用和网络 RTT。

### Map 和 Helper 的生产选型原则

计数器、事件和配置应使用不同的数据结构：per-CPU Map 适合高频计数，Ring Buffer 适合低频结构化事件，LPM Trie 适合 CIDR 策略，sockmap 适合 socket 重定向，stack trace Map 适合调用栈去重。

Helper 也按职责分组：身份获取、时间测量、内存读取、Map 操作、事件输出和网络重定向。每次选 helper 都要核对当前程序类型和最低支持内核版本。

### Nginx 与 eBPF 负载均衡的数据面差异

Nginx 作为用户态代理，需要接收请求、解析协议、建立后端连接并复制数据；eBPF 数据面可以在 socket、TC 或 XDP 层提前完成查表和重定向，减少上下文切换和用户态复制。

但 eBPF 数据面不天然理解 HTTP 请求。长连接和 HTTP/2 多路复用可能让多个请求共享一个 TCP 连接，四层负载均衡只能按连接选择后端，不能保证请求级均衡。需要按 Header、路径或方法分流时仍需 L7 proxy 或应用层负载均衡。

### 负载均衡实验如何避免错误结论

实验至少包含传统 Nginx、eBPF 数据面和 fallback 三个对照组，并固定客户端并发数、容器 CPU 限额、网卡队列、内核版本和后端响应体。

```bash
wrk -t2 -c100 -d30s http://<VIP>
mpstat -P ALL 1
cat /proc/net/softnet_stat
```

同时记录吞吐、P50/P99 延迟、错误率、CPU cycles/packet、软中断、Map 查找失败和 redirect 失败。只有应用层和节点层指标同时改善，才能认为优化有效。

### 负载均衡上线、摘除和回滚

控制面负责服务发现、健康检查和 Map 版本，数据面只读取当前快照。后端异常时先从 Map 摘除，等待已有连接排空；新版本异常时停止控制面更新、切回传统路径，再卸载 BPF link。

```bash
sudo bpftool link show
sudo bpftool map dump id <BACKEND_MAP_ID>
sudo bpftool link detach id <LINK_ID>
curl -fsS http://<VIP>/healthz
```

回滚演练必须验证新连接、已有连接、控制器重启和节点重启四种状态，不能只验证一个 `curl` 请求。
