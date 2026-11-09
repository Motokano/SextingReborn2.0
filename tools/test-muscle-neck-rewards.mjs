import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v)),read=p=>fs.readFileSync(p,'utf8'),json=p=>JSON.parse(read(p));
const data=json('data/muscles.json'),neck=data.muscles.filter(m=>m.group==='neck');
const lit=list=>Object.fromEntries(list.map(m=>[m.id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function load(g,names){for(const name of names)vm.runInContext(read('js/'+name+'.js'),g,{filename:name});}
async function context(){
 const g=vm.createContext({console,Math:Object.create(Math),fetch:async p=>({ok:true,json:async()=>json(p)})});g.window=g;
 load(g,['muscles']);await g.Muscles.ready;return g;
}

test('55 neck entries independently grant 0.2% final head reduction; every entry is required for 20% stun growth reduction',async()=>{
 const g=await context(),M=g.Muscles;assert.equal(neck.length,55);
 for(const m of neck){
  assert.deepEqual(m.effects,[{type:'headDamageReductionPercent',delta:.2}]);
  M.setState({progress:{[m.id]:99.999}});assert.equal(M.getHeadDamageMultiplier(),1);assert.equal(M.getStunGainMultiplier(),1);
  M.addGrowth(m.id,.001);near(M.getHeadDamageMultiplier(),.998);assert.equal(M.getEffectsText(m.id),'头部独立卸力率+0.2%');
  assert.equal(M.getStatBonus().acquired.breath,0);assert.equal(M.getSexualAbilityBonus(),0);
  M.setState({unlocked:{...lit(neck.filter(x=>x.id!==m.id)),unknown_neck:true},progress:{[m.id]:99.999}});
  assert.equal(M.isGroupComplete('neck'),false);near(M.getHeadDamageMultiplier(),.892);assert.equal(M.getStunGainMultiplier(),1);
  M.addGrowth(m.id,.001);assert.equal(M.isGroupComplete('neck'),true);
  for(let i=0;i<2;i++){M.setState(copy(M.getState()));M.addGrowth(m.id,1);assert.equal(M.getStatBonus().headDamageReductionPercent,11);near(M.getHeadDamageMultiplier(),.89);near(M.getStunGainMultiplier(),.8);}
 }
 assert.deepEqual(copy(M.getGroupCompletionEffects('neck').map(M.getEffectDisplay)),[{name:'眩晕条增长',value:-20,unit:'%'}]);
 for(const n of Object.values(M.getStatBonus().innate))assert.equal(n,0);
 M.setState({unlocked:lit(data.muscles.filter(m=>m.group!=='neck'))});assert.equal(M.getHeadDamageMultiplier(),1);assert.equal(M.getStunGainMultiplier(),1);
});

test('real damage pipeline applies neck after helmet, flexibility, ordinary unload and taken modifiers, once per head segment',async()=>{
 const g=await context(),M=g.Muscles;load(g,['combat-damage','combat-pipeline']);const D=g.CombatDamage,P=g.CombatPipeline;
 let flex=144,taken=1.4,delivered=[],enemyDamage=[];
 g.CharacterAttributes={getEffectiveAttr:()=>flex,getDamageTypeModifier:(p,t)=>t==='blunt'?.8:1.2,applyCombatDestroy:(part,damage)=>delivered.push({part,damage})};
 g.InventoryEquipment={getHeadDamageReduce:t=>t==='blunt'?.3:.1,getPlateDamageReduce:()=>0};
 g.BuffSystem={getBattleFinalDamageTakenMultiplier:()=>taken};
 g.CombatEnemies={onEnemyDamageResolved:c=>enemyDamage.push(c.finalDamage)};
 P.setConfig({pipelines:{damage:{phases:[{handler:'builtin.unified_defense'},{handler:'builtin.damage_stub'}]}}});
 const run=(extra={})=>P.runPipeline('damage',{rawDamage:200,typedDamage:{blunt:100,pierce:100},damageAfterParry:100,hitRollSuccess:true,hitPart:'head',attacker:{kind:'enemy'},defender:{kind:'player'},...extra});
 const defended=D.defend({blunt:50,pierce:50},{armor:{blunt:.3,pierce:.1},permanentArmor:true,flexibility:144,part:{blunt:.8,pierce:1.2}}).damage;
 const baseline=run();near(baseline.damageAfterUnifiedDefense,defended);assert.equal(baseline.finalDamage,Math.floor(defended*taken));
 M.setState({unlocked:lit(neck)});const reduced=run();near(reduced.damageAfterUnifiedDefense,defended);assert.equal(reduced.finalDamage,Math.floor(defended*taken*.89));
 // No footwork is equipped; this is a separate final multiplier, not the ordinary unload cap.
 assert.notEqual(reduced.finalDamage,Math.floor(D.defend({blunt:44.5,pierce:44.5},{armor:{blunt:.3,pierce:.1},permanentArmor:true,flexibility:144,part:{blunt:.8,pierce:1.2}}).damage*taken));
 for(const part of ['chest','abdomen','left_arm','right_arm','left_leg','right_leg']){
  M.setState({});const before=run({hitPart:part}).finalDamage;M.setState({unlocked:lit(neck)});assert.equal(run({hitPart:part}).finalDamage,before);
 }
 M.setState({});const enemyBase=run({defender:{kind:'enemy',enemyId:'test'}}).finalDamage;
 M.setState({unlocked:lit(neck)});assert.equal(run({defender:{kind:'enemy',enemyId:'test'}}).finalDamage,enemyBase);
 for(const extra of [{hitRollSuccess:false},{forceZeroDamageByResourceInsufficient:true},{damageAfterParry:0,parrySucceeded:true}])assert.equal(run(extra).finalDamage,0);
 for(const dry of [false,true]){
  delivered=[];M.setState({unlocked:lit(neck)});
  const result=run({simultaneousDryRun:dry,segments:[{hitPart:'head',hitRollSuccess:true},{hitPart:'head',hitRollSuccess:true},{hitPart:'chest',hitRollSuccess:true}]});
  assert.equal(result.segmentsResults[0].finalDamage,reduced.finalDamage);assert.equal(result.segmentsResults[1].finalDamage,reduced.finalDamage);
  const expected=result.segmentsResults.map(s=>({part:s.hitPart,damage:s.finalDamage}));
  if(dry){assert.equal(delivered.length,0);M.setState({});P.finalizeSimultaneousStrike(result);P.finalizeSimultaneousStrike(result);}
  assert.deepEqual(delivered,copy(expected));
 }
 // Final rounding, not rounding the existing integer damage before the neck multiplier.
 flex=0;taken=1;g.CharacterAttributes.getDamageTypeModifier=()=>1;g.InventoryEquipment.getHeadDamageReduce=()=>0;M.setState({unlocked:lit(neck)});
 assert.equal(run({rawDamage:10.2,typedDamage:{blunt:10.2},damageAfterParry:10.2}).finalDamage,9);
});

test('stun growth applies after armor/drug resistance, locks simultaneous gains, and reduces wall gain without changing decay or duration',async()=>{
 const g=await context(),M=g.Muscles;load(g,['inventory-equipment','combat-pipeline']);const IE=g.InventoryEquipment,P=g.CombatPipeline;
 let armor=.4,drug=.1,delivered=[];IE.getHeadAntiStunPct=()=>armor;
 g.BuffSystem={getAntiStunPct:()=>drug};
 g.CharacterAttributes={getCfg:(id,fallback)=>id==='stun_head_hit_base'?50:id==='stun_head_hit_blunt_mult'?1:fallback,applyCombatDestroy:(part,damage)=>delivered.push(damage)};
 g.CombatSkills={getSkill:()=>({stun_per_part:{chest:50}})};
 P.setConfig({pipelines:{stun:{phases:[{handler:'builtin.stun_accumulate_player'},{handler:'builtin.damage_stub'}]}}});
 const run=(extra={})=>P.runPipeline('stun',{rawDamage:100,hitRollSuccess:true,hitPart:'head',skillId:'test',attacker:{kind:'enemy'},defender:{kind:'player'},...extra});
 IE.setPlayerStunValue(0);run();assert.equal(IE.getPlayerStunValue(),25);
 M.setState({unlocked:lit(neck)});IE.setPlayerStunValue(0);run();assert.equal(IE.getPlayerStunValue(),20);
 IE.setPlayerStunValue(0);run({hitPart:'chest'});assert.equal(IE.getPlayerStunValue(),20);
 armor=.6;drug=.6;IE.setPlayerStunValue(0);run();assert.equal(IE.getPlayerStunValue(),4);
 armor=.4;drug=.1;IE.setPlayerStunValue(0);const pending=run({simultaneousDryRun:true});assert.equal(pending.pendingStunGain,20);assert.equal(IE.getPlayerStunValue(),0);
 M.setState({});P.finalizeSimultaneousStrike(pending);P.finalizeSimultaneousStrike(pending);assert.equal(IE.getPlayerStunValue(),20);
 M.setState({unlocked:lit(neck)});IE.setPlayerStunValue(0);
 for(const extra of [{hitRollSuccess:false},{blockTargetEffects:true},{defender:{kind:'enemy',enemyId:'test'}},{hitPart:'left_leg'}])run(extra);
 assert.equal(IE.getPlayerStunValue(),0);assert.equal(IE.getPlayerStunGain(1),1);assert.equal(IE.getPlayerStunGain(0),0);
 IE.setPlayerStunValue(70);IE.setPlayerStunValue(IE.getPlayerStunValue()-10);assert.equal(IE.getPlayerStunValue(),60);
 assert.equal(IE.addPlayerStun(50).triggered,true);assert.equal(IE.getPlayerStunValue(),0);assert.equal(IE.isPlayerStunned(),true);
 assert.equal(IE.consumePlayerStunRoundIfBlocking(),true);assert.equal(IE.consumePlayerStunRoundIfBlocking(),false);
 IE.setPlayerStunValue(55);M.setState(copy(M.getState()));assert.equal(IE.getPlayerStunValue(),55);
 const map={map_id:'test',enemies:[{enemy_id:'test',x:0,y:1}]};
 g.GameEngine={getMap:()=>map,getState:()=>({mapId:'test',x:1,y:1}),isWalkable:()=>false};
 let enemyStun=0;g.CombatEnemies={getById:()=>({jingu:1,speed:1}),isEnemyDead:()=>false,onEnemyDamageResolved:()=>{},addEnemyStun:(map,index,id,n)=>enemyStun+=n};load(g,['combat-world']);
 IE.setPlayerStunValue(0);delivered=[];
 const wall={finalDamage:89,hitRollSuccess:true,hitPart:'head',attacker:{kind:'enemy',enemyId:'test',pos:{x:0,y:1}},defender:{kind:'player'}};
 g.CombatWorld.queueDisplacement(wall,{cells:1});g.CombatWorld.flushDisplacements();g.CombatWorld.flushDisplacements();
 assert.deepEqual(delivered,[26]);assert.equal(IE.getPlayerStunValue(),40);
 g.CombatWorld.queueDisplacement({...wall,attacker:{kind:'player',pos:{x:1,y:1}},defender:{kind:'enemy',enemyId:'test',index:0,mapId:'test'}},{cells:1});g.CombatWorld.flushDisplacements();assert.equal(enemyStun,50);
});

for(const full of [false,true])test(`neck ${full?'Svelte':'classic'}: final training rollback, legacy saves, breath replacement and signed reward displays`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();d.getElementById('creation-name').value='颈部成长';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,G=g.GymSystem,S=g.Survival,SS=g.SaveSystem,IE=g.InventoryEquipment,CA=g.CharacterAttributes;
  IE.getState().skills.special_meridian_studies={level:1};IE.getState().skills.combat_basic_breath={level:100};S.setState({nutrition:20});CA.recalcCharacterStats();
  const baseline=CA.getState().acquired.breath,innate=copy(CA.getState().innate),target='neck_sternocleidomastoid_L';
  const a=g.GymData.ACTIONS.find(a=>a.main.includes(target));assert.ok(a);const initial=copy(G.getState());initial.levels[a.station]=1;initial.levels[G.moduleKey(a)]=1;G.restore(initial,true);
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);let found=false;
  for(let y=0;y<10&&!found;y++)for(let x=0;x<9&&!found;x++)if(g.GameEngine.isWalkable(x,y)){g.GameEngine.setState('M0_Base_Inside_lv_1',x,y);found=G.at(a.station);}assert.ok(found);
  M.setState({unlocked:lit(neck.filter(m=>m.id!==target)),progress:{[target]:99.999}});CA.recalcCharacterStats();
  S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20,isDead:false,isComa:false});
  let serial=105000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
  g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++serial,fn),serial):oldSet(fn,ms,...args);g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
  const step=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  assert.equal(G.startTraining(a.id).ok,true);step();const before=copy(M.getState()),save=SS.saveNow;SS.saveNow=()=>false;step();SS.saveNow=save;
  assert.deepEqual(copy(M.getState()),before);near(M.getHeadDamageMultiplier(),.892);assert.equal(IE.getPlayerStunGain(50),50);
  G.retry();step();near(M.getHeadDamageMultiplier(),.89);assert.equal(IE.getPlayerStunGain(50),40);near(CA.getState().acquired.breath,baseline);assert.deepEqual(copy(CA.getState().innate),innate);
  const saved=copy(SS.buildSnapshotForDebug());for(let i=0;i<2;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();near(M.getHeadDamageMultiplier(),.89);assert.equal(IE.getPlayerStunGain(50),40);}
  const old=copy(saved);old.muscles={unlocked:lit(neck),equipped:{}};assert.equal(SS.applySnapshotForDebug(old),true);await h.drain();near(CA.getState().acquired.breath,baseline);near(M.getHeadDamageMultiplier(),.89);assert.equal(IE.getPlayerStunGain(50),40);
  g.GymPanel.close();await openMuscleRewards(h);
  const summary=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');for(const label of ['头部独立卸力率+11%','眩晕条增长-20%'])assert.ok(summary.includes(label),summary);assert.equal(summary.includes('+-'),false);
  const groupView=await readMuscleGroup(h,'neck');
  const details=groupView.text;assert.ok(details.includes('头部独立卸力率+0.2%'));assert.equal(details.includes('后天呼吸+1'),false);
  const reward=completionText(g,groupView.id);assert.ok(reward.includes('眩晕条增长-20%'));assert.ok(reward.includes('已解锁'));assert.equal(reward.includes('+-'),false);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
