# ELK 与 OpenSearch 日志平台学习笔记 · 第二篇：Kafka 缓冲、Logstash 加工与可靠传输

> 教学基线：Elastic Stack 7.17.29、Kafka 2.8.2 ZooKeeper 模式；双后端对照采用 OpenSearch / Dashboards 2.19.6。固定版本用于教学，不表示生产推荐或联合认证。
> 配置与脚本完整保留在四篇 Markdown；对照实验从[文件索引与提取入口](02-pipeline-and-reliability.md#s-11-1)准备。基础实验和对照实验使用独立目录、端口、数据卷及脚本。
> 验证边界：静态与离线逻辑测试不能替代真实组件、TLS、故障、性能与 UI 验收。具体状态见[专题说明](README.md)。

[返回专题](README.md) · [第1篇](01-log-foundations-and-collection.md) · [第3篇](03-search-storage-and-visualization.md) · [第4篇](04-production-operations-and-troubleshooting.md)

| 章节 | 核心主题 |
| --- | --- |
| 7 | Kafka 缓冲模型与教学部署 |
| 8 | 从采集事件到可维护的加工管道 |
| 9 | 消费确认、背压、重放与数据完整性 |
| 10 | 连接两个搜索后端并处理输出失败 |
| 11 | 完整实验的文件组织、执行与证据 |

## 第 7 章 · Kafka 缓冲模型与教学部署

### 7.1 用中断和回放窗口判断是否需要 Kafka
<a id="s-7-1"></a>

#### 用中断窗口决定是否需要 Kafka

假设 ES 维护需要停止写入，而业务必须继续产生日志。
没有 Kafka 时，待发送数据主要停留在采集端文件或其他本地队列；这些资源能否覆盖维护时长，需要逐台评估。
加入 Kafka 后，可以把已接收消息保留在独立缓冲层，并让 Logstash 恢复后继续消费。

这并不意味着 Kafka 自动把整条链路变成“不会丢”。
采集前的文件删除、Kafka 保留到期、错误解析、提前提交、PQ 磁盘丢失和 ES 拒绝都仍需要独立处理。
它提供的是可定义的消息保存与消费边界，而不是无限的可靠性。

| 需求 | Kafka 的价值 | 仍需补充的约束 |
| --- | --- | --- |
| ES 短期维护 | 消费可以暂时落后 | 保留窗口覆盖停机与追赶 |
| 突发日志高峰 | 缓冲瞬时生产高于消费 | 平均处理能力仍需足够 |
| 多个下游 | 独立消费组读取同一 Topic | 各组权限、容量和语义 |
| 规则修正后重放 | 从保留消息重新处理 | 事件 ID、目标索引与去重 |
| 故障对账 | 按分区位置定位原始记录 | 位置与业务事件身份对照 |

**消费确认不是消息删除**

Kafka 中某个消费组提交 Offset 后，消息通常仍按 Topic 保留策略存在。
同一个 Topic 可以被另一消费组重新读取，而不会因为第一组读过就消失。
日志 Topic 的清理主要由保留与清理策略决定，不是“所有消费者都确认后删除”。[Kafka 设计](https://kafka.apache.org/28/design/design/)

**不需要所有场景都上 Kafka**

小规模、可接受较短中断、源文件保留充分的系统，可以先用较短路径。
当缓冲、回放或多消费者的收益超过维护成本时，再引入 Kafka。
笔记学习全链路，不代表所有实际项目都必须部署全部组件。


### 7.2 理解分区、消费组、顺序与端到端交付语义
<a id="s-7-2"></a>

#### Topic、Partition 与 Offset

Topic 是逻辑消息集合，Partition 是实际追加与并行处理的单位。
一条记录属于某个分区，并获得该分区内的 Offset。
不同分区的 Offset 没有全局大小关系，不能比较 `P0:100` 与 `P1:50` 就判断谁更早。

```mermaid
flowchart LR
    B[Filebeat] --> P0[Partition 0: 0,1,2...]
    B --> P1[Partition 1: 0,1,2...]
    B --> P2[Partition 2: 0,1,2...]
    P0 --> C0[Consumer A]
    P1 --> C1[Consumer B]
    P2 --> C1
```

**Offset 不是业务流水号**

消息保留和压缩等行为可能使可读位置范围发生变化。
消费组提交值通常表示下一条待消费的位置，不应把它直接当作最后一个 ES 文档编号。
同一业务事件被重复生产时，可以在 Kafka 中拥有两个不同的 Offset。

| 标识 | 能回答的问题 | 不能替代什么 |
| --- | --- | --- |
| `event.id` | 是否同一条业务/日志事件 | 不自动说明在哪个分区 |
| `topic + partition + offset` | 某个 Kafka 集群中的消息位置 | 不跨集群全局唯一 |
| `group.id` | 哪条处理流水线的消费进度 | 不是消费者实例 ID |
| `client.id` | 日志和监控中识别客户端 | 不是负载均衡组 |
| ES `_index + _id` | 某个索引中的文档身份 | 不能跨 rollover 自动去重 |

追溯 Kafka 位置时必须加来源集群标识。
不同集群中同名 Topic 的相同分区和 Offset，并不是同一条消息。
本书将这些信息保存在 `pipeline.source_cluster` 与 `kafka.*` 字段中。


#### Consumer Group 与处理并行度

同一消费组中的消费者共同分担分区。
不同消费组各自维护进度，通常会各自读取同一份消息。
因此，把 Logstash 的 `group_id` 改成随机值不是扩容，而是建立新的读取视图，可能重复处理整个保留范围。[Kafka Consumer](https://kafka.apache.org/28/configuration/consumer-configs/)

**以三个分区为例**

| 同一组消费者数 | 大致分配 | 结果 |
| --- | --- | --- |
| 1 | 一个消费者处理三个分区 | 有效但并行度有限 |
| 2 | 两个消费者分担三个分区 | 负载取决于分区流量 |
| 3 | 每个消费者一个分区 | 可利用三个分区的并行 |
| 6 | 至少部分消费者空闲 | 不会自动获得六倍吞吐 |

表格是概念示意，实际分配受订阅集合、分配策略和分区负载影响。
Logstash 还存在 Pipeline Worker 与输出批次，并不只有 Kafka 消费线程一个并行参数。
增加消费者可能把瓶颈转移到 ES，也可能因为 Rebalance 产生短暂抖动。

**同组扩容与异组复制**

```text
logs-lab-raw
  ├─ group logs-lab-main-v1      → 主日志索引
  └─ group logs-lab-quality-v1   → 质量统计或测试分析
```

两组各自消费，应该分别规划写入目标。
如果它们都用自动生成 ES ID 写入相同索引，会产生重复文档。
若确实需要双写对照，应使用隔离索引和明确的对账流程。


#### 顺序、重试与端到端语义

Kafka 的有序性主要是在单分区范围讨论。
一条日志从 Filebeat 发送到 ES 的整个过程还包括批处理、重试、多个消费者和 Logstash Worker。
不能只因 Kafka 分区有序，就承诺 Kibana 中所有日志按业务发生时间严格排列。

**有序与时间排序不同**

同一分区中的写入顺序不等于源业务时间顺序。
补采昨天的日志可以在今天的新日志之后进入同一分区。
Kibana 按 `@timestamp` 展示，则又是在按事件时间排序，而不是 Kafka Offset 排序。

**不承诺 exactly-once**

Kafka 事务能解决特定 Kafka 读写场景的原子性，但不能直接覆盖 Filebeat、Logstash 和 Elasticsearch 的全部外部副作用。
稳定文档 ID 可以减少部分重放重复，却仍受跨索引、覆盖语义、事件 ID 质量和失败处理影响。
本书按“允许重试、明确重复风险、保留恢复证据”的方式设计实验。[Kafka 交付语义](https://kafka.apache.org/28/design/design/)

**本章练习**

画出两个独立消费组分别读取三个分区的图。
再解释：新增一个相同 group ID 的 Logstash，与新增一个不同 group ID 的 Logstash，有什么本质差别。
能回答这个问题，才适合继续调整 `consumer_threads` 和实例数量。


#### 分区数与生产、消费并行

分区数应由吞吐、热点 Key、消费并行与维护成本共同决定。
不能只按“有三台 broker，所以建三个分区”，也不能把分区无限增加当作性能调优。
真正瓶颈可能是单条解析成本或 ES 写入能力。

**扩分区前的检查**

| 检查 | 为什么重要 |
| --- | --- |
| 每分区流量是否均衡 | 热点 Key 可能让新增分区无效 |
| 消费者是否已经用满分区 | 消费不足时先修配置 |
| 下游是否还有余量 | 扩并行可能加重 ES 拒绝 |
| 是否依赖 Key 顺序 | 分区数变化可能改变 Key 路由 |
| 元数据与文件开销 | 分区增加会增加维护成本 |

**教学扩分区命令**

```bash
# 仅对已确认的实验 Topic 操作；分区扩容不是容易回滚的开关。
docker compose -p elk-full exec kafka kafka-topics.sh \
  --bootstrap-server kafka:9092 \
  --alter --topic logs-lab-raw --partitions 6
```

Kafka 不提供同等简单的原地缩分区操作。
需要缩减时，通常要建立新 Topic 并设计迁移、切换与顺序边界。
因此建议在首次实验后再测试扩分区，不要为“试一下”直接改变生产 Topic。[Kafka 基础运维](https://kafka.apache.org/28/operations/basic-kafka-operations/)

**Key 的选择**

按 `service.name` 分区可能形成大服务热点。
按随机值分散可改善均衡，但不保留某业务实体的分区亲和。
按请求/订单 ID 分区需要考虑敏感性、键基数与实际顺序要求；没有顺序需求时不必制造状态关联。


### 7.3 部署固定版本并排查监听地址与连接路径
<a id="s-7-3"></a>

以下先搭建基础实验 `elk-lab-full` 的 Kafka/ZooKeeper，再给出双后端对照的对应完整文件。两种环境保持独立的目录与卷；不要同时启动占用相同端口的基础直连实验。完整 Compose 与分阶段启动入口见 [11.2 节](02-pipeline-and-reliability.md#s-11-2)，需先准备所有依赖配置再执行。

#### 基础实验：固定归档包与运行环境

本书选择 Kafka 2.8.2 的 Apache 归档包，避免依赖某个已经移除旧标签的第三方镜像。
归档软件用于历史环境学习，不能因下载仍可用就认为它仍处于安全维护期。
Apache 归档站点也明确提示旧发行物可能不受支持。[Kafka 2.8.2 归档](https://archive.apache.org/dist/kafka/2.8.2/)

`kafka_2.13-2.8.2` 中的 `2.13` 是 Scala 二进制版本部分，不是 Kafka 主版本。
运行 broker 不要求读者先写 Scala，也不需要把 Filebeat 的版本号改成这个字符串。
本实验使用 Java 11 运行 Kafka 发行包中的 broker 和 ZooKeeper 启动脚本。

**建立独立目录**

先停止第一篇占用的端口，但保留其命名卷。

```bash
cd "$HOME/elk-lab-direct"
docker compose -p elk-direct stop
mkdir -p "$HOME/elk-lab-full"/{kafka,filebeat,logstash/config,logstash/pipeline,logstash/scripts,scripts,logs}
cp scripts/generate_logs.py "$HOME/elk-lab-full/scripts/"
cd "$HOME/elk-lab-full"
```

第一篇的日志生成脚本供基础实验共用；双后端对照使用单独的信封生成器。
本篇不会复制第一篇的 Registry，也不默认复制历史日志，以免混淆两套独立实验。
后文所有 `docker compose -p elk-full` 均在 `elk-lab-full` 执行。

**完整文件清单**

```text
elk-lab-full/
├── compose.yml                         # 本章
├── kafka/
│   ├── Dockerfile                      # 本章
│   ├── server.properties               # 本章
│   └── zookeeper.properties            # 本章
├── filebeat/
│   └── filebeat.yml                    # 第 12 章
├── logstash/
│   ├── config/
│   │   ├── logstash.yml                # 第 13 章
│   │   └── pipelines.yml               # 第 13 章
│   ├── pipeline/
│   │   └── main.conf                   # 第 14 章
│   └── scripts/
│       └── normalize_access.rb         # 第 14 章
├── scripts/
│   ├── generate_logs.py                # 第一卷原脚本
│   └── init_es.py                      # 第 16 章
└── logs/
```

按章节准备文件，先启动基础设施，再启动处理与采集。
不要尚未保存配置就执行全部服务启动，否则 Docker 可能把不存在的绑定源路径创建成目录。


#### 基础实验：构建 Kafka 镜像并设置 ZooKeeper

保存下面 Dockerfile 为 `kafka/Dockerfile`。
SHA-512 来自 Apache 2.8.2 归档校验文件，已在本文固定，不是在构建时从另一个未验证地址动态取值。[归档校验值](https://archive.apache.org/dist/kafka/2.8.2/kafka_2.13-2.8.2.tgz.sha512)
基础镜像标签仍可能变动；需要更严格复现时，在本地拉取后记录 digest，并固定组织认可的 Java 基础镜像。

```dockerfile
FROM eclipse-temurin:11-jre-jammy
ARG KAFKA_VERSION=2.8.2
ARG SCALA_VERSION=2.13
ARG KAFKA_SHA512=6b1465e02845a5487dbcfad31bc14f6c6f13458bf682dde1bb1b6886a350810ba7c3773dcea1051e2a62fc5227b149e184959edef138ac25b3b97ddea0fa06af
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl procps \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL --retry 3 \
      "https://archive.apache.org/dist/kafka/${KAFKA_VERSION}/kafka_${SCALA_VERSION}-${KAFKA_VERSION}.tgz" \
      -o /tmp/kafka.tgz \
    && echo "${KAFKA_SHA512}  /tmp/kafka.tgz" | sha512sum -c - \
    && mkdir -p /opt/kafka \
    && tar -xzf /tmp/kafka.tgz --strip-components=1 -C /opt/kafka \
    && rm /tmp/kafka.tgz \
    && groupadd --gid 10001 kafka \
    && useradd --uid 10001 --gid kafka --create-home kafka \
    && mkdir -p /var/lib/kafka /var/lib/zookeeper \
    && chown -R kafka:kafka /opt/kafka /var/lib/kafka /var/lib/zookeeper
ENV PATH="/opt/kafka/bin:${PATH}"
WORKDIR /opt/kafka
USER kafka
CMD ["kafka-server-start.sh", "/etc/kafka/server.properties"]
```

SHA 校验用于检测归档包是否与所核对内容一致。
它不替代组织对旧软件的漏洞扫描、签名与供应链策略。
修改 Kafka 或 Scala 版本时必须重新核对校验值，不得继续使用旧 hash。

**保存 `kafka/zookeeper.properties`**

```properties
tickTime=2000
dataDir=/var/lib/zookeeper
clientPort=2181
maxClientCnxns=60
admin.enableServer=false
autopurge.snapRetainCount=3
autopurge.purgeInterval=1
```

ZooKeeper 的 `dataDir` 必须持久化。
只有一个 ZooKeeper 的实验不能验证 quorum 高可用；其故障可能阻碍 broker 元数据管理与恢复。
本书不把 ZooKeeper 当作日志消息正文的存储位置，消息正文由 Kafka broker 的日志目录保存。

**保存 `kafka/server.properties`**

```properties
broker.id=1
listeners=INTERNAL://0.0.0.0:9092,EXTERNAL://0.0.0.0:19092
advertised.listeners=INTERNAL://kafka:9092,EXTERNAL://127.0.0.1:19092
listener.security.protocol.map=INTERNAL:PLAINTEXT,EXTERNAL:PLAINTEXT
inter.broker.listener.name=INTERNAL
zookeeper.connect=zookeeper:2181
zookeeper.connection.timeout.ms=18000
log.dirs=/var/lib/kafka
num.partitions=3
default.replication.factor=1
min.insync.replicas=1
offsets.topic.replication.factor=1
transaction.state.log.replication.factor=1
transaction.state.log.min.isr=1
group.initial.rebalance.delay.ms=0
auto.create.topics.enable=false
unclean.leader.election.enable=false
log.retention.hours=72
log.segment.bytes=268435456
log.retention.check.interval.ms=300000
message.max.bytes=1048576
replica.fetch.max.bytes=2097152
delete.topic.enable=true
```

这是一份单 broker 实验配置。
`default.replication.factor=1`、`min.insync.replicas=1` 与内部 Topic 副本为 1 都是为了让单机实验能运行，不能作为生产高可用配置。
后续三节点设计应同时修改业务 Topic 与内部 Topic 策略，而不只是把 Compose 复制三份。[Broker 配置](https://kafka.apache.org/28/configuration/broker-configs/)


#### listeners 与 advertised.listeners

`listeners` 决定 broker 在哪里监听，`advertised.listeners` 决定告诉客户端后续连接哪个地址。
客户端先连 bootstrap broker 获取元数据，然后可能连接元数据中的各个 broker 地址。
所以“bootstrap 端口能 telnet”不证明 Kafka 通信已经正常。

**本实验的两组地址**

| 使用者 | 入口 | 元数据返回 | 成立条件 |
| --- | --- | --- | --- |
| Compose 内 Filebeat/Logstash | `kafka:9092` | `kafka:9092` | 同一 Compose 网络 |
| 同一宿主机客户端 | `127.0.0.1:19092` | `127.0.0.1:19092` | 客户端就在该宿主机 |
| 另一台主机 | 不适用 | 回环地址不可用 | 需要单独配置可达地址 |

不要把 `127.0.0.1` 发布给远程客户端，因为它会连回客户端自己。
同样，容器内的 `kafka` 服务名在办公电脑上通常无法解析。
多网络入口要分别设计 Listener，而不是把所有客户端都强行指向同一地址。

```mermaid
sequenceDiagram
    participant C as 客户端
    participant B as Bootstrap Broker
    participant L as 分区 Leader
    C->>B: 获取集群元数据
    B-->>C: 返回 advertised listener 地址
    C->>L: 连接目标分区 Leader
    L-->>C: 生产或消费结果
```

**常见错误定位**

| 现象 | 重点检查 |
| --- | --- |
| 初始连接成功，随后一直超时 | 返回的 broker 地址是否可达 |
| 容器内能用，宿主机不能用 | 是否把内部 DNS 名发布给宿主机 |
| 宿主机能用，另一台机器不能用 | 是否发布了回环地址 |
| 多 broker 中只有部分写入失败 | 每个 broker 的 DNS、防火墙和 Listener |
| TLS 握手失败 | 协议映射、证书 SAN 与信任链 |

认证成功也不能覆盖网络路径问题。
验证时应从实际 Filebeat/Logstash 所在网络执行 Kafka CLI，而不是只在 broker 本机测试。


#### 从单机实验过渡到三节点部署

生产设计至少要把 broker 数量、ZooKeeper quorum、故障域和数据磁盘作为独立问题。
三个容器在同一台物理机上，只能演示进程故障，不具备物理机级容灾。
三副本同时位于同一磁盘或可用区，也不能抵抗相应故障域损坏。

**ZooKeeper 三节点配置形态**

以下为受控网络示意，地址和目录必须替换为实际环境。
每台节点配置相同 server 列表，但 `myid` 不同。

```properties
# zoo.cfg 结构示例，不覆盖本卷单机实验。
tickTime=2000
initLimit=10
syncLimit=5
dataDir=/data/zookeeper
clientPort=2181
server.1=zk-1.example:2888:3888
server.2=zk-2.example:2888:3888
server.3=zk-3.example:2888:3888
autopurge.snapRetainCount=5
autopurge.purgeInterval=1
admin.enableServer=false
```

```bash
# 仅在对应 ZooKeeper 节点的初始化阶段执行，不能重写已有集群身份。
# zk-1 写 1，zk-2 写 2，zk-3 写 3。
printf '%s\n' '1' | sudo tee /data/zookeeper/myid
```

**broker 配置差异**

```properties
# broker-1 的示意；每台 broker.id 与 advertised.listeners 必须唯一。
broker.id=1
listeners=PLAINTEXT://0.0.0.0:9092
advertised.listeners=PLAINTEXT://broker-1.example:9092
zookeeper.connect=zk-1.example:2181,zk-2.example:2181,zk-3.example:2181/kafka-logs
log.dirs=/data/kafka
default.replication.factor=3
min.insync.replicas=2
offsets.topic.replication.factor=3
transaction.state.log.replication.factor=3
transaction.state.log.min.isr=2
unclean.leader.election.enable=false
```

这是拓扑说明，不包含生产安全与容量配置。
ZooKeeper chroot 应在初始化时创建并纳入权限管理；不能临时改 chroot 后以为原集群数据消失。
已有内部 Topic 的副本数不会因为修改 broker 默认值就自动改变，需要单独核查和迁移。[Kafka 运维](https://kafka.apache.org/28/operations/basic-kafka-operations/)

**单节点失效验收**

有控制地停止一台 broker，观察 Leader 迁移、ISR、生产错误和消费恢复。
再验证恢复节点是否追上副本，而不是只看进程重新启动。
测试前必须确保剩余节点容量和副本健康，并明确禁止同时停多个故障域。


#### 对照实验完整文件：`kafka/Dockerfile`

Kafka 2.8.2 / ZooKeeper 教学镜像；[相关章节](02-pipeline-and-reliability.md#s-10-2)。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: kafka/Dockerfile -->
```dockerfile
FROM eclipse-temurin:11.0.26_4-jre-jammy
ARG KAFKA_VERSION=2.8.2
ARG SCALA_VERSION=2.13
ARG KAFKA_SHA512=6b1465e02845a5487dbcfad31bc14f6c6f13458bf682dde1bb1b6886a350810ba7c3773dcea1051e2a62fc5227b149e184959edef138ac25b3b97ddea0fa06af
USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl --fail --location --retry 3 \
       "https://archive.apache.org/dist/kafka/${KAFKA_VERSION}/kafka_${SCALA_VERSION}-${KAFKA_VERSION}.tgz" -o /tmp/kafka.tgz \
    && echo "${KAFKA_SHA512}  /tmp/kafka.tgz" | sha512sum -c - \
    && mkdir -p /opt/kafka /var/lib/kafka \
    && tar -xzf /tmp/kafka.tgz --strip-components=1 -C /opt/kafka \
    && rm /tmp/kafka.tgz \
    && chown -R 10001:10001 /opt/kafka /var/lib/kafka
ENV PATH=/opt/kafka/bin:$PATH
USER 10001:10001
WORKDIR /opt/kafka
```


#### 对照实验完整文件：`kafka/server.properties`

内部/外部地址、保留与单副本边界。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: kafka/server.properties -->
```properties
broker.id=1
listeners=INTERNAL://0.0.0.0:9092,EXTERNAL://0.0.0.0:39092
advertised.listeners=INTERNAL://kafka:9092,EXTERNAL://127.0.0.1:39092
listener.security.protocol.map=INTERNAL:PLAINTEXT,EXTERNAL:PLAINTEXT
inter.broker.listener.name=INTERNAL
zookeeper.connect=zookeeper:2181
log.dirs=/var/lib/kafka/broker
num.partitions=3
default.replication.factor=1
min.insync.replicas=1
offsets.topic.replication.factor=1
transaction.state.log.replication.factor=1
transaction.state.log.min.isr=1
auto.create.topics.enable=false
log.retention.hours=72
message.max.bytes=2097152
```


#### 对照实验完整文件：`kafka/zookeeper.properties`

独立 ZooKeeper 状态。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: kafka/zookeeper.properties -->
```properties
dataDir=/var/lib/kafka/zookeeper
clientPort=2181
maxClientCnxns=0
admin.enableServer=false
```


### 7.4 规划副本、保留窗口、消息大小和容量上限
<a id="s-7-4"></a>

#### 按处理与权限边界划分 Topic

Topic 命名应体现稳定的业务或数据流边界，而不是把每个 Pod、日期或 Trace ID 都做成一个 Topic。
过细拆分会增加元数据、分区与权限管理成本；过粗又会让不同保留与解析策略相互牵连。

| 维度 | 适合分开的情况 | 不宜机械拆分的情况 |
| --- | --- | --- |
| 环境 | 生产与测试权限隔离 | 每个开发者随意创建大量临时 Topic |
| 日志类型 | 访问日志与大型异常日志策略不同 | 只因字段多一个就拆分 |
| 业务组 | 独立权限、SLA 与保留 | 每个实例一个 Topic |
| 数据等级 | 审计与普通调试日志 | 用同一保留策略混装敏感数据 |
| 下游用途 | 原始与派生数据 | 用 Topic 名充当事件 ID |

本书使用 `logs-lab-raw` 作为访问日志原始信封 Topic。
容器通用日志另用 `logs-lab-container`，避免把任意容器文本都塞进访问日志 Parser。
生产中可采用类似 `logs-prod-access-raw` 的受控命名规则，但不要直接让应用字符串生成任意 Topic。

**创建教学 Topic**

```bash
docker compose -p elk-full exec kafka kafka-topics.sh \
  --bootstrap-server kafka:9092 \
  --create --if-not-exists \
  --topic logs-lab-raw \
  --partitions 3 \
  --replication-factor 1 \
  --config cleanup.policy=delete \
  --config retention.ms=259200000 \
  --config min.insync.replicas=1 \
  --config message.timestamp.type=LogAppendTime
```

本实验选择 broker 接收时间作为 Kafka 保留判断的时间来源，以便演示历史日志补采。
业务时间仍保存在消息内容里，不因这个设置消失。
`LogAppendTime` 会改变 Kafka 记录时间戳的语义，应在数据契约里说明，而不是无说明地全局修改。[Topic 配置](https://kafka.apache.org/28/configuration/topic-level-configs/)


#### 副本、ISR、acks 与 min.insync.replicas

副本数表示配置了多少份分区副本，ISR 是当前满足同步条件的副本集合。
`acks=all` 或 Filebeat 的 `required_acks: -1` 关注当前 ISR 的确认，不意味着永远等待所有配置副本。
当 ISR 缩小时，`min.insync.replicas` 可以限制继续接受写入的条件。[Broker 配置](https://kafka.apache.org/28/configuration/broker-configs/)

**典型三副本取舍**

```text
replication.factor = 3
min.insync.replicas = 2
producer acks = all
```

这是一组常见可靠性取舍示意，不是无限故障保证。
一台副本落后时仍可能继续写；当可用 ISR 少于要求时，写入应失败，而不是降低一致性悄悄继续。
还要考虑磁盘、机架/可用区分布、unclean election 与客户端重试。

| 配置 | 主要含义 | 不能保证什么 |
| --- | --- | --- |
| `acks=0` | 不等待 broker 确认 | 不能可靠知道接收结果 |
| `acks=1` | 等 Leader 的确认 | Leader 随即失效的风险仍在 |
| `acks=all` | 等当前 ISR 的确认条件 | 不等于任意副本故障均无损 |
| `min.insync.replicas=2` | 要求最低同步集合规模 | 只对相应生产确认策略发挥作用 |
| 禁用 unclean election | 避免选落后副本带来数据损失 | 可能以不可用换取一致性 |

**检查 Topic 实际状态**

```bash
docker compose -p elk-full exec kafka kafka-topics.sh \
  --bootstrap-server kafka:9092 --describe --topic logs-lab-raw
docker compose -p elk-full exec kafka kafka-configs.sh \
  --bootstrap-server kafka:9092 \
  --entity-type topics --entity-name logs-lab-raw --describe
```

默认 broker 配置与 Topic 覆盖配置必须一起看。
“配置文件写了 3”不能证明既有 Topic 已经有三副本。


#### 保留时间、保留容量与段清理

Kafka 的保留是对日志段及其条件进行管理，不是每条消息都有一个独立精确倒计时。
设置 72 小时不意味着所有消息恰好在第 72 小时那一秒被删除。
同时配置时间与容量边界时，应理解哪个条件可能更早触发清理。[Topic 保留](https://kafka.apache.org/28/configuration/topic-level-configs/)

**需要同时估算三段时间**

```text
需要覆盖的保留窗口
= 最大停机时间
+ 恢复后的追赶时间
+ 检测与操作安全余量
```

若生产速率为 λ，恢复后的消费速率为 μ，并且 μ > λ，则理想化追赶时间为 `积压量 / (μ - λ)`。
如果 μ ≤ λ，系统不会自然追平；单纯增加保留只能推迟风险。
第四篇会给出按字节和副本计算容量的完整算例。

**历史日志与时间戳**

Filebeat 可能把事件初始时间作为 Kafka 记录创建时间。
在 `CreateTime` 语义下，补采很旧的事件可能很快满足过期条件；实际清理仍受分段与清理周期影响。
不能只看“消息今天才写进 Kafka”就判断它必然还能保存完整保留天数。[Filebeat Kafka 输出](https://www.elastic.co/guide/en/beats/filebeat/7.17/kafka-output.html)

本实验给日志 Topic 设置 `LogAppendTime`，使 Kafka 保留更贴近实际接收时间。
源业务时间仍保留在 `app.time`，后续用于 ES 的 `@timestamp`。
生产是否采用此策略要与回放和审计需求一起决定。


#### 消息大小、压缩与异常长日志

日志大小至少要跨采集输入、Filebeat 编码输出、Kafka broker、消费客户端和 ES 请求多层检查。
JSON 转义、元数据和异常堆栈可能让编码后的大小明显大于原始业务文本。
不能只修改 broker 的一个上限就认定长消息问题已解决。

| 层 | 配置或边界 | 检查点 |
| --- | --- | --- |
| Filebeat 输入 | `message_max_bytes` 等 | 是否已经截断 |
| Filebeat Kafka 输出 | `max_message_bytes` | 编码后的事件是否被拒绝或丢弃 |
| Kafka broker/topic | `message.max.bytes` / `max.message.bytes` | 记录批次与协议开销 |
| Kafka 副本 | `replica.fetch.max.bytes` | 副本能否正常拉取 |
| Kafka consumer | `max.partition.fetch.bytes` 等 | 是否能接收目标记录 |
| Logstash/ES | 批次、单文档与 HTTP 限制 | 是否持续重试大请求 |

压缩可以降低网络与磁盘占用，但不会消除所有未压缩大小边界。
同一批消息压缩比高，不代表单条巨大事件就一定可以安全通过。
先治理日志体积，再做有测试数据支撑的上限调整。

**查看消息体积**

```bash
# 只计算教学源记录大小；不能代表最终 Kafka 编码消息大小。
python3 - <<'PY'
from pathlib import Path
sizes = [len(line) for line in Path('logs/access.jsonl').read_bytes().splitlines()]
if sizes:
    print({'count': len(sizes), 'max_bytes': max(sizes),
           'mean_bytes': round(sum(sizes) / len(sizes), 2)})
PY
```

对最终消息大小，应从 Kafka 导出真实信封或使用客户端指标观察。
不要用源文件总大小除行数，替代多行合并后事件大小分布。


#### 原始 Topic 与压缩 Topic 的区别

日志原始流一般需要保留各次事件，而不是只保留每个 Key 的最后状态。
`cleanup.policy=compact` 的目标与普通追加日志保留不同，不能因为“compact 看起来节省空间”就直接用于审计或错误事件。
即使 Key 相同，同一请求的多条事件也可能各自有诊断意义。

| 数据 | 常见清理方向 | 需要确认 |
| --- | --- | --- |
| 原始访问日志 | delete | 时间与容量窗口 |
| 设备最新状态 | compact 或组合策略 | Key 与 tombstone 语义 |
| 处理后的最新画像 | 依业务设计 | 历史事件是否仍需保留 |
| 审计事件 | 按合规策略专门设计 | 不可变性、访问与归档 |

本书主实验显式采用 `delete`。
保留策略不是可随意试错的性能参数；修改前要理解对历史可恢复性的影响。



## 第 8 章 · 从采集事件到可维护的加工管道

### 8.1 配置 Filebeat Kafka 输出并观察事件结构
<a id="s-8-1"></a>

先理解基础实验中 Kafka 消息如何保留应用 JSON 和采集元数据，再看双后端对照的独立 Filebeat 配置。两种样本约定不同：基础实验读取应用记录，对照实验还使用带测试身份的传输信封；选择了哪套样本，就应使用对应的规范化管道。

#### 基础实验：完整 Filebeat 配置与两层 JSON

保存以下文件为 `filebeat/filebeat.yml`。
与第一篇不同，这里不在 Filebeat 解析业务 JSON，而是把 `message` 原样放进 Filebeat 事件信封发送到 Kafka。
后续 Logstash 执行统一解析，便于规则版本管理与回放。

```yaml
filebeat.inputs:
  - type: filestream
    id: lab-json-v1
    paths:
      - /var/log/lab/*.jsonl
    fields:
      environment: lab
      log_kind: nginx.access
    fields_under_root: false

setup.ilm.enabled: false
setup.template.enabled: false

queue.mem:
  events: 4096
  flush.min_events: 512
  flush.timeout: 1s

output.kafka:
  hosts: ["kafka:9092"]
  version: "2.0.0"
  topic: logs-lab-raw
  required_acks: -1
  compression: gzip
  max_message_bytes: 1000000
  partition.round_robin:
    reachable_only: false

http.enabled: true
http.host: 0.0.0.0
http.port: 5066
logging.level: info
logging.metrics.enabled: true
```

`version: "2.0.0"` 是 Filebeat Kafka 客户端协议配置，不是把 broker 降级到 Kafka 2.0。
7.17 文档的 `version` 可选范围与 broker 兼容范围不是同一个概念。
本书固定一个文档支持的协议值，broker 仍是 2.8.2；归档页面列出的兼容上限文字为 2.8.0，不能把本书补丁选择冒称为官方逐补丁认证。[Filebeat Kafka 配置](https://www.elastic.co/guide/en/beats/filebeat/7.17/kafka-output.html)

**为什么不再配置 ndjson parser？**

本篇让 Kafka 保存原始业务文本加来源元数据。
若继续保留第一篇 parser，业务对象会位于 `app`，而主 Logstash 仍尝试从 `message` 解码，数据契约就变了。
两种方式都可以设计，但必须明确选择一套完整路径，不能把两卷片段直接相加。


#### 消息内容、元数据与 Topic 路由

Kafka 中保存的是编码后的 Filebeat 事件，而不是裸业务 JSON。
Logstash Kafka input 的 `codec => json` 先恢复这个信封，之后才处理业务载荷。

```json
{
  "@timestamp": "2026-09-24T02:00:01.000Z",
  "message": "{\"event_id\":\"demo-1\",\"service\":\"orders-api\",\"status\":\"200\"}",
  "agent": {"type": "filebeat", "version": "7.17.29"},
  "fields": {"environment": "lab", "log_kind": "nginx.access"},
  "log": {"file": {"path": "/var/log/lab/access.jsonl"}}
}
```

此对象是形态示意，实际 Filebeat 还可能补充其他字段。
`@metadata` 不是默认持久化业务字段；需要跨 Kafka 保留的信息，应显式复制到常规字段并控制访问范围。
不要依赖一个只在上游处理阶段存在的临时字段决定下游路由。[Logstash 元数据](https://www.elastic.co/guide/en/logstash/7.17/event-dependent-configuration.html)

**受控 Topic 选择片段**

```yaml
# 替换 output.kafka 中的 topic/topics 部分；不是第二个输出。
output.kafka:
  hosts: ["kafka:9092"]
  version: "2.0.0"
  topic: logs-lab-unknown
  topics:
    - topic: logs-lab-raw
      when.equals:
        fields.log_kind: nginx.access
    - topic: logs-lab-container
      when.equals:
        fields.log_kind: kubernetes.container
  required_acks: -1
```

使用前必须创建全部可能的目标 Topic，并配置相应消费者。
默认分支也要可见且有保留策略；不能把所有未匹配日志丢到一个永远没人看的 Topic。
业务日志中的任意字符串不应直接成为 Topic 名。


#### 验证生产、消费与元数据

先检查配置，再启动 Filebeat，最后从 Kafka 实际读取消息。
本步骤可以暂时不启动 Logstash，以便观察缓冲层是否独立工作。

```bash
cd "$HOME/elk-lab-full"
docker compose -p elk-full run --rm --no-deps filebeat \
  filebeat test config -e --strict.perms=false
docker compose -p elk-full run --rm --no-deps filebeat \
  filebeat test output -e --strict.perms=false
docker compose -p elk-full up -d filebeat
python3 scripts/generate_logs.py --count 10 --run-id kafka-first
```

**用独立诊断消费者读取**

```bash
docker compose -p elk-full exec kafka kafka-console-consumer.sh \
  --bootstrap-server kafka:9092 \
  --topic logs-lab-raw \
  --from-beginning \
  --max-messages 10 \
  --timeout-ms 10000 \
  --property print.partition=true \
  --property print.offset=true \
  --property print.timestamp=true
```

不要使用主业务组 `logs-lab-main-v1` 做随意诊断消费，否则可能干扰它的分区分配与进度。
Console Consumer 展示前缀后不再是纯 JSONL；需要后续脚本解析时，应去掉打印前缀或另行保存元数据。
诊断结果里应能看见 `kafka-first`、Filebeat 来源字段与原始业务文本。

**诊断顺序**

若 Topic 无消息，先看 Filebeat 输出错误与 Topic 是否存在。
若生产报元数据超时，检查 advertised listener，而不只是 bootstrap DNS。
若只有某些记录缺失，比较消息大小、输入过滤和源文件保留，避免先归因于 broker 性能。


#### 历史补采、重启与分区分布实验

使用生成器的 `--age-hours` 可以制造历史业务时间，但 Filebeat 信封时间仍取决于采集配置。
本篇没有在 Filebeat 中将业务时间覆盖到根 `@timestamp`，因此该实验同时说明“消息体历史时间”与“Kafka 记录时间”是不同字段。
需要演示旧 CreateTime 风险时，应在独立 Topic 和独立配置中显式改变事件时间，不能误把这一步当成自动发生。

```bash
python3 scripts/generate_logs.py \
  --count 20 --run-id old-business-time --age-hours 240
```

Logstash 后续会把业务时间解析为 10 天前，因此 Kibana 默认最近 15 分钟可能查不到。
这不代表补采失败；应按 run ID 查询并扩大业务时间范围。
如果关心“今天刚入库的历史事件”，使用 `event.ingested` 辅助查询。

**分区与排序实验**

连续生成一批带 `sequence` 的记录，从各分区读取后比较。
观察单分区顺序、跨分区合并顺序与业务序号之间的差别。
不要通过在 Kibana 中按时间排序来“证明 Kafka 全局有序”。

**本章完成标准**

能从 Kafka 取出带正确来源元数据的 Filebeat 信封。
能解释 `version`、broker 版本、Kafka Record Timestamp 与源业务时间四个概念。
能说明改变消费组或输入状态会如何影响补采和重复。


#### 对照实验完整文件：`filebeat/filebeat.yml`

实验信封与 Java 多行采集。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: filebeat/filebeat.yml -->
```yaml
filebeat.inputs:
  - type: filestream
    id: exp-envelope-v2
    paths: ["/var/log/exp/*.jsonl"]
    fields:
      environment: lab
      log_kind: envelope
  - type: filestream
    id: exp-java-v2
    paths: ["/var/log/exp/*.java.log"]
    parsers:
      - multiline:
          type: pattern
          pattern: '^\d{4}-\d{2}-\d{2}T'
          negate: true
          match: after
          timeout: 5s
          max_lines: 500
    fields:
      environment: lab
      log_kind: java.application
output.kafka:
  hosts: ["kafka:9092"]
  version: "2.0.0"
  topic: exp-logs-raw
  required_acks: -1
  compression: gzip
  max_message_bytes: 2000000
  codec.json:
    pretty: false
logging.level: info
```


### 8.2 组织 Logstash Pipeline、插件与配置加载
<a id="s-8-2"></a>

Pipeline 配置决定事件的执行边界，插件清单决定配置能否被实际加载。以下先解释基础实验的进程、字段引用和发布方式，再给出对照实验的固定插件镜像及两套 Pipeline 清单。一个主程序版本号不能代替实际插件列表。

#### Input、Codec、Filter 与 Output

Logstash 事件经历输入、处理和输出，但 Codec 常附着在输入或输出两端。
Kafka input 的 JSON Codec 处理消息信封，Filter 处理字段语义，ES output 处理写入请求。
不要把“配置里出现 JSON”都当成同一个解析步骤。

```mermaid
flowchart LR
    K[Kafka bytes] --> C[Input JSON Codec]
    C --> Q[内存或持久队列]
    Q --> J[业务 JSON Filter]
    J --> N[字段规范化]
    N --> D[Date Filter]
    D --> R[正常或隔离路由]
    R --> O[ES Output]
```

这里的队列位置对故障语义很重要：输入把事件交入队列，后续 Filter/Output 才处理。
因此 Kafka 消费提交与 ES 最终成功之间可能还有很长路径。
[相关章节](02-pipeline-and-reliability.md#s-9-1)会进一步拆开这个边界。[Logstash 队列](https://www.elastic.co/guide/en/logstash/7.17/persistent-queues.html)

**文件结构与作用范围**

| 文件 | 作用 | 常见误区 |
| --- | --- | --- |
| `logstash.yml` | 节点级设置、API、队列默认值 | 把 Pipeline DSL 写进 YAML |
| `pipelines.yml` | 声明多个独立 Pipeline | 使用 `-f` 后还以为它一定生效 |
| `main.conf` | Input/Filter/Output DSL | 误当成 YAML |
| `normalize_access.rb` | 可测试的复杂字段治理 | 多线程共享可变状态 |
| `jvm.options` / 环境变量 | JVM 设置 | 只增 heap 不留系统内存 |

一个目录内的多个 `.conf` 文件可能被合并成同一 Pipeline，而不是自动得到多个隔离管道。
需要隔离时，应在 `pipelines.yml` 明确声明各自的 `path.config`。[多 Pipeline](https://www.elastic.co/guide/en/logstash/7.17/multiple-pipelines.html)


#### 基础实验：保存节点设置与 Pipeline 清单

保存为 `logstash/config/logstash.yml`。

```yaml
http.host: 0.0.0.0
http.port: 9600
xpack.monitoring.enabled: false
pipeline.ecs_compatibility: disabled
config.reload.automatic: false
queue.type: persisted
queue.max_bytes: 512mb
queue.checkpoint.writes: 1024
dead_letter_queue.enable: true
path.data: /usr/share/logstash/data
```

API 监听容器内部所有接口，但宿主映射仅在回环地址。
PQ 与 DLQ 共用本实例的持久化数据卷，但它们是不同用途的队列。
`queue.checkpoint.writes: 1024` 不是逐事件强制落盘承诺；调整为 1 会改变耐久性与写盘成本，必须测量。[Logstash 设置](https://www.elastic.co/guide/en/logstash/7.17/logstash-settings-file.html)

保存为 `logstash/config/pipelines.yml`。

```yaml
- pipeline.id: logs-main
  path.config: /usr/share/logstash/pipeline/main.conf
  pipeline.workers: 2
  pipeline.batch.size: 125
  pipeline.batch.delay: 50
```

两个 Worker 是教学起点，并不意味着最佳性能。
增加 Worker 后，Ruby Filter 必须避免写共享状态；多事件聚合插件也可能有自己的顺序约束。
主实验不依赖跨事件状态，因此不需要为了日志解析而强制单 Worker。

**核对插件版本**

```bash
docker compose -p elk-full run --rm --no-deps \
  --entrypoint /usr/share/logstash/bin/logstash-plugin \
  logstash list --verbose
```

重点核对 Kafka Integration、Elasticsearch Output、JSON、Date、Ruby 与 Grok。
本书依据发布锁文件，不假设本地镜像没有被二次安装或升级插件。
生产镜像应记录插件清单；只记录 `Logstash 7.17` 不足以复现全部选项。[发布锁文件](https://github.com/elastic/logstash/blob/v7.17.29/Gemfile.jruby-2.5.lock.release)


#### 字段引用、条件与临时元数据

Logstash 的嵌套字段用 `[service][name]` 表达。
`[service.name]` 是另一个字段名语义，不能与 JSON 对象路径混淆。
格式化字符串也必须引用实际存在的字段，否则可能把未展开的占位符写进目标名称。

```logstash
filter {
  if [service][environment] == "lab" {
    mutate {
      replace => { "[@metadata][target_alias]" => "logs-lab" }
    }
  } else {
    mutate {
      replace => { "[@metadata][target_alias]" => "logs-lab-quarantine" }
    }
  }
}
```

这是概念片段，主实验使用[相关章节](02-pipeline-and-reliability.md#s-8-4)完整路由。
`@metadata` 很适合保存目标别名、临时时间字段和调试信息，因为它不默认进入输出事件。
要持久化 Kafka 位置，则必须复制到普通 `kafka.*` 字段。[事件字段访问](https://www.elastic.co/guide/en/logstash/7.17/event-dependent-configuration.html)

**条件中的类型**

```logstash
# 已完成整数规范化后才能可靠做数值比较。
if [http][response][status_code] >= 500 {
  mutate { add_tag => ["http_server_error"] }
}
```

未验证类型前直接比较，可能遇到字符串、数组或对象。
`if [field]` 也不能区分所有缺失、null 与 false 情况；需要精确类型和默认策略时，用受控脚本或明确分支。
不要为了“配置简短”把关键业务语义隐藏在隐式转换里。


#### 配置检查、前台调试与隔离输入

Logstash `-t` 可以发现配置语法和部分插件初始化问题。
Ruby 脚本内置测试也会在 Pipeline 创建时执行，但成功不代表 Kafka 与 ES 的真实路径已经验证。
Grok 的模式语法合法，也不代表能正确匹配你的实际日志。

```bash
# 先保存第 14 章全部文件，再执行。
docker compose -p elk-full run --rm --no-deps logstash \
  -t --path.settings /usr/share/logstash/config
```

若需要单独验证 Filter，可建立不连接 Kafka/ES 的测试 Pipeline。
不要把生产输出保留在测试配置里，否则“测试一行”也可能写入真实索引。

```logstash
# filters-only.conf 结构示例，需要插入待测 filter，不是主配置。
input {
  stdin { codec => json_lines }
}
filter {
  mutate { add_field => { "[pipeline][test_mode]" => "true" } }
}
output {
  stdout { codec => rubydebug { metadata => true } }
}
```

命令中的 `-f` 会选择指定配置路径，应明确它与 `pipelines.yml` 的关系。
调试输出可能包含完整原始日志，生产日志不得无差别打印到多人可读的容器控制台。


#### 配置发布与多 Pipeline 隔离

一条 Pipeline 中的多个 output 并不天然互相隔离。
一个慢输出可能拖慢事件完成，进而让队列和上游产生积压。
把审计归档、主检索和实验输出都串在一起前，应明确故障传播路径。

```yaml
# 多 Pipeline 结构示意；每条配置和数据源需独立定义。
- pipeline.id: access-main
  path.config: /etc/logstash/pipelines/access.conf
  pipeline.workers: 2
  queue.type: persisted
- pipeline.id: container-main
  path.config: /etc/logstash/pipelines/container.conf
  pipeline.workers: 2
  queue.type: persisted
```

多个 Pipeline 仍共享同一进程、JVM、CPU 与磁盘。
需要更强故障隔离时，应进一步分实例、队列或消费组，而不是仅修改 ID。
每条 PQ 和 DLQ 的目录也要按 Pipeline ID 识别，不能误读另一条管道的失败数据。

**发布前的四项检查**

检查输入范围是否变化，字段契约是否变化，目标资源是否已准备，回滚后是否还能处理已进入队列的数据。
若新旧规则字段类型不同，简单回滚配置未必能把旧索引 Mapping 改回去。
规则、模板和查询消费者应作为一个受控变更整体管理。


#### 对照实验完整文件：`logstash/Dockerfile`

仅 OpenSearch 分支的输出插件依赖。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: logstash/Dockerfile -->
```dockerfile
FROM docker.elastic.co/logstash/logstash:7.17.29
# 只构建 self-hosted OpenSearch 分支；原 ES 分支仍使用未改的官方镜像。
# 2.0.3 依赖 AWS SDK v3，与原镜像若干 AWS v2 插件冲突。
# 本实验不使用 AWS 输入/输出；逐个移除，不额外引入预发布 integration-aws。
RUN set -eu; \
    for plugin in logstash-input-s3 logstash-input-sqs logstash-output-s3 \
                  logstash-output-sns logstash-output-sqs logstash-output-cloudwatch; do \
      bin/logstash-plugin remove "$plugin"; \
    done; \
    bin/logstash-plugin install --version 2.0.3 logstash-output-opensearch; \
    bin/logstash-plugin list --verbose > /usr/share/logstash/exp-plugins.lock; \
    grep -E '^logstash-output-opensearch \(2\.0\.3(-java)?\)' /usr/share/logstash/exp-plugins.lock; \
    grep -E '^logstash-integration-kafka \(10\.12\.2(-java)?\)' /usr/share/logstash/exp-plugins.lock; \
    grep -E '^logstash-filter-ruby \(3\.1\.8(-java)?\)' /usr/share/logstash/exp-plugins.lock
```


#### 对照实验完整文件：`logstash/logstash.yml`

持久队列、ECS 默认行为和诊断 API。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: logstash/logstash.yml -->
```yaml
http.host: 0.0.0.0
xpack.monitoring.enabled: false
pipeline.ecs_compatibility: disabled
queue.type: persisted
queue.max_bytes: 512mb
queue.checkpoint.writes: 1024
dead_letter_queue.enable: true
config.reload.automatic: false
```


#### 对照实验完整文件：`logstash/pipelines-es.yml`

ES Pipeline 引用。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: logstash/pipelines-es.yml -->
```yaml
- pipeline.id: exp-es
  path.config: /exp/es.conf
  pipeline.workers: 1
  pipeline.batch.size: 125
```


#### 对照实验完整文件：`logstash/pipelines-os.yml`

OS Pipeline 引用。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: logstash/pipelines-os.yml -->
```yaml
- pipeline.id: exp-os
  path.config: /exp/os.conf
  pipeline.workers: 1
  pipeline.batch.size: 125
```


### 8.3 用 JSON、Dissect 和 Grok 解析日志
<a id="s-8-3"></a>

#### 选择 JSON、Dissect 或 Grok

优先根据源格式选择解析方法，而不是所有日志都使用同一条巨大 Grok。
结构化 JSON 适合稳定字段载荷，Dissect 适合固定分隔文本，Grok 适合有模式变化的文本。
复杂规则可以组合，但要知道每一步输入与输出是什么。

| 方式 | 适用输入 | 优势 | 边界 |
| --- | --- | --- | --- |
| JSON | 一条事件一个 JSON 对象 | 字段直接表达结构 | 仍需验证类型与业务范围 |
| Dissect | 分隔符位置稳定 | 结构直观、少正则 | 格式变化时容易失配 |
| Grok | 半结构化文本 | 模式表达灵活 | 正则成本与误匹配 |
| Ruby | 明确而复杂的治理规则 | 类型控制、单元测试 | 维护与并发责任增加 |
| ES Ingest | 写入侧统一处理 | 贴近索引入口 | 与 Logstash 的责任划分 |

本书主线使用 JSON + 小型 Ruby 规范化，不是要求所有项目都写 Ruby。
简单重命名、转换和时间解析仍由成熟 Filter 完成；需要精确区分空值、非法值和原始字符串时，脚本更容易测试。

**一条固定文本的 Dissect 示例**

```logstash
filter {
  dissect {
    mapping => {
      "message" => "%{[@metadata][local_time]} %{[log][level]} %{[service][name]} %{[http][response][status_code]} %{[message_body]}"
    }
    tag_on_failure => ["_dissect_access_failure"]
  }
  mutate {
    convert => { "[http][response][status_code]" => "integer" }
  }
}
```

这个例子要求时间是没有空格的单个字段。
若原日志时间写成 `2026-09-24 10:00:00`，就必须重新定义模式，不能只把示例复制过去。


#### Grok 规则与 Nginx 文本兼容

不能立即修改源日志格式时，Grok 可以帮助处理既有文本。
应先根据真实样本限定字段，而不是使用过多宽泛匹配把任何内容都当成“成功解析”。
解析成功后仍要做数值和业务范围校验。

```logstash
# 独立文本日志示例：假设格式为 method uri status request_time。
filter {
  grok {
    id => "parse_simple_access_text"
    match => {
      "message" => "^%{WORD:[app][method]} %{NOTSPACE:[app][uri]} %{INT:[app][status]} %{NUMBER:[app][request_time]}$"
    }
    tag_on_failure => ["_grok_access_failure"]
    timeout_millis => 1000
  }
}
```

这个样本没有包含带空格的 User-Agent、请求体或复杂 quoted 字段，因此规则也不假装处理这些内容。
完整 Nginx combined 格式需要对应模式和转义样本；可改源端时优先评估 JSON 日志。

**正则性能与超时**

先固定行首行尾和稳定分隔，再考虑可变部分。
避免一串贪婪字段互相回溯，尤其是大异常日志或不匹配输入。
超时是保护边界，不是正常解析逻辑；应该统计超时和失败，而不是无限增大 timeout。

**解析失败不要直接 drop**

可以保留原始事件并写入受控隔离索引，也可以转发到专门的错误 Topic。
重要的是隔离路径自身有容量、权限、保留和告警。
若所有失败都被丢弃，仪表盘看起来很干净，实际覆盖率却可能正在下降。


### 8.4 规范化字段并将失败事件送入可追查的隔离路径
<a id="s-8-4"></a>

本节保留两种用途明确的实现：`normalize_access.rb` 服务于基础访问日志，`normalize.rb` 服务于双后端共同样本。后者不是前者的无损升级，不覆盖全部上游业务字段。完整基础 Pipeline 的模板初始化见 [14.1 节](03-search-storage-and-visualization.md#s-14-1)；先初始化，再启动处理。

#### 基础实验：完整主 Pipeline

保存以下文件为 `logstash/pipeline/main.conf`。
正常与隔离事件都送入 ES，但使用不同别名；两条路径的资源由[相关章节](02-pipeline-and-reliability.md#s-11-2)初始化脚本创建。
隔离索引是本书设计的业务质量路径，不等于 Logstash DLQ。

```logstash
input {
  kafka {
    id => "kafka_raw"
    bootstrap_servers => "kafka:9092"
    topics => ["logs-lab-raw"]
    group_id => "logs-lab-main-v1"
    client_id => "logs-lab-logstash"
    consumer_threads => 1
    auto_offset_reset => "earliest"
    enable_auto_commit => false
    decorate_events => "basic"
    codec => json
  }
}
filter {
  mutate {
    id => "preserve_original"
    copy => {
      "message" => "[event][original]"
      "@timestamp" => "[event][created]"
    }
  }
  json {
    id => "decode_business_json"
    source => "message"
    target => "app"
    tag_on_failure => ["_app_json_failure"]
  }
  ruby {
    id => "normalize_access_v1"
    path => "/usr/share/logstash/scripts/normalize_access.rb"
    script_params => { "source_cluster" => "lab-kafka" }
    tag_on_exception => "_normalizer_exception"
  }
  if [@metadata][event_time] {
    date {
      id => "parse_business_time"
      match => ["[@metadata][event_time]", "ISO8601"]
      target => "@timestamp"
      tag_on_failure => ["_event_time_failure"]
    }
  }
  if "_app_json_failure" in [tags] or "_jsonparsefailure" in [tags] or "_field_validation_failure" in [tags] or "_event_time_failure" in [tags] or "_normalizer_exception" in [tags] {
    mutate { replace => { "[@metadata][target_alias]" => "logs-lab-quarantine" } }
  } else {
    mutate { replace => { "[@metadata][target_alias]" => "logs-lab" } }
  }
}
output {
  elasticsearch {
    id => "es_logs"
    hosts => ["http://elasticsearch:9200"]
    index => "%{[@metadata][target_alias]}"
    document_id => "%{[event][id]}"
    action => "index"
    manage_template => false
    ilm_enabled => false
    pipeline => "logs-lab-ingested"
  }
}
```

**处理顺序的含义**

先保存 `event.original` 和采集时间，再解析业务 JSON。
规范化脚本将受控字段放到明确类型的位置，并保留错误原因。
Date Filter 只处理已经确认是字符串的时间候选；时间格式失败会导致隔离路由。
最后，目标别名由平台规则决定，而不是接受源日志自报任意索引名。

`ilm_enabled => false` 表示本示例不让 Logstash output 自动创建和管理 ILM 资源。
它**不等于关闭 Elasticsearch 的 ILM 功能**：[生命周期治理](03-search-storage-and-visualization.md#s-14-3)会创建策略，再把策略绑定到索引。
模板、策略与写入账号职责分开，有助于最小权限管理。[ES Output](https://www.elastic.co/guide/en/logstash/7.17/plugins-outputs-elasticsearch.html)

**为什么保留 Kafka 位置？**

业务事件 ID 帮助对账，Kafka 位置帮助找回处理前的记录。
两者不同；只有位置而没有来源集群会产生歧义，只有事件 ID 而没有原始来源则可能难以定位坏记录。
主脚本把两种信息都保留下来，但不承诺跨集群或跨索引的全局 exactly-once。


#### 基础实验：完整字段规范化脚本

保存为 `logstash/scripts/normalize_access.rb`。
脚本仅针对本书定义的访问日志契约，不把所有 Java 与容器文本硬解释为 HTTP 请求。
生产扩展时为不同 `log_kind` 建立明确分支或独立 Pipeline。

```ruby
# Logstash ruby filter 脚本。仅使用事件局部变量；实例配置在 register 中冻结。
require "bigdecimal"
require "digest"

def register(params)
  @source_cluster = params.fetch("source_cluster", "lab-kafka").to_s.freeze
end

def scalar_text(value)
  return value.strip if value.is_a?(String)
  return value.to_s if value.is_a?(Numeric)
  nil
end

def absent(value)
  value.nil? || (value.is_a?(String) && ["", "-"].include?(value.strip))
end

def filter(event)
  errors = []
  app = event.get("app")
  unless app.is_a?(Hash)
    errors << "app:not_object"
    event.remove("app")
    app = {}
  end

  # 防止重放含旧规范字段时沿用上次计算结果。
  ["[http]", "[url]", "[trace]", "[nginx]", "[service]", "[labels]",
   "[pipeline]", "[event][duration]", "[event][outcome]"].each do |path|
    event.remove(path)
  end
  event.set("[pipeline][version]", "access-v1")
  event.set("[pipeline][source_cluster]", @source_cluster)

  service = app["service"]
  if service.is_a?(String) && service.match?(/\A[a-zA-Z0-9._-]{1,128}\z/)
    event.set("[service][name]", service)
  else
    event.set("[service][name]", "unknown")
    errors << "service:invalid"
  end
  env = event.get("[fields][environment]")
  if ["lab", "test", "staging", "prod"].include?(env)
    event.set("[service][environment]", env)
  else
    event.set("[service][environment]", "unknown")
    errors << "environment:invalid"
  end
  event.set("[event][dataset]", "nginx.access")

  level = app["level"]
  event.set("[log][level]", level.is_a?(String) ? level.downcase : "unknown")
  event.set("message", app["message"]) if app["message"].is_a?(String)

  # source event ID 优先；缺失时使用来源 Kafka 位置，不生成随机 ID。
  source_id = app["event_id"]
  if source_id.is_a?(String) && source_id.bytesize.between?(1, 256)
    event.set("[event][id]", source_id)
  else
    topic = event.get("[@metadata][kafka][topic]")
    partition = event.get("[@metadata][kafka][partition]")
    offset = event.get("[@metadata][kafka][offset]")
    if !topic.nil? && !partition.nil? && !offset.nil?
      event.set("[event][id]", [@source_cluster, topic, partition, offset].join(":"))
    else
      raw = event.get("[event][original]") || event.get("message") || ""
      event.set("[event][id]", "fallback:" + Digest::SHA256.hexdigest(raw.to_s))
      errors << "event_id:missing_kafka_position"
    end
  end
  ["topic", "partition", "offset"].each do |key|
    value = event.get("[@metadata][kafka][#{key}]")
    event.set("[kafka][#{key}]", value) unless value.nil?
  end

  time_value = app["time"]
  if time_value.is_a?(String) && !time_value.strip.empty?
    event.set("[@metadata][event_time]", time_value)
  else
    event.remove("[@metadata][event_time]")
    errors << "time:missing_or_invalid_type"
  end

  value = app["status"]
  unless absent(value)
    text = scalar_text(value)
    if text && text.match?(/\A\d{3}\z/) && text.to_i.between?(100, 599)
      code = text.to_i
      event.set("[http][response][status_code]", code)
      event.set("[event][outcome]", code >= 500 ? "failure" : (code >= 400 ? "unknown" : "success"))
    else
      errors << "status:invalid"
    end
  end

  value = app["request_time"]
  unless absent(value)
    text = scalar_text(value)
    begin
      raise ArgumentError unless text && text.length <= 64 && text.match?(/\A\+?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\z/)
      seconds = BigDecimal(text)
      raise ArgumentError unless seconds.finite? && seconds >= 0 && seconds <= BigDecimal("9223372036.854775807")
      nanos = (seconds * 1_000_000_000).round(0).to_i
      raise ArgumentError if nanos > 9_223_372_036_854_775_807
      event.set("[event][duration]", nanos)
    rescue ArgumentError, TypeError
      errors << "request_time:invalid"
    end
  end

  if app["method"].is_a?(String)
    event.set("[http][request][method]", app["method"].upcase)
  end
  if app["uri"].is_a?(String)
    event.set("[url][original]", app["uri"])
  end
  ["upstream_status", "upstream_response_time"].each do |key|
    value = app[key]
    next if absent(value)
    text = scalar_text(value)
    if text
      event.set("[nginx][#{key}_raw]", text)
    else
      errors << "#{key}:invalid_type"
    end
  end

  trace = app["trace_id"]
  unless absent(trace)
    normalized = trace.is_a?(String) ? trace.downcase : ""
    if normalized.match?(/\A[0-9a-f]{32}\z/) && normalized != "0" * 32
      event.set("[trace][id]", normalized)
    else
      errors << "trace_id:invalid"
    end
  end
  ["run_id", "scenario"].each do |key|
    event.set("[labels][#{key}]", app[key]) if app[key].is_a?(String)
  end
  if app["sequence"].is_a?(Integer) && app["sequence"] >= 0
    event.set("[labels][sequence]", app["sequence"])
  end
  unless errors.empty?
    event.set("[pipeline][errors]", errors)
    event.tag("_field_validation_failure")
  end
  [event]
end

test "valid numeric strings preserve units" do
  parameters { {"source_cluster" => "test-kafka"} }
  in_event do
    {"fields" => {"environment" => "lab"}, "app" => {
      "service" => "orders-api", "event_id" => "test-1",
      "time" => "2026-09-24T02:00:00Z", "status" => "504",
      "request_time" => "1.250", "upstream_status" => "502, 504"}}
  end
  expect("typed status and nanoseconds") do |events|
    e = events.first
    events.size == 1 && e.get("[http][response][status_code]") == 504 &&
      e.get("[event][duration]") == 1_250_000_000 &&
      e.get("[nginx][upstream_status_raw]") == "502, 504"
  end
end

test "missing optional metrics remain absent" do
  in_event do
    {"fields" => {"environment" => "lab"}, "app" => {
      "service" => "orders-api", "event_id" => "test-2",
      "time" => "2026-09-24T02:00:00Z", "status" => "-", "request_time" => ""}}
  end
  expect("no invented zero") do |events|
    e = events.first
    e.get("[event][duration]").nil? && e.get("[http][response][status_code]").nil?
  end
end

test "invalid status is marked and not indexed as number" do
  in_event do
    {"fields" => {"environment" => "lab"}, "app" => {
      "service" => "orders-api", "event_id" => "test-3",
      "time" => "2026-09-24T02:00:00Z", "status" => "not-a-number"}}
  end
  expect("quarantine condition available") do |events|
    e = events.first
    e.get("[http][response][status_code]").nil? &&
      e.get("tags").include?("_field_validation_failure")
  end
end

test "negative duration is rejected" do
  in_event do
    {"fields" => {"environment" => "lab"}, "app" => {
      "service" => "orders-api", "event_id" => "test-4",
      "time" => "2026-09-24T02:00:00Z", "request_time" => "-0.1"}}
  end
  expect("no negative metric") do |events|
    events.first.get("[event][duration]").nil? &&
      events.first.get("[pipeline][errors]").include?("request_time:invalid")
  end
end
```

**设计取舍**

状态码缺失与非法状态码分开处理：缺失可以保留为无该指标的事件，非法值会被标记。
耗时用十进制计算转为纳秒，并检查负数与 long 范围，避免无穷大或异常指数进入数值字段。
上游状态和耗时保留原始序列，不把 `502, 504` 当作一个整数。

`event.outcome` 的教学规则是：5xx 为 failure，4xx 为 unknown，其他合法状态为 success。
它只是此访问日志处理规则，不代表订单、支付或库存业务的最终成功定义。
仪表盘应按明确的 HTTP 条件计算 5xx 比例，不用含义不清的 outcome 代替业务口径。

**缺少事件 ID 时的边界**

有 Kafka 元数据时，用“来源集群 + Topic + Partition + Offset”作为回放稳定标识。
这只在相同 Kafka 位置重放时稳定；把消息复制进新 Topic 后，位置已经不同。
当连 Kafka 位置也没有时，脚本使用原始内容 hash 并标记错误，这只是隔离兜底，可能合并内容完全相同但本来独立的事件。

业务上要求精确对账时，必须由源端生成合适的事件 ID，不能依赖兜底 hash 代替身份设计。
同一 ID 在同一索引内使用 `index` 动作会覆盖旧文档；跨 rollover 索引又可能同时存在。
去重边界与恢复对账见 [9.3 节](02-pipeline-and-reliability.md#s-9-3)、[9.4 节](02-pipeline-and-reliability.md#s-9-4)。

**测试不是装饰**

脚本末尾包含合法数值、可选缺失、非法状态和负耗时四个断言。
Logstash Ruby Filter 的测试会在 Pipeline 创建时执行，断言失败可阻止启动。[Ruby Filter 测试](https://github.com/logstash-plugins/logstash-filter-ruby/blob/v3.1.8/docs/index.asciidoc)
还应补充超大耗时、错误 Trace ID、非法服务名、JSON 数组和时间类型错误等样本。


#### 时间解析、日期格式与失败路由

时间解析必须保留原始文本，并明确是否带时区。
主样本使用 ISO8601，不带时区的存量 Nginx/Java 日志需要在 Parser 中显式指定来源时区。
不要依赖 Logstash 宿主机默认时区恰好与你的应用一致。

```logstash
# 存量本地时间的独立示例，不与主 Pipeline 的 date 重复叠加。
filter {
  date {
    match => ["[app][local_time]", "yyyy-MM-dd HH:mm:ss.SSS"]
    timezone => "Asia/Shanghai"
    target => "@timestamp"
    tag_on_failure => ["_local_time_failure"]
  }
}
```

有显式 `+08:00` 的时间不应再手工加八小时。
解析失败时保留采集时间供隔离事件检索，同时用错误标签表示业务时间尚不可信。
不能用采集时间悄悄覆盖错误业务时间后，把记录算进正常事件统计。

**年份格式与索引日期**

示例使用 `yyyy` 表达公历年。
不要无意识混用 week-year 相关格式；跨年附近最容易暴露时间格式错误。
按 `%{+yyyy.MM.dd}` 生成索引名时使用的是 Logstash `@timestamp` 的 UTC 时间线，不是 Kibana 浏览器本地日期。[字段格式化](https://www.elastic.co/guide/en/logstash/7.17/event-dependent-configuration.html)

**必须测的日期样本**

| 样本 | 要检查 |
| --- | --- |
| 带 `Z` | UTC 正确 |
| 带 `+08:00` | 与等价 UTC 值一致 |
| 本地时间无时区 | 明确来源时区 |
| 非法日期 | 失败标签与隔离 |
| 跨年与闰日 | 年份与日期规则 |
| 历史补采 | 业务时间与入库时间分离 |


#### 字段变更与兼容发布

新增字段通常比原地改变字段类型容易，但也需要模板与查询配合。
把 `request_time` 从秒改为毫秒而不改字段名，可能让仪表盘在没有报错的情况下放大 1000 倍。
这种静默语义错误往往比明显的 Mapping 拒绝更难发现。

**变更应包含五份证据**

| 证据 | 内容 |
| --- | --- |
| 输入契约 | 支持哪些源格式和版本 |
| 转换规则 | 原始字段到规范字段的映射 |
| 测试集合 | 正常、缺失、非法、边界样本 |
| 存储结构 | 模板与新索引的 Mapping |
| 查询对照 | 仪表盘和 API 的旧新结果 |

规则版本记录在 `pipeline.version`。
对历史消息回放到新规则时，应使用隔离索引，先比较字段与数量，再决定是否替换查询入口。
不要把回放直接写进生产热索引作为第一次验收。


#### 对照实验完整文件：`logstash/normalize.rb`

事件规范化、非法内容隔离与稳定 ID。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: logstash/normalize.rb -->
```ruby
# 纯函数负责转换；Logstash filter 只负责调用与路由。可用 MRI 做逻辑测试。
require 'json'
require 'time'
require 'bigdecimal'
require 'digest'

def utc_time(value)
  raise ArgumentError, 'timezone required' unless value.is_a?(String) && value.match?(/(?:Z|[+-]\d\d:\d\d)\z/)
  Time.iso8601(value).utc.iso8601(3)
end

def normalize_record(raw, fields, kafka, collected)
  errors = []
  env = fields.is_a?(Hash) ? fields['environment'] : nil
  doc = {'service'=>{'name'=>'orders-api', 'environment'=>'lab'},
         'event'=>{'created'=>collected, 'original'=>raw},
         '@timestamp'=>collected, 'message'=>raw,
         'labels'=>{}, 'pipeline'=>{'version'=>'exp-v2'}, 'kafka'=>kafka || {}}
  errors << 'environment:invalid' unless env == 'lab'
  app = {}
  begin
    if fields.is_a?(Hash) && fields['log_kind'] == 'java.application'
      first, *stack = raw.split("\n")
      m = /\A(\S+) (INFO|ERROR) run=([a-zA-Z0-9_-]+) event=([a-zA-Z0-9_:-]+) (.*)\z/.match(first)
      raise ArgumentError, 'java header' unless m
      app = {'time'=>m[1], 'level'=>m[2], 'run_id'=>m[3], 'event_id'=>m[4],
             'message'=>m[5] + (stack.empty? ? '' : "\n" + stack.join("\n")),
             'service'=>'orders-api', 'kind'=>'java', 'scenario'=>'multiline',
             'error_type'=>stack.first.to_s.split(':').first}
    else
      envelope = JSON.parse(raw)
      raise ArgumentError, 'envelope object' unless envelope.is_a?(Hash)
      ['run_id','event_id'].each do |key|
        value = envelope[key]
        raise ArgumentError, "bad #{key}" unless value.is_a?(String) && value.bytesize.between?(1, 128) && value.match?(/\A[a-zA-Z0-9_:-]+\z/)
      end
      doc['labels']['run_id'] = envelope['run_id']
      doc['event']['id'] = envelope['event_id']
      doc['labels']['scenario'] = envelope['scenario'].to_s
      payload = envelope['payload']
      raise ArgumentError, 'payload not string' unless payload.is_a?(String)
      doc['event']['original'] = payload
      app = JSON.parse(payload)
      raise ArgumentError, 'payload not object' unless app.is_a?(Hash)
      if app['event_id'] != envelope['event_id'] || app['run_id'] != envelope['run_id']
        errors << 'identity:mismatch'
      end
    end
  rescue JSON::ParserError, ArgumentError, TypeError => e
    errors << 'json_or_envelope:invalid'
    app = {} unless app.is_a?(Hash)
  end
  doc['app'] = app
  if app['service'] && app['service'] != 'orders-api'
    errors << 'service:invalid'
  end
  unless doc['event']['id']
    if app['event_id'].is_a?(String)
      doc['event']['id'] = app['event_id']
      doc['labels']['run_id'] = app['run_id']
    elsif kafka && %w[topic partition offset].all? { |k| !kafka[k].nil? }
      doc['event']['id'] = "exp-kafka:#{kafka['topic']}:#{kafka['partition']}:#{kafka['offset']}"
      doc['labels']['run_id'] = 'unattributed'
    else
      doc['event']['id'] = 'unattributed:' + Digest::SHA256.hexdigest(raw)
      doc['labels']['run_id'] = 'unattributed'
      errors << 'identity:no_transport_position'
    end
  end
  doc['labels']['scenario'] ||= app['scenario'].to_s
  doc['message'] = app['message'] if app['message'].is_a?(String)
  doc['log'] = {'level'=>app['level'].is_a?(String) ? app['level'].downcase : 'unknown'}
  kind = app['kind'] || 'access'
  datasets = {'access'=>'nginx.access','java'=>'java.application','heartbeat'=>'business.heartbeat','probe'=>'pipeline.probe'}
  doc['event']['dataset'] = datasets.fetch(kind, 'unknown')
  errors << 'kind:invalid' unless datasets.key?(kind)
  begin
    doc['@timestamp'] = utc_time(app['time'])
  rescue ArgumentError, TypeError
    errors << 'time:invalid'
  end
  if kind == 'access'
    status = app['status']
    if status.nil? || status == '' || status == '-'
      # 可选观测缺失，不能发明为 0。
    elsif status.to_s.match?(/\A\d{3}\z/) && status.to_i.between?(100,599)
      doc['http'] = {'response'=>{'status_code'=>status.to_i}}
      doc['event']['outcome'] = status.to_i >= 500 ? 'failure' : 'success'
    else
      errors << 'status:invalid'
    end
    duration = app['request_time']
    unless duration.nil? || duration == '' || duration == '-'
      begin
        text = duration.is_a?(String) || duration.is_a?(Numeric) ? duration.to_s : ''
        raise ArgumentError unless text.length <= 64 && text.match?(/\A\+?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\z/)
        number = BigDecimal(text)
        raise ArgumentError unless number.finite? && number >= 0 && number <= BigDecimal('9223372036.854775807')
        nanos = (number * 1_000_000_000).round.to_i
        raise ArgumentError if nanos > 9_223_372_036_854_775_807
        doc['event']['duration'] = nanos
      rescue ArgumentError, TypeError
        errors << 'duration:invalid'
      end
    end
    uri = app['uri']
    if uri.is_a?(String)
      doc['url'] = {'original'=>uri}
      # 教学服务只有这一条动态路由；未知路由不猜测归并。
      path = uri.split('?', 2).first || ''
      doc['route'] = path.match?(/\A\/orders\/\d+\z/) ? '/orders/{id}' : path
    end
  end
  if app['trace_id']
    trace = app['trace_id'].to_s.downcase
    if trace.match?(/\A[0-9a-f]{32}\z/) && trace != '0' * 32
      doc['trace'] = {'id'=>trace}
    else
      errors << 'trace:invalid'
    end
  end
  doc['error'] = {'type'=>app['error_type']} if app['error_type'].is_a?(String) && !app['error_type'].empty?
  doc['pipeline']['errors'] = errors.uniq
  doc['pipeline']['route'] = errors.empty? ? 'normal' : 'quarantine'
  doc
end

def filter(event)
  fields = event.get('fields') || {}
  meta = event.get('[@metadata][kafka]') || {}
  kafka = %w[topic partition offset].each_with_object({}) { |k,h| h[k]=meta[k] if meta.key?(k) }
  collected = event.get('@timestamp').to_s
  doc = normalize_record(event.get('message').to_s, fields, kafka, collected)
  event.to_hash.keys.each { |k| event.remove(k) unless k == '@metadata' }
  doc.each do |k,v|
    # Logstash 的 @timestamp 必须使用 Timestamp，不把普通字符串交给 Event#set。
    value = k == '@timestamp' ? LogStash::Timestamp.new(Time.iso8601(v)) : v
    event.set(k, value)
  end
  event.set('[@metadata][target_alias]', doc['pipeline']['route'] == 'normal' ? 'exp-logs' : 'exp-quarantine')
  [event]
end
```


### 8.5 将 Nginx、Java 和容器日志接入各自的数据集
<a id="s-8-5"></a>

本节将第一篇的来源识别落到基础完整链路 `elk-lab-full`。Nginx 访问日志、Java 堆栈和容器文本采用各自的数据集、Topic 或 Pipeline；先验证来源与字段，再验证存储路由，不能让所有来源共同满足 HTTP 状态码契约。

#### Nginx JSON 访问日志

Nginx 的 `log_format` 支持 `escape=json`，用于对变量内容进行 JSON 字符串转义。
它不自动替你判断某个字段应是数值还是字符串。[Nginx 日志模块](https://nginx.org/en/docs/http/ngx_http_log_module.html)

以下片段放在 `http` 上下文，字段与第二篇的访问解析器对应。
耗时和上游字段保留为字符串，交给有校验的处理步骤转换；这样 `-` 不会直接破坏 JSON 结构。

```nginx
log_format elk_json escape=json
  '{'
    '"time":"$time_iso8601",'
    '"event_id":"$request_id",'
    '"service":"orders-api",'
    '"environment":"lab",'
    '"level":"INFO",'
    '"message":"access request",'
    '"method":"$request_method",'
    '"uri":"$request_uri",'
    '"status":"$status",'
    '"request_time":"$request_time",'
    '"upstream_status":"$upstream_status",'
    '"upstream_response_time":"$upstream_response_time"'
  '}';

access_log /var/log/nginx/access.jsonl elk_json;
```

`$request_id` 是请求标识，不应直接当成 OpenTelemetry Trace ID。
需要 Trace 关联时，应从实际信任的追踪模块或应用接入方式取得规范化字段；不要盲目信任客户端随意传入的头。

**配置上线前检查**

```bash
nginx -t

# 只检查尾部一条样本是否是合法 JSON。
tail -n 1 /var/log/nginx/access.jsonl | python3 -m json.tool
```

还要发送包含引号、反斜杠、空值和上游失败的测试请求，确认转义与解析结果。
仅测试正常 200 不能覆盖日志格式的异常分支。

**接入主实验**

在自己的 Nginx 环境中，把日志路径以只读方式提供给 Filebeat。
Filebeat 主输入继续读原始行，Kafka 保存完整事件；Logstash 负责解析 `message` 中的 JSON。
不要同时在 Filebeat 解码到根字段、又在 Logstash 假设 message 仍是完整原始 JSON。

**Ingress-Nginx 的差异**

Ingress Controller 的日志格式需要通过对应 Controller 版本的配置机制修改，不是登录容器改临时 nginx.conf。
变量名称、ConfigMap 键和内置格式应以部署版本文档为准。
本书不固定一个未验证的 Ingress Controller 版本，也不把上述原生 Nginx 配置直接当作通用 ConfigMap。


#### Java 多行日志：先合并，再解析

多行异常应尽量在靠近文件的采集端合并，避免不同来源经过集中处理后交叉混合。[Filebeat 多行](https://www.elastic.co/guide/en/beats/filebeat/7.17/multiline-examples.html)

示例输入：

```text
2026-09-24 10:00:00.123 ERROR [http-nio-8080-exec-1] com.example.OrderService - inventory timeout
java.net.SocketTimeoutException: Read timed out
    at com.example.InventoryClient.call(InventoryClient.java:42)
    at com.example.OrderService.submit(OrderService.java:81)
2026-09-24 10:00:01.123 INFO [http-nio-8080-exec-2] com.example.OrderService - order accepted
```

这是固定格式、固定历史时间的样本，不代表所有 Java 日志都采用这个布局。
Logback/Log4j 输出格式变化时必须更新多行与解析测试。

**Filebeat 增量输入**

把以下条目合并进已有 `filebeat.inputs` 列表，而不是创建第二个同名顶层键。
路径挂载沿用第二篇 `/var/log/lab`，样本文件名可为 `application.java.log`。

```yaml
- type: filestream
  id: lab-java-v1
  enabled: true
  paths:
    - /var/log/lab/*.java.log
  parsers:
    - multiline:
        type: pattern
        pattern: '^\d{4}-\d{2}-\d{2} '
        negate: true
        match: after
        max_lines: 500
        timeout: 5s
  fields:
    environment: lab
    log_kind: java.application
```

在现有 Kafka output 下增加路由规则，默认 Topic 继续为 `logs-lab-raw`：

```yaml
# 增量：合并进 output.kafka 对象。
topics:
  - topic: logs-lab-java
    when.equals:
      fields.log_kind: java.application
```

**创建专用 Topic**

```bash
docker compose -p elk-full exec kafka kafka-topics.sh \
  --bootstrap-server kafka:9092 \
  --create --if-not-exists --topic logs-lab-java \
  --partitions 3 --replication-factor 1 \
  --config retention.ms=259200000 \
  --config message.timestamp.type=LogAppendTime
```

多行合并增加单条消息大小，必须重新检查 Filebeat、Kafka 和消费者限制。
`max_lines` 是保护上限，不是保证完整保留任意长度堆栈；超出上限的行为应通过样本实验确认并监控。


#### Java 专用 Pipeline 与存储

以下作为独立 `logstash/pipeline/java.conf`。
它不调用访问日志的 Ruby 规范化脚本，不把 ERROR 等级直接映射成 HTTP 500。
Kafka 输入选项沿用已核对的 10.12.2 插件语法。[Kafka input](https://www.elastic.co/guide/en/logstash/7.17/plugins-inputs-kafka.html)

```logstash
input {
  kafka {
    id => "kafka_java"
    bootstrap_servers => "kafka:9092"
    topics => ["logs-lab-java"]
    group_id => "logs-lab-java-v1"
    client_id => "logs-lab-java-consumer"
    consumer_threads => 1
    enable_auto_commit => false
    auto_offset_reset => "earliest"
    decorate_events => "basic"
    codec => json
  }
}
filter {
  mutate {
    copy => {
      "message" => "[event][original]"
      "@timestamp" => "[event][created]"
    }
    add_field => {
      "[event][dataset]" => "java.application"
      "[service][name]" => "orders-api"
      "[service][environment]" => "lab"
      "[pipeline][version]" => "java-v1"
      "[event][id]" => "lab-kafka:%{[@metadata][kafka][topic]}:%{[@metadata][kafka][partition]}:%{[@metadata][kafka][offset]}"
    }
  }
  grok {
    match => {
      "message" => "(?m)^%{TIMESTAMP_ISO8601:[@metadata][event_time]} %{LOGLEVEL:[log][level]} \[%{DATA:[java][thread]}\] %{JAVACLASS:[java][logger]} - %{GREEDYDATA:[java][body]}"
    }
    tag_on_failure => ["_java_grok_failure"]
  }
  if [@metadata][event_time] {
    date {
      match => ["[@metadata][event_time]", "yyyy-MM-dd HH:mm:ss.SSS", "ISO8601"]
      timezone => "Asia/Shanghai"
      target => "@timestamp"
      tag_on_failure => ["_java_time_failure"]
    }
  }
  mutate { lowercase => ["[log][level]"] }
  if "_java_grok_failure" in [tags] or "_java_time_failure" in [tags] or "_jsonparsefailure" in [tags] {
    mutate {
      add_field => {
        "[@metadata][target_alias]" => "logs-lab-quarantine"
        "[pipeline][errors]" => "java_parse_failure"
      }
    }
  } else {
    mutate { add_field => { "[@metadata][target_alias]" => "logs-lab-java" } }
  }
}
output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "%{[@metadata][target_alias]}"
    document_id => "%{[event][id]}"
    manage_template => false
    ilm_enabled => false
    pipeline => "logs-lab-ingested"
  }
}
```

这个教学格式使用无时区的应用时间，并显式解释为 Asia/Shanghai。
应用采用带偏移 ISO8601 时，应保持原偏移，不要再次人为平移八小时。
`service.name` 在此固定为单个实验服务；多服务接入必须从经过信任的采集配置或元数据确定，不能把这个常量推广到所有应用。

**增加 Pipeline 条目**

在已有 `pipelines.yml` 列表中添加：

```yaml
- pipeline.id: logs-java
  path.config: /usr/share/logstash/pipeline/java.conf
  pipeline.workers: 1
  pipeline.batch.size: 125
```

因为已有 Pipeline 明确指向 `main.conf`，新增文件不会自动混入主 Pipeline。
如果你的配置使用通配符读取所有 `.conf`，要先调整边界，否则多个 Input/Output 可能被组合进同一管道。

**为 Java 日志创建独立模板和别名**

前提：已执行[相关章节](03-search-storage-and-visualization.md#s-14-3)，`logs-lab-retention` Policy 已存在。

```bash
curl -fsS -X PUT 'http://127.0.0.1:9200/_index_template/logs-lab-java-template' \
  -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{
  "index_patterns": ["logs-lab-java-*"],
  "priority": 520,
  "composed_of": ["logs-lab-fields"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "logs-lab-retention",
      "index.lifecycle.rollover_alias": "logs-lab-java"
    },
    "mappings": {
      "properties": {
        "java": {
          "properties": {
            "thread": {"type": "keyword"},
            "logger": {"type": "keyword"},
            "body": {"type": "text"}
          }
        }
      }
    }
  }
}
JSON

curl -fsS -X PUT 'http://127.0.0.1:9200/logs-lab-java-000001' \
  -H 'Content-Type: application/json' \
  -d '{"aliases":{"logs-lab-java":{"is_write_index":true}}}'
```

先完成模板和初始索引，再启动新增 Pipeline。
Java 解析失败进入隔离索引时，`java` 内部字段未显式索引也不影响保留原始消息；检索主要使用错误原因和 `event.original` 复查。

**Java 验收**

应产生两个事件而不是五行事件：一个 ERROR，包含完整堆栈；一个 INFO。
确认 `java.logger`、`java.thread`、时间和原始消息。
随后故意修改首行格式，验证失败记录可查，而不是被静默丢弃。


#### containerd 日志的专用路径

[相关章节](01-log-foundations-and-collection.md#s-5-1)提供了 Kubernetes DaemonSet、RBAC、宿主路径与元数据配置。
生产容器日志接入时，应单独选择 `logs-lab-container` Topic 和通用容器 Pipeline，不能直接进入访问日志解析器。[Kubernetes 采集](https://www.elastic.co/guide/en/beats/filebeat/7.17/running-on-kubernetes.html)

如果 Kafka 在集群外，Kubernetes 节点必须能访问 broker 的发布地址。
第二篇 `EXTERNAL://127.0.0.1:19092` 只服务本机实验，不能让另一台节点或 Pod 通过它连接。
修改 Kafka 的外部发布地址属于网络拓扑变更，需要同时检查每个 broker 的地址、认证和防火墙。

**创建专用 Topic**

```bash
docker compose -p elk-full exec kafka kafka-topics.sh \
  --bootstrap-server kafka:9092 \
  --create --if-not-exists --topic logs-lab-container \
  --partitions 3 --replication-factor 1 \
  --config retention.ms=259200000 \
  --config message.timestamp.type=LogAppendTime
```

DaemonSet 输出目标改为该 Topic，保留容器 Input 和 Kubernetes 元数据处理器。
容器 Input 的 `@timestamp` 已来自 CRI 日志时间，不能不加说明就称它为 Filebeat 实际采集时间。

**通用容器 Pipeline**

下面保存为独立 `container.conf`，并在 `pipelines.yml` 增加对应条目。
它只保留 CRI 事件和元数据，不猜测普通文本的业务类型。

```logstash
input {
  kafka {
    bootstrap_servers => "kafka:9092"
    topics => ["logs-lab-container"]
    group_id => "logs-lab-container-v1"
    client_id => "logs-lab-container-consumer"
    enable_auto_commit => false
    auto_offset_reset => "earliest"
    decorate_events => "basic"
    codec => json
  }
}
filter {
  mutate {
    copy => { "message" => "[event][original]" }
    add_field => {
      "[event][dataset]" => "kubernetes.container"
      "[event][id]" => "lab-kafka:%{[@metadata][kafka][topic]}:%{[@metadata][kafka][partition]}:%{[@metadata][kafka][offset]}"
      "[pipeline][version]" => "container-v1"
    }
  }
  if "_jsonparsefailure" in [tags] {
    mutate {
      add_field => {
        "[@metadata][target_alias]" => "logs-lab-quarantine"
        "[pipeline][errors]" => "container_envelope_json_failure"
      }
    }
  } else {
    mutate { add_field => { "[@metadata][target_alias]" => "logs-lab-container" } }
  }
}
output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "%{[@metadata][target_alias]}"
    document_id => "%{[event][id]}"
    manage_template => false
    ilm_enabled => false
    pipeline => "logs-lab-ingested"
  }
}
```

容器内部消息可以是 JSON，但它与 Filebeat 外层事件 JSON 是两层不同格式。
需要解析应用 JSON 时，应在明确的数据集分支中解码到目标对象，并保留原始值。
不能仅因为消息以 `{` 开头就假设它是所有业务都兼容的对象。

**容器索引模板**

复用公共字段组件，单独设置模式和 Rollover alias：

```bash
curl -fsS -X PUT 'http://127.0.0.1:9200/_index_template/logs-lab-container-template' \
  -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{
  "index_patterns": ["logs-lab-container-*"],
  "priority": 520,
  "composed_of": ["logs-lab-fields"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "logs-lab-retention",
      "index.lifecycle.rollover_alias": "logs-lab-container"
    }
  }
}
JSON

curl -fsS -X PUT 'http://127.0.0.1:9200/logs-lab-container-000001' \
  -H 'Content-Type: application/json' \
  -d '{"aliases":{"logs-lab-container":{"is_write_index":true}}}'
```

`logs-lab-container-*` 与 `logs-lab-java-*` 不重叠，因此同为 520 不构成彼此冲突。
它们都高于宽泛的正常模板，避免误用 `logs-lab` 的生命周期别名。


#### 多数据集验收与升级顺序

先上线模板和索引，再上线处理规则，最后扩大采集范围。
一个应用或一个节点作为灰度对象，验证格式、吞吐、权限及回滚后再扩展。

| 场景 | 输入控制 | 必须验证 |
| --- | --- | --- |
| Nginx | 200、504、无上游、多上游 | 合法 JSON、类型与耗时单位 |
| Java | 正常行、异常堆栈、坏首行 | 合并边界、时间与失败旁路 |
| containerd | stdout、stderr、Pod 重建 | 文件路径、容器身份、重复与漏采 |
| 混合接入 | 不同 Topic 同时有流量 | 不串 Pipeline，不混 Dashboard 分母 |

不要同时更换 Filebeat 输入类型、Topic、Logstash 字段规则和 ES 模板后再排查差异。
一次变更一层，保留前后样本，才能知道问题由哪一项引入。



## 第 9 章 · 消费确认、背压、重放与数据完整性

### 9.1 区分 Kafka Offset、Logstash PQ 与后端写入确认
<a id="s-9-1"></a>

#### 区分三种“已经处理”

Kafka 客户端取到消息、Logstash 把事件放入队列、ES 成功索引，是三个不同阶段。
监控里某个计数增长，不应跨越这些边界解释。
尤其是 Kafka Lag 归零，只说明相应消费进度，不代表所有文档已经可查询。

```mermaid
sequenceDiagram
    participant K as Kafka
    participant I as Logstash Input
    participant Q as PQ/内存队列
    participant F as Filter
    participant E as Elasticsearch
    I->>K: poll
    K-->>I: records
    I->>Q: 写入事件
    I->>K: 提交消费进度（按插件策略）
    Q->>F: 交给 Worker
    F->>E: Bulk
    E-->>F: 每条文档结果
```

主实验设置 `enable_auto_commit => false`。
Kafka Integration 文档说明，这种模式在把读取数据写入 Logstash 内存或持久队列时提交，而不是等待 ES 成功。[Kafka Input](https://www.elastic.co/guide/en/logstash/7.17/plugins-inputs-kafka.html)
如果队列是内存，进程崩溃后已提交但尚未输出的事件可能失去本地副本。

**“已经在 Kafka”也要看保留**

即使已提交事件的原消息仍在 Kafka，自动恢复也未必从它重新开始。
通常需要人工或专门任务按记录的安全范围重放。
当保留窗口已经过期时，就只能依赖其他副本或源端归档，而不是凭 Offset 变回已删除的消息。


#### PQ 能保护哪些状态？

PQ 将事件保存在 Logstash 本地磁盘队列，缓解进程重启与短期下游不可用风险。
它不在多实例之间自动复制，扩容也不会把旧实例的积压自动搬走。
磁盘或节点永久丢失时，仍需要 Kafka 保留、源文件或归档作为恢复来源。[Persistent Queue](https://www.elastic.co/guide/en/logstash/7.17/persistent-queues.html)

**写入、检查点与确认**

PQ 的写入和检查点设置影响持久性与性能。
`queue.checkpoint.writes: 1` 可以提高每次写入后的检查点频率，但也可能显著增加同步写成本。
不能在没有吞吐和磁盘延迟测试的情况下把它宣传成无成本的“可靠开关”。

```yaml
# 耐久性实验的增量，先记录原值，再对比吞吐与恢复。
queue.type: persisted
queue.max_bytes: 1gb
queue.checkpoint.writes: 1
```

这一配置仍不是节点级副本或备份。
队列所在卷的持久性、文件系统、磁盘剩余空间与节点故障域都必须纳入设计。

**多实例的队列归属**

```text
Logstash A → A 的 PQ → ES
Logstash B → B 的 PQ → ES
```

B 不会因为 A 下线就自动读 A 的本地 PQ。
缩容时应先排空并确认输出，或者保留实例数据卷等待恢复。
直接删除 StatefulSet/PVC 或容器命名卷会改变恢复条件。


#### 逐段列出确认边界

日志链路没有因为使用了 Kafka 就自动获得端到端 Exactly-once。
每段确认由不同组件控制，失败恢复还受队列、磁盘、重试、保留和幂等策略影响。[Filebeat 投递机制](https://www.elastic.co/guide/en/beats/filebeat/7.17/how-filebeat-works.html)、[Logstash PQ](https://www.elastic.co/guide/en/logstash/7.17/persistent-queues.html)

| 边界 | 本书配置下的含义 | 仍可能发生的情况 |
| --- | --- | --- |
| 应用写文件 | 记录进入应用日志路径 | 尚未被采集、进程缓冲未刷新 |
| Filebeat 读取 | 事件进入采集处理流程 | 下游阻塞、队列未确认 |
| Kafka 确认 | 满足 producer 的确认要求 | 尚未被消费、保留期不足 |
| Kafka offset 提交 | 消费位置已经推进 | ES 仍未完成写入 |
| Logstash PQ | 事件位于本地持久化处理链路 | 节点磁盘故障、未检查点窗口 |
| ES 写入成功 | 满足对应写入语义 | 未刷新、没有独立备份 |
| Kibana 可查 | 查询条件下看见结果 | 其他事件可能仍缺失 |

高可靠性设计必须明确能容忍哪些故障，而不是只写“开启持久化”。
主机断电、磁盘损坏、网络分区、误删 Topic 和错误解析规则是不同故障模型。


#### 背压如何向上游传播

```mermaid
flowchart RL
    E[ES 写入变慢] --> L[Logstash 输出重试]
    L --> P[PQ 或内存队列增长]
    P --> K[Kafka 消费变慢]
    K --> R[Kafka 日志积压]
    R --> F[Kafka 不可写时 Filebeat 输出阻塞]
    F --> A[本地源日志保留窗口承压]
```

Kafka 仍有足够空间和可用副本时，Filebeat 可以继续生产，ES 的慢不一定马上反映成 Filebeat 采集停止。
如果只监控入口成功率，就会忽略中间持续增长的积压。

**每段缓冲都应有上限和归属**

| 缓冲 | 归属 | 满了之后要观察 |
| --- | --- | --- |
| 应用文件 | 应用或节点 | 轮转、删除、磁盘余量 |
| Filebeat 内存队列 | Filebeat 进程 | 输出阻塞、重启后的行为 |
| Kafka Topic | 分区副本 | 保留删除、ISR、磁盘 |
| Logstash PQ | 某个 Pipeline 的本地磁盘 | 容量、检查点、节点归属 |
| ES 内部队列 | ES 节点 | 拒绝、内存、请求延迟 |

把 PQ 放在共享网络文件系统上，不等于给它增加分布式复制语义。
多个实例共用同一个队列目录也不是受支持的横向扩容方法。


### 9.2 定位 Rebalance、消费积压和队列耗尽
<a id="s-9-2"></a>

#### auto_offset_reset 与 Rebalance

`auto_offset_reset` 主要作用于没有可用已提交位置，或位置已经超出可读范围的情形。
将它设为 `earliest` 不会让一个已有有效消费进度的组每次启动都从头读取。
需要回放时应使用隔离消费组或显式 Offset 重置流程。[Consumer 配置](https://kafka.apache.org/28/configuration/consumer-configs/)

**Rebalance 不是必然故障**

消费者加入、退出、订阅变化或某些超时都会触发重新分配。
短暂发生可以正常，但反复发生会影响吞吐并增加重复处理窗口。
应检查处理耗时、poll 间隔、GC、网络和实例频繁重启，而不是只把 session timeout 一直调大。

| 现象 | 可能原因 | 应收集证据 |
| --- | --- | --- |
| 一扩容就短暂停顿 | 正常组重分配 | 分配前后日志 |
| 持续 revoke/assign | 实例抖动或超时 | GC、网络、容器重启 |
| 消费线程空闲 | 分区少于线程 | Topic 分区与组成员 |
| Lag 集中一个分区 | 热点或慢记录 | 每分区速率与消息样本 |
| 改 earliest 无效果 | 已有有效 Offset | 组当前提交位置 |


#### Lag、队列深度与新鲜度联合判断

只告警 Kafka Lag 不足以监控整条日志链路。
Input 可以快速把消息搬入 PQ 并提交 Offset，而输出仍长时间阻塞。
此时 Kafka Lag 可能较低，但 PQ 继续增长，ES 中的最新事件越来越旧。

| Kafka Lag | PQ | ES 新鲜度 | 优先判断 |
| --- | --- | --- | --- |
| 高 | 低 | 落后 | 消费端未取到或处理入口慢 |
| 低 | 高 | 落后 | 已搬入 Logstash，但输出落后 |
| 高 | 高 | 落后 | 下游受阻，积压向上游传播 |
| 低 | 低 | 落后 | 源端没有新数据、过滤或查询问题 |
| 低 | 低 | 正常 | 仍需看质量失败与覆盖率 |

**只读检查命令**

```bash
docker compose -p elk-full exec kafka kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --describe --group logs-lab-main-v1
curl -fsS 'http://127.0.0.1:9600/_node/stats/pipelines?pretty'
curl -fsS 'http://127.0.0.1:5066/stats?pretty'
```

API 字段应以实际版本返回为准，不能把新版本监控页面的字段名硬套到 7.17。
第四篇使用这些原生证据建立监控和排障，不假设已经安装某个第三方 exporter。


### 9.3 解释稳定 ID 的去重范围与 Rollover 边界
<a id="s-9-3"></a>

#### 使用稳定 ID 的收益与限制

主 Pipeline 用 `event.id` 作为 ES `_id`，适合说明重复消费如何影响最终文档。
在同一个具体索引内，相同 ID 的 `index` 动作会覆盖已有文档。
但是 rollover 后写入别名指向新索引，相同 ID 可以在新旧索引各存在一份。

```text
logs-lab-000001 / id=event-a
logs-lab-000002 / id=event-a
```

查询别名覆盖两者时，仍可能得到两条记录。
因此“设置 document_id”不等于“整个日志生命周期全局去重”。
需要全局精确幂等时，应进一步设计稳定目标索引、外部去重状态或可接受的查询语义。

**自动 ID、index 与 create 的对照**

| 方式 | 优势 | 代价 |
| --- | --- | --- |
| 自动 ID | 写入简单 | 重放产生新文档 |
| 稳定 ID + index | 同索引可覆盖重复 | 错误 ID 会覆盖独立事件 |
| 稳定 ID + create | 已存在会冲突 | 需要明确处理 409 |
| 外部幂等控制 | 可以覆盖更广范围 | 额外状态与一致性复杂度 |

不要为了减轻重复而随便用 `message` hash 作为所有日志身份。
同一条“连接超时”文本可能代表不同时间的多个真实事件，合并后会低估故障频率。


#### 重复的来源与幂等边界

重复可能产生在 Filebeat 重读、Kafka 重试或回放、Logstash 恢复、输出超时后的重试等位置。
应先识别重复对象是原始文件行、Kafka record 还是 ES 文档。

第二篇优先使用生产者 `event_id`，缺失时使用源集群、Topic、Partition、Offset 组合。
这使同一个 Kafka 位置的重放具有可追溯身份，但并不使不同 Kafka 集群复制后的新 Offset 自动对应原事件。

| 身份方案 | 优点 | 边界 |
| --- | --- | --- |
| 业务生成事件 ID | 可跨采集、传输与回放追踪 | 生产者必须保证语义和唯一性 |
| Kafka 位置组合 | 对同一源分区中的 record 稳定 | 跨集群重写后位置改变 |
| 原文 Hash | 不需要生产者额外字段 | 两条完全相同的合法事件可能被错误合并 |
| ES 自动 ID | 写入简单 | 重试或回放可能产生多份文档 |

**Rollover 后的去重**

同一 `_id` 写到不同实际索引可以同时存在。
因此按别名覆盖多代索引查询时，仍可能出现同一 `event.id` 的多条命中。
需要严格去重的场景，应设计确定性目标索引、独立幂等状态或查询侧去重，并评估成本。
不能承诺单独配置 `document_id` 就获得跨索引 Exactly-once。


### 9.4 执行有界回放并用集合、字段和路由完成对账
<a id="s-9-4"></a>

回放之前先固定源范围、消费组和目标索引。基础实验使用 `audit_run.py` 核对唯一源 ID；对照实验使用 `export_audit.py` 和 manifest 核对传输重复、正常/隔离路由及源哈希。两种工具的输入契约不同，应分别执行，不互相替换参数。

#### 安全回放与 Offset 重置

回放先明确目的：修正规则、补写缺失，还是审计一段历史？
然后确定源范围、目标索引、事件身份、吞吐限制和停止条件。
不应把主组直接改成 earliest 后放任它把全部历史写回主索引。

**优先使用隔离组与隔离目标**

```text
原组 logs-lab-main-v1   → logs-lab
新组 logs-lab-replay-1  → logs-lab-replay-*
```

新组第一次从 earliest 开始，仍只能读取 Kafka 当前保留的消息。
需要指定更窄范围时，应记录分区起止 Offset，或使用独立导出/回放程序控制范围。
新组与主组可以并行，但要评估额外读取与 ES 写入负载。

**重置命令必须先预览**

下面只用于隔离实验组，并要求该组没有活跃消费者。
先检查组状态、保存现有 Offset，再预览；确认范围后才执行。

```bash
# 对照练习组，不是 logs-lab-main-v1。
docker compose -p elk-full exec kafka kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 --describe --group logs-lab-replay-1

docker compose -p elk-full exec kafka kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --group logs-lab-replay-1 --topic logs-lab-raw \
  --reset-offsets --to-earliest --dry-run

# 仅在确认预览后执行。
docker compose -p elk-full exec kafka kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --group logs-lab-replay-1 --topic logs-lab-raw \
  --reset-offsets --to-earliest --execute
```

重置 Offset 是持久化消费状态变更。
执行成功不代表目标索引不会重复，也不代表恢复范围完整。
验收必须比较事件 ID 集合和解析规则版本，而不是仅看 Lag 再次归零。[Kafka 运维命令](https://kafka.apache.org/28/operations/basic-kafka-operations/)


#### 有界回放而不是直接重置生产消费组

恢复错误规则时，优先创建独立消费组和隔离目标，限定 Topic、分区和时间范围。
先比较新旧规则结果，再决定是否替换正式数据。

```text
保存旧规则与失败样本
→ 修复规则并运行本地测试
→ 创建隔离目标模板和别名
→ 新消费组读取限定范围
→ 对比字段、数量、ID 和失败率
→ 评估写入负载
→ 执行正式恢复
→ 验证与回收实验资源
```

`auto_offset_reset=earliest` 不会让一个已有有效提交位置的消费组自动从最早重读。
重置消费组位置需要先停止组内活跃消费者，先 dry-run，再执行明确的目标位置。[Kafka 运维](https://kafka.apache.org/28/operations/basic-kafka-operations/)

**只做预览的例子**

```bash
# 仅针对实验消费组；先停止该组消费者。
docker compose -p elk-full exec kafka kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --group logs-lab-replay-review \
  --topic logs-lab-raw \
  --reset-offsets --to-earliest --dry-run
```

预览不创建新的恢复能力，也不能恢复已经被 Kafka 保留策略删除的数据。
不要把真实生产组名称替换进去就直接追加 `--execute`。
执行前应保存各分区原 Offset，明确何时停止回放和如何恢复实时消费。


#### 基础实验：用事件集合而不是总条数对账

可能出现“少一条、多一条重复，总数仍相同”的情况。
可靠的有界验收要同时比较缺失、意外事件和重复 ID。
下面脚本针对本书生成器，读取源 JSONL 与第三篇导出的结果。

保存为 `scripts/audit_run.py`：

```python
#!/usr/bin/env python3
"""比较生成器原始 JSONL 与 export_run.py 导出，输出缺失和重复。"""
from __future__ import annotations

import argparse
from collections import Counter
import json
import sys
from pathlib import Path


def load_jsonl(path: Path):
    with path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            if line.strip():
                try:
                    yield json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"{path}:{line_number}: 非法 JSON") from exc


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--export", required=True)
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()
    try:
        expected = []
        for row in load_jsonl(Path(args.source)):
            if row.get("run_id") == args.run_id:
                event_id = row.get("event_id")
                if not isinstance(event_id, str) or not event_id:
                    raise ValueError("源记录缺少有效 event_id")
                expected.append(event_id)
        if not expected:
            raise ValueError("源文件中没有指定 run_id，拒绝把空对空判定为成功")
        source_counts = Counter(expected)
        source_duplicates = {key: count for key, count in source_counts.items() if count > 1}
        if source_duplicates:
            raise ValueError("源文件同一 run_id 已重复生成；请使用唯一批次或先明确重复语义")
        actual = []
        indices = Counter()
        for hit in load_jsonl(Path(args.export)):
            document = hit.get("_source", {})
            if document.get("labels", {}).get("run_id") != args.run_id:
                raise ValueError("导出混入其他 run_id 或无法识别的记录")
            event_id = document.get("event", {}).get("id")
            if not isinstance(event_id, str) or not event_id:
                raise ValueError("导出文档缺少有效 event.id")
            actual.append(event_id)
            indices[hit.get("_index", "unknown")] += 1
        counts = Counter(actual)
        missing = sorted(set(expected) - set(actual))
        unexpected = sorted(set(actual) - set(expected))
        duplicates = {key: count for key, count in counts.items() if count > 1}
        result = {
            "run_id": args.run_id, "expected": len(expected), "actual_documents": len(actual),
            "actual_unique_ids": len(counts), "indices": dict(indices),
            "missing": missing, "unexpected": unexpected, "duplicates": duplicates,
            "passed": not missing and not unexpected and not duplicates,
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["passed"] else 2
    except (OSError, ValueError, TypeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
```

**验收命令**

```bash
# run_id 必须唯一。重复运行同一批次会改变实验语义。
python3 scripts/generate_logs.py \
  --output logs/access.jsonl --count 100 --bad-every 10 \
  --run-id audit-001 --interval 0.02

# 等待链路处理，再执行有界导出。
python3 scripts/export_run.py \
  --run-id audit-001 --output exports/audit-001.jsonl --max-docs 1000

python3 scripts/audit_run.py \
  --source logs/access.jsonl --export exports/audit-001.jsonl --run-id audit-001
```

这个生成器的十条坏状态仍是合法 JSON，所以可以保留 run_id 和 event_id，进入隔离索引后也可参与集合对账。
完全非法 JSON 的实验需要另外保存源序号或 Kafka 位置，不能沿用这个假设。

**返回码含义**

0 表示这个有界批次的 ID 集合没有发现缺失、额外事件或重复。
2 表示对账失败。
1 表示输入格式、文件或使用方式错误。
对账通过不证明所有生产时间段都满足同样的可靠性，只证明此次已知输入和所查询结果相符。


#### 恢复后不要立即删除现场

恢复完成应保留关键配置版本、失败原因、源 Offset、导出结果和对账报告。
解析错误常常需要几天后再次解释，立即清空隔离索引或 DLQ 会损失证据。

| 资源 | 删除前确认 |
| --- | --- |
| Kafka 回放消费组 | 恢复已验收，组不再承担实时消费 |
| 隔离索引 | 原因已修复，必要证据已归档 |
| DLQ | 已读取、处理并证明没有遗漏 |
| PQ | 对应实例已正确排空，不靠删除目录解除阻塞 |
| 原始文件 | 下游确认、保留策略和恢复需求允许 |

恢复不仅是组件重新启动，还包括数据补齐、队列回到稳定水平、质量指标恢复以及用户查询正常。


#### 对照实验完整文件：`tools/export_audit.py`

有界分页与集合/路由/字段对账。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tools/export_audit.py -->
```python
"""跨产品有界 Scroll 导出 + 事件集合、路由和关键字段验收。"""
from __future__ import annotations
import argparse
from collections import Counter
import json
import hashlib
from pathlib import Path
from client import Client, complete_search


def export(c, run, path: Path, maximum=10000):
    if not 1 <= maximum <= 100000:
        raise ValueError('maximum 需要 1..100000')
    c.guard(); scroll=None; total=0; expected_total=None
    temporary=path.with_name(path.name+'.partial')
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists():raise FileExistsError(path)
    try:
        body={'size':500,'track_total_hits':True,'sort':['_doc'],
              'query':{'term':{'labels.run_id':run}}}
        result=c.request('POST','/exp-logs,exp-quarantine/_search?scroll=1m&allow_partial_search_results=false',body)
        with temporary.open('x',encoding='utf-8') as out:
            while True:
                scroll=result.get('_scroll_id',scroll)
                complete_search(result)
                hits=result['hits']['hits']
                if expected_total is None:
                    count=result['hits']['total']
                    if not isinstance(count,dict) or count.get('relation') != 'eq':
                        raise RuntimeError('初次搜索没有准确总数')
                    expected_total=count['value']
                if not hits:break
                if total+len(hits)>maximum:raise RuntimeError('超过导出上限，保留 partial')
                for hit in hits:
                    out.write(json.dumps({k:hit[k] for k in ('_index','_id','_source')},ensure_ascii=False)+'\n')
                total+=len(hits)
                if not scroll:raise RuntimeError('后续页缺少 Scroll ID')
                result=c.request('POST','/_search/scroll',{'scroll':'1m','scroll_id':scroll})
        if total != expected_total:raise RuntimeError('导出条数不等于初次查询快照总数')
        temporary.rename(path)
        return {'complete':True,'documents':total,'output':str(path)}
    finally:
        if scroll:
            result=c.request('DELETE','/_search/scroll',{'scroll_id':[scroll]})
            if result.get('succeeded') is not True:
                raise RuntimeError('Scroll 清理未确认成功；检查并等待过期')


def field(doc,path):
    for key in path.split('.'):
        if not isinstance(doc,dict) or key not in doc:return None
        doc=doc[key]
    return doc


def audit(manifest:dict,hits:list[dict]):
    expected=manifest.get('events',{})
    if not expected:raise ValueError('禁止空清单对空导出通过')
    counts=Counter();bad=[]
    for hit in hits:
        doc=hit.get('_source',{});eid=field(doc,'event.id');counts[eid]+=1
        if eid not in expected:continue
        wanted=expected[eid]
        actual_route='normal' if hit.get('_index','').startswith('exp-logs-') else (
            'quarantine' if hit.get('_index','').startswith('exp-quarantine-') else 'unknown')
        if actual_route!=wanted['route'] or field(doc,'pipeline.route')!=wanted['route']:
            bad.append([eid,'route',actual_route,wanted['route']])
        if field(doc,'labels.run_id')!=manifest['run_id']:bad.append([eid,'run_id'])
        if field(doc,'service.name')!='orders-api' or field(doc,'service.environment')!='lab':bad.append([eid,'service'])
        errors=field(doc,'pipeline.errors')
        if not isinstance(errors,list) or (wanted['route']=='quarantine')!=bool(errors):bad.append([eid,'errors'])
        for key,value in wanted.get('checks',{}).items():
            if field(doc,key)!=value:bad.append([eid,key,field(doc,key),value])
    missing=sorted(set(expected)-set(counts));extra=sorted(set(counts)-set(expected),key=str)
    duplicate={str(k):v for k,v in counts.items() if v>1}
    return {'run_id':manifest['run_id'],'missing':missing,'unexpected':extra,'duplicates':duplicate,
            'field_or_route_errors':bad,'expected_unique':len(expected),'actual_documents':sum(counts.values()),
            'status':'通过' if not(missing or extra or duplicate or bad) else '失败'}

def read_manifest(path: Path):
    manifest=json.loads(path.read_text(encoding='utf-8'))
    sources=manifest.get('source_files')
    if not isinstance(sources,dict) or not sources:raise ValueError('缺少源文件校验清单')
    for name,digest in sources.items():
        if Path(name).name!=name or name in ('.','..') or '/' in name or '\\' in name:
            raise ValueError('源文件必须是清单同目录中的简单文件名')
        actual=hashlib.sha256((path.parent/name).read_bytes()).hexdigest()
        if actual!=digest:raise ValueError('源样本 SHA-256 已变化: '+name)
    return manifest


if __name__=='__main__':
    p=argparse.ArgumentParser();s=p.add_subparsers(dest='mode',required=True)
    x=s.add_parser('export');x.add_argument('backend',choices=['es','os']);x.add_argument('--url')
    x.add_argument('--run-id',required=True);x.add_argument('--output',required=True);x.add_argument('--max-docs',type=int,default=10000)
    x=s.add_parser('audit');x.add_argument('--manifest',required=True);x.add_argument('--input',required=True)
    a=p.parse_args()
    if a.mode=='export':result=export(Client(a.backend,a.url),a.run_id,Path(a.output),a.max_docs)
    else:
        result=audit(read_manifest(Path(a.manifest)),[json.loads(x) for x in Path(a.input).read_text().splitlines() if x.strip()])
    print(json.dumps(result,ensure_ascii=False,indent=2));raise SystemExit(2 if result.get('status')=='失败' else 0)
```



## 第 10 章 · 连接两个搜索后端并处理输出失败

### 10.1 安装固定输出插件并检查依赖与 ECS 设置
<a id="s-10-1"></a>

对照分支使用专用 OpenSearch output，不能把 Elasticsearch output 的地址改成 OpenSearch 就宣称兼容。精确主程序与插件组合见 [1.3 节](01-log-foundations-and-collection.md#s-1-3)，镜像构建和版本门禁的完整文件见 [8.2 节](02-pipeline-and-reliability.md#s-8-2)。配置加载通过之后，仍要验证 Bulk 条目错误、失败隔离和恢复行为。

#### ECS、模板与安全职责

本书在两条 Logstash Pipeline 中显式关闭插件的自动 ECS 默认布局和模板管理，然后由共同规范化函数产生选定的 ECS 风格字段。
`ecs_compatibility => disabled` 不会阻止手工写 `event.id` 或 `service.name`；它控制的是插件自身的默认行为。
更不能由“关闭 ECS 模式”推导出“日志不允许采用 ECS 命名”。[插件 ECS 与参数](https://github.com/opensearch-project/logstash-output-opensearch/blob/2.0.3/lib/logstash/outputs/opensearch.rb)

模板、Ingest Pipeline、策略由初始化身份预先创建。
Logstash 运行身份只负责写允许的别名，避免每个副本启动时争相管理模板。
主实验关闭安全插件且只把 HTTP 端口映射到回环地址；这只是隔离教学条件，Docker 网络内的其他容器仍可直接访问。
不要把主实验网络与生产业务网络连接。

正式安全接入片段仅替换 OS output 连接字段，保留 [完整输出配置](02-pipeline-and-reliability.md#s-10-2) 的事件 ID、目标别名和模板关闭设置：

```logstash
# 已有真实 CA、证书 SAN、写入身份和预创建资源时使用；不是独立 Pipeline。
opensearch {
  hosts => ["https://os-data-a.example.internal:9200", "https://os-data-b.example.internal:9200"]
  user => "logstash_exp_writer"
  password => "${OS_WRITER_PASSWORD}"
  ssl => true
  ssl_certificate_verification => true
  cacert => "/etc/logstash/certs/os-ca.pem"
  index => "exp-logs"
  document_id => "%{[event][id]}"
  action => "index"
  manage_template => false
  ecs_compatibility => disabled
  pipeline => "exp-ingested"
}
```

这些参数来自固定 2.0.3 源码，不借用新插件的 TLS 参数名。[API 配置](https://github.com/opensearch-project/logstash-output-opensearch/blob/2.0.3/lib/logstash/plugin_mixins/opensearch/api_configs.rb)
先验证服务端身份，再验证写入权限；401、403、证书链错误和 DNS 失败必须分别处理。
自建安全插件中创建最小权限角色时，应按实际请求审计收窄到 Bulk、目标索引写入和必要健康检查；不能把示例 `admin` 作为长期运行账号。
云托管的 IAM、SigV4、域访问策略是另一层，本书不把它们写成自建 OpenSearch 的默认认证流程。


### 10.2 用独立消费组与 PQ 建立双后端对照链路
<a id="s-10-2"></a>

两条输出读取同一 Topic，却使用不同消费组和独立的 Logstash 进程/PQ。这样每个后端能获得完整样本，某个输出阻塞时也不会同步占住另一条 Pipeline。下列配置属于 `elk-expansion`，完整文件须按 [11.1 节](02-pipeline-and-reliability.md#s-11-1) 一次准备。

#### 先隔离资源，再执行启动

本篇所有真实操作指向独立实验 `elk-expansion`，不复用旧 `elk-full`。
新索引以 `exp-` 开头；旧 `logs-lab`、旧卷、旧消费组保持原样。
完整文件按 [文件索引与提取器](02-pipeline-and-reliability.md#s-11-1) 一次准备到新目录；只有片段配置不构成可启动环境。

| 入口 | 本机地址或名称 | 用途 |
| --- | --- | --- |
| ES | `127.0.0.1:19200` | 原产品对照 |
| OS | `127.0.0.1:29200` | 新产品实验 |
| Kibana | `127.0.0.1:15601` | 原界面对照 |
| Dashboards | `127.0.0.1:25601` | 新界面验收 |
| Kafka | `127.0.0.1:39092` | 宿主诊断；容器内部用 `kafka:9092` |
| 两个 LS API | `19600`、`29600` | Pipeline 诊断 |
| 本地通知接收端 | `127.0.0.1:18080` | 保存测试通知，不发送真实外部消息 |

双后端完整实验建议 Docker 可使用 6 核、20GiB 内存及至少 50GiB 空闲磁盘，这是本书的实验预算，不是产品官方最小要求。
只启动 OS 分支可降低开销；多节点实验应停止不需要的单节点栈，另预留恢复临时空间。
Linux 上按官方安装前提检查 `vm.max_map_count`，Docker Desktop 要检查的是虚拟机资源而不只是宿主总内存。[Docker 前提](https://docs.opensearch.org/2.19/install-and-configure/install-opensearch/docker/)

```bash
# 在提取出的全新 lab 目录执行。
bash run.sh precheck
bash run.sh start
python3 tools/generate.py --run-id first-check --count 100 --profile mixed
```

`run.sh start` 的顺序是构建、启动两个搜索后端和 Kafka、验证身份、创建 Topic、初始化资源、验证配置，再启动采集与加工。
`depends_on` 仅表达启动依赖，不能代替 API 就绪检查。
脚本也不会把进程 Up 当作业务验收通过。


#### 对照实验完整文件：`logstash/es.conf`

独立消费组与 ES 输出。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: logstash/es.conf -->
```logstash
input {
  kafka {
    id => "exp-kafka-es"
    bootstrap_servers => "kafka:9092"
    topics => ["exp-logs-raw"]
    group_id => "exp-es-v2"
    client_id => "exp-es-consumer"
    enable_auto_commit => false
    auto_offset_reset => "earliest"
    consumer_threads => 1
    decorate_events => "basic"
    codec => json { ecs_compatibility => disabled }
  }
}
filter {
  ruby { path => "/exp/normalize.rb" }
}
output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "%{[@metadata][target_alias]}"
    document_id => "%{[event][id]}"
    action => "index"
    ecs_compatibility => disabled
    manage_template => false
    ilm_enabled => false
    pipeline => "exp-ingested"
  }
}
```


#### 对照实验完整文件：`logstash/os.conf`

独立消费组与 OS 输出。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: logstash/os.conf -->
```logstash
input {
  kafka {
    id => "exp-kafka-os"
    bootstrap_servers => "kafka:9092"
    topics => ["exp-logs-raw"]
    group_id => "exp-os-v2"
    client_id => "exp-os-consumer"
    enable_auto_commit => false
    auto_offset_reset => "earliest"
    consumer_threads => 1
    decorate_events => "basic"
    codec => json { ecs_compatibility => disabled }
  }
}
filter {
  ruby { path => "/exp/normalize.rb" }
}
output {
  opensearch {
    hosts => ["http://opensearch:9200"]
    index => "%{[@metadata][target_alias]}"
    document_id => "%{[event][id]}"
    action => "index"
    ecs_compatibility => disabled
    manage_template => false
    pipeline => "exp-ingested"
  }
}
```


### 10.3 分别判断请求失败、Bulk 条目失败、重试与 DLQ
<a id="s-10-3"></a>

#### Bulk 请求与单条文档失败

ES Bulk 的 HTTP 响应状态与每条 action 的结果是两层状态。
HTTP 200 只说明 Bulk 请求被处理，正文中的 `errors` 和每条 item 仍可能包含失败。
所以网络层成功计数不能直接当成文档成功计数。[Bulk API](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/docs-bulk.html)

**隔离索引中的直接 Bulk 实验**

先创建独立小索引，不使用主日志索引做错误注入。

```bash
curl -fsS -X PUT 'http://127.0.0.1:9200/lab-bulk-test' \
  -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{
  "settings":{"number_of_shards":1,"number_of_replicas":0},
  "mappings":{"properties":{"status":{"type":"integer"}}}
}
JSON
curl -fsS -X POST 'http://127.0.0.1:9200/_bulk?pretty' \
  -H 'Content-Type: application/x-ndjson' --data-binary @- <<'NDJSON'
{"index":{"_index":"lab-bulk-test","_id":"ok"}}
{"status":200}
{"index":{"_index":"lab-bulk-test","_id":"bad"}}
{"status":"not-a-number"}
NDJSON
```

预期 Bulk 正文有一条成功、一条字段类型错误。
检查 `errors`、各 item 的 status 与 error reason，不要只看 curl 退出码。
此实验直接调用 ES，不经过 Logstash，因此不会自动产生 Logstash DLQ 条目。

**插件重试策略必须按版本核对**

本书固定的 Elasticsearch output 11.4.2 文档区分请求级失败与单文档失败。
文档级 400/404 在启用 DLQ 时可进入 DLQ；409 的处理又不同，不能把所有错误统一描述为无限重试。[Output 错误策略](https://www.elastic.co/guide/en/logstash/7.17/plugins-outputs-elasticsearch.html)
实际故障应保存插件版本、错误级别与具体响应，再决定是重试、修数据还是修权限。


#### 业务隔离索引与 DLQ

业务隔离索引接收我们主动识别的 JSON、字段和时间错误。
DLQ 则由 Logstash 在其支持的失败场景中保存事件，两者不是同一机制。
Grok 失败不会因为开启 DLQ 就自动全部进去；网络不可达导致整批重试时，DLQ 也不一定介入。[DLQ](https://www.elastic.co/guide/en/logstash/7.17/dead-letter-queues.html)

| 路径 | 谁判断 | 典型事件 | 恢复方式 |
| --- | --- | --- | --- |
| 业务隔离索引 | 自定义 Pipeline | 非法字段、格式与时间 | 修规则后从原始记录回放 |
| Logstash DLQ | 受支持的插件失败逻辑 | ES 单文档 Mapping 错误 | DLQ input 读取并修复 |
| PQ | Logstash 队列 | 尚未完成输出的正常/异常事件 | 恢复实例后继续处理 |
| Kafka 原始 Topic | 上游缓冲 | 已生产的原始信封 | 按范围重新消费 |

隔离索引不是无限备用垃圾桶。
它要有单独的保留周期、容量告警、责任人和修复闭环。
若隔离记录总量持续增长，说明源契约或规则问题未被解决。

**只读读取 DLQ 的配置**

```logstash
# dlq-inspect.conf：先只输出检查，不直接写回主索引。
input {
  dead_letter_queue {
    path => "/usr/share/logstash/data/dead_letter_queue"
    pipeline_id => "logs-main"
    commit_offsets => false
  }
}
output {
  stdout { codec => rubydebug { metadata => true } }
}
```

`path` 指向 DLQ 根目录，`pipeline_id` 指写入该队列的原 Pipeline。
读取位置应使用独立 `path.data` 管理，避免与主进程的数据锁冲突。
读取并不等于队列文件自动删除，清理需按该版本支持的安全流程操作。

**恢复前先明确失败原因**

若错误是状态码字段非法，把字段删除后写回可能使日志可保存，但统计信息已发生变化。
应保留修复记录、原始值和规则版本，并写入隔离恢复索引验证。
不能把“DLQ 变小了”当成业务数据完整性已经恢复。


#### Bulk、重试和隔离的责任

HTTP 200 的 Bulk 响应仍可能含失败 item。
本书压测脚本逐条检查状态，条数不一致也判失败，不通过忽略坏事件获得更高吞吐数字。
重试只应处理可恢复失败；Mapping 错误需要修正规则或隔离，不应无限重试同一份错误结构。

OS output 的固定源码列出了网络错误、429、503 的重试，以及 409 的不同处理边界；实际文档级错误与 DLQ 支持仍需用选定插件运行验证。[固定输出源码](https://github.com/opensearch-project/logstash-output-opensearch/blob/2.0.3/lib/logstash/outputs/opensearch.rb)
本书不根据插件名称相似就复制 ES output 的全部 DLQ 结论。

两条主 Pipeline 在输出前主动把解析和字段质量错误路由至 `exp-quarantine`。
这解决的是已识别的数据质量问题，不覆盖所有服务端拒绝。
必须额外观察 LS 输出日志、DLQ 是否有数据、PQ 是否排空，以及两后端集合是否完整。


### 10.4 选择完整链路或短链路并明确各自证明范围
<a id="s-10-4"></a>

完整路径适合观察 Kafka 缓冲和双后端对账；短路径适合先确认转换与输出插件。减少组件也会减少本次验证覆盖的确认与故障边界。下面的 stdin 实验只证明转换和输出，不替代文件轮转、Kafka 保留或恢复对账。

#### 更短的入门路径与停止方法

尚未准备 Kafka 时，可先在同一网络启动 OpenSearch、初始化模板，再用一个临时 Logstash stdin Pipeline 验证普通 JSON 到后端。
该路径不测试 Filebeat 读取位置、Kafka Offset、PQ 故障恢复，因此不能替代完整验收。

```logstash
# 临时 stdin 演示配置；输入是已经规范化的单行 JSON，不是本书外层信封。
input { stdin { codec => json { ecs_compatibility => disabled } } }
output {
  opensearch {
    hosts => ["http://opensearch:9200"]
    index => "exp-logs"
    document_id => "%{[event][id]}"
    manage_template => false
    ecs_compatibility => disabled
    pipeline => "exp-ingested"
  }
}
```

普通停止只停容器：

```bash
bash run.sh stop
```

删除数据是另一项动作，见 [带确认词的清理命令](02-pipeline-and-reliability.md#s-11-2)。
不能在一段“快速重启”脚本中偷偷加入 `down --volumes`。



## 第 11 章 · 完整实验的文件组织、执行与证据

### 11.1 从四篇 Markdown 提取完整配置且拒绝覆盖
<a id="s-11-1"></a>

#### 完整文件索引与运行目录

四篇笔记就是实验代码的来源，仓库不维护 `labs/` 或其他独立实验工程。读者在自己的空目录运行对照实验；基础实验仍按各节的“保存为”说明单独准备。

下表列出带 `<!-- file: ... -->` 标记的35个完整文件。它们共同构成 `elk-expansion` 对照实验；普通配置片段与选型观察示例不在提取范围内。

| 完整文件 | 唯一代码位置 |
| --- | --- |
| `compose.yaml` | [从四篇 Markdown 提取完整配置且拒绝覆盖](02-pipeline-and-reliability.md#s-11-1) |
| `kafka/Dockerfile` | [部署固定版本并排查监听地址与连接路径](02-pipeline-and-reliability.md#s-7-3) |
| `kafka/server.properties` | [部署固定版本并排查监听地址与连接路径](02-pipeline-and-reliability.md#s-7-3) |
| `kafka/zookeeper.properties` | [部署固定版本并排查监听地址与连接路径](02-pipeline-and-reliability.md#s-7-3) |
| `filebeat/filebeat.yml` | [配置 Filebeat Kafka 输出并观察事件结构](02-pipeline-and-reliability.md#s-8-1) |
| `logstash/Dockerfile` | [组织 Logstash Pipeline、插件与配置加载](02-pipeline-and-reliability.md#s-8-2) |
| `logstash/logstash.yml` | [组织 Logstash Pipeline、插件与配置加载](02-pipeline-and-reliability.md#s-8-2) |
| `logstash/pipelines-es.yml` | [组织 Logstash Pipeline、插件与配置加载](02-pipeline-and-reliability.md#s-8-2) |
| `logstash/pipelines-os.yml` | [组织 Logstash Pipeline、插件与配置加载](02-pipeline-and-reliability.md#s-8-2) |
| `logstash/es.conf` | [用独立消费组与 PQ 建立双后端对照链路](02-pipeline-and-reliability.md#s-10-2) |
| `logstash/os.conf` | [用独立消费组与 PQ 建立双后端对照链路](02-pipeline-and-reliability.md#s-10-2) |
| `run.sh` | [按依赖顺序启动、初始化、采集并安全停止](02-pipeline-and-reliability.md#s-11-2) |
| `tools/client.py` | [核对产品身份、API、认证与脚本适用版本](03-search-storage-and-visualization.md#s-12-3) |
| `tools/model.py` | [用字段契约修复类型冲突并验证两产品差异](03-search-storage-and-visualization.md#s-13-4) |
| `tools/init_backend.py` | [建立组件模板、索引模板和写别名的初始化顺序](03-search-storage-and-visualization.md#s-14-1) |
| `logstash/normalize.rb` | [规范化字段并将失败事件送入可追查的隔离路径](02-pipeline-and-reliability.md#s-8-4) |
| `tools/generate.py` | [用批次、事件 ID 和实验信封生成异常样本](01-log-foundations-and-collection.md#s-2-4) |
| `tools/export_audit.py` | [执行有界回放并用集合、字段和路由完成对账](02-pipeline-and-reliability.md#s-9-4) |
| `tools/lifecycle.py` | [分别实现 ILM 与 ISM 的滚动、绑定和状态检查](03-search-storage-and-visualization.md#s-14-3) |
| `tools/api.py` | [核对产品身份、API、认证与脚本适用版本](03-search-storage-and-visualization.md#s-12-3) |
| `tools/wait_ready.py` | [验证存储入口就绪并避免误初始化其他集群](03-search-storage-and-visualization.md#s-12-4) |
| `tools/make_ha.py` | [构建六节点教学集群并管理首次引导配置](04-production-operations-and-troubleshooting.md#s-18-2) |
| `tools/cycle_data.py` | [验证滚动、转层、位置变化与删除的完整过程](04-production-operations-and-troubleshooting.md#s-19-2) |
| `tools/cost.py` | [计算流量、缓冲、分片、故障余量与排空时间](04-production-operations-and-troubleshooting.md#s-19-3) |
| `tools/performance.py` | [设计固定样本、预热、并发和停止条件的混合压测](04-production-operations-and-troubleshooting.md#s-20-3) |
| `tools/query_cases.py` | [用三个改写案例验证语义等价和查询成本](03-search-storage-and-visualization.md#s-16-4) |
| `tools/probe_v2.py` | [实现经采集入口的探针并识别探针自身失效](04-production-operations-and-troubleshooting.md#s-21-2) |
| `tools/alerts.py` | [用 UNKNOWN、去重、outbox 和恢复状态避免误报](04-production-operations-and-troubleshooting.md#s-21-5) |
| `tools/native_alerts.py` | [配置原生 Monitor 与本地通知并验证触发样本](04-production-operations-and-troubleshooting.md#s-21-4) |
| `tools/native_control.py` | [配置原生 Monitor 与本地通知并验证触发样本](04-production-operations-and-troubleshooting.md#s-21-4) |
| `receiver/server.py` | [配置原生 Monitor 与本地通知并验证触发样本](04-production-operations-and-troubleshooting.md#s-21-4) |
| `tools/record.py` | [区分静态、模拟和真实测试并复跑离线回归](02-pipeline-and-reliability.md#s-11-4) |
| `tests/normalize_cli.rb` | [区分静态、模拟和真实测试并复跑离线回归](02-pipeline-and-reliability.md#s-11-4) |
| `tests/test_core.py` | [区分静态、模拟和真实测试并复跑离线回归](02-pipeline-and-reliability.md#s-11-4) |
| `tools/static_check.py` | [区分静态、模拟和真实测试并复跑离线回归](02-pipeline-and-reliability.md#s-11-4) |

运行时在实验目录创建 `logs/` 和 `evidence/`，不要把日志、状态和数据卷混入笔记目录。文件标记保留原路径，跨篇引用不产生第二份权威实现。


#### 从四篇正文提取完整文件

将以下提取器保存为 `extract_expansion.py`，四篇 Markdown 必须来自同一次交付。脚本先读取和校验所有来源，再开始写文件；拒绝非空目标、路径穿越、重复标记和不完整文件集。它只提取本地文件，不构建镜像、不启动服务。

```python
from pathlib import Path, PurePosixPath
import argparse, hashlib, json, re

FILES = (
    "01-log-foundations-and-collection.md",
    "02-pipeline-and-reliability.md",
    "03-search-storage-and-visualization.md",
    "04-production-operations-and-troubleshooting.md",
)

def collect(source_dir):
    items = {}
    source_hashes = {}
    for filename in FILES:
        source = source_dir / filename
        raw = source.read_bytes()
        source_hashes[filename] = hashlib.sha256(raw).hexdigest()
        lines = raw.decode("utf-8").splitlines(keepends=True)
        i = 0
        while i < len(lines):
            line = lines[i].rstrip("\r\n")
            marker = re.fullmatch(r"<!-- file: ([^\n]+) -->", line)
            if marker:
                name = marker.group(1)
                rel = PurePosixPath(name)
                if (rel.is_absolute() or ".." in rel.parts or "\\" in name
                        or not rel.parts or str(rel) != name or name in items):
                    raise ValueError("非法或重复路径: " + name)
                i += 1
                if i >= len(lines) or not re.fullmatch(r"```[a-zA-Z0-9_+-]+", lines[i].strip()):
                    raise ValueError("文件标记后缺少代码围栏: " + name)
                i += 1
                body = []
                while i < len(lines) and lines[i].strip() != "```":
                    body.append(lines[i]); i += 1
                if i == len(lines):
                    raise ValueError("代码围栏未闭合: " + name)
                items[name] = "".join(body).encode("utf-8")
            elif line.startswith("```"):
                # Ignore markers inside ordinary examples and this extractor itself.
                i += 1
                while i < len(lines) and lines[i].strip() != "```":
                    i += 1
                if i == len(lines):
                    raise ValueError("代码围栏未闭合: " + filename)
            i += 1
    if len(items) != 35:
        raise ValueError(f"预期35个完整文件，实际{len(items)}个，请检查四篇是否来自同一次交付")
    return items, source_hashes

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    items, source_hashes = collect(args.source_dir)
    root = args.output
    if root.is_symlink() or (root.exists() and (not root.is_dir() or any(root.iterdir()))):
        raise ValueError("输出目录必须不存在或为空且不能是符号链接")
    root.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, data in items.items():
        target = root.joinpath(*PurePosixPath(name).parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as stream:
            stream.write(data)
        if target.suffix == ".sh":
            target.chmod(0o755)
        manifest[name] = hashlib.sha256(data).hexdigest()
    (root / ".source-manifest.json").write_text(json.dumps({
        "source_markdown_sha256": source_hashes, "files": manifest
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已提取 {len(items)} 个文件到 {root}")

if __name__ == "__main__":
    main()
```

```bash
# 第一个参数为包含四篇正文的目录；第二个为读者自己的空实验目录。
python3 extract_expansion.py /path/to/ops-roadmap/topics/observability/elk ~/elk-expansion-lab
cd ~/elk-expansion-lab
mkdir -p logs evidence
```

`.source-manifest.json` 保存四篇源文件和35个落地文件的 SHA-256。需要更新代码时重新提取到另一个空目录、比较变化，再决定如何切换运行配置；不要覆盖正在运行的实验。该工具面向本地受控材料，不是多用户共享目录上的安全写入服务。


#### 对照实验完整文件：`compose.yaml`

双产品独立进程、端口与卷；[相关章节](02-pipeline-and-reliability.md#s-10-2)。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: compose.yaml -->
```yaml
name: elk-expansion
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:7.17.29
    environment:
      cluster.name: elk-expansion-es
      discovery.type: single-node
      xpack.security.enabled: "false"
      ES_JAVA_OPTS: -Xms1g -Xmx1g
    ports: ["127.0.0.1:19200:9200"]
    volumes: ["es-data:/usr/share/elasticsearch/data"]
    mem_limit: 3g
  kibana:
    image: docker.elastic.co/kibana/kibana:7.17.29
    environment:
      ELASTICSEARCH_HOSTS: '["http://elasticsearch:9200"]'
      SERVER_HOST: 0.0.0.0
    ports: ["127.0.0.1:15601:5601"]
    depends_on: [elasticsearch]
    mem_limit: 1500m
  opensearch:
    image: opensearchproject/opensearch:2.19.6
    environment:
      cluster.name: elk-expansion-os
      discovery.type: single-node
      DISABLE_INSTALL_DEMO_CONFIG: "true"
      DISABLE_SECURITY_PLUGIN: "true"
      OPENSEARCH_JAVA_OPTS: -Xms1g -Xmx1g
    ports: ["127.0.0.1:29200:9200"]
    volumes: ["os-data:/usr/share/opensearch/data"]
    mem_limit: 3g
  dashboards:
    image: opensearchproject/opensearch-dashboards:2.19.6
    environment:
      OPENSEARCH_HOSTS: '["http://opensearch:9200"]'
      DISABLE_SECURITY_DASHBOARDS_PLUGIN: "true"
      SERVER_HOST: 0.0.0.0
    ports: ["127.0.0.1:25601:5601"]
    depends_on: [opensearch]
    mem_limit: 1500m
  zookeeper:
    build: ./kafka
    image: elk-expansion-kafka:2.8.2
    command: ["zookeeper-server-start.sh", "/opt/kafka/config/exp-zookeeper.properties"]
    environment:
      KAFKA_HEAP_OPTS: -Xms256m -Xmx256m
    volumes:
      - ./kafka/zookeeper.properties:/opt/kafka/config/exp-zookeeper.properties:ro
      - zk-data:/var/lib/kafka
    mem_limit: 600m
  kafka:
    image: elk-expansion-kafka:2.8.2
    command: ["kafka-server-start.sh", "/opt/kafka/config/exp-server.properties"]
    environment:
      KAFKA_HEAP_OPTS: -Xms512m -Xmx512m
    ports: ["127.0.0.1:39092:39092"]
    volumes:
      - ./kafka/server.properties:/opt/kafka/config/exp-server.properties:ro
      - kafka-data:/var/lib/kafka
    depends_on: [zookeeper]
    mem_limit: 1g
  filebeat:
    image: docker.elastic.co/beats/filebeat:7.17.29
    user: root
    command: ["filebeat", "-e", "--strict.perms=false"]
    volumes:
      - ./filebeat/filebeat.yml:/usr/share/filebeat/filebeat.yml:ro
      - ./logs:/var/log/exp:ro
      - fb-data:/usr/share/filebeat/data
    depends_on: [kafka]
    mem_limit: 500m
  logstash-es:
    image: docker.elastic.co/logstash/logstash:7.17.29
    environment:
      LS_JAVA_OPTS: -Xms512m -Xmx512m
    volumes:
      - ./logstash/logstash.yml:/usr/share/logstash/config/logstash.yml:ro
      - ./logstash/pipelines-es.yml:/usr/share/logstash/config/pipelines.yml:ro
      - ./logstash:/exp:ro
      - ls-es-data:/usr/share/logstash/data
    ports: ["127.0.0.1:19600:9600"]
    depends_on: [kafka, elasticsearch]
    mem_limit: 1500m
  logstash-os:
    build: ./logstash
    image: elk-expansion-logstash-os:7.17.29-output-2.0.3
    environment:
      LS_JAVA_OPTS: -Xms512m -Xmx512m
    volumes:
      - ./logstash/logstash.yml:/usr/share/logstash/config/logstash.yml:ro
      - ./logstash/pipelines-os.yml:/usr/share/logstash/config/pipelines.yml:ro
      - ./logstash:/exp:ro
      - ls-os-data:/usr/share/logstash/data
    ports: ["127.0.0.1:29600:9600"]
    depends_on: [kafka, opensearch]
    mem_limit: 1500m
  receiver:
    image: python:3.12.10-slim-bookworm
    command: ["python", "/app/server.py"]
    working_dir: /app
    ports: ["127.0.0.1:18080:8080"]
    volumes:
      - ./receiver/server.py:/app/server.py:ro
      - ./evidence:/evidence
    mem_limit: 200m
volumes:
  es-data: {}
  os-data: {}
  zk-data: {}
  kafka-data: {}
  fb-data: {}
  ls-es-data: {}
  ls-os-data: {}
```


### 11.2 按依赖顺序启动、初始化、采集并安全停止
<a id="s-11-2"></a>

本节保留两个独立运行入口。基础实验的 Compose 使用 `elk-full`，新对照实验的 `run.sh` 使用 `elk-expansion`。执行任何启动命令前，先保存所选实验的全部配置与脚本，并完成 [后端初始化准备](03-search-storage-and-visualization.md#s-14-1)；不要让采集抢在模板建立之前写入。

#### 基础实验：完整 Compose 与分阶段启动

保存以下完整配置为 `compose.yml`。
Kafka 与 ZooKeeper 使用同一归档构建出的镜像，但运行不同进程，数据目录分别持久化。
主机只暴露回环端口；内部网络未加认证，限定在教学实验。

```yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:7.17.29
    environment:
      cluster.name: elk-lab-full
      node.name: es-lab-1
      discovery.type: single-node
      xpack.security.enabled: "false"
      ES_JAVA_OPTS: -Xms1g -Xmx1g
    ports:
      - "127.0.0.1:9200:9200"
    volumes:
      - es-data:/usr/share/elasticsearch/data
      - es-snapshots:/mnt/snapshots
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS 'http://localhost:9200/_cluster/health?wait_for_status=yellow&timeout=5s' >/dev/null"]
      interval: 10s
      timeout: 8s
      retries: 30
    restart: unless-stopped

  kibana:
    image: docker.elastic.co/kibana/kibana:7.17.29
    environment:
      ELASTICSEARCH_HOSTS: '["http://elasticsearch:9200"]'
      SERVER_HOST: 0.0.0.0
    ports:
      - "127.0.0.1:5601:5601"
    depends_on:
      elasticsearch:
        condition: service_healthy
    restart: unless-stopped

  zookeeper:
    build: ./kafka
    image: elk-lab/kafka:2.8.2
    command: ["zookeeper-server-start.sh", "/etc/kafka/zookeeper.properties"]
    environment:
      KAFKA_HEAP_OPTS: -Xms256m -Xmx256m
    volumes:
      - ./kafka/zookeeper.properties:/etc/kafka/zookeeper.properties:ro
      - zk-data:/var/lib/zookeeper
    healthcheck:
      test: ["CMD-SHELL", "bash -c 'echo > /dev/tcp/127.0.0.1/2181'"]
      interval: 10s
      timeout: 5s
      retries: 30
    restart: unless-stopped

  kafka:
    build: ./kafka
    image: elk-lab/kafka:2.8.2
    environment:
      KAFKA_HEAP_OPTS: -Xms512m -Xmx512m
    ports:
      - "127.0.0.1:19092:19092"
    volumes:
      - ./kafka/server.properties:/etc/kafka/server.properties:ro
      - kafka-data:/var/lib/kafka
    depends_on:
      zookeeper:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "kafka-broker-api-versions.sh --bootstrap-server kafka:9092 >/dev/null 2>&1"]
      interval: 15s
      timeout: 10s
      retries: 30
    restart: unless-stopped

  logstash:
    image: docker.elastic.co/logstash/logstash:7.17.29
    environment:
      LS_JAVA_OPTS: -Xms512m -Xmx512m
    ports:
      - "127.0.0.1:9600:9600"
    volumes:
      - ./logstash/config/logstash.yml:/usr/share/logstash/config/logstash.yml:ro
      - ./logstash/config/pipelines.yml:/usr/share/logstash/config/pipelines.yml:ro
      - ./logstash/pipeline:/usr/share/logstash/pipeline:ro
      - ./logstash/scripts:/usr/share/logstash/scripts:ro
      - ls-data:/usr/share/logstash/data
    depends_on:
      kafka:
        condition: service_healthy
      elasticsearch:
        condition: service_healthy
    restart: unless-stopped

  filebeat:
    image: docker.elastic.co/beats/filebeat:7.17.29
    user: root
    command: ["filebeat", "-e", "--strict.perms=false"]
    ports:
      - "127.0.0.1:5066:5066"
    volumes:
      - ./filebeat/filebeat.yml:/usr/share/filebeat/filebeat.yml:ro
      - ./logs:/var/log/lab:ro
      - fb-data:/usr/share/filebeat/data
    depends_on:
      kafka:
        condition: service_healthy
    restart: unless-stopped

volumes:
  es-data:
  es-snapshots:
  zk-data:
  kafka-data:
  ls-data:
  fb-data:
```

**第一步：仅启动基础设施**

```bash
cd "$HOME/elk-lab-full"
docker compose -p elk-full build kafka zookeeper
docker compose -p elk-full up -d elasticsearch kibana zookeeper kafka
docker compose -p elk-full ps
docker compose -p elk-full logs --tail=100 kafka zookeeper
```

ZooKeeper 的健康检查只是端口可连接，Kafka 的检查则执行元数据类操作。
二者都不替代实际生产/消费验证；Kibana 页面能打开更不证明日志链路完整。

**检查版本和 broker API**

```bash
docker compose -p elk-full exec kafka kafka-topics.sh --version
docker compose -p elk-full exec kafka \
  kafka-broker-api-versions.sh --bootstrap-server kafka:9092
curl -fsS http://127.0.0.1:9200/
```

如果 Kafka 构建失败，先区分归档网络不可达、校验失败、基础镜像不可用与权限问题。
不能在校验失败后直接删除 `sha512sum` 那行继续构建。
受限网络中可先将已校验归档与基础镜像同步到内部制品库，再调整来源。

**后续启动顺序**

先完成 Topic 与采集加工配置，再执行 [基础实验 ES 初始化](03-search-storage-and-visualization.md#s-14-1)；准备齐全后才能启动 Logstash 和 Filebeat。
这里刻意不依赖自动创建索引/Topic 来掩盖资源初始化缺失。


#### 基础实验：启动处理、采集并核对数量

在主目录执行初始化，再检查配置，最后启动 Logstash 与 Filebeat。
若[相关章节](02-pipeline-and-reliability.md#s-8-1)已启动 Filebeat，Kafka 中已有积压是预期行为，Logstash 将按消费组位置处理。

```bash
cd "$HOME/elk-lab-full"
python3 scripts/init_es.py

docker compose -p elk-full run --rm --no-deps logstash \
  -t --path.settings /usr/share/logstash/config

docker compose -p elk-full run --rm --no-deps filebeat \
  filebeat test config -e --strict.perms=false

docker compose -p elk-full up -d logstash filebeat
docker compose -p elk-full ps
docker compose -p elk-full logs --tail=100 logstash filebeat
python3 scripts/generate_logs.py --count 100 --bad-every 10 --run-id full-acceptance
```

这批样本中每第十条具有非法状态码，因此预期 90 条走正常别名、10 条走隔离别名。
这个数字来自生成器的规则，不是声称本次已经在真实后端测得。
若目录里有旧样本，查询必须限定 `labels.run_id=full-acceptance`。

```bash
curl -fsS -X POST 'http://127.0.0.1:9200/logs-lab/_count?pretty' \
  -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{"query":{"term":{"labels.run_id":"full-acceptance"}}}
JSON
curl -fsS -X POST 'http://127.0.0.1:9200/logs-lab-quarantine/_count?pretty' \
  -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{"query":{"term":{"labels.run_id":"full-acceptance"}}}
JSON
```

重复执行相同 run ID 会生成相同事件 ID，但时间和 Trace ID 可能变化。
在同一写索引内，主配置的 `index` 动作会覆盖相同 `_id`，因此实验对账最好使用新 run ID。
测试重放时则有意复用源事件，记录覆盖与跨索引的边界。


#### 前置条件与供应链记录

需要 Docker Engine 和 Compose v2、Python 3.10+、Bash、curl；离线 Ruby 测试需要 Ruby。
Python 主脚本使用标准库，不要求安装 OpenSearch/Elastic SDK；静态 YAML 检查可使用已有 PyYAML，缺少时会明确标记受阻。

镜像固定应用版本，但 tag 仍不是不可变证明。
第一次拉取和构建后保存镜像 digest、Docker/Compose 版本、完整 Logstash 插件列表和配置哈希。
Kafka 压缩包校验使用基础实验相同的 SHA-512；若校验失败，停止构建，不关闭校验或随意替换下载文件。

```bash
docker version > evidence/docker-version.txt
docker compose version > evidence/compose-version.txt
docker compose config > evidence/compose-resolved.yaml
# 完成构建与拉取后记录；不要将含生产凭据的完整配置发布。
docker compose images --format json > evidence/images.json
docker compose exec -T logstash-es bin/logstash-plugin list --verbose > evidence/plugins-es.txt
docker compose exec -T logstash-os bin/logstash-plugin list --verbose > evidence/plugins-os.txt
```

主链路关闭认证以减少第一次实验的变量，并仅映射回环端口。
这不证明生产安全接入；TLS、写入身份、权限和隔离网关在双后端对照部分单独评审，需额外验收。


#### 完整复现顺序

```bash
bash run.sh precheck
bash run.sh start
# 先建立样本，再查询；每次使用新的批次和证据路径。
python3 tools/generate.py --run-id exp-first --count 100 --profile mixed
python3 tools/probe_v2.py es
python3 tools/probe_v2.py os
# 等待积压和多行超时完成后导出。第一次不完整时保留证据并换输出名重试。
python3 tools/export_audit.py export es --run-id exp-first --output evidence/es-exp-first.jsonl
python3 tools/export_audit.py audit --manifest logs/exp-first.manifest.json --input evidence/es-exp-first.jsonl
python3 tools/export_audit.py export os --run-id exp-first --output evidence/os-exp-first.jsonl
python3 tools/export_audit.py audit --manifest logs/exp-first.manifest.json --input evidence/os-exp-first.jsonl
```

探针只证明其当次事件路径，不代替整批事件对账。
主对账不自动 refresh 搜索索引，便于保留正常可见性行为；未稳定时应检查链路而不是把重试后的结果覆盖前次失败证据。
静态 `.manifest.json` 不是 Filebeat 日志源，避免被重复采集。

需要单独体验 OpenSearch 时，按同样依赖顺序只启动 `opensearch dashboards zookeeper kafka receiver filebeat logstash-os`，仍须先构建 Kafka/OS Logstash、创建 Topic、执行 OS 初始化与配置检查。
不要直接 `up` 全部服务后才安装模板，否则第一批事件可能抢先形成错误 Mapping。


#### 停止、重启和销毁

```bash
# 保留所有卷、源样本与证据。
bash run.sh stop
# 再次启动会保留既有受管资源，不重置 Kafka offset 或写别名。
bash run.sh start
# 只有明确放弃本项目数据时执行以下命令。
bash run.sh destroy DELETE-EXPANSION-DATA
```

销毁命令删除本 Compose 项目数据卷，不删除 `logs/` 和 `evidence/`。
再次创建新数据卷后，Filebeat 状态也重置，旧源文件可能被重新读取；这是新实验，不是已保留状态的恢复实验。
HA 生成文件具有另一套项目与卷名称，应使用其对应 Compose 文件单独收尾。


#### 对照实验完整文件：`run.sh`

预检查、启动、停止与带确认销毁。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: run.sh -->
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cmd=${1:-help}
case "$cmd" in
  precheck)
    command -v docker; command -v python3
    docker compose version
    docker info >/dev/null
    python3 -m compileall -q tools
    mkdir -p logs evidence
    docker compose config --quiet
    echo '还须核对 Docker 虚拟机内存、磁盘和 vm.max_map_count；本命令不自动修改宿主参数。'
    ;;
  start)
    bash ./run.sh precheck
    docker compose build zookeeper logstash-os
    docker compose up -d elasticsearch opensearch zookeeper kafka receiver
    python3 tools/wait_ready.py es
    python3 tools/wait_ready.py os
    ready=0
    for i in $(seq 1 90); do
      if docker compose exec -T kafka kafka-topics.sh --bootstrap-server kafka:9092 --list >/dev/null 2>&1; then ready=1; break; fi
      sleep 2
    done
    test "$ready" = 1 || { echo 'Kafka 未就绪' >&2; exit 1; }
    docker compose exec -T kafka kafka-topics.sh --bootstrap-server kafka:9092 \
      --create --if-not-exists --topic exp-logs-raw --partitions 3 --replication-factor 1 \
      --config retention.ms=259200000 --config message.timestamp.type=LogAppendTime
    python3 tools/init_backend.py es --apply
    python3 tools/init_backend.py os --apply
    docker compose run --rm --no-deps filebeat filebeat test config -e --strict.perms=false
    docker compose run --rm --no-deps logstash-es bin/logstash --config.test_and_exit -f /exp/es.conf
    docker compose run --rm --no-deps logstash-os bin/logstash --config.test_and_exit -f /exp/os.conf
    docker compose up -d filebeat logstash-es logstash-os kibana dashboards
    echo '组件已请求启动；接下来执行样本、双后端导出与对账，不把启动当作验收通过。'
    ;;
  stop) docker compose stop ;;
  destroy)
    test "${2:-}" = 'DELETE-EXPANSION-DATA' || { echo '销毁需输入 DELETE-EXPANSION-DATA；这会删除本项目数据卷。' >&2; exit 2; }
    docker compose down --volumes
    echo '只删除本 Compose 项目卷；logs/evidence 仍保留，需要另行审阅归档。'
    ;;
  *) echo '用法: bash run.sh precheck|start|stop|destroy DELETE-EXPANSION-DATA' ;;
esac
```


### 11.3 用共同样本验收双后端并保留失败证据
<a id="s-11-3"></a>

一条可见日志只证明一次成功路径。完整验收要使用已知的源事件集合，分别检查正常与隔离路由、重复、缺失、字段与查询完整性。双后端样本生成见 [2.4 节](01-log-foundations-and-collection.md#s-2-4)，导出和对账见 [9.4 节](02-pipeline-and-reliability.md#s-9-4)；下面将基础链路和对照链路的检查结果分开记录。

#### 主链路最终验收与学习结果

验收至少包含正常事件、字段错误、非法 JSON、历史时间和短期后端中断。
每种情况要验证原始记录、Kafka 消息、处理路由与 ES 文档，而不是只看容器状态。

| 场景 | 预期结果 | 重点字段 |
| --- | --- | --- |
| 正常访问 | 写入 `logs-lab` | 时间、状态、纳秒耗时 |
| 非法状态 | 写入 `logs-lab-quarantine` | 错误原因与原始值 |
| 非法 JSON | 有失败标签与兜底事件身份 | `event.original`、Kafka 位置 |
| 历史事件 | 保留历史业务时间 | created/ingested 与 timestamp |
| ES 暂停 | Kafka/PQ 出现可解释积压 | Lag、PQ、最新可见事件 |
| 规则回放 | 隔离目标中结果可比较 | event.id、规则版本 |

**查一条完整文档**

```bash
curl -fsS -X POST 'http://127.0.0.1:9200/logs-lab/_search?pretty' \
  -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{
  "size": 1,
  "sort": [{"event.ingested": "desc"}],
  "query": {"term": {"labels.run_id": "full-acceptance"}}
}
JSON
```

核对业务字段是否变成正确类型，上游多值是否仍被保留，以及原始记录是否能解释全部转换。
同时确认 `event.ingested` 由 ES Ingest 生成，不是误复制业务时间。

本篇完成后，你应能解释 Kafka 的消息保留与消费提交，理解 Logstash 的事件/队列边界，并维护一条有失败可见性的日志加工链路。
后续学习将把这条链路的存储模型、生命周期与查询方式补齐。


#### 两后端共同验收矩阵

每一格必须填写“通过、失败、未执行、受阻”之一，并链接真实证据。
下表是本次交付时的真实组件执行状态，不是预填成功结果。

| 验收项 | Elastic 真实环境 | OpenSearch 真实环境 | 证据要求 |
| --- | --- | --- | --- |
| 镜像与插件精确版本 | 未执行 | 未执行 | root/version、完整插件列表、镜像 digest |
| 源文件与 Filebeat 读取 | 未执行 | 未执行 | 文件清单、采集日志、事件 ID |
| Kafka 完整消息与消费组 | 未执行 | 未执行 | Topic/partition/offset、Lag |
| 正常字段转换 | 未执行 | 未执行 | ID、单位、类型、字段值 |
| 非法 JSON / 类型隔离 | 未执行 | 未执行 | 原文、身份、pipeline.errors、隔离位置 |
| 多行异常 | 未执行 | 未执行 | 单事件与完整堆栈 |
| 正常/隔离集合对账 | 未执行 | 未执行 | manifest、完整导出、对账 JSON |
| 相同 ID 重放 | 未执行 | 未执行 | 同索引覆盖；跨滚动另测 |
| Query DSL / 聚合 | 未执行 | 未执行 | 等价性和分片完整性 |
| ILM / ISM | 未执行 | 未执行 | 策略、别名、状态、转层、删除过程 |
| 重启、暂停、恢复 | 未执行 | 未执行 | 故障前后 ID、延迟与队列 |
| 热温节点与故障域 | 未执行 | 未执行 | 分片位置、管理多数、入口成功率 |
| 原生监控/Painless | 不适用：公共评估器路径 | 未执行 | 原生执行/触发/action errors |
| 公共业务告警 | 未执行 | 未执行 | FIRING/REMINDER/RESOLVED/UNKNOWN |
| Kibana / Dashboards | 未执行 | 未执行 | 语言模式、时间、查询、截图或导出对象 |
| TLS / 最小权限 | 未执行 | 未执行 | 正常、错误证书、越权三类测试 |

“不适用”用于明确没有选择该机制，不是第五种测试结果。
真正执行某格时仍使用四种状态；未选择的机制无需假装测试过。


### 11.4 区分静态、模拟和真实测试并复跑离线回归
<a id="s-11-4"></a>

文档里的代码先接受离线检查，再接受真实组件和端到端测试。静态解析不能验证插件参数，模拟 API 不能证明搜索引擎行为，纯 Ruby 也不等于 JRuby 中的 Logstash Event。完整测试与记录器保存在本节，提取全部文件后从实验根目录执行。

#### 离线检查与真实验收的边界

原扩展交付记录完成 Python 语法、Ruby 语法、Bash 语法、完整 YAML/JSON 解析与 Markdown 结构检查。
原扩展交付记录的 `unittest` 执行 72 项，通过 72 项；其中调用了真实 Ruby 解释器验证纯转换函数，但**没有启动 Logstash Event/插件运行时**。
PIT/Scroll 测试使用假响应，验证产品端点分支和清理路径，不证明真实搜索引擎已接受请求。

```bash
python3 tools/static_check.py
python3 -m unittest discover -s tests -v
# 用记录器留存本地执行信息；目录必须是新的。
python3 tools/record.py --tier 模拟测试 --directory evidence/mock-run-01 -- \
  python3 -m unittest discover -s tests -v
```

[相关章节](02-pipeline-and-reliability.md#s-11-1)中的客户端还没有使用真实后端完成 TLS 握手、原生脚本执行或输出插件依赖解析。
这些不确定性由本地真实层验收消除，不通过增加模拟测试数字掩盖。


#### 证据分层与命令退出码

| 层次 | 本次状态 | 能证明什么 | 不能证明什么 |
| --- | --- | --- | --- |
| 静态检查 | 通过 | 已检查文件的语法和结构 | 插件或服务一定接受所有参数 |
| 模拟测试 | 通过 | 转换、边界、状态和分页逻辑在夹具上符合预期 | 与真实后端协议完全一致 |
| 真实单组件 | 未执行 | 本地执行后才可填写 | 本次不能填写“通过” |
| 真实端到端 | 未执行 | 本地执行后才可填写 | 组件 Up 不等于完整链路通过 |
| UI 验收 | 未执行 | 本地人工或浏览器验证后填写 | API 响应不等于看板正确 |

当前工作环境没有 Docker 命令，因此镜像运行和组件测试存在环境限制。
没有尝试启动的具体测试记“未执行”；某次实际命令因缺工具而无法运行才记“受阻”。
不要把“应该通过”写进 `status`。

`record.py` 保存命令、退出码、时间、stdout/stderr 和配置哈希，不保存整个环境变量字典，避免泄露凭据。
仍应审阅输出中是否包含敏感日志、token 或账号；把实际生产数据作为输入时，证据也需要访问控制和清理期限。


#### 交接到本地的顺序

先审阅版本与资源，再提取文件、跑静态/模拟测试、构建镜像、核对插件，最后逐项做真实单组件、完整链路、故障和 UI 验收。
每次只修改一组配置，使用新证据目录。
发现兼容问题时，先记录“失败/受阻”、原版本和错误，再评审变更；不要静默改成 floating latest。

正文合并不等于运行验证完成。
四篇正文、实验代码和路线图的完成状态分别记录；文档重组不产生新的真实组件验收结论。
本次重组与验证记录见[合并说明](../../../docs/specs/elk-expansion-integration-notes.md)。


#### 对照实验完整文件：`tools/record.py`

命令、配置哈希与分层证据。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tools/record.py -->
```python
"""运行命令并留证。退出码为零只表示该命令通过，不越级证明 E2E。"""
from __future__ import annotations
import argparse,hashlib,json,os,subprocess,sys,time
from datetime import datetime,timezone
from pathlib import Path

def record(directory:Path, tier:str, command:list[str], timeout:int=600):
    if not command:raise ValueError('需要命令')
    if tier not in ('静态检查','模拟测试','真实单组件','真实端到端','UI验收'):raise ValueError(tier)
    if any('password=' in x.lower() or 'authorization:' in x.lower() for x in command):
        raise ValueError('命令包含疑似密码；改用受控环境变量，不把秘密写入证据')
    directory.mkdir(parents=True,exist_ok=False)
    started=datetime.now(timezone.utc).isoformat();t=time.monotonic()
    status,code='受阻',None
    try:
        with (directory/'stdout.txt').open('wb') as out,(directory/'stderr.txt').open('wb') as err:
            result=subprocess.run(command,stdout=out,stderr=err,timeout=timeout,check=False)
        code=result.returncode;status='通过' if code==0 else '失败'
    except (OSError,subprocess.TimeoutExpired) as exc:
        (directory/'blocked.txt').write_text(str(exc),encoding='utf-8')
    hashes={}
    for folder in ('tools','logstash','filebeat','kafka'):
        for path in sorted(Path(folder).rglob('*')):
            if path.is_file() and '__pycache__' not in path.parts:
                hashes[str(path)]=hashlib.sha256(path.read_bytes()).hexdigest()
    report={'tier':tier,'status':status,'command':command,'cwd':os.getcwd(),
            'started_at':started,'elapsed_seconds':time.monotonic()-t,'exit_code':code,
            'config_sha256':hashes,'evidence_directory':str(directory)}
    (directory/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--directory',required=True);p.add_argument('--tier',required=True)
    p.add_argument('--timeout',type=int,default=600);p.add_argument('command',nargs=argparse.REMAINDER);a=p.parse_args()
    cmd=a.command[1:] if a.command[:1]==['--'] else a.command
    r=record(Path(a.directory),a.tier,cmd,a.timeout);print(json.dumps(r,ensure_ascii=False,indent=2))
    raise SystemExit(0 if r['status']=='通过' else 1)
```


#### 对照实验完整文件：`tests/normalize_cli.rb`

纯 Ruby 逻辑测试入口，不是 Logstash 运行时。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tests/normalize_cli.rb -->
```ruby
require_relative '../logstash/normalize'
STDIN.each_line do |line|
  row=JSON.parse(line)
  puts JSON.generate(normalize_record(row.fetch('raw'),row.fetch('fields'),row.fetch('kafka',{}),row.fetch('collected')))
end
```


#### 对照实验完整文件：`tests/test_core.py`

离线逻辑、边界、分页和告警状态回归。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tests/test_core.py -->
```python
"""离线逻辑/模拟 API 回归。没有模拟一个真实搜索引擎或插件运行时。"""
from __future__ import annotations
import copy,json,subprocess,sys,tempfile,unittest
from datetime import datetime,timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from client import Client,complete_search,check_bulk
from generate import generate
from export_audit import audit,export,read_manifest
from lifecycle import policy
from alerts import query,evaluate,transition
from native_alerts import monitors
from native_control import change_enabled
from make_ha import topology
from cost import capacity
from performance import percentile,documents
from query_cases import pit_export
ROOT=Path(__file__).resolve().parents[1]
NOW=datetime(2026,9,25,12,tzinfo=timezone.utc)

def search(count=25,errors=5,exceptions=5,heartbeat=1,witness=1):
    return {'timed_out':False,'_shards':{'total':1,'successful':1,'failed':0},
            'aggregations':{'window':{'valid':{'doc_count':count},'errors':{'doc_count':errors},
             'exceptions':{'doc_count':exceptions},'heartbeat':{'doc_count':heartbeat}},'witness':{'doc_count':witness}}}

def normalize(rows):
    args=['ruby',str(ROOT/'tests/normalize_cli.rb')]
    result=subprocess.run(args,input=''.join(json.dumps(r)+'\n' for r in rows),text=True,capture_output=True,check=True)
    return [json.loads(line) for line in result.stdout.splitlines()]

class Contracts(unittest.TestCase):
    def test_version_guard(self):
        c=Client('os');c.request=lambda *a,**k:{'cluster_name':'production','version':{'number':'2.19.6','distribution':'opensearch'},'cluster_uuid':'x'}
        with self.assertRaises(RuntimeError):c.guard()
    def test_version_exact(self):
        c=Client('es');c.request=lambda *a,**k:{'cluster_name':'elk-expansion-es','version':{'number':'7.17.28'},'cluster_uuid':'x'}
        with self.assertRaises(RuntimeError):c.guard()
    def test_credentials_in_url(self):
        with self.assertRaises(ValueError):Client('es','http://user:password@localhost:9200')
    def test_search_timeout(self):
        r=search();r['timed_out']=True
        with self.assertRaises(RuntimeError):complete_search(r)
    def test_partial_shards(self):
        r=search();r['_shards']['failed']=1
        with self.assertRaises(RuntimeError):complete_search(r)
    def test_missing_shards(self):
        r=search();del r['_shards']
        with self.assertRaises(RuntimeError):complete_search(r)
    def test_bulk_count(self):
        with self.assertRaises(RuntimeError):check_bulk({'errors':False,'items':[]},1)
    def test_bulk_item_error(self):
        with self.assertRaises(RuntimeError):check_bulk({'errors':True,'items':[{'index':{'status':400}}]},1)
    def test_bulk_success(self):
        self.assertEqual(check_bulk({'errors':False,'items':[{'index':{'status':201}}]},1)['errors'],False)
    def test_illegal_run(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):generate(Path(d),'../escape')
    def test_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            generate(Path(d),'same',10)
            with self.assertRaises(FileExistsError):generate(Path(d),'same',10)
    def test_manifest_count(self):
        with tempfile.TemporaryDirectory() as d:
            r=generate(Path(d),'fixture',100,'mixed',NOW)
            self.assertEqual(r['unique_expected_events'],103);self.assertEqual(r['transport_records'],104)
            self.assertEqual(sum(x['route']=='quarantine' for x in r['events'].values()),10)
    def test_real_ruby_mock_pipeline(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);m=generate(root,'ruby-fixture',40,'mixed',NOW)
            rows=[{'raw':x,'fields':{'environment':'lab'},'kafka':{'topic':'t','partition':0,'offset':i},'collected':NOW.isoformat()}
                  for i,x in enumerate((root/'ruby-fixture.jsonl').read_text().splitlines())]
            rows.append({'raw':(root/'ruby-fixture.java.log').read_text(),
                'fields':{'environment':'lab','log_kind':'java.application'},'kafka':{'topic':'t','partition':0,'offset':42},'collected':NOW.isoformat()})
            docs=normalize(rows)
            # 模拟 index action 对相同 ID 覆盖；不是模拟 Elasticsearch/Lucene。
            unique={d['event']['id']:d for d in docs}
            hits=[{'_id':i,'_index':('exp-logs-' if doc['pipeline']['route']=='normal' else 'exp-quarantine-')+'000001','_source':doc} for i,doc in unique.items()]
            self.assertEqual(audit(m,hits)['status'],'通过')
            self.assertEqual(audit(m,hits[:-1])['status'],'失败')
            self.assertEqual(audit(m,hits+[hits[0]])['status'],'失败')
    def test_manifest_file_integrity(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);generate(root,'integrity',10,'normal',NOW)
            self.assertEqual(read_manifest(root/'integrity.manifest.json')['run_id'],'integrity')
    def test_changed_source_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);generate(root,'integrity',10,'normal',NOW)
            (root/'integrity.jsonl').write_text('tampered')
            with self.assertRaises(ValueError):read_manifest(root/'integrity.manifest.json')
    def test_native_toggle_preserves_ids(self):
        class FakeMonitor:
            def __init__(self):self.written=None
            def request(self,method,path,body=None):
                if method=='GET':return {'_seq_no':4,'_primary_term':1,'monitor':{
                    'name':'exp-test','enabled':False,'triggers':[{'id':'trigger-original','actions':[{'id':'action-original'}]}]}}
                self.written=(path,body);return {'result':'updated'}
        c=FakeMonitor();change_enabled(c,{'id':'test-id','name':'exp-test'},True)
        self.assertIn('if_seq_no=4',c.written[0]);self.assertEqual(c.written[1]['triggers'][0]['id'],'trigger-original')
        self.assertTrue(c.written[1]['enabled'])
    def test_native_toggle_rejects_name_change(self):
        class FakeMonitor:
            def request(self,*a,**k):return {'monitor':{'name':'production-rule'}}
        with self.assertRaises(RuntimeError):change_enabled(FakeMonitor(),{'id':'test-id','name':'exp-test'},False)
    def test_empty_audit(self):
        with self.assertRaises(ValueError):audit({'events':{}},[])
    def test_ha_fault_domains(self):
        for backend in ('es','os'):
            t=topology(backend);self.assertEqual(len(t['services']),6)
            for v in t['services'].values():self.assertIn('127.0.0.1:',v['ports'][0])
    def test_no_bootstrap_after_join(self):
        for backend in ('es','os'):
            for v in topology(backend,True)['services'].values():
                self.assertFalse(any('initial_' in k for k in v['environment']))
    def test_policy_api_separation(self):
        self.assertIn('phases',policy('es')['policy']);self.assertIn('states',policy('os')['policy'])
        self.assertNotIn('phases',policy('os')['policy'])
    def test_policy_delete_lab_scope(self):
        self.assertEqual(policy('os')['policy']['ism_template'][0]['index_patterns'],['exp-cycle-*'])
    def test_tiered_migrate_disabled(self):
        self.assertFalse(policy('es',True)['policy']['phases']['warm']['actions']['migrate']['enabled'])
    def test_percentile(self):self.assertEqual(percentile([1,2,3],.5),2)
    def test_empty_percentile(self):self.assertIsNone(percentile([],.95))
    def test_capacity_fault_headroom(self):
        args=[100,1.2,7,1,3,1,.7,200,900,100]
        a=capacity(*args);args[5]=0;b=capacity(*args)
        self.assertGreater(a['minimum_disk_gib_per_surviving_node'],b['minimum_disk_gib_per_surviving_node'])
    def test_capacity_no_survivors(self):
        with self.assertRaises(ValueError):capacity(1,1,1,1,3,3,.7,0,0,1)
    def test_capacity_nan(self):
        with self.assertRaises(ValueError):capacity(1,1,1,1,3,1,.7,float('nan'),0,1)
    def test_native_disabled_by_default(self):
        for m in monitors('channel'):self.assertFalse(m['enabled'])
    def test_native_fixed_bounds(self):
        q=query(NOW,native=True);self.assertEqual(q['aggs']['window']['filter']['range']['@timestamp']['lt'],'{{period_end}}||-1m')
    def test_query_filter_contract(self):
        q=query(NOW,'run');self.assertIn({'term':{'labels.run_id':'run'}},q['query']['bool']['filter'])
    def test_documents_repeatable(self):self.assertEqual(documents(20,'x'),documents(20,'x'))

class AlertTests(unittest.TestCase):
    def test_firing(self):self.assertEqual(evaluate(search())[0]['error-ratio'],'ALERT')
    def test_healthy(self):self.assertEqual(evaluate(search(errors=0,exceptions=0))[0]['error-ratio'],'OK')
    def test_low_traffic_unknown(self):self.assertEqual(evaluate(search(count=5,errors=1))[0]['error-ratio'],'UNKNOWN')
    def test_witness_missing_unknown(self):self.assertTrue(all(x=='UNKNOWN' for x in evaluate(search(witness=0))[0].values()))
    def test_heartbeat_missing(self):self.assertEqual(evaluate(search(heartbeat=0))[0]['heartbeat-missing'],'ALERT')
    def test_partial_does_not_recover(self):
        r=search();r['_shards']['failed']=1
        with self.assertRaises(RuntimeError):evaluate(r)
    def test_invalid_counts(self):
        with self.assertRaises(ValueError):evaluate(search(count=2,errors=5))
    def test_open_incident(self):self.assertEqual(transition(None,'ALERT',1000)[1],'FIRING')
    def test_dedup(self):
        s,_=transition(None,'ALERT',1000);self.assertIsNone(transition(s,'ALERT',1060)[1])
    def test_reminder(self):
        s,_=transition(None,'ALERT',1000);self.assertEqual(transition(s,'ALERT',1601)[1],'REMINDER')
    def test_unknown_preserves_incident(self):
        s,_=transition(None,'ALERT',1000);new,notice=transition(s,'UNKNOWN',1100)
        self.assertTrue(new['active']);self.assertIsNone(notice)
    def test_recovery(self):
        s,_=transition(None,'ALERT',1000);new,notice=transition(s,'OK',1200)
        self.assertFalse(new['active']);self.assertEqual(notice,'RESOLVED')
    def test_unknown_then_recovery(self):
        s,_=transition(None,'ALERT',1000);s,_=transition(s,'UNKNOWN',1100)
        self.assertEqual(transition(s,'OK',1200)[1],'RESOLVED')

class FakeAPI:
    def __init__(self,backend,fail=False):self.backend=backend;self.calls=[];self.page=0;self.fail=fail
    def guard(self):return {}
    def request(self,method,path,body=None,**kw):
        self.calls.append((method,path,body))
        if method=='DELETE':return {'succeeded':True,'pits':[{'successful':True}]}
        if method=='POST' and ('point_in_time?' in path or '/_pit?' in path):return {'id':'es-pit','pit_id':'os-pit'}
        self.page+=1
        return {'timed_out':False,'_shards':{'failed':1 if self.fail else 0},
                '_scroll_id':'scroll','pit_id':'pit-new','hits':{'total':{'value':1,'relation':'eq'},
                'hits':[{'_index':'exp-logs-000001','_id':'x','_source':{'event':{'id':'x'}},'sort':['x']}] if self.page==1 else []}}
class PagingTests(unittest.TestCase):
    def test_os_pit_paths(self):
        c=FakeAPI('os');self.assertEqual(len(pit_export(c,'exp-perf-x')),1)
        self.assertIn('/_search/point_in_time?',c.calls[0][1]);self.assertIn('pit_id',c.calls[-1][2])
    def test_es_pit_paths(self):
        c=FakeAPI('es');self.assertEqual(len(pit_export(c,'exp-perf-x')),1)
        self.assertIn('/_pit?',c.calls[0][1]);self.assertIn('id',c.calls[-1][2])
    def test_pit_closed_on_failure(self):
        c=FakeAPI('os',True)
        with self.assertRaises(RuntimeError):pit_export(c,'exp-perf-x')
        self.assertEqual(c.calls[-1][0],'DELETE')
    def test_scroll_export(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'out.jsonl';r=export(FakeAPI('es'),'run',p)
            self.assertTrue(r['complete']);self.assertEqual(len(p.read_text().splitlines()),1)
    def test_scroll_partial_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'out.jsonl'
            with self.assertRaises(RuntimeError):export(FakeAPI('os',True),'run',p)
            self.assertFalse(p.exists());self.assertTrue(p.with_name(p.name+'.partial').exists())

# 每一个数值边界作为独立 unittest，测试总数不把 subTest 偷算成更多测试。
def numeric_case(value,field,valid):
    def test(self):
        event={'time':NOW.isoformat(),'event_id':'case-1','run_id':'case','service':'orders-api',
               'kind':'access','status':200,'request_time':'0.010','message':'test'}
        event[field]=value
        raw=json.dumps({'run_id':'case','event_id':'case-1','scenario':'numeric','payload':json.dumps(event)})
        d=normalize([{'raw':raw,'fields':{'environment':'lab'},'kafka':{},'collected':NOW.isoformat()}])[0]
        self.assertEqual(d['pipeline']['route']=='normal',valid)
    return test
for i,(field,value,valid) in enumerate([
    ('uri','',True),('uri','?a=1',True),('status',200,True),('status','504',True),('status','-',True),('status',None,True),
    ('status',True,False),('status',99,False),('status',600,False),('status',[],False),
    ('request_time','0',True),('request_time','.1',True),('request_time','1e-3',True),
    ('request_time','-1',False),('request_time','NaN',False),('request_time','Infinity',False),
    ('request_time',{},False),('request_time','9223372037',False),('request_time','-',True),
    ('time','2026-09-25 12:00:00',False),('trace_id','0'*32,False),('trace_id','a'*32,True)
]):setattr(Contracts,f'test_normalize_boundary_{i:02d}',numeric_case(value,field,valid))

if __name__=='__main__':unittest.main(verbosity=2)
```


#### 对照实验完整文件：`tools/static_check.py`

Python/Ruby/Bash/YAML 静态检查。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tools/static_check.py -->
```python
"""本地静态检查；不将 YAML 解析当作产品语义验证。"""
import ast,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
checks=[]
for path in sorted(ROOT.rglob('*.py')):
    if '__pycache__' in path.parts:continue
    ast.parse(path.read_text(),filename=str(path));checks.append(str(path.relative_to(ROOT)))
for path in sorted(ROOT.rglob('*.rb')):
    subprocess.run(['ruby','-c',str(path)],check=True,capture_output=True);checks.append(str(path.relative_to(ROOT)))
for path in sorted(ROOT.glob('*.sh')):
    subprocess.run(['bash','-n',str(path)],check=True);checks.append(str(path.relative_to(ROOT)))
for path in sorted(ROOT.glob('*.json')):
    json.loads(path.read_text());checks.append(str(path.relative_to(ROOT)))
try:
    import yaml
except ImportError:
    yaml_state='受阻：未安装 PyYAML；仍须 docker compose config 和组件配置检查'
else:
    class UniqueLoader(yaml.SafeLoader):pass
    def unique_mapping(loader,node,deep=False):
        out={}
        for k,v in node.value:
            key=loader.construct_object(k,deep=deep)
            if key in out:raise ValueError(f'重复 YAML 键 {key}')
            out[key]=loader.construct_object(v,deep=deep)
        return out
    UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,unique_mapping)
    for path in sorted(ROOT.rglob('*')):
        if path.suffix in ('.yaml','.yml'):
            list(yaml.load_all(path.read_text(),Loader=UniqueLoader));checks.append(str(path.relative_to(ROOT)))
    yaml_state='通过：语法及重复键检查；不证明插件接受配置'
print(json.dumps({'status':'通过','checked_files':checks,'yaml':yaml_state,
                  'not_run':['Docker Compose runtime','Logstash configuration loader','OpenSearch API','UI']},ensure_ascii=False,indent=2))
```
