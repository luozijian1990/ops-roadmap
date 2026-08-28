# Jenkins 两册学习笔记大纲

> 本文件用于追踪 `guide.md` 与 `delivery-practice.md` 的章节边界和来源映射。
> 来源映射注释只允许保留在本文件；两份正式笔记不得包含来源注释。
> `official:` 后的链接是写作与现代化核验入口，正文落笔前仍需重新核对其当前内容。

## `guide.md` 文档说明

### 概述
<!-- src: topics/delivery/jenkins/guide.md; docs/specs/jenkins-learning-notes-expansion.md -->

## `guide.md` 第一章：Jenkins 安装与配置

### 1.1 Docker 环境安装
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/1.txt; official: https://www.jenkins.io/doc/book/installing/docker/; https://www.jenkins.io/doc/book/platform-information/support-policy-java/ -->

### 1.2 Kubernetes 环境安装
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/1.txt; official: https://www.jenkins.io/doc/book/installing/kubernetes/; https://plugins.jenkins.io/kubernetes/ -->

### 1.3 Linux 环境安装
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/1.txt; official: https://www.jenkins.io/doc/book/installing/linux/; https://www.jenkins.io/doc/book/platform-information/support-policy-java/ -->

### 1.4 初始化配置与平台治理
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/1.txt; official: https://www.jenkins.io/doc/book/security/access-control/authorization/; https://www.jenkins.io/doc/book/security/credentials/; https://www.jenkins.io/doc/book/system-administration/backing-up/ -->

### 1.5 Controller 与 Agent 部署架构
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/1.txt; temp/jenkins/2.txt; official: https://www.jenkins.io/doc/book/using/using-agents/; https://www.jenkins.io/doc/book/scaling/architecting-for-scale/ -->

## `guide.md` 第二章：Jenkins Pipeline 详解

### 2.1 Pipeline 基础概念
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/2.txt; official: https://www.jenkins.io/doc/book/pipeline/ -->

### 2.2 Jenkinsfile 核心要点与开发工具
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/2.txt; official: https://www.jenkins.io/doc/book/pipeline/development/; https://www.jenkins.io/doc/book/pipeline/jenkinsfile/ -->

### 2.3 Pipeline 中使用 Docker
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/6.txt; official: https://www.jenkins.io/doc/book/pipeline/docker/ -->

### 2.4 共享库的结构、版本与信任边界
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/2.txt; temp/jenkins/3.txt; temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://www.jenkins.io/doc/book/pipeline/shared-libraries/ -->

### 2.5 Pipeline 高级特性与变量作用域
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/2.txt; official: https://www.jenkins.io/doc/book/pipeline/syntax/; https://www.jenkins.io/doc/pipeline/steps/workflow-basic-steps/ -->

### 2.6 Pipeline 流程图
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/2.txt -->

### 2.7 Declarative Pipeline 完整语法
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/2.txt; official: https://www.jenkins.io/doc/book/pipeline/syntax/ -->

### 2.8 Sequential Stages 顺序嵌套阶段
<!-- src: topics/delivery/jenkins/guide.md; official: https://www.jenkins.io/doc/book/pipeline/syntax/ -->

### 2.9 Parallel 并行执行
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/2.txt; official: https://www.jenkins.io/doc/book/pipeline/syntax/ -->

### 2.10 Matrix 矩阵构建
<!-- src: topics/delivery/jenkins/guide.md; official: https://www.jenkins.io/doc/book/pipeline/syntax/ -->

### 2.11 Script 块与受控 Groovy 逻辑
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/2.txt; official: https://www.jenkins.io/doc/book/pipeline/syntax/; https://www.jenkins.io/doc/book/managing/script-approval/ -->

### 2.12 Scripted Pipeline 详解
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/2.txt; official: https://www.jenkins.io/doc/book/pipeline/ -->

### 2.13 CPS、重启恢复与 Pipeline 最佳实践
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/2.txt; official: https://www.jenkins.io/doc/book/pipeline/cps-method-mismatches/; https://www.jenkins.io/doc/book/pipeline/pipeline-best-practices/ -->

## `guide.md` 第三章：按能力选择并治理插件

### 3.1 Git 插件
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/3.txt; official: https://plugins.jenkins.io/git/ -->

### 3.2 Credentials Binding 插件
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/1.txt; temp/jenkins/3.txt; temp/jenkins/4.txt; official: https://plugins.jenkins.io/credentials-binding/; https://www.jenkins.io/doc/book/security/credentials/ -->

### 3.3 HTTP Request 插件
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/3.txt; temp/jenkins/4.txt; official: https://plugins.jenkins.io/http_request/ -->

### 3.4 Kubernetes 插件
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/1.txt; temp/jenkins/6.txt; official: https://plugins.jenkins.io/kubernetes/ -->

### 3.5 备份能力与 ThinBackup 边界
<!-- src: topics/delivery/jenkins/guide.md; temp/jenkins/1.txt; official: https://plugins.jenkins.io/thinBackup/; https://www.jenkins.io/doc/book/system-administration/backing-up/ -->

### 3.6 插件最小化、升级与回滚
<!-- src: topics/delivery/jenkins/guide.md; docs/specs/jenkins-learning-notes-expansion.md; official: https://www.jenkins.io/doc/book/managing/plugins/; https://plugins.jenkins.io/blueocean/ -->

## `delivery-practice.md` 第一章：从代码事件到流水线触发

### Webhook 触发链由哪些组件组成
<!-- src: temp/jenkins/3.txt; official: https://docs.gitlab.com/user/project/integrations/webhooks/; https://plugins.jenkins.io/generic-webhook-trigger/ -->

### 如何安全地解析和过滤事件
<!-- src: temp/jenkins/3.txt; official: https://docs.gitlab.com/user/project/integrations/webhooks/; https://docs.gitlab.com/user/project/integrations/webhook_events/; https://plugins.jenkins.io/generic-webhook-trigger/ -->

### 如何统一自动触发与手动触发
<!-- src: temp/jenkins/3.txt; official: https://www.jenkins.io/doc/book/pipeline/syntax/; https://docs.gitlab.com/user/project/integrations/webhook_events/ -->

### Webhook 不触发时如何排查
<!-- src: temp/jenkins/3.txt; official: https://docs.gitlab.com/user/project/integrations/webhooks/; https://plugins.jenkins.io/generic-webhook-trigger/ -->

## `delivery-practice.md` 第二章：建立可复用的流水线工程

### 项目标准化先统一哪些契约
<!-- src: temp/jenkins/3.txt; temp/jenkins/5.txt; temp/jenkins/6.txt -->

### Jenkinsfile 和共享库如何分工
<!-- src: temp/jenkins/2.txt; temp/jenkins/3.txt; temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://www.jenkins.io/doc/book/pipeline/shared-libraries/; https://www.jenkins.io/doc/book/pipeline/pipeline-best-practices/ -->

### 如何设计和测试共享库
<!-- src: temp/jenkins/2.txt; temp/jenkins/3.txt; temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://www.jenkins.io/doc/book/pipeline/shared-libraries/ -->

## `delivery-practice.md` 第三章：设计标准化 CI 流水线

### 一条 CI 流水线应有哪些阶段
<!-- src: temp/jenkins/3.txt; temp/jenkins/5.txt; temp/jenkins/6.txt -->

### 如何适配 Maven、Gradle、Go 和 npm
<!-- src: temp/jenkins/3.txt; temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://www.jenkins.io/doc/tutorials/build-a-java-app-with-maven/; https://www.jenkins.io/doc/tutorials/build-a-node-js-and-react-app-with-npm/ -->

### 如何控制超时、重试、并发和清理
<!-- src: temp/jenkins/5.txt; official: https://www.jenkins.io/doc/book/pipeline/syntax/; https://www.jenkins.io/doc/pipeline/steps/workflow-basic-steps/ -->

### 如何建立构建可追溯性
<!-- src: temp/jenkins/3.txt; temp/jenkins/4.txt; temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://www.jenkins.io/doc/book/using/fingerprints/ -->

## `delivery-practice.md` 第四章：把质量门禁纳入流水线

### SonarQube 在流水线中承担什么职责
<!-- src: temp/jenkins/4.txt; official: https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/overview/ -->

### 如何让 Quality Gate 真正阻断交付
<!-- src: temp/jenkins/4.txt; official: https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/ci-integration/jenkins-integration/pipeline-pause; https://docs.sonarsource.com/sonarqube-server/project-administration/webhooks -->

### 如何处理覆盖率、分支和提交关联
<!-- src: temp/jenkins/4.txt; official: https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/test-coverage/overview/; https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/branch-analysis/; https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/pull-request-analysis/ -->

## `delivery-practice.md` 第五章：制品是 CI 与 CD 的边界

### 为什么 CI 与 CD 之间必须交付不可变制品
<!-- src: temp/jenkins/4.txt; temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://slsa.dev/spec/v1.1/provenance -->

### Nexus 和 Harbor 分别管理什么
<!-- src: temp/jenkins/4.txt; temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://help.sonatype.com/en/repository-types.html; https://goharbor.io/docs/main/ -->

### 如何执行制品发布和晋级
<!-- src: temp/jenkins/4.txt; temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://help.sonatype.com/en/configurable-repository-fields.html; https://goharbor.io/docs/main/working-with-projects/working-with-images/create-tag-immutability-rules/; https://goharbor.io/docs/main/administration/robot-accounts/ -->

## `delivery-practice.md` 第六章：设计可回滚的 CD 流水线

### CD 流水线需要哪些控制面
<!-- src: temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://www.jenkins.io/doc/book/pipeline/syntax/ -->

### 如何选择滚动、蓝绿和灰度发布
<!-- src: temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/; https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/#canary -->

### 失败时如何停止和回滚
<!-- src: temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/; https://helm.sh/docs/helm/helm_rollback/ -->

## `delivery-practice.md` 第七章：Jenkins 与 Kubernetes 交付

### Jenkins 直接执行 Kubectl 属于什么模型
<!-- src: temp/jenkins/6.txt; official: https://kubernetes.io/docs/reference/kubectl/; https://kubernetes.io/docs/reference/access-authn-authz/rbac/; https://kubernetes.io/docs/concepts/security/service-accounts/ -->

### Helm 如何提供 Release 历史和回滚
<!-- src: temp/jenkins/6.txt; topics/cloud-native/helm/01-foundations-and-release-operations.md; topics/cloud-native/helm/02-chart-development-and-best-practices.md; topics/cloud-native/helm/03-repositories-security-and-extensions.md; official: https://helm.sh/docs/helm/helm_upgrade/; https://helm.sh/docs/helm/helm_history/; https://helm.sh/docs/helm/helm_rollback/ -->

### 推送式 CD 与 GitOps 有何区别
<!-- src: temp/jenkins/6.txt; official: https://opengitops.dev/; https://github.com/open-gitops/documents/blob/main/PRINCIPLES.md -->

## `delivery-practice.md` 第八章：生产运行与治理

### 如何观察 Jenkins 的运行状态
<!-- src: temp/jenkins/1.txt; temp/jenkins/3.txt; temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://www.jenkins.io/doc/book/system-administration/monitoring/; https://www.jenkins.io/doc/book/using/executor-starvation/ -->

### 常见故障如何分层定位
<!-- src: temp/jenkins/1.txt; temp/jenkins/3.txt; temp/jenkins/4.txt; temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://www.jenkins.io/doc/book/troubleshooting/ -->

### 如何治理插件、凭据和脚本
<!-- src: temp/jenkins/1.txt; temp/jenkins/2.txt; temp/jenkins/3.txt; temp/jenkins/4.txt; temp/jenkins/5.txt; temp/jenkins/6.txt; official: https://www.jenkins.io/doc/book/managing/plugins/; https://www.jenkins.io/doc/book/security/credentials/; https://www.jenkins.io/doc/book/managing/script-approval/ -->

### 如何做备份、恢复和升级回退
<!-- src: temp/jenkins/1.txt; official: https://www.jenkins.io/doc/book/system-administration/backing-up/; https://www.jenkins.io/doc/upgrade-guide/ -->
