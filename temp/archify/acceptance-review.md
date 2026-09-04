# Archify 验收 Review

评估日期：2026-09-04
范围：`temp/archify/` 中按 `temp/cases-archify-high-priority-assessment.md` 生成的 17 个高优先级案例图。

## 结论摘要

| 项目 | 结果 |
| --- | --- |
| 规格 / HTML / receipt | 17 / 17 / 17，文件齐全 |
| Deterministic validation | 17/17 `showcase`，每张 9/9 checks，0 errors，0 warnings |
| 自动浏览器证据 | 3 `passed`，14 `failed` |
| 自动浏览器失败原因 | Chrome 可执行文件可见，但 DevTools 进程退出并收到 `SIGABRT`；不是 Archify composition error |
| 人工视觉检查 | 17 张均用本地 Chrome CUA 查看过默认 READ 浅色页面；7 张保留首屏/纵向布局风险说明 |
| 决策 | 3 `approved`，14 `approved-with-notes`，0 `needs-fix` |

### 证据边界

- `validate` 证明规格和布局组合通过；`deliver` 证明当前 JSON 与当前 HTML 的确定性产物检查通过；两者都不等于浏览器视觉通过。
- 每个 `.visual-check.json` 的 artifact SHA-256 与当前 HTML 已逐一核对，17/17 一致。
- 自动 `visual-check` 的最新 receipt 仍按规范记录为 `failed`，不能改写成 `skipped`：Chrome 已被发现，失败发生在 DevTools 进程运行时。
- 人工检查只覆盖默认 READ、浅色主题；它支持 `visual_quality` 判断，但不替代自动化 receipt，也没有把 receipt 中的 `visualReview: pending` 改写为自动通过。
- 农行案例使用 workflow schema v2，schema 不支持节点级 `sources` 或 `meta.repository`；因此它的来源证据直接引用案例原文行号，没有把不受支持的字段塞进规格。

## 逐案例记录

### 1. B站 AIOps 根因分析实践

- `case`: `cases/aiops/bilibili-aiops-root-cause-analysis.md`
- `diagram`: `architecture`，[`bilibili-aiops-root-cause.html`](./bilibili-aiops-root-cause.html)
- `source_evidence`: `:34` 数据工程层；`:55-104` Metric/Trace/Log 接入、事件处理与查询；`:188` 分析对象与数据范围。
- `semantic_fidelity`: 保留应用层、算法平台层、数据工程层，以及 VictoriaMetrics、Kafka、Flink、ClickHouse、Neo4j 的主要数据链路；没有把根因推导扩展成案例未声明的能力。
- `visual_quality`: 人工浅色 READ 检查未见明确关系穿过节点；存在首屏信息密度和纵向布局风险，需在可用浏览器中复核大屏高度。
- `browser_evidence`: `failed`；receipt 为 [`bilibili-aiops-root-cause.visual-check.json`](./bilibili-aiops-root-cause.visual-check.json)，原因是 Chrome `SIGABRT`，无 viewport/capture 结果。
- `issues`: 自动浏览器环境失败；首屏/纵向布局尚未取得自动化证据。
- `decision`: `approved-with-notes`

### 2. 容错容灾体系与实操性演练

- `case`: `cases/reliability/resilience-and-disaster-recovery-drills.md`
- `diagram`: `architecture`，[`resilience-and-disaster-recovery-drills.html`](./resilience-and-disaster-recovery-drills.html)
- `source_evidence`: `:102-120` 可靠性设计与接入系统；`:341` 裸光纤异步；`:627` 监控与控制；`:736` 监控容灾集成；`:772` 演练与实战；`:906-912` 常态化机制与配置管理数据库。
- `semantic_fidelity`: 图中表达整体容灾体系、监控/控制面、容灾平台和演练闭环；未把案例中的两地三中心细节误写成具体厂商实现。
- `visual_quality`: 人工浅色 READ 检查未见明显重叠，层级边界清楚。
- `browser_evidence`: `failed`；receipt 为 [`resilience-and-disaster-recovery-drills.visual-check.json`](./resilience-and-disaster-recovery-drills.visual-check.json)，Chrome `SIGABRT`。
- `issues`: 仅自动浏览器运行时限制。
- `decision`: `approved-with-notes`

### 3. 平安银行容灾切换平台

- `case`: `cases/reliability/ping-an-bank-disaster-recovery-switching.md`
- `diagram`: `architecture`，[`pingan-disaster-recovery-switch.html`](./pingan-disaster-recovery-switch.html)
- `source_evidence`: `:119-143` 同城切换、应用层、HTTP/GSS LB、数据库切换与数据修改；`:181` 原子预案；`:258` 三地部署。
- `semantic_fidelity`: 保留外网流量层、应用层、数据层与切换平台的主备/接管关系；切换流程语义未被压缩成单一“故障转移”箭头。
- `visual_quality`: 人工浅色 READ 检查未见明确遮挡；三地部署与切换分支在首屏高度上有布局风险。
- `browser_evidence`: `failed`；receipt 为 [`pingan-disaster-recovery-switch.visual-check.json`](./pingan-disaster-recovery-switch.visual-check.json)，Chrome `SIGABRT`。
- `issues`: 自动浏览器证据缺失；需要后续稳定 Chrome 运行时复核纵向布局。
- `decision`: `approved-with-notes`

### 4. 去哪儿网故障演练系统

- `case`: `cases/reliability/qunar-chaos-engineering.md`
- `diagram`: `architecture`，[`qunar-chaos-engineering.html`](./qunar-chaos-engineering.html)
- `source_evidence`: `:634-650` 信息来源、编排调度、Salt、OpenStack API、Operator、虚拟机、物理机和容器。
- `semantic_fidelity`: 修正故障注入对象到巡检/IM 的关系，保留 Salt/OpenStack/ChaosBlade Operator 和 VM/物理机/容器执行通道；没有把平台通知关系画反。
- `visual_quality`: 人工浅色 READ 检查未见明显重叠；四层架构主路径清晰。
- `browser_evidence`: `failed`；receipt 为 [`qunar-chaos-engineering.visual-check.json`](./qunar-chaos-engineering.visual-check.json)，最新串行重试仍为 Chrome `SIGABRT`。
- `issues`: 当前 HTML 已重新交付并绑定最新 SHA，但自动视觉检查受环境阻断。
- `decision`: `approved-with-notes`

### 5. 服务稳定性建设与多活治理

- `case`: `cases/reliability/high-availability-and-multi-active-governance.md`
- `diagram`: `architecture`，[`multi-active-governance.html`](./multi-active-governance.html)
- `source_evidence`: `:112-132` 整体架构、接入层、AZ1/AZ2 业务与状态存储、同步链路；`:156` 流量调度；`:160` PICK 路由；`:518` Invoker 管控平台。
- `semantic_fidelity`: 保留 DCDN/POP/PICK 路由、双可用区业务闭环、Invoker 控制面和跨可用区同步；将互斥的 Binlog 主从与 DTS 双向同步改为中性的“跨可用区状态同步”，避免伪造单一实现。
- `visual_quality`: 人工浅色 READ 检查未见最终图形重叠；新增的 Invoker→AZ2 管控边已移到左侧/底部独立走廊，但首屏/纵向布局仍需浏览器复核。
- `browser_evidence`: `failed`；receipt 为 [`multi-active-governance.visual-check.json`](./multi-active-governance.visual-check.json)，Chrome `SIGABRT`。
- `issues`: 初始 `dcdn-to-pop` 与 Invoker→AZ2 相交的问题已修复并通过布局验证；自动浏览器仍不可用。
- `decision`: `approved-with-notes`

### 6. 平安银行分布式单元化架构

- `case`: `cases/reliability/ping-an-bank-cell-based-architecture.md`
- `diagram`: `architecture`，[`cell-based-architecture.html`](./cell-based-architecture.html)
- `source_evidence`: `:33-42` 业务单元与单元数据库；`:76-84` 聚合库、大数据平台和应用消息。
- `semantic_fidelity`: 保留 GNS/DLS 单元路由、单元自包含、数据库日志/聚合库/大数据分析链路；扩容语义没有被误画成运行时自动伸缩。
- `visual_quality`: 人工浅色 READ 检查未见明显重叠，边界层次可读。
- `browser_evidence`: `failed`；receipt 为 [`cell-based-architecture.visual-check.json`](./cell-based-architecture.visual-check.json)，Chrome `SIGABRT`。
- `issues`: 仅自动浏览器运行时限制。
- `decision`: `approved-with-notes`

### 7. 京东到家订单系统高可用

- `case`: `cases/reliability/jd-daojia-order-high-availability.md`
- `diagram`: `architecture`，[`jd-order-high-availability.html`](./jd-order-high-availability.html)
- `source_evidence`: `:53-71` 订单数据流、订单生产、异步下发、个人订单 DB、状态变更同步与取消路径。
- `semantic_fidelity`: 保留订单生产→MQ/RPC→数据库/查询存储的主链路，以及主从、历史库和 ES 热冷分层边界。
- `visual_quality`: 人工浅色 READ 检查未见明确重叠，数据流方向易于扫描。
- `browser_evidence`: `failed`；receipt 为 [`jd-order-high-availability.visual-check.json`](./jd-order-high-availability.visual-check.json)，Chrome `SIGABRT`。
- `issues`: 仅自动浏览器运行时限制。
- `decision`: `approved-with-notes`

### 8. 去哪儿网可观测性实践

- `case`: `cases/observability/qunar-observability-practices.md`
- `diagram`: `architecture`，[`qunar-observability.html`](./qunar-observability.html)
- `source_evidence`: `:446-451` 有状态 Worker 与 Rebalance；`:497-521` 数据采集层、采集服务、存储层、API 层、应用层；`:259` 查询流程。
- `semantic_fidelity`: 已将 ETCD 方向修正为 `Master -> ETCD`，保留 GraphAPI、元数据 DB、VictoriaMetrics、Master/Worker 和 Rebalance 的边界。
- `visual_quality`: 人工浅色 READ 检查未见明显重叠，采集、存储、查询分层清楚。
- `browser_evidence`: `failed`；receipt 为 [`qunar-observability.visual-check.json`](./qunar-observability.visual-check.json)，Chrome `SIGABRT`。
- `issues`: ETCD 关系错误已修复并重新交付；自动浏览器仍失败。
- `decision`: `approved-with-notes`

### 9. 货拉拉全链路 Trace 架构演进

- `case`: `cases/observability/lalamove-end-to-end-tracing.md`
- `diagram`: `architecture`，[`lalamove-trace-evolution.html`](./lalamove-trace-evolution.html)
- `source_evidence`: `:340-349` Trace 3.0 输入、采集、消息缓冲、实时消费、过滤器、热存储和冷存储；`:456` 链路保全。
- `semantic_fidelity`: 以 Trace 3.0 冷热分离为主图，保留 Collector/Kafka/消费、ES/HBase 热冷存储和链路保全；没有把版本演进误合并为同时发生的部署。
- `visual_quality`: 人工浅色 READ 检查未见明确交叠；版本/冷热路径较长，首屏和纵向布局有风险。
- `browser_evidence`: `failed`；receipt 为 [`lalamove-trace-evolution.visual-check.json`](./lalamove-trace-evolution.visual-check.json)，Chrome `SIGABRT`。
- `issues`: 需要后续稳定浏览器证据确认长路径在大屏首屏中的阅读节奏。
- `decision`: `approved-with-notes`

### 10. 趣丸多云架构稳定性实践

- `case`: `cases/cloud-native/quwan-multi-cloud-reliability.md`
- `diagram`: `architecture`，[`quwan-multi-cloud-reliability.html`](./quwan-multi-cloud-reliability.html)
- `source_evidence`: `:54`, `:75`, `:101`, `:229-233`, `:299`, `:846` 多云、VPC/专线/VPN、Kubernetes/Istio 与故障转移素材。
- `semantic_fidelity`: 保留云厂商、VPC/专线/VPN、Kubernetes 集群、Istio 控制面和跨云流量/故障转移边界；未将“多云”简化为单一集群高可用。
- `visual_quality`: 人工浅色 READ 检查未见明确重叠；多云边界和跨云连线存在首屏/纵向布局风险。
- `browser_evidence`: `failed`；receipt 为 [`quwan-multi-cloud-reliability.visual-check.json`](./quwan-multi-cloud-reliability.visual-check.json)，Chrome `SIGABRT`。
- `issues`: 自动浏览器证据缺失；大屏纵向布局待复核。
- `decision`: `approved-with-notes`

### 11. 统一的云原生可观测性数据平台

- `case`: `cases/observability/unified-cloud-native-observability-data-platform.md`
- `diagram`: `architecture`，[`unified-cloud-native-observability.html`](./unified-cloud-native-observability.html)
- `source_evidence`: `:671-700` 服务注册中心、控制平面、数据平面、Querier、指标与日志。
- `semantic_fidelity`: 补齐所有组件的案例来源引用，并保留 Controller、标签同步、eBPF Agent、ClickHouse、MySQL、Querier 和展示层的控制面/数据面关系；加入 pinned repository metadata。
- `visual_quality`: 人工浅色 READ 检查未见明确重叠，控制面/数据面主路径可读。
- `browser_evidence`: `failed`；receipt 为 [`unified-cloud-native-observability.visual-check.json`](./unified-cloud-native-observability.visual-check.json)，Chrome `SIGABRT`。
- `issues`: 来源证据与 pinned metadata 已修复并重新交付；自动浏览器仍失败。
- `decision`: `approved-with-notes`

### 12. 农行 DevOps 合规平台

- `case`: `cases/devops/abc-devops-compliance-platform.md`
- `diagram`: `workflow`（schema v2），[`abc-devops-compliance.html`](./abc-devops-compliance.html)
- `source_evidence`: `:102-126` DevOps 实施全景；`:310-425` 四类流水线、质量门禁、制品晋级、测试与预发布；`:433-469` 数据变更流水线；`:476-506` 测试体系；`:569-576` 发布流程。
- `semantic_fidelity`: 保留提交→并发质量门禁→合并→制品→DEV/TEST/Pre-Prod 验证→业务验收主路径，以及测试并行和失败回退；没有添加 schema 不支持的节点 source 字段或 repository metadata。
- `visual_quality`: 人工浅色 READ 检查未见明确交叠；workflow 节点多、列跨度大，首屏/纵向布局有风险。
- `browser_evidence`: `failed`；receipt 为 [`abc-devops-compliance.visual-check.json`](./abc-devops-compliance.visual-check.json)，Chrome `SIGABRT`。
- `issues`: 曾尝试加入不受 workflow schema 支持的来源字段，已恢复并按当前规格重新交付；自动浏览器证据缺失。
- `decision`: `approved-with-notes`

### 13. 货拉拉一站式 DevOps CI 平台

- `case`: `cases/devops/lalamove-devops-ci-pipeline.md`
- `diagram`: `architecture`，[`lalamove-devops-ci.html`](./lalamove-devops-ci.html)
- `source_evidence`: `:104-112`, `:152`, `:166`, `:174`, `:178` 平台模板/配置/任务管理、GitLab CI、DSL、Runner、抽象执行器与 Kubernetes 构建资源。
- `semantic_fidelity`: 保留平台三层、GitLab CI/Runner/Kubernetes 资源链路和模板化流水线编排；没有把执行器误画成业务运行时服务。
- `visual_quality`: 人工浅色 READ 检查未见明显重叠，主路径清晰。
- `browser_evidence`: `failed`；receipt 为 [`lalamove-devops-ci.visual-check.json`](./lalamove-devops-ci.visual-check.json)，Chrome `SIGABRT`。
- `issues`: 仅自动浏览器运行时限制。
- `decision`: `approved-with-notes`

### 14. 平安银行端到端全链路灰度验证

- `case`: `cases/devops/ping-an-bank-end-to-end-canary-validation.md`
- `diagram`: `architecture`，[`pingan-canary-validation.html`](./pingan-canary-validation.html)
- `source_evidence`: `:73-83` 控制面、规则下发、SLB、微服务框架和 ESB；`:103` 入口应用与接口；`:135-137` 灰度/正式流量。
- `semantic_fidelity`: 保留控制面/数据面、Apollo/SLB/微服务/ESB/API Gateway 与灰度集群的标签透传和分流关系。
- `visual_quality`: 人工浅色 READ 检查未见明显关系遮挡；控制面、正式流量和灰度分支在首屏/纵向布局上有风险。
- `browser_evidence`: `failed`；receipt 为 [`pingan-canary-validation.visual-check.json`](./pingan-canary-validation.visual-check.json)，Chrome `SIGABRT`。
- `issues`: 需要稳定浏览器运行时确认分支在各目标 viewport 的容纳情况。
- `decision`: `approved-with-notes`

### 15. Kubernetes 云原生架构成本优化

- `case`: `cases/finops/kubernetes-cost-optimization.md`
- `diagram`: `architecture`，[`k8s-cost-optimization.html`](./k8s-cost-optimization.html)
- `source_evidence`: `:198-230` 竞价实例工作流程与 K8s 落地架构；`:261-277` 节点组分类、中断信号处理；`:308` 节点组优先级；`:548-550` 弹性伸缩组合。
- `semantic_fidelity`: 保留 Cluster Autoscaler、竞价节点组、中断信号、Notify Handler、节点排空、HPA/Deployment/Prometheus 的处理链路。
- `visual_quality`: 人工浅色 READ 检查未见明显重叠；自动浏览器证据也完成了四个 containment viewport 与两组截图。
- `browser_evidence`: `passed`；receipt 为 [`k8s-cost-optimization.visual-check.json`](./k8s-cost-optimization.visual-check.json)，artifact SHA 与当前 HTML 一致，containment/readability/captures 均 pass。
- `issues`: receipt 的 `visualReview` 仍按规范为 `pending`；这不影响自动浏览器证据通过。
- `decision`: `approved`

### 16. 银行业务中台架构设计

- `case`: `cases/cloud-native/bank-business-middle-platform.md`
- `diagram`: `architecture`，[`bank-business-middle-platform.html`](./bank-business-middle-platform.html)
- `source_evidence`: `:207`, `:269`, `:348`, `:431`, `:542`, `:620` 六大中心；`:702` 整体架构流程；`:707` 产品交付链路。
- `semantic_fidelity`: 保留渠道、产品系统、核心/支付系统与用户、产品、账户、支付、核算、交易六大中心的协同关系；存量系统协同没有被画成一次性迁移。
- `visual_quality`: 人工浅色 READ 检查未见明显重叠；自动浏览器证据覆盖四个目标 viewport，截图生成正常。
- `browser_evidence`: `passed`；receipt 为 [`bank-business-middle-platform.visual-check.json`](./bank-business-middle-platform.visual-check.json)，containment/readability/captures 均 pass。
- `issues`: receipt 的 `visualReview` 仍为 `pending`，属于规范要求的独立声明。
- `decision`: `approved`

### 17. 银行核心系统架构转型

- `case`: `cases/cloud-native/bank-core-architecture-transformation.md`
- `diagram`: `architecture`，[`bank-core-architecture-transformation.html`](./bank-core-architecture-transformation.html)
- `source_evidence`: `:78` 银行系统架构分类；`:120-136` 计算、安全管控与基础应用标准化；`:302-330` 网络多平面、服务器分类与容灾；`:361`, `:401` 数据与存储分层。
- `semantic_fidelity`: 保留服务接入、业务逻辑、核心账务、数据仓库分层，以及数据生命周期、存储分层和两地三中心资源布局。
- `visual_quality`: 人工浅色 READ 检查未见明显重叠；自动浏览器证据覆盖四个目标 viewport，截图生成正常。
- `browser_evidence`: `passed`；receipt 为 [`bank-core-architecture-transformation.visual-check.json`](./bank-core-architecture-transformation.visual-check.json)，containment/readability/captures 均 pass。
- `issues`: receipt 的 `visualReview` 仍为 `pending`，属于自动化与感知 review 分离的正常状态。
- `decision`: `approved`

## 后续动作

1. 在可稳定驱动 Chrome DevTools 的执行环境重新运行 14 个失败案例的 `visual-check`，不改动当前已交付 HTML。
2. 重点复核 7 个已标注首屏/纵向布局风险的案例：B站 AIOps、货拉拉 Trace 3.0、B站同城多活、平安银行灰度验证、平安银行容灾切换、趣丸多云、农行 DevOps workflow。
3. 如果后续浏览器复核发现真实视觉缺陷，只修改对应 JSON，再按 `validate -> deliver -> visual-check` 重新冻结并更新本报告；当前没有需要修复的 deterministic composition error。
