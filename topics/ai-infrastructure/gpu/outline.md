# GPU AI Infrastructure 八篇学习笔记编辑地图

> 这是正式笔记的编辑地图，不是学习路线正文。`scripts/build-roadmaps.sh` 会跳过本文件。

## 主题定位

本主题面向运维工程师、SRE 和平台工程师，围绕 GPU 硬件、节点拓扑、分布式通信、NVIDIA 软件栈、资源共享、Kubernetes 平台、可观测性与架构设计建立一条连续学习主线。

不把 CUDA Kernel 编程、机器学习算法、Slurm、存储、推理运行时、硬件维修或平台治理单独扩展成分册。这些内容仅在能够解释 GPU 基础设施的数据路径、资源交付、性能诊断或项目设计时纳入相应主线。

## 正式文档

### 01 · GPU Architecture

**文件**：`01-gpu-architecture.md`

**目标**：从运维视角解释 GPU 的执行模型、内存层次、数值精度和性能瓶颈。

**内容边界**：CPU 与 GPU、Thread/Warp/Block/Grid、SM、CUDA Core、Tensor Core、Register、Shared Memory、Cache、HBM、PCIe、SXM、Compute Capability、精度、利用率、Occupancy、Compute Bound、Memory Bound、Profiler 和性能基线。

### 02 · Topology / NVLink / NVSwitch

**文件**：`02-topology-nvlink-and-nvswitch.md`

**目标**：解释 CPU、内存、GPU 和 NIC 之间的数据路径，以及拓扑为什么会改变多卡性能和故障域。

**内容边界**：PCIe Root Complex、NUMA、Affinity、P2P、NVLink、NVSwitch、Fabric Manager、Fabric 分区、拓扑发现、链路诊断和拓扑感知调度。

### 03 · NCCL / RDMA / Network

**文件**：`03-nccl-rdma-and-network.md`

**目标**：建立从单机集合通信到跨节点 GPUDirect RDMA 的通信模型，并解释分布式训练运行时如何使用这条路径。

**内容边界**：Rank、Communicator、Collective、Ring/Tree、NCCL Transport、RDMA、InfiniBand、RoCE、GPUDirect RDMA、多 Rail、PFC/ECN/MTU、并行策略、Checkpoint、Elastic、Straggler 和分层排障。

### 04 · NVIDIA Software Stack

**文件**：`04-nvidia-software-stack.md`

**目标**：串联 Driver、CUDA、CUDA-X、容器和 AI Framework，并覆盖训练与推理运行时的兼容、发布和诊断边界。

**内容边界**：Driver、Runtime、Toolkit、CUDA Compatibility、cuDNN、NCCL、TensorRT、Triton、Container Toolkit、libnvidia-container、CDI、NGC、PyTorch、动态库、镜像供应链和推理服务运行时。

### 05 · GPU Resource Sharing / HAMi

**文件**：`05-gpu-resource-sharing-and-hami.md`

**目标**：比较物理独占、硬件切分、时间复用、进程协作、软件 vGPU 和虚拟机直通的隔离与运营边界。

**内容边界**：Full GPU、MIG、Time-Slicing、MPS、HAMi、vGPU、PCI Passthrough、IOMMU/VFIO、显存限制、算力限制、计量、Capability 权限和共享方案选择矩阵。

### 06 · Kubernetes GPU

**文件**：`06-kubernetes-gpu.md`

**目标**：解释 GPU 如何成为 Kubernetes 扩展资源，并覆盖从节点上线到升级、隔离和恢复的完整生命周期。

**内容边界**：Device Plugin、Kubelet、GPU Operator、GPU Feature Discovery、RuntimeClass、CDI、DRA、Node Label、Taint/Toleration、Affinity、配额、队列、Gang Scheduling、资源碎片和节点 Runbook。

### 07 · Observability / Troubleshooting

**文件**：`07-observability-and-troubleshooting.md`

**目标**：把硬件、性能、平台和工作负载指标转化为证据、告警、故障隔离、修复和恢复验证。

**内容边界**：DCGM、温度、功率、时钟、ECC、XID、PCIe、NVLink、NVSwitch、Firmware/RAS、GPU Missing、Driver/CUDA/Container/Kubernetes 故障、NCCL/RDMA 故障、统一证据包和安全命令手册。

### 08 · Architecture Design

**文件**：`08-architecture-design.md`

**目标**：从工作负载需求出发，完成 GPU 平台的容量估算、技术选型、验收和长期运营设计。

**内容边界**：训练与推理需求、显存和 GPU 数量、网络和存储容量、GDS、DPU、Power/Cooling、Bare Metal/Kubernetes/Slurm 选择、虚拟化与安全、Benchmark、验收、自动化、SLO、治理和项目交付。

## 原 17 册迁移关系

| 原分册 | 新归属 |
|---|---|
| 00 全景与工作负载 | 08 Architecture Design |
| 01 GPU 架构与性能 | 01 GPU Architecture |
| 02 拓扑、NVLink 与 NVSwitch | 02 Topology / NVLink / NVSwitch |
| 03 NCCL、RDMA 与 AI Network | 03 NCCL / RDMA / Network |
| 04 CUDA 软件栈与容器 | 04 NVIDIA Software Stack |
| 05 Kubernetes GPU 平台与资源共享 | 按章节拆入 05 Resource Sharing 与 06 Kubernetes GPU |
| 06 可观测性与故障排查 | 07 Observability / Troubleshooting |
| 07 架构、容量与验收 | 08 Architecture Design |
| 08 Storage、GDS、DPU 与设施 | 08 Architecture Design |
| 09 裸机、Slurm 与作业运营 | 08 Architecture Design |
| 10 推理服务与模型运行时 | 04 NVIDIA Software Stack |
| 11 虚拟化、安全与云 | 虚拟化资源边界进入 05，其余进入 08 |
| 12 硬件、Firmware 与 RAS | 07 Observability / Troubleshooting |
| 13 Benchmark 与回归门禁 | 08 Architecture Design |
| 14 平台自动化、治理与 SRE | 08 Architecture Design |
| 15 分布式训练运行时与韧性 | 03 NCCL / RDMA / Network |
| 16 运维命令与证据手册 | 07 Observability / Troubleshooting |

## 编辑和发布约束

- 每篇只保留一个 H1；H2 是章节，H3 是 Roadmap 学习节点，H4 是节点内部知识点。
- 每个 H3 后保留必要的来源说明，但不要把内部来源路径暴露到最终笔记。
- H2 与第一个 H3 之间不放正文，避免 Roadmap Parser 丢失内容。
- 每篇控制在 5,000 行以内；后续修订优先消除同篇重复，而不是再次拆分分册。
- Slurm、Storage、Inference、Virtualization、RAS、Benchmark、SRE 和 Distributed Runtime 不再恢复为独立文档。
- Markdown 是内容源；正文确认后再生成 Roadmap HTML，并同步 `README.md` 和 `index.html`。
