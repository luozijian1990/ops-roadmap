# GPU AI Infrastructure 学习笔记 · NVIDIA Software Stack

## 第 1 章 · 从框架到 GPU 的软件分层

### AI Framework 通过 CUDA-X 和 Runtime 使用 GPU

GPU 应用通常经过以下软件层：

```text
PyTorch / TensorFlow / JAX / Inference Application
                ↓
cuDNN / NCCL / cuBLAS / TensorRT / CUDA-X
                ↓
CUDA Runtime API
                ↓
CUDA Driver API 和 NVIDIA Kernel Driver
                ↓
GPU Hardware
```

Framework 负责模型和算子编排，CUDA-X 库提供优化实现，Runtime 负责设备和执行上下文，Kernel Driver 负责内核模块、设备访问和硬件控制。某一层可见，不代表下一层一定兼容。

#### Framework Build 决定它携带哪些 CUDA 能力

PyTorch/TensorFlow Wheel 或容器通常针对特定 CUDA Runtime 和 GPU 架构构建。Python 包版本相同，不同下载渠道可能提供 CPU Build、不同 CUDA Build 或不同平台变体。软件清单应记录完整包来源和镜像 Digest。

#### CUDA-X Library 版本会改变算子和通信路径

cuDNN、cuBLAS、NCCL 和 TensorRT 不只是“是否存在”的依赖。版本升级可能选择新 Kernel、增加 Workspace、修改算法默认值或删除旧架构。性能/数值回归要把库版本列为独立变量。

#### Driver 是所有容器共享的节点故障域

一个节点上的容器可以携带不同 Runtime/Framework，但都通过同一 Host Driver 访问 GPU。Driver 崩溃、XID 或模块问题可能同时影响多个租户，因此 Driver Upgrade 和 Reset 必须按节点生命周期管理。

### Driver、Runtime、Toolkit 和 nvcc 不是同一个组件

| 组件 | 所在位置 | 主要职责 |
| --- | --- | --- |
| NVIDIA Driver | 宿主机内核和用户态驱动 | 管理 GPU、内核模块、设备节点和驱动 API |
| CUDA Runtime | 应用或容器用户态 | 提供设备、Stream、Event、Memory 等运行时 API |
| CUDA Toolkit | 开发或构建环境 | 编译器、头文件、库、样例和开发工具 |
| `nvcc` | Toolkit 工具链 | 编译 CUDA C/C++、PTX 和目标架构代码 |
| CUDA-X | 加速库集合 | cuDNN、NCCL、cuBLAS、TensorRT 等优化实现 |

生产推理容器通常需要 Runtime 和库，不一定需要 `nvcc`；宿主机必须有可工作的 Kernel Driver。把 Toolkit 版本、Runtime 版本和 `nvidia-smi` 中的 CUDA Version 混为一谈，是最常见的兼容性误判之一。

#### Driver API 和 Runtime API 的调用层级

CUDA Driver API 直接管理 Device、Context、Module、Memory 和 Kernel Launch 等低层对象；CUDA Runtime API 提供更易用的接口，并在内部调用 Driver API。应用可以直接使用 Driver API，也可以通过 Runtime 和 Framework 间接使用。

这一区别会影响动态库诊断：`libcuda.so` 来自宿主机 Driver 用户态接口，`libcudart.so` 通常来自 Toolkit/Runtime 或容器镜像。容器内存在 `libcudart.so`，不代表宿主机 `libcuda.so` 已正确注入。

#### Toolkit 是开发集合而不是运行前提

Toolkit 包含 `nvcc`、头文件、静态/动态库、Profiler、Debugger 和 Samples。已经构建好的 Framework 容器通常不需要完整 Toolkit；在生产镜像中安装 Toolkit 会增加体积和攻击面。需要现场编译 CUDA Extension 时，应使用受控的 Build Image，并把产物和目标架构记录下来。

### nvidia-smi 的 CUDA Version 是驱动能力上限提示

`nvidia-smi` 输出的 CUDA Version 通常表示当前驱动能够支持的 CUDA API/Runtime 最高版本范围，不表示宿主机安装了对应完整 Toolkit，也不表示容器里的应用正在使用这个版本。

```bash
nvidia-smi
nvcc --version
ldconfig -p | rg 'libcuda|libcudart'
```

确认应用实际使用的版本还需要检查框架构建信息、动态库加载、容器镜像和进程环境。驱动能支持较新的 Runtime，不代表旧 GPU 架构一定被该 Runtime 或框架构建保留。

#### 三个命令分别回答三个问题

| 命令/信息 | 回答的问题 | 不回答什么 |
| --- | --- | --- |
| `nvidia-smi` Driver/CUDA | Host Driver 和其支持范围 | 应用实际 Runtime |
| `nvcc --version` | 当前 PATH 中 Toolkit Compiler | PyTorch 使用的 Runtime |
| `torch.version.cuda` | Framework 构建时 CUDA 版本 | Driver 是否兼容、设备是否健康 |

应用容器没有 `nvcc` 完全可能是正常的 Runtime Image。为了让 `nvcc --version` 有输出而在生产容器安装 Toolkit，会模糊构建/运行边界。

#### nvidia-smi 也依赖用户态 Utility Library

容器内 `nvidia-smi` 通过注入的 Driver Utility Library 查询 Host Driver。它成功说明 Utility Capability 可用，但应用还需要 Compute Capability、设备节点和正确 `libcuda.so`。因此它是 Smoke Test 的一层，不是最终验证。

## 第 2 章 · CUDA 兼容性和版本矩阵

### Minor Version Compatibility 和 Forward Compatibility 解决不同问题

Minor Version Compatibility 主要让同一 CUDA Major 版本下构建的应用，在满足最低驱动条件时运行在更高的同 Major 驱动上。Forward Compatibility 则通过兼容组件让部分较新的 Toolkit/Runtime 能在不立即升级系统驱动的环境中运行，但有明确的 GPU、驱动、Toolkit 和功能限制。

兼容性不是单向的“版本越新越好”。应用还需要匹配 GPU Compute Capability、框架 wheel/包、cuDNN/NCCL/TensorRT、容器用户态库和宿主机驱动。正式环境应维护经过验证的矩阵，而不是只记一条“驱动版本”。

#### 三类兼容关系不能混用

| 关系 | 典型方向 | 主要条件 | 常见失败 |
| --- | --- | --- | --- |
| Driver Backward Compatibility | 新 Driver 运行旧 Runtime 应用 | Driver 保留旧 API 支持 | 应用自带库冲突 |
| Minor Version Compatibility | 同 Major 新 Toolkit 应用运行在满足最低要求的 Driver | 最低 Driver 和功能限制 | `cudaErrorCallRequiresNewerDriver` |
| Forward Compatibility | 特定较新用户态组件运行在较旧系统 Driver | 受支持 GPU/Driver 和 Compat Package | 功能或平台不在支持矩阵 |

实际判断要查对应 CUDA Release Notes 和 Compatibility 文档。不要把 Compat Package 当作长期跳过 Driver 生命周期管理的通用方案。

#### 建立可执行的版本矩阵

| Node Pool | GPU/CC | Driver | Container Toolkit | Runtime/Framework | cuDNN/NCCL/TensorRT | 验证状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 示例训练池 | H100/9.0 | 固定版本 | 固定版本 | PyTorch + CUDA | 固定版本 | 单卡/多卡通过 |

矩阵中的“通过”必须对应镜像 Digest、测试命令和日期。只记录一个版本号而没有验证证据，不能作为升级决策依据。

### PyTorch 构建信息是兼容性矩阵的应用侧证据

```python
import torch

print(torch.__version__)
print(torch.version.cuda)
print(torch.cuda.is_available())
print(torch.cuda.device_count())
if torch.cuda.is_available():
    print(torch.cuda.get_device_name(0))
```

这组输出用于把应用构建加入版本矩阵：`torch.__version__` 标识 Framework，`torch.version.cuda` 标识该 Build 对应的 CUDA Runtime 系列，`torch.cuda.is_available()` 表示当前进程能否完成 CUDA 可用性检查，`device_count()` 表示当前进程可枚举的设备数量。它们必须与镜像 Digest、Host Driver、GPU 型号和动态库路径一起保存，不能单独作为节点健康结论。

完整故障处理集中在第 5 章的“`nvidia-smi` 正常但 PyTorch CUDA 不可用”决策树。本节只说明这些值在兼容性矩阵中的含义，避免把同一套排障步骤分散维护。

#### 先检查 Framework 是 CPU Build 还是 CUDA Build

`torch.version.cuda` 为 `None` 通常说明安装了 CPU-only Build；它显示版本但 `is_available()` 为 False，则继续检查 Driver、设备可见性和初始化错误。不同安装源可能提供不同 Build，包名相同不代表能力相同。

#### 用动态加载器确认库从哪里来

```bash
ldconfig -p | rg 'libcuda|libcudart|libcudnn|libnccl'
find /usr /opt -name 'libcuda.so*' -o -name 'libcudart.so*' 2>/dev/null
LD_DEBUG=libs python -c 'import torch; print(torch.cuda.is_available())' 2>&1 | less
```

重点检查应用是否错误加载了镜像内的 Stub Library、旧目录或不匹配的 Runtime。修改 `LD_LIBRARY_PATH` 前先保存当前环境，避免临时修复掩盖镜像构建问题。

### Compute Capability 也属于兼容性矩阵

CUDA 应用可能携带 cubin 或 PTX。只有目标 GPU 支持的 cubin/PTX 都不存在时，才会出现 `no kernel image is available for execution on the device` 等错误。框架升级、第三方 CUDA 扩展和自定义 Kernel 都应在集群中最老的 GPU 上验证。

平台发布清单至少包含 GPU 型号、Compute Capability、驱动最低版本、CUDA Runtime、框架构建目标和关键库版本。不同节点池不能只通过主机名或 Kubernetes 标签假设软件能力完全一致。

#### 自定义 CUDA Extension 是常见遗漏

Framework 本身可能支持目标 GPU，但项目安装的 Flash Attention、自定义 Operator 或其他 Extension 只编译了部分 `sm_` 架构。错误只在调用对应算子时出现，基础 `torch.cuda.is_available()` 仍然为 True。

发布前要遍历关键 Extension 的最小功能测试，并在 Build Log 中保存架构列表。跨代节点池可以分别构建制品，或者携带经过验证的 PTX/多架构二进制。

## 第 3 章 · NVIDIA Container Toolkit 和 CDI

### 容器复用宿主机内核驱动并携带用户态库

容器不能独立加载一个与宿主机无关的 NVIDIA Kernel Driver。宿主机负责驱动、设备节点和内核接口；NVIDIA Container Toolkit 根据请求把 GPU 设备、必要的用户态驱动库和环境信息注入容器。镜像通常携带 CUDA Runtime、框架和加速库。

```text
Host: Kernel Driver + /dev/nvidia* + libcuda interface
             ↓ device injection
Container: CUDA Runtime + Framework + Application
```

这解释了为什么宿主机 `nvidia-smi` 正常但容器失败：容器运行时可能没有启用 GPU hook、设备请求为空、CDI Spec 失效、Cgroup 拒绝设备或镜像库与 Host Driver 不兼容。

#### libnvidia-container 负责准备容器设备和驱动能力

`libnvidia-container` 及相关 CLI/Runtime 组件根据 GPU 请求、Driver Capability 和 OCI/CDI 配置，为容器准备设备节点、驱动用户态库和必要挂载。它不在容器里安装 Kernel Driver，也不替代 Docker/containerd 本身。

常见能力类别包括 Compute、Utility、Graphics、Video 等。只需要 CUDA 计算的容器不应无条件暴露所有 Driver Capability；最小权限既减少攻击面，也让设备注入问题更容易定位。

#### Docker 和 containerd 的接入方式不同

Docker 可以通过 `--gpus`、NVIDIA Runtime 或 CDI 请求设备；containerd/Kubernetes 通过 RuntimeClass、Runtime Handler、CDI 或 Device Plugin Allocate 交付设备。排障应先确定当前实际采用哪条路径，避免同时配置多个机制后互相覆盖。

### Docker 验证要从最小 CUDA 容器开始

```bash
docker run --rm --gpus all \
  nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi

docker info | rg -i 'runtime|nvidia'
docker inspect <container> | rg -i 'device|runtime|gpu'
```

最小镜像测试失败时，优先检查 Toolkit、Docker/containerd runtime、设备权限和宿主机驱动；最小镜像成功而应用失败时，再检查应用镜像、动态库、框架和环境变量。测试镜像版本必须与当前驱动和平台支持矩阵匹配。

#### 逐步增加复杂度

```text
Host nvidia-smi
  -> CUDA Base Image nvidia-smi
  -> CUDA Sample Kernel
  -> Framework Device Test
  -> 目标模型单卡
  -> 多卡 NCCL
```

哪一步首次失败，就把变量限制在该层。不要直接用大型训练镜像判断 Runtime 是否正常，因为镜像里还包含 Framework、Extension、网络和应用配置。

#### 保留容器创建证据

保存 `docker inspect`、OCI/CDI 请求、设备节点、环境变量、镜像 Digest 和 Host UUID。临时加 `--privileged` 后成功只说明权限/注入边界有问题，不能作为生产修复。

### CDI 把 GPU 设备声明变成标准接口

Container Device Interface（CDI）用设备 Spec 描述容器运行时应注入的设备、挂载和环境。它可以减少不同 Runtime 之间依赖 NVIDIA 特殊 hook 的差异，也适合声明物理 GPU、MIG 实例或其他设备。

```bash
nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
nvidia-ctk cdi list
```

排障时检查 Spec 是否存在、设备名称是否与请求一致、Runtime 是否支持 CDI、Spec 与驱动/MIG 状态是否同步。MIG 重配、驱动升级或节点恢复后，旧 Spec 可能仍然引用不存在的设备。

#### CDI Spec 也是节点状态的一部分

CDI YAML 中的设备名、环境和挂载应与当前 `/dev/nvidia*`、GPU UUID 和 MIG UUID 对应。Spec 文件生成成功但 Runtime 未扫描其目录，或者 Runtime Cache 未刷新，同样会导致设备请求失败。

节点生命周期应在 Driver/MIG 变更后重新生成并验证 CDI，再运行最小容器。不要手工长期维护包含具体 UUID 的 Spec 副本。

## 第 4 章 · CUDA-X、推理栈和制品

### cuDNN、NCCL、TensorRT 位于应用和硬件之间

cuDNN 提供深度学习常用算子的优化实现；NCCL 提供多 GPU/多节点通信；TensorRT 将模型转换、融合、量化和执行优化结合起来。应用通常通过 Framework 或推理服务间接调用这些库。

性能回归要区分“同一模型换了库版本”和“模型本身换了实现”。库升级可能改变 Kernel 选择、Tensor Core 路径、Workspace 需求或通信算法，既可能提高吞吐，也可能增加显存峰值或改变数值结果。

#### cuDNN 和 cuBLAS 选择计算实现

这些库根据 GPU、Shape、Precision、Workspace 和配置选择算法。Deterministic 设置、TF32、Autotune 和 Workspace Limit 都可能改变性能/数值。基准报告要保存相关 Framework Flag。

#### NCCL 选择通信实现

NCCL 版本与 Driver、CUDA、网络插件和拓扑共同决定 Transport/Algorithm。升级 Framework 时即使用户没有直接升级 NCCL，也可能因镜像内依赖变化改变通信性能。

#### TensorRT Engine 不是通用模型文件

Engine 与 TensorRT 版本、GPU 架构、Profile、Precision 和 Plugin 相关。Model Registry 应同时保存原模型、构建配置和目标平台，允许重新构建，不能只存一个无法追溯的 Engine Blob。

### TensorRT、TensorRT-LLM 和 Triton 解决交付问题

TensorRT 主要负责推理图优化和高效执行；TensorRT-LLM 面向大语言模型的并行、量化、KV Cache 和生成优化；Triton Inference Server 负责把模型作为服务交付，并提供模型仓库、动态批处理、并发管理、健康检查和指标接口。

服务化后需要同时观察模型执行和服务行为：模型加载时间、显存占用、Batch、Queue、首 token 延迟、生成吞吐、P95/P99 和错误率。服务容器健康不等于模型已经成功加载并能承受目标并发。

#### 动态批处理在吞吐和延迟之间取舍

Triton 可以短暂等待多个请求形成 Batch，提高 GPU 吞吐；等待窗口过长会增加 Queue Time 和尾延迟，过短则无法形成有效 Batch。配置必须基于请求率、Shape、SLA 和模型执行时间压测，不应照搬另一个模型。

#### Model Repository 需要版本、配置和回滚

模型文件、TensorRT Engine、Tokenizer、配置和依赖库应作为同一发布单元。TensorRT Engine 可能与 GPU 架构、TensorRT 版本和构建参数相关，不能假设一个 Engine 在所有 GPU 节点池通用。

### NGC 是镜像、模型和 Helm 制品入口

NVIDIA GPU Cloud（NGC）提供 GPU 优化容器、预训练模型、Helm Chart 和相关制品。使用 NGC 镜像可以减少框架、CUDA-X 和驱动兼容的集成工作，但不能跳过对目标 GPU、宿主机驱动、网络、存储和安全扫描的验证。

生产使用应固定镜像 Digest、记录 NGC 内容版本、保存模型和配置的来源，并在私有 Registry 中完成权限、漏洞扫描、签名和回滚管理。不要把 `latest` 作为长期生产版本标识。

#### 从 NGC 到生产 Registry 需要供应链控制

推荐流程包括拉取固定版本、验证来源和 License、漏洞扫描、生成 SBOM、签名、同步到私有 Registry、执行 GPU 兼容/性能测试，再批准发布。上游 Tag 被更新或删除时，Digest 和内部副本保证可重现。

#### Helm Chart 也需要固定依赖和 Values

Chart Version、Application Image、CRD 和 Values 一起决定部署结果。只固定 Chart 而让 Image Tag 浮动，仍可能发生未审查升级。回滚前确认 CRD 是否向后兼容，避免 Helm 回滚了 Workload 却无法回滚 Schema。

### NVIDIA AI Enterprise 为生产软件提供支持边界

NVIDIA AI Enterprise 是面向企业部署的软件套件和支持体系，价值主要在受支持的平台矩阵、生命周期、补丁、验证软件和厂商支持，而不是一种新的 CUDA 执行层。它与 NGC、虚拟化平台、GPU Operator、AI Framework 和推理软件存在交集。

项目选型时应确认授权范围、支持的 GPU/虚拟化/Kubernetes 版本、更新策略和问题升级渠道。采用企业支持不替代内部基准、监控、回滚和 Runbook；没有订阅时也不能假设所有 NGC 制品都具备相同生命周期承诺。

支持边界要写进发布记录：哪些问题可由厂商接单，哪些是自定义 Kernel、镜像或业务代码责任，哪些版本组合已经过认证。提交支持请求时应附上 Driver、Toolkit、GPU 型号、镜像 Digest、最小复现和日志脱敏说明，避免只提供“容器启动失败”这一不可复现描述。

## 第 5 章 · 容器和节点故障排查

### 决策树一：宿主机 GPU 正常但容器看不到 GPU

这条决策树的前提是宿主机已经能够稳定执行 `nvidia-smi`，并且预期 GPU 的 UUID、数量和健康状态正确。若宿主机检查失败，问题已经越过容器边界，应转向硬件、Kernel Module、Device Node 和 Driver 用户态库，而不是继续修改容器镜像。

```mermaid
flowchart TD
    A[Host GPU 和 UUID 正常] --> B{容器请求包含 GPU}
    B -- 否 --> B1[修正设备请求]
    B -- 是 --> C{Runtime 已加载 Toolkit}
    C -- 否 --> C1[修正 Runtime 配置]
    C -- 是 --> D{设备节点已交付}
    D -- 否 --> D1[检查 Hook CDI 和权限]
    D -- 是 --> E{容器内 Utility 正常}
    E -- 否 --> E1[检查驱动库注入]
    E -- 是 --> F{容器内 Compute 正常}
    F -- 否 --> F1[检查 libcuda 和 Capability]
    F -- 是 --> G[进入 Framework 诊断]
```

#### 第一步：冻结宿主机基线并确认故障边界

```bash
nvidia-smi -L
ls -l /dev/nvidia* 2>/dev/null
cat /proc/driver/nvidia/version
```

记录 GPU UUID、Driver Version、Device Node 和测试时间。宿主机 `nvidia-smi` 正常只证明 NVML Utility 路径可用；它不能证明某个容器已经收到设备，也不能证明容器内 Compute Capability 和 `libcuda.so` 可用。

| 检查结果 | 正常含义 | 异常转向 | 是否隔离节点 |
| --- | --- | --- | --- |
| UUID、数量和设备节点符合节点清单 | 可以继续检查容器交付链 | 不适用 | 暂不隔离 |
| 宿主机 `nvidia-smi` 失败或 GPU 缺失 | 容器不是第一故障点 | Driver、Kernel、PCIe 或硬件路径 | 生产 GPU 节点通常先隔离 |
| 宿主机正常但所有容器同时失败 | 节点级 Runtime/Toolkit/CDI 可疑 | 第二至第五步 | 先停止新调度；是否 Drain 取决于现有作业是否受影响 |
| 仅一个镜像或一个容器失败 | 节点公共链路可能正常 | 请求、镜像、用户权限和 Entrypoint | 不因单镜像故障直接隔离 |

#### 第二步：确认容器创建请求确实声明了 GPU

Docker 路径检查 `--gpus` 或 `NVIDIA_VISIBLE_DEVICES`；Kubernetes 路径检查 Pod 的扩展资源请求、RuntimeClass 和 Device Plugin Allocate 结果。`NVIDIA_VISIBLE_DEVICES` 为空、未设置或为 `void` 时可以表现为普通 `runc` 容器；为 `none` 时不交付 GPU 设备，但仍可能保留部分驱动能力，因此要查看实际值而不是只看变量是否存在。

```bash
docker inspect <container> | rg -i 'runtime|device|gpu|NVIDIA_VISIBLE_DEVICES'
docker info | rg -i 'runtime|nvidia'
```

请求缺失时，修正工作负载声明后重新创建容器；重启原进程不能给已经创建的 OCI Spec 补上设备。只有当相同请求在该节点的所有容器上失败时，才继续怀疑节点级 Runtime。

#### 第三步：确认 Runtime 使用的是生效配置

NVIDIA Container Toolkit 通过 `nvidia-container-runtime`、OCI Hook、`libnvidia-container` 或 CDI 把设备和驱动能力加入容器。Docker、containerd、CRI-O 和 Podman 的接入路径不同，必须先确认当前运行实例实际读取了哪个配置文件和 Runtime Handler。

```bash
containerd config dump | rg -i 'nvidia|runtime'
crictl info
nvidia-ctk config --set nvidia-container-runtime.log-level=debug
```

最后一条命令只在标准输出预览配置，不修改源文件。若生效配置中没有预期 Handler、Runtime 未重启或 Kubelet 连接了另一 CRI Endpoint，应先修复配置管理链；不要同时叠加 Hook、显式 NVIDIA Runtime 和 CDI 来碰运气。

#### 第四步：核对设备节点、Cgroup 和容器内交付结果

进入容器后同时检查可见设备、环境变量和 GPU UUID：

```bash
ls -l /dev/nvidia* 2>/dev/null
env | rg '^NVIDIA_|^CUDA_VISIBLE_DEVICES='
nvidia-smi -L
```

容器里没有预期 Device Node，说明问题仍在 OCI/CDI 注入、设备请求或 Cgroup 权限。Device Node 存在但 `nvidia-smi` 失败，则检查 NVML Utility Library、权限和 Host Driver 用户态库是否正确注入。临时使用 `--privileged` 后成功只能证明交付或权限边界有问题，不能作为生产修复。

#### 第五步：CDI 路径要验证名称和状态新鲜度

```bash
nvidia-ctk cdi list
nvidia-ctk --debug cdi list
```

CDI 设备名必须与容器请求一致，Spec 中的 GPU/MIG UUID、Device Node 和 Mount 必须对应当前节点状态。Driver 升级、GPU 更换或 MIG 重配置后，旧 Spec 可能仍能被 Runtime 读取，却引用已经不存在的设备。此时应由既定的 Operator 或节点自动化刷新 Spec；手工生成文件前要确认不会与控制器竞争。

如果传统 Hook 路径成功而 CDI 路径失败，边界已经收敛到 CDI Spec、Runtime 的 CDI 支持或设备名称解析；反过来也一样。不要把两条路径混在同一个验证容器中。

#### 第六步：区分 Utility 可见和 Compute 可用

`nvidia-smi` 需要 Utility/NVML 能力；CUDA 应用还需要 Compute Capability、真实 `libcuda.so` 和可访问的设备。容器内 `nvidia-smi` 成功但应用初始化失败时，检查驱动能力和动态库：

```bash
env | rg '^NVIDIA_DRIVER_CAPABILITIES='
ldconfig -p | rg 'libcuda|libnvidia-ml'
python -c 'import ctypes; ctypes.CDLL("libcuda.so.1"); print("libcuda load ok")'
```

若 `NVIDIA_DRIVER_CAPABILITIES` 只有 `utility`，管理工具可以成功而 CUDA 计算失败；计算应用通常需要 `compute`。若加载到镜像自带 Stub 或旧 `libcuda.so`，转向镜像和动态链接器，而不是继续修改 Host Toolkit。

#### 隔离节点的判定不能只看一次容器失败

- 宿主机 GPU/Driver 已异常，或同节点多个已验证镜像都无法通过最小 CUDA Container：停止新调度并隔离节点，保留 Runtime、Toolkit、CDI 和 Driver 日志。
- 同一镜像在健康节点成功、异常节点失败，且 GPU 型号和运行方式相同：节点级差异成立，应隔离异常节点做修复。
- 官方最小容器成功，只有业务镜像失败：按镜像、动态库或应用环境问题处理，不隔离健康节点。
- Docker 最小容器成功但 Kubernetes Pod 失败：先隔离 Kubernetes 的 Device Plugin、RuntimeClass、CDI 和 Kubelet 链路；不要把 Docker 成功当作 CRI 已验证。

#### 恢复验证必须沿同一路径逐层返回

修复后依次验证：宿主机 UUID 和设备数量 → 目标 Runtime 的最小容器 → 容器内 `nvidia-smi -L` → `libcuda.so.1` 加载 → 一个真实 CUDA Kernel → Framework Device Test → 目标工作负载。若故障来自 Kubernetes，还要验证 Smoke Pod 的资源请求和实际 UUID 一致。

每一步记录镜像 Digest、Runtime/Handler、GPU UUID 和退出码。最终成功标准不是“容器启动了”，而是目标容器使用预期 GPU 完成计算，并且移除临时 `--privileged`、调试环境变量或绕过配置后仍然成功。

### 决策树二：nvidia-smi 正常但 PyTorch CUDA 不可用

这条决策树从“`nvidia-smi` 正常”开始，但首先要确认它是在与 PyTorch 相同的宿主机或容器命名空间、同一用户和同一环境中执行。Host 上成功、容器里失败，仍应先走上一条容器交付树。

```mermaid
flowchart TD
    A[nvidia-smi 正常] --> B{torch 构建含 CUDA}
    B -- 否 --> B1[更换 CUDA Build]
    B -- 是 --> C{进程可枚举设备}
    C -- 否 --> C1[检查可见性和设备注入]
    C -- 是 --> D{libcuda 可正确加载}
    D -- 否 --> D1[修正动态库解析]
    D -- 是 --> E{Driver 支持 Runtime 能力}
    E -- 否 --> E1[调整 Driver 或受控兼容路径]
    E -- 是 --> F{构建支持 GPU 架构}
    F -- 否 --> F1[更换或重建制品]
    F -- 是 --> G{真实 Kernel 成功}
    G -- 否 --> G1[检查扩展和运行时错误]
    G -- 是 --> H[恢复目标工作负载]
```

#### 第一步：一次性保存 Framework、环境和完整错误

```bash
python - <<'PY'
import os
import torch

print("torch", torch.__version__)
print("torch.version.cuda", torch.version.cuda)
print("CUDA_VISIBLE_DEVICES", os.environ.get("CUDA_VISIBLE_DEVICES"))
print("is_available", torch.cuda.is_available())
print("device_count", torch.cuda.device_count())
print("arch_list", torch.cuda.get_arch_list())
if torch.cuda.is_available():
    print("device_name", torch.cuda.get_device_name(0))
    print("device_capability", torch.cuda.get_device_capability(0))
PY
```

同时保存 `python` 可执行文件路径、Package 安装来源、镜像 Digest、GPU UUID 和完整 stderr。不要只截取 `False`，因为“CPU Build”“设备数为零”“Driver 初始化失败”和“架构不支持”需要不同处理。

#### 第二步：先判断是不是 CPU-only Framework Build

`torch.version.cuda` 为 `None` 通常表示当前 PyTorch Build 不含 CUDA Runtime 支持。此时 `nvcc --version` 即使成功也不能改变这个 Wheel；本地 Toolkit 不会自动把 CPU Build 变成 CUDA Build。应从受控来源安装与平台矩阵匹配的 CUDA Build，或切换到已验证镜像。

| 证据 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| `nvidia-smi` 中 Driver Version | Host Driver 版本 | PyTorch Build 类型 |
| `nvidia-smi` 中 CUDA Version | Driver 可支持的 CUDA 能力上限提示 | 已安装 Toolkit 或应用实际 Runtime |
| `nvcc --version` | 当前 `PATH` 命中的 Toolkit Compiler | PyTorch 正在使用该 Toolkit |
| `torch.version.cuda` | PyTorch Build 对应的 CUDA Runtime 系列 | Driver、设备和 Kernel 一定可用 |

CPU-only Build 只影响一个环境或镜像时，不隔离节点。若平台基础镜像被错误发布，应停止该 Digest 继续放量，但这属于制品隔离，不是硬件节点隔离。

#### 第三步：设备数为零时先查可见性而不是版本号

`torch.version.cuda` 有值但 `device_count()` 为零，先查看 `CUDA_VISIBLE_DEVICES`、容器设备请求、Device Node 和 Cgroup。变量为空或映射到不存在的序号/UUID，会让进程看不到设备；同一容器的 `nvidia-smi -L` 与 Framework 输出应使用 GPU UUID 对齐，不能只比较逻辑序号。

如果容器内 `nvidia-smi` 也失败，返回决策树一。如果容器内 `nvidia-smi` 成功而 PyTorch 设备数仍为零，继续检查 Compute Driver Capability 和 `libcuda.so`，因为 Utility 路径成功不代表 Compute 路径成功。

#### 第四步：确认加载的是真实 libcuda 而不是 Stub 或旧副本

`libcuda.so` 来自 Driver 用户态接口，`libcudart.so` 来自 Runtime/Toolkit 或 Framework 依赖。应用必须让二者各自解析到预期所有者：

```bash
ldconfig -p | rg 'libcuda|libcudart'
find /usr /opt -name 'libcuda.so*' -o -name 'libcudart.so*' 2>/dev/null
python -c 'import ctypes; ctypes.CDLL("libcuda.so.1"); print("libcuda load ok")'
LD_DEBUG=libs python -c 'import torch; print(torch.cuda.is_available())' 2>&1 | less
```

若搜索结果包含 Toolkit 的 `stubs` 目录、旧 CUDA 目录或镜像内非预期 Driver Library，检查 `LD_LIBRARY_PATH`、`RPATH/RUNPATH` 和 Loader Cache。先保存原环境再做单变量实验；不要把临时调整搜索路径直接写入生产镜像。

`undefined symbol` 更倾向于 Library/ABI 混装，`libcuda.so.1` 无法打开更倾向于 Driver Library 未注入或搜索路径错误。两者都不应通过安装另一套完整 Toolkit 盲目覆盖。

#### 第五步：把 Runtime 和 Driver 兼容性当作能力检查

Driver 较新而 Runtime 较旧通常走 Driver Backward Compatibility；同一 Major 内的新 Runtime 运行在满足最低条件的旧 Driver 上，可能使用 Minor Version Compatibility；跨 Major 的 Forward Compatibility 需要受支持平台和专用 Compat Package，并且只覆盖明确的 CUDA 用户态边界。

若完整错误出现 `cudaErrorCallRequiresNewerDriver`，说明应用调用了当前 Driver 不具备的新能力，应升级已验证 Driver 或换回受支持 Runtime/Framework。遇到 System Driver Mismatch 或 Compat 不支持当前设备的错误，应检查 Compatibility Package、Kernel Driver 和用户态 `libcuda` 是否形成受支持组合。具体最低版本必须按该 CUDA Release Notes 和平台矩阵确认，本笔记不提供会过期的固定版本表。

只有同节点多个经过验证的 Framework 镜像都在 Driver 初始化层失败，或 Host Driver/用户态库已发生系统级不一致时，才需要隔离节点。单个新镜像超出 Driver 能力时，应隔离或回滚该制品。

#### 第六步：检查 Framework 和 Extension 是否覆盖目标 Compute Capability

Framework CUDA Build 可用不代表其二进制包含目标 GPU 所需的 Cubin/PTX。对比 GPU Compute Capability、`torch.cuda.get_arch_list()`、Build Manifest 和自定义 Extension 的目标 `sm_` 列表。基础 Framework 支持而某个算子报 `no kernel image is available for execution on the device` 或 `invalid device function` 时，优先检查 Flash Attention、自定义 Operator 等 Extension。

同一制品只在某一代 GPU 失败，通常应重新构建多架构制品、使用与该节点池匹配的镜像，或用调度标签阻止不兼容组合；不要把不支持的硬件节点误判为损坏。只有硬件在平台声明的受支持矩阵内，而多个已验证制品仍无法执行，才转入节点级健康检查。

#### 第七步：用真实 Kernel 区分枚举成功和执行成功

```bash
python - <<'PY'
import torch

assert torch.cuda.is_available(), "CUDA unavailable"
x = torch.ones(1024, device="cuda")
y = (x * 2).sum()
torch.cuda.synchronize()
assert y.item() == 2048
print(torch.cuda.get_device_name(0), "kernel ok")
PY
```

设备名称可读取但 Kernel 失败，说明“枚举设备”已经通过，问题转向 CUDA Context、Driver Entry Point、架构制品、自定义 Extension 或之前遗留的异步错误。先用纯 PyTorch 基础算子验证，再逐步加入 Extension 和目标模型，每次只增加一个变量。

#### 第八步：按证据选择责任层和隔离对象

| 首次失败层 | 主要责任边界 | 隔离对象 | 修复后最小验证 |
| --- | --- | --- | --- |
| `torch.version.cuda is None` | Framework Package/镜像 | 镜像或 Python 环境 | Framework Device Test |
| 设备数为零且容器未收到设备 | Runtime/Toolkit/CDI/请求 | 异常节点或工作负载配置 | 最小 CUDA Container |
| `libcuda` 解析到 Stub/旧副本 | 镜像或 Loader 配置 | 镜像 | `libcuda` 加载和基础 Kernel |
| Driver 能力不足 | 节点池与 Runtime 版本矩阵 | 不兼容节点池或镜像 | Device Query 和 Framework Kernel |
| Compute Capability 不覆盖 | Framework/Extension Build | 制品或调度组合 | 目标 GPU 上的关键算子 |
| 基础 Kernel 成功而模型失败 | Extension、模型或业务配置 | 应用版本 | 关键算子到目标模型 |

#### 恢复验证要同时证明版本、设备和执行路径

恢复顺序为：同命名空间 `nvidia-smi -L` → PyTorch 构建信息 → 预期 GPU UUID/数量 → `libcuda.so.1` 实际加载 → 基础 CUDA Kernel → 自定义 Extension → 目标模型。容器场景再从相同镜像和相同 RuntimeClass 创建新实例，排除旧进程环境和旧 OCI Spec。

最后在健康对照节点与修复节点执行同一镜像、同一输入和同一验证脚本，比较退出码、GPU UUID 和完整日志。确认临时 `LD_LIBRARY_PATH`、`--privileged`、兼容性绕过或 CPU Fallback 已移除；否则只是改变了执行路径，并没有恢复原有 GPU 能力。

### 驱动升级需要节点生命周期管理

驱动升级会影响内核模块、设备节点、CUDA 兼容、Fabric Manager、Device Plugin、DCGM 和容器 Runtime。Kubernetes 节点应先 Cordon/Drain，确认没有持有 GPU 的进程，再执行升级、重启和分层验证。

```text
Cordon/Drain
  ↓
保存拓扑、版本和健康基线
  ↓
升级 Driver/Fabric/Toolkit
  ↓
nvidia-smi、DCGM、容器 Smoke Test
  ↓
Device Plugin 和 GPU Allocatable
  ↓
单卡、多卡、必要时多节点回归
  ↓
解除隔离
```

升级成功的定义不是包安装成功，而是驱动、Fabric、容器、Kubernetes 资源和真实工作负载都通过验证。

#### Kernel 和 Driver 必须作为一个启动组合验证

发行版更新 Kernel 后，旧 Driver Module 可能无法加载；Driver 更新也可能要求新 Kernel Feature。Canary 重启前确认 Module 已构建/签名并可被 Initramfs/系统加载，保留可启动旧 Kernel。

#### 正在运行的 CUDA Context 不能跨 Driver 重载保留

升级前要确认所有 GPU Process、Display Service、MPS、DCGM 和 Fabric 依赖。强制卸载模块可能导致作业损坏或节点失稳，生产应 Drain 后重启进入新组合，而不是在线替换核心模块。

## 第 6 章 · Runtime 配置、软件发布与生产治理

### 软件发布要固定版本和回滚路径

GPU 软件栈应以节点池或平台版本为单位发布，记录 Driver、CUDA Runtime、Framework、cuDNN、NCCL、TensorRT、Toolkit、Container Toolkit、DCGM、GPU Operator 和固件版本。镜像、Helm Chart 和驱动安装包都应可追溯并能回滚。

升级前要用代表性模型和最老硬件做兼容验证；升级后要比较功能、吞吐、显存峰值、数值结果、监控指标和作业失败率。遇到性能下降时，应能快速切回上一组镜像或节点池，而不是在线修改多个版本变量。

发布单元应有唯一版本标识和依赖清单，至少能从 Deployment 或节点标签反查到镜像 Digest、Driver Branch、CUDA-X 版本和测试批次。回滚演练要验证旧组合仍可拉取、旧 Engine 或 Extension 能加载，并明确哪些状态需要重启节点才能恢复；只回滚 Python 包而保留新 Driver，不能视为完整回滚。

### 版本问题要通过最小复现缩小范围

最小复现应从单 GPU、单进程、最小容器开始，再逐步增加框架、模型、多卡、RDMA 和 Kubernetes。每一步只增加一个变量，保存命令、镜像、驱动、GPU UUID 和结果。

这种顺序可以区分硬件不可见、容器注入失败、Runtime/Framework 不兼容、架构不支持、通信失败和应用逻辑错误，避免用一个复杂端到端任务反复试错。

每次实验只改变一个边界变量，例如只替换镜像、只切换 RuntimeClass 或只改变 GPU 节点池。结果记录应包含成功与失败的对照，而不是只保存最后一次日志；这样平台团队可以把复现包交给镜像、驱动或框架责任人而无需重新猜测环境。

### containerd 接入 GPU 要确认 Runtime Handler 和 CRI 配置

#### 配置链路

```text
Kubelet CRI Request
  ↓
containerd CRI Plugin
  ↓
Runtime Handler / OCI Runtime
  ↓
NVIDIA Container Toolkit 或 CDI
  ↓
runc 和 Container Process
```

`nvidia-ctk runtime configure --runtime=containerd` 可以辅助生成配置，但生产环境应把结果纳入配置管理并审阅。修改后检查 containerd 配置是否加载、Runtime Handler 是否存在、kubelet CRI Endpoint 是否指向同一实例。

```bash
containerd config dump | rg -i 'nvidia|runtime'
crictl info
crictl runp <pod-config.json>
```

Docker 测试成功而 Kubernetes 失败时，不能证明 containerd 配置正确。应使用 CRI 或 Kubernetes 最小 Pod 复现。

### 镜像内不应携带可覆盖 Host Driver 的错误库

CUDA Image 可以携带 Runtime、cuDNN、NCCL 和 Framework，但不应把 Driver Stub 路径放在运行时动态库搜索前面。构建阶段需要的 Stub 应与最终 Runtime Stage 分离。

#### 多阶段镜像的边界

```dockerfile
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04 AS build
RUN echo "build CUDA extension here"

FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04
RUN echo "copy runtime artifacts here"
```

基础镜像版本仅为示例，实际使用需与 Driver/Framework 支持矩阵匹配。构建时记录 `TORCH_CUDA_ARCH_LIST` 或目标架构，避免只为构建节点 GPU 生成二进制。

### 软件升级要分功能、性能和数值三类验证

#### 功能验证

- Driver 和设备可见；
- 最小 CUDA Kernel；
- Framework Device 和关键算子；
- 单卡、多卡、RDMA/NCCL；
- Triton/模型加载和健康检查。

#### 性能验证

使用相同模型、数据、精度、Batch、拓扑和时间窗口，对比吞吐、延迟、显存峰值、SM/Tensor/DRAM、NCCL 和功耗。只对比平均 GPU Utilization 无法发现有效性能回归。

#### 数值验证

比较 Loss Curve、准确率、输出分布、量化误差、NaN/Inf 和随机种子差异。库升级可能选择新的 Kernel 或精度路径，性能提高但数值不满足业务要求仍不能发布。

### 最小复现包要能离线交给平台或厂商

复现包包括 Node/GPU UUID、Driver、Firmware、CUDA/Framework/Library、镜像 Digest、环境变量、最小代码、执行命令、完整错误、动态库加载结果和健康节点对照。敏感 Dataset/模型不能外发时，构造保留 Shape、精度和算子路径的最小输入。

一个可重复失败的最小样例比数百 MB 的训练日志更容易区分兼容、架构、动态库和应用问题，也便于在 Canary 节点验证修复。

## 第 7 章 · Driver、设备节点、动态链接与编译制品

### NVIDIA Driver 同时包含内核态和用户态组件

“Driver 已安装”不是一个单点状态。内核模块负责设备、内存和 DMA 等内核交互，用户态库提供 CUDA Driver API、NVML、OpenGL/Vulkan 等接口，设备节点把能力暴露给进程。

```text
Application or Framework
  -> libcuda.so or libnvidia-ml.so
  -> NVIDIA Kernel Modules
  -> PCIe GPU and Firmware
```

常见模块包括 `nvidia`、`nvidia_uvm`、`nvidia_modeset`、`nvidia_drm`，实际加载集合取决于 Headless Compute、Display 和 Driver 模式。计算节点最关键的是主模块与 UVM，但不要在不了解发行版打包方式时手工删除其他模块。

```bash
lsmod | rg '^nvidia'
modinfo nvidia | head
ls -l /dev/nvidia* /dev/nvidia-caps 2>/dev/null
cat /proc/driver/nvidia/version
```

#### Kernel Module Version 和用户态 Library 必须一致

节点升级包后未重启，磁盘上的用户态库可能已是新版本，而正在运行的内核模块仍是旧版本，出现 `API mismatch`。此时重复安装 CUDA Toolkit 没有帮助，应确认已加载模块、磁盘包和进程映射。

```bash
dmesg -T | rg -i 'NVRM|API mismatch|nvidia'
ldconfig -p | rg 'libcuda|libnvidia-ml'
```

重载 Driver 前必须 Drain 节点并确认没有 CUDA Context。生产 GPU Reset、卸载模块和重启都属于维护动作。

### NVML 是监控和管理工具的重要接口

`nvidia-smi` 主要通过 NVML 查询和控制 GPU，DCGM 也会使用底层管理能力。应用 CUDA 正常但 `nvidia-smi` 失败，可能是 NVML 用户态库路径错误；反过来 `nvidia-smi` 成功只证明管理接口可用，不证明 Framework 与所有 CUDA Library 正常。

NVML 能提供 Inventory、Temperature、Power、Clock、ECC、Process 和 Fabric 等信息，具体 Field 依赖产品。容器若只注入 Compute Capability 而未注入 Utility Capability，CUDA 程序可能运行但容器内 `nvidia-smi` 不可用。

监控采集要记录 NVML 返回码和采集时间。GPU Reset、MIG 重配或 Driver 重载期间，`NOT_SUPPORTED`、`NO_PERMISSION` 与设备暂时消失应分别计数，不能把所有空值转成零；否则会把维护窗口误报成健康状态。

### Device Node 权限是容器可见性的最后一道本地边界

容器看到 Library 仍需访问 `/dev/nvidiactl`、GPU Device、UVM 和可能的 Capability Node。OCI Hook、CDI 或 Runtime 负责把设备与权限加入 Container Spec，Linux Cgroup Device Policy 和安全配置决定最终是否允许访问。

排查顺序：宿主机设备节点存在；Runtime 生成的 Spec 包含设备；容器 Namespace 内节点存在；Major/Minor 正确；Cgroup 允许；SELinux/AppArmor/Seccomp 无阻断；进程 UID/GID 可访问。

证据包应保存宿主机与容器内 `stat` 的 Major/Minor、OCI `linux.devices` 和 Cgroup 规则。只在容器里执行 `chmod` 不能改变宿主机设备策略；临时放宽权限必须限定节点和时段，并在复测后恢复。

### 同名 Library 可能来自系统、Toolkit、Wheel 或容器

一个 PyTorch 进程可能同时面对镜像系统目录、CUDA Toolkit、Python Wheel 自带目录、Conda Environment 和 Host 注入目录。动态链接器按 ELF RPATH/RUNPATH、`LD_LIBRARY_PATH`、Cache 和默认目录解析，错误顺序会加载非预期版本。

```bash
ldd "$(command -v nvidia-smi)"
readelf -d /path/to/extension.so | rg 'RPATH|RUNPATH|NEEDED'
LD_DEBUG=libs python -c 'import torch; print(torch.cuda.is_available())' 2>loader.log
```

`LD_DEBUG` 输出很大，只在最小复现容器使用，并检查日志是否含敏感路径。不能把全局修改 `LD_LIBRARY_PATH` 当长期补丁，它可能修复一个库同时破坏另一个。

推荐把实际加载结果固化为清单：进程 PID、`/proc/<pid>/maps` 中的 CUDA/NVML 路径、ELF Build ID、镜像 Digest 和环境变量。对比健康节点时先比较这些客观路径，再决定是重建镜像还是修正 Runtime 注入，避免凭目录名猜版本。

### SONAME 兼容与符号缺失是不同问题

Library 文件存在但加载失败，可能是依赖 SONAME 不存在；成功打开文件后出现 `undefined symbol`，通常表示运行时版本缺少构建时所需符号，或加载了错误实现。

诊断要保存完整错误、`readelf -d`、`ldd`、实际 Mapping 和 Package Version。只根据文件名中的 CUDA 版本猜测不够，尤其 Framework Wheel 会携带独立的 CUDA Library 组合。

#### Stub Library 不能作为生产 Runtime Driver Library

Toolkit 的 Stub `libcuda.so` 用于链接阶段，不提供真实设备访问。错误把 `stubs` 目录放到 Runtime Search Path，会导致初始化失败。镜像构建应仅在 Link Stage 使用 Stub，并保证运行时由 Host Driver 注入真实 Library。

### 自定义 CUDA Extension 扩大了兼容矩阵

即使官方 Framework Wheel 支持目标 Driver，自定义 Extension 仍受编译 Toolkit、C++ ABI、Compute Capability、PTX/Cubin 和依赖 Library 影响。升级 PyTorch 或 CUDA 后，旧 `.so` Cache 可能继续被加载。

发布记录至少包含 Compiler、Toolkit、Framework ABI、目标 `sm_` 列表、依赖 SONAME 和 Source Commit。运行时出现 `no kernel image`、`invalid device function` 或 Symbol Error 时，先清理并重建匹配环境的 Extension，而不是先更换硬件。

Extension 的 Cache 路径也应纳入制品治理。升级 Framework、Compiler 或 GPU 架构后禁止复用旧 Cache；构建阶段运行 `ldd` 和最小 Kernel Test，运行阶段再验证真实 Tensor Shape，确认加载的是本次 Build 的 `.so` 而不是用户目录中的残留文件。

### nvcc 编译 Host Code 与 Device Code 的混合制品

`nvcc` 是 Toolkit 中的编译驱动，协调 Host Compiler、Device Frontend、PTX 和 Cubin 生成。生产仅运行预编译 Framework 时通常不需要完整 Toolkit；需要编译 Extension、Kernel 或调试工具的 Build Environment 才需要。

把编译工具留在最终镜像会增大攻击面和镜像体积。推荐 Multi-Stage Build：Builder 固定 Toolkit 与编译依赖，Runtime 只保留产物和所需用户态 Library。

Build Log 应保存 Host Compiler、`nvcc` 完整版本、编译选项、目标架构和链接库。若使用动态链接，运行镜像还要验证 SONAME 可解析；若静态链接，也要确认许可证和安全扫描范围，不能因为没有 `.so` 就认为不需要 Runtime 兼容测试。

### Fat Binary 在兼容范围和制品体积间取舍

Fat Binary 可包含多个架构 Cubin 和 PTX。包含更多 `sm_` 提高硬件覆盖，但增加 Build Time 和制品大小；只含当前架构则限制迁移。PTX 提供一定 JIT 前向路径，但首次运行有编译延迟，也不保证新架构最佳性能。

平台镜像目录应标注支持的最老/最新 GPU、是否包含 PTX、首次 JIT 预热策略和 Cache 位置。Read-Only Filesystem 或无可写 Cache 时，多个副本可能反复 JIT。

### Compute Cache 会影响冷启动和可重复性

Driver JIT 和 Library Autotuning 可能在首次运行建立 Cache，导致冷启动比稳态慢。基准必须区分 Cold、Warm 和 Cache-Preserved 三种场景。在线扩容的首请求 SLA 不能用预热后的平均值代替。

Cache Key 会受 Driver、PTX、GPU 架构和配置影响。升级后旧 Cache 可能失效是正常现象，发布计划应预留预热容量，避免所有副本同时编译造成 CPU、Disk 和 GPU 峰值。

## 第 8 章 · CUDA-X 与推理软件的数据路径

### Library 通过算法选择把同一算子映射到不同实现

cuBLAS、cuDNN、TensorRT 等会根据 GPU 架构、Datatype、Shape、Workspace 和 Library Version 选择 Kernel。相同模型换版本后性能或显存变化，常来自算法选择而非硬件变化。

Workspace 越大可能允许更快算法，但挤占模型和 KV Cache 空间。确定性模式可能限制算法集合。验收必须固定环境变量、Workspace、精度和 Shape，并验证数值结果。

### TensorRT Engine 不是跨所有 GPU 和版本的通用二进制

Engine 构建会固化网络优化、Kernel Tactic、Precision、Profile 和目标平台信息。跨 TensorRT Version、GPU Architecture 或 Plugin ABI 使用可能失败或性能不佳，除非明确启用了受支持的兼容模式。

Engine Registry 应保存：模型版本、ONNX/Source Hash、TensorRT/CUDA/Driver、GPU Target、Precision、Optimization Profile、Plugin、Build Flag、校准集与数值验证。只按模型名存一个 `model.plan` 无法安全回滚。

### TensorRT-LLM 还引入并行配置和 KV Cache 策略

大模型 Engine 除权重外，还固化 Tensor/Pipeline Parallel、Max Batch、Max Sequence、KV Cache、Quantization 和通信插件等假设。Engine 能加载不表示当前 GPU 数、拓扑和请求形态适配。

推理容量验收同时看 Prefill/Decode：Prefill 更偏计算和 Prompt Length，Decode 受 Memory/KV Cache 与小步调度影响。报告只给总 Tokens/s 会掩盖首 Token 延迟和并发退化。

### Triton 调度器连接请求队列、模型实例和 GPU

Triton Model Repository 定义 Backend、版本、Instance Group、Dynamic Batching、Input Shape 和资源。请求先排队和成批，再进入模型实例。GPU 低利用率可能是 Batch 未形成，尾延迟高可能是 Queue Delay 或实例争用。

```text
Client -> Request Queue -> Dynamic Batcher -> Model Instance -> GPU Engine
```

监控应区分 Request Count、Queue Time、Compute Input/Infer/Output、Failure 和 GPU 指标。增加实例数可能提高并发，也会复制权重、Workspace 和 KV Cache，导致 OOM 或 Cache 竞争。

## 第 9 章 · 容器供应链与软件栈分界实验

### 镜像 Tag 便于阅读而 Digest 才固定制品

NGC 或内部 Registry 的 Tag 可能更新。生产 Deployment、基准报告和回滚记录应保存 Digest，同时记录上游 Tag 与 Build Provenance。基础镜像更新要经过漏洞、兼容、性能和数值四类验证。

#### SBOM 必须覆盖 OS、Python 和 CUDA Native Library

Python Package 清单不能覆盖镜像内的 Driver-Adjacent Library、NCCL、cuDNN、TensorRT 和自定义 `.so`。SBOM 应包含 OS Package、Language Package、Native Library、License 和 Source，漏洞修复时才能判断重建范围。

### Host 注入和镜像内容必须有清晰所有权

Host 提供 Kernel Driver 和匹配的 Driver User Library；镜像提供 CUDA Runtime、Framework 和应用 Library。Container Toolkit 按 Capability 注入必要 Host 文件。镜像不应携带会优先覆盖 Host `libcuda`/NVML 的非兼容副本。

所有权表应进入平台标准：Driver 由节点团队升级，基础镜像由平台团队维护，Framework 镜像由 ML Platform 发布，自定义 Extension 由应用团队构建。故障时按所有权和版本证据协作。

### 发布门禁必须验证最老和最新节点池

异构集群不能只在最新 GPU Canary 验证。测试矩阵至少覆盖每个 Compute Capability、Driver Branch、MIG/Full GPU 模式和关键网络路径。制品不支持旧节点时，应通过 Node Selector/Admission 阻止调度，而不是等 Runtime 报错。

发布顺序建议为：离线 Build 和扫描、最小 CUDA 测试、Framework/Extension、真实模型、单卡性能、多卡 NCCL、Canary 服务、扩大节点池。任何阶段失败都应保留旧 Digest 和配置以便回滚。

### 从 Host 到应用逐层更换最小变量

建立四个最小测试：Host `nvidia-smi`；官方最小 CUDA Container；目标 Framework 的 Device Test；目标模型或 Extension。前一层成功、后一层失败，即可把责任边界缩到二者之间。

| Host | CUDA Container | Framework | 初步边界 |
|---|---|---|---|
| 失败 | 未测 | 未测 | 硬件、Driver、Fabric |
| 成功 | 失败 | 未测 | Runtime 注入、Device Permission |
| 成功 | 成功 | 失败 | Framework Build、Library、Extension |
| 成功 | 成功 | 成功但模型失败 | 模型、Engine、Shape、业务配置 |

### 健康节点对照比反复重装更有信息量

同一镜像在健康节点成功、异常节点失败，优先比较 Driver、Firmware、Device Node、CDI、Topology 和 Host Library；所有节点都从新镜像开始失败，优先比较镜像 Digest、Framework 和依赖。

对照实验要确保 GPU 型号、MIG Mode 和 RuntimeClass 相同。把工作负载迁到另一代 GPU 成功，不能证明原节点仅是硬件故障，也可能是架构兼容问题。

### 临时修复必须注明失去的能力

禁用某 Library 优化、回退到 CPU、关闭 GDR、固定旧 Driver 或绕过 CDI 可以恢复可用性，但会改变性能、隔离或支持状态。事件记录需写明影响、适用节点、到期时间、永久修复和恢复验证，不能让诊断开关成为无主的长期配置。

## 第 10 章 · Driver 安装、升级回滚与分支治理

### 发行版 Package、Runfile 和 Driver Container 有不同所有权

| 模式 | 优点 | 风险和边界 |
|---|---|---|
| OS Package | 可进入包管理和安全更新 | Repository Branch 必须固定 |
| NVIDIA Repository Package | 版本选择完整 | 需治理 Repo 和签名 |
| Runfile | 独立安装直接 | 易绕过包管理并产生残留 |
| Driver Container | Operator 自动化节点交付 | 依赖 Host Kernel/Header 和启动流程 |
| Preinstalled Image | 启动一致且快 | OS Image 构建和升级成本 |

同一节点不要混用多种安装方式。Package DB、文件路径和卸载脚本互相不知道时，升级容易留下旧 Library 或模块。

### DKMS 和 Precompiled Module 解决不同构建问题

DKMS 在目标 Kernel 上构建模块，需要匹配 Header、Compiler 和 Build Tool；Precompiled Module 为特定 Kernel/发行版提供已构建制品，减少节点现场编译，但覆盖范围有限。

Kernel 自动升级若没有对应 Driver Module，节点重启后 GPU 消失。GPU Node Pool 应 Pin Kernel/Driver 组合，先在 Canary 验证再滚动。

### Open Kernel Module 与 Proprietary Module 有支持边界

NVIDIA 提供不同内核模块形态，支持的 GPU 代际和功能随 Driver Branch 演进。选择要依据目标 GPU、vGPU、Confidential Computing、发行版和厂商支持，不应只因“开源”或“新”直接切换。

切换模块类型需要完整重启和功能/性能回归，不能在同一 Boot 混加载。

### Secure Boot 要建立 Module Signing 链

Secure Boot 启用时，未受信任 Kernel Module 会被拒绝加载。安装成功但 `modprobe nvidia` 失败，应检查 Kernel Lockdown、Module Signature 和 MOK/企业签名流程。

关闭 Secure Boot 不是默认修复。生产应签名 Module、保护私钥、验证重启，并将签名证书生命周期纳入 Driver 升级。

### Production Branch 和 Feature Branch 服务不同风险偏好

Driver Branch 有不同生命周期和新硬件支持。长期生产集群优先支持周期与稳定性，试验节点池可使用更新 Branch 验证新功能。全公司只允许“最新版本”会让所有节点同时承担变化。

版本目录记录 Branch、发布日期、EOL、支持 GPU、最低 Kernel、CUDA 上限、Fabric Manager、vGPU/AI Enterprise 和已知问题。

### 升级前检查活跃 Context 和依赖组件

```bash
nvidia-smi --query-compute-apps=pid,gpu_uuid,process_name --format=csv
lsmod | rg '^nvidia'
uname -r
cat /proc/driver/nvidia/version
```

还要检查 Fabric Manager、OFED/GDR、Container Toolkit、DCGM、MIG 和 vGPU。升级 Driver 可能改变这些组件兼容性。

### 回滚必须准备旧 Kernel、Module、Package 和 Boot Entry

若新 Driver 依赖新 Kernel，单独降 Driver 可能无法启动；若 Package Repo 已清理旧版本，现场回滚会卡住。Canary 前缓存旧制品、验证 Bootloader Entry，并记录 Image/Digest。

### 驱动升级后验证性能和错误率

功能通过后继续验证 Clock/Power、P2P/NCCL/GDR、Framework、MIG 和真实模型。观察 XID、AER、NCCL Retry 与性能分布，避免仅以容器能启动宣布成功。

## 第 11 章 · Container Toolkit 配置与 CDI 运维

### nvidia-ctk 修改 Runtime 配置前要保存差异

Container Toolkit 可配置 Docker 或 containerd Runtime Handler。自动命令会改配置文件，生产执行前备份、Review Diff，并确认 Distribution/CRI 使用的实际路径。

```bash
nvidia-ctk runtime configure --runtime=containerd
```

这是会修改配置的命令，只能在维护/变更流程中执行，随后通常需要重启 Runtime；重启影响容器管理，应先评估节点工作负载。

### containerd Config Version 和 Runtime Handler 要匹配

Kubernetes Pod 的 RuntimeClass Handler 必须存在于 CRI Plugin 配置。配置写进 containerd 未读取的文件、缩进/版本错误或忘记重启，都会导致 Handler Not Found 或使用默认 Runtime。

```bash
containerd config dump
crictl info
kubectl get runtimeclass
```

对比 Effective Config，而不只看磁盘文件。

### CDI Spec 需要随设备和 MIG 变化刷新

CDI Spec 描述 Qualified Device Name、Device Node、Mount 和 Hook。GPU 更换、MIG 重配置或 Driver 路径变化后，旧 Spec 可能引用不存在设备。

```bash
nvidia-ctk cdi list
nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
```

生成命令会写文件，必须由 Operator/自动化统一管理，手工运行可能与控制器竞争。验证 YAML 语法、设备 UUID 和 Runtime 搜索目录。

### NVIDIA Container Runtime Capability 控制注入范围

Compute、Utility、Video、Graphics、Display 等 Capability 决定注入哪些 Driver Library/Device。最小化 Capability 可减少容器暴露面，但需覆盖应用需求。监控 Sidecar 可能需要 Utility，转码服务需要 Video。

## 第 12 章 · 框架、CUDA 与 Python 环境矩阵

### Framework Version 字符串不等于本地 Toolkit

PyTorch 的 `torch.version.cuda` 表示该 Build 对应的 CUDA Runtime 系列，不是 `/usr/local/cuda` 或 `nvcc` 版本。预编译 Wheel 运行时常用自带 Library；编译 Extension 才可能调用本地 Toolkit。

```bash
python - <<'PY'
import torch
print(torch.__version__)
print(torch.version.cuda)
print(torch.cuda.is_available())
print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "no gpu")
PY
```

### Conda、pip 和系统 Package 混装会产生重复依赖

同一环境用 Conda 安装 CUDA Library，再用 pip 安装携带另一套 Library 的 Wheel，可能因 Search Path 加载混合版本。基础镜像统一一种依赖策略，Lock File 和 `pip freeze` 之外还保存 Native Library。

### Framework Build 还受 C++ ABI 和 Python ABI 约束

自定义 Op、Triton Backend 和 Plugin 需要匹配 Python、Compiler、libstdc++/GLIBCXX 与 Framework ABI。`undefined symbol` 不总是 CUDA 问题。最小复现检查 ELF Dependency 和 Build Log。

### 多框架镜像会放大冲突和体积

把 PyTorch、TensorFlow、TensorRT、JAX 全部塞进通用镜像，会带来多套 Library 和更大漏洞面。按工作负载构建受控基础镜像，共享 OS/Driver 接口，不强求一个镜像覆盖所有场景。

## 第 13 章 · 推理服务发布与回滚

### Model Repository 的版本目录不自动代表发布策略

Triton 可加载多个模型版本，但哪一版接流量还由 Model Config、Gateway 和 Deployment 决定。版本目录、Engine、Tokenizer 和业务配置必须原子发布，避免权重与 Tokenizer 不匹配。

### Readiness 要等模型加载和 Warmup 完成

进程端口监听不代表 Engine 已加载。Readiness 检查目标模型可用，Startup Probe 允许大模型加载时间，Liveness 不应因正常长加载反复杀容器。

### Canary 同时比较质量、延迟和 GPU 资源

同一请求集比较输出质量、TTFT/TPOT/P99、Tokens/s、Error、显存、功耗和 Crash。新 Engine 若更快但占用更多 KV Cache，可能降低总体并发。

### 回滚要覆盖 Engine 与 Runtime 兼容

旧 Engine 未必能被新 TensorRT Runtime 加载。升级前验证“新 Runtime + 旧 Engine”的紧急回滚，或保留旧 Runtime Image 与 Engine 成对回滚。

## 第 14 章 · GPU 容器安全边界

### 设备访问等价于获得强 DMA 和计算能力

GPU Device 不是普通文件。容器获得 Driver IOCTL、Device Memory 和可能的 P2P 能力，攻击面包括 Kernel Driver 和同卡数据隔离。只给受信任工作负载，及时更新安全 Driver，并按共享模式评估租户边界。

安全评审应区分 Full GPU、MIG、MPS 和 vGPU：它们对地址空间、错误隔离、Reset 权限和跨租户侧信道的保证不同。对不受信任租户，优先使用有明确隔离承诺的虚拟化/分区方案，并禁止把宿主机 `/dev`、`SYS_ADMIN` 或调试接口一并暴露。

### Privileged 不是 GPU Pod 的必要默认值

标准 GPU 计算通过 Device Plugin/CDI 注入，不应要求整个 Pod Privileged。RDMA、Profiler 或调试所需 Capability 单独批准，使用专用 Namespace/ServiceAccount 和到期权限。

### 镜像签名和 Admission 防止未验证制品进入 GPU 池

GPU 节点昂贵且 Driver 权限高，生产只运行可信 Registry、Digest Pin、签名通过和扫描合格镜像。Admission 还校验支持的 GPU Node Selector、RuntimeClass、资源 Limit 和禁止危险环境变量。

### 模型与 Dataset 权限独立于镜像权限

可信镜像不代表可访问任意模型/数据。使用短期身份、只读 Mount、KMS 和 Audit；共享 GPU 方案还需评估显存残留和侧信道，不把软件限额误认为安全隔离。

## 第 15 章 · 软件栈标准化与发布评审清单

### 节点层标准

- 固定 OS、Kernel、Driver Branch 和安装方式；
- 记录 Firmware、Fabric Manager、OFED 和 Secure Boot；
- 管理 Device Node、CDI 与 Runtime Effective Config；
- 禁止自动无门禁 Kernel/Driver 更新；
- 保留 Canary、回滚 Image 和离线包；
- 节点上线运行健康、拓扑和性能基线。

### 镜像层标准

- Base Image Digest 固定；
- Framework/CUDA-X/Extension 版本锁定；
- 不携带 Kernel Driver；
- Builder 与 Runtime 分离；
- 生成 SBOM、签名和漏洞报告；
- 声明支持 GPU/Compute Capability；
- 提供最小 Smoke Test 与回滚 Digest。

### 应用层标准

- 启动记录版本、GPU UUID 和动态库；
- 暴露业务 SLI 与 CUDA/NCCL 首错；
- 支持 Graceful Stop 和 Checkpoint；
- 对 OOM、Device Lost 和 Peer Failure Fail Fast；
- 不把诊断变量固化为默认；
- 在发布门禁执行性能与数值回归。

### 硬件覆盖范围明确

列出 GPU 型号/Compute Capability、MIG/vGPU、节点 SKU 和最老/最新池。Image/Extension/Engine 对每类有测试或调度限制。

### Driver 下限和目标 Branch 明确

区分 CUDA Runtime 最低 Driver、Framework/Library 已知问题、FM/OFED/vGPU 配套。`nvidia-smi CUDA Version` 不作为唯一依据。

### Framework Build 来源可验证

官方/内部 Build、Python/C++ ABI、CUDA Library、目标架构、Extension Commit 和 Lock File。CPU/CUDA Wheel 不混淆。

### Native Library 解析经过检查

`ldd/readelf`、RPATH/RUNPATH、Host 注入和 Wheel/Conda 路径，无 Stub/旧 `libcuda` 覆盖。最小容器保存 Mapping。

### Image 供应链完成

Digest、SBOM、签名、漏洞/License、可信 Registry、Builder/Runtime 分离、无 Secret。旧 Digest 在回滚窗口可拉取。

门禁还应检查制品是否包含不应进入 Runtime Image 的编译器、凭据和 Driver Stub，并把扫描结果绑定到 Digest 而非可变 Tag。发布记录保留签名验证、SBOM 生成器版本和例外审批，到期后自动阻止继续部署。

### Runtime 注入模式固定

Docker/containerd、RuntimeClass、Hook 或 CDI、Capability、Device Permission 和 Effective Config。节点池不混合未经验证模式。

同一节点池应能回答“请求由谁解析、设备由谁注入、配置从哪里生效”。升级 Toolkit 或切换 CDI 前先在单节点保存 Effective Config 和最小容器证据，再滚动扩散；否则某些节点走 Hook、另一些走 CDI，会产生只在特定调度结果下复现的故障。

### CUDA-X 版本组合有业务证据

cuDNN/cuBLAS/NCCL/TensorRT/Plugin 的功能、性能、数值和 Workspace；新 Algorithm 变化记录。

证据应覆盖实际业务 Shape 和并发，而不是只跑库自带 Sample。对 NCCL 记录拓扑和 Transport，对 TensorRT 记录 Engine 构建参数，对 cuDNN/cuBLAS 记录精度与确定性设置；若性能变化来自算法选择，保留前后日志以便回归定位。

### Engine 与目标平台匹配

TensorRT/LLM Version、GPU Target、Precision、Profile、Parallelism、Plugin、Model/Tokenizer Hash 和兼容模式。

部署前先在每类目标 GPU 上加载 Engine，再执行代表性 Shape 的 Warmup 和长请求。Engine 加载成功但 Profile 不覆盖真实输入、Plugin ABI 不匹配或 KV Cache 预算不足，都会在流量上升后失败，因此这些条件必须进入发布检查而非只在构建阶段记录。

### 冷启动和 Cache 行为已测

Image Pull、JIT、Autotune、Engine/Model Load、Warmup，Read-Only/Cache Path 和并发副本启动。只测热缓存不通过弹性验收。

至少分别测首副本、缓存保留副本和节点重启后的冷启动，并记录每阶段耗时及 CPU、磁盘、显存峰值。扩容策略要给 JIT、Engine Load 和 Warmup 预留资源，避免多个副本同时启动把正常请求挤到超时。

### 单卡与多卡路径都回归

最小 CUDA、Framework、真实模型、P2P/NCCL/GDR（如使用），Topology 固定。多卡问题不能由单卡 Smoke 覆盖。

多卡回归要确认进程到 GPU 的绑定、P2P 可达性和实际 NCCL Transport，并记录单卡基线、Scaling Efficiency 与错误率。单卡通过而多卡失败时，优先查 Rank 映射、通信库和 HCA/拓扑，不要把问题归因于模型代码。

### 数值和模型质量已通过

Loss/Accuracy/输出、NaN/Inf、量化/校准、随机容差。性能收益不能豁免质量。

验收应固定输入集、随机种子和容差口径，并区分训练收敛曲线、离线推理输出和线上业务指标。出现差异时同时保存精度模式、库算法日志和校准数据版本，避免只记录“精度下降”这一无法复现的结论。

### Canary 和停止条件明确

代表 SKU/流量/训练阶段，观察 XID/Error/性能/P99，最大批次和自动停止。无代表业务的空闲 Canary 不够。

Canary 必须有明确的持续时间、样本量和停止阈值，例如错误率、P99、OOM、XID 或吞吐相对基线的变化。停止后保留节点、镜像、Engine 和请求样本，确保回滚或继续扩大范围都有证据可用。

### 回滚是完整软件组合

OS/Kernel/Driver/FM/Runtime/Image/Engine/Config/CRD 依赖，明确可降级与只能 Roll-Forward 项；演练旧制品加载。

回滚清单要标记不可逆变更，例如数据格式、CRD Schema 或已迁移的模型仓库。演练应在隔离节点完成一次从新组合回到旧组合的启动、加载和业务 Smoke，并测量恢复时间，而不是仅验证文件仍存在。

### 发布后持续观察兼容和资源

Crash/OOM/XID、Dynamic Loader、GPU/Memory、NCCL、吞吐/延迟、质量和节点池覆盖。窗口结束才关闭变更。

观察窗口内按镜像 Digest、节点池和工作负载版本切分指标，区分新版本引入的问题与既有基线噪声。发现异常时冻结扩大范围并保留首错日志、动态库映射和设备 UUID，窗口结束后再归档为版本基线。

## 第 16 章 · CUDA 互操作与 Driver Entry Point 兼容边界

### 图形和外部资源互操作依赖同一物理设备与显式同步

CUDA 可与 OpenGL、Vulkan、Direct3D 和 NvSci 等 API 共享 Buffer、Image、Memory Object 与 Semaphore。典型流程包含匹配 Device UUID/LUID、导出外部 Handle、在 CUDA 导入和映射资源、用外部 Semaphore 表达所有权与顺序，最后解除映射并释放。UUID 不匹配、Handle 类型/权限错误或缺少同步都会表现为初始化失败、数据损坏或 Hang。

容器或 VM 中使用互操作时，还要同时满足 GPU Device、显示/图形节点、IPC Handle、Driver Capability 和安全策略。无图形需求的训练节点不应为“兼容”默认暴露额外设备与权限。故障证据至少包含两侧 API 版本、设备身份、Handle 类型、同步点和最小复现。

### 动态 Driver API 获取不能绕过最低 Driver 能力

`cuGetProcAddress` 允许库在运行时获取不同版本或 Stream 语义的 Driver Entry Point，便于单一二进制适配多个 Driver；它只能获取当前 Driver 真正支持的能力，不能把旧 Driver 变成新 Driver。失败时记录 Symbol、请求 API Version、Flag、返回状态、实际 `libcuda.so` 路径和 Kernel Driver 版本。

这也是“镜像里文件都存在但功能仍不可用”的一种原因：容器用户态库声明了新 API，而 Host Driver 不提供对应入口。修复应回到经过测试的 Driver/CUDA/Framework 矩阵，不能通过放入另一份 `libcuda.so` 模拟 Kernel Driver 升级。

## 第 17 章 · 推理服务形态与请求执行路径

### 在线推理以分位延迟和可用性为中心

请求到达后立即处理，必须在 P50/P95/P99 和 Error SLO 内返回。GPU 容量不能长期跑到理论最大吞吐，否则小流量突发就造成 Queue 和尾延迟。

在线服务的容量单位应从“每秒请求数”改成带输入、输出长度的工作量。相同 QPS 下，长 Prompt 会增加 Prefill，长输出会长期占用 Decode Slot 和 KV Block；因此容量模型至少按 `model + input_bucket + output_bucket + service_tier` 分桶。入口记录到达率、取消率和 Deadline，运行时记录 Queue、TTFT、TPOT 与端到端分位，才能判断延迟预算究竟消耗在哪一段。

压测不能只找最高吞吐点。应逐级提高 Arrival Rate，直到某个分位 SLO、错误率或 KV 水位持续越界，再回退到稳定点并保留突发余量；这个点才是可对外承诺的安全吞吐。

### 离线推理以完成时间和单位成本为中心

请求可积累成大 Batch，使用可抢占/共享资源，失败按 Shard 重试。仍需数据幂等、输出完整和进度 Checkpoint，不等于没有 SLA。

离线作业的调度目标是完成时间、成本和可恢复性之间的平衡。Manifest 为每个输入分片提供稳定 ID，输出先写临时路径并以原子重命名提交，重试时根据已提交 ID 跳过成功分片。Checkpoint 需包含模型版本、Tokenizer、量化配置和输入游标，否则作业恢复后可能重复计算或产生不可比较的结果。

### 流式生成把一次请求变成长生命周期会话

首 Token 后持续占据 KV Cache 和调度 Slot。客户端断开、Backpressure、最大输出和 Timeout 必须释放资源。只按 QPS 估算会漏掉 Active Sequence Duration。

流式连接的生命周期应被显式建模：Admission 分配预算，Runtime 产生 Token，Gateway 转发并感知客户端取消，最终由统一清理路径释放 KV、Batch Slot 和连接。记录 `request_id`、`stream_id`、首 Token 时间、最后 Token 时间、取消原因和释放耗时，可区分客户端主动取消、网关超时与后端异常。

### 多模态推理增加预处理和显存波动

图像/音频解码、Vision Encoder 和不同分辨率改变 CPU/GPU Pipeline。模型 Server 前后可有独立 Preprocessor，监控区分阶段，避免把 CPU Decode 慢归因 GPU。

多模态请求的 Admission 不能只检查文本 Token，还要校验媒体数量、尺寸、采样率和编码格式。预处理阶段应限制并发与临时内存，必要时把解码放到独立 Worker，避免坏文件或超大图片拖住模型实例。Trace 至少包含 Decode、Encode、Model、Postprocess 四段，并把输入尺寸作为低基数分桶标签。

### Admission 在进入昂贵执行层前限制请求

```mermaid
flowchart LR
    A[Client] --> B[Gateway Auth and Quota]
    B --> C[Admission and Length Check]
    C --> D[Request Queue]
    D --> E[Batch Scheduler]
    E --> F[Model Instance]
    F --> G[GPU Runtime]
    G --> H[Streaming Response]
```

验证 Model、Input Shape、Context/Output Limit、Tenant Quota 和 Deadline。拒绝过大请求比让它进入 GPU 后 OOM 更可控。

Admission 的拒绝必须可解释且可观测：区分认证失败、配额不足、长度超限、无可用模型和过载保护，并返回不会触发无限重试的错误码。入口校验通过后仍需在 Scheduler 前再次检查动态 KV 水位，防止检查与执行之间的资源变化造成 TOCTOU 式 OOM。

### Queue 隔离不同模型、租户和优先级

单 FIFO 会让长请求阻塞短请求。可按 Model、Length Bucket、Priority 和 Tenant 分 Queue，再由公平 Scheduler 分配 Token Budget。高优通道要有限额，防止所有请求标高优。

Queue 的隔离边界应与资源账本一致：每个队列同时统计 Waiting Request、Waiting Token、Active Sequence 和预计 KV 增量。公平策略可使用加权轮询或租户配额，但必须设置单队列最大深度和老化时间，避免低优请求永久饥饿。排队原因、选中原因和拒绝原因应写入结构化事件，便于审计。

### Deadline Propagation 避免处理已超时请求

Gateway、Queue、Batcher 和 Backend 传递剩余 Deadline。请求在队列已超过客户端 Timeout 时尽早取消，释放 KV/Batch Slot；流式断开也要向 Runtime 传播 Cancellation。

Deadline 应作为单调递减的绝对时间戳传递，而不是每层重新设置固定超时。Batcher 合批前计算最早截止时间，若预计执行无法完成则拒绝或降级；Runtime 在每个 Decode Iteration 检查取消标志，避免已经超时的序列继续消耗 GPU。排障时对比各阶段的 `deadline_remaining`，可发现代理层、队列层和模型层的超时配置不一致。

### Backpressure 从 GPU Queue 反馈到入口

Queue 水位/等待超过阈值时限流、降级或返回可重试错误，不能无限堆积内存。Retry 需 Jitter 和预算，否则过载时形成重试风暴。

Backpressure 应沿调用链闭环：Runtime 暴露可接纳 Token/Sequence 数，Scheduler 转成队列阈值，Gateway 再执行并发限制、429/503 或较小输出上限。重试只对明确的瞬态错误开放，并携带原始请求 ID、剩余 Deadline 和重试次数；超过预算后直接失败，避免客户端与服务端同时放大流量。

## 第 18 章 · Prefill、Decode、调度与 KV Cache

### Prefill 处理完整 Prompt 并构建 KV Cache

Prompt Token 可并行计算，矩阵较大，通常更能利用 Tensor Core。长 Prompt 占用计算时间和一次性 KV 增长，影响 TTFT 和同批其他请求。

Prefill 的排障应把 Tokenizer、数据拷贝和模型计算分开计时。输入长度分布突然变化时，即使 GPU 利用率上升，TTFT 也可能先恶化；因此 Scheduler 需要限制单次 Prefill Token Budget，并在长 Prompt 队列中采用 Chunked Prefill。Prefill 完成后才会产生可复用的 KV，任何中途取消都应释放已分配的 Block。

### Decode 每步读取权重和已有 KV 生成新 Token

每 Sequence 每步工作小且串行依赖上一个 Token，容易受 Memory Bandwidth 和调度开销限制。通过 Continuous Batching 聚合多个 Sequence 提高并行。

Decode 诊断关注每步有效 Token 时间，而不是只看一次请求总耗时。Batch 中序列长度差异、KV Block 不连续、抢占恢复和同卡邻居都会增加 TPOT；记录每次迭代的 active sequence、scheduled token、KV 命中和 Kernel/DRAM 指标，才能判断是调度空洞还是带宽瓶颈。输出达到上限或客户端取消后，序列必须在同一迭代从 Batch 和 Cache 中移除。

### Chunked Prefill 减少长 Prompt 独占

把长 Prefill 切 Chunk 与 Decode 穿插，可保护活跃请求 TPOT，但增加调度和重复/边界开销。比较 TTFT、TPOT、吞吐和公平性，不只看总 Token。

Chunk 大小应按服务等级和输入长度配置，过大仍会阻塞 Decode，过小则增加 Kernel 启动与调度开销。压测时固定模型和输出分布，分别比较无切分、短 Chunk、长 Chunk 的 TTFT/TPOT P99、Preemption 次数和 GPU 利用率；只有在目标 SLO 下收益稳定时才作为默认策略。

### Prefill/Decode Disaggregation 是容量与网络取舍

Prefill 节点优化计算，Decode 节点优化 Memory/Latency，中间需传 KV Cache。KV 传输量和网络延迟可能抵消收益。设计独立故障、路由和 Backpressure。

拆分后请求状态跨越两个池：Router 必须绑定同一模型、Tokenizer、Adapter 和 KV 格式版本，传输失败时不能把半成品 Cache 当作可恢复状态。容量规划同时计算 Prefill 算力、Decode 带宽、KV Transfer 带宽和暂存空间，并为任一池不可用定义降级路径，例如回退到合并式实例或拒绝新长请求。Trace 要跨 Router、Prefill、Transfer、Decode 传播。

### Scheduler 用 Token Budget 而非只用请求数

一个长 Prompt 与短请求成本不同。每迭代限制 Prefill Token、Running Sequence、KV Block 和 Batch Token；指标暴露 Scheduled/Waiting/Preempted Token。

调度器可以把预算拆成硬约束和软目标：硬约束保护显存与单步执行时间，软目标在短请求优先、租户公平、Deadline 和吞吐之间排序。每次选择记录队列、预计 Token、预计 KV 和跳过原因，发生 P99 退化时可复盘调度决定，而不必猜测“GPU 不够”。

### KV Cache 是并发和上下文的主要动态显存

权重加载后相对固定，KV 随 Active Token 增长。容量按 Model Layer、KV Head、Head Dimension、Datatype、Sequence 和并发估算，并由 Runtime 实测校准。

可用显存不能简单用 `总显存 - 权重` 估算，还要扣除 Runtime Workspace、通信 Buffer、CUDA Context、碎片和安全余量。容量评估应按输入/输出长度组合测量每 Sequence 的 KV 增量，再把 Active Sequence、并发上限和故障迁移后的峰值代入；启动时预留的显存与真正可分配 Block 要分别监控。

### Paged KV Cache 减少连续分配与碎片

把 KV 划分固定 Block，逻辑 Sequence 映射多个物理 Block，便于动态增长/释放和共享 Prefix。仍会有最后 Block 内部碎片和 Metadata 成本。

Paged 管理把“增长”变成 Block 分配，把“结束”变成回收映射，因此可避免大块连续显存申请失败。排障时同时查看 Free Block、Largest Contiguous Allocation、Fragmentation 和 Metadata，不能仅凭 `nvidia-smi` 的总使用量判断 Cache 是否耗尽。Block 大小需要在上下文长度、内部碎片和管理开销之间实测选择。

### Prefix Cache 复用相同 Prompt 前缀

系统提示或公共文档前缀可复用 KV，降低 Prefill。Cache Key 包含 Model/Tokenizer/Prompt/Adapter/配置，租户敏感内容不能跨安全域复用。

Prefix Cache 的命中只表示前缀状态可复用，不代表完整请求可以跳过 Decode。发布或配置变更时应使旧 Key 失效，避免不同 RoPE、Tokenizer、Adapter 或安全策略误共享。监控 Hit Rate、节省的 Prefill Token、Eviction 和跨租户拒绝数，并把缓存命中收益计入容量模型。

### KV Swap 到 Host/Storage 牺牲延迟换容量

低优 Sequence 可把 KV 移到 Host，恢复时经 PCIe/NVLink 传回。适合可容忍延迟或避免直接 Reject；在线关键流量需限制 Swap，监控 Bytes/Latency。

Swap 是以延迟换容量的明确降级，不应作为隐式的无限扩容。进入 Swap 前保存 Sequence 状态、优先级和 Deadline，恢复时先检查请求仍有效；Host 内存和 PCIe 带宽也要设置租户配额，否则大量换入换出会形成抖动。压测应记录 Swap 入/出带宽、排队时间、恢复成功率和 TPOT 尾部。

### Preemption 策略决定谁释放 KV

资源不足可 Recompute、Swap 或 Reject。按 Priority、已生成长度、Deadline 和重算成本选择。反复 Preempt 同一请求会饥饿，设置次数/时间上限。

Preemption 必须与 KV 生命周期和计费关联：被抢占序列从 Active 变为 Waiting/Swapped，重新运行的 Prefill 或恢复成本不能重复计入有效吞吐。调度器应保留抢占原因、受影响租户、恢复时间和累计次数；超过上限时转为明确 Reject 或降级，避免请求在系统内无界循环。

### KV Cache 指标连接内存与请求

观察 Total/Used Block、Hit Rate、Eviction、Swap、Preemption、Active/Waiting Sequence、Token Length Distribution 和 OOM。物理 Memory Used 高可能是正常预留，关键是可分配 Block 与请求 SLO。

告警按“容量耗尽”和“效率下降”分开：Free Block/Admission Reject 触发容量告警，Hit Rate 下降、Eviction 激增或 Fragmentation 上升触发效率告警。指标保留 Model、Instance、GPU UUID 等有限维度，并用 Trace 关联具体请求，防止高基数 Prompt 或租户标签拖垮监控系统。

## 第 19 章 · 模型制品、通用服务与大模型运行时

### 权重格式决定加载链和运行时

Framework Checkpoint、SafeTensor、ONNX、TensorRT Engine 等处于不同阶段。转换过程记录 Source Hash、Tokenizer、Config、Precision、Parallelism 和 Tool Version。

制品目录应区分“可转换源”和“可直接加载 Engine”，每个版本附带 Manifest、校验和、输入输出 Schema 及所需 GPU Compute Capability。部署前在与生产一致的 Runtime Image 中做一次离线加载与最小推理，失败时先比较制品哈希、动态库和配置，而不是直接重启服务。

### Weight Sharding 对应并行 Rank

Tensor Parallel 每 Rank 加载权重分片，Shard 数/布局要匹配 TP。对象存储下载可并行，但所有 Rank 同时拉取会冲击后端；使用节点 Cache 和 Manifest。

Rank 到 Shard 的映射必须确定且可审计，重启或扩缩容不能依赖目录遍历顺序。下载器先拉 Manifest，再按校验和验证分片，失败分片独立重试；节点缓存采用临时目录加原子 rename，避免 Poll 模式把半文件当作完整模型。启动日志记录 Rank、Shard ID、字节数和耗时。

### 量化降低权重/KV 占用但改变质量与 Kernel

INT8/INT4/FP8、Weight-Only 或 KV Quantization 的硬件/Library 支持不同。验收按业务数据比较质量、TTFT/TPOT、Throughput、显存和 Power。文件变小不保证 Runtime 更快。

量化变更应拆成三个独立变量：权重表示、激活/算子 Kernel、KV 表示。某些配置虽然减少 HBM，却因反量化或 Kernel 不匹配增加计算时间；因此发布清单要锁定 Calibration 数据、量化工具版本、Fallback Kernel 和质量基线。对长上下文、短请求和高并发分别测量，避免平均值掩盖尾部退化。

### Engine Build 是可重复的发布步骤

Build Environment 固定 GPU Target、TensorRT、Plugin、Profile、Workspace 和 Calibration。产物签名/Checksum，记录兼容矩阵。禁止在每个生产 Pod 启动时临时构建大 Engine。

Engine 构建应在 CI 或专用构建节点完成并缓存，运行时只做校验、映射和 Warmup。构建输入和输出写入可复现 Manifest；同一模型在不同 GPU Target 上生成的 Engine 不可混用，兼容性检查失败应在 Readiness 前暴露。发布时保留旧 Engine，便于双向回滚和差异诊断。

### LoRA/Adapter 增加多租户模型组合

Base Model 共享，Adapter 按请求/租户加载。Cache、并发 Adapter 数、切换成本和权限进入容量；错误 Adapter/Tokenizer 组合会产生质量问题而非 CUDA Error。

Adapter 路径需要把授权和资源检查放在加载前：校验租户是否能使用该 Adapter，确认其基模型、Tokenizer 和精度匹配，再决定从 Host/节点 Cache 加载。对 Adapter 数量设置上限并记录命中、驱逐、切换延迟和失败原因；质量 Canary 应覆盖 Adapter 组合，因为这类错误通常不会表现为显存或 CUDA 异常。

### Model Repository 用配置声明输入、实例和版本

目录含 Model Version 和 `config.pbtxt` 等配置。Input/Output Shape、Datatype、Batch、Instance Group 与 Backend 必须一致。Auto-Complete 方便开发，生产显式配置便于审查。

Repository 发布采用不可变版本目录：先上传完整版本和校验信息，再通过原子指针或显式 Load 切换。配置审查重点是输入维度、可选字段、动态 Batch 上限、Instance Placement 和 Backend；配置与 Engine 不匹配时应在加载阶段失败，而不是等首个真实请求触发。

### Instance Group 决定每 GPU 的模型副本

更多 Instance 可并发处理，却复制权重/Workspace 并争用 HBM/SM。阶梯测试 1、2、更多实例，观察吞吐、P99 和 Memory；不按 GPU 空闲率盲目增加。

Instance 数量应由阶梯压测和显存账本共同决定。每增加一个实例，记录权重常驻、Workspace 峰值、KV 上限和 CUDA Context；当吞吐增益变小而 P99 或 OOM 风险上升时停止扩容。多模型同卡时还要把实例启动顺序和释放顺序纳入测试，避免冷启动期间瞬时超卖。

### Dynamic Batching 有 Preferred Size 与 Delay

Preferred Batch 利用优化 Engine，Max Queue Delay 等待合批。低流量时等待可能直接增加 P99。按流量档位测试，必要时不同 SLA 使用独立实例/Queue。

Dynamic Batching 的延迟预算必须显式包含等待时间。Scheduler 记录每个请求入队、入 Batch 和开始执行时间，才能验证 `Max Queue Delay` 是否兑现；Preferred Size 不是硬性必须达到的数量，低流量时应按截止时间提前发车。不同优先级或长度分桶使用独立队列，避免大 Batch 把短请求困住。

### Ensemble 把预处理、模型和后处理串成图

减少客户端往返并统一版本，但任一阶段错误影响整体。指标按 Component 分解 Queue/Compute，避免只看 Ensemble 总延迟。

Ensemble 的每个步骤都应有输入输出 Schema、超时和错误映射。预处理成功而模型失败时，重试策略不能重复执行有副作用的后处理；发布时对组件版本做整体锁定，并用 Trace 的 `model_name + version + component` 定位瓶颈。若某一阶段资源类型不同，可拆成独立服务并保留相同的请求关联 ID。

### Model Control Mode 决定加载行为

Poll、Explicit 等模式对版本变更和资源峰值不同。显式 Load/Unload 更可控，但控制 API 权限严格；Poll 目录更新需原子发布，防止半成品被加载。

生产环境通常将模型控制操作与数据面权限分离：服务账号只能读取已批准版本，发布控制器负责 Load/Unload 并等待 Ready。Poll 模式要设置扫描周期和失败重试上限，Explicit 模式则把操作记录到审计日志；任何模式都必须定义加载失败后的旧版本保留策略。

### Continuous Batching 是 LLM Runtime 的核心能力

每 Decode Iteration 重组 Batch，新请求加入、完成请求退出。相比静态 Batch 提高利用，但调度决策直接影响公平和尾延迟。

Continuous Batching 的状态机至少包含 Waiting、Prefill、Decoding、Preempted、Completed 和 Cancelled。每次迭代只在资源账本允许时加入新序列，并在完成/取消后立即回收 KV；状态转换和迭代号写入 Trace，排查“请求消失”或重复生成时可重建完整路径。公平策略要同时限制单租户 Active Sequence 与 Token Budget。

### Tensor Parallel Group 优先放同一 NVSwitch 域

每层多次 Collective，对延迟敏感。Pod 请求完整 GPU Group，记录 Rank/NCCL；跨节点 TP 只有在模型/系统明确设计时使用。

部署前验证 TP Group 的 GPU UUID、NVLink/NVSwitch 域和 HCA/Rail 映射，启动后从 NCCL 日志确认实际拓扑。跨节点 TP 时应把链路带宽、重试和单节点故障纳入 SLO；任一 Rank 退出通常会使整个请求组失败，Gateway 需摘除不完整实例而不是继续接流量。

### Pipeline Parallel 适合超出单节点模型但增加 Bubble

Stage 放在节点/设备，Activation 传输。在线请求 Micro Batch 与延迟约束限制填充程度。计算不均或网络抖动放大 P99。

Pipeline 切分先按每 Stage 的权重、Activation、通信和目标 Batch 计算显存，再用时间线检查 Bubble。在线场景不能盲目增加 Micro Batch 来填洞，因为它会增加排队和首 Token 延迟；应分别测量 Stage Compute、P2P Wait、Bubble 和端到端分位，并为单 Stage 故障定义整组重建策略。

### Speculative Decoding 用额外计算减少大模型步骤

Draft Model 生成候选，Target Model 验证。收益由接受率、Draft 成本和请求长度决定；增加模型权重/调度复杂度。质量必须与基线一致。

Speculative Decoding 的验收指标包括平均接受 Token、每步验证成本、TTFT/TPOT 和拒绝率。接受率低时，额外 Draft 计算会抵消收益，调度器应允许按模型、长度或租户关闭该策略。Shadow 或 Canary 只比较性能还不够，需对相同输入校验输出约束、停止条件和安全策略。

### Disaggregated Serving 改变故障和扩缩容单位

Router、Prefill Pool、KV Transfer、Decode Pool 各自扩展。任一层过载会 Backpressure；KV 协议/版本和网络是新兼容矩阵。观测 Trace 跨所有组件。

拆分后的扩缩容顺序应由瓶颈池决定，并设置 Transfer Queue 的上限和超时。池之间使用带版本的 KV 元数据、校验和与租约，接收端拒绝不兼容或过期的 Cache；故障恢复时可以丢弃 KV 并重新 Prefill，但必须把额外成本反映到 TTFT SLO。发布前用单池故障和网络抖动演练路由降级。

## 第 20 章 · Kubernetes 推理部署与 GPU 多租户

### Deployment 适合无状态路由但模型副本有状态资源

Pod 可重建，但权重/Engine/KV Cache 和 Warmup 有成本。Rolling Update 的 `maxSurge` 可能同时加载新旧模型导致 GPU/Storage 不足；设置节点容量感知策略。

Deployment 的滚动策略必须和模型启动时间、显存峰值及可用副本绑定。更新前计算旧副本、Surge 副本、缓存下载和 Warmup 的联合峰值；没有余量时采用分节点蓝绿或先扩容节点池。Pod 被重新调度后不应假设 KV 可恢复，Readiness 要在 Engine、权重和最小 Warmup 完成后才接流量。

### Startup、Readiness 和 Liveness 分别设计

Startup 容忍下载/加载/预热；Readiness 表示目标模型能接流量；Liveness 检测不可恢复死锁，不把暂时 Queue 高或加载慢当进程死亡。

三类探针应使用不同的观测面和超时预算：Startup 只保护初始化窗口，Readiness 检查模型版本、GPU 绑定和关键依赖，Liveness 检查进程是否能推进心跳或迭代。探针失败事件要带版本、GPU UUID 和最近 XID/加载错误，避免平台只看到反复重启而丢失根因。

### PodDisruptionBudget 不创造额外容量

PDB 限制自愿驱逐，但节点故障仍中断。副本跨 Node/Rack，预留 N+1，维护先确认可用副本和流量。

执行维护前先把目标副本标记不可调度并等待流量排空，再确认剩余副本在故障后仍满足安全吞吐。PDB 只表达驱逐约束，不保证 GPU 供应或新 Pod 能启动；因此 Runbook 还要检查节点池库存、模型缓存和回滚容量，并记录实际不可用时间。

### HPA 指标应领先于 GPU 饱和

GPU Utilization 到 100% 才扩容太晚。使用 Queue、Waiting Token、TTFT、KV 水位和 Arrival Rate，结合模型加载时间预测。缩容保护 Active Stream 和 Warm Cache。

扩容信号应领先于 SLO 违反：用排队增长率和模型加载/预热耗时估算“现在扩容能否赶上需求”。缩容需满足连续稳定窗口、无 Pending/Active Stream、KV 水位低且有可用 Warm Spare；否则宁可保留余量。扩缩容事件记录期望副本、实际 Ready 时间和未满足原因，便于校准预测。

### Node Auto-Scaling 受 GPU 供应和冷启动约束

云配额/库存、本地无动态硬件、节点 Provision、Driver 和模型预热决定分钟级甚至更长。突发容量靠 Warm Node/Pod、流量降级和限流，不只靠 Auto-Scaler。

Node Auto-Scaling 的容量声明应区分“已申请”“节点 Ready”“GPU 可用”“模型 Ready”四个状态。任何阶段失败都要停止继续放大请求，并把配额、库存、驱动、镜像、权重下载分别计数；否则控制器会在 GPU 实际不可用时不断创建节点。对长冷启动服务，预留少量 Warm Node 往往比追求零闲置更可靠。

### Service/Gateway 做连接排空

Pod Termination 先停止新请求，等待流式请求或按 Deadline 终止，再释放 GPU。Grace Period 按最大允许生成时间与业务策略，不无限等待。

排空流程要有可验证的阶段事件：Endpoint 移除、Gateway 停止派发、Active Stream 降至零或达到截止时间、Runtime 取消剩余序列、最后才释放 GPU。若 Grace Period 到期，强制终止的请求需带原因和版本标签，避免被误记为模型错误；维护期间应持续观察替代副本的 Queue 和 P99。

### 多模型共享先计算权重常驻和动态峰值

总权重、各 Engine Workspace、KV Cache 和请求 Buffer 同时存在。某模型低流量也可能长期占显存。支持按需 Load/Unload 时测冷启动和抖动。

多模型容量表应同时记录常驻和动态部分：权重/Engine 是基线，Workspace、KV、预处理 Buffer 和通信内存随流量增长。按模型设置最小/最大实例、加载优先级和驱逐策略；驱逐前确认没有 Active Stream，并把重新加载耗时纳入弹性 SLO。节点级总账与 Runtime 自报账本定期对账，发现“显存已满但 Block 仍有余量”时优先检查碎片和外部进程。

### MIG 为模型副本提供硬件资源分区

适合显存/算力需求匹配 Profile 且需要稳定隔离的小模型。Profile 固定会产生碎片，Media Engine/功能支持按代际核对。

MIG 规划先把模型的 HBM、SM、Copy/Decode 等需求映射到可用 Profile，再决定实例数量；无法整除的剩余资源就是结构性碎片。切换 Profile、重启或升级驱动可能需要重新创建实例，发布 Runbook 要包含迁移和回滚窗口。验收时用邻居压力验证显存、算力和错误隔离，而不是只检查资源对象存在。

### HAMi 为 Kubernetes 小模型提供细粒度份额

显存/Core 限制提高密度，但 P99 受邻居和软件 Hook 影响。相同信任域、可容忍抖动的服务先试点；关键租户使用更强隔离。

HAMi 的份额是调度与运行时约束，不等同于硬件隔离。平台需要核对设备插件、Hook、驱动和 Runtime 版本，并为每个共享资源暴露限额、实际使用、拒绝和邻居信息。试点服务设置独立 SLO 与回退到 Full GPU 的路径，关键租户不要把软件限额当作合规边界。

### Time-Slicing 适合突发低占用而非显存硬保证

每个模型仍可申请大量显存，长 Kernel 干扰邻居。平台给共享 Resource 独立 SLO 和监控，不能与 Full GPU 同名同价。

Time-Slicing 更适合短突发、低显存工作负载。调度器应限制单次 Kernel 或请求的占用时间，并监控上下文切换、邻居 P99、OOM 和抢占延迟；长 Kernel 或持续高负载模型应迁移到独占/MIG。资源目录和计费标签明确标示共享等级，避免用户误以为获得固定 HBM 与吞吐。

### 租户公平按 Token/时间而非只按请求数

长请求消耗更多 GPU 和 KV。Quota 可限制并发、Input/Output Token、GPU Time 和优先级；拒绝/排队原因可见，防止一个租户占满 Cache。

公平性检查既看每租户获得的 Token/秒，也看等待时间、抢占次数和错误率。配额变更需经过审计，优先级只能在预算内生效；高优队列仍应有最大并发和 Token 上限。跨模型共享 Prefix 或 Adapter 时，把租户隔离域纳入 Cache Key 和权限判断。

## 第 21 章 · 推理 SLI、SLO 与容量

### 指标分入口、调度、运行时和 GPU 四层

| 层 | 指标 |
|---|---|
| Gateway | Request、Error、Deadline、Tenant |
| Queue/Scheduler | Waiting、Batch、Token、Reject |
| Runtime | TTFT、TPOT、KV、Prefill/Decode |
| GPU | SM/Tensor/DRAM、Memory、Power、XID |

Trace 连接 Request 到 Model Instance/GPU UUID，Metrics 保持低基数。

四层指标应共享时间窗口和请求标识：Gateway 的请求数能与 Scheduler 的 Accepted/Rejected 对账，Runtime 的 Token 数能与计费和 GPU 时间对账，GPU 采样则用于解释执行健康而非直接作为用户 SLO。Exporter 断连、采样延迟和标签爆炸本身也要告警，否则“无数据”会被误判成系统空闲。

### 安全吞吐是满足所有 SLO 的最大稳定到达率

逐级加载至 TTFT/TPOT/Error/KV 任一接近边界，取更保守稳定点并乘安全系数。峰值一次成功不是容量。

容量试验至少覆盖冷缓存、热缓存、不同输入输出长度和共享邻居四种状态。每个点持续到队列、KV 和温度进入稳态，再记录有效 Token、错误/取消、功耗和恢复时间；短时间冲到高吞吐后立即停止不能作为承诺。容量结果应带模型版本、Engine、GPU 类型、并行度和 Runtime 配置。

### Headroom 同时覆盖突发和故障

```text
Required Capacity
  = Peak Forecast
  + Burst Margin
  + Largest Accepted Failure
  + Maintenance Capacity
```

不同 Region/Model 可共享部分余量，但相关故障不能重复计算。

Headroom 由工作量突发、最大单故障、维护迁移和冷启动窗口共同决定。共享余量必须注明故障域，不能把同一节点池的容量同时计入两个互斥 Region；每次节点或模型变更后重算，并将“可用但尚未 Ready”的容量单独列出。

### SLO 按长度和服务等级分桶

长上下文天然更慢，统一阈值要么误报要么放宽短请求。定义 Input/Output Bucket 和 Priority SLO，同时提供全局用户视角。

分桶阈值要有样本量下限和合并规则，避免低流量桶产生虚假 P99。除 TTFT/TPOT 外，还要定义完整请求成功率、流式中断率和超时归因；仪表盘同时展示分桶与总体结果，防止通过改变流量组成“优化”指标。

### Error Budget 控制模型发布和超售

错误预算快速消耗时停止 Engine/Driver 更新，降低共享 Replica 或收紧 Admission；稳定后再试验。容量不足和软件错误分别归因。

预算消耗事件应关联版本、GPU 故障域、请求长度和租户，区分可回滚的软件回归、容量过载和外部依赖错误。冻结发布不等于停止修复：先恢复安全吞吐和观测，再用小流量 Canary 验证修复，保留明确的解除条件。

## 第 22 章 · 推理故障排查、Canary 与回滚

### TTFT 高先分 Queue 与 Prefill

Queue 高看容量/Batch/租户；Queue 低而 Prefill 高看 Prompt、算子、Tensor Core、Clock 和 TP/NCCL。网关总延迟还需减去 Network/Tokenizer。

现场先按同一 `request_id` 拆出 Gateway、Queue、Prefill 和首 Token 时间，确认高延迟是否在进入 GPU 前已经发生。随后固定输入长度和并发做单请求/小批次对照，比较 Tokenizer、H2D、Kernel、NCCL 和 Clock；只有在 Prefill 阶段确认变慢后才调整 Tensor Parallel 或 GPU 配置。保留异常请求的长度、版本和实例信息，避免用平均值覆盖长 Prompt。

### TPOT 高检查 Decode、KV 和共享干扰

DRAM Activity、Batch Sequence、KV Block、Preemption/Swap、同卡邻居和 Clock。若只有长 Context 退化，按长度重现；所有请求退化看 Runtime/硬件。

TPOT 排障要关注每次 Decode Iteration 的等待来源。若 Active Sequence 上升而 DRAM 接近上限，优先检查 KV 布局、Batch Token 与量化 Kernel；若 Sequence 不变但 P99 恶化，比较 GPU Clock、Throttle、邻居进程和 NCCL。将重现结果与无共享 Full GPU 基线对照，再决定是调度、模型配置还是硬件隔离问题。

### OOM 后限制坏请求而不是只重启 Pod

保存 Model/Engine、Input/Output Limit、Concurrent Sequence、KV/Workspace 和失败申请。修复为 Admission、容量或 Engine 配置；重启只清状态，复发请求仍会 OOM。

OOM 现场应先摘流并保留 Runtime 日志、显存账本、请求长度和最后一次成功配置，再清理实例。按“静态权重不足、Workspace 峰值、KV Block 耗尽、碎片、外部进程”分类修复；临时降低并发或输出上限要有有效期和回滚条件。若无法确认根因，不要通过无限重启掩盖复发。

### Model Load 失败检查制品、兼容与存储

Checksum/Manifest、权限、下载完整、TensorRT/Plugin/GPU Target、显存和 Cache。健康旧版本能加载则比较新制品；所有版本同节点失败看 Storage/Driver。

加载失败的最短路径是：校验制品完整性，确认 Runtime Image 与动态库，确认 GPU Target/Plugin，检查节点缓存和剩余显存，最后才看业务请求。把每一步的命令输出和版本哈希归档到同一证据包；同一制品在健康节点成功、故障节点失败时，优先隔离节点而不是回滚模型。

### CUDA/XID 导致副本失败时隔离节点

Gateway 摘流、保存 GPU UUID/XID/请求范围，Cordon 节点并启动健康副本。不要在同一坏节点 CrashLoop 消耗流量。恢复需 DCGM/基准。

隔离动作要有状态记录：节点从 Serving 变为 Draining/Cordoned，受影响副本、XID 时间线、最后请求和替代副本 ID 一并保存。恢复前执行 DCGM/字段诊断和最小推理基准，确认错误计数、时钟和链路稳定；未通过则保持隔离并升级硬件工单。

### 请求成功但结果异常进入数值与版本路径

比较 Model/Tokenizer/Adapter/Quantization、Engine、随机参数和输入；硬件 ECC/XID 仍检查。性能监控不能替代质量 Canary。

结果异常先用固定输入、随机种子和采样参数复现，再做二分：权重/Tokenizer、Adapter、量化、Engine/Runtime、GPU/驱动。对生成质量记录参考答案、约束命中和安全评估，不把“请求成功”当作模型正确；任何变更都要保留可回滚组合。

### 发布单元包含完整运行组合

Model Weight、Tokenizer、Engine、Plugin、Runtime Image、Config、Prompt Template 和 Admission Limit 共同版本化。只回滚权重可能仍使用不兼容 Engine。

发布清单应产生一个不可变 Release ID，并能从请求日志反查全部组件。上线前验证 Manifest、兼容矩阵、显存峰值、Warmup 和回滚制品；控制面先加载新版本并做健康/质量检查，数据面再切换流量。任一组件无法回滚时，不应宣称发布可逆。

### Shadow 验证不影响用户但消耗容量

复制请求给新版本，不返回结果；比较质量/延迟，注意隐私、双倍计算和下游副作用。生成模型输出不应触发真实外部操作。

Shadow 流量应限速并单独计入 GPU、KV、存储和下游配额，避免把影子负载误算为生产容量。脱敏或采样输入，禁止让模型调用真实写入型工具；结果只写入隔离存储。对比时按长度、租户和区域分层，记录新旧版本的 TTFT/TPOT、错误、质量和资源差异。

### Canary 先小流量和代表性长度

随机 1% 可能遗漏长上下文/关键租户，按 Length/Priority/Region 取样。停止条件包含 Error、P99、OOM/XID、质量和资源。

Canary 的放量步骤和自动停止条件写入发布控制器，任何指标越界都能冻结扩量并保留最近窗口。样本不足时不自动判定成功；先等待代表性长度和流式请求覆盖，再比较同一时间段的新旧版本。Canary 期间同步验证日志、Trace、计费和告警是否带有新版本标签。

### 蓝绿发布需要双份显存/节点容量

新旧同时加载可快速切换，但大模型容量昂贵。可按节点池蓝绿或 Rolling+Warm Spare，容量模型显式计入发布峰值。

蓝绿切换前验证双份权重、Workspace、KV 和模型缓存的峰值，确认故障回退仍有 N+1 余量。若容量不足，采用按节点池迁移或小批 Rolling，并把最长流式请求的排空时间纳入窗口；切换后旧池保持只读观察直到新版本通过质量与错误预算检查。

### 回滚后继续观察 Cache 和长连接

旧请求可能仍在新 Backend，Prefix/Engine Cache 可能残留。排空、确认流量版本、清理不兼容 Cache，并验证 P99/质量恢复。

回滚完成的判据包括：流量权重回到旧 Release ID、Active Stream 排空或明确终止、旧 Engine/Prefix Cache 命中正常、Queue/TTFT/TPOT 和质量回到基线。回滚期间冻结相关配置变更，保留新版本失败证据，避免恢复后无法复盘。

## 第 23 章 · 成本、能效与服务等级

### 成本按满足 SLO 的 Token 计算

```text
Cost per Useful Token
  = GPU and Platform Cost / Successful Tokens within SLO
```

失败、超时和用户取消不算有效产出。更高峰值但 P99 失败多的配置可能更贵。

成本分摊至少包含 GPU/节点时间、模型加载与缓存、存储、网络、控制面和失败重试。按 Model、Service Tier、Tenant 和 Input/Output Token 计算有效 Token 成本，同时报告被拒绝、超时、取消和 Shadow Token，防止把无效工作隐藏在平均值里。

### GPU 利用率最大化不等于成本最小

把 Queue 堆满可提高利用却违反延迟。在线目标是在 SLO 下获得最高安全吞吐；剩余余量是可靠性成本。

优化时用“有效 Token/秒”和 SLO 违反率成对看，而不是单看 SM 利用率。保留的 Headroom 用来吸收突发、节点维护和热迁移，其成本应写入服务等级定价；当队列变长但有效吞吐不再增长时，应主动降载或扩容。

### 量化和共享降低成本但改变质量/隔离

每个优化记录质量变化、P99、可用性和运维复杂度。低价服务等级可使用更激进方案，关键等级保守。

量化、Time-Slicing、HAMi、Prefix Cache 等优化分别改变质量、隔离、容量或恢复路径。发布卡片中列出适用模型、禁用条件、监控指标和回滚开关，并让租户选择明确的服务等级，而不是在同一资源名下隐式混用。

### 能效比较完整请求生命周期

测 Idle、Model Load、Prefill、Decode 和 Cooling 分摊。Power Limit 下降若延长请求占用，需看 Joules per Useful Token。

能效实验固定输入输出长度、并发和冷/热缓存状态，分别记录 GPU 功率、节点功率、完成 Token 和时间。把预热、空闲 Headroom、失败重试和批处理等待分摊到有效 Token，才能比较不同精度或 GPU 类型的真实成本。

## 第 24 章 · 推理平台验收与日常运营

### 功能验收覆盖长度、批量和流式

最短/最长输入输出、并发、取消、Timeout、Streaming、错误输入、模型版本、Adapter 和多语言/多模态。验证资源释放。

功能用例应在请求结束后检查 KV Block、Batch Slot、Host Buffer 和连接是否归还，尤其覆盖客户端中断、网关超时、模型拒绝和后端异常。每个用例保存请求、响应、版本、GPU UUID 和资源前后快照，避免只验证 HTTP 状态码而漏掉资源泄漏。

### 性能验收输出完整负载曲线

不同 Arrival/Length 的 TTFT、TPOT、P99、Tokens/s、Queue、KV 和 GPU，而非单一最佳点。独占/共享分别测试。

测试报告固定环境和负载种子，输出 Arrival Rate 到安全吞吐的完整曲线，并标出 SLO、OOM、Preemption 和扩容边界。独占、MIG、Time-Slicing/HAMi 作为不同资源产品分别建基线，不能用共享场景的平均值替代关键租户 SLO。

### 容量验收注入副本和节点故障

失去 Pod、GPU Node、Rack/Zone，观察流量切换、P99/Error、扩容时间和恢复。验证 N+1 假设。

故障注入应按故障域逐级扩大，并记录检测、摘流、替代副本 Ready、缓存重建和 SLO 恢复时间。测试完成后确认被隔离节点不会自动重新接流量，容量控制器不会因 Pending GPU 反复放大，所有临时资源和告警状态得到清理。

### 发布验收执行新旧双向回滚

新版本上线、部分流量、全量、回旧版，并验证 Engine/Runtime/Cache。保存每步指标和决策。

双向回滚不仅验证流量权重，还验证制品、配置、Prefix/Engine Cache 和长连接排空。每一步设置明确的继续/停止门槛，保留 Release ID、操作者、时间线和关键分位，以便将验收结果直接用于生产 Runbook。

### 多租户验收注入邻居压力

邻居满显存、满计算、长 Kernel、Crash，检查关键租户 P99、错误和数据隔离。弱隔离达不到 SLO 就限制组合。

邻居实验应覆盖同一 GPU、同一节点和同一网络 Rail，并分别观察显存失败、调度抖动、XID/ECC 和数据可见性。测试只使用合成或脱敏数据；发现共享层无法满足关键服务等级时，将其标记为不可组合并在调度器中强制隔离。

### 运营验收验证告警与 Runbook

模拟 Model Load Failure、Queue Overload、OOM、GPU XID、Storage Slow 和 Gateway Backpressure，确认告警上下文、Owner、隔离、回滚与恢复准入。

每个 Runbook 以触发信号、证据收集、止损动作、恢复动作和退出条件组织，并指定 Owner 与升级路径。演练后核对告警是否带 Model/Version/GPU UUID/故障域，确认恢复准入包含诊断或基准结果，而不是仅凭 Pod 重新 Ready。

### 流量和长度分布

Arrival/QPS、Active/Streaming、Prompt/Output P50/P95/P99、Tenant/Model/Region。容量变化由工作量而非只请求数解释。

日常看板同时展示输入输出 Token、取消/超时和长度分布的变化率。模型或租户流量结构改变时，先更新容量分桶再比较吞吐，避免 QPS 不变但工作量翻倍导致误判。

### Queue 和 Admission

Waiting/Reject/Timeout、Queue P95、Priority/Fairness、Length/Token Limit，过载时 Backpressure 和 Retry。

值班检查队列是否持续增长、拒绝原因是否集中在某租户或长度桶，并核对入口 Retry 是否超预算。若 Queue 高而 GPU 空闲，优先检查 Admission、模型加载和拓扑；若 GPU 满且 Queue 高，执行限流或扩容而不是盲目增加 Batch Delay。

### TTFT、TPOT 和端到端分位

按 Length/Model/Version/Service Tier，分解 Queue/Prefill/Decode/Network。平均延迟不作为 SLO。

每次异常保留分位时间窗和样本量，区分 TTFT、TPOT、端到端与流式中断。看板链接到单请求 Trace 和对应 GPU/Instance，确保值班人员能从用户症状走到执行阶段。

### Batch Scheduler

Batch/Token、Delay、Active/Waiting Sequence、Chunked Prefill、Preemption/Swap 和公平。利用率高但 P99 差及时降载。

检查调度预算是否被长 Prompt、单租户高优先级或 Swap 占满；记录每轮选入/跳过原因和最老等待时间。发现公平性或 P99 退化时先降低新请求接纳，再调整 Chunk/Batch 参数并验证恢复。

### KV Cache

Block Used/Free、Prefix Hit、Eviction、Fragment、Swap、Context/Concurrency、OOM。Parent GPU Memory 与 Runtime 账本对照。

将 Runtime Block 账本与 GPU 采样按时间对齐，区分预留、可分配和外部进程占用。Eviction/Fragmentation 上升但总显存稳定时，优先检查长度分布和 Block 策略，不要直接扩容 GPU。

### Model Instance 和显存

Weight/Engine/Workspace/KV、Instance Count、Load/Unload、MIG/HAMi/Neighbor，Peak/Reserved 和失败申请。

实例变更时记录旧新副本、加载耗时、峰值显存和失败申请上下文。发现 Reserved 远高于 Used，核对 Workspace、CUDA Context、MIG/共享层和缓存，而非只看模型权重大小。

### GPU 执行健康

SM/Tensor/DRAM、Clock/Power/Throttle、XID/ECC、Top Kernel/NCCL。性能和硬件风险同时看。

将短时性能下降与持续硬件事件分开处理：先看 Clock/Throttle、Kernel/通信，再关联 XID/ECC、温度和节点故障域。任何 XID 事件都保留 GPU UUID、作业/请求范围和节点状态，供后续隔离或供应商诊断。

### 模型质量和版本

Model/Tokenizer/Adapter/Engine/Image/Config，Canary Quality/Error/Safety、流量权重和可回滚组合。

值班时确认流量实际命中的 Release ID，而非只看 Deployment 镜像标签；质量和安全 Canary 失败要能一键冻结扩量并恢复旧组合。组件哈希与配置差异保存到发布审计中。

### 冷启动和弹性

Node Ready、Image Pull、Model Download、Engine Load/JIT/Warmup、Time to Ready，Cache Hit 和扩容预测。

把冷启动拆成节点、镜像、制品、Engine 和 Warmup 阶段，比较实际耗时与扩容预测。任一阶段反复失败时暂停继续创建节点，并将缓存命中率和存储延迟纳入容量告警。

### 副本与故障域

Ready/Unavailable、Node/Rack/Zone Spread、N+1、PDB、正在 Drain/发布，失去最大故障域后的安全吞吐。

维护前确认剩余 Ready 副本、故障域分布和模型缓存；节点被 Cordon 后观察流量是否真正排空。安全吞吐低于承诺时立即收紧 Admission 或启动降级，而不是依赖 PDB 自动解决容量问题。

### 流式连接排空

Active Stream、Oldest/Deadline、Termination/Cancel、Grace，Pod/节点维护不产生长尾错误风暴。

排空看板列出最老连接和剩余 Deadline，连接取消要能关联到具体 Pod/Release。Grace 到期后的强制终止单独计数，并检查替代副本 Queue 是否出现级联增长。

### Storage 和制品

Registry/Object/Model Repo、Download/Checksum、Cache/Capacity、错误/延迟。制品缺失与 GPU 故障分流。

制品问题优先用 Manifest/Checksum 和对象存储延迟证据定位，GPU 故障则看 UUID、XID/ECC 和本地基准。节点缓存使用原子发布，发现半文件或校验失败时隔离该版本，不清理所有健康缓存。

### 成本和有效产出

GPU/Replica Hour、Successful Tokens within SLO、Idle Headroom、Failed/Cancelled、Energy/Cost per Useful Token。

成本看板按模型、租户和服务等级展示有效 Token 与失败工作，单列 Shadow、预热和故障重试。Headroom 属于可靠性成本，应与闲置 GPU、扩容时间和 SLO 违反率一起解释。

### 近期变更关联

Model/Engine/Image/Driver/Operator/Batch/Admission/Node Pool，时间轴标 Canary/扩量/回滚，异常先比较变更范围。

变更关联使用统一 Change ID 贯穿发布控制器、节点事件、Runtime 日志和 Trace。异常发生时先做时间窗口内的变更二分，再与无变更基线比较；没有 Change ID 的手工操作应视为审计缺口并补录。
