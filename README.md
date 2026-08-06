<div align="center">

# Ops Roadmap

**面向运维工程师、SRE 与平台工程师的中文学习笔记和交互式路线图合集。**

![Topics](https://img.shields.io/badge/topics-20-1f2933?style=flat-square)
![Markdown notes](https://img.shields.io/badge/markdown_notes-47-1f2933?style=flat-square)
![Roadmaps](https://img.shields.io/badge/roadmaps-48-f4c95d?style=flat-square)
[![License: MIT](https://img.shields.io/badge/license-MIT-8bcf8b?style=flat-square)](./LICENSE)

[快速开始](#快速开始) · [内容导航](#内容导航) · [生成方式](#内容如何生成) · [仓库结构](#仓库结构)

</div>

Ops Roadmap 收录 Linux、容器、Kubernetes、可观测性、数据系统、持续交付、Web 基础设施和 AI Agent 等主题。每份内容同时提供适合检索与编辑的 Markdown，以及适合系统学习的 Roadmap HTML。

![Ops Roadmap 首页预览](./assets/index-preview.png)

## 核心特性

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

根目录的 [`index.html`](./index.html) 是完整入口，包含全部 47 份标准路线图和 Kubernetes 完整动画版。

| 分类 | 主题 |
| --- | --- |
| 系统基础 | [容器核心技术](./topics/systems/container-fundamentals/) · [Linux 底层原理](./topics/systems/linux/) · [Linux 性能优化](./topics/systems/linux-performance/) |
| 云原生 | [Docker](./topics/cloud-native/docker/) · [Kubernetes](./topics/cloud-native/kubernetes/) · [Kubernetes 容器网络](./topics/cloud-native/kubernetes-networking/) · [Consul](./topics/cloud-native/consul/) · [etcd](./topics/cloud-native/etcd/) |
| 可观测性 | [Prometheus](./topics/observability/prometheus/) · [Kube-Prometheus](./topics/observability/kube-prometheus/) · [VictoriaMetrics](./topics/observability/victoria-metrics/) · [VictoriaMetrics Flags](./topics/observability/victoria-metrics-flags/) · [VictoriaMetrics PromQL](./topics/observability/victoria-metrics-promql/) |
| 数据系统 | [MySQL](./topics/data-systems/mysql/) · [Kafka](./topics/data-systems/kafka/) · [RabbitMQ](./topics/data-systems/rabbitmq/) |
| 持续交付 | [Jenkins](./topics/delivery/jenkins/) |
| Web 基础设施 | [Nginx](./topics/web/nginx/) |
| AI Agent | [DeepAgent](./topics/ai-agents/deepagent/) · [Claude Agent SDK](./topics/ai-agents/claude-agent-sdk/) |

## 内容如何生成

```text
课程 / 官方文档 / 已收集材料
            ↓
  learning-notes-builder
            ↓
     结构化 Markdown
            ↓
     learning-roadmap
            ↓
   交互式 Roadmap HTML
```

- Markdown 学习笔记遵循 [`learning-notes-builder`](https://github.com/luozijian1990/personal-skill/tree/main/skills/learning-notes-builder) 的结构与写作风格：使用 H2/H3 组织章节和小节，并结合详细讲解、图表与代码示例。
- Roadmap HTML 通过 [`learning-roadmap`](https://github.com/luozijian1990/personal-skill/tree/main/skills/learning-roadmap) 从整理后的 Markdown 生成，提供章节卡片、详情阅读、搜索和本地进度记录。

## 仓库结构

```text
.
├── index.html                      # 全部路线图入口
├── assets/                         # README 等公共资源
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
