/* Shared, atomic transfers for carried containers and same-cell ground bags. */
(function (g) {
 'use strict';
 const I=()=>g.InventoryEquipment, copy=x=>JSON.parse(JSON.stringify(x)), fail=m=>{throw Error(m);};
 const labels={pocket:'口袋',vest:'旧式收纳',backpack:'装备背包',vehicle:'载具',ground:'脚下物品',groundBag:'地面背包',dungeon:'交互容器'};
 const bag=x=>I().getItemTemplate(x?.item_id)?.equip_slot==='backpack';
 const position=()=>{const p=g.GameEngine.getState();return {mapId:p.mapId,x:p.x,y:p.y};};
 const tick=()=>g.Survival?.getState()?.tickCount||0;
 function available(){const s=g.Survival?.getState();if(s?.isDead||s?.isComa)fail('当前无法整理物品。');}
 function context(type,id){
  const s=I().getState();
  if(['ground','groundBag','dungeon'].includes(type))return {type,...position(),...(type!=='ground'?{id}: {})};
  const owner=type==='backpack'?s.equipment.backpack:type==='vest'?s.equipment.vest:type==='pocket'?s.equipment.clothing:null;
  return {type,owner:type==='vehicle'?s.bound_vehicle_id:owner?.instance_id||null};
 }
 function resolve(c,s=I().getState()){
  if(!c||!Object.hasOwn(labels,c.type))fail('容器无效。');
  const type=c.type;
  if(type==='dungeon'){
   const d=g.DungeonRuntime,p=position(),point=d?.active()&&d.find(c.id);
   if(p.mapId!==c.mapId||p.x!==c.x||p.y!==c.y||!point?.search||!d.isAccessible(point))fail('已离开交互容器。');
   return {items:point.stored_items||[],capacity:Infinity,point};
  }
  if(type==='ground'||type==='groundBag'){
   const p=position();if(c.mapId!==p.mapId||c.x!==p.x||c.y!==p.y)fail('已离开物品所在格。');
   const key=I().getGroundItemKey(p.mapId,p.x,p.y),roots=s.ground_items[key]||[];
   if(type==='ground')return {items:roots,capacity:Infinity,key};
   const owner=roots.find(x=>x?.instance_id===c.id);if(!bag(owner))fail('背包已离开地面。');
   return {items:owner.backpack_contents||[],capacity:g.BackpackSystem.profile(owner)?.slots??I().getItemTemplate(owner.item_id).backpack_slots??0,owner};
  }
  const current=context(type);if(current.owner!==c.owner)fail('容器装备已变化。');
  if(type==='vehicle'&&!s.bound_vehicle_id)fail('载具不可用。');
  const capacity=type==='pocket'?I().getPocketSlots():type==='vest'?I().getVestSlots():type==='backpack'?I().getBackpackSlots():Infinity;
  const owner=type==='backpack'?s.equipment.backpack:type==='vest'?s.equipment.vest:type==='pocket'?s.equipment.clothing:null;
  return {items:s['inventory_'+type],capacity,owner};
 }
 function read(c){try{const r=resolve(c);return {ok:true,...r};}catch(e){return {ok:false,message:e.message,items:[],capacity:0};}}
 function unlocked(x){if(!x)return;if(g.ForgingSystem?.isInstanceLocked(x.instance_id)||g.FishingSession?.isInstanceLocked(x.instance_id))fail('物品正在使用。');I().getItemInstanceChildren(x).forEach(child=>unlocked(child.instance));}
 function same(a,b){return a.type===b.type&&(['groundBag','dungeon'].includes(a.type)?a.id===b.id:a.type==='ground'?a.mapId===b.mapId&&a.x===b.x&&a.y===b.y:a.owner===b.owner);}
 function take(r,id,n){
  const at=r.items.findIndex(x=>x?.instance_id===id),x=r.items[at];if(!x)fail('物品已移动。');
  if(!Number.isInteger(n)||n<1||n>(x.count??1))fail('数量无效。');unlocked(x);
  const out=copy(x);out.count=n;delete out.ground_drop_tick;
  if(n===(x.count??1))r.items[at]=null;else{x.count-=n;I().reissueItemInstanceId(out);}
  return out;
 }
 function put(r,c,x,s,skipLocked=false){
  if(c.type==='dungeon'){(r.point.stored_items??=[]).push(x);return;}
  if(c.type==='ground'){
   x.ground_drop_tick=tick();(s.ground_items[r.key]??=[]).push(x);return;
  }
  if(I().hasPackedBackpackContents(x)&&c.type!=='vehicle')fail('此容器不能收纳非空背包。');
  if(c.type==='pocket'&&!I().canFitPocket(x))fail('这件物品不能放入口袋。');
  const bookPlan=I().planBookPlacement(r.items,r.capacity,x);
  if(bookPlan){
   if(bookPlan.remainingFragments)fail('容器格数不足，物品留在原处。');
   r.items.splice(0,r.items.length,...bookPlan.items);return;
  }
  const tpl=I().getItemTemplate(x.item_id),single=c.type==='pocket'||c.type==='vest';
  const limit=single||bag(x)||I().getModuleTemplate(x.item_id)||tpl?.enchant_slots>0||x.enchants?.length?1:Math.max(1,Number(tpl?.stack_limit||tpl?.stack_max)||1);
  let left=x.count??1,used=false;
  if(limit>1)for(const e of r.items){
   if(!e||!I().itemInstancesCanStack(e,x)||(e.count??1)>=limit)continue;
   try{unlocked(e);}catch(error){if(skipLocked)continue;throw error;}const n=Math.min(left,limit-(e.count??1));e.count=(e.count??1)+n;left-=n;
   if(e.spoilage_elapsed_ticks!=null||x.spoilage_elapsed_ticks!=null)I().setItemInstanceValue(e,'spoilage_elapsed_ticks',Math.max(e.spoilage_elapsed_ticks||0,x.spoilage_elapsed_ticks||0));
   if(!left)break;
  }
  while(left){
   let at=r.items.findIndex((v,i)=>!v&&i<r.capacity);if(at<0){at=r.items.length;if(at>=r.capacity)fail('容器格数不足，物品留在原处。');}
   const next=copy(x);next.count=Math.min(limit,left);if(used)I().reissueItemInstanceId(next);used=true;
   r.items[at]=next;left-=next.count;
  }
 }
 function perform(s,a){
  if(same(a.from,a.to))fail('来源与目标相同。');
  const from=resolve(a.from,s),to=resolve(a.to,s);if(from.owner)unlocked(from.owner);if(to.owner)unlocked(to.owner);
  if(a.to.type==='groundBag'&&!to.owner.backpack_contents)to.owner.backpack_contents=to.items;
  const moved=take(from,a.id,a.count);put(to,a.to,moved,s);
  if(a.from.type==='ground')s.ground_items[from.key]=from.items.filter(Boolean);
  return moved;
 }
 function commit(operation,vehicle){
  try{
   available();if(!g.SaveSystem?.runAtomic)fail('保存服务尚未就绪。');
   const result=g.SaveSystem.runAtomicFor('inventory.transfer', ()=>{
    const s=copy(I().getState()),value=operation(s);s.item_identity=copy(I().getState().item_identity);I().setState(s);
    if(!I().auditItemOwnership({warehouse:g.HideoutWarehouse?.getState().slots,dungeon:g.DungeonRuntime?.storedItemRoots?.()}).ok)fail('物品归属异常，操作已撤回。');
    if(vehicle||value.vehicle)g.Survival.advanceTick();
    return value;
   });
   if(!result.saved)fail('保存失败，物品和时间已恢复。');
   if(!g.SaveSystem.isAtomic())g.SceneHud?.refresh?.('status');return {ok:true,...result.value};
  }catch(e){return {ok:false,message:e.message};}
 }
 function move(a){return commit(s=>{perform(s,a);return {message:'已转移 '+a.count+' 件。'};},a.from?.type==='vehicle'||a.to?.type==='vehicle');}
 function takeAll(from,to){return commit(s=>{
  const ids=resolve(from,s).items.filter(Boolean).map(x=>x.instance_id);let moved=0,last='';
  for(const id of ids){const before=copy(s);try{const x=resolve(from,s).items.find(x=>x?.instance_id===id);perform(s,{from,to,id,count:x.count??1});moved++;}catch(e){Object.assign(s,before);last=e.message;}}
  if(!moved)fail(last||'容器为空。');return {message:'已转移 '+moved+' 格。'+(last?'部分物品留在原处。':'')};
 },from.type==='vehicle'||to.type==='vehicle');}
 function toWarehouse(a){return commit(s=>{
  if(!g.BackpackPanel?.interactionIs('warehouse')||!g.BackpackPanel.interactionValid()||!g.HideoutWarehousePanel?.isOpen())fail('已离开仓库。');
  if(!['pocket','backpack','vehicle'].includes(a.from?.type))fail('来源容器无效。');
  const from=resolve(a.from,s);if(from.owner)unlocked(from.owner);
  const item=take(from,a.id,a.count),result=g.HideoutWarehouse.depositFromInstance(item);
  if(!result.ok||result.partial)fail('仓库空间不足，物品留在原处。');
  return {message:'已存入 '+a.count+' 件。'};
 },a.from?.type==='vehicle');}
 // Plan all placements before publishing inventory; a failed whole-stack shortcut
 // rolls back both sides, including splits across backpack/vehicle/pocket.
 function autoPut(s,item){
  const bookPlacement=I().placeBookInCarried(s,item);
  if(bookPlacement){if(!bookPlacement.placed)fail('随身容器空间不足，物品留在原处。');return bookPlacement.vehicle;}
  let left=item.count??1,used=false,vehicle=false;
  for(const type of ['backpack','vehicle','pocket']){
   const c=context(type);let r;try{r=resolve(c,s);if(r.owner)unlocked(r.owner);}catch{continue;}
   if(!r.capacity||(I().hasPackedBackpackContents(item)&&type!=='vehicle')||(type==='pocket'&&!I().canFitPocket(item)))continue;
   const tpl=I().getItemTemplate(item.item_id),limit=type==='pocket'||bag(item)||I().getModuleTemplate(item.item_id)||tpl?.enchant_slots>0||item.enchants?.length?1:Math.max(1,Number(tpl?.stack_limit||tpl?.stack_max)||1);
   let room=r.capacity===Infinity?Infinity:Math.max(0,r.capacity-r.items.slice(0,r.capacity).filter(Boolean).length)*limit;
   if(limit>1)for(const x of r.items)if(x&&I().itemInstancesCanStack(x,item)){try{unlocked(x);room+=Math.max(0,limit-(x.count??1));}catch{}}
   const n=Math.min(left,room);if(!n)continue;
   const chunk=copy(item);chunk.count=n;if(used)I().reissueItemInstanceId(chunk);put(r,c,chunk,s,true);used=true;left-=n;vehicle||=type==='vehicle';if(!left)return vehicle;
  }
  fail('随身容器空间不足，物品留在原处。');
 }
 function quickTake(from,id){return commit(s=>{
  if(!['ground','groundBag','dungeon'].includes(from?.type))fail('来源容器无效。');
  const r=resolve(from,s);if(r.owner)unlocked(r.owner);const x=r.items.find(x=>x?.instance_id===id);if(!x)fail('物品已移动。');
  const n=x.count??1,item=take(r,id,n),vehicle=autoPut(s,item);
  if(from.type==='ground')s.ground_items[r.key]=r.items.filter(Boolean);
  return {message:'已收纳 '+n+' 件。',vehicle};
 });}
 function receive(item,{chargeVehicle=true}={}){return commit(s=>{const x=I().copyItemInstance(item);if(I().getBookInfo(x)&&I().findItemInstanceLocation(x.instance_id))fail('物品已在收纳中。');const vehicle=autoPut(s,x);return {message:'已收纳 '+x.count+' 件。',vehicle:vehicle&&chargeVehicle};});}
 function fromWarehouse(index,id){return commit(s=>{
  const W=g.HideoutWarehouse;if(!g.BackpackPanel?.interactionIs('warehouse')||!g.BackpackPanel.interactionValid()||!g.HideoutWarehousePanel?.isOpen())fail('已离开仓库。');
  if(W.isOutpostMode())fail('此处不能从仓库取出物品。');
  const ws=W.getState(),x=ws.slots[index];if(!x||x.instance_id!==id)fail('物品已移动。');if(x.warehouse_locked)fail('物品已封签。');unlocked(x);
  ws.slots[index]=null;const item=copy(x);delete item.warehouse_locked;delete item.warehouse_starred;
  const vehicle=autoPut(s,item);W.setState(ws);return {message:'已收纳 '+(item.count??1)+' 件。',vehicle};
 });}
 g.InventoryTransfer={context,read,move,takeAll,toWarehouse,quickTake,receive,fromWarehouse,position,labels,isBackpack:bag};
})(window);
