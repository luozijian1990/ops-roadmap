# Argo CD 学习指南

本主题按建设和运营 GitOps 交付平台的工作链路组织 Argo CD 3.2 学习内容，适合 Kubernetes 运维工程师、SRE、平台工程师和负责交付平台的研发人员。

## 学习路线

| 顺序 | 内容 | 重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | GitOps 基础、架构与应用接入 | 安装、入口、仓库、集群、Application、Manifest | [Markdown](./01-foundations-architecture-and-applications.md) · [Roadmap](./01-foundations-architecture-and-applications-roadmap.html) |
| 2 | 同步、交付策略与资源治理 | Diff、Health、自动同步、Wave、Hook、通知 | [Markdown](./02-sync-delivery-and-resource-governance.md) · [Roadmap](./02-sync-delivery-and-resource-governance-roadmap.html) |
| 3 | ApplicationSet、多集群与渐进式交付 | Generator、矩阵、租户隔离、RollingSync | [Markdown](./03-applicationset-multicluster-and-progressive-delivery.md) · [Roadmap](./03-applicationset-multicluster-and-progressive-delivery-roadmap.html) |
| 4 | 安全、高可用与生产运营 | OIDC/RBAC、容量、指标、备份、升级、排障 | [Markdown](./04-security-reliability-and-operations.md) · [Roadmap](./04-security-reliability-and-operations-roadmap.html) |

## 阅读建议

- 先完成第一册的安装、仓库、集群和 Application 接入实验，再学习自动同步和批量生成。
- 生产环境优先使用声明式配置、固定 revision、最小权限和可演练的回滚流程。
- Markdown 是内容源，Roadmap HTML 由仓库根目录的 `scripts/build-roadmaps.sh` 统一生成。
