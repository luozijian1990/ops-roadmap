# Loki 日志平台学习指南

本专题面向运维、SRE 与平台工程师，沿日志模型、Grafana Alloy 采集、Loki 存储、LogQL 查询和生产排障学习。四卷共 32 章，配置、脚本和练习保留在 Markdown 正文中；标为“完整文件”的代码块需要按文中路径保存后使用。

## 可以学到什么

- 区分索引标签、结构化元数据与日志正文，控制高基数字段。
- 用 Alloy 采集文件、Kubernetes 容器日志和 OTLP 日志，按事件 ID 对账。
- 理解 Loki 写入与查询路径、TSDB/v13、对象存储、部署模式和保留策略。
- 用 LogQL 过滤、统计和计算耗时，并在 Grafana 中查询、关联 Trace 与配置告警。
- 分析积压、缺失、慢查询和恢复问题，明确多租户、安全与容量边界。

## 开始学习

| 卷 | Markdown 正文 | 学习路线图 | 范围 |
| --- | --- | --- | --- |
| 第一卷 | [日志模型与 Alloy 采集](01-foundations-and-alloy.md) | [打开 Roadmap](01-foundations-and-alloy-roadmap.html) | 第 1—8 章：字段分层、最小实验、文件与 Kubernetes 采集、OTLP |
| 第二卷 | [架构、存储与部署](02-architecture-storage-and-deployment.md) | [打开 Roadmap](02-architecture-storage-and-deployment-roadmap.html) | 第 9—16 章：写入与查询路径、TSDB、对象存储、部署与保留 |
| 第三卷 | [LogQL、Grafana 与日志告警](03-logql-grafana-and-alerting.md) | [打开 Roadmap](03-logql-grafana-and-alerting-roadmap.html) | 第 17—24 章：查询、统计、P95、面板、Trace 关联与 Ruler |
| 第四卷 | [生产运维、迁移与故障排查](04-production-and-troubleshooting.md) | [打开 Roadmap](04-production-and-troubleshooting-roadmap.html) | 第 25—32 章：可靠性、容量、安全、自监控、排障与迁移 |

## 阅读建议

首次阅读按四卷顺序推进，先完成第一卷的最小文件采集实验和事件对账，再扩展存储、查询与告警。已有 ELK 经验时，先读第一卷第 2 章的标签与字段分层；熟悉 OpenTelemetry 时，可从第一卷第 8 章衔接 OTLP 日志。

主实验使用合成 `order-api` JSONL，经过 Alloy 文件采集进入 Loki，再由 Grafana、LogCLI 或有界只读客户端查询。`event_id`、`trace_id` 和 `request_id` 保留在正文并进入结构化元数据；合成 Trace ID 不代表 Jaeger 中已有对应 Span。正文中的完整文件、增量配置和查询示例有不同使用方式，请按各章标记保存或合并，不要把片段直接拼成部署文件。

## 版本与验证边界

正文固定教学基线为 Loki 3.7.8、Alloy 1.19.2、Grafana 13.2.2 和 Community Loki Helm Chart 18.13.5；Chart 版本与 Loki 应用版本分别管理。资料核查日期为 2026-09-24，这些版本是本专题的示例基线，并非持续更新的最新版本声明。

原稿记录了本地文件、配置语法和模拟 HTTP 响应层面的检查，包括 100 个 pytest 用例；这不等于真实 Loki、Alloy、Grafana、Docker Compose、Kubernetes、Helm、S3 或 Kafka 联调通过。正文的“预期”是读者应在隔离环境中验证的结果。涉及删除、保留、迁移和恢复的操作，应先核对目标环境、权限、备份与回滚条件。

## 维护与关联阅读

Markdown 是内容源。修改正文后运行仓库的 `./scripts/build-roadmaps.sh`，并检查本页、[项目目录](../../../index.html)及生成页面的链接。版本升级时同步检查配置、样本契约、查询和验证声明；不要仅凭镜像启动成功推断旧 Schema 或查询语义兼容。

指标和告警基础可参阅 [Prometheus](../prometheus/README.md)，多信号关联可参阅 [OpenTelemetry](../otel/README.md)，另一类日志平台设计可参阅 [ELK 与 OpenSearch](../elk/README.md)。
