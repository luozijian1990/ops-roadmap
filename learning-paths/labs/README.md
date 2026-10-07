# 贯穿实验室

[浏览器版步骤与六路线任务](./index.html) · [返回路线](../index.html) · [验收模板](./evidence-template.md)

## 起步与文件

### 最小运行环境

Python 3.9+，无需 pip 安装依赖。在本目录执行 `python3 app.py`，另一终端执行 `python3 labctl.py verify`。基础服务默认仅监听 `127.0.0.1:8088`，使用 `.state/app.db`；`.state/` 已忽略。

| 文件 | 用途 |
| --- | --- |
| `app.py` | 读取 SQLite 的 HTTP 服务；存活、就绪、版本、指标和结构化日志 |
| `labctl.py` | 增加测试数据、切换应用故障、备份和恢复到新文件、业务冒烟 |
| `compose.yaml` | Nginx + 应用；`databases` profile 提供独立 MySQL / Redis |
| `ops-lab.service` | Linux systemd 安装示例 |
| `kubernetes.yaml` | 带探针、资源和安全上下文的临时存储起始清单 |
| `tests/test_lab.py` | 故障、业务读取和隔离恢复的自动验证 |

支持 `python3 app.py --state /path/to/isolated/state --port 8089 --version v2`。控制工具要使用相同 `--state`，例如 `python3 labctl.py --state /path/to/isolated/state fault none`。HTTP 验证另用 `verify --url http://127.0.0.1:8089` 指定访问地址。

## Linux 实验

### Linux 服务管理

仅在可恢复的 Linux 实验机使用管理员权限安装；先确认 `/opt/ops-lab` 和服务名未被其他用途占用。以下命令在本目录执行。发行版没有 `/usr/bin/python3` 时，先修正 unit 的路径。

```bash
sudo useradd --system --home-dir /var/lib/ops-lab --shell /usr/sbin/nologin ops-lab
sudo install -d -m 755 /opt/ops-lab
sudo install -m 644 app.py labctl.py /opt/ops-lab/
sudo install -m 644 ops-lab.service /etc/systemd/system/ops-lab.service
sudo systemctl daemon-reload
sudo systemctl enable --now ops-lab
systemctl status ops-lab
sudo journalctl -u ops-lab -n 20 --no-pager
python3 labctl.py verify
```

`StateDirectory` 创建并授权 `/var/lib/ops-lab`。实验故障命令须以该用户执行，并指定此目录：

```bash
sudo -u ops-lab python3 /opt/ops-lab/labctl.py --state /var/lib/ops-lab fault unready
python3 labctl.py verify
sudo -u ops-lab python3 /opt/ops-lab/labctl.py --state /var/lib/ops-lab fault none
```

练习：备份 unit，再在实验机把 `ExecStart` 指向不存在的文件，执行 daemon-reload 与 restart。通过退出状态和 journal 定位；恢复 unit 后重新加载并启动，核对就绪和业务记录。开机恢复要实际重启虚拟机验证，单次 restart 不算完成。

清理：`sudo systemctl disable --now ops-lab`；备份数据后删除**本次创建**的 unit 和 `/opt/ops-lab` 文件，再 daemon-reload。`/var/lib/ops-lab` 的数据自行核对后清理，不自动删除账号或目录。

### HTTPS 与证书故障

在宿主机已有 Nginx / OpenSSL 的独立实验环境执行。下面是给命令行客户端显式信任的自签证书，不导入系统信任库。OpenSSL 需支持 `-addext`；生成的是短期测试证书。

```bash
mkdir -p .state/tls
openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
  -keyout .state/tls/lab.key -out .state/tls/lab.crt \
  -subj '/CN=lab.local' -addext 'subjectAltName=DNS:lab.local'
chmod 600 .state/tls/lab.key
```

为独立 Nginx 配置添加以下 server，证书路径替换为刚生成文件的绝对路径。先 `nginx -t`，成功后重载此实验 Nginx。这里的宿主机代理配置与 Compose 的 Docker DNS 配置分开使用。

```nginx
server {
    listen 127.0.0.1:8443 ssl;
    server_name lab.local;
    ssl_certificate /absolute/path/to/.state/tls/lab.crt;
    ssl_certificate_key /absolute/path/to/.state/tls/lab.key;
    location / { proxy_pass http://127.0.0.1:8088; }
}
```

```bash
curl --noproxy '*' --cacert .state/tls/lab.crt \
  --resolve lab.local:8443:127.0.0.1 https://lab.local:8443/api/items
curl --noproxy '*' --cacert .state/tls/lab.crt \
  --resolve wrong.local:8443:127.0.0.1 https://wrong.local:8443/api/items
```

预期前者成功，后者因名称不匹配失败。记录 TLS 错误与退出码，不使用 `-k` 绕过验收。清理本次新增 server 后再次校验和重载。

## 实验边界与验证

### 执行检查

```bash
python3 -m unittest discover -s tests -v
docker compose config --quiet
```

单元与 HTTP 集成测试只验证基础应用及控制工具。Compose 实验需要 Docker；systemd、CSI、控制面故障及云上恢复要在对应实验环境另外执行。基础应用不是生产 Web Server，不提供认证、分布式追踪、Histogram、共享写入数据库或负载生成器。

### 与路线扩展的关系

Linux 新增 MySQL / Redis 进阶、主机安全、启动恢复和网络诊断。Kubernetes 补拓扑分布、控制面及 CSI 生命周期；DevOps 补配置发布、制品恢复与 IaC 状态恢复；SRE 补依赖相关故障、部分失败、恢复对账与压测口径。页面节点保留独立验收，实验室只提供可复用起点，不自动把这些高级能力标为完成。

参考：[Kubernetes 拓扑分布](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/)、[卷快照](https://kubernetes.io/docs/concepts/storage/volume-snapshots/)、[Redis 延迟诊断](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/)、[SLO 实践](https://sre.google/workbook/implementing-slos/)。能力与命令仍需按实验版本核对。
