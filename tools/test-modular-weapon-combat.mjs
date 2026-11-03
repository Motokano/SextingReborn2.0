import assert from 'node:assert/strict';
import {boot} from './ui-game-fixture.mjs';
const h=await boot(true),g=h.g,I=g.InventoryEquipment,W=g.ModularWeaponCombat,C=g.ForgingConfig;
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
let serial=0;
function part(design,trait=null){
 const b=Object.values(C.components).find(x=>x.designId===design);assert(b,design);
 return {item_id:b.itemId,instance_id:'test_part_'+(++serial),count:1,forged_component:{version:1,design_id:design,recipe:{},completion:100,
  final_weight_kg:b.baseline.weightKg,final_innate_strength:10,final_position_powers:b.positions.map(p=>({...p,power:p.basePower})),
  durability_max:100,durability_current:100,durability_max_units:10000,durability_units:10000,contact_loss:{ordinary:1,blocked:2},ore_trait:trait,zero_durability_result:null}};
}
function weapon(front='T01',side1='B01',side2='B01',hilt='H01'){
 const w={item_id:W.ROOT,instance_id:'test_weapon_'+(++serial),count:1,connections:{}};
 for(const [slot,id] of Object.entries({front,side1,side2,hilt}))if(id)w.connections[slot]={connection_schema_version:1,part:part(id)};
 return w;
}
function equip(w,slot='weapon_right'){
 I.unequip('weapon_left');I.unequip('weapon_right');assert.equal(I.equip(slot,w).success,true);return W.equipped().item;
}
const realCA=g.CharacterAttributes;
let destroyed=false;
const surv={qi_li_current:1000,diqi_current:1000,diqi_max_effective:100,tickCount:0};
const realSurv=g.Survival;
function refuel(){surv.qi_li_current=1000;surv.diqi_current=1000;}
function attack(slot,repeatIndex=0,dry=false,forceHit=true,def={}){
 const a=W.active(),i={...W.intent(),weaponPosition:slot,moveId:a.coverage.positions[slot].position.fallbackMoveId};
 const r=g.CombatMeleeResolve.resolvePlayerVsEnemyAttack({skillId:W.SKILL,moveId:i.moveId,limbId:i.limbId,weaponIntent:i,repeatIndex,defenderSpeed:1,deferResourceSpend:dry});
 if(forceHit!==null)r.hitRollSuccess=forceHit;
 const ctx={...r,resourceResult:r,attacker:{kind:'player',postEffectIds:[]},defender:{kind:'enemy',enemyId:'test_dummy',parry_rate:0,parry_damage_reduce:0,...def},simultaneousDryRun:dry};
 g.CombatPipeline.runPipeline('melee_hit_enemy_defender',ctx);return ctx;
}
function defend(hit=true,dry=false){
 const ctx={hitRollSuccess:hit,hitPart:'chest',rawDamage:1,damageType:'blunt',attacker:{kind:'enemy',enemyId:'test_dummy'},defender:{kind:'player'},simultaneousDryRun:dry};
 g.CombatPipeline.runPipeline('melee_hit_player_defender',ctx);return ctx;
}
try{
 // Keep real inventory, skills, buffs, pipeline and save system. Isolate world health for arithmetic tests.
 g.CharacterAttributes={...realCA,canUseWeapon:()=>true,getWeaponThresholdAndBonus:()=>({canUse:true,M_threshold:1}),getEffectiveAttr:()=>0,
  isBodyPartDestroyedForParry:()=>destroyed,getCombatSpeed:()=>1,getHitRate:()=>.8,getDamageTypeModifier:()=>1,getDominantLimbMultiplier:()=>1,
  applyCombatDestroy:()=>{},grantAttributeExp:()=>{},getInnateAttr:()=>900};
 g.Survival={...realSurv,getState:()=>surv,getQiLiMax:()=>1000,getDiqiShieldRemaining:()=>0,setDiqiShieldRemaining:()=>{},
  consumeQiLi:n=>{surv.qi_li_current-=n;return n;},consumeDiqi:n=>{const v=Math.min(n,surv.diqi_current);surv.diqi_current-=v;return v;},drainQiLi:()=>{surv.qi_li_current=0;}};
 g.CombatEnemies={...g.CombatEnemies,onEnemyDamageResolved:()=>{},getShieldRemaining:()=>0,setShieldRemaining:()=>{},isEnemyDead:()=>false};
 g.CombatWorld={...g.CombatWorld,checkAttackDistance:()=>{},queueDisplacement:()=>{},flushDisplacements:()=>{}};
 const random=g.Math.random;g.Math.random=()=>.1;
 I.getSkillsState().combat_basic_footwork={level:1,move_usage:{}};
 I.getSkillsState().combat_basic_breath={level:1,move_usage:{}};
 I.setCombatState({hubs:{footwork:'combat_basic_footwork',breath:'combat_basic_breath'}});
 let w=weapon();delete w.connections.front;
 assert.equal(W.validateEquip(w,'weapon_right').success,false,'no incomplete weapons');
 w=equip(weapon());assert.equal(W.intent().weaponPosition,'front');
 assert(!g.CombatSkills.getSkills()[W.SKILL],'fallbacks never enter learnable skill list');
 for(const [id,min,max] of [['front_thrust',.2,1.7],['front_bump',.6,1],['side_cleave',.8,1.4],['side_swing',.8,1],['side_peck',.3,1.4],['hilt_strike',.6,.8],['hilt_thrust',.4,1.4]]){
  const move=W.moves.find(m=>m.id==='weapon_basic_'+id);assert.ok(move,id);
  for(const level of [0,1,100,1000]){
   const profile=g.CombatSkills.getMovePowerProfile(W.SKILL,move,level);
   near(profile.min,min);near(profile.max,max);assert.equal(profile.levelBonus,0);
  }
 }
 const initLimb=JSON.stringify(I.getCombatState().move_sequence_cursors);
 let a=attack('front');near(a.rawDamage,w.connections.front.part.forged_component.final_position_powers[0].power*.35);
 assert.equal(a.proficiencyDelta,0);assert.equal(a.resourceResult.qiIntended,25);assert.equal(W.intent().weaponPosition,'side1');
 assert.equal(JSON.stringify(I.getCombatState().move_sequence_cursors),initLimb);
 assert.equal(g.BuffSystem.getBuffStacksSum('player','buff_weapon_basic_aim'),1);
 attack('side1');attack('side2');attack('hilt');assert.equal(W.intent().weaponPosition,'front');
 // Same selected position repeats; no second cursor advance, each hit consumes durability/resources.
 refuel();const f=w.connections.side1.part.forged_component,before=f.durability_current;
 attack('side1');attack('side1',1);near(f.durability_current,before-2);assert.equal(W.intent().weaponPosition,'side2');near(surv.qi_li_current,950);
 destroyed=true;assert.equal(W.intent(),null);assert.equal(w.weapon_combat.mode,'forced_unarmed');destroyed=false;assert(W.intent());
 W.setMode('unarmed');destroyed=true;W.active();destroyed=false;assert.equal(W.intent(),null,'manual unarmed is not forcibly reverted');W.setMode('weapon');
 assert.equal(W.validateEquip(weapon(),'weapon_left').success,false,'dual wield not silently invented');
 w=equip(weapon(),'weapon_left');assert.equal(W.intent().limbId,'lhand');
 // Misses do not select a guard. Attacking hand does not exclude weapon guard.
 g.SceneCtx.playerExchangeAttackLimb='lhand';
 const gc=w.weapon_combat.guardCursor;defend(false);assert.equal(w.weapon_combat.guardCursor,gc);
 let d=defend();assert.equal(d.weaponGuard.position.slot,'side1');assert(d.parrySucceeded);near(w.connections.side1.part.forged_component.durability_current,98);
 assert.equal(defend().weaponGuard.position.slot,'side2');
 W.registerGuardSelector('test',()=>({position:'side2',priority:5}));assert.equal(defend().weaponGuard.position.slot,'side2');W.removeGuardSelector('test');
 assert.equal(defend().weaponGuard.position.slot,'side1','continue after actual overridden side');
 // One cross-position instance, one speed term and one pool. Same-speed commit sums contacts once.
 w=weapon('M05-T2',null,null,'H01');w=equip(w);const shared=w.connections.front.part,ff=shared.forged_component;
 ff.durability_current=.5;ff.durability_units=50;const powerBefore=W.position(W.active(),'side1').power;
 W.beginSimultaneous();a=attack('side1',0,true);d=defend(true,true);
 near(ff.durability_current,.5);near(a.weaponAction.power,powerBefore);assert.equal(ff.zero_durability_result,null);
 g.CombatPipeline.finalizeSimultaneousStrike(a);g.CombatPipeline.finalizeSimultaneousStrike(d);W.endSimultaneous();
 assert.equal(ff.durability_current,0);assert.equal(ff.zero_durability_result.index,0);const zero=JSON.stringify(ff.zero_durability_result);
 attack('side2');assert.equal(JSON.stringify(ff.zero_durability_result),zero);
 // Every one of 83 templates remains addressable at zero in all installed positions.
 for(const b of Object.values(C.components)){
  const it=part(b.designId);it.forged_component.durability_current=0;
  for(let index=0;index<(b.group==='H'?1:3);index++){
   it.forged_component.zero_durability_result={index};
   for(const p of b.positions){const z=W.zeroProfile(it,p.slot==='side'?'side1':p.slot);assert(z.power>=0&&z.power<=1);assert(z.block>=0&&z.block<=1);if(index===1)assert.equal(z.speed,-3);}
  }
 }
 // Guarded hilt loses guard eligibility; fixed baseline speed survives except H01.
 w=equip(weapon('T01','B01','B01','H02'));const hf=w.connections.hilt.part.forged_component;
 assert(W.position(W.active(),'hilt').blockEligible);hf.durability_current=0;assert(!W.position(W.active(),'hilt').blockEligible);
 // Pending component effects are consumed by actual attacks only, and can be rebuilt after a miss.
 w=equip(weapon('T01','D01','B01','H04'));refuel();attack('side1');
 assert(w.weapon_combat.pending.some(p=>p.kind==='position'));
 const pending=W.prepareAttack({...W.intent(),weaponPosition:'side2',moveId:'weapon_basic_side_cleave'},0);assert(pending.damageBonus>0);
 assert(w.weapon_combat.pending.length,'preparation never consumes a bonus');attack('side2');assert(!w.weapon_combat.pending.some(p=>p.kind==='position'));
 attack('hilt');a=attack('front');assert(a.weaponAction.damageBonus>=.08);
 // Resource failure doesn't produce even self buffs.
 g.BuffSystem.removeBuffByBuffId('player','buff_weapon_basic_aim');surv.qi_li_current=0;a=attack('front');assert(a.forceZeroDamageByResourceInsufficient);assert.equal(g.BuffSystem.getBuffStacksSum('player','buff_weapon_basic_aim'),0);refuel();
 // Scoped ore traits, including guard recovery, precision and wear floor.
 w=equip(weapon());const sf=w.connections.side1.part.forged_component;
 sf.ore_trait={stat:'next_actual_move_hit_bonus_after_all_segments_miss',value:.12};attack('side1',0,false,false);a=attack('side1');near(a.weaponAction.hitBonus,.12);
 sf.ore_trait={stat:'all_contact_durability_loss_reduction',value:.2};let cur=sf.durability_current;attack('side1');near(sf.durability_current,cur-.8);
 sf.contact_loss.ordinary=.5;cur=sf.durability_current;attack('side1');near(sf.durability_current,cur-.5);
 sf.ore_trait={stat:'next_actual_move_damage_bonus_after_own_successful_block',value:.15};w.weapon_combat.guardCursor=0;defend();a=attack('side1');assert(a.weaponAction.damageBonus>=.15);
 g.BuffSystem.removeBuffByBuffId('test_dummy','buff_off_balance');
 sf.ore_trait={stat:'target_parry_debuff_percentage_points',value:-1.5};attack('side1');near(g.BuffSystem.getParryChanceDeltaPercent('test_dummy'),-1.5);
 const bs=JSON.parse(JSON.stringify(g.BuffSystem.getState()));g.BuffSystem.setState(bs);near(g.BuffSystem.getParryChanceDeltaPercent('test_dummy'),-1.5);
 // Consecutive shock attacks affect only their next tick. A weaker new hit cannot
 // erase today's stronger debuff, stack with it, or extend it one extra tick.
 w=equip(weapon('T01','D17','D03','H01'));refuel();
 const nextTick=()=>{g.GameTime.advanceTicks(1);g.BuffSystem.triggerBuffPipeline({event_kind:'world',event_name:'tick_advanced',tags:['time','tick']});};
 attack('side1');attack('side2');near(g.BuffSystem.getBattleMoveSpeedDeltaPercent('test_dummy'),0);
 nextTick();near(g.BuffSystem.getBattleMoveSpeedDeltaPercent('test_dummy'),-5);
 attack('side2');near(g.BuffSystem.getBattleMoveSpeedDeltaPercent('test_dummy'),-5);
 nextTick();near(g.BuffSystem.getBattleMoveSpeedDeltaPercent('test_dummy'),-2);
 nextTick();near(g.BuffSystem.getBattleMoveSpeedDeltaPercent('test_dummy'),0);
 // Ground equip validates before disturbing the equipped weapon or ground item.
 const pos=g.GameEngine.getState(),groundWeapon=weapon();
 I.addItemToGround(pos.mapId,pos.x,pos.y,groundWeapon);
 const groundIndex=I.getGroundItemsAt(pos.mapId,pos.x,pos.y).findIndex(it=>it.instance_id===groundWeapon.instance_id);
 assert(!I.equipFromGround(pos.mapId,pos.x,pos.y,groundIndex,'weapon_left').success);
 assert.equal(W.equipped().item.instance_id,w.instance_id);
 I.unequip('weapon_right');assert(I.equipFromGround(pos.mapId,pos.x,pos.y,groundIndex,'weapon_left').success);
 w=W.equipped().item;assert.equal(W.equipped().limbId,'lhand');
 // Inventory/save identity preserves pool, position cursors and persisted zero roll.
 const saved=JSON.parse(JSON.stringify(I.getState()));I.setState(saved);assert.equal(W.equipped().item.instance_id,w.instance_id);assert.equal(W.equipped().item.weapon_combat.attackCursor,w.weapon_combat.attackCursor);
 assert(I.auditItemOwnership().ok);g.Math.random=random;
 console.log('PASS modular weapon combat: 83 zero profiles, equipment, independent cycles, hand fallback, repeats, shared durability, simultaneous snapshot, fallback moves/resources, component and ore effects, persistence.');
}finally{g.CharacterAttributes=realCA;g.Survival=realSurv;await h.close();}
