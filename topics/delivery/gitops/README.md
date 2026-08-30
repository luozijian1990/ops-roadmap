# GitOps 学习指南

本主题从 GitOps 原则、控制循环和组织落地出发，继续覆盖不可变制品、供应链证明、镜像晋级、密钥治理与发布证据。适合希望把持续交付建设成可审计、可恢复平台能力的运维工程师、SRE 和平台工程师。

## 可以学到什么

- 区分命令式操作、声明式配置、CI、IaC 与 GitOps 控制循环的职责边界。
- 设计仓库、环境、预览、多集群、漂移修复、回滚和 Break Glass 工作流。
- 建立从源码、镜像、配置到运行实例的不可变身份与证据链。
- 把 SBOM、Provenance、签名、漏洞扫描和准入策略接入发布门禁。
- 运营 Registry、密钥系统、可观测信号和供应链故障演练。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 原则、工作流与组织落地 | 控制循环、职责边界、仓库建模、晋级、漂移与试点 | [Markdown](./01-principles-workflow-and-adoption.md) · [Roadmap](./01-principles-workflow-and-adoption-roadmap.html) |
| 2 | 供应链、安全与交付运维 | 不可变制品、构建系统、Registry、策略、密钥与发布证据 | [Markdown](./02-supply-chain-security-and-operations.md) · [Roadmap](./02-supply-chain-security-and-operations-roadmap.html) |

## 阅读建议

- 先用第一册建立 GitOps 的事实来源、调谐和组织边界，再进入第二册的供应链与运行门禁。
- 容器构建实验可衔接 [Docker 第五册](../../cloud-native/docker/05-application-containerization-and-multi-platform-builds.md)，运行就绪实验可衔接 [Kubernetes 第六册](../../cloud-native/kubernetes/06-application-runtime-readiness-lab.md)。
- Argo CD 的控制器配置、Image Updater 与渐进式发布细节见 [Argo CD 学习指南](../argo-cd/README.md)。
- Markdown 是内容源，Roadmap HTML 由仓库根目录的 `scripts/build-roadmaps.sh` 统一生成。
