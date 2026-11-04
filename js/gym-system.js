/* The production gym owns durable facility state; inventory, muscles, time and
   resources remain in their existing systems and commit in one transaction. */
(function(g){
 'use strict';
 const D=g.GymData, copy=v=>JSON.parse(JSON.stringify(v));
 const modules={hands:{name:'手部用具',upgrades:['增加不同阻力握力器','添置张指训练器','扩充握捏训练套装']},ankle:{name:'足踝踏台',upgrades:['加固防滑踏台','增加踏板角度调节','添置垫高块与弹力带']},toes:{name:'足趾用具',upgrades:['添置弹力带与拾物珠','增加毛巾训练配重','添置平衡软垫与阻力带']}};
 const fresh=()=>({version:1,entranceOpen:false,levels:{floor:1},assignedPlates:{},plates:0,job:null});
 let state=fresh(),layout=null,timer=null,epoch=0,advancing=false,error='',last=null;
 const listeners=new Set(),S=()=>g.Survival,M=()=>g.Muscles;
 const action=id=>D.ACTIONS.find(a=>a.id===id),station=id=>D.STATIONS.find(s=>s.id===id);
 const position=()=>g.GameEngine.getState();
 const moduleKey=a=>a.station!=='handsfeet'?a.station:'handsfeet_'+(['grip','pinch','finger_spread','opposition'].includes(a.id)?'hands':['calf_raise','ankle_flexion','ankle_inversion','ankle_eversion'].includes(a.id)?'ankle':'toes');
 const level=a=>state.levels[moduleKey(a)]??state.levels[a.station]??0;
 const fatigueRate=()=>S().getFatigue()>=80?0:S().getFatigue()>50?.5:1;
 const cost=a=>S().getActionStaminaCost(a.cost);
 function blocked(){return S().isDead()||S().getState().isComa||g.DeathSystem&&g.DeathSystem.blocked();}
 function at(id){
  if(!layout||!station(id)||blocked())return false;
  const p=layout.stations.find(p=>p.id===id),def=g.NPCSystem.getNpcDef?.(g.GymFacility.npcId(id));
  // Adapter rechecks every occupied cell and the current map, including old clicks.
  return g.GymFacility.isAt(def||{id:g.GymFacility.npcId(id),location:{sceneId:layout.mapId},gymStation:{id,footprint:footprints[id]}});
 }
 const footprints={floor:[1,2],pullup:[2,1],dumbbell:[1,1],barbell:[2,2],cable:[1,2],leg:[1,2],neck:[2,1],handsfeet:[2,2]};
 function usable(id){return at(id)&&!state.job&&!(g.BedSleep&&g.BedSleep.isActive())&&!(g.CombatEngagement&&g.CombatEngagement.isPlayerInCombat())&&(!g.SceneApp||g.SceneApp.canWorkFacilityLabor());}
 function notify(){listeners.forEach(fn=>fn());g.SceneHud?.refresh('status');g.SceneRenderer?.render();}
 function stopTimer(){epoch++;if(timer!==null)g.clearTimeout(timer);timer=null;}
 function transact(fn){
  try{const r=g.SaveSystem.runAtomicFor('gym',fn);if(r.saved){error='';notify();return {ok:true,value:r.value};}}
  catch(e){if(e.gymReason){error=e.message;notify();return {ok:false,message:error};}}
  error='保存失败，请重试';notify();return {ok:false,message:error};
 }
 function reject(message){const e=Error(message);e.gymReason=true;throw e;}
 // Replace the map object only when its collision changes, invalidating art geometry caches.
 // Keep inspection metadata so restoring an older sealed save can rebuild the wall.
 function applyEntranceToMap(map){
  if(map?.map_id!=='M0_Base_Inside_lv_1')return map;
  const cells=Object.entries(map.inspectable_walls||{}).filter(([,v])=>v.unlock_panel==='gym_entrance').map(([k])=>k.split(',').map(Number));
  if(!cells.some(([x,y])=>(map.blocks||[]).some(p=>p.x===x&&p.y===y)===state.entranceOpen))return map;
  const blocks=(map.blocks||[]).filter(p=>!cells.some(([x,y])=>p.x===x&&p.y===y));
  if(!state.entranceOpen)cells.forEach(([x,y])=>blocks.push({x,y}));
  return {...map,blocks};
 }
 function canInspectEntrance(x,y){
  const E=g.GameEngine,IE=g.InventoryEquipment,map=E?.getMap();
  return !!(!state.entranceOpen&&map?.map_id==='M0_Base_Inside_lv_1'
   &&map.inspectable_walls?.[x+','+y]?.unlock_panel==='gym_entrance'&&!E.isWalkable(x,y)&&E.isAdjacent(x,y)
   &&IE?.getSkillLevel(IE.SPECIAL_ANATOMY_STUDIES_SKILL_ID||'special_meridian_studies')>=1
   &&!blocked()&&!state.job&&!g.BedSleep?.isActive()&&!g.CombatEngagement?.isPlayerInCombat());
 }
 function spendableStock(id){
  const IE=g.InventoryEquipment,raw=IE.getState();
  const unsafe=['inventory_pocket','inventory_vest','inventory_backpack','inventory_vehicle'].some(k=>(raw[k]||[]).some(x=>x&&x.item_id===id&&(x.warehouse_locked||IE.getItemInstanceChildren?.(x).length)));
  return unsafe?0:IE.countCarriedItemsByTemplateId(id);
 }
 function entrancePlan(){
  const IE=g.InventoryEquipment,rows=D.ENTRANCE_COST.map(r=>({...r,name:IE.getDisplayName(IE.getItemTemplate(r.id),0,IE.getCharacterForDisplay()),stock:spendableStock(r.id)}));
  return {rows,ok:rows.every(r=>r.stock>=r.count)};
 }
 function openEntrance(x,y){
  if(!canInspectEntrance(x,y)||(g.SceneApp&&!g.SceneApp.canWorkFacilityLabor()))return {ok:false,message:'当前无法砸开'};
  if(!entrancePlan().ok)return {ok:false,message:'材料不足'};
  return transact(()=>{
   if(!canInspectEntrance(x,y))reject('当前无法砸开');
   const plan=entrancePlan();if(!plan.ok)reject('材料不足');
   for(const row of plan.rows)if(!g.InventoryEquipment.removeCarriedItemsByTemplateId(row.id,row.count,{strict:true}).ok)reject('材料已变化，请重试');
   state.entranceOpen=true;
  });
 }
 function trainReason(a){
  if(!a||!state.levels[a.station])return '尚未建造';
  if(blocked())return '已失能';
  if(!fatigueRate())return '疲劳过高';
  if([...a.main,...a.assist].every(id=>M().isUnlocked(id)))return '已练满';
  const passive=Number(S().getConfigValue('stamina_passive_drain_per_tick',0))||0;
  if(S().getStamina()+1e-8<cost(a)+passive*a.ticks)return '体力不足';
  return '';
 }
 function efficiency(a){const IE=g.InventoryEquipment;return D.trainingEfficiency(level(a),IE.getSkillLevel(IE.SPECIAL_ANATOMY_STUDIES_SKILL_ID),g);}
 function rewards(a,eff=efficiency(a)){const rate=fatigueRate();return [...a.main.map(id=>({id,role:'主练',base:a.mainPct})),...a.assist.map(id=>({id,role:'辅助',base:a.assistPct}))].map(r=>({id:r.id,role:r.role,pct:Math.round(r.base*rate*eff.multiplier*1e6)/1e6}));}
 function pay(j){
  const a=action(j.actionId),why=trainReason(a);if(why){state.job=null;return false;}
  j.efficiency=efficiency(a);j.rewards=rewards(a,j.efficiency);j.ticks=0;j.paid=cost(a);
  S().setResting(false);S().setStaminaRegenActionActive(false);S().setSitMeditationActive(false);
  S().consumeStamina(j.paid,{raw:true,source:'gym',fatiguePerStamina:D.TRAINING_FATIGUE_PER_STAMINA});return true;
 }
 function startTraining(id,groups=1){
  const a=action(id);if(!a||![1,4,8].includes(groups)||!usable(a.station))return {ok:false,message:'请在对应设施旁操作'};
  const why=trainReason(a);if(why)return {ok:false,message:why};
  g.SceneApp?.prepareFacilityAction();S().stopStudy();
  const r=transact(()=>{if(!usable(a.station))reject('当前无法训练');last=null;state.job={kind:'train',actionId:id,groups,remaining:groups,finished:0,stopAfter:false,ticks:0,tickMs:3000,position:copy(position()),rewards:[],paid:0};if(!pay(state.job))reject('当前无法训练');});
  if(r.ok){g.GymPanel?.show(a.station,'train');schedule();}return r;
 }
 function samePosition(j){const p=position(),q=j.position;return p.mapId===q.mapId&&p.x===q.x&&p.y===q.y;}
 function advance(){
  if(!state.job||error)return;
  let result=null;
  const committed=transact(()=>{
   const j=state.job,a=action(j.actionId);if(blocked()||!samePosition(j)||!at(a.station)){state.job=null;return;}
   const before=S().getState().tickCount;advancing=true;
   try{S().advanceTick({source:'gym'});}finally{advancing=false;}
   if(blocked()||!state.job){state.job=null;return;}
   if(S().getState().tickCount!==before+1)throw Error('Gym tick blocked');
   if(++j.ticks<a.ticks)return;
   const changes=j.rewards.map(r=>({...M().addGrowth(r.id,r.pct),role:r.role}));
   result={name:a.name,changes,lit:changes.filter(c=>c.lit).map(c=>c.id)};
   if(result.lit.length&&g.CharacterAttributes){const IE=g.InventoryEquipment;g.CharacterAttributes.recalcCharacterStats({getEquipmentState:()=>IE.getState().equipment,getSkillsState:()=>IE.getState().skills,getItemTemplate:IE.getItemTemplate,getEnchantEntry:IE.getEnchantEntry,getStrengthLevel:()=>IE.getSkillLevel('survival_strength')});}
   j.finished++;j.remaining--;if(j.remaining&&!j.stopAfter)pay(j);else state.job=null;
  });
  if(committed.ok&&result){last=result;g.GameLog?.log(result.name+'完成'+(result.lit.length?' · 点亮 '+result.lit.length+' 块肌肉':''),'success');notify();}
  if(!committed.ok)g.GymPanel?.show(action(state.job?.actionId)?.station||'floor','train');
  schedule();
 }
 function schedule(){if(!state.job||timer!==null||error||document.hidden||blocked())return;const token=epoch;timer=g.setTimeout(()=>{if(token!==epoch)return;timer=null;if(!document.hidden)advance();},state.job.tickMs);}
 function materials(){
  const IE=g.InventoryEquipment;
  return g.FacilityUnlockConfig.materials.filter(m=>['wood','metal','parts','fiber'].includes(m[1])&&m[0]!=='hus_wool').map(([id,group,points])=>{
   const tpl=IE.getItemTemplate(id);return {id,group,points,name:IE.getDisplayName(tpl,0,IE.getCharacterForDisplay()),stock:spendableStock(id)};
  });
 }
 function plan(costs){
  const rows=materials(),used=[],missing=[];
  for(const [group,need]of Object.entries(costs)){
   if(group==='plates'){if(state.plates<need)missing.push('配重片组');if(need)used.push({id:'plates',name:'配重片组',count:need,stock:state.plates});continue;}
   const list=rows.filter(r=>r.group===group&&r.stock>0),cap=need+Math.max(1,...list.map(r=>r.points))-1,dp=[[]];
   for(const item of list)for(let i=0;i<Math.min(item.stock,Math.ceil(cap/item.points));i++)for(let p=cap-item.points;p>=0;p--)if(dp[p]){const next=dp[p].concat(item);if(!dp[p+item.points]||next.length<dp[p+item.points].length)dp[p+item.points]=next;}
   let chosen=null;for(let p=need;p<=cap;p++)if(dp[p]){chosen=dp[p];break;}
   if(!chosen){missing.push(D.MATERIALS[group]);continue;}
   for(const item of chosen){const found=used.find(r=>r.id===item.id);if(found)found.count++;else used.push({...item,count:1});}
  }
  return {ok:!missing.length,used,missing,signature:JSON.stringify(used.map(r=>[r.id,r.count]))};
 }
 function spend(costs,expected){
  const p=plan(costs);if(!p.ok)reject('材料不足');if(expected!==p.signature)reject('材料已变化，请重新确认');
  for(const row of p.used){if(row.id==='plates')state.plates-=row.count;else if(!g.InventoryEquipment.removeCarriedItemsByTemplateId(row.id,row.count,{strict:true}).ok)throw Error('Inventory changed');}
 }
 function upgradeInfo(a){const s=station(a.station),lv=level(a),m=modules[moduleKey(a).replace('handsfeet_','')];return {key:moduleKey(a),level:lv,name:m?.name||s.name,title:lv>=4?'已满级':(m?.upgrades||s.upgrades)[lv-1],costs:lv>=1&&lv<4?s.upgradeCosts[lv-1]:{},nextEfficiency:D.EFFICIENCY[Math.min(4,lv+1)]};}
 function build(id,signature){if(!usable(id)||state.levels[id])return {ok:false,message:'当前无法建造'};return transact(()=>{if(!usable(id)||state.levels[id])reject('当前无法建造');const s=station(id);spend(s.build,signature);state.levels[id]=1;state.assignedPlates[id]=s.build.plates||0;});}
 function upgrade(id,expectedLevel,signature){const a=action(id);if(!a||!usable(a.station)||!state.levels[a.station])return {ok:false,message:'当前无法升级'};return transact(()=>{const u=upgradeInfo(a);if(!usable(a.station)||u.level!==expectedLevel||u.level>=4)reject('设施等级已变化');spend(u.costs,signature);state.levels[u.key]=u.level+1;state.assignedPlates[u.key]=(state.assignedPlates[u.key]||0)+(u.costs.plates||0);});}
 function forgePlates(id,signature){if(!usable(id))return {ok:false,message:'请在设施旁操作'};return transact(()=>{if(!usable(id))reject('当前无法制作');spend({metal:12,parts:2},signature);state.plates++;});}
 function validate(s){
  if(s==null)return true;
  if(s.entranceOpen!==undefined&&typeof s.entranceOpen!=='boolean')return false;
  const ints=(obj,max)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.values(obj).every(v=>Number.isSafeInteger(v)&&v>=0&&v<=max);
  if(s.version!==1||!ints(s.levels,4)||!ints(s.assignedPlates,1000000)||!Number.isSafeInteger(s.plates)||s.plates<0||s.plates>1000000)return false;
  const keys=[...D.STATIONS.map(s=>s.id),'handsfeet_hands','handsfeet_ankle','handsfeet_toes'];if(Object.keys(s.levels).some(k=>!keys.includes(k))||Object.keys(s.assignedPlates).some(k=>!keys.includes(k)))return false;
  const j=s.job;if(j==null)return true;const a=action(j.actionId),p=j.position;
  if(!a||!s.levels[a.station]||j.kind!=='train'||![1,4,8].includes(j.groups)||!Number.isInteger(j.remaining)||j.remaining<1||j.remaining>j.groups||j.finished!==j.groups-j.remaining||!Number.isInteger(j.ticks)||j.ticks<0||j.ticks>=a.ticks||j.tickMs!==3000||typeof j.stopAfter!=='boolean'||!Number.isFinite(j.paid)||j.paid<=0||!p||p.mapId!=='M0_Base_Inside_lv_1'||!Number.isInteger(p.x)||!Number.isInteger(p.y))return false;
  const e=j.efficiency;if(e!=null&&(!Number.isSafeInteger(e.anatomyLevel)||e.anatomyLevel<0||!['equipment','anatomyBonus','nutritionBonus','multiplier'].every(k=>Number.isFinite(e[k])&&e[k]>=0)))return false;
  const ids=[...a.main,...a.assist];return Array.isArray(j.rewards)&&j.rewards.length===ids.length&&j.rewards.every((r,i)=>r.id===ids[i]&&Number.isFinite(r.pct)&&r.pct>=0&&['主练','辅助'].includes(r.role));
 }
 function resume(){if(!state.job)return;if(blocked()){interrupt();return;}g.SceneApp?.prepareFacilityAction();S().stopStudy();g.GymPanel?.show(action(state.job.actionId).station,'train');schedule();}
 function restore(s,rollback){stopTimer();state=s&&validate(s)?{...fresh(),...copy(s)}:fresh();error='';last=null;g.GameEngine?.getMap();if(!rollback)Promise.resolve().then(()=>{notify();resume();});}
 function interrupt(){stopTimer();state.job=null;error='';g.GymPanel?.close();}
 const api={ready:null,footprints,actions:D.ACTIONS,stations:D.STATIONS,action,station,level,moduleKey,fatigueRate,cost,trainReason,rewards,upgradeInfo,plan,build,upgrade,forgePlates,startTraining,advance,at,usable,validate,restore,interrupt,resume,applyEntranceToMap,canInspectEntrance,entrancePlan,openEntrance,
  efficiency,isActive:()=>!!state.job,allowsTick:o=>!state.job||(advancing&&o?.source==='gym'),getState:()=>copy(state),getLayout:()=>layout,getLast:()=>last,getError:()=>error,
  dismissResult(){last=null;notify();},retry(){error='';notify();schedule();},stop(){if(!state.job)return;const r=transact(()=>{state.job.stopAfter=true;});if(r.ok)schedule();return r;},subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
 };
 api.ready=Promise.all([fetch('data/gym-layout.json').then(r=>{if(!r.ok)throw Error('Gym layout unavailable');return r.json();}),M().ready]).then(([value])=>{
  for(const a of D.ACTIONS)for(const id of [...a.main,...a.assist])if(!M().getMuscleById(id))throw Error('Unknown gym muscle: '+id);
  layout=value;g.GymFacility.bind({position,placement:id=>layout.stations.find(p=>p.id===id),level:id=>state.levels[id]||0,job:()=>state.job,action,open:(id,mode)=>{if(blocked()||(!state.job&&!usable(id)))return false;return g.GymPanel.show(id,mode);}});
 });
 document.addEventListener('visibilitychange',()=>{stopTimer();if(state.job){notify();schedule();}});
 g.addEventListener('pagehide',stopTimer);g.addEventListener('pageshow',()=>{if(state.job)resume();});
 g.GymSystem=api;
})(window);
