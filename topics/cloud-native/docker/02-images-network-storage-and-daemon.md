# Docker 学习笔记 · 第二册：镜像、网络、存储与守护进程

## 第四章 镜像管理
### 4.1 镜像获取命令（pull/push）


本章介绍 Docker 镜像的管理命令，包括获取、查看、构建和删除等操作。


#### docker pull：拉取镜像

`docker pull` 命令用于**从镜像仓库拉取镜像到本地**。

##### 语法格式

```bash
docker pull [OPTIONS] NAME[:TAG|@DIGEST]
```

##### 常用选项

| 选项                        | 说明                       |
| --------------------------- | -------------------------- |
| `-a, --all-tags`          | 拉取所有标签               |
| `--platform`              | 指定平台（如 linux/amd64） |
| `-q, --quiet`             | 静默输出                   |
| `--disable-content-trust` | 跳过镜像验证               |

##### 镜像名称格式

```
[registry/][repository/]name[:tag|@digest]
```

| 组件       | 说明     | 示例                             |
| ---------- | -------- | -------------------------------- |
| registry   | 仓库地址 | `docker.io`, `gcr.io`        |
| repository | 命名空间 | `library`, `nginx`           |
| name       | 镜像名   | `nginx`, `alpine`            |
| tag        | 标签     | `latest`, `1.25`, `alpine` |
| digest     | 摘要     | `sha256:abc123...`             |

##### 实战示例

**示例 1：拉取最新版本**

```bash
$ docker pull nginx
Using default tag: latest
latest: Pulling from library/nginx
...
Status: Downloaded newer image for nginx:latest
docker.io/library/nginx:latest
```

**示例 2：拉取指定版本**

```bash
docker pull nginx:1.25-alpine
docker pull redis:7.2
docker pull python:3.11-slim
```

**示例 3：拉取指定摘要（不可变）**

```bash
docker pull nginx@sha256:abc123def456...
```

**示例 4：从私有仓库拉取**

```bash
# 先登录
$ docker login registry.example.com

# 拉取镜像
$ docker pull registry.example.com/myapp:v1.0
```

**示例 5：指定平台**

```bash
# 拉取 ARM64 版本
$ docker pull --platform linux/arm64 nginx

# 拉取 AMD64 版本
$ docker pull --platform linux/amd64 nginx
```

**示例 6：拉取所有标签**

```bash
docker pull -a alpine
```

> ⚠️ **注意**：拉取所有标签可能需要大量磁盘空间。

---

#### docker push：推送镜像

`docker push` 命令用于**将本地镜像推送到镜像仓库**。

##### 语法格式

```bash
docker push [OPTIONS] NAME[:TAG]
```

##### 常用选项

| 选项                        | 说明         |
| --------------------------- | ------------ |
| `-a, --all-tags`          | 推送所有标签 |
| `-q, --quiet`             | 静默输出     |
| `--disable-content-trust` | 跳过镜像签名 |

##### 推送前准备

1. 登录目标仓库
2. 为镜像打标签（包含仓库地址）

##### 实战示例

**示例 1：推送到 Docker Hub**

```bash
# 1. 登录
$ docker login

# 2. 为镜像打标签
$ docker tag myapp:latest username/myapp:v1.0

# 3. 推送
$ docker push username/myapp:v1.0
```

**示例 2：推送到私有仓库**

```bash
# 1. 登录私有仓库
$ docker login registry.example.com

# 2. 打标签
$ docker tag myapp:latest registry.example.com/team/myapp:v1.0

# 3. 推送
$ docker push registry.example.com/team/myapp:v1.0
```

**示例 3：推送所有标签**

```bash
docker push -a username/myapp
```

---

#### docker login / logout：登录登出

##### docker login

```bash
# 交互式登录
$ docker login

# 指定仓库
$ docker login registry.example.com

# 非交互式（CI/CD）
$ docker login -u $USER -p $PASSWORD registry.example.com

# 使用 stdin 传递密码（更安全）
$ echo $PASSWORD | docker login -u $USER --password-stdin
```

##### docker logout

```bash
# 登出 Docker Hub
$ docker logout

# 登出指定仓库
$ docker logout registry.example.com
```

---

#### docker search：搜索镜像

`docker search` 命令用于**在 Docker Hub 搜索镜像**。

```bash
# 基本搜索
$ docker search nginx

# 限制结果数
$ docker search --limit 5 nginx

# 过滤官方镜像
$ docker search --filter is-official=true nginx

# 过滤星标数
$ docker search --filter stars=100 nginx
```

##### 输出字段

| 字段        | 说明         |
| ----------- | ------------ |
| NAME        | 镜像名称     |
| DESCRIPTION | 描述         |
| STARS       | 星标数       |
| OFFICIAL    | 是否官方     |
| AUTOMATED   | 是否自动构建 |

---

#### 镜像获取命令小结

| 命令              | 作用     | 示例                        |
| ----------------- | -------- | --------------------------- |
| `docker pull`   | 拉取镜像 | `docker pull nginx:1.25`  |
| `docker push`   | 推送镜像 | `docker push user/app:v1` |
| `docker login`  | 登录仓库 | `docker login`            |
| `docker logout` | 登出仓库 | `docker logout`           |
| `docker search` | 搜索镜像 | `docker search nginx`     |

---

### 4.2 镜像查看命令（ls/history/inspect）

#### docker images / docker image ls：列出镜像

`docker images` 命令用于**列出本地镜像**。

##### 语法格式

```bash
docker images [OPTIONS] [REPOSITORY[:TAG]]
docker image ls [OPTIONS] [REPOSITORY[:TAG]]
```

##### 常用选项

| 选项             | 说明                       |
| ---------------- | -------------------------- |
| `-a, --all`    | 显示所有镜像（包括中间层） |
| `-q, --quiet`  | 只显示镜像 ID              |
| `--digests`    | 显示摘要                   |
| `--no-trunc`   | 不截断输出                 |
| `-f, --filter` | 过滤条件                   |
| `--format`     | 格式化输出                 |

##### 实战示例

**示例 1：列出所有镜像**

```bash
$ docker images
REPOSITORY   TAG       IMAGE ID       CREATED        SIZE
nginx        1.25      a8758716bb6a   2 weeks ago    187MB
redis        7.2       7614ae9453d1   3 weeks ago    138MB
alpine       latest    c059bfaa849c   4 weeks ago    7.73MB
```

**示例 2：只显示镜像 ID**

```bash
$ docker images -q
a8758716bb6a
7614ae9453d1
c059bfaa849c
```

**示例 3：按仓库过滤**

```bash
$ docker images nginx
REPOSITORY   TAG          IMAGE ID       CREATED        SIZE
nginx        1.25         a8758716bb6a   2 weeks ago    187MB
nginx        alpine       d0a9baf36a14   2 weeks ago    43.3MB
```

**示例 4：使用过滤器**

```bash
# 悬空镜像（无标签）
$ docker images -f dangling=true

# 指定时间之前创建的镜像
$ docker images -f before=nginx:1.25

# 指定标签的镜像
$ docker images -f label=maintainer=nginx
```

**示例 5：格式化输出**

```bash
# 自定义格式
$ docker images --format "{{.Repository}}:{{.Tag}} - {{.Size}}"
nginx:1.25 - 187MB
redis:7.2 - 138MB

# 表格格式
$ docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
```

##### 输出列说明

| 列         | 说明          |
| ---------- | ------------- |
| REPOSITORY | 仓库名        |
| TAG        | 标签          |
| IMAGE ID   | 镜像 ID（短） |
| CREATED    | 创建时间      |
| SIZE       | 镜像大小      |

---

#### docker history：查看镜像历史

`docker history` 命令用于**查看镜像的构建历史**。

##### 语法格式

```bash
docker history [OPTIONS] IMAGE
```

##### 常用选项

| 选项            | 说明                 |
| --------------- | -------------------- |
| `-H, --human` | 人类可读格式（默认） |
| `--no-trunc`  | 不截断输出           |
| `-q, --quiet` | 只显示镜像 ID        |
| `--format`    | 格式化输出           |

##### 实战示例

**示例 1：查看镜像历史**

```bash
$ docker history nginx:1.25
IMAGE          CREATED       CREATED BY                                      SIZE
a8758716bb6a   2 weeks ago   CMD ["nginx" "-g" "daemon off;"]                0B
<missing>      2 weeks ago   STOPSIGNAL SIGQUIT                              0B
<missing>      2 weeks ago   EXPOSE 80                                       0B
<missing>      2 weeks ago   ENTRYPOINT ["/docker-entrypoint.sh"]            0B
...
```

**示例 2：显示完整命令**

```bash
docker history --no-trunc nginx:1.25
```

**示例 3：格式化输出**

```bash
docker history --format "{{.CreatedBy}}" nginx:1.25
```

##### 输出列说明

| 列         | 说明           |
| ---------- | -------------- |
| IMAGE      | 层 ID          |
| CREATED    | 创建时间       |
| CREATED BY | 创建该层的命令 |
| SIZE       | 该层大小       |
| COMMENT    | 注释           |

---

#### docker inspect：查看详细信息

`docker image inspect` 命令用于**查看镜像的详细元数据**。

##### 语法格式

```bash
docker image inspect [OPTIONS] IMAGE [IMAGE...]
```

##### 常用选项

| 选项             | 说明                  |
| ---------------- | --------------------- |
| `-f, --format` | 格式化输出（Go 模板） |
| `-s, --size`   | 显示文件大小          |

##### 实战示例

**示例 1：查看完整信息**

```bash
$ docker image inspect nginx:1.25
[
    {
        "Id": "sha256:a8758716bb6a...",
        "RepoTags": ["nginx:1.25"],
        "Created": "2024-01-15T12:00:00Z",
        ...
    }
]
```

**示例 2：提取特定字段**

```bash
# 获取镜像 ID
$ docker image inspect -f '{{.Id}}' nginx:1.25
sha256:a8758716bb6a...

# 获取创建时间
$ docker image inspect -f '{{.Created}}' nginx:1.25

# 获取暴露端口
$ docker image inspect -f '{{.Config.ExposedPorts}}' nginx:1.25
map[80/tcp:{}]

# 获取环境变量
$ docker image inspect -f '{{.Config.Env}}' nginx:1.25

# 获取入口点
$ docker image inspect -f '{{.Config.Entrypoint}}' nginx:1.25
```

**示例 3：获取镜像大小**

```bash
$ docker image inspect -f '{{.Size}}' nginx:1.25
187654321
```

**示例 4：获取镜像层**

```bash
docker image inspect -f '{{range .RootFS.Layers}}{{println .}}{{end}}' nginx:1.25
```

##### 常用 inspect 字段

| 字段路径                 | 说明         |
| ------------------------ | ------------ |
| `.Id`                  | 镜像 ID      |
| `.RepoTags`            | 标签列表     |
| `.Created`             | 创建时间     |
| `.Size`                | 大小（字节） |
| `.Config.Env`          | 环境变量     |
| `.Config.Cmd`          | 默认命令     |
| `.Config.Entrypoint`   | 入口点       |
| `.Config.ExposedPorts` | 暴露端口     |
| `.Config.WorkingDir`   | 工作目录     |
| `.RootFS.Layers`       | 层列表       |

---

#### 镜像查看命令小结

| 命令                     | 作用     | 示例                           |
| ------------------------ | -------- | ------------------------------ |
| `docker images`        | 列出镜像 | `docker images -q`           |
| `docker history`       | 查看历史 | `docker history nginx`       |
| `docker image inspect` | 查看详情 | `docker image inspect nginx` |

---

### 4.3 镜像导入导出命令（save/load/import/export）

镜像导入导出用于在不同环境之间迁移镜像，特别是在无法访问仓库的离线环境中。

#### docker save：导出镜像

`docker save` 命令用于**将镜像保存为 tar 归档文件**。

##### 语法格式

```bash
docker save [OPTIONS] IMAGE [IMAGE...]
```

##### 常用选项

| 选项             | 说明       |
| ---------------- | ---------- |
| `-o, --output` | 输出到文件 |

##### 实战示例

**示例 1：导出单个镜像**

```bash
docker save -o nginx.tar nginx:1.25
```

**示例 2：使用重定向**

```bash
docker save nginx:1.25 > nginx.tar
```

**示例 3：导出多个镜像**

```bash
docker save -o images.tar nginx:1.25 redis:7.2 alpine:latest
```

**示例 4：压缩导出**

```bash
docker save nginx:1.25 | gzip > nginx.tar.gz
```

**示例 5：导出所有镜像**

```bash
docker save -o all-images.tar $(docker images -q)
```

---

#### docker load：导入镜像

`docker load` 命令用于**从 tar 归档文件加载镜像**。

##### 语法格式

```bash
docker load [OPTIONS]
```

##### 常用选项

| 选项            | 说明       |
| --------------- | ---------- |
| `-i, --input` | 从文件读取 |
| `-q, --quiet` | 静默输出   |

##### 实战示例

**示例 1：导入镜像**

```bash
$ docker load -i nginx.tar
Loaded image: nginx:1.25
```

**示例 2：使用重定向**

```bash
docker load < nginx.tar
```

**示例 3：导入压缩文件**

```bash
gunzip -c nginx.tar.gz | docker load
```

**示例 4：从远程 URL 导入**

```bash
curl -sL https://example.com/images/nginx.tar | docker load
```

---

#### docker export：导出容器

`docker export` 命令用于**将容器的文件系统导出为 tar 归档**。

> ⚠️ **注意**：`export` 导出的是容器的文件系统，不包含镜像的历史和元数据。

##### 语法格式

```bash
docker export [OPTIONS] CONTAINER
```

##### 常用选项

| 选项             | 说明       |
| ---------------- | ---------- |
| `-o, --output` | 输出到文件 |

##### 实战示例

```bash
# 导出容器
$ docker export -o mycontainer.tar mycontainer

# 使用重定向
$ docker export mycontainer > mycontainer.tar
```

---

#### docker import：从归档创建镜像

`docker import` 命令用于**从 tar 归档创建新镜像**。

##### 语法格式

```bash
docker import [OPTIONS] file|URL|- [REPOSITORY[:TAG]]
```

##### 常用选项

| 选项              | 说明                 |
| ----------------- | -------------------- |
| `-c, --change`  | 应用 Dockerfile 指令 |
| `-m, --message` | 提交信息             |

##### 实战示例

**示例 1：从文件导入**

```bash
docker import mycontainer.tar myimage:v1
```

**示例 2：从 URL 导入**

```bash
docker import https://example.com/rootfs.tar myimage:v1
```

**示例 3：添加元数据**

```bash
docker import -c 'CMD ["nginx"]' -c 'EXPOSE 80' mycontainer.tar nginx:custom
```

---

#### save/load vs export/import

| 特性       | save/load | export/import |
| ---------- | --------- | ------------- |
| 对象       | 镜像      | 容器          |
| 保留历史   | ✅ 是     | ❌ 否         |
| 保留元数据 | ✅ 是     | ❌ 否         |
| 保留层结构 | ✅ 是     | ❌ 否（单层） |
| 文件大小   | 较大      | 较小          |
| 用途       | 镜像迁移  | 快照、备份    |

---

#### 实战场景

##### 场景 1：离线环境部署

```bash
# 在有网环境
$ docker pull nginx:1.25
$ docker save -o nginx.tar nginx:1.25

# 拷贝到离线环境
$ scp nginx.tar user@offline-server:/tmp/

# 在离线环境加载
$ docker load -i /tmp/nginx.tar
```

##### 场景 2：批量迁移镜像

```bash
# 导出所有镜像
$ docker save -o all-images.tar $(docker images --format "{{.Repository}}:{{.Tag}}" | grep -v "<none>")

# 导入所有镜像
$ docker load -i all-images.tar
```

##### 场景 3：创建自定义基础镜像

```bash
# 创建并配置容器
$ docker run -it --name mybase alpine sh
# ... 安装软件、配置环境 ...

# 导出容器
$ docker export -o mybase.tar mybase

# 创建镜像
$ docker import mybase.tar mybase:v1
```

---

#### 镜像导入导出命令小结

| 命令              | 作用           | 示例                               |
| ----------------- | -------------- | ---------------------------------- |
| `docker save`   | 导出镜像       | `docker save -o nginx.tar nginx` |
| `docker load`   | 导入镜像       | `docker load -i nginx.tar`       |
| `docker export` | 导出容器       | `docker export -o app.tar app`   |
| `docker import` | 从归档创建镜像 | `docker import app.tar myapp:v1` |

---

### 4.4 镜像维护命令（tag/rm/prune）

镜像维护命令用于管理本地镜像，包括重命名、删除和清理操作。

#### docker tag：镜像标签

`docker tag` 命令用于**为镜像创建新的标签**。

##### 语法格式

```bash
docker tag SOURCE_IMAGE[:TAG] TARGET_IMAGE[:TAG]
```

##### 实战示例

**示例 1：创建新标签**

```bash
docker tag nginx:1.25 nginx:latest
```

**示例 2：准备推送到私有仓库**

```bash
docker tag myapp:v1 registry.example.com/team/myapp:v1
```

**示例 3：创建版本标签**

```bash
docker tag myapp:latest myapp:v1.0.0
docker tag myapp:latest myapp:v1.0
docker tag myapp:latest myapp:v1
```

**示例 4：使用镜像 ID**

```bash
docker tag a8758716bb6a myapp:v2
```

> 💡 `docker tag` 不会复制镜像，只是创建一个指向同一镜像的新引用。

---

#### docker rmi / docker image rm：删除镜像

`docker rmi` 命令用于**删除本地镜像**。

##### 语法格式

```bash
docker rmi [OPTIONS] IMAGE [IMAGE...]
docker image rm [OPTIONS] IMAGE [IMAGE...]
```

##### 常用选项

| 选项            | 说明                 |
| --------------- | -------------------- |
| `-f, --force` | 强制删除             |
| `--no-prune`  | 不删除未标记的父镜像 |

##### 实战示例

**示例 1：删除单个镜像**

```bash
$ docker rmi nginx:1.25
Untagged: nginx:1.25
Deleted: sha256:a8758716bb6a...
```

**示例 2：删除多个镜像**

```bash
docker rmi nginx:1.25 redis:7.2 alpine:latest
```

**示例 3：强制删除（有容器使用时）**

```bash
docker rmi -f nginx:1.25
```

**示例 4：使用镜像 ID 删除**

```bash
docker rmi a8758716bb6a
```

**示例 5：删除所有镜像**

```bash
docker rmi $(docker images -q)
```

**示例 6：删除悬空镜像**

```bash
docker rmi $(docker images -f dangling=true -q)
```

##### 删除失败的常见原因

| 错误                             | 原因           | 解决方案                   |
| -------------------------------- | -------------- | -------------------------- |
| image is being used              | 有容器使用     | 先停止/删除容器            |
| image has dependent child images | 有子镜像依赖   | 先删除子镜像               |
| conflict: unable to delete       | 镜像有多个标签 | 使用 `-f` 或删除所有标签 |

---

#### docker image prune：清理镜像

`docker image prune` 命令用于**清理未使用的镜像**。

##### 语法格式

```bash
docker image prune [OPTIONS]
```

##### 常用选项

| 选项            | 说明                             |
| --------------- | -------------------------------- |
| `-a, --all`   | 删除所有未使用镜像，不仅是悬空的 |
| `-f, --force` | 不提示确认                       |
| `--filter`    | 过滤条件                         |

##### 实战示例

**示例 1：清理悬空镜像**

```bash
$ docker image prune
WARNING! This will remove all dangling images.
Are you sure you want to continue? [y/N] y
Total reclaimed space: 1.2GB
```

**示例 2：清理所有未使用镜像**

```bash
docker image prune -a
```

**示例 3：强制清理（不提示）**

```bash
docker image prune -f
```

**示例 4：按时间过滤**

```bash
# 清理 24 小时前创建的镜像
$ docker image prune -a --filter "until=24h"

# 清理 7 天前的镜像
$ docker image prune -a --filter "until=168h"
```

**示例 5：按标签过滤**

```bash
# 清理没有特定标签的镜像
$ docker image prune -a --filter "label!=keep"
```

---

#### docker system prune：系统清理

`docker system prune` 命令用于**清理所有未使用的 Docker 资源**。

```bash
# 清理未使用的容器、网络、悬空镜像
$ docker system prune

# 清理所有未使用资源（包括未使用的镜像和卷）
$ docker system prune -a --volumes

# 查看磁盘使用情况
$ docker system df
```

##### docker system df 输出示例

```
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          15        3         8.2GB     5.8GB (70%)
Containers      5         2         120MB     80MB (66%)
Local Volumes   8         4         2.1GB     1.2GB (57%)
Build Cache     25        0         1.5GB     1.5GB (100%)
```

---

#### 镜像维护命令小结

| 命令                    | 作用     | 示例                                   |
| ----------------------- | -------- | -------------------------------------- |
| `docker tag`          | 创建标签 | `docker tag nginx:1.25 nginx:latest` |
| `docker rmi`          | 删除镜像 | `docker rmi nginx:1.25`              |
| `docker image prune`  | 清理镜像 | `docker image prune -a`              |
| `docker system prune` | 系统清理 | `docker system prune -a`             |
| `docker system df`    | 查看磁盘 | `docker system df`                   |

##### 清理策略建议

```bash
# 定期清理脚本
#!/bin/bash

# 清理已停止的容器
docker container prune -f

# 清理悬空镜像
docker image prune -f

# 清理未使用的网络
docker network prune -f

# 清理 7 天前的构建缓存
docker builder prune -f --filter "until=168h"

echo "清理完成！"
docker system df
```

---

---

## 第五章 镜像构建
### 5.1 docker build 命令详解


本章介绍如何使用 Docker 构建自定义镜像，包括 Dockerfile 编写和构建命令详解。


`docker build` 命令用于**从 Dockerfile 构建镜像**。

#### 语法格式

```bash
docker build [OPTIONS] PATH | URL | -
```

- `PATH`：构建上下文路径（通常是 `.`）
- `URL`：Git 仓库 URL
- `-`：从标准输入读取 Dockerfile

#### 常用选项

| 选项            | 说明                       |
| --------------- | -------------------------- |
| `-t, --tag`   | 镜像名称和标签             |
| `-f, --file`  | 指定 Dockerfile 路径       |
| `--build-arg` | 设置构建参数               |
| `--no-cache`  | 不使用缓存                 |
| `--target`    | 多阶段构建目标             |
| `--platform`  | 目标平台                   |
| `--pull`      | 始终拉取基础镜像           |
| `--push`      | 构建后推送（需 buildx）    |
| `-q, --quiet` | 静默输出                   |
| `--progress`  | 输出格式（auto/plain/tty） |

---

#### 基本用法

**示例 1：基本构建**

```bash
# 在当前目录构建
$ docker build -t myapp:v1 .
```

**示例 2：指定 Dockerfile**

```bash
docker build -t myapp:v1 -f Dockerfile.prod .
```

**示例 3：从 URL 构建**

```bash
docker build -t myapp:v1 https://github.com/user/repo.git
```

**示例 4：从标准输入构建**

```bash
docker build -t myapp:v1 - < Dockerfile
```

---

#### 构建参数（--build-arg）

`--build-arg` 用于在构建时传递变量。

##### Dockerfile 中定义 ARG

```dockerfile
ARG VERSION=latest
ARG BASE_IMAGE=alpine

FROM ${BASE_IMAGE}:${VERSION}
```

##### 构建时传递参数

```bash
$ docker build \
  --build-arg VERSION=3.18 \
  --build-arg BASE_IMAGE=ubuntu \
  -t myapp:v1 .
```

> 💡 `ARG` 仅在构建阶段有效，运行时使用 `ENV`。

---

#### 多阶段构建（--target）

多阶段构建用于**减小最终镜像体积**。

##### 多阶段 Dockerfile 示例

```dockerfile
# 阶段 1：构建
FROM golang:1.21 AS builder
WORKDIR /app
COPY . .
RUN go build -o myapp

# 阶段 2：运行
FROM alpine:3.18 AS production
COPY --from=builder /app/myapp /usr/local/bin/
CMD ["myapp"]

# 阶段 3：开发（包含调试工具）
FROM builder AS development
RUN go install github.com/go-delve/delve/cmd/dlv@latest
CMD ["dlv", "debug"]
```

##### 构建特定阶段

```bash
# 构建生产镜像
$ docker build --target production -t myapp:prod .

# 构建开发镜像
$ docker build --target development -t myapp:dev .

# 只构建 builder 阶段
$ docker build --target builder -t myapp:builder .
```

---

#### 缓存控制

##### 不使用缓存

```bash
docker build --no-cache -t myapp:v1 .
```

##### 始终拉取基础镜像

```bash
docker build --pull -t myapp:v1 .
```

##### 查看构建缓存

```bash
docker builder du
```

##### 清理构建缓存

```bash
docker builder prune
docker builder prune -a  # 清理所有
```

---

#### 跨平台构建（--platform）

使用 `--platform` 构建不同架构的镜像。

```bash
# 构建 ARM64 镜像
$ docker build --platform linux/arm64 -t myapp:arm64 .

# 构建 AMD64 镜像
$ docker build --platform linux/amd64 -t myapp:amd64 .
```

> 💡 跨平台构建需要 QEMU 模拟器或 buildx。

---

#### docker buildx（高级构建）

`docker buildx` 是 Docker 的扩展构建工具，支持更多功能。

##### 创建构建器

```bash
docker buildx create --name mybuilder --use
docker buildx inspect --bootstrap
```

##### 多平台构建

```bash
$ docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t username/myapp:v1 \
  --push \
  .
```

##### 构建并推送

```bash
$ docker buildx build \
  -t username/myapp:v1 \
  --push \
  .
```

##### 构建并加载到本地

```bash
$ docker buildx build \
  -t myapp:v1 \
  --load \
  .
```

---

### 5.2 Dockerfile 指令详解

Dockerfile 是构建镜像的蓝图，包含一系列指令。

#### 常用指令一览

| 指令            | 说明                        |
| --------------- | --------------------------- |
| `FROM`        | 基础镜像                    |
| `RUN`         | 执行命令                    |
| `COPY`        | 复制文件                    |
| `ADD`         | 复制文件（支持 URL 和解压） |
| `WORKDIR`     | 工作目录                    |
| `ENV`         | 环境变量                    |
| `ARG`         | 构建参数                    |
| `EXPOSE`      | 暴露端口                    |
| `CMD`         | 默认命令                    |
| `ENTRYPOINT`  | 入口点                      |
| `USER`        | 运行用户                    |
| `VOLUME`      | 挂载点                      |
| `LABEL`       | 元数据标签                  |
| `HEALTHCHECK` | 健康检查                    |

---

#### FROM：基础镜像

```dockerfile
# 基本用法
FROM ubuntu:22.04

# 使用别名（多阶段构建）
FROM golang:1.21 AS builder

# 使用 ARG
ARG BASE_IMAGE=alpine:3.18
FROM ${BASE_IMAGE}

# scratch（空镜像）
FROM scratch
```

---

#### RUN：执行命令

```dockerfile
# Shell 格式
RUN apt-get update && apt-get install -y nginx

# Exec 格式
RUN ["apt-get", "update"]

# 多行命令（推荐）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        nginx \
        curl \
    && rm -rf /var/lib/apt/lists/*
```

---

#### COPY vs ADD

```dockerfile
# COPY：简单复制
COPY src/ /app/src/
COPY package*.json ./

# ADD：支持 URL 和自动解压
ADD https://example.com/file.tar.gz /tmp/
ADD archive.tar.gz /app/
```

> 💡 推荐使用 `COPY`，更明确且可预测。

---

#### WORKDIR：工作目录

```dockerfile
WORKDIR /app
COPY . .
RUN npm install
```

---

#### ENV vs ARG

```dockerfile
# ARG：构建时变量
ARG VERSION=1.0

# ENV：运行时环境变量
ENV APP_ENV=production
ENV NODE_ENV=production

# ARG 转 ENV
ARG VERSION
ENV APP_VERSION=${VERSION}
```

---

#### CMD vs ENTRYPOINT

```dockerfile
# CMD：默认命令（可被覆盖）
CMD ["nginx", "-g", "daemon off;"]

# ENTRYPOINT：入口点（不易覆盖）
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]

# Shell 格式
CMD nginx -g 'daemon off;'
```

##### CMD 与 ENTRYPOINT 组合

| ENTRYPOINT          | CMD                       | 结果                     |
| ------------------- | ------------------------- | ------------------------ |
| 无                  | `["nginx"]`             | `nginx`                |
| `["nginx"]`       | `["-g", "daemon off;"]` | `nginx -g daemon off;` |
| `["nginx", "-g"]` | `["daemon off;"]`       | `nginx -g daemon off;` |

---

#### USER：运行用户

```dockerfile
# 创建用户
RUN addgroup --system app && adduser --system --group app

# 切换用户
USER app

# 或使用 UID
USER 1000:1000
```

---

#### HEALTHCHECK：健康检查

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=5s \
  CMD curl -f http://localhost/ || exit 1

# 禁用健康检查
HEALTHCHECK NONE
```

---

### 5.3 Dockerfile 最佳实践

#### 减小镜像体积

```dockerfile
# 使用小基础镜像
FROM alpine:3.18

# 多阶段构建
FROM golang:1.21 AS builder
RUN go build -o app

FROM alpine:3.18
COPY --from=builder /app/app /usr/local/bin/

# 清理缓存
RUN apt-get update && apt-get install -y nginx \
    && rm -rf /var/lib/apt/lists/*
```

#### 利用构建缓存

```dockerfile
# 先复制依赖文件
COPY package*.json ./
RUN npm install

# 再复制源码（变化频繁）
COPY . .
```

#### 安全最佳实践

```dockerfile
# 使用非 root 用户
RUN adduser --system --no-create-home appuser
USER appuser

# 固定版本
FROM nginx:1.25.3-alpine

# 扫描漏洞
# docker scout cves myapp:v1
```

#### 标准 Dockerfile 模板

```dockerfile
# syntax=docker/dockerfile:1.4

# ============ 构建阶段 ============
FROM node:20-alpine AS builder

WORKDIR /app

# 依赖安装（利用缓存）
COPY package*.json ./
RUN npm ci --only=production

# 复制源码
COPY . .

# 构建
RUN npm run build

# ============ 生产阶段 ============
FROM node:20-alpine AS production

# 安全：创建非 root 用户
RUN addgroup --system app && adduser --system --group app

WORKDIR /app

# 复制构建产物
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules

# 切换用户
USER app

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

# 启动命令
CMD ["node", "dist/main.js"]
```

---

### 5.4 构建命令小结

| 命令                     | 作用     | 示例                                                                |
| ------------------------ | -------- | ------------------------------------------------------------------- |
| `docker build`         | 构建镜像 | `docker build -t myapp:v1 .`                                      |
| `docker buildx build`  | 高级构建 | `docker buildx build --platform linux/amd64,linux/arm64 --push .` |
| `docker builder prune` | 清理缓存 | `docker builder prune -a`                                         |

---

---

## 第六章 网络管理
### 6.1 Docker 网络概述


本章介绍 Docker 网络的管理命令，包括创建、删除、连接和查看等操作。


Docker 提供多种网络驱动，用于容器间通信。

#### 网络驱动类型

| 驱动        | 说明                           | 使用场景         |
| ----------- | ------------------------------ | ---------------- |
| `bridge`  | 默认网络，容器通过虚拟网桥通信 | 单机容器通信     |
| `host`    | 容器使用宿主机网络栈           | 高性能场景       |
| `none`    | 无网络                         | 安全隔离         |
| `overlay` | 跨主机容器通信                 | Swarm/K8s 集群   |
| `macvlan` | 容器拥有独立 MAC 地址          | 直接接入物理网络 |
| `ipvlan`  | 类似 macvlan，共享 MAC         | 特殊网络需求     |

---

### 6.2 网络创建与删除命令（create/rm/prune）

#### docker network create：创建网络

`docker network create` 命令用于**创建自定义网络**。

##### 语法格式

```bash
docker network create [OPTIONS] NETWORK
```

##### 常用选项

| 选项             | 说明                    |
| ---------------- | ----------------------- |
| `-d, --driver` | 网络驱动（默认 bridge） |
| `--subnet`     | 子网（CIDR 格式）       |
| `--gateway`    | 网关地址                |
| `--ip-range`   | IP 分配范围             |
| `--internal`   | 内部网络（无外部访问）  |
| `--attachable` | 允许手动附加容器        |
| `-o, --opt`    | 驱动选项                |
| `--label`      | 网络标签                |

##### 实战示例

**示例 1：创建默认 bridge 网络**

```bash
docker network create mynet
```

**示例 2：指定子网和网关**

```bash
$ docker network create \
  --subnet 172.20.0.0/16 \
  --gateway 172.20.0.1 \
  mynet
```

**示例 3：创建内部网络**

```bash
docker network create --internal backend-net
```

**示例 4：创建 overlay 网络（Swarm）**

```bash
docker network create -d overlay --attachable app-net
```

**示例 5：创建 macvlan 网络**

```bash
$ docker network create -d macvlan \
  --subnet 192.168.1.0/24 \
  --gateway 192.168.1.1 \
  -o parent=eth0 \
  macvlan-net
```

**示例 6：指定 IP 范围**

```bash
$ docker network create \
  --subnet 10.0.0.0/16 \
  --ip-range 10.0.1.0/24 \
  --gateway 10.0.0.1 \
  custom-net
```

---

#### docker network rm：删除网络

`docker network rm` 命令用于**删除网络**。

##### 语法格式

```bash
docker network rm NETWORK [NETWORK...]
```

##### 实战示例

```bash
# 删除单个网络
$ docker network rm mynet

# 删除多个网络
$ docker network rm net1 net2 net3

# 使用 ID 删除
$ docker network rm abc123
```

> ⚠️ **注意**：无法删除正在使用的网络，需先断开所有容器。

---

#### docker network prune：清理网络

`docker network prune` 命令用于**清理未使用的网络**。

##### 语法格式

```bash
docker network prune [OPTIONS]
```

##### 常用选项

| 选项            | 说明       |
| --------------- | ---------- |
| `-f, --force` | 不提示确认 |
| `--filter`    | 过滤条件   |

##### 实战示例

```bash
# 清理未使用的网络
$ docker network prune
WARNING! This will remove all custom networks not used by at least one container.
Are you sure you want to continue? [y/N] y

# 强制清理
$ docker network prune -f

# 按时间过滤
$ docker network prune --filter "until=24h"
```

---

### 6.3 网络查看命令（ls/inspect）

#### docker network ls：列出网络

```bash
# 列出所有网络
$ docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
abc123def456   bridge    bridge    local
def456ghi789   host      host      local
ghi789jkl012   none      null      local

# 过滤网络
$ docker network ls -f driver=bridge
$ docker network ls -f name=mynet

# 静默模式
$ docker network ls -q
```

---

#### docker network inspect：查看网络详情

```bash
# 查看网络详情
$ docker network inspect mynet

# 提取特定字段
$ docker network inspect -f '{{.IPAM.Config}}' mynet
$ docker network inspect -f '{{range .Containers}}{{.Name}}{{end}}' mynet
```

##### 常用 inspect 字段

| 字段路径         | 说明       |
| ---------------- | ---------- |
| `.Name`        | 网络名称   |
| `.Driver`      | 驱动类型   |
| `.Scope`       | 作用域     |
| `.IPAM.Config` | IP 配置    |
| `.Containers`  | 连接的容器 |
| `.Options`     | 驱动选项   |

---

### 6.4 网络连接命令（connect/disconnect）

#### docker network connect：连接容器到网络

```bash
# 连接容器到网络
$ docker network connect mynet mycontainer

# 指定 IP 地址
$ docker network connect --ip 172.20.0.10 mynet mycontainer

# 指定别名
$ docker network connect --alias db mynet mysql-container
```

---

#### docker network disconnect：断开容器网络

```bash
# 断开连接
$ docker network disconnect mynet mycontainer

# 强制断开
$ docker network disconnect -f mynet mycontainer
```

---

### 6.5 网络实战场景

#### 场景 1：多容器应用网络

```bash
# 创建应用网络
$ docker network create app-network

# 启动数据库（指定网络）
$ docker run -d --name db \
  --network app-network \
  -e MYSQL_ROOT_PASSWORD=secret \
  mysql:8.0

# 启动应用（同一网络）
$ docker run -d --name app \
  --network app-network \
  -e DB_HOST=db \
  myapp:v1
```

#### 场景 2：前后端分离网络

```bash
# 创建前端网络
$ docker network create frontend

# 创建后端网络（内部）
$ docker network create --internal backend

# API 网关连接两个网络
$ docker run -d --name api-gateway \
  --network frontend \
  api-gateway:v1

$ docker network connect backend api-gateway
```

#### 场景 3：固定容器 IP

```bash
# 创建指定子网的网络
$ docker network create \
  --subnet 172.28.0.0/16 \
  fixed-ip-net

# 启动容器并指定 IP
$ docker run -d --name web \
  --network fixed-ip-net \
  --ip 172.28.0.100 \
  nginx
```

---

### 6.6 网络命令小结

| 命令                          | 作用     | 示例                                    |
| ----------------------------- | -------- | --------------------------------------- |
| `docker network create`     | 创建网络 | `docker network create mynet`         |
| `docker network rm`         | 删除网络 | `docker network rm mynet`             |
| `docker network prune`      | 清理网络 | `docker network prune -f`             |
| `docker network ls`         | 列出网络 | `docker network ls`                   |
| `docker network inspect`    | 查看详情 | `docker network inspect mynet`        |
| `docker network connect`    | 连接容器 | `docker network connect mynet app`    |
| `docker network disconnect` | 断开容器 | `docker network disconnect mynet app` |

---

---

## 第七章 存储管理
### 7.1 Docker 存储概述


本章介绍 Docker 存储卷的管理命令，包括创建、查看、删除和挂载等操作。


Docker 提供多种数据持久化方式。

#### 存储类型对比

| 类型       | 说明                | 管理方式          | 适用场景           |
| ---------- | ------------------- | ----------------- | ------------------ |
| Volume     | Docker 管理的数据卷 | `docker volume` | 生产环境首选       |
| Bind Mount | 挂载宿主机目录      | 绝对路径          | 开发环境、配置文件 |
| tmpfs      | 内存文件系统        | `--tmpfs`       | 敏感数据、临时文件 |

#### 存储驱动

| 驱动      | 说明                   |
| --------- | ---------------------- |
| `local` | 默认驱动，存储在宿主机 |
| `nfs`   | NFS 网络存储           |
| `cifs`  | Windows 共享存储       |

---

### 7.2 存储卷命令（create/ls/prune）

#### docker volume create：创建卷

`docker volume create` 命令用于**创建数据卷**。

##### 语法格式

```bash
docker volume create [OPTIONS] [VOLUME]
```

##### 常用选项

| 选项             | 说明                 |
| ---------------- | -------------------- |
| `-d, --driver` | 卷驱动（默认 local） |
| `--label`      | 卷标签               |
| `-o, --opt`    | 驱动选项             |

##### 实战示例

**示例 1：创建默认卷**

```bash
$ docker volume create mydata
mydata
```

**示例 2：创建带标签的卷**

```bash
docker volume create --label env=prod --label app=mysql mysql-data
```

**示例 3：使用 NFS 驱动**

```bash
$ docker volume create \
  --driver local \
  --opt type=nfs \
  --opt o=addr=192.168.1.100,rw \
  --opt device=:/exports/data \
  nfs-data
```

**示例 4：指定本地路径**

```bash
$ docker volume create \
  --driver local \
  --opt type=none \
  --opt device=/data/myapp \
  --opt o=bind \
  myapp-data
```

---

#### docker volume ls：列出卷

`docker volume ls` 命令用于**列出所有数据卷**。

##### 语法格式

```bash
docker volume ls [OPTIONS]
```

##### 常用选项

| 选项             | 说明       |
| ---------------- | ---------- |
| `-f, --filter` | 过滤条件   |
| `-q, --quiet`  | 只显示卷名 |
| `--format`     | 格式化输出 |

##### 实战示例

```bash
# 列出所有卷
$ docker volume ls
DRIVER    VOLUME NAME
local     mydata
local     mysql-data
local     nginx-config

# 只显示卷名
$ docker volume ls -q

# 按标签过滤
$ docker volume ls -f label=env=prod

# 过滤悬空卷
$ docker volume ls -f dangling=true

# 格式化输出
$ docker volume ls --format "{{.Name}}: {{.Driver}}"
```

---

#### docker volume inspect：查看卷详情

```bash
# 查看卷详情
$ docker volume inspect mydata
[
    {
        "CreatedAt": "2024-01-15T12:00:00Z",
        "Driver": "local",
        "Labels": {},
        "Mountpoint": "/var/lib/docker/volumes/mydata/_data",
        "Name": "mydata",
        "Options": {},
        "Scope": "local"
    }
]

# 提取特定字段
$ docker volume inspect -f '{{.Mountpoint}}' mydata
/var/lib/docker/volumes/mydata/_data
```

##### 常用 inspect 字段

| 字段            | 说明       |
| --------------- | ---------- |
| `.Name`       | 卷名称     |
| `.Driver`     | 驱动       |
| `.Mountpoint` | 挂载点路径 |
| `.CreatedAt`  | 创建时间   |
| `.Labels`     | 标签       |
| `.Options`    | 选项       |

---

#### docker volume rm：删除卷

```bash
# 删除单个卷
$ docker volume rm mydata

# 删除多个卷
$ docker volume rm vol1 vol2 vol3

# 强制删除（跳过确认）
$ docker volume rm -f mydata
```

> ⚠️ **注意**：无法删除正在使用的卷，需先停止/删除使用该卷的容器。

---

#### docker volume prune：清理卷

`docker volume prune` 命令用于**清理未使用的数据卷**。

```bash
# 清理未使用的卷
$ docker volume prune
WARNING! This will remove all local volumes not used by at least one container.
Are you sure you want to continue? [y/N] y

# 强制清理
$ docker volume prune -f

# 按标签过滤
$ docker volume prune --filter label=temp
```

> ⚠️ **警告**：此操作会永久删除数据，请谨慎操作！

---

### 7.3 卷的使用方式

#### 使用 -v 挂载卷

```bash
# 具名卷
$ docker run -d -v mydata:/app/data nginx

# 匿名卷
$ docker run -d -v /app/data nginx

# Bind Mount
$ docker run -d -v /host/path:/container/path nginx
```

#### 使用 --mount 挂载卷（推荐）

```bash
# 挂载卷
$ docker run -d \
  --mount type=volume,source=mydata,target=/app/data \
  nginx

# 只读挂载
$ docker run -d \
  --mount type=volume,source=mydata,target=/app/data,readonly \
  nginx

# Bind Mount
$ docker run -d \
  --mount type=bind,source=/host/path,target=/app/data \
  nginx
```

#### --mount 选项详解

| 选项           | 说明                          |
| -------------- | ----------------------------- |
| `type`       | 挂载类型（volume/bind/tmpfs） |
| `source`     | 卷名或宿主机路径              |
| `target`     | 容器内挂载点                  |
| `readonly`   | 只读模式                      |
| `volume-opt` | 卷选项                        |

---

### 7.4 存储实战场景

#### 场景 1：数据库持久化

```bash
# 创建数据卷
$ docker volume create mysql-data

# 启动 MySQL
$ docker run -d \
  --name mysql \
  -e MYSQL_ROOT_PASSWORD=secret \
  --mount type=volume,source=mysql-data,target=/var/lib/mysql \
  mysql:8.0
```

#### 场景 2：配置文件挂载

```bash
# 挂载 Nginx 配置
$ docker run -d \
  --name nginx \
  --mount type=bind,source=/etc/nginx/nginx.conf,target=/etc/nginx/nginx.conf,readonly \
  --mount type=bind,source=/var/www/html,target=/usr/share/nginx/html \
  nginx
```

#### 场景 3：多容器共享卷

```bash
# 创建共享卷
$ docker volume create shared-data

# 容器 1：写入数据
$ docker run -d --name writer \
  --mount type=volume,source=shared-data,target=/data \
  alpine sh -c "while true; do date >> /data/log.txt; sleep 5; done"

# 容器 2：读取数据
$ docker run -it --name reader \
  --mount type=volume,source=shared-data,target=/data,readonly \
  alpine cat /data/log.txt
```

#### 场景 4：卷备份与恢复

```bash
# 备份卷
$ docker run --rm \
  --mount type=volume,source=mydata,target=/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/mydata-backup.tar.gz -C /data .

# 恢复卷
$ docker run --rm \
  --mount type=volume,source=mydata-restore,target=/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/mydata-backup.tar.gz -C /data
```

---

### 7.5 存储命令小结

| 命令                      | 作用     | 示例                             |
| ------------------------- | -------- | -------------------------------- |
| `docker volume create`  | 创建卷   | `docker volume create mydata`  |
| `docker volume ls`      | 列出卷   | `docker volume ls -q`          |
| `docker volume inspect` | 查看详情 | `docker volume inspect mydata` |
| `docker volume rm`      | 删除卷   | `docker volume rm mydata`      |
| `docker volume prune`   | 清理卷   | `docker volume prune -f`       |

---

---

## 第八章 Docker 守护进程配置
### 8.1 dockerd 概述


本章介绍 Docker 守护进程（dockerd）的配置和管理。


`dockerd` 是 Docker 守护进程，负责管理容器、镜像、网络和存储。

#### 架构组件

```
┌─────────────────────────────────────────────────┐
│                   Docker Client                  │
│               (docker CLI / API)                 │
└─────────────────────┬───────────────────────────┘
                      │ REST API
┌─────────────────────▼───────────────────────────┐
│                    dockerd                       │
│               (Docker Daemon)                    │
├─────────────────────┬───────────────────────────┤
│     containerd      │       buildkit            │
├─────────────────────┼───────────────────────────┤
│        runc         │     容器运行时             │
└─────────────────────┴───────────────────────────┘
```

---

### 8.2 daemon.json 配置文件

Docker 守护进程的主要配置文件是 `/etc/docker/daemon.json`。

#### 配置文件位置

| 系统                   | 路径                                         |
| ---------------------- | -------------------------------------------- |
| Linux                  | `/etc/docker/daemon.json`                  |
| Windows                | `C:\ProgramData\docker\config\daemon.json` |
| macOS (Docker Desktop) | `~/.docker/daemon.json`                    |

#### 常用配置项

```json
{
  "data-root": "/var/lib/docker",
  "storage-driver": "overlay2",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  },
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://registry.docker-cn.com"
  ],
  "insecure-registries": [
    "registry.example.com:5000"
  ],
  "dns": ["8.8.8.8", "8.8.4.4"],
  "bip": "172.17.0.1/16",
  "default-address-pools": [
    {"base": "172.18.0.0/16", "size": 24}
  ],
  "live-restore": true,
  "debug": false,
  "tls": true,
  "tlscacert": "/etc/docker/ca.pem",
  "tlscert": "/etc/docker/server-cert.pem",
  "tlskey": "/etc/docker/server-key.pem"
}
```

#### 配置项详解

| 配置项                  | 说明                       |
| ----------------------- | -------------------------- |
| `data-root`           | Docker 数据目录            |
| `storage-driver`      | 存储驱动（overlay2 推荐）  |
| `log-driver`          | 日志驱动                   |
| `log-opts`            | 日志选项                   |
| `registry-mirrors`    | 镜像加速器                 |
| `insecure-registries` | 非安全仓库                 |
| `dns`                 | DNS 服务器                 |
| `bip`                 | docker0 网桥 IP            |
| `live-restore`        | 守护进程重启时保持容器运行 |
| `debug`               | 调试模式                   |

---

### 8.3 常用配置场景

#### 场景 1：配置镜像加速器

```json
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://registry.docker-cn.com",
    "https://docker.mirrors.ustc.edu.cn"
  ]
}
```

#### 场景 2：配置日志轮转

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "5",
    "compress": "true"
  }
}
```

#### 场景 3：配置私有仓库

```json
{
  "insecure-registries": [
    "192.168.1.100:5000",
    "registry.local:5000"
  ]
}
```

#### 场景 4：更改数据目录

```json
{
  "data-root": "/data/docker"
}
```

#### 场景 5：配置网络

```json
{
  "bip": "10.200.0.1/16",
  "dns": ["10.0.0.2", "8.8.8.8"],
  "default-address-pools": [
    {"base": "10.201.0.0/16", "size": 24},
    {"base": "10.202.0.0/16", "size": 24}
  ]
}
```

---

### 8.4 远程访问配置

#### 启用 TCP 远程访问

> ⚠️ **警告**：开放 TCP 访问存在安全风险，生产环境必须启用 TLS。

##### 方式 1：修改 daemon.json

```json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2375"]
}
```

##### 方式 2：修改 systemd 配置

```bash
# 创建 override 文件
$ sudo mkdir -p /etc/systemd/system/docker.service.d
$ sudo cat > /etc/systemd/system/docker.service.d/override.conf << EOF
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd -H fd:// -H tcp://0.0.0.0:2375
EOF

# 重载配置
$ sudo systemctl daemon-reload
$ sudo systemctl restart docker
```

##### 客户端连接远程 Docker

```bash
# 使用环境变量
$ export DOCKER_HOST=tcp://192.168.1.100:2375
$ docker ps

# 使用 -H 参数
$ docker -H tcp://192.168.1.100:2375 ps
```

---

### 8.5 TLS 安全配置

#### 生成证书

```bash
# 创建 CA 证书
$ openssl genrsa -aes256 -out ca-key.pem 4096
$ openssl req -new -x509 -days 365 -key ca-key.pem -sha256 -out ca.pem

# 创建服务器证书
$ openssl genrsa -out server-key.pem 4096
$ openssl req -subj "/CN=docker-server" -sha256 -new -key server-key.pem -out server.csr
$ echo subjectAltName = DNS:docker-server,IP:192.168.1.100 >> extfile.cnf
$ openssl x509 -req -days 365 -sha256 -in server.csr -CA ca.pem -CAkey ca-key.pem \
  -CAcreateserial -out server-cert.pem -extfile extfile.cnf

# 创建客户端证书
$ openssl genrsa -out key.pem 4096
$ openssl req -subj '/CN=client' -new -key key.pem -out client.csr
$ echo extendedKeyUsage = clientAuth > extfile-client.cnf
$ openssl x509 -req -days 365 -sha256 -in client.csr -CA ca.pem -CAkey ca-key.pem \
  -CAcreateserial -out cert.pem -extfile extfile-client.cnf
```

#### 服务端配置

```json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2376"],
  "tls": true,
  "tlsverify": true,
  "tlscacert": "/etc/docker/ca.pem",
  "tlscert": "/etc/docker/server-cert.pem",
  "tlskey": "/etc/docker/server-key.pem"
}
```

#### 客户端连接

```bash
$ docker --tlsverify \
  --tlscacert=ca.pem \
  --tlscert=cert.pem \
  --tlskey=key.pem \
  -H=tcp://192.168.1.100:2376 \
  ps
```

---

### 8.6 dockerd 命令行选项

#### 常用选项

| 选项                    | 说明         |
| ----------------------- | ------------ |
| `-H, --host`          | 监听地址     |
| `-D, --debug`         | 调试模式     |
| `--data-root`         | 数据目录     |
| `--storage-driver`    | 存储驱动     |
| `--log-driver`        | 日志驱动     |
| `--registry-mirror`   | 镜像加速器   |
| `--insecure-registry` | 非安全仓库   |
| `--live-restore`      | 保持容器运行 |

#### 示例

```bash
# 调试模式启动
$ dockerd --debug

# 指定数据目录
$ dockerd --data-root /data/docker

# 多个监听地址
$ dockerd -H unix:///var/run/docker.sock -H tcp://0.0.0.0:2375
```

---

### 8.7 服务管理

#### systemctl 管理

```bash
# 启动 Docker
$ sudo systemctl start docker

# 停止 Docker
$ sudo systemctl stop docker

# 重启 Docker
$ sudo systemctl restart docker

# 查看状态
$ sudo systemctl status docker

# 开机自启
$ sudo systemctl enable docker

# 禁用开机自启
$ sudo systemctl disable docker
```

#### 重载配置

```bash
# 修改 daemon.json 后
$ sudo systemctl daemon-reload
$ sudo systemctl restart docker
```

---

### 8.8 docker info / docker version

#### docker version

```bash
$ docker version
Client:
 Version:           24.0.7
 API version:       1.43
 Go version:        go1.21.3
 Git commit:        afdd53b
 Built:             Thu Oct 26 09:08:17 2023
 OS/Arch:           linux/amd64
 Context:           default

Server:
 Engine:
  Version:          24.0.7
  API version:      1.43 (minimum version 1.12)
  Go version:       go1.21.3
  Git commit:       311b9ff
  Built:            Thu Oct 26 09:08:17 2023
  OS/Arch:          linux/amd64
```

#### docker info

```bash
$ docker info
Client:
 Context:    default
 Debug Mode: false

Server:
 Containers: 5
  Running: 3
  Paused: 0
  Stopped: 2
 Images: 15
 Server Version: 24.0.7
 Storage Driver: overlay2
 Logging Driver: json-file
 Cgroup Driver: systemd
 Default Runtime: runc
 Docker Root Dir: /var/lib/docker
 Registry: https://index.docker.io/v1/
 Live Restore Enabled: true
```

---

### 8.9 守护进程配置小结

| 配置方式    | 文件/命令                                 | 优先级 |
| ----------- | ----------------------------------------- | ------ |
| daemon.json | `/etc/docker/daemon.json`               | 推荐   |
| systemd     | `/etc/systemd/system/docker.service.d/` | 覆盖   |
| 命令行      | `dockerd [OPTIONS]`                     | 临时   |

#### 生产环境推荐配置

```json
{
  "data-root": "/var/lib/docker",
  "storage-driver": "overlay2",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  },
  "registry-mirrors": ["https://mirror.example.com"],
  "live-restore": true,
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 65535,
      "Soft": 65535
    }
  },
  "exec-opts": ["native.cgroupdriver=systemd"]
}
```

---

### 8.10 daemon.json 完整配置示例

以下是一个包含所有可用配置项的完整 daemon.json 示例：

```json
{
  "allow-direct-routing": false,
  "authorization-plugins": [],
  "bip": "",
  "bip6": "",
  "bridge": "",
  "bridge-accept-fwmark": "",
  "builder": {
    "gc": {
      "enabled": true,
      "defaultReservedSpace": "10GB",
      "policy": [
        { "maxUsedSpace": "512MB", "keepDuration": "48h", "filter": [ "type=source.local" ] },
        { "reservedSpace": "10GB", "maxUsedSpace": "100GB", "keepDuration": "1440h" },
        { "reservedSpace": "50GB", "minFreeSpace": "20GB", "maxUsedSpace": "200GB", "all": true }
      ]
    }
  },
  "cgroup-parent": "",
  "containerd": "/run/containerd/containerd.sock",
  "containerd-namespace": "docker",
  "containerd-plugins-namespace": "docker-plugins",
  "data-root": "",
  "debug": true,
  "default-address-pools": [
    { "base": "172.30.0.0/16", "size": 24 },
    { "base": "172.31.0.0/16", "size": 24 }
  ],
  "default-cgroupns-mode": "private",
  "default-gateway": "",
  "default-gateway-v6": "",
  "default-network-opts": {},
  "default-runtime": "runc",
  "default-shm-size": "64M",
  "default-ulimits": {
    "nofile": { "Hard": 64000, "Name": "nofile", "Soft": 64000 }
  },
  "dns": [],
  "dns-opts": [],
  "dns-search": [],
  "exec-opts": [],
  "exec-root": "",
  "experimental": false,
  "features": {
    "cdi": true,
    "containerd-snapshotter": true
  },
  "firewall-backend": "",
  "fixed-cidr": "",
  "fixed-cidr-v6": "",
  "group": "",
  "host-gateway-ip": "",
  "hosts": [],
  "proxies": {
    "http-proxy": "http://proxy.example.com:80",
    "https-proxy": "https://proxy.example.com:443",
    "no-proxy": "*.test.example.com,.example.org"
  },
  "icc": false,
  "init": false,
  "init-path": "/usr/libexec/docker-init",
  "insecure-registries": [],
  "ip": "0.0.0.0",
  "ip-forward": false,
  "ip-masq": false,
  "iptables": false,
  "ip6tables": false,
  "ipv6": false,
  "labels": [],
  "live-restore": true,
  "log-driver": "json-file",
  "log-format": "text",
  "log-level": "",
  "log-opts": {
    "cache-disabled": "false",
    "cache-max-file": "5",
    "cache-max-size": "20m",
    "cache-compress": "true",
    "env": "os,customer",
    "labels": "somelabel",
    "max-file": "5",
    "max-size": "10m"
  },
  "max-concurrent-downloads": 3,
  "max-concurrent-uploads": 5,
  "max-download-attempts": 5,
  "mtu": 0,
  "no-new-privileges": false,
  "node-generic-resources": [
    "NVIDIA-GPU=UUID1",
    "NVIDIA-GPU=UUID2"
  ],
  "pidfile": "",
  "raw-logs": false,
  "registry-mirrors": [],
  "runtimes": {
    "cc-runtime": {
      "path": "/usr/bin/cc-runtime"
    },
    "custom": {
      "path": "/usr/local/bin/my-runc-replacement",
      "runtimeArgs": ["--debug"]
    }
  },
  "seccomp-profile": "",
  "selinux-enabled": false,
  "shutdown-timeout": 15,
  "storage-driver": "",
  "storage-opts": [],
  "swarm-default-advertise-addr": "",
  "tls": true,
  "tlscacert": "",
  "tlscert": "",
  "tlskey": "",
  "tlsverify": true,
  "userland-proxy": false,
  "userland-proxy-path": "/usr/libexec/docker-proxy",
  "userns-remap": ""
}
```

#### 配置项分类说明

##### 基础配置

| 配置项           | 类型   | 说明                                            |
| ---------------- | ------ | ----------------------------------------------- |
| `data-root`    | string | Docker 数据存储目录（默认 `/var/lib/docker`） |
| `exec-root`    | string | 执行状态文件目录                                |
| `pidfile`      | string | PID 文件路径                                    |
| `debug`        | bool   | 启用调试模式                                    |
| `experimental` | bool   | 启用实验性功能                                  |
| `group`        | string | Unix socket 所属组                              |

##### 存储配置

| 配置项             | 类型     | 说明                                 |
| ------------------ | -------- | ------------------------------------ |
| `storage-driver` | string   | 存储驱动（overlay2, aufs, btrfs 等） |
| `storage-opts`   | []string | 存储驱动选项                         |

##### 网络配置

| 配置项                    | 类型     | 说明                                    |
| ------------------------- | -------- | --------------------------------------- |
| `bip`                   | string   | docker0 网桥 IP（如 `172.17.0.1/16`） |
| `bip6`                  | string   | docker0 网桥 IPv6 地址                  |
| `bridge`                | string   | 自定义网桥名称                          |
| `fixed-cidr`            | string   | 固定 IPv4 子网                          |
| `fixed-cidr-v6`         | string   | 固定 IPv6 子网                          |
| `default-gateway`       | string   | 默认 IPv4 网关                          |
| `default-gateway-v6`    | string   | 默认 IPv6 网关                          |
| `default-address-pools` | []object | 默认地址池（base + size）               |
| `dns`                   | []string | DNS 服务器                              |
| `dns-opts`              | []string | DNS 选项                                |
| `dns-search`            | []string | DNS 搜索域                              |
| `mtu`                   | int      | 网络 MTU 值                             |
| `ipv6`                  | bool     | 启用 IPv6                               |
| `ip-forward`            | bool     | 启用 IP 转发                            |
| `ip-masq`               | bool     | 启用 IP 伪装                            |
| `iptables`              | bool     | 启用 iptables 规则管理                  |
| `ip6tables`             | bool     | 启用 ip6tables 规则管理                 |
| `icc`                   | bool     | 启用容器间通信                          |
| `userland-proxy`        | bool     | 使用用户态代理                          |

##### 日志配置

| 配置项         | 类型   | 说明                                       |
| -------------- | ------ | ------------------------------------------ |
| `log-driver` | string | 日志驱动（json-file, syslog, journald 等） |
| `log-level`  | string | 日志级别（debug, info, warn, error）       |
| `log-format` | string | 日志格式（text, json）                     |
| `log-opts`   | object | 日志驱动选项                               |
| `raw-logs`   | bool   | 输出原始日志（无 ANSI 颜色）               |

##### 镜像仓库配置

| 配置项                       | 类型     | 说明                   |
| ---------------------------- | -------- | ---------------------- |
| `registry-mirrors`         | []string | 镜像加速器列表         |
| `insecure-registries`      | []string | 非安全仓库列表（HTTP） |
| `max-concurrent-downloads` | int      | 最大并发下载数         |
| `max-concurrent-uploads`   | int      | 最大并发上传数         |
| `max-download-attempts`    | int      | 最大下载重试次数       |

##### 代理配置

| 配置项                  | 类型   | 说明             |
| ----------------------- | ------ | ---------------- |
| `proxies.http-proxy`  | string | HTTP 代理地址    |
| `proxies.https-proxy` | string | HTTPS 代理地址   |
| `proxies.no-proxy`    | string | 不使用代理的地址 |

##### TLS 配置

| 配置项        | 类型     | 说明           |
| ------------- | -------- | -------------- |
| `tls`       | bool     | 启用 TLS       |
| `tlsverify` | bool     | 启用 TLS 验证  |
| `tlscacert` | string   | CA 证书路径    |
| `tlscert`   | string   | 服务器证书路径 |
| `tlskey`    | string   | 服务器私钥路径 |
| `hosts`     | []string | 监听地址列表   |

##### 运行时配置

| 配置项                    | 类型   | 说明                                |
| ------------------------- | ------ | ----------------------------------- |
| `default-runtime`       | string | 默认运行时（runc）                  |
| `runtimes`              | object | 自定义运行时配置                    |
| `containerd`            | string | containerd socket 路径              |
| `init`                  | bool   | 默认启用 init 进程                  |
| `init-path`             | string | init 程序路径                       |
| `cgroup-parent`         | string | 默认 cgroup 父路径                  |
| `default-cgroupns-mode` | string | cgroup 命名空间模式（private/host） |

##### 安全配置

| 配置项                    | 类型     | 说明                  |
| ------------------------- | -------- | --------------------- |
| `seccomp-profile`       | string   | 默认 seccomp 配置文件 |
| `selinux-enabled`       | bool     | 启用 SELinux          |
| `no-new-privileges`     | bool     | 禁止获取新权限        |
| `userns-remap`          | string   | 用户命名空间映射      |
| `authorization-plugins` | []string | 授权插件列表          |

##### 容器默认配置

| 配置项               | 类型     | 说明               |
| -------------------- | -------- | ------------------ |
| `default-ulimits`  | object   | 默认 ulimits 限制  |
| `default-shm-size` | string   | 默认 /dev/shm 大小 |
| `labels`           | []string | 守护进程标签       |

##### 构建器配置

| 配置项                              | 类型     | 说明                 |
| ----------------------------------- | -------- | -------------------- |
| `builder.gc.enabled`              | bool     | 启用构建缓存垃圾回收 |
| `builder.gc.defaultReservedSpace` | string   | 默认保留空间         |
| `builder.gc.policy`               | []object | GC 策略规则          |

##### 功能开关

| 配置项                              | 类型 | 说明                        |
| ----------------------------------- | ---- | --------------------------- |
| `features.cdi`                    | bool | 启用 CDI（容器设备接口）    |
| `features.containerd-snapshotter` | bool | 使用 containerd snapshotter |

##### 其他配置

| 配置项                           | 类型     | 说明                       |
| -------------------------------- | -------- | -------------------------- |
| `live-restore`                 | bool     | 守护进程重启时保持容器运行 |
| `shutdown-timeout`             | int      | 关闭超时时间（秒）         |
| `node-generic-resources`       | []string | 通用资源（如 GPU）         |
| `swarm-default-advertise-addr` | string   | Swarm 默认广播地址         |

---

---
