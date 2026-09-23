# 交付治理与容量保障学习指南

本主题从「工具专题之上还缺什么」出发，整理 DevOps 转型决策、交付链路的工程治理、度量与平台产品化、容量保障四个层面的内容。它不是工具操作手册——Ansible、Jenkins、GitOps、Argo CD、Docker 的操作细节在各自主题中——而是回答为什么做、从哪里开始、用什么证据判断改进是否成立。适合 DevOps 工程师、SRE、平台工程师，以及负责交付体系与稳定性建设的研发负责人。

## 可以学到什么

- 诊断开发与运维之间的协作断层，用 CALMS 划清 DevOps 与工具平台的边界。
- 选择转型的起步姿势、分期目标与成熟度判据，识别转型中反复出现的失败模式。
- 用价值流分析把等待时间与处理时间分开，判断瓶颈究竟在哪一段。
- 对配置管理、分支选型、依赖治理、环境数量、质量门禁和发布策略做出有依据的取舍。
- 建立分层度量体系、识别指标失真机制，并设计平台产品与流水线能力。
- 定义容量目标口径，组织容量测试、全链路压测、容量预测与大促保障体系。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 认知与转型决策 | 协作断层、CALMS 边界、起步姿势、价值流分析、失败模式 | [Markdown](./01-cognition-and-transformation.md) |
| 2 | 工程治理命题 | 配置与依赖、环境数量决策、质量门禁、构建与制品、发布治理 | [Markdown](./02-engineering-governance.md) |
| 3 | 度量、平台与组织 | 度量分层与失真、数据度量平台、平台产品设计、平台研发组织 | [Markdown](./03-metrics-platform-and-organization.md) |
| 4 | 容量保障与稳定性工程 | 容量口径、容量测试、治理手段取舍、全链路压测、容量预测、大促保障 | [Markdown](./04-capacity-and-stability.md) |

## 阅读建议

- 先读第一册建立判断框架，再按当前最紧迫的问题挑后续册。只关心容量与稳定性的话，可以直接从第四册开始。
- 本主题只写决策与治理，工具操作请回到对应主题：[Ansible](../ansible/README.md)、[Jenkins](../jenkins/guide.md)、[GitOps](../gitops/README.md)、[Argo CD](../argo-cd/README.md)、[Docker 第五册](../../cloud-native/docker/05-application-containerization-and-multi-platform-builds.md)。容量相关的算法与模型（排队论推导、限流算法、熔断状态机、Little 定律）见 [架构设计第二册](../../architecture/02-performance-and-capacity.md)。
- 每节末尾都配了可执行的练习，建议边读边在真实环境里做一次基线采集——本主题多数判断都以「有没有可采集的证据」为前提。
- Markdown 是内容源，Roadmap HTML 由仓库根目录的 `scripts/build-roadmaps.sh` 统一生成。本主题的 Roadmap 尚未产出，生成后需把入口补进上表，并同步根目录 `index.html` 与 `README.md`。
