# GPU AI 基础设施学习指南

本主题从 GPU 硬件执行模型延伸到多节点通信、容器与 Kubernetes 交付、资源共享、观测排障和平台架构。目标是让运维工程师能建设并运营可用、可测、可回滚的 GPU 平台。

## 可以学到什么

- 理解 Thread/Warp/SM、内存层次、精度和性能瓶颈。
- 读取 PCIe、NUMA、NVLink/NVSwitch 拓扑并定位本地性问题。
- 配置 NCCL、RDMA、RoCE，并按物理到应用层排查通信故障。
- 管理 Driver、CUDA、容器工具链和 Kubernetes GPU 资源。
- 在 MIG、Time-Slicing、MPS、HAMi 等方案间权衡隔离与利用率。
- 用 DCGM/Prometheus 建立硬件健康、性能和作业观测闭环。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | GPU 架构 | 执行模型、内存与性能 | [Markdown](./01-gpu-architecture.md) · [Roadmap](./01-gpu-architecture-roadmap.html) |
| 2 | 拓扑与互连 | NUMA、NVLink、NVSwitch | [Markdown](./02-topology-nvlink-and-nvswitch.md) · [Roadmap](./02-topology-nvlink-and-nvswitch-roadmap.html) |
| 3 | NCCL/RDMA 网络 | 集合通信与网络排障 | [Markdown](./03-nccl-rdma-and-network.md) · [Roadmap](./03-nccl-rdma-and-network-roadmap.html) |
| 4 | NVIDIA 软件栈 | CUDA 兼容性与容器 | [Markdown](./04-nvidia-software-stack.md) · [Roadmap](./04-nvidia-software-stack-roadmap.html) |
| 5 | 资源共享与 HAMi | MIG、共享和调度 | [Markdown](./05-gpu-resource-sharing-and-hami.md) · [Roadmap](./05-gpu-resource-sharing-and-hami-roadmap.html) |
| 6 | Kubernetes GPU | Operator、生命周期、配额 | [Markdown](./06-kubernetes-gpu.md) · [Roadmap](./06-kubernetes-gpu-roadmap.html) |
| 7 | 观测与排障 | DCGM、指标与 Runbook | [Markdown](./07-observability-and-troubleshooting.md) · [Roadmap](./07-observability-and-troubleshooting-roadmap.html) |
| 8 | 架构设计 | 训练/推理平台与故障域 | [Markdown](./08-architecture-design.md) · [Roadmap](./08-architecture-design-roadmap.html) |

## 阅读建议

- 按顺序学习；已有 CUDA 基础时可从第 2 册开始查阅。
- Kubernetes 生产环境应配合节点隔离、Canary、Drain 和回滚演练。
