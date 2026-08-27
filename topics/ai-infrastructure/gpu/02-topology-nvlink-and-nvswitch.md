# GPU AI Infrastructure 学习笔记 · Topology / NVLink / NVSwitch

## 第 1 章 · GPU 服务器不是等距资源池

### PCIe Root Complex 和 NUMA 构成设备本地性

多路 CPU 服务器通常有多个 NUMA Node。每个 CPU Socket 管理一组本地内存和 PCIe Root Complex，GPU、NIC、NVMe 可能分别挂在不同 Root Port 或 PCIe Switch 下。同一 NUMA 域内的访问路径通常更短，跨 Socket 则可能经过 CPU 间互连并增加延迟。

```mermaid
graph TD
    C0[CPU Socket 0] --> M0[Memory 0]
    C0 --> R0[PCIe Root 0]
    R0 --> G0[GPU 0]
    R0 --> G1[GPU 1]
    R0 --> N0[NIC 0]
    C1[CPU Socket 1] --> M1[Memory 1]
    C1 --> R1[PCIe Root 1]
    R1 --> G2[GPU 2]
    R1 --> G3[GPU 3]
    R1 --> N1[NIC 1]
    C0 <--> C1
```

NUMA 不是只影响 CPU 程序。GPU DataLoader、Pinned Memory、NIC 中断和 GPUDirect RDMA 都可能因为 CPU、内存、GPU、NIC 不在同一拓扑域而绕行。

#### 从 PCIe 树判断设备是否共享上游路径

`lspci -tv` 展示 Root Port、PCIe Switch 和 Endpoint 的父子关系。同一 PCIe Switch 下的 GPU 可能支持较短的 P2P 路径；跨 Root Complex 的设备通常需要经过 Host Bridge，跨 NUMA 还可能经过 CPU 间互连。

PCIe 代际和 Link Width 同样重要。设备宣称支持 PCIe Gen5 x16，不代表当前实际协商到 Gen5 x16。插槽、电气 Lane、Riser、BIOS 和链路错误都可能让它降为更低速率或宽度。

```bash
lspci -s <BDF> -vv | rg -i 'LnkCap|LnkSta|AER'
```

`LnkCap` 是设备能力，`LnkSta` 是当前状态。如果同型号节点的当前 Speed/Width 不一致，应先修复硬件链路，再比较训练性能。

### 拓扑本地性要作为资源属性保存

节点资产清单至少应保存 GPU UUID、PCI BDF、NUMA Node、邻近 CPU Core、邻近 HCA/NIC 和 GPU 对之间的连接类型。硬件更换、BIOS 调整、PCIe 插槽变化或驱动升级后，应重新发现拓扑，而不是继续使用旧标签。

```bash
lspci -tv
numactl --hardware
lstopo --of console
nvidia-smi topo -m
```

这些输出是节点拓扑基线，也是在训练性能变化或 GPUDirect RDMA 异常时定位绕行路径的第一批证据。

## 第 2 章 · Affinity 和数据路径

### CPU、Memory、GPU 和 NIC Affinity 必须联动

CPU Affinity 决定进程在哪些 Core 运行，Memory Affinity 决定主机内存从哪个 NUMA Node 分配，GPU Affinity 和 NIC Affinity 描述设备之间的拓扑接近程度。只绑 CPU 而不关心内存和设备，可能让线程看似固定，数据却仍然跨 Socket 搬运。

| 对齐对象 | 不对齐的常见症状 | 主要观察 |
| --- | --- | --- |
| CPU 与 Memory | 内存延迟高、跨 Socket 流量高 | `numastat -p PID`、`numactl -H` |
| CPU 与 GPU | Host to Device 带宽低 | `nvidia-smi topo -m`、内存绑定 |
| GPU 与 NIC | GDR 回退、RDMA 带宽不稳 | `nvidia-smi topo -m`、`ibdev2netdev` |
| GPU 与 GPU | P2P/Collective 带宽低 | `nvidia-smi topo -m`、NCCL Tests |

调度器应把 GPU、CPU、Memory 和 NIC 视为具有关联关系的资源。对通信密集型作业只分配“数量正确”的 GPU，而不关心 GPU-NIC 距离，可能让所有 Rank 都被最慢路径拖住。

#### CPU 绑核和内存绑定必须以实际 GPU 分配为输入

静态把所有 GPU Job 绑定到 CPU 0-31 并不可靠，因为容器最终拿到的 GPU 可能位于另一个 NUMA Node。正确流程是先确定 GPU UUID/BDF，再解析其 CPU Affinity 和 NUMA Node，最后为 Worker 绑定相邻 CPU 和内存。

```bash
nvidia-smi topo -m
numactl --cpunodebind=<numa> --membind=<numa> <command>
numastat -p <pid>
taskset -cp <pid>
```

Kubernetes 中还要协调 CPU Manager、Topology Manager、Device Plugin Hint 和 Pod QoS。应用自己绑核与 kubelet 静态 CPU 分配冲突时，可能把线程绑到容器不可用或远端 CPU。

### GPU P2P 减少 Host Memory 中转

GPU Peer-to-Peer 允许一个 GPU 直接访问或复制另一个 GPU 的显存。没有 P2P 时，数据可能经过 Host Memory；存在 PCIe P2P 或 NVLink 时，CUDA 和 NCCL 可以使用更直接的路径。

```text
无 P2P：       GPU 0 -> Host Memory -> GPU 1
PCIe P2P：     GPU 0 -> PCIe Fabric -> GPU 1
NVLink P2P：   GPU 0 -> NVLink -> GPU 1
```

P2P 能力还受 IOMMU、ACS、平台固件、GPU 型号和驱动影响。`nvidia-smi topo -p2p` 显示能力后，仍需用 `p2pBandwidthLatencyTest` 或 NCCL Tests 验证实际带宽；理论可用不等于运行时达到基线。

#### 能力、启用状态和实测性能是三个层次

1. 能力层：GPU 和平台是否声明支持 Read、Write、Atomic 等 P2P 能力。
2. 运行层：驱动、IOMMU、ACS 和进程是否允许当前设备对建立 P2P。
3. 性能层：实际单向/双向带宽和延迟是否落入该拓扑的健康区间。

```bash
nvidia-smi topo -p2p r
nvidia-smi topo -p2p w
./p2pBandwidthLatencyTest
```

测试结果要标明 GPU 对。例如同一节点内 GPU0-GPU1 正常而 GPU0-GPU6 偏低，可能是预期的跨 Root 路径，也可能是某条 NVLink/PCIe 链路异常，不能只汇总一个平均数。

## 第 3 章 · PCIe、NVLink 和 NVSwitch 的边界

### PCIe 是通用总线而 NVLink 是高速互连

PCIe 负责连接 CPU、GPU、NIC、NVMe 等多类设备，优势是标准化、通用性和部署灵活性；NVLink 面向 NVIDIA GPU 以及部分 CPU-GPU 系统，提供更高的节点内 GPU 通信带宽。

| 维度 | PCIe | NVLink |
| --- | --- | --- |
| 典型范围 | CPU 到外设和设备间 | GPU-GPU 或特定 CPU-GPU |
| 拓扑 | Root Complex、Root Port、PCIe Switch | 点到点 Link 或 NVSwitch Fabric |
| 主要用途 | 枚举、控制、DMA、设备连接 | P2P、集合通信、Scale-up |
| 故障证据 | Lane、Width、AER、ACS、NUMA | Link State、错误计数、Fabric 状态 |

NVLink 不会让 PCIe 消失。GPU 的控制和枚举仍可能依赖 PCIe，NIC 也通常通过 PCIe 连接到 CPU 或 GPU 所在的系统。

### NVSwitch 是交换 ASIC 不是网络交换机

NVLink 描述链路技术，NVSwitch 是把多条 NVLink 组织成节点内交换 Fabric 的专用交换 ASIC。网络交换机则处理 InfiniBand 或 Ethernet 报文，连接不同节点。它们的协议、寻址、管理服务和故障域不同。

```text
Scale-up：GPU -> NVLink -> NVSwitch -> NVLink -> GPU
Scale-out：GPU -> HCA/NIC -> 网络交换机 -> HCA/NIC -> GPU
```

大规模训练经常同时依赖两层 Fabric：节点内通过 NVLink/NVSwitch 汇聚，节点间通过 InfiniBand 或 RoCE 通信。排查 NCCL 问题时必须先确认错误发生在本地互连还是网络互连。

### NVSwitch 提供更均衡的节点内 GPU 访问

多个 GPU 通过 NVLink 连接到 NVSwitch 后，交换芯片负责转发 GPU 间的流量，使节点内 GPU 对之间拥有更一致的可达性和总带宽。具体链路数量、Switch 数量和 GPU 分区取决于 HGX/DGX 代际，不能把一张平台拓扑图套到另一张平台。

NVSwitch 只改善硬件路径，应用仍可能受 Collective 算法、消息大小、同步和计算通信重叠影响。验收需要同时观察链路状态、NCCL Bus Bandwidth 和真实模型扩展效率。

“更均衡”也不等于所有通信始终同速：单 Link 退化、部分 Port Down、Fabric Partition 或路由未完成都会让某些 GPU Pair 偏离。平台应保存完整拓扑与全 Pair 基线，在故障时比较具体 Endpoint 和 Counter，而不是只用整机平均带宽掩盖局部异常。

## 第 4 章 · Fabric Manager 与分区

### Fabric Manager 负责把 NVSwitch Fabric 变成可用系统

Fabric Manager 是 NVSwitch 系统的特权管理服务，负责协调驱动初始化 GPU、配置 GPU 侧路由和端口映射、形成可用的 Memory Fabric，并处理 NVLink/NVSwitch 的状态和错误。GPU 能够被 PCIe 枚举，不等于 Fabric 已经初始化成功。

不同平台对 Fabric Manager 的依赖不同。需要该服务的平台上，FM 未运行、版本与驱动不匹配或初始化失败，可能造成 NVLink P2P、CUDA 初始化或多卡作业异常。

```bash
systemctl status nvidia-fabricmanager
journalctl -u nvidia-fabricmanager --since '30 min ago'
nvidia-smi
```

#### Fabric 初始化需要经过发现、训练、路由和注册

概念上，Fabric Manager 启动后要发现 GPU/NVSwitch，协调链路训练，配置路由或端口映射，并把可用 Fabric 状态交给 Driver。任一步失败都可能出现“GPU 枚举正常，但 CUDA 多卡或 P2P 不可用”。

排障需要关联四类状态：FM Systemd 状态、FM/NVLSM 日志、`nvidia-smi -q` Fabric 状态、NVLink/NVSwitch 错误。只看服务 `active (running)` 无法证明初始化完成。

#### Driver 和 Fabric Manager 版本应按支持矩阵配对

FM 包通常与 Driver 系列存在配对关系。升级 Driver 但保留旧 FM，或容器化 Driver 与宿主机 FM 生命周期不一致，可能造成启动失败。变更前要记录包版本和服务配置，变更后验证 Fabric Ready 及多卡测试。

```bash
systemctl cat nvidia-fabricmanager
journalctl -u nvidia-fabricmanager -b --no-pager
nvidia-smi -q | sed -n '/Fabric/,+30p'
```

### NVLink Subnet Manager 维护交换路径和分区

在引入 NVLink Subnet Manager 的平台上，NVLSM 负责发现 NVLink 拓扑、分配本地标识、计算并下发 Switch Forwarding Table、配置 Partition Key，并监控 Fabric 变化。Fabric Manager 继续负责 GPU 侧路由、NVLink 配置和分区相关接口，二者通过平台服务协同。

排障时不要只重启 NVLSM 或 FM。应同时检查服务状态、驱动系列、GPU/NVSwitch 错误、分区配置和当前平台代际，因为服务职责和支持矩阵会随硬件、驱动版本变化。

### 裸机、Passthrough、Shared NVSwitch 和 vGPU 的隔离边界不同

| 模式 | 设备管理位置 | 隔离对象 | 主要风险 |
| --- | --- | --- | --- |
| Bare Metal | 宿主机 | 作业、容器或 MIG | FM、驱动和全 Fabric 健康 |
| Full Passthrough | Hypervisor/VM | 整组设备直通 | IOMMU、设备组和 VM 内服务 |
| Shared NVSwitch | Host 或 Service VM | Fabric Partition | 分区生命周期和租户边界 |
| vGPU | vGPU Manager/VM | VF 和 vGPU Profile | 版本、授权、Profile 和调度 |

高可用或 Degraded Mode 允许某些受支持的缺陷拓扑继续运行，但服务能启动不表示性能和隔离仍完整。恢复后要重新核对 Partition、Route、Link 和 GPU 状态，并执行多卡基准。

#### Fabric Partition 是互连隔离而不是完整租户隔离

Partition 控制哪些 GPU 可以通过 NVLink Fabric 互相访问，但完整多租户还需要 VM/容器设备边界、显存/计算隔离、IOMMU、安全策略和监控归属。只配置 NVSwitch Partition 不能自动阻止所有 PCIe、网络或管理面访问。

#### Degraded Mode 必须记录缺失能力

降级运行时要记录不可用 GPU、Link、Switch Port、受影响 Partition 和预期带宽变化。调度器应避免把需要完整 Scale-up 带宽的 Job 放入降级域，监控也应抑制已知维护事件产生的重复告警，但不能永久屏蔽错误增长。

## 第 5 章 · 观察拓扑和定位性能差异

### nvidia-smi topo -m 是拓扑排查的起点

`nvidia-smi topo -m` 展示 GPU、NIC 与 CPU/Memory Affinity。矩阵中的 `PIX`、`PXB`、`PHB`、`SYS` 等值表示不同 PCIe 路径等级，`NV#` 表示通过若干 NVLink 连接。不同版本的命令选项和输出字段会变化，脚本应先检查 `nvidia-smi topo --help`。

```bash
nvidia-smi topo -m
nvidia-smi topo -p2p r
nvidia-smi nvlink --status
nvidia-smi nvlink --errorcounters
nvidia-smi -q | sed -n '/Fabric/,+20p'
```

#### 读懂 topo 矩阵中的路径代码

| 代码 | 一般含义 | 性能判断 |
| --- | --- | --- |
| `X` | 同一设备 | 不适用 |
| `PIX` | 最多经过一个 PCIe Bridge | 通常是较近 PCIe 路径 |
| `PXB` | 经过多个 PCIe Bridge | 比 PIX 路径更长 |
| `PHB` | 经过 PCIe Host Bridge | 经过 CPU Root Complex |
| `NODE` | 经过同一 NUMA Node 内多个 Host Bridge | 需结合平台拓扑判断 |
| `SYS` | 跨 NUMA/CPU 互连 | 通常是最远主机路径 |
| `NV#` | 通过指定数量 NVLink | 节点内高速路径 |

代码表示拓扑类别，不直接给出带宽。不同 PCIe 代际、Switch、GPU 和 NVLink 代际会让同一代码的绝对性能不同，因此必须用本机基准验证。

#### CPU Affinity 和 NUMA Affinity 要逐列阅读

矩阵右侧通常还显示 CPU Affinity、NUMA Affinity 和 NIC 关系。读取时先选择目标 GPU 组，再找共同或邻近的 CPU/NUMA，最后找离它们最近的 NIC。多 Rail 网络还要确认每个 Rank 是否选择了匹配的 HCA。

拓扑快照应保留原始文本和节点资产版本。不要只截取 GPU-GPU 子矩阵，否则会丢失 GPUDirect RDMA 需要的 GPU-NIC-CPU 关系。

### 相同 GPU 数量不代表相同训练性能

申请 4 张 GPU 可能得到同一 NVSwitch 域内的 4 张卡，也可能跨两个 PCIe Root Complex 或 NUMA Node。后者的 Collective 需要经过更长路径，最慢的 GPU 对或 NIC 会拖住同步训练。

调度和验收应确认：

- GPU 是否位于同一 NVLink/NVSwitch 域；
- GPU 对是否支持 P2P，实际带宽是否正常；
- 分配的 HCA/NIC 是否靠近 GPU；
- CPU Core 与 Host Memory 是否属于对应 NUMA Node；
- NCCL 实际使用了 NVLink、P2P、Shared Memory 还是 Network；
- 单节点多卡和跨节点带宽是否达到硬件基线。

### 拓扑错误要先保存证据再做恢复动作

发现 Link Inactive、错误计数增长、Fabric State 异常或 FM 初始化失败时，应先保存拓扑、链路、DCGM、内核日志和当前作业信息。若错误持续增长、影响多个作业或出现 Fatal XID/SXid，应停止新多卡任务并根据故障域 Cordon/Drain；不要直接重置计数器或在线拔插设备。

修复后的验证至少包括：拓扑快照、P2P 测试、单节点 NCCL、必要时多节点 NCCL，以及真实工作负载的扩展效率。只有应用和硬件指标都回到基线，节点才适合重新接收通信密集型作业。

#### 链路故障的最小证据包

- Node、GPU UUID、PCI BDF、Driver、Firmware、FM/NVLSM 版本；
- `nvidia-smi topo -m`、NVLink Status/Error Counter、Fabric State；
- Kernel XID/SXid/AER 日志和时间；
- 受影响 Job、Rank、NCCL 日志和首次异常；
- P2P/NCCL 与健康节点对照结果；
- 重启、Reset 或硬件更换前后的状态。

证据包让平台团队能够区分单 GPU、单 Link、NVSwitch、PCIe Root、FM 服务和应用路径问题，也避免维护动作清空计数器后失去现场。

## 第 6 章 · 拓扑感知的设计原则

### 调度器应把 GPU Group、NIC 和 NUMA 作为一个组合

拓扑感知调度不是给节点贴一个“GPU 节点”标签就结束。对于 AllReduce、张量并行或 GPUDirect RDMA 密集型任务，调度器应尽量提供同一 NVLink/NVSwitch 域的 GPU、邻近 HCA、匹配的 CPU Core 和本地内存。对于低通信推理副本，则可以优先考虑故障域分散和资源碎片率。

资源模型需要表达“可用数量”和“可用组合”的差异：节点可能还有 4 张空闲 GPU，但它们不在同一拓扑组；也可能 GPU 足够，却没有与其邻近的 NIC。容量报告应记录拓扑碎片，而不仅是总 Allocatable。

### 硬件和软件变更后要重建拓扑基线

驱动升级、BIOS 设置、固件更换、GPU/NIC 替换、MIG 重配和 NVSwitch 分区变化，都可能改变设备可见性或性能。变更流程应保存变更前后拓扑、服务版本、错误计数和 NCCL 基准，避免把配置漂移误判成模型性能变化。

```text
变更前资产与拓扑
        ↓
节点 Drain 和维护
        ↓
驱动/固件/Fabric 变更
        ↓
nvidia-smi 与 DCGM 健康检查
        ↓
拓扑和 P2P 回归
        ↓
NCCL 与真实工作负载验收
        ↓
解除隔离并更新基线
```

## 第 7 章 · 拓扑案例和验收清单

### 双路 CPU 加四张 PCIe GPU 容易出现跨 NUMA 绕行

假设 GPU0/1 和 NIC0 位于 Socket0，GPU2/3 和 NIC1 位于 Socket1。一个 4 卡 Job 如果所有 CPU Thread 和 Host Memory 都绑定 Socket0，那么 GPU2/3 的数据准备会跨 CPU 互连；如果 NCCL 只选 NIC0，远端通信也可能让 GPU2/3 绕行。

#### 验证步骤

1. 用 `nvidia-smi topo -m` 确认 GPU、NIC、CPU Affinity。
2. 分别对 GPU0/1、GPU2/3 和跨组 GPU 运行 P2P 测试。
3. 分别绑定 NIC0/NIC1 运行 RDMA/NCCL。
4. 比较 CPU/Memory 绑定前后的 Host to Device 和应用吞吐。

#### 调度策略

2 卡 Job 优先放在同一 Root/NUMA；4 卡 Job 必须同时分配两侧 CPU/Memory 和对应 HCA。若应用无法多 NIC/多 NUMA 对齐，应把跨 Socket 性能作为容量下限，而不是使用局部最优基准。

### 八卡 NVSwitch 节点仍可能因 NIC 亲和性表现不一致

NVSwitch 让 GPU-GPU 路径更一致，但 GPU-NIC 的 PCIe 距离仍可能不同。节点内 AllReduce 正常而多节点训练下降时，不能因为“有 NVSwitch”就排除本地拓扑，应检查每个 Rank 的 HCA 选择和 GDR 路径。

#### 证据组合

- 单节点 `all_reduce_perf` 证明 NVSwitch 域；
- GPU-NIC Topology 和 HCA Port Mapping；
- Host Memory RDMA 与 GPU Buffer RDMA 对比；
- 多 Rail NCCL 日志和每端口 Counter；
- 跨节点 `busbw` 与同配置基线。

### 同样申请四张 GPU 的两个 Job 可能得到不同组合

一个 Job 得到 GPU0-3，另一个得到 GPU0、2、5、7。即使所有 GPU 型号相同，后者可能跨更多 PCIe/NVLink 域。默认 Kubernetes Extended Resource 只按数量调度，不理解应用所需 GPU Clique。

#### 平台解决方向

- 把完整 GPU Group 作为节点池或可调度资源；
- 使用拓扑感知 Scheduler/Device Plugin 能力；
- 对大 Job 采用整节点分配；
- 用 Admission 拒绝不满足拓扑的组合；
- 在 Job 启动时记录最终 UUID 和 Topology。

调度优化后还需比较 Queue Time 和碎片。强制完整拓扑可能提高单 Job 性能，却降低集群可调度率，需要按 Workload Class 取舍。

### 节点拓扑验收要覆盖静态状态和动态性能

| 层次 | 验收项 | 证据 |
| --- | --- | --- |
| Inventory | GPU/NIC/CPU 数量和 BDF | 资产表、`lspci` |
| PCIe | Speed、Width、AER | `lspci -vv` |
| NUMA | CPU/Memory/GPU/NIC Affinity | `topo -m`、`lstopo` |
| P2P | 能力和实际带宽/延迟 | P2P Matrix/Test |
| NVLink | Link State 和 Counter | `nvidia-smi nvlink` |
| NVSwitch | Fabric、FM/NVLSM、Partition | 服务日志、Fabric State |
| Collective | 不同 GPU Group 的 NCCL | `nccl-tests` |

验收报告要明确预期差异。例如跨 NUMA 路径本就低于 NVLink，不能判为故障；同拓扑组中某一 GPU 对显著偏离，才需要进一步隔离和硬件检查。

## 第 8 章 · 从 PCIe 枚举到实际数据路径

### PCIe BDF 是跨层关联设备的基础键

Linux 常用 `dddd:bb:dd.f` 表示 PCIe Domain、Bus、Device 和 Function。BDF 不是物理槽位名称，但它是关联 GPU、NIC、IOMMU Group、NUMA Node 和 Kernel Log 的基础键。

```bash
lspci -Dnn | egrep -i 'nvidia|mellanox|ethernet|infiniband'
lspci -t
readlink -f /sys/bus/pci/devices/0000:65:00.0
cat /sys/bus/pci/devices/0000:65:00.0/numa_node
```

示例 BDF 必须替换为本机结果。`lspci -t` 展示 Bridge 和 Switch 树，sysfs 实路径可看到设备经过的上游 Bridge。两块设备的 BDF 数字接近，不保证共享同一 Root Complex。

#### GPU UUID、BDF 和容器设备序号不能混用

| 标识 | 稳定范围 | 主要用途 |
|---|---|---|
| GPU UUID | 同一物理 GPU 生命周期内相对稳定 | 监控和设备归属 |
| PCI BDF | 当前平台枚举与拓扑 | Kernel、NUMA 和 PCIe 关联 |
| Minor Number | Driver 本机设备节点 | `/dev/nvidiaX` |
| Kubernetes Resource | 集群调度资源类型 | Full GPU、MIG 或 HAMi 请求 |
| Pod 内逻辑序号 | 单个容器可见顺序 | Framework 的 `cuda:0` |

`cuda:0` 不是宿主机 GPU 0。故障证据要同时记录 Pod UID、Container、GPU UUID 和 Host BDF，才能跨层定位。

### PCIe Link Width 和 Speed 要区分能力与当前状态

PCIe 设备声明最大代际和最大 Lane 数，运行时协商当前 Speed/Width。链路从 x16 降到 x8 或退到更低代际时，设备仍可枚举，但 Host Copy、P2P 或 NIC 通信会下降。

```bash
lspci -s 65:00.0 -vv
nvidia-smi --query-gpu=pci.bus_id,pcie.link.gen.max,pcie.link.gen.current,pcie.link.width.max,pcie.link.width.current --format=csv
```

空闲节能可能暂时降低 Current Speed，验收要在传输负载下采样，并与同型号健康节点比较。只看一个空闲快照容易误报。

#### PCIe Switch 上行可能成为共享瓶颈

多个 GPU 或 GPU/NIC 连接同一 Switch 时，下行总能力可能高于上行。单设备正常而并发下降，可能是上行争用。设计阶段应保存 Root Port、Switch 上下行 Lane、GPU/NIC 端口、BIOS Bifurcation 和预期并发流量。

### ACS 和 IOMMU 会影响隔离与 P2P 路由

ACS 用于 PCIe 访问控制和重定向，IOMMU 用于 DMA 地址转换与设备隔离。某些平台配置会让原本可经 Switch 直达的 P2P 流量绕到 Root Complex，甚至禁用 P2P。

关闭 IOMMU 或 ACS 不是通用性能修复，它会改变安全和虚拟化边界。正确流程是：确认支持矩阵，保存 BIOS 与 Kernel 参数，检查 P2P Capability，用带宽/延迟实测，在维护窗口按厂商建议变更，同时验证 Passthrough 和隔离，再保留回滚路径。

#### IOMMU Group 影响可分配设备集合

同一 IOMMU Group 的设备可能不能安全地分别交给不同 VM。GPU、其附属 Function、NVSwitch 或上游 Bridge 的 Group 关系会限制 Passthrough。方案设计不能只数 GPU，还要验证实际可隔离集合。

## 第 9 章 · NUMA 亲和性的测量与执行

### NUMA 错配会放大 CPU、Memory 和 I/O 延迟

双路服务器中，每个 CPU Socket 有本地内存控制器和一组 PCIe Root Port。线程在 Socket 0，却访问 Socket 1 Memory 并驱动 Socket 1 的 GPU/NIC 时，控制流和数据都可能经过 CPU 间互连。

```mermaid
flowchart LR
    C0[CPU Socket0] --> M0[Local Memory0]
    C0 --> G0[Local GPU0]
    C1[CPU Socket1] --> M1[Local Memory1]
    C1 --> G1[Local GPU1]
    C0 <-->|Socket Link| C1
```

跨 NUMA 不一定错误，多 GPU 作业有时无法避免；问题是无意识绕行和每次运行分配不同，造成性能不可预测。

### 用 numactl、sysfs 和拓扑矩阵建立亲和组

```bash
numactl --hardware
lscpu -e=cpu,node,socket,core
nvidia-smi topo -m
cat /sys/bus/pci/devices/0000:65:00.0/numa_node
```

`numa_node` 为 `-1` 表示平台没有提供明确归属，不能自动当作 NUMA 0。平台应为每种节点 SKU 保存 CPU Set、GPU UUID、NIC BDF 和 NUMA 的亲和组，并在 BIOS、Firmware 或硬件变更后重建。

```yaml
affinity_groups:
  - numa: 0
    cpu_set: "0-31,64-95"
    gpus: ["GPU-example-a", "GPU-example-b"]
    nics: ["0000:31:00.0"]
```

示例值不能照搬到生产。

### CPU、内存与 GPU 分配必须形成原子决策

只给 Pod 绑核，但 Device Plugin 最终分到另一个 NUMA 的 GPU，亲和策略仍失败。CPU Manager、Topology Manager、Device Plugin Topology Hint 与 Runtime 的实际设备选择必须形成闭环。

```bash
taskset -pc 1
grep Cpus_allowed_list /proc/1/status
head /proc/1/numa_maps
nvidia-smi --query-gpu=uuid,pci.bus_id --format=csv
```

正式诊断需汇总主要 Mapping 的页分布，不能只凭 `numa_maps` 前几行下结论；还要确认 DataLoader Worker 是否继承 CPU Set。

#### Topology Manager Policy 是局部性和可调度率的取舍

`none`、`best-effort`、`restricted`、`single-numa-node` 的约束逐步增强。严格策略提高可预测性，也会增加 Pod Admission 失败。请求的 GPU 数超过单个 NUMA 可容纳数量时，单 NUMA 策略天然不能满足。

平台应按 Job Class 选择：单卡推理优先单 NUMA；多卡训练以 GPU/NIC Fabric Group 为主；跨 Socket 作业允许跨 NUMA，但固定 CPU 和 Memory 分布。

## 第 10 章 · NVLink 与 NVSwitch Fabric 生命周期

### NVLink 是多条链路组成的连接关系

GPU 可能通过多条 NVLink 连接另一个 GPU、NVSwitch 或 CPU。拓扑矩阵中的 `NV#` 表示聚合路径，但不直接给出当前有效带宽、错误率或降级状态。

```bash
nvidia-smi nvlink --status
nvidia-smi nvlink -R
nvidia-smi nvlink --errorcounters
nvidia-smi nvlink --capabilities
nvidia-smi topo -m
```

支持项随代际和驱动变化，执行前应以本机 `nvidia-smi nvlink --help` 为准。`--id` 可以用 GPU Index、PCI Bus ID 或 GPU UUID 选择设备，自动化采集应优先保存 GPU UUID；`--list` 选择的是该 GPU 上的 NVLink ID，不能把它当成远端 GPU 序号。`--status` 在链路为 Active 时显示链路带宽，链路存在但未激活时显示 Inactive，支持低功耗状态的平台还可能显示 Sleep；远端设备的 PCI Bus ID 和 Remote NVLink ID 需要结合 `--remotelinkinfo` 查询。

#### 按 GPU、Link 和 Remote Endpoint 三层读取状态

| 字段或关系 | 回答的问题 | 不能单独证明什么 |
|---|---|---|
| GPU UUID / PCI BDF | 当前输出属于哪张物理 GPU | 不能说明与哪张 Peer 相连 |
| Link ID | 本地 GPU 的哪条 NVLink | 不能当作全节点唯一 ID |
| Remote PCI BDF / Remote Link ID | 本地 Link 的对端设备和对端端口 | 不能证明链路正在承载业务流量 |
| Active 加 Bandwidth | 链路已激活以及命令报告的链路能力 | 不能证明当前有流量或实测达到该带宽 |
| Sleep | 支持平台上的低功耗链路状态 | 不能直接判为硬件 Link Down |
| Inactive | 已发现链路当前未激活 | 只有与 Baseboard 基线对照后才能判断是否意外 |
| `N/A` 或字段缺失 | 当前设备、驱动或命令不提供该字段 | 不能等同于状态正常、计数为零或 Peer 不存在 |

“空闲”是流量概念，不是链路故障状态：一条 Active 链路可以在采样窗口内没有吞吐；Sleep 可能来自支持的低功耗或 Link Width 策略；Inactive 才表示一条已发现链路当前未激活，但仍要先核对该 Link 是否按当前 SKU、分区和配置本应启用。判断时施加受控 P2P 负载并复查状态：链路从 Sleep 恢复且对应吞吐增长，说明它先前只是空闲；预期 Link 持续 Inactive、Remote Endpoint 缺失或 `topo -m` 中原有的 `NV#` 关系消失，才进入链路或 Fabric 故障路径。

单链路退化也不等于整个 Fabric 初始化失败。前者通常表现为某个 GPU UUID 和 Link ID 偏离基线，影响包含该 Endpoint 的部分 GPU Pair；后者会让一组 GPU 无法完成 Fabric 注册、P2P/新 CUDA Context 大范围失败，并伴随 FM/NVLSM 初始化、路由或分区错误。证据应绑定 GPU UUID、Link ID、Remote Endpoint、State 和 Error Counter，只写“NVLink Active”或“Fabric 异常”都不足以定位故障域。

#### 代际带宽必须统一统计口径

厂商可能展示每链路、单向、双向或 GPU 总聚合带宽。比较时要统一口径，并以具体 Baseboard 拓扑为准。NVLink-C2C 的系统位置也不同于传统 GPU-GPU Link，监控不应混合相加。

### Fabric Manager 经历发现、训练、路由和注册

NVSwitch 系统中，Driver 识别 GPU 不代表 Fabric 可用。Fabric Manager 与 NVLink Subnet Manager 需要发现 GPU/Switch、训练链路、配置路由或分区，并把 GPU Fabric 注册为完成状态。

```mermaid
stateDiagram-v2
    [*] --> Discover
    Discover --> TrainLinks
    TrainLinks --> ConfigureRoutes
    ConfigureRoutes --> RegisterGPU
    RegisterGPU --> Ready
    TrainLinks --> Degraded
    ConfigureRoutes --> Failed
```

应用在 Fabric 未就绪时启动，可能看到 P2P 不可用、CUDA 初始化错误或通信退回 PCIe。节点 Ready Condition 应考虑 Fabric，而不只依赖 `nvidia-smi` 成功。

```bash
systemctl status nvidia-fabricmanager --no-pager
journalctl -u nvidia-fabricmanager -b --no-pager
nvidia-smi -q
```

服务进程 `active` 只证明控制进程仍在运行，不证明发现、训练、路由和 GPU 注册已经完成。应逐张 GPU 对照 Fabric State/Status、预期 Partition 和 Link；如果服务运行但状态仍是初始化中、不完整或失败，应继续查 FM/NVLSM 日志中的首次错误，不能用反复重启把首个失败证据覆盖掉。

服务名和查询字段以实际版本为准。较新的 `nvidia-smi` 已把 `-q` 中旧式 GPU Fabric State/Status 标为废弃，同时又可能提供新的 Fabric Health 字段；因此采集器不能硬编码一个跨版本永远存在的字段。应先保存 Driver 与 `nvidia-smi` 版本，再组合本版本实际支持的 Fabric 查询、FM/NVLSM 日志和平台管理接口。证据至少包含 Driver/FM Version、Service Start Time、GPU Fabric GUID 或稳定身份、每张 GPU 的注册结果、Link Error 和初始化日志。

### Driver、Fabric Manager 与固件必须配套升级

Fabric Manager 通常与 Driver Branch 紧密配套。只升级 Driver 或 OS Repository 混入不同 Branch，可能引起服务拒绝启动或 API 不匹配。BIOS、BMC 和 Firmware 变化也可能改变初始化。

升级需要 Cordon、Drain、确认无 CUDA Context、更新支持矩阵内组件、重启、验证 Fabric，再运行 P2P/NCCL 基线。不能在活跃任务中替换 Kernel Driver 或相关控制服务。

变更记录至少包含 Kernel Driver、用户态库、FM/NVLSM、GPU/NVSwitch Firmware 与 CUDA 应用兼容边界。`nvidia-smi` 显示的 CUDA Version 只是驱动可支持的上限，不能证明容器中的 Runtime、NCCL 与新驱动已经通过分布式回归；Fabric 组件匹配也不能由该字段推断。

若升级后 FM 启动失败，应先比较包 Branch、服务日志与 GPU Fabric State，避免反复重启覆盖首个错误。回滚也要作为整组组件执行，并重新跑 Fabric 初始化和通信测试，不能只降级一个包后直接恢复调度。

## 第 11 章 · Fabric 分区、虚拟化与高可用

### 不同虚拟化模型把 Fabric 控制权放在不同位置

裸机由 Host Fabric Manager 管理整机；Full Passthrough 把支持的设备集合交给 VM；Shared NVSwitch 允许 VM 使用 Fabric Partition；vGPU 还涉及虚拟功能、vGPU Manager 和许可。支持组合取决于 Baseboard、Hypervisor 和软件版本。

| 模式 | GPU 所有权 | Fabric 管理位置 | 主要隔离边界 |
|---|---|---|---|
| Bare Metal | Host 工作负载 | Host FM/NVLSM | OS 与进程 |
| Full Passthrough | VM 独占设备集合 | 平台支持模型 | IOMMU 与 VM |
| Shared NVSwitch | 多 VM 分区 | Service VM 或平台组件 | Partition 加 VM |
| vGPU | VM 使用 vGPU | Host vGPU/Fabric 组件 | Profile 与许可 |

Fabric Partition 只隔离互连可达路径，不自动提供 CPU、Memory、NIC、Storage 和管理面隔离。

### 高可用要分别验证现有 Context 和新工作负载

控制服务故障时，要回答既有 Context 是否继续、新 Context 能否创建、故障链路是否隔离、控制权如何切换、恢复后 Partition 是否一致，而不只是确认 Standby 进程存在。

测试应覆盖 FM 正常/异常退出、管理网络中断、单 Link/GPU/Switch 故障、Standby 接管、既有训练继续、新 Job Admission 和服务恢复。

#### Degraded Mode 必须转化为调度限制

节点还能运行不代表保有原性能。如果部分 GPU/NVLink 不可用，平台应更新 Node Condition、可分配 GPU Group 和性能等级，必要时 Cordon。继续暴露完整 GPU 数会让大 Job 落到不完整 Fabric。

### 恢复准入必须包含动态性能测试

恢复顺序是保存证据、隔离新工作、按支持流程恢复、验证静态 Fabric、运行 P2P/NCCL、观察 Counter 不再增长，再恢复调度。Reset GPU、重载 Driver、升级 Firmware 和重启 Host 都需要维护窗口。

恢复准入至少要求：预期 GPU/NVSwitch 全部枚举、Fabric State 完成、Link ID 与基线一致、P2P Bandwidth 恢复、单节点 NCCL 达标、FM/NVLSM 在观察窗口无新增错误、节点资源和标签与物理状态一致。

动态测试应命中原故障域：单 Link 问题复测对应 Peer，Switch 或 Partition 问题覆盖受影响 GPU Group，HA 问题同时验证既有 Context 与新 Context。只测试未受影响 GPU 得到的“通过”没有准入价值。

最终记录需绑定测试版本、消息规模、GPU UUID、开始/结束时间和 Counter Delta。观察窗口内如果吞吐仍有长尾、错误继续增长或服务重新初始化，节点保持 Quarantine；静态状态恢复不能覆盖动态证据失败。

## 第 12 章 · 拓扑资产发现和基线文件

### 同一节点要从 CPU、PCIe、GPU、NIC 四个视角盘点

拓扑盘点的目标不是分别列出四类设备，而是建立它们之间可以反查的关系。CPU 侧要记录 Socket、NUMA Node 和逻辑核范围；PCIe 侧要记录 Endpoint、上游 Bridge 与 Root Port；GPU 侧要记录 UUID、BDF、NVLink Peer；NIC 侧要记录 HCA、Netdev、Port 与 BDF。只有这些标识能互相映射，后续才能回答“某个 Rank 实际经过哪条路径”。

```bash
lscpu
numactl --hardware
lspci -Dnn
lspci -t
nvidia-smi -L
nvidia-smi topo -m
ip -br link
rdma link show
```

盘点输出保存原始文本和结构化摘要。原始文本便于厂商支持，摘要用于比较节点。命令版本、Kernel、Driver、BIOS 和采集时间也要记录。

采集还应在统一节点状态下执行，例如节点已 Drain、无业务负载、Fabric 初始化完成。否则热插拔后的残留设备、容器 cgroup 过滤或尚未就绪的 FM 都可能让清单缺项。DCGM 中的 GPU ID、NVSwitch ID 等是当前 Host Engine 的运行时标识，资产库应以 GPU UUID、PCI BDF、序列号等耐久标识关联，而不能长期保存一个裸的 `gpu:0`。

最后要做交叉核对：`lspci` 能看到的 GPU 是否都出现在 `nvidia-smi -L`，拓扑矩阵中的 NIC Legend 是否都能映射到 `rdma link`，每个 GPU 的 NUMA 与 sysfs 是否一致，预期的 NVLink Peer 是否都有当前 Link State。清单数量正确但关系断裂，仍然不能作为健康基线。

### Node SKU 基线描述预期而不是当前偶然状态

```yaml
node_topology_baseline:
  sku: example-hgx-node
  cpu_sockets: 2
  gpu_count: 8
  nic_count: 8
  gpu_groups:
    - id: fabric-0
      members: [0, 1, 2, 3, 4, 5, 6, 7]
  expected_fabric_state: completed
  acceptance_profiles:
    - p2p-bandwidth
    - nccl-single-node
```

真实基线还要保存 GPU/NIC BDF Pattern、NUMA Affinity、PCIe Max Width/Gen、NVLink Link Count、Firmware 和允许差异。不要把某台异常节点采集结果自动注册为“基线”。

基线应区分三类字段：严格一致字段用于发现缺卡、错槽位和 Fabric 缺失；允许集合字段用于兼容可接受的固件或 BDF 差异；性能区间用于表达 P2P、H2D 和 NCCL 在受控负载下的健康范围。把所有字段都做字符串完全相等，会因正常枚举差异产生噪声；只保存 GPU 数量，又无法发现路径降级。

新 SKU 的基线需要从经过验收的多台节点归纳，并经过人工 Review 后发布 Baseline ID。单台节点的当前输出只能作为候选样本。节点重装、硬件更换或软件升级后，先与所属 SKU 的当前 Baseline 对比，再决定是节点漂移、计划内版本变化，还是需要更新整个 SKU 的预期。

### 拓扑指纹帮助发现无意漂移

将排序后的 CPU/GPU/NIC BDF、上游 Bridge、NUMA、Link 和 Driver/Firmware 生成结构化 Hash，可在节点重装或 BIOS 变更后快速发现漂移。Hash 变化只触发重验，不直接判故障，因为计划硬件更换也会改变指纹。

生成指纹前必须先规范化易变字段：采集时间、临时进程、DCGM 运行时 Entity ID 和输出顺序不应进入 Hash；GPU UUID、BDF、NUMA、Peer 关系、Link 数量、协商能力和关键版本才是拓扑身份的一部分。建议同时保留规范化 JSON 和 Hash，前者用于解释差异，后者用于快速筛选。

指纹检测适合放在节点开机验收和周期巡检中。发现变化后先输出字段级 Diff，再按变更类型决定重验范围；不能只报一个“Hash 不同”。如果变化来自未登记的 BIOS 恢复、设备换槽或缺失链路，节点应保持隔离，直到动态带宽和错误计数也完成复核。

## 第 13 章 · topo 矩阵逐字段解释

### GPU 对角线、GPU-GPU 和 GPU-NIC 区域分别阅读

`nvidia-smi topo -m` 的行列通常包含 GPU 和 NIC。先检查所有预期设备存在，再看 GPU-GPU 路径，最后看 GPU-NIC 路径和 CPU/NUMA Affinity。不要只截取 GPU-GPU 左上角，否则会漏掉 GDR 亲和。

| 代码 | 典型含义 | 运维解释 |
|---|---|---|
| X | 同一设备 | 不参与 Pair 比较 |
| PIX | 最多经过一个 PCIe Switch | 较近 PCIe 路径 |
| PXB | 经过多个 PCIe Bridge/Switch | 共享上游更多 |
| PHB | 经过 PCIe Host Bridge | 到 Root Complex |
| NODE | 同一 NUMA 内跨 Host Bridge | CPU Root 路径 |
| SYS | 跨 NUMA/Socket | 最远 CPU 系统路径 |
| NV# | 若干 NVLink 连接 | 高速 GPU Fabric 路径 |

代码定义随工具版本要以本机帮助和文档为准，但距离关系可用于初筛。

### CPU Affinity 是 CPU ID 集合而 NUMA Affinity 是节点编号

CPU Affinity 列给出更接近该 GPU 的逻辑 CPU，可能包含超线程的多个范围；NUMA Affinity 给出 Node。进程 CPU Set 应和 Kubelet/Container 实际可用 CPU 比较，而不是照抄完整 Host Range。

二者解决的问题不同：NUMA Affinity 用来选择内存分配节点，CPU Affinity 用来选择可运行的逻辑核。一个 GPU 对应 NUMA 0，不代表该 NUMA 下所有 CPU 都已分配给当前容器；如果容器 cpuset 与 GPU 的 CPU Affinity 没有交集，NCCL 等运行时也不能越过 cgroup 使用宿主机上“更近”的核。

诊断时同时记录宿主机拓扑和进程有效约束：

```bash
nvidia-smi topo -m
grep -E 'Cpus_allowed_list|Mems_allowed_list' /proc/<pid>/status
numastat -p <pid>
```

`Cpus_allowed_list` 证明线程能运行在哪里，`Mems_allowed_list` 与 `numastat` 说明内存允许位置及实际页分布。只有 CPU、Memory、GPU 三者一致，才能认定亲和策略真正生效。

### NIC Legend 需要映射到真实接口和 RDMA Port

拓扑矩阵可能用 `NIC0` 等别名，底部 Legend 映射网卡。继续用 `ibdev2netdev`、`rdma link` 和 sysfs 映射 HCA Port、Netdev、BDF、IP/GID。多 Rail 中接口名相似，不能凭编号猜测。

需要建立一条可追溯链：`NIC Legend -> HCA/Port -> Netdev -> PCI BDF -> NUMA -> Switch Port/Rail`。其中任一环只靠人工命名都容易在换卡、重装或 udev 重命名后失效。特别是一个 HCA 有多个 Port、一个 Netdev 有多种 GID 时，“选中了正确网卡”并不能证明选择了正确的 RDMA 路径。

```bash
ibdev2netdev
rdma link show
ethtool -i <netdev>
readlink -f /sys/class/net/<netdev>/device
```

将映射结果与 `nvidia-smi topo -m` 中的 GPU-NIC 距离合并后，才能为 Rank 选择邻近 HCA。多节点验收还要核对远端是否位于预期 Rail；本机 GPU-NIC 很近，但 Cable 接到错误 Rail，仍会造成跨 Spine 或不均匀流量。

## 第 14 章 · P2P 能力和性能测试

### P2P Capability Matrix 包含多种能力维度

GPU Pair 可分别支持 Read、Write、Atomic、Access 和特定性能 Rank。一个“支持 P2P”的布尔值不足以描述全部能力。应用使用的 Operation 也影响是否能直达。

```bash
nvidia-smi topo -p2p r
nvidia-smi topo -p2p w
nvidia-smi topo -p2p a
```

具体参数以驱动版本帮助为准。结果与实际 P2P Sample/Bandwidth Test 结合，能力表通过但性能偏低仍需检查 Link。

矩阵必须绑定有方向的 GPU Pair。A 访问 B 与 B 访问 A 在故障或配置异常时不一定呈现相同结果；MIG、虚拟化、IOMMU/ACS 与 Fabric Partition 也可能让同一物理拓扑在不同执行环境中得到不同能力。采集时同时保存 GPU UUID/BDF 和运行环境，避免只留下会随枚举变化的索引。

能力矩阵回答“驱动认为能否使用某种 Peer 操作”，不回答当前链路是否健康或应用是否真正选择该路径。验收应把 Capability、Link State、Bandwidth/Latency 与 NCCL 日志分层保存，任何一层异常都需要在对应边界继续定位。

### Bandwidth Matrix 和 Latency Matrix 都要保存

单向 Copy、双向 Copy、P2P Enabled/Disabled、不同 Message Size 会得到不同结果。验收矩阵至少覆盖所有 GPU Pair，大节点不能只测 0 到其他卡。

```text
Pair Result
  source_uuid
  destination_uuid
  path_code
  p2p_enabled
  unidirectional_bandwidth
  bidirectional_bandwidth
  latency
  error_count_delta
```

带宽与延迟反映不同瓶颈：大消息带宽接近基线，不代表小消息同步延迟正常；单向正常，也不代表双向并发没有共享上游争用。测试计划应按应用实际通信模式选择消息区间，并明确结果是单向、双向、聚合还是 Bus Bandwidth，避免不同口径直接比较。

每次结果还要关联路径代码、P2P 状态、Clock/Power、测试构建和节点负载。矩阵适合发现异常模式，但阈值应按 NVLink、同 PCIe Switch、跨 Root 和跨 NUMA 等路径类别分别建立。保存全矩阵后才能在换卡、升级和性能回退时做 Pair 级 Diff。

### Peer Disabled 对照用于确认实际收益

短时禁用 P2P 的对照可以验证数据是否经 Host Staging，但它改变性能，只能在测试环境使用。若启用与禁用结果相近，可能测试尺寸太小、应用未使用 P2P、拓扑回退或测量错误。

对照实验必须保持 GPU Pair、消息大小、迭代次数、CPU/Memory Affinity 和系统负载一致。先保存默认状态下的 P2P 能力、路径和带宽，再仅改变 P2P 传输选择；否则同时更换 GPU 组合或进程绑定，无法把差异归因到 Peer Access。

NCCL 可在受控测试中使用 `NCCL_P2P_DISABLE` 或限制 P2P Level 来比较传输路径，但这些变量不是生产环境的长期修复。运行时日志应确认默认组实际选择了 P2P/NVLink，禁用组确实回退到 Shared Memory 或网络路径。若两组都慢，应转向 PCIe、NUMA、Clock、测试构建或上游共享瓶颈，而不是继续调 P2P 开关。

### 单 Pair 异常与全矩阵异常指向不同层

单个 Pair 偏离可能是 Link/Port/GPU；所有跨 NUMA Pair 慢可能是预期拓扑或 CPU Link；所有 Pair 同时下降更像 Clock、Driver、测试版本或系统负载。矩阵模式比单数字更有诊断价值。

定位时先把每个结果关联到路径代码和实体：源/目标 GPU UUID、PCI BDF、NVLink 或 Switch Port、测试方向和错误 Counter。若异常只出现在一个方向，还要区分发送端、接收端与单向链路；若所有经过同一 GPU 的 Pair 都异常，该 GPU 或其上游路径比“某一对 GPU”更可疑。

应使用健康同 SKU 节点的矩阵作对照，而不是拿所有 Pair 与同一个峰值比较。跨 Root、跨 NUMA 与 NVLink Pair 的预期本就不同。确认异常模式后，再用 Link State、前后 Counter Delta、AER/XID/SXid 和受控复测缩小到端口、设备、共享上游或软件层。

## 第 15 章 · PCIe AER 和链路降级 Runbook

### Correctable、Uncorrectable Non-Fatal 和 Fatal 严重性不同

PCIe AER 可报告 Correctable Replay/Receiver、Uncorrectable Non-Fatal 和 Fatal 等错误。Correctable 单次不一定影响业务，但增长趋势可能预示 Signal Integrity；Fatal 常导致设备或链路不可用。

```bash
journalctl -k -b --no-pager | rg -i 'AER|PCIe Bus Error|NVRM|XID'
lspci -s <bdf> -vv
```

不要清 Counter 后才保存证据。关联 Root Port、Endpoint BDF、时间、GPU XID 和业务失败。

Correctable 表示硬件或协议完成了恢复，不代表可以永久忽略；只有定义时间窗口、负载和增量后，才知道它是历史孤立事件还是持续的信号完整性问题。Uncorrectable Non-Fatal 可能影响一次事务但未让链路整体失效，Fatal 则可能导致设备掉线、Context 失败或需要更高级别恢复。

告警策略应同时考虑严重性与增长速率：Fatal 或伴随设备丢失的错误立即隔离，持续增长的 Correctable 进入趋势告警，历史不增长的计数保留为背景。始终检查 Endpoint 和上游 Root Port 两端，因为内核日志报出的 BDF 可能是检测到错误的 Bridge，而不是最终故障设备。

### 链路降级先排除节能状态再判断硬件

Current Gen 在空闲下降可能是 ASPM/节能；Width 通常不应因空闲随意改变。施加受控负载后仍低于预期，再检查插槽、Riser、Retimer、Firmware、BIOS 和错误 Counter。

重插卡、更换 Cable/Riser 或 BIOS 变更是物理维护动作，需下电与厂商流程。运维先通过同槽位/同卡交叉验证定位故障归属。

诊断时先保存 `LnkCap` 与 `LnkSta`，再施加可重复的数据传输负载并重新采样。Speed 在空闲与负载间恢复通常与节能有关；Width 在负载下仍少于能力值，或伴随 AER/Replay 增长，更应怀疑 Lane、插槽、Riser、Retimer、固件或 BIOS Bifurcation。

交叉验证要一次只改变一个对象，例如同卡换槽位或同槽位换卡，并保留原路径与健康对称路径结果。没有维护授权时只做读操作和性能隔离，不在线执行 `setpci`、设备 Reset 或物理重插。

### 恢复后用原路径负载验证而非只看协商值

Link 恢复 x16/目标 Gen 后，继续运行 H2D/P2P/NCCL，确认带宽、延迟和 AER 增量。静态协商正常但负载下错误复发，节点不能放回生产。

复测应复用故障时的设备 Pair、传输方向、消息规模和并发度。只跑另一组 GPU 或短时轻载，可能绕开原来的 Riser、Switch 上行或 NVLink Port。测试前保存 AER、NVLink Counter 和 XID/SXid 基线，测试后比较增量，避免把历史非零计数误当成复发。

恢复准入还要包含应用层结果：NCCL Bus Bandwidth、训练 Step Time 或实际数据搬运吞吐需回到同 SKU 健康区间，并在观察窗口内保持稳定。若静态值正常但 Counter 继续增长、吞吐随温度下降或压力下再次降宽，节点应继续 Quarantine，转入固件、信号完整性或硬件维护流程。

## 第 16 章 · NVLink 与 NVSwitch 故障矩阵

### Link Down、CRC/Replay 增长和 Fabric Incomplete 分开处理

这三类现象分别回答“端口当前是否连通”“链路在一段时间内是否产生传输错误”和“整个交换 Fabric 是否完成初始化”。它们可能同时出现，但不能用同一恢复动作处理。Link Down 要先确认该 Port 是否按平台拓扑本应启用；CRC/Replay 等累计值要比较时间窗口内增量；Fabric Incomplete 则要检查 FM/NVLSM、路由、分区和设备注册。

| 现象 | 可能层 | 最小证据 |
|---|---|---|
| 单 NVLink Down | GPU Port、Baseboard、Firmware | Link ID、Remote、Counter |
| Counter 增长 | Signal、Temperature、负载 | Before/After、Error Type |
| Fabric Incomplete | FM/NVLSM、Driver、Switch | Service Log、Fabric State |
| P2P Disabled | Topology、ACS、Fabric | Capability、BDF、FM |
| NCCL 回退 | Link/Fabric 或 NCCL 选路 | NCCL INFO、Topology Dump |

排查顺序应从静态关系到动态验证：先核对预期 Peer 和 Port，再保存 Link State 与 Counter 基线，关联 FM/NVLSM、Kernel 和 DCGM Health 日志，最后在隔离节点上运行 P2P/NCCL。DCGM 能观察 NVSwitch 和 Link，并不负责配置 Fabric；看到 Down 或 Fatal 时仍要回到平台控制服务确认初始化状态。

#### Error Counter 必须比较负载窗口增量

NVLink Error Counter 通常是累计值。较早的链路代际常见 Replay、Recovery、CRC 等计数；较新的链路可能提供错误包、Link Recovery、FEC、BER 或分 Lane 原始错误等不同字段。字段名称、可重置能力和统计层级并不跨代际一致，因此 Runbook 应先记录 GPU/NVLink/Driver 版本，再解释本机实际输出。

| 计数类型 | 增量通常说明什么 | 还需要关联什么 |
|---|---|---|
| Replay / Retry | 链路发生重传或重试 | 吞吐下降、负载方向、温度与信号路径 |
| Recovery Event | Link 从正常路径进入恢复流程 | 恢复是否成功、State 是否回到 Active |
| CRC / Rx Error | 接收数据完整性异常 | 对端 Link、Lane、错误是否持续增长 |
| FEC Corrected | 硬件纠正了部分符号错误 | BER 趋势、同路径健康基线、是否逼近不可纠正状态 |
| Recovery Failed / Link Down | 恢复失败或链路退出服务 | Remote Endpoint、FM/NVLSM、XID/SXid 和业务影响 |

一个可复现的观察窗口应保留两次完整快照，而不是只抄最终数字：

```text
T0 记录 GPU UUID Link ID Remote Endpoint State 和全部 Counter
        ↓
在隔离节点对原 GPU Pair 施加固定消息规模和方向的 P2P 或 NCCL 负载
        ↓
T1 再次记录相同字段 并计算每个 Link 的 Counter Delta
        ↓
把 Delta 与传输字节 运行时长 吞吐 XID SXid 和温度放到同一时间窗
```

历史非零但窗口内 `Delta = 0` 只能说明本次负载未复发，不能证明历史事件从未发生；`Delta > 0` 则要看错误类型、增长速度和业务影响。不同 Link 的负载量不同时，不应只比较绝对增量，可以同时记录单位时间和单位传输量的变化。字段显示 `N/A`、命令不支持或监控序列缺失属于“未知”，不能按零处理。

不要为了让报表好看而在采证前重置 Counter。部分代际不支持重置，重置还会破坏历史证据；如果维护流程确实需要清零，必须先持久化 T0、关联事件和平台版本，并在清零后重新建立基线。

恢复标准也应按类型定义。意外 Link Down 需恢复预期端口；错误增长需在同路径负载下停止增长；Fabric Incomplete 需让目标 GPU 的 Fabric State、Partition 和路由完整。仅让服务重新变为 `active` 或让 GPU 重新出现在 `nvidia-smi` 中，都不足以解除隔离。

#### 恢复验证从静态关系逐级推进到真实训练

| 验证层 | 最小动作 | 通过标准 | 失败时回到哪里 |
|---|---|---|---|
| 静态 Link/Fabric | 对照 UUID、Link、Remote、State、Partition 和 FM/NVLSM 日志 | 预期 Endpoint 恢复且 Fabric 完成注册 | Link、Switch Port、FM/NVLSM 或版本配套 |
| P2P Matrix | 对所有 GPU Pair 测能力、带宽和延迟 | 原故障 Pair 恢复且同拓扑组无异常离群 | 单 Link、Peer、PCIe 回退或 P2P 配置 |
| 单节点 NCCL | 固定 GPU 集合、消息规模和测试版本运行 Collective | 算法带宽、Bus Bandwidth 与健康基线一致 | NCCL 选路、局部 Fabric 或 GPU 组合 |
| 真实训练 | 复用代表模型、Batch、Rank Mapping 和数据供给 | Step Time、扩展效率和长尾回到业务基线 | Framework、数据管道或仅在真实通信模式暴露的问题 |
| 观察窗口 | 持续采集 Counter、XID/SXid、FM/NVLSM 和吞吐 | 无新增错误、无重新初始化、性能保持稳定 | 继续 Quarantine 并转入硬件或固件处理 |

这条链路不能跳级：`status` 全部 Active 只说明静态链路状态，P2P 正常只说明指定 GPU Pair，NCCL 正常也不保证真实训练的 Rank Mapping 和消息模式已经覆盖。相反，如果静态关系已恢复但 P2P 仍异常，应先停在链路或路径层；P2P 正常而 NCCL 异常，再检查 Collective 选路；只有 NCCL 正常而真实训练仍慢时，才把重点转向应用时间线、数据供给和计算通信重叠。

### SXid 与 GPU XID 要按实体关联

NVSwitch 错误可能使用 Switch Entity/SXid，GPU 错误使用 XID。两者时间接近可能是同一 Fabric 事件的不同表现。记录 Switch ID、Physical ID、Port/Link 和相连 GPU，而不只保存错误数字。

关联时以时间线和拓扑关系为主，而不是看到相同数字就认为属于同一故障。一个 Switch Port 的异常应回查其 Peer GPU/Port；一个 GPU XID 应回查该 GPU 的所有 NVLink Endpoint、PCIe Root 和当时的 Rank。还要保存来源日志的 Host、Boot ID 和时区，避免多节点日志排序错误。

最小事件记录可包含 `entity_type`、`entity_id`、`physical_id`、`peer`、`error_code`、`first_seen`、`last_seen` 和 `counter_delta`。运行时 Entity ID 可能随服务重启变化，因此要同时保存 GPU UUID、PCI BDF 或 Switch Physical ID。这样才能判断错误集中在单端口、单 GPU、整颗 NVSwitch，还是多个实体共同受到 Fabric 事件影响。

### 相同错误在不同代际的处置可能不同

错误分类、Reset 能力和可恢复性随 GPU/NVSwitch/Driver 变化。Runbook 用厂商当前错误目录建立“可观察、需隔离、需 Reset、需重启、需返场”映射，禁止凭其他代际经验执行破坏性动作。

代际差异还会体现在 Counter 的组织方式和可观测字段上。例如部分旧代际按 Link 报告 CRC、Replay、Recovery，较新代际可能提供 GPU 聚合或不同错误明细；字段不存在或显示 `N/A` 不等于计数为零。自动化必须先识别 GPU、NVLink、NVSwitch 与 Driver 版本，再选择适用字段和阈值。

Reset 前应确认当前架构是否允许单 GPU Reset、是否必须包含全部 NVLink Peer、Fabric Manager 是否参与以及是否仍有活跃 CUDA Context。Runbook 的每个动作都要带适用平台、前置条件、证据保存和回滚边界；不满足条件时升级到维护或厂商支持，而不是试探性执行 Reset。

## 第 17 章 · 拓扑感知调度的验证场景

### 数量调度和拓扑调度用同一作业做 A/B

选择固定四卡训练或 NCCL Test，分别允许随机设备与限定 NVLink Group，记录 Queue Time、分配 UUID、Path Matrix、Throughput 和失败率。拓扑策略收益要扣除更长等待。

A/B 的控制变量应包括镜像、模型或测试二进制、消息大小、GPU 数、节点 SKU、网络与并发背景。数量组只表达“拿到 N 张可用 GPU”，拓扑组则增加同一 NVLink/NVSwitch Clique、GPU-NIC 距离或单 NUMA 等约束。两组每次都记录最终 UUID 与 Rank Mapping，不能仅依据调度规则推断实际组合。

结果至少同时观察作业侧和集群侧：作业侧比较 Startup、Bus Bandwidth、Step Time 和失败率；集群侧比较 Queue Time、调度失败、完整 GPU Group 剩余量和碎片率。若单作业加速明显但等待时间显著上升，应按通信密集型训练、低通信推理等 Workload Class 分级启用，而不是给所有 GPU Pod 强制同一策略。

### 整节点分配减少碎片但降低小作业利用率

大训练节点池可整节点分配以保证 Fabric，一卡推理则使用其他节点池或共享。混在同一池中，短任务会切碎完整 Clique。容量模型按 Workload Shape 建池而非只按 GPU 型号。

整节点的价值是把 GPU、NVSwitch、CPU、Memory 和多 Rail NIC 一次性交给同一作业，减少设备组合不可控和跨租户干扰。代价是当作业只使用部分 GPU、CPU 或 HCA 时，其余资源也无法复用；等待大作业腾挪节点还会增加排队时间。

平台可将节点池分为完整 Fabric 训练池、共享推理池和碎片回填池，并定义何时允许 Backfill。容量报告不只看 GPU Utilization，还要看“可组成完整 8 卡/4 卡 Group 的节点数”。当完整 Group 库存接近阈值时，应限制会切碎节点的单卡工作，而不是等大训练长期 Pending 后再人工清场。

### GPU-NIC 联合放置需要应用最终映射验证

即使 Scheduler 选择正确 Node，容器内 Rank 到 GPU、NCCL 到 HCA 的选择仍可能不同。Job 启动记录最终 Mapping，并让 Admission/Sidecar 检查是否符合 Node Baseline；偏离时 Fail Fast 比跑数小时后性能告警更节省成本。

验证链条应覆盖 `Rank -> CUDA Visible Device -> GPU UUID/BDF -> HCA/Port -> Rail`。Pod 内的 `cuda:0` 只是可见序号，不能直接对应宿主机 GPU0；NCCL 还可能根据可见拓扑、环境变量和网卡状态重新选择接口。因此调度器的预期分配与应用进程实际使用必须分别采集。

```bash
nvidia-smi --query-gpu=index,uuid,pci.bus_id --format=csv
nvidia-smi topo -m
NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,GRAPH,NET <launch-command>
```

启动检查应确认每个 Local Rank 的 GPU UUID、CPU Set 和 HCA 都落在允许组合中，并把结果写入 Job 元数据。若目标 HCA 不可用，不应静默改走远端 NIC 后继续长时间训练；平台可根据作业等级选择 Fail Fast、降级运行或重新排队，并明确记录降级路径。

## 第 18 章 · 拓扑变更的重验范围

### BIOS 变更重验 PCIe、NUMA 和 Power

比较 PCIe Tree/Gen/Width、NUMA/CPU Affinity、IOMMU/ACS、P2P 和 Clock/Power。BIOS 默认恢复可能改变多个字段。

BIOS 变更可能同时影响 PCIe Bifurcation、IOMMU/ACS、Above 4G、NUMA 暴露和电源策略。即使 GPU 数量未变，Peer 流量也可能被重定向到 Root Complex，或链路协商到较低 Width/Gen；因此不能把“系统能启动、GPU 可见”当作验收完成。

重验时保存变更前后 BIOS 配置摘要和拓扑指纹，在受控负载下检查 Link 当前值、P2P Matrix、H2D/P2P 带宽与 AER 增量。若变更是恢复默认值，还要逐项对照节点 SKU 基线，而不是假定厂商默认即为集群生产配置。

### CPU 或主板更换重验所有 Root Path

内存 Channel、Socket/NUMA、GPU/NIC BDF、PCIe Switch、H2D 和跨 Socket。节点身份不变也要重建拓扑指纹。

CPU 或主板更换会改变 Root Complex、PCIe 枚举、NUMA 距离和内存通道状态，原来的 BDF、CPU Affinity 与设备亲和组可能全部失效。主机名和资产编号不变，不代表调度标签、监控关联和绑核配置仍然正确。

维护后先核对 CPU Socket、Core、Memory Channel 和 NUMA，再从每个 Root Port 向下枚举 GPU、NIC 与 Switch。动态测试要覆盖本地 H2D、同 Root P2P、跨 Root/Socket P2P 和 GPU-NIC 路径；确认差异符合新硬件预期后，重新生成亲和组与拓扑指纹，旧 BDF 映射应归档而非继续复用。

### GPU 或 Baseboard 更换重验 UUID 与 Fabric

更新 CMDB UUID/Serial，检查全 Link/NVSwitch/FM、P2P Matrix、单节点 NCCL 和热稳态。旧 UUID 的告警/调度引用清理。

更换 GPU 会引入新的 UUID、序列号和可能不同的固件；更换 Baseboard 还会改变 NVLink Port 与 NVSwitch 连接。旧设备在监控、调度污点、故障工单和许可系统中的引用如果不清理，会出现“新卡健康但仍继承旧卡故障状态”或指标串线。

Fabric 验收要确认所有预期 Endpoint 被发现、FM/NVLSM 初始化完成、GPU Fabric State 和 Link Count 符合基线，并对全 P2P Matrix 与单节点 NCCL 做动态复测。长时间负载下还要观察 NVLink Counter、XID/SXid、温度和 Clock；冷启动正常但热稳态出现错误，仍不能恢复准入。

### NIC 或 Cable 更换重验 GPU-NIC 和 Rail

GUID/MAC/BDF/Switch Port、Firmware、GID/MTU、RDMA/GDR、Multi-Rail 和 Counter。Cable 接错仍可能 Link Active。

NIC 更换会改变 GUID、MAC、PCI BDF 和固件，Cable 更换则可能改变对端 Switch Port 或 Rail。链路显示 `UP` 只证明物理连接建立，不能证明它连接到正确 Leaf、VLAN/PKey、MTU 和预期 Rail；接错端口时普通连通性甚至可能完全正常。

重验需要更新 HCA/Port、Netdev、BDF 和 Switch Port 的资产链，核对 IP/GID/MTU 后分别运行 Host Memory RDMA 与 GPU Buffer GDR 测试。多 Rail 节点还应让各 Rank 使用其预期 HCA，比较每条 Rail 的带宽、延迟和 Counter，确认没有因布线错误让流量集中到单一网络路径。

### Riser、Retimer 更换重验负载下 Link

空闲 Gen/Width、压力 H2D/P2P、AER Delta 和同路径对照。静态 x16 不代表高负载信号完整。

Riser 和 Retimer 位于 PCIe 信号路径中，更换后设备可能正常枚举并协商到目标 x16，却只在持续传输、升温或双向并发时产生 Replay/AER。静态 `lspci` 快照只能作为起点，不能验证信号完整性。

在相同槽位和路径上执行受控 H2D、D2H、P2P 与并发测试，测试前后保存 Endpoint 和上游 Root Port 的 AER、当前 Speed/Width 及 GPU 错误。与同 SKU 健康节点或同机对称路径比较；若错误增量随负载出现，即使吞吐暂时达标也应继续隔离并进入硬件检查。

### Driver/FM 升级重验 Fabric 初始化

Service/API Version、Fabric State、Link、Partition/HA、P2P/NCCL。节点 Ready Gate 等 FM 完成。

Driver 与 Fabric Manager 通常存在明确配套关系，升级一个组件后服务能启动，不代表其 API、路由和分区已正确恢复。升级前要 Drain 节点并保存版本、FM 配置、Partition、Link 和 Fabric State，禁止在活跃 CUDA Context 上替换驱动或控制服务。

升级后先验证 Kernel Driver、FM/NVLSM 日志和目标 GPU 的 Fabric 注册，再检查 Link、Partition 与 HA/Restart 行为。最后运行 P2P 和 NCCL 基线；只有 Node Ready Gate 观察到 Fabric 完成且动态性能恢复，Device Plugin 才应重新向调度器暴露完整资源。

### Kernel/IOMMU 变更重验 P2P 和 Passthrough

IOMMU Group、ACS/Route、Peer Capability/Bandwidth、VFIO/vGPU VM 和 GDR。安全隔离与性能同时通过。

Kernel 参数、IOMMU 模式和 ACS 策略同时影响 DMA 隔离与 PCIe Peer 路由。裸机与虚拟化的要求不同：某种配置可能改善裸机 P2P，却破坏 VFIO 设备隔离；VM 所需的 ACS/ATS 路径也不能直接套用裸机建议。变更必须先确认平台和驱动支持边界。

重验应包含 IOMMU Group、Kernel 启动参数、ACS 状态、P2P Capability 与实测带宽，并对 Passthrough/vGPU VM 验证设备可见性和隔离。使用 GDR 的节点还要核对 `nvidia-peermem` 或受支持的 DMA-BUF 路径。性能通过但隔离失败，或隔离通过但 P2P/GDR 静默绕行，都不能进入生产。

### MIG 或 vGPU Layout 变更重验资源与 Fabric

实例/Profile、Partition、Guest/Pod Visibility、Resource Count、P2P/NCCL 支持和监控映射。销毁实例会改变身份。

MIG 重配置会销毁并重建 GPU Instance/Compute Instance，vGPU Layout 变化也会改变可创建 Profile、实例 ID 与资源数量。物理 GPU UUID 可以不变，但 Pod 或 VM 看到的实例身份、显存/计算边界和监控 Entity 都可能变化，旧的调度分配与告警标签不能继续沿用。

变更后要从物理 GPU 到实例逐层核对：目标 Profile 和数量、Device Plugin 暴露资源、Guest/Pod 可见设备、DCGM 层级及许可状态。P2P、NVLink 与 NCCL 能力取决于具体平台和分区模型，不能从整卡能力推断实例能力；应使用实际 Profile 运行支持范围内的通信和隔离测试。

### Kubelet/调度策略变更重验最终设备组合

CPU/Topology Manager、Device Plugin/DRA、Node Label 和 Scheduler。运行实际 Pod 输出 CPU-GPU-NIC，不只审查配置。

Kubelet 的 CPU Manager、Topology Manager 与 Device Plugin 提示共同影响 Pod 获得的 CPU 和设备，Scheduler 负责选 Node，但通常不掌握容器最终设备序号。修改 Policy、Device Plugin 配置或 Node Label 后，即使 Pod 能成功运行，也可能获得与预期不同的 NUMA 或 GPU Group。

应覆盖单卡、多卡、跨 NUMA 和完整 Fabric Group 等代表性 Pod，记录 Admission 结果、容器 cpuset、GPU UUID/BDF、NUMA 和 HCA。严格策略还要验证不能满足拓扑时是否按设计拒绝，而不是静默降级；宽松策略则要观察实际组合和性能分布，确认调度率收益没有换来不可控的长尾。

### 机架布线变更重验 Scale-Out 路径

Rail/Switch Port、同轨远端、跨机架 Hop、NCCL/RDMA 和故障切换。资产布线图同步。

机架布线决定 GPU 节点的 HCA 是否接入预期 Rail、Leaf 和上联。Cable 接错后 IP 和 RDMA 仍可能可达，但流量会跨更多层级、集中到少数 Rail，导致多节点 Collective 的带宽和尾延迟恶化。布线变更因此既是资产变更，也是性能拓扑变更。

验收先从节点 HCA/Port 追到 Switch Port 和 Rail，再选择同 Rail、跨 Rail、同机架和跨机架端点运行 RDMA 与 NCCL。比较各端口 Counter 和路径带宽，并验证单 Rail/单 Link 故障时是否按设计切换。最终资产图、交换机配置与节点侧 NIC Legend 必须一致，不能只在工单中记录一条 Cable 已更换。

### 恢复准入引用新的 Baseline ID

计划变更后旧 Baseline 归档，新结果经 Review 成为 Current；失败节点保持 Quarantine。不能用变更前阈值选择性判定。

Baseline ID 把一次准入结论绑定到明确的硬件拓扑、软件版本、采集工具和性能区间。没有版本化基线时，运维人员容易在变更后挑选有利的旧指标，或把新平台的正常差异误判为故障。旧基线应只读归档，用于解释历史作业和回滚对照。

新基线不能由待验节点自己自动晋升。应由通过静态拓扑、动态带宽、错误增量和代表工作负载测试的候选结果生成，经 Review 后设为 Current；每台节点的验收记录引用该 ID 与自身结果。未达到基线的节点继续 Quarantine，并保留失败证据，不能通过修改阈值让单节点“追上”基线。

## 第 19 章 · Grace Hopper 与 Extended GPU Memory 的拓扑边界

### EGM 把远端一致内存纳入 GPU 地址空间但不消除距离

Extended GPU Memory 是特定 Grace Hopper/NVLink-C2C 与多节点平台上的 CUDA 内存能力，可让 GPU 通过扩展接口访问其他 Socket 上的 Host NUMA Memory。它扩展可寻址和可共享的数据范围，不会把远端容量变成本地 HBM，也不保证与本地内存相同的带宽和延迟。

单节点多 GPU 可通过 VMM 或 Memory Pool 创建带 NUMA Location 的分配；多节点路径还依赖 Fabric、Socket ID 和平台支持。运维清单需要记录 GPU、CPU Socket、NUMA Node、分配位置和传输路径，性能测试分别覆盖 Local HBM、Local Host、Remote NUMA 和跨节点 EGM。

### EGM 能力必须通过运行时查询和实测验收

不要从产品系列名称推断 EGM 一定可用。验收时核对硬件拓扑、Firmware、Driver、CUDA Toolkit、Allocator API 支持及应用是否实际选择目标 Location。容量增加但 Step Time 变差时，检查是否把热数据错误放到远端层级；节点退化或 Fabric 故障后还要验证地址映射和数据一致性，而不只是进程能重新启动。

运行时查询需要确认目标 GPU 是否支持对应 Handle、Location 与 Fabric 能力，并记录分配实际落在哪个 Socket/NUMA。API 调用成功只证明分配可以建立，不能证明数据访问走在预期路径；测试应分别覆盖本地 HBM、本地 Host Memory、远端 NUMA 与受支持的跨节点位置。

验收指标至少包含可分配容量、访问带宽、延迟、应用 Step Time 和错误行为。应使用冷热数据分层的代表工作负载验证，避免只用顺序拷贝掩盖远端访问成本。Fabric 降级、节点重启或成员变化后，还要重新确认映射可恢复、权限正确且数据一致，再允许依赖 EGM 的作业进入该域。
