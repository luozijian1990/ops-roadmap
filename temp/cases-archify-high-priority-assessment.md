# cases 高优先级架构图评估

> 用途：记录 `cases/` 案例中值得优先使用 Archify 制作的架构图候选，后续直接按本清单进入制图，不重复做案例筛选。
>
> 评估日期：2026-09-04
>
> 评估范围：`cases/` 下 83 篇案例。当前案例整体以 `draft` 为主，来源核验状态多为 `pending`。

## 一、评估结论

`cases/` 下的案例几乎都带有 Mermaid 草图，但“有 Mermaid”不等于“适合做技术架构图”。本清单只保留具备以下证据的高优先级内容：

- 有明确的组件、层次、数据中心、控制面/数据面或部署边界；
- 关系边包含调用、路由、同步、异步、切换、写入等真实语义；
- 能提炼为一条主路径，适合 Archify 的 `architecture`、`dataflow`、`workflow`、`sequence` 或 `lifecycle` 类型；
- 一篇案例可以拆成 2～4 张互相配合的图，但不要求把所有 Mermaid 草图全部转换。

后续制图时，应将现有 Mermaid 作为语义来源，重新编排为 Archify JSON；不要机械复制 Mermaid 的布局或样式。每张主图控制在约 12 个主要节点以内，保留有意义的关系标签。

## 二、高优先级候选（A+）

| 排序 | 案例 | 建议图组 | 主要依据 |
| --- | --- | --- | --- |
| 1 | [B站 AIOps 根因分析实践](../cases/aiops/bilibili-aiops-root-cause-analysis.md) | `architecture`：AIOps 三层架构；`dataflow`：Metric/Trace/Log 接入；`architecture`：运维知识图谱；`workflow`：根因分析与模型编排 | 有应用层、算法平台层、数据工程层；包含 VictoriaMetrics、Kafka、Flink、ClickHouse、Neo4j 等真实组件；根因推导链路完整。 |
| 2 | [容错容灾体系与实操性演练](../cases/reliability/resilience-and-disaster-recovery-drills.md) | `architecture`：整体容错容灾体系；`architecture`：两地三中心；`dataflow`：监控与容灾平台集成 | 附录已明确提供整体体系、两地三中心网络、监控与容灾集成三类架构素材。 |
| 3 | [平安银行容灾切换平台](../cases/reliability/ping-an-bank-disaster-recovery-switching.md) | `architecture`：子系统切换三层架构；`architecture`：三地部署；`workflow`/`sequence`：检查—执行—验证与预案编排 | 有外网流量层、应用层、数据层，以及切换平台主备/接管关系；串并行编排和切换验证语义清晰。 |
| 4 | [去哪儿网故障演练系统](../cases/reliability/qunar-chaos-engineering.md) | `architecture`：信息来源—执行通道—故障注入—通用能力；`sequence`：故障注入；`workflow`：演练编排与恢复 | 有 Salt、OpenStack API、ChaosBlade Operator、VM/物理机/容器等明确组件，并有完整数据流转时序。 |
| 5 | [服务稳定性建设与多活治理](../cases/reliability/high-availability-and-multi-active-governance.md) | `architecture`：B站同城多活；`dataflow`：流量路由、网关、业务服务、数据同步；`lifecycle`：多活演进 | DCDN、POP、可用区、SLB、API Gateway、业务服务、缓存/KV/DB、Invoker 管控关系明确。 |
| 6 | [平安银行分布式单元化架构](../cases/reliability/ping-an-bank-cell-based-architecture.md) | `architecture`：GNS/DLS 单元路由；`dataflow`：数据库日志、聚合库、大数据分析；`lifecycle`：横向扩容与两地三中心 | 业务请求路由、客户分片、单元自包含、数据同步和扩容流程都有具体组件和路径。 |
| 7 | [京东到家订单系统高可用](../cases/reliability/jd-daojia-order-high-availability.md) | `architecture`：业务/系统组成；`dataflow`：订单生产与 MQ/RPC；`architecture`：数据库与 ES 最终架构；`lifecycle`：架构演进 | 同时具备业务流、订单数据流、主从/历史库/查询库、热冷 ES 等多条可验证路径。 |
| 8 | [去哪儿网可观测性实践](../cases/observability/qunar-observability-practices.md) | `architecture`：存算分离；`architecture`：采集服务最终架构；`dataflow`：采集、存储、聚合查询 | GraphAPI、元数据 DB、VictoriaMetrics、Master/Worker、ETCD/Rebalance 等组件边界清晰。 |
| 9 | [货拉拉全链路 Trace 架构演进](../cases/observability/lalamove-end-to-end-tracing.md) | `architecture`：监控体系；`dataflow`：Trace 1.0/2.0/3.0；`architecture`：冷热分离 | 从 ES 单体，到 Collector+Kafka，再到 ES/HBase 热冷分离，天然适合做版本演进组图。 |
| 10 | [趣丸多云架构稳定性实践](../cases/cloud-native/quwan-multi-cloud-reliability.md) | `architecture`：多云部署；`architecture`：多云骨干网络；`architecture`：Istio 多集群；`dataflow`：跨云流量与故障转移 | 有云厂商、VPC、专线/VPN、Kubernetes 集群、Istio 控制平面和跨集群访问关系。 |
| 11 | [统一的云原生可观测性数据平台](../cases/observability/unified-cloud-native-observability-data-platform.md) | `architecture`：DeepFlow 控制面/数据面；`dataflow`：eBPF 采集、标签编码、存储查询 | Controller、标签同步、eBPF Agent、ClickHouse、MySQL、Querier 和展示层构成完整平台架构。 |
| 12 | [农行 DevOps 合规平台](../cases/devops/abc-devops-compliance-platform.md) | `architecture`：一体化研发体系；`workflow`：提交构建、持续集成、测试部署、预发布；`workflow`：数据变更流水线 | 质量门禁、制品晋级、多环境并行部署、审批、回退和验证均有明确阶段。 |
| 13 | [货拉拉一站式 DevOps CI 平台](../cases/devops/lalamove-devops-ci-pipeline.md) | `architecture`：平台三层架构；`architecture`：GitLab CI/Runner/K8s；`workflow`：流水线编排 | 模板/配置/任务管理、GitLab CI、DSL、Runner、抽象执行器和 Kubernetes 构建资源链路完整。 |
| 14 | [平安银行端到端全链路灰度验证](../cases/devops/ping-an-bank-end-to-end-canary-validation.md) | `architecture`：控制面/数据面；`workflow`：标签透传和流量分流；`lifecycle`：金丝雀/蓝绿发布 | 流量控制平台、Apollo、SLB、微服务框架、ESB、API 网关和灰度集群关系清楚。 |
| 15 | [K8S 云原生架构成本优化](../cases/finops/kubernetes-cost-optimization.md) | `architecture`：按需/竞价节点组；`workflow`：中断信号处理；`architecture`/`lifecycle`：CronHPA | Cluster Autoscaler、中断信号、Notify Handler、节点排空、HPA/Deployment/Prometheus 等关系具体。 |

## 三、高优先级扩展（A）

下面两篇也具备较强架构素材，可以在第一批样板验证后继续制作：

| 案例 | 建议图组 | 主要依据 |
| --- | --- | --- |
| [银行业务中台架构设计](../cases/cloud-native/bank-business-middle-platform.md) | `architecture`：传统架构与中台架构对比；`architecture`：六大业务中心；`workflow`：新老系统平滑过渡 | 渠道、产品系统、核心/支付系统之间的耦合问题，以及用户、产品、账户、支付、核算、交易六大中心均有明确表达。 |
| [银行核心系统架构转型](../cases/cloud-native/bank-core-architecture-transformation.md) | `architecture`：新核心系统分层；`dataflow`：数据生命周期与存储分层；`architecture`：两地三中心资源布局 | 对服务接入、业务逻辑、核心账务、数据仓库分类，并给出新核心架构和数据管理设计。 |

## 四、建议的首轮样板

为了覆盖 Archify 的主要图类型，首轮建议先做以下四篇：

1. [B站 AIOps 根因分析实践](../cases/aiops/bilibili-aiops-root-cause-analysis.md)：平台架构 + 多源数据流；
2. [平安银行容灾切换平台](../cases/reliability/ping-an-bank-disaster-recovery-switching.md)：部署架构 + 切换 workflow；
3. [去哪儿网故障演练系统](../cases/reliability/qunar-chaos-engineering.md)：架构 + sequence；
4. [货拉拉全链路 Trace 架构演进](../cases/observability/lalamove-end-to-end-tracing.md)：架构演进 + dataflow。

## 五、暂不列入技术架构首批

- `engineering-management/` 大部分案例：主体是组织、能力模型、管理方法或项目流程，适合做 `workflow`、`lifecycle` 或能力地图，不适合作为生产系统架构图。
- AIOps 成熟度模型、AIOps 落地挑战、AIOps 适用性等内容：可做能力分层或建设路线，但缺少具体生产组件，暂不作为首批技术架构图。
- 纯 FinOps 运营机制：优先做成本洞察、预算控制、资源运营的 `workflow`，不优先做基础设施拓扑。

## 六、制图时的事实边界

- 该清单基于案例整理稿，不等同于已核验的生产拓扑；案例状态和来源核验状态应在图注或交付说明中保持透明。
- 保留产品名、协议、组件名、数据方向和同步方式；不要为了通过几何检查删除有意义的关系标签。
- 一篇案例优先产出一张主图，再补 1～3 张支撑图；不要把所有局部 Mermaid 图拼成一张拥挤的大图。
