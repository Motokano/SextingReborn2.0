import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const skills = JSON.parse(read('data/combat-skills.json'));
const c=vm.createContext({console, setTimeout, clearTimeout}); c.window=c;
c.Math=Object.create(Math); c.Math.random=()=>0.25;
const load=n=>vm.runInContext(read('js/'+n+'.js'),c,{filename:n});
let state={qi_li_current:100,diqi_current:10000,diqi_max_effective:100,isDead:false};
let st={mapId:'arena',x:2,y:2}, enemy={enemy_id:'target',x:3,y:2};
let map={map_id:'arena',width:12,height:8,enemies:[enemy]}, walls=new Set(), hp=10000, stun=0, stunned=false, dealt=0, enemySpent=0, ticks=0, speed=20;
let hubs={breath:'combat_basic_breath'}, moveId='front_kick';
c.GameEngine={getState:()=>({...st}),getMap:()=>map,setState:(id,x,y)=>{st={mapId:id,x,y};},
 isWalkable:(x,y)=>x>=0&&y>=0&&x<map.width&&y<map.height&&!walls.has(x+','+y),getEnemyAt:(x,y)=>map.enemies.find(e=>e.x===x&&e.y===y)?.enemy_id,getNpcAt:()=>null};
c.InventoryEquipment={getCombatState:()=>({hubs}),getSkillLevel:()=>100,getSkillsState:()=>({}),getState:()=>({equipment:{},skills:{}}),
 getCombatExperienceDamageMultiplier:()=>1,getHubActionCooldownRemaining:()=>0,consumePlayerStunRoundIfBlocking:()=>false,
 getPlayerPostEffectIds:()=>[],isPlayerStunned:()=>false};
c.Survival={getState:()=>state,getQiLiMax:()=>100,consumeQiLi:n=>{let a=Math.min(n,state.qi_li_current);state.qi_li_current-=a;c.CombatBreath.spent(a);return a;},
 drainQiLi:()=>{let a=state.qi_li_current;state.qi_li_current=0;c.CombatBreath.spent(a);},consumeDiqi:n=>{state.diqi_current-=n;return n;},
 addQiLi:n=>{state.qi_li_current=Math.min(100,state.qi_li_current+n);},advanceTick:()=>{ticks++;c.CombatWorld.tickEnemiesAfterWorldTick();},getDiqiShieldRemaining:()=>0};
c.CharacterAttributes={getCombatSpeed:()=>speed,getHitRate:()=>1,getEffectiveAttr:()=>30,getInnateAttr:()=>20,
 getFistBasePower:()=>21,getDamageTypeModifier:()=>1,getDominantLimbMultiplier:()=>1,applyCombatDestroy:(part,n)=>{dealt+=n;}};
c.CombatEnemies={getById:()=>({jingu:20,speed:10,attack_damage_min:10,attack_damage_max:10}),
 onEnemyDamageResolved:ctx=>{hp-=ctx.finalDamage;},isEnemyDead:()=>hp<=0,isEnemyStunned:()=>stunned,
 addEnemyStun:(m,i,id,n)=>{stun+=n;if(stun>=100){stun=0;stunned=true;}},
 pickEnemyAction:()=>({id:'reply',power_min:10,power_max:10,qi_cost:25,hit_part_weights:{chest:1}}),consumeEnemyQi:(id,n)=>{enemySpent+=n;return n;},sampleHitPartForAction:()=> 'chest',
 mergeIntoDefender:d=>Object.assign(d,{speed:10,can_attack:true,parry_rate:0}),forceAggro:()=>{},
 updateEnemyAI:o=>{if(stunned){stunned=false;return {moves:[],attacks:[]};}assert.ok(o.didActThisTick(0),'counter must consume the enemy action');return {moves:[],attacks:[]};},isEnemyAggro:()=>true};
c.fetch=async p=>({ok:true,json:async()=>JSON.parse(read(p))});
for(const n of ['combat-skills','combat-damage','combat-melee-resolve','combat-pipeline','buff-system','combat-breath','combat-engagement','combat-world','combat-hub-actions','combat-initiative'])load(n);
for(const n of ['scene-animation','combat-fx-paint','combat-fx-presentation','combat-fx-events','combat-fx-runtime'])load(n);
const fxEvents=[];c.SceneAnimation.on('combat:resolved',event=>fxEvents.push(event));
c.CombatSkills.setConfig(skills); c.CombatPipeline.setConfig(JSON.parse(read('data/combat-pipeline.json')));c.BuffSystem.init();await new Promise(r=>setTimeout(r,30));
function engage(){c.CombatEngagement.engageEnemy({mapId:'arena',index:0,enemyId:'target',record:enemy});}
engage();
const B=c.CombatBreath, BS=c.BuffSystem;
assert.equal(B.activate(),false);
for(let i=0;i<8;i++){state.qi_li_current=100;c.Survival.consumeQiLi(25);}
assert.equal(BS.getBuffStacksSum('player','buff_breath_charge'),200);
assert.equal(BS.getNonBeneficialBuffStacks('player'),0,'undispellable breath is not a debuff');
c.Survival.consumeQiLi(25);assert.equal(BS.getBuffStacksSum('player','buff_breath_charge'),200);
assert.equal(B.activate(),true);assert.equal(state.qi_li_current,100);assert.equal(B.activate(),false);
assert.equal(BS.getBuffStacksSum('player','buff_breath_charge'),0);
assert.equal(BS.getTemplate('buff_breath_burst').dispel_pool,'');
let saved=BS.getState();BS.setState(saved);assert.equal(state.qi_li_current,100);assert.equal(B.active().damage_multiplier,1.8);
const R=c.CombatMeleeResolve,P=c.CombatPipeline,W=c.CombatWorld;
function attack(id='jab',dry=false){
 let r=R.resolvePlayerVsEnemyAttack({skillId:'combat_basic_unarmed',moveId:id,limbId:'lhand',powerLevel:10,targetIndex:0,deferResourceSpend:dry});
 let ctx={...r,resourceResult:r,attacker:{kind:'player',pos:{x:st.x,y:st.y},postEffectIds:[]},defender:{kind:'enemy',enemyId:'target',mapId:'arena',index:0,pos:{x:enemy.x,y:enemy.y}},simultaneousDryRun:dry};
 P.runPipeline('melee_hit_enemy_defender',ctx);return {r,ctx};
}
let a=attack();assert.equal(a.r.breathMultiplier,1.8);assert.equal(enemy.x,4,'immediate burst displacement');assert.equal(BS.getBuffStacksSum('player','buff_breath_burst'),2);assert.equal(BS.getBuffStacksSum('player','buff_breath_charge'),0);
assert.equal(W.preparePlayerApproach(enemy,{range:1}),true);assert.equal(st.x,3);
attack();assert.equal(enemy.x,5);assert.equal(BS.getBuffStacksSum('player','buff_breath_burst'),1);
assert.equal(W.preparePlayerApproach(enemy,{range:1}),true);attack();assert.equal(B.active(),null);assert.equal(BS.getBuffStacksSum('player','buff_breath_charge'),0,'last boosted attack must not recharge');
// Multi-segment action applies exactly one displacement and collision uses total damage.
st.x=2;enemy.x=3;const jab=skills.skills.combat_basic_unarmed.moves.find(m=>m.id==='jab');jab.hit_segments=2;jab.on_parry_failed_displace_target={cells:1};
let before=hp;a=attack();assert.equal(enemy.x,4);assert.equal(hp,before-a.ctx.finalDamage);
enemy.x=3;walls.add('4,2');before=hp;a=attack();assert.equal(enemy.x,3,'blocked displacement never slides sideways');assert.equal(hp,before-a.ctx.finalDamage-Math.floor(a.ctx.finalDamage*.3));assert.equal(stun,50);
attack();assert.equal(stunned,true);walls.clear();stunned=false;stun=0;jab.hit_segments=1;delete jab.on_parry_failed_displace_target;
// Blocked charge is atomic; long-range bonus is additive.
BS.setBuffStacks('player','buff_breath_burst',3);enemy.x=5;st.x=2;walls.add('3,2');const resources={...state};
assert.equal(W.preparePlayerApproach(enemy,{range:2}),false);assert.equal(st.x,2);assert.deepEqual(state,resources);
walls.clear();assert.equal(W.preparePlayerApproach(enemy,{range:2}),true);assert.equal(st.x,4);
// Same-speed dry runs must not move either side until both commits.
st.x=2;enemy.x=3;a=attack('front_kick',true);assert.equal(enemy.x,3);R.applyDeferredResourceSpendFromResolveResult(a.r);P.finalizeSimultaneousStrike(a.ctx);assert.equal(enemy.x,3);W.flushDisplacements();assert.equal(enemy.x,4);
// Full production scene exchange: fast kick, enemy spends resources but misses at distance.
Object.assign(c,{E:c.GameEngine,IE:c.InventoryEquipment,CombatWorld:W,guardPlayerComaBlocked:()=>false,isPreCreationGameplayRestricted:()=>false,
 pickWorldMeleeAttackIntent:()=>({skillId:'combat_basic_unarmed',moveId,limbId:'lfoot',advanceCursor:false}),getWorldTotalTicks:()=>ticks,
 ui:k=>k,showMsg:()=>{},getCombatSkillName:x=>x,getMoveDisplayName:(s,m)=>m,getFormTagsForMove:()=>[],bumpCombatRenderProfile:()=>{},render:()=>{},SceneHud:{refresh:()=>{}},
 SceneCtx:{actions:{},clearPlayerExchangeLimbLocks:()=>{}},PlayerFacing:{getDir:()=>2}});
const scene=read('js/scene-app.js');let begin=scene.indexOf('window.SceneCtx.actions.attackEnemy = function'),end=scene.indexOf('window.SceneCtx.actions.interactNpc =',begin);
vm.runInContext(scene.slice(begin,end),c);
BS.removeBuffByBuffId('player','buff_breath_burst');state.qi_li_current=100;st.x=2;enemy.x=3;dealt=0;enemySpent=0;
c.SceneCtx.actions.attackEnemy('target',{x:3,y:2,fromX:2,fromY:2});
assert.equal(enemy.x,4);assert.equal(dealt,0);assert.equal(enemySpent,25);assert.equal(ticks,1);
assert.equal(fxEvents.at(-2).segments[0].moveId,'front_kick');
assert.equal(fxEvents.at(-2).defender.x,3,'FX preserves pre-knockback contact position');
assert.equal(fxEvents.at(-1).segments[0].result,'distance','real scene reply emits whiff, not fake impact');
assert.equal(fxEvents.at(-1).attacker.x,4,'reply snapshots the new position');
// Wall threshold stops the counter before resource spend; AI consumes the one stun action.
enemy.x=3;walls.add('4,2');state.qi_li_current=100;stun=50;enemySpent=0;const beforeStunFx=fxEvents.length;
c.SceneCtx.actions.attackEnemy('target',{x:3,y:2,fromX:2,fromY:2});assert.equal(enemySpent,0);assert.equal(stunned,false);
assert.equal(fxEvents.length,beforeStunFx+1,'stun-cancelled reply emits no extra attack FX');
// Disengage clears both counters and boosts.
c.CombatEngagement.setCurrentMap('other');assert.equal(BS.getBuffStacksSum('player','buff_breath_charge'),0);assert.equal(BS.getBuffStacksSum('player','buff_breath_burst'),0);
// Enemy-first displacement makes the player's already committed attack miss too.
engage();walls.clear();st.x=2;enemy.x=3;speed=5;moveId='jab';state.qi_li_current=100;dealt=0;let hpBefore=hp;
c.CombatEnemies.pickEnemyAction=()=>({id:'push',power_min:10,power_max:10,qi_cost:25,on_parry_failed_displace_target:{cells:1}});
c.SceneCtx.actions.attackEnemy('target',{x:3,y:2,fromX:2,fromY:2});
assert.equal(st.x,1);assert.equal(hp,hpBefore);assert.equal(state.qi_li_current,75);assert.ok(dealt>0);
// Buff impulse works through a full parry and collides for zero damage + 50 stun.
st.x=2;enemy.x=3;speed=20;BS.setBuffStacks('player','buff_breath_burst',3);walls.add('4,2');stun=0;
let rParry=R.resolvePlayerVsEnemyAttack({skillId:'combat_basic_unarmed',moveId:'jab',limbId:'lhand',targetIndex:0});
let parry={...rParry,resourceResult:rParry,attacker:{kind:'player',pos:{x:2,y:2}},defender:{kind:'enemy',enemyId:'target',mapId:'arena',index:0,pos:{x:3,y:2},parry_rate:1}};
P.runPipeline('melee_hit_enemy_defender',parry);assert.equal(parry.finalDamage,0);assert.equal(stun,50);assert.equal(BS.getBuffStacksSum('player','buff_breath_burst'),2);
// A zero-start, attack-only accumulation breath reuses the same resource seam.
B.clear();const basic=skills.skills.combat_basic_breath,oldBar=basic.breath_bar;
basic.breath_bar={max_base:100,initial_state:{qi_li:0},action_delta:{'*':{type:'flat',value:25}}};
state.qi_li_current=0;walls.clear();a=attack('jab');assert.ok(a.ctx.finalDamage>0);assert.equal(state.qi_li_current,25);assert.equal(BS.getBuffStacksSum('player','buff_breath_charge'),0);
basic.breath_bar=oldBar;
// Actual same-speed scene and autonomous enemy path both use the shared presentation seam.
B.clear();state.qi_li_current=100;st.x=2;enemy.x=3;speed=10;stunned=false;stun=0;
const beforeSimFx=fxEvents.length;c.SceneCtx.actions.attackEnemy('target',{x:3,y:2,fromX:2,fromY:2});
assert.equal(fxEvents.length,beforeSimFx+2);
assert.ok(fxEvents.at(-2).groupId);assert.equal(fxEvents.at(-2).groupId,fxEvents.at(-1).groupId);
assert.equal(fxEvents.at(-1).simultaneous,true);
st.x=2;enemy.x=3;const beforeAiFx=fxEvents.length;W.runEnemyAttackOnPlayer('target',3,2);
assert.equal(fxEvents.length,beforeAiFx+1);assert.equal(fxEvents.at(-1).attacker.kind,'enemy');
console.log('PASS: breath buffs, charge cap, three attacks, save restore, immediate whole-action knockback, collision, blocked charge, simultaneous commit and actual scene counter whiff/stun');
