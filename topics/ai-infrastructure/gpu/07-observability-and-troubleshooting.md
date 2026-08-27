# GPU AI Infrastructure 学习笔记 · Observability / Troubleshooting

## 第 1 章 · GPU 可观测性的四层模型

### Hardware、Performance、Platform 和 Workload 要关联起来

GPU 监控的目标不是收集最多指标，而是解释“硬件是否健康、资源是否交付、工作是否高效、业务是否达标”：

| 层次 | 对象 | 关键问题 |
| --- | --- | --- |
| Hardware | GPU、PCIe、NVLink、NVSwitch、Power、Cooling | 设备是否存在、可达、健康 |
| Performance | SM、Tensor、DRAM、PCIe/NVLink、Clock | 算力和带宽用在哪里 |
| Platform | Node、Driver、Operator、Device Plugin、HAMi | 资源是否正确交付和隔离 |
| Workload | Pod、Job、Queue、Step、Tokens/s、Latency | 用户是否获得预期结果 |

```mermaid
flowchart TD
    SLO[Workload SLO] --> W[Workload Metrics]
    W --> P[Platform State]
    P --> G[GPU Performance]
    G --> H[Hardware Health]
    H --> R[Alert and Runbook]
    R --> SLO
```

四层指标需要通过 Node、GPU UUID、MIG UUID、Pod UID、Job ID 和时间窗口关联。GPU index 会在重启、MIG 重配或容器内变化，不适合作为长期唯一键。

### Allocated、Active 和有效吞吐要分开统计

GPU Allocated 表示调度器已分配资源，GPU Active 表示设备在采样期有执行活动，Effective Throughput 则是 Samples/s、Tokens/s、完成任务数或服务请求吞吐。三者分别回答资源承诺、硬件活动和业务产出，不能相互替代。

`Allocated` 高而 `Active` 低，可能是数据准备、队列、Barrier、初始化或资源碎片；`Active` 高而吞吐低，可能是 Memory Bound、通信、节流、算子回退或邻居争用。容量报告应把这三类指标放在同一时间窗口。

建议按 `Node、GPU UUID、Pod UID、Job ID` 保存三类指标，并记录资源申请到首次 Kernel 的启动延迟。对服务场景，还要把排队请求数和拒绝数加入同一窗口，否则“已分配但无活动”可能只是没有流量。容量评审应区分承诺容量、可用容量和实际产出，避免用 Allocated 百分比直接计算利用率。

## 第 2 章 · 硬件健康和 DCGM

### 温度、功耗、时钟和 Throttling 共同解释环境约束

温度过高可能触发 Thermal Slowdown，功耗接近 Power Limit 可能触发 Power Throttling，时钟下降也可能来自应用负载、管理员锁频或 P-State 变化。单个瞬时值不能直接归因，要把温度、功耗、时钟、风扇、机房进风和业务吞吐放在同一时间线上。

```bash
nvidia-smi --query-gpu=uuid,temperature.gpu,power.draw,power.limit,clocks.sm,clocks.mem,pstate,clocks_throttle_reasons.active --format=csv
nvidia-smi dmon -s pucvmet -d 1
ipmitool sensor 2>/dev/null | rg -i 'temp|fan|power'
```

持续降频并伴随吞吐下降时，应按节点维护流程 Cordon/Drain 后检查风道、散热器、风扇、电源和机房温度；一次 Power Limit Active 但吞吐正常，更适合作为容量和能效信号分析。

### ECC、Retired Pages、Row Remap 和 XID 反映不同风险

Correctable ECC 可以被硬件纠正，但持续增长可能表示显存退化；Uncorrectable ECC 可能导致应用失败、GPU Reset 或节点隔离。Retired Pages 表示已停用的显存页面，Row Remap 表示用备用行替换故障 DRAM 行，Pending/Failure/资源耗尽通常比累计值更需要关注。

XID 是 NVIDIA Driver 写入 Kernel Log 的错误编号，不是脱离上下文即可执行的处置指令。应保存编号、GPU UUID/BDF、时间、进程、前后日志和是否重复，再参考适用代际的 NVIDIA Debug Guideline。

```bash
nvidia-smi -q -d ECC,PAGE_RETIREMENT,ROW_REMAPPER
journalctl -k --since '2 hours ago' | rg -i 'NVRM|Xid|SXid|PCIe|AER'
nvidia-smi --query-gpu=uuid,pci.bus_id,ecc.errors.uncorrected.volatile.total,ecc.errors.corrected.volatile.total --format=csv
```

重复 Uncorrectable ECC、Fatal XID、GPU Fallen Off Bus 或 Row Remap Failure 通常应停止新作业并保留现场；单次 Correctable Counter 增加应先观察增长率和 DCGM Health。

### DCGM 提供健康、诊断、分析和作业统计能力

DCGM 以 GPU、GPU Instance、Compute Instance、NVSwitch 等 Entity 管理设备，提供 Field Watch、Health、Diagnostics、Profiling、Accounting 和 Job Statistics。Health 观察错误和状态，Diagnostics 会主动施加测试负载，Profiling 提供 SM/Tensor/DRAM 等活动，Accounting 汇总进程或作业使用。

```bash
systemctl status nvidia-dcgm
dcgmi discovery -l
dcgmi health -s a
dcgmi health -c
dcgmi diag -r 1
dcgmi dmon -e 1001,1002,1004 -c 10
```

Health Pass 只说明观察窗口内未发现已配置问题，不等于完整硬件验收；高等级 Diagnostic 应在节点 Drain 后运行。

### DCGM Exporter 把 GPU Telemetry 暴露给 Prometheus

DCGM Exporter 可以作为 GPU Operator Operand、DaemonSet、容器或系统服务，把选定 Field 转成 Prometheus 指标。Exporter HTTP 可抓取不等于 GPU Field 有效，还要检查 UUID/Pod 映射、权限、`N/A`、采集耗时和 Cardinality。

```bash
kubectl -n gpu-operator get pods -l app=nvidia-dcgm-exporter -o wide
kubectl -n gpu-operator logs -l app=nvidia-dcgm-exporter --tail=100
curl -fsS http://127.0.0.1:9400/metrics | head
```

自定义 Counter CSV 应版本化，升级后检查指标重命名、单位和标签变化。GPU、MIG、Pod 和 Job 标签不能无限扩张，否则监控系统本身会成为容量问题。

## 第 3 章 · 性能指标和业务诊断

### SM、Tensor、DRAM、PCIe 和 NVLink 要按阶段解释

| 指标 | 高值可能表示 | 低值可能表示 |
| --- | --- | --- |
| GPU Utilization | 采样期有 Kernel | 无工作、等待或初始化 |
| SM Activity | 执行资源繁忙 | 并行度低或同步等待 |
| Tensor Activity | 矩阵低精度路径生效 | 算子回退或非矩阵负载 |
| DRAM Activity | 显存接口繁忙 | 数据复用高或设备空闲 |
| PCIe Throughput | Host/Device/NIC 搬运多 | 已走 NVLink 或输入不足 |
| NVLink Throughput | P2P/Collective 活跃 | 路径未使用或链路异常 |

训练 Compute、AllReduce、Checkpoint，推理 Prefill、Decode 都有不同指标模板。只有把指标和模型阶段、应用吞吐、请求队列一起看，才能区分正常工作模式和性能异常。

### Queue、Pod、Job 和训练指标要形成一条时间线

平台层记录 Namespace、Pod/Job 状态、请求的 GPU/Profile、实际 UUID、分配时长、Waiting、Idle 和失败原因；训练层记录 Step Time、Samples/s、Tokens/s、Loss、Checkpoint Duration 和 Scaling Efficiency；推理层记录 Request Rate、Queue Time、Batch、TTFT、P50/P95/P99 和 Error Rate。

建议明确形成 GPU 使用时间、GPU Waiting、GPU Idle、Training Throughput、Inference Latency、Tokens/s、Queue Time 和 Job Failure 八类工作负载指标，而不是试图从 DCGM 硬件 Field 反推出所有业务状态。

如果 Queue 很长但 GPU Idle，优先看 Scheduler、Quota、Affinity、Fragmentation 或 Gang Admission；如果 GPU Busy 且推理 Queue 增长，才更像计算容量不足；如果训练 Step 周期性变长，应比较 DataLoader、AllReduce 和 Checkpoint 时间。

#### 每个指标必须声明生产者和时间边界

| 指标 | 主要生产者 | 推荐时间边界 | 不能单独证明什么 |
| --- | --- | --- | --- |
| GPU 使用时间 | Scheduler 分配事件、Pod/Job 生命周期 | Allocation Start 到 Release | GPU 是否真正执行有效计算 |
| GPU Waiting | Queue 或 Job Controller | Submit 到 Admission/Allocation | 等待是否由物理 GPU 不足造成 |
| GPU Idle | DCGM 活动指标与 Allocation Join | 已分配窗口内的非活动时间 | 无 Kernel 是否属于异常 |
| Training Throughput | Framework/Trainer | Step、窗口或完整 Attempt | GPU 硬件是否健康 |
| Inference Latency | Gateway/Serving Runtime | 请求入口到完成 | GPU Kernel 时间占比 |
| Tokens/s | Trainer 或 Serving Runtime | 固定模型阶段与输入桶 | 不同模型、精度之间可直接比较 |
| Queue Time | Scheduler、Gateway 或 Batcher | 进入队列到离开队列 | 后续执行是否满足 SLA |
| Job Failure | Job Controller、Launcher、应用 | Attempt 结束事件 | 根因位于应用还是基础设施 |

DCGM 能说明设备在某个采样窗口内做了什么，但它不知道业务请求、Scheduler Queue、模型 Revision 或训练 Step 的含义。Kubernetes 知道 Pod 被调度到哪个 Node，却不天然知道容器最终使用了哪个物理 GPU。应用知道 Step 和 Token，却可能看不到 PCIe、NVLink 或硬件错误。因此这些指标必须在观测系统中 Join，不能要求单一组件提供全部答案。

#### 稳定身份把多套系统连接起来

推荐的关联链如下：

```text
Cluster
  -> Node UID 和 Node Name
  -> GPU UUID 或 MIG UUID
  -> Namespace 和 Pod UID
  -> Container Name 和 Container ID
  -> Job ID 和 Attempt
  -> Rank 和 Local Rank
  -> Model 或 Engine Revision
```

GPU Index、容器内 Device Ordinal 和 DCGM Entity 数值 ID 都可能随重启、MIG 重配或运行时映射改变，只适合短期定位。持久记录以 GPU/MIG UUID、Pod UID、Job Attempt 和时间窗口为主，数值 ID 作为当时快照保存。多节点训练还要保存 Rank 到 Node、GPU UUID 和 HCA 的最终映射，否则只能看到“Rank 3 慢”，无法定位物理路径。

| 系统 | 必留身份 | Join 目的 |
| --- | --- | --- |
| Kubernetes | Cluster、Node UID、Namespace、Pod UID、Container | 连接申请、调度和生命周期 |
| Device/Runtime | GPU UUID、MIG UUID、Container ID | 证明容器最终获得的设备 |
| DCGM/Exporter | Node、Entity、GPU/MIG UUID、Timestamp | 连接硬件状态和活动 |
| Scheduler/Job | Job ID、Attempt、Queue、Priority、Submit/Start/End | 计算等待、运行和失败重算 |
| Training | Global/Local Rank、Step、Checkpoint、Model Revision | 关联慢 Rank 和训练阶段 |
| Inference | Service/Model Revision、Request Bucket、Batch、Stage | 关联 Queue、Prefill、Decode 和延迟 |

#### Requested、Allocated、Active、Idle 和 Useful 是不同状态

```text
Requested Time
  = 等待中和运行中的资源需求时间

Allocated Time
  = GPU 已经归属给工作负载的时间

Active Time
  = Allocated 窗口内设备出现有效执行活动的时间

Idle Time
  = Allocated Time - Active Time

Useful Time
  = 产生最终被接受业务结果的工作时间
```

这些公式是口径，不要求用一个 DCGM Field 精确积分。Active 需要结合采样周期和阶段定义；Useful 还要扣除失败 Attempt、恢复后重算、无效实验、被丢弃请求或未达到质量/SLA 的输出。短 Checkpoint、Evaluation、模型加载或动态批处理等待可以造成合理 Idle，不能看到一分钟低利用就立即回收资源。

平台报表至少同时展示 Requested、Allocated、Active、Useful 和 Failed/Recomputed。只展示 Allocated 会把等待数据和失败重算当成有效使用；只展示 Active 又会惩罚合理的 Checkpoint、通信和服务待机。

#### 时间线先对齐状态再解释指标

```mermaid
flowchart LR
    A[Request Submitted] --> B[Queue Admission]
    B --> C[Resource Allocated]
    C --> D[Container Started]
    D --> E[Framework Ready]
    E --> F[GPU Active]
    F --> G[Business Output]
    G --> H[Checkpoint Or Response]
    H --> I[Release Or Retry]
```

每个状态转换都记录事件时间。分析时先找哪一段时间变长，再查看该段的 GPU、CPU、网络、存储和应用证据。把不同 Job、不同 Attempt 或不同模型阶段的平均值混在一起，会让 Queue、启动和执行问题互相掩盖。

#### 训练案例从周期性慢 Step 找到等待层

假设训练 Job 已分配全部 GPU，整体 GPU Active 较高，但每隔固定周期 Step Time 明显增加。先按 Job Attempt 和 Step 对齐训练日志，再比较慢 Step 的 DataLoader、Compute、AllReduce 和 Checkpoint Duration：

1. 慢点与 Checkpoint 同时出现，GPU Idle 增加且存储写入上升，优先检查 Checkpoint 并发、提交和共享存储，而不是扩 GPU。
2. 某个 Rank 更早停止 Compute，其他 Rank 随后等待 Collective，检查该 Rank 的 CPU、数据 Shard、Clock、XID 和 GPU-NIC 路径。
3. 所有 Rank 的 Compute 正常但 AllReduce 同时变长，比较 NVLink/RDMA Counter、NCCL 日志和同时间窗的其他 Job 流量。
4. Attempt 最终失败时，把失败前已消耗的 GPU 时间记入 Failed/Recomputed，而不是继续计入有效训练吞吐。

恢复验证使用同一模型 Revision、Batch、并行布局和 Checkpoint 周期，比较 Step Time 分布、最慢 Rank、有效 Tokens/s 和错误增量。GPU Utilization 恢复只是证据之一。

#### 推理案例从 Queue 增长区分容量与供给中断

当请求 Queue 和 P99 同时增长时，先按模型 Revision、输入/输出长度桶和副本查看：

- GPU Active、Batch 和 Tokens/s 都接近健康上限：更像计算容量已饱和，可评估扩副本、调整 Batch 或模型优化。
- GPU Idle 仍高且 Queue 增长：检查 Batcher、Tokenizer、CPU、模型加载、Runtime Error 和请求路由，不能直接增加 GPU。
- GPU Active 高但 Tokens/s 下降：检查 Context 分布、KV Cache、Clock/Throttle、共享邻居和 Kernel/Engine 变更。
- 只有一个副本异常：按 Pod UID 和 GPU UUID 比较该副本的设备、Runtime 和邻居；所有副本同步异常则优先检查流量形状或公共依赖。

推理恢复要同时满足 Queue 回落、TTFT/TPOT 或端到端 P99 恢复、Tokens/s 回到同输入桶基线、错误率稳定。只看平均延迟会掩盖长 Context 和单副本离群。

#### Metric 到 Runbook 的转换需要明确分支

| Metric 组合 | Meaning | 典型 Symptom | Alert 条件思路 | Runbook 起点 |
| --- | --- | --- | --- | --- |
| Allocated 高、Active 低、Queue 有需求 | 已拿到卡但工作未送入 GPU | Job Running 但吞吐低 | 超过启动宽限并持续偏离基线 | Pod/进程、DataLoader、Storage、Barrier |
| Active 高、Useful Throughput 低 | GPU 忙但有效产出下降 | Step/P99 变慢 | 同 Revision、同输入桶下联合偏离 | SM/Tensor/DRAM、Clock、NCCL、邻居 |
| Queue 高、Allocated 低 | 资源未交付 | Pending/Waiting 超 SLO | Queue Age 与可放置资源联合判断 | Quota、Affinity、Fragmentation、Gang |
| Job Failure 增长伴 XID/ECC | 失败可能来自节点健康 | 多 Attempt 在同 GPU 失败 | 按 UUID 聚合的新硬件事件 | 保存首错、Cordon、硬件 Runbook |
| Job Failure 增长但硬件基线正常 | 更像应用或制品问题 | 同镜像跨节点失败 | 按 Model/Image Revision 聚合 | Framework、配置、数据和发布回滚 |

示意 PromQL 只能表达 Join 思路，指标名需要按实际 Scheduler 和应用集成替换：

```promql
avg_over_time(DCGM_FI_DEV_GPU_UTIL[15m]) < 10
and on (namespace, pod) gpu_pod_allocated == 1
and on (namespace, pod) workload_queue_depth > 0
```

规则还要有启动宽限、模型加载、Checkpoint、维护窗口和 Telemetry Missing 分支。指标不存在时应进入 Unknown，而不是把缺失 Series 当作 GPU Idle。

## 第 4 章 · 分层故障排查

### GPU 缺失和 Driver 故障从 PCIe 到内核日志开始

```bash
lspci -nn | rg -i 'nvidia|3d controller'
lsmod | rg '^nvidia'
journalctl -k -b | rg -i 'nvrm|xid|nvidia|aer'
nvidia-smi
```

若 `lspci` 看不到设备，优先考虑插槽、电源、PCIe、固件或硬件；若设备存在但 Driver 未加载，检查内核版本、模块签名、Nouveau、DKMS 和残留版本；若出现 Fallen Off Bus、Fatal XID 或设备数量变化，应保留现场并隔离节点。

### 容器和 Kubernetes 故障要沿组件链路定位

`nvidia.com/gpu` 不存在时，从 Node Driver、Toolkit/Runtime、Device Plugin、Kubelet Capacity 依次检查。Pod Pending 时先看 Event，可能是 GPU 不足、Taint/Affinity、Quota、MIG Profile、HAMi Resource、Gang Admission 或 Node Unschedulable。

```bash
kubectl describe node <node> | sed -n '/Capacity:/,/System Info:/p'
kubectl get pods -n gpu-operator -o wide
kubectl logs -n gpu-operator <pod> --all-containers --tail=200
kubectl describe pod <pod> -n <namespace>
kubectl get events -n <namespace> --sort-by=.lastTimestamp | tail -50
```

Operator 异常要定位具体 Operand 和 Validator，不能只重启 Operator；同一节点 Device Plugin 反复失败或 Allocatable 突然减少时应 Cordon。

### NCCL Timeout 和 Hang 要寻找首错

| 现象 | 常见原因 | 首要证据 |
| --- | --- | --- |
| NCCL Timeout | Rank 崩溃、Collective 不一致、网络超时 | 全 Rank 首错和时间线 |
| NCCL Hang | Launch 顺序、接口、异步错误 | NCCL Debug、Stack、Framework Log |
| RDMA 异常 | Port/GID/MTU/PFC/ECN/Driver | `rdma`、`ibstat`、端口计数器 |
| 多节点变慢 | 拓扑、慢 Link、拥塞、Straggler | 分层 NCCL Tests |

先用 Socket/Host Network 证明进程和基本连通，再验证 RDMA、GPU Buffer/GDR、NCCL，最后回到框架和应用。一次只改变一个诊断变量，避免用回退路径掩盖根因。

### CUDA OOM、低利用率和高利用率低吞吐不是同一类问题

CUDA OOM 需要记录 OOM 前的进程显存、模型阶段、Batch/Context、Allocator Summary、共享方案和邻居占用。单个模型的峰值或碎片通常是 Workload 问题；多个无关 Pod 同时 OOM 或突破共享限制，才需要升级为平台隔离问题。

GPU 长期为零时检查设备是否真正分配、进程是否初始化、DataLoader/CPU/I/O、Queue、Barrier 和错误日志；GPU 高利用率而吞吐低时检查 SM/Tensor/DRAM、Clock/Throttle、通信占比和 Kernel 效率。

排障记录要标明异常开始前后的 Batch、输入长度、精度和并发，保证复测口径一致。先用单卡或最小复现确认应用行为，再与同 SKU 健康节点做微基准对照；只有跨多个工作负载复现且硬件证据一致时，才升级为节点或平台故障。

### MIG 和 HAMi 分配异常要同时查设备和调度状态

MIG 配置失败常见于设备未 Drain、进程持有 GPU、Profile Placement Fragmentation、MIG Manager Label/Config 不一致、Driver/型号不支持或 Device Plugin 未重新发现。HAMi 则要分别检查 Scheduler 账本、Webhook/Annotation、Device Plugin Allocate、HAMi-Core Mount 和容器内 Quota。

```bash
nvidia-smi -L
kubectl describe node <node> | rg -i 'mig|gpu|hami' -C 2
kubectl describe pod <pod> -n <namespace>
kubectl logs -n kube-system deploy/hami-scheduler --tail=200
kubectl logs -n kube-system ds/hami-device-plugin --tail=200
```

共享控制失效可能破坏租户边界。显存限制可被越过、MIG 布局与声明资源不一致或多个 Pod 互相影响时，应停止该节点接收共享工作负载，修复后用竞争 Pod 验证边界。

## 第 5 章 · 硬件与驱动 Runbook

### nvidia-smi 无 GPU 时先判断设备是否完成 PCIe 枚举

#### 现象和可能原因

`nvidia-smi` 报无法连接 Driver、显示 No Devices Were Found，或设备数量少于资产清单。可能原因包括 GPU 未上电、PCIe 未枚举、Link/Riser 故障、Driver 未加载、设备 Fallen Off Bus 或虚拟机未完成直通。

#### 检查和解释

```bash
lspci -nn | rg -i 'nvidia|3d controller'
lsmod | rg '^nvidia'
journalctl -k -b | rg -i 'nvrm|xid|aer|pcie'
nvidia-smi -L
```

`lspci` 也缺设备时，从硬件、BMC、BIOS、Slot 和 PCIe 链路查起；`lspci` 有但模块缺失时转 Driver Runbook；模块存在但 `nvidia-smi` 失败时检查 XID、设备节点和 Driver 初始化。

#### 处置、隔离和恢复

设备数量变化、Fallen Off Bus 或 Fatal XID 应立即 Cordon，停止新作业并保存日志。需要重启、断电或重新插卡时必须 Drain。恢复后核对 Inventory、PCIe Speed/Width、DCGM Health、单卡 Burn-in 和多卡拓扑。

### NVIDIA Driver 加载失败要区分模块构建、签名和冲突

#### 可能原因

常见原因包括 Kernel Header/Module 不匹配、DKMS Build 失败、Secure Boot 拒绝签名、Nouveau 占用设备、残留多个 Driver 分支、容器化 Driver 与 Host 内核不匹配，以及 Fabric Manager 版本不配对。

```bash
uname -r
modinfo nvidia | head
dkms status
journalctl -k -b | rg -i 'nvidia|nouveau|module|signature'
ls -l /dev/nvidia*
```

#### 处理和恢复

不要同时覆盖安装多个发行渠道的 Driver。先确认节点池标准安装方式，再在 Drain 后修复模块、签名或冲突。恢复验证包含 Driver、FM、DCGM、Container Smoke Test、Device Plugin 和真实模型；同节点所有 Pod 受影响时保持隔离。

### Driver 与 CUDA 不兼容要检查实际加载的用户态库

#### 现象

应用可能报告 `CUDA driver version is insufficient`、`cudaErrorCallRequiresNewerDriver`、未找到 Symbol、Kernel Image 不支持，或者 Framework CUDA 初始化失败。`nvidia-smi` 正常只能证明 Driver 基本工作。

```bash
nvidia-smi
nvcc --version
ldconfig -p | rg 'libcuda|libcudart'
LD_DEBUG=libs <application> 2>&1 | less
```

#### 判断和处置

确认 Host Driver、容器 Runtime、Framework Build、Compute Capability 和 Compat Package，排除 Stub/旧库抢占。若整个节点池的标准镜像失败，按版本发布故障处理；若只有一个镜像失败，不隔离硬件节点。修复后运行最小 CUDA 和目标 Framework 测试。

### XID Error 要依据编号、重复性和影响范围处置

#### 证据采集

```bash
journalctl -k --since '2 hours ago' | rg -i 'NVRM.*Xid'
nvidia-smi --query-gpu=uuid,pci.bus_id --format=csv
nvidia-smi -q
```

保存 XID 编号、UUID/BDF、时间、进程、作业、前后 Kernel Log、是否重复和是否伴随 PCIe/ECC/NVLink 错误。相同编号在不同代际和上下文中的严重度可能不同，应查当前 Debug Guideline。

#### 隔离和恢复

Fatal、重复、影响多个作业、GPU Reset 或 Fallen Off Bus 通常需要 Cordon/Drain；单次可恢复应用错误可先保留证据并观察。Reset 有设备占用和平台限制，不能在线盲目执行。恢复后跑 DCGM Diagnostic 和目标负载。

### ECC Error 要区分 Correctable、Uncorrectable 和退化趋势

```bash
nvidia-smi -q -d ECC,PAGE_RETIREMENT,ROW_REMAPPER
dcgmi health -c
```

Correctable 单次增加可先观察增长率；持续增长、Retired Pages Pending 或 Row Remap 资源下降需要维护评估。Uncorrectable、Row Remap Failure 或伴随作业崩溃通常应隔离。恢复验证要包含显存压力测试、DCGM Diagnostic 和错误计数不再增长。

### PCIe Error 要关联 AER、Link Width 和 GPU 状态

```bash
journalctl -k -b | rg -i 'AER|PCIe|fallen off'
lspci -s <BDF> -vv | rg -i 'LnkCap|LnkSta|AER'
nvidia-smi topo -m
```

Corrected AER 偶发记录和持续 Fatal AER 的风险不同。当前 Link Speed/Width 低于能力、错误持续增长或 GPU 掉线时，检查 Slot、Riser、主板、供电和固件，并隔离节点。冷重启恢复不等于根因消失，必须长时间 Burn-in 并比较健康节点。

### NVLink Error 和 NVSwitch/Fabric Manager Error 要按 Fabric 域处置

```bash
nvidia-smi nvlink --status
nvidia-smi nvlink --errorcounters
nvidia-smi -q | sed -n '/Fabric/,+30p'
systemctl status nvidia-fabricmanager
journalctl -u nvidia-fabricmanager -b
```

单 Link Inactive、CRC/Replay 增长会影响特定 GPU 对；NVSwitch SXid、FM 初始化失败或 Partition 异常可能影响整个 Scale-up 域。先保存拓扑和计数器，再停止新多卡任务。恢复后验证 Fabric State、P2P Matrix、NCCL Tests 和真实扩展效率。

### Thermal Throttling 和 Power Throttling 要分开判断

Thermal Throttling 通常伴随温度升高、时钟降低和冷却告警；Power Throttling 表示负载触及功耗上限，可能是正常功耗管理，也可能因机架/电源策略异常降低性能。

```bash
nvidia-smi --query-gpu=uuid,temperature.gpu,power.draw,power.limit,clocks.sm,clocks.mem,clocks_throttle_reasons.active --format=csv
ipmitool sensor 2>/dev/null | rg -i 'temp|fan|power'
```

持续 Thermal Slowdown 应隔离并检查风道、风扇、冷板和机房进风；Power Limit Active 需与同型号基线和应用吞吐比较。恢复后在目标功耗下持续压测，确认时钟和吞吐稳定。

## 第 6 章 · 容器、Kubernetes 与共享 Runbook

### Container 无法看到 GPU 要比较 Host 和最小容器

先确认 Host `nvidia-smi`，再运行受支持的最小 CUDA 容器。所有容器失败时检查 Toolkit、Runtime Handler、CDI、Device Cgroup 和 `/dev/nvidia*`；单镜像失败时检查用户、动态库、Entrypoint 和环境变量。

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
nvidia-ctk cdi list
```

节点级注入失败影响同节点多个 Pod 时 Cordon；单应用镜像失败不隔离。恢复后从 Docker/containerd 到 Kubernetes、Framework 逐层验证。

### PyTorch CUDA 不可用要先识别 CPU Build

```bash
python - <<'PY'
import torch
print(torch.__version__, torch.version.cuda)
print(torch.cuda.is_available(), torch.cuda.device_count())
PY
```

`torch.version.cuda is None` 多为 CPU Build；有版本但不可用则检查设备、Driver/Runtime、`CUDA_VISIBLE_DEVICES`、动态库和 Compute Capability。最小 CUDA 容器与其他 PyTorch 镜像正常时，按应用镜像处理，不隔离节点。

### Kubernetes nvidia.com/gpu 不存在要沿注册链路检查

```bash
kubectl describe node <node> | sed -n '/Capacity:/,/System Info:/p'
kubectl get pods -n gpu-operator -o wide
kubectl logs -n gpu-operator <device-plugin-pod> --tail=200
```

Host Driver 正常但 Capacity 缺失时检查 Device Plugin Registration、Socket、Plugin 日志和 kubelet；Capacity 有而 Allocatable 减少时检查设备 Health、已分配 Pod 和 kubelet Checkpoint。资源突降或插件反复失败时 Cordon，恢复后跑 CUDA Pod。

### GPU Operator Operand 异常要定位具体组件

先找失败 Node 和 Operand：Driver、Toolkit、Device Plugin、GFD、MIG Manager、DCGM、Exporter 或 Validator。查看 Pod Event、Init Container、主容器日志、Node Label 和 ClusterPolicy 状态。Controller Running 不表示节点 Operand 健康。

Driver/Toolkit/Device Plugin 影响设备交付时 Cordon；单 Exporter 失败可在监控降级状态修复，但要防止失去硬件告警。恢复后验证对应层及完整 CUDA 链路。

先记录 ClusterPolicy、Operand Pod 的期望与实际状态，再按依赖顺序处理：Driver 决定设备可用性，Toolkit/Runtime 决定容器注入，Device Plugin 决定资源注册，DCGM/Exporter 决定观测。只重启 Operator 可能掩盖 Init Container 或节点级依赖错误。每次只变更一个 Operand，并保留变更前后的 Node Label、Capacity 和日志。

### GPU Pod Pending 要按调度事件分类

```bash
kubectl describe pod <pod> -n <namespace>
kubectl get events -n <namespace> --sort-by=.lastTimestamp | tail -50
kubectl get resourcequota -n <namespace>
```

常见类别包括资源不足、Taint/Toleration、Node Affinity、Quota、MIG Profile、HAMi 资源账本、Gang Admission、PVC 或镜像拉取。Pending 通常不是节点硬件故障，不应先重启 GPU Node。只有 Allocatable 与实际健康设备不一致时才转节点 Runbook。

### CUDA OOM 要区分真实容量、碎片和共享越界

保存 OOM 前 Process Memory、Batch/Context/Shape、模型阶段、Allocator Summary、邻居进程和共享方案。降低 Batch 后稳定通常是容量问题；长期运行逐步增长可能是 Cache/泄漏；总空闲看似足够但大块分配失败可能是碎片。

单 Pod OOM 不隔离节点。HAMi/MPS/Time-Slicing 下多个租户同时受影响或突破声明限制时，应停止该节点接收共享任务并验证隔离。

判断时把 Framework 的 Allocated/Reserved 与 `nvidia-smi` 的进程视图对齐；两者差异可能来自上下文、缓存或其他进程。复现应固定输入形状并逐步增加 Batch，记录首次失败的申请大小。修复后用同样的竞争负载验证租户之间不会互相驱逐或突破配额。

### MIG 配置失败要检查进程、Profile 和 Placement

检查 GPU 是否已 Drain、是否有进程持有、型号/Driver 是否支持、目标 Profile 是否能在当前布局放置、MIG Manager Label/Config 是否一致，以及 Device Plugin 是否重新发现。

```bash
nvidia-smi -L
nvidia-smi mig -lgi
nvidia-smi mig -lci
kubectl describe node <node> | rg -i 'mig|nvidia.com' -C 2
```

声明资源与物理布局不一致时保持 Cordon。恢复后验证 MIG UUID、资源名、Pod 分配、DCGM Mapping 和实例间隔离。

### HAMi GPU 分配异常要查调度和运行限制两条链路

一直 Pending 时检查 HAMi Scheduler、Node/GPU 账本、Resource Name、Quota 和 Annotation；Pod 已运行但看到整卡资源时检查 Device Plugin Allocate、HAMi-Core Mount/注入和容器环境。

```bash
kubectl describe pod <pod> -n <namespace>
kubectl logs -n kube-system deploy/hami-scheduler --tail=200
kubectl logs -n kube-system ds/hami-device-plugin --tail=200
```

显存/算力限制可被绕过会破坏多租户边界，应立即停止共享调度。恢复后用两个竞争 Pod 验证限制、OOM、性能干扰和监控归属。

## 第 7 章 · 性能与分布式通信 Runbook

### GPU Utilization 长期为 0 要沿输入链路查找等待

先确认 Pod 分到正确 GPU、进程存在并完成 CUDA 初始化，再检查请求队列、CPU/DataLoader、存储、网络、Barrier 和错误日志。Allocated 高、Queue 长、GPU Idle 更像平台调度；无请求且 GPU Idle 可能是正常业务低谷。

不因低利用率自动隔离节点。用同节点微基准确认硬件正常后，按 Workload 数据路径优化；恢复验证使用目标 Samples/s/Tokens/s，而不是只要求利用率升高。

应同时查看进程是否存在、Kernel Launch 是否发生以及输入队列是否有待处理工作。若 CPU、Storage 或网络等待与 GPU 空洞同步，根因在供给链路；若没有业务请求，则属于正常空闲。将“无工作”和“有工作但未执行”分成不同告警，避免误触发节点下线。

### GPU Utilization 很高但训练很慢要分离计算、显存和通信

比较 SM、Tensor、DRAM、PCIe/NVLink、Clock/Throttle、NCCL 占比和 Step Time。SM/Tensor 高可能 Compute Bound，DRAM 高可能 Memory Bound，利用率高但 SM 低可能是低效/通信 Kernel。

同节点所有基准下降且伴随节流或错误时隔离；只有单模型下降且硬件微基准正常时转应用性能分析。恢复必须比较同模型、精度、Batch 和数据的吞吐。

对比同一阶段的 SM、Tensor、DRAM 活动、Kernel 时间和 NCCL 时间，确认高利用率来自有效计算还是重试、通信和小 Kernel。记录基线的模型版本、精度、Batch 和拓扑；只有这些口径一致，吞吐差异才可用于回归判断。

### NCCL Timeout 要寻找所有 Rank 中的第一个错误

收集全 Rank 日志并按时间排序。首错可能是 OOM、CUDA 异步错误、进程退出、接口连接失败或 Collective 参数不一致；最后报告 Timeout 的 Rank 通常只是受害者。

```bash
export NCCL_DEBUG=INFO
export NCCL_DEBUG_SUBSYS=INIT,NET,GRAPH,COLL
export NCCL_DEBUG_FILE=/tmp/nccl.%h.%p.log
```

是否隔离取决于首错：应用 Collective 不一致不隔离，某节点 RDMA/PCIe/NVLink 重复失败则隔离。恢复后先 NCCL Tests，再真实框架任务。

### NCCL Hang 要检查调用顺序和异步错误

确认所有 Rank 进入相同 Collective、Count/Datatype 一致、P2P Send/Recv 匹配、Stream 和 Group Call 正确关闭，并检查 Framework Watchdog/Stack。网络完全无错误时，应用调用顺序比调网卡参数更值得优先检查。

为每个 Rank 记录最后一个成功的 Collective、参数摘要和 CUDA Stream，不要只收集超时 Rank。启用有限时长的 NCCL Debug 与框架分布式日志，避免无限增长。若某 Rank 在进入 Collective 前已退出，应先修复该 Rank 的首错，再判断网络是否只是后续症状。

### RDMA 异常按 Physical、NIC、IP、RDMA 顺序排查

确认 Link、Firmware、Port Mode、IP/Route/MTU、GID、PFC/ECN、QP 和 Perftest。Host Memory 正常而 GPU Buffer 失败时检查 GPU-NIC 拓扑、Peer Memory/DMA-BUF、IOMMU 和权限。

同一 HCA/Port 在多对节点重复失败时隔离对应节点或端口；跨整个交换域失败时按 Fabric 故障处理。恢复后保存 Perftest、Counter 增量和 GDR/NCCL 结果。

每一层都要有正向测试：Physical 看链路和端口，NIC 看接口与固件，IP 看地址路由和 MTU，RDMA 再看 GID、QP、PFC/ECN 与 GPU Buffer。Host Memory 能通信而 GPU Buffer 失败，说明基础网络未必有问题，应转向 GDR、DMA-BUF、IOMMU 或权限。测试结果按发送端、接收端和交换机端口配对保存，便于定位单向故障。

### 多节点训练性能下降要用分层基准二分

比较单卡、单机多卡、两节点和多节点结果，按节点、机架、交换机、Rail 二分。观察 NCCL Bus Bandwidth、PFC/ECN/Drop、GPU-NIC 拓扑、慢 Rank、DataLoader 和 Checkpoint。

只有某节点加入后下降时，隔离该节点复测；所有节点相同消息大小下降时，检查算法、MTU、拥塞和框架 Bucket。恢复验证必须使用相同拓扑和参数。

先建立单卡和单机多卡基线，再逐级增加节点；首次出现效率拐点的规模就是重点调查边界。将慢 Rank、链路计数器、GPU-NIC 亲和性和 DataLoader 时间放到同一时间窗，区分通信瓶颈与输入瓶颈。更换节点或切换算法后必须重复相同消息大小和并行配置，避免测试变量同时变化。

## 第 8 章 · 告警、隔离和恢复闭环

### 每条 GPU 告警都要能导向一个动作

| Metric/事件 | 可能症状 | 告警思路 | Runbook 起点 |
| --- | --- | --- | --- |
| GPU Count/Health | GPU Missing | Inventory 变化或 Health Fail | PCIe、Driver、Kernel Log |
| Temperature/Clock | Throttling、吞吐下降 | 持续超基线并关联降频 | Cooling、Power、BMC |
| ECC/XID | Job Crash、Reset | Uncorrectable 或 Fatal XID | 保存证据、隔离、按码处置 |
| NVLink/RDMA | NCCL Hang、扩展效率差 | Link Down、错误增长、带宽下降 | Topology、NCCL/RDMA Tests |
| Pod/Queue | Pending、Waiting | 等待超过 SLO | Event、Quota、Fragment |
| Tokens/s/Latency | SLA 违约 | SLO Burn Rate | Queue、Batch、GPU Timeline |

Runbook 写明 Owner、Severity、抑制条件、证据命令、是否 Cordon/Drain、恢复验证和升级路径。维护窗口产生的预期重启应抑制，但不能永久屏蔽设备数量变化和 Fatal Error。

### 节点隔离要基于影响范围而不是错误名称

| 情况 | 默认动作 |
| --- | --- |
| 单个 Pod OOM 或镜像错误 | 修复工作负载，不隔离健康节点 |
| Driver/Device Plugin 同节点反复失败 | Cordon，保留日志后修复 |
| Fatal XID、Fallen Off Bus、Uncorrectable ECC | 停止新作业并 Drain/报修 |
| Link Error 持续增长 | 限制通信作业并按 Fabric 域隔离 |
| 多节点共享网络故障 | 按交换机、端口、机架域隔离 |

Reset、冷重启和在线配置变更都有前置条件。必须先停止持有设备的进程、确认维护窗口和回滚路径，不能把危险恢复命令放进无条件自动化。

### 恢复验证要覆盖故障发生的层和上层消费者

硬件修复后不仅运行 `nvidia-smi`，还要做 DCGM、容器、Device Plugin、P2P/NCCL 和目标 Workload；网络修复后从 Perftest、GDR、NCCL 到训练；HAMi/MIG 修复后验证隔离和监控。恢复证据应关联原告警并形成关闭条件。

验证顺序应从底层到上层，每层记录命令、时间、目标 UUID 和结果摘要。功能测试通过但指标没有新鲜数据时，仍应保持 Telemetry Unknown；业务 Smoke 通过但错误计数继续增长时，也不能解除隔离。只有原故障路径和消费者路径都满足关闭条件，才允许重新接收生产任务。

## 第 9 章 · 指标目录和 Prometheus 告警示例

### 硬件指标要区分 Gauge、Counter 和事件

| 类型 | 示例 | 正确观察方式 |
| --- | --- | --- |
| Gauge | Temperature、Power、Clock、Utilization | 当前值、窗口平均、与基线偏差 |
| Counter | ECC、PCIe Replay、NVLink Error、Drop | `increase()` 或 `rate()` 看增量 |
| State | MIG/Fabric/Link/Health | 状态转换和持续时间 |
| Event | XID/SXid、Job Failure | 日志事件与 UUID/Job 关联 |

累计 Counter 在维护后可能不归零，直接对“非零”告警会重复触发历史问题。Counter Reset、GPU Replacement 和 Exporter Restart 也要在查询中考虑。

### 利用率告警要和分配、队列及业务吞吐组合

单独对 `DCGM_FI_DEV_GPU_UTIL < 50` 告警价值很低。更有意义的条件是“GPU 已分配、经过启动宽限期、业务仍有待处理工作、利用率长期低且吞吐偏离基线”。平台需要把 Scheduler/Pod/Job 和 DCGM 标签连接起来。

示意查询：

```promql
avg_over_time(DCGM_FI_DEV_GPU_UTIL[15m]) < 10
and on (namespace, pod) gpu_pod_allocated == 1
and on (namespace, pod) workload_queue_depth > 0
```

`gpu_pod_allocated` 和 `workload_queue_depth` 是平台示意指标，实际名称由集成决定。告警还要排除模型加载、Checkpoint、维护和已知空闲服务。

### Temperature、Power 和 Clock 告警要形成因果组合

```promql
max_over_time(DCGM_FI_DEV_GPU_TEMP[10m]) > <model_threshold>
and on (UUID) avg_over_time(DCGM_FI_DEV_SM_CLOCK[10m]) < <model_baseline>
```

阈值必须按 GPU 型号和厂商支持范围配置，不能所有型号共用一个温度。Temperature 高且 Clock/吞吐下降提高 Severity；Power 接近 Limit 但吞吐稳定可以作为容量分析，而非故障 Paging。

### XID、ECC 和 Link Error 优先看新增事件

```promql
increase(DCGM_FI_DEV_XID_ERRORS[5m]) > 0
```

实际 XID 指标的类型、值语义和标签随 Exporter Counter 配置变化，使用前应检查 `/metrics` 和 DCGM Field 文档。Uncorrectable ECC、Fatal XID、Link Down 可以高 Severity；Correctable ECC 单次增加更适合 Warning 和趋势观察。

### DCGM Exporter 自身也需要可用性和数据质量告警

Target Down、Scrape Error、采集时长、Series 数、GPU 数量变化、关键 Field 长期 `N/A` 和 Pod Mapping 缺失都应监控。Exporter Down 时不能得出 GPU 健康结论，应把节点标记为 Telemetry Unknown。

```promql
up{job="dcgm-exporter"} == 0
```

升级前后比较 Metric Name、Unit、Label 和 Series Cardinality。Dashboard 空白可能只是指标改名，不能直接解释为 GPU 无负载。

### 告警通知必须携带最小诊断上下文

通知至少包含 Cluster、Node、GPU UUID、MIG UUID、PCI BDF、Model、Job/Pod、首次发生、持续时间、相关 XID/SXid、Dashboard 和 Runbook。不要只发 `GPU 0 error`，因为 index 在容器和重启后会变化。

告警关闭条件也要明确：指标恢复、错误不再增长、节点通过验证并 Uncordon。人工 Silence 到期不能自动等同于故障恢复。

## 第 10 章 · 指标语义、采样与聚合陷阱

### Gauge、Counter 和采样活动率需要不同查询方式

温度、功耗、显存占用通常是 Gauge；ECC、PCIe Replay、XID 出现次数等可能表现为累计 Counter；SM/Tensor/DRAM Active 是采样窗口内活动比例。三类数据不能套用同一种 PromQL。

| 类型 | 常见查询 | 主要陷阱 |
|---|---|---|
| Gauge | 当前值、窗口平均、最大值 | 平均会掩盖尖峰 |
| Counter | `increase`、`rate` | Reset 和 Wraparound |
| Activity Ratio | `avg_over_time`、分位关联 | 采样窗口和阶段混合 |
| State/Reason | 按值或 Label 聚合 | `N/A` 与 0 混淆 |

例如 ECC Counter 从 100 变为 0 可能是 Driver/GPU Reset，不是错误减少。查询要结合 `resets`、Exporter Restart、Node Boot Time 和 GPU UUID。

### GPU Utilization 的时间聚合会丢失 Burst 结构

一分钟平均 50% 可能是持续半载，也可能是 30 秒满载加 30 秒空闲。两者对训练 Pipeline 和推理 SLA 的意义不同。Dashboard 应允许 1 秒或较短窗口查看波形，同时保留较长聚合做容量趋势。

```text
Pattern A  50 50 50 50 50 50
Pattern B 100 100 100  0  0  0
Average    50 percent for both
```

高频采集增加 Series、Network 和 TSDB 成本。集群默认周期用于告警，短时高频 Profiling 按事件或代表节点启用，不能无限制对所有 Field 全量采集。

### Average by Node 会掩盖单 GPU 异常

8 卡节点中 7 卡正常、1 卡温度或带宽异常，节点平均可能仍在阈值内。硬件健康告警先按 GPU UUID 判断，再汇总到 Node；容量报告可以按 Node 聚合，但应保留最小值、最大值和离群数量。

MIG 下还要区分 Parent GPU 与 MIG Instance。温度和功耗常属于 Parent，显存/利用率可能能按 Instance 观察。把 Parent Power 复制到每个实例相加会放大总量。

### Missing Series 不是零值

Exporter Down、GPU Lost、Field Unsupported、权限失败和 Pod 不再运行都会导致 Series 消失。PromQL 默认可能让告警表达式也消失，从而没有通知。关键健康规则需要配合 `absent`、Inventory 期望值或 Node Resource Count。

Telemetry Unknown 应是独立状态：不能因为没有 XID Series 就判“没有 XID”，也不能因为 GPU Utilization Series 消失就判“GPU Idle”。

## 第 11 章 · DCGM Health、Diagnostics 与 Profiling

### DCGM Health 持续观察子系统错误

DCGM Health 可关注 PCIe、Memory、Inforom、Thermal、Power、NVLink 等子系统，具体支持项取决于硬件。Health Result 是对观察窗口和 Field 的综合，不等同于完整 Burn-in。

```bash
dcgmi discovery -l
dcgmi health -s a
dcgmi health -c
```

命令可能改变当前 DCGM Health Watch 配置，多租户生产环境应由平台统一执行。输出需保存 Entity、System、Status、Error Code 和 Timestamp。

### Diagnostics 分不同等级施加测试负载

DCGM Diagnostics 可验证软件部署、PCIe、Memory、Compute 和压力等项目。较高等级可能长时间占用 GPU、提高功耗温度，并与业务冲突。生产运行前必须 Cordon/Drain，确认无进程并评估功耗与散热。

```bash
dcgmi diag -r 1
```

这里只示意短诊断入口；实际 Level、插件和参数要按当前 DCGM 文档与硬件支持确定。诊断通过证明测试期间未发现目标问题，不代表未来不会出现间歇硬件错误。

#### 诊断结果要和现场错误关联

XID 后离线诊断通过，可能是瞬态软件问题、环境抖动或测试未覆盖对应路径。应结合 XID 类型、ECC/AER、NVLink Counter、温度功耗和复现负载决定是否返场，而不是仅凭一个 PASS 立即放回生产。

### Profiling Field Group 服务性能归因

SM Active、SM Occupancy、Tensor Active、DRAM Active 和 Pipeline 指标帮助区分 Compute、Memory 和调度效率。部分 Profiling Field 互相复用硬件 Counter，可能不能同时采集所有组，采样频率也有成本。

平台默认 Dashboard 选择少量稳定 Field；深度事件分析临时启用额外 Group，并记录启停时间。不能把短时采集配置永久留在所有节点而不评估开销。

### Accounting 和 Job Statistics 汇总节点内工作窗口

DCGM Process/Job Statistics 基于 Host Engine 已经 Watch 并保留的 GPU Field，对一个 OS PID 或调用方定义的 Job Window 生成节点级摘要。它可以汇总运行时间、能耗、显存高水位、利用率、Clock、PCIe 流量、错误、降频原因和 Health Incident，但字段是否出现取决于设备支持、权限、采样和保留窗口。

它不是 Scheduler，也不是持久计费数据库：

| 能力 | DCGM 负责 | DCGM 不负责 |
| --- | --- | --- |
| Process Statistics | 汇总被观察 PID 在选定 GPU 上的样本 | 判断 PID 属于哪个 Kubernetes/Slurm Job |
| Job Statistics | 按调用方提供的 Job ID 和 GPU Group 汇总时间窗 | 分配、保留或隔离这些 GPU |
| Accounting Mode | 为进程统计提供驱动侧数据条件 | 形成跨节点、跨重启的费用账本 |
| Retained Samples | 在 Host Engine 内保存有限历史 | 替代 Prometheus、日志或长期数据仓库 |

Host Engine 重启会丢失内存中的 Group、Watch、Sample 和 Job Record。需要结算、容量或审计的数据必须在 Epilogue 中导出，并与 Scheduler Job ID、Attempt、Node、GPU UUID 和时间窗口一起写入持久系统。

#### Process 和 Job 使用不同时间边界

- Process Mode 以一个 OS PID 为身份，适合 PID 本身就是工作单元的场景。Launcher 产生多个子进程、容器内外 PID 不同或一个 Allocation 覆盖多个 Rank 时，单 PID 不能代表完整 Job。
- Job Mode 由集成方显式执行 Start/Stop，并把一个调用方 Job ID 与 GPU Group 绑定，适合 Scheduler Prologue/Epilogue。
- 两种模式都无法回补未采集的历史。Watch 必须在工作开始前启用，Retention 必须覆盖作业时长、Epilogue 延迟和查询时间。

采样间隔过长会漏掉短进程和峰值，保留时间过短会在 Job 结束前淘汰开头样本；采样过快、保留过长又增加 Host Engine 负担。平台应按短作业、长训练和交互服务分别定义策略，不照搬默认值。

#### Scheduler 集成拥有完整生命周期

以下命令展示工作流，参数和能力以节点安装版本的 `dcgmi stats --help` 为准：

```bash
# Prologue: 建立与本节点分配相同的临时 Group
dcgmi group --create <job-group> --add gpu:<id>,gpu:<id>

# 在作业开始前启用统计 Watch
dcgmi stats --enable --group <group-id> \
  --update-interval <milliseconds> --max-keep-age <seconds>

# 标记调用方定义的作业窗口
dcgmi stats --jstart <job-id> --group <group-id>

# Epilogue: 应用和子进程结束后停止并读取摘要
dcgmi stats --jstop <job-id>
dcgmi stats --job <job-id> --verbose

# 先导出持久系统 再清理短生命周期状态
dcgmi stats --jremove <job-id>
dcgmi group --delete <group-id>
```

Group 只是 DCGM 的观察选择器，创建 Group 不会完成资源分配或阻止其他进程使用 GPU。Job ID 还应包含或映射 Scheduler Attempt，避免重试覆盖原失败窗口；同一个多节点 Job 需要各节点产生节点级摘要，再由上层按 Job/Attempt 汇总，不能把单节点结果误称为整个训练作业的能耗和利用率。

#### 结果解释要保留采样和聚合边界

Job Summary 可能混合 Gauge 的最小/最大/平均、Counter Delta、Process Facts 和 Health Incident。使用时必须保留：

- 采样周期、Retention 和 Watch 开始时间；
- GPU Group、物理 UUID、MIG 层级和 Node；
- Job ID、Attempt、Start/Stop 和进程清理时间；
- 每 GPU 明细，避免 Group 平均掩盖一个慢卡；
- `N/A` 的原因，包括 Field 不支持、权限不足、开始太晚或样本已淘汰；
- Host Engine Restart 事件和集成是否重新建立状态。

DCGM Job Statistics 可作为 GPU 节点证据，但计费还需要 Queue/Allocation、业务产出、失败重算和租户归属。只有把它与 M1 的 Requested、Allocated、Active、Useful 口径连接起来，才能解释“占了多久、设备做了什么、最后产生了多少有效结果”。

### Entity Group 让 GPU、GI、CI 和 Switch 使用统一标识

DCGM 不只管理整卡，还可表示 MIG GPU Instance、Compute Instance 和 NVSwitch 等 Entity。告警和证据要保存 Entity Group/ID 与物理 UUID 的映射，否则实例重建后无法追溯父设备。

Entity Group 是 Host Engine 中可复用的选择器，不是调度分配或隔离边界。创建包含 `gpu:0`、`instance:<id>` 或 `nvswitch:<id>` 的组，不会改变 `CUDA_VISIBLE_DEVICES`、Device Cgroup 或租户权限；这些仍由调度器和容器运行时负责。组成员也必须符合被调用 DCGM 操作支持的 Entity Family。

排障时先用 `dcgmi discovery --list` 和 `dcgmi discovery --compute-hierarchy` 重新发现当前 ID，再用 UUID、PCI Bus ID 和父子层级关联资产系统。MIG 重配或 Host Engine 重启后，旧的数值 ID 可能失效，不能把缓存的 Group ID 当成稳定身份。

### NVLink、NVSwitch 和 ConnectX 要按 Entity 与控制边界观测

DCGM 使用统一 Entity/Field 模型观察 GPU、NVLink Endpoint、NVSwitch 和受支持的 ConnectX Adapter，但这些对象的职责不同：

| 对象 | DCGM Entity/Selector 示例 | 重点证据 | 控制边界 |
| --- | --- | --- | --- |
| GPU | `gpu:<id>` | UUID、Topology、聚合 Link Counter、XID | Driver 管 GPU 生命周期 |
| MIG GI/CI | 运行时发现的实例 Entity | 父 GPU、实例 ID、支持的 Activity Field | MIG Manager/Driver 管实例布局 |
| GPU NVLink Port | `gpu_link:<gpu-id>:<port>` | Peer、U/D/X、Traffic、Error Delta | Driver/Fabric Service 管 Link |
| NVSwitch | `nvswitch:<switch-id>` | Inventory、Temperature、Throughput、SXid | Fabric Manager/NVLSM 配置 Fabric |
| NVSwitch Port | `switch_link:<switch-id>:<port>` | GPU Peer、Port State、Fatal/Non-Fatal Error | DCGM 只观察不建路由 |
| ConnectX | `cx:<id>` | Health、PCIe Active/Expected Width/Speed、Temperature | NIC Driver/Firmware/Network 管数据面 |

DCGM 的数值 Entity ID 来自当前 Host Engine Inventory，不保证跨主机或重启稳定。证据包要同时保存父设备、GPU UUID、PCI BDF、Port/Link ID、Peer 和采集时间。ConnectX 不是 NVLink Port，不能用 `dcgmi nvlink` 判断其 PCIe Width 或健康。

#### Link State、Counter、Health 和性能回答不同问题

```bash
dcgmi discovery --list
dcgmi nvlink --link-status --show-entity-ids
dcgmi nvlink --errors --gpuid <gpu-id>
dcgmi dmon --list
```

NVLink State 常见字符应结合平台预期解释：`U` 表示支持的 Link 当前 Up，`D` 表示支持的 Link Down，`X` 表示被禁用，`_` 表示该 Port Position 不支持。下划线不是故障；Disabled 也可能是设计状态。必须与健康同 SKU 拓扑、Peer Endpoint 和 Fabric 配置比较。

多数 Error Counter 是累计值。一次非零不能说明当前作业遇到错误，正确流程是在同一工作窗口前后采集相同 Entity/Field，并计算 Delta。Counter 增长能证明事件发生在窗口内，但仍不能单独给出根因；还要看 Peer、Link State、XID/SXid、Fabric Manager 日志、NCCL 选路和应用表现。

Health 是基于已配置 Watch 的被动判断，Diagnostics 是可能施加负载的主动测试，Traffic Field 是时间序列，NCCL Test 才把 GPU、拓扑和通信库组合起来。任何一个 PASS 都不能替代其余层。

#### Fabric 异常按照发现、影响、隔离和恢复闭环

```mermaid
flowchart TD
    A[Communication Alert] --> B[Discover GPU Switch And Link]
    B --> C[Compare Link State And Counter Delta]
    C --> D[Correlate XID SXid And Fabric Logs]
    D --> E[Measure P2P And NCCL Impact]
    E --> F{Fault Scope}
    F -->|One Link| G[Restrict Affected GPU Group]
    F -->|Fabric Domain| H[Cordon And Drain Node]
    G --> I[Repair Or Reconfigure]
    H --> I
    I --> J[Validate Static State]
    J --> K[Validate P2P NCCL And Workload]
```

一个多卡训练告警可以按以下顺序处理：

1. 保存 Job/Rank、Node、GPU UUID、Topology 和当前 NCCL 首错，不先重启 Fabric Manager。
2. 运行 Discovery 和 Link Status，确认预期 GPU、NVSwitch、ConnectX 与 Link Entity 是否完整。
3. 对相关 GPU 和 Switch Port 保存负载前后 Counter；关联 Kernel XID、NVSwitch SXid、Fabric Manager/NVLSM 与 DCGM Health 时间戳。
4. 用 P2P Matrix 和单节点 NCCL 对比健康基线，判断是单 Link、某 GPU Pair、某 Switch Port 还是整个 Fabric 域。
5. 单链路退化但业务仍运行时，也要按受影响 GPU Group 限制新通信任务；Fabric Incomplete、Fatal SXid、错误持续增长或多作业失败时 Cordon/Drain。
6. 修复后先确认 Inventory、Link State、Fabric State 和 Counter 稳定，再验证 P2P、单节点 NCCL、目标 GPU Group 和代表性训练 Step。

恢复不能只以服务 `active` 或 Link `U` 为终点。静态状态恢复但 NCCL Bus Bandwidth、最慢 Rank 或真实 Step Time 未回到同 SKU 基线时，节点仍保持隔离；Counter 在观察窗口继续增长时也不能解除准入。

## 第 12 章 · 告警分级、抑制与关联

### Page、Ticket 和 Trend 分别服务不同响应速度

| 级别 | 典型条件 | 预期动作 |
|---|---|---|
| Page | GPU Lost、Fatal XID、Uncorrectable ECC、Fabric Down | 立即隔离与响应 |
| Ticket | Link 降级、Correctable ECC 增长、持续节流 | 工作时段诊断和维修 |
| Trend | 利用率、能效、显存水位、碎片 | 容量和优化评审 |

所有非零 Counter 都 Page 会造成告警疲劳；所有问题只做日报又会延误硬件隔离。阈值要映射业务影响、可恢复性和故障扩散风险。

### 告警需要时间条件和变化条件

温度短时尖峰与持续过热不同，Correctable ECC 历史累计与新增长不同。规则通常组合 `for`、窗口最大/平均和 `increase`。

```promql
max_over_time(DCGM_FI_DEV_GPU_TEMP[5m]) > 85
```

85 仅为示例，不是所有 GPU 的阈值。实际要依据型号、厂商规范、节点进风和历史健康分布。

### 上游故障要抑制下游症状风暴

节点断电会同时触发 Exporter Down、GPU Missing、Pod Failure、Job Failure 和低吞吐。Alertmanager 可按 Cluster/Node 抑制下游告警，同时保留关联事件。抑制不是删除，复盘仍要看到完整时间线。

GPU Operator Driver Operand Failed 时，可抑制同节点 Plugin Resource Missing 的重复 Page，但如果 Driver 恢复后 Resource 仍缺失，应让下游告警重新生效。

### 维护窗口用 Silence 而不是改掉规则

计划 Driver 升级会产生预期 Restart 和 Series Missing。用带 Owner、Reason、Node Pool 和到期时间的 Silence 管理；不要临时删除告警或把阈值改得极高。维护结束先验证，再主动结束 Silence。

## 第 13 章 · 统一证据包和时间线

### 第一现场先采集易失信息

重启会清空进程、Runtime 和部分日志；Reset 会改变 Counter；Pod 重建会丢失容器文件系统。处置前优先采集：时间、节点、GPU UUID/BDF、进程/Pod、`nvidia-smi -q`、Kernel Log、Operator/Driver Log、Fabric/NIC 状态、最近指标和应用首错。

```bash
date -Ins
nvidia-smi -L
nvidia-smi -q
dmesg -T | tail -500
journalctl -k -b --no-pager | tail -500
```

命令输出可能包含 Serial、Hostname、Process 和业务信息，外发厂商前需脱敏。`dmesg` 权限受系统策略限制，不应为采集长期开放不必要权限。

### 所有组件必须有可对齐时钟

GPU Error、Kernel、Kubernetes Event、Application Log、Switch 和 BMC 使用不同时区或时钟漂移，会让因果顺序无法判断。平台应监控 NTP/PTP Offset，日志统一记录 UTC 或带 Offset 的时间。

复盘时间线至少标记：最后正常 Step、首个性能偏离、首个硬件/网络错误、应用超时、调度动作、节点隔离、恢复操作和验证完成。

### 证据包要机器生成但允许人工补充

采集脚本应只读、设置超时、限制文件大小并输出 Manifest/Checksum。人工补充现象、业务影响和已做实验。脚本不能自动执行 GPU Reset、重启服务或修改网络。

```yaml
incident:
  id: example
  first_seen: "2026-01-01T00:00:00Z"
scope:
  cluster: example
  node: example
  gpu_uuid: GPU-example
artifacts:
  - nvidia-smi-q.txt
  - kernel-log.txt
  - dcgm-metrics.json
```

## 第 14 章 · 隔离决策与恢复准入

### 隔离条件由错误严重性和复发性共同决定

立即 Cordon/Drain 的典型条件包括 GPU Lost、Fatal XID、Uncorrectable ECC、重复 PCIe AER、NVLink/NVSwitch 导致作业失败、温度或供电超安全线。单次可纠正错误可先观察，但短期增长或跨任务复发应升级隔离。

若节点上有不可中断训练，是否等待 Checkpoint 要权衡数据损坏、硬件扩散和任务损失。疑似不可纠正内存或 Fabric 错误时，不应为了省计算继续运行。

### Cordon、Drain、Taint 和资源屏蔽表达不同状态

Cordon 阻止新调度；Drain 驱逐可驱逐 Pod；故障 Taint 可携带原因并影响特定 Toleration；Device Plugin 标 Unhealthy 可减少可分配设备。仅某张卡坏而 Plugin 不支持细粒度屏蔽时，往往只能隔离整节点。

隔离动作应写入事件系统，避免另一个自动化看到 Node 空闲后自行 Uncordon。

### 恢复验证按原故障路径加通用基线执行

通用项包括 Inventory、Driver/Fabric、DCGM Health/Diag、ECC/XID/AER、PCIe Width/Speed、P2P、NCCL、RDMA、Kubernetes Resource、Exporter 和 Smoke Workload。原故障是温度则增加持续压力与散热验证，是 GDR 则增加 GPU Buffer RDMA。

通过后还需观察窗口，确认 Counter 不再增长、性能稳定，再移除故障 Taint 并 Uncordon。一次 `nvidia-smi` 成功不能作为恢复准入。

## 第 15 章 · 性能异常的联合观测

### 低利用率先判断需求不足还是供给中断

在线服务无请求时低利用正常；Queue 有请求但 GPU Idle，检查 Batcher、CPU、Runtime 和调度；训练 Job Running 但周期空洞，检查 DataLoader、Storage、Checkpoint 和 Rank Barrier。

联合面板按同一时间轴展示 Request/Job Queue、CPU、Storage、Network、GPU Activity、NCCL 和业务吞吐。单一 GPU Dashboard 无法判断上游供给。

### 高利用低吞吐要识别无效忙碌

GPU Utilization 高可能是通信 Kernel、低效小 Kernel、分支发散、Memory Stall 或重试。检查 SM/Tensor/DRAM、Clock/Throttle、Top Kernel、NCCL 时间和健康基线。

如果功耗/时钟正常、Tensor Active 下降且新镜像开始回归，优先看算子路径；NVLink/RDMA Counter 异常且多节点才回归，优先看通信；所有节点 Clock 低则看 Power Policy/散热。

### 尾延迟异常要保留单请求和同卡邻居

平均推理延迟正常但 P99 上升，可能来自长输入、Dynamic Batch 等待、KV Cache 压力、JIT/加载、共享邻居或 GC/CPU 抖动。指标需有 Input Length、Batch、Model Instance、GPU UUID 和 Queue Time 标签或 Trace 关联。

高基数标签不应全部直接进入 Prometheus。Request ID、完整 Prompt 等放 Trace/Log，Metrics 保留有界 Bucket 和模型维度。

### Scaling Efficiency 把多卡结果归一到单卡基线

```text
Scaling Efficiency = Throughput N GPUs / (N x Throughput 1 GPU)
```

效率下降来自通信、负载不均、Batch 不足和同步。必须固定全局/单卡 Batch 口径；Strong Scaling 和 Weak Scaling 不能混合比较。趋势突然下降比绝对值更适合触发回归调查。

## 第 16 章 · 事件复盘与知识回写

### 根因要落到可修复的系统条件

“NCCL Timeout”是症状，“网络问题”仍过于宽泛。有效根因示例是某机架 RoCE Priority Mapping 在交换机升级后不一致，导致指定 Queue 丢包和 Rank Timeout，并说明为何监控未提前发现。

复盘区分触发因素、根因、放大因素和检测缺口，避免把最后执行的恢复动作误写成根因。

### Runbook 每次事件后更新判断分支而非追加故事

新经验应转成可复用的症状、证据、分支、动作和恢复条件。具体事件时间线保留在 Incident 文档，Runbook 只链接代表案例，防止正文变成无法执行的历史堆叠。

### 故障数据进入容量和变更决策

按 GPU 型号、节点 SKU、Driver、Firmware、机架和工作负载聚合 MTBF、隔离时长、重复故障和性能偏离。若某版本显著提高 XID 或重试率，应阻止扩大升级；若某机架热节流集中，应调整散热或功率，而不只是更换 GPU。

## 第 17 章 · 节点查询、显存退化与驱动故障深挖

### Query 模式比解析默认表格更稳定

```bash
nvidia-smi --query-gpu=timestamp,uuid,pci.bus_id,name,driver_version,pstate,temperature.gpu,power.draw,power.limit,clocks.sm,clocks.mem,memory.used,memory.total,utilization.gpu,utilization.memory --format=csv
```

字段支持随产品和 Driver 变化，采集脚本先探测，不支持值保留 `N/A`，不能转换为 0。CSV 字段中的单位要显式保留或使用 `nounits` 后由 Schema 定义。

### dmon 适合短时关联而不是长期存储

`nvidia-smi dmon` 可按秒观察 Power、Utilization、Clock、PCIe 和 ECC 等组；`pmon` 观察进程。它们适合事件现场，长期监控使用 DCGM Exporter，避免 SSH 循环采集造成管理噪声。

```bash
nvidia-smi dmon -s pucvmet -d 1 -c 60
nvidia-smi pmon -s um -c 60
```

不同 Driver 支持的 Group 字母可能不同，先查看帮助。

### `nvidia-smi -q` 是快照不是完整历史

详细查询包含 ECC、Retired Page、Row Remap、Clock、Power、PCIe、Fabric 和 Process，但只反映采集时状态及部分累计值。错误发生后立即保存，并与 Prometheus 和 Kernel Log 补全历史。

### 修改模式命令需要变更控制

设置 Power Limit、Persistence Mode、Compute Mode、MIG Mode、Clock Lock 和 GPU Reset 都改变节点状态。观察命令与修改命令分开到不同脚本和权限角色；默认诊断包只读。


### XID 是驱动报告的错误分类入口

XID 可由应用非法访问、GPU Engine、PCIe、Memory、NVLink 或 Firmware 等触发。编号本身要查对应 Driver/GPU 代际的官方目录，不能把所有 XID 归为坏卡。

证据关联：XID 编号与文本、GPU UUID/BDF、PID/Process、前后 XID、ECC/AER、Fabric/Link、应用 CUDA Error、是否跨多个 Job 复发。

### 应用错误和硬件错误可能形成连锁

非法 Kernel 访问可触发 XID；严重硬件 XID 又让后续 CUDA API 都返回 Context Error。首个应用错误更接近触发点，最后一串错误多是后果。日志系统保留 First Error。

### Correctable ECC 看增量和集中位置

单个 Correctable Error 被 ECC 修复，不一定中断任务；短时快速增长、同一地址/Page 集中或跨任务复发提示退化。按 Volatile/Aggregate、Memory Location 和 GPU UUID 记录。

判断趋势时应保存故障前基线和采样窗口，用 `increase()` 或相邻快照差值观察新增量，而不是仅看累计 Counter 是否非零。若错误只在一个 GPU 或一段显存地址集中，应与该卡的温度、负载、XID 和作业失败时间对齐；跨多个工作负载重复出现时，维护优先级高于单次应用重试。

### Uncorrectable ECC 优先保护数据正确性

Uncorrectable Error 可能导致任务失败或数据损坏。立即阻止新任务，保存证据，结束受影响作业并离线诊断。不要为了完成 Checkpoint 继续使用疑似不可靠 Memory，除非厂商明确判断无数据风险。

### Retired Pages 和 Row Remap 描述不同代际机制

旧机制可退休坏页，新架构可用 Row Remapping 替换故障 Row。观察 Pending/Failure/Remap Availability 与累计变化。容量接近阈值、Remap Failure 或错误持续增长时需要维修评估。

### 清空 ECC Counter 会破坏趋势证据

Counter Clear 只在完成证据保存和厂商流程后执行。监控用 `increase` 并识别 Reset，不通过定期清零获得“零错误”面板。


### 热节流先判断进风、散热路径和负载持续性

现象包括 Temperature 接近阈值、Clock 下降、Thermal Slowdown Active、风扇高转和吞吐下降。对比同机箱 GPU、进风/BMC Sensor、相邻节点和持续负载。

单卡温度异常更像散热接触/风道局部问题；整机/机架同时升高更像环境或冷却容量。清理风道、检查液冷和硬件维护由数据中心流程执行。

### Power Throttle 区分设备限制和机架策略

检查 Power Draw、Power Limit、Default/Max Limit、Clock 和 Throttle Reason。管理员可能为机架功率设置较低 Limit；这不是硬件故障，但必须在容量基线中声明。

### Idle P-State 与负载降频不同

空闲 GPU 进入低 P-State/Clock 是节能。施加负载后未提升，才检查 Persistence、Power、Thermal、Application Parallelism 和 Driver。不要用空闲 Clock 告警。

### 频繁 Clock 波动要与 Kernel 和功率周期对齐

工作负载阶段变化会自然改变 Clock。只有同阶段吞吐下降且 Clock/Throttle 异常，才归因硬件策略。秒级 Power/Clock、GPU Activity 和 Step Log 放在同一时间轴。


### 先判断 PCIe 枚举是否还存在

`lspci` 无 NVIDIA Device 指向电源、插槽、Firmware、PCIe 或硬件；`lspci` 有而 `nvidia-smi` 无，转 Driver Binding、Module、Device Node、Fabric。两层分界避免无效重装。

### Module 加载失败检查四类依赖

Kernel/Header/ABI 不匹配、Secure Boot 签名、Nouveau/其他 Driver 冲突、Module/User Library API Mismatch。保存 `modprobe` Error、Kernel Log、`modinfo`、Loaded Module 和 Package。

### `nvidia-smi` 卡住比立即失败更需要超时保护

管理调用卡住可能是 Driver/GPU 无响应。采集脚本为命令设置超时，超时本身作为证据，避免监控 Worker 永久阻塞。随后隔离节点并按支持流程评估 Reset/Reboot。

### 多卡节点少一张要检查资源账本漂移

物理 GPU Missing 后，Device Plugin/Node Capacity 是否减少；若仍暴露旧数量，新 Pod 会 Allocate 失败。先 Cordon，再让 Plugin/Kubelet Reconcile。恢复物理卡后重新生成 CDI/GFD 和拓扑基线。

## 第 18 章 · 容器、Framework 与显存异常深挖

### 容器无 GPU 分四个观测点

1. Pod 是否请求 GPU 并分配 Node；
2. Device Plugin Allocate/CDI 是否成功；
3. OCI Spec/容器内 Device Node 和 Library 是否存在；
4. 应用是否正确使用 Visible Device。

每层先证实再进入下一层，避免在 Framework Error 时重装 Host Driver。

### PyTorch CUDA False 检查 Build、Driver 和初始化首错

输出 `torch.__version__`、`torch.version.cuda`、`is_available`、Device Count；确认不是 CPU Wheel；用最小官方 CUDA Container 对照；检查 Dynamic Library 和 Extension。若只有某 Pod 失败，比较 RuntimeClass/Security/ENV。

### Fork 后 CUDA 初始化错误属于进程模型问题

CUDA Context 与 Fork/Multiprocessing 有约束。DataLoader 或服务启动方式变化后出现初始化错误，需应用使用受支持的 Spawn/进程模型。平台提供正确容器不等于能修复错误 Fork。

### 容器重启循环先保留 Previous Log

```bash
kubectl logs <pod> -c <container> --previous
kubectl describe pod <pod>
```

反复重启会覆盖首次 CUDA Error。日志采集控制器按 Pod UID 保存 Previous 实例，且区分 Exit Code、OOMKilled、Signal 和 Liveness Kill。


### OOM 先区分峰值不足、碎片、泄漏和邻居抢占

固定阶段/Shape 一开始就 OOM 多为容量不足；运行很久单调增长像泄漏；Reserved 高而失败申请不大可能碎片；共享 GPU 上突发则检查邻居。

复现时固定模型版本、精度、Batch、输入长度和并发，记录首次失败的申请大小与发生阶段。将 Framework 的 Allocated、Reserved、Active/Inactive Split 和分配调用栈，与 `nvidia-smi` 的进程显存及同卡邻居放在同一时间线，才能区分应用峰值、缓存碎片和平台共享越界。

### Framework Snapshot 比 nvidia-smi 总量更接近分配原因

记录 Allocated、Reserved、Active、Inactive Split、失败申请和 Stack/Operator。`empty_cache` 只释放可回收 Cache，不会释放仍被 Tensor 引用的内存，也不是通用泄漏修复。

`nvidia-smi` 更适合确认进程和设备级总量，不能解释哪个 Tensor 或算子持有分配。Snapshot 应在 OOM 异常处理器或失败前周期采集，并带上 GPU UUID、Rank、请求/Job ID；没有这些关联字段，多 Pod 同时运行时容易把邻居占用误归因给当前模型。

### 推理 OOM 关联 Context Length 和并发

保存 Prompt/Output Length、Active Sequence、KV Cache Block、Batch、模型实例和 Workspace。平均请求短不能解释长尾一次 OOM，应按长度 Bucket 做 Admission 和容量限制。

### OOM 后所有 Rank 要协调退出

一个 Rank OOM，其他 Rank 可能卡在 Collective。分布式 Launcher 应传播失败、Abort Communicator、终止完整 Job 并释放 GPU。无限等待会把故障从单卡放大为整作业资源泄漏。

## 第 19 章 · NCCL Hang 与 RDMA 异常深挖

### Hang 先确认所有 Rank 的最后进度点

收集每 Rank 最后 Step/Collective、Call Sequence、GPU UUID/HCA 和 Stack。某 Rank 未进入 Collective，多为应用/数据/前置错误；全部进入但无进展，再查 Transport/网络。

### 网络 Counter 无异常不排除调用不匹配

Count/Datatype/Order 不一致会让 Rank 等待，不一定产生丢包。对比框架 Distributed Debug、Collective Trace 和 Rank Log。增大网络 Buffer/PFC 不会修复调用错误。

### RDMA Retry 增长要沿发送端到接收端追踪

发送 HCA Retry、交换机 Discard/ECN/PFC、接收 HCA Error 和对端进程状态按同一时间窗关联。只换发送端 NIC 可能遗漏下游拥塞或对端退出。

### 多节点性能下降用规模阶梯定位首次拐点

1、2、4、8 节点固定消息/模型测试。2 节点已慢看基本 GDR/网络；跨机架后才慢看 Fabric Oversubscription/Rail；规模越大逐步下降可能是算法、Bucket 或同步长尾。

## 第 20 章 · 故障自动化与恢复准入证据

### 自动化可以采集、标记和 Cordon

低风险动作包括生成证据包、创建 Incident、添加故障 Taint、Cordon、通知 Job Owner 和运行只读 Health Query。动作幂等并记录 Automation ID。

### Reset、Reboot、Drain 和硬件变更需要更高门槛

它们会中断任务或改变证据，需严重性条件、Checkpoint/业务确认、权限审批和防止多节点同时操作。自动化设置每故障域最大并发，防止同机架批量重启。

### 自动恢复前先验证故障原因已消失

进程重启后指标短暂正常不等于硬件恢复。自动 Uncordon 必须要求 Health、Error Delta、功能测试和观察窗口；重复事件超过次数转人工/厂商。

### Runbook Dry Run 验证权限和输出而不执行破坏动作

每季度在测试节点演练证据采集、告警路由、Cordon、Checkpoint 协作和恢复审批。破坏步骤用 Simulation/Mock 或受控故障注入，确保事故时命令、权限和联系人有效。


### 资产和设备数量恢复

预期 GPU/NVSwitch/NIC/NVMe、UUID/Serial/BDF、Node Resource 和 CMDB 一致。更换部件更新身份，不拿旧 UUID 验证。

### Driver 与 Firmware 组合恢复

Loaded Module/User Library、Firmware/FM/OFED、无 API Mismatch，重启后仍成立。只在当前 Boot 成功不够。

恢复证据应同时记录 `nvidia-smi` 的 Driver、实际加载库路径、Fabric Manager/OFED 状态和节点启动日志。若使用 CUDA Compatibility Package，要确认目标进程确实加载了对应目录中的库，而不是被旧 Stub 或系统库覆盖。重启后重新执行同一组检查，排除仅在当前进程或当前 Boot 有效的假恢复。

### Health 和错误计数稳定

DCGM Health/Diag、ECC/XID/AER/NVLink/SXid，负载前后 Delta 无未知增长。历史 Counter 保留，计划 Reset 标注。

先保存维修前后的累计值，再在短时目标负载前后取 Delta；Counter 归零或 Exporter 重启要标注为采集边界，不能直接当成“错误消失”。Health 结果通过但关键 Field 为 `N/A` 时，状态应保持 Unknown，直到确认 Field Scope、权限和采样新鲜度。

### 温度、功率和时钟达到同类基线

持续负载到热稳态，无 Thermal/Power 异常，Throughput/Clock 区间与同 SKU。短空闲快照不通过。

### PCIe 和 NUMA 路径恢复

Gen/Width、AER、CPU/Memory/GPU/NIC Affinity、H2D/D2H。维修/BIOS 后重建指纹。

### P2P、NVLink 和 Fabric 恢复

全 Pair Capability/Bandwidth/Latency、Link/Counter、FM/NVLSM/Fabric/Partition 和单节点 NCCL。

逐 GPU 对验证 P2P 可达性和带宽/延迟，并保存 `nvidia-smi topo -m`、NVLink 状态与错误计数。Scale-up 域还要确认 Fabric Manager/NVLSM 和 Partition 状态一致；单卡 `nvidia-smi` 正常不能替代多卡路径验证。

### RDMA 和多节点通信恢复

Link/GID/MTU、Host/GPU Buffer RDMA、Rail、NCCL 消息矩阵和 Switch Counter。Socket 回退不算高速路径恢复。

### Storage 和 Checkpoint 恢复

Dataset Read/Cache、Checkpoint Write/Commit/Load、NVMe Health 和错误。网络恢复后做 Checksum/完整性。

### Kubernetes 或 Slurm 资源恢复

Plugin/GRES、Node Capacity、Label/Taint/Drain、Runtime/Container、正负向调度和资源释放。先保持隔离运行测试。

Kubernetes 侧核对 Device Plugin 注册的 Capacity/Allocatable、RuntimeClass/CDI、Label/Taint 和 Pod 释放后的资源回收；Slurm 侧核对 GRES、节点状态、作业分配与 epilog 清理。正向测试之外要提交一个超额请求，确认调度器拒绝而不是静默超配。通过后再由 Owner 审批解除 Cordon/Drain。

### MIG、HAMi 或 vGPU 状态恢复

Profile/Layout、实例身份、Resource/账本、限制、Guest/Pod 可见和邻居干扰。物理卡正常不代表虚拟资源恢复。

恢复记录应包含 MIG GI/CI 或 vGPU 实例身份、父 GPU UUID、调度资源名及账本。对 HAMi/MPS 等共享方案，用两个竞争 Pod 验证显存/算力限制和监控归属；对 vGPU 还要确认 Guest Driver、License 与 framebuffer 可见。任何越界或邻居互扰都应保持节点隔离。

### 业务 Smoke 与性能恢复

原故障代表模型/作业，吞吐/延迟/质量和错误。微基准通过后仍需业务层。

### Telemetry 和告警恢复

Fresh Series、GPU/Pod Mapping、Alert Test、Dashboard、Maintenance Silence 清理。无监控节点不直接回生产。

### 观察窗口无复发

长度覆盖原错误触发周期/负载，低风险 Canary 后再关键 Queue。间歇错误使用更长窗口。

### Node 状态和事件闭环

Acceptance Run ID、Incident/RMA、Repair、CMDB、Taint/Drain 和 Owner 审批互链。关闭告警不自动关闭事件。

关闭前确认节点状态、隔离标记和调度账本已经回到预期，证据包链接到 Incident/RMA 和维修记录，并由明确 Owner 认可观察窗口结果。若仍存在未解释的事件、Telemetry Unknown 或资源漂移，只能结束当前处理动作，不能把节点标记为生产就绪。

## 第 21 章 · DCGM Host Engine 的 systemd 生命周期

### 交互式 Shell 环境不会修改 systemd 已启动的 Host Engine

典型安装由 `nvidia-dcgm.service` 启动前台 `nv-hostengine`。服务进程的环境、用户、启动参数和重启策略由 systemd 在进程创建时提供；管理员之后在 Shell 中 `export` 变量，不会改变已经运行的 Host Engine。需要从启动生效的诊断变量或参数应写入 Unit Drop-In，并通过重启创建新进程。

```bash
systemctl cat nvidia-dcgm.service
systemctl show nvidia-dcgm.service \
  --property=FragmentPath \
  --property=DropInPaths \
  --property=ExecStart \
  --property=Environment
```

Vendor Unit、`/run` 生成的 Drop-In 和 `/etc` 管理员 Drop-In 会按 systemd 规则合并。完整复制 Vendor Unit 会失去后续默认更新，直接编辑 `/usr/lib` 会被包升级覆盖，编辑 `/run` 会在重启后丢失；少量站点配置优先使用 `/etc/systemd/system/nvidia-dcgm.service.d/*.conf`。

### daemon-reload、restart 和 enable 解决不同问题

`daemon-reload` 只让 systemd 重新读取配置，不改变运行中进程及其环境；`restart` 会断开客户端并创建新 Host Engine；`enable` 只控制以后开机是否拉起服务。变更验证顺序是检查有效 Unit、Reload、在维护窗口 Restart，再发出实际 DCGM 请求确认服务就绪。

Host Engine Restart 会丢失进程内 Group、Field Group、Watch、Retained Sample、Job、Health/Policy 和 Module State。执行前要识别长期消费者，重启后由 Exporter/Agent/平台控制器重建 Watch 与配置，并确认指标重新产生。不能只看 `active (running)` 就判定 DCGM 监控恢复。

### ExecStart 和服务身份变更必须保留监督与最小权限语义

Drop-In 替换 `ExecStart=` 时需要先用空值清除原列表，再写完整命令。`nv-hostengine -n` 使真实服务保持前台供 systemd 监督；移除后可能让子进程脱离既有生命周期。Unit 的 `User=root` 决定 Host Engine 身份，而 `--service-account` 控制受支持诊断子进程身份，两者不能互相替代。

服务加固要以诊断功能回归为条件。目录 Traversal、可执行文件、日志路径、临时目录、GPU Device 和网络 Listener 权限任何一项收紧都可能让部分诊断静默失败。变更后保存 `systemctl show`、Journal、DCGM 请求、Exporter Freshness 和代表性 Diagnostic 结果。

### CUDA Error Log 用于进程内首错而不是节点健康结论

新 CUDA Driver API 可注册 Error Log Callback，按组件和级别接收更接近错误发生位置的消息。应用应把它与 Request/Rank/Device UUID/Stream 和时间戳关联，并限制敏感路径或用户数据进入日志。该能力有版本与回调线程约束，回调实现不能阻塞或再次制造故障。

Error Log 说明进程观察到什么，不证明物理 GPU 健康；XID、ECC、AER、DCGM Health 和其他租户影响仍需独立采集。反过来，节点指标正常也不能排除错误的 Stream 顺序、非法指针和 API 兼容问题。

## 第 22 章 · GPU 服务器硬件与资产配置基线

### GPU 节点是多个可独立故障组件的组合

一台节点包含 GPU/SXM Baseboard、NVSwitch、CPU、Memory、PCIe Switch/Retimer、NIC/DPU、NVMe、PSU、Fan/Liquid Loop、BMC 和 Mainboard。`nvidia-smi` 只覆盖其中一部分。

这些部件共享供电、散热、PCIe 或 NVLink 路径，一个部件的异常可能以另一个部件的告警呈现。值班检查应先建立节点级拓扑和故障域，再把 GPU 指标与 BMC SEL、主机日志、网络端口和电源事件对齐；只看 GPU Utilization 或温度无法判断整机是否可安全调度。

### PCIe GPU 与 HGX/SXM 的维修单元不同

PCIe 卡通常按 Add-in Card/Slot/Riser 维修；HGX/SXM GPU 与 NVSwitch 位于 Baseboard，拆装、Torque、冷板和 Firmware 依赖 OEM 流程。Runbook 不把 PCIe 重插经验套到 SXM。

PCIe 设备可在厂商许可下通过换槽或换卡做因果验证，而 SXM/HGX 的 GPU、冷板和 NVSwitch 往往是成套维修单元。维修记录必须保留原始槽位、序列号、扭矩和散热操作，避免把一次结构性拆装误当成普通热插拔。

### Retimer、Riser 和 Cable 也是链路故障点

GPU/NIC 本体健康，PCIe Width 降级或 AER 增长可能来自 Riser/Retimer/Connector。资产系统记录槽位与路径，交叉换卡/换槽由维修团队执行并保存结果。

链路故障的证据通常表现为协商速率下降、重试或上游多个 Endpoint 同时异常。先采集 `lspci -vv`、AER 计数和 BMC 事件，再在维护窗口做单变量 swap；未经授权拔插可能破坏保修或造成新的接触问题。

### FRU 与 CRU 决定谁能更换

Customer Replaceable Unit 可由现场按手册更换，Field Replaceable 可能需厂商工程师。合同、备件和 Runbook 标明部件等级，避免无授权拆机影响保修。

FRU/CRU 还决定停机窗口、备件形态和验收范围。工单中记录授权人、部件序列号、拆装前后照片以及回退方式，任何无法确认等级的操作先升级给 OEM，而不是用“重插”作为默认修复。


### Serial、UUID、BDF 和槽位共同标识 GPU

UUID 用于软件/监控，Serial 用于保修，BDF 用于本次拓扑，槽位/Baseboard Position 用于现场。更换 GPU 后 UUID/Serial 变化，BDF 可能不变；CMDB 记录历史关系。

调度和告警尽量使用 UUID 或 PCI Bus ID，不能依赖重启后可能变化的枚举序号。资产系统应保存设备生命周期关系，使旧 UUID 的历史告警仍能追溯到更换后的节点和工单。

### NIC GUID、MAC、BDF 和交换机端口关联

RDMA 故障必须从 HCA Port/GUID 映射 Netdev、BDF、Cable 和 Switch Port。自动 LLDP/Inventory 与布线表对账，发现错接 Rail。

映射完成后才能判断是单端口、单条线缆还是整条 Rail 故障。变更后重新抓取 GUID、MAC、PCIe 树和交换机邻居，避免继续沿用旧布线表排查 NCCL 或 RoCE 问题。

### BOM Baseline 包含部件 Revision

同 SKU 可能使用不同 Memory/NVMe/PSU/NIC Revision。记录 Vendor/Model/Firmware，性能异常按批次聚合。采购允许替代料时，预先定义兼容与重验。

BOM 基线还应包含容量、接口速率、散热件和可替代料关系。把离群错误按 Revision 聚合，常能发现共同固件或供应批次问题；没有 Revision 字段时，批量回滚和 RMA 都缺少证据。

### 配置快照在变更前后生成 Diff

BIOS/BMC/Firmware、PCIe Tree、GPU/NIC、Driver、FM、OFED 和 OS Package 结构化保存。Diff 变化触发对应测试，不把所有变化都归为硬件坏。

快照应在变更前、重启后和验收后各保存一次，并带时间、节点身份和操作人。对比时区分预期变更与意外漂移，只有能与错误时间线对应的差异才进入故障假设。

## 第 23 章 · Firmware、BIOS 与主机 RAS

### Server Firmware 不只是 BIOS

包含 BIOS/UEFI、BMC、CPLD、GPU VBIOS/GSP、NVSwitch、PCIe Switch/Retimer、NIC/DPU、NVMe、PSU/CDU。OEM Bundle 往往验证组合，单独升级一个部件可能脱离支持矩阵。

固件升级计划应以整机 Bundle、OEM 支持矩阵和回滚介质为边界，而非只看某个版本号。升级前冻结当前版本和配置，升级后检查设备枚举、传感器、链路训练及代表性业务路径。

### GPU Firmware 与 Driver 协同初始化

Driver 加载时与 GPU Firmware/GSP 交互，版本不匹配或更新失败可表现为 XID、设备初始化失败。日志保存 Firmware Version、Driver Branch 和首次 NVRM Error。

初始化失败可能发生在模块加载、Fabric 建立或首个 CUDA Context 创建阶段。按时间顺序保存 dmesg、BMC SEL、`nvidia-smi -q` 和服务日志，先确认组合版本，再决定重载驱动、重启还是转硬件诊断。

### NIC Firmware 与 OFED/NCCL Plugin 配套

Firmware 改变 Link、RoCE Congestion、SR-IOV 和 GDR 能力。升级后回归 Link/Port Counter、Host/GPU RDMA、Multi-Rail NCCL 和 VF。

NIC 固件变更不能只用链路 Up 作为通过条件；拥塞控制、虚拟功能和 GPU Direct 可能在高负载或多 Rail 才暴露问题。测试应覆盖单端口、双向流量、错误计数增量以及实际通信库路径。

### Firmware Bundle 升级要有电源和时间预算

某些部件需 Cold Power Cycle，更新中断电会损坏。维护计划确认双电源/BMC、升级时长、不可取消阶段、恢复介质和厂商支持。

执行前 Drain 节点并确认冗余电源、远程控制和带外通道可用。升级脚本输出、阶段时间和失败点必须留档；遇到不可取消阶段不得强制断电，按 OEM 恢复流程处理。

### Downgrade 不一定被支持

安全 Fuse、Schema 或依赖可能阻止降级。变更前明确 Rollback 是 Firmware Downgrade、切备件还是恢复旧 Image；不能把“保留旧包”当完整回滚。

真正的回滚还要验证配置格式、密钥和邻接组件是否兼容。若只能更换已验证的备件或恢复整机镜像，应在变更单中明确 RTO、数据保留和升级失败后的停止条件。


### CPU Machine Check 可能连带 GPU I/O

PCIe Root/Memory Controller 错误会使 GPU/NIC 异常。检查 MCE/APEI/EDAC、BMC SEL 和 Socket，避免看到 GPU XID 就只换 GPU。

先按时间线判断是 CPU/Root Port 先报错还是 GPU 先失联，再定位同一 Socket、Root Port 下的设备。若多个 Endpoint 同时受影响，应优先隔离主板、供电或 PCIe 交换路径，而不是逐卡更换。

### Host Memory ECC 影响 DataLoader 和 DMA Buffer

Correctable/Uncorrectable DIMM Error、Page Offline 和 NUMA 容量变化会影响训练。节点健康统一纳入 CPU/Memory RAS，不让 GPU Monitor 成为唯一告警源。

Correctable 错误的持续增长也是预警信号，不能因为任务暂时成功就忽略。检查 EDAC、内核 Page Offline 和 NUMA 可用容量，并在调度标签中反映降级，避免高内存带宽任务落到异常节点。

### Power Profile、C-State 和 NUMA 需要验证

Latency/Performance Profile 可改善 CPU Feed/Network Progress，但提高 Power。使用 OEM HPC/Performance Baseline，在真实任务比较；不盲目全关节能。

基线至少包含 CPU 频率、DataLoader 等待、RDMA 进度、功耗和温度。切换 Profile 后做同一 workload 的 A/B 测试，确认收益来自供给改善而非更高的热 throttling 或功耗超限。

### Memory Channel 不均会降低本地带宽

DIMM 缺失/布局错误导致 Channel 不满，CPU-GPU 数据供给下降。到货验收检查容量、Channel Population、NUMA Bandwidth 和 Correctable Error。

容量相同不代表带宽相同，未按 OEM 通道布局安装会让内存交错失效。验收把 DIMM 槽位、每 Socket 容量和实测带宽写入节点基线，后续换条内存也要重新验证。

## 第 24 章 · GPU、PCIe 与互连 RAS

### ECC 检测并纠正显存位错误

Correctable Error 被修正并计数，Uncorrectable 可能影响数据/Context。Volatile 自启动/Reset，Aggregate 长期累计，语义随产品确认。

排障时同时记录 Volatile 与 Aggregate，避免把重启清零误判为故障消失。对持续增长、不可纠正错误或伴随 XID 的设备执行隔离和厂商规定的诊断，不在生产随意清除累计计数。

### Page Retirement 和 Row Remapping 延长可用寿命

检测问题位置后从可用空间映射出去。Pending 可能需 Reset/Reboot 才生效；Remap Spare 接近耗尽或 Failure 时安排更换。

Page Retirement 保护的是后续分配，不会修复已经产生的错误数据。记录 retired page 数量、pending 状态和 remap spare 趋势，结合负载后复发情况决定观察、重启还是 RMA。

### XID 把硬件和软件错误报告到 Kernel Log

分类只作为入口，结合 PID、Engine、ECC、PCIe/NVLink 和复发判断。维护当前 Driver 对应 XID Catalog，自动化映射 Severity 但允许人工覆盖。

同一 XID 在不同驱动和拓扑下可能对应不同故障域。告警事件保留首次时间、进程、GPU UUID、链路计数和节点状态；自动化只负责聚合和升级，最终维修结论必须有交叉证据。

### InfoROM 保存板卡信息和部分状态

InfoROM 校验/读取错误可能影响管理信息。健康检查发现异常时保存 `nvidia-smi -q` 和 Driver Log，由厂商判断 Firmware/Hardware 处理。

InfoROM 异常会让序列号、板卡信息或校准字段不可读，进而影响资产关联。不要直接写入或清除内容；先保存原始输出、设备身份和固件组合，再按 OEM 工具和授权流程处理。

### GPU Reset 能力受拓扑和活跃 Context 限制

NVLink/NVSwitch Group、MIG/vGPU 和 Fabric 可能要求一组设备共同 Reset 或不支持在线 Reset。必须 Drain、保存证据，按产品文档执行；失败转 Reboot/Power Cycle。

Reset 前确认没有活跃 Context、监控进程或其他依赖该 Fabric 的作业，并记录受影响 GPU 集合。Reset 后重新检查枚举、Fabric 状态、ECC/XID 增量和 P2P，再决定是否恢复调度。


### Link Training 在启动和恢复时协商参数

Gen/Width 协商失败可降级或设备缺失。BMC/BIOS/Kernel Log、`lspci` 和 Load Test 共同判断。一次重启恢复也要追踪是否复发。

冷启动、热重启和压力负载可能得到不同协商结果，因此要比较多个时间点的速率和宽度。降级链路即使没有立即报错，也会降低 H2D、P2P 或 RDMA 供给，应纳入容量和调度标签。

### AER Root Port 指向上游故障域

错误日志含 Requester ID/Severity/Layer。映射 BDF 树，看 Endpoint、Switch、Root。多个下游同时报错更可能上游/供电，不逐卡独立维修。

把 AER 事件按 Root Port、时间窗口和受影响设备聚合，区分 Correctable、Non-Fatal 和 Fatal。只有在上游路径稳定且故障随设备移动时，才把维修范围收窄到 Endpoint 卡本身。

### NVLink 错误按 Link ID 和 Remote Endpoint 追踪

保存两端 GPU UUID、Link ID、State/Counter 和 NVSwitch Port。单向/双向 Counter 语义核对版本；负载前后 Delta 定位。

计数器应在负载前后取快照并保留采样间隔，避免把历史累计值当成当前故障。将 Link ID 映射到物理端口和远端 UUID 后，再决定屏蔽单链路、隔离 GPU 还是停止整个 Fabric Group。

### NVSwitch SXid 是 Fabric 级事件

关联 Switch Physical ID、Port、FM/NVLSM Log 和所有受影响 GPU。Fabric Incomplete 时停止新多卡 Job，不能只屏蔽一个表面报错 GPU。

SXid 通常代表 Fabric 级初始化或运行时事件，影响范围可能超过单个 Endpoint。先保存 FM、NVLSM、BMC 和所有 GPU 状态，确认 Fabric 恢复并通过多卡通信测试后再解除调度隔离。

## 第 25 章 · DCGM Diagnostics、Burn-in 与维修决策

### 部署测试先验证软件环境

Driver Library、Device、权限和基本 API 不通过，不进入压力测试。失败节点保留 Log，防止 Burn-in 输出覆盖首错。

部署测试先回答“工具能否正确访问设备”，而不是证明硬件性能。记录驱动、权限、容器和设备节点信息；初始化失败时保留首个错误并转软件环境或设备枚举排查。

### Memory Test 覆盖分配、读写和错误检测

使用受支持 DCGM/厂商工具，不在生产自行编写破坏性 Pattern。测试期间记录 ECC/XID、温度、功耗和失败地址/阶段。

内存测试应在隔离节点运行，并明确测试占用显存、持续时间和停止条件。把错误发生的 GPU、地址区间和温度阶段与测试日志关联，避免只保留最终 PASS/FAIL。

### Compute Stress 验证持续时钟和数值

满载持续到热稳态，比较 Expected Throughput/Clock，检查错误。单纯让 GPU Utilization 100% 但不校验结果，无法发现 Silent Error。

计算压力测试同时验证数值结果、时钟稳定性、功耗和温度趋势。若吞吐随热稳态下降，应区分正常功耗管理与异常降频，并把同 SKU 健康节点作为对照。

### PCIe/NVLink Test 覆盖传输与错误增量

所有 Pair/Link 矩阵，负载前后 AER/NVLink Counter。多卡 Collective 补充真实并发路径。

单向带宽测试可能遗漏反向拥塞或共享交换路径，验收应覆盖方向、Pair 和并发组合。测试前后保存链路宽度、错误计数和拓扑快照，失败时才能判断是链路还是上游 Fabric。

### Burn-in 时间和阈值来自节点 SKU

新机、维修后、批量 Firmware 变更使用不同 Duration。阈值来自同批健康分布/OEM，记录环境温度和机架负载。

Burn-in 方案应写明预热、稳态、冷却和重启后的阶段，不能把任意跑满几分钟当作寿命证明。阈值与 SKU、散热条件和厂商保修要求绑定，批量离群节点先隔离再放行。


### Transient、Intermittent 和 Persistent 证据不同

Transient 单次且无法复现，保留观察；Intermittent 跨负载/时间复发，需扩大监控和换件定位；Persistent 每次测试失败，立即隔离维修。

分类依据应包含复现次数、负载类型、温度和时间间隔，而不是只看告警级别。Transient 也要设观察期限；Intermittent 需要保存原始计数器，Persistent 则优先保护数据和容量。

### Swap Test 一次只交换一个部件

PCIe 卡可在厂商允许时换槽/换节点：故障随卡走指向卡，留在槽位指向 Riser/Board。多组件同时换会失去因果；SXM/HGX 由 OEM 执行。

每次 Swap 前冻结软件和负载条件，交换后只改变一个变量并重复同一诊断。记录旧槽、新槽、序列号和测试结果，确保维修结论可复核且不把接触问题误判为卡故障。

### No Fault Found 不等于事件无效

维修时测试通过但生产有完整 XID/Counter/Job 证据，仍保留 Case 和观察。提高采样、复现特定热/通信负载，统计重复事件。

NFF 说明故障具有条件性，不说明原始事件不存在。将生产证据与维修环境差异列出，安排带有目标温度、通信拓扑或长时运行的复测，并设置明确的重新升级阈值。

### RMA 包含可重放证据

Serial、UUID、Node/BDF/Slot、Firmware/Driver、错误时间、XID/ECC/AER、DCGM Diag、复现步骤、维修历史和脱敏日志。避免只写“GPU 不稳定”。

RMA 包应能让第三方按相同环境重放问题，并清楚区分观察事实与推断。日志保留采集命令、时间基准和脱敏范围，避免厂商拿到无法定位上下文的孤立片段。

### 更换后重建资产和基线

更新 Serial/UUID、Firmware，检查 Topology、MIG/Fabric、DCGM、P2P/NCCL/RDMA 和 Burn-in。旧 UUID 告警/配额/CMDB 关闭并保留历史链接。

更换后的验收先验证身份和枚举，再验证链路、诊断和业务路径。只有观察窗口内无复发且性能回到同 SKU 基线，才解除 Drain；旧设备的历史记录仍保留用于重复故障分析。

## 第 26 章 · 备件、保修与硬件生命周期

### 备件按故障率、交期和故障域规划

GPU/Baseboard/NIC/PSU/NVMe/Cable 价值和更换时间不同。关键部件现场 Spare，昂贵 Baseboard 依赖厂商 SLA；数量用 Fleet Size、MTBF、Lead Time 和并发故障估算。

备件模型应按故障域和共享依赖计算，而不是只按 GPU 数量乘比例。把交期、保修覆盖、替代料兼容性和同时故障情景纳入容量模拟，并定期用实际维修率校准。

### Spare Node 比散件更快恢复业务

长训练可迁到完整 Spare Node，坏节点离线维修；成本高但缩短 RTO。Spare 定期上线更新/测试，防止需要时软件/硬件过期。

Spare Node 必须与生产镜像、驱动、固件和网络配置保持可用状态，并定期执行轻量 Burn-in。迁移 Runbook 明确 Checkpoint、数据可达性、租户通知和回迁条件，避免备用节点成为新的单点。

### 保修范围和人为操作边界写入 Runbook

未授权 Firmware、拆机、散热改造可能影响保修。变更审批核对 OEM 指南，现场照片/操作人/部件保存。

Runbook 还要规定防静电、断电确认、扭矩工具和旧件返还要求。任何超出 CRU 范围的动作由授权工程师执行，并在工单中保留批准和保修影响评估。

### 维修队列按业务风险排序

Fatal/数据风险、高复发、完整节点损失优先；可降级 Link 但已限制调度可排计划窗口。Dashboard 显示隔离 GPU、等待备件和容量影响。

排序同时考虑受影响队列、Checkpoint 恢复时间和替代容量。把“可运行但性能降级”与“不可安全运行”分开，避免只按告警数量决定维修先后。


### 选型阶段验证支持而非只看规格

目标 Framework/Driver/OS、Server/NIC/Storage、Power/Cooling 和 Serviceability。POC 使用生产候选完整节点，而非实验室不同形态卡。

选型评审把支持矩阵、备件交期、远程维护和机房功耗作为一等约束。POC 应使用目标并行规模、数据路径和故障演练验证可运维性，不能只用单卡峰值规格决策。

### 到货阶段执行 Inventory 与 Burn-in

逐台对 BOM、Firmware、外观、传感器、拓扑、健康和性能。同批离群先隔离，未通过节点不进入生产池。

到货验收为每台设备生成可追溯基线，包含 UUID、Serial、BDF、固件组合、链路宽度和诊断原始证据。发现同批离群时先冻结该批次放量，再由供应商和平台团队共同复核。

### 运营阶段做趋势与预防性维护

ECC/Remap/AER、Temperature/Fan、NVMe Wear、Power 和维修率按 Fleet 聚合。趋势触发清洁、散热、Firmware 或计划更换。

趋势分析应按 SKU、机架、固件和环境分层，避免把机房温度差异误判为部件老化。预防性维护动作要有阈值、责任人和复测结果，形成闭环而非只发告警。

### EOL 阶段处理软件支持和容量迁移

Driver/Framework 删除旧 Compute Capability 前迁移 Workload；逐步停止新租户，导出数据/模型，安全擦除和资产处置。

迁移计划列出兼容性、Checkpoint 格式、性能差异和租户截止时间。停止调度后仍保留只读验证窗口，确认模型、日志和资产数据已完成迁移，再执行擦除和报废流程。

### 数据擦除覆盖 Host Disk 与设备状态

NVMe/Boot Disk 使用组织标准擦除；GPU/vGPU/MIG Memory 在断电/Reset 生命周期下按厂商保证处理；BMC Credential、License 和 CMDB Identity 撤销。

擦除证据包括设备序列号、工具版本、时间和结果，失败时不得把设备直接交付或报废。带外账号、密钥、租户授权和监控令牌在资产退役前统一吊销并保留审计记录。

## 第 27 章 · Fleet 指标、硬件变更与验收门禁

### 健康覆盖率是第一项 Fleet SLI

```text
Telemetry Coverage = GPUs with fresh valid health data / Expected GPUs
```

没有数据的 GPU 单独 Unknown，不能算 Healthy。按 Node Pool/Driver/Exporter 观察缺口。

覆盖率计算要区分设备存在、采集成功和数据新鲜度，并按节点池、驱动和 Exporter 版本切片。Unknown 设备应从可调度容量中扣除或触发补采集，避免静默扩大风险。

### 故障率按 GPU Hour 归一化

```text
Incident Rate = Qualifying Incidents / GPU Operating Hours
```

不同 Fleet 规模可比较。定义 Qualifying Event、合并重复告警，区分用户 Kernel Error 和硬件事件。

事件分母使用实际运行 GPU Hours，分子按一次故障影响的设备和时间窗口去重。指标旁边保留事件分类与排除规则，防止驱动升级产生的重复告警扭曲趋势。

### MTTR 拆分检测、隔离、诊断、等待备件和恢复

总 MTTR 高可能不是维修慢，而是无备件或恢复验收排队。分阶段优化，不能只要求 On-Call 更快。

把 Detect、Isolate、Diagnose、Spare Wait、Repair 和 Validate 分成时间桶，分别设目标。阶段数据能揭示真正瓶颈，例如证据采集慢、厂商响应慢或验收队列积压。

### Repeat Failure 关联节点、槽位和部件

新 GPU 在同槽位复发指向系统路径，同一 GPU 跨槽复发指向卡。CMDB 历史关系使统计可用。

重复故障分析至少关联节点、槽位、Riser、固件批次和维修动作。只有保留更换前后的身份关系，才能区分“坏卡反复回来”和“同一槽位持续损坏”。

### 性能离群也是硬件运营信号

无错误但持续低 Clock/PCIe/NCCL 的节点按同 SKU 分布检测。排除背景负载/配置后，进入预防维修。

性能离群先与同 SKU、同 workload 和同功耗条件比较，再检查降频原因、链路宽度和 CPU 供给。无错误不等于健康，持续离群应降低调度优先级并安排复测。


### BIOS/Firmware 变更映射重测范围

PCIe/CPU/Power 相关重测 Topology/H2D/P2P/Power；GPU/NVSwitch 重测 Fabric/NCCL；NIC 重测 RDMA/RoCE；BMC 重测 Sensor/Power Control。

重测范围按变更影响图确定，并保留未变更的对照节点。每项测试记录版本、阈值、原始输出和通过时间，避免“命令跑过”被误认为链路和业务都已验收。

### 维修后测试强度按部件扩大

换 GPU 测单卡+所有相关 Link；换 Baseboard 测整节点；换 NIC 测所有 Port/Rail；换 PSU/冷却测持续满载。关联路径而非固定一套最小测试。

测试组合应覆盖更换部件的直接功能和共享依赖，尤其是供电、散热、Fabric 与 NUMA 路径。失败时保留首次失败证据并停止扩大负载，防止维修动作制造二次损伤。

### Canary 代表所有硬件 Revision

同 SKU 有不同 Revision/Firmware 时，每组至少一个 Canary。只测最新批次无法代表旧 Fleet。

Canary 分层依据应包括硬件 Revision、固件 Bundle、驱动分支和机架环境。任何一层组合没有代表样本，都不能把 Canary 结果推广到整批节点。

### 通过后保留观察窗口

恢复节点先进入低风险/Canary Queue，观察错误和性能，再进入关键大训练。窗口长度按错误间歇性和业务风险。

观察窗口内持续采集 XID、ECC、AER、温度、功耗和业务吞吐，并设置自动回退条件。间歇性故障需要覆盖其历史复发周期，不能只凭一次短测解除隔离。

### 变更报告更新可调度能力

若节点只能 Degraded 运行，更新 GPU Group、Fabric Tier、Power/性能基线和 Admission。不要让文档知道降级而 Scheduler 仍按完整能力分配。

变更报告应同步 CMDB、监控、调度标签和租户可见容量。降级节点可承载的 workload、并行规模和 SLO 要明确，避免调度器把不可满足的任务继续放入。

## 第 28 章 · 维修工单与命令安全分级

### 现象使用可观察事实

时间、业务影响、GPU UUID/BDF/Slot、XID/ECC/AER/Link、性能差异和复发次数，不只写“卡坏了”。

现象字段应能让未参与当班的人复原故障窗口：何时开始、影响哪些 Job、哪些设备仍正常、错误是否持续。把观察事实与初步判断分栏，避免标题先把责任归给 GPU。

### 环境记录完整版本组合

Node SKU/BOM、BIOS/BMC/Firmware、OS/Kernel/Driver/FM/OFED、Power/Cooling 和最近变更。

版本组合要带采集时间和镜像 Digest，硬件则带 Revision 与拓扑位置。最近变更按时间排序，便于把首次异常与固件、驱动或布线操作关联起来。

### 首次证据不可覆盖

Kernel/BMC/FM/DCGM/应用日志、Counter Before Reset、图片/布线；后续操作单独追加时间线。

首次证据应只读归档并计算校验值，任何裁剪或脱敏都记录规则。Reset、重启和换件前先抓快照，避免最有价值的故障状态被后续操作覆盖。

### 复现条件可重放

工具/镜像 Digest、命令、负载、持续时间、温度/功耗、GPU Pair/Rank；敏感数据用等价最小负载。

复现记录还应说明节点放置、CPU Affinity、网络 Rail 和随机种子。将生产数据替换为最小等价负载时，验证其仍触发同一错误类别，不要为了脱敏改变故障条件。

### 已做操作和结果逐项列出

重启/Reset/换槽/换件/Firmware/对照，每次前后结果；避免重复高风险操作。

每一步写明执行人、开始结束时间、预期、实际结果和下一步条件。对于可能扩大影响的动作设最大尝试次数，连续失败后转交更高等级或 OEM，而不是无记录反复重试。

### 故障归属假设与反证

GPU、Slot/Riser、Baseboard、Power/Cooling、Driver/应用候选，哪些证据支持/排除，未确定项明确。

故障树用可验证证据逐项收敛：例如错误是否随卡移动、上游是否同时报错、换镜像后是否消失。未确定项保留待验证动作和负责人，不把概率最高的假设写成结论。

### 业务隔离和容量影响

节点 Drain/Taint、不可用 GPU/Group、受影响 Queue/SLO、临时降级和预计维修时间。

容量影响要换算为可运行的 GPU 数、并行组缺口和预计排队时间，并同步调度器标签。业务隔离动作先于硬件操作，避免维修过程中仍有 Job 持有 Context 或写入设备。

### 备件和保修状态

Serial/Entitlement、FRU/CRU、现场 Spare、RMA Case/ETA、允许操作和厂商联系人。

备件状态应区分可立即使用、待测试、运输中和保修争议。工单给出 ETA 和替代路径，防止现场人员在没有授权或没有回退件时开始拆装。

### 修复动作有审批与停止条件

断电/拆机/Firmware/Reset、负责人、窗口、最大影响、失败回退。未 Drain 不执行。

停止条件包括带外失联、温度或功耗异常、首个测试失败以及影响范围超出批准值。执行前核对 Drain、备份和远程控制，执行后按预定顺序恢复服务并回填证据。

### 更换部件更新身份

旧新 Serial/UUID/Firmware/Slot、CMDB/监控/License/资源映射和资产流转。

身份更新必须原子完成，避免新卡已上线但监控仍绑定旧 UUID，或旧许可证继续占用。保留旧新关系、安装时间和工单号，便于后续计算部件寿命与重复率。

### 验收引用测试 Run

Inventory/DCGM/Burn-in/Topology/P2P/NCCL/RDMA/业务、结果/阈值/原始证据和观察窗口。

验收引用具体 Test Run、版本和原始日志路径，而不是只写“测试通过”。对未执行项目注明原因与风险，观察窗口未结束时状态保持 Conditional，不提前关闭工单。

### 关闭条件包含无复发

恢复调度时间、Canary/关键业务、Counter/性能趋势；间歇故障未覆盖触发周期只做条件关闭。

关闭条件还应包含资产、监控、调度和租户通知均已更新。若仍存在未覆盖的复发窗口，工单标记为观察中并设置复查日期，避免短期稳定被误报为永久修复。


### 只读查询默认可用于第一现场

Inventory、状态、日志和 Counter 查询不改变设备配置，但仍可能有权限、输出量和敏感信息风险。采集脚本设置超时、大小和脱敏。

第一现场先固定目标范围：节点、GPU UUID 或作业 ID，避免在共享集群上把别的租户数据混入证据。查询结果要保留命令、退出码和采集时间；对 `journalctl`、`nvidia-smi -q` 这类可能很大的输出设置大小上限，并在外发前移除主机名、路径和业务参数。

### 负载测试需要独占资源和停止条件

DCGM Diagnostics、P2P/NCCL/RDMA/Storage/Burn-in 会占 GPU、网络、磁盘或功耗。Cordon/Drain 或测试队列，确认目标和最大影响。

执行前应声明资源锁、预计持续时间和终止条件，例如温度、功耗、错误计数或延迟超过阈值立即停止。测试日志应同时记录开始和结束时的健康快照，才能区分测试诱发的问题与原有问题；没有独占确认时，不把生产作业的偶然空闲当作可测试许可。

### 状态修改必须进入维护流程

Power/Clock/MIG、Reset、Module/Service、Network QoS、Firmware、Reboot/Power Cycle 都会中断或改变证据。本文只描述边界，不把破坏命令做默认步骤。

维护单至少包含影响对象、审批人、回滚动作和验证项。修改前先保存原配置与当前健康状态，修改后按相同命令复采，并验证设备重新注册、作业准入和拓扑路径；若证据需要解释故障，不应先 Reset 或清除 Counter，以免丢失时间线。

### 每次采集有时间、目标和版本

输出前写 ISO Timestamp、Hostname/Node、GPU UUID/BDF、Tool/Driver；多节点时钟同步。命令文本和 Exit/Timeout 一起保存。

建议把上下文写入每个文件的旁车 `manifest`，并用统一时区记录事件。命令超时、权限拒绝和空输出都是证据的一部分，不能只保存成功文件；多节点采集应使用同一批次 ID，便于按时间和 Rank 对齐。

## 第 29 章 · GPU Inventory、Driver 与 Kernel 证据入口

### 列出 GPU 和 UUID

```bash
nvidia-smi -L
```

证明 Driver/NVML 当前能枚举 GPU/MIG；不证明 CUDA Framework、性能和健康。与 CMDB 期望数量比较。

`index` 只适合本机即时引用，跨重启、容器或 MIG 场景应以 UUID、Serial 和 BDF 为稳定身份。若枚举数量与 CMDB 不符，先记录命令版本、`CUDA_VISIBLE_DEVICES` 和容器设备映射，再判断是硬件缺失、驱动未加载还是视图被隔离。

### 查询型号、UUID、BDF 和能力

```bash
nvidia-smi --query-gpu=index,uuid,serial,name,pci.bus_id,compute_cap,memory.total,driver_version --format=csv
```

字段支持随版本变化，`N/A` 不转 0。容器内 Index 可能重排，UUID/BDF 用于跨层。

### 查看详细 GPU 状态

```bash
nvidia-smi -q
```

保存 Power/Clock/ECC/Fabric/Process 等快照。输出很长，可按 `-d` 选择 Display Group，但完整事件首次采集保留全量。

详细查询适合做“前后对照”：负载前、异常发生后和恢复验证各取一次。对 Counter 记录累计值与采集时刻，后续用差值计算事件窗口；不要把一次快照中的高温、低时钟直接当作故障结论。

### 查看 PCIe 设备

```bash
lspci -Dnn | egrep -i 'nvidia|mellanox|ethernet|infiniband'
lspci -t
```

第一条盘点 Endpoint，第二条展示树。`lspci` 无 GPU 指向枚举/硬件层，不能靠重装 CUDA 修复。

把 BDF 与 `nvidia-smi` 的 PCI Bus ID 交叉匹配，可发现设备被 BIOS、PCIe 热插拔或 IOMMU 视图隐藏的情况。拓扑树只说明连接关系，仍需结合 Link State、驱动日志和实际 P2P 测试确认数据面。


### 检查加载模块和版本

```bash
lsmod | rg '^nvidia'
cat /proc/driver/nvidia/version
modinfo nvidia | head -20
uname -r
```

比较 Loaded Module、磁盘 Module 和 Kernel。`modinfo` 存在不表示模块已成功加载。

### 检查设备节点

```bash
ls -l /dev/nvidia* /dev/nvidia-caps 2>/dev/null
```

确认 Major/Minor/Permission。节点存在不证明容器 Cgroup 允许，也不证明 GPU 响应。

### 检查内核首错

```bash
journalctl -k -b --no-pager | rg -i 'NVRM|XID|AER|PCIe|nvidia'
dmesg -T | rg -i 'NVRM|XID|AER|PCIe|nvidia'
```

权限和日志持久化依系统。保存最早错误及上下文，不只 `tail` 最后一条。

### 检查用户态库

```bash
ldconfig -p | rg 'libcuda|libnvidia-ml'
ldd "$(command -v nvidia-smi)"
```

识别 NVML/Driver Library 路径和 Missing SONAME。Library 存在不证明版本与 Module 匹配。

## 第 30 章 · 性能、ECC、XID 与硬件健康证据入口

### 结构化查询性能快照

```bash
nvidia-smi --query-gpu=timestamp,uuid,pstate,temperature.gpu,power.draw,power.limit,clocks.sm,clocks.mem,utilization.gpu,utilization.memory,memory.used,memory.total --format=csv
```

解释要结合负载阶段。空闲低 Clock/Power 正常，高 Util 不是有效吞吐。

### 秒级观察 GPU 波形

```bash
nvidia-smi dmon -s pucvmet -d 1 -c 60
```

短时现场关联，Group 支持查帮助。长期用 DCGM/Prometheus；终端平均不保留历史。

### 观察进程级活动

```bash
nvidia-smi pmon -s um -c 60
nvidia-smi --query-compute-apps=pid,gpu_uuid,process_name,used_memory --format=csv
```

关联 PID/GPU/Memory。容器 PID Namespace、MIG/MPS/HAMi 归属需结合平台元数据。

### 修改 Power/Clock 的边界

相关 `nvidia-smi` 设置会改变性能和机架功率，只在维护/实验计划执行，记录原值和恢复验证。不能为了让 Benchmark 好看临时修改后不披露。


### 从详细查询读取 ECC 和 Remap

```bash
nvidia-smi -q -d ECC,PAGE_RETIREMENT,ROW_REMAPPER
```

支持项随 GPU 变化。区分 Volatile/Aggregate、Correctable/Uncorrectable、Pending/Failure；保存 Counter 不先清零。

分析时先按 GPU UUID 和采集窗口对齐 Counter，再看是否伴随 XID、AER、降频或作业错误。Correctable 的累计增长与 Uncorrectable、Page Retirement 或 Row Remap 的组合含义不同；在没有基线和时间序列时，只能报告“观察到计数”，不能直接判定需要换卡。

### XID 从 Kernel Log 读取

```bash
journalctl -k -b --no-pager | rg 'NVRM: Xid'
```

编号按当前 Driver/GPU Catalog 解释，关联 UUID/BDF/PID/ECC/AER/应用首错。不是所有 XID 都是坏卡。

保留 XID 前后完整内核上下文，记录发生时的作业、温度、功耗和 PCIe/RDMA 状态。相同编号可能由软件调用、链路异常或硬件故障触发，处置应先依据首个异常和可复现实验分级，而不是见到 XID 就重启节点。

### DCGM Discovery 和 Health

```bash
dcgmi discovery -l
dcgmi health -c
```

发现 DCGM Entity 和已配置 Health 状态。设置 Health Watch 的命令会改变监控配置，由平台统一管理。

Discovery 结果用于确认 GPU、CPU、NIC 等实体是否被 DCGM 识别；Health 结果则是已启用检查的当前视图。采集时同时记录 DCGM Hostengine/Client 版本和实体 ID，避免不同节点因配置差异产生不可比的“通过”。

### DCGM Diagnostics 是负载动作

```bash
dcgmi diag -r 1
```

短等级示意，仍可能占 GPU。高级诊断必须 Drain、热/功率停止条件；实际参数按版本文档。

诊断结果应与运行前后的 ECC、XID、温度和功耗快照绑定，记录测试级别、持续时间和失败阶段。若诊断在中途超时，报告“未完成”并保留已产生的错误，不把超时改写成通过或硬件结论。

## 第 31 章 · CPU、NUMA、PCIe 与 Fabric 证据入口

### 查看 CPU/NUMA

```bash
lscpu -e=cpu,node,socket,core
numactl --hardware
```

显示 Host 拓扑和内存容量/距离；不表示应用实际绑定。

把 NUMA 节点与 GPU/NIC 的 PCIe 归属放在同一张记录中，才能判断 CPU 线程和内存是否走了远端路径。静态拓扑只是准入条件，仍需结合进程的 `Cpus_allowed_list`、内存页分布和作业启动参数确认运行时是否遵守绑定。

### 查看进程 CPU 和 NUMA

```bash
taskset -pc <pid>
grep Cpus_allowed_list /proc/<pid>/status
head -50 /proc/<pid>/numa_maps
```

需要目标 PID；`numa_maps` 抽样不能代替完整页汇总。容器内外 PID 映射确认。

### 查看 PCIe Link 能力

```bash
lspci -s <bdf> -vv
```

关注 `LnkCap/LnkSta` Speed/Width、AER。空闲节能可能降 Speed，负载后重查；Width 降级重点调查。

### 查看 GPU 拓扑矩阵

```bash
nvidia-smi topo -m
```

读取 GPU-GPU、GPU-NIC、CPU/NUMA 和 Legend。矩阵是声明/发现，需 P2P/NCCL 实测。

采集时保留完整矩阵和驱动版本，避免只截取某一行造成方向误读。矩阵中的 `SYS`、`PHB`、`NV#` 等标签描述路径层级，不等于应用一定选择该路径；对关键 GPU 对还应保存 P2P 带宽或 NCCL 基准结果。


### 查看 NVLink 状态和能力

```bash
nvidia-smi nvlink --status
nvidia-smi nvlink --capabilities
```

按 GPU UUID/Link ID/Remote 保存，选项随版本。Active 不证明无错误/性能达标。

### 查看 Fabric Manager 服务

```bash
systemctl status nvidia-fabricmanager --no-pager
journalctl -u nvidia-fabricmanager -b --no-pager
```

服务名依安装。对照 Driver/FM Version、GPU Fabric State 和初始化阶段。

### 查看 GPU Fabric 详细状态

```bash
nvidia-smi -q | rg -n 'Fabric|Status|Clique|Health'
```

过滤用于导航，事件证据保留完整 `-q`。字段/缩进随 Driver 变化，不用脆弱文本解析做唯一控制。

### Reset/重启 Fabric 的边界

会影响完整 GPU/Fabric Group。保存证据、Cordon/Drain、确认无 Context、按 OEM/NVIDIA 流程；恢复后全矩阵 P2P/NCCL。

Reset 前需确认没有持久化服务、MIG 实例或其他租户仍持有 Context，并记录操作前后的 Fabric Manager 日志。恢复验收至少包括 GPU 枚举、NVLink/Fabric 状态、拓扑矩阵和短时通信 Smoke；任一项未通过时保持节点隔离。

## 第 32 章 · RDMA、网卡与 NCCL 证据入口

### 查看 Netdev 和 RDMA Link

```bash
ip -br link
rdma link show
ibstat
```

关联接口、HCA Port、State/Rate。Link Active 不证明 GID/Route/RDMA 数据面。

同一物理端口可能以 Netdev、RDMA Device 和交换端口多个名字出现，证据中应保留映射关系。跨节点排障要在两端采集，单端 `rdma link show` 无法说明对端端口、VLAN 或交换机配置。

### 查看 Verbs 设备和 GID

```bash
ibv_devinfo -v
show_gids
```

记录 Device/Port/GID Index/RoCE Version/IP/VLAN。工具包和输出依发行版。

GID 选择必须和应用使用的地址族、VLAN 与 RoCE 配置一致；只看到一个 GID 并不表示所有路径可用。把 `ibv_devinfo`、`show_gids` 输出与 NCCL 选择的 HCA/GID 日志关联，能区分 verbs 能力问题和上层选路问题。

### 查看接口和 RDMA Counter

```bash
ip -s link show <iface>
ethtool -S <iface>
rdma statistic show
```

测试前后取 Delta，筛 CRC/Drop/Discard/PFC/ECN/Retry；Counter 名称依 NIC Driver。

### 检查 MTU 和 Route

```bash
ip -d link show <iface>
ip route get <peer-ip>
ping -M do -s <payload> <peer-ip>
```

Payload 按 IPv4/IPv6/Header 计算。Ping 只验证 IP Path，不证明 RDMA Path MTU/QoS。


### 开启最小 INFO 日志

```bash
NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,GRAPH,NET <launcher-command>
```

观察 Bootstrap、Topology、Transport、HCA/GID/Channel。多 Rank 文件分开且限额；版本支持查文档。

### 单节点 AllReduce 示例

```bash
./build/all_reduce_perf -b 8M -e 4G -f 2 -g 8
```

负载型命令，占用 8 GPU；参数按节点调整。AlgBW/BusBW、错误和 Link Counter 一起保存。

### 多节点必须记录 Launcher

MPI/Slurm/Kubernetes 启动命令、Node/Rank/GPU per Process、Environment/Interface 和 Image。仅保存 nccl-tests 参数无法重放 World。

### 禁用路径只做短时二分

禁 P2P/IB/GDR、限定 HCA/Algorithm 都改变性能。记录假设/原值/结果/恢复，不作为永久“稳定配置”。

二分实验一次只改一个变量，并固定消息大小、进程布局和运行次数。若禁用某路径后错误消失，只能说明该路径参与故障，仍需回到拓扑、链路 Counter 或驱动日志寻找根因；实验完成后删除临时环境变量并复查默认路径。

## 第 33 章 · CUDA、Framework、Runtime 与 CDI 证据入口

### 区分 Driver 能力和 Toolkit

```bash
nvidia-smi
nvcc --version
```

前者显示 Driver 支持上限提示，后者是本地 Compiler Toolkit；应用实际 Runtime 由进程/容器 Library 决定。

### PyTorch 最小检查

```bash
python -c 'import torch; print(torch.__version__, torch.version.cuda, torch.cuda.is_available(), torch.cuda.device_count())'
```

先确认 CUDA Build/可见性；真实算子和 Extension 另测。输出 False 时检查首个 Warning/Error。

### 动态依赖检查

```bash
ldd /path/to/extension.so
readelf -d /path/to/extension.so | rg 'NEEDED|RPATH|RUNPATH'
```

定位 Missing/Symbol Search。路径含业务信息，外发脱敏。

### Loader Debug 仅最小复现

```bash
LD_DEBUG=libs python -c 'import torch; print(torch.cuda.is_available())' 2>loader.log
```

输出巨大且降速，不在生产长任务全量开启。确认实际加载 `libcuda`/CUDA-X 路径。


### 查看 containerd Effective Config

```bash
containerd config dump
crictl info
```

证明 Runtime 当前读取配置；磁盘文件未生效/路径错误可由此分界。输出可能含 Registry 配置，脱敏。

应同时记录 containerd 版本、配置文件来源和 GPU Runtime Handler。`config dump` 是当前进程的 Effective Config，不能替代节点上实际重启后的验证；修改后必须在测试节点重启或重新加载并运行最小 GPU Pod。

### 查看 RuntimeClass

```bash
kubectl get runtimeclass
kubectl describe runtimeclass <name>
```

确认 Handler 名，不能证明节点 containerd 已配置；需最小 Pod。

### 查看 CDI 设备

```bash
nvidia-ctk cdi list
```

只读列出 Qualified Device。生成 Spec 命令会写文件，由 Operator/变更流程管理。

将 CDI 名称与节点上实际的 `/dev`、库挂载和 GPU UUID 对照，避免“CDI 有条目但指向旧设备”的假成功。多节点采集 CDI 列表和生成时间，发现配置漂移后再进入 Operator 或配置管理流程修复。

### 最小容器测试

使用组织固定 Digest 的 CUDA Smoke Image，显式请求一张 GPU，输出 UUID/简单计算。公共示例 Tag 不作为生产证据。

Smoke 应验证三层结果：容器能启动并获得设备、Framework 能建立 CUDA Context、一个小算子能完成。保存镜像 Digest、Pod YAML 摘要、节点名和 UUID；仅打印 `nvidia-smi` 版本不足以证明运行时库和设备访问完整。

## 第 34 章 · Kubernetes、MIG 与 HAMi 资源证据入口

### 查看 Node Capacity/Allocatable

```bash
kubectl get node <node> -o jsonpath='{.status.capacity}{"\n"}{.status.allocatable}{"\n"}'
```

与物理/GFD/Plugin 比较。资源存在不证明每张设备健康或拓扑满足。

### 查看 GPU Operator 组件

```bash
kubectl get pods -n <gpu-operator-namespace> -o wide
kubectl get clusterpolicy
```

Namespace/CR 名依安装。Running 后继续查版本、Validator、Node Label 和日志。

### 查看 Pod 调度和分配事件

```bash
kubectl describe pod <pod> -n <namespace>
kubectl get events -n <namespace> --sort-by=.lastTimestamp
```

事件保留有限，及时保存；按 Queue/Quota/Resource/Topology/Runtime 分类。

### 查看 Node Label/Taint

```bash
kubectl describe node <node>
```

输出大但包含 Capacity/Allocated/Event/Condition。人工修改 Label/Taint 是状态变更，需 Workflow。


### 查看 MIG 状态和实例

```bash
nvidia-smi -L
nvidia-smi mig -lgip
nvidia-smi mig -lcip
```

只读列能力/实例。启停 Mode、创建/销毁实例是维护动作，需 Drain。

### 核对 Kubernetes MIG 资源

查看 Node Capacity、GFD Label、Device Plugin Strategy 和实际 Smoke Pod，关联 Parent/MIG UUID。Physical Layout 与资源名都要一致。

### 核对 HAMi 分配链

Pod Request/Annotation、Scheduler/Device Plugin Log、Assigned UUID、HAMi-Core Mapping、Process Memory 和 Physical Total。具体资源键按部署版本。

排查时从调度声明一路追到进程可见设备，逐层记录“请求值、分配值、实际使用值”。若逻辑配额与物理显存或计算占用不一致，应先确认 HAMi 的隔离策略、采样时刻和其他进程，再判断是否为超卖或监控口径差异。

### 共享干扰用双工作负载测试

基线租户固定请求，邻居逐步 Memory/Compute/Crash，记录 P99/Step/OOM/XID。测试占资源，在隔离节点执行。

每个干扰级别至少保留基线窗口和恢复窗口，并固定模型、Batch、频率策略和邻居放置。把租户标识脱敏后写入 manifest；出现 OOM、XID 或 P99 超阈值时立即停止增加压力，避免把实验变成不可控故障。

## 第 35 章 · Storage、主机 I/O 与调度器证据入口

### 查看 CPU/Memory/Disk 活动

```bash
pidstat -u -r -d -p <pid> 1
iostat -x 1
```

Host 现场观察；容器 Cgroup/共享 Disk 和 Storage Backend 还需平台指标。高 IO 相关不等于根因。

### 查看文件系统容量和 Inode

```bash
df -hT <path>
df -ih <path>
```

只显示客户端 Mount 视角，Quota/Snapshot/Backend 另查。测试目标路径而非 `/` 泛查。

### fio 写测试是破坏性负载

仅对明确专用测试文件/卷，固定 Size/Block/Depth/Jobs/Direct，审核路径，结束清理。绝不指向设备/生产 Dataset。

写测试前确认挂载点、剩余空间、配额和文件归属，并让 `fio` 使用新建的测试文件。报告中记录实际命令、测试文件路径和清理结果；任何无法证明为专用卷的目标都应拒绝执行。

### Checkpoint 完整性以 Manifest/Load 验证

Shell 看到文件大小不够，使用框架恢复测试、Checksum/Commit Marker；记录 World/Version 和 Load Time。

分布式 Checkpoint 还要验证 shard 数量、索引或元数据是否与当前 World/并行策略兼容。恢复失败时区分文件缺失、校验不一致、版本不兼容和网络/存储超时，保留首个错误与恢复耗时，而不是只报告“目录存在”。


### 查看队列与原因

```bash
squeue -l
scontrol show job <job-id>
```

保存 State/Reason/Node/TRES/Time/Command 摘要；命令参数可能敏感。

### 查看节点和 GRES

```bash
scontrol show node <node>
```

Configured/Allocated GRES、State/Reason、Partition。与 `nvidia-smi`/CMDB 比较。

### 查看作业 Accounting

```bash
sacct -j <job-id> --format=JobID,JobName,State,ExitCode,Elapsed,AllocTRES,NodeList
```

连接 Attempt/Step/Exit/资源；GPU Activity 需 DCGM/集成指标。

### Drain/Resume 是状态修改

由维护/故障 Workflow 执行，Reason/Owner/Incident 和恢复验收。不要为清理队列随意 Resume 未修复节点。

Drain 前确认没有新作业继续分配，Resume 前复查 GPU、网络、存储和运行时 Smoke，并把验收结果写入同一 Incident。若节点仍有未解释的 XID、ECC 增长或拓扑异常，应保持 Drain 并升级处理。

## 第 36 章 · 证据包目录与禁止的证据捷径

### manifest 保存采集上下文

Incident/Run ID、Time、Cluster/Node/GPU、Tool Version、Commands/Exit、Redaction、Checksum。

`manifest` 是证据包索引，不承载大段原始输出。除上述字段外，建议记录采集器版本、时区、超时和文件相对路径；每个文件生成校验和，包被复制或脱敏后重新校验，避免后续无法证明内容是否改变。

### inventory 保存稳定身份

GPU/NIC/CPU/Memory/PCIe/NVLink/NVSwitch/Storage/BMC，UUID/Serial/BDF/Rack 和期望对照。

Inventory 记录的是相对稳定的身份与期望状态，适合回答“这是谁、应该有什么”。采集时将物理身份与 Kubernetes、Slurm 或 CMDB 标识分开保存，并注明缺失字段和查询时间；不要用容器内重排的 GPU index 覆盖 UUID/BDF。

### health 保存错误与环境

ECC/XID/AER/Link/DCGM、Temperature/Power/Clock、Kernel/BMC/FM，首次和负载前后。

Health 文件应保留原始错误行及其上下文，同时保存结构化快照，便于计算 Counter Delta。把“未采集”与“无错误”区分开；例如 DCGM 不可用时不能把空结果写成健康通过。

### workload 保存业务与分配

Pod/Job/Rank/Tenant、Image/Model/Data/Config、GPU UUID/HCA、阶段/吞吐/延迟/首错。

Workload 证据连接业务影响和基础设施状态。配置或数据路径含敏感信息时保存脱敏摘要、版本和校验和；分布式作业要记录 Attempt、World、Rank 映射，单个 Pod 的状态不足以重建全局行为。

### network 保存端到端路径

Interface/HCA/GID/MTU/Route/Rail/Switch Port、Counter Before/After、RDMA/NCCL。

Network 文件应同时覆盖控制面可达性和数据面结果。把接口、HCA、GID、Rail 与节点/端口的映射固定下来，并对 Counter 计算测试窗口 Delta；只有单端 Link 或 Ping 输出时，结论范围应明确标为部分证据。

### storage 保存 I/O 和完整性

Mount/Quota/Capacity、Client/Backend Latency/Error、Dataset/Checkpoint/Model、Checksum/Restore。

Storage 证据要区分客户端看到的文件系统视角和后端服务视角。记录挂载参数、配额、读写错误、Checkpoint Manifest 及恢复结果；容量充足但延迟或后端错误异常时，不能以 `df` 正常结束排查。

### timeline 合并跨系统事件

Last Healthy、First Deviation/Error、Application Impact、Alert、Isolation、Action、Validation、Recovery，统一时区。

时间线按事件发生时间排序，而不是日志到达时间。对每个节点和作业保留时钟偏差、采集延迟及状态变更人，明确“首错”与“后续连锁错误”；这能避免把重启后的恢复日志误当成根因发生时刻。

### conclusion 只写证据支持范围

Confirmed/Probable/Unknown、替代解释、已排除、下一实验。命令输出正常不自动证明整层健康。

结论应逐条引用证据文件和时间窗口，并写出尚未验证的假设。下一实验要说明单一变量、目标指标和停止条件；若证据互相矛盾，保留矛盾本身，不用一句“环境正常”强行收敛。


### `nvidia-smi` 成功不等于 CUDA 正常

还需容器/Framework/Kernel/真实工作负载。它主要证明 NVML 管理路径。

最小闭环应从主机枚举、容器设备注入、Framework Context 到一个真实 CUDA 算子逐层验证。任一层失败都要记录首个错误和层级边界，避免把管理工具成功误报为应用可用。

### GPU Utilization 高不等于性能好

可能小 Kernel、分支、Memory/通信、节流。用业务吞吐和时间分解。

把 GPU Utilization 与 SM、Tensor Core、Memory、通信和空闲等待放在同一时间轴，再对照 Samples/s、Tokens/s 或 Step Time。高利用率伴随低吞吐时，优先检查 Kernel 形状、同步点、数据供给和功耗/温度节流。

### Memory Used 高不等于带宽满

驻留权重/Cache 占容量，DRAM Activity/Bytes 才解释搬运。

显存容量指标描述“放了多少”，不是“搬了多快”。要结合内存控制器利用率、读写吞吐、Kernel 时间和 Host/Device 拷贝，区分模型常驻、缓存、碎片与真正的带宽瓶颈。

### Link Active 不等于无错误

负载下 Counter/带宽/延迟和路径测试。

NVLink、Fabric 或 RDMA 的 Active 状态只说明链路已建立。应在目标消息大小和并行布局下做短时路径测试，同时比较错误计数、重传、带宽和延迟；空闲时通过不代表负载时没有降级或拥塞。

### Ping 成功不等于 RDMA 正常

QP/MR/GID/QoS/GDR/NCCL 逐层验证。

Ping 只覆盖 ICMP 控制路径，不能证明 verbs 能创建 Queue Pair、Memory Region 注册成功，也不能证明 RoCE QoS、GPU Direct 或 NCCL 选到了同一 HCA。排查应从 GID/MTU 到 `ib_write_bw` 或 NCCL Smoke 逐层推进。

### Pod Running 不等于 GPU 已交付

Resource/Allocate/CDI/Device/Framework 和简单计算。

Pod 状态只反映 kubelet 生命周期。证据链还要确认申请资源、Device Plugin 分配、CDI/运行时挂载、容器内 UUID 与 Framework Context；任何一层缺失都应把结论限定为“Pod 已运行但 GPU 交付未证实”。

### Operator Ready 不等于所有节点一致

逐节点 Operand Version/Validator/Resource/Smoke 和旧组件残留。

Operator 的聚合 Ready 可能掩盖单节点 CrashLoop、旧 DaemonSet 或标签漂移。按节点保存 Operand 镜像 Digest、Validator 结果、资源数量和 Smoke UUID，再与期望版本做差异比较。

### Benchmark 最佳一次不等于基线

多轮分布、固定环境、健康/错误、原始数据和阈值来源。

基线至少包含预热、稳定窗口和多次重复，报告中保留均值之外的分位数与异常轮次。节点健康、频率、拓扑、驱动、镜像和数据集必须固定；阈值应注明来自历史基线、容量目标还是用户协议。

### 重启恢复不等于根因消失

错误/性能路径、负载和观察窗口；反复重启转维修。

重启只是改变状态并可能清空瞬态证据。恢复后应在相同负载下复测错误计数、链路、吞吐和延迟，并设定观察窗口；若 XID/ECC/降速重复出现，应停止循环重启，转入隔离、换卡或厂商诊断流程。

### 告警消失不等于节点可恢复调度

Telemetry 可能消失，必须恢复准入和事件批准。

告警消失可能只是 Agent、Exporter 或网络恢复，不能替代节点准入检查。Resume 前确认监控数据连续、硬件与运行时 Smoke 通过、未有未关闭 Incident，并由责任人批准恢复调度。
