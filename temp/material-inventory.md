# DevOps 与持续交付材料索引

## 扫描结果

| 目录 | PDF 数量 | 文本提取目录 | 本轮处理范围 |
| --- | ---: | --- | --- |
| `temp/jiaofu/` | 42 | `temp/extracted-text/jiaofu/` | 只提炼到现有 `topics` |
| `temp/devops/` | 41 | `temp/extracted-text/devops/` | 只提炼到现有 `topics` |

编号材料是主要内容；开篇、总结、测试、资料推荐和获奖名单类文件只作背景或暂缓处理。

## 处理分组

| 分组 | 来源范围 | 目标文件 | 状态 |
| --- | --- | --- | --- |
| DevOps 与持续交付边界 | `jiaofu/01-03`、`devops/01-07` | `topics/delivery/gitops/01-principles-workflow-and-adoption.md` | 已合并 |
| 价值流、敏捷与持续改进 | `devops/08-09`、`devops/19-20` | `topics/delivery/gitops/01-principles-workflow-and-adoption.md` | 已合并 |
| 分支、依赖、配置与环境 | `jiaofu/04-13`、`devops/10-11`、`devops/16` | `topics/delivery/gitops/01-principles-workflow-and-adoption.md`、`topics/delivery/ansible/02-playbooks-operations-and-delivery.md` | 已合并 |
| 构建、测试与质量 | `jiaofu/14-18`、`jiaofu/25-27`、`devops/12-15` | `topics/delivery/jenkins/delivery-practice.md`、`topics/delivery/gitops/02-supply-chain-security-and-operations.md` | 已合并 |
| 发布、灰度、回滚与观测 | `jiaofu/19-24`、`jiaofu/28-30`、`devops/17-18`、`devops/23-25` | `topics/delivery/jenkins/delivery-practice.md`、`topics/delivery/argo-cd/05-image-automation-and-progressive-delivery.md` | 已合并 |
| 平台产品与规模化治理 | `devops/21-24`、`devops/26-30` | `topics/architecture/05-evolution-and-operations-cases.md`、`topics/delivery/gitops/01-principles-workflow-and-adoption.md` | 已合并 |
| 工具链端到端实验 | `jiaofu/34-37`、`devops/27`、`devops/期末总结` | 现有 Jenkins、Ansible、GitOps 章节 | 已合并 |
| 移动 App 交付 | `jiaofu/31-33` | 只提炼通用流水线原则 | 已提炼通用部分 |
| 非核心课程材料 | 开篇、结束语、期中/期末测试、特别放送、获奖名单 | 不进入主笔记 | 暂缓 |

## 处理状态定义

- `待整理`：已确定归属，尚未写入 Markdown。
- `已合并`：内容已提炼并与现有章节合并，已完成重复检查。
- `暂缓`：本轮没有足够通用价值，保留原始材料和索引。
