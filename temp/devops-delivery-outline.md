# DevOps 与持续交付扩展大纲

本大纲不是新主题的目录，而是对现有 Markdown 文件的增量写作任务。每个 H3 都必须成为可以独立学习的教学单元，并在写作时回填到指定目标文件。

## 第一章 · DevOps 与持续交付的共同模型

### DevOps、持续交付、CI、CD 与 GitOps 如何分工
目标：`topics/delivery/gitops/01-principles-workflow-and-adoption.md`

### 价值流如何暴露交付瓶颈和返工
目标：`topics/delivery/gitops/01-principles-workflow-and-adoption.md`

### 组织、文化和平台团队如何共同承担交付责任
目标：`topics/delivery/gitops/01-principles-workflow-and-adoption.md`

## 第二章 · 研发协作、环境与构建工程

### 分支策略如何影响集成频率和发布风险
目标：`topics/delivery/gitops/01-principles-workflow-and-adoption.md`

### 依赖、配置和环境如何形成可复现交付输入
目标：`topics/delivery/gitops/01-principles-workflow-and-adoption.md`

### 测试环境如何自动创建、隔离、观察和回收
目标：`topics/delivery/ansible/02-playbooks-operations-and-delivery.md`

## 第三章 · CI、测试、质量与供应链

### 持续集成的最小闭环和触发契约是什么
目标：`topics/delivery/jenkins/delivery-practice.md`

### 构建速度、弹性资源和构建检测如何协同
目标：`topics/delivery/jenkins/delivery-practice.md`

### 自动化测试、静态检查和内建质量如何成为发布门禁
目标：`topics/delivery/jenkins/delivery-practice.md`

### 镜像构建、合规检查和不可变制品如何建立信任链
目标：`topics/delivery/gitops/02-supply-chain-security-and-operations.md`

## 第四章 · 发布控制、观测与持续改进

### 部署、发布、灰度和回滚分别承担什么责任
目标：`topics/delivery/jenkins/delivery-practice.md`

### 发布系统如何设计用户体验、控制面和失败恢复
目标：`topics/delivery/jenkins/delivery-practice.md`

### 监控、业务指标和破坏性验证如何决定是否继续放量
目标：`topics/delivery/argo-cd/05-image-automation-and-progressive-delivery.md`

### DORA 指标和 PDCA 如何形成持续改进闭环
目标：`topics/delivery/gitops/01-principles-workflow-and-adoption.md`

## 第五章 · 交付平台和规模化演进

### 持续交付平台应提供哪些能力和边界
目标：`topics/architecture/05-evolution-and-operations-cases.md`

### 开源、采购和自研如何按约束做决策
目标：`topics/architecture/05-evolution-and-operations-cases.md`

### 平台产品如何从试点走向规模化自助服务
目标：`topics/architecture/05-evolution-and-operations-cases.md`

### 大型组织转型经验如何抽象为可迁移的治理方法
目标：`topics/delivery/gitops/01-principles-workflow-and-adoption.md`

## 写作检查点

- [ ] 每个 H3 均包含定义/问题、机制、落地、判断、风险、练习中的至少四类内容。
- [ ] 每个 H3 下至少有两个有实质内容的 H4，或有等价的表格、流程图和代码示例组合。
- [ ] 目标文件中没有重复搬运现有章节。
- [ ] 企业故事只提炼方法，不写未经核验的具体数字为通用结论。
