const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const context=vm.createContext({window:{},console});
for(const [,src] of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script src="([^"]+)"/g)){
 if(src==='app.js')continue;
 vm.runInContext(fs.readFileSync(path.join(root,src),'utf8'),context,{filename:src});
}
const routes=context.window.OPS_LEARNING_ROUTES,store=context.window.OPS_PROGRESS;
class Storage{
 constructor(){this.data=new Map()}
 getItem(k){return this.data.get(k)??null}
 setItem(k,v){this.data.set(k,v)}
 removeItem(k){this.data.delete(k)}
}
test('all curriculum nodes have unique stable IDs, complete acceptance and valid local resources',()=>{
 const ids=new Set(),modules=new Set();
 for(const r of routes){
  assert.equal(r.stages.length,r.id==='linux'?7:6);
  assert.equal(r.chapters.length,r.stages.length);
  assert.equal(r.practiceNames.length,r.stages.length);
  for(const m of r.modules){assert(!modules.has(m.id));modules.add(m.id);assert(m.children.length);assert(m.stage>=0&&m.stage<r.stages.length)}
  for(const n of r.nodes){
   assert(!ids.has(n.id),n.id);ids.add(n.id);
   for(const field of ['title','objective','exercise','pre','boundary'])assert(n[field],n.id+' '+field);
   assert(['入门','进阶','选修'].includes(n.tier));assert(r.modules.some(m=>m.id===n.moduleId));
   if(n.resource&&!/^https?:/.test(n.resource)){
    const [file,anchor]=n.resource.split('#');
    const target=path.resolve(root,file.startsWith('labs/')?file:'../topics/'+file);
    assert(fs.existsSync(target),n.id+' '+target);
    if(anchor&&file.endsWith('.md')){
     const headings=fs.readFileSync(target,'utf8').split('\n').filter(l=>/^#+ /.test(l)).map(l=>l.replace(/^#+ /,'').toLowerCase().replace(/ /g,'-'));
     const explicit=[...fs.readFileSync(target,'utf8').matchAll(/<a id="([^"]+)"/g)].map(match=>match[1]);
     assert(headings.includes(anchor)||explicit.includes(anchor),n.id+' '+anchor);
    }
   }
  }
 }
 const linux=routes.find(r=>r.id==='linux');
 assert(linux.nodes.filter(n=>n.moduleId==='shell-basics'&&n.id.startsWith('bash.')).length===3);
 assert(linux.nodes.filter(n=>['mq-foundations','service-discovery'].includes(n.moduleId)).every(n=>n.tier==='进阶'));
});
test('MySQL and Redis occupy a dedicated Linux stage with existing progress preserved',()=>{
 const linux=routes.find(r=>r.id==='linux');
 assert.equal(routes.length,6);
 assert.equal(linux.chapters[4],'数据库与缓存运维');
 for(const id of ['mysql','redis','mysql-operations','redis-operations']){
  const module=linux.modules.find(m=>m.id===id);
  assert.equal(module.stage,4);
  assert(module.children.every(n=>n.stage===4));
 }
 assert.equal(linux.modules.find(m=>m.id==='nginx').stage,3);
 assert.equal(linux.modules.find(m=>m.id==='monitoring').stage,5);
 assert.equal(linux.modules.find(m=>m.id==='bash').stage,6);
 const ansible=linux.modules.find(m=>m.id==='linux-ansible');
 assert.equal(ansible.stage,6);
 assert.equal(ansible.children.length,9);
 assert(ansible.children.every(n=>n.resource.startsWith('delivery/ansible/')));
 const storage=new Storage();
 storage.setItem(store.key('linux'),JSON.stringify({version:1,states:{'mysql.sql':'done','redis.keys':'learning'},notes:{'mysql.sql':'previous evidence'}}));
 const backup=store.parse(JSON.stringify(store.snapshot(storage,routes)),routes);
 assert.equal(backup.linux.states['mysql.sql'],'done');
 assert.equal(backup.linux.states['redis.keys'],'learning');
 assert.equal(backup.linux.notes['mysql.sql'],'previous evidence');
});
test('SDLC practice is linked by capability and shared by Python and Go',()=>{
 const platform=routes.find(r=>r.id==='platform');
 const additions=platform.modules.filter(m=>['p-intent','p-ai-context','p-ai-evaluation','p-ai-delivery'].includes(m.id));
 assert.equal(additions.length,4);
 const nodes=additions.flatMap(m=>m.children);
 assert.equal(nodes.length,16);
 assert(nodes.every(n=>!n.track&&n.resource.startsWith('delivery/ai-native-sdlc/playbook.md#ops-')));
 assert.equal(nodes.filter(n=>n.tier==='入门').length,3);
});
test('backup round trip keeps both language tracks, evidence and legacy without marking leaves done',()=>{
 const storage=new Storage(),p=routes.find(r=>r.id==='platform');
 const py=p.nodes.find(n=>n.track==='python'),go=p.nodes.find(n=>n.track==='go');
 storage.setItem(store.key('platform'),JSON.stringify({version:1,states:{[py.id]:'done',[go.id]:'learning'},notes:{[go.id]:'<script>literal evidence</script>'}}));
 storage.setItem('ops-atlas-linux-v1',JSON.stringify({lab:'done'}));
 const exported=store.snapshot(storage,routes),parsed=store.parse(JSON.stringify(exported),routes),target=new Storage();
 store.merge(target,parsed,routes);
 const result=JSON.parse(target.getItem(store.key('platform')));
 assert.equal(result.states[py.id],'done');assert.equal(result.states[go.id],'learning');
 assert.equal(result.notes[go.id],'<script>literal evidence</script>');
 const linux=JSON.parse(target.getItem(store.key('linux')));
 assert.equal(linux.legacyModules.lab,'done');assert.equal(Object.keys(linux.states).length,0);
});
test('merge retains absent values, supports explicit note clearing and preserves moved IDs',()=>{
 const storage=new Storage(),linux=routes[0],moved=linux.nodes.find(n=>n.moduleId==='shell-basics'&&n.id.startsWith('bash.')).id;
 storage.setItem(store.key('linux'),JSON.stringify({states:{[moved]:'done','lab.vm':'done'},notes:{[moved]:'old','lab.vm':'keep'}}));
 store.merge(storage,{linux:{states:{[moved]:'learning'},notes:{[moved]:''}}},routes);
 const result=JSON.parse(storage.getItem(store.key('linux')));
 assert.equal(result.states['lab.vm'],'done');assert.equal(result.states[moved],'learning');assert.equal(result.notes[moved],'');assert.equal(result.notes['lab.vm'],'keep');
});
test('invalid backups are rejected before writes; storage failure rolls back previous routes',()=>{
 for(const value of ['{}','null','[]','{"format":"ops-roadmap-progress","version":2,"routes":{}}'])assert.throws(()=>store.parse(value,routes));
 for(const data of [{states:{'lab.vm':'bad'}},{states:{unknown:'done'}},{notes:{'lab.vm':'x'.repeat(2001)}},{notes:[]},{version:2}])assert.throws(()=>store.record(data,routes[0]));
 const storage=new Storage();storage.setItem(store.key('linux'),JSON.stringify({states:{'lab.vm':'learning'}}));
 const before=storage.getItem(store.key('linux')),original=storage.setItem.bind(storage);
 storage.setItem=(k,v)=>{if(k===store.key('cloud'))throw new Error('quota');original(k,v)};
 assert.throws(()=>store.merge(storage,{linux:{states:{'lab.vm':'done'}},cloud:{states:{}}},routes),/已恢复原记录/);
 assert.equal(storage.getItem(store.key('linux')),before);assert.equal(storage.getItem(store.key('cloud')),null);
});
