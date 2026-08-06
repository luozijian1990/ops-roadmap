# Nginx学习笔记

> 本笔记基于Nginx深度学习课程整理，适合初学者系统学习Nginx

---

## 第一部分：初识Nginx

### 1.1 课程概述

本课程旨在帮助学习者从Nginx初级使用者成长为高阶使用者，课程主要分为六个部分：

1. **初识Nginx** - 了解Nginx背景和基本用法
2. **Nginx架构基础** - 探讨进程模型和数据结构
3. **详解HTTP模块** - 深入理解HTTP请求处理流程
4. **反向代理与负载均衡** - 七层和四层负载均衡
5. **系统层优化** - Linux系统调优与Nginx配置协同
6. **源码视角深入使用** - 从实现层面理解Nginx机制

**学习目标：**

- 彻底明确Nginx的能力模型
- 了解Nginx的工作原理
- 搭建定制化的Web服务器和负载均衡服务
- 理解适合用Nginx编写的API服务场景
- 优化Linux系统使Nginx轻松应对百万并发连接

### 1.2 Nginx的应用场景

Nginx主要有三个核心使用场景：

#### 1.2.1 静态资源服务

直接通过本地文件系统提供CSS、JavaScript、图片等静态资源的访问，无需经过应用服务器处理。

#### 1.2.2 反向代理服务

- **负载均衡**：将请求分发到多台应用服务器，实现水平扩展和高可用
- **缓存加速**：缓存动态内容，减少用户访问延迟
- **容灾处理**：当某些服务器出现问题时，自动转发到正常服务器

#### 1.2.3 API服务

利用Nginx强大的并发性能，结合OpenResty或JavaScript，直接访问数据库或Redis，实现复杂的业务功能（如Web防火墙）。

```mermaid
graph TD
    A[客户端请求] --> B[Nginx边缘节点]
    B --> C{请求类型}
    C -->|静态资源| D[本地文件系统]
    C -->|动态请求| E[反向代理]
    C -->|API服务| F[直接访问数据库]
    E --> G[应用服务集群]
    G --> H[Tomcat/Django等]
    H --> I[MySQL/Redis]
    F --> I
    D --> J[返回响应]
    E --> J
    F --> J
    J --> A
```

### 1.3 Nginx出现的历史背景

#### 1.3.1 产生原因

1. **互联网数据量快速增长**

   - 全球化和互联网发展导致接入设备数量激增
   - 对硬件性能提出更高要求
2. **摩尔定律在单核CPU上失效**

   - CPU开始向多核方向发展
   - 传统软件未做好多核架构准备
3. **Apache架构低效**

   - 一个进程同时只处理一个连接
   - 进程间切换成本高
   - 无法应对数百万并发连接

#### 1.3.2 市场份额变化

根据Netcraft 2017年12月数据，Nginx市场份额快速上升。虽然Apache仍占据第一，但新增Web服务器多数选择Nginx。

```mermaid
graph LR
    A[2004年10月] -->|首个版本发布| B[2009年]
    B -->|支持Windows| C[2011年]
    C -->|1.0正式版| D[2015年]
    D -->|Stream四层代理| E[持续发展]
  
    style A fill:#e1f5ff
    style C fill:#ffe1e1
    style D fill:#e1ffe1
```

### 1.4 Nginx的五大优点

#### 1.4.1 高并发与高性能

- **高并发**：32核64G内存服务器可轻松达到数千万并发连接
- **高性能**：处理简单静态资源可达100万RPS
- 并发连接数增加时，RPS不会急剧下降

#### 1.4.2 可扩展性好

- **模块化设计**：架构稳定，易于扩展
- **丰富的生态圈**：大量第三方模块
- **OpenResty生态**：在Nginx基础上形成新的生态系统

#### 1.4.3 高可靠性

- 可在服务器上持续运行数年不间断
- 适合需要4个9、5个9甚至更高可用性的企业
- 作为边缘节点，宕机时间一年可能只能以秒计

#### 1.4.4 热部署

- 不停止服务的情况下升级Nginx
- 避免向客户端发送TCP Reset包
- 对于百万级并发连接至关重要

#### 1.4.5 BSD许可证

- 开源免费
- 可修改源代码用于商业场景
- 合法安全的定制化需求支持

### 1.5 Nginx的四个主要组成部分

```mermaid
graph TD
    A[Nginx二进制可执行文件] -->|提供功能| E[处理请求]
    B[nginx.conf配置文件] -->|控制行为| E
    E --> C[access.log访问日志]
    E --> D[error.log错误日志]
  
    style A fill:#e1f5ff
    style B fill:#ffe1e1
    style C fill:#e1ffe1
    style D fill:#fff5e1
```

1. **Nginx二进制可执行文件**

   - 由框架、官方模块和第三方模块构建
   - 类比：汽车本身
2. **nginx.conf配置文件**

   - 决定功能是否开启及行为方式
   - 类比：驾驶员
3. **access.log访问日志**

   - 记录每条HTTP请求的信息和响应信息
   - 类比：GPS轨迹
4. **error.log错误日志**

   - 记录错误和异常信息，用于问题定位
   - 类比：黑匣子

### 1.6 Nginx版本发布历史

#### 1.6.1 版本类型

- **Mainline版本**：主干版本，版本号为单数（如1.15.x），包含最新功能但不一定稳定
- **Stable版本**：稳定版本，版本号为双数（如1.14.x），经过充分测试

#### 1.6.2 重要时间节点

- **2002年**：开始开发
- **2004年10月4日**：发布第一个版本
- **2005年**：大规模重构
- **2009年**：支持Windows操作系统，Bug修复数量大幅减少
- **2011年**：1.0正式版发布，Nginx Plus商业公司成立
- **2015年**：发布Stream四层反向代理功能，可完全替代LVS

#### 1.6.3 版本特性

每个版本包含三类更新：

- **Feature**：新增功能
- **Bugfix**：修复的Bug
- **Change**：小的重构

### 1.7 选择合适的Nginx发行版本

#### 1.7.1 开源版 vs 商业版

| 版本            | 优点                     | 缺点             | 适用场景      |
| --------------- | ------------------------ | ---------------- | ------------- |
| Nginx开源版     | 免费、开源、社区活跃     | 需自行整合模块   | 通用场景      |
| Nginx Plus      | 整合第三方模块、技术支持 | 收费、不开源     | 企业级应用    |
| OpenResty开源版 | Lua语言开发、高性能      | -                | API服务、WAF  |
| OpenResty商业版 | 技术支持好               | 收费             | 企业级Lua应用 |
| Tengine         | 阿里生态验证             | 无法同步官方升级 | 不推荐        |

#### 1.7.2 推荐选择

- **无特殊需求**：使用Nginx开源版（nginx.org）
- **需要开发API服务或WAF**：使用OpenResty开源版（openresty.org）
- **Tengine不推荐**：因修改了主干代码，无法跟随官方版本同步升级

### 1.8 编译安装Nginx

#### 1.8.1 编译流程

```mermaid
graph TD
    A[下载Nginx源码] --> B[解压并查看目录结构]
    B --> C[执行configure脚本]
    C --> D[生成中间文件]
    D --> E[执行make编译]
    E --> F[生成目标文件]
    F --> G[执行make install]
    G --> H[安装完成]
  
    style A fill:#e1f5ff
    style C fill:#ffe1e1
    style E fill:#e1ffe1
    style G fill:#fff5e1
```

#### 1.8.2 源码目录结构

```
nginx-1.14.0/
├── auto/           # 编译辅助文件
│   ├── cc/        # 编译相关
│   ├── lib/       # 库文件
│   └── os/        # 操作系统判断
├── CHANGES        # 版本更新日志（英文）
├── CHANGES.ru     # 版本更新日志（俄文）
├── conf/          # 配置文件示例
├── configure      # 编译配置脚本
├── contrib/       # 辅助脚本和vim工具
├── html/          # 默认HTML文件
├── man/           # 帮助文档
└── src/           # 源代码
```

#### 1.8.3 configure参数说明

**1. 目录参数**（指定文件路径）

```bash
--prefix=PATH              # 安装目录（其他目录默认在此下创建）
--sbin-path=PATH          # 可执行文件路径
--modules-path=PATH       # 动态模块路径
--conf-path=PATH          # 配置文件路径
--error-log-path=PATH     # 错误日志路径
--pid-path=PATH           # PID文件路径
--lock-path=PATH          # 锁文件路径
```

**2. 模块参数**（选择编译的模块）

- `--with-*`：默认不编译，需主动添加（如 `--with-http_ssl_module`）
- `--without-*`：默认编译，可选择移除（如 `--without-http_gzip_module`）

**3. 特殊参数**

```bash
--with-cc-opt=OPTIONS     # GCC编译优化参数
--with-debug              # 打印debug级别日志
--add-module=PATH         # 添加第三方模块
```

#### 1.8.4 编译示例

```bash
# 1. 下载并解压
wget http://nginx.org/download/nginx-1.14.0.tar.gz
tar -xzf nginx-1.14.0.tar.gz
cd nginx-1.14.0

# 2. 配置编译参数
./configure --prefix=/home/geek/nginx

# 3. 编译
make

# 4. 安装（首次安装）
make install

# 5. 升级时只拷贝二进制文件
# cp objs/nginx /home/geek/nginx/sbin/
```

#### 1.8.5 编译后的目录结构

```
/home/geek/nginx/
├── sbin/          # 可执行文件
│   └── nginx
├── conf/          # 配置文件
│   ├── nginx.conf
│   ├── mime.types
│   └── ...
├── logs/          # 日志文件
│   ├── access.log
│   └── error.log
└── html/          # 默认网页
    ├── index.html
    └── 50x.html
```

#### 1.8.6 中间文件说明

执行configure后会生成 `objs`目录：

- **ngx_modules.c**：决定哪些模块被编译进Nginx
- **src/**：C语言编译的中间文件
- **nginx**：最终的可执行文件（升级时从这里拷贝）
- **\*.so**：动态模块文件

### 1.9 Nginx配置文件语法

#### 1.9.1 基本语法规则

Nginx配置文件是纯文本文件，由**指令（directive）**和**指令块（directive block）**组成。

**核心规则：**

1. **指令以分号结尾**

```nginx
include mime.types;
```

2. **指令与参数用空格分隔**

```nginx
limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;
```

3. **指令块用大括号组织**

```nginx
http {
    server {
        listen 80;
        location / {
            root html;
        }
    }
}
```

4. **指令块可以有名字**

```nginx
upstream backend {
    server 127.0.0.1:8080;
}

location /api {
    proxy_pass http://backend;
}
```

5. **include语句组合配置文件**

```nginx
include mime.types;
```

6. **井号添加注释**

```nginx
# 这是注释
listen 80;  # Nginx配置语法
```

7. **使用$符号引用变量**

```nginx
limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;
proxy_cache_key $host$uri$is_args$args;
```

8. **部分指令支持正则表达式**

```nginx
location ~ \.php$ {
    # 处理PHP文件
}
```

#### 1.9.2 时间单位

| 后缀 | 含义 | 示例  |
| ---- | ---- | ----- |
| ms   | 毫秒 | 100ms |
| s    | 秒   | 30s   |
| m    | 分钟 | 5m    |
| h    | 小时 | 2h    |
| d    | 天   | 7d    |
| w    | 周   | 2w    |
| M    | 月   | 3M    |
| y    | 年   | 1y    |

```nginx
expires 3m;  # 3分钟后缓存刷新
```

#### 1.9.3 空间单位

| 后缀 | 含义   | 示例 |
| ---- | ------ | ---- |
| 无   | 字节   | 1024 |
| k/K  | 千字节 | 10k  |
| m/M  | 兆字节 | 10m  |
| g/G  | 吉字节 | 1g   |

```nginx
limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;
```

#### 1.9.4 配置块层级关系

```nginx
http {                    # HTTP模块解析
    upstream backend {    # 上游服务定义
        server 127.0.0.1:8080;
    }
  
    server {             # 对应一个或一组域名
        listen 80;
  
        location / {     # URL表达式
            root html;
        }
    }
}
```

### 1.10 Nginx命令行操作

#### 1.10.1 基本命令格式

```bash
nginx [选项] [参数]
```

#### 1.10.2 常用命令参数

| 参数    | 说明               | 示例                                   |
| ------- | ------------------ | -------------------------------------- |
| -? / -h | 显示帮助信息       | `nginx -h`                           |
| -v      | 显示版本信息       | `nginx -v`                           |
| -V      | 显示版本和编译信息 | `nginx -V`                           |
| -t      | 测试配置文件语法   | `nginx -t`                           |
| -T      | 测试配置并打印     | `nginx -T`                           |
| -c      | 指定配置文件       | `nginx -c /path/to/nginx.conf`       |
| -g      | 设置全局指令       | `nginx -g "pid /var/run/nginx.pid;"` |
| -p      | 指定运行目录       | `nginx -p /usr/local/nginx/`         |
| -s      | 发送信号           | `nginx -s reload`                    |

#### 1.10.3 信号控制

```bash
# 立即停止服务
nginx -s stop

# 优雅停止服务（处理完当前请求）
nginx -s quit

# 重新加载配置文件
nginx -s reload

# 重新打开日志文件
nginx -s reopen
```

#### 1.10.4 重载配置文件（Reload）

```mermaid
graph TD
    A[修改nginx.conf] --> B[执行nginx -s reload]
    B --> C[Master进程收到信号]
    C --> D[Master验证新配置]
    D --> E[启动新Worker进程]
    E --> F[新Worker使用新配置]
    F --> G[向老Worker发送退出信号]
    G --> H[老Worker处理完现有请求后退出]
    H --> I[完成配置重载]
  
    style A fill:#e1f5ff
    style B fill:#ffe1e1
    style E fill:#e1ffe1
    style I fill:#fff5e1
```

**特点：**

- 不中断服务
- 新请求使用新配置
- 老请求继续处理完成

#### 1.10.5 热部署（Hot Upgrade）

```mermaid
graph TD
    A[备份旧nginx二进制文件] --> B[拷贝新nginx二进制文件]
    B --> C[向老Master发送USR2信号]
    C --> D[老Master启动新Master进程]
    D --> E[新Master启动新Worker进程]
    E --> F[新老Worker同时运行]
    F --> G[向老Master发送WINCH信号]
    G --> H[老Worker优雅退出]
    H --> I{是否回退}
    I -->|是| J[向老Master发送reload]
    I -->|否| K[向老Master发送QUIT]
    K --> L[热部署完成]
  
    style A fill:#e1f5ff
    style C fill:#ffe1e1
    style G fill:#fff5e1
    style L fill:#e1ffe1
```

**操作步骤：**

```bash
# 1. 备份旧版本
cp /usr/local/nginx/sbin/nginx /usr/local/nginx/sbin/nginx.old

# 2. 拷贝新版本
cp /path/to/new/nginx /usr/local/nginx/sbin/nginx

# 3. 向老Master发送USR2信号
kill -USR2 <老Master的PID>

# 4. 查看进程状态
ps aux | grep nginx
# 此时新老Master和Worker都在运行

# 5. 向老Master发送WINCH信号，优雅关闭老Worker
kill -WINCH <老Master的PID>

# 6. 如果需要回退
kill -HUP <老Master的PID>  # 重新拉起老Worker
kill -QUIT <新Master的PID>  # 关闭新Master

# 7. 确认无问题后，关闭老Master
kill -QUIT <老Master的PID>
```

**特点：**

- 完全不中断服务
- 支持版本回退
- 老Master保留用于回退

#### 1.10.6 日志切割

**方法一：手动切割**

```bash
# 1. 备份日志文件
mv /usr/local/nginx/logs/access.log /usr/local/nginx/logs/access.log.bak

# 2. 重新打开日志文件
nginx -s reopen
```

**方法二：定时任务切割**

创建切割脚本 `rotate.sh`：

```bash
#!/bin/bash
LOGS_PATH=/usr/local/nginx/logs
BACKUP_PATH=/data/nginx_logs_backup

# 获取昨天的日期
YESTERDAY=$(date -d "yesterday" +%Y%m%d)

# 移动日志文件
mv ${LOGS_PATH}/access.log ${BACKUP_PATH}/access_${YESTERDAY}.log
mv ${LOGS_PATH}/error.log ${BACKUP_PATH}/error_${YESTERDAY}.log

# 向Nginx主进程发送USR1信号，重新打开日志文件
kill -USR1 $(cat /usr/local/nginx/logs/nginx.pid)
```

添加到crontab：

```bash
# 每天凌晨0点执行日志切割
0 0 * * * /bin/bash /path/to/rotate.sh
```

### 1.11 搭建静态资源Web服务器

#### 1.11.1 基本配置

```nginx
server {
    listen 8080;
  
    location / {
        alias /home/geek/nginx/dlib/;  # 使用alias而非root
        # root会将location路径附加到文件路径
        # alias直接映射到指定目录
    }
}
```

#### 1.11.2 启用Gzip压缩

```nginx
http {
    # 开启gzip压缩
    gzip on;
  
    # 小于1字节的文件不压缩（为了演示效果设为1）
    gzip_min_length 1;
  
    # 压缩级别（1-9），级别越高压缩率越大但CPU消耗越多
    gzip_comp_level 2;
  
    # 指定压缩的MIME类型
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
```

**效果对比：**

- 未压缩：23.65KB
- 压缩后：7.28KB（压缩率约70%）

#### 1.11.3 启用autoindex模块

显示目录结构，方便文件共享：

```nginx
location / {
    alias /home/geek/nginx/dlib/;
    autoindex on;              # 开启目录浏览
    autoindex_exact_size off;  # 显示文件大小（可选）
    autoindex_localtime on;    # 显示本地时间（可选）
}
```

访问 `http://domain.com/dlib/` 会显示目录列表。

#### 1.11.4 限制访问速度

使用内置变量 `$limit_rate`限制传输速度：

```nginx
location / {
    alias /home/geek/nginx/dlib/;
    set $limit_rate 1k;  # 限制为每秒1KB
}
```

**应用场景：**

- 限制大文件下载速度
- 保证小文件（CSS、JS）有足够带宽
- 防止带宽被少数用户占用

#### 1.11.5 配置access日志

**定义日志格式：**

```nginx
http {
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'gzip_ratio=$gzip_ratio';
  
    server {
        access_log /home/geek/nginx/logs/access.log main;
    }
}
```

**常用变量：**

- `$remote_addr`：客户端IP地址
- `$time_local`：访问时间
- `$request`：请求行
- `$status`：HTTP状态码
- `$body_bytes_sent`：发送的字节数
- `$http_referer`：来源页面
- `$http_user_agent`：用户代理
- `$gzip_ratio`：gzip压缩比率

### 1.12 搭建反向代理服务

#### 1.12.1 配置上游服务器

首先将静态资源服务器改为只监听本地：

```nginx
# 上游服务器配置（nginx-1.14）
server {
    listen 127.0.0.1:8080;  # 只允许本机访问
  
    location / {
        alias /home/geek/nginx/dlib/;
    }
}
```

#### 1.12.2 配置反向代理

```nginx
# 反向代理服务器配置（OpenResty）
http {
    # 定义上游服务器组
    upstream backend {
        server 127.0.0.1:8080;
        # server 127.0.0.1:8081;  # 可添加多台服务器
        # server 127.0.0.1:8082;
    }
  
    server {
        listen 80;
        server_name example.com;
  
        location / {
            # 代理到上游服务器
            proxy_pass http://backend;
    
            # 传递真实客户端IP
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    
            # 传递Host头
            proxy_set_header Host $host;
        }
    }
}
```

#### 1.12.3 反向代理架构图

```mermaid
graph LR
    A[客户端浏览器] -->|1. HTTP请求| B[Nginx反向代理]
    B -->|2. 负载均衡| C[上游服务器1]
    B -->|2. 负载均衡| D[上游服务器2]
    B -->|2. 负载均衡| E[上游服务器N]
    C -->|3. 响应| B
    D -->|3. 响应| B
    E -->|3. 响应| B
    B -->|4. 返回响应| A
  
    style A fill:#e1f5ff
    style B fill:#ffe1e1
    style C fill:#e1ffe1
    style D fill:#e1ffe1
    style E fill:#e1ffe1
```

#### 1.12.4 配置缓存

```nginx
http {
    # 定义缓存路径和参数
    proxy_cache_path /tmp/nginx_cache 
                     levels=1:2 
                     keys_zone=my_cache:10m 
                     max_size=1g 
                     inactive=60m;
  
    server {
        location / {
            proxy_pass http://backend;
    
            # 启用缓存
            proxy_cache my_cache;
    
            # 定义缓存key
            proxy_cache_key $host$uri$is_args$args;
    
            # 缓存状态码和时间
            proxy_cache_valid 200 304 12h;
            proxy_cache_valid any 10m;
    
            # 添加缓存状态头
            add_header X-Cache-Status $upstream_cache_status;
        }
    }
}
```

**缓存参数说明：**

- `levels=1:2`：缓存目录层级
- `keys_zone`：共享内存区域名称和大小
- `max_size`：缓存最大容量
- `inactive`：缓存过期时间

**验证缓存：**
停止上游服务器后，反向代理仍能返回缓存的内容。

### 1.13 使用GoAccess实时监控日志

#### 1.13.1 GoAccess简介

GoAccess是一个实时Web日志分析工具，可以：

- 图形化显示access日志
- 通过WebSocket实时推送更新
- 支持多种日志格式

#### 1.13.2 安装GoAccess

```bash
# CentOS/RHEL
yum install goaccess

# Ubuntu/Debian
apt-get install goaccess

# 或从源码编译
wget https://tar.goaccess.io/goaccess-1.x.tar.gz
tar -xzvf goaccess-1.x.tar.gz
cd goaccess-1.x/
./configure --enable-utf8 --enable-geoip=legacy
make && make install
```

#### 1.13.3 使用GoAccess

```bash
goaccess /path/to/access.log \
    -o /path/to/report.html \
    --real-time-html \
    --time-format='%H:%M:%S' \
    --date-format='%d/%b/%Y' \
    --log-format=COMBINED
```

**参数说明：**

- `-o`：输出HTML文件路径
- `--real-time-html`：实时更新模式
- `--log-format=COMBINED`：使用Nginx默认日志格式

#### 1.13.4 配置Nginx访问报告

```nginx
location /report.html {
    alias /path/to/report.html;
}
```

访问 `http://domain.com/report.html` 即可查看实时统计。

**统计内容包括：**

- 总请求数和独立访客
- 按时间分布的请求
- 请求的URL排名
- 静态资源请求
- HTTP状态码分布
- 操作系统和浏览器分布
- 地理位置分布（需GeoIP支持）

### 1.14 SSL/TLS安全协议

#### 1.14.1 SSL/TLS发展历史

```mermaid
gantt
  title SSL/TLS 协议发展历程
  dateFormat  YYYY
  axisFormat %Y
  section 版本
  SSL 1.0 未发布   :done, ssl10, 1995, 1d
  SSL 2.0 网景公司 :done, ssl20, 1995, 1d
  SSL 3.0          :done, ssl30, 1996, 1d
  TLS 1.0 IETF 标准化 :done, tls10, 1999, 1d
  TLS 1.1          :done, tls11, 2006, 1d
  TLS 1.2          :done, tls12, 2008, 1d
  TLS 1.3          :done, tls13, 2018, 1d
```

#### 1.14.2 TLS在OSI模型中的位置

```
应用层：HTTP
表示层：TLS/SSL（加密、握手、密钥交换、报警）
会话层：
传输层：TCP
网络层：IP
数据链路层：
物理层：
```

#### 1.14.3 安全密码套件组成

一个完整的密码套件示例：

```
ECDHE-RSA-AES128-GCM-SHA256
```

**组成部分：**

| 部分     | 示例       | 作用                                 |
| -------- | ---------- | ------------------------------------ |
| 密钥交换 | ECDHE      | 椭圆曲线Diffie-Hellman，生成对称密钥 |
| 身份验证 | RSA        | 非对称加密算法，验证身份             |
| 对称加密 | AES128-GCM | AES算法，128位密钥，GCM分组模式      |
| 摘要算法 | SHA256     | 生成固定长度的消息摘要               |

### 1.15 对称加密与非对称加密

#### 1.15.1 对称加密

**特点：**

- 加密和解密使用同一把密钥
- 性能好，速度快
- 密钥分发困难

**原理（异或操作）：**

```
密钥：1010
明文：0110
--------- XOR
密文：1100

密文：1100
密钥：1010
--------- XOR
明文：0110
```

**常见算法：**

- RC4（序列算法）
- AES（分组算法）
- DES/3DES

#### 1.15.2 非对称加密

**特点：**

- 生成一对密钥：公钥和私钥
- 公钥加密，私钥解密（加密通信）
- 私钥加密，公钥解密（身份验证/数字签名）
- 性能较差，速度慢

**应用场景：**

1. **加密通信**

```mermaid
graph LR
    A[Bob] -->|1. 获取Alice公钥| B[Alice公钥]
    A -->|2. 用公钥加密| C[密文]
    C -->|3. 发送| D[Alice]
    D -->|4. 用私钥解密| E[明文]
  
    style A fill:#e1f5ff
    style D fill:#ffe1e1
```

2. **身份验证**

```mermaid
graph LR
    A[Alice] -->|1. 用私钥加密| B[密文]
    B -->|2. 发送| C[Bob]
    C -->|3. 用Alice公钥解密| D[成功=身份确认]
  
    style A fill:#e1f5ff
    style D fill:#e1ffe1
```

**常见算法：**

- RSA
- DSA
- ECDSA（椭圆曲线）

### 1.16 SSL证书与公信力

#### 1.16.1 证书颁发流程

```mermaid
graph TD
    A[证书订阅人] -->|1. 申请证书| B[登记机构RA]
    B -->|2. CSR请求| C[CA中心]
    C -->|3. 生成公钥/私钥| D[证书]
    D -->|4. 颁发证书| A
    A -->|5. 部署到Web服务器| E[Nginx]
    F[浏览器] -->|6. 请求证书| E
    E -->|7. 发送公钥证书| F
    F -->|8. 验证证书| G[OCSP/CRL]
    G -->|9. 返回验证结果| F
  
    style A fill:#e1f5ff
    style C fill:#ffe1e1
    style E fill:#e1ffe1
    style F fill:#fff5e1
```

#### 1.16.2 证书类型

| 类型           | 验证内容           | 申请时间 | 价格      | 浏览器显示           |
| -------------- | ------------------ | -------- | --------- | -------------------- |
| DV（域名验证） | 域名归属           | 实时     | 免费/低价 | 普通锁               |
| OV（组织验证） | 域名+组织信息      | 几天     | 中等      | 普通锁               |
| EV（扩展验证） | 域名+组织+严格审查 | 较长     | 较高      | 绿色地址栏显示组织名 |

#### 1.16.3 证书链结构

```mermaid
graph TD
    A[根证书Root CA] -->|签发| B[中间证书Intermediate CA]
    B -->|签发| C[网站证书End-entity Certificate]
  
    D[操作系统/浏览器] -.->|内置| A
    E[Nginx] -->|发送| C
    E -->|发送| B
  
    style A fill:#ffe1e1
    style B fill:#fff5e1
    style C fill:#e1ffe1
```

**证书链说明：**

- **根证书**：由操作系统或浏览器内置，更新频率低（年级别）
- **中间证书**：由根证书签发，Nginx需要发送给浏览器
- **网站证书**：网站的主证书，Nginx需要发送给浏览器

**验证过程：**

1. Nginx发送网站证书和中间证书
2. 浏览器验证中间证书是否由可信根证书签发
3. 浏览器验证网站证书是否由中间证书签发
4. 检查证书是否过期（通过OCSP或CRL）

#### 1.16.4 证书吊销机制

- **CRL（证书吊销列表）**：性能差，包含所有过期证书
- **OCSP（在线证书状态协议）**：实时查询单个证书状态
- **OCSP Stapling**：Nginx主动查询并缓存OCSP响应，提升性能

### 1.17 TLS握手流程与性能优化

#### 1.17.1 TLS握手流程

```mermaid
sequenceDiagram
    participant C as 客户端浏览器
    participant S as Nginx服务器
  
    C->>S: 1. Client Hello (支持的加密套件)
    S->>C: 2. Server Hello (选择的加密套件)
    S->>C: 3. Certificate (公钥证书链)
    S->>C: 4. Server Key Exchange (椭圆曲线参数)
    S->>C: 5. Server Hello Done
    C->>S: 6. Client Key Exchange (客户端公钥)
    Note over C: 生成对称密钥
    Note over S: 生成对称密钥
    C->>S: 7. Change Cipher Spec
    C->>S: 8. Finished
    S->>C: 9. Change Cipher Spec
    S->>C: 10. Finished
    C->>S: 11. Application Data (加密通信)
    S->>C: 12. Application Data (加密通信)
```

**握手目的：**

1. 验证对方身份
2. 协商安全套件
3. 交换并生成密钥
4. 加密数据通信

#### 1.17.2 性能影响因素

**小文件场景（主要影响：握手性能）**

- 非对称加密算法性能：RSA、ECDHE
- 优化方向：调整密钥强度、使用椭圆曲线算法

**大文件场景（主要影响：加密性能）**

- 对称加密算法性能：AES
- 优化方向：选择高效的对称加密算法

#### 1.17.3 算法性能对比

| 算法类型   | 算法     | 相对性能 | 适用场景   |
| ---------- | -------- | -------- | ---------- |
| 非对称加密 | RSA-2048 | 中       | 小文件     |
| 非对称加密 | ECDHE    | 高       | 小文件     |
| 对称加密   | AES-128  | 高       | 大文件     |
| 对称加密   | AES-256  | 中       | 高安全需求 |

### 1.18 使用Let's Encrypt配置HTTPS

#### 1.18.1 Let's Encrypt简介

- 免费的DV证书
- 自动化申请和续期
- 有效期3个月
- 支持通配符证书

#### 1.18.2 使用Certbot申请证书

**安装Certbot：**

```bash
# CentOS/RHEL
yum install python2-certbot-nginx

# Ubuntu/Debian
apt-get install python-certbot-nginx
```

**申请证书：**

```bash
certbot --nginx \
    --nginx-server-root /path/to/nginx/conf \
    -d example.com \
    -d www.example.com
```

**参数说明：**

- `--nginx`：自动配置Nginx
- `--nginx-server-root`：指定Nginx配置文件路径
- `-d`：指定域名

#### 1.18.3 Certbot自动配置

Certbot会自动在nginx.conf中添加：

```nginx
server {
    listen 80;
    server_name example.com;
  
    # Certbot自动添加以下配置
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

#### 1.18.4 SSL配置详解

查看 `/etc/letsencrypt/options-ssl-nginx.conf`：

```nginx
# Session缓存配置
ssl_session_cache shared:le_nginx_SSL:10m;  # 10MB约可缓存4万个连接
ssl_session_timeout 1440m;                  # 会话超时时间1天

# 支持的TLS协议版本
ssl_protocols TLSv1.2 TLSv1.3;

# 优先使用服务器端密码套件
ssl_prefer_server_ciphers on;

# 密码套件列表（按优先级排序）
ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:...";

# DH参数文件（用于密钥交换）
ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
```

**优化建议：**

1. 启用Session缓存减少握手次数
2. 使用ECDHE密钥交换算法
3. 优先使用AES-GCM对称加密
4. 启用OCSP Stapling

#### 1.18.5 配置OCSP Stapling

```nginx
server {
    listen 443 ssl;
  
    # OCSP Stapling配置
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;
}
```

#### 1.18.6 自动续期

Let's Encrypt证书有效期为90天，需要定期续期：

```bash
# 测试续期
certbot renew --dry-run

# 添加到crontab自动续期
0 0,12 * * * certbot renew --quiet
```

### 1.19 使用OpenResty开发Lua服务

#### 1.19.1 OpenResty简介

- 基于Nginx和LuaJIT的Web平台
- 将Nginx事件驱动模型以同步方式提供给开发者
- 兼具高性能和高开发效率
- 适合开发API服务和WAF

#### 1.19.2 下载和编译OpenResty

```bash
# 1. 下载
wget https://openresty.org/download/openresty-1.13.6.2.tar.gz
tar -xzf openresty-1.13.6.2.tar.gz
cd openresty-1.13.6.2

# 2. 查看目录结构
ls
# bundle/  configure  COPYRIGHT  README.markdown  util/

# 3. bundle目录包含
ls bundle/
# nginx-1.13.6/          # Nginx源码
# ngx_lua-0.10.13/       # Lua模块（C）
# lua-resty-core/        # Lua库
# lua-resty-redis/       # Redis客户端
# ...

# 4. 编译安装
./configure --prefix=/usr/local/openresty
make
make install
```

#### 1.19.3 OpenResty目录结构

```
/usr/local/openresty/
├── nginx/              # Nginx相关
│   ├── sbin/nginx     # 可执行文件
│   ├── conf/          # 配置文件
│   └── logs/          # 日志文件
├── luajit/            # LuaJIT
├── lualib/            # Lua库
└── site/              # 第三方Lua模块
```

#### 1.19.4 Lua代码示例

```nginx
server {
    listen 80;
    server_name example.com;
  
    location /lua {
        default_type text/html;
  
        content_by_lua_block {
            -- 获取请求头
            local headers = ngx.req.get_headers()
            local user_agent = headers["User-Agent"]
    
            -- 输出响应
            ngx.say("<h1>Hello OpenResty!</h1>")
            ngx.say("<p>Your User-Agent: ", user_agent, "</p>")
        }
    }
}
```

#### 1.19.5 OpenResty常用指令

| 指令                       | 阶段          | 说明                 |
| -------------------------- | ------------- | -------------------- |
| init_by_lua_block          | 初始化        | Master进程启动时执行 |
| init_worker_by_lua_block   | 初始化        | Worker进程启动时执行 |
| set_by_lua_block           | Rewrite       | 设置变量             |
| rewrite_by_lua_block       | Rewrite       | URL重写              |
| access_by_lua_block        | Access        | 访问控制             |
| content_by_lua_block       | Content       | 生成响应内容         |
| header_filter_by_lua_block | Header Filter | 修改响应头           |
| body_filter_by_lua_block   | Body Filter   | 修改响应体           |
| log_by_lua_block           | Log           | 日志记录             |

#### 1.19.6 OpenResty API示例

**访问Redis：**

```nginx
location /redis {
    content_by_lua_block {
        local redis = require "resty.redis"
        local red = redis:new()
  
        red:set_timeout(1000)
        local ok, err = red:connect("127.0.0.1", 6379)
        if not ok then
            ngx.say("failed to connect: ", err)
            return
        end
  
        local res, err = red:get("key")
        if not res then
            ngx.say("failed to get key: ", err)
            return
        end
  
        ngx.say("key: ", res)
    }
}
```

**访问MySQL：**

```nginx
location /mysql {
    content_by_lua_block {
        local mysql = require "resty.mysql"
        local db = mysql:new()
  
        local ok, err = db:connect{
            host = "127.0.0.1",
            port = 3306,
            database = "test",
            user = "root",
            password = "password"
        }
  
        if not ok then
            ngx.say("failed to connect: ", err)
            return
        end
  
        local res, err = db:query("SELECT * FROM users LIMIT 10")
        if not res then
            ngx.say("failed to query: ", err)
            return
        end
  
        ngx.say(require("cjson").encode(res))
    }
}
```

#### 1.19.7 OpenResty应用场景

1. **API网关**

   - 请求路由
   - 参数验证
   - 协议转换
2. **Web应用防火墙（WAF）**

   - SQL注入防护
   - XSS防护
   - CC攻击防护
3. **动态负载均衡**

   - 基于业务逻辑的路由
   - 灰度发布
   - A/B测试
4. **缓存服务**

   - 热点数据缓存
   - 接口聚合
   - 降级处理

---

## 第一部分总结

通过第一部分的学习，我们了解了：

1. **Nginx的核心优势**

   - 高并发、高性能
   - 可扩展性强
   - 高可靠性
   - 支持热部署
   - BSD开源许可
2. **Nginx的主要应用场景**

   - 静态资源服务器
   - 反向代理和负载均衡
   - API服务
3. **Nginx的基本操作**

   - 编译安装
   - 配置文件语法
   - 命令行操作
   - 日志管理
4. **实战技能**

   - 搭建静态Web服务器
   - 配置反向代理和缓存
   - 实时日志分析
   - HTTPS站点配置
   - OpenResty Lua开发

### 1.13 实战示例配置

#### 1.13.1 配置示例: store.conf (proxy_store缓存)

**用途:** 演示proxy_store指令,将上游响应存储为本地文件

**完整配置:**

```nginx
upstream proxyups {
    server 127.0.0.1:8012 weight=1;
}

server {
    server_name store.taohui.tech;
    error_log logs/myerror.log debug;
    # root: 文件存储的根目录
    root /tmp;
  
    location / {
        proxy_pass http://proxyups;
    
        # proxy_store: 开启文件存储
        # on: 将上游响应存储为本地文件
        # 文件路径 = root + URI
        proxy_store on;
    
        # proxy_store_access: 设置文件权限
        # user:rw - 用户可读写
        # group:rw - 组可读写
        # all:r - 其他用户只读
        proxy_store_access user:rw group:rw all:r;
    }
  
    listen 80;
}
```

**proxy_store工作原理:**

1. 首次请求: 从上游获取,存储到本地
2. 后续请求: 直接返回本地文件(如果存在)
3. 适合静态资源的本地缓存

**关键点:** proxy_store将代理响应存储为文件,适合CDN节点缓存。

#### 1.13.2 配置示例: v2ex.conf (proxy_pass带URI测试)

**用途:** 演示proxy_pass带URI和不带URI的区别

**完整配置:**

```nginx
# 前端服务器: 接收客户端请求
server {
    server_name v2ex.taohui.tech;
  
    # 测试1: proxy_pass带URI
    # 客户端请求: /withurl/test
    # 转发到上游: /remote/test (替换/withurl为/remote)
    location /withurl {
        proxy_pass http://v2exup.taohui.tech/remote;
    }
  
    # 测试2: proxy_pass不带URI
    # 客户端请求: /withouturl/test
    # 转发到上游: /withouturl/test (保持原URI)
    location /withouturl {
        proxy_pass http://v2exup.taohui.tech;
    }
}

# 后端服务器: 显示接收到的URI
server {
    server_name v2exup.taohui.tech;
  
    location / {
        return 200 '
request_uri: $request_uri
';
    }
}
```

**测试结果:**

```bash
# 测试1: 带URI
curl http://v2ex.taohui.tech/withurl/test
# 输出: request_uri: /remote/test

# 测试2: 不带URI
curl http://v2ex.taohui.tech/withouturl/test
# 输出: request_uri: /withouturl/test
```

**proxy_pass URI规则:**

- **带URI**: 替换location路径
- **不带URI**: 保持原始URI
- 正则location只能使用不带URI的形式

**关键点:** proxy_pass带URI会替换location部分,不带URI则保持原URI。

---

接下来，我们将深入学习Nginx的架构基础，理解其高性能的实现原理。

---

## 第二部分：Nginx基础架构

### 2.1 Nginx请求处理流程

#### 2.1.1 为什么要了解架构基础

Nginx运行在企业内网的边缘节点，处理的流量是其他应用服务器的数倍甚至几个数量级。在不同数量级下，问题的解决方案完全不同。理解Nginx架构能帮助我们：

- 理解Master-Worker架构模型的优势
- 明白Worker进程数量为什么要与CPU核数匹配
- 了解多个Worker进程间如何共享数据
- 掌握TLS、限流限速等场景的实现方式

#### 2.1.2 请求处理流程图

```mermaid
graph TD
    A[Web/Email/TCP请求] --> B{流量类型}
    B -->|HTTP| C[HTTP状态机]
    B -->|TCP/UDP| D[Stream四层状态机]
    B -->|Email| E[Mail状态机]
  
    C --> F[事件驱动处理引擎Epoll]
    D --> F
    E --> F
  
    F -->|静态资源| G[磁盘文件系统]
    F -->|反向代理缓存| G
    F -->|阻塞磁盘IO| H[线程池]
    H --> G
  
    F --> I[Access日志]
    F --> J[Error日志]
    I --> G
    J --> G
  
    F -->|反向代理| K[上游服务器]
    K -->|HTTP| L[Tomcat/Django等]
    K -->|FastCGI| M[PHP-FPM]
    K -->|uWSGI| N[Python应用]
    K -->|SCGI| O[其他应用]
  
    style F fill:#e1f5ff
    style G fill:#ffe1e1
    style K fill:#e1ffe1
```

**流程说明：**

1. **状态机处理**：三大状态机处理不同协议的流量

   - HTTP状态机：处理Web请求
   - Stream状态机：处理TCP/UDP四层流量
   - Mail状态机：处理邮件协议
2. **事件驱动引擎**：使用非阻塞的Epoll机制

   - 异步处理所有网络事件
   - 需要状态机正确识别和处理请求
3. **静态资源处理**：

   - 直接访问磁盘文件
   - 当内存不足时，sendfile/AIO会退化为阻塞调用
   - 使用线程池处理阻塞的磁盘IO
4. **反向代理**：

   - 支持多种上游协议（HTTP、FastCGI、uWSGI、SCGI等）
   - 可以缓存上游响应到磁盘
5. **日志记录**：

   - Access日志：记录每个请求的详细信息
   - Error日志：记录错误和异常
   - 可通过Syslog协议记录到远程机器

### 2.2 Nginx进程结构

#### 2.2.1 单进程 vs 多进程

| 特性     | 单进程结构 | 多进程结构 |
| -------- | ---------- | ---------- |
| 适用场景 | 开发调试   | 生产环境   |
| 健壮性   | 低         | 高         |
| 多核利用 | 否         | 是         |
| 默认配置 | 否         | 是         |

#### 2.2.2 多进程架构

```mermaid
graph TD
    A[Master Process父进程] --> B[Worker Process 1]
    A --> C[Worker Process 2]
    A --> D[Worker Process N]
    A --> E[Cache Manager]
    A --> F[Cache Loader]
  
    B -.共享内存.-> G[Shared Memory]
    C -.共享内存.-> G
    D -.共享内存.-> G
    E -.共享内存.-> G
    F -.共享内存.-> G
  
    style A fill:#ffe1e1
    style B fill:#e1f5ff
    style C fill:#e1f5ff
    style D fill:#e1f5ff
    style E fill:#fff5e1
    style F fill:#fff5e1
    style G fill:#e1ffe1
```

**进程角色：**

1. **Master进程（父进程）**

   - 不处理网络请求
   - 负责管理Worker进程
   - 监控Worker进程健康状态
   - 处理配置重载和热部署
   - 第三方模块通常不在此添加代码
2. **Worker进程（工作进程）**

   - 处理实际的网络请求
   - 数量通常等于CPU核数
   - 每个Worker绑定到特定CPU核
   - 利用CPU缓存减少缓存失效
3. **Cache Manager进程**

   - 管理反向代理缓存
   - 定期清理过期缓存
4. **Cache Loader进程**

   - 启动时加载缓存索引
   - 加载完成后退出

#### 2.2.3 为什么选择多进程而非多线程

**多进程的优势：**

- **高可用性**：一个Worker进程崩溃不影响其他进程
- **地址空间隔离**：第三方模块的内存错误不会导致整个Nginx崩溃
- **稳定性更好**：符合Nginx高可靠性的设计目标

**Worker进程数量配置：**

```nginx
# 自动设置为CPU核数
worker_processes auto;

# 手动指定
worker_processes 4;

# 绑定Worker到特定CPU核
worker_cpu_affinity 0001 0010 0100 1000;
```

### 2.3 进程管理与信号

#### 2.3.1 信号管理机制

```mermaid
graph TD
    A[nginx命令行] -->|发送信号| B[Master进程]
    C[kill命令] -->|发送信号| B
  
    B -->|监听SIGCHLD| D[Worker进程异常退出]
    D -->|自动重启| E[新Worker进程]
  
    B -->|TERM/INT| F[立即停止]
    B -->|QUIT| G[优雅停止]
    B -->|HUP| H[重载配置]
    B -->|USR1| I[重新打开日志]
    B -->|USR2| J[热升级]
    B -->|WINCH| K[优雅关闭Worker]
  
    style B fill:#ffe1e1
    style H fill:#e1f5ff
    style J fill:#e1ffe1
```

#### 2.3.2 Master进程接收的信号

| 信号     | 命令行等价          | 作用           | 说明                 |
| -------- | ------------------- | -------------- | -------------------- |
| TERM/INT | `nginx -s stop`   | 立即停止       | 强制终止所有进程     |
| QUIT     | `nginx -s quit`   | 优雅停止       | 处理完当前请求后停止 |
| HUP      | `nginx -s reload` | 重载配置       | 平滑重启Worker进程   |
| USR1     | `nginx -s reopen` | 重新打开日志   | 用于日志切割         |
| USR2     | 无                  | 热升级         | 启动新Master进程     |
| WINCH    | 无                  | 优雅关闭Worker | 用于热升级流程       |

#### 2.3.3 Worker进程接收的信号

| 信号     | 作用         | 说明           |
| -------- | ------------ | -------------- |
| TERM/INT | 立即停止     | 不推荐直接发送 |
| QUIT     | 优雅停止     | 不推荐直接发送 |
| USR1     | 重新打开日志 | 不推荐直接发送 |
| WINCH    | 优雅关闭     | 不推荐直接发送 |

**注意：** 通常不直接向Worker进程发送信号，而是由Master进程统一管理。

#### 2.3.4 nginx命令行与信号的对应关系

```bash
# 以下命令等价于向Master进程发送相应信号

# nginx -s reload  ≈  kill -HUP <master_pid>
# nginx -s reopen  ≈  kill -USR1 <master_pid>
# nginx -s stop    ≈  kill -TERM <master_pid>
# nginx -s quit    ≈  kill -QUIT <master_pid>

# Master PID通常记录在
cat /usr/local/nginx/logs/nginx.pid
```

### 2.4 Reload重载配置文件

#### 2.4.1 Reload流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant M as Master进程
    participant OW as 老Worker进程
    participant NW as 新Worker进程
  
    U->>M: 1. 发送HUP信号(nginx -s reload)
    M->>M: 2. 检验配置文件语法
    M->>M: 3. 打开新的监听端口
    M->>NW: 4. 启动新Worker进程
    M->>OW: 5. 发送QUIT信号
    OW->>OW: 6. 关闭监听句柄
    OW->>OW: 7. 处理完当前连接
    OW->>M: 8. 退出进程
  
    Note over OW,NW: 新老Worker短暂并存
```

**详细步骤：**

1. **发送HUP信号**

   - 执行 `nginx -s reload`
   - 或 `kill -HUP <master_pid>`
2. **Master进程验证配置**

   - 检查nginx.conf语法
   - 验证失败则不继续
3. **打开新监听端口**

   - Master进程打开配置中的新端口
   - 子进程会继承父进程的所有打开端口
4. **启动新Worker进程**

   - 使用新配置启动Worker
   - 新Worker立即开始处理请求
5. **向老Worker发送QUIT信号**

   - 老Worker关闭监听句柄
   - 新连接只会进入新Worker
6. **老Worker优雅退出**

   - 处理完已建立连接上的请求
   - 关闭连接后退出进程

#### 2.4.2 优雅退出的超时控制

```nginx
# 设置Worker进程优雅退出的最长等待时间
worker_shutdown_timeout 30s;
```

**作用：**

- 防止老Worker进程长时间不退出
- 超时后强制关闭进程
- 默认无限等待

#### 2.4.3 Reload过程中的进程状态

```
初始状态：
Master (PID: 1000)
├── Worker 1 (PID: 1001)
├── Worker 2 (PID: 1002)
├── Worker 3 (PID: 1003)
└── Worker 4 (PID: 1004)

Reload后（短暂并存）：
Master (PID: 1000)
├── Worker 1 (PID: 1001) [老，正在退出]
├── Worker 2 (PID: 1002) [老，正在退出]
├── Worker 3 (PID: 1003) [老，正在退出]
├── Worker 4 (PID: 1004) [老，正在退出]
├── Worker 5 (PID: 1005) [新，处理新请求]
├── Worker 6 (PID: 1006) [新，处理新请求]
├── Worker 7 (PID: 1007) [新，处理新请求]
└── Worker 8 (PID: 1008) [新，处理新请求]

最终状态：
Master (PID: 1000)
├── Worker 5 (PID: 1005)
├── Worker 6 (PID: 1006)
├── Worker 7 (PID: 1007)
└── Worker 8 (PID: 1008)
```

### 2.5 热升级完整流程

#### 2.5.1 热升级流程图

```mermaid
sequenceDiagram
    participant U as 运维人员
    participant OM as 老Master
    participant OW as 老Worker
    participant NM as 新Master
    participant NW as 新Worker
  
    U->>U: 1. 备份旧nginx二进制
    U->>U: 2. 拷贝新nginx二进制
    U->>OM: 3. 发送USR2信号
    OM->>OM: 4. 重命名PID文件(.oldbin)
    OM->>NM: 5. 启动新Master进程
    NM->>NW: 6. 启动新Worker进程
    Note over OM,NW: 新老进程并存
    U->>OM: 7. 发送WINCH信号
    OM->>OW: 8. 优雅关闭老Worker
    OW->>OW: 9. 处理完请求后退出
    Note over OM: 老Master保留用于回退
  
    alt 确认无问题
        U->>OM: 10a. 发送QUIT信号
        OM->>OM: 11a. 退出
    else 需要回退
        U->>OM: 10b. 发送HUP信号
        OM->>OW: 11b. 重新启动老Worker
        U->>NM: 12b. 发送QUIT信号
        NM->>NM: 13b. 退出
    end
```

#### 2.5.2 热升级操作步骤

```bash
# 1. 备份旧版本
cp /usr/local/nginx/sbin/nginx /usr/local/nginx/sbin/nginx.old

# 2. 拷贝新版本（需要-f强制覆盖正在运行的文件）
cp -f /path/to/new/nginx /usr/local/nginx/sbin/nginx

# 3. 向老Master发送USR2信号
kill -USR2 $(cat /usr/local/nginx/logs/nginx.pid)

# 4. 查看进程状态（此时新老Master和Worker都在运行）
ps aux | grep nginx

# 5. 向老Master发送WINCH信号，优雅关闭老Worker
kill -WINCH <老Master的PID>

# 6. 测试新版本是否正常

# 7a. 确认无问题，关闭老Master
kill -QUIT <老Master的PID>

# 7b. 如需回退，重新拉起老Worker
kill -HUP <老Master的PID>
# 然后关闭新Master
kill -QUIT <新Master的PID>
```

#### 2.5.3 热升级过程中的PID文件变化

```
初始状态：
nginx.pid         -> 老Master PID

发送USR2后：
nginx.pid.oldbin  -> 老Master PID
nginx.pid         -> 新Master PID

完成后：
nginx.pid         -> 新Master PID
```

#### 2.5.4 热升级的关键点

1. **新Master是老Master的子进程**

   - 通过fork创建
   - 使用新的二进制文件启动
2. **新老进程短暂并存**

   - 保证服务不中断
   - 支持版本回退
3. **老Master不自动退出**

   - 保留用于回退
   - 需要手动发送QUIT信号
4. **只替换二进制文件**

   - 配置文件路径必须一致
   - 日志路径必须一致
   - 否则无法复用配置

### 2.6 Worker进程优雅关闭

#### 2.6.1 优雅关闭流程

```mermaid
graph TD
    A[收到QUIT信号] --> B[设置worker_shutdown_timeout定时器]
    B --> C[设置优雅关闭标志位]
    C --> D[关闭监听句柄]
    D --> E[关闭所有空闲连接]
    E --> F{循环检查}
    F -->|有活跃连接| G[等待请求处理完成]
    G --> H[关闭该连接]
    H --> F
    F -->|无活跃连接| I[Worker进程退出]
    F -->|超时| J[强制关闭所有连接]
    J --> I
  
    style A fill:#ffe1e1
    style D fill:#e1f5ff
    style I fill:#e1ffe1
```

#### 2.6.2 优雅关闭的条件

**可以优雅关闭的场景：**

- HTTP请求：Nginx能识别请求边界
- 短连接：请求处理完立即关闭

**无法优雅关闭的场景：**

- WebSocket：Nginx不解析Frame帧
- TCP/UDP代理：无法识别请求边界
- 长时间未响应的连接

#### 2.6.3 配置优雅关闭超时

```nginx
# 设置Worker进程优雅关闭的超时时间
worker_shutdown_timeout 30s;
```

**作用：**

- 防止Worker进程长时间不退出
- 超时后强制关闭所有连接
- 平衡服务可用性和进程管理

#### 2.6.4 立即停止 vs 优雅停止

| 特性       | 立即停止(TERM/INT) | 优雅停止(QUIT)    |
| ---------- | ------------------ | ----------------- |
| 命令       | `nginx -s stop`  | `nginx -s quit` |
| 信号       | TERM/INT           | QUIT              |
| 处理方式   | 立即关闭所有连接   | 等待请求处理完成  |
| 客户端影响 | 收到TCP Reset      | 正常关闭连接      |
| 适用场景   | 紧急情况           | 正常维护          |

### 2.7 网络事件与Nginx

#### 2.7.1 网络事件的本质

每个TCP连接对应两个网络事件：

- **读事件**：接收数据
- **写事件**：发送数据

#### 2.7.2 网络报文与事件的对应关系

```mermaid
graph LR
    A[客户端] -->|1. SYN| B[服务器]
    B -->|2. SYN+ACK| A
    A -->|3. ACK| B
    B -.->|触发读事件| C[accept建立连接]
  
    A -->|4. HTTP请求| B
    B -.->|触发读事件| D[read读取请求]
  
    B -->|5. HTTP响应| A
    B -.->|触发写事件| E[write发送响应]
  
    A -->|6. FIN| B
    B -.->|触发读事件| F[close关闭连接]
  
    style C fill:#e1f5ff
    style D fill:#e1ffe1
    style E fill:#fff5e1
    style F fill:#ffe1e1
```

#### 2.7.3 TCP报文结构

```
+------------------+
| 数据链路层头部    | <- MAC地址
+------------------+
| 网络层头部(IP)    | <- IP地址
+------------------+
| 传输层头部(TCP)   | <- 端口号
+------------------+
| 应用层数据(HTTP)  | <- HTTP协议
+------------------+
| 数据链路层尾部    |
+------------------+
```

**各层作用：**

- **数据链路层**：MAC地址，局域网内通信
- **网络层**：IP地址，跨网络通信
- **传输层**：端口号，进程间通信
- **应用层**：HTTP等协议，应用数据

#### 2.7.4 网络事件类型

| 事件类型 | 触发条件         | Nginx操作 | 说明           |
| -------- | ---------------- | --------- | -------------- |
| 建立连接 | 收到SYN+ACK的ACK | accept()  | 三次握手完成   |
| 可读     | 收到数据报文     | read()    | 读取HTTP请求   |
| 可写     | 发送缓冲区可用   | write()   | 发送HTTP响应   |
| 对端关闭 | 收到FIN          | close()   | 客户端主动断开 |

#### 2.7.5 事件收集分发器

```mermaid
graph TD
    A[网络事件生产者] --> B[事件收集器]
    B --> C{事件类型}
    C -->|连接建立| D[Accept消费者]
    C -->|可读| E[Read消费者]
    C -->|可写| F[Write消费者]
    C -->|定时器| G[Timer消费者]
    C -->|AIO| H[AIO消费者]
  
    D --> I[HTTP模块处理]
    E --> I
    F --> I
  
    style B fill:#e1f5ff
    style I fill:#e1ffe1
```

**事件驱动模型的优势：**

- 生产者：网络自动产生事件
- 消费者：模块定义处理逻辑
- 解耦：事件产生和处理分离

### 2.8 Nginx事件驱动模型

#### 2.8.1 事件循环流程

```mermaid
graph TD
    A[等待事件epoll_wait] -->|阻塞等待| B[操作系统通知事件就绪]
    B --> C[从事件队列获取事件]
    C --> D{队列是否为空}
    D -->|否| E[处理事件]
    E --> F{处理过程中}
    F -->|生成新事件| G[添加到事件队列]
    F -->|处理完成| D
    D -->|是| A
  
    style A fill:#e1f5ff
    style E fill:#ffe1e1
    style G fill:#fff5e1
```

#### 2.8.2 事件处理详解

**等待事件（epoll_wait）：**

- Worker进程进入Sleep状态
- 不消耗CPU资源
- 等待操作系统通知

**获取事件：**

- 操作系统准备好事件队列
- Worker进程被唤醒
- 从队列中取出事件

**处理事件：**

- 执行事件对应的回调函数
- 可能生成新的事件（如超时定时器、写事件等）
- 新事件加入队列等待下次处理

#### 2.8.3 事件处理的性能影响

**注意事项：**

1. **避免长时间CPU计算**

   - 会阻塞事件队列中的其他事件
   - 导致大量连接超时
   - 引发恶性循环
2. **第三方模块的影响**

   - 不能长时间占用CPU
   - 应分段处理计算任务
   - 如Gzip模块分段压缩
3. **事件队列积压**

   - 一个事件处理时间过长
   - 后续事件得不到及时处理
   - 可能导致连接超时

### 2.9 Epoll的优势与原理

#### 2.9.1 事件模型性能对比

```mermaid
graph LR
    A[并发连接数增加] --> B{事件模型}
    B -->|Select/Poll| C[性能急剧下降]
    B -->|Epoll/Kqueue| D[性能基本不变]
  
    style C fill:#ffe1e1
    style D fill:#e1ffe1
```

**性能对比：**

- **Select/Poll**：O(n)复杂度，每次需要遍历所有连接
- **Epoll/Kqueue**：O(1)复杂度，只返回活跃连接

#### 2.9.2 Select/Poll的问题

```
假设有100万个并发连接，但只有100个活跃连接

Select/Poll方式：
1. 每次调用都要把100万个连接传给操作系统
2. 操作系统遍历100万个连接
3. 找出100个活跃连接返回
4. 效率极低，O(n)复杂度
```

#### 2.9.3 Epoll的实现原理

```mermaid
graph TD
    A[Nginx] --> B[Epoll]
    B --> C[红黑树RBTree]
    B --> D[就绪链表Ready List]
  
    C -->|添加/删除/修改| E[事件管理O log n]
    D -->|遍历| F[获取活跃事件O 1]
  
    G[网卡收到数据] -->|触发| D
  
    style B fill:#e1f5ff
    style C fill:#ffe1e1
    style D fill:#e1ffe1
```

**Epoll数据结构：**

1. **红黑树（管理所有事件）**

   - 存储所有监听的文件描述符
   - 插入/删除/修改：O(log n)
   - 高效的事件管理
2. **就绪链表（只包含活跃事件）**

   - 只包含有事件发生的连接
   - 遍历：O(1)
   - 高效的事件获取

**Epoll操作：**

```c
// 创建epoll实例
int epfd = epoll_create(1024);

// 添加事件（插入红黑树）
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &event);

// 修改事件
epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &event);

// 删除事件（从红黑树删除）
epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);

// 等待事件（只遍历就绪链表）
int n = epoll_wait(epfd, events, maxevents, timeout);
```

#### 2.9.4 Epoll的优势总结

| 特性       | Select/Poll  | Epoll          |
| ---------- | ------------ | -------------- |
| 复杂度     | O(n)         | O(1)           |
| 最大连接数 | 受限         | 无限制         |
| 数据拷贝   | 每次都要拷贝 | 只拷贝活跃连接 |
| 适用场景   | 少量连接     | 大量并发连接   |

### 2.10 Nginx的请求切换

#### 2.10.1 传统服务器的请求切换

```mermaid
graph TD
    A[Process 1: Request 1] -->|网络不满足| B[进程切换5微秒]
    B --> C[Process 2: Request 2]
    C -->|网络不满足| D[进程切换5微秒]
    D --> E[Process 3: Request 3]
    E -->|时间片用完| F[进程切换5微秒]
    F --> A
  
    style B fill:#ffe1e1
    style D fill:#ffe1e1
    style F fill:#ffe1e1
```

**传统服务器（Apache/Tomcat）的问题：**

- 一个进程同时只处理一个请求
- 网络条件不满足时发生进程切换
- 进程切换成本：约5微秒
- 并发连接越多，切换越频繁
- 性能损耗呈指数增长

#### 2.10.2 Nginx的请求切换

```mermaid
graph TD
    A[Request 1处理] -->|网络不满足| B[用户态切换]
    B --> C[Request 2处理]
    C -->|网络不满足| D[用户态切换]
    D --> E[Request 3处理]
    E -->|继续处理| A
  
    style B fill:#e1ffe1
    style D fill:#e1ffe1
```

**Nginx的优势：**

- 在用户态直接切换请求
- 无进程切换开销
- 依赖Worker进程的时间片（5-800ms）
- 提高Worker进程优先级获得更大时间片

#### 2.10.3 优化Worker进程优先级

```nginx
# 设置Worker进程的优先级（-20到19，越小优先级越高）
worker_priority -19;
```

**作用：**

- 获得更大的CPU时间片
- 减少操作系统切换Worker进程的频率
- 在用户态完成更多请求切换

#### 2.10.4 请求切换性能对比

| 特性     | 传统服务器 | Nginx      |
| -------- | ---------- | ---------- |
| 切换方式 | 进程间切换 | 用户态切换 |
| 切换成本 | 5微秒      | 几乎为0    |
| 适用场景 | 数百连接   | 数百万连接 |
| 性能损耗 | 指数增长   | 线性增长   |

### 2.11 同步、异步、阻塞、非阻塞

#### 2.11.1 概念区分

**阻塞 vs 非阻塞（系统调用层面）：**

- **阻塞**：调用方法时，条件不满足会导致进程进入Sleep状态
- **非阻塞**：调用方法时，条件不满足立即返回错误码（EAGAIN）

**同步 vs 异步（编程方式层面）：**

- **同步**：代码按顺序执行，看起来是阻塞的
- **异步**：通过回调函数处理结果，代码不连续

#### 2.11.2 阻塞调用示例

```c
// 阻塞的accept调用
int client_fd = accept(server_fd, ...);
// 如果没有新连接，进程会进入Sleep状态
// 直到有新连接到来或超时
```

**特点：**

- Accept队列为空时阻塞
- 进程主动切换
- 可设置超时时间

#### 2.11.3 非阻塞调用示例

```c
// 非阻塞的accept调用
int client_fd = accept(server_fd, ...);
if (client_fd == -1 && errno == EAGAIN) {
    // Accept队列为空，立即返回EAGAIN
    // 需要代码决定下一步操作
}
```

**特点：**

- 立即返回，不阻塞
- 返回EAGAIN错误码
- 需要代码处理错误情况

#### 2.11.4 异步编程示例（Nginx C代码）

```c
// 异步读取请求Body
ngx_http_read_client_request_body(r, ngx_http_upstream_init);
// 立即返回，不等待Body读取完成
// Body读取完成后会回调ngx_http_upstream_init函数
```

**特点：**

- 代码不连续
- 通过回调函数处理结果
- 难以理解和维护

#### 2.11.5 同步编程示例（OpenResty Lua代码）

```lua
-- 同步方式连接Redis
local red = redis:new()
red:set_timeout(1000)
local ok, err = red:connect("127.0.0.1", 6379)
if not ok then
    ngx.say("failed to connect: ", err)
    return
end

-- 代码连续，易于理解
-- 但底层使用非阻塞方式实现
```

**特点：**

- 代码连续，易于理解
- 底层使用非阻塞实现
- 兼顾开发效率和运行效率

#### 2.11.6 四种组合方式

| 组合       | 示例        | 适用场景   | 说明     |
| ---------- | ----------- | ---------- | -------- |
| 同步阻塞   | 传统CGI     | 简单应用   | 性能差   |
| 同步非阻塞 | OpenResty   | 高并发应用 | 推荐     |
| 异步阻塞   | 无          | 无意义     | 不使用   |
| 异步非阻塞 | Nginx C模块 | 高性能需求 | 开发复杂 |

### 2.12 Nginx模块系统

#### 2.12.1 模块的四个关键点

理解一个Nginx模块需要了解：

1. **是否编译进Nginx**

   - 查看 `objs/ngx_modules.c`
   - 确认模块是否在数组中
2. **提供哪些配置项**

   - 查看官方文档
   - 查看源码中的 `ngx_command_t`结构
3. **何时被使用**

   - 默认使用 vs 需要配置
   - 查看模块的回调方法
4. **提供哪些变量**

   - 查看文档的"Embedded Variables"
   - 可用于日志、条件判断等

#### 2.12.2 模块结构

```c
// 模块定义结构体
typedef struct {
    ngx_str_t             name;        // 模块名称
    void                 *ctx;         // 模块上下文
    ngx_command_t        *commands;    // 配置指令数组
    ngx_uint_t            type;        // 模块类型
  
    // 回调方法
    ngx_int_t           (*init_master)(ngx_log_t *log);
    ngx_int_t           (*init_module)(ngx_cycle_t *cycle);
    ngx_int_t           (*init_process)(ngx_cycle_t *cycle);
    ngx_int_t           (*init_thread)(ngx_cycle_t *cycle);
    void                (*exit_thread)(ngx_cycle_t *cycle);
    void                (*exit_process)(ngx_cycle_t *cycle);
    void                (*exit_master)(ngx_cycle_t *cycle);
} ngx_module_t;
```

#### 2.12.3 配置指令定义

```c
// 配置指令数组
static ngx_command_t ngx_http_gzip_filter_commands[] = {
    {
        ngx_string("gzip"),           // 指令名
        NGX_HTTP_MAIN_CONF|NGX_HTTP_SRV_CONF|NGX_HTTP_LOC_CONF|NGX_CONF_FLAG,
        ngx_conf_set_flag_slot,       // 处理函数
        NGX_HTTP_LOC_CONF_OFFSET,
        offsetof(ngx_http_gzip_conf_t, enable),
        NULL
    },
    // ... 更多指令
    ngx_null_command
};
```

#### 2.12.4 查看模块是否编译

```bash
# 查看编译进Nginx的所有模块
cat objs/ngx_modules.c

# 输出示例
ngx_module_t *ngx_modules[] = {
    &ngx_core_module,
    &ngx_errlog_module,
    &ngx_conf_module,
    &ngx_events_module,
    &ngx_event_core_module,
    &ngx_epoll_module,
    &ngx_http_module,
    &ngx_http_core_module,
    &ngx_http_gzip_filter_module,
    // ... 更多模块
    NULL
};
```

#### 2.12.5 模块的生命周期回调

```mermaid
graph TD
    A[Master进程启动] --> B[init_master]
    B --> C[init_module]
    C --> D[Worker进程启动]
    D --> E[init_process]
    E --> F[Worker进程运行]
    F --> G[Worker进程退出]
    G --> H[exit_process]
    H --> I[Master进程退出]
    I --> J[exit_master]
  
    style B fill:#e1f5ff
    style E fill:#e1ffe1
    style H fill:#fff5e1
    style J fill:#ffe1e1
```

**回调时机：**

- `init_master`：Master进程启动时
- `init_module`：配置解析完成后
- `init_process`：Worker进程启动时
- `exit_process`：Worker进程退出时
- `exit_master`：Master进程退出时

### 2.13 Nginx模块分类

#### 2.13.1 模块类型层次

```mermaid
graph TD
    A[ngx_module_t] --> B[核心模块ngx_core_module]
    A --> C[配置模块ngx_conf_module]
  
    B --> D[Events模块]
    B --> E[HTTP模块]
    B --> F[Mail模块]
    B --> G[Stream模块]
  
    D --> D1[事件核心模块event_core]
    D --> D2[Epoll模块]
    D --> D3[Kqueue模块]
  
    E --> E1[HTTP核心模块http_core]
    E --> E2[请求处理模块]
    E --> E3[响应过滤模块filter]
    E --> E4[Upstream模块]
  
    style A fill:#e1f5ff
    style B fill:#ffe1e1
    style E fill:#e1ffe1
```

#### 2.13.2 核心模块类型

| 模块类型          | 说明         | 示例                                              |
| ----------------- | ------------ | ------------------------------------------------- |
| NGX_CORE_MODULE   | 核心模块     | ngx_core_module, ngx_events_module                |
| NGX_CONF_MODULE   | 配置解析模块 | ngx_conf_module                                   |
| NGX_EVENT_MODULE  | 事件模块     | ngx_epoll_module, ngx_kqueue_module               |
| NGX_HTTP_MODULE   | HTTP模块     | ngx_http_core_module, ngx_http_gzip_filter_module |
| NGX_MAIL_MODULE   | 邮件模块     | ngx_mail_core_module                              |
| NGX_STREAM_MODULE | Stream模块   | ngx_stream_core_module                            |

#### 2.13.3 HTTP模块细分

**1. HTTP核心模块（http_core）**

- 定义HTTP模块的通用规则
- 处理HTTP请求的基本流程
- 必须存在的模块

**2. 请求处理模块**

- 生成HTTP响应
- 如：index、autoindex、static等

**3. 响应过滤模块（filter）**

- 对响应做二次处理
- 模块名包含"filter"关键字
- 如：gzip_filter、image_filter等

**4. Upstream模块**

- 与上游服务交互
- 模块名包含"upstream"关键字
- 如：upstream_hash、upstream_ip_hash等

#### 2.13.4 源码目录结构

```
nginx/src/
├── core/              # 核心框架代码
│   ├── ngx_core.h
│   └── ngx_module.c
├── event/             # 事件模块
│   ├── ngx_event.c
│   ├── modules/
│   │   ├── ngx_epoll_module.c
│   │   └── ngx_kqueue_module.c
├── http/              # HTTP模块
│   ├── ngx_http.c     # HTTP框架代码
│   ├── ngx_http_core_module.c  # HTTP核心模块
│   └── modules/       # HTTP子模块
│       ├── ngx_http_gzip_filter_module.c
│       ├── ngx_http_upstream_hash_module.c
│       └── ...
├── mail/              # 邮件模块
└── stream/            # Stream模块
```

#### 2.13.5 模块顺序的重要性

模块在 `ngx_modules`数组中的顺序很重要：

- **先出现的模块优先级更高**
- **可能阻碍后出现的模块**
- **Core模块总是排在第一位**

```c
// 模块顺序示例
ngx_module_t *ngx_modules[] = {
    &ngx_core_module,              // 1. 核心模块
    &ngx_events_module,            // 2. 事件模块
    &ngx_event_core_module,        // 3. 事件核心模块
    &ngx_epoll_module,             // 4. Epoll模块
    &ngx_http_module,              // 5. HTTP模块
    &ngx_http_core_module,         // 6. HTTP核心模块
    &ngx_http_gzip_filter_module,  // 7. Gzip过滤模块
    // ...
};
```

### 2.14 连接池

#### 2.14.1 连接池结构

```mermaid
graph TD
    A[ngx_cycle_t] --> B[connections数组]
    A --> C[read_events数组]
    A --> D[write_events数组]
  
    B --> E[connection 0]
    B --> F[connection 1]
    B --> G[connection N]
  
    C --> H[read_event 0]
    C --> I[read_event 1]
    C --> J[read_event N]
  
    D --> K[write_event 0]
    D --> L[write_event 1]
    D --> M[write_event N]
  
    E -.对应.-> H
    E -.对应.-> K
  
    style A fill:#e1f5ff
    style B fill:#ffe1e1
    style C fill:#e1ffe1
    style D fill:#fff5e1
```

#### 2.14.2 配置连接数

```nginx
events {
    # 每个Worker进程的最大连接数
    worker_connections 1024;  # 默认512，生产环境通常设置更大
}
```

**注意事项：**

1. **反向代理消耗双倍连接**

   - 客户端连接：1个
   - 上游服务器连接：1个
   - 总计：2个连接
2. **内存消耗计算**

   ```
   每个连接内存 = sizeof(ngx_connection_t) + 2 * sizeof(ngx_event_t)
                = 232字节 + 2 * 96字节
                = 424字节

   总内存 = worker_connections * 424字节
   ```
3. **推荐配置**

   ```nginx
   # 根据服务器内存和CPU核数调整
   worker_processes auto;
   events {
       worker_connections 10240;  # 或更大
   }
   ```

#### 2.14.3 连接结构体

```c
// ngx_connection_t结构体（简化版）
typedef struct ngx_connection_s {
    void               *data;           // 连接数据
    ngx_event_t        *read;           // 读事件
    ngx_event_t        *write;          // 写事件
  
    ngx_socket_t        fd;             // 套接字描述符
  
    ngx_recv_pt         recv;           // 接收方法
    ngx_send_pt         send;           // 发送方法
  
    off_t               sent;           // 已发送字节数
  
    ngx_pool_t         *pool;           // 连接内存池
  
    // ... 更多成员
} ngx_connection_t;  // 64位系统约232字节
```

#### 2.14.4 事件结构体

```c
// ngx_event_t结构体（简化版）
typedef struct ngx_event_s {
    void               *data;           // 事件数据
  
    ngx_event_handler_pt  handler;      // 事件处理回调
  
    ngx_rbtree_node_t   timer;          // 定时器节点
  
    unsigned            active:1;       // 是否活跃
    unsigned            ready:1;        // 是否就绪
    unsigned            timedout:1;     // 是否超时
  
    // ... 更多成员
} ngx_event_t;  // 约96字节
```

#### 2.14.5 超时配置

```nginx
http {
    # 客户端请求头超时
    client_header_timeout 60s;
  
    # 客户端请求体超时
    client_body_timeout 60s;
  
    # 发送响应超时
    send_timeout 60s;
  
    # Keepalive超时
    keepalive_timeout 75s;
}
```

#### 2.14.6 内置变量示例

```nginx
http {
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" $bytes_sent';
  
    server {
        access_log /var/log/nginx/access.log main;
    }
}
```

**常用变量：**

- `$bytes_sent`：发送给客户端的总字节数（对应connection->sent）
- `$body_bytes_sent`：发送给客户端的响应体字节数
- `$connection`：连接序号
- `$connection_requests`：当前连接上处理的请求数

### 2.15 内存池

#### 2.15.1 内存池的作用

**为什么需要内存池：**

1. **减少内存碎片**

   - 预分配大块内存
   - 小块内存连续分配
   - 避免频繁malloc/free
2. **简化内存管理**

   - 第三方模块无需手动释放内存
   - 请求结束自动释放请求内存池
   - 连接关闭自动释放连接内存池
3. **提升性能**

   - 减少系统调用次数
   - 减少内存分配开销

#### 2.15.2 内存池类型

```mermaid
graph TD
    A[ngx_connection_t] --> B[连接内存池pool]
    C[ngx_http_request_t] --> D[请求内存池pool]
  
    B --> E[生命周期: 连接建立到关闭]
    D --> F[生命周期: 请求开始到结束]
  
    E --> G[适用: 跨请求的数据]
    F --> H[适用: 单个请求的数据]
  
    style B fill:#e1f5ff
    style D fill:#e1ffe1
```

#### 2.15.3 内存池配置

```nginx
http {
    # 连接内存池大小（默认256或512，取决于系统位数）
    connection_pool_size 512;
  
    # 请求内存池大小（默认4k）
    request_pool_size 4k;
}
```

**配置建议：**

| 场景       | connection_pool_size | request_pool_size |
| ---------- | -------------------- | ----------------- |
| 默认       | 512                  | 4k                |
| URL很长    | 512                  | 8k或更大          |
| URL很短    | 256                  | 2k                |
| 大量小请求 | 256                  | 2k                |

#### 2.15.4 内存池工作原理

```mermaid
graph LR
    A[内存池] --> B[大块内存]
    B --> C[小块1]
    B --> D[小块2]
    B --> E[小块3]
    B --> F[未使用]
  
    C -.next.-> D
    D -.next.-> E
    E -.next.-> F
  
    G[新分配] --> F
  
    style A fill:#e1f5ff
    style F fill:#e1ffe1
```

**分配策略：**

1. **小块内存（< 页面大小）**

   - 从预分配的内存块中分配
   - 使用next指针连接
   - 快速分配，无碎片
2. **大块内存（≥ 页面大小）**

   - 直接调用malloc分配
   - 单独管理
   - 释放时单独free

#### 2.15.5 连接内存池 vs 请求内存池

| 特性            | 连接内存池     | 请求内存池     |
| --------------- | -------------- | -------------- |
| 生命周期        | 连接建立到关闭 | 请求开始到结束 |
| 默认大小        | 512字节        | 4KB            |
| 适用数据        | 跨请求共享     | 单个请求专用   |
| 释放时机        | 连接关闭       | 请求结束       |
| HTTP Keep-Alive | 保持           | 每次请求重建   |

**使用场景：**

```c
// 连接内存池：读取请求的缓冲区（跨请求复用）
buffer = ngx_palloc(c->pool, 1024);

// 请求内存池：解析URL的临时数据（请求结束释放）
uri = ngx_palloc(r->pool, r->uri.len + 1);
```

#### 2.15.6 内存池的性能影响

**优点：**

- 减少内存碎片
- 减少系统调用
- 简化内存管理

**注意事项：**

- 预分配过大浪费内存
- 预分配过小频繁扩展
- 第三方模块应正确选择内存池类型

### 2.16 共享内存

#### 2.16.1 进程间通信方式

Nginx多进程间通信主要有两种方式：

1. **信号**：用于进程管理
2. **共享内存**：用于数据同步

#### 2.16.2 共享内存的必要性

```mermaid
graph TD
    A[Master进程] --> B[Worker 1]
    A --> C[Worker 2]
    A --> D[Worker N]
  
    B -.共享内存.-> E[Shared Memory]
    C -.共享内存.-> E
    D -.共享内存.-> E
  
    E --> F[限流限速数据]
    E --> G[缓存数据]
    E --> H[SSL Session]
    E --> I[Lua共享字典]
  
    style E fill:#e1f5ff
    style F fill:#ffe1e1
    style G fill:#e1ffe1
```

**使用场景：**

- 跨Worker进程的限流限速
- 反向代理缓存
- SSL Session缓存
- OpenResty的lua_shared_dict

#### 2.16.3 共享内存的挑战

**1. 锁机制**

```mermaid
graph LR
    A[Worker 1] -->|尝试获取锁| B{锁状态}
    B -->|已锁定| C[自旋等待]
    B -->|未锁定| D[获取锁成功]
    D --> E[操作共享内存]
    E --> F[释放锁]
    C --> B
  
    style C fill:#ffe1e1
    style D fill:#e1ffe1
```

**锁的类型：**

- **信号量（早期）**：会导致进程Sleep，性能差
- **自旋锁（现代）**：不Sleep，持续尝试获取锁

**自旋锁的要求：**

- 快速获取锁
- 快速释放锁
- 不能长时间持有锁

**2. 内存管理**

需要Slab内存管理器来分配和管理共享内存。

#### 2.16.4 使用共享内存的模块

**官方模块：**

| 模块          | 数据结构 | 用途            |
| ------------- | -------- | --------------- |
| limit_req     | 红黑树   | 请求限速        |
| limit_conn    | 红黑树   | 连接限制        |
| http_cache    | 红黑树   | 反向代理缓存    |
| ssl           | 红黑树   | SSL Session缓存 |
| upstream_zone | 链表     | 上游服务器共享  |

**OpenResty模块：**

```nginx
http {
    # 创建共享内存字典
    lua_shared_dict dogs 10m;
  
    server {
        location /set {
            content_by_lua_block {
                local dogs = ngx.shared.dogs
                dogs:set("Jim", 8)
                ngx.say("stored")
            }
        }
  
        location /get {
            content_by_lua_block {
                local dogs = ngx.shared.dogs
                local value = dogs:get("Jim")
                ngx.say(value)
            }
        }
    }
}
```

#### 2.16.5 lua_shared_dict的实现

```mermaid
graph TD
    A[lua_shared_dict] --> B[红黑树RBTree]
    A --> C[LRU链表]
  
    B --> D[存储Key-Value]
    B --> E[快速查找O log n]
  
    C --> F[记录访问顺序]
    C --> G[内存满时淘汰]
  
    style A fill:#e1f5ff
    style B fill:#ffe1e1
    style C fill:#e1ffe1
```

**特性：**

- 使用红黑树存储数据
- 使用LRU链表管理淘汰
- 内存满时自动淘汰最久未使用的数据

### 2.17 Slab内存管理器

#### 2.17.1 Slab的作用

将大块共享内存切分成小块，分配给不同的对象使用。

#### 2.17.2 Slab内存结构

```mermaid
graph TD
    A[共享内存] --> B[Page 1: 4KB]
    A --> C[Page 2: 4KB]
    A --> D[Page N: 4KB]
  
    B --> E[Slot: 32字节]
    B --> F[Slot: 32字节]
    B --> G[Slot: 32字节]
  
    C --> H[Slot: 64字节]
    C --> I[Slot: 64字节]
  
    D --> J[Slot: 128字节]
  
    style A fill:#e1f5ff
    style B fill:#ffe1e1
    style C fill:#e1ffe1
    style D fill:#fff5e1
```

**分配策略：**

1. **页面（Page）**

   - 固定大小（通常4KB）
   - 共享内存被切分为多个页面
2. **槽位（Slot）**

   - 每个页面切分为多个槽位
   - 槽位大小以2的幂次增长（32、64、128、256...）
3. **Best Fit分配**

   - 51字节的对象分配到64字节的槽位
   - 浪费13字节（最多浪费50%）

#### 2.17.3 Slab的优缺点

**优点：**

- 适合小对象分配
- 碎片少
- 分配快速
- 可复用已初始化的数据结构

**缺点：**

- 最多浪费50%内存
- 只适合小于页面大小的对象

#### 2.17.4 监控Slab使用情况

**Tengine的slab_stat模块：**

```nginx
location /slab_stat {
    slab_stat;
}
```

**输出示例：**

```
* shared memory: dogs
total:       10485760(10.00M) free:       10485200(10.00M) size:            8
pages:       10485200(10.00M) start:00007F8F8E8A5000 end:00007F8F8F8A5000
slot:           8(  8) total:           0 used:           0 reqs:           0 fails:           0
slot:          16( 16) total:           0 used:           0 reqs:           0 fails:           0
slot:          32( 32) total:         127 used:           1 reqs:           1 fails:           0
slot:          64( 64) total:           0 used:           0 reqs:           0 fails:           0
slot:         128(128) total:          32 used:           2 reqs:           2 fails:           0
```

**字段说明：**

- `total`：该槽位总数
- `used`：已使用数量
- `reqs`：请求次数
- `fails`：失败次数

### 2.18 哈希表

#### 2.18.1 Nginx哈希表的特点

**与普通哈希表的区别：**

1. **静态不变**

   - 启动时确定所有元素
   - 运行时不插入不删除
   - 只用于查找
2. **配置参数**

   - `max_size`：最大元素数量
   - `bucket_size`：每个桶的大小

#### 2.18.2 哈希表结构

```mermaid
graph TD
    A[Hash Table] --> B[Bucket 0]
    A --> C[Bucket 1]
    A --> D[Bucket N]
  
    B --> E[Key-Value 1]
    B --> F[Key-Value 2]
  
    C --> G[Key-Value 3]
  
    style A fill:#e1f5ff
    style B fill:#ffe1e1
    style C fill:#e1ffe1
```

#### 2.18.3 使用哈希表的模块

| 模块           | 用途         | 配置                                                              |
| -------------- | ------------ | ----------------------------------------------------------------- |
| variables_hash | 存储所有变量 | -                                                                 |
| map            | 变量映射     | `map_hash_max_size`, `map_hash_bucket_size`                   |
| types          | MIME类型映射 | `types_hash_max_size`, `types_hash_bucket_size`               |
| server_names   | 服务器名称   | `server_names_hash_max_size`, `server_names_hash_bucket_size` |

#### 2.18.4 CPU Cache Line对齐

```nginx
# 哈希表bucket大小配置
map_hash_bucket_size 64;  # 默认值，与CPU Cache Line对齐
```

**为什么要对齐到64字节：**

1. **CPU Cache Line大小**

   - 现代CPU一次从内存读取64字节
   - 称为一个Cache Line
2. **未对齐的问题**

   ```
   假设bucket_size = 59字节

   Bucket 1: [0-58]    需要读取1次（64字节）
   Bucket 2: [59-117]  需要读取2次（第一个64字节的最后5字节 + 第二个64字节的前54字节）
   ```
3. **对齐的好处**

   ```
   bucket_size = 64字节

   Bucket 1: [0-63]    需要读取1次
   Bucket 2: [64-127]  需要读取1次
   ```

**配置建议：**

- 尽量不超过64字节
- 如果必须超过，会自动对齐到128字节
- 减少CPU访问内存的次数

### 2.19 红黑树

#### 2.19.1 红黑树的特性

```mermaid
graph TD
    A[11] --> B[6]
    A --> C[15]
    B --> D[1]
    B --> E[8]
    C --> F[13]
    C --> G[17]
  
    style A fill:#ffe1e1
    style B fill:#e1f5ff
    style C fill:#ffe1e1
    style D fill:#e1f5ff
    style E fill:#ffe1e1
    style F fill:#e1f5ff
    style G fill:#ffe1e1
```

**红黑树是：**

1. **二叉树**：每个节点最多两个子节点
2. **查找二叉树**：左子节点 < 父节点 < 右子节点
3. **自平衡**：高度差不超过2倍

**红黑树的优点：**

| 特性 | 复杂度     | 说明      |
| ---- | ---------- | --------- |
| 高度 | ≤ 2log(n) | n为节点数 |
| 插入 | O(log n)   | 自动平衡  |
| 删除 | O(log n)   | 自动平衡  |
| 查找 | O(log n)   | 二分查找  |
| 遍历 | O(n)       | 中序遍历  |

#### 2.19.2 红黑树数据结构

```c
// 红黑树结构
typedef struct {
    ngx_rbtree_node_t  *root;      // 根节点
    ngx_rbtree_node_t  *sentinel;  // 哨兵节点
    ngx_rbtree_insert_pt insert;   // 插入方法
} ngx_rbtree_t;

// 红黑树节点
typedef struct ngx_rbtree_node_s {
    ngx_rbtree_key_t       key;     // 键（整数）
    struct ngx_rbtree_node_s  *left;   // 左子节点
    struct ngx_rbtree_node_s  *right;  // 右子节点
    struct ngx_rbtree_node_s  *parent; // 父节点
    u_char                 color;   // 颜色（红/黑）
    u_char                 data;    // 数据
} ngx_rbtree_node_t;
```

#### 2.19.3 使用红黑树的模块

**本地内存中的红黑树：**

- `timer`：定时器管理
- `ngx_conf_module`：配置解析

**共享内存中的红黑树：**

- `limit_req`：请求限速
- `limit_conn`：连接限制
- `http_cache`：反向代理缓存
- `ssl`：SSL Session缓存
- `lua_shared_dict`：Lua共享字典

#### 2.19.4 红黑树的应用场景

**1. 定时器管理**

```mermaid
graph TD
    A[定时器红黑树] --> B[最小节点=最早超时]
    B --> C[快速找到超时事件]
    C --> D[O log n 插入新定时器]
  
    style A fill:#e1f5ff
    style B fill:#e1ffe1
```

**2. 限流限速**

```
红黑树存储：客户端IP -> 请求次数
- 快速查找：O(log n)
- 快速插入：O(log n)
- 快速删除：O(log n)
```

**3. 缓存管理**

```
红黑树存储：缓存Key -> 缓存数据
- 快速查找缓存
- 快速插入新缓存
- 快速删除过期缓存
```

### 2.20 动态模块

#### 2.20.1 静态模块 vs 动态模块

```mermaid
graph TD
    A[静态模块] --> B[编译进二进制文件]
    B --> C[升级需要重新编译所有模块]
  
    D[动态模块] --> E[编译为.so文件]
    E --> F[升级只需替换.so文件]
  
    style A fill:#ffe1e1
    style D fill:#e1ffe1
```

#### 2.20.2 动态模块的优势

**静态模块的问题：**

- 升级一个模块需要重新编译整个Nginx
- 容易遗漏或错误配置其他模块
- 编译参数复杂

**动态模块的优势：**

- 只需重新编译单个模块
- 不影响Nginx主程序
- 降低出错概率

#### 2.20.3 编译动态模块

```bash
# 1. 配置时指定动态模块
./configure --prefix=/usr/local/nginx \
            --with-http_image_filter_module=dynamic

# 2. 编译
make

# 3. 安装
make install

# 4. 查看生成的动态库
ls /usr/local/nginx/modules/
# ngx_http_image_filter_module.so
```

#### 2.20.4 使用动态模块

```nginx
# 在配置文件开头加载动态模块
load_module modules/ngx_http_image_filter_module.so;

http {
    server {
        location ~ \.(jpg|png)$ {
            # 使用image_filter模块的功能
            image_filter resize 150 100;
        }
    }
}
```

#### 2.20.5 动态模块工作流程

```mermaid
sequenceDiagram
    participant N as Nginx
    participant C as nginx.conf
    participant M as 动态模块.so
  
    N->>N: 1. 启动Nginx
    N->>C: 2. 读取配置文件
    C->>C: 3. 发现load_module指令
    N->>M: 4. 打开动态库
    M->>N: 5. 加载模块到进程
    N->>N: 6. 初始化模块
    N->>N: 7. 正常运行
```

#### 2.20.6 支持动态模块的模块

**查看支持动态模块的模块：**

```bash
./configure --help | grep "=dynamic"
```

**常见支持动态模块的模块：**

- `--with-http_image_filter_module=dynamic`
- `--with-http_xslt_module=dynamic`
- `--with-http_geoip_module=dynamic`
- `--with-stream=dynamic`
- `--with-mail=dynamic`

**注意：** 不是所有模块都支持动态加载。

#### 2.20.7 动态模块的限制

1. **不是所有模块都支持**

   - 核心模块不支持
   - 部分第三方模块不支持
2. **性能影响**

   - 动态加载有轻微性能损失
   - 生产环境影响可忽略
3. **版本兼容性**

   - 动态模块需要与Nginx版本匹配
   - 升级Nginx可能需要重新编译动态模块

---

## 第二部分总结

通过第二部分的学习，我们深入了解了Nginx的架构基础：

### 核心概念

1. **进程模型**

   - Master-Worker多进程架构
   - 进程间通过信号和共享内存通信
   - Worker数量与CPU核数匹配
2. **事件驱动**

   - 基于Epoll的非阻塞事件模型
   - 用户态请求切换，避免进程切换开销
   - 支持百万级并发连接
3. **内存管理**

   - 连接池和内存池减少内存碎片
   - 共享内存实现跨进程数据共享
   - Slab管理器高效分配共享内存
4. **数据结构**

   - 哈希表：静态数据快速查找
   - 红黑树：动态数据增删改查
   - 链表：简单的数据组织
5. **模块系统**

   - 高内聚低耦合的模块设计
   - 丰富的生命周期回调
   - 支持静态和动态模块

### 关键技术

- **信号管理**：Reload、热升级、优雅关闭
- **网络事件**：读写事件、定时器、AIO
- **同步异步**：OpenResty实现同步编程方式
- **性能优化**：CPU亲和性、内存池、连接池

接下来，我们将学习HTTP模块的详细使用。

---

**待续：第三部分 - 详解HTTP模块**

## 第三部分：详解HTTP模块

### 3.1 HTTP模块概述

HTTP模块是Nginx最核心的功能模块,负责处理HTTP请求的各个阶段。本部分将以**请求处理流程**为主线,按照Nginx定义的**11个阶段**依次讲解各个HTTP模块的使用方法。

**学习重点:**

- HTTP配置指令的合并规则
- 11个请求处理阶段及模块执行顺序
- HTTP过滤模块的调用流程
- Nginx变量的运行原理和使用方法

### 3.2 HTTP配置指令的合并规则

#### 3.2.1 配置块的嵌套结构

Nginx配置文件中,HTTP相关配置按照层级嵌套:

```
main (全局配置)
└── http
    ├── upstream (上游服务器组)
    ├── map (变量映射)
    ├── geo (地理位置)
    ├── split_clients (AB测试)
    └── server (虚拟主机)
        └── location (URL匹配)
            └── if (条件判断)
```

#### 3.2.2 指令的Context(上下文)

每个指令都有其允许出现的context,例如:

```nginx
# log_format 只能出现在 http 块中
http {
    log_format main '$remote_addr - $remote_user [$time_local]';
  
    # access_log 可以出现在多个context中
    access_log /var/log/nginx/access.log main;  # http
  
    server {
        access_log /var/log/nginx/server.log;   # server
  
        location / {
            access_log /var/log/nginx/location.log;  # location
        }
    }
}
```

#### 3.2.3 指令分类

**1. 值指令(可合并)**

存储配置值的指令,子配置块可以继承父配置块的值:

- `root` - 指定根目录
- `gzip` - 开启压缩
- `access_log` - 访问日志

**合并规则:**

- 子配置不存在时,直接使用父配置的值
- 子配置存在时,覆盖父配置的值

```nginx
server {
    root /usr/share/nginx/html;  # 父配置
    access_log /var/log/nginx/access.log;
  
    location /test {
        # 没有定义root,继承父配置
        # root仍然是 /usr/share/nginx/html
    }
  
    location /api {
        root /data/api;  # 覆盖父配置
        # root变为 /data/api
    }
}
```

**2. 动作类指令(不可合并)**

指定行为的指令,在特定阶段执行特定动作:

- `return` - 返回响应
- `rewrite` - 重写URL
- `proxy_pass` - 反向代理

**生效阶段:**

- `server_rewrite` 阶段
- `rewrite` 阶段
- `content` 阶段

```nginx
location /test {
    return 200 "OK";  # 动作类指令,不会合并
    # 后续指令不会执行
}
```

#### 3.2.4 通过源码判断合并规则

查看模块的 `ngx_http_module_t` 结构体中的 `merge_loc_conf` 或 `merge_srv_conf` 方法:

```c
// 示例:referer模块的合并方法
static char *
ngx_http_referer_merge_loc_conf(ngx_conf_t *cf, void *parent, void *child)
{
    ngx_http_referer_conf_t *prev = parent;  // 父配置
    ngx_http_referer_conf_t *conf = child;   // 子配置
  
    // 如果子配置未设置,使用父配置
    if (conf->keys == NULL) {
        conf->keys = prev->keys;
    }
  
    return NGX_CONF_OK;
}
```

**判断要点:**

1. 指令在哪个块下生效(server/location)
2. 指令允许出现在哪些context中
3. 是否定义了 `merge_srv_conf` 或 `merge_loc_conf` 方法
4. 合并方法中的具体逻辑

### 3.3 Listen指令详解

#### 3.3.1 基本语法

`listen` 指令用于监听端口,建立TCP连接:

```nginx
# 语法格式
listen address[:port];
listen port;
listen unix:path;

# 示例
listen 80;                          # 监听所有IP的80端口
listen 192.168.1.100:8080;         # 监听特定IP和端口
listen [::]:80;                     # 监听IPv6
listen unix:/var/run/nginx.sock;   # Unix Socket(本地通信)
```

#### 3.3.2 常用参数

```nginx
listen 80 default_server;  # 默认server
listen 443 ssl;            # SSL/TLS
listen 80 reuseport;       # SO_REUSEPORT(多进程监听)
```

**注意事项:**

- 只指定端口时,默认监听所有IP地址
- `default_server` 用于指定默认虚拟主机
- Unix Socket适用于本地进程通信,性能更高

#### 3.3.4 配置示例: listen.conf

**用途:** 演示listen指令的bind参数使用,控制监听地址的绑定行为

**完整配置:**

```nginx
# 第一个server块: 监听所有IP地址的7000端口,使用bind参数
server {
    server_name access.taohui.tech;
  
    # listen指令语法: listen address:port [bind];
    # *:7000 表示监听所有IP地址(0.0.0.0)的7000端口
    # bind参数: 强制绑定到指定的地址和端口组合
    #   - 使用bind时,会为每个address:port创建独立的socket
    #   - 不使用bind时,可能会复用已有的socket(如果地址相同)
    listen *:7000 bind;
  
    # 返回固定响应,用于测试
    return 200 '7000\n';
}

# 第二个server块: 仅监听localhost的7000端口
server {
    server_name access.taohui.tech;
  
    # localhost:7000 表示只监听本地回环地址(127.0.0.1)的7000端口
    # 这个配置不会响应来自外部网络的请求
    # 适用场景: 仅允许本机进程访问的服务
    listen localhost:7000;
  
    # 返回不同的响应,用于区分两个server块
    return 200 'localhost:7000\n';
}
```

**关键配置项解释:**

- `listen *:7000 bind` - 监听所有IP地址的7000端口,并强制绑定

  - `*` 或 `0.0.0.0` 表示监听所有可用的IPv4地址
  - `bind` 参数确保为这个配置创建独立的socket
  - 适用于需要明确区分不同监听地址的场景
- `listen localhost:7000` - 仅监听本地回环地址

  - `localhost` 会被解析为 `127.0.0.1`
  - 只接受来自本机的连接请求
  - 外部网络无法访问此端口

**使用场景:**

1. **多IP服务器**: 服务器有多个IP地址,需要在不同IP上提供不同服务
2. **安全隔离**: 某些服务只允许本地访问(如管理接口、监控接口)
3. **端口复用**: 同一端口在不同IP地址上提供不同的服务内容
4. **测试环境**: 在同一台机器上模拟多个不同的服务端点

**测试方法:**

```bash
# 测试监听所有地址的端口(假设服务器IP为192.168.1.100)
curl http://192.168.1.100:7000
# 预期输出: 7000

# 测试仅监听localhost的端口(从服务器本机执行)
curl http://localhost:7000
# 预期输出: localhost:7000

# 从外部访问localhost端口(会失败)
curl http://192.168.1.100:7000
# 预期: 连接被拒绝或无响应
```

**注意事项:**

- `bind` 参数在大多数情况下是可选的,Nginx会自动处理socket绑定
- 当同一端口需要在多个IP地址上监听时,使用 `bind` 可以避免冲突
- `localhost` 监听仅限本机访问,适合内部管理接口
- 如果配置了多个相同的 `listen` 指令,Nginx会报错
- 使用 `reuseport` 参数可以让多个worker进程共享同一端口,提高并发性能

### 3.4 HTTP请求处理流程

#### 3.4.1 连接建立与请求接收流程图

```mermaid
sequenceDiagram
    participant Client as 客户端
    participant Kernel as 操作系统内核
    participant Worker as Worker进程
    participant HTTP as HTTP模块

    Client->>Kernel: SYN(三次握手开始)
    Kernel->>Client: SYN+ACK
    Client->>Kernel: ACK(连接建立)
    Kernel->>Worker: epoll_wait返回(读事件)
    Worker->>Worker: accept()建立连接
    Worker->>Worker: 分配连接内存池(512B)
    Worker->>HTTP: ngx_http_init_connection()
    HTTP->>Worker: 添加读事件到epoll
    HTTP->>HTTP: 设置超时(client_header_timeout=60s)
  
    Client->>Kernel: HTTP请求(GET /index.html)
    Kernel->>Worker: epoll_wait返回(读事件)
    Worker->>Worker: 分配1KB缓冲区(client_header_buffer_size)
    Worker->>Worker: 分配请求内存池(4KB)
    Worker->>HTTP: 解析请求行(状态机)
  
    alt URL过长
        HTTP->>HTTP: 分配大缓冲区(large_client_header_buffers 4 8k)
    end
  
    HTTP->>HTTP: 解析请求头(状态机)
    HTTP->>HTTP: 标识URL和Header
    HTTP->>HTTP: 移除超时定时器
    HTTP->>HTTP: 进入11个阶段处理
```

**关键配置参数:**

| 参数                            | 默认值 | 说明                           |
| ------------------------------- | ------ | ------------------------------ |
| `connection_pool_size`        | 512    | 连接内存池初始大小             |
| `client_header_buffer_size`   | 1k     | 接收请求头的缓冲区大小         |
| `large_client_header_buffers` | 4 8k   | 大请求头缓冲区(最多4个,每个8k) |
| `request_pool_size`           | 4k     | 请求内存池大小                 |
| `client_header_timeout`       | 60s    | 读取请求头超时时间             |

**内存分配时机:**

```
1. accept()后 → 连接内存池(512B)
2. 收到第一个字节 → 请求头缓冲区(1KB)
3. 开始处理请求 → 请求内存池(4KB)
4. URL或Header过长 → 大缓冲区(最多4×8KB=32KB)
```

#### 3.4.2 请求处理的11个阶段

Nginx将HTTP请求处理划分为11个阶段,每个阶段可以有多个模块参与处理:

```mermaid
graph TD
    A[POST_READ] -->|realip模块| B[SERVER_REWRITE]
    B -->|rewrite模块| C[FIND_CONFIG]
    C -->|匹配location| D[REWRITE]
    D -->|rewrite模块| E[POST_REWRITE]
    E --> F[PREACCESS]
    F -->|limit_req/limit_conn| G[ACCESS]
    G -->|access/auth_basic/auth_request| H[POST_ACCESS]
    H --> I[PRECONTENT]
    I -->|try_files/mirror| J[CONTENT]
    J -->|index/autoindex/static| K[LOG]
    K -->|log模块| L[请求结束]
```

**各阶段说明:**

| 阶段           | 说明                  | 主要模块                         |
| -------------- | --------------------- | -------------------------------- |
| POST_READ      | 读取请求内容后        | realip                           |
| SERVER_REWRITE | server块中的rewrite   | rewrite                          |
| FIND_CONFIG    | 查找location配置      | -                                |
| REWRITE        | location块中的rewrite | rewrite                          |
| POST_REWRITE   | rewrite后处理         | -                                |
| PREACCESS      | 访问控制前            | limit_req, limit_conn            |
| ACCESS         | 访问控制              | access, auth_basic, auth_request |
| POST_ACCESS    | 访问控制后            | -                                |
| PRECONTENT     | 生成内容前            | try_files, mirror                |
| CONTENT        | 生成内容              | index, autoindex, static         |
| LOG            | 记录日志              | log                              |

**模块执行顺序:**

模块在同一阶段内的执行顺序由 `ngx_modules.c` 文件中的顺序决定,**从后往前**执行:

```c
// ngx_modules.c (简化示例)
ngx_module_t *ngx_modules[] = {
    // ...
    &ngx_http_limit_conn_module,   // 后定义
    &ngx_http_limit_req_module,    // 先执行
    // ...
};
```

**重要特性:**

- 同一阶段的模块按照 `ngx_modules.c` 中的**倒序**执行
- 某些模块执行后可能跳过后续模块(如 `return` 指令)
- `satisfy` 指令可以改变ACCESS阶段模块的执行逻辑

### 3.5 正则表达式在Nginx中的应用

#### 3.5.1 元字符

| 元字符                                                 | 说明                      | 示例                          |
| ------------------------------------------------------ | ------------------------- | ----------------------------- |
| `.`                                                  | 匹配任意字符(除换行符)    | `a.c` 匹配 "abc", "a1c"     |
| `\w`                                                 | 匹配字母/数字/下划线/汉字 | `\w+` 匹配 "hello123"       |
| `\s`                                                 | 匹配空白符                | `\s+` 匹配空格、制表符      |
| `\d`                                                 | 匹配数字                  | `\d{3}` 匹配 "123"          |
| `\b`                                                 | 匹配单词边界              | `\bword\b` 匹配独立的"word" |
| `^`                                                  | 匹配字符串开始            | `^http` 匹配以"http"开头    |
| `$` | 匹配字符串结束 | `\.html$` 匹配以".html"结尾 |                           |                               |

#### 3.5.2 重复

| 符号      | 说明      | 示例                                    |
| --------- | --------- | --------------------------------------- |
| `*`     | 0次或多次 | `\d*` 匹配 "", "1", "123"             |
| `+`     | 1次或多次 | `\d+` 匹配 "1", "123"                 |
| `?`     | 0次或1次  | `\d?` 匹配 "", "1"                    |
| `{n}`   | 恰好n次   | `\d{3}` 匹配 "123"                    |
| `{n,}`  | 至少n次   | `\d{3,}` 匹配 "123", "1234"           |
| `{n,m}` | n到m次    | `\d{3,5}` 匹配 "123", "1234", "12345" |

#### 3.5.3 分组与捕获

使用小括号 `()` 进行分组和捕获:

```nginx
# 示例:URL重写
location ~ ^/article/(\d+) {
    # $1 捕获第一个括号内的内容
    rewrite ^/article/(\d+)$ /post.php?id=$1 last;
}

# 示例:复杂URL转换
# 原始: /admin/website/article/35/edit/upload/party/5.jpg
# 目标: /static/upload/party/5.jpg
location ~ ^/admin/website/article/(\d+)/edit/upload/(.+)/(.+)\.(.+)$ {
    rewrite ^/admin/website/article/(\d+)/edit/upload/(.+)/(.+)\.(.+)$ 
            /static/upload/$2/$3.$4 last;
    # $1=35, $2=party, $3=5, $4=jpg
}
```

#### 3.5.4 测试工具:pcretest

```bash
# 安装pcre-tools
yum install pcre-devel

# 使用pcretest测试正则表达式
pcretest
# 输入正则表达式
/^\/admin\/website\/article\/(\d+)\/edit\/upload\/(.+)\/(.+)\.(.+)$/

# 输入测试字符串
/admin/website/article/35/edit/upload/party/5.jpg

# 输出匹配结果
 0: /admin/website/article/35/edit/upload/party/5.jpg
 1: 35
 2: party
 3: 5
 4: jpg
```

**注意事项:**

- 在Nginx配置中不需要转义斜杠 `/`
- 在pcretest中需要转义斜杠 `\/`
- 使用 `~` 表示大小写敏感的正则匹配
- 使用 `~*` 表示大小写不敏感的正则匹配

### 3.6 Server Name匹配规则

#### 3.6.1 基本语法

```nginx
server {
    # 精确匹配
    server_name example.com;
  
    # 多个域名
    server_name example.com www.example.com;
  
    # 泛域名(前缀)
    server_name *.example.com;
  
    # 泛域名(后缀)
    server_name www.example.*;
  
    # 正则表达式
    server_name ~^www\d+\.example\.com$;
  
    # 匹配所有
    server_name _;
  
    # 空Host头
    server_name "";
}
```

#### 3.6.2 匹配优先级

```mermaid
graph TD
    A[收到HTTP请求] --> B{1. 精确匹配?}
    B -->|是| C[使用该server]
    B -->|否| D{2. 前缀泛域名匹配?}
    D -->|是| C
    D -->|否| E{3. 后缀泛域名匹配?}
    E -->|是| C
    E -->|否| F{4. 正则表达式匹配?}
    F -->|是,按文件顺序| C
    F -->|否| G[使用default_server]
```

**匹配顺序:**

1. 精确匹配(不含通配符和正则)
2. 以 `*` 开头的泛域名
3. 以 `*` 结尾的泛域名
4. 正则表达式(按在配置文件中出现的顺序)
5. default_server

**示例:**

```nginx
server {
    listen 80;
    server_name example.com;  # 优先级1:精确匹配
}

server {
    listen 80;
    server_name *.example.com;  # 优先级2:前缀泛域名
}

server {
    listen 80;
    server_name www.example.*;  # 优先级3:后缀泛域名
}

server {
    listen 80;
    server_name ~^www\d+\.example\.com$;  # 优先级4:正则表达式
}

server {
    listen 80 default_server;  # 优先级5:默认server
    server_name _;
}
```

#### 3.6.3 主域名与server_name_in_redirect

```nginx
server {
    listen 80;
    server_name primary.example.com secondary.example.com;  # 第一个为主域名
    server_name_in_redirect on;  # 重定向时使用主域名
  
    location /redirect {
        return 302 /target;
        # 如果访问 secondary.example.com/redirect
        # 重定向到 primary.example.com/target (on)
        # 或 secondary.example.com/target (off)
    }
}
```

#### 3.6.4 正则表达式捕获变量

```nginx
server {
    # 使用数字变量
    server_name ~^(www\.)?(.+)$;
    location / {
        root /data/$2;  # $2 = example.com
    }
}

server {
    # 使用命名变量
    server_name ~^(www\.)?(?<domain>.+)$;
    location / {
        root /data/$domain;  # 更易读
    }
}
```

#### 3.6.5 特殊用法

```nginx
# 同时匹配带www和不带www
server_name .example.com;  # 等价于 example.com *.example.com

# 匹配所有域名
server_name _;

# 匹配空Host头
server_name "";
```

#### 3.6.5 配置示例: servername_test.conf

**用途:** 演示 `server_name_in_redirect` 指令的作用,控制重定向时使用的主机名

**完整配置:**

```nginx
server {
    # 配置多个server_name,用于测试重定向时的主机名选择
    # 第一个域名: primary.taohui.tech (主域名)
    # 第二个域名: second.taohui.tech (备用域名)
    server_name primary.taohui.tech second.taohui.tech;
  
    # server_name_in_redirect指令说明:
    # - on: 重定向时使用server_name指令中的第一个域名
    # - off(默认): 重定向时使用请求中的Host头部
    # 
    # 作用: 统一重定向的域名,避免用户使用不同域名访问时出现混乱
    server_name_in_redirect on;
  
    # 返回302重定向到/redirect路径
    # 测试场景:
    # 1. 访问 http://primary.taohui.tech/ 
    #    -> 重定向到 http://primary.taohui.tech/redirect
    # 2. 访问 http://second.taohui.tech/
    #    -> 由于server_name_in_redirect为on,会重定向到 http://primary.taohui.tech/redirect
    #    -> 如果设置为off,则会重定向到 http://second.taohui.tech/redirect
    return 302 /redirect;
}
```

**关键配置项解释:**

- `server_name primary.taohui.tech second.taohui.tech` - 配置多个域名

  - 第一个域名被视为"主域名"
  - 后续域名为备用域名或别名
  - 所有配置的域名都会匹配到这个server块
- `server_name_in_redirect on` - 启用主域名重定向

  - **on**: 所有重定向都使用 `server_name` 中的第一个域名(primary.taohui.tech)
  - **off**: 重定向保持用户请求时使用的域名
  - 默认值为 `off`
- `return 302 /redirect` - 返回临时重定向

  - 302状态码表示临时重定向
  - 重定向到相对路径 `/redirect`
  - Nginx会自动构造完整的URL(包括协议、域名、端口)

**使用场景:**

1. **域名统一化**: 网站有多个域名(如www和非www),希望统一到主域名
2. **品牌一致性**: 确保用户最终看到的都是官方主域名
3. **SEO优化**: 避免多个域名分散搜索引擎权重
4. **测试环境**: 使用多个测试域名,但希望重定向统一到主域名

**测试方法:**

```bash
# 测试1: 使用主域名访问
curl -I http://primary.taohui.tech/
# 预期: Location: http://primary.taohui.tech/redirect

# 测试2: 使用备用域名访问(server_name_in_redirect=on)
curl -I http://second.taohui.tech/
# 预期: Location: http://primary.taohui.tech/redirect (注意域名变成了primary)

# 测试3: 如果设置server_name_in_redirect off
# curl -I http://second.taohui.tech/
# 预期: Location: http://second.taohui.tech/redirect (保持原域名)
```

**对比说明:**

| 配置                            | 访问域名            | 重定向Location                         |
| ------------------------------- | ------------------- | -------------------------------------- |
| `server_name_in_redirect on`  | primary.taohui.tech | http://primary.taohui.tech/redirect    |
| `server_name_in_redirect on`  | second.taohui.tech  | http://primary.taohui.tech/redirect ✓ |
| `server_name_in_redirect off` | primary.taohui.tech | http://primary.taohui.tech/redirect    |
| `server_name_in_redirect off` | second.taohui.tech  | http://second.taohui.tech/redirect     |

**注意事项:**

- 此指令仅影响Nginx自身生成的重定向(如 `return`, `rewrite`, 目录访问自动添加斜杠等)
- 不影响应用程序生成的重定向(如PHP、Python应用返回的Location头)
- 通常与 `absolute_redirect` 和 `port_in_redirect` 配合使用
- 在使用CDN或反向代理时,需要注意域名的一致性
- 建议在生产环境中明确设置此参数,避免依赖默认行为

**相关指令:**

- `absolute_redirect` - 控制是否返回绝对路径的重定向(默认on)
- `port_in_redirect` - 控制重定向URL是否包含端口号(默认on)
- `server_name_in_redirect` - 控制重定向使用的域名(默认off)

### 3.7 POST_READ阶段:realip模块

**功能:** 获取用户真实IP地址

**问题背景:**

- TCP连接的源IP可能是反向代理的IP,而非真实用户IP
- 需要通过HTTP头部(X-Forwarded-For, X-Real-IP)获取真实IP

**配置指令:**

```nginx
http {
    # 定义可信地址
    set_real_ip_from 192.168.1.0/24;
    set_real_ip_from 10.0.0.0/8;
  
    # 从哪个头部取IP
    real_ip_header X-Forwarded-For;  # 默认X-Real-IP
  
    # 是否递归查找
    real_ip_recursive on;  # 默认off
  
    server {
        location / {
            return 200 "Real IP: $remote_addr\n";
        }
    }
}
```

**变量:**

- `$remote_addr` - 被realip模块修改后的真实IP
- `$realip_remote_addr` - TCP连接的原始源IP
- `$realip_remote_port` - TCP连接的原始源端口

**编译:** `--with-http_realip_module`

#### 3.7.1 配置示例: realip.conf

**用途:** 演示如何通过X-Forwarded-For头部获取客户端真实IP地址,适用于Nginx部署在反向代理或CDN之后的场景

**完整配置:**

```nginx
server {
    server_name realip.taohui.tech;
  
    # 开启debug日志,方便查看realip模块的处理过程
    # 日志中会显示: "realip: \"原始IP\" \"真实IP\""
    error_log logs/myerror.log debug;
  
    # set_real_ip_from指令: 定义可信的代理服务器IP地址
    # 只有来自这些IP的请求,Nginx才会信任其X-Forwarded-For头部
    # 语法: set_real_ip_from address | CIDR | unix:
    # 作用: 防止客户端伪造X-Forwarded-For头部进行IP欺骗
    set_real_ip_from 116.62.160.193;
  
    # 可以配置多个可信代理IP或网段
    # set_real_ip_from 10.0.0.0/8;
    # set_real_ip_from 172.16.0.0/12;
    # set_real_ip_from 192.168.0.0/16;
  
    # real_ip_header指令: 指定从哪个HTTP头部获取真实IP
    # 常见选项:
    #   - X-Real-IP: 单个IP地址(常用于简单代理)
    #   - X-Forwarded-For: IP地址链(常用于多级代理)
    #   - proxy_protocol: 使用PROXY协议
    # real_ip_header X-Real-IP;  # 方式1: 使用X-Real-IP头部
    real_ip_header X-Forwarded-For;  # 方式2: 使用X-Forwarded-For头部(推荐)
  
    # real_ip_recursive指令: 是否递归查找真实IP
    # X-Forwarded-For格式: client, proxy1, proxy2, proxy3
    # 
    # real_ip_recursive off (默认):
    #   - 从右向左取第一个不在set_real_ip_from中的IP
    #   - 例: X-Forwarded-For: 1.1.1.1, 2.2.2.2, 3.3.3.3
    #   - 如果3.3.3.3是可信代理,则取2.2.2.2
    # 
    # real_ip_recursive on:
    #   - 从右向左递归查找,跳过所有可信代理IP
    #   - 例: X-Forwarded-For: 1.1.1.1, 2.2.2.2, 3.3.3.3
    #   - 如果2.2.2.2和3.3.3.3都是可信代理,则取1.1.1.1
    #   - 这样可以穿透多级代理获取真实客户端IP
    # real_ip_recursive off;  # 不递归查找
    real_ip_recursive on;      # 递归查找(推荐用于多级代理)
  
    location / {
        # 返回处理后的客户端IP
        # $remote_addr变量已被realip模块修改为真实IP
        return 200 "Client real ip: $remote_addr\n";
    }
}
```

**关键配置项解释:**

- `set_real_ip_from 116.62.160.193` - 定义可信代理IP

  - 只有来自此IP的请求才会处理X-Forwarded-For
  - 可以配置多个,支持CIDR格式(如 `10.0.0.0/8`)
  - 安全关键: 防止客户端伪造IP地址
- `real_ip_header X-Forwarded-For` - 指定IP来源头部

  - `X-Forwarded-For`: 标准代理头部,格式为 `client, proxy1, proxy2`
  - `X-Real-IP`: 简单代理头部,只包含一个IP
  - `proxy_protocol`: PROXY协议(需要代理支持)
- `real_ip_recursive on` - 递归查找真实IP

  - **off**: 只跳过最后一个可信代理IP
  - **on**: 跳过所有可信代理IP,找到真正的客户端IP
  - 多级代理场景必须开启

**使用场景:**

1. **CDN加速**: Nginx部署在CDN(如Cloudflare、阿里云CDN)之后
2. **负载均衡**: Nginx前面有LVS、HAProxy等四层负载均衡
3. **反向代理链**: 多级Nginx代理架构
4. **安全防护**: 需要基于真实IP进行访问控制、限流、日志记录

**X-Forwarded-For处理示例:**

```bash
# 场景: Client -> CDN -> LB -> Nginx
# X-Forwarded-For: 1.2.3.4, 5.6.7.8, 9.10.11.12

# 配置:
set_real_ip_from 9.10.11.12;  # LB的IP
set_real_ip_from 5.6.7.8;     # CDN的IP
real_ip_recursive on;

# 结果: $remote_addr = 1.2.3.4 (真实客户端IP)
```

**测试方法:**

```bash
# 测试1: 不带X-Forwarded-For头部
curl http://realip.taohui.tech/
# 输出: Client real ip: <你的真实IP>

# 测试2: 带X-Forwarded-For头部(需要从可信IP发起)
# 在116.62.160.193服务器上执行:
curl -H "X-Forwarded-For: 1.2.3.4, 5.6.7.8" http://realip.taohui.tech/
# 输出: Client real ip: 5.6.7.8 (如果real_ip_recursive off)
# 输出: Client real ip: 1.2.3.4 (如果real_ip_recursive on且5.6.7.8是可信IP)

# 测试3: 查看debug日志
tail -f logs/myerror.log | grep realip
# 输出示例: realip: "116.62.160.193" "1.2.3.4"
```

**安全注意事项:**

- **必须配置set_real_ip_from**: 否则任何客户端都可以伪造IP
- **仅信任已知代理**: 不要使用 `set_real_ip_from 0.0.0.0/0`
- **验证代理配置**: 确保上游代理正确设置X-Forwarded-For
- **日志记录**: 使用 `$realip_remote_addr` 记录原始连接IP

**相关变量:**

- `$remote_addr` - 被realip模块修改后的真实客户端IP
- `$realip_remote_addr` - TCP连接的原始源IP(代理IP)
- `$realip_remote_port` - TCP连接的原始源端口

**常见问题:**

1. **Q: 为什么$remote_addr没有变化?**

   - A: 检查请求是否来自 `set_real_ip_from` 配置的可信IP
2. **Q: 多级代理如何配置?**

   - A: 配置所有中间代理IP到 `set_real_ip_from`,并开启 `real_ip_recursive on`
3. **Q: 如何同时记录真实IP和代理IP?**

   - A: 使用 `$remote_addr`(真实IP) 和 `$realip_remote_addr`(代理IP)

### 3.8 REWRITE阶段:rewrite模块

#### 3.8.1 return指令

**功能:** 立即返回响应,终止请求处理

```nginx
# 语法
return code [text];
return code URL;
return URL;

# 示例
location /api {
    return 200 "Success";
    return 404 "Not Found";
    return 301 https://example.com$request_uri;  # 永久重定向
    return 302 /new-location;  # 临时重定向
    return 444;  # Nginx特有,关闭连接不返回响应
}
```

**HTTP重定向状态码:**

| 状态码 | 说明       | 是否缓存 | 是否允许改变方法   |
| ------ | ---------- | -------- | ------------------ |
| 301    | 永久重定向 | 是       | 是(HTTP/1.0不明确) |
| 302    | 临时重定向 | 否       | 是(HTTP/1.0不明确) |
| 303    | 临时重定向 | 否       | 是(明确允许)       |
| 307    | 临时重定向 | 否       | 否(明确禁止)       |
| 308    | 永久重定向 | 是       | 否(明确禁止)       |

#### 3.8.2 rewrite指令

**功能:** 修改请求URI

```nginx
# 语法
rewrite regex replacement [flag];

# flag取值
# last     - 停止处理当前rewrite模块指令,重新匹配location
# break    - 停止处理当前rewrite模块指令,继续处理
# redirect - 返回302临时重定向
# permanent - 返回301永久重定向

# 示例
location /old {
    rewrite ^/old/(.*)$ /new/$1 last;
}

location /new {
    return 200 "New location: $uri\n";
}

# 复杂示例
location /first {
    rewrite ^/first/(.*)$ /second/$1 last;
}

location /second {
    rewrite ^/second/(.*)$ /third/$1 break;
    return 200 "Should not reach here";
}

location /third {
    return 200 "Third: $uri\n";
}
```

**rewrite_log指令:**

```nginx
rewrite_log on;  # 记录rewrite日志到error_log
```

#### 3.8.3 配置示例: return.conf

**用途:** 演示return指令与error_page指令的交互,理解Nginx请求处理的优先级和错误页面机制

**完整配置:**

```nginx
server {
    server_name return.taohui.tech;
    listen 8080;
  
    # root指令: 定义静态文件的根目录
    # 所有静态文件请求都会从html/目录下查找
    root html/;
  
    # error_page指令: 自定义错误页面
    # 语法: error_page code [code...] [=response_code] uri;
    # 
    # 当发生404错误时,Nginx会:
    # 1. 不直接返回404错误页面
    # 2. 内部重定向到 /403.html
    # 3. 返回 /403.html 的内容,但HTTP状态码仍为404
    # 
    # 注意: 这里将404错误映射到403.html是为了演示error_page的工作机制
    # 实际生产中应该映射到合适的错误页面
    error_page 404 /403.html;
  
    # server级别的return指令
    # 返回405状态码(Method Not Allowed - 方法不允许)
    # 
    # 重要: 这个return指令在server块中,但会被location块中的return覆盖
    # Nginx处理优先级: location块 > server块
    # 所以访问 / 路径时,实际返回的是location中的404,而不是这里的405
    return 405;
  
    location / {
        # location级别的return指令
        # 返回404状态码和自定义文本
        # 
        # 执行流程:
        # 1. 客户端访问 http://return.taohui.tech:8080/
        # 2. 匹配到这个location块
        # 3. 执行return 404指令,返回404状态码
        # 4. 触发error_page 404配置
        # 5. 内部重定向到 /403.html
        # 6. 如果/403.html存在,返回其内容(状态码仍为404)
        # 7. 如果/403.html不存在,返回"find nothing!\n"文本
        return 404 "find nothing!\n";
    }
}
```

**关键配置项解释:**

- `root html/` - 静态文件根目录

  - 所有静态文件请求的基础路径
  - 例如请求 `/403.html` 会映射到 `html/403.html`
- `error_page 404 /403.html` - 自定义404错误页面

  - 当发生404错误时,内部重定向到 `/403.html`
  - 这是一个**内部重定向**,客户端不会感知到URL变化
  - 最终返回的HTTP状态码仍然是404(不是200)
  - 可以使用 `error_page 404 =200 /403.html` 来改变返回状态码
- `return 405` (server级别) - 被location覆盖

  - 在server块中定义,但优先级低于location块
  - 只有当请求不匹配任何location时才会执行
  - 本例中,由于有 `location /` 匹配所有请求,所以这个return不会执行
- `return 404 "find nothing!\n"` (location级别) - 实际执行的返回

  - 立即返回404状态码和文本内容
  - 会触发 `error_page 404` 配置
  - 如果 `html/403.html` 存在,会返回该文件内容
  - 如果不存在,会返回 "find nothing!\n" 文本

**执行流程图:**

```mermaid
graph TD
    A[客户端请求 /路径] --> B[匹配location]
    B --> C[location /路径]
    C --> D[执行 return 404 ]
    D --> E{触发 error_page 404}
    E --> F[内部重定向到 /403.html]
    F --> G{}/403.html 是否存在?}
    G --> |存在| H[返回 403.html 内容状态码404]
    G --> |不存在| I[返回 find nothing状态码404]
```

**使用场景:**

1. **自定义错误页面**: 为不同的HTTP错误码提供友好的错误页面
2. **错误页面统一**: 将多个错误码映射到同一个错误页面
3. **错误处理测试**: 测试应用程序对不同HTTP状态码的处理
4. **API接口**: 快速返回特定状态码和消息

**测试方法:**

```bash
# 测试1: 访问根路径
curl -i http://return.taohui.tech:8080/
# 预期: HTTP/1.1 404 Not Found
# 内容: 如果html/403.html存在则返回其内容,否则返回"find nothing!"

# 测试2: 创建403.html文件后再测试
echo "<h1>Custom 404 Error Page</h1>" > html/403.html
curl http://return.taohui.tech:8080/
# 预期: 返回 "<h1>Custom 404 Error Page</h1>", 状态码仍为404

# 测试3: 查看完整的HTTP响应头
curl -i http://return.taohui.tech:8080/
# HTTP/1.1 404 Not Found
# Server: nginx
# Content-Type: text/html
# ...
```

**error_page高级用法:**

```nginx
# 1. 修改返回状态码
error_page 404 =200 /404.html;  # 404错误返回200状态码

# 2. 多个错误码使用同一页面
error_page 500 502 503 504 /50x.html;

# 3. 重定向到外部URL
error_page 404 =301 http://example.com/notfound;

# 4. 使用命名location
error_page 404 @notfound;
location @notfound {
    return 200 "Page not found\n";
}

# 5. 代理到上游服务器处理错误
error_page 404 /404.php;
location = /404.php {
    proxy_pass http://backend;
}
```

**return指令优先级:**

| 位置       | 优先级 | 说明                       |
| ---------- | ------ | -------------------------- |
| location块 | 最高   | 匹配到location后立即执行   |
| server块   | 中等   | 仅当没有location匹配时执行 |
| http块     | 最低   | 很少在http块使用return     |

**注意事项:**

- `return` 指令会立即终止请求处理,不会执行后续指令
- `error_page` 是内部重定向,不是HTTP重定向(客户端看不到URL变化)
- `error_page` 可以与 `try_files` 配合使用
- 自定义错误页面应该放在 `root` 指定的目录下
- 使用 `error_page 404 =200 /404.html` 会改变状态码,可能影响SEO
- 在location中使用return时,server级别的return会被忽略

**常见错误:**

1. **错误页面不存在**: 如果error_page指定的文件不存在,会返回原始错误
2. **循环重定向**: error_page指向的location又触发相同错误,导致循环
3. **状态码混淆**: 使用 `=200` 修改状态码可能导致客户端误判

#### 3.8.4 if指令

**功能:** 条件判断

```nginx
# 语法
if (condition) {
    # 指令
}

# 条件表达式
if ($variable) { }              # 变量非空且非"0"为真
if ($variable = "value") { }    # 字符串相等
if ($variable != "value") { }   # 字符串不等
if ($variable ~ regex) { }      # 正则匹配(大小写敏感)
if ($variable ~* regex) { }     # 正则匹配(大小写不敏感)
if ($variable !~ regex) { }     # 正则不匹配
if (-f $request_filename) { }   # 文件存在
if (!-f $request_filename) { }  # 文件不存在
if (-d $request_filename) { }   # 目录存在
if (-e $request_filename) { }   # 文件/目录/软链接存在
if (-x $request_filename) { }   # 文件可执行

# 示例
location / {
    # 判断User-Agent
    if ($http_user_agent ~ MSIE) {
        return 403 "IE not supported";
    }
  
    # 判断请求方法
    if ($request_method = POST) {
        return 405;
    }
  
    # 判断文件是否存在
    if (!-f $request_filename) {
        return 404;
    }
}
```

#### 3.8.5 配置示例: rewrite.conf

**用途:** 深入演示rewrite指令的四个flag(last、break、redirect、permanent)的区别和使用场景

**完整配置:**

```nginx
server {
    server_name rewrite.taohui.tech;
  
    # rewrite_log指令: 开启rewrite日志
    # 将rewrite指令的执行过程记录到error_log中
    # 日志级别为notice,可以看到URL重写的详细过程
    rewrite_log on;
  
    # error_log指令: 设置错误日志路径和级别
    # notice级别可以记录rewrite_log的输出
    # 日志示例: "rewritten data: \"/second/test\", args: \"\""
    error_log logs/rewrite_error.log notice;
  
    # root指令: 静态文件根目录
    root html/;
  
    # ========== 内部重定向测试: last vs break ==========
  
    location /first {
        # rewrite指令语法: rewrite regex replacement [flag];
        # 
        # flag: last
        # - 停止处理当前location中的后续rewrite指令
        # - 使用重写后的URI重新搜索location(重新进入FIND_CONFIG阶段)
        # - 类似于编程语言中的"continue"或"goto"
        # 
        # 执行流程:
        # 1. 访问 /first/test
        # 2. 匹配到 location /first
        # 3. 执行rewrite,URI变为 /second/test
        # 4. 由于flag是last,重新搜索location
        # 5. 匹配到 location /second
        # 6. 执行 location /second 中的指令
        rewrite /first(.*) /second$1 last;
    
        # 这个return不会执行,因为last会重新搜索location
        return 200 'first!\n';
    }
  
    location /second {
        # flag: break
        # - 停止处理当前location中的后续rewrite指令
        # - 不会重新搜索location,继续在当前location中处理
        # - 类似于编程语言中的"break"
        # 
        # 执行流程:
        # 1. URI已经是 /second/test (从/first重写而来)
        # 2. 执行rewrite,URI变为 /third/test
        # 3. 由于flag是break,不重新搜索location
        # 4. 继续执行当前location中的后续指令
        # 5. 但是return指令会被执行(注意与注释掉的rewrite对比)
        rewrite /second(.*) /third$1 break;
    
        # 注释掉的rewrite: 如果没有break flag,会继续处理
        # rewrite /second(.*) /third$1;
    
        # 这个return会执行,因为break不会跳出location
        # 但由于break已经修改了URI,如果后续有try_files或静态文件处理
        # 会使用新的URI(/third/test)去查找文件
        return 200 'second!\n';
    }
  
    location /third {
        # 这个location不会被访问到(如果从/first进来)
        # 因为 location /second 中使用了break flag
        # break不会重新搜索location
        return 200 'third!\n';
    }
  
    # ========== HTTP重定向测试: redirect vs permanent ==========
  
    location /redirect1 {
        # flag: permanent
        # - 返回301永久重定向
        # - 浏览器会缓存这个重定向
        # - 搜索引擎会更新索引,将旧URL的权重转移到新URL
        # - 适用场景: 网站永久性迁移、URL规范化
        # 
        # 执行流程:
        # 1. 访问 /redirect1/test
        # 2. 捕获组 (.*) 匹配 "/test"
        # 3. 替换为 $1,即 "/test"
        # 4. 返回 301 重定向到 /test
        # 5. 浏览器会缓存此重定向,下次直接访问 /test
        rewrite /redirect1(.*) $1 permanent;
    }
  
    location /redirect2 {
        # flag: redirect
        # - 返回302临时重定向
        # - 浏览器不会缓存(或缓存时间很短)
        # - 搜索引擎不会更新索引
        # - 适用场景: 临时维护、A/B测试、临时跳转
        # 
        # 302 vs 301 的区别:
        # - 301: 永久重定向,SEO权重转移,浏览器缓存
        # - 302: 临时重定向,SEO权重不转移,不缓存
        rewrite /redirect2(.*) $1 redirect;
    }
  
    location /redirect3 {
        # 不带flag的rewrite + 完整URL
        # - 如果replacement以 http:// 或 https:// 开头
        # - 自动返回302临时重定向(等同于redirect flag)
        # - 这是一个隐式的redirect行为
        # 
        # 注意: 这里会重定向到外部URL
        rewrite /redirect3(.*) http://rewrite.taohui.tech$1;
    }
  
    location /redirect4 {
        # 带permanent flag + 完整URL
        # - 返回301永久重定向到指定的完整URL
        # - 可以重定向到不同的域名
        # 
        # 使用场景:
        # - 域名迁移: old-domain.com -> new-domain.com
        # - 协议升级: http:// -> https://
        # - 子域名调整: www.example.com -> example.com
        rewrite /redirect4(.*) http://rewrite.taohui.tech$1 permanent;
    }
}
```

**rewrite flag详细对比:**

| Flag          | 行为                             | 重新搜索location | HTTP状态码 | 使用场景              |
| ------------- | -------------------------------- | ---------------- | ---------- | --------------------- |
| `last`      | 停止当前rewrite,重新搜索location | ✓ 是            | 无(内部)   | URL规范化、内部路由   |
| `break`     | 停止当前rewrite,继续当前location | ✗ 否            | 无(内部)   | 静态文件路径调整      |
| `redirect`  | 返回302临时重定向                | N/A              | 302        | 临时跳转、维护页面    |
| `permanent` | 返回301永久重定向                | N/A              | 301        | 域名迁移、URL永久变更 |

**执行流程图:**

```mermaid
graph TD
    A[访问 /first/test] --> B[匹配 location /first]
    B --> C[rewrite /first.* /second.* last]
    C --> D[重新搜索location]
    D --> E[匹配 location /second]
    E --> F[rewrite /second.* /third.* break]
    F --> G[不重新搜索,继续当前location]
    G --> H[执行 return 200 second!]
    H --> I[返回 second!]
  
    J[访问 /redirect1/test] --> K[匹配 location /redirect1]
    K --> L[rewrite ... permanent]
    L --> M[返回 301 重定向]
    M --> N[浏览器跳转到 /test]
```

**测试方法:**

```bash
# 测试1: last flag - 会重新搜索location
curl http://rewrite.taohui.tech/first/test
# 预期输出: second!
# 说明: /first -> /second (last重新搜索) -> 执行/second的return

# 测试2: break flag - 不会重新搜索location
curl http://rewrite.taohui.tech/second/test
# 预期输出: second!
# 说明: URI被改写为/third,但不重新搜索,继续执行当前location的return

# 测试3: 如果直接访问/third
curl http://rewrite.taohui.tech/third/test
# 预期输出: third!

# 测试4: permanent flag - 301永久重定向
curl -I http://rewrite.taohui.tech/redirect1/test
# 预期: HTTP/1.1 301 Moved Permanently
#       Location: /test

# 测试5: redirect flag - 302临时重定向
curl -I http://rewrite.taohui.tech/redirect2/test
# 预期: HTTP/1.1 302 Found
#       Location: /test

# 测试6: 查看rewrite日志
tail -f logs/rewrite_error.log
# 输出示例:
# [notice] rewritten data: "/second/test", args: ""
# [notice] rewritten data: "/third/test", args: ""
```

**关键概念理解:**

1. **last vs break 的本质区别:**

   - `last`: 重启location匹配流程(FIND_CONFIG阶段)
   - `break`: 停留在当前location,但URI已改变
2. **内部重定向 vs HTTP重定向:**

   - 内部重定向(last/break): 客户端不感知,URL不变,服务器内部处理
   - HTTP重定向(redirect/permanent): 客户端感知,URL改变,浏览器重新请求
3. **301 vs 302 的选择:**

   - 301: 永久性变更,SEO友好,浏览器会缓存
   - 302: 临时性变更,不影响SEO,不缓存

**使用场景:**

1. **last**:

   - URL美化: `/product-123` -> `/product/detail?id=123`
   - 路由重写: `/api/v1/*` -> `/api/v2/*`
   - 多语言路由: `/en/*` -> `/index.php?lang=en&path=*`
2. **break**:

   - 静态文件路径调整: `/images/*` -> `/static/img/*`
   - 防止rewrite循环
   - 与try_files配合使用
3. **redirect (302)**:

   - 网站维护页面
   - A/B测试
   - 临时活动页面跳转
4. **permanent (301)**:

   - HTTP升级到HTTPS
   - 域名迁移
   - URL规范化(www -> non-www)

**注意事项:**

- `last` 和 `break` 最多执行10次rewrite,防止无限循环
- `last` 会重新执行所有HTTP处理阶段(POST_READ、REWRITE、FIND_CONFIG等)
- `break` 只停止REWRITE阶段,继续后续阶段
- 使用 `rewrite_log on` 可以调试rewrite规则
- 301重定向会被浏览器永久缓存,修改时需要清除缓存
- 在location中使用rewrite时,要注意与return、proxy_pass等指令的执行顺序

**常见错误:**

1. **rewrite循环**: 使用last时,新URI又匹配到当前location

   ```nginx
   location /test {
       rewrite ^/test(.*)$ /test$1 last;  # 错误!会无限循环
   }
   ```
2. **break后期望重新搜索location**:

   ```nginx
   location /first {
       rewrite /first /second break;  # 不会跳转到 location /second
   }
   ```
3. **混淆内部重定向和HTTP重定向**:

   - last/break不会改变浏览器地址栏
   - redirect/permanent会改变浏览器地址栏

### 3.9 FIND_CONFIG阶段:location匹配

#### 3.9.1 location语法

```nginx
# 精确匹配
location = /path { }

# 前缀匹配(优先级高,禁止正则)
location ^~ /path { }

# 前缀匹配(普通)
location /path { }

# 正则匹配(大小写敏感)
location ~ regex { }

# 正则匹配(大小写不敏感)
location ~* regex { }

# 命名location(内部跳转)
location @name { }
```

#### 3.9.2 匹配优先级

```mermaid
graph TD
    A[开始匹配] --> B{精确匹配 =}
    B -->|匹配| Z[使用该location]
    B -->|不匹配| C[记录最长前缀匹配]
    C --> D{"最长前缀有 ^~?路径"}
    D -->|是| Z
    D -->|否| E[按顺序尝试正则匹配]
    E --> F{正则匹配成功?}
    F -->|是| Z
    F -->|否| G[使用最长前缀匹配]
    G --> Z
```

**匹配顺序:**

1. 精确匹配 `=` (匹配后立即停止)
2. 前缀匹配 `^~` (匹配后不再尝试正则)
3. 正则匹配 `~` 或 `~*` (按配置文件顺序,匹配后立即停止)
4. 普通前缀匹配(最长匹配)

**示例:**

```nginx
server {
    location = /test {
        return 200 "Exact match\n";
    }
  
    location ^~ /test {
        return 200 "Prefix match (no regex)\n";
    }
  
    location ~ ^/test$ {
        return 200 "Regex match\n";
    }
  
    location /test {
        return 200 "Prefix match\n";
    }
}

# 访问 /test → "Exact match"
# 访问 /test/ → "Prefix match (no regex)"
# 访问 /test123 → "Prefix match"
```

#### 3.9.2 配置示例: locations.conf

**用途:** 通过实际测试演示location匹配的优先级顺序,帮助理解精确匹配、前缀匹配、正则匹配的执行规则

**完整配置:**

```nginx
server {
    server_name location.taohui.tech;
  
    # 开启debug日志,可以看到location匹配的详细过程
    # 日志会显示: "test location: \"/Test1/\""
    error_log logs/error.log debug;
  
    # 注释掉root指令,避免静态文件干扰测试
    # root html/;
  
    # 设置默认Content-Type为text/plain
    # 这样return返回的文本会以纯文本格式显示
    default_type text/plain;
  
    # merge_slashes指令: 是否合并URI中的多个连续斜杠
    # off: 不合并,保留原始URI中的多个斜杠
    # on(默认): 合并多个斜杠为一个
    # 
    # 示例:
    # - merge_slashes off: /Test1//Test2 保持不变
    # - merge_slashes on:  /Test1//Test2 变为 /Test1/Test2
    # 
    # 设置为off是为了精确测试location匹配规则
    merge_slashes off;
  
    # ========== Location匹配优先级测试 ==========
    # 优先级顺序(从高到低):
    # 1. 精确匹配 (=)
    # 2. 前缀匹配-停止正则 (^~)
    # 3. 正则匹配 (~, ~*) - 按配置文件中出现的顺序
    # 4. 前缀匹配 (无修饰符) - 最长匹配优先
  
    # 正则匹配1: 区分大小写,匹配以/Test1/结尾的URI
    # ~ 表示区分大小写的正则匹配
    # /Test1/$ 中的$表示行尾,必须以/Test1/结尾
    # 
    # 匹配示例:
    # ✓ /Test1/
    # ✗ /test1/ (大小写不匹配)
    # ✗ /Test1/abc (不是以/Test1/结尾)
    location ~ /Test1/$ {
        return 200 'first regular expressions match!\n';
    }
  
    # 正则匹配2: 不区分大小写,匹配/Test1/后跟单词字符
    # ~* 表示不区分大小写的正则匹配
    # (\w+) 捕获一个或多个单词字符(字母、数字、下划线)
    # $ 表示行尾
    # 
    # 匹配示例:
    # ✓ /Test1/abc
    # ✓ /test1/ABC (不区分大小写)
    # ✓ /TEST1/test123
    # ✗ /Test1/ (没有单词字符)
    # 
    # 注意: 如果同时匹配多个正则location,使用第一个匹配的
    location ~* /Test1/(\w+)$ {
        return 200 'longest regular expressions match!\n';
    }
  
    # 前缀匹配-停止正则: ^~ 修饰符
    # ^~ 表示如果匹配成功,停止搜索正则表达式location
    # 这是一个"优先级提升"的前缀匹配
    # 
    # 工作原理:
    # 1. 如果URI以/Test1/开头
    # 2. 立即使用这个location,不再尝试正则匹配
    # 3. 即使有正则location也能匹配,也不会执行
    # 
    # 匹配示例:
    # ✓ /Test1/
    # ✓ /Test1/abc
    # ✓ /Test1/Test2
    # 
    # 优先级: 高于正则匹配,低于精确匹配
    location ^~ /Test1/ {
        return 200 'stop regular expressions match!\n';
    }
  
    # 前缀匹配2: 更长的前缀
    # 无修饰符表示普通前缀匹配
    # 如果没有正则匹配,会使用最长的前缀匹配
    # 
    # 匹配示例:
    # ✓ /Test1/Test2
    # ✓ /Test1/Test2/abc
    # 
    # 注意: 这个location比下面的/Test1更长,所以优先级更高
    location /Test1/Test2 {
        return 200 'longest prefix string match!\n';
    }
  
    # 前缀匹配1: 较短的前缀
    # 匹配所有以/Test1开头的URI
    # 
    # 匹配示例:
    # ✓ /Test1
    # ✓ /Test1/
    # ✓ /Test1/abc
    # 
    # 注意: 如果有更长的前缀匹配,会优先使用更长的
    location /Test1 {
        return 200 'prefix string match!\n';
    }
  
    # 精确匹配: = 修饰符
    # 必须完全匹配,一个字符都不能差
    # 这是优先级最高的匹配方式
    # 
    # 匹配示例:
    # ✓ /Test1 (完全匹配)
    # ✗ /Test1/ (多了斜杠)
    # ✗ /Test1/abc (多了路径)
    # ✗ /test1 (大小写不同)
    # 
    # 优先级: 最高,一旦匹配立即使用,不再查找其他location
    location = /Test1 {
        return 200 'exact match!\n';
    }
}
```

**Location匹配优先级详解:**

| 优先级 | 修饰符 | 名称                   | 匹配规则            | 是否继续搜索    |
| ------ | ------ | ---------------------- | ------------------- | --------------- |
| 1      | `=`  | 精确匹配               | URI必须完全相同     | 否,立即使用     |
| 2      | `^~` | 前缀匹配(停止正则)     | URI以指定字符串开头 | 否,停止正则搜索 |
| 3      | `~`  | 正则匹配(区分大小写)   | 正则表达式匹配      | 是,按顺序匹配   |
| 3      | `~*` | 正则匹配(不区分大小写) | 正则表达式匹配      | 是,按顺序匹配   |
| 4      | 无     | 前缀匹配               | URI以指定字符串开头 | 是,继续正则搜索 |

**匹配流程图:**

```mermaid
graph TD
    A[收到请求URI] --> B{是否有精确匹配 =?}
    B -->|是| C[使用精确匹配,结束]
    B -->|否| D[记录最长前缀匹配]
    D --> E{"最长前缀是否有 ^~ ?"}
    E -->|是| F["使用 ^~ 匹配,结束"]
    E -->|否| G[按顺序尝试正则匹配]
    G --> H{是否有正则匹配成功?}
    H -->|是| I[使用第一个匹配的正则,结束]
    H -->|否| J{是否有前缀匹配?}
    J -->|是| K[使用最长前缀匹配,结束]
    J -->|否| L[返回404]
```

**测试方法:**

```bash
# 测试1: 精确匹配 (=) - 优先级最高
curl http://location.taohui.tech/Test1
# 预期输出: exact match!
# 说明: 完全匹配 location = /Test1

# 测试2: 前缀匹配-停止正则 (^~)
curl http://location.taohui.tech/Test1/
# 预期输出: stop regular expressions match!
# 说明: 匹配 location ^~ /Test1/,虽然正则也能匹配,但^~停止了正则搜索

# 测试3: 正则匹配 (~)
# 注意: 由于有 ^~ 匹配,正则实际不会被执行
# 如果注释掉 ^~ location,则会匹配正则
curl http://location.taohui.tech/Test1/
# 当前输出: stop regular expressions match!
# 如果注释掉^~: first regular expressions match!

# 测试4: 最长前缀匹配
curl http://location.taohui.tech/Test1/Test2
# 预期输出: stop regular expressions match!
# 说明: 虽然 /Test1/Test2 是最长前缀,但 ^~ /Test1/ 先匹配并停止搜索

# 测试5: 如果注释掉 ^~ location
# curl http://location.taohui.tech/Test1/Test2
# 预期输出: longest prefix string match!
# 说明: 没有正则匹配,使用最长前缀匹配

# 测试6: 正则匹配(不区分大小写)
# 需要先注释掉 ^~ location
# curl http://location.taohui.tech/test1/abc
# 预期输出: longest regular expressions match!

# 测试7: 查看debug日志
tail -f logs/error.log | grep "test location"
# 输出示例:
# [debug] test location: "="
# [debug] test location: "^~"
# [debug] test location: "~"
```

**实际匹配示例:**

```bash
# 场景1: 访问 /Test1
# 匹配过程:
# 1. 检查精确匹配: location = /Test1 ✓ 匹配成功
# 2. 立即使用,不再继续
# 结果: exact match!

# 场景2: 访问 /Test1/
# 匹配过程:
# 1. 检查精确匹配: location = /Test1 ✗ 不匹配(多了斜杠)
# 2. 查找最长前缀: location ^~ /Test1/ ✓ 匹配
# 3. 由于有^~,停止正则搜索
# 结果: stop regular expressions match!

# 场景3: 访问 /Test1/abc (假设注释掉^~)
# 匹配过程:
# 1. 检查精确匹配: ✗ 无匹配
# 2. 记录最长前缀: location /Test1 ✓
# 3. 没有^~,继续正则搜索
# 4. 正则匹配: location ~* /Test1/(\w+)$ ✓ 匹配
# 5. 使用正则匹配
# 结果: longest regular expressions match!

# 场景4: 访问 /Test1/Test2 (假设注释掉^~和正则)
# 匹配过程:
# 1. 检查精确匹配: ✗ 无匹配
# 2. 查找最长前缀: location /Test1/Test2 ✓ (比/Test1更长)
# 3. 没有正则匹配
# 4. 使用最长前缀匹配
# 结果: longest prefix string match!
```

**使用场景:**

1. **精确匹配 (=)**:

   - 首页: `location = / { }`
   - API端点: `location = /api/health { }`
   - 静态文件: `location = /favicon.ico { }`
2. **前缀匹配-停止正则 (^~)**:

   - 静态资源目录: `location ^~ /static/ { }`
   - 上传目录: `location ^~ /uploads/ { }`
   - 避免被正则误匹配的路径
3. **正则匹配 (~, ~*)**:

   - 文件扩展名: `location ~ \.(jpg|png|gif)$ { }`
   - 动态路由: `location ~ ^/user/(\d+)$ { }`
   - 复杂的URL模式
4. **前缀匹配 (无修饰符)**:

   - API路由: `location /api/ { }`
   - 代理转发: `location /backend/ { }`
   - 通用路径匹配

**注意事项:**

- `merge_slashes off` 会保留URI中的多个斜杠,影响匹配结果
- 正则匹配按配置文件中出现的顺序,第一个匹配的生效
- `^~` 可以提高性能,避免不必要的正则匹配
- 精确匹配性能最好,应优先使用
- location内部可以使用 `@name` 定义命名location,用于内部跳转

**常见错误:**

1. **误以为正则优先级高于前缀**:

   ```nginx
   location /test { }      # 会先记录这个前缀
   location ~ /test { }    # 然后才尝试正则
   ```
2. **忘记 ^~ 的作用**:

   ```nginx
   location ^~ /static/ { }  # 会阻止下面的正则匹配
   location ~ \.(jpg)$ { }   # /static/a.jpg 不会匹配到这里
   ```
3. **正则顺序错误**:

   ```nginx
   location ~ /test { }      # 更通用的正则
   location ~ /test/abc { }  # 永远不会被执行
   ```

### 3.10 PREACCESS阶段:限流限速

#### 3.10.1 limit_conn模块:限制并发连接数

```nginx
http {
    # 定义共享内存区域
    limit_conn_zone $binary_remote_addr zone=addr:10m;
  
    # 设置日志级别
    limit_conn_log_level warn;  # 默认error
  
    # 设置返回状态码
    limit_conn_status 503;  # 默认503
  
    server {
        location /download {
            # 限制每个IP同时只能有1个连接
            limit_conn addr 1;
      
            # 限速(每秒50字节)
            limit_rate 50;
        }
    }
}
```

**关键点:**

- 使用共享内存,对所有Worker进程生效
- 基于变量(通常是 `$binary_remote_addr`)作为key
- `binary_remote_addr` 是二进制格式的IP,IPv4只占4字节

#### 3.10.2 limit_req模块:限制请求速率

**算法:** Leaky Bucket(漏桶算法)

```nginx
http {
    # 定义共享内存区域,限制每分钟2个请求
    limit_req_zone $binary_remote_addr zone=one:10m rate=2r/m;
  
    # 或每秒10个请求
    limit_req_zone $binary_remote_addr zone=two:10m rate=10r/s;
  
    limit_req_log_level warn;
    limit_req_status 503;
  
    server {
        location / {
            # 使用限速区域,允许突发3个请求
            limit_req zone=one burst=3;
      
            # nodelay:不延迟处理突发请求,超出直接拒绝
            limit_req zone=one burst=3 nodelay;
        }
    }
}
```

**Leaky Bucket算法:**

```
突发请求 → [桶(burst)] → 匀速处理(rate)
              ↓
           超出容量
              ↓
           返回503
```

**limit_conn vs limit_req:**

| 模块       | 限制对象   | 典型场景 |
| ---------- | ---------- | -------- |
| limit_conn | 并发连接数 | 下载限制 |
| limit_req  | 请求速率   | API限流  |

**执行顺序:** limit_req先于limit_conn执行

#### 3.10.3 配置示例: limit_conn.conf

**用途:** 演示limit_conn和limit_req模块的综合使用,实现并发连接数限制和请求速率限制,保护服务器资源

**完整配置:**

```nginx
# ========== HTTP块配置: 定义限流的共享内存区域 ==========

# limit_conn_zone指令: 定义用于限制并发连接数的共享内存区域
# 语法: limit_conn_zone key zone=name:size;
# 
# $binary_remote_addr: 使用客户端IP的二进制格式作为key
#   - IPv4: 4字节
#   - IPv6: 16字节
#   - 比$remote_addr(字符串格式)更节省内存
# 
# zone=addr:10m: 定义共享内存区域
#   - 名称: addr
#   - 大小: 10MB
#   - 可存储约160,000个IPv4地址的状态(10MB / 64字节)
#   - 所有worker进程共享这个内存区域
limit_conn_zone $binary_remote_addr zone=addr:10m;

# limit_req_zone指令: 定义用于限制请求速率的共享内存区域
# 语法: limit_req_zone key zone=name:size rate=rate;
# 
# rate=2r/m: 速率限制
#   - 2r/m = 每分钟2个请求 = 平均每30秒1个请求
#   - 也可以使用 r/s (每秒) 或 r/m (每分钟)
#   - 使用Leaky Bucket(漏桶)算法实现
# 
# 内存计算:
#   - 每个IP约占用160字节(包括红黑树节点)
#   - 10MB可以存储约64,000个IP的速率状态
limit_req_zone $binary_remote_addr zone=one:10m rate=2r/m;

server {
    server_name limit.taohui.tech;
  
    # 静态文件根目录
    root html/;
  
    # 错误日志级别设置为info
    # 可以看到limit_conn和limit_req的触发日志
    # 日志示例: "limiting connections by zone \"addr\""
    error_log logs/myerror.log info;
  
    location / {
        # ========== 并发连接数限制配置 ==========
    
        # limit_conn_status: 超过限制时返回的HTTP状态码
        # 默认: 503 Service Unavailable
        # 这里设置为500,可以根据需求自定义(如429 Too Many Requests)
        limit_conn_status 500;
    
        # limit_conn_log_level: 触发限制时的日志级别
        # 可选值: info, notice, warn, error
        # warn: 警告级别,方便在日志中快速定位限流事件
        limit_conn_log_level warn;
    
        # limit_rate: 限制向客户端传输响应的速率
        # 单位: 字节/秒
        # 50: 每秒传输50字节(非常慢,用于测试)
        # 
        # 作用:
        # - 防止单个连接占用过多带宽
        # - 适用于下载限速场景
        # - 对所有响应生效,不区分文件大小
        # 
        # 注意: 这不是请求速率限制,而是响应传输速率限制
        limit_rate 50;
    
        # limit_conn: 限制并发连接数
        # 语法: limit_conn zone number;
        # 
        # addr: 使用前面定义的共享内存区域
        # 1: 每个IP同时只允许1个连接
        # 
        # 工作原理:
        # 1. 请求到达时,在共享内存中查找该IP的连接计数
        # 2. 如果连接数 < 1,允许请求,计数+1
        # 3. 如果连接数 >= 1,拒绝请求,返回limit_conn_status
        # 4. 请求结束时,计数-1
        # 
        # 适用场景:
        # - 防止单个用户建立过多连接
        # - 下载限制(配合limit_rate)
        # - 防止慢速攻击(Slowloris)
        limit_conn addr 1;
    
        # ========== 请求速率限制配置 ==========
    
        # limit_req: 限制请求速率
        # 语法: limit_req zone=name [burst=number] [nodelay | delay=number];
        # 
        # zone=one: 使用前面定义的共享内存区域(rate=2r/m)
        # 
        # 不带burst参数的行为:
        # - 严格按照2r/m的速率处理请求
        # - 超过速率的请求立即被拒绝
        # - 返回503错误(或自定义的limit_req_status)
        # 
        # 示例(rate=2r/m,即30秒1个请求):
        # - t=0s:  请求1 ✓ 允许
        # - t=10s: 请求2 ✗ 拒绝(距离上次请求<30s)
        # - t=30s: 请求3 ✓ 允许
        # - t=35s: 请求4 ✗ 拒绝
        limit_req zone=one;
    
        # 注释掉的带burst参数的配置:
        # limit_req zone=one burst=3 nodelay;
        # 
        # burst=3: 突发请求队列大小
        #   - 允许最多3个请求排队等待
        #   - 超过3个的请求会被拒绝
        # 
        # nodelay: 立即处理突发请求
        #   - 不等待,立即处理队列中的请求
        #   - 但仍然消耗速率配额
        # 
        # 示例(rate=2r/m, burst=3, nodelay):
        # - 同时发送5个请求
        # - 请求1: ✓ 立即处理
        # - 请求2-4: ✓ 放入队列,立即处理(因为nodelay)
        # - 请求5: ✗ 拒绝(超过burst)
        # - 但后续30秒内的请求会被拒绝(配额已用完)
    }
}
```

**limit_conn vs limit_req 对比:**

| 特性     | limit_conn       | limit_req          |
| -------- | ---------------- | ------------------ |
| 限制对象 | 并发连接数       | 请求速率           |
| 计数单位 | 连接数           | 请求数/时间        |
| 算法     | 简单计数器       | Leaky Bucket(漏桶) |
| 典型用途 | 防止连接耗尽     | 防止请求过载       |
| 是否排队 | 否,超过立即拒绝  | 可选(burst参数)    |
| 内存占用 | 较小(~64字节/IP) | 较大(~160字节/IP)  |

**Leaky Bucket算法图解:**

```mermaid
graph TD
    A[新请求到达] --> B{桶中令牌数 > 0?}
    B -->|是| C[消耗1个令牌]
    C --> D[处理请求]
    B -->|否| E{burst队列是否已满?}
    E -->|未满| F[放入队列等待]
    F --> G[等待令牌生成]
    G --> D
    E -->|已满| H[拒绝请求,返回503]
  
    I[令牌生成器] -->|按rate速率| J[向桶中添加令牌]
    J --> B
```

**测试方法:**

```bash
# 测试1: 并发连接数限制(limit_conn addr 1)
# 打开两个终端,同时执行:
curl http://limit.taohui.tech/large_file.zip

# 终端1: 正常下载(速度50字节/秒)
# 终端2: 返回500错误
# 说明: 同一IP只能有1个并发连接

# 测试2: 请求速率限制(limit_req zone=one, rate=2r/m)
# 快速连续发送3个请求:
curl http://limit.taohui.tech/ && \
curl http://limit.taohui.tech/ && \
curl http://limit.taohui.tech/

# 请求1: ✓ 成功
# 请求2: ✗ 503错误(距离请求1 < 30秒)
# 请求3: ✗ 503错误

# 测试3: 等待30秒后再次请求
sleep 30
curl http://limit.taohui.tech/
# ✓ 成功(令牌已恢复)

# 测试4: 查看限流日志
tail -f logs/myerror.log | grep limiting
# 输出示例:
# [warn] limiting connections by zone "addr", client: 192.168.1.100
# [warn] limiting requests, excess: 0.000 by zone "one", client: 192.168.1.100

# 测试5: 使用ab工具压测
ab -n 10 -c 2 http://limit.taohui.tech/
# 会看到大量503错误
```

**使用场景:**

1. **下载限速** (limit_conn + limit_rate):

   ```nginx
   location /downloads {
       limit_conn addr 2;      # 每IP最多2个并发下载
       limit_rate 100k;        # 每连接限速100KB/s
   }
   ```
2. **API速率限制** (limit_req):

   ```nginx
   location /api {
       limit_req zone=api_limit burst=10 nodelay;
       limit_req_status 429;   # 返回429 Too Many Requests
   }
   ```
3. **登录接口保护** (limit_req):

   ```nginx
   location /login {
       limit_req zone=login_limit burst=5;  # 允许5次突发
       limit_req_status 429;
   }
   ```
4. **防止慢速攻击** (limit_conn):

   ```nginx
   location / {
       limit_conn addr 10;     # 每IP最多10个连接
       client_body_timeout 10s;
       client_header_timeout 10s;
   }
   ```

**高级配置:**

```nginx
# 1. 白名单(不限制特定IP)
geo $limit {
    default 1;
    10.0.0.0/8 0;      # 内网不限制
    192.168.1.100 0;   # VIP用户不限制
}
map $limit $limit_key {
    0 "";
    1 $binary_remote_addr;
}
limit_req_zone $limit_key zone=api:10m rate=10r/s;

# 2. 不同URI不同限制
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=strict:10m rate=1r/s;

location /api/public {
    limit_req zone=general burst=20;
}
location /api/sensitive {
    limit_req zone=strict burst=2;
}

# 3. 组合多个限制
location /download {
    limit_conn addr 1;              # 并发连接限制
    limit_req zone=one burst=3;     # 请求速率限制
    limit_rate_after 10m;           # 前10MB不限速
    limit_rate 100k;                # 之后限速100KB/s
}
```

**注意事项:**

- `limit_conn` 统计的是正在处理的连接数,不是历史连接数
- `limit_req` 使用Leaky Bucket算法,平滑处理突发流量
- `burst` 参数不是"允许的额外请求",而是"排队等待的请求"
- `nodelay` 会立即处理突发请求,但仍消耗速率配额
- 共享内存大小要根据实际IP数量规划
- 限流触发时,默认返回503,建议改为429(RFC 6585)
- 在反向代理场景下,应该基于 `$binary_remote_addr` 而非 `$server_addr`

**常见问题:**

1. **Q: limit_conn限制不生效?**

   - A: 检查是否在http块定义了 `limit_conn_zone`
   - A: 确认key变量有值(如 `$binary_remote_addr`)
2. **Q: 为什么设置rate=2r/m,但第2个请求就被拒绝?**

   - A: Leaky Bucket算法是平滑限流,2r/m = 平均30秒1个请求
3. **Q: burst和nodelay的区别?**

   - A: `burst` 定义队列大小,`nodelay` 决定是否立即处理队列请求
4. **Q: 如何查看当前有多少IP被限流?**

   - A: 使用Nginx Plus的API,或者监控error_log中的limiting日志

### 3.11 ACCESS阶段:访问控制

#### 3.11.1 access模块:IP访问控制

```nginx
location / {
    deny 192.168.1.1;
    allow 192.168.1.0/24;
    allow 10.0.0.0/8;
    deny all;
}
```

**规则:**

- 按顺序匹配,匹配后立即停止
- 支持IPv4、IPv6、CIDR、all

#### 3.11.2 auth_basic模块:HTTP Basic认证

```nginx
location /admin {
    auth_basic "Admin Area";
    auth_basic_user_file /etc/nginx/.htpasswd;
}
```

**生成密码文件:**

```bash
# 安装工具
yum install httpd-tools

# 生成密码文件
htpasswd -c /etc/nginx/.htpasswd username

# 添加用户
htpasswd /etc/nginx/.htpasswd another_user
```

**协议流程:**

```mermaid
sequenceDiagram
    Client->>Nginx: GET /admin
    Nginx->>Client: 401 Unauthorized<br/>WWW-Authenticate: Basic realm="Admin Area"
    Client->>Client: 弹出用户名密码输入框
    Client->>Nginx: GET /admin<br/>Authorization: Basic base64(user:pass)
    Nginx->>Nginx: 验证用户名密码
    alt 验证成功
        Nginx->>Client: 200 OK
    else 验证失败
        Nginx->>Client: 401 Unauthorized
    end
```

#### 3.11.3 auth_request模块:第三方认证

```nginx
location / {
    auth_request /auth;
    # 认证通过才能访问
}

location = /auth {
    internal;  # 仅内部访问
    proxy_pass http://auth-server;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
}
```

**工作流程:**

1. 收到请求,生成子请求到 `/auth`
2. 根据子请求的响应码决定是否放行:
   - 2xx → 放行
   - 401/403 → 拒绝

**编译:** `--with-http_auth_request_module`

#### 3.11.4 satisfy指令:组合访问控制

```nginx
location / {
    satisfy all;  # 默认,所有ACCESS模块都必须通过
    # satisfy any;  # 任意一个ACCESS模块通过即可
  
    allow 192.168.1.0/24;
    deny all;
  
    auth_basic "Login";
    auth_basic_user_file /etc/nginx/.htpasswd;
}
```

**satisfy all流程:**

```mermaid
graph TD
    A[请求] --> B{access模块}
    B -->|拒绝| Z[返回403]
    B -->|通过| C{auth_basic模块}
    C -->|拒绝| Z
    C -->|通过| D{auth_request模块}
    D -->|拒绝| Z
    D -->|通过| E[继续处理]
```

**satisfy any流程:**

```mermaid
graph TD
    A[请求] --> B{access模块}
    B -->|通过| E[继续处理]
    B -->|拒绝| C{auth_basic模块}
    C -->|通过| E
    C -->|拒绝| D{auth_request模块}
    D -->|通过| E
    D -->|拒绝| Z[返回403]
```

#### 3.11.5 配置示例: access.conf

**用途:** 演示ACCESS阶段的三种认证方式(auth_basic、auth_request、satisfy)的综合使用,实现灵活的访问控制策略

**完整配置:**

```nginx
server {
    server_name access.taohui.tech;
  
    # 开启debug日志,查看ACCESS阶段的执行过程
    # 日志会显示: "access phase: 7"
    error_log logs/error.log debug;
  
    # 注释掉root指令,避免静态文件干扰测试
    # root html/;
  
    # 设置默认Content-Type
    default_type text/plain;
  
    # ========== Location 1: auth_basic + satisfy any ==========
  
    location /auth_basic {
        # satisfy指令: 控制多个ACCESS模块的组合逻辑
        # any: 任意一个模块通过即可(OR逻辑)
        # all(默认): 所有模块都必须通过(AND逻辑)
        # 
        # 使用场景:
        # - 内网IP可以直接访问,外网IP需要认证
        # - 提供多种认证方式,用户可选其一
        satisfy any;
    
        # auth_basic指令: HTTP Basic认证
        # 语法: auth_basic string | off;
        # 
        # "test auth_basic": 认证域(realm)名称
        #   - 会显示在浏览器的认证对话框中
        #   - 用于标识受保护的资源区域
        # 
        # 工作流程:
        # 1. 客户端首次访问,Nginx返回401 Unauthorized
        # 2. 响应头包含: WWW-Authenticate: Basic realm="test auth_basic"
        # 3. 浏览器弹出用户名/密码输入框
        # 4. 用户输入后,浏览器发送 Authorization: Basic base64(user:pass)
        # 5. Nginx验证用户名密码,通过则允许访问
        auth_basic "test auth_basic";
    
        # auth_basic_user_file指令: 指定密码文件路径
        # 文件格式: username:encrypted_password
        # 
        # 密码加密方式:
        # - crypt(): Unix标准加密(不推荐,不安全)
        # - apr1: Apache MD5(推荐)
        # - {PLAIN}: 明文(仅用于测试)
        # - {SHA}: SHA-1(不推荐)
        # 
        # 生成密码文件:
        # htpasswd -c examples/auth.pass username
        # htpasswd -b examples/auth.pass username password
        auth_basic_user_file examples/auth.pass;
    
        # deny all: 拒绝所有IP访问
        # 
        # 注意: 由于satisfy any,这个规则不会生效
        # 因为auth_basic已经提供了认证方式
        # 
        # 逻辑: deny all OR auth_basic = 只要auth_basic通过即可
        # 
        # 如果改为satisfy all:
        # 逻辑: deny all AND auth_basic = 永远无法访问(deny all总是拒绝)
        deny all;
    }
  
    # ========== Location 2: auth_request第三方认证 ==========
  
    location / {
        # auth_request指令: 使用子请求进行认证
        # 语法: auth_request uri | off;
        # 
        # /test_auth: 认证子请求的URI
        #   - Nginx会向这个URI发送子请求
        #   - 如果子请求返回2xx,认证通过
        #   - 如果子请求返回401/403,认证失败
        #   - 其他状态码视为错误
        # 
        # 工作流程:
        # 1. 客户端访问 /
        # 2. Nginx发起子请求到 /test_auth
        # 3. /test_auth location将请求代理到认证服务器
        # 4. 认证服务器返回2xx(通过)或401/403(拒绝)
        # 5. 根据认证结果决定是否允许访问
        # 
        # 优势:
        # - 集中式认证:多个location共享同一认证逻辑
        # - 灵活性高:可以实现复杂的认证逻辑(JWT、OAuth等)
        # - 与现有认证系统集成
        auth_request /test_auth;
    }
  
    # ========== Location 3: auth_request认证端点 ==========
  
    location = /test_auth {
        # 这是一个内部location,仅用于auth_request子请求
        # 不应该被外部直接访问(虽然这里没有设置internal)
    
        # proxy_pass: 将认证请求转发到上游认证服务器
        # http://127.0.0.1:8090/auth_upstream: 认证服务器地址
        # 
        # 认证服务器需要实现:
        # - 检查请求头中的认证信息(如Cookie、Token)
        # - 返回2xx表示认证通过
        # - 返回401/403表示认证失败
        proxy_pass http://127.0.0.1:8090/auth_upstream;
    
        # proxy_pass_request_body off: 不转发原始请求的body
        # 原因:
        # - 认证通常只需要检查头部信息
        # - 不转发body可以提高性能
        # - 避免认证服务器接收大量无用数据
        proxy_pass_request_body off;
    
        # proxy_set_header Content-Length "": 清空Content-Length头
        # 原因:
        # - 由于不转发body,原始的Content-Length已经无效
        # - 必须清空,否则上游服务器可能等待body数据
        proxy_set_header Content-Length "";
    
        # proxy_set_header X-Original-URI $request_uri: 传递原始URI
        # 作用:
        # - 让认证服务器知道用户访问的是哪个URI
        # - 可以实现基于URI的权限控制
        # - 例如: /admin/* 需要管理员权限
        proxy_set_header X-Original-URI $request_uri;
    }
}
```

**ACCESS阶段模块执行顺序:**

| 顺序 | 模块                | 功能           | 返回值           |
| ---- | ------------------- | -------------- | ---------------- |
| 1    | access (allow/deny) | IP访问控制     | 403 Forbidden    |
| 2    | auth_basic          | HTTP Basic认证 | 401 Unauthorized |
| 3    | auth_request        | 第三方认证     | 401/403          |

**satisfy指令行为对比:**

| satisfy    | 逻辑 | 说明                 | 适用场景          |
| ---------- | ---- | -------------------- | ----------------- |
| all (默认) | AND  | 所有模块都必须通过   | 多重认证,安全性高 |
| any        | OR   | 任意一个模块通过即可 | 提供多种认证方式  |

**测试方法:**

```bash
# 测试1: auth_basic认证(satisfy any)
curl http://access.taohui.tech/auth_basic
# 预期: 401 Unauthorized
# 响应头: WWW-Authenticate: Basic realm="test auth_basic"

# 测试2: 使用正确的用户名密码
curl -u username:password http://access.taohui.tech/auth_basic
# 预期: 200 OK (如果密码文件中有此用户)

# 测试3: 查看认证头部
echo -n "username:password" | base64
# 输出: dXNlcm5hbWU6cGFzc3dvcmQ=

curl -H "Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=" \
     http://access.taohui.tech/auth_basic
# 预期: 200 OK

# 测试4: auth_request认证
# 需要先启动认证服务器(监听8090端口)
curl http://access.taohui.tech/
# 预期: 取决于认证服务器的返回

# 测试5: 使用Cookie或Token认证
curl -H "Cookie: session=abc123" http://access.taohui.tech/
# 认证服务器会检查Cookie并返回相应状态码

# 测试6: 查看debug日志
tail -f logs/error.log | grep "access phase"
# 输出示例:
# [debug] access phase: 7
# [debug] auth basic: "username"
```

**生成密码文件:**

```bash
# 方法1: 使用htpasswd工具(推荐)
# 安装httpd-tools(CentOS)或apache2-utils(Ubuntu)
yum install httpd-tools
# 或
apt-get install apache2-utils

# 创建密码文件并添加第一个用户
htpasswd -c examples/auth.pass admin
# 输入密码: ****

# 添加更多用户(不使用-c参数)
htpasswd examples/auth.pass user1
htpasswd examples/auth.pass user2

# 方法2: 使用openssl生成(无需httpd-tools)
# 生成apr1格式的密码
echo "admin:$(openssl passwd -apr1 mypassword)" >> examples/auth.pass

# 方法3: 使用Python生成
python3 -c "import crypt; print('admin:' + crypt.crypt('mypassword', crypt.mksalt(crypt.METHOD_MD5)))"

# 查看密码文件
cat examples/auth.pass
# 输出示例:
# admin:$apr1$xxx$yyy
# user1:$apr1$aaa$bbb
```

**认证服务器示例(Python Flask):**

```python
from flask import Flask, request

app = Flask(__name__)

@app.route('/auth_upstream')
def auth():
    # 检查Cookie中的session
    session = request.cookies.get('session')
  
    # 检查Authorization头
    auth_header = request.headers.get('Authorization')
  
    # 获取原始URI
    original_uri = request.headers.get('X-Original-URI')
  
    # 简单的认证逻辑
    if session == 'valid_session_id':
        return '', 200  # 认证通过
    elif auth_header and auth_header.startswith('Bearer '):
        token = auth_header[7:]
        if token == 'valid_token':
            return '', 200
  
    # 认证失败
    return '', 401

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8090)
```

**使用场景:**

1. **内网免认证,外网需认证** (satisfy any + allow + auth_basic):

   ```nginx
   location /admin {
       satisfy any;
       allow 10.0.0.0/8;      # 内网直接通过
       deny all;              # 外网被拒绝
       auth_basic "Admin";    # 但可以通过认证
       auth_basic_user_file /etc/nginx/.htpasswd;
   }
   ```
2. **JWT Token认证** (auth_request):

   ```nginx
   location /api {
       auth_request /auth/validate;
       auth_request_set $user $upstream_http_x_user;
       proxy_set_header X-User $user;
       proxy_pass http://backend;
   }
   ```
3. **多重认证** (satisfy all):

   ```nginx
   location /secure {
       satisfy all;
       allow 192.168.1.0/24;  # 必须是内网IP
       deny all;
       auth_basic "Secure";   # 并且需要认证
       auth_basic_user_file /etc/nginx/.htpasswd;
   }
   ```

**注意事项:**

- `auth_basic` 的密码是Base64编码,不是加密,容易被截获,建议使用HTTPS
- `auth_request` 的子请求不会转发原始请求的body,只转发头部
- `satisfy any` 时,只要有一个模块通过即可,其他模块的拒绝会被忽略
- `satisfy all` 时,所有模块必须通过,任何一个拒绝都会导致请求被拒绝
- `auth_request` 模块需要编译时添加 `--with-http_auth_request_module`
- 密码文件的权限应设置为600,避免被其他用户读取

**常见问题:**

1. **Q: auth_basic一直提示401?**

   - A: 检查密码文件路径是否正确
   - A: 确认密码文件格式正确(username:encrypted_password)
   - A: 验证密码加密方式(推荐使用apr1)
2. **Q: auth_request不生效?**

   - A: 确认编译时包含了auth_request模块
   - A: 检查认证服务器是否正常运行
   - A: 查看error_log中的子请求日志
3. **Q: satisfy any时,为什么deny all没有生效?**

   - A: 这是正常的,satisfy any表示任意一个模块通过即可
   - A: auth_basic通过后,deny all的拒绝会被忽略
4. **Q: 如何在auth_request中传递认证信息到后端?**

   - A: 使用 `auth_request_set` 指令捕获上游响应头
   - A: 使用 `proxy_set_header` 将信息传递给后端

### 3.12 PRECONTENT阶段

#### 3.12.1 try_files指令

**功能:** 按顺序尝试访问文件,都不存在时跳转到最后一个URI或返回状态码

```nginx
# 语法
try_files file1 file2 ... uri;
try_files file1 file2 ... =code;

# 示例1:WordPress
location / {
    try_files $uri $uri/ /index.php?$args;
}

# 示例2:静态文件优先,不存在则代理
location / {
    try_files $uri $uri/ @proxy;
}

location @proxy {
    proxy_pass http://backend;
}

# 示例3:维护模式
location / {
    try_files /maintenance.html $uri $uri/ /index.html;
}
```

**注意事项:**

- 最后一个参数是URI或状态码
- 文件路径由 `root` 或 `alias` 指定
- 常用于静态文件优先,动态请求降级

#### 3.12.2 配置示例: tryfiles.conf

**用途:** 演示try_files指令的使用,实现文件查找降级和命名location跳转

**完整配置:**

```nginx
server {
    server_name tryfiles.taohui.tech;
    error_log logs/myerror.log info;
    root html/;
    default_type text/plain;
  
    location /first {
        # try_files: 按顺序尝试文件,最后跳转到命名location
        # 1. /system/maintenance.html - 维护页面
        # 2. $uri - 请求的原始URI
        # 3. $uri/index.html - URI作为目录,查找index.html
        # 4. $uri.html - URI加.html后缀
        # 5. @lasturl - 都不存在则跳转到命名location
        try_files /system/maintenance.html
                  $uri $uri/index.html $uri.html
                  @lasturl;
    }
  
    # 命名location: 使用@前缀
    # 只能被内部跳转访问(如try_files、error_page)
    location @lasturl {
        return 200 'lasturl!\n';
    }
  
    location /second {
        # try_files最后一个参数为状态码
        # 如果所有文件都不存在,返回404
        try_files $uri $uri/index.html $uri.html =404;
    }
}
```

**关键点:** try_files按顺序查找文件,支持命名location和状态码作为fallback。

#### 3.12.3 配置示例: mirror.conf

**用途:** 演示mirror模块的流量镜像功能,用于测试环境流量复制

**完整配置:**

```nginx
# 镜像服务器: 接收复制的流量
server {
    listen 10020;
    location / {
        return 200 'mirror response!';
    }
}
```

**关键点:** mirror模块可以将生产流量实时复制到测试环境,用于灰度测试和压力测试。

#### 3.12.4 mirror模块:流量复制

**功能:** 实时复制请求到其他服务器(测试环境/灰度环境)

```nginx
location / {
    mirror /mirror;
    mirror_request_body on;  # 默认on,复制请求体
}

location = /mirror {
    internal;
    proxy_pass http://test_backend$request_uri;
}
```

**特点:**

- 不等待镜像请求的响应
- 不影响主请求的处理
- 适用于灰度测试、压力测试

**编译:** 默认编译,可用 `--without-http_mirror_module` 禁用

### 3.13 CONTENT阶段:内容生成

#### 3.13.1 static模块:root vs alias

```nginx
# root:拼接location路径
location /static {
    root /data;
    # 访问 /static/file.txt
    # 实际文件 /data/static/file.txt
}

# alias:替换location路径
location /static {
    alias /data/files;
    # 访问 /static/file.txt
    # 实际文件 /data/files/file.txt
}
```

**区别:**

| 指令  | URL映射 | context                    | 默认值 |
| ----- | ------- | -------------------------- | ------ |
| root  | 拼接    | http, server, location, if | html   |
| alias | 替换    | location                   | 无     |

**static模块变量:**

```nginx
location / {
    return 200 "
        request_filename: $request_filename
        document_root: $document_root
        realpath_root: $realpath_root
    ";
}
```

- `$request_filename` - 完整文件路径
- `$document_root` - root/alias指定的目录
- `$realpath_root` - 解析软链接后的真实目录

**其他配置:**

```nginx
location / {
    root /data;
  
    # MIME类型映射
    types {
        text/html html htm;
        image/jpeg jpg jpeg;
    }
    types_hash_max_size 2048;
    types_hash_bucket_size 64;
  
    # 默认MIME类型
    default_type application/octet-stream;
  
    # 是否记录文件不存在的日志
    log_not_found off;
}
```

**目录访问重定向:**

```nginx
# 访问目录但URL不以/结尾时,返回301重定向
location /docs {
    root /data;
  
    # 控制重定向行为
    absolute_redirect on;   # 默认on,返回完整URL
    server_name_in_redirect off;  # 默认off,使用请求中的Host
    port_in_redirect on;    # 默认on,包含端口号
}
```

#### 3.13.2 index模块

```nginx
location / {
    root /data;
    index index.html index.htm;
}

# 访问 / 时,依次尝试:
# 1. /data/index.html
# 2. /data/index.htm
```

**注意:** index模块优先于autoindex模块执行

#### 3.13.3 autoindex模块:目录列表

```nginx
location /files {
    root /data;
    autoindex on;               # 开启目录列表
    autoindex_exact_size off;   # 显示文件大小(off:KB/MB, on:字节)
    autoindex_localtime on;     # 使用本地时间
    autoindex_format html;      # 格式:html/xml/json/jsonp
}
```

**效果:** 类似Apache的目录浏览功能

#### 3.13.4 concat模块:合并小文件

**功能:** 一次请求返回多个文件内容(阿里巴巴开源)

```nginx
location /static {
    concat on;
    concat_max_files 20;
    concat_types text/css application/javascript;
    concat_delimiter "\n;;;;\n";
    concat_ignore_file_error on;
}

# 访问方式
# /static/??file1.js,file2.js,file3.js
```

**编译:**

```bash
git clone https://github.com/alibaba/nginx-http-concat
./configure --add-module=/path/to/nginx-http-concat
make && make install
```

#### 3.13.5 配置示例: static.conf (root vs alias)

**用途:** 演示root和alias指令的区别,以及static模块提供的变量

**完整配置:**

```nginx
server {
    server_name static.taohui.tech;
    error_log logs/myerror.log info;
  
    # root指令: 拼接location路径
    # 访问/root/test.html -> 文件路径: html + /root/test.html = html/root/test.html
    location /root {
        root html;
    }
  
    # alias指令: 替换location路径
    # 访问/alias/test.html -> 文件路径: html (替换/alias) = html/test.html
    location /alias {
        alias html;
    }
  
    # root + 正则: 捕获组不能用于root路径
    # 这个配置是错误的示例,root不支持变量
    location ~ /root/(\w+\.txt) {
        root html/first/$1;  # 错误!$1不会被替换
    }
  
    # alias + 正则: 捕获组可以用于alias路径
    # 访问/alias/test.txt -> html/first/test.txt
    location ~ /alias/(\w+\.txt) {
        alias html/first/$1;  # 正确!$1会被替换为test.txt
    }
  
    # static模块变量演示
    location /RealPath/ {
        alias html/realpath/;
        # $request_filename: 请求文件的完整路径
        # $document_root: root或alias指令的值
        # $realpath_root: 解析软链接后的真实路径
        return 200 '$request_filename:$document_root:$realpath_root\n';
    }
}
```

**关键点:** root拼接路径,alias替换路径;alias支持变量,root不支持。

#### 3.13.6 配置示例: dirredirect.conf (目录重定向)

**用途:** 演示访问目录时的301重定向行为,以及相关控制指令

**完整配置:**

```nginx
server {
    server_name return.taohui.tech dir.taohui.tech;
    # 重定向时使用server_name中的第一个域名
    server_name_in_redirect on;
    listen 8088;
    # 重定向URL中包含端口号
    port_in_redirect on;
    # 返回绝对路径的重定向(默认on)
    # absolute_redirect off;  # 如果off,返回相对路径
  
    root html/;
}
```

**关键点:** 访问目录不带斜杠时,Nginx自动返回301重定向添加斜杠。

#### 3.13.7 配置示例: autoindex.conf (目录索引)

**用途:** 演示autoindex模块的目录列表功能和相关配置

**完整配置:**

```nginx
server {
    server_name autoindex.taohui.tech;
    listen 8080;
  
    location / {
        alias html/;
        # 开启目录索引功能
        autoindex on;
        # index指令: 优先查找的索引文件
        # 如果a.html存在,返回a.html内容,不显示目录列表
        index a.html;
        # 文件大小显示格式: off=KB/MB/GB, on=字节
        autoindex_exact_size off;
        # 输出格式: html/xml/json/jsonp
        autoindex_format html;
        # 时间显示: on=本地时间, off=GMT时间
        autoindex_localtime on;
    }
}
```

**关键点:** autoindex提供类似Apache的目录浏览功能,index文件优先。

#### 3.13.8 配置示例: concat.conf (文件合并)

**用途:** 演示阿里巴巴concat模块,合并多个小文件减少HTTP请求

**完整配置:**

```nginx
server {
    server_name concat.taohui.tech;
    error_log logs/myerror.log debug;
    # 全局开启concat功能
    concat on;
    root html;
  
    location /concat {
        # 最多合并20个文件
        concat_max_files 20;
        # 只合并text/plain类型的文件
        concat_types text/plain;
        # 去重: 相同文件只返回一次
        concat_unique on;
        # 文件之间的分隔符
        concat_delimiter ':::';
        # 忽略文件不存在的错误,继续处理其他文件
        concat_ignore_file_error on;
    }
}
```

**使用:** 访问 `/concat/??file1.txt,file2.txt,file3.txt` 返回合并后的内容。

### 3.14 LOG阶段:access_log详解

#### 3.14.1 log_format指令

```nginx
http {
    # 定义日志格式
    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent"';
  
    # JSON格式
    log_format json escape=json '{'
        '"time":"$time_iso8601",'
        '"remote_addr":"$remote_addr",'
        '"request":"$request",'
        '"status":$status,'
        '"body_bytes_sent":$body_bytes_sent,'
        '"http_referer":"$http_referer",'
        '"http_user_agent":"$http_user_agent"'
    '}';
}
```

#### 3.14.2 access_log指令

```nginx
http {
    # 全局日志
    access_log /var/log/nginx/access.log main;
  
    server {
        # server级别日志
        access_log /var/log/nginx/server.log;
  
        location / {
            # location级别日志
            access_log /var/log/nginx/location.log;
      
            # 条件记录
            access_log /var/log/nginx/post.log main if=$request_method=POST;
      
            # 缓冲
            access_log /var/log/nginx/buffered.log main buffer=32k flush=5s;
      
            # 压缩
            access_log /var/log/nginx/compressed.log main gzip=5 buffer=64k;
      
            # 关闭日志
            access_log off;
        }
    }
}
```

**参数说明:**

| 参数             | 说明                      |
| ---------------- | ------------------------- |
| `buffer=size`  | 缓冲区大小,满了才写入磁盘 |
| `flush=time`   | 最长缓冲时间              |
| `gzip[=level]` | 压缩级别(1-9)             |
| `if=condition` | 条件记录                  |

**open_log_file_cache:**

```nginx
http {
    # 缓存日志文件句柄(路径包含变量时有用)
    open_log_file_cache max=1000 inactive=20s valid=1m min_uses=2;
}
```

### 3.15 HTTP过滤模块

#### 3.15.1 过滤模块调用流程

```mermaid
graph TD
    A[Content模块生成响应] --> B[Header Filter链]
    B --> C[Body Filter链]
  
    B --> B1[copy_filter]
    B1 --> B2[postpone_filter]
    B2 --> B3[header_filter]
    B3 --> B4[write_filter]
  
    C --> C1[copy_filter]
    C1 --> C2[gzip_filter]
    C2 --> C3[charset_filter]
    C3 --> C4[sub_filter]
    C4 --> C5[addition_filter]
    C5 --> C6[write_filter]
```

**关键过滤模块:**

| 模块            | 功能               | 位置   |
| --------------- | ------------------ | ------ |
| copy_filter     | 复制响应内容到内存 | 最底层 |
| postpone_filter | 处理子请求         | 底层   |
| header_filter   | 构造响应头         | 中层   |
| gzip_filter     | Gzip压缩           | 中层   |
| sub_filter      | 字符串替换         | 上层   |
| addition_filter | 添加内容           | 上层   |
| write_filter    | 发送响应           | 最顶层 |

**模块顺序:** 在 `ngx_modules.c` 中从下往上执行

#### 3.15.2 sub模块:字符串替换

```nginx
location / {
    sub_filter 'nginx.org' 'example.com';
    sub_filter 'NGINX' 'Example' i;  # 忽略大小写
    sub_filter_once off;  # 替换所有匹配(默认只替换一次)
    sub_filter_last_modified off;  # 不保留Last-Modified
    sub_filter_types text/html text/css;  # 指定MIME类型
}
```

**编译:** `--with-http_sub_module`

#### 3.15.3 addition模块:添加内容

```nginx
location / {
    add_before_body /header.html;
    add_after_body /footer.html;
    addition_types text/html;
}

location = /header.html {
    internal;
    return 200 "<header>Header Content</header>";
}

location = /footer.html {
    internal;
    return 200 "<footer>Footer Content</footer>";
}
```

**编译:** `--with-http_addition_module`

#### 3.15.4 配置示例: sub.conf (字符串替换)

**用途:** 演示sub_filter模块的字符串替换功能

**完整配置:**

```nginx
server {
    server_name sub.taohui.tech;
    error_log logs/myerror.log info;
  
    location / {
        # sub_filter: 替换响应体中的字符串
        # 第一个参数: 要替换的字符串(支持变量)
        # 第二个参数: 替换后的字符串
        # 注意: 大小写敏感,Nginx.oRg只匹配完全相同的大小写
        sub_filter 'Nginx.oRg' '$host/nginx';
        sub_filter 'nginX.cOm' '$host/nginx';
    
        # sub_filter_once: 是否只替换第一次匹配
        # on(默认): 只替换第一次出现
        # off: 替换所有出现
        sub_filter_once off;
    
        # sub_filter_last_modified: 是否保留Last-Modified头
        # on: 保留(客户端可能使用缓存)
        # off: 移除(强制客户端重新获取)
        sub_filter_last_modified on;
    }
}
```

**关键点:** sub_filter用于响应内容的字符串替换,常用于URL重写和品牌替换。

#### 3.15.5 配置示例: addition.conf (添加内容)

**用途:** 演示addition_filter模块在响应前后添加内容

**完整配置:**

```nginx
server {
    server_name addition.taohui.tech;
    error_log logs/myerror.log info;
  
    location / {
        # add_before_body: 在响应体前添加内容(通过子请求)
        add_before_body /before_action;
        # add_after_body: 在响应体后添加内容(通过子请求)
        add_after_body /after_action;
        # addition_types: 指定生效的MIME类型,*表示所有类型
        addition_types *;
    }
  
    # 子请求location: 返回要添加的内容
    location /before_action {
        return 200 'new content before\n';
    }
    location /after_action {
        return 200 'new content after\n';
    }
  
    # 变量测试location
    location /testhost {
        # uninitialized_variable_warn: 未初始化变量是否警告
        uninitialized_variable_warn on;
        set $foo 'testhost';
        # $gzip_ratio: gzip压缩比例(仅在gzip开启时有值)
        return 200 '$gzip_ratio\n';
    }
}
```

**关键点:** addition模块通过子请求在响应前后添加内容,常用于统一的页眉页脚。

### 3.16 Nginx变量

#### 3.16.1 变量的运行原理

```mermaid
graph LR
    A[提供变量的模块] -->|pre_configuration| B[注册变量名和取值方法]
    B --> C[变量哈希表]
    D[使用变量的模块] -->|解析配置| E[记录变量名]
    F[请求到达] --> G[执行取值方法]
    G --> H[返回变量值]
    C --> G
    E --> G
```

**核心特性:**

1. **惰性求值** - 只有使用时才计算值
2. **值可变** - 同一请求中,变量值可能随时间变化

**变量哈希表配置:**

```nginx
http {
    variables_hash_max_size 1024;
    variables_hash_bucket_size 64;
}
```

#### 3.16.2 HTTP框架提供的变量

**请求相关:**

| 变量                        | 说明                              |
| --------------------------- | --------------------------------- |
| `$arg_name`               | URL参数                           |
| `$args`                   | 完整查询字符串                    |
| `$is_args`                | 有参数时为"?",否则为空            |
| `$query_string` | 同$args |                                   |
| `$uri`                    | 当前URI(不含参数)                 |
| `$request_uri`            | 原始URI(含参数)                   |
| `$request`                | 完整请求行                        |
| `$request_method`         | 请求方法                          |
| `$request_length`         | 请求长度(含头部和body)            |
| `$request_body`           | 请求体(需特殊配置)                |
| `$request_body_file`      | 请求体临时文件路径                |
| `$content_length`         | Content-Length头部                |
| `$content_type`           | Content-Type头部                  |
| `$http_name`              | 任意请求头(name小写,横线改下划线) |
| `$http_host`              | Host头部                          |
| `$http_user_agent`        | User-Agent头部                    |
| `$http_referer`           | Referer头部                       |
| `$http_cookie`            | Cookie头部                        |
| `$cookie_name`            | 指定Cookie值                      |

**TCP连接相关:**

| 变量                     | 说明                             |
| ------------------------ | -------------------------------- |
| `$remote_addr`         | 客户端IP                         |
| `$remote_port`         | 客户端端口                       |
| `$binary_remote_addr`  | 二进制格式的客户端IP             |
| `$server_addr`         | 服务器IP                         |
| `$server_port`         | 服务器端口                       |
| `$connection`          | 连接序号                         |
| `$connection_requests` | 当前连接的请求数                 |
| `$proxy_protocol_addr` | Proxy Protocol协议中的客户端IP   |
| `$proxy_protocol_port` | Proxy Protocol协议中的客户端端口 |

**处理过程相关:**

| 变量                    | 说明                        |
| ----------------------- | --------------------------- |
| `$request_time`       | 请求处理时间(秒,精确到毫秒) |
| `$request_completion` | 请求是否完成("OK"或空)      |
| `$request_id`         | 唯一请求ID(16字节随机数)    |
| `$request_filename`   | 待访问文件的完整路径        |
| `$document_root`      | root/alias指定的目录        |
| `$realpath_root`      | 解析软链接后的真实目录      |
| `$limit_rate`         | 响应速率限制(字节/秒)       |

**响应相关:**

| 变量                 | 说明           |
| -------------------- | -------------- |
| `$status`          | 响应状态码     |
| `$body_bytes_sent` | 响应body字节数 |
| `$bytes_sent`      | 响应总字节数   |
| `$sent_http_name`  | 任意响应头     |

**系统变量:**

| 变量               | 说明                      |
| ------------------ | ------------------------- |
| `$time_local`    | 本地时间                  |
| `$time_iso8601`  | ISO 8601格式时间          |
| `$nginx_version` | Nginx版本                 |
| `$pid`           | Worker进程PID             |
| `$pipe`          | 是否使用管道("p"或".")    |
| `$hostname`      | 主机名                    |
| `$msec`          | Unix时间戳(秒,精确到毫秒) |

#### 3.16.3 变量模块

**referer模块:防盗链**

```nginx
location /images {
    valid_referers none blocked server_names
                   *.example.com example.* ~\.google\.;
  
    if ($invalid_referer) {
        return 403 "Forbidden";
    }
}
```

**secure_link模块:防盗链(加密)**

```nginx
# 方式1:带过期时间
location /download {
    secure_link $arg_md5,$arg_expires;
    secure_link_md5 "$secure_link_expires$uri$remote_addr secret";
  
    if ($secure_link = "") {
        return 403;  # 验证失败
    }
  
    if ($secure_link = "0") {
        return 410;  # 已过期
    }
  
    # 验证通过
    alias /data/files;
}

# 生成链接(bash)
expires=$(date -d "2025-12-31" +%s)
uri="/download/file.zip"
secret="my_secret_key"
md5=$(echo -n "${expires}${uri}${remote_addr}${secret}" | openssl md5 -binary | openssl base64 | tr +/ -_ | tr -d =)
echo "/download/file.zip?md5=${md5}&expires=${expires}"

# 方式2:简单模式
location /s/ {
    secure_link_secret my_secret_key;
  
    if ($secure_link = "") {
        return 403;
    }
  
    rewrite ^ /files/$secure_link;
}

location /files {
    internal;
    alias /data;
}

# 生成链接(bash)
uri="/file.zip"
secret="my_secret_key"
md5=$(echo -n "${uri}${secret}" | openssl md5 -hex | awk '{print $2}')
echo "/s/${md5}/file.zip"
```

**map模块:变量映射**

```nginx
http {
    # 基于User-Agent判断设备类型
    map $http_user_agent $mobile {
        default 0;
        "~Opera Mini" 1;
        "~Android" 1;
        "~iPhone" 1;
    }
  
    # 基于Host判断
    map $http_host $name {
        hostnames;  # 支持泛域名
  
        default 0;
        example.com 1;
        *.example.com 2;
        www.example.* 3;
        ~^www\d+\.example\.com$ 4;
    }
  
    server {
        location / {
            if ($mobile) {
                return 200 "Mobile device\n";
            }
            return 200 "Desktop device\n";
        }
    }
}
```

**split_clients模块:AB测试**

```nginx
http {
    # 基于User-Agent的哈希值按百分比分流
    split_clients "$remote_addr$http_user_agent" $variant {
        0.5% .one;
        20% .two;
        * .three;  # 剩余79.5%
    }
  
    server {
        location / {
            root /data/www$variant;
        }
    }
}
```

**geo模块:IP地址范围匹配**

```nginx
http {
    # 基于IP地址生成变量
    geo $country {
        default US;
  
        proxy 192.168.1.0/24;  # 可信代理,从X-Forwarded-For取IP
  
        127.0.0.0/8 local;
        10.0.0.0/8 internal;
        192.168.1.0/24 UK;
        192.168.2.0/24 RU;
    }
  
    server {
        location / {
            return 200 "Country: $country\n";
        }
    }
}
```

**geoip模块:地理位置信息**

```nginx
http {
    # 需要MaxMind GeoIP数据库
    geoip_country /usr/share/GeoIP/GeoIP.dat;
    geoip_city /usr/share/GeoIP/GeoIPCity.dat;
  
    server {
        location / {
            return 200 "
                Country: $geoip_country_name ($geoip_country_code)
                City: $geoip_city
                Latitude: $geoip_latitude
                Longitude: $geoip_longitude
            ";
        }
    }
}
```

**编译:** `--with-http_geoip_module`

#### 3.16.9 配置示例: var.conf (变量综合演示)

**用途:** 演示Nginx内置变量的使用和自定义日志格式

**完整配置:**

```nginx
# 自定义日志格式
log_format vartest '$remote_addr - $remote_user [$time_local] "$request" '
                   '$status bytes_sent=$bytes_sent body_bytes_sent=$body_bytes_sent "$http_referer" '
                   '"$http_user_agent" "$sent_http_abc"';

server {
    server_name var.taohui.tech localhost;
    access_log logs/vartest.log vartest;
    listen 9090;
  
    location / {
        # 设置限速变量
        set $limit_rate 10k;
        # 返回各种内置变量的值
        return 200 '
arg_a: $arg_a,arg_b: $arg_b,args: $args
connection: $connection,connection_requests: $connection_requests
cookie_a: $cookie_a
uri: $uri,document_uri: $document_uri, request_uri: $request_uri
request: $request
request_id: $request_id
server: $server_addr,$server_name,$server_port,$server_protocol
tcpinfo: $tcpinfo_rtt, $tcpinfo_rttvar, $tcpinfo_snd_cwnd, $tcpinfo_rcv_space 
host: $host,server_name: $server_name,http_host: $http_host
limit_rate: $limit_rate
hostname: $hostname
content_length: $content_length
status: $status
body_bytes_sent: $body_bytes_sent,bytes_sent: $bytes_sent
time: $request_time,$msec,$time_iso8601,$time_local
';
    }
}
```

**关键点:** 演示了Nginx常用内置变量,包括请求参数、连接信息、时间、TCP信息等。

#### 3.16.10 配置示例: referer.conf (防盗链)

**用途:** 使用valid_referers指令实现简单的防盗链功能

**完整配置:**

```nginx
server {
    server_name referer.taohui.tech;
    error_log logs/myerror.log debug;
    root html;
  
    location / {
        # valid_referers: 定义合法的Referer
        # none: 允许Referer为空
        # blocked: 允许Referer被防火墙或代理删除
        # server_names: 允许本站域名
        # *.taohui.pub: 允许通配符域名
        # www.taohui.org.cn/nginx/: 允许特定URL
        # ~\.google\.: 允许正则匹配(如google.com)
        valid_referers none blocked server_names
                       *.taohui.pub www.taohui.org.cn/nginx/
                       ~\.google\.;
    
        # $invalid_referer: 如果Referer不合法,值为1
        if ($invalid_referer) {
            return 403;
        }
    
        return 200 'valid\n';
    }
}
```

**关键点:** valid_referers用于防盗链,阻止非法来源的请求。

#### 3.16.11 配置示例: secure_link.conf (安全链接)

**用途:** 使用secure_link模块实现带时效和签名的安全链接

**完整配置:**

```nginx
server {
    server_name securelink.taohui.tech;
    error_log logs/myerror.log info;
    default_type text/plain;
  
    # 方式1: MD5哈希验证(带过期时间)
    location / {
        # secure_link: 从参数获取MD5和过期时间
        secure_link $arg_md5,$arg_expires;
        # secure_link_md5: 定义MD5计算方式
        # 格式: "$secure_link_expires$uri$remote_addr secret"
        secure_link_md5 "$secure_link_expires$uri$remote_addr secret";
    
        # $secure_link = "": MD5验证失败
        if ($secure_link = "") {
            return 403;
        }
    
        # $secure_link = "0": 链接已过期
        if ($secure_link = "0") {
            return 410;
        }
    
        return 200 '$secure_link:$secure_link_expires\n';
    }
  
    # 方式2: 简单密钥验证(不带过期时间)
    location /p/ {
        # secure_link_secret: 定义密钥
        secure_link_secret mysecret2;
    
        if ($secure_link = "") {
            return 403;
        }
    
        # 验证通过后,重写到实际文件路径
        rewrite ^ /secure/$secure_link;
    }
  
    location /secure/ {
        alias html/;
        internal;  # 只允许内部访问
    }
}
```

**生成安全链接示例:**

```bash
# 方式1: 带过期时间
expires=$(date -d "2025-12-31" +%s)
uri="/test.txt"
remote_addr="192.168.1.100"
secret="secret"
md5=$(echo -n "${expires}${uri}${remote_addr}${secret}" | openssl md5 -binary | openssl base64 | tr +/ -_ | tr -d =)
echo "http://securelink.taohui.tech${uri}?md5=${md5}&expires=${expires}"

# 方式2: 简单密钥
uri="test.txt"
secret="mysecret2"
md5=$(echo -n "${uri}${secret}" | openssl md5 -hex | cut -d' ' -f2)
echo "http://securelink.taohui.tech/p/${md5}/${uri}"
```

**关键点:** secure_link提供比referer更强的防盗链机制,支持时效和签名验证。

#### 3.16.12 配置示例: map.conf (变量映射)

**用途:** 演示map、split_clients、geo、geoip模块的综合使用

**完整配置:**

```nginx
# map模块: 根据变量值映射到新变量
map $http_host $name {
    hostnames;  # 启用hostname匹配模式
    default 0;
    ~map\.tao\w+\.org.cn 1;  # 正则匹配
    *.taohui.org.cn 2;        # 通配符匹配
    map.taohui.tech 3;        # 精确匹配
    map.taohui.* 4;           # 通配符匹配
}

map $http_user_agent $mobile {
    default 0;
    "~Opera Mini" 1;  # 移动端UA检测
}

server {
    listen 10001;
    default_type text/plain;
    location / {
        return 200 '$name:$mobile\n';
    }
}

# split_clients模块: A/B测试(流量分割)
split_clients "${http_testcli}" $variant {
    0.51%  .one;    # 0.51%的流量
    20.0%  .two;    # 20%的流量
    50.5%  .three;  # 50.5%的流量
    *      "";      # 剩余流量(28.99%)
}

server {
    server_name split_clients.taohui.tech;
    error_log logs/error.log debug;
    default_type text/plain;
    location / {
        return 200 'ABtestfile$variant\n';
    }
}

# geo模块: 基于IP的地理位置映射
geo $country {
    default ZZ;
    proxy 116.62.160.193;  # 信任的代理IP
    127.0.0.0/24 US;
    127.0.0.1/32 RU;
    10.1.0.0/16 RU;
    192.168.1.0/24 UK;
}

server {
    server_name geo.taohui.tech;
    location / {
        return 200 '$country\n';
    }
}

# geoip模块: 使用MaxMind数据库的地理位置
geoip_country /usr/local/share/GeoIP/GeoIP.dat;
geoip_city /usr/local/share/GeoIP/GeoLiteCity.dat;
geoip_proxy 116.62.160.193/32;
geoip_proxy_recursive on;

server {
    server_name geoip.taohui.tech;
    error_log logs/myerror.log info;
    keepalive_requests 2;
    keepalive_timeout 75s 20;
    location / {
        return 200 'country:$geoip_country_code,$geoip_country_code3,$geoip_country_name
country from city:$geoip_city_country_code,$geoip_city_country_code3,$geoip_city_country_name
city:$geoip_area_code,$geoip_city_continent_code,$geoip_dma_code
$geoip_latitude,$geoip_longitude,$geoip_region,$geoip_region_name,$geoip_city,$geoip_postal_code
';
    }
}
```

**关键点:**

- map: 变量映射,支持正则和通配符
- split_clients: A/B测试流量分割
- geo: 基于IP的简单地理位置
- geoip: 基于MaxMind数据库的详细地理信息

### 3.17 Keepalive连接复用

**功能:** 在一个TCP连接上处理多个HTTP请求

```nginx
http {
    # 一个连接最多处理100个请求
    keepalive_requests 100;
  
    # 连接空闲超时时间
    keepalive_timeout 75s;  # 第一个参数:服务器端超时
    keepalive_timeout 75s 60s;  # 第二个参数:告诉客户端的超时(Keep-Alive头)
  
    # 禁用某些浏览器的keepalive
    keepalive_disable msie6;
}
```

**优点:**

1. 减少握手次数
2. 减少并发连接数,降低内存消耗
3. TCP拥塞窗口保持在最佳状态

**协议头部:**

```
# 请求
Connection: keep-alive

# 响应
Connection: keep-alive
Keep-Alive: timeout=60
```

---

**第三部分总结:**

HTTP模块是Nginx的核心功能,本部分详细介绍了:

1. **配置指令合并规则** - 理解值指令和动作指令的区别
2. **11个请求处理阶段** - 掌握模块的执行顺序和跳转规则
3. **核心模块详解** - realip, rewrite, access, limit等模块的使用
4. **location匹配规则** - 精确匹配、前缀匹配、正则匹配的优先级
5. **过滤模块** - 响应内容的加工处理
6. **Nginx变量** - 惰性求值、变量分类、常用变量

通过本部分的学习,你应该能够:

- 熟练配置HTTP服务器
- 理解请求的完整处理流程
- 使用变量实现复杂的业务逻辑
- 进行访问控制、限流限速
- 优化连接复用和性能

接下来,我们将学习反向代理与负载均衡的详细配置。

---

**待续:第四部分 - 反向代理与负载均衡**

## 第四部分：反向代理与负载均衡

### 4.1 反向代理与负载均衡概述

#### 4.1.1 核心概念

**反向代理(Reverse Proxy)**

将客户端请求转发到后端服务器,并将响应返回给客户端。Nginx作为反向代理服务器,可以:

- 隐藏后端服务器的真实IP
- 实现负载均衡
- 提供缓存加速
- 进行SSL终止
- 压缩响应内容

**负载均衡(Load Balancing)**

将请求分发到多台服务器,提升系统的:

- **可用性** - 单台服务器故障不影响整体服务
- **可扩展性** - 水平扩展,增加服务器提升处理能力
- **性能** - 分散请求压力,提升响应速度

#### 4.1.2 AKF扩展立方体

```mermaid
graph TD
    A[AKF扩展立方体] --> B[X轴: 水平扩展]
    A --> C[Y轴: 功能拆分]
    A --> D[Z轴: 数据分片]
  
    B --> B1[无状态服务复制]
    B --> B2[Round-Robin负载均衡]
    B --> B3[成本最低,优先使用]
  
    C --> C1[按功能拆分服务]
    C --> C2[不同API不同服务器]
    C --> C3[需要重构代码]
  
    D --> D1[按用户/地域分片]
    D --> D2[Hash算法路由]
    D --> D3[CDN就是Z轴扩展]
```

**X轴扩展(水平扩展)**

- 服务无状态,多台服务器功能完全相同
- 使用Round-Robin、Least Connections算法
- 成本最低,应优先采用

**Y轴扩展(功能拆分)**

- 按业务功能拆分服务
- 不同URL路由到不同服务集群
- 通过location配置实现

**Z轴扩展(数据分片)**

- 按用户信息(IP、用户名)分片
- 使用Hash算法保证同一用户路由到同一服务器
- 适用于有状态服务或缓存场景

#### 4.1.3 反向代理分类

**四层反向代理(TCP/UDP)**

```
客户端 → Nginx(Stream模块) → 上游服务器
  TCP/UDP              TCP/UDP
```

- 基于IP和端口转发
- 不解析应用层协议
- 性能更高,但功能有限

**七层反向代理(HTTP)**

```
客户端 → Nginx(HTTP模块) → 上游服务器
  HTTP              HTTP/FastCGI/uWSGI/gRPC/Memcached
```

- 可以解析HTTP协议
- 根据URL、Header等信息路由
- 支持多种上游协议转换

#### 4.1.4 缓存类型

**时间缓存**

```mermaid
sequenceDiagram
    participant C1 as 客户端1
    participant N as Nginx
    participant B as 后端服务器
  
    C1->>N: 请求 /index.html
    N->>B: 转发请求(缓存未命中)
    B->>N: 返回响应
    N->>N: 缓存到磁盘
    N->>C1: 返回响应
  
    participant C2 as 客户端2
    C2->>N: 请求 /index.html
    N->>N: 缓存命中
    N->>C2: 直接返回缓存(不访问后端)
```

**空间缓存**

预读取后续可能需要的内容,减少延迟。

### 4.2 Upstream模块与负载均衡算法

#### 4.2.1 Upstream基本配置

```nginx
http {
    upstream backend {
        # 定义上游服务器
        server 192.168.1.10:8080;
        server 192.168.1.11:8080;
        server 192.168.1.12:8080;
  
        # 通用参数
        server 192.168.1.13:8080 weight=2;      # 权重
        server 192.168.1.14:8080 max_fails=3 fail_timeout=30s;
        server 192.168.1.15:8080 backup;        # 备份服务器
        server 192.168.1.16:8080 down;          # 标记为下线
    }
  
    server {
        location / {
            proxy_pass http://backend;
        }
    }
}
```

**server指令参数:**

| 参数                  | 说明                                |
| --------------------- | ----------------------------------- |
| `weight=n`          | 权重,默认1                          |
| `max_fails=n`       | 最大失败次数,默认1                  |
| `fail_timeout=time` | 失败超时时间,默认10s                |
| `backup`            | 备份服务器,主服务器全部失败时才使用 |
| `down`              | 标记服务器下线                      |
| `max_conns=n`       | 最大并发连接数,默认0(不限制)        |

#### 4.2.2 负载均衡算法

**1. Round-Robin(轮询)**

```nginx
upstream backend {
    server 192.168.1.10:8080 weight=1;
    server 192.168.1.11:8080 weight=2;  # 权重2,处理2倍请求
    server 192.168.1.12:8080 weight=1;
}
```

**特点:**

- 默认算法,无需额外配置
- 按权重依次轮询
- 适用于无状态服务

**请求分配示例:**

```
请求1 → server1 (weight=1)
请求2 → server2 (weight=2)
请求3 → server2 (weight=2)
请求4 → server3 (weight=1)
请求5 → server1 (weight=1)
...
```

**2. IP Hash**

```nginx
upstream backend {
    ip_hash;  # 基于客户端IP的Hash
  
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
    server 192.168.1.12:8080;
}
```

**特点:**

- 基于客户端IP地址(IPv4前3字节,IPv6完整地址)
- 同一IP的请求总是路由到同一服务器
- 适用于有状态服务(如Session)
- 可配合realip模块获取真实IP

**注意事项:**

- 服务器数量变化会导致大量请求重新路由
- 不支持weight参数
- backup参数仍然有效

**3. Hash(通用Hash)**

```nginx
upstream backend {
    hash $request_uri;  # 基于请求URI
    # hash $request_uri consistent;  # 一致性Hash
  
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
    server 192.168.1.12:8080;
}
```

**Hash Key可以是:**

```nginx
# 基于URL参数
hash $arg_user_id;

# 基于Cookie
hash $cookie_session_id;

# 基于请求头
hash $http_x_forwarded_for;

# 组合多个变量
hash "$remote_addr$request_uri";
```

**特点:**

- 可基于任意变量或字符串
- 灵活性高,适用于各种场景
- 同样面临服务器数量变化的问题

**4. 一致性Hash(Consistent Hash)**

```nginx
upstream backend {
    hash $request_uri consistent;  # 添加consistent参数
  
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
    server 192.168.1.12:8080;
}
```

**原理:**

```mermaid
graph TD
    A[Hash环 0 到 2^32-1] --> B[均匀分布服务器节点]
    B --> C[请求Hash后落在环上]
    C --> D[顺时针找到最近的服务器]
  
    E[增加服务器] --> F[只影响相邻节点]
    G[删除服务器] --> H[只影响该节点的请求]
```

**优点:**

- 服务器增减时,只影响部分请求
- 缓存失效范围小
- 适用于有缓存的场景

**对比普通Hash:**

| 场景              | 普通Hash        | 一致性Hash      |
| ----------------- | --------------- | --------------- |
| 5台服务器,删除1台 | 80%请求重新路由 | 20%请求重新路由 |
| 缓存失效率        | 高              | 低              |
| 性能影响          | 大              | 小              |

**5. Least Connections(最少连接)**

```nginx
upstream backend {
    least_conn;  # 最少连接算法
  
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
    server 192.168.1.12:8080;
}
```

**特点:**

- 优先选择当前连接数最少的服务器
- 适用于请求处理时间差异大的场景
- 多个服务器连接数相同时,退化为Round-Robin

**工作原理:**

```
Server1: 5个连接
Server2: 3个连接  ← 新请求路由到这里
Server3: 7个连接
```

#### 4.2.3 Keepalive连接复用

**对上游使用Keepalive:**

```nginx
upstream backend {
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
  
    # Keepalive配置
    keepalive 32;              # 保持32个空闲连接
    keepalive_requests 100;    # 每个连接最多100个请求(1.15.3+)
    keepalive_timeout 60s;     # 空闲连接超时时间(1.15.3+)
}

server {
    location / {
        proxy_pass http://backend;
  
        # 必须配置,否则Keepalive不生效
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

**优点:**

1. 减少TCP握手次数
2. 降低延迟
3. 提升吞吐量
4. 减少TIME_WAIT状态的连接

**注意事项:**

- HTTP/1.0不支持Keepalive,必须使用HTTP/1.1
- 必须清空Connection头部(默认为"close")
- keepalive数量要根据并发量合理设置

#### 4.2.4 Upstream Zone(共享内存)

```nginx
upstream backend {
    zone backend_zone 10m;  # 分配10MB共享内存
  
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}
```

**功能:**

- 将upstream配置和状态信息存储在共享内存中
- 所有Worker进程共享负载均衡状态
- 支持动态配置(Nginx Plus)

**作用:**

- 使least_conn算法跨Worker进程生效
- 统计信息更准确
- 为动态配置提供基础

#### 4.2.5 DNS解析

```nginx
upstream backend {
    server backend.example.com resolve;
  
    resolver 8.8.8.8 valid=30s;  # DNS服务器和缓存时间
}
```

**功能:**

- 动态解析域名
- 支持DNS轮询
- 适用于云环境中IP经常变化的场景

#### 4.2.6 Upstream变量

Nginx提供了丰富的upstream变量用于监控和调试:

| 变量                          | 说明                 |
| ----------------------------- | -------------------- |
| `$upstream_addr`            | 上游服务器的IP:端口  |
| `$upstream_connect_time`    | 建立连接耗时(秒)     |
| `$upstream_header_time`     | 接收响应头耗时(秒)   |
| `$upstream_response_time`   | 接收完整响应耗时(秒) |
| `$upstream_status`          | 上游响应状态码       |
| `$upstream_bytes_received`  | 从上游接收的字节数   |
| `$upstream_response_length` | 上游响应body长度     |
| `$upstream_http_name`       | 上游响应头部         |
| `$upstream_cookie_name`     | 上游Set-Cookie中的值 |
| `$upstream_trailer_name`    | 上游响应trailer      |

**日志示例:**

```nginx
log_format upstream '$remote_addr - [$time_local] "$request" '
                    'status=$status '
                    'upstream=$upstream_addr '
                    'connect_time=$upstream_connect_time '
                    'header_time=$upstream_header_time '
                    'response_time=$upstream_response_time';

access_log /var/log/nginx/upstream.log upstream;
```

#### 4.2.6 配置示例: upserver.conf (上游服务器)

**用途:** 定义测试用的上游服务器,模拟不同的响应场景

**完整配置:**

```nginx
# 上游服务器1: 慢速响应(limit_rate=1字节/秒)
server {
    listen 127.0.0.1:8011;
    default_type text/plain;
    limit_rate 1;  # 限速测试
    return 200 '8011 server response.\n';
}

# 上游服务器2: 错误响应(500)
server {
    listen 8013;
    default_type text/plain;
    return 500 '8013 Server Internal Error.\n';
}

# 上游服务器3: 正常响应
server {
    listen 8012;
    default_type text/plain;
    root html;
    location /test {
        return 200 '8012 server response.
uri: $uri
method: $request_method
request: $request
http_name: $http_name
curtime: $time_local
\n';
    }
}
```

**关键点:** 提供不同响应特性的上游服务器,用于测试负载均衡和故障转移。

#### 4.2.7 配置示例: roundrobin.conf (轮询负载均衡)

**用途:** 演示加权轮询负载均衡算法和upstream keepalive

**完整配置:**

```nginx
upstream rrups {
    # server参数详解:
    # weight: 权重,默认1,weight=2表示处理2倍请求
    # max_conns: 最大并发连接数,超过则跳过该服务器
    # max_fails: 最大失败次数,默认1
    # fail_timeout: 失败超时时间,默认10s
    server 127.0.0.1:8011 weight=2 max_conns=2 max_fails=2 fail_timeout=5;
    server 127.0.0.1:8012;
  
    # keepalive: 保持的空闲连接数
    # 注意: 这是每个worker进程的连接数
    keepalive 32;
}

server {
    server_name rrups.taohui.tech;
    error_log myerror.log info;
  
    location / {
        proxy_pass http://rrups;
        # 启用HTTP/1.1和keepalive
        proxy_http_version 1.1;
        proxy_set_header Connection "";  # 清空Connection头
    }
}
```

**关键点:** weight控制权重,keepalive复用连接,需配合HTTP/1.1使用。

#### 4.2.8 配置示例: iphash.conf (Hash负载均衡)

**用途:** 演示IP Hash和通用Hash算法,实现会话保持

**完整配置:**

```nginx
# 自定义日志格式,记录upstream变量
log_format varups '$upstream_addr $upstream_connect_time $upstream_header_time $upstream_response_time '
                  '$upstream_response_length $upstream_bytes_received '
                  '$upstream_status $upstream_http_server $upstream_cache_status';

upstream iphashups {
    # ip_hash: 基于客户端IP的Hash算法
    # 同一IP总是分配到同一台服务器
    # ip_hash;
  
    # hash: 通用Hash算法,可自定义Hash key
    # 这里基于username参数进行Hash
    hash user_$arg_username;
  
    server 127.0.0.1:8011 weight=2 max_conns=2 max_fails=2 fail_timeout=5;
    server 127.0.0.1:8012 weight=1;
}

server {
    # realip模块: 获取真实客户端IP(用于ip_hash)
    set_real_ip_from 116.62.160.193;
    real_ip_recursive on;
    real_ip_header X-Forwarded-For;
  
    server_name iphash.taohui.tech;
    error_log myerror.log info;
    access_log logs/upstream_access.log varups;
  
    location / {
        proxy_pass http://iphashups;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

**关键点:** ip_hash基于IP,hash可自定义key,实现会话保持。

#### 4.2.9 配置示例: upskeepalive.conf (Upstream Keepalive)

**用途:** 演示upstream keepalive连接复用,提升性能

**完整配置:**

```nginx
upstream upskeepalive {
    server 127.0.0.1:8011;
    # keepalive: 每个worker保持的空闲连接数
    # 32: 最多保持32个空闲连接
    # 连接池大小,不是最大连接数
    keepalive 32;
}

server {
    server_name rrups.taohui.tech;
    error_log myerror.log info;
  
    location / {
        proxy_pass http://upskeepalive;
        # 必须配置HTTP/1.1
        proxy_http_version 1.1;
        # 必须清空Connection头(默认是close)
        proxy_set_header Connection "";
    }
}
```

**关键点:** keepalive复用连接,减少TCP握手开销,需HTTP/1.1支持。

#### 4.2.10 配置示例: varups.conf (Upstream变量)

**用途:** 演示upstream相关变量的使用和日志记录

**完整配置:**

```nginx
upstream iphashups {
    server 127.0.0.1:8011 weight=2 max_conns=2 max_fails=2 fail_timeout=5;
    server 127.0.0.1:8012 weight=1;
}

server {
    server_name varups.taohui.tech;
    error_log myerror.log info;
  
    # 定义upstream变量日志格式
    log_format varups '$upstream_addr $upstream_connect_time $upstream_header_time $upstream_response_time '
                      '$upstream_response_length $upstream_bytes_received'
                      '$upstream_status $upstream_http_server $upstream_cache_status';
  
    access_log logs/upstream_access.log;
  
    location / {
        proxy_pass http://iphashups;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

**Upstream变量说明:**

- `$upstream_addr`: 上游服务器地址
- `$upstream_connect_time`: 连接建立时间
- `$upstream_header_time`: 接收响应头时间
- `$upstream_response_time`: 接收完整响应时间
- `$upstream_status`: 上游响应状态码
- `$upstream_cache_status`: 缓存状态(HIT/MISS/BYPASS等)

#### 4.2.11 配置示例: nextups.conf (失败重试)

**用途:** 演示proxy_next_upstream失败重试机制

**完整配置:**

```nginx
upstream nextups {
    server 127.0.0.1:8013;  # 故障服务器(返回500)
    server 127.0.0.1:8011;  # 正常服务器
}

server {
    server_name nextups.taohui.tech;
    error_log logs/myerror.log debug;
    default_type text/plain;
  
    # 500错误时使用的错误页面
    error_page 500 /test1.txt;
  
    # 默认行为: 不重试
    location / {
        proxy_pass http://nextups;
    }
  
    location /test {
    }
  
    # 连接错误时重试
    location /error {
        proxy_pass http://nextups;
        proxy_connect_timeout 1s;
        # error: 连接失败、超时、读写错误时重试
        proxy_next_upstream error;
    }
  
    # 拦截上游错误,使用本地error_page
    location /intercept {
        # proxy_intercept_errors: 拦截上游4xx/5xx错误
        # on: 使用本地error_page处理
        # off(默认): 直接返回上游错误
        proxy_intercept_errors on;
        proxy_pass http://127.0.0.1:8013;
    }
  
    # HTTP 500错误时重试
    location /httperr {
        # http_500: 上游返回500时重试下一台服务器
        # 可选值: error, timeout, invalid_header, http_500, http_502, http_503, http_504, http_403, http_404, http_429, non_idempotent, off
        proxy_next_upstream http_500;
        proxy_pass http://nextups;
    }
}
```

**proxy_next_upstream参数:**

- `error`: 连接/读写/超时错误
- `timeout`: 超时
- `http_500/502/503/504`: HTTP错误码
- `non_idempotent`: 允许非幂等请求重试
- `off`: 禁用重试

### 4.3 HTTP Proxy模块

#### 4.3.1 Proxy处理流程

```mermaid
graph TD
    A[Content阶段: proxy_pass] --> B{缓存命中?}
    B -->|是| Z[发送响应]
    B -->|否| C[生成上游请求头和Body]
    C --> D{proxy_request_buffering}
    D -->|on 默认| E[读取完整请求Body]
    D -->|off| F[边读边转发]
    E --> G[负载均衡选择服务器]
    F --> G
    G --> H[建立连接]
    H --> I[发送请求]
    I --> J[接收响应头]
    J --> K[处理响应头]
    K --> L{proxy_buffering}
    L -->|on 默认| M[接收完整响应Body]
    L -->|off| N[边接收边发送]
    M --> O{缓存?}
    N --> O
    O -->|是| P[写入缓存]
    O -->|否| Q[关闭/复用连接]
    P --> Q
    Q --> Z
```

**关键配置点:**

1. **proxy_request_buffering** - 控制请求Body处理

   - `on`(默认): 先完整接收客户端Body,再转发(保护上游)
   - `off`: 边接收边转发(降低延迟)
2. **proxy_buffering** - 控制响应Body处理

   - `on`(默认): 先完整接收上游响应,再发送(适应慢速客户端)
   - `off`: 边接收边发送(降低内存使用)

#### 4.3.2 proxy_pass指令详解

**基本语法:**

```nginx
location /api {
    proxy_pass http://backend;
}
```

**URL处理规则:**

```nginx
# 规则1: 不带URI
location /api {
    proxy_pass http://backend;
    # 访问 /api/test → 转发 /api/test (原封不动)
}

# 规则2: 带URI
location /api {
    proxy_pass http://backend/v1;
    # 访问 /api/test → 转发 /v1/test (替换/api为/v1)
}

# 规则3: 带URI(根路径)
location /api {
    proxy_pass http://backend/;
    # 访问 /api/test → 转发 /test (去除/api)
}

# 规则4: 正则location(只能不带URI)
location ~ ^/api/(.+)$ {
    proxy_pass http://backend;  # 正确
    # proxy_pass http://backend/v1;  # 错误!
}

# 规则5: 使用变量
location /api {
    set $backend_uri /v1$request_uri;
    proxy_pass http://backend$backend_uri;
}

# 规则6: 配合rewrite
location /api {
    rewrite ^/api/(.*)$ /$1 break;
    proxy_pass http://backend;
}
```

**重要提示:**

- 是否带URI会导致完全不同的转发行为
- 正则location和@命名location只能使用不带URI的形式
- 使用变量时,必须包含完整URL(含协议和主机名)

#### 4.3.3 修改上游请求

**1. 请求行**

```nginx
location / {
    # 修改请求方法
    proxy_method POST;
  
    # 修改HTTP版本(Keepalive需要1.1)
    proxy_http_version 1.1;
  
    proxy_pass http://backend;
}
```

**2. 请求头**

```nginx
location / {
    # 设置/修改请求头
    proxy_set_header Host $proxy_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  
    # 删除请求头(设置为空字符串)
    proxy_set_header Accept-Encoding "";
  
    # 不转发客户端请求头
    proxy_pass_request_headers off;
  
    proxy_pass http://backend;
}
```

**默认行为:**

- `Host` → `$proxy_host` (upstream中的主机名)
- `Connection` → `close`
- 其他头部原封不动转发

**常用头部设置:**

```nginx
# 标准配置
proxy_set_header Host $host;  # 使用客户端请求的Host
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

# Keepalive配置
proxy_http_version 1.1;
proxy_set_header Connection "";

# WebSocket配置
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

**3. 请求Body**

```nginx
location / {
    # 转发请求Body(默认on)
    proxy_pass_request_body on;
  
    # 自定义请求Body
    proxy_set_body "custom body content";
  
    proxy_pass http://backend;
}
```

#### 4.3.4 接收客户端请求Body

```nginx
http {
    # 请求Body缓冲区大小
    client_body_buffer_size 16k;
  
    # 请求Body最大大小
    client_max_body_size 10m;
  
    # 请求Body临时文件路径
    client_body_temp_path /var/cache/nginx/client_temp 1 2;
  
    # 是否缓冲请求Body
    proxy_request_buffering on;  # 默认on
  
    # 强制将Body存储到文件
    client_body_in_file_only off;  # off/on/clean
  
    # 单个文件写入大小
    client_body_in_single_buffer off;
}
```

**处理流程:**

```
1. Body ≤ client_body_buffer_size → 存储在内存
2. Body > client_body_buffer_size → 存储在临时文件
3. proxy_request_buffering on → 完整接收后转发
4. proxy_request_buffering off → 边接收边转发
```

#### 4.3.5 建立上游连接

```nginx
location / {
    # 连接超时
    proxy_connect_timeout 60s;
  
    # 发送超时
    proxy_send_timeout 60s;
  
    # 接收超时
    proxy_read_timeout 60s;
  
    # TCP相关
    proxy_socket_keepalive on;  # TCP Keepalive
    proxy_bind $remote_addr transparent;  # 绑定源地址
  
    # SSL连接
    proxy_ssl_protocols TLSv1.2 TLSv1.3;
    proxy_ssl_ciphers HIGH:!aNULL:!MD5;
    proxy_ssl_verify on;
    proxy_ssl_trusted_certificate /path/to/ca.crt;
  
    proxy_pass http://backend;
}
```

#### 4.3.6 接收上游响应

**1. 接收响应头**

```nginx
location / {
    # 响应头缓冲区
    proxy_buffer_size 4k;  # 默认一个内存页(4k/8k)
  
    # 响应头超时
    proxy_read_timeout 60s;
  
    proxy_pass http://backend;
}
```

**2. 处理响应头**

```nginx
location / {
    # 隐藏上游响应头
    proxy_hide_header X-Powered-By;
    proxy_hide_header Server;
  
    # 传递上游响应头
    proxy_pass_header X-Custom-Header;
  
    # 忽略上游某些响应头
    proxy_ignore_headers X-Accel-Expires Expires Cache-Control;
  
    # 拦截上游错误
    proxy_intercept_errors on;  # 使用error_page处理上游错误
  
    proxy_pass http://backend;
}
```

**3. 接收响应Body**

```nginx
location / {
    # 是否缓冲响应Body
    proxy_buffering on;  # 默认on
  
    # 响应Body缓冲区
    proxy_buffers 8 4k;  # 8个4k缓冲区
    proxy_busy_buffers_size 8k;
  
    # 临时文件
    proxy_temp_path /var/cache/nginx/proxy_temp 1 2;
    proxy_max_temp_file_size 1024m;
    proxy_temp_file_write_size 8k;
  
    proxy_pass http://backend;
}
```

**缓冲机制:**

```
proxy_buffering on:
  1. 快速从上游接收响应(内网速度快)
  2. 缓存到内存/磁盘
  3. 慢速发送给客户端(公网速度慢)
  4. 快速释放上游连接

proxy_buffering off:
  1. 边接收边转发
  2. 节省内存
  3. 上游连接保持时间长
  4. 适用于流式传输
```

#### 4.3.7 上游失败与容错

```nginx
upstream backend {
    server 192.168.1.10:8080 max_fails=3 fail_timeout=30s;
    server 192.168.1.11:8080 max_fails=3 fail_timeout=30s;
    server 192.168.1.12:8080 backup;
}

location / {
    # 定义失败条件
    proxy_next_upstream error timeout invalid_header http_500 http_502 http_503;
  
    # 重试次数
    proxy_next_upstream_tries 3;
  
    # 重试超时
    proxy_next_upstream_timeout 10s;
  
    # 非幂等请求是否重试
    proxy_next_upstream_non_idempotent off;  # 默认off(POST不重试)
  
    proxy_pass http://backend;
}
```

**proxy_next_upstream参数:**

| 参数               | 说明               |
| ------------------ | ------------------ |
| `error`          | 连接/发送/接收错误 |
| `timeout`        | 连接/发送/接收超时 |
| `invalid_header` | 响应头无效         |
| `http_500`       | 上游返回500        |
| `http_502`       | 上游返回502        |
| `http_503`       | 上游返回503        |
| `http_504`       | 上游返回504        |
| `http_403`       | 上游返回403        |
| `http_404`       | 上游返回404        |
| `http_429`       | 上游返回429        |
| `non_idempotent` | 允许非幂等请求重试 |
| `off`            | 禁用重试           |

**注意事项:**

- 默认只对GET/HEAD等幂等请求重试
- POST等非幂等请求需要显式启用 `non_idempotent`
- 重试会增加响应时间,需要合理配置

#### 4.3.7 配置示例: proxy.conf (反向代理综合配置)

**用途:** 演示proxy模块的头部处理、SSL配置等高级功能

**完整配置:**

```nginx
upstream proxyupstream {
    server 127.0.0.1:8012 weight=1;
}

server {
    server_name proxy.taohui.tech;
    error_log logs/myerror.log debug;
  
    location / {
        proxy_pass http://proxyupstream;
    
        # proxy_method: 修改请求方法
        # proxy_method POST;
    
        # 头部处理:
        # proxy_hide_header: 隐藏上游响应头(不发送给客户端)
        proxy_hide_header aaa;
        # proxy_pass_header: 强制传递被隐藏的头部
        proxy_pass_header server;
        # proxy_ignore_headers: 忽略上游响应头(不处理)
        proxy_ignore_headers X-Accel-Limit-Rate;
    
        # 请求处理:
        # proxy_pass_request_headers: 是否传递客户端请求头
        # proxy_pass_request_headers off;
        # proxy_pass_request_body: 是否传递客户端请求体
        # proxy_pass_request_body off;
        # proxy_set_body: 自定义请求体
        # proxy_set_body 'hello world!';
        # proxy_set_header: 设置请求头
        # proxy_set_header name '';
    
        # Keepalive配置
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
  
    # HTTP和HTTPS双监听
    listen 80;
    listen 443 ssl;
  
    # SSL证书配置(Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/proxy.taohui.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/proxy.taohui.tech/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

**关键点:**

- proxy_hide_header隐藏响应头
- proxy_pass_header强制传递头部
- proxy_ignore_headers忽略特定头部
- SSL双向认证配置

### 4.4 HTTP缓存

#### 4.4.1 缓存基础

**缓存路径配置:**

```nginx
http {
    # 定义缓存路径
    proxy_cache_path /var/cache/nginx/proxy 
                     levels=1:2 
                     keys_zone=my_cache:10m 
                     max_size=10g 
                     inactive=60m 
                     use_temp_path=off;
  
    server {
        location / {
            # 启用缓存
            proxy_cache my_cache;
      
            # 缓存Key
            proxy_cache_key "$scheme$proxy_host$request_uri";
      
            # 缓存有效期
            proxy_cache_valid 200 302 10m;
            proxy_cache_valid 404 1m;
            proxy_cache_valid any 1m;
      
            # 缓存条件
            proxy_cache_methods GET HEAD;
            proxy_cache_min_uses 1;
      
            # 添加缓存状态头
            add_header X-Cache-Status $upstream_cache_status;
      
            proxy_pass http://backend;
        }
    }
}
```

**proxy_cache_path参数:**

| 参数                    | 说明                            |
| ----------------------- | ------------------------------- |
| `levels=1:2`          | 目录层级(1级1个字符,2级2个字符) |
| `keys_zone=name:size` | 共享内存区域名称和大小          |
| `max_size=size`       | 缓存最大大小                    |
| `inactive=time`       | 缓存不活跃时间,超过则删除       |
| `use_temp_path=off`   | 不使用临时路径(性能更好)        |

**$upstream_cache_status值:**

| 值              | 说明         |
| --------------- | ------------ |
| `MISS`        | 缓存未命中   |
| `HIT`         | 缓存命中     |
| `EXPIRED`     | 缓存过期     |
| `STALE`       | 使用过期缓存 |
| `UPDATING`    | 正在更新缓存 |
| `REVALIDATED` | 重新验证有效 |
| `BYPASS`      | 绕过缓存     |

#### 4.4.2 缓存控制

```nginx
location / {
    proxy_cache my_cache;
  
    # 不缓存的条件
    proxy_no_cache $cookie_nocache $arg_nocache $arg_comment;
    proxy_no_cache $http_pragma $http_authorization;
  
    # 绕过缓存的条件
    proxy_cache_bypass $cookie_nocache $arg_nocache $arg_comment;
  
    # 忽略客户端缓存控制
    proxy_ignore_headers Cache-Control Expires;
  
    # 使用过期缓存
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503;
  
    # 后台更新
    proxy_cache_background_update on;
  
    # 缓存锁
    proxy_cache_lock on;
    proxy_cache_lock_timeout 5s;
  
    proxy_pass http://backend;
}
```

**缓存控制指令:**

- `proxy_no_cache` - 满足条件时不写入缓存
- `proxy_cache_bypass` - 满足条件时不从缓存读取
- `proxy_cache_use_stale` - 何时使用过期缓存
- `proxy_cache_background_update` - 后台更新过期缓存
- `proxy_cache_lock` - 防止缓存击穿(同时只有一个请求更新缓存)

#### 4.4.3 缓存清理

**1. 手动清理(Nginx Plus)**

```nginx
location ~ /purge(/.*) {
    allow 127.0.0.1;
    deny all;
    proxy_cache_purge my_cache "$scheme$proxy_host$1";
}
```

**2. 第三方模块(ngx_cache_purge)**

```nginx
location ~ /purge(/.*) {
    allow 127.0.0.1;
    deny all;
    proxy_cache_purge my_cache "$scheme$proxy_host$1";
}
```

**3. 定时清理**

```bash
# 使用find命令清理
find /var/cache/nginx/proxy -type f -mtime +7 -delete
```

#### 4.4.4 分片缓存(Slice)

```nginx
location / {
    # 启用分片
    slice 1m;  # 每片1MB
  
    proxy_cache my_cache;
    proxy_cache_key "$uri$is_args$args$slice_range";
  
    # 必须设置Range头
    proxy_set_header Range $slice_range;
  
    # 缓存206响应
    proxy_cache_valid 200 206 1h;
  
    proxy_pass http://backend;
}
```

**优点:**

- 大文件分片缓存,提高命中率
- 支持断点续传
- 减少内存占用

**编译:** `--with-http_slice_module`

### 4.5 其他反向代理协议

#### 4.5.1 FastCGI

```nginx
location ~ \.php$ {
    fastcgi_pass 127.0.0.1:9000;
    # fastcgi_pass unix:/var/run/php-fpm.sock;
  
    fastcgi_index index.php;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    include fastcgi_params;
  
    # 缓存配置
    fastcgi_cache my_cache;
    fastcgi_cache_key "$scheme$request_method$host$request_uri";
    fastcgi_cache_valid 200 60m;
}
```

#### 4.5.2 uWSGI

```nginx
location / {
    uwsgi_pass 127.0.0.1:8000;
    # uwsgi_pass unix:/var/run/uwsgi.sock;
  
    include uwsgi_params;
  
    # 超时配置
    uwsgi_connect_timeout 60s;
    uwsgi_send_timeout 60s;
    uwsgi_read_timeout 60s;
}
```

#### 4.5.3 gRPC

```nginx
location / {
    grpc_pass grpc://backend:50051;
    # grpc_pass grpcs://backend:50051;  # gRPC over TLS
  
    # 超时配置
    grpc_connect_timeout 60s;
    grpc_send_timeout 60s;
    grpc_read_timeout 60s;
  
    # 错误处理
    error_page 502 = /error502grpc;
}

location = /error502grpc {
    internal;
    default_type application/grpc;
    add_header grpc-status 14;
    add_header grpc-message "unavailable";
    return 204;
}
```

**编译:** `--with-http_v2_module` (gRPC基于HTTP/2)

#### 4.5.4 Memcached

```nginx
location / {
    set $memcached_key "$uri?$args";
    memcached_pass 127.0.0.1:11211;
  
    # 未命中时的处理
    error_page 404 = @fallback;
}

location @fallback {
    proxy_pass http://backend;
}
```

#### 4.5.5 WebSocket

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

upstream websocket {
    server 192.168.1.10:8080;
}

server {
    location /ws {
        proxy_pass http://websocket;
  
        # WebSocket必需配置
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
  
        # 超时配置(WebSocket连接可能很长)
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

#### 4.5.4 配置示例: cache.conf (HTTP缓存综合配置)

**用途:** 演示proxy_cache的完整配置,包括缓存路径、缓存控制、SSL变量等

**完整配置:**

```nginx
# 定义缓存路径
proxy_cache_path /data/nginx/tmpcache 
                 levels=2:2              # 两级目录结构
                 keys_zone=two:10m       # 共享内存区域名称和大小
                 loader_threshold=300    # 缓存加载器阈值
                 loader_files=200        # 每次加载的文件数
                 max_size=200m           # 最大缓存大小
                 inactive=1m;            # 1分钟未访问则删除

server {
    server_name cache.taohui.tech;
    root html/;
    error_log logs/cacherr.log debug;
  
    # 缓存清理location(需要ngx_cache_purge模块)
    location ~ /purge(/.*) {
        proxy_cache_purge two $scheme$1;
    }
  
    location / {
        # 启用缓存
        proxy_cache two;
        # 200状态码缓存1分钟
        proxy_cache_valid 200 1m;
        # 添加缓存状态头(HIT/MISS/BYPASS等)
        add_header X-Cache-Status $upstream_cache_status;
    
        # 缓存控制(注释掉的高级选项):
        # proxy_cache_use_stale: 何时使用过期缓存
        # proxy_cache_key: 自定义缓存key
        # proxy_cache_revalidate: 使用If-Modified-Since重新验证
        # proxy_cache_background_update: 后台更新过期缓存
    
        proxy_cache_key $scheme$uri;
        proxy_pass http://localhost:8012;
    }
  
    # HTTPS配置
    listen 443 ssl;
    ssl_certificate examples/cert/a.crt;
    ssl_certificate_key examples/cert/a.key;
  
    # SSL客户端证书验证
    ssl_verify_client optional;
    ssl_verify_depth 2;
    ssl_client_certificate examples/cert/ca.crt;
  
    # SSL变量测试location
    location /test {
        default_type text/plain;
        return 200 '
ssl_client_escaped_cert: $ssl_client_escaped_cert
ssl_cipher: $ssl_cipher
ssl_protocol: $ssl_protocol
ssl_session_id: $ssl_session_id
ssl_session_reused: $ssl_session_reused
';
    }
  
    listen 80;
}
```

**关键点:** proxy_cache_path定义缓存,proxy_cache启用,add_header显示缓存状态。

#### 4.5.5 配置示例: slice.conf (分片缓存)

**用途:** 演示slice模块,实现大文件的分片缓存

**完整配置:**

```nginx
proxy_cache_path /data/nginx/tmpcache3 
                 levels=2:2 
                 keys_zone=three:10m 
                 loader_threshold=300 
                 loader_files=200 
                 max_size=200m 
                 inactive=1m;

server {
    server_name slice.taohui.tech;
    error_log logs/cacherr.log debug;
  
    # 缓存清理
    location ~ /purge(/.*) {
        # 注意: slice缓存的key包含$slice_range
        proxy_cache_purge three $1$is_args$args$slice_range;
    }
  
    location / {
        proxy_cache three;
    
        # slice: 分片大小(1MB)
        # 大文件会被切分成多个1MB的片段分别缓存
        slice 1m;
    
        # 缓存key必须包含$slice_range
        proxy_cache_key $uri$is_args$args$slice_range;
        # 设置Range头,请求对应的分片
        proxy_set_header Range $slice_range;
    
        # 缓存200和206状态码
        proxy_cache_valid 200 206 1m;
        add_header X-Cache-Status $upstream_cache_status;
    
        proxy_pass http://localhost:8012;
    }
}
```

**关键点:** slice指令启用分片,缓存key必须包含$slice_range,支持断点续传。

#### 4.5.6 配置示例: memcached.conf (Memcached代理)

**用途:** 演示memcached_pass,直接从Memcached读取缓存数据

**完整配置:**

```nginx
server {
    server_name memcached.taohui.tech;
    default_type text/plain;
  
    location /get {
        # 从URL参数获取key
        set $memcached_key "$arg_key";
    
        # memcached_gzip_flag: Gzip标志位
        # memcached_gzip_flag 2;
    
        # 直接从Memcached读取
        # 如果key不存在,返回404
        memcached_pass localhost:11211;
    }
}
```

**使用示例:**

```bash
# 1. 向Memcached写入数据
echo "set mykey 0 0 5\r\nhello\r\n" | nc localhost 11211

# 2. 通过Nginx读取
curl http://memcached.taohui.tech/get?key=mykey
# 输出: hello
```

**关键点:** memcached_pass直接读取Memcached,适合缓存API响应。

#### 4.5.7 配置示例: grpc.conf (gRPC反向代理)

**用途:** 演示grpc_pass指令,实现gRPC协议的反向代理

**完整配置:**

```nginx
server {
    server_name http2.taohui.tech;
    root html;
  
    location / {
        # grpc_pass: gRPC反向代理
        # 注意: 不需要http://前缀,直接写地址
        # gRPC基于HTTP/2,必须启用SSL
        grpc_pass localhost:50051;
    }
  
    # gRPC必须使用HTTP/2
    listen 4431 http2;
  
    # SSL配置(gRPC要求HTTPS)
    ssl_certificate /etc/letsencrypt/live/http2.taohui.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/http2.taohui.tech/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

**关键点:** grpc_pass用于gRPC代理,必须启用HTTP/2和SSL。

#### 4.5.8 配置示例: websocket.conf (WebSocket代理)

**用途:** 演示WebSocket协议的反向代理配置

**完整配置:**

```nginx
server {
    server_name websocket.taohui.tech;
    default_type text/plain;
    access_log logs/ws.log;
  
    location / {
        # WebSocket必需配置:
        # 1. HTTP/1.1协议
        proxy_http_version 1.1;
    
        # 2. Upgrade头: 协议升级
        # $http_upgrade: 客户端的Upgrade头值
        proxy_set_header Upgrade $http_upgrade;
    
        # 3. Connection头: 设置为"upgrade"
        # 告诉上游服务器进行协议升级
        proxy_set_header Connection "upgrade";
    
        # WebSocket后端服务器
        proxy_pass http://echo.websocket.org;
    }
  
    # HTTP和HTTPS双监听
    listen 80;
    listen 443 ssl;
  
    # SSL配置
    ssl_certificate /etc/letsencrypt/live/websocket.taohui.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/websocket.taohui.tech/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

**关键点:** WebSocket需要HTTP/1.1、Upgrade和Connection头。

### 4.6 HTTP/2

#### 4.6.1 启用HTTP/2

```nginx
server {
    listen 443 ssl http2;  # 启用HTTP/2
  
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
  
    # HTTP/2配置
    http2_push_preload on;  # 支持Link头部的preload
    http2_max_concurrent_streams 128;
    http2_max_field_size 4k;
    http2_max_header_size 16k;
  
    location / {
        root /var/www/html;
    }
}
```

**编译:** `--with-http_v2_module`

#### 4.6.2 Server Push

```nginx
location / {
    root /var/www/html;
  
    # 主动推送资源
    http2_push /style.css;
    http2_push /script.js;
  
    # 或通过Link头部
    add_header Link "</style.css>; rel=preload; as=style";
    add_header Link "</script.js>; rel=preload; as=script";
}
```

#### 4.6.3 配置示例: http2.conf (HTTP/2 Server Push)

**用途:** 演示HTTP/2的Server Push功能,主动推送资源

**完整配置:**

```nginx
server {
    server_name http2.taohui.tech;
    root html;
  
    location / {
        # http2_push: 主动推送资源
        # 当客户端请求/时,自动推送这些资源
        # 无需客户端再次请求,减少往返时间
        http2_push /mirror.txt;
        http2_push /video.mp4;
    }
  
    location /test {
        # http2_push_preload: 根据Link头推送
        # Link头格式: </path>; as=type; rel=preload
        add_header Link "</style.css>; as=style; rel=preload";
        http2_push_preload on;
    }
  
    # 启用HTTP/2: listen指令添加http2参数
    # 注意: HTTP/2必须配合SSL使用
    listen 4430 ssl http2;
  
    # SSL证书配置
    ssl_certificate /etc/letsencrypt/live/http2.taohui.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/http2.taohui.tech/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

**HTTP/2 Server Push优势:**

- 减少往返时间(RTT)
- 提前推送关键资源(CSS/JS/图片)
- 提升首屏加载速度

**关键点:** http2_push主动推送,http2_push_preload根据Link头推送。

### 4.7 Stream四层反向代理

#### 4.7.1 基本配置

```nginx
stream {
    upstream backend {
        server 192.168.1.10:3306;
        server 192.168.1.11:3306;
    }
  
    server {
        listen 3306;
        proxy_pass backend;
  
        # 超时配置
        proxy_connect_timeout 1s;
        proxy_timeout 3s;
    }
}
```

**编译:** `--with-stream` (默认不编译)

#### 4.7.2 Stream处理阶段

```mermaid
graph LR
    A[POST_ACCEPT] --> B[PREACCESS]
    B --> C[ACCESS]
    C --> D[SSL]
    D --> E[PREREAD]
    E --> F[CONTENT]
    F --> G[LOG]
```

**各阶段模块:**

| 阶段        | 模块         | 功能       |
| ----------- | ------------ | ---------- |
| POST_ACCEPT | realip       | 获取真实IP |
| PREACCESS   | limit_conn   | 限制连接数 |
| ACCESS      | access       | IP访问控制 |
| SSL         | ssl_preread  | SSL预读取  |
| PREREAD     | preread      | 协议预读取 |
| CONTENT     | proxy/return | 内容处理   |
| LOG         | log          | 记录日志   |

#### 4.7.3 TCP/UDP负载均衡

```nginx
stream {
    # TCP负载均衡
    upstream tcp_backend {
        least_conn;
        server 192.168.1.10:3306 weight=2;
        server 192.168.1.11:3306;
        server 192.168.1.12:3306 backup;
    }
  
    server {
        listen 3306;
        proxy_pass tcp_backend;
    }
  
    # UDP负载均衡
    upstream dns_backend {
        server 8.8.8.8:53;
        server 8.8.4.4:53;
    }
  
    server {
        listen 53 udp;
        proxy_pass dns_backend;
        proxy_responses 1;  # 期望的响应数量
    }
}
```

#### 4.7.4 SSL/TLS终止

```nginx
stream {
    upstream backend {
        server 192.168.1.10:80;
    }
  
    server {
        listen 443 ssl;
  
        ssl_certificate /path/to/cert.pem;
        ssl_certificate_key /path/to/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
  
        proxy_pass backend;
    }
}
```

#### 4.7.5 SSL预读取(SNI路由)

```nginx
stream {
    map $ssl_preread_server_name $backend {
        example.com backend1;
        api.example.com backend2;
        default backend1;
    }
  
    upstream backend1 {
        server 192.168.1.10:443;
    }
  
    upstream backend2 {
        server 192.168.1.20:443;
    }
  
    server {
        listen 443;
        proxy_pass $backend;
        ssl_preread on;  # 启用SSL预读取
    }
}
```

**编译:** `--with-stream_ssl_preread_module`

#### 4.7.6 Proxy Protocol

**功能:** 在TCP层传递客户端真实IP

```nginx
stream {
    server {
        listen 80 proxy_protocol;  # 接收Proxy Protocol
  
        set_real_ip_from 192.168.1.0/24;
  
        proxy_pass backend;
        proxy_protocol on;  # 转发时也使用Proxy Protocol
    }
}
```

**Proxy Protocol格式:**

```
PROXY TCP4 192.168.1.100 192.168.1.10 54321 80\r\n
```

#### 4.7.7 Stream变量

| 变量                            | 说明               |
| ------------------------------- | ------------------ |
| `$remote_addr`                | 客户端IP           |
| `$remote_port`                | 客户端端口         |
| `$server_addr`                | 服务器IP           |
| `$server_port`                | 服务器端口         |
| `$protocol`                   | 协议(TCP/UDP)      |
| `$bytes_sent`                 | 发送字节数         |
| `$bytes_received`             | 接收字节数         |
| `$session_time`               | 会话时间           |
| `$upstream_addr`              | 上游服务器地址     |
| `$upstream_bytes_sent`        | 发送到上游的字节数 |
| `$upstream_bytes_received`    | 从上游接收的字节数 |
| `$upstream_connect_time`      | 连接上游耗时       |
| `$ssl_preread_server_name`    | SNI服务器名        |
| `$ssl_preread_alpn_protocols` | ALPN协议           |

### 4.8 性能优化

#### 4.8.1 Open File Cache

```nginx
http {
    # 打开文件缓存
    open_file_cache max=1000 inactive=20s;
    open_file_cache_valid 30s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;
}
```

**参数说明:**

- `max` - 缓存最大文件数
- `inactive` - 不活跃时间
- `valid` - 检查文件是否变化的时间间隔
- `min_uses` - 在inactive时间内最少使用次数
- `errors` - 是否缓存文件不存在的错误

#### 4.7.8 配置示例: stream.conf (Stream基础)

**用途:** 演示Stream模块的基本TCP代理功能

**完整配置:**

```nginx
stream {
    server {
        # 监听TCP 10001端口
        listen 10001;
    
        # return: 直接返回内容(不转发)
        # $remote_addr: 客户端IP地址
        return 'hello, $remote_addr!\n';
    }
}
```

**关键点:** Stream模块用于TCP/UDP四层代理,配置在stream块中。

#### 4.7.9 配置示例: streamups.conf (Stream高级功能)

**用途:** 演示Stream的日志、Proxy Protocol、变量等高级功能

**完整配置:**

```nginx
stream {
    # 自定义日志格式
    log_format basic '$remote_addr [$time_local] '
                     '$protocol $status $bytes_sent $bytes_received '
                     '$session_time';
  
    error_log logs/stream_error.log debug;
    access_log logs/stream_access.log basic;
  
    # Server 1: Proxy Protocol监听
    server {
        # proxy_protocol: 接收Proxy Protocol
        # 可以获取客户端真实IP
        listen 10002 proxy_protocol;
        return '10002 server get ip: $remote_addr!\n';
    }
  
    # Server 2: 另一个Proxy Protocol服务器
    server {
        listen 10003 proxy_protocol;
        return '10003 server get ip: $remote_addr!\n';
    }
  
    # Server 3: 访问控制和变量演示
    server {
        listen 10004 proxy_protocol;
    
        # set_real_ip_from: 信任的代理IP
        set_real_ip_from 127.0.0.1;
    
        # 访问控制
        allow 202.112.144.236;
        deny all;
    
        # 返回Stream变量
        return '10004 vars:
bytes_received: $bytes_received
bytes_sent: $bytes_sent
proxy_protocol_addr: $proxy_protocol_addr
proxy_protocol_port: $proxy_protocol_port
remote_addr: $remote_addr
remote_port: $remote_port
realip_remote_addr: $realip_remote_addr
realip_remote_port: $realip_remote_port
server_addr: $server_addr
server_port: $server_port
session_time: $session_time
status: $status
protocol: $protocol
';
    }
}
```

**Stream变量说明:**

- `$remote_addr/$remote_port`: 客户端地址/端口
- `$server_addr/$server_port`: 服务器地址/端口
- `$bytes_sent/$bytes_received`: 发送/接收字节数
- `$session_time`: 会话持续时间
- `$protocol`: 协议(TCP/UDP)
- `$proxy_protocol_addr`: Proxy Protocol中的真实IP

**关键点:** Stream支持Proxy Protocol、访问控制、自定义日志。

#### 4.8.2 连接优化

```nginx
http {
    # 客户端连接
    keepalive_timeout 65;
    keepalive_requests 100;
  
    # 上游连接
    upstream backend {
        keepalive 32;
        keepalive_requests 100;
        keepalive_timeout 60s;
    }
}
```

#### 4.8.3 缓冲优化

```nginx
http {
    # 客户端请求
    client_body_buffer_size 16k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 8k;
  
    # 上游响应
    proxy_buffer_size 4k;
    proxy_buffers 8 4k;
    proxy_busy_buffers_size 8k;
}
```

---

**第四部分总结:**

反向代理与负载均衡是Nginx的核心功能之一,本部分详细介绍了:

1. **负载均衡算法** - Round-Robin、IP Hash、Hash、一致性Hash、Least Connections
2. **Upstream模块** - 服务器配置、Keepalive连接复用、共享内存、变量
3. **HTTP Proxy** - 请求处理流程、proxy_pass详解、请求/响应修改、容错机制
4. **HTTP缓存** - 缓存配置、缓存控制、缓存清理、分片缓存
5. **其他协议** - FastCGI、uWSGI、gRPC、Memcached、WebSocket
6. **HTTP/2** - 启用配置、Server Push
7. **Stream模块** - TCP/UDP代理、SSL终止、Proxy Protocol
8. **性能优化** - 文件缓存、连接优化、缓冲优化

#### 4.8.7 配置示例: openfilecache.conf (文件缓存优化)

**用途:** 演示open_file_cache文件描述符缓存,提升静态文件性能

**完整配置:**

```nginx
server {
    listen 8092;
    root html;
  
    location / {
        # open_file_cache: 文件描述符缓存
        # max=10: 最多缓存10个文件描述符
        # inactive=60s: 60秒内未访问则删除
        open_file_cache max=10 inactive=60s;
    
        # open_file_cache_min_uses: 最少使用次数
        # 在inactive时间内至少使用1次才缓存
        open_file_cache_min_uses 1;
    
        # open_file_cache_valid: 检查文件是否变化的时间间隔
        # 每60秒检查一次文件是否被修改
        open_file_cache_valid 60s;
    
        # open_file_cache_errors: 是否缓存文件不存在的错误
        # on: 缓存404错误,避免重复查找不存在的文件
        open_file_cache_errors on;
    }
}
```

**open_file_cache优化效果:**

- 减少open/stat系统调用
- 提升静态文件访问性能
- 降低磁盘I/O压力
- 适合大量小文件场景

**关键点:** open_file_cache缓存文件描述符,显著提升静态文件性能。

---

通过本部分的学习,你应该能够:

- 配置各种负载均衡策略
- 理解反向代理的完整处理流程
- 使用缓存提升性能
- 配置四层和七层反向代理
- 优化Nginx性能

接下来,我们将学习Nginx的系统层性能优化。

---

**待续:第五部分 - Nginx的系统层性能优化**

## 第五部分：Nginx的系统层性能优化

### 5.1 性能优化方法论

#### 5.1.1 优化目标

Nginx性能优化需要从软件和硬件两个层面入手,核心目标是提升硬件资源的使用效率:

```mermaid
graph TD
    A[性能优化] --> B[软件层面优化]
    A --> C[硬件层面优化]
    A --> D[集群化扩展]
  
    B --> B1[提升CPU利用率]
    B --> B2[提升内存利用率]
    B --> B3[提升磁盘IO利用率]
    B --> B4[提升网络带宽利用率]
  
    C --> C1[升级网卡 千兆 - 万兆]
    C --> C2[升级磁盘 机械 - 固态]
    C --> C3[升级CPU 更快主频/更多核心]
    C --> C4[升级内存 更大容量/更快速度]
  
    D --> D1[DNS负载均衡]
    D --> D2[多台Nginx集群]
```

#### 5.1.2 软件优化方向

**1. 提升CPU利用率**

- 避免惊群问题(accept_mutex, reuseport)
- 使用gzip_static模块预压缩,避免实时压缩消耗CPU
- 减少进程上下文切换
- 提高进程优先级(worker_priority)

**2. 提升内存利用率**

- 合理配置缓冲区大小,避免浪费
- 绑定CPU(worker_cpu_affinity),提高CPU缓存命中率
- 考虑NUMA架构的内存访问特性

**3. 提升磁盘IO利用率**

- 使用empty_gif模块,避免磁盘访问
- 使用内存盘或SSD
- 启用AIO异步IO
- 使用线程池处理阻塞IO

**4. 提升网络带宽利用率**

- 增大TCP初始拥塞窗口
- 启用HTTP/2
- 启用Gzip压缩
- 优化TCP参数

#### 5.1.3 硬件升级优先级

1. **网卡** - 千兆 → 万兆(效果最明显)
2. **磁盘** - 机械硬盘 → 固态硬盘(提升IOPS)
3. **CPU** - 更高主频、更多核心、更大缓存
4. **内存** - 更大容量、更快访问速度

### 5.2 CPU性能优化

#### 5.2.1 高效使用CPU的三个关键

**1. 使用全部CPU资源**

```nginx
# Worker进程数量应等于CPU核心数
worker_processes auto;  # 自动检测CPU核心数
# 或手动指定
worker_processes 8;
```

**原则:**

- `worker_processes >= CPU核心数` - 使用全部CPU
- `worker_processes = CPU核心数` - 最佳配置(避免进程间竞争)
- `worker_processes > CPU核心数` - 会导致进程间竞争,降低性能

**2. 避免Worker进程做无用功**

- 不要主动让出CPU
- 避免Worker进程间资源争抢
- 避免调用阻塞API(特别是OpenResty中的第三方库)

**3. 减少与其他进程的资源竞争**

```nginx
# 提升Worker进程优先级
worker_priority -20;  # 范围: -20(最高) 到 19(最低)
```

- 移除耗资源的非Nginx进程
- 提高Worker进程优先级,占用更长时间片

#### 5.2.2 进程调度与上下文切换

**进程状态:**

| 状态        | 说明             | 查看命令   |
| ----------- | ---------------- | ---------- |
| R (Running) | 正在运行或就绪   | `ps aux` |
| S (Sleep)   | 可中断睡眠(阻塞) | `ps aux` |
| D           | 不可中断睡眠     | `ps aux` |
| Z           | 僵尸进程         | `ps aux` |
| T           | 停止             | `ps aux` |

**查看上下文切换:**

```bash
# 查看系统级上下文切换
vmstat 1
# 输出: cs列表示每秒上下文切换次数

# 查看系统级上下文切换(dstat)
dstat
# 输出: csw列

# 查看进程级上下文切换
pidstat -w -p <pid> 1
# voluntary context switches (主动切换)
# non voluntary context switches (被动切换)
```

**减少上下文切换的方法:**

1. 保持Worker进程处于R状态
2. 减少主动切换(避免阻塞API)
3. 减少被动切换(提高进程优先级)
4. 绑定CPU(减少进程迁移)
5. 延迟处理新连接(`tcp_defer_accept`)

#### 5.2.3 进程优先级与时间片

**静态优先级(Nice值):**

```nginx
# Nginx配置
worker_priority -20;  # 范围: -20(最高) 到 19(最低)
```

- Nice值越小,优先级越高
- Nice值越小,时间片越长
- 默认为0

**动态优先级(PR值):**

Linux内核会根据进程行为动态调整优先级:

- **2.6.23之前(O(1)调度算法):**

  - 动态优先级 = 静态优先级 ± 5
  - 时间片: 5ms ~ 800ms
- **2.6.23之后(CFS调度算法):**

  - PR = Nice + 20
  - 完全公平调度

**查看进程优先级:**

```bash
ps -eo pid,ni,pri,comm | grep nginx
# ni: Nice值
# pri: 优先级(PR值)
```

### 5.3 多核负载均衡

#### 5.3.1 惊群问题与解决方案

**惊群问题:**

多个Worker进程同时监听同一端口,新连接到来时,所有进程都被唤醒,但只有一个进程能处理,其他进程白白浪费CPU。

**解决方案对比:**

| 方案             | 配置           | 性能 | 说明                |
| ---------------- | -------------- | ---- | ------------------- |
| accept_mutex on  | 应用层加锁     | 低   | 旧版本默认,现已弃用 |
| accept_mutex off | 无锁           | 中   | 现版本默认          |
| reuseport        | 内核层负载均衡 | 高   | Linux 3.9+,推荐     |

**reuseport配置:**

```nginx
http {
    server {
        listen 80 reuseport;  # 启用SO_REUSEPORT
  
        location / {
            proxy_pass http://backend;
        }
    }
}
```

**性能对比:**

- **吞吐量:** reuseport > accept_mutex off > accept_mutex on
- **延迟:** reuseport < accept_mutex off < accept_mutex on
- **延迟标准差:** reuseport < accept_mutex off < accept_mutex on

**要求:**

- Linux内核 3.9+
- CentOS 7+, Ubuntu 14.04+

#### 5.3.2 多队列网卡

**RSS (Receive Side Scaling)**

- 硬件层面,将网络数据包分发到多个CPU队列
- 需要网卡支持
- 提升硬中断处理性能

**RPS (Receive Packet Steering)**

- 软件层面,在软中断阶段分发数据包
- 不需要硬件支持
- 适用于不支持RSS的网卡

**RFS (Receive Flow Steering)**

- 基于RPS,考虑CPU亲和性
- 将同一流的数据包分发到同一CPU
- 提高缓存命中率

**注意:** 这些特性需要根据具体场景测试,不一定都能提升性能。

#### 5.3.3 CPU缓存与绑定

**CPU缓存层级:**

| 缓存     | 大小  | 访问延迟   | 说明     |
| -------- | ----- | ---------- | -------- |
| 寄存器   | -     | ~1 cycle   | CPU内部  |
| L1 Cache | 32KB  | ~4 cycles  | 每核独立 |
| L2 Cache | 256KB | ~12 cycles | 每核独立 |
| L3 Cache | 20MB  | ~40 cycles | 多核共享 |
| 内存     | GB级  | ~60ns      | 系统内存 |

**查看CPU缓存:**

```bash
# 查看L1缓存
lscpu | grep "L1"
# L1d cache: 32K (数据缓存)
# L1i cache: 32K (指令缓存)

# 查看L2缓存
lscpu | grep "L2"
# L2 cache: 256K

# 查看L3缓存
lscpu | grep "L3"
# L3 cache: 20480K
```

**绑定CPU:**

```nginx
# 自动绑定(推荐)
worker_cpu_affinity auto;

# 手动绑定(8核CPU)
worker_processes 8;
worker_cpu_affinity 00000001 00000010 00000100 00001000 00010000 00100000 01000000 10000000;

# 手动绑定(4核CPU,每个Worker绑定2个核)
worker_processes 4;
worker_cpu_affinity 0101 1010 0101 1010;
```

**优点:**

- 提高CPU缓存命中率
- 减少进程迁移开销
- 降低上下文切换成本

#### 5.3.4 NUMA架构

**NUMA (Non-Uniform Memory Access):**

```
[CPU 0-15] ←→ [Memory Node 0: 64GB]
     ↓
  跨节点访问(慢)
     ↓
[CPU 16-31] ←→ [Memory Node 1: 64GB]
```

**特点:**

- 访问本地内存快(近)
- 访问远程内存慢(远,3-4倍延迟)
- 解决多核CPU内存总线瓶颈

**查看NUMA信息:**

```bash
# 查看NUMA节点
numactl --hardware

# 查看NUMA统计
numastat

# 查看进程NUMA使用情况
numastat -p <pid>
```

**优化方案:**

1. **BIOS禁用NUMA** - 获得平均性能
2. **本地访问优先** - 允许访问远程,但优先本地
3. **仅本地访问** - 禁止访问远程节点
4. **绑定Worker到NUMA节点** - 配合worker_cpu_affinity

### 5.4 TCP连接优化

#### 5.4.1 TCP三次握手流程

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
  
    Note over C: connect()
    C->>S: SYN (seq=x)
    Note over C: SYN_SENT
  
    Note over S: listen()
    Note over S: SYN_RECV
    S->>C: SYN+ACK (seq=y, ack=x+1)
  
    C->>S: ACK (ack=y+1)
    Note over C: ESTABLISHED
    Note over S: ESTABLISHED
    Note over S: accept()
```

**状态说明:**

| 状态        | 端     | 说明                        |
| ----------- | ------ | --------------------------- |
| LISTEN      | Server | 监听端口,等待连接           |
| SYN_SENT    | Client | 发送SYN,等待SYN+ACK         |
| SYN_RECV    | Server | 收到SYN,发送SYN+ACK,等待ACK |
| ESTABLISHED | Both   | 连接建立完成                |

**查看连接状态:**

```bash
# 查看所有TCP连接状态
netstat -antp

# 统计各状态连接数
netstat -antp | awk '{print $6}' | sort | uniq -c
```

#### 5.4.2 三次握手相关参数

**Client端参数:**

```bash
# SYN重传次数
net.ipv4.tcp_syn_retries = 6  # 默认6次

# 本地端口范围
net.ipv4.ip_local_port_range = 32768 60999
# 限制了对单个上游服务器的最大并发连接数
```

**Nginx配置:**

```nginx
http {
    # 连接超时(应用层)
    proxy_connect_timeout 60s;
}

stream {
    # 连接超时(四层)
    proxy_connect_timeout 60s;
}
```

**Server端参数:**

```bash
# 半连接队列最大长度
net.ipv4.tcp_max_syn_backlog = 8192

# SYN+ACK重传次数
net.ipv4.tcp_synack_retries = 5  # 默认5次

# 全连接队列最大长度
net.core.somaxconn = 128  # 系统级
```

**Nginx配置:**

```nginx
http {
    server {
        listen 80 backlog=511;  # 全连接队列长度,默认511
    }
}
```

#### 5.4.3 SYN Flood攻击防御

**SYN Flood攻击:**

攻击者伪造大量SYN包,占满半连接队列,导致正常用户无法建立连接。

**防御措施:**

**1. 增大队列长度**

```bash
# 增大网卡接收队列
net.core.netdev_max_backlog = 5000

# 增大半连接队列
net.ipv4.tcp_max_syn_backlog = 8192

# 超出队列时直接丢弃
net.ipv4.tcp_abort_on_overflow = 0  # 0=丢弃,1=发送RST
```

**2. 启用SYN Cookies**

```bash
# 启用SYN Cookies
net.ipv4.tcp_syncookies = 1
```

**SYN Cookies工作原理:**

```mermaid
graph TD
    A[收到SYN] --> B{半连接队列满?}
    B -->|否| C[加入半连接队列]
    B -->|是| D[计算SYN Cookie]
    D --> E[发送SYN+ACK含Cookie]
    E --> F[收到ACK]
    F --> G[验证Cookie]
    G -->|通过| H[直接建立连接]
    G -->|失败| I[丢弃]
```

**注意:**

- SYN Cookies会占用TCP序列号空间
- 导致TCP扩展功能失效(窗口扩展、时间戳等)
- 仅在队列满时启用

#### 5.4.4 文件句柄限制

**三个层级的限制:**

**1. 系统级**

```bash
# 查看系统最大文件句柄数
cat /proc/sys/fs/file-max

# 查看当前使用情况
cat /proc/sys/fs/file-nr
# 输出: 已分配  已使用  最大值

# 设置系统最大值
echo "fs.file-max = 1000000" >> /etc/sysctl.conf
sysctl -p
```

**2. 用户级**

```bash
# 查看当前用户限制
ulimit -n

# 临时修改
ulimit -n 65535

# 永久修改
vi /etc/security/limits.conf
# 添加:
*  soft  nofile  65535
*  hard  nofile  65535
```

**3. 进程级**

```nginx
# Nginx配置
worker_rlimit_nofile 65535;
```

**关系:**

- 进程级 ≤ 用户级 ≤ 系统级
- `worker_connections` 也会受文件句柄限制
- 每个连接消耗2个文件句柄(客户端+上游)

#### 5.4.5 TCP Fast Open

**TFO (TCP Fast Open):**

在SYN包中携带数据,减少一个RTT。

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
  
    Note over C,S: 第一次连接
    C->>S: SYN
    S->>C: SYN+ACK + TFO Cookie
    C->>S: ACK + HTTP Request
    S->>C: HTTP Response
  
    Note over C,S: 第二次连接(使用TFO)
    C->>S: SYN + TFO Cookie + HTTP Request
    Note over S: 验证Cookie
    Note over S: 立即处理请求
    S->>C: SYN+ACK + HTTP Response
    C->>S: ACK
```

**Linux配置:**

```bash
# 启用TFO
net.ipv4.tcp_fastopen = 3
# 0: 禁用
# 1: 作为客户端
# 2: 作为服务器
# 3: 客户端+服务器
```

**Nginx配置:**

```nginx
http {
    server {
        # 服务器端TFO
        listen 80 fastopen=256;  # 队列长度
    }
  
    upstream backend {
        server 192.168.1.10:8080;
    }
  
    location / {
        # 客户端TFO(连接上游)
        proxy_pass http://backend;
        proxy_socket_keepalive on;
    }
}
```

**优点:**

- 减少1个RTT延迟
- 提升连接建立速度
- 适用于短连接场景

**注意:**

- 需要Linux 3.7+
- 需要防范TFO SYN Flood攻击
- 通过fastopen参数限制队列长度

### 5.5 TCP传输优化

#### 5.5.1 滑动窗口

**滑动窗口作用:**

- 流量控制
- 拥塞控制
- 可靠传输
- 处理乱序报文

**发送窗口示例:**

```
发送缓冲区: [已发送已确认|已发送未确认|可发送|不可发送]
             ←----------发送窗口----------→
```

**接收窗口示例:**

```
接收缓冲区: [已接收已读取|已接收未读取|可接收|不可接收]
             ←----------接收窗口----------→
```

**窗口大小通告:**

每个TCP报文都会在头部的Window字段通告自己的接收窗口大小。

#### 5.5.2 TCP缓冲区配置

**读缓冲区(接收):**

```bash
# TCP接收缓冲区
net.ipv4.tcp_rmem = 4096 87380 6291456
# 格式: 最小值 默认值 最大值(字节)

# 覆盖全局设置
net.core.rmem_max = 6291456
```

**写缓冲区(发送):**

```bash
# TCP发送缓冲区
net.ipv4.tcp_wmem = 4096 16384 4194304
# 格式: 最小值 默认值 最大值(字节)

# 覆盖全局设置
net.core.wmem_max = 4194304
```

**自动调整:**

```bash
# 启用自动调整
net.ipv4.tcp_moderate_rcvbuf = 1

# 内存压力阈值
net.ipv4.tcp_mem = 88560 118080 177120
# 格式: 无压力 启动压力 最大值(页,4KB)
```

**Nginx配置:**

```nginx
http {
    server {
        listen 80 rcvbuf=8k sndbuf=8k;  # 设置后无法自动调整
    }
}
```

**缓冲区划分:**

```bash
# 应用缓存与滑动窗口比例
net.ipv4.tcp_adv_win_scale = 1
# 1: 应用缓存 = 总缓冲区 / 2
# 2: 应用缓存 = 总缓冲区 / 4
```

#### 5.5.3 带宽时延积(BDP)

**BDP计算:**

```
BDP = 带宽 × RTT

例如:
带宽 = 100 Mbps = 12.5 MB/s
RTT = 20ms = 0.02s
BDP = 12.5 MB/s × 0.02s = 250 KB
```

**接收窗口应设置为BDP大小,以充分利用带宽。**

**吞吐量计算:**

```
吞吐量 = 窗口大小 / RTT

例如:
窗口 = 64 KB
RTT = 20ms
吞吐量 = 64 KB / 0.02s = 3.2 MB/s = 25.6 Mbps
```

#### 5.5.4 Nagle算法

**Nagle算法目的:**

合并小数据包,减少网络中的小报文数量,提高带宽利用率。

**工作原理:**

```
发送数据:
1. 如果有未确认的数据,缓存新数据
2. 直到收到ACK或缓存达到MSS,才发送

结果:
- 减少小报文数量
- 增加延迟
```

**Nginx配置:**

```nginx
http {
    # 禁用Nagle算法(降低延迟)
    tcp_nodelay on;  # 默认on,仅对keepalive连接生效
  
    # 延迟发送(提高吞吐量)
    postpone_output 1460;  # 默认1460字节
}

stream {
    # 禁用Nagle算法
    tcp_nodelay on;  # 默认on,对所有连接生效
}
```

**选择:**

- **低延迟场景** - `tcp_nodelay on`(禁用Nagle)
- **高吞吐量场景** - `tcp_nodelay off`(启用Nagle)

#### 5.5.5 Cork算法

**Cork算法:**

比Nagle更激进,完全禁止小报文。

```nginx
http {
    # 启用Cork算法(需要配合sendfile)
    tcp_nopush on;  # 默认off
    sendfile on;
}
```

**工作原理:**

- 等待数据填满MSS才发送
- 或等待连接关闭才发送
- 仅在启用sendfile时生效

**注意:** Cork和Nagle可以同时启用,Cork优先级更高。

#### 5.5.6 超时配置

**Nginx超时指令:**

```nginx
http {
    # 客户端Body接收超时(两次读操作间)
    client_body_timeout 60s;
  
    # 发送响应超时(两次写操作间)
    send_timeout 60s;
  
    # 上游连接超时
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

**重传参数:**

```bash
# 重传次数
net.ipv4.tcp_retries1 = 3  # 达到后更新路由缓存
net.ipv4.tcp_retries2 = 15  # 达到后关闭连接
```

### 5.6 磁盘IO优化

#### 5.6.1 磁盘介质选择

| 特性                   | 机械硬盘(HDD)  | 固态硬盘(SSD)      |
| ---------------------- | -------------- | ------------------ |
| **价格**         | 低             | 高                 |
| **容量**         | 大(TB级)       | 小(GB级)           |
| **BPS(吞吐量)**  | 中等           | 高                 |
| **IOPS(随机IO)** | 低(100-200)    | 高(10K-100K+)      |
| **适用场景**     | 顺序读写(日志) | 随机读写(静态资源) |
| **寿命**         | 长             | 短(写次数限制)     |

**性能测试:**

```bash
# 使用fio测试磁盘性能
fio --name=test --filename=/tmp/testfile --size=1G \
    --rw=randread --bs=4k --direct=1 --numjobs=4 \
    --runtime=60 --group_reporting
```

#### 5.6.2 减少磁盘IO的方法

**1. 优化读取**

- 使用sendfile零拷贝
- 使用内存盘(tmpfs)
- 使用SSD固态硬盘
- 启用open_file_cache

**2. 减少写入**

```nginx
http {
    # 提升日志级别,减少日志量
    error_log /var/log/nginx/error.log warn;
  
    # 关闭访问日志
    access_log off;
  
    # 压缩访问日志
    access_log /var/log/nginx/access.log combined gzip;
  
    # 关闭proxy缓冲
    proxy_buffering off;
  
    # 使用syslog(UDP,无磁盘IO)
    access_log syslog:server=192.168.1.100:514 combined;
}
```

**3. 使用线程池**

```nginx
# 编译时启用
./configure --with-threads

# 配置线程池
thread_pool default threads=32 max_queue=65536;

http {
    # 启用AIO和线程池
    aio threads=default;
}
```

#### 5.6.3 Direct IO(直接IO)

**传统IO流程:**

```
用户空间 ←→ 内核缓冲区(Page Cache) ←→ 磁盘
         拷贝1           拷贝2
```

**Direct IO流程:**

```
用户空间 ←→ 磁盘
         拷贝1
```

**Nginx配置:**

```nginx
http {
    location / {
        # 大于10MB的文件使用Direct IO
        directio 10m;
  
        # 对齐方式(一般不需要修改)
        directio_alignment 512;
  
        root /data/files;
    }
}
```

**适用场景:**

- 大文件(几GB)
- 文件不太可能被缓存
- 避免污染Page Cache

**注意:**

- 启用directio会自动禁用sendfile
- 小文件不建议使用(失去缓存优势)

#### 5.6.4 异步IO(AIO)

**传统阻塞IO:**

```
用户进程 → read() → 阻塞等待 → 磁盘读取 → 返回数据 → 继续执行
```

**异步IO:**

```
用户进程 → aio_read() → 继续执行其他任务
                      ↓
              磁盘读取完成 → 回调处理
```

**Nginx配置:**

```nginx
http {
    # 启用AIO
    aio on;  # 默认off
  
    # 对写操作也使用AIO(仅特定场景)
    aio_write on;  # 默认off
  
    # 配合线程池使用
    aio threads=default;
  
    location / {
        root /data/files;
    }
}
```

**aio_write使用场景:**

仅在以下情况启用:

- 接收上游响应
- 启用proxy_buffering
- 写入临时文件

**注意:**

- 需要Linux内核支持(2.6.22+)
- 对写操作通常无需AIO(Page Cache已足够快)

#### 5.6.5 线程池

**线程池架构:**

```mermaid
graph LR
    A[Worker Process] --> B[Task Queue]
    B --> C[Thread 1]
    B --> D[Thread 2]
    B --> E[Thread 3]
    C --> F[阻塞IO操作]
    D --> F
    E --> F
    F --> G[完成后回到Worker]
```

**配置:**

```nginx
# 定义线程池
thread_pool pool1 threads=32 max_queue=65536;
thread_pool pool2 threads=16 max_queue=32768;

http {
    # 使用线程池
    aio threads=pool1;
  
    location /files {
        aio threads=pool2;
        root /data;
    }
}
```

**参数说明:**

| 参数          | 说明             | 默认值 |
| ------------- | ---------------- | ------ |
| `threads`   | 线程数量         | 32     |
| `max_queue` | 任务队列最大长度 | 65536  |

**适用场景:**

- 大量小文件静态资源服务
- 文件缓存(inode cache)失效
- 避免阻塞Worker进程

**性能提升:**

- 官方测试显示最高9倍性能提升
- 具体效果取决于文件数量和缓存命中率

**编译要求:**

```bash
./configure --with-threads
```

#### 5.6.6 AIO读取缓存

```nginx
http {
    # AIO读取缓存大小
    output_buffers 2 32k;  # 2个32KB缓冲区
}
```

### 5.7 零拷贝技术

#### 5.7.1 传统文件发送流程

```mermaid
graph TD
    A[磁盘] -->|DMA拷贝| B[内核缓冲区]
    B -->|CPU拷贝| C[用户空间]
    C -->|CPU拷贝| D[Socket缓冲区]
    D -->|DMA拷贝| E[网卡]
  
    style B fill:#f9f
    style C fill:#9ff
    style D fill:#ff9
```

**步骤:**

1. read(): 磁盘 → 内核缓冲区 → 用户空间 (2次拷贝)
2. send(): 用户空间 → Socket缓冲区 → 网卡 (2次拷贝)

**总计:** 4次拷贝,2次系统调用

#### 5.7.2 sendfile零拷贝

```mermaid
graph TD
    A[磁盘] -->|DMA拷贝| B[内核缓冲区]
    B -->|CPU拷贝| C[Socket缓冲区]
    C -->|DMA拷贝| D[网卡]
  
    style B fill:#f9f
    style C fill:#ff9
```

**步骤:**

1. sendfile(): 磁盘 → 内核缓冲区 → Socket缓冲区 → 网卡 (3次拷贝)

**总计:** 3次拷贝,1次系统调用

**Nginx配置:**

```nginx
http {
    # 启用sendfile
    sendfile on;  # 默认off
  
    # 配合tcp_nopush使用
    tcp_nopush on;
  
    location / {
        root /data/files;
    }
}
```

**注意:**

- 启用directio会自动禁用sendfile
- 两者不能同时使用

#### 5.7.3 gzip_static模块

**问题:** 启用gzip压缩会导致sendfile失效(需要在用户空间压缩)

**解决方案:** 预压缩文件

```bash
# 预压缩文件
cd /data/files
gzip -k -9 index.html  # 生成index.html.gz
```

**Nginx配置:**

```nginx
http {
    # 启用gzip_static
    gzip_static on;  # 默认off,需要编译时启用
    # gzip_static always;  # 不检查客户端是否支持gzip
  
    sendfile on;
  
    location / {
        root /data/files;
    }
}
```

**编译:**

```bash
./configure --with-http_gzip_static_module
```

**工作流程:**

1. 客户端请求 `/index.html`
2. Nginx检查 `/data/files/index.html.gz` 是否存在
3. 如果存在且客户端支持gzip,直接返回 `.gz`文件
4. 否则返回原文件

**gzip_static参数:**

| 值         | 说明                  |
| ---------- | --------------------- |
| `off`    | 禁用(默认)            |
| `on`     | 启用,检查客户端支持   |
| `always` | 启用,不检查客户端支持 |

#### 5.7.4 gunzip模块

**场景:** 客户端不支持gzip,但服务器只有压缩文件

```nginx
http {
    # 编译时启用
    # ./configure --with-http_gunzip_module
  
    gzip_static on;
    gunzip on;  # 实时解压
    gunzip_buffers 16 8k;
  
    location / {
        root /data/files;
    }
}
```

**工作流程:**

1. 客户端不支持gzip
2. 服务器只有 `.gz`文件
3. Nginx实时解压
4. 返回解压后的内容

### 5.8 内存优化

#### 5.8.1 TCMalloc

**TCMalloc (Thread-Caching Malloc):**

Google开发的高性能内存分配器,替代系统默认的malloc。

**优点:**

- 减少内存碎片
- 提升多线程性能
- 降低锁竞争

**安装:**

```bash
# CentOS
yum install gperftools-devel

# Ubuntu
apt-get install libgoogle-perftools-dev
```

**编译Nginx:**

```bash
./configure --with-google_perftools_module
make && make install
```

**配置:**

```nginx
# 主配置
google_perftools_profiles /tmp/tcmalloc;
```

**验证:**

```bash
lsof -p <nginx_pid> | grep tcmalloc
```

### 5.9 性能监控

#### 5.9.1 stub_status模块

```nginx
http {
    server {
        location /nginx_status {
            stub_status;
            allow 127.0.0.1;
            deny all;
        }
    }
}
```

**输出示例:**

```
Active connections: 291
server accepts handled requests
 16630948 16630948 31070465
Reading: 6 Writing: 179 Waiting: 106
```

**字段说明:**

| 字段               | 说明                   |
| ------------------ | ---------------------- |
| Active connections | 当前活跃连接数         |
| accepts            | 已接受的连接总数       |
| handled            | 已处理的连接总数       |
| requests           | 已处理的请求总数       |
| Reading            | 正在读取请求头的连接数 |
| Writing            | 正在发送响应的连接数   |
| Waiting            | 空闲keepalive连接数    |

**编译:**

```bash
./configure --with-http_stub_status_module
```

#### 5.9.2 Google PerfTools

**CPU性能分析:**

```nginx
# 启用CPU profiling
google_perftools_profiles /tmp/profile;
```

**生成火焰图:**

```bash
# 安装pprof
go get -u github.com/google/pprof

# 分析profile文件
pprof --pdf /path/to/nginx /tmp/profile > profile.pdf
```

---

**第五部分总结:**

系统层性能优化是Nginx达到极致性能的关键,本部分详细介绍了:

1. **CPU优化** - 进程数、优先级、绑定、NUMA
2. **多核负载均衡** - reuseport、多队列网卡、CPU缓存
3. **TCP连接优化** - 三次握手、SYN Flood防御、文件句柄、TFO
4. **TCP传输优化** - 滑动窗口、缓冲区、BDP、Nagle/Cork算法
5. **磁盘IO优化** - Direct IO、AIO、线程池
6. **零拷贝** - sendfile、gzip_static、gunzip
7. **内存优化** - TCMalloc
8. **性能监控** - stub_status、PerfTools

通过本部分的学习,你应该能够:

- 理解Linux内核与Nginx的交互
- 配置TCP/IP协议栈参数
- 优化磁盘IO性能
- 使用零拷贝技术
- 监控Nginx性能指标
- 针对具体场景进行性能调优

这些优化措施需要根据实际场景选择性使用,过度优化可能适得其反。建议:

1. 先进行性能测试,找出瓶颈
2. 针对瓶颈进行优化
3. 优化后再次测试,验证效果
4. 逐步迭代,持续改进

---

**待续:第六部分 - 从源码视角深入使用Nginx**

## 第六部分：从源码视角深入使用Nginx

### 6.1 第三方模块源码阅读

#### 6.1.1 第三方模块的基本结构

每个Nginx第三方模块都必须包含以下核心文件:

```
module_name/
├── config          # 必需,定义模块编译配置
├── ngx_module.c    # 核心源码文件
└── ...             # 其他源码文件
```

#### 6.1.2 源码阅读方法

**1. 分析config文件**

`config`文件是configure脚本执行时必须读取的文件,主要完成三件事:

```bash
# 1. 定义模块名称
ngx_addon_name=ngx_http_mymodule

# 2. 将HTTP模块添加到模块数组
HTTP_MODULES="$HTTP_MODULES ngx_http_mymodule"

# 3. 添加源码文件到编译列表
NGX_ADDON_SRCS="$NGX_ADDON_SRCS $ngx_addon_dir/ngx_http_mymodule.c"
```

**2. 分析ngx_module_t结构体**

```c
ngx_module_t ngx_http_mymodule = {
    NGX_MODULE_V1,
    &ngx_http_mymodule_ctx,      /* module context */
    ngx_http_mymodule_commands,  /* module directives */
    NGX_HTTP_MODULE,             /* module type */
    NULL,                        /* init master */
    NULL,                        /* init module */
    NULL,                        /* init process */
    NULL,                        /* init thread */
    NULL,                        /* exit thread */
    NULL,                        /* exit process */
    NULL,                        /* exit master */
    NGX_MODULE_V1_PADDING
};
```

**生命周期回调:**

| 回调方法         | 调用时机         | 进程   |
| ---------------- | ---------------- | ------ |
| `init_module`  | 解析完配置文件后 | Master |
| `init_process` | Worker进程启动时 | Worker |
| `exit_process` | Worker进程退出时 | Worker |
| `exit_master`  | Master进程退出时 | Master |

**注意:** `init_master`, `init_thread`, `exit_thread`目前未被使用。

**3. 分析ngx_command_t指令数组**

```c
static ngx_command_t ngx_http_mymodule_commands[] = {
    {
        ngx_string("mymodule_directive"),
        NGX_HTTP_MAIN_CONF|NGX_HTTP_SRV_CONF|NGX_HTTP_LOC_CONF|NGX_CONF_TAKE1,
        ngx_http_mymodule_set,
        NGX_HTTP_LOC_CONF_OFFSET,
        offsetof(ngx_http_mymodule_loc_conf_t, value),
        NULL
    },
    ngx_null_command
};
```

**4. 分析ngx_http_module_t结构体**

```c
static ngx_http_module_t ngx_http_mymodule_ctx = {
    NULL,                                  /* preconfiguration */
    ngx_http_mymodule_init,                /* postconfiguration */
  
    NULL,                                  /* create main configuration */
    NULL,                                  /* init main configuration */
  
    NULL,                                  /* create server configuration */
    NULL,                                  /* merge server configuration */
  
    ngx_http_mymodule_create_loc_conf,     /* create location configuration */
    ngx_http_mymodule_merge_loc_conf       /* merge location configuration */
};
```

**5. 确定模块生效方式**

模块生效方式有四种:

1. **在HTTP的11个阶段生效** - 通过postconfiguration注册handler
2. **提供新变量** - 通过preconfiguration注册变量
3. **作为过滤模块** - 注册header/body filter
4. **作为反向代理** - 设置content handler

#### 6.1.3 configure脚本工作流程

```mermaid
graph TD
    A[执行./configure] --> B[解析命令行参数]
    B --> C[检测操作系统和编译器特性]
    C --> D[生成ngx_modules.c]
    C --> E[生成Makefile]
    D --> F[显示配置结果]
    E --> F
```

**configure主要工作:**

1. **解析参数** - 处理 `--add-module`, `--with-*`等选项
2. **检测特性** - 根据OS和架构选择特性(如AIO)
3. **生成文件** - 生成 `ngx_modules.c`和 `Makefile`
4. **显示结果** - 输出配置摘要和路径信息

**配置结果示例:**

```
Configuration summary
  + using system PCRE library
  + using system OpenSSL library
  + using system zlib library

  nginx path prefix: "/usr/local/nginx"
  nginx binary file: "/usr/local/nginx/sbin/nginx"
  nginx modules path: "/usr/local/nginx/modules"
  nginx configuration prefix: "/usr/local/nginx/conf"
  nginx configuration file: "/usr/local/nginx/conf/nginx.conf"
  nginx pid file: "/usr/local/nginx/logs/nginx.pid"
  nginx error log file: "/usr/local/nginx/logs/error.log"
  nginx http access log file: "/usr/local/nginx/logs/access.log"
```

### 6.2 Nginx启动流程

#### 6.2.1 进程启动回调时机

```mermaid
sequenceDiagram
    participant M as Master进程
    participant W as Worker进程
  
    Note over M: 1. 启动Master进程
    M->>M: 解析配置文件
    M->>M: 调用所有模块的init_module()
    M->>M: 创建共享内存
    M->>M: 监听端口
  
    Note over M: 2. 启动Worker进程
    M->>W: fork() Worker进程
    W->>W: 调用所有模块的init_process()
    W->>W: 进入事件循环
  
    Note over W: 3. Worker进程退出
    W->>W: 调用所有模块的exit_process()
  
    Note over M: 4. Master进程退出
    M->>M: 调用所有模块的exit_master()
```

#### 6.2.2 ngx_cycle_t核心结构体

`ngx_cycle_t`是Nginx最核心的数据结构,贯穿整个生命周期:

```c
struct ngx_cycle_s {
    ngx_array_t          modules;         /* 所有模块数组 */
    ngx_array_t          listening;       /* 监听端口数组 */
    ngx_array_t          open_files;      /* 打开的文件 */
    ngx_list_t           shared_memory;   /* 共享内存列表 */
    ngx_queue_t          free_connections;/* 空闲连接池 */
    ngx_log_t           *log;             /* 日志对象 */
    ngx_connection_t    *connections;     /* 连接池 */
    // ... 更多字段
};
```

**用途:**

- 调试时查看模块信息
- 查看监听端口和处理函数
- 查看连接池使用情况
- 查看共享内存分配情况
- 查看打开的文件列表

#### 6.2.3 Nginx启动详细流程

```mermaid
graph TD
    A[执行nginx命令] --> B[解析命令行参数]
    B --> C[获取配置文件路径]
    C --> D[解析配置文件]
    D --> E[调用核心模块的init_module]
    E --> F[初始化共享内存]
    F --> G[监听端口]
    G --> H[调用所有模块的init_module]
    H --> I{启动方式}
  
    I -->|单进程模式| J[Worker事件循环]
    I -->|Master-Worker模式| K[启动Worker进程]
  
    K --> L[Worker进程调用init_process]
    L --> M[启动Cache Manager进程]
    L --> N[启动Cache Loader进程]
    L --> J
  
    J --> O[检查并分发事件]
    O --> P[处理网络事件]
    O --> Q[处理定时器事件]
    P --> O
    Q --> O
```

**关键步骤说明:**

1. **解析配置文件(Master进程)** - 所有HTTP模块的配置都在此时解析
2. **监听端口** - Master和Worker进程都会监听(继承)
3. **init_module回调** - 在Master进程中调用
4. **init_process回调** - 在Worker进程中调用(OpenResty的 `init_worker_by_lua`在此执行)
5. **Cache Loader** - 加载磁盘缓存到内存
6. **Cache Manager** - 定期淘汰过期缓存

### 6.3 HTTP模块初始化

#### 6.3.1 HTTP模块的8个回调方法

```c
typedef struct {
    ngx_int_t   (*preconfiguration)(ngx_conf_t *cf);
    ngx_int_t   (*postconfiguration)(ngx_conf_t *cf);
  
    void       *(*create_main_conf)(ngx_conf_t *cf);
    char       *(*init_main_conf)(ngx_conf_t *cf, void *conf);
  
    void       *(*create_srv_conf)(ngx_conf_t *cf);
    char       *(*merge_srv_conf)(ngx_conf_t *cf, void *prev, void *conf);
  
    void       *(*create_loc_conf)(ngx_conf_t *cf);
    char       *(*merge_loc_conf)(ngx_conf_t *cf, void *prev, void *conf);
} ngx_http_module_t;
```

#### 6.3.2 HTTP模块初始化流程

```mermaid
graph TD
    A[开始解析http块] --> B[初始化HTTP模块序号]
    B --> C[调用所有HTTP模块的preconfiguration]
    C --> D[调用create_main_conf]
    C --> E[调用create_srv_conf]
    C --> F[调用create_loc_conf]
  
    D --> G[解析http块配置指令]
    E --> G
    F --> G
  
    G --> H[调用init_main_conf]
    H --> I[合并server和location配置]
    I --> J[调用merge_srv_conf]
    I --> K[调用merge_loc_conf]
  
    J --> L[构造location二叉查找树]
    K --> L
    L --> M[初始化HTTP阶段动态数组]
    M --> N[调用所有HTTP模块的postconfiguration]
    N --> O[构造HTTP阶段处理数组]
    O --> P[构造虚拟主机散列表]
    P --> Q[构造监听端口]
```

#### 6.3.3 在HTTP阶段注册Handler

**方法一: 在postconfiguration中注册**

```c
static ngx_int_t
ngx_http_mymodule_init(ngx_conf_t *cf)
{
    ngx_http_handler_pt        *h;
    ngx_http_core_main_conf_t  *cmcf;
  
    cmcf = ngx_http_conf_get_module_main_conf(cf, ngx_http_core_module);
  
    /* 在ACCESS阶段注册handler */
    h = ngx_array_push(&cmcf->phases[NGX_HTTP_ACCESS_PHASE].handlers);
    if (h == NULL) {
        return NGX_ERROR;
    }
  
    *h = ngx_http_mymodule_handler;
  
    return NGX_OK;
}
```

**方法二: 反向代理模块(排他性)**

```c
static char *
ngx_http_mymodule_pass(ngx_conf_t *cf, ngx_command_t *cmd, void *conf)
{
    ngx_http_core_loc_conf_t  *clcf;
  
    clcf = ngx_http_conf_get_module_loc_conf(cf, ngx_http_core_module);
    clcf->handler = ngx_http_mymodule_handler;  /* 直接设置handler */
  
    return NGX_CONF_OK;
}
```

#### 6.3.4 注册过滤模块

**过滤模块链表结构:**

```
ngx_http_top_header_filter → filter1 → filter2 → ... → ngx_http_header_filter
ngx_http_top_body_filter   → filter1 → filter2 → ... → ngx_http_write_filter
```

**注册方法:**

```c
static ngx_http_output_header_filter_pt  ngx_http_next_header_filter;
static ngx_http_output_body_filter_pt    ngx_http_next_body_filter;

static ngx_int_t
ngx_http_myfilter_init(ngx_conf_t *cf)
{
    /* 插入到header filter链表头部 */
    ngx_http_next_header_filter = ngx_http_top_header_filter;
    ngx_http_top_header_filter = ngx_http_myfilter_header_filter;
  
    /* 插入到body filter链表头部 */
    ngx_http_next_body_filter = ngx_http_top_body_filter;
    ngx_http_top_body_filter = ngx_http_myfilter_body_filter;
  
    return NGX_OK;
}

/* Header过滤函数 */
static ngx_int_t
ngx_http_myfilter_header_filter(ngx_http_request_t *r)
{
    /* 处理响应头 */
    // ...
  
    /* 调用下一个filter */
    return ngx_http_next_header_filter(r);
}

/* Body过滤函数 */
static ngx_int_t
ngx_http_myfilter_body_filter(ngx_http_request_t *r, ngx_chain_t *in)
{
    /* 处理响应体 */
    // ...
  
    /* 调用下一个filter */
    return ngx_http_next_body_filter(r, in);
}
```

**注意:**

- 每个过滤模块都有自己的 `static`局部变量 `next_*_filter`
- 通过这种方式构成单链表
- 过滤模块的执行顺序与编译顺序相反(后编译的先执行)

### 6.4 Rewrite模块与if指令

#### 6.4.1 Rewrite脚本指令

Rewrite模块提供5个脚本式指令,都在REWRITE阶段执行:

| 指令        | 功能            |
| ----------- | --------------- |
| `set`     | 设置变量        |
| `if`      | 条件判断        |
| `break`   | 中断rewrite脚本 |
| `rewrite` | URL重写         |
| `return`  | 返回响应        |

#### 6.4.2 Rewrite脚本执行原理

**类似协程的执行方式:**

```c
/* Rewrite脚本指令数组 */
ngx_http_rewrite_loc_conf_t {
    ngx_array_t  *codes;  /* 指令数组 */
};

/* 执行上下文 */
ngx_http_script_engine_t {
    u_char     *ip;    /* 指令指针(类似CPU的IP寄存器) */
    u_char     *sp;    /* 数据栈指针 */
    ngx_http_request_t  *request;  /* 当前请求 */
    // ...
};
```

**执行流程:**

1. 将所有rewrite指令编译成指令数组
2. 每个请求维护自己的执行上下文
3. `ip`指针指向下一条待执行的指令
4. 顺序执行指令,直到遇到 `break`或执行完毕

#### 6.4.3 if指令的"邪恶"之处

**问题示例1: 连续if导致配置丢失**

```nginx
location / {
    set $a 1;
  
    if ($a) {
        add_header X-First 1;  # 添加头部1
    }
  
    if ($a) {
        add_header X-Second 2;  # 添加头部2
    }
  
    return 204;
}
```

**预期结果:** 响应包含 `X-First: 1`和 `X-Second: 2`两个头部

**实际结果:** 只包含 `X-Second: 2`,`X-First`丢失!

**原因分析:**

```mermaid
graph TD
    A[请求开始] --> B[使用location的配置]
    B --> C{第一个if为真?}
    C -->|是| D[切换到if块的配置]
    D --> E[执行add_header X-First]
    E --> F{第二个if为真?}
    F -->|是| G[切换到第二个if块的配置]
    G --> H[第一个if的配置被覆盖!]
    H --> I[执行add_header X-Second]
    I --> J[return 204]
  
    style H fill:#f99
```

**核心问题:**

- 每个if块都有自己的配置(`loc_conf`)
- if块内的配置会替换当前请求的配置
- 连续的if块会相互覆盖
- 第一个if块的配置完全失效

**问题示例2: proxy_pass丢失**

```nginx
location / {
    if ($condition1) {
        proxy_pass http://backend1;
    }
  
    if ($condition2) {
        # 第二个if块没有proxy_pass
        set $var value;
    }
  
    # 如果condition2为真,proxy_pass配置丢失!
}
```

**结果:** 如果两个if都为真,会返回500错误或crash(旧版本)

#### 6.4.4 if指令的正确用法

**原则:**

1. **理解执行时机** - if在REWRITE阶段执行,但影响后续所有阶段
2. **避免连续if** - 多个if块会相互覆盖配置
3. **if块内配置完整** - if块内的配置必须能独立处理请求
4. **使用break中断** - 需要时使用break阻止后续if执行

**正确示例1: 使用break**

```nginx
location / {
    if ($condition1) {
        proxy_pass http://backend1;
        break;  # 阻止后续if执行
    }
  
    if ($condition2) {
        proxy_pass http://backend2;
        break;
    }
  
    proxy_pass http://backend_default;
}
```

**正确示例2: 嵌套if**

```nginx
location / {
    if ($condition1) {
        if ($condition2) {
            proxy_pass http://backend;
        }
    }
}
```

**正确示例3: 使用map替代**

```nginx
map $condition $backend {
    default  http://backend_default;
    "1"      http://backend1;
    "2"      http://backend2;
}

location / {
    proxy_pass $backend;
}
```

**为什么if性能好?**

if指令虽然有陷阱,但性能极高,因为:

- 编译成字节码,执行快速
- 避免了传统if语句的开销
- 适合高并发场景

### 6.5 Core Dump调试

#### 6.5.1 启用Core Dump

```nginx
# 设置core文件大小限制
worker_rlimit_core 500M;

# 设置core文件存放目录
working_directory /tmp/nginx_core;
```

**系统配置:**

```bash
# 查看core文件大小限制
ulimit -c

# 设置unlimited
ulimit -c unlimited

# 永久设置
echo "* soft core unlimited" >> /etc/security/limits.conf
```

#### 6.5.2 使用GDB分析Core Dump

**启动GDB:**

```bash
gdb /path/to/nginx /tmp/nginx_core/core.12345
```

**常用GDB命令:**

| 命令                    | 说明             | 示例                    |
| ----------------------- | ---------------- | ----------------------- |
| `bt`                  | 显示函数调用栈   | `bt`                  |
| `frame N`             | 切换到第N层栈帧  | `frame 1`             |
| `print var`           | 打印变量值       | `p cycle->log`        |
| `list`                | 显示当前代码     | `list`                |
| `x/addr`              | 查看内存地址     | `x/10x 0x12345`       |
| `info registers`      | 查看寄存器       | `i r`                 |
| `thread apply all bt` | 所有线程的调用栈 | `thread apply all bt` |

**分析ngx_cycle_t:**

```gdb
# 切换到ngx_process_events_and_timers栈帧
(gdb) frame 1

# 查看cycle变量
(gdb) p *cycle
$1 = {
  conf_ctx = 0x...,
  pool = 0x...,
  log = 0x...,
  modules = {...},
  ...
}

# 查看所有模块
(gdb) p cycle->modules[0]
$2 = (ngx_module_t *) 0x...

# 查看模块名称
(gdb) p cycle->modules[10]->name
$3 = "ngx_http_core_module"

# 查看模块指令
(gdb) p cycle->modules[10]->commands[3]
$4 = {
  name = {len = 8, data = "location"},
  ...
}

# 查看监听端口
(gdb) p *(ngx_listening_t *)((ngx_array_t *)&cycle->listening)->elts
$5 = {
  fd = 6,
  sockaddr = {...},
  ...
}

# 查看共享内存
(gdb) p *(ngx_shm_zone_t *)cycle->shared_memory.part.elts
$6 = {
  shm = {addr = 0x..., size = 10485760, name = "limit_conn_zone", ...},
  ...
}
```

#### 6.5.3 Debug Points

```nginx
# 遇到特定错误时生成core dump
debug_points abort;  # 生成core dump并退出
# debug_points stop;   # 直接退出,不生成core dump
```

**触发条件:**

仅在模块调用 `ngx_debug_point()`时生效,例如:

- SSI模块: "the same buf was used in ssi"
- Slab分配器: "ngx_slab_alloc() failed: no memory"

**用途:**

- 开发环境调试
- 定位疑难问题
- 生产环境不建议启用

### 6.6 Debug日志分析

#### 6.6.1 启用Debug日志

**编译时启用:**

```bash
./configure --with-debug
```

**配置debug_connection:**

```nginx
events {
    # 只对特定IP启用debug日志
    debug_connection 192.168.1.100;
    debug_connection 10.0.0.0/8;
}

http {
    error_log /var/log/nginx/error.log info;  # 默认级别
}
```

**作用:**

- 避免debug日志过多
- 只对开发/运维机器启用
- 生产环境可安全使用

#### 6.6.2 Debug日志的5个关键部分

**1. 建立连接与SSL握手**

```
2024/01/01 12:00:00 [debug] 12345#0: *1 accept: 192.168.1.100:54321 fd:3
2024/01/01 12:00:00 [debug] 12345#0: *1 event timer add: 3: 60000:1234567890
2024/01/01 12:00:00 [debug] 12345#0: *1 SSL_do_handshake: 1
2024/01/01 12:00:00 [debug] 12345#0: *1 SSL: TLSv1.2, cipher: "ECDHE-RSA-AES128-GCM-SHA256"
2024/01/01 12:00:00 [debug] 12345#0: *1 SSL reused session
```

**关键点:**

- 客户端IP和端口
- SSL协议版本和加密套件
- 是否复用SSL会话

**2. 接收HTTP请求头**

```
2024/01/01 12:00:00 [debug] 12345#0: *1 http process request line
2024/01/01 12:00:00 [debug] 12345#0: *1 http request line: "GET /index.html HTTP/1.1"
2024/01/01 12:00:00 [debug] 12345#0: *1 http uri: "/index.html"
2024/01/01 12:00:00 [debug] 12345#0: *1 http args: ""
2024/01/01 12:00:00 [debug] 12345#0: *1 http exten: "html"

2024/01/01 12:00:00 [debug] 12345#0: *1 http process request header line
2024/01/01 12:00:00 [debug] 12345#0: *1 http header: "Host: example.com"
2024/01/01 12:00:00 [debug] 12345#0: *1 http header: "User-Agent: curl/7.29.0"
2024/01/01 12:00:00 [debug] 12345#0: *1 http header: "Accept: */*"
```

**关键点:**

- 请求方法、URI、协议版本
- 所有请求头部
- URI参数解析

**3. HTTP处理阶段**

```
2024/01/01 12:00:00 [debug] 12345#0: *1 http process request
2024/01/01 12:00:00 [debug] 12345#0: *1 rewrite phase: 0
2024/01/01 12:00:00 [debug] 12345#0: *1 test location: "/"
2024/01/01 12:00:00 [debug] 12345#0: *1 test location: "/api"
2024/01/01 12:00:00 [debug] 12345#0: *1 using configuration "/"
2024/01/01 12:00:00 [debug] 12345#0: *1 http cl:-1 max:1048576
2024/01/01 12:00:00 [debug] 12345#0: *1 rewrite phase: 2
2024/01/01 12:00:00 [debug] 12345#0: *1 post rewrite phase: 3
2024/01/01 12:00:00 [debug] 12345#0: *1 generic phase: 4
2024/01/01 12:00:00 [debug] 12345#0: *1 generic phase: 5
2024/01/01 12:00:00 [debug] 12345#0: *1 access phase: 6
2024/01/01 12:00:00 [debug] 12345#0: *1 access phase: 7
2024/01/01 12:00:00 [debug] 12345#0: *1 post access phase: 8
2024/01/01 12:00:00 [debug] 12345#0: *1 try files phase: 9
2024/01/01 12:00:00 [debug] 12345#0: *1 content phase: 10
```

**关键点:**

- **using configuration** - 最终选中的location(非常重要!)
- 各个阶段的执行顺序
- 缓存是否命中

**4. 反向代理(发送上游请求)**

```
2024/01/01 12:00:00 [debug] 12345#0: *1 http proxy connect: 192.168.1.10:8080
2024/01/01 12:00:00 [debug] 12345#0: *1 http proxy header:
"GET /api/users HTTP/1.1
Host: backend.example.com
Connection: close
User-Agent: nginx
X-Real-IP: 192.168.1.100
X-Forwarded-For: 192.168.1.100
"
```

**关键点:**

- 发送给上游的完整请求头
- 可以快速定位配置错误

**5. 构造和发送响应**

```
2024/01/01 12:00:00 [debug] 12345#0: *1 http proxy status 200 "200 OK"
2024/01/01 12:00:00 [debug] 12345#0: *1 http proxy header: "Server: nginx"
2024/01/01 12:00:00 [debug] 12345#0: *1 http proxy header: "Content-Type: text/html"
2024/01/01 12:00:00 [debug] 12345#0: *1 http proxy header: "Content-Length: 1234"

2024/01/01 12:00:00 [debug] 12345#0: *1 http output filter "/index.html?"
2024/01/01 12:00:00 [debug] 12345#0: *1 http copy filter: "/index.html?"
2024/01/01 12:00:00 [debug] 12345#0: *1 http postpone filter "/index.html?"
2024/01/01 12:00:00 [debug] 12345#0: *1 http gzip filter
2024/01/01 12:00:00 [debug] 12345#0: *1 http chunked filter
2024/01/01 12:00:00 [debug] 12345#0: *1 http write filter: l:1 f:0 s:1234
2024/01/01 12:00:00 [debug] 12345#0: *1 http write filter limit 0
```

**关键点:**

- 上游响应的状态码和头部
- 过滤模块的执行顺序
- 响应体的发送过程

#### 6.6.3 Debug日志分析技巧

**1. 关注"using configuration"**

这行日志显示最终选中的location,是定位配置问题的关键:

```
2024/01/01 12:00:00 [debug] 12345#0: *1 using configuration "/api"
```

如果选中的location不符合预期,说明location匹配规则有问题。

**2. 检查上游请求**

查看"http proxy header"部分,确认发送给上游的请求是否正确:

```
http proxy header:
"GET /api/users HTTP/1.1
Host: backend.example.com
X-Custom-Header: value
"
```

**3. 跟踪过滤模块**

通过过滤模块的执行顺序,可以了解响应的处理流程:

```
http output filter → copy filter → postpone filter → gzip filter → chunked filter → write filter
```

**4. 查看缓存命中**

```
2024/01/01 12:00:00 [debug] 12345#0: *1 http file cache exists: /path/to/cache/file
```

如果看到这行,说明缓存命中,不会访问上游。

---

**第六部分总结:**

从源码视角深入使用Nginx是掌握Nginx的最高境界,本部分详细介绍了:

1. **第三方模块源码阅读** - config文件、ngx_module_t、ngx_command_t、ngx_http_module_t
2. **Nginx启动流程** - 进程启动回调、ngx_cycle_t结构体、Master-Worker模式
3. **HTTP模块初始化** - 8个回调方法、注册handler、注册过滤模块
4. **Rewrite模块与if指令** - 脚本执行原理、if指令的陷阱、正确用法
5. **Core Dump调试** - 启用core dump、GDB命令、分析ngx_cycle_t
6. **Debug日志分析** - 5个关键部分、分析技巧

通过本部分的学习,你应该能够:

- 阅读和理解第三方模块源码
- 理解Nginx的启动和初始化流程
- 开发自己的Nginx模块
- 正确使用if指令,避免常见陷阱
- 使用GDB调试Nginx问题
- 通过debug日志快速定位问题

这些技能对于深入理解Nginx、定位复杂问题、开发高性能模块都是必不可少的。

---

## 全书总结

恭喜你完成了Nginx学习笔记的全部内容!让我们回顾一下这六个部分:

### 学习路径回顾

```mermaid
graph LR
    A[第一部分: 初识Nginx] --> B[第二部分: 基础架构]
    B --> C[第三部分: HTTP模块]
    C --> D[第四部分: 反向代理与负载均衡]
    D --> E[第五部分: 系统层性能优化]
    E --> F[第六部分: 源码视角]
  
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#ffe1f5
    style D fill:#e1ffe1
    style E fill:#f5e1ff
    style F fill:#ffe1e1
```

### 核心知识点

1. **Nginx基础** - 安装、配置、命令行、基本使用
2. **架构设计** - Master-Worker、事件驱动、模块系统、内存管理
3. **HTTP处理** - 11个阶段、变量系统、过滤模块、访问控制
4. **反向代理** - 负载均衡算法、proxy模块、缓存、upstream
5. **性能优化** - CPU、网络、磁盘、零拷贝、监控
6. **源码分析** - 模块开发、启动流程、调试技巧

### 实战能力

通过本笔记的学习,你应该具备以下能力:

- ✅ 独立搭建和配置Nginx服务器
- ✅ 配置静态资源服务、反向代理、负载均衡
- ✅ 实现访问控制、限流、防盗链等安全功能
- ✅ 配置HTTPS和HTTP/2
- ✅ 进行系统层性能优化
- ✅ 阅读第三方模块源码
- ✅ 使用GDB和debug日志定位问题
- ✅ 开发自己的Nginx模块

### 继续学习

Nginx的学习是一个持续的过程,建议:

1. **实践为主** - 在实际项目中应用所学知识
2. **阅读源码** - 深入理解Nginx内部实现
3. **关注社区** - 了解最新特性和最佳实践
4. **学习OpenResty** - 使用Lua扩展Nginx功能
5. **性能测试** - 使用ab、wrk等工具进行压测
6. **监控运维** - 使用Prometheus、Grafana等监控Nginx

### 参考资源

- **官方文档:** http://nginx.org/en/docs/
- **OpenResty:** https://openresty.org/
- **Nginx源码:** https://github.com/nginx/nginx

---

**感谢你的学习!祝你在Nginx的道路上越走越远!** 🚀
