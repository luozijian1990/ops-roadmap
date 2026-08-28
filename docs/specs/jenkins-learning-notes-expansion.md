# Jenkins 学习笔记补充规范

## 1. 文档状态

- 状态：主体规划已完成，可以进入正式大纲阶段
- 目标读者：运维、SRE、平台工程和持续交付平台维护人员
- 输入材料：`temp/jenkins/1.txt` 至 `temp/jenkins/6.txt`
- 现有正式笔记：`topics/delivery/jenkins/guide.md`
- 本规范不直接产出正文；后续实施必须先重新读取本文件和输入材料

## 2. 背景与问题

现有 `guide.md` 以 Jenkins 安装、Pipeline 语法和常用插件为主，适合作为基础册，但对真实持续交付平台中的事件触发、权限治理、共享库工程、质量门禁、制品晋级、发布回滚和运行治理覆盖不足。

新增课程材料补足了这些实践链路，但存在以下问题，不能直接拼接进正式笔记：

1. 材料基于较旧的软件版本和管理界面，出现 Jenkins 2.277.1、JDK 8、GitLab 13.10、Nexus 3.30 等历史环境。
2. 文本包含 OCR 噪声，部分代码、字段和流程不完整，不能把缺失内容当作可靠示例。
3. 存在明文密码、管理员账号拉取代码、关闭防火墙、可变分支加载共享库等不安全示例。
4. Docker、Kubernetes、Helm、Ansible 等基础知识与仓库现有专题重复。
5. 材料把 Jenkins 直接执行 `kubectl` 或 `helm` 称为 GitOps，需要纠正为推送式 CD，并解释其与拉取式持续协调的区别。

## 3. 目标

本次补充完成后，Jenkins 主题应形成两册互补笔记：

1. `guide.md`：Jenkins 平台、Pipeline 语法和基础治理。
2. `delivery-practice.md`：从代码事件到质量、制品、部署、回滚的持续交付实践。

最终内容必须帮助读者回答以下问题：

- Jenkins Controller、Agent、任务、凭据和共享库分别承担什么职责？
- 一次 GitLab 代码事件如何安全、可追踪地触发流水线？
- 如何用共享库统一不同语言项目的 CI 流程，同时保留必要的项目差异？
- 质量门禁和不可变制品如何成为 CI 与 CD 的边界？
- Jenkins 如何执行可审批、可验证、可回滚的发布？
- Jenkins 推送式部署与真正 GitOps 的边界在哪里？
- 运维人员如何排查触发、构建、Agent、制品和部署问题？

## 4. 非目标

- 不编写完整的 Git、HTTP、Docker、Kubernetes、Helm、Ansible 或 SaltStack 入门教程。
- 不把 SonarQube、Nexus、Harbor 写成独立产品安装手册，只讲 Jenkins 集成所需的职责、接口和运行边界。
- 不复制 OCR 乱码或旧版 UI 操作说明到正式笔记。
- 不承诺进行真实 Jenkins、GitLab、SonarQube、Nexus、Harbor 或 Kubernetes 环境验证。
- 不重命名现有 `guide.md`，避免破坏公开路径和已有学习进度键。
- 不覆盖 `topics/cloud-native/kubernetes/full-animated-roadmap.html` 及其动画 sidecar。

## 5. 交付物

### 5.1 正式内容

- 增强 `topics/delivery/jenkins/guide.md`
- 新增 `topics/delivery/jenkins/delivery-practice.md`
- 生成 `topics/delivery/jenkins/guide-roadmap.html`
- 生成 `topics/delivery/jenkins/delivery-practice-roadmap.html`
- 在根目录 `index.html` 的 Jenkins 项下登记两册路线图
- 检查 `README.md` 的 Jenkins 目录入口；仅在现有入口不能表达两册结构时修改

### 5.2 规划与追踪

- 在正式写作前新增 `topics/delivery/jenkins/outline.md`
- `outline.md` 为唯一允许保留 `<!-- src: ... -->` 映射的文件
- 正式笔记不得保留 `<!-- src: ... -->`
- 每个 H3 都必须映射到明确文本材料或需要查询的官方资料

### 5.3 规模约束

- `guide.md` 目标为 2800 至 3400 行
- `delivery-practice.md` 目标为 2000 至 3000 行
- 单个正式 Markdown 必须少于 5000 行
- 若实践册逼近 5000 行，应优先压缩重复基础知识，不得压缩完整交付链路、排障过程和安全边界

## 6. 来源材料路由

| 来源 | 主要吸收内容 | 主要舍弃或重写内容 | 目标文档 |
| --- | --- | --- | --- |
| `1.txt` | 数据目录、任务类型、参数化构建、三级权限、凭据类型 | 旧版安装、JDK 8、中文更新源、关闭防火墙、Blue Ocean 主线 | `guide.md` |
| `2.txt` | Pipeline 开发工具、变量、DSL、Groovy、共享库 | 与现有 Declarative 语法重复的示例 | `guide.md` |
| `3.txt` | Generic Webhook、GitLab 事件、多触发方式、排障、多语言构建 | HTTP/Git 基础、管理员凭据、旧版邮件 UI | 两册，实践册为主 |
| `4.txt` | SonarQube 质量门禁、覆盖率、分支分析、Nexus/Harbor 集成 | 三个产品的旧版安装和 UI 手册 | `delivery-practice.md` |
| `5.txt` | 项目标准化、CI/CD 分层、制品发布、发布策略和回滚 | SaltStack 基础、明文认证、裸进程发布脚本 | `delivery-practice.md` |
| `6.txt` | 镜像构建、环境声明、Kubectl/Helm 发布和回滚 | Docker/Kubernetes/Helm 基础重复内容、错误 GitOps 命名 | `delivery-practice.md` |

## 7. `guide.md` 增强范围

保留现有三章主结构和既有教学覆盖，只做有界增补与必要纠错。

### 7.1 第一章：Jenkins 安装与配置

在现有内容中补充或增强：

- Controller、静态 Agent、动态 Agent 的职责和故障域
- Controller 不承载常规构建任务的原因
- `JENKINS_HOME` 中任务、节点、插件、用户、凭据和密钥的逻辑边界
- Pipeline、多分支 Pipeline、文件夹、参数化任务的选择表
- 全局、项目、节点三级角色与最小权限设计
- 凭据类型、作用域、ID 命名、轮换和使用追踪
- 备份内容、恢复演练、插件兼容与回退边界

不得重新引入：

- `master/slave` 作为主术语
- 明文 CLI 密码或管理员账号作为流水线凭据
- 关闭防火墙、暴露 Docker API、未经约束的 Docker Socket
- 未固定版本的生产镜像或插件安装建议

### 7.2 第二章：Jenkins Pipeline 详解

在现有语法章节中补充：

- Pipeline 开发工具、Snippet Generator 和 Declarative Directive Generator 的适用范围
- 环境变量、参数、普通 Groovy 变量的作用域差异
- CPS、序列化、重启恢复和 `@NonCPS` 的边界
- DSL 步骤与普通 Groovy 方法的差异
- 共享库的 `vars/`、`src/`、`resources/` 职责
- 共享库版本固定、变更兼容、测试和灰度升级
- 受信任共享库、脚本审批和供应链风险

### 7.3 第三章：常用插件详解

保留插件示例，但把章节结论从“推荐安装清单”调整为“按能力选择并控制插件面”：

- 插件最小化、依赖链、升级顺序和回滚
- 插件状态必须在写作时通过 Jenkins 官方插件站核实
- 不把 Blue Ocean 或 ThinBackup 自动视为当前推荐方案
- HTTP、Webhook、凭据和 Kubernetes 插件示例必须包含失败处理与安全边界

## 8. `delivery-practice.md` 目标大纲

正式文件第一行必须为：

```markdown
# Jenkins 持续交付实践
```

每个 H2 后必须立刻出现 H3；章节引言写在首个 H3 的开头。

### 第一章：从代码事件到流水线触发

#### Webhook 触发链由哪些组件组成

- GitLab、网络入口、Jenkins 触发器、任务匹配和队列
- Push、Tag、Merge Request 的语义区别
- Generic Webhook 与专用 SCM 集成的取舍

#### 如何安全地解析和过滤事件

- Header、Query、JSON Body 的数据来源
- Token 或签名验证、HTTPS、来源限制和重放风险
- 分支创建、删除、普通提交的过滤逻辑
- 不在日志中打印完整 Payload、Token 或敏感用户信息

#### 如何统一自动触发与手动触发

- 规范化仓库、分支、提交、操作者和触发原因
- 参数默认值与事件字段的优先级
- 无事件上下文时的失败方式

#### Webhook 不触发时如何排查

- 发送端投递记录、HTTP 状态、Jenkins 系统日志、任务日志和队列
- 401、403、404、网络阻断、过滤不匹配、任务禁用、Agent 不足的分层判断
- 安全地重放请求

### 第二章：建立可复用的流水线工程

#### 项目标准化先统一哪些契约

- 仓库布局、构建入口、输出目录、测试报告和制品元数据
- 应用名、业务名、环境名和版本号
- Jenkins Job 命名不应成为唯一业务数据源

#### Jenkinsfile 和共享库如何分工

- Jenkinsfile 描述项目选择和阶段编排
- 共享库封装稳定能力，而不是隐藏全部业务逻辑
- 避免巨型万能函数和基于字符串的隐式分支

#### 如何设计和测试共享库

- `vars/`、`src/`、`resources/`
- 明确输入、返回值、异常和日志契约
- 版本标签或不可变提交固定
- 单元测试、契约测试、试点任务和回退

### 第三章：设计标准化 CI 流水线

#### 一条 CI 流水线应有哪些阶段

- Checkout、Validate、Build、Unit Test、Quality、Package、Publish
- 阶段输入输出和失败条件
- Mermaid 数据流图

#### 如何适配 Maven、Gradle、Go 和 npm

- 统一接口，不重复讲工具入门
- 使用 Wrapper、锁文件和固定构建镜像
- 缓存与可重复构建边界
- 测试报告和构建产物归一化

#### 如何控制超时、重试、并发和清理

- 只重试瞬时错误
- `timeout`、`retry`、`disableConcurrentBuilds`、`buildDiscarder`
- Workspace、临时凭据和容器清理

#### 如何建立构建可追溯性

- Commit SHA、流水线版本、构建环境、制品摘要和质量结果
- `currentBuild` 描述、通知和外部链接
- 不把邮件通知当作唯一审计记录

### 第四章：把质量门禁纳入流水线

#### SonarQube 在流水线中承担什么职责

- Scanner、Server、Compute Engine、数据库和 Quality Gate 的关系
- Jenkins 只负责触发、等待和执行策略

#### 如何让 Quality Gate 真正阻断交付

- 扫描完成与服务端分析完成的异步关系
- 等待门禁、超时、不可用和失败处理
- 跳过扫描必须是显式、审计和受权限控制的例外

#### 如何处理覆盖率、分支和提交关联

- 测试先于分析产出覆盖率
- 主分支、短期分支和合并请求的差异
- Commit SHA 与质量结果追溯

### 第五章：制品是 CI 与 CD 的边界

#### 为什么 CI 与 CD 之间必须交付不可变制品

- Build once deploy many
- 不在不同环境重复构建
- 制品版本、摘要、来源和质量元数据

#### Nexus 和 Harbor 分别管理什么

- 二进制包、前端压缩包、Chart 和容器镜像的选择
- Jenkins 凭据、Robot Account 或最小权限服务账号
- Registry 与制品库不可用时的失败策略

#### 如何执行制品发布和晋级

- 上传、校验、查询和下载
- 禁止覆盖正式版本
- 从候选制品晋级，而不是重新编译
- 保留策略、清理和回滚所需版本

### 第六章：设计可回滚的 CD 流水线

#### CD 流水线需要哪些控制面

- 环境、版本、审批、变更窗口和并发锁
- 发布前置检查、部署动作、验证和结果记录
- CI 与 CD 使用不同权限

#### 如何选择滚动、蓝绿和灰度发布

- 使用条件、容量要求、流量切换、观测窗口和回滚方式对比表
- 不把“部署命令成功”当作“发布成功”

#### 失败时如何停止和回滚

- 技术失败、健康检查失败和业务指标失败
- 自动回滚与人工接管边界
- 回滚到已验证旧制品，不重新构建旧代码

### 第七章：Jenkins 与 Kubernetes 交付

#### Jenkins 直接执行 Kubectl 属于什么模型

- 推送式部署的数据流和信任边界
- Kubeconfig、ServiceAccount、Namespace 和 RBAC 最小权限
- 避免在通用 Agent 上保存长期集群管理员凭据

#### Helm 如何提供 Release 历史和回滚

- Chart、Values、Release、Revision
- 安装、升级、等待、原子失败和回滚的逻辑
- 链接仓库现有 Helm 专题，不重复命令手册

#### 推送式 CD 与 GitOps 有何区别

- Jenkins 推送集群与控制器拉取声明的流程图
- Git 仓库作为期望状态、持续协调、漂移检测和回滚方式
- Jenkins 可负责构建和更新声明，但不冒充集群内协调器

### 第八章：生产运行与治理

#### 如何观察 Jenkins 的运行状态

- 队列等待、执行器占用、Agent 在线率、阶段耗时、失败率和磁盘增长
- Controller 日志、任务日志、Agent 日志和外部系统日志的关联

#### 常见故障如何分层定位

- 事件未到达、任务未入队、Agent 无法分配、构建失败、质量失败、制品失败、部署失败
- 每一层的证据、负责人和停止条件

#### 如何治理插件、凭据和脚本

- 插件清单、升级窗口、兼容性和回退
- 凭据轮换、作用域、使用记录和泄露处置
- 脚本审批、共享库评审和供应链控制

#### 如何做备份、恢复和升级回退

- 配置、密钥、任务和插件状态
- 恢复演练而非只验证备份文件存在
- Controller 升级前检查、试验和回退条件

## 9. 现代化与安全校验

写作前必须查询当前官方资料，至少核实：

- Jenkins 当前支持的 Java 版本和 LTS 升级路径
- Jenkins Controller、Agent 的当前术语
- Pipeline、Shared Library、Credentials、Kubernetes 插件的当前用法
- Blue Ocean、ThinBackup 及其他准备推荐插件的当前维护状态
- GitLab Webhook 的认证和事件字段
- SonarQube Quality Gate 的异步等待方式
- Nexus、Harbor 认证及制品不可变能力
- Kubernetes、Kubectl 和 Helm 当前发布回滚语义

技术检索只使用官方文档、官方插件站和项目官方仓库。正文不写未经验证的当前版本号；如版本号不是教学所必需，优先讲兼容性检查方法。

所有示例必须满足：

- 使用 `main`、`controller`、`agent` 等中性且当前的术语
- 凭据通过 Jenkins Credentials 或短期身份注入
- 不出现真实账号、密码、Token、邮箱、内网地址或仓库地址
- Shell 中的凭据变量避免 Groovy 插值
- 生产镜像、共享库和制品使用不可变版本或摘要
- 对 Docker Socket、特权容器、Kubeconfig 和管理员权限给出显著风险说明
- 外部请求设置超时、允许状态码、失败处理和必要的重试边界

## 10. 内容写作契约

- 每个正式笔记第一行必须且只能有一个 H1。
- H2 表示章，H3 表示路线图学习单元，H4 表示单元内部知识点。
- H2 与第一个 H3 之间不得放正文。
- 每个 H3 必须成为完整知识单元，至少包含定义、用途、执行或判断方法、风险或排障中的适用部分。
- 流程、架构、状态变化优先使用 Mermaid；Mermaid 节点文本避免中英文括号和中文标点。
- 命令、Jenkinsfile、YAML 和 API 示例必须可复制并标注语言。
- 保留现有 `guide.md` 的主要教学覆盖，不以压缩摘要替代完整教程。
- 避免营销式结语、表情符号堆叠和“掌握后即可完成任何复杂任务”等绝对化表达。

## 11. 实施顺序

1. 检查 Git 状态，保护 `temp/` 和其他用户改动。
2. 重新完整读取 6 份文本，生成 `topics/delivery/jenkins/outline.md`。
3. 在 `outline.md` 中为每个 H3 记录文本和官方资料映射。
4. 先实施 `guide.md` 的有界增强并静态复核。
5. 按一个 H2 一个任务的粒度编写 `delivery-practice.md`。
6. 删除正式笔记中的全部 `<!-- src: ... -->`，保留 `outline.md` 映射。
7. 运行 `./scripts/build-roadmaps.sh` 生成路线图。
8. 更新 `index.html`；按需要更新 `README.md`。
9. 执行结构、链接、JSON、内容和差异验收。

## 12. 验收标准

### 12.1 文件和结构

- 两份正式 Markdown 均只有一个 H1。
- 每个 H2 后的第一段内容属于首个 H3。
- `guide.md` 与 `delivery-practice.md` 各有一个同名 `*-roadmap.html`。
- 两个路线图均包含 `../../../index.html` 返回链接。
- `index.html` 同时链接 Jenkins 基础册和实践册。
- 两个路线图的 `<script id="data" type="application/json">` 均为有效 JSON。
- 正式笔记中的 `<!-- src: ... -->` 数量为 0。

### 12.2 内容覆盖

- Webhook、安全过滤、手动/自动触发和排障形成完整链路。
- 共享库包含职责、目录、版本、测试、升级和信任边界。
- CI 包含多语言构建、测试、质量、制品和追溯。
- CD 包含审批、验证、发布策略、失败判定和回滚。
- 明确区分推送式 CD 与 GitOps。
- 包含队列、Agent、插件、凭据、日志、备份恢复等运维治理内容。
- Docker、Kubernetes、Helm 和 Ansible 基础内容通过现有专题承接，不重复扩写。

### 12.3 安全与现代化

- 不出现 `admin123`、真实 Token、真实邮箱或真实内网地址。
- 不建议关闭防火墙或使用管理员账号执行普通流水线。
- 不把 `latest`、可变共享库分支或重复构建作为生产主线。
- 不把旧 UI 菜单路径写成稳定接口。
- 所有当前性结论都有官方资料支撑。

### 12.4 静态验证

至少执行：

```bash
git diff --check
./scripts/build-roadmaps.sh
```

另外检查：

- Markdown H1/H2/H3 层级
- 代码围栏是否成对
- Mermaid 代码块是否存在明显语法风险
- 相对链接目标是否存在
- 正式笔记和路线图数量是否一一对应
- 根目录索引是否覆盖新增路线图
- 变更前后行数、代码块、表格、Mermaid 和主要教学链路是否异常缩减

### 12.5 验证边界

若未连接真实环境，最终报告必须明确写为静态内容验证和路线图构建验证，不得声称完成 Jenkins、GitLab、Webhook、SonarQube、Nexus、Harbor、Kubernetes 或 Helm 运行时验证。
