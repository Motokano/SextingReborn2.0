/* Authoritative inventory, knowledge and paid work. The panel only sends actions. */
(function(g){
 'use strict';
 const copy=x=>x==null?x:JSON.parse(JSON.stringify(x)),IE=()=>g.InventoryEquipment,C=()=>g.ForgingConfig,R=()=>g.ForgingRules;
 const key='forging_runtime_v1',fail=m=>{throw Error(m);};
 let committing=false,busy=false,cached=null,lastStored='';
 function state(){
  let s=g.NPCSystem.getFlagValue(key),serialized=JSON.stringify(s);
  if(cached&&serialized===lastStored)return cached;
  if(!s||s.version!==1)s={version:1,knowledge:{identity:{},routes:{},structures:{},recipes:{},effects:{}},job:null,lastResult:null};
  // Merely querying defaults (including snapshot rollback) must not write storage.
  cached=s;lastStored=serialized;return s;
 }
 function write(s){g.NPCSystem.setDemoFlag(key,s);cached=s;lastStored=JSON.stringify(s);}
 function save(){if(!g.SaveSystem?.saveNow('craft.forging'))fail('保存失败，操作已暂停。');}
 function transaction(fn){
  const inv=copy(IE().getState()),npc=copy(g.NPCSystem.getDemoState()),warehouse=g.HideoutWarehouse?.getState();
  try{const result=fn();save();return result;}catch(e){IE().setState(inv);g.NPCSystem.setDemoState(npc);cached=null;if(warehouse)g.HideoutWarehouse.setState(warehouse);throw e;}
 }
 function run(fn){try{return {ok:true,...fn()};}catch(e){return {ok:false,message:e.message};}}
 const level=()=>Math.min(100,Math.max(0,IE().getSkillLevel('life_forging')||0));
 const combat=()=>!!g.CombatEngagement?.isPlayerInCombat();
 function near(){const p=g.GameEngine?.getState(),s=C().station;return !!(p&&p.mapId===s.mapId&&Math.max(Math.abs(p.x-s.x),Math.abs(p.y-s.y))===1&&g.GameEngine.getInteractNpcIdAt(s.x,s.y)===s.npcId);}
 function canAccess(){return near()&&g.NPCSystem.isDemoFlagTrue(C().station.unlock);}
 function access(station=true){
  if(combat())fail('战斗中不能操作。');
  const s=g.Survival.getState();
  if(g.Survival.isDead?.()||s.isDead||g.Survival.canPerformStaminaOrEnergyAction?.()===false)fail('当前身体状况无法工作。');
  if(s.isResting||s.is_study_active||s.is_sit_meditation_active||s.is_stamina_regen_action_active)fail('请先停止休息、学习或调息。');
  if(station&&!canAccess())fail('请在已修复的铸造台旁操作。');
 }
 function owned(){
  const s=IE().getState(),out=[];
  function add(x){if(!x)return;out.push(x);for(const child of IE().getItemInstanceChildren(x))add(child.instance);}
  Object.values(s.equipment||{}).forEach(add);
  for(const c of ['pocket','vest','backpack','vehicle'])(s['inventory_'+c]||[]).forEach(add);
  return out;
 }
 function record(id){const r=IE().findItemInstanceRecord(id);if(!r||r.location.startsWith('ground_items.'))fail('物品不在随身行囊中。');return r;}
 function materialRecord(id){
  const carried=IE().findItemInstanceRecord(id);if(carried&&!carried.location.startsWith('ground_items.'))return carried;
  if(canAccess()&&g.HideoutWarehouse){const slots=g.HideoutWarehouse.getState().slots,index=slots.findIndex(x=>x?.instance_id===id);if(index>=0)return {instance:slots[index],location:'warehouse',warehouseIndex:index};}
  fail('找不到这份材料。');
 }
 function takeMaterial(id){
  const r=materialRecord(id);if(r.location!=='warehouse')return take(id);
  const s=g.HideoutWarehouse.getState(),item=copy(s.slots[r.warehouseIndex]);
  if((item.count||1)>1){s.slots[r.warehouseIndex].count--;delete item.instance_id;item.count=1;IE().ensureItemInstanceIdentity(item);}else s.slots[r.warehouseIndex]=null;
  g.HideoutWarehouse.setState(s);return item;
 }
 function loose(id){const r=record(id),match=/^inventory_(pocket|vest|backpack|vehicle)\[(\d+)\]$/.exec(r.location);if(!match)fail('请先卸下该部件。');return {...r,container:match[1],index:Number(match[2])};}
 function give(x){const r=IE().putItemIntoDefaultContainer(x);if(!r.placed){const p=g.GameEngine.getState();if(!IE().addItemToGround(p.mapId,p.x,p.y,x))fail('没有可放置成品的位置。');}}
 function take(id){const r=loose(id),v=IE().takeItemFromContainer(r.container,r.index);if(!v.success)fail('物品暂时无法取出。');return v.item;}
 function materialCount(id){return canAccess()&&g.HideoutWarehouse?g.HideoutWarehouse.countItemEverywhere(id):IE().countCarriedItemsByTemplateId(id);}
 function pay(recipe){
  if(canAccess()&&g.HideoutWarehouse){if(!g.HideoutWarehouse.consumeItems(Object.entries(recipe).map(([item_id,count])=>({item_id,count}))).ok)fail('用料不足。');}
  else for(const [id,n] of Object.entries(recipe)){if(!IE().removeCarriedItemsByTemplateId(id,n,{strict:true}).ok)fail('用料不足。');}
 }
 function gainXp(xp){
  if(!Number.isFinite(xp)||xp<=0)return;
  const skills=IE().getSkillsState();let s=skills.life_forging;
  if(!s)s=skills.life_forging={level:1,study_exp:0,move_usage:{}};
  s.level=Math.max(1,s.level||0);s.move_usage=s.move_usage||{};
  let units=(s.move_usage.forging_xp_units||0)+Math.round(xp*1000);
  while(s.level<100&&units>=(50*s.level+50)*1000){units-=(50*s.level+50)*1000;s.level++;}
  s.move_usage.forging_xp_units=s.level===100?0:units;
 }
 function managed(id){return !!C().catalog.items[id];}
 function recognition(id){return managed(id)?!!state().knowledge.identity[id]:null;}
 function identified(id){
  const k=state().knowledge;
  if(!k.identity[id])return false;
  const route=C().bindings.feedRoutes[id];return !route||!!k.identity[route.rawItemId];
 }
 function name(id,character){const t=IE().getItemTemplate(id);if(!t)return '物品';return identified(id)&&IE().isLanguageTextUnlocked('sn',character)?(t.sn||t.name):(t.placeholder_name||'物品');}
 function description(id,character){const t=IE().getItemTemplate(id);if(!t||!IE().isLanguageTextUnlocked('fn_before',character))return '';return identified(id)&&IE().isLanguageTextUnlocked('fn',character)?t.fn||'':t.fn_before||'';}
 function identify(instanceId){return run(()=>{access(false);const r=materialRecord(instanceId);if(!managed(r.instance.item_id))fail('无法在这里辨认。');return transaction(()=>{const s=state();s.knowledge.identity[r.instance.item_id]=true;write(s);return {};});});}
 function inspectOre(instanceId){return run(()=>{access();const r=materialRecord(instanceId),ore=C().ores[r.instance.item_id];if(!ore)fail('请放入原矿。');return transaction(()=>{const s=state();s.knowledge.routes[ore.id]=true;write(s);return {};});});}
 function exactKnown(item){const f=item.forged_component,k=state().knowledge;return !!(f&&level()>=25&&k.structures[f.design_id]&&k.recipes[item.instance_id]&&Object.keys(f.recipe).every(id=>k.routes[C().bindings.feedRoutes[id]?.rawItemId]));}
 function describe(item){
  const lines=[description(item.item_id)];const f=item.forged_component;
  if(f&&exactKnown(item)){
   lines.push('耐久 '+f.durability_current.toFixed(2)+' / '+f.durability_max.toFixed(2));
   lines.push(f.final_position_powers.map(p=>({front:'前端',side:'侧面',side1:'侧一',side2:'侧二',hilt:'手柄'}[p.slot]||'部位')+' '+{slash:'劈',pierce:'刺',blunt:'钝'}[p.damageType]+' '+p.power.toFixed(2)).join(' · '));
   lines.push('重量 '+R().round(f.final_weight_kg)+' kg · 先天筋骨 '+f.final_innate_strength);
  }
  if(f?.ore_trait&&state().knowledge.effects[item.instance_id]){
   lines.push(f.ore_trait.name+(level()>=50&&f.ore_trait.sourceOres.every(id=>state().knowledge.routes[id])?' '+R().round(f.ore_trait.value):''));
  }
  return lines.filter(Boolean).join('\n');
 }
 function cost(base,lv){const discounted=base*(1-.002*lv),factor=g.Survival.getActionStaminaCost?g.Survival.getActionStaminaCost(100)/100:1;return Math.ceil((discounted*factor-1e-9)*10)/10;}
 function kitMatches(kitId,part){const kit=record(kitId).instance;if(kit.item_id!=='tool_repair_roll')fail('请选择随身工具包。');return Object.values(kit.connections||{}).some(c=>c.part?.item_id===part.repairToolItemId);}
 function quote(a){
  access(a.type!=='repair');if(state().job)fail('请先完成或停止当前工作。');
  const lv=level();let ticks,xp=0,details={};
  if(a.type==='process'){
   const r=materialRecord(a.id),ore=C().ores[r.instance.item_id];if(!ore||!state().knowledge.routes[ore.id])fail('先在铸造台检查这份原矿。');
   ({ticks,xp}=ore.processing);details={rawId:ore.id,feedId:ore.processing.outputItemId,instanceId:a.id};
  }else if(a.type==='research'){
   const r=loose(a.id),part=C().components[r.instance.item_id];if(!part)fail('请选择部件实物。');
   if(state().knowledge.structures[part.designId])fail('已经掌握这个结构。');
   ({ticks,xp}=part.costs.research);details={partId:part.itemId,designId:part.designId,instanceId:a.id};
  }else if(a.type==='craft'){
   const part=C().components[a.partId];if(!part||!state().knowledge.structures[part.designId])fail('尚未掌握该部件结构。');
   const recipe=copy(a.recipe),m=R().material(part,recipe);
   for(const [id,n] of Object.entries(recipe)){if(!state().knowledge.routes[C().bindings.feedRoutes[id].rawItemId])fail('尚不清楚这种用料的加工用途。');if(materialCount(id)<n)fail('用料不足。');}
   if(!m.eligible)fail('这份投料不能成形。');
   ({ticks}=part.costs.craft);details={partId:part.itemId,recipe};
  }else if(a.type==='repair'){
   const item=record(a.id).instance,part=C().components[item.item_id];if(!part||!item.forged_component)fail('这件部件没有可维修的耐久记录。');
   if(!kitMatches(a.kitId,part))fail('工具包里没有适用的工具。');
   const repair=R().repair(item.forged_component,lv);if(repair.delta<=0)fail('当前耐久已达到你的维修能力。');
   ({ticks,xp}=repair);details={instanceId:a.id,kitId:a.kitId,target:repair.target,before:copy(item.forged_component)};
  }else if(a.type==='attach'){
   const item=loose(a.id).instance,part=C().components[item.item_id];if(!part||!item.forged_component)fail('请选择完整的部件实例。');
   const host=a.hostId?loose(a.hostId).instance:{item_id:'weapon_single_hand_assembly',connections:{}};
   const why=attachmentReason(host,a.anchor,item);if(why)fail(why);
   ({ticks}=part.costs.attach);details={instanceId:a.id,hostId:a.hostId||null,anchor:a.anchor};
  }else if(a.type==='detach'){
   const host=loose(a.hostId).instance,item=host.connections?.[a.anchor]?.part,part=item&&C().components[item.item_id];
   if(host.item_id!=='weapon_single_hand_assembly'||!part)fail('这个位置没有可卸下的部件。');
   ({ticks}=part.costs.detach);details={instanceId:item.instance_id,hostId:a.hostId,anchor:a.anchor};
  }else fail('无法执行这个操作。');
  return {type:a.type,level:lv,ticks,stamina:cost(g.Survival.getIntensityRate(['craft','process'].includes(a.type)?'high':'medium')*ticks,lv),xp,...details};
 }
 function attachmentReason(host,anchor,item){
  if(host.item_id!=='weapon_single_hand_assembly')return '请选择单手武器。';
  const p=C().components[item.item_id],placement=p?.placements.find(p=>p.anchor===anchor);
  if(!placement||!item.forged_component)return '部件不适合这个位置。';
  const coverage=R().coverage(host);
  if(coverage.errors.length||placement.occupies.some(slot=>coverage.positions[slot]))return '部件覆盖的位置已有其他部件。';
  return '';
 }
 function start(a){return run(()=>{
  if(busy)fail('请稍候。');const q=quote(a);
  if(g.Survival.getState().stamina<q.stamina)fail('体力不足。');
  return transaction(()=>{
   const s=state();s.lastResult=null;const j={...q,elapsed:0,paid:0,phase:'work',paused:false};
   if(q.type==='craft'){
    pay(q.recipe);j.seed=(g.crypto?.getRandomValues?g.crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*4294967296))>>>0;
    const rng=()=>{j.rng=(Math.imul(j.rng,1664525)+1013904223)>>>0;return j.rng/4294967296;};j.rng=j.seed;
    const part=C().components[q.partId],f=g.createBladeForge(part.board),places=f.cells.map((_,i)=>i),types=Object.keys(f.effects),specials=[];
    for(let i=0;i<(q.level>=100?4:q.level>=50?3:2);i++)specials.push({index:places.splice(Math.floor(rng()*places.length),1)[0],type:types.splice(Math.floor(rng()*types.length),1)[0]});
    j.board=f.create(specials,j.seed);j.board.left.h=q.level>=75?10:q.level>=25?9:8;j.traitRoll=rng();
   }else if(q.type==='process')j.reserved=takeMaterial(q.instanceId);
   else if(q.type==='research')take(q.instanceId);
   s.job=j;write(s);return {job:copy(j)};
  });
 });}
 function finishWork(j){
  const s=state();if(s.job!==j)fail('工作已经中断。');
  if(j.type==='craft'){j.phase='board';j.paused=false;write(s);return;}
  committing=true;
  try{
   if(j.type==='process'){
    give(IE().ensureItemInstanceIdentity({item_id:j.feedId,count:1}));
    if(s.knowledge.identity[j.rawId])s.knowledge.identity[j.feedId]=true;
   }else if(j.type==='research')s.knowledge.structures[j.designId]=true;
   else if(j.type==='repair'){
    const item=record(j.instanceId).instance;
    if(!kitMatches(j.kitId,C().components[item.item_id])||JSON.stringify(item.forged_component)!==JSON.stringify(j.before))fail('部件或工具已经改变，维修已中断。');
    item.forged_component.durability_current=j.target;item.forged_component.durability_units=Math.round(j.target*100);item.forged_component.zero_durability_result=null;
   }else if(j.type==='attach'){
    const item=loose(j.instanceId).instance;let host=j.hostId?loose(j.hostId).instance:IE().ensureItemInstanceIdentity({item_id:'weapon_single_hand_assembly',count:1,connections:{},weapon_moves:{}});
    const why=attachmentReason(host,j.anchor,item);if(why)fail(why);
    const part=take(j.instanceId);if(j.hostId)host=loose(j.hostId).instance;
    host.connections=host.connections||{};host.connections[j.anchor]={connection_schema_version:1,part};resetMoves(host,part,j.anchor);
    if(!j.hostId){give(host);s.knowledge.identity[host.item_id]=true;}
   }else if(j.type==='detach'){
    const host=loose(j.hostId).instance,part=host.connections?.[j.anchor]?.part;if(part?.instance_id!==j.instanceId)fail('装配已经改变。');
    resetMoves(host,part,j.anchor,true);delete host.connections[j.anchor];give(part);
   }
   gainXp(j.xp);s.job=null;s.lastResult={type:j.type};write(s);
  }finally{committing=false;}
 }
 function resetMoves(host,part,anchor,remove){
  if(host.weapon_combat){host.weapon_combat.pending=(host.weapon_combat.pending||[]).filter(p=>p.source!==part.instance_id);delete host.weapon_combat.frontCharge?.[part.instance_id];}
  host.weapon_moves=host.weapon_moves||{};const spec=C().components[part.item_id],p=spec.placements.find(p=>p.anchor===anchor);
  g.CombatMetaSkills?.weaponChanged(host.instance_id,p.occupies);
  for(const slot of p.occupies){const pos=spec.positions.find(p=>p.slot===slot||p.slot==='side');if(remove)delete host.weapon_moves[slot];else host.weapon_moves[slot]={move_id:pos.fallbackMoveId,variants:[]};}
 }
 function step(){return run(()=>{
  if(busy)fail('请稍候。');let j=state().job;if(!j||j.phase!=='work')fail('没有待推进的工作。');
  if(j.interrupted){cancel();fail('这项工作已中断，请重新开始。');}
  access(j.type!=='repair');
  if(j.type==='repair'&&(!kitMatches(j.kitId,C().components[record(j.instanceId).instance.item_id])||JSON.stringify(record(j.instanceId).instance.forged_component)!==JSON.stringify(j.before))){cancel();fail('部件或工具已经改变。');}
  busy=true;
  try{
   if(j.elapsed<j.ticks){
    const due=Math.round(j.stamina*10*(j.elapsed+1)/j.ticks)/10,charge=R().round(due-j.paid);
    j.paid=due;j.elapsed++;j.paused=false;write(state());
    // Elapsed/paid are recorded before world listeners can autosave or enter combat.
    g.Survival.advanceTick({source:'forging',actionCost:charge});
   }
   if(state().job!==j)return {interrupted:true};
   if(combat()){interrupt();return {interrupted:true};}
   access(j.type!=='repair');
   if(j.elapsed>=j.ticks)transaction(()=>finishWork(j));else save();
   return {done:!state().job||state().job.phase==='board'};
  }finally{busy=false;}
 });}
 function boardAction(a){return run(()=>{
  access();const j=state().job;if(!j||j.phase!=='board')fail('当前没有待打造的部件。');
  if(a.kind==='finish')return finalize();
  const f=g.createBladeForge(C().components[j.partId].board),reason=f.reason(j.board,a);if(reason)fail(reason);
  return transaction(()=>{j.board=f.apply(j.board,a);write(state());return {board:copy(j.board)};});
 });}
 function finalize(){
  return transaction(()=>{
   const s=state(),j=s.job;if(!j||j.phase!=='board')fail('这一炉已经收工。');
   const part=C().components[j.partId],forge=g.createBladeForge(part.board),q=forge.completion(j.board),stars=forge.stars(j.board);
   const item=IE().ensureItemInstanceIdentity({item_id:j.partId,count:1,forged_component:R().result(part,j.recipe,q,j.traitRoll)});
   give(item);s.knowledge.recipes[item.instance_id]=true;gainXp(part.costs.craft.xpByStars[stars]);
   s.lastResult={type:'craft',instanceId:item.instance_id,itemId:item.item_id,completion:q,stars};s.job=null;write(s);return {result:copy(s.lastResult)};
  });
 }
 function cancel(){return run(()=>transaction(()=>{
  const s=state(),j=s.job;if(!j)return {};committing=true;
  try{if(j.reserved)give(j.reserved);s.job=null;write(s);return {};}finally{committing=false;}
 }));}
 function pause(){const s=state();if(s.job){if(['repair','process','attach','detach'].includes(s.job.type))return cancel();s.job.paused=true;write(s);return run(()=>{save();return {};});}return {ok:true};}
 function interrupt(){const s=state();if(!s.job)return;if(['repair','process','attach','detach'].includes(s.job.type)){
  // Record interruption before the cancellation transaction. A failed save may
  // retain a reserved input, but it must never make this work resumable again.
  s.job.interrupted=true;s.job.paused=true;write(s);cancel();
 }else{s.job.paused=true;write(s);try{save();}catch{}}g.ForgingStationPanel?.stopTimer();}
 function isInstanceLocked(id){
  if(committing)return false;const j=state().job;if(!j||!['repair','attach','detach'].includes(j.type))return false;
  const ids=[j.instanceId,j.hostId,j.kitId].filter(Boolean);if(ids.includes(id))return true;
  const item=IE().findItemInstanceRecord(id)?.instance;
  function contains(x){return x&&(ids.includes(x.instance_id)||IE().getItemInstanceChildren(x).some(c=>contains(c.instance)));}
  return !!contains(item);
 }
 function snapshot(){
  const s=state(),items=owned().filter(x=>managed(x.item_id)),lv=level();
  const stock=items.concat(canAccess()&&g.HideoutWarehouse?g.HideoutWarehouse.getState().slots.filter(Boolean):[]);
  return {level:lv,knowledge:copy(s.knowledge),items:copy(items),job:copy(s.job),lastResult:copy(s.lastResult),atStation:canAccess(),inCombat:combat(),
   components:Object.values(C().components).filter(p=>s.knowledge.structures[p.designId]).map(p=>({itemId:p.itemId,name:name(p.itemId),capacity:p.capacity,placements:copy(p.placements),board:copy(p.board),requirements:lv>=10?copy(p.requirements):null})),
   materials:stock.filter(x=>C().ores[x.item_id]||C().bindings.feedRoutes[x.item_id]).map(x=>{const route=C().bindings.feedRoutes[x.item_id],raw=route?.rawItemId||x.item_id;return {instanceId:x.instance_id,itemId:x.item_id,count:x.count||1,name:name(x.item_id),raw:!route,routeKnown:!!s.knowledge.routes[raw],scores:lv>=10&&s.knowledge.routes[raw]?copy(C().ores[raw].scores):null};})};
 }
 function onLoad(){const s=state();if(s.job&&['repair','process','attach','detach'].includes(s.job.type)){committing=true;try{if(s.job.reserved)give(s.job.reserved);s.job=null;write(s);}finally{committing=false;}}else if(s.job){s.job.paused=true;write(s);}}
 function toolAction(a){return run(()=>{
  access(false);if(state().job)fail('请先完成或停止当前工作。');
  const host=record(a.hostId).instance;if(host.item_id!=='tool_repair_roll')fail('请选择工具包。');
  return transaction(()=>{let r;if(a.type==='tool-attach'){const p=loose(a.id);r=g.ItemAssembly.attachFromContainer(a.hostId,a.anchor,p.container,p.index);}else r=g.ItemAssembly.detachToInventory(a.hostId,a.anchor);
   if(!r.ok)fail('工具无法放入或取出，请检查位置和收纳空间。');return {};});
 });}
 g.ForgingSystem={state:()=>copy(state()),snapshot,near,canAccess,quote:a=>run(()=>({quote:quote(a)})),start,step,boardAction,cancel,pause,onLoad,
  identify,inspectOre,name,description,describe,identified,managed,recognition,exactKnown,level,isInstanceLocked,attachmentReason,
  reset:()=>{cached=null;g.NPCSystem.setDemoFlag(key,null);state();},gainXp,toolAction};
 if(g.CombatEngagement)g.CombatEngagement.onChange(e=>{if(e.inCombat)interrupt();});
})(window);
