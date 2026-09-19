# OpenTelemetry 学习指南

本主题面向运维、SRE 与平台工程师，从 Go、Java、Python 应用接入出发，逐步学习 Collector、多信号关联、Kubernetes 采集和生产排障。三卷共 23 章、106 个学习小节，包含完整应用示例、配置片段与验收方法。

## 可以学到什么

- 理解 Trace、Span、Context、Resource 与语义约定，定位跨服务断链。
- 接入 Go HTTP、Java Spring Boot 与 Python FastAPI，验证跨语言调用、日志和错误传播。
- 管理 Collector 配置来源、合并与变量替换，理解管道复用、资源检测与数据转换。
- 配置指标和日志管道、头部/尾部采样，以及 Grafana 多信号查询。
- 采集 Kubernetes 节点指标、容器日志和 Events，使用 Operator 管理与注入。
- 分析尾采样状态、队列与重试、扩缩容和抓取分片，使用 pprof / zPages 排查 Collector。
- 理解代理、mTLS、OAuth2/OIDC、成本治理与渐进迁移。

## 开始学习

| 卷 | Markdown | Roadmap | 范围 |
| --- | --- | --- | --- |
| 第一卷 | [基础模型与应用接入](./01-foundations-and-instrumentation.md) | [交互式路线图](./01-foundations-and-instrumentation-roadmap.html) | 第 1—9 章：基础、Go、Java、Python、跨语言实验 |
| 第二卷 | [Collector 与多信号集成](./02-collector-and-signal-integration.md) | [交互式路线图](./02-collector-and-signal-integration-roadmap.html) | 第 10—17 章：处理、指标、日志、采样、Kubernetes、Operator |
| 第三卷 | [生产运维与故障排查](./03-production-and-troubleshooting.md) | [交互式路线图](./03-production-and-troubleshooting-roadmap.html) | 第 18—23 章：扩容、可靠性、排障、治理、迁移、综合实践 |

## 阅读建议

先按第一卷搭建最小 Go 双服务，再扩展为 Java → Python → Go。第二卷分别增加信号和采集来源，第三卷再调整采样、队列与部署策略。

正文的固定版本是教学基线，完整文件与增量片段分别标注。可运行示例需要按正文路径保存并准备依赖；Kubernetes 与后端验收必须在自己的隔离环境进行，预期结果不等于已经完成的端到端测试。
