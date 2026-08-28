# Ops Roadmap 思维导图预览

这张图按照 `topics/<category>/<topic>/` 的实际目录组织，采用从左向右展开的三列树形布局，只展示“总览 → 分类 → 专题”，暂不展开各专题下的 Markdown 分册。

```mermaid
flowchart LR
  root((Ops Roadmap))

  root --> systems[系统基础]
  systems --> network[计算机网络基础]
  systems --> container[容器核心技术]
  systems --> linux[Linux 底层原理]
  systems --> linuxPerformance[Linux 性能优化]
  systems --> ebpf[eBPF 运维与故障排查]

  root --> architecture[架构设计]
  architecture --> architectureFoundations[基础、复杂度与质量]
  architecture --> architecturePerformance[性能、容量与流量治理]
  architecture --> architectureDistributed[数据与分布式系统]
  architecture --> architectureReliability[高可用与灾备]
  architecture --> architectureEvolution[微服务治理、演进与案例]

  root --> cloudNative[云原生]
  cloudNative --> docker[Docker]
  cloudNative --> helm[Helm]
  cloudNative --> kubernetes[Kubernetes]
  cloudNative --> kubernetesNetworking[Kubernetes 容器网络]
  cloudNative --> consul[Consul]
  cloudNative --> etcd[etcd]

  root --> observability[可观测性]
  observability --> prometheus[Prometheus]
  observability --> kubePrometheus[Kube-Prometheus]
  observability --> victoriaMetrics[VictoriaMetrics]
  observability --> victoriaMetricsFlags[VictoriaMetrics Flags]
  observability --> victoriaMetricsPromql[VictoriaMetrics PromQL]

  root --> dataSystems[数据系统]
  dataSystems --> mysql[MySQL]
  dataSystems --> kafka[Kafka]
  dataSystems --> rabbitmq[RabbitMQ]

  root --> delivery[持续交付]
  delivery --> ansible[Ansible]
  delivery --> jenkins[Jenkins]

  root --> webInfra[Web 基础设施]
  webInfra --> nginx[Nginx]

  root --> aiInfra[AI 基础设施]
  aiInfra --> gpu[GPU AI Infrastructure]

  root --> aiops[AIOps]
  aiops --> llmAiops[LLM-AIOps 中文学习路线]

  root --> aiAgent[AI Agent]
  aiAgent --> deepAgent[DeepAgent]
  aiAgent --> claudeAgentSdk[Claude Agent SDK]

  classDef rootNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff,stroke-width:3px
  classDef categoryNode fill:#dbeafe,stroke:#3b82f6,color:#172554,stroke-width:2px
  class root rootNode
  class systems,architecture,cloudNative,observability,dataSystems,delivery,webInfra,aiInfra,aiops,aiAgent categoryNode
```

> 说明：思维导图用于展示知识版图；README 中原有的内容导航表格仍更适合作为可点击入口。
