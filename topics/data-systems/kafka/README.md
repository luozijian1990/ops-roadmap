# Kafka 学习指南

本主题覆盖 Kafka 客户端、分区副本、存储、运维、监控和流处理，帮助平台工程师建设可观测、可扩展且可恢复的消息平台。

## 可以学到什么

- 理解 Topic、Partition、Consumer Group 和副本一致性。
- 编写生产/消费客户端并处理偏移、重平衡和交付语义。
- 运维 Broker、存储、容量、性能和集群健康。
- 监控延迟、吞吐、积压并定位生产消费故障。
- 使用 Kafka Streams 等能力组织流式处理。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 基础与客户端 | Topic、分区、客户端 | [Markdown](./01-foundations-and-clients.md) · [Roadmap](./01-foundations-and-clients-roadmap.html) |
| 2 | 原理、运维与流 | 副本、存储、监控、Streams | [Markdown](./02-internals-operations-and-streams.md) · [Roadmap](./02-internals-operations-and-streams-roadmap.html) |

## 阅读建议

- 先掌握消息模型，再进行分区、副本和容量实验。
- 生产调优同时记录延迟、积压、磁盘和网络指标，变更前准备回滚。
