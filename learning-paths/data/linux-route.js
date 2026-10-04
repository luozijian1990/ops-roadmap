window.OPS_LINUX = {
  "stages": [
    {
      "title": "准备一间自己的实验室",
      "sub": "认识环境，建立安全的练习习惯",
      "task": "交付一台可以重建的实验服务器",
      "proof": "记录系统版本、网络与资源配置。用 SSH 登录，创建普通账号，并验证虚拟机快照恢复。"
    },
    {
      "title": "管理一台 Linux 服务器",
      "sub": "从命令操作，到理解系统如何运行",
      "task": "让一个服务在重启后自动恢复",
      "proof": "为示例应用编写 systemd 服务。故意写错启动路径，通过状态和日志定位，再修复并验证开机启动。"
    },
    {
      "title": "看懂一次网络请求",
      "sub": "从 DNS 到应用，逐层定位连接问题",
      "task": "画出请求路径，并修好三个故障",
      "proof": "在实验环境制造 DNS 错误、端口未监听、证书不匹配，分别保留诊断命令、现象与修复证据。"
    },
    {
      "title": "部署第一套业务系统",
      "sub": "把入口、应用和数据连接起来",
      "task": "交付一个带数据库的 HTTPS 网站",
      "proof": "使用现成示例应用，配置反向代理与独立数据库账号。完成一次版本升级和回滚，确认原有数据仍可读取。"
    },
    {
      "title": "发现问题，也能恢复服务",
      "sub": "监控、日志、备份与故障处理",
      "task": "完成一次故障响应与数据恢复演练",
      "proof": "制造一次服务停止，让告警触发；恢复服务并确认告警解除。再把备份恢复到隔离实例，核对数据。"
    },
    {
      "title": "把重复工作变成可靠流程",
      "sub": "脚本、版本管理与运维交接",
      "task": "交付你的第一份运维作品",
      "proof": "整理部署脚本、监控配置、恢复记录与运行手册。让另一位同学按文档完成部署，并记录遇到的问题。"
    }
  ],
  "nodes": [
    {
      "id": "lab",
      "stage": 0,
      "title": "实验环境与服务器",
      "sub": "虚拟机 · 资源 · SSH",
      "level": "会用",
      "scope": "必修",
      "pre": "无；从这里开始",
      "topics": [
        "理解 CPU、内存、磁盘与操作系统的关系",
        "安装一台 Linux 虚拟机，配置网络和快照",
        "理解本地终端、远程主机与 SSH 会话的区别"
      ],
      "outcome": "能独立创建实验主机，登录并记录配置。",
      "exercise": "创建普通用户，通过 SSH 登录；从快照恢复一次错误配置。",
      "boundary": "暂不要求安装物理服务器或建设虚拟化集群。",
      "resource": "systems/linux/README.md"
    },
    {
      "id": "terminal",
      "stage": 0,
      "title": "终端与文件操作",
      "sub": "目录 · 编辑器 · 帮助文档",
      "level": "会用",
      "scope": "必修",
      "pre": "实验环境与服务器",
      "topics": [
        "绝对与相对路径，ls/cd/cp/mv/find",
        "使用 less、head、tail 查看内容，用编辑器修改配置",
        "查阅 man 和 --help，理解命令参数"
      ],
      "outcome": "能找到配置、修改文件并验证差异。",
      "exercise": "创建练习目录，复制配置、查找文件，并撤销一次错误修改。",
      "boundary": "不需要背下所有命令；先养成查阅手册的习惯。",
      "resource": "systems/linux/README.md"
    },
    {
      "id": "permissions",
      "stage": 0,
      "title": "用户、权限与安全习惯",
      "sub": "用户组 · sudo · SSH 密钥",
      "level": "会排障",
      "scope": "必修",
      "pre": "终端与文件操作",
      "topics": [
        "用户与用户组、rwx 权限和文件归属",
        "sudo 的职责、SSH 密钥与口令保护",
        "最小权限；变更前备份，先在实验环境验证"
      ],
      "outcome": "能解释权限拒绝的原因，并按实际需要授权。",
      "exercise": "用两个用户验证文件访问权限；给服务账号仅授予必要目录权限。",
      "boundary": "不以 chmod 777 或长期使用 root 作为通用修复。",
      "resource": "systems/linux/README.md"
    },
    {
      "id": "docs",
      "stage": 0,
      "title": "读文档与记录实验",
      "sub": "Markdown · 命令证据 · 英文检索",
      "level": "会用",
      "scope": "必修",
      "pre": "终端与文件操作",
      "topics": [
        "记录环境、前置条件、步骤、预期和实际结果",
        "识别官方文档版本与示例适用范围",
        "用错误原文检索，隐藏日志中的密钥和个人信息"
      ],
      "outcome": "能写出别人可以重复执行的实验记录。",
      "exercise": "为 SSH 登录编写一页操作说明，包含一个失败案例及修复过程。",
      "boundary": "不要求英语流利；先读懂常见提示与技术关键词。",
      "resource": null
    },
    {
      "id": "packages",
      "stage": 1,
      "title": "软件包与运行环境",
      "sub": "apt / dnf · 仓库 · 环境变量",
      "level": "会用",
      "scope": "必修",
      "pre": "终端与文件操作",
      "topics": [
        "理解软件仓库、包版本与依赖",
        "选择一种发行版掌握安装、查询和卸载",
        "区分 PATH、工作目录与配置文件位置"
      ],
      "outcome": "能安装指定软件，检查版本与配置来源。",
      "exercise": "安装 Nginx，找到可执行文件、配置和日志路径，记录版本。",
      "boundary": "先深入一种发行版，不必同时精通所有包管理器。",
      "resource": "systems/linux/README.md"
    },
    {
      "id": "services",
      "stage": 1,
      "title": "进程与服务管理",
      "sub": "systemd · journalctl · 定时任务",
      "level": "会排障",
      "scope": "必修",
      "pre": "软件包与运行环境、用户权限",
      "topics": [
        "查看进程、PID、监听端口和进程退出状态",
        "管理 systemd unit、依赖、开机启动与运行用户",
        "使用 journalctl 和 cron，检查任务环境与日志"
      ],
      "outcome": "能把应用作为服务运行，定位启动失败和异常退出。",
      "exercise": "写一个 systemd unit；故意配置错误路径，再通过日志修复并重启验证。",
      "boundary": "先理解生命周期，不必深入调度器或内核源码。",
      "resource": "systems/linux/02-processes-and-scheduling.md"
    },
    {
      "id": "storage",
      "stage": 1,
      "title": "磁盘与文件系统",
      "sub": "挂载 · 容量 · inode · 日志轮转",
      "level": "会排障",
      "scope": "必修",
      "pre": "终端与文件操作",
      "topics": [
        "用 lsblk、df、du 查看设备、空间和 inode",
        "理解挂载点与 fstab，认识块存储和文件系统",
        "处理日志增长与已删除但仍被占用的文件"
      ],
      "outcome": "能区分空间不足、inode 耗尽和挂载错误。",
      "exercise": "在独立实验盘中创建和挂载文件系统，验证持久挂载并配置日志轮转。",
      "boundary": "分区和格式化仅在可丢弃的实验盘练习。",
      "resource": "systems/linux/04-filesystems-and-io.md"
    },
    {
      "id": "resources",
      "stage": 1,
      "title": "系统资源与基础排障",
      "sub": "CPU · 内存 · 负载 · IO",
      "level": "会排障",
      "scope": "必修",
      "pre": "进程与服务管理、磁盘与文件系统",
      "topics": [
        "使用 top、free、vmstat、iostat 和系统日志",
        "区分 CPU 使用率、负载、可用内存和 IO 等待",
        "从异常现象收集证据，再缩小定位范围"
      ],
      "outcome": "能判断瓶颈偏向计算、内存还是存储，并说明证据。",
      "exercise": "在实验机运行受限负载，记录正常与异常数据，对比进程和系统指标。",
      "boundary": "暂不要求高级内核调优；避免看到高负载就盲目改参数。",
      "resource": "systems/linux-performance/README.md"
    },
    {
      "id": "tcp",
      "stage": 2,
      "title": "IP、路由与 TCP/IP",
      "sub": "子网 · 网关 · 端口 · NAT",
      "level": "会排障",
      "scope": "必修",
      "pre": "实验环境与服务器",
      "topics": [
        "理解 IP/掩码、默认网关、路由与 TCP/UDP",
        "识别监听地址、连接方向和 NAT 的作用",
        "使用 ip、ss、ping 与 traceroute 收集证据"
      ],
      "outcome": "能说明两台机器如何通信，区分不通、拒绝与超时。",
      "exercise": "在两台虚拟机之间启动服务，验证监听地址与访问地址变化的影响。",
      "boundary": "先掌握主机网络，不必先学习复杂路由协议。",
      "resource": "systems/network-fundamentals/README.md"
    },
    {
      "id": "dns",
      "stage": 2,
      "title": "DNS 与域名解析",
      "sub": "记录类型 · 缓存 · dig",
      "level": "会排障",
      "scope": "必修",
      "pre": "IP、路由与 TCP/IP",
      "topics": [
        "理解 A/AAAA/CNAME 记录与解析链路",
        "区分系统解析器、hosts 与 DNS 缓存",
        "使用 dig/getent 检查结果，结合 curl 验证访问"
      ],
      "outcome": "能区分域名解析失败与应用服务失败。",
      "exercise": "配置一个测试域名或本地 hosts 映射，制造错误地址并定位修复。",
      "boundary": "暂不要求运营权威 DNS 服务。",
      "resource": "systems/network-fundamentals/02-transport-routing-and-services.md"
    },
    {
      "id": "http",
      "stage": 2,
      "title": "HTTP 与 HTTPS",
      "sub": "状态码 · 请求头 · TLS 证书",
      "level": "会排障",
      "scope": "必修",
      "pre": "DNS 与域名解析",
      "topics": [
        "理解请求方法、响应码、请求头与反向代理",
        "认识 TLS、证书链、域名匹配与有效期",
        "使用 curl 检查响应、重定向与握手问题"
      ],
      "outcome": "能区分 HTTP 错误与 TLS 错误，验证证书和服务响应。",
      "exercise": "查看一次 HTTPS 请求，解释响应码、证书域名与过期时间。",
      "boundary": "先掌握证书使用与诊断，不要求实现加密算法。",
      "resource": "systems/network-fundamentals/README.md"
    },
    {
      "id": "firewall",
      "stage": 2,
      "title": "网络访问与防火墙",
      "sub": "访问控制 · 抓包 · 分层排障",
      "level": "会排障",
      "scope": "必修",
      "pre": "IP、路由与 TCP/IP、HTTP 与 HTTPS",
      "topics": [
        "检查主机防火墙规则、入站与出站方向",
        "按解析→路由→端口→TLS→应用逐层检查",
        "使用 tcpdump 观察限定地址和端口的流量"
      ],
      "outcome": "能依据证据定位访问被阻断的位置。",
      "exercise": "在实验机仅放行 SSH 与 Web 端口，验证允许与拒绝的连接。",
      "boundary": "变更访问规则前保留恢复通道，抓包仅使用测试流量。",
      "resource": "systems/network-fundamentals/03-sockets-security-and-troubleshooting.md"
    },
    {
      "id": "nginx",
      "stage": 3,
      "title": "Nginx 与反向代理",
      "sub": "虚拟主机 · upstream · 访问日志",
      "level": "会排障",
      "scope": "必修",
      "pre": "HTTP 与 HTTPS、进程与服务管理",
      "topics": [
        "配置 server/location 与反向代理",
        "区分静态资源、上游服务与请求超时",
        "先验证配置再 reload，结合访问和错误日志诊断"
      ],
      "outcome": "能把应用接到统一入口，排查常见 404 与 502。",
      "exercise": "代理两个本地应用实例，停止一个实例，观察并解释访问结果。",
      "boundary": "负载均衡算法和高并发调优留待进阶。",
      "resource": "web/nginx/README.md"
    },
    {
      "id": "runtime",
      "stage": 3,
      "title": "应用部署与回滚",
      "sub": "配置 · 依赖 · 健康检查",
      "level": "会用",
      "scope": "必修",
      "pre": "软件包与运行环境、Nginx",
      "topics": [
        "选一种应用运行时，理解版本、依赖与启动方式",
        "分离代码、配置、日志与持久数据",
        "保存上一版本，定义健康检查与回滚条件"
      ],
      "outcome": "能按文档部署应用，并在失败后恢复上一版本。",
      "exercise": "部署一个现成示例应用，发布有缺陷的版本，再回滚并核对数据。",
      "boundary": "不要求同时精通 Java、Python 和 Node.js。",
      "resource": "programming/python-for-operations/README.md"
    },
    {
      "id": "mysql",
      "stage": 3,
      "title": "SQL 与 MySQL 基础",
      "sub": "查询 · 权限 · 连接 · 备份",
      "level": "会用",
      "scope": "必修",
      "pre": "应用部署与回滚、网络基础",
      "topics": [
        "基础 SELECT、过滤与连接，理解事务和索引用途",
        "创建独立应用账号，控制连接和库表权限",
        "查看连接、错误日志和慢查询入口，执行备份恢复"
      ],
      "outcome": "能支持应用连接数据库，识别权限或连接问题。",
      "exercise": "给示例应用创建最小权限账号，写入数据，并把备份恢复到测试库验证。",
      "boundary": "复制、高可用与复杂 SQL 调优属于数据库进阶。",
      "resource": "data-systems/mysql/README.md"
    },
    {
      "id": "redis",
      "stage": 3,
      "title": "Redis 与缓存基础",
      "sub": "过期 · 内存 · 持久化",
      "level": "会用",
      "scope": "选修",
      "pre": "应用部署与回滚、网络基础",
      "topics": [
        "理解键值、TTL、缓存与数据库的区别",
        "观察连接、内存与淘汰策略",
        "理解 RDB/AOF 的用途及数据丢失边界"
      ],
      "outcome": "能接入实验缓存并检查状态，不把缓存默认当永久数据。",
      "exercise": "写入带 TTL 的测试键，观察过期；重启测试实例并解释数据是否保留。",
      "boundary": "本路线可选；岗位要求缓存运维时再深入。",
      "resource": null
    },
    {
      "id": "monitoring",
      "stage": 4,
      "title": "监控与告警",
      "sub": "Prometheus · Grafana · 可行动告警",
      "level": "会用",
      "scope": "必修",
      "pre": "系统资源与基础排障、应用部署",
      "topics": [
        "采集主机、服务与接口健康指标",
        "配置看板、阈值、持续时间和通知",
        "为告警记录影响、检查步骤与恢复标准"
      ],
      "outcome": "能让异常被发现，并验证恢复后告警解除。",
      "exercise": "部署主机监控，停止测试服务，观察告警触发、通知与恢复全过程。",
      "boundary": "先学透一套监控；Zabbix 可按目标岗位替换选学。",
      "resource": "observability/prometheus/README.md"
    },
    {
      "id": "logs",
      "stage": 4,
      "title": "日志分析与关联",
      "sub": "时间线 · 请求标识 · 错误定位",
      "level": "会排障",
      "scope": "必修",
      "pre": "文本操作、应用部署与回滚",
      "topics": [
        "区分入口、应用、数据库与系统日志",
        "围绕时间窗口、请求标识和错误信息关联证据",
        "配置轮转和保留策略，理解集中日志的用途"
      ],
      "outcome": "能沿一次失败请求找到相关日志并解释故障位置。",
      "exercise": "让应用触发一次数据库连接错误，从入口到数据库整理相关证据。",
      "boundary": "集中日志平台可后续选学，不必同时部署 ELK 和 Loki。",
      "resource": "observability/loki/README.md"
    },
    {
      "id": "backup",
      "stage": 4,
      "title": "备份与恢复验证",
      "sub": "保留策略 · RPO / RTO · 恢复演练",
      "level": "会用",
      "scope": "必修",
      "pre": "磁盘与文件系统、SQL 与 MySQL 基础",
      "topics": [
        "区分备份完成与备份可恢复",
        "定义备份频率、保留周期、访问权限和异地副本",
        "理解可接受数据丢失量和恢复时间，校验恢复结果"
      ],
      "outcome": "能恢复应用配置与数据，并报告恢复耗时和数据范围。",
      "exercise": "备份示例数据，在隔离环境恢复，核对记录数量及关键业务查询结果。",
      "boundary": "复制和快照不能直接等同于完整备份策略。",
      "resource": "data-systems/mysql/README.md"
    },
    {
      "id": "incident",
      "stage": 4,
      "title": "故障响应与复盘",
      "sub": "影响确认 · 止损 · 验证 · 升级",
      "level": "会用",
      "scope": "必修",
      "pre": "监控、日志、备份与恢复",
      "topics": [
        "先确认影响和最近变更，保留诊断证据",
        "使用运行手册止损，超出能力时及时升级",
        "记录时间线、恢复验证、原因与改进措施"
      ],
      "outcome": "能按流程处理一个常见故障，并写出可复查的记录。",
      "exercise": "模拟磁盘空间不足，完成告警响应、定位、清理或扩容、服务验证和复盘。",
      "boundary": "实验成功不等于具备独立承担生产值班的经验。",
      "resource": null
    },
    {
      "id": "bash",
      "stage": 5,
      "title": "Bash 自动化脚本",
      "sub": "参数 · 退出码 · 日志 · 幂等",
      "level": "会用",
      "scope": "必修",
      "pre": "终端、服务管理与文件权限",
      "topics": [
        "变量与引号、条件循环、函数、管道和退出码",
        "使用 grep/sed/awk/jq 处理文本与结构化数据",
        "加入输入校验、失败处理、日志和重复执行保护"
      ],
      "outcome": "能用脚本完成巡检，失败时给出明确原因。",
      "exercise": "编写磁盘、服务和 HTTP 巡检脚本，测试正常、超时、权限不足三种路径。",
      "boundary": "不能只验证成功路径；破坏性操作先设计预览与确认。",
      "resource": null
    },
    {
      "id": "git",
      "stage": 5,
      "title": "Git 与配置版本管理",
      "sub": "提交 · diff · 分支 · 回退",
      "level": "会用",
      "scope": "必修",
      "pre": "读文档与记录实验",
      "topics": [
        "使用 status/diff/add/commit 记录有边界的变更",
        "理解分支、合并与 revert",
        "忽略本地敏感配置，提供脱敏示例与变更说明"
      ],
      "outcome": "能追踪一次配置变更，并恢复错误修改。",
      "exercise": "把脚本与示例配置纳入仓库，提交两次修改，再用 revert 撤销其中一次。",
      "boundary": "先掌握日常协作，不必从复杂分支模型开始。",
      "resource": null
    },
    {
      "id": "python",
      "stage": 5,
      "title": "Python 与 API 自动化",
      "sub": "HTTP · JSON · 异常 · 超时",
      "level": "会用",
      "scope": "选修",
      "pre": "Bash 自动化脚本、HTTP、Git",
      "topics": [
        "基础数据结构、函数、模块与虚拟环境",
        "调用 API，处理 JSON、超时、错误和分页",
        "记录日志，使用环境变量或安全配置提供凭证"
      ],
      "outcome": "能通过 API 获取资源并输出检查报告。",
      "exercise": "读取测试服务的状态接口，生成报告，并测试超时和非成功响应。",
      "boundary": "作为自动化进阶入口；不要求先学习完整 Web 框架。",
      "resource": "programming/python-for-operations/README.md"
    },
    {
      "id": "handover",
      "stage": 5,
      "title": "发布流程与运行手册",
      "sub": "检查清单 · 回滚 · 交接",
      "level": "会用",
      "scope": "必修",
      "pre": "Git、应用部署、监控、备份恢复",
      "topics": [
        "发布前检查版本、配置、依赖与恢复方案",
        "发布后验证关键请求、日志和指标",
        "文档包含部署、巡检、故障升级和恢复步骤"
      ],
      "outcome": "能让另一位学习者接手并运行你的实验系统。",
      "exercise": "邀请同学按手册部署项目，把所有缺失步骤补齐，保存验证记录。",
      "boundary": "此处先练习可靠流程；CI/CD 和容器进入后续路线。",
      "resource": "delivery/jenkins/delivery-practice.md"
    }
  ],
  "id": "linux",
  "label": "Linux / 应用运维",
  "title": "Linux 与应用运维",
  "root": "Linux 应用运维",
  "lead": "从零开始，部署、维护并恢复你的第一个业务系统。",
  "pre": "适合零基础、转行者；从实验环境开始，无其他路线前置要求。",
  "requires": [],
  "project": "用同一个小型网站贯穿整条路线，每阶段交付一次可验证的结果。",
  "finish": "完成你的第一套运维作品",
  "finishSub": "能部署 / 能观察 / 能排障 / 能恢复",
  "goal": "独立完成一个小型服务的部署、监控、故障处理和数据恢复，并留下可复现的记录。",
  "next": [
    "cloud",
    "kubernetes",
    "devops"
  ],
  "sourceTitle": "Linux 与应用运维学习笔记",
  "sourceUrl": "../topics/systems/linux/README.md",
  "chapters": [
    "准备实验环境",
    "Linux 系统管理",
    "网络与访问链路",
    "部署业务系统",
    "监控、排障与恢复",
    "脚本与运维协作"
  ],
  "practiceNames": [
    "可重建的实验服务器",
    "重启后自动恢复服务",
    "修复三种访问故障",
    "上线一个 HTTPS 网站",
    "告警响应与恢复演练",
    "交付一份运维作品"
  ]
};
