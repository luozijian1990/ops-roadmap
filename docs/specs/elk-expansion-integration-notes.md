# ELK 四篇合并与验证记录

> 本地重组日期：2026-09-26。下半部分保留网页扩展交付的历史记录；历史“本次”不指本地重组。

## 当前交付

- 四篇正式 Markdown，24 章、98 个 H3；完整实验代码仍嵌入正文，仓库没有 labs 目录。
- 原八卷的325个教学/实现小节均有去向；3个纯卷尾导航由四篇导航替代。合并时归并教学单元、重写衔接，保留独有配置、案例和失败边界。
- 35个带文件标记的对照实验文件与原第八卷逐字节一致；基础脚本仅更新了过时的卷名注释/提示，不改变运行逻辑。
- 提取器由单卷读取改为读取四篇，验证全量文件集、路径、重名、围栏和空目标目录，输出四篇及落地文件哈希。
- 原八卷与整理前 README、大纲、合并说明已保存在本地临时备份 `/private/tmp/elk-merge-di3nzkpf/original-markdown.zip`。该路径是此次机器上的恢复位置，不是仓库依赖。

## 本地验证

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| H3 深度机械检查 | 98个小节，thin=0 | 另按章节抽查语义；长度不替代教学完整性 |
| 原始代码保留 | 35/35 文件逐字节一致 | 不代表产品运行通过 |
| 新提取器 | 成功提取35文件；重复标记、路径穿越、缺失来源、未闭合围栏拒绝 | 面向受控本地材料，不是多用户文件服务 |
| 离线逻辑与模拟 API | 72项通过 | 未运行 JRuby/Logstash Event 或真实后端 |
| 配置与脚本静态检查 | Python/Ruby/Bash/YAML 通过 | 未运行 Docker Compose、插件或原生告警表达式 |
| Roadmap 与导航 | 四份生成成功；内嵌 JSON 与源解析一致；返回链接、98个节点及目录链接通过；四页本机 HTTP 200 | HTTP 响应不等于浏览器渲染 |
| 文档浏览器检查 | 受阻：无可用浏览器连接，原生 UI 通道启动失败 | 未完成视觉和 Mermaid 渲染验收；产品 UI 也未执行 |
| 真实链路、HA、性能、TLS、恢复、业务告警 | 未执行 | 不因文档重组改变为通过 |

仓库总检查 `validate-topic-readmes.sh` 仍报告 `topics/delivery/delivery-governance/` 的4份既有笔记缺少 Roadmap；该问题不在本次 ELK 范围。ELK 四篇均有对应页面，未改动其他专题。根目录统计按当前文件与目录项重新计数。

## 源章节覆盖

| 原章号 | 新学习小节 |
| --- | --- |
| 1 | [1.1](../../topics/observability/elk/01-log-foundations-and-collection.md#s-1-1)、[1.2](../../topics/observability/elk/01-log-foundations-and-collection.md#s-1-2) |
| 2 | [1.3](../../topics/observability/elk/01-log-foundations-and-collection.md#s-1-3)、[1.4](../../topics/observability/elk/01-log-foundations-and-collection.md#s-1-4) |
| 3 | [2.1](../../topics/observability/elk/01-log-foundations-and-collection.md#s-2-1)、[2.2](../../topics/observability/elk/01-log-foundations-and-collection.md#s-2-2)、[2.3](../../topics/observability/elk/01-log-foundations-and-collection.md#s-2-3) |
| 4 | [3.1](../../topics/observability/elk/01-log-foundations-and-collection.md#s-3-1)、[3.3](../../topics/observability/elk/01-log-foundations-and-collection.md#s-3-3)、[3.4](../../topics/observability/elk/01-log-foundations-and-collection.md#s-3-4) |
| 5 | [3.2](../../topics/observability/elk/01-log-foundations-and-collection.md#s-3-2)、[3.3](../../topics/observability/elk/01-log-foundations-and-collection.md#s-3-3)、[5.1](../../topics/observability/elk/01-log-foundations-and-collection.md#s-5-1) |
| 6 | [4.1](../../topics/observability/elk/01-log-foundations-and-collection.md#s-4-1)、[4.2](../../topics/observability/elk/01-log-foundations-and-collection.md#s-4-2)、[4.3](../../topics/observability/elk/01-log-foundations-and-collection.md#s-4-3) |
| 7 | [5.1](../../topics/observability/elk/01-log-foundations-and-collection.md#s-5-1)、[5.2](../../topics/observability/elk/01-log-foundations-and-collection.md#s-5-2)、[5.3](../../topics/observability/elk/01-log-foundations-and-collection.md#s-5-3)、[5.4](../../topics/observability/elk/01-log-foundations-and-collection.md#s-5-4) |
| 8 | [3.4](../../topics/observability/elk/01-log-foundations-and-collection.md#s-3-4)、[4.4](../../topics/observability/elk/01-log-foundations-and-collection.md#s-4-4) |
| 9 | [7.1](../../topics/observability/elk/02-pipeline-and-reliability.md#s-7-1)、[7.2](../../topics/observability/elk/02-pipeline-and-reliability.md#s-7-2) |
| 10 | [7.3](../../topics/observability/elk/02-pipeline-and-reliability.md#s-7-3)、[11.2](../../topics/observability/elk/02-pipeline-and-reliability.md#s-11-2) |
| 11 | [7.2](../../topics/observability/elk/02-pipeline-and-reliability.md#s-7-2)、[7.4](../../topics/observability/elk/02-pipeline-and-reliability.md#s-7-4) |
| 12 | [8.1](../../topics/observability/elk/02-pipeline-and-reliability.md#s-8-1) |
| 13 | [8.2](../../topics/observability/elk/02-pipeline-and-reliability.md#s-8-2) |
| 14 | [8.3](../../topics/observability/elk/02-pipeline-and-reliability.md#s-8-3)、[8.4](../../topics/observability/elk/02-pipeline-and-reliability.md#s-8-4) |
| 15 | [9.1](../../topics/observability/elk/02-pipeline-and-reliability.md#s-9-1)、[9.2](../../topics/observability/elk/02-pipeline-and-reliability.md#s-9-2)、[9.4](../../topics/observability/elk/02-pipeline-and-reliability.md#s-9-4) |
| 16 | [9.3](../../topics/observability/elk/02-pipeline-and-reliability.md#s-9-3)、[10.3](../../topics/observability/elk/02-pipeline-and-reliability.md#s-10-3)、[11.2](../../topics/observability/elk/02-pipeline-and-reliability.md#s-11-2)、[11.3](../../topics/observability/elk/02-pipeline-and-reliability.md#s-11-3)、[14.1](../../topics/observability/elk/03-search-storage-and-visualization.md#s-14-1) |
| 17 | [12.1](../../topics/observability/elk/03-search-storage-and-visualization.md#s-12-1)、[18.1](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-18-1) |
| 18 | [12.2](../../topics/observability/elk/03-search-storage-and-visualization.md#s-12-2)、[12.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-12-4)、[18.2](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-18-2) |
| 19 | [13.1](../../topics/observability/elk/03-search-storage-and-visualization.md#s-13-1)、[13.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-13-3)、[13.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-13-4) |
| 20 | [14.1](../../topics/observability/elk/03-search-storage-and-visualization.md#s-14-1) |
| 21 | [14.2](../../topics/observability/elk/03-search-storage-and-visualization.md#s-14-2)、[14.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-14-3)、[14.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-14-4) |
| 22 | [15.1](../../topics/observability/elk/03-search-storage-and-visualization.md#s-15-1)、[15.2](../../topics/observability/elk/03-search-storage-and-visualization.md#s-15-2)、[15.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-15-3) |
| 23 | [15.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-15-4)、[16.1](../../topics/observability/elk/03-search-storage-and-visualization.md#s-16-1)、[16.2](../../topics/observability/elk/03-search-storage-and-visualization.md#s-16-2)、[16.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-16-3) |
| 24 | [17.1](../../topics/observability/elk/03-search-storage-and-visualization.md#s-17-1)、[17.2](../../topics/observability/elk/03-search-storage-and-visualization.md#s-17-2)、[17.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-17-4) |
| 25 | [17.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-17-3)、[17.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-17-4) |
| 26 | [2.1](../../topics/observability/elk/01-log-foundations-and-collection.md#s-2-1)、[8.5](../../topics/observability/elk/02-pipeline-and-reliability.md#s-8-5) |
| 27 | [9.1](../../topics/observability/elk/02-pipeline-and-reliability.md#s-9-1)、[9.3](../../topics/observability/elk/02-pipeline-and-reliability.md#s-9-3)、[9.4](../../topics/observability/elk/02-pipeline-and-reliability.md#s-9-4) |
| 28 | [19.3](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-19-3)、[19.4](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-19-4) |
| 29 | [20.1](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-20-1)、[20.2](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-20-2)、[20.3](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-20-3) |
| 30 | [21.1](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-21-1)、[21.2](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-21-2) |
| 31 | [22.1](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-22-1)、[22.2](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-22-2)、[22.3](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-22-3)、[22.4](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-22-4) |
| 32 | [23.1](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-23-1)、[23.2](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-23-2)、[23.3](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-23-3)、[23.4](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-23-4) |
| 33 | [24.1](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-24-1)、[24.2](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-24-2)、[24.3](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-24-3)、[24.4](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-24-4) |
| 34 | [1.2](../../topics/observability/elk/01-log-foundations-and-collection.md#s-1-2)、[1.3](../../topics/observability/elk/01-log-foundations-and-collection.md#s-1-3)、[10.1](../../topics/observability/elk/02-pipeline-and-reliability.md#s-10-1) |
| 35 | [2.4](../../topics/observability/elk/01-log-foundations-and-collection.md#s-2-4)、[10.2](../../topics/observability/elk/02-pipeline-and-reliability.md#s-10-2)、[10.4](../../topics/observability/elk/02-pipeline-and-reliability.md#s-10-4) |
| 36 | [10.3](../../topics/observability/elk/02-pipeline-and-reliability.md#s-10-3)、[12.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-12-3)、[14.2](../../topics/observability/elk/03-search-storage-and-visualization.md#s-14-2)、[16.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-16-3) |
| 37 | [14.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-14-3)、[14.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-14-4) |
| 38 | [17.1](../../topics/observability/elk/03-search-storage-and-visualization.md#s-17-1)、[17.2](../../topics/observability/elk/03-search-storage-and-visualization.md#s-17-2)、[17.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-17-3)、[17.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-17-4) |
| 39 | [6.1](../../topics/observability/elk/01-log-foundations-and-collection.md#s-6-1)、[6.2](../../topics/observability/elk/01-log-foundations-and-collection.md#s-6-2)、[6.3](../../topics/observability/elk/01-log-foundations-and-collection.md#s-6-3)、[6.4](../../topics/observability/elk/01-log-foundations-and-collection.md#s-6-4) |
| 40 | [18.1](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-18-1) |
| 41 | [18.2](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-18-2)、[18.3](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-18-3) |
| 42 | [18.1](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-18-1)、[18.4](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-18-4)、[23.2](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-23-2) |
| 43 | [19.1](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-19-1)、[19.2](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-19-2)、[19.4](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-19-4) |
| 44 | [19.3](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-19-3)、[19.4](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-19-4)、[23.1](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-23-1) |
| 45 | [13.1](../../topics/observability/elk/03-search-storage-and-visualization.md#s-13-1)、[13.2](../../topics/observability/elk/03-search-storage-and-visualization.md#s-13-2)、[13.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-13-3) |
| 46 | [15.1](../../topics/observability/elk/03-search-storage-and-visualization.md#s-15-1)、[15.2](../../topics/observability/elk/03-search-storage-and-visualization.md#s-15-2)、[15.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-15-3)、[15.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-15-4) |
| 47 | [16.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-16-3)、[16.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-16-4) |
| 48 | [20.3](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-20-3)、[20.4](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-20-4) |
| 49 | [21.3](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-21-3)、[21.5](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-21-5) |
| 50 | [21.4](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-21-4)、[21.5](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-21-5) |
| 51 | [11.1](../../topics/observability/elk/02-pipeline-and-reliability.md#s-11-1)、[11.2](../../topics/observability/elk/02-pipeline-and-reliability.md#s-11-2) |
| 52 | [7.3](../../topics/observability/elk/02-pipeline-and-reliability.md#s-7-3)、[8.1](../../topics/observability/elk/02-pipeline-and-reliability.md#s-8-1)、[8.2](../../topics/observability/elk/02-pipeline-and-reliability.md#s-8-2)、[10.2](../../topics/observability/elk/02-pipeline-and-reliability.md#s-10-2)、[11.1](../../topics/observability/elk/02-pipeline-and-reliability.md#s-11-1)、[11.2](../../topics/observability/elk/02-pipeline-and-reliability.md#s-11-2) |
| 53 | [2.4](../../topics/observability/elk/01-log-foundations-and-collection.md#s-2-4)、[8.4](../../topics/observability/elk/02-pipeline-and-reliability.md#s-8-4)、[9.4](../../topics/observability/elk/02-pipeline-and-reliability.md#s-9-4)、[11.4](../../topics/observability/elk/02-pipeline-and-reliability.md#s-11-4)、[12.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-12-3)、[12.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-12-4)、[13.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-13-4)、[14.1](../../topics/observability/elk/03-search-storage-and-visualization.md#s-14-1)、[14.3](../../topics/observability/elk/03-search-storage-and-visualization.md#s-14-3)、[16.4](../../topics/observability/elk/03-search-storage-and-visualization.md#s-16-4)、[18.2](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-18-2)、[19.2](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-19-2)、[19.3](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-19-3)、[20.3](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-20-3)、[21.2](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-21-2)、[21.4](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-21-4)、[21.5](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-21-5) |
| 54 | [11.3](../../topics/observability/elk/02-pipeline-and-reliability.md#s-11-3)、[11.4](../../topics/observability/elk/02-pipeline-and-reliability.md#s-11-4)、[24.4](../../topics/observability/elk/04-production-operations-and-troubleshooting.md#s-24-4) |

## 来源快照哈希

用于对照重组前输入；旧文件名属于历史材料标识。

| 原文件 | SHA-256 |
| --- | --- |
| `01-foundations-and-filebeat.md` | `e58bbc0b183903885ec7e309656d3b6ec2db9dc85cd4c2c7dd4c33ac8b9a7a29` |
| `02-kafka-and-logstash.md` | `2d43db2c987ca51e110acae926b7eb26a667ce14867b0a6449107f042953dab9` |
| `03-elasticsearch-and-kibana.md` | `4b799ddbce592ec4d0338fc4681765ee600f8fccc6520cf00c071eb7846ca531` |
| `04-production-and-troubleshooting.md` | `85ed024fe76d104d64967dd2305859be5cf3f8e4fd112cafb3a2e0c21c5029fc` |
| `05-opensearch-practice-and-comparison.md` | `def53d46d92e30dffb6234e3d890821246f4a4f1409ed680bfc0817f7b1e3391` |
| `06-high-availability-and-storage-cost.md` | `a1017d904d0084938470ee0917c23ffaa5ce16f15739fc98d36528f8c5b11eb7` |
| `07-index-query-performance-and-log-alerting.md` | `8329e23b6e5bbf84850de861a7658dd4c3a92ed12bc162298b6369697a92ce21` |
| `08-reproducible-labs-and-evidence.md` | `54605e3d88eab7e0f813dd91b1e4f7db56695fb174aadeb641ada0a620e74ea2` |
| `README.md` | `d1445469de38f73fca07a7e42c2970b06def94feae10d1bf116eab4bcd36923f` |
| `elk-expansion-integration-notes.md` | `996152e4df49801c49467bf5389209b0037a55b258d3a2680043fa797a436300` |
| `outline.md` | `5e060de312fca06132b6a7f81551b29581b172d685aecd3b9630f9bec9e81f47` |

## 网页扩展交付记录（历史）

> 以下保留原交付范围、版本依据、测试说明与边界。其第五～八卷、原文件行号和交付动作均指重组前输入；历史卷链接已指向当前相应篇目。当前验证结果以上面的本地记录为准。


> 交付日期：2026-09-25。本文件是新增第五～八卷的合并与验证说明，不作为学习笔记正文，也不纳入 Roadmap。
> 输入依据：本会话提供的 `elk-notes-expansion-handoff.md`、原四卷 ELK 笔记和原 README。
> 本轮只交付五份新增 Markdown；未修改旧文件、仓库导航，未生成 HTML，未执行 Git 操作。
> “正文已完成”与“真实产品环境验证通过”是两件事。本次实际执行了静态和本地逻辑/模拟测试；真实组件、端到端、故障和 UI 验收未执行。

### 一、交付物与合并位置

#### 1.1 五个新增文件

将以下文件放到原有 `topics/observability/elk/` 同一目录即可审阅；不存在需要覆盖的旧同名正文。

| 新增文件 | 章节 | 内容 |
| --- | --- | --- |
| [05-opensearch-practice-and-comparison.md](../../topics/observability/elk/03-search-storage-and-visualization.md) | 34～39 | 产品与版本边界、独立双后端链路、API/字段/脚本差异、ISM、Dashboards、组件选型 |
| [06-high-availability-and-storage-cost.md](../../topics/observability/elk/04-production-operations-and-troubleshooting.md) | 40～44 | 六节点、三故障域、节点维护、冷热转层、生命周期、快照和容量成本 |
| [07-index-query-performance-and-log-alerting.md](../../topics/observability/elk/04-production-operations-and-troubleshooting.md) | 45～50 | 索引结构、性能诊断、三类查询改写、混合负载、业务告警与恢复语义 |
| [08-reproducible-labs-and-evidence.md](../../topics/observability/elk/02-pipeline-and-reliability.md) | 51～54 | 35 个完整共用文件、提取器、运行入口、测试矩阵和证据规则 |
| `elk-expansion-integration-notes.md` | 不编学习章节号 | 本文件；旧文审阅、合并边界及实际验证记录 |

新增正文共 21 章，连续编号 34～54。
所有正文保持一个 H1，H2 是章节，H3 是学习小节，H4 是内部知识点；章节引言放在首个 H3 下。
每卷少于 5,000 行。前面三卷不重复第八卷的长配置；第八卷是实验代码的唯一权威位置。

#### 1.2 本轮不做的事项

不更新原 README，不更名旧目录，不构建 Roadmap HTML，不更改根导航，不推送或创建提交。
也不执行全量 ES 历史数据迁移、不迁移既有权限和看板、不扩写一套现代 Kafka/Elastic 升级手册。
没有把向量检索、RAG 或独立多租户专卷混进这次七项扩展。

本地审阅后可自行决定是否合并下面列出的旧文改进，再执行真实实验、生成 HTML 和同步导航。
这些是用户本地阶段的操作，不是本次已经完成的仓库动作。

### 二、七项要求的章节落点

#### 2.1 范围对应

| 交接主题 | 正文落点 | 实验或交付证据 |
| --- | --- | --- |
| OpenSearch 实践与差异 | 34～38 | 独立 Compose、专用 OS output、双分支初始化、ISM、Dashboards 与 API 对照 |
| 可复现文件与测试证据 | 51～54 | 35 个完整文件、拒绝覆盖的提取器、环境/命令/退出码/哈希记录 |
| 多节点高可用与故障域 | 40～42 | 两产品各六节点生成器、属性分配、单节点/故障域/网络隔离和恢复 |
| 索引与查询性能 | 45～48 | wide/lean Mapping、混合写读工具、Profile、三组查询等价性 |
| 冷热与存储成本 | 43～44 | 写入→滚动→温层→删除；故障余量、合并临时空间、快照/恢复算例 |
| 日志驱动业务告警 | 49～50 | 错误率、异常突增、周期日志缺失；原生 Monitor 与公共恢复状态机 |
| 采集加工选型 | 39 | Filebeat/Fluent Bit/Vector/Collector，以及 Logstash/Data Prepper/Ingest 对照 |

#### 2.2 与旧章节的关系

| 旧内容 | 新增内容如何深化 | 不重复的部分 |
| --- | --- | --- |
| 第 3～8 章日志契约、Filebeat | 沿用身份与字段；增加非法应用 JSON 的可对账实验信封 | 不再重写所有 Filebeat Input/Registry 基础 |
| 第 9～16 章 Kafka/Logstash | 相同 Topic、独立消费组与 PQ，比较两个输出后端 | 不扩展成 Kafka HA 专著 |
| 第 17～21 章 ES 集群、Mapping、ILM | 产品差异、ISM、多节点感知与分层策略 | 不把 ILM JSON 改名当作 ISM |
| 第 22～25 章写入、查询、Kibana | Segment、字段成本、Profile、等价性和 Dashboards 对照 | 不承诺 Kibana Saved Objects 无损导入 |
| 第 27～30 章可靠性、容量、监控 | 源哈希、正常/隔离路由对账、容量故障余量、业务日志告警 | 不把平台监控替代业务告警 |
| 第 31～33 章安全、维护、排障 | 独立身份检查、TLS 参数差异、故障域演练与恢复证据 | 不把实验未认证配置当生产安全方案 |

### 三、版本选择与兼容性证据

#### 3.1 实验版本

| 对象 | 固定版本/配置 | 本轮验证层次 |
| --- | --- | --- |
| Elasticsearch / Kibana / Filebeat | 7.17.29 | 保留原输入基线；未启动真实产品 |
| Logstash 两分支主程序 | 7.17.29 | 配置与代码阅读；未进行镜像构建或插件加载 |
| Kafka / ZooKeeper 模式 | Kafka 2.8.2，Scala 2.13 包；随包 ZooKeeper | 固定包与 SHA-512；未拉取构建或联调 |
| ES output | 11.4.2 | 沿用原发布锁定版本；真实镜像仍需 list --verbose |
| OS output | 2.0.3 | 固定官方 gemspec、配置源码、ECS 和依赖说明 |
| Kafka integration | 10.12.2 | 固定源码核对 decorate_events；构建时设置版本门禁 |
| Ruby filter | 3.1.8 | 发布基线；纯转换逻辑经本机 Ruby 执行，但未加载该插件 |
| OpenSearch / Dashboards | 2.19.6 / 2.19.6 | 官方制品与版本化文档；未验证联合运行 |

核查日期为 2026-09-25。这是一套明确的教学组合，不是“所有组件都是今天最新版”，也不是官方联合认证声明。[OpenSearch 制品][os-artifacts]
原 Elastic 基线仅用于存量学习与对照；不以其历史版本为新建生产默认建议。

#### 3.2 哪些结论有直接依据

OpenSearch 工具兼容文档区分旧 OSS Beats 与较新 Beats；本书不将 Filebeat 7.17 的 Elasticsearch output 直连 OpenSearch 写成受支持路径。
主实验保留 Filebeat→Kafka，再由专用 OpenSearch output 写入。[工具兼容][os-tools]

OS output 2.0.3 的插件 API 范围允许相应 Logstash API 层，源码支持本书所用的认证/TLS、模板开关和 ECS 配置。
但 gemspec 可接受，不等于整个精确版本组合已经跑过真实测试。[gemspec][os-gem] [输出配置源码][os-config]

OS output 的 AWS SDK v3 依赖与原镜像若干 AWS SDK v2 插件存在冲突风险。
新 Dockerfile 只在 OS 镜像逐个移除本实验不使用的六个旧 AWS 输入/输出，再装固定 OS output；不改原 ES 镜像，也不引入额外预发布 integration-aws。[插件说明][os-readme]
构建后的 Kafka integration、Ruby filter 和 OS output 版本不满足门禁时必须失败。
其他传递依赖仍需保存完整插件清单；镜像 tag 还需要实际 digest 才能建立更强的可重复性。

OpenSearch 原生 PIT 的创建/清理端点与 ES 不同；跨索引事件对账采用有界 Scroll，单索引性能对照另实现两产品各自的 PIT。
这不是宣称所有 `_search` 参数完全等价。[OS PIT][os-pit]

ISM 按 `states/actions/transitions` 独立创建，绑定、explain、retry 与 ILM 分开。
2.19 的 allocation 参数表存在类型表达不够准确之处；本书的 `wait_for` 布尔配置同时核对了该分支源码。[ISM][os-ism] [AllocationAction][os-allocation]

#### 3.3 仍需真实验证的兼容项

镜像平台架构和标签可用性、依赖解析、JRuby/Logstash Event 类型、Kafka Codec、Bulk 部分失败与 DLQ 行为、HTTP/TLS/权限、ISM 调度、Painless/Mustache 和通知通道，均不能由本轮静态检查证明。
尤其不能把所有 Elasticsearch output 重试/DLQ 行为原封不动归给 OpenSearch output。
本书会在输出错误和隔离索引之外另要求检查真正的 Bulk/插件错误证据。

选型观察版本为 Fluent Bit 3.2.10、Vector 0.45.0、OTel Collector Contrib 0.136.0、Data Prepper 2.11.0。
前面三类给出读取/输出到本地诊断通道的代表性配置，不冒充已经与主实验 Kafka/OS 联调。
Data Prepper 只作服务端加工选择，不把托管 ingestion 服务专属能力归给自建产品。

### 四、数据契约、命名与复现约定

#### 4.1 保留的契约

保留服务 `orders-api`、环境 `lab`、源 `run_id`/`event_id`，以及后端 `labels.run_id`/`event.id`。
访问事件仍用 `nginx.access`，Java 多行用 `java.application`；增加 `business.heartbeat` 与 `pipeline.probe`，避免它们混进请求错误率分母。
耗时继续使用 `event.duration` 纳秒；无效观测不统一补 0。

本轮规范化函数是扩展实验的共同字段子集，不宣称复制原 normalize.rb 的所有上游字段和功能。
例如原文中更细的多上游解析、方法和业务字段，仍由原四卷负责；要在生产替换时需单独做功能差异清单。
本轮脚本的目标是验证七项新增主题，不是覆盖原脚本后承诺无行为变化。

#### 4.2 实验信封和对账

合法外层信封保存 run_id/event_id，payload 是应用原文，因此刻意损坏的应用 JSON 仍能进入对应批次隔离索引。
这是一种测试夹具，不要求现有所有生产应用更改日志格式。
真正的外层也损坏时，使用 Kafka topic/partition/offset 形成隔离身份并标记 `unattributed`，没有猜测缺失 run_id。

`mixed --count 100` 的设计预期是 104 个传输事件、103 个唯一 ID、93 个正常和10个隔离。
重复的源事件在同一具体索引内按稳定 `_id` 覆盖；跨 Rollover 不保证全局去重。
对账同时检查源 SHA-256、事件 ID 集合、物理重复、正常/隔离路由、服务、批次和指定字段。
这比单看总数更强，但仍不覆盖每种生产来源或所有 ES/OS 字段。

#### 4.3 隔离资源

| 资源 | 新实验 |
| --- | --- |
| 主项目 | `elk-expansion` |
| HA 项目 | `elk-expansion-ha-es` / `elk-expansion-ha-os` |
| 主 API | ES 19200；OS 29200；均为回环映射 |
| UI | Kibana 15601；Dashboards 25601 |
| Kafka 宿主诊断 | 39092；容器内部 kafka:9092 |
| Logstash API | 19600 / 29600 |
| 通知接收端 | 18080 |
| HA API | ES 19300～19305；OS 29300～29305 |
| Topic / 消费组 | exp-logs-raw / exp-es-v2 / exp-os-v2 |
| 常规别名 | exp-logs / exp-quarantine |
| 生命周期对象 | 仅 exp-cycle-*；短保留策略有显著删除提醒 |
| 性能与故障 | 精确 exp-perf-*；exp-ha-check |

普通停止保留卷与源样本；销毁命令另需确认字符串。
本地复制代码后仍应核对 Docker Context、项目名、地址和真实资源，名称保护不是安全认证。

### 五、旧文审阅与不覆盖的修正建议

#### 5.1 区分硬错误与扩展适配

未将“新主题需要更多保护”写成“旧文原场景一定错误”。
本轮主要发现的是脚本适用范围和新实验不同，以及重跑初始化时的操作风险；下面逐项说明，不直接重写旧文件。

| 原文件/位置 | 现有行为与边界 | 本轮新增实现或建议 |
| --- | --- | --- |
| 第二卷，第16章，`init_es.py`（原文约1679行起） | 固定 ES 实验身份；会 PUT 模板；原第三卷已经说明重跑可能覆盖后来加入的 ILM 模板设置 | 新 `init_backend.py` 分产品识别；已有资源不自动覆盖，检查 owner/schema；保留原 ILM 风险提醒 |
| 第三卷，第21章，`enable_ilm.py`（约836行起） | ILM 的 policy/settings/explain 专属，已有预览、apply 与备份保护 | 新 `lifecycle.py` 分别生成 ILM/ISM；不能改 URL 或改名字后沿用 JSON |
| 第三卷，第23章，`export_run.py`（约1548行起） | 使用 ES PIT 和 `_shard_doc`，有 partial、准确计数和资源清理保护；不能据此支持 OS | 新 `export_audit.py` 跨两别名 Scroll；`query_cases.py` 单索引分别调用产品 PIT |
| 第四卷，第27章，`audit_run.py`（约544行起） | 输入必须可解析为 JSON，并拒绝重复源 ID；适合原坏状态值样本，不等价于本轮坏 JSON/重复发送样本 | 新信封+manifest 明确唯一事件集合；增加路由、字段和源哈希检查；不原地改变旧语义 |
| 第四卷，第30章，`probe.py`（约1104行起） | 探针经过采集入口，而非直接写 ES；包含 deadline、状态/指标文件等能力 | 新 `probe_v2.py` 只做带产品识别的一次性探针；没有悄悄声称继承旧 textfile exporter 和持久状态全部功能 |
| 第二卷，第15章，`decorate_events => "basic"` | 固定 Kafka integration 10.12.2 源码接受 basic；不是参数类型错误 | 保持 basic。不能按别的历史版本文档改成布尔值后宣称修复 |
| 第三卷，第22章，`_stats/segments,merge,refresh,flush`（约1280行） | 请求指标名 `merge` 与响应字段 `merges` 不同，原文已明确 | 保持请求 `merge`，不把它“修复”为错误的请求名 |

Kafka 配置判断依据来自固定 10.12.2 源码；索引统计名来自 ES 7.17 API。[Kafka input][kafka-input] [ES index stats][es-stats]

#### 5.2 哪些本地问题仍需另行补齐

新初始化脚本检查已有对象的标记和归属，不做任意在线模板漂移修复。
本地发现模板 `_meta` 仍正确但内部属性已经被修改时，应比较服务端完整对象与代码输出，不能仅凭归属标签宣称配置一致。

新标签和告警窗口只覆盖单服务实验；真实多实例、采样、多个分区、跨 Rollover 重放与来源覆盖率，需要更多生产样本。
新的公共告警状态用本机文件锁和 outbox，不是分布式唯一执行器；通知接收端保存原体，不实现生产幂等消费。

关于许可功能：普通快照不等于在线可搜索冷层；Watcher、搜索快照、托管温冷存储均需要分别核对版本、许可证或服务条件。
本轮默认不依赖这些条件不明的功能，也没有伪造云价格或存储节省比率。

### 六、本次实际执行记录

#### 6.1 运行环境与检查命令

检查发生在本会话工作容器中，使用 Python 3.13.5、本机 Ruby、Bash 和 PyYAML。
未提供 Docker Engine/Compose 运行环境、Elasticsearch、OpenSearch、Kafka 或浏览器实例。
命令写在下方，便于提取第八卷后在自己的目录复跑；它们不是要求把工作容器的绝对路径搬回本地。

```bash
python3 -m unittest discover -s tests -v
python3 tools/static_check.py
```

第八卷提取器也经过实际执行：35个文件与生成前的源码逐字节一致。
随后在**提取出来的目录**重新执行测试，避免只测试写作暂存目录而漏掉 Markdown 复制或转义错误。

#### 6.2 分层结果

| 层次 | 状态 | 本次实际结果 | 不可由此推导 |
| --- | --- | --- | --- |
| Markdown 结构 | 通过 | 唯一 H1、34～54 连续章节、围栏、内部文件引用、单篇行数 | Roadmap 已生成或浏览器显示已验收 |
| 完整代码块静态检查 | 通过 | Python AST、Ruby -c、Bash -n、YAML重复键/语法、JSON、TOML | Logstash/Painless/产品配置加载通过 |
| 文件提取与一致性 | 通过 | 35个完整文件，逐字节/哈希核对一致 | Docker 镜像可拉取和可启动 |
| 提取器拒绝条件 | 通过 | 非空目录、路径穿越、重复文件名共3组负例被拒绝 | 对所有不可信 Markdown 输入的安全审计 |
| 本地逻辑/模拟 API | 通过 | unittest 72项，72项通过；退出码0 | 真实后端、插件、UI 的联合正确性 |
| 真实单组件 | 未执行 | 没有运行 ES/OS/Kafka/LS/FB | 不能填写“通过” |
| 真实端到端与重启恢复 | 未执行 | 没有真实事件进入搜索后端 | 不能以字典覆盖模拟证明实际写入去重 |
| 高可用/分层/网络故障 | 未执行 | 仅生成和检查配置/策略 | 不能证明跨主机或跨区容灾 |
| 原生监控与通知 | 未执行 | JSON构造与状态逻辑有检查，Painless/Mustache未运行 | 不能声称真实 OpenSearch 告警已送达 |
| 压测/成本实测 | 未执行 | 只完成工具和假设算例 | 不提供虚构吞吐、P99、节省比率 |
| UI / TLS / 最小权限 | 未执行 | 提供操作步骤和验收方法 | API静态格式不代表界面或鉴权正确 |
| 原输入保护 | 通过 | 原五个文件 SHA-256 与任务开始时一致 | 不涉及用户本地仓库其他未上传文件 |

只有一次实际尝试因环境缺失无法继续的检查，才应记录为“受阻”。
本次没有启动的产品测试按“未执行”记录，没有把全部未测项统一标为失败，也没有补写“预期通过”。
原 README 中历史测试数量不计入上述72项。

#### 6.3 回归覆盖说明

72项包括源样本生成与哈希、非法 JSON/字段类型/时间与数值边界、空 URI、隔离路由、相同 ID 重放后的逻辑对账、缺失/重复检测、版本保护、部分分片/超时和 Bulk 条目检查。
还覆盖不同产品 PIT 路径、清理与 partial 文件、HA 配置故障域/首次引导、ILM/ISM 分离、容量非有限值和故障余量、告警低流量/无见证/恢复/持续提醒及监控启停保留 ID。

Ruby 测试执行的是新的纯规范化函数；字典模拟相同 `_id` 的覆盖，Mock API 模拟预先定义的响应。
没有在 Ruby MRI 中伪造“真正运行了 JRuby Logstash 插件”，也没有模拟一个完整搜索引擎来替代真实查询。

#### 6.4 原文件保持不变的哈希

下表记录任务开始与结束均一致的原文件 SHA-256。只是上传版本的保护证据，不代表用户本地其他版本也相同。

| 原文件 | 原行数 | SHA-256 |
| --- | ---: | --- |
| README.md | 246 | `816a0279f37a32df2326994059c50bb1ac5086c88ec32ea06ccdd132f525b217` |
| 01-foundations-and-filebeat.md | 1795 | `e58bbc0b183903885ec7e309656d3b6ec2db9dc85cd4c2c7dd4c33ac8b9a7a29` |
| 02-kafka-and-logstash.md | 2031 | `2d43db2c987ca51e110acae926b7eb26a667ce14867b0a6449107f042953dab9` |
| 03-elasticsearch-and-kibana.md | 2097 | `4b799ddbce592ec4d0338fc4681765ee600f8fccc6520cf00c071eb7846ca531` |
| 04-production-and-troubleshooting.md | 2548 | `85ed024fe76d104d64967dd2305859be5cf3f8e4fd112cafb3a2e0c21c5029fc` |

### 七、本地执行与验收交接

#### 7.1 首次运行顺序

先阅读第五卷的产品/资源边界，再从第八卷提取完整文件到一个空目录。
审阅短保留策略、销毁确认和端口后，先复跑离线检查，再用 `run.sh precheck` 检查真实 Docker 条件。
构建/启动失败时保存退出码和错误，不忽略插件版本门禁，不把 image tag 改成 latest 来绕过。

真实运行按：后端与Kafka就绪→产品身份→模板/策略初始化→LS配置检查→采集加工→样本→双后端导出→集合/字段对账→查询→生命周期→告警→故障和恢复→UI。
普通停止始终保留数据，只有审阅后才执行精确的实验销毁动作。

#### 7.2 第一轮必须记录的证据

| 证据包 | 最低内容 |
| --- | --- |
| environment | 系统/CPU/内存/Docker、产品根响应、插件列表、镜像 digest |
| configuration | 配置文件哈希、渲染配置、执行命令、时间、退出码 |
| ingestion | 原始信封/Java样本/manifest、Kafka位置、两个输出分支日志 |
| correctness | 两个后端的完整导出、正常/隔离对账、字段与计数、失败条目 |
| lifecycle | 策略、写别名、索引状态、分片位置、转层和删除时间 |
| alerts | 规则输入/触发/通知/恢复/UNKNOWN，各自真实响应与接收记录 |
| failures | 故障动作、停止条件、恢复过程、恢复后事件集合与队列 |
| performance | 规模/分布/并发/缓存/轮次、成功率、延迟与资源，注明未实测项 |
| ui | 索引模式、时间字段、DQL/Lucene、查询、面板对象与截图 |

不要把认证密码、真实业务敏感日志或令牌写进公开证据包。
主实验使用构造样本，通知接收端仅在本机可访问；用于生产前需要另行安全审查。

#### 7.3 合并完成的判断

用户本地应先审阅和验证新增文件，再决定是否接受旧脚本改进建议。
新链路接入只证明新数据可以被接收和检索；不代表原 ES 历史数据、权限、策略、看板和告警已经迁移。
当实际测试与文中预期不一致时，保留失败证据，并修改对应权威文件及解释，避免只改一个临时副本。

最终交接应保留未覆盖项和环境差异；不能把本文件中的“未执行”仅因为文档写完就全部改成“通过”。

### 八、关键复查资料

#### 8.1 资料优先级

版本化官方文档与固定插件源码用于确定配置和 API；源笔记用于确定旧章节、字段与原测试边界；本轮自编脚本与实际测试输出用于判断本轮验证结果。
滚动文档只作检索入口，不能自动代替固定版本契约。
下面资料用于本次核查，正文中也已就近标注；源码分支的读取日期为2026-09-25。

[os-artifacts]: https://opensearch.org/artifacts/by-version/
[os-tools]: https://docs.opensearch.org/2.19/tools/
[os-gem]: https://github.com/opensearch-project/logstash-output-opensearch/blob/2.0.3/logstash-output-opensearch.gemspec
[os-config]: https://github.com/opensearch-project/logstash-output-opensearch/blob/2.0.3/lib/logstash/plugin_mixins/opensearch/api_configs.rb
[os-readme]: https://github.com/opensearch-project/logstash-output-opensearch/blob/2.0.3/README.md
[os-pit]: https://docs.opensearch.org/2.19/search-plugins/searching-data/point-in-time-api/
[os-ism]: https://docs.opensearch.org/2.19/im-plugin/ism/policies/
[os-allocation]: https://github.com/opensearch-project/index-management/blob/2.19/src/main/kotlin/org/opensearch/indexmanagement/indexstatemanagement/action/AllocationAction.kt
[kafka-input]: https://github.com/logstash-plugins/logstash-integration-kafka/blob/v10.12.2/lib/logstash/inputs/kafka.rb
[es-stats]: https://www.elastic.co/guide/en/elasticsearch/reference/7.17/indices-stats.html
