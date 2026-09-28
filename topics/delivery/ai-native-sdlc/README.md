# AI 原生软件研发全生命周期实践

本主题以 Claude 生态为例，介绍如何将 AI 融入规划、设计、构建、测试、部署与维护，通过受版本控制的产物串联流程，并在关键位置保留人工判断和治理关卡。适合研发负责人、平台工程师、SRE，以及负责质量与安全的工程师阅读。

## 开始学习

| 学习内容 | Markdown | Roadmap |
| --- | --- | --- |
| AI 原生软件开发生命周期（SDLC）实践手册 | [阅读手册](./playbook.md) | [交互式学习路线](./playbook-roadmap.html) |

## 可以学到什么

- 用 `intent.md`、`spec.md` 和 `plan.md` 记录意图、设计与实现计划，让阶段交接有可审查的依据。
- 将组织知识放入 `CLAUDE.md` 与 Skills，结合计划模式、子智能体和反馈循环组织构建过程。
- 把持续评估、PR 评审、审批钩子和 CI/CD 串联起来，明确智能体行动与人工授权的边界。
- 将生产信号与事件重新写入研发流程，用先行和滞后指标衡量改造效果。

## 推荐学习顺序

先读瓶颈变化、AI 原生 SDLC 的定义和实践依赖图，再顺着六个阶段了解产物如何流转。落地时按照各项实践的前置条件选择起点，不必一次启用整个闭环。

文中代码和配置是原材料中的示例，本仓库本次只完成内容整理与页面生成，未执行这些示例或验证生产效果。

## 来源与阅读边界

本手册为 Louis Claxton 在 Anthropic 发布的 [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) 的中文翻译整理。原文页面发布日期为 2026-08-21，本次整理日期为 2026-09-28。正文中的第一人称指原作者及其团队；Claude 产品功能、预览状态与计费信息需要结合官方文档确认。原文及译文内容的权利归原权利人所有。

本主题关注研发交付流程；通用治理框架可结合[交付治理与容量保障](../delivery-governance/README.md)，Skills 与 MCP 的技术细节见 [Agent 扩展工程](../../ai-agents/agent-extensions/README.md)，生产诊断和自动修复见 [LLM-AIOps](../../aiops/llm-aiops/README.md)。

Markdown 是内容源；修改正文后，在仓库根目录运行 `./scripts/build-roadmaps.sh topics/delivery/ai-native-sdlc/playbook.md`，并同步检查本页及根目录导航。
