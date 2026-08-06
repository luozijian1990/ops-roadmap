# Docker 学习笔记 · 第三册：Docker Compose

## 第九章 Docker Compose
### 9.1 Docker Compose 概述


本章介绍 Docker Compose 的使用，包括常用命令和 compose.yaml 配置。


Docker Compose 是用于定义和运行多容器 Docker 应用的工具。

#### Compose 版本

| 版本        | 命令               | 说明                    |
| ----------- | ------------------ | ----------------------- |
| V1 (已弃用) | `docker-compose` | 独立 Python 工具        |
| V2          | `docker compose` | Docker CLI 插件（推荐） |

> 📝 本章使用 V2 语法 `docker compose`

---

### 9.2 docker compose up

`docker compose up` 命令用于**创建并启动服务**。

#### 语法格式

```bash
docker compose up [OPTIONS] [SERVICE...]
```

#### 常用选项

| 选项                 | 说明                                   |
| -------------------- | -------------------------------------- |
| `-d, --detach`     | 后台运行                               |
| `--build`          | 启动前重新构建镜像                     |
| `--force-recreate` | 强制重新创建容器                       |
| `--no-recreate`    | 不重新创建已存在的容器                 |
| `--no-build`       | 不构建镜像                             |
| `--no-start`       | 创建容器但不启动                       |
| `--pull`           | 启动前拉取镜像（always/missing/never） |
| `--remove-orphans` | 删除未定义的孤立容器                   |
| `--scale`          | 设置服务实例数                         |
| `-t, --timeout`    | 关闭超时时间                           |
| `--wait`           | 等待服务健康                           |
| `--watch`          | 监听文件变化自动更新                   |

#### 实战示例

**示例 1：后台启动所有服务**

```bash
$ docker compose up -d
[+] Running 3/3
 ✔ Network app_default  Created
 ✔ Container app-db-1   Started
 ✔ Container app-web-1  Started
```

**示例 2：重新构建并启动**

```bash
docker compose up -d --build
```

**示例 3：强制重建容器**

```bash
docker compose up -d --force-recreate
```

**示例 4：启动特定服务**

```bash
docker compose up -d web api
```

**示例 5：扩展服务实例**

```bash
docker compose up -d --scale web=3
```

**示例 6：拉取最新镜像后启动**

```bash
docker compose up -d --pull always
```

**示例 7：等待服务健康后返回**

```bash
docker compose up -d --wait
```

**示例 8：开发模式（监听文件变化）**

```bash
docker compose up --watch
```

---

### 9.3 docker compose down

`docker compose down` 命令用于**停止并删除容器、网络**。

#### 语法格式

```bash
docker compose down [OPTIONS]
```

#### 常用选项

| 选项                 | 说明                  |
| -------------------- | --------------------- |
| `-v, --volumes`    | 同时删除卷            |
| `--rmi`            | 删除镜像（local/all） |
| `--remove-orphans` | 删除孤立容器          |
| `-t, --timeout`    | 关闭超时时间          |

#### 实战示例

```bash
# 停止并删除容器和网络
$ docker compose down

# 同时删除卷
$ docker compose down -v

# 同时删除构建的镜像
$ docker compose down --rmi local

# 删除所有镜像
$ docker compose down --rmi all
```

---

### 9.4 docker compose ps / logs

#### docker compose ps：查看服务状态

```bash
# 查看运行中的服务
$ docker compose ps
NAME         SERVICE   STATUS    PORTS
app-db-1     db        running   3306/tcp
app-web-1    web       running   0.0.0.0:80->80/tcp

# 查看所有服务（包括已停止）
$ docker compose ps -a

# 静默模式
$ docker compose ps -q
```

#### docker compose logs：查看日志

```bash
# 查看所有服务日志
$ docker compose logs

# 查看特定服务日志
$ docker compose logs web

# 实时跟踪日志
$ docker compose logs -f

# 显示时间戳
$ docker compose logs -t

# 限制行数
$ docker compose logs --tail 100

# 组合使用
$ docker compose logs -f --tail 50 web api
```

---

### 9.5 其他常用命令

#### docker compose start/stop/restart

```bash
# 启动已存在的服务
$ docker compose start

# 停止服务
$ docker compose stop

# 重启服务
$ docker compose restart

# 操作特定服务
$ docker compose restart web
```

#### docker compose exec：进入容器

```bash
# 进入容器执行命令
$ docker compose exec web bash

# 执行单个命令
$ docker compose exec db mysql -u root -p

# 以特定用户执行
$ docker compose exec -u root web bash
```

#### docker compose run：运行一次性命令

```bash
# 运行一次性命令
$ docker compose run web npm test

# 不启动依赖服务
$ docker compose run --no-deps web npm test

# 删除容器
$ docker compose run --rm web npm build
```

#### docker compose pull/push

```bash
# 拉取服务镜像
$ docker compose pull

# 拉取特定服务
$ docker compose pull web

# 推送镜像
$ docker compose push
```

#### docker compose build

```bash
# 构建服务镜像
$ docker compose build

# 不使用缓存
$ docker compose build --no-cache

# 构建特定服务
$ docker compose build web

# 并行构建
$ docker compose build --parallel
```

#### docker compose config

```bash
# 验证并打印配置
$ docker compose config

# 只输出服务名
$ docker compose config --services

# 只输出卷名
$ docker compose config --volumes
```

---

### 9.6 compose.yaml 配置详解

#### 基本结构

```yaml
name: myapp              # 项目名称

services:                # 服务定义
  web:
    image: nginx:latest
  db:
    image: mysql:8.0

volumes:                 # 卷定义
  data:

networks:               # 网络定义
  frontend:
  backend:
```

#### 完整示例

```yaml
name: myapp

services:
  web:
    image: nginx:alpine
    container_name: web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./html:/usr/share/nginx/html
    networks:
      - frontend
    depends_on:
      - api
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
      args:
        - NODE_ENV=production
    image: myapp-api:latest
    environment:
      - NODE_ENV=production
      - DB_HOST=db
    env_file:
      - .env
    ports:
      - "3000:3000"
    networks:
      - frontend
      - backend
    depends_on:
      db:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "1"
          memory: 512M
        reservations:
          cpus: "0.5"
          memory: 256M

  db:
    image: mysql:8.0
    container_name: mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: myapp
    volumes:
      - db-data:/var/lib/mysql
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - backend
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - backend

volumes:
  db-data:
    driver: local
  redis-data:

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true
```

#### 常用配置项

| 配置项             | 说明         |
| ------------------ | ------------ |
| `image`          | 使用的镜像   |
| `build`          | 构建配置     |
| `container_name` | 容器名称     |
| `ports`          | 端口映射     |
| `volumes`        | 卷挂载       |
| `environment`    | 环境变量     |
| `env_file`       | 环境变量文件 |
| `networks`       | 网络配置     |
| `depends_on`     | 服务依赖     |
| `restart`        | 重启策略     |
| `healthcheck`    | 健康检查     |
| `deploy`         | 部署配置     |
| `command`        | 覆盖默认命令 |
| `entrypoint`     | 覆盖入口点   |

---

### 9.7 Compose 命令小结

| 命令                       | 作用       | 示例                                |
| -------------------------- | ---------- | ----------------------------------- |
| `docker compose up`      | 创建并启动 | `docker compose up -d`            |
| `docker compose down`    | 停止并删除 | `docker compose down -v`          |
| `docker compose ps`      | 查看状态   | `docker compose ps`               |
| `docker compose logs`    | 查看日志   | `docker compose logs -f`          |
| `docker compose exec`    | 进入容器   | `docker compose exec web bash`    |
| `docker compose run`     | 运行命令   | `docker compose run web npm test` |
| `docker compose build`   | 构建镜像   | `docker compose build`            |
| `docker compose pull`    | 拉取镜像   | `docker compose pull`             |
| `docker compose start`   | 启动服务   | `docker compose start`            |
| `docker compose stop`    | 停止服务   | `docker compose stop`             |
| `docker compose restart` | 重启服务   | `docker compose restart`          |
| `docker compose config`  | 验证配置   | `docker compose config`           |

---

### 9.8 镜像与构建属性详解（image, build）

#### image 属性

`image` 属性指定服务使用的镜像。

##### 基本用法

```yaml
services:
  web:
    image: nginx                    # 使用默认 latest 标签
  
  api:
    image: node:18-alpine           # 指定版本标签
  
  db:
    image: mysql:8.0.35             # 指定精确版本
  
  app:
    image: myregistry.com/myapp:v1  # 私有仓库镜像
```

##### 镜像命名格式

```yaml
# 完整格式
image: [registry/][namespace/]name[:tag|@digest]

# 示例
services:
  # Docker Hub 官方镜像
  redis:
    image: redis:7

  # Docker Hub 用户镜像
  custom:
    image: username/myimage:latest

  # 私有仓库
  private:
    image: registry.example.com:5000/myapp:v2.1.0

  # 使用 digest（不可变）
  secure:
    image: nginx@sha256:abc123...
```

---

#### build 属性

`build` 属性用于从 Dockerfile 构建镜像。

##### 简写形式

```yaml
services:
  web:
    build: ./app    # 指定构建上下文目录
```

##### 完整形式

```yaml
services:
  web:
    build:
      context: ./app                    # 构建上下文
      dockerfile: Dockerfile            # Dockerfile 路径
      args:                             # 构建参数
        - NODE_ENV=production
        - VERSION=1.0.0
      target: production                # 多阶段构建目标
      tags:                             # 镜像标签
        - myapp:latest
        - myapp:v1.0.0
      cache_from:                       # 缓存来源
        - myapp:cache
      cache_to:                         # 缓存目标
        - type=local,dest=/tmp/cache
      platforms:                        # 目标平台
        - linux/amd64
        - linux/arm64
      labels:                           # 镜像标签
        - com.example.version=1.0.0
      network: host                     # 构建网络模式
      shm_size: 256m                    # /dev/shm 大小
      extra_hosts:                      # 额外 hosts
        - "host.docker.internal:host-gateway"
```

##### build 配置项详解

| 配置项                | 说明                                |
| --------------------- | ----------------------------------- |
| `context`           | 构建上下文路径或 Git URL            |
| `dockerfile`        | Dockerfile 文件名（相对于 context） |
| `dockerfile_inline` | 内联 Dockerfile 内容                |
| `args`              | 构建参数（对应 Dockerfile ARG）     |
| `target`            | 多阶段构建目标阶段                  |
| `tags`              | 构建的镜像标签列表                  |
| `cache_from`        | 缓存来源镜像                        |
| `cache_to`          | 缓存存储目标                        |
| `platforms`         | 目标平台架构                        |
| `labels`            | 镜像标签                            |
| `network`           | 构建时网络模式                      |
| `shm_size`          | /dev/shm 大小                       |
| `extra_hosts`       | 构建时额外 hosts 映射               |
| `pull`              | 构建前是否拉取基础镜像              |
| `no_cache`          | 不使用缓存构建                      |
| `secrets`           | 构建时 secrets                      |
| `ssh`               | SSH 代理配置                        |

---

#### image + build 组合

同时指定 `image` 和 `build` 时，构建的镜像将使用 `image` 指定的名称：

```yaml
services:
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    image: myregistry.com/myapi:${VERSION:-latest}
```

---

#### 实战示例

##### 示例 1：基础构建

```yaml
services:
  app:
    build: .
    image: myapp:latest
    ports:
      - "3000:3000"
```

##### 示例 2：多阶段构建

```yaml
services:
  app:
    build:
      context: .
      target: production
      args:
        - NODE_ENV=production
    image: myapp:prod
```

##### 示例 3：带缓存的构建

```yaml
services:
  app:
    build:
      context: .
      cache_from:
        - myapp:cache
        - myapp:latest
      cache_to:
        - type=inline
    image: myapp:latest
```

##### 示例 4：多平台构建

```yaml
services:
  app:
    build:
      context: .
      platforms:
        - linux/amd64
        - linux/arm64
    image: myapp:multiarch
```

##### 示例 5：使用 Git 仓库

```yaml
services:
  app:
    build:
      context: https://github.com/user/repo.git#main
      dockerfile: docker/Dockerfile
    image: myapp:latest
```

##### 示例 6：内联 Dockerfile

```yaml
services:
  simple:
    build:
      context: .
      dockerfile_inline: |
        FROM alpine:3.18
        RUN apk add --no-cache curl
        COPY . /app
        CMD ["./app"]
    image: simple-app:latest
```

---

### 9.9 命令与入口点属性详解（command, entrypoint）

#### command 属性

`command` 属性用于覆盖容器默认命令（Dockerfile 中的 `CMD`）。

##### 语法格式

```yaml
services:
  app:
    image: alpine
    # 字符串格式（shell 形式）
    command: echo "Hello World"

  api:
    image: node:18
    # 列表格式（exec 形式，推荐）
    command: ["npm", "run", "start"]
```

##### shell 形式 vs exec 形式

| 形式  | 语法                         | 说明                     |
| ----- | ---------------------------- | ------------------------ |
| shell | `command: cmd arg1 arg2`   | 通过 `/bin/sh -c` 执行 |
| exec  | `command: ["cmd", "arg1"]` | 直接执行，推荐使用       |

##### 实战示例

```yaml
services:
  # 示例 1：覆盖默认命令
  nginx:
    image: nginx
    command: ["nginx", "-g", "daemon off;", "-c", "/etc/nginx/custom.conf"]

  # 示例 2：开发模式启动
  api:
    image: node:18
    command: npm run dev

  # 示例 3：使用环境变量
  app:
    image: python:3.11
    command: ["python", "-m", "flask", "run", "--host=${HOST:-0.0.0.0}"]

  # 示例 4：多行命令
  worker:
    image: alpine
    command: >
      sh -c "
        echo 'Starting worker...' &&
        sleep 5 &&
        ./worker --config /etc/config.yaml
      "
```

---

#### entrypoint 属性

`entrypoint` 属性用于覆盖容器入口点（Dockerfile 中的 `ENTRYPOINT`）。

##### 语法格式

```yaml
services:
  app:
    image: myapp
    # 字符串格式
    entrypoint: /app/entrypoint.sh

  api:
    image: node:18
    # 列表格式（推荐）
    entrypoint: ["node", "--inspect=0.0.0.0:9229"]
```

##### 实战示例

```yaml
services:
  # 示例 1：自定义入口脚本
  app:
    image: myapp
    entrypoint: ["/docker-entrypoint.sh"]
    command: ["--config", "/etc/app.conf"]

  # 示例 2：调试模式
  debug:
    image: node:18
    entrypoint: ["node", "--inspect-brk=0.0.0.0:9229"]
    command: ["app.js"]

  # 示例 3：禁用默认入口点
  shell:
    image: redis
    entrypoint: []
    command: ["sh", "-c", "redis-cli ping"]
```

---

#### entrypoint + command 组合

`entrypoint` 定义可执行程序，`command` 定义参数：

```yaml
services:
  # 最终执行: python -u app.py --debug --port 8080
  app:
    image: python:3.11
    entrypoint: ["python", "-u"]
    command: ["app.py", "--debug", "--port", "8080"]
```

##### 组合规则

| Dockerfile       | compose entrypoint | compose command | 最终执行                                |
| ---------------- | ------------------ | --------------- | --------------------------------------- |
| ENTRYPOINT + CMD | -                  | -               | Dockerfile 定义                         |
| ENTRYPOINT + CMD | 设置               | -               | compose entrypoint + Dockerfile CMD     |
| ENTRYPOINT + CMD | -                  | 设置            | Dockerfile ENTRYPOINT + compose command |
| ENTRYPOINT + CMD | 设置               | 设置            | compose entrypoint + compose command    |
| ENTRYPOINT + CMD | `[]` (空)        | 设置            | compose command                         |

---

#### 常见使用场景

##### 场景 1：开发环境热重载

```yaml
services:
  api:
    build: .
    command: npm run dev
    volumes:
      - .:/app
```

##### 场景 2：数据库初始化脚本

```yaml
services:
  db:
    image: postgres:15
    entrypoint: ["/docker-entrypoint.sh"]
    command: ["postgres"]
    volumes:
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
```

##### 场景 3：等待依赖服务

```yaml
services:
  api:
    image: myapi
    entrypoint: ["/wait-for-it.sh", "db:5432", "--"]
    command: ["./start.sh"]
    depends_on:
      - db
```

##### 场景 4：一次性任务

```yaml
services:
  migrate:
    image: myapp
    command: ["npm", "run", "migrate"]
    profiles:
      - tools
```

##### 场景 5：多命令执行

```yaml
services:
  setup:
    image: alpine
    command: >
      sh -c "
        echo 'Step 1: Initialize' &&
        mkdir -p /data/logs &&
        echo 'Step 2: Set permissions' &&
        chmod 755 /data &&
        echo 'Step 3: Complete'
      "
```

---

#### 注意事项

> ⚠️ **重要提示**：
>
> 1. exec 形式（列表格式）不会进行 shell 变量替换，需要显式使用 `sh -c`
> 2. 空 entrypoint `[]` 可以完全禁用 Dockerfile 定义的入口点
> 3. 在生产环境建议使用 exec 形式，可以正确接收信号

---

### 9.10 端口与网络属性详解（ports, expose, networks, dns, extra_hosts）

#### ports 属性

`ports` 属性用于将容器端口映射到宿主机。

##### 短格式

```yaml
services:
  web:
    image: nginx
    ports:
      - "80"                    # 容器端口，宿主机随机分配
      - "8080:80"               # 宿主机:容器
      - "443:443"               # HTTPS
      - "127.0.0.1:8080:80"     # 绑定特定 IP
      - "8080-8090:80-90"       # 端口范围
      - "6060:6060/udp"         # UDP 协议
```

##### 长格式

```yaml
services:
  web:
    image: nginx
    ports:
      - target: 80              # 容器端口
        published: 8080         # 宿主机端口
        protocol: tcp           # 协议 (tcp/udp)
        mode: host              # host 或 ingress
        host_ip: 0.0.0.0        # 绑定 IP

      - target: 443
        published: "8443"
        protocol: tcp
```

##### 配置项说明

| 配置项        | 说明                                   |
| ------------- | -------------------------------------- |
| `target`    | 容器端口                               |
| `published` | 宿主机端口                             |
| `protocol`  | 协议（tcp/udp）                        |
| `mode`      | host（直接绑定）或 ingress（负载均衡） |
| `host_ip`   | 绑定的宿主机 IP                        |

---

#### expose 属性

`expose` 属性声明容器内部端口，仅供内部网络访问，**不映射到宿主机**。

```yaml
services:
  api:
    image: myapi
    expose:
      - "3000"
      - "3001"
      - "8000-8100"
```

##### ports vs expose 对比

| 属性       | 宿主机可访问 | 容器间可访问 | 用途     |
| ---------- | ------------ | ------------ | -------- |
| `ports`  | ✅           | ✅           | 外部服务 |
| `expose` | ❌           | ✅           | 内部服务 |

---

#### networks 属性

`networks` 属性配置服务使用的网络。

##### 基本用法

```yaml
services:
  web:
    image: nginx
    networks:
      - frontend

  api:
    image: myapi
    networks:
      - frontend
      - backend

  db:
    image: mysql
    networks:
      - backend

networks:
  frontend:
  backend:
```

##### 高级配置

```yaml
services:
  api:
    image: myapi
    networks:
      backend:
        aliases:                    # 网络别名
          - api-service
          - internal-api
        ipv4_address: 172.20.0.10   # 固定 IP
        ipv6_address: 2001:db8::10
        priority: 100               # 优先级

networks:
  backend:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

---

#### network_mode 属性

`network_mode` 设置容器的网络模式。

```yaml
services:
  # 使用宿主机网络
  host-app:
    image: myapp
    network_mode: host

  # 不使用网络
  isolated:
    image: myapp
    network_mode: none

  # 共享另一个容器的网络
  sidecar:
    image: debug-tools
    network_mode: service:api

  # 共享另一个容器的网络（通过容器名）
  debug:
    image: nicolaka/netshoot
    network_mode: container:my-container
```

##### 网络模式对比

| 模式                           | 说明                 |
| ------------------------------ | -------------------- |
| `bridge`                     | 默认，容器有独立网络 |
| `host`                       | 使用宿主机网络栈     |
| `none`                       | 无网络               |
| `service:[service_name]`     | 共享指定服务的网络   |
| `container:[container_name]` | 共享指定容器的网络   |

> ⚠️ 使用 `network_mode` 时不能同时使用 `networks` 和 `ports`

---

#### dns 属性

`dns` 属性配置容器的 DNS 服务器。

```yaml
services:
  app:
    image: myapp
    dns:
      - 8.8.8.8
      - 8.8.4.4
    dns_search:
      - example.com
      - internal.example.com
    dns_opt:
      - ndots:5
      - timeout:3
```

---

#### extra_hosts 属性

`extra_hosts` 属性添加额外的 hosts 映射（写入 `/etc/hosts`）。

```yaml
services:
  app:
    image: myapp
    extra_hosts:
      - "db.local:192.168.1.100"
      - "api.local:192.168.1.101"
      - "host.docker.internal:host-gateway"  # 访问宿主机
```

---

#### 实战示例

##### 示例 1：前后端分离架构

```yaml
services:
  nginx:
    image: nginx
    ports:
      - "80:80"
    networks:
      - frontend

  api:
    image: myapi
    expose:
      - "3000"
    networks:
      - frontend
      - backend

  db:
    image: postgres
    expose:
      - "5432"
    networks:
      - backend

networks:
  frontend:
  backend:
    internal: true    # 内部网络，无法访问外网
```

##### 示例 2：固定 IP 部署

```yaml
services:
  app:
    image: myapp
    networks:
      mynet:
        ipv4_address: 172.28.0.10

networks:
  mynet:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

##### 示例 3：调试容器

```yaml
services:
  api:
    image: myapi
    networks:
      - appnet

  debug:
    image: nicolaka/netshoot
    network_mode: service:api
    profiles:
      - debug
```

---

### 9.11 存储与挂载属性详解（volumes, tmpfs, configs, secrets）

#### volumes 属性

`volumes` 属性用于挂载卷或目录到容器。

##### 短格式

```yaml
services:
  app:
    image: myapp
    volumes:
      - /var/lib/data                      # 匿名卷
      - mydata:/var/lib/data               # 命名卷
      - ./config:/etc/app/config           # 绑定挂载（相对路径）
      - /host/path:/container/path         # 绑定挂载（绝对路径）
      - ./config:/etc/app/config:ro        # 只读挂载
      - ./logs:/var/log:rw                 # 读写挂载
```

##### 长格式

```yaml
services:
  app:
    image: myapp
    volumes:
      # 命名卷
      - type: volume
        source: mydata
        target: /var/lib/data
        read_only: false
        volume:
          nocopy: true        # 不复制容器数据到卷

      # 绑定挂载
      - type: bind
        source: ./config
        target: /etc/app/config
        read_only: true
        bind:
          create_host_path: true    # 自动创建宿主机目录
          selinux: z               # SELinux 标签

      # tmpfs 挂载
      - type: tmpfs
        target: /tmp
        tmpfs:
          size: 100m
          mode: 1777
```

##### 配置项说明

| 配置项                    | 说明                          |
| ------------------------- | ----------------------------- |
| `type`                  | 挂载类型（volume/bind/tmpfs） |
| `source`                | 源（卷名或宿主机路径）        |
| `target`                | 容器内路径                    |
| `read_only`             | 是否只读                      |
| `volume.nocopy`         | 不复制数据到卷                |
| `bind.create_host_path` | 自动创建宿主机路径            |
| `bind.selinux`          | SELinux 标签（z/Z）           |

##### 顶层 volumes 定义

```yaml
services:
  db:
    image: postgres
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:                          # 默认本地驱动
  
  nfs-data:                         # NFS 驱动
    driver: local
    driver_opts:
      type: nfs
      o: addr=192.168.1.100,rw
      device: ":/path/to/dir"

  external-vol:                     # 使用外部卷
    external: true
    name: my-existing-volume
```

---

#### tmpfs 属性

`tmpfs` 属性用于挂载内存文件系统。

```yaml
services:
  app:
    image: myapp
    tmpfs:
      - /tmp
      - /run

  cache:
    image: myapp
    tmpfs:
      - /tmp:size=100m,mode=1777
```

##### tmpfs 适用场景

| 场景     | 说明               |
| -------- | ------------------ |
| 敏感数据 | 临时存储不落盘     |
| 高速缓存 | 内存级 IO 性能     |
| 临时文件 | 容器销毁后自动清理 |

---

#### configs 属性

`configs` 属性用于注入配置文件到容器。

```yaml
services:
  web:
    image: nginx
    configs:
      - my_config                           # 短格式，挂载到 /<config-name>
      - source: nginx_config
        target: /etc/nginx/nginx.conf       # 指定目标路径
        uid: "103"                          # 文件所有者
        gid: "103"
        mode: 0440                          # 文件权限

configs:
  my_config:
    file: ./my_config.txt                  # 从文件创建

  nginx_config:
    file: ./nginx.conf

  external_config:
    external: true                          # 使用外部配置
    name: production_config
```

##### configs 与 volumes 对比

| 特性     | configs              | volumes    |
| -------- | -------------------- | ---------- |
| 可变性   | 不可变（需重新创建） | 可变       |
| 存储位置 | Docker 管理          | 宿主机或卷 |
| 适用场景 | 配置文件             | 持久化数据 |

---

#### secrets 属性

`secrets` 属性用于安全地注入敏感信息。

```yaml
services:
  db:
    image: postgres
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password                        # 短格式

  api:
    image: myapi
    secrets:
      - source: api_key
        target: /run/secrets/api_key       # 长格式
        uid: "1000"
        gid: "1000"
        mode: 0400

secrets:
  db_password:
    file: ./secrets/db_password.txt        # 从文件创建

  api_key:
    environment: API_KEY                   # 从环境变量创建

  external_secret:
    external: true                          # 使用外部 secret
```

> 📝 Secrets 默认挂载到 `/run/secrets/<secret_name>`

---

#### 实战示例

##### 示例 1：数据库持久化

```yaml
services:
  db:
    image: mysql:8.0
    volumes:
      - db-data:/var/lib/mysql
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    secrets:
      - db_root_password
    environment:
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/db_root_password

volumes:
  db-data:

secrets:
  db_root_password:
    file: ./secrets/mysql_root_password.txt
```

##### 示例 2：Nginx 配置

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    configs:
      - source: nginx_conf
        target: /etc/nginx/nginx.conf
    secrets:
      - ssl_cert
      - ssl_key

configs:
  nginx_conf:
    file: ./nginx.conf

secrets:
  ssl_cert:
    file: ./certs/server.crt
  ssl_key:
    file: ./certs/server.key
```

##### 示例 3：多容器共享卷

```yaml
services:
  app:
    image: myapp
    volumes:
      - shared-data:/app/data

  backup:
    image: backup-tool
    volumes:
      - shared-data:/data:ro
    profiles:
      - backup

volumes:
  shared-data:
```

---

### 9.12 环境变量属性详解（environment, env_file）

#### environment 属性

`environment` 属性用于设置容器环境变量。

##### 列表格式

```yaml
services:
  app:
    image: myapp
    environment:
      - NODE_ENV=production
      - DEBUG=false
      - API_URL=http://api:3000
```

##### 字典格式

```yaml
services:
  app:
    image: myapp
    environment:
      NODE_ENV: production
      DEBUG: "false"
      API_URL: http://api:3000
      EMPTY_VAR:                 # 空值
```

##### 从宿主机传递

```yaml
services:
  app:
    image: myapp
    environment:
      - HOME                     # 传递宿主机 $HOME
      - USER                     # 传递宿主机 $USER
      - API_KEY                  # 传递宿主机 $API_KEY
```

---

#### env_file 属性

`env_file` 属性用于从文件加载环境变量。

##### 基本用法

```yaml
services:
  app:
    image: myapp
    env_file:
      - .env                     # 默认环境变量
      - .env.local               # 本地覆盖
```

##### 长格式

```yaml
services:
  app:
    image: myapp
    env_file:
      - path: .env
        required: true           # 文件必须存在
      - path: .env.local
        required: false          # 文件可选
```

##### .env 文件格式

```bash
# 这是注释
NODE_ENV=production
DEBUG=false

# 支持引号
API_URL="http://api:3000"
MESSAGE='Hello World'

# 支持变量引用
BASE_URL=http://example.com
API_ENDPOINT=${BASE_URL}/api

# 空行会被忽略
```

---

#### 变量优先级

从高到低：

| 优先级 | 来源                      | 说明             |
| ------ | ------------------------- | ---------------- |
| 1      | `docker compose run -e` | 命令行指定       |
| 2      | `environment`           | Compose 文件定义 |
| 3      | `env_file`              | 环境变量文件     |
| 4      | Dockerfile `ENV`        | 镜像默认值       |

---

#### 变量替换

Compose 文件支持变量替换：

```yaml
services:
  db:
    image: mysql:${MYSQL_VERSION:-8.0}
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD:?必须设置数据库密码}
      MYSQL_DATABASE: ${DB_NAME:-myapp}
```

##### 替换语法

| 语法                | 说明                   |
| ------------------- | ---------------------- |
| `${VAR}`          | 变量值                 |
| `${VAR:-default}` | 变量未设置时使用默认值 |
| `${VAR-default}`  | 变量未定义时使用默认值 |
| `${VAR:?error}`   | 变量未设置时报错       |
| `${VAR?error}`    | 变量未定义时报错       |
| `${VAR:+value}`   | 变量已设置时使用 value |

---

#### 实战示例

##### 示例 1：多环境配置

```yaml
# compose.yaml
services:
  app:
    image: myapp
    env_file:
      - .env
      - .env.${ENV:-dev}        # 根据 ENV 变量加载配置
    environment:
      - ENV=${ENV:-dev}
```

```bash
# .env.dev
DEBUG=true
LOG_LEVEL=debug

# .env.prod
DEBUG=false
LOG_LEVEL=info
```

##### 示例 2：数据库配置

```yaml
services:
  db:
    image: postgres:15
    env_file:
      - ./secrets/db.env
    environment:
      POSTGRES_DB: ${DB_NAME:-myapp}

  app:
    image: myapp
    env_file:
      - .env
    environment:
      - DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@db:5432/${DB_NAME}
    depends_on:
      - db
```

##### 示例 3：开发 vs 生产

```yaml
services:
  api:
    image: myapi
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      LOG_LEVEL: ${LOG_LEVEL:-debug}
      API_PORT: ${API_PORT:-3000}
    env_file:
      - path: .env
        required: true
      - path: .env.local
        required: false
```

---

#### 注意事项

> ⚠️ **安全提示**：
>
> 1. 不要在 `environment` 中存储敏感信息，使用 `secrets` 或外部密钥管理
> 2. `.env` 文件不应提交到版本控制，添加到 `.gitignore`
> 3. 生产环境建议使用 `env_file` 配合加密存储

---

### 9.13 服务依赖属性详解（depends_on）

#### depends_on 概述

`depends_on` 属性用于定义服务之间的启动依赖关系。

##### 短格式

```yaml
services:
  app:
    image: myapp
    depends_on:
      - db
      - redis

  db:
    image: postgres

  redis:
    image: redis
```

> 📝 短格式只控制启动顺序，不等待依赖服务就绪

---

#### 长格式（推荐）

长格式支持设置启动条件：

```yaml
services:
  app:
    image: myapp
    depends_on:
      db:
        condition: service_healthy       # 等待健康检查通过
      redis:
        condition: service_started       # 等待服务启动
      migration:
        condition: service_completed_successfully  # 等待服务成功完成

  db:
    image: postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis

  migration:
    image: myapp
    command: ["npm", "run", "migrate"]
```

##### condition 选项

| 选项                               | 说明                       |
| ---------------------------------- | -------------------------- |
| `service_started`                | 依赖服务已启动（默认）     |
| `service_healthy`                | 依赖服务健康检查通过       |
| `service_completed_successfully` | 依赖服务成功退出（exit 0） |

---

#### 其他选项

```yaml
services:
  app:
    depends_on:
      db:
        condition: service_healthy
        restart: true                    # 依赖重启时也重启此服务
        required: true                   # 依赖必须可用（默认 true）
```

---

#### 实战示例

##### 示例 1：Web + API + DB 架构

```yaml
services:
  nginx:
    image: nginx
    depends_on:
      api:
        condition: service_healthy
    ports:
      - "80:80"

  api:
    image: myapi
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  db:
    image: postgres:15
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5

  redis:
    image: redis:alpine
```

##### 示例 2：数据库迁移

```yaml
services:
  app:
    image: myapp
    depends_on:
      migration:
        condition: service_completed_successfully

  migration:
    image: myapp
    command: ["npm", "run", "db:migrate"]
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:15
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]
      interval: 5s
      retries: 10
```

##### 示例 3：初始化容器

```yaml
services:
  app:
    image: myapp
    depends_on:
      init:
        condition: service_completed_successfully
    volumes:
      - app-data:/app/data

  init:
    image: alpine
    command: |
      sh -c "
        mkdir -p /data/logs /data/cache &&
        chmod 755 /data/*
      "
    volumes:
      - app-data:/data

volumes:
  app-data:
```

---

#### 注意事项

> ⚠️ **重要提示**：
>
> 1. `depends_on` 只控制启动顺序，不保证应用层面的就绪状态
> 2. 使用 `service_healthy` 时，依赖服务必须配置 `healthcheck`
> 3. `service_completed_successfully` 用于一次性任务（如迁移、初始化）
> 4. 生产环境应用应自行处理依赖不可用的情况（重试机制）

---

### 9.14 健康检查属性详解（healthcheck）

#### healthcheck 概述

`healthcheck` 属性用于定义容器健康检查，Docker 会定期执行检查命令来判断容器是否健康。

##### 基本配置

```yaml
services:
  app:
    image: myapp
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
      start_interval: 5s
```

---

#### 配置项详解

| 配置项             | 说明                     | 默认值 |
| ------------------ | ------------------------ | ------ |
| `test`           | 健康检查命令             | -      |
| `interval`       | 检查间隔                 | 30s    |
| `timeout`        | 单次检查超时             | 30s    |
| `retries`        | 连续失败多少次判定不健康 | 3      |
| `start_period`   | 容器启动后的初始化时间   | 0s     |
| `start_interval` | 启动期间的检查间隔       | 5s     |

---

#### test 命令格式

##### CMD 格式（推荐）

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost/health"]
```

##### CMD-SHELL 格式

```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -f http://localhost/health || exit 1"]
```

##### 字符串格式

```yaml
healthcheck:
  test: curl -f http://localhost/health || exit 1
```

---

#### 禁用健康检查

```yaml
services:
  app:
    image: myapp
    healthcheck:
      disable: true
```

---

#### 健康状态

| 状态          | 说明                           |
| ------------- | ------------------------------ |
| `starting`  | 容器启动中，在 start_period 内 |
| `healthy`   | 健康检查通过                   |
| `unhealthy` | 连续失败次数达到 retries       |

---

#### 实战示例

##### 示例 1：Web 应用

```yaml
services:
  web:
    image: nginx
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

##### 示例 2：PostgreSQL

```yaml
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: secret
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
```

##### 示例 3：MySQL

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: secret
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 60s
```

##### 示例 4：Redis

```yaml
services:
  redis:
    image: redis:alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
```

##### 示例 5：自定义脚本

```yaml
services:
  app:
    image: myapp
    healthcheck:
      test: ["CMD", "/app/healthcheck.sh"]
      interval: 30s
      timeout: 10s
      retries: 3
```

##### 示例 6：TCP 端口检查

```yaml
services:
  app:
    image: myapp
    healthcheck:
      test: ["CMD-SHELL", "nc -z localhost 8080 || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
```

---

#### 配合 depends_on 使用

```yaml
services:
  api:
    image: myapi
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      retries: 3

  db:
    image: postgres:15
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5
```

---

#### 注意事项

> ⚠️ **最佳实践**：
>
> 1. `start_period` 应足够长，让应用完成初始化
> 2. `timeout` 应小于 `interval`
> 3. 健康检查命令应该轻量，避免影响应用性能
> 4. 使用 CMD 格式而非 SHELL 格式可减少进程开销
> 5. 生产环境建议为所有关键服务配置健康检查

---

### 9.15 资源限制属性详解（cpus, memory, deploy）

#### 直接资源限制（Compose V2）

##### CPU 限制

```yaml
services:
  app:
    image: myapp
    cpus: 0.5                    # 限制使用 0.5 个 CPU 核心
    cpu_shares: 1024             # CPU 共享权重（相对值）
    cpu_period: 100000           # CPU 周期（微秒）
    cpu_quota: 50000             # CPU 配额（微秒）
    cpuset: "0,1"                # 绑定到指定 CPU 核心
```

##### 内存限制

```yaml
services:
  app:
    image: myapp
    mem_limit: 512m              # 内存硬限制
    mem_reservation: 256m        # 内存软限制
    memswap_limit: 1g            # 内存+交换分区总限制
    mem_swappiness: 60           # 交换分区使用倾向 (0-100)
    oom_kill_disable: false      # 禁用 OOM 杀死
    oom_score_adj: 100           # OOM 优先级调整 (-1000 到 1000)
```

##### 资源单位

| 单位           | 说明     |
| -------------- | -------- |
| `b`          | 字节     |
| `k` / `kb` | 千字节   |
| `m` / `mb` | 兆字节   |
| `g` / `gb` | 千兆字节 |

---

#### blkio_config（块 IO 限制）

```yaml
services:
  db:
    image: postgres
    blkio_config:
      weight: 500                        # IO 权重 (10-1000)
      weight_device:
        - path: /dev/sda
          weight: 400
      device_read_bps:                   # 读取速度限制
        - path: /dev/sda
          rate: '50mb'
      device_write_bps:                  # 写入速度限制
        - path: /dev/sda
          rate: '30mb'
      device_read_iops:                  # 读取 IOPS 限制
        - path: /dev/sda
          rate: 1000
      device_write_iops:                 # 写入 IOPS 限制
        - path: /dev/sda
          rate: 500
```

---

#### deploy（部署配置）

`deploy` 主要用于 Swarm 模式，但部分属性也适用于 Compose。

##### 基本配置

```yaml
services:
  app:
    image: myapp
    deploy:
      replicas: 3                        # 副本数
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

##### 完整配置

```yaml
services:
  api:
    image: myapi
    deploy:
      mode: replicated                   # replicated 或 global
      replicas: 3
    
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
          pids: 100                      # 进程数限制
        reservations:
          cpus: '0.5'
          memory: 512M
          devices:                       # 设备预留
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
    
      update_config:                     # 滚动更新配置
        parallelism: 2
        delay: 10s
        failure_action: rollback
        order: start-first
    
      rollback_config:                   # 回滚配置
        parallelism: 1
        delay: 5s
```

##### deploy.resources 配置项

| 配置项                   | 说明               |
| ------------------------ | ------------------ |
| `limits.cpus`          | CPU 核心数上限     |
| `limits.memory`        | 内存上限           |
| `limits.pids`          | 进程数上限         |
| `reservations.cpus`    | CPU 预留           |
| `reservations.memory`  | 内存预留           |
| `reservations.devices` | 设备预留（如 GPU） |

---

#### 实战示例

##### 示例 1：Web 应用资源限制

```yaml
services:
  web:
    image: nginx
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.25'
          memory: 128M
```

##### 示例 2：数据库资源配置

```yaml
services:
  db:
    image: postgres:15
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
    blkio_config:
      device_read_bps:
        - path: /dev/sda
          rate: '100mb'
      device_write_bps:
        - path: /dev/sda
          rate: '50mb'
```

##### 示例 3：GPU 应用

```yaml
services:
  ml-app:
    image: tensorflow/tensorflow:latest-gpu
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

##### 示例 4：多服务资源分配

```yaml
services:
  api:
    image: myapi
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '0.5'
          memory: 512M

  worker:
    image: myworker
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1.0'
          memory: 1G

  cache:
    image: redis:alpine
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
```

---

#### 注意事项

> ⚠️ **重要提示**：
>
> 1. `deploy` 配置在非 Swarm 模式下需要 `docker compose` 命令（V2）
> 2. `limits` 是硬限制，`reservations` 是软限制
> 3. 内存限制过小可能导致 OOM，建议先监控再设置
> 4. CPU 限制使用小数表示核心数（如 0.5 = 半个核心）
> 5. 生产环境建议同时设置 limits 和 reservations

---

### 9.16 容器配置属性详解（container_name, hostname, restart, init）

#### container_name 属性

`container_name` 属性用于指定容器名称。

```yaml
services:
  db:
    image: postgres
    container_name: my-postgres-db
```

> ⚠️ 指定 `container_name` 后无法使用 `docker compose up --scale` 扩展服务

---

#### hostname 属性

`hostname` 属性用于设置容器主机名。

```yaml
services:
  web:
    image: nginx
    hostname: web-server
    domainname: example.com          # 可选，域名
```

##### 相关属性

```yaml
services:
  app:
    image: myapp
    hostname: app-server
    extra_hosts:
      - "host.docker.internal:host-gateway"
    dns:
      - 8.8.8.8
    dns_search:
      - example.com
```

---

#### restart 属性

`restart` 属性用于设置容器重启策略。

```yaml
services:
  app:
    image: myapp
    restart: unless-stopped
```

##### 重启策略选项

| 策略               | 说明                       |
| ------------------ | -------------------------- |
| `no`             | 不自动重启（默认）         |
| `always`         | 始终重启                   |
| `on-failure`     | 非正常退出时重启           |
| `on-failure:5`   | 非正常退出时最多重启 5 次  |
| `unless-stopped` | 除非手动停止，否则始终重启 |

##### always vs unless-stopped

| 场景                     | always | unless-stopped |
| ------------------------ | ------ | -------------- |
| 容器异常退出             | 重启   | 重启           |
| Docker 服务重启          | 重启   | 重启           |
| 手动 stop 后 Docker 重启 | 重启   | 不重启         |

---

#### init 属性

`init` 属性用于在容器内运行 init 进程（PID 1），正确处理信号和回收僵尸进程。

```yaml
services:
  app:
    image: myapp
    init: true
```

##### 为什么需要 init

```yaml
services:
  # 不使用 init：脚本无法正确处理 SIGTERM
  worker-bad:
    image: alpine
    command: ["sh", "-c", "while true; do echo working; sleep 1; done"]

  # 使用 init：正确处理信号
  worker-good:
    image: alpine
    init: true
    command: ["sh", "-c", "while true; do echo working; sleep 1; done"]
```

---

#### 其他相关属性

```yaml
services:
  app:
    image: myapp
  
    # 工作目录
    working_dir: /app
  
    # 用户
    user: "1000:1000"
  
    # 标准输入
    stdin_open: true              # docker run -i
    tty: true                     # docker run -t
  
    # 停止信号和超时
    stop_signal: SIGTERM
    stop_grace_period: 30s
  
    # 标签
    labels:
      com.example.environment: "production"
      com.example.team: "backend"
```

---

#### 实战示例

##### 示例 1：生产环境配置

```yaml
services:
  api:
    image: myapi
    container_name: prod-api
    hostname: api
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    labels:
      environment: production
```

##### 示例 2：开发环境配置

```yaml
services:
  app:
    build: .
    container_name: dev-app
    restart: "no"
    stdin_open: true
    tty: true
    working_dir: /app
    volumes:
      - .:/app
```

##### 示例 3：多容器命名

```yaml
services:
  web:
    image: nginx
    container_name: ${PROJECT_NAME:-myapp}-web
    hostname: web

  api:
    image: myapi
    container_name: ${PROJECT_NAME:-myapp}-api
    hostname: api

  db:
    image: postgres
    container_name: ${PROJECT_NAME:-myapp}-db
    hostname: db
```

---

#### 注意事项

> ⚠️ **重要提示**：
>
> 1. `container_name` 在同一主机上必须唯一
> 2. 使用 `container_name` 会限制服务扩展能力
> 3. 生产环境建议使用 `restart: unless-stopped`
> 4. 运行 shell 脚本的容器建议启用 `init: true`

---

### 9.17 安全配置属性详解（privileged, cap_add/drop, security_opt, user）

#### privileged 属性

`privileged` 属性赋予容器几乎所有主机权限。

```yaml
services:
  docker-in-docker:
    image: docker:dind
    privileged: true
```

> ⚠️ **警告**：`privileged: true` 会禁用大部分安全隔离，仅在必要时使用

---

#### cap_add / cap_drop 属性

精细控制 Linux 能力（Capabilities）。

##### 添加能力

```yaml
services:
  network-tool:
    image: alpine
    cap_add:
      - NET_ADMIN                # 网络管理
      - SYS_PTRACE               # 进程跟踪
```

##### 删除能力

```yaml
services:
  secure-app:
    image: myapp
    cap_drop:
      - ALL                      # 删除所有能力
    cap_add:
      - NET_BIND_SERVICE         # 仅添加绑定低端口能力
```

##### 常用能力列表

| 能力                    | 说明               |
| ----------------------- | ------------------ |
| `NET_ADMIN`           | 网络配置           |
| `NET_BIND_SERVICE`    | 绑定 1024 以下端口 |
| `SYS_ADMIN`           | 系统管理操作       |
| `SYS_PTRACE`          | 跟踪进程           |
| `SYS_TIME`            | 修改系统时间       |
| `CHOWN`               | 修改文件所有者     |
| `DAC_OVERRIDE`        | 绕过文件权限检查   |
| `SETUID` / `SETGID` | 设置 UID/GID       |
| `KILL`                | 发送信号           |
| `MKNOD`               | 创建设备文件       |

---

#### security_opt 属性

配置安全选项。

```yaml
services:
  app:
    image: myapp
    security_opt:
      - no-new-privileges:true   # 禁止提升权限
      - seccomp:unconfined       # 禁用 seccomp
      - apparmor:unconfined      # 禁用 AppArmor
      - label:disable            # 禁用 SELinux
```

##### 常用安全选项

| 选项                              | 说明                |
| --------------------------------- | ------------------- |
| `no-new-privileges:true`        | 禁止进程获取新权限  |
| `seccomp:unconfined`            | 禁用 seccomp 限制   |
| `seccomp:/path/to/profile.json` | 自定义 seccomp 配置 |
| `apparmor:unconfined`           | 禁用 AppArmor       |
| `label:disable`                 | 禁用 SELinux 标签   |

---

#### user 属性

指定容器运行用户。

```yaml
services:
  app:
    image: myapp
    user: "1000:1000"            # UID:GID

  # 使用用户名（需镜像内存在）
  nginx:
    image: nginx
    user: nginx
```

##### 用户格式

| 格式                   | 说明        |
| ---------------------- | ----------- |
| `1000`               | UID         |
| `1000:1000`          | UID:GID     |
| `username`           | 用户名      |
| `username:groupname` | 用户名:组名 |

---

#### 其他安全相关属性

```yaml
services:
  app:
    image: myapp
  
    # 只读根文件系统
    read_only: true
  
    # 可写临时目录
    tmpfs:
      - /tmp
      - /run
  
    # 禁用 PID 命名空间共享
    pid: "host"
  
    # IPC 命名空间
    ipc: shareable
  
    # 系统调用限制
    sysctls:
      net.core.somaxconn: 1024
```

---

#### 实战示例

##### 示例 1：安全加固的 Web 应用

```yaml
services:
  web:
    image: nginx
    user: "101:101"
    read_only: true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
      - CHOWN
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /var/cache/nginx
      - /var/run
```

##### 示例 2：需要网络特权的工具

```yaml
services:
  tcpdump:
    image: nicolaka/netshoot
    cap_add:
      - NET_ADMIN
      - NET_RAW
    network_mode: host
```

##### 示例 3：Docker in Docker

```yaml
services:
  dind:
    image: docker:dind
    privileged: true
    environment:
      DOCKER_TLS_CERTDIR: ""
    volumes:
      - docker-data:/var/lib/docker

volumes:
  docker-data:
```

##### 示例 4：最小权限原则

```yaml
services:
  api:
    image: myapi
    user: "10000:10000"
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /tmp:size=100M,mode=1777
    volumes:
      - logs:/app/logs:rw
      - ./config:/app/config:ro

volumes:
  logs:
```

---

#### 注意事项

> ⚠️ **安全最佳实践**：
>
> 1. 避免使用 `privileged: true`，优先使用 `cap_add`
> 2. 使用 `cap_drop: ALL` 后按需添加能力
> 3. 始终启用 `no-new-privileges:true`
> 4. 使用非 root 用户运行容器
> 5. 尽可能使用 `read_only: true`

---

### 9.18 设备与日志属性详解（devices, gpus, logging）

#### devices 属性

`devices` 属性用于将主机设备映射到容器。

```yaml
services:
  app:
    image: myapp
    devices:
      - "/dev/ttyUSB0:/dev/ttyUSB0"       # 串口设备
      - "/dev/sda:/dev/xvda:rwm"          # 块设备（读写+mknod）
      - "/dev/video0:/dev/video0"         # 视频设备
```

##### 设备权限

| 权限  | 说明                  |
| ----- | --------------------- |
| `r` | 读取                  |
| `w` | 写入                  |
| `m` | mknod（创建设备节点） |

---

#### device_cgroup_rules 属性

允许更细粒度的设备访问控制。

```yaml
services:
  app:
    image: myapp
    device_cgroup_rules:
      - 'c 1:3 mr'                        # 读取 /dev/null
      - 'a 7:* rmw'                       # 所有循环设备
```

---

#### gpus 属性（Compose V2.3+）

`gpus` 属性用于分配 GPU 资源。

##### 使用所有 GPU

```yaml
services:
  ml-app:
    image: tensorflow/tensorflow:latest-gpu
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

##### 指定 GPU 数量

```yaml
services:
  training:
    image: pytorch/pytorch
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 2
              capabilities: [gpu]
```

##### 指定特定 GPU

```yaml
services:
  inference:
    image: mymodel
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ['0', '3']
              capabilities: [gpu, compute, utility]
```

##### GPU capabilities

| Capability   | 说明              |
| ------------ | ----------------- |
| `gpu`      | GPU 基础支持      |
| `compute`  | CUDA 计算         |
| `utility`  | nvidia-smi 等工具 |
| `graphics` | OpenGL 支持       |
| `video`    | 视频编解码        |
| `display`  | 显示输出          |

---

#### logging 属性

`logging` 属性用于配置容器日志。

##### 基本配置

```yaml
services:
  app:
    image: myapp
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
```

##### 常用日志驱动

| 驱动          | 说明                        |
| ------------- | --------------------------- |
| `json-file` | JSON 文件（默认）           |
| `local`     | 本地优化存储                |
| `syslog`    | 发送到 syslog               |
| `journald`  | 发送到 systemd journal      |
| `gelf`      | Graylog Extended Log Format |
| `fluentd`   | 发送到 Fluentd              |
| `awslogs`   | 发送到 AWS CloudWatch       |
| `gcplogs`   | 发送到 Google Cloud Logging |
| `none`      | 禁用日志                    |

##### json-file 选项

```yaml
services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "50m"           # 单个日志文件大小
        max-file: "10"            # 保留日志文件数
        compress: "true"          # 压缩轮转日志
        labels: "env,app"         # 添加标签到日志
```

##### syslog 选项

```yaml
services:
  app:
    logging:
      driver: syslog
      options:
        syslog-address: "udp://logs.example.com:514"
        syslog-facility: "daemon"
        tag: "{{.Name}}"
```

##### fluentd 选项

```yaml
services:
  app:
    logging:
      driver: fluentd
      options:
        fluentd-address: "localhost:24224"
        tag: "docker.{{.Name}}"
        fluentd-async: "true"
```

---

#### 实战示例

##### 示例 1：GPU 机器学习

```yaml
services:
  jupyter:
    image: jupyter/tensorflow-notebook
    ports:
      - "8888:8888"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    volumes:
      - ./notebooks:/home/jovyan/work
```

##### 示例 2：日志聚合

```yaml
services:
  app:
    image: myapp
    logging:
      driver: fluentd
      options:
        fluentd-address: "fluentd:24224"
        tag: "app.{{.Name}}"
    depends_on:
      - fluentd

  fluentd:
    image: fluent/fluentd
    ports:
      - "24224:24224"
    volumes:
      - ./fluent.conf:/fluentd/etc/fluent.conf
```

##### 示例 3：IoT 设备访问

```yaml
services:
  iot-gateway:
    image: myiot
    devices:
      - "/dev/ttyUSB0:/dev/ttyUSB0"
      - "/dev/ttyACM0:/dev/ttyACM0"
    privileged: false
    cap_add:
      - SYS_RAWIO
```

##### 示例 4：生产日志配置

```yaml
services:
  api:
    image: myapi
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "10"
        compress: "true"

  worker:
    image: myworker
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"

  debug:
    image: myapp
    profiles:
      - debug
    logging:
      driver: "none"              # 调试时禁用日志
```

---

#### 注意事项

> ⚠️ **重要提示**：
>
> 1. 使用 GPU 需要安装 nvidia-container-toolkit
> 2. 生产环境必须配置日志轮转（max-size, max-file）
> 3. 访问设备可能需要额外权限（cap_add 或 privileged）
> 4. 远程日志驱动可能影响容器启动速度

---

### 9.19 其他属性详解（labels, extends, profiles）

#### labels 属性

`labels` 属性用于为容器添加元数据标签。

##### 服务级别标签

```yaml
services:
  app:
    image: myapp
    labels:
      com.example.environment: "production"
      com.example.team: "backend"
      com.example.version: "1.0.0"
```

##### 列表格式

```yaml
services:
  app:
    image: myapp
    labels:
      - "com.example.environment=production"
      - "com.example.team=backend"
```

##### 顶层标签（项目级别）

```yaml
# 应用于整个项目
labels:
  project: myproject
  owner: devops

services:
  app:
    image: myapp
```

##### 常用标签约定

| 标签                        | 说明                |
| --------------------------- | ------------------- |
| `com.example.description` | 服务描述            |
| `com.example.environment` | 环境（dev/prod）    |
| `com.example.team`        | 负责团队            |
| `com.example.version`     | 版本号              |
| `traefik.enable`          | Traefik 代理配置    |
| `prometheus.io/scrape`    | Prometheus 抓取配置 |

---

#### extends 属性

`extends` 属性用于继承另一个服务的配置。

##### 基本用法

```yaml
# common.yaml
services:
  base:
    image: myapp
    environment:
      LOG_LEVEL: info
    logging:
      driver: json-file
      options:
        max-size: "10m"
```

```yaml
# compose.yaml
services:
  api:
    extends:
      file: common.yaml
      service: base
    ports:
      - "3000:3000"

  worker:
    extends:
      file: common.yaml
      service: base
    command: ["worker"]
```

##### 同文件继承

```yaml
services:
  base:
    image: myapp
    environment:
      LOG_LEVEL: info

  api:
    extends:
      service: base
    ports:
      - "3000:3000"

  worker:
    extends:
      service: base
    command: ["worker"]
```

##### 继承规则

| 属性类型 | 继承行为                           |
| -------- | ---------------------------------- |
| 单值属性 | 覆盖（image, command 等）          |
| 列表属性 | 合并（volumes, ports 等）          |
| 字典属性 | 深度合并（environment, labels 等） |

---

#### profiles 属性

`profiles` 属性用于按需启动服务。

##### 基本用法

```yaml
services:
  app:
    image: myapp                         # 默认启动

  debug:
    image: nicolaka/netshoot
    profiles:
      - debug                            # 仅在指定 profile 时启动

  db-admin:
    image: adminer
    profiles:
      - tools
```

##### 启动服务

```bash
# 仅启动默认服务
docker compose up

# 启动默认服务 + debug profile
docker compose --profile debug up

# 启动多个 profile
docker compose --profile debug --profile tools up
```

##### 多 profile 服务

```yaml
services:
  monitoring:
    image: prometheus
    profiles:
      - monitoring
      - production

  grafana:
    image: grafana/grafana
    profiles:
      - monitoring
      - production
```

---

#### 实战示例

##### 示例 1：标签用于服务发现

```yaml
services:
  api:
    image: myapi
    labels:
      traefik.enable: "true"
      traefik.http.routers.api.rule: "Host(`api.example.com`)"
      traefik.http.services.api.loadbalancer.server.port: "3000"
      prometheus.io/scrape: "true"
      prometheus.io/port: "3000"
      prometheus.io/path: "/metrics"
```

##### 示例 2：服务模板继承

```yaml
# base.yaml
services:
  nodejs-base:
    image: node:18-alpine
    working_dir: /app
    environment:
      NODE_ENV: production
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
```

```yaml
# compose.yaml
services:
  api:
    extends:
      file: base.yaml
      service: nodejs-base
    build: ./api
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]

  worker:
    extends:
      file: base.yaml
      service: nodejs-base
    build: ./worker
    command: ["node", "worker.js"]
```

##### 示例 3：开发调试工具

```yaml
services:
  app:
    image: myapp
    ports:
      - "8080:8080"

  # 调试工具
  shell:
    image: alpine
    profiles:
      - debug
    command: ["sleep", "infinity"]
    volumes:
      - .:/app

  netshoot:
    image: nicolaka/netshoot
    profiles:
      - debug
    network_mode: "service:app"

  # 数据库管理
  adminer:
    image: adminer
    profiles:
      - tools
    ports:
      - "8081:8080"
```

##### 示例 4：多环境配置

```yaml
services:
  app:
    image: myapp
    labels:
      environment: ${ENV:-development}

  # 生产环境监控
  prometheus:
    image: prom/prometheus
    profiles:
      - production

  alertmanager:
    image: prom/alertmanager
    profiles:
      - production

  # 开发环境工具
  mailhog:
    image: mailhog/mailhog
    profiles:
      - development
    ports:
      - "8025:8025"
```

---

#### 注意事项

> ⚠️ **重要提示**：
>
> 1. `extends` 不能继承 `depends_on`、`networks`、`volumes` 顶层定义
> 2. `profiles` 为空的服务默认启动
> 3. 标签键建议使用反向域名格式（如 `com.example.key`）
> 4. 继承时子服务的配置优先于父服务

---

### 9.20 顶级 networks 定义详解

#### 基本概念

`networks` 顶级键用于定义项目使用的网络。服务可以通过 `networks` 属性连接到这些网络。

```yaml
services:
  app:
    networks:
      - frontend
      - backend

networks:
  frontend:
  backend:
```

---

#### 网络驱动（driver）

```yaml
networks:
  # 默认桥接网络
  app-net:
    driver: bridge

  # 覆盖网络（Swarm）
  overlay-net:
    driver: overlay

  # 主机网络
  host-net:
    driver: host

  # 无网络
  none-net:
    driver: none

  # macvlan 网络
  macvlan-net:
    driver: macvlan
    driver_opts:
      parent: eth0
```

##### 网络驱动类型

| 驱动        | 说明                 |
| ----------- | -------------------- |
| `bridge`  | 默认，隔离的桥接网络 |
| `overlay` | Swarm 跨主机网络     |
| `host`    | 使用主机网络         |
| `none`    | 禁用网络             |
| `macvlan` | 分配 MAC 地址        |
| `ipvlan`  | 共享 MAC，不同 IP    |

---

#### driver_opts（驱动选项）

```yaml
networks:
  custom-net:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.name: "custom0"
      com.docker.network.bridge.enable_ip_masquerade: "true"
      com.docker.network.bridge.enable_icc: "true"
      com.docker.network.bridge.host_binding_ipv4: "0.0.0.0"
      com.docker.network.driver.mtu: "1500"
```

---

#### IPAM 配置

IPAM（IP 地址管理）用于自定义网络的 IP 分配。

```yaml
networks:
  custom-net:
    driver: bridge
    ipam:
      driver: default
      config:
        - subnet: 172.28.0.0/16
          ip_range: 172.28.5.0/24
          gateway: 172.28.0.1
          aux_addresses:
            host1: 172.28.1.5
            host2: 172.28.1.6
```

##### IPAM 配置项

| 配置项            | 说明                 |
| ----------------- | -------------------- |
| `driver`        | IPAM 驱动（default） |
| `subnet`        | 子网 CIDR            |
| `ip_range`      | 可分配 IP 范围       |
| `gateway`       | 网关地址             |
| `aux_addresses` | 预留地址             |

---

#### 外部网络（external）

使用已存在的外部网络。

```yaml
networks:
  existing-net:
    external: true

  # 指定外部网络名称
  app-net:
    external: true
    name: my-existing-network
```

---

#### 其他网络属性

```yaml
networks:
  app-net:
    driver: bridge
  
    # 网络名称（覆盖默认名称）
    name: my-app-network
  
    # 内部网络（无外部访问）
    internal: true
  
    # 可附加（允许手动连接容器）
    attachable: true
  
    # 启用 IPv6
    enable_ipv6: true
  
    # 标签
    labels:
      com.example.environment: production
```

---

#### 服务网络配置

服务连接网络时的详细配置。

```yaml
services:
  app:
    networks:
      frontend:
        aliases:
          - webapp
          - api
        ipv4_address: 172.28.0.10
        ipv6_address: 2001:db8::10
        priority: 1000

networks:
  frontend:
    ipam:
      config:
        - subnet: 172.28.0.0/24
```

##### 服务网络配置项

| 配置项             | 说明                 |
| ------------------ | -------------------- |
| `aliases`        | 网络别名（DNS 解析） |
| `ipv4_address`   | 固定 IPv4 地址       |
| `ipv6_address`   | 固定 IPv6 地址       |
| `priority`       | 网络优先级           |
| `link_local_ips` | 链路本地地址         |

---

#### 实战示例

##### 示例 1：多层网络架构

```yaml
services:
  nginx:
    image: nginx
    networks:
      - frontend

  api:
    image: myapi
    networks:
      - frontend
      - backend

  db:
    image: postgres
    networks:
      - backend

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true              # 数据库网络不暴露
```

##### 示例 2：自定义子网

```yaml
services:
  app:
    image: myapp
    networks:
      app-net:
        ipv4_address: 192.168.100.10

networks:
  app-net:
    driver: bridge
    ipam:
      config:
        - subnet: 192.168.100.0/24
          gateway: 192.168.100.1
```

##### 示例 3：使用外部网络

```yaml
services:
  app:
    image: myapp
    networks:
      - shared-net

networks:
  shared-net:
    external: true
    name: my-shared-network
```

##### 示例 4：完整网络配置

```yaml
services:
  web:
    image: nginx
    networks:
      frontend:
        aliases:
          - www
          - web

  api:
    image: myapi
    networks:
      frontend:
        aliases:
          - api
      backend:
        ipv4_address: 10.0.1.10

  db:
    image: postgres
    networks:
      backend:
        ipv4_address: 10.0.1.20

networks:
  frontend:
    driver: bridge
    name: prod-frontend
    labels:
      tier: frontend

  backend:
    driver: bridge
    name: prod-backend
    internal: true
    ipam:
      config:
        - subnet: 10.0.1.0/24
          gateway: 10.0.1.1
```

---

#### 注意事项

> ⚠️ **重要提示**：
>
> 1. 同一网络中的容器可以通过服务名互相访问
> 2. `internal: true` 网络无法访问外部网络
> 3. 使用固定 IP 必须配置对应的 IPAM subnet
> 4. 外部网络必须先手动创建

---

### 9.21 顶级 volumes 定义详解

#### 基本概念

`volumes` 顶级键用于定义可被服务挂载的命名卷。

```yaml
services:
  db:
    image: postgres
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:
```

---

#### 卷驱动（driver）

```yaml
volumes:
  # 默认本地驱动
  local-vol:
    driver: local

  # NFS 卷
  nfs-vol:
    driver: local
    driver_opts:
      type: nfs
      o: addr=192.168.1.100,rw
      device: ":/path/to/share"

  # tmpfs 卷
  tmpfs-vol:
    driver: local
    driver_opts:
      type: tmpfs
      device: tmpfs
      o: size=100m
```

##### 常用驱动选项

| 选项       | 说明                             |
| ---------- | -------------------------------- |
| `type`   | 文件系统类型（nfs, tmpfs, cifs） |
| `device` | 设备或远程路径                   |
| `o`      | 挂载选项                         |

---

#### driver_opts（驱动选项）

```yaml
volumes:
  # CIFS/SMB 卷
  cifs-vol:
    driver: local
    driver_opts:
      type: cifs
      device: "//192.168.1.100/share"
      o: username=user,password=pass,uid=1000,gid=1000

  # 绑定挂载（不推荐）
  bind-vol:
    driver: local
    driver_opts:
      type: none
      device: /host/path
      o: bind
```

---

#### 外部卷（external）

使用已存在的外部卷。

```yaml
volumes:
  existing-vol:
    external: true

  # 指定外部卷名称
  app-data:
    external: true
    name: my-existing-volume
```

---

#### 其他卷属性

```yaml
volumes:
  app-data:
    driver: local
  
    # 卷名称（覆盖默认名称）
    name: my-app-data
  
    # 标签
    labels:
      com.example.environment: production
      com.example.backup: "true"
```

---

#### 服务卷挂载配置

服务挂载卷时的详细配置。

##### 短格式

```yaml
services:
  app:
    volumes:
      - data:/app/data                   # 命名卷
      - ./config:/app/config             # 绑定挂载
      - /host/path:/container/path:ro    # 只读挂载
```

##### 长格式

```yaml
services:
  app:
    volumes:
      - type: volume
        source: data
        target: /app/data
        read_only: false
        volume:
          nocopy: true

      - type: bind
        source: ./config
        target: /app/config
        read_only: true
        bind:
          propagation: rprivate
          create_host_path: true

      - type: tmpfs
        target: /tmp
        tmpfs:
          size: 100000000
          mode: 1777
```

##### 挂载类型

| 类型       | 说明             |
| ---------- | ---------------- |
| `volume` | 命名卷           |
| `bind`   | 绑定挂载         |
| `tmpfs`  | 临时文件系统     |
| `npipe`  | Windows 命名管道 |

##### 挂载选项

| 选项            | 说明                                      |
| --------------- | ----------------------------------------- |
| `source`      | 卷名或主机路径                            |
| `target`      | 容器内路径                                |
| `read_only`   | 只读挂载                                  |
| `consistency` | 一致性模式（cached/delegated/consistent） |

---

#### 实战示例

##### 示例 1：数据库持久化

```yaml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: secret
    volumes:
      - postgres-data:/var/lib/postgresql/data

  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: secret
    volumes:
      - mysql-data:/var/lib/mysql

volumes:
  postgres-data:
  mysql-data:
```

##### 示例 2：共享卷

```yaml
services:
  web:
    image: nginx
    volumes:
      - static-files:/usr/share/nginx/html:ro

  app:
    image: myapp
    volumes:
      - static-files:/app/static:rw

volumes:
  static-files:
```

##### 示例 3：NFS 共享存储

```yaml
services:
  app:
    image: myapp
    volumes:
      - nfs-data:/app/data

volumes:
  nfs-data:
    driver: local
    driver_opts:
      type: nfs
      o: addr=nfs-server.example.com,nfsvers=4.1,rsize=1048576,wsize=1048576
      device: ":/exports/app-data"
```

##### 示例 4：完整卷配置

```yaml
services:
  api:
    image: myapi
    volumes:
      # 持久数据
      - type: volume
        source: api-data
        target: /app/data

      # 配置文件（只读）
      - type: bind
        source: ./config
        target: /app/config
        read_only: true

      # 临时目录
      - type: tmpfs
        target: /tmp
        tmpfs:
          size: 50000000

  db:
    image: postgres
    volumes:
      - type: volume
        source: db-data
        target: /var/lib/postgresql/data
        volume:
          nocopy: true

volumes:
  api-data:
    name: prod-api-data
    labels:
      backup: "daily"

  db-data:
    name: prod-db-data
    labels:
      backup: "hourly"
```

---

#### 注意事项

> ⚠️ **重要提示**：
>
> 1. 命名卷数据默认持久化，删除容器不会删除卷
> 2. `docker compose down -v` 会删除卷
> 3. 绑定挂载使用主机路径，可能存在权限问题
> 4. 外部卷必须先手动创建

---

*（第九章 Docker Compose 篇完成）*

---
