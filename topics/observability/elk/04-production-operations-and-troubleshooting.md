# ELK 与 OpenSearch 日志平台学习笔记 · 第四篇：生产架构、成本治理、告警与故障排查

> 教学基线：Elastic Stack 7.17.29、Kafka 2.8.2 ZooKeeper 模式；双后端对照采用 OpenSearch / Dashboards 2.19.6。固定版本用于教学，不表示生产推荐或联合认证。
> 配置与脚本完整保留在四篇 Markdown；对照实验从[文件索引与提取入口](02-pipeline-and-reliability.md#s-11-1)准备。基础实验和对照实验使用独立目录、端口、数据卷及脚本。
> 验证边界：静态与离线逻辑测试不能替代真实组件、TLS、故障、性能与 UI 验收。具体状态见[专题说明](README.md)。

[返回专题](README.md) · [第1篇](01-log-foundations-and-collection.md) · [第2篇](02-pipeline-and-reliability.md) · [第3篇](03-search-storage-and-visualization.md)

| 章节 | 核心主题 |
| --- | --- |
| 18 | 多节点架构与故障域 |
| 19 | 冷热分层、容量与成本 |
| 20 | 分段调优与混合负载验证 |
| 21 | 平台监控、探针与业务日志告警 |
| 22 | 安全连接、权限与日志治理 |
| 23 | 备份恢复、节点维护与版本变更 |
| 24 | 故障排查与综合验收 |

## 第 18 章 · 多节点架构与故障域

### 18.1 区分选举、数据冗余和客户端入口的可用性
<a id="s-18-1"></a>

#### 节点角色与主节点选举

7.17 可以通过 `node.roles` 明确配置节点角色。
Master-eligible 节点参与集群管理与选举，数据节点保存分片，Ingest 角色执行接入管道，协调工作则发生在接收请求的节点上。[节点角色](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/modules-node.html)

| 角色或职责 | 关注内容 | 不应误解为 |
| --- | --- | --- |
| Master-eligible | 集群状态、索引和分片管理 | 每条日志都先写入主节点 |
| Data | 文档存储、检索、聚合 | 只负责磁盘、不消耗 CPU |
| Ingest | 写入前字段处理 | 具备 Kafka 式长期缓冲能力 |
| Coordinating | 拆分请求、汇总结果 | 配置独立角色就自动获得无限查询容量 |
| Data tier | Hot、Warm 等数据层 | 配置名称后数据一定有地方迁移 |

实验单节点同时承担多种职责，便于理解。
拆角色需要足够节点和维护能力，不是越早拆越专业。

**选举多数与故障容忍**

生产常见做法是部署三个位于独立故障域的 master-eligible 节点，避免单个节点故障导致无法选主。
但“三台虚拟机在同一宿主机”不能抵抗宿主机故障。
选举、投票配置和数据副本是不同维度，不能用“副本还有两份”证明集群一定能维持管理能力。

**查看节点角色**

```bash
curl -fsS 'http://127.0.0.1:9200/_nodes?filter_path=nodes.*.name,nodes.*.roles&pretty'
curl -fsS 'http://127.0.0.1:9200/_cat/master?v'
```

节点 ID、节点名称、集群 UUID 都值得进入变更记录。
同名节点不意味着同一个数据目录，同名集群也不意味着同一个集群 UUID。


#### 三条相互独立的可用性链路

一个三节点搜索集群，仍可能因为单个反向代理失效而不可访问。
一个副本齐全的集群，也可能因为失去集群管理投票多数而不能安全推进写入或集群状态。
“数据还有一份”与“服务还能继续处理请求”需要分别证明。

| 层面 | 保护什么 | 不能替代什么 |
| --- | --- | --- |
| 集群管理/选举 | 节点成员、分片分配与集群状态推进 | 不自动增加日志正文副本 |
| 主副分片 | 已接受数据的冗余和读取路径 | 不保证客户一定能连到健康入口 |
| 客户端多地址/入口 | 请求抵达健康接收节点 | 不修复未分配主分片或投票失效 |
| 上游持久缓冲 | 搜索后端不可用时保留待处理事件 | 不替代已写入数据的快照 |
| 快照与独立归档 | 恢复到另一个可用集群 | 不等于实时在线副本或零恢复时间 |

本篇讨论的是失效模型：进程、节点、宿主、机架/可用区、网络、磁盘或误删除。
对不同失效模型，保护机制和验证办法不同。
节点角色及集群发现按产品版本分别配置；OpenSearch 使用 `cluster_manager` 术语，旧 ES 使用 `master`。[OS 集群配置](https://docs.opensearch.org/2.19/tuning-your-cluster/) [ES 集群分配](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/modules-cluster.html)


#### 管理节点、数据节点与协调职责

生产规模较大时，可以将集群管理职责从繁重的写入与查询任务分离。
管理节点需要稳定的 CPU、内存和网络，不应成为普通 Bulk 客户端的默认目标。
数据节点负责保存和搜索分片；接收查询的节点还承担协调与合并结果的责任。

“协调节点”不总是一种必须单独部署的产品组件。
独立协调层可以隔离连接与结果合并压力，也会增加一组需要监控、负载均衡和容量规划的节点。
小规模教学中让热数据节点同时具备管理资格，是降低资源需求的选择，不是生产拓扑的唯一建议。

```mermaid
flowchart TD
  LS[多个 Logstash 实例] --> IN[多地址或高可用接入层]
  IN --> H1[热数据区 A]
  IN --> H2[热数据区 B]
  IN --> H3[热数据区 C]
  M1[管理资格 A] --- M2[管理资格 B]
  M2 --- M3[管理资格 C]
  H1 --> W[温层数据节点]
  H2 --> W
  H3 --> W
```

图中每个“区”只有在实际位于不同物理故障域时，才具有相应隔离意义。
同一宿主的三个容器加上不同字符串标签，不会抵御该宿主失效。


#### 一主两副不等于可以随便停两台

一主两副让每个分片有三份逻辑副本，但实际是否全部分配、是否位于不同故障域、是否有足够健康的管理节点，都决定故障后的行为。
如果三份都在同一可用区，失去该区仍可能丢失全部在线副本。
如果只有一份已分配，配置里写着两个副本也没有产生另外两份数据。

验收时要同时记录：集群管理成员、每个主副分片位置、客户端成功率和新事件可见性。
绿色只能说明当前分片分配满足要求，不证明入口、高峰性能、快照或整个业务链路都正常。
黄色也不能一律解释为“不可读写”；需要看缺少的是副本还是主分片，以及写入确认条件。


#### 端到端剩余单点

双后端对照主链路只有单 broker Kafka、单 ZooKeeper，以及每个后端一个 Logstash 实例。
它们用于对照，不是 Kafka 生产高可用示范。
即便后端改为六节点，也仍需要说明这些上游单点。

| 依赖 | 实验中的单点 | 生产评审问题 |
| --- | --- | --- |
| Kafka / ZooKeeper | 单实例 | 副本、ISR、选举、保留与恢复能力 |
| Logstash | 每分支一个进程 | 多消费者、分区数、PQ 归属、优雅停止 |
| Filebeat | 每个日志源一个采集状态 | 节点失效后源文件能否恢复 |
| 入口/DNS | 单地址可能失效 | 多地址、DNS TTL、健康检查与连接重试 |
| 监控告警 | 若依赖同一故障系统 | 是否有独立指标与通知通道 |

本篇不把这些问题扩展成另一部 Kafka 运维教程，但必须把它们写进高可用评审的剩余风险。


#### 客户端多地址的实质

LS output 的多个 `hosts` 提供连接候选和客户端调度，不等价于跨区健康流量策略。
仍需核对失效连接回收、重试、DNS 缓存和是否包含不应承受 Bulk 的专用管理节点。[OS output 连接参数](https://github.com/opensearch-project/logstash-output-opensearch/blob/2.0.3/lib/logstash/plugin_mixins/opensearch/api_configs.rb)

HA 教学中热节点同时是数据节点，因此可以作为小规模写入入口。
正式拆分管理节点后，客户端只连接合格的数据/协调入口。
验收应故意停掉首选地址，看客户端能否切换，再确认请求成功与事件可查；只观察 TCP 重连不够。


### 18.2 构建六节点教学集群并管理首次引导配置
<a id="s-18-2"></a>

首次引导只用于建立新的集群身份。基础 ES 配置片段解释这个规则；双后端 HA 生成器进一步给出六节点、三故障域标签的教学拓扑。所有容器仍运行在同一宿主，标签和多进程不能证明真实跨机容灾。

#### 首次引导与已有集群重启

首次组建多节点集群，需要明确初始 master-eligible 节点列表。
集群形成后应移除 `cluster.initial_master_nodes`，不要在已有集群重启、扩容或故障恢复时重新用它引导一个独立集群。[首次引导](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/modules-discovery-bootstrap-cluster.html)

以下是三节点教学配置片段，不是可以直接替换单节点 Compose 的完整生产清单。
三台节点的 `cluster.name` 相同，`node.name` 各不相同。
主机名、IP 和证书 SAN 必须由实际环境提供。

```yaml
# es-1 的首次启动配置片段。
cluster.name: logging-prod-example
node.name: es-1
node.roles: [master, data, ingest]
path.data: /var/lib/elasticsearch
path.logs: /var/log/elasticsearch
network.host: 10.0.10.11
http.port: 9200
transport.port: 9300
discovery.seed_hosts:
  - 10.0.10.11:9300
  - 10.0.10.12:9300
  - 10.0.10.13:9300
cluster.initial_master_nodes:
  - es-1
  - es-2
  - es-3
```

另外两台分别使用 `es-2`、`es-3` 和自己的绑定地址。
启用安全的完整多节点配置还需要传输层 TLS，见[相关章节](04-production-operations-and-troubleshooting.md#s-22-1)。
不能把上述未配置认证的片段直接暴露到生产网络。

**成功引导后的动作**

确认三个节点处于同一 cluster UUID，并产生稳定主节点。
在配置管理中移除 `cluster.initial_master_nodes`，保留用于发现的 `discovery.seed_hosts`。
随后重启按已有集群的滚动维护流程执行，而不是再次生成初始集群。

**扩容不是重新引导**

新节点使用同一集群名称和正确的发现地址，通过已有集群加入。
不要复制另一节点已经使用的数据目录。
不要删除原节点数据目录来“解决 UUID 不一致”，除非已经证明目标是可丢弃实验数据，并有明确重建计划。


#### 教学拓扑及其验证范围

完整 `tools/make_ha.py` 根据参数输出一份 Compose JSON，Compose 可直接读取 JSON 格式。
每个产品分别建立六节点，不把两个产品加入同一集群。

| 节点集合 | 标签 | 管理资格 | 数据职责 |
| --- | --- | --- | --- |
| `*-hot-a/b/c` | temp=hot，zone=a/b/c | 有 | 热层写入与查询 |
| `*-warm-a/b/c` | temp=warm，zone=a/b/c | 无 | 滚动后迁移的索引 |

ES 教学节点使用通用 `data` 角色配合自定义 `temp` 属性；OpenSearch 同样使用 `data` 和属性分配。
这样可直接观察两个产品共有的属性约束。
ES 原生 `data_hot/data_warm` 角色和 `_tier_preference` 另在[相关章节](04-production-operations-and-troubleshooting.md#s-19-1)比较，不能与自定义属性实验混接。

实例 HTTP 端口为 ES `19300～19305`，OS `29300～29305`，只绑定回环地址。
每节点 512MiB Heap、2GiB 容器上限是小数据教学预算；真实分片规模需要重新测量。
单个六节点实验为搜索容器预留至少 12GiB 上限空间，宿主还需要系统和文件缓存余量。


#### 启动、形成集群与移除首次引导设置

```bash
# 先停止不用的单节点环境，避免内存竞争。
bash run.sh stop
python3 tools/make_ha.py os > compose-ha-os.json
# 使用生成文件的固定项目名，不混用主项目 compose.yaml。
docker compose -f compose-ha-os.json up -d
python3 tools/wait_ready.py os --url http://127.0.0.1:29300 --seconds 300
curl -fsS 'http://127.0.0.1:29300/_cat/nodes?format=json'
curl -fsS 'http://127.0.0.1:29300/_cluster/health?pretty'
```

只有出现六个预期节点且共享同一 cluster UUID，才进入后续实验。
首次引导列表不是日常种子列表；集群形成后，用 `--joined` 生成不含首次引导字段的配置并在后续维护中采用。
不能在已有集群失去多数时，通过重新填引导列表制造一个新的集群身份。

```bash
python3 tools/make_ha.py os --joined > compose-ha-os-joined.json
# 此时先审阅两个文件差异；后续滚动更新使用 joined 文件，保持项目和卷名称相同。
docker compose -f compose-ha-os-joined.json config --quiet
```

ES 操作相同，只将生成器参数替换为 `es`，入口改成 `19300`。
配置中的首次引导键是 `cluster.initial_master_nodes`；OpenSearch 使用 `cluster.initial_cluster_manager_nodes`。


#### 对照实验完整文件：`tools/make_ha.py`

ES/OS 六节点完整 Compose 生成器。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tools/make_ha.py -->
```python
"""输出完整多节点 Compose JSON（Compose 同样接受 JSON），不访问后端。"""
from __future__ import annotations
import argparse,json

def topology(backend: str, joined=False):
    if backend not in ('es','os'):raise ValueError(backend)
    root='/usr/share/elasticsearch' if backend=='es' else '/usr/share/opensearch'
    image='docker.elastic.co/elasticsearch/elasticsearch:7.17.29' if backend=='es' else 'opensearchproject/opensearch:2.19.6'
    managers=','.join(f'{backend}-hot-{z}' for z in 'abc')
    services,volumes={},{}
    for i,(temp,zone) in enumerate((t,z) for t in ('hot','warm') for z in 'abc'):
        name=f'{backend}-{temp}-{zone}'
        roles=(['master','data','ingest'] if temp=='hot' else ['data','ingest']) if backend=='es' else (
               ['cluster_manager','data','ingest'] if temp=='hot' else ['data','ingest'])
        env={'cluster.name':f'elk-expansion-ha-{backend}','node.name':name,
             'node.roles':','.join(roles),'node.attr.zone':zone,'node.attr.temp':temp,
             'discovery.seed_hosts':managers,
             'cluster.routing.allocation.awareness.attributes':'zone',
             'cluster.routing.allocation.awareness.force.zone.values':'a,b,c',
             'path.repo':'/snapshots'}
        if backend=='es':env.update({'xpack.security.enabled':'false','ES_JAVA_OPTS':'-Xms512m -Xmx512m'})
        else:env.update({'DISABLE_INSTALL_DEMO_CONFIG':'true','DISABLE_SECURITY_PLUGIN':'true','OPENSEARCH_JAVA_OPTS':'-Xms512m -Xmx512m'})
        if not joined:
            env['cluster.initial_master_nodes' if backend=='es' else 'cluster.initial_cluster_manager_nodes']=managers
        volumes[name]={}
        services[name]={'image':image,'environment':env,
             'ports':[f'127.0.0.1:{(19300 if backend=="es" else 29300)+i}:9200'],
             'volumes':[f'{name}:{root}/data','snapshots:/snapshots'],
             'mem_limit':'2g', 'stop_grace_period':'90s'}
    volumes['snapshots']={}
    return {'name':f'elk-expansion-ha-{backend}','services':services,'volumes':volumes}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('backend',choices=['es','os']);p.add_argument('--joined',action='store_true')
    a=p.parse_args();print(json.dumps(topology(a.backend,a.joined),indent=2))
```


### 18.3 配置分配感知并解释未分配分片
<a id="s-18-3"></a>

#### 分配感知与强制分配感知

`zone` 是节点属性，分配感知使主副分片避免集中在相同 zone。
强制感知再声明完整故障域集合 `a,b,c`，避免失去一个区后所有副本被集中重建到剩余较少的区而超出预期故障隔离。[ES 分配感知](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/modules-cluster.html)

生成器中已包含：

```yaml
# 节点级配置示意，完整配置由 make_ha.py 生成。
node.attr.zone: a
cluster.routing.allocation.awareness.attributes: zone
cluster.routing.allocation.awareness.force.zone.values: a,b,c
```

标签不创造物理隔离，强制感知也不创造容量。
对于一主一副，剩余两个区可能仍能放满两份；对于一主两副，丢失一个区后可能有一份保持未分配。
因此不要把“失去一个 zone 必然黄色”当成与副本数无关的定律。

**独立创建三副本观察索引**

在 OS HA 的 Dev Tools 或 `29300` API 创建：

```http
PUT /exp-ha-check
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 2,
    "index.routing.allocation.require.temp": "hot"
  },
  "mappings": {
    "properties": {
      "event_id": {"type":"keyword"},
      "message": {"type":"text"}
    }
  }
}
PUT /exp-ha-check/_doc/ha-event-1?refresh=wait_for
{"event_id":"ha-event-1","message":"before failure"}
GET /_cat/shards/exp-ha-check?format=json
```

先确认一主两副分别落到 `hot-a/b/c`。
若没有，停下检查节点属性、磁盘、角色与分配解释，不能继续宣称正在测试三副本容错。


#### 未分配分片要问分配决策器

```http
POST /_cluster/allocation/explain
{
  "index": "exp-ha-check",
  "shard": 0,
  "primary": false
}
GET /_cluster/settings?include_defaults=true&flat_settings=true
GET /_cat/nodeattrs?format=json
GET /_cat/allocation?format=json
```

示例需要对应实际存在且可解释的分片；没有未分配副本时，不应把无结果理解为接口失效。
重点阅读每个候选节点的 decision 与解释，而不是只看最终 NO。

可能同时存在多个限制：`temp=warm`、zone 感知、磁盘水位、节点排除、单节点分片数上限。
解除一个限制后仍不能分配，并不说明第一项诊断错误，而可能是其他约束仍成立。
修复必须匹配故障原因，不通过关闭全部分配保护强行“变绿”。


### 18.4 演练节点、故障域与网络故障并核对恢复
<a id="s-18-4"></a>

#### 演练前检查与停止条件

所有故障动作只在 `elk-expansion-ha-*` 中执行。
每次只引入一种故障；保留源样本、卷和快照，禁止删除数据目录或使用 `accept_data_loss`。

| 前置条件 | 必须确认 |
| --- | --- |
| 集群身份 | 精确产品版本、名称、UUID |
| 健康状态 | 目标索引主副分片全部分配 |
| 负载 | 小规模持续探针，无生产请求 |
| 容量 | 足够承受恢复；不是磁盘已满的现场 |
| 回退 | 已写清启动/重连命令及负责人 |
| 观察 | API 请求状态、事件 ID、分片位置、恢复流量 |

本书演练停止条件：主分片不可用超出预设窗口、容器持续 OOM、磁盘超过安全预算、出现未解释的数据缺失，或者故障对象与计划不符。
停止注入、恢复已停对象、保存证据，然后分析，不通过扩大超时掩盖失败。


#### 单节点故障实验

```bash
# 先保存现场。以下是 OS 教学集群，不是主 compose。
mkdir -p evidence/ha-node
curl -fsS 'http://127.0.0.1:29301/_cluster/health?pretty' > evidence/ha-node/before-health.json
curl -fsS 'http://127.0.0.1:29301/_cat/shards/exp-ha-check?format=json' > evidence/ha-node/before-shards.json
docker compose -f compose-ha-os-joined.json stop os-hot-a
curl -fsS 'http://127.0.0.1:29301/_cluster/health?pretty' > evidence/ha-node/during-health.json
curl -fsS 'http://127.0.0.1:29301/exp-ha-check/_doc/ha-event-1' > evidence/ha-node/read-existing.json
# 恢复原实例和原数据卷。
docker compose -f compose-ha-os-joined.json start os-hot-a
```

在故障期间向健康入口写入一个新 ID，再恢复后查询两条事件。
请求失败应保留状态和错误，不用 `|| true` 隐藏。
管理节点重新选举、主分片提升和客户端重试可能带来短暂中断；实验记录实际过程，不预填“零中断”。

恢复后的成功标准是：集群身份未变、预期节点恢复、分片状态符合策略、故障前后事件存在且没有不可解释的重复、恢复任务趋于稳定。


#### 故障域失效与多数丢失

```bash
# 模拟 zone=a 的两个容器停机；仍然不是真实可用区失效。
docker compose -f compose-ha-os-joined.json stop os-hot-a os-warm-a
# 从 b 区入口观察；不要访问已经停下的 29300。
curl -fsS 'http://127.0.0.1:29301/_cat/shards/exp-ha-check?format=json'
docker compose -f compose-ha-os-joined.json start os-hot-a os-warm-a
```

一主两副的观察索引预计仍有两份在线数据，但强制感知可能保留未分配副本。
不同索引的副本数、温度约束不同，状态可能不同。
不能用某个索引读通，证明所有索引都具备相同可用性。

失去两个具有管理资格的故障域，可能失去投票多数，即使剩余磁盘上还有数据，也不能按“最后一份副本仍在”保证写入继续。
不同 no-master block 设置下读操作行为可能不同，必须记录实际返回和数据新鲜度。
本书不要求为了演示而自动连续关闭多个区；此项应由读者在已掌握单故障后单独评审执行。


#### 有界网络隔离示例

只隔离一个非关键实验容器，并确保退出时尝试重连。
下面脚本保存为临时 `isolate-one.sh`，在有 Docker 权限的隔离主机执行；不要传任意容器 ID。

```bash
#!/usr/bin/env bash
set -euo pipefail
compose_file=compose-ha-os-joined.json
cid=$(docker compose -f "$compose_file" ps -q os-hot-a)
test -n "$cid"
project=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$cid")
test "$project" = elk-expansion-ha-os
network=elk-expansion-ha-os_default
restore() {
  docker network connect --alias os-hot-a "$network" "$cid" || {
    echo '自动重连失败，请检查容器当前网络后手工恢复。' >&2
  }
}
trap restore EXIT INT TERM
docker network disconnect "$network" "$cid"
sleep 30
```

该实验模拟容器网络不可达，不模拟真实交换机、跨区路由或非对称分区的所有行为。
重连后检查 DNS 名称、发布地址和 集群成员、管理节点和 cluster UUID，不只检查容器 still running。
若 Docker 实现或网络驱动不允许此操作，记录“受阻”，不要改用宿主全局防火墙制造更大故障。



## 第 19 章 · 冷热分层、容量与成本

### 19.1 从访问频率与保留目标推导数据分层
<a id="s-19-1"></a>

#### 从访问需求推导分层

热、温、冷首先是业务需求：最近日志写入多、查询密；较旧日志少量排障；更旧数据可能只用于审计恢复。
产品的 node role、存储插件和索引策略只是实现方式。
不能因为一台机器配置了 `temp=cold`，就认为它自动具有低成本对象存储查询能力。

| 层次 | 教学需求假设 | 需要测量 |
| --- | --- | --- |
| 热 | 最近 7 天，持续写入，分钟级排障 | 写入、并发查询、恢复空间 |
| 温 | 8～30 天，较少查询 | 搜索延迟、迁移带宽、压缩效果 |
| 冷/归档 | 更旧数据，低频取证 | 在线查询要求、恢复时间、对象保存完整性 |

这些天数是示例，不是推荐所有业务采用相同保留期。
业务事件访问频率、权限和删除要求应先于技术名称确定。


#### Elastic 与 OpenSearch 的实现差别

ES 7.17 支持数据层角色，ILM 的 migrate 会设置数据层偏好。
使用 `data_hot/data_warm/data_cold` 时应检查目标层是否存在，以及 `_tier_preference` 的回退行为。[ES 数据层](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/data-tiers.html)

本书可运行实验使用通用 `data` 角色和 `node.attr.temp`：ILM warm phase 禁用自动 migrate，改由 allocate.require.temp 迁移。
这是为了避免同时存在 `temp=warm` 与另一套 `_tier_preference` 的不一致限制。[ILM allocate](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/ilm-allocate.html)

OpenSearch 2.19 主实验通过节点属性和 ISM allocation 动作实现本地磁盘热/温分配。
不把云托管 UltraWarm、托管 cold storage 或专属资源类型写成自建 OpenSearch 的默认功能。
涉及 searchable snapshot、remote-backed storage 等另一种存储架构时，必须另核对版本、插件和运维边界，本书不默认启用。


### 19.2 验证滚动、转层、位置变化与删除的完整过程
<a id="s-19-2"></a>

转层实验依赖已形成并核对身份的 [六节点集群](04-production-operations-and-troubleshooting.md#s-18-2)，使用 [独立生命周期脚本](03-search-storage-and-visualization.md#s-14-3) 和本节的 `cycle_data.py`。先确认分片所在节点，再观察策略状态；策略进入下一阶段不一定意味着所有物理迁移已经结束。

#### 完整转层实验

在前面的教学章节形成的 HA 实验集群上执行：

```bash
python3 tools/lifecycle.py os --url http://127.0.0.1:29300 --tiered
python3 tools/lifecycle.py os --url http://127.0.0.1:29300 --tiered --apply
python3 tools/cycle_data.py os --url http://127.0.0.1:29300 --apply
```

ES 对照换成 `es` 和 `19300`。
两个实验都用新的 `exp-cycle`，不会改变普通对账数据的生命周期。
如果安装过程中某一步失败，保留已创建资源与日志；不要重跑时覆盖所有资源。

| 阶段 | 观察 | 通过条件 |
| --- | --- | --- |
| 首次写入 | alias、cat shards、查询 | 首索引在 hot，25 个 ID 可查 |
| 滚动 | 唯一 write alias | 新写索引后缀推进，旧索引不再接收普通写入 |
| 转层 | policy 状态、分片节点 temp | 旧索引主副分片真正落到 warm |
| 保留 | 旧 run_id 查询 | 迁移前后事件集合一致 |
| 删除 | explain/alias/index、查询 | 到达策略年龄后旧索引被删除，新写索引仍正常 |

生命周期执行成功与物理迁移完成是不同观察点。
即使策略已进入后续状态，也要从分片位置和恢复任务确认迁移实际完成。
删除是明确设计的验收阶段，不应把这时旧 ID 消失判为采集丢失。


#### 生命周期年龄、迟到日志和最短/最长保留

Rollover 后的保留年龄与业务 `@timestamp` 无直接一一对应关系。
同一个索引内，最早与最晚写入的事件会在同一次索引删除中一起消失。
晚到的历史日志可能保留得比业务期望更久；如果按业务日期索引又可能马上落入待删除范围。

本实验保留 30 分钟从滚动后计算，故意加入三天前事件来观察这一差异。
查询时分别按 `@timestamp` 与入库时刻理解，不修改事件时间“让界面好看”。

| 时间 | 意义 |
| --- | --- |
| 事件时间 | 业务实际发生时间，依赖源时钟 |
| 采集时间 | 采集器构造外层事件的时间 |
| 入库时间 | Ingest Pipeline 接收处理时刻 |
| 索引创建时间 | 当前索引生命周期起点之一 |
| Rollover 时间 | 后续生命周期年龄可能采用的基准 |
| 删除完成时间 | 后台任务实际完成，可能晚于阈值 |


#### 对照实验完整文件：`tools/cycle_data.py`

生命周期的 25 条独立样本。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tools/cycle_data.py -->
```python
"""只对独立 exp-cycle alias 写入 25 个带唯一 ID 的样本，供生命周期观察。"""
from datetime import datetime,timezone,timedelta
import argparse,json,uuid
from client import Client,check_bulk
p=argparse.ArgumentParser();p.add_argument('backend',choices=['es','os']);p.add_argument('--url');p.add_argument('--apply',action='store_true')
a=p.parse_args();c=Client(a.backend,a.url);c.guard()
if not a.apply:raise SystemExit('未执行：这是写入实验，请显式 --apply')
run='cycle-'+uuid.uuid4().hex
lines=[]
for i in range(25):
    eid=f'{run}-{i}'
    lines.append(json.dumps({'index':{'_index':'exp-cycle','_id':eid}}))
    lines.append(json.dumps({'@timestamp':(datetime.now(timezone.utc)-timedelta(days=3 if i==0 else 0)).isoformat(),
        'event':{'id':eid,'dataset':'nginx.access'},'labels':{'run_id':run},
        'service':{'name':'orders-api','environment':'lab'},'message':'tiering evidence'}))
r=c.request('POST','/_bulk?refresh=wait_for', ('\n'.join(lines)+'\n').encode())
check_bulk(r,25);print(json.dumps({'run_id':run,'documents':25,'note':'包含一条迟到三天的事件；索引年龄不会因此变为三天。'}))
```


### 19.3 计算流量、缓冲、分片、故障余量与排空时间
<a id="s-19-3"></a>

#### 先统一单位和统计口径

容量预算至少需要平均 EPS、峰值倍数、平均事件大小、保留时长、压缩后比率、副本数和预留空间。
应明确大小测量发生在原始文本、Filebeat 事件、Kafka 压缩日志还是 ES 主分片。
这些层次不是同一个字节数。

| 输入 | 应如何取得 |
| --- | --- |
| 平均 EPS | 代表性工作日与周末的实际流量 |
| 峰值 EPS | 业务峰值与故障重试时段 |
| 事件大小 | 完整事件样本，不只 message 文本 |
| Kafka 存储比率 | 同一批事件实际压缩后大小 |
| ES 主分片比率 | 对应 Mapping 与实际文档的主分片大小 |
| 保留期 | 排障、审计和恢复要求 |
| 余量 | 恢复、迁移、合并与节点故障空间 |

1 GiB = 1024³ 字节，1 GB = 1000³ 字节。
监控、磁盘厂商标注和 API 输出可能使用不同单位，预算表必须标明。


#### 原始流量与 Kafka 缓冲

设平均 EPS 为 `E`，每事件平均字节为 `S`，Kafka 保留小时为 `H`，压缩存储比率为 `K`，副本因子为 `R`：

```text
原始字节/秒 = E × S
Kafka 数据估算 = E × S × 3600 × H × K × R
```

这是数据量模型，不包含所有索引、控制器、段、文件系统及运维开销。
Kafka 的副本因子已经包含主副本总份数，不能再额外乘一次 `1 + R`。

**缓冲时间与磁盘限额**

若同时存在时间和大小保留限制，消息可能在时间期限之前因大小限制被清理。
峰值流量下仍应重新计算可回放时间窗口。[Kafka Topic 设置](https://kafka.apache.org/28/configuration/topic-level-configs/)

“可以缓冲 72 小时”应以最坏合理流量和可用磁盘为前提，而不是只设置 `retention.ms` 后就成立。


#### Elasticsearch 存储与分片数量

设 ES 主分片实际存储与原始事件字节比率为 `M`，保留天数为 `D`，副本数量为 `r`：

```text
ES 文档与索引数据估算 = E × S × 86400 × D × M × (1 + r)
```

ES 的 `number_of_replicas` 不包含主分片，所以这里使用 `1 + r`。
`M` 必须实测，它受到 `_source`、字段数量、分析器、doc_values、压缩与数据重复程度影响。
不要在没有样本时保证“ES 一定是原始日志的两倍”。

**分片数量的预算**

```text
总分片实例数 ≈ 每日或每次滚动索引数 × 保留代次数 × 主分片数 × (1 + 副本数)
```

如果正常、隔离、Java、容器日志分别滚动，需要分别计算后求和。
不能只看一个业务的分片数，再认为整个集群还很空。

**预留空间**

按可用比例 `U` 分配容量时，可写为 `数据估算 / U`。
例如 U=0.7 代表只计划使用配置容量的 70%，剩余用于不确定性和维护。
它不是对 ES 磁盘水位设置的自动推荐，水位保护和容量计划需要分别设计。


#### 积压恢复需要净吞吐

故障期间积压 `B` 条，恢复后输入仍为 `E` 条/秒，总处理能力为 `C` 条/秒：

```text
净排空速度 = C - E
预计排空时间 = B / (C - E)
```

当 C ≤ E，系统无法排空已有积压。
“消费者恢复到正常每秒一千条”并不代表能消化过去两小时积压，因为当前仍有每秒一千条进入。

这个模型假设吞吐稳定且没有额外重试或资源变化。
恢复过程中应根据实际净流出速率更新估计，不使用一次压测峰值作为持续能力承诺。


#### 基础实验：可复用容量算例脚本

保存为 `scripts/capacity.py`。
所有默认值都是假设，不是对你生产环境的测量结果。
脚本输出数据估算和净排空时间，便于替换为自己的采样值。

```python
#!/usr/bin/env python3
"""日志平台容量的假设算例；不是性能测试结果或采购建议。"""
from __future__ import annotations

import argparse
import json
import math


def positive(value: str) -> float:
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("需要有限正数")
    return number


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--eps", type=positive, default=1000)
    parser.add_argument("--event-bytes", type=positive, default=1200)
    parser.add_argument("--peak-factor", type=positive, default=3)
    parser.add_argument("--kafka-hours", type=positive, default=72)
    parser.add_argument("--kafka-stored-ratio", type=positive, default=0.55)
    parser.add_argument("--kafka-replication", type=int, default=3)
    parser.add_argument("--es-days", type=positive, default=14)
    parser.add_argument("--es-primary-ratio", type=positive, default=1.3)
    parser.add_argument("--es-replicas", type=int, default=1)
    parser.add_argument("--usable-fraction", type=positive, default=0.70)
    parser.add_argument("--outage-hours", type=positive, default=2)
    parser.add_argument("--recovery-eps", type=positive, default=2500)
    args = parser.parse_args()
    if args.kafka_replication < 1 or args.es_replicas < 0:
        parser.error("Kafka replication >= 1，ES replicas >= 0")
    if not 0 < args.usable_fraction < 1:
        parser.error("usable-fraction 必须在 0 与 1 之间")
    raw_per_second = args.eps * args.event_bytes
    kafka_payload = (raw_per_second * 3600 * args.kafka_hours *
                     args.kafka_stored_ratio * args.kafka_replication)
    es_payload = (raw_per_second * 86400 * args.es_days *
                  args.es_primary_ratio * (1 + args.es_replicas))
    backlog = args.eps * args.outage_hours * 3600
    net_drain = args.recovery_eps - args.eps
    gib = 1024 ** 3
    result = {
        "assumptions": vars(args),
        "raw_gib_per_day": raw_per_second * 86400 / gib,
        "peak_raw_mib_per_second": raw_per_second * args.peak_factor / 1024 ** 2,
        "kafka_payload_gib": kafka_payload / gib,
        "kafka_provisioned_gib_estimate": kafka_payload / args.usable_fraction / gib,
        "es_payload_gib": es_payload / gib,
        "es_provisioned_gib_estimate": es_payload / args.usable_fraction / gib,
        "backlog_events": backlog,
        "net_drain_eps": net_drain,
        "catchup_hours": backlog / net_drain / 3600 if net_drain > 0 else None,
        "warning": "容量比率是假设；不含独立快照和全部运维开销，必须实测校准。",
    }
    if net_drain <= 0:
        result["warning"] += " 恢复吞吐不高于持续输入，无法排空积压。"
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

```bash
python3 scripts/capacity.py

python3 scripts/capacity.py \
  --eps 3000 --event-bytes 1500 \
  --kafka-hours 48 --kafka-stored-ratio 0.6 \
  --es-days 30 --es-primary-ratio 1.4 \
  --recovery-eps 6000
```

计算结果不包含独立快照仓库。
单台服务器容量还需要考虑分片不均衡、节点故障后的重新分配及磁盘设备性能，而不仅是集群总字节数。


#### 扩展原容量公式

前面的算例已经讨论 EPS、平均事件大小与保留周期。
本篇新增四项：节点/故障域余量、迁移与合并临时空间、独立快照空间，以及可接受恢复时间。

```text
原始日量 = EPS × 平均事件字节 × 86400
主分片保留量 = 原始日量 × 实测主索引/原文比率 × 保留天数
在线副本量 = 主分片保留量 × (1 + 副本数)
故障后单存活节点最低盘容量
  = (在线副本量 + 临时空间预算) / 存活节点数 / 允许占用比例
快照存储单列，不与在线副本相互抵消
```

比率必须采样测量，不能从某个博客压缩率照抄。
热层和温层需要分别计算；如果温层没有足够 zone 或满足属性的节点，总空间公式成立也仍可能迁移失败。


#### 假设明确的算例

以下全为教学假设：原始日志 100GiB/日，主分片/原文比率 1.2，保留 7 日，一副本，三个节点，要求失去一节点后仍容纳全部在线副本，允许磁盘占用 70%，另留 200GiB 集群临时空间。
独立快照预算 900GiB；假设有效恢复吞吐 100GiB/小时，仅用于算术示例。

```bash
python3 tools/cost.py --raw-gib-day 100 --primary-ratio 1.2 --days 7 \
  --replicas 1 --nodes 3 --failed 1 --usable 0.70 \
  --temp-gib 200 --snapshot-gib 900 --restore-gib-hour 100
```

算术结果：主分片约 840GiB，在线副本约 1680GiB；每个存活节点需要约 1342.86GiB 盘容量，按三个同规格节点采购约 4028.57GiB 在线容量。
主数据恢复下界约 8.4 小时，但不含索引检查、排队、网络共享、恢复后回放和业务验收。
这些数值不是实测，也不是建议购买某种云磁盘。

成本比较可以再乘用户自己取得的单位成本，并加入计算、网络、对象请求、运维人力和停机风险。
没有来源的云价格不应写进固定结论。


#### 对照实验完整文件：`tools/cost.py`

容量、故障余量与恢复下界算例。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tools/cost.py -->
```python
"""无云单价的分层与故障余量算例。比率必须用自己采样替换。"""
import argparse,json,math

def capacity(raw_gib_day,primary_ratio,days,replicas,nodes,failed,usable,temp_gib,snapshot_gib,restore_gib_hour):
    args=[raw_gib_day,primary_ratio,days,nodes,usable,restore_gib_hour]
    if any(not math.isfinite(x) for x in [replicas,failed,temp_gib,snapshot_gib]):
        raise ValueError('所有参数必须为有限值')
    if any(not math.isfinite(x) or x<=0 for x in args) or not 0<usable<1:
        raise ValueError('需要有限正值且 usable 在 0..1')
    if not 0<=failed<nodes or replicas<0 or temp_gib<0 or snapshot_gib<0:raise ValueError('故障/副本/空间参数错误')
    primary=raw_gib_day*primary_ratio*days
    payload=primary*(1+replicas)
    per_survivor=(payload+temp_gib)/(nodes-failed)/usable
    return {'primary_gib':primary,'online_payload_gib':payload,
            'minimum_disk_gib_per_surviving_node':per_survivor,
            'provisioned_online_gib':per_survivor*nodes,
            'separate_snapshot_gib':snapshot_gib,
            'lower_bound_restore_hours':primary/restore_gib_hour,
            'warning':'均匀分布假设；故障域分配规则和单分片容量还可能阻止恢复。恢复下界不含排队、重放与校验。'}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--raw-gib-day',type=float,default=100)
    p.add_argument('--primary-ratio',type=float,default=1.2);p.add_argument('--days',type=float,default=7)
    p.add_argument('--replicas',type=int,default=1);p.add_argument('--nodes',type=int,default=3)
    p.add_argument('--failed',type=int,default=1);p.add_argument('--usable',type=float,default=.70)
    p.add_argument('--temp-gib',type=float,default=200);p.add_argument('--snapshot-gib',type=float,default=900)
    p.add_argument('--restore-gib-hour',type=float,default=100);a=p.parse_args()
    print(json.dumps({'assumptions':vars(a),'estimate':capacity(**vars(a))},ensure_ascii=False,indent=2))
```


### 19.4 实测字段、压缩、副本与归档的空间和恢复代价
<a id="s-19-4"></a>

#### 日志降噪与分级保留

降噪应该先回答哪些证据允许丢失，再确定过滤规则。
单纯删除所有 INFO 可能丢掉成功请求分母和关键状态转换；只保留 ERROR 也不一定能解释故障发生前的过程。

| 策略 | 适用目的 | 应验证的损失 |
| --- | --- | --- |
| 健康检查降频 | 减少高重复低价值请求 | 不影响真实可用性判断 |
| 调试日志短保留 | 限制短期排查开销 | 过期后无法追溯细节 |
| 敏感字段删除或脱敏 | 降低泄漏风险 | 是否保留必要关联字段 |
| 正常日志采样 | 控制高流量成本 | 请求统计需要采样权重和覆盖说明 |
| 错误与慢请求较长保留 | 保留故障证据 | 字段和判定规则是否可靠 |

错误日志百分之百保留只是采集策略目标，不能保证链路永不丢失，也不能使已被上游采样丢弃的 Trace 重新出现。
日志与 Trace 的采样边界应分别记录。


#### 容量评审的验收材料

最终容量评审应包含样本区间、峰值依据、压缩比实测、索引放大比、保留要求、恢复目标和预警阈值。
同时展示正常情况与节点故障后的预算。

```text
场景：日常 / 峰值 / ES 中断 / Kafka 节点故障
平均与峰值 EPS：填写实测
原始与封装后事件大小：填写样本分布
Kafka 保留窗口：分别计算平均和峰值
ES 主副分片容量：分数据集计算
最小剩余空间：考虑恢复与迁移
恢复净吞吐：使用可持续测量值
扩容触发点：按增长速率而非磁盘满后处理
```

不要只给出“需要三台 16 核 64G”的结论却没有工作负载和恢复要求。
容量模型要能随着流量、字段和保留策略变化重新计算。


#### 压缩、Force Merge 与快照不是同一件事

减少不需要的多字段和索引，比盲目压缩全部原文更容易保持可解释的检索能力。
改变 codec 通常影响之后创建的 segment，不能把配置更新当成历史数据已经重压缩。
Force Merge 会产生额外 I/O 和临时空间，适合不再写入、容量充足且经过评审的索引；不是磁盘已满时的急救按钮。[ES Force Merge](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/indices-forcemerge.html)

ES 7.17 的 `best_compression` 可作为独立新索引实验；OpenSearch 也应按选定版本的 codec 文档核对。
不要把较新版本的额外压缩算法配置复制进 7.17。
比较时使用同样文档、分片、副本和 merge 稳定状态，记录 primaries 与 total，避免副本数变化被误认作压缩收益。

快照是恢复材料；普通快照不是一个可以直接拿来承接在线查询的温/冷数据节点。
启用专门的可搜索快照能力又涉及独立功能、版本和许可证条件，本书的普通文件系统快照实验不包含它。

**ISM 分配动作的参数核对**

本实验在 allocation 中使用 `wait_for: true`，要求观察分片迁移完成，而不是仅看到设置更新。
2.19 文档参数表将该项类型显示为 string，但同分支 `AllocationAction` 的 `waitFor` 声明为 Boolean；本示例按源码使用布尔值，不照抄表格类型。
这项核对是配置依据，不是已经在 2.19.6 实例完成分配测试。[2.19 分配动作源码](https://github.com/opensearch-project/index-management/blob/2.19/src/main/kotlin/org/opensearch/indexmanagement/indexstatemanagement/action/AllocationAction.kt)


#### 同批数据的存储对照

[混合压测脚本 `performance.py`](04-production-operations-and-troubleshooting.md#s-20-3) 提供 wide 与 lean 两种 Mapping。
wide 多存原文可检索字段并展开动态 app；lean 保存 app 原始结构但不索引，避免动态字段增长。
两个版本仍保留本书主要查询字段，方便比较相同查询。

| 观察项 | 方法 |
| --- | --- |
| 主数据大小 | `_stats/store` 中 primaries |
| 含副本总大小 | 同接口 total，记录副本数 |
| 字段数量 | Mapping 展开后计数，不只看 `_source` 键数 |
| segment / deleted docs | `_stats/segments,docs` |
| 合并开销 | `_stats/merge`、节点 IO 与 CPU |
| 查询代价 | 同样查询、时间范围、缓存说明和重复次数 |
| 恢复代价 | 独立新目标恢复、实测吞吐与校验时间 |

lean 无法对未索引的 app 任意键执行同等搜索，这是能力变化，不应隐藏在“成本下降”里。
只有保留业务真正需要的检索语义，成本优化才有意义。



## 第 20 章 · 分段调优与混合负载验证

### 20.1 用分段证据定位采集、Kafka、Logstash 和后端瓶颈
<a id="s-20-1"></a>

先确定变慢的是读取、发送、加工、写入还是查询。为同一时间窗口收集各段流入流出速率、队列深度、错误和资源占用，再选择一项参数进行对照。不要把下游阻塞造成的上游空闲解释为上游能力不足。

#### 先定位瓶颈所在阶段

吞吐低不等于 Logstash Grok 慢。
没有 Grok 的链路也可能因为 Kafka 分区、单消费者、ES 写入、磁盘、网络或限额而变慢。

```text
源文件产生速度
→ Filebeat 读取与输出速度
→ Kafka 生产成功与分区分布
→ 消费组读取速度
→ Logstash Filter 成本与队列
→ ES Bulk 响应与索引速度
→ 刷新和查询可见时间
```

每一层都要在同一时间窗口采样。
只拿 Filebeat 的一分钟平均值与 ES 的瞬时值比较，可能把批量行为误认为数据丢失。

| 层 | 首先查看 |
| --- | --- |
| Filebeat | 已读取、已发布、已确认、输出错误、进程资源 |
| Kafka | Topic 分区、ISR、生产速率、Lag、网络和磁盘 |
| Logstash | Pipeline in/out、处理耗时、队列、JVM |
| Elasticsearch | 写入拒绝、索引时间、Heap、磁盘、Merge |
| 查询 | Refresh、时间范围、查询成本、返回体 |


### 20.2 调整批量、队列和并行度并解释吞吐与延迟的取舍
<a id="s-20-2"></a>

#### Filebeat 批量、队列与文件发现

采集端性能受文件数量、单行大小、处理器、输出批量和下游确认影响。
大量短生命周期文件与少量大文件的压力模型不同。[Filebeat Kafka output](https://www.elastic.co/guide/en/beats/filebeat/7.17/kafka-output.html)

| 参数或设计 | 影响 | 调整前验证 |
| --- | --- | --- |
| 扫描间隔 | 新文件发现延迟与目录扫描成本 | 新文件数量与可接受延迟 |
| 内存队列 | 短暂缓冲与内存占用 | 下游是否长期阻塞 |
| 输出批量 | 请求次数和批量等待 | 单事件大小、下游限制 |
| 压缩 | 网络与 CPU 的取舍 | broker 和客户端 CPU |
| 处理器 | 采集端解析成本 | 是否有重复解码和复杂脚本 |

批量参数的单位可能是事件数，不是字节数。
例如相同 500 条，普通访问日志可能很小，包含长堆栈时请求体会大得多。

**不能靠队列解决持续供需失衡**

把队列从几千条增加到几十万条，只会延后满队列时刻。
如果长期输出能力小于输入，必须处理吞吐瓶颈、限流或保留策略。
增加队列还会改变重启恢复和内存预算。


#### Kafka 分区与消费者并行度

同一消费组内，一个分区在一个时刻由一个消费者处理。
增加消费者线程超过分区数，不能让同一分区在该组内被任意并发切分。[Kafka 设计](https://kafka.apache.org/28/design/design/)

本书 Topic 有 3 个分区。
同组消费者的总数、线程与分区分配应一并检查，而不是看到 CPU 空闲就继续增线程。

```bash
docker compose -p elk-full exec kafka kafka-topics.sh \
  --bootstrap-server kafka:9092 --describe --topic logs-lab-raw

docker compose -p elk-full exec kafka kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 --describe --group logs-lab-main-v1
```

**热分区**

总 Lag 不大，但某个分区持续积压，可能是 Key 分布、数据大小或特定异常记录造成。
单纯增加 broker 不会自动把该分区内部的历史记录拆散。
改变分区数可能改变 Key 到分区的映射和顺序假设，需要评审生产者与消费者语义。

**Rebalance 的代价**

频繁扩缩容、超时或实例重启会触发组成员变化。
调大超时不一定修复根因；应先确认是处理阻塞、GC 停顿、网络问题还是滚动策略不合理。
观察消费者日志与组状态，保留变化时间线。


#### Logstash Workers、Batch 与 Filter 成本

Logstash Pipeline 的 worker 数、batch size 和插件行为共同影响吞吐。[性能调优](https://www.elastic.co/guide/en/logstash/7.17/tuning-logstash.html)

一个粗略的在途事件基数是：

```text
pipeline.workers × pipeline.batch.size
```

但实际内存还包括 Input、队列、插件内部结构、输出序列化、长事件和 JVM 开销。
不能把这个乘积乘平均日志字节数后当成精确 Heap 上限。

| 类型 | 常见瓶颈 | 调优方向 |
| --- | --- | --- |
| CPU 密集解析 | 正则、复杂 Ruby、重复 JSON 解码 | 减少无效工作、稳定格式使用更简单解析 |
| I/O 等待 | 外部查询、慢输出 | 缓存、超时、异步设计或吞吐隔离 |
| 大事件 | 长堆栈、巨大 JSON | 上限、批次和内存预算 |
| 单线程语义 | 有状态聚合等插件 | 先理解正确性要求，不盲增 workers |

**Grok、Dissect 与 JSON**

已是合法 JSON 的事件不应先 Grok 拆成 JSON 再解析。
固定分隔符的文本可以评估 Dissect；格式可变才需要更灵活的模式。
改变解析器之前要比较正常、缺字段、特殊字符和坏日志的输出，而不是只看跑得快。

**Ruby 脚本并发安全**

第二篇规范化脚本使用事件级局部变量，注册时设置的源集群名不在处理期间修改。
不要用共享实例变量累计当前事件字段，否则多个 worker 并发时可能串数据。[Ruby filter](https://github.com/logstash-plugins/logstash-filter-ruby/blob/v3.1.8/docs/index.asciidoc)


#### ES 批量写入与查询竞争

在固定硬件和 Mapping 下，从小批次逐步增加，观察吞吐、请求延迟、拒绝和内存。
找到可持续区间后再考虑并发，不是直接把 bulk size 和 worker 都调到最大。[索引调优](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/tune-for-indexing-speed.html)

| 变化 | 可能改善 | 可能恶化 |
| --- | --- | --- |
| 增大批量 | 减少请求开销 | 大请求内存、重试放大、代理限制 |
| 增加并发 | 利用剩余处理能力 | 饱和后拒绝、队列和 GC |
| 延长刷新 | 降低部分刷新开销 | 日志可见延迟 |
| 减少不必要字段 | 降低存储与索引工作 | 未评审时丢失证据 |
| 调整分片 | 改善布局 | 小分片增加、查询扇出、迁移成本 |

在数据导入实验中临时降低副本或关闭刷新，会改变可靠性与可见性。
这种测试值不能不经恢复就变成生产默认配置。
本书主实验不要求通过降低持久化语义获取漂亮的吞吐数字。


### 20.3 设计固定样本、预热、并发和停止条件的混合压测
<a id="s-20-3"></a>

#### 一个可复查的压测过程

先记录初始 Kafka Lag、Logstash 队列、ES 索引大小和各进程资源。
使用唯一 run_id 和有界事件数，逐轮增加输入速率。
每轮结束等待处理稳定，并对账确认没有用丢弃换取吞吐。

```bash
# 仅用于隔离 lab。不要直接把 count 改成无限。
python3 scripts/generate_logs.py \
  --output logs/access.jsonl --count 5000 \
  --run-id perf-round-001 --interval 0.002
```

`--interval` 是生成器的等待时间，不是承诺精确 EPS。
文件系统写入、Python 调度和其他开销都会影响实际产生速度。
吞吐应从实际事件数和时间测量，不从参数倒数推断。

**记录模板**

| 轮次 | 输入实测 EPS | 输出实测 EPS | P95 可见延迟 | 峰值 Lag/PQ | 错误与对账 | 唯一变更 |
| --- | --- | --- | --- | --- | --- | --- |
| 基线 | 待测 | 待测 | 待测 | 待测 | 待测 | 无 |
| 第一轮 | 待测 | 待测 | 待测 | 待测 | 待测 | 只调整一个参数 |
| 第二轮 | 待测 | 待测 | 待测 | 待测 | 待测 | 明确记录 |

表内是待填写模板，没有虚构测量数据。
完成调优后记录配置差异和回滚值，避免下次升级只留下“曾经调过”的口头印象。


#### 先写实验协议

本书脚本是轻量教学工具，不替代专业容量基准体系。
它不模拟所有真实用户查询，也不声称线程数等于生产并发连接模型。

| 参数 | 本书起点 | 扩大前必须考虑 |
| --- | --- | --- |
| 数据量 | 每轮 2000 条 | 先增加到代表性数据规模，再提高并发 |
| 数据分布 | 固定种子、5% 504、动态上下文与长原文 | 必须用实际日志分布校正 |
| 写入批次 | 200 条 | 记录真实请求字节与最大事件 |
| 客户端并发 | 2，限制最高 8 | 后端预算和停止条件 |
| 查询 | 错误日志、路由聚合、耗时分位数 | 热点、宽时间范围与复杂检索比例 |
| 副本 | 教学 0 副本 | 不能把结果当成生产一副本性能 |
| 预热 | 混合阶段后重复 4 轮查询 | 第0轮与后续轮分开报告 |

同一个运行编号不得覆盖旧输出文件；每轮生成新索引，避免上一轮覆盖同 ID 后的 segment 状态影响下一轮。
也不能不清点历史索引就连续压测，最终磁盘满而误认某版本性能退化。


#### 混合测试的测量边界

混合阶段随机交错写入和查询任务，查询看到的数据量可能随时间变化。
这适合观察资源竞争，不适合直接比较每一次查询结果是否完全相同。
写入完成后刷新并单独做静态查询和事件对账，才检查结果语义。

客户端报告请求级 P50/P95/P99，而不是每条日志从源文件到可见的分位数。
端到端新鲜度由探针与事件时间差另测。
失败请求必须进入错误率；成功延迟分位数之外还要报告失败数量和错误类型。

```bash
python3 tools/performance.py es --variant wide --count 2000 --concurrency 2 \
  --run-id wide-01 --output evidence/es-wide-01.json --apply
python3 tools/performance.py es --variant lean --count 2000 --concurrency 2 \
  --run-id lean-01 --output evidence/es-lean-01.json --apply
```

先做一组小数据功能验证，再按同一协议重复至少三轮。
冷热缓存状态必须说明；本书没有清空宿主 page cache，也不把第一次查询称为严格的冷缓存实验。


#### 停止条件与记录模板

出现持续拒绝、主要索引缺失、频繁 GC/OOM、磁盘接近保护水位、错误率超过实验允许值时，停止增加负载。
不要为了得到漂亮曲线关闭副本保护、无限扩大队列或忽略失败。

```text
实验编号：
产品/插件/镜像 digest：
节点、CPU、内存、磁盘、网络：
数据量、大小分布、字段分布、种子：
写入与查询比例、并发、批量：
预热方法和缓存说明：
成功文档、失败请求与 item：
P50/P95/P99、资源与索引大小：
等价性对照：
重复轮次与离散程度：
改变的唯一变量：
结论适用范围和未验证项：
```

此模板留空是待测，不应填入捏造的速度或节省比例。


#### 对照实验完整文件：`tools/performance.py`

有界混合负载与资源证据。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tools/performance.py -->
```python
"""有界写入+查询混合负载。结果只报告本次客户端观测，不承诺生产性能。"""
from __future__ import annotations
import argparse,concurrent.futures,json,math,random,re,statistics,time,uuid
from datetime import datetime,timezone,timedelta
from pathlib import Path
from client import Client,check_bulk,complete_search
from model import properties

def percentile(values,p):
    if not values:return None
    data=sorted(values);position=(len(data)-1)*p;lo=math.floor(position);hi=math.ceil(position)
    return data[lo]+(data[hi]-data[lo])*(position-lo)

def documents(n,run):
    rng=random.Random(42);base=datetime(2026,9,1,tzinfo=timezone.utc)
    docs=[]
    for i in range(n):
        failed=i%20==0
        docs.append({'@timestamp':(base+timedelta(seconds=i%3600)).isoformat(),
          'event':{'id':f'{run}-{i:08d}','duration':rng.randint(1,2000)*1000000,
                   'dataset':'nginx.access','original':'access request '+('x'*256)},
          'service':{'name':'orders-api','environment':'lab'},
          'http':{'response':{'status_code':504 if failed else 200}},
          'route':'/orders/{id}','url':{'original':f'/orders/{i}'},
          'labels':{'run_id':run},'message':'inventory timeout' if failed else 'order accepted',
          'app':{'debug_'+str(i%300):i,'dynamic_user':str(i)}})
    return docs

def queries():
    # 三个查询返回相同业务范围但计算形态不同；正式语义比较另见第47章。
    return [
      {'size':20,'sort':[{'@timestamp':'desc'},{'event.id':'asc'}],
       'query':{'bool':{'filter':[{'term':{'service.name':'orders-api'}},{'range':{'http.response.status_code':{'gte':500,'lt':600}}}]}}},
      {'size':0,'aggs':{'routes':{'terms':{'field':'route','size':10}}}},
      {'size':0,'aggs':{'latency':{'percentiles':{'field':'event.duration','percents':[50,95,99]}}}}
    ]

def run(c,n,variant,run_id,concurrency):
    c.guard()
    if not re.fullmatch('[a-z0-9-]{1,40}',run_id):raise ValueError('run_id 仅允许小写字母数字短横线')
    index=f'exp-perf-{variant}-{run_id}';props=properties()
    if variant=='wide':
        props['app']={'type':'object','dynamic':True}
        props['message']={'type':'text','fields':{'raw':{'type':'keyword','ignore_above':1024}}}
        props['event']['properties']['original']={'type':'text','fields':{'raw':{'type':'keyword','ignore_above':2048}}}
    c.request('PUT','/'+index,{'settings':{'number_of_shards':1,'number_of_replicas':0,
              'refresh_interval':'1s'},'mappings':{'dynamic':False,'properties':props}})
    before=c.request('GET','/_nodes/stats/indices,jvm,fs,thread_pool')
    docs=documents(n,run_id);jobs=[]
    for start in range(0,n,200):
        batch=docs[start:start+200];rows=[]
        for d in batch:
            rows.extend([json.dumps({'index':{'_index':index,'_id':d['event']['id']}}),json.dumps(d)])
        jobs.append(('write',('\n'.join(rows)+'\n').encode(),len(batch)))
    q=queries()
    for _ in range(max(15,len(jobs))):jobs.append(('query',q[_%len(q)],0))
    random.Random(43).shuffle(jobs)
    def task(job):
        # 每个请求独立客户端，避免假设 urllib opener 的共享线程状态安全。
        local=Client(c.backend,c.base);kind,body,count=job;t=time.perf_counter()
        try:
            if kind=='write':check_bulk(local.request('POST','/_bulk',body),count)
            else:complete_search(local.request('POST',f'/{index}/_search?allow_partial_search_results=false',body))
            return {'kind':kind,'seconds':time.perf_counter()-t,'ok':True,'documents':count}
        except Exception as exc:
            return {'kind':kind,'seconds':time.perf_counter()-t,'ok':False,'documents':0,'error':str(exc)}
    started=time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:results=list(pool.map(task,jobs))
    elapsed=time.perf_counter()-started;c.request('POST','/'+index+'/_refresh')
    after=c.request('GET','/_nodes/stats/indices,jvm,fs,thread_pool')
    stats=c.request('GET','/'+index+'/_stats/store,segments,merge,refresh,flush')
    # 静态同一查询的重复轮次供热查询观察；没有声称清空 OS page cache。
    warm=[]
    for repetition in range(4):
        for query_id,body in enumerate(q):
            t=time.perf_counter();r=complete_search(c.request('POST',f'/{index}/_search?allow_partial_search_results=false',body))
            warm.append({'repetition':repetition,'query':query_id,'seconds':time.perf_counter()-t,'took_ms':r.get('took')})
    failures=[r for r in results if not r['ok']]
    summary={}
    for kind in ('write','query'):
        lat=[r['seconds'] for r in results if r['kind']==kind and r['ok']]
        summary[kind]={f'p{int(p*100)}_seconds':percentile(lat,p) for p in (.5,.95,.99)}
    return {'backend':c.backend,'index':index,'variant':variant,'seed':42,'documents_requested':n,
            'documents_confirmed':sum(r['documents'] for r in results),'elapsed_seconds':elapsed,
            'error_rate':len(failures)/len(results),'summary':summary,'requests':results,
            'warm_queries':warm,'nodes_before':before,'nodes_after':after,'index_stats':stats,
            'status':'通过' if not failures else '失败',
            'scope':'单机教学；统计为请求延迟，不是逐文档入库延迟。查询与写入交错时快照不同。'}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('backend',choices=['es','os']);p.add_argument('--url')
    p.add_argument('--count',type=int,default=2000);p.add_argument('--concurrency',type=int,default=2)
    p.add_argument('--variant',choices=['wide','lean'],default='lean');p.add_argument('--run-id',required=True)
    p.add_argument('--output',required=True);p.add_argument('--apply',action='store_true');a=p.parse_args()
    if not a.apply:p.error('会创建索引和写数据，需要 --apply')
    if not 100<=a.count<=50000 or not 1<=a.concurrency<=8:p.error('count=100..50000, concurrency=1..8')
    path=Path(a.output)
    if path.exists():p.error('输出已存在，不覆盖证据')
    result=run(Client(a.backend,a.url),a.count,a.variant,a.run_id,a.concurrency)
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(result['status'],path);raise SystemExit(0 if result['status']=='通过' else 2)
```


### 20.4 核对结果一致性并报告错误率、分位数和资源代价
<a id="s-20-4"></a>

先确认样本、字段、事件集合与查询结果满足同一契约，再比较延迟和资源。每轮保留原始请求结果，失败请求单独进入错误率；重试后的成功不能抹去首次失败。以下结论模板用于解释已有测量，不填入未经执行的吞吐或存储节省数字。

#### 从结果文件取出结论

报告保存请求明细、失败原因、节点前后指标、索引大小和预热轮次。
比较时同时查看：成功文档数、请求错误率、分位数、GC、磁盘、线程池拒绝、索引大小和后台 Merge。

| 观察结果 | 合理结论范围 |
| --- | --- |
| lean 更小但缺少 app 任意键搜索 | 空间换取功能边界，不能隐瞒 |
| 并发升高吞吐升高但 P99 恶化 | 需要根据延迟目标选择工作点 |
| 总发送量升高但 item 失败多 | 不是有效吞吐改善 |
| 热查询快而首轮慢 | 缓存/预热可能影响，不证明所有查询都快 |
| 两后端字段不一致 | 先修复契约，停止比较速度 |



## 第 21 章 · 平台监控、探针与业务日志告警

### 21.1 监控组件、数据流和端到端新鲜度
<a id="s-21-1"></a>

#### 三层监控：组件、数据流与端到端

日志平台也会故障，不能只依赖它自己的日志来发现它已经失效。
至少建立组件资源、数据流状态和端到端探针三层观测。

```mermaid
flowchart TD
    A[主机与组件指标] --> D[Prometheus 或现有监控]
    B[采集 消费 队列 写入状态] --> D
    C[已知日志从源到查询的探针] --> D
    D --> E[告警路由与责任人]
```

组件存活能证明进程存在，不能证明新日志已被检索。
Kafka Lag 为零也不能证明 Logstash PQ 或 ES 输出没有积压。
端到端探针负责补上这个盲区。


#### Filebeat 与 Logstash 原生 API

第二篇实验映射 Filebeat 5066 和 Logstash 9600 到本机回环地址。
这些端口用于诊断，不应无认证暴露到不可信网络。

```bash
curl -fsS 'http://127.0.0.1:5066/stats?pretty'
curl -fsS 'http://127.0.0.1:9600/_node/stats/pipelines?pretty'
curl -fsS 'http://127.0.0.1:9600/_node/stats/jvm?pretty'
curl -fsS 'http://127.0.0.1:9600/_node/stats/reloads?pretty'
```

Filebeat HTTP 监控是诊断能力，具体字段以 7.17.29 实际响应为准。
不要复制较新版本才有的队列指标名称后，把空响应当成零。

Logstash 7.17 Node Stats 可以查看 Pipeline 事件、插件耗时、队列、JVM 和 reload 信息。[Node Stats](https://www.elastic.co/guide/en/logstash/7.17/node-stats-api.html)
不要依赖较新版本的 Flow Metrics 字段来编写本版本的唯一告警条件。

**常见指标解释**

| 观察 | 需要结合 |
| --- | --- |
| Input 计数增长、Output 停滞 | 队列、Filter、输出重试 |
| Filter 耗时增长 | 输入量、事件大小、插件版本 |
| PQ 事件增加 | ES 输出速度、恢复计划 |
| Reload failures 增长 | 配置发布记录与错误日志 |
| JVM GC 时间增加 | Heap、批量、复杂解析 |

累计处理时间可能跨多个 worker 累加，不能直接除以观察窗口后称为单请求延迟。
解释指标之前先确认它是计数、累计时间还是当前状态。


#### Kafka 与 ES 的重点信号

Kafka 重点看分区和消费组，ES 重点看节点和索引。
聚合视图便于告警，但排查需要保留可以下钻的身份。

```bash
docker compose -p elk-full exec kafka kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 --describe --group logs-lab-main-v1

curl -fsS 'http://127.0.0.1:9200/_cluster/health?pretty'
curl -fsS 'http://127.0.0.1:9200/_nodes/stats/indices,jvm,fs,thread_pool,indexing_pressure?pretty'
```

[ES Nodes Stats](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/cluster-nodes-stats.html)提供写入、JVM、文件系统、线程池和索引压力信息。
脚本应检查 `_nodes.failed`，不能把少几个节点的响应当成完整集群数据。

| 类别 | 重点 |
| --- | --- |
| Kafka 数据安全 | 未充分复制分区、ISR 变化、离线分区 |
| Kafka 消费 | 各分区 Lag、消费速率、Rebalance、积压年龄 |
| Kafka 容量 | 磁盘余量、保留窗口、网络与磁盘吞吐 |
| ES 可靠性 | 未分配主副分片、恢复进度、快照状态 |
| ES 吞吐 | 拒绝、索引时间、Merge、Ingest 失败 |
| ES 成本 | 分片数量、索引增长、磁盘水位 |

JMX 转 Prometheus 或其他 exporter 的指标名受具体 exporter 和配置影响。
应在实际 `/metrics` 上核对名称和标签，不直接把任意博客指标名写进正式告警。


#### 告警设计与故障分层

告警应指向可采取的动作，而不是每个错误日志都发一条通知。
相同根因导致 ES 拒绝、Logstash 重试、Kafka Lag 同时升高时，要分组并保留因果链。

| 告警 | 初步动作 |
| --- | --- |
| 探针不可见 | 按源文件→Kafka→Logstash→ES 逐段定位 |
| Kafka Lag 持续增长 | 看消费是否活跃、PQ 和 ES 是否阻塞 |
| PQ 快满 | 看输出失败，准备恢复容量与源保留窗口 |
| ES 磁盘水位 | 看增长、ILM、恢复和扩容空间 |
| DLQ 或隔离事件增加 | 看具体字段、规则版本和输入变更 |
| 长时间没有快照成功 | 检查仓库权限、失败原因和恢复风险 |

探针、指标和告警渠道最好不要全部依赖同一个待监控日志集群。
否则平台整体不可用时，负责通知的组件也可能一起失效。


#### 把监控结果纳入周报与变更验收

可以跟踪日志可见延迟、采集覆盖率、解析失败率、恢复净吞吐、索引增长和快照恢复结果。
这些比单纯记录“接入了多少个组件”更接近日志平台的实际价值。

但指标定义需要稳定。
如果某周改了采样率或丢弃规则，不能直接把日志量下降解释为业务流量下降或成本优化成功。
报告应标明口径变化和未覆盖区域。


### 21.2 实现经采集入口的探针并识别探针自身失效
<a id="s-21-2"></a>

两个探针都从采集入口写日志，但能力不同：基础 `probe.py` 保留历史状态并可输出 textfile 指标，对照 `probe_v2.py` 只执行一次产品适配探测。需要连续监控时必须安排调度并检测任务停止，不能以新脚本较短为由覆盖旧监控能力。

#### 基础实验：端到端日志探针

探针向被 Filebeat 采集的文件追加一条唯一事件，再通过 ES 查询该事件 ID。
这样覆盖文件采集、Kafka、Logstash、ES 写入和搜索可见性，而不是绕过链路直接向 ES 写入。

测量从本地探针开始到查询可见的时间，使用单调时钟计算延迟，避免本机墙钟调整干扰时长。
它仍包含本地文件写入和查询轮询开销，应称为探针可见延迟，不是某一个组件的纯处理时间。

保存为 `scripts/probe.py`：

```python
#!/usr/bin/env python3
"""写一条采集端探针并查询 ES；只用于本书隔离 lab。"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import uuid


def http_json(base: str, method: str, path: str, body=None, timeout=5.0):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(base + path, data=data, method=method,
                      headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError(f"{method} {path}: {exc}") from exc


def atomic_write(path: Path, content: str, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent,
                                         prefix=path.name + ".", suffix=".tmp",
                                         delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        temporary.replace(path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:9200")
    parser.add_argument("--log-file", default="logs/probe.jsonl")
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--state", default="state/probe.json")
    parser.add_argument("--metrics-file")
    args = parser.parse_args()
    if not 1 <= args.timeout <= 300:
        parser.error("timeout 必须在 1..300 秒")
    base = args.url.rstrip("/")
    state_path = Path(args.state)
    last_success = 0.0
    success = False
    latency = None
    error = None
    event_id = "probe-" + uuid.uuid4().hex
    started_wall = time.time()
    started_mono = time.monotonic()
    try:
        if state_path.exists():
            previous = json.loads(state_path.read_text(encoding="utf-8"))
            last_success = float(previous.get("last_success_timestamp", 0))
        info = http_json(base, "GET", "/", timeout=min(5.0, args.timeout))
        if info.get("cluster_name") != "elk-lab-full":
            raise RuntimeError("拒绝写入探针：不是 elk-lab-full 实验集群")
        record = {
            "time": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "event_id": event_id, "run_id": event_id, "sequence": 0,
            "service": "elk-probe", "environment": "lab",
            "level": "INFO", "message": "ELK synthetic probe",
            "method": "GET", "uri": "/synthetic-probe",
            "status": 200, "request_time": 0.001,
            "trace_id": uuid.uuid4().hex, "scenario": "synthetic-probe",
        }
        log_path = Path(args.log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        # 探针从采集源进入，不通过 ES 写入 API 绕过采集链路。
        with log_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")
            stream.flush()
        deadline = started_mono + args.timeout
        last_poll_error = None
        while time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            body = {
                "size": 1,
                "query": {"term": {"event.id": event_id}},
                "_source": ["event.id", "event.ingested", "pipeline.version"],
            }
            try:
                result = http_json(base, "POST", "/logs-lab/_search", body,
                                   timeout=max(0.1, min(5.0, remaining)))
                if result.get("timed_out") or result.get("_shards", {}).get("failed", 0):
                    raise RuntimeError("探针查询超时或分片部分失败")
                if result.get("hits", {}).get("hits"):
                    success = True
                    latency = time.monotonic() - started_mono
                    last_success = time.time()
                    break
            except RuntimeError as exc:
                last_poll_error = str(exc)
            time.sleep(min(1.0, max(0.0, deadline - time.monotonic())))
        if not success:
            raise RuntimeError(f"探针未在期限内可见；最后查询错误：{last_poll_error}")
    except (RuntimeError, OSError, ValueError, TypeError) as exc:
        error = str(exc)
    result = {
        "event_id": event_id, "success": success, "latency_seconds": latency,
        "last_run_timestamp": started_wall, "last_success_timestamp": last_success,
        "error": error,
    }
    try:
        atomic_write(state_path, json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        if args.metrics_file:
            lines = [
                "# TYPE elk_log_probe_success gauge",
                f"elk_log_probe_success {1 if success else 0}",
                "# TYPE elk_log_probe_last_run_timestamp_seconds gauge",
                f"elk_log_probe_last_run_timestamp_seconds {started_wall:.6f}",
                "# TYPE elk_log_probe_last_success_timestamp_seconds gauge",
                f"elk_log_probe_last_success_timestamp_seconds {last_success:.6f}",
                "# TYPE elk_log_probe_latency_seconds gauge",
                f"elk_log_probe_latency_seconds {latency:.6f}" if latency is not None
                else "elk_log_probe_latency_seconds NaN",
            ]
            atomic_write(Path(args.metrics_file), "\n".join(lines) + "\n", mode=0o644)
    except OSError as exc:
        print(f"ERROR: 保存探针状态失败：{exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if success else 2


if __name__ == "__main__":
    raise SystemExit(main())
```

**手工运行**

```bash
python3 scripts/probe.py --timeout 30
```

预期找到唯一事件，返回 `success: true` 和可见延迟。
未出现时返回非零状态，并保留上次成功时间。
它没有测试 Kibana 用户登录和 Dashboard 渲染；那是另一层用户体验探针。

**避免探针污染业务统计**

探针的服务名固定为 `elk-probe`，场景为 `synthetic-probe`。
业务面板应排除它，或者只选择明确的业务服务。
不要给每次探针生成一个新的 service.name，否则会制造高基数服务标签。


#### 接入现有 Prometheus

脚本支持写入 Node Exporter textfile collector 所读取的 `.prom` 文件。
先在自己的 Node Exporter 配置中启用并确定 textfile 目录，再赋予探针进程最小写权限。[Node Exporter textfile](https://github.com/prometheus/node_exporter#textfile-collector)

```bash
# 目录只是部署示例，应替换为已配置的 textfile collector 路径。
python3 scripts/probe.py \
  --timeout 30 \
  --metrics-file /var/lib/node_exporter/textfile_collector/elk_probe.prom
```

脚本通过同目录临时文件再 rename，避免采集器读到半个文件。
状态文件使用 0600，指标文件使用 0644；目录遍历权限仍须允许 Node Exporter 读取，跨用户部署需按受控组策略配置。
不要把目录开放成任意用户可写。

**需要监控探针本身是否停止运行**

只有 `success` 不够。
如果定时任务不再运行，旧文件可能一直保留最后一次成功值。
因此同时输出最后运行和最后成功时间。

下面是 Prometheus 规则结构示例，阈值仅用于 lab，生产应结合调度周期和可见性目标设定：

```yaml
groups:
  - name: elk-log-probe
    rules:
      - alert: ElkLogProbeFailed
        expr: elk_log_probe_success == 0
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "日志链路探针失败"
          description: "从采集源写入的探针未在期限内通过 ES 查询到。"
      - alert: ElkLogProbeNotRunning
        expr: time() - elk_log_probe_last_run_timestamp_seconds > 180
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "日志探针任务停止更新"
          description: "检查调度任务、脚本、权限及 textfile collector。"
```

还要为指标完全缺失、Node Exporter 不可用配置独立检测。
对多节点使用 `absent` 时要结合预期实例清单，不能只写一个全局 absent 就认为能发现任何单节点缺失。
定时运行须避免上一轮未结束又启动下一轮，可使用 systemd timer 的单实例服务或外部锁。


#### 对照实验完整文件：`tools/probe_v2.py`

经采集入口的产品独立探针。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tools/probe_v2.py -->
```python
"""使用新样本从 Filebeat 入口检查双后端，不直接写搜索后端。"""
import argparse,json,time,uuid
from pathlib import Path
from client import Client,complete_search
from datetime import datetime,timezone
p=argparse.ArgumentParser();p.add_argument('backend',choices=['es','os']);p.add_argument('--timeout',type=int,default=60)
a=p.parse_args()
if not 5<=a.timeout<=300:p.error('timeout 必须 5..300')
c=Client(a.backend,timeout=5);c.guard();run='probe-'+uuid.uuid4().hex
started=time.monotonic();eid=run+'-probe';last=None
app={'time':datetime.now(timezone.utc).isoformat(),'event_id':eid,'run_id':run,
     'service':'orders-api','kind':'probe','level':'INFO','message':'pipeline receipt witness'}
envelope={'run_id':run,'event_id':eid,'scenario':'probe','payload':json.dumps(app)}
Path('logs').mkdir(exist_ok=True)
with Path('logs',run+'.jsonl').open('x') as f:f.write(json.dumps(envelope)+'\n')
while time.monotonic()-started<a.timeout:
    try:
        r=complete_search(c.request('POST','/exp-logs,exp-quarantine/_search?allow_partial_search_results=false',
           {'size':2,'query':{'term':{'event.id':eid}}}))
        hits=r['hits']['hits']
        if len(hits)==1 and hits[0]['_source']['pipeline']['route']=='normal':
            print(json.dumps({'status':'通过','event_id':eid,'latency_seconds':time.monotonic()-started}));break
        if hits:last='隔离或重复，不能视为成功'
    except RuntimeError as exc:last=str(exc)
    time.sleep(1)
else:raise SystemExit('探针失败，最后证据: '+str(last))
```


### 21.3 定义错误率、异常突增与周期日志缺失的统计窗口
<a id="s-21-3"></a>

#### 平台监控与业务告警分开

前面的平台监控关注 Kafka Lag、LS 队列、ES 磁盘等信号。
本章补充业务日志告警：某服务请求错误比例、某种异常突然增多、应周期产生的业务 heartbeat 消失。

平台告警说明观测或存储系统异常；业务告警解释被观测业务的事件。
日志平台失效时，业务日志告警也可能失去数据来源，所以二者不能互相替代。


#### 三类规则的明确口径

| 规则 | 样本契约 | 触发条件 | 恢复前提 |
| --- | --- | --- | --- |
| error-ratio | 每个访问请求恰好一个 nginx.access，有合法状态码 | 窗口内有效请求≥20，5xx/有效请求≥10% | 完整可用数据且比例回落 |
| exception-spike | error.type=InventoryTimeout 的事件 | 窗口内≥5 条 | 数据完整、计数回落；不直接证明依赖健康 |
| heartbeat-missing | orders-api 按约定周期产生 business.heartbeat | 窗口内0条，且同采集链路见证新鲜 | heartbeat重新出现且见证正常 |

这些阈值是实验假设，不是生产默认值。
按 `service.name=orders-api`、`service.environment=lab` 过滤；正常和隔离事件分开，不把无效状态填零纳入分母。
事件采样、同请求多行、重试多次记录、重复回放都会改变计数含义，必须写进告警说明。


#### 迟到容忍与时间水位

每分钟评估一次，但不直接评估刚结束的最近一分钟。
本例使用 `[评估时刻-6分钟, 评估时刻-1分钟)` 的五分钟事件时间窗口，保留一分钟迟到容忍。
另外检查最近两分钟的 `event.ingested` 采集见证。

```text
评估时刻 t
业务窗口： [t-6m ---------------- t-1m)
迟到容忍：                              [t-1m -- t]
采集见证：                       [t-2m -------- t]
```

一分钟不是保证所有晚到日志都已到齐，只是本实验约定。
超出水位的迟到事件可能改变历史统计，需要回补和迟到率监控，不能用提高保留期自动解决告警完整性。
源时钟异常也会导致事件进入错误窗口，应分别观察事件时间、采集时间与入库时间。


### 21.4 配置原生 Monitor 与本地通知并验证触发样本
<a id="s-21-4"></a>

原生 OpenSearch Monitor 使用对照实验的字段与时间窗口，通知发送到实验内的本地接收端。先保留规则默认禁用状态，写入样本并对账后再启用。公共恢复状态机见 [21.5 节](04-production-operations-and-troubleshooting.md#s-21-5)，原生完成状态不自动等于业务已经恢复。

#### 使用原生 Monitor 和 Notifications

OpenSearch 2.19 支持 query-level monitor，通过输入查询结果和条件脚本决定触发，并可通过 Notifications 通道发送消息。[Monitor API](https://docs.opensearch.org/2.19/observing-your-data/alerting/api/) [Notifications API](https://docs.opensearch.org/2.19/observing-your-data/notifications/api/)
本书给三个规则各创建一个监控，显式 `enabled:false`，避免创建即开始持续发送。

[本节的 `native_alerts.py`](04-production-operations-and-troubleshooting.md#s-21-4) 生成完整查询、Painless 条件、每分钟调度和本地 webhook 动作。
通道使用 Docker 网络内的 `http://receiver:8080/notify`，不向外部邮箱或聊天群发消息。
如果安装策略限制私网 webhook，记录明确拒绝原因，在隔离实验中按官方设置放行精确目标；不要在生产开放任意地址出站。

```bash
python3 tools/native_alerts.py
# 审阅打印的 channel 和 monitors 后执行：
python3 tools/native_alerts.py --apply
python3 tools/native_control.py dryrun > evidence/native-dryrun.jsonl
```

原生 `_execute?dryrun=true` 用于观察运行结果而不发送消息；真实运行结果要检查整体 error、trigger error 和 action_results，而不只看 HTTP 成功。[原生执行接口](https://docs.opensearch.org/2.19/observing-your-data/alerting/api/)


#### 触发、通知与持续异常

```bash
python3 tools/generate.py --run-id alert-trigger --count 100 --profile trigger
# 等待入库，并先按第35章对这批数据验收。
python3 tools/native_control.py dryrun > evidence/native-trigger-dryrun.jsonl
python3 tools/native_control.py execute --apply > evidence/native-trigger-send.jsonl
python3 tools/native_control.py alerts > evidence/native-alert-status.jsonl
```

接收端会把通知原体保存到 `evidence/notifications.jsonl`。
Painless、Mustache 和真实 Notifications 的运行均属于本地待执行项目；Python 能构造 JSON 不证明它们已经在 OpenSearch 执行成功。

启停脚本会先读取服务端监控对象，保留 trigger/action ID，并用序列号和 primary term 做乐观并发控制。
这避免用最初创建的旧 JSON 覆盖后来在 UI 中的规则变更；真实并发冲突应停止并重新审阅。

确认规则语义后再开启持续调度：

```bash
python3 tools/native_control.py enable --apply
# 完成实验后关闭，保留规则对象与证据。
python3 tools/native_control.py disable --apply
```

三类状态分开记录：Monitor 执行是否成功、是否生成告警、动作是否成功送达接收端。
Webhook 200 只证明接收程序确认，不代表某位人员已处理。


#### 三类规则的样本矩阵

| 场景 | 生成器/动作 | 预期（不是实测） |
| --- | --- | --- |
| 正常 | normal，100条 | ratio OK，exception OK，有 heartbeat |
| 触发 | trigger，100条 | ratio ALERT，exception ALERT |
| 持续 | 同批次重新评估 | 十分钟内公共状态机去重 |
| 恢复 | recovery，受控新批次 | 数据完整时 RESOLVED |
| 迟到 | late | 访问事件不在当前窗口，ratio UNKNOWN；不伪造恢复 |
| 无业务 heartbeat | missing | 见证可见时 heartbeat ALERT |
| 无采集见证 | 停采集后等待见证过期 | UNKNOWN，不恢复业务 incident |
| 查询失败/部分分片 | 断后端或失败响应夹具 | UNKNOWN/执行失败，不用部分计数 |
| 低流量 | count小于20 | ratio UNKNOWN，其他规则按各自契约 |

Java 多行异常与请求错误日志不一定一一对应。
本书 exception-spike 指定一种错误类型，不把任意 ERROR 字符串数当成业务失败请求数。
生产中重复堆栈可能需要同请求去重或独立定义“异常事件数”指标。


#### 对照实验完整文件：`tools/native_alerts.py`

OS 原生监控和本地通知通道。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tools/native_alerts.py -->
```python
"""OpenSearch 原生 query-level monitor；公共 Python 评估器补充受门控的恢复通知。"""
from datetime import datetime,timezone
import argparse,json
from pathlib import Path
from client import Client
from alerts import query

def monitors(channel,run_id=None):
    guard=("if(ctx.results.size()!=1) return false; def r=ctx.results[0]; "
           "if(r.timed_out==true || r._shards.failed>0) return false; "
           "def a=r.aggregations; if(a.witness.doc_count==0) return false; def w=a.window; ")
    expressions={
        'error-ratio':'w.valid.doc_count>=20 && w.errors.doc_count*1.0/w.valid.doc_count>=0.10',
        'exception-spike':'w.exceptions.doc_count>=5',
        'heartbeat-missing':'w.heartbeat.doc_count==0'}
    docs=[]
    for name,expr in expressions.items():
        docs.append({'type':'monitor','name':'exp-'+name,'monitor_type':'query_level_monitor',
          'enabled':False,'schedule':{'period':{'interval':1,'unit':'MINUTES'}},
          'inputs':[{'search':{'indices':['exp-logs'],'query':query(datetime.now(timezone.utc),run_id,native=True)}}],
          'triggers':[{'name':name,'severity':'2','condition':{'script':{'lang':'painless','source':guard+'return '+expr+';'}},
            'actions':[{'name':'exp-local','destination_id':channel,
                'message_template':{'lang':'mustache','source':json.dumps({'engine':'os-native','rule':name,
                    'monitor':'{{ctx.monitor.name}}','period_end':'{{ctx.periodEnd}}'})},
                'throttle_enabled':True,'throttle':{'value':10,'unit':'MINUTES'}}]}]})
    return docs

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--apply',action='store_true');p.add_argument('--run-id')
    p.add_argument('--output',default='evidence/native-monitors.json');a=p.parse_args()
    c=Client('os');c.guard()
    channel={'config_id':'exp-local','name':'exp-local','config':{
        'name':'exp-local','description':'isolated learning receiver','config_type':'webhook',
        'is_enabled':True,'webhook':{'url':'http://receiver:8080/notify'}}}
    docs=monitors('exp-local',a.run_id)
    if not a.apply:
        print(json.dumps({'channel':channel,'monitors':docs,'status':'未执行'},ensure_ascii=False,indent=2))
    else:
        path=Path(a.output)
        if path.exists():raise RuntimeError('监控 ID 清单已存在，不重复创建')
        channel_id=c.request('POST','/_plugins/_notifications/configs/',channel)['config_id']
        result=[]
        for doc in monitors(channel_id,a.run_id):
            r=c.request('POST','/_plugins/_alerting/monitors',doc)
            result.append({'id':r['_id'],'name':doc['name'],'body':doc})
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(json.dumps({'channel_id':channel_id,'monitors':result},ensure_ascii=False,indent=2))
        print(path)
```


#### 对照实验完整文件：`tools/native_control.py`

监控预演、执行、启停和状态。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tools/native_control.py -->
```python
"""管理保存的实验监控；启停先读服务端对象，保留 trigger/action ID 并使用乐观锁。"""
from __future__ import annotations
import argparse,copy,json,re,time
from pathlib import Path
from urllib.parse import quote
from client import Client


def change_enabled(c, item, enabled):
    ident=item['id']
    if not re.fullmatch(r'[A-Za-z0-9_-]+',ident):raise ValueError('监控 ID 格式不合法')
    base='/_plugins/_alerting/monitors/'+ident
    current=c.request('GET',base)
    doc=copy.deepcopy(current['monitor'])
    if doc.get('name')!=item['name'] or not item['name'].startswith('exp-'):
        raise RuntimeError('服务端监控名称与本地实验清单不符')
    doc['enabled']=enabled
    doc['enabled_time']=int(time.time()*1000) if enabled else None
    # 从真实读取响应取得版本；不拿本地最初创建的旧 body 覆盖 UI 中的修改。
    seq,term=current['_seq_no'],current['_primary_term']
    if type(seq) is not int or type(term) is not int:raise RuntimeError('缺少监控并发版本')
    return c.request('PUT',f'{base}?if_seq_no={seq}&if_primary_term={term}',doc)


def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['dryrun','execute','enable','disable','alerts'])
    p.add_argument('--file',default='evidence/native-monitors.json');p.add_argument('--apply',action='store_true');a=p.parse_args()
    c=Client('os');c.guard();config=json.loads(Path(a.file).read_text())
    if a.action in ('enable','disable','execute') and not a.apply:raise SystemExit('修改/发送通知须显式 --apply')
    for item in config['monitors']:
        if not item['name'].startswith('exp-'):raise RuntimeError('非实验监控')
        ident=quote(item['id'],safe='');base='/_plugins/_alerting/monitors/'+ident
        if a.action in ('enable','disable'):
            result=change_enabled(c,item,a.action=='enable')
        elif a.action=='alerts':
            result=c.request('GET','/_plugins/_alerting/monitors/alerts?monitorId='+ident)
        else:result=c.request('POST',base+'/_execute'+('?dryrun=true' if a.action=='dryrun' else ''))
        print(json.dumps({'monitor':item['name'],'result':result},ensure_ascii=False))

if __name__=='__main__':main()
```


#### 对照实验完整文件：`receiver/server.py`

本地通知接收端，仅实验网络。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: receiver/server.py -->
```python
"""仅实验网络内使用的通知接收器。原生通知与脚本通知都保存原体。"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json,time,threading
LOCK=threading.Lock()
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path!='/health':self.send_error(404);return
        self.send_response(200);self.end_headers();self.wfile.write(b'ok')
    def do_POST(self):
        if self.path!='/notify':self.send_error(404);return
        try:n=int(self.headers.get('Content-Length','0'))
        except ValueError:self.send_error(400);return
        if not 0<n<=65536:self.send_error(413);return
        raw=self.rfile.read(n).decode('utf-8',errors='replace')
        record={'received_at':time.time(),'path':self.path,'body':raw}
        folder=Path('/evidence');folder.mkdir(exist_ok=True)
        with LOCK, (folder/'notifications.jsonl').open('a',encoding='utf-8') as f:
            f.write(json.dumps(record,ensure_ascii=False)+'\n');f.flush()
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers()
        self.wfile.write(b'{"accepted":true}')
    def log_message(self,format,*args):pass
if __name__=='__main__':ThreadingHTTPServer(('0.0.0.0',8080),Handler).serve_forever()
```


### 21.5 用 UNKNOWN、去重、outbox 和恢复状态避免误报
<a id="s-21-5"></a>

#### 无数据、查询错误与业务恢复

| 结果 | 解释 | 是否允许业务恢复通知 |
| --- | --- | --- |
| 查询失败或超时 | 无法得出业务结论 | 否 |
| 部分分片失败 | 统计可能偏小 | 否 |
| 有效请求<20 | 比例不稳或没有请求 | error-ratio 不允许 |
| 无采集见证 | 观测链路可能中断 | 否 |
| 有见证、无业务 heartbeat | 符合缺失规则前提 | 可触发 heartbeat 告警 |
| 完整有效数据、指标回落 | 可以评估恢复 | 按恢复策略处理 |

公共状态机把 UNKNOWN 与 OK 分开。
UNKNOWN 保留已有 incident，不发送 RESOLVED；数据再次有效后才决定继续告警或恢复。
这避免“后端挂了，错误日志变成0，系统报告恢复”的常见逻辑错误。

采集见证只证明其实际经过的路径，并不证明其他所有节点、分区或业务实例完整。
生产中应按来源分片建立预期集合和覆盖率；本书单服务见证仅用于展示门控机制。


#### 分组、去重、抑制与下钻

公共评估器按 `backend/environment/service/rule` 建立 incident key。
首次触发通知 FIRING，持续异常十分钟后允许 REMINDER，合法恢复发送 RESOLVED。
这个设计是本书实现的行为，不是所有原生告警系统的默认行为。

通知包含评估时刻、窗口口径、计数和来源引擎，便于回到 Dashboards 的绝对时间窗口与相同过滤条件。
同一个事件同时被原生 OS Monitor 和公共评估器通知，在比较实验中是有意的双引擎证据；生产只能选择明确的通知责任，避免双份告警。

抑制可以将“采集链路不可用”作为不下业务结论的原因，但不能无记录地吞掉所有告警。
公共脚本打印 UNKNOWN 和错误，生产调度应将其转成独立平台告警。


#### 原生完成状态不等于可证明的业务恢复

某次条件不成立可能由业务正常、数据缺失或规则变更造成。
本书不将原生 COMPLETED 自动翻译成“故障已解决”，也不承诺 query-level monitor 自动完成全部恢复通知语义。

为了给出完整且可复现的恢复过程，使用公共 `alerts.py` 执行同一查询口径，并加上 UNKNOWN 门控、持久 incident 状态和通知 outbox。
这同样是 Elastic 7.17 的默认对照路径：只调用搜索 API，不要求先启用特定收费连接器或 Watcher 许可证。
如果实际使用 Watcher/Kibana Rules，应单独核对版本、许可证、连接器和权限，不能以此替代本书的公共验收。[ES Watcher 条件](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/xpack-alerting.html)

```bash
# 预览不写状态、也不发送通知。
python3 tools/alerts.py os --run-id alert-trigger
# 显式发送到本地接收端并记录 incident。
python3 tools/alerts.py os --run-id alert-trigger --send
python3 tools/generate.py --run-id alert-recovery --count 100 --profile recovery
# 等待并对账后，用受控批次切换模拟恢复观察：
python3 tools/alerts.py os --run-id alert-recovery --send
```

`--run-id` 是实验隔离开关，便于按受控批次验证状态机。
生产持续规则不应每分钟换一个 run_id 过滤掉旧异常，应按同一业务流与滑动窗口评估。
原生 monitor 默认不加 run_id，故此前异常仍在五分钟窗口内时不会立即恢复；应等窗口自然推进，或在独立测试监控中显式修改批次过滤并记录该条件变化。


#### 通知失败、outbox 和状态持久化

公共脚本先持久化待发送通知，再发送并确认后删除 outbox 项。
失败时保留待发送项目，下一次执行先重试。
发送成功但进程在更新 outbox 前退出，仍可能重发，因此通知中包含 notice_id，接收平台应做幂等去重。
本书接收器保存原体，不冒充具备生产幂等通知服务。

状态文件用原子替换并加文件锁，防止本机 cron 重叠执行。
这不是分布式锁或多实例协调实现；部署多个调度副本前必须补齐唯一执行责任和共享持久状态。


#### 业务告警后的排查动作

错误率升高：先确认采集与分母完整，再按 route、实例、状态码缩小范围，读取对应原文与 Trace ID。
异常突增：确认是新错误类型、重试放大还是堆栈重复；不要仅根据关键字推断根因。
heartbeat 缺失：检查业务调度、实例运行和采集见证，区分任务未执行、日志未产生和日志未送达。

每次复盘保存查询窗口、样本量、缺失说明、告警状态变迁、通知与恢复证据。
日志是不完备观测，不应在漏采、采样或重复未控制时作为权威财务/订单计数。


#### 对照实验完整文件：`tools/alerts.py`

业务规则、UNKNOWN 门控、状态与 outbox。下面是完整文件；保存路径相对于双后端对照实验根目录。

<!-- file: tools/alerts.py -->
```python
"""两后端共用的实验告警评估器；不是完整调度平台。"""
from __future__ import annotations
import argparse,copy,fcntl,hashlib,json,os,tempfile,time
from datetime import datetime,timezone,timedelta
from pathlib import Path
from urllib.request import Request,urlopen
from client import Client,complete_search

RULES=('error-ratio','exception-spike','heartbeat-missing')
def query(now: datetime, run_id=None, native=False):
    fmt=lambda d:d.astimezone(timezone.utc).isoformat(timespec='milliseconds')
    bounds=({'gte':'{{period_end}}||-6m','lt':'{{period_end}}||-1m','format':'epoch_millis'} if native
            else {'gte':fmt(now-timedelta(minutes=6)),'lt':fmt(now-timedelta(minutes=1))})
    fresh=({'gte':'{{period_end}}||-2m','lte':'{{period_end}}','format':'epoch_millis'} if native
           else {'gte':fmt(now-timedelta(minutes=2)),'lte':fmt(now)})
    filters=[{'term':{'service.name':'orders-api'}},{'term':{'service.environment':'lab'}}]
    if run_id:filters.append({'term':{'labels.run_id':run_id}})
    valid={'bool':{'filter':[{'term':{'event.dataset':'nginx.access'}},
                             {'range':{'http.response.status_code':{'gte':100,'lt':600}}}]}}
    return {'size':0,'track_total_hits':True,'query':{'bool':{'filter':filters}},'aggs':{
        'window':{'filter':{'range':{'@timestamp':bounds}},'aggs':{
            'valid':{'filter':valid},
            'errors':{'filter':{'bool':{'filter':[valid,{'range':{'http.response.status_code':{'gte':500,'lt':600}}}]}}},
            'exceptions':{'filter':{'term':{'error.type':'InventoryTimeout'}}},
            'heartbeat':{'filter':{'term':{'event.dataset':'business.heartbeat'}}}}},
        'witness':{'filter':{'bool':{'filter':[{'term':{'event.dataset':'pipeline.probe'}},
                                                       {'range':{'event.ingested':fresh}}]}}}}}

def evaluate(result):
    complete_search(result)
    aggs=result['aggregations'];w=aggs['window']
    counts={k:w[k]['doc_count'] for k in ('valid','errors','exceptions','heartbeat')}
    counts['witness']=aggs['witness']['doc_count']
    if any(type(v) is not int or v<0 for v in counts.values()) or counts['errors']>counts['valid']:
        raise ValueError('计数结构或分子分母不一致')
    if counts['witness']==0:return {k:'UNKNOWN' for k in RULES},counts
    values={
        'error-ratio':('UNKNOWN' if counts['valid']<20 else ('ALERT' if counts['errors']/counts['valid']>=0.10 else 'OK')),
        'exception-spike':'ALERT' if counts['exceptions']>=5 else 'OK',
        'heartbeat-missing':'ALERT' if counts['heartbeat']==0 else 'OK'}
    return values,counts

def transition(previous,outcome,now,repeat=600):
    old=copy.deepcopy(previous or {'active':False,'last_notice':0})
    if outcome=='UNKNOWN':
        old['observation']='UNKNOWN';return old,None
    if outcome not in ('OK','ALERT'):raise ValueError(outcome)
    notice=None
    if outcome=='ALERT':
        if not old['active']:notice='FIRING'
        elif now-old.get('last_notice',0)>=repeat:notice='REMINDER'
        old['active']=True
    elif old['active']:
        old['active']=False;notice='RESOLVED'
    old['observation']=outcome
    if notice:old['last_notice']=now
    return old,notice

def atomic_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile('w',dir=path.parent,delete=False,encoding='utf-8') as f:
        temp=Path(f.name);json.dump(data,f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
    os.chmod(temp,0o600);temp.replace(path)

def deliver(payload):
    req=Request('http://127.0.0.1:18080/notify',data=json.dumps(payload).encode(),
                headers={'Content-Type':'application/json'},method='POST')
    with urlopen(req,timeout=5) as response:
        if response.status!=200:raise RuntimeError('通知接收端未确认')
        response.read(1024)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('backend',choices=['es','os']);p.add_argument('--run-id')
    p.add_argument('--state');p.add_argument('--send',action='store_true');a=p.parse_args()
    state_path=Path(a.state or f'evidence/alert-state-{a.backend}.json')
    state_path.parent.mkdir(parents=True,exist_ok=True)
    with state_path.with_suffix('.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        state=json.loads(state_path.read_text()) if state_path.exists() else {'rules':{},'pending':[]}
        if a.send:
            # 先重试持久化 outbox；失败不丢弃。接收端按 notice_id 去重是生产扩展点。
            while state['pending']:
                deliver(state['pending'][0]);state['pending'].pop(0);atomic_json(state_path,state)
        c=Client(a.backend);c.guard();now=datetime.now(timezone.utc)
        try:
            response=c.request('POST','/exp-logs/_search?allow_partial_search_results=false',query(now,a.run_id))
            values,counts=evaluate(response);error=None
        except (RuntimeError,ValueError,KeyError,TypeError) as exc:
            values={k:'UNKNOWN' for k in RULES};counts={};error=str(exc)
        notices=[]
        for rule in RULES:
            key=f'{a.backend}/lab/orders-api/{rule}'
            updated,notice=transition(state['rules'].get(key),values[rule],now.timestamp())
            if notice:
                payload={'engine':'exp-python','key':key,'status':notice,'counts':counts,
                         'evaluated_at':now.isoformat(),'late_tolerance_seconds':60}
                payload['notice_id']=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
                notices.append(payload)
                if a.send:state['pending'].append(payload)
            state['rules'][key]=updated
        result={'outcomes':values,'counts':counts,'error':error,'notifications':notices,'send':a.send}
        # 预览不修改持久状态；避免预览吞掉第一次正式通知。
        if a.send:
            atomic_json(state_path,state)
            while state['pending']:
                deliver(state['pending'][0]);state['pending'].pop(0);atomic_json(state_path,state)
        print(json.dumps(result,ensure_ascii=False,indent=2))
        raise SystemExit(2 if 'UNKNOWN' in values.values() else 0)
```



## 第 22 章 · 安全连接、权限与日志治理

### 22.1 为后端和可视化启用 TLS 并验证信任链
<a id="s-22-1"></a>

#### 实验安全边界与生产差异

本书最小 lab 使用无认证、仅绑定本机回环地址的服务，目的是减少入门变量。
这不等于“内网可以不启用安全”。
生产应分别保护数据源、采集器、Kafka、Logstash 管理接口、ES、Kibana 和快照仓库。

| 边界 | 应控制 |
| --- | --- |
| 文件与容器日志 | 最小读取范围，避免采集宿主全部敏感文件 |
| Filebeat → Kafka | TLS、生产者身份、Topic 写权限 |
| Kafka → Logstash | 消费者身份、Topic 和 Group 权限 |
| Logstash → ES | TLS、限定索引写权限 |
| 用户 → Kibana | 登录、Space 与索引读取权限 |
| 节点间 ES Transport | 节点身份和双向 TLS |
| 快照仓库 | 写入者、只读恢复者、独立凭据和保留策略 |

凭据只放在受控配置、Secret、Keystore 或组织的密钥系统中。
不要把真实密码、Token、私钥或完整连接串写入公开笔记和 Git 仓库。


#### Elasticsearch 7.17 的安全启用顺序

7.17 的自管安全配置不能直接套用较新版本的 enrollment token 启动教程。
应使用该版本的安全设置与证书工具。[基础安全](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/security-basic-setup.html)

```text
确定 DNS、IP 和证书 SAN
→ 生成或申请专用证书
→ 所有节点配置 Transport TLS
→ 配置 HTTP TLS
→ 受控重启并验证集群身份
→ 初始化内置用户密码
→ 配置 Kibana 与 Logstash 专用身份
→ 验证最小权限和越权拒绝
```

已有明文 Transport 集群切换到 TLS 不应被当作随意逐台滚动的无中断操作。
明文节点和 TLS 节点不能正常互通，该变化应按官方版本要求设计维护窗口与重启计划。
证书轮换又是另一种变更，不能与首次启用混为一谈。

**生成 Transport 证书**

在受控环境使用 Elasticsearch 7.17.29 自带工具。
CA 私钥不应复制到每个运行节点。

```bash
# 交互式工具，会询问输出文件与密码。
bin/elasticsearch-certutil ca
bin/elasticsearch-certutil cert --ca elastic-stack-ca.p12 --multiple
```

为每个节点填写真实名称、DNS 和 IP，生成各自的证书。
选择 `verification_mode: full` 时，证书 SAN 必须匹配实际连接名称。
不能因为校验失败就直接把验证关掉。

**节点配置片段**

```yaml
xpack.security.enabled: true
xpack.security.transport.ssl.enabled: true
xpack.security.transport.ssl.verification_mode: full
xpack.security.transport.ssl.client_authentication: required
xpack.security.transport.ssl.keystore.path: certs/es-1.p12
xpack.security.transport.ssl.truststore.path: certs/es-1.p12
```

其他节点使用各自证书。
证书文件路径相对 ES 配置目录，运行用户必须可读，私钥不应公开可读。
密码通过 Keystore 交互设置：

```bash
bin/elasticsearch-keystore add xpack.security.transport.ssl.keystore.secure_password
bin/elasticsearch-keystore add xpack.security.transport.ssl.truststore.secure_password
```


#### HTTP TLS、Kibana 与客户端信任

Transport TLS 保护节点间通信，HTTP TLS 保护客户端到 ES 的连接，两者需要分别配置。[HTTPS 设置](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/security-basic-setup-https.html)

```bash
bin/elasticsearch-certutil http
```

使用真实访问域名与 IP 申请每个节点的 HTTP 证书。
按工具生成的 README 部署，不应把示例文件名理解为所有节点共用一个私钥。

```yaml
xpack.security.http.ssl.enabled: true
xpack.security.http.ssl.keystore.path: certs/http.p12
```

```bash
bin/elasticsearch-keystore add xpack.security.http.ssl.keystore.secure_password

# 首次设置内置用户密码。不要把输出密码提交到终端录屏或工单。
bin/elasticsearch-setup-passwords interactive
```

该密码初始化工具用于相应的初始状态，不是每次重启都运行的步骤。
已经初始化的环境需要按该版本的密码管理流程修改凭据。

**Kibana 到 ES**

```yaml
elasticsearch.hosts:
  - https://es-1.example.internal:9200
  - https://es-2.example.internal:9200
elasticsearch.username: kibana_system
elasticsearch.ssl.certificateAuthorities:
  - /etc/kibana/certs/elasticsearch-ca.pem
```

密码写入 Kibana Keystore，不放在上述公开配置中：

```bash
bin/kibana-keystore create
bin/kibana-keystore add elasticsearch.password
```

已有 Keystore 不要盲目重建。
`kibana_system` 用于 Kibana 服务连接 ES，不是给用户登录界面的共享管理员账号。

**浏览器到 Kibana**

```yaml
server.ssl.enabled: true
server.ssl.certificate: /etc/kibana/certs/kibana.crt
server.ssl.key: /etc/kibana/certs/kibana.key
```

如果前方由受控反向代理终止 TLS，要明确代理到 Kibana 的网络与信任边界。
不能只看到浏览器地址为 HTTPS，就认为后面所有链路都已加密。


### 22.2 配置 Kafka 与采集加工链路的认证和最小权限
<a id="s-22-2"></a>

#### Elasticsearch 最小权限

本书由管理员预创建模板、Ingest Pipeline、ILM、索引和别名。
Logstash 只写入被允许的目标，不需要使用 `elastic` 超级用户长期运行。[Logstash 安全](https://www.elastic.co/guide/en/logstash/7.17/ls-security.html)

以下是角色定义示例，提交角色 API 需要管理员权限。
名称范围必须按实际租户进一步收窄，不能让所有业务共享一个无限制写角色。

```json
{
  "cluster": ["monitor"],
  "indices": [
    {
      "names": ["logs-lab", "logs-lab-*"],
      "privileges": ["write", "view_index_metadata"]
    }
  ]
}
```

这是预创建资源、关闭自动模板和插件 ILM 管理的配置边界。
写入账号没有创建模板、删除索引或管理生命周期的权限。
如果实际插件操作报缺少某个权限，应根据审计中的具体 API 评估是否需要，而不是直接升级为超级用户。

查询账号可以使用：

```json
{
  "cluster": [],
  "indices": [
    {
      "names": ["logs-lab", "logs-lab-*"],
      "privileges": ["read", "view_index_metadata"]
    }
  ]
}
```

这只是 ES 索引权限部分。
使用 Kibana 还需要相应的 Kibana 功能和 Space 权限，不能只创建这个角色就假设所有 UI 都可用。
需要字段级、文档级等更细粒度控制时，另核对 7.17 对应功能和许可边界。

**反向验证**

写账号应该能写允许的别名，但不能读取不授权的敏感索引、删除索引或修改模板。
读账号应该能检索允许的数据，但不能写入或修改生命周期。
正向成功和越权拒绝都要验证，才是权限验收。


#### Kafka 2.8 的认证与 ACL

Kafka 的认证回答“你是谁”，ACL 回答“你能对哪些资源做什么”。
TLS 负责保护通信和证书校验，不等于自动具有 Topic 授权。[Kafka SASL](https://kafka.apache.org/28/security/authentication-using-sasl/)、[Kafka ACL](https://kafka.apache.org/28/security/authorization-and-acls/)

生产可以根据组织能力选择 SASL/SCRAM 与 TLS 等组合。
下面以已有受控 `SASL_SSL` 集群为客户端示例，不在本书中伪造一套组织 PKI 或公开明文管理员凭据。

**Broker 侧必须核对的内容**

| 配置类别 | 核对点 |
| --- | --- |
| Listeners | 内外部地址与安全协议映射一致 |
| advertised.listeners | 客户端可达，证书 SAN 匹配 |
| TLS | Keystore、Truststore、证书有效期和权限 |
| SASL | 启用机制、broker 间认证、用户凭据 |
| Authorizer | Kafka 2.8 的 `kafka.security.authorizer.AclAuthorizer` |
| 默认访问 | 没有 ACL 的资源不应默认对所有人开放 |
| 管理者 | 超级用户仅用于受控管理，不给采集器使用 |
| ZooKeeper | 访问隔离、认证和管理权限另行保护 |

`allow.everyone.if.no.acl.found=false` 是需要明确审阅的拒绝默认值策略。
首次启用 ACL 前必须准备好 broker 内部通信和管理者权限，否则可能把集群自己锁住。

**对已认证集群添加精确授权**

下面 `admin.properties` 是由部署系统生成、权限受控的真实客户端配置，不是把密码写进公开示例。
命令会修改 ACL，执行前应检查目标集群和资源。

```bash
bin/kafka-acls.sh \
  --bootstrap-server kafka-1.example.internal:9093 \
  --command-config /etc/kafka/admin.properties \
  --add --allow-principal User:filebeat-logs \
  --operation Write --operation Describe \
  --topic prod-logs-raw

bin/kafka-acls.sh \
  --bootstrap-server kafka-1.example.internal:9093 \
  --command-config /etc/kafka/admin.properties \
  --add --allow-principal User:logstash-logs \
  --operation Read --operation Describe \
  --topic prod-logs-raw

bin/kafka-acls.sh \
  --bootstrap-server kafka-1.example.internal:9093 \
  --command-config /etc/kafka/admin.properties \
  --add --allow-principal User:logstash-logs \
  --operation Read --operation Describe \
  --group prod-logs-main-v1
```

Filebeat 不需要创建或删除 Topic。
Logstash 不需要读取所有消费组和所有 Topic。
需要回放时，为明确的回放组授权，不把长期权限扩大到通配符全部资源。


#### Filebeat、Logstash 的安全连接片段

下面替换对应输出/输入的连接字段，保留原本的 Topic、Codec、队列与路由配置。
客户端连接示例以前置的真实证书、SASL 用户和 ACL 已完成为条件。

**Filebeat 到 Kafka**

```yaml
output.kafka:
  hosts:
    - kafka-1.example.internal:9093
    - kafka-2.example.internal:9093
    - kafka-3.example.internal:9093
  version: "2.0.0"
  topic: prod-logs-raw
  required_acks: -1
  compression: gzip
  username: filebeat-logs
  password: "${KAFKA_PASSWORD}"
  sasl.mechanism: SCRAM-SHA-512
  ssl.certificate_authorities:
    - /etc/filebeat/certs/kafka-ca.pem
```

`KAFKA_PASSWORD` 可由 Filebeat Keystore 提供，示例不包含真实值。
`version` 仍是 Filebeat Kafka 协议设置，不是 broker 2.8.2 的字面版本号。

```bash
filebeat keystore create
filebeat keystore add KAFKA_PASSWORD
```

已有 Keystore 应直接增加或更新条目，不要重建覆盖其他密钥。

**Logstash 从 Kafka 读取**

```logstash
kafka {
  bootstrap_servers => "kafka-1.example.internal:9093,kafka-2.example.internal:9093"
  topics => ["prod-logs-raw"]
  group_id => "prod-logs-main-v1"
  security_protocol => "SASL_SSL"
  sasl_mechanism => "SCRAM-SHA-512"
  sasl_jaas_config => "org.apache.kafka.common.security.scram.ScramLoginModule required username='logstash-logs' password='${KAFKA_PASSWORD}';"
  ssl_truststore_location => "/etc/logstash/certs/kafka-truststore.jks"
  ssl_truststore_password => "${KAFKA_TRUSTSTORE_PASSWORD}"
  enable_auto_commit => false
  decorate_events => "basic"
  codec => json
}
```

使用之前应在 10.12.2 插件和 JVM 环境中验证 Truststore 格式及 JAAS 解析。
模板变量由 Logstash 配置替换解析，不应把含 `${...}` 的文件不经处理交给任意 Kafka Java 客户端后假设它会自动展开。

**Logstash 到 ES**

固定 11.4.2 Elasticsearch output 使用该版本的配置名：

```logstash
elasticsearch {
  hosts => ["https://es-1.example.internal:9200", "https://es-2.example.internal:9200"]
  user => "logstash_writer"
  password => "${ES_WRITER_PASSWORD}"
  ssl => true
  cacert => "/etc/logstash/certs/elasticsearch-ca.pem"
  index => "prod-logs"
  manage_template => false
  ilm_enabled => false
}
```

不要直接替换成较新插件的 TLS 参数名称，再声称它适用于 7.17.29 默认插件。
`prod-logs`、相应模板和生命周期必须由管理员预先创建。


### 22.3 轮换凭据与证书并验证连接与授权边界
<a id="s-22-3"></a>

凭据轮换不是只替换服务端密码：客户端缓存、连接池和证书信任链也必须一起验证。先准备可回退的凭据或证书，再逐个更新调用方，观察认证失败与新连接；在确认旧凭据不再使用后才能撤销，避免把所有采集端同时切断。

#### 凭据轮换、证书过期与变更验证

轮换时先让服务端接受新凭据或新信任链，再逐步更新客户端，确认成功后撤销旧凭据。
可否同时保留旧新身份取决于实际认证方案，不能一律假设无中断。

| 变更 | 验证 |
| --- | --- |
| 密码轮换 | 所有副本都使用新值，旧值按计划失效 |
| CA 轮换 | 客户端 Truststore、服务端证书链与 SAN |
| Topic ACL | 允许操作成功，越权操作被拒绝 |
| ES 角色调整 | 模板管理与写入分权没有被破坏 |
| K8s Secret 更新 | 进程是否需要重启，挂载方式是否支持更新 |

证书即将过期应提前告警，不要等到 Filebeat 或 Logstash 连接失败后才发现。
配置热加载能力应按组件、文件挂载方式和版本逐项验证。


### 22.4 处理敏感字段、原始日志、隔离数据和审计证据
<a id="s-22-4"></a>

同一条敏感信息可能同时存在于业务字段、message、event.original、隔离索引、DLQ 和导出证据里。治理时沿整条数据路径检查副本，不能只把某个索引字段设为不索引就认为已经脱敏。删除或采样还会改变故障复盘与告警分母，应留下可解释的策略记录。

#### 敏感数据、原始日志与审计

保留原始日志有利于排障，也意味着可能长期保存敏感信息。
`event.original` 关闭索引只是不建立检索结构，不会从 `_source` 或备份中删除内容。

建议建立字段分类和采集白名单：

| 信息 | 处理方向 |
| --- | --- |
| 密码、Token、Cookie、私钥 | 不记录，源头禁止优先 |
| 个人标识与联系方式 | 按业务必要性脱敏或受控访问 |
| 请求体 | 默认不全量记录，按明确诊断需求采样与脱敏 |
| 内部地址、节点信息 | 权限控制，公开报告去标识 |
| SQL 或业务参数 | 避免直接记录敏感值，保留结构化错误类型 |

脱敏最好在离开信任边界之前完成。
只在 Kibana 展示时遮盖，不会清除 Kafka、ES `_source`、DLQ、PQ 和 Snapshot 中的原值。
错误日志和失败旁路也必须遵循同样的安全规则。



## 第 23 章 · 备份恢复、节点维护与版本变更

### 23.1 创建快照并以重命名目标完成隔离恢复
<a id="s-23-1"></a>

#### Snapshot 与复制不是一回事

副本保护部分节点故障；Snapshot 提供另一个恢复时间点。
误删索引会影响主副本，不能指望副本保留一份未删除的历史数据。[Snapshot](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/snapshot-restore.html)

本书用单节点文件系统仓库演示接口。
它与 ES 数据卷在同一台机器时不能抵抗整机或磁盘域故障，生产应选择独立故障域的受控仓库。

**给实验 ES 配置仓库路径**

第二篇 Compose 已挂载 `es-snapshots:/mnt/snapshots`，但还没有启用 `path.repo`。
把以下键合并进 `services.elasticsearch.environment`：

```yaml
path.repo: /mnt/snapshots
```

先确认路径权限，再重建 ES 服务使启动参数生效。
下面只修改实验的快照目录，不递归修改 ES 数据目录。

```bash
docker compose -p elk-full run --rm --no-deps --user root \
  elasticsearch sh -c 'chown 1000:0 /mnt/snapshots && chmod 750 /mnt/snapshots'

docker compose -p elk-full up -d --no-deps elasticsearch

curl -fsS 'http://127.0.0.1:9200/_nodes/settings?pretty'
```

重建期间 ES 暂时不可用，主链路依靠 Kafka/PQ 等缓冲；恢复后应检查积压。
生产多节点共享文件系统仓库要求各相关节点按一致路径访问共享内容，而不是每台创建一个同名但不共享的本地目录。[注册仓库](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/snapshots-register-repository.html)


#### 注册与验证仓库

```bash
curl -fsS -X PUT 'http://127.0.0.1:9200/_snapshot/elk-lab-fs?pretty' \
  -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{
  "type": "fs",
  "settings": {
    "location": "/mnt/snapshots",
    "compress": true
  }
}
JSON

curl -fsS -X POST 'http://127.0.0.1:9200/_snapshot/elk-lab-fs/_verify?pretty'
```

仓库验证检查当前节点访问能力，不是完整恢复演练。
不要让多个集群同时向同一仓库任意写入；其他恢复集群通常应以只读方式注册，避免仓库状态冲突。

**建立明确范围的快照**

下面只备份正常与隔离别名覆盖的日志索引，不备份整个集群所有系统状态。
Snapshot 名称应唯一，示例通过当前时间生成。

```bash
SNAPSHOT="lab-$(date -u +%Y%m%dT%H%M%SZ)"
curl -fsS -X PUT \
  "http://127.0.0.1:9200/_snapshot/elk-lab-fs/${SNAPSHOT}?wait_for_completion=true&pretty" \
  -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{
  "indices": "logs-lab,logs-lab-quarantine",
  "include_global_state": false,
  "metadata": {
    "purpose": "isolated-learning-lab",
    "configuration_baseline": "elastic-7.17.29-kafka-2.8.2"
  }
}
JSON
```

查看返回状态与失败分片，不能只记录 Snapshot 名称。
生产大快照可以异步提交再轮询状态，避免长 HTTP 请求超时被误认为任务已停止。
这里的 `wait_for_completion` 只是小实验方便验收。


#### 重命名恢复，避免覆盖现有数据

恢复前先列出快照、包含的实际索引和状态。[恢复快照](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/snapshots-restore-snapshot.html)

```bash
curl -fsS 'http://127.0.0.1:9200/_snapshot/elk-lab-fs/_all?pretty'
```

下面的 `SNAPSHOT` 必须来自上一步的真实结果，不能使用一个猜测的快照名。
`SOURCE_INDEX` 必须确实存在于该快照中。
恢复使用新名称，不删除源索引，不恢复别名，不恢复全局状态。

```bash
# 在同一终端沿用刚创建的 SNAPSHOT，或显式填写查询得到的名称。
SOURCE_INDEX=logs-lab-000001

curl -fsS -X POST \
  "http://127.0.0.1:9200/_snapshot/elk-lab-fs/${SNAPSHOT}/_restore?wait_for_completion=true&pretty" \
  -H 'Content-Type: application/json' --data-binary @- <<JSON
{
  "indices": "${SOURCE_INDEX}",
  "include_global_state": false,
  "include_aliases": false,
  "rename_pattern": "(.+)",
  "rename_replacement": "restored-\$1",
  "ignore_index_settings": [
    "index.lifecycle.name",
    "index.lifecycle.rollover_alias"
  ]
}
JSON
```

忽略原生命周期设置，避免恢复出来的测试副本立即参与原来的滚动或清理流程。
这个策略用于隔离验证，不能直接代替生产灾难恢复的最终生命周期设计。

**恢复验收**

```bash
curl -fsS 'http://127.0.0.1:9200/_cat/recovery/restored-*?v'
curl -fsS 'http://127.0.0.1:9200/restored-logs-lab-000001/_count?pretty'
curl -fsS 'http://127.0.0.1:9200/restored-logs-lab-000001/_mapping?pretty'
```

应比较快照覆盖时间点内的样本、字段和 ID，而不是与仍持续写入的源索引当前总数直接比较。
恢复测试结束后，只有在确认对象完全属于此次实验时才计划删除 `restored-*` 中的精确索引。
本书不提供全局通配符删除命令。


#### 文件系统快照与隔离恢复

HA Compose 给所有节点挂载同一个命名卷 `/snapshots`，用于同宿主实验。
这不提供宿主级灾备；生产快照必须保存到独立故障域的受支持仓库，并有权限、完整性和恢复演练。
先为实验卷设置进程可写权限，限定到该卷，不递归修改宿主目录。

```bash
# 在首次注册快照仓库前执行，仅修改实验 snapshots 卷。
docker compose -f compose-ha-os-joined.json run --rm --no-deps \
  --user 0 --entrypoint /bin/bash os-hot-a -c 'chown 1000:0 /snapshots && chmod 0770 /snapshots'
```

在 HA OS 上注册仓库、创建小索引快照：

```http
PUT /_snapshot/exp-repository
{"type":"fs","settings":{"location":"/snapshots/exp","compress":true}}
POST /_snapshot/exp-repository/_verify
PUT /_snapshot/exp-repository/ha-check-1?wait_for_completion=true
{"indices":"exp-ha-check","include_global_state":false}
GET /_snapshot/exp-repository/ha-check-1
```

检查快照状态、失败分片和索引名单，而不仅是请求返回。
恢复使用新名称且不带原别名，避免与写入入口或短删除策略相撞：[OS 快照恢复](https://docs.opensearch.org/2.19/tuning-your-cluster/availability-and-recovery/snapshots/snapshot-restore/)

```http
POST /_snapshot/exp-repository/ha-check-1/_restore
{
  "indices":"exp-ha-check",
  "include_global_state":false,
  "include_aliases":false,
  "rename_pattern":"exp-ha-check",
  "rename_replacement":"exp-restored-ha-check"
}
GET /exp-restored-ha-check/_doc/ha-event-1
GET /_cat/recovery/exp-restored-ha-check?format=json
```

这个源索引没有 ILM/ISM，故意避免第一次恢复就触发自动删除。
恢复生命周期受管索引时，必须预先评审策略关联、原年龄和自动执行任务，必要时在隔离集群暂停管理并移除对应策略关联。
不要在原生产集群全局暂停所有策略来做单索引练习，也不要假设改名自然删除所有管理元数据。


#### 容灾验收与收尾

验收分为能创建快照、能在隔离目标恢复、恢复后字段与事件正确、恢复时间符合目标四层。
只有第一层通过，不能宣称具备灾备能力。

普通停止 HA 实验保留卷：

```bash
docker compose -f compose-ha-os-joined.json stop
```

确实要销毁时，先记录快照、源样本和证据位置，再对这份精确 Compose 执行 `down --volumes`。
不与主实验 `elk-expansion` 混用，也不删除基础实验的实验环境。


### 23.2 扩容和下线节点并观察迁移与剩余容量
<a id="s-23-2"></a>

#### 把日常维护分成只读检查与写入变更

只读检查可以频繁执行；删除、迁移、重置、改副本和切换安全配置需要评审。
不要把所有命令写进一个每天自动执行的“修复脚本”。

| 频率或触发 | 检查内容 |
| --- | --- |
| 日常 | 探针、积压、磁盘、ILM、解析失败、快照状态 |
| 规则发布 | 样本、字段类型、失败率、回滚版本 |
| 容量接近阈值 | 增长趋势、保留、迁移和扩容时间 |
| 节点维护前 | 冗余、恢复空间、分片分布、选举能力 |
| 升级前 | 版本兼容、弃用项、插件、Snapshot、回退前提 |
| 故障恢复后 | 数据集合对账、队列稳定、复盘证据 |

执行写操作前，至少记录集群身份、目标资源、原值、预期变化和恢复方法。
“命令执行成功”不是变更验收的全部。


#### Elasticsearch 节点扩容与下线

扩容前确认新节点版本、角色、发现、安全配置、磁盘和故障域。
新增节点后观察分片恢复、网络和磁盘压力，不要只看节点数增加就结束变更。

```bash
curl -fsS 'http://127.0.0.1:9200/_cat/nodes?v'
curl -fsS 'http://127.0.0.1:9200/_cat/allocation?v'
curl -fsS 'http://127.0.0.1:9200/_cat/recovery?v&active_only=true'
```

单节点 lab 不适合演示有冗余的节点下线。
下面是已有健康多节点集群的配置结构示例，不能直接对单节点实验执行。

```json
{
  "persistent": {
    "cluster.routing.allocation.exclude._name": "es-to-retire"
  }
}
```

通过 `_cluster/settings` 应用排除后，等待目标节点分片迁走并确认剩余节点容量。
还要判断它是否参与主节点投票；移除 master-eligible 节点可能需要单独的投票配置维护，不能只处理数据分片。[分片分配](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/modules-cluster.html)

变更完成后移除不再需要的临时排除设置，防止未来同名节点无法接收分片。
如果剩余容量或分配规则不满足要求，应停止下线，而不是强行关机等待系统自行恢复。


#### 剩余容量不足、节点下线与扩容

分片重建会占用网络、磁盘吞吐和临时空间。
一个正常状态下平均只有 65% 使用率的集群，失去节点后可能没有足够空间恢复全部副本。
在启用了温度和 zone 约束时，总空闲空间足够也可能因为空闲位于错误节点而无法使用。

```http
GET /_cat/recovery?active_only=true&format=json
GET /_nodes/stats/fs,indices,jvm,thread_pool
GET /_cluster/pending_tasks
```

安全下线某节点通常先添加精确分配排除，再等待其分片迁走，确认入口不再依赖它，最后停止。
下例仅排除明确实验节点：

```http
PUT /_cluster/settings
{"persistent":{"cluster.routing.allocation.exclude._name":"os-hot-c"}}
GET /_cat/shards?format=json
```

如强制感知要求 c 区仍保留副本且只有这一台合格热节点，排除会造成无法满足的约束。
正确方向是增加同区替代节点或重新评审副本/故障域目标，而不是等待不存在的迁移完成。
扩容时新节点使用现有 seed hosts，不能重新使用首次引导列表创建新集群。

恢复完成后清除本次精确排除设置，避免它成为数月后的隐蔽故障：

```http
PUT /_cluster/settings
{"persistent":{"cluster.routing.allocation.exclude._name":null}}
```


### 23.3 迁移 Topic 配置并保存规则、模板和插件版本
<a id="s-23-3"></a>

#### Kafka Topic 配置迁移

只迁移 Topic 元数据和迁移消息是两个任务。
对于可重新写入的日志系统，可以选择迁移 Topic 名称、分区数、副本因子和必要配置，而不迁移历史消息。
这意味着切换前的历史回放能力不能自动在新集群获得。

```bash
bin/kafka-topics.sh --bootstrap-server old-kafka.example.internal:9092 --list

bin/kafka-topics.sh --bootstrap-server old-kafka.example.internal:9092 \
  --describe --topic prod-logs-raw

bin/kafka-configs.sh --bootstrap-server old-kafka.example.internal:9092 \
  --entity-type topics --entity-name prod-logs-raw --describe
```

应导出显式 Topic 配置，并与新 broker 默认值比较。
默认值不同可能让“没有显式配置的 Topic”在新集群表现变化。

**不直接复制的内容**

Broker ID、分区副本的节点分配、ACL、客户端发布地址和消费组 Offset 需要单独处理。
旧集群的 Offset 不能直接用于另一个重新写入消息的集群。
不要把配置迁移脚本包装成数据无损迁移工具。

**切换验证**

先验证新集群生产和消费，再灰度切换 Filebeat，观察 Logstash 与 ES 事件来源。
跨集群双写可能产生重复，事件 ID 应保留源身份，恢复计划要明确去重和时间窗口。
切换后仍保留旧集群到验收和回滚窗口结束。


#### 规则、模板与镜像的版本管理

每次发布记录 Elastic 主版本、具体补丁、Logstash 插件锁、Kafka broker 版本和解析规则版本。
配置改动要能定位到 Git commit，并保留测试样本。

| 变更 | 兼容问题 |
| --- | --- |
| Filebeat Input 从 log 改 filestream | 状态、输入 ID 和重复采集 |
| Logstash 插件更新 | 配置名、ECS 默认行为、重试语义 |
| 字段类型修改 | 旧索引不可直接原地变类型 |
| ILM 修改 | 已进入阶段的执行状态与未来索引 |
| Kafka 分区增加 | Key 路由和消费顺序 |
| Kibana 升级 | Saved Objects 迁移与回退限制 |

不要在基础镜像构建里无版本约束地执行所有插件 update，然后仍把它称为“7.17.29 默认环境”。
7.17.29 只是主程序版本，插件已经变化时要重新验证全部关键行为。


### 23.4 制定升级切换与回退计划并核对新增数据
<a id="s-23-4"></a>

升级前分别确定数据、配置、插件和 UI 对象的兼容路径。先在隔离环境验证代表性输入、恢复与对账，再安排切换；回退条件和切换期间新增数据的处理方式必须在执行之前明确。不能用旧镜像直接打开被新版本写过的数据目录来代替回退方案。

#### 升级与回退不是简单换镜像标签

长期使用结束支持的版本会积累维护风险。
本书讲清存量机制，但新建环境与生产升级应重新核对官方生命周期、兼容性和安全公告。[Elastic 生命周期](https://www.elastic.co/support/eol)

升级前应完成 Snapshot 恢复演练、弃用项检查、客户端与插件兼容验证，以及双向数据核对方案。
不能假设新版本写过的数据目录可以直接交给旧版本二进制打开。
Kibana Saved Objects 也可能经历不可直接反向兼容的迁移。

```text
明确目标版本
→ 阅读对应升级路径和不兼容变化
→ 复制代表性数据到隔离环境
→ 验证采集、消费、解析、索引和 UI
→ 验证备份恢复
→ 灰度和维护窗口
→ 监控质量及性能
→ 按预先定义的条件决定继续或回退
```

回退可能意味着恢复旧集群和快照、切回旧写入入口，而不是把容器标签改回去。
需要在升级之前算清新产生数据如何处理，不能发生故障后才讨论允许丢失多少。



## 第 24 章 · 故障排查与综合验收

### 24.1 沿源文件到检索界面定位无数据、重复和字段错误
<a id="s-24-1"></a>

#### 排查总入口：先保留现场，再缩小范围

收到“日志平台有问题”时，先确认影响范围：哪些环境、哪些服务、从什么时候开始、是全部缺失还是延迟、旧数据还能否查询。
随后把同一条已知事件沿数据路径追踪。

```mermaid
flowchart TD
    A[有已知事件 ID 或源样本吗] --> B[源文件存在吗]
    B --> C[Filebeat 读取并输出了吗]
    C --> D[Kafka 对应 Topic 有消息吗]
    D --> E[消费组是否推进]
    E --> F[Logstash 队列和解析是否正常]
    F --> G[ES Bulk 是否接受]
    G --> H[按正确别名与时间能否查询]
    H --> I[Kibana 条件与权限是否一致]
```

每次只改变一项候选因素。
先保存只读结果、配置版本和失败样本，再重启或修改参数。
重启可能暂时缓解问题，也可能清掉关键状态，使根因更难定位。

**最小现场清单**

```bash
mkdir -p evidence

docker compose -p elk-full ps > evidence/compose-ps.txt
docker compose -p elk-full logs --tail=200 filebeat > evidence/filebeat.log
docker compose -p elk-full logs --tail=200 logstash > evidence/logstash.log
curl -fsS 'http://127.0.0.1:9600/_node/stats/pipelines?pretty' > evidence/logstash-stats.json
curl -fsS 'http://127.0.0.1:9200/_cluster/health?pretty' > evidence/es-health.json
```

个别命令失败本身也是证据，应记录失败时间和错误，而不是用空文件替代成功结果。
现场文件可能包含原始日志和内部地址，分享前需要脱敏。


#### 日志完全查不到

**现象与范围**

先区分新日志不可见、历史日志不可见，还是某个服务没有数据。
所有历史索引都查不到更像查询入口、权限或 ES 故障；只有新数据缺失则要沿采集路径排查。

**源端检查**

```bash
ls -l logs/access.jsonl
tail -n 3 logs/access.jsonl

docker compose -p elk-full exec filebeat \
  sh -c 'ls -l /var/log/lab && tail -n 1 /var/log/lab/access.jsonl'
```

宿主文件存在但容器路径为空，优先查挂载和工作目录。
不要立刻删除 Filebeat Registry 让它重读所有文件。

**输出与中间层检查**

```bash
docker compose -p elk-full exec filebeat filebeat test output -e

docker compose -p elk-full exec kafka kafka-topics.sh \
  --bootstrap-server kafka:9092 --describe --topic logs-lab-raw

docker compose -p elk-full exec kafka kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 --describe --group logs-lab-main-v1
```

`test output` 通过只说明当前连接测试成功，不证明某条历史事件已写入。
应继续检查消息内容、消费者和输出错误。

**修复与验收**

修复具体路径、权限、Topic、Codec 或连接配置后，生成一个新 run_id。
同时查正常和隔离别名，不要把进入隔离的数据误判为完全丢失。
用集合对账验证此次已知输入，再决定是否回放历史数据。


#### 日志重复

**先比较身份**

对重复样本比较 `event.id`、`_id`、`_index`、Kafka 位置、原始文件路径和业务时间。
相同 message 不一定是重复事件，例如相同错误可能在不同请求中重复发生。

| 特征 | 候选原因 |
| --- | --- |
| 不同事件 ID，相同原文 | 合法重复事件，或生产者未生成稳定 ID |
| 相同事件 ID，不同 `_index` | 跨 Rollover 回放或目标路由变化 |
| 相同文件被两个 Input 读取 | 静态输入与 Autodiscover 重叠 |
| 重启后整批重现 | Registry 未持久化、输入 ID 改变 |
| 同一 Kafka 位置被不同组写同目标 | 消费组设计或重放隔离问题 |

**Filebeat 核查**

检查是否同时采集 `/var/log/containers` 链接和 `/var/log/pods` 真实文件。
检查是否更换了 `filestream.id`，是否重建了保存状态的数据卷。[Filebeat 文件身份](https://www.elastic.co/guide/en/beats/filebeat/7.17/filebeat-input-filestream.html)

**修复前不要批量删除**

先修正重复产生机制。
然后评估哪些重复是真正同一事件，如何选择保留副本，是否会影响查询和备份。
用只读聚合估计范围，再在隔离数据上验证清理规则。


#### JSON、Grok 与字段类型失败

**分清失败层次**

外层 Filebeat 事件 JSON 解码失败，与 `message` 内应用 JSON 解码失败不是同一件事。
Grok 匹配失败、日期失败、数值校验失败和 ES Mapping 拒绝也需要分别统计。

| 失败 | 本书识别方式 |
| --- | --- |
| Kafka 外层 JSON | `_jsonparsefailure` |
| 应用 JSON | `_app_json_failure` |
| 字段校验 | `_field_validation_failure`、pipeline.errors |
| 日期解析 | `_event_time_failure` 或场景特定标签 |
| Java 格式 | `_java_grok_failure` |
| ES 字段拒绝 | Elasticsearch output 日志与适用时的 DLQ |

**获取原始证据**

```bash
curl -fsS -X POST 'http://127.0.0.1:9200/logs-lab-quarantine/_search?pretty' \
  -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{
  "size": 5,
  "sort": [{"event.ingested": "desc"}],
  "_source": ["event.original", "pipeline.errors", "pipeline.version", "kafka", "tags"]
}
JSON
```

先根据原始值重现，确认错误来自输入变化还是解析规则。
不要直接把所有无法转换的状态码和耗时补零，这会让质量问题转化为错误业务统计。

**回归测试范围**

正常数值、字符串数值、空值、`-`、数组、对象、科学计数法、负数、超长值、多上游和非法时间都应覆盖。
修复后先回放小样本到隔离目标，比较原值、规范值和错误原因。


#### Kibana 无数据或结果不同

用同一身份、同一 ES 集群、同一索引范围和绝对时间执行 API 对照。
检查全局时间、固定筛选、Dashboard 面板覆盖时间、Space 和 Index Pattern。

| 现象 | 关键检查 |
| --- | --- |
| API 有、Discover 无 | 时间字段、范围、KQL、权限 |
| 新字段不可选 | Mapping、Index Pattern 字段信息 |
| 同一图不同人结果不同 | 身份权限、时区、固定筛选 |
| 旧时间窗口突然有新数据 | 补采或回放进入历史业务时间 |
| 请求量异常增加 | 采集范围、重复数据、Probe 和数据集 |

不要删除 Index Pattern 或重建所有 Saved Objects 作为第一步。
这些操作可能破坏已有 Dashboard 引用，并没有修复 ES 数据问题。


#### Kubernetes 元数据缺失或 Pod 重建后漏采

```bash
kubectl -n logging-lab get daemonset filebeat
kubectl -n logging-lab get pods -o wide
kubectl -n logging-lab logs daemonset/filebeat --tail=100
kubectl auth can-i get pods \
  --as=system:serviceaccount:logging-lab:filebeat --all-namespaces
```

第一篇 RBAC 和 ServiceAccount 名称是这个实验命名；实际集群必须按真实对象检查。

**分层检查**

确认 Filebeat Pod 与日志源在同一节点，宿主 `/var/log/containers` 链接指向的 `/var/log/pods` 也被挂载。
检查 NODE_NAME 是否正确、Kubernetes API 是否可达、RBAC 是否足够，以及 metadata matcher 与路径是否匹配。

| 现象 | 可能方向 |
| --- | --- |
| 原始行有、元数据无 | API、RBAC、节点身份或 matcher |
| 重建后只有旧容器日志 | 文件发现、路径、输入配置 |
| 重启后大量重复 | Registry 卷未持久化或输入 ID 改变 |
| 同一行重复两次 | 链接与真实路径双采、静态与动态输入重叠 |
| 已删除 Pod 无法补元数据 | 采集延迟、元数据缓存与资源生命周期 |

日志文件仍在，不保证 Kubernetes API 仍保留对应 Pod 对象。
必要时在采集时保留足够稳定身份，不能完全依赖事后查询 API 补齐。


### 24.2 定位积压、Rebalance、429、OOM 和隔离队列增长
<a id="s-24-2"></a>

#### Kafka Lag 持续增长

**判断哪一层接收能力不足**

```bash
docker compose -p elk-full exec kafka kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 --describe --group logs-lab-main-v1

curl -fsS 'http://127.0.0.1:9600/_node/stats/pipelines?pretty'
curl -fsS 'http://127.0.0.1:9200/_nodes/stats/indices,thread_pool,indexing_pressure?pretty'
```

总 Lag 增长但某些分区正常，先看分区倾斜。
所有分区同时停止，先看组内消费者是否在线、Pipeline 是否启动以及 ES 输出是否长期失败。

**不同证据对应不同方向**

| 证据 | 优先方向 |
| --- | --- |
| 没有活跃消费者 | 进程、配置、认证、组名称 |
| PQ 快满，ES 重试 | ES 写入与存储问题 |
| CPU 满，Filter 耗时高 | 解析规则与事件大小 |
| CPU 低、网络请求慢 | 外部调用或输出等待 |
| 单分区高 Lag | Key 倾斜、消息大小、分区热点 |

不要只增加 `consumer_threads`。
恢复后测量净排空速度，并确认剩余 Kafka 保留窗口足以覆盖积压。
若来不及，应优先保护原始数据和扩充恢复能力，而不是等待保留策略把旧数据删除。


#### 消费者反复 Rebalance

**收集时间线**

记录成员变化、发布重启、GC 停顿、poll 超时和网络错误时间。
消费者无法及时继续 poll，可能因为队列阻塞或处理链路过慢，不能只看 Kafka broker。

```bash
docker compose -p elk-full logs --since=10m logstash
curl -fsS 'http://127.0.0.1:9600/_node/stats/jvm?pretty'
curl -fsS 'http://127.0.0.1:9600/_node/stats/pipelines?pretty'
```

**常见误判**

调大 `max_poll_interval_ms` 可以改变容忍时间，但不会增加实际处理能力。
调小 session timeout 可能更快感知故障，也可能让短暂停顿频繁变成成员失效。
参数取舍应结合实际处理时间与故障检测目标。[消费者配置](https://kafka.apache.org/28/configuration/consumer-configs/)

**验收**

固定流量下观察一段覆盖原故障模式的时间，确认成员稳定、消费继续推进、无持续积压。
一次重启后暂时恢复不能证明问题已经解决。


#### Elasticsearch 写入 429 或 Bulk 出错

**区分请求级与单条错误**

HTTP 请求失败、Bulk 顶层 `errors: true`、单条 Mapping 失败和代理限流需要分别处理。
记录响应状态、错误类型、目标索引和请求大小，不只保存“写入失败”四个字。[ES output 重试](https://www.elastic.co/guide/en/logstash/7.17/plugins-outputs-elasticsearch.html)

```bash
curl -fsS 'http://127.0.0.1:9200/_cat/thread_pool/write?v'
curl -fsS 'http://127.0.0.1:9200/_nodes/stats/jvm,fs,indexing_pressure,thread_pool?pretty'
curl -fsS 'http://127.0.0.1:9200/_nodes/hot_threads?threads=3'
```

**处理顺序**

先确认磁盘、内存和集群健康，再看是否有恢复、Merge、快照或大查询竞争。
临时降低输入或回放并发，为实时写入留出空间。
增加 ES 队列上限不能创造 CPU 或磁盘吞吐，反而可能让请求占用更多内存。

**验收**

比较拒绝计数增量、输出成功率、PQ 与 Kafka 净排空速度。
吞吐上升但失败数据变多不能判为调优成功。


#### Logstash CPU、Heap 或 OOM

**先区分 CPU 与内存故障**

```bash
curl -fsS 'http://127.0.0.1:9600/_node/stats/jvm,process,pipelines?pretty'
curl -fsS 'http://127.0.0.1:9600/_node/hot_threads?pretty'
docker compose -p elk-full logs --tail=200 logstash
```

容器 OOMKilled 可能来自总内存限制，而不仅是 Java Heap 不足。
检查 Heap、直接内存、事件大小、batch、PQ 映射和其他进程开销。

**常见诱因**

复杂正则在坏输入上耗时；把巨大 JSON 复制多次；无限制保留原始与展开字段；在 Ruby 中累积共享数组；同时增加多个 Pipeline 的 workers 和 batch。

减小某个批次可以缓解峰值内存，但要验证吞吐和延迟。
增加 Heap 前先确认宿主和容器是否有相应空间，不能导致宿主交换或其他服务 OOM。

**验收**

使用包含大事件和坏格式的有界样本，确认 CPU、GC、事件质量与净吞吐同时合理。
只用短小正常日志跑通，不能证明异常流量下也稳定。


#### DLQ 与隔离日志持续增长

DLQ 和业务隔离索引负责不同失败类型。
不能把隔离索引为空当成所有输出都成功，也不能把 DLQ 增長都归因于 Grok。[DLQ](https://www.elastic.co/guide/en/logstash/7.17/dead-letter-queues.html)

先查看 Elasticsearch output 的具体错误类型和失败文档目标。
Mapping 400、某些 404 与 409 的处理方式按固定 11.4.2 插件文档核对；不要套用新插件的重试或自定义 DLQ 设置。

**在 lab 读取 DLQ 的诊断配置**

以下作为临时独立 Pipeline，仅用于脱敏的隔离实验。
`path` 指向 DLQ 根目录，`pipeline_id` 指定原 Pipeline。
`commit_offsets => false` 便于只读检查，不把此次查看作为已完成修复的消费确认。

```logstash
input {
  dead_letter_queue {
    path => "/usr/share/logstash/data/dead_letter_queue"
    pipeline_id => "logs-main"
    commit_offsets => false
  }
}
output {
  stdout {
    codec => rubydebug { metadata => true }
  }
}
```

不要把这个输出长期打开在生产，原始事件可能包含敏感内容。
真正重处理时使用独立目标和稳定事件身份，先修复失败原因，再验证不会把错误重新送回相同 DLQ 形成循环。

**清理前验收**

记录读取范围、修复规则、成功写入数量和仍失败样本。
不能通过删除 DLQ 目录使告警消失后宣告问题解决。
队列自身的容量上限和保留也要监控，否则错误证据可能继续丢失。


### 24.3 排查水位、未分配分片、生命周期、TLS 与权限故障
<a id="s-24-3"></a>

#### 磁盘水位与只读保护

ES 的磁盘水位会影响分片分配，达到 flood-stage 时可能为相关索引设置 `read_only_allow_delete` 保护。
7.17 在磁盘使用回落到相应高水位以下后会解除该保护；仍需检查具体索引与配置。[磁盘分配设置](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/modules-cluster.html)

```bash
curl -fsS 'http://127.0.0.1:9200/_cat/allocation?v&bytes=gb'
curl -fsS 'http://127.0.0.1:9200/_nodes/stats/fs?pretty'
curl -fsS 'http://127.0.0.1:9200/_cluster/settings?include_defaults=true&flat_settings=true&pretty'
curl -fsS 'http://127.0.0.1:9200/logs-lab-*/_settings?flat_settings=true&pretty'
```

百分比水位通常描述已用比例，字节水位描述剩余空间，解释时不要反过来。
不要照搬较新版本新增的 headroom 参数到 7.17。

**优先释放或增加真实空间**

检查 ILM 是否失效、保留是否过长、快照目录是否意外与数据盘竞争、节点恢复是否占用额外空间。
通过批准的精确索引删除、扩容或迁移处理。
不要用删除文档后立即 Force Merge 作为磁盘满时的默认动作。

**必要时清除残留保护**

仅在已经确认空间恢复、原因处理完成，而目标索引仍残留该设置时，才对精确索引操作：

```bash
curl -fsS -X PUT 'http://127.0.0.1:9200/logs-lab-000001/_settings' \
  -H 'Content-Type: application/json' \
  -d '{"index.blocks.read_only_allow_delete":null}'
```

这不会创造可用空间。
持续反复解除保护而不处理磁盘压力，只会掩盖风险。


#### 未分配分片与集群 Red/Yellow

**先问 Elasticsearch 为什么不分配**

```bash
curl -fsS 'http://127.0.0.1:9200/_cat/shards/logs-lab-*?v'

curl -fsS -X POST 'http://127.0.0.1:9200/_cluster/allocation/explain?pretty' \
  -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{
  "index": "logs-lab-000001",
  "shard": 0,
  "primary": false
}
JSON
```

示例索引、分片号和主副标志必须替换成实际未分配对象；本书默认单节点副本为 0，可能没有这个副本可解释。
不要把“未找到需要解释的分片”当作 API 不可用。[Allocation Explain](https://www.elastic.co/guide/en/elasticsearch/reference/7.17/cluster-allocation-explain.html)

| 原因 | 合理方向 |
| --- | --- |
| 单节点却设置副本 | 增加符合要求节点，或确认只是实验后调整副本 |
| 磁盘水位 | 容量、迁移、清理 |
| 分配过滤 | 检查下线遗留排除和节点属性 |
| 缺少数据层 | 增加正确角色节点或修正生命周期设计 |
| 节点丢失且主分片无副本 | 恢复节点或 Snapshot，评估数据损失 |
| 恢复失败 | 具体错误、存储和网络 |

涉及 `accept_data_loss` 的分片强制分配可能丢失数据，不是常规修复按钮。
应先确认是否存在可恢复节点、副本或快照，由授权负责人决定灾难恢复策略。


#### ILM 卡住或日志没有按期清理

```bash
curl -fsS 'http://127.0.0.1:9200/logs-lab-*/_ilm/explain?pretty'
curl -fsS 'http://127.0.0.1:9200/_ilm/status?pretty'
curl -fsS 'http://127.0.0.1:9200/_alias/logs-lab?pretty'
curl -fsS 'http://127.0.0.1:9200/_ilm/policy/logs-lab-retention?pretty'
```

**常见原因**

Policy 只加到模板但已有索引未接管；写别名缺失或指向错误；索引命名不符合滚动要求；滚动条件未达到；目标数据层不可用；执行权限或其他动作失败。

“滚动 14 天后删除”不是“文档业务时间超过 14 天就删除”。
先解释 `phase`、`action`、`step` 和 `lifecycle_date_millis`，再判断是否真的卡住。

**修复后重试**

明确错误已经修复且索引处于相应失败状态时，可以使用该版本的 ILM retry API：

```bash
curl -fsS -X POST 'http://127.0.0.1:9200/logs-lab-000001/_ilm/retry?pretty'
```

没有修复别名或分配问题就不断 retry，只会重复失败。
直接移动生命周期步骤属于高级危险操作，本书不把它作为默认方案。


#### TLS、认证与授权错误

401、403、TLS 握手失败和 TCP 连接失败分别对应不同层次。
把所有错误归类为“密码错误”会浪费排查时间。

```bash
# 使用真实受信任 CA；--user 只给用户名，让 curl 交互读取密码。
curl --cacert /etc/elk/certs/elasticsearch-ca.pem \
  --user logstash_writer \
  'https://es-1.example.internal:9200/'
```

| 错误 | 先检查 |
| --- | --- |
| TCP refused/timeout | 监听、路由、防火墙、发布地址 |
| 证书不受信任 | CA 链、Truststore、证书到期 |
| Hostname mismatch | 实际访问名与证书 SAN |
| 401 | 身份、密码、认证机制 |
| 403 | 目标资源和所需操作的权限 |
| Kafka Topic authorization | Topic ACL 与认证 principal |
| Kafka Group authorization | 消费组 ACL 与组名 |

临时关闭证书验证只能说明问题可能与证书校验有关，不能作为生产修复终态。
不要把真实密码放在命令参数和问题截图中。


### 24.4 执行有界故障、恢复对账并形成分层验收记录
<a id="s-24-4"></a>

#### 故障实验 A：Elasticsearch 暂停

只用于第二篇完整 lab。
实验前确认 Kafka、Logstash 正常，源文件和所有数据卷保留，不执行删除。

```bash
cd ~/elk-lab-full
RUN_ID="fault-es-$(date -u +%Y%m%dT%H%M%SZ)"

# 仅暂停实验 ES。
docker compose -p elk-full stop elasticsearch

python3 scripts/generate_logs.py \
  --output logs/access.jsonl --count 100 --bad-every 10 \
  --run-id "${RUN_ID}" --interval 0.02

curl -fsS 'http://127.0.0.1:9600/_node/stats/pipelines?pretty'
docker compose -p elk-full logs --tail=80 logstash

# 恢复服务。
docker compose -p elk-full start elasticsearch
```

预期 Logstash 出现输出连接失败和队列压力。
因为样本只有 100 条，PQ 足够时 Kafka Lag 可能很快回到零，不能以此说明数据已经入库。

恢复后用新探针检查链路，再导出该 RUN_ID 做集合对账。
一次探针可见并不保证其他分区的旧积压全部处理完；对账失败时先观察队列并再次有界导出。
每次导出使用新文件名，保留前一次结果以便解释恢复过程。

**通过标准**

正常和隔离事件总集合与源输入一致；没有重复 ID；队列回到稳定水平；新请求可见延迟恢复。
如果只看进程状态变成 Up，不算完成数据恢复验收。


#### 故障实验 B：Logstash 暂停与 Kafka 缓冲

```bash
RUN_ID="fault-ls-$(date -u +%Y%m%dT%H%M%SZ)"
docker compose -p elk-full stop logstash

python3 scripts/generate_logs.py \
  --output logs/access.jsonl --count 100 \
  --run-id "${RUN_ID}" --interval 0.02

docker compose -p elk-full exec kafka kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 --describe --group logs-lab-main-v1

docker compose -p elk-full start logstash
```

预期 Kafka 继续接收消息，原消费组没有活跃消费或消费位置不再推进。
恢复 Logstash 后从已提交位置继续读取，随后对账。

**对照问题**

如果此时把 group_id 改成新值并使用 earliest，会发生什么？
如果两个组同时写同一个别名，稳定 ID 能否跨 Rollover 去重？
如果停机时间超过 Kafka 保留期，哪些记录还可以从源文件或快照恢复？

这些问题应通过前面边界推导，不在生产环境盲目尝试。


#### 故障实验 C：Kafka 暂停与采集端状态

```bash
RUN_ID="fault-kafka-$(date -u +%Y%m%dT%H%M%SZ)"
docker compose -p elk-full stop kafka

python3 scripts/generate_logs.py \
  --output logs/access.jsonl --count 100 \
  --run-id "${RUN_ID}" --interval 0.02

docker compose -p elk-full logs --tail=100 filebeat
curl -fsS 'http://127.0.0.1:5066/stats?pretty'

docker compose -p elk-full start kafka
```

观察 Filebeat 输出错误、队列及未确认事件，恢复后对账。
这个单 broker lab 暂停 Kafka 等于整个 broker 服务不可用，不是在验证三副本集群的容错。

**不扩大故障范围**

不要同时删除源文件、清 Registry、重建数据卷和重置消费者 Offset。
那会把多个独立失败组合起来，无法分辨到底哪个步骤导致数据缺失。
先验证单故障，再为明确的组合故障单独设计实验。


#### 字段故障、历史补采与重复回放实验

完成组件暂停实验后，再验证数据质量边界。

| 实验 | 输入 | 预期 |
| --- | --- | --- |
| 非法状态 | `status=not-a-number` | 原值保留，进入隔离 |
| 缺耗时 | 缺字段、空值或 `-` | 不编造零值，不进入耗时聚合 |
| 多上游 | `502, 504` | 原始列表保留，不强制转单个 integer |
| 旧业务时间 | 生成器 `--age-hours` | @timestamp 旧，ingested 新 |
| 超长异常 | 大堆栈 | 按已声明的上限处理并可观察损失 |
| 同一事件重放 | 相同 event_id | 同一索引内覆盖语义可解释 |
| Rollover 后重放 | 相同 event_id、新写索引 | 可能跨索引出现两份，需要识别 |

历史业务时间实验不等于自动制造旧 Kafka record timestamp。
主链路 Filebeat 外层时间仍是采集时间，Topic 采用 LogAppendTime；只有明确修改生产者 record timestamp 并调整 Topic 策略，才是在验证 CreateTime 保留边界。

**记录实际结果而不是填写预期答案**

```text
实验编号：
版本与插件：
规则版本：
源样本与 event_id：
注入动作与时间：
各组件证据：
正常、隔离、DLQ 的结果：
恢复步骤：
集合对账：
与预期不一致的部分：
后续修复：
```


#### 整套笔记的最终验收

这套笔记的完成标准不是记住五个组件的所有参数，而是能够解释每一段数据路径和失败边界。

| 能力 | 最低验收 |
| --- | --- |
| 采集 | 解释 Registry、轮转、多行、容器路径与状态持久化 |
| 缓冲 | 解释 Kafka 分区、副本、确认、消费组与保留 |
| 加工 | 区分 JSON 层次、类型校验、日期、失败旁路和 DLQ |
| 存储 | 正确管理 Mapping、模板、别名和生命周期 |
| 检索 | 使用明确范围、时间和统计口径查询 |
| 可靠性 | 说明重复、丢失和确认边界，不滥用 Exactly-once |
| 性能 | 用测量定位瓶颈，不靠盲目增线程 |
| 安全 | 认证、TLS、ACL、ES 最小权限和敏感字段治理 |
| 运维 | 快照恢复、容量、灰度、回滚和变更证据 |
| 排障 | 按源事件逐段定位，恢复后做集合对账 |

把通过的实验记录和自己的生产案例补到对应小节，可以逐步形成适用于自身环境的运维手册。
不要把尚未执行的预期结果改写成“生产验证通过”，也不要把实验中的单节点、零副本和无认证配置直接投入生产。


#### 故障恢复的有界操作

在主实验中暂停 OS 分支 Logstash，生成一个新批次，观察 Kafka 消费组积压，再恢复并对账。
只停止指定容器，不重置消费组、不清 PQ、不删除 Registry。

```bash
docker compose stop logstash-os
python3 tools/generate.py --run-id pause-os-01 --count 100 --profile mixed
docker compose exec -T kafka kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --group exp-os-v2 --describe
docker compose start logstash-os
# 恢复稳定后使用新输出文件执行 export + audit。
python3 tools/export_audit.py export os --run-id pause-os-01 --output evidence/pause-os-01.jsonl
python3 tools/export_audit.py audit --manifest logs/pause-os-01.manifest.json --input evidence/pause-os-01.jsonl
```

再单独暂停 OpenSearch，保持 LS 运行，观察输出失败、PQ/Kafka 背压与恢复后的集合。
如果组合多个故障而没有记录顺序，会难以区分日志停在源、Kafka、PQ 还是后端。
每轮必须恢复健康后再开始下一轮。
