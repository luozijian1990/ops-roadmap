# Go 运维开发与云原生工程 · 第五册：Agent、Controller 与交付

## 第十七章 · 只有目标机本地执行有收益时才增加 Agent

### 中心端能直接完成的事，为什么不应该先部署 Agent？

Agent 会新增安装、升级、兼容、凭证、资源和失联治理。
中心端通过已有 API、SSH 跳板或 Prometheus 已能完成的只读工作，通常不值得先在每台机器部署进程。

引入证据包括：数据只能本地取得、中心网络不可达、必须本地快速响应、权限要求隔离，或大量主机分发单二进制确有收益。
设计文档应同时写出不装 Agent 的替代方案和成本比较。

评审时列出主机数量、网络方向、升级频率、最低系统版本和离线时长。
若这些事实仍未知，结论只能标为 draft；先用中心端只读调用做小规模验证，不能把“以后可能扩容”当成全量安装依据。

#### 把每主机成本乘到全量

单个进程 30 MB 内存看似很小，乘以数万台主机后会变成容量和升级问题。
PoC 要测空闲、稳定采集和故障重试三种状态，同时记录 CPU、RSS、goroutine、文件描述符、磁盘写入和出站流量。
还要评估停机主机、旧系统与无法升级节点的治理方式。

#### 先穷尽无 Agent 方案

依次评估现有 exporter、云 API、SSH bastion、配置管理系统、DaemonSet 临时 Job 和中心端客户端。
若现有受控通道能完成一次性诊断，不要为了一个动作常驻进程。
替代方案同时比较权限、网络、审计和失败恢复，而不只比开发量。

#### 建立支持矩阵

记录 OS、架构、内核、init system、证书路径和最低 glibc/CGO 要求。
无法升级节点单独列出隔离或退役策略；Agent 协议需支持 N 与 N-1 版本共存，中心端不能要求全量瞬时升级。

#### 全量成本模型

每主机 30MiB、每分钟 100KiB 上报、每日一次 20MiB 升级包，乘以主机数后得到内存占用、中心入口流量与发布带宽。
再计算断网重连风暴和滚动期间双进程峰值。
没有这些数字，PoC 结论只能是功能可行。

#### 引入决策练习

对读取本机 journal、查询云主机标签、抓取 node exporter 三个需求分别判断是否需要 Agent，并写反证。
至少一个结论应是复用现有能力而不开发新进程。

#### Agent 引入评审证据

PoC 报告必须包含无 Agent 替代、三类负载资源、网络方向、最小权限、支持矩阵、升级和卸载。
只证明“能采到数据”不够。
选 1% 异构节点灰度，验证旧系统、断网和回滚，再决定扩大范围。

#### 无 Agent 方案的反证矩阵

中心端直接调用现有 API、SSH bastion、Prometheus exporter、Kubernetes DaemonSet 或一次性 Job，都可能完成需求。
Agent 只有在目标数据只能本机读取、入站网络不可达、离线自治或大规模本地预处理有明确收益时才成立。
每台主机新增进程还意味着安装、注册、升级、卸载、凭证、磁盘、日志、告警和支持矩阵。

| 证据 | 无 Agent 方案 | 引入 Agent 后新增责任 |
| --- | --- | --- |
| 中心端可直接访问 API | Backend/Worker 调用 | 通常没有收益 |
| 只能读本地 Unix socket | 远程方案不可行 | 本地权限和协议升级 |
| 主机长期断网 | 定时任务本地落盘 | 缓冲、确认游标和磁盘保护 |
| 数万主机周期采集 | 复用已有 exporter | 灰度、全量成本和版本兼容 |

评审要把单实例 CPU、RSS、文件描述符、网络和磁盘乘以全量主机数，并包含升级期间新旧版本共存峰值。
结论允许继续使用现有 exporter，而不是为了 Go 单二进制制造第二套 Agent。

#### 安装、升级和卸载同样属于产品面

安装验证用户、目录、配置权限、证书和 systemd unit；升级采用分批、健康窗口和旧制品保留；卸载说明是否保留本地状态与设备身份。
中心端支持 N 与 N-1 协议共存，并能按 capability 避免向旧 Agent 下发未知动作。

灰度不是只选“几台测试机”。
样本覆盖主要 OS/arch、旧内核、代理网络、断网节点和低磁盘节点。
全量前保存安装成功率、资源基线、回滚耗时和无法升级清单。

### 采集 Agent 怎样限制资源、断网缓冲并报告健康状态？

采集频率、单批大小、CPU、内存、磁盘和并发必须有上限。
默认通过 Backend API push；已有 Prometheus pull 体系时可暴露 `/metrics`。
断网缓冲只有业务允许续传时启用，并设置容量与保留期限。

```mermaid
flowchart LR
    A[本地采集] --> B[有界队列]
    B --> C[批量上报]
    C --> D[Backend]
    C -->|失败| E[有限磁盘缓冲]
    E --> C
```

健康状态区分采集循环、上报、缓冲容量和配置有效性。
SIGTERM 后停止采集、限时刷新在途批次；超时则保存明确状态，不能无限阻止升级。

#### 缓冲不是无限可靠队列

本地记录带序号、生成时间、过期时间和校验值；写入达到容量后按明确策略拒绝新数据或淘汰旧数据，并产生指标。
恢复连接后有界回放，避免瞬时打爆中心端。
断电测试要确认最后一个不完整记录能被识别，而不是阻止整个数据库打开。

#### 采集调度与抖动

大量 Agent 不应整点同时采集和上报。
基于 agent ID 生成稳定抖动，使重启后分布仍均匀；配置变化也分批生效。
采集耗时超过周期时默认不重入，记录 skipped 或 overrun。

#### 本地资源保护

限制每采集器 deadline、并发、输出字节和临时文件。
Agent 自身内存接近上限时先停非关键采集，不能通过无限重试加剧主机故障。
健康状态区分 degraded 与 failed，让中心端知道数据不完整。

系统指标采集可以使用维护中的 `gopsutil` 适配不同平台，但引入前要确认支持的 OS/arch、所需权限、字段单位和容器视角。
库能返回 CPU 或内存值，不代表该值就是宿主机真实容量；在容器内还要区分 cgroup 限额与节点数据。
对核心指标保留 fixture 和目标平台集成测试。

封装一个很小的 collector 接口，把第三方结构转换为自己的版本化事件模型。
这样升级库、修正单位或替换 `/proc` 读取时，不会让中心协议一起变化。
采集错误按 unsupported、permission、timeout 和 transient 分类；不支持的字段标记 unavailable，不要默默写零。

#### 缓冲文件格式

使用成熟嵌入式数据库或 append-only segment，记录长度与 checksum，启动时截断最后不完整记录。
segment 达到大小后轮转，只有所有记录确认后删除。
目录权限最小，磁盘剩余低于阈值时执行明确淘汰策略。

#### 回放限速

恢复网络后实时流量与历史回放分别限流，优先级由业务决定。
批次含事件 ID，中心幂等确认最高连续序号或明确列表；Agent 不能因一次 200 就删除未确认事件。

#### Agent 健康测试

注入断网、429、磁盘满、损坏尾记录、慢采集器和 SIGTERM。
确认内存/磁盘有界、dropped 指标准确、恢复不打爆中心端，关闭后可从确认游标继续。

#### 缓冲容量验收表

按事件大小、速率和离线目标计算字节，再乘索引和写放大余量。
分别注入短断网、超过保留期、磁盘低水位和中心 429，检查 dropped、oldestAge、bufferBytes 和 replayRate。
恢复后实时数据不能被历史回放长期饿死。

#### 稳定抖动避免同时唤醒

采集周期不要让所有 Agent 在整点同时触发。
以 agent ID 和任务名生成稳定抖动，同一 Agent 重启后仍落在近似时间槽，避免随机数导致短时间重复采集。
若一次采集超过周期，默认不重入；记录 skipped counter，并让下一轮按计划继续。

```go
func stableDelay(agentID, job string, window time.Duration) time.Duration {
	h := fnv.New64a()
	_, _ = io.WriteString(h, agentID+"\x00"+job)
	return time.Duration(h.Sum64() % uint64(window))
}
```

这是局部片段，`window` 必须大于零。
测试同一输入稳定、不同 Agent 分布、极小窗口和进程重启后的调度；指标区分实时采集、回放上传和丢弃，回放不能抢光实时带宽。

#### 离线缓冲采用确认游标

写入先追加带长度与校验的 segment 或在 bbolt 事务中提交，上传按批次读取，中心端按 event ID 幂等保存并返回确认游标，Agent 只有收到确认才删除。

#### 确认游标把至少一次传输变成可恢复协议

Agent 断网后无法知道中心端是否收到最后一批，因此本地记录必须先持久化，删除动作只能发生在确认之后。
中心端按事件 ID 幂等写入，游标表示连续确认位置；重复回放是允许的，丢失未确认事件则不是。
测试先写入三批事件，在第二批确认响应丢失后重启 Agent；预期中心端只产生三批逻辑结果，本地最终游标仍能推进到第三批。

```mermaid
sequenceDiagram
    participant A as Agent
    participant L as Local spool
    participant C as Center
    A->>L: append events 1..3
    L->>C: replay batch 1..2
    C-->>L: ack lost
    A->>C: replay batch 1..3
    C-->>A: idempotent ack cursor=3
    A->>L: delete confirmed prefix
```
`bbolt` 是确有断网恢复需求时的默认候选，不是所有 Agent 的标配；只需最近状态时，覆盖一个原子快照文件更简单。

磁盘达到高水位时必须按书面策略降级：丢最旧、只保留聚合、暂停非关键采集或拒绝新任务。
任何策略都增加 `buffer_dropped_total` 和健康原因。
故障实验在隔离目录限制容量，覆盖写到一半、确认丢失、segment 损坏和磁盘恢复。

### 远程指令为什么需要轮询、白名单、审计和最小凭证？

Agent 默认轮询中心端，简单且适应主机只允许出站连接的网络。
只有明确低延迟需求和稳定连接条件时再评估长连接。

中心端下发动作名和经过校验的参数，不下发任意 Shell。
Agent 校验任务签名、目标、有效期、幂等键和并发上限，记录谁批准、何时执行、退出码与结果摘要。
凭证引用系统 Secret，不通过任务 body 下发长期 Token。

结果上报失败时不能立即重复执行动作，应先查询任务状态或使用幂等键对账。
失联、任务过期、签名无效和动作不在白名单都要形成不同审计结果，并设置本地审计容量和清理期限。

#### 指令状态机拒绝重放

任务至少经历 received、validated、running 和终态；相同任务 ID 再次到达时返回已有结果。
Agent 使用单调时间判断本地 deadline，使用签名时间窗防旧指令重放。
中心与 Agent 版本不兼容时应拒绝任务并上报能力清单，而不是尝试猜参数。

#### 动作 schema 代替 shell

每个动作拥有版本化请求 schema、参数范围、最大输出、deadline 和所需 capability。
例如 journal 采集只允许白名单 unit、受限 since 和 maxBytes。
新增动作经过代码发布与安全评审，中心端不能动态扩权。

#### 注册和凭证轮换

首次注册使用短期 bootstrap token 换取设备身份；长期凭证绑定 agent ID 和用途，支持轮换与吊销。
凭证文件权限受限，日志只记录 fingerprint。
克隆磁盘镜像时必须避免复制同一设备身份。

#### 审计链

中心记录申请、批准和下发，Agent 记录接收、校验、执行和结果，双方通过 command ID 与摘要关联。
审计存储有容量和上传策略；本地审计满时高风险动作应拒绝，而不是继续无记录执行。

#### 结果未知与对账

动作完成但上报断开时，Agent 保存终态并在重连后重传，绝不重执行。
同一 ID 不同 payload 视为安全冲突。
中心超时显示 unknown，查询 Agent 或外部状态后再决定补偿。

#### 远程执行测试

覆盖过期、错误签名、错误目标、未知动作、参数逃逸、重复 ID、输出洪泛、超时和凭证吊销。
测试确保拒绝发生在副作用之前，所有结果进入审计且不含 Secret。

#### 指令上线确认

使用测试身份验证注册、轮换和吊销；用相同 ID 重放同一与不同 payload；注入过期、签名错、输出洪泛与进程超时。
确认副作用前完成全部校验，审计链可关联审批与结果，Agent 没有任意 shell 后门。

#### 完整示例：先持久去重，再执行动作

下面的单文件测试使用内存 store 解释协议，不宣称具有断电持久性。
真实 Agent 要把 `Seen` 与结果写入 bbolt 或其他明确持久层，并对写入失败采取失败关闭策略。

```go
package agent

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
)

var (
	ErrExpired  = errors.New("command expired")
	ErrConflict = errors.New("command id conflict")
	ErrDenied   = errors.New("action denied")
)

type Command struct {
	ID        string
	Action    string
	Payload   []byte
	ExpiresAt time.Time
}

type Store struct {
	mu   sync.Mutex
	seen map[string][32]byte
}

func NewStore() *Store {
	return &Store{seen: make(map[string][32]byte)}
}

func (s *Store) Reserve(id string, digest [32]byte) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	previous, ok := s.seen[id]
	if ok && previous != digest {
		return false, ErrConflict
	}
	if ok {
		return false, nil
	}
	s.seen[id] = digest
	return true, nil
}

type Executor interface {
	Execute(context.Context, string, []byte) error
}

type Agent struct {
	store   *Store
	exec    Executor
	allowed map[string]struct{}
	now     func() time.Time
}

func (a *Agent) Handle(ctx context.Context, cmd Command) error {
	if a.now().After(cmd.ExpiresAt) {
		return ErrExpired
	}
	if _, ok := a.allowed[cmd.Action]; !ok {
		return ErrDenied
	}
	digest := sha256.Sum256(append([]byte(cmd.Action+"\x00"), cmd.Payload...))
	fresh, err := a.store.Reserve(cmd.ID, digest)
	if err != nil || !fresh {
		return err
	}
	if err := a.exec.Execute(ctx, cmd.Action, cmd.Payload); err != nil {
		return fmt.Errorf("execute %s: %w", cmd.Action, err)
	}
	return nil
}

type countingExecutor struct {
	mu    sync.Mutex
	calls int
}

func (e *countingExecutor) Execute(context.Context, string, []byte) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.calls++
	return nil
}

func TestHandleRejectsReplayAndConflict(t *testing.T) {
	exec := &countingExecutor{}
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	agent := &Agent{
		store:   NewStore(),
		exec:    exec,
		allowed: map[string]struct{}{"collect_logs": {}},
		now:     func() time.Time { return now },
	}
	cmd := Command{
		ID:        "cmd-1",
		Action:    "collect_logs",
		Payload:   []byte(`{"unit":"demo.service"}`),
		ExpiresAt: now.Add(time.Minute),
	}

	if err := agent.Handle(context.Background(), cmd); err != nil {
		t.Fatalf("first Handle() error = %v", err)
	}
	if err := agent.Handle(context.Background(), cmd); err != nil {
		t.Fatalf("same replay should return prior success: %v", err)
	}
	changed := cmd
	changed.Payload = []byte(`{"unit":"other.service"}`)
	if err := agent.Handle(context.Background(), changed); !errors.Is(err, ErrConflict) {
		t.Fatalf("changed replay error = %v, want ErrConflict", err)
	}
	if exec.calls != 1 {
		t.Fatalf("Execute() calls = %d, want 1", exec.calls)
	}
}
```

运行时把该代码保存为 `agent_test.go`，执行：

```bash
go test ./...
go test -race ./...
```

这个模型刻意暴露一个进一步问题：`Reserve` 在副作用前写入，执行中崩溃后同一 ID 不会自动重跑，但状态也不能直接称为成功。
生产 store 应保存 `received/running/succeeded/failed/unknown` 和结果摘要，再由动作幂等性与对账决定是否重试。
测试还应补过期、拒绝动作、执行超时和并发提交同一 ID。

#### 指令冲突与结果未知

每条指令包含 `command_id`、目标 agent、动作、参数 schema 版本、签发时间、过期时间、审批摘要和最大输出。
Agent 在执行前持久记录 received，执行后写 completed 与结果摘要；中心重发相同 ID 时返回已有状态，不再次执行副作用。

```text
issued -> received -> running -> succeeded
                         |       failed
                         |       unknown
                         +-----> cancelled
```

若动作完成后 Agent 崩溃、结果尚未持久化，状态必须是 unknown，而不是猜成功或自动重跑。
对 `collect_logs` 可以安全重试，对 `restart_service` 则应查询真实状态并由对账逻辑决定。

#### 最小提权与凭证轮换

Agent 主进程使用专用低权限用户。
确需 root 的少量动作交给参数固定的 helper，并用精确 sudoers 或 polkit 规则限制可执行文件和参数；禁止隐藏的任意 shell 后门。
注册凭证只用于换取短期设备身份，中心端支持吊销、轮换和版本能力协商。
凭证不放命令行、普通日志或镜像层。

## 第十八章 · 把单二进制变成可回滚的生产制品

### 交叉编译与多阶段镜像怎样得到更小且可追溯的制品？

编译矩阵明确 GOOS、GOARCH、CGO 和最低系统要求。
多阶段镜像只把二进制、CA 和必要时区数据复制到运行层，避免把编译器带入生产。

```dockerfile
FROM golang:1.27 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/ops-agent ./cmd/agent

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/ops-agent /ops-agent
USER nonroot:nonroot
ENTRYPOINT ["/ops-agent"]
```

示例版本在正式使用时应按项目支持策略更新并固定 digest。
发布物附 SHA-256、SBOM、来源和签名，验证的是最终制品而不是源码目录。

#### 在目标平台检查二进制

使用 `go version -m` 查看构建与模块信息，使用平台工具确认架构和动态依赖，再在最小权限用户下执行 `version`、配置校验、启动与 SIGTERM。
交叉编译成功只证明编译器生成了文件，不证明目标内核、CA、DNS、时区和文件路径可用。

#### 构建上下文最小化

`.dockerignore` 排除 Git、临时产物、测试 Secret 和本地缓存。
先复制 go.mod/go.sum 下载依赖以利用缓存，再复制源码；但缓存命中不影响依赖锁定。
构建阶段使用 secret mount 获取私有模块，不写入 layer。

#### 运行镜像的必要数据

纯静态二进制仍可能需要 CA、时区、passwd/group 和 DNS 配置。
distroless 或 scratch 缺少 shell，排障依赖应用诊断端点和临时调试容器。
选择基础镜像时权衡漏洞面、合规和可运维性，不只比大小。

#### 多架构 manifest

分别构建 amd64/arm64，运行架构级 smoke，生成 manifest list 后固定 digest。
QEMU 构建能发现编译问题，不能完全替代真实 CPU 上的系统调用和性能验证。
CGO 需要对应交叉工具链与目标 libc。

#### 可复现与 provenance

锁定基础镜像 digest、模块与工具链，使用 trimpath，避免无意义时间戳。
两次干净构建比较摘要；若不同，记录差异来源。
provenance 关联 commit、builder 和参数，签名最终镜像摘要。

#### 制品验收

从 registry 按摘要拉取，而不是测试本地临时镜像。
验证签名、SBOM、`version`、非 root 启动、CA/DNS、配置错误、健康和 SIGTERM，并保存命令与输出。

#### 构建矩阵记录

每个 OS/arch 保存工具链、CGO、摘要和实际运行证据。
镜像按 digest 拉取并验证签名，SBOM 对应最终制品。
交叉编译但未运行的组合明确标为 build-only，不能列为支持平台。

#### 可追溯制品链要逐项验证

源码 commit、锁定模块图、Go 工具链、构建参数、二进制摘要、SBOM、provenance、镜像摘要、签名和运行 `/version` 各自回答不同问题。

```mermaid
flowchart LR
    A[Commit] --> B[Locked modules and toolchain]
    B --> C[Binary checksum]
    C --> D[Image digest]
    D --> E[Signature and SBOM]
    E --> F[Deployment manifest]
    F --> G[Runtime version and smoke]
```
校验和证明内容未改变，签名证明发布身份，SBOM描述组件，provenance描述构建过程；任何一项都不能替代目标平台 smoke test。
交付演练应从 commit 查到镜像 digest，再在目标集群读取 `/version`；任一摘要不一致都应阻断发布并保留证据。

#### 交付证据是一条可追溯链

源码 commit 说明输入，锁定依赖和工具链说明构建环境，二进制摘要和镜像 digest 说明实际内容，签名说明发布主体，SBOM 说明组成，运行 `/version` 和 smoke test 说明目标平台确实启动了该制品。
缺少其中一环时，出现故障只能证明某个版本有问题，不能证明正在运行的实例来自这次构建。

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -trimpath -o dist/ops-agent-linux-amd64 ./cmd/ops-agent
go version -m dist/ops-agent-linux-amd64
shasum -a 256 dist/ops-agent-linux-amd64
```

使用 CGO 时，交叉编译需要目标 C 工具链和动态库；不要为了构建方便关闭业务必需的系统能力。
极简镜像还要显式验证 CA、时区、DNS 和非 root 文件权限。

### 非 root、只读文件系统、探针和优雅退出怎样共同工作？

容器以非 root 运行，只写显式挂载目录，根文件系统只读。
需要绑定低端口、读取宿主文件或访问设备时，先缩小 capability 和挂载范围，不直接 privileged。

readiness 在关闭开始时立即失败以摘流；进程继续处理在途请求直到内部 deadline。
liveness 只检测无法自愈的死锁或主循环失败，不能把数据库短暂不可用变成重启风暴。

验证不能只看 Pod 进入 Running：用非 root 用户启动，尝试写根目录并确认失败，发送 SIGTERM，观察 readiness 先失败、在途请求结束、进程在宽限期内退出。
若应用需要临时文件，挂载有容量限制的专用目录。

#### 探针必须便宜且有语义

liveness 不执行昂贵查询；readiness 可以检查关键内部状态，但要设置很短超时并避免依赖抖动造成全实例同时摘流。
startup probe 只用于确实慢启动的进程。
把三类探针的失败分别注入，确认编排器动作符合预期。

#### SecurityContext 逐项理解

`runAsNonRoot` 防止 UID 0，`allowPrivilegeEscalation=false` 限制提权，drop ALL 移除 capabilities，seccomp RuntimeDefault 限制系统调用，readOnlyRootFilesystem 防止隐式写根目录。
每项仍需目标集群策略和运行测试证明。

#### 可写目录和容量

只给 `/tmp`、缓存或缓冲目录挂载 volume，并设置 sizeLimit 或 PVC 配额。
程序启动时检查目录权限与剩余空间，失败 readiness 给出原因。
日志默认 stdout，不写无轮转本地文件。

#### 资源 request 与 limit

request 影响调度，limit 控制上限。
CPU limit 可能造成 throttling，内存超限触发 OOMKill。
根据负载测试设置初值，监控 working set、GC、throttling 和重启；不能从示例复制固定数值。

#### 探针故障模式

readiness 依赖所有远程系统会在依赖抖动时全量摘流；liveness 检数据库会制造重启风暴；探针共用饱和业务 worker 会在高负载误失败。
探针应有独立轻量路径和短 timeout。

#### 运行基线测试

以只读根、非 root、无额外 capability 运行；尝试写非法路径应失败，合法临时目录应受限。
制造内存和 CPU 压力观察平台动作，发送 SIGTERM 验证 readiness 和 grace period。

#### 安全上下文失败实验

移除可写 volume、撤掉不必要 capability、设置只读根和低权限 UID，确认应用失败信息明确且不会偷偷写其他目录。
使 readiness 失败但 liveness 正常，观察不接流量而不重启；再使主循环卡死验证 liveness 语义。

#### 探针与退出必须共同设计

存活探针只判断进程是否需要重启，不能依赖所有下游；就绪探针表示实例是否应该接新流量；启动探针只保护慢启动阶段。
SIGTERM 到达后先让 readiness 失败，再停止接单，等待在途任务到安全点，最后在 `terminationGracePeriodSeconds` 内退出。

```text
SIGTERM -> readiness false -> endpoint removal
        -> stop accepting work -> drain or checkpoint
        -> close clients and buffers -> process exits
```

用真实容器运行只读根文件系统、非 root 和有限 `/tmp`。
主动制造 CA 缺失、临时目录不可写、内存 limit 过低和探针超时，确认错误指向配置而不是进入重启风暴。

#### systemd 与容器的失败证据不同

systemd 场景检查 `systemctl status`、journal、退出码、restart counter 和限制项；容器场景检查 terminated reason、OOMKilled、事件、探针与 cgroup 指标。
同一 Go 错误在两个运行环境可能表现不同，runbook 应分别给出入口。

升级测试保留旧制品与配置，启动新版本后等待明确健康窗口。
失败时恢复旧版本，并验证本地状态目录仍向后兼容；不能只看到进程重新启动就判定回滚成功。

### 扩容、滚动更新和回滚前必须保存哪些验证证据？

扩容前验证服务是否真的无状态、任务领取是否原子、调度是否会重复触发。
滚动更新记录新旧版本共存兼容性、迁移顺序、最大不可用和终止宽限期。

发布证据至少包括制品摘要、测试、漏洞扫描、配置差异、数据库迁移、探针、冒烟结果和观察窗口。
回滚不仅是换旧镜像，还要确认数据格式和外部副作用能否回退。

扩容测试应检查重复调度、缓存一致性、数据库连接总量和下游限流。
滚动期间同时运行新旧版本，确认 API 与数据向前向后兼容；无法兼容时采用明确停机窗口或分阶段迁移。

#### 回滚触发器必须可观察

预先写明错误率、P95、任务积压、依赖限流和业务失败阈值，以及观察窗口和负责人。
回滚后继续观察旧版本是否恢复，避免把依赖故障误判为版本问题。
所有命令使用不可变制品标识，不依赖会漂移的 latest 标签。

#### 水平扩容前检查状态

进程内 cron、缓存和任务队列会随副本复制。
扩容前确认调度 leader、任务领取锁、幂等键和共享状态。
数据库最大连接按发布峰值副本计算，不能让 HPA 扩容直接耗尽数据库。

#### 滚动更新参数

maxUnavailable 与 maxSurge 根据容量和连接预算选择；readiness 成功后留最小观察，preStop 不能替代应用 SIGTERM。
新旧版本必须兼容 API、schema、消息和 Agent 协议，否则采用分阶段或停机发布。

#### 回滚与前滚

无数据变化的代码缺陷适合回滚；已执行不可逆迁移或远程命令时，旧镜像可能不兼容，需前滚修复或数据恢复。
计划提前标记不可逆点和决策人。

#### 发布证据包

保存 commit、镜像 digest、SBOM、签名、配置 diff、迁移版本、测试、rollout 状态、业务 smoke、指标窗口和回滚演练。
截图可辅助，但可查询命令和结构化结果更便于复核。

#### 扩缩容演练

从 1 扩到 3 副本再滚动新旧版本，提交相同幂等任务并观察连接、队列和副作用。
回滚到上一 digest，确认 schema 与协议兼容，并继续观察依赖故障是否仍存在。

#### 发布决策记录

列出当前/目标副本、发布期间峰值连接、maxSurge/maxUnavailable、grace period、schema/协议兼容、观察指标和停止阈值。
以旧 digest 实际回滚并继续观察，证明恢复来自版本而不是依赖自行恢复。

#### 扩容前先确认哪些状态可复制

进程内任务、内存去重表、本地 session 和单实例 scheduler 都可能让水平扩容产生重复或丢失。
共享业务状态进入关系库；scheduler 多副本需要选主或幂等触发；每实例数据库连接上限乘以副本数仍要低于数据库预算。

滚动参数由容量和兼容性推导。
`maxUnavailable=0` 会增加升级期间的资源与连接峰值；`maxSurge=0` 可能降低容量。
新旧版本必须同时理解当前 API、schema 和任务 payload。
回滚前先检查迁移与外部副作用是否可逆，无法安全回滚时执行前滚修复。

#### 发布观察窗口覆盖新旧共存

滚动开始前保存基线，过程中按版本标签分别观察错误率、p95、连接、任务重复与内存。
若指标只按 Service 聚合，新版本少量异常可能被旧版本流量稀释。
至少运行一次超过最长任务时长的观察窗口，确认旧 Pod 退出后没有丢任务或遗留租约。

停止或回滚阈值写成可查询表达式，并指定决定人。
达到阈值后保存现场证据再执行动作；回滚后继续观察同样指标，验证恢复与版本变更存在因果关系。

发布证据还要覆盖最长任务跨越滚动窗口的场景；否则短 smoke 无法证明在途工作不会因旧 Pod 终止而丢失。
还要在 PodDisruptionBudget 和节点驱逐约束下演练计划内中断，确认可用副本与关停预算没有互相锁死。

## 第十九章 · 区分 Kubernetes 客户端、Controller 与 Operator

### 查询或修改 Pod 与 Deployment 时，为什么普通客户端已经足够？

一次查询、创建或更新资源只需要 client-go 或受控 CLI。
它们是命令式动作，不要求新建 CRD 或持续运行 Reconcile 循环。
客户端必须设置 kubeconfig 来源、context、namespace、QPS/Burst、超时和最小 RBAC。

危险更新先读取 resourceVersion，使用 patch 或乐观并发避免覆盖他人变更。
日志不得输出 kubeconfig、Secret data 或完整 Token。

#### 客户端测试从 fake 到真实 API 分层

fake client 适合纯对象逻辑，但不能证明默认值、准入、转换和冲突行为。
再使用 envtest 或隔离集群验证真实 API 语义。
所有测试使用独立 namespace 和清理标签，删除动作必须限定目标，不能把测试清理写成无范围递归删除。

#### kubeconfig 和集群身份

集群内使用 ServiceAccount，集群外按明确 kubeconfig/context。
启动日志输出 cluster 标识与 namespace 但不输出 token。
高风险命令要求显式 context/namespace，并可拒绝名称包含 production 的环境，最终仍依赖 RBAC 和审批。

#### List Watch 与单次 Get

一次查询使用 Get/List 即可；大量对象分页并限制结果。
需要持续观察但不协调时可使用 informer/cache，不必创建 CRD。
resourceVersion 和 watch 重连由成熟库处理，业务仍需应对重复事件和缓存延迟。

#### Patch 与字段所有权

读取后整对象 Update 容易覆盖他人字段。
只修改特定字段时使用 merge/json patch 或 server-side apply，并声明 field manager。
冲突后重新读取和重算，不能无限紧循环。

#### 客户端限流

设置 QPS/Burst 和请求 timeout，遇到 429 尊重退避。
批量操作有 worker 上限和最大对象数。
日志记录 GroupVersionResource、namespace、name、verb 和错误分类，不记录 Secret data。

#### 一次性操作练习

实现只给匹配标签的 Deployment 增加 annotation，支持 dry-run、context 和 namespace。
测试 fake 逻辑、envtest 冲突与隔离集群真实 patch；证明不需要 Reconcile 或 CRD。

#### 客户端安全清单

运行前打印 cluster、namespace、selector、对象数量和 dry-run diff；修改用 patch 与 resourceVersion；删除必须要求精确范围。
RBAC 只授予所需 verb/resource。
测试清理使用唯一标签和 namespace，不操作共享资源。

#### 普通客户端的完整决策链

一次性列出或 Patch 对象不需要 Reconcile 循环。
客户端从明确 kubeconfig/context 或 Pod ServiceAccount 建立身份，设置 QPS/Burst 和请求 deadline，先做 server-side dry-run，再使用 JSON Merge Patch 或 Server-Side Apply 修改自己拥有的字段。

```text
resolve cluster and namespace -> read current object
-> verify resourceVersion and preconditions -> dry-run patch
-> show plan -> apply exact fields -> read back and audit
```

批量删除必须使用精确 label selector、namespace 和数量上限；禁止空 selector 默认全量。
fake client 只验证调用形状，真实 API 的 defaulting、admission、RBAC、字段所有权和冲突要在 envtest 或隔离集群验证。

#### dry-run 后仍要处理竞态

server-side dry-run 只证明当时的请求能经过默认值与准入，不锁定后续真实写入。
dry-run 与 apply 之间对象可能变化，所以真实操作仍携带 resourceVersion 前提或字段所有权，并在冲突后重新读取、展示新 diff，再决定是否重试。

审计保存 cluster、namespace、GVR、name、verb、field manager、dry-run 结果与最终 resourceVersion。
Secret data、kubeconfig 和 bearer token 永远不进入记录。

### 只有出现持续协调与 CRD 后，为什么才需要 Reconcile？

Controller 观察当前状态与期望状态，反复执行幂等 Reconcile，直到二者一致。
CRD 用于声明新的领域对象；如果只是把一个按钮变成 Kubernetes API 调用，不需要 Operator。

```mermaid
flowchart LR
    A[资源事件] --> B[工作队列]
    B --> C[Reconcile]
    C --> D[读取期望与当前状态]
    D --> E[执行最小变更]
    E --> F[更新 Status]
    F -->|仍不一致| B
```

Reconcile 可能重复、乱序或在中途失败，因此不能依赖“只执行一次”。
外部副作用使用幂等键、查询和状态记录。

#### Controller 是 level-triggered 而不是脚本循环

Reconcile 的输入本质上是资源键，控制器每次重新读取事实并计算期望状态，而不是相信上一次事件携带的完整对象。
事件重复、缓存延迟和进程重启因此都能收敛；幂等和确定性 diff 比只执行一次更重要。
在 envtest 中重复调用同一个 key，制造 resourceVersion 冲突和 API 429，验证第二次没有额外副作用，退避后仍能收敛。

```mermaid
flowchart LR
    E[Event or timer] --> Q[Work queue key]
    Q --> R[Read latest object]
    R --> D[Compute deterministic diff]
    D --> P[Patch owned fields]
    P --> S[Update status]
    P -. conflict/429 .-> B[Backoff and retry]
    S --> Q
```

#### Spec 与 Status 分工

Spec 表达用户期望，Status 记录控制器观察，不由用户持续回写。
只有 observedGeneration 追上当前 generation，Ready 条件才代表当前规格。
删除需要 finalizer 时，清理必须可重试且有超时；无法清理要暴露条件，不能让对象永久无解释地卡住。

#### Reconcile 的输入只是键

队列通常只保证 namespace/name，不保证事件时的完整对象仍存在。
Reconcile 每次从 API 读取最新状态；NotFound 通常表示删除完成并可返回成功。
不要把事件顺序当作业务顺序。

#### 期望对象的确定性

相同 spec 应生成相同名称、labels、owner reference 和字段。
随机名称、当前时间和无序 map 会让每次 Reconcile 都产生 diff。
真正变化的运行状态进入 status，不混入 desired spec。

#### 外部系统协调

对 Kubernetes 外部 API 使用稳定幂等键和外部 ID，先查询再创建。
外部成功但 status 更新失败时，下次 Reconcile 必须发现已有对象而非再创建。
认证失败与无效 spec 通常等待配置变化，不应热重试。

#### Finalizer 删除流程

正常阶段确保 finalizer 存在；看到 deletionTimestamp 后执行可重复清理，确认外部资源不存在，再移除 finalizer。
清理失败更新 Condition 与指标并退避。
手工移除 finalizer 会遗留资源，runbook 必须写明风险和对账。

#### Reconcile 练习

重复调用两次确认第二次无写入；在 Create 后、status 前模拟崩溃；修改子资源的受管与非受管字段；删除时让外部 API 暂时失败。
验证最终收敛与 Condition。

#### Controller 必要性反证

如果 CronJob 周期查询、普通客户端按需修改或已有原生资源已经能表达需求，就不新增 CRD。
只有用户需要声明新领域期望，且系统要持续自动收敛、报告状态和处理删除生命周期时，Controller 成本才有对应收益。

#### cache 延迟要求 Reconcile 重新读取事实

事件只告诉控制器某个 key 可能需要处理，不携带完整可信状态。
cache 可能稍有延迟、事件可能重复或合并，因此 Reconcile 每次按 key 获取当前对象，构造确定性的 desired object，并只更新自己拥有的字段。
第二次处理相同状态不应产生额外写入或外部副作用。

finalizer 只用于确实存在的外部清理。
删除路径先检查外部对象是否已不存在，再执行幂等删除，最后移除 finalizer；外部服务长期不可用时要告警并提供人工恢复手册，不能让资源永久卡住却无人知晓。

#### 外部 API 要保存稳定关联键

Controller 创建外部对象时使用 CR UID 或稳定派生键作为幂等键，并把外部 ID 写入 status。
若创建成功但 status 更新失败，下次先按幂等键查询，而不是再次创建。
外部返回 unknown 时保持 Condition Unknown 并进入有限对账，不把未知猜成失败后立即重试。

缓存读适合大多数协调，但必须理解其延迟。
强一致前提检查可以使用 APIReader 直读，不过会增加 API server 压力；只在需要的关键点使用，并设置 deadline 与限流。

### RBAC、幂等、退避和状态条件怎样约束一个最小 Controller？

ServiceAccount 只授予所 watch 和修改的资源动词，不使用 cluster-admin。
多副本通过 leader election 避免重复主动控制，但幂等仍不可省略。

Status Conditions 使用稳定 type、status、reason、message 和 observedGeneration，让用户区分处理中、成功、暂时失败和永久失败。
临时错误按工作队列退避，永久输入错误等待 spec 变化，不做无限热循环。

#### Controller 验收矩阵

| 场景 | 预期观察 |
| --- | --- |
| 首次创建 | 只创建缺失资源并更新状态 |
| 重复 Reconcile | 无额外副作用 |
| 子资源被手工修改 | 按所有权策略恢复或保留 |
| API 冲突 | 重新读取后有限重试 |
| 权限不足 | 明确 Condition，不热循环 |
| 删除 | finalizer 清理完成后移除 |

#### RBAC 由代码调用反推

列出 Get/List/Watch/Create/Patch/Update/Delete 与 status/finalizers 子资源，再生成最小 Role。
能限定 namespace 就不用 ClusterRole；读取 Secret 需单独理由，绝不授予通配资源和动词作为默认。

#### Workqueue 退避

返回 error 通常触发 rate-limited requeue；明确时间事件可用 RequeueAfter；等待 spec 修正的永久错误更新 Condition 后不主动热循环。
不要同时 return error 和 RequeueAfter 期待精确时间，理解框架实际语义。

#### Condition 合并

Condition type 稳定，status/reason/message 表达结果，lastTransitionTime 只在 status 变化时更新。
observedGeneration 对应本次处理 spec。
更新前比较真实差异，避免无意义 status 写引发新事件。

#### Leader election 的边界

leader election 减少多个副本同时运行主动循环，却不是幂等替代。
故障切换时旧 leader 与新 leader 可能短暂重叠，单次 Reconcile 也可能重试。
外部副作用仍需幂等和并发控制。

#### Controller 测试证据

纯函数测 desired 与 condition；fake 测快速分支；envtest 测 CRD、status、冲突；隔离集群测实际 Job、RBAC 与删除。
注入 API 429、权限不足和缓存延迟，确认无热循环且状态可解释。

#### Controller 上线确认

envtest 覆盖 status、冲突和 finalizer，隔离集群覆盖真实 RBAC、Job 与删除。
重复 Reconcile 不产生写；API 429 有退避；无效 spec 等待变更；权限不足生成稳定 Condition。
多副本切换后仍无重复外部副作用。

#### Condition 和冲突是公开契约

Condition 使用稳定 type，status 为 True/False/Unknown，reason 供机器聚合，message 供人阅读，`observedGeneration` 表示控制器处理到哪个 spec 版本。
只有状态真正改变时更新 transition time，避免每次 Reconcile 都写 status 形成事件热循环。

更新冲突时重新读取并重算，不能直接覆盖。
predicate 过滤无关 status 更新可减少无效入队，但不能丢掉 spec、删除和所依赖对象变化。
workqueue 退避保护 API server；leader election 避免多副本同时承担非幂等全局职责，但不能替代 Reconcile 幂等。

测试按纯函数、fake client、envtest 和隔离集群分层。
反复调用 Reconcile 证明第二次无写入；制造 resourceVersion 冲突、API 429、权限撤销、缓存陈旧和控制器重启，确认最终收敛且没有重复副作用。

#### 永久错误和暂时错误分流

无效 spec、缺少必填引用等问题在用户修改前不会自愈，更新稳定 Condition 后等待新事件；网络超时、429 和冲突属于暂时错误，交给 workqueue 有界退避。
认证或 RBAC 被撤销通常需要人工修复，持续热重试只会污染日志和 API server。

每类错误对应指标、reason 和下一动作。
测试断言重试次数与时间上限，不只断言最终返回 error；恢复权限或修正 spec 后再触发事件，确认对象能够离开失败状态。

## 第二十章 · 用一个巡检系统收束组件选择与交付责任

### 从 CLI 到 Backend、Worker、Agent 和 Controller 的升级证据是什么？

最终系统从单二进制 CLI 起步。
多人共享状态增加 Backend；任务需重启恢复才拆 Worker；必须本地采集才装 Agent；需要持续协调 Kubernetes 自定义期望状态才写 Controller。

| 组件 | 本次证据 | 不引入时替代 | 新增成本 |
| --- | --- | --- | --- |
| Backend | 多人共享与集中审计 | CLI 输出到现有系统 | 服务、数据库、认证 |
| Worker | 长任务恢复与独立扩缩容 | 进程内有界任务 | 队列或任务领取、监控 |
| Agent | 本地采集和网络隔离 | 中心 API 调用 | 分发、升级、失联治理 |
| Controller | CRD 与持续协调 | client-go 单次操作 | RBAC、状态、重试、兼容 |

没有证据的 Redis、MQ、WebSocket 和时序库写入显式排除，并定义重新评估阈值。

#### 最终选型确认单

确认单记录运行位置、规模、外部系统、已有基础设施、失败恢复、已选组件、部署单元、显式排除和升级触发器。
任何仍会改变组件组成的开放项都使结论保持 draft。
团队已有栈优先于抽象跑分，但不能覆盖明确的安全或可靠性要求。

#### 组件升级按证据发生

第一版 CLI 收集真实任务耗时和失败；多人协作与状态保留推动 Backend；重启丢任务推动持久任务表；执行影响 API 延迟推动 Worker；中心不可达推动 Agent；持续期望协调推动 Controller。
每次只增加解决当前约束的组件。

#### 已有基础设施优先

团队已有 PostgreSQL、OIDC、Prometheus 和 GitOps 时优先复用其可靠性与值班体系。
Redis、MQ、WebSocket 或时序库只有在关系库任务表、轮询和现有监控无法满足量化要求时引入。
复用也要确认容量和 owner，不能当作免费。

#### 部署单元与代码模块分开

Backend 和 worker 可以先共享模块但拥有两个 cmd；也可在低规模下同进程运行。
代码拆包不等于微服务，进程拆分才新增发布、网络和故障边界。
选型表同时记录代码边界和部署边界。

#### 决策复核

上线后按阈值复查：任务 p95、失败恢复、主机覆盖、API 负载和 Reconcile 频率。
若复杂组件长期没有提供预期收益，也应允许合并或移除，而不是架构只增不减。

#### 选型结论的交接

另一位维护者应能只看确认单说出每个组件解决什么约束、由谁值班、如何部署和何时升级。
把未知项、排除项和复核日期保留在文档。
若组件没有对应监控、runbook 和 owner，就还不是可运营设计。

#### 安全与运行基线逐项落表

最终选型必须明确配置与 Secret、健康检查、优雅退出、结构化日志、超时、有限重试、并发、幂等、数据库迁移与备份、审计、长任务取消与恢复、远程动作白名单、SSH/Token/Kubernetes 凭证和结果保留期。
没有涉及的项目写“不适用及原因”，不能直接省略。

基础能力优先由标准库、框架和已有平台实现。
OpenTelemetry、Redis、MQ、独立日志平台、Worker 或 Agent 只有在当前方案无法满足量化约束时升级。
每个升级项写触发指标、观察窗口、责任人和回退方案。

#### 选型记录保留排除与升级条件

```text
语言: Go, 原因是单二进制 Agent 和受控并发
当前部署: Backend 与短任务同进程
复用设施: PostgreSQL OIDC Prometheus GitOps
显式排除: Redis MQ WebSocket 时序库 独立 Worker
升级触发: 任务跨重启恢复或 API 与执行需要独立扩缩
复核日期与 owner: required
```

这份记录必须同时覆盖 Secret、健康、日志、超时、幂等、迁移、审计、取消、凭证与保留期。
仍会改变组件组成的规模、网络或恢复要求若未知，结论保持 draft，不能写“即可进入实现”。

### Helm 与 GitOps 如何消费制品，而不是替应用补运行基线？

Helm 描述镜像、配置、ServiceAccount、探针和资源预算；GitOps 控制声明的评审与收敛。
它们无法替应用补上超时、幂等、优雅退出或迁移兼容性。

Chart 值不存真实 Secret，镜像使用 digest 或不可变标签，变更通过 diff 和策略门禁。
部署成功只代表编排器接受资源，还需检查 rollout、事件、探针、日志、指标与业务冒烟。

GitOps 回滚的是声明，不一定能撤销数据库写入和远程命令。
应用仍需暴露版本、健康状态与安全迁移路径，并把不可逆动作放在人工确认和独立备份之后。

#### 分清三种成功

Git 提交合并表示声明已批准，控制器 Synced 表示声明已应用，应用 Ready 与业务冒烟才表示服务可用。
周边依赖和真实业务结果仍可能失败。
发布报告必须精确说明验证到哪一层，不能用绿色同步图标替代运行证据。

#### Chart 的参数边界

values 只暴露环境间真实变化的镜像摘要、副本、资源、入口和 Secret 引用。
不要把整个 Pod spec 变成任意 map，绕过 Chart 提供的安全默认。
values schema 校验类型和范围，模板渲染后再做策略与 Kubernetes schema 检查。

#### Secret 不进入明文 Git

Git 保存 Secret 引用或加密对象，解密权限和轮换由平台方案控制。
渲染日志、diff、错误和测试 fixture 都不能泄露明文。
轮换时验证新旧凭证重叠、Pod reload/restart 和撤销时间。

#### GitOps 漂移处理

明确哪些字段由 GitOps 管、哪些由 HPA 或 Controller 管，避免双方持续互相覆盖。
生产手工修改默认会被收敛回 Git；紧急变更后必须回写声明或按流程撤销，不能长期依赖漂移。

#### Hook 和迁移风险

Helm hook 失败、重复执行和删除策略需要显式设计。
数据库迁移不应因每个副本启动而并发执行；使用独立 Job、锁与版本记录。
GitOps 重试 Job 时迁移仍需幂等。

#### 交付练习

渲染两个环境 values，检查只有预期差异；策略验证非 root、资源和摘要；同步隔离 namespace 后运行 smoke 和 SIGTERM。
手工制造漂移，观察 GitOps 收敛；回滚声明并确认应用而非只有 Sync 恢复。

#### GitOps 交付验收

先离线渲染并验证 schema/策略，再同步隔离 namespace，最后检查 rollout、事件、探针、日志、指标和业务 smoke。
制造手工漂移验证所有权，轮换 Secret，回滚到旧 digest。
每一步分别标注 Rendered、Synced 与 Runtime Verified。

#### values schema 与字段所有权

values schema 对副本、资源、URL、枚举和必填 Secret 引用做类型与范围校验。
Chart 不接受任意 Pod spec 注入，也不把安全上下文做成默认可关闭的总开关。
渲染后用 Kubernetes schema 与策略检查，才能发现模板产出层的问题。

GitOps、HPA 和业务 Controller 必须各自拥有清晰字段。
例如 GitOps 管 Deployment 模板，HPA 管 replicas，TargetReconciler 管自己创建的 Job；多个管理者写同一字段会持续抖动。
手工紧急修改后要回写声明或明确撤销，不能把漂移当作长期配置。

迁移 Job 使用不可变镜像、版本锁和幂等机制，失败不会被 Helm hook 删除到无证据。
发布报告分别保存 `helm template`/schema、GitOps revision/Synced、rollout 与业务 smoke，三层任何一层失败都不能用另一层绿色状态覆盖。

#### Helm 回滚不等于数据恢复

回滚 chart 前检查迁移、CRD schema、任务 payload 与外部副作用。
旧应用若不理解当前 schema，应阻止危险回滚并选择前滚修复。
迁移 Job 记录版本、锁、开始/结束和恢复步骤，重复运行仍安全。

隔离环境中实际执行一次新版本同步、业务 smoke、手工漂移、Secret 轮换和旧 digest 回滚。
最终报告把模板、集群对象和业务结果分开列证据。

### 怎样演练超时、重复提交、进程退出和依赖故障？

综合演练使用隔离目标，保存输入、版本、时间线、观察和恢复证据：

1. HTTP 依赖延迟超过 deadline，确认取消传播和退出码。
2. 同一幂等键重复提交，确认只产生一次副作用。
3. 在任务运行中发送 SIGTERM，确认摘流、状态和限时退出。
4. 数据库短暂不可用，确认有限重试且不会制造重启风暴。
5. Agent 断网并填满缓冲，确认背压和保留策略。
6. Controller 重复 Reconcile，确认资源不反复抖动。

最终交付清单包含源码、锁定依赖、测试、二进制、摘要、SBOM、部署声明、配置 schema、最小权限、监控、runbook 和回滚记录。
能由另一位维护者在隔离环境重放，才算完成，而不是“我的机器上跑过”。

#### 演练记录必须支持复盘

每次记录假设、注入方式、开始与结束时间、版本、预期、实际观察、恢复动作和遗留问题。
没有出现预期故障可能是注入失败，不应直接标为通过。
演练结束后核对测试资源、临时凭证和本地缓冲均已清理，再把改进项转成测试、告警或 runbook 变更。

#### 第五册综合实验：从容器运行基线到最小 Controller

先给普通 Go 服务建立最小权限部署，不要一开始就创建 CRD：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ops-check
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ops-check
  template:
    metadata:
      labels:
        app: ops-check
    spec:
      serviceAccountName: ops-check
      terminationGracePeriodSeconds: 20
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          image: registry.example.invalid/ops-check@sha256:REPLACE_ME
          ports:
            - name: http
              containerPort: 8080
          readinessProbe:
            httpGet:
              path: /readyz
              port: http
            periodSeconds: 5
            timeoutSeconds: 1
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            periodSeconds: 10
            timeoutSeconds: 1
          resources:
            requests:
              cpu: 20m
              memory: 32Mi
            limits:
              cpu: 200m
              memory: 128Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir:
            sizeLimit: 32Mi
```

`REPLACE_ME` 明确阻止示例被误当成可直接部署的生产清单。
部署前还应添加 namespace、ServiceAccount、NetworkPolicy 和真实镜像摘要；是否需要 Service、Ingress、PVC 或 Secret 由需求决定，不作为默认套餐。

当需求变成“持续保证每个声明的巡检目标都有对应 Job，并把结果写回状态”时，才出现 Controller 证据。
Reconcile 的骨架应是幂等的：

```go
func (r *TargetReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	var target opsv1.Target
	if err := r.Get(ctx, req.NamespacedName, &target); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	desired := buildJob(&target)
	var current batchv1.Job
	err := r.Get(ctx, client.ObjectKeyFromObject(desired), &current)
	switch {
	case apierrors.IsNotFound(err):
		if err := ctrl.SetControllerReference(&target, desired, r.Scheme); err != nil { return ctrl.Result{}, err }
		if err := r.Create(ctx, desired); err != nil { return ctrl.Result{}, err }
	case err != nil:
		return ctrl.Result{}, err
	default:
		// 已存在时比较由本 Controller 拥有的字段，只更新真实差异。
	}

	return ctrl.Result{}, r.updateStatus(ctx, &target, "Reconciling", "JobObserved")
}
```

这段代码是结构示例，依赖项目自己的 API 类型，不能单独编译。
正式实现必须补齐 predicate、字段所有权、冲突重试、Condition、observedGeneration、finalizer 和 RBAC 标记，并用 envtest 验证真实 API 行为。

综合验收按顺序执行：清单静态校验；隔离 namespace 部署；检查非 root 与只读文件系统；发送 SIGTERM；扩到两个副本；验证连接总量和任务去重；再运行 Controller 的创建、重复 Reconcile、冲突、权限不足和删除测试。
任何一步失败都回到当前层修复，不用 Helm 或 GitOps 的“同步成功”掩盖应用问题。

#### Agent 的本地职责与中心职责

Agent 只应承担必须靠近目标机的能力，例如读取本机 procfs、访问 Unix socket、采集本地设备信息或执行严格受控的诊断。
配置策略、跨主机调度、全局去重、长期数据保存和用户权限通常属于中心端。
边界不清会让每台主机复制一套难以升级的业务逻辑。

一个可评审的 Agent 协议至少包含：

| 字段 | 作用 | 安全约束 |
| --- | --- | --- |
| `agent_id` | 稳定标识实例/主机 | 由注册流程签发，不信任任意自报值 |
| `version` | 协议与制品版本 | 支持中心端判断兼容范围 |
| `capabilities` | 声明可执行能力 | 不能由指令临时扩大 |
| `command_id` | 指令唯一标识 | 持久去重，防止重放 |
| `issued_at/expires_at` | 指令有效窗口 | 校验可信时钟与最大窗口 |
| `attempt` | 执行尝试 | 服务端与 Agent 共同限制 |
| `result_digest` | 结果完整性 | 大结果分块并校验 |

轮询不是低级方案：在出站网络受限、无需实时推送的环境中，它更易穿过防火墙和控制连接规模。
轮询间隔加随机抖动；长轮询设置总超时；服务器返回空任务时不要忙循环。
WebSocket 只有在实时性收益足以覆盖连接治理、负载均衡和断线恢复成本时才引入。

#### 断网缓冲的容量与丢弃策略

假设单条采集结果压缩后 4KiB，每分钟 60 条，希望离线 6 小时：单 Agent 原始需求约 `4KiB × 60 × 360 = 84.4MiB`，还没计算索引、元数据和写放大。
部署 10,000 台就是数百 GiB 的边缘存储责任，因此离线目标必须明确而非“尽量缓存”。

缓冲队列需要记录最大字节数、最大条数、最大年龄和磁盘最低剩余空间。
达到上限时选择必须明确：丢最旧数据、拒绝新数据、只保留聚合值，或暂停非关键采集。
无论哪种都要增加 dropped counter 和健康原因，不能静默覆盖。

结果上传使用批次 ID 与单条事件 ID；中心端幂等写入并返回已确认游标；Agent 只有收到确认才推进本地游标。
崩溃恢复测试要覆盖：写入一半、上传后未收到确认、确认后未删除、磁盘满、文件损坏。
若数据重要到不能丢，应选成熟消息系统或本地数据库，不要自行发明日志格式后宣称“可靠队列”。

#### 远程执行的最小安全模型

远程指令使用动作枚举和结构化参数，例如 `collect_journal{unit, since, max_bytes}`，而不是传任意 shell。
每个动作定义允许参数、路径范围、资源上限、超时、最大输出和所需权限。
Agent 进程以专用低权限用户运行，需要提权的极少动作通过单独 helper 与精确 sudo/polkit 规则完成。

执行前验证：指令签名或受认证通道、目标 agent、有效期、command ID、动作白名单、参数 schema 和本地策略版本。
执行中限制 CPU、内存、文件描述符、进程数与输出。
执行后写不可抵赖审计，上传结果摘要，并把 command ID 持久标记为完成。
中心端重发同一 ID 时返回旧结果或“已完成”，不能再次执行副作用。

break-glass 操作必须有短有效期、审批引用、强审计和事后撤销。
禁止设计“隐藏的万能命令”绕过白名单；它最终会成为攻击者最有价值的入口。

#### systemd 与容器两种运行基线

主机 Agent 常由 systemd 管理。
示例基线：

```ini
[Unit]
Description=Operations collection agent
After=network-online.target
Wants=network-online.target

[Service]
User=ops-agent
Group=ops-agent
ExecStart=/usr/local/bin/ops-agent --config=/etc/ops-agent/config.yaml
Restart=on-failure
RestartSec=5s
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/ops-agent
StateDirectory=ops-agent
RuntimeDirectory=ops-agent
LimitNOFILE=4096
TimeoutStopSec=20s

[Install]
WantedBy=multi-user.target
```

权限选项必须在目标发行版实测；Agent 若确实需要读取受保护路径，应只开放必要目录，不能遇到权限错误就改回 root。
升级流程保留旧二进制和配置备份，启动新版本后等待健康确认，失败自动恢复旧版本。
配置 schema 要有版本与向后兼容策略。

容器内同样坚持非 root、只读根文件系统、明确 writable volume、丢弃 Linux capabilities 和 seccomp。
镜像使用摘要部署；`latest` 不能证明版本。
若 Go 程序使用时区、CA 或 CGO，极简镜像必须显式包含相应运行数据，不能只看镜像体积。

#### 制品可追溯链

一次发布应能从运行实例追溯到源码：

```text
commit/tag
  -> locked module graph + Go/toolchain version
  -> reproducible build flags
  -> binary checksum + SBOM + provenance
  -> image digest + signature
  -> manifest/Helm values pin digest
  -> deployment revision
  -> runtime /version output
```

`-trimpath` 减少本地路径泄露；版本、commit 和构建时间可通过 `-ldflags` 注入，但构建时间会影响可复现性，若需要可复现构建应使用固定的 `SOURCE_DATE_EPOCH` 语义或把时间放在外部元数据。
签名证明由谁发布，校验和证明内容未变化，SBOM说明包含什么，它们职责不同。

多架构发布必须在真实或可信模拟目标上运行 smoke test。
`GOOS/GOARCH` 编译通过不能证明 syscall、证书、DNS、时区、文件权限与 CGO 行为正确。

#### 最小 Controller 的详细契约

Controller 的输入不是一次 HTTP 请求，而是“当前状态与期望状态有差异”的事件。
Reconcile 可以重复、并发、乱序和在任意一步后重启，因此每一步都要读取当前事实并只提交必要差异。

`spec` 表达用户期望，`status` 表达控制器最近观察到的事实：

```yaml
spec:
  target: https://example.com/health
  interval: 5m
status:
  observedGeneration: 7
  conditions:
    - type: Ready
      status: "False"
      reason: JobRunning
      message: latest inspection job has not completed
```

Condition 保持稳定 type，`reason` 供机器聚合，`message` 供人阅读，`lastTransitionTime` 只在状态真实转换时改变。
更新 status 使用 status subresource；冲突时重新读取并重算，不能盲目覆盖其他控制器字段。

OwnerReference 适合明确生命周期从属的 namespaced 资源；finalizer 用于删除外部资源。
finalizer 流程必须幂等：看到 deletionTimestamp 后检查外部对象是否存在；删除或确认不存在；移除 finalizer。
若外部 API 永久不可用，资源会卡在 terminating，因此需要告警、手工恢复手册和明确的强制移除风险。

#### RBAC 从调用清单推导

不要从示例复制 `verbs: ['*']`、`resources: ['*']`。
列出 Reconcile 每条 API 调用，再生成最小权限：读取自定义资源，更新 status，读取/创建/更新/删除自己管理的 Job，必要时创建 Event。
能用 namespace Role 就不使用 ClusterRole；只读 list/watch 与修改权限分开审查。

权限不足不是 panic 理由。
Controller 应记录资源键、动作与错误，更新可行的 Condition，并使用受限退避。
RBAC 测试既验证所需操作成功，也验证不应拥有的 Secret 删除、任意 namespace 修改等操作失败。

#### Controller 测试分层

- 纯函数测试：desired object 构建、名称规范化、Condition 合并、差异比较。
- fake client：快速覆盖简单 Get/Create 分支，但不证明 admission、defaulting 或真实冲突。
- envtest：运行真实 API server/etcd，验证 CRD、status、RBAC 相关行为和资源版本冲突。
- 隔离集群：验证 Job 实际调度、镜像、ServiceAccount、NetworkPolicy、探针和删除。
- 故障演练：重复事件、缓存陈旧、API 429、权限撤销、控制器重启、finalizer 外部删除失败。

测试应反复调用 Reconcile 并证明第二次无额外写入；故意制造资源冲突，证明重试后不会丢字段；删除 CR 时确认从属资源或外部资源按契约清理。

#### Helm 与 GitOps 的责任边界

Helm 负责参数化并渲染 Kubernetes 对象；GitOps 控制器负责把 Git 中的期望状态持续同步到集群。
二者都不能证明应用启动正确、任务不重复或迁移可回滚。

values 应暴露真正需要按环境变化的参数，例如镜像摘要、副本、资源、入口地址和外部 Secret 引用；不应把每个容器字段都变成模板开关。
敏感值不进入明文 Git；使用平台已有 Secret 管理方案，并测试轮换。

一次发布至少区分：

1. 渲染成功：模板语法和 schema 正确。
2. 同步成功：集群对象达到 Git 所声明的版本。
3. 运行成功：readiness、业务 smoke test、指标和错误预算正常。

自动回滚也要谨慎：数据库迁移或外部副作用不可逆时，回滚旧镜像可能更糟。
发布计划应提前声明前滚修复、应用回滚与数据恢复各由谁决定。

#### 全系统故障演练表

| 场景 | 注入点 | 关键观察 | 通过条件 |
| --- | --- | --- | --- |
| 中心端超时 | Backend 到依赖 | deadline、重试次数、任务状态 | 不无限重试，状态可恢复 |
| 重复提交 | API 幂等键 | task ID、数据库行数 | 只产生一个逻辑任务 |
| Worker 崩溃 | 执行中 kill | lease、attempt | 租约后安全重领 |
| Agent 断网 | 阻断出口 | buffer bytes、dropped | 有界缓存并明确降级 |
| Agent 磁盘满 | 限制 volume | 健康原因、采集策略 | 不破坏旧数据且可告警 |
| Controller 重启 | Reconcile 中 kill | 重复对象、Condition | 重启后收敛且无重复副作用 |
| API 限流 | 返回 429 | workqueue rate | 退避，无热循环 |
| SIGTERM | 滚动发布 | readiness、in-flight | 先摘流量，限时退出 |
| 权限撤销 | 删除 RBAC verb | 错误与告警 | 明确失败，不越权降级 |
| 回滚 | 部署旧版本 | schema/协议兼容 | 旧版本可运行或阻止危险回滚 |

每次演练记录假设、注入命令、开始与结束时间、指标截图或日志查询、实际结果、残留状态和改进负责人。
只写“演练成功”不能支持复盘。

#### 第五册完成标准

- 只有本地能力确有收益时部署 Agent，并量化每主机资源与升级成本；
- Agent 协议有身份、能力、过期、去重、资源上限与审计；
- 离线缓冲有容量、年龄、丢弃策略和崩溃恢复测试；
- 二进制、镜像、SBOM、签名、摘要与运行版本形成可追溯链；
- Kubernetes 清单满足非 root、只读根文件系统、资源限制、探针与优雅退出；
- 一次性读写集群使用客户端，只有持续协调才引入 Controller/CRD；
- Reconcile 幂等，Condition、observedGeneration、finalizer 和最小 RBAC 完整；
- Helm 渲染、GitOps 同步和应用运行分别验收；
- 超时、重复、崩溃、断网、限流、权限不足与回滚都完成演练并留下证据。

#### 运维设计模式索引

这里的“模式”不是需要背诵的名词表，而是已经在本系列代码中反复出现的责任分配方式。
使用模式前先写出它解决的运维问题、增加的状态和可以验证的证据；如果没有第二个真实变化点，就保留简单函数或结构体。

| 模式 | 本仓库中的落点 | 适用边界与验证 |
| --- | --- | --- |
| Ports and Adapters | [模块化单体与依赖方向](./04-backend-and-service-engineering.md) | 核心逻辑需要替换 HTTP、数据库或 SDK 时使用；测试替身不能代替真实集成验证 |
| Adapter | [最小接口与 SDK 边界](./01-language-foundations.md)、[SDK 章节](./04-backend-and-service-engineering.md) | 隔离厂商 API、CLI 或 Kubernetes client；适配器只转换协议，不偷偷加入业务重试 |
| Strategy | [分页、限流、重试和幂等](./03-system-automation-and-cli.md) | 错误分类或重试策略确实随环境变化时使用；每个策略都要有 deadline 和预算测试 |
| State Machine | [任务一致性](./04-backend-and-service-engineering.md)、[Controller Condition](#condition-和冲突是公开契约) | 状态和非法跃迁需要审计时使用；状态数量过少时不要为图而建状态机 |
| Decorator/Middleware | [HTTP 请求处理链](./04-backend-and-service-engineering.md)、[日志与审计](./04-backend-and-service-engineering.md) | timeout、日志、指标、鉴权等横切责任适合包裹；不得改变核心错误语义或重复记录 Secret |
| Producer-Consumer | [有界 worker pool](./02-concurrency-and-runtime.md)、[Agent 缓冲](#断网缓冲的容量与丢弃策略) | 生产速率和处理速率不同且需要背压时使用；队列必须有容量、丢弃和关闭协议 |
| Repository | [任务表与数据边界](./04-backend-and-service-engineering.md) | 需要替换持久化或隔离事务测试时使用；不能把真实 SQL 约束隐藏成内存 map 假设 |
| Functional Options | [构造函数与配置](./01-language-foundations.md) | 公共 Go 库选项多且需要保持兼容时使用；内部类型优先使用清晰的配置 struct |

索引中的链接指向真实章节；章节中的代码、测试和故障演练才是模式是否成立的证据。
Singleton、Abstract Factory、Visitor 和 Template Method 不作为本系列独立目标，除非出现无法用简单组合解决的实际维护问题。
