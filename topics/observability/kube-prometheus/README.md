# Kube-Prometheus 学习指南

本主题围绕 Prometheus Operator、CRD、目标发现、告警和 Grafana，面向 Kubernetes 集群监控平台的部署与治理。

## 可以学到什么

- 部署 Prometheus、Alertmanager 和 Grafana 组件。
- 理解 Prometheus、ServiceMonitor、PodMonitor、PrometheusRule 等 CRD。
- 配置目标发现、抓取、告警路由和静默。
- 诊断 Operator、抓取目标、规则评估和告警链路问题。
- 为集群监控建立容量、权限和升级策略。

## 开始学习

| 学习入口 | 适合场景 |
| --- | --- |
| [Markdown](./guide.md) | 系统学习部署与 CRD |
| [Roadmap](./guide-roadmap.html) | 快速浏览章节 |

## 阅读建议

- 先在测试集群部署，再逐步接入生产命名空间和告警规则。
- 变更 CRD 或 Operator 前确认版本兼容和告警回滚方案。
