---
title: 为 Codex / GPT-5.6 编写提示
description: GPT-5.6 在 Codex 类 Agentic Coding 环境中的提示工程、工具协作、范围控制、验证和交付实践。
---

> 面向运行在 Codex、Codex CLI、Codex-like Harness 或其他 Agentic Coding 环境中的 GPT-5.6。
>
> 本文中的 “Codex 5.6” 指 GPT-5.6 模型运行在 Codex 类编码智能体环境中的组合，而不是一个名为 `gpt-5.6-codex` 的独立模型。

GPT-5.6 相比上一代模型更擅长从目标和上下文中推断用户真正想完成的工作，因此通常不需要通过非常详细的步骤告诉模型“先做什么、再做什么”。

对于编码智能体，提示的重点应该逐渐从：

```text wrap
按照下面 17 个步骤执行。
```

转变为：

```text wrap
这是目标。
这是相关上下文。
这些是不能违反的约束。
这些操作允许自主执行。
这些操作需要确认。
这是完成标准。
这是完成后必须提供的证据。
```

也就是说：

**Prompt 不应该成为 Agent 的脚本。**

Prompt 更应该成为：

**Agent 的工作合同。**


如果你观察到以下现象，可以从对应章节开始调整。

* 简单任务花费大量时间：Reasoning effort 是否过高
* 复杂任务草率完成：Reasoning effort / 成功条件是否不足
* System Prompt 越写越长：精简 Prompt
* Codex 一直解释接下来要做什么，却没有执行：完成整个任务
* 每执行一步都问“要继续吗？”：Autonomy / Approval Boundary
* 用户只是问问题，Codex 却修改代码：区分 Analysis 与 Mutation
* 修改一个函数却重写整个文件：定向编辑
* 顺手重构大量无关代码：Scope Discipline
* 发现旁边 Bug 顺手一起修：Scope Discipline
* 写了很多和需求无关的测试：Test Discipline
* 修改后没有真正验证：Verification
* 一次只读一个文件，工具调用轮数很多：并行获取独立信息
* Agent 反复读取同一个文件：Tool Discipline
* 长任务做到一半停下：Persistence
* 长会话后忘记原始约束：Context / Compaction
* `AGENTS.md` 越来越巨大：Repository Knowledge Architecture
* 多 Agent 开了但没真正并行：Subagent Delegation
* 大批 Tool Call 非常耗上下文：Programmatic Tool Calling
* 查当前 API 却凭模型记忆回答：Freshness Verification
* 前端代码能运行但视觉质量不好：Visual Verification
* 最终回复只有“Done”：Final Delivery


## 选择合适的 Reasoning Effort

GPT-5.6 支持：

```text wrap
none
low
medium
high
xhigh
max
```

不要默认认为：

```text wrap
max = 最佳
```

Reasoning effort 本质上是：

```text wrap
质量
  ↕
推理量
  ↕
延迟
  ↕
成本
```

之间的控制器。

对于 Codex 类型任务，一个实用起点是：

```text wrap
low
```

适用于：

* 简单配置修改
* 明确的小 Bug
* 文档修改
* 格式调整
* 小范围 CRUD

```text wrap
medium
```

适用于：

* 普通 Feature
* 多文件修改
* Repository 探索
* 常规 Debug
* API 集成

```text wrap
high
```

适用于：

* 架构调整
* 较复杂 Debug
* Migration
* 并发问题
* 状态一致性问题
* 多组件交互

```text wrap
xhigh / max
```

适用于：

* 高风险 Migration
* 大规模 Repository 修改
* 难复现 Bug
* 复杂性能问题
* 安全 Review
* 需要大量验证的任务

Prompt 本身通常不需要写：

```text wrap
Think very hard.
Think step by step.
Spend more time thinking.
```

中文翻译：

```text wrap
请认真思考。
请一步一步分析。
请多花些时间思考。
```

应该通过模型参数控制 reasoning effort。

Prompt 更应该描述：

```text wrap
目标
约束
成功标准
必须验证的证据
```


## Prompt 要尽量精简

GPT-5.6 不需要一个巨大的 System Prompt 才能正确工作。

事实上，过多重复规则可能导致：

* 规则互相覆盖
* Agent 过度保守
* Agent 不知道哪些规则最重要
* 上下文浪费
* 工具描述占据大量 Context
* 长 Session 中重复内容越来越多

因此：

```text wrap
State each important rule once.
```

中文翻译：

```text wrap
每条重要规则只写一遍。
```

是非常重要的设计原则。

例如不要同时写：

```text wrap
Do not modify unrelated code.

Stay within scope.

Do not make unnecessary changes.

Only modify files relevant to the task.

Do not perform unrelated refactors.

Avoid unnecessary edits.
```

中文翻译：

```text wrap
不要修改无关代码。

不要超出任务范围。

不要做不必要的改动。

只修改与任务相关的文件。

不要顺手重构无关部分。

避免无谓改动。
```

这些其实是在重复同一条规则。

更好的写法：

```text wrap
Keep changes limited to what is required for the user's requested outcome.
Report unrelated issues separately instead of fixing them.
```

中文翻译：

```text wrap
改动只做到实现用户要求为止。
发现无关问题时单独报告，不要顺手修复。
```

一条即可。


## Outcome First，而不是 Process First

GPT-5.6 更适合 Outcome-Oriented Prompt。

不要过早规定执行路径。

例如：

```text wrap
1. Read main.go.
2. Read config.go.
3. Search for references.
4. Inspect tests.
5. Modify config.go.
6. Run gofmt.
7. Run tests.
```

中文翻译：

```text wrap
1. 阅读 main.go。
2. 阅读 config.go。
3. 搜索引用位置。
4. 检查测试。
5. 修改 config.go。
6. 运行 gofmt。
7. 运行测试。
```

这种提示会把模型锁死在你预想的路径里。

更好的方式：

```text wrap
Goal:
Add CIDR support to src and dst rules without changing existing exact-IP behavior.

Constraints:
- Preserve backward compatibility.
- Reuse existing configuration structures where practical.
- Do not introduce a new dependency unless necessary.

Done when:
- Exact IP rules still work.
- CIDR rules match correctly.
- Existing repository validation passes.
```

中文翻译：

```text wrap
目标：
保持现有精确 IP 行为不变，让 src 和 dst 规则支持 CIDR。

约束：
- 保持向后兼容。
- 能复用现有配置结构就复用。
- 除非必要，不要引入新依赖。

完成条件：
- 现有精确 IP 规则仍能正常工作。
- CIDR 规则能正确匹配。
- 现有仓库的验证通过。
```

让 Codex 自己决定：

```text wrap
读哪些文件
搜索哪些 Symbol
改哪些代码
跑哪些验证
```

Prompt 负责描述：

```text wrap
WHAT
WHY
BOUNDARY
DONE
```

中文翻译：

```text wrap
做什么
为什么
边界
完成标准
```

Agent 负责：

```text wrap
HOW
```

中文翻译：

```text wrap
怎么做
```


## 要求有意义的进度更新

长时间 Coding Agent 最容易出现的 UX 问题之一是：

```text wrap
工具跑了很久
↓
用户什么都不知道
↓
最后突然 Done
```

也不要走向另一个极端：

```text wrap
正在读取文件。
正在搜索。
正在打开目录。
正在运行测试。
正在继续分析。
```

这只是 Tool Narration。

推荐 Prompt：

```text wrap
For longer tasks, give brief user-facing progress updates when:

- starting a major phase of work,
- discovering something that materially changes the approach,
- finding an important cause or blocker,
- completing a meaningful milestone.

Do not narrate routine tool calls.

Each update should communicate a concrete result or decision, not merely the next command you intend to run.
```

中文翻译：

```text wrap
较长任务中，在以下时机向用户简短更新进度：

- 开始重要阶段时；
- 发现会明显改变方案的信息时；
- 找到重要原因或阻塞时；
- 完成重要里程碑时。

不要叙述例行工具调用。

每次更新都要说明具体结果或决定，不要只说准备运行什么命令。
```

例如好的更新：

```text wrap
I found that traffic matching is currently performed after CIDR values
have already been normalized into exact addresses, so adding parsing only
in the YAML layer would not be sufficient. I'm changing the matcher rather
than the configuration schema.
```

中文翻译：

```text wrap
我发现流量匹配发生在 CIDR 值已被规范化为精确地址之后，所以只改 YAML 层的解析还不够。我会改匹配器，不改配置 schema。
```

而不是：

```text wrap
Now I'll inspect matcher.go.
```

中文翻译：

```text wrap
现在我会检查 matcher.go。
```


## 并行获取独立信息

Coding Agent 中一个常见的低效率模式是：

```text wrap
read A
↓
模型
↓
read B
↓
模型
↓
read C
↓
模型
```

如果 A、B、C 相互独立，这些读取应该尽可能一起执行。

推荐 Prompt：

```text wrap
Before requesting repository information, determine which inputs are independent.

Fetch independent files, searches, logs, symbols, or metadata concurrently when the available tools support it.

Do not serialize independent inspection work unnecessarily.

Only wait for one result before requesting another when the second request genuinely depends on the first.
```

中文翻译：

```text wrap
获取仓库信息前，先分清哪些输入互不依赖。

如果工具支持，就并行获取彼此独立的文件、搜索结果、日志、符号或元数据。

独立的检查不要无谓地串行进行。

只有后一项请求确实依赖前一项结果时，才等一个结果出来再请求另一个。
```

例如需要了解一个 Feature 时：

```text wrap
config
implementation
tests
documentation
call sites
```

中文翻译：

```text wrap
配置
实现
测试
文档
调用点
```

往往可以一次性搜索，而不是五轮。

但是：

```text wrap
search symbol
↓
发现真正实现文件
↓
read implementation
```

这是有依赖关系的，就不应该强行并行。


## 不要重复已经完成的 Tool Work

长 Agent Loop 中很容易出现：

```text wrap
grep Foo
read foo.go
...
十分钟后
...
又 grep Foo
又 read foo.go
```

因此可以加入：

```text wrap
Treat previous tool results in the current task as working evidence.

Do not repeat a search, file read, test, or command unless:
- the underlying state may have changed,
- the previous result was incomplete,
- you need a different range or representation,
- or verification after modification requires rerunning it.
```

中文翻译：

```text wrap
把当前任务中已经得到的工具结果当作工作依据。

除非满足以下情况，否则不要重复搜索、读取文件、运行测试或执行命令：
- 底层状态可能已发生变化；
- 之前的结果不完整；
- 你需要不同的范围或呈现形式；
- 或修改后需要重新运行以完成验证。
```

这个规则对于：

```text wrap
大型 repo
MCP
远程 API
昂贵工具
```

尤其重要。


## 明确 Analysis 与 Mutation 的边界

这是 Codex Prompt 里非常重要的一条。

用户可能说：

```text wrap
你帮我看看这个设计有没有问题？
```

这通常代表：

```text wrap
分析
```

而不是：

```text wrap
直接改代码
```

反过来：

```text wrap
帮我把这个 Bug 修掉
```

显然授权了：

```text wrap
修改 + 验证
```

推荐：

```text wrap
For requests to explain, review, inspect, diagnose, compare, or plan:
inspect the relevant materials and report the result.
Do not modify files unless implementation was requested.

For requests to implement, change, build, migrate, or fix:
make the required in-scope local changes and run appropriate non-destructive validation without asking for permission again.
```

中文翻译：

```text wrap
对于解释、审查、检查、诊断、比较或制定计划的请求：
查看相关材料并报告结果。除非用户要求实施，否则不要改文件。

对于实施、修改、构建、迁移或修复的请求：
完成范围内必要的本地改动，并运行适当的非破坏性验证，不必再次征求许可。
```

这是非常关键的 Intent Boundary。


## 完成整个任务

Agent 最大的问题之一不是“不会做”。

而是：

```text wrap
知道接下来要干什么
但停了
```

典型表现：

```text wrap
The next step would be to update the tests.
```

中文翻译：

```text wrap
下一步是更新测试。
```

然后结束。

或者：

```text wrap
I found the cause.
Would you like me to fix it?
```

中文翻译：

```text wrap
原因找到了。
要我修吗？
```

但用户原本说的是：

```text wrap
帮我修复这个问题
```

这就没有完成任务。

推荐 Prompt：

```text wrap
When the user requests implementation or a fix, carry the task through to completion.

Do not stop after:
- identifying the cause,
- proposing the implementation,
- editing the code,
- or running only part of the available validation.

If the next necessary step can be completed safely with the tools already available, do it instead of announcing it.

End the turn only when:
- the requested outcome is complete,
- a genuine blocker requires information only the user can provide,
- or the next action crosses an approval boundary.
```

中文翻译：

```text wrap
用户要求实施或修复时，要把任务做完。

不要在以下阶段停下：
- 找到原因；
- 提出实现方案；
- 编辑代码；
- 或只运行了部分可用验证。

只要下一步可以用现有工具安全完成，就直接做，不要只宣布。

只有以下情况可以结束本轮：
- 请求的结果已经完成；
- 确实被只能由用户提供的信息阻塞；
- 或下一步操作越过了批准边界。
```

最后再加一句非常有效：

```text wrap
Before ending, check whether your final paragraph describes work you still intend to do.

If it does, and that work is already authorized and possible with the available tools, do it now.
```

中文翻译：

```text wrap
结束前，检查最后一段是否还在说你打算完成什么。

如果是，而且这项工作已获授权、可以用现有工具完成，就现在去做。
```


## 不要为了避免提问而乱猜

Autonomy 不代表：

```text wrap
永远不能问问题
```

应该区分两类 ambiguity。

第一类：

```text wrap
routine ambiguity
```

中文翻译：

```text wrap
一般歧义
```

例如：

```text wrap
文件叫什么
内部函数叫什么
变量如何命名
测试放在哪里
```

这些通常可以从 repository 推断。

第二类：

```text wrap
material ambiguity
```

中文翻译：

```text wrap
重大歧义
```

例如：

```text wrap
删除旧 API 还是保持兼容？
数据库 Migration 能否停机？
这个 Feature 对所有客户开放还是仅 Beta？
生产环境是否允许重启？
```

不同答案会造成完全不同的结果。

推荐：

```text wrap
Resolve routine ambiguity from repository context and established conventions.

Ask only when different reasonable interpretations would materially change:
- user-visible behavior,
- compatibility,
- data,
- security,
- production impact,
- architecture,
- or the requested deliverable.
```

中文翻译：

```text wrap
根据仓库上下文和既有约定解决一般歧义。

只有当不同的合理理解会明显改变以下内容时才提问：
- 用户看到的行为；
- 兼容性；
- 数据；
- 安全性；
- 生产影响；
- 或交付物。
```


## Approval Boundary 应该很窄且明确

如果 Prompt 里面充满：

```text wrap
ask first
ask before changing
ask before running commands
wait for confirmation
```

中文翻译：

```text wrap
先询问
修改前询问
运行命令前询问
等待确认
```

Agent 很容易变成：

```text wrap
我可以读文件吗？
我可以改吗？
我可以跑测试吗？
```

推荐默认授权：

```text wrap
Safe local actions do not require additional confirmation when they are necessary for the requested task:

- reading files,
- searching the repository,
- inspecting logs,
- editing in-scope files,
- running formatters,
- running tests,
- running linters,
- running builds,
- creating temporary diagnostic files,
- other reversible local validation.
```

中文翻译：

```text wrap
完成请求所需的安全本地操作不必额外确认：

- 读取文件；
- 搜索仓库；
- 检查日志；
- 编辑范围内的文件；
- 运行格式化工具；
- 运行测试；
- 运行 lint；
- 运行构建；
- 创建临时诊断文件；
- 其他可逆的本地验证。
```

需要确认的主要是：

```text wrap
Require confirmation before:
- destructive actions,
- irreversible actions,
- external writes not already authorized,
- production changes,
- publishing or deployment,
- purchases or cost-bearing operations,
- deleting important data,
- or materially expanding the requested scope.
```

中文翻译：

```text wrap
在以下情况下需要先确认：
- 破坏性操作；
- 不可逆操作；
- 未获授权的外部写入；
- 生产环境变更；
- 发布或部署；
- 购买或会产生费用的操作；
- 删除重要数据；
- 或明显扩大请求范围。
```

核心原则：

```text wrap
Prepare everything possible first.

Approval should ideally be the final gate,
not the first step.
```

中文翻译：

```text wrap
先尽可能完成所有准备工作。

批准最好放在最后一道关口，
而不是第一步。
```


## 把 AGENTS.md 当成地图，而不是百科全书

Codex 支持通过 `AGENTS.md` 提供 Repository 级持续上下文。

但是不要把整个团队知识库塞进去。

错误设计：

```text wrap
AGENTS.md
  2000 lines
  architecture
  business rules
  code style
  API docs
  deployment docs
  incident docs
  testing docs
  every historical decision
```

中文翻译：

```text wrap
AGENTS.md
  2000 行
  架构
  业务规则
  代码风格
  API 文档
  部署文档
  事故记录
  测试文档
  所有历史决策
```

更好的思想是：

```text wrap
AGENTS.md = map
docs/ = knowledge
code = source of truth
tests = executable expectations
```

中文翻译：

```text wrap
AGENTS.md = 导航图
docs/ = 知识
代码 = 事实依据
测试 = 可执行的预期
```

根级 `AGENTS.md` 可以只告诉 Agent：

```text wrap
Repository structure
Important invariants
Standard validation commands
Where deeper documentation lives
Global prohibitions
```

中文翻译：

```text wrap
仓库结构
重要不变量
标准验证命令
更深入文档的位置
全局禁止事项
```

例如：

```text wrap
# Repository map

Backend services live under `services/`.
Shared Go packages live under `pkg/`.
Deployment manifests live under `deploy/`.

Architecture decisions are documented in `docs/architecture/`.
Operational constraints are documented in `docs/operations/`.

Before changing a service, read the nearest service-level AGENTS.md if present.

Run targeted tests for the affected package before broader validation.
```

中文翻译：

```text wrap
# 仓库地图

后端服务在 `services/` 下。
共享 Go 包在 `pkg/` 下。
部署清单在 `deploy/` 下。

架构决策写在 `docs/architecture/` 中。
运维约束写在 `docs/operations/` 中。

修改服务前，如果存在最近的服务级 `AGENTS.md`，请先阅读它。

先为受影响的包跑定向测试，再做更广泛的验证。
```

然后：

```text wrap
services/payment/AGENTS.md
```

只保存 payment 特有规则。

也就是：

```text wrap
Global rules
    ↓
Repository rules
    ↓
Directory rules
    ↓
Task instructions
```

中文翻译：

```text wrap
全局规则
    ↓
仓库规则
    ↓
目录规则
    ↓
任务指令
```

逐渐具体。


## Repository 本身就是 Specification

Coding Agent 不能只看用户 Prompt。

现有 Repository 本身也是需求的一部分。

推荐：

```text wrap
Before making a non-trivial change, inspect enough surrounding code to understand:

- existing architecture,
- nearby implementation patterns,
- naming conventions,
- dependency choices,
- public interfaces,
- tests,
- and relevant configuration.

Prefer established repository patterns over introducing a new abstraction without a clear need.
```

中文翻译：

```text wrap
做较大改动前，先查看足够多的周边代码，了解：

- 现有架构；
- 附近的实现模式；
- 命名约定；
- 依赖选择；
- 公共接口；
- 测试；
- 以及相关配置。

没有明确需要时，优先沿用仓库现有模式，不要引入新抽象。
```

例如：

用户说：

```text wrap
增加 Redis Cache
```

但 repo 已经存在：

```text wrap
internal/cache
```

就应该优先复用。

而不是新建：

```text wrap
pkg/rediscachev2
```


## 控制修改范围

GPT 类 Coding Agent 有一个常见倾向：

```text wrap
既然都来了
顺便把附近代码优化一下
```

结果：

```text wrap
需求 30 行
Diff 800 行
```

推荐：

```text wrap
Keep changes proportional to the requested outcome.

If you discover:
- a pre-existing bug,
- a performance issue,
- dead code,
- inconsistent formatting,
- an architectural improvement,
- or unrelated cleanup,

do not include it in the current change unless the requested behavior cannot work without it.

Report important unrelated findings separately.
```

中文翻译：

```text wrap
改动规模应与请求的结果相称。

如果发现：
- 原有 Bug；
- 性能问题；
- 死代码；
- 格式不一致；
- 架构改进机会；
- 或无关清理；

除非请求的行为无法在没有它的情况下正常工作，否则不要将其纳入本次改动。

将重要的无关发现单独报告。
```

这条原则可以总结成：

```text wrap
Notice broadly.
Change narrowly.
```

中文翻译：

```text wrap
先全面了解。
只改必要部分。
```


## 不要为了“支持所有可能情况”扩大需求

用户说：

```text wrap
src 和 dst 支持 CIDR
```

Agent 可能自己联想到：

```text wrap
IPv6
DNS
wildcard
port range
protocol matching
dynamic reload
priority rule
```

这些不等于用户要求。

推荐：

```text wrap
When the request is ambiguous, implement the interpretation most directly supported by:
1. the user's wording,
2. surrounding repository behavior,
3. existing conventions.

Do not implement every plausible interpretation.

State any material assumption in the final summary.
```

中文翻译：

```text wrap
请求存在歧义时，实现以下内容最直接支持的理解：
1. 用户的措辞；
2. 周围的仓库行为；
3. 现有约定。

不要实现每一种看似合理的解释。

在最终总结中说明任何重要假设。
```


## 小改动优先定向编辑

如果只修改：

```text wrap
一个函数
一个 YAML 字段
一个条件
```

就不应该默认重写整个文件。

推荐：

```text wrap
Prefer surgical edits when they produce the same end result.

Preserve unrelated:
- formatting,
- comments,
- ordering,
- naming,
- whitespace,
- and file structure.

Rewrite an entire file only when:
- most of the file genuinely needs to change,
- the file is generated,
- or targeted editing would make the result less reliable.
```

中文翻译：

```text wrap
只要结果相同，就优先定向修改。

保留无关的：
- 格式；
- 注释；
- 顺序；
- 命名；
- 空白；
- 以及文件结构。

只有在以下情况下才重写整个文件：
- 文件的大部分确实都需要修改；
- 文件是生成的；
- 或定向编辑会降低结果的可靠性。
```

这样可以降低：

```text wrap
无意义 Diff
Merge Conflict
Review 成本
Token 消耗
```

中文翻译：

```text wrap
无意义 Diff
合并冲突
审查成本
令牌消耗
```


## 验证结果，而不是只生成代码

Coding Agent 最大的价值不是：

```text wrap
Write Code
```

中文翻译：

```text wrap
编写代码
```

而是：

```text wrap
Write
↓
Run
↓
Observe
↓
Fix
↓
Verify
```

中文翻译：

```text wrap
编写
↓
运行
↓
观察
↓
修复
↓
验证
```

因此：

```text wrap
After making changes, run the most relevant validation available for the affected behavior.
```

中文翻译：

```text wrap
改完后，运行现有条件下最相关、能检验受影响行为的验证。
```

优先级通常可以是：

```text wrap
targeted test
↓
type check / compile
↓
lint
↓
package build
↓
smoke test
↓
broader test suite
```

中文翻译：

```text wrap
定向测试
↓
类型检查 / 编译
↓
Lint
↓
包构建
↓
冒烟测试
↓
更广泛的测试套件
```

但不要机械执行全部检查。

验证应该与 Risk 对应。


## 不要过度测试

另一个极端是：

```text wrap
改 3 行代码
跑整个 monorepo 40 分钟测试
```

或者：

```text wrap
为了一个简单字段增加 9 个永久测试文件
```

推荐：

```text wrap
Calibrate verification to the size and risk of the change.

Prefer the smallest validation that meaningfully tests the changed behavior.

Run broader validation when:
- shared interfaces changed,
- dependencies changed,
- behavior crosses package boundaries,
- the change is high risk,
- or repository conventions require it.
```

中文翻译：

```text wrap
验证范围要与改动规模和风险相称。

优先选择能有效检验改动行为的最小验证。

出现以下情况时扩大验证范围：
- 共享接口改了；
- 依赖改了；
- 行为跨包；
- 改动风险较高；
- 或仓库约定如此。
```

测试代码也遵循 Scope Discipline：

```text wrap
Commit tests when:
- the repository normally tests this behavior,
- regression risk justifies it,
- or the task explicitly requires tests.

Temporary diagnostic scripts do not need to become permanent repository files.
```

中文翻译：

```text wrap
仅在以下情况提交测试：
- 仓库通常会为这类行为写测试；
- 回归风险足以支持这样做；
- 或任务明确要求测试。

临时诊断脚本不用提交为永久文件。
```


## 测试失败后不要立即放弃

常见失败模式：

```text wrap
go test ./...
↓
失败
↓
报告用户测试失败
↓
结束
```

但失败原因可能只是：

```text wrap
依赖没装
测试环境问题
命令错误
已有 unrelated failure
真正代码 Bug
```

推荐：

```text wrap
When validation fails, investigate the failure before concluding that the task is blocked.

Determine whether the failure is:
- caused by your change,
- pre-existing,
- environmental,
- dependency-related,
- flaky,
- or caused by an incorrect validation command.

Attempt reasonable recovery when possible.
```

中文翻译：

```text wrap
验证失败时，先查清原因，再判断任务是否受阻。

判断失败是：
- 你的改动导致；
- 原有问题；
- 环境问题；
- 依赖问题；
- 不稳定（flaky）；
- 或验证命令错误。

能恢复就先尝试合理的办法。
```

如果确实无法解决，再明确报告：

```text wrap
what failed
why
what was verified successfully
what remains unverified
```

中文翻译：

```text wrap
失败了什么
为什么失败
成功验证了什么
仍未验证什么
```


## 对快速变化的信息主动验证

Coding Agent 很容易出现：

```text wrap
我知道 Kubernetes
我知道 React
我知道 OpenAI API
所以不用查
```

但：

```text wrap
模型版本
SDK
CLI
云 API
Framework
产品行为
```

变化非常快。

推荐：

```text wrap
Recognition is not evidence of current behavior.

When the task depends on a fast-moving API, library, model, CLI, service, or platform, verify the relevant current behavior using available authoritative documentation.

For existing repositories, prefer the project's pinned version and local documentation over generic latest-version behavior.
```

中文翻译：

```text wrap
凭印象并不能证明当前行为。

当任务依赖变化迅速的 API、库、模型、CLI、服务或平台时，用可用的权威文档核实当前行为。

对于现有仓库，优先参考项目锁定的版本和本地文档，不要套用泛化的最新版行为。
```

特别是：

```text wrap
package-lock.json
go.mod
requirements.txt
pom.xml
build.gradle
Chart.yaml
Dockerfile
```

这些通常比模型记忆更重要。


## 区分 Current Documentation 和 Repository Version

假设：

```text wrap
repo 使用 Kubernetes 1.24
```

即使当前 Kubernetes 已经是更新版本，也不能直接按照最新版行为修改。

推荐：

```text wrap
For an existing codebase, determine the version actually used by the repository before applying current documentation.

Use latest documentation for current-state questions.

Use version-matched documentation for compatibility decisions.
```

中文翻译：

```text wrap
对于现有代码库，在应用当前文档之前，先确定仓库实际使用的版本。

当前状态问题使用最新文档。

兼容性决策使用与版本匹配的文档。
```


## 长会话要保留真正重要的上下文

长 Coding Session 最大的问题通常不是 Token 本身。

而是：

```text wrap
哪些信息必须继续存在？
```

需要保留的主要包括：

```text wrap
Goal
Constraints
Architecture decisions
User decisions
Rejected approaches
Compatibility requirements
Known blockers
Files changed
Validation results
Open work
Exact names / versions / commands
```

中文翻译：

```text wrap
目标
约束
架构决策
用户决策
被否决的方案
兼容性要求
已知阻塞
已修改文件
验证结果
未完成工作
确切名称 / 版本 / 命令
```

推荐的 Compaction 指令：

```text wrap
When compacting the working context, preserve:

1. the user's requested outcome;
2. explicit constraints and approval boundaries;
3. architectural and implementation decisions already made;
4. approaches tried and why they were rejected;
5. repository conventions discovered during the task;
6. files changed and important changes within them;
7. validation commands already run and their results;
8. unresolved failures or blockers;
9. exactly what remains to be completed;
10. exact identifiers that would be expensive to rediscover, including paths,
   symbols, versions, URLs, commands, configuration keys, and error messages.

Compress explanations aggressively, but do not compress away decisions or state.
```

中文翻译：

```text wrap
压缩工作上下文时，保留：

1. 用户请求的结果；
2. 明确的约束和批准边界；
3. 已经作出的架构和实现决策；
4. 尝试过的方案以及被拒绝的原因；
5. 任务期间发现的仓库约定；
6. 已修改的文件及其中的重要改动；
7. 已运行的验证命令及其结果；
8. 未解决的失败或阻塞；
9. 明确还没完成的内容；
10. 难以重新发现的确切标识符，包括路径、符号、版本、URL、命令、配置键和错误消息。

解释可以大幅压缩，但不能省略决策或状态。
```


## Persisted Reasoning 不是无限记忆

GPT-5.6 可以跨 Turn 保留 reasoning context。

但是：

```text wrap
previous reasoning
```

中文翻译：

```text wrap
之前的推理
```

只有在：

```text wrap
目标
假设
优先级
```

仍然有效时才有价值。

如果任务已经发生明显转向，例如：

```text wrap
原来准备重构
↓
用户决定完全换方案
```

旧 reasoning 反而可能形成负担。

原则：

```text wrap
Stable task → preserve reasoning context.

Materially changed task → allow fresh reasoning.
```

中文翻译：

```text wrap
任务稳定不变 → 保留推理上下文。

任务发生实质变化 → 允许重新推理。
```

不要把“保留上下文”等同于：

```text wrap
永远保留所有历史思考。
```


## Programmatic Tool Calling 适合有界的数据处理

GPT-5.6 的 Programmatic Tool Calling 很适合这种工作：

```text wrap
获取大量对象
↓
过滤
↓
去重
↓
排序
↓
聚合
↓
返回少量结果
```

例如：

```text wrap
搜索 500 个 GitHub Issues
↓
过滤 bug
↓
按 label 聚类
↓
返回最相关 20 个
```

不需要模型逐条思考 500 次。

适合：

```text wrap
filter
join
rank
deduplicate
aggregate
validate
transform
```

中文翻译：

```text wrap
过滤
连接
排序
去重
聚合
验证
转换
```

但不要什么都塞进去。

不适合：

```text wrap
每个结果都会改变下一步决策
需要用户授权
需要语义判断
需要保留原生 citation
只有一次简单调用
```

Prompt 应明确：

```text wrap
Use programmatic tool calling only for the bounded data-processing stage.

Return a compact structured result containing the evidence needed for the next reasoning step.

Keep semantic decisions, approval-sensitive actions, and final validation in the main agent loop.
```

中文翻译：

```text wrap
只在限定的数据处理阶段使用程序化工具调用。

返回紧凑的结构化结果，带上下一步推理所需的证据。

语义决策、需审批的操作和最终验证，都留在主 Agent 循环中。
```


## Multi-Agent 只在任务真正可以拆分时使用

不要为了：

```text wrap
“用了 Multi-Agent”
```

而拆任务。

好的拆分：

```text wrap
Agent A → backend
Agent B → frontend
Agent C → tests
Agent D → documentation / API review
```

中文翻译：

```text wrap
Agent A → 后端
Agent B → 前端
Agent C → 测试
Agent D → 文档 / API 审查
```

前提：

```text wrap
工作相对独立
```

不好的拆分：

```text wrap
Agent A 读第一段函数
Agent B 读第二段函数
Agent C 猜整体设计
```

这只会增加 Coordination Cost。

推荐：

```text wrap
Delegate work when independent workstreams can proceed concurrently and the expected benefit exceeds coordination cost.

Good delegation units should have:
- a clear objective,
- clear boundaries,
- defined inputs,
- and a concrete output.

Do not delegate tiny sequential steps that depend heavily on one another.
```

中文翻译：

```text wrap
当相互独立的工作流可以并发推进，且预期收益超过协调成本时，再委派工作。

适合委派的工作流应有：
- 明确的目标；
- 清晰的边界；
- 明确的输入；
- 以及具体的输出。

不要把彼此高度依赖的小步骤拆开委派。
```


## Root Agent 不应该只是等 Subagent

如果已经委派：

```text wrap
Agent A → 查 API
Agent B → 分析测试
```

Root Agent 可以同时：

```text wrap
读核心代码
分析架构
准备修改
```

而不是：

```text wrap
spawn
↓
wait
↓
wait
↓
wait
```

中文翻译：

```text wrap
启动
↓
等待
↓
等待
↓
等待
```

推荐：

```text wrap
After delegating independent work, continue any root-agent work that does not depend on those results.

Wait only when the next useful action genuinely requires a subagent's output.
```

中文翻译：

```text wrap
委派独立工作后，继续做 Root Agent 中不依赖这些结果的工作。

只有下一步确实需要 Subagent 输出时才等待。
```


## Subagent 的输出应该是 Evidence，不只是 Opinion

不要只让 Subagent 回：

```text wrap
Looks good.
```

中文翻译：

```text wrap
看起来没问题。
```

应该要求：

```text wrap
Findings
Evidence
Affected files
Suggested action
Confidence / unresolved questions
```

中文翻译：

```text wrap
发现
证据
受影响的文件
建议操作
置信度 / 未解决问题
```

例如：

```text wrap
Inspect the authentication flow.

Return:
- relevant entry points,
- token validation path,
- identified risks,
- exact files/symbols supporting each finding,
- and any uncertainty.

Do not modify files.
```

中文翻译：

```text wrap
检查认证流程。

返回：
- 相关入口；
- Token 校验路径；
- 发现的风险；
- 支持每项发现的确切文件/符号；
- 以及任何不确定性。

不要修改文件。
```

这样 Root Agent 才容易整合结果。


## 前端任务必须 Render 后验证

生成前端代码：

```text wrap
compile success
```

中文翻译：

```text wrap
编译通过
```

不代表：

```text wrap
UI success
```

中文翻译：

```text wrap
UI 通过
```

前端尤其需要：

```text wrap
implement
↓
render
↓
inspect
↓
fix
```

中文翻译：

```text wrap
实现
↓
渲染
↓
检查
↓
修复
```

推荐：

```text wrap
For frontend or visual work, do not treat successful compilation as sufficient verification.

When rendering or browser tools are available:
- render the affected screen,
- inspect the result visually,
- check layout hierarchy,
- overflow,
- responsiveness,
- alignment,
- empty/loading/error states,
- and obvious visual regressions.

Iterate when the rendered result does not match the intended experience.
```

中文翻译：

```text wrap
对于前端或视觉工作，不要把编译通过视为充分验证。

当有渲染或浏览器工具可用时：
- 渲染受影响的页面；
- 以视觉方式检查结果；
- 检查布局层次；
- 溢出；
- 响应式表现；
- 对齐；
- 空状态/加载状态/错误状态；
- 以及明显的视觉回归。

如果渲染结果与预期体验不符，就继续迭代。
```


## 不要为了长输出重复起草整个交付物

在高 reasoning effort 下，避免这样的隐性模式：

```text wrap
完整写一遍
↓
再完整输出一遍
```

应该：

```text wrap
reason about structure
reason about difficult decisions
verify inputs
↓
write final deliverable once
```

中文翻译：

```text wrap
梳理结构
处理难题
核对输入
↓
只写一次最终交付物
```

推荐：

```text wrap
For long deliverables, use reasoning to settle structure, resolve ambiguity, inspect evidence, and make difficult decisions.

Do not fully draft the same deliverable multiple times before producing the final output.
```

中文翻译：

```text wrap
面对较长的交付物，用推理确定结构、消除歧义、核对证据并处理难点。

在输出最终结果前，不要多次完整起草同一份交付物。
```


## 安全与高风险操作要基于证据，而不是模式匹配

运维和编码任务尤其容易出现：

```text wrap
看到错误 A
↓
想起以前 A 一般重启解决
↓
直接重启
```

这是危险的 Agent 行为。

推荐：

```text wrap
Before performing a destructive, irreversible, production-impacting, or externally visible action, verify that the available evidence supports that specific action.

Do not execute a high-impact action solely because the symptoms resemble a familiar failure pattern.
```

中文翻译：

```text wrap
在执行破坏性、不可逆、影响生产或对外可见的操作前，确认现有证据支持这项具体操作。

不要只因为症状看起来像某个熟悉的故障模式，就执行高影响操作。
```

特别包括：

```text wrap
rm
DROP
kubectl delete
restart production
migration rollback
force push
merge
deploy
publish
credential rotation
```


## 最终回复要能够独立阅读

用户不应该必须翻看所有 Tool Logs 才知道 Agent 做了什么。

好的 Final Delivery 应至少回答：

```text wrap
做了什么？
为什么这样做？
改了什么？
验证了吗？
结果是什么？
还有什么没完成？
```

推荐：

```text wrap
The final response should stand on its own.

For implementation tasks, include:
- the outcome,
- the meaningful changes,
- important implementation decisions when relevant,
- validation performed and its result,
- and any remaining limitation or blocker.

Do not dump routine tool activity.

Do not claim validation that was not actually performed.
```

中文翻译：

```text wrap
最终回复应能独立读懂。

实施类任务的回复应包括：
- 完成的结果；
- 有意义的改动；
- 必要时说明重要的实现决策；
- 已执行的验证及其结果；
- 以及剩余的限制或阻塞。

不要堆砌例行工具记录。

不要声称做过没有实际执行的验证。
```


## 推荐的 Codex / GPT-5.6 Core Prompt

如果只想保留一份短的全局 Prompt，我更推荐下面这种。

```text wrap
# Working contract

Infer the user's intended outcome from their request and the surrounding context.

For requests to explain, inspect, review, diagnose, compare, or plan, inspect the
relevant materials and report the result. Do not modify files unless implementation
was requested.

For requests to implement, change, build, migrate, or fix, carry the requested
in-scope work through to completion. Make necessary reversible local changes and
run appropriate non-destructive validation without asking for permission again.

Resolve routine ambiguity from repository context and established conventions.
Ask only when different reasonable interpretations would materially change the
result, compatibility, data, security, production impact, or architecture.

Keep changes proportional to the requested outcome. Do not fix unrelated bugs,
perform opportunistic refactors, or add adjacent features unless the requested
behavior cannot work without them. Report important unrelated findings separately.

Treat the repository as part of the specification. Inspect enough surrounding code,
tests, configuration, and documentation to understand existing patterns before
making non-trivial changes. Prefer established repository conventions over new
abstractions without a clear need.

Prefer targeted edits over whole-file rewrites when they produce the same result.
Preserve unrelated formatting, comments, naming, ordering, and structure.

Use tools to establish facts rather than guessing. Fetch independent repository
information concurrently when practical, and do not repeat completed searches or
reads without a reason.

When information depends on a fast-moving API, library, model, service, or platform,
verify current behavior using authoritative sources. For existing repositories,
prefer the version actually pinned by the project when making compatibility decisions.

After changing code, run the smallest meaningful validation that tests the affected
behavior, expanding validation according to the size and risk of the change.
Investigate failures and retry reasonable recoveries before declaring the task blocked.

For longer tasks, provide brief progress updates only at meaningful milestones or
when a discovery changes the approach. Do not narrate routine tool calls.

Do not stop after identifying the cause, proposing a fix, editing the code, or
running only part of the available validation when the user's requested outcome
still requires more work. If the next necessary step is already authorized, safe,
and possible with available tools, do it instead of announcing it.

Require confirmation before destructive or irreversible operations, production or
external writes that were not already authorized, purchases, publication/deployment,
or a material expansion of scope.

Before finishing, compare the result against the original request.

The final response must clearly state:
- what was accomplished,
- the meaningful changes or findings,
- what validation was actually performed,
- and any remaining blocker, assumption, or limitation.

Do not claim work or validation that was not performed.
```

中文翻译：

```text wrap
# 工作约定

根据用户请求和上下文，判断要达成的结果。

对于解释、检查、审查、诊断、比较或制定计划的请求，查看相关材料并报告结果。除非用户要求实施，否则不要改文件。

对于实施、修改、构建、迁移或修复的请求，将请求范围内的工作持续做到完成。无需再次征求许可，完成范围内必要的可逆本地改动，并运行适当的非破坏性验证。

根据仓库上下文和既有约定解决一般歧义。只有当不同的合理理解会明显改变结果、兼容性、数据、安全性、生产影响或架构时才提问。

改动规模应与请求的结果相称。除非请求的行为无法在没有它们的情况下正常工作，否则不要修复无关 Bug、顺手重构或添加相邻功能。将重要的无关发现单独报告。

将仓库视为需求规范的一部分。在进行非平凡改动前，检查足够多的周边代码、测试、配置和文档，以了解现有模式。没有明确需求时，优先遵循仓库既有约定，而不是引入新的抽象。

如果能得到相同结果，优先采用定向修改而不是重写整个文件。保留无关的格式、注释、命名、顺序和结构。

用工具确认事实，不要靠猜测。可行时并行获取彼此独立的仓库信息；没有理由时，不要重复已经完成的搜索或读取。

当信息依赖变化迅速的 API、库、模型、服务或平台时，用权威来源核实当前行为。对于现有仓库，在做兼容性决策时，优先参考项目实际锁定的版本。

修改代码后，运行能有效检验受影响行为的最小验证，并根据改动规模和风险扩大验证范围。先查明失败原因，并在判断任务受阻前尝试合理恢复。

对于较长任务，仅在有意义的里程碑或发现改变方案时提供简短进度更新。不要叙述例行工具调用。

当用户请求的结果仍需更多工作时，不要在找到原因、提出修复方案、编辑代码或只运行了部分可用验证后停止。如果下一步已经获得授权、安全且可用现有工具完成，就直接执行，而不是宣布它。

在破坏性或不可逆操作、生产环境操作、尚未获授权的外部写入、购买、发布/部署或明显扩大范围前，需要获得确认。

结束前，将结果与原始请求进行对照。

最终回复必须清楚说明：
- 完成了什么；
- 有意义的改动或发现；
- 实际执行了哪些验证；
- 以及任何剩余阻塞、假设或限制。

不要声称完成了未做的工作或执行了未进行的验证。
```


## 推荐的 Task Prompt 结构

Core Prompt 不应该包含每个任务的具体信息。

具体任务建议使用：

```text wrap
## Goal

What outcome should exist when this task is finished?

## Context

Relevant files, components, documentation, examples, incidents, or prior decisions.

## Constraints

What must remain true?
What must not change?

## Approval boundaries

Anything the agent must not execute automatically.

## Done when

Observable acceptance criteria.

## Verification

Specific evidence required before the task is considered complete.
```

中文翻译：

```text wrap
## 目标

任务完成后应当达到什么结果？

## 上下文

相关文件、组件、文档、示例、事件或既有决策。

## 约束

哪些内容必须保持不变？
哪些内容不得改变？

## 批准边界

Agent 不应自动执行的操作。

## 完成条件

可观察的验收标准。

## 验证

判定完成前需要的具体证据。
```

例如：

```text wrap
## Goal

Replace the existing libpcap traffic collector with a conntrack-based collector.

## Context

The current implementation lives on the main branch.
Create the work on a new `conntrack` branch.

Relevant repository:
network-traffic-ebpf-exporter

## Constraints

- Preserve the existing Prometheus metric names where practical.
- Do not change the existing main-branch pcap implementation.
- Do not introduce eBPF as a dependency.
- Target the project's existing supported Linux environment.

## Done when

- conntrack traffic can be collected continuously;
- source/destination IP and direction remain available;
- metrics are exposed through the existing HTTP endpoint;
- shutdown works cleanly;
- existing relevant validation passes.

## Verification

Run focused tests/build checks and document any behavior that cannot be verified
inside the local environment.
```

中文翻译：

```text wrap
## 目标

把现有的 libpcap 流量采集器换成基于 conntrack 的采集器。

## 上下文

当前实现仍在 main 分支。
在新的 `conntrack` 分支上开展工作。

相关仓库：
network-traffic-ebpf-exporter

## 约束

- 能保留现有 Prometheus 指标名称就保留。
- 不要修改现有 main 分支上的 pcap 实现。
- 不要引入 eBPF 依赖。
- 目标环境是项目当前支持的 Linux。

## 完成条件

- 持续采集 conntrack 流量；
- 仍能提供源/目标 IP 和方向信息；
- 通过现有 HTTP 端点暴露指标；
- 可以正常关闭；
- 现有相关验证通过。

## 验证

运行定向测试和构建检查，并记录本地无法验证的行为。
```

这种 Task Prompt 比：

```text wrap
先看 main.go
然后开分支
然后写 struct
然后写 parser
然后……
```

更适合 GPT-5.6。


## 最终设计原则

Codex / GPT-5.6 Prompt 的核心不是：

```text wrap
告诉模型更多步骤。
```

而是：

```text wrap
给模型更清晰的工作合同。
```

可以把整个 Prompt Architecture 简化成：

```text wrap
                 User Goal
                     │
                     ▼
               Task Contract
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
   Constraints   Done When      Boundaries
       │             │             │
       └─────────────┼─────────────┘
                     ▼
                 AGENTS.md
                     │
                     ▼
              Repository Map
                     │
                     ▼
                  Agent
                     │
           ┌─────────┴─────────┐
           ▼                   ▼
        Explore              Reason
           │                   │
           └─────────┬─────────┘
                     ▼
                   Edit
                     │
                     ▼
                  Verify
                     │
                     ▼
             Compare With Goal
                     │
                     ▼
                 Deliver
```

中文翻译：

```text wrap
                 用户目标
                     │
                     ▼
                 任务契约
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
     约束       完成条件       边界
       │             │             │
       └─────────────┼─────────────┘
                     ▼
                 AGENTS.md
                     │
                     ▼
                  仓库地图
                     │
                     ▼
                    Agent
                     │
           ┌─────────┴─────────┐
           ▼                   ▼
         探索                 推理
           │                   │
           └─────────┬─────────┘
                     ▼
                    编辑
                     │
                     ▼
                   验证
                     │
                     ▼
                 对照目标
                     │
                     ▼
                    交付
```

一句话总结：

**Tell Codex what success means, give it the boundaries and evidence it needs, and let the agent determine the path.**
