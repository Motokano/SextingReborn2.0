import {startTraining} from './lib/gym-training-test.mjs';
import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v));
const read=p=>fs.readFileSync(p,'utf8');
const data=JSON.parse(read('data/muscles.json'));
const group=id=>data.muscles.filter(m=>m.group===id);
const lit=list=>Object.fromEntries(list.map(m=>[m.id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function context(){
 const g=vm.createContext({fetch:async()=>({ok:true,json:async()=>copy(data)})});g.window=g;
 vm.runInContext(read('js/muscles.js'),g);await g.Muscles.ready;return g;
}

for(const {prefix,count,limbs,names,flatGroup,originalAttribute} of [
 {prefix:'calf',count:13,limbs:['lfoot','rfoot'],names:['左腿','右腿'],flatGroup:'foot',originalAttribute:'flexibility'},
 {prefix:'forearm',count:19,limbs:['lhand','rhand'],names:['左臂','右臂'],flatGroup:'hand',originalAttribute:'dexterity'}
]){
const parts=side=>group(prefix+'_'+side),fullPercent=count*.5,partialPercent=(count-1)*.5;
const outside=['lhand','rhand','lfoot','rfoot'].filter(limb=>!limbs.includes(limb));

test(`${count*2} ${prefix} rewards replace flat attributes, add only same-limb speed, and require every entry for each 6% milestone`,async()=>{
 const g=await context(),M=g.Muscles;
 for(const side of ['l','r']){
  const limb=limbs[side==='l'?0:1],other=limbs[side==='l'?1:0];
  assert.equal(parts(side).length,count);
  for(const m of parts(side)){
   assert.deepEqual(m.effects,[{type:'limbAttackSpeedPercent',delta:.5,limb}]);
   M.setState({progress:{[m.id]:99.999}});near(M.getAttackSpeedPercentForLimb(limb),0);
   M.addGrowth(m.id,.001);near(M.getAttackSpeedPercentForLimb(limb),.5);near(M.getAttackSpeedPercentForLimb(other),0);
   assert.equal(M.getStatBonus().acquired[originalAttribute],0);
   assert.equal(M.getEffectsText(m.id),names[side==='l'?0:1]+'出招速度+0.5%');
   const unlocked=lit([...parts('l'),...parts('r')]);delete unlocked[m.id];
   M.setState({unlocked,progress:{[m.id]:99.999}});
   near(M.getStatBonus().acquiredPercent.dexterity,6);near(M.getAttackSpeedPercentForLimb(limb),partialPercent);near(M.getAttackSpeedPercentForLimb(other),fullPercent);
   M.addGrowth(m.id,.001);near(M.getStatBonus().acquiredPercent.dexterity,12);
   for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(m.id,10);near(M.getStatBonus().acquiredPercent.dexterity,12);near(M.getAttackSpeedPercentForLimb(limb),fullPercent);}
  }
 }
 for(const limb of [...outside,'weapon_left'])near(M.getAttackSpeedPercentForLimb(limb),0);
 M.setState({unlocked:{unknown:true}});near(M.getStatBonus().acquiredPercent.dexterity,0);
 near(M.getAttackSpeedPercentForLimb(limbs[0]),0);
});

test(`${prefix} completion scales current acquired dexterity once, preserves innate and decimals, and follows source changes`,async()=>{
 const g=await context(),M=g.Muscles;
 vm.runInContext(read('js/character-attributes.js'),g);const CA=g.CharacterAttributes;
 CA.setState({innate:{jingu:20,flexibility:20,breath:20,dexterity:20,focus:20}});
 const acq=()=>{CA.recalcCharacterStats();return CA.getState().acquired.dexterity;};
 CA.setExternalAcquiredBonus({dexterity:100});near(acq(),100);
 M.setState({unlocked:lit(parts('l'))});near(acq(),106);assert.equal(CA.getInnateAttr('dexterity'),20);
 M.setState({unlocked:lit([...parts('l'),...parts('r')])});near(acq(),112);
 for(let i=0;i<4;i++)near(acq(),112);
 CA.setExternalAcquiredBonus({dexterity:1});near(acq(),1.12);
 CA.setExternalAcquiredBonus({dexterity:200});near(acq(),224);
 CA.setExternalAcquiredMultiplier({dexterity:.9});near(acq(),201.6);
 g.CombatBreath={mounted:()=>({acquired_total_attribute_pct:.1})};
 near(acq(),224); // (180 + (20 + 180) * 10%) * 1.12
 M.setState({});near(acq(),200);
 CA.setExternalAcquiredBonus({});CA.setExternalAcquiredMultiplier({});g.CombatBreath=null;near(acq(),0);
 M.setState({unlocked:lit(parts('l'))});near(acq(),0,'zero acquired cannot mint a fixed six points');
});

test(`${prefix} speed percentages share the existing speed percent basis and stack with same-limb flat rewards once`,async()=>{
 const g=await context(),M=g.Muscles;
 vm.runInContext(read('js/combat-initiative.js'),g);const CI=g.CombatInitiative;
 g.CharacterAttributes={getCombatSpeed:(pct=0)=>20+pct/10};
 M.setState({unlocked:lit([...parts('l'),...parts('r').slice(0,2),...group(flatGroup+'_l')])});
 near(CI.playerAttackSpeed(20,{limbId:limbs[0]}),25+fullPercent/10);
 near(CI.playerAttackSpeed(20,{limbId:limbs[1]}),20.1);
 for(const limbId of outside)near(CI.playerAttackSpeed(20,{limbId}),20);
 near(CI.playerAttackSpeed(20,{limbId:limbs[0],weaponId:'w'}),20);
 near(CI.playerAttackSpeed(20,{limbId:limbs[0],weaponIntent:{}}),20);
 g.BuffSystem={getBattleMoveSpeedMultiplier:()=>.5,getBattleMoveSpeedDeltaPercent:()=>-10};
 const p=CI.resolvePlayerInitiatedExchange({playerSpeed:20,enemySpeed:12,limbId:limbs[0]});
 near(p.playerBaseSpeed,9);near(p.playerSpeed,14+fullPercent/10);
 near(CI.playerAttackSpeed(p.playerBaseSpeed,{limbId:limbs[1]}),9.1);
 near(CI.effectiveSpeed('player',20),9);
});

for(const full of [false,true])test(`${prefix} ${full?'Svelte':'classic'}: final training rollback, old saves, live attributes, combat and reward UI`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  d.getElementById('creation-name').value=names[0]+'成长';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,G=g.GymSystem,S=g.Survival,SS=g.SaveSystem,IE=g.InventoryEquipment,CA=g.CharacterAttributes;
  IE.getState().skills.special_meridian_studies={level:1};
  IE.getState().skills.combat_basic_unarmed={level:50};
  const target=parts('l')[0].id,a=g.GymData.ACTIONS.find(a=>a.main.includes(target));assert.ok(a);
  const initial=copy(G.getState());initial.levels[a.station]=1;initial.levels[G.moduleKey(a)]=1;G.restore(initial,true);assert.equal(G.level(a),1);
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);
  let found=false;for(let y=0;y<10&&!found;y++)for(let x=0;x<9&&!found;x++)if(g.GameEngine.isWalkable(x,y)){g.GameEngine.setState('M0_Base_Inside_lv_1',x,y);found=G.at(a.station);}
  assert.ok(found);
  const unlocked=lit(parts('l'));delete unlocked[target];
  M.setState({unlocked,progress:{[target]:99.999}});CA.recalcCharacterStats();
  const beforeDex=CA.getState().acquired.dexterity,innate=CA.getInnateAttr('dexterity');assert.ok(beforeDex>0);
  S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20,isDead:false,isComa:false});
  let serial=96000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
  g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++serial,fn),serial):oldSet(fn,ms,...args);
  g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
  const step=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  assert.equal(startTraining(g,a.id).ok,true);step();const before=copy(M.getState()),save=SS.saveNow;
  SS.saveNow=()=>false;step();SS.saveNow=save;
  assert.deepEqual(copy(M.getState()),before);near(M.getAttackSpeedPercentForLimb(limbs[0]),partialPercent);near(CA.getState().acquired.dexterity,beforeDex);
  G.retry();step();near(M.getAttackSpeedPercentForLimb(limbs[0]),fullPercent);near(M.getStatBonus().acquiredPercent.dexterity,6);
  near(CA.getState().acquired.dexterity,beforeDex*1.06);assert.equal(CA.getInnateAttr('dexterity'),innate);
  const saved=copy(SS.buildSnapshotForDebug());
  for(let i=0;i<2;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();near(CA.getState().acquired.dexterity,beforeDex*1.06);}
  const old=copy(saved);old.muscles={unlocked:lit([...parts('l'),...parts('r'),...group(flatGroup+'_l')]),equipped:{}};
  assert.equal(SS.applySnapshotForDebug(old),true);await h.drain();near(M.getStatBonus().acquiredPercent.dexterity,12);near(CA.getState().acquired.dexterity,beforeDex*1.12);
  // Real attack resolution uses the selected limb and does not reapply already-resolved speed.
  const move=g.CombatSkills.getSkill('combat_basic_unarmed').moves[0];
  const input={skillId:'combat_basic_unarmed',moveId:move.id,limbId:limbs[0],powerLevel:10,attackerSpeed:20,defenderSpeed:10};
  S.setState({qi_li_current:100,diqi_current:1000});
  const speed=20+(CA.getCombatSpeed(fullPercent)-CA.getCombatSpeed())+5;
  near(g.CombatMeleeResolve.resolvePlayerVsEnemyAttack(input).attackerSpeed,speed);
  near(g.CombatMeleeResolve.resolvePlayerVsEnemyAttack({...input,attackerSpeed:speed,speedsResolved:true}).attackerSpeed,speed);
  near(g.CombatMeleeResolve.resolvePlayerVsEnemyAttack({...input,limbId:outside[0]}).attackerSpeed,20);
  g.GymPanel.close();await openMuscleRewards(h);
  const summary=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');
  for(const label of [names[0]+'出招速度+'+fullPercent+'%',names[1]+'出招速度+'+fullPercent+'%','后天身手+12%',names[0]+'出招速度+5'])assert.ok(summary.includes(label),summary);
  for(const [limb,id,name]of [[limbs[0],prefix+'_l',names[0]],[limbs[1],prefix+'_r',names[1]]]){
   const groupView=await readMuscleGroup(h,id);
   const details=groupView.text;assert.ok(details.includes(name+'出招速度+0.5%'),details);assert.equal(details.includes(originalAttribute==='flexibility'?'后天柔韧':'后天身手+1'),false);
   const reward=completionText(g,groupView.id);assert.ok(reward.includes('后天身手+6%'),reward);assert.ok(reward.includes('已解锁'),reward);

  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
}

test('forearm, calf and hip dexterity percentages add in one muscle multiplier, never compound',async()=>{
 const g=await context(),M=g.Muscles;
 vm.runInContext(read('js/character-attributes.js'),g);const CA=g.CharacterAttributes;
 CA.setState({innate:{dexterity:20}});CA.setExternalAcquiredBonus({dexterity:100});
 const selected=['forearm_l','forearm_r','calf_l','calf_r','hip_l','hip_r'].flatMap(group);
 M.setState({unlocked:lit(selected)});CA.recalcCharacterStats();
 near(M.getStatBonus().acquiredPercent.dexterity,37);near(CA.getState().acquired.dexterity,137);
 assert.equal(CA.getInnateAttr('dexterity'),20);
 for(let i=0;i<3;i++){M.setState(copy(M.getState()));CA.recalcCharacterStats();near(CA.getState().acquired.dexterity,137);}
 CA.setExternalAcquiredBonus({dexterity:1});CA.recalcCharacterStats();near(CA.getState().acquired.dexterity,1.37);
 CA.setExternalAcquiredBonus({dexterity:100});CA.setExternalAcquiredMultiplier({dexterity:.9});
 CA.recalcCharacterStats();near(CA.getState().acquired.dexterity,123.3);
});
