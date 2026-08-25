# Roadmap Animation Sample Index — Linux 性能优化

本 sidecar 为《Linux 性能优化学习笔记》roadmap 增加的教学动画。共 17 个，挂载在各 `####` 子标题之后。

## 已交付动画

| Animation | 章节 | 挂载子标题 | 模型 | 领域状态 |
|---|---|---|---|---|
| `cpu-context-switch` | 1.2 CPU 上下文切换 | 三类上下文切换 | Pipeline | 进程/线程/中断切换、页表/TLB 失效成本 |
| `process-state-machine` | 1.5 不可中断与僵尸进程 | 常见进程状态 | State machine | R/S/D/Z/T 迁移、D 不可中断、Z 回收链 |
| `softirq-half` | 1.6 理解软中断 | 上半部与下半部 | Pipeline / 交接 | 硬中断→软中断→ksoftirqd、si% 来源 |
| `cpu-quick-locate` | 1.8 CPU 快速定位流程 | 三个入口工具 | Decision pipeline | top→vmstat→pidstat 起手式、按指标分叉、完整闭环 |
| `vm-page-fault` | 2.1 内存管理机制速览 | 虚拟内存如何映射到物理内存 | Pipeline / path | 地址翻译(MMU/TLB/页表/缺页)、主/次缺页、Active/Inactive LRU |
| `memory-reclaim-watermark` | 2.5 Swap 频繁使用 | 内存水位与回收 | Feedback loop | min/low/high 水位、kswapd vs 直接回收、swappiness |
| `mem-quick-locate` | 2.6 内存快速定位流程 | 三层排查法 | Decision pipeline | 整体→趋势→专项、现象判断（free 低≠有压力）、泄漏定位 |
| `vfs-storage-path` | 3.1 文件系统工作原理 | VFS 与存储路径 | Pipeline | 应用→VFS→页缓存→FS→块层→设备下行栈、缓存命中分流、四类 FS 分流 |
| `io-quick-locate` | 3.7 I/O 快速定位流程 | 四步定位法 | Decision pipeline | iostat→pidstat→行为分析→根因、诊断必问十问、问题→工具对照 |
| `net-rx-tx-path` | 4.1 协议栈与收发流程 | 接收数据的关键路径 | Network path | RX/TX 逐层、ring/sk_buff/socket 三层缓冲 |
| `io-model-evolution` | 4.2 C10K→C1000K | I/O 模型的演进 | Timeline | 阻塞→select→poll→epoll 演进、LT/ET 触发、C1000K 资源墙 |
| `dns-resolve-path` | 4.4 DNS 解析时快时慢 | 先理解解析路径 | Network path | 解析路径(本地→递归→根/TLD/权威)、首慢后快=命中缓存、三类故障证据链 |
| `net-latency-nagle` | 4.7 网络请求延迟变大 | 延迟确认与 Nagle 的相互作用 | Timeline / protocol | 延迟分解(curl -w)、Nagle×延迟 ACK 的 40ms 死锁、延迟排查流程 |
| `packet-drop-path` | 5.2 服务器偶发丢包 | 丢包路径全景 | Network path | 五层丢包点、逐层计数器、tcpdump 夹逼 |
| `throughput-drop-funnel` | 5.5 服务吞吐量骤降 | 先确认吞吐是否真实下降 | Funnel / pipeline | 先确认真降(成功 vs 总吞吐)、四瓶颈漏斗(conntrack/worker/队列/端口)、迭代闭环+火焰图 |
| `golden-signal-triage` | 5.7 应用监控的设计思路 | 黄金信号 | Decision pipeline | 四信号分叉、逐信号下钻(延迟/流量/错误/饱和→处置)、级联失败+易错提醒；配套笔记 5.7 已加分诊树 |
| `perf-method-5step` | 5.8 性能问题分析通用步骤 | 第一步：明确问题 | State machine / pipeline | 五步法、从业务到资源(USE+RED)、假设验证证据链 |

## 复用基元（来自 shared-runtime）

tabs、play/pause、step、reset、speed、zoom 浮层、Esc 顺序、drawer 观察挂载，均由 `shared-runtime.html` 提供。各 fragment 只负责自己的 SVG 几何、状态机/管线步骤、领域文案与 panel。

## 风格基线

米黄纸张底、黑墨边框、`box-shadow` 立体卡片，与 roadmap 主题一致。配色语义：蓝=当前、绿=完成、琥珀=警惕、红=故障/死锁/丢包点。

## 后续可扩展候选（未做）

已交付批次覆盖：CPU/内存/I/O 三章主干 + 网络收发/演进/DNS/延迟 + 综合方法论五步法。仍可继续扩展（边际递减，按需取用）：

- 5.4 动态追踪「三类事件源 + 从问题选探针」→ decision-pipeline（ftrace / perf probe / eBPF 的取舍）
- 3.1 readiness vs completion（epoll / io_uring + 阻塞·非阻塞·同步·异步四象限）→ 同节可再挂一个
- 4.6 SYN flood + 半连接/全连接队列被打满 → queue/state
- 4.8 NAT / conntrack 端口冲突与表满 → path/table
- 5.1 容器冷启动事件时间线 → timeline

不建议做动画（纯定义/对照表/清单/方法论）：2.2 Buffer vs Cache、2.3 缓存命中率、各章「优化手段」清单、5.6 USE / 5.7 RED·黄金信号、5.10 工具速查、答疑章节。
