# VictoriaMetrics 学习指南

本主题分册介绍 VictoriaMetrics 架构部署、vmagent 采集与告警认证、备份恢复和实践治理，适合需要高吞吐、长期存储和多租户监控的平台团队。

## 可以学到什么

- 选择单节点或集群部署并理解组件端口与数据路径。
- 使用 vmagent 抓取、重标记、复制、分片和流式聚合。
- 配置多租户、认证、告警和数据写入链路。
- 设计 vmbackup 备份、恢复、保留和故障排查流程。
- 以容量、成本、可用性和回滚约束监控平台演进。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 核心架构与部署 | 单机/集群、存储、组件 | [Markdown](./01-core-and-deployment.md) · [Roadmap](./01-core-and-deployment-roadmap.html) |
| 2 | 采集、告警与认证 | vmagent、路由、多租户 | [Markdown](./02-ingestion-alerting-and-auth.md) · [Roadmap](./02-ingestion-alerting-and-auth-roadmap.html) |
| 3 | 备份、恢复与实践 | vmbackup、恢复、治理 | [Markdown](./03-backup-restore-and-practices.md) · [Roadmap](./03-backup-restore-and-practices-roadmap.html) |

## 阅读建议

- 按顺序搭建最小环境，再验证采集、告警和恢复闭环。
- 备份策略必须定期做恢复演练，并记录对象存储凭据和保留期限。
