import {startTraining} from './lib/gym-training-test.mjs';
import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v)),read=p=>fs.readFileSync(p,'utf8');
const data=JSON.parse(read('data/muscles.json'));
const shoulders=side=>data.muscles.filter(m=>m.group==='shoulder_'+side),all=[...shoulders('l'),...shoulders('r')];
const lit=list=>Object.fromEntries(list.map(m=>[m.id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function context(){
 const g=vm.createContext({fetch:async()=>({ok:true,json:async()=>copy(data)})});g.window=g;
 vm.runInContext(read('js/muscles.js'),g);await g.Muscles.ready;return g;
}

test('10 shoulder muscles replace dexterity with acquired strength percentages; every entry is required for each 5kg reward',async()=>{
 const g=await context(),M=g.Muscles;
 assert.equal(shoulders('l').length,5);assert.equal(shoulders('r').length,5);
 for(const m of all){
  assert.deepEqual(m.effects,[{type:'acquiredAttributePercent',attribute:'jingu',delta:1}]);
  M.setState({progress:{[m.id]:99.999}});assert.equal(M.getStatBonus().acquiredPercent.jingu,0);assert.equal(M.getStatBonus().carryCapacityKg,0);
  M.addGrowth(m.id,.001);assert.equal(M.getStatBonus().acquiredPercent.jingu,1);assert.equal(M.getStatBonus().carryCapacityKg,0);
  assert.equal(M.getStatBonus().acquired.dexterity,0);assert.equal(M.getStatBonus().acquired.jingu,0);assert.equal(M.getEffectsText(m.id),'后天筋骨+1%');
  assert.equal(M.getSexualAbilityBonus(),0);
  M.setState({unlocked:lit(all.filter(x=>x.id!==m.id)),progress:{[m.id]:99.999}});
  assert.equal(M.isGroupComplete(m.group),false);assert.equal(M.getStatBonus().acquiredPercent.jingu,9);assert.equal(M.getStatBonus().carryCapacityKg,5);
  M.addGrowth(m.id,.001);
  for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(m.id,10);assert.equal(M.getStatBonus().acquiredPercent.jingu,10);assert.equal(M.getStatBonus().carryCapacityKg,10);}
 }
 for(const side of ['l','r']){
  M.setState({unlocked:lit(shoulders(side))});assert.equal(M.getStatBonus().acquiredPercent.jingu,5);assert.equal(M.getStatBonus().carryCapacityKg,5);
  const effects=M.getGroupCompletionEffects('shoulder_'+side);assert.deepEqual(copy(effects),[{type:'carryCapacityKg',delta:5}]);
  assert.deepEqual(copy(M.getEffectDisplay(effects[0])),{name:'负重上限',value:5,unit:'kg'});
 }
 M.setState({unlocked:lit(data.muscles.filter(m=>!all.includes(m)))});assert.equal(M.getStatBonus().carryCapacityKg,0);
 M.setState({unlocked:{unknown:true}});assert.equal(M.getStatBonus().carryCapacityKg,0);assert.equal(M.getStatBonus().acquiredPercent.jingu,0);
});

test('shoulder strength uses the independent acquired multiplier while flat kilograms stack after strength, skills and pharmacy',async()=>{
 const g=await context(),M=g.Muscles;
 vm.runInContext(read('js/character-attributes.js'),g);const CA=g.CharacterAttributes;
 CA.setState({innate:{jingu:20,dexterity:20}});CA.setExternalAcquiredBonus({jingu:100});
 const recalc=()=>{CA.recalcCharacterStats();return CA.getState().acquired.jingu;};
 near(recalc(),100);near(CA.getCarryCapacity(),26.5);
 M.setState({unlocked:lit(shoulders('l'))});near(recalc(),105);near(CA.getCarryCapacity(),31.5625);
 M.setState({unlocked:lit(all)});near(recalc(),110);near(CA.getCarryCapacity(),36.625);assert.equal(CA.getInnateAttr('jingu'),20);
 for(let i=0;i<3;i++){near(recalc(),110);near(CA.getCarryCapacity(),36.625);}
 CA.setExternalAcquiredBonus({jingu:1});near(recalc(),1.1);
 CA.setExternalAcquiredBonus({jingu:200});near(recalc(),220);
 CA.setExternalAcquiredMultiplier({jingu:.9});near(recalc(),198);
 g.CombatBreath={mounted:()=>({acquired_total_attribute_pct:.1})};near(recalc(),220);
 // Both changes feed the ordinary weight formula; the 10kg reward itself remains flat.
 CA.setConfig({base_carry_weight_kg:40,jingu_carry_weight_pct_per_point:.01,strength_carry_weight_pct_per_level:.02});
 g.BuffSystem={getPharmacyCarryCapacityBonus:()=>6};
 CA.recalcCharacterStats({getStrengthLevel:()=>50});near(CA.getCarryCapacity(),192);
 g.BuffSystem.getPharmacyCarryCapacityBonus=()=>0;CA.recalcCharacterStats({getStrengthLevel:()=>50});near(CA.getCarryCapacity(),186);
 g.CombatBreath=null;CA.setExternalAcquiredBonus({});CA.setExternalAcquiredMultiplier({});near(recalc(),0);
 near(CA.getCarryCapacity(),58); // 40 * (1 + 20 * .01) + 10, no fixed attribute minted.
 M.setState({});near(recalc(),0);near(CA.getCarryCapacity(),48);
});

for(const full of [false,true])test(`shoulder ${full?'Svelte':'classic'}: final training rollback, old saves, weight HUD and both reward displays`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  d.getElementById('creation-name').value='肩带成长';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,G=g.GymSystem,S=g.Survival,SS=g.SaveSystem,IE=g.InventoryEquipment,CA=g.CharacterAttributes;
  IE.getState().skills.special_meridian_studies={level:1};IE.getState().skills.combat_basic_unarmed={level:50};CA.recalcCharacterStats();
  const baseline=copy(CA.getState().acquired),innate=copy(CA.getState().innate);assert.ok(baseline.jingu>0);
  const baseCapacity=CA.getCarryCapacity(),weight=IE.getCurrentCarryWeight(),slots=IE.getBackpackSlots();
  const strengthWeight=CA.getCfg('base_carry_weight_kg',25)*CA.getCfg('jingu_carry_weight_pct_per_point',.0005)*baseline.jingu;
  const target=all[0].id,a=g.GymData.ACTIONS.find(a=>a.main.includes(target));assert.ok(a);
  const initial=copy(G.getState());initial.levels[a.station]=1;initial.levels[G.moduleKey(a)]=1;G.restore(initial,true);
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);
  let found=false;for(let y=0;y<10&&!found;y++)for(let x=0;x<9&&!found;x++)if(g.GameEngine.isWalkable(x,y)){g.GameEngine.setState('M0_Base_Inside_lv_1',x,y);found=G.at(a.station);}
  assert.ok(found);
  M.setState({unlocked:lit(all.filter(m=>m.id!==target)),progress:{[target]:99.999}});CA.recalcCharacterStats();
  near(CA.getState().acquired.jingu,baseline.jingu*1.09);near(CA.getCarryCapacity(),baseCapacity+strengthWeight*.09+5);
  S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20,isDead:false,isComa:false});
  let serial=100000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
  g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++serial,fn),serial):oldSet(fn,ms,...args);
  g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
  const step=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  assert.equal(startTraining(g,a.id).ok,true);step();const before=copy(M.getState()),save=SS.saveNow;
  SS.saveNow=()=>false;step();SS.saveNow=save;assert.deepEqual(copy(M.getState()),before);
  near(CA.getState().acquired.jingu,baseline.jingu*1.09);near(CA.getCarryCapacity(),baseCapacity+strengthWeight*.09+5);
  G.retry();step();near(CA.getState().acquired.jingu,baseline.jingu*1.1);near(CA.getCarryCapacity(),baseCapacity+strengthWeight*.1+10);
  assert.deepEqual(copy(CA.getState().innate),innate);near(CA.getState().acquired.dexterity,baseline.dexterity);
  assert.equal(IE.getCurrentCarryWeight(),weight);assert.equal(IE.getBackpackSlots(),slots);
  const saved=copy(SS.buildSnapshotForDebug());
  for(let i=0;i<2;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();near(CA.getState().acquired.jingu,baseline.jingu*1.1);near(CA.getCarryCapacity(),baseCapacity+strengthWeight*.1+10);}
  const old=copy(saved);old.muscles={unlocked:lit(all),equipped:{}};
  assert.equal(SS.applySnapshotForDebug(old),true);await h.drain();near(CA.getCarryCapacity(),baseCapacity+strengthWeight*.1+10);
  g.SceneHud.refresh('status');await h.drain();
  const carry=d.querySelector('#status-carry').textContent;assert.ok(carry.includes(CA.getCarryCapacity().toFixed(1)),carry);
  g.GymPanel.close();await openMuscleRewards(h);
  const summary=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');
  for(const label of ['后天筋骨+10%','负重上限+10kg'])assert.ok(summary.includes(label),summary);
  for(const [limb,id]of [['lhand','shoulder_l'],['rhand','shoulder_r']]){
   const groupView=await readMuscleGroup(h,id);
   const details=groupView.text;assert.ok(details.includes('后天筋骨+1%'),details);assert.equal(details.includes('后天身手'),false);
   const reward=completionText(g,groupView.id);assert.ok(reward.includes('负重上限+5kg'),reward);assert.ok(reward.includes('已解锁'),reward);

  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
