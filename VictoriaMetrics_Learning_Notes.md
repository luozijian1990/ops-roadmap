# VictoriaMetrics 学习笔记

> 本学习笔记基于 VictoriaMetrics 官方文档整理，旨在帮助初学者系统学习 VictoriaMetrics 时序数据库及其生态组件。

---

## 📚 目录

- [第 1 章：快速入门指南](#第-1-章快速入门指南)
- [第 2 章：单机版 VictoriaMetrics](#第-2-章单机版-victoriametrics)
- [第 3 章：集群版 VictoriaMetrics](#第-3-章集群版-victoriametrics)
- [第 4 章：vmagent 组件详解](#第-4-章vmagent-组件详解)
- [第 5 章：vmalert 组件详解](#第-5-章vmalert-组件详解)
- [第 6 章：vmauth 组件详解](#第-6-章vmauth-组件详解)
- [第 7 章：vmbackup 组件详解](#第-7-章vmbackup-组件详解)
- [第 8 章：vmrestore 组件详解](#第-8-章vmrestore-组件详解)
- [第 9 章：最佳实践](#第-9-章最佳实践)

---

## 第 1 章：快速入门指南

### 🌟 VictoriaMetrics 生态全景

```mermaid
graph TB
    subgraph Data_Sources[数据源]
        A1[Prometheus]
        A2[应用程序]
        A3[Exporters]
        A4[基础设施]
    end
  
    subgraph Collection[数据采集层]
        B[vmagent<br/>数据采集代理]
    end
  
    subgraph Storage[存储层]
        C1[VictoriaMetrics<br/>单机版]
        C2[VictoriaMetrics Cluster<br/>vminsert + vmstorage + vmselect]
    end
  
    subgraph Auth[认证路由层]
        D[vmauth<br/>认证与负载均衡]
    end
  
    subgraph Alert[告警层]
        E[vmalert<br/>告警与记录规则]
        F[Alertmanager]
    end
  
    subgraph Backup[备份恢复层]
        G1[vmbackup<br/>数据备份]
        G2[vmrestore<br/>数据恢复]
        G3[对象存储<br/>S3/GCS/Azure]
    end
  
    subgraph Visualization[可视化层]
        H[Grafana]
    end
  
    A1 & A2 & A3 & A4 -->|push/scrape| B
    B -->|remote write| D
    D -->|route & auth| C1
    D -->|route & auth| C2
  
    C1 & C2 -.->|query| E
    E -->|alerts| F
  
    C1 & C2 -->|backup| G1
    G1 -->|store| G3
    G3 -->|restore| G2
    G2 -.->|recover to| C1
    G2 -.->|recover to| C2
  
    D -->|query API| H
    C1 & C2 -.->|query| H
  
    style B fill:#e1f5ff
    style C1 fill:#ffe1e1
    style C2 fill:#ffe1e1
    style D fill:#fff4e1
    style E fill:#e8f5e1
    style G1 fill:#f0e1ff
    style G2 fill:#f0e1ff
```

**核心组件说明**：

- **vmagent**：采集和转发指标数据，支持 Prometheus remote write 协议
- **VictoriaMetrics**：时序数据存储引擎（单机版或集群版）
- **vmauth**：认证、路由和负载均衡代理
- **vmalert**：执行告警规则和记录规则
- **vmbackup/vmrestore**：数据备份和恢复工具

---

### 1.1 VictoriaMetrics 概述

VictoriaMetrics 是一个高性能的时序数据库和监控解决方案，支持单机和集群两种部署模式。

#### 1.1.1 产品形态

VictoriaMetrics 提供以下几种发行版本：

| 产品形态                                | 说明                                  | 适用场景                                                 |
| --------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| **Single-server-VictoriaMetrics** | all-in-one 二进制文件，易于运行和维护 | 中小规模监控，完美支持垂直扩展，可轻松处理数百万指标     |
| **VictoriaMetrics Cluster**       | 由多个组件构成，支持水平扩展          | 大规模监控场景，需要高可用性和水平扩展能力               |
| **VictoriaMetrics Cloud**         | 云托管版本                            | 无需担心 DevOps 运维任务（配置调优、监控、日志、备份等） |

#### 1.1.2 单机版 vs 集群版架构对比

```mermaid
graph TB
    subgraph Single["单机版架构 (Single-server)"]
        direction TB
        S1[vmagent<br/>数据采集] -->|remote write| S2[VictoriaMetrics<br/>All-in-One]
        S2 -->|query| S3[Grafana]
        S4[vmalert] -.->|query rules| S2
  
        style S2 fill:#ffe1e1
    end
  
    subgraph Cluster["集群版架构 (Cluster)"]
        direction TB
        C1[vmagent<br/>数据采集] -->|remote write| C2[vminsert<br/>写入节点]
        C2 -->|distribute| C3[vmstorage<br/>存储节点]
        C3 -->|query| C4[vmselect<br/>查询节点]
        C4 -->|results| C5[Grafana]
        C6[vmalert] -.->|query rules| C4
  
        style C2 fill:#e1f5ff
        style C3 fill:#ffe1e1
        style C4 fill:#fff4e1
    end
  
    Note1["单机版特点:<br/>✓ 简单易部署<br/>✓ 垂直扩展<br/>✓ 适合中小规模"] -.-> Single
    Note2["集群版特点:<br/>✓ 水平扩展<br/>✓ 高可用性<br/>✓ 适合大规模"] -.-> Cluster
```

**选择建议**：

- **单机版**：数据量 < 每秒百万样本，垂直扩展足够
- **集群版**：数据量 > 每秒百万样本，需要水平扩展和高可用

#### 1.1.3 安装包形式

VictoriaMetrics 提供多种安装方式：

- **Docker 镜像**：可从 [Docker Hub](https://hub.docker.com/r/victoriametrics/victoria-metrics/) 和 [Quay](https://quay.io/repository/victoriametrics/victoria-metrics) 获取
- **Helm Charts**：适用于 Kubernetes 环境
- **Kubernetes Operator**：声明式管理 VictoriaMetrics
- **二进制发行版**：直接下载可执行文件
- **Ansible Roles**：自动化部署
- **源代码**：支持从源码构建
- **云平台模板**：Linode、DigitalOcean 等

> [!TIP]
> VictoriaMetrics 开发节奏很快，建议定期查看 [CHANGELOG](https://github.com/VictoriaMetrics/VictoriaMetrics/blob/master/docs/CHANGELOG.md) 并执行常规升级。

---

### 1.2 部署方式详解

#### 1.2.1 在 VictoriaMetrics Cloud 上启动

```mermaid
graph TD
    A[访问 VictoriaMetrics Cloud] --> B[注册账号 免费]
    B --> C[获得 $200 试用额度]
    C --> D{选择部署模式}
    D --> E[Single Node 单机版]
    D --> F[Cluster 集群版]
    E --> G[跟随快速入门指南配置]
    F --> G
```

**步骤：**

1. 访问 [VictoriaMetrics Cloud](https://victoriametrics.com/products/cloud/) 并注册（免费）
2. 注册后立即获得 **$200 试用额度**
3. 可用于运行单机版或集群版
4. 按照官方快速入门指南进行配置

**优势：**

- 无需关心基础设施管理
- 自动处理配置调优、监控、日志收集、访问保护、软件更新、备份等

---

#### 1.2.2 使用 Docker 启动单机版

##### 基本启动命令

```bash
# 拉取最新镜像
docker pull victoriametrics/victoria-metrics:v1.130.0

# 启动容器
docker run -it --rm \
  -v `pwd`/victoria-metrics-data:/victoria-metrics-data \
  -p 8428:8428 \
  victoriametrics/victoria-metrics:v1.130.0 \
  --selfScrapeInterval=5s \
  -storageDataPath=victoria-metrics-data
```

##### 重要 Flag 参数说明

| Flag 参数                | 说明                      | 示例值                       | 必需 |
| ------------------------ | ------------------------- | ---------------------------- | ---- |
| `-storageDataPath`     | 数据存储路径              | `victoria-metrics-data`    | ✅   |
| `--selfScrapeInterval` | 自我抓取指标的间隔时间    | `5s`                       | ❌   |
| `-p 8428:8428`         | 端口映射（Docker 参数）   | 将容器 8428 端口映射到宿主机 | ✅   |
| `-v`                   | 数据卷挂载（Docker 参数） | 持久化存储数据               | ✅   |

##### 启动成功标志

启动成功后，你会看到如下输出：

```
started server at http://0.0.0.0:8428/
partition "2025_03" has been created
```

##### 访问界面

启动成功后，可访问以下界面：

| 界面                    | URL                                                                       | 说明                    |
| ----------------------- | ------------------------------------------------------------------------- | ----------------------- |
| **VMUI 图形界面** | [http://localhost:8428/vmui](http://localhost:8428/vmui)                     | Web 图形界面            |
| **指标浏览器**    | [http://localhost:8428/vmui/#/metrics](http://localhost:8428/vmui/#/metrics) | 查看所有可用指标        |
| **查询界面**      | [http://localhost:8428/vmui](http://localhost:8428/vmui)                     | 执行 PromQL 查询        |
| **HTTP 端点列表** | [http://localhost:8428](http://localhost:8428)                               | 查看所有可用的 API 端点 |

> [!NOTE]
> 使用 `--selfScrapeInterval=5s` 后，VictoriaMetrics 会抓取自身指标，约 **30 秒**后这些指标可供查询。可尝试查询 `process_cpu_cores_available` 等指标。

##### 企业版镜像

企业版镜像请参考 [官方文档](https://docs.victoriametrics.com/enterprise/)。

---

#### 1.2.3 使用 Docker 启动集群版

##### 启动命令

```bash
# 克隆仓库
git clone https://github.com/VictoriaMetrics/VictoriaMetrics && cd VictoriaMetrics

# 启动集群环境
make docker-vm-cluster-up
```

##### 启动成功标志

```
✔ Container vmstorage-1        Started
✔ Container vmselect-1         Started
✔ Container vminsert           Started
✔ Container vmagent            Started
```

##### 集群组件说明

```mermaid
graph TD
    A[数据源] --> B[vmagent]
    B --> C[vminsert]
    C --> D1[vmstorage-1]
    C --> D2[vmstorage-2]
    C --> D3[vmstorage-N]
  
    E[查询客户端] --> F[vmselect]
    F --> D1
    F --> D2
    F --> D3
  
    G[Grafana] --> F
```

该命令会启动一组 VictoriaMetrics 组件：

| 组件                | 作用                                          |
| ------------------- | --------------------------------------------- |
| **vmstorage** | 数据存储组件，负责持久化存储时序数据          |
| **vminsert**  | 数据写入代理，接收数据并分发到 vmstorage      |
| **vmselect**  | 数据查询代理，从 vmstorage 读取数据并响应查询 |
| **vmagent**   | 指标采集组件，兼容 Prometheus 协议            |
| **Grafana**   | 可视化界面                                    |

##### 访问界面

| 界面              | URL                                                                     | 凭据                              |
| ----------------- | ----------------------------------------------------------------------- | --------------------------------- |
| **Grafana** | [http://localhost:3000/](http://localhost:3000/)                           | 用户名:`admin`, 密码: `admin` |
| **VMUI**    | [http://localhost:8427/select/0/vmui](http://localhost:8427/select/0/vmui) | 无需认证                          |

##### 自定义配置

> [!TIP]
> 可以通过编辑 `compose-vm-cluster.yml` 文件进一步自定义集群配置，如调整组件数量、资源限制、端口映射等。

---

#### 1.2.4 使用二进制文件启动单机版

##### 安装步骤

**步骤 1：下载二进制文件**

从 [GitHub Releases](https://github.com/VictoriaMetrics/VictoriaMetrics/releases) 下载适合你操作系统和架构的二进制文件。

> [!NOTE]
> 企业版二进制文件请参考 [官方企业版文档](https://docs.victoriametrics.com/enterprise/)。

**步骤 2：解压到系统目录**

```bash
sudo tar -xvf <victoriametrics-archive> -C /usr/local/bin
```

替换 `<victoriametrics-archive>` 为实际下载的文件名。

**步骤 3：创建系统用户**

```bash
sudo useradd -s /usr/sbin/nologin victoriametrics
```

**步骤 4：创建数据存储目录**

```bash
sudo mkdir -p /var/lib/victoria-metrics && \
sudo chown -R victoriametrics:victoriametrics /var/lib/victoria-metrics
```

**步骤 5：创建 systemd 服务**

```bash
sudo bash -c 'cat <<END >/etc/systemd/system/victoriametrics.service
[Unit]
Description=VictoriaMetrics service
After=network.target

[Service]
Type=simple
User=victoriametrics
Group=victoriametrics
ExecStart=/usr/local/bin/victoria-metrics-prod -storageDataPath=/var/lib/victoria-metrics -retentionPeriod=90d -selfScrapeInterval=10s
SyslogIdentifier=victoriametrics
Restart=always

PrivateTmp=yes
ProtectHome=yes
NoNewPrivileges=yes
ProtectSystem=full

[Install]
WantedBy=multi-user.target
END'
```

##### 服务配置中的重要 Flag 参数

| Flag 参数               | 说明          | 示例值                        | 推荐值            |
| ----------------------- | ------------- | ----------------------------- | ----------------- |
| `-storageDataPath`    | 数据存储路径  | `/var/lib/victoria-metrics` | 根据磁盘容量规划  |
| `-retentionPeriod`    | 数据保留周期  | `90d`（90 天）              | 根据业务需求设置  |
| `-selfScrapeInterval` | 自我抓取间隔  | `10s`                       | `10s` - `30s` |
| `-httpListenAddr`     | HTTP 监听地址 | `:8428`（默认）             | 根据安全需求调整  |

> [!IMPORTANT]
> 可以在 `ExecStart` 行添加额外的命令行 flag 参数来自定义配置。例如：
>
> - `-memory.allowedPercent=80` - 限制内存使用百分比
> - `-search.maxQueryDuration=60s` - 限制查询最大执行时间

**步骤 6：启动并启用服务**

```bash
# 重载 systemd 配置并启动服务
sudo systemctl daemon-reload && sudo systemctl enable --now victoriametrics.service

# 检查服务状态
sudo systemctl status victoriametrics.service
```

**步骤 7：验证安装**

服务运行后，访问以下地址验证：

- **VMUI 界面**：http://\<ip_or_hostname\>:8428/vmui
- **健康检查**：http://\<ip_or_hostname\>:8428/-/healthy

> [!NOTE]
> VictoriaMetrics 服务默认监听 **:8428** 端口接收 HTTP 连接（参见 `-httpListenAddr` flag）。

##### Windows 服务部署

如果需要将 VictoriaMetrics 单机版部署为 Windows 服务，请参考官方文档的 [running as a Windows service](https://docs.victoriametrics.com/#windows-service) 部分。

---

#### 1.2.5 使用二进制文件启动集群版

##### 集群架构说明

```mermaid
graph TD
    A[写入流量] --> B[vminsert:8480]
    B --> C1[vmstorage-1:8400]
    B --> C2[vmstorage-2:8400]
    B --> C3[vmstorage-N:8400]
  
    D[查询流量] --> E[vmselect:8481]
    E --> F1[vmstorage-1:8401]
    E --> F2[vmstorage-2:8401]
    E --> F3[vmstorage-N:8401]
  
    C1 -.HTTP:8482.-> G[监控/管理]
    C2 -.HTTP:8482.-> G
    C3 -.HTTP:8482.-> G
```

VictoriaMetrics 集群由 **3 个核心组件** 组成：

| 组件                | 角色         | 说明                                    |
| ------------------- | ------------ | --------------------------------------- |
| **vmstorage** | 数据存储节点 | 负责数据的持久化存储和检索              |
| **vminsert**  | 数据写入代理 | 接收写入请求并分发到 vmstorage 节点     |
| **vmselect**  | 数据查询代理 | 处理查询请求并从 vmstorage 节点聚合数据 |

> [!WARNING]
> **部署建议**：
>
> - 建议在**同一私有网络**中运行这些组件（出于安全考虑）
> - 应部署在**不同的物理节点**上以获得最佳性能
> - 确保各组件之间的网络延迟尽可能低

##### 所有节点的通用准备步骤

在所有集群节点上执行以下操作：

**步骤 1：下载集群版二进制文件**

从 [GitHub Releases](https://github.com/VictoriaMetrics/VictoriaMetrics/releases) 下载带有 `-cluster` 后缀的二进制文件。

**步骤 2：解压到系统目录**

```bash
sudo tar -xvf <victoriametrics-archive> -C /usr/local/bin
```

**步骤 3：创建系统用户**

```bash
sudo useradd -s /usr/sbin/nologin victoriametrics
```

---

##### 安装 vmstorage

**步骤 1：创建数据存储目录**

```bash
sudo mkdir -p /var/lib/vmstorage && \
sudo chown -R victoriametrics:victoriametrics /var/lib/vmstorage
```

**步骤 2：创建 systemd 服务**

```bash
sudo bash -c 'cat <<END >/etc/systemd/system/vmstorage.service
[Unit]
Description=VictoriaMetrics vmstorage service
After=network.target

[Service]
Type=simple
User=victoriametrics
Group=victoriametrics
Restart=always
ExecStart=/usr/local/bin/vmstorage-prod -retentionPeriod=90d -storageDataPath=/var/lib/vmstorage

PrivateTmp=yes
NoNewPrivileges=yes
ProtectSystem=full

[Install]
WantedBy=multi-user.target
END'
```

**vmstorage 重要 Flag 参数：**

| Flag 参数            | 说明                  | 默认端口       | 示例值                  |
| -------------------- | --------------------- | -------------- | ----------------------- |
| `-storageDataPath` | 数据存储路径          | -              | `/var/lib/vmstorage`  |
| `-retentionPeriod` | 数据保留周期          | `1` (1 个月) | `90d`, `12`, `1y` |
| `-vminsertAddr`    | vminsert 连接监听地址 | `:8400`      | `:8400`               |
| `-vmselectAddr`    | vmselect 连接监听地址 | `:8401`      | `:8401`               |
| `-httpListenAddr`  | HTTP API 监听地址     | `:8482`      | `:8482`               |

> [!TIP]
> 可在 `ExecStart` 行添加其他 flag 参数，例如：
>
> - `-dedup.minScrapeInterval=30s` - 启用数据去重
> - `-snapshotAuthKey=<secret>` - 设置快照 API 认证密钥

**步骤 3：启动并验证服务**

```bash
# 启动服务
sudo systemctl daemon-reload && sudo systemctl enable --now vmstorage

# 检查服务状态
sudo systemctl status vmstorage
```

**健康检查**：
访问 http://\<ip_or_hostname\>:8482/-/healthy，应显示 **"VictoriaMetrics is Healthy"**。

---

##### 安装 vminsert

**步骤 1：创建 systemd 服务**

```bash
sudo bash -c 'cat <<END >/etc/systemd/system/vminsert.service
[Unit]
Description=VictoriaMetrics vminsert service
After=network.target

[Service]
Type=simple
User=victoriametrics
Group=victoriametrics
Restart=always
ExecStart=/usr/local/bin/vminsert-prod -storageNode=<list of vmstorages>

PrivateTmp=yes
NoNewPrivileges=yes
ProtectSystem=full

[Install]
WantedBy=multi-user.target
END'
```

**vminsert 重要 Flag 参数：**

| Flag 参数              | 说明                   | 默认端口  | 示例                                    |
| ---------------------- | ---------------------- | --------- | --------------------------------------- |
| `-storageNode`       | vmstorage 节点地址列表 | -         | `192.168.1.10:8400,192.168.1.11:8400` |
| `-httpListenAddr`    | HTTP 监听地址          | `:8480` | `:8480`                               |
| `-replicationFactor` | 数据副本数             | `1`     | `2` (推荐至少为 2)                    |

> [!IMPORTANT]
> **配置 `-storageNode` 参数：**
>
> - 替换 `<list of vmstorages>` 为实际的 vmstorage 服务地址
> - 可以多次重复该 flag：`-storageNode=192.168.1.10:8400 -storageNode=192.168.1.11:8400`
> - 或在一个 flag 中用逗号分隔：`-storageNode=192.168.1.10:8400,192.168.1.11:8400`

**步骤 2：启动并验证服务**

```bash
# 启动服务
sudo systemctl daemon-reload && sudo systemctl enable --now vminsert.service

# 检查服务状态
sudo systemctl status vminsert.service
```

**健康检查**：
访问 http://\<ip_or_hostname\>:8480/-/healthy，应显示 **"VictoriaMetrics is Healthy"**。

---

##### 安装 vmselect

**步骤 1：创建缓存目录**

```bash
sudo mkdir -p /var/lib/vmselect-cache && \
sudo chown -R victoriametrics:victoriametrics /var/lib/vmselect-cache
```

**步骤 2：创建 systemd 服务**

```bash
sudo bash -c 'cat <<END >/etc/systemd/system/vmselect.service
[Unit]
Description=VictoriaMetrics vmselect service
After=network.target

[Service]
Type=simple
User=victoriametrics
Group=victoriametrics
Restart=always
ExecStart=/usr/local/bin/vmselect-prod -storageNode=<list of vmstorages> -cacheDataPath=/var/lib/vmselect-cache

PrivateTmp=yes
NoNewPrivileges=yes
ProtectSystem=full

[Install]
WantedBy=multi-user.target
END'
```

**vmselect 重要 Flag 参数：**

| Flag 参数                    | 说明                   | 默认端口  | 示例值                                  |
| ---------------------------- | ---------------------- | --------- | --------------------------------------- |
| `-storageNode`             | vmstorage 节点地址列表 | -         | `192.168.1.10:8401,192.168.1.11:8401` |
| `-cacheDataPath`           | 查询结果缓存路径       | -         | `/var/lib/vmselect-cache`             |
| `-httpListenAddr`          | HTTP 监听地址          | `:8481` | `:8481`                               |
| `-search.maxQueryDuration` | 查询最大执行时间       | `30s`   | `60s`                                 |

> [!IMPORTANT]
> **配置 `-storageNode` 参数：**
>
> - 替换 `<list of vmstorages>` 为实际的 vmstorage 服务地址
> - **注意端口号**：vmselect 连接 vmstorage 的 **8401** 端口（不是 8400）
> - 示例：`-storageNode=192.168.1.10:8401,192.168.1.11:8401`

**步骤 3：启动并验证服务**

```bash
# 启动服务
sudo systemctl daemon-reload && sudo systemctl enable --now vmselect.service

# 检查服务状态
sudo systemctl status vmselect.service
```

**健康检查**：
访问 http://\<ip_or_hostname\>:8481/select/0/vmui，应显示 **vmui 页面**。

---

### 1.3 集群组件端口汇总

```mermaid
graph LR
    A[集群端口总览] --> B[vmstorage]
    A --> C[vminsert]
    A --> D[vmselect]
    A --> E[单机版]
  
    B --> B1[":8400<br/>vminsert连接"]
    B --> B2[":8401<br/>vmselect连接"]
    B --> B3[":8482<br/>HTTP API"]
  
    C --> C1[":8480<br/>HTTP写入API"]
  
    D --> D1[":8481<br/>HTTP查询API"]
  
    E --> E1[":8428<br/>HTTP API"]
```

#### 端口功能详表

| 组件                | 端口 | 协议     | 用途                | 访问者                      |
| ------------------- | ---- | -------- | ------------------- | --------------------------- |
| **vmstorage** | 8400 | 内部协议 | 接收 vminsert 连接  | vminsert                    |
| **vmstorage** | 8401 | 内部协议 | 接收 vmselect 连接  | vmselect                    |
| **vmstorage** | 8482 | HTTP     | HTTP API 和管理接口 | 管理员、监控系统            |
| **vminsert**  | 8480 | HTTP     | 接收写入请求        | 数据源、Prometheus、vmagent |
| **vmselect**  | 8481 | HTTP     | 接收查询请求        | Grafana、查询客户端         |
| **单机版 VM** | 8428 | HTTP     | 统一的读写 API      | 数据源、查询客户端          |

> [!NOTE]
> 所有端口均可通过相应的 `-httpListenAddr`、`-vminsertAddr`、`-vmselectAddr` flag 参数自定义。

---

### 1.4 快速入门总结

#### 1.4.1 部署模式选择

```mermaid
graph TD
    A{选择部署模式} --> B{监控规模?}
    B -->|小规模<br/>百万级指标| C[单机版 VictoriaMetrics]
    B -->|大规模<br/>千万级指标| D[集群版 VictoriaMetrics]
    B -->|托管服务| E[VictoriaMetrics Cloud]
  
    C --> F{部署方式?}
    D --> F
  
    F -->|快速测试| G[Docker]
    F -->|生产环境| H[二进制 + Systemd]
    F -->|K8s环境| I[Helm/Operator]
```

#### 1.4.2 核心 Flag 参数速查表

**通用参数（单机版和集群版）：**

| Flag                    | 作用             | 推荐值                        | 重要性 |
| ----------------------- | ---------------- | ----------------------------- | ------ |
| `-storageDataPath`    | 数据存储路径     | `/var/lib/victoria-metrics` | ⭐⭐⭐ |
| `-retentionPeriod`    | 数据保留周期     | `90d` 或 `3` (3个月)      | ⭐⭐⭐ |
| `-httpListenAddr`     | HTTP 监听地址    | `:8428` (单机)              | ⭐⭐   |
| `-selfScrapeInterval` | 自我监控抓取间隔 | `10s`                       | ⭐     |

**集群专用参数：**

| 组件              | Flag                   | 作用              | 示例                        | 重要性 |
| ----------------- | ---------------------- | ----------------- | --------------------------- | ------ |
| vminsert/vmselect | `-storageNode`       | 后端存储节点列表  | `host1:8400,host2:8400`   | ⭐⭐⭐ |
| vmselect          | `-cacheDataPath`     | 查询缓存路径      | `/var/lib/vmselect-cache` | ⭐⭐   |
| vminsert          | `-replicationFactor` | 数据副本数        | `2`                       | ⭐⭐⭐ |
| vmstorage         | `-vminsertAddr`      | vminsert 连接地址 | `:8400`                   | ⭐⭐   |
| vmstorage         | `-vmselectAddr`      | vmselect 连接地址 | `:8401`                   | ⭐⭐   |

#### 1.4.3 下一步学习路径

完成快速入门后，建议按以下顺序深入学习：

1. **第 2 章**：深入了解单机版 VictoriaMetrics 的高级特性和优化
2. **第 3 章**：学习集群版的架构设计和运维管理
3. **第 4 章**：掌握 vmagent 的数据采集和多租户配置
4. **第 5 章**：学习 vmalert 的告警规则和告警管理
5. **第 6 章**：了解 vmauth 的认证和多租户管理
6. **第 7-8 章**：学习数据备份和恢复策略
7. **第 9 章**：掌握生产环境的最佳实践

---

**🎯 快速入门章节完成！**接下来将继续学习各个组件的详细用法...

---

## 第 2 章：单机版 VictoriaMetrics 深入详解

### 2.1 概述与核心特性

单机版 VictoriaMetrics 是一个快速、经济且可扩展的监控解决方案和时序数据库。

#### 2.1.1 产品优势

| 特性类别             | 优势描述             | 性能指标                                                             |
| -------------------- | -------------------- | -------------------------------------------------------------------- |
| **性能**       | 高性能数据摄入和查询 | 相比 InfluxDB 和 TimescaleDB 高出 20 倍                              |
| **内存使用**   | 极低内存占用         | 相比 InfluxDB 少 10 倍，相比 Prometheus/Thanos/Cortex 少 7 倍        |
| **存储压缩**   | 高效数据压缩         | 相比 TimescaleDB 多存储 70 倍数据点，相比 Prometheus 少 7 倍存储空间 |
| **垂直扩展**   | 单机可处理大规模数据 | 摄入速率 150 万+ samples/s，活跃时序 5000 万+                        |
| **高性能 I/O** | 优化的磁盘 I/O       | 适用于高延迟 I/O 和低 IOPS 存储（HDD、网络存储）                     |

> [!NOTE]
> 单机版 VictoriaMetrics 可以替代中等规模的集群方案（如 Thanos、M3DB、Cortex、InfluxDB）。

---

### 2.2 数据摄入协议

VictoriaMetrics 支持多种数据摄入协议：

#### 2.2.1 Pull 模式

```mermaid
graph LR
    A[VictoriaMetrics] -->|Scrape| B[node_exporter]
    A -->|Scrape| C[kube-state-metrics]
    A -->|Scrape| D[其他 Prometheus Exporters]
```

- **Prometheus Scraping**：兼容 Prometheus `scrape_configs`
- **配置文件**：通过 `-promscrape.config` 指定 `prometheus.yml`

#### 2.2.2 Push 模式（支持的协议）

| 协议                                   | 端点                                       | 说明                                                |
| -------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| **Prometheus remote_write**      | `/api/v1/write`                          | Prometheus 远程写入 API                             |
| **Prometheus exposition format** | `/api/v1/import/prometheus`              | Prometheus 文本格式                                 |
| **InfluxDB line protocol**       | `/write` (HTTP/TCP/UDP)                  | InfluxDB 行协议                                     |
| **Graphite plaintext**           | `:2003`                                  | Graphite 明文协议（需设置 `-graphiteListenAddr`） |
| **OpenTSDB telnet put**          | `:4242`                                  | OpenTSDB telnet 协议                                |
| **OpenTSDB HTTP /api/put**       | `/api/put`                               | OpenTSDB HTTP API                                   |
| **OpenTelemetry**                | `/opentelemetry/v1/metrics`              | OpenTelemetry metrics                               |
| **DataDog**                      | `/datadog/api/v2/series`                 | DataDog submit metrics API                          |
| **NewRelic**                     | `/newrelic/infra/v2/metrics/events/bulk` | NewRelic 基础设施代理                               |
| **JSON line format**             | `/api/v1/import`                         | VictoriaMetrics JSON 行格式                         |
| **Native binary format**         | `/api/v1/import/native`                  | VictoriaMetrics 原生二进制格式                      |
| **CSV**                          | `/api/v1/import/csv`                     | 任意 CSV 数据                                       |

---

### 2.3 核心 Flag 参数详解

#### 2.3.1 存储相关参数

| Flag 参数                          | 默认值                    | 说明                 | 推荐值                    |
| ---------------------------------- | ------------------------- | -------------------- | ------------------------- |
| `-storageDataPath`               | `victoria-metrics-data` | 数据存储路径         | 独立的高性能磁盘路径      |
| `-retentionPeriod`               | `1` (1个月)             | 数据保留周期         | `90d`, `6`, `1y` 等 |
| `-retentionTimezoneOffset`       | `0`                     | IndexDB 轮转时区偏移 | 根据时区调整              |
| `-storage.minFreeDiskSpaceBytes` | `10000000`              | 最小可用磁盘空间     | 至少保留 20% 空间         |

> [!IMPORTANT]
> **关于 retentionPeriod**：
>
> - 支持的时间单位：`h`（小时）、`d`（天）、`w`（周）、`y`（年）
> - 未指定单位时按月计算
> - 最小保留期：**24h** 或 **1d**
> - 数据按月分区存储，过期分区在新月的第一天删除

#### 2.3.2 性能调优参数

```mermaid
graph TD
    A[性能调优参数] --> B[内存控制]
    A --> C[并发控制]
    A --> D[缓存控制]
  
    B --> B1["-memory.allowedPercent"]
    B --> B2["-memory.allowedBytes"]
  
    C --> C1["-maxConcurrentInserts"]
    C --> C2["-search.maxConcurrentRequests"]
  
    D --> D1["-storage.cacheSizeIndexDBDataBlocks"]
    D --> D2["-storage.cacheSizeStorageTSID"]
```

**内存相关：**

| Flag                          | 默认值   | 说明                                 |
| ----------------------------- | -------- | ------------------------------------ |
| `-memory.allowedPercent`    | `60`   | 允许缓存使用的系统内存百分比         |
| `-memory.allowedBytes`      | `0`    | 允许缓存使用的字节数（覆盖 percent） |
| `-search.maxMemoryPerQuery` | 自动计算 | 单个查询可用的最大内存               |

**并发相关：**

| Flag                              | 默认值          | 说明                 |
| --------------------------------- | --------------- | -------------------- |
| `-maxConcurrentInserts`         | `2*CPU核心数` | 最大并发写入请求数   |
| `-search.maxConcurrentRequests` | 自动计算        | 最大并发查询请求数   |
| `-search.maxQueueDuration`      | `10s`         | 查询队列最大等待时间 |
| `-insert.maxQueueDuration`      | `1m`          | 写入队列最大等待时间 |

**工作线程：**

| Flag                           | 默认值   | 说明                            |
| ------------------------------ | -------- | ------------------------------- |
| `-search.maxWorkersPerQuery` | 自动计算 | 单个查询可使用的最大 CPU 核心数 |

> [!TIP]
> **CPU 核心数较多时的优化**：
>
> - 如果 VictoriaMetrics 运行在 16+ CPU 核心的主机上，建议调整 `-search.maxWorkersPerQuery`
> - 大量并发小查询：**降低**该值
> - 重查询（>10K 时序或 >100M 样本）：**设为可用 CPU 核心数**

#### 2.3.3 资源限制参数

**查询限制：**

| Flag                               | 默认值          | 说明                                     |
| ---------------------------------- | --------------- | ---------------------------------------- |
| `-search.maxQueryDuration`       | `30s`         | 查询最大执行时间                         |
| `-search.maxUniqueTimeseries`    | 自动计算        | 单个查询可处理的最大时序数               |
| `-search.maxSamplesPerQuery`     | `1000000000`  | 单个查询可处理的最大原始样本数           |
| `-search.maxSamplesPerSeries`    | `30000000`    | 每个时序可扫描的最大原始样本数           |
| `-search.maxResponseSeries`      | `0`（无限制） | `/api/v1/query[_range]` 最大返回时序数 |
| `-search.maxPointsPerTimeseries` | `30000`       | 每个时序最大返回点数                     |
| `-search.maxSeriesPerAggrFunc`   | `1000000`     | 聚合函数最大生成时序数                   |

**导出限制：**

| Flag                          | 默认值          | 说明                               |
| ----------------------------- | --------------- | ---------------------------------- |
| `-search.maxExportSeries`   | `10000000`    | `/api/v1/export*` 最大导出时序数 |
| `-search.maxExportDuration` | `720h` (30天) | 导出查询最大持续时间               |
| `-search.maxFederateSeries` | `1000000`     | `/federate` 最大返回时序数       |
| `-search.maxDeleteSeries`   | `1000000`     | `/delete_series` 最大删除时序数  |
| `-search.maxDeleteDuration` | `5m`          | 删除操作最大持续时间               |

**API 限制：**

| Flag                             | 默认值      | 说明                                          |
| -------------------------------- | ----------- | --------------------------------------------- |
| `-search.maxTagKeys`           | `100000`  | `/api/v1/labels` 最大返回标签名数           |
| `-search.maxTagValues`         | `100000`  | `/api/v1/label/.../values` 最大返回标签值数 |
| `-search.maxLabelsAPISeries`   | `1000000` | Labels API 可扫描的最大时序数                 |
| `-search.maxLabelsAPIDuration` | `5s`      | Labels API 最大持续时间                       |
| `-search.maxSeries`            | `30000`   | `/api/v1/series` 最大返回时序数             |

#### 2.3.4 摄入限制参数

| Flag                        | 默认值          | 说明                                      |
| --------------------------- | --------------- | ----------------------------------------- |
| `-maxIngestionRate`       | `0`（无限制） | 每秒最大样本摄入数                        |
| `-maxInsertRequestSize`   | `32MB`        | 单个 Prometheus remote_write 请求最大大小 |
| `-maxLabelNameLen`        | `256`         | 标签名最大长度                            |
| `-maxLabelValueLen`       | `4096`        | 标签值最大长度                            |
| `-maxLabelsPerTimeseries` | `40`          | 每个时序最大标签数                        |

#### 2.3.5 HTTP 服务器参数

| Flag                                  | 默认值    | 说明                               |
| ------------------------------------- | --------- | ---------------------------------- |
| `-httpListenAddr`                   | `:8428` | HTTP 监听地址                      |
| `-http.maxGracefulShutdownDuration` | `7s`    | 优雅关闭最大持续时间               |
| `-http.shutdownDelay`               | `0`     | 关闭前延迟（用于从负载均衡器摘除） |
| `-http.connTimeout`                 | `2m`    | 传入连接超时时间                   |
| `-http.idleConnTimeout`             | `1m`    | 空闲连接超时时间                   |
| `-http.pathPrefix`                  | `""`    | HTTP 路径前缀                      |

---

### 2.4 存储架构深度解析

#### 2.4.1 存储结构

```mermaid
graph TD
    A[样本数据] --> B[内存缓冲 最多1秒]
    B --> C[In-Memory Parts]
    C --> D[持久化到磁盘 StorageDataPath/data]
  
    D --> E[small/ - 小分区]
    D --> F[big/ - 大分区]
  
    E --> G[2025_03/ - 月分区]
    G --> H[part目录]
    H --> I[metadata.json]
    H --> J[timestamps.bin]
    H --> K[values.bin]
    H --> L[index.bin]
    H --> M[metaindex.bin]
```

**目录结构：**

```
<storageDataPath>/
├── data/
│   ├── small/
│   │   └── YYYY_MM/      # 月分区，如 2025_03
│   │       ├── parts.json  # parts 列表
│   │       ├── part1/
│   │       ├── part2/
│   │       └── partN/
│   └── big/
│       └── YYYY_MM/
├── indexdb/
│   └── ...               # 索引数据
├── snapshots/            # 快照目录
└── cache/                # 缓存目录
```

**Part 目录结构：**

每个 part 目录包含以下文件：

| 文件               | 说明                                            |
| ------------------ | ----------------------------------------------- |
| `metadata.json`  | Part 元数据（行数、块数、时间范围、去重间隔等） |
| `timestamps.bin` | 压缩的时间戳数据                                |
| `values.bin`     | 压缩的值数据                                    |
| `index.bin`      | 快速查找块的索引                                |
| `metaindex.bin`  | 索引的索引                                      |

**metadata.json 字段：**

- `RowsCount`：原始样本数
- `BlocksCount`：块数
- `MinTimestamp`、`MaxTimestamp`：时间范围
- `MinDedupInterval`：应用的去重间隔

#### 2.4.2 数据分区与合并

```mermaid
graph LR
    A[新数据写入] --> B[小 Part]
    B --> C[后台合并]
    C --> D[中等 Part]
    D --> C
    C --> E[大 Part]
  
    style C fill:#f9f,stroke:#333,stroke-width:2px
```

**后台合并的好处：**

1. 控制数据文件数量（避免超出打开文件限制）
2. 提升数据压缩率（更大的 part 通常压缩效果更好）
3. 提升查询速度（查询更少的 part）
4. 执行维护任务（去重、降采样、删除时序）

**合并限制：**

> [!WARNING]
> 当可用磁盘空间不足时，VictoriaMetrics 不会合并 parts。建议至少保留 **20%** 的可用磁盘空间。

可通过以下指标监控合并状态：

- 控制面板：[single-node VictoriaMetrics dashboard](https://grafana.com/grafana/dashboards/10229)
- 监控文档：[Monitoring docs](https://docs.victoriametrics.com/#monitoring)

#### 2.4.3 数据持久化机制

VictoriaMetrics 的数据持久化设计确保数据安全：

1. **内存缓冲**：数据在内存中缓冲最多 1 秒
2. **In-Memory Parts**：定期写入内存 parts（可查询）
3. **持久化**：周期性将内存 parts 写入磁盘
4. **原子注册**：Part 完全写入并 fsync 后，原子性地注册到 `parts.json`
5. **故障恢复**：硬件掉电时，不完整的 part 会在启动时自动删除

> [!NOTE]
> **数据丢失风险**：
>
> - 不干净的关闭（OOM、kill -9、硬件重置）可能导致最后几秒的数据丢失
> - 可通过 `-inmemoryDataFlushInterval` 调整刷新频率（默认 `5s`）
> - 更短的间隔会增加磁盘 I/O

---

### 2.5 IndexDB 索引机制

#### 2.5.1 索引类型

VictoriaMetrics 维护两种倒排索引：

```mermaid
graph TD
    A[查询请求] --> B{时间范围判断}
    B -->|<= 40天| C[Per-day Index 每日索引]
    B -->|> 40天| D[Global Index 全局索引]
  
    C --> E[快速检索短期数据]
    D --> F[检索长期数据]
```

| 索引类型                | 存储内容             | 使用场景          | 优势             |
| ----------------------- | -------------------- | ----------------- | ---------------- |
| **Global Index**  | 整个保留期的映射     | 时间范围 > 40 天  | 减少索引重复写入 |
| **Per-day Index** | 每日的映射（含日期） | 时间范围 ≤ 40 天 | 加速短期数据查询 |

**索引映射的内容：**

- `metric_name` → `TSID`
- `label_name` → `TSID`
- `label_value` → `TSID`
- `label_name=label_value` → `TSID`

**索引创建时机：**

- **Global Index**：每个保留期内每个映射只创建一次
- **Per-day Index**：每个唯一日期创建一次映射

#### 2.5.2 低流失率优化：禁用每日索引

**适用场景：**

- 时序集合固定不变（如历史气象数据）
- 时序流失率低（如 IoT 传感器，极少添加/移除）

**优势：**

- 提升摄入速度
- 减少磁盘空间使用

**配置方法：**

```bash
victoria-metrics -disablePerDayIndex
```

> [!IMPORTANT]
> **注意事项：**
>
> - 推荐在新安装上设置此 flag
> - 在有历史数据的安装上禁用每日索引是可以的
> - 重新启用每日索引会导致历史数据无法搜索

---

### 2.6 去重（Deduplication）

VictoriaMetrics 支持数据去重，适用于高可用部署场景。

#### 2.6.1 去重工作原理

```mermaid
graph LR
    A[vmagent-1] -->|写入| C[VictoriaMetrics]
    B[vmagent-2] -->|写入| C
  
    C --> D[去重处理]
    D --> E[保留时间戳最大的样本]
```

**配置去重：**

```bash
victoria-metrics -dedup.minScrapeInterval=30s
```

**去重规则：**

- 在每个 **离散间隔**（由 `-dedup.minScrapeInterval` 指定）内
- 保留 **时间戳最大** 的原始样本
- 如果多个样本时间戳相同，保留 **值最大** 的样本
- **Staleness markers（失效标记）** 优先于任何其他值

#### 2.6.2 重要 Flag 参数

| Flag                          | 说明           | 示例                                                |
| ----------------------------- | -------------- | --------------------------------------------------- |
| `-dedup.minScrapeInterval`  | 去重间隔       | `30s`（应等于 Prometheus 的 `scrape_interval`） |
| `-streamAggr.dedupInterval` | 摄入时去重间隔 | 数据写入磁盘前去重                                  |

> [!TIP]
> **最佳实践：**
>
> 1. `-dedup.minScrapeInterval` 应等于 Prometheus 配置中的 `scrape_interval`
> 2. 所有抓取目标推荐使用单一的 `scrape_interval`
> 3. 不同 HA 对的 vmagent 实例应设置不同的 `-promscrape.cluster.name`

**去重与降采样：**

- `-dedup.minScrapeInterval=D` 等价于 `-downsampling.period=0s:D`
- 可同时使用去重和降采样

---

### 2.7 降采样（Downsampling）

> [!NOTE]
> 降采样是 **VictoriaMetrics Enterprise** 特性。

#### 2.7.1 单级降采样

```mermaid
graph LR
    A[全部数据] --> B{数据年龄}
    B -->|< 30天| C[保留全部样本]
    B -->|>= 30天| D[每5分钟保留最后一个样本]
```

**配置示例：**

```bash
victoria-metrics-prod \
  -downsampling.period=30d:5m
```

#### 2.7.2 多级降采样

```bash
victoria-metrics-prod \
  -downsampling.period=30d:5m,180d:1h
```

**效果：**

- **30天以上的数据**：每 5 分钟保留最后一个样本
- **180天以上的数据**：每 1 小时保留最后一个样本

#### 2.7.3 基于过滤器的降采样

```bash
victoria-metrics-prod \
  -downsampling.period='{__name__=~"(node|process)_.*"}:1d:1m'
```

**说明：**

- 仅对名称以 `node_` 或 `process_` 开头的时序进行降采样
- 超过 1 天的数据，以 1 分钟间隔降采样

#### 2.7.4 禁用特定时序的降采样

```bash
victoria-metrics-prod \
  -downsampling.period='{env="prod"}:0s:0s' \
  -downsampling.period='{__name__=~"node_.*"}:1d:5m'
```

**说明：**

- `env="prod"` 的时序**不进行降采样**
- 其他 `node_*` 时序超过 1 天后以 5 分钟间隔降采样

**降采样调试：**

- Enterprise 版本的 VMUI：**Tools → Downsampling filters debug**

> [!IMPORTANT]
> **降采样限制：**
>
> 1. 同一过滤器的多个间隔必须是**倍数关系**
> 2. 如果启用去重，`-dedup.minScrapeInterval` 也必须是降采样间隔的倍数
> 3. 降采样在**后台合并**期间执行
> 4. 需要足够的可用磁盘空间

---

### 2.8 保留期过滤器（Retention Filters）

> [!NOTE]
> 这是 **VictoriaMetrics Enterprise** 特性。

#### 2.8.1 基本配置

```bash
victoria-metrics-prod \
  -retentionFilter='{team="juniors"}:3d' \
  -retentionFilter='{env=~"dev|staging"}:30d' \
  -retentionPeriod=1y
```

**效果：**

| 时序匹配条件                       | 保留期 |
| ---------------------------------- | ------ |
| `team="juniors"`                 | 3 天   |
| `env="dev"` 或 `env="staging"` | 30 天  |
| 其他时序                           | 1 年   |

**规则：**

- 如果时序匹配多个过滤器，应用**最小**保留期
- `-retentionFilter` 的 duration 必须 ≤ `-retentionPeriod`

#### 2.8.2 监控指标

| 指标                                                     | 说明                       |
| -------------------------------------------------------- | -------------------------- |
| `vm_retention_filters_partitions_scheduled`            | 计划进行保留过滤的分区总数 |
| `vm_retention_filters_partitions_scheduled_size_bytes` | 计划分区的总大小           |

#### 2.8.3 注意事项

> [!WARNING]
>
> 1. 旧数据不会立即删除，在**后台合并**期间逐步删除
> 2. `-retentionFilter` **不会**从 IndexDB 删除旧数据（到 `-retentionPeriod` 才删除）
> 3. 高流失率下，即使设置了较小的保留期，IndexDB 大小也可能很大
> 4. 应用保留过滤器时，资源使用会暂时增加

**调试工具：**

- VMUI Enterprise 版：**Tools → Retention filters debug**

---

### 2.9 基数限制器（Cardinality Limiter）

VictoriaMetrics 支持限制新增时序的速率，防止基数爆炸。

#### 2.9.1 配置参数

| Flag                         | 说明                               |
| ---------------------------- | ---------------------------------- |
| `-storage.maxHourlySeries` | 最近 1 小时可添加的最大唯一时序数  |
| `-storage.maxDailySeries`  | 最近 24 小时可添加的最大唯一时序数 |

**示例：**

```bash
victoria-metrics \
  -storage.maxHourlySeries=100000 \
  -storage.maxDailySeries=1000000
```

#### 2.9.2 监控指标

| 指标                                          | 说明                                         |
| --------------------------------------------- | -------------------------------------------- |
| `vm_hourly_series_limit_rows_dropped_total` | 因超出小时限制而丢弃的指标数                 |
| `vm_hourly_series_limit_max_series`         | 小时时序限制（`-storage.maxHourlySeries`） |
| `vm_hourly_series_limit_current_series`     | 当前小时的唯一时序数                         |
| `vm_daily_series_limit_rows_dropped_total`  | 因超出每日限制而丢弃的指标数                 |
| `vm_daily_series_limit_max_series`          | 每日时序限制（`-storage.maxDailySeries`）  |
| `vm_daily_series_limit_current_series`      | 最近一天的唯一时序数                         |

**告警示例：**

```promql
# 小时时序使用率超过 90%
vm_hourly_series_limit_current_series / vm_hourly_series_limit_max_series > 0.9

# 每日时序使用率超过 90%
vm_daily_series_limit_current_series / vm_daily_series_limit_max_series > 0.9
```

---

### 2.10 查询追踪（Query Tracing）

VictoriaMetrics 支持查询追踪，用于分析查询性能瓶颈。

#### 2.10.1 启用查询追踪

**方法：** 在查询时添加 `trace=1` 参数。

**示例：**

```bash
curl "http://localhost:8428/api/v1/query_range?query=2*rand()&start=-1h&step=1m&trace=1" | jq '.trace'
```

**输出示例：**

```json
{
  "duration_msec": 0.099,
  "message": "/api/v1/query_range: series=1",
  "children": [
    {
      "duration_msec": 0.034,
      "message": "eval: series=1, points=60",
      "children": [...]
    }
  ]
}
```

#### 2.10.2 VMUI 中的查询追踪

1. **启用追踪**：勾选 **Trace query** 复选框并重新执行查询
2. **查看追踪**：追踪信息会显示在查询结果下方
3. **导出追踪**：点击调试图标导出 JSON，可在 **Tools → Query Analyzer** 页面加载

#### 2.10.3 禁用查询追踪

```bash
victoria-metrics -denyQueryTracing
```

---

### 2.11 安全配置

#### 2.11.1 认证相关 Flag

| Flag                          | 说明                   | 端点                                 |
| ----------------------------- | ---------------------- | ------------------------------------ |
| `-httpAuth.username`        | HTTP Basic Auth 用户名 | 所有端点                             |
| `-httpAuth.password`        | HTTP Basic Auth 密码   | 所有端点                             |
| `-deleteAuthKey`            | 删除时序的认证密钥     | `/api/v1/admin/tsdb/delete_series` |
| `-snapshotAuthKey`          | 快照操作的认证密钥     | `/snapshot/*`                      |
| `-forceFlushAuthKey`        | 强制刷新认证密钥       | `/internal/force_flush`            |
| `-forceMergeAuthKey`        | 强制合并认证密钥       | `/internal/force_merge`            |
| `-search.resetCacheAuthKey` | 重置缓存认证密钥       | `/internal/resetRollupResultCache` |
| `-reloadAuthKey`            | 重载配置认证密钥       | `/-/reload`                        |
| `-configAuthKey`            | 配置页面认证密钥       | `/config`                          |
| `-flagsAuthKey`             | Flags 页面认证密钥     | `/flags`                           |
| `-pprofAuthKey`             | Profiling 认证密钥     | `/debug/pprof/*`                   |
| `-metricsAuthKey`           | Metrics 页面认证密钥   | `/metrics`                         |

#### 2.11.2 TLS/mTLS 配置

**启用 HTTPS：**

```bash
victoria-metrics \
  -tls \
  -tlsCertFile=/path/to/cert.pem \
  -tlsKeyFile=/path/to/key.pem
```

**启用 mTLS（Enterprise）：**

```bash
victoria-metrics-prod \
  -tls \
  -mtls \
  -mtlsCAFile=/path/to/ca.pem
```

**自动签发 TLS 证书（Enterprise）：**

```bash
victoria-metrics-prod \
  -httpListenAddr=:443 \
  -tls \
  -tlsAutocertHosts=vm.example.com,vm2.example.com \
  -tlsAutocertEmail=admin@example.com \
  -tlsAutocertCacheDir=/var/lib/vm-certs
```

#### 2.11.3 安全 HTTP 响应头

| Flag                          | 说明                         | 推荐值                                  |
| ----------------------------- | ---------------------------- | --------------------------------------- |
| `-http.header.hsts`         | Strict-Transport-Security 头 | `max-age=31536000; includeSubDomains` |
| `-http.header.csp`          | Content-Security-Policy 头   | `default-src 'self'`                  |
| `-http.header.frameOptions` | X-Frame-Options 头           | `DENY`                                |

---

### 2.12 VMUI Web 界面

VictoriaMetrics 提供强大的 Web UI（VMUI）。

#### 2.12.1 访问地址

- **单机版**：[http://victoriametrics:8428/vmui](http://victoriametrics:8428/vmui)
- **集群版**：http://`<vmselect>`:8481/select/`<accountID>`/vmui/

#### 2.12.2 主要功能

| 功能标签                             | 说明                                       |
| ------------------------------------ | ------------------------------------------ |
| **Query**                      | MetricsQL 查询，支持时间序列、表格、直方图 |
| **Raw Query**                  | 查看原始样本，调试查询结果                 |
| **Explore Metrics**            | 按 job/instance 浏览指标                   |
| **Cardinality Explorer**       | 分析时序基数                               |
| **Top Queries**                | 查看最常执行的查询                         |
| **Active Queries**             | 查看当前执行的查询                         |
| **Trace Analyzer**             | 分析查询追踪 JSON                          |
| **Query Analyzer**             | 分析导出的查询结果                         |
| **Metric Relabel Debugger**    | 调试 relabeling 规则                       |
| **Downsampling Debugger**      | 调试降采样配置（Enterprise）               |
| **Retention Filters Debugger** | 调试保留过滤器（Enterprise）               |

#### 2.12.3 快捷键

| 操作               | 快捷键                  |
| ------------------ | ----------------------- |
| 执行查询           | `Enter`               |
| 多行查询           | `Shift + Enter`       |
| 自动完成           | `Ctrl + Space`        |
| 查询历史（上一条） | `Ctrl/Cmd + ↑`       |
| 查询历史（下一条） | `Ctrl/Cmd + ↓`       |
| 放大               | `Ctrl/Cmd + 滚轮向上` |
| 缩小               | `Ctrl/Cmd + 滚轮向下` |
| 移动时间范围       | `Ctrl/Cmd + 拖动`     |

---

### 2.13 监控与可观测性

#### 2.13.1 自我监控

VictoriaMetrics 可以自我抓取指标：

```bash
victoria-metrics -selfScrapeInterval=10s
```

**相关 Flag：**

| Flag                    | 默认值               | 说明                           |
| ----------------------- | -------------------- | ------------------------------ |
| `-selfScrapeInterval` | `0`（禁用）        | 自我抓取间隔                   |
| `-selfScrapeJob`      | `victoria-metrics` | 自我抓取的 `job` 标签值      |
| `-selfScrapeInstance` | `self`             | 自我抓取的 `instance` 标签值 |

#### 2.13.2 推送指标（Push Metrics）

VictoriaMetrics 支持将 `/metrics` 页面的指标推送到远程存储。

```bash
victoria-metrics \
  -pushmetrics.url=http://vm-central:8428/api/v1/import/prometheus \
  -pushmetrics.interval=10s \
  -pushmetrics.extraLabel='instance="vm-node1"' \
  -pushmetrics.extraLabel='job="victoriametrics"'
```

**相关 Flag：**

| Flag                                | 说明                         |
| ----------------------------------- | ---------------------------- |
| `-pushmetrics.url`                | 推送指标的 URL（可指定多次） |
| `-pushmetrics.interval`           | 推送间隔（默认 `10s`）     |
| `-pushmetrics.extraLabel`         | 添加额外标签                 |
| `-pushmetrics.header`             | 添加 HTTP 请求头             |
| `-pushmetrics.disableCompression` | 禁用压缩                     |

#### 2.13.3 Grafana 仪表板

官方 Grafana 仪表板：

- **单机版**：[https://grafana.com/grafana/dashboards/10229](https://grafana.com/grafana/dashboards/10229)
- **集群版**：[https://grafana.com/grafana/dashboards/11176](https://grafana.com/grafana/dashboards/11176)

---

### 2.14 备份与恢复

#### 2.14.1 创建快照

```bash
curl http://localhost:8428/snapshot/create
```

**响应：**

```json
{"status":"ok","snapshot":"20231115-120000-ABC123"}
```

**快照存储位置：**

```
<storageDataPath>/snapshots/<snapshot-name>/
```

#### 2.14.2 列出快照

```bash
curl http://localhost:8428/snapshot/list
```

#### 2.14.3 删除快照

```bash
# 删除指定快照
curl "http://localhost:8428/snapshot/delete?snapshot=<snapshot-name>"

# 删除所有快照
curl http://localhost:8428/snapshot/delete_all
```

#### 2.14.4 从快照恢复

```bash
# 1. 停止 VictoriaMetrics
kill -INT <vm-pid>

# 2. 使用 vmrestore 恢复快照
vmrestore \
  -src=<backup-location> \
  -storageDataPath=<vm-storageDataPath>

# 3. 启动 VictoriaMetrics
./victoria-metrics -storageDataPath=<vm-storageDataPath>
```

> [!Important]
> **快照注意事项：**
>
> 1. 快照使用硬链接和软链接，**不要**用 `rm` 删除快照子目录
> 2. **不要**用 `cp`/`rsync` 复制快照，使用 `vmbackup`
> 3. 旧快照可能占用额外磁盘空间，建议定期删除

#### 2.14.5 自动快照管理

```bash
victoria-metrics \
  -snapshotsMaxAge=7d \
  -snapshotAuthKey=<secret-key>
```

**相关 Flag：**

| Flag                 | 说明                          |
| -------------------- | ----------------------------- |
| `-snapshotsMaxAge` | 快照最大保留时间（如 `7d`） |
| `-snapshotAuthKey` | 快照 API 认证密钥             |

---

### 2.15 数据导入导出

#### 2.15.1 导出数据

**JSON Line 格式：**

```bash
curl "http://localhost:8428/api/v1/export?start=2023-01-01T00:00:00Z&end=2023-12-31T23:59:59Z&match[]={__name__!=\"\"}" > data.jsonl
```

**CSV 格式：**

```bash
curl "http://localhost:8428/api/v1/export/csv?format=__timestamp__:unix_s,__name__,__value__&match[]={__name__=\"up\"}" > data.csv
```

**Native 格式（最高效）：**

```bash
curl "http://localhost:8428/api/v1/export/native?match[]={__name__!=\"\"}" > data.bin
```

#### 2.15.2 导入数据

**JSON Line 格式：**

```bash
curl -X POST "http://localhost:8428/api/v1/import" -T data.jsonl
```

**Native 格式：**

```bash
curl -X POST "http://localhost:8428/api/v1/import/native" -T data.bin
```

**CSV 格式：**

```bash
curl -X POST "http://localhost:8428/api/v1/import/csv?format=1:metric:temperature,2:label:location,3:time:unix_s" -T data.csv
```

**Prometheus 格式：**

```bash
curl -d 'metric{label="value"} 123' -X POST "http://localhost:8428/api/v1/import/prometheus"
```

---

### 2.16 故障排查

#### 2.16.1 常见问题

| 问题       | 可能原因               | 解决方法                               |
| ---------- | ---------------------- | -------------------------------------- |
| 数据摄入慢 | 活跃时序过多，内存不足 | 增加内存，监控 `vm_slow_*` 指标      |
| 查询慢     | 并发查询过多           | 调整 `-search.maxConcurrentRequests` |
| 磁盘使用高 | 合并停滞               | 检查可用磁盘空间（至少 20%）           |
| 图表有间隙 | 时间同步问题           | 调整 `-search.cacheTimestampOffset`  |
| 启动失败   | 损坏的 parts           | 删除损坏的 part 目录                   |

#### 2.16.2 关键监控指标

| 指标                                                                                           | 说明                     | 告警阈值 |
| ---------------------------------------------------------------------------------------------- | ------------------------ | -------- |
| `vm_free_disk_space_bytes`                                                                   | 可用磁盘空间             | < 20%    |
| `vm_slow_row_inserts_total`                                                                  | 慢写入计数               | 持续增长 |
| `vm_slow_metric_name_loads_total`                                                            | 慢元数据加载             | 持续增长 |
| `vm_rows_ignored_total`                                                                      | 被忽略的行数             | > 0      |
| `vm_hourly_series_limit_current_series / vm_hourly_series_limit_max_series`                  | 小时基数使用率           | > 0.9    |
| `vm_cache_size_bytes{type="storage/metricNamesStatsTracker"} / vm_cache_size_max_bytes{...}` | 指标名称追踪器缓存使用率 | > 0.9    |

#### 2.16.3 日志记录

**配置日志：**

```bash
victoria-metrics \
  -loggerLevel=INFO \
  -loggerFormat=json \
  -loggerOutput=stdout \
  -loggerTimezone=Asia/Shanghai \
  -loggerMaxArgLen=10000
```

**日志相关 Flag：**

| Flag                         | 默认值      | 说明                                        |
| ---------------------------- | ----------- | ------------------------------------------- |
| `-loggerLevel`             | `INFO`    | 日志级别（INFO, WARN, ERROR, FATAL, PANIC） |
| `-loggerFormat`            | `default` | 日志格式（default, json）                   |
| `-loggerOutput`            | `stderr`  | 日志输出（stderr, stdout）                  |
| `-loggerTimezone`          | `UTC`     | 日志时区                                    |
| `-loggerMaxArgLen`         | `5000`    | 单个日志参数最大长度                        |
| `-loggerDisableTimestamps` | `false`   | 禁用时间戳                                  |

---

### 2.17 环境变量支持

VictoriaMetrics 支持通过环境变量设置 flag 值。

#### 2.17.1 配置文件中引用环境变量

```yaml
# prometheus.yml
global:
  external_labels:
    cluster: %{CLUSTER_NAME}
    region: %{REGION}

scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['%{NODE_IP}:9100']
```

#### 2.17.2 通过环境变量设置 Flag

**启用环境变量支持：**

```bash
victoria-metrics -envflag.enable
```

**示例：**

```bash
export retention_period=90d
export http_listen_addr=:8428
export storage_data_path=/data/vm

victoria-metrics -envflag.enable
```

**重复 Flag：**

```bash
export storage_node="node1:8400,node2:8400,node3:8400"
```

**设置前缀：**

```bash
export VM_retention_period=90d
export VM_http_listen_addr=:8428

victoria-metrics -envflag.enable -envflag.prefix=VM_
```

---

### 2.18 容量规划

#### 2.18.1 生产工作负载参考

根据案例研究，单机版 VictoriaMetrics 可完美处理以下工作负载：

| 指标                      | 数值              |
| ------------------------- | ----------------- |
| **摄入速率**        | 150 万+ samples/s |
| **活跃时序**        | 5000 万+          |
| **总时序数**        | 50 亿+            |
| **时序流失率**      | 1.5 亿+ 新时序/天 |
| **总样本数**        | 10 万亿+          |
| **查询 QPS**        | 200+              |
| **查询延迟（P99）** | 1 秒              |

#### 2.18.2 资源建议

| 资源类型               | 建议     |
| ---------------------- | -------- |
| **空闲内存**     | 至少 50% |
| **空闲 CPU**     | 至少 50% |
| **可用磁盘空间** | 至少 20% |

#### 2.18.3 存储空间估算

**公式：**

```
所需存储空间 = 测试期间磁盘使用量 × (保留期天数 / 测试天数)
```

**示例：**

- 测试 1 天后，`-storageDataPath` 目录大小为 10GB
- 保留期设为 100 天（`-retentionPeriod=100d`）
- 所需存储空间：`10GB × 100 = 1TB`

**预留空间：** 实际需要 **1TB + 20%** = **1.2TB**

---

### 2.19 Flag 参数速查表

#### 2.19.1 核心参数

| Flag                    | 默认值                    | 说明          |
| ----------------------- | ------------------------- | ------------- |
| `-storageDataPath`    | `victoria-metrics-data` | 数据存储路径  |
| `-retentionPeriod`    | `1` (月)                | 数据保留周期  |
| `-httpListenAddr`     | `:8428`                 | HTTP 监听地址 |
| `-selfScrapeInterval` | `0`                     | 自我抓取间隔  |

#### 2.19.2 性能调优

| Flag                              | 默认值 | 说明                     |
| --------------------------------- | ------ | ------------------------ |
| `-memory.allowedPercent`        | `60` | 允许缓存使用的内存百分比 |
| `-search.maxConcurrentRequests` | 自动   | 最大并发查询数           |
| `-search.maxMemoryPerQuery`     | 自动   | 单查询最大内存           |
| `-search.maxWorkersPerQuery`    | 自动   | 单查询最大工作线程数     |

#### 2.19.3 限制参数

| Flag                            | 默认值  | 说明               |
| ------------------------------- | ------- | ------------------ |
| `-maxIngestionRate`           | `0`   | 每秒最大摄入样本数 |
| `-search.maxQueryDuration`    | `30s` | 查询最大执行时间   |
| `-search.maxUniqueTimeseries` | 自动    | 单查询最大时序数   |

#### 2.19.4 企业特性

| Flag                     | 说明                   | 类型       |
| ------------------------ | ---------------------- | ---------- |
| `-downsampling.period` | 降采样配置             | Enterprise |
| `-retentionFilter`     | 保留期过滤器           | Enterprise |
| `-mtls`                | 启用 mTLS              | Enterprise |
| `-tlsAutocertHosts`    | Let's Encrypt 自动证书 | Enterprise |

---

**🎯 第 2 章完成！** 下一步将继续学习集群版 VictoriaMetrics...

---

## 第 3 章：集群版 VictoriaMetrics 深入详解

### 3.1 概述与架构

#### 3.1.1 何时使用集群版

> [!IMPORTANT]
> **推荐使用场景判断**：
>
> - **单机版适用**：摄入速率 < 100 万 data points/s
> - **集群版适用**：摄入速率 >= 100 万 data points/s，或需要多租户隔离

单机版优势：

- 完美的垂直扩展能力（CPU、RAM、存储）
- 支持高可用部署
- 配置和运维更简单

#### 3.1.2 架构组件

```mermaid
graph LR
    A[HTTP Load Balancer vmauth/nginx] --> B[vminsert 数据写入]
    A --> C[vmselect 数据查询]
  
    B --> D[vmstorage-1]
    B --> E[vmstorage-2]
    B --> F[vmstorage-N]
  
    C --> D
    C --> E
    C --> F
  
    style A fill:#f9f,stroke:#333,stroke-width:2px
    style B fill:#9f9,stroke:#333,stroke-width:2px
    style C fill:#99f,stroke:#333,stroke-width:2px
    style D fill:#ff9,stroke:#333,stroke-width:2px
```

| 组件                | 端口                                                      | 职责                                   | 是否有状态                       |
| ------------------- | --------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| **vminsert**  | `8480`                                                  | 接收数据，按一致性哈希分发到 vmstorage | 无状态                           |
| **vmselect**  | `8481`                                                  | 处理查询请求，从 vmstorage 聚合数据    | 无状态（但需要少量磁盘用于缓存） |
| **vmstorage** | `8482` (HTTP), `8400` (vminsert), `8401` (vmselect) | 存储和检索数据                         | 有状态                           |

**Shared Nothing 架构**：

- vmstorage 节点之间不通信
- 不共享任何数据
- 提高集群可用性
- 简化集群维护和扩展

> [!NOTE]
> vmselect 虽然是无状态的，但仍需要一些磁盘空间（几 GB）用于临时缓存。通过 `-cacheDataPath` 参数配置。

---

### 3.2 多租户（Multi-tenancy）

#### 3.2.1 租户标识符

租户由 `accountID` 或 `accountID:projectID` 标识：

- 都是 **32位整数**，范围：`[0 .. 2^32)`
- `projectID` 缺失时自动设为 `0`

**URL 格式：**

```
# 写入
http://vminsert:8480/insert/<accountID>/prometheus/api/v1/write
http://vminsert:8480/insert/<accountID>:<projectID>/prometheus/api/v1/write

# 查询
http://vmselect:8481/select/<accountID>/prometheus/api/v1/query
http://vmselect:8481/select/<accountID>:<projectID>/prometheus/api/v1/query_range
```

#### 3.2.2 租户管理

| 特性                 | 说明                                                          |
| -------------------- | ------------------------------------------------------------- |
| **自动创建**   | 首次写入数据时自动创建租户                                    |
| **均匀分布**   | 所有租户的数据均匀分布在所有 vmstorage 节点                   |
| **性能无关**   | 性能与租户数量无关，仅与活跃时序总数相关                      |
| **元信息存储** | 建议在关系数据库中管理租户元信息（auth tokens、限制、计费等） |

**列出已注册租户：**

```bash
curl http://vmselect:8481/admin/tenants?start=2024-01-01T00:00:00Z&end=2024-12-31T23:59:59Z
```

#### 3.2.3 基于标签的多租户

**写入数据：**

通过特殊端点 `/insert/multitenant/<suffix>` 写入，租户 ID 从标签中提取：

```
# 样本
http_requests_total{path="/foo",vm_account_id="42"} 12
http_requests_total{path="/bar",vm_account_id="7",vm_project_id="9"} 34

# 写入端点
POST http://vminsert:8480/insert/multitenant/prometheus/api/v1/write
```

**效果：**

- `http_requests_total{path="/foo"} 12` → `accountID=42, projectID=0`
- `http_requests_total{path="/bar"} 34` → `accountID=7, projectID=9`
- `vm_account_id` 和 `vm_project_id` 标签会被自动删除

**读取数据：**

```promql
# 跨多租户查询
up{vm_account_id="7", vm_project_id="9" or vm_account_id="42"}

# 使用 extra_filters
curl 'http://vmselect:8481/select/multitenant/prometheus/api/v1/query' \
  -d 'query=up' \
  -d 'extra_filters[]={vm_account_id="7",vm_project_id="9"}' \
  -d 'extra_filters[]={vm_account_id="42"}'
```

> [!WARNING]
> **安全考虑**：
> 多租户端点应仅对可信源开放，防止未授权访问或跨租户数据污染。

---

### 3.3 集群搭建指南

#### 3.3.1 最小集群配置

```bash
# 1. 启动 vmstorage（至少1个）
./vmstorage \
  -retentionPeriod=3 \
  -storageDataPath=/var/lib/vmstorage

# 2. 启动 vminsert（至少1个）
./vminsert \
  -storageNode=vmstorage-host:8400

# 3. 启动 vmselect（至少1个）
./vmselect \
  -storageNode=vmstorage-host:8401

# 4. 配置负载均衡器（vmauth或nginx）
# /insert/* → vminsert:8480
# /select/* → vmselect:8481
```

#### 3.3.2 高可用配置

```mermaid
graph TD
    A[Load Balancer vmauth] --> B[vminsert-1]
    A --> C[vminsert-2]
    A --> D[vmselect-1]
    A --> E[vmselect-2]
  
    B --> F[vmstorage-1]
    B --> G[vmstorage-2]
    B --> H[vmstorage-3]
  
    C --> F
    C --> G
    C --> H
  
    D --> F
    D --> G
    D --> H
  
    E --> F
    E --> G
    E --> H
```

**推荐配置：**

- 每种服务至少 **2个节点**
- 宁可多个小 vmstorage 节点，而不是少数大节点
- 所有组件运行在同一子网（高带宽、低延迟、低错误率）

#### 3.3.3 自动发现 vmstorage（Enterprise）

**基于 DNS SRV：**

```bash
./vminsert -storageNode=srv+vmstorage-service

./vmselect -storageNode=srv+vmstorage-service
```

**基于文件：**

```bash
# vmstorage-list.txt
vmstorage-1:8400
vmstorage-2:8400
vmstorage-3:8400

./vminsert -storageNode=file:///path/to/vmstorage-list.txt

# 支持 HTTP URL
./vminsert -storageNode=file://http://config-server/vmstorage-list
```

**相关 Flag：**

| Flag                               | 说明               | 默认值 |
| ---------------------------------- | ------------------ | ------ |
| `-storageNode.discoveryInterval` | 刷新间隔           | `2s` |
| `-storageNode.filter`            | 地址过滤正则表达式 | `""` |

**监控指标：**

- `vm_rpc_vmstorage_is_reachable`：vmstorage 是否可达
- `vm_rpc_vmstorage_is_read_only`：vmstorage 是否只读

---

### 3.4 集群可用性

#### 3.4.1 可用性定义

VictoriaMetrics 集群在部分组件不可用时仍能继续接受数据和处理查询，优先**可用性**而非**一致性**。

#### 3.4.2 可用性条件

| 组件                 | 可用性要求           | 说明                                             |
| -------------------- | -------------------- | ------------------------------------------------ |
| **负载均衡器** | 停止路由到不可用节点 | vmauth 自动实现                                  |
| **vminsert**   | 至少 1 个节点可用    | 有足够 CPU、RAM、网络带宽处理写入负载            |
| **vmselect**   | 至少 1 个节点可用    | 有足够 CPU、RAM、网络带宽、磁盘 I/O 处理查询负载 |
| **vmstorage**  | 至少 1 个节点可用    | 有足够 CPU、RAM、网络带宽、磁盘 I/O、磁盘空间    |

#### 3.4.3 vmstorage 不可用时的行为

```mermaid
graph TD
    A[部分 vmstorage 不可用] --> B[vminsert 行为]
    A --> C[vmselect 行为]
  
    B --> D[重新路由新数据到健康节点]
    B --> E[均匀分布增加的负载]
  
    C --> F[继续处理查询]
    C --> G[标记响应为 partial]
    C --> H["isPartial: true"]
```

**vminsert 的重新路由：**

- 自动将数据从不可用节点重新路由到健康节点
- 健康节点将承受更高的资源使用和活跃时序数

**vmselect 的部分响应：**

- 至少一个 vmstorage 可用时继续服务查询
- 响应包含 `"isPartial": true` 字段
- 可能缺少存储在不可用节点上的历史数据

**禁用部分响应：**

```bash
# 启动时禁用
./vmselect -search.denyPartialResponse

# 查询时禁用
curl 'http://vmselect:8481/.../query?deny_partial_response=1'
```

> [!NOTE]
> 以下端点不返回部分响应（用户期望完整数据）：
>
> - `/api/v1/export*` 端点
> - `/api/v1/query?query=up[1h]` (返回原始样本)

---

### 3.5 数据复制（Replication）

#### 3.5.1 配置复制

**vminsert 端：**

```bash
./vminsert \
  -storageNode=vmstorage-1:8400,vmstorage-2:8400,vmstorage-3:8400 \
  -replicationFactor=2
```

**效果：**

- 每个样本存储 **2份副本** 到不同的 vmstorage 节点
- 最多可容忍 `N-1` 个 vmstorage 节点不可用

**vmselect 端：**

```bash
./vmselect \
  -storageNode=vmstorage-1:8401,vmstorage-2:8401,vmstorage-3:8401 \
  -replicationFactor=2 \
  -dedup.minScrapeInterval=1ms
```

**说明：**

- `-replicationFactor=2`：少于 2 个 vmstorage 不可用时不标记为 partial
- `-dedup.minScrapeInterval=1ms`：去重副本数据

#### 3.5.2 最小节点数

对于复制因子 `N`，集群至少需要 **`2*N-1`** 个 vmstorage 节点。

| 复制因子 | 最小 vmstorage 节点数 | 容错能力     |
| -------- | --------------------- | ------------ |
| 1        | 1                     | 0 个节点故障 |
| 2        | 3                     | 1 个节点故障 |
| 3        | 5                     | 2 个节点故障 |

#### 3.5.3 复制的成本

> [!WARNING]
> 复制会将资源使用增加 **最多 N 倍**：
>
> - CPU
> - RAM
> - 磁盘空间
> - 网络带宽

**替代方案（推荐）：**
使用复制持久盘，如 Google Compute Engine persistent disk，提供：

- 数据持久性保护
- 数据损坏保护
- 一致的高性能
- 无需停机即可调整大小
- 通常基于 HDD 即可满足大多数场景

---

### 3.6 去重（Deduplication）

集群版与单机版的去重机制相同，但有以下例外：

**去重无法保证的场景：**

1. 添加/移除 vmstorage 节点（时序重新路由到其他节点）
2. vmstorage 节点临时不可用（数据重新路由）
3. vmstorage 节点容量不足（数据重新路由）

**配置建议：**

```bash
# vmstorage
./vmstorage -dedup.minScrapeInterval=30s

# vmselect
./vmselect -dedup.minScrapeInterval=30s
```

推荐在 vmselect 和 vmstorage 设置相同的值以确保查询结果一致性。

---

### 3.7 多级集群（Multi-level Cluster）

#### 3.7.1 vmselect 多级链接

```mermaid
graph TD
    A[Top vmselect] --> B[AZ1 vmselect]
    A --> C[AZ2 vmselect]
    A --> D[AZ3 vmselect]
  
    B --> E[AZ1 vmstorage-1]
    B --> F[AZ1 vmstorage-2]
  
    C --> G[AZ2 vmstorage-1]
    C --> H[AZ2 vmstorage-2]
  
    D --> I[AZ3 vmstorage-1]
    D --> J[AZ3 vmstorage-2]
```

**配置二级 vmselect：**

```bash
# 一级 vmselect（每个 AZ）
./vmselect \
  -storageNode=az1-vmstorage-1:8401,az1-vmstorage-2:8401 \
  -clusternativeListenAddr=:8401

# 顶级 vmselect
./vmselect \
  -storageNode=az1-vmselect:8401,az2-vmselect:8401,az3-vmselect:8401
```

#### 3.7.2 vminsert 多级链接

```mermaid
graph TD
    A[Top vminsert] --> B[AZ1 vminsert]
    A --> C[AZ2 vminsert]
  
    B --> D[AZ1 vmstorage-1]
    B --> E[AZ1 vmstorage-2]
  
    C --> F[AZ2 vmstorage-1]
    C --> G[AZ2 vmstorage-2]
```

**配置：**

```bash
# 二级 vminsert（每个 AZ）
./vminsert \
  -storageNode=az1-vmstorage-1:8400,az1-vmstorage-2:8400 \
  -clusternativeListenAddr=:8400

# 顶级 vminsert
./vminsert \
  -storageNode=az1-vminsert:8400,az2-vminsert:8400
```

**缺点：**

1. 数据摄入速度受限于最慢的 AZ 链路
2. AZ 临时不可用时，数据会重新路由到其他 AZ，导致数据缺口

**推荐方案：**
使用 **vmagent** 在 AZ 前复制/分片数据流：

- AZ 临时不可用时，vmagent 缓冲数据到磁盘（`--remoteWrite.maxDiskUsagePerURL`）
- 无需影响其他 AZ
- AZ 恢复后自动发送缓冲数据

---

### 3.8 vmstorage 分组

#### 3.8.1 独立复制因子

```bash
./vmselect \
  -replicationFactor=2 \
  -storageNode=g1/host1,g1/host2,g1/host3 \
  -storageNode=g2/host4,g2/host5,g2/host6 \
  -storageNode=g3/host7,g3/host8,g3/host9
```

**效果：**

- 每个组独立应用 `-replicationFactor=2`
- 最多容忍每组 1 个节点不可用

#### 3.8.2 每组不同复制因子

```bash
./vmselect \
  -replicationFactor=g1:3 \
  -storageNode=g1/host1,g1/host2,g1/host3 \
  -replicationFactor=g2:2 \
  -storageNode=g2/host4,g2/host5,g2/host6 \
  -replicationFactor=g3:1 \
  -storageNode=g3/host7,g3/host8,g3/host9
```

#### 3.8.3 全局复制因子

```bash
./vmselect \
  -globalReplicationFactor=2 \
  -storageNode=g1/host1,g1/host2,g1/host3 \
  -storageNode=g2/host4,g2/host5,g2/host6 \
  -storageNode=g3/host7,g3/host8,g3/host9
```

**效果：**

- 最多容忍 1 个完整的 vmstorage 组不可用

#### 3.8.4 混合使用

```bash
./vmselect \
  -globalReplicationFactor=2 \
  -replicationFactor=3 \
  -storageNode=g1/host1,g1/host2,g1/host3 \
  -storageNode=g2/host4,g2/host5,g2/host6 \
  -storageNode=g3/host7,g3/host8,g3/host9
```

**效果：**

- 容忍 1 个完整组不可用
- 剩余组中每组最多容忍 2 个节点不可用

---

### 3.9 集群扩容与重新平衡

#### 3.9.1 垂直扩展 vs 水平扩展

| 扩展类型           | 方法                             | 优势                                               |
| ------------------ | -------------------------------- | -------------------------------------------------- |
| **垂直扩展** | 增加单节点资源（CPU、RAM、磁盘） | 提升单个查询性能、增加活跃时序容量                 |
| **水平扩展** | 增加节点数量                     | 提升集群稳定性、改善高流失率查询性能、提高并发能力 |

#### 3.9.2 扩容建议

**添加 vmstorage 节点：**

1. 提高活跃时序容量
2. 改善高流失率时序查询性能
3. 提升集群稳定性（节点故障时负载增加更小）

**添加 vminsert 节点：**

- 提高数据摄入速度

**添加 vmselect 节点：**

- 提高查询并发处理能力

#### 3.9.3 添加 vmstorage 节点步骤

```bash
# 1. 启动新 vmstorage 节点
./vmstorage \
  -retentionPeriod=90d \
  -storageDataPath=/var/lib/vmstorage-new

# 2. 逐步重启所有 vmselect 节点
./vmselect \
  -storageNode=old1:8401,old2:8401,new1:8401

# 3. 逐步重启所有 vminsert 节点
./vminsert \
  -storageNode=old1:8400,old2:8400,new1:8400
```

#### 3.9.4 重新平衡策略

**默认行为：**

- 新数据均匀分布到所有节点（包括新节点）
- 历史数据保留在旧节点

**优势：**

- 无需网络带宽、磁盘 I/O、CPU 用于数据重新平衡
- 避免重新平衡期间的故障问题
- 支持灵活的集群方案（不同 vminsert 节点写入不同 vmstorage 子集）

**手动重新平衡方法：**

1. **等待历史数据自动删除**（根据 retention）
2. **临时只写新节点**：

   ```bash
   # vminsert（只写新节点）
   ./vminsert -storageNode=new1:8400,new2:8400

   # vmselect（读所有节点）
   ./vmselect -storageNode=old1:8401,old2:8401,new1:8401,new2:8401
   ```

   等待新旧节点数据量相等后，重新配置 vminsert 包含所有节点。

---

### 3.10 集群更新与配置变更

#### 3.10.1 零停机滚动更新

```bash
# 推荐顺序
# 1. 逐个重启 vmstorage 节点
kill -INT <vmstorage-pid>
# 等待进程优雅退出
./vmstorage <new-flags>

# 2. 逐个重启 vminsert 节点
kill -INT <vminsert-pid>
./vminsert <new-flags>

# 3. 逐个重启 vmselect 节点
kill -INT <vmselect-pid>
./vmselect <new-flags>
```

**前提条件：**

1. 每种组件至少有 2 对节点（高可用）
2. 有足够的计算资源处理单节点临时不可用的负载
3. 新配置/版本与现有组件兼容

#### 3.10.2 最小停机时间更新

```bash
# 1. 并行停止所有 vminsert 和 vmselect
kill -INT <all-vminsert-pids>
kill -INT <all-vmselect-pids>

# 2. 并行重启所有 vmstorage
kill -INT <all-vmstorage-pids>
# 等待所有进程退出
./vmstorage <new-flags> &  # 所有节点并行启动

# 3. 并行启动所有 vminsert 和 vmselect
./vminsert <new-flags> &
./vmselect <new-flags> &
```

**适用场景：**

- 版本不兼容
- 资源不足以滚动更新
- 大规模集群需要快速更新

#### 3.10.3 优化滚动重启性能

**减少重新路由负载：**

```bash
# vminsert：暂停摄入而不是重新路由
./vminsert -disableReroutingOnUnavailable

# vmstorage：增加连接优雅关闭时间（v1.95.0+）
./vmstorage -storage.vminsertConnsShutdown Duration=120s
```

> [!WARNING]
> 确保 `-storage.vminsertConnsShutdownDuration` **小于**系统的优雅关闭超时（Docker、Kubernetes、systemd）。

---

### 3.11 资源使用限制

#### 3.11.1 全局限制

| Flag                       | 说明                                  | 适用组件 |
| -------------------------- | ------------------------------------- | -------- |
| `-memory.allowedPercent` | 缓存可使用的系统内存百分比（默认 60） | 所有组件 |
| `-memory.allowedBytes`   | 缓存可使用的字节数（覆盖 percent）    | 所有组件 |

#### 3.11.2 vmselect 查询限制

| Flag                              | 默认值   | 说明                       |
| --------------------------------- | -------- | -------------------------- |
| `-search.maxMemoryPerQuery`     | 自动计算 | 单个查询最大内存           |
| `-search.maxQueryDuration`      | `30s`  | 查询最大执行时间           |
| `-search.maxConcurrentRequests` | 自动计算 | 最大并发查询数             |
| `-search.maxQueueDuration`      | `10s`  | 查询队列最大等待时间       |
| `-search.maxUniqueTimeseries`   | 自动计算 | 限制单个查询可处理的时序数 |
| `-search.maxWorkersPerQuery`    | 自动计算 | 单个查询可用的 CPU 核数    |

#### 3.11.3 vmstorage 限制

| Flag                              | 说明                                    | 适用组件            |
| --------------------------------- | --------------------------------------- | ------------------- |
| `-search.maxUniqueTimeseries`   | 单个查询可处理的时序数                  | vmstorage           |
| `-search.maxConcurrentRequests` | 最大并发请求数                          | vmstorage           |
| `-search.maxQueueDuration`      | 查询队列最大等待时间                    | vmstorage           |
| `-search.maxTagKeys`            | `/api/v1/labels` 最大返回数           | vmstorage、vmselect |
| `-search.maxTagValues`          | `/api/v1/label/.../values` 最大返回数 | vmstorage、vmselect |

#### 3.11.4 基数限制

```bash
# vmstorage
./vmstorage \
  -storage.maxHourlySeries=1000000 \
  -storage.maxDailySeries=10000000
```

> [!NOTE]
> 集群级别的限制 = 单节点限制 × vmstorage 节点数

---

### 3.12 企业特性

#### 3.12.1 保留期过滤器（Retention Filters）

```bash
# vmstorage
./vmstorage \
  -retentionFilter='{vm_account_id=~"42.*"}:1d' \
  -retentionFilter='{env=~"dev|staging"}:3d' \
  -retentionPeriod=4w
```

**效果：**

- `vm_account_id` 以 `42` 开头的租户：1 天保留期
- `env="dev"` 或 `env="staging"` 的时序：3 天保留期
- 其他：4 周保留期

**混合真实标签与伪标签：**

```bash
-retentionFilter='{vm_account_id="5",env="dev"}:5d'
```

#### 3.12.2 降采样（Downsampling）

```bash
# vmstorage 和 vmselect 都需要设置
./vmstorage \
  -downsampling.period='{vm_account_id=~"12|42"}:1h:1m'

./vmselect \
  -downsampling.period='{vm_account_id=~"12|42"}:1h:1m'
```

**效果：**

- `accountID=12` 或 `42` 的租户：1 小时后每分钟保留最后一个样本
- 其他租户：数据被丢弃

**混合标签：**

```bash
-downsampling.period='{vm_account_id="5",env="dev"}:30d:1h'
```

> [!IMPORTANT]
> vmselect 和 vmstorage 必须设置相同的 `-downsampling.period` 值以确保查询结果一致。

---

### 3.13 安全配置

#### 3.13.1 通用安全建议

1. **网络隔离**：所有集群组件运行在受保护的私有网络
2. **认证代理**：外部客户端通过 vmauth 或 vmgateway 访问
3. **HTTPS**：仅通过 HTTPS 接受 auth token
4. **租户隔离**：不同租户使用不同的 auth token
5. **API 白名单**：配置允许的 API 端点列表

#### 3.13.2 mTLS 保护（Enterprise）

**HTTP 端点 mTLS：**

```bash
# vminsert
./vminsert -tls -mtls

# vmselect
./vmselect -tls -mtls
```

**集群内部通信 mTLS：**

```bash
# vminsert
./vminsert \
  -cluster.tls \
  -cluster.tlsCertFile=/path/to/cert.pem \
  -cluster.tlsKeyFile=/path/to/key.pem

# vmselect
./vmselect \
  -cluster.tls \
  -cluster.tlsCertFile=/path/to/cert.pem \
  -cluster.tlsKeyFile=/path/to/key.pem

# vmstorage
./vmstorage \
  -cluster.tls \
  -cluster.tlsCertFile=/path/to/cert.pem \
  -cluster.tlsKeyFile=/path/to/key.pem
```

**多级集群 mTLS：**

```bash
# 二级 vmselect
./vmselect \
  -clusternativeListenAddr=:8401 \
  -clusternative.tls \
  -clusternative.tlsCertFile=/path/to/cert.pem \
  -clusternative.tlsKeyFile=/path/to/key.pem
```

---

### 3.14 URL 格式总览

#### 3.14.1 数据摄入端点

**基础格式：** `http://vminsert:8480/insert/<accountID>/<suffix>`

| Suffix                                  | 协议                    | 说明                       |
| --------------------------------------- | ----------------------- | -------------------------- |
| `prometheus/api/v1/write`             | Prometheus remote write | 推荐                       |
| `prometheus/api/v1/import`            | JSON line               | 从 vmselect 导出的数据     |
| `prometheus/api/v1/import/native`     | Native binary           | VictoriaMetrics 原生格式   |
| `prometheus/api/v1/import/csv`        | CSV                     | 任意 CSV 数据              |
| `prometheus/api/v1/import/prometheus` | Prometheus exposition   | Text/OpenMetrics 格式      |
| `opentelemetry/v1/metrics`            | OpenTelemetry           | OTLP metrics               |
| `datadog/api/v2/series`               | DataDog                 | DataDog submit metrics API |
| `influx/write`                        | InfluxDB line protocol  | HTTP                       |
| `opentsdb/api/put`                    | OpenTSDB HTTP           | `/api/put`               |

#### 3.14.2 查询端点

**基础格式：** `http://vmselect:8481/select/<accountID>/prometheus/<suffix>`

| Suffix                           | 说明                      |
| -------------------------------- | ------------------------- |
| `api/v1/query`                 | 即时查询（Instant query） |
| `api/v1/query_range`           | 范围查询（Range query）   |
| `api/v1/series`                | 时序查询                  |
| `api/v1/labels`                | 标签名列表                |
| `api/v1/label/<name>/values`   | 标签值列表                |
| `api/v1/export`                | 导出为 JSON line          |
| `api/v1/export/native`         | 导出为 native binary      |
| `api/v1/export/csv`            | 导出为 CSV                |
| `api/v1/status/tsdb`           | 时序统计信息              |
| `api/v1/status/active_queries` | 当前执行的查询            |
| `api/v1/status/top_queries`    | 最频繁/最慢的查询         |

#### 3.14.3 其他端点

| 端点                                                                                   | 说明          |
| -------------------------------------------------------------------------------------- | ------------- |
| `http://vmselect:8481/select/<accountID>/vmui/`                                      | VMUI Web 界面 |
| `http://vmselect:8481/admin/tenants`                                                 | 列出所有租户  |
| `http://vmselect:8481/delete/<accountID>/prometheus/api/v1/admin/tsdb/delete_series` | 删除时序      |
| `http://vmstorage:8482/snapshot/create`                                              | 创建快照      |
| `http://vmstorage:8482/snapshot/list`                                                | 列出快照      |
| `http://vmstorage:8482/snapshot/delete?snapshot=<id>`                                | 删除快照      |

---

### 3.15 容量规划

#### 3.15.1 资源建议

| 资源类型           | 推荐空闲量 | 原因                             |
| ------------------ | ---------- | -------------------------------- |
| **RAM**      | 50%        | 应对临时负载峰值、避免 OOM       |
| **CPU**      | 50%        | 应对临时负载峰值、避免查询超时   |
| **磁盘空间** | ≥ 20%     | vmstorage 后台合并和月度去重需要 |

#### 3.15.2 存储空间估算

**公式：**

```
所需空间 = 测试期间磁盘使用量 × (保留期天数 / 测试天数) × vmstorage节点数 × (1 + 0.2)
```

**示例：**

- 单个 vmstorage 测试 1 天后使用 10GB
- 保留期 = 90 天
- vmstorage 节点数 = 3
- 所需存储：`10GB × 90 × 3 × 1.2 = 3.24TB`

#### 3.15.3 特殊考虑

**月度最终去重：**

- 每月月初，vmstorage 会进行最终去重
- 临时需要上个月数据量大小的磁盘空间
- 如 3 个月保留期，建议预留 **35%** 空间

**只读模式触发：**

- 当 vmstorage 磁盘空间 < `-storage.minFreeDiskSpaceBytes`
- vminsert 停止写入该节点，重新路由到其他节点
- 监控指标：`vm_storage_is_read_only`

---

### 3.16 监控指标

#### 3.16.1 组件端口

| 组件      | 监控端口 | 端点         |
| --------- | -------- | ------------ |
| vminsert  | `8480` | `/metrics` |
| vmselect  | `8481` | `/metrics` |
| vmstorage | `8482` | `/metrics` |

#### 3.16.2 Grafana 仪表板

官方仪表板：[https://grafana.com/grafana/dashboards/11176](https://grafana.com/grafana/dashboards/11176)

#### 3.16.3 关键监控指标

| 指标                                      | 说明                             |
| ----------------------------------------- | -------------------------------- |
| `vm_rpc_vmstorage_is_reachable`         | vmstorage 节点是否可达           |
| `vm_rpc_vmstorage_is_read_only`         | vmstorage 是否只读模式           |
| `vm_storage_is_read_only`               | vmstorage 是否进入只读模式       |
| `vm_free_disk_space_bytes`              | vmstorage 可用磁盘空间           |
| `vm_rows_ignored_total`                 | 被忽略的行数（标签超长、超限等） |
| `vm_hourly_series_limit_current_series` | 当前小时唯一时序数               |
| `vm_daily_series_limit_current_series`  | 当前day唯一时序数                |

---

### 3.17 集群 vs 单机对比

| 特性                 | 单机版                | 集群版                                        |
| -------------------- | --------------------- | --------------------------------------------- |
| **多租户**     | 不支持                | 支持，通过 accountID/projectID                |
| **水平扩展**   | 不支持                | 支持，可添加 vminsert/vmselect/vmstorage 节点 |
| **垂直扩展**   | 支持                  | 支持                                          |
| **复制**       | 依赖存储层            | 应用层复制（`-replicationFactor`）          |
| **高可用**     | 通过vmagent多副本写入 | 内置高可用                                    |
| **配置复杂度** | 低                    | 中等                                          |
| **适用场景**   | < 100万 samples/s     | >= 100万 samples/s，多租户需求                |

---

### 3.18 常见问题与故障排查

#### 3.18.1 为什么不自动重新平衡数据？

**原因：**

1. 避免网络、磁盘 I/O、CPU 浪费
2. 避免重新平衡期间的潜在故障风险
3. 支持灵活的集群拓扑

**解决方案：**
见 [3.9.4 重新平衡策略](#394-重新平衡策略)

#### 3.18.2 集群不稳定

**诊断步骤：**

1. 检查网络延迟：`-rpc.handshakeTimeout` 是否足够
2. 检查 vmstorage 磁盘空间：是否 < 20%
3. 检查 vmstorage 是否只读：`vm_storage_is_read_only`
4. 检查 CPU/RAM 使用率

**解决方案：**

- 增加 `-rpc.handshakeTimeout`（默认 5s）
- 增加磁盘空间
- 增加 CPU/RAM
- 增加 vmstorage 节点数

#### 3.18.3 查询性能慢

**可能原因与解决方案：**

| 原因                   | 解决方案                                        |
| ---------------------- | ----------------------------------------------- |
| vmselect 资源不足      | 增加 vmselect 节点或 CPU/RAM                    |
| vmstorage 压缩占用 CPU | 禁用压缩：`vmstorage -rpc.disableCompression` |
| 并发查询过多           | 调整 `-search.maxConcurrentRequests`          |
| 重查询                 | 增加 `-search.maxWorkersPerQuery`             |

---

### 3.19 Flag 参数速查

#### 3.19.1 vminsert 核心 Flag

| Flag                               | 默认值        | 说明                                     |
| ---------------------------------- | ------------- | ---------------------------------------- |
| `-storageNode`                   | 无            | vmstorage 节点地址列表                   |
| `-replicationFactor`             | `1`         | 复制因子                                 |
| `-disableRerouting`              | `true`      | 禁用重新路由（降低滚动重启时的活跃时序） |
| `-disableReroutingOnUnavailable` | `false`     | 节点不可用时禁用重新路由                 |
| `-dropSamplesOnOverload`         | `false`     | 节点过载时丢弃样本而非重新路由           |
| `-maxConcurrentInserts`          | `2*CPU核数` | 最大并发写入请求数                       |

#### 3.19.2 vmselect 核心 Flag

| Flag                            | 默认值    | 说明                                          |
| ------------------------------- | --------- | --------------------------------------------- |
| `-storageNode`                | 无        | vmstorage 节点地址列表                        |
| `-replicationFactor`          | `1`     | 复制因子（部分响应判断）                      |
| `-globalReplicationFactor`    | `1`     | 全局复制因子                                  |
| `-search.denyPartialResponse` | `false` | 禁止部分响应                                  |
| `-search.skipSlowReplicas`    | `false` | 跳过慢副本（需要 `-replicationFactor > 1`） |
| `-dedup.minScrapeInterval`    | `0`     | 去重间隔                                      |
| `-cacheDataPath`              | `""`    | 缓存和临时查询结果路径                        |

#### 3.19.3 vmstorage 核心 Flag

| Flag                                       | 默认值                    | 说明                              |
| ------------------------------------------ | ------------------------- | --------------------------------- |
| `-retentionPeriod`                       | `1` (月)                | 数据保留期                        |
| `-storageDataPath`                       | `victoria-metrics-data` | 数据存储路径                      |
| `-vminsertAddr`                          | `:8400`                 | vminsert 连接地址                 |
| `-vmselectAddr`                          | `:8401`                 | vmselect 连接地址                 |
| `-httpListenAddr`                        | `:8482`                 | HTTP 监听地址                     |
| `-storage.minFreeDiskSpaceBytes`         | `10MB`                  | 最小可用磁盘空间                  |
| `-rpc.disableCompression`                | `false`                 | 禁用 vmstorage→vmselect 数据压缩 |
| `-storage.vminsertConnsShutdownDuration` | `25s`                   | vminsert 连接优雅关闭时间         |

---

**🎯 第 3 章完成！** 下一步将继续学习 vmagent 组件...

---

## 第 4 章：vmagent - 数据代理与采集

### 4.1 vmagent 概述

**vmagent** 是一个轻量级的指标采集代理，负责从多种数据源收集指标，进行重新标记（relabeling）、过滤、聚合，然后发送到 VictoriaMetrics 或其他兼容 Prometheus remote_write 协议的存储系统。

**核心功能：**

- **Pull 模式**：抓取 Prometheus 兼容的 exporter
- **Push 模式**：接受多种协议推送的数据（InfluxDB、OpenTSDB、Graphite、DataDog、OpenTelemetry等）
- **数据转换**：重新标记、过滤、聚合
- **高可用**：支持数据复制和分片
- **流式聚合**：stream aggregation 减少存储和网络开销
- **缓冲机制**：远程存储不可用时缓冲到磁盘
- **低资源占用**：比 Prometheus 使用更少的 RAM、CPU、磁盘 I/O
- **大规模抓取**：支持集群模式分片抓取
- **多租户写入**：支持向 VictoriaMetrics 集群多租户端点写入
- **Kafka/PubSub 集成**（Enterprise）

---

### 4.2 使用场景

| 场景                      | 说明                                              |
| ------------------------- | ------------------------------------------------- |
| **IoT/边缘监控**    | 不稳定网络环境中缓冲数据，连接恢复后发送          |
| **Prometheus 替代** | 只负责抓取+转发，资源占用更低                     |
| **statsd 替代**     | 启用流式聚合后可替代 statsd                       |
| **灵活指标中继**    | 接受多种格式，relabel 后转发                      |
| **高可用+复制**     | 向多个存储系统复制数据                            |
| **分片存储**        | 使用 `-remoteWrite.shardByURL` 在多个存储间分片 |

---

### 4.3 快速开始

```bash
# 仅接收 Push 数据
./vmagent -remoteWrite.url=http://victoria-metrics:8428/api/v1/write

# 抓取 Prometheus 目标并转发
./vmagent \
  -promscrape.config=prometheus.yml \
  -remoteWrite.url=http://victoria-metrics:8428/api/v1/write

# 写入集群
./vmagent \
  -remoteWrite.url=http://vminsert:8480/insert/0/prometheus/api/v1/write
```

**核心 Flag：**

- `-promscrape.config`：Prometheus 配置文件路径
- `-remoteWrite.url`：远程存储地址（可多个）
- `-remoteWrite.tmpDataPath`：缓冲数据路径（默认 `vmagent-remotewrite-data`）
- `-remoteWrite.maxDiskUsagePerURL`：每 URL 最大磁盘使用（0=无限）

---

### 4.4 数据处理管道

**样本处理流程：**

1. **摄入速率限制**：`-maxIngestionRate`
2. **全局 Relabeling**：`-remoteWrite.relabelConfig`
3. **复杂度限制**：`-maxLabelsPerTimeseries`、`-maxLabelNameLen/ValueLen`
4. **基数限制**：`-remoteWrite.maxHourlySeries/maxDailySeries`
5. **全局聚合**：`-streamAggr.config`、`-streamAggr.dedupInterval`
6. **复制/分片**：根据 `-remoteWrite.shardByURL` 决定
7. **Per-URL Relabeling**：`-remoteWrite.urlRelabelConfig`
8. **Per-URL 聚合**：`-remoteWrite.streamAggr.config`
9. **Per-URL 额外标签**：`-remoteWrite.label`
10. **队列缓冲**：缓冲到磁盘（除非 `-remoteWrite.disableOnDiskQueue`）
11. **发送**：push 到 `-remoteWrite.url`

---

### 4.5 数据重新标记（Relabeling）

#### 4.5.1 全局 Relabeling

```yaml
# relabel-global.yml
- target_label: env
  replacement: production
- action: drop
  source_labels: [__name__]
  regex: 'test_.*'
```

```bash
./vmagent \
  -remoteWrite.url=http://storage:8428/api/v1/write \
  -remoteWrite.relabelConfig=relabel-global.yml
```

#### 4.5.2 Per-URL Relabeling

```bash
./vmagent \
  -remoteWrite.url=http://dev:8428/api/v1/write \
  -remoteWrite.urlRelabelConfig=relabel-dev.yml \
  -remoteWrite.url=http://prod:8428/api/v1/write \
  -remoteWrite.urlRelabelConfig=relabel-prod.yml
```

> **注意**：Flag 顺序很重要，第一个 `-remoteWrite.urlRelabelConfig` 对应第一个 `-remoteWrite.url`。

#### 4.5.3 添加额外标签

```bash
./vmagent \
  -remoteWrite.url=http://storage:8428/api/v1/write \
  -remoteWrite.label=datacenter=us-west \
  -remoteWrite.label=cluster=prod
```

---

### 4.6 数据复制与分片

#### 4.6.1 数据复制（默认）

```bash
./vmagent \
  -remoteWrite.url=http://storage1:8428/api/v1/write \
  -remoteWrite.url=http://storage2:8428/api/v1/write
```

**效果**：每个样本发送到所有存储系统。

#### 4.6.2 数据分片

```bash
./vmagent \
  -remoteWrite.shardByURL \
  -remoteWrite.url=http://storage1:8428/api/v1/write \
  -remoteWrite.url=http://storage2:8428/api/v1/write
```

**效果**：每个时序路由到单个存储系统（一致性哈希）。

#### 4.6.3 分片+复制

```bash
./vmagent \
  -remoteWrite.shardByURL \
  -remoteWrite.shardByURLReplicas=2 \
  -remoteWrite.url=http://storage1:8428/api/v1/write \
  -remoteWrite.url=http://storage2:8428/api/v1/write \
  -remoteWrite.url=http://storage3:8428/api/v1/write
```

**效果**：每个样本发送到 2 个不同的存储系统。

---

### 4.7 流式聚合

```yaml
# stream-aggr.yml
- match: 'http_requests_total'
  interval: 1m
  outputs: [total, increase]
```

```bash
./vmagent \
  -remoteWrite.url=http://storage:8428/api/v1/write \
  -streamAggr.config=stream-aggr.yml \
  -streamAggr.dedupInterval=60s
```

**去重示例**：

```bash
# 合并不同 replica 标签的时序，每 60 秒保留最后一个样本
./vmagent \
  -remoteWrite.url=http://storage:8428/api/v1/write \
  -streamAggr.dropInputLabels=replica \
  -streamAggr.dedupInterval=60s
```

---

### 4.8 多租户

#### 4.8.1 单租户写入

```bash
./vmagent \
  -remoteWrite.url=http://vminsert:8480/insert/42/prometheus/api/v1/write
```

#### 4.8.2 多租户写入（基于标签）

```yaml
# relabel.yml
- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_account_id]
  target_label: vm_account_id
```

```bash
./vmagent \
  -promscrape.config=prometheus.yml \
  -remoteWrite.relabelConfig=relabel.yml \
  -remoteWrite.url=http://vminsert:8480/insert/multitenant/prometheus/api/v1/write
```

---

### 4.9 集群模式（分片抓取）

```bash
# vmagent 实例 0（共 3 个）
./vmagent \
  -promscrape.config=prometheus.yml \
  -promscrape.cluster.membersCount=3 \
  -promscrape.cluster.memberNum=0 \
  -remoteWrite.url=http://storage:8428/api/v1/write

# vmagent 实例 1
./vmagent \
  -promscrape.cluster.membersCount=3 \
  -promscrape.cluster.memberNum=1 \
  ...
```

**高可用（复制抓取）：**

```bash
./vmagent \
  -promscrape.cluster.membersCount=6 \
  -promscrape.cluster.replicationFactor=2 \
  -promscrape.cluster.memberNum=0
```

**注意**：远程存储端需启用去重 `-dedup.minScrapeInterval`。

---

### 4.10 自动生成的指标

| 指标                                    | 说明                           |
| --------------------------------------- | ------------------------------ |
| `up`                                  | `1`=抓取成功，`0`=抓取失败 |
| `scrape_duration_seconds`             | 抓取耗时                       |
| `scrape_samples_scraped`              | 抓取的样本数                   |
| `scrape_series_added`                 | 新增时序数（估计）             |
| `scrape_series_current`               | 当前唯一时序数                 |
| `scrape_series_limit_samples_dropped` | 因超限丢弃的样本数             |

---

### 4.11 基数限制

#### Per-Target 限制

```bash
./vmagent -promscrape.seriesLimitPerTarget=10000
```

```yaml
scrape_configs:
  - job_name: 'high-cardinality'
    series_limit: 50000
```

#### 全局基数限制

```bash
./vmagent \
  -remoteWrite.maxHourlySeries=1000000 \
  -remoteWrite.maxDailySeries=10000000
```

---

### 4.12 磁盘持久化

**默认启用**：

```bash
./vmagent \
  -remoteWrite.tmpDataPath=vmagent-remotewrite-data \
  -remoteWrite.maxDiskUsagePerURL=10GB
```

**禁用磁盘持久化**：

```bash
./vmagent \
  -remoteWrite.disableOnDiskQueue \
  -remoteWrite.dropSamplesOnOverload
```

**行为**：过载时返回 429 或静默丢弃样本。

---

### 4.13 VictoriaMetrics Remote Write 协议

**优势**：网络带宽/磁盘 I/O/空间 减少 2x-5x

```bash
./vmagent \
  -remoteWrite.url=http://vm:8428/api/v1/write \
  -remoteWrite.forceVMProto \
  -remoteWrite.vmProtoCompressLevel=5
```

- 压缩级别范围：`-22` 到 `22`（默认 `0`）

---

### 4.14 性能优化

#### 降低 RAM 使用

```bash
GOGC=100 ./vmagent \
  -memory.allowedBytes=2GB \
  -promscrape.dropOriginalLabels \
  -promscrape.noStaleMarkers
```

#### 降低 CPU 使用

```bash
GOMAXPROCS=2 ./vmagent \
  -promscrape.disableKeepAlive
```

#### 增加吞吐量

```bash
./vmagent \
  -remoteWrite.queues=8 \
  -remoteWrite.maxBlockSize=16MB
```

---

### 4.15 监控与排查

**关键端点：**

- `http://vmagent:8429/metrics`：Prometheus 指标
- `http://vmagent:8429/targets`：所有抓取目标及状态
- `http://vmagent:8429/service-discovery`：服务发现状态
- `http://vmagent:8429/config`：当前配置
- `http://vmagent:8429/ready`：健康检查

**Grafana 仪表板**：[https://grafana.com/grafana/dashboards/12683](https://grafana.com/grafana/dashboards/12683)

**关键监控指标：**

- `vmagent_remotewrite_pending_data_bytes`：待发送数据大小
- `vmagent_remotewrite_samples_dropped_total`：丢弃的样本数
- `vmagent_remotewrite_push_failures_total`：写入失败次数

---

### 4.16 配置重载

```bash
# 方法 1：SIGHUP 信号
kill -SIGHUP $(pidof vmagent)

# 方法 2：HTTP 端点
curl -X POST http://vmagent:8429/-/reload

# 方法 3：自动检查
./vmagent -promscrape.configCheckInterval=30s
```

---

### 4.17 高可用配置

```bash
# vmagent 实例 1
./vmagent \
  -promscrape.config=prometheus.yml \
  -promscrape.cluster.name=cluster1 \
  -remoteWrite.url=http://storage:8428/api/v1/write

# vmagent 实例 2
./vmagent \
  -promscrape.cluster.name=cluster2 \
  -remoteWrite.url=http://storage:8428/api/v1/write
```

**VictoriaMetrics 端去重：**

```bash
./victoria-metrics -dedup.minScrapeInterval=15s
```

---

### 4.18 核心 Flag 总览

| Category       | 重要 Flag                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------- |
| **核心** | `-promscrape.config`、`-remoteWrite.url`、`-remoteWrite.tmpDataPath`                        |
| **抓取** | `-promscrape.seriesLimitPerTarget`、`-promscrape.streamParse`、`-promscrape.noStaleMarkers` |
| **写入** | `-remoteWrite.queues`、`-remoteWrite.maxBlockSize`、`-remoteWrite.shardByURL`               |
| **限制** | `-remoteWrite.maxHourlySeries`、`-maxLabelsPerTimeseries`、`-maxIngestionRate`              |
| **集群** | `-promscrape.cluster.membersCount/memberNum/replicationFactor/name`                             |

---

### 4.19 最佳实践

- **资源优化**：根据环境调整内存/CPU/吞吐量参数
- **可靠性**：HA 部署+去重、设置磁盘缓冲上限、监控磁盘使用
- **安全**：网络隔离+认证（Basic Auth/Bearer Token/mTLS）+最小权限
- **可观测性**：Grafana 仪表板+告警+调试端点

---

**🎯 第 4 章完成！** 下一步将继续学习 vmalert 组件...

---

---

## 第 5 章：vmalert - 告警与记录规则组件

### 5.1 vmalert 概述

**核心定位**：vmalert 是 VictoriaMetrics 生态中的告警与记录规则执行引擎，负责：

- 执行告警规则（Alerting Rules）和记录规则（Recording Rules）
- 对接 Alertmanager 发送告警通知
- 将记录规则结果持久化到远程存储
- 兼容 Prometheus 告警规则语法

**与 Prometheus Alertmanager 的关系**：

- vmalert 本身不发送告警通知，而是依赖 Alertmanager
- 支持与 Alertmanager v0.16.0-alpha 及以上版本集成
- 可配置多个 Alertmanager 实例实现高可用

**架构特点**：

```mermaid
graph LR
    A[vmalert] -->|查询表达式| B[Datasource<br/>VictoriaMetrics/vmselect]
    A -->|告警通知| C[Alertmanager]
    A -->|持久化状态| D[Remote Write<br/>VictoriaMetrics]
    A -->|恢复状态| E[Remote Read<br/>VictoriaMetrics]
```

---

### 5.2 核心特性

#### 5.2.1 数据源集成

**支持的数据源类型**：

1. **VictoriaMetrics 与 MetricsQL**：原生支持，性能最佳
2. **VictoriaLogs 与 LogsQL**：支持日志数据的告警
3. **Graphite**：支持 Graphite 表达式的告警和记录规则
4. **任意 Prometheus HTTP API 兼容数据源**

**数据源配置示例**：

```bash
# 单节点 VictoriaMetrics
-datasource.url=http://victoria-metrics:8428

# 集群模式 vmselect
-datasource.url=http://vmselect:8481/select/0/prometheus

# Graphite 数据源（需设置类型前缀）
-datasource.appendTypePrefix=true
```

#### 5.2.2 告警状态持久化

**状态持久化机制**：

- vmalert 默认在内存中保存告警状态
- 重启会丢失所有活动告警状态
- 通过配置远程读写可实现状态持久化

**持久化配置**：

```bash
./vmalert \
  -remoteWrite.url=http://victoria-metrics:8428 \  # 持久化状态
  -remoteRead.url=http://victoria-metrics:8428      # 恢复状态
```

**持久化数据**：

- `ALERTS` - 当前活动的告警
- `ALERTS_FOR_STATE` - 告警的 `for` 状态时间信息
- 恢复条件：时间序列在最近 1 小时内有更新（由 `-remoteRead.lookback` 控制）

#### 5.2.3 其他核心特性

- ✅ 支持规则回填（Backfilling/Replay）
- ✅ 可重用的注解模板（Reusable Templates）
- ✅ 从多种来源加载规则：本地文件、URL、GCS、S3
- ✅ 检测从不触发的告警规则
- ✅ 轻量级无额外依赖

---

### 5.3 快速开始

#### 5.3.1 基本配置要求

**必需配置**：

1. **规则列表**（`-rule`）：PromQL/MetricsQL 表达式配置文件
2. **数据源地址**（`-datasource.url`）：支持 Prometheus HTTP API 的端点

**可选配置**：
3. **Notifier 地址**（`-notifier.url`）：Alertmanager 实例地址
4. **Remote Write 地址**（`-remoteWrite.url`）：持久化规则和状态
5. **Remote Read 地址**（`-remoteRead.url`）：恢复告警状态

#### 5.3.2 启动示例

```bash
# 构建 vmalert
git clone https://github.com/VictoriaMetrics/VictoriaMetrics
cd VictoriaMetrics
make vmalert

# 启动 vmalert
./bin/vmalert \
  -rule=alert.rules \                          # 规则文件路径（支持通配符）
  -datasource.url=http://localhost:8428 \      # 数据源
  -notifier.url=http://localhost:9093 \        # Alertmanager URL
  -notifier.url=http://127.0.0.1:9093 \        # Alertmanager 副本
  -remoteWrite.url=http://localhost:8428 \     # 持久化地址
  -remoteRead.url=http://localhost:8428 \      # 恢复地址
  -external.label=cluster=east-1 \             # 外部标签
  -external.label=replica=a                    # 多个外部标签
```

#### 5.3.3 配置验证

**语法验证**：

```bash
# 使用 -dryRun 验证配置文件语法
./vmalert -rule=alert.rules -dryRun
```

**区分多个 vmalert 实例**：

- 使用 `-external.label` 标识不同的 vmalert 实例
- 如果规则结果与外部标签冲突，自动添加 `exported_` 前缀

---

### 5.4 规则配置

#### 5.4.1 规则文件结构

**YAML 配置格式**：

```yaml
groups:
  - name: <group_name>          # 组名，文件内唯一
    interval: <duration>        # 评估间隔（默认使用 -evaluationInterval）
    rules:
      - <rule_spec>             # 规则定义
```

#### 5.4.2 Group（规则组）配置

**Group 属性**：

```yaml
groups:
  - name: my_alert_group        # 必需：组名
    interval: 30s               # 可选：评估间隔
    eval_offset: 5m             # 可选：评估时间偏移
    eval_delay: 30s             # 可选：补偿数据延迟
    limit: 1000                 # 可选：单规则结果数量限制
    concurrency: 4              # 可选：组内规则并发数（默认 1）
    type: prometheus            # 可选：规则类型（prometheus/graphite/vlogs）
    eval_alignment: true        # 可选：评估时间对齐（默认 true）
  
    # 可选：请求参数（应用于组内所有规则）
    params:
      nocache: ["1"]                     # 禁用缓存
      denyPartialResponse: ["true"]      # 拒绝部分响应
      extra_label: ["env=dev"]           # 额外标签过滤
  
    # 可选：HTTP 请求头
    headers:
      - "CustomHeader: foo"
  
    # 可选：告警通知头
    notifier_headers:
      - "TenantID: foo"
  
    # 可选：组级标签（高于外部标签）
    labels:
      env: production
      team: platform
  
    # 可选：调试模式
    debug: false
  
    rules:
      - ...
```

**重要参数说明**：

1. **`eval_offset`**：指定评估的精确时间偏移

   - 例如 `interval: 1h` + `eval_offset: 5m` → 在每小时的第 5 分钟评估
   - 与 `eval_delay` 互斥
2. **`eval_delay`**：补偿数据源的查询延迟

   - 默认继承自 `-rule.evalDelay`（默认 30s）
   - 建议与 VictoriaMetrics 的 `-search.latencyOffset` 保持一致
3. **`concurrency`**：组内规则并发执行数

   - 提高并发可缩短组的评估时长
   - 监控指标：`vmalert_iteration_duration_seconds`
4. **`eval_alignment`**（默认 `true`）：

   - 评估时间戳对齐到组的 interval
   - 使结果更可预测，与 Grafana/vmui 图表对齐

#### 5.4.3 告警规则（Alerting Rules）

**语法**：

```yaml
- alert: <alert_name>           # 告警名称，必须是有效的 metric 名称
  expr: <expression>            # 表达式，根据 type 使用 PromQL/MetricsQL/Graphite
  
  for: <duration>               # 可选：触发延迟（默认 0s）
  keep_firing_for: <duration>   # 可选：延迟告警解除（默认 0s）
  
  debug: <bool>                 # 可选：调试模式
  update_entries_limit: <int>   # 可选：状态更新条目数量限制
  
  labels:                       # 可选：添加/覆盖标签
    severity: warning
    team: platform
  
  annotations:                  # 可选：注解（可使用模板）
    summary: "Instance {{ $labels.instance }} down"
    description: "{{ $labels.job }} has been down for {{ $value }} seconds"
```

**告警规则示例**：

```yaml
groups:
  - name: instance_down
    interval: 30s
    rules:
      - alert: InstanceDown
        expr: up == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Instance {{ $labels.instance }} is down"
          description: "{{ $labels.job }} has been unavailable for over 5 minutes"
```

**重要参数说明**：

1. **`for`**：告警触发延迟

   - `for: 0` 或未设置：表达式返回结果立即触发
   - `for > 0`：表达式连续返回结果超过指定时长才触发
   - 状态转换：`inactive` → `pending` → `firing`
2. **`keep_firing_for`**：延迟告警解除

   - 即使表达式不再返回结果，告警仍持续 firing
   - 用于 CPU 峰值等短暂事件
3. **`labels` vs `annotations`**：

   - **labels**：用于唯一标识告警，不要使用动态值（如 `$value`）
   - **annotations**：可包含任意动态数据或模板

#### 5.4.4 记录规则（Recording Rules）

**语法**：

```yaml
- record: <metric_name>         # 输出的时间序列名称
  expr: <expression>            # 表达式
  
  labels:                       # 可选：添加标签
    <label_name>: <label_value>
  
  debug: <bool>                 # 可选：调试模式
  update_entries_limit: <int>   # 可选：状态更新条目限制
```

**记录规则示例**：

```yaml
groups:
  - name: http_requests_recording
    interval: 30s
    rules:
      - record: job:http_requests:rate5m
        expr: sum(rate(http_requests_total[5m])) by (job)
        labels:
          aggregation: rate5m
```

**使用场景**：

- 预计算频繁查询的复杂表达式
- 降采样和聚合历史数据
- 减少查询响应时间

**注意事项**：

- 需要配置 `-remoteWrite.url` 才能生效
- 避免规则链式依赖（规则组内顺序执行但持久化异步）

---

### 5.5 模板系统

#### 5.5.1 模板变量

**可用变量**：

| 变量                                                                                | 描述           | 示例                                        |
| ----------------------------------------------------------------------------------- | -------------- | ------------------------------------------- |
| `$value` / `.Value` | 当前告警的值 | `Number of connections is {{ $value }}`  |                |                                             |
| `$activeAt` / `.ActiveAt` | 告警激活时间 | `{{ $activeAt.UnixMilli }}`        |                |                                             |
| `$labels` / `.Labels`                                                           | 告警标签列表   | `{{ .Labels.instance }}`                  |
| `$type` / `.Type`                                                               | 规则类型       | `{{ .Type }}` (prometheus/graphite/vlogs) |
| `$alertID` / `.AlertID`                                                         | 告警 ID        | `{{ .AlertID }}`                          |
| `$groupID` / `.GroupID`                                                         | 组 ID          | `{{ .GroupID }}`                          |
| `$expr` / `.Expr` | 告警表达式 | `{{ $expr\|queryEscape }}`                    |                |                                             |
| `$for` / `.For`                                                                 | `for` 参数值 | `{{ .For }}`                              |
| `$externalLabels` / `.ExternalLabels` | 外部标签 | `{{ $externalLabels.dc }}` |                |                                             |
| `$externalURL` / `.ExternalURL` | 外部 URL | `{{ $externalURL }}`             |                |                                             |

#### 5.5.2 模板函数

**常用函数**：

- **`query`**：执行 MetricsQL 查询

  ```go
  {{ query "sort_desc(process_resident_memory_bytes)" | first | value }}
  ```

- **`humanize`**：人性化数值显示（100000 → 100K）
- **`humanizeDuration`**：格式化持续时间
- **`humanizeTimestamp`**：格式化时间戳
- **`parseDuration`**：解析时长字符串
- **`toTime`**：转换 Unix 时间戳为 time.Time
- **`queryEscape`** / **`pathEscape`**：URL 编码
- **`jsonEscape`**：JSON 编码
- **`stripDomain`**：保留域名首部（foo.bar.baz → foo）
- **`stripPort`**：移除端口（host:port → host）

#### 5.5.3 可重用模板

**定义模板文件**（`grafana-templates.tpl`）：

```go
{{ define "grafana.filter" -}}
  {{- $labels := .arg0 -}}
  {{- range $name, $label := . -}}
    {{- if (ne $name "arg0") -}}
      {{- ( or (index $labels $label) "All" ) | printf "&var-%s=%s" $label -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
```

**使用模板**：

```yaml
# 启动时加载模板文件
./vmalert -rule.templates=/path/to/*.tpl

# 在规则中使用
groups:
  - name: AlertGroupName
    rules:
      - alert: AlertName
        expr: any_metric > 100
        annotations:
          dashboard: '{{ $externalURL }}/d/dashboard?orgId=1{{ template "grafana.filter" (args .CommonLabels "account_id") }}'
```

**模板文件热重载**：

- 支持通过 `-rule.templates` 加载多个模板文件
- 支持通配符（`dir/*.tpl`、`dir/**/*.tpl`）
- 支持热重载

---

### 5.6 告警源链接

#### 5.6.1 默认链接格式

**默认链接**：

```
http://<vmalert-addr>/vmalert/alert?group_id=<group_id>&alert_id=<alert_id>
```

**自定义链接到 vmui**：

```bash
./bin/vmalert \
  -external.url=http://<vmui-addr> \
  -external.alert.source='vmui/#/?g0.expr={{.Expr|queryEscape}}'
```

#### 5.6.2 Grafana 集成链接

**链接到 Grafana Explore**：

```bash
./bin/vmalert \
  -external.url=http://<grafana-addr> \
  -external.alert.source='explore?left={"datasource":"{{ if eq .Type \"vlogs\" }}VictoriaLogs{{ else }}VictoriaMetrics{{ end }}","queries":[{"expr":{{ .Expr|jsonEscape|queryEscape }},"refId":"A"}],"range":{"from":"{{ .ActiveAt.UnixMilli }}","to":"now"}}'
```

**链接说明**：

- 根据规则类型（`vlogs` / 其他）选择不同数据源
- 自动填充表达式到 Grafana Explore
- 时间范围从告警激活时刻到当前

---

### 5.7 多租户支持

#### 5.7.1 方案一：独立实例

**每租户运行独立 vmalert**：

```bash
# 租户 123
/path/to/vmalert \
  -datasource.url=http://vmselect:8481/select/123/prometheus \
  -remoteWrite.url=http://vminsert:8480/insert/123/prometheus

# 租户 456:789
/path/to/vmalert \
  -datasource.url=http://vmselect:8481/select/456:789/prometheus \
  -remoteWrite.url=http://vminsert:8480/insert/456:789/prometheus
```

#### 5.7.2 方案二：Multitenant 端点

**使用 multitenant 端点 + 组级 params**：

```bash
./vmalert \
  -datasource.url=http://vmselect:8481/select/multitenant/prometheus \
  -remoteWrite.url=http://vminsert:8480/insert/multitenant/prometheus
```

**规则配置**：

```yaml
groups:
  - name: rules_for_tenant_456:789
    params:
      extra_label: ["vm_account_id=456,vm_project_id=789"]
    rules:
      - alert: ...
```

> ⚠️ **性能提示**：multitenant 端点性能低于直接指定租户 URL

#### 5.7.3 方案三：Enterprise 集群模式

**启用集群模式**（Enterprise 版本）：

```bash
./vmalert \
  -clusterMode \
  -datasource.url=http://vmselect:8481 \        # 不含租户 ID
  -remoteWrite.url=http://vminsert:8480 \
  -defaultTenant.prometheus=123                  # 默认租户
```

**规则配置**：

```yaml
groups:
  - name: rules_for_tenant_123
    tenant: "123"
    rules:
      - alert: ...

  - name: rules_for_tenant_456:789
    tenant: "456:789"
    rules:
      - alert: ...
```

**集群模式特性**：

- 自动为每个组添加租户 ID 到 URL
- 告警结果包含 `vm_account_id` 和 `vm_project_id` 标签
- 可在模板中使用租户标签
- 支持 `-defaultTenant.prometheus` / `-defaultTenant.graphite`

---

### 5.8 拓扑示例

#### 5.8.1 单节点 VictoriaMetrics

```bash
./bin/vmalert -rule=rules.yml \
  -datasource.url=http://victoriametrics:8428 \
  -remoteWrite.url=http://victoriametrics:8428 \
  -remoteRead.url=http://victoriametrics:8428 \
  -notifier.url=http://alertmanager:9093
```

```mermaid
graph TB
    A[vmalert] -->|执行规则| B[VictoriaMetrics<br/>Single]
    A -->|持久化状态| B
    A -->|恢复状态| B
    A -->|告警通知| C[Alertmanager]
```

#### 5.8.2 集群 VictoriaMetrics

```bash
./bin/vmalert -rule=rules.yml \
  -datasource.url=http://vmselect:8481/select/0/prometheus \
  -remoteWrite.url=http://vminsert:8480/insert/0/prometheus \
  -remoteRead.url=http://vmselect:8481/select/0/prometheus \
  -notifier.url=http://alertmanager:9093
```

```mermaid
graph TB
    A[vmalert] -->|查询| B[vmselect]
    A -->|写入| C[vminsert]
    A -->|恢复| B
    A -->|告警| D[Alertmanager]
    C --> E[vmstorage]
    B --> E
```

#### 5.8.3 高可用 vmalert

**配置多个相同的 vmalert 实例**：

```bash
# 实例 1
./bin/vmalert -rule=rules.yml \
  -datasource.url=http://victoriametrics:8428 \
  -remoteWrite.url=http://victoriametrics:8428 \
  -remoteRead.url=http://victoriametrics:8428 \
  -notifier.url=http://alertmanager1:9093 \
  -notifier.url=http://alertmanagerN:9093

# 实例 2（配置相同）
./bin/vmalert -rule=rules.yml \
  ...
```

**去重配置**：

- VictoriaMetrics 端启用去重：

  ```bash
  ./victoria-metrics -dedup.minScrapeInterval=1m
  ```

- 建议 `-dedup.minScrapeInterval` ≥ vmalert 的 `-evaluationInterval`
- Alertmanager 自动去重相同标签的告警

```mermaid
graph TB
    A1[vmalert 实例1] -->|规则评估| VM[VictoriaMetrics<br/>with Dedup]
    A2[vmalert 实例2] -->|规则评估| VM
    A1 -->|告警| AM1[Alertmanager 1]
    A1 -->|告警| AM2[Alertmanager N]
    A2 -->|告警| AM1
    A2 -->|告警| AM2
```

#### 5.8.4 降采样与聚合

**使用 vmalert 进行数据聚合**：

```bash
./bin/vmalert -rule=downsampling-rules.yml \
  -datasource.url=http://raw-cluster-vmselect:8481/select/0/prometheus \
  -remoteWrite.url=http://aggregated-cluster-vminsert:8480/insert/0/prometheus
```

**降采样规则示例**：

```yaml
groups:
  - name: downsampling
    interval: 5m              # 5 分钟评估一次 = 降低分辨率
    rules:
      - record: http_requests:avg5m
        expr: avg_over_time(http_requests[5m])
```

**使用场景**：

- "热"集群：低保留期、高速磁盘、用于实时监控
- "冷"集群：长期保留、较慢/便宜磁盘、低分辨率数据
- vmalert 从"热"集群读取，处理后写入"冷"集群

```mermaid
graph LR
    A[Raw Cluster<br/>高分辨率] -->|规则查询| B[vmalert]
    B -->|聚合结果| C[Aggregated Cluster<br/>低分辨率]
```

#### 5.8.5 多目标 Remote Write

**使用 vmagent 作为扇出代理**：

```bash
# vmalert 写入到 vmagent
./bin/vmalert -rule=rules.yml \
  -remoteWrite.url=http://vmagent:8429/api/v1/write

# vmagent 扇出到多个目标
./bin/vmagent \
  -remoteWrite.url=http://vm-cluster1:8428/api/v1/write \
  -remoteWrite.url=http://vm-cluster2:8428/api/v1/write
```

```mermaid
graph LR
    A[vmalert] -->|规则结果| B[vmagent<br/>扇出代理]
    B --> C[VictoriaMetrics 1]
    B --> D[VictoriaMetrics 2]
```

**优势**：

- vmagent 提供数据持久化缓冲
- 支持 Relabeling 修改时间序列
- 简化 vmalert 配置

---

### 5.9 Web 界面与 API

#### 5.9.1 Web UI

**访问地址**：`http://<vmalert-addr>`

**主要功能**：

- Groups 列表：查看所有规则组和规则
- Alerts 页面：查看活跃告警
- 规则详情页：查看规则状态和最近更新

#### 5.9.2 API 端点

| 端点                                              | 描述                         |
| ------------------------------------------------- | ---------------------------- |
| `/api/v1/rules`                                 | 所有组和规则列表（支持过滤） |
| `/api/v1/alerts`                                | 所有活跃告警                 |
| `/api/v1/notifiers`                             | 所有可用的 notifier          |
| `/vmalert/api/v1/alert?group_id=<>&alert_id=<>` | 获取告警状态（JSON）         |
| `/vmalert/api/v1/rule?group_id=<>&rule_id=<>`   | 获取规则状态（JSON）         |
| `/vmalert/api/v1/group?group_id=<>`             | 获取组状态（JSON）           |
| `/vmalert/alert?group_id=<>&alert_id=<>`        | 告警状态（Web UI）           |
| `/vmalert/rule?group_id=<>&rule_id=<>`          | 规则状态（Web UI）           |
| `/metrics`                                      | 应用指标                     |
| `/-/reload`                                     | 热重载配置                   |

#### 5.9.3 与 VictoriaMetrics 集成

**单节点访问 vmalert**：

```
http://victoria-metrics:8428/select/0/prometheus/vmalert/
```

**集群版访问 vmalert**：

```bash
# 配置 vmselect
./vmselect -vmalert.proxyURL=http://vmalert:8880

# 访问
http://vmselect:8481/select/0/prometheus/vmalert/
```

**用途**：

- 与 Grafana Unified Alerting 集成
- 通过 vmui 访问 vmalert UI

---

### 5.10 规则回填（Replay）

#### 5.10.1 回填机制

**核心概念**：

- vmalert 可在指定时间范围内重新评估规则
- 将历史结果通过 Remote Write 回填到存储
- 用于历史数据转换或修复

**工作模式**：

- 作为 CLI 工具运行，完成后退出
- 组内规则顺序执行（忽略 `concurrency` 设置）
- 自动发送 `nocache=1` 防止缓存污染

#### 5.10.2 回填示例

```bash
./bin/vmalert -rule=path/to/your.rules \
  -datasource.url=http://localhost:8428 \
  -remoteWrite.url=http://localhost:8428 \
  -replay.timeFrom=2021-05-11T07:21:43Z \
  -replay.timeTo=2021-05-29T18:40:43Z
```

**输出示例**：

```
Replay mode:
from:   2021-05-11 07:21:43 +0000 UTC
to:     2021-05-29 18:40:43 +0000 UTC
max data points per request: 1000

Group "ReplayGroup"
interval:       1m0s
requests to make:       27
max range per request:  16h40m0s
> Rule "type:vm_cache_entries:rate5m"
27 / 27 [------------------------------------] 100.00% 78 p/s
```

#### 5.10.3 回填配置参数

| Flag                                  | 说明                       | 默认值   |
| ------------------------------------- | -------------------------- | -------- |
| `-replay.timeFrom`                  | 回填起始时间（RFC3339）    | 必需     |
| `-replay.timeTo`                    | 回填结束时间（RFC3339）    | 当前时间 |
| `-replay.maxDatapointsPerQuery`     | 单请求最大数据点数         | 1000     |
| `-replay.ruleRetryAttempts`         | 失败重试次数               | 5        |
| `-replay.rulesDelay`                | 规则间延迟（用于链式规则） | 1s       |
| `-replay.disableProgressBar`        | 禁用进度条                 | false    |
| `-replay.ruleEvaluationConcurrency` | 并发查询数                 | 1        |

**注意事项**：

- 记录规则回填结果应与正常评估一致
- 告警规则回填产生 `ALERTS` 和 `ALERTS_FOR_STATE` 时间序列
- Graphite 引擎暂不支持
- `query` 模板函数在回填时禁用

#### 5.10.4 缓存处理

**问题**：回填可能受响应缓存影响

**解决方案**：

1. 回填期间禁用缓存
2. 回填后重置缓存内容

---

### 5.11 监控与调试

#### 5.11.1 监控指标

**关键指标**：

- `vmalert_iteration_duration_seconds`：组评估耗时
- `vmalert_recording_rules_last_evaluation_samples`：记录规则返回的序列数
- `vmalert_alerting_rules_last_evaluation_series_fetched`：告警规则匹配的序列数
- `vmalert_alerts_pending`：pending 状态的告警数
- `vmalert_alerts_firing`：firing 状态的告警数
- `vmalert_alerts_sent_*`：发送的告警通知数

**推荐告警规则**：

```yaml
# 记录规则无数据
- alert: RecordingRulesNoData
  expr: vmalert_recording_rules_last_evaluation_samples < 1
  annotations:
    summary: "Recording rule {{ $labels.recording }} produces no data"

# 告警规则从不触发
- alert: NeverFiringAlerts
  expr: max(vmalert_alerting_rules_last_evaluation_series_fetched) by(group, alertname) == 0
  annotations:
    summary: "Alert {{ $labels.alertname }} never fires"

# 评估耗时过长
- alert: SlowRuleEvaluation
  expr: vmalert_iteration_duration_seconds > 60
  annotations:
    summary: "Group {{ $labels.group }} evaluation takes {{ $value }}s"
```

#### 5.11.2 官方 Grafana Dashboard

**Dashboard ID**：14950

**包含内容**：

- 规则评估统计
- 告警状态跟踪
- Notifier 健康状态
- Remote Write/Read 性能

#### 5.11.3 规则状态调试

**查看规则最近更新**：

1. 打开 vmalert Web UI
2. 进入 `Groups` 标签
3. 点击规则旁的 `Details` 链接
4. 查看 "Last N updates" 部分

**状态属性**：

- **Updated at**：实际评估时间
- **Execution timestamp**：发送给数据源的 `time` 参数
- **Series returned**：评估返回的序列数
  - 记录规则：0 表示无结果
  - 告警规则：0 表示 inactive 状态
- **Series fetched**：扫描的序列数（用于检测从不触发的告警）
- **Duration**：评估耗时
- **cURL**：示例 HTTP 请求（用于调试）

#### 5.11.4 调试模式

**启用方式**：

```yaml
groups:
  - name: TestGroup
    debug: true        # 组级调试
    rules:
      - alert: Conns
        expr: ...
        debug: true    # 规则级调试（覆盖组级）
```

**调试日志示例**：

```
2022-09-15T13:35:41.155Z  DEBUG alerting rule "TestGroup":"Conns" at 2022-09-15T15:35:41+02:00: query returned 0 series (elapsed: 5.896041ms, isPartial: false)
2022-09-15T13:35:56.149Z  DEBUG datasource request: executing POST request with params "query=sum(vm_tcplistener_conns)&step=15s&time=1663248945"
2022-09-15T13:35:56.179Z  DEBUG alerting rule "TestGroup":"Conns": alert 10705778000901301787 created in state PENDING
2022-09-15T13:36:56.153Z  DEBUG alerting rule "TestGroup":"Conns": alert 10705778000901301787 PENDING => FIRING
```

**日志级别要求**：

```bash
./vmalert -loggerLevel=INFO  # 确保可以看到 DEBUG 输出
```

---

### 5.12 常见问题与最佳实践

#### 5.12.1 常见错误

**1. 组的 interval 设置不当**

```yaml
# ❌ 错误：interval 小于数据分辨率
groups:
  - name: my_group
    interval: 10s          # 数据每分钟才有一个点
    rules:
      - alert: ...
        expr: rate(metric[5m])

# ✅ 正确：interval ≥ 数据分辨率
groups:
  - name: my_group
    interval: 1m
```

**2. labels 使用动态值**

```yaml
# ❌ 错误：标签使用动态值
- alert: HighMemory
  expr: memory_usage > 80
  labels:
    value: "{{ $value }}"    # 每次值变化产生新告警

# ✅ 正确：动态值放在 annotations
- alert: HighMemory
  expr: memory_usage > 80
  labels:
    severity: warning
  annotations:
    current_value: "{{ $value }}"
```

**3. 缺失 lookbehind-window**

```yaml
# ❌ 错误：缺失 lookbehind-window
expr: rate(errors_total) > 0

# ✅ 正确：显式指定 lookbehind-window
expr: rate(errors_total[5m]) > 0
```

**建议**：lookbehind-window ≥ 2× 数据分辨率

**4. subquery 缺失 step**

```yaml
# ❌ 错误：subquery 缺失 step
expr: sum(count_over_time((metric == 0)[1h:]))

# ✅ 正确：指定 step
expr: sum(count_over_time((metric == 0)[1h:1m]))
```

#### 5.12.2 数据延迟处理

**问题**：数据在数据源中延迟，导致评估时无数据

**解决方案**：

1. **调整 `-rule.evalDelay`**（默认 30s）

   ```bash
   ./vmalert -rule.evalDelay=1m  # 延迟 1 分钟再评估
   ```

2. **增加 lookbehind-window**

   ```yaml
   # 容忍 10 分钟内的数据延迟
   expr: max_over_time(node_memory_MemAvailable_bytes[10m]) > 0
   ```

3. **使用 `eval_delay` 覆盖组设置**

   ```yaml
   groups:
     - name: slow_metrics
       eval_delay: 2m
   ```

4. **VictoriaMetrics 端调整 `-search.latencyOffset`**

   ```bash
   ./vmselect -search.latencyOffset=1m
   ```

#### 5.12.3 抖动告警（Flapping Alerts）

**问题**：告警频繁在 inactive 和 firing 之间切换

**解决方案**：

1. **增加 `for` 延迟**

   ```yaml
   - alert: HighCPU
     expr: cpu_usage > 80
     for: 5m              # 持续 5 分钟才触发
   ```

2. **增大 lookbehind-window**

   ```yaml
   # 至少 2× scrape_interval
   expr: rate(http_errors_total[2m]) > 0
   ```

3. **使用 `keep_firing_for`**

   ```yaml
   - alert: CPUSpike
     expr: cpu_usage > 90
     keep_firing_for: 5m  # 延迟 5 分钟再解除
   ```

4. **检测抖动告警**

   ```yaml
   - alert: FlappingAlert
     expr: max(changes(vmalert_alerts_firing[24h])) by(group, alertname) > 10
     annotations:
       summary: "Alert {{ $labels.alertname }} flapped {{ $value }} times in 24h"
   ```

#### 5.12.4 从不触发的告警

**检测**：

```yaml
- alert: NeverFiringAlert
  expr: max(vmalert_alerting_rules_last_evaluation_series_fetched) by(group, alertname) == 0
  annotations:
    summary: "Alert {{ $labels.alertname }} matches no series"
```

**原因**：

- 选择器不匹配任何时间序列
- 标签拼写错误（如 `env=prodd` 应为 `env=prod`）
- job 名称错误

**调试步骤**：

1. 查看规则详情页的 **Series fetched** 字段
2. 使用 cURL 示例手动查询验证
3. 检查选择器语法

#### 5.12.5 相同 labelset 冲突

**错误信息**：

```
result contains metrics with the same labelset during evaluation
```

**原因**：评估后产生重复的标签集

**示例**：

```yaml
# ❌ 产生冲突
expr: {__name__=~"vmalert_alerts_.*"} > 0

# 返回：
# {__name__="vmalert_alerts_pending", job="vmalert", alertname="A"} 12
# {__name__="vmalert_alerts_firing", job="vmalert", alertname="A"} 0
# 评估后 __name__ 被丢弃 → 标签集重复
```

**解决方案**：

```yaml
# ✅ 使用 label_replace 保留区分标签
expr: label_replace({__name__=~"vmalert_alerts_.*"}, "state", "$1", "__name__", "vmalert_alerts_(.*)")
```

#### 5.12.6 规则链式依赖

**问题**：规则 B 依赖规则 A 的结果

**原因**：

- 规则组内顺序执行
- 但持久化到 Remote Write 是异步的
- 规则 B 可能查询不到规则 A 的结果

**解决方案**：

1. **使用不同组并设置顺序**

   ```yaml
   groups:
     - name: step1
       interval: 1m
       rules:
         - record: http_requests:rate5m
           expr: rate(http_requests[5m])

     - name: step2
       interval: 1m
       rules:
         - record: http_requests:rate5m:sum
           expr: sum(http_requests:rate5m)  # 依赖 step1
   ```

2. **确保 interval < 5m**（默认 `-datasource.queryStep`）

   ```yaml
   groups:
     - name: step1
       interval: 2m      # < 5m 才能被后续查询
   ```

3. **调整 `-datasource.queryStep`**

   ```bash
   ./vmalert -datasource.queryStep=10m  # 扩大查询回溯窗口
   ```

4. **使用 `params.step`**

   ```yaml
   groups:
     - name: step2
       params:
         step: ["10m"]   # 确保能查到 step1 的结果
   ```

#### 5.12.7 性能优化

**1. 调整并发度**

```yaml
groups:
  - name: high_concurrency_group
    concurrency: 8        # 加速组评估
```

**2. 调整 datasource 连接池**

```bash
./vmalert \
  -datasource.maxIdleConnections=100 \      # 建议：groups_total * group.concurrency
  -datasource.idleConnTimeout=50s
```

**3. 监控评估耗时**

```yaml
- alert: SlowGroupEvaluation
  expr: vmalert_iteration_duration_seconds > 30
  annotations:
    summary: "Group {{ $labels.group }} evaluation too slow: {{ $value }}s"
```

**4. 启用结果数量限制**

```yaml
groups:
  - name: limited_group
    limit: 1000          # 限制单规则产生的序列数
```

#### 5.12.8 安全建议

**1. 启用 mTLS**（Enterprise）

```bash
./vmalert -tls -mtls -mtlsCAFile=/path/to/ca.pem
```

**2. 限制敏感信息暴露**

```bash
# 不展示 URL 敏感信息
./vmalert \
  -datasource.showURL=false \
  -remoteWrite.showURL=false \
  -notifier.showURL=false
```

**3. 使用认证**

```bash
./vmalert \
  -httpAuth.username=admin \
  -httpAuth.password=secure_password
```

**4. 限制 Web UI 访问**

- 使用反向代理限制访问
- 配置防火墙规则
- 使用 VPN 或内网隔离

---

### 5.13 核心 Flag 总览

#### 5.13.1 必需参数

| Flag                | 说明                                      |
| ------------------- | ----------------------------------------- |
| `-datasource.url` | 数据源 URL（Prometheus HTTP API 兼容）    |
| `-rule`           | 规则文件路径（支持通配符、HTTP、S3、GCS） |

#### 5.13.2 可选参数

**数据源配置**：

- `-datasource.basicAuth.username`：Basic Auth 用户名
- `-datasource.basicAuth.password`：Basic Auth 密码
- `-datasource.bearerToken`：Bearer Token
- `-datasource.headers`：自定义 HTTP 头
- `-datasource.queryStep`：查询步长（默认 5m）
- `-datasource.roundDigits`：响应值精度
- `-datasource.tlsCAFile`：TLS CA 文件
- `-datasource.tlsCertFile`：TLS 证书文件
- `-datasource.appendTypePrefix`：根据查询类型添加前缀

**Notifier 配置**：

- `-notifier.url`：Alertmanager URL（可多个）
- `-notifier.config`：Notifier 配置文件（支持服务发现）
- `-notifier.blackhole`：黑洞模式（不发送通知）
- `-notifier.basicAuth.*`：Basic Auth 配置
- `-notifier.bearerToken`：Bearer Token
- `-notifier.headers`：自定义 HTTP 头

**Remote Write 配置**：

- `-remoteWrite.url`：持久化 URL
- `-remoteWrite.concurrency`：写入并发数（默认 `2*cpu`）
- `-remoteWrite.maxBatchSize`：最大批量大小（默认 10000）
- `-remoteWrite.maxQueueSize`：最大队列大小（默认 100000）
- `-remoteWrite.flushInterval`：刷新间隔（默认 2s）
- `-remoteWrite.basicAuth.*`：Basic Auth 配置

**Remote Read 配置**：

- `-remoteRead.url`：恢复状态 URL
- `-remoteRead.lookback`：状态回溯时长（默认 1h）
- `-remoteRead.basicAuth.*`：Basic Auth 配置

**规则评估配置**：

- `-evaluationInterval`：默认评估间隔（默认 1m）
- `-rule.evalDelay`：评估延迟（默认 30s）
- `-rule.maxResolveDuration`：最大自动解除时长
- `-rule.resendDelay`：重发告警最小间隔
- `-rule.resultsLimit`：规则结果数量限制
- `-rule.updateEntriesLimit`：状态更新条目限制（默认 20）
- `-rule.templates`：模板文件路径

**External 配置**：

- `-external.url`：外部 URL（用于告警源链接）
- `-external.label`：外部标签（可多个）
- `-external.alert.source`：自定义告警源链接模板

**多租户配置**（Enterprise）：

- `-clusterMode`：启用集群模式
- `-defaultTenant.prometheus`：默认 Prometheus 租户
- `-defaultTenant.graphite`：默认 Graphite 租户

**Replay 配置**：

- `-replay.timeFrom`：回填起始时间
- `-replay.timeTo`：回填结束时间
- `-replay.maxDatapointsPerQuery`：单请求数据点限制
- `-replay.rulesDelay`：规则间延迟
- `-replay.ruleRetryAttempts`：重试次数
- `-replay.disableProgressBar`：禁用进度条

**HTTP 配置**：

- `-httpListenAddr`：HTTP 监听地址（默认 `:8880`）
- `-httpAuth.username`：HTTP Basic Auth 用户名
- `-httpAuth.password`：HTTP Basic Auth 密码

**日志与监控**：

- `-loggerLevel`：日志级别（INFO/WARN/ERROR/FATAL）
- `-loggerFormat`：日志格式（default/json）
- `-metrics.exposeMetadata`：暴露 TYPE 和 HELP 元数据

**企业功能**：

- `-tls` / `-mtls`：启用 TLS/mTLS
- `-tlsCertFile` / `-tlsKeyFile`：TLS 证书和密钥
- `-s3.credsFilePath`：S3/GCS 凭证文件
- `-s3.customEndpoint`：自定义 S3 端点（MinIO）

---

### 5.14 总结

**vmalert 核心优势**：

1. ✅ 完全兼容 Prometheus 告警规则语法
2. ✅ 支持告警状态持久化和恢复
3. ✅ 灵活的数据源支持（MetricsQL、LogsQL、Graphite）
4. ✅ 强大的模板系统和可重用模板
5. ✅ 多租户支持（Enterprise）
6. ✅ 规则回填能力
7. ✅ 丰富的监控指标和调试工具
8. ✅ 高可用部署方案

**典型使用场景**：

- 基于 MetricsQL 的告警监控
- 预计算复杂查询（记录规则）
- 历史数据降采样和聚合
- 多数据中心告警管理
- 日志告警（VictoriaLogs）

**与 Prometheus Alertmanager 的协作**：

- vmalert：规则评估 + 状态管理
- Alertmanager：通知路由 + 聚合 + 抑制 + 静默

**🎯 第 5 章完成！** 下一步将继续学习 vmauth 组件...

---

---

## 第 6 章：vmauth - 认证与路由组件

### 6.1 vmauth 概述

**核心定位**：vmauth 是一个 HTTP 代理，提供以下功能：

- **认证（Authorization）**：验证客户端身份
- **路由（Routing）**：根据请求特征转发到不同后端
- **负载均衡（Load Balancing）**：在多个后端之间分配请求

**典型架构**：

```mermaid
graph LR
    A[客户端] -->|认证+路由| B[vmauth<br/>:8427]
    B -->|负载均衡| C[Backend 1]
    B -->|负载均衡| D[Backend 2]
    B -->|负载均衡| E[Backend N]
```

**启动方式**：

```bash
# 基本启动
/path/to/vmauth -auth.config=/path/to/auth/config.yml

# 默认监听端口：8427（可通过 -httpListenAddr 修改）
```

---

### 6.2 核心功能

#### 6.2.1 认证机制

vmauth 支持以下 5 种认证方式：

| 认证方式                | 配置字段                    | HTTP Header                   | 说明                         |
| ----------------------- | --------------------------- | ----------------------------- | ---------------------------- |
| **无认证**        | `unauthorized_user`       | -                             | 允许无凭据访问               |
| **Basic Auth**    | `username` + `password` | `Authorization: Basic ...`  | 用户名密码认证               |
| **Bearer Token**  | `bearer_token`            | `Authorization: Bearer ...` | Token 认证                   |
| **mTLS**          | `mtls`                    | -                             | 客户端证书认证（Enterprise） |
| **自定义 Header** | `auth_token`              | 自定义 Header                 | 任意认证 Token               |

**Basic Auth 示例**：

```yaml
users:
  - username: foo
    password: bar
    url_prefix: "http://victoria-metrics:8428/"
```

**Bearer Token 示例**：

```yaml
users:
  - bearer_token: ABCDEF123456
    url_prefix: "http://victoria-metrics:8428/"
```

**mTLS 示例**（Enterprise）：

```yaml
users:
  - mtls:
      organizational_unit: finance  # OU 字段匹配
    url_prefix: "http://victoriametrics-finance:8428"
  - mtls:
      organization: devops          # O 字段匹配
    url_prefix: "http://victoriametrics-devops:8428"
```

#### 6.2.2 路由机制

vmauth 可根据以下请求特征进行路由：

| 路由依据              | 配置字段           | 示例                 |
| --------------------- | ------------------ | -------------------- |
| **请求路径**    | `src_paths`      | `/api/v1/write`    |
| **请求主机**    | `src_hosts`      | `app1.example.com` |
| **查询参数**    | `src_query_args` | `db=foo`           |
| **HTTP Header** | `src_headers`    | `TenantID: 42`     |

**路径路由示例**：

```yaml
unauthorized_user:
  url_map:
    - src_paths:
        - "/app1/.*"
      drop_src_path_prefix_parts: 1
      url_prefix: "http://app1-backend/"
    - src_paths:
        - "/app2/.*"
      drop_src_path_prefix_parts: 1
      url_prefix: "http://app2-backend/"
  # 默认路由（不匹配时）
  default_url: "http://some-backend/404-page.html"
```

**多条件组合路由**：

```yaml
unauthorized_user:
  url_map:
    - src_paths: ["/app/.*"]
      src_hosts: [".+\\.bar\\.baz"]       # 主机名以 .bar.baz 结尾
      src_query_args: ["db=abc"]           # 包含 db=abc 参数
      src_headers: ["TenantID: 42"]        # TenantID header 为 42
      url_prefix: "http://app1-backend/"
```

#### 6.2.3 负载均衡

**两种负载均衡策略**：

1. **`least_loaded`**（默认）：最少负载轮询

   ```yaml
   unauthorized_user:
     url_prefix:
       - "http://backend-1:8428/"
       - "http://backend-2:8428/"
       - "http://backend-3:8428/"
     load_balancing_policy: least_loaded  # 默认，可省略
   ```

2. **`first_available`**：优先第一个可用后端（高可用场景）

   ```yaml
   unauthorized_user:
     url_prefix:
       - "http://victoria-metrics-main:8428/"
       - "http://victoria-metrics-standby1:8428/"
       - "http://victoria-metrics-standby2:8428/"
     load_balancing_policy: first_available
   ```

**自动故障切换**：

- vmauth 自动检测不可用的后端
- 将请求转发到其他可用后端
- 支持重启和维护期间无中断

**重试机制**：

```yaml
unauthorized_user:
  url_prefix:
    - http://vmselect1:8481/
    - http://vmselect2:8481/
    - http://vmselect3:8481/
  retry_status_codes: [500, 502, 503]  # 这些状态码时重试其他后端
```

---

### 6.3 典型使用场景

#### 6.3.1 简单 HTTP 代理

**无认证代理所有请求**：

```yaml
unauthorized_user:
  url_prefix: "http://backend/"
```

请求 `http://vmauth:8427/foo/bar` 被代理到 `http://backend/foo/bar`

#### 6.3.2 多后端路由

```yaml
unauthorized_user:
  url_map:
    - src_paths: ["/vmagent/.*"]
      drop_src_path_prefix_parts: 1
      url_prefix: "http://vmagent-backend:8429/"
    - src_paths: ["/vmalert/.*"]
      drop_src_path_prefix_parts: 1
      url_prefix: "http://vmalert-backend:8880/"
```

- `http://vmauth:8427/vmagent/api/v1/write` → `http://vmagent-backend:8429/api/v1/write`
- `http://vmauth:8427/vmalert/api/v1/rules` → `http://vmalert-backend:8880/api/v1/rules`

#### 6.3.3 vmagent 负载均衡

```yaml
unauthorized_user:
  url_map:
    - src_paths:
        - "/prometheus/api/v1/write"
        - "/influx/write"
        - "/api/v1/import"
        - "/api/v1/import/.*"
      url_prefix:
        - "http://vmagent-1:8429/"
        - "http://vmagent-2:8429/"
        - "http://vmagent-3:8429/"
```

#### 6.3.4 VictoriaMetrics 集群负载均衡

```yaml
unauthorized_user:
  url_map:
    # 写入负载均衡
    - src_paths: ["/insert/.*"]
      url_prefix:
        - "http://vminsert-1:8480/"
        - "http://vminsert-2:8480/"
        - "http://vminsert-3:8480/"
  
    # 查询负载均衡
    - src_paths:
        - "/select/.*"
        - "/admin/.*"
      url_prefix:
        - "http://vmselect-1:8481/"
        - "http://vmselect-2:8481/"
```

#### 6.3.5 多租户隔离

```yaml
users:
  # 租户1：写入到 AccountID=1
  - username: tenant1
    password: "***"
    url_map:
      - src_paths: ["/api/v1/write"]
        url_prefix: "http://vminsert:8480/insert/1/prometheus/"
      - src_paths:
          - "/api/v1/query"
          - "/api/v1/query_range"
        url_prefix: "http://vmselect:8481/select/1/prometheus/"
  
  # 租户2：写入到 AccountID=2
  - username: tenant2
    password: "***"
    url_map:
      - src_paths: ["/api/v1/write"]
        url_prefix: "http://vminsert:8480/insert/2/prometheus/"
      - src_paths:
          - "/api/v1/query"
          - "/api/v1/query_range"
        url_prefix: "http://vmselect:8481/select/2/prometheus/"
```

#### 6.3.6 TLS 终止代理

```bash
/path/to/vmauth \
  -tls \
  -tlsKeyFile=/path/to/tls_key_file \
  -tlsCertFile=/path/to/tls_cert_file \
  -httpListenAddr=0.0.0.0:443
```

**自动签发 TLS 证书**（Enterprise）：

```bash
/path/to/vmauth \
  -httpListenAddr=:443 \
  -tls \
  -tlsAutocertHosts=example.com,www.example.com \
  -tlsAutocertEmail=admin@example.com \
  -tlsAutocertCacheDir=/var/lib/vmauth/certs
```

---

### 6.4 高级特性

#### 6.4.1 路径前缀删除

**`drop_src_path_prefix_parts`**：删除请求路径的前 N 个部分

**示例**：

```yaml
unauthorized_user:
  url_map:
    - src_paths: ["/vmagent/.*"]
      drop_src_path_prefix_parts: 1  # 删除 /vmagent/
      url_prefix: "http://vmagent:8429/"
```

转换：

- 请求：`/vmagent/api/v1/write`
- 转发：`http://vmagent:8429/api/v1/write`

#### 6.4.2 强制添加查询参数

```yaml
unauthorized_user:
  url_prefix: "http://victoria-metrics:8428/?extra_label=foo=bar&nocache=1"
```

所有请求自动添加 `extra_label=foo=bar` 和 `nocache=1` 查询参数。

#### 6.4.3 修改 HTTP Headers

**添加/删除请求头**：

```yaml
unauthorized_user:
  url_prefix: "http://backend:1234/"
  headers:
    - "TenantID: foobar"         # 添加 Header
    - "X-Forwarded-For:"         # 删除 Header（空值）
```

**添加/删除响应头**：

```yaml
unauthorized_user:
  url_prefix: "http://backend:1234/"
  response_headers:
    - "Foo: bar"                 # 添加响应头
    - "Server:"                  # 删除响应头
```

**保持原始 Host Header**：

```yaml
unauthorized_user:
  url_prefix: "http://backend:1234/"
  keep_original_host: true       # 使用客户端的 Host header
```

#### 6.4.4 后端 IP 发现

**问题**：`vmselect-service` 可能对应多个实例，但通过域名无法负载均衡

**解决方案 1**：手动枚举所有实例

```yaml
unauthorized_user:
  url_prefix:
    - "http://vmselect-1:8481/"
    - "http://vmselect-2:8481/"
    - "http://vmselect-3:8481/"
```

**解决方案 2**：自动发现后端 IP

```yaml
unauthorized_user:
  url_prefix: "http://vmselect-service:8481/"
  discover_backend_ips: true  # 自动解析域名到多个 IP
```

**DNS SRV 支持**：

```yaml
unauthorized_user:
  url_prefix: "http://srv+vmselect/select/0/prometheus"
  discover_backend_ips: true
```

#### 6.4.5 查询参数合并

**默认行为**：客户端查询参数被 `url_prefix` 中的参数覆盖（安全考虑）

**允许合并特定参数**：

```yaml
unauthorized_user:
  merge_query_args: [extra_filters]  # 允许客户端追加 extra_filters
  url_map:
    - src_paths: ["/select/.+"]
      url_prefix: 'http://victoria-logs:9428/?extra_filters={env="prod"}'
```

请求：`/select/logsql/query?extra_filters={team="dev"}&query=error`
转发：`/select/logsql/query?extra_filters={env="prod"}&extra_filters={team="dev"}&query=error`

#### 6.4.6 并发限制

**全局限制**：

```bash
./vmauth \
  -maxConcurrentRequests=1000 \              # 全局并发限制
  -maxConcurrentPerUserRequests=300          # 单用户并发限制
```

**Per-User 限制**：

```yaml
users:
  - username: foo
    password: bar
    url_prefix: "http://backend/"
    max_concurrent_requests: 10  # 该用户最多 10 个并发
```

**监控指标**：

- `vmauth_concurrent_requests_current`：当前并发数
- `vmauth_concurrent_requests_limit_reached_total`：429 错误次数
- `vmauth_user_concurrent_requests_current{username="foo"}`：用户级并发

#### 6.4.7 IP 过滤（Enterprise）

**全局 IP 过滤**：

```yaml
users:
  # 用户配置...

ip_filters:
  allow_list:
    - 10.0.0.0/24
    - 1.2.3.4
  deny_list:
    - 10.0.0.42
```

**Per-User IP 过滤**：

```yaml
users:
  - username: foobar
    password: "***"
    url_prefix: "http://localhost:8428"
    ip_filters:
      allow_list: [127.0.0.1]
      real_ip_header: X-Forwarded-For  # 从该 Header 获取真实 IP
```

**安全建议**：

- ⚠️ 不要在面向公网的 vmauth 使用 `-httpRealIPHeader`
- ✅ 在公网反向代理处删除 `X-Forwarded-For`
- ✅ 使用 `-removeXFFHTTPHeaderValue` 替换为真实客户端 IP

---

### 6.5 后端 TLS 配置

#### 6.5.1 全局 TLS 设置

```bash
./vmauth \
  -backend.tlsInsecureSkipVerify \         # 跳过 TLS 验证
  -backend.tlsCAFile=/path/to/ca.pem \     # TLS CA 文件
  -backend.tlsCertFile=/path/to/cert.pem \ # 客户端证书（mTLS）
  -backend.tlsKeyFile=/path/to/key.pem \   # 客户端密钥
  -backend.tlsServerName=example.com       # TLS ServerName
```

#### 6.5.2 Per-User TLS 设置

```yaml
users:
  - username: foo
    url_prefix: "https://backend-with-custom-tls"
    tls_insecure_skip_verify: true
    tls_ca_file: "/path/to/ca.pem"
    tls_cert_file: "/path/to/cert.pem"
    tls_key_file: "/path/to/key.pem"
    tls_server_name: "custom.example.com"
```

---

### 6.6 配置示例：完整配置文件

```yaml
# ===== 用户配置 =====
users:
  # 1. Bearer Token 认证
  - bearer_token: "XXXX"
    url_prefix: "http://localhost:8428"
  
  # 2. 自定义 Auth Header
  - auth_token: "Foo XXXX"
    url_prefix: "http://localhost:8428"
  
  # 3. Bearer Token + 自定义 Headers
  - bearer_token: "YYY"
    url_prefix: "http://localhost:8428"
    headers:
      - "X-Scope-OrgID: foobar"
    response_headers:
      - "X-Server-Hostname:"  # 删除响应头
  
  # 4. Basic Auth + 并发限制
  - username: "local-single-node"
    password: "***"
    url_prefix: "http://localhost:8428"
    max_concurrent_requests: 10
  
  # 5. Basic Auth + 查询参数
  - username: "local-single-node2"
    password: "***"
    url_prefix: "http://localhost:8428?extra_label=team=dev"
  
  # 6. HTTPS + TLS 跳过验证
  - username: "local-single-node-with-tls"
    password: "***"
    url_prefix: "https://localhost"
    tls_insecure_skip_verify: true
  
  # 7. 集群查询负载均衡
  - username: "cluster-select-account-123"
    password: "***"
    url_prefix:
      - "http://vmselect1:8481/select/123/prometheus"
      - "http://vmselect2:8481/select/123/prometheus"
  
  # 8. 集群写入负载均衡
  - username: "cluster-insert-account-42"
    password: "***"
    url_prefix:
      - "http://vminsert1:8480/insert/42/prometheus"
      - "http://vminsert2:8480/insert/42/prometheus"
  
  # 9. 复杂路由：查询+写入+默认路由
  - username: "foobar"
    dump_request_on_errors: true  # 调试模式
    url_map:
      # 查询路由
      - src_paths:
          - "/api/v1/query"
          - "/api/v1/query_range"
          - "/api/v1/label/[^/]+/values"
        url_prefix:
          - "http://vmselect1:8481/select/42/prometheus"
          - "http://vmselect2:8481/select/42/prometheus"
        retry_status_codes: [500, 502]
    
      # 写入路由
      - src_paths: ["/api/v1/write"]
        url_prefix: "http://vminsert:8480/insert/42/prometheus"
        headers:
          - "X-Scope-OrgID: abc"
        response_headers:
          - "X-Server-Hostname:"
        ip_filters:
          deny_list: [127.0.0.1]
  
    # 默认路由（不匹配 url_map）
    default_url:
      - "http://default1:8888/unsupported_url_handler"
      - "http://default2:8888/unsupported_url_handler"

# ===== 未认证用户配置 =====
unauthorized_user:
  url_prefix:
    - "http://vmselect-az1/?deny_partial_response=1"
    - "http://vmselect-az2/?deny_partial_response=1"
  retry_status_codes: [503, 500]

# ===== 全局 IP 过滤（Enterprise）=====
ip_filters:
  allow_list: ["1.2.3.0/24", "127.0.0.1"]
  deny_list: [10.1.0.1]
```

**环境变量替换**：

```yaml
users:
  - username: admin
    password: "%{ADMIN_PASSWORD}"  # 从环境变量读取
    url_prefix: "http://backend/"
```

---

### 6.7 配置热重载

**方式 1：发送 SIGHUP 信号**

```bash
kill -HUP `pidof vmauth`
```

**方式 2：调用reload 端点**

```bash
curl -X POST http://vmauth:8427/-/reload?authKey=<your-key>
```

**方式 3：自动检测配置变化**

```bash
./vmauth -auth.config=config.yml -configCheckInterval=30s
```

---

### 6.8 安全配置

#### 6.8.1 启用 HTTPS

```bash
./vmauth \
  -tls \
  -tlsCertFile=/path/to/cert.pem \
  -tlsKeyFile=/path/to/key.pem \
  -httpListenAddr=:443
```

#### 6.8.2 启用 mTLS（Enterprise）

```bash
./vmauth \
  -tls \
  -mtls \
  -mtlsCAFile=/path/to/ca.pem \  # 验证客户端证书的 CA
  -auth.config=config.yml
```

#### 6.8.3 保护敏感端点

```bash
./vmauth \
  -reloadAuthKey=<reload-secret> \    # 保护 /-/reload
  -flagsAuthKey=<flags-secret> \      # 保护 /flags
  -metricsAuthKey=<metrics-secret> \  # 保护 /metrics
  -pprofAuthKey=<pprof-secret>        # 保护 /debug/pprof
```

**或使用独立监听地址**：

```bash
./vmauth \
  -httpListenAddr=:8427 \               # 对外服务
  -httpInternalListenAddr=127.0.0.1:8426  # 内部 API
```

#### 6.8.4 安全建议

1. ✅ 后端服务应在隔离的私有网络中
2. ✅ 启用 HTTPS 传输认证信息
3. ✅ 使用 `-removeXFFHTTPHeaderValue` 防止 IP 欺骗
4. ✅ 限制 `/metrics` 和 `/debug/pprof` 访问
5. ✅ 使用 IP 过滤限制访问来源
6. ✅ 设置并发限制防止滥用

---

### 6.9 监控

#### 6.9.1 监控指标

**Per-User 指标**：

- `vmauth_user_requests_total{username="..."}` - 用户请求总数
- `vmauth_user_request_backend_errors_total{username="..."}` - 后端错误数
- `vmauth_user_request_duration_seconds{username="..."}` - 请求耗时
- `vmauth_user_concurrent_requests_current{username="..."}` - 当前并发数
- `vmauth_user_concurrent_requests_capacity{username="..."}` - 并发限制
- `vmauth_user_concurrent_requests_limit_reached_total{username="..."}` - 429 错误数

**Unauthorized User 指标**：

- `vmauth_unauthorized_user_requests_total`
- `vmauth_unauthorized_user_request_backend_errors_total`
- `vmauth_unauthorized_user_request_duration_seconds`

**全局指标**：

- `vmauth_concurrent_requests_current` - 全局当前并发
- `vmauth_concurrent_requests_capacity` - 全局并发限制
- `vmauth_concurrent_requests_limit_reached_total` - 全局 429 错误

#### 6.9.2 自定义 Metric 标签

```yaml
users:
  - username: "secret_user"
    name: "foobar"  # 指标中使用 username="foobar" 而非 "secret_user"
    metric_labels:
      dc: eu              # 增加额外标签
      team: dev
    url_prefix: "http://backend/"
```

生成指标：

```
vmauth_user_requests_total{username="foobar", dc="eu", team="dev"}
```

#### 6.9.3 官方 Dashboard

使用 Grafana Dashboard 监控 vmauth：

- **Dashboard URL**: [https://grafana.com/grafana/dashboards/](https://grafana.com/grafana/dashboards/)
- 包含请求速率、错误率、延迟、并发等指标

---

### 6.10 核心 Flag 总览

#### 6.10.1 必需参数

| Flag             | 说明                                    |
| ---------------- | --------------------------------------- |
| `-auth.config` | 认证配置文件路径（本地文件或 HTTP URL） |

#### 6.10.2 重要参数

**认证相关**：

- `-httpAuthHeader` - 读取认证 Token 的 HTTP Header（默认 `Authorization`）

**负载均衡**：

- `-loadBalancingPolicy` - 负载均衡策略（`least_loaded` / `first_available`）
- `-retryStatusCodes` - 重试的 HTTP 状态码列表
- `-failTimeout` - 故障后端的跳过时长（默认 3s）
- `-discoverBackendIPs` - 是否发现后端 IP
- `-discoverBackendIPsInterval` - IP 发现间隔（默认 10s）

**并发控制**：

- `-maxConcurrentRequests` - 全局最大并发（默认 1000）
- `-maxConcurrentPerUserRequests` - 单用户最大并发（默认 300）
- `-maxIdleConnsPerBackend` - 每个后端的最大空闲连接（默认 100）

**后端 TLS**：

- `-backend.tlsInsecureSkipVerify` - 跳过后端 TLS 验证
- `-backend.tlsCAFile` - 后端 TLS CA 文件
- `-backend.tlsCertFile` - 客户端证书（mTLS）
- `-backend.tlsKeyFile` - 客户端密钥

**前端 TLS**：

- `-tls` - 启用 TLS
- `-tlsCertFile` - TLS 证书文件
- `-tlsKeyFile` - TLS 密钥文件
- `-mtls` - 启用 mTLS（Enterprise）
- `-mtlsCAFile` - mTLS CA 文件

**自动 TLS 证书**（Enterprise）：

- `-tlsAutocertHosts` - Let's Encrypt 域名列表
- `-tlsAutocertEmail` - 联系邮箱
- `-tlsAutocertCacheDir` - 证书缓存目录

**安全**：

- `-reloadAuthKey` - 保护 `/-/reload` 端点
- `-flagsAuthKey` - 保护 `/flags` 端点
- `-metricsAuthKey` - 保护 `/metrics` 端点
- `-pprofAuthKey` - 保护 `/debug/pprof` 端点
- `-httpRealIPHeader` - 获取真实 IP 的 Header
- `-removeXFFHTTPHeaderValue` - 移除 X-Forwarded-For

**配置**：

- `-configCheckInterval` - 配置检查间隔（默认不检查）
- `-dryRun` - 仅验证配置不运行

**查询参数**：

- `-mergeQueryArgs` - 允许合并的查询参数列表

**请求/响应**：

- `-responseTimeout` - 后端响应超时（默认 5m）
- `-maxRequestBodySizeToRetry` - 可缓存重试的最大请求体（默认 16KB）

**监听地址**：

- `-httpListenAddr` - 主监听地址（默认 `:8427`）
- `-httpInternalListenAddr` - 内部 API 监听地址

---

### 6.11 常见问题与最佳实践

#### 6.11.1 配置优先级

**规则匹配顺序**：

1. `url_map` 中的规则按**定义顺序**匹配
2. 匹配第一个符合条件的规则
3. 不匹配时使用 `default_url`
4. 无 `default_url` 则使用 `url_prefix`

**Tips**：将更具体的规则放在前面。

#### 6.11.2 路径前缀处理

**问题**：如何代理 `/vmagent/` 到 vmagent 的根路径？

**解决方案**：

```yaml
url_map:
  - src_paths: ["/vmagent/.*"]
    drop_src_path_prefix_parts: 1
    url_prefix: "http://vmagent:8429/"
```

**转换示例**：

- `/vmagent/api/v1/write` → `http://vmagent:8429/api/v1/write`
- `/vmagent/-/reload` → `http://vmagent:8429/-/reload`

#### 6.11.3 高可用部署

**问题**：如何实现 vmauth 高可用？

**解决方案**：

1. 部署多个 vmauth 实例（相同配置）
2. 使用外部负载均衡器（如 HAProxy、Nginx、云 LB）
3. 配置健康检查（`/health` 端点）

```
    +-------------------+
    | Load Balancer     |
    +-------------------+
         /     |     \
        /      |      \
   vmauth1  vmauth2  vmauth3
     |        |        |
     +--------+--------+
            |
        Backends
```

#### 6.11.4 调试技巧

**1. 启用请求错误日志**

```yaml
users:
  - username: foobar
    dump_request_on_errors: true  # 记录失败请求的详细信息
    url_map: ...
```

**2. 验证配置语法**

```bash
./vmauth -auth.config=config.yml -dryRun
```

**3. 查看当前配置**

```bash
# 需要 -flagsAuthKey 保护
curl http://vmauth:8427/flags?authKey=<key>
```

**4. 监控后端健康**

- 查看 `vmauth_user_request_backend_errors_total` 指标
- 设置告警：错误率超过阈值时触发

#### 6.11.5 性能优化

**1. 调整连接池**

```bash
./vmauth \
  -maxIdleConnsPerBackend=200 \       # 增加空闲连接池
  -idleConnTimeout=60s                # 延长空闲连接超时
```

**2. 调整并发限制**

```bash
./vmauth \
  -maxConcurrentRequests=5000 \       # 根据负载调整
  -maxConcurrentPerUserRequests=500
```

**3. 启用后端 IP 发现**

```yaml
unauthorized_user:
  url_prefix: "http://vmselect-service:8481/"
  discover_backend_ips: true
```

#### 6.11.6 安全加固

**1. 最小权限原则**

- 每个用户只配置必要的 `url_map` 路径
- 使用 IP 过滤限制访问来源

**2. 避免凭据泄露**

```yaml
users:
  - username: admin
    password: "%{ADMIN_PASSWORD}"  # 使用环境变量
```

**3. 定期轮换凭据**

- 定期更新 Bearer Token
- 定期更新用户密码
- 使用配置热重载应用新凭据

**4. 监控异常访问**

```promql
# 检测认证失败
rate(vmauth_http_request_errors_total{reason="invalid_auth_token"}[5m]) > 10

# 检测并发超限
rate(vmauth_user_concurrent_requests_limit_reached_total[5m]) > 0
```

---

### 6.12 配置参考

#### 6.12.1 User 配置项

| 字段                           | 类型         | 说明                                    |
| ------------------------------ | ------------ | --------------------------------------- |
| `username`                   | string       | Basic Auth 用户名                       |
| `password`                   | string       | Basic Auth 密码                         |
| `bearer_token`               | string       | Bearer Token                            |
| `auth_token`                 | string       | 自定义认证 Token                        |
| `name`                       | string       | 指标中显示的用户名（覆盖 `username`） |
| `url_prefix`                 | string/array | 后端 URL（单个或多个）                  |
| `url_map`                    | array        | URL 路由映射                            |
| `default_url`                | string/array | 默认 URL（不匹配 url_map 时）           |
| `headers`                    | array        | 添加/删除的请求头                       |
| `response_headers`           | array        | 添加/删除的响应头                       |
| `max_concurrent_requests`    | int          | 最大并发请求数                          |
| `load_balancing_policy`      | string       | 负载均衡策略                            |
| `retry_status_codes`         | array        | 重试的状态码                            |
| `discover_backend_ips`       | bool         | 是否发现后端 IP                         |
| `drop_src_path_prefix_parts` | int          | 删除路径前缀部分数                      |
| `keep_original_host`         | bool         | 保持原始 Host header                    |
| `tls_insecure_skip_verify`   | bool         | 跳过后端 TLS 验证                       |
| `tls_ca_file`                | string       | 后端 TLS CA 文件                        |
| `tls_cert_file`              | string       | 后端客户端证书                          |
| `tls_key_file`               | string       | 后端客户端密钥                          |
| `tls_server_name`            | string       | 后端 TLS ServerName                     |
| `ip_filters`                 | object       | IP 过滤配置（Enterprise）               |
| `metric_labels`              | object       | 额外的指标标签                          |
| `dump_request_on_errors`     | bool         | 记录失败请求详情                        |
| `merge_query_args`           | array        | 允许合并的查询参数                      |
| `mtls`                       | object       | mTLS 匹配规则（Enterprise）             |

#### 6.12.2 URL Map 配置项

| 字段                           | 类型         | 说明                  |
| ------------------------------ | ------------ | --------------------- |
| `src_paths`                  | array        | 路径正则匹配列表      |
| `src_hosts`                  | array        | 主机名正则匹配列表    |
| `src_query_args`             | array        | 查询参数匹配列表      |
| `src_headers`                | array        | Header 匹配列表       |
| `url_prefix`                 | string/array | 后端 URL              |
| `headers`                    | array        | 请求头修改            |
| `response_headers`           | array        | 响应头修改            |
| `drop_src_path_prefix_parts` | int          | 删除路径前缀          |
| `retry_status_codes`         | array        | 重试状态码            |
| `load_balancing_policy`      | string       | 负载均衡策略          |
| `discover_backend_ips`       | bool         | 是否发现后端 IP       |
| `ip_filters`                 | object       | IP 过滤（Enterprise） |

---

### 6.13 总结

**vmauth 核心优势**：

1. ✅ 统一的认证入口（Basic Auth、Bearer Token、mTLS）
2. ✅ 灵活的路由规则（路径、主机、参数、Header）
3. ✅ 智能负载均衡（最少负载、优先可用）
4. ✅ 高可用特性（自动故障切换、重试机制）
5. ✅ 细粒度并发控制
6. ✅ 多租户隔离
7. ✅ 完善的监控指标

**典型应用场景**：

- VictoriaMetrics 集群的统一入口
- 多租户环境的访问隔离
- 后端服务的负载均衡
- TLS 终止代理
- 基于路径的微服务路由

**与其他组件的协作**：

- **vmagent**：通过 vmauth 负载均衡多个 vmagent 实例
- **vmalert**：通过 vmauth 访问 VictoriaMetrics
- **vminsert/vmselect**：通过 vmauth 负载均衡集群组件
- **Grafana**：通过 vmauth 实现多租户数据隔离

**🎯 第 6 章完成！** 下一步将继续学习 vmbackup 组件...

---

---

## 第 7 章：vmbackup - 数据备份工具

### 7.1 vmbackup 概述

**核心定位**：vmbackup 是 VictoriaMetrics 的数据备份工具，用于：

- 防止硬件故障导致的数据丢失
- 防止意外数据删除
- 从即时快照创建备份
- 支持增量备份和完整备份

**核心特性**：

- ✅ 基于即时快照（Instant Snapshots）的备份
- ✅ 支持增量备份（仅上传变化的数据）
- ✅ 服务器端复制（Server-side Copy）加速备份
- ✅ 可中断恢复（断点续传）
- ✅ 支持多种对象存储（GCS、S3、Azure、MinIO 等）
- ✅ 单节点和集群版本均支持

**工作原理**：

```mermaid
graph LR
    A[VictoriaMetrics] -->|1. 创建快照| B[Instant Snapshot]
    B -->|2. 读取数据| C[vmbackup]
    C -->|3. 上传备份| D[对象存储<br/>GCS/S3/Azure]
    C -->|4. 删除快照| B
    D -->|恢复| E[vmrestore]
```

---

### 7.2 支持的存储类型

vmbackup 通过 `-dst` 参数支持以下存储类型：

| 存储类型                | 示例                            | 说明                       |
| ----------------------- | ------------------------------- | -------------------------- |
| **GCS**           | `gs://<bucket>/<path>`        | Google Cloud Storage       |
| **S3**            | `s3://<bucket>/<path>`        | Amazon S3                  |
| **Azure Blob**    | `azblob://<container>/<path>` | Azure Blob Storage         |
| **S3-compatible** | `s3://<bucket>/<path>`        | MinIO、Ceph 等             |
| **本地文件系统**  | `fs://</abs/path>`            | 本地目录（不推荐用于生产） |

**注意事项**：

- 本地文件系统目录不能是 `-storageDataPath`（数据目录）
- S3 兼容存储需配置 `-customS3Endpoint`

---

### 7.3 单节点备份

#### 7.3.1 基本备份命令

```bash
./vmbackup \
  -storageDataPath=</path/to/victoria-metrics-data> \   # VictoriaMetrics 数据目录
  -snapshot.createURL=http://localhost:8428/snapshot/create \  # 快照创建接口
  -dst=gs://<bucket>/<path/to/backup>                   # 备份目标路径
```

**参数说明**：

- **`-storageDataPath`**：VictoriaMetrics 的数据目录（`-storageDataPath` 参数值）
- **`-snapshot.createURL`**：创建快照的 HTTP 接口
- **`-dst`**：备份目标路径

**无需停机**：vmbackup 基于即时快照工作，无需停止 VictoriaMetrics 服务。

---

### 7.4 集群备份

#### 7.4.1 集群备份方式

**要点**：

- 必须在**每个 vmstorage 节点**上运行 vmbackup
- 不同节点的备份必须放到**不同的目录**
- 需要访问每个 vmstorage 的数据目录

#### 7.4.2 集群备份示例

**3 个 vmstorage 节点的备份**：

```bash
# vmstorage-1
./vmbackup \
  -storageDataPath=</path/to/vmstorage-data> \
  -snapshot.createURL=http://vmstorage1:8482/snapshot/create \
  -dst=gs://<bucket>/vmstorage-1

# vmstorage-2
./vmbackup \
  -storageDataPath=</path/to/vmstorage-data> \
  -snapshot.createURL=http://vmstorage2:8482/snapshot/create \
  -dst=gs://<bucket>/vmstorage-2

# vmstorage-3
./vmbackup \
  -storageDataPath=</path/to/vmstorage-data> \
  -snapshot.createURL=http://vmstorage3:8482/snapshot/create \
  -dst=gs://<bucket>/vmstorage-3
```

#### 7.4.3 Kubernetes 部署建议

**使用 Sidecar 容器**：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: vmstorage-1
spec:
  containers:
    # 主容器：vmstorage
    - name: vmstorage
      image: victoriametrics/vmstorage:latest
      volumeMounts:
        - name: storage
          mountPath: /storage

    # Sidecar 容器：vmbackup
    - name: vmbackup
      image: victoriametrics/vmbackup:latest
      volumeMounts:
        - name: storage
          mountPath: /storage
      command:
        - /vmbackup
        - -storageDataPath=/storage
        - -snapshot.createURL=http://localhost:8482/snapshot/create
        - -dst=gs://bucket/vmstorage-1
```

---

### 7.5 备份类型

#### 7.5.1 完整备份（Full Backup）

**创建完整备份**：

```bash
./vmbackup \
  -storageDataPath=</path/to/victoriametrics-data> \
  -snapshot.createURL=http://localhost:8428/snapshot/create \
  -dst=gs://<bucket>/<path/to/new/backup>
```

**特点**：

- 备份所有数据到新目录
- 适合首次备份或定期完整备份

#### 7.5.2 完整备份 + 服务器端复制

**利用已有备份加速**：

```bash
./vmbackup \
  -storageDataPath=</path/to/victoriametrics-data> \
  -snapshot.createURL=http://localhost:8428/snapshot/create \
  -dst=gs://<bucket>/<path/to/new/backup> \
  -origin=gs://<bucket>/<path/to/existing/backup>  # 源备份路径
```

**优势**：

- 对于共享的数据文件，执行**服务器端复制**
- 不需要本地下载再上传，节省时间和带宽
- 仅上传新增或变化的数据

**注意事项**：

- `-origin` 和 `-dst` 必须在**同一个对象存储桶**
- S3 Glacier 等存储可能执行完整对象复制（慢且贵）
- 建议查阅云存储提供商的文档确认行为

#### 7.5.3 增量备份（Incremental Backup）

**概念**：如果 `-dst` 已包含之前的备份数据，vmbackup 自动执行增量备份。

**增量备份命令**：

```bash
./vmbackup \
  -storageDataPath=</path/to/victoriametrics-data> \
  -snapshot.createURL=http://localhost:8428/snapshot/create \
  -dst=gs://<bucket>/<path/to/existing/backup>  # 已存在的备份路径
```

**工作方式**：

- 仅上传新增或变化的数据
- 删除目标中不再存在的旧文件
- 节省时间和带宽成本

**适用场景**：

- 定期备份（每小时、每天）
- 大规模数据备份

---

### 7.6 Smart Backup 策略（推荐）

#### 7.6.1 Smart Backup 概念

**定义**：结合完整备份、增量备份和清理操作的备份策略。

**VictoriaMetrics 的 Smart Backup**：

- **每小时增量备份** → 保存到 `latest` 目录
- **每天完整备份** → 服务器端复制到 `YYYYMMDD` 目录

#### 7.6.2 Smart Backup 实施步骤

**步骤 1：每小时增量备份**

```bash
# 配置 Cron 任务，每小时执行一次
0 * * * * /vmbackup \
  -storageDataPath=</path/to/victoriametrics-data> \
  -snapshot.createURL=http://localhost:8428/snapshot/create \
  -dst=gs://<bucket>/latest
```

**作用**：

- 创建即时快照
- 仅上传变化的数据（增量）
- 保存到 `gs://<bucket>/latest`

**步骤 2：每天完整备份**

```bash
# 配置 Cron 任务，每天凌晨执行一次
0 0 * * * /vmbackup \
  -origin=gs://<bucket>/latest \
  -dst=gs://<bucket>/$(date +\%Y\%m\%d)
```

**作用**：

- 将 `latest` 备份服务器端复制到 `YYYYMMDD` 目录
- 例如：`gs://<bucket>/20250124`
- 快速且低成本

**步骤 3：定期清理旧备份**

```bash
# 删除 30 天前的备份
gsutil -m rm -r gs://<bucket>/$(date -d '30 days ago' +\%Y\%m\%d)
```

#### 7.6.3 Smart Backup 优势

1. **节省成本**：小时级备份使用增量，降低网络传输成本
2. **灵活恢复**：
   - 恢复最近 1 小时数据：使用 `latest`
   - 恢复特定日期数据：使用 `YYYYMMDD`
3. **高效快速**：服务器端复制避免数据传输

#### 7.6.4 注意事项

⚠️ **避免冲突**：每日备份运行时，暂停小时级备份。

✅ **使用 vmbackupmanager**：Enterprise 版本提供自动化工具，简化 Smart Backup 管理。

---

### 7.7 服务器端复制

#### 7.7.1 服务器端复制命令

**仅复制备份（不创建快照）**：

```bash
./vmbackup \
  -origin=gs://bucket/source-backup \
  -dst=gs://bucket/destination-backup
```

**用途**：

- 复制已有备份到新位置
- 创建备份的副本
- 跨区域备份迁移

#### 7.7.2 服务器端复制特性

- **同一存储桶**：`-origin` 和 `-dst` 必须在同一对象存储
- **增量复制**：如果 `-dst` 已有数据，则同步差异
- **高效快速**：数据不经过本地，直接在云端复制

**性能差异**：

- **大多数对象存储**：创建新对象名指向已有数据（快）
- **S3 Glacier**：执行完整对象复制（慢且贵）

---

### 7.8 备份工作原理

#### 7.8.1 备份算法

**7 个步骤**：

1. **创建快照**：调用 `-snapshot.createURL` 创建即时快照
2. **收集文件信息**：
   - 快照中的文件
   - `-dst` 目标中的文件
   - `-origin` 源中的文件（如果指定）
3. **删除过时文件**：删除 `-dst` 中存在但快照中不存在的文件
4. **确定需上传文件**：快照中存在但 `-dst` 中缺失的文件
5. **服务器端复制**：从 `-origin` 复制步骤 4 中的共享文件到 `-dst`
6. **上传剩余文件**：上传步骤 4 中不在 `-origin` 的文件
7. **删除快照**：自动删除创建的快照

#### 7.8.2 文件分块

**分块策略**：

- 源文件按 **1 GiB** 分块
- 每个分块作为独立文件上传
- 平衡文件数量和重传数据量

#### 7.8.3 即时快照特性

vmbackup 依赖即时快照的以下特性：

1. ✅ 快照中的文件**不可变**
2. ✅ 旧文件定期**合并**为新文件
3. ✅ 小文件更可能被合并
4. ✅ 连续快照共享大量相同文件

这些特性保证了：

- 增量备份的高效性
- 服务器端复制的可行性

---

### 7.9 故障排查

#### 7.9.1 备份速度慢

**问题**：备份耗时过长

**解决方案**：

```bash
./vmbackup -concurrency=20 ...  # 增加并发数（默认 10）
```

#### 7.9.2 占用网络带宽或 CPU 过高

**问题**：vmbackup 消耗过多资源

**解决方案**：

```bash
# 方案 1：降低并发
./vmbackup -concurrency=5 ...

# 方案 2：限制上传速度
./vmbackup -maxBytesPerSecond=10MB ...  # 限制 10 MB/s
```

#### 7.9.3 CPU 占用过高（多核心系统）

**解决方案**：

```bash
./vmbackup -filestream.disableFadvise ...
```

#### 7.9.4 备份中断后恢复

**问题**：备份因临时错误中断

**解决方案**：

- 使用**相同参数**重启 vmbackup
- vmbackup 自动从中断点恢复
- ⚠️ 完成后手动删除失败时创建的快照

#### 7.9.5 单节点备份不能恢复到集群（反之亦然）

**原因**：单节点和集群的数据格式不兼容

**解决方案**：确保备份和恢复的 VictoriaMetrics 版本类型一致。

#### 7.9.6 快照占用磁盘空间

参考快照故障排查文档（Snapshot Troubleshooting）了解快照的磁盘使用和建议。

---

### 7.10 凭据配置

#### 7.10.1 通过文件提供凭据

**S3（AWS、MinIO）凭据文件**（`/etc/credentials`）：

```ini
[default]
aws_access_key_id=theaccesskey
aws_secret_access_key=thesecretaccesskeyvalue
```

**GCP 凭据文件**（`/etc/credentials.json`）：

```json
{
   "type": "service_account",
   "project_id": "project-id",
   "private_key_id": "key-id",
   "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
   "client_email": "service-account-email",
   ...
}
```

**使用文件**：

```bash
./vmbackup -credsFilePath=/etc/credentials ...
```

#### 7.10.2 通过环境变量提供凭据

**AWS S3**：

```bash
export AWS_ACCESS_KEY_ID=<key>
export AWS_SECRET_ACCESS_KEY=<secret>
# 或
export AWS_SHARED_CREDENTIALS_FILE=/path/to/credentials
```

**GCP**：

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

**Azure**：

```bash
# 方式 1：连接字符串
export AZURE_STORAGE_ACCOUNT_CONNECTION_STRING="<connection_string>"

# 方式 2：账户名 + Key
export AZURE_STORAGE_ACCOUNT_NAME=<account_name>
export AZURE_STORAGE_ACCOUNT_KEY=<account_key>

# 方式 3：DefaultAzureCredential（托管身份）
export AZURE_USE_DEFAULT_CREDENTIAL=true
export AZURE_STORAGE_ACCOUNT_NAME=<account_name>
export AZURE_CLIENT_ID=<client_id>  # 可选：指定特定凭据

# 可选：自定义域
export AZURE_STORAGE_DOMAIN=<custom_domain>
```

#### 7.10.3 云提供商元数据服务

**自动获取凭据**：

- vmbackup 在云环境中运行时自动使用元数据服务获取凭据
- 无需显式提供 `-credsFilePath` 或环境变量

**支持的云**：

- AWS EC2
- GCP GCE
- Azure VM

#### 7.10.4 Kubernetes 中的凭据配置

**方式 1：使用 Secret + 环境变量**

```yaml
# Secret 定义
apiVersion: v1
kind: Secret
metadata:
  name: vmbackup-credentials
data:
  access_key: <base64-encoded-key>
  secret_key: <base64-encoded-secret>

---
# Pod 配置
spec:
  containers:
    - name: vmbackup
      env:
        - name: AWS_ACCESS_KEY_ID
          valueFrom:
            secretKeyRef:
              name: vmbackup-credentials
              key: access_key
        - name: AWS_SECRET_ACCESS_KEY
          valueFrom:
            secretKeyRef:
              name: vmbackup-credentials
              key: secret_key
```

**方式 2：IAM Roles for Service Accounts（推荐）**

**AWS EKS**：

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: monitoring-backups
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::{ACCOUNT_ID}:role/{ROLE_NAME}

---
spec:
  serviceAccountName: monitoring-backups
```

**GCP GKE（Workload Identity）**：

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: monitoring-backups
  annotations:
    iam.gke.io/gcp-service-account: {sa_name}@{project_name}.iam.gserviceaccount.com

---
spec:
  serviceAccountName: monitoring-backups
```

---

### 7.11 高级配置

#### 7.11.1 自定义 S3 端点

**MinIO 示例**：

```bash
./vmbackup \
  -customS3Endpoint=http://localhost:9000 \
  -dst=s3://bucket/backup ...
```

**AWS GovCloud 示例**：

```bash
./vmbackup \
  -customS3Endpoint=https://s3-fips.us-gov-west-1.amazonaws.com \
  -dst=s3://bucket/backup ...
```

#### 7.11.2 永久删除 S3 对象版本

**问题**：S3 启用版本控制时，标准删除仅删除当前版本。

**解决方案**：

```bash
./vmbackup -deleteAllObjectVersions ...
```

**替代方案**：配置对象存储的生命周期规则自动删除非当前版本。

#### 7.11.3 设置对象元数据

**示例**：

```bash
./vmbackup \
  -objectMetadata='{"param1":"value1","param2":"value2"}' \
  -dst=s3://bucket/backup ...
```

**限制**：本地文件系统目标不支持元数据。

#### 7.11.4 设置 S3 对象标签

```bash
./vmbackup \
  -s3ObjectTags='{"Environment":"Production","Team":"Platform"}' \
  -dst=s3://bucket/backup ...
```

#### 7.11.5 设置 S3 存储类

```bash
./vmbackup \
  -s3StorageClass=GLACIER \  # 或其他存储类
  -dst=s3://bucket/backup ...
```

**支持的存储类**：

- `STANDARD`
- `STANDARD_IA`
- `ONEZONE_IA`
- `INTELLIGENT_TIERING`
- `GLACIER`
- `GLACIER_IR`
- `DEEP_ARCHIVE`

---

### 7.12 核心 Flag 总览

#### 7.12.1 必需参数

| Flag                 | 说明                                                       |
| -------------------- | ---------------------------------------------------------- |
| `-dst`             | 备份目标路径（必需）                                       |
| `-storageDataPath` | VictoriaMetrics 数据目录（默认 `victoria-metrics-data`） |

#### 7.12.2 重要参数

**快照相关**：

- `-snapshot.createURL` - 创建快照的 URL（推荐使用）
- `-snapshot.deleteURL` - 删除快照的 URL（可选，自动生成）
- `-snapshotName` - 已存在的快照名称（与 `-snapshot.createURL` 二选一）

**备份策略**：

- `-origin` - 源备份路径（用于服务器端复制）
- `-concurrency` - 并发工作线程数（默认 10）
- `-maxBytesPerSecond` - 最大上传速度限制
- `-deleteAllObjectVersions` - 删除所有对象版本（S3）

**凭据**：

- `-credsFilePath` - 凭据文件路径
- `-customS3Endpoint` - 自定义 S3 端点（MinIO 等）

**对象存储配置**：

- `-s3StorageClass` - S3 存储类
- `-s3ObjectTags` - S3 对象标签（JSON）
- `-objectMetadata` - 对象元数据（JSON）
- `-s3ForcePathStyle` - 使用路径风格 URL（默认 true）
- `-s3TLSInsecureSkipVerify` - 跳过 TLS 验证

**TLS 配置**：

- `-snapshot.tlsCAFile` - 验证快照 URL 的 CA 文件
- `-snapshot.tlsCertFile` - 客户端证书
- `-snapshot.tlsKeyFile` - 客户端密钥
- `-snapshot.tlsInsecureSkipVerify` - 跳过 TLS 验证
- `-snapshot.tlsServerName` - TLS ServerName

**性能调优**：

- `-filestream.disableFadvise` - 禁用 fadvise() 系统调用

**监控**：

- `-httpListenAddr` - HTTP 监听地址（默认 `:8420`）

---

### 7.13 vmbackupmanager（Enterprise）

#### 7.13.1 简介

**核心功能**：

- 基于 vmbackup 构建的自动化备份管理工具
- 简化小时级、日级、周级、月级备份的创建
- 自动清理旧备份

**获取方式**：

- Enterprise 版本提供
- 可免费试用：从 [releases 页面](https://github.com/VictoriaMetrics/VictoriaMetrics/releases) 下载
- 申请免费试用许可证

#### 7.13.2 典型使用场景

**自动化 Smart Backup**：

- 自动执行每小时增量备份
- 自动执行每日完整备份（服务器端复制）
- 按保留策略自动删除旧备份

**配置示例**：

```bash
./vmbackupmanager \
  -storageDataPath=/victoria-metrics-data \
  -snapshot.createURL=http://localhost:8428/snapshot/create \
  -dst=gs://bucket/backups \
  -retention.hourly=24 \   # 保留 24 小时备份
  -retention.daily=7 \     # 保留 7 天备份
  -retention.weekly=4 \    # 保留 4 周备份
  -retention.monthly=12    # 保留 12 月备份
```

---

### 7.14 最佳实践

#### 7.14.1 备份策略建议

1. ✅ **使用 Smart Backup 策略**

   - 每小时增量备份到 `latest`
   - 每天完整备份到 `YYYYMMDD`
2. ✅ **定期清理旧备份**

   - 避免存储成本累积
   - 根据数据保留策略删除过期备份
3. ✅ **验证备份可恢复性**

   - 定期测试恢复流程
   - 确认备份完整性
4. ✅ **监控备份任务**

   - 监控备份成功率
   - 设置告警检测备份失败

#### 7.14.2 集群备份建议

1. ✅ **使用 Sidecar 模式**（Kubernetes）

   - 与 vmstorage 运行在同一 Pod
   - 共享数据卷
2. ✅ **分离备份目录**

   - 不同 vmstorage 节点备份到不同路径
   - 避免备份数据冲突
3. ✅ **并行执行备份**

   - 所有 vmstorage 节点同时备份
   - 加快整体备份速度

#### 7.14.3 安全建议

1. ✅ **使用 IAM Roles**（Kubernetes）

   - 避免在配置中硬编码凭据
   - 使用 IAM Roles for Service Accounts（AWS）
   - 使用 Workload Identity（GCP）
2. ✅ **加密传输**

   - 使用 HTTPS 端点
   - 启用对象存储的传输加密
3. ✅ **访问控制**

   - 限制备份存储桶的访问权限
   - 使用最小权限原则

#### 7.14.4 成本优化

1. ✅ **使用增量备份**

   - 减少网络传输成本
   - 节省存储空间
2. ✅ **选择合适的存储类**

   - 频繁访问：`STANDARD`
   - 长期归档：`GLACIER`、`DEEP_ARCHIVE`
3. ✅ **清理旧备份**

   - 避免无限累积存储成本
   - 配置生命周期规则自动删除

---

### 7.15 总结

**vmbackup 核心优势**：

1. ✅ 基于即时快照的无中断备份
2. ✅ 增量备份节省时间和成本
3. ✅ 服务器端复制加速完整备份
4. ✅ 自动断点续传
5. ✅ 支持多种对象存储
6. ✅ 灵活的凭据配置方式

**Smart Backup 策略**：

- 每小时增量备份（`latest`）
- 每天完整备份（`YYYYMMDD`）
- 灵活恢复：最近 1 小时或特定日期

**典型工作流**：

```mermaid
graph TD
    A[每小时增量备份] -->|写入| B[gs://bucket/latest]
    B -->|每天服务器端复制| C[gs://bucket/20250124]
    C -->|定期清理| D[删除 30 天前备份]
```

**配合工具**：

- **vmrestore**：从备份恢复数据
- **vmbackupmanager**（Enterprise）：自动化备份管理

**🎯 第 7 章完成！** 下一步将继续学习 vmrestore 组件...

---

---

## 第 8 章：vmrestore - 数据恢复工具

### 8.1 vmrestore 概述

**核心定位**：vmrestore 是 VictoriaMetrics 的数据恢复工具，用于：

- 从 vmbackup 创建的备份中恢复数据
- 支持断点续传（可中断恢复）
- 支持多种对象存储

**工作原理**：

```mermaid
graph LR
    A[对象存储<br/>GCS/S3/Azure] -->|读取备份| B[vmrestore]
    B -->|恢复数据| C[本地数据目录<br/>-storageDataPath]
    C -->|启动| D[VictoriaMetrics]
```

**关键特性**：

- ✅ 自动断点续传（中断后重启自动恢复）
- ✅ 类似 `rsync --delete` 的同步机制
- ✅ 支持多种存储（GCS、S3、Azure、本地文件系统）
- ✅ 可覆盖现有数据目录

---

### 8.2 基本用法

#### 8.2.1 必要前提

⚠️ **重要**：恢复前必须停止 VictoriaMetrics 或 vmstorage。

#### 8.2.2 基本恢复命令

```bash
./vmrestore \
  -src=<storageType>://<path/to/backup> \
  -storageDataPath=<local/path/to/restore>
```

**参数说明**：

- **`-src`**：备份源路径（vmbackup 创建的备份位置）
- **`-storageDataPath`**：本地恢复目标路径（VictoriaMetrics 的数据目录）

#### 8.2.3 支持的存储类型

| 存储类型                | `-src` 示例                                    |
| ----------------------- | ------------------------------------------------ |
| **GCS**           | `gs://<bucket>/<path/to/backup>`               |
| **S3**            | `s3://<bucket>/<path/to/backup>`               |
| **Azure Blob**    | `azblob://<container>/<path/to/backup>`        |
| **S3-compatible** | `s3://<bucket>/<path>` + `-customS3Endpoint` |
| **本地文件系统**  | `fs://</absolute/path/to/backup>`              |

---

### 8.3 恢复示例

#### 8.3.1 从 GCS 恢复

```bash
# 停止 VictoriaMetrics
systemctl stop victoriametrics

# 恢复备份
./vmrestore \
  -src=gs://my-bucket/backups/20250124 \
  -storageDataPath=/var/lib/victoria-metrics-data

# 启动 VictoriaMetrics
systemctl start victoriametrics
```

#### 8.3.2 从 S3 恢复

```bash
# 停止 VictoriaMetrics
systemctl stop victoriametrics

# 恢复备份
./vmrestore \
  -src=s3://my-bucket/backups/latest \
  -storageDataPath=/var/lib/victoria-metrics-data

# 启动 VictoriaMetrics
systemctl start victoriametrics
```

#### 8.3.3 从 MinIO 恢复

```bash
# 停止 VictoriaMetrics
systemctl stop victoriametrics

# 恢复备份（自定义 S3 端点）
./vmrestore \
  -src=s3://my-bucket/backups/latest \
  -customS3Endpoint=http://minio-server:9000 \
  -storageDataPath=/var/lib/victoria-metrics-data

# 启动 VictoriaMetrics
systemctl start victoriametrics
```

#### 8.3.4 从本地文件系统恢复

```bash
# 停止 VictoriaMetrics
systemctl stop victoriametrics

# 恢复备份
./vmrestore \
  -src=fs:///mnt/backups/20250124 \
  -storageDataPath=/var/lib/victoria-metrics-data

# 启动 VictoriaMetrics
systemctl start victoriametrics
```

---

### 8.4 集群恢复

#### 8.4.1 集群恢复流程

**要求**：

- 在每个 vmstorage 节点上恢复对应的备份
- 停止所有 vmstorage 节点
- 恢复完成后启动所有节点

#### 8.4.2 集群恢复示例

**3 个 vmstorage 节点的恢复**：

```bash
# === vmstorage-1 节点 ===
# 停止 vmstorage-1
systemctl stop vmstorage-1

# 恢复备份
./vmrestore \
  -src=gs://my-bucket/vmstorage-1/20250124 \
  -storageDataPath=/var/lib/vmstorage-1-data

# 启动 vmstorage-1
systemctl start vmstorage-1


# === vmstorage-2 节点 ===
# 停止 vmstorage-2
systemctl stop vmstorage-2

# 恢复备份
./vmrestore \
  -src=gs://my-bucket/vmstorage-2/20250124 \
  -storageDataPath=/var/lib/vmstorage-2-data

# 启动 vmstorage-2
systemctl start vmstorage-2


# === vmstorage-3 节点 ===
# 停止 vmstorage-3
systemctl stop vmstorage-3

# 恢复备份
./vmrestore \
  -src=gs://my-bucket/vmstorage-3/20250124 \
  -storageDataPath=/var/lib/vmstorage-3-data

# 启动 vmstorage-3
systemctl start vmstorage-3
```

#### 8.4.3 Kubernetes 集群恢复

**使用 Init Container**：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: vmstorage-1
spec:
  initContainers:
    # Init Container: 恢复备份
    - name: vmrestore
      image: victoriametrics/vmrestore:latest
      volumeMounts:
        - name: storage
          mountPath: /storage
      command:
        - /vmrestore
        - -src=gs://bucket/vmstorage-1/20250124
        - -storageDataPath=/storage
      env:
        - name: GOOGLE_APPLICATION_CREDENTIALS
          value: /credentials/gcp-key.json
  
  containers:
    # 主容器: vmstorage
    - name: vmstorage
      image: victoriametrics/vmstorage:latest
      volumeMounts:
        - name: storage
          mountPath: /storage
```

---

### 8.5 恢复行为

#### 8.5.1 rsync 式同步

**恢复行为**类似 `rsync --delete`：

- ✅ 从备份中复制所有文件到目标目录
- ✅ 删除目标目录中备份不存在的文件
- ✅ 覆盖目标目录中已存在的同名文件

**示例**：

**场景 1：目标目录为空**

```
备份:      file1, file2, file3
目标目录:   (空)
恢复后:    file1, file2, file3
```

**场景 2：目标目录有旧数据**

```
备份:      file1, file2, file3
目标目录:   file1, file4, file5
恢复后:    file1, file2, file3  （file4 和 file5 被删除）
```

#### 8.5.2 断点续传

**中断恢复**：

- 恢复过程可随时中断（Ctrl+C、网络故障、系统重启等）
- 使用**相同参数**重启 vmrestore 自动从中断点继续
- 已下载的文件不会重新下载

**示例**：

```bash
# 第一次运行（中断）
./vmrestore -src=gs://bucket/backup -storageDataPath=/data
# ... 下载了 50% 后中断

# 重启（自动从 50% 继续）
./vmrestore -src=gs://bucket/backup -storageDataPath=/data
# ... 继续下载剩余 50%
```

---

### 8.6 凭据配置

vmrestore 的凭据配置方式与 vmbackup 完全相同。

#### 8.6.1 通过文件提供凭据

```bash
./vmrestore \
  -credsFilePath=/etc/credentials \
  -src=s3://bucket/backup \
  -storageDataPath=/data
```

#### 8.6.2 通过环境变量提供凭据

**AWS S3**：

```bash
export AWS_ACCESS_KEY_ID=<key>
export AWS_SECRET_ACCESS_KEY=<secret>

./vmrestore -src=s3://bucket/backup -storageDataPath=/data
```

**GCP**：

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

./vmrestore -src=gs://bucket/backup -storageDataPath=/data
```

**Azure**：

```bash
export AZURE_STORAGE_ACCOUNT_NAME=<account_name>
export AZURE_STORAGE_ACCOUNT_KEY=<account_key>

./vmrestore -src=azblob://container/backup -storageDataPath=/data
```

#### 8.6.3 云提供商元数据服务

在云环境中运行时，vmrestore 自动使用云提供商的元数据服务获取凭据：

- AWS EC2 Instance Profile
- GCP Service Account
- Azure Managed Identity

---

### 8.7 故障排查

#### 8.7.1 下载速度限制

**问题**：vmrestore 占用所有网络带宽

**解决方案**：

```bash
./vmrestore \
  -maxBytesPerSecond=50MB \  # 限制下载速度为 50 MB/s
  -src=gs://bucket/backup \
  -storageDataPath=/data
```

#### 8.7.2 恢复速度慢

**问题**：恢复耗时过长

**解决方案**：

```bash
./vmrestore \
  -concurrency=20 \  # 增加并发数（默认 10）
  -src=gs://bucket/backup \
  -storageDataPath=/data
```

#### 8.7.3 恢复中断

**问题**：恢复因临时错误中断

**解决方案**：

- 使用**相同参数**重启 vmrestore
- vmrestore 自动从中断点继续

```bash
# 重启恢复
./vmrestore -src=gs://bucket/backup -storageDataPath=/data
```

#### 8.7.4 旧备份缺少完整性标记

**问题**：恢复旧备份时报错"missing backup complete file"

**解决方案**：

```bash
./vmrestore \
  -skipBackupCompleteCheck \  # 跳过完整性检查
  -src=gs://bucket/old-backup \
  -storageDataPath=/data
```

**适用场景**：恢复在引入完整性检查前创建的旧备份。

---

### 8.8 核心 Flag 总览

#### 8.8.1 必需参数

| Flag                 | 说明                                           |
| -------------------- | ---------------------------------------------- |
| `-src`             | 备份源路径（必需）                             |
| `-storageDataPath` | 恢复目标路径（默认 `victoria-metrics-data`） |

#### 8.8.2 重要参数

**性能调优**：

- `-concurrency` - 并发工作线程数（默认 10）
- `-maxBytesPerSecond` - 最大下载速度限制

**凭据**：

- `-credsFilePath` - 凭据文件路径
- `-customS3Endpoint` - 自定义 S3 端点（MinIO 等）

**S3 配置**：

- `-s3ForcePathStyle` - 使用路径风格 URL（默认 true）
- `-s3StorageClass` - S3 存储类
- `-s3TLSInsecureSkipVerify` - 跳过 TLS 验证
- `-deleteAllObjectVersions` - 删除所有对象版本

**高级选项**：

- `-skipBackupCompleteCheck` - 跳过备份完整性检查（用于旧备份）
- `-filestream.disableFadvise` - 禁用 fadvise() 系统调用

**监控**：

- `-httpListenAddr` - HTTP 监听地址（默认 `:8421`）

---

### 8.9 最佳实践

#### 8.9.1 恢复前准备

1. ✅ **停止 VictoriaMetrics**

   - 单节点：停止 VictoriaMetrics 进程
   - 集群：停止所有 vmstorage 节点
2. ✅ **验证备份可用性**

   - 确认备份路径存在且可访问
   - 检查凭据配置正确
3. ✅ **备份当前数据**（可选）

   - 如果当前数据目录有重要数据，先备份

#### 8.9.2 恢复流程

**标准恢复流程**：

```bash
# 1. 停止服务
systemctl stop victoriametrics

# 2. 备份当前数据（可选）
mv /var/lib/victoria-metrics-data /var/lib/victoria-metrics-data.backup

# 3. 恢复备份
./vmrestore \
  -src=gs://bucket/backups/20250124 \
  -storageDataPath=/var/lib/victoria-metrics-data

# 4. 验证恢复结果
ls -lh /var/lib/victoria-metrics-data

# 5. 启动服务
systemctl start victoriametrics

# 6. 验证服务正常
curl http://localhost:8428/health
```

#### 8.9.3 集群恢复建议

1. ✅ **并行恢复**

   - 同时在所有 vmstorage 节点执行恢复
   - 缩短整体恢复时间
2. ✅ **验证一致性**

   - 确保所有节点恢复同一时间点的备份
   - 避免数据不一致
3. ✅ **分阶段启动**

   - 先启动一个节点验证
   - 确认无问题后启动其他节点

#### 8.9.4 安全建议

1. ✅ **使用 IAM Roles**

   - Kubernetes：使用 IAM Roles for Service Accounts
   - 避免在配置中硬编码凭据
2. ✅ **加密传输**

   - 使用 HTTPS 端点
   - 验证 TLS 证书
3. ✅ **访问控制**

   - 限制备份存储的读取权限
   - 使用最小权限原则

#### 8.9.5 测试恢复流程

**定期测试**：

- 至少每月测试一次恢复流程
- 验证备份的完整性和可用性
- 记录恢复所需时间

**测试环境**：

```bash
# 在测试环境恢复
./vmrestore \
  -src=gs://bucket/backups/latest \
  -storageDataPath=/tmp/test-restore

# 启动测试实例
./victoria-metrics -storageDataPath=/tmp/test-restore -httpListenAddr=:8429

# 验证数据
curl http://localhost:8429/api/v1/query?query=up

# 清理
rm -rf /tmp/test-restore
```

---

### 8.10 与 vmbackup 的配合使用

#### 8.10.1 完整备份恢复流程

**备份 → 恢复的完整示例**：

```bash
# === 备份阶段 ===
# 1. 创建备份
./vmbackup \
  -storageDataPath=/var/lib/victoria-metrics-data \
  -snapshot.createURL=http://localhost:8428/snapshot/create \
  -dst=gs://bucket/backups/20250124

# 2. 验证备份
./vmbackup \
  -src=gs://bucket/backups/20250124 \
  -dst=gs://bucket/test-restore-check


# === 恢复阶段 ===
# 3. 停止服务
systemctl stop victoriametrics

# 4. 恢复数据
./vmrestore \
  -src=gs://bucket/backups/20250124 \
  -storageDataPath=/var/lib/victoria-metrics-data

# 5. 启动服务
systemctl start victoriametrics
```

#### 8.10.2 Smart Backup 恢复

**恢复最新数据（latest）**：

```bash
./vmrestore \
  -src=gs://bucket/latest \
  -storageDataPath=/var/lib/victoria-metrics-data
```

**恢复特定日期数据**：

```bash
./vmrestore \
  -src=gs://bucket/20250120 \
  -storageDataPath=/var/lib/victoria-metrics-data
```

---

### 8.11 常见场景

#### 8.11.1 灾难恢复

**场景**：生产环境数据丢失

**恢复步骤**：

```bash
# 1. 停止故障节点
systemctl stop victoriametrics

# 2. 清空数据目录
rm -rf /var/lib/victoria-metrics-data/*

# 3. 从最新备份恢复
./vmrestore \
  -src=gs://bucket/latest \
  -storageDataPath=/var/lib/victoria-metrics-data

# 4. 启动服务
systemctl start victoriametrics

# 5. 验证数据
curl "http://localhost:8428/api/v1/query?query=up"
```

#### 8.11.2 迁移到新服务器

**场景**：将 VictoriaMetrics 迁移到新服务器

**步骤**：

```bash
# === 旧服务器 ===
# 1. 创建最新备份
./vmbackup \
  -storageDataPath=/var/lib/victoria-metrics-data \
  -snapshot.createURL=http://localhost:8428/snapshot/create \
  -dst=gs://bucket/migration-backup


# === 新服务器 ===
# 2. 安装 VictoriaMetrics
# ...

# 3. 恢复备份
./vmrestore \
  -src=gs://bucket/migration-backup \
  -storageDataPath=/var/lib/victoria-metrics-data

# 4. 启动服务
systemctl start victoriametrics

# 5. 更新 DNS / 负载均衡器指向新服务器
```

#### 8.11.3 测试环境同步

**场景**：将生产数据同步到测试环境

**步骤**：

```bash
# === 生产环境（定期备份）===
./vmbackup \
  -storageDataPath=/var/lib/victoria-metrics-data \
  -snapshot.createURL=http://localhost:8428/snapshot/create \
  -dst=gs://bucket/production-latest


# === 测试环境 ===
# 停止测试环境
systemctl stop victoriametrics-test

# 恢复生产数据
./vmrestore \
  -src=gs://bucket/production-latest \
  -storageDataPath=/var/lib/victoria-metrics-test-data

# 启动测试环境
systemctl start victoriametrics-test
```

---

### 8.12 总结

**vmrestore 核心优势**：

1. ✅ 简单易用的恢复流程
2. ✅ 自动断点续传
3. ✅ rsync 式智能同步
4. ✅ 支持多种对象存储
5. ✅ 与 vmbackup 完美配合

**关键要点**：

- ⚠️ 恢复前**必须停止** VictoriaMetrics
- ✅ 支持**断点续传**（中断后重启自动继续）
- ✅ 恢复行为类似 `rsync --delete`
- ✅ 凭据配置与 vmbackup 相同

**典型工作流**：

```mermaid
graph TD
    A[vmbackup 创建备份] --> B[备份存储到对象存储]
    B --> C[vmrestore 从备份恢复]
    C --> D[启动 VictoriaMetrics]
    D --> E[数据恢复完成]
```

**配合工具**：

- **vmbackup**：创建备份
- **vmrestore**：恢复备份
- **vmbackupmanager**（Enterprise）：自动化备份管理

**🎯 第 8 章完成！** 下一步将继续学习 bestpractices（最佳实践）...

---

---

## 第 9 章：最佳实践

### 🎯 生产级 VictoriaMetrics 监控系统架构

```mermaid
graph TB
    subgraph Data_Layer["数据源层"]
        D1[Kubernetes<br/>Pods & Services]
        D2[主机监控<br/>Node Exporter]
        D3[应用程序<br/>Custom Metrics]
        D4[Prometheus<br/>Federation]
        D5[第三方 Exporters<br/>MySQL/Redis/etc]
    end
  
    subgraph Collection_Layer["采集层 - vmagent 集群"]
        V1[vmagent-1<br/>HA Instance]
        V2[vmagent-2<br/>HA Instance]
    end
  
    subgraph Auth_Layer["认证路由层 - vmauth"]
        A1[vmauth<br/>Load Balancer]
    end
  
    subgraph Storage_Layer["存储层 - VictoriaMetrics Cluster"]
        direction TB
        I1[vminsert-1] & I2[vminsert-2] & I3[vminsert-3]
        S1[vmstorage-1] & S2[vmstorage-2] & S3[vmstorage-3]
        Q1[vmselect-1] & Q2[vmselect-2]
      
        I1 & I2 & I3 -->|shard & replicate| S1 & S2 & S3
        S1 & S2 & S3 -.->|query| Q1 & Q2
    end
  
    subgraph Alert_Layer["告警层"]
        AL1[vmalert-1<br/>HA Instance]
        AL2[vmalert-2<br/>HA Instance]
        AM[Alertmanager<br/>Cluster]
    end
  
    subgraph Backup_Layer["备份层"]
        B1[vmbackup<br/>Hourly + Daily]
        B2[Object Storage<br/>S3/GCS/Azure]
        B3[vmrestore<br/>Disaster Recovery]
    end
  
    subgraph Visualization_Layer["可视化层"]
        G1[Grafana<br/>Cluster]
    end
  
    %% Data flow
    D1 & D2 & D3 & D4 & D5 -->|scrape/push| V1 & V2
    V1 & V2 -->|remote write| A1
    A1 -->|auth & route| I1 & I2 & I3
  
    %% Alert flow
    AL1 & AL2 -.->|query rules| Q1 & Q2
    AL1 & AL2 -->|fire alerts| AM
    AM -->|notify| N[Email/Slack/PagerDuty]
  
    %% Backup flow
    S1 & S2 & S3 -->|snapshot| B1
    B1 -->|backup| B2
    B2 -.->|restore| B3
    B3 -.->|recover| S1 & S2 & S3
  
    %% Query flow
    A1 -->|query API| Q1 & Q2
    Q1 & Q2 -->|metrics| G1
  
    %% Styling
    style V1 fill:#e1f5ff
    style V2 fill:#e1f5ff
    style A1 fill:#fff4e1
    style I1 fill:#e1f5ff
    style I2 fill:#e1f5ff
    style I3 fill:#e1f5ff
    style S1 fill:#ffe1e1
    style S2 fill:#ffe1e1
    style S3 fill:#ffe1e1
    style Q1 fill:#fff4e1
    style Q2 fill:#fff4e1
    style AL1 fill:#e8f5e1
    style AL2 fill:#e8f5e1
    style B1 fill:#f0e1ff
    style B2 fill:#f0e1ff
    style B3 fill:#f0e1ff
```

**架构特点**：

- ✅ **高可用**: vmagent、vmalert、Grafana 采用 HA 部署
- ✅ **水平扩展**: VictoriaMetrics 集群支持按需扩展
- ✅ **安全认证**: vmauth 提供统一的认证和路由
- ✅ **自动备份**: vmbackup 实施 Smart Backup 策略
- ✅ **告警机制**: vmalert + Alertmanager 完整告警链路

**关键配置**：

- vmagent 配置去重：`-promscrape.cluster.name` 区分实例
- VictoriaMetrics 配置去重：`-dedup.minScrapeInterval=30s`
- vmauth 配置负载均衡：`load_balancing_policy: least_loaded`
- vmbackup 配置 Smart Backup：每小时增量 + 每日完整

---

### 9.1 安装建议

#### 9.1.1 版本选择

✅ **推荐使用最新版本**：

- 从 [Releases 页面](https://github.com/VictoriaMetrics/VictoriaMetrics/releases) 下载最新版本
- 最新版本包含所有 Bug 修复和性能优化
- 包含最新功能和增强

#### 9.1.2 默认配置

✅ **无需手动调优**：

- VictoriaMetrics 使用合理的默认命令行参数
- 自动根据可用的 CPU 和内存资源调整参数
- 无需操作系统级别调优（已针对默认 OS 设置优化）

#### 9.1.3 系统资源限制

**唯一需要调整的配置**：增加打开文件数限制

**原因**：

- VictoriaMetrics 需要接受更多的入站连接
- 需要保持更多的数据文件打开

**Linux 配置示例**：

**临时设置**：

```bash
# 当前会话
ulimit -n 65536
```

**永久设置**（`/etc/security/limits.conf`）：

```ini
# VictoriaMetrics 用户
victoriametrics soft nofile 65536
victoriametrics hard nofile 65536

# 或全局设置
* soft nofile 65536
* hard nofile 65536
```

**systemd 服务配置**（`/etc/systemd/system/victoriametrics.service`）：

```ini
[Service]
LimitNOFILE=65536
```

**验证配置**：

```bash
# 查看当前限制
ulimit -n

# 或查看进程限制
cat /proc/<pid>/limits | grep "open files"
```

---

### 9.2 文件系统

#### 9.2.1 推荐文件系统

✅ **推荐使用 ext4**

#### 9.2.2 ext4 优化配置

**适用场景**：

- 计划存储超过 1TB 数据
- 分区可能扩展到超过 16TB

**推荐的 mkfs.ext4 参数**：

```bash
mkfs.ext4 /dev/sdX -O 64bit,huge_file,extent -T huge
```

**参数说明**：

- **`-O 64bit`**：启用 64 位模式，支持大于 16TB 的文件系统
- **`-O huge_file`**：支持大文件（超过 2TB）
- **`-O extent`**：使用 extent 基础的文件分配
- **`-T huge`**：针对大文件优化的文件系统配置

#### 9.2.3 其他文件系统

VictoriaMetrics 也能在其他文件系统上正常工作：

- **XFS**：适合大文件和高并发
- **Btrfs**：提供快照和压缩功能
- **ZFS**：提供数据完整性和快照

**注意**：虽然支持，但 ext4 是经过最充分测试和推荐的选择。

---

### 9.3 操作系统支持

#### 9.3.1 生产就绪的操作系统

✅ **完全支持以下操作系统**：

| 操作系统                  | 说明                                            |
| ------------------------- | ----------------------------------------------- |
| **Linux**           | Alpine, Ubuntu, Debian, RedHat, CentOS, RHEL 等 |
| **FreeBSD**         | 生产就绪                                        |
| **OpenBSD**         | 生产就绪                                        |
| **Solaris/SmartOS** | 生产就绪                                        |

#### 9.3.2 实验性支持

⚠️ **Windows**：实验性支持（建议仅用于测试）

#### 9.3.3 开发测试环境

✅ **macOS**：可用于测试和开发

---

### 9.4 支持的架构

#### 9.4.1 按操作系统分类

| 操作系统                  | 支持的架构                              |
| ------------------------- | --------------------------------------- |
| **Linux**           | i386, amd64, arm, arm64, ppc64le, s390x |
| **FreeBSD**         | i386, amd64, arm                        |
| **OpenBSD**         | i386, amd64, arm                        |
| **Solaris/SmartOS** | i386, amd64                             |
| **macOS**           | amd64, arm64（仅测试和开发）            |
| **Windows**         | amd64（实验性）                         |

#### 9.4.2 常见架构说明

| 架构              | 说明                  | 典型硬件                  |
| ----------------- | --------------------- | ------------------------- |
| **amd64**   | 64 位 x86             | Intel/AMD 服务器、桌面    |
| **arm64**   | 64 位 ARM             | AWS Graviton、Apple M1/M2 |
| **arm**     | 32 位 ARM             | Raspberry Pi 等           |
| **ppc64le** | 64 位 PowerPC（小端） | IBM Power 服务器          |
| **s390x**   | 64 位 IBM Z           | IBM Z 系列大型机          |

---

### 9.5 Kubernetes 部署

#### 9.5.1 部署方式

VictoriaMetrics 原生支持 Kubernetes 部署：

1. **Helm Charts**：

   ```bash
   # 添加 Helm 仓库
   helm repo add vm https://victoriametrics.github.io/helm-charts/
   helm repo update

   # 单节点部署
   helm install victoria-metrics vm/victoria-metrics-single

   # 集群部署
   helm install victoria-metrics vm/victoria-metrics-cluster
   ```

2. **Kubernetes Operator**：

   - 更高级的部署和管理
   - 自动化操作
   - 参考：[k8s operator 快速开始](https://docs.victoriametrics.com/operator/)

#### 9.5.2 Kubernetes 部署建议

**1. 资源配置：Requests = Limits**

✅ **推荐**：对于有状态组件（如 vmstorage），设置 requests = limits

**原因**：

- 避免不必要的组件重启
- 确保资源稳定性
- Kubernetes 不会因为节点资源压力驱逐 Pod

**示例**：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: vmstorage
spec:
  containers:
    - name: vmstorage
      image: victoriametrics/vmstorage:latest
      resources:
        requests:
          memory: "16Gi"
          cpu: "4"        # 整数 CPU
        limits:
          memory: "16Gi"
          cpu: "4"        # 与 requests 相同
```

**2. 避免使用小数 CPU**

⚠️ **不推荐**：使用小数 CPU 单位（如 `0.5`、`1.5`）

**原因**：

- VictoriaMetrics 使用 Go 编写
- Go runtime 需要指定**整数**并发线程数
- 小数 CPU 会被自动向下取整，导致性能损失

**示例**：

```yaml
# ❌ 不推荐
resources:
  limits:
    cpu: "1.5"  # 会被取整为 1

# ✅ 推荐
resources:
  limits:
    cpu: "2"    # 使用整数
```

---

### 9.6 升级流程

#### 9.6.1 升级安全性

✅ **安全升级**：

- 升级到新版本是安全的（除非发行说明另有说明）
- 可以跨多个版本升级（除非发行说明另有说明）
- 建议定期升级到最新版本

✅ **安全降级**：

- 降级到之前的版本是安全的（除非发行说明另有说明）

#### 9.6.2 升级步骤

**单节点 VictoriaMetrics 升级**：

```bash
# 1. 发送 SIGINT 信号优雅停止
kill -SIGINT $(pidof victoria-metrics)
# 或使用 systemd
systemctl stop victoriametrics

# 2. 等待进程完全停止（通常几秒钟）
# 可以通过以下命令确认
ps aux | grep victoria-metrics

# 3. 备份当前二进制文件（可选）
cp /usr/local/bin/victoria-metrics /usr/local/bin/victoria-metrics.backup

# 4. 替换为新版本
wget https://github.com/VictoriaMetrics/VictoriaMetrics/releases/download/<version>/victoria-metrics-linux-amd64-<version>.tar.gz
tar -xzf victoria-metrics-linux-amd64-<version>.tar.gz
mv victoria-metrics-prod /usr/local/bin/victoria-metrics

# 5. 启动新版本
systemctl start victoriametrics
# 或直接运行
/usr/local/bin/victoria-metrics <flags>

# 6. 验证服务正常
curl http://localhost:8428/health
```

**集群升级**：

**推荐升级顺序**：

1. vmselect（查询节点）
2. vminsert（写入节点）
3. vmstorage（存储节点）

**原因**：vmstorage 最关键，最后升级以减少风险。

**集群升级示例**：

```bash
# === 升级 vmselect ===
# 在每个 vmselect 节点上
kill -SIGINT $(pidof vmselect)
# 替换二进制文件
systemctl start vmselect

# === 升级 vminsert ===
# 在每个 vminsert 节点上
kill -SIGINT $(pidof vminsert)
# 替换二进制文件
systemctl start vminsert

# === 升级 vmstorage ===
# 在每个 vmstorage 节点上（逐个升级）
kill -SIGINT $(pidof vmstorage)
# 替换二进制文件
systemctl start vmstorage
```

#### 9.6.3 降级步骤

**降级流程**与升级相同：

```bash
# 1. 停止服务
kill -SIGINT $(pidof victoria-metrics)

# 2. 恢复旧版本二进制文件
cp /usr/local/bin/victoria-metrics.backup /usr/local/bin/victoria-metrics

# 3. 启动服务
systemctl start victoriametrics
```

#### 9.6.4 升级注意事项

1. ✅ **阅读发行说明**

   - 检查是否有破坏性变更
   - 了解新功能和 Bug 修复
   - 确认升级/降级的特殊要求
2. ✅ **备份数据**

   - 升级前使用 vmbackup 备份数据
   - 保留旧版本二进制文件
3. ✅ **测试环境验证**

   - 先在测试环境升级
   - 验证功能和性能
   - 确认无问题后再升级生产环境
4. ✅ **监控升级过程**

   - 观察日志输出
   - 监控关键指标（查询延迟、写入速率等）
   - 准备回滚方案

---

### 9.7 备份建议

#### 9.7.1 备份工具

VictoriaMetrics 支持以下备份工具：

| 工具                      | 说明                         |
| ------------------------- | ---------------------------- |
| **vmbackup**        | 创建备份                     |
| **vmrestore**       | 恢复备份                     |
| **vmbackupmanager** | 自动化备份管理（Enterprise） |

#### 9.7.2 备份策略建议

✅ **使用 Smart Backup 策略**：

- 每小时增量备份到 `latest`
- 每天完整备份到 `YYYYMMDD`
- 定期清理过期备份

✅ **备份频率**：

- 小时级增量备份：每小时一次
- 日级完整备份：每天一次
- 周级备份：根据需求保留
- 月级备份：根据需求保留

✅ **备份保留策略**：

- 小时级备份：保留 24-48 小时
- 日级备份：保留 7-30 天
- 周级备份：保留 4-12 周
- 月级备份：保留 3-12 个月

#### 9.7.3 验证备份

✅ **定期验证**：

- 至少每月测试恢复流程
- 验证备份完整性
- 记录恢复所需时间

**测试恢复示例**：

```bash
# 在测试环境恢复最新备份
./vmrestore \
  -src=gs://bucket/backups/latest \
  -storageDataPath=/tmp/restore-test

# 启动测试实例
./victoria-metrics -storageDataPath=/tmp/restore-test -httpListenAddr=:8429

# 验证数据
curl "http://localhost:8429/api/v1/query?query=up"

# 清理
rm -rf /tmp/restore-test
```

---

### 9.8 综合最佳实践清单

#### 9.8.1 安装和配置

- [ ] 使用最新稳定版本
- [ ] 增加系统打开文件数限制（65536+）
- [ ] 使用 ext4 文件系统（大数据场景）
- [ ] 使用推荐的 ext4 格式化参数（大于 1TB）
- [ ] 在生产就绪的操作系统上部署（Linux、FreeBSD 等）

#### 9.8.2 Kubernetes 部署

- [ ] 有状态组件设置 requests = limits
- [ ] 使用整数 CPU 单位（避免小数）
- [ ] 使用 Helm Charts 或 Operator 部署
- [ ] 配置持久化存储（PVC）
- [ ] 配置适当的资源请求和限制

#### 9.8.3 升级和维护

- [ ] 阅读发行说明
- [ ] 在测试环境验证
- [ ] 升级前备份数据
- [ ] 使用优雅停止（SIGINT）
- [ ] 监控升级过程
- [ ] 保留回滚能力

#### 9.8.4 备份和恢复

- [ ] 实施 Smart Backup 策略
- [ ] 配置自动化备份（cron 或 vmbackupmanager）
- [ ] 定期清理旧备份
- [ ] 每月测试恢复流程
- [ ] 验证备份完整性
- [ ] 记录 RTO（恢复时间目标）

#### 9.8.5 监控和告警

- [ ] 配置 VictoriaMetrics 自监控
- [ ] 导入官方 Grafana Dashboard
- [ ] 配置关键指标告警：
  - 内存使用率
  - 磁盘使用率
  - 查询延迟
  - 写入速率
  - 慢查询数量
- [ ] 配置备份成功率告警

#### 9.8.6 安全建议

- [ ] 使用 `-httpAuth` 保护 HTTP 端点
- [ ] 限制网络访问（防火墙规则）
- [ ] 使用 TLS 加密传输（生产环境）
- [ ] 定期更新到最新版本（安全补丁）
- [ ] 审计访问日志

---

### 9.9 总结

**核心最佳实践**：

1. ✅ **使用最新版本** - 获得最佳性能和最新功能
2. ✅ **增加文件描述符限制** - 唯一必要的系统调优
3. ✅ **选择正确的文件系统** - ext4 是推荐选择
4. ✅ **Kubernetes 资源配置** - requests = limits，整数 CPU
5. ✅ **优雅升级** - SIGINT 停止，小心验证
6. ✅ **Smart Backup 策略** - 增量 + 完整备份结合
7. ✅ **定期验证备份** - 确保灾难恢复能力

**关键要点**：

- VictoriaMetrics 开箱即用，无需复杂调优
- 默认配置已针对常见场景优化
- follow 官方建议可获得最佳性能和稳定性

**配合工具生态**：

```mermaid
graph TD
    A[VictoriaMetrics] -->|数据采集| B[vmagent]
    A -->|告警规则| C[vmalert]
    A -->|认证路由| D[vmauth]
    A -->|数据备份| E[vmbackup]
    E -->|数据恢复| F[vmrestore]
    E -->|自动化| G[vmbackupmanager<br/>Enterprise]
    A -->|可视化| H[Grafana]
    A -->|监控| I[官方 Dashboard]
```

**🎉 恭喜！VictoriaMetrics 学习笔记全部完成！**

---

## 附录

### 附录 A：官方资源

- **官方文档**: [https://docs.victoriametrics.com/](https://docs.victoriametrics.com/)
- **GitHub 仓库**: [https://github.com/VictoriaMetrics/VictoriaMetrics](https://github.com/VictoriaMetrics/VictoriaMetrics)
- **Releases**: [https://github.com/VictoriaMetrics/VictoriaMetrics/releases](https://github.com/VictoriaMetrics/VictoriaMetrics/releases)
- **Helm Charts**: [https://github.com/VictoriaMetrics/helm-charts](https://github.com/VictoriaMetrics/helm-charts)
- **Kubernetes Operator**: [https://docs.victoriametrics.com/operator/](https://docs.victoriametrics.com/operator/)
- **Grafana Dashboards**: [https://grafana.com/orgs/victoriametrics](https://grafana.com/orgs/victoriametrics)

### 附录 B：社区与支持

- **Slack**: [https://slack.victoriametrics.com/](https://slack.victoriametrics.com/)
- **Google Group**: [https://groups.google.com/g/victoriametrics-users](https://groups.google.com/g/victoriametrics-users)
- **Stack Overflow**: 标签 `victoriametrics`
- **Commercial Support**: <info@victoriametrics.com>

### 附录 C：学习路径建议

**入门路径**（1-2 周）：

1. 阅读第 1 章：快速开始
2. 实践第 2 章：单节点部署
3. 学习第 4 章：vmagent 数据采集
4. 学习第 5 章：vmalert 告警规则
5. 实践第 7 章：vmbackup 备份

**进阶路径**（2-4 周）：

1. 学习第 3 章：集群部署
2. 学习第 6 章：vmauth 认证与路由
3. 深入研究 MetricsQL 查询语言
4. 配置 Grafana Dashboard
5. 实施 Smart Backup 策略

**生产部署**（持续）：

1. 按第 9 章最佳实践部署
2. 配置完善的监控告警
3. 定期升级和维护
4. 性能调优和优化

---

**文档编写完成时间**: 2025-11-24
**文档版本**: v1.0
**涵盖 VictoriaMetrics 版本**: 最新稳定版

**愿本学习笔记帮助你掌握 VictoriaMetrics，构建高性能的监控系统！** 🚀

---
