/* Deliberate curriculum tiers. Route scope is separate from overall career seniority. */
const ENTRY_MODULES = {
 linux:'linux-time lab terminal permissions docs packages services storage resources tcp dns http firewall nginx runtime mysql monitoring logs backup incident bash git handover',
 cloud:'cloud-account cloud-ram cloud-budget cloud-access cloud-vpc cloud-sg cloud-nat cloud-ecs cloud-disk cloud-oss cloud-rds cloud-entry cloud-monitor cloud-logs cloud-recovery cloud-troubleshoot',
 kubernetes:'k-container k-image k-architecture k-lab k-workloads k-config k-health k-scheduling k-service k-ingress k-policy k-storage k-rbac k-logs k-failures',
 devops:'d-git d-value d-build d-tests d-docker d-registry d-secrets d-ci d-runners d-cache d-pipeline d-env d-deploy d-handoff',
 sre:'s-service s-sli s-slo s-sla s-metrics s-alert s-probe s-oncall s-mitigation s-debug s-postmortem s-toil',
 platform:'p-language p-errors p-structures p-tests p-cli p-process p-http p-config p-api p-data p-auth p-audit'
};
window.OPS_LEARNING_ROUTES=[window.OPS_LINUX,...window.OPS_EXTRA_ROUTES].map(base=>{
 const entry=new Set(ENTRY_MODULES[base.id].split(' '));
 const modules=base.nodes.map(module=>{
  const definitions=window.OPS_LEAVES[module.id];
  if(!definitions?.length)throw new Error('Missing atomic curriculum: '+module.id);
  const children=definitions.map(def=>{
   const tier=def.tier||(module.scope==='选修'?'选修':entry.has(module.id)?'入门':'进阶');
   const track=module.id==='p-language'&&def.id.includes('.py-')?'python':module.id==='p-language'&&def.id.includes('.go-')?'go':null;
   return {...def,tier,track,stage:module.stage,scope:tier==='选修'?'选修':'必修',pre:module.pre,boundary:module.boundary,resource:def.id==='cloud-web.waf'?'https://help.aliyun.com/zh/waf/':def.id==='cloud-web.requirements'?'https://beian.aliyun.com/':track==='python'?'programming/python-for-operations/README.md':track==='go'?'programming/go-for-operations/README.md':module.resource,relatedRoutes:module.relatedRoutes||[]};
  });
  return {...module,children};
 });
 return {...base,modules,nodes:modules.flatMap(m=>m.children)};
});
