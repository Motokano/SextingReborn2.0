import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot} from './ui-game-fixture.mjs';

// Exercise production scene exchanges and SaveSystem, using isolated test content.
const h=await boot(false),g=h.g,CE=g.CombatEnemies,I=g.InventoryEquipment;
const plain=v=>JSON.parse(JSON.stringify(v));
try {
 g.UIText.setDict({...JSON.parse(fs.readFileSync('data/ui_text_zhCN.json','utf8')),'enemy.name.body_test':'测试敌人'});
 g.CharacterAttributes.setState({character_creation_completed:true,innate:{jingu:100,flexibility:20,breath:20,dexterity:20,focus:20}});
 const p=g.GameEngine.getState(),map=g.GameEngine.getMap();
 const enemy={enemy_id:'body_test',x:p.x+1,y:p.y};map.enemies.push(enemy);
 const index=map.enemies.indexOf(enemy);
 const action={id:'right_punch',limb:'rhand',power_min:10,power_max:10,damage_type:'pierce',qi_cost:2,hit_part_weights:{chest:1}};
 const tpl={speed:10,can_attack:true,parry_rate:0,parry_damage_reduce:0,qi_li_initial:20,qi_li_max:20,qi_li_regen_per_turn:0,
  body_part_destroy_max:{head:500,chest:500,abdomen:500,lhand:100,rhand:1,lfoot:100,rfoot:100},actions:[action]};
 CE.setTable({enemies:{body_test:tpl}});
 const base=plain(g.CombatSkills.getSkill('combat_basic_unarmed'));
 const move={...base.moves[0],id:'disable_arm',required_limb_tags:[],action_tags:[],damage_type:'pierce',hit_segments:1,
  attack_range:1,hit_part_weights:{right_arm:1},diqi_cost:{ratio_of_diqi_max_at_10_power:.01,min:2,max:2},move_power_multiplier:1,unlock_level:1};
 const skill={...base,id:'body_test_skill',slots_unlock_by_level:[{level:1,slots:1}],moves:[move]};
 g.CombatSkills.getSkills()[skill.id]=skill;I.getSkillsState()[skill.id]={level:50,move_usage:{}};
 const inv=I.getState();inv.equipment.weapon_left=null;inv.equipment.weapon_right=null;I.setState(inv);
 g.CharacterAttributes.getCombatSpeed=()=>20;g.Math.random=()=>.2;
 g.Survival.setDiqiCapLimitFlatBonus('body_test',1000);
 const run=g.CombatPipeline.runPipeline,results=[];
 g.CombatPipeline.runPipeline=(name,ctx)=>{const r=run(name,ctx);results.push(r);return r;};
 const state=()=>CE.getDungeonState(map.map_id,index,enemy.enemy_id);
 function setup(speed=10) {
  tpl.speed=speed;
  const s=state();s.dead=false;s.stunned=false;s.turn_stunned=false;s.pain_value=0;s.stun_value=0;s.qi_current=20;s.last_turn_tick=null;
  for(const part of Object.keys(s.part_destroy))s.part_destroy[part]=0;
  CE.restoreDungeonState(map.map_id,index,enemy.enemy_id,s);
  for(const b of g.BuffSystem.getState().instancesByOwner[s.ownerId]||[])g.BuffSystem.removeBuffByBuffId(s.ownerId,b.buff_id);
  I.setCombatState({limbs:{lhand:{active:skill.id},rhand:{active:skill.id},lfoot:{active:skill.id},rfoot:{active:skill.id}},
   move_sequences:{lhand:[move.id],rhand:[move.id],lfoot:[move.id],rfoot:[move.id]},limb_strike_order:['lhand','rhand','lfoot','rfoot'],limb_strike_order_cursor:0});
  I.setPlayerStunValue(0);g.Survival.setState({isDead:false,qi_li_current:100,diqi_current:10000,diqi_max_effective:10000});
  results.length=0;
 }
 function attack(){g.SceneCtx.actions.attackEnemy(enemy.enemy_id,{x:enemy.x,y:enemy.y,fromX:p.x,fromY:p.y});}
 setup();attack();
 assert.equal(state().part_destroy.rhand,1,'production player strike disables the planned arm');
 assert(results.some(r=>r.notExecuted&&r.skipReason==='limb_destroyed'),'slower planned attack is canceled');
 assert(!results.some(r=>r.attacker?.kind==='enemy'&&!r.notExecuted),'no fallback or extra AI attack');
 assert.equal(state().qi_current,20,'canceled attack does not pay qi');
 assert.equal(state().dead,false,'limb loss does not produce a corpse');
 // Same speed shares the pre-contact state: enemy still completes its valid strike.
 setup(20);attack();
 assert.equal(state().part_destroy.rhand,1);
 assert(results.some(r=>r.attacker?.kind==='enemy'&&r.simultaneousCommitted&&!r.notExecuted));
 assert.equal(state().qi_current,18,'simultaneous strike is charged once');
 // A later opportunity remains disabled; healing restores actual configured actions.
 assert.equal(g.CombatMeleeResolve.resolveEnemyVsPlayerAttack({enemyId:enemy.enemy_id,enemyMapId:map.map_id,enemyIndex:index}).notExecuted,true);
 CE.healDungeonInjury(map.map_id,index,enemy.enemy_id,1);
 assert.equal(CE.planAction(enemy.enemy_id,map.map_id,index).action.id,action.id);
 // Identical enemies use separate actual BuffSystem owners, including save roundtrip.
 const other={...enemy,x:enemy.x+1};map.enemies.push(other);const otherIndex=map.enemies.indexOf(other);
 const firstOwner=CE.getOwnerId(enemy.enemy_id,map.map_id,index),otherOwner=CE.getOwnerId(enemy.enemy_id,map.map_id,otherIndex);
 assert.notEqual(firstOwner,otherOwner);
 g.BuffSystem.applyBuff(firstOwner,'survival_pain_agony','body_test',{tick:g.GameTime.getState().totalTicks});
 assert(g.BuffSystem.hasBuffByBuffId(firstOwner,'survival_pain_agony'));
 assert(!g.BuffSystem.hasBuffByBuffId(otherOwner,'survival_pain_agony'));
 CE.consumeEnemyQi(enemy.enemy_id,3,map.map_id,index);
 const save=g.SaveSystem.buildSnapshotForDebug(),qi=state().qi_current;
 CE.healDungeonInjury(map.map_id,index,enemy.enemy_id,100);
 CE.consumeEnemyQi(enemy.enemy_id,99,map.map_id,index);
 assert(g.SaveSystem.applySnapshotForDebug(save));
 assert.equal(state().qi_current,qi);assert.equal(state().ownerId,firstOwner);
 assert(g.BuffSystem.hasBuffByBuffId(firstOwner,'survival_pain_agony'));
 assert(!g.BuffSystem.hasBuffByBuffId(otherOwner,'survival_pain_agony'));
 // Removal and saved map layout preserve the surviving instance, not the old index.
 const countBeforeRemoval=g.GameEngine.getMap().enemies.length;
 g.GameEngine.getMap().enemies.splice(index,1);CE.removeEnemyAiStateAt(map.map_id,index);
 const afterRemoval=g.SaveSystem.buildSnapshotForDebug();assert(g.SaveSystem.applySnapshotForDebug(afterRemoval));
 assert.equal(g.GameEngine.getMap().enemies.length,countBeforeRemoval-1);
 assert.equal(CE.getOwnerId(other.enemy_id,map.map_id,index),otherOwner);
 assert(!g.BuffSystem.hasBuffByBuffId(firstOwner,'survival_pain_agony'));
 // A save between lethal damage and world settlement remains dead and settles once.
 CE.onEnemyDamageResolved({defender:{kind:'enemy',enemyId:other.enemy_id,mapId:map.map_id,index},hitPart:'head',finalDamage:500,hitRollSuccess:true});
 const pendingDeath=g.SaveSystem.buildSnapshotForDebug();assert(g.SaveSystem.applySnapshotForDebug(pendingDeath));
 assert(CE.isEnemyDead(map.map_id,index));
 let dropRolls=0;g.EnemyDrops.rollEnemyBatteryDrop=()=>{dropRolls++;return null;};
 g.CombatWorld.settleEnemyKills();g.CombatWorld.settleEnemyKills();
 assert.equal(dropRolls,1);assert.equal(g.GameEngine.getMap().enemies.length,countBeforeRemoval-2);
 assert(g.SaveSystem.applySnapshotForDebug(g.SaveSystem.buildSnapshotForDebug()));g.CombatWorld.settleEnemyKills();
 assert.equal(dropRolls,1,'settled death is not awarded again after load');
 assert.deepEqual(h.errors,[]);
 console.log('PASS production enemy body exchange: faster limb cancellation, simultaneous attack, qi charges, recovery, real Buff isolation and SaveSystem removal roundtrip');
} finally {await h.close();}
