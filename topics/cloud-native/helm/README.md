# Helm 学习指南

本主题覆盖 Helm 发布管理、Chart 开发、仓库安全、扩展和故障排查，面向需要标准化 Kubernetes 应用交付与回滚的工程师。

## 可以学到什么

- 理解 Chart、Release、Values 与渲染流程。
- 安装、升级、回滚和排查 Helm Release。
- 设计可复用模板、依赖、校验和环境覆盖。
- 管理仓库、签名、凭据与制品版本。
- 使用命令参考和调试手段定位渲染/部署失败。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 基础与发布运维 | Release 生命周期、Values | [Markdown](./01-foundations-and-release-operations.md) · [Roadmap](./01-foundations-and-release-operations-roadmap.html) |
| 2 | Chart 开发 | 模板、依赖、最佳实践 | [Markdown](./02-chart-development-and-best-practices.md) · [Roadmap](./02-chart-development-and-best-practices-roadmap.html) |
| 3 | 仓库、安全与扩展 | 仓库、签名、插件 | [Markdown](./03-repositories-security-and-extensions.md) · [Roadmap](./03-repositories-security-and-extensions-roadmap.html) |
| 4 | 命令与故障排查 | 调试和常用命令 | [Markdown](./04-command-reference-and-troubleshooting.md) · [Roadmap](./04-command-reference-and-troubleshooting-roadmap.html) |

## 阅读建议

- 先部署现有 Chart，再编写自己的模板；每次升级保留版本和回滚验证。
- 将敏感 Values 交给专用密钥系统，不提交到 Chart 仓库。
