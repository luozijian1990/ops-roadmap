# Argo CD 镜像自动化与渐进式交付学习笔记

## 第 1 章 · Image Updater 如何形成独立调谐链

### Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么

Argo CD 负责把 Git 中的期望状态调谐到集群，Argo CD Image Updater 负责发现符合策略的新镜像版本，并改变 Application 使用的镜像参数。它不是镜像构建器，也不验证业务功能；它连接的是“已存在的候选镜像”和“环境期望版本”。

```mermaid
flowchart LR
    CI[CI pipeline] -->|Push immutable image| Registry[OCI registry]
    Updater[Image Updater] -->|List tags and manifests| Registry
    Updater -->|Select candidate| Policy[Update policy]
    Policy -->|Write change| Git[Configuration repository]
    Git --> Argo[Argo CD]
    Argo --> Cluster[Target cluster]
```

它的控制边界包括：

- 哪些 Application 可以被匹配。
- 每个 Application 管理哪些镜像。
- 如何从 Registry 候选中选择版本。
- 用 Argo CD API 还是 Git 传播更新。
- 使用哪个 Registry 和 Git 凭据。

镜像扫描成功不等于可以发布。漏洞、签名、兼容性和审批等门禁应在候选进入生产配置前完成。若 Image Updater 只按时间选择“最新”而没有验证状态，它会把 Registry 的每次写入自动放大为环境变更。

#### 明确 Image Updater 的输入和输出契约

输入至少包括当前配置引用、Registry 候选集合、Tag 过滤规则、更新策略、凭据和目标 Application。输出应是一笔可审查的配置变更或明确的“无需更新”状态。

| 边界 | Image Updater 应负责 | 不应隐式负责 |
|---|---|---|
| 候选发现 | 查询允许的 Repository 和 Tag | 判断源码测试是否正确 |
| 候选过滤 | 应用 SemVer、Regex、平台等规则 | 绕过签名和漏洞策略 |
| 变更表达 | 更新拥有的镜像字段 | 修改无关 Values 或运行对象 |
| 写回 | 提交 Git 或更新受支持目标 | 失败时直接 Patch 生产集群 |
| 状态 | 报告扫描、选择和回写结果 | 把 Argo CD Sync 当作自身成功 |

为每个 Application 记录字段 Owner。CI 产生制品，Image Updater 提出镜像变更，审批者接受环境风险，Argo CD 调谐配置，Rollouts 控制流量；任何两个组件不应同时写同一字段。

验收时制造一个合规候选、一个不合规候选和 Registry 不可达。期望分别是提出变更、明确拒绝、保持当前版本并报告故障。

如果状态只能显示“Error”，还要补充 Registry、镜像别名、策略和最近成功扫描时间，值班人员才能安全决定重试还是暂停。

Image Updater 1.x 从 Application annotations 迁移到独立 `ImageUpdater` CRD。顶层可以定义公共更新和回写策略，`applicationRefs` 匹配 Application，再为每个镜像定义别名、名称和覆盖规则。

```yaml
apiVersion: argocd-image-updater.argoproj.io/v1alpha1
kind: ImageUpdater
metadata:
  name: checkout-production
  namespace: argocd
spec:
  commonUpdateSettings:
    updateStrategy: semver
    allowTags: 'regexp:^v[0-9]+\.[0-9]+\.[0-9]+$'
    ignoreTags:
      - latest
      - dev
  writeBackConfig:
    method: git
    gitConfig:
      branch: main
  applicationRefs:
    - namePattern: checkout-production
      images:
        - alias: checkout
          imageName: harbor.example.com/payments/checkout-api:2.8.4
```

示例仅说明对象关系，最终字段必须由集群已安装 CRD 验证。`spec.namespace` 已被移除，控制器使用 ImageUpdater 对象所在的 `metadata.namespace` 查找 Application。升级时若照搬旧文档，CRD 校验会直接拒绝。

旧 annotations 可以作为迁移输入，但不要把一套镜像策略同时写在 CRD 和 annotations 中而不理解优先级。迁移应先列出旧 Application、镜像别名、更新策略、凭据和回写方式，再逐应用切换并观察状态。

#### 逐应用迁移旧 Annotation 配置

迁移清单至少包含旧键、等价 CRD 字段、默认值差异和验证结果：

1. 导出 Application 上所有 Image Updater annotations。
2. 按镜像别名整理 Repository、策略、允许/忽略 Tag 和凭据。
3. 创建只匹配一个测试 Application 的 `ImageUpdater` 对象。
4. 暂停旧配置写入，避免两套配置同时管理字段。
5. 对比两套方式计算出的候选，不立即启用生产回写。
6. 启用测试回写并观察至少两个扫描周期。
7. 删除旧 annotations，再确认候选和状态不变。

迁移要特别检查默认更新策略、Namespace 发现范围、分支和回写文件。字段名字相似不代表默认行为相同。

如果新 CRD 无法表达某个历史行为，不应保留隐藏 Annotation 兜底。应明确选择调整流程、等待能力补齐或把该 Application 暂留旧模式，并记录退出条件。

批量迁移一次只扩大一个维度，例如同团队或同环境。用命中 Application 数量预算防止 `namePattern` 意外覆盖生产全集。

#### Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么的机制边界

建立输入、候选、变更、写回和状态契约，明确不负责构建验证、生产审批和直接流量控制。

- **Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

Tag 用于导航，Digest 才承担不可变身份；Index 与平台 Manifest 的关系必须在生产架构上展开验证。
证明、签名、扫描和制品应绑定同一内容身份，验证服务不可用要记为未知而不是自动放行。

#### Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么的静态检查模板

下面命令为“Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么
evidence_file="./evidence/check-fe1d0c4180.txt"
kubectl get imageupdater -A -o yaml | tee -a "${evidence_file}"
git log --oneline --decorate -n 5 | tee -a "${evidence_file}"
kubectl get applications.argoproj.io -A | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么的故障实验与恢复

“Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么”的可逆故障场景是：分别阻断 DNS、TLS、认证、Manifest 和 Blob，区分已运行 Pod 与新建 Pod 的影响，再以同一 Digest 恢复。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么”执行恢复策略：暂停发布和非必要重调度，从区域副本恢复同一 Digest，复验 Manifest、Blob、证明与拉取身份后再释放队列。
4. 重新采集“Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Image Updater 在 CI、Registry、Git 和 Argo CD 之间负责什么”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Registry 查询、Application 匹配和镜像别名如何关联

解释 ImageUpdater Namespace、ApplicationRefs、NamePattern、镜像别名和最终 Manifest 中镜像字段的匹配过程。

#### Registry 查询、Application 匹配和镜像别名如何关联的机制边界


- **Registry 查询、Application 匹配和镜像别名如何关联的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Registry 查询、Application 匹配和镜像别名如何关联的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Registry 查询、Application 匹配和镜像别名如何关联的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Registry 查询、Application 匹配和镜像别名如何关联的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

Tag 用于导航，Digest 才承担不可变身份；Index 与平台 Manifest 的关系必须在生产架构上展开验证。
证明、签名、扫描和制品应绑定同一内容身份，验证服务不可用要记为未知而不是自动放行。

#### Registry 查询、Application 匹配和镜像别名如何关联的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Registry 查询、Application 匹配和镜像别名如何关联` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Registry 查询、Application 匹配和镜像别名如何关联` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Registry 查询、Application 匹配和镜像别名如何关联` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Registry 查询、Application 匹配和镜像别名如何关联` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Registry 查询、Application 匹配和镜像别名如何关联”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Registry 查询、Application 匹配和镜像别名如何关联的静态检查模板

下面命令为“Registry 查询、Application 匹配和镜像别名如何关联”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Registry 查询、Application 匹配和镜像别名如何关联
evidence_file="./evidence/check-0e6e0de901.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Registry 查询、Application 匹配和镜像别名如何关联”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Registry 查询、Application 匹配和镜像别名如何关联的故障实验与恢复

“Registry 查询、Application 匹配和镜像别名如何关联”的可逆故障场景是：分别阻断 DNS、TLS、认证、Manifest 和 Blob，区分已运行 Pod 与新建 Pod 的影响，再以同一 Digest 恢复。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Registry 查询、Application 匹配和镜像别名如何关联”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Registry 查询、Application 匹配和镜像别名如何关联”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Registry 查询、Application 匹配和镜像别名如何关联”执行恢复策略：暂停发布和非必要重调度，从区域副本恢复同一 Digest，复验 Manifest、Blob、证明与拉取身份后再释放队列。
4. 重新采集“Registry 查询、Application 匹配和镜像别名如何关联”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Registry 查询、Application 匹配和镜像别名如何关联”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 控制器状态如何区分扫描、选择、写回和后续同步

为无候选、Registry 错误、Git 错误、Commit 已推送、Argo CD 未检测建立状态和查询矩阵。

#### 控制器状态如何区分扫描、选择、写回和后续同步的机制边界


- **控制器状态如何区分扫描、选择、写回和后续同步的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **控制器状态如何区分扫描、选择、写回和后续同步的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **控制器状态如何区分扫描、选择、写回和后续同步的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **控制器状态如何区分扫描、选择、写回和后续同步的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“控制器状态如何区分扫描、选择、写回和后续同步”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“控制器状态如何区分扫描、选择、写回和后续同步”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 控制器状态如何区分扫描、选择、写回和后续同步的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `控制器状态如何区分扫描、选择、写回和后续同步` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `控制器状态如何区分扫描、选择、写回和后续同步` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `控制器状态如何区分扫描、选择、写回和后续同步` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `控制器状态如何区分扫描、选择、写回和后续同步` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“控制器状态如何区分扫描、选择、写回和后续同步”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 控制器状态如何区分扫描、选择、写回和后续同步的静态检查模板

下面命令为“控制器状态如何区分扫描、选择、写回和后续同步”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 控制器状态如何区分扫描、选择、写回和后续同步
evidence_file="./evidence/check-907607ddd7.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“控制器状态如何区分扫描、选择、写回和后续同步”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 控制器状态如何区分扫描、选择、写回和后续同步的故障实验与恢复

“控制器状态如何区分扫描、选择、写回和后续同步”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“控制器状态如何区分扫描、选择、写回和后续同步”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“控制器状态如何区分扫描、选择、写回和后续同步”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“控制器状态如何区分扫描、选择、写回和后续同步”执行恢复策略：冻结后续变更并保留当前稳定状态，恢复版本化输入后等待控制器重新收敛，再用业务证据关闭事件。
4. 重新采集“控制器状态如何区分扫描、选择、写回和后续同步”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“控制器状态如何区分扫描、选择、写回和后续同步”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 如何从旧 Application Annotations 迁移到 1.x CRD

导出旧配置、映射字段、双算候选、单应用切换、删除旧写入入口并观察两个扫描周期。

#### 如何从旧 Application Annotations 迁移到 1.x CRD的机制边界


- **如何从旧 Application Annotations 迁移到 1.x CRD的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **如何从旧 Application Annotations 迁移到 1.x CRD的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **如何从旧 Application Annotations 迁移到 1.x CRD的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **如何从旧 Application Annotations 迁移到 1.x CRD的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“如何从旧 Application Annotations 迁移到 1.x CRD”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“如何从旧 Application Annotations 迁移到 1.x CRD”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 如何从旧 Application Annotations 迁移到 1.x CRD的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `如何从旧 Application Annotations 迁移到 1.x CRD` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `如何从旧 Application Annotations 迁移到 1.x CRD` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `如何从旧 Application Annotations 迁移到 1.x CRD` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `如何从旧 Application Annotations 迁移到 1.x CRD` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“如何从旧 Application Annotations 迁移到 1.x CRD”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 如何从旧 Application Annotations 迁移到 1.x CRD的静态检查模板

下面命令为“如何从旧 Application Annotations 迁移到 1.x CRD”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 如何从旧 Application Annotations 迁移到 1.x CRD
evidence_file="./evidence/check-ad9ffd4759.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“如何从旧 Application Annotations 迁移到 1.x CRD”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 如何从旧 Application Annotations 迁移到 1.x CRD的故障实验与恢复

“如何从旧 Application Annotations 迁移到 1.x CRD”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“如何从旧 Application Annotations 迁移到 1.x CRD”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“如何从旧 Application Annotations 迁移到 1.x CRD”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“如何从旧 Application Annotations 迁移到 1.x CRD”执行恢复策略：冻结后续变更并保留当前稳定状态，恢复版本化输入后等待控制器重新收敛，再用业务证据关闭事件。
4. 重新采集“如何从旧 Application Annotations 迁移到 1.x CRD”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“如何从旧 Application Annotations 迁移到 1.x CRD”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 2 章 · 更新策略和 Git Write-back 如何保持 Git 为事实来源

### SemVer、Newest Build、Digest 和 Alphabetical 如何选择

用固定候选仓库验证版本顺序、预发布、旧版本晚构建、可变 Tag 和空候选。

#### SemVer、Newest Build、Digest 和 Alphabetical 如何选择的机制边界


- **SemVer、Newest Build、Digest 和 Alphabetical 如何选择的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **SemVer、Newest Build、Digest 和 Alphabetical 如何选择的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **SemVer、Newest Build、Digest 和 Alphabetical 如何选择的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **SemVer、Newest Build、Digest 和 Alphabetical 如何选择的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

Tag 用于导航，Digest 才承担不可变身份；Index 与平台 Manifest 的关系必须在生产架构上展开验证。
证明、签名、扫描和制品应绑定同一内容身份，验证服务不可用要记为未知而不是自动放行。

#### SemVer、Newest Build、Digest 和 Alphabetical 如何选择的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `SemVer、Newest Build、Digest 和 Alphabetical 如何选择` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `SemVer、Newest Build、Digest 和 Alphabetical 如何选择` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `SemVer、Newest Build、Digest 和 Alphabetical 如何选择` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `SemVer、Newest Build、Digest 和 Alphabetical 如何选择` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“SemVer、Newest Build、Digest 和 Alphabetical 如何选择”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### SemVer、Newest Build、Digest 和 Alphabetical 如何选择的静态检查模板

下面命令为“SemVer、Newest Build、Digest 和 Alphabetical 如何选择”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: SemVer、Newest Build、Digest 和 Alphabetical 如何选择
evidence_file="./evidence/check-7e7876269d.txt"
kubectl get imageupdater -A -o yaml | tee -a "${evidence_file}"
git log --oneline --decorate -n 5 | tee -a "${evidence_file}"
kubectl get applications.argoproj.io -A | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“SemVer、Newest Build、Digest 和 Alphabetical 如何选择”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### SemVer、Newest Build、Digest 和 Alphabetical 如何选择的故障实验与恢复

“SemVer、Newest Build、Digest 和 Alphabetical 如何选择”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“SemVer、Newest Build、Digest 和 Alphabetical 如何选择”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“SemVer、Newest Build、Digest 和 Alphabetical 如何选择”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“SemVer、Newest Build、Digest 和 Alphabetical 如何选择”执行恢复策略：暂停镜像扫描或写回，恢复上一个配置 Commit，修正规则后用固定候选集双算，确认不会再次选择错误版本。
4. 重新采集“SemVer、Newest Build、Digest 和 Alphabetical 如何选择”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“SemVer、Newest Build、Digest 和 Alphabetical 如何选择”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### AllowTags、IgnoreTags 和平台约束如何缩小候选集合

策略回答“从可见镜像中选哪一个”，不是“这个镜像是否安全”。常见维度包括 SemVer、构建时间、字母排序、Digest、允许/忽略 Tag 和目标平台。

| 场景 | 推荐做法 | 主要风险 |
|---|---|---|
| 稳定发布 | SemVer + 明确范围 + 排除预发布 | 版本约束过宽跨大版本 |
| Commit SHA Tag | 由外部流程提交明确 Digest | 字符串排序没有时间语义 |
| 固定渠道 Tag | Digest 策略观察内容变化 | Git 难以直观看出业务版本 |
| 多架构镜像 | 验证 Image Index 和目标平台 | 只发布一个架构导致部分节点失败 |

不要把 `latest` 当生产候选选择。即使 Digest 策略能发现 `latest` 内容变化，这种变化仍缺少版本语义和审核上下文。更好的做法是构建生成不可变候选，再让配置变更明确记录旧、新 Digest。

#### 为更新策略建立候选测试集

准备稳定版、预发布版、主版本升级、旧 Tag 重推、缺失平台和签名失败六类样本。每次策略变更都输出完整候选集合和最终选择。

| 策略 | 必测风险 | 期望保护 |
|---|---|---|
| SemVer | 是否跨主版本、是否含预发布 | 只在声明范围内升级 |
| Newest Build | 旧版本晚构建 | 不把构建时间误当版本顺序 |
| Digest | 可变 Tag 内容变化 | 发现变化但仍经过审核 |
| Alphabetical | 命名不统一 | 只用于有固定排序语义的 Tag |

候选为空时保持当前配置；候选多于预期时报告策略过宽；当前版本不符合新规则时进入人工迁移。三种异常都不能自动选择“看起来最近”的镜像。

Regex 要测试拒绝集合，SemVer 要测试边界版本，Digest 模式要测试 Tag 重推审计。测试数据固定在专用 Repository，避免生产 Registry 的新推送让结果不确定。

生产启用前把旧、新 Digest、策略版本和候选列表写进变更记录，便于解释为什么这个版本被选中。

#### AllowTags、IgnoreTags 和平台约束如何缩小候选集合的机制边界

测试 Regex 接受/拒绝、平台 Manifest 完整性、当前版本不合规和策略变更迁移。

- **AllowTags、IgnoreTags 和平台约束如何缩小候选集合的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **AllowTags、IgnoreTags 和平台约束如何缩小候选集合的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **AllowTags、IgnoreTags 和平台约束如何缩小候选集合的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **AllowTags、IgnoreTags 和平台约束如何缩小候选集合的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“AllowTags、IgnoreTags 和平台约束如何缩小候选集合”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“AllowTags、IgnoreTags 和平台约束如何缩小候选集合”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### AllowTags、IgnoreTags 和平台约束如何缩小候选集合的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `AllowTags、IgnoreTags 和平台约束如何缩小候选集合` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `AllowTags、IgnoreTags 和平台约束如何缩小候选集合` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `AllowTags、IgnoreTags 和平台约束如何缩小候选集合` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `AllowTags、IgnoreTags 和平台约束如何缩小候选集合` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“AllowTags、IgnoreTags 和平台约束如何缩小候选集合”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### AllowTags、IgnoreTags 和平台约束如何缩小候选集合的静态检查模板

下面命令为“AllowTags、IgnoreTags 和平台约束如何缩小候选集合”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: AllowTags、IgnoreTags 和平台约束如何缩小候选集合
evidence_file="./evidence/check-359da4f758.txt"
kubectl get imageupdater -A -o yaml | tee -a "${evidence_file}"
git log --oneline --decorate -n 5 | tee -a "${evidence_file}"
kubectl get applications.argoproj.io -A | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“AllowTags、IgnoreTags 和平台约束如何缩小候选集合”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### AllowTags、IgnoreTags 和平台约束如何缩小候选集合的故障实验与恢复

“AllowTags、IgnoreTags 和平台约束如何缩小候选集合”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“AllowTags、IgnoreTags 和平台约束如何缩小候选集合”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“AllowTags、IgnoreTags 和平台约束如何缩小候选集合”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“AllowTags、IgnoreTags 和平台约束如何缩小候选集合”执行恢复策略：暂停镜像扫描或写回，恢复上一个配置 Commit，修正规则后用固定候选集双算，确认不会再次选择错误版本。
4. 重新采集“AllowTags、IgnoreTags 和平台约束如何缩小候选集合”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“AllowTags、IgnoreTags 和平台约束如何缩小候选集合”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Git Write-back 如何处理分支、路径、PR 和受保护仓库

Image Updater 支持直接修改 Application 参数和 Git Write-back。前者适合临时或命令式管理的 Application，后者更符合版本化事实来源。若 Application 自身由 Git 管理，直接修改集群对象可能被下一次同步覆盖。

Git Write-back 的关键步骤是：读取 Repository 和 Target Revision、检出分支、更新目标文件、创建 Commit、推送，再由 Argo CD 观察新 Revision。生产环境通常还需要 Pull Request 和审批，而不是让控制器直接写受保护分支。

凭据应独立于人工账号，并限制到目标仓库。回写 Commit 建议包含：Application、镜像别名、旧/新 Digest、选择策略和 ImageUpdater 对象。发生冲突时应停止并告警，不能强制覆盖其他发布变更。

回写文件也要有明确 Owner。若 Helm Values、Kustomize Image 和 `.argocd-source-<app>.yaml` 同时覆盖镜像，最终值取决于渲染优先级，Git Diff 很难说明实际部署内容。应只保留一个正式入口，并在 CI 中渲染最终 Manifest 验证目标 Digest。

受保护分支环境可以让 Image Updater 创建 Pull Request。PR 检查应展示旧/新 Digest、版本差异、签名和扫描状态，并限制机器人自行批准。紧急撤销候选时，关闭未合并 PR、暂停匹配的 ImageUpdater，并撤销 Registry Tag 或策略资格。

验证回写链路时不要使用生产 Repository。先在测试 Application 中制造一个新候选，确认状态记录、Commit 作者、分支、目标文件、Argo CD 检测延迟和最终渲染；再逐环境启用。

#### 验证回写没有制造双重事实来源

回写成功后依次检查：

1. 机器人 Commit 位于预期分支，作者和签名符合策略。
2. 只修改目标镜像字段，没有重排或覆盖人工配置。
3. 提交信息含旧、新 Digest、Application 和策略。
4. Argo CD 实际读取该分支与路径，并渲染出新 Digest。
5. 运行态只由 Argo CD 改变，不存在 Image Updater 直接 Patch。
6. 重扫时识别当前版本，不重复创建等价 Commit。

保护分支要求 PR 时，Image Updater 的成功状态应是“提案已创建”，而不是“生产已更新”。审批、合并、Sync 和业务接受分别由后续系统记录。

制造 Git 冲突验证机器人只重读并更新拥有字段。若无法安全合并，就保持当前版本并请求人工处理，不能强推覆盖。

撤销回写用新的 Revert 或替代 Commit 保留历史。删除机器人 Commit 或手工修改运行对象都会破坏审计链。

#### Git Write-back 如何处理分支、路径、PR 和受保护仓库的机制边界

给出直接 Commit 与 PR 两种完整流程、机器人最小权限、Commit Schema 和最终渲染验证。

- **Git Write-back 如何处理分支、路径、PR 和受保护仓库的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Git Write-back 如何处理分支、路径、PR 和受保护仓库的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Git Write-back 如何处理分支、路径、PR 和受保护仓库的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Git Write-back 如何处理分支、路径、PR 和受保护仓库的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

写入者必须声明字段所有权、目标分支和冲突策略，远端 HEAD 变化后重新计算而不是覆盖。
Commit 已产生但本地状态丢失时先按变更 ID 查重，避免同一候选生成重复提交或 PR。

#### Git Write-back 如何处理分支、路径、PR 和受保护仓库的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Git Write-back 如何处理分支、路径、PR 和受保护仓库` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Git Write-back 如何处理分支、路径、PR 和受保护仓库` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Git Write-back 如何处理分支、路径、PR 和受保护仓库` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Git Write-back 如何处理分支、路径、PR 和受保护仓库` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Git Write-back 如何处理分支、路径、PR 和受保护仓库”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Git Write-back 如何处理分支、路径、PR 和受保护仓库的静态检查模板

下面命令为“Git Write-back 如何处理分支、路径、PR 和受保护仓库”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Git Write-back 如何处理分支、路径、PR 和受保护仓库
evidence_file="./evidence/check-59820a14ef.txt"
kubectl get imageupdater -A -o yaml | tee -a "${evidence_file}"
git log --oneline --decorate -n 5 | tee -a "${evidence_file}"
kubectl get applications.argoproj.io -A | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Git Write-back 如何处理分支、路径、PR 和受保护仓库”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Git Write-back 如何处理分支、路径、PR 和受保护仓库的故障实验与恢复

“Git Write-back 如何处理分支、路径、PR 和受保护仓库”的可逆故障场景是：制造远端 HEAD 前移与重复变更 ID，验证机器人重新读取、重算并去重；禁止强制覆盖受保护分支。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Git Write-back 如何处理分支、路径、PR 和受保护仓库”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Git Write-back 如何处理分支、路径、PR 和受保护仓库”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Git Write-back 如何处理分支、路径、PR 和受保护仓库”执行恢复策略：冻结新的写回，按变更 ID 查找已存在的 Commit 或 PR，重新读取远端 HEAD 后重算；错误提交使用显式 Revert。
4. 重新采集“Git Write-back 如何处理分支、路径、PR 和受保护仓库”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Git Write-back 如何处理分支、路径、PR 和受保护仓库”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 并发冲突、状态丢失和错误候选如何恢复

用变更 ID 去重，处理远端 HEAD 变化、Commit 已存在但状态丢失、Revert 后候选被再次选择。

#### 并发冲突、状态丢失和错误候选如何恢复的机制边界


- **并发冲突、状态丢失和错误候选如何恢复的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **并发冲突、状态丢失和错误候选如何恢复的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **并发冲突、状态丢失和错误候选如何恢复的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **并发冲突、状态丢失和错误候选如何恢复的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

写入者必须声明字段所有权、目标分支和冲突策略，远端 HEAD 变化后重新计算而不是覆盖。
Commit 已产生但本地状态丢失时先按变更 ID 查重，避免同一候选生成重复提交或 PR。

#### 并发冲突、状态丢失和错误候选如何恢复的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `并发冲突、状态丢失和错误候选如何恢复` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `并发冲突、状态丢失和错误候选如何恢复` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `并发冲突、状态丢失和错误候选如何恢复` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `并发冲突、状态丢失和错误候选如何恢复` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“并发冲突、状态丢失和错误候选如何恢复”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 并发冲突、状态丢失和错误候选如何恢复的静态检查模板

下面命令为“并发冲突、状态丢失和错误候选如何恢复”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 并发冲突、状态丢失和错误候选如何恢复
evidence_file="./evidence/check-ed8d4873bb.txt"
kubectl get imageupdater -A -o yaml | tee -a "${evidence_file}"
git log --oneline --decorate -n 5 | tee -a "${evidence_file}"
kubectl get applications.argoproj.io -A | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“并发冲突、状态丢失和错误候选如何恢复”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 并发冲突、状态丢失和错误候选如何恢复的故障实验与恢复

“并发冲突、状态丢失和错误候选如何恢复”的可逆故障场景是：制造远端 HEAD 前移与重复变更 ID，验证机器人重新读取、重算并去重；禁止强制覆盖受保护分支。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“并发冲突、状态丢失和错误候选如何恢复”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“并发冲突、状态丢失和错误候选如何恢复”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“并发冲突、状态丢失和错误候选如何恢复”执行恢复策略：冻结新的写回，按变更 ID 查找已存在的 Commit 或 PR，重新读取远端 HEAD 后重算；错误提交使用显式 Revert。
4. 重新采集“并发冲突、状态丢失和错误候选如何恢复”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“并发冲突、状态丢失和错误候选如何恢复”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 3 章 · Argo Rollouts 如何接管工作负载与版本生命周期

### Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联

Application、AppProject 和基础同步模型参见 [Argo CD 基础、架构与 Application](01-foundations-architecture-and-applications.md)；本册从 Rollout 接管工作负载之后的版本和流量关系开始。

Argo Rollouts 的 BlueGreen 策略同时维护旧稳定 ReplicaSet 和新预览 ReplicaSet。Active Service 选择稳定版本并承载生产流量，Preview Service 选择新版本供验证。晋级时控制器改变 Active Service Selector，使生产流量切到新 ReplicaSet。

```mermaid
flowchart TB
    Client[Production clients] --> Active[Active Service]
    Tester[Preview checks] --> Preview[Preview Service]
    Active --> Stable[Stable ReplicaSet]
    Preview --> New[Preview ReplicaSet]
    Controller[Rollouts controller] -->|Manage selectors| Active
    Controller -->|Manage selectors| Preview
```

Service Selector 切换很快，但现有连接、Ingress 缓存、数据平面传播和外部负载均衡可能延迟。因此旧 ReplicaSet 不能在切换瞬间立即删除，`scaleDownDelaySeconds` 为传播和快速回退保留窗口。

#### 从选择器验证真实流量路径

蓝绿排障从 Service Selector 开始，而不是先重启 Pod：

1. 读取 Rollout 的 StableRS、CurrentPodHash 和 Phase。
2. 对比 Active 与 Preview Service 的 Selector。
3. 查询 EndpointSlice，确认地址来自对应 ReplicaSet 且 Ready。
4. 检查 Ingress、Gateway 或负载均衡器实际引用哪个 Service。
5. 分别向生产入口和 Preview 入口发送带版本回显的请求。
6. 在切换后持续观察旧版本连接与新建连接。

若 Service Selector 已更新而真实请求仍到旧版本，问题位于数据面传播、连接复用或上游缓存。继续 Promote 或重建 ReplicaSet 不会解决这类问题。

版本回显可以来自响应 Header、日志字段或 Trace Resource，不能只看 Pod 数量推测流量。测试结束要确认调试 Header 不泄漏内部敏感信息。

记录选择器切换、EndpointSlice 更新和最后一条旧版本请求的时间差，用实测结果设置 `scaleDownDelaySeconds`，而不是照搬示例值。

#### Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联的机制边界

画出 OwnerReference、Pod Template Hash、StableRS、CurrentPodHash 和数据面资源关系。

- **Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联”，查询值必须连同时间窗口、样本数和 Provider 状态解释，空值不能自动当作零。
对于“Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联”，业务失败、观测故障和数据不足要进入不同状态，且每种状态只能对应一个默认动作。

#### Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联的静态检查模板

下面命令为“Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联
evidence_file="./evidence/check-d0c0ddc940.txt"
kubectl get analysisrun -n demo -o wide | tee -a "${evidence_file}"
kubectl describe analysisrun -n demo | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联的故障实验与恢复

“Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联”的可逆故障场景是：依次返回空 Vector、多 Series、NaN 和超时，确认业务失败、数据不足与 Provider 错误不会被混为一类。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联”执行恢复策略：暂停自动晋级并保持稳定版本，修复查询或观测链后重放同一时间窗口；缺失数据不得补写为零。
4. 重新采集“Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Rollout、ReplicaSet、Service、AnalysisRun 和路由对象如何关联”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 从 Deployment 迁移到 Rollout 需要检查哪些不变量

覆盖 Selector、Service、HPA、PDB、探针、历史版本、暂停窗口和回退入口。

#### 从 Deployment 迁移到 Rollout 需要检查哪些不变量的机制边界


- **从 Deployment 迁移到 Rollout 需要检查哪些不变量的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **从 Deployment 迁移到 Rollout 需要检查哪些不变量的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **从 Deployment 迁移到 Rollout 需要检查哪些不变量的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **从 Deployment 迁移到 Rollout 需要检查哪些不变量的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“从 Deployment 迁移到 Rollout 需要检查哪些不变量”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“从 Deployment 迁移到 Rollout 需要检查哪些不变量”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 从 Deployment 迁移到 Rollout 需要检查哪些不变量的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `从 Deployment 迁移到 Rollout 需要检查哪些不变量` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `从 Deployment 迁移到 Rollout 需要检查哪些不变量` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `从 Deployment 迁移到 Rollout 需要检查哪些不变量` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `从 Deployment 迁移到 Rollout 需要检查哪些不变量` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“从 Deployment 迁移到 Rollout 需要检查哪些不变量”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 从 Deployment 迁移到 Rollout 需要检查哪些不变量的静态检查模板

下面命令为“从 Deployment 迁移到 Rollout 需要检查哪些不变量”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 从 Deployment 迁移到 Rollout 需要检查哪些不变量
evidence_file="./evidence/check-75035ff7cd.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“从 Deployment 迁移到 Rollout 需要检查哪些不变量”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 从 Deployment 迁移到 Rollout 需要检查哪些不变量的故障实验与恢复

“从 Deployment 迁移到 Rollout 需要检查哪些不变量”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“从 Deployment 迁移到 Rollout 需要检查哪些不变量”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“从 Deployment 迁移到 Rollout 需要检查哪些不变量”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“从 Deployment 迁移到 Rollout 需要检查哪些不变量”执行恢复策略：暂停步骤并确保稳定版本容量，执行 Abort 或切回后持续检查 Endpoint、代理配置、版本回显与异步副作用。
4. 重新采集“从 Deployment 迁移到 Rollout 需要检查哪些不变量”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“从 Deployment 迁移到 Rollout 需要检查哪些不变量”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 控制器、CLI、Dashboard 和通知分别提供什么证据

区分 API 接受、控制器推进、可视化和通知，不把 CLI 命令成功当成数据面完成。

#### 控制器、CLI、Dashboard 和通知分别提供什么证据的机制边界


- **控制器、CLI、Dashboard 和通知分别提供什么证据的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **控制器、CLI、Dashboard 和通知分别提供什么证据的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **控制器、CLI、Dashboard 和通知分别提供什么证据的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **控制器、CLI、Dashboard 和通知分别提供什么证据的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“控制器、CLI、Dashboard 和通知分别提供什么证据”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“控制器、CLI、Dashboard 和通知分别提供什么证据”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 控制器、CLI、Dashboard 和通知分别提供什么证据的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `控制器、CLI、Dashboard 和通知分别提供什么证据` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `控制器、CLI、Dashboard 和通知分别提供什么证据` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `控制器、CLI、Dashboard 和通知分别提供什么证据` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `控制器、CLI、Dashboard 和通知分别提供什么证据` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“控制器、CLI、Dashboard 和通知分别提供什么证据”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 控制器、CLI、Dashboard 和通知分别提供什么证据的静态检查模板

下面命令为“控制器、CLI、Dashboard 和通知分别提供什么证据”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 控制器、CLI、Dashboard 和通知分别提供什么证据
evidence_file="./evidence/check-aad3f1f484.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“控制器、CLI、Dashboard 和通知分别提供什么证据”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 控制器、CLI、Dashboard 和通知分别提供什么证据的故障实验与恢复

“控制器、CLI、Dashboard 和通知分别提供什么证据”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“控制器、CLI、Dashboard 和通知分别提供什么证据”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“控制器、CLI、Dashboard 和通知分别提供什么证据”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“控制器、CLI、Dashboard 和通知分别提供什么证据”执行恢复策略：冻结后续变更并保留当前稳定状态，恢复版本化输入后等待控制器重新收敛，再用业务证据关闭事件。
4. 重新采集“控制器、CLI、Dashboard 和通知分别提供什么证据”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“控制器、CLI、Dashboard 和通知分别提供什么证据”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复

解释旧 ReplicaSet 保留、快速回退窗口、镜像可取得性和超出窗口后的重新扩容成本。

#### Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复的机制边界


- **Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复的静态检查模板

下面命令为“Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复
evidence_file="./evidence/check-21bf95bd2a.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复的故障实验与恢复

“Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复”执行恢复策略：暂停步骤并确保稳定版本容量，执行 Abort 或切回后持续检查 Endpoint、代理配置、版本回显与异步副作用。
4. 重新采集“Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Rollout 历史、Revision 和 Rollback Window 如何支持快速恢复”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 4 章 · 蓝绿发布如何验证预览并完成流量切换

### Active Service、Preview Service 和两个 ReplicaSet 如何协作

提供两个 Service、完整 Rollout 和标签/Selector 清单，验证 EndpointSlice 与真实版本回显。

#### Active Service、Preview Service 和两个 ReplicaSet 如何协作的机制边界


- **Active Service、Preview Service 和两个 ReplicaSet 如何协作的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Active Service、Preview Service 和两个 ReplicaSet 如何协作的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Active Service、Preview Service 和两个 ReplicaSet 如何协作的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Active Service、Preview Service 和两个 ReplicaSet 如何协作的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“Active Service、Preview Service 和两个 ReplicaSet 如何协作”，控制器中的目标权重只是意图，必须继续检查 Service、Endpoint、代理配置和真实请求分布。
对于“Active Service、Preview Service 和两个 ReplicaSet 如何协作”，旧连接、会话粘性、异步消费者和缓存可能在切换后继续产生副作用，不能只看 Rollout Phase。

#### Active Service、Preview Service 和两个 ReplicaSet 如何协作的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Active Service、Preview Service 和两个 ReplicaSet 如何协作` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Active Service、Preview Service 和两个 ReplicaSet 如何协作` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Active Service、Preview Service 和两个 ReplicaSet 如何协作` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Active Service、Preview Service 和两个 ReplicaSet 如何协作` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Active Service、Preview Service 和两个 ReplicaSet 如何协作”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Active Service、Preview Service 和两个 ReplicaSet 如何协作的静态检查模板

下面命令为“Active Service、Preview Service 和两个 ReplicaSet 如何协作”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Active Service、Preview Service 和两个 ReplicaSet 如何协作
evidence_file="./evidence/check-f9203471ab.txt"
kubectl get rollout,svc,endpointslice -n demo -o wide | tee -a "${evidence_file}"
kubectl get httproute,ingress,virtualservice -n demo 2>/dev/null | tee -a "${evidence_file}"
for i in {1..50}; do curl -fsS https://demo.example/version; done | sort | uniq -c | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Active Service、Preview Service 和两个 ReplicaSet 如何协作”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Active Service、Preview Service 和两个 ReplicaSet 如何协作的故障实验与恢复

“Active Service、Preview Service 和两个 ReplicaSet 如何协作”的可逆故障场景是：延迟或阻断路由控制器更新，持续采样真实版本回显；只有数据面恢复稳定后才允许关闭事件。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Active Service、Preview Service 和两个 ReplicaSet 如何协作”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Active Service、Preview Service 和两个 ReplicaSet 如何协作”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Active Service、Preview Service 和两个 ReplicaSet 如何协作”执行恢复策略：暂停步骤并确保稳定版本容量，执行 Abort 或切回后持续检查 Endpoint、代理配置、版本回显与异步副作用。
4. 重新采集“Active Service、Preview Service 和两个 ReplicaSet 如何协作”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Active Service、Preview Service 和两个 ReplicaSet 如何协作”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Preview 容量、预热和依赖隔离如何设计

计算 CPU、内存、连接池、缓存、许可证和后台消费者的双版本预算。

#### Preview 容量、预热和依赖隔离如何设计的机制边界


- **Preview 容量、预热和依赖隔离如何设计的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Preview 容量、预热和依赖隔离如何设计的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Preview 容量、预热和依赖隔离如何设计的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Preview 容量、预热和依赖隔离如何设计的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“Preview 容量、预热和依赖隔离如何设计”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“Preview 容量、预热和依赖隔离如何设计”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### Preview 容量、预热和依赖隔离如何设计的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Preview 容量、预热和依赖隔离如何设计` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Preview 容量、预热和依赖隔离如何设计` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Preview 容量、预热和依赖隔离如何设计` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Preview 容量、预热和依赖隔离如何设计` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Preview 容量、预热和依赖隔离如何设计”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Preview 容量、预热和依赖隔离如何设计的静态检查模板

下面命令为“Preview 容量、预热和依赖隔离如何设计”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Preview 容量、预热和依赖隔离如何设计
evidence_file="./evidence/check-0d95a3860f.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Preview 容量、预热和依赖隔离如何设计”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Preview 容量、预热和依赖隔离如何设计的故障实验与恢复

“Preview 容量、预热和依赖隔离如何设计”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Preview 容量、预热和依赖隔离如何设计”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Preview 容量、预热和依赖隔离如何设计”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Preview 容量、预热和依赖隔离如何设计”执行恢复策略：停止后续环境和集群批次，保持已验证区域不变，回退当前批次并完成临时资源、DNS 与权限清理。
4. 重新采集“Preview 容量、预热和依赖隔离如何设计”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Preview 容量、预热和依赖隔离如何设计”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### PrePromotion 和 PostPromotion 应分别验证什么

PrePromotion Analysis 在生产流量切换前运行，适合验证预览端点、Schema 兼容、依赖连接和合成交易。PostPromotion Analysis 在切换后观察真实流量，适合验证错误率、延迟和业务 KPI。

| 阶段 | 可观察对象 | 失败动作 |
|---|---|---|
| PrePromotion | Preview Service、新 Pod、只读依赖 | 不切生产流量，Abort 新版本 |
| Promotion | Active Service Selector 和数据平面 | 验证传播，保留旧 ReplicaSet |
| PostPromotion | 真实请求、业务和依赖指标 | 切回旧稳定版本并停止新流量 |

预览成功不能证明生产成功，因为预览流量规模、身份和缓存与生产不同。PostPromotion 也不是无限观察；应定义窗口，过长会占用双倍容量，过短则看不到慢性问题。

PrePromotion 测试必须避免产生不可撤销副作用。支付、消息发送和外部写入应使用沙箱账户、幂等键或只读探测。若预览版本与稳定版本共享数据库，测试数据还要能被识别和清理。

PostPromotion 失败后控制器可以切回旧 ReplicaSet，但已经产生的业务副作用不会自动撤销。运行手册应列出需要人工补偿的数据和外部系统。

#### 为两阶段分析准备不同测试账户

PrePromotion 使用隔离身份和可清理数据，重点证明新版本能够启动、连接依赖并完成关键协议。PostPromotion 使用真实流量指标，重点判断用户影响和共享系统行为。

| 检查 | PrePromotion | PostPromotion |
|---|---|---|
| 请求入口 | Preview Service 或专用路由 | Active 生产入口 |
| 数据 | 沙箱、只读或带测试标记 | 真实业务数据 |
| 容量结论 | 受 Preview 副本限制 | 接近真实流量行为 |
| 失败止损 | 不切流并删除新版本 | 切回旧版本并检查副作用 |
| 证据 | 合成请求与依赖检查 | SLI、日志、Trace 和业务 KPI |

测试账户必须具有与真实用户足够接近的授权路径，同时不能触发不可逆交易。过度简化的 `/healthz` 只能证明进程响应，不能代替完整业务路径。

PostPromotion 查询要带版本或路由维度，避免 Stable 的大量成功请求稀释新版本错误。切回后继续观察一段时间，确认积压和异步副作用没有延迟出现。

每个 Step 都应有目的，而不是机械使用 10%、30%、60%。

| 阶段 | 目的 | 典型证据 |
|---|---|---|
| 0% | 启动、预热、内部测试 | Pod、探针、依赖、合成请求 |
| 1%-5% | 发现明显兼容和启动问题 | 错误率、日志、资源异常 |
| 10%-30% | 比较稳定版和新版本 | 延迟、业务 KPI、依赖差异 |
| 50% | 验证接近真实容量 | HPA、饱和度、缓存和队列 |
| 100% | 完成替换前观察 | 全量 SLO、旧版本回退窗口 |

低流量业务可能长时间收集不到足够样本，固定等待 10 分钟没有统计意义。可以延长窗口、使用合成流量或设置最低请求量门禁，但不能为了自动化伪造成功结论。

#### 为每个 Step 写退出契约

一个 Step 至少包含进入条件、目标流量、容量、最短与最长时间、必要成功、硬失败和超时动作。

示例：10% 步骤要求 Canary 两个 Ready Pod，至少 1000 个请求，连续三个窗口成功率不低于 99.5%，P95 相对 Stable 退化不超过 10%；任一数据一致性错误立即 Abort；20 分钟样本仍不足则转人工判断。

进入下一步前保存：

- 实际 Stable/Canary 请求量和流量比例。
- 当前 ReplicaSet、Pod 与镜像 Digest。
- 每个 Measurement 的值、Phase 和时间。
- 人工 Promote 或例外的身份与理由。
- 下一步容量是否已经准备好。

步骤数量不是越多越安全。每一步都增加双版本时间和操作复杂度；没有新增风险信息的相邻权重可以合并。

根据历史故障调整步骤：启动类故障在低权重暴露，容量类故障需要较高权重，慢性内存泄漏可能需要延长全量后的观察。策略应反映真实风险模型。

#### PrePromotion 和 PostPromotion 应分别验证什么的机制边界

区分 Preview 合成测试与真实流量指标，设计测试账户、幂等键、数据清理和失败动作。

- **PrePromotion 和 PostPromotion 应分别验证什么的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **PrePromotion 和 PostPromotion 应分别验证什么的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **PrePromotion 和 PostPromotion 应分别验证什么的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **PrePromotion 和 PostPromotion 应分别验证什么的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“PrePromotion 和 PostPromotion 应分别验证什么”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“PrePromotion 和 PostPromotion 应分别验证什么”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### PrePromotion 和 PostPromotion 应分别验证什么的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `PrePromotion 和 PostPromotion 应分别验证什么` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `PrePromotion 和 PostPromotion 应分别验证什么` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `PrePromotion 和 PostPromotion 应分别验证什么` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `PrePromotion 和 PostPromotion 应分别验证什么` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“PrePromotion 和 PostPromotion 应分别验证什么”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### PrePromotion 和 PostPromotion 应分别验证什么的静态检查模板

下面命令为“PrePromotion 和 PostPromotion 应分别验证什么”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: PrePromotion 和 PostPromotion 应分别验证什么
evidence_file="./evidence/check-53fc273200.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“PrePromotion 和 PostPromotion 应分别验证什么”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### PrePromotion 和 PostPromotion 应分别验证什么的故障实验与恢复

“PrePromotion 和 PostPromotion 应分别验证什么”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“PrePromotion 和 PostPromotion 应分别验证什么”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“PrePromotion 和 PostPromotion 应分别验证什么”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“PrePromotion 和 PostPromotion 应分别验证什么”执行恢复策略：冻结后续变更并保留当前稳定状态，恢复版本化输入后等待控制器重新收敛，再用业务证据关闭事件。
4. 重新采集“PrePromotion 和 PostPromotion 应分别验证什么”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“PrePromotion 和 PostPromotion 应分别验证什么”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Promote、Abort 和切回旧版本如何验证数据面生效

保存 Selector、EndpointSlice、旧连接、真实请求和业务指标前后快照，以实测传播时间设置缩容延迟。

#### Promote、Abort 和切回旧版本如何验证数据面生效的机制边界


- **Promote、Abort 和切回旧版本如何验证数据面生效的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Promote、Abort 和切回旧版本如何验证数据面生效的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Promote、Abort 和切回旧版本如何验证数据面生效的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Promote、Abort 和切回旧版本如何验证数据面生效的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“Promote、Abort 和切回旧版本如何验证数据面生效”，控制器中的目标权重只是意图，必须继续检查 Service、Endpoint、代理配置和真实请求分布。
对于“Promote、Abort 和切回旧版本如何验证数据面生效”，旧连接、会话粘性、异步消费者和缓存可能在切换后继续产生副作用，不能只看 Rollout Phase。

#### Promote、Abort 和切回旧版本如何验证数据面生效的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Promote、Abort 和切回旧版本如何验证数据面生效` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Promote、Abort 和切回旧版本如何验证数据面生效` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Promote、Abort 和切回旧版本如何验证数据面生效` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Promote、Abort 和切回旧版本如何验证数据面生效` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Promote、Abort 和切回旧版本如何验证数据面生效”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Promote、Abort 和切回旧版本如何验证数据面生效的静态检查模板

下面命令为“Promote、Abort 和切回旧版本如何验证数据面生效”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Promote、Abort 和切回旧版本如何验证数据面生效
evidence_file="./evidence/check-5a7552319a.txt"
kubectl get rollout,svc,endpointslice -n demo -o wide | tee -a "${evidence_file}"
kubectl get httproute,ingress,virtualservice -n demo 2>/dev/null | tee -a "${evidence_file}"
for i in {1..50}; do curl -fsS https://demo.example/version; done | sort | uniq -c | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Promote、Abort 和切回旧版本如何验证数据面生效”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Promote、Abort 和切回旧版本如何验证数据面生效的故障实验与恢复

“Promote、Abort 和切回旧版本如何验证数据面生效”的可逆故障场景是：延迟或阻断路由控制器更新，持续采样真实版本回显；只有数据面恢复稳定后才允许关闭事件。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Promote、Abort 和切回旧版本如何验证数据面生效”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Promote、Abort 和切回旧版本如何验证数据面生效”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Promote、Abort 和切回旧版本如何验证数据面生效”执行恢复策略：暂停步骤并确保稳定版本容量，执行 Abort 或切回后持续检查 Endpoint、代理配置、版本回显与异步副作用。
4. 重新采集“Promote、Abort 和切回旧版本如何验证数据面生效”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Promote、Abort 和切回旧版本如何验证数据面生效”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 5 章 · 金丝雀发布如何逐步增加风险暴露

### 无 Traffic Manager 时副本比例为何不等于请求比例

没有 Traffic Manager 时，Rollouts 通过新旧 ReplicaSet 副本数量近似 `setWeight`。10 个总副本下 10% 可以对应 1 个 Canary Pod；3 个副本下 10% 无法精确表示，控制器只能选择误差较小的整数。

这种模式假设 Kubernetes Service 在 Pod 间近似均匀分配新连接，但长连接、客户端连接池、请求耗时和会话粘性都会让真实请求比例偏离副本比例。

```yaml
strategy:
  canary:
    maxSurge: 25%
    maxUnavailable: 0
    steps:
      - setWeight: 10
      - pause:
          duration: 10m
      - setWeight: 30
      - pause: {}
      - setWeight: 60
      - pause:
          duration: 20m
```

无 `duration` 的 Pause 会一直等待，直到人工 Promote 或其他自动步骤解除。它适合需要人工判读的阶段，但必须设置通知和超时升级，否则发布可能长期占用双版本容量。

#### 用实际请求校准副本权重

在每个权重步骤同时记录 Stable/Canary 副本、Ready Endpoint、新建连接、请求数和每 Pod QPS。对比声明权重、理论副本比例和真实请求比例。

| 偏差现象 | 可能原因 | 验证方式 |
|---|---|---|
| Canary 请求远低于副本比例 | 长连接或会话粘性 | 强制新连接并查客户端池 |
| Canary 单 Pod QPS 更高 | 副本取整或 Ready 数不足 | 对比 Endpoint 与实际权重 |
| 权重变化后长时间不稳定 | HPA 与 Rollout 同时缩放 | 查期望/实际副本时间线 |
| 只有部分路径进入 Canary | 多入口或路由规则差异 | 按 Route、Host 分组请求 |

低副本数应用要预先计算可表示权重。例如 3 个副本无法稳定表达 10%，此时把步骤写成 10% 只是意图，不是数据面事实。

若真实比例偏差足以影响统计结论，应接入 Traffic Manager、增加副本或改用合成请求。不能继续用错误分母判断 Canary 质量。

观察窗口结束时保存实际样本量和偏差，作为下一次步骤时长与容量的输入。

接入 NGINX、Istio、Traefik 或 Gateway API 插件后，Rollouts 可以把流量权重写入数据平面，而不是只靠副本数量。这样少量 Canary Pod 也可以承载明确比例，还可按 Header、Cookie 或用户组路由。

```mermaid
flowchart LR
    Client[Client traffic] --> Router[Ingress mesh or gateway]
    Router -->|Stable weight| StableSvc[Stable Service]
    Router -->|Canary weight| CanarySvc[Canary Service]
    StableSvc --> StableRS[Stable ReplicaSet]
    CanarySvc --> CanaryRS[Canary ReplicaSet]
    Controller[Rollouts controller] -->|Update routing objects| Router
```

引入 Traffic Manager 会增加故障面。需要验证控制器是否成功写入路由对象、数据平面是否应用、新旧 Service 是否有 Endpoint，以及真实流量比例是否接近目标。CRD 更新成功不等于代理已经生效。

#### 验收控制器到数据平面的传播

为一次 10% 到 30% 的权重变化记录四个时间点：Rollout Step 更新、路由对象更新、代理配置生效、真实请求比例稳定。

验证内容包括：

1. Rollouts Controller 对路由对象拥有预期字段，没有与其他控制器冲突。
2. Stable 和 Canary Service 的 Selector 与 EndpointSlice 正确。
3. 代理配置状态已接受新权重，不只有 Kubernetes 对象变化。
4. 从多个入口和客户端发送新连接，观察真实版本分布。
5. 路由控制器不可用时，现有权重保持而不是重置为默认。
6. Abort 能把权重恢复，并清理 Header 或实验路由。

路由传播时间要进入 Pause 与旧版本保留窗口。如果指标窗口在数据面生效前开始，会混入上一阶段流量并产生错误判断。

升级 Traffic Manager、Gateway CRD 或代理版本后重跑验收。控制器字段兼容不等于数据面语义完全一致。

#### 无 Traffic Manager 时副本比例为何不等于请求比例的机制边界

解释副本取整、长连接、会话粘性和 Ready Endpoint，记录声明权重与实际请求偏差。

- **无 Traffic Manager 时副本比例为何不等于请求比例的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **无 Traffic Manager 时副本比例为何不等于请求比例的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **无 Traffic Manager 时副本比例为何不等于请求比例的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **无 Traffic Manager 时副本比例为何不等于请求比例的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“无 Traffic Manager 时副本比例为何不等于请求比例”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“无 Traffic Manager 时副本比例为何不等于请求比例”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 无 Traffic Manager 时副本比例为何不等于请求比例的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `无 Traffic Manager 时副本比例为何不等于请求比例` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `无 Traffic Manager 时副本比例为何不等于请求比例` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `无 Traffic Manager 时副本比例为何不等于请求比例` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `无 Traffic Manager 时副本比例为何不等于请求比例` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“无 Traffic Manager 时副本比例为何不等于请求比例”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 无 Traffic Manager 时副本比例为何不等于请求比例的静态检查模板

下面命令为“无 Traffic Manager 时副本比例为何不等于请求比例”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 无 Traffic Manager 时副本比例为何不等于请求比例
evidence_file="./evidence/check-9ede8026ec.txt"
kubectl get rollout,svc,endpointslice -n demo -o wide | tee -a "${evidence_file}"
kubectl get httproute,ingress,virtualservice -n demo 2>/dev/null | tee -a "${evidence_file}"
for i in {1..50}; do curl -fsS https://demo.example/version; done | sort | uniq -c | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“无 Traffic Manager 时副本比例为何不等于请求比例”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 无 Traffic Manager 时副本比例为何不等于请求比例的故障实验与恢复

“无 Traffic Manager 时副本比例为何不等于请求比例”的可逆故障场景是：延迟或阻断路由控制器更新，持续采样真实版本回显；只有数据面恢复稳定后才允许关闭事件。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“无 Traffic Manager 时副本比例为何不等于请求比例”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“无 Traffic Manager 时副本比例为何不等于请求比例”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“无 Traffic Manager 时副本比例为何不等于请求比例”执行恢复策略：暂停步骤并确保稳定版本容量，执行 Abort 或切回后持续检查 Endpoint、代理配置、版本回显与异步副作用。
4. 重新采集“无 Traffic Manager 时副本比例为何不等于请求比例”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“无 Traffic Manager 时副本比例为何不等于请求比例”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### setWeight、Pause 和每一步退出契约如何设计

每步定义进入条件、目标权重、最小样本、最短/最长时间、硬失败、必要成功和超时动作。

#### setWeight、Pause 和每一步退出契约如何设计的机制边界


- **setWeight、Pause 和每一步退出契约如何设计的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **setWeight、Pause 和每一步退出契约如何设计的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **setWeight、Pause 和每一步退出契约如何设计的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **setWeight、Pause 和每一步退出契约如何设计的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“setWeight、Pause 和每一步退出契约如何设计”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“setWeight、Pause 和每一步退出契约如何设计”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### setWeight、Pause 和每一步退出契约如何设计的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `setWeight、Pause 和每一步退出契约如何设计` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `setWeight、Pause 和每一步退出契约如何设计` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `setWeight、Pause 和每一步退出契约如何设计` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `setWeight、Pause 和每一步退出契约如何设计` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“setWeight、Pause 和每一步退出契约如何设计”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### setWeight、Pause 和每一步退出契约如何设计的静态检查模板

下面命令为“setWeight、Pause 和每一步退出契约如何设计”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: setWeight、Pause 和每一步退出契约如何设计
evidence_file="./evidence/check-5be6c33a5d.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“setWeight、Pause 和每一步退出契约如何设计”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### setWeight、Pause 和每一步退出契约如何设计的故障实验与恢复

“setWeight、Pause 和每一步退出契约如何设计”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“setWeight、Pause 和每一步退出契约如何设计”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“setWeight、Pause 和每一步退出契约如何设计”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“setWeight、Pause 和每一步退出契约如何设计”执行恢复策略：冻结后续变更并保留当前稳定状态，恢复版本化输入后等待控制器重新收敛，再用业务证据关闭事件。
4. 重新采集“setWeight、Pause 和每一步退出契约如何设计”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“setWeight、Pause 和每一步退出契约如何设计”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### setCanaryScale、dynamicStableScale 和 HPA 如何协作

计算 Canary 安全 QPS、Ready 容量和 Abort 时 Stable 恢复时间，防止整体平均指标掩盖过载。

#### setCanaryScale、dynamicStableScale 和 HPA 如何协作的机制边界


- **setCanaryScale、dynamicStableScale 和 HPA 如何协作的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **setCanaryScale、dynamicStableScale 和 HPA 如何协作的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **setCanaryScale、dynamicStableScale 和 HPA 如何协作的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **setCanaryScale、dynamicStableScale 和 HPA 如何协作的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“setCanaryScale、dynamicStableScale 和 HPA 如何协作”，控制器中的目标权重只是意图，必须继续检查 Service、Endpoint、代理配置和真实请求分布。
对于“setCanaryScale、dynamicStableScale 和 HPA 如何协作”，旧连接、会话粘性、异步消费者和缓存可能在切换后继续产生副作用，不能只看 Rollout Phase。

#### setCanaryScale、dynamicStableScale 和 HPA 如何协作的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `setCanaryScale、dynamicStableScale 和 HPA 如何协作` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `setCanaryScale、dynamicStableScale 和 HPA 如何协作` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `setCanaryScale、dynamicStableScale 和 HPA 如何协作` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `setCanaryScale、dynamicStableScale 和 HPA 如何协作` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“setCanaryScale、dynamicStableScale 和 HPA 如何协作”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### setCanaryScale、dynamicStableScale 和 HPA 如何协作的静态检查模板

下面命令为“setCanaryScale、dynamicStableScale 和 HPA 如何协作”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: setCanaryScale、dynamicStableScale 和 HPA 如何协作
evidence_file="./evidence/check-e2dccf1bb7.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“setCanaryScale、dynamicStableScale 和 HPA 如何协作”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### setCanaryScale、dynamicStableScale 和 HPA 如何协作的故障实验与恢复

“setCanaryScale、dynamicStableScale 和 HPA 如何协作”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“setCanaryScale、dynamicStableScale 和 HPA 如何协作”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“setCanaryScale、dynamicStableScale 和 HPA 如何协作”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“setCanaryScale、dynamicStableScale 和 HPA 如何协作”执行恢复策略：暂停步骤并确保稳定版本容量，执行 Abort 或切回后持续检查 Endpoint、代理配置、版本回显与异步副作用。
4. 重新采集“setCanaryScale、dynamicStableScale 和 HPA 如何协作”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“setCanaryScale、dynamicStableScale 和 HPA 如何协作”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Abort 后为什么仍要检查路由、连接和异步副作用

```bash
kubectl argo rollouts get rollout checkout-api -n production --watch
kubectl argo rollouts promote checkout-api -n production
kubectl argo rollouts abort checkout-api -n production
```

命令只是控制入口，生产操作还要记录变更编号、操作者和证据。Abort 后验证 Active Service Selector、EndpointSlice、旧 ReplicaSet 副本和真实请求，不能只看到命令成功。

如果旧 ReplicaSet 已过 `scaleDownDelaySeconds` 被缩容，快速回退会需要重新扩容和拉取镜像，恢复时间上升。回退窗口应结合故障发现时间、镜像保留和容量成本设置。

操作前保存 `kubectl argo rollouts get rollout`、Service Selector、EndpointSlice 和 AnalysisRun；操作后用同样查询形成前后对照。这样才能区分“控制命令已接受”和“数据面已经恢复”。

人工 Promote 不应成为绕过失败 Analysis 的快捷按钮。若确需强制继续，应使用 Break Glass 权限、记录风险接受人，并在发布后补做完整验证。

#### 演练 Promote、Abort 和回退的可观测结果

每个动作都保存控制面和数据面前后状态：

| 动作 | 控制面预期 | 数据面预期 | 完成证据 |
|---|---|---|---|
| Promote | Rollout 进入切换 | Active Selector 指向新 Hash | 新请求稳定命中新版本 |
| Abort | 新版本停止晋级 | Active 保持或返回旧 Hash | 错误率回落、旧容量恢复 |
| Retry | 产生新的分析或步骤尝试 | 流量保持在当前安全权重 | 新 Measurement 与原因可见 |
| Git Revert | Argo CD 读取安全 Revision | Rollout 创建或恢复安全 ReplicaSet | 配置与运行身份一致 |

命令退出码只说明 API 接受请求。动作完成要等待 Selector、EndpointSlice、真实请求和业务指标共同达到预期。

在旧 ReplicaSet 缩容前后各做一次 Abort，比较恢复时间。这个差值决定延迟窗口是否覆盖组织的典型故障发现时间。

强制 Promote 演练仅在隔离环境进行，并验证审计和告警能够区分正常晋级与风险例外。


Abort 会让控制器把目标状态转回稳定版本，但路由传播、连接复用和异步任务需要时间。操作后检查：

- Rollout Phase 和 Conditions。
- Stable/Canary Service Selector 与 EndpointSlice。
- Ingress、Mesh 或 Gateway 的当前权重。
- 新旧 ReplicaSet 副本和 Pod Ready。
- 真实请求中的版本标识。
- 错误率是否恢复，队列和数据库是否留下副作用。

如果业务仍未恢复，问题可能已经超出流量层，例如数据库不兼容、缓存污染或下游写入。此时继续反复 Abort/Promote 只会增加扰动，应进入事件响应。

#### 用版本回显确认 Abort 真正生效

Abort 前后持续发送带唯一 Request ID 的新连接，并记录响应版本。完成标准不是 Canary Pod 变为零，而是：

1. 路由对象权重回到 Stable。
2. Stable Service 有足够 Ready Endpoint。
3. 新连接不再进入 Canary。
4. 旧长连接按预算结束或被 Drain。
5. Stable 错误率和延迟回到基线。
6. 队列、缓存和数据库没有继续产生新版本副作用。

若控制面已恢复而请求仍命中新版本，冻结进一步操作，检查入口缓存、Sidecar 配置、客户端连接池和多集群路由。

Canary Pod 保留用于取证时，要从生产 Service 摘除，并限制后台消费者和定时任务。没有入口流量不代表它不会继续处理消息或写数据库。

事件关闭前决定失败 Revision 的处置：保留到何时、如何阻止 Image Updater 再次选择、修复后是否产生新 Digest。不要复用已失败的可变 Tag。

#### Abort 后为什么仍要检查路由、连接和异步副作用的机制边界

覆盖入口权重、长连接、队列、定时任务、缓存和数据库写入，定义冻结变更和事件升级条件。

- **Abort 后为什么仍要检查路由、连接和异步副作用的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Abort 后为什么仍要检查路由、连接和异步副作用的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Abort 后为什么仍要检查路由、连接和异步副作用的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Abort 后为什么仍要检查路由、连接和异步副作用的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“Abort 后为什么仍要检查路由、连接和异步副作用”，控制器中的目标权重只是意图，必须继续检查 Service、Endpoint、代理配置和真实请求分布。
对于“Abort 后为什么仍要检查路由、连接和异步副作用”，旧连接、会话粘性、异步消费者和缓存可能在切换后继续产生副作用，不能只看 Rollout Phase。

#### Abort 后为什么仍要检查路由、连接和异步副作用的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Abort 后为什么仍要检查路由、连接和异步副作用` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Abort 后为什么仍要检查路由、连接和异步副作用` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Abort 后为什么仍要检查路由、连接和异步副作用` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Abort 后为什么仍要检查路由、连接和异步副作用` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Abort 后为什么仍要检查路由、连接和异步副作用”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Abort 后为什么仍要检查路由、连接和异步副作用的静态检查模板

下面命令为“Abort 后为什么仍要检查路由、连接和异步副作用”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Abort 后为什么仍要检查路由、连接和异步副作用
evidence_file="./evidence/check-40248f4acc.txt"
kubectl get rollout,svc,endpointslice -n demo -o wide | tee -a "${evidence_file}"
kubectl get httproute,ingress,virtualservice -n demo 2>/dev/null | tee -a "${evidence_file}"
for i in {1..50}; do curl -fsS https://demo.example/version; done | sort | uniq -c | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Abort 后为什么仍要检查路由、连接和异步副作用”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Abort 后为什么仍要检查路由、连接和异步副作用的故障实验与恢复

“Abort 后为什么仍要检查路由、连接和异步副作用”的可逆故障场景是：延迟或阻断路由控制器更新，持续采样真实版本回显；只有数据面恢复稳定后才允许关闭事件。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Abort 后为什么仍要检查路由、连接和异步副作用”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Abort 后为什么仍要检查路由、连接和异步副作用”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Abort 后为什么仍要检查路由、连接和异步副作用”执行恢复策略：暂停步骤并确保稳定版本容量，执行 Abort 或切回后持续检查 Endpoint、代理配置、版本回显与异步副作用。
4. 重新采集“Abort 后为什么仍要检查路由、连接和异步副作用”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Abort 后为什么仍要检查路由、连接和异步副作用”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 6 章 · Traffic Manager 如何把控制器意图传递到数据面

### NGINX、Istio 和 Gateway API 集成如何选择

比较对象模型、权重精度、Header 路由、依赖组件、状态反馈和回退复杂度。

#### NGINX、Istio 和 Gateway API 集成如何选择的机制边界


- **NGINX、Istio 和 Gateway API 集成如何选择的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **NGINX、Istio 和 Gateway API 集成如何选择的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **NGINX、Istio 和 Gateway API 集成如何选择的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **NGINX、Istio 和 Gateway API 集成如何选择的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“NGINX、Istio 和 Gateway API 集成如何选择”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“NGINX、Istio 和 Gateway API 集成如何选择”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### NGINX、Istio 和 Gateway API 集成如何选择的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `NGINX、Istio 和 Gateway API 集成如何选择` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `NGINX、Istio 和 Gateway API 集成如何选择` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `NGINX、Istio 和 Gateway API 集成如何选择` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `NGINX、Istio 和 Gateway API 集成如何选择` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“NGINX、Istio 和 Gateway API 集成如何选择”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### NGINX、Istio 和 Gateway API 集成如何选择的静态检查模板

下面命令为“NGINX、Istio 和 Gateway API 集成如何选择”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: NGINX、Istio 和 Gateway API 集成如何选择
evidence_file="./evidence/check-12e1128983.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“NGINX、Istio 和 Gateway API 集成如何选择”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### NGINX、Istio 和 Gateway API 集成如何选择的故障实验与恢复

“NGINX、Istio 和 Gateway API 集成如何选择”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“NGINX、Istio 和 Gateway API 集成如何选择”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“NGINX、Istio 和 Gateway API 集成如何选择”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“NGINX、Istio 和 Gateway API 集成如何选择”执行恢复策略：冻结后续变更并保留当前稳定状态，恢复版本化输入后等待控制器重新收敛，再用业务证据关闭事件。
4. 重新采集“NGINX、Istio 和 Gateway API 集成如何选择”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“NGINX、Istio 和 Gateway API 集成如何选择”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Stable/Canary Service 与路由对象如何完整声明

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: checkout-api
  namespace: production
spec:
  replicas: 6
  selector:
    matchLabels:
      app: checkout-api
  template:
    metadata:
      labels:
        app: checkout-api
    spec:
      containers:
        - name: checkout-api
          image: harbor.example.com/payments/checkout-api@sha256:0123456789abcdef
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
  strategy:
    blueGreen:
      activeService: checkout-api
      previewService: checkout-api-preview
      autoPromotionEnabled: false
      previewReplicaCount: 2
      scaleDownDelaySeconds: 300
```

`autoPromotionEnabled: false` 让新版本在 Ready 后停在预览阶段，等待分析或人工晋级。`previewReplicaCount` 可以降低预览成本，但若测试需要完整容量或缓存预热，就不能只启少量副本。

#### 对蓝绿策略做静态和运行时双重审查

静态审查确认 Active/Preview Service 存在、Selector 仅包含稳定应用标签、Pod Template 有唯一版本 Hash、探针与资源预算完整。

运行时审查确认：

- Preview Service 只指向新 ReplicaSet。
- Active Service 在晋级前保持旧 ReplicaSet。
- 预览副本达到测试所需容量和依赖连接数。
- AnalysisRun 能访问 Preview 地址且不会误打生产入口。
- 切换后旧 ReplicaSet 在延迟窗口内保留。
- Abort 能让 Active Selector 返回旧 Hash。

`previewReplicaCount` 小于生产容量时，要标记哪些验证结论不成立。例如少量副本可以证明基本功能，却不能证明连接池、缓存预热和峰值吞吐。

策略字段变更也需要演练。缩短延迟、启用自动晋级或修改 Analysis 引用都可能改变恢复边界，不能作为普通 YAML 重构直接合并。

使用 Traffic Routing 时，可以用 `setCanaryScale` 独立控制 Canary 副本数。例如先启动 3 个副本做无生产流量测试，再把少量 Header 流量导入；或为流量镜像准备足够容量。

必须避免“少量 Pod 承担大量流量”。如果 Canary 只有总容量的 10%，却把 90% 流量导入，它可能因自身过载产生错误，看起来像版本缺陷。放量门禁应同时检查权重、Ready 副本、单 Pod 负载和 HPA 行为。

`dynamicStableScale` 可以随 Canary 权重增加而缩小稳定副本，节省资源，但 Abort 时稳定容量需要恢复。高风险业务通常保留稳定版本完整容量以换取快速切回。

HPA 目标通常绑定 Rollout，因此会根据整体负载调整总副本。使用 Traffic Manager 解耦流量和副本后，要验证 HPA 指标是否能反映 Canary 的单独压力；只看整体平均值可能掩盖少量 Canary Pod 过载。

每次改变 `setCanaryScale` 后都应观察实际副本、Traffic Weight、每 Pod QPS 和 Ready 状态。恢复 `matchTrafficWeight: true` 时确认后续步骤不会突然缩容或扩容。

#### 用容量算例检查权重是否安全

假设稳定版 10 个 Pod、单 Pod 安全上限 100 QPS，总流量 800 QPS。若 Canary 只有 2 个 Pod，安全承载上限是 200 QPS，对应最大 25% 流量；把权重直接设为 50% 会让 Canary 过载。

计算时还要扣除探针、预热和抖动余量，并按 Ready Pod 而非期望副本计算。任一 Canary Pod NotReady 时，允许权重应随有效容量下降。

把容量公式和数据源写入 Step 门禁，避免控制器权重与 HPA 扩容速度互相追赶。

Abort 预算还要包含 Stable 从缩容状态恢复到安全容量的时间。

#### Stable/Canary Service 与路由对象如何完整声明的机制边界

给出至少一套完整 NGINX 或 Gateway API 示例，其余提供字段映射和适用差异。

- **Stable/Canary Service 与路由对象如何完整声明的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Stable/Canary Service 与路由对象如何完整声明的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Stable/Canary Service 与路由对象如何完整声明的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Stable/Canary Service 与路由对象如何完整声明的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“Stable/Canary Service 与路由对象如何完整声明”，控制器中的目标权重只是意图，必须继续检查 Service、Endpoint、代理配置和真实请求分布。
对于“Stable/Canary Service 与路由对象如何完整声明”，旧连接、会话粘性、异步消费者和缓存可能在切换后继续产生副作用，不能只看 Rollout Phase。

#### Stable/Canary Service 与路由对象如何完整声明的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Stable/Canary Service 与路由对象如何完整声明` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Stable/Canary Service 与路由对象如何完整声明` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Stable/Canary Service 与路由对象如何完整声明` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Stable/Canary Service 与路由对象如何完整声明` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Stable/Canary Service 与路由对象如何完整声明”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Stable/Canary Service 与路由对象如何完整声明的静态检查模板

下面命令为“Stable/Canary Service 与路由对象如何完整声明”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Stable/Canary Service 与路由对象如何完整声明
evidence_file="./evidence/check-43a512c32b.txt"
kubectl get rollout,svc,endpointslice -n demo -o wide | tee -a "${evidence_file}"
kubectl get httproute,ingress,virtualservice -n demo 2>/dev/null | tee -a "${evidence_file}"
for i in {1..50}; do curl -fsS https://demo.example/version; done | sort | uniq -c | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Stable/Canary Service 与路由对象如何完整声明”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Stable/Canary Service 与路由对象如何完整声明的故障实验与恢复

“Stable/Canary Service 与路由对象如何完整声明”的可逆故障场景是：延迟或阻断路由控制器更新，持续采样真实版本回显；只有数据面恢复稳定后才允许关闭事件。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Stable/Canary Service 与路由对象如何完整声明”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Stable/Canary Service 与路由对象如何完整声明”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Stable/Canary Service 与路由对象如何完整声明”执行恢复策略：暂停步骤并确保稳定版本容量，执行 Abort 或切回后持续检查 Endpoint、代理配置、版本回显与异步副作用。
4. 重新采集“Stable/Canary Service 与路由对象如何完整声明”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Stable/Canary Service 与路由对象如何完整声明”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 如何验证路由对象更新已经被代理真实应用

记录 Rollout Step、路由对象、代理配置和真实请求比例四个时间点，检查多个入口与新连接。

#### 如何验证路由对象更新已经被代理真实应用的机制边界


- **如何验证路由对象更新已经被代理真实应用的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **如何验证路由对象更新已经被代理真实应用的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **如何验证路由对象更新已经被代理真实应用的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **如何验证路由对象更新已经被代理真实应用的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“如何验证路由对象更新已经被代理真实应用”，控制器中的目标权重只是意图，必须继续检查 Service、Endpoint、代理配置和真实请求分布。
对于“如何验证路由对象更新已经被代理真实应用”，旧连接、会话粘性、异步消费者和缓存可能在切换后继续产生副作用，不能只看 Rollout Phase。

#### 如何验证路由对象更新已经被代理真实应用的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `如何验证路由对象更新已经被代理真实应用` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `如何验证路由对象更新已经被代理真实应用` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `如何验证路由对象更新已经被代理真实应用` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `如何验证路由对象更新已经被代理真实应用` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“如何验证路由对象更新已经被代理真实应用”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 如何验证路由对象更新已经被代理真实应用的静态检查模板

下面命令为“如何验证路由对象更新已经被代理真实应用”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 如何验证路由对象更新已经被代理真实应用
evidence_file="./evidence/check-1581b4bb3d.txt"
kubectl get rollout,svc,endpointslice -n demo -o wide | tee -a "${evidence_file}"
kubectl get httproute,ingress,virtualservice -n demo 2>/dev/null | tee -a "${evidence_file}"
for i in {1..50}; do curl -fsS https://demo.example/version; done | sort | uniq -c | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“如何验证路由对象更新已经被代理真实应用”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 如何验证路由对象更新已经被代理真实应用的故障实验与恢复

“如何验证路由对象更新已经被代理真实应用”的可逆故障场景是：延迟或阻断路由控制器更新，持续采样真实版本回显；只有数据面恢复稳定后才允许关闭事件。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“如何验证路由对象更新已经被代理真实应用”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“如何验证路由对象更新已经被代理真实应用”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“如何验证路由对象更新已经被代理真实应用”执行恢复策略：暂停步骤并确保稳定版本容量，执行 Abort 或切回后持续检查 Endpoint、代理配置、版本回显与异步副作用。
4. 重新采集“如何验证路由对象更新已经被代理真实应用”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“如何验证路由对象更新已经被代理真实应用”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 路由控制器故障和传播延迟如何影响发布门禁

按链路分层排查：

1. **Registry**：DNS、TLS、限流、认证、Manifest 和平台信息。
2. **候选策略**：Tag 是否匹配、版本约束是否允许、当前版本是否可解析。
3. **Application 匹配**：名称、标签、命名空间和来源类型是否满足。
4. **Git 回写**：仓库凭据、分支、保护规则、文件冲突和签名要求。
5. **Argo CD**：是否观察新 Commit、渲染参数是否真正改变镜像。
6. **运行环境**：节点能否拉取、准入策略是否接受、工作负载是否健康。

错误镜像已进入 Git 时，优先创建显式 Revert 或安全版本变更。暂停 ImageUpdater，防止它再次选择同一候选；修复 AllowTags、IgnoreTags 或版本范围后，在非生产环境验证再恢复自动化。

#### 用故障矩阵演练自动化恢复

| 注入故障 | 预期安全状态 | 恢复前证据 | 恢复动作 |
|---|---|---|---|
| Registry 认证失效 | 当前 Digest 不变 | 最近成功扫描、401 日志 | 轮换凭据后重扫 |
| 候选规则错误 | 无变更或明确拒绝 | 候选集合与策略版本 | 修正规则并重新评审 |
| Git Push 被拒绝 | 运行态不变 | 远端 HEAD、机器人身份 | 修复权限或冲突 |
| Commit 已推但状态丢失 | 仓库已有唯一变更 | Commit 与变更 ID | 采用既有结果 |
| Argo CD 仓库不可达 | 旧版本继续运行 | Application Revision、连接错误 | 恢复读取并 Refresh |
| 新版本门禁失败 | Rollout 停在安全流量 | AnalysisRun 与 SLI | Abort、回退或修复 |

每个故障都要证明“保持什么不变”。自动化不可用时最重要的是不悄悄选择新候选、不绕过 Git、不删除当前工作负载。

恢复后观察两个完整扫描周期和一次 Argo CD 调谐，确认没有积压变更、重复 Commit 或旧错误状态。只看到控制器 Pod Ready 不能关闭事件。


蓝绿发布适合能并行运行两个版本、需要整体切换或预览验证的服务。主要成本和风险包括：

- 新旧副本并存，峰值容量接近双倍。
- 数据库变更必须同时兼容两个版本。
- Session、缓存和长连接可能仍绑定旧版本。
- 消费队列的 Worker 不经过 Service，流量切换无法控制它们。
- 外部任务、定时作业和副作用可能被两个版本重复执行。

对队列消费者、单写者或共享锁服务，应单独设计主从、Drain、消费组或 Leader 迁移。Rollout 控制的是 Kubernetes 工作负载和已集成的数据平面，不理解业务协议的副作用。

数据库变更应采用 Expand/Contract：先添加兼容字段并让新旧版本都能工作，完成应用切换和观察后再删除旧结构。若发布必须执行不可逆迁移，蓝绿带来的快速流量回切并不等于应用可回退。

容量规划不只看 Pod Requests，还要看连接数、数据库连接池、缓存预热和许可证限制。预览环境副本增加可能让共享依赖先耗尽，导致稳定版本也受影响。

#### 计算双版本并存预算

对每项稀缺资源计算稳定版本、新版本和系统余量：

| 资源 | 计算方式 | 常见遗漏 |
|---|---|---|
| CPU/内存 | Stable Requests + Preview Requests + Surge | 节点碎片和 DaemonSet 开销 |
| 数据库连接 | 两套副本上限乘单 Pod 池大小 | 启动探测也会建连接 |
| 消息消费者 | 两版本并发实例与分区数 | 重复消费和 Rebalance |
| 缓存 | 双版本 Key、预热和淘汰 | 新 Schema 污染旧缓存 |
| 许可证 | 同时在线实例或连接 | 预览副本也计费 |

在容量接近上限时，降低 Preview 副本只解决计算资源，不一定解决每实例固定连接或后台任务。必要时为 Preview 禁用消费者、使用只读依赖或安排容量窗口。

故障演练要在 Stable 已接近高负载时启动 Preview，观察共享依赖是否先饱和。只在空闲测试环境验证，无法证明生产并存安全。

预算不足时应选择 Canary、小规模影子验证或维护窗口，而不是依赖调度器碰运气放置双倍副本。

#### 路由控制器故障和传播延迟如何影响发布门禁的机制边界

验证现有权重是否保持、指标窗口何时开始、Abort 如何清理实验路由和何时升级事件。

- **路由控制器故障和传播延迟如何影响发布门禁的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **路由控制器故障和传播延迟如何影响发布门禁的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **路由控制器故障和传播延迟如何影响发布门禁的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **路由控制器故障和传播延迟如何影响发布门禁的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“路由控制器故障和传播延迟如何影响发布门禁”，控制器中的目标权重只是意图，必须继续检查 Service、Endpoint、代理配置和真实请求分布。
对于“路由控制器故障和传播延迟如何影响发布门禁”，旧连接、会话粘性、异步消费者和缓存可能在切换后继续产生副作用，不能只看 Rollout Phase。

#### 路由控制器故障和传播延迟如何影响发布门禁的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `路由控制器故障和传播延迟如何影响发布门禁` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `路由控制器故障和传播延迟如何影响发布门禁` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `路由控制器故障和传播延迟如何影响发布门禁` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `路由控制器故障和传播延迟如何影响发布门禁` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“路由控制器故障和传播延迟如何影响发布门禁”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 路由控制器故障和传播延迟如何影响发布门禁的静态检查模板

下面命令为“路由控制器故障和传播延迟如何影响发布门禁”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 路由控制器故障和传播延迟如何影响发布门禁
evidence_file="./evidence/check-d72e1ff51f.txt"
kubectl get rollout,svc,endpointslice -n demo -o wide | tee -a "${evidence_file}"
kubectl get httproute,ingress,virtualservice -n demo 2>/dev/null | tee -a "${evidence_file}"
for i in {1..50}; do curl -fsS https://demo.example/version; done | sort | uniq -c | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“路由控制器故障和传播延迟如何影响发布门禁”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 路由控制器故障和传播延迟如何影响发布门禁的故障实验与恢复

“路由控制器故障和传播延迟如何影响发布门禁”的可逆故障场景是：延迟或阻断路由控制器更新，持续采样真实版本回显；只有数据面恢复稳定后才允许关闭事件。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“路由控制器故障和传播延迟如何影响发布门禁”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“路由控制器故障和传播延迟如何影响发布门禁”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“路由控制器故障和传播延迟如何影响发布门禁”执行恢复策略：暂停步骤并确保稳定版本容量，执行 Abort 或切回后持续检查 Endpoint、代理配置、版本回显与异步副作用。
4. 重新采集“路由控制器故障和传播延迟如何影响发布门禁”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“路由控制器故障和传播延迟如何影响发布门禁”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 7 章 · AnalysisTemplate 如何把指标变成可解释门禁

### AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化

AnalysisTemplate 定义可复用的指标和判断条件，Rollout 在特定阶段创建 AnalysisRun，AnalysisRun 记录每次 Measurement 及最终 Phase。参数可以来自 Rollout 字段、固定值或模板引用。

```mermaid
flowchart LR
    Rollout[Rollout step] -->|Create| Run[AnalysisRun]
    Template[AnalysisTemplate] -->|Define metrics| Run
    Args[Rollout args] --> Run
    Run --> Provider[Metric provider]
    Provider --> Measurement[Measurements]
    Measurement --> Decision[Successful Failed Inconclusive Error]
    Decision --> Rollout
```

模板应该版本化并由指标 Owner 审查。随意修改共享 ClusterAnalysisTemplate 可能同时改变多个团队的发布门禁，影响面比单个应用配置大。

#### AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化的机制边界

解释参数来源、共享模板影响面、Run 身份、Measurement 生命周期和 Template Owner。

- **AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化”，查询值必须连同时间窗口、样本数和 Provider 状态解释，空值不能自动当作零。
对于“AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化”，业务失败、观测故障和数据不足要进入不同状态，且每种状态只能对应一个默认动作。

#### AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化的静态检查模板

下面命令为“AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化
evidence_file="./evidence/check-bd8b607885.txt"
kubectl get analysisrun -n demo -o wide | tee -a "${evidence_file}"
kubectl describe analysisrun -n demo | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化的故障实验与恢复

“AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化”的可逆故障场景是：依次返回空 Vector、多 Series、NaN 和超时，确认业务失败、数据不足与 Provider 错误不会被混为一类。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化”执行恢复策略：暂停自动晋级并保持稳定版本，修复查询或观测链后重放同一时间窗口；缺失数据不得补写为零。
4. 重新采集“AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“AnalysisTemplate、ClusterAnalysisTemplate 和 AnalysisRun 如何版本化”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择

比较启动时机、终止条件、数据窗口、失败影响和适用风险。

#### Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择的机制边界


- **Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择”，查询值必须连同时间窗口、样本数和 Provider 状态解释，空值不能自动当作零。
对于“Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择”，业务失败、观测故障和数据不足要进入不同状态，且每种状态只能对应一个默认动作。

#### Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择的静态检查模板

下面命令为“Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择
evidence_file="./evidence/check-8409ee41d6.txt"
kubectl get analysisrun -n demo -o wide | tee -a "${evidence_file}"
kubectl describe analysisrun -n demo | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择的故障实验与恢复

“Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择”的可逆故障场景是：依次返回空 Vector、多 Series、NaN 和超时，确认业务失败、数据不足与 Provider 错误不会被混为一类。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择”执行恢复策略：暂停自动晋级并保持稳定版本，修复查询或观测链后重放同一时间窗口；缺失数据不得补写为零。
4. 重新采集“Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Inline、Background、PrePromotion 和 PostPromotion Analysis 如何选择”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Prometheus 空值、多值、NaN、延迟和低流量如何处理

Prometheus Instant Query 常返回 Vector，示例里的 `result[0]` 假设恰好有一个值。若查询返回空 Vector、多个 Series 或 NaN，条件可能报错或产生错误判断。应先通过聚合确保结果形状稳定，并对无数据语义做明确决策。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: checkout-success-rate
spec:
  args:
    - name: service
  metrics:
    - name: success-rate
      interval: 1m
      count: 10
      failureLimit: 2
      consecutiveSuccessLimit: 3
      successCondition: len(result) == 1 && result[0] >= 0.995
      failureCondition: len(result) != 1 || result[0] < 0.990
      provider:
        prometheus:
          address: http://prometheus.monitoring.svc:9090
          query: |
            sum(rate(http_requests_total{service="{{args.service}}",code!~"5.."}[5m]))
            /
            sum(rate(http_requests_total{service="{{args.service}}"}[5m]))
```

真实使用还要防止分母为零，并按版本或 Stable/Canary 路由标签比较。Range Query 返回多个时间点时，应使用 `all`、`any` 等逻辑检查整个窗口，而非只取第一个值。

#### 用已知数据测试 Prometheus 条件

为每条查询准备六种结果：正常单值、失败单值、空 Vector、多 Series、NaN/Inf 和 Provider 超时。记录 successCondition、failureCondition 与最终 Phase。

测试时确认：

- 分母为零不会产生被误判为成功的 NaN。
- 空结果表示无流量还是抓取故障，有明确策略。
- 多 Series 通过聚合或 `all`/`any` 显式处理。
- Stable 与 Canary Label 不会互相混入。
- Query Window 只覆盖当前流量步骤。
- Provider 超时进入 Error，而不是复用旧值。

在 Prometheus UI 得到一个正确数字，不等于 Analysis Provider 会以相同结构返回。要检查 AnalysisRun 中保存的 Measurement Value 和 Message。

查询变更应回放历史发布窗口，估算误报和漏报。只用当前正常数据调阈值，容易得到永远通过的门禁。

指标从请求发生到查询可见包含采集间隔、远程写入、规则计算和查询缓存延迟。Rollout 刚切流就立即查询，可能读到旧窗口；低流量又会让比例剧烈波动。

设计时明确：

- Initial Delay 是否覆盖路由传播和应用预热。
- Query Window 是否只包含当前步骤流量。
- 最低请求量是否足以判断比例。
- 记录规则更新周期是否小于分析间隔。
- 时钟和 Label 是否能区分新旧版本。

对于金额、库存等低频高价值业务，可以结合合成交易、事件计数和人工审批。自动化目标是减少已知风险，不是制造统计确定性。

#### 画出一次分析窗口的时间线

依次标记路由生效、应用预热、指标抓取、远程写入、记录规则和 Analysis 查询时间。查询窗口起点应晚于路由生效与预热，终点要覆盖最新可见样本。

若最低样本量未达到，状态应是数据不足而非成功。可以延长窗口或补充受控合成请求，但合成数据要与真实流量分开标记。

为高价值低频事件设置绝对硬失败，例如出现一次数据一致性错误立即 Abort，而不是等待比例稳定。

#### Prometheus 空值、多值、NaN、延迟和低流量如何处理的机制边界

为正常单值、失败、空 Vector、多 Series、NaN/Inf 和 Provider 超时建立查询测试集。

- **Prometheus 空值、多值、NaN、延迟和低流量如何处理的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Prometheus 空值、多值、NaN、延迟和低流量如何处理的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Prometheus 空值、多值、NaN、延迟和低流量如何处理的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Prometheus 空值、多值、NaN、延迟和低流量如何处理的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“Prometheus 空值、多值、NaN、延迟和低流量如何处理”，查询值必须连同时间窗口、样本数和 Provider 状态解释，空值不能自动当作零。
对于“Prometheus 空值、多值、NaN、延迟和低流量如何处理”，业务失败、观测故障和数据不足要进入不同状态，且每种状态只能对应一个默认动作。

#### Prometheus 空值、多值、NaN、延迟和低流量如何处理的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Prometheus 空值、多值、NaN、延迟和低流量如何处理` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Prometheus 空值、多值、NaN、延迟和低流量如何处理` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Prometheus 空值、多值、NaN、延迟和低流量如何处理` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Prometheus 空值、多值、NaN、延迟和低流量如何处理` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Prometheus 空值、多值、NaN、延迟和低流量如何处理”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Prometheus 空值、多值、NaN、延迟和低流量如何处理的静态检查模板

下面命令为“Prometheus 空值、多值、NaN、延迟和低流量如何处理”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Prometheus 空值、多值、NaN、延迟和低流量如何处理
evidence_file="./evidence/check-445629199e.txt"
kubectl get analysisrun -n demo -o wide | tee -a "${evidence_file}"
kubectl describe analysisrun -n demo | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Prometheus 空值、多值、NaN、延迟和低流量如何处理”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Prometheus 空值、多值、NaN、延迟和低流量如何处理的故障实验与恢复

“Prometheus 空值、多值、NaN、延迟和低流量如何处理”的可逆故障场景是：依次返回空 Vector、多 Series、NaN 和超时，确认业务失败、数据不足与 Provider 错误不会被混为一类。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Prometheus 空值、多值、NaN、延迟和低流量如何处理”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Prometheus 空值、多值、NaN、延迟和低流量如何处理”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Prometheus 空值、多值、NaN、延迟和低流量如何处理”执行恢复策略：暂停自动晋级并保持稳定版本，修复查询或观测链后重放同一时间窗口；缺失数据不得补写为零。
4. 重新采集“Prometheus 空值、多值、NaN、延迟和低流量如何处理”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Prometheus 空值、多值、NaN、延迟和低流量如何处理”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 多指标如何区分硬失败、必要成功和辅助观察

平均分模型可能让严重错误被其他健康指标抵消。例如 CPU 很低不能抵消支付失败率上升。门禁应分为硬失败、必要成功和辅助观察：

| 类型 | 示例 | 决策 |
|---|---|---|
| 硬失败 | 数据错误、5xx 激增、关键交易失败 | 立即 Abort |
| 必要成功 | 成功率、延迟、最小样本量 | 全部满足才晋级 |
| 辅助观察 | CPU、缓存命中、非关键日志 | 提供人工上下文 |

AnalysisTemplate 可以组合多个 Metric，但跨系统事务、人工批准和复杂依赖可能更适合 Analysis Provider 插件或外部评估服务。所有扩展都要定义超时、认证、重试和幂等。

建议把硬失败指标拆成独立 Metric，使状态能清楚指出是错误率、延迟还是业务结果失败。把所有条件塞入一个复杂表达式虽然简短，却降低排障和阈值审查能力。

辅助观察指标不参与自动成功判断时，也应写入发布证据包。人工可以据此发现“门禁通过但资源成本显著上升”等需要后续处理的问题。

#### 多指标如何区分硬失败、必要成功和辅助观察的机制边界

禁止用平均分让严重错误被健康指标抵消；定义每类指标的 Success/Failure 条件、最小样本、失败次数、权重是否参与决策，以及 Provider 故障时的唯一动作，并验证多模板合并时的指标重名和参数冲突。

- **多指标如何区分硬失败、必要成功和辅助观察的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **多指标如何区分硬失败、必要成功和辅助观察的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **多指标如何区分硬失败、必要成功和辅助观察的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **多指标如何区分硬失败、必要成功和辅助观察的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“多指标如何区分硬失败、必要成功和辅助观察”，查询值必须连同时间窗口、样本数和 Provider 状态解释，空值不能自动当作零。
对于“多指标如何区分硬失败、必要成功和辅助观察”，业务失败、观测故障和数据不足要进入不同状态，且每种状态只能对应一个默认动作。

#### 多指标如何区分硬失败、必要成功和辅助观察的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `多指标如何区分硬失败、必要成功和辅助观察` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `多指标如何区分硬失败、必要成功和辅助观察` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `多指标如何区分硬失败、必要成功和辅助观察` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `多指标如何区分硬失败、必要成功和辅助观察` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“多指标如何区分硬失败、必要成功和辅助观察”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 多指标如何区分硬失败、必要成功和辅助观察的静态检查模板

下面命令为“多指标如何区分硬失败、必要成功和辅助观察”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 多指标如何区分硬失败、必要成功和辅助观察
evidence_file="./evidence/check-b1a57054d3.txt"
kubectl get analysisrun -n demo -o wide | tee -a "${evidence_file}"
kubectl describe analysisrun -n demo | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“多指标如何区分硬失败、必要成功和辅助观察”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 多指标如何区分硬失败、必要成功和辅助观察的故障实验与恢复

“多指标如何区分硬失败、必要成功和辅助观察”的可逆故障场景是：依次返回空 Vector、多 Series、NaN 和超时，确认业务失败、数据不足与 Provider 错误不会被混为一类。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“多指标如何区分硬失败、必要成功和辅助观察”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“多指标如何区分硬失败、必要成功和辅助观察”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“多指标如何区分硬失败、必要成功和辅助观察”执行恢复策略：暂停自动晋级并保持稳定版本，修复查询或观测链后重放同一时间窗口；缺失数据不得补写为零。
4. 重新采集“多指标如何区分硬失败、必要成功和辅助观察”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“多指标如何区分硬失败、必要成功和辅助观察”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作

- **Successful**：成功条件达到，允许继续。
- **Failed**：业务测量违反失败门限，通常 Abort。
- **Error**：Provider 调用、表达式或认证失败，说明观测链路有问题。
- **Inconclusive**：既未满足成功也未达到失败，适合转人工判断。

不要把 Error 当 Success。指标系统不可用时继续放量会使门禁失去意义；默认更安全的策略是暂停，并由值班人员判断是修复观测、延长窗口还是回退。

`failureLimit` 控制可容忍失败次数，`consecutiveSuccessLimit` 要求连续成功。短暂噪声环境可允许少量失败，但连续成功能防止单次偶然好值提前晋级。阈值应通过历史数据和回放验证，不凭直觉设定。

状态转换需要配套动作：Failed 通常自动 Abort，Error 通常暂停并修复 Provider，Inconclusive 进入限时人工判断。每一种状态都要有最大等待时间；无限等待会让 Rollout 和双版本资源长期悬挂。

分析被提前终止时还要理解控制器的最终状态语义，不能仅凭“Run 结束”判断通过。复盘应查看每个 Measurement 的 Value、Phase、时间和 Message。

#### 为四种结果定义唯一处置路径

| 结果 | 默认动作 | 允许人工覆盖 | 必须保留 |
|---|---|---|---|
| Successful | 进入下一步 | 可选择继续观察 | Measurement 与查询版本 |
| Failed | Abort 或回退 | 仅 Break Glass 继续 | 失败值、阈值和用户影响 |
| Error | 暂停并修复观测 | 风险审批后有限继续 | Provider 错误和重试记录 |
| Inconclusive | 限时人工判断 | Promote、回退或延长 | 样本量和判断理由 |

同一种结果在不同 Metric 上不能含义相反。数据一致性检查失败属于硬失败，观测 Provider 无法访问属于 Error；把两者都编码成 `false` 会丢失安全语义。

人工覆盖后创建独立事件，不能改写原 AnalysisRun。后续复盘要能区分系统结论和风险接受人的决定。

等待超时必须升级到指定角色，并有默认安全状态。无限 Pause 会占用容量、阻塞新发布，也可能让值班交接丢失上下文。

#### Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作的机制边界

区分业务失败、观测故障和数据不足；定义 Abort、暂停、限时人工判断、Break Glass 和证据保留。

- **Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作”，查询值必须连同时间窗口、样本数和 Provider 状态解释，空值不能自动当作零。
对于“Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作”，业务失败、观测故障和数据不足要进入不同状态，且每种状态只能对应一个默认动作。

#### Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作的静态检查模板

下面命令为“Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作
evidence_file="./evidence/check-704b0468a0.txt"
kubectl get analysisrun -n demo -o wide | tee -a "${evidence_file}"
kubectl describe analysisrun -n demo | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作的故障实验与恢复

“Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作”的可逆故障场景是：依次返回空 Vector、多 Series、NaN 和超时，确认业务失败、数据不足与 Provider 错误不会被混为一类。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作”执行恢复策略：暂停自动晋级并保持稳定版本，修复查询或观测链后重放同一时间窗口；缺失数据不得补写为零。
4. 重新采集“Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Successful、Failed、Error 和 Inconclusive 如何驱动唯一动作”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 8 章 · Argo CD 与 Rollouts 如何协同排障和验收

### Argo CD Sync/Health 与 Rollout Phase 分别说明什么

Argo CD 的资源健康、同步窗口和运维边界可结合 [安全、可靠性与运维](04-security-reliability-and-operations.md)阅读；这里专门处理它们与 Rollout Phase、Analysis 和数据面状态的组合判读。

Argo CD Sync 表示 Git 声明与 Kubernetes 对象是否一致；Rollout Phase 表示 Rollouts 控制器推进到了哪个状态。Argo CD 可以已经 Synced，而 Rollout 正在 Paused、Progressing 或 Degraded。这不是矛盾：声明已应用，但运行过程尚未结束。

排障先回答两个问题：

1. Rollout Spec 是否正是目标 Git Revision 渲染的结果？
2. Rollouts Controller 是否根据该 Spec 正常推进 ReplicaSet、Service、路由和 AnalysisRun？

若 Argo CD OutOfSync，先处理渲染、Diff 和同步；若 Synced 但 Rollout 异常，转向 Rollout Conditions、Events 和关联资源。不要在两个控制器之间来回点 Sync 和 Promote 掩盖原因。

Argo CD Health 依赖 CRD 提供的 Status 和资源健康规则。升级 Rollouts 或自定义健康脚本后，要用 Paused、Healthy、Degraded、Abort 等测试对象验证映射；错误健康规则可能把等待人工晋级显示为故障，或把失败状态显示为健康。

还要区分 Argo CD Application 的整体 Health 和单个 Rollout 的 Health。Application 中其他 Job、Ingress、Certificate 或 Hook 失败，也会使整体状态异常，不能只盯 Rollout。

#### 用状态组合定位责任控制器

| Argo CD | Rollout | 首要排查 |
|---|---|---|
| OutOfSync | 未变化 | 仓库、渲染、Diff 和同步策略 |
| Synced | Progressing | ReplicaSet、Pod、Service 和步骤等待 |
| Synced | Paused | Analysis、人工门禁和暂停超时 |
| Synced | Degraded | Rollout Conditions 与运行资源 |
| Healthy | 业务异常 | 请求路径、依赖和业务 SLI |

每次只让对应控制器执行一次明确动作，随后重新取证。连续点击 Sync、Retry 和 Promote 会混淆状态时间线。

#### Argo CD Sync/Health 与 Rollout Phase 分别说明什么的机制边界

建立状态组合矩阵，区分配置未应用、Rollout 正常推进、人工暂停、资源失败和业务异常。

- **Argo CD Sync/Health 与 Rollout Phase 分别说明什么的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Argo CD Sync/Health 与 Rollout Phase 分别说明什么的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Argo CD Sync/Health 与 Rollout Phase 分别说明什么的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Argo CD Sync/Health 与 Rollout Phase 分别说明什么的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“Argo CD Sync/Health 与 Rollout Phase 分别说明什么”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“Argo CD Sync/Health 与 Rollout Phase 分别说明什么”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### Argo CD Sync/Health 与 Rollout Phase 分别说明什么的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Argo CD Sync/Health 与 Rollout Phase 分别说明什么` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Argo CD Sync/Health 与 Rollout Phase 分别说明什么` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Argo CD Sync/Health 与 Rollout Phase 分别说明什么` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Argo CD Sync/Health 与 Rollout Phase 分别说明什么` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Argo CD Sync/Health 与 Rollout Phase 分别说明什么”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Argo CD Sync/Health 与 Rollout Phase 分别说明什么的静态检查模板

下面命令为“Argo CD Sync/Health 与 Rollout Phase 分别说明什么”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Argo CD Sync/Health 与 Rollout Phase 分别说明什么
evidence_file="./evidence/check-bc3d8c2e16.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Argo CD Sync/Health 与 Rollout Phase 分别说明什么”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Argo CD Sync/Health 与 Rollout Phase 分别说明什么的故障实验与恢复

“Argo CD Sync/Health 与 Rollout Phase 分别说明什么”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Argo CD Sync/Health 与 Rollout Phase 分别说明什么”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Argo CD Sync/Health 与 Rollout Phase 分别说明什么”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Argo CD Sync/Health 与 Rollout Phase 分别说明什么”执行恢复策略：暂停步骤并确保稳定版本容量，执行 Abort 或切回后持续检查 Endpoint、代理配置、版本回显与异步副作用。
4. 重新采集“Argo CD Sync/Health 与 Rollout Phase 分别说明什么”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Argo CD Sync/Health 与 Rollout Phase 分别说明什么”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 如何按 Rollout 到数据面的关系顺序收集故障快照

```bash
kubectl argo rollouts get rollout checkout-api -n production
kubectl describe rollout checkout-api -n production
kubectl get rs,pod,svc,endpointslice -n production \
  -l app=checkout-api -o wide
kubectl get analysisrun -n production \
  -l rollouts-pod-template-hash --sort-by=.metadata.creationTimestamp
kubectl get events -n production \
  --sort-by=.lastTimestamp
```

证据顺序是 Rollout → ReplicaSet → Pod → Service/EndpointSlice → Traffic Router → AnalysisRun → 指标 Provider。对象存在不代表关系正确，重点检查 Selector、Hash、Owner Reference、权重、Ready Endpoint 和状态时间戳。

#### 保存可比较的故障快照

故障快照应同时包含期望、控制器状态和数据面事实：

- Argo CD 目标与实际 Revision、Diff 和最近 Sync 结果。
- Rollout Spec、Status、Conditions、当前 Step 和 StableRS。
- ReplicaSet OwnerReference、Pod Template Hash 与镜像 ID。
- Service Selector、EndpointSlice Ready 地址和路由权重。
- AnalysisRun 每个 Measurement、Provider 错误和查询窗口。
- 同窗口真实请求版本分布、错误率、延迟和关键日志。

所有命令使用同一 Namespace、应用和时间基线，并把输出放进带事件 ID 的受控目录。不要复制 Secret Data、完整 Token 或用户请求体。

恢复后执行相同查询形成对照。只有前后快照才能判断哪个关系恢复、哪个残留仍需处理；单张故障截图无法证明最终状态。

对于短生命周期 Pod 和 AnalysisRun，证据采集要在自动清理前完成，或把关键 Status 持久化到外部发布记录。

#### 如何按 Rollout 到数据面的关系顺序收集故障快照的机制边界

固定 Rollout、ReplicaSet、Pod、Service、EndpointSlice、Router、AnalysisRun 和 Provider 查询顺序。

- **如何按 Rollout 到数据面的关系顺序收集故障快照的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **如何按 Rollout 到数据面的关系顺序收集故障快照的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **如何按 Rollout 到数据面的关系顺序收集故障快照的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **如何按 Rollout 到数据面的关系顺序收集故障快照的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“如何按 Rollout 到数据面的关系顺序收集故障快照”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“如何按 Rollout 到数据面的关系顺序收集故障快照”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 如何按 Rollout 到数据面的关系顺序收集故障快照的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `如何按 Rollout 到数据面的关系顺序收集故障快照` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `如何按 Rollout 到数据面的关系顺序收集故障快照` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `如何按 Rollout 到数据面的关系顺序收集故障快照` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `如何按 Rollout 到数据面的关系顺序收集故障快照` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“如何按 Rollout 到数据面的关系顺序收集故障快照”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 如何按 Rollout 到数据面的关系顺序收集故障快照的静态检查模板

下面命令为“如何按 Rollout 到数据面的关系顺序收集故障快照”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 如何按 Rollout 到数据面的关系顺序收集故障快照
evidence_file="./evidence/check-5e1ca846f3.txt"
kubectl get rollout,svc,endpointslice -n demo -o wide | tee -a "${evidence_file}"
kubectl get httproute,ingress,virtualservice -n demo 2>/dev/null | tee -a "${evidence_file}"
for i in {1..50}; do curl -fsS https://demo.example/version; done | sort | uniq -c | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“如何按 Rollout 到数据面的关系顺序收集故障快照”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 如何按 Rollout 到数据面的关系顺序收集故障快照的故障实验与恢复

“如何按 Rollout 到数据面的关系顺序收集故障快照”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“如何按 Rollout 到数据面的关系顺序收集故障快照”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“如何按 Rollout 到数据面的关系顺序收集故障快照”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“如何按 Rollout 到数据面的关系顺序收集故障快照”执行恢复策略：暂停步骤并确保稳定版本容量，执行 Abort 或切回后持续检查 Endpoint、代理配置、版本回显与异步副作用。
4. 重新采集“如何按 Rollout 到数据面的关系顺序收集故障快照”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“如何按 Rollout 到数据面的关系顺序收集故障快照”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 回滚显示成功但业务未恢复时如何处理副作用

先确认“回滚成功”指的是哪一层：Git 已 Revert、Argo CD 已 Synced、Rollout 已切回，还是业务请求已恢复。常见残留问题包括：

- Service 或路由仍有部分流量指向新版本。
- 连接池和客户端缓存尚未刷新。
- 数据库 Schema 或数据已被新版本改变。
- 消息队列存在新格式消息或重复副作用。
- 缓存污染、Feature Flag 或外部配置未回退。
- 指标窗口仍包含故障期数据，看起来尚未恢复。

每一项都需要独立验证和恢复动作。此时不要继续自动重试发布，应冻结变更并进入事件处置。

#### 按副作用范围升级恢复

先确认新版本是否仍接收请求或后台任务；若仍在运行，立即从入口、消费者和定时任务三处止损。

然后按数据库、队列、缓存、外部 API 和客户端连接逐项指定 Owner、查询和恢复动作。没有明确 Owner 的共享状态优先升级事件负责人。

恢复验证使用新的 Request ID 和业务数据，避免旧指标窗口或缓存结果造成假阳性。

所有副作用处理完成后再解除变更冻结，并创建新的安全 Revision；不要重用已经失败且身份不清的候选。

#### 回滚显示成功但业务未恢复时如何处理副作用的机制边界

按路由、连接、数据库、队列、缓存、Feature Flag 和指标旧窗口逐项指定 Owner 与恢复动作。

- **回滚显示成功但业务未恢复时如何处理副作用的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **回滚显示成功但业务未恢复时如何处理副作用的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **回滚显示成功但业务未恢复时如何处理副作用的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **回滚显示成功但业务未恢复时如何处理副作用的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“回滚显示成功但业务未恢复时如何处理副作用”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“回滚显示成功但业务未恢复时如何处理副作用”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 回滚显示成功但业务未恢复时如何处理副作用的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `回滚显示成功但业务未恢复时如何处理副作用` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `回滚显示成功但业务未恢复时如何处理副作用` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `回滚显示成功但业务未恢复时如何处理副作用` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `回滚显示成功但业务未恢复时如何处理副作用` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“回滚显示成功但业务未恢复时如何处理副作用”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 回滚显示成功但业务未恢复时如何处理副作用的静态检查模板

下面命令为“回滚显示成功但业务未恢复时如何处理副作用”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 回滚显示成功但业务未恢复时如何处理副作用
evidence_file="./evidence/check-6acabe91be.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“回滚显示成功但业务未恢复时如何处理副作用”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 回滚显示成功但业务未恢复时如何处理副作用的故障实验与恢复

“回滚显示成功但业务未恢复时如何处理副作用”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“回滚显示成功但业务未恢复时如何处理副作用”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“回滚显示成功但业务未恢复时如何处理副作用”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“回滚显示成功但业务未恢复时如何处理副作用”执行恢复策略：按副作用范围选择 Git Revert、应用回退、向前修复或数据恢复，并分别验证配置、流量与持久化状态。
4. 重新采集“回滚显示成功但业务未恢复时如何处理副作用”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“回滚显示成功但业务未恢复时如何处理副作用”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 如何用完整渐进式交付实验完成上线验收

运行手册至少包含：

1. 发布对象、策略、预期步骤和时间预算。
2. Stable 与 Canary/Preview 的识别方法。
3. 每步指标、阈值、最低样本量和 Dashboard。
4. Promote、Pause、Abort 权限和审计方式。
5. Registry、Git、Argo CD、Rollouts、Router、Prometheus 的排障入口。
6. 数据库、队列、缓存和外部依赖的兼容性说明。
7. 回滚窗口、旧镜像保留和最坏情况下的恢复方法。
8. 事件升级、责任人和证据包位置。

手册需要通过故障演练验证。静态 YAML、控制器 Ready 和一次成功 Demo 不能证明生产回退路径有效。

#### 用角色交接演练运行手册

由未参与模板编写的值班人员执行四个场景：错误镜像、Preview 探针失败、Prometheus 不可用和路由权重未生效。

每个场景测量：

1. 从告警到定位目标 Revision 的时间。
2. 从 Rollout 到数据面证据的查询是否完整。
3. 值班人员是否有读取、Pause、Abort 和升级权限。
4. 止损动作是否保持 Git 与运行态可解释。
5. 恢复后是否完成证据包和临时资源清理。

如果演练人员需要询问模板作者命令参数、指标含义或安全版本，手册仍有隐含知识。把问题补成决策表或可复制查询，再由另一人重跑。

每次控制器、路由组件、指标系统或策略升级后重跑相关场景。手册的有效期由系统变化决定，不能只按日历复审。

#### 上线前如何做完整验收

- [ ] ImageUpdater 只能匹配授权 Application 和镜像。
- [ ] 候选策略排除临时 Tag，并验证目标平台。
- [ ] Git Write-back 使用受限身份，冲突和失败可见。
- [ ] Rollout、Service、AnalysisTemplate 和路由对象通过 Server-side Dry Run。
- [ ] BlueGreen 或 Canary 的容量预算满足峰值。
- [ ] 指标查询处理空值、多值、低流量和延迟。
- [ ] Provider 不可用时默认暂停，不默认成功。
- [ ] Promote、Abort 和 Break Glass 均有最小权限与审计。
- [ ] 已演练错误镜像、探针失败、指标失败、路由失败和回滚。
- [ ] 最终成功由真实请求、业务指标和交付证据共同确认。

渐进式交付的价值不在于“发布步骤更多”，而在于用较小流量和明确证据，把未知风险暴露在可停止、可恢复的窗口内。

验收不能只勾选清单，还要为每项附上可复查证据：

| 验收域 | 最小证据 |
|---|---|
| 镜像自动化 | 候选集合、策略版本、机器人 Commit、最终 Digest |
| 配置调谐 | Argo CD Revision、Diff、Sync 和 Health 时间线 |
| 发布控制 | Rollout Step、ReplicaSet、Service 与路由前后快照 |
| 指标门禁 | AnalysisRun、Measurement、查询版本和样本量 |
| 真实流量 | Request ID、版本回显、Stable/Canary 请求分布 |
| 故障恢复 | Abort 或回退耗时、数据面恢复和副作用检查 |
| 权限审计 | Promote、Abort、Break Glass 操作者与理由 |

由没有参与实现的审核者随机选择一个成功发布和一个失败发布，沿证据链从业务请求反查到配置与源码。任何一步只能依赖口述，都视为未通过。

验收结果要写明剩余风险和适用边界。例如仅验证无状态 HTTP 服务，不代表队列消费者、定时任务和数据库破坏性迁移可以直接复用同一策略。

正式启用后设置首批发布的更严格观察窗口和人工值守。连续多次达到成功、失败和回退标准后，再扩大自动晋级范围。

每次扩大范围都重新确认容量、指标区分度和旧版本保留窗口仍然成立。

#### 如何用完整渐进式交付实验完成上线验收的机制边界

从新镜像候选、Git Write-back、Argo CD Sync、流量步骤、Analysis、失败 Abort 到证据包执行一条成功和一条失败路径。

- **如何用完整渐进式交付实验完成上线验收的声明输入**：ImageUpdater、Rollout 与 Analysis 声明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **如何用完整渐进式交付实验完成上线验收的控制过程**：Image Updater、Argo CD、Rollouts 与路由控制器分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **如何用完整渐进式交付实验完成上线验收的运行结果**：ReplicaSet、Endpoint、代理配置与真实请求必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **如何用完整渐进式交付实验完成上线验收的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“如何用完整渐进式交付实验完成上线验收”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“如何用完整渐进式交付实验完成上线验收”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 如何用完整渐进式交付实验完成上线验收的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `如何用完整渐进式交付实验完成上线验收` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `如何用完整渐进式交付实验完成上线验收` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `如何用完整渐进式交付实验完成上线验收` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `如何用完整渐进式交付实验完成上线验收` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“如何用完整渐进式交付实验完成上线验收”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 如何用完整渐进式交付实验完成上线验收的静态检查模板

下面命令为“如何用完整渐进式交付实验完成上线验收”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 如何用完整渐进式交付实验完成上线验收
evidence_file="./evidence/check-251f5447e8.txt"
kubectl argo rollouts get rollout checkout -n demo --watch | tee -a "${evidence_file}"
kubectl get rs,pod,svc,endpointslice -n demo -l app=checkout -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“如何用完整渐进式交付实验完成上线验收”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 如何用完整渐进式交付实验完成上线验收的故障实验与恢复

“如何用完整渐进式交付实验完成上线验收”的可逆故障场景是：暂停当前步骤并保持稳定版本容量，保存路由和分析快照后再决定 Abort 或继续。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“如何用完整渐进式交付实验完成上线验收”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“如何用完整渐进式交付实验完成上线验收”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“如何用完整渐进式交付实验完成上线验收”执行恢复策略：冻结后续变更并保留当前稳定状态，恢复版本化输入后等待控制器重新收敛，再用业务证据关闭事件。
4. 重新采集“如何用完整渐进式交付实验完成上线验收”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“如何用完整渐进式交付实验完成上线验收”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 9 章 · 发布观测与放量决策

### 监控、业务指标和破坏性验证如何决定是否继续放量
渐进式发布的分析指标只能回答“当前版本是否满足门禁”，不能替代业务验收。技术指标应与请求成功率、关键交易完成率、延迟分位数、队列年龄和资源饱和度共同判断，并且按版本、集群、地域和租户拆分。

#### 先定义停止条件再配置分析模板

停止条件至少包括：严重错误率、关键业务失败率、P99 延迟、依赖错误、队列积压和资源上限。每个条件应有观察窗口、最小样本、暂停动作和恢复责任人。没有足够样本时结果应标为未知，不能自动放量。

#### 将故障实验纳入发布验收

破坏性测试应从低风险、可恢复的故障开始，例如单个实例不可用、依赖延迟或只读降级。实验前保存版本和流量基线，实验中只注入一个主要变量，实验后验证控制器、路由、连接和数据副作用已经恢复。实验通过说明恢复路径有效，不代表可以跳过正常发布门禁。
