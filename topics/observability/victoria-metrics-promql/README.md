# VictoriaMetrics PromQL 学习指南

本主题专注 VictoriaMetrics PromQL 查询、Label、函数、聚合、时间偏移和高级分析，服务于监控看板、告警规则和事件诊断。

## 可以学到什么

- 编写向量选择、Label 匹配、算术和比较查询。
- 使用 rate、聚合、时间偏移和窗口函数解释时序变化。
- 识别 Counter/Gauge 语义并避免查询误用。
- 优化查询范围、基数和计算成本。
- 将查询结果转化为告警、SLO 和排障证据。

## 开始学习

| 学习入口 | 适合场景 |
| --- | --- |
| [Markdown](./guide.md) | 跟随示例练习 PromQL |
| [Roadmap](./guide-roadmap.html) | 快速定位语法主题 |

## 阅读建议

- 先掌握选择器和聚合，再学习复杂函数；每个查询用真实时序验证。
- 与 [VictoriaMetrics Flag 参数](../victoria-metrics-flags/README.md) 分工：本篇解决“怎么查”，参数篇解决“怎么运行”。
