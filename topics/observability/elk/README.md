# ELK 与 OpenSearch 日志平台学习笔记

面向运维、SRE 与平台工程师，沿着日志的产生、采集、缓冲、加工、存储、检索和故障恢复学习。四篇正文共 **24 章、98 个学习小节**，将 Elastic Stack 基础与 OpenSearch 对照实践放在相应的数据链路中讲解。

全部配置、脚本、样本与测试代码保留在 Markdown 内，本专题不建立 `labs/` 目录。原八卷内容已按学习主题重组，完整文件通过章节链接复用。

## 阅读入口

| 篇 | Markdown 正文 | 学习路线图 | 章节与目标 |
| --- | --- | --- | --- |
| 第一篇 | [日志基础、采集与组件选型](01-log-foundations-and-collection.md) | [打开 Roadmap](01-log-foundations-and-collection-roadmap.html) | 第1～6章：日志契约、Filebeat、轮转、多行、Linux/Kubernetes 与组件选择 |
| 第二篇 | [Kafka 缓冲、Logstash 加工与可靠传输](02-pipeline-and-reliability.md) | [打开 Roadmap](02-pipeline-and-reliability-roadmap.html) | 第7～11章：缓冲、解析、确认、隔离、双后端接入、回放与事件对账 |
| 第三篇 | [Elasticsearch 与 OpenSearch 存储、检索及可视化](03-search-storage-and-visualization.md) | [打开 Roadmap](03-search-storage-and-visualization-roadmap.html) | 第12～17章：集群、字段、索引、ILM/ISM、查询性能、Kibana/Dashboards |
| 第四篇 | [生产架构、成本治理、告警与故障排查](04-production-operations-and-troubleshooting.md) | [打开 Roadmap](04-production-operations-and-troubleshooting-roadmap.html) | 第18～24章：高可用、冷热分层、容量、压测、监控告警、安全和恢复 |

首次学习按四篇顺序阅读：先完成最小采集和查询，再理解完整加工链路，随后比较两种搜索后端，最后进入生产运维与故障演练。已有 ELK 经验时，可从第三篇的产品差异、生命周期和查询案例进入。

- 想比较采集器和加工层：读[组件选型](01-log-foundations-and-collection.md#s-6-1)。
- 想复现 OpenSearch 对照：先看[版本边界](01-log-foundations-and-collection.md#s-1-3)，再从[完整文件提取入口](02-pipeline-and-reliability.md#s-11-1)准备环境。
- 想排查积压和数据缺失：读[确认与背压](02-pipeline-and-reliability.md#s-9-1)、[回放与对账](02-pipeline-and-reliability.md#s-9-4)。
- 想优化存储和查询：读[字段建模](03-search-storage-and-visualization.md#s-13-1)、[查询改写](03-search-storage-and-visualization.md#s-16-4)、[冷热与容量](04-production-operations-and-troubleshooting.md#s-19-1)。
- 想设计日志告警：读[统计窗口](04-production-operations-and-troubleshooting.md#s-21-3)和[未知状态与恢复](04-production-operations-and-troubleshooting.md#s-21-5)。

## 章节总览

| 篇 | 章节 |
| --- | --- |
| 第一篇 | 1 日志平台与实验边界；2 日志契约与样本；3 文件读取状态与背压；4 结构化日志与多行；5 Linux/Kubernetes 接入；6 组件选型 |
| 第二篇 | 7 Kafka 缓冲与部署；8 加工管道与多来源接入；9 确认、回放与完整性；10 双后端输出与失败处理；11 文件组织、执行与证据 |
| 第三篇 | 12 部署与产品识别；13 字段建模与索引结构；14 模板与生命周期；15 写入与性能诊断；16 查询与稳定导出；17 检索与看板 |
| 第四篇 | 18 多节点与故障域；19 冷热、容量与成本；20 分段调优与混合压测；21 平台监控与业务告警；22 安全与日志治理；23 备份、维护与版本变更；24 排障与综合验收 |

## 教学版本

以下是笔记固定的教学组合，不表示当前最新版本或新建生产环境的推荐组合。主程序版本、依赖可安装和真实链路兼容需要分别核验。

| 对象 | 教学基线 | 使用边界 |
| --- | --- | --- |
| Elasticsearch / Kibana / Filebeat | 7.17.29 | 存量 Elastic 学习与对照，使用该版本的输入、API 和界面 |
| Logstash | 7.17.29 | 两个后端的加工进程独立，输出插件分别锁定 |
| Apache Kafka | 2.8.2，Scala 2.13，ZooKeeper 模式 | 保留基础教学链路，不混入 KRaft 配置 |
| Kafka 实验 JVM | Java 11 | 教学镜像采用 Temurin 11 JRE |
| OpenSearch / Dashboards | 2.19.6 / 2.19.6 | 独立对照组合，仍待真实联合运行验收 |
| Kafka integration / Ruby filter | 10.12.2 / 3.1.8 | 构建后核对实际插件列表，纯 Ruby 测试不等于 JRuby 插件运行 |
| Elasticsearch output / OpenSearch output | 11.4.2 / 2.0.3 | 两种输出独立配置，不按地址互换 |

Fluent Bit、Vector、OTel Collector 和 Data Prepper 的观察版本及条件见第一篇。它们的代表性配置不等于已接入本书主实验。

各篇保留版本对应的官方资料，产品差异和支持状态按引用的版本理解。本次重组保留原教学基线，没有重新认证全部产品组合，也没有将历史版本改称当前推荐。

## 实验与代码使用

| 实验 | 路径与目的 | 项目与主要入口 |
| --- | --- | --- |
| 基础直连实验 | Filebeat → ES → Kibana，验证文件采集和最小查询 | `elk-direct`；9200 / 5601 |
| 基础完整实验 | Filebeat → Kafka → Logstash → ES，学习缓冲、加工和回放 | `elk-full`；同样使用9200 / 5601，切换前处理冲突 |
| 双后端对照实验 | 同一 Topic 经独立消费组、Logstash 和 PQ 写入 ES / OS | `elk-expansion`；API 为19200 / 29200，UI 为15601 / 25601 |
| 多节点实验 | 两产品分别生成六节点教学拓扑，观察分配与故障恢复 | `elk-expansion-ha-es` / `elk-expansion-ha-os`；入口为19300 / 29300 |

基础实验按正文的“保存为”说明准备文件。双后端对照的 **35 个完整文件**分布在四篇对应小节，通过[第11章文件索引与提取器](02-pipeline-and-reliability.md#s-11-1)一次提取到读者自己的空目录。提取器校验全部四篇、路径、重复文件和围栏后才写入，并保存来源及文件哈希。

先准备所有依赖，再执行就绪检查、初始化、采集、样本生成和对账。后端初始化的完整实现见[第三篇](03-search-storage-and-visualization.md#s-14-1)；不要仅复制某个 Pipeline 就直接启动。普通代码片段和选型观察配置不属于自动提取范围。

普通停止保留卷、源文件和读取状态。销毁、偏移重置、短保留删除和故障注入各有明确前提。多容器故障域标签不等于真实跨主机或跨可用区容灾。

### 共用字段与不同脚本

基础实验与对照实验沿用 `orders-api`、`lab` 和事件身份概念。源样本使用 `run_id`、`event_id`，规范字段使用 `labels.run_id`、`event.id`；事件时间、采集时间与入库时间分别解释。

对照实验用合法外层信封包裹应用原文，使损坏的应用 JSON 仍能按批次对账。这是实验夹具，不要求生产日志统一改造为该格式。

基础 `normalize_access.rb` 与对照 `normalize.rb` 的能力范围不同；基础 `probe.py` 包含持久状态和 Prometheus textfile 输出，对照 `probe_v2.py` 是一次性探测。正文保留两套实现及适用条件，不将较新的脚本视作原脚本的无损替换。

## 验证状态

| 层次 | 本地结果 | 结论边界 |
| --- | --- | --- |
| 来源与结构 | 原54章已分配到四篇；24章、98小节；H3深度机械检查通过 | 机械检查之外仍需按教学语义阅读 |
| 完整代码保留 | 35个对照实验文件与原稿逐字节一致 | 不代表产品运行通过 |
| 四篇提取器 | 成功提取35文件，异常路径、重复标记、缺失来源和未闭合围栏被拒绝 | 只负责受控本地材料提取 |
| 离线测试 | 从重组正文提取后，72项逻辑/模拟测试通过 | 未运行 Logstash Event、真实后端和原生告警表达式 |
| 静态检查 | Python、Ruby、Bash、YAML 检查通过 | 配置可解析不等于插件或产品接受 |
| Roadmap 与导航 | 四份页面生成、源数据一致性、链接及本机 HTTP 检查通过 | 不代表浏览器视觉验收 |
| 文档浏览器 | 受阻：浏览器连接与本机 UI 通道不可用 | 未验证视觉与 Mermaid 实际渲染；产品 UI 也未执行 |
| 真实组件、端到端、HA、冷热转层、性能、TLS、备份恢复和业务告警 | 未执行 | 无实测吞吐、恢复时间或容灾保证 |

本地重组与验证日期为 **2026-09-26**。原交付声明、本地复验、当前重组结果分层保留在[合并与验证记录](../../../docs/specs/elk-expansion-integration-notes.md)中。“预期结果”始终是验收目标，不自动记为实际通过。

## 维护与关联阅读

Markdown 是内容源；每个 H3 是可独立学习的单元，完整代码位于相应 H4。[已实施大纲](outline.md)保留来源映射及文件归属，维护记录位于 `docs/specs/`，不混入正式学习路线图。

修改代码时同步样本、调用步骤和验证记录，并从四篇重新提取、复跑检查。更新正文后按仓库构建流程生成 Roadmap，保持[根目录入口](../../../index.html)、本页和 HTML 一致。

本专题聚焦日志平台；指标采集与告警可配合 [Prometheus](../prometheus/README.md) 学习，多信号关联可配合 [OpenTelemetry](../otel/README.md) 学习。Trace ID 只是关联入口，不保证对应 Trace 一定存在。
