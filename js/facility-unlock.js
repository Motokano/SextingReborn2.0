/* Shared facility material settlement. Player UI never displays these internal points. */
(function(g){
 'use strict';
 function create(spec){
 var key=spec.key||('facility_progress:'+spec.id),unlock=spec.unlock||('facility_ready:'+spec.id),groups=spec.groups;
 var materials=g.FacilityUnlockConfig.materials.filter(function(m){return groups.some(function(c){return c.id===m[1];})&&m[0]!=='hus_wool';});
 // The first eligible material in each category is the default repair hint.
 var basic={};materials.forEach(function(m){if(!basic[m[1]])basic[m[1]]=m[0];});
 function isComplete(){return (spec.warehouse?g.HideoutWarehouse.isUpgradeMaterialReady(spec.warehouse):g.NPCSystem.isDemoFlagTrue(unlock))||(spec.warehouse&&g.HideoutWarehouse.getUpgradeStatus(spec.warehouse,true)==='completed')||(spec.id==='water'&&g.CookingStation&&g.CookingStation.getState().water_unlimited);}
 function state(){var raw=(spec.warehouse?g.HideoutWarehouse.getState().material_progress[spec.warehouse]:g.NPCSystem.getFlagValue(key))||{};var out={};groups.forEach(function(c){out[c.id]=isComplete()?c.need:Math.max(0,Math.min(c.need,Math.floor(Number(raw[c.id])||0)));});return out;}
 function sequential(){return !spec.warehouse&&!spec.toolbench;}
 function currentGroup(){var progress=state();return groups.find(function(c){return progress[c.id]<c.need;})||null;}
 function rows(includeEmpty){var IE=g.InventoryEquipment,raw=IE.getState(),character=IE.getCharacterForDisplay();return materials.map(function(m){
  // Never consume a host together with its attached parts as ordinary material.
  var assembled=['inventory_pocket','inventory_vest','inventory_backpack','inventory_vehicle'].some(function(k){return (raw[k]||[]).some(function(x){return x&&x.item_id===m[0]&&IE.getItemInstanceChildren&&IE.getItemInstanceChildren(x).length;});});
  var tpl=IE.getItemTemplate(m[0]);return {id:m[0],group:m[1],points:m[2],basic:basic[m[1]]===m[0],name:IE.getDisplayName(tpl,0,character),stock:(assembled?0:IE.countCarriedItemsByTemplateId(m[0]))+(spec.warehouse?warehouseStock(m[0]):0),carried:assembled?0:IE.countCarriedItemsByTemplateId(m[0])};
 }).filter(function(i){return i.stock>0||(includeEmpty&&(i.basic||g.NPCSystem.isDemoFlagTrue('repair_material_used:'+i.id)));});}
 function inspect(){
  if(!accessible())return {ok:false,message:'请在装置旁查看说明。'};
  var visible=rows(true);
  var text=groups.map(function(c){var names=visible.filter(function(i){return i.group===c.id;}).map(function(i){return i.name;});return names.length?c.note+'：'+names.join('、')+'。':'';}).filter(Boolean).join('\n');
  return {ok:true,message:text||'暂无可辨认的适用材料。'};
 }
 function accessible(){return !isComplete()&&g.FacilityUnlock.canAccess(spec);}
 function safeSlot(x,id){return x&&x.item_id===id&&!x.warehouse_locked&&!(g.InventoryEquipment.getItemInstanceChildren&&g.InventoryEquipment.getItemInstanceChildren(x).length);}
 function warehouseStock(id){return g.HideoutWarehouse.getState().slots.reduce(function(n,x){return n+(safeSlot(x,id)?(x.count||1):0);},0);}
 function remove(i,n){
  if(!spec.warehouse)return g.InventoryEquipment.removeCarriedItemsByTemplateId(i.id,n,{strict:true}).ok;
  var HW=g.HideoutWarehouse,IE=g.InventoryEquipment,left=n;
  function carried(){var take=Math.min(left,i.carried);if(take&&!IE.removeCarriedItemsByTemplateId(i.id,take,{strict:true}).ok)throw Error('inventory');left-=take;}
  function stored(){var st=HW.getState();st.slots.forEach(function(x,k){if(!left||!safeSlot(x,i.id))return;var take=Math.min(left,x.count||1);left-=take;x.count=(x.count||1)-take;if(!x.count)st.slots[k]=null;});HW.setState(st);}
  if(HW.getPreferDeductWarehouse()){stored();carried();}else{carried();stored();}return left===0;
 }
 function plan(list,offer,remaining){
  if(remaining<=0)return [];
  // Bounded subset sum. States never exceed target + largest single piece.
  var max=Math.max.apply(null,list.map(function(i){return i.points;}).concat([1])),cap=remaining+max-1,dp=[[]];
  list.forEach(function(i){var n=Math.min(offer[i.id]||0,Math.ceil(cap/i.points));for(var k=0;k<n;k++)for(var p=cap-i.points;p>=0;p--){if(!dp[p])continue;var next=dp[p].concat([i.id]);if(!dp[p+i.points]||next.length<dp[p+i.points].length)dp[p+i.points]=next;}});
  for(var p=remaining;p<=cap;p++)if(dp[p])return dp[p];
  for(var q=remaining-1;q>=0;q--)if(dp[q])return dp[q];return [];
 }
 function preview(offer){
  var list=rows(),before=state(),counts={},used=[],returned=[];
  if(!offer||Object.keys(offer).some(function(id){var i=list.find(function(x){return x.id===id;});var n=offer[id];return !Number.isSafeInteger(n)||n<0||(n>0&&(!i||n>i.stock));}))return {ok:false,message:'随身材料发生了变化，请重新选择。'};
  var current=currentGroup();
  if(sequential()&&Object.keys(offer).some(function(id){var i=list.find(function(x){return x.id===id;});return offer[id]>0&&(!current||i.group!==current.id);}))return {ok:false,message:'请先修好当前部件，再修复后续部件。'};
  groups.forEach(function(c){plan(list.filter(function(i){return i.group===c.id;}),offer,c.need-before[c.id]).forEach(function(id){counts[id]=(counts[id]||0)+1;});});
  list.forEach(function(i){if(counts[i.id])used.push({item:i,count:counts[i.id]});if((offer[i.id]||0)>(counts[i.id]||0))returned.push({item:i,count:offer[i.id]-(counts[i.id]||0)});});
  used.forEach(function(r){var c=groups.find(function(c){return c.id===r.item.group;});before[c.id]=Math.min(c.need,before[c.id]+r.count*r.item.points);});
  return {ok:true,used:used,returned:returned,after:before,currentComplete:!!current&&before[current.id]>=current.need};
 }
 function suggest(){
  var current=currentGroup(),list=rows().filter(function(i){return !sequential()||current&&i.group===current.id;}),offer={};
  list.forEach(function(i){offer[i.id]=i.stock;});
  var p=preview(offer),out={};if(p.ok)p.used.forEach(function(r){out[r.item.id]=r.count;});return out;
 }
 function repair(offer){
  if(!accessible())return {ok:false,message:'请在对应装置旁操作，并先满足前置条件。'};
  var p=preview(offer);if(!p.ok)return p;
  var before=state(),used=p.used,returned=p.returned;
  if(!used.length)return {ok:false,message:'请先准备需要修补部位的材料。'};
  var IE=g.InventoryEquipment,snapshot=JSON.parse(JSON.stringify(IE.getState())),npc=g.NPCSystem.getDemoState(),wh=spec.warehouse?JSON.parse(JSON.stringify(g.HideoutWarehouse.getState())):null,water=spec.id==='water'&&g.CookingStation?g.CookingStation.getState().water_unlimited:null;
  try {
   used.forEach(function(r){if(!remove(r.item,r.count))throw Error('inventory');var c=groups.find(function(c){return c.id===r.item.group;});before[c.id]=Math.min(c.need,before[c.id]+r.count*r.item.points);});
   if(spec.warehouse)g.HideoutWarehouse.setMaterialProgress(spec.warehouse,before);else g.NPCSystem.setDemoFlag(key,before);
   if(groups.every(function(c){return before[c.id]>=c.need;})){if(!spec.warehouse&&!spec.workTicks)g.NPCSystem.setDemoFlag(unlock,true);if(spec.id==='water'&&g.CookingStation)g.CookingStation.getState().water_unlimited=true;}
   // Only committed consumption teaches material use; previews, returns and failures do not.
   used.forEach(function(r){g.NPCSystem.setDemoFlag('repair_material_used:'+r.item.id,true);});
   if(g.SaveSystem&&!g.SaveSystem.saveNow('facility'))throw Error('save');
  }catch(e){IE.setState(snapshot);g.NPCSystem.setDemoState(npc);if(wh)g.HideoutWarehouse.setState(wh);if(water!==null)g.CookingStation.getState().water_unlimited=water;return {ok:false,message:'本次修复未能保存，材料没有扣除，请稍后再试。'};}
  return {ok:true,used:used,returned:returned};
 }
 function work(){
  if(!spec.workTicks||!accessible()||!groups.every(function(c){return state()[c.id]>=c.need;}))return {ok:false,message:'请先备齐材料并在装置旁施工。'};
  var S=g.Survival,measurement=g.NPCSystem.getFlagValue('sewing_measurement');
  if(spec.id==='sewing_mannequin'&&(!measurement||!(measurement.weight_kg>0)))return {ok:false,message:'请先使用皮尺和体重秤记录身材。'};
  var intensity = spec.id === 'sewing_tape' ? 'low' : spec.id === 'sewing' ? 'high' : 'medium';
  var rate = S.getIntensityRate(intensity);
  if((S.isDead&&S.isDead())||(g.CombatEngagement&&g.CombatEngagement.isPlayerInCombat())||S.getStamina()<(S.getActionStaminaCost?S.getActionStaminaCost(rate):rate))return {ok:false,message:'当前不能施工，请先恢复体力或结束战斗。'};
  S.advanceTick({source:'sewing_construction', intensity:intensity});
  var n=Math.min(spec.workTicks,workProgress()+1);g.NPCSystem.setDemoFlag(key+':work',n);
  if(n===spec.workTicks){g.NPCSystem.setDemoFlag(unlock,true);if(spec.id==='sewing_mannequin')g.NPCSystem.setDemoFlag('sewing_mannequin_dimensions',JSON.parse(JSON.stringify(measurement)));}
  if(g.SaveSystem&&!g.SaveSystem.saveNow('facility'))return {ok:false,message:'进度已保留在本次游戏，但保存失败，请重试保存。'};
  return {ok:true,message:n===spec.workTicks?'装配完成。':'完成一段施工，剩余'+((spec.workTicks-n)*10)+'分钟。'};
 }
 function workProgress(){return Math.max(0,Math.min(spec.workTicks||0,Number(g.NPCSystem.getFlagValue(key+':work'))||0));}
 return {inspect:inspect,spec:spec,groups:groups,rows:rows,state:state,sequential:sequential,currentGroup:currentGroup,preview:preview,suggest:suggest,repair:repair,work:work,workProgress:workProgress,accessible:accessible,isComplete:isComplete,reset:function(){if(spec.warehouse)g.HideoutWarehouse.setMaterialProgress(spec.warehouse,{});else {g.NPCSystem.setDemoFlag(key,{});g.NPCSystem.setDemoFlag(key+':work',0);}}};
 }
 function get(id){var spec=g.FacilityUnlockConfig.projects[id];if(!spec&&id.indexOf('warehouse:')===0){var uid=id.slice(10),e=g.HideoutWarehouse&&g.HideoutWarehouse.getUpgradeEntry(uid);if(e&&e.material_points)spec={id:id,title:e.name+' · 备料',warehouse:uid,groups:g.FacilityUnlockConfig.makeGroups(e.material_points)};}return spec?create(spec):null;}
 function canAccess(spec){
  var SC=g.StationContext,E=g.GameEngine;
  if(spec.requires&&!g.NPCSystem.isDemoFlagTrue(spec.requires))return false;
  if(spec.warehouse){var status=g.HideoutWarehouse.getUpgradeStatus(spec.warehouse,true);return !!(SC&&SC.isAdjacentToWarehouseTile()&&!g.HideoutWarehouse.isOutpostMode()&&(status==='available'||status==='insufficient'));}
  if(spec.id==='cooking'){var c=SC&&SC.getCurrentCookingStationContext();return !!(c&&c.station_type!=='temp'&&SC.isCookingUiBlockedByRepairForContext(c));}
  if(!E||!E.getState||!E.getMap)return false;
  var st=E.getState(),map=E.getMap();if(st.mapId!==(spec.mapId||'M0_Base_Inside_lv_1'))return false;
  var pos=spec.position,size=spec.footprint||[1,1];if(!map||!pos)return false;
  var dx=Math.max(pos[0]-st.x,0,st.x-(pos[0]+size[0]-1));
  var dy=Math.max(pos[1]-st.y,0,st.y-(pos[1]+size[1]-1));
  return Math.max(dx,dy)===1;
 }
 g.FacilityUnlock={get:get,canAccess:canAccess};
})(window);
