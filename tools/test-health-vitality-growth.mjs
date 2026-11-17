import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-game-fixture.mjs';
const copy=v=>JSON.parse(JSON.stringify(v));
const health='survival_health',vitality='survival_vitality';
async function setup(full=false){
  const h=await boot(full),g=h.g;
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  const input=g.document.getElementById('creation-name');input.value='身体成长';input.dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();g.document.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  g.GameEngine.setState('M0_Base_Inside_lv_1',4,10);
  g.Survival.setState({stamina:100,energy:100,satiety:100,thirst:100,fatigue:0,isDead:false,isComa:false});
  g.Math.random=()=>.99;setSkill(g,health,0);setSkill(g,vitality,0);
  return h;
}
function setSkill(g,id,level,exp=0){g.InventoryEquipment.setState({skills:{...g.InventoryEquipment.getState().skills,[id]:{level,study_exp:exp,move_usage:{}}}});}
const exp=(g,id)=>g.InventoryEquipment.getStudyExp(id);
function body(g,damage={}){g.CharacterAttributes.setState({part_destroy:{head:0,chest:0,abdomen:0,lhand:0,rhand:0,lfoot:0,rfoot:0,...damage},surgical_max_loss:{},part_destroy_recover_acc:{head:0,chest:0,abdomen:0,lhand:0,rhand:0,lfoot:0,rfoot:0}});}
function pipe(g){g.CombatPipeline.setConfig({pipelines:{growth:{phases:[{handler:'builtin.damage_stub'}]}}});}
function hit(g,extra={}){return g.CombatPipeline.runPipeline('growth',{attacker:{kind:'enemy'},defender:{kind:'player'},hitPart:'lhand',hitRollSuccess:true,rawDamage:10,damageType:'blunt',...extra});}
function failWrites(g){const old=g.Storage.prototype.setItem;g.Storage.prototype.setItem=()=>{throw Error('quota');};return()=>{g.Storage.prototype.setItem=old;};}

test('vitality counts actual post-defense, clipped and redistributed damage once across segments',async()=>{
  const h=await setup(),g=h.g;
  try{
    pipe(g);body(g);g.InventoryEquipment.addPotential(12345);const potential=g.InventoryEquipment.getPotential();
    hit(g,{rawDamage:70});assert.equal(exp(g,vitality),70);
    body(g,{lhand:98});hit(g,{rawDamage:70});assert.equal(exp(g,vitality),72);
    body(g,{lhand:100});hit(g,{rawDamage:12});assert.equal(exp(g,vitality),84);
    assert.deepEqual(Object.values(copy(g.CharacterAttributes.getState().part_destroy)),[2,2,2,100,2,2,2]);
    body(g);hit(g,{rawDamage:100,damageAfterParry:0});hit(g,{rawDamage:100,hitRollSuccess:false});assert.equal(exp(g,vitality),84);
    hit(g,{rawDamage:100,damageAfterUnifiedDefense:7});assert.equal(exp(g,vitality),91);
    hit(g,{attacker:{kind:'player'},rawDamage:10});g.CharacterAttributes.applyCombatDestroy('lhand',5);assert.equal(exp(g,vitality),91);
    body(g);const ctx=hit(g,{segments:[{hitPart:'lhand',rawDamage:8,hitRollSuccess:true},{hitPart:'rhand',rawDamage:7,hitRollSuccess:true}]});
    assert.equal(exp(g,vitality),106);g.SurvivalSkills.completeAttackExperience(ctx);assert.equal(exp(g,vitality),106);
    assert.equal(g.InventoryEquipment.getPotential(),potential);assert.equal(exp(g,health),0);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
test('same-speed precomputation awards only at commit; fatal last segment gives no reward for the entire attack',async()=>{
  const h=await setup(),g=h.g;
  try{
    pipe(g);body(g);
    const ctx=hit(g,{simultaneousDryRun:true,segments:[{rawDamage:4,hitRollSuccess:true},{rawDamage:6,hitRollSuccess:true}]});
    assert.equal(exp(g,vitality),0);assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),0);
    g.CombatPipeline.finalizeSimultaneousStrike(ctx);assert.equal(exp(g,vitality),10);
    g.CombatPipeline.finalizeSimultaneousStrike(ctx);assert.equal(exp(g,vitality),10);
    body(g,{head:49});hit(g,{segments:[{hitPart:'rhand',rawDamage:8,hitRollSuccess:true},{hitPart:'head',rawDamage:1,hitRollSuccess:true}]});
    assert.equal(g.Survival.isDead(),true);assert.equal(exp(g,vitality),10);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
test('health counts only eligible natural rest recovery; drugs, dressings, surgery, sleep and bleeding do not award body XP',async()=>{
  const h=await setup(),g=h.g,C=g.CharacterAttributes;
  try{
    body(g,{lhand:34,rhand:35,lfoot:20,rfoot:100,head:1});g.InjurySystem.apply('player','lfoot','fracture');
    C.onWorldTickDestroyRecover();assert.equal(exp(g,health),0);
    g.Survival.setResting(true);let healed=0;
    for(let i=0;i<4;i++)healed+=C.onWorldTickDestroyRecover();
    assert.equal(exp(g,health),healed);assert.equal(healed,3);assert.equal(C.getPartDestroy('rhand'),35);assert.equal(C.getPartDestroy('lfoot'),20);assert.equal(C.getPartDestroy('rfoot'),100);
    const xp=exp(g,health);C.recoverPartDestroy('rhand',2);C.applyMedicalRecovery('lhand',10);C.completeMedicalSurgery('rfoot',100,50);C.recoverSurgicalMaxAfterSleep();
    for(let i=0;i<4;i++)C.onWorldTickDestroyRecover({source:'sleep'});assert.equal(exp(g,health),xp);
    g.Survival.setResting(false);g.InjurySystem.apply('player','rhand','bleeding');
    for(let i=0;i<3;i++)g.Survival.advanceTick();assert.equal(exp(g,vitality),0);assert.equal(exp(g,health),xp);
    body(g);g.Survival.setResting(true);for(let i=0;i<6;i++)C.onWorldTickDestroyRecover();assert.equal(exp(g,health),xp);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
test('collision damage is excluded, and a fatal deferred collision suppresses the whole attack reward',async()=>{
  const h=await setup(),g=h.g,C=g.CharacterAttributes;
  try{
    pipe(g);body(g);const pos=g.GameEngine.getState();g.GameEngine.isWalkable=()=>false;
    const attack={rawDamage:10,attacker:{kind:'enemy',pos:{x:pos.x+1,y:pos.y}},defender:{kind:'player',pos:{x:pos.x,y:pos.y}},moveTemplate:{on_parry_failed_displace_target:{cells:1}}};
    hit(g,attack);assert.equal(C.getPartDestroy('lhand'),13);assert.equal(exp(g,vitality),10);
    body(g,{head:39});g.InventoryEquipment.setPlayerStunValue(0);
    const ctx=hit(g,{...attack,hitPart:'head',simultaneousDryRun:true});g.CombatPipeline.finalizeSimultaneousStrike(ctx);
    assert.equal(C.getPartDestroy('head'),49);assert.equal(exp(g,vitality),10);
    g.CombatWorld.flushDisplacements();assert.equal(g.Survival.isDead(),true);assert.equal(exp(g,vitality),10);
    g.CombatWorld.flushDisplacements();assert.equal(exp(g,vitality),10);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
test('a full player exchange rolls back world time, resources, body and counterattack experience on failed save',async()=>{
  const h=await setup(),g=h.g,I=g.InventoryEquipment,C=g.CharacterAttributes;
  try{
    body(g);const pos=g.GameEngine.getState(),map=g.GameEngine.getMap();map.enemies.push({enemy_id:'growth_counter',x:pos.x+1,y:pos.y});
    g.CombatEnemies.setTable({enemies:{growth_counter:{speed:10,parry_rate:0,can_attack:true,limbs_invulnerable:true,actions:[{id:'hit',limb:'rhand',power_min:10,power_max:10,damage_type:'blunt',qi_cost:0,hit_part_weights:{lhand:1}}]}}});
    // A roll above baseline parry but below hit chance exercises real damage in the complete pipeline.
    g.Math.random=()=>.5;C.getCombatSpeed=()=>10;C.getEffectiveAttr=()=>0;
    const attack=()=>g.SceneCtx.actions.attackEnemy('growth_counter',{x:pos.x+1,y:pos.y,fromX:pos.x,fromY:pos.y});
    const before=copy(g.SaveSystem.buildSnapshotForDebug()),repair=failWrites(g);attack();repair();
    assert.equal(g.WorldTick.getWorldTotalTicks(),before.time.totalTicks);assert.equal(exp(g,vitality),0);
    assert.deepEqual(copy(C.getState().part_destroy),before.player.characterAttributes.part_destroy);
    for(const key of ['qi_li_current','diqi_current','stamina'])assert.equal(g.Survival.getState()[key],before.player.survival[key]);
    attack();assert.ok(exp(g,vitality)>0);assert.equal(g.WorldTick.getWorldTotalTicks(),before.time.totalTicks+1);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
for(const full of [false,true]){
  test(`${full?'Svelte':'native'} rest: real ticks, stop/resume, load and failed storage preserve exact body/XP progress`,async()=>{
    const h=await setup(full),g=h.g,I=g.InventoryEquipment,C=g.CharacterAttributes,S=g.Survival;
    try{
      body(g,{lhand:2,rhand:2});setSkill(g,health,0,4999);I.addPotential(500);const potential=I.getPotential();
      g.PlayerActions.setRestingActionActive(true,{showMsg:false});S.advanceTick();assert.equal(exp(g,health),4999);
      const tick=g.WorldTick.getWorldTotalTicks(),before=copy(C.getState()),resources=copy(S.getState());
      const repair=failWrites(g);S.advanceTick();repair();
      assert.equal(g.WorldTick.getWorldTotalTicks(),tick);assert.deepEqual(copy(C.getState()),before);assert.equal(exp(g,health),4999);assert.equal(I.getSkillLevel(health),0);
      assert.equal(S.getState().isResting,false);for(const k of ['satiety','thirst','stamina','fatigue'])assert.equal(S.getState()[k],resources[k]);
      g.PlayerActions.setRestingActionActive(true,{showMsg:false});S.advanceTick();g.PlayerActions.setRestingActionActive(false,{showMsg:false});
      assert.equal(I.getSkillLevel(health),1);assert.equal(exp(g,health),1);assert.equal(C.getPartDestroy('lhand'),1);assert.equal(I.getPotential(),potential);
      const snapshot=copy(g.SaveSystem.buildSnapshotForDebug());assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot),true);await h.drain();
      assert.equal(exp(g,health),1);S.advanceTick();assert.equal(exp(g,health),1);
      g.PlayerActions.setRestingActionActive(true,{showMsg:false});S.advanceTick();S.advanceTick();g.PlayerActions.setRestingActionActive(false,{showMsg:false});assert.equal(exp(g,health),3);
      body(g,{lhand:1});g.PlayerActions.setRestingActionActive(true,{showMsg:false});S.advanceTick();S.advanceTick();g.PlayerActions.setRestingActionActive(false,{showMsg:false});assert.equal(exp(g,health),4,'no sleep quota');
      assert.deepEqual(h.errors,[]);
    }finally{await h.close();}
  });
  test(`${full?'Svelte':'native'} real enemy attacks save damage and XP together, restore on failure and stop at level 100`,async()=>{
    const h=await setup(full),g=h.g,I=g.InventoryEquipment,C=g.CharacterAttributes;
    try{
      body(g);const map=g.GameEngine.getMap(),p=g.GameEngine.getState();map.enemies.push({enemy_id:'growth_enemy',x:p.x+1,y:p.y});
      g.CombatEnemies.setTable({enemies:{growth_enemy:{speed:10,parry_rate:0,can_attack:true,actions:[{id:'hit',limb:'rhand',power_min:10,power_max:10,damage_type:'blunt',qi_cost:0,hit_part_weights:{lhand:1}}]}}});
      g.Math.random=()=>.01;
      // Control accuracy/mitigation only; actual enemy action, resources, damage, growth and save remain real.
      C.getEffectiveAttr=()=>0;C.getParryChance=()=>0;I.setPlayerStunValue(0);
      g.CombatPipeline.setConfig({pipelines:{melee_hit_player_defender:{phases:[{handler:'builtin.damage_stub'}]}}});
      const attack=()=>g.CombatWorld.runEnemyAttackOnPlayer('growth_enemy',p.x+1,p.y);
      const repair=failWrites(g);attack();repair();assert.equal(C.getPartDestroy('lhand'),0);assert.equal(exp(g,vitality),0);
      attack();const actual=C.getPartDestroy('lhand');assert.ok(actual>0);assert.equal(exp(g,vitality),actual);
      const saved=copy(g.SaveSystem.buildSnapshotForDebug());assert.equal(g.SaveSystem.applySnapshotForDebug(saved),true);await h.drain();assert.equal(exp(g,vitality),actual);
      g.BuffSystem.clearPartInjury('player','lhand','bleeding');g.BuffSystem.clearPartInjury('player','lhand','heavy_bleeding');g.BuffSystem.clearPartInjury('player','lhand','fracture');
      body(g);setSkill(g,vitality,99,4999);attack();assert.equal(I.getSkillLevel(vitality),100);assert.equal(exp(g,vitality),0);
      body(g);attack();assert.equal(exp(g,vitality),0);assert.equal(g.Survival.startStudy(vitality).reason,'max_level');
      setSkill(g,health,1000,9999);assert.equal(I.getSkillLevel(health),100);assert.equal(exp(g,health),0);
      g.SceneApp.panelApi.addSkill(health,1,{});assert.equal(I.getSkillLevel(health),100);
      assert.deepEqual(h.errors,[]);
    }finally{await h.close();}
  });
}
