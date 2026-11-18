/* Active contents use the existing inventory view; closed contents travel with their bag. */
(function (g) {
 'use strict';
 const C=g.BackpackConfig, IE=()=>g.InventoryEquipment, copy=x=>JSON.parse(JSON.stringify(x));
 const fail=m=>{throw Error(m);}, managed=id=>Object.hasOwn(C.models,id||'');
 const modification=x=>x?.attribute_state?.structure?.backpack?.modification||'none';
 function validate(x){
  if(!x||!managed(x.item_id))return {success:false,message:'请选择这三款背包之一。'};
  const enc=x.enchants||[];
  if((x.count??1)!==1||!Array.isArray(enc)||enc.length>C.max_affixes||new Set(enc).size!==enc.length||enc.some(id=>!Object.hasOwn(C.affixes,id)))return {success:false,message:'背包最多携带两条不同的背包词条。'};
  const state=x.attribute_state?.structure?.backpack;
  if(state&&(state.version!==1||!Object.hasOwn(C.modifications,state.modification)))return {success:false,message:'背包改造记录无效。'};
  return {success:true};
 }
 function profile(x,override){
  if(!x||!managed(x.item_id))return null;
  const base=C.models[x.item_id], requested=override??modification(x), modId=Object.hasOwn(C.modifications,requested)?requested:'none', mod=C.modifications[modId];
  const affixes=[...new Set(Array.isArray(x.enchants)?x.enchants:[])].filter(id=>Object.hasOwn(C.affixes,id)).slice(0,C.max_affixes);
  const effects=affixes.map(id=>C.affixes[id]).concat(mod);
  return {name:base.name,slots:base.slots+effects.reduce((n,e)=>n+(e.slots||0),0),
   selfWeight:base.weight_kg*effects.reduce((n,e)=>n*(e.self_factor??1),1)+(mod.added_weight||0),
   weightFactor:Math.max(C.minimum_weight_factor,base.weight_factor*effects.filter(e=>!e.carry_class).reduce((n,e)=>n*(e.weight_factor??1),1)),
   spoilageFactor:effects.reduce((n,e)=>n*(e.spoilage_factor??1),1),affixes,modification:modId,effects};
 }
 function carryClass(x){
  const t=x&&IE().getItemTemplate(x.item_id);if(!t)return '';
  if(t.equip_slot||t.category==='equipment'||t.category==='tool'||x.sewing||x.sewing_parts)return 'equipment';
  if(t.category==='ore'||t.category==='material'&&['metal_blank','metal_sheet','metal_wire'].includes(t.sub_category))return 'mineral';
  return '';
 }
 function weightFactor(bag,item){const p=profile(bag);if(!p)return null;const cls=carryClass(item);return Math.max(C.minimum_weight_factor,p.weightFactor*p.effects.filter(e=>e.carry_class===cls).reduce((n,e)=>n*(e.weight_factor??1),1));}
 function spoilageFactor(item){
  const p=profile(IE().getState().equipment.backpack),t=item&&IE().getItemTemplate(item.item_id);
  // Living catches and attached bait keep their own existing lifetime rules.
  if(!p||!t||!(t.edible||t.cooking_ingredient||t.food_profile||t.category==='food'))return 1;
  return p.spoilageFactor;
 }
 function describe(x){const p=profile(x);if(!p)return '';const text=[p.name,p.slots+'格 · 自重 '+Number(p.selfWeight.toFixed(3))+' kg · 包内减重 '+Number(((1-p.weightFactor)*100).toFixed(2))+'%',
  '词条：'+(p.affixes.map(id=>C.affixes[id].name).join('、')||'无'),'改造：'+(p.modification==='none'?'无':C.modifications[p.modification].name)];
  p.affixes.forEach(id=>text.push(C.affixes[id].description));if(p.modification!=='none')text.push(C.modifications[p.modification].description);
  const contents=IE().getBackpackContents(x).filter(Boolean),character=IE().getCharacterForDisplay();
  text.push('包内占用：'+contents.length+' / '+p.slots+'格');
  contents.forEach(item=>text.push('· '+IE().getDisplayName(IE().getItemTemplate(item.item_id),IE().getItemDisplayTier(item.item_id,character),character)+((item.count||1)>1?' × '+item.count:'')));
  if(p.spoilageFactor<1)text.push('包内食物腐坏速度为普通的 '+Number((p.spoilageFactor*100).toFixed(2))+'%');
  text.push('放下时内容保留，重新背上恢复；装有物品的包不能塞进另一只背包。','减重与保鲜仅装备时生效；死亡失去随身整包，已放在地面的包沿用地面规则。');return text.join('\n');}
 function generate(id,affixes=[]){const x={item_id:id,count:1,enchants:copy(affixes),attribute_state:{structure:{backpack:{version:1,modification:'none'}}}};const v=validate(x);if(!v.success)fail(v.message);return IE().ensureItemInstanceIdentity(x);}
 function owned(){const s=IE().getState(),out=[];if(managed(s.equipment.backpack?.item_id))out.push({item:s.equipment.backpack,container:'equipment'});['pocket','vest','backpack','vehicle'].forEach(c=>(s['inventory_'+c]||[]).forEach(x=>{if(managed(x?.item_id))out.push({item:x,container:c});}));return out;}
 function target(id){const r=owned().find(r=>r.item.instance_id===id);if(!r)fail('背包已移动，请重新选择随身或装备中的背包。');const v=validate(r.item);if(!v.success)fail(v.message);return r;}
 function materialCount(id){return g.HideoutWarehouse.countItemEverywhere(id);}
 function ensureMaterials(cost){Object.entries(cost).forEach(([id,n])=>{if(materialCount(id)<n)fail('材料不足：'+g.SewingSystem.name(id)+' × '+n);});}
 // Dry-run the same source priority and container order as HideoutWarehouse.consumeItems.
 function occupiedAfterPayment(cost){
  const state=IE().getState(),wh=g.HideoutWarehouse.getState();
  const bags=['pocket','vest','backpack','vehicle'].map(c=>copy(state['inventory_'+c]||[]));
  const warehouse=copy(wh.slots||[]),sources=wh.settings.prefer_deduct_warehouse?[warehouse,...bags]:[...bags,warehouse];
  Object.entries(cost).forEach(([id,count])=>{let left=count;for(const arr of sources){for(let i=0;i<arr.length&&left;i++){const x=arr[i];if(x?.item_id!==id)continue;const n=Math.min(left,x.count??1);left-=n;x.count=(x.count??1)-n;if(!x.count)arr[i]=null;}}});
  return bags[2].filter(Boolean).length;
 }
 function quote(a){
  let recipe,before=null,after=null;
  if(a.type==='backpack_craft'){if(!managed(a.model))fail('请选择背包型号。');recipe=C.models[a.model].craft;after=profile({item_id:a.model});}
  else if(a.type==='backpack_modify'){
   const r=target(a.id);if(!Object.hasOwn(C.modifications,a.modification))fail('请选择有效改造。');
   if(modification(r.item)===a.modification)fail('当前已经是这个方案，无需加工。');
   recipe=C.modifications[a.modification];before=profile(r.item);after=profile(r.item,a.modification);
   if(r.container==='equipment'&&occupiedAfterPayment(recipe.cost)>after.slots)fail('改造后只有'+after.slots+'格，扣除材料后仍放不下。请先整理包内物品。');
   if(r.container!=='equipment'&&IE().getBackpackContents(r.item).filter(Boolean).length>after.slots)fail('改造后的格数放不下包内物品，请先背上并整理。');
  }else fail('未知背包操作。');
  ensureMaterials(recipe.cost);
  return {ticks:recipe.ticks,stamina:g.Survival.getIntensityRate(a.model==='eq_backpack_frame_hauler'||a.modification==='frame'?'medium':'low'),energy:0,cost:copy(recipe.cost),before,after,
   warning:a.type==='backpack_modify'?'加工完成时扣料；替换或恢复原样不返还旧料。':'新背包没有词条和改造；装不下的成品放在脚边。',
   commit(){
    // Re-resolve live instances after each world tick and validate again before paying.
    const check=quote(a);if(!g.HideoutWarehouse.consumeItems(Object.entries(check.cost).map(([item_id,count])=>({item_id,count}))).ok)fail('材料无法取用，操作已撤回。');
    if(a.type==='backpack_modify'){
     const r=target(a.id),x=r.item;x.attribute_state=x.attribute_state||{};x.attribute_state.structure=x.attribute_state.structure||{};
     x.attribute_state.structure.backpack={version:1,modification:a.modification};
     if(r.container==='equipment'){
      const state=IE().getState();state.inventory_backpack=state.inventory_backpack.filter(Boolean);
      if(state.inventory_backpack.length>check.after.slots)fail('包内物品已变化，无法缩容。');IE().setState(state);
     }else if(Array.isArray(x.backpack_contents))x.backpack_contents=x.backpack_contents.filter(Boolean);
    }else{
     const x=generate(a.model),result=IE().putItemIntoDefaultContainer(x);
     if(!result.placed){const p=g.GameEngine.getState();if(!IE().addItemToGround(p.mapId,p.x,p.y,x))fail('无法安放成品。');}
    }
   }};
 }
 function transfer(a){
  try{
   if(!['equip','unequip','drop','pickup'].includes(a.action))fail('无效的背包操作。');
   const I=IE(),pos=g.GameEngine?.getState();if(!pos||pos.mapId==null)fail('当前位置不能放置背包。');
   const life=g.Survival?.getState?.();if(life?.isDead||life?.isComa)fail('当前无法操作背包。');
   const arrays={pocket:()=>I.getPocketArray(),vest:()=>I.getVestArray(),backpack:()=>I.getBackpackArray(),vehicle:()=>I.getVehicleArray(),ground:()=>I.getGroundItemsAt(pos.mapId,pos.x,pos.y),equipment:()=>I.getState().equipment};
   const item=arrays[a.source]?.()[a.index];if(!item||item.instance_id!==a.id||I.getItemTemplate(item.item_id)?.equip_slot!=='backpack')fail('背包已移动，请重新选择。');
   if(a.source==='equipment'&&a.index!=='backpack')fail('请选择背包槽。');
   if(a.action==='unequip'&&a.source!=='equipment'||a.action==='pickup'&&a.source!=='ground'||a.action==='equip'&&a.source==='equipment')fail('当前不能这样移动背包。');
   function unlocked(x){if(g.ForgingSystem?.isInstanceLocked(x.instance_id)||g.FishingSession?.isInstanceLocked(x.instance_id))fail('背包或包内物品正在使用，请先停止相关工作。');I.getItemInstanceChildren(x).forEach(c=>unlocked(c.instance));}
   unlocked(item);if(a.source==='equipment')I.getBackpackContents(item).filter(Boolean).forEach(unlocked);
   const old=I.getState().equipment.backpack;if(a.action==='equip'&&old){unlocked(old);I.getBackpackContents(old).filter(Boolean).forEach(unlocked);}
   if(!g.SaveSystem?.runAtomic)fail('保存服务尚未就绪。');
   const result=g.SaveSystem.runAtomicFor('craft.backpack', ()=>{
    const taken=a.source==='equipment'?I.unequip('backpack'):a.source==='ground'?I.removeItemFromGround(pos.mapId,pos.x,pos.y,a.index):I.takeItemFromContainer(a.source,a.index)?.item;
    if(!taken)fail('无法取出背包。');
    delete taken.ground_drop_tick;
    const ground=x=>{delete x.ground_drop_tick;if(!I.addItemToGround(pos.mapId,pos.x,pos.y,x))fail('无法放置背包。');};
    if(a.action==='equip'){
     if(old){const closed=I.unequip('backpack');if(!closed)fail('当前背包无法卸下。');ground(closed);}
     const equipped=I.equip('backpack',taken);if(!equipped.success)fail(equipped.message||'无法装备背包。');
    }else if(a.action==='drop')ground(taken);
    else {const placed=I.putItemIntoDefaultContainer(taken);if(!placed.placed){if(a.action==='pickup')fail('没有位置收纳整包；可直接选择穿上。');ground(taken);}}
    if(!I.auditItemOwnership().ok)fail('物品归属校验失败，移动已撤回。');
   });
   if(!result.saved)fail('保存失败，背包和包内物品已恢复原位。');
   return {ok:true,message:a.action==='equip'?'已背上背包，包内物品已恢复。':a.action==='drop'?'已将背包连同包内物品放在脚下。':'背包已移动，内容完整保留。'};
  }catch(e){return {ok:false,message:e.message};}
 }
 g.BackpackSystem={config:C,managed,validate,profile,weightFactor,spoilageFactor,describe,generate,owned,materialCount,quote,transfer};
})(window);
