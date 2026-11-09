import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v)),read=p=>fs.readFileSync(p,'utf8');
const data=JSON.parse(read('data/muscles.json'));
const hands=side=>data.muscles.filter(m=>m.group==='hand_'+side),all=[...hands('l'),...hands('r')];
const lit=list=>Object.fromEntries(list.map(m=>[m.id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('38 hand muscles replace dexterity with same-arm skill damage; all 19 are required for each flat speed reward',async()=>{
 const g=vm.createContext({fetch:async()=>({ok:true,json:async()=>copy(data)})});g.window=g;
 vm.runInContext(read('js/muscles.js'),g);await g.Muscles.ready;const M=g.Muscles;
 for(const side of ['l','r']){
  const own=side==='l'?'lhand':'rhand',other=side==='l'?'rhand':'lhand';assert.equal(hands(side).length,19);
  for(const m of hands(side)){
   assert.deepEqual(m.effects,[{type:'limbSkillDamagePercent',delta:1,limb:own}]);
   M.setState({progress:{[m.id]:99.999}});assert.equal(M.getSkillDamageBonusForLimb(own),0);
   M.addGrowth(m.id,.001);near(M.getSkillDamageBonusForLimb(own),.01);assert.equal(M.getSkillDamageBonusForLimb(other),0);
   assert.equal(M.getAttackSpeedBonusForLimb(own),0);assert.equal(M.getStatBonus().acquired.dexterity,0);
   assert.equal(M.getEffectsText(m.id),(side==='l'?'左臂':'右臂')+'技能伤害+1%');
   M.setState({unlocked:lit(all.filter(x=>x.id!==m.id)),progress:{[m.id]:99.999}});
   near(M.getSkillDamageBonusForLimb(own),.18);near(M.getSkillDamageBonusForLimb(other),.19);assert.equal(M.getAttackSpeedBonusForLimb(own),0);assert.equal(M.getAttackSpeedBonusForLimb(other),5);
   M.addGrowth(m.id,.001);
   for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(m.id,10);near(M.getSkillDamageBonusForLimb(own),.19);assert.equal(M.getAttackSpeedBonusForLimb(own),5);}
  }
 }
 for(const limb of ['lfoot','rfoot','weapon_left']){assert.equal(M.getSkillDamageBonusForLimb(limb),0);assert.equal(M.getAttackSpeedBonusForLimb(limb),0);}
 vm.runInContext(read('js/combat-initiative.js'),g);const CI=g.CombatInitiative;
 g.CharacterAttributes={getCombatSpeed:(pct=0)=>10+pct/10};
 g.BuffSystem={getBattleMoveSpeedMultiplier:()=>.5,getBattleMoveSpeedDeltaPercent:()=>-10};
 const plan=CI.resolvePlayerInitiatedExchange({playerSpeed:10,enemySpeed:10,limbId:'lhand'});
 assert.equal(plan.playerBaseSpeed,4);assert.equal(plan.playerSpeed,9);assert.equal(CI.effectiveSpeed('player',10),4);
 assert.equal(CI.playerAttackSpeed(4,{limbId:'lhand',weaponId:'w'}),4);assert.equal(CI.playerAttackSpeed(4,{limbId:'lhand',weaponIntent:{}}),4);
 M.setState({unlocked:{unknown:true}});assert.equal(M.getSkillDamageBonusForLimb('lhand'),0);assert.equal(M.getAttackSpeedBonusForLimb('lhand'),0);
});

for(const full of [false,true])test(`hand ${full?'Svelte':'classic'}: final training rollback, old saves, limb isolation and reward UI`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  d.getElementById('creation-name').value='手部成长';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,G=g.GymSystem,S=g.Survival,SS=g.SaveSystem,IE=g.InventoryEquipment,CA=g.CharacterAttributes;
  IE.getState().skills.special_meridian_studies={level:1};IE.getState().skills.combat_basic_unarmed={level:50};CA.recalcCharacterStats();
  const baseline=copy(CA.getState().acquired),speed=CA.getCombatSpeed();
  const target=all[0].id,a=g.GymData.ACTIONS.find(a=>a.main.includes(target));assert.ok(a);
  const initial=copy(G.getState());initial.levels[a.station]=1;initial.levels[G.moduleKey(a)]=1;G.restore(initial,true);
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);
  let found=false;for(let y=0;y<10&&!found;y++)for(let x=0;x<9&&!found;x++)if(g.GameEngine.isWalkable(x,y)){g.GameEngine.setState('M0_Base_Inside_lv_1',x,y);found=G.at(a.station);}
  assert.ok(found);
  M.setState({unlocked:lit(all.filter(m=>m.id!==target)),progress:{[target]:99.999}});CA.recalcCharacterStats();
  S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20,isDead:false,isComa:false});
  let serial=99000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
  g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++serial,fn),serial):oldSet(fn,ms,...args);
  g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
  const step=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  assert.equal(G.startTraining(a.id).ok,true);step();const before=copy(M.getState()),save=SS.saveNow;
  SS.saveNow=()=>false;step();SS.saveNow=save;assert.deepEqual(copy(M.getState()),before);
  near(M.getSkillDamageBonusForLimb('lhand'),.18);assert.equal(M.getAttackSpeedBonusForLimb('lhand'),0);assert.equal(M.getAttackSpeedBonusForLimb('rhand'),5);
  G.retry();step();near(M.getSkillDamageBonusForLimb('lhand'),.19);assert.equal(M.getAttackSpeedBonusForLimb('lhand'),5);
  near(CA.getCombatSpeed(),speed);assert.deepEqual(copy(CA.getState().acquired),baseline);
  const saved=copy(SS.buildSnapshotForDebug());
  for(let i=0;i<2;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();near(M.getSkillDamageBonusForLimb('lhand'),.19);assert.equal(M.getAttackSpeedBonusForLimb('lhand'),5);}
  const old=copy(saved);old.muscles={unlocked:lit([...hands('l'),...hands('r').slice(0,3)]),equipped:{}};
  assert.equal(SS.applySnapshotForDebug(old),true);await h.drain();near(M.getSkillDamageBonusForLimb('lhand'),.19);near(M.getSkillDamageBonusForLimb('rhand'),.03);
  assert.equal(M.getAttackSpeedBonusForLimb('lhand'),5);assert.equal(M.getAttackSpeedBonusForLimb('rhand'),0);assert.deepEqual(copy(CA.getState().acquired),baseline);
  g.GymPanel.close();await openMuscleRewards(h);
  const summary=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');
  for(const label of ['左臂技能伤害+19%','右臂技能伤害+3%','左臂出招速度+5'])assert.ok(summary.includes(label),summary);
  assert.equal(summary.includes('右臂出招速度'),false);
  for(const [limb,id,name]of [['lhand','hand_l','左臂'],['rhand','hand_r','右臂']]){
   const groupView=await readMuscleGroup(h,id);
   const details=groupView.text;assert.ok(details.includes(name+'技能伤害+1%'),details);assert.equal(details.includes('后天身手'),false);
   const reward=completionText(g,groupView.id);assert.ok(reward.includes(name+'出招速度+5'),reward);assert.ok(reward.includes(limb==='lhand'?'已解锁':'未解锁'),reward);

  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
