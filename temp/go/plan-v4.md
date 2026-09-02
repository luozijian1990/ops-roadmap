# Go/Python 运维编程 Markdown 补全实施计划 V4

## 实施边界

本计划以 Markdown 为源，最终同步修改导航和生成产物：

- `topics/programming/go-for-operations/` 的五册正文。
- `topics/programming/python-for-operations/` 的相关正文。
- `temp/go/spec-v4.md` 和本文计划。
- 根 `README.md`、`index.html` 以及 Go/Python 专题子目录 README。
- 由 `scripts/build-roadmaps.sh` 生成的标准 Roadmap HTML。

本阶段不创建 `labs/`、源码、测试工程或 fixture server。验证以 Markdown 中的完整程序、可复制命令、状态图、观察说明和故障演练记录为准，并检查导航和生成产物与 Markdown 保持一致。

## 实施原则

1. 先调整内容位置，再扩写机制；不继续把主题堆在综合实验末尾。
2. 每个 H3 保持原题目，新增内容优先作为该 H3 下的 H4。
3. 每个机制都回答“为什么会这样、现场看到什么、怎么验证、失败后怎么办”。
4. Go 与 Python 共享问题场景，但各自只讲语言真正不同的边界。
5. 不用行数替代质量；代码必须标明完整程序、可编译片段或伪代码。

## 阶段 0：建立正文盘点和落点表

### 工作项

- 统计两套笔记的 H1/H2/H3/H4、代码围栏、Mermaid 和表格。
- 将 V3 已覆盖内容标记为“保留/校正”，不要重复写成新章节。
- 为每个待补主题确定已有 H3 落点。
- 确认 `temp/go/go01`、`go02/pdf-markdown`、`go03` 只作为来源材料，不把内部映射注入正式正文。

### 交付物

在本计划或后续验收记录中保留一张落点表，至少记录：主题、目标文件、目标 H3、证据类型、来源材料和验证状态。

## 阶段 1：Go 第一册补强

### 目标文件

`01-language-foundations.md`

### 落点

- 工具链/入口章节：编译、链接、包初始化、`embed`、build tags 和交叉编译的运维影响。
- 类型/集合章节：接口动态类型、typed nil、方法集、slice/map 共享、所有权和稳定排序。
- 函数/错误章节：错误链、错误分类、panic/recover 边界、reflection/codegen 取舍。

### 最低证据

- 两个执行顺序或类型实验。
- 一个 `embed` 或 build tags 的最小命令示例。
- 一个会产生 typed nil、slice 共享或 map 顺序漂移的失败测试，以及修复后的输出。

## 阶段 2：Go 第二册补强

### 目标文件

`02-concurrency-and-runtime.md`

### 落点

- 调度章节：G/M/P、阻塞/可运行状态、GOMAXPROCS 与容器 CPU 配额。
- 生命周期章节：context 传播、首错取消、全部结果、timer/ticker 回收。
- 同步章节：channel、Mutex、atomic 的 happens-before 和数据竞争边界。
- 性能章节：GC、heap goal、`GOGC`、`GOMEMLIMIT`、RSS、cgroup throttling 和 escape analysis。

### 最低证据

- 一个 happens-before 实验，展示错误同步前后的可见性差异。
- 一个 goroutine 泄漏或取消实验，包含前后 profile/指标观察。
- 一个 GC 或内存上限实验，明确 heap、RSS 和 cgroup 指标不能互相替代。

## 阶段 3：Go 第三册补强

### 目标文件

`03-system-automation-and-cli.md`

### 落点

- `io` 章节：Reader/Writer 组合、短读短写、背压和上限。
- 文件章节：临时文件、rename、fsync、父目录持久化、符号链接和并发写。
- 网络章节：TCP framing、半包、deadline、连接容量和协议错误。
- 进程/CLI 章节：进程组、SIGTERM、stdout/stderr、退出码、错误输出脱敏。

### 最低证据

- 一个短读或半包实验，输出每次读取长度和最终拼接结果。
- 一个原子替换实验，展示写入失败时旧文件仍可读。
- 一个 SIGTERM 或 context 取消实验，记录在途任务、退出码和残留进程。

## 阶段 4：Go 第四册补强

### 目标文件

`04-backend-and-service-engineering.md`

### 落点

- HTTP 请求处理链：输入、身份、授权、领域逻辑、持久化和错误响应。
- SDK/client：分页、认证刷新、错误映射、重试策略和版本兼容。
- 任务状态：副作用前崩溃、副作用后提交前崩溃、响应丢失后的 `unknown`。
- 事务和幂等：唯一键、条件更新、租约、重试预算和审计失败策略。

### 最低证据

- 一个错误映射表和可复制的 HTTP 响应示例。
- 一个任务状态转换图或表驱动测试。
- 一个崩溃点实验，明确哪些结果可以重试，哪些只能对账。

## 阶段 5：Go 第五册补强

### 目标文件

`05-agent-controller-and-delivery.md`

### 落点

- Agent：离线缓冲、确认游标、重复回放、资源预算和磁盘满策略。
- Controller：level-triggered reconcile、cache 延迟、predicate、status 冲突和 finalizer。
- 交付：二进制摘要、SBOM、签名、镜像 digest、部署声明和运行实例追溯。
- 现有 H4 中增加“运维设计模式索引”，链接 Adapter、Strategy、State Machine、Decorator/Middleware、Producer-Consumer、Ports and Adapters、Repository、Functional Options。

### 最低证据

- 一个离线回放或确认游标状态图。
- 一个 reconcile 冲突或 finalizer 失败的故障演练记录。
- 一个从源码版本到制品摘要再到运行实例的证据链示例。
- 设计模式索引中的每项至少链接一个现有章节，并写明不适用条件。

## 阶段 6：Python 运行时补强

### 目标文件

`topics/programming/python-for-operations/03-engineering-quality-and-runtime.md`

### 工作项

- 增加引用计数、循环引用、分代 GC 与 `tracemalloc`/RSS 的排障顺序。
- 增加 event loop 被阻塞、TaskGroup 取消、异常聚合和线程/进程边界。
- 每个主题附一个小型脚本、预期输出和“不能证明什么”的说明。

### 最低证据

- 一个可重复的对象增长或循环引用观察。
- 一个阻塞调用卡住异步批次的实验。
- 一个取消后资源清理和异常传播的测试示例。

## 阶段 7：Python 交付与语言选择补强

### 目标文件

`topics/programming/python-for-operations/04-operations-tool-architecture.md`

### 工作项

- 增加 wheel、`uv tool`/pipx、zipapp/PyInstaller 和系统依赖的选择表。
- 将 Python/Go 选择落到部署、规模、依赖、排障能力和团队约束。
- 将已有重试、状态机、适配器、装饰器和 worker pool 代码标注为场景模式，而不是新增模式名词表。

### 最低证据

- 一个干净环境安装/启动命令序列。
- 一个 Python 与 Go 制品边界对照表。
- 一个模式索引条目，包含测试和不适用条件。

## 阶段 8：统一故障演练和文档收口

### 工作项

把每册已有综合实验改成可复核的 Markdown 记录，至少覆盖：

```text
输入摘要
注入位置
预期状态转换
观察命令或日志查询
退出码/结果字段
清理步骤
PASS / FAIL / NOT RUN / NOT VERIFIED / BLOCKED
```

最低场景集合：

1. 超时或 deadline 到达。
2. 429/503 的有界重试。
3. SIGINT/SIGTERM 的有限收尾。
4. 副作用后响应丢失，进入 `unknown`。
5. Agent 断网或 Controller 缓存陈旧。
6. 制品摘要与运行版本不一致。

### 收口检查

- 新增内容放在对应章节，不集中堆到文件末尾。
- 代码围栏成对，伪代码语言标注正确。
- 每个完整程序注明运行命令、最低版本和预期输出。
- 反向检查敏感信息、无限重试、无界并发、无界输出和错误字符串分类。

## 阶段 9：Markdown 验收

### 结构检查

```bash
find topics/programming/go-for-operations topics/programming/python-for-operations \
  -maxdepth 1 -type f -name '*.md' -print
rg -n '^# |^## |^### |^#### ' topics/programming/go-for-operations topics/programming/python-for-operations
```

确认 Go 五册和 Python 四册的 H1/H2/H3 数量、标题和层级没有意外漂移。

### 内容检查

- Mermaid 代码块可解析，表格列数一致。
- Go 围栏可由 `gofmt` 处理；伪代码不冒充 Go。
- 完整程序在临时 module 中执行 `go test` 或 `go run`，片段明确列出缺失上下文。
- Python 示例在当前支持版本或声明的最低版本中可运行。
- 每个实验都有成功、失败或未验证判定。

### 变更边界

Markdown 验收通过后运行 `scripts/build-roadmaps.sh`，更新标准 Roadmap 和根导航；不手工编辑生成 HTML，也不覆盖 `topics/cloud-native/kubernetes/full-animated-roadmap.html` 及其 `roadmap-animations/` sidecar。

### 导航与 Roadmap 同步

- 为新增或更新的专题维护 `topics/<category>/<topic>/README.md`，列出 Markdown 与 Roadmap 的对应入口。
- 根 `README.md` 的主题、Markdown note 和 Roadmap 统计必须与实际文件数量一致。
- 根 `index.html` 必须收录每份标准 Roadmap，链接使用仓库相对路径。
- 每份标准 Roadmap 必须包含 `../../../index.html` 回链，且内嵌 `data` JSON 可解析。
- 运行 `./scripts/validate-topic-readmes.sh`，确认专题 README 的链接和结构有效。

## 最终交付清单

```text
[ ] Go 五册原理与运维场景闭环完成
[ ] Go 五册各有机制实验和失败/恢复实验
[ ] Python 第三册运行时补强完成
[ ] Python 第四册交付边界和语言选择补强完成
[ ] 设计模式索引放在现有 Markdown 中并链接真实章节
[ ] H1/H2/H3/H4、代码围栏、Mermaid、表格检查通过
[ ] 完整程序、可编译片段、伪代码标注清楚
[ ] 故障演练使用 PASS/FAIL/NOT RUN/NOT VERIFIED/BLOCKED
[ ] 未创建 labs、源码项目或 fixture server
[ ] 根 README、index.html、专题 README 与实际主题和路线图同步
[ ] 标准 Roadmap 已由脚本生成并通过回链、JSON 和动画版保护检查
```
