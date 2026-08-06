# Nginx 学习笔记 · 第二册：HTTP 模块

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
