# GitOps 供应链、安全与交付运维学习笔记

## 第 1 章 · CI 与 GitOps 之间建立不可变制品契约

### 一条可信构建链应交付哪些制品和证明

CI 的核心产物不只是一个“构建成功”的绿色状态，而是一组可以被后续验证的对象：测试结果、不可变制品、镜像 Digest、SBOM、漏洞扫描结果、签名和来源证明。GitOps 控制器引用制品时，应能判断它来自哪次源码变更、经过哪些门禁、是否仍满足当前策略。

```mermaid
flowchart LR
    Source[Source revision] --> Test[Test and lint]
    Test --> Build[Hermetic build]
    Build --> Image[Image digest]
    Build --> SBOM[SBOM]
    Image --> Sign[Signature and provenance]
    SBOM --> Policy[Policy evaluation]
    Sign --> Policy
    Policy --> Proposal[Environment change proposal]
```

构建链至少回答以下问题：

- 输入源码是否固定到 Commit，而不是浮动分支？
- 依赖、基础镜像和构建器版本是否可追溯？
- 构建凭据是否只在需要的步骤出现，且不会进入镜像层？
- 输出是否用 Digest 标识，Tag 是否设置不可变规则？
- SBOM 和签名是否与同一 Digest 绑定？
- 扫描失败、签名缺失或证明不完整时，后续晋级是否自动阻断？

Tag 适合表达 `v2.8.4`、`staging` 等人类语义，但 Registry 管理员可能重新指向它。Digest 是内容身份，适合生产配置。若团队需要可读版本和不可变身份，可以同时记录 `image:tag` 与 `digest`，但实际拉取必须固定 Digest。

#### 验证制品而不是信任流水线名称

一条名为 `release` 的 Job 成功，不足以证明制品可信。消费者应根据制品附带的身份和证明独立验证：

1. Digest 是否存在于允许的 Registry 和 Repository。
2. 来源证明中的源码仓库、Commit 和构建入口是否符合策略。
3. 签名身份是否来自受保护分支或受控发布环境。
4. SBOM 是否覆盖目标平台，扫描结果是否在有效期内。
5. 多架构 Index 引用的每个生产平台 Manifest 是否都被验证。
6. 构建参数、基础镜像和依赖锁文件是否进入证明材料。

验证失败时应区分“证据缺失”“证据无效”“策略不允许”和“验证服务不可用”。前三类拒绝晋级，最后一类应进入明确定义的 Fail Closed 或限时人工例外，不能静默放行。

抽样从生产 Pod 的 `imageID` 开始，反向查询签名、SBOM、构建运行和源码 Commit。若证据只挂在 Tag 上，Tag 变更后历史关联会丢失。

基础镜像或关键依赖出现漏洞时，还要能回答哪些生产 Digest 受影响。只有生成 SBOM 没有建立可查询索引，供应链证据仍无法支持应急响应。

#### 一条可信构建链应交付哪些制品和证明的机制边界

连接 Source SHA、Image Index/Manifest Digest、SBOM、Provenance、签名、扫描和候选状态。

- **一条可信构建链应交付哪些制品和证明的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **一条可信构建链应交付哪些制品和证明的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **一条可信构建链应交付哪些制品和证明的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **一条可信构建链应交付哪些制品和证明的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“一条可信构建链应交付哪些制品和证明”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“一条可信构建链应交付哪些制品和证明”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 一条可信构建链应交付哪些制品和证明的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `一条可信构建链应交付哪些制品和证明` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `一条可信构建链应交付哪些制品和证明` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `一条可信构建链应交付哪些制品和证明` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `一条可信构建链应交付哪些制品和证明` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“一条可信构建链应交付哪些制品和证明”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 一条可信构建链应交付哪些制品和证明的静态检查模板

下面命令为“一条可信构建链应交付哪些制品和证明”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 一条可信构建链应交付哪些制品和证明
evidence_file="./evidence/check-106ba71c8e.txt"
docker buildx imagetools inspect "$IMAGE_REF" | tee -a "${evidence_file}"
cosign verify "$IMAGE_REF" | tee -a "${evidence_file}"
cosign verify-attestation --type slsaprovenance "$IMAGE_REF" | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“一条可信构建链应交付哪些制品和证明”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 一条可信构建链应交付哪些制品和证明的故障实验与恢复

“一条可信构建链应交付哪些制品和证明”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“一条可信构建链应交付哪些制品和证明”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“一条可信构建链应交付哪些制品和证明”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“一条可信构建链应交付哪些制品和证明”执行恢复策略：隔离候选 Digest 并保留原证明，补齐或重新签发证据后由消费者独立复验，不通过修改 Tag 绕过门禁。
4. 重新采集“一条可信构建链应交付哪些制品和证明”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“一条可信构建链应交付哪些制品和证明”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 构建输入如何固定并解释不可复现差异

覆盖基础镜像、锁文件、Builder、时间戳、网络下载、平台和缓存来源；给出两次构建对比实验。

#### 构建输入如何固定并解释不可复现差异的机制边界


- **构建输入如何固定并解释不可复现差异的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **构建输入如何固定并解释不可复现差异的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **构建输入如何固定并解释不可复现差异的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **构建输入如何固定并解释不可复现差异的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“构建输入如何固定并解释不可复现差异”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“构建输入如何固定并解释不可复现差异”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 构建输入如何固定并解释不可复现差异的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `构建输入如何固定并解释不可复现差异` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `构建输入如何固定并解释不可复现差异` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `构建输入如何固定并解释不可复现差异` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `构建输入如何固定并解释不可复现差异` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“构建输入如何固定并解释不可复现差异”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 构建输入如何固定并解释不可复现差异的静态检查模板

下面命令为“构建输入如何固定并解释不可复现差异”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 构建输入如何固定并解释不可复现差异
evidence_file="./evidence/check-b062888902.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“构建输入如何固定并解释不可复现差异”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 构建输入如何固定并解释不可复现差异的故障实验与恢复

“构建输入如何固定并解释不可复现差异”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“构建输入如何固定并解释不可复现差异”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“构建输入如何固定并解释不可复现差异”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“构建输入如何固定并解释不可复现差异”执行恢复策略：取消重复运行并冻结外部写入，按源码 SHA 与幂等键查重；只接受能够复验到同一 Digest 的成功结果。
4. 重新采集“构建输入如何固定并解释不可复现差异”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“构建输入如何固定并解释不可复现差异”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 重试、并发和取消如何保持外部写入幂等

流水线重试不能生成无法解释的新制品。相同源码在依赖和构建环境未固定时可能得到不同 Digest；并发构建又可能竞争同一个 Tag，导致“最后推送者”覆盖结果。

建议规则：

1. 候选制品先写入以 Commit SHA 或唯一 Build ID 命名的 Tag。
2. 构建完成后记录 Digest，后续所有扫描和签名都针对 Digest。
3. 人类版本 Tag 只在门禁通过后创建，并启用不可变规则。
4. 同一分支的过期构建可以取消，但已产生的证明要保留状态。
5. 配置仓库变更使用 Digest，不读取“此刻 latest 指向什么”。

缓存提高速度但也是输入。外部缓存被污染可能影响构建；缓存 Key 应包含锁文件、构建器版本和目标平台。密钥挂载使用 BuildKit Secret 或等价机制，不通过 `ARG`、`ENV` 或复制文件进入层。

#### 用重试矩阵验证构建幂等性

为同一 Commit 执行以下实验，并比较 Digest、证明和外部副作用：

| 实验 | 预期 |
|---|---|
| 完整构建两次 | 输入固定时 Digest 相同，或差异有可解释来源 |
| 上传层中断后重试 | 复用已存在 Blob，不产生损坏 Manifest |
| 签名成功后 Job 超时 | 重试识别已有签名，不创建冲突身份 |
| 两个 Runner 并发构建 | 各自写唯一候选，不竞争生产 Tag |
| 配置 PR 创建后回调丢失 | 重试找到既有 PR，不重复创建 |
| 取消旧分支构建 | 已发布制品状态明确，不被误晋级 |

可复现构建受时间戳、包管理器下载、文件排序和基础镜像 Tag 影响。若短期无法做到相同 Digest，也要把每项非确定输入写入来源证明，避免把“同一源码”误认为“同一制品”。

所有外部写操作使用稳定幂等键，例如 Repository、Commit、目标平台和任务类型的组合。Job 日志应显示本次是首次创建、复用既有结果还是发现冲突。

出现冲突时默认停止并保留两个候选，不能用最后完成者覆盖。人工确认差异来源后，重新产生一个有完整身份的新候选。

#### 重试、并发和取消如何保持外部写入幂等的机制边界

设计候选 Tag、Digest、幂等键、签名重试、PR 去重和最后写入者冲突处理。

- **重试、并发和取消如何保持外部写入幂等的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **重试、并发和取消如何保持外部写入幂等的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **重试、并发和取消如何保持外部写入幂等的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **重试、并发和取消如何保持外部写入幂等的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“重试、并发和取消如何保持外部写入幂等”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“重试、并发和取消如何保持外部写入幂等”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 重试、并发和取消如何保持外部写入幂等的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `重试、并发和取消如何保持外部写入幂等` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `重试、并发和取消如何保持外部写入幂等` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `重试、并发和取消如何保持外部写入幂等` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `重试、并发和取消如何保持外部写入幂等` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“重试、并发和取消如何保持外部写入幂等”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 重试、并发和取消如何保持外部写入幂等的静态检查模板

下面命令为“重试、并发和取消如何保持外部写入幂等”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 重试、并发和取消如何保持外部写入幂等
evidence_file="./evidence/check-74e1234e1a.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“重试、并发和取消如何保持外部写入幂等”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 重试、并发和取消如何保持外部写入幂等的故障实验与恢复

“重试、并发和取消如何保持外部写入幂等”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“重试、并发和取消如何保持外部写入幂等”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“重试、并发和取消如何保持外部写入幂等”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“重试、并发和取消如何保持外部写入幂等”执行恢复策略：取消重复运行并冻结外部写入，按源码 SHA 与幂等键查重；只接受能够复验到同一 Digest 的成功结果。
4. 重新采集“重试、并发和取消如何保持外部写入幂等”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“重试、并发和取消如何保持外部写入幂等”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 如何从生产 Pod 逆向验证制品证明

从 `imageID` 反查 Index、平台 Manifest、签名、SBOM、构建运行和源码 Commit。

#### 如何从生产 Pod 逆向验证制品证明的机制边界


- **如何从生产 Pod 逆向验证制品证明的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **如何从生产 Pod 逆向验证制品证明的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **如何从生产 Pod 逆向验证制品证明的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **如何从生产 Pod 逆向验证制品证明的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“如何从生产 Pod 逆向验证制品证明”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“如何从生产 Pod 逆向验证制品证明”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 如何从生产 Pod 逆向验证制品证明的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `如何从生产 Pod 逆向验证制品证明` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `如何从生产 Pod 逆向验证制品证明` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `如何从生产 Pod 逆向验证制品证明` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `如何从生产 Pod 逆向验证制品证明` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“如何从生产 Pod 逆向验证制品证明”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 如何从生产 Pod 逆向验证制品证明的静态检查模板

下面命令为“如何从生产 Pod 逆向验证制品证明”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 如何从生产 Pod 逆向验证制品证明
evidence_file="./evidence/check-776757c49c.txt"
docker buildx imagetools inspect "$IMAGE_REF" | tee -a "${evidence_file}"
cosign verify "$IMAGE_REF" | tee -a "${evidence_file}"
cosign verify-attestation --type slsaprovenance "$IMAGE_REF" | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“如何从生产 Pod 逆向验证制品证明”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 如何从生产 Pod 逆向验证制品证明的故障实验与恢复

“如何从生产 Pod 逆向验证制品证明”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“如何从生产 Pod 逆向验证制品证明”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“如何从生产 Pod 逆向验证制品证明”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“如何从生产 Pod 逆向验证制品证明”执行恢复策略：隔离候选 Digest 并保留原证明，补齐或重新签发证据后由消费者独立复验，不通过修改 Tag 绕过门禁。
4. 重新采集“如何从生产 Pod 逆向验证制品证明”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“如何从生产 Pod 逆向验证制品证明”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 2 章 · GitHub Actions、GitLab CI 和 Tekton 如何落地

### GitHub Actions 如何实现受保护的镜像构建

通用 CI 阶段设计与不可变制品原则参见 [Jenkins 交付实践](../jenkins/delivery-practice.md)；本章只展开 GitHub Actions 的身份、权限、输入固定和证明交付。

三类工具都能完成镜像构建，但运行位置、身份来源和维护责任不同。

| 维度 | GitHub Actions | GitLab CI | Tekton |
|---|---|---|---|
| 控制面 | GitHub 托管 | GitLab 托管或自建 | Kubernetes CRD 与控制器 |
| Runner | 托管或自托管 | Shared 或自托管 Runner | 每个 TaskRun 创建 Pod |
| 流水线定义 | Workflow YAML | `.gitlab-ci.yml` | Task、Pipeline、Run 对象 |
| 身份 | 平台 Token、OIDC | Job Token、OIDC、变量 | ServiceAccount、Secret、Workload Identity |
| 运维成本 | 托管最低 | 自建时中等 | 控制器、CRD、Pod 和存储均需维护 |
| 适合 | GitHub 生态和快速落地 | GitLab 一体化平台 | Kubernetes 原生平台和可复用 Task 产品化 |

工具选择不是 GitOps 是否成立的判定条件。只要 CI 不直接篡改运行态、制品不可变、期望状态进入版本化仓库，后续由 Agent 拉取和调谐，都可以形成 GitOps 工作流。

Tekton 的 `Task`、`TaskRun`、`Pipeline`、`PipelineRun` 当前稳定 API 使用 `tekton.dev/v1`。课程中的 `v1beta1` 只能作为迁移背景，不能复制为默认示例。

```yaml
apiVersion: tekton.dev/v1
kind: Pipeline
metadata:
  name: image-verification
spec:
  params:
    - name: image
      type: string
  tasks:
    - name: verify-image
      taskRef:
        name: verify-image
      params:
        - name: image
          value: $(params.image)
```

流水线是供应链高价值入口。攻击者不一定修改业务代码，只要控制一个第三方 Action、Runner 镜像或共享脚本，就可能读取 Token、篡改制品并提交配置变更。

GitHub Actions 应显式声明最小权限：

```yaml
name: verify
on:
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          persist-credentials: false
      - run: ./scripts/test.sh
```

示例用 Major Tag 便于阅读；高保证环境应按组织策略固定到经过审查的完整 Commit SHA，并通过依赖更新机器人提出升级。自托管 Runner 需要区分受信分支和外部 Pull Request，避免不可信代码接触内部网络、云元数据或持久化 Workspace。

优先使用 OIDC 或工作负载身份换取短期云凭据。长期 Access Key、Registry 密码和 Git Token 不应作为全局变量共享给所有 Job。每个凭据要限定 Audience、Repository、Branch、Environment 和操作范围。

#### 对 CI 做一次身份与输入威胁建模

按“谁能修改输入、任务以谁的身份运行、结果写到哪里”审查每个 Job：

| 输入或组件 | 主要威胁 | 控制措施 | 验证证据 |
|---|---|---|---|
| Pull Request 代码 | 不可信代码读取凭据 | Fork 任务不注入生产 Secret | Job 权限和事件类型 |
| 第三方 Action | 上游 Tag 被替换 | 固定完整 Commit SHA | Workflow Diff 和依赖清单 |
| Runner 镜像 | 预装工具被污染 | 固定镜像、定期重建和扫描 | Runner 镜像 Digest |
| OIDC Token | Audience 或 Subject 过宽 | 云端条件绑定仓库、分支和环境 | IAM 信任策略 |
| 构建缓存 | 跨租户缓存投毒 | 隔离命名空间并验证缓存键 | 缓存来源和命中记录 |
| 输出制品 | 未授权覆盖生产 Tag | Repository 不可变和独立发布身份 | Registry 审计日志 |

默认 Job 权限从只读开始，只有需要写回代码、上传证明或发布制品的任务单独提升。把 `contents: write` 放在 Workflow 顶层，会让所有第三方步骤继承不必要权限。

轮换凭据时验证旧凭据已失效，而不是只确认新凭据可用。删除 Repository Secret 也不代表外部云端 Access Key 已吊销，两侧都要检查。

最后模拟一个来自 Fork 的恶意 PR 和一个被修改的第三方 Action 引用，确认任务无法取得生产身份、无法向正式 Repository 写入，也不会把敏感值输出到日志和 Artifact。

#### GitHub Actions 如何实现受保护的镜像构建的机制边界

给出 Event、Job、Step、Environment、OIDC、缓存、Buildx、证明上传和完整 SHA 固定的当前 Workflow。

- **GitHub Actions 如何实现受保护的镜像构建的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **GitHub Actions 如何实现受保护的镜像构建的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **GitHub Actions 如何实现受保护的镜像构建的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **GitHub Actions 如何实现受保护的镜像构建的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“GitHub Actions 如何实现受保护的镜像构建”，Tag 用于导航，Digest 才承担不可变身份；Index 与平台 Manifest 的关系必须在生产架构上展开验证。
对于“GitHub Actions 如何实现受保护的镜像构建”，证明、签名、扫描和制品应绑定同一内容身份，验证服务不可用要记为未知而不是自动放行。

#### GitHub Actions 如何实现受保护的镜像构建的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `GitHub Actions 如何实现受保护的镜像构建` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `GitHub Actions 如何实现受保护的镜像构建` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `GitHub Actions 如何实现受保护的镜像构建` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `GitHub Actions 如何实现受保护的镜像构建` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“GitHub Actions 如何实现受保护的镜像构建”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### GitHub Actions 如何实现受保护的镜像构建的静态检查模板

下面命令为“GitHub Actions 如何实现受保护的镜像构建”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: GitHub Actions 如何实现受保护的镜像构建
evidence_file="./evidence/check-fcfb7ef624.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“GitHub Actions 如何实现受保护的镜像构建”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### GitHub Actions 如何实现受保护的镜像构建的故障实验与恢复

“GitHub Actions 如何实现受保护的镜像构建”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“GitHub Actions 如何实现受保护的镜像构建”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“GitHub Actions 如何实现受保护的镜像构建”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“GitHub Actions 如何实现受保护的镜像构建”执行恢复策略：取消重复运行并冻结外部写入，按源码 SHA 与幂等键查重；只接受能够复验到同一 Digest 的成功结果。
4. 重新采集“GitHub Actions 如何实现受保护的镜像构建”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“GitHub Actions 如何实现受保护的镜像构建”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### GitLab CI 如何组织 Stage、Runner、缓存和受保护变量

给出 `rules`、受保护分支、Runner 隔离、缓存和制品传递示例，并与 Docker-in-Docker 风险对照。

#### GitLab CI 如何组织 Stage、Runner、缓存和受保护变量的机制边界


- **GitLab CI 如何组织 Stage、Runner、缓存和受保护变量的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **GitLab CI 如何组织 Stage、Runner、缓存和受保护变量的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **GitLab CI 如何组织 Stage、Runner、缓存和受保护变量的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **GitLab CI 如何组织 Stage、Runner、缓存和受保护变量的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“GitLab CI 如何组织 Stage、Runner、缓存和受保护变量”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“GitLab CI 如何组织 Stage、Runner、缓存和受保护变量”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### GitLab CI 如何组织 Stage、Runner、缓存和受保护变量的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `GitLab CI 如何组织 Stage、Runner、缓存和受保护变量` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `GitLab CI 如何组织 Stage、Runner、缓存和受保护变量` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `GitLab CI 如何组织 Stage、Runner、缓存和受保护变量` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `GitLab CI 如何组织 Stage、Runner、缓存和受保护变量` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“GitLab CI 如何组织 Stage、Runner、缓存和受保护变量”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### GitLab CI 如何组织 Stage、Runner、缓存和受保护变量的静态检查模板

下面命令为“GitLab CI 如何组织 Stage、Runner、缓存和受保护变量”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: GitLab CI 如何组织 Stage、Runner、缓存和受保护变量
evidence_file="./evidence/check-4d8bd89d7a.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“GitLab CI 如何组织 Stage、Runner、缓存和受保护变量”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### GitLab CI 如何组织 Stage、Runner、缓存和受保护变量的故障实验与恢复

“GitLab CI 如何组织 Stage、Runner、缓存和受保护变量”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“GitLab CI 如何组织 Stage、Runner、缓存和受保护变量”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“GitLab CI 如何组织 Stage、Runner、缓存和受保护变量”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“GitLab CI 如何组织 Stage、Runner、缓存和受保护变量”执行恢复策略：取消重复运行并冻结外部写入，按源码 SHA 与幂等键查重；只接受能够复验到同一 Digest 的成功结果。
4. 重新采集“GitLab CI 如何组织 Stage、Runner、缓存和受保护变量”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“GitLab CI 如何组织 Stage、Runner、缓存和受保护变量”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建

给出 Task、Pipeline、PipelineRun、Result、Workspace、ServiceAccount 和超时配置；排除旧 `v1beta1` 与 PSP。

#### Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建的机制边界


- **Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建的静态检查模板

下面命令为“Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建
evidence_file="./evidence/check-1b577b8d0d.txt"
kubectl get pipelinerun -n ci | tee -a "${evidence_file}"
kubectl get taskrun -n ci | tee -a "${evidence_file}"
kubectl logs -n ci -l app.kubernetes.io/part-of=tekton-triggers | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建的故障实验与恢复

“Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建”执行恢复策略：取消重复运行并冻结外部写入，按源码 SHA 与幂等键查重；只接受能够复验到同一 Digest 的成功结果。
4. 重新采集“Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Tekton v1 如何用 Task、Pipeline 和 Workspace 表达构建”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Tekton Triggers 如何安全接收 Webhook 并防止伪造

覆盖 EventListener、TriggerBinding、TriggerTemplate、签名验证、参数过滤、重放和重复触发。

#### Tekton Triggers 如何安全接收 Webhook 并防止伪造的机制边界


- **Tekton Triggers 如何安全接收 Webhook 并防止伪造的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Tekton Triggers 如何安全接收 Webhook 并防止伪造的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Tekton Triggers 如何安全接收 Webhook 并防止伪造的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Tekton Triggers 如何安全接收 Webhook 并防止伪造的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“Tekton Triggers 如何安全接收 Webhook 并防止伪造”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“Tekton Triggers 如何安全接收 Webhook 并防止伪造”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### Tekton Triggers 如何安全接收 Webhook 并防止伪造的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Tekton Triggers 如何安全接收 Webhook 并防止伪造` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Tekton Triggers 如何安全接收 Webhook 并防止伪造` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Tekton Triggers 如何安全接收 Webhook 并防止伪造` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Tekton Triggers 如何安全接收 Webhook 并防止伪造` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Tekton Triggers 如何安全接收 Webhook 并防止伪造”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Tekton Triggers 如何安全接收 Webhook 并防止伪造的静态检查模板

下面命令为“Tekton Triggers 如何安全接收 Webhook 并防止伪造”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Tekton Triggers 如何安全接收 Webhook 并防止伪造
evidence_file="./evidence/check-f4497556ba.txt"
kubectl get pipelinerun -n ci | tee -a "${evidence_file}"
kubectl get taskrun -n ci | tee -a "${evidence_file}"
kubectl logs -n ci -l app.kubernetes.io/part-of=tekton-triggers | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Tekton Triggers 如何安全接收 Webhook 并防止伪造”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Tekton Triggers 如何安全接收 Webhook 并防止伪造的故障实验与恢复

“Tekton Triggers 如何安全接收 Webhook 并防止伪造”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Tekton Triggers 如何安全接收 Webhook 并防止伪造”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Tekton Triggers 如何安全接收 Webhook 并防止伪造”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Tekton Triggers 如何安全接收 Webhook 并防止伪造”执行恢复策略：取消重复运行并冻结外部写入，按源码 SHA 与幂等键查重；只接受能够复验到同一 Digest 的成功结果。
4. 重新采集“Tekton Triggers 如何安全接收 Webhook 并防止伪造”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Tekton Triggers 如何安全接收 Webhook 并防止伪造”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 3 章 · Harbor 如何成为可运营的制品控制面

### Project、Repository、Tag、Digest 和 Index 如何形成权限边界

Registry 是提供 OCI 分发 API 的服务，Repository 是某个镜像或 Artifact 的名称空间，Tag 是可读引用，Digest 是 Manifest 内容哈希。生产排障时混淆这四者，会出现“Tag 存在但平台不匹配”“镜像可拉取但不是预期内容”等问题。

```text
harbor.example.com/payments/checkout-api:2.8.4
| registry host    | project | repository | tag |

harbor.example.com/payments/checkout-api@sha256:0123456789abcdef...
| registry host    | project | repository | immutable digest    |
```

多平台镜像的顶层 Digest 通常指向 OCI Image Index，Index 再引用 amd64、arm64 等平台 Manifest。准入和签名策略要明确验证 Index 还是子 Manifest；只检查 Tag 或其中一个架构会留下缺口。

#### 从运行节点反查 Registry 语义

选择 amd64 和 arm64 节点各启动一个测试 Pod，记录以下信息：

- 清单中的镜像引用。
- Pod Status 中的 `imageID`。
- Index Digest 与平台 Manifest Digest。
- Registry 返回的媒体类型和平台字段。
- 签名和扫描绑定的是 Index 还是子 Manifest。

若两个平台使用同一 Tag 却取得不同构建批次，说明发布过程没有把 Index 当作一个原子制品。应先生成所有平台 Manifest，再创建并签名最终 Index，最后才允许配置仓库引用。

运行时固定 Index Digest 能保证平台集合不被替换，但节点最终运行的是子 Manifest。审计系统应同时保存二者，才能回答“这个发布允许了什么”和“这台节点实际运行了什么”。

清理策略也要从引用图判断。删除未加 Tag 的子 Manifest 可能破坏仍被 Index 引用的多平台镜像；垃圾回收前必须验证 Registry 的可达性分析结果。

#### Project、Repository、Tag、Digest 和 Index 如何形成权限边界的机制边界

区分对象身份、多架构引用图、项目隔离和元数据可见性；从 amd64/arm64 节点反查实际内容。

- **Project、Repository、Tag、Digest 和 Index 如何形成权限边界的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Project、Repository、Tag、Digest 和 Index 如何形成权限边界的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Project、Repository、Tag、Digest 和 Index 如何形成权限边界的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Project、Repository、Tag、Digest 和 Index 如何形成权限边界的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“Project、Repository、Tag、Digest 和 Index 如何形成权限边界”，Tag 用于导航，Digest 才承担不可变身份；Index 与平台 Manifest 的关系必须在生产架构上展开验证。
对于“Project、Repository、Tag、Digest 和 Index 如何形成权限边界”，证明、签名、扫描和制品应绑定同一内容身份，验证服务不可用要记为未知而不是自动放行。

#### Project、Repository、Tag、Digest 和 Index 如何形成权限边界的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Project、Repository、Tag、Digest 和 Index 如何形成权限边界` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Project、Repository、Tag、Digest 和 Index 如何形成权限边界` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Project、Repository、Tag、Digest 和 Index 如何形成权限边界` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Project、Repository、Tag、Digest 和 Index 如何形成权限边界` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Project、Repository、Tag、Digest 和 Index 如何形成权限边界”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Project、Repository、Tag、Digest 和 Index 如何形成权限边界的静态检查模板

下面命令为“Project、Repository、Tag、Digest 和 Index 如何形成权限边界”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Project、Repository、Tag、Digest 和 Index 如何形成权限边界
evidence_file="./evidence/check-6e12bef874.txt"
docker buildx imagetools inspect "$IMAGE_REF" | tee -a "${evidence_file}"
crane digest "$IMAGE_REF" | tee -a "${evidence_file}"
crane manifest "$IMAGE_REF" | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Project、Repository、Tag、Digest 和 Index 如何形成权限边界”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Project、Repository、Tag、Digest 和 Index 如何形成权限边界的故障实验与恢复

“Project、Repository、Tag、Digest 和 Index 如何形成权限边界”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Project、Repository、Tag、Digest 和 Index 如何形成权限边界”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Project、Repository、Tag、Digest 和 Index 如何形成权限边界”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Project、Repository、Tag、Digest 和 Index 如何形成权限边界”执行恢复策略：暂停发布和非必要重调度，从区域副本恢复同一 Digest，复验 Manifest、Blob、证明与拉取身份后再释放队列。
4. 重新采集“Project、Repository、Tag、Digest 和 Index 如何形成权限边界”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Project、Repository、Tag、Digest 和 Index 如何形成权限边界”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Robot Account 和节点拉取身份如何最小授权与轮换

Harbor 的 Project 是主要隔离单元。不要让所有团队共享一个项目和管理员账号。常见拆分维度是租户、业务域和环境等级；生产镜像可以通过复制或晋级进入受控项目，而不是让所有 CI 直接写生产仓库。

身份至少分为：

- CI Push 身份：只向指定候选 Repository 写入。
- 生产拉取身份：只读生产 Project，不允许删除或覆盖。
- 复制身份：只在来源和目标 Project 之间移动已验证 Artifact。
- 运维身份：管理保留、扫描、复制和垃圾回收，不参与日常构建。

Robot Account 适合机器访问，但仍要设置作用域、到期时间和轮换。凭据泄漏时应能按项目撤销，而不影响整个 Registry。审计日志需要关联 Robot、Repository、Digest、来源地址和时间。

权限设计要同时检查 Harbor 权限和外部身份系统。一个 Robot 即使只有 Push 权限，如果目标 Repository 允许覆盖生产 Tag，仍可替换运行制品；一个只读账号若能列出所有项目，也可能泄漏内部服务名称和版本信息。最小权限应覆盖动作和资源可见性。

上线前可以用三组身份做反向验证：CI 身份能推候选但不能删 Artifact，生产节点能拉取但不能推送，普通业务团队不能读取其他项目。测试时使用临时 Repository 和无敏感镜像，避免为了验证权限污染正式制品。

Robot 轮换采用“新增凭据 → 更新消费者 → 验证新凭据 → 撤销旧凭据”的顺序。若先撤销再更新，节点扩容和发布会立即出现 `ImagePullBackOff`；若长期保留双凭据，又扩大了泄漏窗口。

#### 用权限反例验证项目隔离

为每类身份维护允许与拒绝测试，不要只验证正常操作：

- CI 身份能推送候选 Digest，但不能覆盖不可变 Tag、删除 Artifact 或读取其他项目。
- 生产节点身份能拉取指定项目，但不能列出无关 Repository、推送或调用管理 API。
- 复制身份能读取来源并写目标，不能改变扫描结果、保留规则和用户权限。
- 运维身份能执行维护操作，但日常构建任务无法取得该身份。
- 被吊销 Robot 的旧 Token 在所有 Registry 副本和缓存入口都被拒绝。

测试结果记录请求动作、目标资源、HTTP 状态和 Harbor 审计事件。仅凭客户端提示“denied”无法证明服务端记录了正确身份和资源。

新增项目、区域副本或代理缓存时重跑反例，因为外围组件可能放宽原有可见性。权限矩阵是持续验证资产，不是上线时的一次截图。

若产品无法限制 Repository 列表或元数据可见性，要把剩余风险写入架构决策，并通过独立 Registry、网络边界或命名策略降低泄漏价值。

#### Robot Account 和节点拉取身份如何最小授权与轮换的机制边界

分离 CI Push、生产 Pull、复制和运维身份；提供允许/拒绝测试及双凭据轮换过程。

- **Robot Account 和节点拉取身份如何最小授权与轮换的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Robot Account 和节点拉取身份如何最小授权与轮换的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Robot Account 和节点拉取身份如何最小授权与轮换的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Robot Account 和节点拉取身份如何最小授权与轮换的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“Robot Account 和节点拉取身份如何最小授权与轮换”，凭据只在消费者需要的边界解密，Git 与普通日志中不得出现明文。
对于“Robot Account 和节点拉取身份如何最小授权与轮换”，轮换必须同时证明旧凭据已失效、新凭据已覆盖全部消费者，并保留灾备恢复入口。

#### Robot Account 和节点拉取身份如何最小授权与轮换的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Robot Account 和节点拉取身份如何最小授权与轮换` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Robot Account 和节点拉取身份如何最小授权与轮换` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Robot Account 和节点拉取身份如何最小授权与轮换` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Robot Account 和节点拉取身份如何最小授权与轮换` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Robot Account 和节点拉取身份如何最小授权与轮换”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Robot Account 和节点拉取身份如何最小授权与轮换的静态检查模板

下面命令为“Robot Account 和节点拉取身份如何最小授权与轮换”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Robot Account 和节点拉取身份如何最小授权与轮换
evidence_file="./evidence/check-66f6cbc258.txt"
docker buildx imagetools inspect "$IMAGE_REF" | tee -a "${evidence_file}"
crane digest "$IMAGE_REF" | tee -a "${evidence_file}"
crane manifest "$IMAGE_REF" | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Robot Account 和节点拉取身份如何最小授权与轮换”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Robot Account 和节点拉取身份如何最小授权与轮换的故障实验与恢复

“Robot Account 和节点拉取身份如何最小授权与轮换”的可逆故障场景是：撤销旧凭据并轮换新版本，逐个验证生产者、分发者和消费者；残留旧访问能力视为恢复失败。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Robot Account 和节点拉取身份如何最小授权与轮换”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Robot Account 和节点拉取身份如何最小授权与轮换”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Robot Account 和节点拉取身份如何最小授权与轮换”执行恢复策略：先撤销暴露或过期身份，再签发新版本并逐个验证生产者、分发者和消费者，最后证明旧身份已无访问能力。
4. 重新采集“Robot Account 和节点拉取身份如何最小授权与轮换”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Robot Account 和节点拉取身份如何最小授权与轮换”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 不可变、Retention、Replication 和 GC 如何协同

四类策略解决不同问题：

| 策略 | 解决的问题 | 误配风险 |
|---|---|---|
| Tag 不可变 | 防止已发布版本被覆盖 | 所有临时 Tag 都不可变导致堆积 |
| Retention | 保留满足规则的 Artifact | 规则漏掉回滚版本 |
| Replication | 跨区域或环境复制 | 未验证制品被自动扩散 |
| Garbage Collection | 回收不可达 Blob | 与写入并发或误判引用造成风险 |

生产回滚窗口决定最小保留范围。例如发布后要求 30 天内可回退，就必须保留这段时间内的镜像、配置和必要依赖。只保留“最近 10 个 Tag”在高频发布时可能不足一天。

复制策略应以 Digest 和验证状态为条件。目标仓库完成复制不代表目标集群已经能拉取，还要验证 DNS、TLS、身份、网络和平台 Manifest。垃圾回收前先演练恢复，并监控存储增长、未标记 Manifest 和复制积压。

#### 用保留窗口保护回退和取证

先从业务恢复目标倒推制品生命周期：

| 制品类别 | 最短保留依据 | 删除前检查 |
|---|---|---|
| 当前生产版本 | 运行期间加安全窗口 | 所有集群已离开该 Digest |
| 最近安全版本 | 最大回退窗口 | 回退演练仍可拉取 |
| 发布候选 | 审批和观察窗口 | 没有环境仍在评估 |
| 失败构建 | 调试与取证窗口 | 日志、SBOM 和证明已归档 |
| 基础镜像 | 下游可追溯期限 | 受影响镜像索引已保存 |

Tag 保留规则不能代替引用分析。生产配置可能固定 Digest 而没有 Tag，简单删除“未标记镜像”会移除仍在运行或仍需回退的制品。

复制完成要验证目标 Digest、签名、SBOM 和所有平台 Manifest 一致。只复制镜像层而遗漏 Referrer 或证明，会导致灾备环境能启动却不能通过准入策略。

每次垃圾回收先生成候选清单，交叉查询配置仓库、集群运行态和发布记录。删除后抽样拉取当前与回退版本，并保存回收前后容量和错误指标。

若 Registry 产品不能可靠保护外部引用的 Digest，应增加显式保留 Tag 或独立制品目录，而不是假设垃圾回收理解组织的发布语义。

#### 不可变、Retention、Replication 和 GC 如何协同的机制边界

从回退和取证窗口倒推保留，保护无 Tag Digest、Referrer、签名和 SBOM，演练 GC 前后拉取。

- **不可变、Retention、Replication 和 GC 如何协同的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **不可变、Retention、Replication 和 GC 如何协同的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **不可变、Retention、Replication 和 GC 如何协同的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **不可变、Retention、Replication 和 GC 如何协同的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“不可变、Retention、Replication 和 GC 如何协同”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“不可变、Retention、Replication 和 GC 如何协同”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 不可变、Retention、Replication 和 GC 如何协同的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `不可变、Retention、Replication 和 GC 如何协同` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `不可变、Retention、Replication 和 GC 如何协同` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `不可变、Retention、Replication 和 GC 如何协同` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `不可变、Retention、Replication 和 GC 如何协同` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“不可变、Retention、Replication 和 GC 如何协同”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 不可变、Retention、Replication 和 GC 如何协同的静态检查模板

下面命令为“不可变、Retention、Replication 和 GC 如何协同”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 不可变、Retention、Replication 和 GC 如何协同
evidence_file="./evidence/check-06e014bae2.txt"
docker buildx imagetools inspect "$IMAGE_REF" | tee -a "${evidence_file}"
crane digest "$IMAGE_REF" | tee -a "${evidence_file}"
crane manifest "$IMAGE_REF" | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“不可变、Retention、Replication 和 GC 如何协同”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 不可变、Retention、Replication 和 GC 如何协同的故障实验与恢复

“不可变、Retention、Replication 和 GC 如何协同”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“不可变、Retention、Replication 和 GC 如何协同”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“不可变、Retention、Replication 和 GC 如何协同”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“不可变、Retention、Replication 和 GC 如何协同”执行恢复策略：暂停发布和非必要重调度，从区域副本恢复同一 Digest，复验 Manifest、Blob、证明与拉取身份后再释放队列。
4. 重新采集“不可变、Retention、Replication 和 GC 如何协同”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“不可变、Retention、Replication 和 GC 如何协同”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Registry 故障、镜像丢失和跨区域恢复如何演练

覆盖基础镜像、锁文件、Builder、时间戳、网络下载、平台和缓存来源；给出两次构建对比实验。




Registry 故障对已运行 Pod 和新建 Pod 的影响不同。已运行容器通常继续工作，但节点重启、扩容、滚动更新或驱逐会触发拉取；此时故障会迅速从交付系统扩散到运行系统。

止损顺序：

1. 暂停新发布和自动镜像更新。
2. 避免不必要的 Pod 重启、节点维护和扩容缩容。
3. 确认关键节点是否已有目标镜像缓存，但不要把缓存当持久备份。
4. 检查备用 Registry 或跨区域副本是否包含同一 Digest。
5. 恢复后先验证 Registry API、Blob、Manifest、签名和拉取身份，再恢复调谐。

不要在故障中临时把镜像改成相似 Tag。正确恢复对象是经过验证的同一 Digest；若必须选择替代版本，要走明确的回退变更和业务验证。

#### 演练 Registry 故障的恢复路径

在非生产环境分别阻断 DNS、TLS、认证、Manifest 请求和 Blob 下载，因为它们会产生不同症状。演练记录：

1. 已运行 Pod 是否保持服务。
2. 新 Pod、节点扩容和驱逐后的 Pod 分别如何失败。
3. GitOps 控制器、Kubernetes 事件和 Registry 指标谁最先告警。
4. 备用 Registry 是否拥有同一 Digest、签名和平台 Manifest。
5. 恢复后是否出现拉取风暴或认证缓存问题。

故障期间冻结自动更新和非必要滚动操作，但不要关闭对现有工作负载的观测。节点故障仍可能迫使重新调度，应提前为关键服务规划最小镜像缓存或区域副本。

切换备用仓库若改变 Registry Host，就会改变清单引用和可能的签名策略，必须作为配置变更审查。若使用透明镜像代理，要验证代理返回内容仍与原 Digest 匹配。

恢复完成的条件包括 API 可用、关键 Digest 可拉取、证明可查询、节点扩容成功、发布队列受控恢复。只看到 Harbor 页面打开不算恢复。

区分已运行 Pod、新 Pod、节点扩容和发布影响；覆盖 DNS、TLS、认证、Manifest、Blob 与备用仓库。

#### Registry 故障、镜像丢失和跨区域恢复如何演练的机制边界


- **Registry 故障、镜像丢失和跨区域恢复如何演练的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Registry 故障、镜像丢失和跨区域恢复如何演练的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Registry 故障、镜像丢失和跨区域恢复如何演练的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Registry 故障、镜像丢失和跨区域恢复如何演练的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“Registry 故障、镜像丢失和跨区域恢复如何演练”，Tag 用于导航，Digest 才承担不可变身份；Index 与平台 Manifest 的关系必须在生产架构上展开验证。
对于“Registry 故障、镜像丢失和跨区域恢复如何演练”，证明、签名、扫描和制品应绑定同一内容身份，验证服务不可用要记为未知而不是自动放行。

#### Registry 故障、镜像丢失和跨区域恢复如何演练的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Registry 故障、镜像丢失和跨区域恢复如何演练` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Registry 故障、镜像丢失和跨区域恢复如何演练` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Registry 故障、镜像丢失和跨区域恢复如何演练` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Registry 故障、镜像丢失和跨区域恢复如何演练` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Registry 故障、镜像丢失和跨区域恢复如何演练”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Registry 故障、镜像丢失和跨区域恢复如何演练的静态检查模板

下面命令为“Registry 故障、镜像丢失和跨区域恢复如何演练”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Registry 故障、镜像丢失和跨区域恢复如何演练
evidence_file="./evidence/check-2fa1826d8c.txt"
docker buildx imagetools inspect "$IMAGE_REF" | tee -a "${evidence_file}"
crane digest "$IMAGE_REF" | tee -a "${evidence_file}"
crane manifest "$IMAGE_REF" | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Registry 故障、镜像丢失和跨区域恢复如何演练”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Registry 故障、镜像丢失和跨区域恢复如何演练的故障实验与恢复

“Registry 故障、镜像丢失和跨区域恢复如何演练”的可逆故障场景是：分别阻断 DNS、TLS、认证、Manifest 和 Blob，区分已运行 Pod 与新建 Pod 的影响，再以同一 Digest 恢复。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Registry 故障、镜像丢失和跨区域恢复如何演练”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Registry 故障、镜像丢失和跨区域恢复如何演练”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Registry 故障、镜像丢失和跨区域恢复如何演练”执行恢复策略：暂停发布和非必要重调度，从区域副本恢复同一 Digest，复验 Manifest、Blob、证明与拉取身份后再释放队列。
4. 重新采集“Registry 故障、镜像丢失和跨区域恢复如何演练”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Registry 故障、镜像丢失和跨区域恢复如何演练”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 4 章 · 供应链证据如何进入策略门禁

### SBOM、漏洞扫描、签名和 Provenance 分别证明什么

解释内容清单、已知风险、签名身份和构建来源，避免用“扫描通过”替代完整信任判断。

#### SBOM、漏洞扫描、签名和 Provenance 分别证明什么的机制边界


- **SBOM、漏洞扫描、签名和 Provenance 分别证明什么的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **SBOM、漏洞扫描、签名和 Provenance 分别证明什么的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **SBOM、漏洞扫描、签名和 Provenance 分别证明什么的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **SBOM、漏洞扫描、签名和 Provenance 分别证明什么的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“SBOM、漏洞扫描、签名和 Provenance 分别证明什么”，Tag 用于导航，Digest 才承担不可变身份；Index 与平台 Manifest 的关系必须在生产架构上展开验证。
对于“SBOM、漏洞扫描、签名和 Provenance 分别证明什么”，证明、签名、扫描和制品应绑定同一内容身份，验证服务不可用要记为未知而不是自动放行。

#### SBOM、漏洞扫描、签名和 Provenance 分别证明什么的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `SBOM、漏洞扫描、签名和 Provenance 分别证明什么` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `SBOM、漏洞扫描、签名和 Provenance 分别证明什么` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `SBOM、漏洞扫描、签名和 Provenance 分别证明什么` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `SBOM、漏洞扫描、签名和 Provenance 分别证明什么` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“SBOM、漏洞扫描、签名和 Provenance 分别证明什么”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### SBOM、漏洞扫描、签名和 Provenance 分别证明什么的静态检查模板

下面命令为“SBOM、漏洞扫描、签名和 Provenance 分别证明什么”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: SBOM、漏洞扫描、签名和 Provenance 分别证明什么
evidence_file="./evidence/check-3f78062b4e.txt"
docker buildx imagetools inspect "$IMAGE_REF" | tee -a "${evidence_file}"
cosign verify "$IMAGE_REF" | tee -a "${evidence_file}"
cosign verify-attestation --type slsaprovenance "$IMAGE_REF" | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“SBOM、漏洞扫描、签名和 Provenance 分别证明什么”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### SBOM、漏洞扫描、签名和 Provenance 分别证明什么的故障实验与恢复

“SBOM、漏洞扫描、签名和 Provenance 分别证明什么”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“SBOM、漏洞扫描、签名和 Provenance 分别证明什么”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“SBOM、漏洞扫描、签名和 Provenance 分别证明什么”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“SBOM、漏洞扫描、签名和 Provenance 分别证明什么”执行恢复策略：隔离候选 Digest 并保留原证明，补齐或重新签发证据后由消费者独立复验，不通过修改 Tag 绕过门禁。
4. 重新采集“SBOM、漏洞扫描、签名和 Provenance 分别证明什么”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“SBOM、漏洞扫描、签名和 Provenance 分别证明什么”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 多平台镜像的证明应该绑定 Index 还是平台 Manifest

画出 Index、Manifest、Attestation 引用关系，验证每个生产平台均有证明。

#### 多平台镜像的证明应该绑定 Index 还是平台 Manifest的机制边界


- **多平台镜像的证明应该绑定 Index 还是平台 Manifest的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **多平台镜像的证明应该绑定 Index 还是平台 Manifest的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **多平台镜像的证明应该绑定 Index 还是平台 Manifest的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **多平台镜像的证明应该绑定 Index 还是平台 Manifest的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“多平台镜像的证明应该绑定 Index 还是平台 Manifest”，Tag 用于导航，Digest 才承担不可变身份；Index 与平台 Manifest 的关系必须在生产架构上展开验证。
对于“多平台镜像的证明应该绑定 Index 还是平台 Manifest”，证明、签名、扫描和制品应绑定同一内容身份，验证服务不可用要记为未知而不是自动放行。

#### 多平台镜像的证明应该绑定 Index 还是平台 Manifest的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `多平台镜像的证明应该绑定 Index 还是平台 Manifest` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `多平台镜像的证明应该绑定 Index 还是平台 Manifest` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `多平台镜像的证明应该绑定 Index 还是平台 Manifest` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `多平台镜像的证明应该绑定 Index 还是平台 Manifest` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“多平台镜像的证明应该绑定 Index 还是平台 Manifest”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 多平台镜像的证明应该绑定 Index 还是平台 Manifest的静态检查模板

下面命令为“多平台镜像的证明应该绑定 Index 还是平台 Manifest”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 多平台镜像的证明应该绑定 Index 还是平台 Manifest
evidence_file="./evidence/check-c546deab2a.txt"
docker buildx imagetools inspect "$IMAGE_REF" | tee -a "${evidence_file}"
cosign verify "$IMAGE_REF" | tee -a "${evidence_file}"
cosign verify-attestation --type slsaprovenance "$IMAGE_REF" | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“多平台镜像的证明应该绑定 Index 还是平台 Manifest”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 多平台镜像的证明应该绑定 Index 还是平台 Manifest的故障实验与恢复

“多平台镜像的证明应该绑定 Index 还是平台 Manifest”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“多平台镜像的证明应该绑定 Index 还是平台 Manifest”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“多平台镜像的证明应该绑定 Index 还是平台 Manifest”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“多平台镜像的证明应该绑定 Index 还是平台 Manifest”执行恢复策略：隔离候选 Digest 并保留原证明，补齐或重新签发证据后由消费者独立复验，不通过修改 Tag 绕过门禁。
4. 重新采集“多平台镜像的证明应该绑定 Index 还是平台 Manifest”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“多平台镜像的证明应该绑定 Index 还是平台 Manifest”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 准入策略如何区分缺失、无效、不合规和验证器故障

设计 Fail Closed、限时例外、缓存与审计；给出拒绝原因和恢复路径。

#### 准入策略如何区分缺失、无效、不合规和验证器故障的机制边界


- **准入策略如何区分缺失、无效、不合规和验证器故障的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **准入策略如何区分缺失、无效、不合规和验证器故障的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **准入策略如何区分缺失、无效、不合规和验证器故障的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **准入策略如何区分缺失、无效、不合规和验证器故障的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“准入策略如何区分缺失、无效、不合规和验证器故障”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“准入策略如何区分缺失、无效、不合规和验证器故障”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 准入策略如何区分缺失、无效、不合规和验证器故障的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `准入策略如何区分缺失、无效、不合规和验证器故障` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `准入策略如何区分缺失、无效、不合规和验证器故障` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `准入策略如何区分缺失、无效、不合规和验证器故障` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `准入策略如何区分缺失、无效、不合规和验证器故障` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“准入策略如何区分缺失、无效、不合规和验证器故障”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 准入策略如何区分缺失、无效、不合规和验证器故障的静态检查模板

下面命令为“准入策略如何区分缺失、无效、不合规和验证器故障”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 准入策略如何区分缺失、无效、不合规和验证器故障
evidence_file="./evidence/check-d15f097a4f.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“准入策略如何区分缺失、无效、不合规和验证器故障”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 准入策略如何区分缺失、无效、不合规和验证器故障的故障实验与恢复

“准入策略如何区分缺失、无效、不合规和验证器故障”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“准入策略如何区分缺失、无效、不合规和验证器故障”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“准入策略如何区分缺失、无效、不合规和验证器故障”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“准入策略如何区分缺失、无效、不合规和验证器故障”执行恢复策略：隔离候选 Digest 并保留原证明，补齐或重新签发证据后由消费者独立复验，不通过修改 Tag 绕过门禁。
4. 重新采集“准入策略如何区分缺失、无效、不合规和验证器故障”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“准入策略如何区分缺失、无效、不合规和验证器故障”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 基础镜像漏洞如何反查所有生产工作负载

从 SBOM/Provenance 建立受影响 Digest 索引，完成定位、冻结晋级、重建和运行实例确认。

#### 基础镜像漏洞如何反查所有生产工作负载的机制边界


- **基础镜像漏洞如何反查所有生产工作负载的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **基础镜像漏洞如何反查所有生产工作负载的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **基础镜像漏洞如何反查所有生产工作负载的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **基础镜像漏洞如何反查所有生产工作负载的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“基础镜像漏洞如何反查所有生产工作负载”，Tag 用于导航，Digest 才承担不可变身份；Index 与平台 Manifest 的关系必须在生产架构上展开验证。
对于“基础镜像漏洞如何反查所有生产工作负载”，证明、签名、扫描和制品应绑定同一内容身份，验证服务不可用要记为未知而不是自动放行。

#### 基础镜像漏洞如何反查所有生产工作负载的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `基础镜像漏洞如何反查所有生产工作负载` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `基础镜像漏洞如何反查所有生产工作负载` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `基础镜像漏洞如何反查所有生产工作负载` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `基础镜像漏洞如何反查所有生产工作负载` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“基础镜像漏洞如何反查所有生产工作负载”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 基础镜像漏洞如何反查所有生产工作负载的静态检查模板

下面命令为“基础镜像漏洞如何反查所有生产工作负载”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 基础镜像漏洞如何反查所有生产工作负载
evidence_file="./evidence/check-f35dac83ba.txt"
docker buildx imagetools inspect "$IMAGE_REF" | tee -a "${evidence_file}"
cosign verify "$IMAGE_REF" | tee -a "${evidence_file}"
cosign verify-attestation --type slsaprovenance "$IMAGE_REF" | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“基础镜像漏洞如何反查所有生产工作负载”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 基础镜像漏洞如何反查所有生产工作负载的故障实验与恢复

“基础镜像漏洞如何反查所有生产工作负载”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“基础镜像漏洞如何反查所有生产工作负载”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“基础镜像漏洞如何反查所有生产工作负载”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“基础镜像漏洞如何反查所有生产工作负载”执行恢复策略：隔离候选 Digest 并保留原证明，补齐或重新签发证据后由消费者独立复验，不通过修改 Tag 绕过门禁。
4. 重新采集“基础镜像漏洞如何反查所有生产工作负载”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“基础镜像漏洞如何反查所有生产工作负载”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 5 章 · 镜像版本如何安全进入配置仓库

### CI 提交、更新机器人和控制器回写三种模式如何选择

镜像产生后需要进入环境声明，常见有三种模式：

| 模式 | 写入者 | 优点 | 风险 |
|---|---|---|---|
| CI 直接提交 | 构建流水线 | 链路短，容易关联 Build | CI 获得配置仓库写权，职责耦合 |
| 更新机器人提 PR | 独立机器人 | 审核清晰，可聚合策略 | 晋级延迟，需要管理大量 PR |
| Image Updater 调谐 | 集群控制器 | 持续发现新版本，贴近运行环境 | Registry 查询、策略和回写权限复杂 |

生产环境优先选择产生可审查 Git Commit 的方式。直接修改 Argo CD Application 参数是伪持久状态：Application 被 Git 重建或重新同步后可能丢失。即使使用自动回写，也要确定机器人能否直接推主分支，还是必须创建 Pull Request。

选择模式时还要看“谁拥有发布决定”。若业务团队决定何时晋级，机器人应只创建 PR；若开发环境允许自动跟随候选，控制器可以直接回写专用分支；若合规要求职责分离，构建身份不能同时拥有生产配置写权和审批权。

同一组织可以按环境混用模式，但每个环境只能有一个字段 Owner。例如开发环境由 Image Updater 管理镜像字段，生产环境由晋级 PR 管理；不要让 CI、机器人和人工同时修改同一个 Values Key。

#### 用字段所有权表防止多写入者

| 环境 | 镜像字段 Owner | 变更入口 | 冲突时动作 |
|---|---|---|---|
| 开发 | Image Updater | 自动 Git Commit | 暂停机器人并保留当前值 |
| 预生产 | 发布机器人 | 候选晋级 PR | 重新读取远端后更新 |
| 生产 | 环境 Owner | 审批后的晋级 PR | 拒绝覆盖并人工判断 |

从 CI、机器人和人工各制造一次并发变更，确认只有 Owner 的入口能通过门禁，其他路径会得到可操作的拒绝原因。

切换 Owner 时先冻结旧写入者、迁移当前值、启用新写入者并观察两个调谐周期，最后撤销旧权限。

#### CI 提交、更新机器人和控制器回写三种模式如何选择的机制边界

比较写入者、审核、延迟、冲突、环境适用性和恢复方式，定义每个环境唯一字段 Owner。

- **CI 提交、更新机器人和控制器回写三种模式如何选择的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **CI 提交、更新机器人和控制器回写三种模式如何选择的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **CI 提交、更新机器人和控制器回写三种模式如何选择的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **CI 提交、更新机器人和控制器回写三种模式如何选择的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“CI 提交、更新机器人和控制器回写三种模式如何选择”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“CI 提交、更新机器人和控制器回写三种模式如何选择”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### CI 提交、更新机器人和控制器回写三种模式如何选择的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `CI 提交、更新机器人和控制器回写三种模式如何选择` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `CI 提交、更新机器人和控制器回写三种模式如何选择` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `CI 提交、更新机器人和控制器回写三种模式如何选择` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `CI 提交、更新机器人和控制器回写三种模式如何选择` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“CI 提交、更新机器人和控制器回写三种模式如何选择”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### CI 提交、更新机器人和控制器回写三种模式如何选择的静态检查模板

下面命令为“CI 提交、更新机器人和控制器回写三种模式如何选择”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: CI 提交、更新机器人和控制器回写三种模式如何选择
evidence_file="./evidence/check-438cd79796.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“CI 提交、更新机器人和控制器回写三种模式如何选择”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### CI 提交、更新机器人和控制器回写三种模式如何选择的故障实验与恢复

“CI 提交、更新机器人和控制器回写三种模式如何选择”的可逆故障场景是：制造远端 HEAD 前移与重复变更 ID，验证机器人重新读取、重算并去重；禁止强制覆盖受保护分支。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“CI 提交、更新机器人和控制器回写三种模式如何选择”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“CI 提交、更新机器人和控制器回写三种模式如何选择”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“CI 提交、更新机器人和控制器回写三种模式如何选择”执行恢复策略：冻结新的写回，按变更 ID 查找已存在的 Commit 或 PR，重新读取远端 HEAD 后重算；错误提交使用显式 Revert。
4. 重新采集“CI 提交、更新机器人和控制器回写三种模式如何选择”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“CI 提交、更新机器人和控制器回写三种模式如何选择”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### SemVer、Regex、Digest 和多架构规则如何组成候选集合

建立稳定版、预发布、重推 Tag、缺平台、缺签名和空候选测试集。

#### SemVer、Regex、Digest 和多架构规则如何组成候选集合的机制边界


- **SemVer、Regex、Digest 和多架构规则如何组成候选集合的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **SemVer、Regex、Digest 和多架构规则如何组成候选集合的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **SemVer、Regex、Digest 和多架构规则如何组成候选集合的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **SemVer、Regex、Digest 和多架构规则如何组成候选集合的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“SemVer、Regex、Digest 和多架构规则如何组成候选集合”，Tag 用于导航，Digest 才承担不可变身份；Index 与平台 Manifest 的关系必须在生产架构上展开验证。
对于“SemVer、Regex、Digest 和多架构规则如何组成候选集合”，证明、签名、扫描和制品应绑定同一内容身份，验证服务不可用要记为未知而不是自动放行。

#### SemVer、Regex、Digest 和多架构规则如何组成候选集合的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `SemVer、Regex、Digest 和多架构规则如何组成候选集合` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `SemVer、Regex、Digest 和多架构规则如何组成候选集合` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `SemVer、Regex、Digest 和多架构规则如何组成候选集合` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `SemVer、Regex、Digest 和多架构规则如何组成候选集合` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“SemVer、Regex、Digest 和多架构规则如何组成候选集合”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### SemVer、Regex、Digest 和多架构规则如何组成候选集合的静态检查模板

下面命令为“SemVer、Regex、Digest 和多架构规则如何组成候选集合”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: SemVer、Regex、Digest 和多架构规则如何组成候选集合
evidence_file="./evidence/check-c386969e6a.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“SemVer、Regex、Digest 和多架构规则如何组成候选集合”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### SemVer、Regex、Digest 和多架构规则如何组成候选集合的故障实验与恢复

“SemVer、Regex、Digest 和多架构规则如何组成候选集合”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“SemVer、Regex、Digest 和多架构规则如何组成候选集合”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“SemVer、Regex、Digest 和多架构规则如何组成候选集合”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“SemVer、Regex、Digest 和多架构规则如何组成候选集合”执行恢复策略：暂停镜像扫描或写回，恢复上一个配置 Commit，修正规则后用固定候选集双算，确认不会再次选择错误版本。
4. 重新采集“SemVer、Regex、Digest 和多架构规则如何组成候选集合”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“SemVer、Regex、Digest 和多架构规则如何组成候选集合”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### ImageUpdater CRD 如何表达扫描、匹配、凭据和写回

Argo CD Image Updater 1.x 使用独立 `ImageUpdater` CRD。课程中的 Application annotations 属于旧配置方式，只适合迁移对照。

```yaml
apiVersion: argocd-image-updater.argoproj.io/v1alpha1
kind: ImageUpdater
metadata:
  name: production-images
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

字段仍需按部署版本的 CRD Schema 验证。尤其不要继续使用已移除的 `spec.namespace`；控制器按 `ImageUpdater` 对象的 `metadata.namespace` 查找 Application。

#### 上线前检查 CRD、对象和控制器是否一致

先从集群读取 CRD Schema 和控制器镜像版本，再提交对象。文档、Helm Chart 和控制器可能来自不同版本，静态 YAML 正确也可能被集群拒绝。

检查顺序：

1. `kubectl explain imageupdater.spec` 能看到计划使用的字段。
2. 对象 Namespace 与目标 Application 的发现范围一致。
3. `namePattern` 只匹配预期 Application，数量在预算内。
4. 镜像别名唯一，策略、Tag 过滤和凭据引用完整。
5. Write-back 分支和文件路径可以被渲染工具读取。
6. 控制器 Status 能区分扫描、候选、写回和失败阶段。

使用测试对象先匹配一个 Application，并准备一个明确的新候选。观察至少两个扫描周期：第一次产生变更，第二次应识别当前版本而不重复提交。

扩大匹配范围前导出命中的 Application 清单。一个过宽正则可能瞬间为多个环境创建变更，必须通过数量上限和分批策略限制故障半径。

#### ImageUpdater CRD 如何表达扫描、匹配、凭据和写回的机制边界

保留一份最小现代 CRD，解释 Namespace、ApplicationRefs、别名、策略和状态；详细控制器行为转到 Argo CD 05。

- **ImageUpdater CRD 如何表达扫描、匹配、凭据和写回的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **ImageUpdater CRD 如何表达扫描、匹配、凭据和写回的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **ImageUpdater CRD 如何表达扫描、匹配、凭据和写回的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **ImageUpdater CRD 如何表达扫描、匹配、凭据和写回的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“ImageUpdater CRD 如何表达扫描、匹配、凭据和写回”，凭据只在消费者需要的边界解密，Git 与普通日志中不得出现明文。
对于“ImageUpdater CRD 如何表达扫描、匹配、凭据和写回”，轮换必须同时证明旧凭据已失效、新凭据已覆盖全部消费者，并保留灾备恢复入口。

#### ImageUpdater CRD 如何表达扫描、匹配、凭据和写回的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `ImageUpdater CRD 如何表达扫描、匹配、凭据和写回` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `ImageUpdater CRD 如何表达扫描、匹配、凭据和写回` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `ImageUpdater CRD 如何表达扫描、匹配、凭据和写回` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `ImageUpdater CRD 如何表达扫描、匹配、凭据和写回` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“ImageUpdater CRD 如何表达扫描、匹配、凭据和写回”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### ImageUpdater CRD 如何表达扫描、匹配、凭据和写回的静态检查模板

下面命令为“ImageUpdater CRD 如何表达扫描、匹配、凭据和写回”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: ImageUpdater CRD 如何表达扫描、匹配、凭据和写回
evidence_file="./evidence/check-60baa5df00.txt"
kubectl auth can-i get secrets -n demo --as=system:serviceaccount:demo:app | tee -a "${evidence_file}"
kubectl get secret -n demo -o name | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“ImageUpdater CRD 如何表达扫描、匹配、凭据和写回”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### ImageUpdater CRD 如何表达扫描、匹配、凭据和写回的故障实验与恢复

“ImageUpdater CRD 如何表达扫描、匹配、凭据和写回”的可逆故障场景是：撤销旧凭据并轮换新版本，逐个验证生产者、分发者和消费者；残留旧访问能力视为恢复失败。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“ImageUpdater CRD 如何表达扫描、匹配、凭据和写回”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“ImageUpdater CRD 如何表达扫描、匹配、凭据和写回”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“ImageUpdater CRD 如何表达扫描、匹配、凭据和写回”执行恢复策略：先撤销暴露或过期身份，再签发新版本并逐个验证生产者、分发者和消费者，最后证明旧身份已无访问能力。
4. 重新采集“ImageUpdater CRD 如何表达扫描、匹配、凭据和写回”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“ImageUpdater CRD 如何表达扫描、匹配、凭据和写回”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Git Write-back 如何处理 PR、冲突、重试和 Revert

Git Write-back 会读取 Application 的 Repository、Path 和 Target Revision，创建或更新参数文件，再 Commit 并 Push。风险集中在分支选择、凭据权限、并发冲突和自动同步速度。

生产设计至少包括：

- 使用专用写入身份，只能写目标仓库和路径。
- 目标 Revision 必须是明确分支；Tag 和固定 SHA 无法自然接收 Commit。
- 保护分支要求 PR 时，配置 Pull Request 创建能力和审批规则。
- 同一文件避免多个机器人同时管理同一字段。
- Commit Message 包含旧/新 Digest、应用、策略和控制器身份。
- 回写失败不应直接修改运行态作为隐藏兜底。

恢复时先判断失败发生在 Registry 查询、候选选择、Git 写入、Argo CD 读取还是集群同步。只重启控制器可能造成重复提交，需先检查最近一次状态和仓库历史。

#### 按回写阶段设计恢复动作

| 阶段 | 可见证据 | 安全恢复动作 |
|---|---|---|
| Registry 查询失败 | 拉取错误、上次扫描时间 | 保持当前版本，修复连接后重扫 |
| 候选选择为空 | 策略与候选列表 | 修正规则或等待，不放宽兜底 |
| Git 认证失败 | Push 拒绝和身份审计 | 轮换最小权限凭据后重试 |
| 分支冲突 | 远端 HEAD 和本地基线 | 重新读取并只更新拥有字段 |
| Commit 已推送但状态丢失 | 仓库存在机器人 Commit | 采用既有 Commit，不重复创建 |
| Argo CD 未读取 | Application Revision 状态 | Refresh 并查仓库服务，不直改集群 |

机器人 Commit 要带稳定变更 ID。重试前先按变更 ID、旧 Digest 和新 Digest 查仓库，找到等价结果就恢复状态而不是再写一笔。

若生产要求 PR 审批，自动化的职责到“提出变更”结束。审批超时、拒绝或要求修改都要回写状态；不能因为等待过久切换成直推分支。

回写恢复后还要验证 Argo CD 渲染出的最终镜像身份。文件改对但 Overlay 或 Values 路径未被引用，仍然没有形成有效期望变更。

#### Git Write-back 如何处理 PR、冲突、重试和 Revert的机制边界

给出机器人身份、分支、路径、Commit Schema、变更 ID 和各阶段恢复矩阵。

- **Git Write-back 如何处理 PR、冲突、重试和 Revert的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Git Write-back 如何处理 PR、冲突、重试和 Revert的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Git Write-back 如何处理 PR、冲突、重试和 Revert的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Git Write-back 如何处理 PR、冲突、重试和 Revert的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

写入者必须声明字段所有权、目标分支和冲突策略，远端 HEAD 变化后重新计算而不是覆盖。
Commit 已产生但本地状态丢失时先按变更 ID 查重，避免同一候选生成重复提交或 PR。

#### Git Write-back 如何处理 PR、冲突、重试和 Revert的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Git Write-back 如何处理 PR、冲突、重试和 Revert` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Git Write-back 如何处理 PR、冲突、重试和 Revert` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Git Write-back 如何处理 PR、冲突、重试和 Revert` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Git Write-back 如何处理 PR、冲突、重试和 Revert` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Git Write-back 如何处理 PR、冲突、重试和 Revert”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Git Write-back 如何处理 PR、冲突、重试和 Revert的静态检查模板

下面命令为“Git Write-back 如何处理 PR、冲突、重试和 Revert”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Git Write-back 如何处理 PR、冲突、重试和 Revert
evidence_file="./evidence/check-52f8436373.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Git Write-back 如何处理 PR、冲突、重试和 Revert”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Git Write-back 如何处理 PR、冲突、重试和 Revert的故障实验与恢复

“Git Write-back 如何处理 PR、冲突、重试和 Revert”的可逆故障场景是：制造远端 HEAD 前移与重复变更 ID，验证机器人重新读取、重算并去重；禁止强制覆盖受保护分支。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Git Write-back 如何处理 PR、冲突、重试和 Revert”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Git Write-back 如何处理 PR、冲突、重试和 Revert”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Git Write-back 如何处理 PR、冲突、重试和 Revert”执行恢复策略：冻结新的写回，按变更 ID 查找已存在的 Commit 或 PR，重新读取远端 HEAD 后重算；错误提交使用显式 Revert。
4. 重新采集“Git Write-back 如何处理 PR、冲突、重试和 Revert”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Git Write-back 如何处理 PR、冲突、重试和 Revert”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 6 章 · GitOps 密钥系统如何建立和恢复信任

### Base64、加密文件和外部引用的信任模型有何不同

Kubernetes Secret 的 `data` 只是 Base64 编码，不提供保密性。把它提交到 Git 会永久进入历史、Fork、缓存和备份。删除当前文件无法证明旧副本消失，因此泄漏后必须轮换真实凭据。

GitOps 密钥方案可以分成三类：

| 模式 | Git 中保存 | 解密或取值位置 | 主要风险 |
|---|---|---|---|
| Sealed Secrets | 与目标集群绑定的密文 | 集群内控制器 | 私钥丢失或 Scope 过宽 |
| SOPS | 结构化文件密文 | CI、插件或控制器 | KMS 权限和解密面扩大 |
| External Secrets | 外部对象引用 | 集群内控制器从 Secret Manager 获取 | 外部依赖、身份和同步延迟 |

没有一种方案适合所有场景。需要离线审查结构化配置时可考虑 SOPS；希望 Git 只保存引用并集中轮换时可考虑 External Secrets；希望开发者用集群公钥生成不可读密文时可考虑 Sealed Secrets。

#### 用数据流选择密钥方案

评审时画出明文在哪些时刻出现：创建、加密、提交、调谐、注入、应用读取和轮换。每个节点记录身份、存储、日志与缓存。

| 问题 | 影响的选择 |
|---|---|
| 是否需要离线审查部分字段 | 倾向 SOPS 的结构化加密 |
| 是否已有集中 Secret Manager | 倾向外部引用和工作负载身份 |
| 集群能否独立于外部系统恢复 | 影响外部引用的灾备设计 |
| 多集群是否共享同一密文 | 影响 Sealed Secrets Scope 和密钥域 |
| 应用是否支持热加载 | 决定轮换是否需要重启 |
| 谁能创建引用 Secret 的 Pod | 决定明文间接读取风险 |

选择后用两类实验验证：未授权人员能否从 Git、日志和控制器接口取得明文；授权轮换后，应用能否在预算内切换到新值并使旧值失效。

“Git 中没有明文”只是最低条件。控制器缓存、临时文件、错误日志、备份、容器环境和 Debug 工具都可能形成新的暴露面。

#### Base64、加密文件和外部引用的信任模型有何不同的机制边界

画出明文出现位置、解密身份、缓存、日志和工作负载读取路径，建立选型决策表。

- **Base64、加密文件和外部引用的信任模型有何不同的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Base64、加密文件和外部引用的信任模型有何不同的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Base64、加密文件和外部引用的信任模型有何不同的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Base64、加密文件和外部引用的信任模型有何不同的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“Base64、加密文件和外部引用的信任模型有何不同”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“Base64、加密文件和外部引用的信任模型有何不同”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### Base64、加密文件和外部引用的信任模型有何不同的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Base64、加密文件和外部引用的信任模型有何不同` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Base64、加密文件和外部引用的信任模型有何不同` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Base64、加密文件和外部引用的信任模型有何不同` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Base64、加密文件和外部引用的信任模型有何不同` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Base64、加密文件和外部引用的信任模型有何不同”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Base64、加密文件和外部引用的信任模型有何不同的静态检查模板

下面命令为“Base64、加密文件和外部引用的信任模型有何不同”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Base64、加密文件和外部引用的信任模型有何不同
evidence_file="./evidence/check-0873408dd1.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Base64、加密文件和外部引用的信任模型有何不同”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Base64、加密文件和外部引用的信任模型有何不同的故障实验与恢复

“Base64、加密文件和外部引用的信任模型有何不同”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Base64、加密文件和外部引用的信任模型有何不同”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Base64、加密文件和外部引用的信任模型有何不同”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Base64、加密文件和外部引用的信任模型有何不同”执行恢复策略：冻结后续变更并保留当前稳定状态，恢复版本化输入后等待控制器重新收敛，再用业务证据关闭事件。
4. 重新采集“Base64、加密文件和外部引用的信任模型有何不同”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Base64、加密文件和外部引用的信任模型有何不同”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复

分别给出结构化密文、外部引用和插件/工作负载身份的数据流、最小配置与故障边界。

#### Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复的机制边界

给出 strict 对象、证书指纹、重加密、私钥备份和隔离集群恢复演练。

- **Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复”，凭据只在消费者需要的边界解密，Git 与普通日志中不得出现明文。
对于“Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复”，轮换必须同时证明旧凭据已失效、新凭据已覆盖全部消费者，并保留灾备恢复入口。

#### Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复的静态检查模板

下面命令为“Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复
evidence_file="./evidence/check-d9d9bd5542.txt"
kubectl auth can-i get secrets -n demo --as=system:serviceaccount:demo:app | tee -a "${evidence_file}"
kubectl get secret -n demo -o name | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复的故障实验与恢复

“Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复”的可逆故障场景是：撤销旧凭据并轮换新版本，逐个验证生产者、分发者和消费者；残留旧访问能力视为恢复失败。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复”执行恢复策略：先撤销暴露或过期身份，再签发新版本并逐个验证生产者、分发者和消费者，最后证明旧身份已无访问能力。
4. 重新采集“Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Sealed Secrets 如何处理 Scope、密钥备份和跨集群恢复”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### SOPS、External Secrets 和 Vault 模式如何取舍

分别给出结构化密文、外部引用和插件/工作负载身份的数据流、最小配置与故障边界。

#### SOPS、External Secrets 和 Vault 模式如何取舍的机制边界


- **SOPS、External Secrets 和 Vault 模式如何取舍的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **SOPS、External Secrets 和 Vault 模式如何取舍的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **SOPS、External Secrets 和 Vault 模式如何取舍的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **SOPS、External Secrets 和 Vault 模式如何取舍的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“SOPS、External Secrets 和 Vault 模式如何取舍”，凭据只在消费者需要的边界解密，Git 与普通日志中不得出现明文。
对于“SOPS、External Secrets 和 Vault 模式如何取舍”，轮换必须同时证明旧凭据已失效、新凭据已覆盖全部消费者，并保留灾备恢复入口。

#### SOPS、External Secrets 和 Vault 模式如何取舍的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `SOPS、External Secrets 和 Vault 模式如何取舍` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `SOPS、External Secrets 和 Vault 模式如何取舍` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `SOPS、External Secrets 和 Vault 模式如何取舍` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `SOPS、External Secrets 和 Vault 模式如何取舍` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“SOPS、External Secrets 和 Vault 模式如何取舍”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### SOPS、External Secrets 和 Vault 模式如何取舍的静态检查模板

下面命令为“SOPS、External Secrets 和 Vault 模式如何取舍”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: SOPS、External Secrets 和 Vault 模式如何取舍
evidence_file="./evidence/check-754a0fde17.txt"
kubectl auth can-i get secrets -n demo --as=system:serviceaccount:demo:app | tee -a "${evidence_file}"
kubectl get secret -n demo -o name | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“SOPS、External Secrets 和 Vault 模式如何取舍”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### SOPS、External Secrets 和 Vault 模式如何取舍的故障实验与恢复

“SOPS、External Secrets 和 Vault 模式如何取舍”的可逆故障场景是：撤销旧凭据并轮换新版本，逐个验证生产者、分发者和消费者；残留旧访问能力视为恢复失败。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“SOPS、External Secrets 和 Vault 模式如何取舍”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“SOPS、External Secrets 和 Vault 模式如何取舍”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“SOPS、External Secrets 和 Vault 模式如何取舍”执行恢复策略：先撤销暴露或过期身份，再签发新版本并逐个验证生产者、分发者和消费者，最后证明旧身份已无访问能力。
4. 重新采集“SOPS、External Secrets 和 Vault 模式如何取舍”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“SOPS、External Secrets 和 Vault 模式如何取舍”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 业务凭据轮换和泄漏响应如何覆盖所有消费者

分别给出结构化密文、外部引用和插件/工作负载身份的数据流、最小配置与故障边界。



`kubeseal` 使用控制器公钥把 Secret 加密成 SealedSecret，只有持有私钥的控制器能解密并生成普通 Secret。默认 strict scope 把名称和命名空间加入加密上下文，复制到其他位置会解密失败。

Scope 选择：

- `strict`：名称和命名空间都固定，默认且最安全。
- `namespace-wide`：同一命名空间内可改名，适合受控模板。
- `cluster-wide`：任意命名空间和名称，扩大复用也扩大误用风险。

SealedSecret 可公开读取不等于任何人都可以安全创建它。控制器不会验证提交者身份；Repository 保护、CODEOWNERS、准入策略和 RBAC 仍需限制谁能把对象部署进目标集群。

```mermaid
flowchart LR
    Author[Authorized author] -->|Fetch public certificate| Cert[Public certificate]
    Author -->|Encrypt Secret| Sealed[SealedSecret in Git]
    Sealed --> Reconciler[GitOps reconciler]
    Reconciler --> Cluster[Target cluster]
    Controller[Sealed Secrets controller] -->|Read private key| Key[Controller key Secret]
    Controller -->|Decrypt matching scope| Runtime[Runtime Secret]
    Cluster --> Controller
```

这个模型保护 Git 中的机密内容，但不保护解密后的 Secret。能读取 Secret、创建引用该 Secret 的 Pod、执行到容器或读取节点数据的人，仍可能取得明文。因此 Secret RBAC、工作负载权限和节点安全与加密同等重要。

`cluster-wide` Scope 方便复用，却允许密文被复制到任意命名空间后解密。除非有明确的跨命名空间分发需求，应保留默认 strict，并把重新封装作为环境晋级过程的一部分。

Sealed Secrets 控制器定期生成新密钥，但密钥轮换不等于旧凭据内容轮换，也不等于仓库中的旧密文自动重加密。需要区分：

1. 加密密钥轮换：更换控制器密钥对。
2. 业务凭据轮换：数据库密码、Token 等真实值改变。
3. 密文重加密：用新公钥重新生成 SealedSecret。

私钥只存于集群 Secret 时，集群完全丢失将无法解密既有 SealedSecret。必须把控制器私钥备份到高安全等级的独立系统，并演练在新集群先恢复密钥、再启动控制器。备份文件本身包含私钥，不得进入普通 Git 仓库。

一套可执行的轮换演练应包含：

1. 导出当前公钥指纹和所有活动私钥清单。
2. 触发或等待新密钥产生，确认新封装使用新公钥。
3. 验证旧 SealedSecret 仍能由历史活动密钥解密。
4. 选取非生产 Secret 重加密并完成工作负载滚动验证。
5. 在隔离集群恢复备份私钥，验证灾难恢复顺序。
6. 只有在所有历史密文已迁移、备份已更新后，才退役旧私钥。

业务凭据轮换还要考虑消费者重载方式。挂载卷可能自动更新，但应用未必重新读取；环境变量必须重建 Pod；数据库双密码窗口和 API Token 并存能力会决定是否能无中断轮换。

#### 把轮换拆成生产者、分发者和消费者三段

业务凭据生产者负责生成新值和控制并存窗口；Secret 控制器负责把新版本安全分发到目标 Namespace；应用消费者负责重新读取并证明新值生效。三段状态不能压成一个“Secret 已更新”。

演练依次记录：

1. 新凭据创建时间和版本身份。
2. 外部存储或加密对象更新完成时间。
3. Kubernetes Secret 的 ResourceVersion 变化。
4. 各工作负载重新加载或滚动完成时间。
5. 用新凭据完成的第一笔受控请求。
6. 旧凭据被拒绝的验证时间。

如果部分消费者失败，应保持双值窗口并阻止撤销旧值，同时告警具体实例。不能因为多数副本成功就让少数后台 Job 在下次运行时突然失败。

轮换完成后扫描 Git、CI 日志和镜像层，确认新值没有在自动化过程中产生新的明文副本；更新灾备材料，保证恢复系统不会重新引入已撤销凭据。

区分加密密钥、业务凭据和密文重加密；覆盖双值窗口、Pod 重载、审计、Git 历史与镜像层。

#### 业务凭据轮换和泄漏响应如何覆盖所有消费者的机制边界


- **业务凭据轮换和泄漏响应如何覆盖所有消费者的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **业务凭据轮换和泄漏响应如何覆盖所有消费者的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **业务凭据轮换和泄漏响应如何覆盖所有消费者的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **业务凭据轮换和泄漏响应如何覆盖所有消费者的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“业务凭据轮换和泄漏响应如何覆盖所有消费者”，凭据只在消费者需要的边界解密，Git 与普通日志中不得出现明文。
对于“业务凭据轮换和泄漏响应如何覆盖所有消费者”，轮换必须同时证明旧凭据已失效、新凭据已覆盖全部消费者，并保留灾备恢复入口。

#### 业务凭据轮换和泄漏响应如何覆盖所有消费者的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `业务凭据轮换和泄漏响应如何覆盖所有消费者` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `业务凭据轮换和泄漏响应如何覆盖所有消费者` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `业务凭据轮换和泄漏响应如何覆盖所有消费者` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `业务凭据轮换和泄漏响应如何覆盖所有消费者` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“业务凭据轮换和泄漏响应如何覆盖所有消费者”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 业务凭据轮换和泄漏响应如何覆盖所有消费者的静态检查模板

下面命令为“业务凭据轮换和泄漏响应如何覆盖所有消费者”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 业务凭据轮换和泄漏响应如何覆盖所有消费者
evidence_file="./evidence/check-0d188fb4bb.txt"
kubectl auth can-i get secrets -n demo --as=system:serviceaccount:demo:app | tee -a "${evidence_file}"
kubectl get secret -n demo -o name | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“业务凭据轮换和泄漏响应如何覆盖所有消费者”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 业务凭据轮换和泄漏响应如何覆盖所有消费者的故障实验与恢复

“业务凭据轮换和泄漏响应如何覆盖所有消费者”的可逆故障场景是：撤销旧凭据并轮换新版本，逐个验证生产者、分发者和消费者；残留旧访问能力视为恢复失败。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“业务凭据轮换和泄漏响应如何覆盖所有消费者”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“业务凭据轮换和泄漏响应如何覆盖所有消费者”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“业务凭据轮换和泄漏响应如何覆盖所有消费者”执行恢复策略：先撤销暴露或过期身份，再签发新版本并逐个验证生产者、分发者和消费者，最后证明旧身份已无访问能力。
4. 重新采集“业务凭据轮换和泄漏响应如何覆盖所有消费者”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“业务凭据轮换和泄漏响应如何覆盖所有消费者”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 7 章 · 发布证据如何连接健康、日志、指标和告警

### Revision、Pod、请求、日志和指标如何使用统一字段

交付排障需要把配置 Revision、应用对象、工作负载、Pod、日志流和请求关联起来。最有效的方法是在构建、配置和运行时使用同一组稳定字段。

```mermaid
flowchart LR
    Commit[Config revision] --> App[GitOps Application]
    App --> Workload[Rollout or Deployment]
    Workload --> Pod[Pod UID]
    Pod --> Log[Structured log]
    Pod --> Metric[Metrics]
    Request[Trace or request ID] --> Log
    Request --> Metric
```

建议日志至少包含 service、environment、version、pod、request_id 和 severity。不要把高基数字段无节制放进 Prometheus Label；Commit SHA 可以作为部署信息指标或日志字段，而非每个请求时间序列的标签。

#### 从一条失败请求还原发布上下文

选择一条在发布窗口内返回 5xx 的测试请求，执行逆向查询：

1. 用 Request ID 找到入口和应用日志，确认时间戳与环境。
2. 从日志中的 Pod 和 Version 定位工作负载、ReplicaSet 或 Rollout。
3. 读取容器 `imageID`，确认实际 Digest 而非清单 Tag。
4. 从资源 Annotation 定位配置 Revision 和发布执行。
5. 对比同窗口 Stable 与新版本请求，判断是否为版本相关。
6. 查询依赖 Trace、数据库错误和队列状态，避免把下游故障误判为发布故障。

查询应在 Runbook 中提供可复制模板，但参数必须显式填写。默认查“最近 15 分钟”在延迟发现的事故中会漏掉发布窗口。

如果日志、指标和 Trace 使用不同服务名或环境名，先建立规范化映射。依赖人工记忆把 `checkout`、`checkout-api` 和 `prod-checkout-v2` 对齐，会显著延长恢复时间。

演练完成后保存查询链接或表达式、数据时间范围和结果摘要。Dashboard 截图只能辅助交流，不能替代可重复查询。

#### Revision、Pod、请求、日志和指标如何使用统一字段的机制边界

定义 service、environment、version、pod、request_id 和部署信息指标，控制 Prometheus Label 基数。

- **Revision、Pod、请求、日志和指标如何使用统一字段的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Revision、Pod、请求、日志和指标如何使用统一字段的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Revision、Pod、请求、日志和指标如何使用统一字段的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Revision、Pod、请求、日志和指标如何使用统一字段的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

查询值必须连同时间窗口、样本数和 Provider 状态解释，空值不能自动当作零。
业务失败、观测故障和数据不足要进入不同状态，且每种状态只能对应一个默认动作。

#### Revision、Pod、请求、日志和指标如何使用统一字段的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Revision、Pod、请求、日志和指标如何使用统一字段` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Revision、Pod、请求、日志和指标如何使用统一字段` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Revision、Pod、请求、日志和指标如何使用统一字段` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Revision、Pod、请求、日志和指标如何使用统一字段` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Revision、Pod、请求、日志和指标如何使用统一字段”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Revision、Pod、请求、日志和指标如何使用统一字段的静态检查模板

下面命令为“Revision、Pod、请求、日志和指标如何使用统一字段”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Revision、Pod、请求、日志和指标如何使用统一字段
evidence_file="./evidence/check-1819893fb5.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Revision、Pod、请求、日志和指标如何使用统一字段”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Revision、Pod、请求、日志和指标如何使用统一字段的故障实验与恢复

“Revision、Pod、请求、日志和指标如何使用统一字段”的可逆故障场景是：依次返回空 Vector、多 Series、NaN 和超时，确认业务失败、数据不足与 Provider 错误不会被混为一类。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Revision、Pod、请求、日志和指标如何使用统一字段”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Revision、Pod、请求、日志和指标如何使用统一字段”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Revision、Pod、请求、日志和指标如何使用统一字段”执行恢复策略：暂停自动晋级并保持稳定版本，修复查询或观测链后重放同一时间窗口；缺失数据不得补写为零。
4. 重新采集“Revision、Pod、请求、日志和指标如何使用统一字段”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Revision、Pod、请求、日志和指标如何使用统一字段”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 当前日志采集链如何替代 Promtail 历史方案

课程使用 Loki、Promtail 和 `loki-stack` Chart 展示轻量日志系统，这条安装路径已过时。Promtail 已结束生命周期并从新的 Loki 版本移除。当前设计应选择受支持的采集器，例如 Grafana Alloy，再按 Loki 当前部署模式规划存储、租户和网关。

可复用的是日志链路原理：节点或工作负载产生 stdout/stderr，采集器解析 Kubernetes 元数据，限制 Label 基数，把日志发送到集中存储，再用 LogQL 和 Grafana 查询。不能复用的是旧 Chart 名称、旧组件清单和固定版本命令。

日志系统本身也会失败。需要监控采集积压、丢弃、解析错误、写入错误、存储容量和查询延迟。发布期间没有日志可能是应用没请求，也可能是采集链路断裂，不能直接判定健康。

现代化迁移时先并行运行旧、新采集链路，比较相同时间窗口内的日志条数、Label、时间戳和多行解析结果。确认查询和告警都已切换后，再停止旧 Agent。直接替换 DaemonSet 容易产生不可见的采集空窗。

Label 只放低基数维度，例如集群、命名空间、应用和环境。Request ID、用户 ID、完整 URL 和 Commit SHA 更适合留在日志正文；把它们做成 Label 会造成流数量爆炸，反过来拖慢发布期间最需要的查询。

日志保留周期应覆盖发布回滚和事故复盘窗口。只保留数小时可能节省存储，却让隔夜发现的错误无法与变更关联；无限保留又会带来成本和隐私风险，需要按数据等级分层。

#### 验收日志采集链路的端到端行为

在测试应用写入五类已知日志：单行 JSON、多行异常、超长行、非 UTF-8 输入和包含敏感字段的记录。然后验证：

1. 采集器是否为每条记录附加正确的集群、命名空间、应用和 Pod 元数据。
2. 多行异常是否保持为一个逻辑事件，时间戳是否来自应用而非采集时刻。
3. 超长或无法解析记录如何截断、丢弃并计数。
4. 敏感字段是否在进入集中存储前被删除或脱敏。
5. Pod 快速退出、节点重启和采集器升级期间是否出现空窗。
6. 按 Revision 和 Request ID 的查询能否在目标延迟内返回。

采集器自身指标必须进入独立告警：读取延迟、发送重试、丢弃字节、队列占用和后端拒绝。应用没有错误日志与日志管道已经停止，不能显示成同一种“零”。

并行迁移旧、新采集器时，以相同 Pod、时间和日志序号做差异比较。新链路达到覆盖率、解析正确率和查询延迟门槛后，才停止旧链路。

#### 当前日志采集链如何替代 Promtail 历史方案的机制边界

保留 Loki/LogQL 原理，改用受支持采集路径，增加解析、积压、丢弃、敏感字段和迁移对比实验。

- **当前日志采集链如何替代 Promtail 历史方案的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **当前日志采集链如何替代 Promtail 历史方案的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **当前日志采集链如何替代 Promtail 历史方案的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **当前日志采集链如何替代 Promtail 历史方案的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“当前日志采集链如何替代 Promtail 历史方案”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“当前日志采集链如何替代 Promtail 历史方案”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 当前日志采集链如何替代 Promtail 历史方案的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `当前日志采集链如何替代 Promtail 历史方案` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `当前日志采集链如何替代 Promtail 历史方案` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `当前日志采集链如何替代 Promtail 历史方案` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `当前日志采集链如何替代 Promtail 历史方案` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“当前日志采集链如何替代 Promtail 历史方案”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 当前日志采集链如何替代 Promtail 历史方案的静态检查模板

下面命令为“当前日志采集链如何替代 Promtail 历史方案”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 当前日志采集链如何替代 Promtail 历史方案
evidence_file="./evidence/check-4ae9dd6379.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“当前日志采集链如何替代 Promtail 历史方案”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 当前日志采集链如何替代 Promtail 历史方案的故障实验与恢复

“当前日志采集链如何替代 Promtail 历史方案”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“当前日志采集链如何替代 Promtail 历史方案”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“当前日志采集链如何替代 Promtail 历史方案”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“当前日志采集链如何替代 Promtail 历史方案”执行恢复策略：暂停自动晋级并保持稳定版本，修复查询或观测链后重放同一时间窗口；缺失数据不得补写为零。
4. 重新采集“当前日志采集链如何替代 Promtail 历史方案”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“当前日志采集链如何替代 Promtail 历史方案”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### RED、黑盒和业务指标如何共同判断发布

PromQL、抓取和告警规则的通用原理参见 [Prometheus 学习笔记](../../observability/prometheus/guide.md)；这里仅处理指标怎样绑定发布身份并成为晋级或暂停证据。

发布指标需要同时覆盖系统和业务：

- 请求：速率、错误率、延迟分位数。
- 资源：CPU、内存、连接、线程、队列和饱和度。
- 工作负载：不可用副本、重启、驱逐、探针失败。
- 依赖：数据库错误、下游超时、消息积压。
- 业务：支付成功、下单完成、登录成功等关键结果。

只看 HTTP 2xx 比例会遗漏超时、业务错误码和静默数据问题。指标还要考虑请求量：低流量时 90% 成功率可能只有 9 个请求，统计不稳定；高流量时短窗口又可能快速扩大损失。

Stable 与 Canary 应尽量使用同一查询口径，只通过版本、路由目标或 Pod Template Hash 分组，避免两套 Dashboard 计算不同。比较时既看绝对阈值，也看相对退化：新版本即使仍在 SLO 内，延迟比稳定版翻倍也值得暂停。

指标门禁要记录查询表达式版本、窗口、样本量和数据源。发布后临时修改 Dashboard 查询不会改变已经发生的判断；若没有保存当时的查询和 Measurement，就无法复盘为什么控制器晋级。

#### 为指标门禁建立数据质量检查

门禁执行前先判断指标是否有资格用于决策：

| 检查 | 失败含义 | 默认动作 |
|---|---|---|
| 数据源可达 | 无法获得 Measurement | 暂停，不当作成功 |
| 查询返回序列 | Label 或路由可能错误 | 暂停并查查询范围 |
| 样本量达到下限 | 统计结果有解释力 | 不足则延长或人工判断 |
| Stable 与 Canary 都有数据 | 可以做相对比较 | 缺一侧则只用绝对门禁 |
| 数据延迟在预算内 | 窗口覆盖当前步骤 | 延迟过大则等待 |
| 单位和分母正确 | 阈值可比较 | 查询校验失败则停止 |

指标缺失与指标为零必须区分。没有错误序列可能表示零错误，也可能是应用没有暴露、抓取失败或 Label 不匹配。

为每条关键查询准备一个“已知失败”样本，确认它确实触发门禁。只用正常流量测试，无法发现查询永远返回成功或没有选中新版本的问题。

门禁修改要像代码一样评审和版本化。保存表达式、阈值、窗口、Provider 和 Template Revision，才能在事后复现控制器当时看到的值。

#### RED、黑盒和业务指标如何共同判断发布的机制边界

给出 PromQL、最小样本量、版本对比、数据延迟、合成请求和关键业务结果。

- **RED、黑盒和业务指标如何共同判断发布的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **RED、黑盒和业务指标如何共同判断发布的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **RED、黑盒和业务指标如何共同判断发布的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **RED、黑盒和业务指标如何共同判断发布的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

查询值必须连同时间窗口、样本数和 Provider 状态解释，空值不能自动当作零。
业务失败、观测故障和数据不足要进入不同状态，且每种状态只能对应一个默认动作。

#### RED、黑盒和业务指标如何共同判断发布的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `RED、黑盒和业务指标如何共同判断发布` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `RED、黑盒和业务指标如何共同判断发布` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `RED、黑盒和业务指标如何共同判断发布` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `RED、黑盒和业务指标如何共同判断发布` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“RED、黑盒和业务指标如何共同判断发布”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### RED、黑盒和业务指标如何共同判断发布的静态检查模板

下面命令为“RED、黑盒和业务指标如何共同判断发布”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: RED、黑盒和业务指标如何共同判断发布
evidence_file="./evidence/check-00f7a5d0e3.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“RED、黑盒和业务指标如何共同判断发布”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### RED、黑盒和业务指标如何共同判断发布的故障实验与恢复

“RED、黑盒和业务指标如何共同判断发布”的可逆故障场景是：依次返回空 Vector、多 Series、NaN 和超时，确认业务失败、数据不足与 Provider 错误不会被混为一类。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“RED、黑盒和业务指标如何共同判断发布”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“RED、黑盒和业务指标如何共同判断发布”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“RED、黑盒和业务指标如何共同判断发布”执行恢复策略：暂停自动晋级并保持稳定版本，修复查询或观测链后重放同一时间窗口；缺失数据不得补写为零。
4. 重新采集“RED、黑盒和业务指标如何共同判断发布”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“RED、黑盒和业务指标如何共同判断发布”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### PrometheusRule、Alertmanager 和自动暂停如何分工

告警用于通知需要行动的异常，自动分析用于在受控发布窗口快速停止风险，人工处置用于处理不确定、跨系统或不可逆问题。三者不应互相替代。

| 信号 | 自动动作 | 人工动作 |
|---|---|---|
| 明确且高置信失败门禁 | 暂停或 Abort Rollout | 确认影响和恢复 |
| 指标源不可用 | 暂停并保留版本 | 判断继续、回退或修复观测 |
| 低流量数据不足 | 延长观察或暂停 | 结合业务窗口判断 |
| 多指标冲突 | 保持当前流量 | 分析依赖和数据质量 |
| 已扩大为事故 | 停止所有自动晋级 | 启动事件响应和 Break Glass |

通知内容应直接带上应用、环境、旧/新 Revision、开始时间、当前步骤、失败条件、Dashboard 和 Runbook，而不是只发“发布失败”。

#### 把暂停后的决策写成状态机

自动暂停后只允许几种明确转换：继续观察、晋级、回退、Abort 后保持现场、升级为事故。每种转换要有授权角色和所需证据。

| 当前信号 | 可选动作 | 不允许的捷径 |
|---|---|---|
| 数据不足 | 延长窗口或生成受控流量 | 手工把未知改成成功 |
| 数据源故障 | 修复观测或按例外审批 | 用资源 Healthy 代替业务证据 |
| 明确版本退化 | Abort 或回退 | 反复 Promote 试探 |
| Stable 与 Canary 同时恶化 | 查共享依赖并冻结变更 | 只回退新版本后关闭事件 |
| 指标冲突 | 保持流量并人工分析 | 用平均分抵消关键失败 |

暂停必须有超时升级，否则发布长期占用双版本容量并阻塞后续变更。超时不自动等于回退或继续，而是把决策升级给已定义角色。

人工操作同样写入发布记录：操作者、时间、依据、动作前后状态。控制器按钮不是审计边界，后台 API 和 Kubernetes 审计仍要保存身份。

恢复自动流程前确认告警已回落、观测链路正常、配置仓库与运行态一致，并清理临时静默和策略例外。

#### PrometheusRule、Alertmanager 和自动暂停如何分工的机制边界

给出声明式规则、通知字段、暂停状态机、人工判断和观测系统不可用的安全动作。

- **PrometheusRule、Alertmanager 和自动暂停如何分工的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **PrometheusRule、Alertmanager 和自动暂停如何分工的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **PrometheusRule、Alertmanager 和自动暂停如何分工的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **PrometheusRule、Alertmanager 和自动暂停如何分工的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

查询值必须连同时间窗口、样本数和 Provider 状态解释，空值不能自动当作零。
业务失败、观测故障和数据不足要进入不同状态，且每种状态只能对应一个默认动作。

#### PrometheusRule、Alertmanager 和自动暂停如何分工的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `PrometheusRule、Alertmanager 和自动暂停如何分工` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `PrometheusRule、Alertmanager 和自动暂停如何分工` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `PrometheusRule、Alertmanager 和自动暂停如何分工` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `PrometheusRule、Alertmanager 和自动暂停如何分工` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“PrometheusRule、Alertmanager 和自动暂停如何分工”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### PrometheusRule、Alertmanager 和自动暂停如何分工的静态检查模板

下面命令为“PrometheusRule、Alertmanager 和自动暂停如何分工”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: PrometheusRule、Alertmanager 和自动暂停如何分工
evidence_file="./evidence/check-2a6a5bd180.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“PrometheusRule、Alertmanager 和自动暂停如何分工”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### PrometheusRule、Alertmanager 和自动暂停如何分工的故障实验与恢复

“PrometheusRule、Alertmanager 和自动暂停如何分工”的可逆故障场景是：依次返回空 Vector、多 Series、NaN 和超时，确认业务失败、数据不足与 Provider 错误不会被混为一类。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“PrometheusRule、Alertmanager 和自动暂停如何分工”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“PrometheusRule、Alertmanager 和自动暂停如何分工”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“PrometheusRule、Alertmanager 和自动暂停如何分工”执行恢复策略：暂停自动晋级并保持稳定版本，修复查询或观测链后重放同一时间窗口；缺失数据不得补写为零。
4. 重新采集“PrometheusRule、Alertmanager 和自动暂停如何分工”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“PrometheusRule、Alertmanager 和自动暂停如何分工”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 8 章 · 用供应链故障演练验收完整闭环

### 如何建立一份可验证且可长期查询的发布证据包

发布证据包用于判断是否成功、失败在哪里以及如何复盘。建议结构：

```yaml
change:
  application: checkout-api
  environment: production
  source_revision: 4d2a7d9
  image_digest: sha256:0123456789abcdef
  config_revision: 91af623
execution:
  started_at: 2026-08-29T02:10:00Z
  strategy: canary
  current_step: 20-percent
evidence:
  sync: Synced
  health: Progressing
  analysis_run: checkout-api-91af623-2
  dashboards:
    - https://grafana.example.com/d/release
decision:
  result: paused
  reason: latency-slo-breached
```

证据包不得包含 Secret、完整 Token、用户隐私或未脱敏请求体。它可以保存为变更系统记录、对象 Annotation 的索引，或外部审计存储；重点是稳定 Schema 和可查询性。

#### 验证证据包的完整性和不可抵赖性

证据生成器不应只在成功路径工作。分别制造渲染失败、准入拒绝、分析失败和人工 Abort，确认每种结果都能生成结构一致的记录。

最小校验包括：

1. Source、Artifact、Config 和 Runtime 四类身份都存在且格式有效。
2. 时间戳使用统一时区，并能按因果顺序排列。
3. Dashboard 与日志链接固定查询窗口，不依赖打开时的“最近时间”。
4. 人工决策包含认证身份、理由和动作前状态。
5. 查询表达式、Template 和策略都有版本身份。
6. 记录写入后只能追加更正，不能无痕覆盖原结论。
7. 敏感字段经过 Schema 级允许列表过滤。

为证据包定义唯一 ID，并写回配置 PR、Rollout Annotation 和事件系统。任意入口都应能导航到同一记录，避免每个平台保存互不关联的一份“真相”。

定期抽取历史发布重放查询。如果外部 Dashboard 已删除、日志已过期或 Repository 重命名，要在证据包中保留足够摘要和稳定对象身份。

访问控制区分发布参与者、审计读取者和证据系统写入者。允许所有人查询不等于允许所有人修改；机器人写入权限也不应包含删除历史记录。

完成标准应在发布前定义：

1. 配置仓库目标 Revision 已被控制器观察。
2. Desired 与 Live 差异符合预期，没有被忽略规则掩盖。
3. Rollout 或 Deployment 达到稳定状态，Pod 使用目标 Digest。
4. 探针、事件和控制器错误均在允许范围。
5. 关键请求与业务指标通过观察窗口。
6. 日志、指标和告警链路自身可用。
7. 旧版本保留满足回滚窗口，或已按策略安全缩容。
8. 证据包完成并能关联审批与责任人。

“命令返回 0”“Argo CD 显示 Synced”或“Pod 全部 Running”都只是局部证据。只有运行对象、真实请求和风险窗口共同通过，才可以把变更标记为完成。

#### 执行发布完成验收演练

选择一个可控版本，在测试环境完整走一次验收：

1. 发布前保存旧 Revision、旧 Digest、基线 SLI 和安全回退目标。
2. 合并配置后记录控制器检测和开始同步的时间。
3. 从 Pod Status 验证每个实例实际运行目标 Digest。
4. 发送覆盖读、写和关键依赖的合成请求，保存 Request ID。
5. 在完整观察窗口比较 Stable 基线、当前版本和依赖指标。
6. 检查日志采集、指标抓取和告警通知均能携带 Revision。
7. 生成证据包，并由未参与发布的人逆向查询。

随后制造一个应失败的版本，确认系统不会因为资源 Ready 自动关闭发布。失败版本应触发暂停或回退，保留失败 Measurement、资源事件和实际用户影响。

再模拟观察窗口结束前发布人员离线，验证超时升级和 On-call 接管。需要原操作者回来点击按钮才能结束的流程，不具备可运营性。

验收结束后检查候选镜像、临时环境、告警静默、策略例外和测试数据是否清理。清理失败也应进入证据包，而不是把“业务验证通过”当成全部完成。

只有成功路径、失败路径、人员交接和清理路径全部通过，才允许把该发布模板推广到更多生产应用。

推广后仍要定期抽样检查运行 Pod 的 Digest、签名、配置 Revision 和发布证据是否闭合。自动化模板可能因权限、Registry 或观测系统升级而逐渐偏离最初假设。

发现证据断点时先暂停受影响的自动晋级范围，修复并重跑失败路径，再恢复推广。不能让“过去验收通过”替代当前系统证据。

最终目标是让制品身份、安全决策、运行结果和恢复动作形成一条可查询链，而不是堆叠更多扫描器、控制器和 Dashboard。

这条链要同时经得起正常发布查询和事故期间的逆向取证。

两种路径都通过，供应链运维闭环才算成立。

#### 如何建立一份可验证且可长期查询的发布证据包的机制边界

定义 Change、Artifact、Execution、Evidence、Decision、Cleanup Schema 和不可变更正方式。

- **如何建立一份可验证且可长期查询的发布证据包的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **如何建立一份可验证且可长期查询的发布证据包的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **如何建立一份可验证且可长期查询的发布证据包的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **如何建立一份可验证且可长期查询的发布证据包的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“如何建立一份可验证且可长期查询的发布证据包”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“如何建立一份可验证且可长期查询的发布证据包”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 如何建立一份可验证且可长期查询的发布证据包的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `如何建立一份可验证且可长期查询的发布证据包` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `如何建立一份可验证且可长期查询的发布证据包` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `如何建立一份可验证且可长期查询的发布证据包` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `如何建立一份可验证且可长期查询的发布证据包` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“如何建立一份可验证且可长期查询的发布证据包”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 如何建立一份可验证且可长期查询的发布证据包的静态检查模板

下面命令为“如何建立一份可验证且可长期查询的发布证据包”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 如何建立一份可验证且可长期查询的发布证据包
evidence_file="./evidence/check-4f90dbf21e.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“如何建立一份可验证且可长期查询的发布证据包”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 如何建立一份可验证且可长期查询的发布证据包的故障实验与恢复

“如何建立一份可验证且可长期查询的发布证据包”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“如何建立一份可验证且可长期查询的发布证据包”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“如何建立一份可验证且可长期查询的发布证据包”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“如何建立一份可验证且可长期查询的发布证据包”执行恢复策略：冻结后续变更并保留当前稳定状态，恢复版本化输入后等待控制器重新收敛，再用业务证据关闭事件。
4. 重新采集“如何建立一份可验证且可长期查询的发布证据包”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“如何建立一份可验证且可长期查询的发布证据包”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### Registry、Git、控制器和指标源故障如何分别止损

四类故障分别定义保持状态、检测信号、暂停范围、恢复步骤和恢复后积压处理。

#### Registry、Git、控制器和指标源故障如何分别止损的机制边界


- **Registry、Git、控制器和指标源故障如何分别止损的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **Registry、Git、控制器和指标源故障如何分别止损的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **Registry、Git、控制器和指标源故障如何分别止损的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **Registry、Git、控制器和指标源故障如何分别止损的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

查询值必须连同时间窗口、样本数和 Provider 状态解释，空值不能自动当作零。
业务失败、观测故障和数据不足要进入不同状态，且每种状态只能对应一个默认动作。

#### Registry、Git、控制器和指标源故障如何分别止损的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `Registry、Git、控制器和指标源故障如何分别止损` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `Registry、Git、控制器和指标源故障如何分别止损` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `Registry、Git、控制器和指标源故障如何分别止损` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `Registry、Git、控制器和指标源故障如何分别止损` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“Registry、Git、控制器和指标源故障如何分别止损”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### Registry、Git、控制器和指标源故障如何分别止损的静态检查模板

下面命令为“Registry、Git、控制器和指标源故障如何分别止损”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: Registry、Git、控制器和指标源故障如何分别止损
evidence_file="./evidence/check-71a9bd2956.txt"
docker buildx imagetools inspect "$IMAGE_REF" | tee -a "${evidence_file}"
crane digest "$IMAGE_REF" | tee -a "${evidence_file}"
crane manifest "$IMAGE_REF" | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“Registry、Git、控制器和指标源故障如何分别止损”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### Registry、Git、控制器和指标源故障如何分别止损的故障实验与恢复

“Registry、Git、控制器和指标源故障如何分别止损”的可逆故障场景是：分别阻断 DNS、TLS、认证、Manifest 和 Blob，区分已运行 Pod 与新建 Pod 的影响，再以同一 Digest 恢复。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“Registry、Git、控制器和指标源故障如何分别止损”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“Registry、Git、控制器和指标源故障如何分别止损”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“Registry、Git、控制器和指标源故障如何分别止损”执行恢复策略：暂停自动晋级并保持稳定版本，修复查询或观测链后重放同一时间窗口；缺失数据不得补写为零。
4. 重新采集“Registry、Git、控制器和指标源故障如何分别止损”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“Registry、Git、控制器和指标源故障如何分别止损”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 错误镜像、无效证明和凭据泄漏如何联动处置

常见选择策略包括 SemVer、Newest Build、Alphabetical 和 Digest。策略名称相似并不代表适合所有 Tag 约定。

- SemVer 适合严格发布版本，需要明确是否允许 Pre-release。
- Newest Build 依赖 Registry 元数据，不等于业务版本最大。
- Alphabetical 只按字符串排序，Commit SHA 和日期格式必须可比较。
- Digest 适合固定 Tag 内容变化的场景，但可变 Tag 本身仍难审计。

生产规则应使用 AllowTags 限定候选集合，并显式忽略 `latest`、`dev`、临时分支等 Tag。多架构集群还要确认候选 Image Index 包含目标平台。

错误示例是让所有环境监听 `latest`：一旦 Registry 覆盖 Tag，多个环境可能同时变化，Git 中却看不到业务版本差异。更安全的模式是将扫描和验证后的 Digest 提交为明确变更。

版本约束需要用真实 Tag 集合做离线测试。准备包含稳定版、预发布版、错误格式、旧大版本和多架构缺失的测试样本，确认策略只选中预期候选。升级 Image Updater 后重新运行，因为排序和字段语义可能变化。

如果候选列表为空，应报告“没有符合策略的镜像”，而不是回退到无约束选择。若当前运行版本不符合新策略，也要明确是保持当前版本、选择最近合规版本还是要求人工迁移，不能让控制器自行猜测。

#### 用候选集合测试更新策略

为策略准备一组固定样本：稳定版本、预发布版本、拼写异常 Tag、旧版本新推送、缺少签名版本和多架构不完整版本。测试输出必须是明确候选集合，而不仅是最终选择。

| 测试情形 | 期望结果 |
|---|---|
| 当前为 `1.4.9`，出现 `1.5.0` | SemVer 规则允许或按次版本门禁等待 |
| 出现 `2.0.0-rc.1` | 生产规则默认排除预发布 |
| `1.4.9` Tag 被重推 | Digest 策略发现变化，生产策略拒绝静默替换 |
| 最新 Tag 缺少 arm64 | 多平台门禁拒绝候选 |
| Registry 返回空列表 | 保持当前版本并告警 |
| 当前版本已不符合新规则 | 进入人工迁移状态，不自动降级 |

Regex 既要测匹配也要测拒绝，避免 `.`、边界或大小写写错扩大范围。SemVer 还要明确是否允许主版本升级、预发布和构建元数据。

策略变更本身按生产变更管理。更新前记录当前候选和下一候选，在测试应用观察至少一个扫描周期，再逐环境启用。

发现明文 Secret 进入 Git 后，第一动作是撤销或轮换凭据，而不是先重写历史。历史清理可能减少后续暴露，但已经被克隆、缓存和日志记录的值无法可靠追回。

处置清单：

1. 确认凭据类型、权限、有效期和使用系统。
2. 立即禁用旧值，创建最小权限替代值。
3. 更新 Secret Manager 或加密对象并验证工作负载重新加载。
4. 搜索 CI 日志、Artifact、镜像层、Issue、Chat 和备份中的副本。
5. 查询 Git、Registry、云服务和 Kubernetes 审计日志中的异常使用。
6. 必要时重写历史并通知所有 Clone 处理，但不把它当撤销凭据的替代。
7. 修复扫描和提交门禁，防止同类值再次进入。

#### 用一次桌面演练校验泄漏响应

假设一个生产数据库密码被提交到公开分支，按分钟级时间线执行桌面演练：

1. 谁确认凭据真实性和权限范围，谁有权立即吊销。
2. 新旧凭据能否短时并存，应用用卷还是环境变量读取。
3. 哪些副本、Job、备份任务和外部消费者需要更新。
4. 如何查询凭据在云审计、数据库审计和 Kubernetes 审计中的使用。
5. 哪些 Fork、CI Artifact、日志和镜像层可能保留副本。
6. 历史重写后如何通知所有 Clone 和缓存处理。

演练必须区分遏制、根除、恢复和预防。先吊销能止损；搜索副本减少残留；更新所有消费者恢复服务；提交扫描和权限修复防止复发。

如果业务无法快速轮换，说明凭据生命周期设计本身是风险。应补充双凭据窗口、动态凭据或工作负载身份，而不是只优化 Git 历史清理命令。

关闭事件前保存旧值指纹而非明文，用它搜索使用记录；确认所有旧认证尝试被拒绝；把响应耗时和遗漏系统写入下一次演练清单。

#### 错误镜像、无效证明和凭据泄漏如何联动处置的机制边界

从冻结候选、撤销身份、替换凭据、重建镜像到确认生产 Digest，形成跨系统时间线。

- **错误镜像、无效证明和凭据泄漏如何联动处置的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **错误镜像、无效证明和凭据泄漏如何联动处置的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **错误镜像、无效证明和凭据泄漏如何联动处置的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **错误镜像、无效证明和凭据泄漏如何联动处置的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

对于“错误镜像、无效证明和凭据泄漏如何联动处置”，凭据只在消费者需要的边界解密，Git 与普通日志中不得出现明文。
对于“错误镜像、无效证明和凭据泄漏如何联动处置”，轮换必须同时证明旧凭据已失效、新凭据已覆盖全部消费者，并保留灾备恢复入口。

#### 错误镜像、无效证明和凭据泄漏如何联动处置的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `错误镜像、无效证明和凭据泄漏如何联动处置` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `错误镜像、无效证明和凭据泄漏如何联动处置` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `错误镜像、无效证明和凭据泄漏如何联动处置` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `错误镜像、无效证明和凭据泄漏如何联动处置` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“错误镜像、无效证明和凭据泄漏如何联动处置”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 错误镜像、无效证明和凭据泄漏如何联动处置的静态检查模板

下面命令为“错误镜像、无效证明和凭据泄漏如何联动处置”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 错误镜像、无效证明和凭据泄漏如何联动处置
evidence_file="./evidence/check-3729da387d.txt"
docker buildx imagetools inspect "$IMAGE_REF" | tee -a "${evidence_file}"
cosign verify "$IMAGE_REF" | tee -a "${evidence_file}"
cosign verify-attestation --type slsaprovenance "$IMAGE_REF" | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“错误镜像、无效证明和凭据泄漏如何联动处置”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 错误镜像、无效证明和凭据泄漏如何联动处置的故障实验与恢复

“错误镜像、无效证明和凭据泄漏如何联动处置”的可逆故障场景是：撤销旧凭据并轮换新版本，逐个验证生产者、分发者和消费者；残留旧访问能力视为恢复失败。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“错误镜像、无效证明和凭据泄漏如何联动处置”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“错误镜像、无效证明和凭据泄漏如何联动处置”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“错误镜像、无效证明和凭据泄漏如何联动处置”执行恢复策略：先撤销暴露或过期身份，再签发新版本并逐个验证生产者、分发者和消费者，最后证明旧身份已无访问能力。
4. 重新采集“错误镜像、无效证明和凭据泄漏如何联动处置”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“错误镜像、无效证明和凭据泄漏如何联动处置”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

### 如何用成功、失败、交接和清理四条路径完成验收

由未参与实现的人员逆向查询一次成功和失败发布，并验证超时接管、证据保留和临时资源清理。

#### 如何用成功、失败、交接和清理四条路径完成验收的机制边界


- **如何用成功、失败、交接和清理四条路径完成验收的声明输入**：源码 SHA、制品 Digest 与证明必须拥有稳定身份、明确 Owner 和可比较的前后版本。
- **如何用成功、失败、交接和清理四条路径完成验收的控制过程**：CI、Registry、策略验证器与配置写回者分别保存观察结果、决策原因和最后成功时间，避免把多个阶段压成一个“成功”。
- **如何用成功、失败、交接和清理四条路径完成验收的运行结果**：生产 Pod imageID 与发布证据索引必须能回指同一变更 ID，无法回指时发布状态只能是未知。
- **如何用成功、失败、交接和清理四条路径完成验收的恢复入口**：在执行前确定 Revert、Abort、凭据撤销或人工接管的触发条件和负责人。

围绕“如何用成功、失败、交接和清理四条路径完成验收”先固定输入和 Owner，再观察控制器是否接受、推进并报告结果。
“如何用成功、失败、交接和清理四条路径完成验收”出现绿色状态时仍只回答当前层次的问题，不能替代下一层的数据面或业务验收。

#### 如何用成功、失败、交接和清理四条路径完成验收的决策与证据

| 判定层 | 本节点要核对的事实 | 合格证据 | 拒绝或暂停条件 |
|---|---|---|---|
| 输入 | `如何用成功、失败、交接和清理四条路径完成验收` 使用的版本、参数与审批是否唯一 | Commit、Digest、对象 generation 或工单 ID | 使用浮动引用或来源不明 |
| 控制 | `如何用成功、失败、交接和清理四条路径完成验收` 的各控制器是否观察到同一输入并完成自己的动作 | Status、Condition、事件与控制器日志 | 永久错误、超时或状态互相矛盾 |
| 数据面 | `如何用成功、失败、交接和清理四条路径完成验收` 的最终对象、路由或制品是否与声明一致 | 对象快照、Manifest、Endpoint 或真实请求 | 只有 API 接受记录，没有运行结果 |
| 恢复 | `如何用成功、失败、交接和清理四条路径完成验收` 的回退入口与清理动作能否重复执行 | Revert 记录、恢复耗时与残留检查 | 回退依赖临时口令或个人记忆 |

为“如何用成功、失败、交接和清理四条路径完成验收”预先定义成功、暂未完成、失败、未知四种结果。暂未完成必须有最大等待时间；未知表示证据链不可用，默认不得自动晋级。

#### 如何用成功、失败、交接和清理四条路径完成验收的静态检查模板

下面命令为“如何用成功、失败、交接和清理四条路径完成验收”建立最小证据快照。资源名、命名空间、仓库和地址需按环境替换；未接入真实系统时不能写成运行验证结论。

```bash
# check: 如何用成功、失败、交接和清理四条路径完成验收
evidence_file="./evidence/check-edbeb5aaaa.txt"
git rev-parse HEAD | tee -a "${evidence_file}"
kubectl get pod -n demo -o wide | tee -a "${evidence_file}"
kubectl get events -n demo --sort-by=.lastTimestamp | tee -a "${evidence_file}"
date -u +%FT%TZ | tee -a "${evidence_file}"
```
“如何用成功、失败、交接和清理四条路径完成验收”的命令返回零只说明查询完成。验收记录还要保存对象版本、查询时间和关键输出；若权限不足而缺失一层证据，应修复取证权限或把结果标为未知。

#### 如何用成功、失败、交接和清理四条路径完成验收的故障实验与恢复

“如何用成功、失败、交接和清理四条路径完成验收”的可逆故障场景是：隔离候选制品并暂停晋级，不删除现有证明，修复后以同一 Digest 复验。实验前保存基线并设置停止条件，故障中不得顺手修改第二个变量。

1. 保存“如何用成功、失败、交接和清理四条路径完成验收”的输入 Revision、对象 `resourceVersion`、运行身份、最近事件和当前业务基线。
2. 注入与“如何用成功、失败、交接和清理四条路径完成验收”直接相关的单一故障，记录第一个异常信号、告警延迟和是否越过门禁。
3. 为“如何用成功、失败、交接和清理四条路径完成验收”执行恢复策略：冻结后续变更并保留当前稳定状态，恢复版本化输入后等待控制器重新收敛，再用业务证据关闭事件。
4. 重新采集“如何用成功、失败、交接和清理四条路径完成验收”的同一组证据，确认控制器不再重试旧变更，数据面回到稳定版本，临时权限与对象已经清理。

恢复完成的判据不是页面重新变绿，而是“如何用成功、失败、交接和清理四条路径完成验收”的输入、控制状态、运行结果和清理记录再次对齐。若仍有旧连接、旧凭据、悬挂任务或无法解释的指标窗口，事件不能关闭。

## 第 9 章 · 构建输入与制品晋级

### 构建输入如何固定并解释不可复现差异
可复现构建要求源码、依赖、基础镜像、构建器、参数和时间相关输入都有稳定身份。版本文件或锁文件只能固定一部分依赖，还要记录包代理、基础镜像 Digest、构建器版本和生成器配置。构建成功后应保存输入快照，下一次差异才能解释为输入变化、缓存污染或工具行为变化。

#### 缓存优化必须服从正确性

缓存键至少包含构建上下文、依赖锁文件、基础镜像身份和关键参数。跨项目、跨租户缓存需要权限和命名空间隔离；缓存命中只说明复用了结果，不能证明结果仍满足质量规则。遇到可疑差异时，应先禁用缓存复现，再比较产物 Digest 和测试报告。

### 制品晋级如何保持证据连续
制品晋级是同一 Digest 在不同环境间改变授权状态，而不是每个环境重新构建一个“相同版本”。晋级记录应包含来源环境、目标环境、审批、门禁结果、配置 Revision 和观察窗口；任何重新构建都必须生成新的身份并重新验证。

#### 处理失败晋级和紧急变更

晋级失败时保留原制品和证明，暂停后续自动操作，先判断是策略拒绝、仓库不可用、目标环境不健康还是业务门禁失败。紧急变更可以使用 Break Glass，但必须设定过期时间、最小权限、事后回写和恢复声明，不能把手工修改当成新的事实来源。
