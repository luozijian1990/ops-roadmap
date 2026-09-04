---
title: 为 Claude Fable 5.1 编写提示
url: https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1
description: Claude Fable 5.1 和 Claude Mythos 5.1 的行为差异与提示模式，涵盖努力程度、进度更新、工具调用批处理、对话历史、写作风格、格式、任务完成、压缩摘要、范围与测试覆盖、搜索触发、安全防护误报、文件编辑、长输出、子智能体和视觉。
---

有关该模型的能力、API 变更、定价和可用性，请参阅 [Claude Fable 5.1 的新特性](https://platform.claude.com/docs/zh-CN/models/fable-5-1/whats-new-fable-5-1)。有关适用于所有 Claude 模型的技巧，请参阅[提示最佳实践](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/claude-prompting-best-practices)。

您现有的 Claude Fable 5 提示无需修改即可在 Claude Fable 5.1 上良好运行，但有少数行为差异值得了解。请从与您观察到的现象相符的章节开始：

* 不确定应使用哪个 effort（努力程度）级别，或者延迟和成本高于任务所需：[考虑所有努力程度级别](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#consider-all-effort-levels)
* 工具调用之间几乎没有或完全没有文本：[要求提供面向用户的进度更新](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#ask-for-user-facing-progress-updates)
* 智能体循环中每轮只有一次工具调用：[在智能体循环中批量执行独立的工具调用](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#batch-independent-tool-calls-in-agent-loops)
* 请求失败并提示 `bound to a different conversation`，或者您的 harness（运行框架）在请求之间编辑了较早的轮次：[保持对话历史仅追加](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#keep-the-conversation-history-append-only)
* 行文冗长且密集：[写作密度](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#writing-density)
* 聊天回复的结构少于内容所需：[聊天中的格式](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#formatting-in-chat)
* 摘要复述了来源原文却未标注为引用：[引用检索到的来源](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#quoting-retrieved-sources)
* 工作尚未完成轮次就结束了，或者模型就您已经请求的工作征求许可：[完成整个任务](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#finish-the-whole-task)
* 客户端压缩摘要丢失了约束、决策或确切细节：[告诉模型在压缩摘要中保留什么](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#tell-the-model-what-to-preserve-in-compaction-summaries)
* 出现未请求的修复或扩展，或者提交的测试文件多于任务所需：[将更改和测试限制在任务要求的范围内](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#keep-changes-and-tests-to-what-the-task-asks-for)
* 在低努力程度下凭记忆回答而不进行搜索：[低努力程度下的搜索触发](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#search-triggering-at-low-effort)
* 良性的编码请求返回 `stop_reason: "refusal"`：[减少安全防护误报](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#reduce-safeguard-false-positives)
* 为小改动重写整个文件：[优先使用定向编辑而非整文件重写](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#prefer-targeted-edits-over-whole-file-rewrites)
* 在 `xhigh` 或 `max` 努力程度下，长篇交付物耗时很长或触及 `max_tokens`：[在 xhigh 和 max 努力程度下为长输出留出空间](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#leave-room-for-long-outputs-at-xhigh-and-max-effort)
* 主智能体在子智能体运行时闲置：[让主智能体在子智能体运行时继续工作](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#let-the-lead-agent-keep-working-while-subagents-run)
* 关于图表和密集图像的回答遗漏细节：[为视觉工作提供裁剪和缩放工具](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#give-vision-work-tools-to-crop-and-zoom)


## 考虑所有努力程度级别

从默认的 [effort](https://platform.claude.com/docs/zh-CN/build-with-claude/effort)（努力程度）级别 `high` 开始，然后针对您自己的评估测试其他级别（`low`、`medium`、`xhigh` 和 `max`）。在 Claude Fable 5.1 上，努力程度是在智能、延迟和成本之间进行权衡的主要控制手段。即使您已经在 Claude Fable 5 上做过一次扫描测试，也请重新运行：不同模型之间，相同的努力程度级别名称并不对应相同的思考量。

Claude Fable 5.1 相对于 Claude Fable 5 的能力提升在各个努力程度级别上都有体现，并且在较高设置下最为显著。在 `medium` 下，结果大致与 Claude Fable 5 相当但成本更低，因此在您的评估显示质量得以保持的地方，可以降至 `medium` 或 `low`。在 `low` 下，Claude Fable 5.1 在每任务成本上通常可与 Claude Opus 和 Claude Sonnet 模型相竞争，同时得分更高，因此凡是您原本会以更高努力程度级别运行较小模型的场景，都应将其纳入比较。

有两种与努力程度相关的行为有各自的章节：在 `low` 下，Claude Fable 5.1 调用搜索和检索工具的频率较低（请参阅[低努力程度下的搜索触发](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#search-triggering-at-low-effort)）；在 `xhigh` 和 `max` 下，它在撰写长篇交付物之前可能会思考更长时间（请参阅[在 xhigh 和 max 努力程度下为长输出留出空间](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#leave-room-for-long-outputs-at-xhigh-and-max-effort)）。

## 要求提供面向用户的进度更新

Claude Fable 5.1 的默认行为是，在长时间的工具调用轮次中，撰写的面向用户的更新比 Claude Fable 5 更少。在更高的努力程度和更长的工具链中，这一点会更加明显。用户会看到智能体一次沉默数分钟，或者最终消息只涵盖最后一步而非整个任务。

首先，检查您的客户端是否确实收到了进度更新。模型在工具调用之间的简短说明（它刚刚发现了什么以及接下来要做什么）会以[进度更新 `thinking` 块](https://platform.claude.com/docs/zh-CN/build-with-claude/thinking#progress-updates)的形式返回，而在默认的 `thinking.display` 值 `"omitted"` 下，这些块是空的。请设置 `display: "updates"`（测试版，需要 `thinking-display-updates-2026-08-18` 请求头）并将每个非空的 `thinking` 块渲染为一行状态信息，或者设置为 `"summarized"` 以便连同摘要化的推理一起接收它们。如果您没有请求它们，模型的更新可能根本没有到达您的用户。

其次，审查您的提示中是否有抑制叙述的指令。一些早期模型在工作时热衷于提供更新，这导致了诸如"将所有发现保留到最终回复中"之类的系统提示语句。在添加任何内容之前，请先删除这类语句。

如果您仍然希望获得更多更新，例如在结对编程或其他 human-in-the-loop（人在回路）工作中，请添加一行简短的系统提示，说明您何时希望模型输出面向用户的文本，以及每次更新应包含什么内容：

```text wrap
Before you start, say in a line what you're about to do; brief updates while you work help the user follow along. Close with a short recap that stands on its own — what you found, what you did, and what's next — so a reader who only sees the last message has the full picture.
```

中文翻译：

```text wrap
开始前，用一句话说清你准备做什么。工作过程中适时简短更新，让用户跟得上。最后用一段简短、单独看也完整的总结收尾：说明你发现了什么、做了什么、下一步是什么，让只看到最后一条消息的人也能了解全貌。
```


如果您的产品会折叠或隐藏工具输出，请告知模型。否则它可能会运行命令来向用户"展示"您的 UI 从不显示的输出。请通过[轮次作用域系统消息](https://platform.claude.com/docs/zh-CN/build-with-claude/mid-conversation-system-messages#turn-scoped-system-messages)（`clear_at: "next_user_message"`，测试版）传递该说明：

```text wrap
Only you see that command's output — the user's terminal shows at most a few lines of it. If the user needs to read any of it, put it in your reply.
```

中文翻译：

```text wrap
只有你能看到该命令的输出，用户的终端最多显示其中几行。用户需要了解其中内容时，请把它写进回复。
```


## 在智能体循环中批量执行独立的工具调用

Claude Fable 5.1 通常会按预期发出并行工具调用：当请求指明了要获取的多项内容时，它会并行发出这些调用。例外情况是编码和计算机使用循环，在这些循环中，接下来的独立调用是由任务隐含的而非明确请求的（自定义编码智能体、bash 加编辑器的 harness、计算机使用）：在这种情况下，它可能会每轮只发出一个调用。这不影响回答质量，但每多一轮都会消耗令牌、一次往返和实际耗时。在当前请求末尾加一句话的提醒即可解决：

```text wrap
First privately list what you need next; then request every item that doesn't depend on another's result in this one response.
```

中文翻译：

```text wrap
先在内部列出下一步需要的内容，再在这一轮一次请求所有彼此独立的项目。
```


每次您发回工具结果时，请将其作为[轮次作用域系统消息](https://platform.claude.com/docs/zh-CN/build-with-claude/mid-conversation-system-messages#turn-scoped-system-messages)追加在该用户消息之后：即 `messages` 中一个带有 `clear_at: "next_user_message"` 的 `role: "system"` 条目。一旦存在更晚的用户消息，API 就会清除较早的副本，因此模型只会读取最新的那一条。轮次作用域系统消息处于测试阶段，需要 [beta 请求头](https://platform.claude.com/docs/zh-CN/api/beta-headers) `mid-conversation-system-clear-at-2026-08-21`。如果不使用该测试版功能，请改为将这句话放在同一用户消息中 `tool_result` 块之后的一个文本块里。

每轮追加一份新的副本，并将较早的副本原封不动地保留在原处，逐字节一致。它们会留在数组中，但一旦被清除，模型就看不到它们，也不会消耗输入令牌。删除或重写它们属于对较早轮次的编辑：这会从该点起重新开始[提示缓存](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-caching)，并使其后的思考块失效（请参阅[保持对话历史仅追加](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#keep-the-conversation-history-append-only)）。

以下循环展示了这种放置方式。每个助手轮次都按返回时的原样发回，每个用户轮次只携带工具结果，其后跟随一份新的轮次作用域提醒副本。

```python
  import anthropic
  from anthropic.types.beta import (
      BetaMessageParam,
      BetaToolParam,
      BetaToolResultBlockParam,
  )

  client = anthropic.Anthropic()

  BATCH_NUDGE = (
      "First privately list what you need next; then request every item "
      "that doesn't depend on another's result in this one response."
  )

    # In-memory files stand in for a working directory so the sample runs anywhere

  FILES = {
      "pyproject.toml": """\
  [project]
  name = "demo"
  version = "0.1.0"
  description = "Demo project for the batching example"
  """,
      "README.md": """\

    # demo

  A small demo project. Run `demo --help` for usage.
  """,
  }
  tools: list[BetaToolParam] = [
      {
          "name": "read_file",
          "description": "Read a UTF-8 text file from the working directory.",
          "input_schema": {
              "type": "object",
              "properties": {"path": {"type": "string"}},
              "required": ["path"],
          },
      }
  ]
  messages: list[BetaMessageParam] = [
      {"role": "user", "content": "Summarize pyproject.toml and README.md."}
  ]

  while True:
      response = client.beta.messages.create(
          model="claude-fable-5-1",
          max_tokens=16000,
          betas=["mid-conversation-system-clear-at-2026-08-21"],
          tools=tools,
          messages=messages,
      )
      # Append the assistant turn exactly as returned, thinking blocks included.
      messages.append({"role": "assistant", "content": response.content})
      if response.stop_reason != "tool_use":
          break
      tool_results: list[BetaToolResultBlockParam] = []
      for block in response.content:
          if block.type == "tool_use":
              raw_path = block.input.get("path")
              path = raw_path if isinstance(raw_path, str) else ""
              if path in FILES:
                  tool_results.append(
                      {
                          "type": "tool_result",
                          "tool_use_id": block.id,
                          "content": FILES[path],
                      }
                  )
              else:
                  tool_results.append(
                      {
                          "type": "tool_result",
                          "tool_use_id": block.id,
                          "content": f"File not found: {path}",
                          "is_error": True,
                      }
                  )
      # Send the tool results as the user turn, then a fresh copy of the nudge as a
      # turn-scoped system message. Leave earlier copies in place: the API clears them,
      # so the model sees only the newest one.
      messages.append({"role": "user", "content": tool_results})
      messages.append(
          {"role": "system", "content": BATCH_NUDGE, "clear_at": "next_user_message"}
      )

  print(next((block.text for block in response.content if block.type == "text"), ""))

  ```

  ```typescript TypeScript
  import Anthropic from "@anthropic-ai/sdk";

  const client = new Anthropic();

  const BATCH_NUDGE =
    "First privately list what you need next; then request every item " +
    "that doesn't depend on another's result in this one response.";
  // In-memory files stand in for a working directory so the sample runs anywhere.
  const FILES = new Map<string, string>([
    [
      "pyproject.toml",
      `[project]
  name = "demo"
  version = "0.1.0"
  description = "Demo project for the batching example"
  `,
    ],
    [
      "README.md",
      `# demo

  A small demo project. Run \`demo --help\` for usage.
  `,
    ],
  ]);
  const tools: Anthropic.Beta.Messages.BetaTool[] = [
    {
      name: "read_file",
      description: "Read a UTF-8 text file from the working directory.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  ];
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: "user", content: "Summarize pyproject.toml and README.md." },
  ];

  let response: Anthropic.Beta.Messages.BetaMessage;
  while (true) {
    response = await client.beta.messages.create({
      model: "claude-fable-5-1",
      max_tokens: 16000,
      betas: ["mid-conversation-system-clear-at-2026-08-21"],
      tools,
      messages,
    });
    // Append the assistant turn exactly as returned, thinking blocks included.
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "tool_use") {
      break;
    }
    const toolResults: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") {
        continue;
      }
      const { input } = block;
      const path =
        typeof input === "object" &&
        input !== null &&
        "path" in input &&
        typeof input.path === "string"
          ? input.path
          : "";
      const text = FILES.get(path);
      if (text === undefined) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `File not found: ${path}`,
          is_error: true,
        });
        continue;
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: text,
      });
    }
    // Send the tool results as the user turn, then a fresh copy of the nudge as a
    // turn-scoped system message. Leave earlier copies in place: the API clears them,
    // so the model sees only the newest one.
    messages.push({ role: "user", content: toolResults });
    messages.push({
      role: "system",
      content: BATCH_NUDGE,
      clear_at: "next_user_message",
    });
  }

  const finalText = response.content.find((block) => block.type === "text");
  console.log(finalText?.text ?? "");
  ```

  ```csharp C#
  using System.Text.Json;
  using Anthropic;
  using Anthropic.Models.Beta.Messages;

  AnthropicClient client = new();

  const string BatchNudge =
      "First privately list what you need next; then request every item "
      + "that doesn't depend on another's result in this one response.";

  // In-memory files stand in for a working directory so the sample runs anywhere.
  Dictionary<string, string> files = new()
  {
      ["pyproject.toml"] = """
          [project]
          name = "demo"
          version = "0.1.0"
          description = "Demo project for the batching example"
          """,
      ["README.md"] = """
          # demo

          A small demo project. Run `demo --help` for usage.
          """,
  };

  List<BetaToolUnion> tools =
  [
      new BetaTool
      {
          Name = "read_file",
          Description = "Read a UTF-8 text file from the working directory.",
          InputSchema = new InputSchema
          {
              Properties = new Dictionary<string, JsonElement>
              {
                  ["path"] = JsonSerializer.SerializeToElement(new { type = "string" }),
              },
              Required = ["path"],
          },
      },
  ];

  List<BetaMessageParam> messages =
  [
      new() { Role = Role.User, Content = "Summarize pyproject.toml and README.md." },
  ];

  BetaMessage response;
  while (true)
  {
      response = await client.Beta.Messages.Create(new MessageCreateParams
      {
          Model = "claude-fable-5-1",
          MaxTokens = 16000,
          Betas = ["mid-conversation-system-clear-at-2026-08-21"],
          Tools = tools,
          Messages = messages,
      });
      // Append the assistant turn exactly as returned, thinking blocks included.
      messages.Add(new()
      {
          Role = Role.Assistant,
          Content = response.Content.Select(block => new BetaContentBlockParam(block.Json)).ToList(),
      });
      if (response.StopReason != BetaStopReason.ToolUse)
      {
          break;
      }
      List<BetaContentBlockParam> toolResults = [];
      foreach (var block in response.Content)
      {
          if (block.TryPickToolUse(out var toolUse))
          {
              var path = toolUse.Input.TryGetValue("path", out var pathValue)
                  && pathValue.ValueKind == JsonValueKind.String
                  ? pathValue.GetString()!
                  : "";
              if (files.TryGetValue(path, out var fileText))
              {
                  toolResults.Add(new BetaToolResultBlockParam { ToolUseID = toolUse.ID, Content = fileText });
              }
              else
              {
                  toolResults.Add(new BetaToolResultBlockParam
                  {
                      ToolUseID = toolUse.ID,
                      Content = $"File not found: {path}",
                      IsError = true,
                  });
              }
          }
      }
      // Send the tool results as the user turn, then a fresh copy of the nudge as a
      // turn-scoped system message. Leave earlier copies in place: the API clears them,
      // so the model sees only the newest one.
      messages.Add(new() { Role = Role.User, Content = toolResults });
      messages.Add(new()
      {
          Role = Role.System,
          Content = BatchNudge,
          ClearAt = ClearAt.NextUserMessage,
      });
  }

  foreach (var block in response.Content)
  {
      if (block.TryPickText(out var text))
      {
          Console.WriteLine(text.Text);
          break;
      }
  }
  ```

  ```go Go
  package main

  import (
   "context"
   "encoding/json"
   "fmt"
   "log"

   "github.com/anthropics/anthropic-sdk-go"
  )

  const batchNudge = "First privately list what you need next; then request every item " +
   "that doesn't depend on another's result in this one response."

  // In-memory files stand in for a working directory so the sample runs anywhere.
  var files = map[string]string{
   "pyproject.toml": `[project]
  name = "demo"
  version = "0.1.0"
  description = "Demo project for the batching example"
  `,
   "README.md": `# demo

  A small demo project. Run "demo --help" for usage.
  `,
  }

  func main() {
   client := anthropic.NewClient()
   ctx := context.Background()

   tools := []anthropic.BetaToolUnionParam{
    {OfTool: &anthropic.BetaToolParam{
     Name:        "read_file",
     Description: anthropic.String("Read a UTF-8 text file from the working directory."),
     InputSchema: anthropic.BetaToolInputSchemaParam{
      Properties: map[string]any{
       "path": map[string]any{"type": "string"},
      },
      Required: []string{"path"},
     },
    }},
   }
   messages := []anthropic.BetaMessageParam{
    anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock("Summarize pyproject.toml and README.md.")),
   }

   var response *anthropic.BetaMessage
   for {
    var err error
    response, err = client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
     Model:     "claude-fable-5-1",
     MaxTokens: 16000,
     Betas:     []anthropic.AnthropicBeta{"mid-conversation-system-clear-at-2026-08-21"},
     Tools:     tools,
     Messages:  messages,
    })
    if err != nil {
     log.Fatal(err)
    }
    // Append the assistant turn exactly as returned, thinking blocks included.
    messages = append(messages, response.ToParam())
    if response.StopReason != anthropic.BetaStopReasonToolUse {
     break
    }
    var toolResults []anthropic.BetaContentBlockParamUnion
    for _, block := range response.Content {
     toolUse, ok := block.AsAny().(anthropic.BetaToolUseBlock)
     if !ok {
      continue
     }
     var input struct {
      Path string `json:"path"`
     }
     // A missing or non-string path leaves input.Path empty, which takes the error-result branch.
     if err := json.Unmarshal([]byte(toolUse.JSON.Input.Raw()), &input); err != nil {
      input.Path = ""
     }
     text, found := files[input.Path]
     if !found {
      text = "File not found: " + input.Path
     }
     toolResults = append(toolResults, anthropic.NewBetaToolResultBlock(toolUse.ID, text, !found))
    }
    // Send the tool results as the user turn, then a fresh copy of the nudge as a
    // turn-scoped system message. Leave earlier copies in place: the API clears them,
    // so the model sees only the newest one.
    messages = append(messages, anthropic.NewBetaUserMessage(toolResults...))
    messages = append(messages, anthropic.BetaMessageParam{
     Role:    anthropic.BetaMessageParamRoleSystem,
     Content: []anthropic.BetaContentBlockParamUnion{anthropic.NewBetaTextBlock(batchNudge)},
     ClearAt: anthropic.BetaMessageParamClearAtNextUserMessage,
    })
   }

   for _, block := range response.Content {
    if textBlock, ok := block.AsAny().(anthropic.BetaTextBlock); ok {
     fmt.Println(textBlock.Text)
     break
    }
   }
  }
  ```

  ```java Java
  import com.anthropic.client.AnthropicClient;
  import com.anthropic.client.okhttp.AnthropicOkHttpClient;
  import com.anthropic.core.JsonValue;
  import com.anthropic.models.beta.messages.BetaContentBlockParam;
  import com.anthropic.models.beta.messages.BetaMessage;
  import com.anthropic.models.beta.messages.BetaMessageParam;
  import com.anthropic.models.beta.messages.BetaStopReason;
  import com.anthropic.models.beta.messages.BetaTool;
  import com.anthropic.models.beta.messages.BetaTool.InputSchema;
  import com.anthropic.models.beta.messages.BetaToolResultBlockParam;
  import com.anthropic.models.beta.messages.BetaToolUseBlock;
  import com.anthropic.models.beta.messages.MessageCreateParams;

  static final String BATCH_NUDGE =
      "First privately list what you need next; then request every item "
          + "that doesn't depend on another's result in this one response.";

  // In-memory files stand in for a working directory so the sample runs anywhere.
  static final Map<String, String> FILES = Map.of(
      "pyproject.toml", """
          [project]
          name = "demo"
          version = "0.1.0"
          description = "Demo project for the batching example"
          """,
      "README.md", """
          # demo

          A small demo project. Run `demo --help` for usage.
          """);

  void main() {
      AnthropicClient client = AnthropicOkHttpClient.fromEnv();

      BetaTool readFileTool = BetaTool.builder()
          .name("read_file")
          .description("Read a UTF-8 text file from the working directory.")
          .inputSchema(InputSchema.builder()
              .properties(JsonValue.from(Map.of("path", Map.of("type", "string"))))
              .required(List.of("path"))
              .build())
          .build();
      List<BetaMessageParam> messages = new ArrayList<>();
      messages.add(BetaMessageParam.builder()
          .role(BetaMessageParam.Role.USER)
          .content("Summarize pyproject.toml and README.md.")
          .build());

      BetaMessage response;
      while (true) {
          response = client.beta().messages().create(MessageCreateParams.builder()
              .model("claude-fable-5-1")
              .maxTokens(16000)
              .addBeta("mid-conversation-system-clear-at-2026-08-21")
              .addTool(readFileTool)
              .messages(messages)
              .build());
          // Append the assistant turn exactly as returned, thinking blocks included.
          messages.add(response.toParam());
          boolean requestedTools = response.stopReason()
              .map(BetaStopReason.TOOL_USE::equals)
              .orElse(false);
          if (!requestedTools) {
              break;
          }
          List<BetaToolUseBlock> toolUses = response.content().stream()
              .flatMap(block -> block.toolUse().stream())
              .toList();
          List<BetaContentBlockParam> toolResults = new ArrayList<>();
          for (BetaToolUseBlock toolUse : toolUses) {
              Map<String, JsonValue> input =
                  (Map<String, JsonValue>) toolUse._input().asObject().orElseThrow();
              JsonValue pathValue = input.get("path");
              String path = pathValue != null && pathValue.asString().isPresent()
                  ? pathValue.asStringOrThrow()
                  : "";
              String fileText = FILES.get(path);
              BetaToolResultBlockParam.Builder result = BetaToolResultBlockParam.builder()
                  .toolUseId(toolUse.id());
              if (fileText != null) {
                  result.content(fileText);
              } else {
                  result.content("File not found: " + path).isError(true);
              }
              toolResults.add(BetaContentBlockParam.ofToolResult(result.build()));
          }
          // Send the tool results as the user turn, then a fresh copy of the nudge as a
          // turn-scoped system message. Leave earlier copies in place: the API clears them,
          // so the model sees only the newest one.
          messages.add(BetaMessageParam.builder()
              .role(BetaMessageParam.Role.USER)
              .contentOfBetaContentBlockParams(toolResults)
              .build());
          messages.add(BetaMessageParam.builder()
              .role(BetaMessageParam.Role.SYSTEM)
              .content(BATCH_NUDGE)
              .clearAt(BetaMessageParam.ClearAt.NEXT_USER_MESSAGE)
              .build());
      }

      String finalText = response.content().stream()
          .flatMap(block -> block.text().stream())
          .map(textBlock -> textBlock.text())
          .findFirst()
          .orElse("");
      IO.println(finalText);
  }
  ```

  ```php PHP
  <?php

  use Anthropic\Beta\Messages\BetaStopReason;
  use Anthropic\Client;

  $client = new Client();

  const BATCH_NUDGE = 'First privately list what you need next; then request every item '
      . "that doesn't depend on another's result in this one response.";
  // In-memory files stand in for a working directory so the sample runs anywhere.
  const FILES = [
      'pyproject.toml' => <<<'TOML'
          [project]
          name = "demo"
          version = "0.1.0"
          description = "Demo project for the batching example"
          TOML,
      'README.md' => <<<'MD'
          # demo

          A small demo project. Run `demo --help` for usage.
          MD,
  ];
  $tools = [
      [
          'name' => 'read_file',
          'description' => 'Read a UTF-8 text file from the working directory.',
          'input_schema' => [
              'type' => 'object',
              'properties' => ['path' => ['type' => 'string']],
              'required' => ['path'],
          ],
      ],
  ];
  $messages = [
      ['role' => 'user', 'content' => 'Summarize pyproject.toml and README.md.'],
  ];

  while (true) {
      $response = $client->beta->messages->create(
          model: 'claude-fable-5-1',
          maxTokens: 16000,
          betas: ['mid-conversation-system-clear-at-2026-08-21'],
          tools: $tools,
          messages: $messages,
      );
      // Append the assistant turn exactly as returned, thinking blocks included.
      $messages[] = ['role' => 'assistant', 'content' => $response->content];
      if ($response->stopReason !== BetaStopReason::TOOL_USE->value) {
          break;
      }
      $toolResults = [];
      foreach ($response->content as $block) {
          if ($block->type === 'tool_use') {
              $path = is_string($block->input['path'] ?? null) ? $block->input['path'] : '';
              if (array_key_exists($path, FILES)) {
                  $toolResults[] = [
                      'type' => 'tool_result',
                      'tool_use_id' => $block->id,
                      'content' => FILES[$path],
                  ];
              } else {
                  $toolResults[] = [
                      'type' => 'tool_result',
                      'tool_use_id' => $block->id,
                      'content' => "File not found: {$path}",
                      'is_error' => true,
                  ];
              }
          }
      }
      // Send the tool results as the user turn, then a fresh copy of the nudge as a
      // turn-scoped system message. Leave earlier copies in place: the API clears them,
      // so the model sees only the newest one.
      $messages[] = ['role' => 'user', 'content' => $toolResults];
      $messages[] = [
          'role' => 'system',
          'content' => BATCH_NUDGE,
          'clear_at' => 'next_user_message',
      ];
  }

  $textBlock = array_find($response->content, fn ($block) => $block->type === 'text');
  echo $textBlock?->text ?? '', PHP_EOL;
  ```

  ```ruby Ruby
  require "anthropic"

  client = Anthropic::Client.new

  BATCH_NUDGE =
    "First privately list what you need next; then request every item " \
    "that doesn't depend on another's result in this one response."
  # 内存中的文件充当工作目录，使示例可在任何地方运行。
  FILES = {
    "pyproject.toml" => <<~TOML,
      [project]
      name = "demo"
      version = "0.1.0"
      description = "Demo project for the batching example"
    TOML
    "README.md" => <<~MD
      # demo

      A small demo project. Run `demo --help` for usage.
    MD
  }
  tools = [
    {
      name: "read_file",
      description: "Read a UTF-8 text file from the working directory.",
      input_schema: {
        type: "object",
        properties: {path: {type: "string"}},
        required: ["path"]
      }
    }
  ]
  messages = [{role: "user", content: "Summarize pyproject.toml and README.md."}]

  response = nil
  loop do
    response = client.beta.messages.create(
      model: "claude-fable-5-1",
      max_tokens: 16000,
      betas: ["mid-conversation-system-clear-at-2026-08-21"],
      tools: tools,
      messages: messages
    )
    # 按返回的原样追加 assistant 轮次，包括思考块。
    messages << {role: "assistant", content: response.content}
    break unless response.stop_reason == :tool_use

    tool_results = response.content.filter_map do |block|
      next unless block.type == :tool_use

      path = block.input[:path]
      if FILES.key?(path)
        {type: "tool_result", tool_use_id: block.id, content: FILES[path]}
      else
        {
          type: "tool_result",
          tool_use_id: block.id,
          content: "File not found: #{path}",
          is_error: true
        }
      end
    end
    # 将工具结果作为 user 轮次发送，然后将提示的新副本作为
    # 轮次范围的系统消息发送。保留先前的副本：API 会清除它们，
    # 因此模型只会看到最新的一个。
    messages << {role: "user", content: tool_results}
    messages << {role: "system", content: BATCH_NUDGE, clear_at: "next_user_message"}
  end

  puts response.content.find { it.type == :text }&.text
  ```

</CodeGroup>

## 保持对话历史仅追加

将每个助手轮次按 API 返回时的原样追加到历史中（包括思考块），并且不要在请求之间编辑较早的轮次。对于 2026 年 8 月 31 日或之后创建的新账户，Claude Fable 5.1 的思考块[仅在生成它们的那个确切对话中](https://platform.claude.com/docs/zh-CN/build-with-claude/thinking#preserved-in-conversation)有效：如果某个请求在其前缀（系统提示、工具列表或任何较早的消息）发生变化后重放思考块，则会返回 400；或者，如果您设置了 `thinking.block_binding.prefix_mismatch_behavior: "drop_block"`（测试版，需要 `thinking-binding-controls-2026-08-01` 请求头），则会丢弃受影响的块。预计未来的模型将对所有账户强制执行此检查，因此即使您的账户目前未被强制执行，也请现在就采用这种模式。

会触发该检查的历史编辑，与会重新开始[提示缓存](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-caching)的编辑是同一类：注入和移除每轮提醒、就地摘要较早的轮次，或在会话中途更改系统提示。请将每轮提醒作为[轮次作用域系统消息](https://platform.claude.com/docs/zh-CN/build-with-claude/mid-conversation-system-messages#turn-scoped-system-messages)发送，使用[对话中途系统消息](https://platform.claude.com/docs/zh-CN/build-with-claude/mid-conversation-system-messages)来更改指令或工具，而不是重写 `system` 或 `tools`，并让服务端[压缩](https://platform.claude.com/docs/zh-CN/build-with-claude/compaction)或[上下文编辑](https://platform.claude.com/docs/zh-CN/build-with-claude/context-editing)来完成任何裁剪。如果您在客户端进行压缩，最简单的形式是用一条摘要消息加上新的用户轮次替换整个历史，其他内容一概不重放：没有思考块被带过来，因此不会有任何失败，模型会在压缩后的对话上重新思考（请参阅[客户端自定义压缩](https://platform.claude.com/docs/zh-CN/build-with-claude/preserved-thinking#custom-compaction-on-the-client)）。由于缓存读取现在更便宜了（请参阅[定价](https://platform.claude.com/docs/zh-CN/models/fable-5-1/whats-new-fable-5-1#pricing)），在 Claude Fable 5.1 上，为节省成本而提前压缩可能不再是正确的成本与智能权衡，因此请尝试更晚的压缩点。

要找出您的 harness 已经在进行的编辑，请使用 `prefix_mismatch_behavior: "drop_block"` 运行一次会话并记录 `input_transformations`，如[如何判断您的集成是否受影响](https://platform.claude.com/docs/zh-CN/build-with-claude/preserved-thinking#how-to-tell-whether-your-integration-is-impacted)中所述；或者捕获它在几个正常轮次中发送的确切请求，并确认连续请求在追加的轮次之前逐字节相同。

## 写作密度

Claude Fable 5.1 的写作总体上比早期 Claude 模型更上一层楼，套话更少，未加解释的术语也更少。不过在某些情况下，它的行文比 Claude Fable 5 更密集：句子更长，段落分隔更少。一条定义了这种反模式（矫饰文风）的指令会有帮助。请将其添加到用户消息（首选）或系统提示中：

```text wrap
Mannered prose substitutes metaphor and flourish for direct statement. Instead of "a parameter worth varying," the mannered writer produces "a dial worth turning." Instead of "this point still matters," they write "this point earns its keep." The phrases exist to display the writer, not to convey the idea, and readers can tell. That is why mannered prose irritates: it makes the reader work harder so the writer can perform. It is also imprecise. Metaphors drag in connotations the writer did not choose and cannot control. The fix is to say what you mean. When a literal phrase is available, use it.
```

中文翻译：

```text wrap
矫饰文风用隐喻和华丽辞藻替代直说。比如，不说“值得调整的参数”，偏要说“值得拨动的旋钮”；不说“这一点仍然重要”，却说“这一点还在发挥作用”。这些说法不是为了把意思讲清楚，而是为了显得作者会写，读者一眼就能看出来。矫饰文风惹人厌，是因为作者忙着表演，却把理解的负担推给读者。它还不准确：隐喻会带来作者没选、也控制不了的联想。改法很简单，把想说的直接说出来；有现成的字面表达，就用字面表达。
```


简短版本通常也有效：

```text wrap
Please remove all mannered prose.
```

中文翻译：

```text wrap
请把文字写得自然些，去掉矫揉造作的表达。
```


## 聊天中的格式

早期模型在聊天中过度使用项目符号和粗体，许多提示中带有为抑制这一点而编写的反格式化规则。Claude Fable 5.1 则倾向于另一个方向：它较少使用粗体，也不太会使用标题、列表或引号。如果您的提示包含反格式化的表述，请将其删除，或替换为一条说明何时适合使用特定格式的规则，例如：

```text wrap
Use lists and bullet points when asked to, or when the content is multifaceted enough that they help with clarity. If the person explicitly requests minimal formatting, always format your responses without bullet points, headers, lists, or bold emphasis, as requested. In conversational, personal, or emotional exchanges, keep to plain prose.
```

中文翻译：

```text wrap
对方要求使用列表时，或内容较多、列表有助于理清结构时，使用列表和项目符号。对方明确要求少用格式时，就按要求回复，不用项目符号、标题、列表或粗体。聊天、私人交流或表达情绪时，使用普通段落。
```


## 引用检索到的来源

在摘要文档时，Claude Fable 5.1 比 Claude Fable 5 更有可能复述来源文本的段落而不将其标注为引用。要解决这个问题，请在系统提示中添加一个完整的正确回复示例：用户的请求、回复，以及一句解释该回复为何正确的话。

```text wrap
<example>
<user>look up how the Riverton Ledger and the Coast Dispatch each covered the Harbor Bridge closure and compare their reporting</user>
<response>
[web_search: Harbor Bridge closure Riverton Ledger]
[web_search: Harbor Bridge closure Coast Dispatch]
Both outlets agree on the basics: the bridge closed on March 3 after inspectors found cracked welds, and the state expects repairs to take about eight months. Where they differ is emphasis. The Ledger treats it as a local-economy story. The Dispatch frames it as a funding failure; its editorial calls the closure "entirely foreseeable." Read together, the Ledger explains who is affected now and the Dispatch explains how it came to this — neither account alone gives the whole picture.
</response>
<rationale>CORRECT: The response is organized around where the two outlets agree and differ, not as a walk through either article. Each outlet's reporting is conveyed in one or two sentences of the assistant's own indirect speech. One short marked phrase from one source; every other claim is reworded. The response is still specific and complete.</rationale>
</example>
```

中文翻译：

```text wrap
<example>
<user>查找 Riverton Ledger 和 Coast Dispatch 分别如何报道 Harbor Bridge 的关闭，并比较两者的报道</user>
<response>
[web_search: Harbor Bridge closure Riverton Ledger]
[web_search: Harbor Bridge closure Coast Dispatch]
两家媒体报道的基本事实一致：大桥在 3 月 3 日关闭，原因是检查人员发现焊缝开裂；州政府预计修复需要约八个月。但侧重点不同：Ledger 把它当作地方经济新闻，Dispatch 则着眼于资金问题；该报社论称封桥“完全可以预见”。两篇报道合起来看，Ledger 说明眼下谁受影响，Dispatch 解释事情为何走到这一步；单独看任何一篇都不完整。
</response>
<rationale>正确：回复按两家媒体报道的共同点和差异组织，而不是逐篇复述。每家媒体用一两句助手自己的间接引语概括。只保留一处带标记的简短原文，其余内容全部改写。回复依然具体完整。</rationale>
</example>
```


请将两行 `[web_search: ...]` 替换为您自己工具的名称，以便模型将它们理解为模板化的工具输出，而不是要原样输出的字面文本。

## 完成整个任务

Claude Fable 5.1 无需太多方法论上的指导就能执行非常长的任务，尤其是在目标明确的情况下。不过，在复杂的异步工作负载上，请提醒它不要在工作完成之前结束轮次。如果没有这种提醒，模型有时会描述它接下来要做什么而不是去做（"接下来，我将……"），或者停下来为原始请求已经涵盖的步骤征求许可（"我要应用这个吗？"）。用户不得不回复"继续"或"去做吧"，这适合结对编程和其他人在回路的工作，但没有发挥模型完整的长程能力。

两处系统提示补充共同缓解了这一问题。请两者都应用。如果您需要限制提示长度，只使用第一处即可，它保留了大部分效果。第一处告诉模型不要就已请求的工作提问，并执行它已声明的后续步骤：

```text wrap
You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task, so asking 'Want me to…?' or 'Shall I…?' will block the work. For reversible actions that follow from the original request, proceed without asking. Stop only for destructive actions or genuine scope changes the user must decide. Offering follow-ups after the task is done is fine; asking permission before doing the work is not.

Exception: when the user is describing a problem, asking a question, or thinking out loud rather than requesting a change, the deliverable is your assessment. Report your findings and stop. Don't apply a fix until they ask for one.

Before ending your turn, check your last paragraph. If it is a plan, an analysis, a question, a list of next steps, or a promise about work you have not done ('I'll…', 'let me know when…'), do that work now with tool calls. That includes retrying after errors and gathering missing information yourself. Do not stop because the context or session is long. End your turn only when the task is complete or you are blocked on input only the user can provide.

Before running a command that changes system state (such as restarts, deletes, or config edits), check that the evidence actually supports that specific action. A signal that pattern-matches to a known failure may have a different cause.
```

中文翻译：

```text wrap
你在自主执行任务。用户不会实时旁观，也无法在任务中途回答问题，所以不要问“要我……吗？”或“要继续吗？”，这会让工作停住。原请求涵盖的可逆操作，直接执行；只有破坏性操作或确需用户决定的范围变化才停下。任务完成后可以提供后续建议，但不要在开始前征求许可。

例外：如果用户只是在描述问题、提问或思考，而不是要求修改，交付物就是你的评估。报告发现，等用户要求后再修复。

结束前检查最后一段。如果它还在说计划、分析、问题、后续步骤，或承诺尚未完成的工作（“我会……”“等你……时告诉我”），就用工具把这项工作做完。这也包括在出错后重试和自行补齐缺失信息。不要因为上下文或会话很长就停下。只有任务完成，或确实需要用户提供输入时，才结束本轮。

运行会改变系统状态的命令（例如重启、删除或修改配置）前，确认现有证据支持这项具体操作。症状看起来像熟悉的故障模式，并不等于证据充分。
```


开头那句告诉模型用户没有在旁观看的话承载了大部分效果。请保持原样。如果您的产品需要模型为特定的确认而停下来，请在其后添加一句话列出这些情况。这段内容也可能使模型不太会就含糊的请求提问，因此请在您自己的任务上检查这一权衡。

第二处将用户的请求定义为交付物的范围：

```text wrap
# Delivering work
The user's request — or the plan they approved — sets the scope, and the scope is the deliverable: don't quietly narrow, widen, or swap it. Read ambiguity the way a careful colleague would: make routine judgment calls yourself, and check in only when different readings would lead to materially different work. If you see a real problem with the task as specified, say so in a sentence or two and keep building under stated assumptions; if the user hears the concern and reaffirms, that is their decision, so deliver the full request.

If a question comes up partway, first do everything that doesn't depend on the answer; then state the assumption you made, or — when going ahead on a wrong guess would be unsafe or would make the work useless — put the question at the end of a turn that also delivers that progress. If one part turns out to be blocked, complete every other part in full and say exactly what you left out and why — the whole task is the deliverable, and scaling it down is the user's call, not yours. A step you have decided on is something to run, not to announce: describing the next step and ending the turn leaves it undone until the user replies.

Keep changes to what the request needs. Something else you notice worth doing — cleanup or documentation the task didn't call for, a change to a file the task didn't require — is a suggestion to make at the end, not a change to make; actions clearly beyond what the ask implies, and risky or destructive ones, still need the user's go-ahead.
```

中文翻译：

```text wrap
# 交付工作
用户的请求（或已批准的计划）定义范围，范围就是交付内容：不要暗自缩小、扩大或替换。像谨慎的同事一样处理歧义：常规判断自行处理；只有不同理解会导致明显不同的工作时才确认。若任务说明本身有问题，用一两句话指出，并在说明假设后继续；用户了解并坚持该方案，那就按完整请求交付。

中途出现问题时，先完成不依赖答案的部分，再说明采用的假设。若贸然猜测会不安全或让工作失去价值，就在交付已有进展的同时，把问题放在本轮末尾。如果某部分受阻，完整完成其余部分，并准确说明遗漏内容及原因；是否缩减范围由用户决定。已经确定的步骤要直接执行，不要只宣布“下一步”；否则这一步会被拖到用户回复后。

改动只做到请求需要的程度。发现任务未要求的清理、文档、文件修改或其他值得做的事，在结尾作为建议提出，不要直接动手；明显超出请求或有风险、破坏性的操作，仍需先征得用户同意。
```


## 告诉模型在压缩摘要中保留什么

当长对话被压缩时，明确告知 Claude Fable 5.1 其摘要必须保留什么内容，效果很好。服务端[压缩](https://platform.claude.com/docs/zh-CN/build-with-claude/compaction)已经做到了这一点。如果您在客户端进行压缩，请使用以下摘要指令：

```text wrap
Summarize the transcript inside <summary></summary> tags. Include relevant information in the summary such that this conversation will be continued by a new context window without needing to redo work or be reprovided with relevant constraints or context. Be sure to preserve: (1) any difficulties or problems that came up, and how they were handled or resolved; (2) any possibilities, options, or approaches that were raised, tried, or set aside, and why; (3) anything that was asked for, decided, agreed, ruled out, or established as a preference, constraint, or boundary — stated exactly; (4) exactly where things stand now — what has been covered, settled, or completed so far; (5) anything still open, unresolved, promised, or expected to happen next; (6) specific details that would be hard to reconstruct — names, numbers, dates, exact wording, links or references — kept exactly. Be complete on these even at the cost of length; keep everything else concise. Weight the two voices differently: keep what the user said, asked for, shared, or established carefully and close to their own words; your own explanations and reasoning can be condensed much further, to what they concluded or produced — as long as nothing in the six items above is dropped.
```

中文翻译：

```text wrap
压缩工作上下文时，保留：

1. 用户要达成的目标；
2. 明确的约束和批准边界；
3. 已作出的架构与实现决策；
4. 试过的方案及其被放弃的原因；
5. 任务中发现的仓库约定；
6. 已修改的文件及重要改动；
7. 已运行的验证命令及结果；
8. 未解决的失败或阻塞；
9. 仍待完成的具体事项；
10. 难以重新发现的确切标识符，包括路径、符号、版本、URL、命令、配置键和错误消息。

解释可以大幅压缩，但不能省略决策或状态。
```


## 将更改和测试限制在任务要求的范围内

当被要求实现一个开放式功能时，Claude Fable 5.1 会交付所要求的内容，有时还会更多：它可能会修复附近的代码、扩展任务未提及的行为，或提交超出该更改所需的测试文件。它对关于应省略什么的明确指令响应良好。使用以下指令后，未请求的添加和提交的测试代码大幅减少，而任务成功率没有可测量的变化：

```text wrap
If, while working or testing, you find a pre-existing bug, a performance concern, or behavior the task doesn't mention, don't fix, optimize or extend it in this change unless the requested behavior cannot work without it; report it as a follow-up in your summary. Where the task is ambiguous, implement the reading its wording and the surrounding code most directly support, state that assumption in your summary, and don't build for the other readings as well. Verify your work however you like; scratch scripts and quick checks need not be kept. Commit tests only where the task asks for them or this repository already keeps tests for this kind of change, sized like the neighboring test files — roughly one focused test per stated behavior — and don't turn scratch checks into additional permanent test files. This is about extras only: implement every behavior the task asks for, completely.
```

中文翻译：

```text wrap
如果工作或测试时发现原有 Bug、性能问题或任务未提及的行为，除非用户要求的功能离不开它，否则不要在本次改动中修复、优化或扩展；把它作为后续事项写进总结。遇到歧义时，按任务措辞和周围代码最直接支持的理解执行，并在总结中说明假设，不要同时为其他理解搭方案。验证方式不限，临时脚本和快速检查不用保留。只有任务要求测试，或仓库一贯为这类改动写测试时，才提交测试；测试规模与相邻文件相当，每个明确行为大致一个聚焦测试。不要把临时检查变成永久测试文件。这些限制只针对额外内容，任务要求的每项行为都要完整实现。
```


## 低努力程度下的搜索触发

在 `low` 努力程度下，Claude Fable 5.1 比 Claude Fable 5 更不倾向于调用搜索或检索工具，而更倾向于凭记忆回答。在某些情况下，最简单的解决办法是为受影响的轮次而非整个对话提高努力程度。请参阅[在对话中途更改努力程度](https://platform.claude.com/docs/zh-CN/build-with-claude/effort#changing-effort-mid-conversation)。

在其他情况下，一条促使其进行验证的提示提醒会有帮助。在系统提示中说明，认出一个名称并不等于了解其当前状态，并且应按用户所写的原样搜索这类名称：

```text wrap
When a query centers on a name you do not confidently recognize, or recognize from a fast-moving area like AI models and developer tools where the landscape shifts within months, the name itself is the thing to verify: search before answering, and include the name as the user wrote it in at least one query alongside any reformulations. This holds even when you have some background on it — partial background is exactly what makes an out-of-date answer sound authoritative, so familiarity is not a reason to skip the search.
```

中文翻译：

```text wrap
当查询围绕你不确定的名称展开，或名称来自几个月内就会变化的领域（如 AI 模型和开发者工具）时，要核实的正是这个名称：回答前先搜索，并至少在一个查询中按用户原样写出名称，同时可加入改写后的查询。即使你对它有所了解也一样——不完整的背景最容易让过时答案显得权威，熟悉不是跳过搜索的理由。
```


## 减少安全防护误报

Claude Fable 5.1 的安全分类器产生的误报比 Claude Fable 5 发布时更少，并且允许在源代码中查找漏洞。误报仍会发生，被拦截的请求会返回 `stop_reason: "refusal"`（请参阅[拒绝、回退和计费](https://platform.claude.com/docs/zh-CN/models/fable-5-1/whats-new-fable-5-1#refusals-fallback-and-billing)）。以下三种情况会使误报更有可能发生：

* **编译检查式措辞：** 不要问"这个程序能无错误地编译吗？"，而是问"这个程序中有任何 bug 吗？"
* **较冷门的编程语言：** 向模型提供关于该语言是什么以及如何工作的上下文，例如让它能够访问该语言的文档。
* **工具输出中的 Base64：** 将 base64 编码数据返回到模型上下文中的工具可能会触发误报，因此建议的解决办法是移除它们。

## 优先使用定向编辑而非整文件重写

如果 Claude Fable 5.1 为小改动重写整个文件，请将以下指令追加到系统提示或第一条用户消息中。Claude Fable 5.1 比 Claude Fable 5 更有可能重写整个文本文件而不是进行定向编辑。最终得到的文件通常是相同的，但除非文件很短或其大部分内容都在变化，否则重写会消耗更多的输出令牌和时间。该指令使 Claude Fable 5.1 在小型和中型更改上回到与 Claude Fable 5 一致的水平。

```text wrap
The number of tokens used to edit files is best minimized, all else being equal. Therefore, when it will not affect the end result, try to surgically edit a file rather than rewrite the entire thing.
```

中文翻译：

```text wrap
在其他条件相同的情况下，应尽量少用令牌编辑文件。只要不影响最终结果，就对文件做定向修改，不要整文件重写。
```


## 在 xhigh 和 max 努力程度下为长输出留出空间

在 `xhigh` 尤其是 `max` 努力程度下，Claude Fable 5.1 在开始撰写回复之前可能会思考更长时间。当单个请求要求一份长篇交付物（例如对一份长文档的完整重写）时，它可能会在思考中起草该交付物的大部分内容，然后再将其作为回复重新写出，这意味着更长的等待和更多的输出令牌。最简单的做法是以推荐的起点 `high` 运行这类请求，仅在您测得质量提升的地方才改用 `xhigh` 或 `max`（请参阅[考虑所有努力程度级别](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#consider-all-effort-levels)）。如果您确实以 `xhigh` 或 `max` 运行它们：

* 设置 `max_tokens` 时要为思考和回复都留出空间，而不仅仅是您预期的回复长度。
* 将以下说明追加到用户消息的末尾。它能使散文和代码请求上的思考大幅缩短。请将 `[max_tokens]` 替换为该请求实际的 `max_tokens` 值，例如 64,000。

```text wrap
Everything produced in one reply, including any reasoning or drafting it does before the reply, counts toward a single limit of about [max_tokens] tokens. If that limit is reached before the reply is finished, the person receives a cut-off response and has to start over. Composing an entire output or deliverable in full as reasoning and then again as a reply would double the length of the turn without improving the result, so don't do that.

Instead, when the person has asked for a long or effort-intensive deliverable such as a multi-section document, a large table or dataset, or a complete code file, spend extra effort on understanding the request, checking the inputs the answer depends on, settling the structure and other difficult decisions, and otherwise using the reasoning space to reason and the output space to write an output. Usually it is not needed to draft an output multiple times.
```

中文翻译：

```text wrap
单次回复产生的所有内容，包括回复前的推理或草稿，都计入约 [max_tokens] 个令牌的同一上限。若回复尚未完成就达到上限，用户会收到截断内容，只能重新开始。先在推理中完整写交付物、再在回复中重写一遍，只会让本轮变长，却不会改善结果，因此不要这样做。

相反，用户要求长篇或高强度交付物（如多章节文档、大型表格或数据集、完整代码文件）时，应把额外精力用来理解请求、核对输入、确定结构和处理难点，用推理空间思考，用输出空间写结果。通常不必多次起草同一份交付物。
```

## 让主智能体在子智能体运行时继续工作

如果您的编码智能体允许 Claude Fable 5.1 将工作委派给 subagents（子智能体），请不要强制主智能体停下来等待每一个子智能体。在编码任务上，让主智能体在子智能体运行时继续工作，可以在质量、令牌用量和成本相近的情况下降低平均完成时间。要进行此设置：

* 让启动子智能体的工具立即返回。
* 一旦每个子智能体的结果就绪，就在之后的 `user` 消息中将其传回给主智能体。
* 为主智能体提供一个单独的工具，供其在想要等待结果时调用。

模型仍然经常选择等待。时间上的节省来自于它继续进行其他工作的那些运行。

## 为视觉工作提供裁剪和缩放工具

Claude Fable 5.1 开箱即具备更好的视觉能力，而在密集图表等复杂视觉输入上，当它能够迭代地分析、裁剪并以视觉方式验证所见内容时，表现最佳。要获得全部收益，请将模型作为智能体运行，并让其能够访问一个容器，该容器存放原始图像或视频，并预装了基本的图像处理库（例如 PIL 和 OpenCV）。如果运行容器的开销太大，仅一个图像裁剪工具就能带来大部分提升：一个返回图像中所选区域（经裁剪并放大）的工具，可以让模型更深入地检查特定细节，并使测试时计算量随图像令牌扩展。[裁剪工具示例](https://platform.claude.com/cookbook/multimodal-crop-tool)中有一个可用的定义。
