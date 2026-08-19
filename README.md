<div align="center">

# Ops Roadmap

**一份持续整理的个人运维学习笔记与交互式路线图合集。**

![Topics](https://img.shields.io/badge/topics-22-1f2933?style=flat-square)
![Markdown notes](https://img.shields.io/badge/markdown_notes-57-1f2933?style=flat-square)
![Roadmaps](https://img.shields.io/badge/roadmaps-58-f4c95d?style=flat-square)
[![License: MIT](https://img.shields.io/badge/license-MIT-8bcf8b?style=flat-square)](./LICENSE)

[快速开始](#快速开始) · [内容导航](#内容导航) · [案例库](#企业案例库整理中) · [生成方式](#内容如何生成) · [仓库结构](#仓库结构)

</div>

Ops Roadmap 是我在学习和实践过程中整理的个人知识库，目前涵盖 Linux、容器、Kubernetes、可观测性、数据系统、持续交付、Web 基础设施、AIOps 和 AI Agent 等主题。`topics/` 中的系统学习笔记同时提供适合检索与编辑的 Markdown，以及适合系统学习的 Roadmap HTML；`cases/` 则保存尚在持续核验和提炼的企业实践案例。

> [!NOTE]
> 运维与平台工程涉及的领域非常广泛，本仓库不以构建完整知识体系为目标。现有内容主要反映我的个人学习路径、工作经验和关注方向，难免存在遗漏，也会随着学习进度持续补充和修订。

![Ops Roadmap 首页预览](./assets/index-preview.png)

## 核心特性

- **个人学习沉淀**：围绕实际学习路径持续整理，不追求面面俱到，更关注知识之间的联系和可复习性。
- **结构化中文笔记**：以章节和知识点组织内容，包含 Mermaid 图、表格和可复制的代码示例。
- **交互式学习路线**：支持小节搜索、详情面板以及“待学 / 在学 / 已学”三态进度。
- **适合长期维护**：Markdown 是内容源文件，HTML 可以通过脚本统一重新生成。
- **大文档分卷**：巨型笔记按自然章节拆分，单个 Markdown 控制在约 5,000 行以内。
- **纯静态页面**：无需安装前端依赖，可直接打开，也可以部署到任意静态托管服务。

## 快速开始

1. 克隆仓库：

   ```bash
   git clone https://github.com/luozijian1990/ops-roadmap.git
   cd ops-roadmap
   ```

2. 启动本地静态服务：

   ```bash
   python3 -m http.server 8000
   ```

3. 打开 <http://127.0.0.1:8000/>。

> [!TIP]
> 直接打开 `index.html` 和各个 Roadmap 也能阅读。使用本地 HTTP 服务后，所有页面共享同一个 origin，学习进度的 `localStorage` 读取会更加稳定。

## 内容导航

根目录的 [`index.html`](./index.html) 是全部 Roadmap 的入口，包含 57 份标准路线图和 Kubernetes 完整动画版。

| 分类 | 主题 |
| --- | --- |
| 系统基础 | [容器核心技术](./topics/systems/container-fundamentals/) · [Linux 底层原理](./topics/systems/linux/) · [Linux 性能优化](./topics/systems/linux-performance/) |
| 云原生 | [Docker](./topics/cloud-native/docker/) · [Kubernetes](./topics/cloud-native/kubernetes/) · [Kubernetes 容器网络](./topics/cloud-native/kubernetes-networking/) · [Consul](./topics/cloud-native/consul/) · [etcd](./topics/cloud-native/etcd/) |
| 可观测性 | [Prometheus](./topics/observability/prometheus/) · [Kube-Prometheus](./topics/observability/kube-prometheus/) · [VictoriaMetrics](./topics/observability/victoria-metrics/) · [VictoriaMetrics Flags](./topics/observability/victoria-metrics-flags/) · [VictoriaMetrics PromQL](./topics/observability/victoria-metrics-promql/) |
| 数据系统 | [MySQL](./topics/data-systems/mysql/) · [Kafka](./topics/data-systems/kafka/) · [RabbitMQ](./topics/data-systems/rabbitmq/) |
| 持续交付 | [Ansible](./topics/delivery/ansible/) · [Jenkins](./topics/delivery/jenkins/) |
| Web 基础设施 | [Nginx](./topics/web/nginx/) |
| AIOps | [LLM-AIOps 中文学习路线](./topics/aiops/llm-aiops/) |
| AI Agent | [DeepAgent](./topics/ai-agents/deepagent/) · [Claude Agent SDK](./topics/ai-agents/claude-agent-sdk/) |

## 企业案例库（整理中）

[`cases/`](./cases/) 收录来自公开技术分享和文章的企业实践，按可靠性、可观测性、DevOps、AIOps、云原生、FinOps 与工程管理分类。案例保留具体组织和场景的约束，`topics/` 则负责把多个案例进一步提炼成通用学习笔记。

案例分为 `draft`、`reviewed` 和 `verified` 三种状态。当前从历史分享材料导入的案例均为 `draft`，表示已经完成归类和基础结构整理，但来源链接、ASR 内容和关键数据仍待核验，因此暂不计入上方学习笔记和 Roadmap 数量。

## 内容如何生成

```text
课程 / 官方文档 / 公开分享 / 已收集材料
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
  单案例整理与核验          多材料归纳与提炼
        │                       │
        ▼                       ▼
     cases/                  topics/
                                │
                                ▼
                       learning-roadmap
                                │
                                ▼
                      交互式 Roadmap HTML
```

- 企业案例先按 [`cases/`](./cases/) 的分类、状态和来源规范单独整理；积累多个已复核案例后，再提炼进相关学习主题。
- Markdown 学习笔记遵循 [`learning-notes-builder`](https://github.com/luozijian1990/personal-skill/tree/main/skills/learning-notes-builder) 的结构与写作风格：使用 H2/H3 组织章节和小节，并结合详细讲解、图表与代码示例。
- Roadmap HTML 通过 [`learning-roadmap`](https://github.com/luozijian1990/personal-skill/tree/main/skills/learning-roadmap) 从整理后的 Markdown 生成，提供章节卡片、详情阅读、搜索和本地进度记录。

## 仓库结构

```text
.
├── index.html                      # 全部路线图入口
├── assets/                         # README 等公共资源
├── cases/                          # 分类后的企业实践案例库
├── scripts/build-roadmaps.sh       # Roadmap 批量生成脚本
└── topics/<category>/<topic>/
    ├── guide.md                    # 未分卷的 Markdown 笔记
    ├── guide-roadmap.html          # 未分卷的 Roadmap
    ├── 01-<volume>.md              # 分卷 Markdown
    ├── 01-<volume>-roadmap.html    # 分卷 Roadmap
    └── roadmap-animations/         # 可选的教学动画 sidecar
```

公开路径统一使用小写 kebab-case。Markdown 使用唯一 H1 作为文档标题，并以 H2、H3、H4 表达章节、小节和内部知识点。

## 重新生成 Roadmap

安装 [`learning-roadmap`](https://github.com/luozijian1990/personal-skill/tree/main/skills/learning-roadmap) 后，在仓库根目录执行：

```bash
./scripts/build-roadmaps.sh
```

如果 Skill 不在默认位置，可以通过 `LEARNING_ROADMAP_BUILDER` 指定 `build_roadmap.py`：

```bash
LEARNING_ROADMAP_BUILDER=/path/to/build_roadmap.py ./scripts/build-roadmaps.sh
```

> [!IMPORTANT]
> `topics/cloud-native/kubernetes/full-animated-roadmap.html` 是保留的完整动画版，不会由普通批量生成命令重建。它的 `roadmap-animations/` sidecar 和截图需要一起维护。
