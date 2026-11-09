import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v)),read=p=>fs.readFileSync(p,'utf8');
const data=JSON.parse(read('data/muscles.json'));
const group=id=>data.muscles.filter(m=>m.group===id);
const hips=side=>group('hip_'+side),all=[...hips('l'),...hips('r')];
const lit=list=>Object.fromEntries(list.map(m=>[m.id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function context(){
 const g=vm.createContext({fetch:async()=>({ok:true,json:async()=>copy(data)})});g.window=g;
 vm.runInContext(read('js/muscles.js'),g);await g.Muscles.ready;return g;
}

test('26 hip muscles grant acquired dexterity percentages; each entire side independently grants flexibility',async()=>{
 const g=await context(),M=g.Muscles;
 assert.equal(hips('l').length,13);assert.equal(hips('r').length,13);
 for(const m of all){
  assert.deepEqual(m.effects,[{type:'acquiredAttributePercent',attribute:'dexterity',delta:.5}]);
  M.setState({progress:{[m.id]:99.999}});assert.equal(M.getStatBonus().acquiredPercent.dexterity,0);
  M.addGrowth(m.id,.001);assert.equal(M.getStatBonus().acquiredPercent.dexterity,.5);
  assert.equal(M.getStatBonus().acquiredPercent.flexibility,0);assert.equal(M.getStatBonus().acquired.jingu,0);
  assert.equal(M.getEffectsText(m.id),'后天身手+0.5%');assert.equal(M.getSexualAbilityBonus(),0);
  for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(m.id,10);assert.equal(M.getStatBonus().acquiredPercent.dexterity,.5);}
  M.setState({unlocked:lit(all.filter(x=>x.id!==m.id)),progress:{[m.id]:99.999}});
  assert.equal(M.getStatBonus().acquiredPercent.dexterity,12.5);assert.equal(M.getStatBonus().acquiredPercent.flexibility,6);
  assert.equal(M.isGroupComplete(m.group),false);
  M.addGrowth(m.id,.001);assert.equal(M.getStatBonus().acquiredPercent.dexterity,13);assert.equal(M.getStatBonus().acquiredPercent.flexibility,12);
 }
 for(const side of ['l','r']){
  M.setState({unlocked:lit(hips(side))});assert.equal(M.getStatBonus().acquiredPercent.dexterity,6.5);assert.equal(M.getStatBonus().acquiredPercent.flexibility,6);
 }
 M.setState({unlocked:{unknown:true}});assert.equal(M.getStatBonus().acquiredPercent.dexterity,0);assert.equal(M.getStatBonus().acquiredPercent.flexibility,0);
});

test('hip percentages add to calf milestones in one independent multiplier and follow live acquired values',async()=>{
 const g=await context(),M=g.Muscles;
 vm.runInContext(read('js/character-attributes.js'),g);const CA=g.CharacterAttributes;
 CA.setState({innate:{jingu:20,flexibility:20,breath:20,dexterity:20,focus:20}});
 const acq=()=>{CA.recalcCharacterStats();return CA.getState().acquired;};
 CA.setExternalAcquiredBonus({dexterity:100,flexibility:50,jingu:40});
 M.setState({unlocked:lit([all[0]])});near(acq().dexterity,100.5);near(acq().flexibility,50);
 M.setState({unlocked:lit(hips('l'))});near(acq().dexterity,106.5);near(acq().flexibility,53);
 M.setState({unlocked:lit(all)});near(acq().dexterity,113);near(acq().flexibility,56);near(acq().jingu,40);
 for(let i=0;i<3;i++){near(acq().dexterity,113);near(acq().flexibility,56);}
 M.setState({unlocked:lit([...all,...group('calf_l'),...group('calf_r'),...group('thigh_l'),...group('thigh_r')])});
 near(acq().dexterity,125);near(acq().flexibility,56);near(acq().jingu,40);
 for(const attr of ['dexterity','flexibility','jingu'])assert.equal(CA.getInnateAttr(attr),20);
 assert.equal(M.getSexualAbilityBonus(),28);
 CA.setExternalAcquiredBonus({dexterity:1,flexibility:1});near(acq().dexterity,1.25);near(acq().flexibility,1.12);
 CA.setExternalAcquiredBonus({dexterity:200,flexibility:100});near(acq().dexterity,250);near(acq().flexibility,112);
 CA.setExternalAcquiredMultiplier({dexterity:.9,flexibility:.9});near(acq().dexterity,225);near(acq().flexibility,100.8);
 g.CombatBreath={mounted:()=>({acquired_total_attribute_pct:.1})};near(acq().dexterity,250);near(acq().flexibility,113.12);
 g.CombatBreath=null;CA.setExternalAcquiredBonus({});CA.setExternalAcquiredMultiplier({});near(acq().dexterity,0);near(acq().flexibility,0);
 M.setState({});CA.setExternalAcquiredBonus({dexterity:100,flexibility:50});near(acq().dexterity,100);near(acq().flexibility,50);
});

for(const full of [false,true])test(`hip ${full?'Svelte':'classic'}: training save rollback, both percentage rewards, old saves and visible UI`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  d.getElementById('creation-name').value='髋部成长';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,G=g.GymSystem,S=g.Survival,SS=g.SaveSystem,IE=g.InventoryEquipment,CA=g.CharacterAttributes;
  IE.getState().skills.special_meridian_studies={level:1};IE.getState().skills.combat_basic_unarmed={level:50};CA.recalcCharacterStats();
  const baseline=copy(CA.getState().acquired),innate=copy(CA.getState().innate);assert.ok(baseline.dexterity>0);assert.ok(baseline.flexibility>0);
  const target=all[0].id,a=g.GymData.ACTIONS.find(a=>a.main.includes(target));assert.ok(a);
  const initial=copy(G.getState());initial.levels[a.station]=1;initial.levels[G.moduleKey(a)]=1;G.restore(initial,true);
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);
  let found=false;for(let y=0;y<10&&!found;y++)for(let x=0;x<9&&!found;x++)if(g.GameEngine.isWalkable(x,y)){g.GameEngine.setState('M0_Base_Inside_lv_1',x,y);found=G.at(a.station);}
  assert.ok(found);
  M.setState({unlocked:lit(all.filter(m=>m.id!==target)),progress:{[target]:99.999}});CA.recalcCharacterStats();
  near(CA.getState().acquired.dexterity,baseline.dexterity*1.125);near(CA.getState().acquired.flexibility,baseline.flexibility*1.06);
  S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20,isDead:false,isComa:false});
  let serial=98000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
  g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++serial,fn),serial):oldSet(fn,ms,...args);
  g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
  const step=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  assert.equal(G.startTraining(a.id).ok,true);step();const before=copy(M.getState()),save=SS.saveNow;
  SS.saveNow=()=>false;step();SS.saveNow=save;assert.deepEqual(copy(M.getState()),before);
  near(CA.getState().acquired.dexterity,baseline.dexterity*1.125);near(CA.getState().acquired.flexibility,baseline.flexibility*1.06);
  G.retry();step();near(CA.getState().acquired.dexterity,baseline.dexterity*1.13);near(CA.getState().acquired.flexibility,baseline.flexibility*1.12);
  assert.deepEqual(copy(CA.getState().innate),innate);near(CA.getState().acquired.jingu,baseline.jingu);
  const saved=copy(SS.buildSnapshotForDebug());
  for(let i=0;i<2;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();near(CA.getState().acquired.dexterity,baseline.dexterity*1.13);near(CA.getState().acquired.flexibility,baseline.flexibility*1.12);}
  const old=copy(saved);old.muscles={unlocked:lit([...all,...group('calf_l'),...group('calf_r')]),equipped:{}};
  assert.equal(SS.applySnapshotForDebug(old),true);await h.drain();near(CA.getState().acquired.dexterity,baseline.dexterity*1.25);near(CA.getState().acquired.flexibility,baseline.flexibility*1.12);
  g.GymPanel.close();await openMuscleRewards(h);
  const summary=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');
  for(const label of ['后天身手+25%','后天柔韧+12%'])assert.ok(summary.includes(label),summary);
  for(const [limb,id]of [['lfoot','hip_l'],['rfoot','hip_r']]){
   const groupView=await readMuscleGroup(h,id);
   const details=groupView.text;assert.ok(details.includes('后天身手+0.5%'),details);assert.equal(details.includes('后天筋骨'),false);
   const reward=completionText(g,groupView.id);assert.ok(reward.includes('后天柔韧+6%'),reward);assert.ok(reward.includes('已解锁'),reward);

  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
