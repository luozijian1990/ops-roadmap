# LLM-AIOps 学习指南

本主题把大模型放进运维闭环，覆盖评测可信性、知识工程、可观测信号、RCA、自动修复和 AI 平台基础设施。重点是证据、权限和退出条件，而不是单纯选择模型。

## 可以学到什么

- 拆解 Incident Lifecycle，区分 Copilot、Agent 与自治运维。
- 建立运维知识生命周期、权限边界和可检索资产。
- 评估遥测质量、信号成本，并把指标/日志/链路组织成证据。
- 设计候选根因、验证路径和可解释的 RCA 输出。
- 按风险分级行动建议、自动修复、回滚和人工接管。
- 将 IaC、基础设施状态与 AI 平台纳入受控运维闭环。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 总览与边界 | 六方向依赖和生产闭环 | [Markdown](./00-overview.md) · [Roadmap](./00-overview-roadmap.html) |
| 2 | 基础、评测与可信性 | 任务拆解、基线、退出条件 | [Markdown](./01-foundations-evaluation-trust.md) · [Roadmap](./01-foundations-evaluation-trust-roadmap.html) |
| 3 | 知识工程与协作 | 知识资产、权限、人机协作 | [Markdown](./02-ops-knowledge-and-collaboration.md) · [Roadmap](./02-ops-knowledge-and-collaboration-roadmap.html) |
| 4 | 可观测信号 | 遥测质量与异常证据 | [Markdown](./03-observability-and-signals.md) · [Roadmap](./03-observability-and-signals-roadmap.html) |
| 5 | 诊断与 RCA | 根因证据链与验证 | [Markdown](./04-diagnosis-and-rca.md) · [Roadmap](./04-diagnosis-and-rca-roadmap.html) |
| 6 | 缓解与自治 | 动作契约、回滚、Game Day | [Markdown](./05-remediation-and-autonomy.md) · [Roadmap](./05-remediation-and-autonomy-roadmap.html) |
| 7 | 基础设施与 AI 平台 | IaC 与平台状态治理 | [Markdown](./06-infrastructure-and-ai-platform.md) · [Roadmap](./06-infrastructure-and-ai-platform-roadmap.html) |

## 阅读建议

- 严格按顺序阅读；每一方向先建立不用 LLM 的基线，再验证模型增益。
- 生产试点应保留人工批准、审计记录和明确的停止条件。
