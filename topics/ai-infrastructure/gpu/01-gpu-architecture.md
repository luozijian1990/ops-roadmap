# GPU AI Infrastructure 学习笔记 · GPU Architecture

## 第 1 章 · CPU 与 GPU 的执行模型

### GPU 用吞吐换取单线程控制能力

CPU 的设计重点是尽快完成少量复杂线程：较大的缓存、分支预测、乱序执行和控制逻辑可以降低单线程延迟。GPU 则把更多晶体管用于并行执行单元和高带宽内存接口，用较低的单线程控制能力换取同时处理大量数据的吞吐。

这不是“GPU 比 CPU 快”的绝对结论。顺序逻辑、分支密集、数据规模很小或频繁系统调用的任务，可能更适合 CPU；矩阵乘法、卷积、向量变换和批量张量操作具有规则的数据并行性，才适合交给 GPU。

#### GPU 适合 AI 是一条从工作负载到软件库的完整因果链

深度学习会对大量样本、Token、通道和参数反复执行结构相近的张量运算，其中矩阵乘加和卷积占据重要比例。规则、重复且相互独立的数据元素，允许同一个 Kernel 启动大量 Thread；Thread 组成 Warp，以 SIMT 方式对不同数据推进相同指令；大量 Warp 再分布到多个 SM，并在某些 Warp 等待数据时切换到其他可运行 Warp，以并发隐藏延迟。

GPU 还需要持续向这些执行单元供给数据。高显存带宽负责在 HBM 与 SM 之间搬运模型权重、激活和中间结果，Register、Shared Memory 与 Cache 则提高局部复用，避免每次运算都访问 HBM。对于 AI 中常见的矩阵乘加，Tensor Core 提供区别于通用 CUDA Core 的专用执行路径；FP16、BF16、FP8 或 INT8 等较低精度还能减少每个元素的存储和传输成本，并在满足硬件、Shape 与数值条件时提高 Tensor 路径吞吐。

硬件能力不会由业务代码自动充分使用。PyTorch、TensorFlow 等 Framework 通常通过 cuBLAS、cuDNN、TensorRT 等 CUDA-X 库，把高层算子映射到经过目标架构优化的 Kernel。因而 GPU 对 AI 的优势来自工作负载、执行模型、内存系统、专用矩阵单元、数值格式和软件映射共同成立，而不是某一个硬件规格单独成立。

```mermaid
graph LR
    A[规则张量并行] --> B[大量 Thread]
    B --> C[Warp SIMT]
    C --> D[多个 SM 并发]
    E[HBM 高带宽] --> D
    F[Register Shared Cache 复用] --> D
    D --> G[Tensor Core 矩阵路径]
    H[混合精度] --> G
    I[Framework 和 CUDA X] --> G
    G --> J[训练和推理吞吐]
```

这条链上的任一环节未满足，理论优势都可能无法兑现。例如模型能放入显存只证明容量足够，并不证明 HBM 带宽能及时供给；GPU 拥有 Tensor Core 只证明硬件路径存在，并不证明算子实际进入了这条路径；GPU Utilization 很高只证明采样窗口内有 Kernel，也不证明活跃 lane、SM、Tensor Core 或有效业务吞吐都高。

#### CUDA Core 数量不能单独代表 AI 性能

CUDA Core 只是 SM 内的一类通用算术执行资源。跨 GPU 或跨代比较时，Core 数量之外还有多项条件共同决定实际 AI 性能：

| 决定因素 | 它为什么会改变结果 | 运维侧应核对的证据 |
| --- | --- | --- |
| SM 与架构代际 | 调度器、执行管线和每周期能力可能不同 | 型号、Compute Capability、实际 SM Activity |
| Tensor Core 与精度 | AI 矩阵算子可能主要走 Tensor 路径而非 CUDA Core | 实际数据类型、Tensor Activity、Kernel 名称 |
| 时钟、功耗和节流 | 相同资源数量在不同时钟下吞吐不同 | SM Clock、Power、Throttle Reason |
| HBM 容量和带宽 | 容量决定能否放下，带宽决定能否持续供给 | Peak Memory、DRAM Activity、实测带宽 |
| Shape、Batch 和并行度 | 工作量不足时不能填满所有 SM，Shape 不合适时可能回退 | 实际 Batch、输入 Shape、活跃 SM、Kernel 时间 |
| 软件库和 Kernel 选择 | Framework 与 CUDA-X 决定算子映射和架构优化 | Framework/Library 版本、Top Kernel、执行路径 |
| 多 GPU 通信 | Collective 等待会吞噬新增算力带来的收益 | 单卡对照、NCCL 时间、Scaling Efficiency |

因此采购和容量评估要在相同模型、精度、Batch、输入 Shape、软件栈和拓扑下比较端到端结果。只用 CUDA Core 数量或不同口径的峰值 FLOPS 排序，会把“可用硬件单元”误当成“业务可获得吞吐”。

#### 运维选型看并行度、数据复用和传输成本

一个任务即使包含矩阵运算，如果输入很小、Kernel 很短或每次都需要 Host/Device 往返，也可能无法抵消启动和传输开销。选型基准应使用完整 Pipeline，而不是只替换其中一个算子后比较理论 FLOPS。

GPU 优势常在以下边界内缩小或消失：

| 边界 | 为什么 GPU 等待或浪费资源 | 典型时间线表现 |
| --- | --- | --- |
| Batch 或数据规模很小 | Grid 和 Warp 数不足，SM 无法填满 | 短 Kernel 之间有较多 Launch Gap |
| 分支复杂且 Warp 内路径不同 | 不同分支依次执行，部分 lane 被屏蔽 | GPU Busy 但 SM 有效工作和吞吐偏低 |
| CPU 或 I/O 供给不足 | 下一个 Batch 尚未完成解码、读取或拷贝 | Kernel 块之间出现周期性空洞 |
| 通信占比很高 | Rank 等待 Collective，新增 GPU 不能转化为线性加速 | NCCL Kernel 或同步时间占 Step 比例上升 |
| Kernel 粒度过小 | Launch、框架调度和同步成本超过计算时间 | Kernel 很短且调用频繁，CPU 提交成为瓶颈 |
| 数据复用低或访存不规则 | 执行单元持续等待 HBM，更多 Core 无法改善供给 | DRAM Activity 高而 SM 或 Tensor Activity 不成比例 |

小 Batch 不一定错误：在线推理可能为了 P99 延迟主动牺牲吞吐。此时评价目标应是延迟 SLO 下的安全吞吐，而不是强行把 GPU 填满。类似地，通信密集的分布式训练不能只靠更换单卡算力更强的 GPU，还要验证拓扑、NCCL 和网络是否能让新增计算能力得到使用。

#### CPU 仍然决定 GPU 能否持续得到工作

数据解码、Tokenizer、调度、Python 控制流、网络处理和存储客户端常在 CPU 上运行。CPU Core、Memory Channel 或 NUMA 不足会让昂贵 GPU 等待，因此 GPU 节点不能按“CPU 只负责启动”做极限缩减。

#### 运维观察要把业务结果和设备活动放在同一时间线

判断 GPU 优势是否兑现，应先看训练的 Samples/s、Tokens/s、Step Time，或推理的请求吞吐、TTFT、P95/P99 延迟，再用设备与系统指标解释结果。单个利用率百分比不能替代业务指标。

| 观察层 | 关键证据 | 主要回答的问题 |
| --- | --- | --- |
| 业务层 | Samples/s、Tokens/s、Step Time、请求吞吐、P99 | GPU 是否真正改善交付结果 |
| 执行层 | SM Activity、Tensor Activity、Top Kernel、Occupancy | 规则并行和矩阵路径是否被使用 |
| 内存层 | DRAM Activity、实测带宽、Cache、Memory Used | 是容量不足、供给不足还是低复用 |
| 时间线 | CPU、CUDA API、Memcpy、Kernel、NCCL、Synchronization | 等待发生在提交、传输、计算还是通信 |
| 健康层 | SM/Memory Clock、Power、Temperature、Throttle Reason | 硬件是否因功耗、温度或策略降速 |
| 供给层 | CPU、NUMA、DataLoader、Storage、Network | GPU 空洞是否由上游供给造成 |

可以按下列顺序解释一次“GPU 很忙但业务不快”或“GPU 利用率很低”的现象：

```mermaid
graph TD
    A[业务吞吐或延迟异常] --> B[对齐 GPU 和应用时间线]
    B --> C{GPU 是否持续有工作}
    C -->|否| D[检查 CPU IO 数据供给和同步]
    C -->|是| E{SM 和 Tensor Activity 是否匹配预期}
    E -->|否| F[检查 Batch Shape 分支和 Kernel 粒度]
    E -->|是| G{DRAM Activity 或通信占比是否高}
    G -->|是| H[检查带宽 数据复用 拓扑和 NCCL]
    G -->|否| I[检查 Clock Power 和 Throttle]
    D --> J[单变量修复并复测业务指标]
    F --> J
    H --> J
    I --> J
```

最终验证必须回到相同输入和 SLO 下的端到端吞吐、延迟与模型质量。如果 SM 或 Tensor Activity 上升，但训练完成时间、推理 SLO 或数值结果没有改善，就不能把指标变化本身视为有效优化。

### CUDA 应用是 CPU 和 GPU 协同执行的异构程序

CUDA 把 CPU 称为 host，把 GPU 称为 device。程序通常从 CPU 开始，CPU 准备数据、分配显存、启动 GPU Kernel，并在需要时等待结果；Kernel 在 GPU 上由大量线程并行执行。CPU 和 GPU 可以同时工作，最佳性能通常来自两者之间的数据准备、拷贝和计算重叠。

```mermaid
sequenceDiagram
    participant CPU as Host CPU
    participant RAM as Host Memory
    participant GPU as Device GPU
    participant HBM as Device Memory
    CPU->>RAM: 准备输入和控制参数
    RAM->>HBM: DMA 或显式拷贝
    CPU->>GPU: Launch Kernel
    GPU->>GPU: 并行执行
    GPU-->>CPU: Event 或结果
```

运维上，数据路径意味着 GPU 利用率低不一定是 GPU 算力不足，也可能是 CPU 解码、主机内存、PCIe、存储或同步在拖慢工作送入 GPU 的速度。

#### 同步 API 会在时间线上形成空洞

显式同步、阻塞拷贝、频繁读取 GPU 结果或错误的 Stream 依赖，会让 CPU/GPU 无法重叠。应用升级后 GPU 空洞增加时，应比较 CUDA API/Kernel 时间线，而不是先增加 GPU 数。

#### 异步执行需要正确的生命周期

异步返回不代表操作完成。Buffer 不能提前复用，错误也可能在后续同步点才暴露。排障日志要保存最早的 CUDA Error 和此前操作，最后一个同步调用报错不一定是根因。

## 第 2 章 · Thread、Warp、Block、Grid 与 SM

### Thread Block 是 GPU 的调度和协作边界

Kernel 启动时，线程组织成 Thread Block，Block 再组织成 Grid。一个 Block 的线程会被安排在同一个 SM 上运行，可以使用 Shared Memory 并进行块内同步；不同 Block 通常可以按任意顺序被分配到不同 SM，因此不能依赖未同步的跨 Block 执行顺序。

```text
Grid
├── Block 0 -> SM 0
├── Block 1 -> SM 1
├── Block 2 -> SM 2
└── ...     -> 更多 SM
```

这个模型允许同一个 Kernel 在不同规模 GPU 上运行，但也带来一个性能约束：Block 内资源使用过多时，同一个 SM 能同时驻留的 Block 数会减少，延迟隐藏能力随之下降。

#### Block 之间缺少默认全局同步

一个 Grid 内的 Block 可能按任意顺序执行。需要全局同步的算法通常拆成多个 Kernel、使用 Cooperative Group 或其他受支持机制。错误依赖可能表现为偶发数值异常，而不只是性能下降。

#### Block 大小改变资源占用和调度粒度

Block 太小可能无法提供足够 Warp，太大可能因寄存器/Shared Memory 限制驻留。应用团队应提供编译资源报告和 Profiler 证据，平台侧负责确认回归是否只发生在某架构。

### Warp 以 SIMT 方式执行 32 个线程

NVIDIA GPU 通常把一个 Warp 视为 32 个线程的执行组，以 SIMT（Single Instruction Multiple Threads）方式推进。同一 Warp 中的线程执行同一条指令，但可以根据条件分支走不同路径；不满足当前分支的线程会被暂时屏蔽。

当一个 Warp 的线程频繁走不同分支时，会产生 Warp Divergence。硬件仍需依次执行不同路径，导致有效并行度下降。运维人员不需要修改 Kernel，但应知道“GPU Utilization 高”可能只是大量 Warp 在低效率地执行分支。

#### Memory Coalescing 同样发生在 Warp 访问层

同一 Warp 访问连续、对齐的地址更容易合并成较少内存事务；随机或跨步访问会增加事务和 DRAM 压力。高 DRAM Activity、低有效吞吐且同一新算子回归时，可提示应用团队检查访存模式。

#### Divergence 要看热点 Kernel 的占比

某个 Kernel 分支效率低，但只占 0.5% Step Time 时不值得优先处理。Profiler 结论必须附带调用次数、总耗时和业务阶段，避免优化非关键路径。

### SM 是调度、寄存器和执行单元的组合

Streaming Multiprocessor（SM）包含 Warp 调度器、寄存器文件、Shared Memory/L1 Cache 和多类执行单元。GPU 由多个 SM 组成，Block 被放到 SM 后，Warp 才能获得执行资源。

一个 Kernel 能使用多少 SM，不只取决于 GPU 上有多少 SM，还取决于 Grid 中 Block 数量、每个 Block 的线程数和每个线程使用的寄存器/Shared Memory。Grid 太小会让部分 SM 没有工作，资源使用过多则会降低每个 SM 的并发驻留数。

#### CUDA Core 和 Tensor Core 是 SM 内不同的执行路径

CUDA Core 通常执行标量或向量浮点、整数等通用运算；Tensor Core 针对矩阵乘加提供高吞吐路径。不同 GPU 代际会改变一个 SM 内的执行资源、支持的数据类型和调度方式，因此不能把“CUDA Core 数量”跨代直接换算为应用性能。

一个 AI 算子是否使用 Tensor Core，还取决于数据类型、矩阵 Shape、对齐、Framework、cuDNN/cuBLAS/TensorRT 版本和算子选择。硬件拥有 Tensor Core，不代表模型自动获得理论 Tensor 吞吐。

#### SM 数量和 SM 利用率回答不同问题

SM 数量是静态硬件规格，SM Activity/SM Utilization 是运行时活动。大量短 Kernel、Grid 太小、分支发散或寄存器限制都可能让部分 SM 空闲。比较两张卡时，应同时记录 SM 数量、时钟、精度、实际 SM Activity 和应用吞吐。

DCGM Profiling Field 比 `nvidia-smi` 的整体 GPU Utilization 更接近执行资源活动，但仍需与 Kernel 时间线和业务阶段结合，不能把一个平均值当作所有 SM 的精确占用率。

### Thread、Block 和 Grid 的规模要与数据规模匹配

Thread 数量过少会导致 GPU 无法填满；Thread 数量很多但每个任务极短，则可能被 Kernel Launch 和调度开销主导。Block 通常选择为 Warp 大小的整数倍，以免最后一个 Warp 有大量空闲 lane；但实际最佳值仍取决于寄存器、Shared Memory 和 Kernel 访存模式。

Grid 要提供足够多的 Block，调度器才能把工作分散到全部 SM；但 Block 数量超过并行所需后，只会进入待调度队列，并不会让同一时刻的执行资源继续增加。每个 Block 又必须整体满足目标 SM 的寄存器、Shared Memory、线程数和驻留 Block 上限，资源任一项越界都会导致 Launch 失败，接近上限则可能减少并发驻留数。

检查性能时应把以下信息放在一起：Grid/Block 配置、活跃 SM 数、Occupancy、Kernel 时长、显存带宽和应用吞吐。单独增加线程数不是通用优化方法。

实际调优可以在若干 Warp 整数倍之间做阶梯实验，并保持输入、精度和软件栈不变。若更大的 Block 提高理论 Occupancy 却让 Kernel 变慢，应继续检查寄存器 Spill、Shared Memory 竞争和访存事务，而不是把 Occupancy 当作唯一目标；若 Grid 很小，则应先判断算法是否能拆出更多独立 Block。

## 第 3 章 · GPU 内存层次与数据搬运

### Register、Shared Memory、Cache 和 HBM 承担不同职责

GPU 内存层次可以按距离执行单元的远近理解：

| 层次 | 位置和特征 | 主要影响 |
| --- | --- | --- |
| Register | 每线程或局部执行资源，延迟低、容量小 | 使用过多会限制 SM 驻留并产生 spill |
| Shared Memory | SM 内共享，容量有限、可编程 | 适合块内数据复用和线程协作 |
| L1 Cache | SM 附近的缓存资源 | 缓解重复访问的全局内存延迟 |
| L2 Cache | GPU 级共享缓存 | 跨 SM 数据复用和全局访问缓冲 |
| HBM / Device Memory | GPU 显存，容量大、带宽高但延迟更高 | 模型、激活、输入和临时张量 |
| Host Memory | CPU 侧内存，通常经 PCIe 或 NVLink 访问 | 数据准备、Pinned Memory 和溢出路径 |

Shared Memory、L1 和寄存器共享 SM 的有限资源。提高某一层的使用可能挤压另一层，最终降低并发驻留数。

#### Register Spill 会把本应靠近执行单元的数据推向显存

每个线程需要的寄存器太多时，编译器可能把部分局部数据放入 Local Memory。Local Memory 名称里有“Local”，物理上通常仍位于 Device Memory 路径，会经过 Cache/HBM，延迟远高于寄存器。这称为 Register Spill，可能同时降低 Occupancy 并增加显存流量。

开发侧可以从编译器资源报告和 Profiler 观察 Spill。运维侧通常从“同型号节点中某个新镜像 DRAM Activity 上升、吞吐下降、显存占用变化不明显”发现回归，再交给应用团队比较构建参数和 Kernel 版本。

#### Shared Memory 用容量换取数据复用

Shared Memory 适合一个 Block 内的线程重复使用同一批数据。它比反复访问 HBM 更快，但每个 Block 使用过多会减少同一 SM 同时驻留的 Block 数。Shared Memory Bank Conflict 还会把并行访问串行化，使其没有达到预期带宽。

因此“增加 Shared Memory”与“提高 Occupancy”可能方向相反。正确做法是用应用吞吐、DRAM Activity、Occupancy 和 Kernel 时间共同验证，而不是只优化一个资源比例。

#### L1 和 L2 Cache 不能用 Memory Used 观察

`nvidia-smi` 的 Memory Used 主要表示已分配的显存容量，不显示 L1/L2 命中率，也不表示显存接口繁忙。Cache 命中率、DRAM Activity 和实际显存带宽需要 DCGM Profiling 或 Nsight 等工具。平台监控应明确区分容量指标与活动指标。

### 显存容量决定能否放下工作负载

显存容量不足通常直接表现为 CUDA OOM，但 OOM 的成因不只有模型权重：

```text
训练显存
  模型权重 + 梯度 + 优化器状态 + 中间激活
  + 通信缓冲 + 临时工作区 + 框架缓存和碎片

推理显存
  模型权重 + KV Cache + 输入输出 Batch
  + 模型实例 + 临时工作区 + 框架缓存和碎片
```

最大 Batch、最大输入 Shape、上下文长度和并发请求会改变峰值。`nvidia-smi` 的 Memory Used 是当前分配快照，不能代替对最大工作负载、Allocator 碎片和长期 Cache 增长的验证。容量规划应保留余量，并记录 OOM 前的进程、阶段、Shape 和分配器状态。

#### 训练和推理的峰值发生在不同位置

训练峰值可能出现在 Backward 或 Optimizer Step，推理峰值可能来自长 Context、并发 KV Cache 或 Engine Workspace。只在模型加载完成后采一次显存，会漏掉运行峰值。

#### 多进程和共享方案需要进程级归属

Time-Slicing、MPS 或 HAMi 下，同一物理 GPU 有多个进程。总显存正常不表示每个租户符合配额，监控要关联 PID、Container、Pod 和 GPU UUID。

### 显存带宽决定数据能多快被搬运

两个 GPU 可能拥有相近的峰值计算能力，但显存带宽不同。需要反复读取大数组、融合算子不足或数据复用较低的工作负载，可能受 HBM 带宽限制；这时增加 CUDA Core 数量不会线性提升性能。

容量和带宽对应不同问题：容量不足导致工作负载无法运行或频繁换入换出，带宽不足则表现为可以运行但吞吐低。选型时必须同时看模型是否放得下，以及计算阶段能否以足够速度供给执行单元。

#### Memory Used、Memory Utilization 和 DRAM Activity 不是同一件事

| 指标 | 回答的问题 | 常见误解 |
| --- | --- | --- |
| Memory Used | 已分配多少显存容量 | 高值不等于带宽繁忙 |
| Memory Utilization | 采样期内存读写引擎是否活动 | 不是显存容量百分比 |
| DRAM Activity | 显存接口忙碌程度 | 需结合型号峰值和阶段 |
| Memory Bandwidth | 单位时间传输的数据量 | 理论规格不等于实测 |

例如模型权重长期驻留会让 Memory Used 很高，但 Decode 阶段的实际带宽随 Batch 和 KV Cache 访问变化；另一个小模型可能容量占用低，却因低复用访问让 DRAM 接近饱和。

#### 用有效带宽和算术强度理解 Memory Bound

有效带宽可以用“实际读写字节数 / 执行时间”近似估计。算术强度表示每搬运一个字节执行多少计算。算术强度低的算子更容易受内存带宽限制，算术强度高的矩阵乘法更可能受计算吞吐限制。

运维人员不需要手算每个 Kernel，但应要求基准测试同时给出业务吞吐、DRAM Activity、精度和 Batch，避免把理论峰值当成生产可达性能。

### Host 到 Device 的拷贝路径会形成隐藏瓶颈

主机内存到显存的拷贝通常经过 PCIe 或其他互连。频繁的小拷贝、未使用 Pinned Memory、CPU 与 GPU 跨 NUMA、同步等待或重复搬运，都会让 GPU 在 Kernel 之间空转。

常见优化方向包括批量化拷贝、使用异步 Stream、让数据准备与计算重叠、减少中间张量，以及保证 CPU/Memory/GPU 的拓扑亲和。但这些改变需要用端到端时间线验证，不能只观察单次 PCIe 带宽。

#### Pinned Memory 提高 DMA 条件但消耗不可换出的主机内存

Page-Locked/Pinned Memory 便于异步 DMA，但过量使用会减少系统可分页内存并影响节点稳定。DataLoader Worker 数和 Pinned Buffer 大小应有上限，监控主机 Memory Pressure。

#### Unified Memory 迁移会隐藏数据搬运位置

Unified Memory 简化编程，但 Page Fault 和迁移可能在运行时发生。吞吐抖动伴随迁移时，需要 Profiler/Driver 指标确认，不应把所有等待都归因于 HBM 带宽。

## 第 4 章 · 计算精度、产品形态与能力边界

### Tensor Core 让矩阵运算获得专用吞吐路径

CUDA Core 是通用算术执行资源，Tensor Core 针对矩阵乘加等 AI 常见运算提供专用路径。模型使用 FP16、BF16、FP8 或 INT8 时，框架和库可能将算子映射到 Tensor Core，从而提高吞吐并降低显存和带宽压力。

“GPU 有多少 CUDA Core”不能单独代表 AI 性能，因为实际结果还受 Tensor Core 代际、精度、显存带宽、互连、时钟、功耗和软件库影响。比较产品时必须注明精度、稠密/稀疏、单卡/多卡和实际模型。

#### 理论 Tensor 吞吐需要标明条件

厂商规格可能区分 FP16、BF16、FP8、INT8、稠密和结构化稀疏峰值。采购比较必须使用同一精度和稀疏条件，并说明是否包含 Boost Clock；否则数字不可比较。

#### 应用验收看 Tensor Activity 和数值结果

低精度吞吐提高后，还需验证 Loss、准确率、NaN/Inf 和输出质量。性能达标而模型质量退化，不能视为平台验收通过。

### FP32、FP16、BF16、FP8 与 INT8 是工程取舍

| 格式 | 优点 | 主要风险或约束 | 常见用途 |
| --- | --- | --- | --- |
| FP32 | 范围和精度较高 | 显存、带宽和吞吐成本高 | 基线、敏感计算 |
| FP16 | Tensor Core 吞吐高、占用低 | 动态范围较小，训练可能溢出 | 混合精度训练和推理 |
| BF16 | 指数范围接近 FP32 | 尾数精度较低 | 大模型训练 |
| FP8 | 占用和带宽进一步降低 | 依赖硬件、缩放和校准 | 新一代训练和推理 |
| INT8 | 推理吞吐和容量效率高 | 量化误差和校准要求 | 量化推理 |

混合精度不是把所有张量无条件改成低精度。框架可能让矩阵计算使用低精度，同时保留 FP32 累加、主权重或敏感算子。平台验收既要看吞吐，也要看 Loss、准确率、异常值和溢出记录。

### PCIe 与 SXM 是不同的 GPU 服务器形态

PCIe GPU 使用标准扩展卡形态，部署灵活、兼容服务器范围广，但受插槽 Lane、PCIe 代际、供电和风冷能力限制。SXM 是数据中心模块和板级连接形态，通常提供更高功耗预算和更紧密的 NVLink/NVSwitch 集成，需要专用基板、供电和散热设计。

| 维度 | PCIe GPU | SXM GPU |
| --- | --- | --- |
| 适配方式 | 标准插槽 | 专用基板和整机 |
| 互连 | 依赖服务器拓扑和型号 | 通常强调 NVLink/NVSwitch |
| 功耗散热 | 受扩展卡和机箱限制 | 面向高密度液冷或强散热 |
| 维护边界 | 卡级更换相对直观 | 遵循平台级维护流程 |

采购时要比较完整服务器 BOM 和拓扑，不能把 PCIe 与 SXM 版本视为只换了外形的同一产品。

### Compute Capability 描述软件可用的硬件能力

Compute Capability 以 `major.minor` 表示 GPU 架构支持的指令、内存、线程和同步能力。它不是性能分数，也不是 CUDA Toolkit 或驱动版本。应用可能携带面向目标架构的 cubin，也可能让驱动对 PTX 做 JIT；如果二进制和 PTX 都不支持目标 GPU，会出现 Kernel Image 或架构不兼容错误。

```bash
nvidia-smi --query-gpu=name,compute_cap --format=csv
nvcc --version
```

升级框架、TensorRT 或自研 CUDA 扩展前，应建立“GPU 型号—Compute Capability—最低驱动—构建目标”矩阵，并在最老节点执行最小 Kernel 和真实模型测试。

#### Cubin 和 PTX 提供不同的部署路径

Cubin 已针对目标架构生成，启动快但架构范围固定；PTX 可由 Driver JIT 到兼容目标，提供一定前向能力但可能增加首次启动时间，也不保证所有新特性可用。发布制品应记录包含的 `sm_`/`compute_` 目标。

#### 删除旧架构支持是升级风险

Framework、CUDA Library 和第三方 Wheel 会逐步删除旧 Compute Capability。Driver 即使足够新，应用仍可能因二进制未包含旧架构而失败，所以硬件生命周期必须进入软件升级评审。

## 第 5 章 · 利用率、Occupancy 与性能瓶颈

### GPU Utilization 只说明采样窗口有 Kernel

`nvidia-smi` 的 GPU Utilization 主要表示采样窗口内是否有 Kernel 执行，不代表所有 SM、Tensor Core 或显存带宽都已充分利用。串行 Kernel、低效分支、通信 Kernel 或大量小 Kernel 都可能让利用率看起来很高，但有效吞吐不高。

GPU 利用率低时，优先检查数据加载、CPU 解码、存储、网络 Barrier、Kernel 粒度、请求量、进程状态和显存分配失败；利用率高但吞吐低时，检查 Memory Bound、Warp Divergence、Tensor Core 回退、时钟/温度节流和通信比例。

```bash
nvidia-smi dmon -s pucvmet -d 1
nvidia-smi pmon -s um -c 20
nvidia-smi --query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw,clocks.sm,clocks.mem,clocks_throttle_reasons.active --format=csv
```

#### 高 GPU Utilization 但性能低的证据顺序

1. 先确认业务指标确实下降，例如 Step Time、Tokens/s 或 P99，而不是模型或输入发生变化。
2. 检查 SM、Tensor、DRAM Activity，区分计算、显存和低并行效率。
3. 检查 Clock、Power、Temperature 和 Throttle Reason，排除硬件降频。
4. 检查 PCIe/NVLink/NCCL 时间，确认采样中的 Kernel 是否主要在通信。
5. 对比同版本健康节点和上一版镜像，缩小到硬件、拓扑或软件回归。

如果同节点所有工作负载同时变慢，并伴随降频、ECC、XID 或链路错误，按节点问题处理；如果只有一个模型版本变慢，节点健康且微基准正常，优先由应用侧分析算子和 Kernel。

#### 低 GPU Utilization 的证据顺序

先查看 GPU 时间线是否周期性空洞，再对齐 CPU、DataLoader、存储、网络和请求队列。训练中常见锯齿形态是 GPU 计算完成后等待下一个 Batch；分布式训练可能等待最慢 Rank；在线推理可能只是请求不足或动态批处理等待。

低利用率不自动代表容量过剩。需要比较 Queue Time、作业等待、资源分配和有效吞吐：GPU Idle 且 Queue 很长更像调度/配额/碎片问题，GPU Idle 且无请求才可能是正常空闲。

### Occupancy 是隐藏延迟的手段而不是越高越好

Occupancy 是 SM 上活跃 Warp 数与硬件允许最大活跃 Warp 数的比值。足够的活跃 Warp 可以在某个 Warp 等待内存时切换到其他 Warp，但 Occupancy 达到 100% 不代表 Kernel 最快。寄存器和 Shared Memory 使用量、Block 大小、架构限制和访存模式共同决定实际性能。

提高 Occupancy 可能需要减少寄存器或 Shared Memory，但过度压缩会产生寄存器 Spill、更多全局内存访问或重复计算。诊断应先确认真正瓶颈，再决定是否改变 Block、寄存器、缓存或内存布局。

#### 限制 Occupancy 的资源要逐项判断

常见限制包括每个 SM 的最大 Warp/Block/Thread 数、每个 Block 的线程数、寄存器文件容量、Shared Memory 容量以及架构对 Cluster 的约束。不同 Kernel 可能由不同资源限制，不能把一个 Occupancy 数字推广到整条训练任务。

Profiler 报告应和具体 Kernel 名称、调用次数和总耗时绑定。如果低 Occupancy Kernel 只占总时间的 1%，它不是首要优化对象；如果占据主要 Step Time，才值得进一步调整。

### Compute Bound、Memory Bound 和 Launch Bound 需要不同证据

| 现象 | 初步判断 | 重点证据 |
| --- | --- | --- |
| SM/Tensor Activity 高，DRAM 活动相对低 | Compute Bound | 指令吞吐、Tensor Core 使用、算子占比 |
| DRAM 活动高，SM 经常等待 | Memory Bound | 实际带宽、Cache 命中、访存模式 |
| Kernel 很短且数量很多 | Launch/Latency Bound | CPU 发起、Stream、同步和时间线 |
| GPU 周期性空闲 | 数据或同步受限 | CPU、I/O、NCCL、DataLoader、Barrier |
| GPU 高利用率但 Samples/s 低 | 执行效率或通信受限 | Clock、Throttle、通信占比、Kernel 分析 |

```mermaid
flowchart TD
    A[业务吞吐下降] --> B[确认应用和GPU时间线]
    B --> C{GPU是否持续有工作}
    C -->|否| D[检查CPU IO网络和同步]
    C -->|是| E{DRAM或互连是否接近上限}
    E -->|是| F[检查Memory或Communication Bound]
    E -->|否| G{SM或Tensor Activity是否高}
    G -->|是| H[检查Compute Bound和节流]
    G -->|否| I[检查并行度分支和Kernel粒度]
```

结论必须回到应用指标：训练看 Samples/s、Tokens/s、Step Time 和 Scaling Efficiency；推理看请求吞吐、队列时间和 P50/P95/P99 延迟。硬件 Field 负责解释原因，不能代替业务结果。

#### Communication Bound 应独立于 Memory Bound

NCCL Kernel 也会产生 GPU Utilization 和显存读写，但瓶颈可能在 NVLink、PCIe 或 RDMA。训练中通信阶段占比高时，用单卡/单节点/多节点对照和 NCCL Tests 判断，不要只看 DRAM Activity。

#### CPU/IO Bound 的共同特征是 GPU 时间线空洞

CPU、Storage、Network Input 或 Python Control 慢时，GPU 常出现没有 Kernel 的空段。对齐 `pidstat`、`iostat`、网络和应用 Trace 可以区分是哪一层未供给。

## 第 6 章 · 以运维视角建立性能基线

### 基线必须固定硬件、软件和工作负载条件

可比较的 GPU 基线至少记录 GPU 型号和 UUID、Compute Capability、驱动/CUDA 版本、功耗上限、时钟策略、拓扑、CPU/NUMA、NIC、模型、精度、Batch、输入 Shape 和数据路径。只记录“某节点跑了多少 Samples/s”，无法判断换节点、换驱动或换精度后的差异来自哪里。

基线测试建议分三层：单卡计算和显存、单节点多卡 P2P/NCCL、多节点 RDMA/NCCL，最后再用真实训练或推理验证端到端结果。每层都保存原始命令输出、错误日志、温度功耗和时间线。

#### 单卡基线至少包含四类结果

| 类别 | 记录内容 | 目的 |
| --- | --- | --- |
| Inventory | UUID、型号、显存、Compute Capability | 确认测试对象 |
| Health | 温度、功耗、时钟、ECC、XID | 排除硬件异常 |
| Microbenchmark | 计算、显存带宽、Host/Device 拷贝 | 分离硬件路径 |
| Workload | 模型、精度、Batch、吞吐、延迟 | 连接到业务结果 |

基线应给出稳定区间而不是一个最佳数字。生产环境温度、并发和数据路径会波动，验收阈值应来自多轮样本和同型号节点分布。

### 性能回归需要先判断是硬件、软件还是工作负载变化

当吞吐下降时，先确认模型、精度、Batch、输入 Shape 和并发没有变化，再比较 GPU 时钟、温度、功耗、显存、DRAM、互连和通信时间。如果只更换了容器镜像，应优先检查框架构建、CUDA 库、算子选择和环境变量；如果只更换了节点，应优先比较拓扑、驱动、固件和健康状态。

一个实用的归因顺序是先固定工作负载，再做“同制品换节点”和“同节点换制品”两组对照。前者随节点变化而复现，证据更偏向硬件、NUMA、拓扑或节点配置；后者随镜像变化而复现，证据更偏向 Framework、CUDA-X、编译目标或算子回退。两组都不稳定时，再检查输入分布、共享存储和集群并发噪声。

结论应落到最早发生变化的阶段和可复现对照，而不是停在某个相关指标。例如 Step Time 增长若对应 GPU 时间线中的 Host Gap，应继续检查 DataLoader 与 I/O；若只在多卡出现且单卡正常，应转向 P2P/NCCL；若同卡微基准也退化并伴随降频或错误计数，则进入节点健康处置。

不要用永久关闭 P2P、IB 或 GDR 来“证明应用能跑”。这类回退只适合短时二分诊断，最终必须恢复正确路径并重新测量性能，否则故障被掩盖，平台还会长期损失吞吐。

## 第 7 章 · 常见性能症状的诊断案例

### 显存占用很高但 GPU 利用率为零不一定是泄漏

#### 先区分驻留、缓存和执行

Framework 会让模型权重、Allocator Cache 和 KV Cache 长期驻留显存，即使此刻没有 Kernel。Memory Used 高而 GPU Utilization 为零可能是推理服务等待请求、训练处于数据加载/Checkpoint，或者进程已经空闲但保留缓存。

```bash
nvidia-smi --query-compute-apps=pid,gpu_uuid,used_memory --format=csv
nvidia-smi pmon -s um -c 20
ps -fp <pid>
```

把进程显存、请求队列、应用阶段和一段时间内的 Kernel 活动对齐。进程退出后显存仍不能回收，或者占用随请求持续单调增长，才进一步检查上下文残留、泄漏和驱动状态。

#### 处置边界

正常模型驻留不应通过周期性重启“释放显存”；泄漏则应保存增长曲线、请求 Shape 和 Allocator Snapshot。共享 GPU 上一个租户占满显存影响其他租户时，转共享隔离 Runbook。

### GPU 利用率呈周期性锯齿要对齐 DataLoader 和 Checkpoint

#### 典型时间线

```text
GPU Compute  ██████      ██████      ██████
DataLoader         ████        ████
Checkpoint                        ████████
```

计算块之间固定间隔通常指向 Batch 供给或同步；每若干 Step 出现较长空洞可能是 Checkpoint、Evaluation 或日志 Flush。先从应用 Trace/Step Log 确认阶段，再看 CPU、Storage 和 Network。

```bash
pidstat -u -r -d -p <pid> 1
iostat -x 1
nvidia-smi dmon -s pucvmet -d 1
```

增加 DataLoader Worker 可能改善供给，也可能让 CPU、内存和共享存储更拥堵。每次只调整一个参数，并以 Step Time 与 GPU Idle Time 验证。

### Tensor Activity 很低要确认算子是否满足 Tensor Core 条件

#### 可能原因

- 模型使用 FP32 或不支持的精度；
- 矩阵维度/对齐不适合目标库路径；
- Framework 或 CUDA-X 版本选择了其他 Kernel；
- 工作负载本身以非矩阵、Embedding、通信或数据搬运为主；
- 混合精度配置未生效或发生回退。

Tensor Activity 低不自动代表异常。先比较同模型、同精度的健康基线和算子构成；如果升级镜像后 Activity 与吞吐同时下降，再检查 Framework Build、cuDNN/cuBLAS/TensorRT 和自动混合精度日志。

### 功耗低、温度低且吞吐低通常不是散热问题

GPU 没有得到足够工作时，功耗和温度都会低。若同时 GPU/SM Activity 低，优先检查输入、并行度和同步；若 SM Activity 高但功耗异常低，检查 Clock、P-State、Power Limit 和管理员策略。

```bash
nvidia-smi --query-gpu=pstate,power.draw,power.limit,clocks.sm,clocks.mem,utilization.gpu --format=csv
```

不要仅因“温度正常”排除性能问题，也不要为了提高功耗人为增加无效工作。最终目标是业务吞吐和能效，而不是让 GPU 永远接近 TDP。

## 第 8 章 · 异步执行、Stream 与 Event

### 异步 API 把提交完成和执行完成分开

CUDA Kernel Launch 和许多带 `Async` 后缀的 API 对 Host Thread 是异步的：CPU 完成参数检查和入队后即可返回，GPU 可能尚未开始执行。因而日志中的 API 返回时间、GPU 实际开始时间和结果可安全读取时间是三个不同时间点。

```text
Host 时间线  准备参数  提交拷贝  提交 Kernel  继续 CPU 工作  等待结果
GPU 时间线                   执行拷贝      执行 Kernel      完成
```

异步执行的价值不是“API 更快”，而是让 Host 计算、Device 计算和数据传输具备重叠机会。是否真正并发还受 GPU Copy Engine、Compute Capability、数据依赖、Pinned Memory、Stream 语义和资源竞争限制。

#### 异步错误可能延迟到同步点才暴露

Kernel 非法访问可能不会在 Launch 调用处立即返回，后续 `cudaDeviceSynchronize`、内存拷贝或其他同步 API 才报告此前错误。应用只记录最后一个 API，会把故障位置误判为同步函数。

诊断时应：

1. 保存第一个 CUDA Error，而不是只保存进程退出前的最后一个错误；
2. 在最小复现中临时增加受控同步，缩小出错区间；
3. 使用 `CUDA_LAUNCH_BLOCKING=1` 只做诊断，不作为生产性能配置；
4. 记录输入 Shape、Batch、Kernel/算子名称和首次异常时间；
5. 区分应用非法访问、XID 导致 Context 失败和驱动重置后的连带错误。

`CUDA_LAUNCH_BLOCKING=1` 会强制更同步的执行并显著改变时间线。它能帮助定位调用栈，但也可能隐藏竞态或造成性能下降，因此验证完必须移除。

### Stream 表达有序队列和跨操作并发

同一 Stream 中的操作按入队顺序执行；不同 Stream 之间如果没有依赖，Runtime 可以在硬件资源允许时并发调度。Stream 是顺序约束，不是独占执行通道，也不保证两个 Stream 一定并发。

```mermaid
sequenceDiagram
    participant H as Host
    participant S0 as Stream0
    participant S1 as Stream1
    H->>S0: Copy Batch A
    H->>S0: Compute Batch A
    H->>S1: Copy Batch B
    H->>S1: Compute Batch B
    S0-->>H: Event A
    S1-->>H: Event B
```

实现 Copy/Compute 重叠通常至少需要：

- Host Buffer 是 Page-Locked Memory；
- 使用异步拷贝 API；
- 拷贝和 Kernel 放在可并发的 Stream 中；
- GPU 具备相应 Copy Engine；
- 数据分块足够大，能覆盖调度开销；
- 不存在 Default Stream 或显式同步制造的全局依赖；
- Kernel 没有占满所有资源到阻止其他工作推进。

#### Default Stream 语义会制造隐式同步

Legacy Default Stream 可能与其他 Blocking Stream 建立隐式顺序。应用看似创建了多个 Stream，却仍然串行时，应检查编译和 Runtime 使用的是 Legacy Default Stream 还是 Per-Thread Default Stream，并从时间线确认依赖边。

Stream Priority 只是调度提示。高优先级工作不能抢占所有已运行 Kernel，也不等价于 Kubernetes Priority 或业务请求优先级。在线推理与后台任务共卡时，仍需在资源隔离、Kernel 粒度和服务级队列上共同设计。

#### 过多 Stream 会增加管理和竞争成本

Stream 数量不是越多越好。大量 Stream 可能增加 Event、Queue 和 Context 管理开销，使执行顺序难以分析，还会争用相同的 SM、HBM 和 Copy Engine。应从 2 到少量 Stream 做阶梯测试，观察重叠率、吞吐和尾延迟。

### Event 是依赖标记也是设备侧计时工具

CUDA Event 被记录到 Stream 后，只有此前排队的工作完成，Event 才进入完成状态。另一个 Stream 可以等待该 Event，从而表达“只等待必要前置工作”而不是同步整个设备。

```text
Stream A  H2D Copy -> Preprocess -> Event Ready -> More Work
                                      |
Stream B                              Wait -> Inference
```

与 CPU Wall Clock 相比，CUDA Event 更适合测量同一 Device 时间线上的 Kernel 或拷贝区间。计时必须在读取结果前同步结束 Event，否则得到的不是完整耗时。

#### 计时方法决定结论是否可信

GPU 性能实验至少区分：

| 时间 | 包含内容 | 适用问题 |
|---|---|---|
| Event Time | Device 队列中两个 Event 之间的时间 | Kernel 或 Device 操作耗时 |
| CPU API Time | Host 调用 API 的耗时 | Launch 和 Runtime 开销 |
| End-to-End Time | 请求或 Step 的完整时间 | 业务 SLA 与总体吞吐 |
| Queue Time | 请求到获得执行资源前的等待 | 容量和调度问题 |

只报告 Event Time 会漏掉数据准备、队列和网络；只报告端到端时间又难以定位设备阶段。成熟基线应同时保留两类数据。

### 同步范围越大越容易丢失并发

`cudaDeviceSynchronize` 等待整个 Device 此前工作，`cudaStreamSynchronize` 只等待指定 Stream，Event Wait 可以只表达一个依赖点。正确性相同时，应使用最小必要同步范围，避免无关工作互相阻塞。

常见同步放大包括：

- 每个 Kernel 后都同步以便打印日志；
- 每一步都把 Scalar Result 拷回 CPU 做判断；
- 所有 Worker 共用一个 Default Stream；
- 分配或释放内存触发 Device-Wide Synchronization；
- 框架中调用 `.item()` 或同步日志导致 Host 等待；
- 分布式代码在过多位置插入 Barrier。

排查时在 Nsight Systems 时间线中寻找长同步 API、GPU 空洞和 Stream 间依赖。删除同步必须由应用团队验证数据生命周期和数值正确性，平台运维不能直接修改执行顺序。

## 第 9 章 · Unified Memory、页迁移与内存分配器

### Unified Memory 统一地址不等于统一带宽

Unified Memory 让 CPU 和 GPU 可通过统一虚拟地址访问分配对象，Runtime/Driver 负责驻留、页表和必要迁移。它降低编程复杂度，但数据物理上仍位于某个处理器可访问的内存，访问性能由驻留位置和互连路径决定。

```mermaid
flowchart LR
    A[CPU Access] --> B[Unified Virtual Address]
    C[GPU Access] --> B
    B --> D{Current Residency}
    D --> E[Host Memory]
    D --> F[GPU Memory]
    E <--> G[Page Migration]
    F <--> G
```

第一次 GPU 访问 Host-Resident Page 可能触发 Page Fault 和迁移；CPU 随后访问同一页又可能触发反向迁移。CPU/GPU 交替写入形成 Thrashing 时，吞吐会剧烈波动，即使显存和计算指标都未饱和。

#### Oversubscription 是容量退路不是免费扩容

Unified Memory 可以支持工作集大于单卡显存，但超出部分需要在 Host Memory 和 Device Memory 之间迁移。能运行不等于能满足 SLA：如果每个迭代都重新搬运热数据，PCIe 或 C2C 路径会成为瓶颈。

容量规划应区分：

- Allocation Size：进程声明的总虚拟内存；
- Resident Set：当前驻留 GPU 或 Host 的物理页；
- Working Set：一个阶段频繁访问的热数据；
- Migration Rate：页在处理器之间移动的速率；
- Fault/Stall Time：访问等待迁移的时间。

只有 Working Set 能稳定驻留并且迁移可隐藏时，Oversubscription 才可能可接受。在线推理通常比离线批处理更难容忍 Page Fault 尾延迟。

### Prefetch 和访问提示用于减少不可预测迁移

应用可以用 Prefetch 在计算前把 Managed Memory 移到目标 Device，并用 Preferred Location、Accessed By、Read Mostly 等提示表达访问模式。这些提示改变性能策略，不应改变程序正确性。

从平台角度，出现 Unified Memory 抖动时要向应用团队确认：

1. 数据在哪个阶段由 CPU 初始化；
2. 哪些 GPU 会访问以及是否跨 GPU；
3. 是否在 Kernel 前显式 Prefetch；
4. 是否存在 CPU/GPU 交替写；
5. 工作集是否超过 HBM；
6. GPU 与 Host Memory 的 NUMA/互连路径；
7. 新架构是否使用硬件一致性或 NVLink-C2C，不能套用旧平台结论。

#### Grace Hopper 等一致性平台需要单独建基线

具有 CPU-GPU 硬件一致性和高速 C2C 的平台，会改变页表、系统内存访问和迁移成本。它们仍受页大小、TLB、带宽和局部性影响。采购规格中的“统一内存”不能直接推导出所有访问都具有 HBM 性能。

同一应用迁移到不同一致性模型时，应重新比较 GPU Local Memory、CPU Memory、Managed Memory 和 Oversubscribed Case，而不是复用 PCIe 平台阈值。

### Pinned Memory 应作为节点级有限资源治理

Pinned Memory 不会被 OS 换出，便于 DMA 并支持真正的异步 Host/Device 拷贝。DataLoader 常用 `pin_memory` 提高数据供给，但大量进程各自固定 Buffer 会压缩可回收内存，严重时导致节点内存压力或 OOM Killer。

平台应同时观察：

- 每个训练进程的 Worker 数；
- Prefetch Factor 与 Batch 大小；
- Host RSS 和 Locked Memory；
- NUMA Node Free Memory；
- Host-to-Device Throughput；
- GPU 时间线是否真的获得重叠；
- 共享节点上所有 Pod 的总 Pinned Memory。

提高 Pinned Memory 上限前，必须证明瓶颈在 Host Copy 且新增 Buffer 能被复用。把所有 Dataset 全部锁页通常不是正确优化。

### Stream-Ordered Allocator 减少全设备同步

传统 `cudaMalloc`/`cudaFree` 的生命周期和同步成本会影响频繁分配场景。Stream-Ordered Allocator 使用 `cudaMallocAsync`/`cudaFreeAsync` 将分配释放与 Stream 顺序关联，并通过 Memory Pool 复用物理内存，减少全局同步和重复向 Driver 申请资源。

#### Memory Pool 的保留量会影响监控解释

应用释放逻辑对象后，Allocator 可能把物理内存保留在 Pool 中供后续复用。因此 `nvidia-smi` 看到的 Used Memory 不一定立即下降。这种缓存与真实泄漏的区分方法是：

- 查看框架或 Runtime 的 Allocated 与 Reserved；
- 在稳定负载下观察 Reserved 是否达到平台后趋稳；
- 对齐请求 Shape 和峰值阶段；
- 验证显存压力下 Pool 是否能归还资源；
- 进程退出后确认 Context 和显存是否完全释放。

多进程 IPC Memory Pool 还涉及句柄传递和访问权限。共享不是租户隔离机制，不能因为可导出 Pool 就允许不可信 Pod 互相访问。

### 显存碎片要区分地址空间和物理容量

剩余显存总量大于申请大小仍可能 OOM，因为 Allocator 找不到满足条件的连续 Block、工作区瞬时峰值超过可用空间，或其他 Context 同时增长。Virtual Memory Management 可将地址保留和物理映射分开，但框架是否使用、粒度和回收语义取决于版本。

OOM 证据包应包含：

```text
GPU UUID 和总显存
各进程显存占用
Framework Allocated Reserved Active Split
失败申请大小
模型阶段和输入 Shape
最近一次成功 Batch
共享租户和通信 Buffer
Allocator 配置和版本
```

简单重启可以恢复碎片，却不能解释为何复发。生产修复可能是固定 Shape、调整 Batch、限制并发、启用合适 Allocator、减少模型实例，或把工作负载迁移到更大显存资源。

## 第 10 章 · CUDA Graph 与提交开销

### CUDA Graph 把重复工作流从逐项提交变为整体实例化

传统 Stream 模式由 CPU 每轮逐个提交 Kernel、Memcpy 和依赖；CUDA Graph 先定义节点与依赖，实例化后重复 Launch。它主要降低 CPU Launch Overhead，并让 Runtime 看到完整依赖图，而不是提高单个 Kernel 的理论计算能力。

```mermaid
flowchart LR
    A[Input Copy] --> B[Preprocess]
    B --> C[Model Kernel]
    C --> D[Collective]
    D --> E[Output Copy]
```

短 Kernel 很多、迭代结构稳定、CPU 提交成为瓶颈的训练或推理更可能受益。单个长 Kernel 已占据绝大部分时间时，Graph 收益有限。

#### Graph 的收益应从 CPU Gap 和端到端结果验证

至少比较：

| 指标 | Graph 可能改善 | 不一定改善 |
|---|---|---|
| CPU Launch Time | 是 | Kernel 本体计算量 |
| Kernel 间空洞 | 是 | HBM 峰值带宽 |
| Small Batch Latency | 可能 | 大 Batch Compute Bound 吞吐 |
| CPU 使用率 | 可能 | 模型显存容量 |
| Tail Latency | 结构稳定时可能 | 动态 Shape 频繁重建时可能变差 |

实验必须包含 Warmup，排除首次 JIT、Graph Instantiate、模型加载和 Cache 建立时间。

### Stream Capture 能迁移现有代码但有捕获约束

Stream Capture 可以记录一段现有 Stream 工作并转换为 Graph。跨 Stream 依赖需要通过同一捕获图中的 Event 表达；Legacy Default Stream、某些同步 API、动态分配或不支持捕获的库调用可能让 Capture 失败。

平台升级引起 Graph Capture Error 时，需记录：

- Framework 与 CUDA Runtime 版本；
- NCCL、cuDNN、cuBLAS 等库版本；
- Capture Mode；
- Dynamic Shape 和分支；
- 是否在捕获期间做 Host Synchronization；
- 是否包含 Collective 以及所有 Rank 是否按一致顺序捕获；
- Graph 创建、更新还是 Launch 阶段失败。

Graph 与 NCCL 结合时，所有 Rank 的 Collective 顺序仍必须一致。Graph 只改变提交方式，不会自动修复通信不匹配。

### 动态输入可能需要多个 Graph Bucket

Graph 对指针、Shape 和执行结构有稳定性要求。在线推理面对不同 Batch 或 Sequence Length 时，常按 Shape Bucket 维护多个 Graph；Bucket 过少会 Padding 浪费计算，过多会增加实例化时间、显存和管理成本。

设计时记录：

1. Bucket 的 Shape 范围；
2. 每个 Graph 的常驻显存；
3. 未命中时的 Eager Fallback；
4. 首次实例化延迟；
5. 模型更新后 Graph 失效和重建策略；
6. 多副本同时预热造成的功耗与显存峰值。

Graph 优化应纳入模型服务发布验证，不能只在开发环境一次 Benchmark 后默认长期有效。

## 第 11 章 · 从 Roofline 到时间线的性能分析方法

### 先把端到端时间分解再讨论硬件瓶颈

一个训练 Step 可以粗略拆为 Data、Host、Copy、Compute、Communication、Synchronization 和 Checkpoint。各阶段可能重叠，所以总时间不是简单相加；但分解能避免看到 GPU 利用率后直接下结论。

```text
Step Time
├── Data Read and Decode
├── Host Preprocess
├── Host to Device Copy
├── Forward and Backward Compute
├── Collective Communication
├── Optimizer and Synchronization
└── Logging Evaluation Checkpoint
```

先比较单卡、单节点多卡和多节点：单卡已经慢，优先分析计算和数据；单卡正常、多卡变慢，分析 P2P/NCCL；单节点正常、多节点变慢，分析 RDMA 和网络。

### Roofline 用算术强度连接算力与带宽

Roofline 的核心关系是：可达性能受计算峰值与“算术强度乘以内存带宽”两者中较小值限制。

```text
Attainable Performance = min Peak Compute, Arithmetic Intensity x Memory Bandwidth
```

算术强度低时，增加计算单元通常无效；提高数据复用、融合算子、减少中间写回或使用更高带宽显存更重要。算术强度高时，Tensor Core、精度、指令吞吐和时钟更关键。

Roofline 是判断方向的模型，不是用规格表预测真实训练吞吐。实际还受 Cache、分支、Occupancy、同步、通信和 Framework 调度影响。

#### 不同内存层有不同 Roof

L1、L2、HBM 和 Host Link 的带宽与容量不同。数据如果主要命中 Cache，不应拿 HBM 流量解释全部性能；如果频繁经 PCIe 迁移，则 GPU 本地 HBM 峰值也不是有效上限。Profiler 的 Memory Workload Analysis 要和实际数据驻留结合。

### Nsight Systems 先定位阶段而 Nsight Compute 深挖 Kernel

Nsight Systems 面向系统时间线，适合查看 CPU Thread、CUDA API、Kernel、Memcpy、NCCL 和空洞；Nsight Compute 面向单个 Kernel，提供 Occupancy、Warp、Memory、Instruction 和 Roofline 等细节。

推荐顺序：

1. 用业务指标确认回归和影响范围；
2. 用系统时间线找主要阶段和空洞；
3. 按总耗时排序找 Top Kernel；
4. 只对热点 Kernel 使用更深入的 Compute Profiling；
5. 比较健康与异常版本；
6. 回到端到端吞吐和正确性验证。

深度 Profiling 会增加开销并可能需要重放 Kernel。生产环境应先缩小复现，在隔离节点或代表性离线任务采集，避免对在线 SLA 造成未知影响。

### DCGM Profiling 适合集群趋势但不能替代 Kernel Profiler

DCGM 的 SM Active、SM Occupancy、Tensor Active、DRAM Active、PCIe/NVLink 等 Field 适合长期监控和节点间比较。它们是采样聚合值，无法给出具体 Kernel 源码、分支或访存事务。

DCGM Host Engine 会按 Entity 和 Field 维护 Watch、采样周期与保留窗口，多个客户端可共享同一采集流。因此平台应复用节点上的长期 Endpoint，并保存 Timestamp、Entity ID、Field Status 和采样配置；临时启动一个私有 Engine 不仅丢失历史，也会让不同工具看到不一致的缓存和采样节奏。

平台可用 DCGM 找到“哪个 Pod、哪张 GPU、哪个时间段偏离基线”，再用应用 Trace 或 Nsight 深挖。监控层和 Profiler 层是漏斗关系，不是互相替代。

分析 Counter 类 Field 时要计算同一实体、同一采样窗口的增量，Gauge 则要结合业务阶段和时间聚合。某个 Field 显示 `N/A`、过期时间戳或不支持状态时，不能按零值参与告警；先确认 GPU/MIG/NVSwitch 实体、Driver/DCGM 支持和 Watch 是否已经产生首个样本。

## 第 12 章 · 性能实验、基线与变更验收

### A/B 实验一次只改变一个主要变量

Driver、CUDA、Framework、模型、精度、Batch、拓扑、Power Limit 同时变化时，即使性能提升也无法知道原因。变更验收应冻结工作负载和环境，只改变一个主要变量，并保留可回退制品。

每组测试至少包含 Warmup、多轮稳定采样和异常值说明。报告平均值之外，还应给出标准差或分位数；在线推理必须看 P95/P99，训练应看 Step Time 分布和长尾 Step 原因。

#### 基线元数据应机器可读

```yaml
benchmark:
  workload: llama-inference
  model_revision: example-sha
  precision: bf16
  batch_size: 8
  sequence_length: 2048
hardware:
  gpu_model: example
  gpu_count: 8
  topology_id: node-class-a
software:
  driver: example
  cuda_runtime: example
  framework: example
result:
  throughput_unit: tokens_per_second
  samples: 30
```

示例中的版本值必须在真实验收时替换，不能把模板值当作支持矩阵。

### 微基准、组件基准和业务基准回答不同问题

| 层次 | 示例 | 主要用途 |
|---|---|---|
| 微基准 | HBM、H2D、P2P、矩阵吞吐 | 隔离单一硬件路径 |
| 组件基准 | NCCL Tests、Storage Test、Model Engine | 验证一个子系统 |
| 业务基准 | 真实训练或推理 | 验证最终 SLA |

微基准固定数据模式并尽量隔离单一路径，适合回答“硬件和基础链路是否达到同类节点基线”；组件基准把一组真实软件和硬件组合起来，适合判断 NCCL、Storage Client 或 Inference Engine 是否工作在预期路径；业务基准保留模型、数据、调度与服务队列，才回答最终 SLA。

三层测试的版本、拓扑和输入范围必须能相互关联。例如 NCCL Tests 应覆盖业务实际消息大小和 GPU 组合，存储测试应接近真实文件尺寸与并发，Model Engine 要使用目标 Precision/Shape。只跑一个理想大块带宽数字，无法解释真实负载中的小消息、缓存和长尾。

微基准通过不保证业务通过，但微基准失败时业务结果通常不稳定。验收应自下而上执行；业务失败时先找到首个偏离的组件，再回到最小可复现层做单变量对照，而不是反复运行昂贵的完整训练。修复后还要自下而上复测，确认局部恢复确实带来业务收益。

### 性能阈值应来自同类节点分布和业务预算

理论规格只能用于发现数量级错误，不能直接作为生产通过线。合理阈值来自同型号健康节点、相同软件栈和固定测试条件的分布，再结合业务允许退化幅度。

例如把中位健康吞吐记为 `B`，可以定义 Warning 为低于 `0.9B` 持续多轮、Critical 为低于 `0.8B` 且健康指标异常。比例只是方法示意，真实阈值需通过历史数据、噪声和 SLA 校准。

#### 回归结论必须能指向下一步动作

一份有效报告不能只写“性能下降 12%”，还应说明：

- 变化从哪个版本或时间开始；
- 所有节点还是某个故障域；
- 单卡、单节点还是多节点首先出现；
- Compute、Memory、Communication 或 Data 阶段哪个增长；
- 是否伴随 Clock、ECC、XID、PCIe 或网络错误；
- 回滚能否恢复；
- 当前生产限制和后续责任人。

这样性能数据才能进入变更门禁、节点隔离和容量决策，而不是只留在一次性的 Benchmark 文档中。

## 第 13 章 · Warp 调度、延迟隐藏与分支执行

### Warp Scheduler 在可运行 Warp 间发射指令

一个 SM 可驻留多个 Warp。某 Warp 因数据依赖或内存访问未就绪时，Scheduler 可选择另一个 Ready Warp 发射指令，这就是 GPU 用大量并行工作隐藏延迟的核心方式。

```text
Warp 0  Issue -> Wait Memory -----------------> Ready
Warp 1          Issue -> Compute -> Wait
Warp 2                 Issue -> Compute
Warp 3                        Issue -> Compute
```

切换 Warp 不是 CPU 线程那种完整 Context Switch，驻留 Warp 的 Register/State 已在 SM 上。但前提是有足够 Ready Warp；Grid 太小、Occupancy 太低或所有 Warp 同时等待相同内存路径时，延迟无法隐藏。

### Stall Reason 要和指令及访存上下文一起看

Profiler 可能给出 Long Scoreboard、Short Scoreboard、Barrier、Not Selected、Math Pipe Throttle 等 Stall 分类。它们说明 Warp 为什么未发射，不直接等同于根因。

| Stall 方向 | 常见含义 | 下一步证据 |
|---|---|---|
| Long Scoreboard | 等待较长延迟数据依赖 | Global/Local Memory、Cache |
| Short Scoreboard | 等待较近数据路径 | Shared、MIO、特殊单元 |
| Barrier | 等待线程或 Warp 同步 | 分支、工作不均、同步点 |
| Not Selected | Ready 但其他 Warp 被选 | 发射竞争和 Occupancy |
| Math Pipe | 执行管线饱和 | 指令类型和计算上限 |
| No Instruction | 指令获取或依赖问题 | Control Flow、代码布局 |

先按 Kernel 总耗时确定热点，再分析主要 Stall；不能把某个百分比最高的 Stall 脱离 Kernel 贡献解释成整条任务根因。

### Independent Thread Scheduling 改变旧式 Warp 假设

早期架构以 Warp 共享执行状态和 Active Mask 推进线程。支持 Independent Thread Scheduling 的架构会维护更细粒度的线程执行状态，并可在子 Warp 粒度发散与重汇合；这提高了调度灵活性，但没有改变 Kernel 仍以 Warp 组织发射、访存和性能分析的事实。

真正的兼容风险来自旧代码把“当前观察到的 Lockstep”当成同步保证。例如 Warp 内归约、生产者消费者或锁逻辑若缺少 `__syncwarp()` 等显式同步，在一种架构上看似正确，迁移后可能让不同 Lane 看到未完成的数据，产生偶发错误甚至死锁。非原子地让多个线程写同一地址，最终写入者同样没有定义。

平台升级验收不能只跑吞吐基准。对含自定义 CUDA Extension 的模型，应在目标 Compute Capability 上执行数值对照、压力循环和 Compute Sanitizer 类检查，并记录编译目标。只有新架构出现随机数值差异而标准库算子正常时，应把 Kernel 的 Warp-Synchronous 假设列为应用侧排查项，而不是直接归因于 Driver。

### 分支发散的成本取决于路径工作量与重汇合

同一 Warp 的线程走 A/B 两条路径时，两条路径通常分别执行，不活跃 Lane 被 Mask。若一条路径极短，成本有限；若路径都长且分布随机，有效吞吐显著下降。

发散只发生在同一个 Warp 内：两个 Warp 即使执行完全不同的代码，也不会因此互相屏蔽。判断成本时还要看分支出现频率、每条路径的指令量、活跃 Lane 比例以及重汇合位置，不能仅凭源码中存在 `if` 就判定瓶颈；编译器对短分支使用 Predication 时，时间线表现也可能不同。

输入分布会改变发散程度。同一 Kernel 在规则 Batch 上正常、在稀疏或长尾输入上变慢时，应把输入 Shape/类别和 Warp Execution Efficiency 一起对照，并确认该 Kernel 在总 Step Time 中的占比。只有热点 Kernel、分支效率和业务吞吐同时恶化，才能建立有效证据链。

数据按类别重排、使用 Predication 或改变 Work Partition 可能减少发散，但这些属于应用优化，也可能增加排序、额外访存或 Padding 成本。平台侧负责保留健康版本和异常版本的输入、Profiler 与端到端结果，不直接根据单个分支指标要求改写 Kernel。

### Tail Effect 让最后几个 Block 无法填满 GPU

Grid 接近结束时，部分 SM 已完成全部 Block，其他 SM 仍运行长 Block，活跃 Warp 数下降。Block 运行时间差异越大，Tail Effect 越明显。它可能来自数据不均、分支或稀疏工作。

Tail Effect 与平均 Occupancy 不矛盾：Kernel 主体阶段可能有足够驻留 Warp，只在最后一波 Block 中失去并行度。若只看整个 Kernel 的平均 SM Active，这段尾部会被稀释；应在时间线上观察 Kernel 末段，并结合 Waves per SM、Block Duration Distribution 和各 SM 的完成时间判断。

弱扩展尤其容易暴露此问题。固定总工作量却增加 GPU 后，每卡得到的 Block 更少，最后一个长 Block 在局部时间中的占比反而上升，因此卡数增加但吞吐不再线性。输入分片不均、稀疏专家负载和可变长度序列都会制造类似尾部。

可行优化包括增加独立工作单元、让 Block 处理更均匀的数据、调整分块粒度，或在硬件与算法支持时使用动态任务领取机制。优化后要同时验证 Kernel 尾部、端到端吞吐和额外调度开销；单纯缩小 Block 可能增加 Launch/调度成本，不能视为通用解法。

## 第 14 章 · 访存合并、Cache 与 Shared Memory

### Coalescing 决定一个 Warp 产生多少内存事务

相邻线程访问连续且对齐的数据，硬件可把请求合并为较少 Transaction；跨步、随机或不对齐访问会读取更多 Sector/Cache Line，实际传输字节远大于有效数据。

```text
Coalesced
Thread 0 1 2 3 4 5 6 7 -> Adjacent addresses -> Few transactions

Strided
Thread 0 1 2 3 4 5 6 7 -> Far addresses      -> Many transactions
```

有效 Load/Store Throughput、L1/L2 Sector、DRAM Bytes 和 Request 数可帮助判断。DRAM Active 高但业务吞吐低，可能是低效事务，不代表已充分利用有效带宽。

### Shared Memory Bank Conflict 会串行化同一 Warp 的访问

Shared Memory 划分 Bank，同一 Warp 对不同 Bank 的访问可并行；多个线程访问同一 Bank 的不同地址会产生 Conflict，通常拆成多个事务。广播相同地址可能有特殊优化，不能仅按地址重复判断。

二维数组按行主序存放时，Warp 按列访问常产生固定 Stride，使多个 Lane 落到同一 Bank；按行访问则更容易分散到不同 Bank。典型转置可把 `32 x 32` 的 Shared Tile 增加一列 Padding，使列访问不再以相同 Bank 周期重复。新架构的 TMA/Swizzle 也能改变 Shared Layout，但需要和访问索引配套。

诊断应关注 Shared Load/Store Transaction、每请求事务数、相关 Stall 与热点 Kernel 总耗时。仅看到 Shared Memory 使用量高不能证明存在冲突；相反，广播相同地址可能由硬件高效处理，也不能按“多个线程访问同一 Bank”机械判错。

Padding、Swizzle 或改变 Tile Layout 都可能减少 Conflict，但会改变 Shared Memory 容量、地址计算和 Occupancy。优化必须同时比较 Bank Conflict、Kernel Time、驻留 Block 和端到端吞吐，避免修复一个访存指标却因资源占用让整体更慢。

### L2 Cache 是跨 SM 和数据搬运的共享层

L2 承担 Global Memory Cache、跨 SM 数据共享以及部分 Copy/Atomic 路径。应用可对 Access Policy Window 或 Persisting Data 提示 L2 保留，但保留空间是全 GPU 共享资源，多个 Stream/进程可能相互竞争。

Access Policy Window 用地址范围、命中比例和访问属性描述希望优先保留的数据；它是缓存策略提示，不是容量预留或一致性保证。当热窗口大于可用 Set-Aside，或多个 Stream 的 Persisting 区域总量超过容量时，会发生相互驱逐和 Thrashing，收益可能快速消失。

策略结束后还要把访问属性恢复为 Normal，或在合适边界重置持久化 L2 状态，否则上一个 Kernel 的缓存优先级会挤压后续普通/Streaming 访问。MIG 和 MPS 下的控制能力可能不同，因此应用不能假定任意部署形态都能动态设置同一份 L2 策略。

运维验收应比较 L2 Hit、DRAM Bytes、Kernel Time 和端到端结果，并记录工作集、并发 Stream/进程及 MIG/MPS 模式。持久化 Cache 适合反复访问的小热数据集，平台不应把应用特定策略作为所有 Pod 的默认值。

### Texture、Constant 和 Read-Only 路径服务特定访问模式

GPU 还提供适合广播、小常量或空间局部访问的 Cache/Memory Space。运维不需掌握 API 细节，但要知道“HBM 带宽不满”不表示所有内存管线空闲，某个专用路径也可能饱和。

Constant Memory 面向 Kernel 生命周期内只读、容量较小且多个 Lane 常读取相同地址的数据，参数和小型查找表更可能受益；同一 Warp 读取很多不同 Constant 地址时，访问仍可能被拆分。Texture/Read-Only 路径强调特定缓存与空间局部性，旧代码可能使用它们获得历史架构上的优势，但不能推导为当前架构所有非纹理 Load 都更快。

性能回归若只发生在某个自定义 Kernel，应在 Profiler 中按 Memory Space、Load/Store 类型、Cache 命中和指令路径分类。仅用 `nvidia-smi` Memory Utilization 无法区分 Global、Texture、Constant 或 Read-Only 流量，也不能据此要求应用切换内存空间。

这些路径的容量、缓存行为和指令支持随 Compute Capability 变化。跨代迁移应重新编译并做热点 Kernel 对照；平台只维护受支持架构和 Profiler 证据，具体数据布局由应用团队基于实测选择。

### Atomic Operation 可能形成热点地址争用

多个线程对同一地址 Atomic Update 会序列化或争用 Cache Line。Histogram、Embedding Update 和 Sparse Accumulation 常见。GPU Utilization 可很高，但有效更新吞吐低。

Atomic 首先提供 Read-Modify-Write 的不可分割性；它不自动为其他内存位置建立所需顺序，也不保证竞争线程的执行次序。CUDA 的 Scope 和 Memory Order 会决定可见范围与排序成本，能在 Block 内完成的同步不应无条件扩大为 Device 或 System Scope。

争用强度由地址分布决定：每个线程更新不同地址可能有较好并行度，所有线程集中到一个 Counter 则会成为热点。判断证据包括 Atomic Instruction、L2/Shared Throughput、Warp Stall、热点地址分布和 Kernel 总耗时，而不是只统计 Atomic 调用次数。

常见优化是先在 Warp、Block 或 Shared Memory 中局部聚合，再用较少的 Global Atomic 合并；也可以对热点键分片后归并。它们会增加临时存储和归并阶段，应由应用团队实施并验证正确性。平台侧主要识别高利用率下的有效更新吞吐下降，并提供版本与输入分布对照。

## 第 15 章 · 数据传输、Copy Engine 与多 GPU 内存

### H2D、D2H、D2D 和 P2P 是不同传输路径

| 类型 | 起点和终点 | 常见瓶颈 |
|---|---|---|
| H2D | Host Memory 到 GPU | Pinned、NUMA、PCIe |
| D2H | GPU 到 Host Memory | 同步、PCIe、CPU 消费 |
| D2D | 同一 GPU 内地址 | HBM/Copy Engine |
| P2P | 两 GPU Memory | NVLink/PCIe P2P/拓扑 |
| Staged P2P | GPU 经 Host 到 GPU | Host Memory 和双倍 Copy |

报告“Memcpy 慢”必须标明方向、大小、并发、Pinned、GPU UUID 和 NUMA。小传输由固定延迟主导，大传输才接近持续带宽。

### Copy Engine 数量限制可并发方向

不同 GPU 支持的 Async Engine 数和并发能力不同。有的可同时 H2D/D2H 与 Compute，有的组合受限。多 Stream 不会创造额外硬件 Engine，超过能力后任务排队。

能否重叠还取决于传输条件。Host Buffer 未锁页、使用同步 API、Default Stream 引入隐式依赖，或 Kernel 占满关键资源时，即使设备报告支持 Copy/Compute 并发，时间线上仍可能串行。小块传输也可能由固定提交开销主导，看不到持续带宽。

基线应分别测试单向 H2D、单向 D2H、双向传输以及 Copy 与代表 Kernel 并发，并记录消息大小、Pinned 状态、Stream、NUMA 和 GPU UUID。Profiler 时间线用来确认真正的重叠区间，端到端吞吐用来判断重叠是否抵消了额外分块与管理成本。

Device Attribute 和硬件规格只能说明能力上限，不能证明应用已经用到。不能把某代 GPU、某种 PCIe/SXM 形态或一个微基准的重叠结论直接套到另一型号和生产工作负载。

### Peer Access 能力与地址可访问性需要显式建立

多 GPU 进程通常先查询 Peer Access，再在支持的 Device Pair 上启用。能力取决于拓扑、IOMMU/ACS、Driver 和平台。超过 Peer 数或不支持的组合可能回退到 Host Staging。

Peer Access 是有方向的 Device Pair 能力，应用需要在正确的当前 Device 上建立访问关系。启用后既有和后续分配可能都需要建立 Peer 映射，Peer 数量增加会抬高分配管理成本；更细粒度的 VMM API 可以按 Allocation 控制访问，但也把映射和权限生命周期交给应用。

排障时先记录源/目标 GPU UUID、PCI BDF 与 `nvidia-smi topo -m` 路径，再确认应用查询结果和实际传输是否走 P2P。只看到 `cudaMemcpyPeer` 成功并不足以证明走了 NVLink，Profiler、NVLink/PCIe Counter 或 Pairwise Bandwidth 才能识别直连、PCIe P2P 与 Host Staging。

CUDA IPC 可让不同进程共享 GPU Memory Handle，但要求受支持的设备、正确的导入/关闭顺序和有效的原始 Allocation 生命周期。IPC 与 Peer Mapping 都是同信任域进程协作能力，不是安全多租户隔离；共享 GPU 平台应由容器、设备分配和租户边界控制可见性。

### Unified Virtual Address 统一指针空间但不消除位置差异

UVA 把一个进程中的 Host Memory 和各 GPU Global Memory 放进统一虚拟地址空间，不同处理器的 Allocation 通常落在不同地址范围。Runtime 因而可以识别 Pointer 属性，并简化某些 Copy 与多 GPU API 的参数管理；它解决的是“怎样描述地址”，不是“数据已经位于哪里”。

同一个 Pointer 被哪个处理器访问、物理页当前驻留何处、目标 GPU 是否具备 Peer Access，以及实际经过 NVLink、PCIe 还是 Host Staging，仍决定性能。UVA 也不等于 Managed Memory：普通 `cudaMalloc` Allocation 具有统一地址表示，但不会因此自动在 CPU/GPU 间迁移。

VMM 进一步把虚拟地址保留与物理 Allocation/Mapping 分开，可用于跨 GPU 映射和共享，但需要应用显式维护 Access Permission 与生命周期。排障应查询 Pointer/Allocation 属性、源目标 UUID 和 P2P 能力，并用传输 Counter 验证路径；只比较地址值无法判断数据位置或互连质量。

## 第 16 章 · 精度、稀疏与数值稳定性

### 混合精度训练需要 Loss Scaling 与异常检测

FP16 动态范围较小，小 Gradient 可能 Underflow、大值可能 Overflow。Loss Scaling 先放大 Loss/Gradient，更新前再缩放；Dynamic Loss Scaling 在检测到 Inf/NaN 时调整 Scale。

混合精度并不是把模型中所有张量统一转换为 FP16。Framework 通常让矩阵计算使用低精度路径，同时保留 FP32 累加、主权重或数值敏感算子；实际类型选择由 Autocast、算子实现和硬件能力共同决定。Loss Scaling 解决的是 Gradient 表示范围，不会修复错误数据、发散学习率或应用产生的非法值。

Dynamic Loss Scaling 发现 Inf/NaN 后可能跳过一次参数更新并降低 Scale。偶发调整可以是正常稳定机制，持续下降或大量 Skipped Step 则说明当前数值策略不可接受。多 Rank 训练还应保证异常检测和是否跳过 Step 的决定一致，否则参数状态会分叉。

性能监控应同时记录 Tensor Activity、Step Time、Skipped Step、Loss Scale、Inf/NaN 和收敛曲线，并与 FP32 或已知健康配置对照。若升级后吞吐提高但 Skipped Step 增多、Loss 偏离或最终质量下降，不能仅以速度验收。

### BF16 的范围优势不代表所有算子同样稳定

BF16 指数范围接近 FP32，训练大模型通常更易管理，但尾数精度较低。Reduction、Normalization、Optimizer 等敏感操作仍可能使用 FP32 累加。硬件支持、Framework Autocast 和 Library Kernel 共同决定实际路径。

“无需 Loss Scaling”只能理解为 BF16 通常不容易因指数范围过小而 Underflow，不能推导为数值结果天然等同于 FP32。大量小量累加、接近数值边界的归一化和对精度敏感的更新仍可能放大舍入误差，模型代码也可能主动把某些 Tensor 保留为更高精度。

迁移验收应固定 Seed、数据和超参数，比较 Loss 曲线、关键中间统计、NaN/Inf、最终质量以及实际 Kernel 精度。若 GPU 不支持对应 Tensor Core 路径，Framework 可能回退、转换或使用其他 Kernel；此时显存下降不代表吞吐一定提高，应以 Profiler 和端到端结果确认。

### FP8 依赖缩放策略和代际能力

FP8 格式范围/精度更低，通常通过 Per-Tensor/Channel Scaling、Amax History 和更高精度累加使用。是否加速取决于目标 Tensor Core、Shape 和 Library。跨架构迁移需重新验证数值与吞吐。

缩放策略决定真实值怎样映射到有限的 FP8 范围。Scale 更新过慢可能让突发大值溢出，过于敏感又可能让有效精度随 Batch 抖动；权重、激活和梯度也未必适合同一粒度。生产证据应包含实际启用的格式、Scale/Amax 异常、溢出记录和发生阶段，而不是只写配置中声明了 FP8。

FP8 加速还需要目标 GPU、Framework、Library、矩阵 Shape 和算子共同命中支持路径。不支持的算子会保持更高精度或发生转换，过多 Cast/Scale Kernel 可能抵消理论收益。跨架构或升级软件栈时，应重新采集 Tensor Activity、热点 Kernel、显存峰值、吞吐和模型质量。

### INT8/INT4 量化需要代表性校准或量化训练

Post-Training Quantization 使用校准数据确定 Scale，QAT 在训练中模拟量化。校准集不能只覆盖平均输入，还要覆盖长尾 Shape 和业务分布。模型质量、Latency、吞吐、Engine Size 和显存一起验收。

量化粒度可以按 Tensor、Channel 或 Group 划分，权重与激活也可能采用不同位宽和 Scale。INT4 比 INT8 更节省容量，却对异常值、分组方式和支持 Kernel 更敏感；部分算子保持高精度时会产生 Quantize/Dequantize 边界，既影响数值也增加额外访存。

校准数据必须来自有代表性的生产分布，并覆盖长输入、稀有类别和极端值。只用少量平均样本得到的吞吐结果可能很好，却在长尾请求上显著掉点。QAT 能让模型学习量化误差，但带来新的训练、Checkpoint 和发布制品要求，不能与 PTQ 共用同一验收假设。

平台发布时除模型质量外，还要确认 Engine 实际使用目标整数 Kernel，而不是回退到 FP16/FP32；同时比较 P50/P99、吞吐、Engine Size、显存和功耗。任何具体位宽收益都以当前模型、硬件与 Library 的实测为准。

### 结构化稀疏峰值有数据模式前提

规格中的 Sparse Tensor FLOPS 通常要求特定稀疏结构和支持的 Library。普通非结构化零值不会自动获得相同加速。采购报告要明确 Dense/Sparse 口径，业务基准证明模型真正使用稀疏 Kernel。

结构化稀疏要求权重在规定的小分组内满足非零元素模式，并通常需要 Pruning、重新训练或转换来维持质量。零值很多但布局不符合硬件模式时，存储和计算仍可能按稠密路径执行；即使格式满足，算子 Shape、精度和 Library 也必须支持对应 Sparse Kernel。

性能评估要把剪枝前后模型质量、稀疏模式验证、压缩或元数据开销、实际 Kernel 路径和端到端吞吐放在一起。规格表中的 Sparse Peak 不能与另一设备的 Dense Peak 直接比较，也不能据此预估所有层按同一比例加速。

运维侧应把稀疏制品视为独立发布对象，记录生成流程和兼容硬件；升级 Framework、TensorRT 或 GPU 代际后重新验证回退情况。若 Tensor Activity 上升但业务吞吐或质量未改善，仍不应把稀疏路径判定为发布成功。

## 第 17 章 · GPU 架构代际与产品比较方法

### 架构代际改变的是能力组合而不只是 Core 数

代际演进可能改变 SM 组织、Tensor Core 精度、Cache/HBM、Async Copy、Thread Block Cluster、NVLink、Confidential Computing 和视频引擎。某模型收益取决于它是否触发新能力。

跨代比较至少固定：

- 模型和输入；
- Framework/CUDA-X 的共同支持版本；
- Precision 和稀疏条件；
- Power Policy；
- 单卡或完整节点形态；
- HBM 容量与带宽；
- NVLink/NIC 拓扑；
- 成本与能耗口径。

### GPU SKU 名称不能替代完整服务器配置

同一 GPU 可有 PCIe/SXM、不同显存容量、功耗和整机互连。Server CPU、Memory Channel、PCIe Lane、NIC 和 Cooling 也会改变表现。采购验收以 Node SKU/BOM 和拓扑为对象，而非只写 GPU 型号。

相同 GPU 数量放在不同服务器中，可能分别连接到一个或多个 PCIe Root Complex、NUMA Node 与 NIC，GPU 间也可能是 NVLink、PCIe P2P 或必须经过 Host。训练的 Tensor Parallel、推理的多实例放置和 GPUDirect RDMA 都会受到这些路径影响，因此“八卡同型号”仍不是可互换资源。

资产清单至少要绑定整机型号、GPU UUID/PCI BDF、CPU/Memory、NIC/HCA、PCIe/NVLink/NVSwitch 拓扑、Power Limit 和 Cooling 设计。调度器资源类应按经过验收的 Node Class 暴露，不能只用一个通用 `gpu` 标签混合不同互连和容量形态。

采购阶段用完整节点做单卡、Pairwise、单节点 Collective 与真实业务测试；交付后把结果沉淀为同类节点分布。只有 BOM、Firmware 和拓扑一致，性能才适合进入同一比较组。

### Boost Clock 是动态结果不是固定承诺

实际 Clock 由 Workload、Power、Temperature、Voltage 和 Policy 决定。规格峰值不能当持续负载保证。基准报告记录 Average/Min Clock、Power、Temperature 和 Throttle Reason，比较稳定区间。

不同指令组合和精度对功耗、电压与频率的压力不同，因此同一张卡运行矩阵计算、Memory-Bound Kernel 或通信 Kernel 时，稳定 Clock 可以不同。短时采样到峰值只说明某个瞬间达到该频率，不能代表长时间训练或多租户并发下的持续状态。

排障要把 Clock Event/Throttle Reason 与 Power Draw、Power Limit、Temperature、P-State 和业务阶段对齐。接近 Power Limit 且出现相应事件，说明频率受到功耗预算约束；温度低、功耗低、SM Activity 也低时，更可能是供给不足而不是硬件无法 Boost。

验收应在充分 Warmup 后记录分布和最小稳定值，并保持 Power Policy、Application Clock/Lock Clock、散热和环境温度一致。平台若修改功耗上限或频率策略，应作为影响性能与能效的受控变更，而不是为了追求规格峰值临时调参。

### MIG 支持和 Profile 随产品变化

不是所有 GPU 都支持 MIG，不同代际的 Profile、媒体引擎和 Mode 行为也不同。平台资源名称和容量表从实际 GFD/Driver Discovery 生成，禁止用另一型号 Profile 静态套用。

MIG Profile 描述可分配的 Compute Slice、Memory Slice 和显存容量组合，创建还受到芯片内部 Placement 约束。即使名称相似，不同产品上可同时创建的实例组合、媒体引擎能力和重配流程也可能不同；Profile 存在并不保证当前剩余 Slice 能放下它。

平台应通过节点上的 Driver、`nvidia-smi mig` 与 GPU Feature Discovery 发现支持能力，并把 GPU Instance、Compute Instance、MIG Device UUID 和 Pod 资源关联起来。告警和计费不能只回到父 GPU 总量，否则会混淆实例归属；某些共享 FB/BAR1 指标也需要按父实例语义解释。

启停 MIG 或重建 Profile 会影响正在使用的实例，应走 Drain、清理进程、重配、重新发现和健康基准流程。升级 Driver/GPU Operator 或更换 GPU 代际后，重新验证资源名称、调度容量、监控 Field 和工作负载兼容性，不能复用静态 Profile 表。

## 第 18 章 · 四类性能案例的完整推理链

### 案例一是新 DataLoader 让 GPU 周期空闲

现象：镜像升级后 Step Time 增长，GPU Utilization 在计算块间降到零，温度和时钟正常。先确认模型与 Kernel 时间未增长；系统时间线显示 H2D 前长空洞；CPU Worker 满载且 Storage Read 小。

这条证据链把故障定位到“下一个 Batch 尚未准备好”：GPU 的计算块本身没有变慢，PCIe Copy 之前又没有待传数据，而 Worker CPU 已饱和。Storage Read 小可能表示数据已在 Cache 中，进一步支持 CPU Decode、Transform 或 Python 调度成为瓶颈；若 I/O Wait 同时很高，则应转查存储而不是坚持 CPU 结论。

单变量实验可以先回滚 DataLoader 版本，再分别调整 Worker 数、CPU Set、Prefetch 与预处理方式。增加 Worker 不是默认答案：共享 CPU 或内存带宽已经饱和时，它会加剧竞争；启用更多 Pinned Buffer 也可能引发节点 Memory Pressure。

只有 H2D 前空洞缩短、Step Time 恢复且训练结果一致，才算验证归因。最终修复要把 CPU/Memory 配额和 DataLoader 参数写入工作负载基线，避免换节点或并发任务后再次出现供给不足。

### 案例二是显存带宽高但有效吞吐下降

现象：GPU Utilization 和 DRAM Active 都高，新算子后 Samples/s 下降。Profiler 显示热点 Kernel Global Load Transaction 增加、Cache Hit 下降、有效字节未同比增加。

GPU Utilization 高说明采样窗口持续有 Kernel，DRAM Active 高说明显存接口繁忙，但两者都不保证搬运的是有效业务数据。Global Load Transaction 增长而有效字节不变，意味着每份有效数据触发了更多 Sector/Cache Line 或中间写回；Cache Hit 同时下降，使问题更符合访问布局变化而非算力不足。

应用侧应把旧新版本的 Top Kernel、请求字节与实际 DRAM Bytes、Load/Store Efficiency、L2 命中和中间 Tensor 数量并排比较。用固定输入单独运行该算子，能把 Framework 调度和通信噪声移除；若回滚 Kernel 或 Layout 后事务数与吞吐同时恢复，归因才闭环。

增加 GPU 或 Power Limit 通常无法解决单卡上的低效访存，甚至会复制相同浪费。修复可能涉及 Coalescing、算子融合、Tensor Layout 或减少 Materialization，但必须重新验证数值、Kernel Time 和端到端 Samples/s，不能只追求 DRAM Active 下降。

### 案例三是八卡训练只在某个 GPU 组合变慢

单卡全部正常，GPU0-3 NCCL 正常，GPU0/2/5/7 慢；Topology 显示后者跨 NVLink/NUMA 域，NCCL Transport 发生变化。根因是放置组合而非坏卡。

单卡基线排除了明显的计算与 HBM 问题，而“性能随 GPU 组合变化”把范围收敛到 Pairwise Path、CPU/NIC Affinity 和 Collective 拓扑。此时要记录每个 Rank 的 GPU UUID/Local Rank，并用 `nvidia-smi topo -m`、P2P Capability、Pairwise Bandwidth 和 NCCL Debug 确认实际 Transport，不能只看逻辑设备号。

短时二分可以把任务限制到同一 NVLink/NVSwitch 域，再换成跨域组合；如果慢只跟跨域 Placement 走，说明调度没有满足 Parallel Group 的拓扑预算。若固定为同类路径后某一个 Pair 仍显著偏离，才进入 NVLink/PCIe Counter、AER、XID 和硬件链路检查。

修复应使用完整 GPU Group、整节点或 Topology-Aware 调度，并把可接受组合写入资源类。验收覆盖至少两个同类节点和多轮 Collective/业务测试，避免用一次偶然正常的 Rank 排列掩盖放置问题。

### 案例四是 GPU 高利用但推理 P99 上升

平均 Tokens/s 提高，但 P99/TTFT 变差；Dynamic Batching 等待窗口增大且长 Prompt 与短请求混批。GPU 端更“满”，却牺牲请求排队。

该现象说明吞吐与尾延迟目标发生冲突：更大的 Batch 提高矩阵执行效率，却让早到请求等待凑批；长短请求混合还会产生 Padding、Head-of-Line Blocking 或 Decode 时间差异。GPU Utilization 上升只是设备更忙，不能证明每个请求得到更好的服务。

分析时把 Queue Time、Batch Formation、Prefill、Decode 和网络返回分别计时，并按 Prompt/Output Length、模型实例和优先级分桶。若 Kernel 时间稳定而 Queue Time 增长，主要矛盾在批处理策略；若长 Batch 还让 KV Cache 压力或 Decode 时间上升，则需同时评估容量边界。

调整目标不是降低利用率本身，而是在 SLO 下重新设置 Batch Delay、Token Budget、实例数、并发上限和请求分桶。阶梯压测要覆盖突发与长尾输入，最终以 P99/TTFT、错误率和安全吞吐共同验证，并保留过载时的排队或拒绝策略。

## 第 19 章 · 性能分析证据清单

### Inventory 快照固定比较对象

记录 UUID、型号、Compute Capability、显存、Driver、Power Limit、Clock、PCI BDF、MIG 和 Node SKU。两次测试对象不一致时停止直接比较。

逻辑编号会随重启、容器可见性和调度分配变化，长期关联应使用 GPU/MIG UUID，并保留 Node、PCI BDF 与 Driver 看到的当前 Index。多卡任务还要保存 `nvidia-smi topo -m` 或等价拓扑，使 Rank 到 GPU、NUMA 和 NIC 的映射可重建。

快照应在测试开始前采集，并与原始结果一起归档。型号相同但 Power Limit、MIG Mode、Firmware、PCIe Width 或整机 BOM 不同的节点不能直接放进同一分布；先消除差异，或将其明确标为不同 Node Class。

### 应用清单固定业务条件

Model/Code/Data/Image、Precision、Batch、Sequence/Input Shape、Parallelism、Warmup、Iteration、Seed 和质量结果。参数进入机器可读 Manifest。

训练还要写明 Global/Micro Batch、Gradient Accumulation、并行组和 Checkpoint 阶段；推理则记录并发、请求长度分布、Batch Delay、Prefill/Decode 口径和缓存状态。同名模型只要 Revision、Tokenizer、输入分布或 Engine 不同，就不能默认视为同一负载。

Manifest 要随性能样本保存，而不是只留在人工报告中。测试程序应在启动日志打印实际生效配置，用于识别环境变量、默认参数或配置覆盖造成的“声明值与运行值不一致”；质量结果缺失时，低精度或 Kernel 优化不能通过发布门禁。

### 时间线回答 GPU 为什么有空洞

CPU Thread、CUDA API、Memcpy、Kernel、NCCL、Synchronization 和 NVTX/业务阶段。先找占比和依赖，再深挖 Kernel。

采集窗口要覆盖稳定阶段和至少一个异常周期，并用 NVTX、Step ID 或 Request ID 把设备事件对齐到业务阶段。若只截取 Warmup、首次 JIT 或模型加载，得到的空洞不能代表稳态；采集过长又会增加开销并淹没关键片段。

解释空洞时查看它前后的依赖：H2D 前空白可能来自 DataLoader，Collective 前等待可能是慢 Rank，频繁同步 API 可能由 Host 强制串行。时间线负责定位“等待发生在哪里”，确认 CPU、I/O、网络或 Kernel 根因还需要下一层指标与对照。

### Kernel 排名按总耗时而非单次耗时

单次很慢但只调用一次可能不是主因；短 Kernel 调用百万次会主导。保存 Count、Average、Total、占 Step 比例。

排名必须限定同一业务阶段和可比输入。训练的 Forward、Backward、Optimizer 与通信 Kernel 构成不同，推理的 Prefill 和 Decode 也不应混成一个平均值；名称相同但 Shape 不同的 Kernel 可以按调用上下文或尺寸继续分组。

先对总耗时贡献最大的少数 Kernel 做深度 Profiling，再结合 P50/P99 Duration、Launch Gap 和版本变化判断优化价值。优化某个单次最慢但总占比很小的 Kernel，即使局部提升很大，也通常无法显著改变端到端结果。

### Occupancy 证据包含限制资源

Threads/Block、Registers/Thread、Shared/Block、Active Block/Warp 和理论/实测 Occupancy。低值是否影响热点性能由 Stall/实验确认。

理论 Occupancy 根据目标架构资源上限和 Kernel 静态需求计算，实测 Active Warp 则受执行阶段、分支和调度影响。报告必须写明是 Registers、Shared Memory、Threads 还是 Resident Block 上限限制驻留，否则“Occupancy 低”无法指向动作。

提高 Occupancy 只是为了提供更多 Ready Warp 隐藏延迟。若热点 Kernel 已经 Compute-Bound，或减少寄存器导致 Spill，数值上升可能反而变慢；应通过 Block/Resource 单变量实验，连同 Stall、Kernel Time 和端到端吞吐共同判断。

### Memory 证据区分容量和活动

Allocated/Reserved/Peak/Failed Request、DRAM Active/Bytes、L1/L2 Hit/Sector、Load/Store Efficiency、Page Migration。Memory Used 单值不够。

容量证据回答模型是否放得下以及 OOM 在哪个阶段发生，活动证据回答执行时怎样搬运数据；两者可以完全不同。模型权重长期驻留会让 Used 很高但 DRAM 不忙，低容量算子也可能因低复用访问把显存接口压满。

采集时标注 Forward/Backward、Prefill/Decode、Checkpoint 等阶段，并保存 Allocator 的 Allocated/Reserved 与失败申请大小。若使用 Unified Memory，还要加入驻留、Fault 与 Migration；若分析访存效率，则把实际 DRAM Bytes、Cache/Sector 和热点 Kernel 对齐，不能用节点级平均替代。

### Compute 证据区分 CUDA 与 Tensor 路径

SM/Tensor Active、Instruction/Precision、Clock/Power/Throttle、Top Kernel 和理论规格口径。低 Tensor Active 先确认工作负载是否应使用。

CUDA Core、Tensor Core 和其他执行管线处理的指令不同，整体 GPU Utilization 无法说明哪条路径饱和。报告理论峰值时必须标注 Precision、Dense/Sparse、Clock 条件和产品形态，实测则记录热点算子的实际数据类型与 Kernel。

Tensor Active 低可能是矩阵 Shape、精度或 Library 回退，也可能因为业务由 Embedding、归约、访存或通信主导，本来就不应持续使用 Tensor Core。只有与同模型健康基线相比路径发生变化且吞吐同步下降，才进入算子/软件栈回归排查。

### 传输证据标明方向和拓扑

H2D/D2H/D2D/P2P、Bytes/Size Distribution、Pinned、Stream、Overlap、Source/Destination UUID、NUMA 和 Path Code。

传输带宽必须与大小和方向一起解释：小消息多由固定延迟主导，大消息才接近持续带宽；双向并发还会受到 Copy Engine 与共享链路限制。H2D/D2H 要记录 Host Buffer 是否 Pinned 及 CPU Memory 的 NUMA，P2P 要确认直连、PCIe 或 Host Staging。

时间线用于确认 Copy 是否和 Compute 真正重叠，Pairwise Test 与 PCIe/NVLink Counter 用于验证路径。只报告一个“Memcpy GB/s”而没有端点 UUID、消息分布和拓扑，既不能跨节点比较，也无法判断回归属于应用分块还是硬件链路。

### 通信证据从单卡对照开始

单卡 Step、单节点、多节点，Collective/Message/Rank/NCCL Transport、NVLink/RDMA Counter。NCCL Kernel 活跃不等于网络健康。

单卡已经慢时，先解决计算、显存或数据供给；单卡正常而单节点多卡慢，重点检查 GPU Pair、P2P、NVLink/PCIe 与 Rank Placement；只在多节点退化，才把 HCA、RDMA、Rail、MTU 和 Fabric 纳入主路径。分层对照能避免一开始就在整个网络里盲查。

通信报告要按 Collective、消息大小和 Rank 保存耗时分布，并记录 NCCL 选择的 Transport 与拓扑。某个 Rank 的等待可能是它自己链路慢，也可能是在等另一 Rank 的计算，因此要把 Collective 进入时间、Link Counter 和最慢 Rank 一起对齐。

### 主机证据覆盖供给侧

CPU/NUMA、Run Queue、DataLoader、Memory Pressure、Pinned/Swap、Storage Read、Network Input 和 Python/GC。GPU Low Util 不先扩卡。

CPU 总利用率会掩盖单 Core 饱和和错误 NUMA。应查看进程/线程 CPU、Run Queue、Context Switch、CPU Set 与 Memory Binding，并把 DataLoader、Tokenizer、通信 Progress Thread 和应用主线程分开；容器配额和宿主机争用也要同时记录。

GPU 时间线的空洞要与 Host 指标、Storage/Network I/O 和应用阶段按时间对齐。若 GPU 等待 Batch，增加 GPU 只会放大空闲成本；先用预处理、缓存、Worker/CPU 配额或亲和性的小范围实验证明供给恢复，再重新评估需要的 GPU 数。

### 健康证据排除降频和错误

Temperature/Power/Clock/P-State/Throttle、ECC/XID/AER/NVLink，测试前后 Counter Delta。健康异常优先隔离，不继续追软件微优化。

Counter 要区分 Gauge、累计值和事件，并保存测试前后增量。旧的累计 ECC 或 Link Error 不一定由本次任务触发，新出现的 XID、AER、Uncorrectable ECC 或链路降级则需要与首次性能异常时间对齐；多 GPU 节点还要记录准确 UUID/BDF，避免隔离错卡。

先保留应用首错、Kernel Log、DCGM/NVML 状态和当时的功耗时钟，再按 Runbook 停止新调度或隔离节点。Reset、重启或清零 Counter 会破坏现场，只有证据采集完成且符合平台维护边界后执行；硬件健康恢复后还需跑基线才能重新入池。

### 结论必须有对照实验

回滚版本、健康节点、固定拓扑、单变量参数或禁用路径的短时对照。相关性转成可重复差异后才进入根因。

有效对照要求除一个主要变量外，硬件、输入、Warmup、并发和测量窗口保持一致，并至少重复多轮说明波动。临时禁用 P2P、GDR 或某算法只能用于二分定位，还要有恢复原配置后的复测，不能把降级路径直接当成永久修复。

报告应明确假设、实验变量、预期、实际结果和可证伪条件。若差异不能稳定复现，应保留为相关线索并继续缩小范围；只有变量跟随、回滚恢复且证据链一致，才把它提升为根因。

### 优化后回到业务和数值

Step/Tokens/Latency、P99、Peak Memory、Power/Energy、Loss/Accuracy/NaN。Kernel 指标改善但端到端无收益，不作为发布理由。

局部优化可能把成本转移到别处：融合减少 Launch 却增加寄存器，扩大 Batch 提高吞吐却恶化 P99，低精度提速却改变模型质量。验收要复用与变更前相同的数据和 SLO，并覆盖稳态、峰值输入和长时间运行。

最终报告同时给出性能、容量、能效和正确性结果，以及回滚条件。Kernel Time、Cache Hit 或 Tensor Activity 只能解释为什么变化；能否发布仍由训练完成时间、推理 SLO、错误率和模型质量共同决定。

## 第 20 章 · 运维人员需要识别的 CUDA 执行语义

### C++、Python 和 Tile API 是不同入口但共享同一设备执行模型

CUDA C++ 通过 `nvcc`、Runtime/Driver API 和 Kernel Launch 直接控制设备；CUDA Python 可以通过 CuPy、Numba、`cuda.core` 等入口调用库或生成 Kernel；Tile API 则把分块加载、矩阵乘、归约和边界处理提升到 Tile 抽象。平台运维不必掌握完整语法，但应知道三者最终都受到 Compute Capability、Driver/Toolkit 兼容、Grid/Block 规模、显存分配和异步错误语义约束。

因此故障单不能只写“CUDA 程序失败”。至少记录语言入口、Framework/Compiler、实际加载库、目标架构、首次失败 API 和同步点。Python 报错可能来自 JIT 编译、Native Extension 或底层 CUDA；C++ 二进制可能因缺少目标架构代码或 Driver Entry Point 失败；Tile Kernel 的性能异常仍需回到 Occupancy、访存和同步证据。

```text
Source or Framework
  -> compiler or JIT
  -> CUDA Runtime or Driver API
  -> kernel launch and asynchronous execution
  -> GPU architecture and memory hierarchy
```

### Stream、Cooperative Groups 和依赖启动改变并发边界

不同 Stream 只有在不存在依赖、隐式同步且硬件资源充足时才可能并发。`cudaDeviceSynchronize()` 会等待整个设备，`cudaStreamSynchronize()` 只等待目标 Stream；默认 Stream、部分内存操作和过早同步会无意间串行化时间线。Stream Priority 是提示，不会抢占已经运行的长 Kernel。

Cooperative Groups 把同步和 Collective 的参与范围显式化；Programmatic Dependent Launch 允许后继 Kernel 的独立前段与前驱尾部重叠。这些机制一旦使用错误，症状可能是部分 Rank 卡住、结果不完整或时间线没有预期重叠。诊断时保存 Stream、Event、Group 范围和所有 Rank 的最后进度点，不能仅凭 GPU Utilization 判断死锁。

### Cluster、Work Stealing 和 Dynamic Parallelism 会改变普通 Block 假设

Thread Block Cluster 要求一组 Block 在同一 GPC 协同执行，会引入 Cluster Dimension、Distributed Shared Memory 和额外资源约束。Cluster Launch Control 可取消尚未开始的 Block/Cluster，让已经完成固定工作量的 Block 领取剩余任务，以改善尾部负载不均。CUDA Dynamic Parallelism 则允许设备侧启动子 Grid，并带来父子 Grid、可见性、Pending Launch 和额外内存开销。

这些不是所有 GPU 都支持的通用能力。出现“旧卡正常、新 Kernel 无法启动”或“升级后 Occupancy/尾效应变化”时，应核对 Compute Capability、编译目标、Launch Attribute、Cluster/Block 整除关系和运行时限制。平台基准应使用真实二进制，不用简单 Vector Add 代替包含 Cluster 或设备侧 Launch 的业务。

### 异步错误必须在第一个可观测边界捕获

Kernel Launch 通常先返回控制权，非法内存访问等执行错误可能在后续同步、拷贝或完全无关的 Runtime API 才暴露。日志中的“报错 API”不一定是“致错操作”。应用应检查 Launch 返回值，并在调试或关键阶段设置窄范围同步点；平台采集首错、CUDA Error State、Core Dump/Compute Sanitizer 结果和时间线。

Driver Entry Point 还存在 API 版本、Per-Thread Default Stream 版本和动态符号获取差异。`cuGetProcAddress` 或 Runtime 包装层失败时，优先核对实际 `libcuda.so` 来源和 Driver 支持，而不是把错误归因于 GPU 硬件。CUDA Error Log Callback 可提供结构化组件、级别和消息，但属于进程内诊断能力，不能替代 XID、DCGM 和 Kernel Log。
