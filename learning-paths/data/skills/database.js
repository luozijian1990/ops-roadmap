/* Dedicated Linux stage; all existing node IDs and storage keys remain stable. */
const databaseModuleIds=new Set(['mysql','mysql-operations','redis','redis-operations']);
for(const module of window.OPS_LINUX.nodes){
 if(databaseModuleIds.has(module.id))module.stage=4;
 else if(module.stage>=4)module.stage+=1;
}
window.OPS_LINUX.stages.splice(4,0,{
 title:'数据库与缓存运维',sub:'从读写与权限到性能排障和数据恢复',
 task:'交付可恢复的 MySQL 与 Redis 实验环境',
 proof:'使用独立账号维护测试数据；复现 MySQL 锁等待与 Redis 缓存失效；把数据库备份恢复到隔离实例，对账并记录恢复耗时与数据差距。复制和集群按进阶节点另行验收。'
});
window.OPS_LINUX.chapters.splice(4,0,'数据库与缓存运维');
window.OPS_LINUX.practiceNames.splice(4,0,'数据库恢复与缓存失效演练');
const redisModule=window.OPS_LINUX.nodes.find(m=>m.id==='redis');
redisModule.scope='必修';
redisModule.boundary='Redis 可用于缓存及其他数据场景；持久化和副本不能代替经过验证的独立备份。';
redisModule.resource='labs/database-drills.md';
const redisAdvanced=window.OPS_LINUX.nodes.find(m=>m.id==='redis-operations');
redisAdvanced.scope='必修';
redisAdvanced.boundary='先掌握单实例；Sentinel 与 Cluster 按业务需求选择，不把故障切换等同于数据零丢失。';
for(const n of window.OPS_LEAVES.redis)n.tier='入门';
for(const n of window.OPS_LEAVES['redis-operations'])n.tier=['replicas','cluster'].some(s=>n.id.endsWith('.'+s))?'选修':'进阶';
function databaseModule(id,stage,title,pre,resource,source){
 defineLeaves(id,source);
 const leaves=window.OPS_LEAVES[id];
 window.OPS_LINUX.nodes.push({id,stage:4,title,sub:leaves.slice(0,3).map(n=>n.title).join(' / '),pre,resource,scope:'必修',level:'会用',
  topics:leaves.map(n=>n.objective),outcome:'能逐项完成本模块的数据操作，保留前后证据并解释失败与恢复条件。',
  exercise:leaves.map(n=>n.exercise).join(' '),boundary:'只在独立实验实例操作；记录版本和数据基线，不将测试数据集上的结果外推为生产保证。'});
}
databaseModule('db-foundations',0,'数据职责与一致性基础','Linux、网络与应用部署','data-systems/mysql/guide.md',`
roles|数据库、缓存与权威数据|明确一份数据从哪里产生及能否重建|给测试业务画出 MySQL 与 Redis 读写路径，说明缓存丢失后从哪里恢复。|了解|入门
schema|主键、约束与数据模型|用约束表达稳定身份和合法数据|为两张有关联的表设计主键、唯一约束与字段类型，验证重复键和无效数据被拒绝。|会用|入门
consistency|事务、一致性与副本读取|区分事务提交和其他读者看到新值的时间|用双会话观察提交前后读取差异，列出主库、异步副本和缓存三种读取可能的滞后。|了解|入门
lab|实验隔离与数据基线|让误操作只影响可重建数据|建立独立实例与测试库，记录初始行数、关键字段和资源上限，演示清理范围。|会用|入门`);
databaseModule('mysql-service',1,'MySQL 实例与日常操作','SQL 基础、账号与事务','data-systems/mysql/guide.md',`
layout|进程、配置与数据目录|识别实例实际读取的配置与持久数据|记录进程参数、端口、日志和数据目录，用查询核对生效变量，区分动态设置和重启生效。|会用|入门
writes|安全增删改与影响范围|在写入前确认目标和预期行数|在测试事务中先查询目标，再执行更新并核对影响行数，分别验证提交与回滚。|会用|入门
sessions|会话、长事务与连接管理|定位占用连接和持锁时间过长的会话|建立空闲连接及长事务，对照会话状态，说明终止查询和终止连接的不同影响。|会排障|进阶
charset|字符集、排序规则与时间|识别字符比较和时间显示造成的数据误解|插入中文与大小写测试值，核对连接与表的字符集、排序规则和会话时区。|会用|入门
indexes|索引代价与查询计划|结合扫描行数和写入代价判断索引收益|固定数据与查询，对比计划和耗时，同时测量新增索引后的写入与空间变化。|会排障|进阶`);
databaseModule('mysql-recovery',2,'MySQL 日志、备份与维护','事务、逻辑备份与实例管理','data-systems/mysql/guide.md',`
logs|Redo、Undo 与 Binlog|区分崩溃恢复、事务回滚和归档日志|画出一笔测试写入相关日志的职责，说明仅保留 Binlog 为什么不能替代完整恢复方案。|了解|进阶
backup|一致性备份与保留窗口|让备份覆盖恢复目标所需数据和日志|为测试库制定备份和日志保留策略，在写入期间备份并在新库验证一致性。|会用|进阶
lag|复制延迟与读后写一致性|定位日志接收、回放和应用读取的差异|制造受控延迟，关联复制状态与业务序号，验证依赖读到新值的请求如何处理。|会排障|进阶
upgrade|版本升级与兼容回退|先验证数据格式和客户端兼容再维护|用副本数据演练一项升级，检查应用查询与备份恢复；明确不能简单降级二进制的情况。|会用|进阶`);
databaseModule('redis-service',3,'Redis 连接、安全与持久化','Redis 键、TTL 与基础网络','labs/database-drills.md',`
commands|常用类型与原子命令|按数据结构选择命令并理解单次操作语义|使用字符串、Hash、List、Set 和有序集合建模小数据，验证一个原子计数操作。|会用|入门
acl|ACL 与最小权限|限制身份可访问的键和命令|建立仅允许 lab 前缀读写的测试身份，验证访问其他键和管理命令被拒绝。|会用|入门
clients|连接池、超时与连接上限|区分连接失败、排队与服务端慢执行|限制测试客户端连接池，比较超时、连接数和服务端响应证据。|会排障|进阶
rewrite|AOF 重写与快照开销|观察持久化后台任务对资源的影响|在有界数据集触发快照和重写，记录持久化状态、内存及 IO，说明正常重启与崩溃测试的差别。|会用|进阶`);
databaseModule('redis-cache-patterns',4,'缓存读写与失效治理','Redis TTL、MySQL 读写与应用请求','architecture/04-reliability-and-disaster-recovery.md',`
aside|Cache Aside 与更新顺序|解释数据库和缓存无法天然原子更新|画出读取与更新时序，模拟一次更新和失效间的失败，说明可能读到旧值的窗口。|会用|进阶
eviction|过期、淘汰与命中率|区分 TTL 到期和内存不足触发的淘汰|在受限实例记录命中、未命中、过期和淘汰，比较策略与回源流量。|会排障|进阶
degrade|缓存故障与数据库保护|防止缓存不可用时回源拖垮持久库|在实验中停用缓存，验证有界并发、降级和超时策略，并核对数据库压力。|会用|进阶
rebuild|缓存预热与数据核对|限制重建流量并验证缓存与权威数据一致|清空仅含测试键的实例后分批重建，检查速率、抽样内容和过期策略，不恢复过时缓存覆盖新值。|会用|进阶`);
databaseModule('db-monitoring',5,'数据库与缓存监控排障','MySQL、Redis 日常维护与基础监控','data-systems/mysql/guide.md#第29章-数据库健康检测与监控方法',`
signals|请求、连接与资源指标|把业务异常与数据库内部信号关联|为 MySQL 查询延迟、锁等待和 Redis 命中、淘汰各选择指标，解释仅看 CPU 的盲区。|会用|入门
alerts|可行动告警与自监控|区分服务失败、采集失败和低流量|分别触发连接失败与采集失效，验证通知、恢复与对应运行手册。|会用|入门
capacity|容量增长与水位|同时考虑数据、日志、副本和恢复空间|记录一段测试增长，估算磁盘与内存余量，包含备份、重写和恢复临时空间。|会用|进阶
diagnosis|性能基线与分层定位|用应用、客户端和服务端证据缩小原因|给一个慢请求保存三层时间线，排除连接等待、锁阻塞或慢命令，再同条件验证修复。|会排障|进阶`);
databaseModule('db-delivery',5,'变更、恢复与运行交接','备份、监控和实例维护','labs/database-drills.md',`
inventory|实例清单与责任边界|记录版本、拓扑、身份与数据归属|整理实验 MySQL 和 Redis 的连接方式、负责人、依赖及维护窗口，凭证只保留存放位置。|会用|入门
restore|隔离恢复与业务对账|用实际数据核对恢复是否满足目标|恢复备份到新实例，对比关键记录与业务查询，记录耗时和数据差距，不只看启动成功。|会用|入门
change|变更预检与回退条件|把配置、数据变更和客户端影响分别验证|为测试配置变更写明基线、停止条件和回退步骤，演练失败后确认业务恢复。|会用|进阶
handover|运行手册与复盘|让另一人能按证据完成处置|让他人按手册处理一个受控故障，记录缺失步骤并增加回归检查。|会用|入门`);

const databaseOrder=['db-foundations','mysql','mysql-service','mysql-operations','mysql-recovery','redis','redis-service','redis-operations','redis-cache-patterns','db-monitoring','db-delivery'];
const databaseModules=databaseOrder.map(id=>window.OPS_LINUX.nodes.find(m=>m.id===id));
window.OPS_LINUX.nodes=[...window.OPS_LINUX.nodes.filter(m=>m.stage<4),...databaseModules,...window.OPS_LINUX.nodes.filter(m=>m.stage>4)];
window.OPS_LINUX.stages[3].task='交付一个可回滚的 HTTPS 应用';
window.OPS_LINUX.stages[3].proof='使用现成示例应用配置反向代理，完成版本升级和回滚，核对健康与业务请求；数据库专项操作在下一阶段完成。';
window.OPS_LINUX.practiceNames[3]='上线并回滚 HTTPS 应用';
