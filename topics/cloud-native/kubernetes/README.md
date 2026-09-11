# Kubernetes 学习指南

本主题从控制面架构和调度工作负载，逐步进入生产治理、迁移、Istio、多集群、安全实践、应用运行就绪实验与版本升级。适合平台工程师建立集群运行、发布和故障恢复能力。

## 可以学到什么

- 理解 API Server、Scheduler、Controller、etcd 和节点组件协作。
- 配置工作负载、调度约束、服务暴露和资源管理。
- 设计生产集群升级、迁移、容量与故障恢复流程。
- 运用 Istio、多集群和网络策略治理服务通信。
- 建立安全、可观测、发布回滚和日常 Runbook。
- 用固定镜像、对象证据和故障注入验证应用的配置、网络、资源、探针与终止行为。
- 识别 Kubernetes 1.36 的资源、准入、网络、存储与节点变化，规划逐版本升级和恢复。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 架构与控制面 | API、控制器、etcd | [Markdown](./01-architecture-and-control-plane.md) · [Roadmap](./01-architecture-and-control-plane-roadmap.html) |
| 2 | 调度与工作负载 | Pod、调度、滚动发布 | [Markdown](./02-scheduling-and-workloads.md) · [Roadmap](./02-scheduling-and-workloads-roadmap.html) |
| 3 | 生产与迁移 | 升级、迁移、容量 | [Markdown](./03-production-and-migration.md) · [Roadmap](./03-production-and-migration-roadmap.html) |
| 4 | Istio、多集群与安全 | 网格、跨集群、策略 | [Markdown](./04-istio-multicluster-and-security.md) · [Roadmap](./04-istio-multicluster-and-security-roadmap.html) |
| 5 | 生产最佳实践 | 治理、观测、回滚 | [Markdown](./05-production-best-practices.md) · [Roadmap](./05-production-best-practices-roadmap.html) |
| 6 | 应用运行就绪实验 | 工作负载、配置、Service、容量、探针、故障注入与证据 | [Markdown](./06-application-runtime-readiness-lab.md) · [Roadmap](./06-application-runtime-readiness-lab-roadmap.html) |
| 7 | 版本演进与集群升级 | 能力矩阵、API 清查、组件兼容、kubeadm、证书与恢复验收 | [Markdown](./07-version-evolution-and-upgrade.md) · [Roadmap](./07-version-evolution-and-upgrade-roadmap.html) |

## 阅读建议

- 本主题已按 Kubernetes 1.36 补充关键机制与运维基线。已有 1.2x 经验时，可先读第七册，再按差异回查前六册；Istio、VPA、CNI、CSI 等独立组件仍按各自版本验证。
- 按顺序学习并配合可丢弃的实验集群；生产主题适合反复查阅 Runbook。
- 第六册是实验验收册，应区分静态清单、本地 Kind、外部请求和生产环境证据。
- [完整动画版](./full-animated-roadmap.html)包含交互动画，适合建立整体心智模型；它与标准 Roadmap 分开维护，本轮 1.36 修订未同步到该历史动画版。
