import {startTraining} from './lib/gym-training-test.mjs';
import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v)),read=p=>fs.readFileSync(p,'utf8'),json=p=>JSON.parse(read(p));
const data=json('data/muscles.json'),chest=data.muscles.filter(m=>m.group==='chest'),config=json('data/survival-config.json');
const lit=list=>Object.fromEntries(list.map(m=>[m.id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function load(g,names){for(const name of names)vm.runInContext(read('js/'+name+'.js'),g);}
async function context(){
 const g=vm.createContext({console,Math:Object.create(Math),fetch:async p=>({ok:true,json:async()=>json(p)})});g.window=g;
 load(g,['muscles']);await g.Muscles.ready;return g;
}

test('all 19 chest muscles including diaphragm grant 0.4 percentage-point global parry, with every entry required for chest cap',async()=>{
 const g=await context(),M=g.Muscles;assert.equal(chest.length,19);
 for(const m of chest){
  assert.deepEqual(m.effects,[{type:'parryChancePercent',delta:.4}]);
  M.setState({progress:{[m.id]:99.999}});assert.equal(M.getParryChanceBonus(),0);
  M.addGrowth(m.id,.001);near(M.getParryChanceBonus(),.004);assert.equal(M.getEffectsText(m.id),'全局招架率+0.4%');
  assert.equal(M.getStatBonus().maxQi,0);assert.equal(M.getStatBonus().acquired.breath,0);assert.equal(M.getSexualAbilityBonus(),0);
  M.setState({unlocked:lit(chest.filter(x=>x.id!==m.id)),progress:{[m.id]:99.999}});
  near(M.getParryChanceBonus(),.072);assert.equal(M.getDestroyMaxPercentForLimb('chest'),0);M.addGrowth(m.id,.001);
  for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(m.id,1);assert.equal(M.getStatBonus().parryChancePercent,7.6);assert.equal(M.getStatBonus().destroyMaxPercent.chest,10);}
 }
 assert.deepEqual(copy(M.getGroupCompletionEffects('chest').map(M.getEffectDisplay)),[{name:'胸部损毁上限',value:10,unit:'%'}]);
 M.setState({unlocked:lit(data.muscles)});assert.equal(M.getStatBonus().parryChancePercent,11.4);assert.equal(M.getStatBonus().maxQi,0);
 M.setState({unlocked:lit(data.muscles.filter(m=>m.group!=='chest'))});assert.equal(M.getStatBonus().parryChancePercent,3.8);assert.equal(M.getDestroyMaxPercentForLimb('chest'),0);
 M.setState({unlocked:{unknown:true}});assert.equal(M.getParryChanceBonus(),0);assert.equal(M.getDestroyMaxPercentForLimb('chest'),0);
});

test('chest cap affects actual vital damage and pain only at the chest; old breath and diaphragm capacity rewards are removed on recalc',async()=>{
 const g=await context(),M=g.Muscles;load(g,['character-attributes','survival']);const CA=g.CharacterAttributes,S=g.Survival;
 CA.setConfig(config);S.setConfig(config);g.InventoryEquipment={getSkillLevel:id=>id==='combat_basic_breath'?100:0};
 CA.setState({innate:{breath:20}});CA.setExternalAcquiredBonus({breath:100});S.setState({nutrition:20,diqi_cap_limit_flat_bonuses:{muscles:10}});
 M.setState({unlocked:lit(chest)});CA.recalcCharacterStats();assert.equal(CA.getState().acquired.breath,100);assert.equal(CA.getInnateAttr('breath'),20);
 near(S.getState().diqi_cap_limit,220);assert.equal(S.getState().diqi_cap_limit_flat_bonuses.muscles,undefined);
 assert.equal(CA.getBodyPartDestroyMax('chest'),110);
 for(const [part,max] of Object.entries({head:50,abdomen:80,belly:80,lhand:100,rhand:100,lfoot:100,rfoot:100}))assert.equal(CA.getBodyPartDestroyMax(part),max);
 CA.setConfig({...config,body_part_destroy_max:{chest:203}});assert.equal(CA.getBodyPartDestroyMax('chest'),223);CA.setConfig(config);
 CA.setState({part_destroy:{chest:100}});assert.equal(CA.getPartDestroy('chest'),100);
 const pain=[],originalPain=S.addPainFromDestroy;S.addPainFromDestroy=v=>{pain.push(v);originalPain(v);};
 CA.applyCombatDestroy('chest',9);assert.equal(CA.getPartDestroy('chest'),109);assert.equal(S.isDead(),false);assert.equal(pain[0].partMax,110);
 CA.applyCombatDestroy('chest',2);assert.equal(CA.getPartDestroy('chest'),110);assert.equal(S.isDead(),true);
 assert.equal(CA.getPartDestroy('abdomen'),0);
});

test('actual parry phases combine chest and limb bonuses under the shared cap across hit parts, weapon guards and simultaneous segments',async()=>{
 const g=await context(),M=g.Muscles;load(g,['character-attributes','combat-skills','combat-parry','combat-pipeline']);
 const CA=g.CharacterAttributes,CS=g.CombatSkills,P=g.CombatPipeline;CA.setState({innate:{flexibility:20}});CA.recalcCharacterStats();
 const skill={id:'test_footwork',category:'footwork',parry_success_at_level_1:.2,parry_success_at_max:.2,parry_reduce_at_level_1:.1,parry_reduce_at_max:.1};CS.setConfig({skills:{test_footwork:skill}});
 let hub='test_footwork',stunned=false,delta=0,fw=0,guard=null,guardChance=0;
 g.InventoryEquipment={getCombatState:()=>({hubs:{footwork:hub}}),getSkillsState:()=>({test_footwork:{level:1}}),isPlayerStunned:()=>stunned,getFootworkParryBonus:()=>({chance:fw,reduce:0})};
 g.BuffSystem={getParryChanceDeltaPercent:()=>delta};
 g.ModularWeaponCombat={selectGuard:()=>guard,guardBonus:()=>({chance:guardChance,unload:0}),unloadBonus:()=>0,finish:()=>{},targetDefense:()=>({chance:0,unload:0})};
 P.setConfig({pipelines:{player:{phases:[{handler:'builtin.parry_player_combat_parry'}]},enemy:{phases:[{handler:'builtin.parry_enemy_simple'}]}}});
 const run=(hitPart='chest',extra={})=>P.runPipeline('player',{attacker:{kind:'enemy',enemyId:'test'},defender:{kind:'player',isBodyPartDestroyed:()=>false},hitRollSuccess:true,hitPart,rawDamage:100,...extra});
 g.Math.random=()=>.222;assert.equal(run().parrySucceeded,false);M.setState({unlocked:lit([chest[0]])});assert.equal(run().parrySucceeded,true);near(CA.getParryChance(.2),.224);
 M.setState({unlocked:lit(chest)});
 for(const part of ['head','chest','abdomen','left_arm','right_arm','left_leg','right_leg']){const r=run(part);near(r.parryChance,.296);near(r.unloadRatio,.11);}
 M.setState({unlocked:lit(data.muscles.filter(m=>m.group==='chest'||/^thigh_|^upperarm_/.test(m.group)))});near(run().parryChance,.334);near(CA.getParryChance(.2),.334);
 delta=10;fw=.05;guardChance=.1;guard={position:{slot:'weapon_left',blockCoefficient:1,deflectionCoefficient:1}};
 const weapon=run();assert.equal(weapon.guardLimb,'weapon_left');near(weapon.parryChance,.584);near(weapon.unloadRatio,.11);
 delta=30;fw=.3;guardChance=.3;near(run().parryChance,.75);near(CA.getParryChance(.7),.75);
 CA.setConfig({parry_chance_cap:.6});near(run().parryChance,.6);near(CA.getParryChance(.7),.6);
 CA.setConfig({parry_chance_cap:.75});delta=0;fw=0;guardChance=0;guard=null;
 for(const dry of [false,true]){const r=run('chest',{simultaneousDryRun:dry,segments:[{hitRollSuccess:true,hitPart:'left_arm',rawDamage:100},{hitRollSuccess:true,hitPart:'right_leg',rawDamage:100}]});assert.equal(r.segmentsResults.length,2);for(const s of r.segmentsResults)near(s.parryChance,.334);}
 hub=null;assert.equal(run().skipReason,'empty_footwork_slot');hub='test_footwork';stunned=true;assert.equal(run().skipReason,'stunned');stunned=false;
 assert.equal(run('left_leg',{defender:{kind:'player',isBodyPartDestroyed:()=>true}}).skipReason,'struck_limb_destroyed');
 g.SceneCtx={playerExchangeAttackLimb:'lhand'};assert.equal(run('chest',{defender:{kind:'player',isBodyPartDestroyed:part=>part!=='left_arm'}}).skipReason,'no_parry_candidate');g.SceneCtx=null;
 const enemy=P.runPipeline('enemy',{attacker:{kind:'player'},defender:{kind:'enemy',enemyId:'test',parry_rate:.2,parry_damage_reduce:.1},hitRollSuccess:true,hitPart:'chest',rawDamage:100});assert.equal(enemy.parrySucceeded,false);near(enemy.damageAfterParry,90);
});

for(const full of [false,true])test(`chest ${full?'Svelte':'classic'}: final diaphragm training rollback, old saves and both reward displays`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();d.getElementById('creation-name').value='胸部成长';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,G=g.GymSystem,S=g.Survival,SS=g.SaveSystem,IE=g.InventoryEquipment,CA=g.CharacterAttributes;
  IE.getState().skills.special_meridian_studies={level:1};IE.getState().skills.combat_basic_breath={level:100};S.setState({nutrition:20});CA.recalcCharacterStats();
  const baseline=CA.getState().acquired.breath,innate=copy(CA.getState().innate),target='chest_diaphragm';
  const a=g.GymData.ACTIONS.find(a=>a.main.includes(target));assert.ok(a);const initial=copy(G.getState());initial.levels[a.station]=1;initial.levels[G.moduleKey(a)]=1;G.restore(initial,true);
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);let found=false;
  for(let y=0;y<10&&!found;y++)for(let x=0;x<9&&!found;x++)if(g.GameEngine.isWalkable(x,y)){g.GameEngine.setState('M0_Base_Inside_lv_1',x,y);found=G.at(a.station);}assert.ok(found);
  M.setState({unlocked:lit(chest.filter(m=>m.id!==target)),progress:{[target]:99.999}});CA.recalcCharacterStats();const parry=CA.getParryChance(.2),cap=S.getState().diqi_cap_limit;
  S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20,isDead:false,isComa:false});
  let serial=103000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
  g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++serial,fn),serial):oldSet(fn,ms,...args);g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
  const step=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  assert.equal(startTraining(g,a.id).ok,true);step();const before=copy(M.getState()),save=SS.saveNow;SS.saveNow=()=>false;step();SS.saveNow=save;
  assert.deepEqual(copy(M.getState()),before);near(M.getParryChanceBonus(),.072);near(CA.getParryChance(.2),parry);assert.equal(CA.getBodyPartDestroyMax('chest'),100);
  G.retry();step();near(M.getParryChanceBonus(),.076);near(CA.getParryChance(.2),parry+.004);assert.equal(CA.getBodyPartDestroyMax('chest'),110);
  near(CA.getState().acquired.breath,baseline);near(S.getState().diqi_cap_limit,cap);assert.deepEqual(copy(CA.getState().innate),innate);assert.equal(M.getSexualAbilityBonus(),0);
  const saved=copy(SS.buildSnapshotForDebug());for(let i=0;i<2;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();near(M.getParryChanceBonus(),.076);assert.equal(CA.getBodyPartDestroyMax('chest'),110);}
  const old=copy(saved);old.muscles={unlocked:lit(chest),equipped:{}};old.player.survival.diqi_cap_limit_flat_bonuses={muscles:10};
  assert.equal(SS.applySnapshotForDebug(old),true);await h.drain();near(CA.getState().acquired.breath,baseline);near(S.getState().diqi_cap_limit,cap);assert.equal(S.getState().diqi_cap_limit_flat_bonuses.muscles,undefined);
  g.GymPanel.close();await openMuscleRewards(h);
  const summary=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');for(const label of ['全局招架率+7.6%','胸部损毁上限+10%'])assert.ok(summary.includes(label),summary);
  const groupView=await readMuscleGroup(h,'chest');
  const details=groupView.text;assert.ok(details.includes('全局招架率+0.4%'));assert.equal(details.includes('后天呼吸+2'),false);
  const reward=completionText(g,groupView.id);assert.ok(reward.includes('胸部损毁上限+10%'));assert.ok(reward.includes('已解锁'));
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
