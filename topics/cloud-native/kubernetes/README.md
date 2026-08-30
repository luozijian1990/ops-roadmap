# Kubernetes 学习指南

本主题从控制面架构和调度工作负载，逐步进入生产治理、迁移、Istio、多集群、安全实践与应用运行就绪实验。适合平台工程师建立集群运行、发布和故障恢复能力。

## 可以学到什么

- 理解 API Server、Scheduler、Controller、etcd 和节点组件协作。
- 配置工作负载、调度约束、服务暴露和资源管理。
- 设计生产集群升级、迁移、容量与故障恢复流程。
- 运用 Istio、多集群和网络策略治理服务通信。
- 建立安全、可观测、发布回滚和日常 Runbook。
- 用固定镜像、对象证据和故障注入验证应用的配置、网络、资源、探针与终止行为。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 架构与控制面 | API、控制器、etcd | [Markdown](./01-architecture-and-control-plane.md) · [Roadmap](./01-architecture-and-control-plane-roadmap.html) |
| 2 | 调度与工作负载 | Pod、调度、滚动发布 | [Markdown](./02-scheduling-and-workloads.md) · [Roadmap](./02-scheduling-and-workloads-roadmap.html) |
| 3 | 生产与迁移 | 升级、迁移、容量 | [Markdown](./03-production-and-migration.md) · [Roadmap](./03-production-and-migration-roadmap.html) |
| 4 | Istio、多集群与安全 | 网格、跨集群、策略 | [Markdown](./04-istio-multicluster-and-security.md) · [Roadmap](./04-istio-multicluster-and-security-roadmap.html) |
| 5 | 生产最佳实践 | 治理、观测、回滚 | [Markdown](./05-production-best-practices.md) · [Roadmap](./05-production-best-practices-roadmap.html) |
| 6 | 应用运行就绪实验 | 工作负载、配置、Service、容量、探针、故障注入与证据 | [Markdown](./06-application-runtime-readiness-lab.md) · [Roadmap](./06-application-runtime-readiness-lab-roadmap.html) |

## 阅读建议

- 按顺序学习并配合可丢弃的实验集群；生产主题适合反复查阅 Runbook。
- 第六册是实验验收册，应区分静态清单、本地 Kind、外部请求和生产环境证据。
- [完整动画版](./full-animated-roadmap.html)包含交互动画，适合建立整体心智模型；它与标准 Roadmap 分开维护。
