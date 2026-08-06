# VictoriaMetrics PromQL 学习笔记

> 📘 **文档说明**  
> 本文档基于 VictoriaMetrics 官方文档整理，旨在提供详细的中文学习笔记，帮助快速查询和理解 VictoriaMetrics 查询函数的使用场景。

---

## 📑 目录

### 概述


- [第一章：PromQL 概述](#第一章promql-概述)
- [第二章：基础概念](#第二章基础概念)
- [第三章：Rollup 函数](#第三章rollup-函数)
- [第四章：Label 操作函数](#第四章label-操作函数)
- [第五章：聚合函数](#第五章聚合函数)
- [第六章：转换函数](#第六章转换函数)
- [第七章：函数速查索引](#第七章函数速查索引)
- [附录：VictoriaMetrics vs Prometheus](#附录victoriametrics-vs-prometheus)

---

## 🏷️ 标注规范

### 概述


本文档使用以下标记来标注函数的兼容性：

| 标记 | 说明 |
|------|------|
| ✅ | **Prometheus 原生支持** - 该函数在 Prometheus 中原生可用 |
| 🔵 | **VictoriaMetrics 独有** - 该函数仅在 VictoriaMetrics 中可用 |
| ⚠️ | **VictoriaMetrics 扩展** - Prometheus 有类似功能，但参数或行为有所不同 |

---

## 第一章：PromQL 概述
### 1.1 什么是 PromQL


> 📝 **内容来源**: `promql.txt`


PromQL 是 **Prometheus 系统的查询语言**。它是为绘图、告警或派生时间序列（通过 recording rules）场景而设计的强大且简单的语言。

**设计特点**：

- 从零开始设计，专为时间序列数据库（TSDB）优化
- 与其他查询语言（如 TimescaleDB 的 SQL、InfluxQL 或 Flux）没有共同之处
- 语法清晰简洁，查询表达能力强

**学习曲线**：初学者通常需要花费几个小时阅读官方文档才能理解其工作原理，本文旨在简化和缩短学习曲线。

---

### 1.2 基础查询

#### 1.2.1 查询时间序列

选择时间序列非常简单，只需写入时间序列名称：

```promql
node_network_receive_bytes_total
```

这个查询会返回所有名为 `node_network_receive_bytes_total` 的时间序列。由于同一指标可能有不同的标签组合，可能返回多条结果：

```promql
node_network_receive_bytes_total{device="eth0"}
node_network_receive_bytes_total{device="eth1"}
node_network_receive_bytes_total{device="eth2"}
```

**相比 SQL 的优势**：PromQL 自动处理时间范围和采样降采样机制（通过 `/query_range` 接口的 `start`、`end` 和 `step` 参数），无需在查询中显式声明。

---

### 1.3 Label 过滤

#### 1.3.1 精确匹配

使用 `=` 进行精确匹配：

```promql
node_network_receive_bytes_total{device="eth1"}
```

使用 `!=` 排除特定值：

```promql
node_network_receive_bytes_total{device!="eth1"}
```

#### 1.3.2 正则表达式匹配

使用 `=~` 进行正则匹配（支持 Go RE2 语法）：

```promql
# 匹配 device 以 eth 开头的所有时间序列
node_network_receive_bytes_total{device=~"eth.+"}
```

使用 `!~` 进行正则否定匹配：

```promql
# 排除 device 以 eth 开头的时间序列
node_network_receive_bytes_total{device!~"eth.+"}
```

#### 1.3.3 多标签过滤（AND 逻辑）

多个标签过滤器之间是 **与（AND）** 关系：

```promql
node_network_receive_bytes_total{instance="node42:9100", device=~"eth.+"}
```

#### 1.3.4 OR 逻辑实现

PromQL 原生不支持 OR 运算符于标签过滤，但可通过正则表达式实现：

```promql
# 匹配 device 为 eth1 或 lo 的时间序列
node_network_receive_bytes_total{device=~"eth1|lo"}
```

#### 1.3.5 对指标名称使用正则

指标名称本质上是标签 `__name__` 的值，可以使用正则匹配多个指标：

```promql
{__name__=~"node_network_(receive|transmit)_bytes_total"}
```

---

### 1.4 时间偏移查询

#### 1.4.1 查询历史数据

使用 `offset` 关键字查询历史数据：

```promql
# 查询一周前的数据
node_network_receive_bytes_total offset 7d
```

#### 1.4.2 对比历史与当前

```promql
# 返回当前 GC 开销比一小时前大 1.5 倍的数据点
go_memstats_gc_cpu_fraction > 1.5 * (go_memstats_gc_cpu_fraction offset 1h)
```

---

### 1.5 计算速率（Rate）

#### 1.5.1 为什么需要 Rate

Counter 类型的指标（如网络累计接收字节数）是持续递增的，直接绘图没有实用价值。我们需要计算每秒速率（如 MB/s）。

#### 1.5.2 Rate 函数

`rate()` 函数计算所有匹配时间序列的每秒平均速率：

```promql
rate(node_network_receive_bytes_total[5m])
```

**时间窗口说明**：

- `[5m]` 表示 5 分钟的回看窗口
- 计算公式：`(Vcurr - Vprev) / (Tcurr - Tprev)`，其中 `Tprev = Tcurr - 5m`
- **窗口越大**，曲线越平滑
- **窗口越小**，曲线越抖动

#### 🔵 VictoriaMetrics 扩展

VictoriaMetrics 允许省略时间窗口，默认使用 2 个数据点之间的间隔（`step` 参数，默认 5m）：

```promql
rate(node_network_receive_bytes_total)
```

#### 1.5.3 Rate 使用注意事项

> [!WARNING]
> **Rate 函数的限制**
>
> 1. **只用于 Counter**：不要对可能上下波动的 Gauge 使用 Rate
> 2. **避免使用 irate**：`irate` 不能捕捉尖峰，且性能优势不明显
> 3. **结果不保留指标名称**：Rate 结果会删除 Metric 名称，但保留所有标签

---

### 1.6 算术运算

#### 1.6.1 支持的运算符

PromQL 支持所有基础算术运算：

| 运算符 | 说明 |
|--------|------|
| `+` | 加法 |
| `-` | 减法 |
| `*` | 乘法 |
| `/` | 除法 |
| `%` | 取模 |
| `^` | 指数 |

#### 1.6.2 单位转换示例

```promql
# 将 bytes/s 转换为 bits/s
rate(node_network_receive_bytes_total[5m]) * 8
```

#### 1.6.3 跨指标运算

```promql
co2 * (((temp_c + 273.15) * 1013.25) / (pressure * 298.15))
```

#### 1.6.4 匹配规则

多个时间序列进行算术运算时的匹配规则：

1. PromQL 引擎从运算两侧的时间序列中剥离指标名称，但保留标签
2. 对于左侧的每个时间序列，搜索右侧具有 **相同标签集** 的时间序列
3. 对每个数据点应用运算，返回相同标签集的结果
4. 如果没有找到匹配的标签集，该时间序列会被丢弃

> [!NOTE]
> 匹配规则可通过 `ignoring`、`on`、`group_left` 和 `group_right` 修饰符增强，但逻辑复杂，大多数场景用不上。

---

### 1.7 比较运算

#### 1.7.1 支持的比较运算符

| 运算符 | 说明 |
|--------|------|
| `==` | 等于 |
| `!=` | 不等于 |
| `>` | 大于 |
| `>=` | 大于等于 |
| `<` | 小于 |
| `<=` | 小于等于 |

#### 1.7.2 过滤数据点

```promql
# 只返回小于 2300 字节/秒的带宽
rate(node_network_receive_bytes_total[5m]) < 2300
```

#### 1.7.3 Bool 修饰符

使用 `bool` 修饰符将结果转换为 0（false）或 1（true）：

```promql
rate(node_network_receive_bytes_total[5m]) < bool 2300
```

---

### 1.8 聚合函数

PromQL 支持对时间序列进行分组聚合。时间序列按给定标签集分组，然后对每组应用聚合函数。

**示例**：按实例分组计算所有网络接口的入口流量总和

```promql
sum(rate(node_network_receive_bytes_total[5m])) by (instance)
```

---

### 1.9 处理 Gauge 指标

#### 1.9.1 Gauge 特点

Gauge 是随时可能上下波动的时间序列（如内存使用量、温度、压力）。

#### 1.9.2 常用函数

| 函数 | 说明 |
|------|------|
| `min_over_time` | 时间窗口内的最小值 |
| `max_over_time` | 时间窗口内的最大值 |
| `avg_over_time` | 时间窗口内的平均值 |
| `quantile_over_time` | 时间窗口内的分位数 |

**示例**：

```promql
# 绘制可用内存的最小值
min_over_time(node_memory_MemFree_bytes[5m])
```

#### 🔵 VictoriaMetrics 扩展

VictoriaMetrics 提供了 `rollup_*` 函数，自动返回 min、max 和 avg 值：

```promql
rollup(node_memory_MemFree_bytes)
```

---

### 1.10 Label 操作

#### 1.10.1 ✅ Prometheus 原生函数

| 函数 | 说明 |
|------|------|
| `label_replace` | 替换标签值 |
| `label_join` | 合并多个标签 |

#### 1.10.2 🔵 VictoriaMetrics 扩展函数

VictoriaMetrics 提供了更丰富便捷的 Label 操作函数：

| 函数 | 说明 |
|------|------|
| `label_set` | 为时间序列添加标签 |
| `label_del` | 删除指定标签 |
| `label_keep` | 保留指定标签，删除其他标签 |
| `label_copy` | 复制标签值到新标签 |
| `label_move` | 重命名标签 |
| `label_transform` | 使用正则替换标签值 |
| `label_value` | 将标签值转换为数字 |

---

### 1.11 组合多个查询结果

#### 1.11.1 ✅ Prometheus OR 运算符

使用 `or` 运算符返回多个时间序列：

```promql
metric1 or metric2 or metric3
```

> [!CAUTION]
> **OR 运算符陷阱**  
> 具有重复标签集的结果将被跳过。例如：
>
> ```promql
> sum(a) or sum(b)  # sum(b) 会被跳过，因为两者标签集相同
> ```

#### 1.11.2 🔵 VictoriaMetrics 简化语法

VictoriaMetrics 简化了语法，只需用括号包围：

```promql
(metric1, metric2, metric3)
```

> [!NOTE]
> 括号内可以放置任何 PromQL 表达式，不仅仅是指标名称。

---

### 1.12 VictoriaMetrics vs Prometheus

#### 1.12.1 主要扩展特性

| 特性 | Prometheus | VictoriaMetrics |
|------|------------|-----------------|
| Rate 时间窗口 | 必须指定 | 可省略，默认 step |
| Rollup 函数 | 需分别调用 min/max/avg | `rollup()` 自动返回 |
| Label 操作 | 仅 2 个函数 | 7 个增强函数 |
| OR 语法 | `a or b or c` | `(a, b, c)` |

---

### 1.13 总结

PromQL 是一种 **简单但功能强大** 的时间序列数据库查询语言：

✅ **优势**：

- 语法简洁清晰，相比 SQL/InfluxQL/Flux 更易读
- 自动处理时间范围和降采样
- 强大的聚合和转换能力

⚠️ **局限**：

- 不支持某些 SQL 特性（但实际场景中很少需要）
- 匹配规则需要深入理解才能避免错误

🔵 **VictoriaMetrics 增强**：

- 简化语法（如可省略 rate 时间窗口）
- 增强 Label 操作能力
- 提供更便捷的 Rollup 函数

---

## 第二章：基础概念
### 2.1 过滤器（Filters）


> 📝 **内容来源**: `basic.txt`


#### 2.1.1 基本查询

使用 MetricsQL/PromQL 获取指标数据非常简单，只需写入指标名称：

```promql
foo_bar
```

一个简单的指标名称可能会返回拥有不同标签集的多个时间序列：

```promql
requests_total{path="/", code="200"} 
requests_total{path="/", code="403"}
```

#### 2.1.2 标签过滤

要选择具有特定标签的时间序列，需要在花括号 `{}` 中指定匹配标签的过滤器：

```promql
requests_total{code="200"}
```

**过滤器运算符**：

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `=` | 精确匹配 | `{code="200"}` |
| `!=` | 反向匹配 | `{code!="200"}` |
| `=~` | 正则匹配 | `{code=~"2.*"}` |
| `!~` | 正则反向匹配 | `{code!~"2.*"}` |

**示例**：

```promql
# 正则匹配以 2 开头的状态码
requests_total{code=~"2.*"}
```

#### 2.1.3 组合过滤器

多个过滤器可以组合使用（AND 逻辑）：

```promql
requests_total{code="200", path="/home"}
```

上述查询返回所有名为 `requests_total`，同时带有 `code="200"` 和 `path="/home"` 标签的时间序列。

---

### 2.2 使用指标名称过滤

如数据模型中提到的，指标名称本质上是标签 `__name__` 的值。可以使用正则表达式过滤多个指标：

```promql
{__name__=~"requests_(error|success)_total"}
```

上述查询会返回两个指标的时间序列：

- `requests_error_total`
- `requests_success_total`

---

### 2.3 🔵 多个过滤器的 OR 逻辑

#### 2.3.1 VictoriaMetrics 扩展

MetricsQL 支持在花括号内使用 `or` 分隔多个过滤器，查询至少满足其中一个过滤器的时间序列：

```promql
{job="app1",env="prod" or job="app2",env="dev"}
```

过滤器个数没有限制。此功能可直接对查询到的 series 应用 rollup 函数，无需使用子查询：

```promql
rate({job="app1",env="prod" or job="app2",env="dev"}[5m])
```

> [!TIP]
> **性能优化建议**  
> 如果需要对同一标签使用多个过滤器，从性能角度考虑，最好使用正则表达式：
>
> - ✅ 推荐：`{label=~"value1|...|valueN"}`
> - ⚠️ 避免：`{label="value1" or ... or label="valueN"}`

---

### 2.4 算术运算

#### 2.4.1 ✅ 支持的运算符

MetricsQL 支持所有基础算术运算：

| 运算符 | 说明 |
|--------|------|
| `+` | 加法 |
| `-` | 减法 |
| `*` | 乘法 |
| `/` | 除法 |
| `%` | 取模 |
| `^` | 指数 |

#### 2.4.2 跨指标计算

可以在多个指标之间进行各种计算。例如，计算错误请求率：

```promql
(requests_error_total / (requests_error_total + requests_success_total)) * 100
```

---

### 2.5 合并多个时间序列

#### 2.5.1 匹配规则

要使用算术运算合并多个时间序列，需要了解匹配规则。否则，查询可能出错或给出错误结果。

**匹配规则逻辑**：

1. **去除指标名称**：MetricsQL 引擎从运算左右两侧的所有时间序列中去除指标名称，但保留标签
2. **查找匹配**：对于左侧的每个时间序列，在右侧搜索具有 **相同标签集** 的时间序列
3. **执行运算**：对每个数据点执行运算操作，返回具有相同标签集的结果时间序列
4. **删除无匹配项**：如果没有匹配项，该结果时间序列将从结果中删除

#### 2.5.2 匹配修饰符

匹配规则可以通过以下运算符扩展（高级用法）：

- `ignoring` - 忽略指定标签
- `on` - 只使用指定标签进行匹配
- `group_left` - 左侧多对一匹配
- `group_right` - 右侧多对一匹配

---

### 2.6 比较运算

#### 2.6.1 ✅ 支持的比较运算符

| 运算符 | 说明 |
|--------|------|
| `==` | 等于 |
| `!=` | 不等于 |
| `>` | 大于 |
| `>=` | 大于等于 |
| `<` | 小于 |
| `<=` | 小于等于 |

#### 2.6.2 过滤示例

这些运算符可以像算术运算符一样应用于任意 MetricsQL 表达式。比较运算的结果是只包含匹配成功的时间序列。

**示例**：仅返回内存使用超过 100MB 的进程列表

```promql
process_resident_memory_bytes > 100*1024*1024
```

---

### 2.7 聚合与分组函数

#### 2.7.1 基本概念

MetricsQL 支持对时间序列进行分组聚合：

1. 使用指定的一组标签对时间序列进行分组
2. 对每组时间序列的值应用聚合函数

#### 2.7.2 示例

**按 job 分组计算内存使用量总和**：

```promql
sum(process_resident_memory_bytes) by (job)
```

> [!NOTE]
> 更多聚合函数请参见本文档第五章《聚合函数》。

---

### 2.8 计算速率（Rate）

#### 2.8.1 Rate 函数基础

`rate` 是对 Counter 类型指标使用最广泛的函数，它对每个时间序列独立计算每秒的平均增长率。

**示例**：返回每个 node_exporter 实例监控到的每秒平均入流量

```promql
rate(node_network_receive_bytes_total)
```

#### 2.8.2 🔵 VictoriaMetrics 默认行为

默认情况下，无论是 Instant Query 还是 Range Query，VictoriaMetrics 都使用 `step` 参数指定的作用范围对样本执行 rate 计算。

#### 2.8.3 指定回溯窗口

Rate 需要计算的时间间隔可以在中括号中指定：

```promql
rate(node_network_receive_bytes_total[5m])
```

在此例中，VictoriaMetrics 使用指定的回溯窗口 `5m`（5分钟）来计算平均每秒增长。

**窗口大小的影响**：

- **窗口越大** → 曲线越平滑
- **窗口越小** → 曲线越抖动

> [!WARNING]
> **Rate 使用限制**  
> `rate()` 能且只能用于 Counter 类指标。对 Gauge 类型指标应用 rate 是没有意义的。

#### 2.8.4 Rate 结果的标签处理

`rate` 会保留时间序列中除了指标名称之外的所有标签。如果需要保留指标名称，需要使用 `keep_metric_names` 修饰符。

---

### 2.9 🔵 keep_metric_names 修饰符

#### 2.9.1 为什么需要此修饰符

默认情况下，指标名称会在应用函数或算术运算后被丢弃，因为它们已经失去了原始指标的含义。

当函数作用于多个名称不同的时间序列时，可能会导致 **`duplicate time series` 错误**。

#### 2.9.2 使用方法

使用 `keep_metric_names` 修饰符可以保留指标名称：

```promql
# 计算 rate 后保留指标名称
rate(node_network_receive_bytes_total) keep_metric_names
```

#### 2.9.3 应用场景

**场景 1：对多个指标应用函数**

```promql
# 保留 foo 和 bar 指标名称
rate({__name__=~"foo|bar"}) keep_metric_names
```

**场景 2：算术运算后保留指标名称**

```promql
# 除以 10 后仍保留 foo 和 bar 指标名称
({__name__=~"foo|bar"} / 10) keep_metric_names
```

---

### 2.10 章节总结

#### 2.10.1 核心概念回顾

| 概念 | 关键点 |
|------|--------|
| **过滤器** | 支持精确匹配、正则匹配、组合过滤 |
| **算术运算** | 支持 +、-、*、/、%、^ 六种运算符 |
| **匹配规则** | 基于相同标签集进行匹配和合并 |
| **比较运算** | 支持 ==、!=、>、>=、<、<= 六种比较符 |
| **聚合函数** | 按标签分组后进行聚合计算 |
| **Rate 函数** | 仅用于 Counter，计算每秒平均增长率 |

#### 2.10.2 🔵 VictoriaMetrics 特有功能

| 功能 | 说明 |
|------|------|
| 过滤器 OR 逻辑 | 支持在花括号内使用 `or` 分隔多个过滤器 |
| Rate 默认窗口 | 默认使用 `step` 参数，无需显式指定 |
| keep_metric_names | 修饰符用于保留指标名称，避免重复错误 |

---

## 第三章：Rollup 函数
### 3.1  Rollup 函数概述


> 📝 **内容来源**: `func_rollup.txt`


#### 3.1.1 什么是 Rollup 函数

Rollup 函数（也称为 **范围函数** 或 **窗口函数**）在所选时间序列的给定回溯窗口上对原始样本进行汇总计算。

**示例**：

```promql
avg_over_time(temperature[24h])
```

计算过去 24 小时内所有原始样本的平均温度值。

---

#### 3.1.2 重要特性

**图表绘制**：

- 在 Grafana 中使用 rollup 函数构建图形时，每个点上的 rollup 都是独立计算的
- 例如，`avg_over_time(temperature[24h])` 图表中的每个点显示截止到该时间点的过去 24 小时内的平均温度
- 点之间的间隔由 Grafana 传递给 `/api/v1/query_range` 接口的 `step` 查询参数设置

**独立计算**：

- 如果查询返回多个时间序列，则每个序列都会单独计算汇总

**自动回溯窗口**：

- 如果方括号中的回溯窗口缺失，MetricsQL 会自动将window设置为图表上点之间的间隔
- 例如：`rate(http_requests_total)` 等同于 `rate(http_requests_total[$__interval])` 或 `rate(http_requests_total[1i])`

**自动包装**：

- 每个 MetricsQL 中的序列选择器都必须包装在 rollup 函数中
- 否则会自动被包装成 `default_rollup`
- 例如：`foo{bar="baz"}` 自动转换为 `default_rollup(foo{bar="baz"}[1i])`

**修饰符支持**：

- 所有汇总函数都接受可选的 `keep_metric_names` 修饰符
- 如果设置该修饰符，函数将在结果中保留指标名称

> [!NOTE]
> VictoriaMetrics 的部分 Rollup 函数与 Prometheus 的实现逻辑有一定差异，这些差异会在函数说明中特别标注。

---

### 3.2 函数速查表

#### 3.2.1 按功能分类

| 分类 | 函数列表 |
|------|----------|
| **基础统计** | `avg_over_time`, `min_over_time`, `max_over_time`, `sum_over_time`, `count_over_time` |
| **分位数** | `quantile_over_time`, `quantiles_over_time`, `median_over_time` |
| **变化检测** | `changes`, `changes_prometheus`, `increases_over_time`, `decreases_over_time` |
| **增长率** | `rate`, `irate`, `increase`, `increase_prometheus`, `increase_pure` |
| **导数** | `deriv`, `deriv_fast`, `ideriv` |
| **差值计算** | `delta`, `delta_prometheus`, `idelta`, `range_over_time` |
| **条件计数** | `count_eq_over_time`, `count_gt_over_time`, `count_le_over_time`, `count_ne_over_time` |
| **条件求和** | `sum_eq_over_time`, `sum_gt_over_time`, `sum_le_over_时` |
| **比例计算** | `share_eq_over_time`, `share_gt_over_time`, `share_le_over_time` |
| **高度追踪** | `ascent_over_time`, `descent_over_time` |
| **时间相关** | `timestamp`, `timestamp_with_name`, `tfirst_over_time`, `tlast_over_time`, `tmax_over_time`, `tmin_over_time` |
| **异常检测** | `outlier_iqr_over_time`, `zscore_over_time`, `mad_over_time` |
| **高级汇总** | `rollup`, `rollup_candlestick`, `rollup_delta`, `rollup_deriv`, `rollup_increase`, `rollup_rate`, `rollup_scrape_interval` |
| **其他** | `present_over_time`, `absent_over_time`, `resets`, `lifetime`, `lag`, `duration_over_time` |

#### 3.2.2 Prometheus 兼容性对照表

| 函数 | 兼容性 | 说明 |
|------|--------|------|
| `avg_over_time` | ✅ | Prometheus 原生支持 |
| `min_over_time` | ✅ | Prometheus 原生支持 |
| `max_over_time` | ✅ | Prometheus 原生支持 |
| `sum_over_time` | ✅ | Prometheus 原生支持 |
| `count_over_time` | ✅ | Prometheus 原生支持 |
| `quantile_over_time` | ✅ | Prometheus 原生支持 |
| `stddev_over_time` | ✅ | Prometheus 原生支持 |
| `stdvar_over_time` | ✅ | Prometheus 原生支持 |
| `absent_over_time` | ✅ | Prometheus 原生支持 |
| `present_over_time` | ✅ | Prometheus 原生支持 |
| `last_over_time` | ✅ | Prometheus 原生支持 |
| `rate` | ✅ | Prometheus 原生支持 |
| `irate` | ✅ | Prometheus 原生支持 |
| `increase` | ⚠️ | VictoriaMetrics 扩展版本，考虑窗口前的最后一个样本 |
| `delta` | ⚠️ | VictoriaMetrics 扩展版本 |
| `changes` | ⚠️ | VictoriaMetrics 扩展版本，考虑窗口末尾的变化 |
| `deriv` | ✅ | Prometheus 原生支持 |
| `holt_winters` | ✅ | Prometheus 原生支持 |
| `idelta` | ✅ | Prometheus 原生支持 |
| `predict_linear` | ✅ | Prometheus 原生支持 |
| `resets` | ✅ | Prometheus 原生支持 |
| `timestamp` | ✅ | Prometheus 原生支持 |
| `aggr_over_time` | 🔵 | VictoriaMetrics 独有 |
| `ascent_over_time` | 🔵 | VictoriaMetrics 独有 |
| `descent_over_time` | 🔵 | VictoriaMetrics 独有 |
| `changes_prometheus` | 🔵 | VictoriaMetrics 独有，兼容 Prometheus 逻辑 |
| `delta_prometheus` | 🔵 | VictoriaMetrics 独有，兼容 Prometheus 逻辑 |
| `increase_prometheus` | 🔵 | VictoriaMetrics 独有，兼容 Prometheus 逻辑 |
| `increase_pure` | 🔵 | VictoriaMetrics 独有 |
| `count_*_over_time` 系列 | 🔵 | VictoriaMetrics 独有（除 count_over_time 外）|
| `sum_*_over_time` 系列 | 🔵 | VictoriaMetrics 独有（除 sum_over_time 外）|
| `share_*_over_time` 系列 | 🔵 | VictoriaMetrics 独有 |
| `rollup*` 系列 | 🔵 | VictoriaMetrics 独有 |
| 所有其他函数 | 🔵 | VictoriaMetrics 独有 |

---

### 3.3 函数详细说明

#### 3.3.1 ✅ absent_over_time

```promql
absent_over_time(series_selector[d])
```

**功能**：如果给定的回溯窗口 `d` 不包含原始样本，则返回 1，否则返回空结果。

**兼容性**：✅ Prometheus 原生支持

**参见**：`present_over_time`

---

#### 3.3.2 🔵 aggr_over_time

```promql
aggr_over_time(("rollup_func1", "rollup_func2", ...), series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 上所有列出的 `rollup_func*` 对原始样本进行汇总。

**兼容性**：🔵 VictoriaMetrics 独有

**示例**：

```promql
aggr_over_time(("min_over_time", "max_over_time", "rate"), m[d])
```

对 `m[d]` 同时计算 min_over_time、max_over_time 和 rate。

---

#### 3.3.3 🔵 ascent_over_time

```promql
ascent_over_time(series_selector[d])
```

**功能**：计算给定时间窗口 `d` 上原始样本值的上升。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：GPS 跟踪中跟踪高度增益

**注意**：指标名称将从计算结果中剥离，可使用 `keep_metric_names` 修饰符保留。

**参见**：`descent_over_time`

---

#### 3.3.4 ✅ avg_over_time

```promql
avg_over_time(series_selector[d])
```

**功能**：计算给定时间窗口 `d` 上原始样本值的平均值。

**兼容性**：✅ Prometheus 原生支持

**使用场景**：计算时间段内的平均值

**参见**：`median_over_time`

---

#### 3.3.5 ⚠️ changes

```promql
changes(series_selector[d])
```

**功能**：计算给定时间窗口 `d` 上原始样本值的变化。

**兼容性**：⚠️ VictoriaMetrics 扩展

**与 Prometheus 的差异**：考虑给定时间窗口 `d` 中最后一个样本的变化。

**注意**：指标名称将从计算结果中剥离。

**参见**：`changes_prometheus`

---

#### 3.3.6 🔵 changes_prometheus

```promql
changes_prometheus(series_selector[d])
```

**功能**：计算时间窗口 `d` 中原始样本值变化的次数。

**兼容性**：🔵 VictoriaMetrics 独有

**与 Prometheus 的一致性**：不考虑时间窗口 `d` 之前的最后一个样本值的变化，与 Prometheus 逻辑一致。

**参见**：`changes`

---

#### 3.3.7 🔵 count_eq_over_time

```promql
count_eq_over_time(series_selector[d], eq)
```

**功能**：计算时间窗口 `d` 中原始样本值等于 `eq` 的个数。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`count_over_time`, `count_gt_over_time`, `count_le_over_time`, `count_ne_over_time`

---

#### 3.3.8 🔵 count_gt_over_time

```promql
count_gt_over_time(series_selector[d], gt)
```

**功能**：计算时间窗口 `d` 中原始样本值大于 `gt` 的个数。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 3.3.9 🔵 count_le_over_time

```promql
count_le_over_time(series_selector[d], le)
```

**功能**：计算时间窗口 `d` 中原始样本值小于或等于 `le` 的个数。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 3.3.10 🔵 count_ne_over_time

```promql
count_ne_over_time(series_selector[d], ne)
```

**功能**：计算时间窗口 `d` 中原始样本值不等于 `ne` 的个数。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 3.3.11 ✅ count_over_time

```promql
count_over_time(series_selector[d])
```

**功能**：计算时间窗口 `d` 中原始样本值的个数。

**兼容性**：✅ Prometheus 原生支持

---

#### 3.3.12 🔵 decreases_over_time

```promql
decreases_over_time(series_selector[d])
```

**功能**：计算给定时间窗口 `d` 上原始样本值的下降值。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`increases_over_time`

---

#### 3.3.13 🔵 default_rollup

```promql
default_rollup(series_selector[d])
```

**功能**：返回给定时间窗口 `d` 中最后一个原始样本。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 3.3.14 ⚠️ delta

```promql
delta(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 之前的最后一个样本和该窗口的最后一个样本的差异。

**兼容性**：⚠️ VictoriaMetrics 扩展

**与 Prometheus 的差异**：计算逻辑存在轻微差异。

**参见**：`delta_prometheus`, `increase`

---

#### 3.3.15 🔵 delta_prometheus

```promql
delta_prometheus(series_selector[d])
```

**功能**：计算回溯窗口中第一个样本和最后一个样本的差异。

**兼容性**：🔵 VictoriaMetrics 独有

**与 Prometheus 的一致性**：计算逻辑与 Prometheus delta() 一致。

**参见**：`delta`

---

#### 3.3.16 ✅ deriv

```promql
deriv(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 中时序数据的每秒导数，使用线性回归计算。

**兼容性**：✅ Prometheus 原生支持

**参见**：`deriv_fast`

---

#### 3.3.17 🔵 deriv_fast

```promql
deriv_fast(series_selector[d])
```

**功能**：使用给定回溯窗口 `d` 中第一个和最后一个原始样本来计算每秒导数。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`deriv`

---

#### 3.3.18 🔵 descent_over_time

```promql
descent_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 中原始样本值的下降量。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：GPS 定位中的海拔高度损失追踪。

**参见**：`ascent_over_time`

---

#### 3.3.19 🔵 distinct_over_time

```promql
distinct_over_time(series_selector[d])
```

**功能**：返回给定回溯窗口 `d` 中原始样本值的种类数。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`count_values_over_time`

---

#### 3.3.20 🔵 duration_over_time

```promql
duration_over_time(series_selector[d], max_interval)
```

**功能**：返回时间序列在给定回溯窗口 `d` 内存在的持续时间（秒），相邻样本间隔不超过 `max_interval`。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`lifetime`, `lag`

---

#### 3.3.21 🔵 first_over_time

```promql
first_over_time(series_selector[d])
```

**功能**：返回给定回溯窗口`d` 内的第一个原始样本值。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`last_over_time`, `tfirst_over_time`

---

#### 3.3.22 🔵 geomean_over_time

```promql
geomean_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内原始样本值的几何平均值。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Gauge 指标

---

#### 3.3.23 🔵 histogram_over_time

```promql
histogram_over_time(series_selector[d])
```

**功能**：对给定回溯窗口 `d` 中的原始样本计算 VictoriaMetrics histogram。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：计算出的 histograms 可传递给 `histogram_quantile`，用于计算多个 gauge 指标的分位值。

**示例**：

```promql
histogram_quantile(0.5, sum(histogram_over_time(temperature[24h])) by (vmrange,country))
```

计算每个国家过去 24 小时的温度中位数。

**适用类型**：通常应用于 Gauge 指标

---

#### 3.3.24 ✅ holt_winters

```promql
holt_winters(series_selector[d], sf, tf)
```

**功能**：使用平滑因子 `sf` 和趋势因子 `tf` 对给定回溯窗口 `d` 中的原始样本计算 Holt-Winters 值（double exponential smoothing）。

**兼容性**：✅ Prometheus 原生支持

**参数范围**：`sf` 和 `tf` 的取值范围必须是 [0...1]

**适用类型**：通常应用于 Gauge 指标

**参见**：`range_linear_regression`

---

#### 3.3.25 ✅ idelta

```promql
idelta(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内最后 2 个原始样本值的差异。

**兼容性**：✅ Prometheus 原生支持

**参见**：`delta`

---

#### 3.3.26 🔵 ideriv

```promql
ideriv(series_selector[d])
```

**功能**：基于给定回溯窗口 `d` 中最后五个原始样本计算秒级导数。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`deriv`

---

#### 3.3.27 ⚠️ increase

```promql
increase(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内样本值的增量。

**兼容性**：⚠️ VictoriaMetrics 扩展

**与 Prometheus 的差异**：考虑回溯窗口 `d` 之前的最后一个原始样本值。

**适用类型**：通常应用于 Counter 指标

**参见**：`increase_pure`, `increase_prometheus`, `delta`

---

#### 3.3.28 🔵 increase_prometheus

```promql
increase_prometheus(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内样本值的增量。

**兼容性**：🔵 VictoriaMetrics 独有

**与 Prometheus 的一致性**：不考虑回溯窗口 `d` 之前的最后一个原始样本值，与 Prometheus 逻辑一致。

**适用类型**：通常应用于 Counter 指标

**参见**：`increase_pure`, `increase`

---

#### 3.3.29 🔵 increase_pure

```promql
increase_pure(series_selector[d])
```

**功能**：工作机制和 `increase` 一样，但假定 Counter 总是从 0 开始计数。

**兼容性**：🔵 VictoriaMetrics 独有

**与 increase 的差异**：`increase` 在第一个值过大时会忽略它，而 `increase_pure` 不会。

**适用类型**：通常应用于 Counter 指标

**参见**：`increase`, `increase_prometheus`

---

#### 3.3.30 🔵 increases_over_time

```promql
increases_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内出现增加的原始样本值的数量。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`decreases_over_time`

---

#### 3.3.31 🔵 integrate

```promql
integrate(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内原始样本的积分。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Gauge 指标

---

#### 3.3.32 ✅ irate

```promql
irate(series_selector[d])
```

**功能**：使用给定回溯窗口 `d` 内最后 2 个原始样本计算每秒增量。

**兼容性**：✅ Prometheus 原生支持

**适用类型**：通常应用于 Counter 指标

**参见**：`rate`, `rollup_rate`

---

#### 3.3.33 🔵 lag

```promql
lag(series_selector[d])
```

**功能**：返回给定回溯窗口 `d` 内最后一个样本的时间与当前时间的间隔（秒）。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`lifetime`, `duration_over_time`

---

#### 3.3.34 ✅ last_over_time

```promql
last_over_time(series_selector[d])
```

**功能**：返回给定回溯窗口 `d` 内最后 1 个原始样本。

**兼容性**：✅ Prometheus 原生支持

**参见**：`first_over_time`

---

#### 3.3.35 🔵 lifetime

```promql
lifetime(series_selector[d])
```

**功能**：返回给定回溯窗口 `d` 内第一个和最后一个原始样本的时间间隔（秒）。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`duration_over_time`

---

#### 3.3.36 🔵 mad_over_time

```promql
mad_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内原始样本的 median absolute deviation（中位数绝对偏差）。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Gauge 指标

**参见**：`mad`, `range_mad`, `outlier_iqr_over_time`

---

#### 3.3.37 ✅ max_over_time

```promql
max_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内原始样本的最大值。

**兼容性**：✅ Prometheus 原生支持

**适用类型**：通常应用于 Gauge 指标

**参见**：`tmax_over_time`, `min_over_time`

---

#### 3.3.38 🔵 median_over_time

```promql
median_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内原始样本的中位数。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Gauge 指标

**参见**：`avg_over_time`

---

#### 3.3.39 ✅ min_over_time

```promql
min_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内原始样本的最小值。

**兼容性**：✅ Prometheus 原生支持

**适用类型**：通常应用于 Gauge 指标

**参见**：`tmin_over_time`, `max_over_time`

---

#### 3.3.40 🔵 mode_over_time

```promql
mode_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内原始样本的高频值（众数）。

**兼容性**：🔵 VictoriaMetrics 独有

**假定**：原始样本值都是离散的

**适用类型**：通常应用于 Gauge 指标

---

#### 3.3.41 🔵 outlier_iqr_over_time

```promql
outlier_iqr_over_time(series_selector[d])
```

**功能**：返回给定回溯窗口 `d` 中的最后一个样本，如果它的值小于 `q25-1.5*iqr` 或大于 `q75+1.5*iqr`。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：基于 Gauge 指标的历史数据检测异常。

**示例**：

```promql
outlier_iqr_over_time(memory_usage_bytes[1h])
```

当 `memory_usage_bytes` 指标突然超出过去一小时的平均值时触发。

**适用类型**：通常应用于 Gauge 指标

**参见**：`outliers_iqr`

---

#### 3.3.42 ✅ predict_linear

```promql
predict_linear(series_selector[d], t)
```

**功能**：使用回溯窗口 `d` 中的原始样本值，使用线性回归计算在未来 `t` 秒后的指标值。

**兼容性**：✅ Prometheus 原生支持

**参见**：`range_linear_regression`

---

#### 3.3.43 ✅ present_over_time

```promql
present_over_time(series_selector[d])
```

**功能**：如果给定回溯窗口 `d` 中至少包含一个原始样本，则返回 1，否则返回空。

**兼容性**：✅ Prometheus 原生支持

---

#### 3.3.44 ✅ quantile_over_time

```promql
quantile_over_time(phi, series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内原始样本的 phi 分位值。

**兼容性**：✅ Prometheus 原生支持

**参数范围**：`phi` 值的取值范围必须是 [0...1]

**适用类型**：通常应用于 Gauge 指标

**参见**：`quantiles_over_time`

---

#### 3.3.45 🔵 quantiles_over_time

```promql
quantiles_over_time("phiLabel", phi1, ..., phiN, series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内原始样本的 phi*分位值，为每个 phi* 返回一个带有 `{phiLabel="phi*"}` 标签的独立序列。

**兼容性**：🔵 VictoriaMetrics 独有

**参数范围**：phi* 的取值范围必须是 [0...1]

**适用类型**：通常应用于 Gauge 指标

**参见**：`quantile_over_time`

---

#### 3.3.46 🔵 range_over_time

```promql
range_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内原始样本的取值范围（最大值 - 最小值）。

**兼容性**：🔵 VictoriaMetrics 独有

**等价于**：`max_over_time(series_selector[d]) - min_over_time(series_selector[d])`

**适用类型**：通常应用于 Gauge 指标

---

#### 3.3.47 ✅ rate

```promql
rate(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内原始样本的平均每秒增长值。

**兼容性**：✅ Prometheus 原生支持

**自动窗口**：如果未指定回溯窗口大小，则自动使用 `max(step, scrape_interval)`，避免图表出现非预期断点。

**适用类型**：通常应用于 Counter 指标

**参见**：`irate`, `rollup_rate`

---

#### 3.3.48 🔵 rate_over_sum

```promql
rate_over_sum(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 中原始样本总和的每秒增量。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Gauge 指标

---

#### 3.3.49 ✅ resets

```promql
resets(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 内原始样本中出现 Counter 重置的次数。

**兼容性**：✅ Prometheus 原生支持

**适用类型**：通常应用于 Counter 指标

**使用场景**：Counter 重置通常代表服务发生了重启

---

#### 3.3.50 🔵 rollup

```promql
rollup(series_selector[d])
rollup(series_selector[d], "min|max|avg")
```

**功能**：对给定回溯窗口 `d` 中的原始样本计算最小值、最大值和平均值，并在返回的时序数据中带上 `rollup="min"`, `rollup="max"` 和 `rollup="avg"` 标签。

**兼容性**：🔵 VictoriaMetrics 独有

**可选参数**：可传入 "min"、"max" 或 "avg" 代表只计算一种值且不追加额外的 rollup 标签。

**适用类型**：通常应用于 Gauge 指标

**参见**：`rollup_rate`, `label_match`

---

#### 3.3.51 🔵 rollup_candlestick

```promql
rollup_candlestick(series_selector[d])
rollup_candlestick(series_selector[d], "open|high|low|close")
```

**功能**：对给定回溯窗口 `d` 中的原始样本使用 OHLC 计算 open、high、low 和 close，并在返回的时序数据中带上相应标签。

**兼容性**：🔵 VictoriaMetrics 独有

**可选参数**：可传入 "open"、"high"、"low" 或 "close" 代表只计算一种值。

**适用类型**：通常应用于 Gauge 指标

---

#### 3.3.52 🔵 rollup_delta

```promql
rollup_delta(series_selector[d])
rollup_delta(series_selector[d], "min|max|avg")
```

**功能**：计算给定回溯窗口 `d` 上相邻原始样本之间的差异，并返回计算出的差异的最小值、最大值和平均值。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`rollup_increase`

---

#### 3.3.53 🔵 rollup_deriv

```promql
rollup_deriv(series_selector[d])
rollup_deriv(series_selector[d], "min|max|avg")
```

**功能**：计算给定回溯窗口 `d` 上相邻原始样本之间的每秒导数，并返回计算出的导数的最小值、最大值和平均值。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`rollup`, `rollup_rate`

---

#### 3.3.54 🔵 rollup_increase

```promql
rollup_increase(series_selector[d])
rollup_increase(series_selector[d], "min|max|avg")
```

**功能**：计算给定回溯窗口 `d` 上相邻原始样本之间的增加值，并返回计算出的增加值的最小值、最大值和平均值。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Counter 指标

**参见**：`rollup_delta`, `rollup`, `rollup_rate`

---

#### 3.3.55 🔵 rollup_rate

```promql
rollup_rate(series_selector[d])
rollup_rate(series_selector[d], "min|max|avg")
```

**功能**：计算给定回溯窗口 `d` 上相邻原始样本之间的每秒变化量，并返回计算出的变化量的最小值、最大值和平均值。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Counter 指标

**参见**：`rollup`, `rollup_increase`

---

#### 3.3.56 🔵 rollup_scrape_interval

```promql
rollup_scrape_interval(series_selector[d])
rollup_scrape_interval(series_selector[d], "min|max|avg")
```

**功能**：计算给定回溯窗口 `d` 上相邻原始样本之间的间隔秒数（通常是数据的采集间隔），并返回最小值、最大值和平均值。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`scrape_interval`

---

#### 3.3.57 🔵 scrape_interval

```promql
scrape_interval(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 上相邻原始样本之间的间隔的平均秒数（通常是数据的采集间隔）。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`rollup_scrape_interval`

---

#### 3.3.58 🔵 share_gt_over_time

```promql
share_gt_over_time(series_selector[d], gt)
```

**功能**：返回给定回溯窗口 `d` 上大于 `gt` 的原始样本的比例（范围在 [0...1] 之间）。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：计算 SLI 和 SLO

**示例**：

```promql
share_gt_over_time(up[24h], 0)
```

返回过去 24 小时的服务可用性。

**适用类型**：通常应用于 Gauge 指标

**参见**：`share_le_over_time`, `count_gt_over_time`

---

#### 3.3.59 🔵 share_le_over_time

```promql
share_le_over_time(series_selector[d], le)
```

**功能**：返回给定回溯窗口 `d` 上小于或等于 `le` 的原始样本的比例（范围在 [0...1] 之间）。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：计算 SLI 和 SLO

**示例**：

```promql
share_le_over_time(memory_usage_bytes[24h], 100*1024*1024)
```

返回过去 24 小时内存使用率小于等于 100MB 的时间占比。

**适用类型**：通常应用于 Gauge 指标

**参见**：`share_gt_over_time`, `count_le_over_time`

---

#### 3.3.60 🔵 share_eq_over_time

```promql
share_eq_over_time(series_selector[d], eq)
```

**功能**：返回给定回溯窗口 `d` 上等于 `eq` 的原始样本的比例（范围在 [0...1] 之间）。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Gauge 指标

**参见**：`count_eq_over_time`

---

#### 3.3.61 ✅ stddev_over_time

```promql
stddev_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 上原始样本的标准差。

**兼容性**：✅ Prometheus 原生支持

**适用类型**：通常应用于 Gauge 指标

**参见**：`stdvar_over_time`

---

#### 3.3.62 ✅ stdvar_over_time

```promql
stdvar_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 上原始样本的方差。

**兼容性**：✅ Prometheus 原生支持

**适用类型**：通常应用于 Gauge 指标

**参见**：`stddev_over_time`

---

#### 3.3.63 🔵 sum_eq_over_time

```promql
sum_eq_over_time(series_selector[d], eq)
```

**功能**：计算给定回溯窗口 `d` 上等于 `eq` 的原始样本值的总和。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Gauge 指标

**参见**：`sum_over_time`, `count_eq_over_time`

---

#### 3.3.64 🔵 sum_gt_over_time

```promql
sum_gt_over_time(series_selector[d], gt)
```

**功能**：计算给定回溯窗口 `d` 上大于 `gt` 的原始样本值的总和。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Gauge 指标

**参见**：`sum_over_time`, `count_gt_over_time`

---

#### 3.3.65 🔵 sum_le_over_time

```promql
sum_le_over_time(series_selector[d], le)
```

**功能**：计算给定回溯窗口 `d` 上小于或等于 `le` 的原始样本值的总和。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Gauge 指标

**参见**：`sum_over_time`, `count_le_over_time`

---

#### 3.3.66 ✅ sum_over_time

```promql
sum_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 上原始样本值的总和。

**兼容性**：✅ Prometheus 原生支持

**适用类型**：通常应用于 Gauge 指标

---

#### 3.3.67 🔵 sum2_over_time

```promql
sum2_over_time(series_selector[d])
```

**功能**：计算给定回溯窗口 `d` 上原始样本值的平方和。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Gauge 指标

---

#### 3.3.68 ✅ timestamp

```promql
timestamp(series_selector[d])
```

**功能**：返回给定回溯窗口 `d` 上最后一个原始样本的时间戳（以秒为单位，精确到毫秒）。

**兼容性**：✅ Prometheus 原生支持

**参见**：`time`, `now`, `timestamp_with_name`

---

#### 3.3.69 🔵 timestamp_with_name

```promql
timestamp_with_name(series_selector[d])
```

**功能**：返回给定回溯窗口 `d` 上最后一个原始样本的时间戳（以秒为单位，精确到毫秒）并保留指标名称。

**兼容性**：🔵 VictoriaMetrics 独有

**与 timestamp 的区别**：在汇总结果中保留了 Metric 名称。

**参见**：`timestamp`, `keep_metric_names` 修饰符

---

#### 3.3.70 🔵 tfirst_over_time

```promql
tfirst_over_time(series_selector[d])
```

**功能**：返回给定回溯窗口 `d` 上第一个原始样本的时间戳（以秒为单位，精确到毫秒）。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`first_over_time`

---

#### 3.3.71 🔵 tlast_change_over_time

```promql
tlast_change_over_time(series_selector[d])
```

**功能**：返回给定回溯窗口 `d` 上最后一次变化的时间戳（以秒为单位，精确到毫秒）。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`last_over_time`

---

#### 3.3.72 🔵 tlast_over_time

`tlast_over_time` 是 `timestamp` 函数的别名。

**参见**：`tlast_change_over_time`

---

#### 3.3.73 🔵 tmax_over_time

```promql
tmax_over_time(series_selector[d])
```

**功能**：返回给定回溯窗口 `d` 上具有最大值的原始样本的时间戳（以秒为单位，精确到毫秒）。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`max_over_time`

---

#### 3.3.74 🔵 tmin_over_time

```promql
tmin_over_time(series_selector[d])
```

**功能**：返回给定回溯窗口 `d` 上具有最小值的原始样本的时间戳（以秒为单位，精确到毫秒）。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`min_over_time`

---

#### 3.3.75 🔵 zscore_over_time

```promql
zscore_over_time(series_selector[d])
```

**功能**：返回给定回溯窗口 `d` 上原始样本的 z-score。

**兼容性**：🔵 VictoriaMetrics 独有

**适用类型**：通常应用于 Gauge 指标

---

### 3.4 章节总结

#### 3.4.1 Rollup 函数统计

- **总函数数量**：约 75+ 个
- **Prometheus 原生支持**：约 20 个
- **VictoriaMetrics 独有**：约 50+ 个
- **VictoriaMetrics 扩展**：约 5 个

#### 3.4.2 核心要点

1. **自动窗口**：如果未指定回溯窗口，MetricsQL 会自动使用 step 参数
2. **独立计算**：每个时间序列都会独立计算 Rollup
3. **指标名称处理**：大多数函数会删除指标名称，可使用 `keep_metric_names` 修饰符保留
4. **适用类型**：区分 Counter 和 Gauge 指标的适用函数
5. **兼容性差异**：部分函数与 Prometheus 行为不同，VictoriaMetrics 提供了对应的 `*_prometheus` 版本

---

## 第四章：Label 操作函数
### 4.1 Label 函数概述


> 📝 **内容来源**: `func_label.txt`


Label 操作函数对选定的 Rollup 计算结果进行 Label 转换。

#### 4.1.1 自动 Rollup 转换

如果 Label 操作函数直接应用于 `series_selector`，那么在执行 Label 转换之前，会自动应用 `default_rollup` 函数。

**示例**：

```promql
alias(temperature, "foo")
```

会被隐式转换为：

```promql
alias(default_rollup(temperature), "foo")
```

---

### 4.2 函数列表

#### 4.2.1 🔵 alias

```promql
alias(q, "name")
```

**功能**：将 `q` 返回的所有时间序列重命名为 `name`。

**兼容性**：🔵 VictoriaMetrics 独有

**示例**：

```promql
alias(up, "foobar")
```

将 `up` 序列重命名为 `foobar` 序列。

---

#### 4.2.2 🔵 drop_common_labels

```promql
drop_common_labels(q1, ...., qN)
```

**功能**：删除 `q1, ..., qN` 返回的时间序列中共有的 `label="value"`。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：简化查询结果，删除冗余标签

---

#### 4.2.3 🔵 label_copy

```promql
label_copy(q, "src_label1", "dst_label1", ..., "src_labelN", "dst_labelN")
```

**功能**：将 `src_label*` 的标签值复制到 `q` 返回的所有时间序列的 `dst_label*`。如果 `src_label` 为空，则相应的 `dst_label` 保持不变。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 4.2.4 🔵 label_del

```promql
label_del(q, "label1", ..., "labelN")
```

**功能**：删除 `q` 返回的所有时间序列中名为 `label*` 的所有标签。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 4.2.5 ✅ label_join

```promql
label_join(q, "dst_label", "separator", "src_label1", ..., "src_labelN")
```

**功能**：将 `src_label*` 的值用给定的 `separator` 连接起来，并将结果存储在 `dst_label` 中。

**兼容性**：✅ Prometheus 原生支持

**示例**：

```promql
label_join(up{instance="xxx",job="yyy"}, "foo", "-", "instance", "job")
```

将 `xxx-yyy` 标签值存储到 `foo` 标签中。

---

#### 4.2.6 🔵 label_keep

```promql
label_keep(q, "label1", ..., "labelN")
```

**功能**：删除 `q` 返回的所有时间序列中除列出的 `label*` 标签之外的其他所有标签。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 4.2.7 🔵 label_lowercase

```promql
label_lowercase(q, "label1", ..., "labelN")
```

**功能**：将 `q` 返回的所有时间序列中名为 `label*` 的标签值转换成小写字母。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`label_uppercase`

---

#### 4.2.8 🔵 label_map

```promql
label_map(q, "label", "src_value1", "dst_value1", ..., "src_valueN", "dst_valueN")
```

**功能**：遍历 `q` 返回的所有时间序列，将所有标签值是 `src_value*` 的标签值替换为对应的 `dst_value*`。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：标签值映射转换

---

#### 4.2.9 🔵 label_match

```promql
label_match(q, "label", "regexp")
```

**功能**：删除 `q` 中 label 值不匹配给定正则表达式 `regexp` 的时间序列。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：此函数在类 rollup 函数之后会比较有用，因为这些类 rollup 函数可能会为每个输入序列返回多个时间序列。

**参见**：`label_mismatch`, `labels_equal`

---

#### 4.2.10 🔵 label_mismatch

```promql
label_mismatch(q, "label", "regexp")
```

**功能**：删除 `q` 中 label 值匹配给定正则表达式 `regexp` 的时间序列。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`label_match`, `labels_equal`

---

#### 4.2.11 🔵 label_move

```promql
label_move(q, "src_label1", "dst_label1", ..., "src_labelN", "dst_labelN")
```

**功能**：将 `src_label*` 的标签值移动到 `q` 返回的所有时间序列的 `dst_label*`。如果 `src_label` 为空，则相应的 `dst_label` 保持不变。

**兼容性**：🔵 VictoriaMetrics 独有

**与 label_copy 的区别**：`label_move` 会删除原标签，而 `label_copy` 保留原标签。

---

#### 4.2.12 ✅ label_replace

```promql
label_replace(q, "dst_label", "replacement", "src_label", "regex")
```

**功能**：将给定的正则表达式 `regex` 应用于 `src_label`，如果匹配成功，则将替换内容存储在 `dst_label` 中。替换内容可以包含对正则表达式捕获组的引用（如 `$1`、`$2` 等）。

**兼容性**：✅ Prometheus 原生支持

**示例**：

```promql
label_replace(up{job="node-exporter"}, "foo", "bar-$1", "job", "node-(.+)")
```

将 `bar-exporter` 标签值存储到 `foo` 标签中。

---

#### 4.2.13 🔵 label_set

```promql
label_set(q, "label1", "value1", ..., "labelN", "valueN")
```

**功能**：将 `{label1="value1", ..., labelN="valueN"}` 这些标签添加到 `q` 返回的每条时间序列数据里。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 4.2.14 🔵 label_transform

```promql
label_transform(q, "label", "regexp", "replacement")
```

**功能**：将给定 `label` 中所有匹配正则表达式 `regexp` 的部分替换为指定的 `replacement`。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 4.2.15 🔵 label_uppercase

```promql
label_uppercase(q, "label1", ..., "labelN")
```

**功能**：将 `q` 返回的所有时间序列中名为 `label*` 的标签值转换成大写字母。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`label_lowercase`

---

#### 4.2.16 🔵 label_value

```promql
label_value(q, "label")
```

**功能**：将 `q` 返回的每条时间序列中的给定 `label` 的值作为指标 value 返回（原指标 value 被忽略）。

**兼容性**：🔵 VictoriaMetrics 独有

**示例**：

如果 `label_value(foo, "bar")` 应用于 `foo{bar="1.234"}`，则返回值为 1.234 的时间序列 `foo{bar="1.234"}`。对于标签值是非数值类型的情况，该函数不返回数据。

---

#### 4.2.17 🔵 labels_equal

```promql
labels_equal(q, "label1", "label2", ...)
```

**功能**：在 `q` 返回的每条时间序列里，寻找 "label1"、"label2" 值相等的时间序列并返回。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：过滤具有相同标签值的时间序列

---

#### 4.2.18 🔵 sort_by_label

```promql
sort_by_label(q, "label1", ... "labelN")
```

**功能**：根据给定的一组标签按升序排序序列。

**兼容性**：🔵 VictoriaMetrics 独有

**示例**：

```promql
sort_by_label(foo, "bar")
```

根据这些序列中标签 `bar` 的值对 `foo` 序列进行排序。

**参见**：`sort_by_label_desc`, `sort_by_label_numeric`

---

#### 4.2.19 🔵 sort_by_label_desc

**功能**：`sort_by_label` 的反向操作，即降序排列。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 4.2.20 🔵 sort_by_label_numeric

```promql
sort_by_label_numeric(q, "label1", ... "labelN")
```

**功能**：根据给定的一组标签使用数值排序，按升序排序序列。

**兼容性**：🔵 VictoriaMetrics 独有

**示例**：

如果 `foo` 序列的 `bar` 标签值为 1、101、15 和 2，那么 `sort_by_label_numeric(foo, "bar")` 会按 `bar` 标签值的以下顺序返回序列：**1、2、15、101**。

**与 sort_by_label 的区别**：字符串排序会得到 1、101、15、2，而数值排序得到 1、2、15、101。

---

#### 4.2.21 🔵 sort_by_label_numeric_desc

**功能**：`sort_by_label_numeric` 的反向操作，即降序排列。

**兼容性**：🔵 VictoriaMetrics 独有

---

### 4.3 章节总结

#### 4.3.1 函数统计

- **总函数数量**：21 个
- **Prometheus 原生支持**：2 个（`label_join`, `label_replace`）
- **VictoriaMetrics 独有**：19 个

#### 4.3.2 Prometheus 兼容性对照表

| 函数 | 兼容性 |
|------|--------|
| `label_join` | ✅ Prometheus 原生支持 |
| `label_replace` | ✅ Prometheus 原生支持 |
| 其他所有函数 | 🔵 VictoriaMetrics 独有 |

#### 4.3.3 主要功能分类

| 分类 | 函数列表 |
|------|----------|
| **标签增删** | `label_set`, `label_del`, `label_keep` |
| **标签复制/移动** | `label_copy`, `label_move` |
| **标签转换** | `label_replace`, `label_transform`, `label_join` |
| **大小写转换** | `label_lowercase`, `label_uppercase` |
| **标签映射** | `label_map` |
| **标签过滤** | `label_match`, `label_mismatch`, `labels_equal` |
| **排序** | `sort_by_label`, `sort_by_label_desc`, `sort_by_label_numeric`, `sort_by_label_numeric_desc` |
| **其他** | `alias`, `drop_common_labels`, `label_value` |

---

## 第五章：聚合函数
### 5.1 聚合函数概述


> 📝 **内容来源**: `func_aggregation.txt`


聚合函数对 Rollup 结果中的多个时间序列进行合并聚合计算。

#### 5.1.1 分组聚合

**默认行为**：将所有时间序列聚合到一组里（即聚合后得到一个时间序列）。

**分组修饰符**：

- `by` 修饰符：指定分组标签

```promql
count(up) by (job)
```

按 `job` 标签值对汇总结果进行分组，并对每个组独立进行 count 计算。

- `without` 修饰符：排除特定标签

```promql
count(up) without (instance)
```

在计算 count 聚合之前，按除 `instance` 之外的所有标签对汇总结果进行分组。

#### 5.1.2 多参数支持

聚合函数可以接受任意数量的参数。

**示例**：

```promql
avg(q1, q2, q3)
```

将 `q1`、`q2` 和 `q3` 返回的时间序列合并在一块计算平均值。

#### 5.1.3 Limit N 后缀

聚合函数支持 `limit N` 后缀，可用于限制输出时间序列数量。

**示例**：

```promql
sum(x) by (y) limit 3
```

将聚合的时间序列数量限制为 3。所有其他时间序列将被忽略。

> [!NOTE]
> `limit N` 并不会改善查询性能，前面的聚合语句还是会对所有数据做全量查询和计算，只是在最终返回结果时只取 N 个结果。常见的场景是用于缓解 Grafana 的渲染压力。

#### 5.1.4 自动 Rollup 转换

如果聚合函数直接应用于 `series_selector`，则在计算聚合之前会自动应用 `default_rollup()` 函数。

**示例**：

```promql
count(up)
```

会被隐式转换为：

```promql
count(default_rollup(up))
```

---

### 5.2 函数列表

#### 5.2.1 🔵 any

```promql
any(q) by (group_labels)
```

**功能**：从 `q` 返回的时间序列中，根据 `group_labels` 返回任意一个时间序列。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`group`

---

#### 5.2.2 ✅ avg

```promql
avg(q) by (group_labels)
```

**功能**：根据 `group_labels` 返回时间序列的平均值。聚合是针对每组具有相同时间戳的数据点单独计算的。

**兼容性**：✅ Prometheus 原生支持

---

#### 5.2.3 ✅ bottomk

```promql
bottomk(k, q)
```

**功能**：返回 `q` 返回的所有时间序列中值最小的 `k` 个时间序列。

**兼容性**：✅ Prometheus 原生支持

**参见**：`topk`

---

#### 5.2.4 🔵 bottomk_avg

```promql
bottomk_avg(k, q, "other_label=other_value")
```

**功能**：返回 `q` 中平均值最小的 `k` 个时间序列。如果设置了可选参数 `other_label=other_value`，则返回具有给定标签的剩余时间序列总和。

**兼容性**：🔵 VictoriaMetrics 独有

**示例**：

```promql
bottomk_avg(3, sum(process_resident_memory_bytes) by (job), "job=other")
```

返回最多 3 条平均值最小的时间序列，加上一个带有 `{job="other"}` 标签的时间序列，该序列包含剩余序列的总和（如果有的话）。

---

#### 5.2.5 🔵 bottomk_last

```promql
bottomk_last(k, q, "other_label=other_value")
```

**功能**：返回 `q` 中最后值最小的 `k` 个时间序列。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.6 🔵 bottomk_max

```promql
bottomk_max(k, q, "other_label=other_value")
```

**功能**：返回 `q` 中最大值最小的 `k` 个时间序列。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.7 🔵 bottomk_median

```promql
bottomk_median(k, q, "other_label=other_value")
```

**功能**：返回 `q` 中中位数最小的最多 `k` 个时间序列。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.8 🔵 bottomk_min

```promql
bottomk_min(k, q, "other_label=other_value")
```

**功能**：返回 `q` 中最小值最小的最多 `k` 个时间序列。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.9 ✅ count

```promql
count(q) by (group_labels)
```

**功能**：返回 `q` 返回的时间序列中每个 `group_labels` 的非空点的数量。

**兼容性**：✅ Prometheus 原生支持

---

#### 5.2.10 ✅ count_values

```promql
count_values("label", q)
```

**功能**：计算具有相同值的点的数量，并将计数存储在一个带有额外 label 的时间序列中，该标签包含每个初始值。

**兼容性**：✅ Prometheus 原生支持

---

#### 5.2.11 🔵 distinct

```promql
distinct(q)
```

**功能**：计算每组具有相同时间戳的点的唯一值的数量。类似于 SQL 中的 `COUNT(DISTINCT(value))`。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`distinct_over_time`

---

#### 5.2.12 🔵 geomean

```promql
geomean(q)
```

**功能**：计算每组具有相同时间戳的点的几何平均值。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.13 ✅ group

```promql
group(q) by (group_labels)
```

**功能**：为 `q` 返回的时间序列中每个 `group_labels` 返回值恒为 1 的时间序列。

**兼容性**：✅ Prometheus 原生支持

**参见**：`any`

---

#### 5.2.14 🔵 histogram

```promql
histogram(q)
```

**功能**：计算每组具有相同时间戳的点的 VictoriaMetrics 直方图。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：对于通过热图可视化大量时间序列时非常有用。

**参见**：`histogram_over_time`, `histogram_quantile`

---

#### 5.2.15 🔵 limitk

```promql
limitk(k, q) by (group_labels)
```

**功能**：从 `q` 返回的时间序列中为每个 `group_labels` 挑选最多 `k` 个时间序列返回。返回的时间序列集在多次调用中保持不变。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`limit_offset`

---

#### 5.2.16 🔵 mad

```promql
mad(q) by (group_labels)
```

**功能**：计算 `q` 返回的所有时间序列中每个 `group_labels` 的中位数绝对偏差。

**兼容性**：🔵 VictoriaMetrics 独有

**参见**：`range_mad`, `mad_over_time`, `outliers_mad`, `stddev`

---

#### 5.2.17 ✅ max

```promql
max(q) by (group_labels)
```

**功能**：为 `q` 返回的所有时间序列中每个 `group_labels` 统计出最大值。

**兼容性**：✅ Prometheus 原生支持

---

#### 5.2.18 🔵 median

```promql
median(q) by (group_labels)
```

**功能**：为 `q` 返回的所有时间序列中每个 `group_labels` 统计出中位数。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.19 ✅ min

```promql
min(q) by (group_labels)
```

**功能**：为 `q` 返回的所有时间序列中每个 `group_labels` 统计出最小值。

**兼容性**：✅ Prometheus 原生支持

---

#### 5.2.20 🔵 mode

```promql
mode(q) by (group_labels)
```

**功能**：为 `q` 返回的所有时间序列中每个 `group_labels` 计算出众数。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.21 ✅ quantile

```promql
quantile(phi, q) by (group_labels)
```

**功能**：计算 `q` 返回的所有时间序列中每个 `group_labels` 的 phi 分位数。`phi` 必须在 [0...1] 范围内。

**兼容性**：✅ Prometheus 原生支持

**参见**：`quantiles`, `histogram_quantile`

---

#### 5.2.22 🔵 quantiles

```promql
quantiles("phiLabel", phi1, ..., phiN, q)
```

**功能**：计算 `q` 返回的所有时间序列中的 phi* 分位数，并将它们返回在带有 `{phiLabel="phi*"}` 标签的时间序列中。`phi*` 必须在 [0...1] 范围内。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.23 🔵 share

```promql
share(q) by (group_labels)
```

**功能**：返回 `q` 返回的每个时间戳的每个非负点的份额，范围为 [0..1]，结果中每个 `group_labels` 的份额总和等于 1。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：将直方图桶份额归一化到 [0..1] 范围内。

**示例**：

```promql
share(
  sum(
    rate(http_request_duration_seconds_bucket[5m])
  ) by (le, vmrange)
)
```

---

#### 5.2.24 ✅ stddev

```promql
stddev(q) by (group_labels)
```

**功能**：计算 `q` 返回的所有时间序列中每个 `group_labels` 的标准偏差。

**兼容性**：✅ Prometheus 原生支持

---

#### 5.2.25 ✅ stdvar

```promql
stdvar(q) by (group_labels)
```

**功能**：计算 `q` 返回的所有时间序列中每个 `group_labels` 的标准方差。

**兼容性**：✅ Prometheus 原生支持

---

#### 5.2.26 ✅ sum

```promql
sum(q) by (group_labels)
```

**功能**：返回 `q` 返回的所有时间序列中每个 `group_labels` 的总和。

**兼容性**：✅ Prometheus 原生支持

---

#### 5.2.27 🔵 sum2

```promql
sum2(q) by (group_labels)
```

**功能**：计算 `q` 返回的所有时间序列中每个 `group_labels` 的平方和。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.28 ✅ topk

```promql
topk(k, q)
```

**功能**：返回 `q` 返回的所有时间序列中值最大的前 `k` 个点。

**兼容性**：✅ Prometheus 原生支持

**参见**：`bottomk`

---

#### 5.2.29 🔵 topk_avg

```promql
topk_avg(k, q, "other_label=other_value")
```

**功能**：返回 `q` 中平均值最大的前 `k` 个时间序列。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.30 🔵 topk_last

```promql
topk_last(k, q, "other_label=other_value")
```

**功能**：返回 `q` 中最后值最大的前 `k` 个时间序列。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.31 🔵 topk_max

```promql
topk_max(k, q, "other_label=other_value")
```

**功能**：返回 `q` 中最大值最大的前 `k` 个时间序列。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.32 🔵 topk_median

```promql
topk_median(k, q, "other_label=other_value")
```

**功能**：返回 `q` 中中位数最大的前 `k` 个时间序列。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.33 🔵 topk_min

```promql
topk_min(k, q, "other_label=other_value")
```

**功能**：返回 `q` 中最小值最大的前 `k` 个时间序列。

**兼容性**：🔵 VictoriaMetrics 独有

---

#### 5.2.34 🔵 zscore

```promql
zscore(q) by (group_labels)
```

**功能**：返回 `q` 返回的所有时间序列中每个 `group_labels` 的 z-score 值。

**兼容性**：🔵 VictoriaMetrics 独有

**使用场景**：检测相关时间序列组中的异常值。

---

### 5.3 章节总结

#### 5.3.1 函数统计

- **总函数数量**：34 个
- **Prometheus 原生支持**：11 个
- **VictoriaMetrics 独有**：23 个

#### 5.3.2 Prometheus 兼容性对照表

| 函数 | 兼容性 |
|------|--------|
| `avg` | ✅ Prometheus 原生支持 |
| `bottomk` | ✅ Prometheus 原生支持 |
| `count` | ✅ Prometheus 原生支持 |
| `count_values` | ✅ Prometheus 原生支持 |
| `group` | ✅ Prometheus 原生支持 |
| `max` | ✅ Prometheus 原生支持 |
| `min` | ✅ Prometheus 原生支持 |
| `quantile` | ✅ Prometheus 原生支持 |
| `stddev` | ✅ Prometheus 原生支持 |
| `stdvar` | ✅ Prometheus 原生支持 |
| `sum` | ✅ Prometheus 原生支持 |
| `topk` | ✅ Prometheus 原生支持 |
| 其他所有函数 | 🔵 VictoriaMetrics 独有 |

#### 5.3.3 主要功能分类

| 分类 | 函数列表 |
|------|----------|
| **基础统计** | `avg`, `min`, `max`, `sum`, `count` |
| **分位数** | `quantile`, `quantiles`, `median` |
| **Top/Bottom K** | `topk`, `bottomk`, `topk_*`, `bottomk_*` 系列 |
| **离散度** | `stddev`, `stdvar`, `mad`, `zscore` |
| **其他** | `group`, `any`, `distinct`, `geomean`, `histogram`, `limitk`, `share`, `mode`, `count_values`, `sum2` |

---

## 第六章：转换函数
### 6.1 转换函数概述


> 📝 **内容来源**: `func_transmit.txt`


Transform 函数对 rollup 结果做数值转换。例如，`abs(delta(temperature[24h]))` 计算从 `delta(temperature[24h])` 返回的每条时间序列的每个数据点的绝对值。

#### 6.1.1 自动 Rollup 转换

如果 transform 函数直接应用于 series selector，则在计算转换之前会自动应用 `default_rollup()` 函数。

**示例**：

```promql
abs(temperature)
```

会被隐式转换为：

```promql
abs(default_rollup(temperature))
```

#### 6.1.2 keep_metric_names 修饰符

所有 transform 函数都可使用 `keep_metric_names` 修饰符。如果使用了，则函数不会从结果时间序列中删除 Metric 名称。

---

### 6.2 函数分类速查表

由于转换函数数量众多（80+ 个），以下按功能分类提供速查表。

#### 6.2.1 内置数学函数

| 函数 | 兼容性 | 功能描述 |
|------|--------|----------|
| `pi()` | ✅ | 返回圆周率 π |
| `now()` | 🔵 | 返回当前时间戳（浮点数，单位秒）|
| `rand(seed)` | 🔵 | 返回 [0...1] 范围的随机数 |
| `rand_exponential(seed)` | 🔵 | 返回指数分布的随机数 |
| `rand_normal(seed)` | 🔵 | 返回正态分布的随机数 |

---

#### 6.2.2 单值数值转换

| 函数 | 兼容性 | 功能描述 |
|------|--------|----------|
| `abs(q)` | ✅ | 计算绝对值 |
| `ceil(q)` | ✅ | 向上取整 |
| `floor(q)` | ✅ | 向下取整 |
| `round(q, nearest)` | ✅ | 四舍五入到 nearest 的倍数 |
| `clamp(q, min, max)` | ✅ | 限制在 [min, max] 范围内 |
| `clamp_max(q, max)` | ✅ | 限制最大值为 max |
| `clamp_min(q, min)` | ✅ | 限制最小值为 min |
| `deg(q)` | ✅ | 弧度转角度 |
| `rad(q)` | ✅ | 角度转弧度 |
| `exp(q)` | ✅ | 计算 e^v |
| `sqrt(q)` | ✅ | 计算平方根 |
| `sgn(q)` | ✅ | 符号函数：>0返回1，<0返回-1，=0返回0 |

---

#### 6.2.3 位运算函数

| 函数 | 兼容性 | 功能描述 |
|------|--------|----------|
| `bitmap_and(q, mask)` | 🔵 | 按位与运算 v & mask |
| `bitmap_or(q, mask)` | 🔵 | 按位或运算 v \| mask |
| `bitmap_xor(q, mask)` | 🔵 | 按位异或运算 v ^ mask |

---

#### 6.2.4 直方图（Histogram）函数

| 函数 | 兼容性 | 功能描述 | 使用场景 |
|------|--------|----------|----------|
| `histogram_quantile(phi, buckets)` | ✅ | 计算 phi 分位数 | SLO/SLI 计算 |
| `histogram_quantiles("phiLabel", phi1...phiN, buckets)` | 🔵 | 计算多个分位数 | 性能分析 |
| `histogram_avg(buckets)` | 🔵 | 计算平均值 | 性能统计 |
| `histogram_stddev(buckets)` | 🔵 | 计算标准偏差 | 性能波动分析 |
| `histogram_stdvar(buckets)` | 🔵 | 计算标准方差 | 性能波动分析 |
| `histogram_share(le, buckets)` | 🔵 | 计算落在 le 以下的份额 | SLI/SLO 计算 |
| `buckets_limit(limit, buckets)` | 🔵 | 限制直方图桶数量 | 性能优化 |
| `prometheus_buckets(buckets)` | 🔵 | 转换为 Prometheus 格式 | Grafana 热图 |

**示例**：

```promql
# 计算过去 5 分钟所有请求的中位响应时间
histogram_quantile(0.5, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

---

#### 6.2.5 滑动函数（Running）

| 函数 | 兼容性 | 功能描述 |
|------|--------|----------|
| `running_avg(q)` | 🔵 | 计算滑动平均值 |
| `running_max(q)` | 🔵 | 计算滑动最大值 |
| `running_min(q)` | 🔵 | 计算滑动最小值 |
| `running_sum(q)` | 🔵 | 计算滑动求和 |

**说明**：对于序列中的第 i 个数值，计算第 [1...i] 共 i 个数据点的聚合结果。

---

#### 6.2.6 排序函数

| 函数 | 兼容性 | 功能描述 |
|------|--------|----------|
| `sort(q)` | ✅ | 按最后一个数据点升序排序 |
| `sort_desc(q)` | ✅ | 按最后一个数据点降序排序 |

**参见**：第四章的 `sort_by_label` 系列函数

---

#### 6.2.7 对数函数

| 函数 | 兼容性 | 功能描述 |
|------|--------|----------|
| `ln(q)` | ✅ | 自然对数 ln(v) |
| `log2(q)` | ✅ | 以 2 为底的对数 |
| `log10(q)` | ✅ | 以 10 为底的对数 |

**参见**：`exp(q)` 函数

---

#### 6.2.8 三角函数

| 分类 | 函数 | 兼容性 |
|------|------|--------|
| **基础三角** | `sin(q)`, `cos(q)`, `tan(q)` | ✅ |
| **反三角** | `asin(q)`, `acos(q)`, `atan(q)` | ✅ |
| **双曲三角** | `sinh(q)`, `cosh(q)`, `tanh(q)` | ✅ |
| **反双曲三角** | `asinh(q)`, `acosh(q)`, `atanh(q)` | ✅ |

---

#### 6.2.9 时间函数

| 函数 | 兼容性 | 功能描述 | 返回值范围 |
|------|--------|----------|------------|
| `time()` | ✅ | 返回 Unix 时间戳（秒）| - |
| `start()` | 🔵 | 返回查询开始时间戳 | - |
| `end()` | 🔵 | 返回查询结束时间戳 | - |
| `step()` | 🔵 | 返回数据点间隔（秒）| - |
| `day_of_month(q)` | ✅ | 计算是月份中的第几天 | [1...31] |
| `day_of_week(q)` | ✅ | 计算是一周中的第几天 | [1...7] |
| `day_of_year(q)` | ✅ | 计算是一年中的第几天 | [1...366] |
| `days_in_month(q)` | ✅ | 计算该月总天数 | [28...31] |
| `hour(q)` | ✅ | 提取小时位 | [0...23] |
| `minute(q)` | ✅ | 提取分钟位 | [0...59] |
| `month(q)` | ✅ | 提取月份 | [1...12] |
| `year(q)` | ✅ | 提取年份 | - |
| `timezone_offset(tz)` | 🔵 | 返回时区偏移（秒）| - |

**示例**：

```promql
# 返回 America/Los_Angeles 时区的星期几
day_of_week(time() + timezone_offset("America/Los_Angeles"))
```

---

#### 6.2.10 向量计算函数（Range）

| 函数 | 兼容性 | 功能描述 | 使用场景 |
|------|--------|----------|----------|
| `range_avg(q)` | 🔵 | 计算各点平均值 | 趋势分析 |
| `range_max(q)` | 🔵 | 计算各点最大值 | 峰值识别 |
| `range_min(q)` | 🔵 | 计算各点最小值 | 谷值识别 |
| `range_sum(q)` | 🔵 | 计算各点总和 | 累计统计 |
| `range_median(q)` | 🔵 | 计算各点中位数 | 中心趋势 |
| `range_quantile(phi, q)` | 🔵 | 计算各点分位数 | 分布分析 |
| `range_first(q)` | 🔵 | 返回第一个值 | 基线对比 |
| `range_last(q)` | 🔵 | 返回最后一个值 | 当前值 |
| `range_stddev(q)` | 🔵 | 计算标准偏差 | 波动性分析 |
| `range_stdvar(q)` | 🔵 | 计算方差 | 波动性分析 |
| `range_mad(q)` | 🔵 | 计算中位数绝对偏差 | 异常检测 |
| `range_linear_regression(q)` | 🔵 | 计算线性回归 | 容量规划 |
| `range_normalize(q1, ...)` | 🔵 | 归一化到 [0...1] | 数据对比 |
| `range_trim_outliers(k, q)` | 🔵 | 删除离群值 | 数据清洗 |
| `range_trim_spikes(phi, q)` | 🔵 | 删除最大 phi% 尖峰 | 数据平滑 |
| `range_trim_zscore(z, q)` | 🔵 | 删除超过 z 标准差的点 | 异常过滤 |
| `range_zscore(q)` | 🔵 | 计算 z-score | 标准化 |

**示例**：

```promql
# 容量规划：计算选定时间范围内的线性回归
range_linear_regression(disk_usage_bytes)
```

---

#### 6.2.11 智能预测函数

| 函数 | 兼容性 | 功能描述 | 使用场景 |
|------|--------|----------|----------|
| `smooth_exponential(q, sf)` | 🔵 | 指数移动平均平滑 | 数据平滑 |
| `ru(free, max)` | 🔵 | 计算资源利用率 [0%...100%] | 资源监控 |
| `ttf(free)` | 🔵 | 估算资源耗尽所需时间（秒）| 容量规划 |

**示例**：

```promql
# 计算内存利用率
ru(node_memory_MemFree_bytes, node_memory_MemTotal_bytes)

# 估算存储空间耗尽时间
ttf(node_filesystem_avail_bytes)
```

---

#### 6.2.12 空值处理函数

| 函数 | 兼容性 | 功能描述 |
|------|--------|----------|
| `absent(q)` | ✅ | 无数据返回 1，否则返回空 |
| `scalar(q)` | ✅ | 如果 q 包含一个时间序列则返回，否则返回空 |
| `vector(q)` | ✅ | 返回 q（兼容性函数）|
| `union(q1, ..., qN)` | 🔵 | 返回时间序列的并集 |
| `interpolate(q)` | 🔵 | 线性插值填充空缺 |
| `keep_last_value(q)` | 🔵 | 用前一个非空值填充空缺 |
| `keep_next_value(q)` | 🔵 | 用后一个非空值填充空缺 |
| `drop_empty_series(q)` | 🔵 | 删除没有数值的时间序列 |
| `remove_resets(q)` | 🔵 | 纠正 Counter 重置数据点 |

**使用场景**：

- `absent(q)` - 告警规则：当指标不存在时触发
- `interpolate(q)` - 填补数据空隙
- `keep_last_value(q)` - 保持最后已知值
- `drop_empty_series(q)` - 配合 default 使用

**示例**：

```promql
# 只对非空序列使用 default
drop_empty_series(temperature < 30) default 42
```

---

#### 6.2.13 其他函数

| 函数 | 兼容性 | 功能描述 |
|------|--------|----------|
| `limit_offset(limit, offset, q)` | 🔵 | 跳过 offset 个序列，返回最多 limit 个序列（分页）|

---

### 6.3 章节总结

#### 6.3.1 函数统计

- **总函数数量**：80+ 个
- **Prometheus 原生支持**：约 40 个
- **VictoriaMetrics 独有**：约 45 个

#### 6.3.2 Prometheus 兼容性总览

| 分类 | Prometheus 原生 | VictoriaMetrics 独有 |
|------|-----------------|----------------------|
| 数学函数 | ✅ | 随机数系列 |
| 数值转换 | ✅ 全部 | - |
| 位运算 | - | 🔵 全部 |
| 直方图 | `histogram_quantile` | 其他扩展函数 |
| 滑动函数 | - | 🔵 全部 |
| 排序 | ✅ | - |
| 对数/三角 | ✅ 全部 | - |
| 时间函数 | 部分 | `start`, `end`, `step`, `timezone_offset` |
| 向量计算 | - | 🔵 全部 |
| 预测函数 | - | 🔵 全部 |
| 空值处理 | `absent`, `scalar`, `vector` | 其他扩展函数 |

#### 6.3.3 使用建议

**按场景分类**：

1. **单位换算**：`abs`, `clamp`, `round` 等数值转换函数
2. **SLO/SLI 计算**：`histogram_quantile`, `histogram_share`
3. **时间过滤**：`hour`, `day_of_week`, `timezone_offset`
4. **容量规划**：`range_linear_regression`, `ttf`, `ru`
5. **趋势分析**：`smooth_exponential`, `running_avg`, `range_*` 系列
6. **数据清洗**：`range_trim_*` 系列, `drop_empty_series`
7. **告警优化**：`absent`, `keep_last_value`, `interpolate`
8. **性能分析**：直方图系列函数
9. **异常检测**：`range_mad`, `range_zscore`, `outlier_*` 系列

> [!TIP]
> **性能提示**  
>
> - 向量计算函数（`range_*`）会处理整个时间范围的数据，适合做总体分析
> - 直方图函数适合百分位数计算，比 `quantile_over_time` 更准确
> - 空值处理函数可以提高查询的稳定性，避免告警误报

---

## 第七章：函数速查索引

### 7.1 按字母排序的完整函数列表

本索引包含所有 200+ 个函数，按字母顺序排列，方便快速查找。

#### A

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `absent(q)` | Transform | ✅ | 6.2.12 |
| `absent_over_time(series_selector[d])` | Rollup | ✅ | 3.3.1 |
| `abs(q)` | Transform | ✅ | 6.2.2 |
| `acos(q)` | Transform | ✅ | 6.2.8 |
| `acosh(q)` | Transform | ✅ | 6.2.8 |
| `aggr_over_time(...)` | Rollup | 🔵 | 3.3.2 |
| `alias(q, "name")` | Label | 🔵 | 4.2.1 |
| `any(q) by (...)` | Aggregation | 🔵 | 5.2.1 |
| `ascent_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.3 |
| `asin(q)` | Transform | ✅ | 6.2.8 |
| `asinh(q)` | Transform | ✅ | 6.2.8 |
| `atan(q)` | Transform | ✅ | 6.2.8 |
| `atanh(q)` | Transform | ✅ | 6.2.8 |
| `avg(q) by (...)` | Aggregation | ✅ | 5.2.2 |
| `avg_over_time(series_selector[d])` | Rollup | ✅ | 3.3.4 |

#### B

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `bitmap_and(q, mask)` | Transform | 🔵 | 6.2.3 |
| `bitmap_or(q, mask)` | Transform | 🔵 | 6.2.3 |
| `bitmap_xor(q, mask)` | Transform | 🔵 | 6.2.3 |
| `bottomk(k, q)` | Aggregation | ✅ | 5.2.3 |
| `bottomk_avg(k, q, ...)` | Aggregation | 🔵 | 5.2.4 |
| `bottomk_last(k, q, ...)` | Aggregation | 🔵 | 5.2.5 |
| `bottomk_max(k, q, ...)` | Aggregation | 🔵 | 5.2.6 |
| `bottomk_median(k, q, ...)` | Aggregation | 🔵 | 5.2.7 |
| `bottomk_min(k, q, ...)` | Aggregation | 🔵 | 5.2.8 |
| `buckets_limit(limit, buckets)` | Transform | 🔵 | 6.2.4 |

#### C

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `ceil(q)` | Transform | ✅ | 6.2.2 |
| `changes(series_selector[d])` | Rollup | ⚠️ | 3.3.5 |
| `changes_prometheus(series_selector[d])` | Rollup | 🔵 | 3.3.6 |
| `clamp(q, min, max)` | Transform | ✅ | 6.2.2 |
| `clamp_max(q, max)` | Transform | ✅ | 6.2.2 |
| `clamp_min(q, min)` | Transform | ✅ | 6.2.2 |
| `cos(q)` | Transform | ✅ | 6.2.8 |
| `cosh(q)` | Transform | ✅ | 6.2.8 |
| `count(q) by (...)` | Aggregation | ✅ | 5.2.9 |
| `count_eq_over_time(series_selector[d], eq)` | Rollup | 🔵 | 3.3.7 |
| `count_gt_over_time(series_selector[d], gt)` | Rollup | 🔵 | 3.3.8 |
| `count_le_over_time(series_selector[d], le)` | Rollup | 🔵 | 3.3.9 |
| `count_ne_over_time(series_selector[d], ne)` | Rollup | 🔵 | 3.3.10 |
| `count_over_time(series_selector[d])` | Rollup | ✅ | 3.3.11 |
| `count_values("label", q)` | Aggregation | ✅ | 5.2.10 |

#### D

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `day_of_month(q)` | Transform | ✅ | 6.2.9 |
| `day_of_week(q)` | Transform | ✅ | 6.2.9 |
| `day_of_year(q)` | Transform | ✅ | 6.2.9 |
| `days_in_month(q)` | Transform | ✅ | 6.2.9 |
| `decreases_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.12 |
| `default_rollup(series_selector[d])` | Rollup | 🔵 | 3.3.13 |
| `deg(q)` | Transform | ✅ | 6.2.2 |
| `delta(series_selector[d])` | Rollup | ⚠️ | 3.3.14 |
| `delta_prometheus(series_selector[d])` | Rollup | 🔵 | 3.3.15 |
| `deriv(series_selector[d])` | Rollup | ✅ | 3.3.16 |
| `deriv_fast(series_selector[d])` | Rollup | 🔵 | 3.3.17 |
| `descent_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.18 |
| `distinct(q)` | Aggregation | 🔵 | 5.2.11 |
| `distinct_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.19 |
| `drop_common_labels(q1, ..., qN)` | Label | 🔵 | 4.2.2 |
| `drop_empty_series(q)` | Transform | 🔵 | 6.2.12 |
| `duration_over_time(series_selector[d], max_interval)` | Rollup | 🔵 | 3.3.20 |

#### E

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `end()` | Transform | 🔵 | 6.2.9 |
| `exp(q)` | Transform | ✅ | 6.2.2 |

#### F

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `first_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.21 |
| `floor(q)` | Transform | ✅ | 6.2.2 |

#### G

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `geomean(q)` | Aggregation | 🔵 | 5.2.12 |
| `geomean_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.22 |
| `group(q) by (...)` | Aggregation | ✅ | 5.2.13 |

#### H

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `histogram(q)` | Aggregation | 🔵 | 5.2.14 |
| `histogram_avg(buckets)` | Transform | 🔵 | 6.2.4 |
| `histogram_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.23 |
| `histogram_quantile(phi, buckets)` | Transform | ✅ | 6.2.4 |
| `histogram_quantiles(...)` | Transform | 🔵 | 6.2.4 |
| `histogram_share(le, buckets)` | Transform | 🔵 | 6.2.4 |
| `histogram_stddev(buckets)` | Transform | 🔵 | 6.2.4 |
| `histogram_stdvar(buckets)` | Transform | 🔵 | 6.2.4 |
| `holt_winters(series_selector[d], sf, tf)` | Rollup | ✅ | 3.3.24 |
| `hour(q)` | Transform | ✅ | 6.2.9 |

#### I

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `idelta(series_selector[d])` | Rollup | ✅ | 3.3.25 |
| `ideriv(series_selector[d])` | Rollup | 🔵 | 3.3.26 |
| `increase(series_selector[d])` | Rollup | ⚠️ | 3.3.27 |
| `increase_prometheus(series_selector[d])` | Rollup | 🔵 | 3.3.28 |
| `increase_pure(series_selector[d])` | Rollup | 🔵 | 3.3.29 |
| `increases_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.30 |
| `integrate(series_selector[d])` | Rollup | 🔵 | 3.3.31 |
| `interpolate(q)` | Transform | 🔵 | 6.2.12 |
| `irate(series_selector[d])` | Rollup | ✅ | 3.3.32 |

#### K

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `keep_last_value(q)` | Transform | 🔵 | 6.2.12 |
| `keep_next_value(q)` | Transform | 🔵 | 6.2.12 |

#### L

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `label_copy(q, ...)` | Label | 🔵 | 4.2.3 |
| `label_del(q, ...)` | Label | 🔵 | 4.2.4 |
| `label_join(q, ...)` | Label | ✅ | 4.2.5 |
| `label_keep(q, ...)` | Label | 🔵 | 4.2.6 |
| `label_lowercase(q, ...)` | Label | 🔵 | 4.2.7 |
| `label_map(q, ...)` | Label | 🔵 | 4.2.8 |
| `label_match(q, "label", "regexp")` | Label | 🔵 | 4.2.9 |
| `label_mismatch(q, "label", "regexp")` | Label | 🔵 | 4.2.10 |
| `label_move(q, ...)` | Label | 🔵 | 4.2.11 |
| `label_replace(q, ...)` | Label | ✅ | 4.2.12 |
| `label_set(q, ...)` | Label | 🔵 | 4.2.13 |
| `label_transform(q, ...)` | Label | 🔵 | 4.2.14 |
| `label_uppercase(q, ...)` | Label | 🔵 | 4.2.15 |
| `label_value(q, "label")` | Label | 🔵 | 4.2.16 |
| `labels_equal(q, ...)` | Label | 🔵 | 4.2.17 |
| `lag(series_selector[d])` | Rollup | 🔵 | 3.3.33 |
| `last_over_time(series_selector[d])` | Rollup | ✅ | 3.3.34 |
| `lifetime(series_selector[d])` | Rollup | 🔵 | 3.3.35 |
| `limit_offset(limit, offset, q)` | Transform | 🔵 | 6.2.13 |
| `limitk(k, q) by (...)` | Aggregation | 🔵 | 5.2.15 |
| `ln(q)` | Transform | ✅ | 6.2.7 |
| `log2(q)` | Transform | ✅ | 6.2.7 |
| `log10(q)` | Transform | ✅ | 6.2.7 |

#### M

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `mad(q) by (...)` | Aggregation | 🔵 | 5.2.16 |
| `mad_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.36 |
| `max(q) by (...)` | Aggregation | ✅ | 5.2.17 |
| `max_over_time(series_selector[d])` | Rollup | ✅ | 3.3.37 |
| `median(q) by (...)` | Aggregation | 🔵 | 5.2.18 |
| `median_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.38 |
| `min(q) by (...)` | Aggregation | ✅ | 5.2.19 |
| `min_over_time(series_selector[d])` | Rollup | ✅ | 3.3.39 |
| `minute(q)` | Transform | ✅ | 6.2.9 |
| `mode(q) by (...)` | Aggregation | 🔵 | 5.2.20 |
| `mode_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.40 |
| `month(q)` | Transform | ✅ | 6.2.9 |

#### N

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `now()` | Transform | 🔵 | 6.2.1 |

#### O

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `outlier_iqr_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.41 |

#### P

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `pi()` | Transform | ✅ | 6.2.1 |
| `predict_linear(series_selector[d], t)` | Rollup | ✅ | 3.3.42 |
| `present_over_time(series_selector[d])` | Rollup | ✅ | 3.3.43 |
| `prometheus_buckets(buckets)` | Transform | 🔵 | 6.2.4 |

#### Q

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `quantile(phi, q) by (...)` | Aggregation | ✅ | 5.2.21 |
| `quantile_over_time(phi, series_selector[d])` | Rollup | ✅ | 3.3.44 |
| `quantiles(...)` | Aggregation | 🔵 | 5.2.22 |
| `quantiles_over_time(...)` | Rollup | 🔵 | 3.3.45 |

#### R

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `rad(q)` | Transform | ✅ | 6.2.2 |
| `rand(seed)` | Transform | 🔵 | 6.2.1 |
| `rand_exponential(seed)` | Transform | 🔵 | 6.2.1 |
| `rand_normal(seed)` | Transform | 🔵 | 6.2.1 |
| `range_*` 系列 | Transform | 🔵 | 6.2.10 |
| `rate(series_selector[d])` | Rollup | ✅ | 3.3.47 |
| `rate_over_sum(series_selector[d])` | Rollup | 🔵 | 3.3.48 |
| `remove_resets(q)` | Transform | 🔵 | 6.2.12 |
| `resets(series_selector[d])` | Rollup | ✅ | 3.3.49 |
| `rollup*` 系列 | Rollup | 🔵 | 3.3.50-56 |
| `round(q, nearest)` | Transform | ✅ | 6.2.2 |
| `ru(free, max)` | Transform | 🔵 | 6.2.11 |
| `running_*` 系列 | Transform | 🔵 | 6.2.5 |

#### S

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `scalar(q)` | Transform | ✅ | 6.2.12 |
| `scrape_interval(series_selector[d])` | Rollup | 🔵 | 3.3.57 |
| `sgn(q)` | Transform | ✅ | 6.2.2 |
| `share(q) by (...)` | Aggregation | 🔵 | 5.2.23 |
| `share_*_over_time` 系列 | Rollup | 🔵 | 3.3.58-60 |
| `sin(q)` | Transform | ✅ | 6.2.8 |
| `sinh(q)` | Transform | ✅ | 6.2.8 |
| `smooth_exponential(q, sf)` | Transform | 🔵 | 6.2.11 |
| `sort(q)` | Transform | ✅ | 6.2.6 |
| `sort_by_label*` 系列 | Label | 🔵 | 4.2.18-21 |
| `sort_desc(q)` | Transform | ✅ | 6.2.6 |
| `sqrt(q)` | Transform | ✅ | 6.2.2 |
| `start()` | Transform | 🔵 | 6.2.9 |
| `stddev(q) by (...)` | Aggregation | ✅ | 5.2.24 |
| `stddev_over_time(series_selector[d])` | Rollup | ✅ | 3.3.61 |
| `stdvar(q) by (...)` | Aggregation | ✅ | 5.2.25 |
| `stdvar_over_time(series_selector[d])` | Rollup | ✅ | 3.3.62 |
| `step()` | Transform | 🔵 | 6.2.9 |
| `sum(q) by (...)` | Aggregation | ✅ | 5.2.26 |
| `sum2(q) by (...)` | Aggregation | 🔵 | 5.2.27 |
| `sum2_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.67 |
| `sum_*_over_time` 系列 | Rollup | 🔵 | 3.3.63-66 |

#### T

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `tan(q)` | Transform | ✅ | 6.2.8 |
| `tanh(q)` | Transform | ✅ | 6.2.8 |
| `t*_over_time` 系列 | Rollup | 🔵 | 3.3.70-74 |
| `time()` | Transform | ✅ | 6.2.9 |
| `timestamp(series_selector[d])` | Rollup | ✅ | 3.3.68 |
| `timestamp_with_name(series_selector[d])` | Rollup | 🔵 | 3.3.69 |
| `timezone_offset(tz)` | Transform | 🔵 | 6.2.9 |
| `topk(k, q)` | Aggregation | ✅ | 5.2.28 |
| `topk_*` 系列 | Aggregation | 🔵 | 5.2.29-33 |
| `ttf(free)` | Transform | 🔵 | 6.2.11 |

#### U

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `union(q1, ..., qN)` | Transform | 🔵 | 6.2.12 |

#### V

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `vector(q)` | Transform | ✅ | 6.2.12 |

#### Y

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `year(q)` | Transform | ✅ | 6.2.9 |

#### Z

| 函数 | 类型 | 兼容性 | 章节 |
|------|------|--------|------|
| `zscore(q) by (...)` | Aggregation | 🔵 | 5.2.34 |
| `zscore_over_time(series_selector[d])` | Rollup | 🔵 | 3.3.75 |

---

### 7.2 VictoriaMetrics 独有函数列表

以下函数仅在 VictoriaMetrics 中可用（标注为 🔵）：

#### Rollup 函数（50+）

`aggr_over_time`, `ascent_over_time`, `changes_prometheus`, `count_eq_over_time`, `count_gt_over_time`, `count_le_over_time`, `count_ne_over_time`, `decreases_over_time`, `default_rollup`, `delta_prometheus`, `deriv_fast`, `descent_over_time`, `distinct_over_time`, `duration_over_time`, `first_over_time`, `geomean_over_time`, `histogram_over_time`, `ideriv`, `increase_prometheus`, `increase_pure`, `increases_over_time`, `integrate`, `lag`, `lifetime`, `mad_over_time`, `median_over_time`, `mode_over_time`, `outlier_iqr_over_time`, `quantiles_over_time`, `range_over_time`, `rate_over_sum`, `rollup*` 系列, `scrape_interval`, `share_eq_over_time`, `share_gt_over_time`, `share_le_over_time`, `sum_eq_over_time`, `sum_gt_over_time`, `sum_le_over_time`, `sum2_over_time`, `tfirst_over_time`, `timestamp_with_name`, `tlast_change_over_time`, `tmax_over_time`, `tmin_over_time`, `zscore_over_time`

#### Label 函数（19）

`alias`, `drop_common_labels`, `label_copy`, `label_del`, `label_keep`, `label_lowercase`, `label_map`, `label_match`, `label_mismatch`, `label_move`, `label_set`, `label_transform`, `label_uppercase`, `label_value`, `labels_equal`, `sort_by_label`, `sort_by_label_desc`, `sort_by_label_numeric`, `sort_by_label_numeric_desc`

#### Aggregation 函数（23）

`any`, `bottomk_avg`, `bottomk_last`, `bottomk_max`, `bottomk_median`, `bottomk_min`, `distinct`, `geomean`, `histogram`, `limitk`, `mad`, `median`, `mode`, `quantiles`, `share`, `sum2`, `topk_avg`, `topk_last`, `topk_max`, `topk_median`, `topk_min`, `zscore`

#### Transform 函数（45）

`bitmap_and`, `bitmap_or`, `bitmap_xor`, `buckets_limit`, `drop_empty_series`, `end`, `histogram_avg`, `histogram_quantiles`, `histogram_share`, `histogram_stddev`, `histogram_stdvar`, `interpolate`, `keep_last_value`, `keep_next_value`, `limit_offset`, `now`, `prometheus_buckets`, `rand`, `rand_exponential`, `rand_normal`, `range_*` 系列, `remove_resets`, `ru`, `running_*` 系列, `smooth_exponential`, `start`, `step`, `timezone_offset`, `ttf`, `union`

---

### 7.3 按使用场景分类

#### 监控场景

**基础指标监控**：

- `rate`, `irate` - Counter 速率计算
- `avg_over_time`, `max_over_time`, `min_over_time` - Gauge 聚合
- `histogram_quantile` - 延迟百分位数

**资源监控**：

- `ru` - 资源利用率计算
- `clamp`, `clamp_max` - 值范围限制
- `running_sum`, `running_avg` - 滑动统计

#### 告警场景

**告警触发**：

- `absent` - 指标缺失检测
- `changes` - 变化次数检测
- `resets` - Counter 重置检测（服务重启）
- `outlier_iqr_over_time` - 异常值检测

**告警优化**：

- `keep_last_value` - 避免数据空隙导致误报
- `drop_empty_series` - 过滤空序列
- `interpolate` - 数据插值

**SLI/SLO 计算**：

- `histogram_quantile` - P99/P95 计算
- `histogram_share` - SLO 达标率
- `share_gt_over_time`, `share_le_over_time` - 可用性百分比

#### 性能分析场景

**延迟分析**：

- `histogram_quantile` - 请求延迟分位数
- `histogram_avg` - 平均延迟
- `histogram_stddev` - 延迟波动

**趋势分析**：

- `range_linear_regression` - 线性趋势
- `smooth_exponential` - 平滑曲线
- `deriv` - 变化率

**Top N 分析**：

- `topk`, `bottomk` - 最大/最小 K 个值
- `topk_avg`, `bottomk_avg` - 按平均值排序
- `sort`, `sort_desc` - 排序

#### 容量规划场景

**容量预测**：

- `ttf` - 资源耗尽时间预测
- `predict_linear` - 线性预测
- `range_linear_regression` - 趋势回归

**资源分析**：

- `ru` - 当前资源利用率
- `range_max`, `range_min` - 峰值/谷值识别
- `rate_over_sum` - 增长率分析

#### 数据处理场景

**数据清洗**：

- `range_trim_outliers` - 删除离群值
- `range_trim_spikes` - 删除尖峰
- `range_trim_zscore` - Z-score 过滤

**数据转换**：

- `abs`, `round`, `ceil`, `floor` - 数值转换
- `label_replace`, `label_transform` - 标签转换
- `range_normalize` - 归一化

**数据填充**：

- `interpolate` - 线性插值
- `keep_last_value` - 前向填充
- `keep_next_value` - 后向填充

#### 时间相关场景

**时间过滤**：

- `hour`, `day_of_week`, `month` - 时间提取
- `timezone_offset` - 时区处理

**时间聚合**：

- `*_over_time` 系列 - 时间窗口聚合
- `rollup*` 系列 - 多维度汇总

---

### 7.4 快速查询指南

#### 我想

**计算 Counter 速率** → `rate`, `irate`  
**计算 Gauge 平均值** → `avg_over_time`  
**计算 P99 延迟** → `histogram_quantile(0.99, ...)`  
**检测指标缺失** → `absent`  
**检测异常值** → `outlier_iqr_over_time`, `range_zscore`  
**预测资源耗尽时间** → `ttf`  
**计算资源利用率** → `ru`  
**填充数据空隙** → `interpolate`, `keep_last_value`  
**删除离群值** → `range_trim_outliers`  
**按标签排序** → `sort_by_label`  
**重命名指标** → `alias`  
**计算 Top 10** → `topk(10, ...)`  
**计算服务可用性** → `share_gt_over_time(up[24h], 0)`  
**检测服务重启** → `resets`  
**平滑数据曲线** → `smooth_exponential`, `running_avg`

---

## 附录：VictoriaMetrics vs Prometheus

### A.1 语法差异总结

#### A.1.1 核心差异

| 特性 | Prometheus | VictoriaMetrics |
|------|-----------|-----------------|
| **查询语言** | PromQL | MetricsQL（PromQL 超集）|
| **函数总数** | ~70 个 | 200+ 个 |
| **OR 语法** | `{label=~"value1\\|value2"}` | `{label=~"value1\\|value2"}` 或 `{label="value1"} or {label="value2"}` |
| **默认 rate 窗口** | 需显式指定 | 自动使用 `[5m]` 或2倍抓取间隔 |
| **keep_metric_names** | 部分函数支持 | 所有函数支持 |

#### A.1.2 行为差异

**1. increase/delta 函数**

```promql
# Prometheus: 可能返回小数
increase(http_requests[5m])

# VictoriaMetrics: 返回整数增量（更准确）
increase(http_requests[5m])

# VictoriaMetrics 提供了完全兼容版本
increase_prometheus(http_requests[5m])
```

**2. changes 函数**

```promql
# Prometheus: 返回值变化次数（不计算首个点）
changes(temperature[1h])

# VictoriaMetrics: 默认计算首个点，更符合直觉
changes(temperature[1h])

# 完全兼容版本
changes_prometheus(temperature[1h])
```

**3. 自动 Rollup 转换**

```promql
# Prometheus: 必须显式使用 _over_time
max(up)  # 错误

# VictoriaMetrics: 自动转换
max(up)  # 自动转换为 max(default_rollup(up))
```

---

### A.2 性能优化特性

#### A.2.1 VictoriaMetrics 独有优化

**1. 更高效的查询执行**

- **并行查询**：自动并行处理多个时间序列
- **智能采样**：对于大时间范围查询自动降采样
- **查询缓存**：缓存常见查询结果

**2. 内存优化**

```promql
# 传统计数方式（内存密集）
count(up)

# VictoriaMetrics 优化的计数
count(up)  # 内部优化，低内存消耗
```

**3. 磁盘 I/O 优化**

- **列式存储**：减少磁盘读取
- **压缩存储**：平均 70% 压缩率
- **智能索引**：快速标签查询

#### A.2.2 查询优化建议

**使用 VictoriaMetrics 特定函数**：

```promql
# 优化前：使用通用聚合
avg_over_time(
  sum(rate(http_requests[5m])) by (path)
[1h:5m])

# 优化后：使用 rollup_rate
rollup_rate(
  sum(http_requests) by (path)
[1h:5m])
```

**利用自动窗口**：

```promql
# 无需显式指定 [5m]
rate(http_requests)  # VictoriaMetrics 自动使用合适窗口

# Prometheus 必须显式指定
rate(http_requests[5m])
```

---

### A.3 迁移注意事项

#### A.3.1 从 Prometheus 迁移到 VictoriaMetrics

**✅ 完全兼容（无需修改）**：

1. 所有基础 PromQL 查询
2. 标准聚合函数（`sum`, `avg`, `max`, `min`, `count`）
3. 标准 Rollup 函数（`rate`, `irate`, `increase`, `avg_over_time` 等）
4. Label 过滤和匹配
5. 运算符（`+`, `-`, `*`, `/`, `and`, `or`, `unless`）

**⚠️ 需要关注（行为可能不同）**：

1. **increase/delta 计算**
   - VictoriaMetrics 默认返回整数
   - 如需完全兼容，使用 `*_prometheus` 版本

2. **changes 函数**
   - 计算逻辑略有不同
   - 建议测试验证结果

3. **自动 Rollup**
   - VictoriaMetrics 会自动转换
   - Prometheus 会报错

**🔵 可选优化（利用新特性）**：

1. **使用 VictoriaMetrics 独有函数**

   ```promql
   # 资源利用率
   ru(node_memory_MemFree_bytes, node_memory_MemTotal_bytes)
   
   # 资源耗尽预测
   ttf(node_filesystem_avail_bytes)
   
   # 异常检测
   outlier_iqr_over_time(response_time[1h])
   ```

2. **简化查询**

   ```promql
   # 优化前
   rate(http_requests[5m])
   
   # 优化后（省略窗口）
   rate(http_requests)
   ```

3. **使用高级聚合**

   ```promql
   # Top K 按平均值
   topk_avg(10, http_request_duration_seconds)
   
   # 中位数聚合
   median(response_time) by (endpoint)
   ```

#### A.3.2 迁移检查清单

**步骤 1：兼容性检查**

- [ ] 检查所有告警规则
- [ ] 检查所有 Grafana 查询
- [ ] 检查自定义查询脚本
- [ ] 验证 `increase`/`delta`/`changes` 函数结果

**步骤 2：功能测试**

- [ ] 对比相同查询在两个系统的结果
- [ ] 验证告警触发逻辑
- [ ] 测试 Dashboard 显示
- [ ] 检查数据准确性

**步骤 3：性能优化**

- [ ] 识别可以优化的查询
- [ ] 使用 VictoriaMetrics 独有函数
- [ ] 优化大时间范围查询
- [ ] 配置查询缓存

**步骤 4：监控迁移**

- [ ] 监控查询响应时间
- [ ] 监控资源使用（CPU/内存/磁盘）
- [ ] 设置告警阈值
- [ ] 验证数据完整性

#### A.3.3 常见问题解决

**Q1: 查询结果与 Prometheus 不一致**

```promql
# 检查是否是 increase/delta/changes 差异
# 使用 *_prometheus 版本验证
increase_prometheus(metric[5m])
delta_prometheus(metric[5m])
changes_prometheus(metric[5m])
```

**Q2: 告警误报**

```promql
# 可能是自动 Rollup 导致
# 显式指定 Rollup 函数
avg_over_time(metric[5m])  # 而不是 avg(metric)
```

**Q3: 性能不如预期**

- 检查是否启用了查询缓存
- 优化标签基数
- 使用更高效的聚合函数
- 考虑使用 `rollup*` 系列函数

---

### A.4 最佳实践

#### A.4.1 查询编写建议

**1. 明确指定时间窗口**（推荐）

虽然 VictoriaMetrics 支持自动窗口，但为了可移植性：

```promql
# 推荐：显式指定
rate(http_requests[5m])

# 可用但不推荐：依赖自动窗口
rate(http_requests)
```

**2. 使用 keep_metric_names**

保留指标名称以提高可读性：

```promql
rate(http_requests[5m])
  keep_metric_names
```

**3. 利用标签操作函数**

```promql
# 重命名指标
alias(complex_metric_name, "simple_name")

# 添加上下文标签
label_set(metric, "env", "prod", "team", "platform")
```

#### A.4.2 性能优化建议

**1. 减少标签基数**

```promql
# 避免：高基数标签
sum(rate(http_requests[5m])) by (user_id)  # user_id 可能有百万级

# 推荐：低基数标签
sum(rate(http_requests[5m])) by (endpoint, method)
```

**2. 使用预聚合**

```promql
# 避免：实时聚合大量序列
sum(rate(http_requests[5m])) by (endpoint)

# 推荐：记录规则预聚合
# 在 recording rule 中预先计算
```

**3. 限制查询范围**

```promql
# 使用 limit 减少返回序列
topk(10, http_requests)

# 使用时间范围限制
rate(http_requests{job="api"}[5m])
```

#### A.4.3 告警规则建议

**1. 使用空值处理**

```promql
# 避免数据空隙导致误报
(rate(http_errors[5m]) / rate(http_requests[5m]))
  keep_last_value
> 0.05
```

**2. 使用 absent 检测缺失指标**

```promql
# 检测服务是否上报指标
absent(up{job="critical-service"})
```

**3. 组合多个条件**

```promql
# 综合判断服务状态
(
  up{job="api"} == 0
  or
  rate(http_errors{job="api"}[5m]) > 10
)
```

---

## 📚 参考资源

### 概述


- [VictoriaMetrics 官方文档](https://docs.victoriametrics.com/)
- [Prometheus 官方文档](https://prometheus.io/docs/)

---

**文档版本**: v1.0  
**最后更新**: 2025-11-25  
**维护者**: @luozijian
