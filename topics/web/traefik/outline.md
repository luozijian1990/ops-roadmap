# Traefik 系统学习笔记大纲

## 第 01 章 · Getting-Started · 入门与配置模型

### Traefik 和 Nginx 的代理职责如何对应

<!-- src: temp/new-traefik/01-Getting-Started.md; temp/new-traefik/10-Install-Configuration.md; temp/new-traefik/22-Routing.md -->

#### 从 Nginx 对象迁移，而不是逐行翻译指令

#### 能力边界和迁移判断

### 一次请求如何经过监听、匹配、策略和后端

<!-- src: temp/new-traefik/01-Getting-Started.md; temp/new-traefik/10-Install-Configuration.md; temp/new-traefik/22-Routing.md -->

#### 用证据判断请求停在哪里

#### 如何验证这一模型

## 第 02 章 · Quick-Start · 快速开始

### 用 Compose 建立可重复的代理和后端环境

<!-- src: temp/new-traefik/02-Quick-Start.md; temp/new-traefik/03-Setup.md -->

#### 文件、端口与依赖

#### 启动与业务验收

### Kubernetes 快速验证应保持多小的闭环

<!-- src: temp/new-traefik/02-Quick-Start.md; temp/new-traefik/03-Setup.md -->

#### 统一实验包与依赖入口

## 第 03 章 · Setup · 部署与运行环境

### Kubernetes 与 Swarm 部署怎样验证权限和网络

<!-- src: temp/new-traefik/03-Setup.md; temp/new-traefik/10-Install-Configuration.md -->

#### Kubernetes：先固定 Chart，再渲染配置

#### Swarm：服务标签和 overlay 网络

### 将最小实验变成可重复部署环境需要补什么

<!-- src: temp/new-traefik/03-Setup.md; temp/new-traefik/10-Install-Configuration.md -->

#### Swarm 完整 stack 的网络与回滚

## 第 04 章 · Expose · 发布应用服务

### 从运行一个容器到发布一个服务还缺什么

<!-- src: temp/new-traefik/04-Expose.md; temp/new-traefik/22-Routing.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md; temp/new-traefik/25-Middlewares.md -->

### 用路径分流发布前端和 API

<!-- src: temp/new-traefik/04-Expose.md; temp/new-traefik/22-Routing.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md; temp/new-traefik/25-Middlewares.md -->

### HTTPS、粘性与发布验收应怎样组合

<!-- src: temp/new-traefik/04-Expose.md; temp/new-traefik/22-Routing.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md; temp/new-traefik/25-Middlewares.md -->

## 第 05 章 · Secure · 应用入口安全

### JWT 验签与业务授权分别保证什么

<!-- src: temp/new-traefik/05-Secure.md -->

### OIDC 登录流程为何不能简化成检查一个 Header

<!-- src: temp/new-traefik/05-Secure.md -->

### WAF 应如何从规则上线走到可运营

<!-- src: temp/new-traefik/05-Secure.md -->

## 第 06 章 · Observe · 观测方法与排障实践

### 怎样从四种观测信号形成诊断问题

<!-- src: temp/new-traefik/06-Observe.md; temp/new-traefik/18-Observability.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/25-Middlewares.md -->

### 入口和配置发现失败怎样定位

<!-- src: temp/new-traefik/06-Observe.md; temp/new-traefik/18-Observability.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/25-Middlewares.md -->

### 路由未命中与应用 404 怎样区分

<!-- src: temp/new-traefik/06-Observe.md; temp/new-traefik/18-Observability.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/25-Middlewares.md -->

#### 一个可控的实验后端

### 认证拒绝、连接失败和超时怎样归因

<!-- src: temp/new-traefik/06-Observe.md; temp/new-traefik/18-Observability.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/25-Middlewares.md -->

#### 使用同一故障后端作对照

#### 重试与重复执行的未知窗口

### 配置更新、端点变化与资源饱和怎样复现

<!-- src: temp/new-traefik/06-Observe.md; temp/new-traefik/18-Observability.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/25-Middlewares.md -->

#### 让实验一次只改变一个变量

#### Trace 只解释实际收到的 Span

## 第 07 章 · Migrate · 版本迁移策略

### 镜像、Chart、CRD 兼容矩阵怎样制定

<!-- src: temp/new-traefik/07-Migrate.md; temp/new-traefik/08-Traefik-v2-to-v3.md; temp/new-traefik/38-Deprecation-Notices.md -->

### 灰度、回滚与证书状态怎样分别保护

<!-- src: temp/new-traefik/07-Migrate.md; temp/new-traefik/08-Traefik-v2-to-v3.md; temp/new-traefik/38-Deprecation-Notices.md -->

#### 分离回滚对象

#### 可审计的回滚实验

#### 小版本变更必须落到具体配置和查询

## 第 08 章 · Traefik-v2-to-v3 · 从 v2 迁移到 v3

### 旧版本规则与 Provider 怎样逐项迁移

<!-- src: temp/new-traefik/08-Traefik-v2-to-v3.md -->

### 从兼容运行迁移到纯 v3 规则需要哪些步骤

<!-- src: temp/new-traefik/08-Traefik-v2-to-v3.md -->

#### v2 到 v3 的安装与观测迁移表

## 第 09 章 · Reference · 参考文档导航

### 面对一个配置问题应先查哪类参考

<!-- src: temp/new-traefik/09-Reference.md; temp/new-traefik/10-Install-Configuration.md; temp/new-traefik/19-Routing-Configuration.md; temp/new-traefik/37-Security.md; temp/new-traefik/38-Deprecation-Notices.md -->

### 如何把字段说明转成可执行的变更记录

<!-- src: temp/new-traefik/09-Reference.md; temp/new-traefik/10-Install-Configuration.md; temp/new-traefik/19-Routing-Configuration.md; temp/new-traefik/37-Security.md; temp/new-traefik/38-Deprecation-Notices.md -->

## 第 10 章 · Install-Configuration · 安装配置

### 安装配置、路由配置与运行时状态怎样分工

<!-- src: temp/new-traefik/10-Install-Configuration.md; temp/new-traefik/18-Observability.md -->

#### 配置归属表

#### 用一次变更对比热更新和重启

### 管理 API、Dashboard 与 Ping 怎样分别启用和保护

<!-- src: temp/new-traefik/10-Install-Configuration.md; temp/new-traefik/18-Observability.md -->

#### 三条地址代表三种证据

#### 不用探活替代业务检查

### 监听端口、重定向与真实客户端地址如何设置

<!-- src: temp/new-traefik/10-Install-Configuration.md; temp/new-traefik/18-Observability.md -->

#### TCP、UDP 与 HTTPS 的区别

#### 信任代理头要从上一跳开始

### 生命周期、连接参数和 Options List 怎样按用途阅读

<!-- src: temp/new-traefik/10-Install-Configuration.md; temp/new-traefik/18-Observability.md -->

#### 路径处理阶段不能与中间件改写混为一谈

## 第 11 章 · Configuration-Discovery · 配置发现

### Docker 和 Swarm 如何发现端口与网络

<!-- src: temp/new-traefik/11-Configuration-Discovery.md; temp/new-traefik/12-Kubernetes.md; temp/new-traefik/13-Hashicorp.md; temp/new-traefik/14-KV-Stores.md; temp/new-traefik/15-Others.md; temp/new-traefik/36-Label-&-Tag-Providers.md -->

#### 在第02章环境中增加发现能力

#### 多网络和 Swarm 的特有边界

### File、HTTP、KV 和其他发现源如何选择

<!-- src: temp/new-traefik/11-Configuration-Discovery.md; temp/new-traefik/12-Kubernetes.md; temp/new-traefik/13-Hashicorp.md; temp/new-traefik/14-KV-Stores.md; temp/new-traefik/15-Others.md; temp/new-traefik/36-Label-&-Tag-Providers.md -->

#### HTTP 拉取和 File 监听不是同一种更新机制

## 第 12 章 · Kubernetes · Kubernetes 配置发现

### 五种 Kubernetes Provider 的发现对象有何区别

<!-- src: temp/new-traefik/12-Kubernetes.md -->

### Watch 范围、RBAC 与状态地址怎样配合

<!-- src: temp/new-traefik/12-Kubernetes.md -->

### Gateway API 与 Knative 的版本依赖怎样核验

<!-- src: temp/new-traefik/12-Kubernetes.md -->

#### 标准 Prefix 与 Traefik 实现选项的区别

## 第 13 章 · Hashicorp · HashiCorp 服务发现

### Consul KV 与 Consul Catalog 为什么是两种 Provider

<!-- src: temp/new-traefik/13-Hashicorp.md -->

### Nomad 服务发现如何随分配实例变化

<!-- src: temp/new-traefik/13-Hashicorp.md -->

### 一致性、健康和发现延迟如何共同影响故障转移

<!-- src: temp/new-traefik/13-Hashicorp.md -->

#### Consul Catalog 注册、健康摘除、恢复与注销

## 第 14 章 · KV-Stores · KV 存储发现

### KV Provider 如何把一棵配置树变成路由

<!-- src: temp/new-traefik/14-KV-Stores.md -->

### 四种存储连接需要哪些显式约束

<!-- src: temp/new-traefik/14-KV-Stores.md -->

### 多 key 更新怎样避免半份配置

<!-- src: temp/new-traefik/14-KV-Stores.md -->

## 第 15 章 · Others · File、ECS 与 HTTP 发现

### 热更新、节流、对象引用和失效配置怎样诊断

<!-- src: temp/new-traefik/15-Others.md -->

#### 一次更新要观察三个状态

#### 名称不是全局字符串

### ECS 发现如何同时受 IAM、集群范围和任务网络影响

<!-- src: temp/new-traefik/15-Others.md -->

### HTTP Provider 的返回值怎样成为可控发布接口

<!-- src: temp/new-traefik/15-Others.md -->

#### ECS 的最小读取操作集与两类目标地址

## 第 16 章 · TLS · TLS 基础设施

### TLS 基础设施与路由上的 TLS 配置怎样分工

<!-- src: temp/new-traefik/16-TLS.md; temp/new-traefik/17-Certificate-Resolvers.md; temp/new-traefik/24-TLS.md -->

### SPIFFE 如何保护 Traefik 到后端的连接

<!-- src: temp/new-traefik/16-TLS.md; temp/new-traefik/17-Certificate-Resolvers.md; temp/new-traefik/24-TLS.md -->

### OCSP Stapling 能证明什么，不能证明什么

<!-- src: temp/new-traefik/16-TLS.md; temp/new-traefik/17-Certificate-Resolvers.md; temp/new-traefik/24-TLS.md -->

## 第 17 章 · Certificate-Resolvers · 证书解析器

### 手动证书和三种 ACME 挑战如何选择

<!-- src: temp/new-traefik/17-Certificate-Resolvers.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

#### 用 staging 区分配置问题和生产限额

### 续期、存储、多副本和证书管理器怎样协调

<!-- src: temp/new-traefik/17-Certificate-Resolvers.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

#### 单写者与多副本

#### 补齐 Gateway HTTPS 的完整引用

### Tailscale 解析器为什么需要明确域名与引用

<!-- src: temp/new-traefik/17-Certificate-Resolvers.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

#### DNS-01 的凭据、传播、通配符与续期证据

## 第 18 章 · Observability · 可观测性配置

### 运行日志和访问日志怎样共同解释请求

<!-- src: temp/new-traefik/18-Observability.md; temp/new-traefik/06-Observe.md -->

#### 用真实字段区分后端与代理响应

#### 日志缺失也需要解释

### 指标标签、延迟分位数和容量怎样关联

<!-- src: temp/new-traefik/18-Observability.md; temp/new-traefik/06-Observe.md -->

#### 在本地实验开放独立 metrics 入口

#### 容量要联系输入、等待和资源

### OTLP、采样与上下文传播怎样组成 Trace

<!-- src: temp/new-traefik/18-Observability.md; temp/new-traefik/06-Observe.md -->

#### 给 exporter 一个真正的接收端

#### Span 粒度与诊断限度

### Dashboard、API、Ping 怎样作为观测入口

<!-- src: temp/new-traefik/18-Observability.md; temp/new-traefik/06-Observe.md -->

#### 从采集、查询到告警的四种样本

#### 真实 Trace 接收与断链判断

## 第 19 章 · Routing-Configuration · 路由配置总览

### 从业务需求拆出路由配置对象

<!-- src: temp/new-traefik/19-Routing-Configuration.md; temp/new-traefik/20-Common-Configuration.md; temp/new-traefik/22-Routing.md; temp/new-traefik/23-Load-Balancing.md -->

### File、Kubernetes 和标签如何表达同一个设计

<!-- src: temp/new-traefik/19-Routing-Configuration.md; temp/new-traefik/20-Common-Configuration.md; temp/new-traefik/22-Routing.md; temp/new-traefik/23-Load-Balancing.md -->

### 如何识别配置不完整与不支持的字段

<!-- src: temp/new-traefik/19-Routing-Configuration.md; temp/new-traefik/20-Common-Configuration.md; temp/new-traefik/22-Routing.md; temp/new-traefik/23-Load-Balancing.md -->

## 第 20 章 · Common-Configuration · 通用配置表达

### 结构化文件如何保持对象关系清晰

<!-- src: temp/new-traefik/20-Common-Configuration.md; temp/new-traefik/11-Configuration-Discovery.md; temp/new-traefik/36-Label-&-Tag-Providers.md -->

### 扁平键与资源对象不能逐字互相替换

<!-- src: temp/new-traefik/20-Common-Configuration.md; temp/new-traefik/11-Configuration-Discovery.md; temp/new-traefik/36-Label-&-Tag-Providers.md -->

## 第 21 章 · HTTP · HTTP 处理模型

### HTTP 与 HTTPS 的监听、匹配和重定向如何分工

<!-- src: temp/new-traefik/21-HTTP.md; temp/new-traefik/22-Routing.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md; temp/new-traefik/25-Middlewares.md -->

### HTTP 的路由、服务、TLS 和 Middleware 如何构成一条链

<!-- src: temp/new-traefik/21-HTTP.md; temp/new-traefik/22-Routing.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md; temp/new-traefik/25-Middlewares.md -->

## 第 22 章 · Routing · HTTP 路由

### Host、路径、方法与 Header 怎样组合匹配

<!-- src: temp/new-traefik/22-Routing.md -->

#### 先定义允许集合，再写表达式

#### 正则、大小写与安全边界

### 重叠规则如何使用优先级和明确的路径边界

<!-- src: temp/new-traefik/22-Routing.md -->

#### 用可识别响应验证胜出的 Router

#### 优先级必须可维护

### 路由级观测与多层路由什么时候值得使用

<!-- src: temp/new-traefik/22-Routing.md -->

#### 原始路径回放与后端 URI 对照

## 第 23 章 · Load-Balancing · HTTP 负载均衡

### 服务器选择、粘性和高级服务组合怎样工作

<!-- src: temp/new-traefik/23-Load-Balancing.md -->

#### 先区分均衡与粘性

#### 多层 Service 的取舍

### 健康检查与平台就绪信号怎样取舍

<!-- src: temp/new-traefik/23-Load-Balancing.md -->

#### 在 File 环境观察摘除与恢复

#### 防止健康检查扩大故障

### 连接池、建连与响应头超时怎样设置

<!-- src: temp/new-traefik/23-Load-Balancing.md -->

#### 在已有 Service 上绑定传输参数

#### 用两种失败证明参数作用域

### Retry、熔断与故障转移怎样划清边界

<!-- src: temp/new-traefik/23-Load-Balancing.md -->

#### 配置与状态

#### 三个对照实验

### 权重、P2C、Least-Time 与被动健康检查怎样选择

<!-- src: temp/new-traefik/23-Load-Balancing.md -->

#### A/B 组合服务的完整依赖与三组实验

## 第 24 章 · TLS · HTTP TLS 配置

### SNI 选证书、TLSOptions 和 TLSStore 怎样配合

<!-- src: temp/new-traefik/24-TLS.md -->

#### 先建立可校验证书的本地实验

#### 从握手信息判断证书选择

### 入口 mTLS 与后端 mTLS 怎样独立验证

<!-- src: temp/new-traefik/24-TLS.md -->

#### 明确材料和文件前提

#### 正负测试矩阵

#### 本地 CA、双端证书与 mTLS 后端

## 第 25 章 · Middlewares · HTTP 中间件

### Chain 顺序和提前返回怎样影响后续策略

<!-- src: temp/new-traefik/25-Middlewares.md; temp/new-traefik/05-Secure.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md -->

#### 一个有明确意图的顺序

#### 在后端日志中验证顺序

### 路径重写、重定向、安全头与 CORS 怎样验证

<!-- src: temp/new-traefik/25-Middlewares.md; temp/new-traefik/05-Secure.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md -->

#### 用 whoami 验证路径和原始信息

#### CORS 要同时验证浏览器预检和实际请求

### BasicAuth、ForwardAuth 和 IPAllowList 怎样划定信任

<!-- src: temp/new-traefik/25-Middlewares.md; temp/new-traefik/05-Secure.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md -->

#### 完整的教学鉴权依赖

#### HTTP 与 HTTPS 都应验证拒绝和允许

#### 地址白名单与多层代理

### 令牌桶、并发限制和 Buffering 怎样保护后端

<!-- src: temp/new-traefik/25-Middlewares.md; temp/new-traefik/05-Secure.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md -->

#### 在已认证请求上测试限流

#### 并发与体积限制需要不同实验

### 压缩、错误页、内容类型和 Hub 扩展有什么边界

<!-- src: temp/new-traefik/25-Middlewares.md; temp/new-traefik/05-Secure.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md -->

#### 压缩为什么没有触发

#### 错误页需要实际存在的后端

### 前缀、正则改写与重定向该怎样选

<!-- src: temp/new-traefik/25-Middlewares.md; temp/new-traefik/05-Secure.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md -->

### BasicAuth、DigestAuth 与 APIKey 的身份模型有何区别

<!-- src: temp/new-traefik/25-Middlewares.md; temp/new-traefik/05-Secure.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md -->

### JWT、OIDC 与其他 Hub 身份中间件怎样分工

<!-- src: temp/new-traefik/25-Middlewares.md; temp/new-traefik/05-Secure.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md -->

### PassTLSClientCert 传递身份时怎样防止伪造

<!-- src: temp/new-traefik/25-Middlewares.md; temp/new-traefik/05-Secure.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md -->

### 分布式限流与 WAF 的策略状态怎样运营

<!-- src: temp/new-traefik/25-Middlewares.md; temp/new-traefik/05-Secure.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md -->

#### 客户端、可信前置代理与 Traefik 的真实 IP 实验

## 第 26 章 · TCP · TCP 服务与传输

### TCP Service 为什么按连接而不是 HTTP 请求分配

<!-- src: temp/new-traefik/26-TCP.md; temp/new-traefik/27-Routing.md; temp/new-traefik/28-Middlewares.md -->

### TCP ServersTransport 如何控制拨号、半关闭与后端 TLS

<!-- src: temp/new-traefik/26-TCP.md; temp/new-traefik/27-Routing.md; temp/new-traefik/28-Middlewares.md -->

### TCP 健康检查怎样避免只测到开放端口

<!-- src: temp/new-traefik/26-TCP.md; temp/new-traefik/27-Routing.md; temp/new-traefik/28-Middlewares.md -->

#### 固定协议端点与 send/expect

## 第 27 章 · Routing · TCP 路由

### TCP 优先级、HostSNI 与透传怎样选择

<!-- src: temp/new-traefik/27-Routing.md -->

### TCP 规则、优先级和协议握手怎样共同决定路由

<!-- src: temp/new-traefik/27-Routing.md -->

#### 正确与错误 SNI 的可重复请求

## 第 28 章 · Middlewares · TCP 中间件

### TCP IPAllowList 如何在连接入口拒绝来源

<!-- src: temp/new-traefik/28-Middlewares.md; temp/new-traefik/27-Routing.md; temp/new-traefik/34-TCP.md -->

### InFlightConn 的容量上限怎样影响长连接

<!-- src: temp/new-traefik/28-Middlewares.md; temp/new-traefik/27-Routing.md; temp/new-traefik/34-TCP.md -->

#### 来源拒绝与并发连接的独立验证

## 第 29 章 · UDP · UDP 服务

### UDP Service 描述什么，为什么没有 HTTP 路径

<!-- src: temp/new-traefik/29-UDP.md; temp/new-traefik/30-Routing.md -->

### UDP 容量怎样从包和会话判断

<!-- src: temp/new-traefik/29-UDP.md; temp/new-traefik/30-Routing.md -->

#### 与第30章共用的真实 DNS 后端

## 第 30 章 · Routing · UDP 路由

### UDP 转发和会话超时怎样验证

<!-- src: temp/new-traefik/30-Routing.md -->

### UDP 为什么没有 HTTP 式的 Rules 与 Priority

<!-- src: temp/new-traefik/30-Routing.md -->

#### 固定客户端 socket 跨过会话空闲窗口

## 第 31 章 · Kubernetes · Kubernetes 路由配置

### IngressClass 和标准 Ingress 怎样选择控制器

<!-- src: temp/new-traefik/31-Kubernetes.md; temp/new-traefik/12-Kubernetes.md; temp/new-traefik/33-HTTP.md -->

#### 一套后端供三种路由复用

#### 资源存在却未生成 Router

### GatewayClass、Gateway 和 HTTPRoute 怎样分担职责

<!-- src: temp/new-traefik/31-Kubernetes.md; temp/new-traefik/12-Kubernetes.md; temp/new-traefik/33-HTTP.md -->

#### 完整的 HTTP 路由依赖

#### 用状态解释接受与拒绝

### Route 挂载与跨 namespace 资源引用怎样授权

<!-- src: temp/new-traefik/31-Kubernetes.md; temp/new-traefik/12-Kubernetes.md; temp/new-traefik/33-HTTP.md -->

#### 限制可挂载的应用 namespace

### NGINX 注解兼容迁移怎样逐项核对

<!-- src: temp/new-traefik/31-Kubernetes.md; temp/new-traefik/12-Kubernetes.md; temp/new-traefik/33-HTTP.md -->

#### 用行为表迁移，而不是只改 ingressClass

### Knative 路由为何需要观察上游资源状态

<!-- src: temp/new-traefik/31-Kubernetes.md; temp/new-traefik/12-Kubernetes.md; temp/new-traefik/33-HTTP.md -->

#### Prefix 实验与协议后端的复用入口

## 第 32 章 · Kubernetes-CRD · Kubernetes CRD 资源总览

### CRD 是对象模型的 Kubernetes 表达，不是另一套代理

<!-- src: temp/new-traefik/32-Kubernetes-CRD.md; temp/new-traefik/33-HTTP.md; temp/new-traefik/34-TCP.md; temp/new-traefik/35-UDP.md -->

### 资源存在、Controller 接受和业务成功怎样分别验证

<!-- src: temp/new-traefik/32-Kubernetes-CRD.md; temp/new-traefik/33-HTTP.md; temp/new-traefik/34-TCP.md; temp/new-traefik/35-UDP.md -->

## 第 33 章 · HTTP · HTTP CRD

### IngressRoute、Middleware 与 TraefikService 怎样引用

<!-- src: temp/new-traefik/33-HTTP.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

#### 用同一后端验证 CRD 路由

#### 高级组合不改变 Service 端口含义

### EndpointSlice、就绪和 nativeLB 怎样决定数据路径

<!-- src: temp/new-traefik/33-HTTP.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

### TraefikService 如何实现服务加权与镜像

<!-- src: temp/new-traefik/33-HTTP.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

### HTTP ServersTransport 和 Middleware 如何使用 Secret 与命名空间

<!-- src: temp/new-traefik/33-HTTP.md; temp/new-traefik/23-Load-Balancing.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

#### v3.6.25 的 HTTP CA 引用与完整后端资源

## 第 34 章 · TCP · TCP 与 TLS CRD

### IngressRouteTCP 如何把入口连接交给 Kubernetes Service

<!-- src: temp/new-traefik/34-TCP.md; temp/new-traefik/24-TLS.md; temp/new-traefik/26-TCP.md; temp/new-traefik/27-Routing.md; temp/new-traefik/28-Middlewares.md -->

### ServersTransportTCP 与 MiddlewareTCP 的作用阶段为何不同

<!-- src: temp/new-traefik/07-Migrate.md; temp/new-traefik/34-TCP.md; temp/new-traefik/24-TLS.md; temp/new-traefik/26-TCP.md; temp/new-traefik/27-Routing.md; temp/new-traefik/28-Middlewares.md -->

### TLSOption 和 TLSStore 怎样表达证书策略

<!-- src: temp/new-traefik/34-TCP.md; temp/new-traefik/24-TLS.md; temp/new-traefik/26-TCP.md; temp/new-traefik/27-Routing.md; temp/new-traefik/28-Middlewares.md -->

#### v3.6.25 的 TCP CA 必须位于 tls 下

## 第 35 章 · UDP · UDP CRD

### IngressRouteUDP 如何引用 UDP Service

<!-- src: temp/new-traefik/35-UDP.md; temp/new-traefik/29-UDP.md; temp/new-traefik/30-Routing.md -->

### nativeLB、NodePortLB 与 ExternalName 应如何选择

<!-- src: temp/new-traefik/35-UDP.md; temp/new-traefik/29-UDP.md; temp/new-traefik/30-Routing.md -->

#### DNS Pod、Service 与 UDP Router 配套清单

## 第 36 章 · Label-&-Tag-Providers · 标签与 Tag 配置

### Labels 和 Tags 怎样表达完整的 Router、Service 与 Middleware

<!-- src: temp/new-traefik/36-Label-&-Tag-Providers.md; temp/new-traefik/11-Configuration-Discovery.md; temp/new-traefik/13-Hashicorp.md; temp/new-traefik/14-KV-Stores.md; temp/new-traefik/15-Others.md -->

### 多端口、多网络和跨 Provider 引用怎样避免歧义

<!-- src: temp/new-traefik/36-Label-&-Tag-Providers.md; temp/new-traefik/11-Configuration-Discovery.md; temp/new-traefik/13-Hashicorp.md; temp/new-traefik/14-KV-Stores.md; temp/new-traefik/15-Others.md -->

### KV 路径如何对应数组和嵌套字段

<!-- src: temp/new-traefik/36-Label-&-Tag-Providers.md; temp/new-traefik/11-Configuration-Discovery.md; temp/new-traefik/13-Hashicorp.md; temp/new-traefik/14-KV-Stores.md; temp/new-traefik/15-Others.md -->

### 协议前缀和能力限制怎样进入发布校验

<!-- src: temp/new-traefik/36-Label-&-Tag-Providers.md; temp/new-traefik/11-Configuration-Discovery.md; temp/new-traefik/13-Hashicorp.md; temp/new-traefik/14-KV-Stores.md; temp/new-traefik/15-Others.md -->

#### Catalog Tag 到运行对象的对应证据

## 第 37 章 · Security · 协议与多租户安全

### 多租户、Tailscale、SPIFFE 和 OCSP 有哪些边界

<!-- src: temp/new-traefik/37-Security.md; temp/new-traefik/16-TLS.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

### Content-Length 校验与 Buffering 如何改变消息处理边界

<!-- src: temp/new-traefik/37-Security.md; temp/new-traefik/16-TLS.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

## 第 38 章 · Deprecation-Notices · 弃用与版本支持

### Hub、实验功能和源码材料缺口怎样标注

<!-- src: temp/new-traefik/38-Deprecation-Notices.md; temp/new-traefik/07-Migrate.md; temp/new-traefik/08-Traefik-v2-to-v3.md -->

#### 贡献与安全反馈

### 版本支持表为什么必须带时间语境

<!-- src: temp/new-traefik/38-Deprecation-Notices.md; temp/new-traefik/07-Migrate.md; temp/new-traefik/08-Traefik-v2-to-v3.md -->

### 资源 API 的弃用怎样落实到清单迁移

<!-- src: temp/new-traefik/38-Deprecation-Notices.md; temp/new-traefik/07-Migrate.md; temp/new-traefik/08-Traefik-v2-to-v3.md -->

#### 将弃用信息落回升级工单

## 第 39 章 · User-Guides · 用户实践指南

### gRPC 的 TLS、h2c 与 gRPC-Web 怎样区分

<!-- src: temp/new-traefik/39-User-Guides.md; temp/new-traefik/17-Certificate-Resolvers.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

### WebSocket 升级、空闲和重连怎样观察

<!-- src: temp/new-traefik/39-User-Guides.md; temp/new-traefik/17-Certificate-Resolvers.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

### FastProxy 实验功能怎样用真实协议验证

<!-- src: temp/new-traefik/39-User-Guides.md; temp/new-traefik/17-Certificate-Resolvers.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

### Kubernetes 与证书管理器怎样分工

<!-- src: temp/new-traefik/39-User-Guides.md; temp/new-traefik/17-Certificate-Resolvers.md; temp/new-traefik/24-TLS.md; temp/new-traefik/31-Kubernetes.md -->

#### gRPC proto、方法输入与 WebSocket echo 实物
