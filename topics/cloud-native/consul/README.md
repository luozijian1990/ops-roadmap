# Consul 学习指南

本主题介绍 Consul 的服务发现、服务网格、安全机制、集成与故障排除，适合负责微服务注册、跨节点通信和平台治理的运维工程师。

## 可以学到什么

- 理解 Consul 与 DNS、配置中心、API 网关和服务网格的边界。
- 部署 Agent/Server 集群并使用服务发现与健康检查。
- 配置 Gossip 加密、TLS 和 ACL，治理访问权限。
- 结合 KV、DNS、Connect 等能力完成服务集成。
- 按控制面、网络和数据面定位故障。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 基础、架构与服务管理 | 安装、集群、发现、网格 | [Markdown](./01-foundations-and-services.md) · [Roadmap](./01-foundations-and-services-roadmap.html) |
| 2 | 安全、集成与故障排除 | 加密、ACL、运维诊断 | [Markdown](./02-security-and-operations.md) · [Roadmap](./02-security-and-operations-roadmap.html) |

## 阅读建议

- 先完成单节点实验，再扩展到多 Server 和故障演练。
- 生产变更前验证证书、ACL token 轮换和恢复路径。
