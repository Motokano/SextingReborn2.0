import assert from 'node:assert/strict';
import {boot} from './dungeon/fixture.mjs';
const h=await boot(false),copy=x=>JSON.parse(JSON.stringify(x));
try{
 const g=h.g,IE=g.InventoryEquipment,CE=g.CombatEnemies,CA=g.CharacterAttributes;
 CA.setState({character_creation_completed:true,innate:{jingu:100,flexibility:20,breath:20,dexterity:20,focus:20}});
 const p=g.GameEngine.getState(),map=g.GameEngine.getMap(),enemy={enemy_id:'fatal_test',x:p.x+1,y:p.y};
 map.enemies.push(enemy);const index=map.enemies.indexOf(enemy);
 const action={id:'fatal_hit',limb:'rhand',power_min:100000,power_max:100000,damage_type:'pierce',qi_cost:0,hit_part_weights:{head:1}};
 const tpl={speed:20,can_attack:true,parry_rate:0,parry_damage_reduce:0,qi_li_initial:100,qi_li_max:100,
  body_part_destroy_max:{head:1,chest:500,abdomen:500,lhand:100,rhand:100,lfoot:100,rfoot:100},actions:[action]};
 CE.setTable({enemies:{fatal_test:tpl}});
 const base=copy(g.CombatSkills.getSkill('combat_basic_unarmed'));
 const move={...base.moves[0],id:'fatal_move',required_limb_tags:[],action_tags:[],damage_type:'pierce',hit_segments:1,attack_range:1,
  hit_part_weights:{head:1},diqi_cost:{ratio_of_diqi_max_at_10_power:.01,min:2,max:2},move_power_multiplier:1,unlock_level:1};
 const skill={...base,id:'fatal_skill',slots_unlock_by_level:[{level:1,slots:1}],moves:[move]};
 g.CombatSkills.getSkills()[skill.id]=skill;IE.getSkillsState()[skill.id]={level:50,move_usage:{}};
 const inv=IE.getState();inv.equipment.weapon_left=null;inv.equipment.weapon_right=null;IE.setState(inv);
 IE.setCombatState({limbs:{lhand:{active:skill.id},rhand:{active:skill.id},lfoot:{active:skill.id},rfoot:{active:skill.id}},
  move_sequences:{lhand:[move.id],rhand:[move.id],lfoot:[move.id],rfoot:[move.id]},limb_strike_order:['lhand','rhand','lfoot','rfoot'],limb_strike_order_cursor:0});
 CA.getCombatSpeed=()=>20;g.Math.random=()=>.75;
 g.Survival.setDiqiCapLimitFlatBonus('fatal_test',1000);
 g.Survival.setState({isDead:false,qi_li_current:100,diqi_current:1000,diqi_max_effective:1000,diqi_shield_remaining:0});
 const run=g.CombatPipeline.runPipeline,results=[];
 g.CombatPipeline.runPipeline=(name,ctx)=>{const r=run(name,ctx);results.push(r);return r;};
 const baseline=g.SaveSystem.buildSnapshotForDebug();
 function attack(){g.SceneCtx.actions.attackEnemy(enemy.enemy_id,{x:enemy.x,y:enemy.y,fromX:p.x,fromY:p.y});}
 attack();
 assert(g.Survival.isDead(),'same-speed enemy completes its lethal strike');
 assert(results.some(r=>r.attacker?.kind==='player'&&r.simultaneousCommitted&&r.finalDamage>0));
 assert(results.some(r=>r.attacker?.kind==='enemy'&&r.simultaneousCommitted&&r.finalDamage>0));
 assert(!g.GameEngine.getMap().enemies.some(e=>e.enemy_id===enemy.enemy_id),'same-speed player also kills enemy');
 await h.drain();assert.equal(g.DeathSystem.getState().deathCount,1);
 const deathLog=g.DeathSystem.getLogEntries();
 assert(deathLog.some(e=>e.message.includes('攻击你')),'actual enemy attack is in the death journal');
 assert(deathLog.some(e=>e.message.includes('本击结算')),'final combat summary is captured after the synchronous group');
 assert(deathLog.at(-1).message.includes('头部损毁达到'));
 assert(deathLog.every(e=>g.GameLog.getEntries().some(original=>original.message===e.message&&original.time===e.time)), 'display reuses actual journal entries');
 assert(g.SaveSystem.applySnapshotForDebug(baseline));tpl.speed=40;results.length=0;
 attack();await h.drain();
 assert(g.Survival.isDead());assert.equal(g.DeathSystem.getState().deathCount,1);
 assert(!results.some(r=>r.attacker?.kind==='player'&&!r.notExecuted),'dead slower player cannot retaliate');
 assert.equal(CE.isEnemyDead(map.map_id,index),false);
 assert.deepEqual(h.errors,[]);
 console.log('PASS real combat: simultaneous mutual kill, single penalty, faster lethal strike cancels slower retaliation');
}finally{await h.close();}
