# OpenTelemetry 学习笔记 · 第三卷：生产运维与故障排查

> 面向已经理解应用接入与 Collector 管道的运维、SRE 和平台工程师。本卷从状态、容量、可靠性、安全和证据链解释生产使用中的取舍。
> 资料核查日期：2026-09-19。可复制 Collector 片段仍采用 contrib 0.136.0 教学基线，不代表当前受维护版本或生产推荐配置；上线前应重新做版本、安全与运行验证。
> 故障实验仅适用于自行创建的隔离 lab。未在本次环境执行 Docker / Kubernetes 故障注入；表格中的数值算例、预期和填写模板均不是实测报告。
> 前置阅读：第一卷、第二卷。三卷正文可独立阅读；主题 README 和 HTML 提供学习导航。

| 章节 | 要解决的生产问题 |
| --- | --- |
| 第 18 章 | 为什么 Collector 不能一律无状态扩容？ |
| 第 19 章 | 后端异常时，数据到底停在哪里？ |
| 第 20 章 | 怎样监控观测系统并逐层排障？ |
| 第 21 章 | 如何约束敏感数据、租户边界与成本？ |
| 第 22 章 | 如何在不重建已有体系的前提下接入与升级？ |
| 第 23 章 | 如何从错误接口形成可复查的诊断证据？ |

## 第 18 章：有状态处理、路由与容量

### 18.1 识别按 Trace 或指标流保存的状态

“Collector 是转发器，所以直接增加 replicas 就能扩容”只适用于一部分路径。只要组件需要记住之前收到的数据，扩容就涉及**状态由谁拥有、下一条相关数据应该去哪里、成员变化时怎么办**。

最常见的误区是用 Push / Pull 简单区分有状态和无状态。尾采样接收的是 Push 数据，却需要按 Trace 保存状态；Delta 转 Cumulative 同样接收 Push 数据，却需要按指标流保存累计值。判断依据应是处理语义，不是传输方向。

| 组件或任务 | 关键状态 | 合理的归属键 | 普通随机负载均衡的风险 |
| --- | --- | --- | --- |
| 尾采样 | 未决 Span 与采样决定 | Trace ID | 同一 Trace 被拆到多台 |
| Delta → Cumulative | 已累计值、开始时间 | 完整指标流身份 | 累计重置、分裂或混算 |
| Span Metrics | 维度聚合、计数与桶 | 聚合维度与明确写入者 | 同一累计序列由多台竞争写入 |
| Prometheus receiver | 抓取目标与 scrape 行为 | target / shard | 同一目标被多副本重复抓取 |
| filelog | 文件指纹、读取偏移 | 节点与文件 | 重复读取或错过轮转窗口 |
| Exporter queue | 待发送批次 | 具体 exporter 实例与存储 | 扩容后旧积压不会自动搬家 |

#### 将状态画到架构图里

```mermaid
flowchart LR
    A[业务来源] --> B[无状态接收与校验]
    B --> C[按状态键路由]
    C --> D[状态处理实例 1]
    C --> E[状态处理实例 2]
    D --> F[各自导出队列]
    E --> G[各自导出队列]
    F --> H[后端]
    G --> H
```

图中“无状态接收”也仍可能有短暂内存、连接和队列；这里说的是不依赖长期关联状态即可处理不同数据批次，不意味着进程随时被杀都没有影响。运维术语需要放在具体故障模型中解释。

Span Metrics 的单写入者问题尤其容易被“后端会自动求和”掩盖。两个实例各自生成同名、同标签的累计 Counter，不等于一个合法的总 Counter；需要保留写入者区分后查询聚合，或采用合适的分区和聚合策略。随意删除 `instance` 一类标签可能把正确的分片变成数据碰撞。

扩容评审最少要问：状态是否能重建、谁承接新数据、旧实例如何排空、丢失会影响哪些查询，以及是否可以接受短暂不完整。若这些问题没有答案，先增加单实例容量或缩小接入范围，往往比盲目 HPA 更可控。


### 18.2 设计尾采样的 Trace 亲和路由

尾采样要求一条 Trace 的候选 Span 尽量汇聚到同一个决策实例。HTTP Round Robin、Kubernetes 普通 Service 和 gRPC 长连接负载均衡，都不天然按 Trace ID 分流。它们可能把 A 的 Span 与 B 的 Span 发到不同采样器，从而出现一个实例只见到正常上游、另一个只见到下游错误。

解决思路是在采样层前设置能识别 Trace ID 的路由层。contrib 0.136.0 的 `loadbalancing` exporter 可以按 Trace ID 一致性选择后端。**它的目标应是最终采样实例，而不是一个还会随机分流的中间 Service VIP。**

```mermaid
flowchart LR
    A[service-a Span] --> R[路由 Collector]
    B[service-b Span] --> R
    R -->|Trace X| T1[tail-1]
    R -->|Trace Y| T2[tail-2]
    T1 --> J[Jaeger]
    T2 --> J
```

#### 双层教学配置

文件 `router.yaml` 作为第一卷 `otel-collector` 的配置，替换原挂载的配置内容。本配置只展示 traces，**不保留第二卷附加的 metrics / logs pipeline**；做此实验时关闭应用 Metrics，或者主动把原管道合并保留。

```yaml
# 完整 router.yaml，作用于原 otel-collector 服务。
extensions:
  health_check:
    endpoint: 0.0.0.0:13133
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 400
    spike_limit_mib: 80
  batch:
    timeout: 1s
    send_batch_size: 256
    send_batch_max_size: 512
exporters:
  loadbalancing:
    routing_key: traceID
    protocol:
      otlp:
        timeout: 5s
        tls:
          insecure: true
        sending_queue:
          enabled: true
          queue_size: 500
        retry_on_failure:
          enabled: true
          initial_interval: 1s
          max_interval: 5s
          max_elapsed_time: 30s
    resolver:
      static:
        hostnames: [tail-1:4317, tail-2:4317]
service:
  extensions: [health_check]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [loadbalancing]
```

文件 `tail.yaml` 由两个尾采样实例共享读取，但它们的内存状态并不共享：

```yaml
# 完整 tail.yaml；只用于两个采样实例。
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 400
    spike_limit_mib: 80
  tail_sampling:
    decision_wait: 5s
    num_traces: 10000
    expected_new_traces_per_sec: 100
    decision_cache:
      sampled_cache_size: 50000
      non_sampled_cache_size: 50000
    policies:
      - name: errors
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: slow
        type: latency
        latency:
          threshold_ms: 500
      - name: baseline
        type: probabilistic
        probabilistic:
          sampling_percentage: 10
  batch:
    timeout: 1s
    send_batch_size: 256
    send_batch_max_size: 512
exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, tail_sampling, batch]
      exporters: [otlp/jaeger]
```

在原 Compose 中增加两个服务：

```yaml
# Compose 增量；router 服务仍使用原来的 otel-collector 名称。
services:
  tail-1:
    image: otel/opentelemetry-collector-contrib:0.136.0
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./tail.yaml:/etc/otelcol/config.yaml:ro
    depends_on: [jaeger]
    mem_limit: 512m
  tail-2:
    image: otel/opentelemetry-collector-contrib:0.136.0
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./tail.yaml:/etc/otelcol/config.yaml:ro
    depends_on: [jaeger]
    mem_limit: 512m
```

原 `otel-collector` 的配置挂载改为 `./router.yaml:/etc/otelcol/config.yaml:ro`，并把启动依赖改为 `[tail-1, tail-2]`。先对两份配置运行 Collector 校验，再启动。应用仍向 `otel-collector:4318` 发送，根采样保持 1，不需要知道采样分片在哪台。

#### Kubernetes 场景中的关键区别

使用 DNS resolver 时，应解析 Headless Service 的最终 Pod 地址，而不是所有路由器都只拿到一个普通 ClusterIP。多个路由 Collector 必须看到一致的成员列表和路由设置，才能对同一 Trace 做出一致选择；DNS 更新延迟和成员变化仍会导致短暂分歧。

`loadbalancing` 的队列和重试还分外层 exporter 与每个目标的内部 OTLP exporter。本例设置的是 `protocol.otlp` 下每个目标的策略，不承诺目标永久消失后自动无损重路由。不要把普通 OTLP exporter 的持久化片段直接放进共享配置的每个子 exporter；该基线对此有明确限制。


### 18.3 评估等待窗口与内存需求

尾采样容量不能只按入口 HTTP QPS 估计。真正进入这个采样实例的新 Trace 速率、每条 Trace 持有多少 Span、属性大小、等待窗口、决策缓存与其他 pipeline 共同决定占用。

设每秒新进入的不同 Trace 数为 `λ`，决策等待为 `W` 秒。稳定输入下，可以先用 `N ≈ λ × W` 估计未决 Trace 的数量级，再为突发、迟到和不均衡保留余量。它是规划近似，不是组件实际内存的精确公式。

```text
内存估算项：
  基础进程与 Runtime
+ 未决 Trace 索引
+ 未决 Span 与属性对象
+ 已决 Trace 的决定缓存
+ receiver 解码和连接缓冲
+ batch 与 exporter queue
+ 其他 pipeline 和安全余量
```

#### 一个只用于说明计算过程的算例

假设某个实例每秒接收 500 条新 Trace，每条平均持有 8 个 Span，等待窗口 10 秒，粗略按每个持有 Span 1 KiB 的堆占用估计。则未决 Trace 数约 5000，Span 部分约 `500 × 8 × 10 × 1024` 字节，即约 39.1 MiB。

**39.1 MiB 不是应配置的 Collector 内存。** 它没有包含上面其他项目，而且“每 Span 1 KiB”是假设，不是序列化后大小或真实堆测量。JSON / Protobuf 字节数、压缩后网络字节数和 Go 对象堆占用不能相互替代。

| 测量项 | 建议方法 | 用途 |
| --- | --- | --- |
| 新 Trace / 秒 | 在隔离窗口按不同 ID 统计，或使用组件实际遥测 | 估计未决 Trace 数 |
| Span / Trace 分布 | 正常、错误、重试、批量分别抽样 | 识别长尾请求 |
| 属性与事件大小 | 检查巨型堆栈、SQL、请求正文 | 找体积异常来源 |
| RSS / Heap | Collector 自监控与容器指标 | 验证估算是否偏小 |
| 拒绝、丢弃与决策超时 | 固定版本组件指标 / 日志 | 找容量与窗口问题 |
| 队列与出口速率 | 自监控加后端写入观察 | 区分处理瓶颈与后端瓶颈 |

调大 `num_traces` 只扩大可容纳的状态范围，并不会凭空提供内存；把它设得极大可能使容器更容易触达 OOM。增大 `decision_wait` 可以等到更多迟到 Span，但会延后可查询时间，并提高未决状态数量。

容量验证应至少分别产生正常短链、错误带堆栈、长链并发三类输入。最后再加入受控后端中断，观察队列叠加是否突破内存边界。测试吞吐、延迟与丢失情况需要实际记录，本笔记不提供未经测量的“几核支持多少万 QPS”。


### 18.4 验证扩缩容、重启和迟到数据

一致性哈希减少成员变化时的重新分配范围，但它不是状态复制协议。Trace 前半段已经在 tail-1，扩容后后半段被路由到 tail-3，并不会因为两台使用同一个采样策略就自动合并。

因此尾采样部署至少需要区分三类事件：路由成员集变化、采样实例进程重启、迟到 Span 超出决策或缓存窗口。它们的结果可能表现为不完整 Trace、不同采样决定、重复查询结果或完全缺失。

| 事件 | 可能影响 | 验证方法 |
| --- | --- | --- |
| 只增加接收层副本 | 后端列表不一致时仍可能分流不一致 | 核对各路由器解析结果和配置 |
| 增加采样实例 | 一部分 Trace 重新归属 | 发持续的较长请求，核对前后半链 |
| 采样实例崩溃 | 其未决内存状态丢失 | 对比已导出与尚未决策的请求 |
| 缩容并移除路由成员 | 新 Span 不再进入旧实例 | 排空窗口与路由切换配合 |
| 迟到 Span | 依缓存和版本策略处理 | 人为延迟单个 Span 后观察 |

#### 一个有边界的扩容实验

在 18.2 的隔离环境中，先对多条 `slow` 请求建立完整性基线，再加入第三个尾采样实例，并更新路由器成员列表。保存每个请求的案例号、Trace ID、各服务日志及后端 Span 集合；不要只比较“总 Trace 数增加了”。

如果某条 Trace 查到了五个预期 Span 中的三个，应记录是链不完整，而不是因为 ID 能查到就算通过。若只有正常短请求，在更新窗口里可能刚好没有跨越成员变化的 Trace，测试结果也不能证明生产长事务无风险。

缩容时常见思路是先停止分配新工作，再等待旧状态完成并导出，最后终止实例。但针对尚在执行的 Trace，“新的 Span”可能属于旧的 Trace，简单从成员表删除会影响它们的归属。是否需要稳定分片、分阶段路由或可接受的损失窗口，取决于业务目标，不能用一句 preStop sleep 解决所有情况。

#### 迟到与决定缓存

`sampled_cache_size` 与 `non_sampled_cache_size` 保存已经做出的决定，能在一定范围内帮助迟到数据保持一致；缓存有限且在内存中，重启或淘汰之后不会永久记得所有 Trace。增大缓存还会增加内存，必须一起测量。

尾采样前若存在 `groupbytrace` 等额外聚合层，会再引入一份等待状态，可能改变输入批次和路由时机。它不是默认必需组件，也不是无损保证。先清楚当前问题是否来自路由、窗口、状态丢失或后端，再决定是否引入更多状态。


### 18.5 根据瓶颈决定扩哪里并验证扩容效果

扩容不是只给 Collector Deployment 增加 replicas。首先区分接收解码、复杂转换、抓取调度、状态保留、网络与后端写入这几个阶段，再决定增加 CPU/内存、拆分信号、分片抓取还是扩后端。

#### 用组合证据识别瓶颈

| 观察结果 | 优先验证的瓶颈 | 可考虑的动作 |
| --- | --- | --- |
| CPU 持续高，复杂转换耗时大，后端健康 | 解码、正则或 OTTL 处理 | 缩小规则范围、提高单实例 CPU，评估无状态分片 |
| 内存与尾采样候选数同时增长 | Trace 等待窗口与状态容量 | 调整窗口/候选量，按 Trace ID 分片 |
| 出口队列上升，后端同时限流或变慢 | 后端接收能力 | 限制入口、退避或扩后端，避免盲目加并发 |
| 部分实例满载，其他实例几乎无输入 | 连接和负载分配 | 检查 gRPC 长连接与 LB 策略 |
| 抓取时长接近抓取间隔，目标越来越多 | scrape 工作量 | Target Allocator 或明确的目标分片 |
| logs 挤占 traces 的 CPU、内存或出口 | 不同信号的资源竞争 | 按信号/来源拆分进程并保留身份 |

队列利用率是提示信号，不是统一的扩容按钮。60%～70% 只能作为某个环境的候选阈值；应结合持续时间、输入速率、恢复所需余量和扩容生效时间。`send_failed` 上升也不能直接等同于永久丢失，要核对 exporter 的重试阶段与指标定义。

扩大队列只增加缓冲窗口，不增加持续处理能力。如果 `rout ≤ rin`，扩大后队列仍会填满。后端已经饱和时，增加 Collector 可能扩大同时重试的规模，让后端恢复更慢。

#### gRPC 长连接为什么可能让新增副本空闲

L4 负载均衡通常按连接分配目标。一个持续复用的 OTLP/gRPC 连接可能一直访问同一实例，增加后端副本后旧连接也未必重新分配。需要依据 SDK、代理和部署能力选择支持 gRPC 的 L7 路由或经过验证的客户端负载策略。

但将 RPC 分布均匀与按 Trace ID 归属是两个目标：前者改善无状态接收负载，后者保护尾采样状态。不能用普通 round-robin 替代第 18.2 节的 Trace 路由；也不能假定换成 Sidecar 后自然解决所有连接分布问题。

扩容前后使用第 20 章 Collector 自监控的逐实例接收速率，结合连接数、CPU、RSS、队列和端到端查询延迟。总接收量不变、旧实例继续满载且新实例长期为空，说明副本创建成功但分流没有达到目标。

#### 一次可归因的扩缩容实验

先固定输入速率和数据大小，记录各实例基线；只改变一项容量或副本参数，等待发现、连接与采集周期稳定后再比较。验收既包括延迟和拒绝是否下降，也包括字段、采样与统计口径是否保持一致。

缩容前确认待发送队列、尾采样候选和抓取归属如何处理。移除一个实例不会把旧积压自动迁给其他实例；新旧成员视图也可能短暂不一致。记录被移除实例的最后输入、最后成功输出和关闭时间，比只看剩余 Pod 数更能解释缺失数据。

若启用 HPA，应让信号与瓶颈对应并设置稳定窗口、最小容量和最大副本边界。这里只给扩容判断方法，不给脱离实际负载的通用 HPA YAML；CPU 指标无法单独代表尾采样状态量或后端限流。

## 第 19 章：队列、重试、持久化与背压

### 19.1 区分处理缓冲和导出队列

要回答“后端断了会不会丢”，必须先指出数据所在位置。应用已经结束 Span，不等于数据已经离开进程；Collector 已接受请求，也不等于数据已经进入持久队列；Exporter 成功发送，也不一定代表后端完成你期望的长期复制与保存。

```mermaid
flowchart LR
    A[业务生成 Span] --> B[SDK Batch 队列]
    B --> C[网络与 Receiver]
    C --> D[处理器缓冲或尾采样]
    D --> E[Batch Processor]
    E --> F[Exporter Queue]
    F --> G[发送中与重试]
    G --> H[后端接收和存储]
```

| 位置 | 常见故障 | 哪类机制可能帮助 |
| --- | --- | --- |
| SDK 内存队列 | 应用崩溃、队列满 | 有界队列、优雅退出、压力监控 |
| Collector 接收前 | 网络、认证、协议失败 | 客户端正确重试与超时 |
| Processor 内存 | OOM、尾采样尚未决策 | 容量、窗口、部署策略 |
| Exporter 内存队列 | Collector 崩溃 | 针对该队列的持久化 |
| Exporter 磁盘队列 | 磁盘满、目录损坏、卷丢失 | 独立卷、权限、容量和恢复验证 |
| 后端 | 写入拒绝、不可恢复错误 | 后端治理及正确的失败处理 |

**不同队列保护的不是同一段数据。** 比如 file_storage 已启用，而 Trace 还停留在 tail_sampling 的未决内存中，强杀 Collector 后它仍可能丢失；磁盘上保存了文件读取偏移，也不说明那一行日志已被后端接收。

背压是把消费压力沿上游反映的行为。它是否能保护数据取决于上游是否支持重试、是否还有缓冲，以及何时放弃；如果所有层都拥有无限重试但存储有限，系统最终仍需要拒绝、阻塞或丢弃。与其写“永不丢”，更应规定在哪种故障持续时间和输入规模内尽量保留。

排查时不要只看队列是否非零。短暂非零可以是正常批处理；持续增长且恢复后无法排空，才说明出口服务能力或重试行为不足。反过来，队列为零也可能是永久错误导致数据立即被放弃，必须结合发送成功与失败观察。


### 19.2 调整重试与积压策略

重试的目标是应对短暂不可用，而不是掩盖错误配置。无效凭据、非法数据或不支持的信号往往需要修改配置或内容；如果把这类问题全部无限重试，只会把不可恢复数据堆积在队列里。

```yaml
# 对第一卷 otlp/jaeger exporter 的增量；此处仍是内存队列。
exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true
    timeout: 5s
    sending_queue:
      enabled: true
      sizer: requests
      queue_size: 2000
      num_consumers: 4
    retry_on_failure:
      enabled: true
      initial_interval: 1s
      max_interval: 10s
      max_elapsed_time: 120s
```

这里显式使用 `sizer: requests`，所以 `queue_size: 2000` 的单位是批次请求，不是 2000 个 Span，也不是 2000 字节。每批大小受到上游处理与分发影响，不能仅用 `2000 / HTTP QPS` 推算可缓存秒数。

`timeout` 限制一次发送尝试，`max_elapsed_time` 限制单批数据的重试历程，它不自动等价于“从数据进入整条链路开始保留两分钟”。数据在 SDK、处理器和队列中等待的时间要分别计算；有效的保留窗口还受容量和错误类型影响。

#### 两个容量问题

设出口输入为每秒 `r` 个批次，平均每批序列化后 `B` 字节，预计中断 `T` 秒。粗略队列预算应覆盖 `r × T` 个批次或 `r × B × T` 字节，再加安全余量。实际内存还包括对象和在途请求，因此这只是容量量级估计。

恢复之后，若每秒持续输入 `rin`、实际成功发送 `rout`，并且 `rout > rin`，积压量 `Q` 的理论排空时间近似为 `Q / (rout-rin)`。如果恢复后的成功出口刚好等于输入，队列不会排空；再大的队列也只是延迟下一次满载。

增加 `num_consumers` 可能提高并行发送，但也会增加后端并发、连接、内存以及某些信号的乱序风险。后端已经限流时继续加并发，可能让问题更严重。先区分带宽、后端写入能力、认证失败和数据错误，再调参数。

| 现象 | 不应盲目采取的动作 | 更合适的验证 |
| --- | --- | --- |
| 后端 401 / 403 | 无限加大队列 | 查凭据、租户和认证配置 |
| 后端限流 | 无限增加发送并发 | 查限额、入口速率与退避 |
| 中断恢复后队列不降 | 只增加磁盘 | 比较成功出口和持续输入 |
| 出口队列满 | 只增加 SDK 队列 | 找端到端瓶颈和预计故障窗口 |


### 19.3 使用持久化队列并说明保护范围

持久化队列可以让**已经进入该队列**的数据在 Collector 重启后继续发送。实现时需要三个条件同时满足：存储扩展被定义和启用，exporter 指向它，以及存储目录在重启后仍存在且可读写。

#### 在单 Collector 实验中启用

先回到第一卷的单实例 traces 拓扑，应用根比例为 1，暂时移除 tail_sampling，以便本轮只验证 exporter queue。下列配置合并进 `collector.yaml`，不是给 18.2 的 loadbalancing 子 exporter 直接套用。

```yaml
extensions:
  file_storage/queue:
    directory: /var/lib/otelcol/queue
    timeout: 1s

exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true
    timeout: 5s
    sending_queue:
      enabled: true
      sizer: requests
      queue_size: 2000
      num_consumers: 4
      storage: file_storage/queue
    retry_on_failure:
      enabled: true
      initial_interval: 1s
      max_interval: 10s
      max_elapsed_time: 120s

service:
  extensions: [health_check, file_storage/queue]
```

`service.extensions` 必须引用完全一致的 `file_storage/queue`，不是一个不存在的 `file_storage` 实例。第一卷的 `health_check` 定义和 traces pipeline 保留，traces processors 为 `[memory_limiter, batch]`。

#### 准备可写且受限的目录

在普通用户的实验终端中执行：

```bash
mkdir -p state/queue
chmod 700 state/queue
export OTEL_RUN_UID="$(id -u)"
export OTEL_RUN_GID="$(id -g)"
```

Compose 中已有 Collector 增加以下用户和挂载设置，保留其他挂载：

```yaml
services:
  otel-collector:
    user: "${OTEL_RUN_UID:?set OTEL_RUN_UID}:${OTEL_RUN_GID:?set OTEL_RUN_GID}"
    volumes:
      - ./state/queue:/var/lib/otelcol/queue
```

该方式让教学容器使用当前用户 ID 写入隔离目录，不要求对目录设置 777。环境变量只作用于当前终端；换终端时需重新设置或纳入受控 `.env`。Docker Desktop 和 Linux 的绑定挂载权限表现应在本地验证；写入失败时检查所有权与镜像用户，不通过长期 root 运行规避问题。

Kubernetes 场景需要持久卷、可写挂载和适当的运行身份。`emptyDir` 可以跨同一 Pod 的容器重启保留，但 Pod 被替换后不能作为持久队列保证；PVC 是否在重新调度后正确重新挂载，也要实测。多个 Collector 实例不应随意同时写同一个 file_storage 数据目录。

#### 后端中断与恢复的实验顺序

```bash
# 仅操作本笔记隔离 Compose 环境。
docker compose run --rm --no-deps otel-collector validate --config=/etc/otelcol/config.yaml
docker compose up -d --force-recreate otel-collector

# pause 保留本实验 Jaeger 的内存，避免 restart 清空旧 Trace 干扰结论。
docker compose pause jaeger
# 恢复措施先准备好；当前 shell 正常退出时尽量执行。
trap 'docker compose unpause jaeger >/dev/null 2>&1 || true' EXIT

for i in $(seq 1 50); do
  curl -sS --max-time 5 -H "X-Demo-Case: queue-${i}" \
    'http://127.0.0.1:8080/work?mode=ok' > /dev/null
done

# 先确认队列已经有积压，再观察目录和日志。
docker compose logs --tail=100 --no-color otel-collector
du -sh state/queue

# 先恢复后端，核对队列排空和 queue-* 请求的 Trace。
docker compose unpause jaeger
trap - EXIT
```

第一轮只测试出口中断与恢复。第二轮重复产生一组新的案例号，确认积压已经进入持久队列后，在隔离环境中强制终止并重新启动 Collector，再恢复后端，对照收到的 Span ID 集合。实际操作可使用 `docker compose kill -s SIGKILL otel-collector` 后 `docker compose up -d otel-collector`，但**必须先确认当前项目只包含这个实验**，并保证状态目录未被删除。

即使观察到恢复成功，也只证明该测试规模、时序和故障条件下这段队列工作正常。它不保护应用尚未导出的 Span、尾采样未决状态，也不覆盖磁盘丢失、目录损坏和后端永久拒绝。Jaeger 在本实验中使用内存存储，停止或重建它会丢失旧数据，应与 Collector 故障区分。


### 19.4 确认丢失、重复和消息中转边界

遥测路径中的确认通常只针对相邻一跳。客户端超时可能发生在后端已经接收数据、但响应没有成功返回的时候；再次发送就可能出现重复。反过来，在数据进入下游之前发生不可恢复故障，则可能缺失。

因此“至少重试一次”“磁盘缓存”和“最终后端有数据”并不自动构成端到端 exactly-once。判断重复与缺失需要可复查身份：Trace 可对照 Trace ID + Span ID，日志应有合适事件 ID，指标则依赖完整时间序列身份和时间语义，不能用一种去重规则覆盖全部信号。

| 故障位置 | 可能结果 | 复核证据 |
| --- | --- | --- |
| 接收成功但响应丢失 | 重试后重复 | 同一 Span ID / 事件 ID |
| SDK 队列满或进程崩溃 | 源数据未导出 | 应用计数、SDK 错误、案例清单 |
| OTLP 部分成功 | 部分记录被拒绝 | 响应中的 rejected 与 message |
| 永久数据错误 | 放弃而非无限重试 | 后端错误码与拒绝样例 |
| filelog 偏移丢失 | 重读或跳过依初始策略而定 | 文件指纹、偏移、轮转记录 |

OTLP 的部分成功响应需要按协议处理，不应把整批盲目重发当作唯一修复方法；否则已经接收的部分可能重复。不同 exporter 与后端的实现行为仍应按固定版本验证。

#### 什么时候才考虑 Kafka 中转

当需要跨进程或跨节点解耦、较长故障窗口、集中积压或明确重放能力时，Kafka 等消息层可以成为选择。但它会增加 Topic、分区、权限、磁盘、消费者进度、消息大小和运维责任；仅为了运行一个教学 Trace 不应默认引入。

```mermaid
flowchart LR
    A[采集层] --> B[消息队列]
    B --> C[处理消费者]
    C --> D[尾采样或转换]
    D --> E[后端]
```

把 Kafka 放在尾采样前时，需要讨论分区键是否维持 Trace 亲和、消费者 rebalance 是否丢失在内存的未决状态、重放数据是否超出采样窗口和后端保留约束。把 Kafka 放在尾采样后，则只缓冲已经选择的数据，无法恢复此前丢掉的候选。

消息队列持久化了记录，不意味着消费者只处理一次，更不意味着后端写入与消费确认是同一个原子事务。是否接受重复、如何识别、能否安全重放，必须写进操作规程。本卷不附一套未经运行的 Kafka 集群配置来假装这些问题已经解决。

可靠性结论最好写成条件句：在指定输入、持续中断时间、磁盘可用和恢复顺序下，哪些已入队数据得到恢复；未覆盖哪些阶段。这样的表述比“开启持久化后零丢失”更有操作价值。


## 第 20 章：Collector 自监控与逐层排障

### 20.1 定义整条数据路径的健康标准

可观测平台需要自己的可观测性。进程存活、端口可连、Receiver 接受数据、Exporter 发送成功以及后端查询成功，是逐步增强但互不等价的健康标准。

```mermaid
flowchart LR
    A[进程存活] --> B[接收端可用]
    B --> C[数据正常流入]
    C --> D[出口与队列正常]
    D --> E[后端可查询]
    E --> F[关联关系与字段正确]
```

健康检查 extension 适合容器探针，但不能验证全部链路。对关键观测路径，可以设计一个低速的合成请求探针：发送带独立案例号的业务请求，等待合理窗口后在后端确认对应 Trace 与关键 Span。它需要单独控制采样，否则探针被策略丢掉可能造成误报。

| 目标 | 建议观察 | 局限 |
| --- | --- | --- |
| Collector 可用 | 实例、重启、健康端点、资源 | 无数据时也可能正常 |
| 接收正常 | accepted / refused、入口错误 | 不能证明最终落库 |
| 导出正常 | sent / failed、queue、后端响应 | 可能只证明相邻一跳 |
| 查询新鲜度 | 合成案例从生成到查询的耗时 | 受测试请求与采样策略影响 |
| 数据质量 | 服务身份、完整父子关系、字段缺失 | 需要样例与语义检查 |

#### 定义两个独立的时间

“请求发生到数据被接收”的延迟，与“请求发生到后端能查到”的延迟不同。尾采样窗口、SDK 批处理、exporter 队列、后端刷新都会叠加到后者。告警阈值应该基于这条实际路径，不应照搬无尾采样环境的一秒可见目标。

探针本身也会失败：请求工具不可用、查询凭据失效、测试路由改变、错误时间范围，都可能造成没有结果。因此告警应区分观测链路失败、查询检查失败和结果未知，不能全部命名为“Collector 丢数据”。

自监控应尽可能避免完全依赖正在故障的同一路径。例如 Collector 到后端的出口故障时，仍应能从旁路 Prometheus scrape、容器指标和进程日志看到压力。并非每个环境都要建第二套平台，但关键故障不应同时摧毁唯一诊断手段。


### 20.2 建立接收、拒绝、排队和导出视图

Collector 自身指标与经过它处理的业务 Metrics 是两套不同的数据。第二卷 8889 端口是业务指标 exporter；本节 8888 是 Collector 的内部遥测端点。混淆两者，会出现“业务指标有了，所以 Collector 自监控也完成了”的错误判断。

以下为本基线支持的内部指标 reader 配置；显式关闭类型与单位后缀，减少自监控查询名称歧义。配置 schema 仍可能随版本变化，升级时要重新核对。

```yaml
# collector.yaml 的 service 下新增 telemetry；保留 pipelines / extensions。
service:
  telemetry:
    metrics:
      level: normal
      readers:
        - pull:
            exporter:
              prometheus:
                host: 0.0.0.0
                port: 8888
                without_type_suffix: true
                without_units: true
```

在 Collector 的 Compose ports 列表追加 `127.0.0.1:8888:8888`。已有 Prometheus 增加单独 scrape job：

```yaml
# prometheus.yaml 的 scrape_configs 增量。
scrape_configs:
  - job_name: otel-collector-internal
    static_configs:
      - targets: [otel-collector:8888]
```

该 job 不把 `honor_labels` 随意设为 true；它监控的是 Collector 实例本身。多副本时应发现每个实例端点，不要只抓普通 Service 的一个随机后端并以为看到了全部 Collector。

#### 先发现实际输出，再固定面板

```bash
curl -sS http://127.0.0.1:8888/metrics \
  | grep -E '^(# (HELP|TYPE) otelcol_|otelcol_(receiver|exporter|process)_)'
```

常用内部指标原名包括 `otelcol_receiver_accepted_spans`、`otelcol_receiver_refused_spans`、`otelcol_exporter_sent_spans`、`otelcol_exporter_send_failed_spans`、`otelcol_exporter_enqueue_failed_spans`、`otelcol_exporter_queue_size` 和 `otelcol_exporter_queue_capacity`。不同版本、reader 后缀配置或组件可能使实际名称与可见性不同，因此下面查询仅在已确认输出匹配时使用。

```promql
# 各 receiver 的接收速率。
sum by (instance, receiver) (
  rate(otelcol_receiver_accepted_spans{job="otel-collector-internal"}[5m])
)
```

```promql
# Receiver 拒绝速率不应直接等同于最终永久丢失。
sum by (instance, receiver) (
  rate(otelcol_receiver_refused_spans{job="otel-collector-internal"}[5m])
)
```

```promql
# 队列利用率；确认两侧来自同一 exporter、实例与同一计量方式。
max by (instance, exporter) (
  otelcol_exporter_queue_size{job="otel-collector-internal"}
)
/
max by (instance, exporter) (
  otelcol_exporter_queue_capacity{job="otel-collector-internal"}
)
```

```promql
# 同时观察发送失败与入队失败，不只看一个失败计数。
sum by (instance, exporter) (
  rate(otelcol_exporter_send_failed_spans{job="otel-collector-internal"}[5m])
)
```

队列为空不代表 exporter 健康，队列指标不存在也不等于零，应先确认是否启用了队列。没有输入时 accepted 为零是正常的；有请求而 accepted 为零才需要与其他证据对照。

#### 不能直接用 accepted 减 sent 算丢失

一个 Span 可以在扇出时进入两个 exporter，导致 sent 大于入口 accepted；采样与过滤会合法降低出口量；重试、时间窗口和多跳 Collector 也会影响计数关系。因此丢失判断应基于明确拓扑、相同阶段、相同信号与时间边界，必要时用请求和 Span ID 的实际集合对照。

告警应组合趋势和持续时间，例如队列持续上升、入队失败持续发生、后端不可用、进程重启或合成探针不可查询。不要把教学面板中的 80% 阈值当成普适生产告警，应依据恢复时间和可用容量设置。


### 20.3 排查错误协议、认证与数据转换

面对“没有数据”，最有用的第一步是固定一个明确来源、明确时间和明确 ID 的新请求。随后沿着链路寻找最后一个确认看到它的位置，而不是先重启所有组件，抹掉队列和时间现场。

#### 第一层：应用真的生成并结束了 Span 吗

查看是否设置正确 Provider、是否使用当前 Context、是否结束 Span、根与父采样是否符合预期。短生命周期任务可能在批处理发送前退出；服务日志出现 ID 只说明上下文存在，不能证明结束和导出。

#### 第二层：连接与协议是否正确

```bash
# 以下检查适用于宿主机暴露的第一卷实验端口。
curl -sS --max-time 3 http://127.0.0.1:13133/
curl -sS --max-time 3 http://127.0.0.1:8888/metrics | head -n 15
docker compose logs --no-color --tail=150 service-a otel-collector
```

管理端点可用与 OTLP 可用是不同事实。检查 SDK 的信号专属 endpoint 是否覆盖了通用配置；核对 4317 / 4318、HTTP scheme、gRPC、路径和 TLS。容器内 `localhost` 指向当前容器，宿主机可达地址未必能直接用于容器内部。

TLS 错误应区分证书链不受信、SAN / 主机名不匹配、证书过期以及双向认证缺少客户端证书。不要长期用 `insecure_skip_verify` 掩盖这些差异，它不等于正确配置了信任关系。

#### 第三层：数据是否被处理规则改变

使用第二卷的合成 OTLP 载荷检查 Receiver 和转换；临时在隔离环境观察 debug 输出。若 trace 经 Collector 接收但缺少服务名，先核对 Resource；若全部正常 trace 被删，检查 filter / tail policy；若字段类型不符，检查 OTTL 与日志 parser 的错误日志。

同样需要检查扩展实例是否被正确引用，文件挂载是否在容器内真实存在，运行身份是否能读取证书或写队列。YAML 中写着 `/etc/certs/ca.pem`，不代表该文件已经被镜像包含。

#### 第四层：后端与查询路径

确认 exporter 指向正确后端与租户，后端没有拒绝或超配额，查询时间窗和服务筛选没有排除目标。后端接收成功但查询暂时不可见，与从未收到是不同情况；如果已经超过合理窗口，应保留 exporter 和后端双方证据。


### 20.4 整理常见故障决策表

排障表应描述“候选原因与如何证伪”，而不是把每个症状绑到一个唯一根因。相同的没有 Trace，可能来自采样、初始化、路由、队列或后端；相同的高内存，也可能来自尾采样、指标基数、日志巨行或出口积压。

| 现象 | 候选原因 | 最先验证 | 后续方向 |
| --- | --- | --- | --- |
| 日志有 ID，Trace 查不到 | 未采样、异步延迟、导出失败、保留期 | sampled、固定请求、最后可见阶段 | 第二卷 13.4 / 14 章 |
| 每个服务各有一条 Trace | 出站未注入、入站未提取、丢 Context | A CLIENT 与 B SERVER 的 parent | 第一卷第 3 章 |
| 只有部分子 Span | 部分埋点、窗口太短、分片错误 | 服务日志、路由成员、Span ID 集合 | 第 18 章 |
| Collector Running 但 accepted 为零 | 无输入、地址错误、接收 pipeline 未启用 | 请求、endpoint 与有效配置 | 20.3 |
| Receiver refused 上升 | 下游拒绝、内存压力、处理失败 | RSS、processor 错误、队列 | 11.1 / 19 章 |
| 队列持续增加 | 后端慢、不可达、限流、凭据错误 | 成功出口速率和后端响应 | 19.2 |
| 队列下降但数据缺失 | 成功发送或失败放弃均可能 | sent、send_failed、永久错误 | 19.4 |
| 内存突然升高 | 巨型 Trace、长窗口、指标基数、积压 | 输入类别、堆占用、队列、状态量 | 18.3 / 21.3 |
| Pod 属性全是 Gateway | 连接 IP 识别错或 Resource 被覆盖 | 实际来源 UID 和关联规则 | 第二卷 15.3 |
| Metrics 数量突然翻倍 | 双抓取、双导出、实例标签变化 | target 与写入路径 | 第二卷 15.4 |
| JSON 日志有字段但不能关联 | 字符串未映射到 LogRecord 上下文 | parser 输出顶层 TraceId | 第二卷 13.3 |
| 重启 Jaeger 后全部旧链消失 | 教学后端使用内存 | 实际存储配置与重启记录 | 第一卷 6.4 |

#### 为排障记录保留状态，而不是强行给根因

建议用“已证实、已排除、仍待验证”标记每个假设。比如已证实 B 返回 500、A 返回 502，并不能立即证实底层数据库不可用，因为当前实验 B 的错误是代码主动生成的。生产上同样不能把一个 `db timeout` 属性直接扩展为完整故障结论。

解决后还要验证业务和观测两个方面：业务恢复、数据继续进入、积压可排空、新请求链路完整、采样符合目标、错误规则没有误伤正常流量。只看到 Collector 重启后不报错，不能关闭整个事件。

本表是复习入口，不是替代组件文档的万能手册。新的故障若不符合表中假设，应记录新证据并扩展模型，不要为匹配一个既有答案而忽略相反信息。


### 20.5 排查多语言接入、自动注入与重复采集

排查新增的 Java、Python 和 Kubernetes 路径时，先保存一个带实验号的请求，以及当时的进程启动参数、Pod 模板和最终 Pod 配置。不要先改 Collector 采样率；如果应用从未初始化 SDK，后端再怎么调也不会得到缺失的 Span。

#### 沿应用启动与调用边界定位

| 现象 | 最短证据路径 | 修复后怎样复核 |
| --- | --- | --- |
| Java 正常响应但 Trace ID 全零 | JVM 参数是否加载 Agent，API 是否取得有效全局 Provider | 同一请求能看到 SERVER 与 `business.work` |
| Python 启动正常但没有 Span | 是否通过启动器运行、目标虚拟环境是否装了 instrumentation | FastAPI入口与HTTPX出站分别出现 |
| 入口与下游各有 Trace，却连不起来 | HTTP客户端是否注入头，代理是否保留头，线程/任务是否恢复上下文 | 逐边界核对 Trace ID 与父 Span ID |
| 修改 Instrumentation 后没有变化 | 新 Pod 是否重建，最终环境是否与新 CR 一致 | 记录新 Pod UID、镜像和真实 Collector 出口 |
| Pod 没有注入初始化容器 | 注解位置、容器名、命名空间、Webhook及事件 | Pod变化与Span到达分别验证 |
| Go 改了采样环境变量却无变化 | 程序实际读取的变量名与显式SDK参数 | 用多轮请求对照真实采样结果 |
| Java/Python 出现重复 Span | 镜像自带Agent/启动器与Operator重复接入 | 停用一条来源后再比较同一边界 |

`kubectl describe pod` 的事件能定位 webhook、镜像拉取等创建阶段问题；应用 stdout 能定位 Agent/启动器和包冲突；Collector debug 能定位实际收到的数据。三者分别覆盖不同阶段，不能相互替代。

#### 重复数据按采集归属检查

节点 Collector 加入后，先列出已有 node-exporter、kubelet 抓取、kube-state-metrics、日志 Agent 和 Event exporter。按数据源而不是组件名称寻找重复：两个名称完全不同的 exporter 也可能记录同一个事实。

```text
数据源 -> 采集实例 -> 处理管道 -> 写入目标 -> 查询口径
节点 CPU -> 每节点 hostmetrics / node-exporter -> ...
Pod 内存 -> kubeletstats / kubelet 抓取 -> ...
容器日志 -> filelog / Filebeat -> ...
集群对象 -> 单份 k8s_cluster / kube-state-metrics -> ...
```

重复抓取可能表现为多份不同标签序列，也可能是同一序列的重复样本或乱序错误；不能只用“数值翻倍”检测。滚动更新集群级采集器时，即使 replicas 为 1，也可能短暂出现两份采集进程。先看工作负载策略和实际 Pod 数，再考虑更复杂的分片。

日志异常放大时，第一步检查是否采到了 Collector 自己的详细 debug 输出。然后比较采集文件路径、读取状态目录、应用事件 ID 和出口目标。读取偏移重置、日志轮转、重试发送也可能造成重复，它们不是同一个故障。

### 20.6 为配置变更建立可重复的对照样本

完整运行环境可能很大，但每次变更不需要重新制造所有故障。应把输入样本与验证目的绑定，让一次失败能指出具体边界。

| 变更 | 最小对照样本 | 保留什么证据 |
| --- | --- | --- |
| SDK/Agent/框架升级 | 第一卷 `ok/error/timeout/broken` | 三端响应、业务日志、Trace父子关系、实际依赖版本 |
| 日志解析器变化 | CRI完整行、partial片段、应用JSON、普通文本、异常堆栈 | 输入与输出条数、Body、时间、TraceId、Pod身份 |
| Kubernetes receiver上线 | 指定节点/Pod、已知重启与事件 | API事实、采集来源、最终指标名及标签 |
| Operator配置变化 | 一个明确指定容器的Deployment | CR、Pod模板、最终Pod、注入日志与Span |
| 后端切换 | 同一批事件与TraceID集合 | 两端接收/查询结果、缺失与重复情况 |

日志样本使用人为固定 ID 时，仅验证解析；真实关联必须使用应用刚产生且后端实际接收到的 ID。不要将“正则提取成功”写成“Trace链路验证成功”。同样，YAML可解析、CR可提交、Collector能启动和后端可查询是递进的四个检查，报告中应写明停在哪一层。

回归通过后记录实际使用的版本，不把本文教学基线永久当作环境事实。无法运行某个环节时保留命令和验收条件，并注明尚未验证的部分，避免把文档中的预期现象当成历史测试记录。

### 20.7 使用 pprof 与 zPages 缩小 Collector 内部瓶颈

第 20.2 节的指标告诉我们哪个阶段出现压力，`pprof` 则帮助判断 Collector 进程把 CPU 和内存花在了哪里；`zpages` 提供内部诊断页面。它们观察的是 Collector 本身，不会自动成为应用 JVM、Python 或 Go 业务进程的剖析器。

#### 明确启用扩展和访问路径

在第一卷隔离 Compose 的 `collector.yaml` 中合并以下内容，保留已有 `health_check` 和其他已启用扩展：

```yaml
extensions:
  pprof:
    endpoint: 0.0.0.0:1777
  zpages:
    endpoint: 0.0.0.0:55679
service:
  extensions: [health_check, pprof, zpages]
```

此处完整给出 `service.extensions` 列表；如果实验已启用 `file_storage` 或认证扩展，应把它们一起保留。随后在 Compose 的 Collector 端口列表追加：

```yaml
# Compose 增量；保留已有 ports 项。
services:
  otel-collector:
    ports:
      - "127.0.0.1:1777:1777"
      - "127.0.0.1:55679:55679"
```

容器内监听 `0.0.0.0` 是为了让端口映射可以访问；宿主机只发布到回环地址。正式部署不应把这类诊断端口公开到业务入口。只写 ports 不会启动扩展，只定义 extensions 不加入 `service.extensions` 也不会启用。

#### CPU、堆与 goroutine 分别回答什么

在固定实验流量下采集短时样本，避免同时修改采样率、日志级别和转换规则。以下命令作用于本机映射端口，文件保存到单独的诊断目录。

```bash
mkdir -p diagnostics
curl -fsS --max-time 40 \
  'http://127.0.0.1:1777/debug/pprof/profile?seconds=20' \
  -o diagnostics/collector-cpu.pprof
curl -fsS --max-time 10 \
  http://127.0.0.1:1777/debug/pprof/heap \
  -o diagnostics/collector-heap.pprof
curl -fsS --max-time 10 \
  'http://127.0.0.1:1777/debug/pprof/goroutine?debug=1' \
  -o diagnostics/collector-goroutines.txt
go tool pprof -top diagnostics/collector-cpu.pprof
go tool pprof -top -sample_index=inuse_space diagnostics/collector-heap.pprof
```

CPU profile 反映采样窗口内的 CPU 活动，不是墙钟等待的全部解释；大量网络等待可能不占 CPU。Heap 的 `inuse_space` 与累计分配量不同，也不等于整个进程 RSS。Goroutine 多不必然是泄漏，需要对比相同负载下数量、栈位置及停止输入后的变化。

| 证据组合 | 可以进一步检查 | 不能直接认定 |
| --- | --- | --- |
| CPU 热点集中在正则/转换，输入稳定 | 规则范围、属性数量与字符串大小 | 一定需要增加副本 |
| 堆占用与 tail sampling 候选同步增长 | 等待窗口、Trace 大小、容量与迟到策略 | 所有未释放对象都是泄漏 |
| 队列持续增加，goroutine 多在网络/重试路径 | 后端延迟、连接和超时 | Collector CPU 不足 |
| 停止输入后占用仍高 | GC 行为、保留状态与缓存 | 单个快照足以证明泄漏 |

必要时保留与 profile 完全匹配的二进制及构建信息，以便进一步分析调用栈。profile、goroutine 栈与诊断页面可能包含内部地址和处理细节，作为受控排障产物保存，不放进公开笔记或公共对象存储。

#### 用 zPages 补充内部视角

启用后可在本机打开 `http://127.0.0.1:55679/debug/servicez`，再按该版本页面实际提供的入口检查管道或内部 Trace。zPages 的可见项受组件内部埋点与版本影响，不保证所有 pipeline 数据都在那里，也不能替代 Jaeger 中的业务 Trace。

验收顺序是：扩展启用 → 页面可访问 → 确认看到的是目标 Collector → 与自监控指标和 profile 对照。采样一次没有发现热点时，应注明采样窗口是否覆盖问题发生时段，不能据此宣布没有性能问题。诊断结束后关闭临时扩展和端口映射，保留定位结论及必要的受控样本。

### 20.8 排查代理环境、直连路径与内部地址误路由

Collector 到后端的出口有时受代理环境影响。基于 HTTP transport 的 exporter 通常会读取 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY`；gRPC、不同客户端实现以及配置中的显式代理选项应分别核对，不能套用“所有协议行为完全一致”的结论。

| 参数 | 希望控制的事 | 常见问题 |
| --- | --- | --- |
| `HTTP_PROXY` | HTTP 出口经指定代理 | 内部服务意外发到企业代理 |
| `HTTPS_PROXY` | HTTPS 出口代理路径 | CONNECT、证书信任或代理认证失败 |
| `NO_PROXY` | 对匹配地址绕过代理 | 只列 IP，实际 endpoint 用服务名；或相反 |
| 显式 exporter 配置 | 特定组件的连接行为 | 误以为 Shell 的 curl 成功就代表组件同样配置 |

下面是 Compose 中仅给 Collector 传递代理的示意；环境变量由宿主机准备。它是需要外网代理时的可选增量，不应默认加入所有实验。

```yaml
services:
  otel-collector:
    environment:
      HTTP_PROXY: ${OTEL_LAB_HTTP_PROXY:?请设置实验代理}
      HTTPS_PROXY: ${OTEL_LAB_HTTPS_PROXY:?请设置实验代理}
      NO_PROXY: localhost,127.0.0.1,jaeger,otel-collector,.svc,.cluster.local
```

`NO_PROXY` 应覆盖实际连接使用的名称或地址。列表只说明示例中的 Compose/Kubernetes 内部目标，不包含读者集群的全部 API Server 地址、云元数据地址或私有网段；CIDR 与域名匹配方式还取决于客户端实现。

排查时先记录 exporter endpoint 的 scheme、主机名与端口，再确认 Collector 进程实际获得哪些代理变量。不要将包含代理密码的完整环境或 `docker inspect` 原始结果贴进工单。随后在同一网络环境中分别验证 DNS、直连、经代理路径，最后用真实 exporter 发送一条受控遥测。

宿主机 `curl --noproxy '*'` 能帮助做直连对照，但不证明容器网络、证书和 exporter 的代理行为相同。若代理返回 HTML 错误页、407 或连接隧道错误，也不要误判成 OTLP 编码错误。修复后再次核对内部流量确实绕过代理，外部流量仍按预期经过代理。

## 第 21 章：安全、成本与数据治理

### 21.1 限制采集面与敏感字段

遥测数据经常包含比预期更多的业务信息：URL 查询参数、数据库语句、异常 message、堆栈、用户标识、请求头和消息属性都可能进入 Span 或日志。安全控制不能只放在最后的存储权限上，应该从“是否应该采集”开始。

#### 从源头到出口分层控制

```mermaid
flowchart LR
    A[应用最小化采集] --> B[SDK 属性与长度约束]
    B --> C[Collector 规则与来源校验]
    C --> D[受控传输与租户隔离]
    D --> E[后端访问和保留策略]
    E --> F[查询导出与分析流程]
```

| 数据 | 默认处理倾向 | 需要额外论证的例外 |
| --- | --- | --- |
| 密码、Token、Cookie、私钥 | 不采集 | 不应以排障便利为理由常态记录 |
| 完整请求与响应正文 | 默认不启用 | 受控抽样、授权、脱敏与短期留存 |
| URL query | 选择必要字段或移除敏感值 | 参数对诊断确实必要时单独处理 |
| SQL 语句与参数 | 优先操作类别、目标与摘要 | 可能包含业务数据或个人信息 |
| 用户与订单标识 | 能不用就不用，必要时受控处理 | 同时评估基数与跨系统关联风险 |
| 异常堆栈 | 选择性保留、长度上限 | 不代表其中不会出现敏感值 |

“哈希后就完全匿名”不是可靠结论。低熵标识可能被枚举，稳定哈希也可能支持跨日志追踪；是否满足组织要求需要专门审查，而不是在代码里加一次 hash 就结束。

#### 规则要验证多种承载位置

第二卷的 `delete_key(span.attributes, "demo.secret")` 只处理一个明确位置。如果相同内容出现在 `exception.message`、Span Event、Log Body 或嵌套 Map 中，仍可能离开系统。做脱敏测试时，应准备这些位置的**假敏感数据**，核对全部出口，而不是使用真实凭据做实验。

规则失败也可能漏出数据。对普通属性转换，`error_mode: ignore` 方便保留遥测；对必须阻止泄露的控制，则应有 fail-closed 的边界设计或源头白名单，不能依赖一次可能被忽略的转换。不同分支是否都经过清洗，也要在 pipeline 图中标明。

`debug` exporter、Collector 日志、磁盘队列、测试输出文件与下载的 Trace JSON 都属于数据副本。只限制 Jaeger 页面访问而忽略这些副本，会留下同样的泄露面。实验结束应清理假数据与临时详细输出，正式系统则按组织保留与访问规则管理。


### 21.2 保护接收端与租户边界

监听 `0.0.0.0:4318` 只是选择网络接口，不是接入认证。只要网络可达，未保护的 Receiver 就可能被无关应用提交数据、消耗采样状态和后端资源。生产接收面应组合网络限制、TLS、身份认证、授权与数据配额。

#### TLS 与认证的配置骨架

下面是独立的安全接收骨架，展示 TLS 与 Bearer 扩展如何连接。证书、私钥和 Token 必须由你的环境提供并挂载；该片段不是自带证书、可以直接替换第一卷的完整配置。

```yaml
extensions:
  bearertokenauth/ingest:
    token: ${env:OTEL_INGEST_TOKEN}

receivers:
  otlp/secure:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
        tls:
          cert_file: /etc/otel-certs/server.crt
          key_file: /etc/otel-certs/server.key
        auth:
          authenticator: bearertokenauth/ingest

service:
  extensions: [bearertokenauth/ingest]
  pipelines:
    traces:
      receivers: [otlp/secure]
      processors: [memory_limiter, batch]
      exporters: [otlp/jaeger]
```

完整文件还必须包含上面引用的 processor 和 exporter。服务端证书的 SAN 应覆盖客户端真正连接的 DNS 名；容器镜像需要能读到证书文件。Token 不应硬编码进 Git，日志与配置展示也不应输出完整凭据。

使用第一卷 HTTP Exporter 的客户端需要匹配 HTTPS、可信 CA 和认证头，例如以下环境变量说明：

```bash
# 需要真实可达的测试域名、受控 Token 与已挂载 CA；不是默认实验地址。
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-gateway.example.internal:4318
export OTEL_EXPORTER_OTLP_CERTIFICATE=/etc/otel-certs/ca.crt
# 按 OTLP 环境配置要求编码 header 值，空格可写成 %20。
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer%20${OTEL_INGEST_TOKEN}"
```

先检查缺失 Token、错误 Token、错误 CA、错误主机名和正确配置这五种输入，分别记录失败位置。不要把认证错误和“未采样导致没数据”混在一起。静态 Bearer 仅说明机制，不提供细粒度多租户授权、自动轮换或每应用独立配额，生产可能需要更完整的认证方案。

#### 租户身份不能从任意业务属性直接得出

`service.name`、`k8s.namespace.name`、Baggage 中的租户 ID 都可能由客户端提交。它们有助于查询归属，但不能单独作为访问授权。接入平台应把已认证身份映射到可写租户和配额，再对输入属性校验或覆盖，防止来源冒充。

同理，Collector 到后端的 `X-Scope-OrgID` 等租户头是后端特定机制，不是 OTel 跨后端通用认证协议。不能让应用通过未经验证的任意头改变目标租户。

Kubernetes NetworkPolicy 可以限制来源 namespace / pod 和端口，但需确认 CNI 实际执行策略，并同时保留 DNS、API Server 元数据查询和后端出口所需连接。网络策略与 Token 各自解决不同层的问题，不能互相替代。


### 21.3 用实际数据分析成本

采样比例下降并不意味着所有成本按相同比例下降。应用头采样可以减少部分 Span 记录与发送；尾采样主要减少后续保留量，却仍要承担候选数据进入采样层的流量、解码与状态开销。Metrics 的基数和 Logs 的体积也有自己的成本模型。

#### 分开观察四类成本

| 成本位置 | 更合适的量 | 不宜直接替代的量 |
| --- | --- | --- |
| 应用埋点 | CPU、分配、请求延迟、SDK 队列 | 后端存储 GB |
| 采集与处理 | CPU、RSS、带宽、未决状态、磁盘队列 | 仅最终保留 Trace 数 |
| 后端存储 | 实际写入字节、索引、复制、保留时间 | Protobuf 原始大小 |
| 查询与维护 | 查询扫描量、并发、排障与升级负担 | 单一镜像资源 limit |

一个可用的 Trace 写入量粗估为：`业务请求/秒 × 平均 Span/请求 × 实际保留比例 × 平均序列化字节/Span × 时间`。它忽略压缩、索引、Resource 重复、复制和存储格式，只能用于检查数量级；尾采样前的网络输入不能使用最终保留比例计算。

例如假设 1000 请求/秒、每请求 8 个 Span、最终保留 10%、每 Span 500 字节，则原始保留数据约 400000 字节/秒，约 34.56 GB/天，约 32.19 GiB/天。**这是算术示例，不是任何后端的实际每日磁盘需求**；真实存储应通过实验窗口测量。

#### 指标基数通常比一个数值的大小重要

若一个指标有 20 个路由、6 类状态、4 个环境和 50 个实例，维度笛卡尔积上界为 24000 条组合；实际是否全部出现需要测量。显式 Histogram 还会按桶及 sum / count 扩展序列数量。若再加入无限增长的订单 ID，原本有界的集合就变成无法稳定控制的集合。

降低基数时应优先删除没有查询价值的高基数字段、改用路由模板、限制 Scope / Resource 提升，或在明确保留语义的聚合层处理。不要删除必要实例身份，把多个累计写入者强行压成一个序列。

#### 以诊断价值决定保留

对日志可以比较每个服务的字节量、事件量、错误比例与实际使用场景，优先处理重复堆栈、无意义心跳、巨型正文和重复采集。对 Trace 可以比较错误和慢请求样本的覆盖，以及正常样本是否足够解释基线。

治理前后至少保留同类流量窗口下的量、资源、可见延迟和诊断结果。只说“采样从 100% 改成 10%”不能证明成本下降 90%，更不能证明排障能力没有受损。成本优化必须与明确的证据覆盖目标一起验收。


### 21.4 建立字段、版本和变更规范

长期可维护的 OTel 接入，不只是一份能启动的 YAML。服务名、字段、Span 名称、指标单位和采样规则一旦被查询、告警或自动分析使用，就形成了数据契约。随意改名可能比程序暂时下线更难发现，因为系统仍在产出“看起来正常”的新数据。

#### 建立轻量字段登记表

| 字段或约定 | 登记内容 | 变更时要检查 |
| --- | --- | --- |
| `service.name` | 服务目录中的稳定名称 | 仪表盘、告警、责任人映射 |
| `service.instance.id` | 实例生命周期定义 | 累计指标身份和重启解释 |
| `http.route` | 低基数路由模板来源 | 是否变成原始 URL |
| 业务错误码 | 业务含义、取值集合、归属 | 采样和聚合是否仍有效 |
| Histogram 单位和桶 | 单位、边界、适用路径 | 分位数和 SLO 阈值 |
| `demo.*` 类自定义属性 | 所有者、类型、用途 | 与标准字段是否冲突 |

自定义字段应明确命名空间与语义，不应假装成官方 SemConv 的一部分。教学代码中的 `demo.mode`、`demo.case_id` 和 `telemetry.pipeline` 是本笔记约定，发布到团队标准时应重新命名和约束。

#### 一次变更至少保留这些记录

```yaml
# 变更记录模板，不是 Collector 配置。
change:
  id: otel-change-example
  status: planned
  owner: replace-with-responsible-role
  component_versions:
    collector_before: "0.136.0"
    collector_after: "填写拟验证版本"
  affected_signals: [traces, metrics, logs]
  affected_fields: [service.name, http.route]
  sampling_change: false
  expected_effect: "描述希望看到的变化"
  validation:
    input_fixture: "固定输入文件及其哈希"
    baseline_snapshot: "旧配置的输出位置"
    candidate_snapshot: "新配置的输出位置"
    result: not_executed
  rollback:
    config_snapshot: "旧配置位置"
    image_reference: "旧镜像或 digest"
    state_compatibility: "队列和状态能否由旧版读取，需验证"
```

版本变更不能只记 Collector。语言 SDK、自动埋点库、语义约定、Operator / Chart 和后端也会改变行为；API 稳定、信号稳定与某个 Collector 组件稳定是不同维度。

代码审查应重点看变化对数据语义的影响，而不是只看 YAML 是否格式化：删除了哪些字段、扩大了哪些输入、是否增加高基数、改变了哪些采样候选、是否扩大接收权限、回滚时旧实例能否读取队列。

配置和资料链接可以放 Git，凭据与真实敏感样例不应混入。保存合成测试样例与脱敏后的真实结构，比复制包含 Token 的生产日志更有长期价值。


### 21.5 为 Collector 间通信配置双向 TLS

HTTPS 只验证服务端身份时，客户端可以确认自己连接了正确 Gateway，但 Gateway 还不能仅靠这一步识别发送者。mTLS 增加客户端证书校验，适合需要以受控工作负载身份接入的 Agent → Gateway 链路；租户授权与配额仍要另行定义。

#### 两端需要哪些证书

| 位置 | 证书或密钥 | 需要核对的内容 |
| --- | --- | --- |
| Gateway | 服务端证书和私钥 | SAN 覆盖 Agent 实际连接的 DNS，具备服务端用途 |
| Gateway | 客户端 CA 信任链 | 只信任允许接入的客户端证书发行者 |
| Agent | 服务端 CA 信任链 | 能验证 Gateway 的完整证书链 |
| Agent | 客户端证书和私钥 | 具备客户端用途，身份符合平台约定 |

以下为两份独立 Collector 配置的**增量片段**，不是把双方配置拼进同一个文件。证书应通过现有 PKI/Secret 流程提供，不能把私钥写进仓库。

```yaml
# Gateway 配置增量：该 receiver 必须加入目标 traces/metrics/logs 管道。
receivers:
  otlp/mtls:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
        tls:
          cert_file: /etc/otel-certs/gateway.crt
          key_file: /etc/otel-certs/gateway.key
          client_ca_file: /etc/otel-certs/client-ca.crt
          min_version: "1.2"
```

```yaml
# Agent 配置增量：在出口 pipeline 中引用 otlp/secure-gateway。
exporters:
  otlp/secure-gateway:
    endpoint: otel-gateway.example.internal:4317
    tls:
      ca_file: /etc/otel-certs/server-ca.crt
      cert_file: /etc/otel-certs/agent.crt
      key_file: /etc/otel-certs/agent.key
      min_version: "1.2"
    timeout: 5s
    retry_on_failure:
      enabled: true
      initial_interval: 1s
      max_interval: 10s
      max_elapsed_time: 60s
```

不能只在 Agent 上填写客户端证书，却忘记 Gateway 的 `client_ca_file`，然后宣称已经强制双向校验。也不要用主机 IP 代替证书只覆盖的 DNS 名来消除解析问题；这可能触发正确的 SAN 校验失败。

对于 OTLP/gRPC，`insecure: true` 用于关闭传输安全，不应解释成“仍然加密但忽略证书校验”；`insecure_skip_verify` 则跳过服务端证书链/主机名校验，削弱身份验证。HTTP exporter 还要检查 endpoint 的 `http`/`https` scheme。生产接入应通过正确证书与信任链解决问题，而非混用这两个开关。

#### 失败矩阵与轮换验收

在隔离环境依次检查正确证书、无客户端证书、错误客户端 CA、错误服务端 CA、SAN 不匹配和证书过期。保存失败发生于 TLS 握手还是后续认证/授权，以及 Collector 是否出现重试积压。只有“正确证书能连通”不足以证明客户端证书被强制校验。

轮换时先明确哪些实例信任旧 CA/新 CA、何时更新叶子证书、何时移除旧信任。Kubernetes Secret 更新不自动证明进程已加载新证书；证书热重载能力和字段支持要按客户端/服务端与组件版本分别确认。没有验证过热重载时，采用有容量余量的受控滚动重启，并分别测试新建连接与既有长连接。

### 21.6 用 OAuth2 客户端与 OIDC 接收认证连接两端

静态 Bearer 演示的是认证头的连接方式。需要短期 Token 和自动获取时，可用 `oauth2client` 作为 exporter 客户端认证扩展，Gateway 用 `oidc` 验证符合要求的令牌。OAuth2 取令牌和 OIDC 验证不是任意配置都能直接配对：身份提供方必须签发接收端能够验证、issuer/audience 匹配的访问令牌，不能把任意 opaque token 或 ID Token 混用。

#### 出口取令牌与入口验证分开配置

下列 Agent 片段假定已配置受信的 HTTPS 身份提供方，并通过环境注入 Client ID/Secret。`token_url` 为实际 token endpoint，而不是业务登录页；Scopes 与 audience 的签发规则由身份提供方定义。

```yaml
# Agent 侧增量。
extensions:
  oauth2client/gateway:
    client_id: ${env:OTEL_CLIENT_ID}
    client_secret: ${env:OTEL_CLIENT_SECRET}
    token_url: https://identity.example.internal/oauth2/token
    scopes: [telemetry.write]
    tls:
      ca_file: /etc/otel-certs/identity-ca.crt
    timeout: 5s
exporters:
  otlp/identity-gateway:
    endpoint: otel-gateway.example.internal:4317
    tls:
      ca_file: /etc/otel-certs/server-ca.crt
    auth:
      authenticator: oauth2client/gateway
service:
  extensions: [oauth2client/gateway]
```

示例省略已有 receiver、processor 与 pipeline，需把 exporter 加入相应出口，并在 `service.extensions` 中保留原来的扩展。本例在 `oauth2client/gateway.tls.ca_file` 中单独配置身份提供方 CA；它与 exporter 连接 Gateway 使用的 CA 是两个信任关系。只给 exporter 配 `ca_file` 不会自动解决 token endpoint 的证书信任。

```yaml
# Gateway 侧增量；collector-agent 是身份提供方实际签发的 audience。
extensions:
  oidc/agents:
    issuer_url: https://identity.example.internal
    audience: collector-agent
    issuer_ca_path: /etc/otel-certs/identity-ca.crt
receivers:
  otlp/identity:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
        tls:
          cert_file: /etc/otel-certs/gateway.crt
          key_file: /etc/otel-certs/gateway.key
        auth:
          authenticator: oidc/agents
service:
  extensions: [oidc/agents]
```

Gateway 用 `issuer_ca_path` 信任身份提供方的发现/公钥服务，Agent 用取 Token 客户端的 `tls.ca_file` 信任 token endpoint。Gateway 需要访问发现/公钥材料，Agent 需要访问 token endpoint。两者的网络、代理、CA 和时钟问题应分别排查。声明 `telemetry.write` scope 不等于 Gateway 已实现同名权限检查；认证成功后的可写租户、服务身份和额度仍由平台接入策略决定。

#### 分阶段记录验证结果

| 测试 | 预期检查点 |
| --- | --- |
| 正确凭据与正确 issuer/audience | Agent 获得访问令牌，Gateway 接收受控遥测 |
| 错误 Client Secret | 在取 Token 阶段失败，而不是误记为未采样 |
| 错误 audience/issuer | Gateway 拒绝，不靠伪造 Resource 绕过 |
| 无 Token 或过期 Token | 入口拒绝；自动刷新能力另做跨有效期验证 |
| 身份提供方短暂不可达 | 观察缓存/刷新行为、重试、队列及恢复，不假定无限可用 |

轮换 Client Secret 后应核对新进程/扩展是否使用新凭据；不要将 Token 写入 `debug` 输出、环境转储或测试报告。这里只提供 Collector 两端的配置关系，不附带身份提供方部署，也不把认证成功当作已完成多租户授权。

## 第 22 章：从现有监控体系渐进接入

### 22.1 选择首个服务与最小接入目标

首个接入项目的目标不应是“一次统一全部观测”，而应是一个可以验证的真实问题。例如某个接口经常返回 5xx，但只能看到入口日志，不知道哪个下游先失败；此时接入两个相邻服务的 Trace，就有明确的学习和生产价值。

一个合适的首个场景应有清楚的服务责任人、可重复的请求、可控的发布方式、已知日志入口和至少一个下游。优先用能够灰度与回滚的路径，而不是从最复杂、最长链、最难复现的故障开始。

| 阶段 | 最小产物 | 完成标准 |
| --- | --- | --- |
| 定义问题 | 一个接口和一个待回答问题 | 能说明目前缺什么证据 |
| 应用接入 | 正确服务身份与传播 | 正常请求跨两个服务连成链 |
| 错误接入 | 业务失败表达与日志关联 | 能从入口错误找到下游失败证据 |
| 平台接入 | Collector 自监控、权限与限额 | 故障时不会变成无监控黑盒 |
| 成本验证 | 固定窗口资源与样本质量 | 数据规模在预算内且能回答原问题 |

不要把安装了 Java Agent、SDK 初始化成功或 Jaeger 页面打开当作最终收益。收益应体现为减少了哪一步人工检索、哪个故障类型变得可解释、哪些缺失仍然存在。

若原环境已经有统一比例采样，第一阶段可以保留这个事实，先让日志稳定输出 Trace ID，再为异常接口提供代表性查询。要进一步提高稀有错误覆盖，再评估尾采样和候选数据成本，而不是将完整性承诺放在尚未改动的采样链路上。

本笔记先使用两个 Go 服务，再增加 Java → Python → Go 调用，是为了把接入问题压缩成可复现模型；搬到生产时应保留这种“先定义问题、再验证最小链路”的方式，而不是要求所有技术栈都改写成 Go。


### 22.2 保留 Prometheus 与既有日志链路

新增 OTel 主要填补应用埋点、跨服务传播和统一遥测处理，不意味着已有组件失去作用。Prometheus / vmagent 可以继续抓基础设施，VictoriaMetrics 可以继续承担指标存储，Filebeat / Logstash / ES 可以继续提供日志查询。

```mermaid
flowchart LR
    A[节点与 Kubernetes 指标] --> B[现有 Prometheus 或 vmagent]
    B --> C[现有指标后端]
    D[应用 JSON 日志] --> E[现有日志采集链]
    E --> F[现有日志后端]
    G[应用 OTel Traces] --> H[Collector]
    H --> I[Trace 后端]
    F -.->|Trace ID| I
    C -.->|可选 Exemplar| I
```

#### 先统一可关联的身份

服务名、环境、实例、时间窗和接口模板比“所有数据一定走同一个 Collector”更重要。三套信号由不同采集器处理，只要身份与时间语义清楚，也可以实现有效的联合分析；反之，全部塞进 Collector，但服务名互相矛盾，依然很难排障。

对现有日志链路，可以先新增或规范 `trace_id`、`span_id`、服务名和接口模板字段，保持原索引与生命周期策略。不要为了接入 OTel 默认把旧 ES 当成支持所有新 OTLP 文档模型的原生后端，应按实际版本使用已有采集映射或经过验证的转换。

对现有指标，应避免两条路径同时采集和写入同一个逻辑指标。需要对照时，明确分开 job、租户或测试后端，并规定撤除时间；否则重复采集可能把系统看起来的负载、请求量甚至错误率都改变。

| 已有能力 | 首期是否替换 | OTel 首期补充 |
| --- | --- | --- |
| 节点与集群指标 | 通常保留 | 关联服务 / Pod 身份 |
| 指标告警 | 保留主路径 | 添加必要业务 SLI 与 Collector 自监控 |
| JSON 日志采集 | 保留 | 正确的 Trace 上下文字段 |
| Trace 后端 | 可复用支持的后端 | 规范接入、采样与查询路径 |
| CMDB / 服务目录 | 保留 | 与 service.name / namespace 对齐 |

低内核环境也可以从 SDK、Java Agent、OTLP 和 Collector 开始，不把 eBPF 当作前置条件。自动网络观测有它的价值，但不能替代业务错误语义和进程内上下文的设计。


### 22.3 做灰度、切换与回退

灰度不仅是把流量从 1% 增到 100%，还包括明确新旧数据如何区分、什么结果需要停止、回退是否会影响状态和查询。观测组件本身也会消耗资源并影响业务，不能因为“只是监控”就省略发布控制。

#### 把变更拆成可归因步骤

先接入 SDK 与正确身份，再验证传播，随后增加日志关联，最后调整采样与 Collector 处理。不要在一次发布中同时升级 Java Agent、切换 Collector、修改指标单位并替换 Trace 后端，否则出了问题很难判断是哪一层导致。

| 灰度阶段 | 对照内容 | 停止条件示例 |
| --- | --- | --- |
| 少量测试实例 | 服务名、Span 关系、业务行为 | 重复插桩或明显错误 |
| 低比例真实实例 | CPU、内存、请求延迟与错误 | 超出预先约定的预算 |
| 单业务组接入 | 覆盖、字段与查询流程 | 无法关联责任服务或异常样本 |
| 扩大规模 | Collector 队列、后端容量 | 持续积压、拒绝或敏感数据风险 |

“预先约定”很重要：阈值应来自你的服务 SLO 和资源预算，不用本文虚构一个适合所有应用的性能百分比。正常与异常路径都要对照，尤其是带堆栈、重试和高并发的请求。

#### 回退不是只恢复镜像标签

应用 SDK 与 Agent 可以通过发布回退恢复，但 Collector 可能已经写出新字段、形成新时间序列或持有新格式队列。回滚后旧版本是否能读取磁盘状态、旧查询是否还能覆盖新旧数据、尾采样的未决状态是否丢失，都需要处理。

```text
回退记录至少包含：
  触发条件和决定人
  应用与 Collector 的旧镜像 / 配置
  当前队列和未决状态的处理方式
  新旧数据字段兼容策略
  回退后的业务与观测双重验证
  没有覆盖的损失窗口
```

灰度双写时不应默认“主后端 + 测试后端”永远互不影响。Collector 扇出分支的失败和队列可能形成耦合，测试后端不可用也可能拖累主路径；对关键生产流量，应先验证隔离设计，再进行长期双写。

一次发布成功的标准应包括：业务没有受到不可接受影响、数据质量符合目标、资源在预算内、故障路径可观察，并且回退步骤经过演练或明确验证。仅凭接入覆盖率没有体现这些要求。


### 22.4 管理版本升级和后端变化

OTel 生态有多个独立版本轴：规范、语言 API / SDK、自动埋点库、语义约定、Collector、组件发行版、Operator / Helm Chart 和后端。它们不是一个统一的“OTel 版本号”，也不意味着所有相同数字的包都应该一起设置。

本笔记特意固定 Go SDK 1.38.0 与 otelhttp 0.63.0，是因为后者该版本的依赖文件可以核对前者；Collector 0.136.0 和 Jaeger 2.11.0 则是另一条兼容关系。正式升级应保存自己的版本矩阵，而不是照抄教学版本长期运行。

| 版本变化 | 重点回归 |
| --- | --- |
| Go SDK / Java Agent / Python SDK 与 instrumentation | 启动、生命周期、默认协议、重复埋点、性能 |
| HTTP / DB 自动埋点库 | Span 名、属性、状态与传播 |
| SemConv | 字段名、单位、稳定性迁移与旧查询 |
| Collector | 组件名、配置 schema、feature gates、自监控指标 |
| Operator / Chart | CRD、生成的工作负载、注入与权限 |
| Prometheus / VM / 日志后端 | 名称转换、Resource 映射、Histogram 与时间聚合 |
| Trace 后端 | 写入协议、查询 API、保留与存储配置 |

#### 一个不依赖业务流量的回归起点

第二卷的 OTLP fixture、第一卷的五种请求模式，以及日志 JSON 回放可以组成最小升级回归集。旧版本和候选版本分别处理同样输入，对照核心字段、Span 集合、采样结果与后端可见性；性能则另用具有代表性的流量测量，不与功能测试混为一谈。

升级前先检查弃用和移除项。比如旧文章可能使用历史 Jaeger / Loki exporter、老式 `spanmetrics` processor 或旧内部遥测字段；应根据目标镜像的实际组件清单迁移，而不是机械把名称改成网上最新写法。

后端变化也不仅是改 endpoint。即使都接收 OTLP，指标名称转换、Resource 提升、日志字段存储、索引和查询 API 仍可能不同。需要改写的是整个“写入数据契约 → 查询 → 告警 → 关联跳转”的验证，而不只是确认网络连通。

保存不可变镜像引用、完整依赖锁、配置快照和测试结果，会让后续笔记维护更可靠。资料中应注明“核查日期”和“运行版本”，把概念性说明与版本敏感示例分开，避免过了一段时间仍把旧参数写成无条件的当前事实。


## 第 23 章：综合实战——错误接口到可追溯证据

### 23.1 形成正常、慢请求和错误的基线

综合实验不是再部署一套系统，而是把前三部分已经建立的能力串起来：入口产生可识别请求，业务日志保存关联字段，指标给出异常规模，Trace 解释调用过程，Collector 自监控负责解释观测链路自身的故障。

先恢复第一卷单 Collector 主线，应用根采样比例 1；需要指标时保留第二卷 Metrics pipeline 和 Prometheus。先不使用尾采样，以便建立未被策略偏置的功能基线。之后再按实验目标逐项加入尾采样、持久化和多实例路由，避免组合过多变量。

#### 十二个实验与对应知识点

| 实验 | 输入或变更 | 验证产物 | 主要章节 |
| --- | --- | --- | --- |
| L01 正常与错误链路 | `ok` 与 `error` | 入口响应、两端日志、父子关系与错误 Span | 第一卷第 5—6 章 |
| L02 断链 | `broken`，再恢复正常 Context | 同一案例号对应不同 Trace 的证据 | 第一卷第 3 / 5 章 |
| L03 头采样 | 根比例 1 → 0.1 | 请求与 sampled 分母、可查询样本 | 第二卷 14.1 / 14.4 |
| L04 尾采样 | 错误、慢、正常策略 | 不同类别的候选与保留结果 | 第二卷 14.2 |
| L05 指标映射 | 打开 Metrics 与 Prometheus | 名称、单位、标签、计数口径 | 第二卷第 12 章 |
| L06 日志关联 | JSON 回放 → LogRecord | 时间、级别、Resource、TraceId 映射 | 第二卷第 13 章 |
| L07 出口与队列 | 暂停后端，恢复或重启 Collector | 积压、恢复与缺失 / 重复集合 | 第 19 章 |
| L08 Kubernetes 身份 | 注入 Pod UID 并观察 | Pod / namespace / node 真实归属 | 第二卷第 15 章 |
| L09 状态路由与安全规则 | 多采样实例、成员变化或假敏感字段 | 不完整链、规则覆盖与未覆盖边界 | 第 18 / 21 章 |
| L10 跨语言调用 | Java → Python → Go | 正常、失败、超时、断链与日志关联 | 第一卷第 7—9 章 |
| L11 节点与集群采集 | 指标、容器日志、Events | 来源身份、读取位置、重复采集与权限 | 第二卷第 16 章 |
| L12 自动注入 | Instrumentation 与 Pod 模板 | 注入变化、实际 Span、回退后业务可用 | 第二卷第 17 章 |

L09 包含两种独立扩展方向，应分别执行、分别记录，不把扩容与脱敏变更放在同一轮实验。实验编号是本笔记的组织方式，不是已经执行过的测试清单。

#### 为每轮数据加上独立批次标识

```bash
RUN_ID="manual-$(date -u +%Y%m%dT%H%M%SZ)"
for mode in ok error slow timeout broken; do
  curl -sS -i --max-time 6 \
    -H "X-Demo-Case: ${RUN_ID}-${mode}" \
    "http://127.0.0.1:8080/work?mode=${mode}"
done
```

保留 HTTP 返回值、案例号和时间。CLI 的超时与服务中的 deadline 是不同边界；若请求工具自己先超时，不能凭空填入服务端 504。第一卷对 `timeout` 的 B 端本地日志也不等于 A 已收到该响应，需分别保存。

请求结果不同不意味着每个都应有 ERROR 状态：`slow` 是慢而成功，`broken` 是业务成功但观测断链，`error` 才是本例主动失败。这三个对照能帮助区分业务异常、性能异常和观测数据质量问题。


### 23.2 从访问日志定位异常调用

实际排障可以先聚合错误接口，再选择代表性 Trace。这样既保留异常分布，又避免对每条日志都进行后端存在性查询。关键是区分“日志集合反映的规模”和“已取得 Trace 反映的具体路径”。

下面的脚本处理第二卷导出的纯 JSON Lines，只针对本实验的 service-a 完成日志，按接口、HTTP 状态和错误码聚合，并选出最多五个有效 Trace ID。它不查询 Jaeger，也不把候选 ID 标记为已经存在。

```python
# 文件建议名：summarize-errors.py
# 示例：python3 summarize-errors.py logs/requests.jsonl --case-prefix manual- > error-groups.json
import argparse
import collections
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("input", type=Path)
parser.add_argument("--service", default="service-a")
parser.add_argument("--case-prefix", default="")
args = parser.parse_args()
trace_re = re.compile(r"^[0-9a-f]{32}$")
groups = {}
invalid_lines = 0
seen_cases = set()

with args.input.open(encoding="utf-8") as source:
    for line in source:
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            invalid_lines += 1
            continue
        if not isinstance(item, dict):
            invalid_lines += 1
            continue
        if item.get("msg") != "request.complete":
            continue
        if item.get("service.name") != args.service:
            continue
        case_id = str(item.get("demo.case_id", ""))
        if not case_id.startswith(args.case_prefix):
            continue
        try:
            status = int(item["http.response.status_code"])
        except (KeyError, TypeError, ValueError):
            invalid_lines += 1
            continue
        if not 100 <= status <= 599:
            invalid_lines += 1
            continue
        # 校验后再去重，避免格式损坏的记录占用有效案例号。
        # 案例号在本实验中每个入口请求唯一；生产需使用真实事件身份。
        if case_id and case_id != "unspecified":
            if case_id in seen_cases:
                continue
            seen_cases.add(case_id)
        if status < 500:
            continue
        route = str(item.get("http.route", "unknown"))
        error_code = str(item.get("demo.error_code", "unknown"))
        key = (route, status, error_code)
        group = groups.setdefault(key, {
            "service": args.service,
            "route": route,
            "http_status": status,
            "error_code": error_code,
            "completed_errors": 0,
            "sampled_flag_counts": collections.Counter(),
            "trace_candidates": [],
            "times": [],
        })
        group["completed_errors"] += 1
        flag = item.get("trace_sampled")
        label = "true" if flag is True else "false" if flag is False else "unknown"
        group["sampled_flag_counts"][label] += 1
        stamp = item.get("time")
        if isinstance(stamp, str):
            group["times"].append(stamp)
        trace_id = str(item.get("trace_id", "")).lower()
        if trace_re.fullmatch(trace_id) and trace_id != "0" * 32:
            candidate = {"trace_id": trace_id, "query_state": "not_checked"}
            if candidate not in group["trace_candidates"] and len(group["trace_candidates"]) < 5:
                group["trace_candidates"].append(candidate)

result = sorted(groups.values(), key=lambda x: x["completed_errors"], reverse=True)
for group in result:
    times = group.pop("times")
    group["source_timestamps"] = {"first_seen": times[0], "last_seen": times[-1]} if times else None
    group["sampled_flag_counts"] = dict(group["sampled_flag_counts"])
print(json.dumps({
    "source": str(args.input),
    "scope": "入口完成日志中的5xx；不是全系统错误率",
    "case_prefix": args.case_prefix,
    "invalid_lines": invalid_lines,
    "groups": result,
}, ensure_ascii=False, indent=2))
```

`first_seen` 和 `last_seen` 是文件中遇到的顺序，不声称日志文件已严格按发生时间排序。生产系统通常应在有明确时区的时间窗内检索，再进行去重与聚合；本脚本用案例号前缀控制实验范围，避免引入一套日志查询平台。

#### 从候选到证据

对每组候选，先按当前 Jaeger 的查询能力查一个或少量 ID。找到后核对服务、时间和关键 Span；未找到则记录当前状态与原因，再按有限次数和合理等待窗口重查。认证失败和超时应标记为“查询失败 / 未知”，不能标记成“该 Trace 不存在”。

```text
候选状态机：
not_checked
  → found
  → pending_visibility → found 或 not_found_within_window
  → query_error

只有 found 且内容与服务/时间/案例一致，才进入诊断证据集。
```

如果错误接口分布已足以指出主要受影响服务，可先使用日志和指标判断范围；Trace 用于解释一条具体失败路径。不要为了等到一条完整 Trace，而阻塞所有初步止损判断；也不要在缺少链路时虚构下游调用。


### 23.3 注入观测链路故障并对照

故障实验应该每次只改变一个因素，并预先准备恢复步骤。观察系统发生问题，不一定意味着业务也发生问题；这正是要把业务请求和遥测健康分开检查的原因。

| 实验变化 | 业务侧可能表现 | 观测侧重点 | 恢复方式 |
| --- | --- | --- | --- |
| 将应用 OTLP endpoint 改成不存在地址 | 业务仍可能成功 | SDK 导出错误、Collector 接收下降 | 恢复 endpoint 并重建应用 |
| 设置根采样比例 0 | 业务仍运行、日志仍存在 | 有 ID 但不导出所需 Span | 恢复比例并重建应用 |
| 暂停 Jaeger | 业务仍可能成功 | Exporter 重试与队列增长 | unpause，验证排空 |
| 故意删除客户端父 Context | 业务可能成功 | 同一案例号出现不同 Trace | 恢复 Context 传递 |
| 改错 JSON 字段路径 | 原始日志仍存在 | 标准 TraceId / 时间 / 级别缺失 | 恢复 parser 并回放新测试数据 |
| 增加尾采样成员 | 业务不一定有变化 | 跨成员变化的 Trace 完整性 | 按明确路由与状态策略回退 |

#### 区分业务故障与观测故障

第一卷 `/work?mode=error` 是业务逻辑主动返回失败；暂停 Jaeger 是观测后端故障。二者可能都导致“根因分析拿不到完整结果”，但修复方向完全不同。若指标正常、业务请求正常、只有 Trace 缺失，应先查观测链路，而不是扩大业务回滚范围。

同时也不能把观测失败当作业务正常的证据。SDK 导出全断时，Trace 集合没有错误只是因为没有数据；必须用独立的业务指标、请求探针和日志确认当前服务状态。

#### 用集合对照避免含糊描述

对固定批次，保存入口案例集合 `R`、有效 Trace ID 集合 `T`、后端实际找到的集合 `F`。`F` 中还要检查是否包含预期服务和父子关系；仅有一条 Span 不算完整链。对日志回放，单独记录重复案例号与解析失败行数，不把它们悄悄忽略。

头采样、尾采样和主动过滤存在时，`R` 与 `F` 本来就不应该相等。先按策略划定应该保留的候选，再分析缺失；若候选规则无法完全确定，必须保留未知范围，而不是把所有差异都归为 Collector 丢失。

```text
一次实验的对照顺序：
1. 保存运行配置、采样设置和版本。
2. 生成带唯一案例号的请求，并保存响应。
3. 注入一个已定义的故障，记录准确时刻。
4. 同时保存应用、Collector 与后端证据。
5. 恢复该因素，不夹带其他优化。
6. 再次生成新请求，检查业务与观测是否恢复。
7. 按案例/Trace/Span 身份核对，而不是只看总数。
```

本节是实验方法，不包含已经获得的故障结果。执行失败本身也有学习价值：把失败条件、实际日志和不能判断的边界记下来，才能避免下一次以相同假设重复测试。


### 23.4 输出证据记录与学习检查单

故障分析的最终产物不是一段听起来像根因的文字，而是一组可以回到原始数据的事实、推断和未决项。即使后续把这些证据交给 AI 或 MCP 查询，也应该先明确来源、时间窗、采样与缺失情况。

#### 一份可复查的记录模板

```json
{
  "case_id": "填写本轮实际案例号",
  "status": "not_executed",
  "window": {
    "start_utc": null,
    "end_utc": null
  },
  "runtime": {
    "app_version": null,
    "collector_version": null,
    "backend_version": null,
    "config_hash": null
  },
  "sampling": {
    "head_policy": null,
    "tail_policy": null,
    "known_visibility_delay": null
  },
  "evidence": {
    "request_result": null,
    "log_sources": [],
    "metric_queries": [],
    "trace_ids": [],
    "collector_observations": []
  },
  "findings": {
    "confirmed_facts": [],
    "hypotheses": [],
    "excluded_hypotheses": [],
    "unknowns": []
  },
  "root_cause": null,
  "recovery": {
    "action": null,
    "verification": null,
    "remaining_risks": []
  }
}
```

模板中的 null 和空列表应由实际实验填写，不能用“预计应该如此”补成真实结果。保存查询时应包含查询表达式、时间窗和数据来源，而不只保存一个截图；保存 Trace 时需保留它来自哪个后端、哪个租户和查询时刻。

#### 把事实与推断分开

“service-a 返回 502，service-b 的 business.work 标记 inventory_unavailable”可以是直接观察；“真实库存数据库已经宕机”则需要额外证据。本笔记的 service-b 没有连接数据库，所以正确结论是模拟的业务失败，而不是把演示操作说成真实数据库故障。

AI 分析也应遵守这个边界：未找到 Trace 时继续使用指标和日志，但不能生成不存在的调用关系；同一事件通过日志和 Trace 两种形式出现，不应当成两份独立验证；带凭据、用户内容或敏感业务参数的数据在发送到外部模型前要经过批准与处理。

#### 完成三卷后的能力自检

| 能力 | 能说明并实际验证的结果 |
| --- | --- |
| 基础模型 | 区分 Resource、Scope、Span、Event、Status 和 Logs 上下文 |
| 应用接入 | 建立正确的父子链，避免丢 Context 与重复 Provider |
| 数据处理 | 画出实际 pipeline，验证转换、过滤和错误路径 |
| 多信号 | 解释指标统计口径，正确映射日志和 Trace 关联 |
| 采样 | 区分候选、保留与可查询，知道哪些数据无法追回 |
| Kubernetes | 识别真实来源 Pod，分清采集归属与权限 |
| 生产可靠性 | 解释状态、队列、重试、持久化与扩容限制 |
| 治理与诊断 | 有界采集、可回滚发布、可复查证据和明确未知 |

#### 后续扩展的边界

Profiles、eBPF 自动插桩、GenAI 语义约定和 OpAMP 都可以成为后续专题，但不应成为完成本主线的前置条件。持续剖析关注 CPU / 内存等执行资源，网络级自动观测未必理解业务语义，GenAI 属性还涉及提示词与输出的敏感性，OpAMP 则聚焦遥测 Agent 的管理；每个方向都需要单独核对支持状态和适用环境。

对低内核、已有 Prometheus / ELK 的环境，先把 SDK / Agent、传播、Collector、采样和证据链做好，已经能够解决大量真实问题。之后再依据缺失的诊断能力扩展，而不是为了凑齐产品名一次引入所有组件。

这三卷的终点是：**能够解释每条数据从哪里来、经过哪些处理、哪些部分可能缺失，以及当前证据究竟能支持什么结论。** 具体的性能数字和恢复承诺，应来自你的运行环境与测试记录，而不是这份学习笔记的假设。
