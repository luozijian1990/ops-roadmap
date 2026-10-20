# CoreDNS 学习笔记大纲

> 四篇结构沿用已确认方案。配置依据 CoreDNS v1.12.4；Kubernetes 资料依据 release-1.34 分支。每个 src 指向对应官方源文件。包含安装、EDNS、环路修复及 DNS 数据模型、处理器、缓存、转发、对象传播和多副本原理。

<!-- output: 01-foundations-and-request-flow.md -->

## 01 · 第 1 章 · 从 DNS 问题认识 CoreDNS

### 区分权威回答、递归解析与转发
<!-- src: https://coredns.io/manual/toc/; https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/file/README.md -->

### 从域名树、区域委派与 RRset 理解数据归属
<!-- src: https://www.rfc-editor.org/rfc/rfc1034; https://www.rfc-editor.org/rfc/rfc2181; https://coredns.io/manual/toc/ -->

### 从响应报文判断解析结果
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/file/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/log/README.md -->

## 01 · 第 2 章 · 建立可重复的本地实验

### 启动固定版本并完成首次查询
<!-- src: https://github.com/coredns/coredns/releases/tag/v1.12.4; https://github.com/coredns/coredns/blob/v1.12.4/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/hosts/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/bind/README.md -->

### 用 UDP、TCP 与查询类型建立验证矩阵
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/hosts/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/whoami/README.md -->

### 用 EDNS 与截断实验理解 TCP 回退
<!-- src: https://www.rfc-editor.org/rfc/rfc6891; https://bind9.readthedocs.io/en/v9.18.39/manpages.html#dig-dns-lookup-utility; https://github.com/coredns/coredns/blob/v1.12.4/plugin/file/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md -->

## 01 · 第 3 章 · 读懂 Corefile 与域名路由

### 区分启动装配、监听器与逐请求路由
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/core/dnsserver/register.go; https://github.com/coredns/coredns/blob/v1.12.4/core/dnsserver/server.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin.cfg; https://github.com/coredns/coredns/blob/v1.12.4/plugin/hosts/setup.go -->

### 用 Server Block 划分解析责任
<!-- src: https://coredns.io/manual/toc/; https://github.com/coredns/coredns/blob/v1.12.4/plugin/bind/README.md -->

### 用 import 管理配置并识别生效边界
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/import/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/reload/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/file/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/hosts/README.md -->

## 01 · 第 4 章 · 理解插件链的请求与响应

### 区分配置顺序与插件执行顺序
<!-- src: https://coredns.io/manual/toc/; https://github.com/coredns/coredns/blob/v1.12.4/plugin.cfg; https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md -->

### 区分处理器返回值与写回客户端的 DNS 消息
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/plugin.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/cache.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/forward.go; https://github.com/coredns/coredns/blob/v1.12.4/core/dnsserver/server.go -->

### 掌握 fallthrough 与终止回答的边界
<!-- src: https://coredns.io/manual/toc/; https://github.com/coredns/coredns/blob/v1.12.4/plugin/hosts/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/template/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/kubernetes/README.md -->

## 01 · 第 5 章 · 从最小配置走向可维护服务

### 分清进程健康、插件就绪与业务可用
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/health/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/ready/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/kubernetes/README.md -->

### 核对插件能力并形成学习实验记录
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin.cfg -->

<!-- output: 02-plugins-and-scenarios.md -->

## 02 · 第 1 章 · 管理静态记录与权威区域

### 用 hosts 管理少量地址映射
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/hosts/README.md -->

### 用 file 表达完整 Zone 并验证更新
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/file/README.md -->

## 02 · 第 2 章 · 用 forward 建立明确的上游边界

### 按域名分流并验证真实上游
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md -->

### 区分上游健康、错误响应和并发保护
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md -->

### 沿时间线理解连接复用、重试与健康恢复
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/forward.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin/pkg/proxy/connect.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin/pkg/proxy/health.go -->

## 02 · 第 3 章 · 理解缓存的新鲜度与可用性

### 分别设计成功缓存、否定缓存与失败缓存
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/README.md -->

### 从缓存键与时间线解释命中、过期和淘汰
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/cache.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/handler.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/item.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin/pkg/dnsutil/ttl.go; https://www.rfc-editor.org/rfc/rfc2308#section-5 -->

### 评估预取、过期响应和多层缓存
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/README.md -->

## 02 · 第 4 章 · 按规则改写或生成回答

### 用 rewrite 保持查询与回答一致
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/rewrite/README.md -->

### 用 template 生成受控范围内的记录
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/template/README.md; https://www.rfc-editor.org/rfc/rfc2308#section-5 -->

## 02 · 第 5 章 · 把插件组合成可观察的服务

### 组合日志、指标与配置热加载
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/errors/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/log/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/metrics/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/reload/README.md -->

### 验证加密转发与多地址回答的边界
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/loadbalance/README.md -->

## 02 · 第 6 章 · 通过综合实验选择插件

### 搭建分流、缓存与故障切换实验
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/file/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/template/README.md -->

### 建立插件索引与外部扩展评估方法
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin.cfg; https://coredns.io/manual/toc/; https://github.com/coredns/coredns/blob/v1.12.4/plugin/kubernetes/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/template/README.md -->

<!-- output: 03-kubernetes-dns.md -->

## 03 · 第 1 章 · 沿着 Pod 请求找到 DNS 服务

### 连接 Pod 配置、Service 与 CoreDNS
<!-- src: https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/tasks/administer-cluster/dns-custom-nameservers.md; https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/concepts/services-networking/dns-pod-service.md -->

### 拆解集群 Corefile 并确认实际版本
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/kubernetes/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/health/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/README.md; https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/tasks/administer-cluster/dns-custom-nameservers.md -->

## 03 · 第 2 章 · 从 Kubernetes 对象理解 DNS 记录

### 比较普通 Service、Headless 与命名端口
<!-- src: https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/concepts/services-networking/dns-pod-service.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/kubernetes/README.md -->

### 理解对象同步、RBAC 与 Pod 记录模式
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/kubernetes/README.md; https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/tasks/administer-cluster/dns-debugging-resolution.md -->

### 追踪对象变更从 API 到客户端答案的传播
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/kubernetes/controller.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin/kubernetes/kubernetes.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin/kubernetes/ready.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/handler.go; https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/concepts/services-networking/dns-pod-service.md -->

## 03 · 第 3 章 · 解释应用与命令行的解析差异

### 验证 search、ndots 与完整域名
<!-- src: https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/concepts/services-networking/dns-pod-service.md -->

### 正确选择 dnsPolicy 与 dnsConfig
<!-- src: https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/concepts/services-networking/dns-pod-service.md -->

## 03 · 第 4 章 · 安全调整集群解析策略

### 配置企业域名转发并守住集群域边界
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/kubernetes/README.md; https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/tasks/administer-cluster/dns-custom-nameservers.md -->

### 用独立实验验证 Service 记录与变更
<!-- src: https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/concepts/services-networking/dns-pod-service.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/reload/README.md -->

## 03 · 第 5 章 · 引入并维护 NodeLocal DNSCache

### 解释节点缓存如何改变请求路径
<!-- src: https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/tasks/administer-cluster/nodelocaldns.md -->

### 按网络模式验证部署、资源与回滚
<!-- src: https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/tasks/administer-cluster/nodelocaldns.md -->

<!-- output: 04-observability-and-troubleshooting.md -->

## 04 · 第 1 章 · 建立可解释的 DNS 观测体系

### 用请求量、响应码与延迟定位异常
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/metrics/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md -->

### 连接缓存指标、查询日志与业务探测
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/log/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/health/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/ready/README.md -->

## 04 · 第 2 章 · 按故障范围组织排查

### 从客户端到后端逐层隔离超时
<!-- src: https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/tasks/administer-cluster/dns-debugging-resolution.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md -->

### 区分 NXDOMAIN、NODATA、SERVFAIL 与 REFUSED
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/log/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/kubernetes/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/file/README.md -->

## 04 · 第 3 章 · 处理常见解析故障

### 排查内部正常但外部失败与转发环路
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/loop/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md; https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/tasks/administer-cluster/dns-debugging-resolution.md -->

### 用 systemd-resolved 场景完成环路修复与回滚
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/loop/README.md; https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/tasks/administer-cluster/dns-debugging-resolution.md; https://kubernetes.io/docs/tasks/administer-cluster/kubelet-config-file/; https://kubernetes.io/docs/tasks/debug/debug-cluster/crictl/; https://github.com/containerd/containerd/blob/v1.7.24/pkg/cri/server/container_status.go -->

### 排查短名称失败与记录更新不及时
<!-- src: https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/concepts/services-networking/dns-pod-service.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/reload/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/file/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/hosts/README.md -->

## 04 · 第 4 章 · 用证据进行容量与性能调整

### 区分请求放大、上游变慢与实例过载
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/health/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/metrics/README.md -->

### 从副本局部状态理解答案差异与扩容代价
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/cache.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin/kubernetes/controller.go; https://github.com/coredns/coredns/blob/v1.12.4/plugin/reload/README.md; https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/tasks/administer-cluster/nodelocaldns.md -->

### 设计可比较的压测与故障实验
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/forward/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/metrics/README.md -->

## 04 · 第 5 章 · 完成变更验收与故障复盘

### 用灰度、回滚与查询矩阵验证发布
<!-- src: https://github.com/coredns/coredns/blob/v1.12.4/plugin/reload/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/ready/README.md; https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/tasks/administer-cluster/dns-custom-nameservers.md -->

### 把排查过程沉淀为可复用记录
<!-- src: https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/tasks/administer-cluster/dns-debugging-resolution.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/metrics/README.md; https://github.com/coredns/coredns/blob/v1.12.4/plugin/cache/README.md -->
