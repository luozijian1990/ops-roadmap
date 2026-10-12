# Claude Academy：AI 原生 SDLC 课程导读与进阶实践

本文配合 [AI 原生 SDLC 实践手册](./playbook.md) 和 [运维工具迭代示例](./example.md)，提供官方课程入口，并进一步说明任务回放式评估、可信审批和故障回归。

## 阅读说明

### 材料定位与学习顺序

三份材料分别适合解决不同问题：

| 材料 | 用途 | 建议读法 |
| --- | --- | --- |
| [实践手册](./playbook.md) | 理解六个 SDLC 阶段及各项实践的依赖 | 首次学习时阅读 |
| [运维工具迭代示例](./example.md) | 看一次变更如何从需求走到发布与故障回流 | 对照手册阅读 |
| 本文 | 查找对应课节，深入评估、审批与回归设计 | 阅读前两份材料后按需查阅 |

本文依据 [Claude Academy：The AI-native SDLC playbook](https://academy.claude.com/courses/ai-native-sdlc-playbook) 编写，课程链接与重点示例核对日期为 2026-10-12。标注“课程要点”的内容是官方材料归纳；“实践补充”和练习是本仓库的教学设计，不是课程逐字翻译或官方作业。

示例沿用 `example.md` 的只读巡检 CLI `ops-probe`。本文提供设计与练习说明，未执行模型评估、CI 发布或生产操作；动手练习需自行准备实验代码和运行环境。

### 内容导航

- [一、官方课程与现有资料的对应关系](#academy-map)
- [二、关键实践补充](#academy-practice)
- [三、两个进阶练习](#academy-exercises)
- [参考资料](#academy-references)

<a id="academy-map"></a>

## 一、官方课程与现有资料的对应关系

### 14 节课的阅读入口

官方课节名称使用中文意译；“建议关注”是本文提出的学习问题。

| 课节 | 官方课程入口 | 现有手册与示例 | 建议关注 |
| --- | --- | --- | --- |
| 1 | [哪些环节发生变化，从哪里开始](https://academy.claude.com/courses/ai-native-sdlc-playbook/introduction) | [手册：定义与阶段变化](./playbook.md#sd-definition) | 先解决自己的流程瓶颈，不把所有实践一次铺开 |
| 2 | [把需求记录为 intent.md](https://academy.claude.com/courses/ai-native-sdlc-playbook/capture-intent) | [手册：规划](./playbook.md#sd-s1)；[示例：阶段 1](./example.md#ex-s1) | 区分故障现象、预期结果和未经验证的根因猜测 |
| 3 | [需求与设计](https://academy.claude.com/courses/ai-native-sdlc-playbook/requirements-and-design) | [手册：设计](./playbook.md#sd-s2)；[示例：阶段 2](./example.md#ex-s2) | 需求编号如何连到实现和验收；冲突由谁决定 |
| 4 | [以计划模式作为默认起点](https://academy.claude.com/courses/ai-native-sdlc-playbook/plan-mode) | [手册：构建](./playbook.md#sd-s3)；[示例：阶段 3](./example.md#ex-s3) | 计划有没有明确修改范围、失败路径和验证方式 |
| 5 | [仓库上下文 CLAUDE.md](https://academy.claude.com/courses/ai-native-sdlc-playbook/claude-md) | [手册：构建](./playbook.md#sd-s3)；[示例：一次性准备](./example.md#ex-setup) | 哪些信息每次任务都要知道，哪些应该移出主文件 |
| 6 | [用 Skills 承载组织知识](https://academy.claude.com/courses/ai-native-sdlc-playbook/skills-as-institutional-knowledge) | [手册：构建](./playbook.md#sd-s3)；[示例：一次性准备](./example.md#ex-setup) | 规则何时触发；没有触发时是否仍有确定性检查 |
| 7 | [并行会话与子智能体](https://academy.claude.com/courses/ai-native-sdlc-playbook/parallel-sessions-and-subagents) | [手册：构建](./playbook.md#sd-s3)；[示例：阶段 4](./example.md#ex-s4) | 工作区、上下文和运行权限分别如何隔离 |
| 8 | [给智能体建立反馈循环](https://academy.claude.com/courses/ai-native-sdlc-playbook/give-claude-a-feedback-loop) | [手册：测试](./playbook.md#sd-s4)；[示例：阶段 4](./example.md#ex-s4) | “已经运行”和“声称通过”是否有独立证据 |
| 9 | [在 CI 中持续评估](https://academy.claude.com/courses/ai-native-sdlc-playbook/continuous-evals-in-ci) | [手册：测试](./playbook.md#sd-s4)；[示例：阶段 4](./example.md#ex-s4) | 固定任务起点，比较智能体配置，并保护评分依据 |
| 10 | [将 AI 纳入 PR 评审循环](https://academy.claude.com/courses/ai-native-sdlc-playbook/ai-in-the-pr-review-loop) | [手册：部署](./playbook.md#sd-s5)；[示例：阶段 5](./example.md#ex-s5) | 评审有没有检查需求符合性，而不只是代码风格 |
| 11 | [用 Hooks 设置审批关卡](https://academy.claude.com/courses/ai-native-sdlc-playbook/hooks-as-approval-gates) | [手册：部署](./playbook.md#sd-s5)；[示例：阶段 5](./example.md#ex-s5) | 谁批准了哪个环境、哪个制品，执行端如何核验 |
| 12 | [CI/CD 集成与部署](https://academy.claude.com/courses/ai-native-sdlc-playbook/ci-cd-integration-and-deployment) | [手册：部署](./playbook.md#sd-s5)；[示例：阶段 5](./example.md#ex-s5) | 诊断身份、代码修改身份和发布身份是否分离 |
| 13 | [根据指标闭合反馈循环](https://academy.claude.com/courses/ai-native-sdlc-playbook/closing-the-loop-on-metrics) | [手册：维护](./playbook.md#sd-s6)；[示例：阶段 6](./example.md#ex-s6) | 告警能否形成可复现证据，而不是直接变成变更命令 |
| 14 | [结语与相关资源](https://academy.claude.com/courses/ai-native-sdlc-playbook/closing-thoughts-and-resources) | [手册：结语](./playbook.md#sd-c9)；[示例：流程裁剪](./example.md#ex-tailor) | 当前真正需要补哪一项能力，而不是追求形式完整 |


### 按当前需要选择起点

课程按六个非线性阶段组织实践，读者可以根据瓶颈与前置条件选择起点，不必一次启用完整闭环。[来源：第 1 课](https://academy.claude.com/courses/ai-native-sdlc-playbook/introduction)

| 当前需要 | 建议重点阅读 | 可以先完成的产物 |
| --- | --- | --- |
| 把 AI 协作开发用于一项小变更 | 第 2、3、4、5、8 课与现有示例 | 需求、计划和验收证据 |
| 比较模型、Skills 或仓库规则的调整 | 第 6、7、9、10 课与本文评估补充 | 同一任务下的配置比较记录 |
| 接入团队交付流程 | 第 11、12、13 课与本文审批、回归补充 | 审批验收用例与故障回归案例 |

<a id="academy-practice"></a>

## 二、关键实践补充

### 规则、检查与授权各自负责什么

课程用 `CLAUDE.md` 承载仓库常识，用 Skills 承载特定任务的组织知识，并以反馈循环和 Hooks 支撑执行过程。[来源：第 5 课](https://academy.claude.com/courses/ai-native-sdlc-playbook/claude-md)、[第 6 课](https://academy.claude.com/courses/ai-native-sdlc-playbook/skills-as-institutional-knowledge)、[第 8 课](https://academy.claude.com/courses/ai-native-sdlc-playbook/give-claude-a-feedback-loop)、[第 11 课](https://academy.claude.com/courses/ai-native-sdlc-playbook/hooks-as-approval-gates)

**实践补充。**以“巡检凭证不得出现在输出中”为例，分工可以保持简单：

| 位置 | 主要职责 | 在 ops-probe 中的例子 |
| --- | --- | --- |
| 仓库说明与 Skill | 说明约束和检查方法 | 修改采集、错误处理和日志时检查凭证输出 |
| 执行前 Hook | 拦截明确禁止的工具调用或路径操作 | 阻止未经授权的发布调用 |
| 执行后 Hook | 对已经产生的修改提供快速反馈 | 运行格式检查或局部测试 |
| 受保护的 CI 检查 | 独立验证实现与修改范围 | 检查正常、超时和异常日志中的假凭证标记 |
| 运行环境与服务端 | 执行身份、目标和动作的权限限制 | 限定巡检目标，核验发布授权 |

执行后的检查无法撤销已经发生的请求或泄漏；需要事前限制的动作，应由执行前控制或服务端处理。[来源：Hooks 参考](https://code.claude.com/docs/en/hooks)

评审时，把重要需求对应到实现与验收证据即可。需求与计划的完整写法见 [示例阶段 2](./example.md#ex-s2) 和 [阶段 3](./example.md#ex-s3)。

### 任务回放式评估：比较配置能否完成同一任务

对应课程：[第 9 课：在 CI 中持续评估](https://academy.claude.com/courses/ai-native-sdlc-playbook/continuous-evals-in-ci)；配套阅读：[示例阶段 4](./example.md#ex-s4)。

**课程要点。**课程示例从任务发生前的提交建立临时工作区，注入待测的仓库说明和配置，再检查智能体生成的结果与修改范围。这样可以比较配置调整后，智能体是否仍能完成同一项任务。[来源：第 9 课](https://academy.claude.com/courses/ai-native-sdlc-playbook/continuous-evals-in-ci)

**实践补充。**先区分两个验证对象：

| 验证对象 | 输入 | 要回答的问题 |
| --- | --- | --- |
| 程序回归测试 | 已实现的程序与固定输入 | 这份代码是否满足契约？ |
| 智能体工作流评估 | 任务开始前的代码、任务描述与候选配置 | 这套配置能否生成满足契约的实现，并遵守修改范围？ |

#### 一张最小任务卡

下面是教学任务卡示意，字段由自己的评估器解释：

```yaml
case_id: ops-probe-debug-without-secrets
baseline_commit: "<任务开始前的完整提交 SHA>"
candidate_config: "<待测仓库说明、Skills、Hooks 的版本>"
prompt: |
  为巡检增加调试信息，用于定位目标服务响应异常。
  保留目标白名单和现有输出契约。
  请求凭证不得出现在标准输出、标准错误或应用日志中。
  不修改已有测试、评分器和构建入口。
allowed_changes:
  - src/ops_probe/collect.py
  - src/ops_probe/output.py
  - tests/test_debug_redaction_new.py
checks:
  - 现有行为与输出契约不变
  - 正常、错误、超时与调试输出中均无假凭证标记
  - 不请求未登记目标
  - 仅修改允许的路径
```

路径与版本需替换为实验项目的实际值。这里保护已有测试，是本任务的评估约束；正常功能演进仍可以通过评审调整测试。

#### 怎样保证比较有效

```text
固定任务、代码基线与评分版本
    → 创建干净实验环境，注入候选配置
    → 确认配置加载，执行智能体任务
    → 保存最终文件、差异与工具日志，结束智能体写入
    → 在独立环境运行评分器
    → 记录结果；下一次从同一基线重新开始
```

评估时优先保证四件事：

1. **比较条件一致。**比较 A、B 配置时，固定任务、基线、模型、工具与预算，只改变要研究的配置变量；更换模型时则固定其他条件。
2. **评分依据受保护。**评分器由评估负责人维护，放在智能体写权限之外。开始时独立记录基准，结束时比较最终快照，避免智能体提交代码后被误判为没有修改。
3. **实验之间相互独立。**每次使用干净环境，不暴露其他运行的成品或后续修复答案。Git worktree 可以准备代码，但共享部分仓库数据，不能单独承担权限隔离。[依据：Git worktree 文档](https://git-scm.com/docs/git-worktree)
4. **评分器先校准。**正确实现应通过；泄漏假凭证的实现应失败；改评分入口来伪造成功的实现应被拒绝。

评估环境和评分环境只使用假凭证与实验资源。评分器需要执行生成的代码时，也应限制其权限。公开 PR 的代码与 Hooks 不应在持有生产凭证的高权限工作流中直接执行。[依据：GitHub Actions 安全使用参考](https://docs.github.com/en/actions/reference/security/secure-use)

#### 保存结果，而不只保存一句“通过”

每次运行至少记录代码与配置版本、模型与 CLI 版本、评分版本、检查结果、耗时、失败原因和证据位置。多次运行可以观察结果波动，任务、单次运行与评分器的划分可参考 [Anthropic 的评估工程文章](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)。

| 状态 | 含义 |
| --- | --- |
| `PASS` | 本次任务完成，必需检查全部通过 |
| `FAIL` | 违反契约、越界修改，或在预算内未完成 |
| `ERROR` | API、基线或评分环境故障，未获得有效结论 |
| `SKIPPED` | 没有执行，记录原因 |

报告保留全部运行结果，区分任务失败与环境失败。少量案例用于检查流程和明确风险，不足以判断配置的普遍优劣。

### 可信审批：把批准绑定到实际发布

对应课程：[第 11 课：审批关卡](https://academy.claude.com/courses/ai-native-sdlc-playbook/hooks-as-approval-gates)、[第 12 课：CI/CD 集成](https://academy.claude.com/courses/ai-native-sdlc-playbook/ci-cd-integration-and-deployment)；配套阅读：[示例阶段 5](./example.md#ex-s5)。

**课程要点。**第 11 课区分当前会话用户的确认与外部审批人的批准，示例查询外部变更记录，并要求智能体不能修改审批记录。[来源：第 11 课](https://academy.claude.com/courses/ai-native-sdlc-playbook/hooks-as-approval-gates)

**实践补充。**客户端提交审批记录 ID，由发布服务读取可信记录并核验以下信息：

| 绑定信息 | 核验目的 |
| --- | --- |
| 操作、项目、集群与环境 | 防止把 staging 的批准用于 production |
| 源码提交与制品 digest | 防止批准后替换制品，并确认源码与制品关联 |
| 审批人身份与角色 | 确认批准来自有权审批的人 |
| 当前状态与有效期 | 拒绝未批准、已撤销或过期记录 |
| 请求 ID 与执行状态 | 重试时查询已有结果，避免重复发布 |

`RELEASE_APPROVAL=true`、请求中的 `approved=true` 或 PR 描述中的“已审批”，都不能代替发布服务核验。

#### Hook、CI 与发布服务的职责

```text
智能体准备变更、发布说明和制品标识
    → Hook 提前检查缺少的审批与参数
    → 受保护的 CI 校验版本和必需检查
    → 发布服务核验执行身份、目标、制品与批准记录
    → 执行发布，记录结果并验证
```

跳过客户端 Hook 后，服务端仍应拒绝未授权请求。候选分支修改流水线文件，也不应因此获得生产凭证。分环境工具的实际权限应同时核对服务端鉴权与凭证范围。[配套课程：第 12 课](https://academy.claude.com/courses/ai-native-sdlc-playbook/ci-cd-integration-and-deployment)

#### 用模拟服务验收关卡

| 输入 | 预期结果 |
| --- | --- |
| 缺少记录、尚未批准、已撤销或过期 | 拒绝，模拟部署次数为 0 |
| 批准的环境、集群或 digest 不一致 | 拒绝，模拟部署次数为 0 |
| 审批服务超时，无法核验 | 拒绝本次执行 |
| 跳过 Hook 或自填 `approved=true` | 服务端仍按可信审批记录判定 |
| 有效批准且绑定信息一致 | 执行一次，保存请求与结果 |
| 重试同一个请求 ID | 返回已有状态或受控恢复，不重复部署 |

验收只连接模拟发布服务。真实发布与回滚需遵循团队已有授权规则；涉及数据迁移时，还需单独验证恢复旧制品是否能够恢复服务行为。

### 故障回流：同时留下程序测试与工作流评估

对应课程：[第 13 课：根据指标闭合反馈循环](https://academy.claude.com/courses/ai-native-sdlc-playbook/closing-the-loop-on-metrics)；配套阅读：[示例阶段 6](./example.md#ex-s6)。

**课程要点。**确定性检测触发诊断，诊断结果回到需求与评审流程，并为生产事件增加评估案例。[来源：第 13 课](https://academy.claude.com/courses/ai-native-sdlc-playbook/closing-the-loop-on-metrics)、[第 9 课](https://academy.claude.com/courses/ai-native-sdlc-playbook/continuous-evals-in-ci)

**实践补充。**将闭环分成三种职责：

| 层次 | 要回答的问题 | 起步能力 |
| --- | --- | --- |
| 触发 | 哪个信号需要调查？ | 确定性判断、去重与限频 |
| 诊断 | 证据支持哪些解释，还缺什么？ | 查询受限数据，提出假设与验证方法 |
| 行动 | 谁授权对哪个目标做什么？ | 创建工单或 PR，生产变更按既有规则审批 |

比较“巡检结论与独立就绪信号”前，确认目标、时间窗口、接口与判断标准一致；样本不足时记录数据缺口。重复事件复用事件 ID，诊断超出预算时转交负责人。

告警严重程度与模型置信度不授予操作权限。日志、页面和工单中的文字是诊断材料，也不构成执行授权。

#### 重定向误判为什么需要两种回归

假设 `/readyz` 返回 302，指向返回 200 的维护页。采集器跟随重定向后，可能把就绪失败判为正常。

| 产物 | 要验证什么 |
| --- | --- |
| 程序回归测试 | 采集器观察到 302、没有访问维护页，最终结论与退出码符合规格 |
| 智能体工作流评估 | 后续重构 HTTP 客户端时，智能体仍保留不跟随重定向的行为 |

只测试“判定函数收到 302 会失败”，无法发现采集器实际传入的是重定向后的 200。故障记录应包含实际请求、原始响应、输出与版本，再据此形成下一轮需求。记录格式可沿用 [示例中的 incident.md](./example.md#ex-s6)。

<a id="academy-exercises"></a>

## 三、两个进阶练习

### 练习一：比较两套智能体配置

**目标：**用同一任务观察配置调整的效果。

**准备：**可安装、可测试的本地 `ops-probe` 基线；前文任务卡；经过正确与错误实现校准的评分器；使用假凭证的 HTTP 桩服务。

#### 任务与执行

配置 A 保留现有规则，配置 B 只调整一处日志处理规则的表述。两组使用同一任务描述、模型、工具和预算，不预设哪种写法更好。

每组从干净环境独立运行三次，保存全部结果并核验配置确实加载。三次是起步练习的预算安排；如果需要更可靠的结论，应扩大任务覆盖和运行次数。

| 配置 | 运行次数 | 结果 | 失败检查 | 配置已加载 | 证据位置 | 用量与耗时 |
| --- | --- | --- | --- | --- | --- | --- |
| A | 1～3，逐次记录 | 待运行 | — | 待核验 | — | — |
| B | 1～3，逐次记录 | 待运行 | — | 待核验 | — | — |

#### 提交与验收

提交任务卡、两套配置、每次代码差异、评分结果和比较报告。报告应能够追溯结果，并区分实现、越界、环境和评分器问题。

两组都通过时，写“本组任务中未观察到差异”；失败结果也保留。会话内修正过程和重试次数应记录，避免只展示最好的一次。

### 练习二：把重定向误判变成两种回归

**目标：**从一次采集缺陷形成程序回归测试和后续工作流评估。

**准备：**可复现“跟随重定向”缺陷的实验基线；所有地址均为登记过的本地桩服务。

| 路径 | 桩服务行为 | 关注结果 |
| --- | --- | --- |
| `/healthz` | 返回 200 | 存活检查按现有契约正常 |
| `/readyz` | 返回 302，指向 `/maintenance` | 就绪检查不能因此被判为正常 |
| `/maintenance` | 返回 200 | 不应因就绪探测而被自动访问 |

#### 任务与执行

1. 记录缺陷复现时的实际请求、响应、输出和退出码。
2. 补程序回归测试，确认它因该缺陷失败，再修复采集行为。
3. 由独立检查重新运行，确认观察到 302、维护页请求次数为 0，结论与退出码符合规格。
4. 从修复后的固定基线设计工作流评估：请智能体重构 HTTP 客户端以改善并发结构，同时要求保持就绪语义。由外部检查验证重构没有重新启用跟随重定向。

#### 提交与验收

提交 `incident.md`、下一轮 `intent.md`、程序回归测试、工作流评估任务及实际运行证据。

验收应覆盖采集层与判定层的完整交互。只断言判定函数如何处理 302，或只重跑成品测试，均未完成本练习要求的两种回归。

练习结束后，记录本次证明了什么、仍缺哪些覆盖，以及下一次值得增加的案例。未运行的部分注明原因。

<a id="academy-references"></a>

## 参考资料

### 官方课程与技术依据

| 资料 | 用途 |
| --- | --- |
| [Claude Academy：AI-native SDLC 课程](https://academy.claude.com/courses/ai-native-sdlc-playbook) | 课程结构与逐节入口 |
| [Anthropic：AI-native SDLC Playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook) | 现有手册的原始材料 |
| [Anthropic：智能体评估工程](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | 任务、单次运行、评分器与实验环境 |
| [Claude Code：Hooks 参考](https://code.claude.com/docs/en/hooks) | 执行前后 Hook 的行为 |
| [Git：git-worktree 文档](https://git-scm.com/docs/git-worktree) | 多工作区共享的仓库数据 |
| [GitHub Actions：安全使用参考](https://docs.github.com/en/actions/reference/security/secure-use) | 不可信代码与特权工作流 |

课程入口已列在第一章。产品行为与权限配置以实施时的官方文档为准。
