/* Host automation follows local scripts and Git, before delivery-pipeline integration. */
defineLeaves('linux-ansible',`
inventory|Inventory 与主机分组|把目标清单和连接参数显式管理|为两台实验主机建立组，先列出目标，再用限定组验证连接，避免误操作全部主机。|会用|入门
modules|模块与临时任务|优先用描述目标状态的模块执行任务|用文件或软件包模块完成一项变更，再比较直接 shell 命令的状态反馈与适用边界。|会用|入门
playbook|Playbook 与任务执行|把批量操作整理为可复查的步骤|为测试服务编写安装、配置和启动任务，运行后逐台验证实际状态。|会用|入门
variables|变量、模板与配置差异|用变量表达主机和环境差异|为两组主机渲染不同测试配置，核对来源、最终值与模板差异，不在模板中硬编码凭证。|会用|入门
idempotency|幂等与重复执行|区分任务成功和重复执行无额外副作用|连续运行同一 Playbook，第二次应只报告预期变化；故意修改一处配置后验证重新收敛。|会用|入门
handlers|Handler 与配置校验|仅在有效配置变化后触发服务动作|让模板变更先通过服务配置检查，再通知 Handler；故意写错配置，确认不会重启成故障状态。|会用|进阶
preview|Check、Diff 与验证边界|理解预演并不覆盖所有模块和真实副作用|先在限定主机执行 check 和 diff，标注不支持或需实际执行才能确认的任务，再用测试机验证。|会用|进阶
credentials|SSH、提权与加密变量|分开管理连接身份、提权和敏感值|用受限实验身份连接与 become；通过加密变量管理假凭证，验证日志和版本库不出现明文。|会用|进阶
batches|分批执行与失败停止|限制一次变更的主机数量和影响范围|先对一台实验机执行，再按批次推广；制造一台失败，验证停止条件、剩余目标和回退步骤。|会排障|进阶`);
addModule('linux',{id:'linux-ansible',stage:6,title:'Ansible 批量自动化',sub:'Inventory / Playbook / 幂等 / 分批',
 level:'会用',scope:'必修',pre:'Bash 基础、SSH、sudo 与 Git',
 topics:window.OPS_LEAVES['linux-ansible'].map(n=>n.objective),
 outcome:'能把一台主机上的维护步骤变成可复查、可重复且限制执行范围的批量任务。',
 exercise:'为两台实验主机部署同一个测试服务，使用变量生成配置；连续执行验证幂等，再演练配置校验失败与单主机失败后的停止和恢复。',
 boundary:'先用可丢弃实验主机；check 模式不是完整执行证明，凭证加密也不等于运行时不会泄漏。不要直接用全部生产主机练习。',
 resource:'delivery/ansible/01-foundations-inventory-and-modules.md',relatedRoutes:['devops']});
for(const leaf of window.OPS_LEAVES['linux-ansible']){
 if(!['inventory','modules'].includes(leaf.id.split('.')[1]))leaf.resource='delivery/ansible/02-playbooks-operations-and-delivery.md';
}
const automationOrder=['bash','git','linux-ansible','python','handover'];
window.OPS_LINUX.nodes=[...window.OPS_LINUX.nodes.filter(m=>m.stage!==6),...automationOrder.map(id=>window.OPS_LINUX.nodes.find(m=>m.id===id))];
window.OPS_LINUX.stages[6].sub='脚本与 Git、Ansible 批量操作和运行交接';
window.OPS_LINUX.stages[6].proof='整理部署脚本、Git 记录、Ansible 清单与 Playbook、监控配置和恢复手册。在两台实验机验证重复执行与分批失败停止，再让另一位同学按文档完成部署。';
const deliveryAnsible=window.OPS_EXTRA_ROUTES.find(r=>r.id==='devops').nodes.find(m=>m.id==='d-ansible');
deliveryAnsible.pre='Linux 路线中的 Ansible 基础、Git 与测试环境';
deliveryAnsible.boundary='主机操作基础可先学 Linux 第 7 阶段；本模块把 Ansible 接入环境准备与交付流程。不要在 Playbook 中硬编码凭证。';
