# 数据库独立实验

本页对应 Linux 路线第 5 阶段“数据库与缓存运维”。基础练习覆盖 MySQL 事务、锁等待与单表逻辑恢复，Redis TTL 和持久化；完整阶段的 11 个模块还要求逐步补齐以下证据。

| 学习模块 | 进阶时补充的实验与证据 |
| --- | --- |
| 数据职责与一致性基础 | 主键与唯一约束、数据权威来源、数据库与缓存的读取时序 |
| SQL 与 MySQL 基础 | 限权账号、越权拒绝、查询与回滚后的数据核对 |
| MySQL 实例与日常操作 | 生效配置、字符集与时区、长事务、查询计划与空间开销 |
| MySQL 进阶运维 | 连接池耗尽、复制回放延迟、PITR、切换及旧主隔离 |
| MySQL 日志、备份与维护 | 日志职责、备份一致性、保留窗口、升级兼容及恢复路径 |
| Redis 与缓存基础 | 类型与 TTL、内存淘汰、持久化配置和连接故障 |
| Redis 连接、安全与持久化 | ACL 键及命令限制、连接池、快照和 AOF 重写资源开销 |
| Redis 进阶运维 | 热 Key / 大 Key、慢命令；按需做 Sentinel 和 Cluster 实验 |
| 缓存读写与失效治理 | Cache Aside 失败窗口、缓存不可用时的回源保护、分批重建对账 |
| 数据库与缓存监控排障 | 请求延迟、锁等待、命中与淘汰、采集失败告警及容量余量 |
| 变更、恢复与运行交接 | 实例清单、隔离恢复、数据差距、变更回退及他人复现 |

下方基础步骤并未实现表中全部进阶实验。每项以路线节点中的独立验收为准，不能仅因容器启动成功就标记完成。

## 实验准备

### 数据与连接边界

在本目录启动 `docker compose --profile databases up -d mysql redis`。MySQL 初始化可能需要等待，通过下列交互命令能登录后再开始。密码 `local-lab-only` 仅用于本项目的非敏感示例数据；数据库没有映射宿主机端口，不要复用这份配置到生产环境。Redis 无认证，仅存在于本项目 Docker 网络。

```bash
docker compose exec mysql mysql -u learner -p lab
```

系统提示时输入示例密码。第一次创建卷会初始化 `accounts` 表，两行初始余额各为 100；重复启动保留数据。每轮实验前先查询基线，不假定余额始终为初值。

## MySQL

### 锁等待与事务回滚

打开两个上述会话。会话 A：

```sql
START TRANSACTION;
UPDATE accounts SET balance = balance - 10 WHERE id = 1;
SELECT * FROM accounts;
```

会话 B：

```sql
SET SESSION innodb_lock_wait_timeout = 5;
START TRANSACTION;
UPDATE accounts SET balance = balance + 10 WHERE id = 1;
```

预期 B 等待后报锁等待超时。A 执行 `ROLLBACK;`，B 也执行 `ROLLBACK;` 后重试同一更新并 `COMMIT;`，应成功。记录阻塞行、事务开始与结束时间、错误和最终余额。不要把锁等待超时自动当作整个事务已经回滚。

### 构造死锁并区别于超时

A、B 分别开始新事务；A 更新 id=1，B 更新 id=2；然后 A 更新 id=2（等待），B 更新 id=1。启用默认死锁检测的实验实例会中止其中一个事务。记录哪个事务被选为受害者，结束剩余事务并查询最终结果。这与上一节等待 5 秒后超时是两种现象。

### 逻辑备份与隔离恢复

这一步在容器内生成文件，避免把密码放在命令行。打开容器 shell：

```bash
docker compose exec mysql sh
mysqldump -u learner -p --no-tablespaces --set-gtid-purged=OFF \
  --single-transaction lab accounts > /tmp/accounts.sql
```

输入示例密码。通过一个新的表名恢复，保留原表用于比较；这里只处理这份固定实验表，不对未知 SQL 文件做自动替换：

```bash
sed 's/`accounts`/`accounts_restored`/g' /tmp/accounts.sql > /tmp/accounts-restored.sql
mysql -u learner -p lab
```

在 MySQL 客户端中先确认新表不存在（已存在请换新名字），再执行：

```sql
SHOW TABLES LIKE 'accounts_restored';
SOURCE /tmp/accounts-restored.sql;
SELECT * FROM accounts ORDER BY id;
SELECT * FROM accounts_restored ORDER BY id;
```

比较每行记录，记录恢复耗时。它验证的是单表逻辑备份，**没有验证** binlog 时间点恢复、复制延迟或主从切换。进阶按 [MySQL 笔记](../../topics/data-systems/mysql/guide.md) 的对应章节另建副本实验，保留事务边界和旧主隔离证据。

## Redis

### TTL、内存与持久化

```bash
docker compose exec redis redis-cli SET lab:ttl example EX 5
docker compose exec redis redis-cli TTL lab:ttl
docker compose exec redis redis-cli SET lab:persist before-restart
docker compose exec redis redis-cli INFO persistence
docker compose restart redis
docker compose exec redis redis-cli GET lab:persist
docker compose exec redis redis-cli INFO memory
docker compose exec redis redis-cli SLOWLOG GET 5
```

核对短期键过期、持久键在正常重启后存在、AOF 状态及内存限制。正常重启不等于验证断电恢复；空慢日志也不证明客户端没有延迟。要验证内存淘汰，在 64 MB 上限内逐批增加有界测试数据并监控，不向宿主机无限写入。

### 结束与下一步

`docker compose --profile databases down` 停止本项目容器并保留数据。确认备份与证据已保存、只含本次实验数据后，可执行 `docker compose --profile databases down -v` 删除项目数据卷。

大 Key / 热 Key、Sentinel、Cluster、缓存失效保护属于下一轮独立实验；应用基础版没有连接这些组件，不能用它的模拟故障替代真实组件验收。
