# etcd 学习指南

本主题从 etcd 架构、Raft、MVCC 和读写流程讲到生产运维、备份恢复与故障处理，适合 Kubernetes 控制面和分布式配置存储维护者。

## 可以学到什么

- 解释 etcd 读写路径、Raft 共识和 MVCC 版本模型。
- 使用 etcdctl 检查成员、健康、延迟、配额和压缩状态。
- 设计高可用拓扑、容量与碎片整理策略。
- 执行备份、恢复、证书与访问控制操作。
- 在 leader、磁盘、网络和数据膨胀故障中保留证据并恢复。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 架构与核心原理 | Raft、MVCC、读写流程 | [Markdown](./01-architecture-and-internals.md) · [Roadmap](./01-architecture-and-internals-roadmap.html) |
| 2 | 生产实践 | 部署、监控、备份与故障 | [Markdown](./02-production-practices.md) · [Roadmap](./02-production-practices-roadmap.html) |

## 阅读建议

- 先理解一致性模型，再执行任何压缩、碎片整理或恢复动作。
- 实验使用独立集群，生产操作遵循备份优先和可回滚原则。
