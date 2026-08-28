# Linux 底层原理学习指南

本主题分册讲解 Linux 启动、进程调度、内存、文件系统、IPC 和网络协议栈，帮助运维人员把命令行现象连接到内核执行路径。

## 可以学到什么

- 理解内核架构、启动流程和常用系统管理命令。
- 观察进程、线程、调度、信号和 IPC 行为。
- 分析虚拟内存、页分配、文件系统和 I/O 路径。
- 沿 Socket、TCP/IP 和网卡驱动追踪网络包。
- 为性能和故障排查建立内核层证据链。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 系统基础与启动 | 架构、命令、启动 | [Markdown](./01-foundations-and-boot.md) · [Roadmap](./01-foundations-and-boot-roadmap.html) |
| 2 | 进程、线程与调度 | 生命周期、数据结构 | [Markdown](./02-processes-and-scheduling.md) · [Roadmap](./02-processes-and-scheduling-roadmap.html) |
| 3 | 内存管理 | 地址空间、分页、分配 | [Markdown](./03-memory-management.md) · [Roadmap](./03-memory-management-roadmap.html) |
| 4 | 文件系统与 I/O | ext4、inode、系统调用 | [Markdown](./04-filesystems-and-io.md) · [Roadmap](./04-filesystems-and-io-roadmap.html) |
| 5 | 进程间通信 | 管道、队列、共享内存、信号 | [Markdown](./05-ipc.md) · [Roadmap](./05-ipc-roadmap.html) |
| 6 | 网络协议栈 | Socket、TCP、收发包路径 | [Markdown](./06-network-stack.md) · [Roadmap](./06-network-stack-roadmap.html) |

## 阅读建议

- 按顺序阅读并在 Linux 实例执行示例；遇到故障时按对应分册查阅。
- 涉及磁盘、网络或内核参数的实验应使用可回滚环境。
