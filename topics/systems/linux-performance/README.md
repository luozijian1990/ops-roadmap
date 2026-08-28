# Linux 性能优化学习指南

本主题以 CPU、内存、I/O 和网络为主线，强调指标解释、快速定位、抓包和优化方法，适合 SRE 处理生产性能退化。

## 可以学到什么

- 用负载、上下文切换、软中断和 NUMA 定位 CPU 问题。
- 分析内存回收、不可中断进程和进程级资源消耗。
- 定位磁盘 I/O、文件系统、慢 SQL 和 Redis 延迟。
- 使用 tcpdump/Wireshark、DNS 与 NAT 指标排查网络性能。
- 按“现象-证据-假设-验证-优化”形成可复用方法论。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | CPU 与内存 | 负载、调度、回收、优化 | [Markdown](./01-cpu-and-memory.md) · [Roadmap](./01-cpu-and-memory-roadmap.html) |
| 2 | I/O、网络与方法论 | 磁盘、网络、定位流程 | [Markdown](./02-io-network-and-methodology.md) · [Roadmap](./02-io-network-and-methodology-roadmap.html) |

## 阅读建议

- 先建立基线再改参数，所有优化都要有前后指标和回滚方案。
- [完整动画版](./full-animated-roadmap.html)包含交互演示，适合快速理解排障路径。
