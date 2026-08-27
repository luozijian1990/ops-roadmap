# GPU AI Infrastructure 学习笔记 · Architecture Design

## 第 1 章 · 从 AI 工作负载认识 GPU 基础设施

### GPU 平台首先要服务于具体工作负载

GPU 基础设施不是把若干张显卡插进服务器就结束了。训练、推理和批处理虽然都可能使用同一型号 GPU，但它们对显存、计算吞吐、网络、存储、调度和可用性的要求不同。平台设计必须先描述工作负载，再决定硬件和交付方式。

| 工作负载 | 主要目标 | 常见瓶颈 | 运维关注点 |
| --- | --- | --- | --- |
| 训练 | 总吞吐、扩展效率、长时间稳定运行 | GPU 算力、显存、集合通信、数据供给 | Checkpoint、节点故障、NCCL、网络和队列 |
| 在线推理 | P95/P99 延迟、并发和可用性 | 显存容量、批处理、队列和模型加载 | 滚动升级、尾延迟、过载保护和副本扩缩 |
| 离线批处理 | 单位任务成本和完成时间 | 数据读取、吞吐和资源利用率 | 资源碎片、队列等待、失败重试和成本 |
| 数据准备 | 数据吞吐和处理效率 | CPU、内存、存储和解码 | GPU 是否真正被数据持续供给 |

同一台机器上可以同时存在这些工作负载，但不能用一个“GPU 利用率”指标代表它们的健康程度。例如训练可能在同步通信阶段暂时降低计算利用率，推理可能在 Decode 阶段显存带宽很高但 Tensor Core 利用率不高。指标必须和工作负载阶段一起解释。

#### 把工作负载描述成可测量的资源画像

| 画像字段 | 训练示例 | 推理示例 |
| --- | --- | --- |
| 计算 | 每 Step FLOP、精度、Tensor Core | Prefill/Decode、量化、Batch |
| 显存 | 权重、梯度、优化器、激活 | 权重、KV Cache、Workspace |
| 通信 | AllReduce、AllGather、Checkpoint | 请求入口、模型并行、结果流式返回 |
| 存储 | Dataset 连续读取、周期写入 | 模型加载、少量请求输入 |
| 调度 | Gang、长作业、Checkpoint | 副本、滚动升级、弹性 |
| SLO | Step Time、Samples/s、完成时间 | TTFT、Tokens/s、P95/P99 |

画像要标注平均、峰值和故障状态。例如“正常 Batch 32”不足以规划显存，还要包含最大 Shape、异常长 Context 和重试时的并发峰值。

### 训练、推理和批处理的资源曲线不同

训练通常需要保存中间激活和优化器状态，显存峰值高，并且会周期性执行 AllReduce 或其他集合通信。单卡计算完成得越快，跨 GPU 同步和数据加载越容易成为新的瓶颈。训练平台还必须考虑长作业被中断后的恢复成本，因此 Checkpoint 不是附加功能，而是可靠性设计的一部分。

在线推理更关注请求到达后的等待时间。模型加载、请求排队、动态批处理和 KV Cache 都会影响尾延迟。提高 batch size 可能增加吞吐，却也可能让单个请求等待更久；把 GPU 分配给过多租户则可能造成显存争用和不可预测的延迟。

离线批处理可以接受较高的单次延迟，但通常会积累大量任务。它更适合使用队列、低优先级资源和可重试机制，以便在不影响在线服务的情况下提高 GPU 的时间利用率。

#### 训练的一个 Step 包含多种资源阶段

```mermaid
flowchart LR
    Load[读取和准备Batch] --> H2D[Host到Device]
    H2D --> Forward[Forward]
    Forward --> Backward[Backward]
    Backward --> Collective[Collective]
    Collective --> Update[Optimizer Update]
    Update --> Checkpoint{是否Checkpoint}
    Checkpoint -->|否| Load
    Checkpoint -->|是| Store[写入存储]
    Store --> Load
```

GPU 只在部分阶段执行高强度计算。DataLoader、通信和 Checkpoint 变慢都会拉长 Step Time，因此训练可观测性必须能分解阶段。

#### 推理的 Prefill 和 Decode 画像不同

Prefill 一次处理输入 Token，矩阵规模较大，通常更容易利用 Tensor Core；Decode 逐步生成 Token，频繁读取模型权重和 KV Cache，更容易受显存带宽、Batch 和调度影响。一个平均 GPU Utilization 无法判断两阶段是否正常。

### GPU 只是计算平面的一部分

一个可运行的 AI 任务至少经过以下链路：

```mermaid
flowchart LR
    Data[数据集和输入] --> Storage[存储平面]
    Storage --> CPU[CPU和主机内存]
    CPU --> GPU[GPU和显存]
    GPU --> NIC[NIC和网络Fabric]
    NIC --> GPU2[远端GPU]
    Control[驱动容器调度监控] --> CPU
    Control --> GPU
    Control --> NIC
```

如果存储读取慢，GPU 会等待数据；如果 CPU 和 GPU 位于不同 NUMA 域，数据可能绕行；如果 NIC 与 GPU 的 PCIe 路径不合理，GPUDirect RDMA 的收益会下降；如果 Device Plugin 或容器运行时没有正确交付设备，应用甚至看不到 GPU。因此“GPU 空闲”并不一定说明 GPU 数量太多，也可能说明链路上游没有把工作送到 GPU。

## 第 2 章 · AI 数据中心的四个平面

### 计算、网络、存储和管理平面共同决定作业结果

AI 集群可以按职责分为四个平面：

| 平面 | 主要组件 | 典型问题 |
| --- | --- | --- |
| 计算平面 | GPU、CPU、显存、主机内存 | 算力不足、显存不足、温度节流 |
| 网络平面 | PCIe、NVLink、NVSwitch、NIC、交换机 | 带宽不足、拓扑绕行、拥塞、丢包 |
| 存储平面 | 本地 NVMe、并行文件系统、对象存储 | 数据加载慢、Checkpoint 抖动、元数据拥堵 |
| 管理平面 | 驱动、容器运行时、调度器、监控、配额 | 设备未交付、作业排队、版本漂移、告警缺少 Runbook |

四个平面不是相互独立的。例如网络平面的 RDMA 配置会影响训练计算时间，管理平面的调度策略会决定作业拿到哪几块 GPU，存储平面的 Checkpoint 延迟会决定训练恢复时间。容量规划和故障排查都需要跨平面建立证据链。

### 管理平面要把硬件能力变成可用资源

GPU 设备从硬件到用户任务通常经过以下交付路径：

```text
GPU Hardware
  ↓
NVIDIA Driver
  ↓
Container Runtime / NVIDIA Container Toolkit
  ↓
Device Plugin 或 HAMi Device Plugin
  ↓
Kubelet Capacity / Allocatable
  ↓
Scheduler、Queue、Quota
  ↓
Pod、Job 或训练进程
```

链路中的每一层都可能单独失败。宿主机执行 `nvidia-smi` 正常，只能证明硬件和驱动在宿主机侧基本可见，不能证明容器设备注入、Kubernetes 扩展资源注册或应用 CUDA Runtime 正常。排障时要先确定故障发生在哪一层，再选择重启组件、修复版本、隔离节点还是修改工作负载。

#### 每层都需要独立的验收信号

| 层 | 最小成功信号 | 仍不能证明什么 |
| --- | --- | --- |
| Hardware/Driver | `nvidia-smi` 列出正确 UUID | 容器和应用兼容 |
| Container Runtime | 最小 CUDA 容器看到 GPU | Kubernetes 注册 |
| Device Plugin | Node 有 `nvidia.com/gpu` | CUDA Kernel 可运行 |
| Scheduler | Pod 获得目标资源 | 拓扑和性能正确 |
| Framework | CUDA Device Test 通过 | 多卡/RDMA 正常 |
| Workload | 目标模型运行 | 吞吐、SLA 和恢复达标 |

这一分层也决定故障归属：单镜像问题不应触发整节点报修，设备数量变化则不应只通过重启 Pod 处理。

### 带内、带外和计算网络承担不同责任

计算网络承载 GPU 集合通信，要求高带宽、低延迟和稳定的拥塞控制；存储网络承载数据集和 Checkpoint，通常更关注持续吞吐、并发和尾延迟；管理网络承载 SSH、监控和控制面；带外网络连接 BMC、交换机和电源管理设备，用于主机操作系统不可用时的维护。

把这些网络混在一起会让故障域和容量预算变得模糊。一次 NCCL 超时首先应检查计算网络和 GPU 拓扑，不应该直接把它当成 Kubernetes 控制面故障；一次 Checkpoint 写入抖动也不能仅凭 GPU 利用率判断原因。

#### 网络平面需要独立的容量和故障域

| 网络 | 主要流量 | 关键指标 | 典型故障影响 |
| --- | --- | --- | --- |
| 计算网络 | NCCL/RDMA | Bandwidth、Latency、Drop、PFC/ECN | GPU 同步等待、Hang |
| 存储网络 | Dataset/Checkpoint | Throughput、IOPS、P99 | GPU Idle、恢复超时 |
| 管理网络 | Kubernetes、SSH、监控 | Availability、API Latency | 调度/运维受阻 |
| 带外网络 | BMC、PDU、交换机管理 | Reachability、Audit | 主机故障时无法恢复 |

物理上可以共享交换设备，但逻辑优先级、容量水位、监控和变更窗口仍要分别设计。

## 第 3 章 · Scale-up、Scale-out 与故障域

### Scale-up 解决节点内通信和容量问题

Scale-up 是在同一节点内增加 GPU，并通过 PCIe、NVLink 或 NVSwitch 组织设备之间的通信。它通常拥有比跨节点网络更低的延迟和更稳定的带宽，适合张量并行、模型并行和高频梯度同步。

Scale-up 并不意味着所有 GPU 对之间性能完全相同。没有 NVLink 的 GPU 可能只能通过 PCIe 通信；GPU、CPU 和 NIC 连接到不同 PCIe Root Complex 时，数据也可能经过额外的主机路径。调度器只分配“数量正确”的 GPU，不代表分配了“拓扑正确”的 GPU。

### Scale-out 通过网络扩展计算规模

Scale-out 是增加节点并通过 InfiniBand 或高性能以太网连接它们。它可以提供更大的显存总量和更高的集群容量，但通信经过 NIC、交换机和远端节点，延迟、拥塞和故障概率也随规模增加。

分布式训练通常需要同步所有参与者。最慢的节点、链路或数据加载器会让其他 GPU 等待，形成 straggler 效应。因此评估多节点扩展时不能只比较 GPU 数量，还应记录：

- 单卡吞吐和单节点多卡吞吐；
- 多节点扩展效率；
- NCCL Bus Bandwidth 和通信占比；
- 网络端口错误、丢包、拥塞和 RDMA counter；
- 数据读取、Checkpoint 和恢复时间。

### 故障域决定高可用和隔离边界

GPU 平台常见故障域包括单 GPU、单节点、单机架、单交换机、单存储系统和管理控制面。不同故障的处置范围不同：单个工作负载 OOM 通常不需要隔离节点；重复 Uncorrectable ECC、GPU Fallen Off Bus 或影响多个作业的 Fabric 错误，通常需要停止新作业并 Cordon/Drain 节点。

```mermaid
flowchart TD
    GPU[单GPU或MIG实例故障] --> Node[节点故障域]
    Node --> Rack[机架故障域]
    Rack --> Fabric[交换机或网络Fabric故障域]
    Node --> Storage[存储故障域]
    Node --> Control[管理控制面故障域]
```

故障域设计应同时考虑作业重试和数据恢复。例如分布式训练的 Worker 如果全部集中在一个机架，机架故障会让一次作业整体失败；推理副本如果全部放在一个节点，节点维护会造成服务中断。调度策略、Checkpoint 位置和副本分布应共同表达这些约束。

#### 故障域和性能本地性需要取舍

把训练 Rank 放在同一 NVSwitch 域可以提高性能，但同一节点故障会让整个 Job 退出；把推理副本分散到不同机架提高可用性，却可能增加模型分发和存储路径成本。设计要先明确 Job 是“整体失败后从 Checkpoint 恢复”，还是“部分副本继续提供服务”。

#### 隔离范围应小于或等于故障影响范围

单 GPU/MIG 错误优先限制对应设备，节点 Driver/Fabric 错误隔离节点，ToR/PFC Storm 按网络域处理。隔离过小会让故障继续传播，隔离过大会浪费健康容量。需要用 UUID、BDF、Port、Rack 和 Job 映射确定影响域。

## 第 4 章 · 从指标到业务结果

### 分配量、活跃量和有效吞吐不是同一个指标

平台至少要区分三个概念：

| 指标 | 说明 | 误读风险 |
| --- | --- | --- |
| GPU Allocated | 调度器已经分配给作业的资源 | 分配了不代表应用正在计算 |
| GPU Active | GPU 实际执行 Kernel 或通信的时间 | 低值可能是 I/O、同步或排队等待 |
| Effective Throughput | Samples/s、Tokens/s 或完成任务数 | 才能连接到业务目标，但必须结合模型和输入 |

`GPU Allocated` 很高而 `GPU Active` 很低，可能是资源碎片、应用初始化、数据准备、Queue 逻辑或作业挂起；`GPU Active` 很高但 `Tokens/s` 仍低，可能是算子效率、显存带宽、通信、时钟或热节流问题。容量报告不能只用“GPU 已分配卡时”替代有效业务吞吐。

#### 四个效率指标回答不同运营问题

```text
Allocation Efficiency = Active GPU Time / Allocated GPU Time
Scheduling Efficiency = Running Time / (Queue Time + Running Time)
Scaling Efficiency = N卡实际吞吐 / (N × 单卡吞吐)
Cost Efficiency = 有效样本或Token / GPU成本
```

这些是概念公式，具体采样和分母必须在平台内统一。短作业初始化、Checkpoint 和失败重试是否计入 Active/Running，会显著影响结果，报表要写明口径。

### 观测数据需要稳定的资源身份

长期指标应优先使用 GPU UUID、MIG UUID、PCI BDF、Node、Pod UID 和 Job ID 作为关联键。GPU index 可能在重启、MIG 重配或容器内发生变化，不适合作为跨时间的唯一身份。

最低限度的硬件观察可以从以下命令开始：

```bash
nvidia-smi
nvidia-smi --query-gpu=uuid,name,pci.bus_id,memory.total,memory.used,temperature.gpu,power.draw,clocks.sm --format=csv
nvidia-smi topo -m
nvidia-smi nvlink --status
```

这些命令只能提供当前节点的快照。生产监控还需要把硬件指标和 Pod、Job、训练 Step、推理请求、队列等待以及错误日志关联起来，才能判断资源问题是否已经影响业务。

### 先建立健康工作负载模板再设置告警

不同模型和阶段的指标基线不同。训练的 Compute Phase、AllReduce Phase 和 Checkpoint Phase 会呈现不同的 GPU、网络和存储曲线；推理的 Prefill 和 Decode 也会有不同的显存带宽和 Tensor Activity。统一使用一个“GPU 利用率低于 50% 就告警”的阈值，容易制造噪声。

更可靠的做法是为代表性工作负载建立健康模板，并同时记录：

- 计算、通信、数据加载和 Checkpoint 的阶段时间；
- GPU、SM、Tensor、DRAM、PCIe 和 NVLink 指标；
- 温度、功耗、时钟和 Throttling；
- Queue Time、Samples/s、Tokens/s、P95/P99 延迟；
- 作业失败、重试和节点变更。

告警应表达“指标偏离健康模板并且业务结果受影响”，而不是只表达单个 Field 的绝对值。

#### 健康模板要分硬件、平台和模型版本

同型号 GPU 在不同 Power Limit、Driver、CUDA Library、拓扑和模型版本下可能有不同基线。模板至少用 Node Pool、GPU Model、Driver、Image Digest、Model Version、Precision 和 Batch 作为维度，并控制标签基数。

模板更新应走变更流程。升级后出现整体吞吐变化时，先与旧模板对比，再决定接受新基线还是回滚，不能自动把性能下降学习成“正常”。

## 第 5 章 · 建立 GPU 平台的学习和排障顺序

### 排障应从物理层逐级走向应用层

GPU 故障排查不能一上来就修改 NCCL 参数或重启 Pod。建议按下面的顺序收集证据：

```text
Physical / Power / Cooling
        ↓
GPU / PCIe / Driver
        ↓
NVLink / NVSwitch / Topology
        ↓
NIC / IP / MTU / RDMA
        ↓
Container Runtime / CUDA / Framework
        ↓
Kubernetes / Device Plugin / Scheduler
        ↓
NCCL / Training / Inference Application
```

每一级都要回答“设备是否存在、链路是否可达、能力是否交付、性能是否符合基线”。如果底层存在 Fatal XID 或设备数量变化，应先保留日志并隔离节点；如果只有单个镜像的 CUDA Runtime 不兼容，则不应把健康节点整体下线。

### 基准测试要分离计算、通信、存储和平台问题

上线验收至少应分成四类测试：

1. 单卡计算和显存测试，确认 GPU、驱动、时钟、温度和功耗处于预期范围。
2. 单节点多卡 NCCL 和 P2P 测试，确认拓扑和 NVLink/NVSwitch 路径。
3. 多节点 RDMA 和 NCCL 测试，确认 NIC、MTU、拥塞控制和 GPUDirect 路径。
4. 真实容器、Kubernetes、共享方案和监控测试，确认资源交付、隔离、指标映射和故障恢复。

如果只运行一个端到端训练任务，失败时很难判断是 GPU 算子、网络、存储还是调度器问题。分层基准测试的价值在于缩小故障范围，并为后续容量规划提供可比较的基线。

### GPU 平台的最终目标是稳定交付有效算力

GPU 平台的产出不是“节点上有多少张卡”，而是用户能否在预期时间内获得稳定、可观测、可恢复的有效算力。设计评估至少应同时考虑：

- 工作负载的显存、算力、通信和 I/O 需求；
- GPU、CPU、内存、NIC 和存储的拓扑关系；
- 独占、MIG、时间切片、HAMi 或虚拟化的隔离取舍；
- 调度等待、资源碎片、优先级和抢占恢复；
- 温度、功耗、ECC、XID、链路和容器健康；
- 基准吞吐、尾延迟、故障恢复和升级回滚时间。

后续各册将沿着这条主线展开：先理解 GPU 如何执行，再理解设备如何互连，接着理解软件如何交付，最后用平台、指标和 Runbook 把它运营起来。

#### 八册之间形成一条连续的数据路径

```text
00 工作负载和系统全景
  ↓
01 GPU执行和显存瓶颈
  ↓
02 PCIe NUMA NVLink NVSwitch
  ↓
03 NCCL RDMA AI Network
  ↓
04 Driver CUDA Container
  ↓
05 Kubernetes MIG HAMi Scheduler
  ↓
06 Metrics Alert Troubleshooting
  ↓
07 Requirement Capacity Acceptance
```

学习时不必一次掌握所有产品，但应始终能把一个现象放回这条链路：工作从哪里进入、在哪一层等待、用什么证据验证、修复后如何证明恢复。

## 第 6 章 · 训练工作负载的完整生命周期

### 训练从数据准备到参数更新形成循环流水线

训练不是 GPU 上连续矩阵计算，而是数据读取、CPU 解码、Host-to-Device Copy、Forward、Loss、Backward、Gradient Communication、Optimizer 和 Checkpoint 组成的循环。任何阶段变慢都会让 GPU 等待或让 Step Time 增长。

```mermaid
flowchart LR
    A[Dataset Read] --> B[CPU Decode]
    B --> C[Host To Device]
    C --> D[Forward]
    D --> E[Loss]
    E --> F[Backward]
    F --> G[Gradient Communication]
    G --> H[Optimizer]
    H --> I[Checkpoint]
    H --> A
```

平台设计要为每阶段指定资源与 SLI：Data Read 看吞吐和尾延迟，Copy 看 PCIe/NUMA，Compute 看 SM/Tensor/DRAM，Communication 看 NCCL/NVLink/RDMA，Checkpoint 看写入时间和恢复完整性。

### Global Batch 由多个并行参数共同决定

```text
Global Batch = Micro Batch per GPU x Data Parallel Replicas x Gradient Accumulation Steps
```

增加 GPU 但保持 Micro Batch 不变会增大全局 Batch，可能改变收敛和学习率；保持 Global Batch 则每卡工作量下降，通信占比上升。性能报告必须注明 Batch 口径，否则 Scaling Efficiency 无法比较。

#### 有效吞吐必须扣除失败和重算

训练平台的有效产出不是峰值 Samples/s，而是单位时间完成并可恢复的有效 Step。频繁抢占、XID、网络 Hang 或 Checkpoint 失败会让 GPU 忙碌但没有产出。

```text
Effective GPU Hours = Allocated GPU Hours - Idle - Failed Work - Recomputed Work
```

Accounting 应区分 Active Compute、Communication、Queue、Idle in Allocation、Checkpoint 和 Failed，才能判断优化硬件还是调度流程。

### Checkpoint 把硬件故障转换为可恢复计算损失

Checkpoint 频率越高，故障时重算越少，但写存储和同步开销越大。设计输入包括模型/优化器状态大小、写入带宽、可接受 RPO、恢复 RTO、节点 MTBF 和训练总时长。

分布式 Checkpoint 还要保证 Rank 分片一致、Metadata 原子提交和版本兼容。文件存在不代表可恢复，验收必须从故障点启动新 Job 并继续若干 Step。

### Evaluation 和数据变更会改变资源曲线

训练每隔若干 Step 进入 Evaluation，通常不执行完整的参数更新，却会增加推理、指标聚合和结果写入。多 Rank 评估还可能需要收集预测结果或同步指标，因此 GPU 计算下降并不自动表示设备异常。

Dataset Epoch 切换、Shuffle、Cache Miss 和重新加载分片也会形成周期性低利用。排查时应把 `phase=eval`、`epoch_boundary`、`cache_hit` 和 `checkpoint` 作为时间线标签，并同时比较 DataLoader、Storage Read、Collective 和 GPU Kernel；只有这些阶段都正常而计算持续掉速，才优先怀疑 GPU 或驱动。

## 第 7 章 · 推理工作负载的请求路径

### 在线请求经过排队、批处理、计算和流式返回

```mermaid
sequenceDiagram
    participant C as Client
    participant G as Gateway
    participant Q as RequestQueue
    participant B as Batcher
    participant M as ModelServer
    participant D as GPU
    C->>G: Request
    G->>Q: Admit
    Q->>B: Wait and Batch
    B->>M: Execute Batch
    M->>D: Prefill and Decode
    D-->>M: Tokens
    M-->>C: Stream Response
```

端到端延迟至少包含 Gateway、Queue、Batch Wait、Tokenizer、H2D、Prefill、Decode 和 Network Return。GPU Kernel Time 正常而 P99 很高，问题可能在队列或长输入。

请求路径中的每个阶段都可能改变容量结论：Admission 控制突发，Batcher 决定等待与填充，Tokenizer 消耗 CPU，Prefill 和 Decode 使用不同的 GPU 资源，流式返回还受网络和客户端读取速度影响。服务端应为请求生成 `request_id`，并记录进入队列、出队、首 Token、每个 Decode 片段和完成时间，才能把端到端 P99 拆成可行动的等待。

当队列持续增长而 GPU 仍空闲，优先检查调度线程、Tokenizer、模型加载或设备交付；当 GPU 已饱和且 Queue Time 上升，才需要扩容或调整 Admission。长 Prompt、长输出和取消请求应单独分桶，避免平均请求掩盖尾部资源占用。

### TTFT、TPOT 和吞吐对应不同用户体验

| SLI | 含义 | 主要影响因素 |
|---|---|---|
| TTFT | 请求到首 Token | Queue、Prefill、Prompt Length |
| TPOT/ITL | 后续 Token 间隔 | Decode、Batch、KV Cache、调度 |
| End-to-End | 请求完整时间 | 输入输出长度和所有阶段 |
| Tokens/s | 单副本或集群吞吐 | Batch、并发、精度、GPU |
| Queue Time | 等待执行时间 | 容量和 Admission |

平台容量以满足分位延迟下的安全吞吐为准，不以无限增加 Batch 得到的峰值吞吐为准。

容量报告至少同时给出并发、输入输出长度分布、Batch 等待上限和 TTFT/TPOT 的 P50、P95、P99。吞吐提升但 P99 超过 SLO 时，不能把该配置作为可用容量；应保留一部分余量应对突发和单副本重启。

### Continuous Batching 让请求动态进入和退出

传统静态 Batch 等所有请求完成后再处理下一批，长度差异造成 Padding 和等待；Continuous Batching 可在 Decode Step 间替换已结束请求，提高利用率，但调度、KV Cache 分页和租户公平更复杂。

观测需要 Active Sequence、Waiting Sequence、Token Budget、KV Cache Block、Preemption/Swap 和每请求延迟。只看 GPU Utilization 无法发现某些长请求长期占据 Cache。

调度器在每个 Decode 迭代重新决定哪些请求继续占用 KV Cache，结束请求释放的 Block 才能被新请求复用。若 Cache 不足，系统可能拒绝请求、排队、抢占或把状态换出；这些路径的代价不同，必须在 Runbook 中区分，而不能统称为“GPU 利用率不足”。

### 离线推理和在线推理使用不同优化目标

离线推理可积累大 Batch，以完成时间和单位成本为主；在线推理受 P99、可用性和突发约束。离线任务适合 Queue、Spot/Preemption 和弱隔离共享，关键在线服务通常需要容量预留、稳定拓扑和更强隔离。

两类任务应使用不同的调度和验收模板。离线任务关注每批完成时间、失败重试、Checkpoint 或中间结果保留；在线服务则要验证滚动升级、冷启动、过载保护和副本丢失时的尾延迟。把离线大 Batch 的峰值 Tokens/s 直接当作在线容量，会忽略排队和长尾。

## 第 8 章 · 模型并行与基础设施映射

### Data Parallel 把副本通信映射到 Scale-Out 网络

每个 Data Parallel Rank 保存模型副本并处理不同 Batch，Backward 后同步 Gradient。模型能单卡放下时最直观，但 Rank 增加使 AllReduce 跨更多 GPU、节点和机架。

基础设施重点是均匀 GPU、足够每卡 Batch、NCCL 带宽、慢 Rank 检测和 Checkpoint 一致性。跨机架放置应由 Scaling Baseline 证明，而不是只因资源数量够。

每个 Rank 必须使用互不重复的数据分片，并在同一个全局 Step 完成梯度同步。网络侧应按 Job 记录 AllReduce 的消息大小、持续时间和等待比例；如果某 Rank 的数据读取或时钟较慢，其他 Rank 会在 Collective 处等待，平均带宽可能仍看起来正常。

### Tensor Parallel 优先使用高带宽节点内互连

Tensor Parallel 在每层内分割矩阵，通信频率高、消息与计算紧密交错，对延迟敏感。通常把一个 TP Group 放在同一 NVLink/NVSwitch Domain；跨 PCIe/网络会显著降低效率。

调度器需要分配完整 GPU Clique。把 TP=4 随机放到四张可用 GPU，即使同节点也可能跨较弱路径。

TP Size 增大可以降低单卡权重容量，却会让矩阵分片变小并增加每层通信参与者。选择候选值时同时记录每卡显存峰值、Collective 延迟、GEMM 形状和 Tokens/s；显存已满足而通信占比上升时，应保留较小的 TP，而不是为了“用满 GPU”继续扩组。

### Pipeline Parallel 要平衡 Stage 与 Bubble

模型 Layer 被分到多个 Stage，Activation 在相邻 Stage 间 Send/Recv。Stage 计算量不均会让快 Stage 等慢 Stage；Micro Batch 数不足会放大 Pipeline Bubble。

平台需要保证相邻 Stage 网络路径、稳定延迟和故障一起恢复。应用侧负责 Layer Partition，平台侧提供拓扑与测量证据。

Micro Batch 数不足时，流水线启动和排空阶段的 Bubble 占比高；Stage 计算量不均时，增加 Micro Batch 也只能让快 Stage 更久地等待慢 Stage。验收应按 Stage 输出 Forward、Backward、P2P 和 Idle 时间，并把 Stage 映射到节点、GPU UUID 和故障域。

### MoE 的 AllToAll 对网络均匀性特别敏感

Mixture-of-Experts 把 Token 路由到不同 Expert，可能形成 AllToAll。Token 分布不均会让部分 Expert/Rank 热点，即使总网络带宽足够也出现长尾。监控应关联 Expert Load、Rank Bytes、Queue 和 Switch Port，而不只看平均 NIC 利用。

容量规划要覆盖路由倾斜和突发，而不是只按平均 Token 数估算。若单个 Expert 的容量上限触发丢弃或二次路由，模型质量和通信量都会变化；排障时应把 Router 负载、每 Rank 发送/接收字节、交换机端口队列与 Step Time 对齐，区分模型侧热点和网络侧拥塞。

## 第 9 章 · 数据和模型制品生命周期

### Dataset、Checkpoint、Model 和 Engine 是不同制品

| 制品 | 主要特性 | 关键治理 |
|---|---|---|
| Dataset | 大容量、多文件、版本与授权 | Lineage、缓存、访问审计 |
| Checkpoint | 训练中间状态、频繁写 | 原子性、保留、恢复验证 |
| Model | 可部署权重和配置 | Registry、审批、质量 |
| Engine | 硬件/Runtime 优化产物 | 兼容矩阵、重建、回滚 |
| Image | 软件运行环境 | Digest、SBOM、漏洞与签名 |

把所有对象放在同一个普通文件目录，会失去生命周期和权限边界。Dataset 只读、Checkpoint 高频写、Engine 按架构构建，存储和发布策略应该不同。

### 数据路径决定 GPU 是否持续得到输入

```text
Object or Shared Storage
  -> Node Cache or Local NVMe
  -> Host Page Cache
  -> DataLoader and Decode
  -> Pinned Host Buffer
  -> GPU Memory
```

每一层都有容量、吞吐、并发和失效行为。Cache Hit 高时共享存储看似富余，集群冷启动会暴露真实回源压力。性能测试必须分别覆盖冷 Cache 和热 Cache。

### 制品版本要进入作业和指标标签

训练记录 Dataset Revision、Code Commit、Image Digest、Hyperparameter 和 Checkpoint；推理记录 Model/Engine/Image/Config Revision。性能或故障发生时才能比较版本，而不是仅按服务名聚合。

高基数完整 Commit 可放日志/元数据系统，Prometheus 使用有界 Release Label，避免时间序列爆炸。

## 第 10 章 · 从业务 SLO 到基础设施 SLI

### 每个业务目标都要找到可观测的资源链

| 业务目标 | 主要 SLI | 基础设施证据 |
|---|---|---|
| 训练按时完成 | Step Time、有效 Tokens/s | GPU、NCCL、Storage、Failure |
| 在线首 Token | TTFT P99 | Queue、Prefill、CPU、GPU |
| 连续生成流畅 | TPOT P99 | Decode、KV Cache、共享干扰 |
| Job 快速启动 | Queue 和 Startup | 调度、镜像、模型加载 |
| 故障少丢进度 | RPO/RTO | Checkpoint、隔离、恢复 |
| 多租户公平 | GPU Hour、Wait、Share | Quota、Queue、Preemption |

硬件指标是解释变量，不是业务 SLO 本身。GPU 温度正常不能证明训练按时完成，Tokens/s 正常也不能证明 ECC 风险可忽略。

### Error Budget 驱动升级和共享策略

如果 GPU Pod Start Success、推理可用性或训练恢复时间持续消耗 Error Budget，应暂停高风险 Driver/Operator 升级或扩大共享比例。反之长期稳定且 Queue 很高，可以评估更积极的资源池化。

策略变更要绑定可回滚的观测窗口：例如先在 Canary 节点比较 Pod 启动成功率、作业失败率、P95/P99 和恢复时间，再决定扩大范围。共享比例提升不能只看队列下降，还要检查显存争用、抖动和故障传播是否仍在预算内。

### 成本按有效产出而不是分配小时衡量

GPU Hour 是成本输入，但真正比较应使用每训练 Token、每完成实验、每百万推理 Token或每满足 SLA 请求的成本。便宜但频繁失败、网络低效或排队很长的平台可能总成本更高。

能效同理：看完成同一任务的 Energy，而不只是某时刻 Power Draw。降低功耗导致任务时间大幅增加，未必减少总能耗。

成本分摊应把 Queue、初始化、Checkpoint、失败重算和空闲保留分开，否则高分配量会掩盖低有效产出。报告至少保留工作负载、GPU 型号、精度、Batch、版本和故障重试维度，才能比较一次优化究竟减少了单 Token 成本，还是只是把成本转移到更长的等待时间。

## 第 11 章 · 学习与排障的统一提问框架

### 遇到知识点先确认它位于哪条路径

对每个组件依次问：它处理计算、内存、节点互连、网络、设备交付还是控制面；输入输出是什么；状态由谁维护；失败影响单进程、单卡、单节点还是集群；有哪些只读证据。

可以把答案写成一条最小证据链：工作负载产生什么数据，哪一层接收并转换它，下一层依赖什么资源，哪里记录成功或失败。例如“Pod 看不到 GPU”应依次核对节点设备、Runtime 注入、Device Plugin 注册和容器内 CUDA，而不是直接修改应用参数。

### 遇到性能问题先确认时间花在哪里

依次比较 Queue、Data、Host、Copy、Compute、Communication、Synchronization 和 Output，不用单一利用率代替时间分解。再用单卡、单节点和多节点对照确定首次退化层。

对照实验应一次只改变一个主要变量，并保留模型、Batch、精度、镜像和数据版本。若单卡正常、单节点多卡退化，优先查拓扑与进程绑定；若单节点正常、多节点退化，优先查 NCCL、RDMA、MTU、拥塞和 Rank 映射。

### 遇到故障先保存首错再改变状态

先记录 GPU UUID/BDF、Pod/Rank、Driver/Fabric、Kernel/应用首错和指标时间线，再 Cordon/Drain/Reset。恢复后按原路径和通用基线验证，而不是只确认错误消息消失。

证据包还应包含变更版本、作业 Attempt、最后一个成功 Step、Checkpoint 位置和受影响范围。Reset 或重启可能清除现场状态，因此必须先保存日志、拓扑和计数器，再执行会改变设备状态的动作。

### 遇到选型先声明工作负载和失败假设

脱离 Training/Inference、Model Size、并行方式、SLA、多租户和故障域讨论 GPU、网络或共享方案，结论不可复用。架构决策要保存选择、未选择原因和重新评估触发条件。

失败假设至少要说明允许丢失多少进度、是否能重试、故障是否跨租户传播，以及底层指标是否可见。这样才能判断应选择独占节点、MIG、时间切片、虚拟化或更强的多副本隔离。

## 第 12 章 · AI Factory 的生产系统视角

### AI Factory 持续把数据转换为可用模型和服务

AI Factory 不是一套固定产品，而是一条反复运行的价值流：数据进入，经过治理、训练、评估和优化，成为模型/Engine，再通过在线或批量推理产生结果和反馈。

```mermaid
flowchart LR
    A[Data Sources] --> B[Ingestion and Governance]
    B --> C[Training and Evaluation]
    C --> D[Model Registry]
    D --> E[Optimization and Engine]
    E --> F[Inference Service]
    F --> G[Feedback and Monitoring]
    G --> B
```

GPU 基础设施位于训练和推理执行层，却同时被数据、制品、调度和反馈约束。只建设 GPU Cluster 而没有 Dataset/Registry/Release/Observability，无法形成可重复产出。

### 数据平面、控制平面和管理平面分工

| 平面 | 主要对象 | 典型组件 |
|---|---|---|
| Data Plane | Tensor、Dataset、Gradient、Token | GPU、NVLink、RDMA、Storage |
| Control Plane | Job、Pod、Queue、Device Claim | Kubernetes、Slurm、Scheduler |
| Management Plane | Inventory、Policy、Upgrade、Alert | Operator、DCGM、CMDB、IAM |
| Out-of-Band | 电源、Firmware、硬件维修 | BMC、Redfish、Switch 管理 |

数据面追求吞吐和低延迟；控制面追求一致分配；管理面追求安全、审计和生命周期。管理网络中断不应立即破坏已运行数据面，但会影响新作业、监控和恢复，这类降级需专门测试。

### 基础设施流水线也要版本化

节点 Image、Driver、Firmware、Operator、Network Config、Runtime 和 Benchmark 都作为代码/制品管理。变更从 Lab 到 Canary、节点池和全集群推进，每一阶段有自动验证和人工门禁。

```text
Source and Configuration
  -> Build and Scan
  -> Lab Validation
  -> Canary GPU Node
  -> Small Node Pool
  -> Production Rollout
  -> Observe and Rollback
```

## 第 13 章 · 计算、网络、存储与设施的耦合

### 计算节点设计不能从 GPU 数量单独开始

GPU 需要 CPU 准备输入、Memory 缓存、PCIe/NVLink 传输、NIC 通信、NVMe 缓存和 Power/Cooling。任何配套低于工作负载供给，理论 GPU FLOPS 都无法转成业务吞吐。

节点规格评审顺序：工作负载显存/计算；GPU 数和形态；CPU Core/Memory Channel；PCIe Lane/NUMA；GPU-NIC；Local Storage；Power/Cooling；Serviceability。

### Scale-Up 和 Scale-Out 的分界由通信频率决定

Tensor Parallel 等高频细粒度通信优先留在 NVLink/NVSwitch Scale-Up Domain；Data Parallel 可跨 RDMA Scale-Out。模型放置先确定并行 Group，再映射 Node/Rack，而不是随机拿到 GPU 后让 NCCL 自行补救。

边界不是固定的产品标签，而是由通信占比和消息模式决定。应在目标 Batch、Sequence Length 和并行度下测量节点内与跨节点的 Step Time、Collective 时间和有效吞吐，再把结果写入调度约束；硬件升级或模型结构变化后需要重新测量。

### 存储吞吐不足表现为 GPU 空洞而非存储报错

Storage 可用但慢时，DataLoader 等待，GPU 呈锯齿 Idle。训练通常不产生 I/O Error，因此监控要把 Dataset Read/Checkpoint 与 Step 对齐。扩 GPU 数会增大并发读，使瓶颈更严重。

应分别测量冷缓存和热缓存、顺序与随机读取、单 Rank 与全 Job 的吞吐，并记录 DataLoader Queue、Host CPU 和 pinned buffer 使用。若增加 Worker 只让共享存储 P99 变差，应先限流或增加节点缓存，而不是继续扩 GPU。

### 设施限制会通过 Clock 影响软件性能

供电不足导致 Power Limit，散热不足导致 Thermal Throttle，最终表现为模型吞吐下降。软件团队看到的是 Clock/Step 变化，根因可能在 PDU、风道或液冷。跨团队指标要能关联 Rack/Power Zone。

诊断应把 GPU Power、Temperature、SM Clock、Throttle Reason 与机架电力和冷却事件按时间对齐。恢复后要重新运行同一工作负载基线，确认时钟、Step Time 和有效吞吐回到原范围；仅确认温度告警消失不足以证明性能恢复。

## 第 14 章 · 裸机、虚拟机、Kubernetes 与 Slurm

### 裸机提供最直接硬件控制

裸机适合完整节点大训练、低层 Benchmark 和特殊 Driver/Fabric 管理，性能边界清晰，但用户隔离、环境复现和资源回收需要额外系统。裸机不等于无调度，可以由 Slurm/Provisioning 管理。

裸机的运维责任也更集中：内核、驱动、Firmware、GPU 健康和作业环境通常由平台共同维护。验收应记录节点基线和作业资源归属，否则用户为了修复单个环境修改系统，会把可复现性和其他作业一起破坏。

### 虚拟机强调租户和 OS 隔离

PCI Passthrough 提供 VM 独占，vGPU 提供 Profile 化共享；NVSwitch 系统还涉及 Fabric 虚拟化。VM 适合需要独立 Kernel/安全域的团队，但拓扑、Live Migration 和 Driver 支持受限。

选择 Passthrough、vGPU 或其他虚拟化形态时，要同时验证显存配额、设备可见性、性能抖动、迁移限制和故障归属。宿主机能看到物理 GPU 不代表来宾 OS 能看到正确 UUID，也不代表多卡通信路径和物理机一致。

### Kubernetes 强在服务和声明式设备交付

Kubernetes 适合推理服务、容器化训练和多租户平台，Operator 管软件栈、Scheduler/Queue 管资源。默认整数 GPU 调度不理解完整 Fabric，需要拓扑与批调度扩展。

平台验收应从 Node Capacity、Device Plugin 分配、容器内设备注入一路验证到 Framework CUDA Test，并把 Pod UID 与 GPU UUID 关联。训练 Job 还需要 Gang 调度、拓扑约束、优先级和 Checkpoint 处理，不能只验证一个短命 Pod 能启动。

### Slurm 强在 HPC 作业和整组资源调度

Slurm 以 Partition、Account、GRES/TRES 和 Job 为主，适合批处理、多节点训练和整节点拓扑。容器可通过 Enroot/Pyxis 等集成。运维边界与 Kubernetes 不同，不应只比较 UI 或 YAML。

Slurm 的作业证据通常围绕 Job ID、Step、Partition、Account 和分配节点展开。排查 Pending、资源不足或作业被终止时，应同时查看 GRES/TRES、拓扑约束、Walltime、Preemption 和节点健康，而不是只看应用日志。

### 混合平台共享硬件事实和制品

同一组织可能 Kubernetes 服务推理、Slurm 运行训练。两者共享 GPU Inventory、Driver Branch、Container Registry、Dataset/Model、DCGM 和 Benchmark；资源账本和权限必须避免重复分配同一节点。

共享信息应有明确的唯一身份和所有者：Inventory 以 GPU UUID、MIG UUID、节点和故障域为键，制品以 Image Digest、Model/Engine Revision 为键。平台升级前要确认两个调度面都能消费同一兼容矩阵，并设置节点池隔离，避免一方的驱动变更破坏另一方作业。

## 第 15 章 · 云、边缘与本地部署边界

### 云 GPU 把采购周期转换为配额与供应风险

云按量便于试验和突发，但 GPU Instance 配额、区域库存、网络拓扑可见性、数据传输和长期价格成为约束。实例型号名称不能替代实际 GPU/互连和本地 NVMe 规格。

云上容量计划要把“申请到实例”和“拿到可用性能”分开验证：检查实际 GPU 型号、互连、NUMA、网络带宽、存储路径和配额恢复时间。跨区域或跨云迁移还应把数据复制、镜像分发和合规审计纳入总成本。

### 托管训练降低控制面运维但限制底层诊断

托管服务提供 Job、分布式启动、日志和模型集成，用户可能无法访问 Host Driver、Switch Counter 或完整拓扑。SLA 和支持接口必须覆盖这些不可见层，Benchmark 以服务实际能力为准。

提交工单时应提供 Job ID、镜像或 Engine 版本、并行规模、开始时间、最后成功 Step 和可见的运行指标，并明确托管方能提供哪些主机、网络和存储证据。用户侧无法执行的 `nvidia-smi topo` 或交换机计数器，不能被假设为已验证。

### 边缘推理更关注功耗、空间和离线恢复

边缘设备受 Power、Cooling、Network 和现场维护限制，模型量化、Engine 固化和本地 Buffer 更重要。监控需支持断网缓存，升级可回滚，不能依赖数据中心实时人工处理。

边缘验收要覆盖断网、掉电、存储满、温度降频和远程升级中断等场景。设备应能在本地保留必要指标与模型版本，在连接恢复后补传；回滚包和健康探针必须不依赖同一条可能已经中断的管理链路。

### 混合云的数据重力决定迁移成本

Dataset/Checkpoint/Model 很大时，跨云传输时间和费用可能高于计算。架构评审计算数据首迁、每日增量、Checkpoint 回传和合规；优先让计算靠近数据或建立受控 Cache。

迁移方案还要验证目标云的 GPU、互连、Runtime 和存储语义是否能重现基线。Cache 需要定义版本、失效、加密和回源限流，否则第一次故障或冷启动会把隐藏的跨云带宽成本重新暴露出来。

## 第 16 章 · 角色、权限与日常协作

### 平台团队负责资源交付链而非模型正确性

平台保证节点、Driver、Runtime、调度、监控和恢复；应用团队保证模型、数据、Kernel/Framework 使用与数值；网络/存储/设施负责各自 Fabric。接口用 SLI、版本和证据定义。

边界应落到可执行的交付契约：平台发布支持的 GPU Class、镜像/驱动 Bundle、拓扑和 SLI；应用提交资源画像、并行参数、Checkpoint 和故障联系人；跨团队故障用同一 Job、Node、GPU UUID 和时间窗口关联。这样既避免平台替用户调模型，也避免应用无法判断平台是否达标。

### On-Call 需要跨层升级路径

一线识别影响并保存证据；GPU 平台判断设备/软件；网络或设施处理对应路径；硬件厂商接收标准 Support Bundle。联系人、权限和响应时间进入 Runbook。

升级条件应按影响范围和首错定义：单 Pod CUDA 错误先由应用或平台处理，重复 XID、ECC 或 Fabric 错误升级节点和硬件，跨节点丢包或拥塞升级网络，温度和功耗异常升级设施。每次升级都携带已排除项和下一步只读检查，避免不同团队重复重启设备。

### 用户自助信息减少无效工单

门户展示可用 GPU Class、队列、配额、镜像、资源模板、作业最终设备、基础指标和故障状态。用户能区分 Pending、OOM 和平台故障，平台仍保留敏感硬件与租户隔离信息。

自助页面应显示信息的时间戳和状态来源，例如调度器 Pending Reason、Pod UID、GPU UUID、Checkpoint 最近成功时间和健康模板版本。对租户隐藏序列号或其他敏感字段，但不能隐藏判断作业是否拿到正确设备所需的拓扑和资源信息。

### 变更评审按故障域限制批次

Driver、Firmware、Network 和 Cooling 变更不在同一批覆盖所有 Rack。Canary 跨代表 SKU，但每次只改变主要变量；设置最大不可用 GPU 和业务停止条件。

变更单应列出受影响节点、Job 类型、回滚动作、观测窗口和停止阈值。Canary 通过不等于全集群安全；至少要在不同 GPU SKU、网络路径和工作负载模板上验证启动成功率、通信基准、有效吞吐与恢复时间。

## 第 17 章 · GPU 平台术语关系表

### 计算与执行术语

| 术语 | 所在层 | 一句话边界 |
|---|---|---|
| Thread/Warp/Block/Grid | CUDA 执行模型 | 工作如何组织与调度 |
| SM | GPU 执行资源 | Warp 调度和多类执行单元 |
| CUDA Core | 通用算术路径 | 不等于全部 AI 性能 |
| Tensor Core | 矩阵专用路径 | 依赖精度、Shape 和 Library |
| Occupancy | SM 驻留比例 | 隐藏延迟手段而非最终 KPI |

### 内存与互连术语

| 术语 | 范围 | 一句话边界 |
|---|---|---|
| HBM | 单 GPU 本地显存 | 容量与带宽分别约束 |
| PCIe | 通用设备总线 | 连接 CPU、GPU、NIC |
| NVLink | 高速设备链路 | 可连接 GPU/Switch/CPU |
| NVSwitch | 节点内交换 Fabric | 不是以太网交换机 |
| RDMA | 网络直接内存访问 | 绕过传统 CPU 拷贝路径 |
| GPUDirect RDMA | GPU Memory 到 HCA | 依赖拓扑和驱动链 |

### 平台与共享术语

| 术语 | 主要边界 |
|---|---|
| Device Plugin | 把设备注册/分配给 Kubelet |
| GPU Operator | 管理 GPU 软件 Operand 生命周期 |
| MIG | 支持硬件分区的 GPU 实例 |
| Time-Slicing | 多进程时间复用但弱隔离 |
| MPS | CUDA 多进程执行共享 |
| HAMi | Kubernetes 软件共享和调度 |
| vGPU | Hypervisor/VM GPU 虚拟化 |

### 观测与验收术语

| 术语 | 回答的问题 |
|---|---|
| NVML | 单机管理接口有哪些状态 |
| DCGM | 数据中心 GPU 如何监控诊断 |
| DCGM Exporter | 如何给 Prometheus 暴露 Field |
| Microbenchmark | 某条硬件路径是否正常 |
| Workload Benchmark | 最终模型是否满足目标 |
| Burn-in | 持续压力下是否稳定 |
| Acceptance | 系统能力和证据是否达到合同/设计 |

## 第 18 章 · 工作负载评审的标准问题集

### 业务产出和时间边界是什么

训练问目标 Token/Sample、完成日期、实验并发和可中断性；推理问请求率、长度分布、TTFT/TPOT/P99 和区域。没有业务时间边界，GPU 数量只有技术下限，没有容量结论。

评审还要明确峰值发生时间、允许的排队时间和失败后的重算上限。没有这些约束，无法判断应采购更多 GPU、提高并发、降低精度，还是优先改善数据和网络路径。

### 模型和精度边界是什么

参数量、Layer/Hidden/Attention、Precision/Quantization、Framework/Engine、Compute Capability 和质量容差。模型名称不替代实际 Revision 和运行配置。

同一模型在 Context Length、Batch、序列长度分布和量化策略变化时，显存与通信曲线可能完全不同。资源画像应绑定具体 Revision、Tokenizer、Engine 和精度，并记录质量指标允许的误差范围。

### 显存峰值由哪些对象组成

权重、Gradient/Optimizer、Activation、KV Cache、Workspace、Communication、Allocator 和共享邻居。记录峰值阶段与失败申请，不只模型加载后快照。

训练峰值常出现在 Forward/Backward 或参数临时聚合，推理峰值常受最长请求和并发 KV Cache 影响。容量验收要保留峰值发生的 Step、Shape、Rank 和分配失败信息，并给碎片和运行时缓冲留出余量。

### 并行组如何映射拓扑

TP/PP/DP/EP 大小、每节点 GPU、NVLink Group、HCA/Rail 和跨机架边界。调度资源 Shape 与 Launcher Rank Map 一致。

映射发布后应能从作业日志反查到 GPU UUID、PCI BDF、NUMA、HCA 和故障域。若调度分配与 Launcher Rank Map 不一致，即使程序能启动，也不能把该次性能数据作为可比较基线。

### 数据从哪里来又写到哪里

Dataset/Model/Checkpoint/Output 的 Source of Truth、Working Set、Cache、并发、吞吐、保留和合规。冷启动和故障恢复路径单独说明。

### 软件由谁构建和升级

Driver/Kernel/Firmware、Runtime、Framework、Extension、Image/Engine 的 Owner、版本 Bundle、Canary、回滚和 EOL。禁止“由使用方自行处理”形成无主兼容矩阵。

### 资源如何申请、等待和释放

Kubernetes/Slurm、Queue/Quota/Priority、Gang、Topology、Walltime、Checkpoint Signal 和异常退出。用户能看到 Pending 原因和最终设备。

### 多租户需要什么隔离

信任域、显存/算力、性能 SLO、故障传播、数据/侧信道。Full/MIG/HAMi/Time-Slicing/vGPU/Passthrough 按要求选择，不以利用率单目标决定。

### 什么故障必须立即停止

Uncorrectable ECC/Fatal XID/Fabric/数据风险、过热/供电、模型质量错误和安全事件。定义自动 Cordon、人工批准和安全 Checkpoint 边界。

### 恢复到什么程度才算完成

错误消失之外，Health、Topology、Performance、Resource Registration、Workload 和观察窗口通过。Incident、Repair、Acceptance Run 互相链接。

### 如何衡量有效利用和成本

Queue、Allocated、Active、Useful、Failed/Recomputed、SLO Throughput 和 Energy/Cost per Useful Output。高 GPU Utilization 不自动等于平台有效。

### 规模或版本变化何时重新设计

模型放不下、并行跨新故障域、流量/队列超阈值、新 GPU/Driver/Runtime、共享安全等级变化和 EOL 都是 ADR Revisit Trigger。

## 第 19 章 · 从需求而不是 GPU 型号开始设计

### 训练、推理和批处理需要不同的需求问卷

GPU 项目的第一步不是选择 H100、H200 或其他型号，而是把 Workload 变成可测量需求。训练重视吞吐、扩展效率和 Checkpoint 恢复；在线推理重视并发、TTFT、Tokens/s 和 P95/P99；离线批处理重视完成时间和单位成本。

#### 基础需求表

| 维度 | 需要回答的问题 | 设计输出 |
| --- | --- | --- |
| Workload | Training、Fine-Tuning、Inference、Batch 各占多少 | 节点池和调度策略 |
| Model | 参数量、层数、精度、Context、并行策略 | 显存和 GPU 数 |
| Concurrency | 并发 Job、请求率、Batch、峰谷 | 集群规模和 Queue |
| Data | Dataset、单样本大小、读取模式 | 存储容量和吞吐 |
| Checkpoint | 大小、频率、保存数、恢复时间 | 写带宽和保留策略 |
| SLA | 吞吐、P95/P99、Deadline | 冗余、扩缩和隔离 |
| Availability | 节点/机架故障能否中断 | 故障域和恢复机制 |
| Multi-Tenant | 团队、配额、隔离、计费 | 共享方案和审计 |

#### 需求必须区分平均值和峰值

平均请求率不能替代突发流量，平均 Context 不能替代最大 Context，平均显存不能替代训练峰值。每个容量输入至少标注 Average、P95、Peak 和增长预测，并说明数据来源和观察窗口。

### 模型并行策略会改变基础设施需求

Data Parallel 复制模型并同步梯度，主要增加 AllReduce；Tensor Parallel 在层内拆分矩阵，要求高频低延迟通信，通常更依赖节点内 NVLink/NVSwitch；Pipeline Parallel 在层间传递激活，受 Stage 平衡和 P2P 延迟影响；参数/优化器分片降低单卡显存，但增加 AllGather/ReduceScatter。

#### 设计时记录并行策略的通信画像

- 每个 Job 的 Rank 和节点数；
- 节点内和节点间通信比例；
- Collective 类型和消息范围；
- 每 Step 计算、通信和等待时间；
- 对 NVLink/NVSwitch、HCA 和网络 Oversubscription 的要求；
- 单 Rank 失败后的恢复方式。

如果并行策略尚未确定，应先用代表性模型做小规模实验，而不是用 GPU 理论峰值直接推算大集群。

## 第 20 章 · 显存和 GPU 数量估算

### 模型权重只是训练显存的一部分

模型权重的粗略容量为：

```text
权重字节 ≈ 参数量 × 每参数字节数
```

FP32 约 4 字节，FP16/BF16 约 2 字节，FP8/INT8 约 1 字节，但实际文件和运行时还可能包含 Scale、Metadata、Padding 和不同精度副本。

#### 训练显存构成

```text
模型权重
+ 梯度
+ 优化器状态
+ Master Weight 或低精度辅助状态
+ 中间激活
+ 通信 Buffer 和 Workspace
+ Framework Cache 与碎片
```

不同 Optimizer、混合精度、Activation Checkpointing、ZeRO/FSDP 和并行策略会显著改变每参数字节数。粗略公式只能用于初筛，最终必须用目标 Framework、最大 Shape 和稳定训练压测确认峰值。

#### 安全余量不是把显存填到 100%

容量规划应为输入波动、Allocator 碎片、通信 Workspace、库版本变化和故障恢复保留空间。余量应来自历史峰值和压测，而不是固定套用一个百分比。生产准入可以把“达到安全水位后拒绝扩大 Batch”写入策略。

### 推理显存要包含 KV Cache 和并发模型实例

LLM 推理的主要显存包括权重、KV Cache、输入输出 Tensor、Runtime Workspace 和模型实例。KV Cache 随 Batch、Context、生成长度、层数和 KV Head 结构增长。

标准多头注意力的粗略直觉为：

```text
KV Cache ≈ 2 × Layer × Token × Batch × KV Width × 每元素字节
```

其中 `2` 表示 Key 与 Value。GQA/MQA 会降低 KV Width，Paged KV Cache 和量化会改变实际占用。必须以实际 Serving Engine 指标验证，不能把公式直接当作资源 Limit。

#### 推理容量同时受显存和 SLA 限制

即使显存还能放下更多请求，Queue Time、TTFT 或 P99 可能已经超过 SLA。压测应逐步提高并发，记录 Batch、KV Cache、Tokens/s、TTFT、TPOT、P95/P99 和错误率，以第一个达到容量或 SLA 边界的条件作为单实例上限。

### GPU 数量由单卡基线、并行需求和冗余共同决定

在线推理可从目标吞吐除以单 GPU 安全吞吐得到基础副本数，再加入峰值、故障、升级和扩缩缓冲。训练则先确定单 Job 为满足显存/Deadline 所需 GPU 数，再乘并发 Job，并考虑 Queue SLO 和节点维护容量。

```text
推理基础副本 ≈ 峰值请求吞吐 / 单副本安全吞吐

训练基础 GPU ≈ 单 Job GPU 数 × 目标并发 Job 数
```

结果还要向节点规格和拓扑组取整。例如每个 Job 需要 8 张 NVSwitch 域内 GPU，就不能按集群零散空闲卡求和。N+1 冗余也应按可替代故障域，而不是简单多买一张卡。

#### 冗余要区分故障、维护和突发

故障冗余用于节点/机架异常，维护冗余用于滚动升级和 Driver 变更，突发余量用于业务峰值或实验集中提交。三者可能部分共享，但不能把所有余量同时承诺给不同目的。

#### Queue SLO 决定是否为训练预留容量

如果训练允许等待数小时，可以提高集群利用率并依赖 Queue；如果实验要求 10 分钟内启动，就需要预留完整 GPU Group 或允许抢占。容量规划应同时给出利用率目标和 Queue Time 目标。

## 第 21 章 · GPU 节点容量和拓扑设计

### CPU、主机内存和 NUMA 要匹配 GPU 数据供给

CPU 负责数据解码、预处理、调度、网络中断和部分 Framework 工作。每 GPU 所需 CPU Core 取决于 Dataset Format、解码、DataLoader Worker、推理前后处理和存储协议。CPU 不足会让 GPU 空转，CPU 过多但跨 NUMA 也会浪费成本。

#### 节点设计检查项

- 每个 GPU 对应多少本地 CPU Core 和 Memory Channel；
- Pinned Memory、Page Cache 和 Dataset Cache 需要多少主机内存；
- GPU、NIC、NVMe 分别挂在哪个 NUMA/PCIe Root；
- CPU Manager/绑核是否能提供与设备对齐的 Core；
- 双路 CPU 间互连是否成为跨 Socket 热点。

### PCIe Lane、NVLink 和 NVSwitch 决定节点内扩展能力

节点 BOM 应画出真实 PCIe 树，而不是只列设备数量。GPU x16、HCA x16、NVMe 和其他设备会竞争 Root Complex Lane 和 Switch 上行带宽；Riser 或插槽可能降低实际 Link Width。

NVLink/NVSwitch 适合高频节点内通信，但增加功耗、散热和整机成本。选择 PCIe GPU 服务器还是 SXM/HGX，应结合模型并行、单 Job GPU 数、扩展效率和维护能力，而不是只比较单卡价格。

#### 设计输出需要包含可调度 GPU Group

把每组 GPU 的 NVLink/NVSwitch、共同 CPU/NUMA 和邻近 HCA 明确为调度单元。节点有 8 张 GPU 不代表任意 4 张都适合一个 4 卡 Job；拓扑组信息要进入标签、调度插件或平台资源账本。

### NIC 数量和带宽要覆盖每 GPU 的通信需求

网络容量不仅看端口线速，还要看 GPU-NIC Ratio、PCIe 位置、Rail、交换机 Oversubscription、Collective 模式和并发 Job。多 HCA 节点应让每组 GPU 使用邻近 NIC，并验证 NCCL 能正确选择多 Rail。

#### 从通信时间预算反推网络

如果目标 Step Time 为 `T`，允许通信占比为 `r`，则通信阶段时间预算约为 `T × r`。结合每 Step 需要交换的数据量，可得到最低有效带宽需求。该需求还应加入协议、Collective、并发和拥塞损耗，不能用端口线速直接代替有效带宽。

## 第 22 章 · 存储、功耗和机架设计

### Dataset 和 Checkpoint 形成不同 I/O 模式

Dataset 常见持续读取、小文件、随机采样和多 Worker 并发；Checkpoint 是周期性大文件突发写入，并在恢复时集中读取。Model Registry 则需要版本、Metadata、权限和发布一致性。三类路径可以共享底层系统，但容量和 SLO 要分别评估。

#### 存储容量估算

```text
Dataset 容量 = 原始数据 + 清洗版本 + 索引/缓存 + 增长余量
Checkpoint 容量 = 单份大小 × 保留份数 × 并发 Job × 副本/版本
Model 容量 = 权重/Engine/Tokenizer/配置 × 版本和架构组合
```

Checkpoint 保留策略还要区分本地快速恢复、共享存储容灾和长期归档。只把 Checkpoint 写到节点 Local NVMe，节点故障后可能无法恢复。

### 本地 NVMe 和共享存储承担不同角色

Local NVMe 适合 Dataset Cache、Shuffle 和临时 Checkpoint，延迟低但随节点故障丢失；共享文件/对象存储适合源数据、持久 Checkpoint 和模型制品，但可能受 Metadata、并发和网络限制。

验收需要使用真实文件大小、并发 Worker 和读写比例。单流 `dd` 或顺序写峰值不能证明大量小文件训练和并发 Checkpoint 满足要求。

#### Cache 命中率影响共享存储回源容量

Local NVMe Cache 可以减少重复读取，但首次训练、Cache Eviction 和节点替换仍会回源。共享存储要能承受 Cold Start 或有预热流程；容量模型不能假设永远 100% 命中。

#### Checkpoint 写入不能阻塞所有训练 Rank

同步 Checkpoint 可能让全部 GPU 等待最慢存储写入。可以评估异步写、分片 Checkpoint、本地暂存再上传，但要验证一致性和节点故障时的数据完整性。

### Power、Cooling 和 Rack Density 是硬约束

GPU TDP 只是节点功耗的一部分，还包括 CPU、Memory、NIC、NVMe、风扇、DPU 和电源损耗。机架设计要考虑峰值功率、冗余策略、支路容量、PDU、线缆和故障转移后的负载。

#### 热设计影响持续性能

高密度 GPU 节点可能需要液冷。设计需记录冷却能力、进出水/风温、流量、压差、漏液监控和维护旁路。验收要在持续满载下观察温度、Clock 和 Thermal Throttle，而不是只看开机空闲温度。

#### Rack Density 同时改变网络和故障域

一个机架放置更多 GPU 可以减少跨机架通信，但提高电力、散热和单机架故障影响。训练 Job、推理副本、交换机和存储路径应根据故障域分布，避免一次 PDU 或 Top-of-Rack 故障清空全部关键容量。

## 第 23 章 · 平台形态和公共能力选型

### Bare Metal、VM、Kubernetes 和 Slurm 服务不同边界

| 平台 | 优势 | 主要成本 | 适用场景 |
| --- | --- | --- | --- |
| Bare Metal | 性能和拓扑最直接 | 租户、发布和调度需自建 | 专用训练、基准环境 |
| VM | OS/租户隔离、传统 IaaS | vGPU/Passthrough 和版本复杂 | 企业多租户、虚拟桌面 |
| Kubernetes | 声明式交付、服务生态 | GPU 调度和长作业需扩展 | 推理、平台化训练 |
| Slurm | HPC Queue、Gang 和批作业成熟 | 服务化和云原生集成需设计 | 大规模训练和科研作业 |

真实平台可以组合，例如 Kubernetes 承载推理、Slurm 承载大训练，或者 Kubernetes 通过 Kueue/Volcano 管理 Batch。组合会增加身份、配额、镜像、存储和监控的一致性成本。

#### 选型问题比产品功能表更重要

- 作业是服务还是批处理，生命周期由谁管理；
- 是否需要 VM 级租户隔离和自定义 Kernel；
- Gang、Queue、Fair Share 和 Preemption 是否为核心需求；
- 用户是否需要 Kubernetes API、Slurm CLI 或两者；
- GPU、CPU、NIC、Storage 的拓扑调度由谁实现；
- 控制面故障时运行中作业是否继续；
- 团队具备哪种平台的 7×24 运维能力。

#### 混合平台需要统一资源事实

同一物理 GPU 不能同时被 Kubernetes 和 Slurm 独立分配。节点应归属单一 Scheduler，跨平台通过节点池切换或上层 Capacity Manager 协调。资产、监控、身份和成本可以统一，但分配权必须唯一。

### GPU Operator、HAMi、Scheduler 和 Queue 属于不同层

GPU Operator 管理节点 Driver/Toolkit/Device Plugin/DCGM；HAMi 管理软件共享资源和调度账本；Scheduler 选择节点和设备；Queue 管理 Admission、优先级和配额。一个组件不能替代其他层。

#### 平台控制面检查表

- 资源发现和健康状态由谁维护；
- GPU/MIG/HAMi 资源如何命名和配额；
- Queue、Priority、Preemption 和 Gang 谁负责；
- 节点维护时如何暂停 Admission 和恢复 Job；
- 多集群、Slurm/Kubernetes 之间如何统一身份和成本；
- 控制面不可用时现有作业是否继续运行。

### Registry、Model、Monitoring、Logging 和 Audit 是公共能力

生产 GPU 平台至少需要镜像 Registry、Dataset/Checkpoint Storage、Model Registry、Secret、Prometheus/DCGM、Grafana、日志、审计、告警和工单/Runbook。它们要通过统一的 Project、Namespace、Job、Node 和 GPU UUID 关联。

镜像和模型发布应固定 Digest/Version，训练数据和 Checkpoint 有生命周期，GPU 分配和管理操作进入审计。没有这些能力，平台无法回答“谁在什么时候用哪张 GPU 运行了哪个模型，以及故障后如何恢复”。

#### Registry 和 Model Registry 解决不同对象

Container Registry 保存可执行环境，Model Registry 保存模型版本、指标、Stage、签名和部署关系。一个模型版本应关联训练代码/镜像、Dataset、超参数、Checkpoint 和推理 Engine，才能从线上输出追溯回训练来源。

#### Logging 和 Audit 需要独立保留策略

应用日志、NCCL/Driver 故障日志、Kubernetes Event 和管理操作审计有不同敏感性与保留期。XID/SXid、节点维护和资源分配记录应跨 Pod 生命周期保留；训练数据和 Prompt/Output 日志还需遵守隐私策略。

### Upgrade 和 Rollback 要以节点池为发布单元

Driver、Firmware、CUDA、Framework、Operator 和 Runtime 不应在所有节点同时原地升级。建立 Canary Node Pool，运行兼容、性能、监控和恢复测试，再逐批 Drain/升级。保留上一版镜像、Driver 包、Kernel 和配置。

回滚条件需要预先定义，例如设备注册失败、NCCL 下降超过阈值、模型数值异常、告警丢失或 Job Failure 上升。没有回滚阈值的灰度只是在延迟发现问题。

节点池发布前冻结硬件、驱动、容器和拓扑基线，Canary 通过后再按故障域逐批 Drain。每批都执行设备发现、单卡 Smoke、节点内 P2P、跨节点 NCCL、代表性 Framework 和 Checkpoint Restore；保留旧版本包与配置，确保回滚不依赖外部下载。运行中长作业的处理方式也要明确，是等待完成、迁移还是先保存后重启。

## 第 24 章 · 硬件、互连和网络验收

### GPU Inventory 和单卡测试确认资产与基础健康

Inventory 记录 Node、GPU UUID、Serial、PCI BDF、型号、显存、Compute Capability、Driver、Firmware、功耗限制和保修资产。数量和身份应与采购/BMC/操作系统一致。

单卡验收至少包含 CUDA Smoke Test、计算、显存容量/带宽、温度、功耗、Clock、ECC、XID 和持续 Burn-in。结果与同型号健康分布比较，并保留原始日志。

#### Burn-in 的通过标准

- 目标持续时间内无 XID、Uncorrectable ECC 和设备掉线；
- 温度、功耗和时钟在设计范围；
- 计算和显存结果无错误；
- 吞吐不低于同配置基线阈值；
- 测试结束后 DCGM Health/Diagnostic 通过。

### PCIe、NVLink 和 NVSwitch 验收节点内路径

保存 `lspci -tv`、PCIe Speed/Width、`nvidia-smi topo -m`、P2P Matrix、NVLink Status/Error Counter 和 Fabric State。使用 P2P Bandwidth/Latency 与单节点 NCCL 验证每个 GPU Group。

通过标准应按平台代际和拓扑制定，不能要求 `SYS` 路径达到 NVLink 性能。任何降级 Link、错误增长或 Fabric 未就绪都要在接收多卡作业前处理。

#### 验收命令集合

```bash
lspci -tv
lspci -s <BDF> -vv | rg -i 'LnkCap|LnkSta|AER'
nvidia-smi topo -m
nvidia-smi topo -p2p r
nvidia-smi nvlink --status
nvidia-smi nvlink --errorcounters
nvidia-smi -q | sed -n '/Fabric/,+30p'
```

命令输出与 Node、GPU UUID、时间一起归档。运行压力测试前后分别采集 Error Counter，才能判断测试是否触发新错误。

### RDMA 和多节点 NCCL 验收 Scale-out

先验证 NIC/Firmware/Port/GID/MTU/PFC/ECN，再运行 Host Memory Perftest、GPU Buffer/GDR 和 NCCL Tests。测试组合覆盖同机架、跨机架、每个 Rail、并发流和目标消息范围。

验收记录包括 Bandwidth、Latency、Bus Bandwidth、错误 Counter 增量、PFC Pause、ECN、Drop 和测试拓扑。峰值通过但长时间出现抖动或错误增长，不能视为验收通过。

#### 分层测试矩阵

| 层 | 示例测试 | 证明什么 |
| --- | --- | --- |
| Link/IP | `ip`、`ethtool`、MTU | 接口和基础网络 |
| RDMA Host | `ib_write_bw`、`ib_read_bw`、`ib_send_lat` | HCA/Fabric/RDMA |
| GDR | GPU Buffer Perftest | GPU-NIC 直接路径 |
| Collective | `nccl-tests` | GPU/Topology/Network 组合 |
| Workload | 真实训练 | 框架和数据路径 |

上一层失败时不要继续用更复杂层掩盖。上一层通过也不表示下一层一定通过，但能显著缩小故障范围。

## 第 25 章 · 存储、平台和恢复验收

### Storage Throughput 要用真实 Dataset 和 Checkpoint 模式测试

分别测试大文件顺序读写、小文件 Metadata、并发 DataLoader、Dataset Cache Warm/Cold、多个 Job 同时写 Checkpoint 和故障恢复读取。记录客户端 CPU、网络、存储延迟和 GPU Idle，确认存储不是隐藏瓶颈。

通过标准应连接到业务：DataLoader 不使 GPU 产生不可接受空洞，Checkpoint 在指定窗口完成，节点故障后能从共享副本在 RTO 内恢复。

### Kubernetes GPU Scheduling 验收完整设备交付链

测试 Driver、Toolkit、Device Plugin、GFD、GPU Operator、RuntimeClass/CDI、Taint/Affinity、ResourceQuota、Pod 分配和 GPU UUID 映射。覆盖正常分配、资源耗尽 Pending、节点 Cordon/Drain 和 Operator Operand 恢复。

不能只运行一个 `nvidia-smi` Pod。还要运行 CUDA Kernel、Framework、MIG/Profile、Topology 对齐和多卡 Job，并确认 Prometheus 指标能关联 Pod/Job。

#### 正向和负向用例都要覆盖

正向验证正确型号、Profile、Runtime 和 Topology 能调度；负向验证无 Toleration、Quota 超限、错误 Profile、资源耗尽和 Node Cordon 时 Pod 保持 Pending 且 Event 清晰。平台不仅要成功，也要以可解释方式拒绝错误请求。

#### 资源释放要在异常退出后验证

强制删除 Pod、Container Crash、Node Reboot 和 Device Plugin Restart 后，GPU Allocation、MIG/HAMi 账本和进程必须最终一致。资源泄漏会让 Allocatable 看似充足但新 Pod 无法启动。

### HAMi GPU Sharing 验收限制和租户干扰

至少使用两个竞争 Pod 验证显存限制、算力比例、调度账本、容器可见性、OOM 边界、性能干扰、监控归属和 Pod 删除后的资源回收。再测试 Scheduler/Device Plugin/HAMi-Core 任一组件重启后的行为。

限制可绕过、一个租户可导致无关租户失败、资源未回收或指标归属错误，都不应进入多租户生产。

验收报告应把“请求的资源”和“实际可用的资源”分开记录。除显存和算力配额外，还要观察长 Kernel、Copy Engine、PCIe、功耗和温度等共享维度；HAMi 的账本正确并不等于这些维度已经隔离。用固定输入在空闲邻居、单竞争邻居和多个竞争邻居三种条件下重复测试，比较 P50/P99 延迟、OOM、GPU 时间和错误率。

资源回收测试要覆盖正常退出、强制删除、容器崩溃和节点重启。检查 Device Plugin 上报的 Allocatable、HAMi-Core 状态、Pod Event 与 GPU 进程是否最终收敛；若组件重启后出现账本和实际进程不一致，应将节点置为不可调度并建立人工恢复步骤，而不是继续接收租户。

### Monitoring、Alert 和 Audit 要进行故障注入验收

使用安全、可恢复的方式模拟 Exporter 停止、GPU Pod Pending、设备插件失败、温度/功耗阈值测试环境、网络端口错误或 Node NotReady，确认指标、告警、通知、Runbook 和审计链路。

每条告警验证触发时间、标签、Owner、抑制、自动动作和恢复关闭条件。只验证 Prometheus Target Up 不能证明平台具备故障响应能力。

故障注入记录应形成一条可追溯链：注入时间、首个异常指标、告警触发、通知接收、值班确认、处置动作、恢复指标和审计事件。对 Exporter 短暂中断，应验证“数据缺失”与“GPU 健康”不会被混为一谈；对 Node NotReady 或设备插件失败，应确认调度器停止发放新资源，并保留原始 Event 和控制器日志。

验收还要检查告警降级和静默边界。通知系统不可用时是否有备用通道，重复 XID 是否聚合，维护窗口是否只抑制预期告警而不抑制安全或租户隔离告警，都应写入 Runbook 和审计结果。

### Node Failure 和 Checkpoint Recovery 验收长期运营能力

选择允许故障注入的测试 Job，在有 Checkpoint 的状态下模拟 Worker/Node 退出，验证 Queue/Controller 识别失败、释放 GPU、重新调度、读取 Checkpoint 和恢复训练。记录 RPO、RTO、重复计算和数据一致性。

同时测试节点修复后的 Cordon、硬件/DCGM/容器/NCCL 回归和 Uncordon。节点重新 Ready 不表示应自动接收训练任务，必须通过恢复门槛。

恢复验收应比较故障前最后一个 Durable Generation 与恢复后的第一个有效 Step，确认没有读取半成品或重复提交 Manifest。记录资源重新分配等待、Checkpoint 下载、模型加载、Warmup 和首个稳定 Step 的时间，并将 RPO、RTO 与业务目标逐项对照。恢复失败时保留原 Attempt 证据，避免控制器不断重试掩盖根因。

## 第 26 章 · 验收报告和交付边界

### 每个测试项都要有通过标准和原始证据

| 字段 | 内容 |
| --- | --- |
| Test ID | 稳定编号 |
| Scope | Node、GPU、Rack、Network、Cluster |
| Preconditions | 版本、拓扑、维护状态 |
| Command/Procedure | 可重复步骤 |
| Expected | 阈值和允许偏差 |
| Actual | 结果与样本分布 |
| Evidence | 日志、指标、截图或制品路径 |
| Owner | 执行与签字责任人 |
| Result | Pass、Fail、Conditional Pass |
| Follow-up | 缺陷、期限和复测 |

Conditional Pass 必须写明受限范围，例如某节点禁用多卡作业、某功能尚未开放多租户。不能把未完成项隐藏在会议纪要里。

#### 阈值来源需要可辩护

阈值可以来自厂商规格、同型号健康样本、采购承诺、应用 SLA 或容量模型。每个阈值标注来源、测试条件和允许偏差。用另一代 GPU 或不同消息大小的公开数字作为硬门槛，通常没有可比性。

#### 证据需要可重放

命令、脚本、配置、镜像 Digest、输入数据、环境变量和日志位置应进入版本控制或制品库。只有截图没有原始结果，后续升级无法自动回归，也难以判断单位和采样条件。

### 能运行 nvidia-smi 不等于集群验收完成

`nvidia-smi` 只证明某一时刻 Driver 可以查询 GPU。完整验收还要证明：单卡稳定、显存正确、PCIe/NVLink/NVSwitch 达标、RDMA/NCCL 可扩展、存储供给充足、Kubernetes/HAMi 正确交付、监控告警有效、节点故障可隔离、Checkpoint 能恢复、升级能回滚。

最终交付物应包含架构图、资产/版本矩阵、容量模型、拓扑基线、验收报告、Dashboard、告警、Runbook、升级/回滚和故障升级通讯录。只有这些内容共同存在，GPU 平台才具备进入长期运营的条件。

## 第 27 章 · 容量规划算例和决策记录

### 大模型训练项目先计算单 Job 边界再计算集群规模

假设项目给出参数量、精度、Optimizer、最大 Sequence、目标 Global Batch 和完成 Deadline。先在小规模环境确认单卡/单节点显存和吞吐，再选择 Data/Tensor/Pipeline/Shard 策略，得到每 Job 的 GPU 数、节点数和通信画像。

#### 算例流程

1. 用权重和训练状态粗算显存下限。
2. 用目标 Framework 实测最大 Micro Batch 和峰值显存。
3. 比较 1、2、4、8 卡吞吐和 Scaling Efficiency。
4. 扩到两节点验证 RDMA/NCCL 与 Step Time。
5. 根据 Deadline 选择单 Job GPU 数。
6. 根据并发实验和 Queue SLO 计算 Job 数。
7. 按完整节点/拓扑组取整并加入维护容量。

#### 记录不能省略的假设

Activation Checkpoint、ZeRO/FSDP、混合精度、Dataset 供给和 Checkpoint 周期都会改变结果。容量表应把这些写为可版本化假设；应用团队修改并行策略后需要重新评估，而不是继续沿用旧 GPU 数。

### 在线推理项目由延迟边界决定安全吞吐

先在目标 GPU/Engine/精度下，用输入和输出 Token 分布压测不同并发。找到 P95/P99、TTFT 或 TPOT 首次超过 SLA 前的最大吞吐，乘以安全系数作为单副本容量。

#### 副本估算示意

```text
基础副本 = ceil(峰值目标吞吐 / 单副本安全吞吐)
生产副本 = 基础副本 + 故障冗余 + 升级冗余
```

如果一个模型实例跨多 GPU，还要按 Tensor Parallel Group 取整。冗余应跨节点/机架分布，不能把所有备用 Capacity 放在同一故障域。

#### 弹性速度也是容量输入

GPU Pod 的镜像拉取、模型下载、Engine 加载和 Warmup 可能需要数分钟。突发流量快于扩容速度时，需要预热副本、预测扩容或请求排队/限流。只根据稳态吞吐计算副本会低估启动窗口。

### 多租户平台先定义服务等级再选择共享方式

| Workload Class | SLA | 推荐资源边界 | 调度重点 |
| --- | --- | --- | --- |
| Critical Training | Deadline/稳定吞吐 | Full GPU/完整 GPU Group | Gang、Checkpoint、低抢占 |
| Critical Inference | P99/可用性 | Full GPU 或验证过的 MIG | Spread、预热、滚动升级 |
| Standard Inference | 吞吐/成本 | MIG 或 HAMi | 配额、邻居干扰监控 |
| Batch/Notebook | 可重试/低成本 | HAMi、Time-Slicing、MPS | Queue、Preemption、Binpack |

共享方案不是全平台单选。可以按节点池提供不同服务等级，并把隔离、性能、价格、抢占和支持范围写进用户契约。

### 架构决策记录要保存选择和未选择原因

每个重要决定记录 Context、Decision、Alternatives、Consequences、Validation 和 Revisit Trigger。例如选择 RoCE 而不是 InfiniBand，不能只写“团队熟悉以太网”，还要记录交换机能力、PFC/ECN、运维工具、成本、验收和未来规模上限。

#### 需要记录的典型决策

- PCIe Server 与 SXM/HGX；
- InfiniBand 与 RoCE；
- Bare Metal、VM、Kubernetes、Slurm；
- Full GPU、MIG、HAMi、Time-Slicing；
- 本地 NVMe、并行文件、对象存储；
- Driver/Operator 发布方式；
- 单集群或多节点池/多集群；
- N+1 冗余、Checkpoint RPO/RTO 和故障域。

当模型规模、GPU 代际、集群规模或 SLA 超过 Revisit Trigger 时，重新评估 ADR，避免早期小规模假设永久固化。

### 验收缺陷必须映射到生产限制

例如跨机架 NCCL 未达标，就限制大训练只在单机架并标记容量上限；HAMi 隔离未完成，就禁止不可信多租户；Checkpoint Recovery 超过 RTO，就不能承诺对应可用性。缺陷不应只写“后续优化”，而应进入 Admission、调度、告警或发布策略。

正式上线前复核所有 Conditional Pass，确认限制已被平台技术控制，而不是依赖口头约定。缺陷关闭后重新执行关联测试，并更新容量模型和运行手册。

## 第 28 章 · 训练容量模型的输入和误差

### 参数量只是训练显存估算的起点

每参数存储取决于 Precision：FP32 约 4 Byte，FP16/BF16 约 2 Byte，FP8/INT8 约 1 Byte，但训练通常还保留更高精度 Master Weight、Gradient 和 Optimizer State。以 Adam 类优化器为例，单参数总状态可能远高于模型权重本身。

```text
Training Memory
  = Weights
  + Gradients
  + Optimizer States
  + Master Weights if used
  + Activations
  + Communication Buffers
  + Temporary Workspace
  + Allocator Reserve and Safety Margin
```

不能用“参数量乘 2 Byte”决定训练卡数。Activation 与 Batch、Sequence、Layer、Checkpointing 和 Kernel 实现相关，常是最大不确定项。

### Data Parallel、Tensor Parallel 和 Pipeline Parallel 改变不同资源

| 并行方式 | 主要拆分对象 | 主要通信 | 关键约束 |
|---|---|---|---|
| Data Parallel | Batch | Gradient AllReduce/ReduceScatter | 全局 Batch 和网络 |
| Tensor Parallel | Layer 内张量 | 高频 AllReduce/AllGather | 低延迟节点内互连 |
| Pipeline Parallel | Layer Stage | Activation Send/Recv | Pipeline Bubble 和均衡 |
| Expert Parallel | Expert | AllToAll | 网络均匀性和拥塞 |

组合并行的 GPU 总数是多个并行维度乘积。容量表必须写出每个维度、每卡 Micro Batch、Gradient Accumulation 和副本数，否则“需要 64 GPU”不可复核。

### ZeRO/FSDP 降低状态冗余但增加通信与复杂性

不同 Stage 分片 Optimizer、Gradient 和 Parameter，显存下降伴随 AllGather/ReduceScatter、CPU/NVMe Offload 或更复杂 Checkpoint。估算要加入通信 Buffer、Prefetch 和瞬时 Full Parameter，而不能只除以 World Size。

选型时同时评估：是否让模型放得下、Step Time、网络峰值、恢复时长、Checkpoint 格式和框架成熟度。为了省显存引入的 Scale-Out 通信可能让总成本上升。

容量实验要把稳态和瞬时峰值分开测：参数 Materialize、Prefetch、Reduce Buffer、Activation 和分配器碎片可能在同一时刻叠加。记录每个阶段的 AllGather/ReduceScatter 字节数、通信占比、Host/NVMe 流量和 Checkpoint Shard 布局；只有显存下降且目标 Step Time、RTO 和成本仍满足边界，分片才算有效。

### 训练卡数由内存下限和吞吐目标共同决定

先求“模型能运行”的最小卡数，再用单卡/小规模实测 Scaling Curve 求满足完成时限的卡数。理论 FLOPS 除以计算量忽略利用率、通信和数据供给，只能做数量级检查。

```text
Required Throughput = Training Samples or Tokens / Available Training Time
GPU Count Candidate = Required Throughput / Measured Per GPU Throughput
```

Per-GPU Throughput 随 GPU Count 下降，必须使用目标规模附近的实测或保守 Scaling Efficiency。最后加维护、故障和队列余量。

## 第 29 章 · 推理容量和 SLA 模型

### Prefill 和 Decode 需要分别建立基线

Prefill 处理 Prompt，矩阵规模较大、并行度高，影响 Time To First Token；Decode 每步生成少量 Token，反复读取权重与 KV Cache，影响 Inter-Token Latency。混合为一个平均 Tokens/s 会漏掉用户体验。

推理 SLO 至少包含 TTFT、TPOT/ITL、端到端 P50/P95/P99、吞吐、失败率和最大上下文。容量测试按 Prompt Length、Output Length、并发和 Batch 分桶。

基准应分别固定 Prompt/Output 长度并测 Warmup 后稳态，再加入混合长度回放。Prefill 侧观察输入批量、临时 Activation 和 TTFT，Decode 侧观察活跃序列、KV Cache、每步间隔和长尾；将两条曲线合并时要保留各自的资源上限，不能用一个平均 Tokens/s 覆盖不同瓶颈。

### KV Cache 随层数、隐藏维度、上下文和并发增长

KV Cache 的具体公式取决于 Attention 结构、Head 数、KV Head、Datatype 和实现。通用估算思路是先求单 Token 每层 K/V 元素，再乘 Layer、Sequence 和并发。

```text
KV Cache ~= Bytes per Element
           x K and V Elements per Token per Layer
           x Layers
           x Active Tokens across Requests
```

GQA/MQA、Paged KV Cache 和量化会改变系数。最终以目标 Engine 的实测 Memory Curve 校准，并加入 Fragmentation、Workspace 和多模型实例。

### 动态批处理在吞吐和排队之间寻找边界

更大 Batch 提高 GPU 效率，却增加等待聚合时间和单批执行时长。容量模型不能只用最大吞吐点，要在 P99 SLA 内寻找安全吞吐，并保留突发和重试余量。

```text
Safe Replica Throughput = Measured Throughput at SLO Boundary x Safety Factor
Replica Count = Peak Arrival Rate / Safe Replica Throughput
```

Safety Factor 由流量波动、节点故障、模型加载时间和扩容速度决定，不应统一写死。至少做 N+1 副本故障测试。

### 模型加载和扩容速度也是容量

模型权重从对象存储/Registry 到本地 Cache，再加载到 HBM，可能需要数分钟。突发发生后才启动副本可能无法满足 SLA。设计要记录镜像拉取、权重下载、Engine 构建、HBM 加载和 Warmup 各阶段时间。

大模型可预拉取制品、保留 Warm Replica 或使用本地 NVMe Cache，但会增加存储和闲置成本。扩容 SLO 必须通过冷节点实验，而非只测已有 Cache。

## 第 30 章 · 网络和存储容量预算

### 通信时间预算从允许 Step 占比反推带宽

如果目标 Step Time 为 `T`，允许通信占比为 `r`，则通信时间预算约 `T × r`。结合 Collective 每 Rank 数据量，可估算最低有效带宽。

```text
Required Effective Bandwidth = Communication Bytes per Rank / Communication Time Budget
```

有效带宽低于线速，因为有协议、拓扑、Algorithm、并发和长尾。网络端口规格要通过目标 Rank/Collective 的 NCCL Tests 校准，不能把 400 Gb/s 直接当 50 GB/s 应用吞吐。

### Oversubscription 要按并发通信域计算

机架 ToR 上行、Spine、Rail 和跨机架链路可能共享。若多个 Job 同时 AllReduce，单 Job 基准达标也不代表并发达标。设计应给出每故障域 GPU 数、每 GPU NIC 带宽、ToR 上下行和最坏并发。

训练与存储若共享 Fabric，还要考虑 Checkpoint Burst。更稳妥的设计可隔离 Compute/Storage Traffic Class、Rail 或网络，并验证故障时剩余路径容量。

容量表应按最坏并发列出每个 ToR 上行、Spine 路径、Rail 和故障域的同时流量，分别计算 AllReduce、AllToAll、Checkpoint 和回源读的峰值。验证时逐步增加 Job 数，观察每端口吞吐、PFC/ECN、丢包和 Rank 长尾；单 Job 达标而并发退化时，应降低可并发 Admission 或重新分配网络，而不是继续提高单 Job 配额。

### Dataset Read 和 Checkpoint Write 是不同 I/O 波形

Dataset 可能大量小文件随机读、顺序 Shard 或对象 Range Read；Checkpoint 是多个 Rank 周期性大写、Metadata Commit 和最终一致性。单一顺序 `fio` 不能代表两者。

```text
Required Dataset Throughput >= Bytes consumed per Step / Step Time
Checkpoint Throughput >= Checkpoint Size / Allowed Checkpoint Window
```

还需考虑并发 Job、压缩、DataLoader Prefetch、Cache Hit 和 Storage Tail Latency。验收用真实文件数量、Block Size 和并发模式。

### 本地 Cache 容量按 Working Set 和回源窗口规划

NVMe Cache 减少共享存储压力，但节点故障会丢失 Cache，调度迁移后需重新预热。规划包含热点 Dataset/Model Working Set、并发版本、淘汰水位、写放大、盘故障和回源带宽。

Cache 命中率下降时，共享存储必须承受回源峰值。不能用稳定期高命中掩盖集群重启或大规模扩容的冷启动风暴。

规划至少定义预热时间、淘汰水位、单节点失效后的回源带宽和同时替换节点数。用冷启动、扩容和 Cache 清空场景测共享存储 P99 与 GPU Idle，并把缓存内容的版本、校验和权限纳入制品管理；缓存命中只改善性能，不改变 Source of Truth。

## 第 31 章 · 功耗、散热与故障域设计

### GPU TDP 不是节点和机架总功耗

节点功耗还包括 CPU、Memory、NIC/DPU、NVMe、Fan、PSU Loss 和 BMC。机架设计按持续负载、瞬时峰值、PSU 冗余和支路容量，不应只把 GPU TDP 相加。

```text
Rack IT Load = Sum Node Peak under Accepted Power Policy
             + Network and Storage Appliances
             + Design Margin
```

降低 GPU Power Limit 可改善机架密度，但必须测量吞吐、完成时间和单位任务能耗。有时功耗下降 10% 只损失少量性能，有时会明显拉长训练，需用真实模型决定。

### 散热验收要覆盖持续稳态和最差进风

短 Benchmark 尚未让冷却系统达到稳态。Burn-in 要持续到温度、风扇、时钟和功耗稳定，并在高环境温度或相邻机架负载条件验证。液冷还需流量、进出水温、压差和泄漏检测。

通过条件不是“未过热关机”，而是在接受温度下无 Thermal Throttle、Clock 符合基线、错误计数不增长。

验收记录环境温度、机架相邻负载、进出风或液冷参数、GPU Clock/Power/Temperature 时间序列，并比较冷机与稳态吞吐。任意一个 GPU 持续降频、AER/ECC/XID 增长或液冷告警，都应按节点/机架故障域隔离，而不是用平均温度掩盖离群设备。

### 故障域决定冗余放在哪里

组件故障域包括 GPU、Node、NVSwitch Baseboard、ToR、PDU、Rack、Storage Controller、Control Plane 和 Availability Zone。N+1 GPU 若全部在同一 PDU 下，不能覆盖 PDU 故障。

容量表应按目标故障场景扣除资源后再验证 SLA。例如要求容忍单节点故障，就以 `Total - Largest Node` 计算可用训练/推理容量，并实测 Queue 与恢复。

冗余设计要把计算、网络、存储和控制面故障分别建模。训练 Group 的完整拓扑可能比总 GPU 数更早成为瓶颈；推理副本则要跨 PDU、Rack 或 Zone 分布。每个故障场景记录剩余容量、调度可行性、恢复路径和 RTO，避免只在采购表中增加一张“备用卡”。

## 第 32 章 · 验收阈值和测试治理

### 每项验收包含前置条件、步骤、证据和退出条件

```yaml
test_case:
  id: NET-NCCL-001
  scope: single-rack-eight-gpu-per-node
  prerequisites:
    - nodes drained
    - firmware baseline matched
  workload: all_reduce
  pass_criteria:
    - bus_bandwidth_within_accepted_baseline
    - zero_unexplained_link_errors
  artifacts:
    - command.txt
    - output.log
    - counters-before-after.json
```

真实阈值在项目 Baseline 中填写，模板不伪造通用性能数字。

### 测试环境必须声明是否独占

共享 Fabric、Storage 和 GPU 会引入背景负载。硬件上限验收应独占测试；生产代表性验收可加入受控并发。两类结果分别记录，不能拿夜间独占峰值承诺白天共享 SLA。

测试记录至少声明 GPU、CPU、NUMA、HCA、交换机端口、存储客户端和控制面是否独占，以及背景负载的类型、强度和开始时间。独占测试用于建立硬件基线，共享测试用于验证隔离和 QoS；若两者差异超过容量模型假设，应更新模型或降低服务等级，而不是挑选较好的结果发布。

### 失败测试要区分产品缺陷、环境缺陷和测试缺陷

命令参数不一致、测试数据 Cache、时间未同步也会产生失败。复测前先确认测试自身可重复，再定位硬件/软件。所有失败保留原始结果，禁止只保存最后一次通过输出。

可采用三步分类：先用已知健康节点和固定输入复跑以确认测试有效，再与同拓扑基线比较，最后按硬件、驱动/平台、网络/存储或测试脚本归属。每次复测都保留版本、命令行、环境变量和原始日志，并关联缺陷编号；没有证据的“偶发失败”不能直接关闭。

### 验收脚本也需要版本控制和审查

脚本记录 Commit、依赖、默认参数和安全边界。涉及满功耗、全网带宽、Disk Write、GPU Reset 或配置变更的测试必须显式标记维护窗口，默认只读/低风险模式。

脚本应把危险动作拆成显式参数，并默认拒绝跨节点、全盘或设备 Reset。执行前检查节点是否已 Drain、目标范围是否与工单一致；执行后自动保存命令、退出码、版本和 counters-before-after。变更脚本必须经过代码审查和小范围 Canary，避免验收工具本身改变被测系统。

## 第 33 章 · 交付物、责任边界与运营 SLO

### 架构交付物必须能够支持日常变更

最终交付不仅是逻辑架构图，还包括 Rack/Power、节点 BOM、PCIe/NVLink/NIC 拓扑、IP/GID/Rail、软件版本矩阵、镜像 Digest、Kubernetes Policy、监控告警、基线、Runbook、备件和升级回滚。

任何后续 Driver/Firmware/Network 变更都能从这些文件判断影响和重测范围，才算可运营架构。

交付目录应给每份制品标注 Owner、版本、更新时间、适用节点池和失效条件，并提供从资产到监控、从镜像到模型、从告警到 Runbook 的引用关系。变更评审以此判断需要 Drain 哪些节点、重跑哪些测试和是否影响已承诺 SLO；只保存一张脱离实际资源的逻辑图不具备这种能力。

### RACI 要覆盖硬件、平台、网络、存储和模型

GPU XID 可能需要硬件团队，NCCL Timeout 需要平台与网络，模型 OOM 需要应用团队。事件流程明确谁接收 Page、谁可 Cordon/Drain、谁批准 Reset/更换、谁验证业务和谁联系厂商。

没有权限和责任边界的 Runbook 只能作为阅读材料，无法在事故中执行。

RACI 表至少区分发现、初判、执行、批准和复盘角色，并列出 Break-Glass 的授权人和审计要求。对于跨团队故障，规定谁维护唯一 Incident 状态、谁保留原始证据、谁决定隔离/Reset，避免多个团队同时操作同一节点造成证据丢失。

### 平台 SLO 连接资源交付和业务可用性

候选 SLI 包括 GPU Allocatable Accuracy、Pod GPU Start Success、Queue Time、Node Repair Time、Telemetry Coverage、Benchmark Conformance、Checkpoint Recovery 和推理 SLA。平台不直接承诺模型质量，但要承诺资源和运行时边界。

每个 SLI 需要定义测量范围、排除项、统计窗口和目标。例如 Queue Time 应按服务等级和完整拓扑 Group 计算，Telemetry Coverage 要区分节点在线与指标可用，Checkpoint Recovery 则同时记录成功率和 RTO。将 Error Budget 消耗与暂停扩容、限制 Admission 或安排维修等动作绑定，SLO 才能影响容量决策。

### 容量模型按实际数据周期校准

每月或重大模型发布后，用实际 GPU Hour、Peak Concurrent、Queue、Utilization、OOM、Scaling Efficiency、Storage/Network 峰值更新模型。偏差大时说明工作负载假设或测量方法失效。

容量评审输出采购/释放、节点池调整、共享策略、配额和性能优化动作。只更新 Spreadsheet 而不连接调度与预算，不能形成闭环。

校准时保留预测值、实际值、偏差原因和修正后的假设，区分模型变化、流量变化、平台退化和采集缺失。容量结论应能回写到 Queue 配额、节点池标签、采购计划和 SLO 预算，并在下一周期验证修正是否有效。

## 第 34 章 · 大模型训练项目端到端算例

### 案例输入先形成带编号的需求表

假设某团队要建设一个多模态大模型训练平台。这里不预设 GPU 型号或厂商性能数字，而用变量表示待确认值；项目组必须用目标模型、目标精度和代表性数据实测后替换变量。这样算例展示的是推导关系，不是可直接采购的规格。

| ID | 需求输入 | 变量或范围 | 验证责任 |
| --- | --- | --- | --- |
| R-01 | 模型与精度 | 参数量 `P`、精度 `Q`、最大序列 `L` | 模型团队提供可运行版本 |
| R-02 | 业务产出 | 训练数据量 `W`、完成期限 `D` | 业务 Owner 确认 Deadline |
| R-03 | 并发 | 主训练 `J_train`、实验 `J_exp`、评估 `J_eval` | 平台与算法共同确认 |
| R-04 | 数据 | Dataset `S_data`、文件分布、每 Step 读取量 `B_read` | 数据与存储团队测量 |
| R-05 | 恢复 | Checkpoint `S_ckpt`、周期 `I_ckpt`、RPO、RTO | 业务与平台共同签字 |
| R-06 | 服务等级 | Queue SLO、训练完成时间、可维护窗口 | 平台 Owner 确认 |
| R-07 | 租户边界 | 团队数、隔离等级、是否允许共享 GPU | 安全与平台确认 |
| R-08 | 场地边界 | 单机架功率 `P_rack`、冷却能力、可用机位 | 设施团队确认 |

任一输入未知时记录上下界、Owner 和关闭日期。例如 `S_ckpt` 未实测，就分别用乐观值和保守值计算存储窗口；不能用行业平均值把 `to-be-confirmed` 伪装成确定需求。

```mermaid
flowchart LR
    R[Requirement IDs] --> C[Capacity IDs]
    C --> D[Decision IDs]
    D --> A[Acceptance IDs]
    A --> O[Operating Limits]
    O --> R
```

### 容量计算从单卡基线推导完整 GPU Group

先在候选节点上运行同一模型、Framework、数据路径和输入 Shape，测得峰值显存 `M_peak`、单卡或最小可运行组吞吐 `X_base`、Step Time 及数值结果。显存下限和期限下限分别计算，GPU 数取两者中更严格的一项，再按 Tensor/Pipeline Parallel Group 和整节点拓扑取整。

```text
M_peak = Weight + Gradient + Optimizer + Activation
       + Communication Buffer + Workspace + Allocator Reserve

X_required = W / D
G_memory   = minimum GPUs that keep M_peak within verified usable memory
G_time     = minimum GPUs whose measured effective throughput reaches X_required
G_job      = topology_group_round_up(max(G_memory, G_time))
```

| Capacity ID | 计算对象 | 输入 | 输出与用途 |
| --- | --- | --- | --- |
| C-01 | 单 Job 显存 | R-01、实测 `M_peak` | 并行策略与最小 GPU Group |
| C-02 | 单 Job 算力 | R-02、Scaling Curve | 满足期限的 `G_job` |
| C-03 | 集群并发 | R-03、R-06、`G_job` | 正常场景完整 Group 数 |
| C-04 | 故障与维护 | 最大故障域、维护批次 | 不可重复计算的 Spare Capacity |
| C-05 | 数据供给 | R-04、Cache Hit、并发 Job | 共享存储与本地 NVMe 预算 |
| C-06 | Checkpoint | R-05、并发写入窗口 | 写带宽、容量、RPO/RTO 预算 |
| C-07 | 设施 | 节点、交换机、存储功耗 | 机架数量、配电与冷却边界 |

必须实测 1 GPU、节点内 Group 和多节点 Group 的 Scaling Curve。总 GPU 数不能用 `G_job × 并发数` 后机械加百分比：正常、故障、滚动维护和突发场景要分别列出可启动的完整 Group，防止同一 Spare 同时承诺给维修和业务突发。

### 系统设计把拓扑 网络 存储和设施绑定到容量项

`G_job` 决定节点内 Scale-Up 边界和节点间 Scale-Out 规模。Rank 应先落入 NVLink/NVSwitch 连接的完整 GPU Group，再根据 GPU-NIC Affinity 选择 HCA 和 Rail；Compute、Storage、In-Band 与 OOB 是否分离，则由通信并发、安全和故障域决定，不能从参考架构复制端口数量。

| Decision ID | 选择问题 | 本案例的决策条件 | 必须保留的验证 |
| --- | --- | --- | --- |
| D-01 | 节点与拓扑 | 能容纳 C-01 Group，CPU/NUMA/PCIe 不阻塞数据供给 | P2P Matrix、H2D、节点内 NCCL |
| D-02 | Scale-Out 网络 | C-02 的通信时间预算和 C-03 并发下仍满足 Step Time | RDMA、Multi-Node NCCL、拥塞场景 |
| D-03 | 数据与 Checkpoint | C-05/C-06 同时发生时不让 GPU 长时间等待 | 冷热 Dataset、并发 Checkpoint、恢复读 |
| D-04 | 机架布局 | C-07 在失去一路供电或维护批次时仍满足允许负载 | 满载功耗、温度、Clock 与机房告警 |

参考架构只用于识别 Compute Fabric、Storage Fabric、管理网络和 OOB 等集成点。若本地功率、冷却、存储协议或节点数量偏离参考设计，偏离项必须成为 ADR，并用目标工作负载单独验收。

### 平台选择连接调度 共享 可观测与恢复边界

本案例若以长期批训练为主，可用 Slurm 或具备 Queue、Priority、Gang 和拓扑能力的 Kubernetes 平台；若同一组织还运行在线推理，可让 Kubernetes 承担服务生命周期，但必须明确两套调度器的节点池和容量边界。HAMi 只用于 R-07 允许共享且已经通过干扰验收的实验类负载，主训练 Group 不因“提高利用率”而默认拆分。

| Decision ID | 决策 | 追溯输入 | 运行约束 |
| --- | --- | --- | --- |
| D-05 | 训练调度平台 | R-03、R-06、C-03 | Gang、Queue SLO、拓扑组和 Checkpoint 协同 |
| D-06 | 共享策略 | R-07、实验资源画像 | Full/MIG/HAMi 分节点池并声明隔离等级 |
| D-07 | 制品与数据 | R-04、R-05 | Image Digest、Dataset Manifest、Checkpoint Generation 可追溯 |
| D-08 | 可观测性 | R-02、R-05、R-06 | Job/Attempt/Rank/GPU UUID 与业务吞吐同时间线 |
| D-09 | 升级恢复 | C-04、兼容矩阵 | 节点池 Canary、Drain、回滚和恢复放行门禁 |

监控至少连接训练吞吐、Queue Time、GPU/SM/DRAM、NCCL/RDMA、存储等待、温度/功耗和 Checkpoint 成功率。Dashboard 不是验收结论；每个 SLI 都要有数据来源、关联键、告警动作和缺失指标处理方式。

### Acceptance Matrix 把每个结论闭环到需求和恢复

| Acceptance ID | 覆盖链路 | 验收内容 | 未通过时的生产限制 |
| --- | --- | --- | --- |
| A-01 | R-01 → C-01 → D-01 | Inventory、显存、单卡与 Burn-in | 对异常节点停止调度 |
| A-02 | R-02 → C-02 → D-01/D-02 | 节点内及多节点 NCCL、真实模型 Scaling | 限制最大 World Size 或故障域 |
| A-03 | R-04 → C-05 → D-03 | 冷/热 Dataset、Metadata、GPU Waiting | 限制并发并先完成数据预热 |
| A-04 | R-05 → C-06 → D-03/D-09 | 并发 Checkpoint、节点故障、完整状态恢复 | 不承诺目标 RPO/RTO |
| A-05 | R-06 → C-03/C-04 → D-05 | Queue、Gang、节点故障和维护容量 | 收紧 Admission 或服务等级 |
| A-06 | R-07 → D-06 | HAMi/MIG 资源限制、邻居干扰和归属 | 禁止未通过的共享资源类 |
| A-07 | R-08 → C-07 → D-04 | 计算网络存储并发满载下的功耗散热 | 限制每机架节点数或功率上限 |
| A-08 | D-08/D-09 | 告警、证据包、隔离、回滚与恢复放行 | 节点池不得进入生产 |

恢复演练必须从最近 Durable Checkpoint 在替代资源上继续训练，并核对 Global Step、Optimizer、Sampler、RNG 和 Loss；只加载权重不能证明 Resume。每个测试保存 Run ID、环境版本、拓扑、阈值来源、实际结果和证据路径，使 Requirement、Capacity、Decision 与 Acceptance 可以双向追溯。

输入变化会沿依赖链触发重算：`P/Q/L` 变化重做 C-01、C-02 与 A-01/A-02；`W/D` 变化重做 C-02、C-03 与 Queue 验收；`S_data/文件分布` 变化重做 C-05 与 A-03；`S_ckpt/RPO/RTO` 变化重做 C-06 与 A-04；并发或租户隔离变化重做 C-03、D-05/D-06 与 A-05/A-06。只有受影响结论重测通过，旧容量表和 Acceptance Matrix 才能升版。

## 第 35 章 · 在线推理项目算例框架

### 流量模型包含长度分布和突发而不只 QPS

输入包括 Prompt/Output Token P50/P95/P99、并发、到达分布、Streaming、TTFT/TPOT、区域和模型组合。相同 QPS 下，长上下文流量的 GPU/KV Cache 需求可能高一个数量级。

容量输入应保留时间窗口和业务路由来源，并把突发持续时间、重试放大、流式连接占用和限流策略写清楚。按请求长度分桶回放真实流量，分别观察 Prefill、Decode、KV Cache 和排队；仅用平均 Tokens/request 会掩盖长请求把显存和 P99 推过边界的情况。

### 用负载曲线寻找 SLO 拐点

逐步增加并发，记录 Queue、Batch、TTFT、TPOT、Throughput、KV Cache 和 OOM。P99 首次超过 SLO 前的稳定点是单副本安全容量候选，不能取 OOM 前的最大吞吐。

每个并发点至少经过 Warmup 和稳态窗口，并重复多次以区分抖动。将安全点标注为“输入长度分布、精度、Engine 版本和节点拓扑”的组合结果；任何一个条件变化都要重新测量。安全容量还要扣除故障副本、升级副本和模型加载期间不可服务的时间。

### 多副本容量考虑模型加载和故障

以失去一个 Node/Zone 后仍满足关键流量计算副本。模型加载需要数分钟时，故障后的即时容量依赖 Warm Replica；HPA 只能补中长期，不替代 N+1。

副本规划应把冷启动分解为镜像拉取、权重下载、Engine 构建、HBM 加载和 Warmup，并用最慢阶段校验恢复窗口。跨节点/Zone 放置副本后，故障演练要测剩余副本在流量重分配后的 P99；如果无法在目标窗口内恢复，应降低承诺吞吐或增加预热容量。

### 多模型共卡评估显存常驻和干扰

多个小模型可用 MIG/HAMi/Time-Slicing 提高利用率，但要测试同时加载、峰值请求、长短模型混合和单模型 Crash。P99 敏感服务不与未知 Batch 作业弱隔离共卡。

测试需记录每个模型的常驻权重、KV Cache 上限、Workspace 和加载/卸载时间，并观察邻居在长请求、OOM 和 Kernel 峰值下的 P99 变化。若无法给出可解释的显存上限、设备可见性和故障边界，应把模型放入专用池，而不是用平均利用率证明共享安全。

### 发布策略包含 Engine 和流量回滚

Canary 比较质量和资源，逐步加权；错误或 P99 超阈值时回滚 Gateway Traffic、Model/Engine 和 Image。Engine 与 Runtime 成对版本，确保旧制品可加载。

发布制品应绑定模型、Engine、Runtime、镜像 Digest、Tokenizer 和配置版本，并保存旧版本的可启动副本。Canary 阶段同时比较业务质量、TTFT/TPOT、显存、GPU 利用率和错误码；回滚先切流，再停止新副本，最后按验证过的顺序回退 Engine 和镜像，避免只回退网关导致版本不匹配。

## 第 36 章 · 多租户 GPU 平台算例框架

### 先按工作负载风险分服务等级

| 等级 | 典型工作 | 隔离 | 调度和恢复 |
|---|---|---|---|
| Critical | 在线核心推理 | Full/MIG 强隔离 | 预留和跨故障域 |
| Guaranteed | 长训练 | Full GPU/整节点 | Queue 和 Checkpoint |
| Shared | Notebook/小推理 | MIG/HAMi | 配额和干扰 SLO |
| Best Effort | 探索/批处理 | Time-Slicing/HAMi | 可抢占和借用 |

等级名只是示例，组织需定义明确 SLO、价格和准入。

### 历史请求形状决定节点池布局

统计 1/2/4/8 GPU Job、显存 Tier、持续时间、Queue 和拓扑需求。大 Job 多则保留完整节点池，小任务多则共享/MIG 池。每月根据 Pending Shape 和碎片调整。

除数量外还应统计请求到达时间、最长占用、失败重试和节点故障后的重新放置结果。用 Pending Shape 与实际可用拓扑做碎片分析，识别“总空闲 GPU 足够但没有完整 Group”的浪费；节点池变更前用历史回放评估 Queue、利用率和迁移成本。

### 借用策略要能收回且不浪费大量训练

低优队列借用闲置 GPU 时，设置最短运行时间、Checkpoint 通知和 Grace Period。高优需求到来后按可恢复成本抢占，记录浪费 GPU Hour。

借用合同应明确可抢占信号、最长通知时间、Checkpoint 位置、重试次数和费用归属。调度器先选择已有 Durable Checkpoint 且预计浪费最小的作业；若作业无法在 Grace Period 内保存，应禁止其借用关键保留容量。通过实际抢占演练校准“提前多久发信号”而不是照搬默认值。

### 租户隔离验收包含故障和数据边界

测试一租户 OOM、非法 Kernel、满功耗、满显存、长 Kernel 和退出，观察邻居性能/错误；验证设备可见、进程/指标归属和显存限制。弱隔离不通过就限制在同信任域。

测试结果要关联租户、Pod、GPU UUID 和时间窗口，并检查日志、指标、Checkpoint 和对象存储权限是否越界。对可共享设备，定义邻居性能退化和错误传播的上限；一旦超过上限，应通过资源池、MIG 或 Full GPU 隔离解决，而不是要求租户自行避让。

## 第 37 章 · 采购技术规格和投标验证

### 规格书写系统能力而不是营销名称

应写 GPU 数/显存/精度能力、完整 NVLink/NVSwitch 拓扑、CPU/Memory/PCIe、HCA 数与带宽、Storage、Power/Cooling、Firmware 和支持周期。只写“最新 GPU 服务器”无法验收。

规格条款还应给出可观察的验收字段：GPU UUID/Serial、PCIe Link Width、NVLink Domain、HCA 与 GPU 的亲和关系、PDU/冷却边界及软件兼容矩阵。每项能力绑定测试方法、输入范围和缺陷处理方式，供应商无法用另一种拓扑或单卡最佳结果替代目标系统证明。

### 性能条款给出测试方法和容差

明确工具版本、消息范围、节点数、环境是否独占、重复次数、统计方式和通过阈值来源。供应商自选最佳一次结果不能替代用户现场复验。

条款应要求提供原始输出和拓扑/版本清单，并约定 P50、P95、最小值或最大值的统计口径。对 NCCL、RDMA、存储和真实模型分别规定允许偏差；测试失败时保留复测次数和背景负载，避免只交付一张无法重放的汇总表。

### 支持条款覆盖 Driver、Firmware 和联合故障

GPU、NVSwitch、NIC、Server OEM 和软件可能属于不同支持方。合同明确联合定位接口、日志工具、备件 SLA、Firmware 建议、Driver Branch 和现场更换边界。

支持流程还要规定首响与升级时限、现场收集哪些 XID/AER/NCCL/RDMA 证据、替换件的版本一致性以及故障期间的临时容量方案。联合故障不能被各供应商分别归为“第三方问题”，应有一个可以拉齐硬件、网络和软件 Owner 的升级入口。

### 到货验收保存每台资产身份

记录 Serial、GPU UUID、NIC GUID/BDF、Firmware、槽位与 Rack，和采购 BOM 对比。批次混入不同 Firmware/Memory/NIC 时先统一基线再压测。

资产记录应在 BMC、操作系统、容器和调度器四个视角交叉核对，并保存拍照或原始命令输出。发现身份不一致、槽位变更或固件漂移时先阻止进入生产节点池，修正资产账本后再建立健康基线。

## 第 38 章 · 从 POC 到生产的阶段门

### POC 验证可行性和关键未知

小规模验证模型可运行、性能数量级、软件兼容和主要网络/存储路径。POC 不承诺大规模线性扩展，也不跳过安全和运营设计。

POC 退出时列出已验证、未验证和需要在 Pilot 解决的假设，至少包含单卡显存、最小通信路径、数据可读性和 Checkpoint 可加载。把“能跑通”与“达到目标吞吐/SLO”分栏，防止原型结果被直接当作采购或生产承诺。

### Pilot 验证规模、并发和控制面

代表性节点/机架运行多作业、故障注入、升级回滚、监控告警和用户流程。Pilot 发现的限制进入架构和生产 Admission。

Pilot 应使用接近生产的节点池、身份、配额和存储制品，至少覆盖一次完整调度、扩容、抢占、恢复和发布流程。所有偏差按影响范围分级，并在进入 Production Readiness 前验证对应的技术限制或修复，而不是留在试点人工操作中。

### Production Readiness 验证人、流程和备件

除技术测试，还要完成 On-Call、权限、Runbook、厂商支持、备件、容量、变更窗口、灾备和审计。没有恢复责任人的高性能集群不具备生产条件。

评审应现场演练至少一个常见故障和一个跨团队故障，确认值班人员能从告警找到 Runbook、取得权限、完成隔离并恢复服务。备件和替换节点必须有可用性记录，容量和预算要覆盖维护期，不以“发生故障再采购”作为恢复方案。

### 每个阶段有退出标准和未决风险

退出评审列 Passed、Conditional、Failed、Risk Owner 和 Deadline。未决风险必须映射限制或延期，不能用“POC 效果不错”代替生产门禁。

退出标准应同时包含量化阈值、证据链接、适用范围和回退动作。Conditional 项必须写明用户不可使用的能力、临时控制和到期复评日期；没有 Owner、期限或生产限制的风险项不得被计入“有条件通过”。

## 第 39 章 · 架构评审输出模板

### Executive Summary 说明业务和关键选择

工作负载/SLO/规模/时间、推荐平台和三项主要风险。面向决策者，不用产品清单替代结论。

摘要应先给结论，再给约束和需要批准的决策：目标容量、预期上线阶段、故障假设、预算范围和未解决问题。每个关键结论链接到 Requirement、Capacity、Acceptance 和 Risk 条目，使读者能从一页摘要追溯到原始证据。

### Requirement 表记录值、范围和 Owner

Training/Inference、Model/Data、Precision、Concurrency、SLA、Availability、Multi-Tenant、Security、Budget 和日期。未知项有关闭时间。

每行区分目标值、允许范围、测量单位、来源和确认人，并标记是平均、P95 还是峰值。未知项必须有决策截止日期和缺失时的保守默认行为，否则容量计算会把占位符误当成已确认需求。

### Assumption 表可被验证和推翻

Scaling Efficiency、Cache Hit、Traffic Growth、Failure Rate、Power/Cooling、供应周期，给来源、敏感性和 Revisit Trigger。

假设记录应包含当前值、上下界、影响的计算字段和验证方法。例如 Cache Hit 下降会同时改变回源带宽、GPU Idle 和成本；模型发布或节点替换触发重测时，更新假设版本并保留旧值，才能解释容量预测为何变化。

### Capacity 表分正常、故障和维护场景

GPU/CPU/Memory/Network/Storage/Power，正常峰值、失去最大故障域、维护批次和 Headroom。冗余不重复计算。

表格为每种场景列出可调度完整 GPU Group、可服务请求率、Queue 上限和剩余 Headroom，并注明共享容量是否可回收。故障与维护场景扣除的是同一批实际资源，必须避免把 N+1、升级池和突发池重复计入总量。

### Topology 图标出 Scale-Up/Scale-Out

GPU Group、NVSwitch、CPU/NUMA、HCA/Rail、Rack/Spine、Storage/Management Network 和故障域。逻辑图附物理映射。

图中应标注链路方向、带宽级别、共享上行和调度边界，并能从逻辑 Rank Group 查到实际 GPU UUID、PCI BDF、HCA 和交换机端口。拓扑变更后重新生成版本化图，而不是继续使用采购时的静态示意图。

### 软件版本矩阵连接硬件池和镜像

OS/Kernel/Driver/FM/OFED/Runtime/Operator/HAMi/Framework/Engine，支持/禁止组合和 EOL。

矩阵还要标明验证状态、适用节点池、升级顺序和回滚版本。把镜像 Digest 与宿主 Driver、Firmware、Operator 和 Engine 的组合绑定，禁止只写“兼容 CUDA”这种无法判断 ABI 或 NCCL 行为的描述。

### 资源目录定义用户看到的产品

Full/MIG/HAMi/vGPU、GPU Class、显存、Fabric、隔离、SLO、Queue/Quota 和成本。资源名不隐藏重要限制。

目录中的每个资源类型应说明可见设备、最大显存/算力、是否支持多卡拓扑、可抢占性、数据隔离和计费单位。用户提交请求时可据此选择资源，平台也能在 Admission 阶段拒绝不满足模型或 SLA 的组合。

### 数据和制品流明确 Source of Truth

Dataset/Checkpoint/Model/Engine/Image 的存储、缓存、版本、权限、保留、备份和发布路径。

为每类制品指定唯一事实源和不可变版本，说明从训练输入到线上 Engine 的晋级关系、缓存失效和删除策略。恢复与审计应能从 Job/Model 版本反查 Dataset Manifest、Checkpoint Generation、镜像 Digest 和权限变更记录。

### 可用性设计列出故障行为

GPU/Node/NVSwitch/Rail/ToR/Storage/Controller/Zone 失败时检测、影响、隔离、容量、恢复与 RTO。

故障表至少区分局部降级和全局不可用：哪些 Job Fail Fast，哪些副本继续服务，调度器是否排除节点，剩余容量是否仍满足关键 SLO，以及恢复完成的放行条件。把每种故障关联到一次可执行的演练和对应 Runbook。

### 运维模型声明状态机和权限

上线、Ready、Drain、Maintenance、Fault/Repair/Validation，On-Call、Break-Glass、厂商和 RACI。

状态转换应有进入条件、允许动作和退出证据。例如 `Fault -> Repair -> Validation -> Ready` 不能因 BMC 恢复就跳过 GPU、Fabric、NCCL 和监控检查；Break-Glass 操作必须临时授权、双人复核或事后审计。

### 监控与 SLO 连接业务和硬件

业务 SLI、Platform SLI、GPU/RDMA/Storage/Facility 指标、告警 Severity、Telemetry Coverage 和 Error Budget。

监控设计要保留 Job、Attempt、Rank、GPU UUID、Node 和时间关联，使业务延迟或训练 Step 退化可以下钻到设备、网络或存储。告警分级应对应明确动作和预算消耗，Telemetry 缺失本身也应成为平台 SLI，而不是在故障时才发现没有数据。

### Acceptance Matrix 有通过阈值和证据

Inventory/Health/Compute/Memory/Topology/NCCL/RDMA/Storage/Scheduler/Sharing/Monitoring/Failure/Recovery，工具版本和原始 Run ID。

矩阵每行包含前置条件、测试命令/工作负载、阈值来源、实际结果、证据路径、责任人和复测日期。通过应覆盖正向和负向用例；Conditional Pass 必须关联 Admission 限制或上线阶段，不能只在备注中描述风险。

### Cost Model 使用有效产出

采购/云、Power/Cooling、Network/Storage、License/Support、人力，按有效训练/推理产出、SLO 和故障重算比较。

成本分子应覆盖闲置、排队、Checkpoint、失败重算和扩容冷启动，分母使用 Durable Token、有效请求或满足 SLO 的服务量。比较不同架构时保持折旧、能耗和支持周期口径一致，并把故障域冗余和维护容量单独列出。

### ADR 保存备选和触发条件

为什么选/不选、证据、风险、审批和何时重评。产品/规模变化不靠记忆重开争论。

ADR 还应记录决策日期、适用范围、被否决方案的恢复成本和验证链接。触发条件达到时创建新的 ADR 或修订版本，保留原决策以便解释历史容量和兼容性选择，避免用口头共识覆盖已部署系统。

### Risk Register 映射技术控制

概率/影响/Owner/Deadline/Mitigation/Residual，未关闭风险落实 Admission、调度、告警或 SLA 限制。

风险条目要有可观测的触发信号和验证方式，例如 NCCL 长尾、存储回源峰值或备件交付延迟。Residual Risk 由业务 Owner 接受后才能进入生产；若超过阈值，自动触发限流、节点隔离、暂停发布或重新评审，而不是继续依赖人工提醒。

## 第 40 章 · AI 数据路径与存储工作负载

### GPU 等待数据时算力无法转化为训练吞吐

训练数据从对象/共享存储进入节点 Cache，经 CPU DataLoader、Pinned Memory 到 GPU；Checkpoint 从 GPU/Host 聚合后反向写入存储。存储“可访问”只证明功能，不证明能持续供给 GPU。

```mermaid
flowchart LR
    A[Object or Shared Storage] --> B[Node NVMe Cache]
    B --> C[Host Page Cache]
    C --> D[CPU Decode]
    D --> E[Pinned Memory]
    E --> F[GPU HBM]
    F --> G[Checkpoint Buffer]
    G --> A
```

GPU 空洞、低功耗和周期性 Step 变长可能来自 I/O。必须把 Dataset Read、Decode、H2D、Compute 和 Checkpoint 时间对齐，而不是看到 Storage 没有报错就排除。

### 训练数据、Checkpoint、模型权重和日志具有不同 I/O 模式

| 对象 | 典型模式 | 关键指标 |
|---|---|---|
| Dataset Shard | 多客户端顺序/随机读 | 吞吐、Open/Stat、尾延迟 |
| 小文件 Dataset | Metadata 密集 | IOPS、Directory/Metadata |
| Checkpoint | 周期性大规模并发写 | Burst 吞吐、Commit、恢复 |
| Model/Engine | 发布时写、启动时大读 | 首次加载、Cache 命中 |
| 日志/指标 | 持续小写 | 延迟、保留、Backpressure |
| 临时 Shuffle | 大量临时读写 | NVMe 容量、写放大 |

一个顺序读峰值不能代表小文件 Dataset，也不能证明 Checkpoint 一致性。容量和验收按对象分别建模。

### 文件大小和 Shard 策略决定 Metadata 压力

数百万小文件会让 Open、Stat、Directory Listing 和权限检查主导时间。把样本打包为适当 Shard 可提高顺序读和预取，但 Shard 太大又降低随机访问、失败重试粒度和分布均衡。

应用记录平均/分位文件大小、每 Step Open 数和 DataLoader Worker。存储团队提供 Metadata QPS、Client Cache 和 Directory 设计。优化需验证数据随机性和训练正确性。

### DataLoader 并发会把单节点问题放大成集群问题

单节点增加 Worker 可以隐藏单个请求的延迟，却也会把打开文件、校验和预取请求成倍放大。当多个节点同时从共享存储冷启动时，后端看到的是突发的连接、Metadata 和小块读取，而不是稳定的顺序带宽。应按 Node、Worker 和 Shard 维度限制并发，并为回源与重试设置上限。

排查时比较每节点 Batch Ready 时间、Worker CPU/内存、Storage P99 和 GPU 空洞。如果只有少数节点落后，优先检查其挂载、网络路径和本地缓存；如果所有节点同步变慢，再检查共享后端或发布事件。
每 GPU 多个 Worker，数百 GPU 同时启动，会形成 Open/Read Storm。单节点测试正常不代表并发启动正常。验收覆盖错峰和同时启动，观察 Metadata、Storage Network、Cache Fill 与 GPU Warmup。

## 第 41 章 · 容量、吞吐、IOPS 与尾延迟

### 存储容量包含数据版本和生命周期放大

```text
Required Capacity
  = Raw Dataset Versions
  + Processed Dataset Versions
  + Checkpoint Generations
  + Models and Engines
  + Temporary Workspace
  + Replication or Erasure Coding Overhead
  + Growth and Safety Margin
```

只按当前 Dataset 大小采购，会漏掉清洗版本、实验分支和 Checkpoint 保留。对象生命周期定义 Owner、Retention、Archive 和 Delete Approval。

### 吞吐预算从每 Step 消费量反推

```text
Dataset Throughput >= Bytes consumed per Step x Concurrent Jobs / Step Time
Checkpoint Throughput >= Concurrent Checkpoint Bytes / Allowed Write Window
```

这是假设未命中 Cache 的后端需求上限。实际用 Cache Hit、压缩和 Prefetch 校准，并单独验证冷启动。

### IOPS 和 Metadata 可能先于带宽饱和

随机小 I/O 会消耗请求处理、锁和元数据服务能力，吞吐计数看起来尚未达到峰值，但队列和 P99 已经持续上升。可以用 `open/stat/create` 速率、目录操作延迟、DataLoader 读取大小和后端队列深度判断是哪一类资源先到瓶颈。

优化顺序通常是减少小文件、打包 shard、降低重复扫描，再调整客户端并发和条带参数。不要仅把并发继续调高；当 IOPS 或 Metadata 已饱和时，这会增加尾延迟并放大训练同步等待。
平均文件小、随机访问多时，每秒操作数和 Metadata Server CPU 已满，网络带宽仍很低。Dashboard 同时看 Read/Write Bytes、Ops、Open/Close/Stat、Queue、Client Retry 和 P95/P99。

### 尾延迟决定最慢 Rank 和 Step Barrier

同步训练的平均读取延迟可能正常，但单个 Rank 的 P99 或偶发重试会让所有 Rank 在 Barrier 等待。指标应同时按 Rank、节点和机架聚合，保留请求时间线以便与 Step、Checkpoint 和网络拥塞对齐。

验证改进时应比较最慢 Rank 与中位 Rank 的差值，而不仅是集群平均吞吐。若降低尾延迟后 Step Time 和 GPU Idle 同时改善，才能说明存储优化传递到了业务层。
分布式训练由最慢 Rank 决定 Step。存储平均延迟正常但少数 Client P99 高，会在 Barrier 放大。按 Client/Node/Rack 分布观察，不只看 Storage Cluster 平均。

### 可用空间和可分配空间不是同一个数

容量看板应分别展示物理容量、可用容量、租户 Quota、快照/纠删码开销和预计增长。对训练目标路径做实际写入测试，才能发现权限、保留水位或 Thin Provision 导致的“有空间但不可写”。
文件系统保留、Quota、Erasure Coding、Snapshot、Thin Provision 和节点水位会减少可写空间。容量告警以租户实际可分配和增长速度为准，避免后端显示有空间但 Checkpoint 因 Quota 失败。

## 第 42 章 · 文件、对象和块存储边界

### 共享文件系统提供 POSIX 语义与目录结构

训练代码容易直接使用路径、Rename 和 File Lock，但大规模并发依赖 Metadata/Client 调优。并行文件系统通过多个 Data/Metadata Target 扩展，应用还需正确 Striping/Sharding。

POSIX 语义的价值是让现有训练代码可以用目录、权限和原子 Rename 管理数据；代价是每次 `open`、`stat`、`rename` 都可能经过元数据服务。小文件、深目录和每个 Worker 重复扫描目录会把元数据请求放大，数据带宽尚未达到上限时，作业已经被 `open` 延迟拖慢。

运维时应把元数据路径和数据路径分开测量：记录目录操作 P99、Metadata Server 队列、Data Target 吞吐，以及单个目录或租户的热点。Striping 不是越宽越好，过宽会增加参与节点数和故障面；应以真实 shard 大小和并发度做对照测试。

### 对象存储适合大规模制品和数据湖

对象以 Key/API 访问，扩展和生命周期管理强，但不是 POSIX 文件系统。Dataset Loader 应支持 Range、并发、Retry、Checksum 和 Credential。用 FUSE 转文件接口会引入额外语义与性能边界。

对象存储的提交单位通常是对象或版本指针，不能假设目录 Rename 与文件系统等价。训练平台应把数据集清单、版本和校验值作为显式制品，先写对象再发布 Manifest；读取端只消费已发布版本，避免看到上传中的对象集合。

在容量规划中同时核算请求次数、跨区域流量和恢复时间。大量小对象会增加 List/Get 请求与元数据成本，适合先打包成顺序 shard；对失败请求使用有上限的指数退避，并把 4xx 权限错误与 5xx 暂时性错误分开告警。

### 块存储提供文件系统或数据库的底层卷

块设备需要上层文件系统，适合单节点 Cache、数据库、Registry Metadata。ReadWriteOnce 卷不能自动服务大量训练节点；共享块需 Cluster Filesystem 和一致性设计。

块存储只保证卷级读写，不替应用处理并发一致性、快照语义或文件锁。把同一卷挂到多个节点前，必须确认访问模式和文件系统支持；否则一个节点的缓存或 Journal 可能让其他节点读到不一致状态。对于本地 NVMe 或云卷，还应把 IOPS、队列深度和 Burst Credit 纳入验收。

### 选择矩阵从访问模式而不是产品品牌开始

| 需求 | 候选方向 |
|---|---|
| 大对象、低成本、生命周期 | 对象存储 |
| POSIX、多节点共享训练 | 并行/分布式文件系统 |
| 节点高速临时 Cache | Local NVMe |
| Registry/Metadata Database | 可靠块存储 |
| Checkpoint 长期归档 | 对象加版本/不可变策略 |

混合使用很常见，关键是定义对象在哪层是 Source of Truth、何时复制和失败如何恢复。

## 第 43 章 · 本地 NVMe Cache 与数据预热

### Local NVMe 把共享存储延迟换成节点容量

热点 Dataset、Model 和编译 Cache 放本地 NVMe，可减少网络与后端压力。节点故障或重调度会丢 Cache，所以 Source of Truth 仍在共享/对象层。

缓存层要定义填充、校验、淘汰和故障后的重建契约。作业启动时若多个 Worker 同时发现 Miss，应使用单飞锁或节点级下载队列，避免同一 shard 被重复拉取；重建期间则应限制回源并发，让训练以可预测的降级速度继续。

### Cache Key 必须包含内容版本

版本字段还应包含解码器或 Engine 构建版本；同名文件在软件升级后可能产生不同缓存结果。下载完成前写入临时文件，校验通过后再 Rename，并在缓存索引中记录大小、Checksum、来源和生成时间。
只按文件名缓存会在 Dataset/Model 更新后读取旧内容。Key 使用 Content Hash、Dataset Revision 或 Immutable URI；下载后校验 Checksum，原子 Rename 后标记 Ready。

### 预热任务要防止回源风暴

预热控制器应按 Rack 或租户设置并发配额，支持暂停、取消和失败重试。业务作业要能看到 Ready、Progress 和 Error 状态，不能因为预热永远等待而占住 GPU；在超过预算后应明确降级为按需回源。
大批节点同时加入或模型发布时，限制并发、分层 Peer/Registry Cache 或按 Rack 错峰。预热进度、带宽、失败和 Cache Hit 可观测；业务 Job 可选择等待 Ready 或回源降级。

### 淘汰按工作集和重建成本而非简单 LRU

淘汰前先保护正在使用或正在上传的对象，并设置最小可用水位。将 Cache Eviction 与训练失败、下载时长和后端流量关联，才能判断更复杂的成本函数是否真的优于简单 LRU。
大模型权重下载/Engine 构建成本高，小 Dataset 访问频繁。策略可结合 Size、Frequency、Last Access、Tenant Quota 和 Rebuild Cost。保留磁盘水位，避免 Cache 占满影响 Kubelet/Runtime。

### NVMe 健康进入 GPU 节点生命周期

发现介质错误、温度异常或延迟持续离群时，应先停止把该节点作为缓存源，再排空新作业并执行数据同步或盘更换。把本地盘标记为不可调度并不等于数据已安全，必须确认共享层存在完整副本。
观察 SMART、Media Error、Temperature、Wear、Available Spare、Latency 和 Filesystem Error。Cache 盘故障可重建但会拖慢 GPU；本地 Checkpoint 若未同步则可能丢进度。

## 第 44 章 · Checkpoint 一致性与恢复

### 分布式 Checkpoint 由多个分片和 Metadata 组成

每 Rank 写 Parameter/Optimizer Shard，最后提交 Manifest 表示完整。不能以某些文件存在判成功。Manifest 包含 World Size、Framework Version、Model Revision、Step、Checksum 和分片列表。

### 临时目录加原子提交避免读取半成品

提交协议要定义超时和清理者：写入进程失败后，后台任务清理孤儿临时对象；恢复程序只接受带有合法 Manifest 和校验结果的版本。对象存储上用不可变 Generation 加指针更新，避免依赖并不存在的目录原子性。
写入临时 Prefix，所有分片完成并校验后写 Commit Marker 或原子 Rename。对象存储没有目录 Rename 时，使用 Manifest/Version Pointer。恢复只读取已提交 Generation。

### Checkpoint Retention 平衡 RPO 与容量

保留最近 N 个、每日/每周里程碑和最终模型，失败/未提交临时对象按 TTL 清理。删除受训练 Job/审计保护，避免自动生命周期删掉唯一可恢复点。

Retention 应由恢复目标驱动：短周期 checkpoint 降低 RPO，却会产生更多同步写和容量增长；长周期 checkpoint 节省空间，但故障后重算时间更长。保留策略变更要先计算预计满盘时间，并在删除前确认至少存在一个跨故障域且可加载的提交版本。

### 恢复测试覆盖不同 World Size 和软件版本

每次测试记录 Checkpoint 格式、目标 GPU 数、并行策略、显存峰值和恢复后的第一个有效 Step。若只在相同 World Size、相同镜像上测试，无法发现 Reshard、参数命名或库版本变化带来的恢复失败。
如果框架承诺 Reshard/Elastic Restore，测试从不同 GPU 数恢复；升级 Framework 前验证旧 Checkpoint。记录 Load Time、重新分片 Memory 峰值和恢复后数值连续。

### Checkpoint 不应让所有 Rank 同时阻塞共享存储

同步写入时应限制同时写入的 Job 数，必要时使用聚合器或节点本地缓冲。异步方案必须说明“写完本地”与“跨故障域持久化”的区别，并据此计算实际 RPO，而不是把后台上传尚未完成的文件报告为成功。
异步/分层 Checkpoint 可先写 Node Local，再后台上传，但节点故障前未上传会影响 RPO。控制并发、聚合写或错峰，测量对 Step Time 和后端的影响。

## 第 45 章 · GPUDirect Storage 数据路径

### 传统路径由 CPU 和 Host Memory 中转

```text
Storage -> NIC or NVMe -> Host Memory -> CPU orchestration -> GPU Memory
```

Host Memory Copy、CPU 和 PCIe 路径可能成为瓶颈。OS Page Cache 对重复读取有价值，因此传统路径不一定差。

### GDS 建立 Storage DMA 到 GPU Memory 的更直接路径

```text
Storage -> NIC or NVMe -> PCIe DMA Path -> GPU Memory
```

GDS 使用 `cuFile` 等软件和受支持的 Driver/Filesystem/Storage，把数据更直接送入 GPU Buffer，减少 CPU Copy。它不绕过所有 CPU 控制，也不保证任何文件系统自动加速。

### GDS 前提链必须逐层验证

- 支持的 GPU、Driver 和 CUDA/cuFile；
- 支持的 Filesystem/Block/NVMe/NVMe-oF；
- Kernel Module 和 Peer Memory/DMA 路径；
- GPU 与 NVMe/NIC PCIe 拓扑；
- 文件对齐、Direct I/O 和 Buffer 条件；
- 容器 Device/Mount/Permission；
- Storage Vendor 支持矩阵。

### Compatibility Mode 可回退但性能语义不同

不支持直达时，Library 可能回退到传统路径。应用能读成功不证明 GDS 生效。检查 GDS Status/Log、CPU 使用、Host Copy 和对照基准。

回退应被视为一种显式运行状态，而不是静默成功。将 direct、compatibility 和 error 作为指标或启动日志字段，结合 GPU 空洞、CPU 利用率和每批读取耗时告警；否则驱动升级后性能下降容易被误认为模型或网络变化。

### GDS 测试按文件大小、块大小和并发覆盖

测试矩阵至少覆盖小块随机读、大块顺序读、单 GPU 和多 GPU，并固定文件系统、缓存状态和 CPU 亲和性。记录 `cuFile` 错误、Fallback 次数和 PCIe/Storage 链路计数，避免把缓存命中或拓扑差异误判为 GDS 收益。
小 I/O 可能由固定开销主导，大顺序 I/O 更接近带宽；多 GPU 并发暴露 PCIe/Storage 争用。比较 Buffered/Direct/GDS，记录 CPU、GPU、Storage 和错误。

## 第 46 章 · NVMe over Fabrics 与 Storage Network

### NVMe-oF 把远端 NVMe 作为低延迟块设备访问

Transport 可基于 RDMA 或 TCP。它提供块语义，仍需 Filesystem/Volume Manager 和多路径。与训练 RDMA 网络共享时，存储和 NCCL 流量可能争用。

### Multipath 提供路径冗余但需验证故障收敛

双 Port/双 Fabric 不等于自动无损切换。测试单路径断开、IO Timeout、重连、应用错误和恢复性能；设置过长超时会让训练长时间 Hang。

验收时要记录从链路断开到 I/O 恢复的时间，以及恢复期间应用看到的错误类型。路径状态、控制器会话和文件系统错误应使用同一时间戳关联；若切换依赖人工重新挂载，就不能把该方案描述为对训练透明的高可用。

### 存储网络和计算网络可隔离或共享

若共享 fabric，需为存储突发和集合通信定义 QoS、带宽保底与拥塞告警，并测试两者同时达到峰值的场景。若隔离 fabric，则要核对额外网卡、交换机、布线和故障切换成本，避免只在性能表上比较两种设计。
隔离提高可预测性和故障域清晰，成本更高；共享提高利用率，但需 QoS、容量和故障测试。Checkpoint Burst 与 AllReduce 同时发生是必须覆盖的最坏组合。

### DPU 可卸载 NVMe-oF、虚拟交换和安全

DPU 有独立处理核、网络接口和加速引擎，可运行 Storage Initiator/Target、Virtual Switch、Encryption 和 Telemetry，减少 Host CPU 工作。但 DPU 本身引入 Firmware、OS、管理和故障域。

## 第 47 章 · DPU、SmartNIC 与基础设施卸载

### SmartNIC 和 DPU 的可编程深度不同

SmartNIC 通常卸载网络数据面，DPU 强调独立 CPU/Memory/OS 与更多网络、存储、安全服务。产品命名并不统一，选型看实际可运行功能、隔离和支持，而不只看标签。

评审规格时分别确认数据面可编程性、控制面生命周期和 Host 到设备的管理接口。一个只支持固定 offload 的 SmartNIC 不能替代需要策略编排、租户隔离或 NVMe-oF 终止的 DPU；反过来，DPU 的独立软件栈也会增加补丁、监控和回滚工作量。

### DPU 把基础设施服务移出 Host 信任域

在 DPU 上运行 vSwitch、Firewall、Storage 和 Telemetry，可让租户 Host/VM 难以篡改基础设施策略，适合零信任和裸金属多租户。但管理面凭据和 DPU OS 更新成为关键安全资产。

### DOCA 等 SDK 提供 DPU 加速接口

应用/平台可用厂商 SDK 调用 DMA、Flow、Crypto、Storage 等能力。Driver、Firmware、DPU OS 和 Host Library 必须按支持矩阵。平台不需要自研 DPU 程序也要能监控版本和服务健康。

SDK 集成应先固定一个可回滚的版本组合，再分别验证主机驱动加载、DPU 服务启动、数据面连通和重启后的状态恢复。不要只检查库能否导入；生产门禁还要覆盖 DPU 重启、Host 重启、升级失败和管理网络不可达时的恢复路径。

### DPU 故障可能同时影响网络和存储

故障域图应标出每个 DPU 承载的 NIC、Storage Path、虚拟交换和安全策略。维护时验证 Host 仍可通过旁路管理进入，并确认双 DPU 切换不会让已有挂载进入长时间重试；否则一次 DPU 重启可能同时造成训练通信和 checkpoint 失败。
一个 DPU 承载 NIC、vSwitch 和 Storage Path 时，故障爆炸半径大于普通 NIC。设计双 Port/双 DPU、管理旁路和 Host Recovery；监控 DPU CPU/Memory/Temperature/Link/Service。

### 卸载收益用 Host CPU 和端到端性能共同验证

对照组必须使用相同模型、数据和网络负载，只切换卸载开关。若 Host CPU 降低但 GPU Step 未改善，收益可能被存储或网络尾延迟抵消；应把节省的 CPU 核数、单位任务时间和故障恢复复杂度一起计入总成本。
DPU 可能降低 Host CPU、提高隔离，但增加一次转发或控制复杂性。比较 Host CPU Core、Network/Storage Throughput、Latency、GPU Step 和故障恢复，不以“功能已卸载”作为收益结论。

## 第 48 章 · 功耗、供电与机架密度

### 节点功耗由完整系统共同构成

GPU、CPU、Memory、NIC/DPU、NVMe、Fan 和 PSU Loss 都计入。不同训练阶段功耗波动，多节点同步可能形成机架级同时峰值。

容量规划至少保留平均、短时峰值和故障降级三种口径。GPU 读数只代表加速卡，不等于 PDU 入口功耗；应以节点 BMC 或机架 PDU 的时间序列校准 GPU、CPU 和冷却系统的合计，并把启动浪涌与批量重启纳入供电测试。

### PSU 冗余要在失去一路后仍覆盖允许负载

2N、N+1 或其他方案必须按实际供电路径验证。失去一路后若系统自动降 Power Limit，应把降级性能和业务限制写入设计。

冗余检查不能只看电源数量，还要确认两路是否接在独立 PDU、UPS 和配电路径上。演练时逐路断开并观察 PSU 告警、节点是否重启、功率限制是否改变，以及训练作业是否需要迁移；这些结果应形成可执行的故障处置阈值。

### Rack Density 受 PDU、线缆、网络和冷却共同限制

机架设计应同时给出满载功率、配电余量、液冷接口数量、网络上联和维护通道。任何一项不足都会降低可用 GPU 数；例如线缆弯曲半径或 Manifold 维护空间不足，可能使理论容量无法安全上线。
机架理论 U 位装得下，不代表电力、液冷 Manifold、光纤和维护空间足够。高密 GPU 节点还需考虑重量、气流方向和更换部件的 Service Clearance。

### 功率限制可以作为容量管理工具

功率策略应按 Job 类型和机架余量配置，并设置回滚条件。功率限制改变时钟和完成时间，必须在代表性训练与推理负载上测量，而不是用单个微基准推断整体收益。
在相同机架电力下，适度降低单卡 Limit 可能部署更多 GPU，提高总体吞吐；也可能拉长单 Job。用 Throughput per Watt、Job Completion 和 SLA 找最优，不追求每卡最大功耗。

## 第 49 章 · 风冷、液冷与热管理

### 风冷能力取决于进风、压差和风道

验收应在目标环境温度、过滤器状态和相邻机架负载下进行。风道问题通常表现为同一型号节点按机架位置出现温度、时钟和吞吐梯度，应优先修复气流而不是为个别节点永久降低功率。
冷/热通道、Blanking Panel、线缆阻挡和 Filter 都影响。观察 GPU Inlet/Temperature、Fan、Clock 与机架位置，识别顶部/末端热点。

### Direct-to-Chip 液冷把热量送到冷却液

Cold Plate、CDU、Manifold、Quick Disconnect、Flow/Pressure/Temperature 和 Leak Detection 构成系统。GPU 温度正常不代表液冷健康，需监控流量和供回水。

液冷监控应同时覆盖设施侧和节点侧：设施侧看 CDU 泵、供回水温差、压力和泄漏，节点侧看 GPU 温度、时钟和功率。流量下降但芯片温度暂时正常时仍应进入预警，因为热惯性可能掩盖即将发生的降频或保护关机。

### 液冷故障要与计算平台联动降载

联动动作要有明确状态机：预警时限制新作业，严重告警时迁移或停止受影响节点，恢复后经温度和流量稳定检查才解除隔离。设施控制器不可达时应采用保守策略，避免平台继续调度高功率负载。
流量下降、漏液告警或 CDU 故障时，平台可阻止新 Job、降低 Power 或 Drain 故障域。动作阈值由设施和硬件团队定义，不能等 GPU Thermal Shutdown 才响应。

### 热稳态验收需要持续 Burn-in

Burn-in 不能只跑几分钟的峰值 Kernel；应覆盖持续训练、Checkpoint、网络突发和节点相邻满载等阶段。验收记录温度、时钟、功率、流量和告警的稳定区间，并保留停止条件和环境参数，保证后续回归可复现。
运行到温度、风扇/流量和 Clock 稳定，覆盖相邻节点满载和最差环境。通过要求无持续 Thermal Throttle、性能在基线、设施告警正常。

## 第 50 章 · 存储可观测性与故障排查

### Client、Network、Server 和 Backend 分层观察

Client 看 Read/Write/Latency/Retry；Network 看 Throughput/Drop/Congestion；Metadata/Data Server 看 CPU/Queue/Cache；Disk/Object Backend 看 Media/Capacity。应用只看到慢，需要跨层定位。

排查应先用作业时间线确定慢发生在打开文件、数据读取还是提交写入，再沿四层逐步收窄。每层至少保存请求时间、节点或租户、错误码和重试次数；只有同一请求在相邻层出现对应延迟或错误，才把根因升级到该层。

### GPU Idle 与 Storage Slow 用时间关联证明

关联窗口应包含正常基线、异常开始、处置动作和恢复四个阶段。若 Storage P99 上升但 GPU 仍满载，根因可能在计算或缓存；若 GPU 空洞先出现，不能倒置时间顺序把存储当成根因。
同一窗口出现 DataLoader Wait 上升、Storage P99 增长、GPU 空洞和 Step Time 增长；回滚/Cache 命中后恢复，才能形成证据。单次 `iostat` 高不能证明共享存储根因。

### Checkpoint Hang 检查最慢 Rank 和提交阶段

为每个 Rank 记录写入开始、最后一个分片、Manifest 和持久化确认时间，可区分慢盘、元数据提交和 Barrier 等待。超过阈值后先采集现场证据再重启 Job，避免清理动作删除唯一的失败上下文。
记录每 Rank Bytes/Duration、临时对象、Manifest/Commit、Storage Error 和 Barrier。某 Rank 写慢会让全 Job 等待；部分文件成功不能删除重试证据。

### ENOSPC、Quota 和 Inode Exhaustion 分别判断

后端物理容量、租户 Quota、文件系统 Inode/Metadata 和 Node Local Disk 都可能返回空间问题。采集 Mount、Path、Quota、Inode、Pod Ephemeral Storage 和后端水位。

三类错误的处置不同：物理容量不足需要扩容或清理，Quota 需要租户配额调整，Inode 耗尽则应减少小文件或迁移目录。不要用删除任意大文件来处理 Inode 告警，也不要把对象存储的 5xx 重试当成 ENOSPC；错误码、挂载点和后端水位必须同时记录。

### Storage Error 后验证数据完整性

网络恢复不代表文件完整。对 Dataset/Model/Checkpoint 做 Checksum、Manifest 和可加载验证；损坏制品隔离，避免其他 Job 继续消费。

恢复流程应先冻结受影响版本的发布，再从可信副本重新复制并重新计算校验。Checkpoint 除了校验分片，还要执行一次最小模型加载或恢复演练，确认参数、优化器和训练步数都能被框架接受；仅仅 `ls` 到文件不构成完整性证据。

## 第 51 章 · 存储与设施验收矩阵

### 数据集读取验收覆盖冷缓存和热缓存

固定 Dataset/Shard/Worker/GPU 数，分别清晰声明 Cold/Hot，记录后端/本地吞吐、Open P99、CPU 和 GPU Idle。不要用无法复现的 OS Cache 状态比较。

每个场景至少重复多次并记录缓存清理方式、预热时长和失败重试。报告应同时给出单节点与多节点结果，区分后端总吞吐是否增长以及单 Job 的 Step Time 是否真正缩短。

### Checkpoint 验收覆盖并发写、保留和恢复

验收矩阵应包含单 Job、大规模并发 Job、空间接近阈值和后端短暂错误四类场景。每类都检查提交可见性、临时对象清理、保留规则和恢复时间，并确认其他训练 Job 的 Step Time 没有超出预算。
多个目标规模 Job 同时写，观察 Burst、Tail 和其他训练影响；验证 Lifecycle 不删除活跃版本；随机选 Generation 完整恢复。

### GDS 验收包含直达确认和回退对照

验收报告需保存驱动、CUDA/cuFile、文件系统和拓扑信息。若直达不可用，应明确记录回退原因和对业务吞吐的影响，不能把“读取成功”作为通过条件。
检查支持状态、Direct Path Log，比较传统/GDS 的 Throughput、CPU、GPU Pipeline。失败时确认是显式失败还是 Compatibility Fallback。

### DPU 验收覆盖卸载功能和控制面故障

除功能开关外，测试还要覆盖 DPU OS/固件升级、服务重启、Host 重启、管理网络中断和双路径切换。验收通过的前提是业务数据面可观测、故障能告警且有不依赖业务网络的恢复入口。
验证 Network/Storage/Security Function、Host CPU 收益、DPU Reboot/Upgrade、双路径切换、Telemetry 和 Out-of-Band Recovery。

### 供电散热验收在完整机架负载执行

执行前锁定最大允许温度、功率和流量，并安排设施人员现场确认。测试结果应关联节点降频、作业失败和恢复时间；任何超出停止条件的情况都应中止，而不是为了得到“满载数字”继续运行。
测节点/机架 Power、PDU 冗余切换、持续 Clock、进风/回风或供回水、风扇/流量和告警联动。测试涉及满载和设施切换，必须由数据中心审批并设置停止条件。

### 最终报告连接 I/O 与 GPU 业务吞吐

报告至少给出测试配置、缓存状态、并发度、故障注入、原始指标和结论边界。把 `fio`、存储 P99、GPU 利用率、Step Time、Checkpoint RTO 和功率放在同一张时间线上，读者才能判断基础设施指标是否转化为业务收益。
存储数字最终关联训练 Step、GPU Idle、Checkpoint RPO/RTO 和模型加载；设施数字关联持续 Clock、吞吐和可用 GPU。只交 `fio`/PDU 截图不能证明 AI 平台目标。

## 第 52 章 · AI 存储日常检查清单

### 后端容量和租户可写空间

Physical/Usable/Quota/Inode/Snapshot/Erasure Coding、增长和预计满时间。Checkpoint 目标 Prefix 实际写测试。

检查结果要落到租户和具体路径，而不是只报存储集群总量。对即将执行的 checkpoint 目标做一个带清理的最小写入测试，确认凭据、权限、配额和生命周期规则都可用，并把预计满时间与训练保留策略一起评审。

### Metadata 和 Data Path 分开观察

Metadata 侧重点是目录操作、锁、队列和服务 CPU；Data Path 侧重点是读写字节、IOPS、队列深度和设备延迟。两侧都正常而 GPU 仍空转时，再检查 DataLoader 解码、CPU 亲和性和 H2D 拷贝，避免把所有问题归给存储。
Open/Stat/Create P99、Metadata CPU/Queue；Read/Write Throughput/IOPS/Latency。带宽低可能是 Metadata 饱和。

### Client Error 和 Retry 按节点分布

按节点、Rack、租户和时间窗口绘制错误热图，区分单客户端离群与全局故障。重试次数应与请求量一起看；重试率上升但错误总量不变，仍可能显著放大后端负载和尾延迟。
Timeout/Stale/Reset/Retry、Mount/Session，找单 Client、Rack 或全局。平均后端健康不掩盖客户端离群。

### Dataset Cache 命中和水位

Hit/Miss/Eviction/Fill/Checksum、NVMe Capacity/Wear，模型/数据版本和租户份额。冷启动回源容量。

命中率下降应结合版本发布、节点重启和淘汰事件解释；单看平均命中率无法发现某个 Rack 的缓存失效。水位接近阈值时应提前降速预热或淘汰低价值内容，避免运行时突然触发磁盘满和 Kubelet 驱逐。

### DataLoader 与 GPU 空洞关联

把 Batch Ready、Worker 队列、解码 CPU、H2D 拷贝和 GPU Kernel 放在同一 Rank 时间轴上。只有 Batch Ready 落后且存储或解码指标同步异常时，才将空洞归因于数据流水线；否则应转向通信或模型侧分析。
Batch Ready、Worker CPU/Memory、Storage P99、H2D 和 GPU Idle，同 Step/Rank 时间轴。

### Checkpoint 成功、耗时和可恢复

Shard/Manifest/Checksum/Durable、Write P95、RPO/RTO、最近恢复演练。文件存在不算完整。

成功指标应区分“分片写完”“Manifest 提交”和“副本持久化”三个阶段。任何阶段失败都保留 attempt、错误码和清理结果；定期从最近版本执行恢复并测量到首个可计算 step 的时间，才能校准 RPO/RTO。

### Model/Engine 加载和发布

发布流程应先验证制品 Digest 和依赖版本，再在少量节点完成下载、加载和 Warmup，最后扩大范围。扩容节点的冷启动时间和缓存命中率要单独记录，否则线上延迟可能被误算为模型本身变慢。
Registry/Object Error、Download/Checksum、Cache、Load/Warmup、版本/Digest。扩容冷节点样本。

### GDS 直达状态和回退

日常检查把直达状态、Fallback 原因、CPU Copy 时间和 GPU 空洞关联起来。驱动、内核或挂载变更后自动执行一组小规模对照测试，发现状态从 Direct 变为 Compatibility 时及时阻止大规模作业。
Driver/cuFile/Filesystem、Topology、Direct/Fallback Log、CPU/Throughput。应用成功不代表直达。

### NVMe-oF 路径和多路径

Controller/Namespace/Path State、Latency/Error/Failover，训练网络共享时 QoS/Counter。

路径检查应覆盖控制器会话、Namespace 映射和文件系统挂载三层。发现一条路径长期重试或延迟离群时，先将节点从新作业中排空，再做断链演练，避免在线训练同时遭遇路径抖动和 NCCL 拥塞。

### DPU 服务和资源

DPU 的 CPU、内存和温度达到阈值时，基础设施服务可能先于 Host 应用受影响。检查服务版本、重启次数、链路状态和管理面可达性，并为每个服务标注负责人和回滚动作。
DPU OS/Firmware、CPU/Memory/Temperature、Network/Storage/Security Service、HA 和 Host 可达。

### 机架功率和冗余

同时记录节点功率、PDU 入口、两路 Feed 和剩余 Headroom，观察训练同步峰值与批量重启峰值。一路失效后的降级功率和可运行 GPU 数应成为容量看板中的独立指标。
PDU/Feed/PSU、Current/Peak/Headroom、一路失效容量，GPU Power Limit/Clock 关联。

### 冷却和热稳态

按机架位置展示温度、时钟、风扇或流量异常，寻找持续热点和冷热通道偏差。设施告警恢复后不要立即解除节点隔离，先确认热指标回到基线并完成短时 Burn-in。
进风/回风或供回水、Flow/Pressure/Leak、GPU Temperature/Fan/Clock/Throttle，Rack 位置分布。

### 维护与变更标记

Storage Firmware/Network/QoS/Cache/CDU/PDU 变更显示在训练时间线，完成关联读写/故障恢复回归。

变更记录至少包含影响范围、开始结束时间、版本或配置差异、回滚入口和验证 Job。将变更窗口与 GPU Idle、Step Time、Checkpoint 错误和设施告警对齐，可快速区分真实回归与正常工作负载波动。

## 第 53 章 · 裸机 GPU 平台的系统边界

### 裸机把完整节点交给 OS 和作业调度器

裸机没有 Hypervisor 设备虚拟化层，Driver、Fabric Manager、OFED 和 GPU/NIC 拓扑直接由 Host OS 管理。它适合整节点多 GPU 训练、低层 Benchmark 和需要稳定互连的任务。

裸机仍需 Provisioning、Configuration、Identity、Scheduler、Container、Monitoring 和 Lifecycle。没有 Kubernetes 不等于人工 SSH 运行就是平台。

### Login、Controller、Compute 和 Service 节点职责分开

| 节点角色 | 主要职责 | 不应承担 |
|---|---|---|
| Login | 用户提交、轻量编译、数据入口 | 长时间 GPU 计算 |
| Controller | Scheduler State、Queue | 用户任意任务 |
| Compute | GPU Job 执行 | 持久控制面数据 |
| Service | Registry、Monitoring、Metadata | 与训练争抢 GPU Fabric |
| Management | Provisioning、BMC、Firmware | 业务数据流 |

角色网络、权限和 HA 分别设计。Controller 故障应尽量不破坏已运行 Job，但会影响新调度和状态更新。

### 整节点分配简化拓扑和故障域

8 GPU NVSwitch 节点作为不可拆 Allocation，训练获得完整 GPU/NIC/CPU Locality，减少碎片；代价是小 Job 浪费。平台可设置整节点训练 Partition 和共享/小卡 Partition。

整节点策略应同时决定 CPU、内存、HCA 和本地盘的归属，不能只隐藏 GPU 设备。运营上分别统计节点利用率与节点内 GPU 利用率，用 Backfill 或共享分区吸收小作业碎片；节点故障按整节点作为最小隔离单元处理。

### 裸机租户隔离弱于 VM

不同用户作业在同一 Kernel 上运行，依赖 Unix Account、Cgroup、Scheduler 和 Container。高安全域使用专用节点/Partition、VM Passthrough 或物理隔离，不把普通容器当强隔离。

## 第 54 章 · 节点自动供应与配置

### Provisioning 从 BMC 资产到可调度节点

```mermaid
flowchart LR
    A[Asset and BMC] --> B[BIOS Firmware Baseline]
    B --> C[PXE or Image Provision]
    C --> D[OS and Kernel]
    D --> E[Driver Fabric OFED]
    E --> F[Slurm and Container]
    F --> G[Health and Benchmark]
    G --> H[Resume Node]
```

每阶段写 CMDB/状态，失败节点保持 Drain。重新装机后 GPU UUID/BDF、NIC GUID 和拓扑与资产对账。

### Redfish/BMC 管 Out-of-Band 生命周期

读取 Sensor、Power、SEL、Firmware 和执行受控 Power Cycle。BMC 网络独立、凭据最小化、操作审计。Power Cycle 是破坏动作，只在节点已 Drain 且证据保存后执行。

将 BMC 操作分成只读盘点、非破坏变更和破坏性动作三类。电源循环或重装前记录操作者、目标、原因和回滚方式；BMC 事件与 Node 状态、GPU UUID、维护 Incident 关联。BMC 证据能说明硬件或电源异常，但不能替代 OS、驱动和 RDMA 检查。

### BIOS Profile 决定性能与拓扑稳定性

NUMA、SMT、Power Profile、PCIe Gen/Bifurcation、IOMMU、Above 4G 等会影响 GPU/NIC。使用 OEM 验证 Profile，配置漂移检测；变更后重建 Topology/Performance Baseline。

Profile 应按硬件 SKU 版本化。变更后保存 `lspci`、`nvidia-smi topo -m`、NUMA/HCA 绑定和 P2P/NCCL 基线；发现链路降级或拓扑变化先隔离节点，不要让配置管理覆盖现场。

### OS Image 固定 Kernel、Package Source 和安全基线

Immutable/Reproducible Image 减少节点差异。安全补丁先构建新 Image/Driver 组合，Canary 重装，不在节点长期手工修改。紧急修复最终回写 Image。

节点 Manifest 至少包含 Image Digest、Kernel、Driver、OFED、Fabric Manager、Slurm 客户端和时钟/认证配置。升级按故障域滚动，回滚条件覆盖 GPU 枚举、RDMA、容器启动和短时训练，而不只是 SSH 可用。

### 配置管理只管理声明而不掩盖节点故障

Ansible 等保证配置一致；控制器反复修复 Driver/Network 可能覆盖首错。硬件/Driver 异常先隔离与采证，配置漂移再自动收敛。

收敛前区分 Drift、服务故障和硬件故障，保存内核日志、GPU/XID、链路状态及调度 Reason。Drain/Down 节点不能由配置系统直接改回可调度，恢复须经过健康检查、业务验证和审批。

## 第 55 章 · Slurm 控制面与资源模型

### slurmctld、slurmd 和数据库分工

`slurmctld` 管调度/状态，Compute 上 `slurmd` 启动作业，`slurmdbd`/数据库保存 Accounting。认证服务和时钟是基础依赖。Controller HA 需要共享/同步状态和故障切换测试。

### Partition 组织策略相同的节点集合

按 GPU SKU、Fabric、共享模式、优先级和维护边界分 Partition。节点可属于多个 Partition，但策略重叠要清晰。名称不能只写 `gpu`，用户需要知道显存/互连/SLA。

Partition 是调度与服务等级的边界，不只是标签。为每个分区定义允许的 GPU Type、最大 Walltime、抢占规则、维护 Owner 和拓扑约束；节点同时属于多个分区时，明确优先级和资源是否可重复计数。

### Account、User 和 QOS 表达组织与服务等级

Association 把用户放入 Account，QOS 定义 Priority、Max/Grp TRES、Walltime 和 Preemption。LDAP/IAM 管身份，Slurm Accounting 管资源授权，两边 Join/Leave 自动同步。

### TRES 统一核算 CPU、Memory、GPU 和 Billing

Trackable RESource 可记录 `gres/gpu`、Energy 等。Billing Weight 可反映不同 GPU 成本。定义变更会影响历史报表，版本化并说明生效时间。

TRES 配置要和 GRES、Accounting、QOS 一起验收：申请值、分配值、作业步用量和账单单位必须从同一 Job ID 追溯。新增 GPU Type 或调整 Billing Weight 时保留旧版本及生效时间，避免历史成本被静默重算。

## 第 56 章 · GRES 与 GPU 发现

### GRES 配置把物理 GPU 映射到 Slurm 资源

`gres.conf`/自动发现描述 Name、Type、File、Cores、Links 等。配置与实际 Device 不一致会让 Node Invalid/Drain，或分配错误 GPU。

```text
AutoDetect=nvml
Name=gpu Type=example File=/dev/nvidia0
```

仅为语义示意，生产用当前 Slurm/NVML 支持格式并从实际节点生成。

### GPU Type 提供 SKU 选择但要规范命名

型号字符串可能含空格、代际和显存差异。平台定义稳定 Type Alias，与 CMDB/GPU UUID 映射。用户请求 Type，Accounting 保存物理型号。

Alias 应表达显存、互连或 MIG 等能力边界，而不是直接暴露驱动显示名；变更需兼容旧脚本并记录生效时间。排障同时保留 Alias、实际型号、GPU UUID、PCI Bus ID 和节点，避免同名卡能力不一致。

### CUDA_VISIBLE_DEVICES 由作业步骤分配生成

Slurm 为 Job Step 设置可见 GPU，容器/应用内 `cuda:0` 是分配集合第一个。日志记录 `SLURM_JOB_ID`、Local Rank、Visible Device 和 UUID。

### Cgroup 限制防止访问未分配设备

只设置环境变量不是安全隔离，进程可绕过。启用 Slurm Cgroup Device Constrain，并验证容器 Device Namespace。升级 Cgroup v1/v2 后回归。

在 Allocation 内外做正负测试：作业内只能打开分配设备，未分配 GPU 即使知道 `/dev/nvidia*` 也不能访问，作业结束后设备归还。将宿主机、Slurm Step 和容器内可见列表与 UUID 对照；发现泄漏立即 Drain 并保留 Job、UID、设备节点和时间线。

### MIG GRES 需要实例级发现和 Accounting

MIG Instance 以独立设备资源暴露，Profile/UUID 变化影响配置。节点重配前 Drain，刷新 GRES，验证 Resource Count 和 Job 可见；Accounting 同时关联 Parent GPU。

## 第 57 章 · 作业提交、Step 和进程启动

### sbatch、srun 和 Job Step 解决不同层次

`sbatch` 提交批作业，Allocation 获得节点/资源；`srun` 在 Allocation 内启动并管理 Task/Step。直接 SSH 到 Compute 启动进程会绕过资源和 Accounting，应由 PAM/策略限制。

批脚本负责声明资源、环境和退出处理，`srun` 负责把进程放入正确的 Job Step 与 Cgroup。多步作业要区分 Step 与 Job 退出码；诊断命令也应在 Allocation 内执行，避免 Login Node 的结果混入证据。

### 多节点训练要统一 Node、Task 和 GPU 维度

```text
Nodes x Tasks per Node x GPUs per Task
```

一 GPU 一进程时 Tasks/Node 常等于 GPUs/Node，但模型并行/多线程可能不同。Launcher 负责 Global/Local Rank、Master Address/Port 和每进程 CPU Binding。

### CPU Binding 与 GPU/NIC Affinity 联动

Slurm CPU/GPU Binding 按 Node Topology 设置，Rank 使用本地 CPU/Memory/HCA。验收输出 `taskset`、`numactl`、GPU UUID 和 NCCL HCA。错误 Bind 会让所有硬件健康但训练慢。

### Job Environment 必须可重复且可追溯

记录 Module/Container Digest、Driver、Environment、Code/Data/Model Revision 和命令。禁止用户依赖 Login Node 未版本化 Library。Scheduler Prolog 可写环境 Manifest。

### Walltime 帮助调度和故障恢复

准确 Walltime 便于 Backfill；过长降低调度机会，过短导致 Job 被终止。平台基于历史建议，应用在信号前 Checkpoint，延长需配额/审批。

建议值来自同模型、同 GPU Type、同规模历史 Elapsed，并为数据准备、Checkpoint 和恢复留余量。接近上限时发送提前信号，应用写入 Durable Checkpoint；复盘区分申请过长导致等待与申请过短导致重算。

## 第 58 章 · Enroot、Pyxis 与训练容器

### Enroot 提供面向 HPC 的非守护容器运行

镜像导入为本地格式，运行时集成 Host GPU Driver 和高速文件系统。相比 Docker Daemon，更适合多用户 HPC，但 Image Cache、Mount 和权限需治理。

Enroot 不提供资源调度或强隔离，GPU、CPU 和设备访问仍由 Slurm/Cgroup 控制。镜像导入失败时区分 Registry、缓存磁盘、解包和权限问题；把镜像 Digest、Cache 路径和 Mount 清单写入 Job Manifest。

### Pyxis 把容器生命周期接入 Slurm SPANK

用户在 `srun/sbatch` 指定 Image/Mount，Plugin 在分配节点准备容器。版本、配置和 Enroot Data/Cache Path 要一致；Plugin 错误可使 Node/Job 启动失败。

Pyxis 故障应保留 SPANK、Enroot、Slurm Step 和首个失败节点日志。升级 Plugin 时先在 Canary Partition 验证 GPU 可见性、UID/GID、网络、只读数据和 Checkpoint 写入，再滚动全量节点。

### Host Driver 与容器 CUDA 兼容规则仍然成立

容器不携带 Kernel Driver，Slurm 容器和 Kubernetes 容器共享相同兼容原则。节点 Driver Branch 不同会让同一 Image 在部分节点失败，因此 Partition 固定软件基线。

### Mount 白名单保护 Host 与租户数据

禁止任意 Mount `/`, `/dev` 或其他用户路径；提供 Dataset Read-Only、Checkpoint Write 和 Scratch 模板。Credential 通过短期文件/环境注入并审计。

### 镜像 Cache 需要容量和并发治理

大镜像首次导入占 Registry/Network/Local Disk。按节点池预热常用 Digest、限制并发、按 Content Hash 复用；Job Queue 区分等待资源和等待镜像。

## 第 59 章 · 队列、公平份额与 Backfill

### FIFO 不能满足多团队和不同规模作业

Priority 可综合 Age、Fairshare、Job Size、Partition、QOS。公式和权重透明，防止用户通过拆作业或报长 Walltime 操纵。

优先级只决定候选顺序，仍受资源形状、Reservation、依赖和 QOS 限制。运营报表应展示各因子贡献与预计启动时间；发现用户拆分作业或夸大 Walltime，应通过策略和配额纠正，而不是临时人工插队。

### Fairshare 根据历史使用调整优先级

团队长期超出份额，后续优先级下降；未使用团队可积累机会。Decay Half-Life 和层级 Account 影响体验。Dashboard 展示 Usage、Share 和 Priority 因子。

Fairshare 的衰减周期应与训练项目节奏匹配，并在变更前评估对现有队列的影响。Dashboard 同时展示已用 GPU Hour、目标份额、衰减后的因子和 QOS 限制，避免用户把低优先级误判为节点故障。

### Backfill 利用大作业前的空档

只要不延迟已保留的高优作业，短作业可提前运行。准确 Walltime 至关重要。Backfill 增加集群利用率，但不能打散大 Job 所需完整拓扑。

Backfill 评估的是“在保留窗口前能否完成”，不是简单填充任意空闲 GPU。对整节点、NVSwitch 或多 Rail 作业保留完整拓扑；错误的 Walltime 会让短作业占用本应可运行大作业的资源。

### Reservation 保护发布、维护和关键训练窗口

Reservation 指定 Node/Account/时间。过度预留造成 Idle，应有 Owner、到期和使用率复盘。维护 Reservation 与业务 Reservation 分开。

### Preemption 需要 Checkpoint 和 Grace Time

Suspend 可能仍占 GPU Memory，不一定能释放；Requeue/Kill 需应用 Checkpoint。按浪费 GPU Hour、恢复时间和高优 Job 等待决定策略。

抢占策略需明确通知信号、Grace Time、Checkpoint 位置、最大重试次数和坏节点排除。先在低优先级测试作业验证恢复，再对生产作业启用；把被抢占的 GPU Hour 与恢复耗时纳入公平性复盘。

## 第 60 章 · 拓扑感知与整组调度

### Slurm Topology 描述交换网络和节点位置

拓扑插件可让多节点 Job 尽量落在较近 Switch/Rack。配置从网络资产生成并检测漂移。它描述节点间，节点内 GPU/NIC 还需 GRES/Binding。

### Requested Nodes 的连续性不等于 GPU Fabric 最优

节点在同 Rack 仍可能使用不同 Rail/NIC Mapping。Job Prolog 生成 Rank-GPU-HCA Map，NCCL Test 基线按 Node Group 保存。

### 大作业碎片用 Drain/Reservation/Queue 策略治理

每节点零散空闲无法满足 64 GPU Job。可设置整节点分配、Backfill、预约或专用 Partition。为了整理碎片强杀作业前计算 Checkpoint 成本。

### Elastic Training 和固定 World Size 有不同调度边界

固定 World Size 必须完整资源后启动；Elastic 可增减 Worker，但框架、Optimizer、Checkpoint 和收敛需支持。Scheduler 不应仅因框架叫 Elastic 就随意回收 Rank。

## 第 61 章 · Prolog、Epilog 与节点健康

### Prolog 做快速准入而不是完整 Burn-in

检查预期 GPU 数、Driver/Fabric Ready、严重错误、临时目录和容器 Runtime。应在秒级/有限时间完成。长 DCGM Diagnostic 放节点上线流程。

### Prolog 失败将节点 Drain 并保留原因

避免 Scheduler 反复把 Job 放到坏节点。Reason 包含 Test、GPU UUID、Incident ID；自动恢复需通过验证，不直接 `scontrol resume`。

### Epilog 清理进程、IPC、MPS 和临时数据

异常作业可能留下 GPU Process、Shared Memory、MPS Server 或 Mount。先记录进程与错误，再按 Job Cgroup 清理；不要误杀其他 Allocation。

### 节点 Health Check 与业务健康分开

硬件 Check 通过但 Job 慢，可能是 Dataset/模型；业务 Job 失败但其他作业正常，优先应用。平台保存 Node Baseline 和 Job Manifest 进行对照。

## 第 62 章 · 训练作业失败处理

### Pending、Running Slow、Failed 和 Hung 分开分流

Pending 看 Priority/Resource/Reservation；Running Slow 看时间分解；Failed 保存 Exit/首错；Hung 看 Rank/Collective/Storage。一个统一“重跑”按钮会掩盖根因并浪费 GPU。

### 单 Rank 退出要终止或弹性恢复整个 Job

其余 Rank 可能卡在 NCCL。Launcher 捕获 Task Exit，向所有 Task 传播终止，保存每 Rank Log，并按 Retry Policy Requeue。无限 Retry 会重复硬件故障。

### Node Failure 与 Application Failure 用范围判断

同节点不同 Job 复发、XID/AER/Link Error 指向节点；相同镜像跨节点复发指向应用/软件。Slurm Job State/Reason、Node Log 和 GPU UUID 关联。

### OOM 不是自动扩更多 GPU 的充分条件

检查失败申请、Batch/Sequence、Allocator 和并行策略。请求更多 GPU 只有在应用能分片且通信收益合理时有效，否则只是增加 Data Parallel 副本。

### Retry 前验证 Checkpoint 和坏节点排除

新 Allocation 不包含故障节点；Checkpoint Manifest 完整；软件/数据版本一致。自动 Requeue 记录 Attempt、Excluded Node 和已消耗 GPU Hour。

## 第 63 章 · Accounting、效率与成本

### sacct 连接作业身份与资源消耗

保存 Job/Array/Step、Account、User、Partition、QOS、Elapsed、State、Exit、AllocTRES、NodeList 和 Energy/利用率扩展。敏感命令参数需脱敏。

### Allocated GPU Hour 不等于有效 GPU Hour

结合 DCGM Accounting/Job Stats，计算 Active、Idle in Allocation、Failed/Recomputed、Checkpoint。向团队展示浪费原因，不把硬件等待误判为用户懒惰。

### Job Efficiency 按工作负载类型解释

通信密集训练 GPU Utilization 可能低于单卡；CPU Preprocess 作业也可能合理。比较同模型/同规模基线和有效吞吐，不使用统一 80% 阈值处罚所有 Job。

### 项目配额连接 GPU 型号和服务等级

不同 GPU 成本/能力用 TRES Billing Weight 或独立 QOS。Quota 同时限制并发、累计 GPU Hour、Walltime 和高优作业，避免只限卡数。

## 第 64 章 · Slurm 与 Kubernetes 的协同边界

### 两套调度器不能同时管理同一空闲节点

若动态切换节点，必须有唯一 Ownership 状态机：Drain 当前 Scheduler、清空 Workload、重配 Agent/Runtime、验证资源，再交给另一方。两个 Agent 同时 Ready 会重复分配 GPU。

### 共享 Registry、Identity、Data 和 Telemetry

镜像 Digest、用户身份、Dataset/Model、DCGM 和 CMDB 可以统一。Job/Pod Label 映射共同成本中心，避免形成两套不可比较报表。

### 训练产物可由 Slurm 产生再由 Kubernetes 服务

Checkpoint 经评估转换成 Model/Engine，发布 Registry，再由推理平台部署。交接包含 Model Card、Tokenizer、Runtime、GPU Compatibility、质量和性能基线。

### 故障节点在两个平台保持统一隔离

CMDB/Node Health 是共同事实。Slurm Drain 的节点不能被 Kubernetes 节点池自动接管，维修通过统一 Acceptance 后再清除状态。

## 第 65 章 · 升级、维护与集群恢复

### Controller 和 Compute Node 分开升级

Slurm 协议有版本兼容窗口，先按官方路径升级 Controller/Database，再滚动 Compute，或相反取决于版本规则。不要假设任意跨版本兼容。

### Compute Node 维护按故障域分批

设置 Drain Reason/Reservation，等待或 Requeue 作业，升级 Image/Driver/Firmware，运行 GPU/NCCL/RDMA/Container Test，再 Resume。每 Rack 最大并发有限制。

### 调度状态和 Accounting Database 需要备份恢复

备份配置、State、Database、认证 Key，定期在隔离环境恢复。只备份数据库不保证 Controller 配置/版本可启动。

恢复演练要验证配置版本、State 保存目录、数据库 Schema、认证密钥和外部依赖的顺序，而不只检查备份文件存在。记录恢复到可接受调度状态的时间，并确认已运行作业、Accounting 和新提交行为符合预期。

### 控制面故障演练验证已运行作业行为

切换 Controller、短时 Database/Management Network 故障，观察 Running Job、新提交、Accounting 和恢复一致性。演练有审批和停止条件，不在关键训练窗口执行。

## 第 66 章 · 裸机 GPU 平台验收

### 节点验收从 Out-of-Band 到业务作业

检查 BMC/Sensor/Firmware、OS/Kernel/Driver、GPU/NVSwitch/NIC、Local NVMe、Slurm/GRES/Cgroup、Container、单卡/P2P/NCCL/RDMA，最后真实训练。

每一步产出带节点、时间和软件版本的证据包；任一层失败都保持 Drain，并标出阻断层。真实训练只用于验证端到端路径，不能替代前面的硬件与资源隔离检查。

### 调度验收覆盖正向与负向请求

正确 GPU Type/数量可调度；超 Quota、错误 Type、无权限 Partition 被拒绝；整节点/Topology 约束生效；作业结束设备归还；坏节点不再分配。

负向用例保存提交参数、拒绝原因和审计记录，正向用例保存 Allocation、GRES、Cgroup、Rank Map 与清理结果。验收通过条件是资源边界、错误提示和 Accounting 三者一致，而不是作业单次成功。

### 多租户验收覆盖设备和文件权限

用户不能访问未分配 GPU、其他 Job Process/Temp/Checkpoint；Container Mount 白名单有效；Accounting 归属正确；高优/QOS 只有授权用户可用。

### 性能验收固定 Binding 和 Rank Mapping

保存 Job Script、NodeList、Rank-GPU-HCA、CPU Binding、Image、NCCL Log 和网络 Counter。Scheduler 测试的结果可重复，不依赖用户手工 SSH 调优。

### 恢复验收从 Checkpoint 重启完整训练

故障一个 Task/Node，验证 Job 状态、节点 Drain、其他 Rank 终止、Checkpoint 完整、Requeue 排除坏节点和训练继续。记录检测、释放和恢复时间。

## 第 67 章 · Slurm GPU 日常运营清单

### Controller 和数据库健康

Active/Standby、RPC/Queue、State Save、DB Write/Replication、认证/时钟。控制面异常时保护已运行 Job 和停止高风险维护。

### Node State 与 Reason 可执行

Idle/Allocated/Mixed/Drain/Down，Reason 含时间/Owner/Incident，过期 Drain 和无主节点定期清理评审。

### GRES 数量和自动发现一致

Configured/Detected/Allocated GPU、Type/File/UUID、MIG，Node Invalid 先保存 Slurmd/NVML 错误。

### Partition 和 QOS 容量

Total/Free/Allocated/Down GPU、Pending、Reservation、QOS Limit/Fairshare。按 GPU Type/Fabric 细分。

### 长 Pending Job 原因

Priority/Resources/Dependency/Reservation/QOS/License/Topology，需求 Shape 和预计 Start。用户可见，不只显示 Pending。

### Job Launch 和容器失败

Prolog、Image Import/Cache、Mount/Permission、GRES/Cgroup、Rank/Environment。保留首个失败 Node/Task。

### GPU Binding 和 Rank Map

Job/Step/Task、CPU Set、GPU UUID、HCA/Rail，偏离标准拓扑 Fail Fast 或标性能等级。

### Job 效率和 Straggler

Allocated/Active/Useful、Data/Compute/Comm、Max/Median Rank、失败重算。按模型/规模基线，不统一阈值。

### Checkpoint 和抢占准备

Last Durable、RPO/RTO、Signal/Grace、Requeue/Exclude Node，Reservation/维护前确认。

### Epilog 清理和设备归还

GPU Process、MPS/IPC、Mount/Temp、Cgroup、GRES Accounting。异常残留节点 Drain 后处理。

### Image Cache 与本地磁盘

常用 Digest、Pull/Import、Hit/Eviction、Capacity/Inode/NVMe Health，防止 Cache 满导致 Job 启动失败。

### License 和外部依赖

vGPU/软件 License、LDAP/IAM、Registry、Storage/Rendezvous，容量/到期/HA 和故障时 Queue 行为。

### 维护队列和批次

Drain Node、运行 Job ETA、Checkpoint、每 Rack 最大不可用、Release Bundle、Acceptance/Resume。

维护批次开始前冻结变更清单和停止条件，结束后逐节点核对健康基线、拓扑、容器、NCCL/RDMA 与调度负向用例。Resume 只在证据包完整且 CMDB、Slurm、监控三方状态一致后执行。

## 第 68 章 · GPU 多租户威胁模型

### 攻击面包括 Driver、DMA、共享显存和管理面

GPU Driver 运行高权限，设备可 DMA，共享执行/Cache 可能产生侧信道，Operator/Hypervisor 可分配所有设备。威胁模型区分可信内部团队、不同业务租户和不可信外部用户。

威胁建模要把控制面和数据面分开：Hypervisor、GPU Operator、Fabric Manager、License 和云 IAM 能改变资源边界，GPU/网络/存储则承载租户数据。对每个信任边界列出读取显存、发起 DMA、耗尽资源、观察时序和修改配置的可能性，再选择共享、MIG、vGPU、Passthrough 或专用节点，并为高风险动作保留审计。

### 容器隔离不等于硬件故障域隔离

Time-Slicing/MPS/HAMi 下，一个进程的显存压力、长 Kernel 或设备错误可能影响邻居。需要强安全/可用隔离时使用 MIG、vGPU Profile、Passthrough、专用节点或不同 Cluster。

共享机制还会改变故障传播范围：OOM 可能只是单进程失败，Driver Reset 或不可恢复 Xid 则可能影响整卡甚至节点。租户合同应明确是否共享显存、Cache、调度时间和错误域，并用邻居压力、长 Kernel、非法访问和节点重启测试验证实际边界。

### 设备残留和显存清理需要厂商保证

作业结束后 Driver/硬件如何清理 Memory、MIG/vGPU 切换语义随产品。高敏租户不依赖未经验证的软件清零脚本；采用支持的 Reset/Instance Lifecycle，并做合规评审。

清理策略应区分正常释放、进程崩溃、VM 销毁和 GPU Reset。平台记录实例 UUID、释放时间和 Reset 结果，在重新交付前运行厂商支持的健康/隔离检查；若产品无法证明残留数据清除，应把该 GPU 置于专用池或采用更强的硬件分区，而不是用脚本宣称合规。

### 性能侧信道来自共享资源争用

邻居可从延迟变化推测资源活动。敏感场景使用独占或硬件分区、固定 QoS，限制高精度跨租户 Telemetry。安全不是只防读取显存。

侧信道评估应关注 Kernel 排队、显存带宽、功耗和共享 Cache 的时间变化，并以同租户与跨租户对照压测。监控接口只暴露租户自己的 UUID、用量和聚合指标；高敏工作负载不与不可信租户共置，也不允许通过管理 API 查询邻居进程。

### 管理 API 和设备插件是高价值权限

能修改 ClusterPolicy、MIG Layout、HAMi Allocation、Hypervisor Device Assignment 的身份可影响所有租户。RBAC 最小化、MFA、审计、变更审批和 Break-Glass 到期。

把“查看 GPU 指标”和“改变 GPU 资源边界”拆成不同角色，Operator ServiceAccount 只授予所需 API、Device Node 和 Namespace 权限。每次 MIG/vGPU/Hypervisor 变更关联工单、操作者、前后配置和回滚点；Break-Glass 凭证自动过期并触发复核。

## 第 69 章 · 容器和 Kubernetes 安全控制

### Pod Security 禁止默认 Privileged 和 HostPath

GPU Device Plugin/CDI 足以注入设备。普通用户 Pod 不需要 Host PID/Network、Privileged、Host `/dev` 或 Runtime Socket。Profiler/RDMA 特权用专门模板与审批。

Admission 规则应同时检查 `resources.limits`、RuntimeClass、HostPath、Capabilities、ServiceAccount 和镜像来源，并对 GPU 管理 Pod 使用独立 Namespace、节点池和 NetworkPolicy。拒绝事件需要可检索的原因和 Pod UID，方便区分策略拒绝与设备插件故障。

### RuntimeClass 和 Node Pool 限制工作负载范围

只有受信 Namespace/ServiceAccount 可用 GPU RuntimeClass 和 Toleration；Admission 强制 Image Registry、Digest、Resource Limit、Node Selector 和禁止 Host Driver Mount。

Node Label、Taint 和 RuntimeClass 属于平台信任输入，不能让租户自行伪造。调度后还要验证 Pod 实际落在声明的 GPU SKU/MIG Profile 节点，并防止借助 HostPath、HostPID 或 Runtime Socket 获得宿主机控制面。

### Seccomp/AppArmor/SELinux 需与 Driver IOCTL 兼容

过严 Profile 可能阻止 GPU，直接 Unconfined 又扩大攻击面。基于 Container Toolkit/厂商建议生成 Profile，在 Canary 跑 Framework/NCCL/Profiler。拒绝日志进入诊断。

Profile 变更按 Driver 和 Container Toolkit 版本做 Canary，分别测试 CUDA 初始化、NCCL、MIG 查询和诊断工具。把 Seccomp/AppArmor/SELinux 拒绝事件与容器启动时间关联，确认是缺少必要 IOCTL 还是工作负载试图执行未授权操作，再收窄规则。

### Device Cgroup 验证容器只能访问已分配 GPU

进入 Pod 检查 Device Node/UUID，可尝试访问未分配 Minor 应失败。MIG/共享下按实际机制验证。测试在隔离环境执行，不读取其他租户数据。

负向测试应覆盖 `/dev/nvidia*`、`/dev/nvidia-caps`、MIG GI/CI 和 CDI 生成的设备列表，并保存 Device Cgroup、UID/GID 和容器运行时配置。未分配设备访问必须被拒绝且不影响已分配任务；测试日志不得包含租户模型或显存内容。

### NetworkPolicy 不覆盖 RDMA Fabric 全部路径

Host Device/SR-IOV/IB 可能绕过普通 CNI Policy。租户 RDMA 访问用 P_Key/VLAN/VF、Switch ACL、Namespace 和 HCA 权限共同控制。控制面/数据面分别审计。

NetworkPolicy 只覆盖 CNI 可见的网络路径，不能单独证明 RDMA Fabric 隔离。验收应从 Pod 到 HCA、VF、GID/P_Key 或 VLAN、交换机 ACL 逐层验证，并确认管理网、存储网和训练数据网不因 Multus 或 Host Device 挂载而串通。

## 第 70 章 · 镜像、模型和数据供应链安全

### 镜像从来源到运行保持可验证链

固定 Source、Build、SBOM、漏洞扫描、签名、Registry、Digest 和 Admission。NGC 上游镜像先镜像到内部 Registry，执行组织扫描与兼容验证。

运行时只允许不可变 Digest，禁止以浮动 Tag 代替版本审计。供应链证据应能从 Pod 追溯到源码、构建器、基础 CUDA 镜像、Native Library、签名和漏洞豁免；Driver 属于节点变更，镜像中的 CUDA/cuDNN/NCCL 则由镜像发布流程负责。

### CUDA Native Library 漏洞需要重建镜像

OS 扫描之外识别 NCCL/cuDNN/TensorRT/Python Wheel Native `.so`。Driver 漏洞由节点升级，Runtime Library 由镜像重建，责任矩阵明确。

扫描结果要按运行时加载路径去重，确认实际 ELF/SONAME 而不是只看包管理器名称。高危漏洞修复后在 Canary 节点跑 CUDA、NCCL 和推理 Smoke，避免安全重建引入 ABI 或性能回归；无法立即升级时记录范围、补偿控制和到期时间。

### 模型制品也可能携带可执行内容

某些序列化格式、Custom Op、Python Repository 可执行代码。优先安全格式，禁用不可信反序列化，Model Registry 扫描/签名，服务账户最小权限。

模型上线前在隔离环境加载并观察文件、网络和子进程行为，Custom Op 只来自签名仓库。推理服务不应拥有写入模型源目录或读取其他租户 Secret 的权限，模型版本、哈希和依赖镜像写入部署审计。

### Dataset 防止投毒、越权和隐私泄露

Data Lineage、Checksum、Access Control、PII Classification、Retention 和审计。训练 Job 只读输入，输出/Checkpoint 分路径；跨租户 Cache Key 与 Permission 隔离。

数据校验既防恶意投毒，也能发现跨区复制或缓存损坏。为 Dataset、Shard、Checkpoint 和 Cache 建立版本与所有者，训练凭证使用只读范围；删除 Pod 不会删除对象存储副本，因此保留期限和导出审计必须由数据治理流程控制。

### Secret 不写进 Image、Log 或 NCCL 环境包

使用短期 Workload Identity/Secret Mount，日志采集过滤 Token/URL Credential。最小复现外发前脱敏 Environment、Model/Data Path 和客户内容。

Secret 注入应绑定 Job/Pod 身份并设置过期时间，禁止通过环境变量、命令行参数或 NCCL 调试包传播。故障证据上传前检查日志、挂载清单、Checkpoint 元数据和对象 URL，采用脱敏后的时间线替代原始租户内容。

## 第 71 章 · Confidential Computing 与可信执行边界

### Confidential VM 保护使用中的 CPU 内存

硬件隔离 VM Memory 免受 Host 某些威胁，但 GPU DMA/Memory、I/O 和 Attestation 需要完整支持。不能因为 VM 标记 Confidential 就默认 GPU 数据全程受保护。

评估 Confidential VM 时要列出仍被信任的 Hypervisor、GPU Firmware、驱动、设备分配和远程存储组件，并确认 GPU 是否支持加密显存、受保护 DMA 和调试限制。缺少任一链路时，只能声明 CPU 内存保护范围，不能扩大成端到端机密计算承诺。

### GPU Confidential 能力依代际与模式

新产品可能提供受保护计算、加密链路和 Attestation，具体模式会影响性能、Debug、P2P 和 vGPU。使用当前产品安全指南和支持矩阵，本文不假定所有 GPU 具备。

同一 GPU 不同模式可能禁用部分 P2P、Profiler、迁移或多实例功能。平台 Catalog 应明确型号、Firmware、Host/Guest Driver、Hypervisor、Attestation 服务和可用调试能力的组合，并在升级后重新测量而不是沿用旧结论。

### Attestation 把硬件和软件状态交给策略判断

Verifier 检查 CPU/GPU/VM Measurement、Firmware、Driver 和证书，再发放 Secret/Model Key。Nonce、证书链、Revocation、时钟和服务 HA 都是系统组件。

典型流程是 Workload 提交 Nonce，Attester 返回带测量值和证书链的 Quote，Verifier 按策略核对版本与撤销状态，最后通过短期凭证释放密钥。Quote、策略版本、决策和密钥租期应审计；Verifier 不可用时默认拒绝新任务或进入明确的降级模式。

### 加密不替代身份、授权和日志治理

数据静态/传输/使用中保护之外，仍需谁可启动任务、访问模型、查看输出和改变策略。Confidential Computing 缩小信任边界，不消除所有控制。

把加密控制映射到身份、授权、最小权限和日志保留，才能回答“谁在什么状态下访问了什么”。密钥服务、模型仓库和调度器仍可能被滥用，必须与 Attestation 决策、租户 RBAC 和事件响应联动。

## 第 72 章 · 云上 GPU 资源与配额

### Instance Type 包含完整虚拟机而不只 GPU

比较 GPU 型号/数/显存、vCPU/Memory、Local NVMe、网络/EFA/RDMA、CPU-GPU/NIC 拓扑、虚拟化和区域供应。云命名相似实例可能互连差异很大。

实例 Catalog 应同时标注可用驱动、Compute Capability、互联域大小、启动配额、EBS/对象存储路径和计费单位。不能只按 GPU 数比较，模型是否需要完整显存、NVLink、RDMA 或本地 Cache 会改变实际可用性。

### Service Quota 和实际 Capacity 是两道门

Quota 允许申请不保证区域有库存。关键训练提前 Capacity Reservation/Committed Use 或多 Zone/Region 策略；Fallback Instance 必须通过兼容/性能验证。

容量申请的证据要区分 API 配额、区域库存、Placement 约束和卷/网络依赖。为每个关键 SKU 定义备用 SKU 与迁移时间，提前演练从申请失败到重排队、数据挂载和基准确认的完整路径。

### Spot/Preemptible 适合可恢复作业

训练有频繁 Checkpoint/Elastic，离线推理有 Shard 幂等，才适合。中断通知触发保存/停止，新节点启动时间和数据 Cache 回源计入成本。

Spot 策略应设定最大可接受重算窗口、Checkpoint 间隔和重试上限，并把中断通知、排空、对象存储写入和新节点预热做成状态机。在线服务保留 On-Demand 基线容量，不能让自动扩缩在中断时同时丢失全部副本。

### 云 RDMA 网络需使用提供商支持路径

EFA/InfiniBand/RoCE 暴露方式和 NCCL Plugin 由云平台定义，用户通常不能修改底层 Switch PFC。选择官方 Image/Driver/Plugin，Benchmark 按 Placement Group/Cluster 类型。

排障时先确认实例 Placement、网卡与 GPU NUMA、RDMA 设备和云厂商插件，再检查 NCCL 是否选择了预期接口。把云平台限制写进运行手册，避免照搬裸机修改 PFC、OFED 或交换机参数造成不受支持的状态。

### 数据传输和存储请求进入总成本

GPU 小时外还有跨区/公网 Egress、对象请求、快照、共享文件和日志。训练数据反复跨区会抵消 Spot 节省；让计算靠近 Source Data 或建立 Cache。

成本模型应按一次完整作业核算：有效 GPU 时间、失败重算、启动预热、数据传输、存储容量/请求和日志保留。将数据集、Checkpoint 和镜像缓存放在计算邻近区域，并为跨区复制设置预算告警与审批。

## 第 73 章 · 云上 Kubernetes 与托管平台

### 托管控制面不管理 Guest GPU 全部问题

Node Driver/AMI、Device Plugin/Operator、Quota、模型和网络仍由用户/服务边界决定。云支持工单需 Instance/Host/Driver/Node Log，平台团队保留证据。

托管控制面只代表 Kubernetes API 可用，不代表节点上的 GPU Driver、Device Plugin、RDMA、Guest 或模型缓存正常。平台应维护节点镜像与 Operator 版本基线，并在提交云工单时提供实例、可用区、GPU UUID、驱动、事件和时间线，避免只报“Pod Pending”。

### Node Group 固定 GPU SKU 与软件基线

每组使用验证的 Image/Driver/Runtime/Label/Taint，滚动替换而非节点就地漂移。混合 Instance Policy 只有在工作负载兼容、资源 Label 准确时使用。

Node Group 的升级以替换节点为主：先 Cordon/Drain，确认长训练 Checkpoint 和 PDB，再让新节点通过 GPU、NCCL、网络和安全 Validator。混合 SKU 必须用受信标签表达显存、Compute Capability、MIG/Profile 和拓扑，不能让普通租户自行修改这些标签。

### Autoscaler 需要考虑 GPU Daemon 和初始化

新节点先拉 Driver/Operator/Model，数分钟内不可用。Node Ready 不等于 GPU Allocatable/Benchmark Ready；使用 Startup Taint，验证后移除。

初始化状态应由明确的条件驱动：驱动模块加载、Device Plugin 注册、GPU 健康、网络/RDMA、镜像缓存和最小基准全部通过后才移除 Startup Taint。失败节点保留日志并进入隔离池，避免 Autoscaler 反复扩容同一故障配置。

### Scale Down 保护长训练和本地 Cache

训练 Pod 标注不可随意驱逐并有 Checkpoint，Node Local Dataset/Model Cache 影响重建成本。空闲窗口、PDB 和 Queue 一起决定 Scale Down。

缩容控制器应识别 Job 类型、Checkpoint 新鲜度、PodDisruptionBudget、Spot 状态和本地缓存价值。对可驱逐 Pod 先发出宽限和保存信号，等待对象存储确认后再删除；把节点启动、镜像拉取和 Cache 回源时间计入扩缩容冷却窗口。

## 第 74 章 · 成本治理与容量组合

### On-Demand、Reserved 和 Spot 组成分层容量

Base Load 用承诺容量，突发用 On-Demand，可恢复批处理用 Spot。分层按工作负载标签/Queue 强制，不让关键在线误入 Spot。

容量池应按 SLO、可中断性、GPU SKU 和拓扑拆分，而不是只按价格排序。承诺容量保留故障 Headroom，Spot 池设置最大重试和中断预算；调度器、云配额和成本中心使用同一组工作负载标签，才能解释实际消耗。

### 利用率低要先判断可靠性余量

在线 N+1、发布蓝绿和故障 Headroom 是计划空闲。成本报告区分 Reserved Reliability、Queue Fragmentation、Application Idle 和真正 Unused。

利用率报表同时展示 Allocated、Active、Queue Time、碎片化和故障备用容量，并按 GPU、显存、网络和存储瓶颈拆分。释放可靠性余量前先验证故障演练和发布窗口，否则短期节省会转化为排队、重算或 SLO 违约。

### Rightsizing 同时调整 GPU、CPU、Memory 和 Network

小模型放大 GPU 可能浪费，CPU/DataLoader 不足也会让 GPU Idle。以有效吞吐/SLO 比较 Instance，而非只按 GPU 单价。

Rightsizing 使用真实请求分布和端到端吞吐：记录 GPU Active、显存峰值、CPU/内存、网络、P99 和失败重算。对推理比较每美元 Tokens/s 或满足 P99 的并发，对训练比较每美元有效 Samples/s；单卡价格低但数据供给不足的实例并不更便宜。

### Chargeback 使用可解释单位

训练 GPU Hour 加失败重算，推理按 SLO Token/请求，Shared/vGPU 按 Profile/份额。公共 Headroom、平台和存储成本有透明分摊规则。

分摊标签必须贯穿 Job、Pod、VM、GPU UUID、Profile 和对象存储请求，并定义平台公共成本的分配周期。成本异常要能回到具体租户、模型版本和失败 Attempt，避免把共享池的空闲或重算成本平均隐藏。

### Budget Alert 不能直接 Kill 关键作业

先通知、停止新低优 Admission、降低非关键副本或要求审批。正在运行长训练的强杀可能浪费更多成本，结合 Checkpoint 决定。

预算控制采用分级动作：告警、冻结非关键扩容、降级副本、限速新提交，最后才在有 Checkpoint 和业务批准时终止。每一步记录预计节省、影响 SLO 和回滚条件，防止自动化为了短期预算破坏更昂贵的恢复流程。

## 第 75 章 · 虚拟化与云故障排查

### Host 看见 GPU 而 Guest 看不见

检查 VM Device Assignment、IOMMU/VFIO、BAR/MMIO、Guest PCI、Guest Driver 和 vGPU License。迁移/重启后才发生则比较目标 Host 能力。

按 Host -> Hypervisor -> VM PCI -> Guest Driver -> Container 顺序取证，并记录设备 BDF、IOMMU Group、VM 配置、目标 Host、License 状态和时间线。Host 看见而 Guest 看不见时，先排除 BAR 资源和设备未绑定，再处理库或框架问题；不要直接反复重启丢失初始日志。

### Guest 看见 GPU 但 P2P/NCCL 很慢

检查分配 GPU Group、NVSwitch Partition、vNUMA、ACS/IOMMU、vGPU Profile 和 NCCL Topology。单卡正常不证明多卡 Fabric。

用单卡 CUDA、GPU-GPU P2P、NCCL Tests 和 GDR 逐层比较，并保存 NCCL Graph/Topology、GPU UUID、HCA 和 NUMA 映射。若只有多卡慢，优先寻找跨 Root、分区缺失、ACS 回退或邻居争用，而不是先调大 NCCL 超时。

### vGPU License 异常影响创建或持续运行

保存 Manager/Guest Driver、Profile、License State、Server Reachability、Certificate/Time。临时宽限期不是恢复，修复服务并验证新/旧 VM。

将新建 VM、重启已有 VM 和持续运行三种行为分别验证，检查席位借用、证书链、时钟偏差、宽限倒计时和 Manager 日志。修复后要确认旧 VM 能恢复正常能力，并将 License Server 的 HA、备份和到期告警纳入值班手册。

### 云实例性能只在部分 Host 异常

同 Instance/Image/Zone 对照，记录 Physical Host/Placement 信息（若可见）、GPU UUID、Clock、Topology、Network 和 Benchmark。迁移实例可恢复业务，但证据提交云厂商定位底层 Host。

对照测试固定模型、Batch、驱动、数据和并发，比较 GPU 时钟、温度、ECC/Xid、P2P、RDMA 和 P99。只有部分 Host 异常时保留实例 ID、时间段、可用区和基准原始输出，先把实例迁到已验证 Host，同时避免删除证据。

### 云容量不足区分 Quota、Stock 和调度约束

API Quota Error、Insufficient Capacity、Placement Group、Zone/Node Selector 和 Volume/Network Constraint 分开。Fallback 到其他型号前确认模型显存、Compute Capability 和 Engine 支持。

Runbook 为每类错误定义不同动作：Quota 走配额申请，库存不足换 Zone/Reservation，Placement 约束调整组网，卷或网络冲突修正依赖。Fallback SKU 必须重新验证显存、算子、精度、NCCL/RDMA、镜像和成本，不能只替换实例字符串。

## 第 76 章 · 安全事件响应

### GPU 节点安全事件优先隔离身份和网络

阻止新调度、撤销 Workload Credential、隔离管理/数据网，保存 Host/Container/GPU/Operator Audit。不要先重装节点丢失证据。

事件指挥先标记受影响节点和租户，暂停自动修复、迁移和缩容，建立只读证据副本及可信时间源。隔离动作要保留仍需访问的取证通道，完成影响范围、密钥轮换和数据所有者通知后，才进入重建和恢复阶段。

### 可疑 Driver/Kernel 事件需要专门取证

保存 Module Hash/Signature、Kernel Log、Loaded Module、Package DB、Device/Firmware、进程和时间。Root Compromise 假设下不完全信任节点自产日志，结合远端 Audit/Telemetry。

从远端日志、BMC、镜像仓库和变更系统交叉验证节点自产信息，并记录采集工具版本、哈希和时间窗口。怀疑 Root Compromise 时不要在原机执行会改写磁盘的清理命令；将节点隔离后从可信镜像重建，保留原盘或快照供后续取证。

### 模型或 Dataset 泄露按数据事件处理

定位访问身份、对象版本、下载范围、Cache/Checkpoint 副本和下游 Engine，撤销 Key、封存 Audit、通知 Data Owner。只删除 Pod 不能收回已导出数据。

数据事件范围应覆盖对象存储、共享文件、节点本地 Cache、镜像层和外部导出。按租户和版本冻结访问日志，轮换相关密钥与 Token，确认公开链接、快照和下游服务是否仍可读，并由数据责任人决定通知和保留期限。

### 恢复使用可信 Image 和重新 Attestation

疑似 Host Compromise 不原地“清理后继续”，从可信 Image 重建、更新 Firmware/Driver/Secret、验证硬件和平台，再恢复。保留受影响资产链和复盘。

恢复门禁至少包括镜像签名、Firmware/Driver 版本、IOMMU/Device Assignment、GPU 健康、网络隔离、Attestation（若适用）和最小 CUDA Smoke。先在隔离节点运行 Canary，再逐步解除 Cordon；安全团队独立确认根因、补丁和凭证轮换后才能恢复租户流量。

## 第 77 章 · 虚拟化、安全与云验收

### Passthrough 验收覆盖隔离、拓扑和重启

VM 只见分配设备，未分配访问失败；vNUMA/GPU/NIC 本地；P2P/NCCL/GDR 达标；Guest/Host 重启后一致；Host 监控与故障隔离有效。

验收证据应包含设备清单、IOMMU Group、拓扑、负向访问、重启前后 UUID、基准原始输出和 Host/Guest 监控截图或时序。任何“功能通过但监控不可见”的组合都不能进入生产，因为故障无法归属和止损。

### vGPU 验收覆盖 Profile、干扰和许可故障

Framebuffer/功能符合 Profile，多 VM 压力下性能/SLA，单 VM Crash 不影响邻居，License Server 故障行为，Manager/Guest 升级与回滚。

测试至少覆盖空载、同 Profile 混部、异构 Profile 混部、Guest 重启、Driver/License 故障和 Host Manager 重启。记录性能分位、错误传播、宽限行为和恢复时间，并将支持矩阵与实际版本一并归档。

### Kubernetes 安全验收执行负向用例

未授权 RuntimeClass/Toleration/Privileged 被拒绝，未分配 GPU 不可访问，不可信 Registry/Digest 被拒绝，RDMA Network/P_Key 隔离，Audit 完整。

负向用例必须由普通租户身份执行，并验证拒绝不会泄露设备列表、路径或模型数据。策略变更后重新跑一遍，确保 Admission、Device Cgroup、Network ACL 和审计事件仍然一致。

### 云验收验证配额、库存和故障替代

目标 Region/Zone 可获得容量，Reservation 生效，备用 Zone/Instance 兼容，Spot 中断能恢复，数据传输/Storage 成本符合模型。

把申请耗时、节点初始化时间、模型缓存预热、Spot 通知到 Checkpoint 完成的窗口纳入验收；只验证 API 创建成功不足以证明业务能在预算和 SLO 内恢复。

### 安全恢复验收由独立角色批准

平台功能通过之外，安全团队确认 Root Cause、补丁、Credential Rotation、Image Provenance、隔离和 Audit。事件节点不能由原自动化未经审查直接 Uncordon。

恢复审批引用明确证据和剩余风险，包含受影响资产清单、补偿控制、监控告警和回滚方案。安全角色批准后由平台执行 Uncordon，并在后续观察窗口内持续验证 GPU、网络和租户隔离。

## 第 78 章 · 虚拟化与云评审清单

### 租户和威胁等级

同团队/跨业务/外部、数据敏感、性能/故障隔离、管理员信任，决定共享、MIG、vGPU、Passthrough 或专用节点。

评审记录租户之间是否互信、数据是否含敏感内容、允许的性能抖动和最大故障影响面，并为选择的模式写出不适用场景。威胁等级变化时重新评审，而不是沿用原资源池归属。

### GPU 交付模式和 Profile

物理 GPU/MIG/vGPU Profile、数量/显存/功能/许可、Host/Guest Owner 和不支持能力。

清单还要固定 GPU 型号、Profile 语义、拓扑边界、共享策略和许可依赖；把“不可用功能”列出来，避免租户按显存大小推断 P2P、Profiler 或迁移能力。

### IOMMU Group 与设备集合

GPU 附属 Function、NVSwitch、NIC、Bridge，VFIO/ACS/Above 4G，不能安全拆分的集合。

保存每个 BDF 的 IOMMU Group 和资源集合证据，标注哪些设备必须整体交付、哪些拆分会降低隔离或 P2P。Catalog 只暴露经过验证的集合。

### vNUMA 与物理拓扑

vCPU/Memory Hugepage、GPU/NIC BDF、NVLink/Partition、CPU Pin，Guest 内外实测一致。

评审以 Guest 视角和 Host 拓扑对照，检查 NUMA 距离、PCIe Root、HCA 和本地内存；迁移或重启后再次验证，防止配置漂移。

### Host/Guest 软件矩阵

Hypervisor、vGPU Manager、Guest Driver、OS/Kernel、CUDA/Framework、License，升级/回滚兼容。

为每个组合指定 Owner、支持窗口、Canary 和回滚包，记录实际运行版本而不是只引用“兼容”。驱动和 Hypervisor 任一层变化都触发重新验收。

### 迁移、重启和 HA

模式是否支持 Live Migration、停顿/SLA、目标 Host Compatibility、失败回滚；Passthrough 的替代恢复方案。

对不支持迁移的 Passthrough 定义重建、Checkpoint、备用 Host 或跨区恢复路径，并明确训练和在线推理各自的 RTO/RPO。迁移失败必须能回到源 VM 或安全地重新调度。

### 设备与数据隔离验证

未分配设备不可见、Memory/Profile、邻居 Crash/Pressure、RDMA/Network、Storage/Cache、日志/Telemetry 不泄露。

使用普通租户身份执行负向访问、邻居压力和跨网络探测，收集 Device Cgroup、ACL、缓存权限和日志脱敏证据。任何可见的邻居 UUID、对象路径或高精度用量都应进入整改项。

### 管理权限和审计

Hypervisor Device Assignment、MIG/vGPU Manager、License、Operator/Cloud IAM，MFA/Break-Glass/变更记录。

把只读观测、资源分配、MIG 重配、License 管理和紧急恢复拆分为不同角色，所有高风险动作关联工单、审批、操作者和过期时间。定期审计无效 ServiceAccount 和长期 Break-Glass 凭证。

### 制品和供应链

Host/Guest Image、Driver、Model/Data、SBOM/签名/漏洞、Trusted Registry 和 Secret/Attestation。

验收应能从运行中的 VM/Pod 反查到镜像 Digest、签名、SBOM、驱动包、模型哈希和 Attestation 决策。漏洞豁免必须有期限、范围和补偿控制，不能以“内部镜像”替代证据。

### 云配额与真实库存

Region/Zone、Service Quota、Capacity Reservation、Placement/Cluster、Fallback SKU 和获取时长。

记录一次真实申请的配额、库存错误、可用区放置、备用 SKU 兼容性和从申请到 Ready 的时间。把容量预留失效和区域切换演练纳入季度复核。

### 云网络与存储

RDMA/EFA/IB、官方 Plugin/Image、Topology、Object/File/Local NVMe、数据迁移和 Egress。

清单同时标出 GPU-NIC NUMA、Placement Group、RDMA 设备、存储挂载和跨区费用；网络或镜像升级后重跑 NCCL/RDMA 与数据吞吐基准，避免只验证端口连通。

### Spot 和中断恢复

中断通知、Checkpoint/Shard、Retry、Cache Warmup、最大浪费和关键流量保护。

定义通知到保存完成的时间预算、最大重试次数和不可中断基线容量，并验证新节点能从最近 Checkpoint 恢复。把 Cache 重建、数据 Egress 和失败重算计入 Spot 的真实节省。

### 成本与承诺

On-Demand/Reserved/Spot、License、Storage/Request/Egress、Idle Reliability、有效训练/推理单位。

统一成本标签和计量周期，分别报告 GPU 空闲、可靠性余量、碎片、失败重算与公共平台成本。决策指标使用每美元有效 Tokens/s 或 Samples/s，而不是 GPU 小时单价。

### 安全事件恢复

隔离、取证、Credential Rotation、可信重建、Attestation、数据影响和独立安全批准。

评审确认自动化不会绕过证据保存和安全审批，恢复前完成密钥轮换、可信镜像、硬件/驱动验证及数据影响评估。批准记录包含剩余风险、观察窗口和回滚负责人。

## 第 79 章 · Benchmark 回答什么问题

### Microbenchmark 隔离单一资源路径

计算、HBM、H2D、P2P、NVLink、RDMA、NCCL、Storage 各自测试，定位硬件/组件是否达到同类基线。它不代表最终模型。

微基准的价值在于缩小故障搜索空间：先确认单一链路是否正常，再把结果与拓扑和计数器关联。例如 GEMM 下降而 HBM 与 P2P 正常，优先检查精度、Shape、库算法和时钟，而不是先怀疑网络。每次运行都应保存设备 UUID、工具版本、参数和原始输出，避免“同名测试”实际测了不同条件。

### Component Benchmark 验证软件子系统

Framework GEMM、TensorRT Model、Triton Dynamic Batch、DataLoader 等把多个底层资源组合，适合软件升级回归。

组件基准要明确组件边界和输入输出契约。比如 DataLoader 基准应把读取、解码、变换、Pinned Memory 和 H2D 分段记录；推理组件则同时记录 Engine 构建、Batching 和 GPU Kernel。这样升级后即使总吞吐变化，也能判断是调度、内存搬运还是计算库导致。

### Workload Benchmark 验证业务目标

真实模型/数据/精度/并行，输出 Step、Tokens/s、TTFT/TPOT/P99、质量和成本。环境更复杂，定位需回到组件/微基准。

业务基准必须锁定可比较的工作负载版本，并同时报告有效产出和资源代价。训练不能只看每秒 Step，还要看完成一个目标任务消耗的 GPU 小时；推理不能只报平均延迟，还要按输入输出长度、并发和错误率分桶。发现退化时回到组件基准做归因。

### Soak 和 Failure Test 验证长期运营

持续运行发现热稳态、间歇错误、Leak 和 Counter 增长；故障注入验证检测、释放、恢复。峰值性能通过不等于长期稳定。

Soak 计划要定义持续时长、采样周期和停止条件，并把温度、功耗、时钟、显存分配和错误计数器与业务吞吐对齐。Failure Test 还要验证告警是否触发、作业是否释放 GPU、重试是否受限以及恢复后的数据和质量是否正确。

## 第 80 章 · 实验问题、假设与变量

### 每次实验先写一句可证伪假设

例如：“Driver A 到 B 导致单节点 AllReduce 在大消息下降超过接受范围，其他条件固定。”比“测一下新 Driver”更明确。

假设应包含比较对象、指标、方向和判定窗口，并在实验前写入 Run Manifest。这样结果可以支持接受、拒绝或追加实验三种结论，而不是先跑数字再挑选解释。

### Independent、Controlled 和 Dependent Variable 分开

独立变量是 Driver；控制变量是 GPU/Node/NCCL/Power/消息；因变量是 BusBW/错误。未固定变量写入限制，不伪装因果。

实验表应逐项标出变量取值和来源，尤其是功耗上限、时钟策略、CPU 绑定、背景流量和容器镜像。因变量还应包含 ECC/XID、校验和或质量分数；性能提升若伴随错误计数增加，不应判为有效收益。

### 一个实验只改变一个主要层

同时升级 Driver、CUDA、Framework、Firmware 得到差异，无法归因。若组合必须一起升级，增加中间可运行组合或承认只验证整体 Release。

分层变更可采用二分或阶梯矩阵：先比较旧版与新版整体，再固定其余层逐一替换。若某组合不能运行，应记录“不支持”而不是跳过并把剩余差异归因给最后一层。

### 预注册停止条件保护硬件和共享系统

温度/Power、错误 Counter、网络丢包、Storage 容量、在线 SLO 超限立即停止。满负载实验有 Owner、窗口和 Kill/恢复方式。

停止条件应在 Runner 中实现为可观测的硬规则。每条规则定义采样来源、连续超限次数、停止动作和通知对象；停止后保存现场证据并执行恢复脚本。共享集群还需声明租户隔离、最大并发和回滚时间。

## 第 81 章 · 测试环境清单

### Hardware Manifest 覆盖完整节点

GPU UUID/型号/显存/Compute Capability、CPU/Memory/NUMA、PCIe/NVLink/NVSwitch、NIC/Firmware、NVMe、Power/Cooling、Rack。

### Software Manifest 使用真实运行版本

OS/Kernel/Driver/FM/OFED、CUDA/NCCL/cuDNN/TensorRT、Framework、Container Digest、Tool Commit、Environment。不要只记录 Helm Chart Version。

### Topology Manifest 记录最终分配设备

Node、Rank、GPU UUID/BDF、NIC/HCA/GID、CPU Set、Path Matrix。调度后生成，不能用静态预期替代。

拓扑清单应来自实际分配后的设备发现，而不是模板中的期望值。把 `Rank -> GPU UUID -> BDF -> NUMA -> HCA/GID` 固化到结果中，并附拓扑命令或调度器分配记录；发现 Rank 复用、GPU 可见性顺序变化或 HCA 不对称时，应先标记实验无效。

### Workload Manifest 固定模型与数据

Model/Data/Code Revision、Precision、Batch、Sequence/Input Shape、Parallelism、Warmup、Iteration、Seed、Quality Metric。

### Background Load 和独占状态明确

其他 GPU/CPU/Network/Storage Job、机架负载、共享租户。硬件验收用独占，生产容量可用受控并发，两类不混合。

## 第 82 章 · 时间、预热与采样

### 冷启动和稳态分别报告

冷启动含 Image/Model Load、JIT、Autotune、Graph/Engine、Cache Fill；稳态排除一次性成本。在线弹性两个都重要。

### Warmup 结束条件基于状态稳定

固定轮数是起点，还要看 Clock/Temperature、Cache、Algorithm Selection 和 Throughput 稳定。记录 Warmup，不悄悄丢弃异常长首次运行。

### 采样窗口覆盖业务周期

训练覆盖 Checkpoint/Evaluation，推理覆盖流量长度和 GC/Cache，Soak 达热稳态。只测十秒峰值不适合容量。

### 时钟同步连接多节点日志

监控 NTP/PTP Offset，日志 ISO 时间含时区。Rank、Switch、Storage 与 GPU Timeline 可对齐。

## 第 83 章 · 单 GPU 计算基准

### GEMM 测试注明精度、Shape 和 Tensor Core 条件

方阵峰值不代表模型小矩阵。覆盖代表 M/N/K、Transpose、Batch 和 Precision，记录 Algorithm/Library、FLOPS、Tensor Active 和质量。

### Kernel Launch 测试小任务固定开销

比较 Eager、Stream、CUDA Graph，小 Kernel 链观察 CPU Gap。用于判断 Launch Bound，不作为 GPU Compute 峰值。

### Compute Stress 同时验证 Clock、Power 和正确性

持续负载记录 Throughput、Clock、Power、Temperature、Throttle、XID/ECC。输出校验避免错误计算也被计为性能。

### 不同精度结果不能直接横比

FP32、BF16、FP8/INT8 峰值和数值不同。报告分表，注明稠密/稀疏和累加精度。

## 第 84 章 · 显存和数据搬运基准

### HBM 测试区分读、写、拷贝和有效带宽

数组大小超过 Cache，防止只测 L2；工作集/访问模式注明。理论 HBM Bandwidth 用作上限，不把 STREAM 类结果等同业务。

### H2D/D2H 覆盖 Pageable 和 Pinned

不同 Message Size、方向、并发和 NUMA。Pinned 测异步重叠，同时观察 Host Locked Memory。Pageable 回退作为对照。

### Unified Memory 覆盖 Prefetch、Fault 和 Oversubscription

CPU Init/GPU Read、交替访问、Working Set 超 HBM，记录 Migration/Stall。不同 CPU-GPU 一致性平台单独基线。

### Allocator 测试包含碎片和稳定长跑

混合大小反复分配/释放，比较传统与 Stream-Ordered Pool，观察 Allocated/Reserved、OOM、同步和性能。防止只测理想同尺寸。

## 第 85 章 · 节点内拓扑基准

### P2P 测试输出全 Pair Matrix

单向/双向 Bandwidth、Latency、P2P Enabled/Disabled，关联 PIX/PHB/NV#。矩阵离群定位 Link/Group。

Pair Matrix 应覆盖每个 GPU UUID 对，固定消息大小、方向、进程绑定和重复次数，并区分启用与禁用 P2P 的对照。将离群 Pair 映射到拓扑中的 PIX、PHB 或 NV 路径和 PCIe 插槽，才能判断是拓扑预期差异还是链路故障；不能只报告全局平均带宽。

### NVLink 测试前后采集状态和 Counter

Link Active 不够，负载下 Error Delta 为零/接受范围，吞吐符合同路径基线。记录 Remote Endpoint。

NVLink 验收应在负载前后保存链路状态、远端端点和错误计数器，并将吞吐与同一链路组的历史基线比较。链路显示 Active 但计数器持续增长或某条 Link 明显偏低时，应降级为拓扑或硬件调查，而不是用其他 Link 的平均值掩盖离群。

### 单节点 NCCL 覆盖 Collective 和消息大小

AllReduce、AllGather、ReduceScatter、AllToAll，8B 到应用大消息；AlgBW/BusBW/Latency 和 Algorithm。模型依赖不同 Collective。

### GPU Group 组合测试验证调度假设

对所有标准 2/4/8 GPU Group 建基线；随机跨组作为负向对照。调度策略必须分到已验证组合。

## 第 86 章 · 网络和 RDMA 基准

### Link/IP 测试只证明基础连通

Speed/State/MTU/Route/Packet Error；不以 Ping 推导 RDMA/NCCL。

这一级测试回答的是链路是否存在且没有明显配置错误，不回答 GPU 数据面能否达到带宽。应分别检查端口状态、协商速率、MTU、路由和错误计数，并记录两端时间点。Ping 成功仍可能存在 GID、PFC、HCA 绑定或 GPUDirect 不生效，因此必须继续做 Verbs 和 NCCL 层验证。

### Host Buffer RDMA 验证 Verbs 数据面

Read/Write/Send、单双向、Message/QP、GID/MTU，采集 HCA/Switch Counter。两端参数完全记录。

Host Buffer RDMA 先隔离网络协议和 HCA 数据面，缓冲区位于主机内存，不代表 GPU 到网卡的路径。测试矩阵至少覆盖消息大小、QP 数、单向/双向和读写语义；两端 HCA、端口、GID、MTU、CPU/NUMA 绑定必须写入 Manifest。

### GPU Buffer RDMA 单独证明 GDR

使用支持 CUDA Buffer 的工具，记录 GPU-HCA Topology、Peer Memory/DMA-BUF、CPU 和性能。与 Host Buffer 对照。

GPU Buffer RDMA 的关键是确认数据确实从 GPU 内存进入网卡，未因 Peer Memory、DMA-BUF 或权限问题回退到主机 Bounce Buffer。应在相同消息矩阵下与 Host Buffer 对照，并同步观察 CPU 使用、GPU-HCA 路径和错误计数；GPU Buffer 结果接近 Host Buffer 且 CPU 占用异常升高时，应优先排查回退。

### 多 Rail 测试验证聚合和公平

单 Port、每 Rail、全 Rail；检查流量是否均匀、某 Port 饱和、禁用单 Rail 后降级。线速相加不是自动可达。

### 并发和 Incast 暴露拥塞控制

多个 Pair/Job、AllToAll/Incast，观察 PFC/ECN/Discard/Queue/P99。隔离环境执行，避免压垮生产 Fabric。

## 第 87 章 · Storage 与 GDS 基准

### fio 参数必须代表目标 I/O 模式

Block Size、Read/Write、Random/Sequential、Queue Depth、Jobs、Direct、File Count、Duration 和 Dataset 大小。破坏性写只用专用测试卷。

### Metadata 测试覆盖文件创建、Stat 和删除

小文件训练常由 Metadata 主导。并发 Client/Directory Layout 与生产一致，清理不计入读结果。

Metadata 基准应把创建、遍历、Stat、Rename 和删除分开计时，记录每秒操作数、尾延迟和服务端错误。目录深度、文件数量、客户端并发以及缓存冷暖状态会显著改变结果；清理阶段单独记录，不能混入读路径吞吐。

### DataLoader 基准连接 Storage 到 GPU Idle

真实 Shard/Transform/Worker，测 Samples/s、CPU、Storage、H2D 和 GPU 等待。比 fio 更接近训练供给。

DataLoader 基准要使用与训练一致的样本格式、解码和随机访问方式，并明确 Worker 数、Prefetch、Pinned Memory 与缓存状态。把读取、变换、H2D 和 GPU 空闲时间串起来，才能判断是 I/O 吞吐不足、CPU 变换过慢还是搬运未重叠。

### GDS 比较传统、Direct 和直达路径

确认 GDS 生效，记录 CPU、Throughput、Latency 和 GPU Pipeline；Fallback 不误标为 GDS 结果。

## 第 88 章 · 训练 Benchmark 设计

### 固定 Global Batch 与固定 Per-GPU Batch 是两种实验

Strong Scaling 固定总问题，Weak Scaling 每 GPU 工作固定。两者 Scaling Efficiency 定义/意义不同，报告明确。

### Step Breakdown 找到收益或退化来源

Data、H2D、Forward、Backward、Collective、Optimizer、Checkpoint。总 Step 变化映射阶段，避免平均 GPU Utilization 解释。

### 收敛与数值是性能门禁

固定 Seed/数据，比较 Loss、NaN/Inf、Skipped Step、Accuracy。不同大规模并行可能非完全确定，定义容差而非要求 Bitwise。

### Failure/Recovery 计入有效吞吐

长跑注入 Node/Rank Failure，测检测、资源释放、Checkpoint Load、重算。有效 Tokens/总 GPU Hour 比稳态峰值更接近生产。

## 第 89 章 · 推理 Benchmark 设计

### 输入输出长度用分布而非单点

Synthetic 可控矩阵，真实脱敏流量代表业务。P50/P95/P99 Length 和并发组合，报告每桶 TTFT/TPOT。

### Arrival Pattern 区分 Closed-Loop 和 Open-Loop

Closed-Loop 等响应再发，过载时自动降到达率；Open-Loop 按真实到达，更能看到 Queue/尾延迟。容量 SLO 优先 Open-Loop。

### Throughput Sweep 找安全拐点

逐级并发/Rate，直到 Error/P99/KV 超阈值，取前一稳定档。每档足够时长并随机顺序/重复，避免温度或 Cache 偏差。

### 质量集覆盖量化和新 Engine

任务准确率、困惑度/相似度、人工规则和安全输出；性能通过但质量退化阻止发布。

## 第 90 章 · 统计、噪声与结果解释

### 多次独立运行而不是只重复内循环

重启进程/重新调度可覆盖 JIT、节点、拓扑和系统噪声。内循环只反映同进程稳定性。

独立运行应在 Run 级别重新建立进程、容器和必要的调度上下文，并保留每次环境 Manifest。将同一进程内迭代误当作独立样本，会低估启动、缓存、节点差异和偶发错误的方差。

### 报告中位数、分位数和离散度

平均易受异常值，性能报告给 Median、P5/P95 或标准差、样本数。在线延迟给 P50/P95/P99。

分位数必须注明分母和方向：吞吐通常报告中位数及 P5/P95，延迟报告 P50/P95/P99；每个统计量同时给出样本数、单位和离散度，避免不同运行时长的结果被直接比较。

### Outlier 先解释再决定剔除

硬件错误、Checkpoint、Background Job 都可能是真实生产事件。只在预定义数据质量问题剔除，并保留原数据/理由。

### 统计显著不等于业务显著

样本多时 1% 差异可能显著但低于噪声/SLO；10% 差异样本少仍具工程风险。用接受阈值和置信区间共同判断。

### Multiple Comparison 防止挑最好结果

测试大量配置后只报告最佳会乐观。预先定义候选/主指标，验证集复测最佳，保留全部试验。

## 第 91 章 · 自动化执行与数据格式

### Runner 将环境采集、测试和结果分离

Preflight 确认独占/健康，Collector 保存 Manifest，Runner 执行有超时，Parser 输出结构化 Result，Uploader 写不可变存储。

### 每次 Run 有唯一 ID 和 Parent Baseline

```yaml
run:
  id: example
  suite_version: git-example
  baseline_run: example-parent
  start_time: "2026-01-01T00:00:00Z"
  status: completed
```

### 原始输出和解析结果都保存

Parser Bug 可重新解析；原始 Log 用 Checksum/Compression，敏感信息脱敏。Dashboard 只展示摘要但链接证据。

### 自动化默认不执行破坏动作

Reset、Power Cycle、Port Down、Disk Write 需要显式 Suite/Approval。Dry Run 列出目标和动作，限制节点/Rack 并发。

## 第 92 章 · 回归判定与发布门禁

### Baseline 按 Node SKU、软件和测试版本分组

不同 GPU/Topology 不能共享绝对阈值。Baseline 有有效期，硬件/工具变更后重建并保留历史。

Baseline Key 至少包含 Node SKU、GPU Revision、拓扑组、驱动/CUDA/NCCL、测试套件版本和关键工作负载参数。比较前先确认候选与基线属于同一 Key；硬件替换、固件升级或工具改变后建立新基线，同时保留旧基线用于趋势追踪，不能覆盖历史数字。

### Hard Gate、Soft Gate 和 Informational 分层

Hard：功能/正确性/严重错误或关键性能超限；Soft：小幅退化需 Owner 接受；Info：趋势。避免所有波动阻断，也避免关键错误只发报告。

### 相对阈值与绝对 SLO 共同使用

比 Baseline 下降 5% 但仍远高 SLO，可能 Soft；相对没下降但 SLO 已提升/业务变化，仍不通过。两条线都记录。

### 回归先自动二分层次

Inventory/Health -> 单卡 -> P2P -> NCCL -> Network -> Storage -> Workload，找到首个失败层，附健康节点对照。不要自动修改参数“修复”。

### Waiver 有范围、Owner 和到期

已知小退化可条件发布，但限制 Node Pool/Workload、业务影响、补救和 Revisit。到期自动重新 Gate，不永久忽略。

## 第 93 章 · Benchmark 实验室运营

### Lab 节点保持代表性且不被随意使用

覆盖主要 SKU/Revision/网络/存储，一部分固定 Baseline，一部分 Canary。访问通过预约，背景任务可见。

### 工具镜像和数据集版本化

Benchmark Tool Commit、Compiler、Container Digest、Test Data/Model Hash 固定。工具更新用旧/新交叉运行，防止把工具差异误判平台回归。

### 定期校准传感器和环境

Power Meter、Temperature、Network/Storage Background 和 NTP。机架环境变化记录，不能假设 Lab 永远稳定。

### 结果目录支持查找和比较

按 Suite/Hardware/Software/Date/Run ID 索引，元数据可查询。原始结果不可覆盖，错误 Run 标 Invalid 不删除。

### Benchmark 结论进入架构和变更流程

采购用性能/能效曲线，发布用回归 Gate，容量用安全吞吐，维修用节点离群。实验室不是只产排行榜。

## 第 94 章 · 常见错误实验设计

### 用不同 Batch 比较 GPU 型号

可能让大卡得到更适合 Shape。固定业务目标，同时报告每卡最佳和同配置两组，明确容量/延迟。

### 只跑一次并取最好数字

无法估计噪声，容易挑中偶然 Boost/Cache。多轮、分布和原始数据。

单次最好值不能代表可重复能力，尤其在 GPU Boost、缓存命中和共享节点噪声存在时。应预先规定重复次数、预热策略和汇总方法，保留所有 Run；异常时先关联温度、时钟、错误和后台任务，再按数据质量规则标记。

### 在共享网络测硬件验收

背景流量不受控使结果不可复现。独占窗口，或声明生产并发测试而非硬件上限。

### 把 GPU Utilization 当性能结果

高利用可低效，低利用可需求不足。最终输出 FLOPS/Step/Token/Latency 与质量，Utilization 用于解释。

### Benchmark 改系统后不恢复

锁 Clock、改 Power、禁 P2P/IB、清 Cache 等必须记录和 Restore/Verify。Lab 自动化在结束/异常执行清理，节点进入生产前重验配置。

## 第 95 章 · Benchmark 报告标准目录

### 目标和决策问题

说明比较对象、可证伪假设、将支持采购/发布/维修/容量哪项决策，不用“例行测试”模糊目的。

报告开头应让读者知道“不通过会做什么”。采购比较关注单位成本和能效，发布门禁关注 SLO 与正确性，维修定位关注离群节点证据，容量规划关注安全吞吐；目标写清后主指标、样本规模和停止条件才有依据。

### 测试范围和未覆盖边界

Hardware/Software/Topology/Workload、单卡/节点/集群、功能/性能/数值/故障；明确未测模式。

### 环境 Manifest

Node/GPU/NIC/Storage/Facility、版本 Bundle、Image/Tool/Data/Model、配置和背景负载。

Manifest 应能回答“这次结果在哪台设备、以哪个软件和哪个数据产生”。除版本号外保存 GPU UUID、PCI BDF、HCA/GID、容器 Digest、代码提交和调度分配；背景负载与独占状态也要记录，便于判定结果是否可与基线比较。

### 方法和参数

命令、Warmup、Duration/Iteration、Message/Batch/Shape、并发、独占、Counter 和停止条件。

方法部分应让另一位工程师按原顺序重跑：列出命令或 Runner 参数、预热结束条件、采样窗口、并发模型、计数器采集点和停止规则。对随机数据、缓存清理、时钟策略等隐含条件明确说明，避免“同一命令”实际得到不同实验。

### 数据质量

时钟、缺失、失败 Run、Outlier、Profiler Overhead、Cache 状态和环境漂移；剔除理由。

数据质量章节要把无效 Run 与低性能 Run 分开。缺少时间同步、采集器丢样、Profiler 改变调度或测试中途触发停止条件时可标记无效，但必须保留原始证据和理由；真实错误、长尾和热降频属于结果的一部分，不能静默删除。

### 原始结果索引

Run ID、Log/Trace/Metrics/Counter、Checksum、Parser Version。摘要可从原始重新生成。

索引应把同一 Run 的日志、Trace、指标和计数器绑定到唯一 ID，并记录对象路径、校验和、采集时间及解析器版本。解析器升级后可以从原始输出重建摘要；如果只保存 Dashboard 截图，就无法审计阈值判定或修复解析错误。

### 统计摘要

样本数、Median/P95/P99、离散度/区间、Baseline/候选差异，单位和口径统一。

统计摘要同时给出候选与基线的样本数、汇总方式、单位、相对变化和置信范围。吞吐、延迟、错误率与成本不能混成一个无单位分数；每个指标都要标明越高越好还是越低越好。

### 正确性和健康结果

Error/XID/ECC/AER/Link、数值/质量、测试前后 Delta。性能异常不与硬件错误混为一个结果。

健康结果要按测试前、测试中和测试后列出 Delta，并关联到具体 GPU、HCA、链路或节点。性能下降伴随 XID、ECC、AER 或 Link Error 时应进入故障调查；没有健康证据只能得出“观察到退化”，不能直接宣称软件根因。

### 时间或阶段分解

Data/Host/Copy/Compute/Communication/Synchronization/Output，解释总指标变化来自何处。

阶段分解应使用同一时间基准，避免把重叠阶段简单相加。训练报告可展示 DataLoader、H2D、Forward、Backward、Collective 和 Checkpoint，推理报告可展示排队、Prefill、Decode、输出和后处理；每一段都注明测量工具与是否有 Profiler 开销。

### 与阈值比较

绝对 SLO、相对 Baseline、健康分布/OEM，Pass/Soft/Hard 和阈值来源。

阈值表应列出指标、单位、方向、适用 SKU/版本、来源和动作。相对回归与绝对 SLO 冲突时采用更严格的结果，并明确触发阻断、人工复核或仅告警。把阈值来源写入报告，后续修改才有审计轨迹。

### 结论和置信度

证据支持的最小结论、替代解释、限制；不从单一相关性宣称根因。

结论应区分已证明、尚未证明和需要追加实验的内容。例如可以确认某 SKU 在给定 Shape 下退化，但不能仅凭相关性断言某个驱动函数是根因。列出替代解释、未覆盖拓扑和统计不确定性，读者才能正确使用结果。

### 行动与 Owner

发布/阻断/重测/维修/容量/应用优化，责任人、期限和依赖。

行动项必须从结论映射到可执行变更，例如隔离离群节点、回滚驱动、补跑某个消息矩阵或调整 DataLoader。每项记录 Owner、截止时间、依赖证据和完成判定；“继续观察”也要有观察指标和复查日期。

### Waiver 或条件通过

影响范围、临时控制、到期、Revisit Trigger。未决退化不能只写“可接受”。

条件通过必须写清受影响的 SKU、Node Pool、工作负载和最大持续时间，并指定临时隔离、监控和复测触发器。Waiver 到期后自动回到 Gate 流程；没有 Owner、期限或补救动作的文字不构成可审计豁免。

### 可复现入口

Tool/Image/Data 权限、Runner 参数、目标环境和预计成本，使另一团队能重跑。

可复现入口应指向不可变的工具镜像、代码提交、数据/模型哈希和完整 Runner 参数，并说明所需设备、权限、预计时长与清理动作。若某项依赖内部服务，报告需明确替代方案和不可复现边界。

## 第 96 章 · GPU 平台的自动化对象

### 自动化管理期望状态、发现状态和变更状态

期望状态是 Node SKU/软件/策略，发现状态来自硬件/Kubernetes/Slurm/监控，变更状态记录正在升级、维修或验收。三者不能压成一个 `Ready` 布尔值。



在节点生命周期治理中，“自动化管理期望状态、发现状态和变更状态”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 自动化边界按控制面分层

Provisioning 管 BMC/OS，Configuration 管 Host，Operator 管 Kubernetes Operand，Scheduler 管 Allocation，Observability 管证据，Workflow 编排跨层。每层有 Owner 和 API。



在平台运营中，“自动化边界按控制面分层”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 幂等不表示动作无风险

重复 Cordon 幂等，重复 Driver Upgrade/Reset 仍可能中断。Workflow 在动作前检查工作负载/维护批准，保存已完成 Step 并支持恢复。



在平台运营中，“幂等不表示动作无风险”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 人工操作最终回写声明

事故中临时改 Power、NCCL Config、Taint 或 MIG，事件后进入 Git/CMDB/Policy 或撤销。否则自动化下次覆盖，形成配置漂移。



在平台运营中，“人工操作最终回写声明”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 97 章 · CMDB 与资源事实

### 物理资产、逻辑资源和租户分配分表

物理：Serial/UUID/BDF/Rack/Firmware；逻辑：MIG/vGPU/HAMi/Resource Name；分配：Pod/Job/Tenant/Time。用稳定 ID 关联，保留历史。



在资产与事实治理中，“物理资产、逻辑资源和租户分配分表”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Discovery 不能自动覆盖人工确认的关键字段

自动发现型号/BDF，Rack/Cable/保修可能需验收。发现差异生成 Reconciliation Task，而非静默修改 Source of Truth。



在资产与事实治理中，“Discovery 不能自动覆盖人工确认的关键字段”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Expected Inventory 用于发现 GPU Missing

监控将实际 GPU UUID/Count 与 CMDB 期望比较。Exporter Down 标 Unknown，物理缺失标 Failed，计划维修标 Maintenance，告警路由不同。



在资产与事实治理中，“Expected Inventory 用于发现 GPU Missing”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 拓扑和性能基线是资产属性

Node SKU 关联 Topology Fingerprint、P2P/NCCL/RDMA Baseline。硬件/固件变更后重新生成，不能只存一份全局数字。



在资产与事实治理中，“拓扑和性能基线是资产属性”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 98 章 · 版本矩阵与制品目录

### Release Bundle 固定跨层兼容组合

```yaml
release_bundle:
  id: gpu-platform-example
  os_image: example
  kernel: example
  driver_branch: example
  fabric_manager: example
  ofed: example
  container_toolkit: example
  gpu_operator: example
  hami: example
  benchmark_suite: example
```

示例值需替换。Bundle 是验证单元，单组件 CVE 修复也要生成新 Bundle 和测试范围。

### Image、Package 和 Helm Chart 都固定 Digest/Checksum

Tag 便于人读，Digest 保证制品。Air-Gap 同步保留签名/SBOM/来源；删除旧制品前确认所有回滚窗口结束。



在版本与制品治理中，“Image、Package 和 Helm Chart 都固定 Digest/Checksum”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 支持矩阵包含禁止组合

不仅列“支持”，还标 Deprecated、Blocked、Experimental 和限制，如旧 GPU 不支持新 Framework、某 Driver 与 FM 不配套。Admission/Scheduler 避免调度不兼容 Image。



在平台运营中，“支持矩阵包含禁止组合”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### EOL 提前产生迁移任务

Driver/OS/Kubernetes/Operator/Framework EOL 前统计受影响 Node/Workload，完成替代测试和用户通知。不能到漏洞无补丁时才升级。



在版本与制品治理中，“EOL 提前产生迁移任务”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 99 章 · 节点状态机

### 生命周期状态比 Ready/NotReady 更精确

```mermaid
stateDiagram-v2
    [*] --> Provisioning
    Provisioning --> Validating
    Validating --> Ready
    Ready --> Draining
    Draining --> Maintenance
    Maintenance --> Validating
    Ready --> Faulted
    Faulted --> Repair
    Repair --> Validating
    Validating --> Quarantine
```

每状态允许动作和 Scheduler 表达明确。Quarantine 验证失败，不能自动回 Ready。

### 状态转换需要前置条件和证据

Ready 需要 Inventory/Health/Resource/Benchmark；Maintenance 需要 Drain Complete；Repair 完成需要 Work Order；Uncordon 需要 Acceptance Run ID。



在节点生命周期治理中，“状态转换需要前置条件和证据”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Kubernetes、Slurm 和 CMDB 状态一致

CMDB Faulted 触发 Kubernetes Cordon/Taint、Slurm Drain；任一控制器不能自行清除共同故障。Reconciler 检测差异并报警。



在节点生命周期治理中，“Kubernetes、Slurm 和 CMDB 状态一致”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 超时和人工接管防止卡死

Draining 超过 Checkpoint/Grace、Validating 工具 Hang、Provisioning 失败都有 Timeout/Retry 上限和 Owner。无限自动重试会占据节点且覆盖首错。



在节点生命周期治理中，“超时和人工接管防止卡死”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 100 章 · 节点上线自动化

### Preflight 验证资产和环境

BMC 可达、Serial/BOM、Power/Cooling、Cable/Switch Port、网络/IP、安装源。失败阻止 Provision，不进入 OS 后才发现布线。



在资产与事实治理中，“Preflight 验证资产和环境”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Provision 后按层执行 Gate

OS/Kernel -> Driver/Fabric/OFED -> Runtime/Scheduler -> DCGM -> Topology -> Compute/P2P/NCCL/RDMA/Storage -> Workload Smoke。首个失败层作为状态 Reason。



在节点生命周期治理中，“Provision 后按层执行 Gate”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 新节点用 Startup Taint/Drain 隔离

Kubernetes Node Ready 或 slurmd 注册时仍不可接业务；验证 Workflow 最后移除 Taint/Resume。防止 Race。



在节点生命周期治理中，“新节点用 Startup Taint/Drain 隔离”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 输出节点证书而不是零散日志

Node Certificate 包含 Inventory Hash、Release Bundle、Test Run、结果、时间和有效期。Scheduler/CMDB 可查询，原始证据可追溯。



在节点生命周期治理中，“输出节点证书而不是零散日志”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 101 章 · 变更编排与批次控制

### 变更计划声明故障域和最大不可用

例如每 Rack 一台、集群不超过 5% GPU、在线推理始终 N+1。Workflow 在开始下一批前读取实时容量/Queue，不只按固定并发。



在变更编排中，“变更计划声明故障域和最大不可用”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Drain 与业务 Checkpoint 协同

停止新 Admission，通知 Job，等待 Checkpoint，Evict/Requeue，确认 GPU Process/Local State。到期 Escalation 由 Owner 决定延长或强制。



在变更编排中，“Drain 与业务 Checkpoint 协同”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Canary 通过后仍有观察窗口

功能/Benchmark 后运行代表业务，观察 XID、性能、Error/SLO。窗口未过不扩大；无流量 Canary 不能验证。



在变更编排中，“Canary 通过后仍有观察窗口”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Rollback 与 Roll-Forward 都预演

旧 Driver/Image/Chart 可恢复，数据/CRD/Firmware 是否向后兼容；若不能降级，准备修复版本 Roll-Forward 和隔离策略。



在变更编排中，“Rollback 与 Roll-Forward 都预演”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 变更结束检查临时配置

Silence、Taint、Power/Clock、NCCL Debug、Test Account、Reservation 和 Snapshot 清理；Effective Config 与 Bundle 对齐。



在变更编排中，“变更结束检查临时配置”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 102 章 · 故障自动化与事件编排

### Alert 先关联资产和工作负载

GPU UUID -> Node/Rack/Owner -> Pod/Job/Rank -> Release/Recent Change。通知携带 Incident ID、Dashboard、Runbook 和首错。



在资产与事实治理中，“Alert 先关联资产和工作负载”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 自动证据包先于状态变更

并行采集 GPU/Kernel/Fabric/NIC/Kubernetes/Slurm/应用摘要，设置超时。采集完成或超时记录后再 Reset/Reboot。



在节点生命周期治理中，“自动证据包先于状态变更”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 自动 Cordon/Drain 分级

Fatal XID/Uncorrectable ECC 可立即 Cordon，Drain 是否等待 Checkpoint按数据风险；Correctable 增长先 Ticket/观察。规则版本化。



在变更编排中，“自动 Cordon/Drain 分级”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 重复事件升级人工和厂商

同 GPU/槽位/节点在窗口内超过阈值，停止自动重启循环，生成 RMA Bundle。Automation 不用无限重启制造“恢复”。



在故障响应中，“重复事件升级人工和厂商”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Incident 状态与节点状态双向链接

节点 Faulted 包含 Incident，Incident 关闭前要求 Recovery Run；事件系统关闭不能自动 Uncordon，验证控制器批准后转换。



在节点生命周期治理中，“Incident 状态与节点状态双向链接”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 103 章 · 可观测平台治理

### 指标目录记录语义、单位和支持范围

每 DCGM/NVML/平台 Metric 的 Type、Unit、Entity、Label、Unsupported、Reset 和 Owner。Exporter 升级自动 Diff `/metrics` 与 Catalog。



在可观测性与服务等级中，“指标目录记录语义、单位和支持范围”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Cardinality Budget 限制动态标签

GPU UUID/Node/Pod 可控，Request ID/Prompt/User 不进 Metrics。高基数放 Trace/Log，Recording Rule 聚合长期趋势。



在可观测性与服务等级中，“Cardinality Budget 限制动态标签”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Dashboard 是 Runbook 入口不是最终答案

Fleet -> Node -> GPU -> Workload Drilldown，显示数据新鲜度和变更标记。每告警链接对应面板/证据采集。



在可观测性与服务等级中，“Dashboard 是 Runbook 入口不是最终答案”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Retention 按诊断需求分层

高频 Profiling 短期，健康 Counter/资产长期，Incident Snapshot 不可变。成本与复盘窗口平衡；Downsample 不丢最大/增量语义。



在可观测性与服务等级中，“Retention 按诊断需求分层”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Telemetry 也有 SLO

覆盖率、Freshness、Scrape Success、Pod Mapping、Alert Delivery。Telemetry Unknown 超阈值时阻止高风险变更。



在可观测性与服务等级中，“Telemetry 也有 SLO”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 104 章 · SLO 与错误预算

### 平台 SLI 从用户可感知资源交付开始

Pod/Job GPU Start Success、Queue Time、GPU Allocatable Accuracy、Node Ready Capacity、Repair/Recovery、Telemetry Coverage 和 Benchmark Conformance。



在可观测性与服务等级中，“平台 SLI 从用户可感知资源交付开始”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### SLO 按服务等级和资源池区分

Critical Inference、Guaranteed Training、Shared/Best Effort 的 Queue/可用性不同。一个宽松全局平均会掩盖关键池问题。



在可观测性与服务等级中，“SLO 按服务等级和资源池区分”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Error Budget 连接发布速度

Driver/Operator/Firmware 变更消耗预算；预算低时冻结非安全变更，优先可靠性。安全紧急更新仍可执行，但缩小批次并增强验证。



在可观测性与服务等级中，“Error Budget 连接发布速度”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 平台 SLO 与模型 SLO 有责任接口

平台承诺资源启动/健康，模型团队承诺质量/配置。推理端到端 SLO 共同负责，通过 Trace 分解 Queue/Runtime/Model。



在可观测性与服务等级中，“平台 SLO 与模型 SLO 有责任接口”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 105 章 · 容量与需求治理

### Forecast 使用业务 Pipeline 与历史使用

项目模型/上线日期/并行与 SLA 加历史 Peak/Queue/Utilization/增长。需求未确定输出区间，定期校准。



在容量治理中，“Forecast 使用业务 Pipeline 与历史使用”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Pending Shape 比总空闲 GPU 更重要

空闲 64 GPU 分散可能放不下 32-GPU Job。按 Request Count/Topology/MIG/HAMi 形状分析，调整 Node Pool/Layout/Queue。



在容量治理中，“Pending Shape 比总空闲 GPU 更重要”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Admission 保护不可承诺的请求

模型显存、GPU Class、并行规模和 Deadline 超平台能力时，在排队前提示/拒绝或转低 SLA，不让作业无限 Pending。



在容量治理中，“Admission 保护不可承诺的请求”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Capacity Reservation 有 Owner 和使用审计

上线/关键训练预留，未使用可借用但可回收。长期低使用重新评审，可靠性 Headroom 单独标记不误删。



在容量治理中，“Capacity Reservation 有 Owner 和使用审计”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 采购、云突发和优化是三个供给杠杆

长期 Base 采购/承诺，短期峰值云/租赁，软件优化/共享提高有效容量。比较 Lead Time、SLO、数据和总成本。



在容量治理中，“采购、云突发和优化是三个供给杠杆”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 106 章 · 权限、审计与分权

### 读取、调度、维护和破坏性操作分角色

观察者读指标；用户提交资源；平台 Cordon/Drain；硬件团队 Firmware/Reset；安全团队 Policy。Break-Glass 双人/到期/审计。



在平台运营中，“读取、调度、维护和破坏性操作分角色”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 自动化身份只获得所需 API

Collector 只读，不应能 Reset；Updater 只作用目标 Node Pool；Incident Bot 可 Cordon 但不能 Uncordon。Credential 短期和轮换。



在安全与治理中，“自动化身份只获得所需 API”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 变更审计记录前后状态和批准

Who/Why/Target/Bundle/Diff/Start-End/Result/Rollback。手工 SSH 命令也进入记录，敏感输出脱敏。



在节点生命周期治理中，“变更审计记录前后状态和批准”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 租户只看到自己的工作负载细节

共享 GPU Dashboard 不泄露其他租户 Process/Model/Request；平台管理员可看物理汇总。RBAC 在 Metrics/Logs/Traces 一致。



在安全与治理中，“租户只看到自己的工作负载细节”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 107 章 · 备份、恢复与灾难演练

### 备份控制面声明和状态

Kubernetes/Operator/Queue/Slurm/CMDB/Alert/Registry Metadata、Version Matrix、Secrets 按各自一致性备份。GPU Worker 本身多可重建。



在节点生命周期治理中，“备份控制面声明和状态”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Artifact 和 Dataset 有独立灾备

Image/Model/Checkpoint/Dataset 的 RPO/RTO/Region/Immutable 策略不同。控制面恢复但模型不存在仍无法服务。



在恢复与演练中，“Artifact 和 Dataset 有独立灾备”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Restore Test 使用隔离环境

定期恢复 CMDB/Registry/Queue/Monitoring，验证版本和权限。备份成功日志不等于可恢复。



在恢复与演练中，“Restore Test 使用隔离环境”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 管理面故障验证数据面行为

CMDB/Operator/Monitoring/Controller 短时不可用，已运行训练/推理如何，是否停止新 Admission，恢复是否 Reconcile。演练设置业务保护。



在变更编排中，“管理面故障验证数据面行为”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 108 章 · 运营例会与改进闭环

### 每日关注容量和高风险事件

可用/隔离 GPU、长 Pending、Critical Alert、变更、Telemetry Gap 和关键 Job。明确 Owner/ETA，不只报数字。



在故障响应中，“每日关注容量和高风险事件”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 每周评审性能与碎片

GPU Active/Useful、Queue、Top Idle Allocation、Scaling 回归、MIG/HAMi/Topology 碎片，产出调度/应用/容量动作。



在持续改进中，“每周评审性能与碎片”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 每月评审版本与生命周期

Driver/OS/Operator/Framework EOL、CVE、Canary、维修率、备件、容量 Forecast 和成本。确定下一 Release Bundle。



在版本与制品治理中，“每月评审版本与生命周期”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 每次事故回写规则和测试

新增/修改 Metric、Alert、Runbook Branch、Evidence Collector、Recovery Gate 和 Regression Test。只写复盘文档不改变系统会重复故障。



在持续改进中，“每次事故回写规则和测试”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 109 章 · 平台成熟度演进

### Level 1 是人工可运行

节点/Driver/任务靠专家，基础 Inventory/命令存在但不可规模化。目标先标准化和证据。



在持续改进中，“Level 1 是人工可运行”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Level 2 是标准化可重复

Node SKU、Release Bundle、资源模板、监控/Runbook、验收脚本，减少节点差异。



在持续改进中，“Level 2 是标准化可重复”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Level 3 是自动化可运营

状态机、上线/升级/故障 Workflow、Queue/Quota、SLO、CMDB Reconciliation，人工审批高风险。



在持续改进中，“Level 3 是自动化可运营”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Level 4 是数据驱动优化

预测容量、自动回归、碎片优化、成本/能效、故障趋势和动态共享，决策有实验与错误预算。



在持续改进中，“Level 4 是数据驱动优化”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 成熟度不能跳过硬件和恢复基本功

智能调度/自动修复建立在准确 Inventory、支持矩阵、证据、隔离和恢复验收上。基础数据不可靠时，自动化只会更快扩大错误。



在持续改进中，“成熟度不能跳过硬件和恢复基本功”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。

## 第 110 章 · 自动化 Workflow 评审清单

### 目标和授权范围

只读采集、状态标记、Cordon/Drain、升级/Reset 分级；目标 Cluster/Node Pool/故障域和调用身份。



在平台运营中，“目标和授权范围”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 前置条件可机器判断

维护批准、容量/Queue、无不可中断 Job/Context、Checkpoint、Telemetry、制品/回滚可用。



在平台运营中，“前置条件可机器判断”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Target 解析使用稳定身份

Cluster/Node UID/GPU UUID/Rack，不依赖易变 Index/模糊 Label；执行前输出清单和数量。



在安全与治理中，“Target 解析使用稳定身份”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 幂等键和状态持久化

Workflow/Change/Incident ID，每 Step Started/Completed/Artifact，重试从安全点恢复，不重复破坏动作。



在节点生命周期治理中，“幂等键和状态持久化”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 超时、重试和熔断

命令/节点/批次 Timeout，有限 Retry；同类失败超阈值停止全局展开并转人工。



在节点生命周期治理中，“超时、重试和熔断”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 并发受故障域限制

每 Rack/Zone/Node Pool 最大不可用 GPU，实时容量/SLO 低于线自动暂停。



在平台运营中，“并发受故障域限制”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 易失证据先保存

Reset/Reboot/Pod 删除前 GPU/Kernel/Fabric/Workload/Counter；采集失败也记录而不无限阻塞。



在故障响应中，“易失证据先保存”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Dry Run 和审批点

列动作/影响/回滚；高风险 Step 人工确认并检查状态未变化。审批有到期，不能复用旧批准。



在变更编排中，“Dry Run 和审批点”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Rollback 与补偿动作

配置/制品恢复、Taint/Silence/Reservation 清理；不可逆 Firmware/数据动作改用 Roll-Forward/隔离。



在变更编排中，“Rollback 与补偿动作”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 验证按原路径执行

Inventory/Health/Topology/Resource/Benchmark/业务/观察，不以 API 成功作为 Workflow 成功。



在变更编排中，“验证按原路径执行”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### Audit 和通知

Who/What/Why/Target/Before-After/Artifacts/Result，业务 Owner/On-Call/厂商按阶段通知。



在平台运营中，“Audit 和通知”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 权限最小且凭据短期

Collector 无修改，Cordon Bot 无 Uncordon，Updater 限定 Pool，Break-Glass 双人/审计。



在安全与治理中，“权限最小且凭据短期”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 秘密和敏感数据脱敏

Environment/URL/Token/Model/Data/客户内容过滤，Evidence Bundle 外发有 Review。



在安全与治理中，“秘密和敏感数据脱敏”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 结果回写 Source of Truth

CMDB/Node State/Release/Incident/Acceptance 更新；临时人工差异撤销或正式声明。



在平台运营中，“结果回写 Source of Truth”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
### 定期演练失败路径

测试环境模拟命令 Timeout、部分节点失败、控制器重启、Rollback 失败和审批超时，验证不会扩大影响。


在平台运营中，“定期演练失败路径”应被当作一个可验证的控制点，而不是文档里的口号。平台先定义输入、状态和完成条件，再把结果写入作业、节点、资产或事件的稳定标识；这样同一动作由人工或控制器执行时，仍能得到可比的证据。

落地时建议把检查拆成发现、决策、执行、验证四步，并为每步保留时间戳、操作者、版本和关联的 GPU UUID 或 Job ID。发现数据不完整时标记为 Unknown 并停止高风险动作，不能用默认值把未知伪装成健康。对运维人员而言，最有价值的输出是下一步可执行的 Runbook 分支、责任人和回滚边界。

常见误区是只看 API 返回成功或单一平均指标。应同时检查跨控制面的状态是否一致、业务是否真的恢复、临时豁免是否已经清理，以及失败是否会触发无限重试；任何一项不满足，都应保留现场并升级，而不是直接宣布完成。
