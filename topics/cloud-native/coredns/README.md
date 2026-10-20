# CoreDNS 学习指南

本主题围绕一次 DNS 请求的处理过程，学习 CoreDNS 的运行机制、核心插件、Kubernetes DNS 和运维排查。适合需要维护集群解析、企业域名转发或独立 DNS 服务的运维、SRE 和平台工程师。

## 可以学到什么

- 从 Zone 匹配、插件链和响应语义解释一次查询的去向。
- 用 hosts、file、forward、cache、rewrite、template 组合可验证的解析方案。
- 区分 Kubernetes 对象同步、客户端解析策略和 Service 网络路径。
- 理解 NodeLocal DNSCache 的收益、缓存层次与部署边界。
- 使用指标、日志、查询矩阵和故障实验定位解析失败。
- 设计可复查的变更验收、灰度和回滚过程。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 基础与请求处理 | DNS 数据模型、安装、EDNS、启动装配与插件链 | [Markdown](./01-foundations-and-request-flow.md) · [Roadmap](./01-foundations-and-request-flow-roadmap.html) |
| 2 | 核心插件与场景组合 | 权威区域、连接与失败状态、缓存生命周期、规则回答 | [Markdown](./02-plugins-and-scenarios.md) · [Roadmap](./02-plugins-and-scenarios-roadmap.html) |
| 3 | Kubernetes DNS 实践 | Service 记录、对象传播与响应缓存、search/ndots、NodeLocal | [Markdown](./03-kubernetes-dns.md) · [Roadmap](./03-kubernetes-dns-roadmap.html) |
| 4 | 可观测性与故障排查 | PromQL、环路修复、多副本局部状态、性能与发布验收 | [Markdown](./04-observability-and-troubleshooting.md) · [Roadmap](./04-observability-and-troubleshooting-roadmap.html) |

详细章节及逐节来源映射见 [写作大纲](./outline.md)。四篇共 21 章、51 个独立学习单元；H3 为 Roadmap 节点，H4 用于节点内展开机制、操作与边界。
