---
title: 为 DeepSeek V4 编写提示
url: https://api-docs.deepseek.com/
description: DeepSeek V4 在 Agentic Coding 环境中的提示工程、思考模式、工具调用、上下文缓存、验证和接入实践。
---

> 面向运行在 DeepSeek Harness、Claude Code（DeepSeek 接入）、Codex、Cline、OpenCode 或其他 Agentic Coding 环境中的 DeepSeek V4。
>
> 本文中的 “DeepSeek V4” 指 DeepSeek V4 系列模型（V4-Pro / V4-Flash）运行在上述编码智能体环境中的组合。文中与模型和 API 相关的事实来自 DeepSeek 官方文档与官方发布信息，文末附参考链接。

DeepSeek V4 系列包含 `deepseek-v4-pro`（V4-Pro-0813）与 `deepseek-v4-flash`（V4-Flash-0731）两档，外加一个实验性的视觉模型 `deepseek-v4-flash-vision-exp`。两者共享同一套核心能力：**1M token 上下文、最大 384K 输出、支持思维链（thinking）与普通（non-thinking）两种模式**，思维模式默认开启、默认思考档位为 `high`。模型支持 Function Calling、JSON Output、Responses API 与 Anthropic API，并通过 OpenAI / Anthropic 双协议接入 Claude Code、Codex、OpenCode 等编码工具；官方同时发布了面向编码智能体的 DeepSeek Harness（开发者预览）。

V4 的训练重心是长程编码与 Agent 任务，并且它通过 `reasoning_effort`（`low` / `high` / `max`）控制思考深度，思考内容通过 `reasoning_content` 字段返回。对编码智能体，提示的重点应该逐渐从：

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

**Prompt 更应该成为 Agent 的工作合同。**


如果你观察到以下现象，可以从对应章节开始调整。

* 简单任务又慢又贵：`reasoning_effort` 是否过高（第 1 节）
* 想关闭思考却不知道怎么关：用 `thinking.type: "disabled"`，或 Anthropic 格式的 `reasoning.effort: "none"`（第 1 节）
* 传 `temperature` / `top_p` 没效果：思考模式下这些参数被忽略（第 4 节）
* 工具循环里报 400 错误：`reasoning_content` 未完整回传（第 3 节）
* 回复被截断，长交付物等待极久：`max_tokens` 要同时覆盖思考与输出，上限 384K（第 2 节）
* 缓存命中率低、长会话成本高：前缀是否被编辑破坏（第 3、5 节）
* System Prompt 越写越长：精简 Prompt（第 7 节）
* 工具轮次之间长时间沉默：进度更新（第 10 节）
* 一轮只发一个工具调用：批量执行独立调用（第 11 节）
* Agent 反复读取同一个文件：工具纪律（第 12 节）
* 用户只是提问，模型却改了代码：分析与修改的边界（第 13 节）
* 做到一半停下问“要继续吗？”：完成整个任务（第 14 节）
* 每执行一步都请求确认：批准边界（第 16 节）
* 项目规则在每次提示里重复：项目记忆文件（第 8 节）
* 压缩后忘记原始约束：规则落盘 + 压缩保留（第 8、23 节）
* 需求 30 行，Diff 800 行：范围纪律（第 18 节）
* 修改一个函数却重写整个文件：定向编辑（第 20 节）
* 改完不验证，或为 3 行改动跑全量测试：验证力度（第 21 节）
* 测试失败立刻宣告任务受阻：失败调查（第 21 节）
* 查当前 API 却凭模型记忆回答：时效查证（第 22 节）
* 子智能体开了但没真正并行：子智能体（第 24 节）
* 最终回复只有“完成”：最终交付（第 26 节）
* Claude Code 接入异常：接入配置（附录）


## 思考模式与推理深度

DeepSeek V4 支持两种模式：**思考（thinking）** 与 **普通（non-thinking）**。思考模式默认开启，默认思考档位为 `high`。

思考模式的开关由 `thinking` 参数控制（OpenAI 格式）：

```text wrap
{"thinking": {"type": "enabled"}}   开启思考（默认）
{"thinking": {"type": "disabled"}}  关闭思考
```

Anthropic 格式下，开关与档位合并进 `reasoning` 字段：

```text wrap
{"reasoning": {"effort": "none"}}   关闭思考
{"reasoning": {"effort": "low"}}    轻量思考
{"reasoning": {"effort": "high"}}   增强思考
{"reasoning": {"effort": "max"}}    深度思考
```

思考深度由顶层 `reasoning_effort` 控制，取值 `low` / `high` / `max`：

```text wrap
low   轻量思考
high  增强思考（默认）
max   深度思考
```

一个实用起点（官方未给出任务分级，以下是建议起点，请用自己的评测校准）：

```text wrap
max   复杂编码、架构调整、难复现 Bug、多组件交互、迁移、长程 Agent 任务
high  常规 Feature、多文件修改、日常 Debug、API 集成
low   简单配置修改、文档、格式调整、小范围 CRUD、高吞吐批量任务
```

两条 V4 特有的纪律：

* **`reasoning_effort` 到模型实际思考量的映射并不线性**。官方映射表显示，你传 `medium`、`xhigh` 会被折叠到 `high`；只有 `low`、`high`、`max` 三档真正生效（`flash` 与 `pro` 映射一致）。想“多一点思考”就上 `max`，不要指望 `medium` 和 `xhigh` 有区别。
* **思考开关与档位在请求级设置，不要写到 Prompt 里**。思考深度是请求参数，不是形容词——不要在系统提示里堆“Think step by step”。

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

Prompt 更应该描述：

```text wrap
目标
约束
成功标准
必须验证的证据
```


## 为思考和长输出留出空间

DeepSeek V4 的上下文长度为 1M，**最大输出为 384K**。思考模式的 `reasoning_content` 与正文 `content` 共享这份输出额度——思考消耗的令牌多了，留给正文就少了。在 `max` 档位下处理长篇交付物（整文件重写、多章节文档、大型数据集）时，模型可能在思考中起草大部分内容，再作为回复誊写一遍——本轮长度翻倍，却不会改善结果。将以下说明追加到请求末尾（把 `[max_tokens]` 替换为实际值）：

```text wrap
Everything produced in one reply, including any reasoning or drafting done before the reply, counts toward a single limit of about [max_tokens] tokens. If that limit is reached before the reply is finished, the person receives a cut-off response and has to start over. Composing an entire deliverable in full as reasoning and then again as a reply doubles the length of the turn without improving the result, so don't do that. Use the reasoning space to settle structure and difficult decisions, and write the deliverable once.
```

中文翻译：

```text wrap
单次回复产生的所有内容，包括回复前的推理或草稿，都计入约 [max_tokens] 个令牌的同一上限。若回复尚未完成就达到上限，用户会收到截断内容，只能重新开始。先在推理中完整写交付物、再在回复中重写一遍，只会让本轮变长，却不会改善结果，因此不要这样做。

相反，用户要求长篇或高强度交付物（如多章节文档、大型表格或数据集、完整代码文件）时，应把额外精力用来理解请求、核对输入、确定结构和处理难点，用推理空间思考，用输出空间写结果。通常不必多次起草同一份交付物。
```


## 工具循环：reasoning_content 与历史仅追加

这是 DeepSeek V4 与 harness 集成最关键的一条。`reasoning_content` 的回传规则**取决于请求是否携带 `tools` 参数**：

* **携带 `tools` 参数的请求（编码智能体几乎都是这种）**：必须把每一轮的 `reasoning_content` **完整回传**给 API，即使某一轮模型没有执行工具调用也必须回传。**不回传或回传不完整，API 会直接返回 400 错误。**
* **不携带 `tools` 参数的请求**：`reasoning_content` 不需要回传；即使传了也会被忽略、不会拼进上下文。

也就是说，在工具循环里，正确姿势是把 API 返回的**完整 assistant 消息**原样追加到 `messages`，包括 `content`、`reasoning_content` 和 `tool_calls`：

```python
# 直接追加整个 message 即可，它包含所有必要字段
messages.append(response.choices[0].message)
```

等价于：

```python
messages.append({
    'role': 'assistant',
    'content': response.choices[0].message.content,
    'reasoning_content': response.choices[0].message.reasoning_content,
    'tool_calls': response.choices[0].message.tool_calls,
})
```

三条配套纪律：

* **仅追加、不修改**。不要在请求之间编辑较早的轮次——不要删除、重写、就地摘要 `reasoning_content`。任何对历史前缀的编辑都会破坏上下文缓存（第 5 节）。
* **每个 `tool_call` 都要有对应的 `role: "tool"` 消息**，且 `tool_call_id` 精确匹配；流式场景下 `tool_calls` 分片要正确拼装。这是工具循环能跑通的基本盘。
* **换模型就开新会话**。不要在会话中途把一个进行中的会话从别的模型切到 V4（也不要从 V4 切走），思考历史格式对不上会导致行为异常。

harness 自查清单：`finish_reason=tool_calls` 时，完整 assistant 消息（含 `reasoning_content`）是否原样放回 `messages`？如果某轮工具循环里漏了 `reasoning_content`，下一个请求就会 400——这是接入 V4 最常见的坑。


## 采样参数

DeepSeek V4 的**思考模式不支持** `temperature`、`top_p`、`presence_penalty`、`frequency_penalty` 这些采样参数。官方文档特别说明：为兼容现有软件，**设置这些参数不会报错，但也不会产生任何效果**。

两个推论：

* **不要靠调采样参数来改变行为**。想要输出更多样或更保守，通过 Prompt 表达（“给出 3 个风格不同的方案”“只输出最稳妥的一种做法”），而不是去调 `temperature`。
* **从其他平台迁移代码时，删掉遗留的采样参数**。它们不报错，但会给你一种“已经调过”的错觉——实际上没生效。

需要注意：在 Anthropic API 格式下，`temperature`（范围 `[0.0, 2.0]`）和 `top_p` 是被支持的；而 OpenAI 格式的思考模式下这些参数被忽略。接入时确认你走的是哪套协议。


## 上下文缓存与长会话经济性

DeepSeek API 的磁盘上下文缓存**默认开启，无需改代码**。每个请求都会触发一次缓存构建；后续请求若与前序请求存在前缀重叠，重叠部分直接从缓存读取，计为“缓存命中”。

**命中价格与未命中价格相差一个数量级**（以 `deepseek-v4-flash` 非高峰为例）：

```text wrap
输入（缓存命中）  $0.007 / MTok
输入（缓存未命中）$0.22  / MTok
```

`deepseek-v4-pro` 对应为 $0.022 vs $0.66（非高峰）。缓存命中率高低直接决定长会话成本，因此**保持前缀稳定是真金白银**。

命中规则基于 Sliding Window Attention，每个缓存前缀是一个独立的完整单元，后续请求必须**完整匹配**某个缓存前缀单元才能命中：

* 在请求边界（用户输入末尾、模型输出末尾）持久化两个缓存前缀单元。
* 系统检测到多个请求的公共前缀时，会把该公共前缀持久化为独立单元。
* 长输入/长输出会按固定 token 间隔切分缓存单元，避免长前缀永远无法命中。

响应里有两个字段反映命中情况：`prompt_cache_hit_tokens`（命中的输入 token 数）和 `prompt_cache_miss_tokens`（未命中的 token 数）。

对提示词设计的实际含义：

* **编辑较早轮次会破坏缓存**。第 3 节说的“历史仅追加”不只是正确性问题，也是经济性问题——就地改写历史、中途改系统提示都会让后续前缀无法命中。
* **把稳定内容放前面，易变内容放后面**。系统提示、`AGENTS.md` 等长期不变的前缀放在最前，每次都在末尾追加新内容，命中率自然高。
* 缓存是“尽力而为”，不保证 100% 命中；缓存构建需要数秒，不再使用后通常在几小时到几天内自动清除。


## Outcome First，而不是 Process First

DeepSeek V4 更适合 Outcome-Oriented Prompt。不要过早规定执行路径：

```text wrap
1. Read main.go.
2. Read config.go.
3. Search for references.
4. Inspect tests.
5. Modify config.go.
```

中文翻译：

```text wrap
1. 阅读 main.go。
2. 阅读 config.go。
3. 搜索引用位置。
4. 检查测试。
5. 修改 config.go。
```

这种提示会把模型锁死在你预想的路径里。更好的方式：

```text wrap
Goal:
Add CIDR support to src and dst rules without changing existing exact-IP behavior.

Constraints:
- Preserve backward compatibility.
- Reuse existing configuration structures where practical.

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

完成条件：
- 现有精确 IP 规则仍能正常工作。
- CIDR 规则能正确匹配。
- 现有仓库的验证通过。
```

让模型自己决定读哪些文件、搜索哪些 Symbol、改哪些代码、跑哪些验证。Prompt 负责：

```text wrap
WHAT（内容）
WHY（原因）
BOUNDARY（边界）
DONE（完成条件）
```

Agent 负责：

```text wrap
HOW（如何执行）
```


## Prompt 要尽量精简：每条规则只写一次

强大的模型不需要巨大的 System Prompt 才能正确工作。重复规则会导致规则互相覆盖、Agent 行为漂移、上下文浪费。核心原则：

```text wrap
State each important rule once.
```

中文翻译：

```text wrap
每条重要规则只写一遍。
```

例如不要同时写：

```text wrap
Do not modify unrelated code.
Stay within scope.
Do not make unnecessary changes.
Only modify files relevant to the task.
Do not perform unrelated refactors.
```

中文翻译：

```text wrap
不要修改无关代码。
不要超出任务范围。
不要做不必要的改动。
只修改与任务相关的文件。
不要顺手重构无关部分。
```

这些是同一条规则的五种写法。一条即可：

```text wrap
Keep changes limited to what is required for the user's requested outcome.
Report unrelated issues separately instead of fixing them.
```

中文翻译：

```text wrap
改动只做到实现用户要求为止。
发现无关问题时单独报告，不要顺手修复。
```


## 长期规则放进项目文件，临时指令放进对话

一条简明的设计原则：

```text wrap
Put temporary instructions in the prompt, and put long-lived rules in project-level configuration files.
```

中文翻译：

```text wrap
临时指令写在提示中，长期规则写进项目级配置文件。
```

无论你的 harness 用 `AGENTS.md`、`CLAUDE.md` 还是 rules 目录实现，思路都一样：项目文件是地图，不是百科全书。根级文件只写：

```text wrap
仓库结构
重要不变量
标准验证命令
更深入文档的位置
全局禁止事项与行为边界
```

示例：

```text wrap
# Repository map

Backend services live under `services/`.
Shared packages live under `pkg/`.
Architecture decisions are documented in `docs/architecture/`.

Before changing a service, read the nearest service-level AGENTS.md if present.

Run targeted tests for the affected package before broader validation.
```

中文翻译：

```text wrap
# 仓库地图

后端服务在 `services/` 下。
共享包在 `pkg/` 下。
架构决策写在 `docs/architecture/` 中。

修改服务前，如果存在最近的服务级 `AGENTS.md`，请先阅读它。

先为受影响的包跑定向测试，再做更广泛的验证。
```

三条配套经验：

* **规则要具体可执行**：写“新 TypeScript 文件使用 2 空格缩进”“修改业务逻辑后运行 `pnpm test`”，而不是“保持代码整洁”。规则越具体，行为越稳定。
* **主文件控制在 200 行以内**，专题规则拆成独立文件，按路径加载——能按需加载的规则不要全局加载。
* **只有写进文件的规则能在压缩后存活**。长对话压缩后，记忆文件会从磁盘重新加载；只存在于对话中的约束会消失。重要约束必须落盘。


## 中文直接写，术语保持原文

DeepSeek 系列以中英双语训练，中文任务直接用中文写提示即可，不需要先译成英文再发给模型；中文表述的约束与英文同等有效。“英文提示更精确”的旧习惯只会带来翻译损耗——尤其是约束和完成条件这类精确表述。

两条配套规则值得写进系统提示。其一，输出语言跟随用户：

```text wrap
Reply in the language the user writes in. Keep code identifiers, file paths, commands, tool names, and error messages exactly as they appear — never translate them.
```

中文翻译：

```text wrap
用用户的语言回复。代码标识符、文件路径、命令、工具名和错误信息保持原样，不要翻译。
```

其二，如果用户要求中文输出，直接说明希望的文风比堆叠形容词更有效：

```text wrap
中文输出时使用自然的中文技术写作风格：直接陈述，不用翻译腔；术语首次出现时可附英文原文，之后直接用中文。
```


## 要求有意义的进度更新

DeepSeek V4 的工作过程大多发生在思考块里，而多数 harness 默认折叠思考——用户看到的是智能体一次沉默数分钟，然后突然“完成”。两个层面解决：

其一，harness 层面：把非空的思考/状态内容渲染成一行摘要，而不是全部隐藏。

其二，prompt 层面：规定何时输出面向用户的文本。不要走向工具旁白的极端（“正在读取文件。正在搜索。”）。推荐：

```text wrap
For longer tasks, give brief user-facing progress updates when starting a major phase, discovering something that materially changes the approach, finding an important blocker, or completing a meaningful milestone. Do not narrate routine tool calls. Each update should communicate a concrete result or decision, not merely the next command you intend to run.
```

中文翻译：

```text wrap
较长任务中，在以下时机向用户简短更新进度：开始一个主要工作阶段、发现会明显改变方案的信息、找到重要阻塞、完成有意义的里程碑。不要叙述例行工具调用。每次更新都应传达具体结果或决策，而不只是你打算运行的下一条命令。
```

并要求收尾总结可以独立阅读：

```text wrap
Close with a short recap that stands on its own — what you found, what you did, and what's next — so a reader who only sees the last message has the full picture.
```

中文翻译：

```text wrap
最后用一段简短、单独看也完整的总结收尾：说清你发现了什么、做了什么、下一步是什么，让只看到最后一条消息的人也能了解全貌。
```


## 批量执行独立的工具调用

当请求指明了要获取的多项内容时，模型通常会并行发出调用；但在编码循环中，接下来的独立调用往往由任务隐含而非明确请求（读几个相关文件、搜索加读日志），此时模型可能每轮只发一个。这不影响质量，但每多一轮都消耗令牌、一次往返和实际耗时。在请求末尾加一句提醒：

```text wrap
First privately list what you need next; then request every item that doesn't depend on another's result in this one response.
```

中文翻译：

```text wrap
先在内部列出下一步需要的内容，再在这一轮一次请求所有彼此独立的项目。
```

注意边界：`search symbol → 发现实现文件 → read implementation` 是有依赖关系的链，不应强行并行。判断标准始终是“后一项是否真的依赖前一项的结果”。


## 不要重复已完成的工具工作

长 Agent Loop 中很容易出现十分钟后再 grep 同一个关键词、再读同一个文件。为当前任务加入：

```text wrap
Treat previous tool results in the current task as working evidence. Do not repeat a search, file read, test, or command unless the state may have changed, the previous result was incomplete, you need a different range or representation, or verification after modification requires rerunning it.
```

中文翻译：

```text wrap
把当前任务中已经得到的工具结果当作工作依据。除非底层状态可能已变化、之前的结果不完整、你需要不同的范围或呈现形式，或修改后需要重新验证，否则不要重复搜索、读取文件、运行测试或执行命令。
```

在大型仓库、MCP 工具、远程 API 和昂贵工具场景下，这条规则尤其重要。1M 上下文不是重复劳动的理由——重复读相同前缀虽然不心疼缓存，但重复的工具往返是实打实的延迟。


## 明确分析与修改的边界

用户说“帮我看看这个设计有没有问题”，通常是要分析，不是要直接改代码；反过来，“帮我把这个 Bug 修掉”显然授权了修改加验证。这是最关键的意图边界：

```text wrap
For requests to explain, review, inspect, diagnose, compare, or plan: inspect the relevant materials and report the result. Do not modify files unless implementation was requested.

For requests to implement, change, build, migrate, or fix: make the required in-scope local changes and run appropriate non-destructive validation without asking for permission again.
```

中文翻译：

```text wrap
对于解释、审查、检查、诊断、比较或制定计划的请求：查看相关材料并报告结果。除非用户要求实施，否则不要改文件。

对于实施、修改、构建、迁移或修复的请求：完成范围内必要的本地改动，并运行适当的非破坏性验证，不必再次征求许可。
```


## 完成整个任务

DeepSeek V4 的长程能力只有在提示不让它半途停止时才能发挥。典型未完成形态：描述下一步然后结束（“接下来我将更新测试。”），或者停下来为原始请求已经涵盖的步骤征求许可（“找到原因了，要我修复吗？”）。推荐：

```text wrap
When the user requests implementation or a fix, carry the task through to completion. Do not stop after identifying the cause, proposing the implementation, editing the code, or running only part of the available validation. If the next necessary step is already authorized and possible with available tools, do it instead of announcing it. End the turn only when the requested outcome is complete, a genuine blocker requires input only the user can provide, or the next action crosses an approval boundary.
```

中文翻译：

```text wrap
用户要求实施或修复时，要把任务做完。不要在找到原因、提出实现方案、编辑代码或只运行了部分验证后停止。如果下一步必要操作已经获得授权且可用现有工具完成，就直接执行，而不是宣布它。仅在请求的结果已完成、确实被只有用户能提供的输入阻塞，或下一步操作越过批准边界时才结束本轮。
```

最后加一句收尾检查非常有效：

```text wrap
Before ending, check whether your final paragraph describes work you still intend to do. If it does, and that work is already authorized and possible with the available tools, do it now.
```

中文翻译：

```text wrap
结束前，检查最后一段是否还在说你打算完成什么。如果是，而且这项工作已获授权、可以用现有工具完成，就现在去做。
```

注意与第 13 节配合：用户在描述问题或提问时，交付物是评估本身——报告发现并停止，不要未经要求就实施修复。


## 常规歧义自行决断，实质性歧义才提问

自主不等于永远不能提问。区分两类歧义：

```text wrap
routine ambiguity（常规歧义）：文件叫什么、函数叫什么、测试放哪里——从仓库可推断。
material ambiguity（实质性歧义）：删除旧 API 还是保持兼容？Migration 能否停机？——不同答案导致完全不同的结果。
```

推荐：

```text wrap
Resolve routine ambiguity from repository context and established conventions. Ask only when different reasonable interpretations would materially change user-visible behavior, compatibility, data, security, production impact, architecture, or the requested deliverable.
```

中文翻译：

```text wrap
根据仓库上下文和既有约定解决一般歧义。只有当不同的合理理解会明显改变用户看到的行为、兼容性、数据、安全性、生产影响、架构或交付物时才提问。
```


## 批准边界要窄且明确

如果提示里充满“先询问”“修改前询问”“等待确认”，Agent 会退化为事事请示。默认授权：

```text wrap
Safe local actions necessary for the requested task do not require confirmation: reading files, searching the repository, inspecting logs, editing in-scope files, running formatters, linters, tests, and builds, creating temporary diagnostic files, and other reversible local validation.
```

中文翻译：

```text wrap
完成请求所需的安全本地操作不必确认：读取文件、搜索仓库、检查日志、编辑范围内文件、运行格式化工具、lint、测试和构建、创建临时诊断文件，以及其他可逆的本地验证。
```

需要确认的主要是：

```text wrap
Require confirmation before destructive or irreversible actions, unauthorized external writes, production changes, publishing or deployment, purchases, deleting important data, or materially expanding the requested scope.
```

中文翻译：

```text wrap
以下操作前需要先确认：破坏性或不可逆操作、未获授权的外部写入、生产环境变更、发布或部署、购买、删除重要数据，或明显扩大请求范围。
```

核心原则：

```text wrap
Prepare everything possible first. Approval should be the final gate, not the first step.
```

中文翻译：

```text wrap
先尽可能完成所有准备工作。把批准放在最后一道关口，不要一开始就等批准。
```


## 仓库即规范

编码智能体不能只看用户 Prompt，现有仓库本身就是需求的一部分。推荐：

```text wrap
Before making a non-trivial change, inspect enough surrounding code to understand existing architecture, nearby implementation patterns, naming conventions, dependency choices, public interfaces, tests, and relevant configuration. Prefer established repository patterns over new abstractions without a clear need.
```

中文翻译：

```text wrap
做较大改动前，先查看足够多的周边代码，了解现有架构、附近的实现模式、命名约定、依赖选择、公共接口、测试和相关配置。没有明确需要时，优先沿用仓库已有模式，不要另起抽象。
```

例如用户说“增加 Redis Cache”，而仓库已存在 `internal/cache`，就应该复用，而不是新建 `pkg/rediscachev2`。1M 上下文让 DeepSeek V4 有条件把足够多的周边代码读进来再做决定——给它这个指令，它有这个容量。


## 范围纪律：广泛观察，谨慎修改

智能体常见的倾向是“既然都来了，顺便把附近代码优化一下”，结果是需求 30 行、Diff 800 行。推荐：

```text wrap
Keep changes limited to what the task requires. If you find a pre-existing bug, a performance concern, or behavior the task doesn't mention, don't fix, optimize, or extend it in this change unless the requested behavior cannot work without it; report it as a follow-up. Verify your work however you like; scratch scripts need not be kept. Commit tests only where the task asks for them or this repository already keeps tests for this kind of change, sized like the neighboring test files. This is about extras only: implement every behavior the task asks for, completely.
```

中文翻译：

```text wrap
改动只覆盖任务要求的部分。如果发现原有 Bug、性能问题或任务未提及的行为，除非请求的行为无法在没有它的情况下正常工作，否则不要在本次改动中修复、优化或扩展它；在总结中列为后续事项。验证方式不限；临时脚本不用保留。只有在任务要求测试，或仓库已经为这类改动编写测试时，才提交测试，规模与相邻测试文件相当。这些限制只针对额外内容：任务要求的每项行为都必须完整实现。
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


## 歧义时只实现最直接的读法

用户说“src 和 dst 支持 CIDR”，模型可能自行联想到 IPv6、DNS、wildcard、port range——这些不等于用户要求。推荐：

```text wrap
When the request is ambiguous, implement the interpretation most directly supported by the user's wording, surrounding repository behavior, and existing conventions. Do not implement every plausible interpretation. State any material assumption in the final summary.
```

中文翻译：

```text wrap
请求存在歧义时，实现用户措辞、周围仓库行为和现有约定最直接支持的理解。不要实现每一种看似合理的解释。在最终总结中说明任何重要假设。
```


## 定向编辑优于整文件重写

只修改一个函数、一个 YAML 字段、一个条件时，不应默认重写整个文件。重写消耗更多输出令牌和时间，还容易带来无意义 Diff。推荐：

```text wrap
The number of tokens used to edit files is best minimized, all else being equal. When it will not affect the end result, surgically edit the file rather than rewriting it, and preserve unrelated formatting, comments, naming, ordering, and structure. Rewrite an entire file only when most of it genuinely needs to change, the file is generated, or targeted edits would make the result less reliable.
```

中文翻译：

```text wrap
在其他条件相同的情况下，应尽量减少编辑文件所使用的令牌数量。只要不影响最终结果，就定向修改文件，不要整文件重写，并保留无关的格式、注释、命名、顺序和结构。只有在文件的大部分确实需要修改、文件是生成的，或定向编辑会降低结果可靠性时，才重写整个文件。
```


## 验证力度与风险成比例，失败先调查

编码智能体的价值不是“Write Code”，而是“Write → Run → Observe → Fix → Verify”。合并成一条规则：

```text wrap
After making changes, run the smallest validation that meaningfully tests the affected behavior, and expand it with the size and risk of the change — shared interfaces, dependencies, cross-package behavior, or high-risk changes call for broader validation. When validation fails, investigate whether the failure is caused by your change, pre-existing, environmental, dependency-related, flaky, or a wrong command, and attempt reasonable recovery before declaring the task blocked.
```

中文翻译：

```text wrap
完成改动后，先运行能有效检验受影响行为的最小验证，再根据改动的规模和风险扩大验证范围——共享接口、依赖、跨包行为或高风险改动需要更广泛的验证。验证失败时，先弄清失败是由你的改动引起、预先存在、环境问题、依赖问题、不稳定（flaky），还是命令错误，并在宣告任务受阻前尝试合理的恢复。
```

如果确实无法解决，再明确报告：失败了什么、为什么、成功验证了什么、仍未验证什么。


## 快速变化的信息要查证，仓库版本优先

“我知道 Kubernetes / React / 这个 SDK”不等于了解其当前行为。模型版本、SDK、云 API、框架变化极快，低 effort 档位下思考更少，对时效信息的验证更需要显式要求：

```text wrap
Recognition is not evidence of current behavior. When the task depends on a fast-moving API, library, model, CLI, service, or platform, verify the relevant behavior with authoritative sources. For existing repositories, prefer the version actually pinned by the project when making compatibility decisions.
```

中文翻译：

```text wrap
凭印象并不能证明当前行为。当任务依赖变化迅速的 API、库、模型、CLI、服务或平台时，用权威来源验证相关行为。对于现有仓库，做兼容性决策时优先参考项目实际锁定的版本。
```

`package-lock.json`、`go.mod`、`requirements.txt` 里锁定的版本，通常比模型的记忆更重要。


## 长会话：压缩时保留什么

DeepSeek V4 有 1M 上下文，但长会话的核心问题仍然不是 Token 本身，而是“哪些信息必须继续存在”。客户端压缩时，明确告诉模型保留什么：

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
10. exact identifiers that would be expensive to rediscover — paths, symbols, versions, URLs, commands, configuration keys, error messages.
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
10. 难以重新发现的确切标识符——路径、符号、版本、URL、命令、配置键和错误消息。
解释可以大幅压缩，但不能省略决策或状态。
```

两条配套注脚：压缩的最简形态是用“摘要消息 + 新用户轮次”整体替换历史，而不是就地改写旧轮次（第 3 节：历史仅追加）；压缩后只有写进项目文件的规则会从磁盘重新加载（第 8 节），跨会话必须存活的约束要落盘。


## 子智能体：可拆分才用，主智能体别干等

只在任务真正可以拆分成独立工作流时使用多智能体（后端 / 前端 / 测试 / 文档是好的拆分；“三个智能体各读一段函数”只是增加协调成本）。合并成一条规则：

```text wrap
Delegate only independent workstreams with a clear objective, boundaries, inputs, and a concrete output; do not delegate tiny sequential steps that depend on one another. After delegating, continue root-agent work that doesn't depend on the results, waiting only when the next useful action genuinely requires a subagent's output. Require subagents to return findings with evidence — affected files/symbols, suggested action, and open questions — not just conclusions.
```

中文翻译：

```text wrap
只委派彼此独立、且目标、边界、输入和输出都明确的工作流；不要拆分彼此高度依赖的微小串行步骤。委派后，继续做不依赖这些结果的 Root Agent 工作；只有下一步确实需要子智能体输出时才等待。要求子智能体返回有证据的发现——受影响的文件/符号、建议操作和未解决问题——不要只给结论。
```

时间上的节省来自主智能体继续干活的那些运行，而不是来自委派本身。


## 高风险操作基于证据，而不是模式匹配

运维和编码任务尤其容易出现“看到错误 A → 想起 A 一般重启解决 → 直接重启”。这是危险的智能体行为：

```text wrap
Before performing a destructive, irreversible, production-impacting, or externally visible action, verify that the available evidence supports that specific action. Do not execute a high-impact action solely because the symptoms resemble a familiar failure pattern.
```

中文翻译：

```text wrap
执行破坏性、不可逆、影响生产或对外可见的操作前，先确认现有证据支持这项具体操作。不要只因为症状看起来像某个熟悉的故障模式，就执行高影响操作。
```

这是第 16 节“批准边界”最高风险的一类实例：`rm`、`DROP`、`kubectl delete`、生产重启、迁移回滚、force push、部署、发布、凭据轮换。


## 最终回复要能独立阅读

用户不应该必须翻看所有工具日志才知道智能体做了什么。好的最终交付至少回答：做了什么？为什么？改了什么？验证了吗？结果如何？还有什么没完成？

```text wrap
The final response should stand on its own. For implementation tasks, include the outcome, the meaningful changes, important decisions when relevant, the validation performed and its result, and any remaining limitation or blocker. State any assumptions you made when the request was ambiguous. Do not dump routine tool activity. Do not claim validation that was not actually performed.
```

中文翻译：

```text wrap
最终回复应能独立读懂。对于实施类任务，包括完成的结果、有意义的改动、相关时的重要决策、已执行的验证及其结果，以及剩余的限制或阻塞。请求存在歧义时说明你采用的假设。不要堆砌例行工具记录。不要声称做过没有实际执行的验证。
```


## 推荐的 DeepSeek V4 Core Prompt

如果只想保留一份短的全局提示，推荐下面这种（放进系统提示或项目记忆文件均可）。

```text wrap
# Working contract

Infer the user's intended outcome from their request and the surrounding context.

For requests to explain, inspect, review, diagnose, compare, or plan, inspect the
relevant materials and report the result. Do not modify files unless implementation
was requested.

For requests to implement, change, build, migrate, or fix, carry the requested
in-scope work through to completion. Make necessary reversible local changes and
run appropriate non-destructive validation without asking for permission again.

Resolve routine ambiguity from repository context and established conventions,
following the most direct reading and stating the assumption in your summary.
Ask only when different reasonable interpretations would materially change the
result, compatibility, data, security, production impact, or architecture.

Keep changes proportional to the requested outcome. Do not fix unrelated bugs,
perform opportunistic refactors, or add adjacent features unless the requested
behavior cannot work without them. Report important unrelated findings separately
as suggestions, never as part of the change.

Treat the repository as part of the specification. Inspect enough surrounding code,
tests, configuration, and documentation to understand existing patterns before
making non-trivial changes, and prefer established conventions over new
abstractions without a clear need.

Prefer targeted edits over whole-file rewrites when they produce the same result.
Preserve unrelated formatting, comments, naming, ordering, and structure.

Use tools to establish facts rather than guessing. Fetch independent repository
information concurrently when practical, and do not repeat completed searches or
reads without a reason. When information depends on a fast-moving API, library,
model, service, or platform, verify current behavior with authoritative sources,
preferring the version pinned by the project for compatibility decisions.

After changing code, run the smallest meaningful validation that tests the affected
behavior, expanding with the size and risk of the change. Investigate failures and
retry reasonable recoveries before declaring the task blocked.

For longer tasks, provide brief progress updates only at meaningful milestones or
when a discovery changes the approach. Do not narrate routine tool calls.

Do not stop after identifying the cause, proposing a fix, editing the code, or
running only part of the available validation when the user's requested outcome
still requires more work. If the next necessary step is already authorized, safe,
and possible with available tools, do it instead of announcing it.

Require confirmation before destructive or irreversible operations, production or
external writes that were not already authorized, purchases, publication or
deployment, or a material expansion of scope.

Reply in the language the user writes in. Keep code identifiers, file paths,
commands, and error messages exactly as they appear.

Before finishing, compare the result against the original request. The final
response must clearly state what was accomplished, the meaningful changes or
findings, what validation was actually performed, assumptions made, and any
remaining blocker or limitation. Do not claim work or validation that was not
performed.
```

中文翻译：

```text wrap
# 工作约定

根据用户请求和上下文，判断要达成的结果。

对于解释、检查、审查、诊断、比较或制定计划的请求，查看相关材料并报告结果。除非用户要求实施，否则不要改文件。

对于实施、修改、构建、迁移或修复的请求，将请求范围内的工作持续做到完成。无需再次征求许可，完成范围内必要的可逆本地改动，并运行适当的非破坏性验证。

根据仓库上下文和既有约定解决一般歧义，按最直接的理解执行，并在总结中说明假设。只有当不同的合理理解会明显改变结果、兼容性、数据、安全性、生产影响或架构时才提问。

改动规模应与请求的结果相称。除非请求的行为无法在没有它们的情况下正常工作，否则不要修复无关 Bug、顺手重构或添加相邻功能。将重要的无关发现单独报告为建议，绝不要放进本次改动。

将仓库视为需求规范的一部分。在进行非平凡改动前，检查足够多的周边代码、测试、配置和文档，以了解现有模式。没有明确需求时，优先遵循仓库既有约定，而不是引入新的抽象。

如果能得到相同结果，优先采用定向修改而不是重写整个文件。保留无关的格式、注释、命名、顺序和结构。

用工具确认事实，不要靠猜测。可行时并行获取彼此独立的仓库信息；没有理由时，不要重复已经完成的搜索或读取。当信息依赖变化迅速的 API、库、模型、服务或平台时，用权威来源验证当前行为；做兼容性决策时优先参考项目实际锁定的版本。

修改代码后，运行能有效检验受影响行为的最小验证，并根据改动规模和风险扩大验证范围。先查明失败原因，并在判断任务受阻前尝试合理恢复。

对于较长任务，仅在有意义的里程碑或发现改变方案时提供简短进度更新。不要叙述例行工具调用。

当用户请求的结果仍需更多工作时，不要在找到原因、提出修复方案、编辑代码或只运行了部分可用验证后停止。如果下一步已经获得授权、安全且可用现有工具完成，就直接执行，而不是宣布它。

在破坏性或不可逆操作、生产环境操作、尚未获授权的外部写入、购买、发布/部署或明显扩大范围前，需要获得确认。

用用户的语言回复。代码标识符、文件路径、命令和错误信息保持原样。

结束前，将结果与原始请求进行对照。最终回复必须清楚说明完成了什么、有意义的改动或发现、实际执行了哪些验证、做出的假设，以及任何剩余阻塞或限制。不要声称完成了未做的工作或执行了未进行的验证。
```


## 推荐的 Task Prompt 结构

Core Prompt 不应包含每个任务的具体信息。具体任务建议使用：

```text wrap
## Goal

What outcome should exist when this task is finished?

## Context

Relevant files, components, documentation, examples, or prior decisions.

## Constraints

What must remain true? What must not change?

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

相关文件、组件、文档、示例或既有决策。

## 约束

哪些内容必须保持不变？哪些内容不得改变？

## 批准边界

Agent 不应自动执行的操作。

## 完成条件

可观察的验收标准。

## 验证

判定完成前需要的具体证据。
```

示例：

```text wrap
## Goal

Replace the existing libpcap traffic collector with a conntrack-based collector.

## Context

Current implementation lives on main; create the work on a new `conntrack` branch.

## Constraints

- Preserve existing Prometheus metric names where practical.
- Do not modify the main-branch pcap implementation.
- Do not introduce eBPF as a dependency.

## Done when

- conntrack traffic is collected continuously;
- source/destination IP and direction remain available;
- metrics are exposed through the existing HTTP endpoint;
- existing relevant validation passes.

## Verification

Run focused tests/build checks; document anything that cannot be verified locally.
```

中文翻译：

```text wrap
## 目标

把现有的 libpcap 流量采集器换成基于 conntrack 的采集器。

## 上下文

当前实现仍在 main 分支；请在新的 `conntrack` 分支上完成这项工作。

## 约束

- 能保留现有 Prometheus 指标名称就保留。
- 不要改动 main 分支上的 pcap 实现。
- 不引入 eBPF 依赖。

## 完成条件

- 持续采集 conntrack 流量；
- 仍能提供源/目标 IP 和方向信息；
- 通过现有 HTTP 端点暴露指标；
- 现有相关验证通过。

## 验证

运行定向测试和构建检查，并记录本地无法验证的内容。
```

这种 Task Prompt 比一步步的执行脚本更适合 DeepSeek V4——它被训练来决定 HOW，你的工作是定义 WHAT 和边界。


## 最终设计原则

DeepSeek V4 提示的核心不是告诉模型更多步骤，而是给它一份更清晰的工作合同，并处理好它的模型特性：思考与 effort 在会话前定好，思考历史原样保留，长期规则落盘：

```text wrap
              User Goal
                  │
                  ▼
            Task Contract
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
 Constraints   Done When   Boundaries
      │           │           │
      └───────────┼───────────┘
                  ▼
        Project Memory（AGENTS.md / rules）
                  │
                  ▼
                 Agent ── effort: low / high / max（默认 high）
                  │      history: append-only（reasoning_content 原样回传）
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
      ┌───────────┼───────────┐
      ▼           ▼           ▼
    约束       完成条件      边界
      │           │           │
      └───────────┼───────────┘
                  ▼
        项目记忆（AGENTS.md / 规则文件）
                  │
                  ▼
                Agent ── effort: low / high / max（默认 high）
                  │      历史：仅追加（reasoning_content 原样回传）
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

**Tell DeepSeek V4 what success means, box in its initiative with explicit boundaries, keep the thinking history intact — and let it own the path it was trained to carry end to end.**

中文翻译：

**告诉 DeepSeek V4 成功是什么样，用明确的边界圈住它的主动性，完整保留思考历史——然后让它自己走那条它被训练来端到端负责到底的路。**


## 附录：Claude Code / Codex / DeepSeek Harness 接入注意

这些不是提示词问题，但配错了会让提示词全部白写。

**Anthropic 兼容端点**（Claude Code 走这条）：

* 端点 `https://api.deepseek.com/anthropic`，配置两个环境变量即可：`ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` 和 `ANTHROPIC_API_KEY=<你的 key>`。
* **模型名映射**：传入 `claude-opus*` 开头会映射到 `deepseek-v4-pro`；`claude-haiku*` 或 `claude-sonnet*` 开头映射到 `deepseek-v4-flash`。利用这个映射，在 Claude Desktop 新版的开发者模式下，只需改 base_url 和 api_key 就能绕过模型名限制直接连 DeepSeek。
* **传不支持的模型名会自动落到 `deepseek-v4-flash`**，不会报错——如果发现“跑出来的不是 Pro”，先查模型名映射。
* Anthropic 格式下思考开关用 `reasoning` 字段（`effort: "none"/"low"/"high"/"max"`），`thinking.budget_tokens` 会被忽略；`temperature`（范围 `[0.0, 2.0]`）和 `top_p` 在 Anthropic 格式下是支持的，与 OpenAI 格式的思考模式行为不同，注意区分。

**OpenAI 兼容端点**（Codex 走这条）：

* 端点 `https://api.deepseek.com`，模型名 `deepseek-v4-pro` / `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp`。
* 思考开关用 `thinking: {"type": "enabled/disabled"}`，思考深度用顶层 `reasoning_effort`。用 OpenAI SDK 时，`thinking` 参数要放进 `extra_body`。
* 走 Responses API 时，思考开关与档位用 `reasoning` 字段（`effort: "none/low/high/max"`）控制。

**DeepSeek Harness**：面向编码智能体 harness 开发者的官方框架，目前处于 developer preview，面向全球开放。它把 V4 的思考历史回传、工具循环等细节封装好，是自研 harness 时的参考实现。

**常见坑**：工具循环里漏回传 `reasoning_content` 会 400（第 3 节）；思考模式下 OpenAI 格式的 `temperature`/`top_p` 被静默忽略（第 4 节）；改历史会破坏前缀缓存、推高长会话成本（第 5 节）。


## 参考

* [DeepSeek API 文档（首页 / First API Call）](https://api-docs.deepseek.com/)：模型名、base_url、示例调用
* [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)：V4-Pro / V4-Flash 能力、定价、缓存命中与未命中价格
* [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)：`thinking` / `reasoning_effort` 取值、effort 映射、`reasoning_content` 回传规则
* [Multi-round Conversation](https://api-docs.deepseek.com/guides/multi_turn)：多轮对话中 `reasoning_content` 的拼接规则
* [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)：工具循环中 `reasoning_content` 必须完整回传
* [Context Caching](https://api-docs.deepseek.com/guides/kv_cache)：磁盘缓存机制、命中规则、失效条件
* [Using the Anthropic API](https://api-docs.deepseek.com/guides/anthropic_api)：Anthropic 兼容端点、模型名映射、字段兼容性
* [Agent Integrations](https://api-docs.deepseek.com/quick_start/agent_integrations)：Claude Code、Codex、OpenCode 等工具接入
* [DeepSeek Harness Guide](https://api-docs.deepseek.com/guides/harness)：官方编码智能体 harness（developer preview）
