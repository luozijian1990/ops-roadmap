# Jenkins 两册学习笔记大纲

> 本文件用于追踪 `guide.md` 与 `delivery-practice.md` 的章节边界和来源映射。
> 来源映射注释只允许保留在本文件；两份正式笔记不得包含来源注释。
> `official:` 后的链接是写作与现代化核验入口，正文落笔前仍需重新核对其当前内容。

## `guide.md` 文档说明

### 概述
## `guide.md` 第一章：Jenkins 安装与配置

### 1.1 Docker 环境安装
### 1.2 Kubernetes 环境安装
### 1.3 Linux 环境安装
### 1.4 初始化配置与平台治理
### 1.5 Controller 与 Agent 部署架构
## `guide.md` 第二章：Jenkins Pipeline 详解

### 2.1 Pipeline 基础概念
### 2.2 Jenkinsfile 核心要点与开发工具
### 2.3 Pipeline 中使用 Docker
### 2.4 共享库的结构、版本与信任边界
### 2.5 Pipeline 高级特性与变量作用域
### 2.6 Pipeline 流程图
### 2.7 Declarative Pipeline 完整语法
### 2.8 Sequential Stages 顺序嵌套阶段
### 2.9 Parallel 并行执行
### 2.10 Matrix 矩阵构建
### 2.11 Script 块与受控 Groovy 逻辑
### 2.12 Scripted Pipeline 详解
### 2.13 CPS、重启恢复与 Pipeline 最佳实践
## `guide.md` 第三章：按能力选择并治理插件

### 3.1 Git 插件
### 3.2 Credentials Binding 插件
### 3.3 HTTP Request 插件
### 3.4 Kubernetes 插件
### 3.5 备份能力与 ThinBackup 边界
### 3.6 插件最小化、升级与回滚
## `delivery-practice.md` 第一章：从代码事件到流水线触发

### Webhook 触发链由哪些组件组成
### 如何安全地解析和过滤事件
### 如何统一自动触发与手动触发
### Webhook 不触发时如何排查
## `delivery-practice.md` 第二章：建立可复用的流水线工程

### 项目标准化先统一哪些契约
### Jenkinsfile 和共享库如何分工
### 如何设计和测试共享库
## `delivery-practice.md` 第三章：设计标准化 CI 流水线

### 一条 CI 流水线应有哪些阶段
### 如何适配 Maven、Gradle、Go 和 npm
### 如何控制超时、重试、并发和清理
### 如何建立构建可追溯性
## `delivery-practice.md` 第四章：把质量门禁纳入流水线

### SonarQube 在流水线中承担什么职责
### 如何让 Quality Gate 真正阻断交付
### 如何处理覆盖率、分支和提交关联
## `delivery-practice.md` 第五章：制品是 CI 与 CD 的边界

### 为什么 CI 与 CD 之间必须交付不可变制品
### Nexus 和 Harbor 分别管理什么
### 如何执行制品发布和晋级
## `delivery-practice.md` 第六章：设计可回滚的 CD 流水线

### CD 流水线需要哪些控制面
### 如何选择滚动、蓝绿和灰度发布
### 失败时如何停止和回滚
## `delivery-practice.md` 第七章：Jenkins 与 Kubernetes 交付

### Jenkins 直接执行 Kubectl 属于什么模型
### Helm 如何提供 Release 历史和回滚
### 推送式 CD 与 GitOps 有何区别
## `delivery-practice.md` 第八章：生产运行与治理

### 如何观察 Jenkins 的运行状态
### 常见故障如何分层定位
### 如何治理插件、凭据和脚本
### 如何做备份、恢复和升级回退
