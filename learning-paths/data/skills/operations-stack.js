/* Targeted expansion requested by the user: observability, Nginx,
   messaging and service discovery. Existing skill IDs and states are preserved. */
function extendLeaves(moduleId,source){
 const prior=window.OPS_LEAVES[moduleId];
 if(!prior)throw new Error('Cannot extend missing module '+moduleId);
 delete window.OPS_LEAVES[moduleId];defineLeaves(moduleId,source);
 window.OPS_LEAVES[moduleId]=[...prior,...window.OPS_LEAVES[moduleId]];
}
extendLeaves('nginx',`
architecture|Nginx Master 与 Worker|理解进程职责和重载时的连接处理|观察一次配置重载前后的进程与持续请求，记录旧 Worker 何时退出。|了解
location|location 匹配与配置继承|区分路径匹配和指令生效范围|设计三组测试路径，分别验证精确、前缀和正则 location 的实际命中。
uri|proxy_pass 与 URI 改写|避免转发路径因配置产生意外变化|对比不同代理路径写法，用上游日志核对收到的 URI。|会排障
headers|代理请求头与真实客户端|区分客户端、代理和上游看到的地址与协议|在可信代理链上检查 Host、转发头与客户端地址，并测试伪造头的处理。`);
addModule('linux',{id:'nginx-operations',stage:3,title:'Nginx 流量治理与性能',sub:'负载均衡 / 超时 / 缓存 / 限流',level:'会排障',scope:'必修',pre:'Nginx 基础、HTTP/TLS、Linux 资源与连接',topics:['理解上游选择、故障转移与超时','治理缓冲、长连接、缓存及访问压力','用日志和资源指标验证性能与故障判断'],outcome:'能解释入口到上游的失败和性能问题，并在限定场景完成受控调整。',exercise:'为双实例应用配置代理，依次模拟慢响应、实例失效与流量突增，记录日志、指标和变更前后结果。',boundary:'先检查应用与操作系统瓶颈；不套用万能优化参数，也不假设所有主动健康检查能力都由开源 Nginx 提供。',resource:'web/nginx/03-reverse-proxy-and-load-balancing.md'});
defineLeaves('nginx-operations',`
balancing|Upstream 负载均衡|根据请求特性理解负载分配和会话约束|为两台测试上游配置分配策略，统计请求落点并解释差异。
failover|失败判定与上游重试|区分故障转移和写请求重复执行风险|停止一台上游，观察重试行为；说明非幂等请求为何不能盲目重发。|会排障
timeouts|连接与读写超时|区分连接失败、响应慢与代理等待超时|分别模拟连接阻断和慢响应，结合错误日志定位。|会排障
buffering|缓冲与大请求|理解请求体、响应缓冲和临时文件的资源影响|上传受限测试文件并检查临时存储，比较缓冲设置前后的行为。
connections|Keepalive 与 WebSocket|区分普通连接复用和协议升级|验证上游连接复用，再用测试 WebSocket 检查升级与空闲断连。
cache|代理缓存与压缩|按资源类型选择缓存和压缩策略|给静态测试资源设置缓存，验证命中、过期与不应缓存的响应。
limits|限流、限连接与访问限制|控制入口压力并说明拒绝条件|用受控并发验证限流和连接限制，检查正常请求是否被误伤。
logging|访问日志与上游耗时|关联状态码、请求时间和上游响应时间|制造一个慢上游，通过结构化访问日志判断耗时发生位置。|会排障
capacity|连接容量与性能验证|结合 Worker、文件描述符和系统资源判断瓶颈|固定负载逐步测试，记录连接、CPU、错误与延迟，验证一项配置调整。|会排障`);
addModule('linux',{id:'mq-foundations',stage:3,title:'消息队列与异步处理基础',sub:'投递语义 / 确认 / 重试 / 积压',level:'会用',scope:'必修',pre:'应用部署、网络连接与基础日志分析',topics:['区分队列、发布订阅和事件日志模型','理解确认、重试、顺序和重复消费','用积压、消息年龄及业务结果判断链路健康'],outcome:'能解释消息从发送到业务处理完成经过哪些确认点，以及故障下可能出现什么结果。',exercise:'选择一种消息组件完成发送与消费，模拟消费者中断，核对消息重投、重复处理与积压恢复。',boundary:'中间件接收成功不等于业务执行成功；不同产品的交付语义和数据恢复方式不能直接互换。',resource:'data-systems/rabbitmq/01-installation-and-messaging.md'});
defineLeaves('mq-foundations',`
models|队列、发布订阅与事件日志|按工作分发、广播和回放需求区分模型|为邮件发送、状态广播和行为回放分别选择模型并说明理由。|了解|入门
acknowledgement|发送确认与消费确认|区分 Broker 收到和业务处理完成|画出一条消息的确认时序，标出每个阶段中断可能导致的结果。|了解|入门
retries|重试、退避与死信|防止失败消息形成无限重试|让测试消息持续处理失败，验证重试上限和后续处置。|会用|入门
ordering|顺序与并发|明确需要保证顺序的业务范围|并发处理一组有关联的测试消息，观察顺序变化并说明约束。|了解|入门
duplicates|重复消费与幂等|把消息投递次数和业务效果区分|重放同一业务标识的消息，核对只产生一次业务结果。|会用|入门
backlog|积压、消息年龄与吞吐|区分流量增长、消费者变慢和消费停滞|降低测试消费速度，关联生产速率、消费速率与最老消息等待时间。|会排障|入门
security|连接身份与资源权限|限制应用可发布和消费的范围|创建受限测试身份，验证访问未授权队列或 Topic 被拒绝。|会用|入门`);
addModule('linux',{id:'rabbitmq-operations',stage:3,title:'RabbitMQ 消息服务',sub:'Exchange / Queue / ACK / Quorum',level:'会用',scope:'选修',pre:'消息队列基础、网络和持久化存储',topics:['掌握交换机、队列、绑定和路由','验证发布确认、消费确认与死信处理','认识集群队列、资源告警与权限边界'],outcome:'能维护一个测试消息服务，定位路由、消费和资源压力问题。',exercise:'建立测试 Exchange 和 Queue，发送可追踪消息；中断消费者、触发死信并核对最终业务结果。',boundary:'RabbitMQ 是产品分支，先与 Kafka 选择一种深入；队列数据不能仅靠导出配置恢复。',resource:'data-systems/rabbitmq/README.md'});
defineLeaves('rabbitmq-operations',`
routing|Exchange、Queue 与 Binding|理解交换机类型和 routing key 的作用|建立两条测试路由，验证消息进入预期队列以及无匹配时的结果。
confirms|Publisher Confirms 与持久化|区分发布确认、队列持久性和消息持久性|测试发送失败与确认成功两种路径，记录未确认消息如何处理。
consumerack|ACK、NACK 与重新入队|在业务处理后选择正确确认方式|消费者处理前后分别退出，观察未确认消息和重新投递。
prefetch|Prefetch 与消费并发|控制在途消息和消费者负载|调整测试 prefetch，比较吞吐、未确认消息数和处理延迟。
deadletter|TTL、死信与毒消息|管理过期和持续失败消息的去向|让消息过期或被拒绝，核对死信路由并避免循环投递。
quorum|Quorum Queue 与节点维护|认识复制队列对仲裁和故障的要求|在隔离集群停止一个节点，记录队列可用性与剩余副本状态。|会用
health|RabbitMQ 权限与资源告警|排查连接、队列积压及磁盘内存压力|检查 vhost 权限和资源告警，给一个积压案例提供证据。|会排障`);
addModule('linux',{id:'kafka-operations',stage:3,title:'Kafka 消息与事件流',sub:'Topic / Partition / Group / Offset',level:'会用',scope:'选修',pre:'消息队列基础、磁盘与网络指标',topics:['理解分区、消费组、偏移和重平衡','区分副本确认与业务端处理语义','观察集群状态、保留策略和消费滞后'],outcome:'能在测试 Kafka 上追踪消息、消费位点和积压，并说明集群故障边界。',exercise:'创建多分区 Topic，运行消费者组；模拟成员变化和处理失败，核对位点、重复消息与 lag。',boundary:'先完成单 Topic 实验再深入集群运维；不要把配置导出或副本数量直接当作可恢复备份。',resource:'data-systems/kafka/README.md'});
defineLeaves('kafka-operations',`
partitions|Topic、Partition 与 Key|理解分区内顺序和数据分配|给带 Key 的测试消息记录分区与顺序，比较无 Key 发送结果。
groups|Consumer Group 与分区分配|区分组内协作和不同组独立消费|运行两个组与多个消费者，核对各自读到的数据。
offsets|Offset 提交与回放|控制已处理位置并理解提交时机|在处理与提交之间中断消费者，观察重读和业务幂等结果。
rebalance|重平衡与消费者活性|认识成员变化和处理过慢的影响|添加或暂停测试消费者，记录分区重新分配与处理暂停。|会排障
replication|副本、ISR 与生产确认|区分副本同步状态和发送成功条件|在实验副本故障中核对生产结果和同步状态，说明数据风险。
controlplane|Broker 与 KRaft 控制面|识别数据服务与元数据仲裁的职责|画出实验集群角色，列出维护前需要确认的仲裁与可用性条件。|了解
retention|日志保留、压缩与容量|区分消费位点和数据保留边界|设置测试保留策略，解释消费者落后超过保留窗口时的结果。
lag|Kafka 监控与积压排查|结合 lag、生产消费速率和磁盘定位问题|模拟慢消费者，区分消费者处理慢与 Broker 资源压力。|会排障`);
addModule('linux',{id:'service-discovery',stage:3,title:'服务注册与发现基础',sub:'实例 / 健康 / DNS / API',level:'会用',scope:'必修',pre:'DNS、HTTP、负载均衡和应用生命周期',topics:['理解动态实例如何被调用方找到','区分注册存在与健康可接流','处理缓存、下线延迟及配置边界'],outcome:'能解释服务注册、健康检查、查询和客户端调用的完整链路。',exercise:'用两个测试实例说明注册、健康变化和下线后的调用行为，记录缓存与刷新造成的延迟。',boundary:'注册中心不等于网关或负载均衡器；发现服务并不保证后续每次调用成功。',resource:'cloud-native/consul/01-foundations-and-services.md'});
defineLeaves('service-discovery',`
identity|服务名、实例与发现方式|区分固定地址、DNS 和注册 API|为可扩缩容应用画出实例变化时客户端获取地址的流程。|了解|入门
health|注册状态与健康状态|避免把已注册实例当成可用实例|让测试实例注册成功但健康检查失败，核对发现结果。|会用|入门
stale|下线、缓存与失效地址|理解实例移除与客户端停止调用之间的延迟|下线一个测试实例，记录 DNS/API 与客户端缓存各自何时更新。|会排障|入门
boundaries|注册、配置、网关与网格|区分服务发现和其他治理能力|为一个请求链路标注各组件职责，说明单个产品不应承担的假设。|了解|入门`);
addModule('linux',{id:'consul-operations',stage:3,title:'Consul 服务发现与运维',sub:'Agent / Catalog / DNS / ACL',level:'会用',scope:'选修',pre:'服务发现基础、TLS 与集群故障域',topics:['理解 Agent、Server 和集群成员关系','完成服务注册、健康检查与 DNS/HTTP 查询','治理身份、通信安全、备份与故障排查'],outcome:'能用 Consul 管理测试服务实例，并诊断注册、健康和权限问题。',exercise:'注册双实例服务，切换健康状态并观察发现结果；为只读查询配置受限身份，再演练配置与快照恢复。',boundary:'先在隔离环境学习服务发现；KV 不应直接当作通用业务数据库，Service Mesh 留作进阶。',resource:'cloud-native/consul/README.md'});
defineLeaves('consul-operations',`
agents|Agent、Server 与仲裁|理解成员发现和持久状态的不同职责|绘制测试部署的角色与通信关系，说明少数节点故障的影响。|了解
registration|服务注册与注销|维护稳定的服务和实例标识|注册两个实例，修改一个实例地址后核对目录内容。
checks|HTTP、TCP 与 TTL 检查|选择与服务实际能力相符的健康探测|为测试服务配置检查，模拟端口通但业务失败的差异。
discovery|Consul DNS 与 HTTP 查询|区分目录信息与健康过滤后的发现结果|比较 DNS 查询、目录查询和健康查询返回的实例。
acl|ACL 与 Token 生命周期|限制注册、查询和管理操作|让查询身份不能修改服务，轮换测试 Token 并验证旧值失效。
encryption|Gossip 加密与 TLS|区分成员通信、RPC 和 API 的安全边界|列出不同通信链路的保护配置，验证一个错误证书场景。|会排障
snapshot|快照与恢复检查|恢复服务目录和控制面状态|在隔离环境恢复测试快照，核对目录与权限配置。
kv|KV、Watch 与治理边界|理解配置读取和变化通知的用途|写入测试配置并观察变化，说明应用如何处理读取失败。|了解`);
function stackModule(id,title,sub,pre,topics,outcome,exercise,boundary,resource,source,scope='必修'){
 addModule('sre',{id,stage:1,title,sub,pre,topics,outcome,exercise,boundary,resource,scope,level:'会用'});
 defineLeaves(id,source);
}
stackModule('obs-prometheus','Prometheus 与 PromQL 实践','指标类型 / 发现 / 重标记 / 规则','Linux 监控基础与指标设计',
 ['掌握指标类型与采集目标的组织','用 PromQL、记录规则和告警规则表达问题','诊断采集失败、缺失序列和基数压力'],
 '能搭建可验证的指标采集与查询链路，并解释查询结果。',
 '接入应用与主机指标，生成可控请求，用查询验证速率、错误比例与延迟分布；再排查一次目标发现失败。',
 '先理解指标语义再使用面板模板；没有数据和数值为零不能混为一谈。',
 'observability/prometheus/guide.md',`
types|Counter、Gauge 与 Histogram|依据指标语义选择查询方法|对测试计数器、瞬时值和延迟桶分别查询，解释结果含义。|会用|入门
exporters|应用埋点与 Exporter|区分应用主动暴露指标与外部采集|接入 node exporter 和一个应用端点，核对各自覆盖范围。|会用|入门
discovery|静态目标与服务发现|让实例变化自动进入采集范围|增加或移除测试实例，观察目标列表及采集状态。
relabel|Relabel 与标签治理|区分目标筛选、标签改写和指标过滤|在实验中丢弃一个目标和一类指标，核对两者影响范围。
promql|速率、聚合与标签匹配|避免单位、窗口和向量匹配错误|计算测试服务请求速率与错误比例，核对分母和实例标签。
histogram|延迟分布与分位数|理解桶配置和聚合对延迟统计的影响|对受控延迟请求估计分位数，并说明精度和采样局限。
rules|记录规则与规则测试|把重复查询和告警表达式纳入验证|为测试指标编写规则，用固定序列检查触发、恢复和缺失数据。`);
stackModule('obs-alertmanager','Alertmanager 告警链路','路由 / 分组 / 静默 / 抑制','告警规则与响应分级',
 ['区分规则评估、告警状态和通知投递','配置分组路由、静默和抑制','验证通知失败与告警恢复路径'],
 '能解释告警为何通知、未通知或重复通知，并修复测试配置。',
 '触发同组多实例告警，验证分组投递、临时静默、上层故障抑制和恢复通知。',
 '静默不会修复故障；测试通知发送到自己控制的接收端，不影响真实值班。',
 'observability/prometheus/guide.md',`
routing|标签路由与接收人|按服务、环境和严重度选择通知目的地|给两组测试告警配置不同接收端，核对实际路由。
grouping|分组与通知时间|理解等待、重复间隔和重复通知|同时触发多个实例告警，记录通知条数与时间。
silences|维护静默与过期|在限定范围和时间屏蔽计划内通知|创建测试静默，确认到期后通知能力恢复。
inhibition|告警抑制|用上层故障抑制相关下游噪声|同时触发上层与下游故障，核对匹配标签和被抑制范围。
delivery|通知失败与端到端验证|区分规则未触发和通知未送达|阻断测试接收端，沿规则、Alertmanager 与投递日志定位。|会排障`);
stackModule('obs-grafana','Grafana 查询与看板','数据源 / 变量 / 单位 / 关联','指标、日志与追踪的基本用途',
 ['配置数据源与访问权限','构建能回答运行问题的面板','管理看板版本和多信号跳转'],
 '能维护一个数据口径清楚、可复用且可追溯的运行看板。',
 '为同一服务连接指标、日志和追踪入口，用一个测试请求完成面板到日志再到 Trace 的跳转。',
 '仪表盘模板需要核对标签、单位和查询窗口；不以看板数量衡量可观测性。',
 'observability/loki/03-logql-grafana-and-alerting.md',`
datasources|数据源与查询权限|区分面板展示和底层数据访问控制|配置测试数据源，核对只读身份可查询的范围。
panels|变量、单位与时间窗口|让图表含义与真实数据一致|制作按环境筛选的面板，验证单位、空结果和时区。
links|日志、指标与 Trace 跳转|使用真实关联字段连接不同信号|从一个异常时间段跳到相关日志，并确认对应 Trace 确实存在。
versioning|看板配置与版本管理|把看板变更变成可审查配置|导出或配置化管理测试看板，修改后比较差异并恢复。`);
stackModule('obs-collector','OpenTelemetry 与 Collector','OTLP / Pipeline / 采样 / 自监控','HTTP、结构化日志、Trace 和资源标签',
 ['区分 SDK、Collector 和后端存储的职责','组织接收、处理和导出管道','验证采样、排队、重试与自身故障'],
 '能解释遥测信号从应用到后端的路径，并定位链路中的丢失或积压。',
 '让两个测试服务发出可关联的遥测数据，经 Collector 导出；暂时断开后端并观察队列、失败和恢复。',
 'Collector 不是长期存储；缓冲和重试有容量边界，必须通过实际后端验证数据到达。',
 'observability/otel/02-collector-and-signal-integration.md',`
instrument|埋点、SDK 与 OTLP|区分产生信号、传输协议和后端查询|在示例应用接入一类信号，核对发送端与后端记录。
pipeline|Receiver、Processor 与 Exporter|理解组件如何组成独立信号管道|为测试信号配置管道，分别验证接收、处理和导出。
resources|Resource、语义约定与脱敏|让服务身份可关联且不泄露敏感字段|统一测试服务环境标签，移除一个敏感属性并在后端核对。
sampling|头部与尾部采样|理解采样决策所需信息和资源成本|用成功与错误 Trace 比较两类采样策略，说明被丢弃的数据。
queues|队列、重试与背压|检查后端不可用时的容量和丢失风险|短时断开测试后端，记录队列变化与最终数据对账。
selfmonitor|Collector 自监控与排障|区分应用未发送、管道拒绝和导出失败|故意写错导出地址，结合内部指标与日志定位。|会排障`);
stackModule('obs-loki','Loki 与日志采集','Alloy / 标签 / LogQL / 保留','Linux 日志、JSON、采集与存储概念',
 ['建立采集到查询的日志链路','正确分配标签、字段和结构化元数据','通过事件对账定位日志缺失与重复'],
 '能运行一套测试日志链路，控制基数并定位采集和查询问题。',
 '用 Alloy 采集带事件 ID 的测试日志，在 Loki 查询并对账；模拟轮转和采集器重启，核对缺失与重复。',
 'Loki 与 ELK/OpenSearch 先按场景选择一套深入；出现 Trace ID 不代表追踪后端一定有数据。',
 'observability/loki/README.md',`
alloy|Alloy 采集与读取位置|理解文件采集、重启和轮转的影响|轮转测试日志并重启采集器，按事件 ID 核对结果。
labels|索引标签与结构化字段|避免把每次请求变成新的标签组合|对比两种字段方案，解释标签基数与查询方式。
logql|LogQL 过滤与统计|从内容检索逐步形成统计查询|过滤测试错误日志并按服务统计，核对原始事件数量。
storage|Loki 存储与保留|识别写入、查询和对象存储的职责|画出测试部署数据路径，并验证保留策略的预期范围。|了解
loss|日志丢失、重复与慢查询|按采集、传输、写入和查询分层检查|制造一个采集故障，提交事件对账和定位证据。|会排障`, '选修');
stackModule('obs-elk','ELK / OpenSearch 日志平台','采集 / Pipeline / 索引 / 生命周期','日志模型、JSON、存储与网络基础',
 ['建立字段规范和处理管道','理解索引映射、分片与生命周期','定位写入拒绝、积压和检索异常'],
 '能维护测试日志管道并解释检索和存储的基本取舍。',
 '导入结构化日志，处理一个类型错误与一个异常事件，核对索引字段和失败去向。',
 'Elastic Stack 与 OpenSearch 的具体组件、版本和许可分别核对；不用一份配置假设两者完全兼容。',
 'observability/elk/README.md',`
pipeline|采集与日志处理管道|区分读取、缓冲、解析和投递|用测试日志验证每段处理结果及失败事件去向。
mapping|字段映射与索引|避免类型冲突和不可预期的动态字段|给相同字段输入冲突类型，定位写入失败并修正映射。
shards|分片、副本与集群健康|理解数据分布和未分配分片的影响|观察测试索引分布，解释副本不可用时的健康状态。|了解
lifecycle|生命周期与保留|控制滚动索引、存储层和删除范围|为测试索引配置生命周期，核对旧数据处置条件。
troubleshoot|写入拒绝、积压与查询排障|关联管道状态、集群资源和查询条件|模拟一类投递错误，核对缓冲、错误日志与最终入库事件。|会排障`, '选修');
stackModule('obs-metric-storage','指标存储与 VictoriaMetrics','remote_write / vmagent / 多租户','Prometheus 数据模型、抓取和存储基础',
 ['比较本地时序存储与远程写入','理解采集代理和存储组件的职责','验证多租户、容量、备份与恢复'],
 '能说明何时需要扩展指标存储，并在实验中验证采集到查询的链路。',
 '将测试指标经代理写入 VictoriaMetrics，短时中断后端并观察缓冲和恢复，再验证查询与备份。',
 '这是指标存储进阶选项，先把单套 Prometheus 用清楚；不要把复制或分片直接等同于完整灾备。',
 'observability/victoria-metrics/README.md',`
remote|remote_write 与写入可靠性|理解远程写入队列、重试和容量边界|短时断开测试远端，记录缓冲、失败与恢复后的序列。
vmagent|vmagent 与采集架构|区分目标抓取、重标记和存储职责|将一组实验目标接入代理，核对采集与查询结果。
tenancy|租户、查询与容量|控制访问范围并识别序列增长|用两个测试租户写入查询，检查越权访问与基数指标。
backup|保留、备份与恢复|在独立环境验证时序数据可恢复|恢复一段测试指标，核对查询时间范围和样本。`, '选修');
addModule('kubernetes',{id:'k-observability-stack',stage:4,title:'Kube-Prometheus 监控接入',sub:'Operator / ServiceMonitor / Rules',level:'会用',scope:'必修',pre:'Kubernetes 服务发现、Prometheus 与 RBAC',topics:['理解 Operator 与监控 CRD 的职责','管理目标选择、规则与告警接入','验证集群状态、运行指标与采集权限'],outcome:'能把一项应用接入集群监控，并定位目标发现或规则未生效的问题。',exercise:'在实验监控栈中接入测试应用，核对 ServiceMonitor 选择、目标抓取与规则触发，再故意改错标签并修复。',boundary:'先在隔离集群验证；Chart、Operator、CRD 与应用版本分别核对，安装完成不代表目标已被采集。',resource:'observability/kube-prometheus/guide.md',relatedRoutes:['sre']});
defineLeaves('k-observability-stack',`
operator|Prometheus Operator 与 CRD|区分控制器管理和 Prometheus 实际采集|列出实验监控栈资源，说明每类 CRD 由谁解释。
monitors|ServiceMonitor 与 PodMonitor|核对命名空间、标签与端口选择|接入测试应用，改错 selector 后观察目标为何消失。|会排障
signals|节点、容器与对象状态指标|区分资源用量和 Kubernetes 对象状态|比较节点 exporter、容器指标与 kube-state-metrics 对同一故障的描述。
rules|PrometheusRule 与告警路由|验证规则被接收、评估并送达|触发一条测试规则，从 CRD 状态追踪到通知结果。
access|采集权限与故障定位|区分 RBAC、TLS、网络策略和端点错误|制造一种受控访问失败，结合目标状态和日志修复。|会排障`);
// Teach the added material within the existing routes, without adding another route.
window.OPS_LINUX.chapters[3]='Web 与中间件运维';
window.OPS_LINUX.stages[3].title='Web 与中间件运维';
window.OPS_LINUX.stages[3].sub='先部署应用，再按岗位学习消息与发现服务';
const sreRoute=window.OPS_EXTRA_ROUTES.find(r=>r.id==='sre');
sreRoute.chapters[1]='可观测性平台与告警';
sreRoute.stages[1].title='可观测性平台与告警';
sreRoute.stages[1].sub='贯通采集、处理、存储、查询与通知';
stackModule('obs-trace-backend','Jaeger / Tempo 链路后端','Trace 查询 / 关联 / 保留','OpenTelemetry、Trace/Span 与上下文传播',
 ['区分链路采集、后端存储与查询界面','用真实 Trace 定位耗时和错误','说明采样、数据保留及访问控制的影响'],
 '能用一种链路后端查询真实请求，并说明查不到 Trace 时应检查的环节。',
 '选择 Jaeger 或 Tempo 接收测试 Trace，按 ID 查询异常调用，与日志中的关联字段核对，再诊断一次数据缺失。',
 '先选一种后端深入；仅有 trace_id 字符串不代表链路已采集，采样也会影响可查询范围。',
 'observability/otel/01-foundations-and-instrumentation.md',`
backend|Jaeger 或 Tempo 的职责|把采集协议、链路存储与查询能力分开|选择一种后端，画出应用到 Collector 再到查询界面的数据路径。|了解
query|按 Trace ID 分析调用|识别父子 Span、关键路径与错误|查询一条实际测试 Trace，指出慢调用和异常发生的位置。
correlation|链路与日志交叉验证|确认日志关联指向真实存在的 Trace|从测试错误日志跳到对应 Trace，核对服务、时间和请求标识。
retention|采样、保留与缺失排查|区分未产生、未导出、被采样与已过期|故意阻断一段测试导出链路，依据指标和日志解释查询缺失。|会排障`, '选修');
addModule('linux',{id:'zabbix-operations',stage:4,title:'Zabbix 监控分支',sub:'Agent / 模板 / 触发器 / 发现',level:'会用',scope:'选修',pre:'Linux、网络与基础监控概念',topics:['识别 Agent 采集方式与主机状态','组织模板、监控项、触发器和自动发现','验证维护、通知和故障恢复'],outcome:'能用 Zabbix 完成一台实验主机的采集、告警与排障。',exercise:'接入测试主机并应用模板，触发磁盘或服务告警，验证维护窗口和恢复通知。',boundary:'作为岗位要求下的监控替代分支，可先与 Prometheus 选择一种入门，不要求同时维护两套完整平台。',resource:'https://www.zabbix.com/documentation/current/en/manual'});
defineLeaves('zabbix-operations',`
agent|Zabbix Agent 与采集模式|理解主动和被动采集的连接方向|接入测试主机，核对连接方向、权限和不可达时的日志。
templates|主机、模板与宏|用模板复用检查并限制环境差异|给两台测试主机应用同一模板，通过宏调整一个阈值。
triggers|监控项与触发器|区分数据获取、表达式判断和通知|制造测试异常，核对采集值与触发器进入和恢复状态。
discovery|自动发现与资源变化|让新增设备或文件系统进入监控|在实验机增加一个可监控资源，验证发现和生成检查项。
actions|通知、维护与恢复|验证告警的投递和计划内维护行为|触发测试告警，设置限定维护窗口并验证结束后的通知恢复。`);
