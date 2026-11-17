import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';
const json=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const copy=v=>JSON.parse(JSON.stringify(v));
async function core(){
  const g={console,fetch:async p=>({ok:true,json:async()=>json(String(p))}),Math:Object.create(Math),
    GameTime:{tick:0,getState(){return {totalTicks:this.tick};},advanceTicks(n){this.tick+=n;}}};
  g.window=g;vm.createContext(g);
  for(const f of ['injury-data','injury-system','survival','character-attributes','combat-enemies','buff-system','combat-damage','combat-pipeline'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),g,{filename:f});
  g.Survival.setConfig(json('data/survival-config.json'));g.CharacterAttributes.setConfig(json('data/survival-config.json'));
  g.CombatEnemies.setTable(json('data/combat-enemies.json'));g.BuffSystem.init();
  for(let i=0;i<50&&!g.BuffSystem.getState().loaded;i++)await new Promise(r=>setTimeout(r,5));
  assert.ok(g.BuffSystem.getState().loaded);
  g.Survival.setState({stamina:100,energy:100,satiety:100,thirst:100,mood:500,dirtyness:50,fatigue:0,isDead:false,isComa:false});
  return g;
}
const injury=(g,type,part='lhand',owner='player')=>g.InjurySystem.apply(owner,part,type);
const clear=(g,type,part='lhand',owner='player')=>g.BuffSystem.clearPartInjury(owner,part,type);
const active=(g,type,part='lhand',owner='player')=>g.InjurySystem.has(owner,part,type);
const advance=(g,n=1)=>{for(let i=0;i<n;i++)g.Survival.advanceTick();};
const damage=(g,values,loss={})=>g.CharacterAttributes.setState({part_destroy:{head:0,chest:0,abdomen:0,lhand:0,rhand:0,lfoot:0,rfoot:0,...values},surgical_max_loss:loss});
test('attack thresholds use independent final typed damage and normal maxima',async()=>{
  const g=await core(),I=g.InjurySystem;
  const expected={blunt:[[0,0,0],[0,0,0],[5,0,5],[10,0,20],[20,5,40],[30,10,60]],slash:[[0,0,0],[15,0,0],[30,0,0],[40,10,5],[45,20,15],[45,35,30]],pierce:[[0,0,0],[10,0,0],[20,5,0],[25,20,0],[30,35,5],[30,50,15]]};
  for(const type of Object.keys(expected))for(const [index,n] of [0,5,10,20,30,50].entries()){
    assert.deepEqual(Object.values(I.probabilities({[type]:n},100,'lhand')),expected[type][index]);
    if(index)assert.deepEqual(Object.values(I.probabilities({[type]:n-.001},100,'lhand')),expected[type][index-1]);
  }
  assert.deepEqual(copy(I.probabilities({slash:30,pierce:50},100,'lhand')),{bleeding:45,heavy_bleeding:50,fracture:15});
  assert.deepEqual(copy(I.probabilities({pierce:50},100,'head')),{bleeding:30,heavy_bleeding:0,fracture:0});
  damage(g,{lhand:0},{lhand:90});g.Math.random=()=>.99;
  const ctx={defender:{kind:'player'},hitPart:'lhand',hitRollSuccess:true,finalDamage:5,damageType:'slash'};
  I.finishAttack(ctx);assert.equal(ctx.injuryOutcomes.length,0); // 5%, not 50% of a surgically reduced maximum.
  g.Math.random=()=>.2;I.finishAttack({...ctx,injuryOutcomes:null,injuriesCommitted:false});assert.equal(active(g,'heavy_bleeding'),false);
});
test('whole-action bleeding roll, independent fracture, dry-run commit and zero-damage exclusion',async()=>{
  const g=await core(),P=g.CombatPipeline;
  P.setConfig({pipelines:{test:{phases:[{handler:'builtin.damage_stub'}]}}});g.Math.random=()=>0;
  const base={attacker:{kind:'enemy'},defender:{kind:'player'},limbId:'rhand',hitPart:'lhand',rawDamage:6,damageType:'slash',hitRollSuccess:true};
  const ctx=P.runPipeline('test',{...base,simultaneousDryRun:true,segments:[{hitRollSuccess:true,hitPart:'lhand',rawDamage:6},{hitRollSuccess:true,hitPart:'lhand',rawDamage:6}]});
  assert.equal(active(g,'bleeding'),false);assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),0);
  assert.deepEqual(copy(ctx.injuryOutcomes).map(i=>i.type),['bleeding']);
  P.finalizeSimultaneousStrike(ctx);assert.equal(active(g,'bleeding'),true);assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),12);
  const saved=copy(g.BuffSystem.getState());P.finalizeSimultaneousStrike(ctx);assert.deepEqual(copy(g.BuffSystem.getState()),saved);
  clear(g,'bleeding');damage(g,{});
  P.runPipeline('test',{...base,rawDamage:30,damageType:'pierce'});
  assert.ok(active(g,'heavy_bleeding'));assert.ok(active(g,'fracture'));
  clear(g,'heavy_bleeding');clear(g,'fracture');
  P.runPipeline('test',{...base,rawDamage:0});assert.equal(g.BuffSystem.getPartInjuries('player','lhand').length,0);
  P.runPipeline('test',{...base,rawDamage:50,hitRollSuccess:false});assert.equal(g.BuffSystem.getPartInjuries('player','lhand').length,0);
});
test('unified defense uses post-conversion, post-defense typed values; full parry prevents injuries',async()=>{
  const g=await core(),P=g.CombatPipeline;
  P.setConfig({pipelines:{test:{phases:[{handler:'builtin.unified_defense'},{handler:'builtin.damage_stub'}]}}});
  g.CharacterAttributes.getEffectiveAttr=()=>10000;g.Math.random=()=>0;
  const ctx={attacker:{kind:'enemy'},defender:{kind:'player'},hitPart:'lhand',rawDamage:50,typedDamage:{pierce:50},hitRollSuccess:true};
  const r=P.runPipeline('test',{...ctx});assert.equal(r.finalDamage,0);assert.equal(r.injuryOutcomes.length,0);
  g.CharacterAttributes.getEffectiveAttr=()=>0;
  const blocked=P.runPipeline('test',{...ctx,damageAfterParry:0});assert.equal(blocked.finalDamage,0);assert.equal(blocked.injuryOutcomes.length,0);
});
test('persistent per-part exclusivity, bleed timing and capped damage redistribution',async()=>{
  const g=await core();assert.equal(injury(g,'heavy_bleeding','chest'),false);
  assert.equal(injury(g,'fracture','head'),false);injury(g,'bleeding');
  advance(g,3);assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),3);
  assert.equal(injury(g,'bleeding'),false);injury(g,'heavy_bleeding');assert.equal(injury(g,'bleeding'),false);
  assert.equal(g.BuffSystem.getPartInjuries('player','lhand').length,1);
  const progress=g.BuffSystem.getState().instancesByOwner.player.find(i=>i.buff_id==='injury_heavy_bleeding').injury_progress;
  assert.equal(progress.elapsed,3);
  damage(g,{lhand:99});advance(g);assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),100);assert.equal(g.CharacterAttributes.getPartDestroy('head'),0);
  advance(g);assert.equal(g.CharacterAttributes.getPartDestroy('head'),1);assert.equal(g.CharacterAttributes.getPartDestroy('chest'),1);
  assert.equal(active(g,'heavy_bleeding','head'),false);
  clear(g,'heavy_bleeding');const old=g.CharacterAttributes.getPartDestroy('lhand');advance(g);assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),old);
});
test('untreated bleeding fills a repaired limb again on the very next tick and can kill through a vital part',async()=>{
  const g=await core();injury(g,'bleeding');damage(g,{lhand:100});
  assert.equal(g.CharacterAttributes.completeMedicalSurgery('lhand',100,50),true);
  assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),49);advance(g);
  assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),50);assert.ok(active(g,'bleeding'));
  clear(g,'bleeding');damage(g,{head:49});injury(g,'bleeding','head');advance(g);assert.equal(g.Survival.isDead(),true);
});
test('fracture and infection pain has its own cap, survives decay, uses strongest proportional analgesic',async()=>{
  const g=await core(),S=g.Survival;S.debugAddPain(100);assert.equal(S.getPainEffective(),25);
  injury(g,'fracture');assert.equal(S.getPainEffective(),50);assert.equal(S.getPainCap(),50);
  injury(g,'wound_infection','chest');assert.equal(S.getPainEffective(),60);assert.equal(S.getPainCap(),60);
  clear(g,'fracture');assert.equal(S.getPainEffective(),35);assert.equal(S.getPainInfo().stored,100);
  S.clearPain();injury(g,'fracture');injury(g,'fracture','rhand');injury(g,'fracture','lfoot');injury(g,'fracture','rfoot');
  assert.equal(S.getPainEffective(),100);assert.equal(g.BuffSystem.hasActionDisabled('player','move'),true);
  g.BuffSystem.registerRuntimeBuffTemplate({buff_id:'test_analgesic',durationTicks:100,maxStacks:1,stacksAddOnApply:1,effects:[{type:'pain_ignore_ratio',params:{ratio:.75}}]});
  g.BuffSystem.applyBuff('player','test_analgesic');assert.equal(S.getPainEffective(),25);
  assert.equal(g.InjurySystem.moveMultiplier('player'),2);assert.equal(g.InjurySystem.parryMultiplier('player','lhand'),.5);
  advance(g,16);assert.equal(g.InjurySystem.pain('player'),110);assert.equal(S.getPainInfo().stored,0);
  clear(g,'wound_infection','chest');assert.equal(g.InjurySystem.pain('player'),100);
});
test('infection first checks after six continuous ticks, upgrade preserves clock, alcohol restarts it, fatigue begins next tick',async()=>{
  const g=await core(),S=g.Survival;injury(g,'bleeding');
  // Force the fixed saved check roll below all configured risks, without replacing world settlement.
  const b=g.BuffSystem.getState().instancesByOwner.player.find(i=>i.buff_id==='injury_bleeding');
  for(let n=0;;n++)if(g.InjurySystem.infectionRoll(String(n),1)<.05){b.injury_progress.seed=String(n);break;}
  advance(g,3);injury(g,'heavy_bleeding');advance(g,2);assert.equal(active(g,'wound_infection'),false);
  const old=S.getState().fatigue;advance(g);assert.ok(active(g,'wound_infection'));assert.equal(S.getState().fatigue,old);
  advance(g);assert.equal(S.getState().fatigue,old+.1);
  const saved=copy(g.BuffSystem.getState());g.BuffSystem.setState(saved);assert.ok(active(g,'wound_infection'));
  clear(g,'wound_infection');const after=S.getState().fatigue;advance(g,5);assert.equal(active(g,'wound_infection'),false);assert.equal(S.getState().fatigue,after);
  clear(g,'heavy_bleeding');injury(g,'bleeding');advance(g,5);assert.equal(active(g,'wound_infection'),false);
});
test('fracture action damage applies once across required limbs; enemy instance pain and bleeding remain isolated',async()=>{
  const g=await core(),I=g.InjurySystem,CE=g.CombatEnemies;injury(g,'fracture');injury(g,'fracture','rhand');
  assert.equal(I.actionMultiplier({attacker:{kind:'player'},limbId:'lhand'},{required_limbs:['rhand']}),.5);
  assert.equal(I.actionMultiplier({attacker:{kind:'player'},limbId:'lfoot'},{}),1);
  const owner=CE.getOwnerId('enemy.street_thug','test',0),other=CE.getOwnerId('enemy.street_thug','test',1);
  injury(g,'fracture','lhand',owner);injury(g,'bleeding','lhand',owner);
  assert.equal(CE.getEnemyPainInfo('test',0).effective,25);assert.equal(CE.getEnemyPainInfo('test',1).effective,0);
  CE.dungeonTurnStatus('test',0,'enemy.street_thug',1);assert.equal(CE.getDungeonState('test',0,'enemy.street_thug').part_destroy.lhand,1);
  CE.dungeonTurnStatus('test',0,'enemy.street_thug',1);assert.equal(CE.getDungeonState('test',0,'enemy.street_thug').part_destroy.lhand,1);
  assert.equal(I.pain(other),0);
});
test('infection dirt bands, independent part clocks, save restore and failed-check retry use the same roll',async()=>{
  for(const [dirty,type,roll,expected] of [[30,'bleeding',.075,false],[31,'bleeding',.075,true],[90,'bleeding',.15,false],[91,'bleeding',.15,true],[30,'heavy_bleeding',.15,false],[31,'heavy_bleeding',.15,true],[90,'heavy_bleeding',.3,false],[91,'heavy_bleeding',.3,true]]){
    const g=await core();g.Survival.setState({dirtyness:dirty});injury(g,type);
    const inst=g.BuffSystem.getState().instancesByOwner.player.find(i=>i.buff_id==='injury_'+type);
    for(let n=0;;n++){const v=g.InjurySystem.infectionRoll(String(n),1);if(v>=roll&&v<roll+.001){inst.injury_progress.seed=String(n);break;}}
    advance(g,5);injury(g,'bleeding','rhand');
    const snap={buffs:copy(g.BuffSystem.getState()),survival:copy(g.Survival.getState()),body:copy(g.CharacterAttributes.getState()),tick:g.GameTime.tick};
    advance(g);assert.equal(active(g,'wound_infection'),expected);assert.equal(active(g,'wound_infection','rhand'),false);
    g.GameTime.tick=snap.tick;g.CharacterAttributes.setState(snap.body);g.Survival.setState(snap.survival);g.BuffSystem.setState(snap.buffs);
    advance(g);assert.equal(active(g,'wound_infection'),expected);
  }
});
test('fractured guard halves final parry and unloading; attacker penalty is applied to actual pipeline damage',async()=>{
  const g=await core(),P=g.CombatPipeline,CE=g.CombatEnemies;
  const defender={kind:'enemy',enemyId:'enemy.street_thug',mapId:'test',index:0,parry_rate:.6,parry_damage_reduce:.4};
  const owner=CE.ownerOf(defender);injury(g,'fracture','lhand',owner);g.Math.random=()=>.99;
  P.setConfig({pipelines:{test:{phases:[{handler:'builtin.parry_enemy_simple'},{handler:'builtin.damage_stub'}]}}});
  const r=P.runPipeline('test',{attacker:{kind:'player'},defender,limbId:'rhand',hitPart:'lhand',rawDamage:10,damageType:'blunt',hitRollSuccess:true});
  assert.equal(r.parryChance,.3);assert.equal(r.unloadRatio,.2);assert.equal(r.finalDamage,8);
  injury(g,'fracture','rhand');
  const a=P.runPipeline('test',{attacker:{kind:'player'},defender,limbId:'rhand',hitPart:'lhand',rawDamage:10,damageType:'blunt',hitRollSuccess:true});
  assert.equal(a.finalDamage,4);
});
test('infection fatigue adds to paid sleep, sleep and surgery do not clear source pain',async()=>{
  const g=await core();injury(g,'wound_infection');injury(g,'fracture');g.Survival.setState({fatigue:80});
  g.Survival.advanceTick({source:'sleep',sleeping:true});
  assert.equal(g.Survival.getState().fatigue,78.1);assert.equal(g.InjurySystem.pain('player'),35);
});
test('weapon defense uses the holding arm rather than the selected weapon component',async()=>{
  const g=await core();for(const f of ['combat-skills','combat-parry'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),g);
  g.CharacterAttributes.getEffectiveAttr=()=>0;
  g.CombatSkills.setConfig({skills:{footwork:{id:'footwork',category:'footwork',parry_success_at_level_1:.4,parry_success_at_max:.4,parry_reduce_at_level_1:.2,parry_reduce_at_max:.2}}});
  g.InventoryEquipment={getState:()=>({}),getSkillLevel:()=>1,getCombatState:()=>({hubs:{footwork:'footwork'}}),getSkillsState:()=>({footwork:{level:1}})};
  let hand='lhand';g.ModularWeaponCombat={selectGuard:()=>({limbId:hand,position:{slot:'side1',blockCoefficient:1,deflectionCoefficient:1}}),guardBonus:()=>({chance:0,unload:0}),unloadBonus:()=>0,finish:()=>{}};
  g.CombatPipeline.setConfig({pipelines:{test:{phases:[{handler:'builtin.parry_player_combat_parry'}]}}});
  injury(g,'fracture','lhand');g.Math.random=()=>.99;
  const run=()=>g.CombatPipeline.runPipeline('test',{attacker:{kind:'enemy'},defender:{kind:'player'},hitPart:'chest',hitRollSuccess:true,rawDamage:10});
  const broken=run();assert.equal(broken.guardLimb,'side1');assert.equal(broken.parryChance,.2);assert.equal(broken.unloadRatio,.1);
  hand='rhand';const healthy=run();assert.equal(healthy.parryChance,.4);assert.equal(healthy.unloadRatio,.2);
});
async function player(h){
  const g=h.g;g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  const input=g.document.getElementById('creation-name');input.value='伤势验收';input.dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();
  g.document.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  g.GameEngine.setState('M0_Base_Inside_lv_1',4,10);g.Survival.setState({stamina:100,energy:100,satiety:100,thirst:100,fatigue:0,isDead:false,isComa:false});
  g.InventoryEquipment.equip('medical_kit',{item_id:'tool_medical_kit_basic',count:1});return g.MedicalKit.equipped().instance_id;
}
for(const svelte of [false,true])test(`formal ${svelte?'Svelte':'native'} treatment, saved infection clocks and failed-save rollback`,async()=>{
  const h=await boot(svelte),g=h.g;
  try{
    const id=await player(h),A=g.MedicalActions;
    const stock=item=>g.InventoryEquipment.setState({...g.InventoryEquipment.getState(),inventory_pocket:[{item_id:item,count:1}]});
    stock('supply_medical_hemostatic_gauze');A.refill(id,'hemostatic_gauze');damage(g,{lhand:50});injury(g,'bleeding');injury(g,'fracture','lfoot');injury(g,'wound_infection','chest');
    assert.equal(g.MedicalKitPanel.openDaily(),true);assert.ok(A.therapyPlan(id,'lhand','trauma_dressing','normal').reason);
    advance(g,4);const tick=g.WorldTick.getWorldTotalTicks(),body=g.CharacterAttributes.getPartDestroy('lhand'),buff=copy(g.BuffSystem.getState());
    stock('supply_medical_trauma_dressing');const save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
    assert.equal(A.refill(id,'trauma_dressing').ok,false);assert.equal(g.WorldTick.getWorldTotalTicks(),tick);assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),body);
    const clock=s=>s.instancesByOwner.player.find(i=>i.buff_id==='injury_bleeding').injury_progress;
    assert.deepEqual(copy(clock(g.BuffSystem.getState())),clock(buff));
    g.SaveSystem.saveNow=save;assert.equal(A.refill(id,'trauma_dressing').ok,true);
    assert.equal(A.treat(id,'lhand','hemostatic_gauze','normal').ok,true);assert.equal(active(g,'bleeding'),false);
    assert.ok(active(g,'fracture','lfoot'));assert.ok(active(g,'wound_infection','chest'));
    const snapshot=g.SaveSystem.buildSnapshotForDebug();g.SaveSystem.applySnapshotForDebug(snapshot);
    assert.ok(active(g,'fracture','lfoot'));assert.ok(active(g,'wound_infection','chest'));
    // Remove injury pain before comparing only the active movement stamina charge.
    clear(g,'wound_infection','chest');clear(g,'fracture','lfoot');g.Survival.clearPain();damage(g,{});
    g.MedicalKitPanel.close();g.GameEngine.setState('M0_Base_Inside_lv_1',6,12);
    const charges=[],consume=g.Survival.consumeStamina;
    g.Survival.consumeStamina=function(amount,opts){if(opts?.source==='movement'||opts?.source==='wait')charges.push({amount,source:opts.source});return consume.apply(this,arguments);};
    const t=g.WorldTick.getWorldTotalTicks();g.SceneMovement.tryMoveTo(7,12,1,0);assert.equal(g.GameEngine.getState().x,7);assert.equal(g.WorldTick.getWorldTotalTicks(),t+1);
    const base=charges.at(-1).amount;injury(g,'fracture','lfoot');g.SceneMovement.tryMoveTo(6,12,-1,0);assert.equal(charges.at(-1).amount,Math.round(base*1.5*100)/100);
    g.SceneMovement.waitInPlace();assert.equal(charges.at(-1).source,'wait');assert.equal(charges.at(-1).amount,base);
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
