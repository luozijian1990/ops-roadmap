# Prometheus 学习指南

本主题介绍 Prometheus 数据模型、指标类型、PromQL、抓取、告警与联邦等核心能力，适合构建监控、排障和 SLO 观测基础。

## 可以学到什么

- 设计指标名、Label 和时间序列，理解 Cardinality 风险。
- 配置抓取、记录规则、告警规则和 Alertmanager 集成。
- 使用 PromQL 进行过滤、聚合、速率和时间窗口分析。
- 诊断抓取失败、数据缺失、告警误报和存储压力。
- 将监控指标用于容量、SLO 和事件排障。

## 开始学习

| 学习入口 | 适合场景 |
| --- | --- |
| [Markdown](./guide.md) | 系统阅读 Prometheus 概念与实践 |
| [Roadmap](./guide-roadmap.html) | 按章节定位知识点 |

## 阅读建议

- 先掌握数据模型和 PromQL，再编写告警；每条告警都应有处置路径。
- 生产环境控制 Label 基数并监控自身抓取与存储健康。
