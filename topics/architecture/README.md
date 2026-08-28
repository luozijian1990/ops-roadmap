# 架构设计学习指南

本主题从运维、SRE 和平台工程视角整理架构设计方法，重点关注复杂度识别、容量与性能、数据与分布式状态、高可用与灾备，以及微服务治理和架构演进。它与具体产品专题互补，强调为什么这样设计、如何验证和如何在故障中恢复。

## 可以学到什么

- 用 4R、架构视图和复杂度模型拆解系统边界与依赖。
- 建立容量模型，设计缓存、负载均衡、限流、降级和熔断。
- 评估复制、分片、消息、事务和集群协调的一致性与运维代价。
- 设计故障域、FMEA、RTO/RPO、备份恢复、灾备和切换演练。
- 治理微服务边界、数据所有权、服务契约、灰度迁移和架构漂移。
- 将架构决策转成指标、告警、Runbook、压测、演练和复盘任务。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 基础、复杂度与质量 | 4R、架构视图、质量属性、评审 | [Markdown](./01-architecture-foundations.md) · [Roadmap](./01-architecture-foundations-roadmap.html) |
| 2 | 性能、容量与流量治理 | 容量模型、缓存、负载均衡、限流 | [Markdown](./02-performance-and-capacity.md) · [Roadmap](./02-performance-and-capacity-roadmap.html) |
| 3 | 数据与分布式系统 | 复制、分片、消息、一致性、集群 | [Markdown](./03-data-and-distributed-systems.md) · [Roadmap](./03-data-and-distributed-systems-roadmap.html) |
| 4 | 高可用与灾备 | 故障域、FMEA、RTO/RPO、多活、演练 | [Markdown](./04-reliability-and-disaster-recovery.md) · [Roadmap](./04-reliability-and-disaster-recovery-roadmap.html) |
| 5 | 微服务治理、演进与案例 | 服务治理、迁移、规模化案例、复盘 | [Markdown](./05-evolution-and-operations-cases.md) · [Roadmap](./05-evolution-and-operations-cases-roadmap.html) |

## 阅读建议

- 先读第一册建立判断框架，再按问题选择性能、分布式或可靠性章节。
- 课程案例只用于理解分析方法；具体产品操作请回到 MySQL、Kafka、Kubernetes 等对应主题。
- 设计文档应同时记录假设、备选方案、验证指标、回滚条件和复查时间。
