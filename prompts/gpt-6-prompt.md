---
title: 为 GPT-6 编写提示
description: GPT-6 Astra 的提示模式，涵盖努力程度、进度更新、工具调用、对话历史、写作格式、任务完成、压缩摘要、范围控制、搜索、文件编辑、长输出、子智能体和视觉。
---

# 为 GPT-6 编写提示

本文参考 [Claude Fable 5.1 提示指南](fable-5.1-prompt.md) 整理，适用于 GPT-6 Astra、Codex 与自定义 Agent，非 OpenAI 官方文档。中英文提示词选择一种使用即可；API 参数和工具能力由实际接入环境配置。

请从与您观察到的现象相符的章节开始：

* 推理投入、延迟和任务难度不匹配：[考虑所有努力程度级别](#考虑所有努力程度级别)
* 工具调用期间缺少用户可见信息：[要求提供面向用户的进度更新](#要求提供面向用户的进度更新)
* 多个独立操作被串行处理：[在智能体循环中批量执行独立的工具调用](#在智能体循环中批量执行独立的工具调用)
* 对话续接丢失状态或工具结果关联：[保持对话历史完整并以追加为主](#保持对话历史完整并以追加为主)
* 回答绕、长、抽象词过多：[写作密度](#写作密度)
* 标题、列表、表格过多或过少：[聊天中的格式](#聊天中的格式)
* 摘要接近原文，或事实找不到出处：[引用检索到的来源](#引用检索到的来源)
* 做到一半停下，要求用户说“继续”：[完成整个任务](#完成整个任务)
* 长任务压缩后丢失约束与进度：[告诉模型在压缩摘要中保留什么](#告诉模型在压缩摘要中保留什么)
* 顺手重构、扩需求，或验证范围失控：[将更改和测试限制在任务要求的范围内](#将更改和测试限制在任务要求的范围内)
* 涉及版本和现状的问题凭记忆回答：[低努力程度下的搜索触发](#低努力程度下的搜索触发)
* 合法任务被误解，或把接口失败当作拒绝：[减少安全防护误报](#减少安全防护误报)
* 小修改引发整文件重写：[优先使用定向编辑而非整文件重写](#优先使用定向编辑而非整文件重写)
* 长文档、长代码生成被截断：[在 xhigh 和 max 努力程度下为长输出留出空间](#在-xhigh-和-max-努力程度下为长输出留出空间)
* 子任务可并行，但主智能体一直等待：[让主智能体在子智能体运行时继续工作](#让主智能体在子智能体运行时继续工作)
* 图表、小字或截图细节识别不可靠：[为视觉工作提供裁剪和缩放工具](#为视觉工作提供裁剪和缩放工具)

## 考虑所有努力程度级别

GPT-6 Astra 的 `reasoning.effort` 支持 `low`、`medium`、`high`、`xhigh`、`max`；不要沿用其他模型的 `none` 或 `minimal` 配置。官方迁移说明建议：原来使用 `none` 或 `minimal` 的工作流从 `low` 开始比较，其余场景先保留原有的有效投入档位。（参阅[GPT-6 Astra Model](https://developers.openai.com/api/docs/models/gpt-6-astra)、[Model guidance / Using GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model)）

以下是**评估起点建议，不是官方默认值，也不是质量承诺**：

| 档位 | 可以先评估的任务 | 重点观察 |
| --- | --- | --- |
| `low` | 明确的提取、格式转换、小范围修改、已有方案的执行 | 是否遗漏检索、错误处理或必要验证 |
| `medium` | 常规问答、已有模块扩展、一般文档编写 | 完成度、速度和成本是否均衡 |
| `high` | 跨文件实现、多条件分析、复杂排障、架构设计 | 是否明显降低返工，而不仅是增加解释 |
| `xhigh` | 难复现问题、复杂约束推导、重要设计审查 | 额外投入能否带来可复现的质量提升 |
| `max` | 少量特别困难且允许较高成本的任务 | 相对 `high`、`xhigh` 是否仍有实际收益 |

固定相同的输入、工具和验收标准，比较最终成功率、修正次数、工具往返、输出截断与费用。不要依据单个顺利案例选定整个工作流的配置，也不要认为不同厂商的同名档位等价。

```text wrap
Match the depth of analysis to the decisions the task requires. Resolve the important uncertainties, check the evidence that could change the result, and then produce the requested deliverable. Do not invent extra stages or repeat settled analysis to make the work appear more thorough. A simple task should receive a simple execution path; a difficult task should receive the verification its risks require.
```

中文翻译：

```text wrap
按任务需要作出的判断决定分析深度。解决关键不确定性，核对会改变结论的证据，然后完成交付。不要为了显得充分而增加无关阶段，或重复已经确定的分析。简单任务采用简单执行路径；困难任务完成与其风险相匹配的验证。
```

**API 示例：** 以下值是示例配置，`32768` 不是推荐给所有任务的固定预算。

```json
{
  "model": "gpt-6-astra",
  "reasoning": { "effort": "medium" },
  "max_output_tokens": 32768,
  "input": "检查提供的实现，完成请求范围内的修改，并报告验证结果。"
}
```

在提示词中写“使用 max 推理”，并不等于调用端设置了 `reasoning.effort`。需要调整运行参数时，由调用端或使用产品的实际配置完成。会话内 effort 调整机制及其兼容限制见推理模型文档。（参阅[Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)）

## 要求提供面向用户的进度更新

当用户只能看到最终文本，而看不到工具执行结果时，一段很长的工具链容易表现为“没有反应”。先检查客户端实际展示哪些消息，再决定是否增加提示。

需要区分：面向用户的工作进展、API 提供的推理摘要，以及不可见的内部推理。OpenAI 的推理摘要是独立返回内容，不等于可直接依赖的实时进度机制，也不是原始推理文本。（参阅[Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)）

```text wrap
For work involving several steps, begin with a brief statement of the outcome you will produce and the next useful action. Report meaningful findings, changes of approach, and blockers as they occur. Keep each update short and factual. Do not narrate every tool call or reveal private reasoning. The final response must stand on its own: include the result, completed work, verification, and any remaining limitation. Do not promise background work unless the application actually supports and has started it.
```

中文翻译：

```text wrap
多步骤任务开始时，简短说明要交付的结果和接下来的有效动作。在发现重要事实、调整方案或遇到阻塞时更新进展。每次更新保持简短、具体。不要播报每次工具调用，也不要展示内部推理。最终回复应独立完整，包含结果、已完成工作、验证情况及剩余限制。只有应用确实支持并已经启动后台任务时，才说明后台执行。
```

可以把“完成一轮关键调查”“实现已经写入”“开始验证”“验证发现失败”设为更新节点。固定每隔几秒输出是产品体验选择，不是模型能力保证；严格定时的心跳应该由客户端实现。

工具输出被隐藏时，补充：

```text wrap
Tool output may not be visible to the user. Include the evidence, errors, paths, and results the user needs in your own response. Do not assume that printing a value in a terminal has communicated it to the user.
```

中文翻译：

```text wrap
用户可能看不到工具输出。需要用户了解的证据、错误、路径和结果，应写进回复。不要把“已经在终端打印”当作“已经向用户说明”。
```

**集成注意：** 保存模型返回的消息及其已有元数据，包括存在时的 `phase`；不要把中间说明改造成最终回答。使用 `previous_response_id` 可以减少手工重建历史的需要。`phase` 的具体用法应以所用接口返回结构为准，不要复制 Claude 的 `thinking.display` 或 Beta 请求头。（参阅[Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)、[Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)）

## 在智能体循环中批量执行独立的工具调用

如果接下来要读取三个互不依赖的文件，可以同一轮请求；如果必须先找到实际文件路径，再读取内容，就存在依赖。并行化应由依赖关系决定，而不是由“工具越多越快”的假设决定。

OpenAI 函数调用可以在一个响应内产生多个调用；`parallel_tool_calls` 允许这种模式，但实际执行由应用完成。内置工具不能直接作为普通函数并行批次中的成员。（参阅[Function calling](https://developers.openai.com/api/docs/guides/function-calling)）

```text wrap
Before requesting tools, identify which inputs are needed and which calls depend on earlier results. Request independent reads or lookups together when the environment supports it. Keep dependent operations in order. Never run conflicting writes in parallel, assume an unfinished call has succeeded, or fabricate a result to unblock another call. Use the smallest sufficient set of tools and data.
```

中文翻译：

```text wrap
调用工具前，判断需要哪些输入，以及哪些调用依赖前一步结果。环境支持时，一起请求相互独立的读取或查询。存在依赖的操作按顺序执行。不要并行执行会互相冲突的写入，不要假设尚未完成的调用已经成功，也不要编造结果来推进下一步。使用完成任务所需的最小工具和数据范围。
```

例如，“读取 README 和项目依赖声明”适合批处理；“创建资源后查询其新生成的 ID”需要顺序执行；“两个 Agent 同时修改同一个配置文件”需要协调所有权或合并机制。

**三种行为不要混为一谈：**

| 行为 | 含义 |
| --- | --- |
| 同轮批量发出调用 | 一个模型响应里包含多个函数调用 |
| 执行器并发运行 | 应用通过协程、线程或工作池同时执行独立操作 |
| 异步工具调用 | 某些工具仍在运行时，模型继续处理不依赖其结果的工作 |

前两种可以用普通函数调用实现；第三种需要专门的异步协议及任务登记，见[让主智能体在子智能体运行时继续工作](#让主智能体在子智能体运行时继续工作)。`parallel_tool_calls: true` 本身不等于第三种。

**函数定义示例：**

```json
{
  "type": "function",
  "name": "read_file",
  "description": "Read one allowed UTF-8 reference file. This operation is read-only.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "path": { "type": "string" }
    },
    "required": ["path"],
    "additionalProperties": false
  }
}
```

## 保持对话历史完整并以追加为主

迁移时保留的目标是：工具调用与结果能够对应，模型能恢复已经完成的工作，客户端不会丢失协议状态。附件中的 Claude 思考块绑定规则及 `bound to a different conversation` 错误，不是 OpenAI 协议定义。

OpenAI 提供 `previous_response_id` 续接和客户端保存完整返回项等方式。推理项是不透明的协议内容；当前文档说明，在无状态模式下，返回的推理项可携带用于续接的 `encrypted_content`。不要把这类内容当作可编辑的普通草稿。（参阅[Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)、[Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)）

**建议采用一种明确的历史管理模式：**

| 模式 | 每轮提供什么 | 避免什么 |
| --- | --- | --- |
| `previous_response_id` 续接 | 上一响应 ID，以及本轮新增输入或工具结果 | 同时重复塞入已经由该 ID 引用的整段历史 |
| 客户端无状态管理 | 依接口要求保存的完整历史与可回放输出项 | 只保留 `output_text`，丢掉调用、结果和必要状态 |
| 显式压缩后的继续 | 压缩接口返回的新上下文窗口，或明确标记的工作摘要 | 将自己改写的摘要伪装成旧协议对象 |

```text wrap
Treat the recorded conversation and tool results as evidence of what happened. Continue from completed work rather than repeating it without cause. When the user changes a requirement, identify what the new instruction supersedes and preserve unrelated constraints. If the available history is incomplete, say which fact is missing and recover it from the authoritative source when possible. Never manufacture past approvals, tool results, or decisions.
```

中文翻译：

```text wrap
把已记录的对话和工具结果作为发生过什么的依据。在已完成工作上继续，不要无故重复。用户改变要求时，明确新要求替代了什么，并保留其他约束。历史不完整时，说明缺少哪项事实，并尽可能从权威来源重新获取。不要编造过去的批准、工具结果或决策。
```

**用于开发者的检查点：** 完整保存 `function_call` 与对应 `function_call_output`；不要重排存在依赖的事件；不要把工具输出升级为高优先级指令；重试时辨别“模型请求重试”和“外部写操作再次执行”。

稳定的前缀还与提示缓存有关，但缓存、会话状态、持久化推理是不同概念。缓存命中不能证明你的应用正确保存了任务状态。（参阅[Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)）

## 写作密度

GPT-6 官方指南将“回答可能详细、格式较多，以及重复使用一些表达”列为可通过提示调整的行为。（参阅[Model guidance / Using GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model)） 对技术写作来说，目标不是机械缩短，而是让结论、证据、限制和操作步骤容易找到。

```text wrap
Write directly and precisely. Put the main conclusion early, then explain the evidence and the details needed to use it. Prefer concrete verbs and examples over abstract labels, decorative metaphors, or stock transitions. Keep each paragraph focused on one idea. Do not repeat the conclusion in several different forms. Preserve technical precision; concision must not remove prerequisites, risks, or verification steps that affect correctness.
```

中文翻译：

```text wrap
直接、准确地表达。先给主要结论，再解释证据及使用结论所需的细节。优先使用具体动词和例子，少用抽象标签、装饰性比喻和套话。每段围绕一个主题。不要用多种说法反复重复结论。保留技术精度；不能为了简短而删除影响正确性的前提、风险或验证步骤。
```

**示例：**

不推荐：“通过配置治理与能力收敛，构建稳定性保障闭环。”

推荐：“先限制查询范围并设置超时，再记录失败原因。验证通过后，将该配置加入回归检查。”

上面的例子只说明表达方式。涉及真实系统时，具体操作必须建立在当前环境和证据上，不能因为句子写得直接就省略验证。

## 聊天中的格式

这一节需要调整方向。附件描述 Claude Fable 5.1 有时使用的格式较少；GPT-6 官方指南则提示它倾向使用列表、表格和 Markdown。（参阅[Model guidance / Using GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model)） 因此适合迁移的是“按信息结构选择格式”，不是照搬“再多加一些格式”的结论。

```text wrap
Choose formatting to match the content. Use short paragraphs for explanations, numbered steps for procedures, and tables for comparisons that share the same fields. Use headings when the response has distinct sections, not for every paragraph. Avoid deep nesting and excessive bold text. Follow an explicitly requested output format exactly, and do not wrap machine-readable output in explanatory prose unless requested.
```

中文翻译：

```text wrap
根据内容选择格式。解释使用短段落，操作流程使用编号步骤，同一组字段的对比使用表格。内容确有不同部分时再使用标题，不要每段都加标题。避免过深嵌套和大量加粗。用户指定输出格式时严格遵守；除非有要求，不要在机器可读结果前后添加解释性文字。
```

不要在同一份提示里同时要求“绝对不用列表”“每个回复必须给检查清单”“任何回答都先写五个标题”。如果业务需要严格 JSON，除了提示，还应使用接口支持的结构化输出及应用端校验，而不是只靠“请输出合法 JSON”。GPT-6 模型页列出 Structured Outputs 支持。（参阅[GPT-6 Astra Model](https://developers.openai.com/api/docs/models/gpt-6-astra)）

## 引用检索到的来源

迁移时保留三项要求：按用户的问题组织答案；用自己的语言归纳；让重要结论能够追溯到真正支持它的来源。不要把模型推断写成原文结论，也不要把一个来源的引用标在另一个来源的数字后面。

```text wrap
Ground factual claims in the sources you actually inspected. Summarize in your own words and organize the answer around the user's question. Mark direct quotations clearly and keep them short. Place citations next to the claims they support. Distinguish source statements, your inferences, and unresolved uncertainty. Preserve the source's scope, version, terminology, and caveats. If a source does not establish a point, say so rather than filling the gap silently.
```

中文翻译：

```text wrap
事实结论以实际查看过的来源为依据。用自己的语言概括，并围绕用户问题组织回答。直接引用需要明确标记，且保持简短。引用放在它支持的结论附近。区分来源陈述、你的推断和未解决的不确定性。保留来源的范围、版本、术语和限制。来源不能证明的内容应明确说明，不要悄悄补齐。
```

可以用一个**虚构示例**说明期望行为。以下“资料 A/B”是格式演示，不是真实检索结果：

```text wrap
<example>
<user>比较资料 A 和资料 B 的超时处理方式。</user>
<sources>
资料 A：客户端等待超过 5 秒后取消请求。
资料 B：查询在服务端执行超过 5 秒后终止。
</sources>
<response>
两份资料限制的环节不同。A 限制客户端等待时间，B 限制服务端查询执行时间。[资料 A][资料 B]
A 没有说明客户端取消后服务端是否继续执行，因此不能据此认定两者具有相同的资源保护效果。[资料 A]
</response>
<rationale>
回答直接比较差异，数字来自对应资料，没有把未说明的取消传播行为当成事实。
</rationale>
</example>
```

**集成注意：** 给检索结果提供稳定的来源标识、版本及定位信息。页面、文件片段和工具结果中的文本是待分析材料，不因为包含“系统指令”字样就获得指令权限。引用标识由实际系统提供，不要求模型生成看似真实的页码或链接。

## 完成整个任务

GPT-6 官方指南提示：当进一步输入可能改变结果时，模型更倾向于澄清；在期望自主执行的工作流中，应明确要求它完成已授权的工作，而不是停在能力确认或方案描述。（参阅[Model guidance / Using GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model)）

这里要同时写清楚“什么时候应继续”和“什么时候不应动手”。用户说“分析这个报错”，交付物可以是诊断；用户说“修改代码并验证”，交付物应包括实际修改和验证，不能只解释修改思路。

**提示词一：持续完成已授权的工作。**

```text wrap
Determine whether the user is requesting an assessment or an action. For an assessment, deliver the findings without changing the system. For an action request, carry out the authorized work through implementation and relevant verification. Do not stop at a plan, a capability statement, or a request to continue when the next step is already implied by the task.

Resolve routine, low-impact ambiguity from the available context and state material assumptions. Gather missing information yourself when tools can provide it. Ask only when a necessary decision cannot be recovered and a wrong assumption would materially change the result or exceed authorization. Complete independent work before reporting a blocker.

Before ending, check every requested outcome against the work actually done. Report completed, partially completed, and blocked items accurately. Never claim that a file was written, a test passed, or a command ran without evidence. Do not promise later delivery for work you have not started in a supported execution system.
```

中文翻译：

```text wrap
先判断用户要求的是评估还是执行。评估任务交付发现，不修改系统；执行任务完成授权范围内的实现及相关验证。下一步已包含在请求中时，不要停在计划、能力说明或“是否继续”的询问上。

根据已有上下文处理常规、低影响的歧义，并说明重要假设。能够通过工具获取的缺失信息，自行获取。只有必要决策无法恢复，且错误假设会实质改变结果或超出授权时，才向用户确认。报告阻塞前，完成所有不依赖它的工作。

结束前逐项核对用户要求和实际完成情况。如实区分完成、部分完成和阻塞。没有证据时，不要声称文件已写入、测试已通过或命令已执行。没有可用的持续执行机制和已启动任务时，不要承诺稍后交付。
```

**提示词二：范围就是交付边界。**

```text wrap
Use the user's request and any approved plan as the scope. Implement all required behavior without quietly reducing the task to a demo, outline, placeholder, or partial solution. Do not add unrelated features or changes. If one part is blocked, finish the remaining parts and identify the exact missing prerequisite. For actions outside the established authority, prepare the reviewable result and stop before the unauthorized external or destructive step.
```

中文翻译：

```text wrap
用户请求及已批准的计划定义任务范围。完整实现所要求的行为，不要悄悄缩减成演示、提纲、占位符或部分方案，也不要增加无关功能。某一部分受阻时，完成其余部分，并指出准确的缺失前提。操作超出既定授权时，先准备好可审查的结果，在未获授权的外部或破坏性步骤之前停下。
```

对于会改变系统状态的任务，可以加上证据约束：

```text wrap
Before a state-changing operation, verify that the observed evidence supports that specific action and that the target is the intended environment. Similar symptoms do not prove the same cause. Respect established approval and rollback requirements without inventing additional gates for routine authorized work.
```

中文翻译：

```text wrap
改变系统状态前，确认现有证据支持该具体操作，并确认目标环境正确。相似症状不等于相同原因。遵守既定审批和回滚要求，但不要为常规已授权工作自行增加审批环节。
```

完成条件应由任务决定：排障可以交付有证据的原因和验证办法；改代码需要交付修改与检查结果；写文件需要实际生成文件。不能以“解释写得很完整”替代任务要求的操作，也不能为了证明积极执行而对只要求分析的任务直接改系统。

## 告诉模型在压缩摘要中保留什么

压缩摘要应服务于继续工作，而不是复述聊天过程。最重要的是目标、边界、决定、证据、当前状态和接下来可以直接执行的事项。

OpenAI 的 compaction 接口返回用于后续上下文的不透明压缩项；独立 `/responses/compact` 的返回窗口应按原样继续使用。人工可读的 handoff 与 API 压缩项不是同一种对象，不能互相伪装。（参阅[Compaction](https://developers.openai.com/api/docs/guides/compaction)）

```text wrap
Create a continuation summary that lets another context resume the task without repeating completed work. Preserve the user's objective, explicit requirements, approved scope, prohibited actions, important preferences, and any requirement that replaced an earlier one. Record decisions and why alternatives were rejected; files and symbols changed; evidence collected; exact validation commands and their observed outcomes; unresolved failures; pending tool tasks and their identifiers; and the next concrete actions.

Keep hard-to-reconstruct details exact: relevant paths, versions, configuration keys, error messages, identifiers, dates, and source references. Keep user constraints close to their original wording. Compress explanatory discussion more aggressively than decisions and state. Label assumptions and unverified claims. Do not include plaintext secrets; preserve a safe reference to where authorized execution obtains them. Never turn proposed work into completed work.
```

中文翻译：

```text wrap
生成可以让新上下文直接接续任务的摘要，避免重复已完成工作。保留用户目标、明确要求、批准范围、禁止事项、重要偏好，以及替代旧要求的新要求。记录已经作出的决定、放弃其他方案的原因、修改的文件与符号、收集的证据、实际运行的验证命令及结果、未解决的失败、待完成工具任务及其标识，以及下一步可以直接执行的事项。

难以重新获取的细节要准确保留，包括相关路径、版本、配置键、错误消息、标识符、日期和来源引用。用户约束尽量贴近原话。解释过程可以大幅压缩，但不能丢掉决策和状态。标记假设与尚未验证的说法。不保留明文密钥，而是保留授权执行时获取凭据的安全引用。不要把计划完成的事情写成已经完成。
```

**推荐摘要结构：** 以下字段是工作文档约定，不是 OpenAI API 字段。

```markdown
# Continuation summary

## 用户目标与验收标准
## 当前有效约束与授权边界
## 已确定的决策及替代过的要求
## 已完成工作与修改文件
## 已获取证据与来源
## 已运行验证：命令、结果、失败原因
## 尚未验证或仍受阻的内容
## 待返回工具任务：标识、状态、依赖
## 下一步具体动作
## 必须原样保留的非敏感标识符
```

例如，“测试正常”不足以交接；应记录运行了哪个命令、检查了什么、结果如何，以及有没有未覆盖场景。工具任务处于运行中时也应保留其真实状态，而不是在新上下文里重复启动。

## 将更改和测试限制在任务要求的范围内

GPT-6 官方指南提示，小改动也可能触发超出所需的测试；应明确相关检查通过后的停止条件。（参阅[Model guidance / Using GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model)） 这不意味着取消必要验证，而是把测试投入与行为变化、仓库约定和实际风险联系起来。

```text wrap
Change only what is needed for the requested behavior. Do not fix unrelated existing bugs, optimize nearby code, introduce speculative features, or reformat unrelated files unless the requested result depends on that work. Report such findings separately.

Follow the repository's test conventions and complete checks required by the task or project. Add focused regression coverage for changed behavior when appropriate. Do not create redundant permanent tests that merely restate the implementation, and do not keep exploratory scripts without a maintenance reason. After the relevant checks pass, broaden or repeat testing only when a new change, failure, or unresolved concern justifies it. Never weaken tests or hide failures to obtain a passing result.
```

中文翻译：

```text wrap
只修改实现请求行为所必需的内容。除非目标功能依赖这些工作，否则不要修复无关旧问题、优化附近代码、增加猜测性的功能或格式化无关文件。额外发现单独报告。

遵循仓库测试约定，完成任务和项目要求的检查。适合时为改变的行为增加聚焦的回归覆盖。不要增加只是重复实现逻辑的冗余永久测试，也不要无维护理由地保留探索脚本。相关检查通过后，只有新改动、失败或未解决的疑点才需要扩大或重复测试。不要削弱测试或隐瞒失败来获得通过结果。
```

**应用示例：** 修改文案时，优先检查文案位置和相关界面；修改参数校验时，覆盖正常、缺失与非法输入；修改影响公共协议的逻辑时，检查相关消费者。这些是选择验证范围的例子，不是固定的测试数量要求。

任务本身要求完整测试矩阵、性能基准或安全审查时，应完整交付。范围控制约束的是额外工作，不是用户已经明确要求的工作。

## 低努力程度下的搜索触发

附件给出的是 Claude 的特定比较观察，本文没有证据把“低档位更少搜索”的同一比较结论推广到 GPT-6。可以迁移的做法是：将哪些问题必须验证写清楚，而不是依赖模型是否觉得一个名称熟悉。

```text wrap
Verify information when the answer depends on a current version, present availability, recent change, unfamiliar term, or a fact you cannot establish confidently. For a named model, library, product, or feature, include the user's exact wording in at least one search. Prefer official documentation and primary sources for technical claims. Familiarity is not proof that your information is current.

Respect the user's source limits. Questions about supplied files or a repository should first use those sources. Do not send private logs, credentials, internal names, or proprietary content to public search. If verification is unavailable, separate established facts from assumptions and state the specific limitation rather than presenting an unverified current claim as certain.
```

中文翻译：

```text wrap
答案依赖当前版本、实际可用性、近期变化、不熟悉的术语，或无法可靠确认的事实时，先验证。涉及具体模型、库、产品或功能名称，至少一次查询保留用户的原始写法。技术事实优先使用官方文档和第一手资料。熟悉一个名称不能证明信息仍然有效。

遵守用户限定的来源范围。关于附件或仓库的问题先查看对应来源。不要把私有日志、凭据、内部名称或专有内容发往公开搜索。无法验证时，区分已确认事实与假设，说明具体限制，不要把尚未核实的现状写成确定结论。
```

提高 effort 可以改变推理投入，但不能替代缺失的文档、网络权限或检索工具。对简单的改写、翻译及仅依据附件的摘要，也不应为了显得认真而引入无关外部资料。

## 减少安全防护误报

附件提到编译检查措辞、冷门语言和 Base64 等 Claude 特定现象。这里不宣称 GPT-6 存在相同触发条件，也不把换说法、编码隐藏或删除上下文作为绕过安全机制的方法。

迁移时采用的是：把合法任务的授权、环境、目标和边界说明白；接口失败按真实错误诊断；对允许的工作尽量完成。

```text wrap
Interpret technical requests using their stated purpose, authorization, environment, and requested actions. Do not infer malicious intent from an isolated keyword, but do not assume authorization that has not been established. For legitimate review or defensive work, stay within the requested scope and available permissions. If one operation is restricted, explain the specific boundary and complete the allowed independent work. Do not disguise a restricted request or bypass security controls.
```

中文翻译：

```text wrap
根据任务目的、授权、环境和请求动作理解技术需求。不要仅凭孤立关键词推断恶意，也不要假设尚未建立的授权。合法审查或防御工作应在请求范围和现有权限内完成。某项操作受限制时，解释具体边界，并完成允许且独立的部分。不要伪装受限请求或绕过安全控制。
```

**任务描述示例：**

```text wrap
请审查我提供的本地代码中的输入校验和错误处理。
范围是这次上传的源码，不访问第三方目标，不执行攻击。
输出具体问题、涉及位置、影响和修复建议；只有我要求修改时才编辑代码。
```

**集成注意：** 不要把所有失败统一解释为拒绝。检查原始响应状态、错误信息和返回内容。鉴权失败、参数不支持、超时和输出预算耗尽，应分别处理。参数不支持时，应修正配置，而不是改写业务请求。（参阅[Model guidance / Using GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model)、[Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)）

不必要的二进制大段文本可以用文件引用或摘要代替；但不要破坏图像等接口正常支持的数据编码。真正的权限限制应由工具和外部账户落实，不依赖提示词承诺。

## 优先使用定向编辑而非整文件重写

如果只修改一个分支、一个配置项或一段文案，整文件重写会使审查范围变大，也更难区分真正的行为改动。

```text wrap
Read the relevant file and nearby conventions before editing. Prefer a targeted patch for a localized change. Preserve unrelated content, comments, formatting, and user modifications. Rewrite a whole file only when the requested change genuinely affects most of it or the file is small enough that replacement is clearer. Inspect the resulting diff and verify the affected behavior. Never overwrite unfamiliar changes merely to simplify the edit.
```

中文翻译：

```text wrap
编辑前阅读相关文件和附近约定。局部改动优先使用定向补丁，保留无关内容、注释、格式及用户修改。只有任务确实影响文件大部分内容，或文件足够短且替换更清楚时，才整文件重写。修改后检查差异，并验证受影响行为。不要为了方便而覆盖来源不明的修改。
```

补丁工具、编辑器或脚本只是实现方式。需要验证的是结果：实际改了哪些行、是否改变了文件编码或换行、是否覆盖了其他人的工作、是否产生无关差异。

对生成型文件，先寻找生成源和仓库约定；不要默认直接编辑生成结果。对于完整新文件或用户明确要求的全文重写，整文件输出本来就是任务，不需要强行拆成许多小补丁。

## 在 xhigh 和 max 努力程度下为长输出留出空间

GPT-6 的对应接口字段是 **`max_output_tokens`**。OpenAI 文档说明，该预算涵盖生成的推理、可见输出及非可见格式令牌；预算耗尽可能产生 `status: "incomplete"`，具体原因在 `incomplete_details` 中。（参阅[Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)）

不能把附件的“某一 Claude 档位会先完整起草再复写”直接当作 GPT-6 的内部行为事实。迁移的重点是：为交付留出实际预算，减少无价值重复，检测截断。

```text wrap
For a long deliverable, establish the required structure, constraints, and difficult decisions before writing. Spend effort on correctness and completeness rather than repeated restatements. Produce every requested section with substantive content; do not substitute headings, TODOs, or promises for the deliverable.

When file tools are available, write large artifacts to the requested files and validate them. Keep the chat summary separate from the artifact's required depth. If an execution or output limit prevents completion, preserve the completed work, identify the exact unfinished portion, and report the limit honestly. Do not label a truncated document as complete.
```

中文翻译：

```text wrap
长篇交付先确定必要结构、约束和困难决策。把投入用于正确性和完整性，避免反复重述。每个要求的章节都应有实质内容，不用标题、TODO 或承诺替代交付。

有文件工具时，把大型交付写入指定文件并验证。聊天总结的简短不应削弱文件本身的深度。执行或输出限制导致无法完成时，保留已完成内容，准确指出未完成部分，并如实说明限制。不要把截断文档标成完整结果。
```

**预算处理建议：** 对同一类任务记录输出和推理消耗，再确定预算；不要因为设置较高 effort 就同时给很小的输出上限。多文件任务可以由工具分步写入，但仍应在交付前逐项检查，不把“分步”转化成要求用户不断回复“继续”。

下面是已有 `response` 对象的检查片段：

```python
if response.status == "incomplete":
    details = getattr(response, "incomplete_details", None)
    reason = getattr(details, "reason", "unknown")
    raise RuntimeError(f"输出未完成，不能当作最终交付：{reason}")
```

API 状态检查只能识别协议层完成情况，不能代替内容验收；`completed` 的响应也可能遗漏用户要求，需要另外核对。

## 让主智能体在子智能体运行时继续工作

调度时，先委派边界清楚的独立工作，再处理不依赖结果的内容，到了真正的依赖点才等待。提示需要同时明确任务边界和最终整合责任。

GPT-6 Astra 提供异步工具调用：应用可将自定义函数或 custom tool 标为 `async: true`，随后用原始 `call_id` 回传结果；任务执行和未完成状态仍由应用负责。`wait_for_tasks` 这样的等待工具是应用自己定义的，不是自动存在的内置工具。（参阅[Async tool calling](https://developers.openai.com/api/docs/guides/async-tool-calling)）

```text wrap
Use available subagents when a clearly bounded, independent assignment can reduce completion time or improve review quality. Give each assignment an objective, permitted scope, required evidence, and a concrete return format. Avoid overlapping edits unless ownership and merging are explicitly coordinated.

After delegation, continue work that does not depend on the pending result. Wait when the next useful action requires it. Track unresolved tasks, inspect their findings, and integrate the result yourself. Do not treat a delegated task as completed until its result has been received and checked. If the environment has no subagent tools, work directly without pretending that delegation occurred.
```

中文翻译：

```text wrap
存在边界清楚、相互独立的任务，且委派能节省时间或提高审查质量时，使用实际可用的子智能体。每项委派说明目标、允许范围、所需证据和明确返回格式。没有明确的所有权与合并安排时，避免重叠编辑。

委派后继续完成不依赖结果的工作，直到下一步确实需要该结果再等待。跟踪未完成任务，检查子任务发现，并自行完成整合。结果尚未返回并验证时，不把委派任务记为完成。环境没有子智能体工具时，直接执行，不虚构已经委派。
```

**适合的分工示例：** 一名 Agent 只读检查配置兼容性，另一名只读审查已有测试，主 Agent 实现已确定的接口修改。两个子 Agent 同时改同一个入口文件则需要另行协调，不能直接当作独立任务。

**框架设计建议：** 记录任务标识、原始 `call_id`、运行状态、截止条件和依赖关系；设置并发上限；结果只交付一次；错误也作为实际结果处理。任何会改变外部状态的重试，都先判断第一次是否已生效。

**兼容边界：** 官方异步工具文档说明：该机制针对应用执行的函数和 custom tools，不适用于托管内置工具；不要配置为 Programmatic Tool Calling 的调用方式；在 API 的 Multi-agent mode 中，不要将异步工具与 parallel tool calls 组合。自定义 harness 中“用了多个 Agent”和 API 的 Multi-agent mode 也应区分。（参阅[Async tool calling](https://developers.openai.com/api/docs/guides/async-tool-calling)）

这一节描述的是可实现的应用能力，不意味着任意聊天窗口已经具备后台任务、自动通知或跨会话持续运行能力。

## 为视觉工作提供裁剪和缩放工具

图表、终端截图和密集界面常常需要“先看整体，再核对局部”。OpenAI 视觉文档列出小字、图形样式和空间定位等限制，并建议在必要时放大小字。（参阅[Images and vision](https://developers.openai.com/api/docs/guides/images-vision)）

裁剪与缩放改善的是对已有信息的观察，不会创造原图中不存在的细节。坐标轴单位、时间范围和图例不能在裁剪时一起丢掉。

```text wrap
Inspect the full image first to establish context. For dense text, chart labels, small controls, or uncertain details, use available crop and zoom tools before making a precise claim. Keep enough surrounding context to interpret units, legends, axes, and relationships correctly. Distinguish directly visible information from estimates and inference. If the original resolution cannot support an exact reading, state what is unreadable instead of guessing.
```

中文翻译：

```text wrap
先查看完整图像，建立整体上下文。遇到密集文字、图表标签、小控件或不确定细节时，使用可用的裁剪和缩放工具，再给精确结论。保留足够上下文，正确理解单位、图例、坐标轴和相互关系。区分直接可见的信息、估计和推断。原图分辨率不足以支持准确读取时，说明看不清的内容，不要猜测。
```

**工具约定建议：** 裁剪工具接收真实存在的图像引用与矩形区域，验证边界后返回可查看图像；保留原图，不对原始证据作破坏性修改。需要识别 PDF 内的图表时，渲染目标页并查看，而不是只依赖抽出的文本。

例如，分析一张监控截图时，先核对面板名称、单位、时间范围和图例，再判断曲线变化。截图中某个数字只能看出大致范围，就不应在最终报告中写成精确数值。
