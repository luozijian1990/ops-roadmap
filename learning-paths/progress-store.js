/* Shared, testable backup contract. Import is previewed before any storage write. */
window.OPS_PROGRESS = (()=>{
 const statuses=new Set(['todo','learning','done']);
 const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
 const key=id=>`ops-atlas-${id}-leaves-v1`;
 function record(value,route){
  if(!object(value))throw new Error('路线记录必须为对象');
  if(value.version!==undefined&&value.version!==1)throw new Error('不支持的路线记录版本');
  const nodes=new Set(route.nodes.map(n=>n.id)),modules=new Set(route.modules.map(m=>m.id));
  const result={version:1,states:{},notes:{},legacyModules:{}};
  for(const field of ['states','notes','legacyModules']){
   if(value[field]===undefined)continue;
   if(!object(value[field]))throw new Error('无效字段：'+field);
   for(const [id,item] of Object.entries(value[field])){
    if(!(field==='legacyModules'?modules:nodes).has(id))throw new Error('未知学习节点或模块：'+id);
    if(field==='notes'?typeof item!=='string'||item.length>2000:!statuses.has(item))throw new Error('无效记录：'+id);
    result[field][id]=item;
   }
  }
  return result;
 }
 function snapshot(storage,routes){
  return {format:'ops-roadmap-progress',version:1,exportedAt:new Date().toISOString(),routes:Object.fromEntries(routes.map(route=>{
   const value=record(JSON.parse(storage.getItem(key(route.id))||'{}'),route);
   // Export old module-only records as well, without upgrading them to leaf completion.
   const old=JSON.parse(storage.getItem(`ops-atlas-${route.id}-v1`)||'{}');
   for(const m of route.modules)if(!Object.hasOwn(value.legacyModules,m.id)&&['learning','done'].includes(old?.[m.id]))value.legacyModules[m.id]=old[m.id];
   return [route.id,value];
  }))};
 }
 function parse(text,routes){
  if(text.length>5*1024*1024)throw new Error('文件超过 5 MB');
  const value=JSON.parse(text);
  if(!object(value)||value.format!=='ops-roadmap-progress'||value.version!==1||!object(value.routes))throw new Error('不是支持的学习进度备份');
  const result={};
  for(const [id,data] of Object.entries(value.routes)){
   const route=routes.find(r=>r.id===id);if(!route)throw new Error('未知路线：'+id);
   result[id]=record(data,route);
  }
  if(!Object.keys(result).length)throw new Error('备份没有路线记录');
  return result;
 }
 function merge(storage,incoming,routes){
  const writes=Object.entries(incoming).map(([id,data])=>{
   const route=routes.find(r=>r.id===id);if(!route)throw new Error('未知路线');
   const before=storage.getItem(key(id)),current=record(JSON.parse(before||'{}'),route),next=record(data,route);
   for(const field of ['states','notes','legacyModules'])current[field]={...current[field],...next[field]};
   return {key:key(id),before,after:JSON.stringify(current)};
  });
  const completed=[];
  try{for(const write of writes){storage.setItem(write.key,write.after);completed.push(write)}}
  catch(error){
   let rollbackFailed=false;
   for(const write of completed.reverse())try{write.before===null?storage.removeItem(write.key):storage.setItem(write.key,write.before)}catch{rollbackFailed=true}
   throw new Error(rollbackFailed?'写入和恢复原记录均失败，请保留备份并检查浏览器存储。':'存储写入失败，已恢复原记录；未完成导入。');
  }
 }
 return {key,record,snapshot,parse,merge};
})();
