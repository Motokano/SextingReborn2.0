/* First-use restoration. Progress is part of the existing NPC save snapshot. */
(function(g){
 'use strict';
 var TOTAL=1000,BASE_COST=3;
 var descriptions={
  agriculture:['水源口积着淤泥，废弃杂物挡住了操作位置。田地还没有开垦。','入口处清出了一小片空地，堆积的杂物仍然很多。','搬运通道已经畅通，水源口的淤泥才刚开始清除。','水源口渐渐露出，导水边缘仍埋着碎石与沉积物。','大部分淤堵已经清除，只剩边角和操作位置需要整理。','水源口与操作位置已清理干净，可以修补导水边缘和支撑结构。'],
  livestock:['轴心周围堆着杂物，机械臂的活动范围被堵住了。四区的牧草仍然保留着。','轴心旁清出了一处落脚点，杂物仍挡着机械臂。','轴心周围已经露出空地，开始清理机械臂下方。','几处活动间隙已经清通，仍有沉重的杂物需要搬开。','机械臂的活动范围基本清空，还需要收拾残留碎屑。','轴心和机械臂的活动范围已清理干净，可以修补传动连接与基础支撑。']
 };
 function flag(k,v){g.NPCSystem.setDemoFlag(k,v);}
 function unlocked(id){return !!(descriptions[id]&&g.NPCSystem.isDemoFlagTrue('facility_restored:'+id));}
 function progress(id){var n=Number(g.NPCSystem.getFlagValue('facility_labor:'+id));return Number.isFinite(n)?Math.max(0,Math.min(TOTAL,Math.floor(n))):0;}
 function description(id){var n=progress(id);return descriptions[id][n>=TOTAL?5:n===0?0:n<250?1:n<500?2:n<750?3:4];}
 function nearby(id){var spec=g.FacilityUnlockConfig.projects[id];return !!(descriptions[id]&&spec&&g.FacilityUnlock.canAccess(Object.assign({},spec,{requires:null})));}
 function cost(){return g.Survival.getActionStaminaCost?g.Survival.getActionStaminaCost(BASE_COST):BASE_COST;}
 function save(){try{return !!(g.SaveSystem&&g.SaveSystem.saveNow());}catch(e){return false;}}
 function reason(id){
  if(!nearby(id))return '请回到对应设施旁继续清理。';
  if(unlocked(id)||progress(id)>=TOTAL)return '清理已经完成。';
  var s=g.Survival.getState();
  if(s.isDead)return '当前无法继续劳动。';
  if(g.CombatEngagement&&g.CombatEngagement.isPlayerInCombat&&g.CombatEngagement.isPlayerInCombat())return '战斗中不能清理设施。';
  if(s.isResting||s.is_stamina_regen_action_active||s.is_sit_meditation_active)return '请先结束休息或调息，再开始清理。';
  if(Number(s.stamina)<cost())return '体力不足，已完成的清理会保留。';
  return '';
 }
 function work(id){
  var blocked=reason(id);if(blocked)return {ok:false,message:blocked};
  if(!g.SceneApp||!g.SceneApp.canWorkFacilityLabor())return {ok:false,message:'当前无法继续劳动，清理已暂停。'};
  // Record the paid work before world-tick listeners can autosave.
  g.Survival.consumeStamina(BASE_COST);
  var n=progress(id)+1;flag('facility_labor:'+id,n);if(n>=TOTAL)flag('facility_cleaned:'+id,true);
  g.Survival.advanceTick({source:'facility_labor'});
  if(!save())return {ok:false,message:'保存失败，劳动已暂停。当前进度仍在本次游戏中，请重试保存后再离开。'};
  return {ok:true,done:n>=TOTAL,message:n>=TOTAL?'清理完成，可以准备修复材料。':reason(id)};
 }
 function reset(){Object.keys(descriptions).forEach(function(id){flag('facility_labor:'+id,0);flag('facility_cleaned:'+id,false);flag('facility_restored:'+id,false);});flag('facility_labor_version',1);}
 function migrate(snapshot){
  if(g.NPCSystem.getFlagValue('facility_labor_version')===1)return;
  var a=snapshot.agriculture_map,st=a&&(a.state||a),su=snapshot.player&&snapshot.player.sceneUi;
  var usedAgriculture=!!(su&&su.agriculture_unlocked)||!!(st&&(st.task||(st.map||[]).some(function(row){return Array.isArray(row)&&row.some(function(c){return c&&(c.tilled||c.crop||c.cropStructure||(c.kind!=='land'&&c.kind!=='pool'));});})));
  var l=snapshot.livestock,usedLivestock=!!(l&&((l.animals||[]).length||Object.keys(l.arms||{}).some(function(k){return Object.values(l.arms[k]||{}).some(Boolean);})||Object.values(l.axis||{}).some(Boolean)));
  [['agriculture',usedAgriculture],['livestock',usedLivestock]].forEach(function(pair){if(pair[1]){flag('facility_labor:'+pair[0],TOTAL);flag('facility_cleaned:'+pair[0],true);flag('facility_restored:'+pair[0],true);}});
  flag('facility_labor_version',1);
 }
 g.FacilityLabor={progress:progress,description:description,isUnlocked:unlocked,nearby:nearby,cost:cost,reason:reason,work:work,save:save,reset:reset,migrate:migrate,total:TOTAL};
})(window);
