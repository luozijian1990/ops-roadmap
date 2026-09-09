# Terraform 学习指南

本主题系统介绍 Terraform 基础设施即代码，从工作目录、配置语言和 Provider 开始，逐步覆盖状态管理、资源导入、模块重构、Workspace、HCP Terraform 与 Stacks，适合负责云平台自动化和基础设施交付的工程师。

## 可以学到什么

- 理解 Terraform 初始化、计划、应用和销毁的工作流与边界。
- 配置 Provider 认证、版本约束、锁文件和 CLI 运行环境。
- 使用变量、表达式、依赖关系、输出值和资源地址组织配置。
- 管理状态、备份、锁、刷新、重建、迁移和异常恢复。
- 将已有云资源导入 Terraform，并审查导入后的差异与漂移。
- 使用模块、Workspace、HCP Terraform 和 Stacks 组织多环境交付。
- 通过测试、依赖盘点和审计证据提高配置质量。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 基础工作流与配置质量 | 工作目录、初始化、计划、表达式、输出 | [Markdown](./guide.md) · [Roadmap](./guide-roadmap.html) |
| 2 | 状态、导入与资源重构 | 状态绑定、导入、刷新、重建、备份恢复 | [Markdown](./guide.md) · [Roadmap](./guide-roadmap.html) |
| 3 | Stacks 与多环境交付 | Stack、部署组、Workspace、HCP Terraform | [Markdown](./guide.md) · [Roadmap](./guide-roadmap.html) |
| 4 | Provider、测试与审计 | 版本分发、CLI 自动化、测试、依赖审计 | [Markdown](./guide.md) · [Roadmap](./guide-roadmap.html) |

## 阅读建议

- 先用内置 `terraform_data` 熟悉计划和状态，再连接真实 Provider 与云资源。
- 每次状态、导入或重构操作前保留备份，并审查完整计划中的更新、替换和删除动作。
- Stacks、HCP Terraform 和云端案例需要匹配目标版本、权限与平台能力；笔记中的占位 ID 和输出不能直接当作生产值。
