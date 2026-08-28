# Jenkins 学习指南

本主题从 Jenkins 安装配置进入 Webhook、共享库、CI 质量门禁和持续交付实践，帮助团队建立可追溯、可重复并支持回滚的流水线。

## 可以学到什么

- 在 Docker、Kubernetes 或 Linux 上部署并配置 Jenkins。
- 设计安全的 Webhook 触发链和手动触发契约。
- 用 Jenkinsfile/共享库统一多语言 CI 流程。
- 接入 SonarQube Quality Gate、制品追踪和发布控制。
- 管理超时、重试、并发、清理、凭据和失败恢复。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 安装与配置 | 部署、节点、凭据 | [Markdown](./guide.md) · [Roadmap](./guide-roadmap.html) |
| 2 | 持续交付实践 | 触发、流水线、质量与制品 | [Markdown](./delivery-practice.md) · [Roadmap](./delivery-practice-roadmap.html) |

## 阅读建议

- 先跑通最小 CI，再引入共享库、质量门禁和发布阶段。
- 生产流水线应限制凭据权限，保留构建制品与回滚入口。
