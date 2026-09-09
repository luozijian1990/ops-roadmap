# Traefik 系统学习指南

这是一份面向运维工程师与 SRE 的中文学习笔记，按照 `temp/new-traefik` 的 39 份材料顺序组织，包含概念、机制、配置、观察方法、失败边界和实践。HTTP/TCP/UDP、安装配置与 CRD 的同名章节保留原编号，并在中文标题中注明语境。

## 阅读入口

- [完整中文学习笔记](guide.md)
- [交互式学习路线图](guide-roadmap.html)
- [章节与来源大纲](outline.md)
- [原始审查报告](../../../docs/traefik/reviews/39-chapters-review-2026-09-07.md)
- [本次整改与验收记录](../../../docs/traefik/reviews/39-chapters-remediation-2026-09-07.md)
- [统一可运行实验包](lab/README.md)
- [返回总目录](../../../index.html)

## 学习方式

先读 01–06 建立入口、发布、安全和观测的整体认识，再按需要回查 10–25 的配置机制；涉及集群和协议服务时继续阅读 26–39。章节顺序与材料一致，因此一些安装或实践章节会引用后面的字段详解，相关前置条件已在正文指出。

第02章提供 Compose 基础实验与统一实验包依赖表；lab/ 提供固定版本的HTTP、双向TLS、真实IP、负载均衡、观测、专用协议和Catalog实验，以及Kubernetes/Swarm/DNS-01配套文件。其余 YAML 明确区分完整文件、增量片段和已有外部服务前提。不要把多个同名顶层键直接拼接。所有流程/架构图使用 Mermaid `graph TD`。

## 39 章目录

| 编号 | 材料章节与学习主题 |
| --- | --- |
| 01 | Getting-Started · 入门与配置模型 |
| 02 | Quick-Start · 快速开始 |
| 03 | Setup · 部署与运行环境 |
| 04 | Expose · 发布应用服务 |
| 05 | Secure · 应用入口安全 |
| 06 | Observe · 观测方法与排障实践 |
| 07 | Migrate · 版本迁移策略 |
| 08 | Traefik-v2-to-v3 · 从 v2 迁移到 v3 |
| 09 | Reference · 参考文档导航 |
| 10 | Install-Configuration · 安装配置 |
| 11 | Configuration-Discovery · 配置发现 |
| 12 | Kubernetes · Kubernetes 配置发现 |
| 13 | Hashicorp · HashiCorp 服务发现 |
| 14 | KV-Stores · KV 存储发现 |
| 15 | Others · File、ECS 与 HTTP 发现 |
| 16 | TLS · TLS 基础设施 |
| 17 | Certificate-Resolvers · 证书解析器 |
| 18 | Observability · 可观测性配置 |
| 19 | Routing-Configuration · 路由配置总览 |
| 20 | Common-Configuration · 通用配置表达 |
| 21 | HTTP · HTTP 处理模型 |
| 22 | Routing · HTTP 路由 |
| 23 | Load-Balancing · HTTP 负载均衡 |
| 24 | TLS · HTTP TLS 配置 |
| 25 | Middlewares · HTTP 中间件 |
| 26 | TCP · TCP 服务与传输 |
| 27 | Routing · TCP 路由 |
| 28 | Middlewares · TCP 中间件 |
| 29 | UDP · UDP 服务 |
| 30 | Routing · UDP 路由 |
| 31 | Kubernetes · Kubernetes 路由配置 |
| 32 | Kubernetes-CRD · Kubernetes CRD 资源总览 |
| 33 | HTTP · HTTP CRD |
| 34 | TCP · TCP 与 TLS CRD |
| 35 | UDP · UDP CRD |
| 36 | Label-&-Tag-Providers · 标签与 Tag 配置 |
| 37 | Security · 协议与多租户安全 |
| 38 | Deprecation-Notices · 弃用与版本支持 |
| 39 | User-Guides · 用户实践指南 |

## 版本与验证范围

材料主体使用 Traefik 3.6 语境，但部分安装示例、支持日期和配置片段存在旧版本残留。正文标明相关边界，采用 v3 规则，并区分 Proxy 内置功能、Hub 功能与实验性能力。

本次整改在 Traefik 3.6.25 的隔离 Compose 环境验证了路径、HTTP/HTTPS认证、双腿mTLS与负向握手、证书轮换、WRR/镜像/Failover、真实IP与限流、TCP/UDP/gRPC/WebSocket、Catalog及观测闭环。章节/来源/代码语法/路线图数据和固定版本CRD schema也已检查。公网ACME签发与自动续期、Kubernetes/Swarm/AWS实际部署仍需相应测试环境，未将配置校验当作平台实测；具体证据和边界见[整改验收记录](../../../docs/traefik/reviews/39-chapters-remediation-2026-09-07.md)。

上一版四册已归档到 `docs/traefik/archive/before-39-chapters/`，公开入口以本篇 39 章笔记为准。`guide.md` 是正式内容源文件，过程稿不应覆盖后续人工编辑。
