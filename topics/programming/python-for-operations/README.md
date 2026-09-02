# Python 运维自动化与工程实践

这套笔记面向需要阅读、编写和维护 Python 工具的运维工程师。内容从解释器、数据与异常等基础开始，逐步进入文件和命令自动化、HTTP 与并发、工程质量、运行环境和工具架构，重点不是背语法，而是让每一次自动化动作都具备明确输入、失败边界、验证证据和恢复办法。

## 可以学到什么

- 判断哪些运维任务适合 Python，哪些约束意味着应该重新评估组件或语言。
- 读懂数据结构、对象引用、编码、生成器、控制流、函数和异常处理。
- 使用 `pathlib`、`shutil`、`subprocess`、CLI、HTTP 客户端和有界并发完成自动化。
- 管理项目结构、虚拟环境、`pyproject.toml`、依赖锁、配置、Secret、日志与审计。
- 使用类型检查、Ruff、pytest、假对象、localhost 服务和诊断工具建立质量门禁。
- 区分引用计数、循环引用、GC、`tracemalloc` 与 RSS 证据，并定位 event loop 阻塞、取消和资源清理问题。
- 选择 wheel、`uv tool`/pipx、zipapp 或 PyInstaller 等交付方式，依据部署、容量和团队约束判断 Python/Go 边界。
- 设计 Backend、Worker、Scheduler 和 Agent 的边界，并处理幂等、租约、重试和优雅退出。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 语言基础 | 解释器、数据模型、可信输入、控制流、函数与异常 | [Markdown](./01-language-foundations.md) · [Roadmap](./01-language-foundations-roadmap.html) |
| 2 | 自动化与系统集成 | 文件、命令、CLI、HTTP、流式处理与有界并发 | [Markdown](./02-automation-and-system-integration.md) · [Roadmap](./02-automation-and-system-integration-roadmap.html) |
| 3 | 工程质量与运行环境 | 项目结构、依赖、配置、日志、测试、调试与性能分析 | [Markdown](./03-engineering-quality-and-runtime.md) · [Roadmap](./03-engineering-quality-and-runtime-roadmap.html) |
| 4 | 运维工具架构 | 组件选型、生命周期、幂等、重试、Python 与 Go 边界 | [Markdown](./04-operations-tool-architecture.md) · [Roadmap](./04-operations-tool-architecture-roadmap.html) |

## 阅读建议

- 初学者按四册顺序阅读，并实际运行文件、localhost 和 SQLite 实验。
- 已经会写脚本的读者可以从第二册开始，但仍应检查第一册中的对象引用、异常与输入校验边界。
- Roadmap 适合按小节跟踪进度；Markdown 更适合全文搜索、复制代码和查看上下文。
- 示例中的 AST、假对象和单机测试只证明各自边界，真实权限、网络、数据库和编排器行为仍需在对应环境验证。
