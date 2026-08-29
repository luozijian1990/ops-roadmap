# Argo CD 安全、高可用与生产运营学习笔记

## 第 1 章 · 建立身份认证、授权与最小权限模型

### Authentication、Authorization、Dex 与 OIDC 的边界是什么

Authentication 证明用户是谁，Authorization 决定能做什么；Dex/OIDC 负责把外部身份映射为 Argo CD 用户和组，RBAC 决定资源动作。认证成功不等于拥有 Application 同步权限，组映射和默认策略必须分开审查。

一次登录至少经过三层：身份提供商签发 JWT，API Server 校验 issuer、audience 和有效期，RBAC 根据 subject 与 groups 匹配策略。排障时分别验证这三层，避免把“能登录”误判成“能同步”。

### 本地账号、管理员账号、Token 与登录限流如何治理

本地账号只保留应急管理员，日常使用 OIDC。Token 设置过期、用途和轮换周期，禁用不再使用的账号；登录失败限流和审计日志应纳入安全监控。

### RBAC 模型、默认策略和资源级动作怎样表达

RBAC 以 subject、resource、action、object 表达权限，例如只允许某项目的 `get` 和 `sync`。默认策略从 deny 开始，资源动作如 delete、action、exec 单独审批。

对象匹配通常包含 project/name，`*` 会扩大到所有项目；新增资源类型或自定义 action 时要重新审查权限矩阵，并用普通用户 Token 实测允许和拒绝路径。

```yaml
data:
  policy.csv: |
    p, role:payments, applications, get, payments/*, allow
    p, role:payments, applications, sync, payments/*, allow
    g, team-payments, role:payments
  policy.default: role:readonly
```

### 用 Keycloak、Okta、Auth0、OneLogin 或 Zitadel 接入通用 OIDC

配置 issuer、client ID、client secret、回调地址和 claim 映射。生产使用 HTTPS、明确 audience 和 group claim；先用测试组验证登录、退出、Token 过期和权限回收。

### 接入 Google、Microsoft Entra ID 与 AWS Identity Center

云身份提供商通常需要额外配置 tenant、组织域、scope 和组同步。限制允许域或租户，避免个人账号进入平台；验证组改动是否在 Token 刷新后生效。

### OpenUnison 等身份代理适合怎样的企业集成场景

身份代理适合已有统一门户、MFA 或复杂目录映射的企业。代理成为新的信任边界，需保护回调、会话、证书和上游可用性，并保留直连应急路径。

## 第 2 章 · 防护凭据、供应链与运行时入口

### Argo CD 安全模型中的管理员、用户和非管理员风险

管理员可改变仓库、项目和 RBAC，是最高风险身份；普通用户若能修改 Application source 或 project，也可能间接执行任意集群资源。按职责拆分仓库、项目和同步权限。

### TLS、仓库凭据、Secret 与 Webhook Secret 如何分层保护

入口 TLS、仓库凭据、OIDC Secret、Webhook Secret 分离存储和轮换。使用外部 Secret 管理、KMS 或密封 Secret，限制读取 ServiceAccount；禁止在日志、参数和通知中泄露值。

### 验证 Argo CD 发布制品和依赖漏洞报告

部署镜像固定 digest，核对官方签名、SBOM 和 release checksum。Snyk 或其他扫描结果要区分可达运行时依赖与开发依赖，设置修复 SLA 并记录例外。

### Web Terminal 和资源动作为什么需要额外授权

Web Terminal 等能力接近集群 shell，Resource Action 可能执行删除、重启或自定义脚本。默认关闭或只授予专用角色，启用审计、超时和命令白名单。

终端输出可能包含环境变量和 Secret，日志采集要脱敏；动作还要记录操作者、参数、开始时间和结果。

## 第 3 章 · 规划高可用、容量与性能

### 哪些组件有状态，哪些组件可以水平扩展

API Server、Repo Server 和 Controller 可水平扩展；Argo CD 的持久状态保存在 Kubernetes 对象和 etcd 中，Redis 主要是可丢弃缓存，丢失后可重建。扩展前确认瓶颈是 CPU、内存、Git IO、Kubernetes QPS 还是 Redis。

### 扩展 Repo Server、Application Controller、API Server 和 Redis

Repo Server 承担渲染，可按仓库和并发扩容；Controller 通过 shard 分担 Application；API Server 主要承载用户和自动化请求。副本数增加后检查 leader election、连接池、PDB 和反亲和。

### Monorepo、Manifest 生成并发与缓存如何影响性能

大 Monorepo 会放大 clone、遍历和 diff 成本；生成并发过高会耗尽 CPU、内存和 API QPS。设置缓存、并发上限、超时和仓库拆分策略，用实际 p95 评估。

### Controller Shard 与动态集群分布如何平衡负载

Shard 将 Application 分配给不同 Controller，动态集群分布可按集群负载重新平衡。迁移期间关注重复调谐、队列积压和短暂 API 压力。

### 对账频率、超时、抖动和限流参数如何设置

缩短 reconciliation timeout 可降低漂移延迟但增加 Git 和 API 压力；抖动避免所有实例同时请求。按应用数量、变更频率和错误预算设置，并用压测验证。

## 第 4 章 · 建立指标、仪表盘与 SLO

### 四类核心组件分别暴露哪些 Prometheus 指标

关注 API 请求延迟和错误、Repo Server manifest 生成耗时、Controller reconciliation 队列与操作结果、Redis 连接和缓存命中。指标名称随版本变化，仪表盘应绑定版本并做录制规则。

仪表盘应同时展示平台能否工作和应用是否健康：前者看 API、Git、队列和缓存，后者看 Synced、Health、Sync duration。把两类曲线分开，才能判断是控制面故障还是业务发布失败。

### 选择低基数 Application、Project、Cluster 标签

标签用于聚合，不要把 commit、pod UID 或任意用户输入作为高基数 label。Application、project、cluster 维度足以支持大多数 SLO 和排障。

### 监控 Reconcile、Sync、Manifest 生成和 Git 请求

分别记录成功率、p50/p95/p99、队列等待、Git fetch 错误、渲染失败和同步持续时间。把控制面健康与业务资源健康分开，避免单一绿灯掩盖渲染故障。

### 从指标设计可用性、交付时效和错误预算告警

SLO 可定义 API 可用性、变更从提交到 Synced 的 p95 时延和同步失败率。告警包含影响范围、revision、owner 和 runbook；错误预算耗尽时冻结非必要发布。

### 指标缓存过期和历史序列如何控制 Prometheus 成本

缩短不必要的缓存 TTL、限制标签维度、使用 recording rule 和合理 retention。大型环境可按团队或集群分片抓取，并定期删除无消费指标。

## 第 5 章 · 备份、恢复与变更管理

### argocd admin export 能备份什么，不能备份什么

`argocd admin export` 可导出 Argo CD 配置对象、Application、Project 和 Secret 的声明，但不包含目标集群业务数据、外部 Git、OIDC 提供商和云资源。备份文件必须加密并限制访问。导出前检查是否包含仓库 Token、OIDC client secret 和集群 bearer token；恢复完成后轮换其中的长期凭据。

```bash
argocd admin export -n argocd > argocd-backup.yaml
kubectl apply -n argocd -f argocd-backup.yaml
```

### 恢复前如何校验版本、命名空间、Secret 和外部依赖

恢复前固定 Argo CD 版本，确认 CRD 已安装、命名空间存在、Secret 解密能力可用、仓库和 OIDC 可访问。先在隔离集群恢复，再验证登录、仓库拉取、目标连接和 Application 健康。

### 为配置变更建立验证、审计、回滚和演练流程

配置进入 Git 后通过 schema、kubeconform、策略检查和预览 diff；生产变更记录审批、操作者和结果。回滚使用 Git revert 或已验证备份，定期演练恢复时间和数据完整性。

## 第 6 章 · 安全完成版本升级与兼容性迁移

### 从升级总览建立版本跨度、备份与回滚门禁

升级前阅读目标版本 breaking changes，确认 CRD、Kubernetes、插件和数据库兼容，完成备份和回滚演练。按 canary、非生产、生产顺序推进，保留旧镜像和清单。

### 从 v1.x 到 v2.3 识别早期架构与组件合并变化

早期版本经历 API、Controller、Dex 和仓库组件合并，旧配置字段可能被弃用。迁移时以目标版本 schema 和 release note 为准，不直接复制旧 Deployment 参数。

### 从 v2.3 到 v2.10 处理 RBAC、CMP、Dex 与工具链变更

这一阶段重点检查 RBAC 默认策略、CMP sidecar、Dex 配置和 Helm/Kustomize 版本。升级后重新验证登录、渲染、插件和同步权限。

### 从 v2.10 到 v2.14 核对缓存、身份和健康检查变化

核对 Redis 缓存行为、OIDC claim、资源 health 脚本和指标标签；关注同一 Application 在升级前后的 diff 是否改变。

### 从 v2.14 升级到 v3.2 时处理破坏性变化

v3.x 升级必须逐项阅读迁移说明，重点检查资源跟踪、ApplicationSet、Server-Side Diff、命令参数和默认安全策略。先导出应用清单，再在预生产对比 manifest 与 health。

## 第 7 章 · 用分层证据排查生产故障

### 先区分入口、认证、仓库、渲染、对账与集群连接故障

按链路从外到内排查：DNS/Ingress→TLS/OIDC→API Server→Repo Server→Controller→目标 Kubernetes API。每层只验证一个假设，记录时间、Application、revision 和 request ID。

### 校验配置、Diff、Health 和 Resource Action 脚本

使用 `argocd app get`、`app diff`、`app manifests` 和资源详情确认期望状态；检查 ignoreDifferences、health Lua 和 action 脚本是否误判。不要先删除资源来“清理”未知问题。

### 导出集群凭据并验证目标 Kubernetes API 连通性

检查 `argocd cluster list`、Secret server 地址、CA 和 ServiceAccount 权限；从 Controller Pod 使用最小命令验证 DNS、TLS 和 API 认证。凭据导出后立即清理临时文件。

### 排查 CMP 的发现、超时、缓存和 tar stream 问题

确认插件 discover 匹配路径、sidecar 日志、超时、工作目录和 tar 排除规则。插件输出为空或非法 YAML 时，先在相同镜像中复现 `generate` 命令。

### 结合组件日志、指标和通知形成统一证据包

收集组件日志、Prometheus 时间窗、Application YAML、diff、事件和通知投递记录。证据包应脱敏，可让另一名值班人员复盘而无需再次猜测现场。

## 第 8 章 · 理解内部实现、调试和发布边界

### 从组件依赖和职责定位源码或运行时故障

源码定位从 API 类型、Controller reconcile、Repo Server manifest service 和 Redis client 开始。先用组件边界缩小范围，再进入具体函数；不要把业务资源故障归因给 UI。

### 在本地或远程环境复现和调试 Argo CD 组件

本地开发需要 Go、Node、Kubectl、Helm、Docker 和 Make；Tilt 可启动组件和依赖。远程调试应通过受控端口转发和临时凭据，结束后撤销访问。

```bash
make start-local
kubectl -n argocd port-forward svc/argocd-server 8080:443
```

### 用单元测试、E2E、静态分析和 CI 验证改动

单元测试覆盖 parser、reconcile 和权限逻辑，E2E 覆盖真实 Kubernetes、仓库和同步路径；静态分析检查 Go、JS、YAML 和安全规则。CI 必须阻断格式、生成代码、镜像和文档校验失败。

### 管理 GitOps Engine、Notifications Engine 和 UI 依赖

依赖升级要记录版本、API 兼容和安全公告，锁定 Go module 与前端 lockfile。公共引擎变更应先在独立测试中验证 diff、通知和 UI 行为。

### 理解贡献、设计评审和 PR 检查如何保护平台质量

贡献流程要求 issue、设计讨论、测试和文档同步；评审重点关注权限扩大、删除行为、性能和升级兼容。PR 检查不是形式审阅，而是把运行风险提前暴露。

### 理解发布节奏、安全补丁策略和失败恢复

发布包含稳定版本、补丁版本和安全修复，维护者应明确支持窗口。生产升级失败时保留旧版本、回滚清单和事件记录，并在恢复后补充根因和预防动作。升级验收顺序建议是组件 Ready、API 登录、仓库渲染、目标连接、只读 diff、非关键 Application 同步、关键 Application 健康，任何一步失败都暂停扩大范围。

#### 生产演练的最小闭环

每季度选择一个非关键 Application 做故障演练：先暂停自动同步，导出配置和凭据引用，制造仓库不可达或目标 API 拒绝，再按入口、认证、仓库、渲染、对账、集群连接的顺序收集证据。恢复后验证登录、仓库渲染、只读 diff、同步和通知，并记录 RTO、RPO、误报和缺失的指标。

升级演练还应保留旧镜像和旧 CRD 清单，明确回滚门槛。若回滚只恢复控制面而没有恢复 OIDC、仓库 CA 或目标集群 RBAC，Application 仍可能全部变成 `Unknown`，这不算恢复成功。

#### 生产运行卡片：安全、可靠性与恢复的可执行细节

##### 1. OIDC issuer 与 JWKS
本卡片把“OIDC issuer 与 JWKS”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 OIDC issuer 与 JWKS 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。
##### 71. OIDC claim 映射
将 OIDC claim 映射 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 72. RBAC 通配符审计
将 RBAC 通配符审计 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 73. 管理员应急账号
将 管理员应急账号 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 74. Secret 外部同步
将 Secret 外部同步 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 75. Git 提交签名
将 Git 提交签名 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 76. Webhook 重放防护
将 Webhook 重放防护 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 77. Ingress 超时
将 Ingress 超时 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 78. Repo Server 缓存
将 Repo Server 缓存 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 79. Controller 工作队列
将 Controller 工作队列 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 80. 动态分片迁移
将 动态分片迁移 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 81. 大仓库拆分
将 大仓库拆分 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 82. 资源健康脚本
将 资源健康脚本 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 83. API 429 限流
将 API 429 限流 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 84. 指标 recording rule
将 指标 recording rule 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 85. SLO 窗口选择
将 SLO 窗口选择 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 86. 告警去重
将 告警去重 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 87. 备份保留策略
将 备份保留策略 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 88. RPO 演算
将 RPO 演算 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 89. 恢复后凭据轮换
将 恢复后凭据轮换 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 90. 升级前 CRD 备份
将 升级前 CRD 备份 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 91. v2 到 v3 迁移
将 v2 到 v3 迁移 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 92. 插件版本锁定
将 插件版本锁定 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 93. 回滚后漂移
将 回滚后漂移 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 94. Admission 拒绝
将 Admission 拒绝 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 95. 目标集群 RBAC
将 目标集群 RBAC 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 96. CMP tar 排除
将 CMP tar 排除 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 97. 扩展 API 兼容
将 扩展 API 兼容 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 98. UI 发布检查
将 UI 发布检查 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 99. 开发环境隔离
将 开发环境隔离 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 100. 静态分析规则
将 静态分析规则 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 101. 镜像 SBOM
将 镜像 SBOM 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 102. 安全补丁响应
将 安全补丁响应 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 103. 运行手册评审
将 运行手册评审 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 104. 值班演练复盘
将 值班演练复盘 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 105. 节点维护 PDB
将 节点维护 PDB 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 106. 跨区网络延迟
将 跨区网络延迟 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 107. OIDC claim 映射
将 OIDC claim 映射 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 108. RBAC 通配符审计
将 RBAC 通配符审计 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 109. 管理员应急账号
将 管理员应急账号 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。

##### 110. Secret 外部同步
将 Secret 外部同步 纳入变更前检查、变更中观测和变更后验收三个阶段。每个阶段都要有明确的停止条件，避免在证据不足时扩大影响范围。
检查清单：版本与配置已记录；相关 Secret 未暴露；当前没有未完成的高优先级同步；业务 owner 知道本次操作；回滚清单可以在五分钟内执行。
执行证据：
```bash
argocd version --client
kubectl -n argocd get cm argocd-cm argocd-rbac-cm -o yaml
kubectl -n argocd get applications.argoproj.io -A -o json
```
把命令输出与 Prometheus 同一时间窗对齐，检查错误率、p95 延迟、队列长度、manifest 生成失败、目标 API 429 和 Application 健康变化。指标正常但用户失败时，继续查入口协议和权限；指标异常但用户无感时，确认是否为单一低优先级对象。
安全要求：使用最小权限的临时身份，操作结束即撤销；禁止通过命令行参数传递长期密钥；备份和日志采用脱敏副本；涉及删除时必须先执行 dry-run 或只读 diff。
验收：至少验证一个成功路径和一个拒绝路径。成功路径应产生预期状态变化，拒绝路径应保持资源不变并留下审计事件。验证完成后恢复原有 Sync Window、并发和告警静默设置。
故障处理：若出现新的 `Unknown`、`ComparisonError` 或 `SyncFailed`，先暂停自动同步，保存 operationState 与组件日志，再按入口、身份、仓库、渲染、对账、集群六层定位。
复盘问题：哪一条证据最先证明根因？哪一个指标没有覆盖影响？runbook 是否能由另一名值班人员独立执行？把答案写入变更记录，而不是只口头交接。
材料归档：将清单、命令输出、指标查询和回滚结果关联到变更单，设置保留期限，过期后删除含敏感信息的副本。


##### 2. RBAC project 边界
本卡片把“RBAC project 边界”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 RBAC project 边界 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 3. 本地管理员 Token
本卡片把“本地管理员 Token”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 本地管理员 Token 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 4. Webhook Secret 轮换
本卡片把“Webhook Secret 轮换”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Webhook Secret 轮换 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 5. 仓库 SSH known_hosts
本卡片把“仓库 SSH known_hosts”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 仓库 SSH known_hosts 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 6. 目标集群 CA 与 Token
本卡片把“目标集群 CA 与 Token”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 目标集群 CA 与 Token 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 7. Ingress gRPC 路由
本卡片把“Ingress gRPC 路由”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Ingress gRPC 路由 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 8. Redis 缓存故障
本卡片把“Redis 缓存故障”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Redis 缓存故障 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 9. Repo Server 并发
本卡片把“Repo Server 并发”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Repo Server 并发 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 10. Controller shard
本卡片把“Controller shard”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Controller shard 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 11. Monorepo 生成
本卡片把“Monorepo 生成”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Monorepo 生成 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 12. Reconcile 抖动
本卡片把“Reconcile 抖动”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Reconcile 抖动 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 13. API Server 限流
本卡片把“API Server 限流”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 API Server 限流 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 14. Prometheus 低基数
本卡片把“Prometheus 低基数”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Prometheus 低基数 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 15. 交付时效 SLO
本卡片把“交付时效 SLO”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 交付时效 SLO 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 16. 错误预算冻结
本卡片把“错误预算冻结”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 错误预算冻结 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 17. 配置导出加密
本卡片把“配置导出加密”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 配置导出加密 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 18. 隔离集群恢复
本卡片把“隔离集群恢复”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 隔离集群恢复 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 19. CRD 兼容检查
本卡片把“CRD 兼容检查”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 CRD 兼容检查 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 20. 升级 canary
本卡片把“升级 canary”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 升级 canary 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 21. 回滚门槛
本卡片把“回滚门槛”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 回滚门槛 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 22. ComparisonError
本卡片把“ComparisonError”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 ComparisonError 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 23. SyncFailed
本卡片把“SyncFailed”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 SyncFailed 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 24. Unknown 状态
本卡片把“Unknown 状态”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Unknown 状态 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 25. CMP discover
本卡片把“CMP discover”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 CMP discover 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 26. CMP generate 超时
本卡片把“CMP generate 超时”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 CMP generate 超时 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 27. 资源 Action 审计
本卡片把“资源 Action 审计”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 资源 Action 审计 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 28. Web Terminal
本卡片把“Web Terminal”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Web Terminal 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 29. 组件单元测试
本卡片把“组件单元测试”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 组件单元测试 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 30. E2E 测试证据
本卡片把“E2E 测试证据”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 E2E 测试证据 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 31. 依赖漏洞
本卡片把“依赖漏洞”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 依赖漏洞 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 32. 发布签名
本卡片把“发布签名”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 发布签名 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 33. 值班交接
本卡片把“值班交接”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 值班交接 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 34. 季度故障演练
本卡片把“季度故障演练”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 季度故障演练 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 35. PDB 与反亲和
本卡片把“PDB 与反亲和”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 PDB 与反亲和 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 36. Kubernetes API QPS
本卡片把“Kubernetes API QPS”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Kubernetes API QPS 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 37. OIDC issuer 与 JWKS
本卡片把“OIDC issuer 与 JWKS”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 OIDC issuer 与 JWKS 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 38. RBAC project 边界
本卡片把“RBAC project 边界”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 RBAC project 边界 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 39. 本地管理员 Token
本卡片把“本地管理员 Token”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 本地管理员 Token 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 40. Webhook Secret 轮换
本卡片把“Webhook Secret 轮换”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Webhook Secret 轮换 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 41. 仓库 SSH known_hosts
本卡片把“仓库 SSH known_hosts”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 仓库 SSH known_hosts 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 42. 目标集群 CA 与 Token
本卡片把“目标集群 CA 与 Token”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 目标集群 CA 与 Token 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 43. Ingress gRPC 路由
本卡片把“Ingress gRPC 路由”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Ingress gRPC 路由 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 44. Redis 缓存故障
本卡片把“Redis 缓存故障”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Redis 缓存故障 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 45. Repo Server 并发
本卡片把“Repo Server 并发”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Repo Server 并发 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 46. Controller shard
本卡片把“Controller shard”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Controller shard 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 47. Monorepo 生成
本卡片把“Monorepo 生成”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Monorepo 生成 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 48. Reconcile 抖动
本卡片把“Reconcile 抖动”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Reconcile 抖动 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 49. API Server 限流
本卡片把“API Server 限流”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 API Server 限流 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 50. Prometheus 低基数
本卡片把“Prometheus 低基数”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Prometheus 低基数 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 51. 交付时效 SLO
本卡片把“交付时效 SLO”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 交付时效 SLO 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 52. 错误预算冻结
本卡片把“错误预算冻结”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 错误预算冻结 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 53. 配置导出加密
本卡片把“配置导出加密”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 配置导出加密 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 54. 隔离集群恢复
本卡片把“隔离集群恢复”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 隔离集群恢复 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 55. CRD 兼容检查
本卡片把“CRD 兼容检查”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 CRD 兼容检查 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 56. 升级 canary
本卡片把“升级 canary”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 升级 canary 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 57. 回滚门槛
本卡片把“回滚门槛”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 回滚门槛 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 58. ComparisonError
本卡片把“ComparisonError”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 ComparisonError 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 59. SyncFailed
本卡片把“SyncFailed”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 SyncFailed 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 60. Unknown 状态
本卡片把“Unknown 状态”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Unknown 状态 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 61. CMP discover
本卡片把“CMP discover”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 CMP discover 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 62. CMP generate 超时
本卡片把“CMP generate 超时”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 CMP generate 超时 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 63. 资源 Action 审计
本卡片把“资源 Action 审计”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 资源 Action 审计 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 64. Web Terminal
本卡片把“Web Terminal”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 Web Terminal 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 65. 组件单元测试
本卡片把“组件单元测试”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 组件单元测试 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 66. E2E 测试证据
本卡片把“E2E 测试证据”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 E2E 测试证据 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 67. 依赖漏洞
本卡片把“依赖漏洞”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 依赖漏洞 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 68. 发布签名
本卡片把“发布签名”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 发布签名 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 69. 值班交接
本卡片把“值班交接”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 值班交接 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。

##### 70. 季度故障演练
本卡片把“季度故障演练”转换为可验证的运行任务。先声明目标，再收集证据，最后执行最小范围变更。任何涉及凭据、删除或升级的操作都需要审批记录。
目标：确认 季度故障演练 在当前版本、当前集群和当前流量下满足设计约束。成功标准不是命令返回 0，而是控制面、Application 状态和审计记录同时一致。
准备：记录时间、Argo CD 版本、Application、project、cluster、revision 和操作者；检查是否处于 Sync Window、发布冻结或故障响应状态。
观察命令：
```bash
kubectl -n argocd get pods -o wide
argocd app list --output wide
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```
判读：先看是否存在 Ready、连接、权限或队列错误，再将错误与同一时间窗的指标和日志关联。单个 Application 异常优先查 source、destination 和资源事件；多个 Application 同时异常优先查共享组件。
变更：只调整一个变量，保留变更前后 YAML 和指标截图。对于 RBAC、Secret、CRD 或同步策略，先在非生产对象上验证，再扩展到生产。
回退：若错误率、延迟、健康状态或删除数量超过门槛，立即恢复上一份清单或 Secret 版本，并暂停自动同步，等待一个 reconciliation 周期确认稳定。
风险：缓存可能掩盖真实连接问题，旧 Token 可能让权限测试失真，默认值变化可能造成无意义 diff。任何临时 ignoreDifferences、cluster-admin 或强制 replace 都要设置到期时间。
证据：保存脱敏后的日志片段、PromQL 查询、Application YAML、diff、事件和审批链接；不要把 Token、client secret、Webhook secret 或完整 JWT 放入工单。
演练：在隔离命名空间制造一个可控失败，执行本卡片步骤，测量发现、定位、修复和验证耗时；将缺失的指标、权限和文档补回 runbook。
