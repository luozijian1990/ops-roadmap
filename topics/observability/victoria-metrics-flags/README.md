# VictoriaMetrics Flag 参数学习指南

本主题按组件整理 VictoriaMetrics Flag 参数、数据采集代理、告警与备份配置，适合作为部署、调优和故障排查时的参数参考。

## 可以学到什么

- 区分单节点、集群及生态组件的职责和参数范围。
- 按存储、采集、告警、备份维度查找 Flag。
- 评估参数对资源、数据保留、吞吐和可靠性的影响。
- 在变更前建立配置基线并验证启动、运行和恢复行为。

## 开始学习

| 学习入口 | 适合场景 |
| --- | --- |
| [Markdown](./guide.md) | 参数检索与实践说明 |
| [Roadmap](./guide-roadmap.html) | 按组件浏览参数结构 |

## 阅读建议

- 将本文作为参考手册，结合 [VictoriaMetrics 主线](../victoria-metrics/README.md) 理解架构。
- 任何 Flag 变更都先在非生产环境验证，并保留旧配置以便回滚。
