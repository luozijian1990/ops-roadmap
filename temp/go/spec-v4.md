# Go/Python 运维编程 Markdown 补全规范 V4

## 状态与文档关系

本规范承接 `spec-v3.md` 的 Go 原理补强结果。本阶段正文工作只补全和校正 Markdown，收口时同步导航和生成产物；不新增 `labs/`、独立源码项目、fixture server、测试工程或外部基础设施。

- `spec-v3.md`：上一阶段 Go 正文原理补强基线。
- `plan-v3.md`：上一阶段正文回填计划。
- `spec-v4.md`：本阶段 Markdown 的范围、写作契约和验收标准，本文为需求权威来源。
- `plan-v4.md`：本阶段 Markdown 的实施顺序和文件落点，必须服从本文范围。
- `spec.md`、`outline.md`：V2 历史规划；与 V4 冲突时以 V4 为准，不回写历史文档。

正文稳定后，本阶段继续完成根 `README.md`、`index.html`、专题子目录 README 和标准 HTML Roadmap 的同步；Roadmap 始终由脚本从 Markdown 重新生成。

## 目标

把现有 Go/Python 运维笔记从“知识点和代码片段”补成可以独立阅读、复制实验、观察现象和复盘故障的 Markdown 教材。

读者完成相关章节后，应能建立以下闭环：

```text
需求约束
  -> 输入与类型检查
  -> I/O、并发与资源边界
  -> 超时、取消、重试和幂等
  -> 结果、退出码、日志与审计
  -> 故障注入和证据判断
  -> 交付、升级与恢复
```

Go 和 Python 使用同一组运维问题作为对照，但不强行写成两份相同文章：

- Go 强调类型、接口、并发、长期运行进程、单二进制和云原生交付。
- Python 强调解释器运行时、快速集成、依赖环境、异步/线程边界和脚本迭代。

## 交付范围

### Go 五册

保持现有五册、20 个 H2 和 60 个正式 H3，不新增一册，不为了凑行数拆分章节。补充内容只放入相关 H3 的 H4、代码、表格、状态图、练习或完成标准。

必须保留并强化以下主线：

1. 编译、包初始化、类型检查、接口动态值、方法集、slice/map 共享和所有权。
2. G/M/P、goroutine 生命周期、happens-before、channel/锁/atomic、GC、RSS 和 cgroup 资源。
3. `io` 组合、短读短写、原子文件替换、TCP framing、进程组、deadline 和取消。
4. HTTP 请求链、错误分类、事务边界、任务租约、幂等和 `unknown`。
5. Agent 离线确认游标、Controller reconcile/cache/finalizer，以及制品摘要、SBOM、签名和运行追溯。

只增加以下仍有明显收益的 Go 工具链边界：

- `embed`、`go:generate`、build tags、交叉编译、cgo/静态链接。
- reflection、generics 和代码生成在序列化、Kubernetes client 中的取舍。
- escape analysis 与内存诊断的最小联系。
- SDK/client 的分页、认证刷新、错误映射、重试和版本兼容。

### Python 四册

保持现有四册结构，不新增通用语法册。补充内容必须落到已有运维场景：

- 引用计数、循环引用、分代 GC、`tracemalloc`、RSS 和泄漏定位。
- event loop 中的阻塞调用、TaskGroup 异常传播、取消和线程/进程边界。
- wheel、`uv tool`/pipx、zipapp/PyInstaller、系统依赖和升级回滚。
- 与 Go 对照时，解释部署约束、团队能力、容量证据和维护成本，而不是只比较启动速度。

### 设计模式索引

在现有 Go 第五册末尾或最相关的已有 H3 内增加一个 H4“运维设计模式索引”，不创建第六册。索引只命名正文已经实际使用的模式：

| 模式 | 运维问题 |
| --- | --- |
| Ports and Adapters | 核心逻辑与云 SDK、HTTP、CLI、Kubernetes client 解耦 |
| Adapter | 厂商 API 和外部命令统一为内部接口 |
| Strategy | 重试、错误分类、输出格式和探针策略可替换 |
| State Machine | 任务状态、Controller Condition、`unknown` |
| Decorator/Middleware | timeout、日志、指标、鉴权和请求链 |
| Producer-Consumer | 有界 worker pool、队列和背压 |
| Repository | 需要替换持久化或隔离测试时使用 |
| Functional Options | Go 公共库配置项多且需要兼容时使用 |

每个模式必须包含：问题场景、最小代码或状态图、测试/观察证据和不适用条件。Singleton、Abstract Factory、Visitor 等不作为独立教学目标。

## Markdown 写作契约

每个新增或实质改写的 H4 至少包含以下五类内容：

1. **运维场景**：说明值班、批量巡检、Agent、Controller 或交付中会遇到的具体矛盾。
2. **机制解释**：把语言行为连接到资源、错误、超时、取消、权限、幂等或恢复决策。
3. **最小证据**：完整程序、可编译片段、状态图、命令输出或表格，类型必须标明。
4. **可观测现象**：说明看 stdout/stderr、日志、指标、profile、退出码或状态字段中的什么证据。
5. **失败/验证实验**：给出可重复的输入、注入点、预期结果和判定条件。

伪代码不得使用 `go` 或 `python` 语言围栏；新 API 标明最低版本或兼容边界；旧课程中的 GOPATH、旧日志库和旧部署默认只能作为迁移背景。

## 安全和环境约束

- 示例只访问 localhost、进程内替身或明确声明的只读测试目标。
- 不写入真实凭据，不把 Authorization、Cookie、完整响应体或 Secret 放入日志示例。
- 不要求删除用户文件、修改系统服务或访问生产集群才能完成阅读实验。
- 涉及 POSIX signal、进程组和文件权限时，明确 macOS/Linux 差异；无法在当前环境验证的内容标为 `NOT VERIFIED`。
- 临时文件、端口和子进程必须给出清理方式；失败场景不能留下无法解释的资源。

## 验收门禁

### 结构

- Go 仍为 5 册、20 个 H2、60 个正式 H3；Python 仍为 4 册。
- 每个学习笔记只有一个 H1，H2/H3/H4 层级有效。
- 不新增只有标题或一句结论的 H4；新增内容不得全部堆在文件尾部综合实验之后。

### 内容

- Go 五册均有至少一个可复制的机制实验和一个失败/恢复实验。
- Python 第三、四册分别包含运行时诊断和交付边界补强。
- 设计模式索引能链接到现有真实章节，不得只有名词定义。
- Mermaid、表格、代码示例和有意义的 Markdown 换行保持完整。
- 正式正文不出现 `src:`、`supplement:`、`edit:` 等内部规划注释。

### 证据

- 完整 Go 程序至少能在临时 module 中构建；不完整片段必须明确标注上下文。
- 命令示例给出成功和失败的关键输出或退出码。
- 故障演练记录使用 `PASS`、`FAIL`、`NOT RUN`、`NOT VERIFIED`、`BLOCKED`，不得把未执行写成通过。
- 每个结论说明它不能证明什么，避免把 localhost、fake client 或静态检查夸大成生产验证。

## 非目标

- 不创建 `labs/`、Go/Python 源码工程、fixture server 或 CI 项目。
- 不新增 GoF 设计模式全集、通用算法课程或更多框架/API 清单。
- 不逐行讲解 Go runtime、编译器后端或 Kubernetes controller 源码。
- 不复制两份相同的 Go/Python 理论内容。
- 不手工编辑生成的 Roadmap HTML；应由 `scripts/build-roadmaps.sh` 从 Markdown 重新生成。

## 完成定义

只有同时满足以下条件，才认为本阶段 Markdown 补全完成：

1. Go 五册的原理、运维场景、证据和失败实验链路完整，且没有明显的末节堆积。
2. Python 的运行时和交付边界补强已落到现有章节，并与 Go 形成可解释的对照。
3. 设计模式索引链接到真实章节，且包含不适用条件。
4. 结构、代码围栏、Mermaid、表格、H1/H2/H3/H4 和来源映射检查通过。
5. 验收记录明确区分已执行证据与仍需在真实环境验证的边界。
6. 根 `README.md`、`index.html`、Go/Python 专题子目录 README 与标准 Roadmap 数量、链接和标题保持同步；完整动画版 Kubernetes Roadmap 不被覆盖。
