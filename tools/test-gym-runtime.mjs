import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot} from './ui-game-fixture.mjs';
import {createGymPrototype} from './gym-prototype-model.mjs';
import {ACTIONS,STATIONS,moduleKey} from './gym-prototype-data.mjs';
const copy=v=>JSON.parse(JSON.stringify(v));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const addedActions=['prone_extension','bird_dog','pelvic_tilt','diaphragmatic_breathing','rib_expansion','controlled_exhalation','pelvic_floor_hold','perineal_control','scapular_depression','finger_extension','thumb_extension','thumb_abduction','finger_adduction','intrinsic_grip','palm_cup','chin_tuck','cervical_extension','suboccipital_stability','chin_resistance','hyoid_control','pitch_glide','vocal_onset','airway_control'];
test('gym actions cover every existing non-head muscle and no head muscle',()=>{
 const data=JSON.parse(fs.readFileSync('data/muscles.json','utf8')),muscles=new Map(data.muscles.map(m=>[m.id,m]));
 const expected=data.muscles.filter(m=>m.group!=='head').map(m=>m.id).sort(),covered=new Set();
 assert.equal(ACTIONS.length,75);assert.equal(new Set(ACTIONS.map(a=>a.id)).size,ACTIONS.length);
 for(const a of ACTIONS){
  assert.ok(STATIONS.some(s=>s.id===a.station),a.id+' has a facility');
  const targets=[...a.main,...a.assist];assert.equal(new Set(targets).size,targets.length,a.id+' cannot pay a muscle twice');
  assert.ok(a.main.length>0&&a.mainPct>0&&a.assistPct>0);
  for(const id of targets){assert.ok(muscles.has(id),id+' exists');assert.notEqual(muscles.get(id).group,'head',id+' is not in head');covered.add(id);}
 }
 assert.deepEqual([...covered].sort(),expected);assert.equal(covered.size,381);
 assert.equal(new Set([...covered].map(id=>muscles.get(id).group)).size,21);
 for(const id of ['grip','pinch','finger_spread','opposition','finger_extension','thumb_extension','thumb_abduction','finger_adduction','intrinsic_grip','palm_cup'])assert.equal(moduleKey(ACTIONS.find(a=>a.id===id)),'handsfeet_hands',id);
});
async function setup(h){
 const g=h.g;g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
 const name=g.document.querySelector('#creation-name');name.value='健身验收';name.dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();g.document.querySelector('#btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
 g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);g.Survival.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20,isDead:false,isComa:false});
 const IE=g.InventoryEquipment,st=copy(IE.getState());
 const defs=JSON.parse(fs.readFileSync('data/equipment-catalog-v2.json','utf8')).items;
 const equipment=Object.fromEntries(Object.keys(defs).map(id=>[id,IE.getItemTemplate(id)]));equipment.gym_test_bag={item_id:'gym_test_bag',name:'测试背包',equip_slot:'backpack',backpack_slots:30,weight_kg:1};IE.setConfig({equipment});
 st.equipment.backpack={item_id:'gym_test_bag'};st.inventory_pocket=[];st.inventory_vest=[];st.inventory_vehicle=[];st.inventory_backpack=g.FacilityUnlockConfig.materials.map(m=>({item_id:m[0],count:25}));IE.setState(st);
 let n=90000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
 g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++n,fn),n):oldSet(fn,ms,...args);g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
 return {step(){assert.equal(timers.size,1,'one training timer');const [id,fn]=timers.entries().next().value;timers.delete(id);fn();},timers};
}
for(const mode of [false,true])test(`expanded gym ${mode?'Svelte':'classic'}: new actions through NPC, exact rewards, saved modules and group completion`,async()=>{
 const h=await boot(mode),g=h.g;
 try{
  const clock=await setup(h),G=g.GymSystem,M=g.Muscles,S=g.Survival,E=g.GameEngine,SS=g.SaveSystem;
  const state=G.getState();for(const s of G.stations)state.levels[s.id]=1;
  Object.assign(state.levels,{handsfeet_hands:2,handsfeet_ankle:3,handsfeet_toes:4});G.restore(state,true);
  const muscles=M.getGroups().flatMap(group=>M.getMusclesByGroup(group.id)),progress=()=>Object.fromEntries(muscles.map(m=>[m.id,M.getProgress(m.id)]));
  async function enter(stationId){
   g.GymPanel.close();const p=G.getLayout().stations.find(p=>p.id===stationId),[w,height]=G.footprints[stationId];let found=false;
   for(let y=p.y-1;y<=p.y+height&&!found;y++)for(let x=p.x-1;x<=p.x+w&&!found;x++){
    if(!E.isWalkable(x,y))continue;E.setState('M0_Base_Inside_lv_1',x,y);found=G.at(stationId);
   }
   assert.ok(found,'reachable '+stationId);await g.NPCSystem.openMenu(g.GymFacility.npcId(stationId));await h.drain();
   assert.equal(g.NPCSystem.isMenuOpen(),true);g.NPCSystem.menu.choose(0);assert.equal(g.GymPanel.isOpen(),true);
  }
  let stationId='';
  for(const id of addedActions){
   const a=G.action(id);S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20});
   if(a.station!==stationId){await enter(a.station);stationId=a.station;}
   g.document.querySelector(`#gym-panel [data-action="${id}"]`).click();
   const before=progress(),rewards=G.rewards(a),cost=G.cost(a),tick=S.getState().tickCount;
   if(a.station==='handsfeet'){
    assert.equal(G.upgradeInfo(a).key,'handsfeet_hands');near(G.efficiency(a).equipment,1.15);
    g.document.querySelector('#gym-panel [data-tab="upgrade"]').click();
    assert.match(g.document.querySelector('#gym-panel .upgrade-summary').textContent,/手部用具 · 2级/);
    g.document.querySelector('#gym-panel [data-tab="train"]').click();
   }
   const train=g.document.querySelector('#gym-panel [data-op="train"]');assert.equal(train.disabled,false,id+' available');train.click();
   assert.equal(G.getState().job.actionId,id);near(S.getStamina(),100-cost);near(S.getFatigue(),cost*1.5);
   clock.step();assert.deepEqual(progress(),before,id+' pays nothing before completion');
   if(id==='finger_extension'){
    const saved=copy(SS.buildSnapshotForDebug());assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();
    assert.equal(G.getState().job.actionId,id);assert.equal(G.level(a),2);near(S.getFatigue(),cost*1.5);
   }
   clock.step();assert.equal(G.isActive(),false,id+' completed');assert.equal(S.getState().tickCount,tick+2,id+' advances world time');
   const expected={...before};for(const r of rewards)expected[r.id]=Math.round((expected[r.id]+r.pct)*1e6)/1e6;
   assert.deepEqual(progress(),expected,id+' changes exactly its targets once');
  }
  // A previously uncovered group can now light up through ordinary completed actions.
  await enter('floor');const seeded=copy(M.getState());for(const m of M.getMusclesByGroup('pelvis'))seeded.progress[m.id]=99.99;M.setState(seeded);
  assert.equal(M.isGroupComplete('pelvis'),false);
  for(const id of ['pelvic_floor_hold','perineal_control']){
   S.setState({stamina:100,fatigue:0});assert.equal(G.startTraining(id).ok,true);clock.step();clock.step();
  }
  assert.equal(M.isGroupComplete('pelvis'),true);assert.ok(M.getMusclesByGroup('head').every(m=>M.getProgress(m.id)===0));
  // Prototype shares the hand module, instead of falling through to the toe module.
  g.GymPanel.close();const demo=createGymPrototype({Muscles:M,Survival:S,GameTime:g.GameTime},JSON.parse(fs.readFileSync('data/survival-config.json','utf8')));
  demo.reset('built');Object.assign(demo.state.levels,{handsfeet_hands:2,handsfeet_ankle:3,handsfeet_toes:4});demo.setNutrition(20);
  const a=demo.getAction('finger_extension'),reward=demo.rewardPreview(a)[0];assert.equal(demo.upgradeInfo(a).key,'handsfeet_hands');near(reward.pct,.253);
  demo.startTraining(a.id);demo.tick();near(demo.percent(reward.id),0);demo.tick();near(demo.percent(reward.id),.253);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
for(const mode of [false,true])test(`formal gym ${mode?'Svelte':'classic'}: NPC, real materials, growth, rollback and continuation`,async()=>{
 const h=await boot(mode),g=h.g;
 try{
  const clock=await setup(h),G=g.GymSystem,M=g.Muscles,S=g.Survival,E=g.GameEngine;
  E.setState('M0_Base_Inside_lv_1',10,7);
  const beforeInspection=copy(g.SaveSystem.buildSnapshotForDebug()),logs=[],log=g.GameLog.log;
  g.GameLog.log=(message,...args)=>{logs.push(message);return log.call(g.GameLog,message,...args);};
  assert.equal(E.isWalkable(9,7),false,'entrance is a real wall');
  assert.equal(E.moveTo(9,7),false);assert.equal(E.jumpTo(8,7,2),false,'cannot leap through sealed entrance');
  assert.equal(E.jumpTo(7,6,4),false,'cannot bypass the entrance via another gym wall');
  g.SceneCtx.actions.tryIntentMove(9,7,-1,0,'keyboard');assert.equal(logs.length,0,'walking does not reveal the hint');
  g.SceneCtx.actions.tryIntentMove(8,7,-2,0,'click');assert.equal(logs.length,0,'distant click does not reveal the hint');
  g.SceneCtx.actions.tryIntentMove(9,7,-1,0,'click');assert.deepEqual(logs,['这里后面好像是空的。']);
  assert.equal(g.NPCSystem.isMenuOpen(),false);assert.equal(g.GymPanel.isOpen(),false);
  const afterInspection=copy(g.SaveSystem.buildSnapshotForDebug());delete beforeInspection.savedAt;delete afterInspection.savedAt;
  assert.deepEqual(afterInspection,beforeInspection,'inspection changes no resources, ticks or saved progress');
  const entrance=g.GymEntrancePanel,IE=g.InventoryEquipment,unlearned=copy(IE.getState()),skill=IE.SPECIAL_ANATOMY_STUDIES_SKILL_ID;
  assert.equal(entrance.show(9,7),false,'unlearned anatomy cannot open the page directly');
  const learned=copy(unlearned);learned.skills[skill].level=1;IE.setState(learned);
  g.SceneCtx.actions.tryIntentMove(9,7,-1,0,'keyboard');assert.equal(entrance.isOpen(),false,'learning does not turn walking into inspection');
  const beforePage=copy(g.SaveSystem.buildSnapshotForDebug());
  g.SceneCtx.actions.tryIntentMove(9,7,-1,0,'click');assert.equal(entrance.isOpen(),true);
  const page=g.document.querySelector('#gym-entrance-panel');assert.match(page.textContent,/解剖学.*已学习/s);
  assert.equal(page.querySelector('[data-unlock]').disabled,true,'anatomy alone cannot replace the missing hammer');
  assert.equal(E.isWalkable(9,7),false);assert.equal(E.jumpTo(8,7,2),false);
  g.SceneCtx.actions.tryIntentMove(11,7,1,0,'keyboard');assert.equal(E.getState().x,10,'world movement is blocked while inspecting');
  const afterPage=copy(g.SaveSystem.buildSnapshotForDebug());delete beforePage.savedAt;delete afterPage.savedAt;
  assert.deepEqual(afterPage,beforePage,'viewing the page charges and saves nothing');
  IE.setState(unlearned);g.SceneHud.refresh('status');assert.equal(entrance.isOpen(),false,'losing the prerequisite closes a stale page');
  IE.setState(learned);assert.equal(entrance.show(9,7),true);
  E.setState('M0_Base_Inside_lv_1',12,7);g.SceneHud.refresh('status');assert.equal(entrance.isOpen(),false);assert.equal(entrance.show(9,7),false,'remote access denied');
  E.setState('M0_Base_Inside_lv_1',10,7);S.setState({isComa:true});assert.equal(entrance.show(9,7),false);S.setState({isComa:false});
  IE.setState(unlearned);
  g.GameLog.log=log;E.setState('M0_Base_Inside_lv_1',5,5);
  assert.equal(M.getGroups().length,22);assert.equal(G.actions.length,75);assert.equal(G.getState().levels.floor,1);assert.equal(G.getState().levels.barbell,undefined);
  for(const s of G.getLayout().stations){const [w,hh]=G.footprints[s.id];for(let y=0;y<hh;y++)for(let x=0;x<w;x++){assert.equal(E.isWalkable(s.x+x,s.y+y),false);assert.equal(E.getInteractNpcIdAt(s.x+x,s.y+y),g.GymFacility.npcId(s.id));}}
  await g.NPCSystem.openMenu(g.GymFacility.npcId('floor'));await h.drain();assert.equal(g.NPCSystem.isMenuOpen(),true);g.NPCSystem.menu.choose(0);assert.equal(g.GymPanel.isOpen(),true,JSON.stringify({at:G.at('floor'),usable:G.usable('floor'),created:g.CharacterAttributes.isCharacterCreationCompleted(),error:G.getError()}));
  const ids=G.action('pushup').main,first=ids[0],initialFatigue=S.getFatigue();
  assert.equal(G.startTraining('pushup',1).ok,true);assert.equal(clock.timers.size,1);assert.equal(S.getFatigue()-initialFatigue,15);assert.equal(M.getProgress(first),0);
  const ticks=S.getState().tickCount;S.advanceTick({source:'rest'});assert.equal(S.getState().tickCount,ticks,'other clocks blocked');
  const before=E.getState();g.SceneCtx.actions.tryIntentMove(6,5,1,0,'test');assert.deepEqual(copy(E.getState()),copy(before));
  clock.step();assert.equal(M.getProgress(first),0,'no partial-group reward');const snap=copy(g.SaveSystem.buildSnapshotForDebug());
  assert.equal(g.SaveSystem.applySnapshotForDebug(snap),true);await h.drain();assert.equal(clock.timers.size,1);assert.equal(S.getFatigue(),initialFatigue+15,'resume does not charge again');
  const save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;clock.step();assert.equal(G.getState().job.ticks,1);assert.equal(M.getProgress(first),0);assert.equal(S.getState().tickCount,snap.player.survival.tickCount);assert.equal(clock.timers.size,0);assert.match(G.getError(),/保存/);
  g.SaveSystem.saveNow=save;G.retry();clock.step();assert.equal(G.isActive(),false);assert.equal(M.getProgress(first),.18);G.advance();assert.equal(M.getProgress(first),.18,'no repeated reward');
  const progress=copy(M.getState());progress.progress[first]=99.9;M.setState(progress);S.setState({stamina:100,fatigue:0});assert.equal(G.startTraining('pushup').ok,true);clock.step();clock.step();assert.equal(M.isUnlocked(first),true);assert.equal(M.getProgress(first),100);
  S.setState({stamina:100,fatigue:60});const beforeHalf=M.getProgress(ids[1]);assert.equal(G.startTraining('pushup').ok,true);clock.step();clock.step();assert.ok(Math.abs(M.getProgress(ids[1])-beforeHalf-.09)<1e-8);S.setState({fatigue:80});assert.equal(G.startTraining('pushup').ok,false);S.setState({stamina:100,fatigue:0});
  E.setState('M0_Base_Inside_lv_1',7,3);const buildCost=G.station('dumbbell').build,offer=G.plan(buildCost),inventory=copy(g.InventoryEquipment.getState());assert.equal(offer.ok,true);
  g.SaveSystem.saveNow=()=>false;assert.equal(G.build('dumbbell',offer.signature).ok,false);assert.deepEqual(copy(g.InventoryEquipment.getState()),inventory);assert.equal(G.getState().levels.dumbbell,undefined);
  g.SaveSystem.saveNow=save;assert.equal(G.build('dumbbell',offer.signature).ok,true);assert.equal(G.getState().levels.dumbbell,1);const inventoryAfter=copy(g.InventoryEquipment.getState());assert.equal(G.build('dumbbell',offer.signature).ok,false);assert.deepEqual(copy(g.InventoryEquipment.getState()),inventoryAfter);
  assert.equal(G.forgePlates('dumbbell',G.plan({metal:12,parts:2}).signature).ok,true);assert.equal(G.getState().plates,1);
  const upgrade=G.upgradeInfo(G.action('curl'));assert.equal(G.upgrade('curl',1,G.plan(upgrade.costs).signature).ok,true);assert.equal(G.getState().levels.dumbbell,2);assert.equal(G.getState().plates,0);assert.equal(G.getState().assignedPlates.dumbbell,1);
  E.setState('M0_Base_Inside_lv_1',5,5);assert.equal(G.upgrade('curl',2,'').ok,false);assert.equal(G.forgePlates('dumbbell','').ok,false);assert.equal(G.startTraining('curl').ok,false);
  const final=copy(g.SaveSystem.buildSnapshotForDebug());assert.equal(g.SaveSystem.applySnapshotForDebug(final),true);await h.drain();assert.equal(G.getState().levels.dumbbell,2);assert.equal(M.getProgress(first),100);
  S.setState({stamina:100,fatigue:0});S.consumeStamina(10,{raw:true});assert.equal(S.getFatigue(),10*S.getConfigValue('fatigue_gain_per_stamina_spent',.5),'ordinary fatigue unchanged');
  const old=copy(final);delete old.gym;delete old.muscles.progress;assert.equal(g.SaveSystem.applySnapshotForDebug(old),true);await h.drain();assert.deepEqual(copy(G.getState().levels),{floor:1});assert.equal(M.getProgress(first),100,'old unlocked muscles preserved');assert.equal(M.getProgress(ids[1]),0);
  assert.equal(G.validate({...G.getState(),job:{actionId:'unknown'}}),false);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
test('continuous groups pause on hidden, stop at fatigue threshold, cancel on coma and keep facility modules independent',async()=>{
 const h=await boot(false),g=h.g;
 try{
  const clock=await setup(h),G=g.GymSystem,S=g.Survival,M=g.Muscles;
  S.setState({stamina:100,fatigue:0});assert.equal(G.startTraining('pushup',8).ok,true);
  let hidden=true;Object.defineProperty(g.document,'hidden',{get:()=>hidden,configurable:true});g.document.dispatchEvent(new g.Event('visibilitychange'));assert.equal(clock.timers.size,0);assert.equal(G.getState().job.ticks,0);
  hidden=false;g.document.dispatchEvent(new g.Event('visibilitychange'));assert.equal(clock.timers.size,1);
  for(let group=0;group<6;group++){clock.step();clock.step();}
  assert.equal(G.isActive(),false);assert.equal(S.getFatigue(),90);assert.equal(M.getProgress(G.action('pushup').main[0]),.9,'four full groups, two half groups');
  S.setState({stamina:100,fatigue:0});assert.equal(G.startTraining('crunch').ok,true);const before=M.getProgress(G.action('crunch').main[0]);S.setState({isComa:true});clock.step();assert.equal(G.isActive(),false);assert.equal(M.getProgress(G.action('crunch').main[0]),before);S.setState({isComa:false});
  g.GameEngine.setState('M0_Base_Inside_lv_1',4,6);assert.equal(G.build('handsfeet',G.plan(G.station('handsfeet').build).signature).ok,true);
  assert.equal(G.upgrade('grip',1,G.plan(G.upgradeInfo(G.action('grip')).costs).signature).ok,true);assert.equal(G.level(G.action('grip')),2);assert.equal(G.level(G.action('calf_raise')),1);assert.equal(G.level(G.action('toe_curl')),1);
  assert.equal(G.upgrade('grip',1,'').ok,false,'old upgrade cannot repeat');
  assert.equal(G.forgePlates('handsfeet','stale').ok,false,'changed material choice is not silently consumed');
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);S.setState({stamina:100,fatigue:0});assert.equal(G.startTraining('crunch').ok,true);
  const earned=copy(M.getState());g.CharacterAttributes.applyCombatDestroy('head',g.CharacterAttributes.getBodyPartDestroyMax('head'));await h.drain();
  assert.equal(G.isActive(),false);assert.equal(clock.timers.size,0);assert.equal(G.level(G.action('grip')),2,'death preserves hideout modules');assert.deepEqual(copy(M.getState()),earned,'death preserves earned growth, grants no unfinished group');
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

for(const mode of [false,true])test(`gym entrance ${mode?'Svelte':'classic'}: consumables, atomic opening, reload and stale clicks`,async()=>{
 const h=await boot(mode),g=h.g;
 try{
  await setup(h);
  const G=g.GymSystem,E=g.GameEngine,IE=g.InventoryEquipment,S=g.Survival,P=g.GymEntrancePanel,SS=g.SaveSystem;
  E.setState('M0_Base_Inside_lv_1',10,7);
  const inv=copy(IE.getState());inv.skills[IE.SPECIAL_ANATOMY_STUDIES_SKILL_ID].level=1;
  inv.inventory_backpack=[{item_id:'tool_repair_hammer',count:1},{item_id:'wood_plank_soft',count:1},{item_id:'wood_plank_soft',count:1},{item_id:'supply_rope_hemp_short',count:1}];
  IE.setState(inv);
  assert.deepEqual(copy(g.GymData.ENTRANCE_COST),[{id:'tool_repair_hammer',count:1},{id:'wood_plank_soft',count:2},{id:'supply_rope_hemp_short',count:2}]);
  assert.ok(g.GymData.ENTRANCE_COST.every(r=>IE.getItemTemplate(r.id)),'all requirements are real item templates');
  assert.equal(P.show(9,7),true);
  const page=g.document.querySelector('#gym-entrance-panel'),button=page.querySelector('[data-unlock]');
  assert.equal(page.querySelectorAll('[data-item]').length,3);assert.match(page.textContent,/随身 \/ 消耗/);
  assert.equal(button.disabled,true);const insufficient=copy(IE.getState());
  assert.equal(G.openEntrance(9,7).ok,false);assert.deepEqual(copy(IE.getState()),insufficient,'missing one material consumes nothing');
  inv.inventory_backpack[3].count=2;inv.inventory_backpack[0].warehouse_locked=true;IE.setState(inv);
  assert.equal(G.entrancePlan().ok,false,'sealed items cannot pay');
  delete inv.inventory_backpack[0].warehouse_locked;IE.setState(inv);g.SceneHud.refresh('status');
  assert.equal(button.disabled,false);
  const sealed=copy(SS.buildSnapshotForDebug()),originalMap=E.getMap(),save=SS.saveNow;
  SS.saveNow=()=>false;button.click();
  assert.equal(G.getState().entranceOpen,false);assert.equal(E.isWalkable(9,7),false);assert.equal(E.jumpTo(8,7,2),false);
  assert.deepEqual(copy(IE.getState()),sealed.player.inventoryEquipment,'failed save restores the hammer and all materials');
  assert.equal(P.isOpen(),true);assert.match(page.querySelector('[data-message]').textContent,/保存失败/);
  SS.saveNow=save;button.click();
  assert.equal(P.isOpen(),false);assert.equal(G.getState().entranceOpen,true);assert.equal(E.isWalkable(9,7),true);
  assert.notEqual(E.getMap(),originalMap,'opening invalidates the wall drawing geometry');
  const map=E.getMap(),projection=g.MapProjection.create(map,144/Math.SQRT2,'isometric'),cap=projection.cellCenter(9,7);cap.y-=projection.tileHeight*.6;
  assert.equal(g.BaseHideoutArt.pickInspectableWall(map,projection,()=>({terrainVisible:true}),cap.x,cap.y),null,'the removed wall has no clickable face');
  for(const row of g.GymData.ENTRANCE_COST)assert.equal(IE.countCarriedItemsByTemplateId(row.id),0,row.id+' consumed');
  for(const key of ['stamina','satiety','thirst','fatigue','tickCount'])assert.equal(S.getState()[key],sealed.player.survival[key],'no unspecified '+key+' charge');
  const paid=copy(IE.getState());button.dispatchEvent(new g.Event('click'));
  assert.equal(G.openEntrance(9,7).ok,false);assert.deepEqual(copy(IE.getState()),paid,'opening and old clicks never pay twice');
  assert.equal(E.moveTo(9,7),true);assert.equal(E.moveTo(8,7),true,'doorway leads into the gym');
  const opened=copy(SS.buildSnapshotForDebug());
  assert.equal(SS.applySnapshotForDebug(sealed),true);await h.drain();assert.equal(E.isWalkable(9,7),false,'an older sealed save restores the wall');
  assert.equal(SS.applySnapshotForDebug(opened),true);await h.drain();assert.equal(E.isWalkable(9,7),true);assert.deepEqual(copy(IE.getState()),paid,'load keeps the opening without charging again');
  E.setState('M0_Base_Outside_lv_1',7,5);E.setState('M0_Base_Inside_lv_1',10,7);assert.equal(E.isWalkable(9,7),true,'returning to the hideout stays open');
  const older=copy(sealed);delete older.gym.entranceOpen;assert.equal(SS.applySnapshotForDebug(older),true);await h.drain();assert.equal(G.getState().entranceOpen,false);assert.equal(E.isWalkable(9,7),false);
  assert.equal(G.validate({...G.getState(),entranceOpen:'true'}),false);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
for(const mode of [false,true])test(`gym growth ${mode?'Svelte':'classic'}: anatomy, nutrition, locked rewards and prototype parity`,async()=>{
 const h=await boot(mode),g=h.g;
 try{
  const clock=await setup(h),G=g.GymSystem,S=g.Survival,M=g.Muscles,IE=g.InventoryEquipment,B=g.BuffSystem,SS=g.SaveSystem;
  const anatomy=lv=>{const inv=copy(IE.getState());inv.skills[IE.SPECIAL_ANATOMY_STUDIES_SKILL_ID].level=lv;IE.setState(inv);};
  const push=G.action('pushup'),main=push.main[0],assist=push.assist[0];
  near(G.rewards(push)[0].pct,.18);
  anatomy(1);near(G.rewards(push)[0].pct,.1836);
  anatomy(10);near(G.rewards(push)[0].pct,.216);
  for(const [nutrition,bonus]of [[0,0],[30,0],[31,.1],[70,.1],[71,.1],[100,.1]]){
   S.setState({nutrition});near(G.efficiency(push).nutritionBonus,bonus);near(G.rewards(push)[0].pct,bonus?.234:.216);
  }
  assert.equal(B.hasBuffByBuffId('player','survival_nutrition_peak'),true);
  B.applyBuff('player','survival_nutrition_abundant','gym_test',{});
  near(G.efficiency(push).nutritionBonus,.1,'overlapping tier buffs do not stack');
  const st=G.getState();st.levels.floor=2;G.restore(st,true);S.setState({nutrition:40,fatigue:0,stamina:100});
  near(G.efficiency(push).multiplier,1.495);near(G.rewards(push)[0].pct,.2691);
  near(G.rewards(push).find(r=>r.id===assist).pct,.0598);
  S.setState({fatigue:60});near(G.rewards(push)[0].pct,.13455);
  S.setState({fatigue:80});assert.equal(G.startTraining('pushup').ok,false);
  S.setState({fatigue:0});assert.equal(G.startTraining('pushup',4).ok,true);
  assert.equal(S.getStamina(),90);assert.equal(S.getFatigue(),15,'growth bonuses do not discount costs');
  const panel=g.document.querySelector('#gym-panel');assert.match(panel.textContent,/解剖学 \+20%/);assert.match(panel.textContent,/营养 \+10%/);
  anatomy(20);S.setState({nutrition:20});clock.step();near(M.getProgress(main),0);
  const pending=copy(SS.buildSnapshotForDebug());assert.equal(SS.applySnapshotForDebug(pending),true);await h.drain();
  near(G.getState().job.rewards[0].pct,.2691);assert.match(panel.textContent,/解剖学 \+20%/,'display retains this group\'s locked bonus');
  const save=SS.saveNow;SS.saveNow=()=>false;clock.step();near(M.getProgress(main),0);near(G.getState().job.rewards[0].pct,.2691);
  SS.saveNow=save;G.retry();clock.step();near(M.getProgress(main),.2691);
  near(G.getState().job.rewards[0].pct,.2898,'next group uses new skill and nutrition');
  near(G.getState().job.efficiency.multiplier,1.61);assert.match(panel.textContent,/解剖学 \+40%/);assert.match(panel.textContent,/营养 \+0%/);
  G.stop();clock.step();clock.step();near(M.getProgress(main),.5589);assert.equal(G.isActive(),false);
  // Pre-change jobs lack a breakdown, but their saved reward still finishes unchanged.
  const legacy=copy(pending);delete legacy.gym.job.efficiency;
  assert.equal(SS.applySnapshotForDebug(legacy),true);await h.drain();G.stop();clock.step();near(M.getProgress(main),.2691);
  anatomy(1000);S.setState({stamina:100,fatigue:0,nutrition:80});const high=G.getState();high.levels.floor=4;G.restore(high,true);
  const abs=G.action('crunch').main[0],muscles=copy(M.getState());muscles.progress[abs]=99.9;M.setState(muscles);
  assert.equal(G.startTraining('crunch').ok,true);assert.ok(G.getState().job.rewards[0].pct>1,'large legitimate gains are not rejected by old 1% validation');
  clock.step();const highSave=copy(SS.buildSnapshotForDebug());assert.equal(SS.applySnapshotForDebug(highSave),true);await h.drain();clock.step();near(M.getProgress(abs),100);assert.equal(M.isUnlocked(abs),true);
  // The standalone demo uses the same formula and Survival nutrition thresholds.
  const demo=createGymPrototype({Muscles:M,Survival:S,GameTime:g.GameTime},JSON.parse(fs.readFileSync('data/survival-config.json','utf8')));
  demo.state.levels.floor=2;demo.setAnatomyLevel(10);demo.setNutrition(40);
  near(demo.rewardPreview(demo.getAction('pushup'))[0].pct,.2691);demo.setNutrition(80);near(demo.efficiency(demo.getAction('pushup')).nutritionBonus,.1);
  demo.startTraining('pushup');demo.state.anatomyLevel=20;S.setState({nutrition:20});demo.tick();near(demo.percent(main),0);demo.tick();near(demo.percent(main),.2691);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
