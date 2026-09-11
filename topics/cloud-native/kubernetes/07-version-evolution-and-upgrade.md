# Kubernetes 学习笔记 · 第七册：版本演进与集群升级

## 第 1 章 · 从旧版知识建立 1.36 能力基线

### 如何区分机制不变与版本行为变化
<!-- src: temp/kubernetes-zh-docs/66-API-概述/Kubernetes-弃用策略.md; temp/kubernetes-zh-docs/66-API-概述/已弃用-API-的迁移指南.md -->

本册面向已经理解 Kubernetes 1.2x 的运维和平台工程师，以 1.36 为学习目标。控制器协调、声明式 API、Pod 共享环境等机制仍然成立；需要重新确认的是 API 是否仍提供、参数是否仍接受、默认行为是否变化，以及新能力需要哪些组件配合。这里的命令是教学与 Runbook 模板，没有宣称在真实集群执行完成。

版本升级要拆成三个问题：API 弃用政策约束接口如何演进；版本偏差政策约束组件能否混用；支持周期决定某个发行版本是否仍接受维护。它们不能合并成“旧版向前兼容三个版本”。还有第四个独立维度：CNI、CSI、VPA、Istio 和发行版自己的支持范围。

| 旧知识 | 保留的机制 | 面向 1.36 的修订 |
|---|---|---|
| kubelet 驱动运行时 | CRI 调用链 | 内置 dockershim 已移除，核对 CRI v1 |
| Pod 资源通常随重建改变 | request、limit、调度预算 | 增加 resize 子资源和实际生效状态 |
| Service 后端与转发 | 声明与数据面分离 | EndpointSlice、nftables 和流量分发偏好 |
| 准入控制 | 写入前校验与变更 | PSA、CEL 策略与 Webhook 分工 |
| 持久存储 | PVC/PV/CSI 分工 | RWOP、快照恢复、卷属性修改 |

学习顺序是先阅读第一、二册补充的机制，再看第三、五册的运维决策，最后用本册组织升级。第六册负责应用行为验收，本册负责集群与版本变化。旧命令可以作为历史排障线索，但不得因为文档中出现过就直接在新集群执行。

### 如何使用能力矩阵而不把成熟度当成可用性
<!-- src: temp/kubernetes-zh-docs/13-Pod/边车容器.md; temp/kubernetes-zh-docs/22-调度、抢占和驱逐/动态资源分配.md; temp/kubernetes-zh-docs/18-存储/卷属性类.md -->

同一版本内同时存在稳定、Beta、Alpha 和弃用功能。API 已稳定只说明契约阶段，不能保证所有驱动、内核、工作负载与它兼容；Feature Gate 默认启用也不代表每个对象自动采用该能力。下面的状态以固定 1.36 官方页面核对，使用更早版本时必须重新查表。

| 能力 | 1.36 中的阶段 | 使用前提或选择方式 | 旧环境路径 |
|---|---|---|---|
| 原生 Sidecar | Stable，1.33 稳定 | initContainers 的 Always 重启策略 | 普通多容器，自行处理协作 |
| 容器 CPU/内存原地调整 | Stable，1.35 稳定 | resize 子资源、运行时及资源策略支持 | 更新工作负载模板并重建 |
| Pod 级资源预算 | Beta，默认启用 | PodLevelResources、spec.resources | 容器级预算 |
| Pod 级原地资源调整 | Beta，1.36 默认启用 | 专门的 Pod 级 resize 门控组合 | 修改模板并重建 |
| ValidatingAdmissionPolicy | Stable，1.30 稳定 | Policy 与 Binding | 验证 Webhook |
| MutatingAdmissionPolicy | Stable，1.36 稳定 | 变更性 Policy 与 Binding | 变更 Webhook |
| 用户命名空间 | Stable，1.36 稳定 | hostUsers: false、内核/文件系统/运行时 | 非 root、seccomp 等基础隔离 |
| nftables 代理 | Stable，1.33 稳定 | 显式代理模式、内核与 CNI 支持 | 保留已验证的代理模式 |
| VolumeAttributesClass | Stable，1.36 稳定 | CSI 驱动和配套 sidecar 支持 | 驱动专用运维流程 |
| DRA 核心能力 | Stable，1.35 稳定 | 驱动、DeviceClass、Claim、ResourceSlice | Device Plugin 扩展资源 |
| 原生 PodGroup | Alpha，默认禁用 | 匹配的 API 与调度门控 | 普通调度或第三方批调度系统 |
| Pod 级资源管理器 | Alpha，默认禁用 | PodLevelResourceManagers 等门控 | 容器级 CPU/Memory/Topology Manager |

先用 `kubectl api-resources` 和 `kubectl explain` 确认目标 API/字段，再检查组件有效配置与驱动支持，最后创建最小案例观察状态。API discovery 只能发现接口，不能证明所有节点都具备相同能力；升级中的异构节点池尤其需要单独核验。

核心来源：[容器调整](https://v1-36.docs.kubernetes.io/docs/tasks/configure-pod-container/resize-container-resources/)、[Pod 级调整](https://v1-36.docs.kubernetes.io/docs/tasks/configure-pod-container/resize-pod-resources/)、[变更性准入](https://v1-36.docs.kubernetes.io/docs/reference/access-authn-authz/mutating-admission-policy/)、[用户命名空间](https://v1-36.docs.kubernetes.io/docs/concepts/workloads/pods/user-namespaces/)、[DRA](https://v1-36.docs.kubernetes.io/docs/concepts/scheduling-eviction/dynamic-resource-allocation/)、[PodGroup](https://v1-36.docs.kubernetes.io/docs/concepts/workloads/podgroup-api/)。具体机制与其他来源见前六册相应小节。

### 如何处理中文快照与项目文档不一致
<!-- src: temp/kubernetes-zh-docs/13-Pod/用户命名空间.md; temp/kubernetes-zh-docs/67-API-访问控制/变更性准入策略.md; temp/kubernetes-zh-docs/35-配置-Pods-和容器/分配-Pod-级别-CPU-和内存资源.md -->

本次源材料位于 `temp/kubernetes-zh-docs`，包含概念、任务和 API 参考。抓取目录名中的 1.36 是集合标签，不保证每个中文段落都同步完成。代码行号、重复标题、内部 /read 链接也不是 Kubernetes 配置的一部分，学习笔记已按教学语义重写。

| 已发现差异 | 处理原则 |
|---|---|
| 用户命名空间中文仍为 1.30 beta | 使用固定 1.36 英文页的 stable 状态 |
| 变更性准入中文仍为 1.34 beta | 使用固定 1.36 英文页的 stable 状态 |
| Pod 级调整中文材料仍称 alpha | 使用专门 1.36 英文任务页的 beta 状态 |
| 核心文档对 VPA 集成描述滞后 | 按 autoscaler 的安装版本、CRD 与组件确认 |
| 一个 DRA 页面有多个特性状态 | 按子特性分别记录，不以页首状态覆盖全部 |

版本依据应包含 API Group/Version、适用组件、阶段、默认开关、依赖和验证方法。遇到冲突时先回到同一目标版本的英文参考及项目发布资料，仍无法确认的能力应标待验证，不能用“较新的页面”自动覆盖另一个版本。

例如 VPA 的更新模式由其独立发布决定，核心集群升级不一定升级 VPA CRD。用 `kubectl explain verticalpodautoscaler.spec.updatePolicy`、CRD schema 和部署镜像确认是否支持某个枚举值，再观察 Updater 行为。能保存一个 CR 不表示旧 Controller 理解新字段，也不表示原地调整失败时不会驱逐重建。

## 第 2 章 · 升级前建立可审计的兼容清单

### API 清查如何覆盖清单和真实客户端
<!-- src: temp/kubernetes-zh-docs/66-API-概述/已弃用-API-的迁移指南.md; temp/kubernetes-zh-docs/66-API-概述/Kubernetes-弃用策略.md -->

升级不能只搜索 Git 中的 YAML。集群对象通常可通过新的 API 版本读取，因此 `kubectl get -o yaml` 显示 v1 并不证明没有旧客户端继续请求 beta API。需要同时检查声明来源、Helm 模板、Controller/Operator、CI 工具、Webhook 的匹配规则和实际请求记录。

| 历史接口 | 停止提供的版本 | 迁移重点 |
|---|---|---|
| networking.k8s.io/v1beta1 Ingress | 1.22 | v1 的 service.name/port 与 pathType |
| policy/v1beta1 PodSecurityPolicy | 1.25 | 迁移 PSA 或相应准入治理 |
| autoscaling/v2beta2 HPA | 1.26 | v2 指标目标结构 |
| flowcontrol.apiserver.k8s.io/v1beta1 | 1.26 | 继续迁移至 v1，检查字段语义 |
| flowcontrol.apiserver.k8s.io/v1beta3 | 1.32 | v1 的 nominalConcurrencyShares |

```bash
# 在声明仓库中筛出候选；命中历史说明也需人工分类
rg -n 'networking.k8s.io/v1beta1|policy/v1beta1|autoscaling/v2beta2|flowcontrol.apiserver.k8s.io/v1beta' manifests charts
# 只读发现当前服务端接口
kubectl api-versions
kubectl api-resources
kubectl get crd
kubectl get apiservices
```

扫描结果应分类为活跃配置、历史说明和无效残留。不能全局替换所有 v1beta1：metrics.k8s.io、kubelet 配置与第三方 CRD 的版本契约独立，并不因为含 beta 就必然已废弃。

在具备权限的环境中查看 API Server 的弃用 API 指标与审计记录，找到请求主体、userAgent、资源和周期。没有命中也可能只是观察窗口未覆盖低频 CronJob 或灾备脚本，应主动验证这些路径。最后把候选清单交给目标版本服务端 dry-run，并在代表环境验证 Controller 和应用行为。

官方参考：[Deprecated API Migration Guide](https://v1-36.docs.kubernetes.io/docs/reference/using-api/deprecation-guide/)。

### 组件版本偏差如何约束逐步升级
<!-- src: temp/kubernetes-zh-docs/31-用-kubeadm-进行管理/升级-kubeadm-集群.md -->

版本偏差是滚动升级期间的最大兼容边界，不是长期混跑的目标。kubeadm 不支持跳过 minor 的升级；从 1.2x 迁往 1.36，需要先明确准确起点，并为每一跳读取对应目标版本的升级说明。不能拿 1.35 → 1.36 的命令直接用于任意旧集群。

在控制面都为 1.36 的例子中，kubelet 不得更新于 API Server，允许范围按政策包含 1.33–1.36；kubectl 通常允许与 API Server 相差一个 minor。HA API Server 之间最多相差一个 minor。控制面混跑会进一步缩小其他组件允许的范围，不能只按最新实例计算。

```bash
kubectl version -o yaml
kubectl get nodes -o wide
kubectl get pods -n kube-system -o wide
```

上述输出作为起点，还需记录每台控制面静态 Pod 的镜像、kubeadm、运行时及部署方式。托管集群可能隐藏控制面组件，改用服务商提供的版本与升级检查；不能要求用户执行不存在的 kubeadm 流程。

| 路径 | 适用条件 | 主要成本 |
|---|---|---|
| 原地逐 minor 升级 | 每跳工具、系统和插件都有可验证路径 | 多个维护窗口和兼容验证 |
| 新集群迁移 | 旧平台跨度大、希望更换节点基线 | 数据复制、流量切换和双集群一致性 |
| 托管服务升级 | 服务商提供受支持路径 | 插件兼容、业务验收仍由使用者负责 |

如果需要同时跨多个 Kubernetes minor、运行时主版本和操作系统代际，新集群迁移值得比较，但不默认更简单。有状态业务必须设计数据追平、写入切换和回切条件。升级路线应写明每步的入口条件、停止条件和负责人，不能只列目标版本列表。

官方参考：[Version Skew Policy](https://v1-36.docs.kubernetes.io/releases/version-skew-policy/)。

### 插件、节点与备份如何形成升级准入条件
<!-- src: temp/kubernetes-zh-docs/30-管理集群/升级集群.md; temp/kubernetes-zh-docs/31-用-kubeadm-进行管理/升级-kubeadm-集群.md -->

API Server 升级成功不代表集群已可服务。CNI 负责网络、CSI 负责数据挂载、CoreDNS 负责名称解析，Webhook、聚合 API 和 Operator 还可能阻塞创建或控制循环。升级前应建立按实际安装版本填写的矩阵，不写“使用最新版”这种无法复现的依赖。

| 对象 | 至少记录 | 通过条件 |
|---|---|---|
| OS/内核/运行时 | 内核、cgroup、CRI/OCI 版本和驱动 | 目标版本支持，新 Pod 可运行 |
| CNI/kube-proxy | 插件版本、代理模式、策略能力 | 跨节点、DNS、NodePort 与策略验证 |
| CSI/快照组件 | 驱动与 sidecar、StorageClass | 挂载、扩容、恢复案例通过 |
| Webhook/Operator | 镜像、CRD、CA、超时与 API 版本 | 新对象、更新和控制循环正常 |
| 指标与弹性 | Metrics Server、VPA、HPA 配置 | 数据采集与扩缩控制可用 |
| 网格与入口 | Controller/代理版本、Gateway API CRD | 新连接、长连接、TLS 与路由正常 |

1.36 的节点基线特别要检查 cgroup v2，不能等 kubelet 重启失败才发现旧系统仍使用 v1。自托管环境还需确认软件包仓库、镜像镜像源、时间同步、磁盘空间、DNS 与镜像架构。

备份分为控制面状态、PKI/配置和业务数据。etcd 快照保存 Kubernetes 对象，不包含 PVC 底层业务数据；单独导出 YAML 也不包含完整集群状态。加密配置、外部 KMS 和证书若丢失，即使恢复 etcd 也可能无法读取 Secret 或启动组件。备份需存放在受控位置并实际演练恢复，不能提交到公开笔记仓库。

准入条件应包括：基线无未解释故障、剩余容量足够、PDB 可满足、备份可恢复、插件矩阵明确、观察面可用、维护窗口与停止条件已确定。任一关键条件缺失都应先解决，而不是依赖升级“顺便修好”。

## 第 3 章 · 组织升级、维护与恢复

### kubeadm 升级如何分控制面和工作节点执行
<!-- src: temp/kubernetes-zh-docs/31-用-kubeadm-进行管理/升级-kubeadm-集群.md; temp/kubernetes-zh-docs/31-用-kubeadm-进行管理/升级-Linux-节点.md -->

以下流程只适用于已由 kubeadm 管理、且准备从 1.35 升到选定 1.36 补丁版本的 Linux 集群。先从对应 minor 的软件包仓库安装选定版本的 kubeadm，再执行 plan；软件包命令和仓库签名配置按发行版核对，不将通配版本与不明镜像源写进生产脚本。

```bash
# 第一台控制面：安装目标 kubeadm 后检查
kubeadm version
sudo kubeadm upgrade plan
# 将经 plan 和兼容审查确定的版本显式输入，例如完整 v1.36.x
read -r target_version
sudo kubeadm upgrade apply "$target_version"
```

这里的 x 必须替换为实际选定补丁号，不能把示意字符串作为命令参数。其他控制面安装对应 kubeadm 后使用 `sudo kubeadm upgrade node`，不重复执行首次的 apply。对控制面按顺序执行并确认健康，保持 etcd quorum 与 API 可达；跨 API Server 访问的组件还要符合版本偏差政策。

kubeadm 管理的是相应集群配置与组件，不会自动升级任意第三方 CNI/CSI。CoreDNS/kube-proxy 的更新时机取决于 kubeadm 版本和流程，不能自己在控制面混跑期间任意抢先更新。维护 kubelet 前先 drain 节点，再安装选定 kubelet/kubectl，重载服务并检查 Ready，完成验证后 uncordon。

```bash
# 工作节点：先在管理端腾空，随后在该节点执行升级操作
kubectl drain worker-1 --ignore-daemonsets --timeout=15m
# 在 worker-1 上，安装目标 kubeadm 后
sudo kubeadm upgrade node
# 安装目标 kubelet/kubectl 后
sudo systemctl daemon-reload
sudo systemctl restart kubelet
# 回到管理端检查后放行
kubectl wait --for=condition=Ready node/worker-1 --timeout=5m
kubectl uncordon worker-1
```

这不是可以跨机器整段粘贴的脚本。每一步需要记录执行位置、版本、退出码和观察结果；节点 Ready 后还需验证网络、DNS、挂卷与代表工作负载。异常节点应保持隔离并停止下一批，而不是把批量操作继续推到整个节点池。

### drain 和 PDB 如何决定维护能否继续
<!-- src: temp/kubernetes-zh-docs/13-Pod/干扰（Disruptions）.md; temp/kubernetes-zh-docs/31-用-kubeadm-进行管理/升级-Linux-节点.md -->

cordon 只阻止一般新调度，不搬走已有 Pod；drain 通过驱逐等流程腾空可管理的工作负载。PDB 约束自愿中断的可用预算，不保证节点突然宕机时有足够副本，也不能替代 Deployment 自身的更新策略。

```bash
kubectl get pdb -A
kubectl get pods -A --field-selector=spec.nodeName=worker-1 -o wide
kubectl describe pdb web-budget -n demo
```

| 阻塞情况 | 应检查 | 不应直接做 |
|---|---|---|
| disruptionsAllowed 为 0 | 副本就绪、预算计算、并发维护 | 绕过 Eviction API 强删全部 Pod |
| 新副本 Pending | 节点余量、亲和、拓扑、卷绑定 | 连续腾空更多节点 |
| emptyDir 数据 | 是否可丢弃、任务是否可重放 | 无审查添加 delete-emptydir-data |
| 无控制器 Pod | 重建责任与恢复清单 | 无审查添加 force |
| DaemonSet/静态 Pod | 节点级组件维护流程 | 把 ignore-daemonsets 当成已经删除 |

预算过严可能使维护无法推进，但解决方式应先补副本、修 readiness 或调整维护批次。确需更改预算时，先评估剩余业务容量并记录恢复值。PDB 不是数据库写入一致性保护，StatefulSet 和单写存储还需要应用级仲裁、复制与旧进程隔离。

维护完成要验证新旧请求、长连接、任务幂等与数据读取，再解除隔离。drain 返回成功只代表其处理范围完成，不能证明节点上没有任何容器，更不能代表系统整体健康。

### 证书续期如何区分叶子证书、kubelet 和 CA
<!-- src: temp/kubernetes-zh-docs/31-用-kubeadm-进行管理/使用-kubeadm-进行证书管理.md; temp/kubernetes-zh-docs/48-TLS/为-kubelet-配置证书轮换.md; temp/kubernetes-zh-docs/48-TLS/手动轮换-CA-证书.md -->

证书异常既可能表现为 kubectl 失败，也可能是 Metrics Server 无法读取 kubelet、Webhook 调用失败或 etcd peer 无法通信。先确定客户端与服务端、信任链、SAN、用途和过期时间，不要看到 x509 就统一续期全部证书。

```bash
# 在 kubeadm 控制面节点检查
sudo kubeadm certs check-expiration
sudo openssl x509 -in /etc/kubernetes/pki/apiserver.crt \
  -noout -subject -issuer -dates -ext subjectAltName
kubectl get csr
```

check-expiration 不覆盖所有外部证书，也不把 kubelet 自动轮换的客户端证书当成普通 kubeadm 叶子证书统一处理。kubelet serving CSR 与 client CSR 的审批机制不同，不能批量 approve 未核对身份、SAN 和 usages 的请求。

对于 kubeadm 管理的叶子证书，可在确认 CA 私钥、证书属性和维护方案后执行指定 renew 子命令。续期通常以现有证书属性为依据，不是单纯修改 ConfigMap 就能增加新 SAN；外部 CA 则需要相应签发流程。续期后要使使用证书的组件重新加载，静态 Pod 的生命周期由 kubelet 管理，删除 API 中的镜像 Pod 不是可靠重启方法。

HA 环境应逐节点维护并验证连接，检查复制到其他位置的管理员 kubeconfig 是否仍含旧证书。根 CA 更换涉及信任传播、重新签发和切换顺序，kubeadm 不提供直接的一键 CA 轮换；不能把 `certs renew all` 当成 CA 更换工具。

官方参考：[kubeadm 证书管理](https://v1-36.docs.kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/)。

### 升级失败如何选择重试、修复或恢复
<!-- src: temp/kubernetes-zh-docs/31-用-kubeadm-进行管理/升级-kubeadm-集群.md; temp/kubernetes-zh-docs/30-管理集群/升级集群.md -->

失败时首先停止下一批，保存执行日志、组件版本、静态清单、节点和 etcd 状态。API 暂时不可达、单个 kubelet 起不来、插件兼容失败、控制面数据损坏是不同问题，恢复范围应与故障范围一致。

```mermaid
graph TD
    Fail[升级出现失败] --> Stop[停止下一批并保存证据]
    Stop --> Diagnose[判断故障范围]
    Diagnose --> Node[单节点问题]
    Diagnose --> Config[清单或插件问题]
    Diagnose --> Data[控制面数据损坏]
    Node --> Isolate[保持隔离 修复或替换节点]
    Config --> Repair[按原目标版本修复并核验]
    Data --> Restore[按已演练方案恢复状态与信任]
    Isolate --> Verify[控制面 插件 业务验收]
    Repair --> Verify
    Restore --> Verify
```

kubeadm 升级具有幂等设计，修正明确原因后可以按原目标重试，但不能用反复 force 掩盖不满足的前提。`/etc/kubernetes/tmp` 下的升级备份有用途边界：外部 etcd 不等同于本地 etcd 备份，局部文件也不等于可独立恢复整个集群的备份集。

Kubernetes minor 降级不是通用支持的回滚方法，不应把二进制版本降回去当成万能撤销。etcd 恢复需要匹配版本、集群拓扑、证书和数据目录，还要处理控制器 watch/cache 对 revision 回退的影响；具体恢复使用对应 etcd 版本的工具与官方灾备流程。恢复旧快照会丢失快照之后的对象变更，业务数据与外部资源也可能不在同一时间点。

应用发布回滚、节点替换、控制面恢复和全局数据恢复必须分别制定。恢复后除了 API readyz，还要检查写入、控制器协调、网络、存储和业务一致性，再决定是否继续升级。

## 第 4 章 · 用证据关闭升级工作

### 如何证明集群和业务都完成了升级
<!-- src: temp/kubernetes-zh-docs/31-用-kubeadm-进行管理/升级-kubeadm-集群.md; temp/kubernetes-zh-docs/23-集群管理/可观测性.md -->

升级结束的判据是目标版本、组件协作与业务行为都满足预期。节点列表全部 Ready 是必要线索，但不能覆盖准入拒绝、存储挂载失败或入口 TLS 问题。应使用升级前同一组检查，在相同客户端位置和相近负载下重放。

| 验收层 | 必需证据 | 失败时的判断 |
|---|---|---|
| 控制面 | 各组件版本、readyz、etcd 健康 | 不能继续扩大升级范围 |
| API/控制器 | 创建、更新、删除和协调结果 | 检查准入、CRD、聚合 API |
| 节点 | kubelet/运行时、cgroup、压力 | 异常节点保持隔离 |
| 网络 | DNS、跨节点、入口、允许与拒绝连接 | 定位到声明或数据面 |
| 存储 | 新挂载、既有数据、恢复验证 | 区分 CSI 与应用一致性 |
| 弹性与任务 | 指标、HPA、Job、关键 Operator | 检查低频和异步路径 |
| 业务 | 错误率、延迟、连接、读写一致性 | 按业务停止条件处理 |

证据记录包括上下文、时间、组件版本、资源 UID、脱敏命令结果和业务请求；Secret、kubeconfig、私钥与完整 Token 不能放进公开报告。没有执行的条目标为未执行，外部环境缺失标明前提缺失，不将它们折算成通过。

第六册已有应用就绪实验可作为业务验收来源；新增原地调整、Sidecar 等能力只在实际启用时增加专项验证，不要求升级时一次性开启所有新特性。先完成版本升级与基线验收，再按独立变更引入新能力，更容易确定失败原因。

### 如何维护跨版本笔记和后续变更记录
<!-- src: temp/kubernetes-zh-docs/01-文档/Kubernetes-文档支持的版本.md; temp/kubernetes-zh-docs/66-API-概述/Kubernetes-弃用策略.md -->

学习资料应同时保留机制解释与适用版本。某个能力稳定后，旧描述应在原章节修订；历史 API 示例若保留，必须明确历史用途，不能只在书末加一句“新版本可能不同”。同一结论在机制册、实践册与实验册出现时，也应同时检查一致性。

每次版本更新至少记录以下内容，形成可复查的变更单，而不是只修改标题中的版本号：

| 字段 | 内容 |
|---|---|
| 原结论 | 文件、章节、原适用范围 |
| 新依据 | 固定版本官方页面、插件发布版本 |
| 行为变化 | API、默认值、限制、删除或替代路径 |
| 示例变化 | 字段调整、前提、预期状态 |
| 验证级别 | 静态、目标服务端、真实运行、生产观察 |

本册的 1.36 是固定学习基线，不自动跟随官方 latest 页面变化。源文件映射保留在独立 HTML 注释中，公开阅读使用官方链接；`temp/` 是本地素材，不应成为读者理解正文的必要依赖。

Markdown 修订后重新生成对应标准 Roadmap，并检查 JSON、回链和根目录登记。完整动画版独立维护，不因标准笔记更新而宣称动画内容已全部同步。后续若继续升级知识基线，应先重做能力与兼容清查，再决定哪些正文需要改动。
