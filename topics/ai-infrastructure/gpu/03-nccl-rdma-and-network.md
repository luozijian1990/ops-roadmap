# GPU AI Infrastructure 学习笔记 · NCCL / RDMA / Network

## 第 1 章 · GPU 集合通信模型与拓扑执行

### Rank 和 Communicator 定义通信参与者

分布式 GPU 程序通常为每个参与设备分配一个 Rank。Rank 是通信组中的唯一编号，通常从 0 到 `n-1`；Communicator 则描述哪些 Rank 属于同一个通信上下文以及它们使用的 CUDA 设备。Rank 进程、GPU UUID、节点和网络地址必须能够互相映射，否则一个进程崩溃或错误加入通信组，其他 Rank 可能表现为等待或超时。

创建 Communicator 时应记录 Rank 数量、设备编号、节点名、GPU UUID、NCCL 版本和使用的网络接口。排障时先找全体 Rank 中最早出现的错误，不要只看最后一个超时进程。

### Collective Communication 要求所有参与者遵守同一调用顺序

集合通信是一个通信组内多个 Rank 共同参与的操作。以 AllReduce 为例，每个 Rank 提供一个输入，最终每个 Rank 都获得归约后的结果。调用通常要求参与者使用一致的操作顺序、数据数量和数据类型；某个 Rank 跳过调用、数量不一致或提前退出，都可能让其他 Rank 一直等待。

```mermaid
sequenceDiagram
    participant R0 as Rank 0
    participant R1 as Rank 1
    participant R2 as Rank 2
    R0->>R0: 准备梯度
    R1->>R1: 准备梯度
    R2->>R2: 准备梯度
    R0->>R1: Collective
    R1->>R2: Collective
    R2->>R0: Collective
    R0-->>R0: 获得归约结果
    R1-->>R1: 获得归约结果
    R2-->>R2: 获得归约结果
```

### AllReduce、AllGather、ReduceScatter 和 Broadcast 服务不同并行模式

| 操作 | 输入和输出 | 常见用途 |
| --- | --- | --- |
| AllReduce | 每个 Rank 输入一份，所有 Rank 获得归约结果 | 数据并行梯度同步 |
| AllGather | 每个 Rank 输入一段，所有 Rank 获得完整拼接 | 收集分片激活或参数 |
| ReduceScatter | 先归约，再把结果分片给各 Rank | 优化器分片和 ZeRO 类策略 |
| Broadcast | 一个 Rank 输入，所有 Rank 获得副本 | 初始化参数或配置 |
| Point-to-Point | 指定 Rank 之间发送和接收 | 非对称流水线或自定义通信 |

选择通信操作会影响传输总量、临时缓冲和同步点。平台排障要知道应用使用哪种模式，否则无法解释为什么某一阶段 NVLink 或网络流量突然升高。

#### AllReduce 是数据并行训练的典型同步点

每个 Rank 计算本地梯度后，通过 AllReduce 获得全局归约结果。任何 Rank 计算慢、通信慢或提前失败，都会让其他 Rank 在同步点等待。训练 Step Time 中 AllReduce 占比越高，增加 GPU 数量的边际收益越低。

#### ReduceScatter 与 AllGather 常组合成分片工作流

ReduceScatter 把归约结果切分到各 Rank，AllGather 再在需要时收集分片。参数、梯度和优化器状态分片方案会用这种组合减少单卡显存，但可能增加通信次数和对网络稳定性的依赖。排障时要根据框架并行策略识别具体 Collective，而不是把所有网络阶段都称为 AllReduce。

#### Broadcast 和 Point-to-Point 的故障表现不同

Broadcast 依赖 Root Rank 正常提供数据，Root 失败会影响全组；Point-to-Point 需要发送和接收两端匹配，顺序不一致可能造成等待。流水线并行使用 P2P 时，慢 Stage 会沿流水线传播气泡，与 Collective 的全局同步形态不同。

### NCCL 会根据本地拓扑选择通信路径

NCCL 是面向 NVIDIA GPU 的集合通信库，会发现 GPU、PCIe、NVLink、NVSwitch、NIC 和节点间网络，并据此选择 P2P、Shared Memory、NVLink、Socket 或 RDMA 等传输路径。应用看到的是 Collective API，实际性能取决于 NCCL 选择的路径和底层拓扑。

同一程序在不同节点上性能不同，常见原因不是模型代码变化，而是 GPU 对之间的链路、GPU-NIC 亲和性、PCIe ACS/IOMMU、网卡选择或网络拥塞不同。NCCL Debug 日志和拓扑命令应作为性能回归证据保存。

### Ring 和 Tree 在带宽与延迟之间取舍

Ring 算法把 Rank 组织成环，每个 Rank 分阶段发送和接收数据，适合大消息和追求链路带宽；Tree 算法形成树状聚合和分发，通常能减少小消息的步骤，但对拓扑和根节点路径更敏感。真实 NCCL 可能使用分层或混合算法，不能简单用“Ring 永远更快”作为调优结论。

评估时应按消息大小、Rank 数量、节点数和拓扑分别测量。模型的通信时间还受到计算通信重叠、同步位置和框架 Bucket 策略影响。

#### Ring 的数据分片沿环逐步归约和分发

Ring AllReduce 通常可以理解为 ReduceScatter 加 AllGather 两阶段。每个 Rank 只和相邻 Rank 交换数据分片，所有链路可并行工作，适合大消息充分利用带宽。Rank 数增加会增加步骤，小消息可能被启动延迟主导。

#### Tree 用更少层级传递小消息

Tree 通过上行归约、下行广播完成通信，层级随 Rank 数对数增长，常适合延迟敏感的小消息。但某些父节点或链路承担更多聚合职责，拓扑不均衡时可能形成热点。NCCL 会结合消息大小和拓扑选择算法，人工固定前应先有基准证据。

### Stream、Group Call 和 Buffer Registration 会影响执行方式

NCCL 操作通常绑定 CUDA Stream。调用返回不一定代表 GPU 通信已经完成，应用需要正确处理 Stream 顺序和异步错误。Group Call 可以把多个通信调用组合提交，减少调度开销或表达多 GPU、多线程的批量操作；CUDA Graph Capture 可以把稳定通信序列纳入图执行。

User Buffer Registration 允许通信库在满足条件时直接使用已注册的用户缓冲，减少额外复制，但会增加注册生命周期、内存权限和版本兼容要求。出现性能异常时，应确认应用是否改变了 Stream、Graph、Buffer 或异步错误处理，而不是只调整 NCCL 环境变量。

## 第 2 章 · RDMA、GPUDirect RDMA 与 RoCE 数据面

### RDMA 减少远端 CPU 和内核网络栈参与

传统网络路径通常需要应用把数据交给 CPU 内存，再由网卡经过主机内核和协议栈发送。RDMA 允许网卡在授权后直接读写远端注册内存，减少 CPU 拷贝和内核介入，降低延迟并释放 CPU。

```text
传统路径：
GPU Memory -> CPU Memory -> NIC -> Network -> Remote CPU Memory

GPUDirect RDMA：
GPU Memory -> NIC -> Network -> Remote NIC -> Remote GPU Memory
```

GPUDirect RDMA 并不自动出现。GPU、NIC、PCIe Root Complex、驱动、内存注册、IOMMU 和网络协议都必须满足平台支持条件；拓扑距离过远或配置不支持时，数据可能回退到 Host Memory 路径。

#### Memory Registration 和 Queue Pair 是 RDMA 数据面的基础

RDMA 访问前需要注册内存并获得可供设备使用的地址/Key；通信端点通过 Queue Pair 提交 Send/Receive、Read/Write 等 Work Request，并从 Completion Queue 获取结果。注册失败、Key/权限错误、QP 状态不一致或 Completion Error 都会导致 RDMA 失败，即使 IP `ping` 正常。

#### GPUDirect RDMA 还依赖 Peer Memory 路径

网卡需要能够对 GPU Memory 发起 DMA，并与 NVIDIA Driver、DMA-BUF 或适用的 Peer Memory 机制配合。部署方式随 Kernel、Driver、OFED 和 GPU Operator 版本变化，不能机械复制旧模块配置。验证应以当前支持矩阵、实际 GPU Buffer Perftest 和 NCCL GDR 路径为准。

### InfiniBand、RoCEv2 和以太网的运营边界不同

InfiniBand 是面向高性能计算的交换式 Fabric，网络协议、管理工具和拥塞控制相对专用；RoCEv2 把 RDMA 运行在 UDP/IP 之上的以太网上，可以复用以太网生态，但要求端到端配置 MTU、优先级流控和拥塞控制。

| 维度 | InfiniBand | RoCEv2 |
| --- | --- | --- |
| 生态 | HPC/AI 专用 Fabric | 以太网生态 |
| 配置重点 | Subnet Manager、HCA、端口和分区 | VLAN/DSCP、PFC、ECN、MTU、GID |
| 丢包行为 | 面向高性能无损或受控网络 | 需要构建近似无损路径 |
| 运维特点 | 专用技能和工具 | 网络团队更熟悉但组合更多 |

两种方案都可能达到高吞吐。选型应结合团队能力、交换机和 NIC、故障定位工具、数据中心网络规范以及应用的尾延迟要求。

#### RoCE v1 和 RoCEv2 的可路由范围不同

RoCE v1 运行在以太网二层，通常局限于同一广播域；RoCEv2 封装在 UDP/IP 中，可以经过三层路由，更适合较大规模 Fabric。二者使用的 GID 类型和网络配置不同，主机两端选择不一致会导致连接失败或走错路径。

#### InfiniBand 也需要管理平面和分区

InfiniBand 需要 Subnet Manager 发现 Fabric、分配 LID、计算路径并维护分区。端口 `Active` 不等于目标 P_Key、路由、MTU 和性能都正确。验收要覆盖 Subnet、HCA、Switch Port 和应用通信，而不是只看 Link State。

### HCA、ConnectX、SmartNIC 和 DPU 处于不同层次

HCA 常用于描述 InfiniBand 主机通道适配器；ConnectX 是 NVIDIA 的网卡/适配器产品系列，可以支持以太网和 InfiniBand、RDMA、GPUDirect 等能力；SmartNIC 在网卡侧加入可编程或卸载能力；DPU 进一步把网络、存储、安全和租户隔离等基础设施功能从主机 CPU 中卸载。

这些名称不能互相替换。排障时要记录具体适配器型号、固件、PCIe 位置、端口模式、驱动和 OFED/DOCA 版本。

### PFC 用暂停机制保护优先级流量

Priority Flow Control（PFC）可以针对某个优先级发送 Pause，使交换机或网卡暂时停止该优先级的发送，减少 RDMA 丢包。它需要端到端一致的优先级映射、队列和交换机配置。

PFC 不是免费的可靠性机制。拥塞或配置错误可能产生 Pause Storm 和 Head-of-Line Blocking，把一个拥塞端口的影响扩散到其他流量。告警应同时观察 Pause 帧、队列长度、端口利用率和应用延迟。

排查时不能把“没有丢包”直接等同于健康：PFC 可能只是把丢包转换成发送等待。应核对主机 DSCP/PCP 到 Priority 的映射、交换机入队规则、两端 PFC 收发开关和缓冲池，并在作业窗口计算 Pause Duration 与 Pause Packet 的增量。若 Pause 沿多级端口持续传播，应先定位拥塞源和错误映射，而不是继续扩大缓冲。

### ECN 通过标记拥塞让发送端降速

Explicit Congestion Notification（ECN）允许交换机在队列接近阈值时标记报文，由接收端反馈给发送端，发送端再降低速率。ECN 阈值过低会降低吞吐，过高则可能在队列溢出后才反应；不同交换机、NIC 和 DCQCN 参数需要联合调试。

PFC 负责避免特定优先级的丢包，ECN 负责让发送端感知并收敛拥塞。只开启其中一个，或者只在交换机侧配置而主机侧未映射，都会造成不完整的 RoCE 路径。

判断 ECN 是否有效需要把交换机标记、CNP 反馈、NIC 降速和应用尾延迟连成同一证据链。只有 ECN Mark 增加而发送端没有收敛，可能是 Priority、GID、拥塞控制算法或 NIC 配置不匹配；标记长期为零则既可能代表网络空闲，也可能代表流量未进入预期队列。阈值调整必须在目标消息大小、并发度和真实路径上回归。

### MTU、GID 和队列配置会导致跨节点不通

RoCE 排障不能只运行 `ping`。需要确认网卡接口、VLAN/DSCP、MTU、路由、GID、PFC/ECN、队列和端口状态在两端以及中间交换机一致。

```bash
ip -br link
ip addr show <iface>
ip route get <peer_ip>
rdma link
ibdev2netdev
ibstat
ethtool -S <iface> | rg -i 'drop|error|pause|ecn|pfc'
```

普通 IP 连通而 RDMA 失败，可能是 GID、QP、权限、驱动或 PFC/ECN；小包测试正常而大消息性能差，可能是 MTU、队列、拥塞或路径带宽问题。

#### Packet Loss 和 Congestion 要从计数器增量判断

累计 Counter 可能来自历史维护，不能看到一个非零值就判定当前故障。应在测试前记录基线，测试期间观察 Drop、Discard、Retry、Timeout、PFC Pause、ECN Mark 和 Queue Occupancy 的增量，并与具体端口和作业时间关联。

持续丢包、重传或 Pause 会放大 Collective 尾延迟。一条慢链路足以拖慢整个同步组，因此平均端口带宽正常也不能排除局部拥塞。

## 第 3 章 · NCCL/RDMA 分层排障与网络运营

### 先找所有 Rank 中最早出现的错误

NCCL Timeout 往往是结果而不是根因。一个 Rank 先发生 OOM、进程退出、CUDA 异步错误或网络连接失败，其他 Rank 仍在等待同一个 Collective，最后才统一报 Timeout。排障应收集所有 Rank 的完整日志，按时间排序并定位首错。

```bash
export NCCL_DEBUG=INFO
export NCCL_DEBUG_SUBSYS=INIT,NET,GRAPH,COLL
export NCCL_DEBUG_FILE=/tmp/nccl.%h.%p.log
```

诊断时可以临时固定网卡、关闭某一传输或启用更详细日志，但每次只改变一个变量，并在测试后恢复默认配置。永久禁用 IB、P2P 或 GDR 会掩盖底层问题并损失性能。

### 物理、驱动、RDMA、NCCL 和应用要逐层验证

推荐顺序如下：

```text
电源散热和物理链路
  ↓
GPU PCIe NVLink 和 NIC 枚举
  ↓
驱动、固件、OFED/DOCA 和接口状态
  ↓
IP、MTU、路由、GID、PFC/ECN
  ↓
RDMA Perftest 和带宽计数器
  ↓
GPU Buffer/GDR 路径
  ↓
NCCL Tests
  ↓
框架、Rank、应用和数据加载
```

每一步都要保留成功或失败的证据。没有 RDMA 基础测试结果时，直接跑多节点训练只会把多个变量混在一起。

#### RDMA Perftest 先分离 Host Memory 路径

在目标网卡、端口、GID 和 MTU 下，先运行 Host Memory 的 Read/Write/Send 带宽和延迟测试。常见工具包括：

```bash
ib_write_bw --report_gbits <server>
ib_read_bw --report_gbits <server>
ib_send_lat <server>
```

参数随 InfiniBand/RoCE、设备名、GID Index 和版本变化，执行前应检查帮助。服务端和客户端必须明确绑定目标 HCA/Port，避免自动选择了管理网卡后得到无意义结果。

#### GPU Buffer 测试证明 GDR 数据路径

Host Memory Perftest 正常后，再使用支持 CUDA/GPU Buffer 的测试验证 GPUDirect RDMA。若 Host 正常而 GPU Buffer 失败，重点检查 GPU-NIC 拓扑、Driver/OFED、Peer Memory/DMA-BUF、IOMMU 和容器权限。

#### NCCL Tests 把 GPU 拓扑和网络组合起来

```bash
./all_reduce_perf -b 8 -e 8G -f 2 -g <gpus-per-process>
./all_gather_perf -b 8 -e 8G -f 2 -g <gpus-per-process>
./reduce_scatter_perf -b 8 -e 8G -f 2 -g <gpus-per-process>
```

结果至少关注消息大小、时间、算法带宽 `algbw`、总线带宽 `busbw` 和错误。按单卡、单机多卡、两节点、多节点逐级增加范围，可以定位性能从哪一层开始下降。

#### Bus Bandwidth 不是网卡线速的同义词

`busbw` 根据 Collective 类型对算法带宽做归一化，用于比较通信效率；它不是某一个物理端口的直接吞吐。应结合 GPU/NIC 数量、Rail、消息大小和拓扑，与同平台健康基线比较，而不是直接要求等于交换机端口标称速率。

### 多节点性能下降要区分通信和计算

训练扩展效率低可能来自慢 GPU、拓扑不均衡、网络拥塞、数据加载、Checkpoint 或同步策略。应比较单卡、单节点多卡、跨节点 NCCL 和真实模型的时间线，观察计算阶段、通信阶段和等待阶段的比例。

如果只有某个节点或某条链路的 NCCL Bus Bandwidth 明显低，应比较 GPU-NIC 拓扑、端口错误、重传、PFC Pause 和温度/时钟；如果所有节点在某种消息大小下都下降，则更可能是算法、MTU、拥塞参数或应用 Bucket 配置。

#### 用二分法定位慢节点或慢链路

先比较每个节点的单机 NCCL，再按机架、交换机或 Rail 组合两节点测试，逐步扩大通信组。若加入某节点后性能下降，继续在该节点检查 GPU、HCA、PCIe 和端口；若只在跨某交换机路径时下降，则转向 Fabric 拥塞和配置。

所有测试要使用相同消息范围、进程布局和环境变量，并保存拓扑与计数器。否则“二分”同时改变了多个变量，无法形成有效结论。

### 网络验收必须覆盖带宽、延迟、错误和稳定性

AI 网络验收不能只测一次峰值带宽。至少应记录：

- 单端口和多端口吞吐；
- 小消息延迟和大消息带宽；
- RDMA Read/Write、GPU Buffer 和 GDR 路径；
- NCCL AllReduce、AllGather 和 ReduceScatter；
- 并发作业下的端口错误、丢包、PFC Pause、ECN 标记和队列；
- 持续运行期间的热、固件和链路恢复事件。

测试应覆盖目标节点、目标交换机路径和真实拓扑。只在两台空闲机器上获得的结果，不能证明生产集群在多租户高峰期仍然稳定。

#### 验收结果需要阈值和证据

每个测试项记录硬件范围、命令、参数、期望区间、实际结果、持续时间、错误计数增量和日志位置。峰值测试之外，还应有长时间稳定性、并发作业和故障恢复测试。

节点上线基线可以按同型号、同机架和同路径形成分布。低于健康节点中位数一定比例的节点进入隔离复测，而不是使用一个脱离环境的互联网性能数字。

### 网络变更要与 GPU 作业和故障域联动

修改 MTU、QoS、PFC、ECN、NIC 固件或交换机配置前，应标识受影响的节点、HCA、VLAN 和作业队列，安排维护窗口并准备回滚。变更后先运行分层网络测试，再恢复通信密集型训练；出现跨节点性能下降时，应能通过节点、端口和 GPU UUID 反查影响范围。

网络平台的目标不是让某个测试命令输出最大数字，而是让 GPU 在真实训练和推理中少等待、可观测、可恢复，并且不会因为拥塞把管理和存储流量一起拖垮。

一次可回滚的变更应保存变更前配置与计数器、受影响作业清单、验证命令和恢复条件。验证顺序仍从 Link、Host RDMA、GPU Buffer、NCCL Tests 到真实作业逐层推进；若某层失败，停止扩大流量并回滚。通过后再对比 P50/P99 Step Time、错误计数增量和 Rail 利用率，确认变更没有把故障转移到另一条路径。

## 第 4 章 · NCCL 日志、环境变量和基线管理

### NCCL Debug 日志要按 INIT、GRAPH、NET、COLL 阅读

#### INIT 阶段确认 Rank 和接口发现

INIT 日志可以看到 NCCL 版本、Rank、Bootstrap Interface、GPU/Process 映射和 Communicator 初始化。节点间使用了管理接口、Rank 数量不一致或某 Rank 初始化失败，通常在此阶段出现第一条异常。

#### GRAPH 阶段确认拓扑和 Channel

GRAPH 相关日志描述 NCCL 发现的 GPU、NIC、P2P 和通信图。重点比较健康/异常节点是否选择相同 HCA、是否启用 P2P/GDR、Channel 数和路径是否变化。不要只截取最后一行 Error。

#### NET 阶段确认 Socket、IB/RoCE 和 GDR

NET 日志可以帮助判断使用 Socket 还是 IB Plugin、选择哪个 HCA/Port/GID、连接是否超时以及 GDR 是否启用。应用意外回退 Socket 时仍可能运行，但带宽和 CPU 开销会明显变化。

#### COLL 阶段连接到具体 Collective

COLL 日志量可能很大，只在受控复现中开启。它用于确认 Collective、消息大小和调用序列；生产长期全量开启可能产生大量 I/O 并影响性能，应设置独立目录、容量和清理策略。

### NCCL 环境变量只应用于诊断或经过验证的调优

| 变量类别 | 用途 | 风险 |
| --- | --- | --- |
| `NCCL_SOCKET_IFNAME` | 固定 Socket 接口 | 可能选错管理网 |
| `NCCL_IB_HCA` | 固定 HCA/Port | 可能破坏多 Rail 和亲和性 |
| `NCCL_P2P_DISABLE` | 临时排除 P2P | 永久使用会损失节点内性能 |
| `NCCL_IB_DISABLE` | 临时回退 Socket | 掩盖 RDMA 故障 |
| `NCCL_DEBUG*` | 增加证据 | 日志量和 I/O 开销 |

环境变量语义和默认值会随 NCCL 版本变化，应用前检查对应版本文档。诊断完成后移除临时禁用项，并重新运行基线，避免“修复”只是换到慢路径。

### 网络计数器要建立测试前后差分

#### 主机侧

```bash
ip -s link show <iface>
ethtool -S <iface> | rg -i 'drop|discard|error|pause|ecn|pfc|retry'
rdma statistic show
```

#### Fabric 侧

交换机应观察目标端口的 In/Out Discard、CRC、Buffer、Queue、PFC Pause、ECN Mark 和利用率。测试开始前记录快照，结束后计算增量，并与 Rank/GPU/NIC 映射关联。

只有应用慢而所有相关 Counter 无增量时，再重点看 GPU Compute、Collective 调用、消息大小和 Framework；Counter 持续增长则先修复网络路径。

### 通信基线应覆盖消息大小和拓扑矩阵

小消息主要暴露延迟和启动开销，大消息暴露持续带宽。基线应覆盖应用真实消息范围，按 GPU 数、节点数、机架、Rail 和 Collective 记录。只保存一个 8 GiB AllReduce 峰值无法解释训练中的小 Bucket 性能。

```text
Baseline Key = GPU Model + Driver + NCCL + Topology
             + HCA/Firmware + Network Config
             + Collective + Rank Count + Message Size
```

任何 Driver、NCCL、OFED、Firmware、MTU/PFC/ECN 或拓扑变更，都应触发相关基线回归。

## 第 5 章 · Communicator、Collective 与异步执行语义

### Rank 身份必须在所有参与进程中唯一且一致

NCCL Communicator 把一组 CUDA Device 组织成通信域，每个参与者获得 `[0,n-1]` 内唯一 Rank。Rank 不是 Kubernetes Pod 序号，也不必等于本机 GPU Index；它通常由分布式框架依据 World Size、Node Rank 和 Local Rank 计算。

```text
Global Rank = Node Rank x Local World Size + Local Rank
```

多进程启动时要保证所有进程看到相同 World Size、同一个 Unique ID 和不重复 Rank。配置错可能表现为初始化 Hang、连接到错误 Peer，或一部分 Rank 已进入 Collective 而另一部分仍等待初始化。

#### Local Rank 到 GPU UUID 的映射必须落盘

`CUDA_VISIBLE_DEVICES` 会重排容器内逻辑序号。每个进程启动时应记录 Hostname、Pod UID、Global Rank、Local Rank、Visible Device、GPU UUID、PCI BDF、HCA 和 IP/GID。否则出现 Rank 17 超时时，平台无法知道对应哪张卡和哪条链路。

```bash
nvidia-smi --query-gpu=index,uuid,pci.bus_id --format=csv
env | rg 'RANK|WORLD_SIZE|LOCAL_RANK|MASTER|NCCL|CUDA_VISIBLE'
```

环境变量可能包含集群地址但通常不应包含密钥；证据采集仍需按组织脱敏规则处理。

### Communicator 初始化包含引导与 Transport 建链

初始化大致经历 Bootstrap Peer Discovery、拓扑发现、Channel/Algorithm 规划、Transport 选择和连接建立。Bootstrap 能互通只表示控制消息成功，不代表后续大流量 RDMA 数据面可用。

```mermaid
flowchart LR
    A[Bootstrap] --> B[Exchange Peer Info]
    B --> C[Discover Topology]
    C --> D[Select Transport]
    D --> E[Create Connections]
    E --> F[Communicator Ready]
```

初始化 Hang 应先区分所有 Rank 都未开始、部分 Rank 未加入、Bootstrap 连接失败、某个 NIC/HCA 建链失败，还是 CUDA Context/Fabric 未准备好。直接调整 NCCL Timeout 会延长等待，却不能修复缺失 Rank。

### 所有 Rank 必须以兼容顺序调用 Collective

一个 Collective 要求参与 Rank 对 Count、Datatype、Operation、Root 和调用顺序达成一致。Rank 0 调用 AllReduce 而 Rank 1 调用 Broadcast，或不同 Rank 因数据分支少调用一次，通常会 Hang 或报异步错误。

Point-to-Point Send/Recv 也必须构造匹配关系。多个阻塞式操作顺序不一致可能产生循环等待，Group Call 可用于同时提交一组通信，但不会自动纠正 Peer 或 Count。

#### In-Place Operation 仍需满足 Buffer 布局规则

NCCL 不使用 MPI 的特殊 `IN_PLACE` 常量，而是通过输入输出指针关系识别原地操作。不同 Collective 对合法 Offset 有不同要求。错误重叠可能造成数据损坏，不能只因 API 返回成功就认为数值正确。

### AllReduce 的通信量随 Rank 数逼近两倍张量大小

Ring AllReduce 通常分 ReduceScatter 和 AllGather 两阶段。对每个 Rank 的近似收发数据量可写为：

```text
Bytes per Rank ~= 2 x Tensor Bytes x (N - 1) / N
```

这是算法层近似，不包含协议 Header、Chunk、重试和拓扑绕行。它说明模型梯度为 `G` 时，网络预算不能只按 `G` 计算一次传输。

这个公式适合估算每 Rank 的数据移动量，不等于某个网卡端口必然承载相同字节数。NCCL 可能把流量分到多个 Channel、Rail 或分层路径，节点内部分还可能由 NVLink/NVSwitch 承担。容量规划应把张量大小、同步频率、Rank 数、Bucket 分布和实际 GPU-NIC 映射一起代入，再用 `algbw`、`busbw` 与端口计数器验证估算。

### 不同 Collective 对应不同模型并行数据

| Collective | 数据变化 | 常见用途 |
|---|---|---|
| AllReduce | 每个 Rank 获得 Reduce 结果 | Data Parallel Gradient |
| ReduceScatter | Reduce 后每个 Rank 保留分片 | ZeRO/FSDP 通信阶段 |
| AllGather | 收集所有 Rank 分片 | 参数或激活重建 |
| Broadcast | Root 数据发给所有 Rank | 初始化和状态同步 |
| AllToAll | 每个 Rank 向所有 Rank 交换不同分片 | MoE Expert Routing |
| Send/Recv | 指定 Peer 间传输 | Pipeline Parallel |

模型并行策略改变消息大小、频率和通信邻接关系。AllReduce 基线优秀，不保证 AllToAll 密集的 MoE 同样高效；验收应按实际 Parallelism 选择 Collective。

### Bucket 大小在重叠、延迟和内存之间取舍

训练框架把多个 Gradient 聚合成 Bucket。Bucket 太小会产生大量 Collective Launch 和小消息延迟；太大则要等更多 Backward 完成，减少 Compute/Communication Overlap，并增加 Buffer 峰值。

优化要比较：

- Collective 次数和消息大小分布；
- Backward 与 AllReduce 时间线重叠率；
- Peak Memory；
- Step Time 与长尾 Rank；
- 网络带宽和每条 Rail 利用率；
- Gradient Ready 顺序。

固定一个“推荐 Bucket”对所有模型无效。Transformer 层数、参数 Shape、并行方式和网络延迟都会改变最佳点。

### Ring、Tree 和分层算法服务不同规模

Ring 倾向充分利用持续带宽，但步骤随 Rank 数增长；Tree 减少步骤，适合延迟敏感或更大规模，但每层链路负载和拓扑不均可能影响结果。分层算法可先在节点内经 NVLink/NVSwitch 聚合，再跨节点经 RDMA 通信。

NCCL 会根据消息大小、Rank 数和拓扑选择 Algorithm/Protocol。强制环境变量适合做二分实验，不应未验证就固化生产默认值。

同一作业也可能因消息范围不同而采用不同组合，因此基准要覆盖小 Bucket、常见梯度 Bucket 和大张量，而不是只测试一个峰值点。若固定算法改善某一区间却拖慢整体 Step，应保留自动选择；只有在目标版本、拓扑和消息分布上持续获益，并有清晰回滚条件时，才适合进入平台配置。

### NCCL 调用入队到 CUDA Stream 后才由设备推进

NCCL Collective 与指定 CUDA Stream 关联，Host API 返回通常只表示通信工作已入队。读取输出前必须建立正确 Stream 依赖。把 NCCL 放在通信 Stream，却让计算 Stream 未等待 Event 就读取结果，会形成竞态。

```text
Compute Stream  Gradient Ready -> Event -> Later Compute Wait
                                      |
Comm Stream                         Wait -> AllReduce -> Event
```

同步整个 Device 可以保证正确性但会损失重叠。框架通常用 Event 建立细粒度依赖，平台分析应从时间线确认，而不是建议盲目插入 Barrier。

### Group Call 同时服务连接建立与批量提交

`ncclGroupStart`/`ncclGroupEnd` 可把多个操作作为一组提交，多 GPU 单线程管理和 P2P Pattern 常依赖它避免顺序死锁。Group End 可能承担此前操作的初始化或提交成本，因此 API Time 集中在 Group End 不一定是异常。

Group 内的错误处理必须检查最终返回值，且所有 Rank 调用结构仍需匹配。嵌套、提前 Return 或异常路径漏掉 Group End 会破坏 Communicator 状态。

### 异步错误需要轮询并协调所有 Rank Abort

网络故障、Peer 退出或设备错误可能在通信已经入队后发生。应用应通过 NCCL Async Error 机制检测，并让所有相关 Rank 协调退出和销毁 Communicator。只 Kill 一个卡住进程可能让其他 Rank 继续等待。

故障处理要区分：

| 状态 | 处理方向 |
|---|---|
| 初始化尚未完成 | 检查 Rank、Bootstrap 和 Transport |
| Collective 已入队无进展 | 检查 Peer、网络和调用匹配 |
| Async Error 返回 | 保存首错并协调 Abort |
| CUDA Context 已失败 | 隔离设备并重建进程 |
| 某 Rank 被 OOM/Kill | 终止完整 Job 而非无限等待 |

Timeout 是故障检测预算，不是性能优化参数。设置过短会误杀暂时抖动，过长会占据 GPU 和队列资源；应结合最大健康 Step、Checkpoint 和网络恢复目标设定。

### Buffer Registration 降低重复注册和拷贝成本

RDMA 传输前需要让 NIC 获得 Buffer 访问权限。NCCL User Buffer Registration 可对符合条件的 Buffer 复用注册，减少内部中转或重复 Pin/Register 成本。是否生效受 Allocator、地址稳定性、网络插件、拓扑和版本限制。

注册并不等同于数据已经发送，也不扩大 Buffer 生命周期。应用提前释放、重新映射或跨不支持的 Memory Pool 使用，可能导致错误或回退。性能验证要从 NCCL Log 和 Profiler 确认实际路径。

## 第 6 章 · RDMA 对象与 InfiniBand/RoCE 控制面

### Memory Region 让 HCA 获得受控 DMA 权限

RDMA 应用把 Host 或 GPU Buffer 注册为 Memory Region，得到 Local Key 和 Remote Key。Key 与 Protection Domain、Address 和 Length 共同限制访问范围。注册成本较高，频繁注册短 Buffer 会影响性能。

```text
Application Buffer
  -> Memory Registration
  -> MR with lkey and rkey
  -> Work Request
  -> Queue Pair
  -> HCA DMA
```

GPUDirect RDMA 还要求 NVIDIA Peer Memory 路径、DMA-BUF 或相应 Kernel/Driver 集成，使 HCA 能映射 GPU Memory。`ib_write_bw` 使用 Host Buffer 成功，只证明基础 RDMA，不证明 GDR。

### QP、CQ 和 Work Request 构成 RDMA 执行队列

Queue Pair 包含 Send Queue 和 Receive Queue；应用提交 Work Request，HCA 执行后在 Completion Queue 产生 Completion。QP State、Retry、RNR、Timeout 和 Path MTU 错误都会影响连接。

运维不需要编写 Verbs，但要认识常见失败层：

- QP 无法从 INIT 到 RTR/RTS：地址、GID、路由或权限；
- Completion Error：Remote Access、Retry Exceeded、Local Protection；
- RNR Retry：对端 Receive 未准备；
- 高 Retry/NAK：丢包、拥塞或 Peer 异常；
- 注册失败：Locked Memory、Driver、IOMMU 或 GDR 组件。

### GPUDirect RDMA 有完整前提链

```mermaid
flowchart LR
    G[GPU Memory] --> P[PCIe Peer Path]
    P --> H[HCA]
    H --> N[RDMA Network]
    N --> R[Remote HCA]
    R --> X[Remote GPU Memory]
```

链路成立通常要求兼容 GPU/HCA、支持的 Driver 和 OFED、Peer Memory 或 DMA-BUF、正确 PCIe Topology、IOMMU/ACS 配置、容器设备权限、足够 Memlock、NCCL 识别 HCA，以及网络本身健康。

#### GDR Read 和 Write 可能表现不同

不同平台、PCIe Root 和 NIC/GPU 代际对 GPU Direct Read/Write 性能不同。测试需同时覆盖方向、消息大小和并发。单一 Write Bandwidth 不能代表双向 AllReduce。

### InfiniBand Fabric 由 Subnet Manager 建立路径

InfiniBand Port 具有 LID/GID 等地址信息，Subnet Manager 发现拓扑、分配标识并配置转发表。物理 Link Active 但 SM 缺失或分区配置错误时，端口仍可能无法正常通信。

```bash
ibstat
ibv_devinfo
rdma link show
```

检查时记录 HCA、Port、State、Physical State、Rate、LID、GID 和 Firmware。双口卡不能只看 Device 总状态。

### RoCEv2 依赖以太网与 IP 路由一致性

RoCEv1 工作在二层广播域，RoCEv2 使用 UDP/IP 可跨三层路由。应用选择的 GID Index 决定 RoCE 版本、IP Family 和 VLAN 上下文。选错 GID 可能连接失败或走到非预期网络。

```bash
show_gids
ibv_devinfo -v
ip -d link show <iface>
ip route get <peer-ip>
```

容器网络、Host Network、Multus 和 SR-IOV 会改变 Namespace 内可见地址。必须在实际工作负载 Namespace 验证 Route、MTU 和 RDMA Device，而不是只在宿主机测试。

### PFC、ECN 和 ETS 分别处理暂停、拥塞信号和带宽

PFC 按 Priority 暂停流量以减少丢包，但持续 Pause 会传播拥塞并造成 Head-of-Line Blocking；ECN 在队列达到阈值时标记包，由端系统降速；ETS 在不同 Traffic Class 间分配带宽。

三者必须端到端一致：DSCP/PCP 到 Priority 映射、Switch Queue、PFC Enabled Priority、ECN Threshold 和 NIC Congestion Control。只在服务器打开 PFC 而交换机映射不同，不会形成可靠 Lossless Class。

#### Pause 为零和 Pause 很高都不能单独判健康

无 Pause 可能表示没有拥塞，也可能表示 PFC 未正确配置；高 Pause 可能成功阻止丢包，也可能代表严重拥塞。必须结合 ECN Mark、Discard、Queue Occupancy、Throughput 和 Tail Latency。

## 第 7 章 · 通信测试、拓扑发现与 Transport 选择

### 测试按 Link、RDMA、GPU Buffer、NCCL 和应用递进

| 层次 | 工具或证据 | 证明范围 |
|---|---|---|
| Physical | `ethtool`、`ibstat`、Switch Port | Link 和基本错误 |
| IP/MTU | `ping`、Route、Namespace Test | 地址与 MTU 路径 |
| RDMA Host | Perftest Host Buffer | Verbs 和网络数据面 |
| RDMA GPU | CUDA/GDR Perftest | GPU Memory Direct Path |
| NCCL | `nccl-tests` | Collective 与 NCCL 选路 |
| Application | Step/Token/Latency | 最终业务效果 |

上一层通过只证明其范围，不能跳过下一层。尤其 `ping` 成功不代表 RDMA Queue 和 Priority 健康，Host RDMA 成功也不代表 GPU Buffer 注册成功。

### Perftest 必须保证两端参数和测试方向一致

测试要固定 Device、Port、GID Index、MTU、Message Size、Iteration、QP 数、双向模式和 Buffer Type。Server 与 Client 参数不一致可能直接失败或得到不可比较结果。

记录命令之外，还要保存测试期间 NIC/Switch Counter 增量、CPU/GPU NUMA、HCA/GPU BDF 和背景流量。共享网络上的最佳一次结果不构成基线。

服务端先进入监听，再由客户端发起测试；Read、Write、Send 与双向模式回答的问题不同，不能互换结果。Host Buffer 通过后再换 GPU Buffer，能把 Verbs/Fabric 问题与 GDR 注册问题分开。若结果异常，先用相同参数重复并交换两端角色，再检查是否只在一个方向、端口或 GID 上退化。

### NCCL Tests 的 algbw 和 busbw 回答不同问题

`algbw` 表示算法层有效数据吞吐，`busbw` 按 Collective 通信量做归一化，便于比较互连利用。不同 Collective 的换算因子不同，不能把 AllReduce BusBW 与 AllGather AlgBW 直接横向比较。

```bash
NCCL_DEBUG=INFO ./build/all_reduce_perf -b 8M -e 4G -f 2 -g 8
```

这是单机示例。多节点需使用集群启动器，并明确每节点进程/GPU 数、网卡选择和权限。生产跑大消息会占满 Fabric，应在验收窗口或隔离测试网络执行。

#### NCCL Debug 日志要按阶段和 Rank 聚合

日志至少分析 Bootstrap、Topology、Channel、P2P/SHM/NET Transport、HCA/GID、GDR、Algorithm/Protocol、Async Error。单个 Rank 日志可能缺少对端原因，所有 Rank 应统一时间并按 Job ID 收集。

### 二分环境变量只用于验证路径假设

短时禁用 P2P、IB、GDR 或限定 Interface 可以判断某条路径是否相关，但会改变性能和拓扑。每个实验要记录原始值、假设、预期现象、实际结果和恢复状态。

如果禁用 IB 后 Job 不再 Hang，只能说明问题与 IB Path 相关，不能直接证明 HCA 硬件坏；还可能是 GID、MTU、PFC、Plugin、GDR 注册或 NCCL 版本。最终必须修复正确高速路径并重新达到基线。

二分顺序应从影响最小、边界最清晰的变量开始，例如先限定 HCA/Interface，再分别比较 Host RDMA、GDR、P2P 和 Socket 回退。每次实验只改变一个变量，并保存全体 Rank 日志及计数器；多个禁用项同时出现，即使作业恢复也无法判断是哪条路径产生作用。实验结束必须清理临时环境变量，避免慢路径泄漏到后续生产任务。

### NCCL 把 GPU、CPU、PCIe、NIC 和 Link 建成拓扑图

NCCL 初始化时读取 CUDA/NVML、sysfs 和网络设备信息，估算路径类型与带宽，再构造 Ring/Tree/Channel。容器缺少 `/sys` 信息、设备被虚拟化或平台拓扑未被版本识别时，可能生成次优路径。

`NCCL_DEBUG=INFO` 可看到网络接口、Channel 和部分选路，`NCCL_DEBUG_SUBSYS=INIT,GRAPH,NET` 等可缩小输出。具体 Subsystem 随版本变化，正式使用前检查 NCCL 文档。

```bash
NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,GRAPH,NET ./build/all_reduce_perf -b 1M -e 1G -f 2 -g 8
```

Debug Log 会显著增加输出，多 Rank 长任务应写入独立文件并设置保留上限。

### P2P、SHM、NET Socket 和 NET IB 有清晰优先路径

同进程/节点内优先使用可用 GPU P2P；不能 P2P 时可经 Shared Memory/Host；跨节点使用 Network Plugin 的 Socket 或 IB/RDMA。实际组合受拓扑和阈值影响。

```text
Same Node
  GPU P2P via NVLink or PCIe
  -> Shared Memory fallback

Cross Node
  NET IB or Network Plugin
  -> Socket fallback
```

看到 Socket 不一定错误，例如无 RDMA 环境本就如此；在预期 GDR 的训练集群出现 Socket，则应检查 Plugin、HCA、权限和配置。

### 自定义 Topology File 是受版本约束的高级能力

特殊虚拟化或平台可提供 NCCL Topology XML，但错误描述 Link、CPU Affinity 或带宽会让选路更差。文件必须随 Node SKU 和 NCCL 版本验证，不应从另一服务器复制。

更新 Topology File 后运行单节点和多节点矩阵，并保存 NCCL Dump 对照。平台自动注入时，用 Image/Config Version 标记，避免不同 Pod 获得不同拓扑定义。

自定义文件只应修正平台无法正确发现的事实，不应用来伪造更高带宽或绕过真实故障。验收要对比自动发现与自定义图中的 PCI BDF、CPU/NUMA、GPU-NIC 距离和 Link 类型，并在升级 Driver、NCCL、虚拟化层或 Node SKU 后重新验证；解析失败或性能回退时应能立即撤回注入。

## 第 8 章 · NCCL 环境变量的治理边界

### Interface 选择变量要使用明确允许列表

节点可能同时有管理网、Pod 网、Storage 网和 RDMA 网。NCCL Bootstrap/Socket 与 RDMA HCA 选择不能依赖偶然接口排序。允许列表按 Node Pool 生成，并验证容器 Namespace 内名称。

排除 Docker/Veth 的模糊 Pattern 可能误伤真实接口；接口 Rename 后旧配置可能让 NCCL 找不到网络。变更时记录最终 Log 中实际选中的 Netdev/HCA。

允许列表需要区分 Bootstrap/Socket 接口与 RDMA HCA：前者保证 Rank 能交换控制信息，后者承载集合通信数据，两者不一定是同一网络。上线检查应从 Pod 内核对接口名、IP/Route、HCA Port 和 GID，再从 NCCL `INIT`、`NET` 日志确认最终选择；只检查宿主机配置会遗漏 Network Namespace 和 CNI 造成的差异。

### 禁用变量只用于二分而不作为永久默认

| 实验方向 | 能验证的假设 | 不能直接证明 |
|---|---|---|
| 禁用 P2P | 问题与节点内 P2P 相关 | 某 GPU 必然损坏 |
| 禁用 IB | 问题与 RDMA Path 相关 | 交换机必然故障 |
| 禁用 GDR | GPU Buffer Direct Path 相关 | Host RDMA 健康 |
| 限定 HCA | 某 Rail/Port 相关 | 其他 Rail 物理损坏 |
| 固定 Algorithm | 自动选路可能相关 | 固定项适合所有消息 |

所有诊断变量设置 Expiry 和 Owner。平台 Admission 可拒绝用户长期设置危险全局变量，或至少把偏离默认的 Job 标记出来。

### Timeout、Retry 和 Socket Thread 改动要有负载依据

增大 Timeout 可容忍极慢初始化，却延长真实故障占用；增加 Socket Thread/Connection 可能提高 TCP Throughput，也增加 CPU。任何调优都要在目标消息分布、节点规模和故障注入下验证。

先用健康运行的初始化时间、最长 Collective 和 P99 Step 建立预算，再决定重试与超时范围。调大参数后还要验证 Peer 退出、单 Rail 中断等故障能否在目标时间内释放资源；调高 Socket 并发则同步观察 CPU Affinity、软中断和通信线程占用。没有负载证据的“更大”配置，可能只是把错误发现推迟或把瓶颈转移到 CPU。

### 配置优先级需要可追溯

NCCL 配置可能来自 Image ENV、Launcher、ConfigMap、系统配置文件和用户 Job。事件包应输出最终环境和配置来源。相同镜像只有某 Namespace 慢时，优先比较 Admission 注入与 Job Spec。

平台应明确配置优先级、Owner、适用 Node Pool、到期时间和回滚值，并在作业启动时记录合并后的最终结果。诊断临时项与生产默认项要分层管理，避免用户变量静默覆盖集群策略。复现问题时使用相同配置快照；否则“同一镜像”仍可能因 Launcher 或 Admission 差异走完全不同的传输路径。

## 第 9 章 · 多 Rail 与 GPU-NIC 映射

### 多 Rail 的目标是并行使用独立网络路径

8 GPU 节点可能配 4 或 8 个 HCA，每个 HCA 靠近一组 GPU。理想情况下 Rank 使用本地 HCA，并让流量均匀分布到不同 Rail。所有 Rank 错选同一 HCA 会让其他端口空闲、单端口拥塞。

```text
GPU0 GPU1 -> HCA0 -> Rail0
GPU2 GPU3 -> HCA1 -> Rail1
GPU4 GPU5 -> HCA2 -> Rail2
GPU6 GPU7 -> HCA3 -> Rail3
```

实际映射从 `nvidia-smi topo -m`、BDF 和 NCCL Log 验证，不能按接口编号假设。

### Rail-Optimized Fabric 需要端到端保持同轨

服务器 HCA0 接入 Leaf/Spine 的 Rail0，远端对应 HCA 也应在同 Rail 可达。布线或路由跨 Rail 会增加 Hop、Oversubscription 或不可达。资产系统应保存 Server Port 到 Switch Port/Rail 映射。

“同轨”需要同时成立于布线、交换机端口、路由和 NCCL 选路，而不只是服务器接口命名一致。验收时从一个 Rank 出发，沿 `GPU UUID -> PCI BDF -> HCA Port -> Leaf Port -> Spine/Rail -> Remote HCA` 还原路径，并比较每条 Rail 的字节与等待计数。若一条 Rail 长期空闲而另一条拥塞，应先检查映射和路由，不能简单归因于 Collective 不均匀。

### 单 Rail 故障要定义降级还是停止

Rail Down 后 NCCL 可能使用剩余 HCA 继续，但带宽下降、流量重分布并可能拥塞。平台要定义：关键大训练是否 Fail Fast；推理是否允许降级；节点是否自动 Cordon；何种基准通过后恢复。

继续运行只适合业务明确接受吞吐下降且剩余路径有容量的场景，否则故障 Rail 会把流量压到健康 Rail，扩大整个 Fabric 的尾延迟。策略应给出检测信号、作业终止或降级阈值、节点隔离动作和恢复基准；修复后先跑单端口、跨节点 NCCL 与并发回归，再解除 Cordon，不能只凭 Link 重新 `Active` 就恢复调度。

### NUMA 绑核也要覆盖 HCA Completion 处理

RDMA Polling/Progress Thread 在远端 NUMA 运行会增加 CPU Link 流量。检查 Launcher CPU Binding、IRQ/NUMA 和 HCA Affinity。不要为追求本地性把所有通信线程挤到少量 Core，造成 CPU Saturation。

CPU 绑定应把数据加载、框架主线程、NCCL/RDMA Progress 和网卡 IRQ 一起考虑。GPU 与 HCA 虽处于同一 NUMA，若 Completion 线程被绑到另一 Socket，或本地 Core 已被 DataLoader 占满，仍会出现延迟抖动。对比健康节点时同时记录 CPU Set、NUMA Distance、软中断、上下文切换和 HCA BDF，并以 Step Time 验证，而不是只看拓扑矩阵。

## 第 10 章 · InfiniBand 与 RoCE 端到端验证

### P_Key 控制 InfiniBand Partition 成员关系

InfiniBand Partition 类似 Fabric 访问域，端口必须具有匹配 P_Key 才能通信。Link Active、LID 正常但跨租户连接失败时，检查 P_Key 与 Subnet Manager 配置。

分区提供网络层访问控制，不代替 Kubernetes NetworkPolicy、Host 权限和作业认证。变更 P_Key 会影响现有 QP，应按网络维护流程执行。

端口可以同时拥有多个 Partition 成员关系，QP 使用的 P_Key 必须与对端和路径策略兼容。出现 Link/LID 正常但只有特定租户或节点组合不通时，应从 SM 配置、端口 P_Key 表和实际工作负载选择的分区逐端核对。排障采集要避免把完整租户策略公开到普通作业日志中。

### Adaptive Routing 与静态路由影响热点分散

大规模 Fat-Tree/Dragonfly Fabric 可能使用 Adaptive Routing、SHARP 等能力。路径选择和 Collective Offload 取决于交换机、Firmware、Subnet Manager 与 NCCL Plugin。启用后需验证消息规模和故障收敛，不能只看功能开关。

Adaptive Routing 的价值是把流量分散到多条等价路径，但也会使单次抓包或单端口观察难以代表完整通信；静态路由更易复现，却可能长期集中热点。验证应覆盖均匀 AllReduce、Incast/AllToAll、并发作业和链路故障，并比较吞吐、尾延迟、XmitWait 与路径分布。若启用 Offload，还需确认应用和 Plugin 实际使用，而非仅交换机声明支持。

### Port Counter 要计算测试窗口增量

累计 Counter 含历史噪声。测试前后采集 Symbol/Link Error、LinkDowned、PortRcvErrors、PortXmitDiscards、VL15Dropped、XmitWait 等，计算 Delta 并映射 Switch Port。

`XmitWait` 增长可能表示下游 Credit/拥塞，不等同物理丢包。结合 Throughput、路由和其他端口确定拥塞位置。

采样必须带时间戳并绑定测试窗口，必要时同时采集对端 HCA 与相邻交换机端口。CRC、Symbol 或 Link Error 更偏向物理层；Discard、XmitWait 和队列等待更偏向缓冲、Credit 或拥塞，但仍需结合路径判断。恢复后保留前后 Delta，才能证明计数器停止增长而不是被清零掩盖。

### Credit-Based Flow Control 不表示永不拥塞

InfiniBand 使用 Credit 避免向无 Buffer 的下游发送，但热点仍会产生等待和 Head-of-Line。无 Packet Drop 但延迟升高、XmitWait 增长时，需要检查流量分布和路由。

Credit-Based Flow Control 让上游在下游没有接收空间时暂停发送，因此常见现象是吞吐下降和等待增加，而不是明显丢包。若多条业务共享瓶颈链路，单个拥塞目的地仍可能拖慢其他流。运维应关联 VL、端口利用、XmitWait、路由和作业通信模式，区分接收端供给不足、局部热点与物理链路问题。

### MTU 要区分 Ethernet MTU 与 RDMA Path MTU

Netdev MTU、RoCE Path MTU 和中间交换机端口必须兼容。普通 Ping 未分片通过不代表大 RDMA Message Path 无问题，因为 RDMA 分包和 QP Path MTU 另有配置。

```bash
ip link show <iface>
ping -M do -s <payload> <peer-ip>
ibv_devinfo -v
```

Payload 要扣除 IP/ICMP Header，IPv4/IPv6 不同。不要用一个固定数字照搬所有 MTU。

### QoS 映射从应用流量一直到交换机队列

```text
Application or RDMA CM
  -> DSCP or Traffic Class
  -> NIC Priority
  -> VLAN PCP if used
  -> Switch Ingress Mapping
  -> Lossless Queue
  -> PFC and ECN Policy
```

任一映射不一致，流量可能进入 Best-Effort Queue。验证用 Packet/Counter 与 Switch Telemetry，不只审查配置文件。

### ECN Threshold 过低和过高都有代价

过低会频繁标记、降低吞吐；过高会让 Queue 累积、增加延迟甚至触发 PFC。参数依赖 Link Speed、Buffer、RTT、Topology 和拥塞控制算法。用 incast、多流和背景负载实验校准。

校准时同时记录 ECN Mark、CNP、PFC Pause、队列峰值、丢弃和应用 P99，而不是追求某个计数器为零。阈值修改应先在隔离路径小范围生效，覆盖空载与拥塞两种状态；若吞吐提升但 Pause/尾延迟恶化，说明只是把拥塞反馈推迟。不同交换机硬件显示的配置值与实际编程粒度也可能不同，应以设备状态和测试结果共同验收。

### PFC Storm 和 Deadlock 需要网络级保护

持续 Pause 可向上游传播，错误优先级/环路可能形成 Deadlock。交换机 Watchdog、Storm Control 和 Telemetry 应监控 Pause Duration、Queue Occupancy 和受影响端口。简单关闭 PFC 可能把问题变成丢包，必须由网络团队按设计恢复。

事件处理先确定哪个端口最早发送 Pause、哪个队列持续占满，以及传播范围是否跨越故障域。Watchdog 触发、端口恢复和配置修改都要与作业时间线关联，避免把正常短暂停顿误判为风暴。恢复动作应遵循已验证的网络 Runbook，并在恢复后复测 Incast 和并发 Collective，确认既无持续 Pause 也无新增 Discard。

## 第 11 章 · Kubernetes 中的 RDMA 设备交付

### Network Operator 与 GPU Operator 管理不同设备链

GPU Operator 管 Driver/Toolkit/GPU Plugin，Network Operator 可管理 OFED、RDMA Device Plugin、SR-IOV 等。GPUDirect 需要两边版本、Kernel Module 和容器设备权限兼容。

升级其中一边必须回归 GDR，不能以各自 Pod Ready 代替端到端测试。

两条设备链最终在工作负载 Pod 内汇合：GPU 设备、HCA/VF、Peer Memory 或 DMA-BUF、网络接口和所需权限必须同时可见。上线验证应从 Operator 状态继续检查 Kernel Symbol/Module、设备插件资源、Pod 内 `rdma link`、Host Buffer RDMA、GPU Buffer RDMA 与 NCCL；任一步失败，都不能用另一 Operator 的 Ready 状态替代。

### Shared RDMA Device 与 SR-IOV VF 隔离不同

Shared Device Plugin 可把 HCA 资源提供给多个 Pod，共享物理端口；SR-IOV VF 提供更明确的虚拟 Function 和网络配置，但数量、Firmware 与 CNI 更复杂。多租户按性能、隔离和运维选择。

共享设备模式的资源计数不代表带宽被硬隔离，多个 Pod 仍可能争用同一 Port、Queue 和 PFC 域；SR-IOV VF 能形成更清晰的设备与网络边界，但需要规划 VF 数量、绑定、IPAM、QoS 和故障恢复。验收除了“Pod 能看到 RDMA 设备”，还应覆盖并发公平性、跨租户可见性、节点重启后的重新分配和资源回收。

### Multus 把数据网络作为第二接口交付

Pod 主接口用于控制流，Multus 附加 RDMA 网络。NCCL 需选中附加接口/IP/GID。DNS/Bootstrap 可能走主网，数据走 RDMA 网，两条路径的 NetworkPolicy、MTU 和 Route 都要验证。

应在实际 Pod Network Namespace 中记录两张网的接口名、地址、路由、MTU、对应 HCA/GID 和 NCCL 最终选择。若 Bootstrap 正常而 Collective 初始化卡住，优先检查附加网络是否已就绪、对端路由与 GID 是否一致；若 NCCL 误选主接口，作业可能能运行却退化为 Socket。接口选择规则要随 NetworkAttachmentDefinition 和 Node Pool 版本管理。

### Memlock、IPC_LOCK 和安全上下文影响注册

RDMA Memory Registration 可能受 Locked Memory Limit、Capability 和容器 Runtime 限制。无限制 Privileged 能让测试通过，却扩大攻击面。生产按 Driver/Plugin 推荐授予最小权限，并在 Pod Spec 模板固化。

注册失败时应先记录 Pod 内 `ulimit -l`、实际 Capability、设备节点、cgroup/Runtime 限制和 Driver 日志，再与宿主机同类测试对照。临时加入 `IPC_LOCK` 或提高 Memlock 只能用于验证假设；若必须使用，应把范围限制在目标工作负载并经安全评审。最终还要用 GPU Buffer 传输证明权限足够，而不是只看容器成功启动。

## 第 12 章 · 并发通信与故障注入验收

### 单 Job 峰值和多 Job 公平性分别测试

先独占测试单 Job 上限，再运行同机架/跨机架多个 Job，观察总吞吐、每 Job 公平、P99 Step、端口利用和拥塞 Counter。总吞吐提升但一个 Job 饿死也不满足多租户目标。

并发矩阵应保持每个 Job 的 Rank 数、消息范围和放置可重复，并分别测试共享 HCA、共享 Leaf/Spine 与不同 Rail。结果同时报告集群总吞吐和每 Job 相对独占基线的下降，避免平均值掩盖受害者。若调度器声称有网络配额或优先级，还要验证抢占、排队与恢复后能否回到基线。

### Incast 和 AllToAll 暴露平均 AllReduce 看不到的热点

MoE/参数服务可能产生多发一收或 AllToAll。验收增加不均匀流量和不同消息大小，检查 Queue/ECN/PFC。只用规则 Ring AllReduce 容易漏掉热点处理能力。

Incast 会在短时间把多个发送者压向同一接收端口，AllToAll 则让大量 Peer 同时建立交换关系；两者更容易暴露队列、ECN 收敛和 Rail 映射问题。测试应逐步提高发送者和并发流数量，观察接收端、上联与 Spine 的队列和尾延迟，并设置停止阈值，不能直接用生产规模制造无界拥塞。

### 故障注入前定义停止条件

可测试关闭单 Port、阻断单 Rail、Kill 一个 Rank 或制造受控拥塞，但必须在隔离环境、获得网络/平台批准，并定义最大影响和立即恢复方式。禁止在公共生产 Fabric 随意拔线或修改 PFC。

实验单需要写明假设、故障注入点、受影响节点/端口、Owner、观察窗口和停止条件，例如错误率、Pause Duration 或 Job 失败数达到阈值即终止。注入前确认恢复命令和备用管理路径，注入中持续采集全体 Rank、HCA 与交换机证据，结束后验证配置、Link 和计数器已恢复，再允许下一轮测试。

### 验证检测、隔离、恢复三段时间

记录错误发生到 Alert、Alert 到 Job Abort/Node Cordon、修复到重新 Ready。通信平台不仅要跑得快，还要在失败时有限时间释放 GPU、保留首错并避免无限 Hang。

三段时间分别衡量可观测性、控制面处置和恢复门禁：检测慢会让 Rank 长期等待，隔离慢会扩大新作业影响，恢复过快则可能把未验证节点重新投入生产。事件报告应包含首错、传播到 NCCL Timeout 的时间、自动动作、人工介入和复测结果；仅记录最终“作业失败”无法改进任何一段。

## 第 13 章 · 通信现象到检查层的快速映射

### Communicator 初始化所有 Rank 都卡住

检查 Launcher/Rendezvous、World/Rank/Unique ID、Master DNS/Port、所有进程是否启动。无 Rank 进入 NCCL 时不先查 PFC。

先按统一时钟汇总所有进程日志：如果没有任何 Rank 打出 Bootstrap/INIT 记录，故障边界仍在调度、容器启动或 Rendezvous；如果全部停在相同初始化阶段，再核对是否使用同一个 Unique ID、Rank 是否完整且无重复。确认控制面参与者齐全后，才继续检查接口发现和 Transport，避免从数据面计数器开始盲查。

### 只有部分 Rank 初始化卡住

对比缺失 Rank 的 Pod/Node/GPU/Fabric、Bootstrap Route、HCA/GID 和防火墙。收集所有 Rank Log 找最后成功阶段。

“部分卡住”通常表示成员或路径不对称：某个 Rank 未启动、环境变量不同、容器内接口不可见，或只在特定节点的 HCA 建链失败。把每个 Rank 的 Hostname、GPU UUID、Bootstrap Interface、HCA/GID 和最后一条 INIT/NET 日志排成表，先找第一个偏离健康多数的参与者；其他 Rank 的超时往往只是等待它的结果。

### 小消息慢而大消息接近基线

偏向 Latency、Launch、CPU Progress、Tree/Ring/Protocol 和网络 RTT。不要用增加带宽解决固定开销。

用消息大小扫描找到转折点，并比较单节点、两节点及不同 Rank 数。如果每次调用都有近似固定额外时间，重点看 Host Launch、Group/Stream 顺序、CPU Progress Thread、IRQ/NUMA 与网络往返；同时核对 NCCL 是否对小消息选择了预期算法。应以应用真实 Bucket 范围调优，单纯扩大链路带宽通常不会消除启动延迟。

### 大消息慢而小消息正常

检查 Link Speed、持续带宽、PCIe/GDR、Rail 使用、PFC/ECN/Discard 和 Algorithm。负载下 Counter Delta 关键。

大消息能够填满流水线，更容易暴露端口降速、单 Rail 热点、PCIe 绕行和持续拥塞。测试期间按 Rank/HCA 采集吞吐与计数器 Delta，确认各 Rail 是否均匀、GDR 是否实际启用，并交换节点与 GPU 组合复测。若只有某方向或某端口退化，优先定位局部链路；若所有路径同一阈值后下降，再检查算法、Protocol 和队列参数。

### 单节点慢

P2P/NVLink/NVSwitch/Fabric、GPU Group、Clock/HBM、NCCL SHM/P2P 选路。跨节点网络尚未进入主路径。

先按 GPU Pair 和消息大小运行节点内测试，再用 `nvidia-smi topo -m`、链路状态与错误计数核对实际 Fabric。若只有跨特定 GPU Group 变慢，检查拓扑边界、P2P Capability、NVLink/NVSwitch 状态和 ACS；若所有 Pair 都慢，再看 GPU 时钟、功耗、CPU/NUMA 与 Shared Memory 回退。不要用禁用 IB 解释纯单节点问题。

### 单节点正常而两节点慢

Host RDMA、GPU RDMA、HCA/GID/MTU、GPU-NIC Topology、NCCL NET Transport 和两端 Counter。

按 Host Buffer Perftest、GPU Buffer/GDR Test、两节点 NCCL Tests 的顺序推进，可以确定下降从哪一层开始。同步核对两端 HCA Port、GID、Path MTU、GPU-NIC 距离和 NCCL `NET` 日志；若 Host RDMA 正常而 GPU Buffer 失败，重点转向 GDR 注册和拓扑，而不是继续调交换机带宽。

### 同机架正常而跨机架慢

ToR/Spine Oversubscription、Rail/路由、ECN/PFC、Hop、背景流量和 Placement。按路径端口抓 Telemetry。

选择同一对节点分别做同机架与跨机架测试，并保持消息、Rank 和环境变量一致。沿资产映射采集 ToR 上联、Spine 和远端下联的利用率、队列、ECN/PFC 与 Discard，确认是否某 Rail 绕路或经过超额订阅链路。若性能只在繁忙时段下降，还要把背景作业和调度放置纳入证据。

### 只有一个节点/Rank 慢

GPU/HCA BDF、NUMA/CPU Binding、Port Speed/Counter、Firmware、温度/Clock 和该 Rank 数据。健康节点同参数对照。

将异常 Rank 与同机型健康 Rank 做一对一替换或缩小通信组，判断问题是否跟随 GPU、HCA、节点还是数据分片。比较 PCIe 宽度/速率、端口 Firmware、错误计数 Delta、CPU Set、温度和时钟；如果硬件与网络均健康，再检查该 Rank 的 DataLoader、样本长度和 Collective 调用时序。平均值会掩盖这个局部慢点。

### 所有 Rank 同时周期性停顿

Checkpoint/Evaluation/Barrier、Bucket、应用阶段、共享网络周期任务。通信指标正常时回到应用时间线。

同步采集各 Rank 的 Step Phase 与 Collective 时间线，观察停顿是否总在同一 Global Step 或固定时间间隔发生。与 Checkpoint、评估、日志 Flush、数据切换和集群备份任务对齐；若所有 Rank 在 Barrier 前同时空闲，根因通常不在某条网络链路。只有停顿伴随 Queue、Pause 或重传增量时，才把共享网络周期拥塞作为主要方向。

### NCCL Timeout 前有某 Rank OOM/XID

Timeout 是后果。以最早 OOM/XID 为根因入口，终止整个 Job、隔离设备/修应用，不调整网络 Timeout 掩盖。

OOM 会让一个 Rank 提前退出，XID 可能使 CUDA Context 或 P2P 路径失效，其余 Rank 随后在 Collective 等待。保留最早的 Kernel/Driver 事件、GPU UUID、Rank 和作业阶段，按故障类型决定修正 Batch/显存、终止 Attempt 或 Cordon/诊断节点。恢复后需重新建立 Communicator；延长 NCCL Timeout 只会推迟释放 GPU。

### 禁用 IB 后能运行但很慢

问题在 RDMA/GDR 路径范围，继续分 Host RDMA、GPU Buffer、GID/QoS/Counter/Plugin。Socket 只是诊断回退，修复后恢复 IB。

先证明 Host RDMA 是否正常：若失败，检查 HCA、GID、MTU、路由、PFC/ECN 与端口计数；若 Host 正常而 GPU Buffer 失败，则转向 Peer Memory/DMA-BUF、拓扑、权限和注册。最后用 NCCL 日志确认 `NET/IB` 与 GDR 重新生效，并恢复原有多节点基线，不能把慢速 Socket 路径当成长期修复。

### 禁用 GDR 后恢复稳定

检查 Peer Memory/DMA-BUF、GPU-HCA Topology、IOMMU/ACS、Memlock、Driver/OFED 和 Buffer Registration。Host RDMA 成功不能关闭事件。

这个实验把问题缩小到 GPU Memory 直达 HCA 的前提链，但不能单独判断是软件还是硬件。用相同 HCA 比较 Host Buffer 与 GPU Buffer，并按 GPU-HCA Pair 复测；只有特定 Pair 失败时优先查 PCIe Root/ACS，所有 Pair 失败则优先查 Driver、OFED、DMA-BUF/Peer Module、容器权限和分配器。修复后重新启用 GDR 并确认无内部 Staging 回退。

### 禁用 P2P 后单节点不再 Hang

检查特定 GPU Pair、Fabric State、P2P Capability、Link Error、ACS 和 CUDA/NCCL。用全 Pair Matrix 找故障组合。

禁用 P2P 后通常会经 Shared Memory/Host 绕行，因此“恢复稳定”只说明节点内直连路径相关。运行 GPU Pair Matrix 并记录方向、消息大小、PCI BDF、拓扑距离及 NVLink 错误 Delta，找出是否只有一对设备或一个 Fabric Domain 异常。若绕行后的性能明显下降，仍应隔离并修复 P2P 路径，而不是保留全局禁用。

### BusBW 正常而真实训练慢

消息分布/Bucket/Collective、Overlap、Compute/Data Straggler、Model Parallel Mapping。大消息 AllReduce 峰值不覆盖应用执行。

把 `nccl-tests` 的消息范围与真实 Profiler 中的 Collective 类型、大小和频率对齐，并比较通信是否与 Backward 重叠。训练慢可能来自大量小 Bucket、AllToAll/AllGather、错误的并行组跨拓扑、数据加载或某个 Rank 计算慢；这些都不会被单一大消息 AllReduce 的 BusBW 暴露。最终指标应是 Step/Tokens 与每 GPU 有效吞吐，而非只保留通信峰值。

### Network Counter 高而应用暂未报错

增长趋势是预警。识别 CRC/Discard/PFC/ECN/Retry，按物理或拥塞处理；在任务失败前安排隔离/维护。

先对 Counter 分类并计算作业窗口增量：CRC、Symbol、Link Recovery 更偏向线缆/光模块/端口；Discard、ECN、PFC 和 Retry 更偏向拥塞、缓冲或流控。将增量映射到具体 HCA、交换机端口、Rail 和作业，即使应用尚未超时，持续增长也可能正在侵蚀尾延迟与冗余。达到站点阈值时应停止新调度或安排维护，并用复测证明增量归零。

## 第 14 章 · NCCL 并发契约与设备侧通信新路径

### NCCL Communicator 可重入不等于可被多个线程并发调用

NCCL Primitive 通常不是 Thread-Safe，但 Communicator 可以在调用方保证互斥时由不同线程先后使用。同一 Communicator 不能被多个线程并行提交；位于同一 Device 的独立 Communicator 并发调用也有约束；使用 `splitShare` 共享资源的 Parent/Child Communicator 更不能并行操作。一个 `ncclGroupStart()` 到 `ncclGroupEnd()` 必须由同一线程完整提交。

非阻塞 Communicator 可由其他线程轮询 `ncclCommGetAsyncError()`，但轮询不授予再次并发提交 Collective 的权限。Hang 排障要记录 Thread ID、Communicator、CUDA Device、Stream、Group 边界和调用序列；如果不同 Rank 的线程调度导致 Collective 顺序不一致，网络完全健康也会卡住。

### Compute Fabric Transport 面向设备侧自定义通信 Kernel

NCCL 2.31 起的 Device API CFT Helper 面向支持 Fabric Logical Endpoint 和相关 PTX 指令的系统，让自定义 Kernel 直接执行 Fabric Put/Get、Reduction 与 Barrier。它不是传统 Host 侧 `ncclAllReduce` 的透明加速开关，也不是所有 GPU/NCCL 组合都能使用；当前资料中的示例前提包括 CUDA Toolkit 13.3 和 SM100 架构。

应用要先注册 Symmetric Window，创建带 `NCCL_CFT` 能力和足够 Barrier Slot 的 Device Communicator，再通过 Team/Endpoint Helper 解析 Peer。使用 Multicast 或 Multimem Barrier 时还需请求 `NCCL_CFT_MULTIMEM`。共享内存地址与传输长度有 16 字节对齐要求，跨 Generic/Fabric Proxy 的数据与 Flag 必须用正确的 Acquire/Release Fence 建立顺序。

平台验收需要把 CFT 视为独立能力矩阵：硬件、Driver、Toolkit、NCCL、目标架构、Window 注册、Endpoint、Barrier 数量和 Fence 语义逐项验证。CFT Kernel 失败时先回退到普通 NCCL Collective 做对照，以区分 Fabric 基础故障与设备侧 API/Kernel 错误。

## 第 15 章 · 从单卡流水线到分布式通信域

### 单卡训练已经包含 CPU、GPU、存储流水线

DataLoader 准备 Batch，H2D，Forward/Backward/Optimizer，Checkpoint。分布式在此基础增加 Rank、Collective、全局状态和故障协调，不会消除单卡瓶颈。

一轮训练不是单个 GPU Kernel，而是一条由数据读取、CPU 预处理、Host-to-Device 拷贝、前向计算、反向传播、参数更新和持久化组成的流水线。任一环节供给不足，GPU 都可能在两个 Kernel 之间等待；即使 `nvidia-smi` 偶尔显示高利用率，端到端 Samples/s 仍可能很低。

```mermaid
flowchart LR
    D[Dataset] --> L[DataLoader]
    L --> H[Host Memory]
    H --> G[GPU Memory]
    G --> F[Forward]
    F --> B[Backward]
    B --> O[Optimizer]
    O --> C[Checkpoint]
```

因此，多卡扩展前应先建立单卡基线，至少记录 DataLoader Time、H2D Time、Forward/Backward Time、Optimizer Time、峰值显存和 Checkpoint Time。单卡阶段没有被解释的 CPU、I/O 或显存问题，扩展后通常会被所有 Rank 复制，并在同步点放大。

### 分布式目标是突破容量或缩短完成时间

模型/Activation 放不下需要 Model/State Sharding；单卡能放但太慢使用 Data Parallel；两种目的影响并行策略和网络需求。增加 GPU 不是目的本身。

容量扩展回答“模型能否运行”，性能扩展回答“任务能否更快完成”。前者常通过 Tensor/Pipeline Parallel、ZeRO 或 FSDP 拆分权重、Activation 和优化器状态；后者常通过 Data Parallel 增加并行样本。两者可以组合，但通信模式、Checkpoint 格式和故障恢复边界完全不同。

项目设计应先冻结模型规模、Sequence Length、精度、目标 Global Batch 和完成时限，再选择并行维度。若只给出“需要 64 张 GPU”，平台无法判断这些卡应位于一个 NVSwitch Domain、同一机架还是可以跨普通网络分散放置。

### 协调开销随规模增长

更多 Rank 带来 Collective、Barrier、Launcher、Checkpoint 分片和故障概率。Scaling Curve 找经济上限，不能假设线性。

理想情况下，GPU 数翻倍会使完成时间减半；现实中，串行数据准备、Collective 延迟、同步等待和负载不均会形成不可并行部分。规模越大，参与同一次 Collective 的 Rank 越多，任何一个慢 Rank、丢包或进程失败影响的范围也越大。

扩容验收应画出 GPU 数、吞吐、Step Time、通信占比和每 GPU 有效吞吐的 Scaling Curve。当新增 GPU 带来的吞吐增量已经小于资源与失败重算成本时，就到达当前模型、网络和软件栈下的经济上限，而不是继续按理论 FLOPS 扩容。

### 最慢 Rank 决定同步训练速度

数据慢、GPU 降频、网络拥塞或 OS Noise 的一个 Rank 让所有 Rank 等待。平均指标会掩盖，必须保留 Rank 分布和 Straggler。

同步训练中，每个 Rank 必须按一致顺序进入梯度同步。较快 Rank 到达 Collective 后只能等待最慢 Rank，因此全局 Step Time 近似由最慢路径决定。集群平均 GPU Utilization、平均网络带宽会把这一离群值稀释掉。

监控应按 `job_id + attempt + step + rank` 保留 Data、Compute、Communication 和 Barrier 的分位与最大值，并把 Rank 映射到 Node、GPU UUID、CPU NUMA 和 HCA。先定位慢 Rank 的阶段，再检查数据、时钟、链路或 OS 噪声，避免对整个集群盲目调参。

### World、Global Rank、Local Rank 和 Node Rank 分工

World Size 是总进程，Global Rank 全局唯一，Local Rank 选择本机 GPU，Node Rank 标节点。Launcher 生成并记录，不能依赖 Pod 名排序偶然一致。

例如两个节点各运行 8 个进程时，World Size 为 16，Global Rank 通常为 0～15，每个节点的 Local Rank 为 0～7，Node Rank 为 0 或 1。Global Rank 用于 Collective 和数据分片，Local Rank 用于选择本机可见 GPU；二者混用可能让多个进程绑定同一张卡。

启动日志应显式输出 World Size、四类 Rank、Hostname、GPU UUID、PCI Bus ID 和 `CUDA_VISIBLE_DEVICES`。这些字段既用于发现重复或缺失 Rank，也用于把 NCCL 错误、DCGM 指标和调度器分配关联到同一物理设备。

### 一 GPU 一进程是常见但非唯一模型

也可单进程多 GPU、多个进程共享 GPU/MPS。Framework/NCCL Thread Safety、CPU Binding 和错误传播不同。平台模板明确支持模式。

一 GPU 一进程的优势是设备上下文、错误归属和 CPU Affinity 清晰，也是许多分布式框架的默认模式。单进程多 GPU 会在一个进程内管理多个 Stream 和 Communicator，任一设备错误可能影响整个进程；多个进程共享 GPU 则会竞争显存、SM 和调度时间。

平台不能仅凭进程数推断 GPU 所有权。作业模板应明确进程模型、每进程 GPU 数、是否允许 MPS/共享、每 Rank CPU 核与内存配额，以及某个 Rank 退出后是局部恢复还是终止整个 Attempt。

### Process Group 划分不同并行通信域

Data Parallel、Tensor Parallel、Pipeline/Expert 各有 Group，同一 Rank 属于多个 Communicator。Group 创建顺序在所有 Rank 一致，否则 Hang。

```text
World 16 Ranks
  Tensor Groups 4 x 4
  Data Groups   4 x 4 across replicas
  Pipeline Groups depending on stage
```

Process Group 是一组参与相同通信语义的 Rank；NCCL Communicator 则承载该组上的 Collective 或点对点操作。同一个 Rank 可能同时属于 World Group、Data Parallel Group、Tensor Parallel Group 和 Pipeline Group，因此会持有多个 Communicator。

所有参与者必须用一致的成员、Rank 顺序、元素数量和数据类型调用 Collective。Group 创建或调用顺序不一致，可能不是立即报错，而是表现为 Hang、数据损坏或某些 Rank 超时。运行时应记录 Group ID、成员列表和 Collective Sequence Number。

### Rank 映射决定 Group 是否落在正确拓扑

Tensor Group 优先同 NVSwitch，Data Group 跨节点/Rail，Pipeline 邻接低延迟。Launcher/Scheduler 输出 Rank-GPU-Node-HCA Map 并验证。

不同并行组的流量特征不同：Tensor Parallel 几乎每层都通信，最依赖低延迟 Scale-Up Fabric；Data Parallel 的梯度同步消息通常更大，可以跨节点使用 RDMA；Pipeline Parallel 更关注相邻 Stage 的点对点带宽和稳定延迟。

| 并行组 | 主要通信 | 优先放置位置 | 典型风险 |
| --- | --- | --- | --- |
| Tensor Parallel | 高频 AllReduce 或 AllGather | 同一 NVSwitch Domain | 跨节点延迟放大到每层 |
| Data Parallel | 梯度同步 | RDMA 可达的多节点 | 慢 Rank 和网络拥塞 |
| Pipeline Parallel | 相邻 Stage P2P | 连续低延迟路径 | Bottleneck Stage 和 Bubble |
| Expert Parallel | AllToAll | 均匀无热点 Fabric | Rail 不均和热门 Expert |

因此“分到 8 张 GPU”不等于获得同样性能。验收时应把逻辑 Group 展开成 `Rank -> GPU UUID -> NVLink/NVSwitch Domain -> NUMA -> HCA -> Rail`，并用 `nvidia-smi topo -m`、调度器分配和 NCCL 日志交叉验证实际路径。

## 第 16 章 · Data、Tensor、Sequence 与 Context Parallel

### 每 Rank 处理不同样本并同步梯度

Forward/Backward 独立，Gradient AllReduce 后参数更新一致。Data Sampler 必须避免重复/遗漏并在 Epoch/Resume 保存状态。

Data Parallel 在每个 Rank 保存同一模型副本，但让不同 Rank 处理不同样本。反向传播产生本地梯度后，通过 AllReduce 得到跨 Rank 的聚合结果，再由各 Rank 执行相同参数更新；任何 Rank 少调用一次或使用不同张量形状都会破坏全局同步。

数据侧同样属于一致性协议。Distributed Sampler 需要按 World Size 和 Rank 分片，统一 Shuffle Seed，并在恢复时还原 Epoch、样本位置和随机状态。否则训练虽然能继续运行，却可能重复读取或遗漏样本，形成难以从基础设施指标发现的数值偏差。

### DDP Bucket 让通信与 Backward 重叠

Parameter Gradient Ready 后按 Bucket 发 AllReduce，后层计算与早期通信重叠。Bucket 太小启动开销大，太大延迟启动。Profiler 查看 Overlap。

反向传播按计算图逐层产生梯度。DDP 把多个参数梯度组成 Bucket，当 Bucket 中的梯度全部 Ready 后立即发起通信，使较早 Bucket 的 AllReduce 与剩余 Backward 并行，而不是等全部梯度完成后一次性同步。

Bucket 太小会产生大量短 Collective 和启动开销；太大则必须等待更多梯度，缩短可重叠窗口。模型结构、参数注册顺序或未使用参数变化都可能改变 Ready 顺序，因此调优必须查看时间线中的 Backward、NCCL 和等待区间，并以完整 Step Time 验证。

### Gradient Accumulation 减少同步频率

多个 Micro Batch 本地累积再同步，增加有效 Batch、减少通信次数，但延长更新间隔和 Activation/状态行为。`no_sync` 等必须所有 Rank 一致。

有效 Global Batch 通常由每卡 Micro Batch、Data Parallel World Size 和 Accumulation Steps 共同决定。累积期间只在本地叠加梯度，到指定边界再同步和更新，可以在显存受限时维持较大的 Global Batch，并降低单位样本触发 Collective 的频率。

它并非免费优化：更长的更新间隔会改变优化语义，Activation 与梯度缓冲的生命周期也可能变化。所有 Rank 必须在相同 Micro Step 进入同步；恢复时要记录当前累积位置，不能把未完成的局部梯度误当成已提交的 Global Step。

### Uneven Input 需要 Join 或统一 Step

某 Rank 数据提前结束，其他 Rank 继续 Collective 会 Hang。Dataset Shard 保证等长或 Framework Join 机制；异常过滤也要跨 Rank 协调。

不均匀输入不仅来自数据集不能整除 World Size，也可能来自坏样本跳过、动态 Batch、长度分桶或某个 DataLoader 提前抛错。只要一个 Rank 不再进入后续 Collective，其他 Rank 就可能一直等待，最后只留下 NCCL Timeout 这一表象。

优先让各 Shard 的训练 Step 数一致，并明确最后不足 Batch 是补齐还是丢弃。若框架支持 Join 等不均匀输入机制，也要验证其对梯度缩放和收敛的影响；异常过滤应记录跨 Rank 一致的样本决策，而不是各进程自行跳过。

### Tensor Parallel 分割单层矩阵

Column/Row Parallel 使每 Rank 计算部分输出，通过 AllGather/AllReduce 合并。每层通信频繁，优先 Node Local NVLink/NVSwitch。

Tensor Parallel 沿矩阵的行或列拆分权重和计算，使单层不必完整驻留在一张 GPU 上。列并行通常产生分片输出，行并行则需要对部分结果做归约；具体组合会引入 AllGather、AllReduce 或 ReduceScatter。

因为通信发生在模型层内部，消息频率远高于只在梯度阶段同步的 Data Parallel。TP Group 应优先落在完整 NVLink/NVSwitch Domain 内；跨节点 TP 即使显存足够，也可能因每层 RDMA 往返而显著降低吞吐。

### TP Size 由模型显存和拓扑共同决定

TP 越大每卡权重少，但通信和小矩阵效率下降。选择 2/4/8 等完整 Fabric Group，实测吞吐与 Memory；不为“用满 GPU”盲目增大。

确定 TP Size 时先计算单卡需要承载的权重、Activation、通信缓冲和 Workspace，再看一个硬件 Fabric Group 能提供多少 GPU。TP Size 增大虽然降低每卡权重，但会把原本较大的 GEMM 切成更小矩阵，并增加参与通信的 Rank 数。

候选值应按完整拓扑边界测试，例如避免一个 TP Group 跨越带宽明显较低的链路。验收同时记录峰值显存、单 Step 通信次数、Tensor Core Activity 和 Tokens/s；若显存已经满足且吞吐下降，就没有必要为了占满设备继续扩大 TP。

### Sequence Parallel 分割序列维度的中间状态

可降低部分 Activation 重复，增加特定 Collective。适用模型/Framework 依版本。平台关注消息模式/显存变化，不需实现算法。

Sequence Parallel 通常把序列维度上的中间状态分给 Tensor Parallel Group 内不同 Rank，使 LayerNorm、Dropout 等部分 Activation 不再在所有 Rank 重复保存。它主要用于降低 Activation 压力，并与 Tensor Parallel 的矩阵切分配合。

代价是层边界需要额外 Gather 或 Scatter，且张量 Shape、序列长度和框架实现会影响通信。平台验收应比较开启前后的峰值显存、Collective 类型与大小、Step Time 和数值一致性，不能只看到显存下降就判定优化成功。

### Context Parallel 服务超长上下文

Sequence/Attention 工作分到多个 Rank，通信量和负载均衡依实现。网络需求不能只按普通 TP/DDP 估算，真实长 Context 基准。

Context Parallel 面向单个超长 Sequence，把 Attention 所需的上下文或 KV 状态沿序列维度分布到多个 Rank。它解决的是长 Context 的 Activation 和 Attention 计算无法由单卡承载的问题，而不是普通数据副本扩展。

不同实现可能使用 Ring 式交换、AllGather 或更复杂的 Attention 通信，负载还会受到 Padding 和真实长度分布影响。容量规划必须用目标 Context Length、Batch 和精度做基准，并观察通信是否随长度或 Rank 数成为新的主导阶段。

## 第 17 章 · Pipeline Parallel 与 ZeRO/FSDP 状态分片

### Layer 被分配到多个 Stage

Activation 前传、Gradient 反传，Stage 间 Send/Recv。模型层计算/显存不均导致 Bottleneck Stage。

Pipeline Parallel 把连续 Layer 划分为多个 Stage，每个 Stage 只保存并计算自己的模型分片。前向时 Activation 从上游传向下游，反向时梯度按相反方向返回；相邻 Stage 的 Send/Recv 必须在匹配顺序下推进。

Stage 数相同不代表负载均匀，因为不同 Layer 的参数量、计算量和 Activation 大小可能不同。最慢 Stage 决定 Pipeline 周期，验收应分别记录各 Stage 的 Forward、Backward、通信和空闲时间，而不是只看整作业平均利用率。

### Micro Batch 填充 Pipeline 减少 Bubble

Micro Batch 越多利用越好，但 Global Batch、Activation 和调度复杂性增加。1F1B 等 Schedule 依 Framework，分析 Stage Timeline。

一个大 Batch 被切成多个 Micro Batch 后，可以让不同 Stage 同时处理不同批次，从而填满流水线。启动阶段尚未填满、结束阶段逐步排空形成 Pipeline Bubble；Micro Batch 数增加通常能降低 Bubble 占比，但也增加调度事件和中间状态管理。

选择数量时必须同时约束 Global Batch、Gradient Accumulation、每 Stage 峰值 Activation 和数值语义。用 Stage Timeline 检查 Warmup、稳态与 Drain，确认优化减少的是空闲时间，而不是把压力转移为更多 P2P 等待或显存峰值。

### Stage Placement 连接拓扑和故障域

高频邻接放低延迟路径；跨节点需 RDMA。单节点故障会丢该 Stage 的所有 Pipeline，整个 Job 恢复。

Stage Placement 应优先让高频相邻 Stage 位于低延迟链路，并避免将一个逻辑 Stage 的副本集中在同一故障域。若必须跨节点，需确认 Activation/Gradient 的消息大小、HCA Affinity 和 RDMA 路径符合预期。

映射应被记录为发布制品的一部分，因为调度器重新放置后可能得到完全不同的性能。节点故障通常会使整个 Pipeline World 无法继续，恢复流程要从一致 Checkpoint 重建所有 Stage，而不是只在空闲 GPU 上补启动一个进程。

### Interleaved Pipeline 增加虚拟 Stage

可改善负载和 Bubble，但通信/调度更复杂。平台观察更多 P2P/Stream，应用负责正确 Schedule。

Interleaved Pipeline 让一张 GPU 承载多个非连续的虚拟 Stage，使各设备能在更多时间片处理其他 Micro Batch，改善简单顺序切分造成的负载不均和 Bubble。代价是同一设备上的执行顺序、Stream 依赖和跨设备 P2P 数量都会增加。

运维侧无需实现调度算法，但要能从 Trace 识别虚拟 Stage、Micro Batch 和通信方向。若开启后 GPU Utilization 上升而 Step Time 没有改善，应检查额外通信、上下文切换、内存压力以及最慢虚拟 Stage 是否仍未被消除。

### 优化器、梯度和参数按 Stage 分片

Stage 提升减少每卡重复显存，增加 Gather/Scatter 与恢复复杂性。峰值仍可能在参数 Materialize/Communication Buffer。

ZeRO 和 FSDP 的共同目标是消除 Data Parallel 中每卡重复保存完整训练状态的问题。较低分片级别先拆优化器状态和梯度，更高分片级别继续拆参数；计算某个模块前再临时聚合所需参数，计算后释放或重新分片。

容量评估不能只用“总状态除以 GPU 数”。参数临时 Materialize、Prefetch、Reduce Buffer、未释放 Activation 和内存分配器碎片可能同时出现，形成高于稳态占用的瞬时峰值。应在真实 Forward/Backward 边界采集峰值，而不是只看模型加载后快照。

### AllGather 和 ReduceScatter 替代部分 AllReduce

消息频率/大小随 Wrap Unit、Prefetch 和 Bucket 变化。NCCL Benchmark 需覆盖这些 Collective，不只 AllReduce。

传统 DDP 常用 AllReduce 让每个 Rank 获得完整梯度；状态分片更常用 ReduceScatter，让每个 Rank 只保留归约结果的一部分，再在计算前通过 AllGather 获取所需参数分片。两种操作组合可以避免长期复制完整状态。

这会把通信从一次大梯度同步变成随模块执行发生的多次 Gather/Scatter。基础设施测试除 AllReduce 外，还要覆盖对应消息大小的 AllGather 和 ReduceScatter，并观察延迟、带宽、通信计算重叠及跨节点路径。

### CPU/NVMe Offload 用 I/O 换显存

Optimizer/Parameter 移 Host/NVMe，受 PCIe、Host Memory、NUMA 和 Storage。GPU 可能空等 Offload。容量表同时计算 Host/NVMe 和 Data Path。

CPU Offload 把部分参数、梯度或优化器状态放到 Host Memory，NVMe Offload 再把容量扩展到本地存储。它们用更慢、更远的存储层换取 GPU 显存空间，因此能让模型运行不等于能保持可接受吞吐。

节点设计要为 Offload 单独预算 Host Memory 容量、Pinned Memory、PCIe 带宽、NUMA 路径、NVMe 容量与写入寿命。若 GPU 时间线周期性出现空洞，应把 Prefetch、H2D/D2H、Page Fault 和 NVMe I/O 与 Step 对齐，判断是否正在等待状态换入。

### Wrap/Shard 粒度影响性能和 Checkpoint

太细大量小 Collective，太粗峰值大。升级模型代码可能改变 Wrap，性能/显存回归要记录 Policy。

Wrap Unit 决定哪些参数一起分片、聚合和保存。粒度太细会产生大量小消息、频繁参数 Materialize 和更多元数据；粒度太粗则拉高瞬时显存，并使一个慢模块阻塞更大的通信单元。

自动 Wrap Policy、排除模块和 Prefetch 顺序都应进入训练 Manifest。框架或模型升级后，即使 GPU 数与 Batch 不变，模块树变化也可能改变分片边界；回归时要比较 Wrap 结果、Collective 分布、峰值显存和 Checkpoint Shard 布局。

## 第 18 章 · Expert Parallel 与稀疏模型

### Router 把 Token 分配给 Expert

Top-k Routing 导致每 Rank Token 不均，AllToAll 交换。热门 Expert 成 Straggler，平均 GPU 利用不代表均衡。

Mixture-of-Experts 模型只为每个 Token 选择少量 Expert。Router 根据得分执行 Top-k 选择，随后把 Token 从当前 Rank 发送到承载目标 Expert 的 Rank，Expert 计算结束后再把结果送回，因此常形成两次 AllToAll 类交换。

如果大量 Token 被路由到少数 Expert，这些 Rank 会承担更多计算和通信，其他 Rank 则在同步点等待。监控需要按 Expert 和 Rank 记录 Token 数、处理时间与丢弃量，不能用全作业平均 GPU Utilization 判断负载是否均衡。

### Capacity Factor 控制 Expert 超载

容量过小 Drop Token/质量风险，过大 Padding/显存浪费。监控 Routed Token、Drop、Load Balance Loss、AllToAll Bytes。

Capacity Factor 为每个 Expert 预留超过理想均分的处理空间，用来吸收真实路由分布的偏斜。容量不足时，超出部分可能被丢弃或走备用路径；容量过大则需要 Padding、更大的通信 Buffer 和更多显存。

它同时影响模型质量与基础设施效率，不能只由平台根据显存自动调整。基准应固定数据分布，联合观察 Expert Load、Dropped Token、Load Balance Loss、AllToAll Bytes、峰值显存和 Step Time，找到模型可接受的容量边界。

### AllToAll 对 Fabric 均匀性敏感

每 Rank 与所有 Peer 通信，容易暴露 Oversubscription/热点。专门 AllToAll 基准和真实 Token 分布；Ring AllReduce 通过不够。

AllToAll 中每个 Rank 向不同 Peer 发送不同数据，并从所有 Peer 接收结果。相较可以沿 Ring 顺序流动的 AllReduce，它更容易同时占用多条路径，对交换机上行、Rail 分布、HCA Queue 和 ECMP 均匀性敏感。

验收应使用与真实 Expert Token 分布相近的消息大小和并发度，并查看每端口、每 HCA 与每 Rank 的吞吐差异。单独的 NCCL AllReduce 达标只能证明一种通信模式，不能证明 MoE 的 AllToAll 不会被热点或 Oversubscription 限制。

### Expert Placement 可跨节点但需网络预算

本地 Expert 减少网络但受容量，跨节点扩展但通信多。Topology-Aware Mapping 与并发模型一起验证。

将一个 Expert 的权重与访问它的 Token 尽量放在同一 NVSwitch Domain，可以降低跨节点流量；但 Expert 数量、权重容量和副本策略可能迫使 Group 跨节点。热门 Expert 还可能需要复制，以空间换取负载均衡。

Placement 方案要同时给出 Expert-to-Rank、Rank-to-GPU 和 GPU-to-HCA 映射，并把其他并发作业纳入网络预算。只在空集群跑一次平均流量基准，无法暴露多租户环境中的 Rail 争用和热点 Expert 放大效应。

## 第 19 章 · Launcher、Rendezvous 与计算通信重叠

### Launcher 在所有节点启动匹配进程

Kubernetes Operator、torchrun、MPI、Slurm srun 等负责 Environment/Process/Exit。平台固定受支持组合，不把多层 Launcher 叠加造成重复 Rank。

Launcher 把调度器提供的节点与设备分配转成具体进程：在每个节点启动正确数量的 Worker，设置 Master Address、World Size、Rank、Local Rank 和设备可见性，并收集退出状态。它不应绕过调度器再扫描和使用未分配 GPU。

多层启动器叠加最容易产生重复进程，例如调度器已按 Task 启动，脚本中又让 `torchrun` 按节点数二次展开。平台应为 Kubernetes、Slurm 或 MPI 固定经过验证的启动组合，并在首个 Step 前核对实际 PID、Rank 和 GPU 数量。

### Rendezvous 让 Worker 发现 World

Static 使用固定 Master/World；Elastic 使用 Store/Lease/Run ID。服务 HA、DNS/Network、时钟和认证影响初始化。Bootstrap 成功不证明数据面。

Rendezvous 是控制面发现过程：各 Worker 使用相同 Run ID 找到 Store 或协调端点，登记成员并形成一致的 World。Static 模式要求成员和地址预先固定；Elastic 模式允许在约束范围内重新形成成员集合，并以 Attempt 区分不同运行轮次。

初始化依赖 DNS、端口可达、时钟、凭据与服务生命周期，但这些只证明控制连接成功。NCCL 数据面可能使用另一组 NIC、HCA 和端口，因此 Rendezvous 成功后仍要用最小 Collective 验证真正的 GPU 通信路径。

### Master Port 生命周期避免冲突和泄露

动态分配/Service/Job Scope，NetworkPolicy 只允许成员；重试使用新 Run ID 防旧 Worker 加入。日志可记录 Address 但不泄露 Credential。

Master Port 必须在整个 Worker Group 生命周期内保持唯一和可达。多个作业共享 Host Network 时，硬编码端口可能冲突；协调端点过早销毁会导致迟到 Rank 失败，长期暴露又可能让旧进程误加入下一次 Attempt。

推荐由调度或工作流层按 Job 分配端点，通过 Service 或作业作用域发布，并限制只允许成员访问。重试时生成新的 Run ID，清理旧 Endpoint；日志保留地址、端口和 Attempt 便于排障，但不输出 Token、证书私钥等凭据。

### Launcher 传播 Signal 和 Exit

一个 Rank Fatal，终止整个 Attempt，给 Checkpoint/清理 Grace，最终 Kill。父进程 Exit Code/Reason 保留首个失败 Rank。

Launcher 既要把终止信号从调度器传播给所有子进程，也要把任一 Rank 的失败向上汇总。若只结束失败进程，其他 Rank 可能卡在下一次 Collective；若立即强杀全部进程，又可能丢失唯一的错误日志和可安全完成的 Checkpoint。

合理顺序是记录 First Failure，通知其他 Rank 停止进入新工作，给诊断和安全清理留出有界 Grace Period，随后终止残留进程。最终 Job Reason 应保留原始失败 Rank、Signal 或 Exit Code，不能被后续的“其他 Rank 被杀死”覆盖。

### Communication Stream 依赖 Gradient Ready Event

Backward Stream 产生 Gradient，Event 触发 NCCL，后续 Optimizer 等待完成。全设备同步会丢重叠；缺少依赖会数值错误。

计算和通信通常位于不同 CUDA Stream。Backward 在某 Bucket 梯度准备完成后记录 Event，Communication Stream 等待该 Event 再启动 NCCL；参数更新或后续消费者则必须等待通信完成。这样才能同时保证依赖正确和尽量扩大重叠窗口。

粗粒度 `cudaDeviceSynchronize` 会把所有 Stream 串行化，使时间线上出现不必要空洞；反之，缺少 Event 依赖可能在梯度尚未完成时读 Buffer。Profiler 中既要看 Kernel 是否并发，也要确认没有 Read-before-ready 或复用过早造成的数值异常。

### Bucket Ready 顺序影响重叠窗口

与 Backward 顺序反向组织 Parameter/Bucket，使早 Ready 先通信。模型结构变化可改变顺序，Profiler 对比。

梯度 Ready 顺序由反向计算图决定，通常与前向参数使用顺序相反。若 Bucket 排列与实际 Ready 顺序不匹配，一个早已计算完成的梯度可能因同 Bucket 中另一个参数未完成而等待，从而把通信推迟到 Backward 尾部。

模型增加分支、Activation Checkpoint 或参数共享后，顺序可能变化。优化时应比较每个 Bucket 的 Ready、Collective Start/End 和 Optimizer Wait；只调整 Bucket 容量而不观察顺序，可能减少消息数却同时损失重叠。

### 通信 Kernel 也占 GPU 执行和 HBM

Compute 与 NCCL 竞争 SM/Memory/Link，理论同时运行不保证无干扰。调优 Channel/Protocol/Bucket 用 Step Time，不追求最大单独 NCCL。

NCCL 并非只使用网卡，它会启动 GPU Kernel 搬运和归约数据，并消耗 SM、HBM 带宽、Copy Engine、NVLink 或 PCIe。计算 Kernel 已经接近 HBM 或执行资源上限时，通信并发可能让两者都变慢。

因此独立 NCCL Test 的峰值带宽不是训练阶段唯一目标。Channel、Protocol 和 Bucket 调整要在真实模型上比较完整 Step Time、计算退化、通信隐藏比例和业务吞吐；为追求更高通信带宽占用更多 CTA，可能反而挤压模型计算。

### CUDA Graph 捕获通信有一致性约束

所有 Rank 以相同顺序捕获/Launch，Buffer/Shape 稳定，Library 支持。Graph 错误按 Capture/Instantiate/Launch 和 Rank 定位。

CUDA Graph 通过预先捕获一组稳定操作来减少重复 Launch 开销。包含 NCCL 时，各 Rank 在 Capture 和后续 Graph Launch 阶段都必须维持一致的 Communicator 与调用顺序，输入 Buffer 地址和 Shape 也需要满足对应库版本的捕获约束。

动态序列长度、条件分支或多个 Communicator 的不同主机提交顺序，都可能让某些 Rank 进入不同 Graph。排障时分开记录 Capture、Instantiate 和 Launch 阶段，并输出 Graph/Communicator/Rank 标识；不要把所有问题都归因于网络超时。

## 第 20 章 · Straggler 发现与定位

### Step Time 分布先找慢 Rank

记录每 Rank Data/Compute/Comm/Barrier，按 P50/Max。所有 Rank Barrier 高可能等待一个慢 Rank，平均 GPU 指标无法显示。

先为同一 Step 收集所有 Rank 的阶段时间，再按 Median、P95 和 Max 排序。若只有一个 Rank 的 Data Time 高，它更像数据供给问题；若一个 Rank 的 Compute Time 高，检查设备和输入 Shape；若多个 Rank 的 Barrier Time 同时升高，往往是在等待少数真正的慢 Rank。

分析必须使用同一时钟口径和相同 Step ID，避免把异步日志错位拼接。建议保留 Top-N 慢 Rank 及其 Node、GPU UUID、HCA 和 Batch 标识，使性能告警能够直接下钻到物理路径。

### Data Straggler 来自 Shard、Cache 和 CPU

某节点 Cache Miss、小文件/异常样本、CPU NUMA/Worker。对齐 DataLoader Time、Storage P99、CPU 和 Batch ID。

Data Straggler 常具有节点或样本局部性：某 Shard 包含超长样本，某节点本地 Cache 未命中，小文件元数据访问变慢，或 DataLoader Worker 被 CPU/NUMA 限制。GPU 只会表现为等待下一批输入。

定位时比较慢 Rank 与健康 Rank 的 Batch ID、样本长度、Cache 命中、存储 P99、CPU 利用率和 Page Fault。将相同数据 Shard 换到另一节点复现，可以区分数据问题与节点问题；不要先通过增加 Prefetch 掩盖持续的存储异常。

### Compute Straggler 来自 Clock、Shape 或 Kernel

GPU Thermal/Power、ECC Recovery、不同 Input Length、硬件离群。固定 Batch 对照与 DCGM。

Compute Straggler 表示数据已到达，但 Forward/Backward Kernel 比其他 Rank 慢。常见原因包括 GPU 时钟下降、Thermal/Power Throttling、ECC 纠错影响、不同输入 Shape 触发另一条 Kernel 路径，或软件/硬件配置不一致。

用固定 Batch 在可疑 GPU 与健康 GPU 上做对照，并关联 DCGM 的 SM、Tensor、DRAM、Clock、Power 和错误指标。如果慢现象随 Batch 移动，更像输入或算子；若持续绑定同一 GPU/节点，则应进入硬件和节点隔离流程。

### Communication Straggler 来自 Link、HCA 和流量

Rank-HCA、NIC/Switch Counter、NCCL Trace、Rail。某 Rank Network Time 高不一定本地 NIC，可能对端/路径。

Communication Straggler 可能来自错误 HCA Affinity、降速链路、端口错误、交换机拥塞、Rail 不均或对端 Rank 迟到。Collective 是多方协议，因此本 Rank 的等待时间高，不等于故障就在本地网卡。

需要同时查看 Rank-to-HCA 映射、NCCL Transport/Channel、NIC 与交换机端口计数器以及对端时间线。分层运行同机、同节点、跨节点和跨 Rail 的基准，可把问题缩小到 GPU Fabric、PCIe、HCA 或网络路径。

### OS Noise 和邻居影响 CPU Progress

IRQ、Daemon、Page Reclaim、共享 Pod/VM、Telemetry 过重。CPU Isolation/Reservation 与节点进程对照。

GPU 通信仍需要 Host Thread 推进、处理中断和运行 DataLoader。IRQ 集中、内核 Page Reclaim、后台扫描、共享租户抢占 CPU，或过重的 Profiling 都可能让某 Rank 无法及时提交下一批 GPU/NCCL 工作。

对照慢 Rank 的 CPU Run Queue、上下文切换、内存压力、IRQ 分布和节点进程，并核对 Cgroup CPU Set 与 NUMA 绑定。若关闭高频诊断后问题消失，应降低采样范围和频率，而不是把观测工具永久留在高开销模式。

## 第 21 章 · Checkpoint 一致性与 Elastic Training

### Full、Sharded 和 Distributed Checkpoint 取舍

Full 易移植但聚合 Memory/I/O 大；Sharded 随 Rank 布局高效但恢复/Reshard 复杂；Distributed API 管 Manifest。选择与模型规模和弹性目标一致。

Full Checkpoint 把完整状态聚合为少量文件，便于单机加载和跨拓扑迁移，但聚合 Rank 需要额外 Host/GPU Memory，并可能成为网络与存储热点。Sharded Checkpoint 让各 Rank 并行保存自己的状态，写入扩展性更好，却把文件布局与原 World、分片策略绑定得更紧。

| 格式 | 写入特征 | 恢复特征 | 适用边界 |
| --- | --- | --- | --- |
| Full | 聚合后集中写入 | 易加载和迁移 | 模型较小或发布制品 |
| Sharded | 各 Rank 并行写入 | 依赖原分片布局 | 固定规模大训练 |
| Distributed | Shard 加全局 Manifest | 可由 Planner 重分片 | 弹性或跨 World 恢复 |

Distributed Checkpoint 通常在 Shard 之上增加全局元数据、Planner 和重分片能力。选型应实际验证同 World 恢复、不同 World Reshard、单文件损坏和版本升级，而不能只比较保存速度；对弹性训练而言，可恢复到不同布局往往比单次写得最快更重要。

### 保存模型外的训练状态

Optimizer、Scheduler、Scaler、RNG、Data Sampler/Epoch、Global Step、并行配置和代码/数据版本。只保存权重不能无缝继续训练。

模型权重只能恢复推理或重新开始优化。要无缝继续训练，还需要优化器动量与方差、Learning Rate Scheduler、混合精度 Scaler、CPU/GPU RNG、Sampler 位置、Gradient Accumulation 位置以及当前 Global Step。

同时保存模型代码版本、数据集版本、Tokenizer、并行组配置、Precision 和 World Size。恢复后先运行一个短验证窗口，对比 Loss、Learning Rate、样本序列和 NaN/Inf；“文件能被加载”并不等于训练语义已连续。

### Checkpoint Commit 跨 Rank 原子

所有 Shard 成功并校验才发布 Manifest。某 Rank 失败清理/TTL 临时对象，旧完整 Generation 不覆盖。

跨 Rank Checkpoint 应采用两阶段思路：各 Rank 先把 Shard 写入带 Generation 或临时前缀的位置，完成大小、Checksum 和元数据校验；协调者确认全部成员成功后，再原子发布 Manifest 或完成标记。

恢复端只读取已提交 Generation，忽略没有 Manifest 的半成品。写入失败不能覆盖最近完整版本，临时对象则通过 TTL 或后台回收清理。Manifest 应记录期望 Shard 数与身份，防止“目录存在”被误判为可恢复。

### 异步 Checkpoint 要定义完成语义

GPU/Host Buffer Copy 完成、Local Disk 完成和 Remote Durable 完成是不同点。向 Scheduler 声称可抢占前，必须达到 RPO 要求的 Durable 状态。

异步 Checkpoint 常先把状态从 GPU 拷到 Host Buffer，让训练尽快继续，再由后台线程写本地盘或对象存储。此时 API 返回只可能表示“已排队”或“GPU Buffer 可复用”，并不必然表示远端副本已经持久化。

平台与训练代码要约定 `started`、`staged`、`uploaded`、`committed` 等状态，并给每个状态独立的失败与超时处理。只有满足既定 RPO 的 Durable Commit 完成后，才能向调度器确认可以安全抢占或维护节点。

### Elastic 调整 Worker 数但不保证算法无影响

World Size 变化会改变 Global Batch、Learning Rate、Sampler 和 Optimizer State。Framework 支持重启不等于模型收敛等价，应用定义允许范围。

Elastic Training 的能力是让作业在允许的 Worker 数范围内重新形成 World，而不是让算法对规模变化天然无感。若每卡 Batch 不变，World Size 变化会改变 Global Batch；数据分片、Learning Rate、Warmup、Gradient Scaling 和优化器状态都可能需要相应调整。

应用团队应定义 Min/Max Worker、允许变化的安全点、Batch 与 Learning Rate 规则，以及数值验收容差。平台只能保证资源与重启流程，不能把“框架成功恢复并继续出 Step”当作收敛等价证明。

### Membership 变化通常触发完整 Worker Group 重启

现有 Communicator 无法随意加入 Rank，Rendezvous 新 World、从 Checkpoint 恢复。Min/Max Worker 和 Retry/Run ID 配置。

成员变化后，旧 World 中的 Rank 编号、Process Group 和 Collective 顺序已经失效。常见做法是结束当前 Worker Group，由 Rendezvous 为新 Attempt 确定成员与 Rank，再从一致 Checkpoint 恢复，而不是让一个新进程直接插入正在执行的 Collective。

控制面要区分 Job、Run 和 Attempt，并限制最大重启次数。旧 Worker 的 Lease 必须失效，新的 Run ID 与成员列表应写入日志；否则网络分区恢复后的旧进程可能与新 World 产生冲突。

### Scale-Up 需要新资源和 Checkpoint 边界

不是空闲 GPU 出现就立即加入。等待安全点，保存状态，重建 World；收益扣除重启/Cache Warmup。

Scale-Up 需要先获得一组满足拓扑和 Gang 条件的新资源，然后在训练安全边界保存状态、停止旧 World、重建 Communicator 并恢复数据与模型。中途加入会改变 Rank 和分片布局，不能仅修改一个环境变量完成。

收益评估要扣除等待资源、Checkpoint、进程重启、模型加载、数据 Cache Warmup 和编译时间。对剩余训练时间很短的作业，扩容造成的中断成本可能高于新增 GPU 能节省的时间。

### Scale-Down 与抢占协作

Scheduler 通知，应用完成 Durable Checkpoint，释放一组 Worker，重建。突然 Kill 属于 Failure Recovery，成本更高。

可协作的 Scale-Down 或抢占应提供提前通知，让训练在约定 Grace Period 内到达安全点并提交 Durable Checkpoint，再由整个 Worker Group 或受支持的成员集有序退出。释放后仍需重新 Rendezvous 和验证新 World 的 Batch/并行规则。

若通知丢失或进程被直接 Kill，就进入故障恢复路径：最近若干 Step 可能重算，临时 Shard 需要清理，节点也可能需要健康检查。平台应分别统计协作缩容与非预期中断的成功率和成本。

### Elastic 指标记录 Attempt 和 World Size

Throughput/Step 随 World 变，时间序列必须标 Attempt/World/Batch。否则扩缩容看成性能异常。

同一个 Job 的吞吐曲线跨越多个 Attempt 时，横轴上的每个点都应带 World Size、Global Batch、并行配置和 Checkpoint Generation。否则扩容后 Step Time 变化会被误报为性能回归，缩容导致的吞吐下降也无法解释。

建议同时记录 Attempt Start/End Reason、Rendezvous Duration、Restore Duration、Warmup Steps 和 Steady Throughput。这样才能把真正的训练产出与弹性控制面的停顿、重算和预热开销分开。

## 第 22 章 · 故障传播与 Fail Fast

### GPU Fatal Error 使本 Rank Context 失效

保存首错和 XID，Rank Exit；其他 Rank Abort NCCL/Exit；Scheduler 隔离 Node；新 Attempt 排除。不要在同进程继续使用失效 Context。

Fatal XID、GPU Fallen Off Bus 或不可恢复 CUDA Error 可能使当前 CUDA Context 无法继续可靠执行。应用侧首先保存最早的 CUDA/NCCL 错误、GPU UUID、PCI Bus ID 和 Kernel Log 时间，然后让失败 Rank 退出并通知其余 Rank 中止 Communicator。

恢复不能只在原进程捕获异常后继续下一 Step。调度器应 Cordon/Drain 或排除可疑节点，完成 DCGM/硬件检查后再决定是否恢复服务；新 Attempt 从完整 Checkpoint 启动，并确认没有重新落到同一故障设备。

### OOM 是确定性输入还是容量竞争要区分

同 Step/Shape 重现先改 Batch/并行；共享邻居/碎片则平台隔离/限制。所有 Rank 退出防 Hang。

若 OOM 总在同一模型阶段、相同输入 Shape 与配置下重现，它通常是确定性容量不足，应调整 Micro Batch、Sequence Length、Activation Checkpoint 或分片策略。若 OOM 只在共享 GPU、特定节点或运行一段时间后出现，则要检查邻居占用、Allocator 碎片和泄漏趋势。

任一 Rank OOM 后，其余 Rank 继续进入 Collective 会形成次生 Hang。Launcher 应终止整个 Attempt，并保留 OOM 前每 Rank 的显存分解、输入 Shape 和共享进程；不能用自动无限重试消耗同样资源重复失败。

### Network Partition 可能产生半开 World

部分 Rank 互通、部分断开。Timeout/Async Error 有限时间检测，Rendezvous Lease 防旧 Rank 重连新 Attempt。

Network Partition 可能只切断某个 Rail、方向或节点集合，因此有些 Rank 仍能通信，另一些 Rank 卡在 Collective。此时控制面连接仍可能健康，单独 Ping Master 不能证明 GPU 数据面完整。

NCCL Async Error、Collective Timeout 和外部进度 Watchdog 应在有限时间内触发全组中止。新 Attempt 必须使用新的 Rendezvous 身份并使旧 Lease 失效，防止分区恢复后的旧 Rank 加入；同时保留 NIC、RDMA 和交换机计数器用于定位原路径。

### Node NotReady 和进程 Hang 需要外部 Watchdog

应用心跳/Step 进度，Launcher/Job Controller 判定；基础设施确认 Node/Network。Watchdog Timeout 大于健康长 Step/Checkpoint，避免误杀。

Node NotReady 能由集群控制面观察，但进程死锁、CUDA 调用卡住或 DataLoader 停滞可能不会让节点离线。外部 Watchdog 需要同时观察 Worker 心跳、最近 Step 进度、Collective 状态和节点健康，而不能只看 PID 是否存在。

Timeout 应基于健康作业中最长的编译、Evaluation 和 Checkpoint 阶段设置，并保留独立的 Warning 与 Kill 阈值。触发后先采集 Stack、日志和系统状态，再终止；阈值过短会误杀慢但健康的阶段，过长则让大量 GPU 空等。

### Fail Fast 释放昂贵资源并保留根因

顺序：记录 First Failure -> 停止新 Collective/数据 -> 协调 Abort -> Graceful Log/Checkpoint 若安全 -> Kill -> Release -> Incident/Retry。不能为快速退出丢失唯一错误。

Fail Fast 的目标是阻止一个已经不可前进的 World 继续占用整组 GPU，而不是无条件立即 `SIGKILL`。首错确认后应冻结新的训练工作，协调各 Rank Abort Communicator，并在状态仍可信时完成有界的日志落盘或 Checkpoint。

```mermaid
flowchart TD
    E[First Failure] --> S[Stop New Work]
    S --> A[Abort Communicators]
    A --> D[Dump Evidence]
    D --> C{State Safe}
    C -->|Yes| P[Commit Checkpoint]
    C -->|No| K[Terminate Workers]
    P --> K
    K --> R[Release Resources]
    R --> T[Classify and Retry]
```

Grace Period 到期后强制清理残留进程和设备资源，把 First Failure、受影响 Rank/Node、最后完整 Step 和可恢复 Generation 交给工作流层。Retry Policy 再根据错误类别决定重跑、排除节点或停止等待人工处理。

## 第 23 章 · 分布式 Debug 与 Trace

### 所有 Rank 日志带统一字段

Timestamp、Job/Attempt、Global/Local Rank、Node、GPU UUID、Step、Phase、Error。集中系统可按 Step 聚合，不依赖文件名。

时间戳应统一时区并具有足够精度，Job 与 Attempt 用于区分重试，Global/Local Rank 和 GPU UUID 用于关联逻辑身份与设备，Step/Phase 则把日志放回 Data、Forward、Backward、Collective 或 Checkpoint 阶段。

建议使用结构化字段而不是只拼接在人类文本中。发生 Hang 时可以按同一 Step 聚合所有 Rank，找到最后完成的 Collective 和第一个停滞者；节点重启或 GPU Index 变化后，UUID 仍能保持设备归属连续。

### Collective Trace 使用有限 Ring Buffer

记录最近 Collective Type、Seq、Count、Group、Start/End，Hang 时 Dump。全量高频 Trace 成本大，故障窗口提升级别。

有限 Ring Buffer 只保存最近若干次 Collective 的类型、Sequence、元素数量、数据类型、Process Group、开始与完成状态。发生超时后，各 Rank Dump 自己的窗口，比较 Sequence 即可判断谁少调用、顺序错位或停在更早操作。

全量长期 Trace 会增加 CPU、磁盘和日志系统压力，甚至改变时序。生产默认使用有界缓冲和低成本字段，问题复现窗口再提高详细级别，并设置文件大小、留存时间和敏感数据限制。

### Stack Dump 需要协调信号和权限

Launcher 在超时前向 Rank 发送诊断信号，保存 Python/C++ Stack，然后终止。生产先测试 Signal 不影响正常任务，限制敏感数据。

Stack Dump 用于区分 Worker 卡在 Python DataLoader、Framework Barrier、CUDA Synchronize 还是 NCCL 调用。由 Launcher 统一发送诊断信号，可以让各 Rank 在相近时间保存 Python、Native Thread 和必要的 GPU 状态，再进入终止流程。

信号处理器必须提前在测试作业验证，避免与框架自己的 Signal 或 Checkpoint Handler 冲突。Dump 目录需要写权限和容量限制，并对可能包含路径、参数或样本信息的内容设置访问控制。

### NCCL Debug 文件按 Rank 分开

文件模板包含 Host/PID/Rank，避免并发写破坏；设置磁盘配额和清理。只在复现/Canary开启详细 Subsystem。

多个 Rank 写同一文件会造成内容交错、覆盖甚至锁竞争。Debug 文件名应至少包含 Hostname、PID、Global Rank、Attempt 和时间，集中采集后再按 Collective Sequence 合并，而不是让所有进程共享一个日志路径。

详细 NCCL Debug 与特定 Subsystem 只在短时复现、Canary 或指定 Rank 开启。启动前确认目录可写、每节点配额和回收策略；排障结束后恢复默认级别，避免日志 I/O 变成新的 Straggler。

### Profiler 从代表 Rank 和短窗口开始

全 Rank Nsight 产生巨大数据/扰动。先系统指标找慢 Rank，采少数 Step/Rank，再扩大。结果标 Profiler Overhead。

Profiler 会记录 Kernel、CUDA API、内存拷贝和通信时间线，但全 Rank 长时间采集会显著增加数据量和执行扰动。先用平台指标确定可疑阶段与 Rank，再选择健康对照 Rank和慢 Rank采集少量代表 Step。

采集窗口应避开无关 Warmup，或明确标记编译、Evaluation 和 Checkpoint。报告中记录工具版本、采样范围和启用 Profiler 前后的 Step Time，确认所观察的空洞不是采集开销本身制造的。

## 第 24 章 · 调度器与训练运行时接口

### Scheduler 分配资源而 Launcher 构造 World

Scheduler 提供 Node/GPU/CPU/Network 和 Job Identity；Launcher 读取分配生成 Rank。两者责任明确，Launcher 不越权发现未分配 GPU。

Scheduler 负责在策略和容量约束下授予一组资源，包括节点、GPU、CPU、内存、拓扑和作业身份；Launcher 只在这组授权资源中建立进程与 Rank。将两层混在一起，会出现脚本自行选择 GPU、Rank 数与实际分配不一致或无法准确 Accounting。

接口应以机器可读方式传递 Node List、GPU UUID/可见设备、CPU Set、Network Attachment 和 Job/Attempt ID。首个 Step 前，Launcher 把实际 World 回报给控制面；发现数量或映射不符就 Fail Fast，而不是静默缩小规模运行。

### Gang Admission 保证完整 World 后启动

固定 World 只有全部 Pod/Task 可运行才创建，避免部分占 GPU。镜像/模型准备也应 Ready，防止资源占住等待下载。

固定规模的分布式训练只有完整 World 才能进入 Collective。若调度器先启动部分 Worker，它们会占住 GPU 等待剩余资源，既无法产生训练结果，又可能阻止其他作业凑齐资源，形成队头阻塞或死锁式占用。

Gang Admission 应把全部 Worker 的 GPU、CPU、拓扑与关键依赖作为一个准入单元。镜像、模型或数据的大型准备步骤尽量在占用 GPU 前完成；启动后若成员未在规定时间加入，应释放整组资源并保留 Pending 原因。

### Topology Request 表达 Parallel Group

用户声明 TP/PP/DP、GPU per Node、Fabric Tier；平台选择 Group，启动验证实际 Mapping。不只请求总 GPU。

总 GPU 数无法表达并行算法的链路需求。一个 `TP=8, DP=4` 的 32 GPU 作业，通常要求每个 TP Group 位于高速 Scale-Up Domain，而 DP Group 才跨节点；若随意分散，资源数量正确但每层通信都会走低速路径。

调度接口应能表达每节点 GPU 数、Group Size、是否要求同 NVSwitch Domain、NIC/Rail 和故障域约束。调度完成后由 Launcher 输出逻辑 Group 到物理设备的映射，并以最小 Collective 验证，而不是完全信任标签。

### Checkpoint Signal 连接维护和抢占

Scheduler 提前 Warning，训练上报 Checkpoint Started/Durable，Workflow 再终止。超时策略按 Job Class。

维护和抢占需要一条明确握手：调度器发出带 Deadline 的信号，训练在安全点开始 Checkpoint，完成远端 Durable Commit 后回报 Generation，工作流再允许进程退出。只有收到信号但未持久化，不能算作可恢复。

Grace Period 应按模型规模、Checkpoint 大小和存储 P99 分级配置。超时后可以强制终止，但必须把结果标记为非协作抢占并使用上一个完整 Generation 恢复，以便单独统计丢失工作和失败原因。

### Retry Policy 避免硬件故障循环

Application Error、OOM、Node/GPU/Network 分类；基础设施失败 Exclude Node 并有限重试，确定性应用错误不自动无限重跑。

Retry 的前提是错误具有瞬时性或已经移除故障条件。语法、数据、确定性 OOM 和数值错误在同一配置下重试通常会再次失败；GPU XID、节点掉线或网络链路异常则应先排除对应资源，再从完整 Checkpoint 启动新 Attempt。

策略至少包含错误类别、最大 Attempt、退避时间、节点排除范围和人工升级阈值。每次重试继承 Job 身份但生成新的 Attempt/Run ID，保留 First Failure，避免最终只看到“达到重试上限”。

## 第 25 章 · 训练平台 SLI 与效率

### Queue、Startup、Step 和 Completion 分阶段

Queue Time、Image/Data Warmup、Time to First Step、Steady Step、Checkpoint、Failure/Recovery、Total Completion。优化最长或最不稳定阶段。

Queue Time 从提交到资源准入，Startup 包含镜像、模型、Rendezvous 和首个 Collective，Time to First Step 结束于首个有效训练 Step。之后还要分开 Steady Training、Evaluation、Checkpoint、Failure Detection 和 Restore，最后才是端到端 Completion Time。

分阶段后才能选择正确优化手段：Queue 长看容量与调度，Startup 长看制品和初始化，Step 慢看数据/计算/通信，Completion 抖动则可能来自 Checkpoint 或失败重算。只报告平均 GPU Utilization 无法解释用户等待时间。

| 阶段 | 起止边界 | 主要责任域 |
| --- | --- | --- |
| Queue | Submit 到 Admit | 容量和调度策略 |
| Startup | Admit 到 First Step | 制品和 Rendezvous |
| Steady Step | 连续有效训练 Step | 数据 计算和通信 |
| Checkpoint | Start 到 Durable Commit | 训练运行时和存储 |
| Recovery | Failure 到 First New Step | 检测 调度和恢复 |
| Completion | Submit 到最终成果 | 端到端平台效率 |

### Scaling Efficiency 标注 Strong/Weak

```text
Efficiency = Throughput N / (N x Throughput 1)
```

固定 Global Batch 为 Strong，固定每卡 Batch 为 Weak；Precision/Model/Topology一致。

Strong Scaling 固定总问题规模或 Global Batch，增加 GPU 后每卡工作减少，目标是缩短单 Step 或完成时间；Weak Scaling 保持每 GPU 工作量近似不变，GPU 增加时 Global Batch 或总问题规模同步扩大，目标是维持单位 GPU 效率。

比较曲线时必须固定模型、精度、Sequence Length、数据路径、并行策略和拓扑，并同时给出吞吐与通信占比。若测试口径混合，公式得到的 Efficiency 数字没有可比性。

### Straggler Ratio 观察最慢与中位 Rank

```text
Straggler Ratio = Max Rank Phase Time / Median Rank Phase Time
```

按 Data/Compute/Comm 分解，阈值来自健康模型。Max 单点对异常敏感，结合持续窗口。

比值接近 1 表示最慢 Rank 与典型 Rank 接近；持续升高说明同步作业正在被离群 Rank 拖慢。应分别计算 Data、Compute 和 Communication Ratio，才能判断优化应落在存储、GPU 还是网络。

单次 Max 可能只是抖动，告警需要结合连续 Step、P95 Rank 和绝对时间增量。输出 Top-N Rank 及 Node/GPU/HCA 映射，才能从 SLI 直接进入排障，而不是只显示一个无法执行的比例。

### Effective Training Throughput 扣除失败重算

完成并持久保存的 Token/样本除总 GPU Hour，包含 Retry/Checkpoint/Idle。衡量平台韧性与成本。

原始 Samples/s 或 Tokens/s 往往只统计健康稳态，忽略排队后占卡等待、Checkpoint、失败重算和恢复 Warmup。Effective Throughput 以最终被 Durable Checkpoint 或训练成果确认的有效样本/Token 为分子，以所有 Attempt 消耗的 GPU 时间为分母。

这个指标能揭示“单次跑得很快但经常失败”的平台成本。报告应同时保留稳态吞吐与 Effective Throughput，前者定位模型性能，后者衡量调度、存储和故障恢复共同形成的交付效率。

### Checkpoint RPO/RTO 实测而非配置值

故障时最后 Durable Step 到故障是实际 RPO，检测到恢复训练是 RTO。按规模/存储趋势。

训练 RPO 表示发生故障后最多需要重算多少已完成但尚未持久化的 Step；RTO 表示从故障发生或被检测，到新 Attempt 恢复并重新产出有效 Step 的时间。配置的 Checkpoint Interval 只是影响因素，不是实际结果。

故障演练应记录 Last Durable Step、Failure Time、Detection、Resource Reallocation、Restore 和 First New Step。按模型规模与存储负载观察趋势，才能判断缩短间隔是否真的降低 RPO，还是让写入争用反而增加失败与 RTO。

## 第 26 章 · 训练发布、验收与启动清单

### Framework/NCCL/Driver 升级做分布式回归

单卡、单节点、多节点，功能/数值/性能/Checkpoint；新库可能改变 Algorithm/Memory/Collective。

兼容性回归应逐层扩大：先验证单卡 CUDA 与算子，再验证单节点 P2P/NCCL，最后验证多节点 RDMA 和真实训练。每层都记录功能正确性、Loss/Gradient、峰值显存、Collective 路径、Step Time 和 Checkpoint Restore。

Framework、NCCL 或 Driver 更新可能改变 Kernel、通信算法、Buffer 和环境变量默认值。即使 API 没变，也要与生产基线比较 Rank 日志、网络 Counter 和 Scaling Curve，禁止只凭 `nvidia-smi` 正常就全量发布。

### Checkpoint 前后向兼容单独测试

新版本加载旧 Checkpoint、必要时旧版本加载新 Checkpoint做回滚。格式 Migration 有备份和不可逆说明。

向前兼容保证新软件能加载当前生产 Checkpoint，是升级的基本条件；需要快速回滚时，还要验证旧软件是否能读取新版本产生的 Checkpoint。两种方向必须分开测试，不能从一次成功加载推导双向兼容。

若格式迁移不可逆，应保留原始 Generation，并将迁移工具、Schema、Checksum 和回滚边界版本化。Restore 验收不仅检查反序列化，还要运行若干 Step 验证优化器、Sampler、RNG 和 Loss 连续。

### 模型代码变更可能改变并行通信

Layer/Wrap/Bucket/Fusion 变化，Network/Memory 即使软件栈不变也回归。发布 Manifest 记录 Parallel Config。

增加 Layer、改变参数注册顺序、调整 FSDP Wrap 或算子 Fusion，都可能改变梯度 Ready 顺序、Bucket、AllGather/ReduceScatter 数量和显存峰值。因此“只改模型代码”也可能是一项基础设施性能变更。

发布 Manifest 应记录代码与模型版本、TP/PP/DP/EP、Wrap Policy、Bucket、Precision 和关键环境变量。Canary 对比 Collective 分布和阶段时间，才能判断回归来自软件栈、网络还是模型通信图变化。

### Canary 训练要运行到代表阶段

不只十个 Step，覆盖 Warmup、稳态、Evaluation、Checkpoint/Restore 和数值趋势。可用缩小数据/模型但保持关键路径。

短 Canary 往往只覆盖编译、Cache Warmup 或少量固定 Shape，无法发现长序列、周期性 Evaluation、Checkpoint 堵塞、内存增长和跨 Epoch Sampler 问题。代表性运行至少要进入稳定阶段并完成一次保存与恢复。

为了控制成本，可以缩小数据量或训练时长，但应保持关键模型结构、并行组、目标 Shape、网络路径和软件版本。通过标准同时包含数值容差、性能预算和错误计数，不以“进程退出码为 0”作为唯一标准。

### Rank 与拓扑验收

Global/Local Rank 唯一，GPU UUID/CPU/HCA Mapping 符合 TP/PP/DP Group，未分配设备不可见。

验收先核对调度分配与运行时观察到的 World 是否一一对应：不存在重复/缺失 Rank，每个 Local Rank 只绑定预期 GPU，CPU Set、NUMA 和 HCA 与拓扑策略一致。容器或进程不应看到未授权设备。

保存完整 Mapping 作为测试证据，并故意构造不满足 Group 的分配验证准入会失败。只有正向作业能跑，不能证明平台会阻止错误拓扑和越权设备访问。

### Collective 与缩放验收

实际 Collective/消息范围，单节点/跨节点/跨机架，Scaling Curve 和 Counter，无未知回退。

基准要覆盖训练真正使用的 AllReduce、AllGather、ReduceScatter、AllToAll 和 P2P 消息范围，而不是只测一个大包 AllReduce。按同机、单节点、多节点和跨故障域逐层扩展，建立带宽与延迟基线。

同时检查 NCCL 选择的 Transport、HCA、GDR、Algorithm 和 Channel，以及 NIC/Switch Counter。缩放曲线异常或出现 Socket/Host Staging 等未知回退时，必须解释后才能通过验收。

### 数值与收敛验收

单卡/分布式 Loss、Gradient/NaN/Inf、最终指标在容差。低精度/并行变更分别验证。

使用固定 Seed、数据和初始权重，对比单卡基线与不同并行组合的初始 Loss、若干 Step 梯度统计和最终任务指标。浮点归约顺序会造成合理微小差异，因此验收使用经过定义的容差，而不是要求逐位相同。

持续监控 NaN/Inf、Gradient Norm 和 Scaler 状态。精度、并行策略和软件升级尽量一次只改变一个变量；否则数值偏移发生时无法判断是低精度、通信错误还是模型代码导致。

### Straggler 和并发验收

Rank 分布、背景 Job/Storage/Network，多 Job 公平。离群自动定位到 Node/Rank。

在空集群验证健康基线后，再加入可控的存储、网络和其他训练作业负载，观察 Step 各阶段的 Rank 分布与 Straggler Ratio。目标不是要求完全没有抖动，而是确认隔离、QoS 和告警能在预算内工作。

验收报告需展示慢 Rank 对应的 Node、GPU 与 HCA，并验证多个作业不会长期由同一租户独占共享瓶颈。若告警只能指出“Job 变慢”却无法定位离群资源，仍不具备生产可运维性。

### 故障与恢复验收

Rank OOM/Exit、Node Lost、GPU XID、Network/Rail、Storage Slow，验证 Fail Fast、资源释放、隔离、Checkpoint/Retry。

故障注入应覆盖应用层 OOM/异常退出、进程 Hang、节点丢失、GPU Fatal Error、网络中断与存储延迟。每种场景都记录检测时间、首错保存、全组退出、资源释放和错误分类，避免只验证系统最终“又跑起来”。

基础设施故障后的 Retry 必须排除问题节点或路径，并从完整 Checkpoint 恢复；确定性应用错误则不应无限重试。最后核对 RPO/RTO、重复样本和残留进程，确认恢复没有用数据一致性换可用性。

### 调度和抢占验收

Gang、不完整资源不占卡、Topology、Priority、Checkpoint Signal、Preempt/Resume、Accounting。

调度验收既要测试完整资源时成功启动，也要验证资源不足时不会有部分 Worker 长期占卡。构造不满足拓扑、配额或优先级的请求，检查 Pending 原因是否准确、资源是否可被其他作业使用。

抢占测试应覆盖 Warning、Durable Checkpoint、退出、重新排队和恢复，并核对每个 Attempt 的 GPU Hour Accounting。高优先级作业获准进入不应造成被抢占作业状态和成本丢失。

### 长时间 Soak 验收

覆盖多次 Checkpoint/Evaluation、热稳态和网络背景，XID/ECC/AER/Link 不增长，吞吐/Memory 无趋势退化。

Soak Test 需要持续越过多次周期性事件，包括 Evaluation、Checkpoint、日志轮转和数据 Epoch 切换，并让 GPU、网络和散热进入稳定温度。短压测无法发现内存缓慢增长、链路偶发错误和热节流。

测试期间记录吞吐、Step 分位、显存、时钟、温度、功耗、XID/ECC/AER 与端口错误的时间趋势。结束后还要验证最终 Checkpoint 可恢复；“作业仍在运行”不是 Soak 通过的充分条件。

### Allocation 完整且拓扑符合并行组

Node/GPU 数、TP/PP/DP/EP Group、NVLink/NIC/Rail、CPU/NUMA，Gang 完整后才启动。

启动器应把调度结果展开为完整的并行组映射，并检查每个 Group 是否落在预期 Fabric 与故障域。任何 GPU 缺失、跨越错误链路或 CPU/HCA Affinity 不满足，都应在模型加载前失败并释放整组资源。

把 Mapping 保存到 Attempt 制品中，后续吞吐下降时才能确认是应用变化还是调度位置变化。仅核对总 GPU 数会遗漏最常见的“数量正确、拓扑错误”。

### 所有 Rank 身份唯一

World/Global/Local/Node Rank、Master/Run ID，GPU UUID/BDF/HCA Mapping 写日志，无重复/缺失。

在所有 Worker 完成注册后，由协调端汇总 Rank 表并检查唯一性与连续性。每个 Global Rank 必须对应一个预期进程和设备，Local Rank 不得在同节点重复选择 GPU，Run ID 必须与本次 Attempt 一致。

发现旧 Worker、重复 Rank 或 World Size 不一致时禁止进入首个 Collective，因为此类问题随后通常只表现为难定位的初始化 Hang。

### 软件和制品一致

Image Digest、Driver/CUDA/NCCL/Framework/Extension、Code/Data/Model/Checkpoint，所有节点相同 Release。

镜像使用不可变 Digest，记录 Host Driver、容器 CUDA/NCCL、Framework 和自定义 Extension 的真实版本。代码、模型、Tokenizer、数据 Manifest 与 Checkpoint Generation 也要绑定同一发布标识，不能依赖可漂移的 `latest` 标签。

启动时随机抽查或汇总各节点版本；只要一个 Rank 加载不同二进制或制品，就应停止作业。环境不一致可能造成数值偏差，也可能改变 Collective 顺序或 ABI 行为。

### 数据 Shard 和 Sampler 状态正确

无重复/遗漏、Epoch/Seed/Resume、Uneven Input 策略；异常过滤不会让 Rank 提前结束。

Sampler 应根据 World Size 和 Rank 产生互斥 Shard，并统一 Shuffle Seed 与 Epoch。恢复时加载已提交的样本位置或能够确定性重建，避免 Checkpoint 之后重复消费大段数据。

检查最后不足 Batch、坏样本和动态过滤的处理规则，确认每个 Rank 产生相同数量的同步 Step。至少用小数据集验证覆盖集合、交集和恢复边界。

### Batch 和并行口径记录

Micro/Global Batch、Accumulation、TP/PP/DP/EP、Precision/Scaler，World 变化时调整规则。

Global Batch 应由 Micro Batch、Data Parallel Size 和 Accumulation Steps 明确推导，并记录 Sequence Length、Precision 与 Scaler 策略。TP、PP、DP、EP 的乘积和复用关系必须与 World Size 相符。

Elastic 场景还要写明 World 变化后哪些量保持不变、Learning Rate 如何处理，以及是否允许重新分片。缺少这些口径时，不同 Attempt 的 Loss 和吞吐无法可靠比较。

### Communicator 和 Transport 符合预期

NCCL Init、P2P/SHM/IB、GDR/HCA/GID、Algorithm/Channel，不未知 Socket/Host 回退。

首个正式 Step 前运行小规模 Collective，保存 NCCL 初始化摘要，确认节点内走预期 P2P/SHM，节点间选择正确 HCA、GID 和 GPUDirect 路径。环境禁止或回退选项必须显式记录。

若实际 Transport 与设计不符，先停止并定位驱动、拓扑、RDMA 或容器权限；不能因 Socket 回退仍能通信就继续消耗大规模 GPU 运行低效训练。

### CPU 与 DataLoader 资源已绑定

CPU Set/NUMA/Memory、Worker/Prefetch/Pinned、Storage/Cache，避免 GPU 分配后等输入。

每个 Rank 的 CPU Core、Host Memory 和 DataLoader Worker 应靠近其 GPU 与 HCA，并为系统和网络中断保留必要资源。Pinned Memory、Prefetch 和 Worker 数根据真实数据管线基准配置，而不是越大越好。

用一个短输入测试确认 DataLoader Time、Storage P99 和 H2D 能持续供给 GPU；若启动即出现长空洞，应先修正 NUMA、Cache 或存储，不把问题带入多节点同步阶段。

### 显存预算留有动态峰值

权重/状态/Activation/Communication/Workspace/Allocator，目标 Sequence/Batch，OOM 保护。

显存预算要覆盖模型权重、梯度、优化器状态、Activation、Collective Buffer、算子 Workspace、编译 Cache 和分配器碎片，并按目标最大 Sequence、Micro Batch 和并行配置测峰值。

保留明确安全余量处理动态 Shape 和周期性 Evaluation/Checkpoint。共享 GPU 场景还要核对其他进程与隔离上限；仅以模型加载后的 Memory Used 判断容量会漏掉 Backward 峰值。

### Checkpoint 目录和恢复已验证

权限/容量/吞吐、Manifest/Retention、最近一次 Load，RPO/RTO 和 Signal/Grace。

启动前验证所有 Rank 对 Checkpoint 临时与最终路径的权限、配额和可用空间，并确认 Manifest/Generation 命名与 Retention 不会覆盖最近完整版本。用目标规模的小 Checkpoint 测量写入 P99。

至少实际加载最近一个生产格式 Checkpoint并运行验证 Step。抢占 Grace 必须大于达到 Durable Commit 的实测时间，RPO/RTO 也以演练结果为准。

### 日志、指标和 Trace 可关联

Job/Attempt/Rank/GPU UUID/Step/Phase，DCGM/NCCL/Storage/Network，时钟同步和首错保留。

应用日志、DCGM、NCCL、存储和网络指标应共享 Job、Attempt、Node、GPU UUID 与时间窗口；训练侧再增加 Rank、Step 和 Phase。所有节点时钟必须在允许误差内，否则跨 Rank 时间线无法对齐。

在启动测试中主动产生一个可控错误，确认 First Failure 不会被后续 Abort 日志覆盖，并能从集中系统下钻到对应设备与原始文件。

### Timeout 和 Watchdog 大于健康长阶段

NCCL/Rendezvous/Step/Checkpoint，避免误杀；又有有限故障检测和资源释放上限。

分别统计健康环境中 Rendezvous、最长 Step、Evaluation 和 Checkpoint 的 P99，再为对应 Timeout 留出合理余量。一个统一的短超时容易把正常长阶段误判为 Hang，一个统一的长超时又会让通信故障长期占卡。

Watchdog 应先触发诊断，再在有界时间内 Abort 和释放资源。配置值、实际触发点和最长回收时间都要进入发布记录。

### Fail Fast 和 Retry Policy 明确

Rank OOM/XID/Exit/Network、全 Job Abort、Exclude Node、Attempt 上限，确定性错误不循环。

发布前把错误分类表与动作固化：Rank 异常如何通知全组、何时 Abort Communicator、哪些硬件错误需要排除节点、哪些应用错误直接停止，以及每类最大 Attempt 和退避时间。

用故障注入确认资源最终释放、First Failure 保留且新 Attempt 不会重用被隔离设备。Retry 不是默认兜底，只有错误条件已改变才有意义。

### Queue、Priority 和 Walltime 合理

配额/Reservation、预计 Start、Checkpoint 前抢占、Walltime/Backfill 和项目归属。

确认作业进入正确 Queue、Account/QOS 和项目配额，Priority 与业务等级一致，并能解释预计 Start。Walltime 应覆盖代表训练阶段，同时允许调度器执行 Reservation 或 Backfill。

可抢占作业必须在信号窗口内完成 Checkpoint；不可抢占作业则需要明确容量与维护边界。错误的 Walltime 或优先级会造成长时间 Pending、频繁中断或资源利用率下降。

### 首个 Step 前运行快速健康检查

GPU/Fabric/NIC、最小 Collective、Dataset/Checkpoint 可达；失败立即退出释放，不占卡等待人工。

快速健康检查只覆盖启动必要条件：设备存在且无关键错误、Fabric Link 可用、预期 HCA Up、最小 Collective 成功，以及数据与 Checkpoint 路径可读写。它不替代离线 Burn-in 或完整 DCGM Diagnostics。

检查应在几分钟内完成并返回明确失败类别。失败作业立即退出并释放 Gang 资源，可疑节点进入隔离队列，不能让 Worker 占卡等待人工登录排查。

### 运行中阶段标记完整

Data/Forward/Backward/Collective/Optimizer/Evaluation/Checkpoint，性能波动可解释。

训练代码应为主要阶段记录开始、结束和 Step ID，使平台能够把 GPU、网络和存储活动映射回业务语义。阶段标记需要低开销、跨 Rank 一致，并区分 Warmup 与稳态。

当 Step 变慢时，可先判断时间增长发生在哪个阶段，再选择 DataLoader、Profiler、NCCL 或存储证据，避免对所有层同时开启重型诊断。

### 完成与异常都执行资源清理

进程/Communicator/MPS/IPC/Temp/Mount，最终 Checkpoint/Result/Accounting，异常节点隔离。

正常完成和异常退出都要回收子进程、Communicator、MPS/共享内存、临时文件、挂载与端口，并将最终结果、最后 Durable Checkpoint 和资源 Accounting 提交给工作流层。清理必须有超时，避免 Epilog 自身无限阻塞。

若退出涉及 Fatal GPU、链路或节点错误，资源释放不等于设备可重新调度；应保留故障证据并维持隔离，直到健康检查与恢复流程明确放行。
