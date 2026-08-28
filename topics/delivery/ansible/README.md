# Ansible 学习指南

本主题介绍 Ansible 清单、模块、Playbook、Roles、变量和交付运维控制，适合把主机配置、滚动变更和恢复动作编排成可审计代码。

## 可以学到什么

- 编写 Inventory、变量和模块调用，理解幂等性。
- 组织可复用 Roles/Include 与环境拓扑。
- 使用 Tags、Check Mode、异步任务和批次控制。
- 设计失败、变更、委托、滚动发布与恢复行为。
- 调试 Playbook 并控制凭据和执行权限。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 基础、清单与模块 | 连接、变量、幂等任务 | [Markdown](./01-foundations-inventory-and-modules.md) · [Roadmap](./01-foundations-inventory-and-modules-roadmap.html) |
| 2 | Playbook、运维与交付 | Roles、批次、失败恢复 | [Markdown](./02-playbooks-operations-and-delivery.md) · [Roadmap](./02-playbooks-operations-and-delivery-roadmap.html) |

## 阅读建议

- 先在测试主机用 Check Mode 验证，再小批量滚动到生产。
- 将密钥交给 Vault 或 CI 凭据系统，避免写入仓库。
