/* Curriculum additions. Existing leaf IDs survive moves so saved progress remains valid. */
function curriculumModule(routeId,id,stage,title,pre,resource,source,scope='必修'){
 defineLeaves(id,source);
 const leaves=window.OPS_LEAVES[id];
 addModule(routeId,{id,stage,title,sub:leaves.slice(0,3).map(n=>n.title).join(' / '),pre,resource,scope,level:'会排障',
  topics:leaves.map(n=>n.objective),outcome:'能在隔离环境完成以下能力，并用操作前后的证据解释结果。',
  exercise:leaves.map(n=>n.exercise).join(' '),boundary:'按节点逐项实验；记录版本、前置条件和恢复步骤，不把一次实验当作生产环境保证。'});
}
curriculumModule('linux','shell-basics',0,'命令组合与文本过滤','终端与文件操作','labs/index.html#linux-commands',`
inspect|命令执行前核对|确认目标、输入和输出文件|在实验目录解释一条命令的每个参数，先预览匹配文件再执行。|会用|入门`);
// Select actual stable slugs, never manufacture replacement IDs.
for(const n of [...window.OPS_LEAVES.bash]){
 if(/管道与重定向|退出码与错误传播|grep、sed、awk 与 jq/.test(n.title)){
  window.OPS_LEAVES.bash=window.OPS_LEAVES.bash.filter(x=>x!==n);
  window.OPS_LEAVES['shell-basics'].push({...n,moduleId:'shell-basics',tier:'入门'});
 }
}
const commandModule=window.OPS_LINUX.nodes.find(m=>m.id==='shell-basics');
commandModule.topics=window.OPS_LEAVES['shell-basics'].map(n=>n.objective);
commandModule.outcome='能组合查看和过滤命令，解释输出去向与失败状态，为后续排障保留证据。';
commandModule.exercise='对实验应用日志筛选成功与失败请求；把输出保存到新文件，比较成功和失败验证的退出码。';
for(const id of ['mq-foundations','service-discovery'])for(const n of window.OPS_LEAVES[id])n.tier='进阶';
curriculumModule('linux','host-security',1,'主机安全维护','账号权限、软件包与服务管理','systems/linux/README.md',`
baseline|主机安全基线|检查账号、监听端口和管理入口|为实验机建立基线清单，找出一个多余监听并关闭，验证业务正常。|会用|入门
patching|补丁评估与回退|把升级纳入可验证的维护流程|记录包版本和变更说明，升级一个测试服务，演练应用回退并说明系统包降级的限制。|会用|进阶
mac|SELinux / AppArmor 拒绝排查|区分普通权限与强制访问控制|在支持的实验发行版定位一次策略拒绝，用限定规则修复并保持策略启用。|会排障|进阶
rotation|SSH 与服务凭证轮换|验证新凭证生效和旧凭证退出|保留恢复会话，为测试身份轮换密钥，核对旧凭证失效和访问审计。|会用|进阶`);
curriculumModule('linux','boot-recovery',1,'系统启动与救援恢复','文件系统、挂载与 systemd','systems/linux/01-foundations-and-boot.md',`
chain|启动链与日志|区分引导、内核、挂载和服务启动|画出实验机启动链，找到本次及上次启动日志。|了解
fstab|挂载错误与启动失败|在救援环境修复错误挂载|在有快照及控制台的可丢弃虚拟机模拟错误 fstab，修复并验证下一次启动。|会排障
rescue|救援入口与恢复清单|在 SSH 不可用时仍能恢复系统|验证虚拟控制台或救援镜像入口，记录磁盘识别、修复和退出步骤。|会用`, '选修');
curriculumModule('linux','network-diagnostics',2,'网络进阶排障','TCP、路由、NAT 与基础抓包','systems/network-fundamentals/03-sockets-security-and-troubleshooting.md',`
retransmit|丢包、重传与双端证据|区分连接建立失败与传输停顿|在隔离网络制造少量丢包，对照客户端和服务端抓包定位缺口。|会排障
mtu|MTU 与路径发现|解释小请求成功而大请求失败|在可恢复的网络命名空间设置 MTU 差异，记录报文大小与失败边界。|会排障
neighbors|ARP 与邻居解析|区分二层邻居失败和路由失败|对照邻居表和抓包分析一个同网段不可达案例。|会排障
conntrack|连接跟踪与端口容量|关联 NAT 状态、连接数和端口耗尽|在限定测试流量下收集连接跟踪统计与 socket 状态，解释容量瓶颈而不盲目增大参数。|会排障
dualstack|IPv4 / IPv6 双栈诊断|分开验证解析、监听和路由|分别检查 A/AAAA、IPv4/IPv6 监听与访问结果，找出一个只在单栈失败的原因。|会排障`);
curriculumModule('linux','mysql-operations',3,'MySQL 进阶运维','SQL、事务、备份与应用连接','data-systems/mysql/guide.md',`
locks|锁等待与死锁|从阻塞关系定位持锁事务|在两个测试会话制造锁等待，再构造死锁，记录事务和受害者而非只重启数据库。|会排障
pool|连接数与连接池耗尽|区分数据库连接限制与应用等待|限制实验连接池并保留长事务，关联应用等待、连接状态与恢复结果。|会排障
replication|复制与延迟|区分接收进度、回放进度与读到的数据|在测试副本暂停回放，写入带序号记录，恢复后核对延迟和数据追平。|会排障
pitr|Binlog 与时间点恢复|用备份与完整日志恢复到误操作之前|在隔离库做全量备份、追加数据和误删，再恢复到目标事务边界并核对记录。|会用
failover|切换与旧主隔离|避免切换后双写和读到旧数据|绘制提升副本、隔离旧主和客户端重连流程，在实验中检查写入唯一入口。|会用
changes|表结构变更与运行影响|评估锁、容量与新旧应用兼容|在小测试表变更字段，记录阻塞、耗时和应用兼容性，不外推生产大表耗时。|会用`);
curriculumModule('linux','redis-operations',3,'Redis 进阶运维','Redis 数据类型、TTL 与持久化','https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/',`
keys|大 Key 与热 Key|区分单键体积和访问倾斜|构造有界测试数据，记录键大小与请求分布，解释两类问题不同的处置。|会排障
latency|慢命令与客户端延迟|区分服务端执行和网络等待|对照客户端耗时、SLOWLOG 与系统指标，解释慢日志没有记录时还需检查什么。|会排障
stampede|击穿、穿透与雪崩|减少缓存失效对数据库的冲击|模拟热点过期、无效查询和集中失效，比较互斥重建、空值缓存与 TTL 分散的作用。|会用
replicas|复制与 Sentinel 切换|验证客户端发现与可能的数据损失|在隔离实例组中中断主节点，记录提升、客户端重连及已确认写入的核对结果。|会用
cluster|Cluster 槽位与重定向|区分数据分片和高可用|用兼容客户端访问测试集群，解释槽位、重定向与多键操作约束。|了解`, '选修');
curriculumModule('kubernetes','k-placement',1,'故障域与副本分布','调度、requests 与工作负载','https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/',`
spread|拓扑分布约束|让副本分布符合主机与可用区边界|配置 topologySpreadConstraints，核对节点标签与副本分布。|会用
unschedulable|约束冲突与 Pending|权衡分布要求和可调度性|减少实验可用节点，对比硬约束与软约束的事件和实际分布。|会排障
disruption|故障与维护的不同边界|区分 PDB、冗余与容量保障|比较主动 drain 和节点突然失联的影响，说明 PDB 为什么不能保证所有故障下的可用性。|会用`);
curriculumModule('kubernetes','k-controlplane',5,'控制面与扩展组件故障','集群架构、证书、Linux 排障','cloud-native/kubernetes/README.md',`
api|API 不可达与认证失败|区分网络、证书、身份和服务异常|使用受控实验配置复现证书错误与连接失败，提交不同诊断路径。|会排障
etcd|etcd 仲裁与磁盘延迟|识别控制面存储异常的影响|在可丢弃集群检查成员、仲裁和存储延迟，解释 API 写入异常的证据。|会排障
webhook|准入 Webhook 故障|定位请求被拒绝或超时的扩展环节|在隔离集群让测试 Webhook 不可达，比较失败策略并记录恢复办法。|会排障
controllers|协调停滞与工作队列|区分对象已提交和实际状态已收敛|暂停测试控制器，观察 generation、状态与事件，恢复后验证收敛。|会排障`);
extendLeaves('k-storage',`
expansion|PVC 扩容与驱动能力|核对存储类和文件系统扩容条件|在支持的测试 CSI 扩容 PVC，观察容量、事件与应用读写，记录不能缩容的边界。|会用|进阶
snapshot|卷快照与应用一致性|区分存储快照和业务备份|核对快照 CRD、控制器和 CSI 支持，从测试快照创建新卷并检查业务数据。|会用|进阶
attachments|卷挂载与节点迁移|定位拓扑约束和残留挂载|模拟有状态 Pod 节点迁移，结合 PVC、VolumeAttachment 与事件定位等待，不强行删除未知挂载。|会排障|进阶`);
extendLeaves('d-ops',`
registry|制品丢失与仓库故障|确保回滚依赖的制品仍可取得|模拟测试制品不可用，从保留副本恢复相同摘要并核对部署记录。|会排障
runners|执行器失联与发布中断|识别中断时已产生的部署副作用|中断一次测试部署，核对实际版本后重试，证明不会同时执行两次发布。|会排障
bootstrap|恢复顺序与引导依赖|避免恢复平台依赖平台本身|为 Git、身份、制品库和执行器安排恢复顺序，验证最小人工引导路径。|会用`);
curriculumModule('devops','d-config-release',4,'配置发布与功能开关','环境配置、渐进发布与回退','delivery/gitops/01-principles-workflow-and-adoption.md',`
validation|配置契约与预检查|在发布前发现合法格式下的错误值|为测试配置增加范围及关联校验，拒绝一个语法正确但语义无效的变更。|会用
rollout|配置灰度与版本追踪|让运行实例的配置版本可见|向部分测试实例发布新配置，按配置版本对照指标并回退。|会用
flags|功能开关与清理|区分部署完成和功能对用户开放|用开关控制测试功能，验证默认值、故障降级、负责人和删除期限。|会用`);
extendLeaves('d-iac',`
recovery|状态备份与灾难恢复|保留基础设施状态的可恢复性|在隔离后端恢复测试状态，重新 plan 并核对现有资源，禁止盲目重建。|会用|进阶
dependencies|模块与 Provider 升级|评估依赖升级带来的资源差异|锁定依赖并在测试环境升级，审查替换或销毁计划后验证回退条件。|会用|进阶`);
curriculumModule('sre','s-dependency-risk',4,'依赖故障与一致性验证','服务依赖、超时重试与恢复','architecture/04-reliability-and-disaster-recovery.md',`
shared|共享依赖与相关故障|识别看似独立副本的共同依赖|为双实例服务标出共享 DNS、身份和存储，模拟一个共同依赖异常并记录影响。|会用
partial|部分失败与灰色故障|避免健康检查掩盖真实业务失败|仅让一类请求或一个依赖变慢，对照探针、用户指标与告警。|会排障
reconnect|恢复瞬间的重连风暴|验证恢复过程不会再次压垮依赖|限制实验并发，让客户端同时重连，再加入抖动与限速比较峰值。|会用
reconcile|恢复后的数据对账|区分接口可用与业务结果正确|在测试写入途中中断依赖，恢复后核对遗漏、重复与补偿记录。|会用`);
extendLeaves('s-load',`
arrival|到达率与闭环压测|识别客户端等待造成的负载下降|固定并发与固定到达率分别测试慢响应，记录实际请求率和未发送请求，解释结论差异。|会用|进阶
soak|持续负载与资源趋势|发现短压测遗漏的缓慢退化|在有停止阈值的实验中持续运行固定负载，观察内存、连接和队列趋势。|会排障|进阶`);
extendLeaves('s-sli',`
aggregation|分位数与聚合口径|避免平均实例 P99 得到错误结论|对两组不同流量的延迟样本计算整体达标率，比较平均分位数与合并分布的差异。|会用|进阶`);
// A leaf can point at a chapter without changing all its siblings.
window.OPS_LEAF_RESOURCES={
 'mysql-operations.pitr':'data-systems/mysql/guide.md#第31章-数据误删恢复与预防策略',
 'mysql-operations.locks':'data-systems/mysql/guide.md#第7章-行锁原理与死锁预防策略',
 'mysql-operations.replication':'data-systems/mysql/guide.md#第24章-主从复制与数据一致性保障',
 'k-placement.spread':'https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/',
 'k-storage.snapshot':'https://kubernetes.io/docs/concepts/storage/volume-snapshots/',
 'redis-operations.latency':'https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/'
};
