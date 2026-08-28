# Nginx 学习指南

本主题分册覆盖 Nginx 架构、HTTP 模块、反向代理、负载均衡、性能优化和源码路径，适合 Web 入口、网关和边缘服务运维。

## 可以学到什么

- 编译安装、理解 Master/Worker 架构和配置语法。
- 掌握 HTTP 指令合并、请求处理和正则匹配。
- 配置反向代理、Upstream、负载均衡、超时与日志。
- 使用 CPU、网络和连接指标定位性能瓶颈。
- 沿事件循环和源码路径分析异常并安全升级回滚。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 基础与架构 | 安装、配置、生命周期 | [Markdown](./01-basics-and-architecture.md) · [Roadmap](./01-basics-and-architecture-roadmap.html) |
| 2 | HTTP 模块 | 指令、请求流程、重写 | [Markdown](./02-http-modules.md) · [Roadmap](./02-http-modules-roadmap.html) |
| 3 | 反向代理与负载均衡 | Upstream、代理、故障转移 | [Markdown](./03-reverse-proxy-and-load-balancing.md) · [Roadmap](./03-reverse-proxy-and-load-balancing-roadmap.html) |
| 4 | 性能与源码 | CPU、多核、事件模型 | [Markdown](./04-performance-and-source-code.md) · [Roadmap](./04-performance-and-source-code-roadmap.html) |

## 阅读建议

- 先完成基础配置，再在测试上游验证代理、超时和负载均衡。
- 修改配置前使用 `nginx -t`，升级保留旧二进制和可执行回滚路径。
