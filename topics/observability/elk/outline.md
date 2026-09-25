# ELK 与 OpenSearch 日志平台学习笔记合并大纲

> 状态：已确认并实施。四篇纯 Markdown，不建立 labs 目录；正式正文为24章、98个学习小节。
> 来源映射中的文件与章节指重组前的八卷，属于历史来源标识；现有正文链接见 README，来源哈希与覆盖见 docs/specs/elk-expansion-integration-notes.md。本大纲不生成 Roadmap。

**目标文件与章节范围**

| 篇 | 目标文件名 | 章节 |
| --- | --- | --- |
| 1 · 日志基础、采集与组件选型 | `01-log-foundations-and-collection.md` | 1～6 |
| 2 · Kafka 缓冲、Logstash 加工与可靠传输 | `02-pipeline-and-reliability.md` | 7～11 |
| 3 · Elasticsearch 与 OpenSearch 存储、检索及可视化 | `03-search-storage-and-visualization.md` | 12～17 |
| 4 · 生产架构、成本治理、告警与故障排查 | `04-production-operations-and-troubleshooting.md` | 18～24 |

**正文组织约束**

- 每个 H3 是完整教学单元，正文根据内容覆盖问题、机制、操作、观察、边界和练习；文件代码放入该单元的 H4。
- 公共原理合并，Elastic/OpenSearch 的配置、API 与插件差异分别保留。原实验与新增对照实验不混用状态、数据契约或脚本能力。
- 完整文件保留在 Markdown 中，每个实验文件只有一个权威代码块；其他章节用相对链接和稳定锚点引用。
- 原第八卷的提取器改为读取四篇正文，先校验全部文件标记、路径和重名，再统一提取；输出目录由读者指定，仓库不创建实验目录。
- 第 11 章提供文件索引与执行顺序，依赖的产品初始化在第 14 章给出完整实现；先引导读者准备全部文件，再执行，避免隐含依赖。
- 代码迁移前后逐文件核对；语义不变的搬迁保留原内容哈希，确需修改的提取器、入口及引用单独记录并复验。
- 编写正文前保留原稿及哈希，完成覆盖检查后再收拢旧八卷入口；合并说明归档到 docs/specs，不混入正式笔记。
- 目标每篇少于 5,000 行；通过去重与合理归属控制体积，不删除独有实验、错误处理或完整实现来凑篇幅。

**原第八卷完整文件的唯一归属**

| 完整文件标记 | 新小节 |
| --- | --- |
| `compose.yaml` | 11.1 |
| `kafka/Dockerfile` | 7.3 |
| `kafka/server.properties` | 7.3 |
| `kafka/zookeeper.properties` | 7.3 |
| `filebeat/filebeat.yml` | 8.1 |
| `logstash/Dockerfile` | 8.2 |
| `logstash/logstash.yml` | 8.2 |
| `logstash/pipelines-es.yml` | 8.2 |
| `logstash/pipelines-os.yml` | 8.2 |
| `logstash/es.conf` | 10.2 |
| `logstash/os.conf` | 10.2 |
| `run.sh` | 11.2 |
| `tools/client.py` | 12.3 |
| `tools/model.py` | 13.4 |
| `tools/init_backend.py` | 14.1 |
| `logstash/normalize.rb` | 8.4 |
| `tools/generate.py` | 2.4 |
| `tools/export_audit.py` | 9.4 |
| `tools/lifecycle.py` | 14.3 |
| `tools/api.py` | 12.3 |
| `tools/wait_ready.py` | 12.4 |
| `tools/make_ha.py` | 18.2 |
| `tools/cycle_data.py` | 19.2 |
| `tools/cost.py` | 19.3 |
| `tools/performance.py` | 20.3 |
| `tools/query_cases.py` | 16.4 |
| `tools/probe_v2.py` | 21.2 |
| `tools/alerts.py` | 21.5 |
| `tools/native_alerts.py` | 21.4 |
| `tools/native_control.py` | 21.4 |
| `receiver/server.py` | 21.4 |
| `tools/record.py` | 11.4 |
| `tests/normalize_cli.rb` | 11.4 |
| `tests/test_core.py` | 11.4 |
| `tools/static_check.py` | 11.4 |

**章节与学习节点**

## 第 1 章 · 日志平台的职责、数据路径与实验边界
<!-- output: 01-log-foundations-and-collection.md -->

### 1.1 从排障问题理解日志、指标与 Trace 的分工
<!-- src: 01-foundations-and-filebeat.md (原第1章/节) -->

### 1.2 选择直连、加工和带缓冲的日志链路
<!-- src: 01-foundations-and-filebeat.md (原第1章/节); 05-opensearch-practice-and-comparison.md (原第34章/节) -->

### 1.3 区分 Elastic 与 OpenSearch 的版本和能力边界
<!-- src: 01-foundations-and-filebeat.md (原第2章/节); 05-opensearch-practice-and-comparison.md (原第34章/节) -->

### 1.4 用固定样本跑通第一条可查询的日志
<!-- src: 01-foundations-and-filebeat.md (原第2章/节); 08-reproducible-labs-and-evidence.md (原第51章/节) -->

## 第 2 章 · 日志契约与可对账的样本
<!-- output: 01-log-foundations-and-collection.md -->

### 2.1 约定时间、来源身份和可信元数据
<!-- src: 01-foundations-and-filebeat.md (原第3章/节); 04-production-and-troubleshooting.md (原第26章/节) -->

### 2.2 区分字段缺失、解析失败和有效零值
<!-- src: 01-foundations-and-filebeat.md (原第3章/节); 02-kafka-and-logstash.md (原第14章/节) -->

### 2.3 保留原始记录并建立可检索的规范字段
<!-- src: 01-foundations-and-filebeat.md (原第3章/节) -->

### 2.4 用批次、事件 ID 和实验信封生成异常样本
<!-- src: 01-foundations-and-filebeat.md (原第2、8章/节); 05-opensearch-practice-and-comparison.md (原第35章/节); 08-reproducible-labs-and-evidence.md (原第53.5章/节) -->

## 第 3 章 · Filebeat 的读取状态与背压
<!-- output: 01-log-foundations-and-collection.md -->

### 3.1 理解文件发现、Harvester 与 Registry 的确认边界
<!-- src: 01-foundations-and-filebeat.md (原第4章/节) -->

### 3.2 配置 filestream 并判断路径、权限和长行问题
<!-- src: 01-foundations-and-filebeat.md (原第5章/节) -->

### 3.3 解释轮转、文件身份和清理设置造成的重复与缺失
<!-- src: 01-foundations-and-filebeat.md (原第4、5章/节) -->

### 3.4 用输出阻塞和重启实验观察队列与恢复
<!-- src: 01-foundations-and-filebeat.md (原第4、8章/节) -->

## 第 4 章 · 结构化日志、多行异常与源端处理
<!-- output: 01-log-foundations-and-collection.md -->

### 4.1 识别 JSON 所在层次并验证解码顺序
<!-- src: 01-foundations-and-filebeat.md (原第6章/节) -->

### 4.2 正确合并 Java 异常并保留事件边界
<!-- src: 01-foundations-and-filebeat.md (原第6章/节); 04-production-and-troubleshooting.md (原第26章/节) -->

### 4.3 安排字段转换、过滤和降噪的处理顺序
<!-- src: 01-foundations-and-filebeat.md (原第6章/节) -->

### 4.4 为解析、轮转和重启建立采集验收矩阵
<!-- src: 01-foundations-and-filebeat.md (原第8章/节) -->

## 第 5 章 · Linux 与 Kubernetes 日志接入
<!-- output: 01-log-foundations-and-collection.md -->

### 5.1 部署宿主机采集并管理持久状态与配置变更
<!-- src: 01-foundations-and-filebeat.md (原第7章/节) -->

### 5.2 解释 containerd、CRI 与业务日志的嵌套关系
<!-- src: 01-foundations-and-filebeat.md (原第7章/节); 04-production-and-troubleshooting.md (原第26章/节) -->

### 5.3 部署 DaemonSet 并验证元数据与 RBAC
<!-- src: 01-foundations-and-filebeat.md (原第7章/节) -->

### 5.4 选择标准输出、文件采集和 Autodiscover
<!-- src: 01-foundations-and-filebeat.md (原第7章/节); 05-opensearch-practice-and-comparison.md (原第39章/节) -->

## 第 6 章 · 按场景选择采集与加工组件
<!-- output: 01-log-foundations-and-collection.md -->

### 6.1 用同一组可靠性与资源维度比较四类采集器
<!-- src: 05-opensearch-practice-and-comparison.md (原第39章/节) -->

### 6.2 为存量文件与 Kubernetes 选择接入方案
<!-- src: 05-opensearch-practice-and-comparison.md (原第39章/节) -->

### 6.3 区分 Logstash、Data Prepper 与 Ingest Pipeline 的职责
<!-- src: 05-opensearch-practice-and-comparison.md (原第39章/节) -->

### 6.4 用代表性样本验证选型并形成变更条件
<!-- src: 05-opensearch-practice-and-comparison.md (原第39章/节); 01-foundations-and-filebeat.md (原第8章/节) -->

## 第 7 章 · Kafka 缓冲模型与教学部署
<!-- output: 02-pipeline-and-reliability.md -->

### 7.1 用中断和回放窗口判断是否需要 Kafka
<!-- src: 02-kafka-and-logstash.md (原第9章/节) -->

### 7.2 理解分区、消费组、顺序与端到端交付语义
<!-- src: 02-kafka-and-logstash.md (原第9、11章/节) -->

### 7.3 部署固定版本并排查监听地址与连接路径
<!-- src: 02-kafka-and-logstash.md (原第10章/节); 08-reproducible-labs-and-evidence.md (原第52.2、52.3、52.4章/节) -->

### 7.4 规划副本、保留窗口、消息大小和容量上限
<!-- src: 02-kafka-and-logstash.md (原第11章/节) -->

## 第 8 章 · 从采集事件到可维护的加工管道
<!-- output: 02-pipeline-and-reliability.md -->

### 8.1 配置 Filebeat Kafka 输出并观察事件结构
<!-- src: 02-kafka-and-logstash.md (原第12章/节); 08-reproducible-labs-and-evidence.md (原第52.5章/节) -->

### 8.2 组织 Logstash Pipeline、插件与配置加载
<!-- src: 02-kafka-and-logstash.md (原第13章/节); 08-reproducible-labs-and-evidence.md (原第52.6、52.7、52.8、52.9章/节) -->

### 8.3 用 JSON、Dissect 和 Grok 解析日志
<!-- src: 02-kafka-and-logstash.md (原第14章/节) -->

### 8.4 规范化字段并将失败事件送入可追查的隔离路径
<!-- src: 02-kafka-and-logstash.md (原第14章/节); 08-reproducible-labs-and-evidence.md (原第53.4章/节) -->

### 8.5 将 Nginx、Java 和容器日志接入各自的数据集
<!-- src: 04-production-and-troubleshooting.md (原第26章/节) -->

## 第 9 章 · 消费确认、背压、重放与数据完整性
<!-- output: 02-pipeline-and-reliability.md -->

### 9.1 区分 Kafka Offset、Logstash PQ 与后端写入确认
<!-- src: 02-kafka-and-logstash.md (原第15章/节); 04-production-and-troubleshooting.md (原第27章/节) -->

### 9.2 定位 Rebalance、消费积压和队列耗尽
<!-- src: 02-kafka-and-logstash.md (原第15章/节); 04-production-and-troubleshooting.md (原第27、33章/节) -->

### 9.3 解释稳定 ID 的去重范围与 Rollover 边界
<!-- src: 04-production-and-troubleshooting.md (原第27章/节); 05-opensearch-practice-and-comparison.md (原第35章/节) -->

### 9.4 执行有界回放并用集合、字段和路由完成对账
<!-- src: 04-production-and-troubleshooting.md (原第27章/节); 08-reproducible-labs-and-evidence.md (原第53.6章/节) -->

## 第 10 章 · 连接两个搜索后端并处理输出失败
<!-- output: 02-pipeline-and-reliability.md -->

### 10.1 安装固定输出插件并检查依赖与 ECS 设置
<!-- src: 02-kafka-and-logstash.md (原第16章/节); 05-opensearch-practice-and-comparison.md (原第34章/节) -->

### 10.2 用独立消费组与 PQ 建立双后端对照链路
<!-- src: 05-opensearch-practice-and-comparison.md (原第35章/节); 08-reproducible-labs-and-evidence.md (原第52.10、52.11章/节) -->

### 10.3 分别判断请求失败、Bulk 条目失败、重试与 DLQ
<!-- src: 02-kafka-and-logstash.md (原第16章/节); 05-opensearch-practice-and-comparison.md (原第36章/节) -->

### 10.4 选择完整链路或短链路并明确各自证明范围
<!-- src: 01-foundations-and-filebeat.md (原第1章/节); 05-opensearch-practice-and-comparison.md (原第35章/节) -->

## 第 11 章 · 完整实验的文件组织、执行与证据
<!-- output: 02-pipeline-and-reliability.md -->

### 11.1 从四篇 Markdown 提取完整配置且拒绝覆盖
<!-- src: 08-reproducible-labs-and-evidence.md (原第51、52.1章/节) -->

### 11.2 按依赖顺序启动、初始化、采集并安全停止
<!-- src: 02-kafka-and-logstash.md (原第16章/节); 08-reproducible-labs-and-evidence.md (原第51、52.12章/节) -->

### 11.3 用共同样本验收双后端并保留失败证据
<!-- src: 05-opensearch-practice-and-comparison.md (原第35章/节); 08-reproducible-labs-and-evidence.md (原第54章/节) -->

### 11.4 区分静态、模拟和真实测试并复跑离线回归
<!-- src: 08-reproducible-labs-and-evidence.md (原第53.20、54章/节) -->

## 第 12 章 · 双后端部署、数据模型与产品识别
<!-- output: 03-search-storage-and-visualization.md -->

### 12.1 理解集群、节点、索引、文档与健康状态
<!-- src: 03-elasticsearch-and-kibana.md (原第17章/节) -->

### 12.2 配置网络、JVM、持久化与系统限制
<!-- src: 03-elasticsearch-and-kibana.md (原第18章/节) -->

### 12.3 核对产品身份、API、认证与脚本适用版本
<!-- src: 05-opensearch-practice-and-comparison.md (原第34、36章/节); 08-reproducible-labs-and-evidence.md (原第53.1、53.8、53.9章/节) -->

### 12.4 验证存储入口就绪并避免误初始化其他集群
<!-- src: 03-elasticsearch-and-kibana.md (原第18章/节); 05-opensearch-practice-and-comparison.md (原第35章/节); 08-reproducible-labs-and-evidence.md (原第53.3章/节) -->

## 第 13 章 · 字段建模与索引结构
<!-- output: 03-search-storage-and-visualization.md -->

### 13.1 根据检索用途选择 text、keyword 与分析器
<!-- src: 03-elasticsearch-and-kibana.md (原第19章/节); 07-index-query-performance-and-log-alerting.md (原第45章/节) -->

### 13.2 解释倒排索引、doc values、source 与 segment 成本
<!-- src: 07-index-query-performance-and-log-alerting.md (原第45章/节); 03-elasticsearch-and-kibana.md (原第22章/节) -->

### 13.3 避免对象关联错误、动态字段膨胀和高基数失控
<!-- src: 03-elasticsearch-and-kibana.md (原第19章/节); 07-index-query-performance-and-log-alerting.md (原第45章/节) -->

### 13.4 用字段契约修复类型冲突并验证两产品差异
<!-- src: 03-elasticsearch-and-kibana.md (原第19章/节); 05-opensearch-practice-and-comparison.md (原第36章/节); 08-reproducible-labs-and-evidence.md (原第53.2章/节) -->

## 第 14 章 · 模板、别名与生命周期治理
<!-- output: 03-search-storage-and-visualization.md -->

### 14.1 建立组件模板、索引模板和写别名的初始化顺序
<!-- src: 03-elasticsearch-and-kibana.md (原第20章/节); 08-reproducible-labs-and-evidence.md (原第53.3章/节) -->

### 14.2 选择写别名与 Data Stream 并识别接入限制
<!-- src: 03-elasticsearch-and-kibana.md (原第21章/节); 05-opensearch-practice-and-comparison.md (原第36章/节) -->

### 14.3 分别实现 ILM 与 ISM 的滚动、绑定和状态检查
<!-- src: 03-elasticsearch-and-kibana.md (原第21章/节); 05-opensearch-practice-and-comparison.md (原第37章/节); 08-reproducible-labs-and-evidence.md (原第53.7章/节) -->

### 14.4 判断策略卡住、迟到日志与实际保留时间
<!-- src: 03-elasticsearch-and-kibana.md (原第21章/节); 05-opensearch-practice-and-comparison.md (原第37章/节); 06-high-availability-and-storage-cost.md (原第43章/节) -->

## 第 15 章 · 写入、持久性与性能诊断
<!-- output: 03-search-storage-and-visualization.md -->

### 15.1 区分写入成功、搜索可见与持久化完成
<!-- src: 03-elasticsearch-and-kibana.md (原第22章/节); 07-index-query-performance-and-log-alerting.md (原第46章/节) -->

### 15.2 正确构造 Bulk 并观察拒绝与写读竞争
<!-- src: 03-elasticsearch-and-kibana.md (原第22章/节); 07-index-query-performance-and-log-alerting.md (原第46章/节) -->

### 15.3 解释 Refresh、Flush、Merge 的代价与适用条件
<!-- src: 03-elasticsearch-and-kibana.md (原第22章/节); 07-index-query-performance-and-log-alerting.md (原第45、46章/节) -->

### 15.4 关联 Slow Log、Profile、热点线程与节点指标
<!-- src: 03-elasticsearch-and-kibana.md (原第23章/节); 07-index-query-performance-and-log-alerting.md (原第46章/节) -->

## 第 16 章 · 查询、聚合与稳定导出
<!-- output: 03-search-storage-and-visualization.md -->

### 16.1 用 term、match、filter 和 bool 表达日志查询
<!-- src: 03-elasticsearch-and-kibana.md (原第23章/节) -->

### 16.2 统一计数、错误率、时间分桶与分位数口径
<!-- src: 03-elasticsearch-and-kibana.md (原第23章/节) -->

### 16.3 分别使用 PIT 与 Scroll 完成有界且可核对的导出
<!-- src: 03-elasticsearch-and-kibana.md (原第23章/节); 05-opensearch-practice-and-comparison.md (原第36章/节); 08-reproducible-labs-and-evidence.md (原第53.6、53.14章/节) -->

### 16.4 用三个改写案例验证语义等价和查询成本
<!-- src: 07-index-query-performance-and-log-alerting.md (原第47章/节); 08-reproducible-labs-and-evidence.md (原第53.14章/节) -->

## 第 17 章 · Kibana 与 Dashboards 的检索和看板
<!-- output: 03-search-storage-and-visualization.md -->

### 17.1 创建索引模式并排查时间与字段范围
<!-- src: 03-elasticsearch-and-kibana.md (原第24章/节); 05-opensearch-practice-and-comparison.md (原第38章/节) -->

### 17.2 分别使用 KQL、DQL 和 Lucene 完成日常检索
<!-- src: 03-elasticsearch-and-kibana.md (原第24章/节); 05-opensearch-practice-and-comparison.md (原第38章/节) -->

### 17.3 按统计契约制作业务、分布与数据质量面板
<!-- src: 03-elasticsearch-and-kibana.md (原第25章/节); 05-opensearch-practice-and-comparison.md (原第38章/节) -->

### 17.4 管理共享、Saved Objects 和可复查的排障证据
<!-- src: 03-elasticsearch-and-kibana.md (原第25章/节); 05-opensearch-practice-and-comparison.md (原第38章/节) -->

## 第 18 章 · 多节点架构与故障域
<!-- output: 04-production-operations-and-troubleshooting.md -->

### 18.1 区分选举、数据冗余和客户端入口的可用性
<!-- src: 03-elasticsearch-and-kibana.md (原第17、18章/节); 06-high-availability-and-storage-cost.md (原第40章/节) -->

### 18.2 构建六节点教学集群并管理首次引导配置
<!-- src: 06-high-availability-and-storage-cost.md (原第41章/节); 08-reproducible-labs-and-evidence.md (原第53.10章/节) -->

### 18.3 配置分配感知并解释未分配分片
<!-- src: 06-high-availability-and-storage-cost.md (原第41章/节) -->

### 18.4 演练节点、故障域与网络故障并核对恢复
<!-- src: 06-high-availability-and-storage-cost.md (原第42章/节) -->

## 第 19 章 · 冷热分层、容量与成本
<!-- output: 04-production-operations-and-troubleshooting.md -->

### 19.1 从访问频率与保留目标推导数据分层
<!-- src: 03-elasticsearch-and-kibana.md (原第21章/节); 06-high-availability-and-storage-cost.md (原第43章/节) -->

### 19.2 验证滚动、转层、位置变化与删除的完整过程
<!-- src: 06-high-availability-and-storage-cost.md (原第43章/节); 08-reproducible-labs-and-evidence.md (原第53.7、53.11章/节) -->

### 19.3 计算流量、缓冲、分片、故障余量与排空时间
<!-- src: 04-production-and-troubleshooting.md (原第28章/节); 06-high-availability-and-storage-cost.md (原第44章/节); 08-reproducible-labs-and-evidence.md (原第53.12章/节) -->

### 19.4 实测字段、压缩、副本与归档的空间和恢复代价
<!-- src: 04-production-and-troubleshooting.md (原第28章/节); 06-high-availability-and-storage-cost.md (原第43、44章/节) -->

## 第 20 章 · 分段调优与混合负载验证
<!-- output: 04-production-operations-and-troubleshooting.md -->

### 20.1 用分段证据定位采集、Kafka、Logstash 和后端瓶颈
<!-- src: 04-production-and-troubleshooting.md (原第29章/节) -->

### 20.2 调整批量、队列和并行度并解释吞吐与延迟的取舍
<!-- src: 04-production-and-troubleshooting.md (原第29章/节) -->

### 20.3 设计固定样本、预热、并发和停止条件的混合压测
<!-- src: 07-index-query-performance-and-log-alerting.md (原第48章/节); 08-reproducible-labs-and-evidence.md (原第53.13章/节) -->

### 20.4 核对结果一致性并报告错误率、分位数和资源代价
<!-- src: 07-index-query-performance-and-log-alerting.md (原第47、48章/节); 06-high-availability-and-storage-cost.md (原第44章/节) -->

## 第 21 章 · 平台监控、探针与业务日志告警
<!-- output: 04-production-operations-and-troubleshooting.md -->

### 21.1 监控组件、数据流和端到端新鲜度
<!-- src: 04-production-and-troubleshooting.md (原第30章/节) -->

### 21.2 实现经采集入口的探针并识别探针自身失效
<!-- src: 04-production-and-troubleshooting.md (原第30章/节); 08-reproducible-labs-and-evidence.md (原第53.15章/节) -->

### 21.3 定义错误率、异常突增与周期日志缺失的统计窗口
<!-- src: 07-index-query-performance-and-log-alerting.md (原第49章/节) -->

### 21.4 配置原生 Monitor 与本地通知并验证触发样本
<!-- src: 07-index-query-performance-and-log-alerting.md (原第50章/节); 08-reproducible-labs-and-evidence.md (原第53.17、53.18、53.19章/节) -->

### 21.5 用 UNKNOWN、去重、outbox 和恢复状态避免误报
<!-- src: 07-index-query-performance-and-log-alerting.md (原第49、50章/节); 08-reproducible-labs-and-evidence.md (原第53.16章/节) -->

## 第 22 章 · 安全连接、权限与日志治理
<!-- output: 04-production-operations-and-troubleshooting.md -->

### 22.1 为后端和可视化启用 TLS 并验证信任链
<!-- src: 04-production-and-troubleshooting.md (原第31章/节); 05-opensearch-practice-and-comparison.md (原第34章/节) -->

### 22.2 配置 Kafka 与采集加工链路的认证和最小权限
<!-- src: 04-production-and-troubleshooting.md (原第31章/节) -->

### 22.3 轮换凭据与证书并验证连接与授权边界
<!-- src: 04-production-and-troubleshooting.md (原第31章/节) -->

### 22.4 处理敏感字段、原始日志、隔离数据和审计证据
<!-- src: 04-production-and-troubleshooting.md (原第31章/节) -->

## 第 23 章 · 备份恢复、节点维护与版本变更
<!-- output: 04-production-operations-and-troubleshooting.md -->

### 23.1 创建快照并以重命名目标完成隔离恢复
<!-- src: 04-production-and-troubleshooting.md (原第32章/节); 06-high-availability-and-storage-cost.md (原第44章/节) -->

### 23.2 扩容和下线节点并观察迁移与剩余容量
<!-- src: 04-production-and-troubleshooting.md (原第32章/节); 06-high-availability-and-storage-cost.md (原第42章/节) -->

### 23.3 迁移 Topic 配置并保存规则、模板和插件版本
<!-- src: 04-production-and-troubleshooting.md (原第32章/节) -->

### 23.4 制定升级切换与回退计划并核对新增数据
<!-- src: 04-production-and-troubleshooting.md (原第32章/节); 05-opensearch-practice-and-comparison.md (原第36、38章/节) -->

## 第 24 章 · 故障排查与综合验收
<!-- output: 04-production-operations-and-troubleshooting.md -->

### 24.1 沿源文件到检索界面定位无数据、重复和字段错误
<!-- src: 04-production-and-troubleshooting.md (原第33章/节) -->

### 24.2 定位积压、Rebalance、429、OOM 和隔离队列增长
<!-- src: 04-production-and-troubleshooting.md (原第33章/节) -->

### 24.3 排查水位、未分配分片、生命周期、TLS 与权限故障
<!-- src: 04-production-and-troubleshooting.md (原第33章/节); 05-opensearch-practice-and-comparison.md (原第37章/节); 06-high-availability-and-storage-cost.md (原第41章/节) -->

### 24.4 执行有界故障、恢复对账并形成分层验收记录
<!-- src: 04-production-and-troubleshooting.md (原第33章/节); 08-reproducible-labs-and-evidence.md (原第54章/节) -->
