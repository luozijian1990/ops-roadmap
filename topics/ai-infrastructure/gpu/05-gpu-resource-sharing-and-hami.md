# GPU AI Infrastructure 学习笔记 · GPU Resource Sharing / HAMi

## 第 1 章 · GPU 资源共享方案

### Full GPU 提供最稳定的性能和隔离

Full GPU 把一张物理 GPU 独占分配给一个 Pod、Job、VM 或进程组。它的性能可预测、显存边界清晰、排障路径最简单，适合训练、低延迟推理和对租户隔离要求高的场景。

代价是小任务会留下大量空闲算力，集群可能出现“GPU 已分配但 Active 很低”。是否采用共享，应基于实际工作负载的并发、显存峰值、SLA 和隔离要求，而不是只看平均利用率。

#### 独占 GPU 仍需明确进程和容器边界

一张 GPU 分给一个 Pod，不代表 Pod 内只能有一个 CUDA Process。训练 Launcher、Data Worker 或 Sidecar 可能共同访问设备。平台应限制特权容器和 Host Device 挂载，防止绕过 Device Plugin 访问其他 GPU。

#### 整节点分配适合强拓扑作业

需要全部 NVSwitch GPU、CPU/NIC 对齐或稳定性能的 Job，可以独占整节点。代价是小型 Job 无法填补空闲资源，应通过 Queue、Backfill 或不同节点池优化，而不是在同节点临时混入不受控负载。

### MIG 用硬件分区提供资源边界

Multi-Instance GPU（MIG）把支持的 GPU 划分为 GPU Instance 和 Compute Instance，每个实例拥有硬件规定的 SM、显存和引擎资源边界。它比时间切片更容易提供稳定的显存和计算隔离，但可用 Profile、布局和实例数量受 GPU 代际限制。

MIG 重配通常要求没有进程持有 GPU，并可能影响节点上所有 GPU Pod。Profile Placement Fragmentation 会导致总空闲资源足够却无法放下目标 Profile，调度和运维都要观察物理布局，而不只是资源总量。

#### GI、CI、Profile 和资源名要能够互相映射

GPU Instance（GI）划分显存和硬件引擎，Compute Instance（CI）在 GI 内划分计算资源。Kubernetes Device Plugin 根据策略把 MIG 设备暴露为一种或多种资源名。Pod Request、Node Allocatable、MIG UUID 和物理 GPU UUID 必须可追踪。

```bash
nvidia-smi -L
nvidia-smi mig -lgi
nvidia-smi mig -lci
kubectl describe node <node> | rg 'nvidia.com/mig|Capacity|Allocatable' -C 2
```

#### MIG Manager 用 Node Label 驱动目标布局

GPU Operator 的 MIG Manager 可以根据 ConfigMap 和 Node Label 应用预定义布局。重配前应 Cordon/Drain，确认没有进程持有 GPU；重配后验证 Label、GI/CI、Device Plugin Resource 和 DCGM Mapping。配置成功但资源名未更新，仍会让 Pod Pending 或拿到错误 Profile。

### Time-Slicing 共享时间而不提供显存隔离

Time-Slicing 让多个 Pod 在同一物理 GPU 上轮流获得执行时间。它可以提高小任务的利用率，但多个进程共享同一显存地址空间和硬件资源，通常不能提供 MIG 那样的显存/故障隔离。一个 Pod 的显存增长或错误仍可能影响其他租户。

适合时间切片的工作负载应有较低显存峰值、可接受抖动并且不会把 GPU 长时间独占。平台需要明确可见 GPU 数量、配额、超卖比例、服务质量和 OOM 处理方式。

#### Replica 数表示可调度份额而不是物理 GPU 数

Time-Slicing 配置通常为某个 Resource Name 指定 Replica 数。Node Allocatable 增大表示可分配的时间份额，不表示硬件显存或 Tensor Core 成倍增加。监控和容量报表必须同时展示物理 GPU 数与逻辑 Replica 数。

```yaml
version: v1
sharing:
  timeSlicing:
    renameByDefault: true
    resources:
    - name: nvidia.com/gpu
      replicas: 4
```

这是结构示例，字段和部署方式需按当前 Device Plugin/GPU Operator 版本验证。上线前应压测多个 Pod 的显存争用、延迟抖动、错误传播和公平性。

### MPS、vGPU 和 Passthrough 面向不同边界

MPS 是 CUDA 进程共享执行资源的运行时服务，适合多个小进程共同填满 GPU，但隔离和运维边界依赖平台配置。vGPU 面向 Hypervisor 和 VM，通过 Profile 把 GPU 能力交付给虚拟机；PCI Passthrough 则把物理设备独占直通给 VM，性能和隔离更强但灵活性更低。

| 方案 | 显存隔离 | 算力隔离 | 典型平台 | 主要取舍 |
| --- | --- | --- | --- | --- |
| Full GPU | 强 | 强 | 裸机/Kubernetes/VM | 利用率可能低 |
| MIG | 硬件边界 | 硬件边界 | 支持 MIG 的 GPU | Profile 和布局受限 |
| Time-Slicing | 弱 | 时间复用 | Kubernetes | 利用率高但抖动和隔离弱 |
| MPS | 弱到中 | 共享执行资源 | CUDA 多进程 | 需要进程和服务治理 |
| vGPU | 按 Profile | 按 Profile | Hypervisor | 授权、版本和虚拟化复杂 |
| Passthrough | 强 | 强 | VM 独占 | 设备不可灵活共享 |

#### MPS 需要控制 Daemon、Client 和故障域

MPS Control Daemon 管理多个 Client 的 CUDA 工作，适合单个进程无法填满 GPU 的场景。Active Thread Percentage 可以限制 Client 可用的执行资源比例，但不等同于强硬件隔离；Client Fatal Error、Daemon 生命周期和 UID/权限都需要平台治理。

#### vGPU 需要同时监控物理和虚拟视图

vGPU Profile 规定 Framebuffer 和部分资源能力，Hypervisor 侧管理物理 GPU，Guest 内运行 vGPU Driver。性能问题要同时查看 pGPU、vGPU、VM 和 Guest Workload；只在 Guest 看利用率无法判断其他 VM 的邻居争用。

## 第 2 章 · HAMi 和 GPU 共享平台

### HAMi 把软件 GPU 资源模型接入 Kubernetes

HAMi 面向 Kubernetes GPU 共享和异构加速器管理，通过 Scheduler、Device Plugin、Webhook/注入逻辑和 HAMi-Core 等组件，为 Pod 提供软件层面的 GPU 显存和算力限制及调度账本。

从能力定位看，HAMi 属于 Kubernetes 场景的 Software vGPU：GPU Memory Limit 控制单个共享负载可使用的显存边界，GPU Core Limit 控制其可使用的计算份额。两者都是软件执行和调度约束，不等同于 MIG 的硬件分区。

它与 NVIDIA Device Plugin 的边界要明确：NVIDIA Device Plugin 负责标准设备发现和分配；HAMi 在共享资源、虚拟设备、配额和限制方面增加平台能力。具体组件版本和资源名会变化，生产部署应以对应版本文档和实际 CRD/DaemonSet 为准。

#### HAMi 请求同时表达份额、显存和设备数量

HAMi 版本和厂商设备不同会使用不同 Resource Name/Annotation。典型请求会表达虚拟 GPU 数、显存容量或比例以及计算核心比例。平台必须把这些字段纳入 Admission、Quota、监控和计费，而不是只统计物理 GPU Request。

```yaml
resources:
  limits:
    nvidia.com/gpu: 1
    nvidia.com/gpumem: 8192
    nvidia.com/gpucores: 50
```

以上仅表示资源模型示意，实际名称必须以部署版本的 HAMi 文档和 Node Capacity 为准。写错资源名时，Kubernetes 可能把它当作不存在的 Extended Resource，Pod 将一直 Pending。

#### 异构加速器支持不代表限制语义完全一致

HAMi 可以通过设备插件扩展支持多类 Accelerator，但不同厂商在显存、核心、虚拟化、健康检查和监控上的能力不同。平台应为每类设备维护独立能力矩阵和验收用例，不能用 NVIDIA GPU 的隔离结论推导其他设备。

### HAMi 的调度成功不等于隔离生效

HAMi 共享链路至少包括：调度器账本、Webhook 或 Mutating 逻辑、Device Plugin Allocate、容器挂载、HAMi-Core 注入以及运行时限制。Pod 能调度成功，只表示资源账本接受了请求；如果 Core 未注入，容器可能看到整卡显存；如果账本错误，多个 Pod 可能争用同一资源。

```text
Pod 请求
  ↓
HAMi Scheduler 选择 GPU 和配额
  ↓
Webhook/Annotation 改写 Pod
  ↓
Device Plugin Allocate
  ↓
HAMi-Core 和容器运行时注入
  ↓
应用运行并受显存/算力限制
```

验证共享控制时，应使用两个相互竞争的 Pod 测试显存边界、算力限制、OOM 行为、监控归属和相互影响，而不是只检查 Pod 状态。

#### 调度侧检查资源账本和 Allocation Annotation

Pending Pod 先看 Event、Scheduler 日志和目标 Node 的可用显存/Core 账本；Scheduled Pod 检查 Annotation 中的物理 GPU UUID、虚拟份额和 Container 映射是否完整。账本认为已释放但设备仍有进程时，不能继续超分。

#### 运行侧检查控制库注入

容器内比较可见 GPU、显存查询、申请边界和实际吞吐。若 Pod Request 为 8 GiB，但应用可分配远超该值，说明 Software Limit 未生效。限制验证要包含直接 CUDA Allocation，而不是只看 `nvidia-smi` 展示。

#### 组件故障时要定义 Fail Open 或 Fail Closed

Scheduler、Webhook、Device Plugin 或 HAMi-Core 不可用时，是阻止新 Pod，还是允许无约束运行？多租户环境应倾向 Fail Closed，避免控制面故障变成资源越界。现有 Pod 是否继续受限也要通过故障注入验证。

### 共享方案选择要同时考虑隔离、利用率和运营成本

选择矩阵至少包含：显存/算力隔离、性能稳定性、Kubernetes 适配、多租户边界、Profile 灵活性、监控能力、故障影响范围、升级复杂度和回滚方式。对在线推理，尾延迟和邻居噪声通常比平均 GPU 利用率更重要；对批处理，小任务密度和可重试性可能更重要。

| 方案 | 显存限制 | 算力限制 | 硬件隔离 | Kubernetes | 多租户 | 稳定性 | 适合场景 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Full GPU | 物理容量 | 物理整卡 | 是 | 原生插件 | 强 | 高 | 训练、关键推理 |
| MIG | Profile | Profile | 是 | MIG 资源 | 强 | 高 | 多租户推理、小训练 |
| Time-Slicing | 否 | 时间复用 | 否 | Device Plugin | 弱 | 低到中 | 可容忍抖动的小任务 |
| MPS | 共享显存 | 百分比/执行份额 | 否 | 需平台集成 | 中 | 中 | 多 CUDA 小进程 |
| HAMi | 软件限制 | 软件限制 | 否 | 是 | 中 | 中 | Kubernetes 细粒度共享 |
| vGPU | Profile | Profile/调度 | 依平台 | VM 为主 | 强 | 中到高 | 虚拟桌面、VM AI |
| Passthrough | 物理容量 | 物理整卡 | 是 | VM 设备直通 | 强 | 高 | VM 独占高性能 |

矩阵表达一般边界，具体能力仍受 GPU 代际、Driver、Hypervisor、HAMi 和 Device Plugin 版本影响。安全评审应以实测越界行为为准。

## 第 3 章 · MIG 配置和重配置生命周期

### MIG Mode 与 MIG Geometry 是两个层次

MIG Mode 决定 GPU 是否进入分区模式，Geometry/Profile 决定创建哪些 GPU Instance 和 Compute Instance。支持的 Profile、实例数量和 Mode 持久语义因 GPU 代际而异。

```bash
nvidia-smi -i <gpu-id> -mig 1
nvidia-smi mig -lgip
nvidia-smi mig -lcip
nvidia-smi -L
```

启用、关闭或重建 MIG 会影响现有 Context，必须 Cordon、Drain 并确认设备空闲，在维护窗口执行。命令只是示意，生产优先由 MIG Manager 声明式管理，避免人工配置被控制器覆盖。

### MIG Strategy 决定 Kubernetes 暴露的资源模型

`single` 策略通常要求节点使用一致 Profile，并以较统一方式暴露；`mixed` 可同时暴露多个 MIG Resource Name。具体名称包含 Profile，如显存 Slice 与 Compute Slice 组合。

Mixed 提高灵活性，也增加配额、碎片和用户理解成本。用户请求一个 MIG Resource 时，Scheduler 仍按整数计数，不能自动把多个小实例合成大实例。

### 重配置要处理运行 Pod、标签和资源缓存

完整流程：冻结新调度；清空使用目标 GPU 的 Pod；确认无 Host Process；提交目标 Layout；等待 Manager 应用；检查 `nvidia-smi -L`；确认 GFD Label 和 Node Capacity 更新；运行实例级测试；恢复调度。

#### MIG UUID 和资源数量变化影响监控连续性

销毁重建实例会改变 MIG Device Identity。Dashboard、Accounting 和告警若只按旧 UUID 聚合会出现时间序列中断。应保留 Parent GPU UUID、Profile、Pod 和重配置事件，明确这是计划变更而非设备丢失。

## 第 4 章 · Time-Slicing、MPS 与隔离边界

### Time-Slicing 的 Replica 是可调度份额不是硬件容量

Device Plugin 可把一张 GPU 宣告为多个 Replica，使多个 Pod 分别请求一个逻辑份额。Scheduler 看到的是增加后的整数数量，但每个 Replica 通常没有独立显存上限或固定算力。

十个 Replica 不表示每个 Pod 获得 10% 硬保证，也不表示显存被分为十份。一个 Pod OOM 或长 Kernel 可影响同卡其他租户。平台 Resource Name、文档和 SLA 必须明确“共享访问权”而不是“虚拟 GPU 容量”。

### MPS 共享执行资源但保留进程级失败风险

MPS 通过 Server 协调多个 CUDA Client，更有效共享 SM 执行资源，可设置 Active Thread Percentage 等限制。它不等于 MIG 的硬件故障域隔离，内存保护、错误传播和支持能力随架构/模式变化。

MPS Daemon 的 UID、Pipe/Log Directory 和 Client 生命周期必须治理。不可信租户、需要强隔离或不同安全域时，不应仅凭性能利用率选择 MPS。

### 共享 GPU 的准入要包含工作负载可中断性

除显存和算力外，还要问：Job 是否能容忍邻居抖动、CUDA Error 是否可能影响同卡任务、是否有 Checkpoint、是否处理敏感数据、是否需要确定延迟。在线关键推理和长时间无 Checkpoint 训练通常不适合弱隔离共享。

## 第 5 章 · HAMi 分配链与资源核算

### HAMi Scheduler Extender 在调度阶段选择节点和设备

HAMi 把请求的设备数量、显存和 Core 等信息带入调度决策，选择满足条件的节点和物理 GPU，并通过 Pod Annotation 把结果传给 Device Plugin。Device Plugin 再响应 Kubelet 的 `Allocate` 调用，挂载设备和控制库；HAMi-Core 最后在容器内实施显存边界和计算份额控制。

这条链路不能只用“Pod 已经 Running”验收。标准 Device Plugin 主要向 Kubelet 注册整数设备，并在 `Allocate` 阶段交付设备；HAMi 还要维护单卡剩余显存、Core、逻辑份额和健康状态。调度决策、设备交付和运行时控制是三个不同成功条件，任何一层缺失都可能出现“调度成功但限制未生效”。

```mermaid
sequenceDiagram
    participant U as UserPod
    participant S as Scheduler
    participant E as HAMiScheduler
    participant K as Kubelet
    participant D as HAMiDevicePlugin
    participant R as Runtime
    U->>S: Request GPU Memory Core
    S->>E: Filter and Bind
    E-->>D: Allocation Metadata
    K->>D: Allocate Device
    D->>R: Inject Device and HAMi Core
    R-->>U: Start Container
```

每一阶段都应留下可关联证据：

| 阶段 | 核心输入或状态 | 成功证据 | 典型失败表现 |
| --- | --- | --- | --- |
| Admission | Pod Resource 与调度器选择 | 最终 `schedulerName`、Resource Request 符合平台模板 | Pod 未进入 HAMi 调度链 |
| Scheduler/Extender | Node Annotation、HAMi 账本、Pod UID | 选定 Node 与 GPU UUID，生成 Allocation Annotation | 有节点但 Pod 持续 Pending，或 Extender Filter/Bind 失败 |
| Kubelet/Device Plugin | 已绑定 Pod、待分配设备元数据 | `Allocate` 完成，待分配记录被消费，Container 创建 | `UnexpectedAdmissionError`、CreateContainerError、设备未挂载 |
| Runtime/HAMi-Core | GPU Device、控制库和配额参数 | 容器看到预期设备，超限申请被拒绝，Core 竞争符合相对份额 | Pod Running 但能越过显存限额，或 Core 限制无可观测效果 |
| Monitoring | Pod UID、Container、GPU UUID | Pod 配额、进程用量和物理卡总量能够对齐 | 只看到整卡总量，无法归属租户或发现账本漂移 |

排障证据包至少保存 Pod YAML、Event、Pod UID、Node、Allocation Annotation、Scheduler/Plugin 日志、Node Device State、容器挂载与环境，以及同一时间窗的 GPU 进程和监控数据。GPU Index 会随进程或重启变化，跨层关联优先使用 GPU UUID 和 Pod UID。

### 显存限制需要区分请求、分配和运行时观察

用户声明的 Memory Request 是调度输入；HAMi 记录的 Allocation 是平台账本；Framework 看到的 Total/Free 与运行时拦截策略有关；物理 GPU 的 NVML Used 是所有租户总量。四个数不一定相同。

Dashboard 应同时展示：Pod Request、Assigned GPU UUID、Configured Limit、Process Used、Physical GPU Used 和 Allocation Failure。只看 `nvidia-smi` 无法判断租户是否接近自己的限额。

资源核算应围绕同一组身份键展开：`Namespace/Pod UID/Container -> Allocation Annotation -> GPU UUID -> Process`。Pod 名称可能被控制器复用，GPU Index 也可能在节点重启后变化，不能单独作为长期账本主键。终止后的 Allocation 记录还要保留一段审计窗口，以便区分正常释放、强删残留和重复分配。

显存验收要同时比较三类结果：Pod 声明的上限、HAMi 分配记录中的上限，以及容器内真实申请的结果。容器查询到的“总显存”可能经过控制库改写，物理卡上的 Used 则包含同卡所有进程，因此两者数值不必相等；真正关键的是租户能否越过自己的边界，以及越界是否只失败当前申请而不影响邻居。

### Core Limit 控制的是共享比例而非固定性能

算力比例会受同卡邻居、Kernel 类型、Memory Bound、Clock 和调度粒度影响。配置 50% Core 不保证获得某个固定 Tokens/s。HAMi 更适合提高平均利用率和表达相对份额，强确定性仍需 Full GPU 或硬件分区。

因此 Core 验收不能写成“配置 50% 就必须得到空载整卡吞吐的 50%”。正确做法是固定模型、Batch、数据输入、Clock 状态和运行时版本，先记录 Pod 单独运行的基线，再让同卡邻居加入，观察两个 Pod 的相对吞吐、SM Activity、等待时间和抖动。该测试证明的是限制链是否参与调节、租户之间是否存在不可接受的干扰，不是为任意工作负载建立固定性能承诺。

Memory-Bound Kernel、短 Kernel、大量同步或 CPU/I/O 供给不足都可能让 Core 配额变化不明显。遇到“Core Limit 无效果”时，要先确认 HAMi-Core 已注入，再排除工作负载本身没有持续消耗计算资源；仅凭单次 `nvidia-smi` 利用率采样不能判定控制失效。

### 双 Pod 竞争验收覆盖限制、干扰和归属

端到端验收使用两个可持续运行、可以调整显存申请量和计算负载的测试 Pod。Pod A 与 Pod B 请求同一类共享资源，但配置不同的显存上限或 Core 份额；测试镜像、Driver、CUDA Runtime、模型和输入必须固定。资源键、Annotation 名和注入路径以被测 HAMi 版本的实际对象为准，下面只规定观察点，不给出可直接复制的版本专属清单。

| 用例 | 操作 | 必须保留的证据 | 通过标准 |
| --- | --- | --- | --- |
| 分配链 | 先启动 A，再启动 B | Pod YAML/Event、Pod UID、Node、GPU UUID、Allocation Annotation、Plugin 日志 | 两个 Pod 的请求、账本和实际设备一致，待分配状态最终完成 |
| 显存边界 | A 逐步申请到限额内，再发起一次超限申请 | 应用分配结果、容器内显存视图、物理 GPU 进程用量 | 限额内成功，超限仅拒绝 A 的申请，B 继续运行 |
| Core 份额 | 分别单跑 A/B，再同卡并发 | 吞吐时间线、SM Activity、Clock/Throttle、CPU/I/O 供给 | 并发结果体现相对份额或调节效果，结论不写成固定吞吐保证 |
| 邻居干扰 | A 加压时持续记录 B 的吞吐和延迟 | B 的吞吐、P95/P99、错误与重启 | 干扰落在平台声明的共享 SLA 内；超出则调整策略或改用 MIG/独占 |
| 监控归属 | 同时观察 Pod 和物理卡 | Pod UID、Container、GPU UUID、配额、进程用量、整卡用量 | A/B 的用量可分别归属，租户总和与物理卡趋势可解释 |
| 异常退出 | 强删 A，并继续运行 B 和提交 C | 删除时间、Pod 终态、账本、GPU 进程、C 的调度结果 | 不提前重复分配，也不长期留下 A 的幽灵配额 |

建议按以下顺序采集 Kubernetes 侧证据；命令中的名称均为占位符，Annotation 和 Resource Name 应从实际安装对象中识别：

```bash
kubectl get pod <pod-a> <pod-b> -n <namespace> -o yaml
kubectl describe pod <pod-a> -n <namespace>
kubectl get node <node> -o yaml
kubectl logs -n <hami-namespace> <scheduler-pod> --since=30m
kubectl logs -n <hami-namespace> <device-plugin-pod> --since=30m
```

运行侧还要记录两个 Pod 内的设备 UUID、控制库映射、Framework 设备视图、显存申请结果和业务吞吐。若两个 Pod 实际落到不同物理 GPU，这只能验证独立分配，不能证明共享竞争；若只运行空闲 CUDA Context，也不能验证 Core 控制。

### HAMi 升级必须验证 Hook/Core 与 Driver/Framework 组合

HAMi-Core 位于应用 CUDA 调用路径附近，Driver、CUDA Runtime、Framework 或安全配置变化都可能影响它。升级不只验证 Scheduler Pod Ready，还要运行显存限制、Core 限制、超限行为、并发干扰、异常退出资源回收和不同 GPU 型号。

## 第 6 章 · MIG 和 Time-Slicing 配置治理

### MIG Layout 以节点池为单位减少碎片

若每台节点任意混合 Profile，集群虽然总 Slice 多，但大 Profile 难调度。按节点池定义少量标准 Layout，例如 Small Inference、Medium、Full Training，并用需求分布周期调整。

### Time-Slicing Config 明确 Replica 和 Rename 语义

共享配置可选择资源名是否重命名，以及用户请求超过一份时是否 Fail。资源名保留 `nvidia.com/gpu` 容易让用户误认为独占；使用共享后缀或 Admission Policy 能更明确 SLA。

### ConfigMap 更新不等于所有节点已生效

Device Plugin 需要 Reload/Restart，Node Capacity 随后更新。滚动期间不同节点可能暴露不同 Replica。变更先 Cordon 目标池或暂停 Queue，逐节点验证 Resource、Pod 分配和监控，再扩大。

### 共享策略变更前清理已有 Pod

已有 Pod 的 Device Allocation 不会因 ConfigMap 自动重算。直接改变 Replica/模式可能让 Kubelet 账本与实际使用不一致。需要 Drain 或按支持流程迁移，并验证异常退出回收。

## 第 7 章 · HAMi 请求、限制与异常场景

### HAMi 资源键由安装版本和设备类型定义

HAMi 可能通过 Resource/Annotation 表达设备数、显存绝对量/比例和 Core。具体键名随版本和配置变化，正式 YAML 以部署文档为准，不能从旧示例直接复制。

平台提供受版本控制的 Pod Template，并由 Admission 校验显存/Core 范围、Limit/Request 一致性和支持 GPU。

### Pending 分为节点资源不足与 Extender 决策失败

普通 Scheduler Filter 可能先因 CPU/Memory/Taint 淘汰节点，HAMi 再判断 GPU Memory/Core。事件要同时看 Scheduler 和 Extender；只看 `Insufficient nvidia.com/gpu` 可能漏掉 HAMi 账本。

“监控显示有余量但 Pod Pending”要按调度链逐层缩小范围：

```text
Pod Pending
  -> Resource Name 是否存在于 Node Allocatable
  -> CPU Memory Taint Affinity Queue 是否先淘汰节点
  -> Pod 是否进入预期 Scheduler 和 Extender
  -> Node Annotation 中设备是否健康且规格完整
  -> HAMi 账本的可分配 Memory Core Slot 是否满足单个请求
  -> Allocation Annotation 是否生成
  -> Kubelet 和 Device Plugin Allocate 是否完成
```

物理 GPU 还有 10 GiB 空闲，不代表 HAMi 一定能放置一个 8 GiB 请求：余量可能分散在不同卡，逻辑 Slot 或 Core 已耗尽，设备被标记不健康，或账本仍保留已终止 Pod。另一方面，Node Allocatable 中有逻辑 GPU，也不代表单卡显存满足请求。排障必须比较“物理空闲”“HAMi 可分配账本”和“单个 Pod 形状”，而不是只看集群总量。

若没有任何候选节点，先修复 Resource、Taint/Affinity 或节点健康；若标准 Filter 已有候选但 Extender 拒绝，检查单卡账本与请求形状；若已经 Bind 却无法创建容器，转查 Device Plugin、待分配 Annotation 和 Runtime 注入。修复后重新提交同形状 Pod，并确认旧失败记录没有继续占用份额。

### 容器启动后验证限制是否真的执行

分配 Annotation 正确但 HAMi-Core 未注入，进程可能看到完整 GPU。验证 Library Mapping、容器环境、Framework Report、超限申请行为和同卡物理占用。安全环境不能让用户通过覆盖 Loader Path 绕过限制。

“Pod Running 但限制未生效”按实际执行路径判断：

```text
Pod Running
  -> Allocation Annotation 是否包含预期 GPU UUID 和配额
  -> Device Plugin 是否消费待分配状态并完成 Allocate
  -> Device Node 和目标 GPU 是否正确注入
  -> HAMi-Core 控制库是否挂载并进入动态链接路径
  -> 显存和 Core 配额参数是否传入容器
  -> Framework 是否走受支持的 CUDA 调用路径
  -> 超限申请和双 Pod 竞争是否表现出限制
```

如果 Annotation 就不正确，问题仍在调度和账本层；Annotation 正确但设备或控制库缺失，转查 Kubelet/Device Plugin 的 `Allocate`；库已经加载但超限仍成功，收集 HAMi-Core 日志、动态库解析、Framework/Runtime 组合和测试程序调用方式，再判断是否为注入绕过或兼容性问题。不要通过授予特权容器、挂载整台宿主机设备或移除 Loader 控制来“临时修好”，这会让验证对象失去隔离意义。

恢复验收必须重新运行显存边界和双 Pod Core 竞争，而不是只看 Pod 重建成功。若业务需要固定吞吐或强隔离，即使软件限制工作正常，也应回到 MIG 或 Full GPU 方案评估。

### 异常退出必须回收调度账本

Pod Force Delete、Node Lost、Kubelet Restart、Scheduler/Plugin Restart 都要测试。账本残留会导致假碎片，过早释放又会把同一 GPU 份额重复分配。Reconciler 应以 Pod UID、Node 和 Device State 校正。

账本回收的核心矛盾是：Kubernetes 对象消失不等于节点上的 CUDA 进程已经退出，而节点暂时失联也不等于分配可以立即复用。恢复逻辑必须把 API 中的 Pod UID、HAMi Allocation、Kubelet/Runtime Container、GPU UUID 和实际进程放在同一状态机中比对。

| 故障注入 | 主要风险 | 恢复前证据 | 恢复通过标准 |
| --- | --- | --- | --- |
| Pod Force Delete | API 对象先消失，进程或 Allocation 残留 | 删除时间、旧 Pod UID、Container/进程、Allocation | 旧进程退出后份额只释放一次，新 Pod 不与旧进程重叠使用 |
| Node Lost | 控制面无法确认设备和进程状态 | Node Condition、心跳、节点最后账本、GPU UUID | 失联期不把不确定资源分给其他节点上的同名对象；节点恢复后完成重对账 |
| Kubelet Restart | Device Plugin 重新注册，Kubelet 设备缓存变化 | Kubelet/Plugin 重启时间、运行 Pod、Allocatable | 运行 Pod 设备不被重复分配，Node Capacity 与实际设备一致 |
| Device Plugin Restart | 待分配记录可能中断或重复消费 | Pod Annotation、Plugin 日志、Allocate 结果 | 已完成分配保持稳定，未完成请求可重试且不会重复扣账 |
| Scheduler Restart | 内存中的全局设备视图重建 | Node Annotation、全部活动 Allocation、Pod UID | 从持久对象重建后余额一致，新调度不覆盖既有分配 |

异常演练时可在 A 运行、B 竞争的前提下触发故障，再提交 C 检查回收。验收需要同时证明两件事：不会因过早释放造成 Double Allocation，也不会因残留造成 Ghost Allocation。只证明 C 最终 Running 还不够，还要确认 C 的 GPU UUID、份额、物理进程与账本一致，并验证 B 在整个恢复过程中没有越界或被误杀。

生产 Runbook 应为“不确定状态”定义保守策略。多租户集群通常先停止目标节点的新分配，等待 Kubelet/Runtime 与 GPU Process 可重新观测后再对账；无法确认时隔离节点并人工核验，而不是直接删除 Annotation 强行释放。恢复完成后保留故障时间线和账本差异，防止同类漂移只能靠重启暂时掩盖。

### HAMi 多设备支持需要独立能力矩阵

HAMi 可面向不同 Accelerator，但 Discovery、Memory/Core 限制和 Runtime Hook 能力不完全一致。平台资源名、监控和验收按厂商/型号分别声明，不把 NVIDIA 行为泛化到所有设备。

## 第 8 章 · 配额、计费与 GPU 使用效率

### 配额至少区分独占卡、MIG Profile 和共享份额

一个 Full GPU、一个小 MIG 和一个 HAMi 10% 份额不能按“1 GPU”统一计费。资源目录定义 Capacity Unit、隔离等级、SLA 和价格；Quota 对相应 Resource Name 分别限制。

### Requested、Allocated、Active 和 Useful 是四层利用

```text
Cluster Capacity
  -> Requested by queued and running work
  -> Allocated to Pods
  -> Active GPU execution
  -> Useful business throughput
```

Allocated 高但 Active 低可能是应用等待；Active 高但 Useful 低可能是低效/失败；Requested 高但 Allocated 低可能是碎片或配额。效率 Dashboard 同时展示四层。

### GPU Idle Reclamation 要尊重工作负载状态

训练在 Checkpoint、Evaluation 或同步时暂时 Idle，不应立即回收。回收策略结合持续时间、应用心跳、Queue、Checkpoint 和租户 SLA，先通知再终止，记录浪费与节省。

### Showback 先于 Chargeback

先向团队展示 GPU Hour、Queue、Active、失败重算和单位产出，校准归属与指标，再用于费用分摊。直接按 Pod Request 收费会激励用户少报或隐藏共享，需配合 Admission 和实际使用。

## 第 9 章 · CUDA Green Context 与进程内 SM 分区

### Green Context 是应用控制的 SM 资源分区而不是平台资源类型

Green Context 允许应用从 Device Resource 中划分 SM 资源，创建独立 CUDA Context 并把 Stream/工作提交到指定资源集合。它用于进程内 QoS、并发服务或隔离特定执行队列，与 MIG 的硬件实例、MPS 的多进程服务以及 Kubernetes 扩展资源都不同。

Green Context 不自动隔离 HBM、PCIe、Copy Engine 或所有共享 Cache，也不天然提供租户安全边界。Kubernetes Device Plugin 如果仍交付整卡，调度器看不到应用在卡内创建了多少 Green Context；配额、计费和故障归属也不会自动细分。

### Green Context 的能力和实际 SM 数量要运行时验证

应用需要查询可用 Device Resource，按数量或调度约束 Split SM，创建 Resource Descriptor 和 Green Context，再在该 Context 上创建 Stream。请求数量可能因 SM Co-Scheduling 粒度而被调整，实际分配不一定等于请求值；Cluster、CUDA Graph 和 Profiler 的支持也应按 Driver/Toolkit/架构验证。

平台若允许该模式，应发布明确的支持矩阵和基准：同卡并发的吞吐/P99、显存争用、功耗、错误传播、Context 销毁和进程异常退出后的资源回收。需要跨租户强隔离时优先选择 MIG、VM/vGPU 或独占 GPU，而不是把 Green Context 当安全分区。

## 第 10 章 · GPU 虚拟化解决的资源边界

### 虚拟化同时处理交付、隔离和生命周期

把 GPU 交给 VM 不只是让 Guest 看见设备，还要定义 Host/Guest Driver、Memory/DMA 隔离、性能、迁移、监控、许可和故障恢复。不同模式在这些维度取舍。

因此虚拟化方案的交付物应是一份可验证的资源契约：租户得到哪些 GPU、显存和互联能力，宿主机保留哪些管理权限，发生 Xid、链路故障或 VM 重启时由谁处置。把“设备能枚举”当成验收终点，会遗漏拓扑、复位和审计等生产约束。平台应把模式、Profile、驱动矩阵和支持的生命周期动作写入 Catalog，并为每种组合保留基准和故障演练证据。

### Passthrough 把物理设备独占交给 VM

Hypervisor 通过 IOMMU/VFIO 把 GPU PCI Function 分配给单个 VM，Guest 安装 Driver。性能接近裸机，隔离清晰，但设备不能同时共享，Live Migration 受限。

```text
Physical GPU -> IOMMU Group -> VFIO -> Guest VM -> Guest Driver
```

### vGPU 由 Host Manager 划分 Profile 给多个 VM

Host vGPU Manager 与 Guest Driver 协同，Profile 定义 Framebuffer/Compute 等能力。依赖支持 GPU、Hypervisor、Manager/Guest Version 和 License。Profile 名称不是跨代通用单位。

Host 负责物理 GPU、NVSwitch 和 vGPU Function 的生命周期，Guest 只看到被分配的虚拟设备。创建、暂停、恢复和迁移前必须先激活对应分区，并保持 VF 顺序、GPU 类型和 NVLink 拓扑一致；否则即使 VM 能启动，恢复后的设备映射也可能变化。容量报表应同时记录 Profile、物理卡、邻居数量和调度策略，不能只把 Profile 名称当作统一的算力单位。

### MIG-Backed vGPU 组合硬件分区与 VM 交付

支持平台可把 MIG 实例作为 vGPU/VM 资源，提高硬件隔离和密度。MIG Geometry、vGPU Profile、Fabric 与 Scheduler 都需配套，不能把 Kubernetes MIG 操作流程直接套到 Hypervisor。

MIG-backed vGPU 的边界由 GPU Instance、Compute Instance 和 VM 分配共同决定；重配 MIG 可能销毁原有实例并要求节点或 VM 重新发现设备。部分平台对 MIG-backed vGPU 的 NVLink、迁移或多卡组合有额外限制，设计时应以当前产品支持矩阵为准，并在 VM 内外分别做显存、P2P 和重启测试。

### Shared NVSwitch 虚拟化还要分配 Fabric Partition

多 GPU VM 需要 GPU 集合和对应 NVSwitch Partition，Service VM/Fabric Manager 管路径。GPU Passthrough 成功但 Partition 不完整，Guest 多卡 P2P/NCCL 仍失败。

Partition 是 GPU 与 Switch 的非重叠资源集合，Guest 内的 Fabric Manager 或厂商组件还要根据该集合建立路由。分区激活和停用应有明确顺序，并在每次 VM 生命周期变化后验证 GPU reachability matrix；不能用“每张卡都在 Guest”推断 GPU 间必然可达。小分区可能为隔离牺牲部分带宽，验收需记录这项容量取舍。

## 第 11 章 · IOMMU、VFIO 与设备隔离

### IOMMU 将 Guest DMA 限制到授权地址

设备可 DMA 访问内存，IOMMU 为 VM 提供地址转换和隔离。关闭 IOMMU 追求性能会破坏 Passthrough 安全模型。性能问题从厂商支持的 Passthrough/ATS/ACS 设置解决。

排查时同时确认 IOMMU 已启用、设备绑定到 VFIO、Guest 的 DMA 映射正常，以及 ACS/ATS 配置没有把 P2P 流量强制绕回 Root Complex。IOMMU 日志、设备 BDF 和 VM 配置应纳入证据包；只看 `lspci` 能枚举而没有验证 DMA/P2P，无法证明隔离和性能都成立。

### IOMMU Group 决定最小可安全分配集合

GPU 与附属 Function、Bridge 或 NVSwitch 在同 Group 时，可能需要整体交付。检查 sysfs Group 和 Hypervisor Inventory；不要强制拆 Group 给不同租户。

IOMMU Group 是平台实际能隔离的最小集合，不一定等于一张 GPU：音频 Function、PCIe Bridge、Switch 或关联 NIC 可能同组。资源目录应把 Group 成员和可分配组合显式化；若必须使用 ACS override 拆分，应把隔离降级、P2P 变化和厂商支持状态作为审批条件，而不是默认修复手段。

### BAR 空间和 Above 4G 影响大设备枚举

多 GPU 大 BAR 需要足够 MMIO Address，BIOS Above 4G/Resizable BAR 和 VM Machine Type 影响。Guest 启动看不到部分 GPU 时，检查 Host/Guest PCI Resource，而不只 Driver。

这类故障常发生在扩容或更换 VM Machine Type 后：Host 能分配设备，但 Guest PCI BAR 资源不足，最终表现为少卡、驱动初始化失败或地址冲突。应分别保存 Host PCI resource、虚拟机 XML/Flavor、Guest `lspci -vv` 和驱动日志，并先确认固件与 Hypervisor 的推荐组合，再调整 BAR 窗口或设备数量。

### ACS 改变 Peer Routing 和隔离

严格 ACS 可把 Peer Traffic 导向 Root/IOMMU，影响 P2P；Override 可能降低隔离。采用 OEM/Hypervisor 支持配置，Passthrough 后重测 GPU P2P 和 NIC GDR。

因此 ACS 是安全和性能之间的真实边界：同一配置可能提高租户间隔离，却让 CUDA P2P、GPUDirect RDMA 降速或回退。验收应覆盖单卡、GPU-GPU P2P、GPU-NIC GDR 和跨 VM 访问拒绝四类用例，并把固件、内核参数和 Hypervisor 版本固定在基线中。

## 第 12 章 · Host 与 Guest 软件栈

### Passthrough 的 Driver 主要运行在 Guest

Host 使用 VFIO 绑定目标 GPU，Guest 安装 NVIDIA Driver/CUDA。Host 仍管理 PCIe、IOMMU、BMC 和物理健康，监控可见性可能有限。

Host Driver 不应与被直通设备同时竞争绑定；但宿主机仍需保留 BMC、PCIe AER、NVSwitch 或 OOB 健康信号，才能在 Guest 不可见时判断是物理故障还是分配故障。Guest 侧的 `nvidia-smi` 只证明虚拟设备初始化成功，不能替代 Host 侧的温度、Xid、链路和复位证据。

### vGPU 需要 Manager 与 Guest Driver 兼容

版本兼容比普通 Host Driver/Container CUDA 多一层。升级 Hypervisor/Manager 前检查所有 Guest Driver、Profile、许可和 Live Migration 支持，按 VM 批次推进。

兼容矩阵至少覆盖 GPU/主机驱动、vGPU Manager、Guest Driver、Hypervisor、Guest Kernel、CUDA 和 Framework。升级前冻结一个 Canary Profile，执行启动、CUDA Smoke、NCCL、迁移或重启测试；失败时回滚 Host Manager 与 Guest Driver 的配对版本，避免只回滚其中一层造成更难定位的故障。

### License 服务是运行依赖和故障域

vGPU/企业软件许可可能需要 License System。网络中断、证书、时钟和容量会影响新实例或持续使用。监控借用、到期、宽限期和服务 HA，避免到期才发现。

许可故障要区分“无法创建新 VM”和“已有 VM 进入宽限/降级”两条路径，并记录 License Server 地址、证书链、时钟偏差、已用席位和返回码。License Service 应具备高可用和到期告警，演练网络隔离、证书轮换和恢复后的重新拉取，不能把临时宽限期当作长期可用性。

### Guest 内容器仍复用 Guest Kernel Driver

VM 内 Kubernetes/Docker 的 Container Toolkit 注入 Guest Driver Library/Device，不直接访问 Hypervisor Host Driver。故障按 Host Physical -> vGPU/Passthrough -> Guest Driver -> Guest Container 分层。

容器层还要检查 Guest 内 Device Cgroup、Runtime Hook/CDI、`CUDA_VISIBLE_DEVICES` 和实际 GPU UUID；设备注入成功但库版本不匹配时，常见表现是 `libcuda` 加载失败或框架初始化错误。分层收集 Host、VM、Guest 和 Pod 的时间线，避免在容器内反复重装而掩盖上游分配问题。

## 第 13 章 · 虚拟化性能与拓扑

### vCPU/Memory NUMA 要与 Passthrough GPU 本地

VM vCPU 跨 Socket、Guest Memory 远离 GPU，会让 PCIe 数据绕行。Hypervisor 使用 NUMA Pinning/Hugepage/Reserved Memory，Guest 内再次验证 CPU/GPU 拓扑。

NUMA 配置应同时覆盖 vCPU、虚拟内存、GPU 和 HCA；只绑定 vCPU 而让内存漂移，仍会在 H2D、P2P 或 RDMA 路径产生远端访问。将 `nvidia-smi topo -m`、Guest `lspci`、NUMA 距离和基准结果作为实例类型的固定证据，迁移到另一 Host 后重新核对。

### 多 GPU VM 需要完整 P2P/Fabric Group

随机 Passthrough 四张 GPU 可能跨弱路径；NVSwitch 系统还需 Partition。Flavor/Catalog 定义验证过的 1/2/4/8 GPU Group，不让用户任意组合物理卡。

多 GPU Flavor 应保存 GPU BDF、Switch 集合、PCIe Root、NUMA 和 HCA 映射，调度器按集合分配而不是逐卡填充。对每种 Flavor 做 NCCL AllReduce、P2P 和 GPUDirect RDMA 基线；一张卡落在弱路径就可能成为同步作业的长尾。

### vGPU Profile 是容量上限不保证固定吞吐

同卡 vGPU 共享执行资源，Neighbor 负载和 Scheduler 影响性能。Profile Framebuffer 能硬限制显存不代表算力完全隔离。关键 VM 做干扰测试和 Reservation。

Profile 的容量字段与吞吐保证是两件事。应在空载、同 Profile 并发和异构 Profile 混部三种场景测量延迟分位、Tensor/SM 活跃度、显存带宽和抖动，并明确超卖、固定份额或 Best Effort 策略。对有 SLO 的 VM 使用 Reservation 或 MIG-backed Profile，避免把平均吞吐当作隔离承诺。

### 虚拟化基准必须有裸机对照

同节点/软件/模型比较 Bare Metal、Passthrough、vGPU，记录 Compute、H2D/P2P、NCCL、CPU、Latency 和 Overhead。对照不用于要求零损耗，而是建立可辩护基线。

基准必须固定 GPU 型号、驱动/CUDA、CPU 亲和、数据集、Batch、消息大小和并发邻居，并区分一次性启动成本与稳态成本。结果以吞吐、P50/P99、尾部等待和故障恢复时间呈现；只有这样才能判断虚拟化开销来自调度、I/O、拓扑还是共享资源。

### Live Migration 能力按模式和工作负载验证

某些 vGPU 支持受控迁移，Passthrough 通常受限；活跃 CUDA Context、显存大小和网络决定停顿。不能从普通 CPU VM 迁移经验推导 GPU VM。测试正在推理/训练、失败回滚和目标 Host 兼容。

迁移 Runbook 应先验证目标 Host 的 GPU 类型、Profile、驱动、License、Fabric Partition 和剩余容量，再决定预复制、停机迁移或重建。对训练作业记录 Checkpoint 位置和最大可接受停顿，对在线推理记录连接排空和 P99 变化；失败时保留源/目标 Host 日志及 VM 状态转移证据。

## 第 14 章 · NVIDIA Device Node 与 Capability 权限模型

### 可见物理 GPU 不代表拥有全部管理能力

NVIDIA Kernel Driver 通过 `/dev/nvidia0`、`nvidiactl`、`nvidia-uvm`、`nvidia-nvswitchctl` 等 Device Node 暴露数据面接口。`nvidia-capabilities` 再把 MIG 配置、监控和 Fabric 管理等特权动作拆成 Capability；拥有 GPU Device Node 但缺少对应 Capability 时，计算可能可用而管理操作应失败。

现代 `/dev/nvidia-caps/nvidia-cap*` 路径以 Device Cgroup 和文件权限控制能力，`/proc/driver/nvidia/capabilities` 提供 Capability 到 Minor 的映射。旧 `/proc` 权限/挂载命名空间接口已弃用，不能照搬早期 R450 默认值判断新 Driver。`CAP_SYS_ADMIN` 通常隐式获得全部 NVIDIA Capability，应避免作为容器“排障捷径”长期授予。

### MIG 容器需要父子实例能力与顶层设备同时匹配

一个 MIG Device 对应 Parent GPU Instance 和 Compute Instance 的访问能力，同时仍依赖顶层 GPU/Control/UVM Device。实例重建会改变 GI/CI 和设备映射；只保留旧 Minor 或只暴露 MIG UUID 都可能造成容器看见资源名却无法初始化。

负向验收应证明普通业务容器不能创建/销毁 MIG、不能启动 Fabric Manager、不能访问未分配 GPU/MIG；平台管理组件只获得职责所需 Capability。证据包括 OCI/CDI Spec、Device Cgroup、`/dev/nvidia-caps`、Capability Mapping、容器 UID/GID 和一次允许/拒绝测试。
