# Loki 学习笔记 · 第四卷：生产运维、迁移与故障排查

> 面向需要维护日志平台、处理故障和组织迁移的运维、SRE 与平台工程师。
> 核查日期：2026-09-24。沿用 Loki 3.7.8、Alloy 1.19.2、Grafana 13.2.2 与 Community Chart 18.13.5。
> 本卷的故障注入仅针对自行创建的隔离实验环境；生产修改必须先确认影响范围、审批、备份和回滚条件。
> 容量算例属于明确假设，脚本测试属于本地模拟。未执行真实集群的限流、断网、节点故障、删除与恢复实验，文中的验收结果均为读者需要验证的预期。
> 前置阅读：前三卷。实验脚本与第一卷的 `loki_client.py`、`generate.py`、`verify.py` 保存在同一 `scripts/` 目录。

| 章节 | 要解决的生产问题 |
| --- | --- |
| 第 25 章 | 发生故障后，数据保存在什么地方，哪些还能恢复？ |
| 第 26 章 | 瓶颈是写入、日志流数量、查询还是对象存储？ |
| 第 27 章 | 怎样让读写账号和租户边界真正受到约束？ |
| 第 28 章 | 怎样证明日志平台本身仍然正常？ |
| 第 29 章 | 日志没有进入平台，应从哪一段检查？ |
| 第 30 章 | 查询慢、历史数据缺失和清理失败怎样区分？ |
| 第 31 章 | 怎样迁移采集器、ELK 旁路和旧 Loki，而不只转换配置？ |
| 第 32 章 | 怎样形成可回放实验与受限的诊断证据？ |

## 第 25 章：可靠性、背压与恢复边界

### 25.1 先画清楚状态，而不是先承诺不丢日志

一次 HTTP 写入成功，只能证明对应接收方按它的协议处理了请求。日志系统由多个异步阶段组成，源文件、读取位置、发送批次、Ingester WAL、内存 Chunk 和对象存储不是同一份状态。对可靠性的讨论必须包含故障模型和具体时刻。[文件采集][S-source-file][loki.write 与指标][S-alloy-write][Ingester WAL][S-wal]

```mermaid
flowchart LR
    A[源文件] --> B[采集读取位置]
    A --> C[Alloy 内存与发送批次]
    C --> D[Loki 写入与副本]
    D --> E[Ingester WAL]
    D --> F[内存 Chunk]
    F --> G[索引和 Chunk 对象]
    B -.不保存完整正文.-> R[恢复能力评估]
    E --> R
    G --> R
```

| 状态 | 保存什么 | 丢失后需要什么 |
| --- | --- | --- |
| 原始日志文件 | 业务实际写出的字节 | 上游备份或业务重放；下游无法还原未采到内容 |
| 文件读取位置 | 某文件读到哪里 | 重新判断采集起点，可能出现重复或遗漏 |
| 默认发送缓冲 | 待发送批次与重试状态 | 重启后不能直接假定仍然存在 |
| 可选采集 WAL | 特定组件已接收并记录的数据 | 相同状态目录、格式兼容和正确重放流程 |
| Ingester WAL | 已进入该 Ingester 的日志状态 | 对应磁盘可用、记录可读和重放成功 |
| 对象存储 | 已持久化的索引与 Chunk | 对象、Schema、租户、凭据及索引语义匹配 |
| 查询缓存 | 可再获取或再计算的结果 | 回源能力和额外恢复负载 |

问题“Pod 重建会不会丢日志”缺少关键条件：谁的 Pod、哪种卷、是否还在写、旧实例怎样退出、源文件是否轮转、对象是否上传。先把问题补完整，才有可验证答案。

### 25.2 读取位置不是发送确认的替代物

一个常见误判是：位置文件存在，所以采集器退出也不会丢。位置文件没有保存全部待发送正文；即使记录了偏移，也不能无条件推出下游已经完成持久化。[文件采集][S-source-file]

判断恢复能力时至少保存这组证据：

```text
源文件路径和轮转方式
采集目标的实际标签
组件 ID 与 storage.path
进程退出方式和退出时间
最后观察到的读取位置
发送成功、重试和丢弃的计数变化
恢复后按 event_id 对照的集合差异
```

实验应分别测试优雅重启与强制退出。`docker compose restart alloy` 与 `docker kill` 不是相同实验；删除容器与删除 named volume 也不是同一行为。

禁止先删除位置文件再问为什么重复。真正需要从头回放时，应保留旧状态备份，使用独立实验输出，明确新旧事件是否会进入相同租户和日志流。

### 25.3 采集端 WAL 的使用边界

Alloy 的 `loki.write` 文档在本次核查时仍将可选 WAL 和相应队列配置标为实验性能力。主实验不依赖它，不能把“安装 Alloy”描述成“默认提供磁盘消息队列”。[loki.write 与指标][S-alloy-write]

评估该功能时，先使用固定版本的帮助和组件文档确认稳定性开关，再做单独配置分支。不要直接把新文档中的块粘进默认稳定性设置的生产实例。

| 需要验证的内容 | 验证方法 | 不能用什么代替 |
| --- | --- | --- |
| 数据真的写入 WAL | 观察状态目录增长、写入指标和内容生命周期 | 仅看到组件绿色 |
| 重启后可继续发送 | 下游不可用时积压，再重启并恢复下游 | 只做正常网络重启 |
| 磁盘满时的行为 | 隔离小容量卷，观察错误与数据对账 | 根据目录名称猜测 |
| 重试耗尽的行为 | 控制拒绝响应并记录丢弃 | 假定所有错误永久重试 |
| 版本升级后的状态 | 旧状态副本上验证重放 | 只验证空目录启动 |

需要强持久化缓冲时，应根据实际故障目标选择经过验收的采集和缓冲设计。已有 Kafka 可以是一项选择，但增加 Kafka 不会自动修复源文件未采集、解析丢弃、永久写入拒绝等问题。

### 25.4 重试既可能救数据，也可能制造重复

发送端遇到连接中断时，可能无法知道服务端是否已经接收。重试可以避免因为不确定而漏发，也可能导致同一事件再次写入。日志正文包含稳定 `event_id`，能帮助识别重复，但不会让 Loki 自动成为按该字段唯一约束的数据库。[loki.write 与指标][S-alloy-write][Loki HTTP API][S-http]

区分三类情况：

| 故障 | 处理方向 | 恢复检查 |
| --- | --- | --- |
| 临时连接失败或部分服务端错误 | 有界退避与重试，保护其他租户 | 延迟、重试、事件集合 |
| 429 限流 | 先识别租户总量、单流或流数量限制 | 速率与积压是否真正下降 |
| 字段、时间、大小等永久校验错误 | 修复数据或规则，再控制范围回放 | 被拒事件是否保留且重新接受 |

不能让无效消息无限撞击同一接口，也不能只凭“返回 400”就丢掉全部诊断上下文。记录错误类型、源文件范围和示例事件时还要避免把凭据及完整敏感正文写入监控日志。

同一 Timestamp、同一行文本是否在展示或查询中被合并，不应作为端到端去重契约。对账脚本故意不主动去重，因为重复正是需要观测的现象。

### 25.5 背压是传播过程，不是无限缓冲

对象上传变慢，可能导致 Ingester 持有更多状态；写入端响应恶化后，采集端积累批次；最终源文件仍按自身策略轮转。链路中任何有界空间被耗尽，都可能把短暂延迟转变成无法补采的损失。[Ingester WAL][S-wal][Loki 架构][S-architecture]

```text
恢复窗口 = 可保留原始数据的时间
          与各缓冲层实际可用时间中的受限部分
```

不要简单把所有缓冲天数相加。这些层不一定保存互不重叠的数据，也不一定按同一种故障同时可用。

恢复时需同时处理新增数据与历史积压。若入口每秒新增 1,000 条，恢复链路也只能处理 1,000 条，积压不会清空。第 26 章提供显式使用净处理能力的算例。

### 25.6 恢复验收：集合、时间与语义都要对齐

使用第一卷 `generate.py` 生成有限批次，保存清单；发生异常后先恢复依赖，再运行 `verify.py`。只有查询本身没有超限、没有异常，集合比较才有解释意义。

```bash
# 在 lab 目录，隔离环境中生成一批新的事件。
python3 scripts/generate.py --count 200 --rate 20
# 使用上一步打印出的实际清单路径，不复用旧 run_id。
python3 scripts/verify.py manifests/实际运行ID.json
```

报告中的 `missing` 是在给定租户、时间窗口、选择器与元数据契约下未找到的 ID，不直接等同于物理丢失。标签改变、时间解析失败、元数据没有写入，也会导致“缺失”。

出现缺失时，先用同一服务和更宽时间范围对正文 `run_id` 查询，区分元数据路径错误和数据真的不存在；扩大范围仍必须有上限。不要直接扫描全部租户全部历史。

**本章验收：** 画出数据状态表，完成一次可控中断后的恢复对账，明确不能由这次实验证明的故障范围，例如整块磁盘损坏或对象服务区域故障。

## 第 26 章：容量规划、成本与扩缩容

### 26.1 先统一单位和假设

日志容量讨论经常混用条数、字节、压缩后对象大小和副本数量。本文算例使用 EPS 表示每秒事件数，原始大小使用 UTF-8 字节，GiB 使用 `2^30`。它不是某个固定硬件的推荐容量。

```text
每天原始字节 = 平均 EPS × 平均单条字节 × 86400
估算对象字节 = 每天原始字节 × 保留天数 × 存储/原始比例 × (1 + 额外开销比例)
峰值原始缓冲 = 峰值 EPS × 平均单条字节 × 缓冲小时 × 3600
```

“存储/原始比例”应来自真实样本的测量。大量重复文本、随机字符串、异常堆栈、结构化元数据比例不一样，压缩效果就不一样。额外开销也应与已包含在测量值中的项目去重。

| 输入 | 教学假设 | 正式评估应替换为 |
| --- | ---: | --- |
| 平均事件率 | 1,000 EPS | 有代表性工作日和周末的实际值 |
| 峰值事件率 | 5,000 EPS | 促销、重启、异常风暴时的短窗口峰值 |
| 单条平均字节 | 800 B | 按日志类别加权的字节分布 |
| 保留周期 | 30 天 | 各租户和日志级别的实际规则 |
| 存储/原始比例 | 0.25 | 固定 Schema 和处理链路下实测 |
| 额外对象开销 | 15% | 索引、对象组织等未计入项 |

这里算出的不是总采购容量。备份、版本化对象、对象服务自身纠删码或复制、WAL、缓存、节点文件和跨区域冗余需要另行列项。

### 26.2 不要把对象容量直接乘复制因子

`replication_factor` 描述 Loki 写入副本语义，不能机械视为对象存储账单的倍数。Ingester 内存和 WAL 确实会受副本影响，但对象去重、Chunk 内容与后端物理冗余有各自机制。[Loki 架构][S-architecture][Ingester WAL][S-wal]

正确方法是分开测量：

| 层 | 容量单位 | 独立关注点 |
| --- | --- | --- |
| 采集节点 | 文件、状态、队列字节 | 原始日志轮转和故障保留窗口 |
| Ingester | 内存、WAL 磁盘 | 活跃流、Chunk、副本、重放峰值 |
| 索引组件 | 本地索引、缓存 | 重建时间、冷启动下载量 |
| 对象服务 | 逻辑对象与物理存储 | 生命周期、版本、冗余、请求计费 |
| 查询层 | CPU、内存、并发 | 扫描、解析、聚合和排队 |

只比较“ES 磁盘容量”和“Loki Bucket 当前大小”，会漏掉多个层。比较两套日志平台时，应固定输入数据、查询问题、保留周期、可靠性目标和运维成本。

### 26.3 可修改的容量计算器

完整文件 `monitoring/capacity-input.json`：

```json
{
  "average_eps": 1000,
  "peak_eps": 5000,
  "average_line_bytes": 800,
  "retention_days": 30,
  "stored_to_raw_ratio": 0.25,
  "object_overhead_ratio": 0.15,
  "buffer_hours": 2,
  "recovery_incoming_eps": 1000,
  "recovery_processing_eps": 4000,
  "backlog_events": 7200000
}
```

完整文件 `scripts/capacity.py`：

```python
#!/usr/bin/env python3
"""透明的日志容量算例。系数由用户测量输入，不声称给出产品性能保证。"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path

def number(config: dict, key: str, low: float, high: float) -> float:
    value = config[key]
    if (isinstance(value, bool) or not isinstance(value, (int, float))
            or not math.isfinite(value) or not low <= value <= high):
        raise ValueError(f"{key} 超出范围 [{low}, {high}]")
    return float(value)

def estimate(config: dict) -> dict:
    eps = number(config, "average_eps", 0, 10**9)
    peak = number(config, "peak_eps", eps, 10**9)
    size = number(config, "average_line_bytes", 1, 10**8)
    days = number(config, "retention_days", 1, 3650)
    ratio = number(config, "stored_to_raw_ratio", 0.001, 10)
    overhead = number(config, "object_overhead_ratio", 0, 10)
    hours = number(config, "buffer_hours", 0, 720)
    incoming = number(config, "recovery_incoming_eps", 0, 10**9)
    capacity = number(config, "recovery_processing_eps", 0, 10**9)
    backlog = number(config, "backlog_events", 0, 10**15)
    daily = eps * size * 86400
    stored = daily * days * ratio * (1 + overhead)
    drain = None if backlog > 0 and capacity <= incoming else (
        0 if backlog == 0 else backlog / (capacity - incoming))
    return {
        "assumptions": config,
        "raw_gib_per_day": daily / 2**30,
        "raw_peak_mib_per_second": peak * size / 2**20,
        "estimated_object_gib": stored / 2**30,
        "peak_rate_raw_buffer_gib": peak * size * hours * 3600 / 2**30,
        "backlog_drain_seconds": drain,
        "backlog_can_drain": drain is not None,
        "not_included": ["对象服务自身冗余", "Ingester 内存和 WAL 副本",
                         "源文件保留", "缓存", "跨区域流量", "备份和对象版本"],
        "warning": "算例不是实测；对象存储容量不能直接乘 Loki replication_factor",
    }

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    args = parser.parse_args()
    try:
        report = estimate(json.loads(args.config.read_text(encoding="utf-8")))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        parser.exit(2, f"输入无效：{exc}\n")
    print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))

if __name__ == "__main__":
    main()
```

运行方式：

```bash
python3 scripts/capacity.py monitoring/capacity-input.json
```

上述假设得到约 64.37 GiB/日的原始日志、约 555.22 GiB 的 30 天对象估算，以及约 26.82 GiB 的两小时峰值原始缓冲。它们是算术结果，不是实际日志系统测量值。

恢复阶段 4,000 EPS 减去同时新增的 1,000 EPS，净消化能力为 3,000 EPS，因此 720 万条积压约需 2,400 秒清空。只有恢复过程中这些速率能保持，估算才成立。

### 26.4 活跃流与热点流要同时观察

降低基数不代表把所有来源压进一个流。每个请求 ID 都做标签会制造大量小流；反过来，整个集群只保留 `job=access` 可能形成热点、多写入者乱序和单流限流。[Loki 标签][S-labels][限流与写入校验][S-ingestion]

可从受控服务、环境、集群维度开始，测量每流写入和活跃流数量。需要按实例或分片分流时，选择生命周期和数量可控制的维度，并评估查询是否仍能方便汇总。

自动 Stream sharding 也不是不付代价的修复按钮。它需要对应版本配置、运行状态信息以及客户端和后端协作；应把它作为经过压测的容量工具，不掩盖错误标签设计。[自动日志流分片][S-sharding]

**一个有效的对照实验**：同样 10 万条日志，分别使用稳定服务标签、每条唯一请求标签、全部单流三种方案，比较活跃流、拒绝、内存、Chunk 大小及查询扫描量。这里只规定实验方法，不填写未经执行的性能数字。

### 26.5 查询容量单独预算

每天写入不多，也可能因为跨月正则和高基数聚合消耗大量查询资源。查询容量至少包含并发数、窗口长度、候选流数量、扫描字节、解析复杂度和结果序列数量。[查询最佳实践][S-query-bp][查询公平性][S-query-fairness]

增加 Querier 之前，先确定瓶颈：排队等待适合评估执行槽位；对象下载慢需要检查对象服务与网络；正则解析 CPU 高应先对照等价的廉价过滤；内存峰值过高要看聚合维度和分片策略。

压测记录应固定查询文本和时间窗口，并保留结果正确性对照。冷缓存与热缓存分别运行，不把第二次的缓存收益全部算到新配置头上。

### 26.6 扩缩容不是副本数加减

Distributor 扩容、Ingester 扩容、Querier 扩容和缓存扩容改变的状态不同。对有状态组件还要考虑 Ring 收敛、WAL 排空、磁盘生命周期和调度故障域。[Loki 组件][S-components][Ingester WAL][S-wal]

| 变更 | 变更前确认 | 变更后验收 |
| --- | --- | --- |
| 查询层扩容 | 下游对象服务仍有余量 | 排队和错误下降，结果等价 |
| Ingester 扩容 | Ring 和存储健康 | 流归属稳定，没有持续拒绝 |
| Ingester 缩容 | 排空方案与 PVC 保留 | 最近和历史事件均能查到 |
| 缓存扩容 | 连接、内存与服务发现 | 回源下降，没有缓存连接风暴 |
| 保留周期缩短 | 业务授权和备份策略 | 对应数据逐步清理且无误删 |

成本优化应先讨论哪些日志不该产生、哪些敏感字段不该保存、哪些正常日志允许采样，再讨论增加组件。采样条件必须进入第三卷统计契约，否则错误率和分位数可能失去代表性。

## 第 27 章：多租户、安全与日志治理

### 27.1 租户不是客户端自报的可信身份

Loki 的多租户入口使用 `X-Scope-OrgID`，但它不是认证凭据。`auth_enabled: true` 不会自动帮你建立用户、密码和权限体系；可信网关需要认证调用者并决定其可访问的租户。[认证边界][S-auth][多租户][S-tenancy]

第一卷 `auth_enabled: false` 的单机实验使用单租户语义，不能通过添加任意 Header 验证真正的租户隔离。多租户实验应使用新的隔离实例，开启相应配置，并阻断绕过认证网关的直接访问。

```mermaid
flowchart LR
    A[业务采集账号] --> G[可信入口 认证和授权]
    B[只读查询账号] --> G
    G --> M[覆盖客户端租户 Header]
    M --> L[内部 Loki 多租户接口]
    U[未认证外部请求] -.拒绝.-> G
    U -.网络隔离.-> L
```

一个服务同时读取多个租户也应由服务端授权配置决定，不从日志正文、模型输出或自由输入框拼接租户列表。

### 27.2 先把读、写、管理能力分开

| 能力 | 示例路径 | 默认授权建议 |
| --- | --- | --- |
| 查询日志 | query、query_range、labels、series | 只读账号，限制租户、时间和并发 |
| 写入日志 | push、otlp/v1/logs | 采集账号，限制来源和写入速率 |
| 管理规则 | ruler 写接口 | 独立管理账号或 GitOps 流程 |
| 删除日志 | delete | 受审批管理路径，不给普通查询工具 |
| 查看进程配置 | config、服务诊断端点 | 内部运维入口，不暴露给业务用户 |
| 对象读写删除 | S3 API | 组件服务账号，按 Bucket 与操作约束 |

只把网页按钮隐藏并不是后端权限控制。Grafana 的角色、数据源权限和 Loki 租户边界必须配合，不能假定所有自托管版本具备完全一样的细粒度数据源权限功能。

### 27.3 一个明确受限的网关例子

下面配置用于一个固定实验租户 `training`，两个独立 TLS 入口分别提供只读 GET 查询和 POST 写入。它不是通用多租户门户，也不覆盖 Grafana 所有 Drilldown、规则管理或实时 Tail 路径；新增接口需要逐项评估。[Nginx Basic Auth][S-nginx-auth][Nginx 代理 Header][S-nginx-proxy]

完整文件 `gateway/nginx.conf`：

```nginx
# 完整 nginx.conf 的教学示例；先准备证书、CA 和两个独立 htpasswd 文件。
# 仅适用于一个固定租户 training。域名、上游以及证书路径必须替换。
# Nginx 所在主机必须能够解析 loki；Loki 只允许可信网关访问。
worker_processes auto;
events { worker_connections 1024; }
http {
    log_format safe '$remote_addr $remote_user $request_method $uri $status';
    access_log /var/log/nginx/access.log safe;
    server_tokens off;
    upstream loki_internal { server loki:3100; }
    server {
        listen 8443 ssl;
        server_name logs-read.example.com;
        ssl_certificate /etc/nginx/tls/server.crt;
        ssl_certificate_key /etc/nginx/tls/server.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        auth_basic "Loki read";
        auth_basic_user_file /etc/nginx/auth/read.htpasswd;
        client_max_body_size 1m;
        location ~ ^/loki/api/v1/(query|query_range|labels|series)$ {
            limit_except GET { deny all; }
            proxy_set_header X-Scope-OrgID training;
            proxy_set_header Authorization "";
            proxy_read_timeout 30s;
            proxy_pass http://loki_internal;
        }
        location ~ ^/loki/api/v1/label/[a-zA-Z_][a-zA-Z0-9_]*/values$ {
            limit_except GET { deny all; }
            proxy_set_header X-Scope-OrgID training;
            proxy_set_header Authorization "";
            proxy_read_timeout 30s;
            proxy_pass http://loki_internal;
        }
        location / { return 404; }
    }
    server {
        listen 9443 ssl;
        server_name logs-write.example.com;
        ssl_certificate /etc/nginx/tls/server.crt;
        ssl_certificate_key /etc/nginx/tls/server.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        auth_basic "Loki write";
        auth_basic_user_file /etc/nginx/auth/write.htpasswd;
        client_max_body_size 4m;
        location ~ ^/(loki/api/v1/push|otlp/v1/logs)$ {
            limit_except POST { deny all; }
            proxy_set_header X-Scope-OrgID training;
            proxy_set_header Authorization "";
            proxy_read_timeout 30s;
            proxy_pass http://loki_internal;
        }
        location / { return 404; }
    }
}
```

使用前准备正确域名的证书与私钥、两个独立 htpasswd 文件，并验证网关到 Loki 的解析和网络隔离。示例上游 HTTP 只适用于受控隔离网络；跨不可信网络时还应配置上游 TLS 和证书验证。

`proxy_set_header X-Scope-OrgID training` 覆盖外部自带 Header；它并不验证用户是否属于其他任意租户，而是把该入口所有已认证账号固定到一个租户。扩展多租户时应由认证服务返回经过授权的租户，不能把任意 URL 参数直接写入 Header。

Nginx 配置可先用 `nginx -t` 验证，再进行正反向请求测试。本次没有运行该验证。证书存在、权限正确和上游可达都是语法检查之外的条件。

### 27.4 租户隔离的正反向验证

使用两个独立实验租户，各写入含不同事件 ID 的样本。按照下面矩阵验收，而不是只验证“带 Header 的请求返回 200”。

| 测试 | 预期 |
| --- | --- |
| training 读取自己的样本 | 返回匹配结果 |
| 相同入口伪造另一个租户 Header | 仍由网关固定为 training，不能越权 |
| 未认证请求读或写 | 认证失败 |
| 只读账号访问写入口 | 认证失败或明确禁止 |
| 只读账号调用删除路径 | 被拒绝，不创建删除任务 |
| 客户端直接访问内部 Loki | 网络不可达或被策略拒绝 |
| 写入账号访问读入口 | 独立账号库阻断 |

验收日志不要保存密码、Bearer Token 或完整 Authorization Header。测试凭据应来自环境或安全存储，而不是提交到学习仓库。

### 27.5 配置安全与内容安全是两条线

即使认证正确，日志仍可能包含身份证号、访问令牌、Cookie、数据库连接串和完整用户输入。源端最小化优先于后端补救；采集端脱敏后也要验证原始文件、调试日志和旁路 Kafka 是否还保存未脱敏版本。

| 层 | 主要措施 |
| --- | --- |
| 应用输出 | 不记录密码、令牌与原始敏感请求体 |
| 采集处理 | 使用有测试样本的脱敏规则，统计丢弃和异常 |
| 传输 | TLS、证书校验与最小权限账号 |
| 存储 | 租户、加密、保留和删除流程 |
| 查询展示 | 限制返回字段、窗口和结果数 |
| 自动诊断 | 把日志当证据数据，不当系统指令 |

正则脱敏可能漏掉格式变化，也可能误删正常内容。必须用“应该隐藏”和“应该保留”的样本成对测试，不能只展示一个成功替换例子。

### 27.6 自动化查询也要有成本与权限预算

只读查询依然可以造成拒绝服务或泄露数据。给 AIOps/MCP 的入口应限制固定后端、授权租户、服务白名单、最长时间窗口、结果数量、请求数和并发。不能允许模型把错误文本里的 URL 当成新的查询后端。

客户端预算并不替代后端授权。一个能直接访问 Loki 的人可以绕过本书脚本，所以生产防线必须落在网络、网关与服务器配置上。第 32 章提供的受限脚本只是展示如何减少误用，不声称实现完整安全平台。

## 第 28 章：监控 Loki 与 Alloy 本身

### 28.1 监控通道应避免与日志通道同时失效

只在 Loki 里搜索 Loki 的错误日志，可能遇到“Loki 无法写入，因此看不到自身错误”的循环依赖。日志平台的核心指标应进入独立可用的 Prometheus 或 VictoriaMetrics，再通过既有 Alertmanager 通知。[Loki 自监控][S-monitoring]

```mermaid
flowchart LR
    A[Alloy 和 Loki 指标] --> P[独立 Prometheus 或 VM]
    C[Canary 或文件探针] --> P
    P --> AM[独立告警通道]
    A -.运行日志.-> L[被监控 Loki]
    C --> L
```

独立不一定意味着每种组件都新建一套；关键是故障域和依赖关系。已有 Prometheus 能直接抓取目标，通常比让 Loki 故障时仍依赖 Loki 查询生成自己的可用性指标更可靠。

### 28.2 按实例抓取，不要只抓取负载均衡入口

下面是本机已有 Prometheus 的增量 `scrape_configs` 示例。它不是完整 Prometheus 配置，也没有包含告警通知。

```yaml
scrape_configs:
  - job_name: loki-lab-server
    scrape_interval: 15s
    static_configs:
      - targets: ["127.0.0.1:3100"]
        labels:
          cluster: lab
          component: monolithic
  - job_name: alloy-lab-agent
    scrape_interval: 15s
    static_configs:
      - targets: ["127.0.0.1:12345"]
        labels:
          cluster: lab
          component: alloy
```

这里的地址只适用于 Prometheus 与实验端口位于同一宿主网络视角。如果 Prometheus 在容器里，`127.0.0.1` 是它自己，应改为实际可达地址或加入对应网络。

Kubernetes 中应通过 Pod/Endpoint 发现抓取每个实例的指标端口，保留 `instance`、组件和集群标签。抓取一个随机轮转到不同 Pod 的 Service，可能把不同计数器当作同一序列，制造虚假的重置和速率。

指标接口只供内部监控访问；不要为方便抓取把包含配置或诊断信息的整个 HTTP 端口匿名暴露到公网。

### 28.3 采集端指标怎样解释

Alloy 输出组件提供发送、重试、丢弃和传播延迟等指标。组件健康状态主要反映配置状态，不能代替这些投递指标。[loki.write 与指标][S-alloy-write]

```promql
sum by (instance) (rate(loki_write_sent_entries_total[5m]))
```

```promql
sum by (instance) (increase(loki_write_dropped_entries_total[5m]))
```

```promql
sum by (instance) (rate(loki_write_batch_retries_total[5m]))
```

先在实际 `/metrics` 中确认指标是否存在、类型和附带标签，再配置告警。计数器可能因重启重置，使用 `increase/rate` 而不是直接比较总数；多条输出路径还要区分组件 ID 和目的端。

发送成功率不是采集完整率：源文件没有匹配到、处理阶段已丢弃的事件，可能从未进入该输出组件。需要和来源清单、处理丢弃指标、目标发现状态以及端到端探针配合。

### 28.4 写入拒绝要按原因看，不只看 HTTP 总数

Loki 的 `loki_discarded_samples_total` 与 `loki_discarded_bytes_total` 可以按 `reason` 观察写入拒绝。请求尚未解析出日志行时，某些过大请求只能在字节指标中体现，不能只看样本计数。[限流与写入校验][S-ingestion]

```promql
sum by (reason) (rate(loki_discarded_samples_total[5m]))
```

```promql
sum by (reason) (rate(loki_discarded_bytes_total[5m]))
```

指标名里的 discarded 也不能直接当作“最终永久丢失条数”。例如限流后的同一数据可能稍后重试成功，最终是否缺失仍需数据对账；反过来，永久格式错误需要保留来源并修复后重放。

其余核心监控按职责分组：Ring 健康和实例数量、Ingester 内存与 WAL 磁盘、对象请求错误和延迟、查询排队和执行时间、Compactor 最近成功任务、缓存回源变化。[Loki 自监控][S-monitoring]

### 28.5 Canary 的覆盖范围由接入方式决定

Loki Canary 可以生成合成日志并验证其传播、延迟和历史可查询性。它既可以依赖采集器发送标准输出，也可以用 push 模式直接写入 Loki；后者绕过 Alloy 文件采集，因此不能证明文件发现、权限、多行和轮转正常。[Loki Canary][S-canary]

采用标准输出或文件方式时，Canary 查询使用的标签必须与采集后标签一致。多个实例需要能够区分，否则它们可能读到彼此的事件。增加 Canary 数量和查询频率会增加日志平台负载，不能无限加密探测。

正式使用可固定 `grafana/loki-canary:3.7.8`，先检查对应二进制 `-help`。不要照抄网上 `latest` 镜像，再拿不同版本的参数表解释行为。

| 探针方式 | 覆盖 | 没有覆盖 |
| --- | --- | --- |
| 直接 HTTP Push Canary | 网关、Loki 写入与查询 | 节点文件、Alloy 读取和处理 |
| 标准输出经 Alloy | 容器日志采集及后端 | 宿主业务文件的具体权限与轮转 |
| 写入目标文件再查询 | 对应文件的采集到查询 | 其他来源和所有故障情形 |
| 历史 Spot Check | 已上传数据的持续可读性 | 未被采到的源日志 |

### 28.6 本书的文件到查询探针

完整 `scripts/probe.py` 直接向第一卷已有采集通配符覆盖的 `samples/access-probe.jsonl` 追加一个事件，使用唯一 ID 查询，并导出三个无业务内容的 textfile 指标。

```python
#!/usr/bin/env python3
"""从真实被 Alloy 采集的文件发送一个合成事件，再通过只读查询验证。"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import secrets
import tempfile
import time
from generate import generate
from loki_client import LokiClient, QueryError
from verify import compare

def metric_text(passed: bool, elapsed: float, completed: float) -> str:
    return ("# HELP loki_lab_probe_success Last source-to-query probe succeeded.\n"
            "# TYPE loki_lab_probe_success gauge\n"
            f"loki_lab_probe_success {int(passed)}\n"
            "# HELP loki_lab_probe_duration_seconds Last probe total elapsed time.\n"
            "# TYPE loki_lab_probe_duration_seconds gauge\n"
            f"loki_lab_probe_duration_seconds {elapsed:.6f}\n"
            "# HELP loki_lab_probe_completed_timestamp_seconds Last probe completion time.\n"
            "# TYPE loki_lab_probe_completed_timestamp_seconds gauge\n"
            f"loki_lab_probe_completed_timestamp_seconds {completed:.6f}\n")

def publish_metrics(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".probe-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(tmp, 0o644)  # 无业务内容；允许 textfile collector 的账号读取。
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:3100")
    parser.add_argument("--tenant", default="")
    parser.add_argument("--output", type=Path, default=Path("samples/access-probe.jsonl"))
    parser.add_argument("--manifests", type=Path, default=Path("manifests/probes"))
    parser.add_argument("--metrics", type=Path, default=Path("monitoring/probe.prom"))
    args = parser.parse_args()
    started = time.monotonic()
    passed = False
    failure = "not_observed_within_budget"
    attempts = 0
    run_id = secrets.token_hex(6)
    try:
        path = generate(args.output, args.manifests, 1, 0, run_id)
        manifest = json.loads(path.read_text())
        query = '{cluster="lab",job="access",service_name="order-api"}' + f' | event_id="{run_id}:000001"'
        client = LokiClient(args.url, args.tenant, timeout=2, max_requests=1)
        # 最多 20 次，只查询一个唯一事件；最终请求可能比循环期限晚约一个网络超时。
        for attempts in range(1, 21):
            if time.monotonic() - started > 45:
                break
            try:
                rows = client.query(query, manifest["first_ns"], manifest["end_ns_exclusive"],
                                    page_limit=10, max_entries=9)
                passed = compare(manifest, rows)["passed"]
            except QueryError as exc:
                failure = type(exc).__name__
                # 服务错误不自动放大请求频率；下一轮仍在相同总预算内。
            if passed:
                break
            time.sleep(2)
    except (OSError, ValueError, TypeError, KeyError) as exc:
        failure = type(exc).__name__
    elapsed = time.monotonic() - started
    publish_metrics(args.metrics, metric_text(passed, elapsed, time.time()))
    print(json.dumps({"passed": passed, "run_id": run_id, "attempts": attempts,
                      "elapsed_seconds": elapsed, "error": None if passed else failure},
                     ensure_ascii=False))
    raise SystemExit(0 if passed else 1)

if __name__ == "__main__":
    main()
```

```bash
python3 scripts/probe.py
cat monitoring/probe.prom
```

将 `monitoring/probe.prom` 原子发布到已配置的 Node Exporter textfile collector 目录，或者让受控任务把同样的三个指标暴露给 Prometheus。只生成 `.prom` 文件不会自动让 Prometheus 抓到它。[Node Exporter Textfile][S-node-textfile]

同一探针路径不要并发运行；可由 systemd timer 串行调度，或使用运行平台的任务互斥。探针样本也会持续积累，需单独设计轮转和清单保留，不执行无范围的自动删除。

注意第三个指标：如果只告警 `success == 0`，任务停止后旧文件可能仍然显示上次成功。必须同时检查完成时间是否过旧。

```promql
loki_lab_probe_success == 0
```

```promql
time() - loki_lab_probe_completed_timestamp_seconds > 180
```

阈值 180 秒是假设每分钟执行一次的教学配置。还应对指标完全不存在设置独立告警，并检查 Node Exporter 的抓取状态，不能把“抓不到探针指标”当成“Loki 肯定故障”。

### 28.7 用服务目标组织告警

建议把平台目标拆成接受成功、日志新鲜度、查询成功和历史可读四类。每一类都有分母、窗口和排除条件，不能用一个综合百分比掩盖问题。

| 目标 | 一个可测量入口 | 限制 |
| --- | --- | --- |
| 写入可用性 | 授权且格式有效请求的接受情况 | 无效日志不应简单归入服务器宕机 |
| 端到端新鲜度 | 源端合成事件到可查询延迟 | 合成负载不代表所有业务来源 |
| 查询可用性 | 固定查询集合的成功与延迟 | 避免全局宽查询成为探针自身问题 |
| 历史可读性 | 固定历史事件的定期查询 | 需要与保留和删除授权一致 |

采用官方 mixins 时，固定与组件匹配的版本并检查指标、标签、规则名。不要直接导入一个 Dashboard 就宣称日志平台已具备完整监控。

## 第 29 章：采集与写入故障排查

### 29.1 从一个事件开始建立证据链

收到“日志没了”时，先要求一个可定位的事件：服务、实例、原始时间、源文件或容器，以及事件 ID。没有唯一 ID 时，用不会泄露敏感信息的短内容片段配合时间范围。

```text
源端能确认吗？
  ├─ 不能：检查应用输出、重定向、轮转与实例是否正确
  └─ 能：采集目标发现了吗？
       ├─ 没有：路径、权限、发现过滤、节点范围
       └─ 有：处理后仍然保留吗？
            ├─ 不确定：隔离复制样本，检查处理步骤
            └─ 保留：写入接口接受了吗？
                 ├─ 拒绝：认证、大小、时间、限流、Ring
                 └─ 接受：租户、标签、元数据、查询窗口与后端
```

优先做只读检查。原始文件只抽取必要样本，不把生产日志全部复制到个人电脑或模型上下文中。

### 29.2 文件存在，但目标没有读到

**现象：** 应用文件持续增长，Alloy 进程运行，平台没有新日志。

**先看真实运行视角：** 宿主机路径存在，不等于容器内挂载路径存在；目录有读权限，也不等于父目录有遍历权限。

```bash
# 宿主机只读检查；替换为授权的具体目录，不扫描整个文件系统。
stat /data/logs/order-api/access.log
namei -l /data/logs/order-api/access.log
```

容器中优先检查 Pod 的 VolumeMounts、ConfigMap 与实际配置；不要假定每个镜像都带 `ls`、`sh`、`curl`。需要调试容器时走集群授权流程，而不是把采集器永久改成 privileged。

| 证据 | 可能原因 | 修复后验证 |
| --- | --- | --- |
| 目标根本未发现 | 通配符、扩展名、节点过滤 | 新写入唯一事件被读取 |
| 权限拒绝 | UID/GID、父目录、SELinux 上下文 | 相同运行账号能读，策略未放宽过度 |
| 发现旧 inode | 轮转与路径承接 | 轮转前后事件均可查询 |
| 起点跳到文件尾 | 初始化策略或新状态目录 | 明确漏掉范围并决定是否补采 |

不要把关闭 SELinux、chmod 777、挂载整个宿主根目录作为默认答案；它们会扩大安全面，也可能掩盖真正的路径问题。

### 29.3 重复日志先区分重复采集与重复展示

**现象：** 同一请求在页面出现多次，或者对账脚本报重复 ID。

先关闭界面的展示去重，获取保留原始结果的有限窗口。比较时间戳、正文哈希、标签与元数据，而不是只看 message 是否相同。

常见候选原因包括：同一文件被两个 source 匹配、多个 DaemonSet 重叠、API 和文件同时采集、状态目录丢失、网络不确定导致重试，以及应用本身写了多次。

```text
同正文 + 不同事件 ID：可能是业务重复操作，不宜去重
同事件 ID + 不同 job：优先检查采集链路重叠
同事件 ID + 相同标签：检查回放、重试及应用输出
同一长异常被拆成多行：先看多行合并，不是唯一键问题
```

修复时先停止新增重复来源，再明确历史重复是否需要保留。Loki 不是按 `event_id` 更新或删除一条文档的数据库，不要套用 ES 的 `_id` 更新方案。

### 29.4 多行和时间问题容易伪装成丢失

**现象：** Java 堆栈有时延迟出现，或日志出现在错误时间。

多行处理需要等待下一条首行或超时才能确认边界；CRI 的 `P/F` 部分行拼接和 Java 应用堆栈合并不是同一种规则。检查处理顺序、首行表达式和最大等待，而不是只增加 Loki 查询时间窗口。[loki.process][S-process]

时间检查建议形成四列表：

| 时间 | 从哪里获得 |
| --- | --- |
| 原始事件时间 | 应用日志 ts 或 CRI 时间 |
| 采集时间 | 采集端观测或未覆盖时的接收时间 |
| 实际 Loki Timestamp | API 查询返回纳秒字符串 |
| 页面展示时间 | Grafana 时区与时间选择器 |

`action_on_failure=skip` 不等于跳过整条日志，而是时间转换失败时保留原时间行为，需要按该 stage 的文档理解。保留原始正文能让后续发现转换错误，不要用无说明的当前时间覆盖所有坏样本。

### 29.5 400、413 与 429 分开排查

**现象：** 采集端不断报发送失败。

读取响应状态及经过脱敏的错误原因。429 表示限流，但可能是租户吞吐、单流吞吐或流数量；400 通常需要检查标签、时间与元数据；413 还可能来自前置代理而不是 Loki 本身。[限流与写入校验][S-ingestion]

| 类别 | 先看什么 | 不建议的通用修复 |
| --- | --- | --- |
| 401/403 | 谁认证、凭据角色、租户映射 | 关闭认证 |
| 404 | 路径、网关路由、OTLP 后缀 | 随机尝试所有端口 |
| 413 | 代理请求限制、压缩前后大小、批次 | 无条件提高到数 GB |
| `rate_limited` | 租户写入和突发，是否集中回放 | 只加客户端重试线程 |
| `per_stream_rate_limit` | 单流热点、受控分流 | 加每请求唯一标签 |
| `stream_limit` | 活跃流、标签变化、扩容重分布 | 取消所有流数限制 |
| `structured_metadata_too_large` | 单条元数据占比、长堆栈归属 | 把全部正文复制到元数据 |

修复后除错误下降，还要检查端到端延迟和已拒事件能否恢复。发送端恢复正常并不证明此前失败的数据全部补回。

### 29.6 过旧、未来与乱序不是同一条规则

`greater_than_max_sample_age` 关注事件与当前时间的距离；`too_far_in_future` 关注未来偏差；`too_far_behind` 关注某个流相对于其已接收最新事件的时间差。它们不能靠同一个时间参数全部修复。[限流与写入校验][S-ingestion]

一次错误未来时间写入，可能使同一流随后正常日志看起来落后。多个来源共用一组标签时，慢节点或回放也可能触发流内时间约束。

先修正源端时钟与解析，再安排历史回放窗口。回放到独立实验租户或受控新流时，需要明确查询和生命周期影响；不能直接把时间改成现在，声称历史日志已原样恢复。

| 问题 | 关键证据 |
| --- | --- |
| 延迟补采 | 原始时间、文件保留、传输积压 |
| 错误时区 | 同一时间按 UTC 与本地解释的差值 |
| 秒/毫秒/纳秒混用 | 数值位数、接口单位、样本转换 |
| 流内来源竞争 | 相同标签下的来源与最大时间 |

### 29.7 Ring 与对象存储异常

**现象：** 入口可达，但写入副本不足、上传失败或持续恢复。

在内部运维入口查看 `/ready`、实际组件日志和 Ring 页面；具体路径由所选 target 暴露，不同模式不能保证每个 Pod 都有同样的诊断端点。[Hash Rings][S-rings][Loki 组件][S-components]

Kubernetes 中只读检查：

```bash
kubectl -n logging-lab get pods -o wide
kubectl -n logging-lab get svc,endpoints,pvc
kubectl -n logging-lab get events --sort-by=.lastTimestamp
```

输出可能包含内部地址和对象名称，外发前脱敏。检查成员发现的 DNS、7946 TCP/UDP、gRPC 服务和证书；HTTP 通不能证明成员通信正常。

对象上传错误区分 DNS、TLS、Region、Bucket、权限、服务配额和超时。重试可暂时隐藏问题，但 WAL 磁盘和内存仍可能增长。不要删除 WAL 或空目录重启来消除报警；先保护未上传数据，再处理依赖故障。

**本章验收：** 选择路径错误、时间戳错误和临时下游故障各一个，保存完整的“现象—证据—判断—操作前提—修复后对账”记录。

## 第 30 章：查询与存储故障排查

### 30.1 空结果的五个常见边界

HTTP 200 加空 `result` 只说明当前查询没有返回匹配项。它不证明源日志从未出现，也不证明数据已经物理删除。[Loki HTTP API][S-http]

按顺序检查：租户身份、绝对时间区间、索引标签、元数据/正文层次、返回上限与方向。每次只放宽一个条件，并记录为什么放宽。

```text
精确 event_id 元数据过滤为空
  → 同流同时间的正文 run_id 过滤
  → 同服务略宽时间的正文过滤
  → 检查标签变化与原始输入
```

字段曾从 `service` 改为 `service_name`，或者从索引标签改为结构化元数据时，旧查询不会自动翻译。迁移前后应保留字段映射和生效时间。

### 30.2 最近能查、历史不能查

先明确最近日志可能由 Ingester 返回，而历史日志依赖对象和索引。WAL 重启后仍能查询，不一定证明对象存储读路径正常；需要隔离恢复或历史窗口检查。[Loki 架构][S-architecture][存储 Schema][S-schema]

| 观察 | 候选范围 |
| --- | --- |
| 最近数据正常、超过一定时间缺失 | Chunk 上传、索引上传、Schema 或存储读取 |
| 某个租户历史缺失 | 租户映射、保留/删除规则、对象前缀 |
| 某天前后出现断点 | Schema 切换、时区边界、配置历史 |
| 只有部分时间段报对象不存在 | 误删、生命周期策略、备份不一致 |
| 重启冷实例后全部失败 | 隐藏在本地缓存后的对象权限或网络问题 |

不能先修改旧 Schema 的 `from`、`object_store` 或索引前缀“碰碰运气”。记录旧配置并用第二卷工具检查历史前缀是否被改写，避免扩大不可读范围。

### 30.3 查询慢：先分解时间

宽时间窗口的查询慢，不意味着整个集群所有组件都需要扩容。保存同一查询的绝对起止、步长、返回限制、统计和错误，再分解排队、扫描、解析、对象下载和结果处理。[查询最佳实践][S-query-bp][缓存][S-cache]

| 表现 | 优先检查 | 修复验证 |
| --- | --- | --- |
| 排队长，执行不长 | 并发限额、Scheduler、规则争抢 | 公平性与排队下降 |
| 下载字节多 | 选择器、时间、缓存、Chunk 范围 | 相同结果下扫描降低 |
| CPU 持续高 | Regexp、JSON 解析、聚合 | 等价查询耗时改善 |
| 对象请求延迟高 | 对象服务、网络、限流 | 后端延迟与重试下降 |
| 客户端断开但服务仍忙 | 各层超时与取消传播 | 请求结束后资源释放 |

`limit=100` 限制返回数量，不承诺只扫描 100 条。增加查询 timeout 可能只是让更重的查询运行更久。先找到限制保护的是哪种资源，再讨论是否调整。

### 30.4 最大序列数与内存问题

原始标签基数合理，不代表查询时聚合基数也合理。JSON 解析提取请求 ID、用户 ID，再做未收敛的聚合，可能创建大量结果序列；结构化元数据在查询阶段的维度也要考虑。[LogQL 指标查询][S-logql-metrics][结构化元数据][S-metadata]

常见修复方向是只提取所需字段，在度量计算前保留必要维度，用服务和路由模板分组，而不是以唯一请求属性分组。需要精确事件列表时使用日志查询，不要先把每个事件变成一条指标序列。

OOM 还可能来自过高并发、过大范围、缓存配置和实例资源限制。先确认具体组件和重启原因，不要看到 Loki Pod 重启就调整整个 Chart 的全局内存。

```bash
# 只读；定位实际被 OOM 的容器与上一次运行日志。
: "${POD:?请先设置要检查的具体 Pod 名}"
: "${CONTAINER:?请先设置要检查的具体容器名}"
kubectl -n logging-lab describe pod "$POD"
kubectl -n logging-lab logs "$POD" -c "$CONTAINER" --previous --tail=200
```

注意上一轮日志也可能含样本内容和凭据错误信息，分享前需要脱敏。

### 30.5 `__error__` 说明查询管道发生了什么

正文存在但指标查询报错时，检查解析、数值转换和 `unwrap` 后的 `__error__`。过滤位置要覆盖可能产生错误的步骤；在 `unwrap` 之前过滤一次，不能消除之后转换产生的错误。[LogQL 管道错误][S-logql-errors]

错误样本应该有单独的观察查询，而不是统一当作 0 加入业务统计。第三卷的耗时算例明确把缺失、非法和负数排除；生产应同时统计被排除的比例，否则看起来漂亮的 P95 可能只剩少量成功样本。

修复后做两个验收：正常样本的指标正确，坏样本仍能以明确原因被找到。只让报错消失不够。

### 30.6 保留规则配置了，但空间没有下降

Compactor 需要更新索引、生成删除标记并异步删除对象；查询不可见与物理对象释放存在不同阶段。对象服务开启版本化时，当前版本删除也不一定立刻减少账单。[日志保留][S-retention][日志删除][S-delete]

按顺序检查：

| 检查项 | 为什么重要 |
| --- | --- |
| 实际生效的租户/Stream 规则 | 标签匹配、优先级和默认值可能不同 |
| Compactor 是否运行且可访问存储 | Pod Running 不是任务成功 |
| 标记与工作目录是否持久化 | 重启不能丢弃必要清理状态 |
| 删除权限与后端响应 | 能 Put/Get 不代表能 Delete |
| 删除延迟与任务周期 | 规则变化不是同步清空操作 |
| Bucket 版本与生命周期 | 物理占用可能还包括非当前版本 |

不要把对象 Bucket 的“所有对象 N 天后删除”当作通用替代方案，尤其不能意外删掉仍被使用的索引、规则或删除状态。先确认数据组织和清理责任。

### 30.7 缓存失效后的恢复也有容量成本

缓存可以重建，但重建需要对象下载和执行资源。全量清空缓存可能导致同时回源，把局部查询问题变成集群级负载问题。[缓存][S-cache]

验证缓存时使用有限查询集，保存冷/热统计；不要对生产缓存执行无范围的清空命令。若因安全或正确性需要失效，应规划分批、流量保护和后端余量。

**本章验收：** 选取一条慢查询，提供结果等价的改写，明确扫描量、执行时间或排队中哪一项改善；未实测的结果保持为空，不填猜测数字。

## 第 31 章：Promtail、ELK 与旧 Loki 迁移

### 31.1 Promtail 迁移先盘点行为

Promtail 已结束生命周期，新接入采用 Alloy。迁移的对象不只是 YAML，还包括启动参数、环境变量、发现规则、读取位置、文件权限、多行处理、标签、元数据和目的租户。[Promtail 生命周期][S-promtail][Promtail 迁移到 Alloy][S-promtail-migration]

建议在迁移清单中固定：旧版本与配置哈希、实际 CLI、位置目录、样本格式、源文件轮转、目标标签，以及原有 Dashboard/规则的查询。迁移后可以据此比较，而不是靠肉眼看“有日志”。

| 原有行为 | 转换后需要验证 |
| --- | --- |
| 静态文件采集 | 路径、文件身份、起点、权限 |
| Kubernetes 发现 | 节点限定、过滤与元数据 |
| 多行异常 | 首行、等待、合并顺序 |
| 时间戳转换 | 时区、失败行为、保留原文 |
| 标签重写 | 索引集合与基数变化 |
| 输出认证 | TLS、租户、账号与重试 |

### 31.2 配置转换是起点，不是验收结果

在独立目录保存旧配置副本，使用固定 Alloy 的转换器生成配置和报告：

```bash
alloy convert --source-format=promtail \
  --report=conversion-report.txt \
  --output=config.converted.alloy \
  promtail.yaml
alloy fmt config.converted.alloy
alloy validate config.converted.alloy
```

这里的命令需要真实安装的固定版本 Alloy。本次未运行转换器或原生验证。检查报告中所有无法转换、行为差异和启动参数要求，不用 bypass errors 把失败转换伪装成成功。[Promtail 迁移到 Alloy][S-promtail-migration]

临时使用兼容配置格式运行可以帮助过渡，但正式维护应理解 Alloy 组件依赖。位置迁移也不能靠把旧文件随便复制到某个目录完成；按具体 source 的 `legacy_positions_file` 等兼容行为和新状态目录规则验证，组件 ID 改名也需要评估。

**位置承接实验**：旧采集器读取前 50 条后停止，在同一源文件继续追加 50 条，再启动新采集器，按全部 100 个事件 ID 对账。另测轮转边界和短 Job，不能只测没有变化的文件。

### 31.3 灰度时避免双重处理同一流

双采集有价值，但需要把新旧来源放进可区分的受控输出范围，避免同一流内重复或多写入者互相影响。可以使用独立测试租户，或者明确的有限 `migration_path` 标签；完成灰度后再收敛。

回滚条件应包含数据状态：旧采集器位置是否还在、切换期间源文件是否轮转删除、新采集器是否已经改变正文或时间。回滚二进制并不会自动撤销已经写入的新数据。

对照不仅看数量，还看查询、告警、成本和隐私。新管道可能少了一类错误日志，数量差异不大但诊断能力已经下降。

### 31.4 ELK Kafka 旁路使用独立消费组

已有 Filebeat → Kafka → Logstash → ES 时，可以让 Alloy 使用独立消费组读取同一 Topic，形成受控旁路。不能复用 Logstash 的 group_id，否则两个系统会参与同一个消费组分配，可能变成各自只收到部分分区。[Kafka 采集][S-kafka]

```text
Kafka lab-access
  ├─ group elk-logstash-v1 → Logstash → ES
  └─ group loki-shadow-training-v1 → Alloy → Loki
```

先读取一条脱敏消息，确认它是原始日志、Filebeat 外层 JSON，还是 OTLP 编码。Kafka 通并不意味着消息格式匹配。

下面完整可选配置使用 Kafka 2.8 协议能力，服务端可复用前面 ELK 的 Kafka 2.8.2 实验。`version = "2.8.0"` 是客户端协议配置，不是把服务端补丁版本逐字复制进去；这条新客户端链路仍需本地联合验收。

### 31.5 Filebeat 外层与应用内层分开解析

假设 Kafka 消息结构为：

```json
{
  "@timestamp": "2026-09-24T04:00:00Z",
  "agent": {"type": "filebeat"},
  "message": "{\"ts\":\"2026-09-24T04:00:00Z\",\"event_id\":\"aabbccddeeff:000001\",\"trace_id\":\"4bf92f3577b34da6a3ce929d0e0e4736\",\"status\":200}"
}
```

完整 `alloy/kafka-sidecar.alloy`：

```alloy
// 完整的可选配置。它接收 Filebeat JSON 外层，message 内是第一卷的 JSON 日志。
// 只用于隔离的无认证 Kafka 实验；生产必须补充认证和 TLS。
loki.source.kafka "elk_shadow" {
  brokers                = ["kafka:9092"]
  topics                 = ["lab-access"]
  version                = "2.8.0"
  group_id               = "loki-shadow-training-v1"
  use_incoming_timestamp = false
  labels = {
    cluster      = "lab",
    environment  = "lab",
    namespace    = "training",
    service_name = "order-api",
    job          = "kafka-shadow",
  }
  relabel_rules = loki.relabel.kafka_identity.rules
  forward_to = [loki.process.filebeat_envelope.receiver]
}
loki.relabel "kafka_identity" {
  forward_to = []
  rule {
    source_labels = ["__meta_kafka_topic"]
    target_label = "kafka_topic"
  }
  rule {
    source_labels = ["__meta_kafka_partition"]
    target_label = "kafka_partition"
  }
  rule {
    source_labels = ["__meta_kafka_message_offset"]
    target_label = "kafka_offset"
  }
}
loki.process "filebeat_envelope" {
  stage.json {
    expressions = { inner = "message" }
    drop_malformed = false
  }
  stage.json {
    source = "inner"
    expressions = {
      ts = "ts", event_id = "event_id", trace_id = "trace_id",
    }
    drop_malformed = false
  }
  stage.timestamp {
    source = "ts"
    format = "RFC3339Nano"
    action_on_failure = "skip"
  }
  stage.structured_metadata {
    values = {
      event_id = "", trace_id = "",
      kafka_topic = "", kafka_partition = "", kafka_offset = "",
    }
  }
  stage.label_drop {
    values = ["kafka_topic", "kafka_partition", "kafka_offset"]
  }
  // 不替换正文：保留 Filebeat 外层，便于确认坏消息和恢复过程。
  forward_to = [loki.write.shadow.receiver]
}
loki.write "shadow" {
  endpoint {
    url = "http://loki:3100/loki/api/v1/push"
  }
}
```

该配置保留外层原文，不用 `stage.output` 丢弃外层取证信息。内层解析成功后提取事件时间和少量元数据；失败时保留原文，不能把成功投递率当作解析成功率。

Kafka topic/partition/offset 在进入 process 时暂存于标签，随后转入元数据并删除，避免每个 offset 形成索引流。source 内部标签在转发前会被移除，所以必须在 source 的 relabel_rules 阶段承接，不能等到后面凭空读取。[Kafka 采集][S-kafka][Alloy 1.19.2 Stage 代码][S-process-code]

**查询例子：** 元数据 `event_id` 可直接过滤；需要查询内层 status 时，可先解析外层 message，再把内层作为查询显示行解析。

```logql
{cluster="lab", job="kafka-shadow", service_name="order-api"}
  | json inner="message"
  | __error__=""
  | line_format "{{.inner}}"
  | json code="status"
  | __error__=""
  | code >= 500
```

该查询只是查询时处理，不改变存储正文。旁路 `job=kafka-shadow` 不能直接套用第一卷 `job=access` 的对账选择器；外层保留时对账程序也应明确解析外层再比较内层 ID，不假装两种正文形状相同。

### 31.6 不把消费 Offset 当作 Loki 持久化证明

消费组件把消息交给后续处理与发送，不等于对象存储已完成。具体何时标记、提交 Offset 以及退出时怎样处理，要以固定组件实现和故障实验为准。本专题不为未经联调的 Kafka→Alloy→Loki 链路承诺 exactly-once。[Kafka 采集][S-kafka][loki.write 与指标][S-alloy-write]

旁路验收至少包含正常消费、短断连、发送端被拒、进程重启、分区再分配以及积压恢复。Kafka 保留周期应覆盖验收和回滚窗口；不要为了重跑实验对生产消费组随意 reset offsets。

OTLP JSON/Protobuf 消息应选匹配的 `otelcol.receiver.kafka` 编码和 OTLP 输出路径，不用普通 JSON stage 去解析二进制。两条路线的指标、状态和批处理语义也需要分别确认。[Alloy Kafka 接入路线][S-kafka-paths]

### 31.7 Schema、SSD 与 Chart 升级分批做

迁移存储 Schema、部署拓扑、Chart、采集器和查询规则不宜同时完成。所有维度一起改变，会让失败时无法区分哪个边界出了问题。[存储 Schema][S-schema][部署模式][S-modes][Community Chart 升级][S-chart-upgrade]

推荐安排为可独立验收的阶段：先保存配置和历史 Schema，验证新版本读取旧数据；再按未来 UTC 时间新增 Schema 段；再做受控拓扑或 Chart 迁移；最后收敛采集和查询规则。实际顺序还要符合对应版本升级指南。

SSD 迁往 HA Monolithic 或 Distributed，需要明确共享对象数据、Ring、网络、租户、查询覆盖、Compactor 归属与排空流程。不能把第二卷“新建独立 Release”的教学 values 直接用于覆盖一个已有 SSD 集群。

Chart 模式更名并不代表所有 values 键同步更名。18.13.5 中 `deploymentMode: Monolithic` 与 `singleBinary` 配置块并存，验证最终渲染清单而不是只看 YAML 看起来合理。[Chart 18.13.5 values][S-chart-values]

### 31.8 迁移验收单

| 维度 | 验收证据 |
| --- | --- |
| 输入完整性 | 事件 ID 集合、重复和缺失 |
| 字段语义 | 时间、服务、标签、元数据、原文 |
| 查询等价 | 同问题、同时间的结果对照 |
| 告警行为 | 触发、恢复、NoData 与 Error |
| 生命周期 | 新旧数据都按预期保留和删除 |
| 性能与成本 | 写入、流数量、扫描和存储测量 |
| 安全 | 租户、读写权限、脱敏没有退化 |
| 回滚 | 旧状态、源日志、兼容版本与责任人 |

迁移完成的定义应是“行为达到目标并有证据”，不是“新 Pod 已经 Running”。

## 第 32 章：综合实验、备份恢复与诊断证据

### 32.1 组织一个有限且可重复的综合实验

使用第一卷的 100 条已知样本开始。保存实际生成的 manifest、配置哈希、版本、绝对时间和查询。然后每次只注入一种故障，恢复后先验证完整性，再比较延迟和错误计数。

| 实验 | 操作边界 | 验收问题 |
| --- | --- | --- |
| 正常采集 | 原有最小 Compose | 100 条是否全部出现，10 条 503 是否匹配 |
| Alloy 优雅重启 | 只重启实验采集器 | 读取位置与重复有无变化 |
| 下游短暂不可用 | 停止独立实验 Loki 后恢复 | 重试、延迟、丢弃与对账 |
| 文件轮转 | 仅操作 samples 下合成文件 | 新旧文件边界是否连续 |
| 时间解析失败 | 独立坏样本 | 能否保留原文并解释实际 Timestamp |
| 查询超限 | 低预算只读客户端 | 是否明确报不完整而非假装成功 |
| 租户 Header 伪造 | 专门多租户实验入口 | 网关能否阻止越权 |
| 冷恢复读取 | 独立对象数据副本与实例 | 不依赖旧本地缓存能否读取历史 |

下游中断实验只在无业务数据的 lab 执行；不要用修改生产安全组、填满系统磁盘、停止全部副本等方式照搬。每个故障都应有独立恢复入口，不能靠已损坏的日志通道恢复它自己。

### 32.2 最小实验中的一项可控中断

下面只停止本书 Compose 中的 `loki` 服务，不删除卷。需要另一个终端执行恢复，或在同一串行操作中保留明确恢复步骤；本书不会代替用户在生产执行这些命令。

```bash
# 仅在本书 lab 工作目录执行，确认 docker compose ls 对应 loki-notes。
docker compose stop loki
python3 scripts/generate.py --count 100 --rate 10
# 不删除容器数据卷；恢复后先观察 Loki ready 与 Alloy 输出错误。
docker compose start loki
curl --fail --silent http://127.0.0.1:3100/ready
```

`ready` 只是允许继续检查的前提。后续使用实际清单运行 verify，失败则按照第 29 章检查事件是否仍可从源文件恢复。

停机时长、队列、重试策略和采集器是否同时退出都会影响结果，不预先填写“必定 100 条全部恢复”。若实验暴露损失，记录对应故障边界，并据此决定是否需要额外持久化缓冲。

### 32.3 备份清单不只包含 Bucket

对象存储有副本不等于用户误删后可恢复，复制策略也不是配置和 Schema 的备份。制定恢复方案时要列清数据与控制信息。[存储 Schema][S-schema][日志保留][S-retention]

| 对象 | 保存内容 | 恢复验证 |
| --- | --- | --- |
| Loki 配置 | 完整 Schema 历史、存储前缀、租户与限制 | 新实例能定位原数据 |
| Alloy 配置与必要状态 | 管道、组件 ID、文件路径、位置兼容条件 | 正确承接或有控回放 |
| 对象数据 | Chunk、索引及必要后台状态 | 同一时间点的一致恢复与历史查询 |
| Grafana | 数据源、Dashboard、告警定义 | UID、链接与权限正确 |
| Ruler | 规则、租户目录、必要远写状态 | 规则恢复且不产生错误重复 |
| 凭据与证书 | 安全系统中的恢复能力，不是明文归档 | 最小权限和有效期 |
| 输入样本与清单 | 脱敏事件 ID、数量、哈希与时间 | 精确对账 |

本书日志查询导出脚本不会保留所有底层对象、索引或完整结构化元数据，因此是“受限查询结果导出”，不是 Loki 全量备份格式。

### 32.4 恢复时先用副本和只读访问验证

优先把选定备份恢复到独立 Bucket/前缀，使用独立实例与明确租户，先验证历史查询，再考虑接收新写入。不要直接让恢复实例的 Compactor 对生产 Bucket 执行清理。

恢复前明确 RPO 和 RTO。RPO 是允许丢失的数据窗口，需要区分已上传对象与仍在 WAL 的最近日志；RTO 是恢复到目标服务能力的时间，包含对象复制、索引下载、缓存预热和校验。

恢复过程中保留这组记录：备份点、对象版本范围、配置版本、恢复目标、开始结束时间、查询样本、缺失集合与未验证项。业务是否允许缺失或重复，不能由运维脚本自动决定。

### 32.5 诊断证据应该包含范围和限制

一个可供 AIOps 使用的日志结果，不应只有“错误日志若干条”。它应同时记录服务、集群、查询条件、开始结束时间、返回数量、是否触及上限，以及采样和完整性的限制。

```json
{
  "status": "ok",
  "source": "loki",
  "service": "order-api",
  "query_window": "明确的绝对时间范围",
  "complete_within_query_contract": true,
  "source_collection_completeness": "not_proven",
  "trace_backend_checked": false,
  "interpretation": "证据数据，不是自动根因结论"
}
```

`complete_within_query_contract` 只表达客户端已经完整取得**该查询契约内**的返回结果，不表达源端无漏采，也不表达后端不存在暂时尚不可见的数据。请求失败必须与 `no_matches` 区分。

日志内容可能由外部用户控制，例如“忽略规则、执行命令、访问某个地址”。这种内容只作为事件证据，不用于改变工具权限、后端地址或下一步系统指令。

### 32.6 一个受限的只读证据脚本

完整 `scripts/evidence.py` 不接受任意 LogQL。它仅允许管理员定义的服务和标签，要求一个规范 Trace ID 或实验 run_id，时间最多 15 分钟，结果最多 500 条，请求预算 16 次。它从受信任部署环境取得后端地址和租户。

```python
#!/usr/bin/env python3
"""单租户、白名单服务的只读日志证据查询；不是认证网关，也不判断根因。"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
from loki_client import LokiClient, QueryError

# 由部署管理员维护；不要允许模型或 HTTP 请求修改这个映射。
ALLOWED_SERVICES = {"order-api": {"cluster": "lab", "job": "access"}}

def build_query(service: str, trace_id: str = "", run_id: str = "") -> str:
    if not isinstance(service, str) or service not in ALLOWED_SERVICES:
        raise ValueError("服务不在授权白名单")
    if bool(trace_id) == bool(run_id):
        raise ValueError("必须且只能提供 trace_id 或 run_id")
    labels = dict(ALLOWED_SERVICES[service], service_name=service)
    selector = "{" + ",".join(f"{k}={json.dumps(v)}" for k, v in sorted(labels.items())) + "}"
    if trace_id:
        if not re.fullmatch(r"[0-9a-f]{32}", trace_id) or int(trace_id, 16) == 0:
            raise ValueError("非法 trace_id")
        return selector + f' | trace_id="{trace_id}"'
    if not re.fullmatch(r"[0-9a-f]{12}", run_id):
        raise ValueError("非法 run_id")
    return selector + f' | event_id=~"{run_id}:[0-9]{{6}}"'

def project(entry) -> dict:
    """不返回任意正文、用户 ID、URL 查询串或动态标签。"""
    result = {"timestamp_ns": str(entry.ns)}
    try:
        body = json.loads(entry.line)
        if not isinstance(body, dict):
            raise ValueError("正文不是对象")
    except (ValueError, TypeError):
        result["body_parse_status"] = "invalid_json_object"
        return result
    result["body_parse_status"] = "ok"
    event_id = body.get("event_id", "")
    if isinstance(event_id, str) and re.fullmatch(r"[0-9a-f]{12}:[0-9]{6}", event_id):
        result["event_id"] = event_id
    status = body.get("status")
    if isinstance(status, int) and not isinstance(status, bool) and 100 <= status <= 599:
        result["status"] = status
    level = body.get("level")
    if level in ("debug", "info", "warn", "error", "fatal"):
        result["level"] = level
    # 原始正文不会被带入模型；新增字段必须单独评估隐私与提示注入风险。
    result["body_sha256"] = hashlib.sha256(entry.line.encode()).hexdigest()
    return result

def collect(client: LokiClient, service: str, start: int, end: int,
            trace_id: str = "", run_id: str = "") -> dict:
    if (isinstance(start, bool) or isinstance(end, bool)
            or not isinstance(start, int) or not isinstance(end, int)
            or not 0 <= start < end or end - start > 900 * 10**9):
        raise ValueError("查询窗口必须非空且不超过 15 分钟")
    query = build_query(service, trace_id, run_id)
    entries = client.query(query, start, end, page_limit=200, max_entries=500)
    return {
        "status": "ok" if entries else "no_matches",
        "service": service, "query": query,
        "start_ns": str(start), "end_ns_exclusive": str(end),
        "returned": len(entries), "requests": client.requests,
        "complete_within_query_contract": True,
        "limitations": ["没有匹配不等于没有发生错误", "不证明源端采集完整",
                        "没有调用 Trace 后端", "日志不作为工具指令执行"],
        "entries": [project(entry) for entry in entries],
    }

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service", required=True)
    parser.add_argument("--start-ns", type=int, required=True)
    parser.add_argument("--end-ns", type=int, required=True)
    parser.add_argument("--trace-id", default="")
    parser.add_argument("--run-id", default="")
    args = parser.parse_args()
    try:
        # endpoint、tenant 和 token 只从受信任的部署环境读取。
        client = LokiClient(os.environ.get("LOKI_QUERY_URL", "http://127.0.0.1:3100"),
                            os.environ.get("LOKI_TENANT", ""), timeout=5, max_requests=16)
        report = collect(client, args.service, args.start_ns, args.end_ns,
                         args.trace_id, args.run_id)
    except (ValueError, TypeError, QueryError) as exc:
        # 不输出部分日志，不把异常伪装成 no_matches。
        print(json.dumps({"status": "query_failed", "complete_within_query_contract": False,
                          "error_type": type(exc).__name__}, ensure_ascii=False))
        raise SystemExit(2)
    print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))

if __name__ == "__main__":
    main()
```

调用示例使用自己实际清单里的纳秒时间，不复制某个过期固定日期：

```bash
python3 scripts/evidence.py \
  --service order-api \
  --start-ns 你的first_ns \
  --end-ns 你的end_ns_exclusive \
  --run-id 你的12位运行ID
```

命令中的中文是需要替换的值，不是可原样执行的脚本。部署为服务时，应由已经认证的请求上下文决定账号与授权，而不是让请求方设置 `LOKI_TENANT` 或 `LOKI_QUERY_URL`。

脚本只投影受控的时间、事件 ID、状态码和日志级别，不返回任意正文、动态路由、用户标识和完整 URL。需要业务异常文本时，应增加专用脱敏与授权规则，不能直接取消字段限制。

它使用原生 Loki Client 的 Bearer Token 环境变量；第 27 章 Nginx 示例是 Basic Auth。两者不是现成配套认证方案：将脚本接入 Basic 网关时需另加受控的 Basic 认证适配，或使用组织已有 Bearer 网关，不在 URL 内嵌用户名密码。

### 32.7 判断根因前还缺哪些证据

一条 503 日志可以证明某处报告了失败，但不能独立证明是数据库、网络还是应用逻辑导致。时间相关不等于因果关系，网关记录的上游状态也不覆盖所有内部调用。

把日志与已有 OTel/Jaeger 和 Prometheus 结合时，采用逐步缩小范围的方式：先确认服务和影响区间，再选择匹配请求的 Trace，最后用相关实例指标和变更记录检验假设。Trace 不存在时明确标注采样、未埋点或尚未存储等候选原因。

| 观察 | 可以支持 | 仍需补充 |
| --- | --- | --- |
| 多条访问日志 503 | 请求失败发生在该入口 | 下游具体失败步骤 |
| 同 Trace ID 的错误 Span | 已埋点调用上的错误 | 未采集到的代码与外部依赖 |
| 实例内存持续上升 | 资源趋势异常 | 与请求失败的关联证据 |
| 同期发布变更 | 候选触发因素 | 回滚或对照是否改变症状 |

输出诊断时分开列“已观察事实、推测、反证、待验证”。不要把查询工具返回的 JSON 中某个未经认证的文字字段自动升级为可信根因。

### 32.8 全专题验收与后续维护

四卷的最终成果应包括可读文档、固定版本、配置与样本，以及一份写明执行状态的验收记录。对未运行的实验，保留预期和命令，不把空缺改写成“通过”。

| 验收层次 | 通过意味着什么 | 不意味着什么 |
| --- | --- | --- |
| Markdown 和链接 | 结构完整、导航可用 | 配置已能启动 |
| JSON/YAML/Python 静态检查 | 语法和部分结构正确 | 组件字段与运行语义全部有效 |
| Python 模拟单元测试 | 自编计算/分页/校验逻辑在用例下成立 | Loki/Alloy 引擎已执行 |
| 原生二进制验证 | 固定程序接受配置 | DNS、凭据和对象后端正常 |
| 最小端到端实验 | 当前单机路径完成验收 | 生产高可用与故障恢复成立 |
| 故障和恢复实验 | 明确场景下达到恢复目标 | 所有故障都零丢失 |

配置升级后，重跑样本、规则和对账，而不只是重新渲染 Markdown。记录最新核查日期与固定版本，不让一个写着 latest 的镜像悄悄改变学习结论。

完成本专题后，读者应能够解释“为什么这样采集、为什么这样建模、为什么这样查询、失败时数据在哪里”。这比记住一套只能在某次环境启动的 YAML 更有长期价值。

[返回阅读入口](README.md) · [上一卷：LogQL、Grafana 与日志告警](03-logql-grafana-and-alerting.md)

---

**资料说明：** 文中链接为官方文档或固定版本源码；在线文档可能后续更新，配置应以本书锁定版本和目标环境验收为准。

[S-alloy-write]: https://grafana.com/docs/alloy/latest/reference/components/loki/loki.write/
[S-architecture]: https://grafana.com/docs/loki/latest/get-started/architecture/
[S-auth]: https://grafana.com/docs/loki/latest/operations/authentication/
[S-cache]: https://grafana.com/docs/loki/latest/operations/caching/
[S-canary]: https://grafana.com/docs/loki/latest/operations/loki-canary/
[S-chart-upgrade]: https://grafana.com/docs/loki/latest/setup/upgrade/upgrade-to-community/
[S-chart-values]: https://github.com/grafana-community/helm-charts/blob/loki-18.13.5/charts/loki/values.yaml
[S-components]: https://grafana.com/docs/loki/latest/get-started/components/
[S-delete]: https://grafana.com/docs/loki/latest/operations/storage/logs-deletion/
[S-http]: https://grafana.com/docs/loki/latest/reference/loki-http-api/
[S-ingestion]: https://grafana.com/docs/loki/latest/operations/request-validation-rate-limits/
[S-kafka]: https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.kafka/
[S-kafka-paths]: https://grafana.com/docs/loki/latest/send-data/alloy/examples/alloy-kafka-logs/
[S-labels]: https://grafana.com/docs/loki/latest/get-started/labels/
[S-logql-errors]: https://grafana.com/docs/loki/latest/query/query_reference/#pipeline-errors
[S-logql-metrics]: https://grafana.com/docs/loki/latest/query/metric_queries/
[S-metadata]: https://grafana.com/docs/loki/latest/get-started/labels/structured-metadata/
[S-modes]: https://grafana.com/docs/loki/latest/get-started/deployment-modes/
[S-monitoring]: https://grafana.com/docs/loki/latest/operations/meta-monitoring/
[S-nginx-auth]: https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html
[S-nginx-proxy]: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header
[S-node-textfile]: https://github.com/prometheus/node_exporter#textfile-collector
[S-process]: https://grafana.com/docs/alloy/latest/reference/components/loki/loki.process/
[S-process-code]: https://github.com/grafana/alloy/blob/v1.19.2/internal/component/loki/process/stages/pipeline.go
[S-promtail]: https://grafana.com/docs/loki/latest/send-data/promtail/
[S-promtail-migration]: https://grafana.com/docs/alloy/latest/set-up/migrate/from-promtail/
[S-query-bp]: https://grafana.com/docs/loki/latest/query/bp-query/
[S-query-fairness]: https://grafana.com/docs/loki/latest/operations/query-fairness/
[S-retention]: https://grafana.com/docs/loki/latest/operations/storage/retention/
[S-rings]: https://grafana.com/docs/loki/latest/get-started/hash-rings/
[S-schema]: https://grafana.com/docs/loki/latest/operations/storage/schema/
[S-sharding]: https://grafana.com/docs/loki/latest/operations/automatic-stream-sharding/
[S-source-file]: https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.file/
[S-tenancy]: https://grafana.com/docs/loki/latest/operations/multi-tenancy/
[S-wal]: https://grafana.com/docs/loki/latest/operations/storage/wal/
