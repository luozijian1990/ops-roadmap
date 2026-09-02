# Go 运维开发与云原生工程

这套笔记面向需要阅读、编写和维护 Go 运维工具、平台服务、Agent 或 Kubernetes Controller 的运维工程师、SRE 和平台工程师。内容不追求覆盖完整语言规范，而是把 Go 的类型、并发、I/O、服务状态和交付边界连接到真实的运维故障。

## 可以学到什么

- 判断一次性脚本、CLI、Backend、Worker、Agent 和 Controller 的适用边界。
- 理解包初始化、接口动态值、方法集、slice/map 所有权和错误链等 Go 语义。
- 使用 goroutine、channel、context 和同步原语建立有界、可取消、可观测的并发任务。
- 安全处理文件、外部命令、HTTP/TCP 协议、退出信号和部分失败。
- 设计事务、租约、幂等、`unknown`、Agent 离线确认游标和 Controller Reconcile。
- 从源码、构建参数、二进制摘要、SBOM、签名到运行实例建立交付证据链。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 语言基础 | 工具链、类型、集合、函数、接口与错误 | [Markdown](./01-language-foundations.md) · [Roadmap](./01-language-foundations-roadmap.html) |
| 2 | 并发与运行时 | 调度、生命周期、背压、同步、竞态与内存 | [Markdown](./02-concurrency-and-runtime.md) · [Roadmap](./02-concurrency-and-runtime-roadmap.html) |
| 3 | 系统自动化与 CLI | 文本、文件、进程、HTTP、TCP 和 CLI 契约 | [Markdown](./03-system-automation-and-cli.md) · [Roadmap](./03-system-automation-and-cli-roadmap.html) |
| 4 | Backend 与服务工程 | API、身份、数据、任务、SDK 和发布 | [Markdown](./04-backend-and-service-engineering.md) · [Roadmap](./04-backend-and-service-engineering-roadmap.html) |
| 5 | Agent、Controller 与交付 | 本地职责、协调、RBAC、制品和 GitOps | [Markdown](./05-agent-controller-and-delivery.md) · [Roadmap](./05-agent-controller-and-delivery-roadmap.html) |

## 阅读方式

- 初学者按五册顺序阅读，每个章节都先看运行约束，再运行最小代码或命令。
- 已经会写 Go 的读者可以从第二册或第三册开始，但应回看第一册的接口、错误和模块边界。
- Roadmap 适合按 H3 小节跟踪进度；Markdown 适合全文搜索、复制代码和查看上下文。
- 代码分为完整程序、可编译片段和结构示例；结构示例必须结合对应项目依赖验证，不能把静态阅读当成生产证明。
- 涉及 fake client、localhost、profile 或交叉编译的结果，只证明其声明的边界；真实权限、网络、数据库和编排器行为仍需在目标环境验证。

## 与 Python 的关系

Python 专题更适合快速集成、数据整理和依赖成熟 SDK；Go 专题更强调长期运行、并发 I/O、单二进制分发和云原生生态。两者的选择应依据规模、部署、资源、团队排障能力和恢复要求，而不是语言偏好。

Python 笔记见：[Python 运维自动化与工程实践](../python-for-operations/README.md)。
