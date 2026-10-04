defineLeaves('k-container',`
process|容器与进程|理解容器共享宿主机内核的边界|对比宿主机与容器看到的进程和系统信息。|了解
namespace|Namespace 隔离|识别进程、网络和挂载隔离|对比两个测试容器的网络与文件视图。|了解
cgroup|cgroup 资源限制|观察 CPU 与内存限制的效果|给实验容器设置资源限制并记录超限行为。
oci|OCI、CRI 与运行时|区分镜像规范和集群运行时接口|画出 kubelet、CRI 与容器运行时的职责关系。|了解`);
defineLeaves('k-image',`
dockerfile|Dockerfile 与构建上下文|控制镜像中实际包含的文件|构建测试镜像，检查忽略规则与运行目录。
layers|镜像分层与多阶段构建|分离构建依赖与运行依赖|比较单阶段和多阶段产物，核对运行功能不变。
digest|镜像标签与摘要|识别可变标签和确定制品|记录镜像 digest，用相同摘要在另一环境运行。
registry|仓库认证与拉取|配置镜像仓库访问并诊断拒绝|制造一次错误凭证，核对拉取错误并修复。|会排障`);
defineLeaves('k-architecture',`
api|API Server 与资源对象|理解声明式 API 和资源状态|提交对象后比较 spec、status 和实际运行状态。|了解
controllers|控制器与协调循环|解释期望状态如何被持续实现|删除一个受管理 Pod，观察控制器重建。
scheduler|调度器与 kubelet|区分选择节点和实际启动工作|追踪一个 Pod 从 Pending 到运行的事件。|了解
etcd|etcd 与控制面依赖|认识集群状态存储的作用|解释控制面组件故障与应用副本运行的差异。|了解`);
defineLeaves('k-lab',`
cluster|本地实验集群|创建可丢弃的容器编排环境|用 kind 或等效工具创建实验集群并记录版本。
context|context 与 namespace|确认命令操作的集群和空间|建立两个上下文，在执行前核对目标。
inspect|get、describe 与 events|通过资源状态和事件收集证据|查看测试 Pod 的调度事件、节点和状态。
apply|YAML 与声明式变更|区分期望配置和运行状态|修改 Deployment 副本数并核对实际变化。`);
defineLeaves('k-workloads',`
pod|Pod 生命周期|理解容器、重启策略和共享资源|创建测试 Pod，观察退出、重启与终态。
replicaset|ReplicaSet 与副本|理解副本控制和选择器|删除一个副本，验证新的副本被创建。|了解
deployment|Deployment 滚动更新|管理无状态应用版本和回滚|更新测试镜像，检查 rollout 状态后回退。
statefulset|StatefulSet 身份与存储|理解有序身份和持久卷绑定|部署测试 StatefulSet，重建一个实例并核对名称和卷。|会用|进阶
daemonset|DaemonSet 节点任务|将节点级任务与普通副本区分|部署测试 DaemonSet，观察节点变化与 Pod 分布。
job|Job 批处理|理解完成次数、重试和失败|让任务先失败再成功，核对尝试次数和最终状态。
cronjob|CronJob 定时运行|控制任务重叠、时区与历史|创建短周期实验任务，验证并发策略和保留记录。`);
defineLeaves('k-config',`
configmap|ConfigMap 配置注入|比较环境变量和挂载文件|以两种方式注入配置，修改后记录实际生效行为。
secret|Secret 与敏感数据|区分编码、访问权限与数据保护|创建测试 Secret，验证无权限身份无法读取。
updates|配置变更与重启|识别需要重新创建 Pod 的配置|更新测试环境变量配置，用受控重启验证新值。
volumes|配置卷与挂载路径|诊断配置文件缺失和权限错误|故意写错挂载路径，根据事件和容器日志修复。|会排障`);
defineLeaves('k-health',`
startup|startupProbe|为慢启动应用留出初始化时间|模拟慢启动，对比有无启动探针的重启行为。
readiness|readinessProbe|控制应用是否进入服务端点|使就绪检查失败，核对 Service 端点和流量。
liveness|livenessProbe|识别应重启的失活状态|模拟应用失活，验证存活检查触发预期重启。
termination|优雅退出与宽限期|在停止前排空请求并清理资源|发布期间发送长请求，记录终止信号和请求完成情况。`);
defineLeaves('k-scheduling',`
requests|requests 与调度容量|区分调度预留和真实使用量|设置不可满足的请求，解释 Pending 事件。|会排障
limits|limits、OOM 与限流|区分内存终止与 CPU 节流|限制测试容器资源，对比 OOM 与 CPU 限流证据。|会排障
affinity|标签选择与亲和性|把工作负载放到满足条件的节点|配置节点标签与亲和性，验证放置结果。
taints|污点与容忍|理解排斥规则和容忍条件|给实验节点加污点，比较有无容忍的调度行为。
quota|ResourceQuota 与 LimitRange|限制命名空间资源范围|配置测试配额，验证超限请求被拒绝。
priority|优先级与抢占|理解资源紧张时的调度选择|阅读测试事件并解释抢占条件及对其他任务的影响。|了解|进阶`);
defineLeaves('k-service',`
selectors|Service 与选择器|把服务入口关联到正确 Pod|改错 selector 后查看空端点，再恢复访问。|会排障
endpoints|EndpointSlice|识别服务实际可用的后端地址|对照 Pod 就绪状态与 EndpointSlice 的变化。
dns|CoreDNS 与集群域名|区分解析失败和服务转发失败|在 Pod 内依次检查域名、Service IP 和 Pod IP。|会排障
types|Service 类型|区分 ClusterIP、NodePort 与 LoadBalancer|为同一应用比较三种入口的路径和环境依赖。|了解`);
defineLeaves('k-ingress',`
controller|入口资源与控制器|区分声明资源和执行实现|创建入口前确认控制器，读取资源状态判断是否被接管。
ingress|Ingress 路由与 TLS|按域名和路径连接服务|配置两个测试路径与证书，验证正确和错误路由。
gateway|Gateway API 入门|理解 Gateway 与 Route 的职责|为测试应用画出 Gateway 与 HTTPRoute 的关系。|了解|进阶
compatibility|控制器能力与排障|核对实际实现支持的功能|检查一项配置的控制器支持说明和资源状态，不只看 apply 成功。|会排障`);
defineLeaves('k-cni',`
addresses|Pod 与节点地址|区分两类网络空间和地址分配|记录双节点集群的 Pod 地址、节点地址和网段。
path|跨节点流量路径|识别路由与封装的作用|追踪一次跨节点请求，画出经过的接口和节点。|了解
plugin|Cilium 或 Calico|选择一个网络实现深入|选择实验插件，核对地址分配与网络诊断入口。|会用|进阶
servicepath|Service 转发与出口|区分服务转发和 Pod 外联|分别测试 Pod、Service 与公网请求，标出差异。|会排障|进阶`);
defineLeaves('k-policy',`
support|策略支持与选择范围|确认插件确实实施网络策略|先核对插件能力，再用正反请求验证策略生效。
ingress|入站隔离|按命名空间与标签放行入口|默认拒绝后仅允许前端调用后端，核对其他访问失败。
egress|出站与 DNS 放行|避免阻断必要解析和外部依赖|限制后端出口，显式放行 DNS 与测试数据库并验证。`);
defineLeaves('k-storage',`
pv|PV 与 PVC 绑定|理解持久卷请求和供给|创建测试 PVC，查看绑定状态与实际卷。
class|StorageClass 与 CSI|识别动态供给与驱动职责|检查存储类和驱动，观察卷如何创建。|了解
modes|访问模式与拓扑|判断卷能被哪些节点和 Pod 使用|制造不满足访问模式或拓扑的部署，解释事件。|会排障
mount|挂载失败定位|区分绑定、挂载和应用权限问题|模拟错误卷配置，按事件和节点日志定位。
reclaim|回收策略与数据保留|理解删除对象后数据的去向|在可丢弃卷上验证回收策略，记录何时数据被删除。`);
defineLeaves('k-rbac',`
identity|用户与 ServiceAccount|区分人工和工作负载身份|使用服务账号读取限定资源，核对实际身份。
roles|Role 与 ClusterRole|按动作、资源和范围设计权限|为只读巡检编写权限，避免无关写操作。
bindings|绑定与授权检查|验证身份确实拥有预期权限|使用授权检查证明读取允许、删除拒绝。`);
defineLeaves('k-security',`
nonroot|非 root 运行|降低应用默认权限|以普通用户运行应用，修复必要写目录权限。
capabilities|提权与 capabilities|限制进程可获得的特权|移除多余能力并禁用提权，验证应用仍正常。
filesystem|只读文件系统与挂载|控制应用可写入的位置|启用只读根文件系统，用专用卷提供必要临时目录。
admission|Pod 安全准入|在创建阶段阻止不合规工作负载|在测试命名空间启用策略，验证特权配置被拒绝。|会用|进阶`);
defineLeaves('k-helm',`
chart|Chart 结构与模板|理解模板和最终 Kubernetes 清单|创建小型 Chart，渲染后核对资源名称与字段。
values|values 与环境参数|分离公共模板和环境差异|用两套 values 渲染，检查差异仅包含预期配置。
release|安装、升级与回滚|通过 release 历史管理版本|升级测试应用，检查历史并回退验证。
validation|模板验证与密钥边界|检查错误配置与敏感信息|用非法 values 验证失败，检查渲染产物不包含真实密钥。`);
defineLeaves('k-monitor',`
node|节点指标|观察节点资源、状态和压力|为实验节点建立 CPU、内存、磁盘和状态看板。
workload|工作负载状态指标|识别副本不足、重启与不可用|停止测试容器，观察期望副本与可用副本差异。
alerts|集群告警与手册|把异常状态关联到处置动作|触发副本不足告警，按手册验证事件和用户影响。`);
defineLeaves('k-logs',`
current|容器日志与标准输出|选择正确容器和时间范围|从多容器 Pod 读取指定容器日志，解释来源。
previous|previous 与退出码|在重启后保留失败线索|复现容器崩溃，读取上次日志并核对退出原因。|会排障
events|事件时间线|关联调度、拉取、启动与探针事件|为一个启动失败 Pod 整理有序事件和配置变更。
collection|日志采集链路|区分应用未输出和采集故障|停掉测试采集器，对比本地日志和集中检索。|会排障|进阶`);
defineLeaves('k-failures',`
pull|ImagePullBackOff|定位镜像地址、网络或凭证问题|配置错误镜像并逐项核对拉取事件。|会排障
crash|CrashLoopBackOff|用日志和退出原因定位重复崩溃|运行会退出的测试程序，提出与证据一致的修复。|会排障
pending|Pending|区分调度容量和卷绑定问题|各制造一种 Pending，证明诊断依据不同。|会排障
oom|OOMKilled|检查限制、真实用量与应用行为|让测试容器触发 OOM，验证调整后关键指标。|会排障
network|Service 不通|沿 DNS、端点和策略检查|制造错误标签与策略阻断，各完成一次修复。|会排障`);
defineLeaves('k-autoscale',`
metrics|HPA 指标与目标|理解指标来源及 requests 依赖|部署 HPA，核对指标可用且目标值合理。
replicas|副本扩缩容验证|比较目标副本、实际副本与吞吐|用受控负载触发伸缩，记录延迟与容量变化。
nodes|节点扩容边界|区分副本不足和节点容量不足|让实验负载超出节点容量，说明 HPA 无法自行解决的部分。|了解|进阶`);
defineLeaves('k-maintenance',`
cordon|节点状态与 cordon|阻止新任务落到维护节点|标记测试节点不可调度，验证新 Pod 的放置。
drain|drain 与驱逐|识别本地数据和特殊工作负载|排空实验节点，记录无法驱逐对象及原因。
pdb|PodDisruptionBudget|理解计划内中断的保护范围|为双副本配置 PDB，验证维护请求受到何种限制。
return|维护后恢复检查|验证节点重返与服务健康|恢复调度，核对节点状态、Pod 分布和用户请求。`);
defineLeaves('k-upgrade',`
skew|版本偏差与兼容性|核对组件允许的版本组合|为实验集群列出控制面、节点与插件版本和依据。|了解
api|弃用 API 与清单检查|发现升级后可能失效的资源定义|检查示例清单的 API 版本，列出需要修改的部分。
rehearsal|升级演练与回退计划|先验证插件、数据和维护顺序|为隔离集群编写升级、验证与停止条件清单。
certs|集群证书检查|了解有效期和轮换责任|列出实验集群关键证书的检查入口及轮换责任。|了解|进阶`);
defineLeaves('k-backup',`
etcd|etcd 快照范围|区分集群对象与业务数据|列出快照包含和不包含的数据类别。|了解
volumes|业务卷与外部数据|为有状态应用建立独立备份计划|盘点卷、外部数据库与凭证，说明恢复顺序。
restore|隔离恢复验证|用业务结果验证恢复完整性|恢复测试应用与数据，核对资源数量和关键查询。`);
defineLeaves('k-gitops',`
sync|Argo CD 同步|理解 Git 配置与集群协调|同步测试应用，查看期望与实际状态差异。
drift|漂移与 Git 回退|用版本记录恢复应用配置|手工修改副本，观察漂移；通过 Git 回退恢复版本。
crd|CRD 与 Operator 概念|区分扩展资源和实现其行为的控制器|画出一个自定义资源的协调关系。|了解`);
