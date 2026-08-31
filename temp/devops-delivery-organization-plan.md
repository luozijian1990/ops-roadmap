# DevOps 与持续交付材料整理计划

## 1. 目标

将 `temp/jiaofu/` 和 `temp/devops/` 中的课程 PDF 转化为现有 `topics/` 的高质量学习笔记扩展，同时保持现有主题边界、Markdown 结构和 Roadmap 生成流程不变。

本计划只处理现有 `topics/`，不新增 `topics/devops/` 或其他新的顶层主题。企业转型材料只提炼其中可复用的方法，不在本轮新增或修改 `cases/`。

## 2. 原则

1. Markdown 是最终内容源，PDF 只作为原始参考材料。
2. 不逐字复制课程原文，统一进行提炼、重组、核验和补充。
3. 一个知识点只保留一个主要归属，其他主题使用链接或交叉引用。
4. 本轮只将可复用的通用方法写入 `topics/`；特定公司、规模和组织背景只作为理解材料，不形成 `cases/` 交付物。
5. 优先补齐学习闭环：概念、决策、实现、验证、故障和复盘。
6. 每次完成 Markdown 后再生成对应 Roadmap，不手工编辑生成文件。

## 3. 材料归并地图

| 材料方向 | 首选位置 | 主要交付内容 |
| --- | --- | --- |
| DevOps 定义、价值、价值流、转型、组织文化 | `topics/delivery/gitops/01-principles-workflow-and-adoption.md` | 概念边界、价值流、组织职责、试点和推广 |
| 分支策略、依赖管理、配置管理 | `topics/delivery/gitops/01-principles-workflow-and-adoption.md`、`topics/delivery/jenkins/delivery-practice.md` | 仓库模型、配置生命周期、分支与流水线契约 |
| CI、自动化测试、静态检查、内建质量 | `topics/delivery/jenkins/delivery-practice.md` | CI 阶段、质量门禁、测试策略、失败处理 |
| 测试环境、环境自描述、环境即代码 | `topics/delivery/gitops/01-principles-workflow-and-adoption.md`、`topics/delivery/ansible/02-playbooks-operations-and-delivery.md` | 环境契约、预览环境、自动创建和回收 |
| 构建加速、弹性构建资源、镜像构建 | `topics/delivery/gitops/02-supply-chain-security-and-operations.md`、`topics/cloud-native/docker/05-application-containerization-and-multi-platform-builds.md` | 缓存、并发、Runner/Agent、镜像身份和合规 |
| 发布、灰度、监控、回滚、破坏性测试 | `topics/delivery/jenkins/delivery-practice.md`、`topics/delivery/argo-cd/05-image-automation-and-progressive-delivery.md` | 发布阶段、停止条件、业务指标、回滚和演练 |
| 交付平台、流水线能力模型、开源与自研 | `topics/architecture/05-evolution-and-operations-cases.md`、`topics/delivery/gitops/01-principles-workflow-and-adoption.md` | 平台边界、黄金路径、例外路径、治理和 SLO |
| DevOps 度量、数据平台、持续改进 | `topics/delivery/gitops/01-principles-workflow-and-adoption.md`、`topics/observability/` 相关主题 | DORA、流动效率、稳定性、质量、成本和改进闭环 |
| 大型企业 DevOps 转型故事 | `topics/architecture/05-evolution-and-operations-cases.md`、`topics/delivery/gitops/01-principles-workflow-and-adoption.md` | 只提炼组织、平台、治理和转型方法；具体企业案例暂不落盘 |
| 移动 App 专属交付流程 | 现有 `topics/delivery/jenkins/delivery-practice.md` | 只提炼可迁移的流水线原则，移动端专属细节暂不处理 |

## 4. 分阶段执行

### 阶段 0：建立来源清单

- [ ] 为两个目录建立材料索引，记录文件名、编号、主题、预计归属和处理状态。
- [ ] 标记开篇、总结、测试题、学习资料和获奖名单等非核心材料。
- [ ] 对同一主题的重复内容建立合并备注，不直接重复写入多个 topic。
- [ ] 记录课程来源和 PDF 文件名，便于后续核验；不把 PDF 原文当作公开笔记。

交付物：`temp/material-inventory.md`。

### 阶段 1：整理 DevOps 基础和交付模型

优先处理 `temp/devops/01` 至 `09`、`19`、`20` 以及 `temp/jiaofu/01` 至 `03`。

- [ ] 补充 DevOps、持续交付、CI、CD、GitOps、平台工程之间的边界。
- [ ] 加入价值流、瓶颈识别、组织协作和转型试点方法。
- [ ] 将 DORA 指标和持续改进连接到现有 GitOps 章节。

交付位置：优先扩展 `topics/delivery/gitops/01-principles-workflow-and-adoption.md`。

### 阶段 2：整理研发协作、环境和 CI 工程

优先处理 `temp/jiaofu/04` 至 `18`、`temp/devops/10` 至 `16`。

- [ ] 归纳分支策略、依赖、配置、环境管理和环境自描述。
- [ ] 补充构建缓存、弹性执行资源、镜像构建和合规检查。
- [ ] 把测试、静态检查和内建质量组织成可执行的质量门禁。

交付位置：`topics/delivery/jenkins/delivery-practice.md`、`topics/delivery/gitops/02-supply-chain-security-and-operations.md`，必要时补充 Docker 第五册和 Ansible 第二册。

### 阶段 3：整理发布、平台和度量

优先处理 `temp/jiaofu/19` 至 `30`、`temp/devops/17` 至 `28`。

- [ ] 归纳部署与发布的边界、不可变基础设施、灰度、回滚和发布质量。
- [ ] 提炼持续交付平台的能力模型和产品化方法。
- [ ] 补充平台数据、流水线可观测性、质量和业务指标。

交付位置：`topics/delivery/jenkins/delivery-practice.md`、`topics/delivery/argo-cd/05-image-automation-and-progressive-delivery.md`、`topics/architecture/05-evolution-and-operations-cases.md`。

### 阶段 4：整理规模化方法和特殊场景

- [ ] 从 `temp/devops/29`、`30` 以及平台建设相关材料中提取可迁移的组织、平台和治理方法。
- [ ] 具体公司名称、内部平台细节和未经核验的结果数据只作为整理备注，不写入通用结论。
- [ ] 移动 App 材料只保留能迁移到通用交付模型的部分。

交付位置：`topics/architecture/05-evolution-and-operations-cases.md`、`topics/delivery/gitops/01-principles-workflow-and-adoption.md`、`topics/delivery/jenkins/delivery-practice.md`。

### 阶段 5：生成与验收

- [ ] 每个变更后的 Markdown 都满足内容规范。
- [ ] 执行 `./scripts/build-roadmaps.sh`。
- [ ] 验证 Markdown、Roadmap、根目录 `index.html` 和 README 的同步关系。
- [ ] 检查 JSON payload、回链、相对路径和特殊动画文件未被覆盖。

## 5. 完成定义

本计划完成需要满足：

- 所有核心 PDF 已完成“纳入、合并或明确暂缓”的归类。
- 新增内容均落在现有 topic 目录内，没有新增 DevOps 顶层 topic。
- 本轮不新增、不修改 `cases/` 文件。
- 每个新增知识点至少包含一个解释、一个决策/操作依据和一个验证方式。
- 重复内容已合并，工具说明没有取代方法论和边界说明。
- 所有受影响的 Roadmap 均成功生成并通过仓库级校验。

## 6. 暂不处理

- 不把课程 PDF 原文件复制到公开 topics。
- 不为了覆盖所有课程章节而创建新的工具专题。
- 不在本轮整理企业案例文件；案例只作为通用方法提炼的背景材料。
- 不先处理学习资料推荐、获奖名单和纯宣传性开场内容。
- 不在没有来源核验时把企业案例中的数字、结论或厂商能力写成事实。
