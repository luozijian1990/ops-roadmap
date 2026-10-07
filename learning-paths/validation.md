# 学习路线扩展验证记录

## 验证范围

### 2026-10-07 本地结果

| 验证 | 结果与边界 |
| --- | --- |
| 路线数据 | 6 条路线、37 阶段、186 模块、766 节点；原有 663 个节点 ID 全保留，3 个 Bash 节点仅变更归属；SDLC 第二批增加 4 模块、16 节点 |
| Node 测试 | 6 项通过：结构与资料、数据库独立阶段与旧进度兼容、SDLC 双语言共用及章节链接、双语言备份及旧进度、合并与清空笔记、非法数据拒绝与写入失败回退 |
| Python 测试 | 4 项通过：业务 / 就绪故障恢复、隔离备份恢复及拒绝覆盖、数据库丢失不自动重建、未知路径指标标签有界 |
| 静态检查 | JS 语法、HTML / 实验 Markdown 本地链接、Markdown 章节定位、Compose 配置与 Git whitespace 检查通过 |
| Docker 实跑 | Python 3.12 镜像构建，Nginx 入口，存活 200 / 就绪 503，恢复 200，备份到新文件，v2 发布和 v1 回退后业务记录仍保留 |
| 数据库容器 | MySQL 8.4.4 示例表初始化；Redis 7.4.2 正常重启后测试键保留。未执行复制、PITR、Sentinel 或 Cluster 验收 |
| 原生 Chrome | HTTP 页面加载、自测推荐第一个未通过阶段并定位、新增节点详情、验收笔记及学习中状态更新已验证 |

Docker 验证使用独立项目 `ops-roadmap-validation`；完成后删除了该项目容器、网络和临时数据卷。

### 尚未覆盖

- 浏览器文件选择 / 下载 / 导入确认的完整往返、移动端与所有路线交互回归；备份合并核心逻辑已由 Node 测试覆盖。
- 本轮完整页面截图更新：Chrome 保存窗口被其他操作切换，旧图已标注为历史布局参考。
- Linux 实际重启、systemd 与救援恢复，真实 Kubernetes 部署 / CSI / 控制面故障，收费云资源及恢复演练。
- HTTPS 配置需在独立 Nginx 环境另行验收；Compose 当前入口是本机 HTTP。
- SDLC 内容只完成原文对照、教学适配和静态数据检查；未执行真实模型评估、原文产品配置或新增 16 个节点的浏览器交互验收。
- 数据库拆分与 Ansible 扩展完成静态检查和进度兼容测试：Linux 第 5 阶段有 11 模块、51 节点，第 7 阶段新增 Ansible 9 节点；未执行新列出的数据库进阶及双主机 Ansible 实验。

## 复核入口

### 自动检查

在仓库根目录执行：

```bash
node --test learning-paths/tests/curriculum.test.cjs
python3 -m unittest discover -s learning-paths/labs/tests -v
docker compose -f learning-paths/labs/compose.yaml config --quiet
```

其他实验按[实验室](./labs/index.html)与[操作说明](./labs/README.md)执行。测试通过不自动修改学习节点进度。
