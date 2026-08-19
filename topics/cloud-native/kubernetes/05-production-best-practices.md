# Kubernetes 生产环境最佳实践

## 应用开发

Kubernetes 应用开发的最佳实践。

### 健康检查

Kubernetes 提供了两种机制来跟踪容器和 Pod 的生命周期：存活性探针和就绪性探针。

**就绪性探针确定容器何时可以接收流量。**

kubelet 执行检查并决定应用是否可以接收流量。

**存活性探针确定容器何时应该重启。**

kubelet 执行检查并决定容器是否应该重启。

**资源：**

- 官方 Kubernetes 文档提供了一些关于如何[配置存活性、就绪性和启动探针](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)的实用建议。
- [存活性探针是危险的](https://srcco.de/posts/kubernetes-liveness-probes-are-dangerous.html) 提供了一些关于如何在就绪性探针中设置（或不设置）依赖关系的信息。

#### 容器具有就绪性探针

> 请注意，就绪性和存活性探针没有默认值。

如果您不设置就绪性探针，kubelet 会假设应用在容器启动时就可以接收流量。

如果容器需要 2 分钟才能启动，那么在这 2 分钟内所有对它的请求都会失败。

#### 容器在出现致命错误时崩溃

如果应用遇到不可恢复的错误，[您应该让它崩溃](https://blog.colinbreck.com/kubernetes-liveness-and-readiness-probes-revisited-how-to-avoid-shooting-yourself-in-the-other-foot/#letitcrash)。

此类不可恢复错误的示例包括：

- 未捕获的异常
- 代码中的拼写错误（对于动态语言）
- 无法加载头文件或依赖项

请注意，您不应该发出失败的存活性探针信号。

相反，您应该立即退出进程并让 kubelet 重启容器。

#### 配置被动的存活性探针

存活性探针旨在在容器卡住时重启容器。

考虑以下场景：如果您的应用正在处理无限循环，就没有办法退出或寻求帮助。

当进程消耗 100% CPU 时，它没有时间回复（其他）就绪性探针检查，最终会被从服务中移除。

但是，Pod 仍然注册为当前部署的活动副本。

如果您没有存活性探针，它会保持 _运行_ 状态但与服务分离。

换句话说，进程不仅不处理任何请求，还在消耗资源。

_您应该怎么做？_

1. 从您的应用暴露一个端点
2. 端点始终返回成功响应
3. 从存活性探针消费该端点

请注意，您不应该使用存活性探针来处理应用中的致命错误并请求 Kubernetes 重启应用。

相反，您应该让应用崩溃。

存活性探针应该仅用作进程无响应时的恢复机制。

#### 存活性探针的值与就绪性探针不同

当存活性探针和就绪性探针指向同一个端点时，探针的效果会合并。

当应用发出不准备就绪或不活跃的信号时，kubelet 会同时将容器从服务中分离并删除它。

您可能会注意到连接中断，因为容器没有足够的时间排空当前连接或处理传入的连接。

您可以在以下[讨论优雅关闭的文章](https://freecontent.manning.com/handling-client-requests-properly-with-kubernetes/)中深入了解。

## 应用是独立的

您可能会倾向于仅在所有依赖项（如数据库或后端 API）也准备就绪时才发出应用的就绪信号。

如果应用连接到数据库，您可能认为在数据库_准备就绪_之前返回失败的就绪性探针是个好主意——但这不是。

考虑以下场景：您有一个依赖于后端 API 的前端应用。

如果 API 不稳定（例如，由于错误而时不时不可用），就绪性探针失败，前端应用中的依赖就绪性也会失败。

您就会遇到停机。

更一般地说，**下游依赖项的故障可能会传播到所有上游应用**，最终也会导致面向前端的层崩溃。

### 就绪性探针是独立的

就绪性探针不包括对以下服务的依赖：

- 数据库
- 数据库迁移
- API
- 第三方服务

您可以[在这篇文章中探索当就绪性探针中有依赖项时会发生什么](https://blog.colinbreck.com/kubernetes-liveness-and-readiness-probes-how-to-avoid-shooting-yourself-in-the-foot/#shootingyourselfinthefootwithreadinessprobes)。

### 应用重试连接到依赖服务

当应用启动时，它不应该因为数据库等依赖项未准备就绪而崩溃。

相反，应用应该不断重试连接到数据库直到成功。

Kubernetes 期望应用组件可以按任何顺序启动。

当您确保应用可以重新连接到数据库等依赖项时，您知道可以提供更强大和弹性的服务。

## 优雅关闭

当 Pod 被删除时，您不希望突然终止所有连接。

相反，您应该等待现有连接排空并停止处理新的连接。

请注意，当 Pod 被终止时，该 Pod 的端点会从服务中移除。

但是，kube-proxy 或 Ingress 控制器等组件可能需要一些时间才能收到更改通知。

您可以在[使用 Kubernetes 正确处理客户端请求](https://freecontent.manning.com/handling-client-requests-properly-with-kubernetes/)中找到关于优雅关闭如何工作的详细解释。

正确的优雅关闭序列是：

1. 收到 SIGTERM 后
2. 服务器停止接受新连接
3. 完成所有活动请求
4. 然后立即终止所有保持活动连接
5. 进程退出

您可以使用[此工具测试您的应用是否优雅关闭：kube-sigterm-test](https://github.com/mikkeloscar/kube-sigterm-test)。

### 应用不会在 SIGTERM 上关闭，但会优雅地终止连接

kube-proxy 或 Ingress 控制器等组件可能需要一些时间才能收到端点更改通知。

因此，尽管 Pod 被标记为已终止，流量仍可能流向该 Pod。

应用应该停止接受所有剩余连接上的新请求，并在传出队列排空后关闭这些连接。

如果您需要了解端点如何在集群中传播的复习，[请阅读这篇关于如何正确处理客户端请求的文章](https://freecontent.manning.com/handling-client-requests-properly-with-kubernetes/)。

### 应用在宽限期内仍处理传入请求

您可能想要考虑使用容器生命周期事件，如[preStop 处理程序](https://kubernetes.io/docs/tasks/configure-pod-container/attach-handler-lifecycle-event/#define-poststart-and-prestop-handlers)来自定义 Pod 删除前发生的情况。

### Dockerfile 中的 CMD 将 SIGTERM 转发给进程

您可以通过在应用中捕获 SIGTERM 信号来在 Pod 即将被终止时收到通知。

您还应该注意[在容器中将信号转发给正确的进程](https://pracucci.com/graceful-shutdown-of-kubernetes-pods.html)。

### 关闭所有空闲的保持活动套接字

如果调用应用没有关闭 TCP 连接（例如使用 TCP 保持活动或连接池），它将连接到一个 Pod 而不使用该服务中的其他 Pod。

_但是当 Pod 被删除时会发生什么？_

理想情况下，请求应该转到另一个 Pod。

但是，调用应用与即将被终止的 Pod 有一个长期连接，它会继续使用它。

另一方面，您不应该突然终止长期连接。

相反，您应该在关闭应用之前终止它们。

您可以在这篇关于[优雅关闭 Nodejs HTTP 服务器](http://dillonbuchanan.com/programming/gracefully-shutting-down-a-nodejs-http-server/)的文章中了解保持活动连接。

## 容错性

您的集群节点可能因多种原因随时消失：

- 物理机器的硬件故障
- 云提供商或虚拟机管理程序故障
- 内核恐慌

部署在这些节点上的 Pod 也会丢失。

此外，还有其他 Pod 可能被删除的场景：

- 直接删除 pod（意外）
- 排空节点
- 从节点移除 pod 以允许另一个 Pod 适合该节点

上述任何场景都可能影响应用的可用性并可能导致停机。

您应该防止所有 Pod 都不可用且无法提供实时流量的场景。

### 为您的部署运行多个副本

永远不要单独运行单个 Pod。

相反，考虑将您的 Pod 作为部署、守护进程集、副本集或状态集的一部分进行部署。

[运行多个 Pod 实例可以保证删除单个 Pod 不会导致停机](https://cloudmark.github.io/Node-Management-In-GKE/#replicas)。

### 避免 Pod 被放置在单个节点上

**即使您运行多个 Pod 副本，也不能保证丢失节点不会导致服务停机。**

考虑以下场景：您在单个集群节点上有 11 个副本。

如果节点不可用，11 个副本会丢失，您就会停机。

[您应该对部署应用反亲和性规则，以便 Pod 分布在集群的所有节点上](https://cloudmark.github.io/Node-Management-In-GKE/#pod-anti-affinity-rules)。

[Pod 间亲和性和反亲和性](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/#inter-pod-affinity-and-anti-affinity)文档描述了如何更改您的 Pod 位置（或不）在同一节点上。

### 设置 Pod 中断预算

当节点被排空时，该节点上的所有 Pod 都会被删除并重新调度。

_但是如果您在重负载下并且不能丢失超过 50% 的 Pod 怎么办？_

排空事件可能会影响您的可用性。

为了保护部署免受可能同时关闭多个 Pod 的意外事件影响，您可以定义 Pod 中断预算。

想象一下说：_"Kubernetes，请确保我的应用始终有至少 5 个 Pod 在运行。"_

如果最终状态导致该部署的 Pod 少于 5 个，Kubernetes 将阻止排空事件。

官方文档是了解[Pod 中断预算](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/)的绝佳起点。

## 资源利用

您可以将 Kubernetes 想象为一个熟练的俄罗斯方块玩家。

Docker 容器是方块；服务器是棋盘，调度器是玩家。

![Kubernetes 是最佳俄罗斯方块玩家](tetris.svg)

为了最大化调度器的效率，您应该与 Kubernetes 分享资源利用、工作负载优先级和开销等详细信息。

### 为所有容器设置内存限制和请求

资源限制用于约束容器可以利用的 CPU 和内存量，并使用 `containerSpec` 的 resources 属性设置。

调度器使用这些作为决定哪个节点最适合当前 Pod 的指标之一。

没有内存限制的容器根据调度器的说法内存利用率为零。

无限数量的 Pod 可以在任何节点上调度，导致资源过度分配和潜在的节点（和 kubelet）崩溃。

CPU 限制也是如此。

_但是您应该总是为内存和 CPU 设置限制和请求吗？_

是也不是。

如果您的进程超过内存限制，进程会被终止。

由于 CPU 是可压缩资源，如果您的容器超过限制，进程会被限制。

即使它本可以使用当时可用的一些 CPU。

**[CPU 限制很难。](https://www.reddit.com/r/kubernetes/comments/cmp7jj/multithreading_in_a_container_with_limited/ew52fcj/)**

如果您想深入了解 CPU 和内存限制，您应该查看以下文章：

- [理解 kubernetes 中的资源限制：内存](https://medium.com/@betz.mark/understanding-resource-limits-in-kubernetes-memory-6b41e9a955f9)
- [理解 kubernetes 中的资源限制：CPU 时间](https://medium.com/@betz.mark/understanding-resource-limits-in-kubernetes-cpu-time-9eff74d3161b)

> 请注意，如果您不确定什么是_正确的_ CPU 或内存限制，您可以在 Kubernetes 中使用[垂直 Pod 自动扩缩器](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler)，并开启推荐模式。自动扩缩器会分析您的应用并为其推荐限制。

### 将 CPU 请求设置为 1 CPU 或以下

除非您有计算密集型作业，[建议将请求设置为 1 CPU 或以下](https://www.youtube.com/watch?v=xjpHggHKm78)。

### 禁用 CPU 限制——除非您有好的用例

CPU 以每时间单位的 CPU 时间单位来衡量。

`cpu: 1` 意味着每秒 1 CPU 秒。

如果您有 1 个线程，您不能每秒消耗超过 1 CPU 秒。

如果您有 2 个线程，您可以在 0.5 秒内消耗 1 CPU 秒。

8 个线程可以在 0.125 秒内消耗 1 CPU 秒。

之后，您的进程会被限制。

如果您不确定应用的最佳设置是什么，最好不要设置 CPU 限制。

如果您想了解更多，[这篇文章深入探讨了 CPU 请求和限制](https://medium.com/@betz.mark/understanding-resource-limits-in-kubernetes-cpu-time-9eff74d3161b)。

### 命名空间有 LimitRange

如果您认为可能会忘记设置内存和 CPU 限制，您应该考虑使用 LimitRange 对象来定义在当前命名空间中部署的容器的标准大小。

[关于 LimitRange 的官方文档](https://kubernetes.io/docs/concepts/policy/limit-range/)是一个绝佳的起点。

### 为 Pod 设置适当的服务质量 (QoS)

当节点进入过度提交状态（即使用过多资源）时，Kubernetes 尝试驱逐该节点中的一些 Pod。

Kubernetes 根据明确定义的逻辑对 Pod 进行排名和驱逐。

您可以在官方文档中找到更多关于[为 Pod 配置服务质量](https://kubernetes.io/docs/tasks/configure-pod-container/quality-service-pod/)的信息。

## 标记资源

标签是您用来组织 Kubernetes 对象的机制。

标签是没有预定义含义的键值对。

它们可以应用于集群中从 Pod 到服务、Ingress 清单、端点等的所有资源。

您可以使用标签按目的、所有者、环境或其他标准对资源进行分类。

因此，您可以选择一个标签来标记环境中的 Pod，如"此 pod 在生产环境中运行"或"支付团队拥有该部署"。

您也可以完全省略标签。

但是，您可能想要考虑使用标签来涵盖以下类别：

- 技术标签，如环境
- 自动化标签
- 与您的业务相关的标签，如成本中心分配
- 与安全相关的标签，如合规要求

### 资源定义了技术标签

您可以用以下标签标记您的 Pod：

- `name`，应用的名称，如"用户 API"
- `instance`，标识应用实例的唯一名称（您可以使用容器镜像标签）
- `version`，应用的当前版本（增量计数器）
- `component`，架构中的组件，如"API"或"数据库"
- `part-of`，此应用所属的更高级别应用的名称，如"支付网关"
- `managed-by`，用于管理应用操作的工具，如"kubectl"或"Helm"

以下是如何在部署中使用这些标签的示例：

```yaml|highlight=6-11,20-24|title=deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deployment
  labels:
    app.kubernetes.io/name: user-api
    app.kubernetes.io/instance: user-api-5fa65d2
    app.kubernetes.io/version: "42"
    app.kubernetes.io/component: api
    app.kubernetes.io/part-of: payment-gateway
    app.kubernetes.io/managed-by: kubectl
spec:
  replicas: 3
  selector:
    matchLabels:
      application: my-app
  template:
    metadata:
      labels:
        app.kubernetes.io/name: user-api
        app.kubernetes.io/instance: user-api-5fa65d2
        app.kubernetes.io/version: "42"
        app.kubernetes.io/component: api
        app.kubernetes.io/part-of: payment-gateway
    spec:
      containers:
      - name: app
        image: myapp
```

这些标签是[官方文档推荐的](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/)。

> 请注意，建议标记**所有资源**。

### 资源定义了业务标签

您可以用以下标签标记您的 Pod：

- `owner`，用于标识谁负责该资源
- `project`，用于确定资源所属的项目
- `business-unit`，用于标识与资源关联的成本中心或业务单元；通常用于成本分配和跟踪

以下是如何在部署中使用这些标签的示例：

```yaml|highlight=6-8,17-19|title=deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deployment
  labels:
    owner: payment-team
    project: fraud-detection
    business-unit: "80432"
spec:
  replicas: 3
  selector:
    matchLabels:
      application: my-app
  template:
    metadata:
      labels:
        owner: payment-team
        project: fraud-detection
        business-unit: "80432"
    spec:
      containers:
      - name: app
        image: myapp
```

您可以在[AWS 标记策略页面](https://aws.amazon.com/answers/account-management/aws-tagging-strategies/)上探索资源的标签和标记。

该文章不是特定于 Kubernetes 的，但探索了一些最常见的资源标记策略。

> 请注意，建议标记**所有资源**。

### 资源定义了安全标签

您可以用以下标签标记您的 Pod：

- `confidentiality`，资源支持的数据机密性级别的标识符
- `compliance`，旨在遵守特定合规要求的工作负载的标识符

以下是如何在部署中使用这些标签的示例：

```yaml|highlight=6-11,20-24|title=deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deployment
  labels:
    confidentiality: official
    compliance: pci
spec:
  replicas: 3
  selector:
    matchLabels:
      application: my-app
  template:
    metadata:
      labels:
        confidentiality: official
        compliance: pci
    spec:
      containers:
      - name: app
        image: myapp
```

您可以在[AWS 标记策略页面](https://aws.amazon.com/answers/account-management/aws-tagging-strategies/)上探索资源的标签和标记。

该文章不是特定于 Kubernetes 的，但探索了一些最常见的资源标记策略。

> 请注意，建议标记**所有资源**。

## 日志记录

应用日志可以帮助您了解应用内部发生的情况。

日志对于调试问题和监控应用活动特别有用。

### 应用记录到 `stdout` 和 `stderr`

有两种日志记录策略：_被动_和_主动_。

使用被动日志记录的应用不知道日志记录基础设施，并将日志消息记录到标准输出。

这个最佳实践是[十二要素应用](https://12factor.net/logs)的一部分。

在主动日志记录中，应用与中间聚合器建立网络连接，向第三方日志服务发送数据，或直接写入数据库或索引。

主动日志记录被认为是反模式，应该避免。

### 避免使用边车进行日志记录（如果可以）

如果您希望[对具有非标准日志事件模型的应用应用日志转换](https://rclayton.silvrback.com/container-services-logging-with-docker#effective-logging-infrastructure)，您可能想要使用边车容器。

使用边车容器，您可以在将日志条目发送到其他地方之前对其进行规范化。

例如，您可能想要在将其发送到日志记录基础设施之前将 Apache 日志转换为 Logstash JSON 格式。

但是，如果您控制应用，您可以一开始就输出正确的格式。

您可以为集群中的每个 Pod 节省运行额外容器的成本。

## 扩缩容

### 容器不在其本地文件系统中存储任何状态

容器有本地文件系统，您可能想要使用它来持久化数据。

但是，在容器的本地文件系统中存储持久数据会阻止包含的 Pod 水平扩缩（即通过添加或删除 Pod 副本）。

这是因为，通过使用本地文件系统，每个容器维护自己的"状态"，这意味着 Pod 副本的状态可能会随时间分歧。这导致从用户角度来看行为不一致（例如，当请求命中一个 Pod 时，特定用户信息可用，但当请求命中另一个 Pod 时不可用）。

相反，任何持久信息都应该保存在 Pod 外部的中央位置。例如，在集群中的 PersistentVolume 中，或者更好的是在集群外部的某些存储服务中。

### 对具有可变使用模式的应用使用水平 Pod 自动扩缩器

[水平 Pod 自动扩缩器 (HPA)](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/) 是 Kubernetes 的内置功能，它监控您的应用并根据当前使用情况自动添加或删除 Pod 副本。

配置 HPA 允许您的应用在任何流量条件下保持可用和响应，包括意外的流量峰值。

要配置 HPA 自动扩缩您的应用，您必须创建一个[HorizontalPodAutoscaler](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.16/#horizontalpodautoscaler-v1-autoscaling)资源，它定义了要为您的应用监控的指标。

HPA 可以监控内置资源指标（Pod 的 CPU 和内存使用情况）或自定义指标。在自定义指标的情况下，您还负责收集和暴露这些指标，例如，您可以使用[Prometheus](https://prometheus.io/)和[Prometheus 适配器](https://github.com/DirectXMan12/k8s-prometheus-adapter)来做到这一点。

### 在仍处于测试版时不要使用垂直 Pod 自动扩缩器

类似于[水平 Pod 自动扩缩器 (HPA)](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)，存在[垂直 Pod 自动扩缩器 (VPA)](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler)。

VPA 可以自动调整 Pod 的资源请求和限制，以便当 Pod 需要更多资源时，它可以获得它们（通过增加/减少单个 Pod 的资源进行扩缩称为_垂直扩缩_，与_水平扩缩_相反，水平扩缩意味着增加/减少 Pod 的副本数量）。

这对于无法水平扩缩的应用很有用。

但是，VPA 目前处于测试版，它有一些[已知限制](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler#limitations-of-beta-version)（例如，通过更改其资源要求扩缩 Pod 需要杀死并重启 Pod）。

考虑到这些限制，以及 Kubernetes 上的大多数应用无论如何都可以水平扩缩的事实，建议不要在生产中使用 VPA（至少直到有稳定版本）。

### 如果您有高度变化的工作负载，请使用集群自动扩缩器

[集群自动扩缩器](https://github.com/kubernetes/autoscaler/tree/master/cluster-autoscaler)是另一种类型的"自动扩缩器"（除了[水平 Pod 自动扩缩器](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)和[垂直 Pod 自动扩缩器](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler)）。

集群自动扩缩器可以通过添加或删除工作节点来自动扩缩集群的大小。

当 Pod 由于现有工作节点资源不足而无法调度时，会发生扩缩操作。在这种情况下，集群自动扩缩器创建一个新的工作节点，以便可以调度 Pod。类似地，当现有工作节点的利用率较低时，集群自动扩缩器可以通过驱逐其中一个工作节点的所有工作负载并删除它来缩容。

使用集群自动扩缩器对于高度可变的工作负载很有意义，例如，当 Pod 数量可能在短时间内成倍增加，然后回到之前的值时。在这种情况下，集群自动扩缩器允许您满足需求峰值，而不会因为过度配置工作节点而浪费资源。

但是，如果您的工作负载变化不大，设置集群自动扩缩器可能不值得，因为它可能永远不会被触发。如果您的工作负载缓慢且单调地增长，监控现有工作节点的利用率并在它们达到临界值时手动添加额外的工作节点可能就足够了。

## 配置和密钥

### 外部化所有配置

配置应该维护在应用代码外部。

这有几个好处。首先，更改配置不需要重新编译应用。其次，配置可以在应用运行时更新。第三，相同的代码可以在不同的环境中使用。

在 Kubernetes 中，配置可以保存在 ConfigMaps 中，然后可以作为卷挂载到容器中或作为环境变量传递。

仅在 ConfigMaps 中保存非敏感配置。对于敏感信息（如凭据），使用 Secret 资源。

### 将密钥作为卷挂载，而不是环境变量

Secret 资源的内容应该作为卷挂载到容器中，而不是作为环境变量传递。

这是为了防止密钥值出现在用于启动容器的命令中，该命令可能被不应该访问密钥值的个人检查。

---

## 集群配置

集群配置的最佳实践。

### 已批准的 Kubernetes 配置

Kubernetes 很灵活，可以以多种不同的方式进行配置。

但是您如何知道集群的推荐配置是什么？

最佳选择是将您的集群与标准参考进行比较。

对于 Kubernetes，参考是互联网安全中心 (CIS) 基准。

#### 集群通过 CIS 基准测试

互联网安全中心提供多个指南和基准测试，用于保护代码的最佳实践。

他们还维护一个 Kubernetes 基准，您可以从[官方网站下载](https://www.cisecurity.org/benchmark/kubernetes/)。

虽然您可以阅读冗长的指南并手动检查您的集群是否符合要求，但更简单的方法是下载并执行[`kube-bench`](https://github.com/aquasecurity/kube-bench)。

[`kube-bench`](https://github.com/aquasecurity/kube-bench) 是一个旨在自动化 CIS Kubernetes 基准并报告集群中错误配置的工具。

示例输出：

```terminal|title=bash
[INFO] 1 Master Node Security Configuration
[INFO] 1.1 API Server
[WARN] 1.1.1 Ensure that the --anonymous-auth argument is set to false (Not Scored)
[PASS] 1.1.2 Ensure that the --basic-auth-file argument is not set (Scored)
[PASS] 1.1.3 Ensure that the --insecure-allow-any-token argument is not set (Not Scored)
[PASS] 1.1.4 Ensure that the --kubelet-https argument is set to true (Scored)
[PASS] 1.1.5 Ensure that the --insecure-bind-address argument is not set (Scored)
[PASS] 1.1.6 Ensure that the --insecure-port argument is set to 0 (Scored)
[PASS] 1.1.7 Ensure that the --secure-port argument is not set to 0 (Scored)
[FAIL] 1.1.8 Ensure that the --profiling argument is set to false (Scored)
```

> 请注意，无法使用 `kube-bench` 检查托管集群（如 GKE、EKS 和 AKS）的主节点。主节点由云提供商控制和管理。

#### 禁用元数据云提供商元数据 API

云平台（AWS、Azure、GCE 等）经常向实例本地暴露元数据服务。

默认情况下，这些 API 可以被在实例上运行的 Pod 访问，并且可以包含该节点的云凭据或配置数据（如 kubelet 凭据）。

这些凭据可用于在集群内或同一账户下的其他云服务中升级权限。

#### 限制对 alpha 或 beta 功能的访问

Alpha 和 beta Kubernetes 功能正在积极开发中，可能有导致安全漏洞的限制或错误。

始终评估 alpha 或 beta 功能可能提供的价值与对安全态势的潜在风险。

如有疑问，请禁用您不使用的功能。

## 身份验证

当您使用 `kubectl` 时，您会针对 kube-api 服务器组件进行身份验证。

Kubernetes 支持不同的身份验证策略：

- **静态令牌**：难以失效，应该避免
- **Bootstrap 令牌**：与上面的静态令牌相同
- **基本身份验证**通过网络以明文传输凭据
- **X509 客户端证书**需要定期更新和重新分发客户端证书
- **服务账户令牌**是集群中运行的应用和工作负载的首选身份验证策略
- **OpenID Connect (OIDC) 令牌**：最终用户的最佳身份验证策略，因为 OIDC 与您的身份提供商（如 AD、AWS IAM、GCP IAM 等）集成

您可以在[官方文档](https://kubernetes.io/docs/reference/access-authn-authz/authentication/)中详细了解这些策略。

### 使用 OpenID (OIDC) 令牌作为用户身份验证策略

Kubernetes 支持各种身份验证方法，包括 OpenID Connect (OIDC)。

OpenID Connect 允许单点登录 (SSO)，如您的 Google 身份连接到 Kubernetes 集群和其他开发工具。

您不需要记住或单独管理凭据。

您可以让多个集群连接到同一个 OpenID 提供商。

您可以在这篇文章中[了解更多关于 Kubernetes 中的 OpenID 连接](https://thenewstack.io/kubernetes-single-sign-one-less-identity/)。

## 基于角色的访问控制 (RBAC)

基于角色的访问控制 (RBAC) 允许您定义如何访问集群中资源的策略。

### 服务账户令牌仅用于应用和控制器

服务账户令牌不应用于尝试与 Kubernetes 集群交互的最终用户，但它们是 Kubernetes 上运行的应用和工作负载的首选身份验证策略。

## 日志记录设置

您应该收集并集中存储集群中运行的所有工作负载的日志以及集群组件本身的日志。

### 日志有保留和归档策略

您应该保留 30-45 天的历史日志。

#### 从节点、控制平面、审计收集日志

要收集日志的内容：

- 节点（kubelet、容器运行时）
- 控制平面（API 服务器、调度器、控制器管理器）
- Kubernetes 审计（对 API 服务器的所有请求）

您应该收集的内容：

- 应用名称。从元数据标签中检索。
- 应用实例。从元数据标签中检索。
- 应用版本。从元数据标签中检索。
- 集群 ID。从 Kubernetes 集群中检索。
- 容器名称。从 Kubernetes API 中检索。
- 运行此容器的集群节点。从 Kubernetes 集群中检索。
- 运行容器的 Pod 名称。从 Kubernetes 集群中检索。
- 命名空间。从 Kubernetes 集群中检索。

#### 优先使用每个节点上的守护进程来收集日志，而不是边车

应用应该记录到 stdout 而不是文件。

[每个节点上的守护进程可以从容器运行时收集日志](https://rclayton.silvrback.com/container-services-logging-with-docker#effective-logging-infrastructure)（如果记录到文件，每个 pod 可能需要一个边车容器）。

#### 提供日志聚合工具

使用日志聚合工具，如 EFK 堆栈（Elasticsearch、Fluentd、Kibana）、DataDog、Sumo Logic、Sysdig、GCP Stackdriver、Azure Monitor、AWS CloudWatch。

---

## 治理

创建、管理和管理命名空间的最佳实践。

### 命名空间限制

当您决定将集群隔离到命名空间中时，您应该防止资源滥用。

您不应该允许用户使用超过您事先同意的资源。

集群管理员可以使用配额和限制范围来设置约束，限制项目中使用的对象数量或计算资源量。

如果您需要复习[限制范围](https://kubernetes.io/docs/concepts/policy/limit-range/)，您应该查看官方文档。

### 命名空间配置 LimitRange

没有限制的容器可能导致与其他容器的资源争用和计算资源的未优化消耗。

Kubernetes 有两个用于约束资源利用的功能：ResourceQuota 和 LimitRange。

使用 LimitRange 对象，您可以为命名空间内的单个容器定义资源请求和限制的默认值。

在该命名空间内创建的、未明确指定请求和限制值的任何容器都会被分配默认值。

如果您需要复习[资源配额](https://kubernetes.io/docs/concepts/policy/resource-quotas/)，您应该查看官方文档。

### 命名空间有 ResourceQuotas

使用 ResourceQuotas，您可以限制命名空间内所有容器的总资源消耗。

为命名空间定义资源配额会限制属于该命名空间的所有容器可以消耗的 CPU、内存或存储资源总量。

您还可以为其他 Kubernetes 对象（如当前命名空间中的 Pod 数量）设置配额。

如果您认为有人可能利用您的集群并创建 20000 个 ConfigMap，使用 LimitRange 就是您如何防止这种情况的方法。

## Pod 安全策略

当 Pod 部署到集群中时，您应该防范：

- 容器被破坏
- 容器使用节点上不允许的资源，如进程、网络或文件系统

更一般地说，您应该将 Pod 可以做的事情限制在最低限度。

### 启用 Pod 安全策略

例如，您可以使用 Kubernetes Pod 安全策略来限制：

- 访问主机进程或网络命名空间
- 运行特权容器
- 容器运行的用户
- 访问主机文件系统
- Linux 功能、Seccomp 或 SELinux 配置文件

选择正确的策略取决于集群的性质。

以下文章解释了一些[Kubernetes Pod 安全策略最佳实践](https://resources.whitesourcesoftware.com/blog-whitesource/kubernetes-pod-security-policy)。

### 禁用特权容器

在 Pod 中，容器可以以"特权"模式运行，对主机系统上的资源具有几乎无限制的访问权限。

虽然有一些特定用例需要这种级别的访问，但一般来说，让容器这样做是安全风险。

特权 Pod 的有效用例包括使用节点上的硬件，如 GPU。

您可以[从这篇文章中了解更多关于安全上下文和特权容器的信息](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)。

### 在容器中使用只读文件系统

在容器中运行只读文件系统会强制容器不可变。

这不仅减轻了一些旧的（和危险的）做法，如热补丁，还有助于防止恶意进程在容器内存储或操作数据的风险。

在容器中运行只读文件系统可能听起来很简单，但可能会带来一些复杂性。

_如果您需要写入日志或将文件存储在临时文件夹中怎么办？_

您可以在这篇关于[在生产中安全运行 Docker 容器](https://medium.com/@axbaretto/running-docker-containers-securely-in-production-98b8104ef68)的文章中了解权衡。

### 防止容器以 root 身份运行

在容器中运行的进程与主机上的任何其他进程没有什么不同，除了它有一小块元数据声明它在容器中。

因此，容器中的 root 与主机机器上的 root（uid 0）相同。

如果用户设法突破在容器中以 root 身份运行的应用，他们可能能够以相同的 root 用户访问主机。

配置容器使用非特权用户是防止权限升级攻击的最佳方法。

如果您想了解更多，以下[文章提供了当您以 root 身份运行容器时会发生什么的详细解释示例](https://medium.com/@mccode/processes-in-containers-should-not-run-as-root-2feae3f0df3b)。

### 限制功能

Linux 功能使进程能够执行默认情况下只有 root 用户可以执行的许多特权操作中的一些。

例如，`CAP_CHOWN` 允许进程"对文件 UID 和 GID 进行任意更改"。

即使您的进程不以 `root` 身份运行，进程也有可能通过升级权限来使用这些类似 root 的功能。

换句话说，如果您不想被破坏，您应该只启用您需要的功能。

_但是应该启用哪些功能以及为什么？_

以下两篇文章深入探讨了 Linux 内核中功能的理论和实践最佳实践：

- [Linux 功能：为什么存在以及它们如何工作](https://blog.container-solutions.com/linux-capabilities-why-they-exist-and-how-they-work)
- [Linux 功能实践](https://blog.container-solutions.com/linux-capabilities-in-practice)

### 防止权限升级

您应该关闭权限升级来运行容器，以防止使用 `setuid` 或 `setgid` 二进制文件升级权限。

## 网络策略

Kubernetes 网络必须遵守三个基本规则：

1. **容器可以与网络中的任何其他容器通信**，在此过程中没有地址转换——即不涉及 NAT
2. **集群中的节点可以与网络中的任何容器通信，反之亦然**。即使在这种情况下，也没有地址转换——即不涉及 NAT
3. **容器的 IP 地址始终相同**，无论从另一个容器还是从自身看到都是如此。

如果您计划将集群隔离成更小的块并在命名空间之间进行隔离，第一个规则没有帮助。

_想象一下，如果集群中的用户能够使用集群中的任何其他服务。_

现在，_想象一下，如果集群中的恶意用户获得了集群的访问权限_——他们可以向整个集群发出请求。

要解决这个问题，您可以使用网络策略定义 Pod 应该如何被允许在当前命名空间内和跨命名空间进行通信。

### 启用网络策略

Kubernetes 网络策略指定 Pod 组的访问权限，就像云中的安全组用于控制对 VM 实例的访问一样。

换句话说，它在运行在 Kubernetes 集群上的 Pod 之间创建防火墙。

如果您不熟悉网络策略，您可以阅读[保护 Kubernetes 集群网络](https://ahmet.im/blog/kubernetes-network-policy/)。

### 每个命名空间都有保守的 NetworkPolicy

此存储库包含 Kubernetes 网络策略的各种用例和示例 YAML 文件，以便在您的设置中利用。如果您曾经想知道[如何丢弃/限制对在 Kubernetes 上运行的应用的流量](https://github.com/ahmetb/kubernetes-network-policy-recipes)，请继续阅读。

## 基于角色的访问控制 (RBAC) 策略

基于角色的访问控制 (RBAC) 允许您定义如何访问集群中资源的策略。

通常的做法是给予最少的必要权限，_但什么是实用的，您如何量化最少权限？_

细粒度策略提供更大的安全性但需要更多的管理努力。

更广泛的授权可以给服务账户不必要的 API 访问，但更容易控制。

_您应该为每个命名空间创建一个策略并共享它吗？_

_或者也许最好在更细粒度的基础上拥有它们？_

没有一刀切的方法，您应该根据具体情况判断您的需求。

_但是您从哪里开始？_

如果您从一个空规则的 Role 开始，您可以逐个添加您需要的所有资源，并仍然确保您没有给予太多。

### 禁用默认 ServiceAccount 的自动挂载

请注意，[默认 ServiceAccount 会自动挂载到所有 Pod 的文件系统中](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/#use-the-default-service-account-to-access-the-api-server)。

您可能想要禁用该功能并提供更细粒度的策略。

### RBAC 策略设置为必要的最少权限

关于如何设置 RBAC 规则很难找到好的建议。在[Kubernetes RBAC 的 3 种现实方法](https://thenewstack.io/three-realistic-approaches-to-kubernetes-rbac/)中，您可以找到三种实际场景和如何开始的实用建议。

### RBAC 策略是细粒度的且不共享

Zalando 有一个简洁的策略来定义角色和服务账户。

首先，他们描述他们的需求：

- 用户应该能够部署，但他们不应该被允许读取 Secrets 等
- 管理员应该获得对所有资源的完全访问权限
- 应用默认不应获得对 Kubernetes API 的写入访问权限
- 应该可以为某些用途写入 Kubernetes API。

这四个需求转化为五个独立的角色：

- ReadOnly
- PowerUser
- Operator
- Controller
- Admin

您可以[在此链接中阅读他们的决定](https://kubernetes-on-aws.readthedocs.io/en/latest/dev-guide/arch/access-control/adr-004-roles-and-service-accounts.html)。

## 自定义策略

即使您能够在集群中为 Secrets 和 Pod 等资源分配策略，也有一些情况，Pod 安全策略 (PSP)、基于角色的访问控制 (RBAC) 和网络策略无法满足需求。

例如，您可能想要避免从公共互联网下载容器，并希望首先批准这些容器。

也许您有一个内部注册表，只有此注册表中的镜像才能部署在您的集群中。

_您如何强制只有**受信任的容器**才能部署在集群中？_

没有 RBAC 策略可以做到这一点。

网络策略不会起作用。

_您应该做什么？_

您可以使用[准入控制器](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/)来审查提交到集群的资源。

### 仅允许从已知注册表部署容器

您可能想要考虑的最常见的自定义策略之一是限制可以在集群中部署的镜像。

[以下教程解释了如何使用 Open Policy Agent 限制未批准的镜像](https://blog.openpolicyagent.org/securing-the-kubernetes-api-with-open-policy-agent-ce93af0552c3#3c6e)。

### 在 Ingress 主机名中强制唯一性

当用户创建 Ingress 清单时，他们可以在其中使用任何主机名。

```yaml|highlight=7|title=ingress.yaml
apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: example-ingress
spec:
  rules:
    - host: first.example.com
      http:
        paths:
          - backend:
              serviceName: service
              servicePort: 80
```

但是，您可能想要防止用户使用**相同的主机名多次**并相互覆盖。

Open Policy Agent 的官方文档有[关于如何将 Ingress 资源检查作为验证 webhook 的一部分的教程](https://www.openpolicyagent.org/docs/latest/kubernetes-tutorial/#4-define-a-policy-and-load-it-into-opa-via-kubernetes)。

### 在 Ingress 主机名中仅使用已批准的域名

当用户创建 Ingress 清单时，他们可以在其中使用任何主机名。

```yaml|highlight=7|title=ingress.yaml
apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: example-ingress
spec:
  rules:
    - host: first.example.com
      http:
        paths:
          - backend:
              serviceName: service
              servicePort: 80
```

但是，您可能想要防止用户使用**无效的主机名**。

Open Policy Agent 的官方文档有[关于如何将 Ingress 资源检查作为验证 webhook 的一部分的教程](https://www.openpolicyagent.org/docs/latest/kubernetes-tutorial/#4-define-a-policy-and-load-it-into-opa-via-kubernetes)。
