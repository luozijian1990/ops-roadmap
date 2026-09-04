# 模型提示词资料库

这里整理面向 Agentic Coding 环境的模型专项双语提示词参考文档。每份文档都围绕一个模型或模型系列，说明它的行为特点、提示词写法、工具协作、范围控制、验证和交付方式，并提供可以直接改写使用的 Prompt 结构。

这些文件是可复制、可按模型查阅的参考资料，不是 `topics/` 下的正式学习笔记，因此不会参与 Roadmap 生成。模型能力、API、价格和可用性会变化，使用前请以文档内列出的官方来源为准。

## 文档目录

| 模型 | 文档 | 适用环境与用途 | 主要来源 |
| --- | --- | --- | --- |
| Codex / GPT-5.6 | [`codex-5.6-prompt.md`](./codex-5.6-prompt.md) | Codex、Codex CLI、Codex-like Harness 等 Agentic Coding 环境；关注工作契约、工具协作、范围控制、验证和交付 | [OpenAI Codex 文档](https://developers.openai.com/codex/) |
| DeepSeek V4 | [`deepseek-v4-prompt.md`](./deepseek-v4-prompt.md) | DeepSeek Harness、Claude Code（DeepSeek 接入）、Codex、Cline、OpenCode 等；关注思考模式、工具调用、上下文缓存和接入 | [DeepSeek API 文档](https://api-docs.deepseek.com/) |
| Claude Fable 5.1 | [`fable-5.1-prompt.md`](./fable-5.1-prompt.md) | Claude Fable 5.1 智能体环境；关注 effort、进度更新、工具批处理、对话历史、范围和长输出 | [Claude Fable 5.1 提示工程](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1) |
| GLM-5.3 | [`glm-5.3-prompt.md`](./glm-5.3-prompt.md) | Claude Code（GLM 接入）、CodeBuddy、Cline、OpenCode、Kilo Code 等；关注思考深度、工具协作、范围控制、验证和交付 | [GLM-5.3 模型页](https://docs.z.ai/guides/llm/glm-5.3) |
| Kimi K3 | [`kimi-k3-prompt.md`](./kimi-k3-prompt.md) | Kimi Code、Claude Code、Codex、CodeBuddy、Cline、OpenCode 等；关注思考历史、主动性边界、工具协作和视觉验证 | [Kimi K3 快速开始](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart) |

## 使用说明

- 先阅读对应模型的行为约束，再把文档中的 Core Prompt 和 Task Prompt 结构改写成自己的工作约定。
- 英文 Prompt、代码、命令、API 参数、文件名、标识符、URL 和模型名按原文保留；中文说明用于帮助理解和调整。
- 这不是一组可以无条件照搬的系统提示。请结合实际模型、Harness、仓库规范和风险边界做小范围验证。

## 来源与核验

最后核验时间：2026-09-04。此次接入核对了文件完整性、文档元数据和索引链接；模型行为、API、价格及可用性等动态信息仍应以各文档内的官方来源为准。

## 安全提醒

不要在 Prompt、示例或仓库历史中放入 API Key、密码、令牌、公司内部机密、客户数据或其他不应公开的信息。将资料复制到实际项目或交给模型前，先检查上下文和工具权限是否包含敏感内容。
