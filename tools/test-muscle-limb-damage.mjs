import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v));
const read=p=>fs.readFileSync(p,'utf8');
const data=JSON.parse(read('data/muscles.json'));
const feet=side=>data.muscles.filter(m=>m.group==='foot_'+side);
const hands=side=>data.muscles.filter(m=>m.group==='hand_'+side);
const lit=list=>Object.fromEntries(list.map(m=>[m.id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function context(){
 const g=vm.createContext({fetch:async()=>({ok:true,json:async()=>copy(data)})});g.window=g;
 vm.runInContext(read('js/muscles.js'),g);await g.Muscles.ready;return g;
}

test('each foot muscle replaces dexterity with 1% for its own leg, derived once from lit records',async()=>{
 const g=await context(),M=g.Muscles;
 for(const side of ['l','r']){
  const limb=side==='l'?'lfoot':'rfoot',other=side==='l'?'rfoot':'lfoot';
  assert.equal(feet(side).length,20);
  for(const m of feet(side)){
   assert.deepEqual(m.effects,[{type:'limbSkillDamagePercent',delta:1,limb}]);
   M.setState({progress:{[m.id]:99.999}});near(M.getSkillDamageBonusForLimb(limb),0);
   M.addGrowth(m.id,.001);near(M.getSkillDamageBonusForLimb(limb),.01);near(M.getSkillDamageBonusForLimb(other),0);
   assert.equal(M.getStatBonus().acquired.dexterity,0);
   assert.equal(M.getEffectsText(m.id),(side==='l'?'左腿':'右腿')+'技能伤害+1%');
   for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(m.id,1);near(M.getSkillDamageBonusForLimb(limb),.01);}
  }
 }
 M.setState({unlocked:lit([...feet('l'),...feet('r')])});
 assert.deepEqual(copy(M.getStatBonus().skillDamagePercent),{lhand:0,rhand:0,lfoot:20,rfoot:20});
 assert.equal(M.getStatBonus().acquired.dexterity,0);
 const all=data.muscles;M.setState({unlocked:lit(all)});assert.equal(M.getStatBonus().acquired.dexterity,0);
 M.setState({unlocked:{not_a_muscle:true}});near(M.getSkillDamageBonusForLimb('lfoot'),0);
 M.setState({unlocked:lit(feet('l'))});near(M.getSkillDamageBonusForLimb('weapon_left'),0);
 M.setState({});near(M.getSkillDamageBonusForLimb('lfoot'),0);
});

test('each complete foot grants exactly five flat attack speed only to its own limb',async()=>{
 const g=await context(),M=g.Muscles;
 for(const side of ['l','r'])for(const missing of feet(side)){
  const unlocked=lit([...feet('l'),...feet('r')]);delete unlocked[missing.id];
  M.setState({unlocked,progress:{[missing.id]:99.999}});
  assert.equal(M.getAttackSpeedBonusForLimb(side==='l'?'lfoot':'rfoot'),0,missing.id);
  assert.equal(M.getAttackSpeedBonusForLimb(side==='l'?'rfoot':'lfoot'),5);
  M.addGrowth(missing.id,.001);assert.deepEqual(copy(M.getStatBonus().attackSpeedFlat),{lhand:0,rhand:0,lfoot:5,rfoot:5});
 }
 for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(feet('l')[0].id,1);assert.equal(M.getAttackSpeedBonusForLimb('lfoot'),5);}
 M.setState({unlocked:lit(feet('l'))});
 vm.runInContext(read('js/combat-initiative.js'),g);const CI=g.CombatInitiative;
 g.CharacterAttributes={getCombatSpeed:(pct=0)=>10+pct/10};
 const plan=(limbId,enemySpeed=12,extra={})=>CI.resolvePlayerInitiatedExchange({playerSpeed:10,enemySpeed,limbId,...extra});
 assert.equal(plan('lfoot').playerSpeed,15);assert.equal(plan('lfoot').firstStrike,'player');
 assert.equal(plan('rfoot').playerSpeed,10);assert.equal(plan('rfoot').firstStrike,'enemy');
 assert.equal(plan('lfoot',15).mode,'simultaneous');
 for(const limb of ['lhand','rhand'])assert.equal(plan(limb).playerSpeed,10);
 assert.equal(plan('lfoot',12,{weaponId:'test_weapon'}).playerSpeed,10);
 assert.equal(CI.effectiveSpeed('player',10),10,'global/defensive speed stays unchanged');
 g.BuffSystem={getBattleMoveSpeedMultiplier:()=>.5,getBattleMoveSpeedDeltaPercent:()=>-10};
 assert.equal(plan('lfoot').playerBaseSpeed,4);assert.equal(plan('lfoot').playerSpeed,9,'+5 is flat after shared speed modifiers');
 assert.equal(CI.playerAttackSpeed(plan('lfoot').playerBaseSpeed,{limbId:'rfoot'}),4,'a follow-up on the other leg cannot inherit +5');
 const copyReward=M.getGroupCompletionEffects('foot_l');copyReward[0].delta=999;
 assert.equal(M.getGroupCompletionEffects('foot_l')[0].delta,5);
 M.setState({});assert.equal(M.getAttackSpeedBonusForLimb('lfoot'),0);
});

test('real attack and defense pipeline keeps left/right growth separate, additive and stable across segments/deferred commits',async()=>{
 const g=await context(),M=g.Muscles;
 for(const name of ['combat-damage','combat-skills','combat-initiative','combat-melee-resolve','combat-pipeline'])vm.runInContext(read('js/'+name+'.js'),g);
 const D=g.CombatDamage,R=g.CombatMeleeResolve,P=g.CombatPipeline;
 P.setConfig(JSON.parse(read('data/combat-pipeline.json')));
 let state={qi_li_current:100,diqi_current:1000,diqi_max_effective:100},exp=1;
 g.Survival={isDead:()=>false,getState:()=>state,getQiLiMax:()=>100,
  consumeDiqi:n=>{state.diqi_current-=n;return n;},consumeQiLi:n=>{state.qi_li_current-=n;return n;}};
 g.CharacterAttributes={getFistBasePower:()=>100,getInnateAttr:()=>20,getCombatSpeed:()=>10,getHitRate:()=>1,
  getEffectiveAttr:()=>0,getDamageTypeModifier:()=>1,getDominantLimbMultiplier:()=>1};
 g.InventoryEquipment={getSkillLevel:()=>1,getSkillsState:()=>({}),getCombatState:()=>({hubs:{}}),getCombatExperienceDamageMultiplier:()=>exp};
 g.CombatEnemies={onEnemyDamageResolved:()=>{},getById:()=>({}),isEnemyDead:()=>false};
 const move={id:'hit',unlock_level:1,move_power_multiplier:1,damage_type:'blunt',hit_part_weights:{chest:1},hit_segments:1,
  diqi_cost:{ratio_of_diqi_max_at_10_power:.1,min:1,max:50}};
 const skill={id:'test',category:'unarmed',primary_attribute:'jingu',innate_damage_baseline:20,moves:[move]};
 g.CombatSkills.setConfig({constants:{},skills:{test:skill}});
 const resolve=(limb,extra={})=>R.resolvePlayerVsEnemyAttack({skillId:'test',moveId:'hit',limbId:limb,powerLevel:10,...extra});
 const strike=(r,dry=false)=>{const ctx={...r,resourceResult:r,attacker:{kind:'player',postEffectIds:[]},defender:{kind:'enemy',enemyId:'target'},simultaneousDryRun:dry};P.runPipeline('melee_hit_enemy_defender',ctx);return ctx;};
 M.setState({unlocked:lit(feet('l'))});
 near(resolve('lfoot').rawDamage,120);near(resolve('rfoot').rawDamage,100);
 near(resolve('lhand').rawDamage,100);near(resolve('rhand').rawDamage,100);
 M.setState({unlocked:lit([...feet('l'),...feet('r').slice(0,3)])});
 near(resolve('lfoot').rawDamage,120);near(resolve('rfoot').rawDamage,103);
 exp=1.5;near(resolve('lfoot').rawDamage,170);near(resolve('rfoot').rawDamage,153);exp=1;
 // A reused form or hit target does not select the reward side: the equipped attacking limb does.
 move.hit_part_weights={right_leg:1};near(resolve('lfoot',{metaSource:{key:'repeat'}}).muscleDamageBonus,.2);
 move.damage_type_effects={add_flat:{pierce:10}};move.hit_segments=2;
 for(const dry of [false,true]){
  state.diqi_current=1000;
  const r=resolve('lfoot',{deferResourceSpend:dry});near(r.rawDamage,130);near(r.muscleDamageBonus,.2);
  if(dry)assert.equal(state.diqi_current,1000);
  // The resolved attack snapshot is reused; later muscle changes cannot charge or apply it twice.
  M.setState({});const ctx=strike(r,dry);assert.equal(ctx.finalDamage,260);
  if(dry){P.finalizeSimultaneousStrike(ctx);R.applyDeferredResourceSpendFromResolveResult(r);R.applyDeferredResourceSpendFromResolveResult(r);}
  assert.equal(state.diqi_current,990);
  M.setState({unlocked:lit([...feet('l'),...feet('r').slice(0,3)])});
 }
 const handState={unlocked:lit([...hands('l'),...hands('r').slice(0,3),...feet('l')])};
 M.setState(handState);move.hit_segments=1;move.damage_type_effects=null;
 near(resolve('lhand').rawDamage,119);near(resolve('rhand').rawDamage,103);near(resolve('lfoot').rawDamage,120);near(resolve('rfoot').rawDamage,100);
 exp=1.5;near(resolve('lhand').rawDamage,169);near(resolve('rhand').rawDamage,153);exp=1;
 move.hit_part_weights={right_leg:1};move.damage_type_effects={add_flat:{pierce:10}};move.hit_segments=2;
 for(const dry of [false,true]){
  state.diqi_current=1000;const r=resolve('lhand',{deferResourceSpend:dry});near(r.rawDamage,129);near(r.muscleDamageBonus,.19);
  M.setState({});const ctx=strike(r,dry);assert.equal(ctx.finalDamage,258);
  if(dry){P.finalizeSimultaneousStrike(ctx);R.applyDeferredResourceSpendFromResolveResult(r);R.applyDeferredResourceSpendFromResolveResult(r);}
  assert.equal(state.diqi_current,990);M.setState(handState);
 }
 state.diqi_current=0;assert.equal(strike(resolve('lhand')).finalDamage,0,'hand growth never bypasses insufficient resources');
 assert.equal(strike(resolve('lfoot')).finalDamage,0,'foot growth never bypasses insufficient resources');
 move.hit_segments=1;move.damage_type_effects=null;state.diqi_current=1000;
 const enemy=R.resolveEnemyVsPlayerAttack({enemyId:'target',plannedAction:{id:'kick',limb:'lfoot',power_min:100,power_max:100}});
 near(enemy.rawDamage,100);
 // Independent weapon-slot attacks do not borrow a leg's growth even if given the same limb hint.
 g.ModularWeaponCombat={prepareAttack:()=>({move,power:100,hitBonus:0,damageBonus:0}),diqiCost:()=>null};
 near(resolve('lfoot',{weaponIntent:{}}).muscleDamageBonus,0);
 near(resolve('lhand',{weaponIntent:{}}).muscleDamageBonus,0);
 near(D.attack({base:100,muscleBonus:.2,experienceBonus:.5,move:1,power:1,breath:1}),170);
});

for(const full of [false,true])test(`foot rewards ${full?'Svelte':'classic'}: training rollback, saved bonus and per-side UI`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  d.getElementById('creation-name').value='脚部成长';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,G=g.GymSystem,S=g.Survival,SS=g.SaveSystem,IE=g.InventoryEquipment,CA=g.CharacterAttributes;
  IE.getState().skills.special_meridian_studies={level:1};
  const a=g.GymData.ACTIONS.find(a=>a.main.some(id=>id===feet('l')[0].id));assert.ok(a);
  const initial=copy(G.getState());initial.levels[a.station]=1;initial.levels.handsfeet_toes=1;G.restore(initial,true);
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);
  // Use the facility's real adjacent access check, without entering the sealed doorway.
  let found=false;for(let y=0;y<10&&!found;y++)for(let x=0;x<9&&!found;x++)if(g.GameEngine.isWalkable(x,y)){g.GameEngine.setState('M0_Base_Inside_lv_1',x,y);found=G.at(a.station);}
  assert.ok(found);
  const target=feet('l')[0].id;
  const beforeComplete=lit(feet('l'));delete beforeComplete[target];
  M.setState({unlocked:beforeComplete,progress:{[target]:99.999}});CA.recalcCharacterStats();const dex=CA.getState().acquired.dexterity;
  const baseSpeed=CA.getCombatSpeed();assert.equal(M.getAttackSpeedBonusForLimb('lfoot'),0);
  S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20,isDead:false,isComa:false});
  let serial=95000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
  g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++serial,fn),serial):oldSet(fn,ms,...args);
  g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
  const step=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  assert.equal(G.startTraining(a.id).ok,true);step();const before=copy(M.getState()),save=SS.saveNow;
  SS.saveNow=()=>false;step();SS.saveNow=save;assert.deepEqual(copy(M.getState()),before);near(M.getSkillDamageBonusForLimb('lfoot'),.19);assert.equal(M.getAttackSpeedBonusForLimb('lfoot'),0);
  G.retry();step();near(M.getSkillDamageBonusForLimb('lfoot'),.2);near(M.getSkillDamageBonusForLimb('rfoot'),0);
  assert.equal(M.getAttackSpeedBonusForLimb('lfoot'),5);assert.equal(M.getAttackSpeedBonusForLimb('rfoot'),0);assert.equal(CA.getCombatSpeed(),baseSpeed);
  assert.equal(CA.getState().acquired.dexterity,dex);
  const saved=copy(SS.buildSnapshotForDebug());for(let i=0;i<2;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();near(M.getSkillDamageBonusForLimb('lfoot'),.2);assert.equal(M.getAttackSpeedBonusForLimb('lfoot'),5);}
  const old=copy(saved);old.muscles={unlocked:lit([...feet('l'),...feet('r').slice(0,3)]),equipped:{}};
  assert.equal(SS.applySnapshotForDebug(old),true);await h.drain();near(M.getSkillDamageBonusForLimb('lfoot'),.2);near(M.getSkillDamageBonusForLimb('rfoot'),.03);
  g.GymPanel.close();await openMuscleRewards(h);
  const summary=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');
  assert.ok(summary.includes('左腿技能伤害+20%'),summary);assert.ok(summary.includes('右腿技能伤害+3%'),summary);
  assert.ok(summary.includes('左腿出招速度+5'),summary);assert.equal(summary.includes('右腿出招速度'),false);
  for(const [limb,group,name]of [['lfoot','foot_l','左腿'],['rfoot','foot_r','右腿']]){
   const groupView=await readMuscleGroup(h,group);
   const details=groupView.text;assert.ok(details.includes(name+'技能伤害+1%'),details);assert.equal(details.includes('后天身手'),false);
   const reward=completionText(g,groupView.id);
   assert.ok(reward.includes(name+'出招速度+5'),reward);assert.ok(reward.includes(limb==='lfoot'?'已解锁':'未解锁'),reward);

  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('formal exchanges use the equipped limb for initiative/hit speed, keeping enemy defense and other limbs unchanged',async()=>{
 const h=await boot(false),g=h.g,I=g.InventoryEquipment,CA=g.CharacterAttributes;
 try{
  CA.setState({character_creation_completed:true,innate:{jingu:20,flexibility:20,breath:20,dexterity:20,focus:20}});
  const base=copy(g.CombatSkills.getSkill('combat_basic_unarmed'));
  const sk={...base,id:'test_limb_speed',slots_unlock_by_level:[{level:1,slots:2}],moves:[{...base.moves[0],id:'test_hit',name:'出招速度测试',required_limb_tags:[],action_tags:[],hit_segments:1,unlock_level:1,diqi_cost:null}]};
  g.CombatSkills.getSkills()[sk.id]=sk;I.getSkillsState()[sk.id]={level:50,move_usage:{}};
  const limbs=['lhand','rhand','lfoot','rfoot'];
  I.setCombatState({limbs:Object.fromEntries(limbs.map(id=>[id,{active:sk.id}])),move_sequences:Object.fromEntries(limbs.map(id=>[id,['test_hit']]))});
  const p=g.GameEngine.getState(),map=g.GameEngine.getMap(),enemy={enemy_id:'test_speed_target',x:p.x+1,y:p.y};map.enemies.push(enemy);
  g.CombatEnemies.setTable({enemies:{test_speed_target:{speed:12,parry_rate:0,can_attack:true,limbs_invulnerable:true,actions:[{id:'counter',limb:'rhand',power_min:0,power_max:0,damage_type:'blunt',qi_cost:0,hit_part_weights:{chest:1}}]}}});
  CA.getCombatSpeed=(pct=0)=>10+pct/10;g.Math.random=()=>.2;
  g.Muscles.setState({unlocked:lit(feet('l'))});
  const events=[],plans=[],run=g.CombatPipeline.runPipeline,plan=g.CombatInitiative.resolvePlayerInitiatedExchange;
  g.CombatPipeline.runPipeline=(name,ctx)=>{const result=run(name,ctx);events.push(result);return result;};
  g.CombatInitiative.resolvePlayerInitiatedExchange=o=>{const result=plan(o);plans.push(result);return result;};
  function attack(limb){
   events.length=0;I.setPlayerStunValue(0);g.Survival.setState({isDead:false,isComa:false,stamina:100,fatigue:0,qi_li_current:100,diqi_current:1000});
   g.SceneCtx.actions.attackEnemy(enemy.enemy_id,{x:enemy.x,y:enemy.y,fromX:p.x,fromY:p.y,skill_id:sk.id,move_id:'test_hit',limb_id:limb});
   const player=events.find(e=>e.attacker.kind==='player'),counter=events.find(e=>e.attacker.kind==='enemy');assert.ok(player);assert.ok(counter);
   assert.equal(counter.resourceResult.defenderSpeed,10,'no global defense speed from the foot reward');
   return {player,first:events[0].attacker.kind,plan:plans.at(-1)};
  }
  let r=attack('lfoot');assert.equal(r.first,'player');assert.equal(r.player.resourceResult.attackerSpeed,15);assert.equal(r.plan.playerSpeed,15);
  r=attack('rfoot');assert.equal(r.first,'enemy');assert.equal(r.player.resourceResult.attackerSpeed,10);
  r=attack('lhand');assert.equal(r.first,'enemy');assert.equal(r.player.resourceResult.attackerSpeed,10);
  g.CombatEnemies.getById(enemy.enemy_id).speed=15;r=attack('lfoot');assert.equal(r.plan.mode,'simultaneous');assert.equal(r.player.resourceResult.attackerSpeed,15);
  g.Muscles.setState({unlocked:lit([...feet('l'),...feet('r')])});r=attack('rfoot');assert.equal(r.player.resourceResult.attackerSpeed,15,'both feet never turn either leg into +10');
  g.Muscles.setState({unlocked:lit([...feet('l'),...data.muscles.filter(m=>m.group==='calf_l')])});
  r=attack('lfoot');near(r.player.resourceResult.attackerSpeed,15.65);assert.equal(r.first,'player');
  r=attack('rfoot');near(r.player.resourceResult.attackerSpeed,10);assert.equal(r.first,'enemy');
  g.CombatEnemies.getById(enemy.enemy_id).speed=15.65;r=attack('lfoot');assert.equal(r.plan.mode,'simultaneous');near(r.player.resourceResult.attackerSpeed,15.65);
  g.Muscles.setState({unlocked:lit([...feet('l'),...feet('r'),...data.muscles.filter(m=>/^calf_/.test(m.group))])});
  r=attack('rfoot');near(r.player.resourceResult.attackerSpeed,15.65);assert.equal(r.plan.mode,'simultaneous');
  g.Muscles.setState({unlocked:lit(hands('l'))});g.CombatEnemies.getById(enemy.enemy_id).speed=12;
  r=attack('lhand');assert.equal(r.first,'player');assert.equal(r.player.resourceResult.attackerSpeed,15);
  r=attack('rhand');assert.equal(r.first,'enemy');assert.equal(r.player.resourceResult.attackerSpeed,10);
  r=attack('lfoot');assert.equal(r.first,'enemy');assert.equal(r.player.resourceResult.attackerSpeed,10);
  g.CombatEnemies.getById(enemy.enemy_id).speed=15;r=attack('lhand');assert.equal(r.plan.mode,'simultaneous');assert.equal(r.player.resourceResult.attackerSpeed,15);
  g.Muscles.setState({unlocked:lit([...hands('l'),...hands('r'),...feet('l'),...feet('r')])});
  r=attack('rhand');assert.equal(r.player.resourceResult.attackerSpeed,15);assert.equal(r.plan.mode,'simultaneous');
  assert.equal(CA.getCombatSpeed(),10);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
