import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const c = vm.createContext({console, Math:Object.create(Math)}); c.window=c;
const load=n=>vm.runInContext(read('js/'+n+'.js'),c,{filename:n});
const parts=['head','chest','abdomen','lhand','rhand','lfoot','rfoot'];
const maxes={head:50,chest:100,abdomen:80,lhand:100,rhand:100,lfoot:100,rfoot:100};
const punch=(id,limb,extra={})=>({id,limb,power_min:10,power_max:10,damage_type:'blunt',qi_cost:0,hit_part_weights:{chest:1},...extra});
const template=actions=>({speed:10,can_attack:true,body_part_destroy_max:{...maxes},actions});
let playerDamage=0, fx=0, tick=0;
const buffs=new Map();
c.Math.random=()=>.99;
c.GameTime={getState:()=>({totalTicks:tick})};
c.CharacterAttributes={getCombatSpeed:()=>10,getHitRate:()=>1,getDamageTypeModifier:()=>1,getBodyPartDestroyMax:()=>999,applyCombatDestroy:(p,n)=>{playerDamage+=n;}};
c.Survival={getState:()=>({tickCount:tick}),isDead:()=>false,calcPainIncrement:n=>n,getDiqiShieldRemaining:()=>0,setDiqiShieldRemaining(){}};
c.CombatFxEvents={capture:()=>fx++,publish(){}};
c.BuffSystem={
 applyBuff(owner,id){const a=buffs.get(owner)||[];if(!a.some(x=>x.buff_id===id))a.push({buff_id:id});buffs.set(owner,a);},
 removeBuffByBuffId(owner,id){buffs.set(owner,(buffs.get(owner)||[]).filter(x=>x.buff_id!==id));},
 hasBuffByBuffId:(owner,id)=>(buffs.get(owner)||[]).some(x=>x.buff_id===id),
 getState:()=>({instancesByOwner:Object.fromEntries(buffs)}),
 hasActionDisabled:(owner,action)=>(buffs.get(owner)||[]).some(x=>x.buff_id==='disable_'+action),
 getParryChanceDeltaPercent:()=>0,getHitChanceDeltaPercent:()=>0,
 getBattleFinalDamageTakenMultiplier:()=>1,getNonBeneficialBuffStacks:()=>0,
 triggerBuffPipeline(){},getBattleMoveSpeedMultiplier:()=>1,getBattleMoveSpeedDeltaPercent:()=>0,
};
for(const n of ['game-engine','combat-enemy-boss','combat-enemy-thug','combat-enemies','combat-damage','combat-skills','combat-melee-resolve','combat-pipeline','combat-world'])load(n);
const E=c.GameEngine,CE=c.CombatEnemies,MR=c.CombatMeleeResolve,P=c.CombatPipeline;
P.setConfig(JSON.parse(read('data/combat-pipeline.json')));
c.CombatSkills.setConfig(JSON.parse(read('data/combat-skills.json')));
CE.setTable(JSON.parse(read('data/combat-enemies.json')));
assert.equal(CE.validateTemplates().length,0,'shipped attackers must have seven maxima and explicit limb-bound moves');
const table={one:template([punch('right','rhand')]),two:template([punch('right','rhand'),punch('left','lhand')]),
 multi:template([punch('grab','rhand',{required_limbs:['lhand']})]),empty:template([]),
 costly:{...template([punch('cost','rhand',{qi_cost:5})]),qi_li_max:10,qi_li_regen_per_turn:2},
 sword:{...template([punch('slash','rhand',{mode:'weapon'}),punch('kick','rfoot')]),weapon:{kind:'single',hand:'rhand'},action_selection:'cycle'},
 staff:{...template([punch('swing','rhand',{mode:'weapon'}),punch('kick','rfoot')]),weapon:{kind:'two_handed'}},
 default:{can_attack:false},dummy:{...template([]),can_attack:false,limbs_invulnerable:true}};
CE.setTable({enemies:table});
E.setMaps({arena:{map_id:'arena',width:12,height:12,blocks:[],enemies:[{enemy_id:'one',x:3,y:2},{enemy_id:'one',x:4,y:2}]}});E.setState('arena',2,2);
const state=(id='one',map='test',i=0)=>CE.getDungeonState(map,i,id);
const restore=(id,values={},map='test',i=0)=>{CE.restoreDungeonState(map,i,id,{...state(id,map,i),part_destroy:Object.fromEntries(parts.map(p=>[p,values[p]||0])),dead:false,stunned:false,pain_value:0});};
const hit=(id,part,n,map='test',i=0)=>CE.onEnemyDamageResolved({defender:{kind:'enemy',enemyId:id,mapId:map,index:i},hitPart:part,hitRollSuccess:true,finalDamage:n,damageType:'pierce'});
const attack=(id,extra={},map='test',i=0)=>MR.resolveEnemyVsPlayerAttack({enemyId:id,enemyMapId:map,enemyIndex:i,...extra});
assert.equal(state('default').maxes.head,50,'enemy defaults do not depend on player maxima');
let living=0,dead=0;
for(let mask=0;mask<128;mask++){
 restore('two',Object.fromEntries(parts.map((p,n)=>[p,mask&(1<<n)?maxes[p]:0])),'masks',mask);
 const lethal=!!(mask&7);assert.equal(CE.isEnemyDead('masks',mask),lethal);
 if(lethal)dead++;else living++;
 if(lethal || (mask&24)===24)assert.equal(attack('two',{},'masks',mask).notExecuted,true);
 assert.equal(CE.parryContext({enemyId:'two',mapId:'masks',index:mask},'chest').skip,lethal||(mask&120)===120);
 assert.equal(CE.cannotMove('two','masks',mask),lethal||!!(mask&96));
}
assert.deepEqual([living,dead],[16,112]);CE.drainEnemyKillQueue();

restore('one',{rhand:98});hit('one','rhand',20);
assert.equal(state().part_destroy.rhand,100);assert.equal(state().part_destroy.head,0,'first-hit overflow is discarded');
hit('one','rhand',8);
assert.deepEqual(JSON.parse(JSON.stringify(state().part_destroy)),{head:2,chest:2,abdomen:1,lhand:1,rhand:100,lfoot:1,rfoot:1});
assert.equal(attack('one').notExecuted,true,'no phantom fallback punch');
assert.equal(attack('empty').notExecuted,true,'missing actions are never supplied at runtime');
restore('one',{rhand:100});
const skipped=c.CombatWorld.buildEnemyCounterAtkCtx(attack('one'),false,{enemyId:'one'}), beforeFx=fx;
P.runPipeline('melee_hit_player_defender',skipped);assert.equal(fx,beforeFx,'canceled attacks emit no attack effects');
restore('multi',{lhand:100});assert.equal(attack('multi').notExecuted,true,'required supporting hand matters');
restore('two');const planned=table.two.actions[0];hit('two','rhand',100);
assert.equal(attack('two',{plannedAction:planned}).notExecuted,true,'a faster disabling strike cancels the planned move');
assert.equal(attack('two').moveId,'left','a later opportunity can choose an already-configured alternative');

function defend(part='chest',occupiedLimbs=[]){return P.runPipeline('melee_hit_enemy_defender',{attacker:{kind:'player'},defender:{kind:'enemy',enemyId:'two',mapId:'test',index:0,parry_rate:0,parry_damage_reduce:.5,occupiedLimbs},hitPart:part,rawDamage:10,damageType:'blunt',hitRollSuccess:true});}
restore('two',{rhand:100});assert.equal(defend('right_arm').finalDamage,10,'a destroyed struck limb cannot unload');
restore('two',{rhand:100});assert.equal(defend('chest').finalDamage,5,'other limbs can guard the torso');
restore('two');let guard=CE.parryContext({enemyId:'two',mapId:'test',index:0,occupiedLimbs:['lhand','rhand','lfoot']},'right_arm');
assert.equal(guard.guardLimb,'rfoot','occupied struck limb can fall back to a free guard');
restore('two',{lhand:100,rhand:100,lfoot:100,rfoot:100});assert.equal(defend().finalDamage,10,'all limbs disabled means no unload');
restore('two');assert.equal(defend('chest',['lhand','rhand','lfoot','rfoot']).finalDamage,10,'all limbs occupied means no unload');
restore('two');CE.addEnemyStun('test',0,'two',100);assert.equal(defend().finalDamage,10,'stun removes defensive qualification');

restore('costly');restore('costly',{},'test',1);
for(let n=0;n<8;n++)CE.pickEnemyAction('costly','test',0);
assert.equal(CE.getEnemyQi('costly','test',0).current,0,'selection never regenerates qi');
for(tick=1;tick<=3;tick++){CE.beginWorldTurn(tick);CE.dungeonTurnStatus('test',0,'costly',tick);CE.dungeonTurnStatus('test',0,'costly',tick);CE.endWorldTurn();}
assert.equal(CE.getEnemyQi('costly','test',0).current,6,'one regeneration per world tick');
assert.equal(CE.getEnemyQi('costly','test',1).current,0,'same type has independent qi');
assert.equal(attack('costly').qiSpent,5);assert.equal(attack('costly').notExecuted,true);
CE.addEnemyStun('test',0,'costly',100);CE.beginWorldTurn(4);
assert.equal(CE.dungeonTurnStatus('test',0,'costly',4).skip,true);
assert.equal(CE.isEnemyStunned('test',0),true,'stun remains active through world attack dispatch');
assert.equal(attack('costly').notExecuted,true);CE.endWorldTurn();assert.equal(CE.isEnemyStunned('test',0),false);

restore('one',{head:3,rhand:100});assert.equal(CE.healDungeonInjury('test',0,'one',8),8);
assert.equal(state().part_destroy.head,0);assert.equal(state().part_destroy.rhand,95);assert.equal(attack('one').notExecuted,undefined);
restore('one',{lfoot:100});assert.equal(CE.cannotMove('one','test',0),true);
CE.healDungeonInjury('test',0,'one',1);assert.equal(CE.cannotMove('one','test',0),false);
hit('one','head',50);const corpse=state();assert.equal(corpse.dead,true);assert.equal(CE.healDungeonInjury('test',0,'one',100),0);
hit('one','rhand',30);assert.deepEqual(JSON.parse(JSON.stringify(state())),JSON.parse(JSON.stringify(corpse)),'dead state is terminal');
assert.equal(CE.drainEnemyKillQueue().filter(x=>x.mapId==='test').length,1);assert.equal(CE.drainEnemyKillQueue().length,0);
restore('one',{head:49});
const multiHit=P.runPipeline('melee_hit_enemy_defender',{attacker:{kind:'player'},defender:{kind:'enemy',enemyId:'one',mapId:'test',index:0,parry_rate:0},damageType:'pierce',rawDamage:10,
 segments:[{hitPart:'head',rawDamage:10,hitRollSuccess:true},{hitPart:'chest',rawDamage:10,hitRollSuccess:true}]});
assert.equal(multiHit.segmentsResults.length,1,'remaining subhits stop when their target dies');
assert.equal(state().part_destroy.chest,0);CE.drainEnemyKillQueue();
restore('one',{head:50},'other-map',0);
assert.equal(CE.drainEnemyKillQueue('test').length,0,'off-map pending death is not rewarded on the active map');
assert.equal(CE.drainEnemyKillQueue('other-map').length,1);

restore('sword');assert.equal(attack('sword').moveId,'slash');hit('sword','rhand',100);assert.equal(attack('sword').moveId,'kick');
CE.healDungeonInjury('test',0,'sword',1);assert.equal(attack('sword').moveId,'slash');
restore('staff',{rhand:100});assert.equal(attack('staff').rawDamage,5,'two-handed one-hand penalty remains x0.5');
restore('staff',{rhand:100,lhand:100});assert.equal(attack('staff').moveId,'kick');

hit('one','rhand',100,'arena',0);hit('one','lhand',25,'arena',1);
const owner0=CE.getOwnerId('one','arena',0),owner1=CE.getOwnerId('one','arena',1);
assert.notEqual(owner0,owner1);c.BuffSystem.applyBuff(owner0,'disable_attack');
assert.equal(attack('one',{},'arena',1).notExecuted,undefined,'disabled status is instance-specific');
E.getMap().enemies.splice(0,1);CE.removeEnemyAiStateAt('arena',0);
assert.equal(CE.getOwnerId('one','arena',0),owner1);assert.equal(state('one','arena',0).part_destroy.lhand,25);
assert.equal(state('one','arena',0).part_destroy.rhand,0,'survivor never inherits dead predecessor injury');
assert.equal((buffs.get(owner0)||[]).length,0,'removed owner effects cleaned');
const saved=CE.getState();hit('one','lhand',40,'arena',0);CE.setState(saved);
assert.equal(state('one','arena',0).part_destroy.lhand,25);assert.equal(CE.getOwnerId('one','arena',0),owner1);
assert.equal(E.getMap().enemies.length,1,'removed enemy stays removed after restore');
CE.restoreDungeonState('legacy',0,'one',{part_destroy:{rhand:99}});
assert.equal(state('one','legacy').part_destroy.rhand,99);assert.equal(state('one','legacy').maxes.head,50);
console.log('PASS: 128 body combinations; no fallback attack; planned limb cancellation; guard eligibility; per-instance qi/Buffs; one-tick stun; recovery; weapon dependencies; removal and save migration');
