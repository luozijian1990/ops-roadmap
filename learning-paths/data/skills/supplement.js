/* Additional modules exposed by the granularity review. They are not squeezed
   into a four-module stage: rendering supports any stage/module/leaf count. */
function addModule(routeId,module){
 const base=routeId==='linux'?window.OPS_LINUX:window.OPS_EXTRA_ROUTES.find(r=>r.id===routeId);
 base.nodes.push(module);
}
addModule('linux',{id:'linux-time',stage:1,title:'时区与时间同步',sub:'时区 / NTP / 日志时间',level:'会排障',scope:'必修',pre:'Linux 基础与网络连接',topics:['区分时区显示与系统时间','检查时间同步服务与偏差','理解错误时间对日志、证书和定时任务的影响'],outcome:'能核对实验主机的时间配置并定位不同机器的日志时间差。',exercise:'比较两台实验机的时区和同步状态，统一后核对同一请求的时间线。',boundary:'先使用系统提供的时间同步服务，不要求自建公共授时服务。',resource:'systems/linux/README.md'});
defineLeaves('linux-time',`
timezone|系统时区与 UTC|区分记录时间和显示时区|改变实验显示时区，核对同一事件时间而不误判事件顺序。
ntp|时间同步服务|检查同步来源、状态和偏差|查看实验机的同步状态，诊断不可达的测试时间源。|会排障
impact|时间偏差的运行影响|识别日志、证书和任务调度中的时间问题|对比两台机器的日志时间，说明对故障关联的影响。`);
addModule('cloud',{id:'cloud-web',stage:3,title:'公网网站接入与防护',sub:'域名 / CDN / WAF',level:'会用',scope:'选修',pre:'HTTP、DNS、TLS 与云上入口',topics:['核对域名和部署地域对应的接入条件','理解 CDN 缓存、回源和刷新','认识 WAF 规则与误拦截排查'],outcome:'能解释云上网站入口之外还需要考虑的接入、缓存与防护环节。',exercise:'为测试网站绘制域名到 CDN、WAF 和应用的访问链路，验证一条缓存规则和一条受控防护规则。',boundary:'上线要求按具体地域、业务与当前官方流程核对；练习不要求暴露真实生产站点。',resource:'https://help.aliyun.com/zh/cdn/'});
defineLeaves('cloud-web',`
requirements|域名与接入条件核对|找到部署地域和业务对应的官方接入流程|列出测试站点上线前需要核对的域名、证书与接入事项。|了解
cdn|CDN 回源与缓存|区分边缘响应与源站响应|为测试资源设置缓存，分别记录命中和回源的行为。
purge|缓存刷新与版本更新|避免发布后仍访问旧静态资源|更新测试资源，通过版本化或刷新确认新内容可见。
waf|WAF 规则与观察|理解检测、放行与阻断的差异|在测试策略中先观察规则命中，确认合法请求不会被误拦。
trace|入口链路排障|关联 DNS、CDN、WAF 与源站日志|制造一个测试回源错误，按请求标识逐层定位。|会排障`);
addModule('kubernetes',{id:'k-node',stage:5,title:'节点与运行时故障',sub:'NotReady / Pressure / CRI',level:'会排障',scope:'必修',pre:'节点组件、Linux 排障与集群事件',topics:['定位节点不就绪的系统与组件原因','区分资源压力驱逐和应用自身崩溃','检查容器运行时、镜像与磁盘状态'],outcome:'能在实验环境定位节点级异常，而不是只重建应用 Pod。',exercise:'在隔离节点分别制造服务异常和受限磁盘压力，关联节点条件、事件与系统日志。',boundary:'仅对可重建实验节点注入故障；生产维护需按实际变更流程执行。',resource:'cloud-native/kubernetes/README.md'});
defineLeaves('k-node',`
notready|Node NotReady|关联 kubelet、网络与节点条件|停止实验节点组件，收集条件和日志后恢复。|会排障
pressure|资源压力与驱逐|理解节点压力和 Pod 退出的区别|在受限实验盘制造压力，比较节点事件与应用事件。|会排障
runtime|容器运行时异常|检查 CRI、镜像与进程状态|模拟运行时不可用，记录 Pod 状态与节点日志。|会排障
recovery|节点恢复验证|确认节点和业务均已恢复|恢复实验节点后核对调度、服务端点与关键请求。`);
addModule('devops',{id:'d-kustomize',stage:3,title:'Kustomize 环境差异',sub:'base / overlay / patch',level:'会用',scope:'选修',pre:'Kubernetes 清单与 Git',topics:['分离公共配置与环境差异','通过 patch 修改明确的字段','渲染最终清单并检查意外变化'],outcome:'能用同一份基础配置维护两个实验环境。',exercise:'建立测试与预生产 overlay，渲染并核对差异仅包含预期参数。',boundary:'作为 Kubernetes 交付分支选修；不要求所有项目同时使用 Helm 与 Kustomize。',resource:'https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/',relatedRoutes:['kubernetes']});
defineLeaves('d-kustomize',`
base|base 与 overlay|组织公共清单和环境差异|为两个测试环境建立配置目录，说明共用和覆盖部分。
patch|patch 与字段修改|限定补丁影响的资源和字段|修改测试镜像和副本数，核对无关字段未变。
render|最终清单验证|以渲染结果而不是模板猜测行为|渲染两个环境并比较差异，再执行配置校验。`);
