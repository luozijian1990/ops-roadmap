'use strict';
const $=s=>document.querySelector(s);
const routes=window.OPS_LEARNING_ROUTES;
const statusNames={todo:'未开始',learning:'学习中',done:'已完成'};
const tiers=['入门','进阶','选修'];
let route, nodes=[], progress={}, legacy={}, key='', storageOK=true;
let view=innerWidth<700?'list':'map', track='python', scale=1, fitMode=true, canvasHeight=0;
let opened=new Set(), selected=null, returnTarget=null, activeDetail=null;
let viewByRoute=new Map(), noticeTimer;
try{track=localStorage.getItem('ops-path-language')==='go'?'go':'python'}catch{}
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state=id=>progress[id]||'todo';
const activeChildren=m=>m.children.filter(n=>!n.track||n.track===track);
const moduleById=id=>route.modules.find(m=>m.id===id);
const leafById=id=>route.nodes.find(n=>n.id===id);
const oldKey=id=>`ops-atlas-${id}-v1`;
function readObject(name){const value=JSON.parse(localStorage.getItem(name)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function loadProgress(){
 progress={};legacy={};storageOK=true;
 let saved={},old={};
 try{saved=readObject(key)}catch{storageOK=false}
 // A damaged legacy record must never hide valid new-node progress.
 try{old=readObject(oldKey(route.id))}catch{}
 for(const n of route.nodes)if(Object.hasOwn(statusNames,saved.states?.[n.id]))progress[n.id]=saved.states[n.id];
 for(const m of route.modules){const value=saved.legacyModules?.[m.id]||old[m.id];if(['learning','done'].includes(value))legacy[m.id]=value}
}
function saveProgress(){try{localStorage.setItem(key,JSON.stringify({version:1,states:progress,legacyModules:legacy}));storageOK=true}catch{storageOK=false}}
function matching(n){
 const q=$('#search').value.trim().toLowerCase(),filter=$('#filter').value,stage=$('#stage-filter').value;
 const m=moduleById(n.moduleId);
 return (stage==='all'||n.stage===Number(stage))&&
  (filter==='all'||filter==='required'&&n.tier==='入门'||filter==='advanced'&&n.tier==='进阶'||filter==='optional'&&n.tier==='选修'||state(n.id)===filter)&&
  [n.title,n.objective,n.exercise,m.title,m.sub].join(' ').toLowerCase().includes(q);
}
const filtering=()=>!!$('#search').value.trim()||$('#filter').value!=='all'||$('#stage-filter').value!=='all';
const shownChildren=m=>activeChildren(m).filter(matching);
const expanded=m=>opened.has(m.id)||(filtering()&&shownChildren(m).length>0);
function countModule(m){const all=activeChildren(m);return `${all.filter(n=>state(n.id)==='done').length}/${all.length}`}
function leafButton(n,kind='graph'){
 const st=state(n.id);
 return `<button class="skill-leaf ${kind==='list'?'list-leaf':''} ${selected===n.id?'selected':''}" data-leaf="${esc(n.id)}" data-status="${st}" aria-label="${esc(n.title)}，${n.tier}，${statusNames[st]}"><span class="leaf-title">${esc(n.title)}</span><span class="leaf-meta"><span class="tier ${n.tier==='进阶'?'advanced':n.tier==='选修'?'optional':''}">${n.tier==='入门'?'':n.tier}</span><span class="leaf-state" aria-hidden="true">${st==='done'?'✓':st==='learning'?'◐':'○'}</span></span></button>`;
}
function moduleHeader(m){
 const isOpen=expanded(m);
 return `<div class="module-heading"><button class="module-toggle" data-toggle-module="${m.id}" aria-expanded="${isOpen}" aria-controls="children-${m.id}"><span>${esc(m.title)}</span><small>${countModule(m)} ${isOpen?'−':'+'}</small></button><button class="module-info" data-module="${m.id}" aria-label="${esc(m.title)}模块说明">详情</button></div>`;
}
function renderGraph(){
 const WIDTH=1100,center=550;
 let path='',html=`<div class="graph-root" style="left:425px;top:61px">${esc(route.root)}<small>${route.modules.length} 个模块 / ${nodes.length} 个学习节点</small></div>
 <div class="graph-note left"><strong>阶段 → 模块 → 学习节点</strong><div class="note-row"><i class="sample"></i>黄色节点连接学习主线</div><div class="note-row"><i class="sample leaf"></i>点击模块展开具体能力</div><div class="note-row">○ 未开始　◐ 学习中　✓ 已完成</div></div>
 <div class="graph-note right"><strong>用一个项目贯穿学习</strong><p>${esc(route.project)}</p></div>`;
 let y=205,lastBottom=124,visible=0;
 route.stages.forEach((stage,i)=>{
  const modules=route.modules.filter(m=>m.stage===i&&shownChildren(m).length);
  if(!modules.length)return;
  visible++;
  path+=`<path d="M${center} ${lastBottom} L${center} ${y}"/>`;
  html+=`<div class="phase-label" style="left:425px;top:${y-25}px">${esc(stage.sub)}</div><button class="chapter" data-stage="${i}" style="left:440px;top:${y}px;width:220px"><small>${String(i+1).padStart(2,'0')}</small>${esc(route.chapters[i])}</button>`;
  const offsets=[y+82,y+82];
  modules.forEach((m,j)=>{
   const side=j%2,left=side===0,x=left?22:726,my=offsets[side],children=shownChildren(m),isOpen=expanded(m);
   const height=isOpen?57+children.length*38:69;
   path+=`<path class="branch" d="M${left?440:660} ${y+24} C${left?390:710} ${y+24},${left?414:686} ${my+20},${left?374:726} ${my+20}"/>`;
   html+=`<section class="module-group ${isOpen?'expanded':''}" data-group="${m.id}" style="left:${x}px;top:${my}px;width:352px;height:${height}px">${moduleHeader(m)}<div class="module-children" id="children-${m.id}" ${isOpen?'':'hidden'}>${isOpen?children.map(n=>leafButton(n)).join(''):''}</div>${!isOpen?`<div class="collapsed-caption">${children.length} 个学习节点${legacy[m.id]?` · 旧版${statusNames[legacy[m.id]]}`:''}</div>`:''}</section>`;
   offsets[side]+=height+23;
  });
  const checkpointY=Math.max(...offsets)+3;
  path+=`<path d="M${center} ${y+48} L${center} ${checkpointY}"/>`;
  html+=`<button class="checkpoint" data-practice="${i}" style="left:415px;top:${checkpointY}px"><span>实践 ${String(i+1).padStart(2,'0')}</span>${esc(route.practiceNames[i])}</button>`;
  lastBottom=checkpointY+43;y=lastBottom+87;
 });
 if(!visible){$('#canvas').innerHTML='';canvasHeight=0;return}
 const finishY=y-5;
 path+=`<path d="M${center} ${lastBottom} L${center} ${finishY}"/>`;
 html+=`<div class="finish" style="left:380px;top:${finishY}px">${esc(route.finish)}<small>${esc(route.finishSub)}</small></div><div class="finish-note" style="left:290px;top:${finishY+77}px;width:520px">后续方向：${route.next.map(id=>`<button class="next-route" data-switch="${id}">${esc(routes.find(r=>r.id===id).label)} →</button>`).join(' ')}<br>进阶与选修按岗位选择，不要求一次学完。</div>`;
 canvasHeight=finishY+160;
 $('#canvas').style.height=`${canvasHeight}px`;
 $('#canvas').innerHTML=`<svg class="connections" style="width:${WIDTH}px;height:${canvasHeight}px" viewBox="0 0 ${WIDTH} ${canvasHeight}" aria-hidden="true">${path}</svg>${html}`;
}
function renderList(){
 $('#list').innerHTML=route.stages.map((stage,i)=>{
  const modules=route.modules.filter(m=>m.stage===i&&shownChildren(m).length);
  if(!modules.length)return '';
  return `<section class="list-stage"><h2><span>${String(i+1).padStart(2,'0')}</span>${esc(route.chapters[i])}</h2>${modules.map(m=>`<section class="list-module">${moduleHeader(m)}<div class="module-children" id="list-children-${m.id}" ${expanded(m)?'':'hidden'}>${expanded(m)?shownChildren(m).map(n=>leafButton(n,'list')).join(''):''}</div>${!expanded(m)?`<p class="list-hint">${activeChildren(m).length} 个节点，点击展开</p>`:''}</section>`).join('')}<button class="list-practice" data-practice="${i}">阶段实践：${esc(route.practiceNames[i])} →</button></section>`;
 }).join('');
 // Map and list are separate accessible trees; controls must target their own tree.
 $('#list').querySelectorAll('[aria-controls]').forEach(el=>el.setAttribute('aria-controls','list-'+el.getAttribute('aria-controls')));
}
function update(){
 nodes=route.nodes.filter(n=>!n.track||n.track===track);
 const hits=nodes.filter(matching).length,done=nodes.filter(n=>state(n.id)==='done').length;
 $('#progress-text').textContent=`${done} / ${nodes.length} 学习节点已完成`;
 $('#progress-fill').style.width=`${done/nodes.length*100}%`;
 $('.progress-track').setAttribute('aria-valuemax',nodes.length);$('.progress-track').setAttribute('aria-valuenow',done);
 $('.summary').innerHTML=`<strong>${nodes.length}</strong> 个学习节点<small>${route.stages.length} 阶段 / ${route.modules.length} 模块</small>`;
 $('#result-count').textContent=filtering()?`${hits} 个匹配`:'';
 $('#empty').hidden=hits>0;
 $('#canvas-scroll').hidden=view!=='map'||!hits;$('#list').hidden=view!=='list'||!hits;$('#zoom').hidden=view!=='map';
 $('#map-view').classList.toggle('active',view==='map');$('#map-view').setAttribute('aria-pressed',view==='map');$('#list-view').classList.toggle('active',view==='list');$('#list-view').setAttribute('aria-pressed',view==='list');
 if(view==='map'){renderGraph();$('#list').innerHTML=''}else{renderList();$('#canvas').innerHTML=''}
 $('#legacy-notice').hidden=Object.keys(legacy).length===0;
 $('#legacy-count').textContent=Object.keys(legacy).length;
 $('#expand-all').disabled=filtering();$('#collapse-all').disabled=filtering();
 applyScale();
}
function applyScale(){
 if(view!=='map'||$('#canvas-scroll').hidden)return;
 if(fitMode)scale=Math.min(1,$('#canvas-scroll').clientWidth/1100);
 $('#canvas').style.transform=`scale(${scale})`;$('#canvas-wrap').style.width=`${1100*scale}px`;$('#canvas-wrap').style.height=`${canvasHeight*scale}px`;$('#zoom-value').textContent=`${Math.round(scale*100)}%`;
}
function renderPreservingAnchor(callback,selector){
 const old=selector?document.querySelector(selector):null,top=old?.getBoundingClientRect().top;
 callback();update();
 const next=selector?document.querySelector(selector):null;
 if(next&&top!==undefined){window.scrollBy(0,next.getBoundingClientRect().top-top);next.focus({preventScroll:true})}
}
function setView(value){view=value;update()}
function isolate(active){$('header').inert=active;$('main').inert=active;document.body.style.overflow=active?'hidden':''}
function closeDrawer(){
 $('#drawer').hidden=true;$('#backdrop').hidden=true;isolate(false);selected=null;update();
 if(returnTarget){(document.querySelector(returnTarget)||$('.routes .active')).focus({preventScroll:true})}
 activeDetail=null;
}
function openDrawer(kind,id){
 const scope=view==='map'?'#canvas':'#list';
 returnTarget=kind==='leaf'?`${scope} [data-leaf="${id}"]`:kind==='module'?`${scope} [data-module="${id}"]`:kind==='legacy'?'#legacy-records':`${scope} [data-${kind}="${id}"]`;
 activeDetail={kind,id};selected=kind==='leaf'?id:null;
 renderDetail();$('#drawer').hidden=false;$('#backdrop').hidden=false;isolate(true);$('#drawer').scrollTop=0;$('.close').focus();
}
function resourceHTML(resource){return resource?`<a class="resource" href="${esc(/^https?:/.test(resource)?resource:'../topics/'+resource)}" target="_blank" rel="noopener">${/^https?:/.test(resource)?'阅读官方资料':'阅读相关模块笔记'} ↗</a><p class="boundary">这是相关模块的资料入口，先学习本节点范围；部分资料尚待细化到章节。</p>`:'<p class="boundary">本节点暂无专属资料。先按目标实践，保存自己的实验记录；可先按目标练习并记录结果。</p>'}
function renderDetail(){
 const {kind,id}=activeDetail;let title='',context='',body='',controls='';
 if(kind==='leaf'){
  const n=leafById(id),m=moduleById(n.moduleId);title=n.title;context=`${route.chapters[n.stage]} / ${m.title}`;
  body=`<p class="description">${esc(n.objective)}</p><div class="badges"><span class="badge required">${n.tier}${n.tier==='入门'?'必修':''}</span><span class="badge">目标：${n.level}</span>${n.track?`<span class="badge">${n.track==='python'?'Python':'Go'} 主修</span>`:''}</div>
  <section class="detail-section"><h3>前置知识</h3><div class="pre">${esc(n.pre)}</div>${n.relatedRoutes.map(rid=>`<button class="next-route" data-switch="${rid}">相关路线：${esc(routes.find(r=>r.id===rid).label)} →</button>`).join('')}</section>
  <section class="detail-section"><h3>独立验收</h3><div class="assessment">${esc(n.exercise)}</div><p class="boundary">留下命令、输出或观察记录，再判断是否达标。模块边界：${esc(n.boundary)}</p></section>
  <section class="detail-section"><h3>学习资料</h3>${resourceHTML(n.resource)}</section>
  <button class="module-link" data-open-module="${m.id}">查看「${esc(m.title)}」全部 ${activeChildren(m).length} 个节点 →</button>`;
  controls=`<div class="drawer-status"><p>${storageOK?'进度只标记当前学习节点。':'浏览器存储不可用，进度仅保留在本次页面。'}</p><div class="status-buttons">${Object.entries(statusNames).map(([value,label])=>`<button data-status-action="${value}" class="${state(id)===value?'active':''}" aria-pressed="${state(id)===value}">${label}${value==='done'?' ✓':''}</button>`).join('')}</div></div>`;
 }else if(kind==='module'){
  const m=moduleById(id);title=m.title;context=`${route.chapters[m.stage]} / 能力模块`;
  body=`<p class="description">${esc(m.outcome)}</p><p class="boundary">已完成 ${countModule(m)} 个节点。${legacy[id]?`旧版模块记录：${statusNames[legacy[id]]}；不计入新节点完成数。`:''}</p><section class="detail-section"><h3>学习范围</h3><ul>${m.topics.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section><section class="detail-section"><h3>具体学习节点</h3><div class="chapter-items">${activeChildren(m).map(n=>`<button data-open-leaf="${n.id}">${esc(n.title)}<small>${n.tier} / ${statusNames[state(n.id)]}</small></button>`).join('')}</div></section><section class="detail-section"><h3>模块综合练习</h3><div class="assessment">${esc(m.exercise)}</div></section>${resourceHTML(m.resource)}`;
 }else if(kind==='legacy'){
  title='旧版模块学习记录';context='进度迁移说明';
  body=`<p class="description">旧版进度已保留。由于一个模块拆成了多个独立能力，不会自动把它们都标成已完成。</p><div class="chapter-items">${route.modules.filter(m=>legacy[m.id]).map(m=>`<button data-open-module="${m.id}">${esc(m.title)}<small>旧版${statusNames[legacy[m.id]]}</small></button>`).join('')}</div><p class="boundary">请按已有能力逐项复核。新记录单独保存，旧版存储未被修改。</p>`;
 }else{
  const stage=route.stages[Number(id)];title=kind==='practice'?stage.task:route.chapters[Number(id)];context=`阶段 ${Number(id)+1} / ${kind==='practice'?'综合实践':'学习范围'}`;
  body=`<p class="description">${esc(stage.sub)}</p><section class="detail-section"><h3>阶段验收</h3><div class="assessment">${esc(stage.proof)}</div></section><section class="detail-section"><h3>本阶段能力模块</h3><div class="chapter-items">${route.modules.filter(m=>m.stage===Number(id)).map(m=>`<button data-open-module="${m.id}">${esc(m.title)}<small>${countModule(m)} 节点完成</small></button>`).join('')}</div></section><p class="boundary">各模块支持单独复习，综合实践用于检验跨模块能力，不自动改变节点状态。</p>`;
 }
 $('#drawer').innerHTML=`<div class="drawer-bar"><span>${esc(context)}</span><button class="close" aria-label="关闭详情">×</button></div><div class="drawer-body"><h2 id="detail-title">${esc(title)}</h2>${body}</div>${controls}`;
}
function notice(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#toast').hidden=true,1800)}
function switchRoute(id){
 if(route)viewByRoute.set(route.id,new Set(opened));
 route=routes.find(r=>r.id===id)||routes[0];key=`ops-atlas-${route.id}-leaves-v1`;loadProgress();
 opened=viewByRoute.get(route.id)||new Set(route.modules.filter(m=>m.stage===0).map(m=>m.id));selected=null;returnTarget=null;activeDetail=null;
 $('#drawer').hidden=true;$('#backdrop').hidden=true;isolate(false);$('#toast').hidden=true;clearTimeout(noticeTimer);
 $('#search').value='';$('#filter').value='all';$('#stage-filter').innerHTML='<option value="all">全部阶段</option>'+route.stages.map((s,i)=>`<option value="${i}">${i+1}. ${esc(route.chapters[i])}</option>`).join('');fitMode=true;
 $('h1').textContent=route.title;$('.lead').textContent=route.lead;document.title=route.title+'学习路线 | Ops Roadmap';
 $('.breadcrumb span').textContent=`路线 ${String(routes.indexOf(route)+1).padStart(2,'0')} / 共 ${routes.length} 条`;
 $('#route-pre').textContent=route.pre;$('#prerequisite-links').innerHTML=route.requires.map(rid=>`<button data-switch="${rid}">先学：${esc(routes.find(r=>r.id===rid).label)} →</button>`).join('');
 $('#route-goal').textContent=route.goal;$('#route-source').innerHTML=`资料依据：<a href="${esc(route.sourceUrl)}" target="_blank" rel="noopener">${esc(route.sourceTitle)}</a>。节点目标和验收任务为教学设计。`;
 $('.routes').innerHTML=routes.map(r=>`<button class="route ${r.id===route.id?'active':''}" data-switch="${r.id}" ${r.id===route.id?'aria-current="page"':''}>${esc(r.label)}</button>`).join('');
 $('#language-control').hidden=route.id!=='platform';$('#language').value=track;
 update();$('.routes .active').scrollIntoView({block:'nearest',inline:'nearest'});window.scrollTo(0,0);
}
$('.workspace').addEventListener('click',event=>{
 const t=event.target.closest('[data-toggle-module]');if(t){const id=t.dataset.toggleModule,selector=`${view==='map'?'#canvas':'#list'} [data-toggle-module="${id}"]`;if(filtering()){notice('筛选时自动展开匹配模块；清除筛选后可收起。');return}renderPreservingAnchor(()=>opened.has(id)?opened.delete(id):opened.add(id),selector);return}
 for(const [attribute,kind] of [['leaf','leaf'],['module','module'],['practice','practice'],['stage','stage']]){const target=event.target.closest(`[data-${attribute}]`);if(target){openDrawer(kind,target.dataset[attribute]);return}}
});
$('#drawer').addEventListener('click',event=>{
 if(event.target.closest('.close'))return closeDrawer();
 const module=event.target.closest('[data-open-module]');if(module){activeDetail={kind:'module',id:module.dataset.openModule};renderDetail();$('#drawer').scrollTop=0;$('.close').focus();return}
 const leaf=event.target.closest('[data-open-leaf]');if(leaf){selected=leaf.dataset.openLeaf;activeDetail={kind:'leaf',id:selected};renderDetail();$('#drawer').scrollTop=0;$('.close').focus();return}
 const button=event.target.closest('[data-status-action]');if(!button||activeDetail.kind!=='leaf')return;
 progress[activeDetail.id]=button.dataset.statusAction;saveProgress();const top=$('#drawer').scrollTop;renderDetail();$('#drawer').scrollTop=top;update();$(`[data-status-action="${button.dataset.statusAction}"]`).focus();notice(storageOK?'当前节点进度已保存':'当前浏览器无法保存，进度仅在本次页面有效');
});
$('#search').addEventListener('input',update);$('#filter').addEventListener('change',update);$('#stage-filter').addEventListener('change',()=>{update();$('.tools').scrollIntoView({block:'start'})});
$('#clear').addEventListener('click',()=>{$('#search').value='';$('#filter').value='all';$('#stage-filter').value='all';update();$('#search').focus()});
$('#map-view').addEventListener('click',()=>setView('map'));$('#list-view').addEventListener('click',()=>setView('list'));
$('#expand-all').addEventListener('click',()=>{opened=new Set(route.modules.map(m=>m.id));update()});$('#collapse-all').addEventListener('click',()=>{opened.clear();update()});
$('#language').addEventListener('change',()=>{track=$('#language').value;try{localStorage.setItem('ops-path-language',track)}catch{}update()});
$('#legacy-records').addEventListener('click',()=>openDrawer('legacy',''));
$('#zoom-in').addEventListener('click',()=>{fitMode=false;scale=Math.min(1.4,scale+.15);applyScale()});$('#zoom-out').addEventListener('click',()=>{fitMode=false;scale=Math.max(.3,scale-.15);applyScale()});$('#fit').addEventListener('click',()=>{fitMode=true;applyScale()});window.addEventListener('resize',applyScale);
$('#backdrop').addEventListener('click',closeDrawer);
document.addEventListener('keydown',event=>{
 if($('#drawer').hidden)return;if(event.key==='Escape')return closeDrawer();
 if(event.key==='Tab'){const all=[...$('#drawer').querySelectorAll('button,a[href]')],first=all[0],last=all.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
});
document.addEventListener('click',event=>{const target=event.target.closest('[data-switch]');if(target&&target.dataset.switch!==route.id)location.hash=target.dataset.switch});
window.addEventListener('hashchange',()=>{switchRoute(location.hash.slice(1));$('.routes .active').focus({preventScroll:true})});
const themeMedia=matchMedia('(prefers-color-scheme: dark)');let theme=null;try{theme=localStorage.getItem('ops-atlas-theme')}catch{}
function applyTheme(value){document.documentElement.dataset.theme=value;$('#theme').textContent=value==='dark'?'浅色模式':'深色模式';$('#theme').setAttribute('aria-label',value==='dark'?'切换到浅色模式':'切换到深色模式')}
applyTheme(['light','dark'].includes(theme)?theme:themeMedia.matches?'dark':'light');$('#theme').addEventListener('click',()=>{theme=document.documentElement.dataset.theme==='dark'?'light':'dark';applyTheme(theme);try{localStorage.setItem('ops-atlas-theme',theme)}catch{}});themeMedia.addEventListener('change',e=>{if(!theme)applyTheme(e.matches?'dark':'light')});
switchRoute(location.hash.slice(1));
