# RabbitMQ 学习指南

本主题覆盖 RabbitMQ 安装、交换机与队列、消息确认、集群管理、监控和故障排查，面向异步任务与消息平台的日常运营。

## 可以学到什么

- 配置 Exchange、Queue、Binding 和路由模式。
- 处理确认、重试、死信、持久化和消费并发。
- 部署集群并管理用户、权限、策略和资源。
- 监控积压、吞吐、连接和节点健康，定位消息故障。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 安装与消息模型 | 部署、发布、消费、确认 | [Markdown](./01-installation-and-messaging.md) · [Roadmap](./01-installation-and-messaging-roadmap.html) |
| 2 | 管理、监控与参考 | 集群、策略、排障 | [Markdown](./02-administration-monitoring-and-reference.md) · [Roadmap](./02-administration-monitoring-and-reference-roadmap.html) |

## 阅读建议

- 先用单节点验证消息语义，再演练集群故障和恢复。
- 对重试与死信设置上限，避免故障时形成无限消息风暴。
