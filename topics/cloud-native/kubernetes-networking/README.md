# Kubernetes 网络学习指南

本主题从网络基础进入 Cilium、Calico、Flannel、Multus 与 IPAM，覆盖数据面实现、策略和生产排障，适合集群网络与平台运维人员。

## 可以学到什么

- 理解 Pod、Service、路由、策略和 CNI 的网络边界。
- 部署并排查 Cilium、Calico、Flannel 数据面。
- 使用 eBPF、NetworkPolicy 和可观测能力定位通信问题。
- 设计 Multus 多网卡、IPAM、地址规划和隔离方案。
- 按节点、路由、插件和服务链路建立排障证据。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 网络基础 | CNI、Service、路由 | [Markdown](./01-network-foundations.md) · [Roadmap](./01-network-foundations-roadmap.html) |
| 2 | Cilium 基础 | eBPF 数据面与策略 | [Markdown](./02-cilium-foundations.md) · [Roadmap](./02-cilium-foundations-roadmap.html) |
| 3 | Cilium 高级 | 性能、可观测与治理 | [Markdown](./03-cilium-advanced.md) · [Roadmap](./03-cilium-advanced-roadmap.html) |
| 4 | Calico 基础 | 路由、策略、组件 | [Markdown](./04-calico-foundations.md) · [Roadmap](./04-calico-foundations-roadmap.html) |
| 5 | Calico 生产 | 集群网络运营 | [Markdown](./05-calico-production.md) · [Roadmap](./05-calico-production-roadmap.html) |
| 6 | Flannel | 简单覆盖网络 | [Markdown](./06-flannel.md) · [Roadmap](./06-flannel-roadmap.html) |
| 7 | Multus 与 IPAM | 多网络和地址管理 | [Markdown](./07-multus-and-ipam.md) · [Roadmap](./07-multus-and-ipam-roadmap.html) |

## 阅读建议

- 先掌握基础数据路径，再按实际 CNI 选择对应章节。
- 变更网络插件前准备节点隔离、连通性基线和回滚方案。
