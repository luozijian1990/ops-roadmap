# VictoriaMetrics 学习笔记 · 第三册：备份、恢复与实践

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
