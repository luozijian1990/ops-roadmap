---
title: 为 Kimi K3 编写提示
url: https://platform.kimi.ai/docs/guide/kimi-k3-quickstart
description: Kimi K3 在 Agentic Coding 环境中的提示工程、思考历史、主动性边界、工具协作、视觉验证和接入实践。
---

> 面向运行在 Kimi Code、Claude Code（Kimi 接入）、Codex、CodeBuddy、Cline、OpenCode 或其他 Agentic Coding 环境中的 Kimi K3。
>
> 本文中的 “Kimi K3” 指 Moonshot AI 旗舰模型（`kimi-k3`）运行在上述编码智能体环境中的组合。文中与模型和 API 相关的事实来自 Kimi 开放平台官方文档与 Kimi K3 技术博客，文末附参考链接。

Kimi K3 是 2.8T 参数的旗舰模型，也是首个 3T 级开源模型：1M token 上下文、原生视觉理解（文本 / 图片 / 视频），训练重心是长程编码与端到端知识工作。它可以在极少人工监督下维持长时间工程会话、理解大型代码库并调度终端工具（DeepSWE v1.1 67.3；BrowseComp 在 1M 上下文不压缩下 90.4），并且擅长把截图与视觉反馈放进编码回路。接入侧通过 OpenAI Chat Completions、OpenAI Responses 与 Anthropic Messages 三种协议进入 Kimi Code、Claude Code、Codex 等编码工具。

模型的两个硬性行为约束是：**思考始终开启，无法关闭**，深度由顶层 `reasoning_effort`（`low` / `high` / `max`，默认 `max`）控制；**Preserved Thinking 始终开启**，多轮对话与工具循环中必须把 API 返回的完整 assistant 消息（含 `reasoning_content`）原样回传。技术博客还点名了第三个特征：**过度主动**——K3 被训练为在长程困难任务上自主推进，遇到小问题或意图模糊时可能替用户做意料之外的决定，官方建议用更明确的行为约束把它圈住。这三点共同决定了提示词的正确姿势——对于编码智能体，提示的重点应该逐渐从：

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

**Prompt 更应该成为 Agent 的工作合同——而且对 K3 来说，合同里的边界条款不是可选项。**


如果你观察到以下现象，可以从对应章节开始调整。

* 传 `thinking` 参数无效或行为异常：K3 没有 `thinking` 参数，用 `reasoning_effort`（第 1 节）
* 传 `temperature` / `top_p` 报错：采样参数全部固定，不要显式传（第 4 节）
* 简单任务又慢又贵：`reasoning_effort` 是否过高（第 1 节）
* 缓存命中率莫名下降：会话中途切换了 effort，或历史被编辑（第 1、3 节）
* 长会话后生成质量严重不稳定：`reasoning_content` 未原样回传，或会话中途从别的模型切到 K3（第 3 节）
* 回复被截断，长交付物等待极久：`max_completion_tokens` 要同时覆盖思考与输出（第 2 节）
* Agent 替用户做了意料之外的决定：过度主动：补显式行为边界（第 5 节）
* 需求 30 行，Diff 800 行：范围纪律（第 20 节）
* 发现旁边 Bug 顺手一起修：范围纪律 + 过度主动（第 5、20 节）
* 同一工具同一参数被反复调用：重复工具调用的检测与修复（第 13 节）
* 工具几百个，选错率高、上下文被吃光：检索 + 动态加载 + `tool_choice`（第 14 节）
* `tool_choice: "required"` 报错：仅 K3 支持，K2.x 不支持（第 14 节）
* 工具轮次之间长时间沉默：进度更新（第 10 节）
* 一轮只发一个工具调用：批量执行独立调用（第 11 节）
* Agent 反复读取同一个文件：工具纪律（第 12 节）
* 用户只是提问，模型却改了代码：分析与修改的边界（第 15 节）
* 做到一半停下问“要继续吗？”：完成整个任务（第 16 节）
* 每执行一步都请求确认：批准边界（第 18 节）
* 项目规则在每次提示里重复：项目记忆文件（第 8 节）
* 压缩后忘记原始约束：规则落盘 + 压缩保留（第 8、26 节）
* 修改一个函数却重写整个文件：定向编辑（第 22 节）
* 改完不验证，或为 3 行改动跑全量测试：验证力度（第 23 节）
* 测试失败立刻宣告任务受阻：失败调查（第 23 节）
* 查当前 API 却凭模型记忆回答：时效查证（第 24 节）
* 前端代码能运行但视觉质量不好：截图回路（第 25 节）
* 子智能体开了但没真正并行：子智能体（第 27 节）
* 最终回复只有“完成”：最终交付（第 29 节）
* Claude Code 部分场景静默失败：接入配置（附录）


## 思考不可关闭：用 reasoning_effort 做权衡

Kimi K3 **永远思考**：它没有 `thinking` 参数，也不存在“关闭思考”这个状态。思考深度由请求顶层的 `reasoning_effort` 控制：

```text wrap
low   轻量思考
high  增强思考
max   深度思考（默认）
```

一个实用起点（官方未给出任务分级，以下是建议起点，请用自己的评测校准）：

```text wrap
max   复杂编码、架构调整、难复现 Bug、多组件交互、迁移、长程 Agent 任务
high  常规 Feature、多文件修改、日常 Debug、API 集成
low   简单配置修改、文档、格式调整、小范围 CRUD、高吞吐批量任务
```

三条 K3 特有的纪律：

* **会话开始前定档，中途不要切换。** 切换 `reasoning_effort` 会使 prefix cache 失效。K3 缓存命中输入与未命中输入的单价相差 10 倍（$0.30 vs $3.00 / MTok），官方 API 在编码负载下缓存命中率超过 90%——前缀稳定是真金白银。
* **从 K2.x 迁移时，删掉 `thinking` 配置。** K2.6 的 `thinking.type: "disabled"` 在 K3 上不存在；想要“少思考”，用 `reasoning_effort: "low"`。
* **OpenAI 兼容的 `reasoning_effort` 写法可以直接用**，K3 原生支持顶层字段，值只接受 `low` / `high` / `max`。

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

思考深度是请求参数，不是形容词。Prompt 更应该描述：

```text wrap
目标
约束
成功标准
必须验证的证据
```


## 为思考和长输出留出空间

K3 的 `max_completion_tokens` 默认 131072，上限 1048576。**`reasoning_content` 与 `content` 共享这个额度**——思考消耗的令牌多了，留给正文就少了。官方对思考模型的建议是 `max_tokens >= 16000`，保证思考与正文都不被截断。

在 `max` 档位下处理长篇交付物（整文件重写、多章节文档、大型数据集）时，模型可能在思考中起草大部分内容，再作为回复誊写一遍——本轮长度翻倍，却不会改善结果。将以下说明追加到请求末尾（把 `[max_tokens]` 替换为实际值）：

```text wrap
Everything produced in one reply, including any reasoning or drafting done before the reply, counts toward a single limit of about [max_tokens] tokens. If that limit is reached before the reply is finished, the person receives a cut-off response and has to start over. Composing an entire deliverable in full as reasoning and then again as a reply doubles the length of the turn without improving the result, so don't do that. Use the reasoning space to settle structure and difficult decisions, and write the deliverable once.
```

中文翻译：

```text wrap
单次回复产生的所有内容，包括回复前的推理或草稿，都计入约 [max_tokens] 个令牌的同一上限。若回复尚未完成就达到上限，用户会收到截断内容，只能重新开始。先在推理中完整写交付物、再在回复中重写一遍，只会让本轮变长，却不会改善结果，因此不要这样做。

相反，用户要求长篇或高强度交付物（如多章节文档、大型表格或数据集、完整代码文件）时，应把额外精力用来理解请求、核对输入、确定结构和处理难点，用推理空间思考，用输出空间写结果。通常不必多次起草同一份交付物。
```


## Preserved Thinking 永远开启：历史仅追加

这是 K3 与 harness 集成最关键的一条，也是 K3 与多数模型差异最大的一条。

K3 的 Preserved Thinking **始终开启、无法关闭**。官方要求：多轮对话和工具调用循环中，把 API 返回的**完整 assistant 消息原样放回 `messages`**——包括 `reasoning_content` 和 `tool_calls`，不要只保留 `content`：

```text wrap
连续的 assistant 消息必须与 API 返回的序列逐字一致。
不要重排，不要编辑，不要就地摘要，不要只保留 content 丢掉 reasoning_content。
```

违反后果不是报错，而是**静默劣化**：K3 是在保留思考历史的模式下训练的，harness 若没有按要求回传全部历史思考，生成质量可能变得**严重不稳定**，同时缓存命中率下降。这与提示缓存是同一类问题——任何对较早轮次的编辑（删除、重写、就地摘要、中途改写系统提示）都会破坏前缀稳定性。因此：

* 每轮把 assistant 消息按返回原样追加（包括 `reasoning_content` 与 `tool_calls`），仅追加、不修改。
* **不要在会话中途把进行中的会话从另一个模型切换到 K3**（也不要从 K3 切走）。思考历史格式对不上，质量会明显不稳。换模型就开新会话。
* 选择经过验证兼容的 harness（官方点名 Kimi Code）；自研 harness 时，把“历史仅追加”当作硬性要求来测试。
* `reasoning_content` 计入 token 消耗并占用上下文。长会话做压缩时，参考第 26 节——用摘要 + 新用户轮次替换历史，而不是就地改写。

若发现“长会话质量下降、缓存命中率下降”，第一件事是检查 harness 是否在请求之间编辑了历史。


## 采样参数全部固定：不要显式传 temperature

K3 的采样参数**不可修改**，传入其他值会直接报错：

| 参数 | 固定值 |
|---|---|
| `temperature` | `1.0` |
| `top_p` | `0.95` |
| `n` | `1` |
| `presence_penalty` / `frequency_penalty` | `0` |

做法很简单：**请求里不要出现这些字段**。两个推论：

* 想要输出更多样或更保守，通过 Prompt 表达（“给出 3 个风格不同的方案”“只输出最稳妥的一种做法”），而不是调采样参数。
* 从其他平台迁移代码时，删掉请求构造里的 `temperature=0.2` 之类的遗留参数，否则迁移后第一轮就报错。


## 收敛“过度主动”：把行为边界写进提示

这是 K3 提示词与别家最不同的一节。官方在技术博客的 Limitations 里明确写道：K3 的训练特别强调长程困难任务，因此**遇到小问题或用户意图模糊时，它可能替用户做出意料之外的决定**；如果你的应用需要 Agent 在明确边界内运行、不做过多即兴发挥，官方建议在 system prompt 或 `AGENTS.md` 中施加更明确的行为约束。

换句话说：别的模型需要提示来“推一把”（别半途而废），K3 在自主性上不需要推——它的长程续航是训练出来的。对 K3，提示的重心要放一部分在**“圈住”**上：

```text wrap
The user's request defines the scope. When you hit a minor issue or ambiguous intent mid-task, do not make a product-level decision on the user's behalf: follow the reading most directly supported by the request and the codebase, state the assumption in your final summary, and keep going. If different readings would lead to materially different outcomes, stop and ask first. Anything worth doing beyond the task — cleanups, fixes, refactors, new features — goes into the final summary as suggestions, never into the change itself.
```

中文翻译：

```text wrap
用户请求决定工作范围。中途遇到小问题或意图不清时，不要替用户做产品决定：按请求和代码库最直接支持的理解继续，并在总结中说明假设。若不同理解会导致明显不同的结果，先停下来询问。任务之外的清理、修复、重构或新功能，都放在总结里作为建议，不要并入本次改动。
```

注意这条与后面几节是配套的：第 17 节（歧义分级）、第 18 节（批准边界）、第 20 节（范围纪律）对 K3 不是可选优化，而是官方建议必写的约束。反过来，如果你就是希望 K3 放开手脚自主推进（例如无人值守的长程任务），可以反过来写——明确授权它自主决策的范围。**默认不约束，K3 会按自己的判断填空白。**


## Outcome First，而不是 Process First

K3 被训练来端到端拥有长程任务，更适合 Outcome-Oriented Prompt。不要过早规定执行路径：

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

强大的模型不需要巨大的 System Prompt 才能正确工作。重复规则会导致规则互相覆盖、Agent 行为漂移、上下文浪费，还会稀释第 5 节那些真正重要的边界条款。核心原则：

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

第 5 节的行为约束写在哪里？官方的建议是 system prompt 或 `AGENTS.md`。一条简明的设计原则：

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

* **规则要具体可执行**：写“新 TypeScript 文件使用 2 空格缩进”“修改业务逻辑后运行 `pnpm test`”，而不是“保持代码整洁”。对 K3 这类自主推进的模型，规则越具体，行为边界越稳定。
* **主文件控制在 200 行以内**，专题规则拆成独立文件，按路径加载——能按需加载的规则不要全局加载。
* **只有写进文件的规则能在压缩后存活**。长对话压缩后，记忆文件会从磁盘重新加载；只存在于对话中的约束会消失。第 5 节的边界条款必须落盘。


## 中文直接写，术语保持原文

Kimi 以中英双语训练，官方系统提示也自称“更擅长中文和英文的对话”。中文任务直接用中文写提示即可，不需要先译成英文再发给模型；中文表述的约束与英文同等有效。“英文提示更精确”的旧习惯只会带来翻译损耗——尤其是约束和完成条件这类精确表述。

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

K3 的工作过程大多发生在 `reasoning_content` 里，而多数 harness 默认折叠思考——用户看到的是智能体一次沉默数分钟，然后突然“完成”。两个层面解决：

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


## 重复工具调用的检测与官方修复

Kimi 官方文档有一篇专门的“重复工具调用”修复指南，值得直接采用。判定重复调用的四个条件（**全部满足才触发提醒，避免误报**）：

```text wrap
同一个工具
+ 完全相同的 function.name 和 function.arguments
+ 连续重复
+ 工具结果没有提供新的有用信息
```

先检查消息布局（这是最常见的根因）：`finish_reason=tool_calls` 时完整 assistant 消息是否原样放回 `messages`（见第 3 节）；每个 `tool_call` 是否都有对应的 `role=tool` 消息；`tool_call_id` 是否精确匹配；流式场景下 `tool_calls` 分片是否正确拼装。

布局没问题仍重复时，在 harness 侧做计数检测，向 system prompt 追加官方提醒。同一调用连续重复 3 次时：

```text wrap
You are repeating the exact same tool call with identical parameters. Please carefully analyze the previous result. If the task is not yet complete, try a different method or parameters instead of repeating the same call.
```

中文翻译：

```text wrap
你正在用完全相同的参数重复工具调用。先仔细分析上一次结果；如果任务还没完成，改用不同的方法或参数，不要再重复同一调用。
```

连续重复 5 次时，追加带具体信息的加强版（8 次时再发一次）：

```text wrap
You have repeatedly called the same tool with identical parameters many times. Repeated tool call detected:
- tool: {tool_name}
- repeated_times: {repeat_count}
- arguments: {tool_arguments}
The previous repeated calls did not make progress. Do not call this exact same tool with the exact same arguments again. Carefully inspect the latest tool result and choose a different next action, different parameters, or finish the task if enough evidence has been gathered.
```

中文翻译：

```text wrap
你已多次用完全相同的参数重复调用同一个工具。检测到重复调用：
- 工具：{tool_name}
- 重复次数：{repeat_count}
- 参数：{tool_arguments}
之前的重复调用没有带来进展。不要再用相同参数调用这个工具。仔细检查最新结果，选择不同的下一步或参数；如果证据已经足够，就结束任务。
```


## 大工具箱：检索 + 动态加载 + tool_choice

当你的 Agent 有几十上百个工具时，不要把所有工具定义塞进请求——它们吃上下文、拉高选错率。官方在 K3 上推荐的编排模式：

```text wrap
1. 会话开始：顶层 tools 只声明一个 search_tools（由你的后端实现）+ 少量每轮必用的核心工具
2. 首轮检索：tool_choice: "required" 强制模型先调 search_tools
3. 按需注入：根据检索结果，用一条带 tools 字段的 system 消息把完整工具定义插入 messages
4. 直接调用：模型在后续生成中调用已加载的工具；tool_choice 改回 "auto"
5. 会话开始前定好 reasoning_effort
```

配套事实，逐条都有用：

* **`tool_choice: "required"` 只有 K3 支持**；K2.6 / K2.7-code 传了会报错。
* 动态加载的工具定义与顶层 `tools` 格式完全相同，从该 system 消息的位置开始生效；服务端不保留，客户端要在后续请求里自己留着它。
* **改 `tool_choice` 不会使 prefix cache 失效**，可以按请求调整；但删除或修改靠前的工具声明会影响变更点之后的缓存命中。
* prefix cache 的门槛：前一次请求的 prompt 超过 256 token 才会进缓存；在系统消息末尾追加动态声明不影响已有前缀。
* 在 system prompt 里告诉模型有哪些领域标签可搜，它才知道需要工具时先调 `search_tools`。


## 明确分析与修改的边界

用户说“帮我看看这个设计有没有问题”，通常是要分析，不是要直接改代码；反过来，“帮我把这个 Bug 修掉”显然授权了修改加验证。这是最关键的意图边界，对容易主动出手的 K3 尤其要写明：

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

K3 的长程能力（官方案例中可持续数小时乃至 48 小时的自主工程会话）只有在提示不让它半途停止时才能发挥。典型未完成形态：描述下一步然后结束（“接下来我将更新测试。”），或者停下来为原始请求已经涵盖的步骤征求许可（“找到原因了，要我修复吗？”）。推荐：

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

注意与第 15 节配合：用户在描述问题或提问时，交付物是评估本身——报告发现并停止，不要未经要求就实施修复。


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

K3 注脚：因为 K3 倾向于自己填空白（第 5 节），这条规则要写全——尤其是“常规歧义按最直接理解执行、并在总结中声明假设”这一半，否则它连假设都不会告诉你。


## 批准边界要窄且明确

如果提示里充满“先询问”“修改前询问”“等待确认”，Agent 会退化为事事请示，K3 的长程能力就白费了。默认授权：

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

例如用户说“增加 Redis Cache”，而仓库已存在 `internal/cache`，就应该复用，而不是新建 `pkg/rediscachev2`。1M 上下文让 K3 有条件把足够多的周边代码读进来再做决定——给它这个指令，它有这个容量。


## 范围纪律：广泛观察，谨慎修改

智能体常见的倾向是“既然都来了，顺便把附近代码优化一下”，结果是需求 30 行、Diff 800 行。对 K3 这个倾向更强（第 5 节），所以这条要写硬：

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

只修改一个函数、一个 YAML 字段、一个条件时，不应默认重写整个文件。重写消耗更多输出令牌和时间（输出 $15.00 / MTok，是 K3 计费里最贵的一项），还容易带来无意义 Diff。推荐：

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

“我知道 Kubernetes / React / 这个 SDK”不等于了解其当前行为。模型版本、SDK、云 API、框架变化极快；`low` 档位下思考更少，对时效信息的验证更需要显式要求：

```text wrap
Recognition is not evidence of current behavior. When the task depends on a fast-moving API, library, model, CLI, service, or platform, verify the relevant behavior with authoritative sources. For existing repositories, prefer the version actually pinned by the project when making compatibility decisions.
```

中文翻译：

```text wrap
凭印象并不能证明当前行为。当任务依赖变化迅速的 API、库、模型、CLI、服务或平台时，用权威来源验证相关行为。对于现有仓库，做兼容性决策时优先参考项目实际锁定的版本。
```

`package-lock.json`、`go.mod`、`requirements.txt` 里锁定的版本，通常比模型的记忆更重要。

（harness 实现者备注：Kimi API 的官方联网搜索工具在本文写作时正在升级，官方提示近期不建议用于生产工作流；时效查证请依赖你自己的搜索 / 抓取工具。）


## 前端与视觉任务：把截图放进回路

K3 是原生视觉模型，官方特别强调 “vision in the loop”——在游戏开发、前端工程、CAD 等场景里用截图和视觉反馈迭代工作流。这意味着前端任务的正确姿势不是“编译通过就算完”，而是：

```text wrap
For frontend or visual work, do not treat successful compilation as sufficient verification. Render the affected screen, capture a screenshot, and inspect it: layout hierarchy, overflow, responsiveness, alignment, empty/loading/error states, and obvious visual regressions. Iterate until the rendered result matches the intended experience.
```

中文翻译：

```text wrap
对于前端或视觉工作，不要把编译通过视为充分验证。渲染受影响的页面并截图检查：布局层次、溢出、响应式表现、对齐、空状态/加载状态/错误状态，以及明显的视觉回归。迭代到渲染结果符合预期体验为止。
```

接入限制（写工具时注意）：K3 的视觉输入**不支持公网图片 URL**，要用 base64 或文件上传后的 `ms://` 引用；`content` 必须是对象数组而不是字符串；图片建议不超过 4K 分辨率，视频不超过 1080p。


## 长会话：压缩时保留什么

K3 有 1M 上下文，但长会话的核心问题仍然不是 Token 本身，而是“哪些信息必须继续存在”。客户端压缩时，明确告诉模型保留什么：

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

两条 K3 注脚：压缩的最简形态是用“摘要消息 + 新用户轮次”整体替换历史，而不是就地改写旧轮次（第 3 节：历史仅追加，编辑历史会破坏稳定性）；压缩后只有写进项目文件的规则会从磁盘重新加载（第 8 节），跨会话必须存活的约束要落盘。


## 子智能体：可拆分才用，主智能体别干等

只在任务真正可以拆分成独立工作流时使用多智能体（后端 / 前端 / 测试 / 文档是好的拆分；“三个智能体各读一段函数”只是增加协调成本）。合并成一条规则：

```text wrap
Delegate only independent workstreams with a clear objective, boundaries, inputs, and a concrete output; do not delegate tiny sequential steps that depend on one another. After delegating, continue root-agent work that doesn't depend on the results, waiting only when the next useful action genuinely requires a subagent's output. Require subagents to return findings with evidence — affected files/symbols, suggested action, and open questions — not just conclusions.
```

中文翻译：

```text wrap
只委派彼此独立、且目标、边界、输入和输出都明确的工作流；不要拆分彼此高度依赖的微小串行步骤。委派后，继续做不依赖这些结果的 Root Agent 工作；只有下一步确实需要子智能体输出时才等待。要求子智能体返回有证据的发现——受影响的文件/符号、建议操作和未解决问题——不要只给结论。
```

时间上的节省来自主智能体继续干活的那些运行，而不是来自委派本身。官方案例中 K3 曾用 20+ 并发子智能体完成分析任务——它能协调，但拆分决策仍然是你的。


## 高风险操作基于证据，而不是模式匹配

运维和编码任务尤其容易出现“看到错误 A → 想起 A 一般重启解决 → 直接重启”。对一个习惯自主推进的模型，这条必须写死：

```text wrap
Before performing a destructive, irreversible, production-impacting, or externally visible action, verify that the available evidence supports that specific action. Do not execute a high-impact action solely because the symptoms resemble a familiar failure pattern.
```

中文翻译：

```text wrap
执行破坏性、不可逆、影响生产或对外可见的操作前，先确认现有证据支持这项具体操作。不要只因为症状看起来像某个熟悉的故障模式，就执行高影响操作。
```

这是第 18 节“批准边界”最高风险的一类实例：`rm`、`DROP`、`kubectl delete`、生产重启、迁移回滚、force push、部署、发布、凭据轮换。


## 最终回复要能独立阅读

用户不应该必须翻看所有工具日志才知道智能体做了什么。好的最终交付至少回答：做了什么？为什么？改了什么？验证了吗？结果如何？还有什么没完成？

```text wrap
The final response should stand on its own. For implementation tasks, include the outcome, the meaningful changes, important decisions when relevant, the validation performed and its result, and any remaining limitation or blocker. State any assumptions you made when the request was ambiguous. Do not dump routine tool activity. Do not claim validation that was not actually performed.
```

中文翻译：

```text wrap
最终回复应能独立读懂。对于实施类任务，包括完成的结果、有意义的改动、相关时的重要决策、已执行的验证及其结果，以及剩余的限制或阻塞。请求存在歧义时说明你采用的假设。不要堆砌例行工具记录。不要声称做过没有实际执行的验证。
```

对 K3 特别加了“声明假设”一句——它倾向于自行决断（第 5 节），你至少要让它把决断说出来。


## 推荐的 Kimi K3 Core Prompt

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

The user's request defines the scope. Do not make product-level decisions on the
user's behalf. Resolve routine ambiguity from repository context and established
conventions, following the most direct reading and stating the assumption in your
summary. Ask only when different reasonable interpretations would materially change
the result, compatibility, data, security, production impact, or architecture.

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

用户的请求定义了工作范围。不要替用户做产品层面的决定。根据仓库上下文和既有约定解决一般歧义，按最直接的理解执行，并在总结中说明假设。只有当不同的合理理解会明显改变结果、兼容性、数据、安全性、生产影响或架构时才提问。

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

这种 Task Prompt 比一步步的执行脚本更适合 K3——它被训练来决定 HOW，你的工作是定义 WHAT 和边界。


## 最终设计原则

Kimi K3 提示的核心不是告诉模型更多步骤，而是给它一份更清晰的工作合同，并处理好它的三个特性：思考档位在会话前定好，思考历史原样保留，主动性用边界圈住：

```text wrap
              User Goal
                  │
                  ▼
            Task Contract
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
 Constraints   Done When   Boundaries   ← K3 主动性由这里圈住
      │           │           │
      └───────────┼───────────┘
                  ▼
        Project Memory（AGENTS.md / rules）
                  │
                  ▼
                 Agent ── effort: low / high / max（会话前定档）
                  │      history: append-only（Preserved Thinking）
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
    约束       完成条件      边界      ← K3 主动性由这里圈住
      │           │           │
      └───────────┼───────────┘
                  ▼
        项目记忆（AGENTS.md / 规则文件）
                  │
                  ▼
                Agent ── effort: low / high / max（会话前定档）
                  │      历史：仅追加（Preserved Thinking）
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

**Tell Kimi K3 what success means, box in its initiative with explicit boundaries, keep the thinking history intact — and let it own the path it was trained to carry end to end.**

中文翻译：

**告诉 Kimi K3 什么算成功，用明确边界约束它的主动性，完整保留思考历史，再让它自己把工作做到底。**


## 附录：Claude Code / Codex / Kimi Code 接入注意

这些不是提示词问题，但配错了会让提示词全部白写。

**Claude Code**（走 Kimi 的 Anthropic 兼容端点 `https://api.moonshot.ai/anthropic`）：

* 主模型名是 `kimi-k3[1m]`；`ANTHROPIC_DEFAULT_OPUS/SONNET/HAIKU/FABLE_MODEL`、`CLAUDE_CODE_SUBAGENT_MODEL` 等分层变量**缺了哪个，对应场景就静默失败**，请全部配置（官方示例把 HAIKU 层配给 `kimi-k2.7-code`，其余全部 `kimi-k3[1m]`）。
* `~/.claude/settings.json` 的 `env` 字段**覆盖**终端导出的同名变量；改了配置不生效，先查这里的残留值和 shell 配置里的旧 `ANTHROPIC_*` 导出。
* 建议 `CLAUDE_CODE_AUTO_COMPACT_WINDOW=1000000`（配小了会过早压缩丢上下文）、`CLAUDE_CODE_EFFORT_LEVEL=max`。
* 注意：K2.7-code 在 Claude Code 里强制思考且不可关，K3 则是永远思考——本文第 1、3 节的行为在那里同样适用。

**Codex**：通过 Kimi Responses API 直连，在 `~/.codex/config.toml` 配置即可。

**Kimi Code CLI**：`/login` 选择 `Kimi Platform (API key · platform.kimi.ai)`，`/model` 切换模型，`/status` 验证。官方点名它是与 K3 思考历史机制验证兼容的 harness。

**账号**：K3 是旗舰模型，充值（最低 $1）后解锁；累计充值额度决定并发与 RPM/TPM/TPD 限额。


## 参考

* [Kimi K3 模型页](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart)：能力、调用示例、重要限制
* [Kimi K3 技术博客](https://www.kimi.com/blog/kimi-k3)：架构、Benchmark、Limitations（思考历史敏感性、过度主动）
* [Thinking Models](https://platform.kimi.ai/docs/guide/use-thinking-models)：各模型思考行为、`reasoning_content`、Preserved Thinking
* [Reasoning Effort](https://platform.kimi.ai/docs/guide/use-reasoning-effort)：`reasoning_effort` 取值与用法
* [Model Parameter Reference](https://platform.kimi.ai/docs/api/models-overview)：固定采样参数、`tool_choice` 差异、迁移说明
* [K3 工具调用最佳实践](https://platform.kimi.ai/docs/guide/kimi-k3-tool-calling-best-practice)：检索 + 动态加载 + `tool_choice` 编排
* [重复工具调用修复](https://platform.kimi.ai/docs/guide/tool-call-repeat)：检测条件与分级提醒文案
* [动态工具加载](https://platform.kimi.ai/docs/guide/use-dynamic-tool-loading)：system 消息注入工具定义
* [上下文缓存](https://platform.kimi.ai/docs/guide/use-context-caching-feature-of-kimi-api)：自动缓存、256 token 门槛、命中条件
* [Claude Code 接入](https://platform.kimi.ai/docs/guide/claude-code-kimi) / [Codex 接入](https://platform.kimi.ai/docs/guide/codex-kimi) / [Kimi Code CLI](https://platform.kimi.ai/docs/guide/kimi-code-cli)
* [模型列表](https://platform.kimi.ai/docs/models)：现役与退役模型
