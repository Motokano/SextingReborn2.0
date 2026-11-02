/* SPDX-License-Identifier: GPL-3.0-only
 * Dungeon state owns the expedition; inventory, time, combat and attributes remain
 * owned by the game's existing services. No prototype player or storage is used.
 */
(()=>{'use strict';
const E=()=>globalThis.GameEngine,IE=()=>globalThis.InventoryEquipment,S=()=>globalThis.Survival,CA=()=>globalThis.CharacterAttributes;
const R=RuinsSettlement,N=RuinsEncounter,H=RuinsHarvest,P=RuinsExpedition;
const copy=v=>JSON.parse(JSON.stringify(v,(_key,value)=>value instanceof Set?[...value]:value instanceof Map?[...value.entries()]:value));
const terrainSets=['sceneryBlocked','decorBlocked','largeRoomBlocked','workshopBlocked','workshopOpaque','workshopWalls','clinicBlocked','clinicOpaque','clinicWalls','canteenBlocked','canteenOpaque','canteenWalls'];
function restoreTerrain(m){for(const key of terrainSets)if(Array.isArray(m[key]))m[key]=new Set(m[key]);if(Array.isArray(m.outpostFloor))m.outpostFloor=new Map(m.outpostFloor);}
function containerEmptyChance(){const level=Math.max(0,IE().getSkillLevel(config.skillIds.search)||0);return Math.max(0,config.search.container.emptyChance-level*(config.search.container.emptyReductionPerLevel||0));}
let populationConfig=null,config=null,sim=null,run=null,pending=null,receipt=null,pool={batches:{},remaining:[]},recovered=[],meals=[];
let inTick=false,ready=false,hitSerial=0,lastError=null;
const active=()=>!!sim&&!!run&&run.status==='active'&&E()?.getState().mapId===run.mapId;
const dead=()=>!!S()?.isDead?.();
const disabled=kind=>dead()||S()?.isComa?.()||globalThis.BuffSystem?.hasActionDisabled('player',kind==='harvest'?'gather':'move');
const now=()=>globalThis.GameTime?.getState().totalTicks||0;
const gameMap=()=>E().getMap();
const pointSets=()=>sim?[sim.harvestPoints,sim.lootPoints,sim.recoveryPoints,sim.insightPoints,sim.corpses]:[];
function sync(){if(!active())return;const p=E().getState(),sv=S().getState();sim.player.cell=p.y*sim.map.width+p.x;sim.player.facing=globalThis.SceneCtx?.getFacingDir?.()??4;sim.player.stamina=S().getStamina();sim.player.staminaMax=S().getStaminaMax();
 sim.player.skills=Object.fromEntries(['gathering','mining','logging'].map(k=>[k,IE().getSkillLevel(config.skillIds[k])||0]));
 sim.player.vitals={hydration:sv.thirst,satiety:sv.satiety,fatigue:sv.fatigue,damage:Object.fromEntries(Object.keys(RuinsRecovery.parts).map(k=>[k,CA().getPartDestroy(k)])),meals:[]};
 sim.actionCostMultiplier=run.actionCostMultiplier;
 sim.player.harvestToolReduction=Object.fromEntries(['gathering','mining','logging'].map(k=>[k,Math.max(config.harvest.toolReduction,...Object.values(IE().getState().equipment).filter(Boolean).map(it=>config.tools[it.item_id]?.[k]||0))]));
 const v=globalThis.SceneRenderer?.getDungeonVision?.();if(v){sim.visionProfile=v.profile;Object.assign(N.config,v.facing);}
 for(const [i,e]of gameMap().enemies.entries()){const a=sim.enemies.find(n=>n.uid===e.dungeonUid);if(a){a.cell=e.y*sim.map.width+e.x;globalThis.CombatEnemies.setFacingDir(e.enemy_id,run.mapId,e.x,e.y,a.facing);const injury=globalThis.CombatEnemies.getDungeonState(gameMap().map_id,i,e.enemy_id);a.injury=Object.values(injury.part_destroy).reduce((a,b)=>a+b,0);}}
}
function observe(){if(!active())return;sync();RuinsExploration.observe(sim);}
function refresh(){if(globalThis.SaveSystem?.isAtomic?.())return;observe();globalThis.SceneHud?.refresh('status');globalThis.SceneRenderer?.render();globalThis.DungeonPanel?.refresh();}
function persist(){return globalThis.SaveSystem?.isAtomic?.()||globalThis.SaveSystem?.saveNow?.();}
function commit(fn){lastError=null;try{const result=globalThis.SaveSystem.runAtomic(fn);if(!result.saved){lastError='保存失败';refresh();return false;}refresh();return result.value;}catch(e){lastError='操作失败';console.error(e);refresh();return false;}}
function initPool(){for(const batch of config.pool.batches){if(pool.batches[batch.id])continue;for(const row of batch.items){if(!IE().getItemTemplate(row.item_id)||row.lifeProduct)throw Error('非法掉落池物品');if(!Number.isInteger(row.stock)||row.stock<0||!config.search.rarities[row.rarity])throw Error('非法掉落池库存');pool.remaining.push({...copy(row),batch:batch.id});}pool.batches[batch.id]=true;}}
function rolls(kind,bonus,rng=Math.random){const c=config.search[kind],b=Math.max(0,Number(bonus)||0);let rounds=1+Math.floor(b)+(rng()<b%1?1:0),count=0;for(let n=0;n<rounds;n++){if(rng()<(kind==='container'?containerEmptyChance():c.emptyChance))continue;const v=rng();let a=0;for(let i=0;i<c.weights.length;i++){a+=c.weights[i];if(v<a){count+=i+1;break;}}}return count;}
function drawContents(kind,point=null){
 const override=point?.lootOverride;
 DungeonBossRewards.profile(override,config.search.rarities,id=>!!IE().getItemTemplate(id));
 const count=override?.inheritSharedPool===false?0:rolls(kind,run.quantityBonus),out=[];if(override?.inheritSharedPool!==false)initPool();
 const weight=row=>point?.contentWeights?RuinsContainerProfiles.itemWeight(point,row.category||'misc',row.stock,{eligible:true}):row.stock;
 for(let i=0;i<count;i++){
  const total=pool.remaining.reduce((a,row)=>a+weight(row),0);if(!total)break;
  let draw=Math.random()*total;const row=pool.remaining.find(row=>(draw-=weight(row))<0);if(!row)break;
  row.stock--;out.push({item_id:row.item_id,count:row.count||1,rarity:row.rarity,revealed:false,claimed:false,ticks:0});
 }return out.concat(DungeonBossRewards.extras(override));
}
function generate(seed,floor,content,population=null,studyPlan=null){DungeonBossRewards.validate(config.boss,config.search.rarities,id=>!!IE().getItemTemplate(id));let map;for(let attempt=0;attempt<8;attempt++){try{map=RuinsRooms.generate(seed+'|'+floor+'|'+attempt,'city',floor,{contentConfig:content,population,populationSeed:seed+'|'+floor,studyPlan});DungeonBoss.place(map,config.boss,{seed});DungeonPopulation.apply(map);break;}catch(e){if(attempt===7)throw e;}}
 const s=N.create(map);s.corpses=[];s.bag=[];s.formalRuntime=true;return s;}
function install(s){sim=s;const m=s.map,mapId=run.mapId;const blocks=[],disabled=[];for(let k=0;k<m.tiles.length;k++){if(m.tiles[k]===R.VOID)disabled.push({x:k%m.width,y:Math.floor(k/m.width)});else if(!R.walkable(s.staticTiles[k]))blocks.push({x:k%m.width,y:Math.floor(k/m.width)});}
 E().getMaps()[mapId]={map_id:mapId,name:config.name+' · '+m.floor,width:m.width,height:m.height,floor:m.floor,region_code:1,dungeon:true,blocks,disabled,entities:[],portals:[],npcs:[],enemies:sim.enemies.map(e=>({x:e.cell%m.width,y:Math.floor(e.cell/m.width),enemy_id:e.enemyId||config.enemyId,dungeonUid:e.uid})),version:1};
 for(const p of s.lootPoints)p.search={opened:false,complete:false,items:[],cursor:0};
}
function availableTickets(){return(config?.tickets||[]).filter(t=>IE().countCarriedItemsByTemplateId(t.item_id)>0);}
function availableClues(){return(config?.clues||[]).filter(c=>globalThis.DungeonContent?.hasClue?.(c.id));}
function canPrepare(){return ready&&!active()&&!dead()&&config.entryMaps.includes(E().getState().mapId)&&CA().isCharacterCreationCompleted()&&!!globalThis.DungeonCheckpoint?.canAccess();}
function enter(options={}){if(!canPrepare())return false;const ticket=options.ticket?availableTickets().find(t=>t.id===options.ticket):null,clue=options.clue?availableClues().find(c=>c.id===options.clue):null;
 if(options.ticket&&!ticket||options.clue&&!clue)return false;const floor=ticket?.floor||1;if(floor<1||floor>config.maxFloor||clue&&floor>clue.floor){lastError='起始层与线索冲突';return false;}
 const content=RuinsContentConfig.resolve({overrides:config.content,ticketOverrides:ticket?.content}),seed=RuinsSeed.create(),population=DungeonPopulation.resolve(populationConfig,config.populationModifiers,ticket?.populationModifiers,options.populationModifiers),studyPlan=content.version>=16?RuinsRecipeStudy.plan(seed,floor,config.maxFloor,content.recipeStudy):null,next=generate(seed,floor,content,population,studyPlan);
 if(clue&&floor===clue.floor&&!globalThis.DungeonContent?.apply?.(next,clue))return false;
 if(ticket&&!IE().removeCarriedItemsByTemplateId(ticket.item_id,1).ok)return false;
 const returnTo=copy(E().getState());run={id:seed,dungeonId:config.id,mapId:'dungeon_'+seed+'_'+floor,status:'active',seed,startFloor:floor,content,population,recipeStudyPlan:studyPlan,returnTo,quantityBonus:ticket?.quantityBonus||0,actionCostMultiplier:ticket?.actionCostMultiplier??1,clue:clue?copy(clue):null,records:[],marked:[]};
 receipt=null;pending=null;install(next);E().setState(run.mapId,next.map.entry%next.map.width,Math.floor(next.map.entry/next.map.width));observe();persist();refresh();return true;
}
function blocked(x,y){if(!active())return false;const k=y*sim.map.width+x;return !R.walkable(sim.staticTiles[k])||sim.doors.some(d=>d.cell===k&&d.closed)||[sim.harvestPoints,sim.lootPoints,sim.recoveryPoints,sim.insightPoints].some(ps=>ps.some(p=>p.cell===k));}
function walkable(x,y){if(!sim)return false;const k=y*sim.map.width+x;return R.walkable(sim.map.tiles[k])&&!blocked(x,y);}
function canStep(x,y){if(!active())return true;const p=E().getState(),dx=x-p.x,dy=y-p.y;if(dx&&dy)return E().isWalkable(p.x+dx,p.y)&&E().isWalkable(p.x,p.y+dy);return true;}
function isAccessible(p){sync();return p?.kind==='corpse'?sim.player.cell===p.cell&&!p.marked:RuinsLoot.accessible(sim,p);}
function threat(){sync();return N.perception(sim).known.some(Boolean)||sim.enemies.some(e=>['chase','search'].includes(e.state))||sim.enemies.some(e=>N.sees(sim,sim.player,e.cell));}
function nearby(){if(!active())return[];sync();return[...sim.doors.filter(d=>d.closed&&N.dist(d.cell,sim.player.cell,sim.map.width)===1&&N.lineOfSight(sim,sim.player.cell,d.cell)).map(d=>({...d,kind:'door',name:config.door.materials[d.material].name})),...pointSets().flat().filter(p=>isAccessible(p)).map(p=>({...p,kind:p.kind||((sim.harvestPoints.includes(p))?'harvest':sim.lootPoints.includes(p)?'container':sim.recoveryPoints.includes(p)?'recovery':'insight')})),...(sim.player.cell===sim.map.exit?[{kind:'exit',name:'通行口'}]:[])];}
function find(id){return pointSets().flat().find(p=>p.uid===id);}
function openDoor(cell){if(!active()||pending||disabled('door'))return false;sync();const d=sim.doors.find(d=>d.cell===cell),cost=d&&N.doorCost(sim,d);if(!d?.closed||N.dist(sim.player.cell,cell,sim.map.width)!==1||!N.lineOfSight(sim,sim.player.cell,cell)||S().getStamina()<cost)return false;
 S().consumeStamina(cost,{raw:true});d.closed=false;P.record(sim,'door',cell);advance();persist();refresh();return true;}
function begin(kind,id,part){
 if(!active()||pending||disabled(kind))return false;sync();const p=find(id);
 if(!p||!isAccessible(p)||kind==='harvest'&&threat())return false;
 if(kind==='recipe'||RuinsRecipeStudy.isPoint(p)){
  if(kind!=='recipe'||!RuinsRecipeStudy.isPoint(p)||p.used)return false;
 }
 if(kind==='harvest'&&(p.remaining<=0||S().getSatiety()<=0||S().getStamina()<H.cost(sim,p)||!canReceiveHarvest({item_id:H.definitions[p.id].itemId,count:1})))return false;
 if(kind==='insight'&&p.used||kind==='recovery'&&p.used||kind==='search'&&(p.marked||p.search.complete))return false;
 if(kind==='recovery'&&!RuinsRecovery.canUse(sim,p,part))return false;
 if(kind==='search')lockSearch(p);
 globalThis.SceneApp?.prepareDungeonAction?.();
 pending={kind,id,part,cell:sim.player.cell,started:now(),hitSerial,fraction:0,damage:copy(sim.player.vitals.damage)};return true;
}
function lockSearch(p){const q=p.search,it=q.items[q.cursor];if(it&&(p.kind==='corpse'||q.opened))it.requiredTicks??=config.search.rarities[it.rarity].ticks;}
function progressState(){const a=pending,p=a&&find(a.id);if(!p)return null;
 if(a.kind==='search'){const q=p.search,it=q.items[q.cursor];return p.kind!=='corpse'&&!q.opened?{paid:0,total:config.search.container.openingTicks,fraction:q.fraction||0}:{paid:it?.ticks||0,total:it?.requiredTicks||1,fraction:it?.fraction||q.fraction||0};}
 if(a.kind==='recovery')return{paid:p.recovery.progress,total:config.recovery[p.id].ticks,fraction:p.recovery.fraction||0};
 return{paid:0,total:1,fraction:a.fraction||0};
}
function setProgress(value){const a=pending,p=a&&find(a.id);if(!p)return;const f=Math.max(0,Math.min(.9999,Number(value)||0));
 if(a.kind==='search'){const q=p.search,it=q.items[q.cursor];if(it&&(q.opened||p.kind==='corpse'))it.fraction=f;else q.fraction=f;}
 else if(a.kind==='recovery')p.recovery.fraction=f;else a.fraction=f;
}
function receiveHit(){hitSerial++;if(pending){cancel();globalThis.DungeonPanel?.interrupted();}}
function windowAction(kind,id){if(!active()||disabled('search'))return false;const p=find(id);if(!p||p.kind!=='corpse'||!isAccessible(p))return false;cancel();advance();persist();return true;}

function cancel(){pending=null;}
function canReceiveHarvest(item){const saved=copy(IE().getState());try{return !!IE().putItemIntoDefaultContainer(item).placed;}finally{IE().setState(saved);}}
let inActionTick=false;
function advance(){inActionTick=true;const resting=pending?.kind==='recovery'&&find(pending.id)?.id==='rest';if(resting)S().setResting(true);try{S().advanceTick({source:'dungeon'});}finally{if(resting)S().setResting(false);inActionTick=false;}}
function completeTick(){const a=pending;if(!a||!active())return false;sync();const p=find(a.id);
 if(!p||!isAccessible(p)||sim.player.cell!==a.cell||disabled(a.kind)||a.hitSerial!==hitSerial||a.kind==='harvest'&&threat()){cancel();refresh();return false;}
 if(a.kind==='recovery'&&!RuinsRecovery.canUse(sim,p,a.part)){cancel();return false;}
 if(a.kind==='recipe'&&p.used){cancel();return false;}
 setProgress(0);advance();if(!active()||dead()){cancel();return false;}sync();
 if(a.hitSerial!==hitSerial||a.kind==='harvest'&&threat()||Object.keys(a.damage).some(k=>CA().getPartDestroy(k)>a.damage[k])){cancel();refresh();return false;}
 if(a.kind==='harvest'){
  const cost=H.cost(sim,p),item={item_id:H.definitions[p.id].itemId,count:1};if(p.remaining<=0||S().getStamina()<cost||S().getSatiety()<=0||!canReceiveHarvest(item)){cancel();return false;}
  const before=S().getStamina(),placed=IE().putItemIntoDefaultContainer(item);if(!placed.placed){cancel();return false;}S().consumeStamina(cost,{raw:true});p.remaining--;p.used=p.remaining===0;sim.lastHarvest={uid:p.uid,item:copy(item),before,after:S().getStamina(),cost};
  P.record(sim,'point','harvest:'+p.uid);globalThis.Gathering?.addDungeonProficiency?.(H.skill(p));pending=null;
 }else if(a.kind==='recipe'){
  if(!RuinsRecipeStudy.grant(sim,p))throw Error('资料台授予失败');pending=null;
 }else if(a.kind==='insight'){if(p.used){cancel();return false;}p.used=true;IE().addPotential(p.amount);P.record(sim,'point','insight:'+p.uid);pending=null;
 }else if(a.kind==='recovery'){
  const c=config.recovery[p.id],q=p.recovery,k=RuinsRecovery.kind(p);if(!RuinsRecovery.canUse(sim,p,a.part)){cancel();return false;}q.part??=a.part;q.progress++;
  if(p.id==='medical')CA().recoverPartDestroy(q.part,CA().getBodyPartDestroyMax(q.part)*c.ratio/c.ticks);
  if(p.id==='rest')S().setState({fatigue:Math.max(0,S().getFatigue()-c.amount/c.ticks)});
  if(q.progress===c.ticks){if(k==='water')S().addThirst(c.amount);if(k==='stove')meals.push({remaining:c.amount,ticks:c.digestionTicks,rate:c.digestionRate||c.amount/c.digestionTicks});q.remaining--;if(q.remaining>0)q.progress=0;else p.used=true;pending=null;}
  if(p.id==='medical'||p.id==='rest'||!pending)P.record(sim,'point','recovery:'+p.uid);
 }else if(a.kind==='search'){
  const q=p.search;q.searchedTicks=(q.searchedTicks||0)+1;
  if(p.kind!=='corpse'&&!q.opened){
   q.opened=true;q.items=drawContents('container',p);q.complete=!q.items.length;P.record(sim,'point','loot:'+p.uid);pending=null;
  }else{
   q.opened=true;const it=q.items[q.cursor];
   if(it){it.requiredTicks??=config.search.rarities[it.rarity].ticks;it.ticks++;
    if(it.ticks>=it.requiredTicks){it.revealed=true;q.cursor++;q.complete=q.cursor===q.items.length;globalThis.DungeonPanel?.reveal(it,p.uid+':'+(q.cursor-1));}
   }else q.complete=true;
   if(q.complete)pending=null;else lockSearch(p);
  }
 }

 sync();persist();refresh();return true;
}
function takeUnits(it){let added=0;it.taken??=0;while(it.taken<it.count){const placed=IE().putItemIntoDefaultContainer({item_id:it.item_id,count:1,dungeon_rarity:it.rarity});if(!placed.placed)break;it.taken++;added++;}it.claimed=it.taken===it.count;return added;}
function claim(id,index){if(!active()||disabled('search'))return false;const p=find(id),it=p?.search?.items[index];if(!it?.revealed||it.claimed||!isAccessible(p))return false;
 cancel();const saved=copy(IE().getState()),previous=copy(it),added=takeUnits(it);
 if(!it.claimed){IE().setState(saved);Object.assign(it,previous);it.taken=previous.taken||0;lastError='背包已满';return false;}
 if(!added)return false;advance();persist();refresh();return true;
}
function mark(id){if(!active()||pending||disabled('search'))return false;const p=sim.corpses.find(p=>p.uid===id);if(!p||p.marked||!isAccessible(p)||p.search.opened||p.search.complete)return false;
 p.marked=true;const bag=copy(p);bag.allocation=allocate(bag.search.items);bag.batch=run.id;bag.floor=sim.map.floor;run.marked.push(bag);advance();persist();refresh();return true;
}
function killed(record){if(!active())return;const enemy=sim.enemies.find(e=>e.uid===record.dungeonUid);if(!enemy)return;const items=drawContents('corpse',enemy);sim.enemies=sim.enemies.filter(e=>e!==enemy);sim.defeated.push(enemy.uid);P.record(sim,'kill',enemy.uid);sim.corpses.push({uid:'corpse-'+sim.map.floor+'-'+enemy.uid,kind:'corpse',name:'尸体',cell:record.y*sim.map.width+record.x,marked:false,search:{opened:false,complete:false,cursor:0,items}});}
function updateAI(o){if(!active())return null;sync();const moves=[],attacks=[],dashes=new Map(),before=new Map(sim.enemies.map(e=>[e.uid,e.cell]));
 let fresh=false;
 for(const [i,rec]of o.map.enemies.entries()){const e=sim.enemies.find(e=>e.uid===rec.dungeonUid);if(e){const status=globalThis.CombatEnemies.dungeonTurnStatus(o.map.map_id,i,rec.enemy_id,o.tick);fresh=fresh||status.fresh;e.skipTurn=status.skip||!status.fresh;e.cannotMove=status.cannotMove;}}
 if(o.map.enemies.length&&!fresh)return{moves,attacks};
 N.tick(sim,0,()=>{for(const [i,rec]of o.map.enemies.entries()){
  const e=sim.enemies.find(e=>e.uid===rec.dungeonUid),CE=globalThis.CombatEnemies;if(!e)continue;e.holdAction=false;e.attackRange=1;
  const template=CE.getById(rec.enemy_id);
  if(template?.thug){
   if(e.state==='chase'&&!e.skipTurn){const path=CE.tryThugDash(rec.enemy_id,o.map.map_id,i,sim,e);if(path)dashes.set(e.uid,path);}
   CE.prepareBossOpportunity(rec.enemy_id,o.map.map_id,i,['chase','search'].includes(e.state),e.state==='idle');
   e.holdAction=CE.thugInfo(rec.enemy_id,o.map.map_id,i).meditationTick===o.tick||!!o.didActThisTick(i);continue;
  }
  if(!template?.boss)continue;
  const combat=['chase','search'].includes(e.state);
  CE.prepareBossOpportunity(rec.enemy_id,o.map.map_id,i,combat,e.state==='idle',e.state==='chase'&&!o.didActThisTick(i));
  const b=CE.bossInfo(rec.enemy_id,o.map.map_id,i);e.holdAction=b.meditationTick===o.tick||!!o.didActThisTick(i);
  if(b.burstRemaining && CombatEnemyBoss.approach(CombatEnemyBoss.context(rec.enemy_id,o.map.map_id,i),true))e.attackRange=2;
 }});for(const [i,rec]of o.map.enemies.entries()){const e=sim.enemies.find(e=>e.uid===rec.dungeonUid);if(!e)continue;const from=before.get(e.uid);if(e.cell!==from)moves.push({index:i,enemyId:rec.enemy_id,fromX:rec.x,fromY:rec.y,toX:e.cell%sim.map.width,toY:Math.floor(e.cell/sim.map.width),dashPath:dashes.get(e.uid)});
  if(!e.skipTurn&&!e.holdAction&&e.state==='chase'&&(e.cell===from||dashes.has(e.uid))&&N.dist(e.cell,sim.player.cell,sim.map.width)<=(e.attackRange||1)&&N.lineOfSight(sim,e.cell,sim.player.cell)&&!o.didActThisTick(i))attacks.push({index:i,enemyId:rec.enemy_id,x:e.cell%sim.map.width,y:Math.floor(e.cell/sim.map.width)});
  if(e.healed>0)globalThis.CombatEnemies.healDungeonInjury(o.map.map_id,i,rec.enemy_id,e.healed);
 }
 return{moves,attacks};}
function aggro(index){return active()&&['chase','search'].includes(sim.enemies.find(e=>e.uid===gameMap().enemies[index]?.dungeonUid)?.state);}
function provoke(index){if(!active())return;sync();const e=sim.enemies.find(e=>e.uid===gameMap().enemies[index]?.dungeonUid);if(!e)return;e.state='chase';e.lost=0;e.lastSeen=sim.player.cell;e.facing=N.direction(e.cell,sim.player.cell,sim.map.width);}
function afterTick(){if(inTick)return;inTick=true;try{for(const m of meals){const gain=Math.min(m.remaining,m.rate);S().addSatiety(gain);m.remaining-=gain;m.ticks--;}meals=meals.filter(m=>m.ticks>0&&m.remaining>0);
 if(run?.status==='active'){if(dead())die();else if(active())observe();}if(pending&&!inActionTick){cancel();globalThis.DungeonPanel?.interrupted();}globalThis.DungeonPanel?.refresh();}finally{inTick=false;}}
function collectMarked(){for(const p of run?.marked||[])if(!recovered.some(b=>b.uid===run.id+':'+p.uid)){
 p.allocation??=allocate(p.search.items);recovered.push({...copy(p),uid:run.id+':'+p.uid,batch:run.id,floor:p.floor||sim.map.floor,opened:false,openingProgress:0});
}}
function totals(){const rows=[...(run?.records||[]),...(active()?[P.summary(sim)]:[])];return{...P.aggregate(rows),rows};}
function descend(){if(!active()||pending||sim.player.cell!==sim.map.exit||sim.map.floor>=config.maxFloor)return false;const next=generate(run.seed,sim.map.floor+1,run.content,run.population||null,run.recipeStudyPlan||null);const clue=typeof run.clue==='object'?run.clue:config.clues.find(c=>c.id===run.clue);if(clue&&next.map.floor===clue.floor&&!globalThis.DungeonContent?.apply?.(next,clue))return false;collectMarked();const oldId=run.mapId;run.records.push({...P.summary(sim),width:sim.map.width,height:sim.map.height,exploration:copy(sim.exploration)});run.mapId='dungeon_'+run.id+'_'+next.map.floor;install(next);E().setState(run.mapId,next.map.entry%next.map.width,Math.floor(next.map.entry/next.map.width));delete E().getMaps()[oldId];observe();persist();refresh();return true;}
function withdraw(){if(!active()||pending||sim.player.cell!==sim.map.exit||dead())return false;const total=totals();receipt={id:run.id,...total};IE().addPotential(total.total);collectMarked();run.status='settled';sim.ended=true;const p=run.returnTo;E().setState(p.mapId,p.x,p.y);persist();refresh();return true;}
function die(){if(!run||run.status!=='active')return;collectMarked();IE().clearAllOnDeath();run.status='dead';run.records=[];pending=null;if(sim)sim.ended=true;receipt=null;persist();}
function allocate(source){const items=source.map(i=>({...copy(i),revealed:true})),n=items.reduce((a,i)=>a+i.count,0),fee=n?Math.max(1,Math.floor(n*config.search.commission)):0;
 let remaining=n;const takes=items.map(()=>0);for(let t=0;t<fee;t++){let choice=Math.floor(Math.random()*remaining);for(let i=0;i<items.length;i++){const available=items[i].count-takes[i];if(choice<available){takes[i]++;break;}choice-=available;}remaining--;}
 const allocation={player:[],npc:[]};for(const [index,i]of items.entries()){const take=takes[index];if(take)allocation.npc.push({...i,count:take,claimed:true,taken:take});if(i.count>take)allocation.player.push({...i,count:i.count-take,claimed:false,taken:0});}return allocation;
}
function openingProgress(id,value){if(active()||!globalThis.DungeonCheckpoint?.canAccess())return false;const b=recovered.find(b=>b.uid===id);if(!b||b.opened)return false;b.openingProgress=Math.max(b.openingProgress||0,Math.min(1,Number(value)||0));return true;}
function openBag(id){if(active()||!globalThis.DungeonCheckpoint?.canAccess())return false;const b=recovered.find(b=>b.uid===id);if(!b||b.opened)return false;b.allocation??=allocate(b.search.items);b.openingProgress=1;b.opened=true;persist();return true;
}
function claimBatch(batch){if(active()||!globalThis.DungeonCheckpoint?.canAccess())return false;let added=false;for(const b of recovered.filter(b=>b.opened&&b.batch===batch))for(const it of b.allocation.player){if(it.claimed)continue;const count=takeUnits(it);added=added||count>0;if(!it.claimed){persist();return added;}}persist();return added;}

function claimBag(id,index){if(active()||!globalThis.DungeonCheckpoint?.canAccess())return false;const b=recovered.find(b=>b.uid===id),i=b?.allocation?.player[index];if(!b?.opened||!i||i.claimed)return false;const added=takeUnits(i);persist();refresh();return added>0;}
function getState(){return{version:1,run:copy(run),sim:copy(sim),pool:copy(pool),recovered:copy(recovered),meals:copy(meals),receipt:copy(receipt),enemyState:active()?gameMap().enemies.map((e,i)=>globalThis.CombatEnemies.getDungeonState(run.mapId,i,e.enemy_id)):[]};}
function validate(data,engine){
 if(data==null)return !String(engine?.mapId||'').startsWith('dungeon_');
 const num=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isFinite(v)&&v>=min&&v<=max;
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 const item=i=>!!IE().getItemTemplate(i.item_id)&&int(i.count,1,100000)&&!!config.search.rarities[i.rarity]&&int(i.ticks||0,0,i.requiredTicks||Math.max(100,config.search.rarities[i.rarity].ticks))&&(!i.requiredTicks||int(i.requiredTicks,1,100000))&&num(i.fraction||0,0,1)&&int(i.taken||0,0,i.count);
 const search=q=>q&&Array.isArray(q.items)&&q.items.every(item)&&int(q.cursor,0,q.items.length)&&num(q.fraction||0,0,1);
 const allocation=b=>!b.allocation||['player','npc'].every(k=>Array.isArray(b.allocation[k])&&b.allocation[k].every(item))&&Object.values(b.allocation).flat().reduce((n,i)=>n+i.count,0)===b.search.items.reduce((n,i)=>n+i.count,0);
 try{
  if(data.version!==1||!Array.isArray(data.recovered)||!Array.isArray(data.meals)||!data.pool||!data.pool.batches||!Array.isArray(data.pool.remaining))return false;
  if(!data.pool.remaining.every(i=>IE().getItemTemplate(i.item_id)&&int(i.stock)&&!!config.search.rarities[i.rarity]))return false;
  if(!data.meals.every(m=>num(m.remaining,0,10000)&&int(m.ticks,1,10000)&&num(m.rate,0,10000)))return false;
  if(!data.recovered.every(b=>typeof b.uid==='string'&&search(b.search)&&allocation(b)&&(!b.opened||!!b.allocation)&&num(b.openingProgress||0,0,1)))return false;
  const r=data.run;if(r?.population)DungeonPopulation.validate(r.population);
  if(r?.dungeonId!==undefined&&r.dungeonId!==config.id)return false;
  if(r?.content?.version>=16){const p=r.recipeStudyPlan;if(!p||p.firstFloor!==r.startFloor||!int(p.maxFloor,r.startFloor,config.maxFloor)||JSON.stringify(p)!==JSON.stringify(RuinsRecipeStudy.plan(r.seed,r.startFloor,p.maxFloor,r.content.recipeStudy)))return false;}
  if(r&&(!['active','settled','dead'].includes(r.status)||!Array.isArray(r.records)||!Array.isArray(r.marked)||!num(r.quantityBonus,0,1000)||!num(r.actionCostMultiplier,0,1000)))return false;
  if(r&&!r.records.every(row=>int(row.floor,1,config.maxFloor)&&['cells','base','door','kill','point'].every(k=>int(row[k]))))return false;
  if(r&&!r.marked.every(b=>typeof b.uid==='string'&&b.marked&&search(b.search)&&allocation(b)))return false;
  if(r?.status==='active'){
   const s=data.sim,m=s.map,cell=k=>int(k,0,m.width*m.height-1);
   if(!m||!int(m.width,1,100)||!int(m.height,1,100)||!int(m.floor,1,config.maxFloor)||m.tiles.length!==m.width*m.height||!m.tiles.every(t=>int(t,0,6))||engine?.mapId!==r.mapId)return false;
   if(!int(engine.x,0,m.width-1)||!int(engine.y,0,m.height-1)||!cell(m.entry)||!cell(m.exit))return false;
   for(const k of ['enemies','doors','harvestPoints','lootPoints','recoveryPoints','insightPoints','corpses'])if(!Array.isArray(s[k])||!s[k].every(p=>cell(p.cell)))return false;
   if(!s.staticTiles||s.staticTiles.length!==m.tiles.length)return false;
   for(const key of terrainSets)if(m[key]!==undefined&&(!Array.isArray(m[key])||!m[key].every(cell)))return false;
   if(m.outpostFloor!==undefined&&(!Array.isArray(m.outpostFloor)||!m.outpostFloor.every(row=>Array.isArray(row)&&row.length===2&&cell(row[0])&&row[1]&&typeof row[1]==='object')))return false;
   if(!s.harvestPoints.every(p=>H.definitions[p.id]&&int(p.total,1,10000)&&int(p.remaining,0,p.total)&&num(p.baseCost,0,10000)&&p.used===(p.remaining===0)))return false;
   if(![...s.lootPoints,...s.corpses].every(p=>search(p.search)))return false;
   for(const p of [...s.lootPoints,...s.enemies])DungeonBossRewards.profile(p.lootOverride,config.search.rarities,id=>!!IE().getItemTemplate(id));
   if(!s.recoveryPoints.every(p=>{const c=config.recovery[p.id],q=p.recovery;return c&&q&&int(q.remaining,0,c.uses)&&int(q.progress,0,c.ticks)&&p.used===(q.remaining===0)&&(!q.part||RuinsRecovery.parts[q.part]);}))return false;
   if(r.content?.version>=16&&s.insightPoints.filter(RuinsRecipeStudy.isPoint).length!==(r.recipeStudyPlan.floor===m.floor?1:0))return false;
   if(!s.insightPoints.every(p=>RuinsRecipeStudy.isPoint(p)?RuinsRecipeStudy.validatePoint(p,r.content?.recipeStudy,r.content?.insight):p.kind!=='recipe'&&num(p.amount,0,1000000)))return false;
   if(!s.reward||!['door','kill','point'].every(k=>Array.isArray(s.reward[k])&&s.reward[k].every(v=>typeof v==='string')&&new Set(s.reward[k]).size===s.reward[k].length))return false;
   if(!Array.isArray(data.enemyState)||data.enemyState.length!==s.enemies.length)return false;
  }else if(String(engine?.mapId||'').startsWith('dungeon_')&&r?.status!=='dead')return false;
  return true;
 }catch{return false;}
}
function restore(data){cancel();globalThis.DungeonPanel?.close({silent:true});if(run?.mapId)delete E().getMaps()[run.mapId];if(!data){sim=null;run=null;receipt=null;pool={batches:{},remaining:[]};recovered=[];meals=[];return;}
 run=copy(data.run);pool=copy(data.pool);recovered=copy(data.recovered);meals=copy(data.meals);receipt=copy(data.receipt);sim=copy(data.sim);if(sim)restoreTerrain(sim.map);
 for(const p of run?.marked||[])p.allocation??=allocate(p.search.items);
 for(const b of recovered){b.batch??=b.uid.split(':')[0];b.allocation??=allocate(b.search.items);}
 if(run&&['active','dead'].includes(run.status)&&sim){const loot=copy(sim.lootPoints);install(sim);sim.lootPoints=loot;if(!RuinsExploration.restore(sim,sim.exploration))RuinsExploration.initialize(sim);for(const [i,rec]of E().getMaps()[run.mapId].enemies.entries())globalThis.CombatEnemies.restoreDungeonState(run.mapId,i,rec.enemy_id,data.enemyState?.[i]);}
}
function dynamicMeta(x,y){const k=y*sim.map.width+x,sight=N.inspect(sim,sim.player,k),enemy=gameMap().enemies.find(e=>e.x===x&&e.y===y);
 const ground=IE()?.getGroundItemsAt?.(E().getState().mapId,x,y)||[],known=sight.dynamic&&sight.identify;
 return{terrainVisible:sight.terrain,player:k===sim.player.cell,adjacent:N.dist(k,sim.player.cell,sim.map.width)===1,walkable:E().isWalkable(x,y),enemy:sight.dynamic&&!!enemy,enemyId:sight.identify?enemy?.enemy_id:null,unknownPresence:sight.dynamic&&!sight.identify&&!!enemy,groundCount:known?ground.length:0,groundBackpackCount:known&&globalThis.InventoryTransfer?ground.filter(globalThis.InventoryTransfer.isBackpack).length:0,groundUnknown:sight.dynamic&&!sight.identify&&ground.length>0,playerFacingDir:sim.player.facing};}
function inspect(k){return active()?N.inspect(sim,sim.player,k):null;}
const api={lastError:()=>lastError,progressState,setProgress,receiveHit,checkpoint:persist,openingProgress,active,sync,observe,refresh,config:()=>config,getSim:()=>sim,getRun:()=>run,getPending:()=>pending,getReceipt:()=>receipt,getRecovered:()=>recovered,availableTickets,availableClues,canPrepare,enter,blocked,walkable,canStep,nearby,find,isAccessible,threat,openDoor,begin,cancel,completeTick,claim,mark,killed,updateAI,aggro,afterTick,totals,descend,withdraw,die,openBag,claimBag,claimBatch,windowAction,getState,validate,restore,dynamicMeta,inspect,rolls,containerEmptyChance};
for(const k of ['enter','openDoor','completeTick','claim','mark','windowAction','descend','withdraw','openBag','claimBag','claimBatch']){const fn=api[k];api[k]=(...args)=>commit(()=>fn(...args));}
api.ready=fetch('data/dungeon-config.json').then(r=>{if(!r.ok)throw Error('地牢配置加载失败');return r.json();}).then(async c=>{
 if(c.recipeStudyRangesSource){
  const ranges=await fetch(c.recipeStudyRangesSource).then(r=>{if(!r.ok)throw Error('地牢配方范围加载失败');return r.json();});
  if(c.content.recipeStudy!==undefined)throw Error('地牢配方范围存在两份配置，请只保留范围目录');
  c.content={...c.content,recipeStudy:DungeonRecipeRanges.forDungeon(ranges,c.id)};
 }
 RuinsContentConfig.resolve({overrides:c.content});populationConfig=await fetch(c.populationSource||'data/street-thug-spawn.json').then(r=>{if(!r.ok)throw Error('敌人投放配置加载失败');return r.json();});DungeonPopulation.validate(populationConfig);DungeonBossRewards.validate(c.boss,c.search.rarities);config=c;Object.assign(N.doorConfig,c.door);Object.assign(N.config,c.enemy);Object.assign(H.config,c.harvest);Object.assign(P.config,c.reward);Object.assign(RuinsRecovery.config,c.recovery);ready=true;
});
globalThis.DungeonRuntime=api;
api.provoke=provoke;
})();
