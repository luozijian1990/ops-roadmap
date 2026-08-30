# Docker 学习指南

本主题覆盖 Docker 容器生命周期、镜像、网络、存储、Compose、Dockerfile、应用容器化与多平台构建，帮助运维人员构建可重复、可验证的本地和交付环境。

## 可以学到什么

- 理解 Docker 架构并管理容器创建、启动、停止和日志。
- 构建、标记、推送镜像，处理多架构与缓存。
- 配置网络、卷、资源限制和 daemon 行为。
- 用 Compose 编排多服务并诊断依赖与日志。
- 编写可维护、可复现且安全的 Dockerfile。
- 为 Java、Go、Node.js 和前端应用构建多平台镜像并交付供应链证据。

## 推荐学习顺序

| 顺序 | 学习内容 | 核心重点 | 学习入口 |
| --- | --- | --- | --- |
| 1 | 基础与容器操作 | 生命周期、命令、资源 | [Markdown](./01-basics-and-container-operations.md) · [Roadmap](./01-basics-and-container-operations-roadmap.html) |
| 2 | 镜像、网络与存储 | Registry、网络、daemon | [Markdown](./02-images-network-storage-and-daemon.md) · [Roadmap](./02-images-network-storage-and-daemon-roadmap.html) |
| 3 | Docker Compose | 多服务开发与运维 | [Markdown](./03-docker-compose.md) · [Roadmap](./03-docker-compose-roadmap.html) |
| 4 | Dockerfile 与附录 | 构建语法、缓存、最佳实践 | [Markdown](./04-dockerfile-and-appendix.md) · [Roadmap](./04-dockerfile-and-appendix-roadmap.html) |
| 5 | 应用容器化与多平台镜像构建 | 运行契约、多阶段构建、Buildx、SBOM、Provenance 与验收 | [Markdown](./05-application-containerization-and-multi-platform-builds.md) · [Roadmap](./05-application-containerization-and-multi-platform-builds-roadmap.html) |

## 阅读建议

- 按顺序实践，先掌握单容器再编排多服务。
- 不把 Docker Compose 直接当作生产集群控制面；生产发布需补充镜像扫描和回滚策略。
- 第五册交出的不可变 Digest 与证据包可继续用于 Kubernetes 运行就绪和 GitOps 晋级实验。
