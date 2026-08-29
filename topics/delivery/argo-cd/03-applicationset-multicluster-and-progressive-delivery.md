# Argo CD ApplicationSet、多集群与渐进式交付学习笔记

## 第 1 章 · 理解 ApplicationSet 控制器和资源模型

### ApplicationSet 为什么不是普通的 Application 模板复制器

ApplicationSet 根据生成器结果渲染模板并创建、更新、删除 Application。它管理的是 Application 集合，Application Controller 再负责每个应用的资源调谐，因此形成二级控制循环。模板变更可能一次影响数百个集群。

### Generator、Template 与 Application 如何形成二级调谐链路

Generator 产生参数，Template 生成 Application spec，ApplicationSet Controller 负责集合差异；生成的 Application 交给 Application Controller 处理 Git、diff、sync 和 health。排障时先确定参数是否生成，再看单个 Application。

#### 二级调谐的故障判读

ApplicationSet 已更新但 Application 没出现，优先查 generator 输入、模板渲染和 RBAC；Application 已出现但资源未同步，则转到 Application Controller。不要直接删除生成对象，因为下一轮调谐会再次创建，且会掩盖真正的模板问题。

```mermaid
flowchart LR
    Input[集群仓库参数] --> Generator[Generator]
    Generator --> Template[Template 渲染]
    Template --> Apps[Applications]
    Apps --> Controller[Application Controller]
    Controller --> Cluster[目标集群]
```

### 安装、升级和高可用模式需要满足哪些前提

确认 CRD、RBAC、Webhook、Controller 资源限制和版本兼容；高可用模式需要副本、反亲和和清晰的 leader election。升级前检查生成数量、API QPS、Webhook 和回滚清单。

### 从规范参考中识别 generators、template、strategy 和 policy

`generators` 决定输入集合，`template` 定义 Application，`strategy` 控制更新方式，`syncPolicy` 传递给生成的 Application。字段继承和覆盖关系要在样例中验证，尤其是嵌套 metadata 与 syncPolicy。

### 使用 Go Template、Sprig 函数与缺失键保护

Go Template 适合条件和字符串组合，Sprig 提供默认值、列表和字典函数。开启 `missingkey=error` 可尽早发现拼写错误；模板中不要拼接未经校验的集群地址或项目名。

模板变量应先经过命名、URL 和版本校验。把 `{{.cluster}}` 直接用于 Application 名称时，要处理大写、长度和非法字符；把文件内容映射到 Helm 参数时，要明确字符串转义规则。

## 第 2 章 · 使用基础生成器批量创建 Application

### List Generator 适合固定清单和动态元素输入

List Generator 直接维护集群、环境和路径清单，适合小规模稳定集合。元素变更会触发 Application 增删，提交前应检查 diff。

固定清单的优点是可读和可审计，缺点是需要人工维护。适合在仓库中保存少量环境级例外，不适合用来表达几十个动态集群；规模增长后应迁移到 Cluster Generator 或 SCM Provider。

### Cluster Generator 如何按标签和 Kubernetes 版本选择集群

Cluster Generator 读取 Argo CD 已注册集群及其 labels，可按环境、区域、版本筛选。标签是调度契约，命名规则要统一，避免生产集群误匹配开发模板。

### Git Directory Generator 如何发现目录并控制排除规则

它扫描仓库目录并为每个目录生成 Application。使用 exclude 排除 `_base`、文档和测试目录；目录重命名会表现为删除加创建，应提前评估资源归属。

### Git File Generator 如何读取配置文件并处理 glob

Git File Generator 读取 JSON/YAML 文件并把字段作为模板参数。glob 规则要窄，文件 schema 需由 CI 校验，缺字段时让生成失败而不是生成空目标。

### Cluster Decision Resource 如何接入外部调度决策

该 Generator 从自定义资源读取集群决策，适合容量、合规或区域调度服务。外部控制器必须保证决策资源版本化、可审计，并为无决策和过期决策提供安全默认值。

## 第 3 章 · 对接 SCM、Pull Request 与外部生成逻辑

### SCM Provider Generator 如何跨组织发现仓库

SCM Provider 通过 GitHub、GitLab 等 API 发现组织仓库并套用模板。Token 只授予读元数据和仓库内容的权限，组织过滤与命名约定要防止把实验仓库发布到生产。

### Pull Request Generator 如何创建和清理预览环境

Generator 为每个 PR 生成临时 Application，可把 PR 编号作为命名空间和 URL。关闭或合并 PR 时应自动清理，并为数据库、域名和外部资源设置 TTL 与 orphan 保护。

预览环境的命名空间必须包含 PR 唯一标识，并设置 ResourceQuota、NetworkPolicy 和最大存活时间。清理失败时保留 Application 事件和外部资源 ID，避免只删除 Kubernetes namespace 后留下云资源。

### Webhook、轮询周期与 refresh 注解如何控制发现延迟

Webhook 低延迟但依赖网络和签名配置，轮询是兜底但受 SCM 限流影响；refresh 注解适合单次触发。监控 webhook 失败率、最后成功时间和 API rate limit。

### Plugin Generator 如何安全接入外部参数服务

Plugin Generator 调用外部服务生成参数，服务应返回固定 schema、设置超时和签名校验。不要让插件直接返回任意 Application YAML；使用 allowlist、缓存和熔断，避免外部服务故障拖垮控制器。

## 第 4 章 · 组合生成器并控制参数冲突

### Matrix Generator 如何计算笛卡尔积并传递子生成器参数

Matrix 将两个生成器结果做笛卡尔积，例如“集群×服务”。组合前估算数量，给参数命名空间，防止同名键覆盖；数量增长应有配额和告警。

### Merge Generator 如何覆盖基线参数并处理缺失项

Merge 以匹配键合并基线与覆盖项，适合全局默认加区域例外。覆盖字段必须显式列出，缺失项采用安全默认，不要静默生成空 destination。

### Post Selector 如何在生成后筛选目标集合

Post Selector 在生成后按标签或字段过滤结果，可作为最后一道准入。过滤条件变更会大规模删除 Application，必须先在 dry-run 或测试项目验证。

变更 Post Selector 前导出当前生成列表，与新列表做集合差异：新增、保留、删除分别审批。删除数量异常时，应通过 Git revert 或暂停 ApplicationSet 恢复，而不是逐个手工重建。

### Template Patch 与 Generator Template 如何表达条件化差异

Generator Template 负责默认模板，Template Patch 针对特定生成结果做条件化修改。复杂条件应回到清晰的输入字段，避免在 patch 中堆叠不可读的 JSONPath。

## 第 5 章 · 保护批量变更、删除与多租户边界

### create-only、create-update 与 sync 策略分别限制什么

create-only 只允许创建，create-update 允许创建和更新，sync 还允许触发生成 Application 的同步策略。生产批量模板默认从 create-update 开始，验证后再开放删除和自动同步。

### 忽略 Application 差异时有哪些字段和合并限制

可忽略生成 Application 的特定 metadata 或 spec 字段，但忽略规则不能掩盖 destination、project 等安全边界。字段合并冲突要通过单元样例和实际 diff 验证。

### 删除 ApplicationSet、Application 和业务资源时如何避免级联事故

删除 ApplicationSet 可能删除生成的 Application，进而删除业务资源。先暂停自动同步，设置 orphan 或 preserveResourcesOnDeletion，导出对象并在测试集群演练。

### ApplicationSet in any namespace 怎样配置权限和项目模板

允许任意命名空间后，需要为 ApplicationSet CRD、生成目标和项目访问分别授权。命名空间 allowlist、可信仓库和模板项目必须集中管理。

### 为什么只有管理员才能控制可信来源和 templated project

模板可注入 project、destination 和资源权限；普通用户若能修改可信来源，就能间接获得管理员能力。因此仓库 allowlist、项目模板和插件配置应由平台管理员维护。

## 第 6 章 · 从常见用例走向渐进式发布

### 用 ApplicationSet 管理集群附加组件、Monorepo 和租户自助

集群附加组件适合 Cluster Generator，Monorepo 适合目录或文件 Generator，租户自助适合受限模板和项目角色。三者都要定义生命周期、owner 和删除策略。

### RollingSync 如何按标签分组和控制批次规模

RollingSync 根据生成 Application 的标签分组，按步骤和最大更新数推进。批次要覆盖不同故障域，并让每组完成健康检查后再进入下一组。

`maxUpdate` 可以是绝对数量或百分比；百分比在小批次中可能向上取整，因此需要明确最小批量。每组都应配置暂停、失败告警和人工继续条件，避免一个坏版本自动扩散到所有集群。

### 创建策略与删除策略怎样影响故障暂停和回滚

创建策略控制新 Application，删除策略控制集合缩小时的清理；失败时应暂停后续批次。回滚以 Git revert 为主，保留上一批次 revision 和生成参数。

### 为生成数量、SCM 限流和控制器异常建立观测点

监控生成 Application 数量、每轮耗时、队列深度、错误率、SCM API 剩余配额和控制器重启。为数量突增、生成失败和长时间未更新设置告警。

#### 端到端演练：从一份清单到多集群滚动发布

先用 List Generator 生成两个测试集群，再切换 Cluster Generator 按 `env=staging` 标签筛选。确认生成的 Application 名称、project、destination 和 namespace 都符合预期后，加入 Matrix 把“集群×服务”扩展成组合集合。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  generators:
    - clusters:
        selector:
          matchLabels:
            env: staging
  strategy:
    type: RollingSync
    rollingSync:
      steps:
        - matchExpressions:
            - key: env
              operator: In
              values: [staging]
          maxUpdate: 1
```

最后在测试仓库删除一个目录，观察 ApplicationSet 事件、生成 Application 和业务资源的级联关系。只有确认删除策略、暂停方式和回滚 revision 都可用，才把 selector 扩展到生产集群。

#### ApplicationSet 与 Application 的边界

ApplicationSet 的职责是“集合管理”，而不是替代 Application Controller。它读取生成器输入，计算期望的 Application 集合，再把每个成员写入 Kubernetes API。Application Controller 随后独立处理 Git manifest、资源比较、同步和健康检查。两个控制器的队列、缓存和权限并不相同。

| 对象 | 所属控制器 | 主要输入 | 主要输出 | 常见故障 |
| --- | --- | --- | --- | --- |
| ApplicationSet | ApplicationSet Controller | generators、template、策略 | Application 对象 | 参数为空、模板错误、权限拒绝 |
| Application | Application Controller | repo、revision、path、destination | Deployment、Service 等资源 | 仓库不可达、渲染失败、同步失败 |
| 目标资源 | Kubernetes API | Application sync | 工作负载与配置 | admission 拒绝、配额不足、探针失败 |

一个实际的调谐周期可以拆成五步：读取 ApplicationSet；执行生成器；渲染模板；比较现有 Application；提交增删改操作。任一步失败都应在 ApplicationSet status.conditions 中留下线索。值班人员不要只看生成的 Application 是否存在，还要检查 `kubectl describe applicationset` 的事件和 controller 日志。

```bash
kubectl -n argocd get applicationset payments -o yaml
kubectl -n argocd describe applicationset payments
kubectl -n argocd logs deploy/argocd-applicationset-controller --since=10m
kubectl -n argocd get applications -l applicationset.argoproj.io/instance=payments
```

#### 调谐链路演练

先提交一个只增加元素的 List Generator，观察 ApplicationSet 的 `observedGeneration` 是否追上 metadata.generation。再修改模板中的 destination namespace，确认所有成员的 spec 发生更新。最后故意把仓库地址改成无效值，验证 ApplicationSet 仍能生成对象，但 Application Controller 将其标记为 `ComparisonError`。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: payments
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - name: dev
            server: https://dev.example.invalid
  template:
    metadata:
      name: payments-{{name}}
    spec:
      project: default
      source:
        repoURL: https://git.example.invalid/platform/apps.git
        targetRevision: main
        path: payments
      destination:
        server: '{{server}}'
        namespace: payments
```

期望结果是 ApplicationSet 条件保持健康、Application 对象创建成功，但 Application 的 repository 或 destination 状态明确显示失败原因。该实验能够说明“生成成功”和“交付成功”是两个独立指标。

#### 事件与状态字段判读

`status.conditions` 中的 `ErrorOccurred` 通常表示生成器或模板阶段错误；`ParametersGenerated` 表示生成器已经产生参数，但不代表 Application 已经成功同步；`ResourcesUpToDate` 只说明集合与期望集合一致。升级或重启后，短暂的 `Unknown` 可能来自缓存尚未恢复，应结合 controller ready 和队列指标判断。

```bash
kubectl -n argocd get applicationset payments \
  -o jsonpath='{range .status.conditions[*]}{.type}{"="}{.message}{"\n"}{end}'
```

将状态写入值班手册时，保留时间戳、observedGeneration 和 controller 版本。只记录“失败”而没有 message 会让后续无法区分网络、RBAC 和 schema 问题。

#### 安装清单审查

安装 ApplicationSet 前至少审查以下资源：CRD 是否与控制器版本匹配；ServiceAccount 是否拥有读取集群 Secret、仓库 Secret 和 Application 的权限；Deployment 是否有资源请求；NetworkPolicy 是否允许访问 Git、Kubernetes API 和 webhook；Webhook Service 是否有稳定端口。

```bash
kubectl api-resources | rg 'applicationsets|applications'
kubectl -n argocd get deploy argocd-applicationset-controller -o wide
kubectl -n argocd auth can-i get applications --as=system:serviceaccount:argocd:argocd-applicationset-controller
kubectl -n argocd get events --sort-by=.lastTimestamp | tail -20
```

生产环境应固定镜像版本和 CRD 清单，不直接引用未验证的 `stable` 标签。升级前导出当前 ApplicationSet 与生成 Application 的 YAML，并保存 controller 日志，以便回滚后比较。

#### 高可用与容量估算

ApplicationSet Controller 的副本数增加并不等于生成吞吐线性增加。控制器依靠 leader election 避免多个实例同时写入同一集合，非 leader 副本主要承担热备。容量规划应以每轮生成对象数量、Git/SCM API 延迟和 Kubernetes API QPS 为依据。

| 规模 | 建议关注点 | 验收指标 |
| --- | --- | --- |
| 少于 50 个 Application | 单副本也可运行 | 调谐延迟小于 30 秒 |
| 50 到 500 个 | 两副本、资源请求、缓存 | P95 调谐小于 2 分钟 |
| 超过 500 个 | 分片、仓库拆分、SCM 限流 | 队列不持续增长 |

```yaml
resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 1
    memory: 1Gi
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          topologyKey: topology.kubernetes.io/zone
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: argocd-applicationset-controller
```

#### 版本升级检查表

升级前检查 ApplicationSet CRD 的 schema 是否增加或删除字段，确认 Go Template 行为和策略字段没有变化。先在测试命名空间应用新版本，再观察一整轮 generator refresh、创建、更新和删除。若使用插件生成器，还需验证插件 API 与超时配置。

```bash
kubectl get crd applicationsets.argoproj.io -o yaml > /tmp/applicationset-crd.before.yaml
kubectl -n argocd rollout status deploy/argocd-applicationset-controller --timeout=5m
kubectl -n argocd get applicationset -A -o json > /tmp/applicationset.after.json
```

回滚时优先恢复 controller 和 CRD 版本，再恢复仓库中的 ApplicationSet 规范。不要在控制器不兼容时手工编辑生成的 Application，因为下一轮调谐会覆盖手工修改。

#### 规范字段速查

| 字段 | 作用 | 典型值 | 风险 |
| --- | --- | --- | --- |
| `spec.generators` | 参数来源列表 | `list`、`clusters`、`git` | 结果数量失控 |
| `spec.template` | Application 基线 | metadata、spec | 权限边界被模板放大 |
| `spec.templatePatch` | 条件化补丁 | Go Template 字符串 | patch 不可读、覆盖错误 |
| `spec.strategy` | Application 更新策略 | `RollingSync` | 扩散速度过快 |
| `spec.syncPolicy` | 控制 ApplicationSet 自身行为 | `create-update` | 误删生成对象 |
| `spec.goTemplateOptions` | 模板错误策略 | `missingkey=error` | 输入不完整时生成失败 |

应用规范时先使用 `kubectl apply --server-side --dry-run=server`，让 API Server 校验字段类型；再用 `kubectl diff` 比较现有对象。对于大规模集合，把 generator 参数拆成独立文件并由 CI 做 schema 校验。

#### Go Template 的类型陷阱

Go Template 默认将许多值渲染成字符串。布尔值、数字和列表在嵌套字段中可能被错误地加引号，最终导致 Application schema 校验失败。使用 `toJson` 传递结构化值，使用 `quote` 只处理确实需要字符串的字段。

```yaml
metadata:
  labels:
    environment: '{{ index .metadata.labels "environment" }}'
spec:
  source:
    helm:
      parameters:
        - name: replicaCount
          value: '{{ .replicas }}'
```

当启用 `missingkey=error` 时，所有元素都必须具备相同字段。若允许少数元素没有可选字段，应使用 `dig` 或预先在 generator 中填充默认值，而不是关闭错误保护。

#### 模板测试方法

把 ApplicationSet 文件放入独立测试目录，使用 `argocd appset` 命令或控制器 dry-run 能力渲染。测试至少覆盖空集合、单元素、多个元素、非法名称、缺失字段和重复名称。

```bash
argocd appset generate appset.yaml --loglevel debug > generated.yaml
kubectl apply --dry-run=server -f generated.yaml
```

CI 中检查生成 Application 的名称集合是否稳定。名称顺序变化本身不应导致资源更新，但名称碰撞会导致后写对象覆盖前写对象，是必须阻断的错误。

#### List Generator 字段设计

List Generator 的每个 element 是一组键值。建议至少包含 `name`、`server`、`namespace`、`revision` 和 `project`，并把环境、区域、故障域作为标签字段。字段命名应与 Cluster Generator 产出的键保持一致，便于后续迁移。

```yaml
generators:
  - list:
      elements:
        - name: cn-shanghai-staging
          server: https://10.0.0.10
          namespace: payments
          revision: main
          region: cn-shanghai
          environment: staging
```

提交前运行脚本检查 name 唯一、server 合法、namespace 符合 DNS-1123，并拒绝 `environment=prod` 却使用非生产仓库 revision 的组合。

#### List Generator 变更演练

新增元素时应先观察 ApplicationSet diff，再允许 Application Controller 同步。删除元素前先确认目标 Application 是否有独立 owner，以及资源是否设置了 `preserveResourcesOnDeletion`。

```bash
kubectl -n argocd get appset payments -o jsonpath='{.status.resources[*].name}'
git diff -- appset/payments.yaml
kubectl -n argocd annotate applicationset payments argocd.argoproj.io/application-set-refresh=true
```

演练记录应包含：旧元素集合、新元素集合、将删除的 Application、预计删除的业务资源和回滚提交。

#### Cluster Generator 标签契约

Cluster Generator 读取 Argo CD 管理的 cluster Secret。标签既是筛选条件，也是平台团队与应用团队之间的契约。推荐使用 `env`、`region`、`tier`、`compliance` 等有限集合，并在注册集群时由平台自动写入。

```yaml
generators:
  - clusters:
      selector:
        matchLabels:
          env: prod
          region: cn-shanghai
      values:
        rolloutGroup: primary
```

不要把任意用户可修改的 label 直接当作生产准入条件。对关键标签使用 admission policy 或集中式注册流程，防止用户把测试集群标记成 prod。

#### Cluster Generator 与版本条件

Kubernetes 版本通常以 `kubeVersion` 元数据暴露。版本比较应在 generator 或外部准入层完成，不要依赖字符串字典序。升级窗口内可以用标签 `kube-major`、`kube-minor` 明确表达兼容范围。

```yaml
selector:
  matchExpressions:
    - key: env
      operator: In
      values: [staging, prod]
    - key: kube-minor
      operator: In
      values: [28, 29]
```

当集群标签缺失时，生成结果为空并不一定是控制器故障。值班排查顺序是：确认集群 Secret 存在、标签是否拼写正确、selector 是否包含多个互斥条件。

#### Git Directory Generator 目录约定

目录生成器适合“一个目录一个应用”的仓库布局。推荐将环境覆盖与公共 base 分开，避免 `_base` 被误认为独立应用。目录名变更会产生旧 Application 删除和新 Application 创建，资源跟踪标签无法自动识别这是重命名。

```text
apps/
  payments/
    base/
    overlays/staging/
    overlays/prod/
  orders/
    base/
```

```yaml
generators:
  - git:
      repoURL: https://git.example.com/platform/apps.git
      revision: main
      directories:
        - path: apps/*/overlays/*
        - path: apps/*/base
          exclude: true
```

重命名应采用“先创建新路径、验证资源、再删除旧路径”的两阶段提交，或保留旧路径一段时间并使用资源跟踪迁移方案。

#### Git File Generator 的 schema

文件生成器将匹配文件解析为参数。建议每个文件包含 `app`、`clusterSelector`、`path`、`namespace` 和 `owner`，并在 CI 使用 JSON Schema 校验。glob 应限制在固定目录，避免把 README 或临时文件解析为配置。

```yaml
generators:
  - git:
      repoURL: https://git.example.com/platform/config.git
      revision: main
      files:
        - path: clusters/**/apps/*.yaml
```

文件内容被删除时，生成器会认为对应 Application 不再存在。删除文件前应运行集合差异脚本，并确认是否启用了删除保护。

#### SCM Provider 凭据最小权限

SCM Provider 需要访问组织、仓库和分支元数据。GitHub App 推荐只授予 metadata read、contents read、pull requests read；GitLab Token 仅授予 `read_api` 和 `read_repository`。凭据应放在专用 Secret，禁止复用开发者个人 Token。

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: scm-provider
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: github
  githubAppID: "12345"
  githubAppInstallationID: "67890"
  githubAppPrivateKey: |-
    -----BEGIN RSA PRIVATE KEY-----
    REDACTED
    -----END RSA PRIVATE KEY-----
```

轮换时先创建新 Secret，验证 API 调用成功后再删除旧 Secret。观察 controller 日志中的 rate limit 和认证错误，避免在高峰期同时刷新全部组织仓库。

#### Pull Request 预览环境资源账单

PR Generator 方便验证变更，但每个 PR 都可能创建 namespace、负载均衡器、PVC 和云数据库。模板应设置 ResourceQuota、LimitRange 和网络策略，并对外部资源使用 TTL 标签。预览环境的 owner 应来自 SCM 用户或团队映射，便于自动回收。

```yaml
metadata:
  name: preview-{{number}}
  labels:
    preview: "true"
    pr: '{{number}}'
    owner: '{{author}}'
spec:
  destination:
    namespace: preview-{{number}}
```

关闭 PR 后确认 generator 不再返回该编号，再观察 Application 是否被删除。若删除失败，不要反复重试造成 API 压力，应读取事件并处理 finalizer 或外部资源依赖。

#### Webhook 安全与延迟

Webhook 只负责触发刷新，不应直接携带完整 Application 定义。入口应验证签名、限制来源 IP、设置请求体大小和速率。轮询周期作为兜底，不能设置得过短以免触发 SCM 限流。

```bash
kubectl -n argocd get secret argocd-secret -o jsonpath='{.data.webhook\.github\.secret}'
kubectl -n argocd annotate applicationset payments argocd.argoproj.io/application-set-refresh=true --overwrite
```

记录 webhook 接收时间、刷新开始时间、生成完成时间，计算端到端延迟。只看 Git webhook 的 2xx 并不能证明 Application 已更新。

#### Matrix 数量预算

Matrix Generator 的输出数等于子生成器结果的笛卡尔积。集群 20 个、服务 30 个、环境 3 个时将产生 1,800 个 Application，远超许多控制器的默认容量。组合前先计算上界，并按团队、区域或环境拆分 ApplicationSet。

```text
总数 = |clusters| × |services| × |environments|
预算 = 控制器可接受的 Application 数 × 安全系数(0.7)
```

在 CI 中对生成数量设置阈值，超过阈值必须人工审批。运行时监控 `argocd_applicationset_generated_applications` 等指标，发现突增立即暂停相关集合。

#### Merge 覆盖优先级

Merge Generator 需要明确 merge keys。基线元素提供默认仓库、项目和同步策略，覆盖元素只放例外字段。覆盖文件应短小，且通过测试证明缺失字段不会覆盖成空字符串。

```yaml
generators:
  - merge:
      mergeKeys: [name]
      generators:
        - list:
            elements:
              - name: prod
                revision: stable
                autoSync: "false"
        - list:
            elements:
              - name: prod
                revision: canary
```

审查时逐字段列出“基线值、覆盖值、最终值”。若多个覆盖项命中同一 merge key，结果依赖顺序，容易产生隐性变化，应在 CI 禁止重复键。

#### Post Selector 变更保护

Post Selector 在所有 generator 完成后过滤结果。它适合临时排除故障域，但不应成为长期的业务路由配置。修改 selector 前导出旧集合，计算删除集合，并设置变更阈值。

```bash
kubectl -n argocd get applications -l applicationset.argoproj.io/instance=payments -o name > /tmp/payments.before
kubectl diff -f appset.yaml
comm -23 <(sort /tmp/payments.before) <(sort /tmp/payments.after)
```

当删除集合超过预期，先暂停 ApplicationSet 调谐，再回滚 selector 提交。不要用 `kubectl delete application` 代替恢复配置。

#### 创建和删除策略矩阵

| 场景 | 创建 | 更新 | 删除 | 推荐 |
| --- | --- | --- | --- | --- |
| 试运行 | 允许 | 禁止 | 禁止 | create-only |
| 日常交付 | 允许 | 允许 | 禁止 | create-update |
| 完整生命周期 | 允许 | 允许 | 允许 | sync + 明确删除保护 |
| 灾难恢复 | 手工 | 手工 | 禁止 | 暂停自动策略 |

策略变更本身也应走 Git 审批。生产集合从 create-update 切换到允许删除前，必须有备份、演练记录和回滚负责人。

#### 删除级联实验

在隔离集群创建一个 ApplicationSet，生成带有 PVC 的 Application。分别测试删除 ApplicationSet、删除单个 Application、删除仓库目录三种动作，记录 Kubernetes ownerReferences、finalizers 和业务资源是否保留。

```bash
kubectl -n argocd get app preview-dev -o jsonpath='{.metadata.ownerReferences}'
kubectl -n argocd get app preview-dev -o jsonpath='{.metadata.finalizers}'
kubectl -n preview get pvc
```

实验结束后确认云资源没有残留。对数据库、负载均衡器等非 Kubernetes 资源，删除保护必须由外部控制器或账单巡检补充。

#### Any Namespace 权限分层

启用 ApplicationSet in any namespace 后，至少存在三层权限：用户能否创建 ApplicationSet；控制器能否读取该命名空间的 ApplicationSet；生成的 Application 是否被允许使用某个 AppProject。任何一层过宽都可能突破租户隔离。

```yaml
rules:
  - apiGroups: [argoproj.io]
    resources: [applicationsets]
    verbs: [get, list, watch, create, update, patch, delete]
```

建议按团队命名空间绑定 Role，而不是授予整个集群的 ClusterRole。AppProject 的 sourceRepos、destinations 和 namespaceResourceWhitelist 仍是最终准入边界。

#### Templated Project 风险

如果 ApplicationSet 模板允许用户控制 `spec.project`，用户可能选择拥有集群管理员权限的项目。平台应使用固定 project 或由 generator 映射到 allowlist，并拒绝任意模板表达式。

```yaml
spec:
  project: tenant-a
  destination:
    server: '{{server}}'
```

对模板仓库启用 CODEOWNERS 和强制审查；对 project、destination.server、source.repoURL 等字段建立策略检查。安全测试应包含“替换为 platform-admin 项目”“替换为任意集群”“替换为不可信仓库”三类负向用例。

#### RollingSync 批次模型

RollingSync 将 Application 按标签表达式分组，每个 step 完成后才进入下一个 step。批次不是 Kubernetes Deployment 的 pod 分批，而是 Application 级别的同步编排；单个 Application 内的资源顺序仍由 Sync Wave 决定。

```yaml
strategy:
  type: RollingSync
  rollingSync:
    steps:
      - matchExpressions:
          - key: rollout
            operator: In
            values: [canary]
        maxUpdate: 1
      - matchExpressions:
          - key: rollout
            operator: In
            values: [stable]
        maxUpdate: 25%
```

标签必须在模板中稳定生成。若标签来自可变 SCM 元数据，批次成员可能在一次发布中漂移，导致重复或跳过。

#### RollingSync 失败与恢复

当某一批 Application 健康检查失败时，后续批次应保持未开始状态。值班人员先确认失败是业务探针、仓库渲染还是集群连接，再决定修复、跳过或回滚。跳过批次会改变发布审计记录，必须记录人工批准。

```bash
kubectl -n argocd get applications -l applicationset.argoproj.io/instance=payments \
  -o custom-columns=NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REV:.status.sync.revision
kubectl -n argocd describe applicationset payments
```

回滚优先使用 Git revert 恢复上一 revision，再让 RollingSync 按同样批次反向发布。不要直接把生成 Application 的 targetRevision 改成旧值，因为下一次模板调谐可能覆盖该手工操作。

#### 观测指标与告警阈值

至少采集生成数量、调谐错误、调谐耗时、队列深度、工作队列重试、SCM 请求速率、API Server 429、controller 重启次数和 RollingSync 当前步骤。指标名称因版本可能变化，应先通过 `/metrics` 核对实际暴露名称。

```bash
kubectl -n argocd port-forward svc/argocd-metrics 8082:8082
curl -s http://127.0.0.1:8082/metrics | rg 'applicationset|workqueue|scm'
```

推荐告警：生成数量 10 分钟内增长超过 2 倍；调谐错误持续 5 分钟；SCM 剩余配额低于 20%；队列长度持续增长；RollingSync 处于同一步骤超过发布窗口。告警消息应附 ApplicationSet 名称、当前 revision 和 runbook 链接。

#### 生产发布验收清单

1. 生成器输入来源已审查，仓库和 SCM 凭据为只读最小权限。
2. 模板使用 `missingkey=error`，名称、项目、集群和命名空间均通过策略校验。
3. 生成数量小于预算，矩阵和 selector 的集合差异已人工确认。
4. ApplicationSet 与 Application 的 owner、finalizer、删除策略符合设计。
5. RollingSync 的 canary、批次大小、暂停条件和回滚 revision 已演练。
6. 控制器高可用、资源请求、API QPS、SCM 限流和监控告警已验收。

#### 自测题

1. 为什么 ApplicationSet 显示成功而 Application 仍可能 OutOfSync？
2. Matrix Generator 的结果数量如何估算，何时必须拆分集合？
3. 删除 Git 目录时，哪些对象可能被级联删除，如何先做集合差异？
4. 为什么不能让租户任意设置 `spec.project`？
5. RollingSync 与 Application 内 Sync Wave 的职责有什么区别？

参考答案：ApplicationSet 只负责生成 Application；数量是各子生成器结果的乘积；删除目录会移除对应 Application 并可能触发资源删除；project 决定仓库、集群和资源权限；RollingSync 控制 Application 之间的批次，Sync Wave 控制单个 Application 内资源顺序。

#### 附录 · ApplicationSet 实验手册

#### 实验一：建立最小 List Generator

目标是验证从两个元素生成两个 Application 的完整路径。实验使用独立项目和测试集群，避免默认项目拥有过大的资源范围。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: lab-list
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - app: nginx
            cluster: dev
            server: https://kubernetes.default.svc
          - app: redis
            cluster: dev
            server: https://kubernetes.default.svc
  template:
    metadata:
      name: '{{app}}-{{cluster}}'
      labels:
        lab: applicationset
    spec:
      project: default
      source:
        repoURL: https://github.com/example/platform-manifests.git
        targetRevision: main
        path: '{{app}}'
      destination:
        server: '{{server}}'
        namespace: '{{app}}'
```

应用后检查对象数量：

```bash
kubectl apply -f lab-list.yaml
kubectl -n argocd get applicationset lab-list
kubectl -n argocd get applications -l lab=applicationset
```

预期输出包含 `nginx-dev` 和 `redis-dev`。若只有 ApplicationSet 没有 Application，查看 controller 日志中的模板解析错误。若 Application 数量正确但状态为 Unknown，检查 destination server 是否与 cluster Secret 的 server 完全一致。

删除其中一个 element，先使用 `kubectl diff` 观察集合差异，再确认 `syncPolicy` 是否允许删除。实验结束后使用 Git 回滚，而不是只删除生成对象。

#### 实验二：Cluster Generator 标签选择

目标是验证标签筛选不会把错误环境纳入生产集合。先为三个已注册集群添加明确标签：

```bash
argocd cluster set https://dev.example.com --label env=dev --label region=cn-east
argocd cluster set https://staging.example.com --label env=staging --label region=cn-east
argocd cluster set https://prod.example.com --label env=prod --label region=cn-north
argocd cluster list
```

ApplicationSet 使用 `matchLabels` 选择 staging：

```yaml
generators:
  - clusters:
      selector:
        matchLabels:
          env: staging
          region: cn-east
```

验证步骤：

```bash
kubectl -n argocd get applications -l env=staging
kubectl -n argocd get applicationset lab-clusters -o yaml
```

故意将 `env` 改为 `production`，观察集合变为空。空集合不是删除保护的替代品；如果策略允许删除，控制器可能删除全部 Application。生产 selector 变更必须经过集合差异审批。

#### 实验三：Git Directory 排除规则

仓库布局如下：

```text
services/
  api/overlays/dev
  api/overlays/prod
  web/overlays/dev
  web/overlays/prod
  _base
  README.md
```

对应配置：

```yaml
generators:
  - git:
      repoURL: https://github.com/example/apps.git
      revision: main
      directories:
        - path: services/*/overlays/*
        - path: services/_base
          exclude: true
```

测试清单：

| 操作 | 预期 |
| --- | --- |
| 新增 `services/job/overlays/dev` | 新增一个 Application |
| 修改 `_base` | 不新增 Application，但已存在对象会刷新 |
| 新增 README | 不产生 Application |
| 重命名 `web` 为 `frontend` | 旧对象删除、新对象创建 |

目录 generator 的路径是相对仓库根目录的路径。仓库根目录改变、分支改变或 glob 过宽都会造成集合变化。CI 应将生成结果保存为构建产物，供审查者查看。

#### 实验四：Git File 配置校验

文件内容示例：

```yaml
app: checkout
owner: commerce
environment: staging
clusterSelector:
  env: staging
path: services/checkout
namespace: checkout
```

ApplicationSet 配置：

```yaml
generators:
  - git:
      repoURL: https://github.com/example/config.git
      revision: main
      files:
        - path: environments/**/apps/*.yaml
```

在 CI 中验证必填字段：

```bash
yq -e '.app and .owner and .environment and .path and .namespace' environments/staging/apps/checkout.yaml
```

缺字段时应让流水线失败。不要在模板中用空字符串兜底，因为空 namespace 或 path 可能被解释为默认值，导致资源发布到错误位置。

#### 实验五：Matrix 组合与数量保护

准备两个集群元素和三个服务元素，预期生成六个 Application。为每个子 generator 使用不同前缀，避免 `name` 键冲突。

```yaml
generators:
  - matrix:
      generators:
        - clusters:
            selector:
              matchLabels:
                env: staging
        - list:
            elements:
              - service: api
                path: services/api
              - service: web
                path: services/web
              - service: worker
                path: services/worker
```

模板名称：

```yaml
metadata:
  name: '{{name}}-{{service}}'
```

验证笛卡尔积：

```bash
kubectl -n argocd get applications -l applicationset.argoproj.io/instance=lab-matrix --no-headers | wc -l
```

扩展到生产前给数量设置硬阈值。若集群数从 10 增长到 100，服务数从 5 增长到 30，数量会从 50 变成 3,000，控制器内存、API Server 写入和 SCM 读取都会同时放大。

#### 实验六：Merge 基线与例外

基线集合声明所有环境使用稳定 revision：

```yaml
generators:
  - merge:
      mergeKeys: [env]
      generators:
        - list:
            elements:
              - env: dev
                revision: main
              - env: staging
                revision: stable
              - env: prod
                revision: stable
        - list:
            elements:
              - env: staging
                revision: canary
```

预期 staging 使用 canary，dev 和 prod 仍使用基线值。若 merge key 使用了 `name` 而元素只提供 `env`，覆盖项不会命中，结果仍为 stable。审查时必须检查 key 是否真的存在于两个 generator 输出中。

#### 实验七：Post Selector 故障域隔离

当一个区域出现容量问题时，可以临时过滤该区域：

```yaml
generators:
  - clusters:
      selector:
        matchLabels:
          env: prod
  postSelector:
    matchExpressions:
      - key: region
        operator: NotIn
        values: [cn-east]
```

该配置会让 cn-east 的 Application 从期望集合中消失。若删除策略开启，可能触发删除。临时隔离更安全的做法是保留对象、暂停同步或把 rollout 标签移出当前批次，并在变更单中记录恢复时间。

#### 实验八：模板补丁的条件化字段

基础模板统一启用自动同步，但生产环境要求人工确认：

```yaml
template:
  spec:
    syncPolicy:
      automated: {}
templatePatch: |
  spec:
    syncPolicy:
      automated: null
  {{- if eq .environment "prod" }}
    syncPolicy: {}
  {{- end }}
```

实际项目中应尽量使用 generator 字段直接表达差异，只有字段结构无法通过普通模板表达时才使用 patch。Patch 语法错误通常在整个集合层面失败，影响范围大于单个 Application。

#### 实验九：Any Namespace 租户隔离

为租户 `team-a` 创建 namespace 和 Role，只允许操作该 namespace 的 ApplicationSet：

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: team-a-applicationsets
  namespace: team-a
rules:
  - apiGroups: [argoproj.io]
    resources: [applicationsets]
    verbs: [get, list, watch, create, update, patch, delete]
```

AppProject 进一步限制来源和目标：

```yaml
spec:
  sourceRepos:
    - https://github.com/example/team-a-*
  destinations:
    - namespace: team-a-*
      server: https://cluster.example.com
  namespaceResourceWhitelist:
    - group: apps
      kind: Deployment
    - group: ""
      kind: Service
```

负向测试包括：创建指向 team-b 的 namespace；使用平台管理员 project；引用不在 allowlist 的仓库；创建 ClusterRole。四类操作都应被拒绝或在 Application 状态中保持不可同步。

#### 实验十：删除保护与恢复

在测试环境设置 `preserveResourcesOnDeletion: true`，然后删除 ApplicationSet。验证 Application 是否被删除、业务 Deployment 是否保留。再将策略改为 false，重复实验并记录差异。

```yaml
spec:
  syncPolicy:
    preserveResourcesOnDeletion: true
```

恢复流程：

1. 从 Git 恢复 ApplicationSet 提交。
2. 确认生成器返回原集合。
3. 检查 Application ownerReferences 是否重新建立。
4. 对保留的业务资源执行资源跟踪核对。
5. 仅在确认 revision 后恢复自动同步。

如果对象卡在删除中，先查看 finalizer 和事件，不要直接移除 finalizer。移除 finalizer 可能跳过控制器清理逻辑，留下孤儿资源。

#### 实验十一：Pull Request 生命周期

PR Generator 的最小配置：

```yaml
generators:
  - pullRequest:
      github:
        owner: example
        repo: checkout
        labels: [preview]
      requeueAfterSeconds: 180
template:
  metadata:
    name: checkout-pr-{{number}}
  spec:
    source:
      repoURL: https://github.com/example/checkout.git
      targetRevision: '{{head_sha}}'
      path: deploy/preview
    destination:
      namespace: checkout-pr-{{number}}
      server: https://kubernetes.default.svc
```

测试打开 PR、添加 label、推送新提交、关闭 PR 四个事件。每一步都记录 Application 的 targetRevision、namespace 和健康状态。关闭 PR 后，确认 ApplicationSet 不再返回该 PR，且 namespace、PVC、Ingress 和外部 DNS 均按预期清理。

#### 实验十二：Webhook 与轮询兜底

模拟 webhook 签名错误，确认请求被拒绝且不会触发刷新。随后等待轮询周期，确认控制器仍能发现 Git 或 PR 变化。

```bash
kubectl -n argocd logs deploy/argocd-applicationset-controller | rg 'webhook|refresh|rate limit'
kubectl -n argocd annotate applicationset lab-pr \
  argocd.argoproj.io/application-set-refresh=true --overwrite
```

刷新注解适合单次运维动作，不应被脚本高频调用。若需要持续低延迟，优先修复 webhook 网络、签名和服务发现问题，并保留合理的轮询周期。

#### 实验十三：Plugin Generator 超时

插件服务应返回稳定 JSON：

```json
{
  "elements": [
    {"name": "dev", "server": "https://dev.example.com", "revision": "main"}
  ]
}
```

服务端设置 5 秒超时、最大响应体 1 MiB 和 schema 校验。模拟服务不可用时，ApplicationSet 应报告生成错误，不能使用上一次结果静默扩大或缩小发布集合。对于临时缓存，应标明时间戳和过期时间。

#### 实验十四：RollingSync Canary 到全量

准备 `rollout=canary` 的一个集群和 `rollout=stable` 的三个集群。第一步只更新 canary，健康后第二步每次更新一个 stable。

```yaml
strategy:
  type: RollingSync
  rollingSync:
    steps:
      - matchExpressions:
          - key: rollout
            operator: In
            values: [canary]
        maxUpdate: 1
      - matchExpressions:
          - key: rollout
            operator: In
            values: [stable]
        maxUpdate: 1
```

演练中故意让 canary 的 Deployment 探针失败，确认 stable 不会开始。修复后再次触发，确认 canary 使用目标 revision，再继续 stable。记录每批开始和结束时间，形成审计链。

#### 实验十五：容量与限流压测

在测试控制器上逐步增加 List 元素数量，观察调谐耗时、内存和 API Server 429。每次只增加一倍，并在队列恢复后继续。

```bash
kubectl -n argocd top pod -l app.kubernetes.io/name=argocd-applicationset-controller
kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/argocd/pods | jq '.items[] | select(.metadata.name|contains("applicationset"))'
```

压测结果应记录元素数量、生成 Application 数、Git 请求数、平均调谐耗时、P95/P99、峰值内存和错误数。用结果反推生产容量，而不是仅按集群数量估算。

#### 实验十六：回滚演练记录模板

```markdown
ApplicationSet 回滚记录
- ApplicationSet：
- 触发时间：
- 故障现象：
- 当前 Git revision：
- 上一个已验证 revision：
- 受影响 Application 数：
- 已完成批次：
- 未开始批次：
- 业务资源处理：保留/删除/人工确认
- 回滚提交：
- 验收人：
```

回滚后逐项检查生成集合、Application revision、同步状态、健康状态和告警恢复。对于已经成功发布的批次，回滚应遵循同样的 RollingSync 顺序，避免瞬间把所有集群切回旧版本。

#### 实验十七：常见错误与修复路径

| 错误信息 | 优先检查 | 修复动作 |
| --- | --- | --- |
| `failed to replace parameters` | 模板变量拼写 | 开启 missingkey=error 并补字段 |
| `permission denied` | ServiceAccount RBAC | 增加最小资源权限 |
| `no matching clusters` | Secret 标签 | 修正标签或 selector |
| `duplicate application name` | Matrix/Merge 键 | 加入集群或服务前缀 |
| `repository not accessible` | repo Secret、网络 | 验证凭据和 NetworkPolicy |
| `context deadline exceeded` | SCM/API 延迟 | 增加超时并降低轮询频率 |

每类错误都应保留原始事件、controller 日志和 Git revision。修复后先让单个测试元素恢复，再扩大 selector，避免一次性重放全部集合。

#### 实验十八：平台交接检查

交接给值班团队时，至少提供 ApplicationSet 清单、生成器输入仓库、可信 SCM 凭据 owner、AppProject 权限矩阵、删除和回滚 runbook、指标面板、告警联系人及最近一次演练记录。

```bash
kubectl get applicationset -A -o yaml > applicationsets-backup.yaml
kubectl get appproject -n argocd -o yaml > appprojects-backup.yaml
argocd cluster list > clusters.txt
argocd repo list > repositories.txt
```

备份文件含有 endpoint 和 metadata，提交到受控存储前应脱敏 token、证书和私钥。交接验收以另一名工程师能否在测试集群完成一次创建、暂停、回滚和删除演练为准。

#### 运行专题：生成器输入审计

本专题围绕生成器输入审计建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

集群标签治理

本专题围绕集群标签治理建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

目录重命名迁移

本专题围绕目录重命名迁移建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

文件配置校验

本专题围绕文件配置校验建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

SCM 凭据轮换

本专题围绕SCM 凭据轮换建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

PR 预览回收

本专题围绕PR 预览回收建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

Webhook 去重

本专题围绕Webhook 去重建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

插件超时控制

本专题围绕插件超时控制建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

Matrix 数量预算

本专题围绕Matrix 数量预算建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

Merge 冲突检测

本专题围绕Merge 冲突检测建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

Selector 变更审批

本专题围绕Selector 变更审批建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

模板字段校验

本专题围绕模板字段校验建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

删除级联保护

本专题围绕删除级联保护建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

Any Namespace RBAC

本专题围绕Any Namespace RBAC建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

Project Allowlist

本专题围绕Project Allowlist建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

Canary 批次设计

本专题围绕Canary 批次设计建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

RollingSync 失败暂停

本专题围绕RollingSync 失败暂停建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

发布回滚

本专题围绕发布回滚建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

控制器容量压测

本专题围绕控制器容量压测建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

API 限流监控

本专题围绕API 限流监控建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

仓库分支策略

本专题围绕仓库分支策略建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

Revision 固定

本专题围绕Revision 固定建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

资源跟踪核对

本专题围绕资源跟踪核对建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

多集群故障域

本专题围绕多集群故障域建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

租户模板发布

本专题围绕租户模板发布建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

附加组件分层

本专题围绕附加组件分层建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

外部决策资源

本专题围绕外部决策资源建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

状态条件判读

本专题围绕状态条件判读建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

升级兼容验收

本专题围绕升级兼容验收建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```

灾备恢复演练

本专题围绕灾备恢复演练建立可重复的操作流程。变更前先导出 ApplicationSet、Application 和 AppProject，记录当前 Git revision、生成数量与目标集群集合。所有命令在测试命名空间先执行，确认 dry-run 结果后再提交生产变更。

```bash
kubectl -n argocd get applicationset -o yaml
kubectl -n argocd get applications -o wide
kubectl -n argocd describe applicationset <name>
argocd appset generate <file.yaml> --loglevel debug
```

验收时同时查看控制器事件和生成 Application 状态。ApplicationSet 成功只代表集合计算成功，Application 还需要能够读取仓库、连接目标集群、渲染 manifest，并通过健康检查。若结果异常，先冻结 selector 或暂停同步，再收集日志，不要直接删除对象。

| 检查项 | 通过标准 | 失败处理 |
| --- | --- | --- |
| 输入集合 | 数量与审批单一致 | 回滚输入或 selector |
| 模板渲染 | 无缺失键和名称碰撞 | 修复 schema 后重试 |
| 权限边界 | project、repo、cluster 在 allowlist | 拒绝并通知 owner |
| 删除风险 | 删除集合为空或已确认 | 保留对象并暂停 |
| 发布状态 | 批次健康且 revision 正确 | 停止后续批次 |

故障复盘至少回答四个问题：哪个控制器首先发现异常；异常影响了多少 Application；是否发生了业务资源删除；怎样通过 Git 提交、策略或权限测试避免再次发生。复盘结论应更新 runbook 和 CI 校验，而不是只留下聊天记录。

```yaml
spec:
  goTemplate: true
  goTemplateOptions: [missingkey=error]
  syncPolicy:
    preserveResourcesOnDeletion: true
```
