import {startTraining} from './lib/gym-training-test.mjs';
import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v)),read=p=>fs.readFileSync(p,'utf8');
const data=JSON.parse(read('data/muscles.json')),pelvis=data.muscles.filter(m=>m.group==='pelvis');
const lit=list=>Object.fromEntries(list.map(m=>[m.id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function context(){
 const g=vm.createContext({fetch:async()=>({ok:true,json:async()=>copy(data)})});g.window=g;
 vm.runInContext(read('js/muscles.js'),g);await g.Muscles.ready;return g;
}

test('all 17 pelvic muscles grant 1% acquired breath; every entry is required for the independent 20% diqi cap reward',async()=>{
 const g=await context(),M=g.Muscles;assert.equal(pelvis.length,17);
 for(const m of pelvis){
  assert.deepEqual(m.effects,[{type:'acquiredAttributePercent',attribute:'breath',delta:1}]);
  M.setState({progress:{[m.id]:99.999}});assert.equal(M.getStatBonus().acquiredPercent.breath,0);assert.equal(M.getDiqiCapMultiplier(),1);
  M.addGrowth(m.id,.001);assert.equal(M.getStatBonus().acquiredPercent.breath,1);assert.equal(M.getStatBonus().acquired.breath,0);
  assert.equal(M.getEffectsText(m.id),'后天呼吸+1%');assert.equal(M.getStatBonus().diqiCapPercent,0);
  M.setState({unlocked:lit(pelvis.filter(x=>x.id!==m.id)),progress:{[m.id]:99.999}});
  assert.equal(M.getStatBonus().acquiredPercent.breath,16);assert.equal(M.getDiqiCapMultiplier(),1);assert.equal(M.getStatBonus().diqiCapPercent,0);
  M.addGrowth(m.id,.001);
  for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(m.id,10);assert.equal(M.getStatBonus().acquiredPercent.breath,17);assert.equal(M.getStatBonus().diqiCapPercent,20);assert.equal(M.getDiqiCapMultiplier(),1.2);}
 }
 assert.deepEqual(copy(M.getEffectDisplay(M.getGroupCompletionEffects('pelvis')[0])),{name:'底气上限',value:20,unit:'%'});
 M.setState({unlocked:lit(data.muscles.filter(m=>m.group!=='pelvis'))});assert.equal(M.getDiqiCapMultiplier(),1);
 M.setState({unlocked:{unknown:true}});assert.equal(M.getStatBonus().acquiredPercent.breath,0);assert.equal(M.getDiqiCapMultiplier(),1);
 const fallback=vm.createContext({});fallback.window=fallback;vm.runInContext(read('js/muscles.js'),fallback);
 assert.equal(fallback.Muscles.getDiqiCapMultiplier(),1);
});

test('pelvic breath scales current acquired sources once, preserves innate and decimals, and gives no flat breath',async()=>{
 const g=await context(),M=g.Muscles;
 vm.runInContext(read('js/character-attributes.js'),g);const CA=g.CharacterAttributes;
 CA.setState({innate:{breath:20}});CA.setExternalAcquiredBonus({breath:100});
 const recalc=()=>{CA.recalcCharacterStats();return CA.getState().acquired.breath;};
 near(recalc(),100);M.setState({unlocked:lit([pelvis[0]])});near(recalc(),101);
 M.setState({unlocked:lit(pelvis)});near(recalc(),117);assert.equal(CA.getInnateAttr('breath'),20);
 for(let i=0;i<3;i++)near(recalc(),117);
 CA.setExternalAcquiredBonus({breath:1});near(recalc(),1.17);
 CA.setExternalAcquiredBonus({breath:200});near(recalc(),234);
 CA.setExternalAcquiredMultiplier({breath:.9});near(recalc(),210.6);
 g.CombatBreath={mounted:()=>({acquired_total_attribute_pct:.1})};near(recalc(),234);
 g.CombatBreath=null;CA.setExternalAcquiredBonus({});CA.setExternalAcquiredMultiplier({});near(recalc(),0);
 M.setState({});CA.setExternalAcquiredBonus({breath:100});near(recalc(),100);
});

test('diqi multiplier includes breath, peak nutrition and flat sources once, respects hard caps and preserves trained/current diqi',async()=>{
 const g=await context(),M=g.Muscles;
 for(const name of ['character-attributes','survival'])vm.runInContext(read('js/'+name+'.js'),g);
 const CA=g.CharacterAttributes,S=g.Survival,config=JSON.parse(read('data/survival-config.json'));let level=100;
 g.InventoryEquipment={getSkillLevel:id=>id==='combat_basic_breath'?level:0};
 S.setConfig(config);S.setState({nutrition:20});CA.setState({innate:{breath:20}});CA.setExternalAcquiredBonus({breath:100});CA.recalcCharacterStats();
 near(S.getState().diqi_cap_limit,220);
 S.setState({diqi_max:10,diqi_current:5,diqi_shield_remaining:7});
 M.setState({unlocked:lit(pelvis)});CA.recalcCharacterStats();near(S.getState().diqi_cap_limit,284.4);
 assert.equal(S.getState().diqi_max,10);assert.equal(S.getState().diqi_current,5);assert.equal(S.getState().diqi_shield_remaining,7);
 const diaphragm=data.muscles.find(m=>m.id==='chest_diaphragm');assert.ok(diaphragm);
 M.setState({unlocked:lit([...pelvis,diaphragm])});CA.recalcCharacterStats();near(S.getState().diqi_cap_limit,284.4);assert.equal(M.getStatBonus().maxQi,0);
 S.setDiqiCapLimitFlatBonus('fixture',10);near(S.getState().diqi_cap_limit,296.4);
 S.setDiqiCapLimitFlatBonus('test',30);near(S.getState().diqi_cap_limit,332.4);
 S.setState({nutrition:80});CA.recalcCharacterStats();near(S.getState().diqi_cap_limit,350.4);
 for(let i=0;i<3;i++){CA.recalcCharacterStats();S.refreshDiqiMaxFromBreath(CA.getEffectiveAttr('breath'));near(S.getState().diqi_cap_limit,350.4);}
 level=200;CA.recalcCharacterStats();near(S.getState().diqi_cap_limit,652.8);
 S.setConfig({...config,diqi_cap_limit_hard_max:300});CA.recalcCharacterStats();near(S.getState().diqi_cap_limit,300);
 S.setConfig(config);level=100;S.setState({nutrition:20});S.removeDiqiCapLimitFlatBonus('test');CA.recalcCharacterStats();near(S.getState().diqi_cap_limit,296.4);
 S.setState({diqi_max:290,diqi_current:280});
 M.setState({unlocked:lit(pelvis.slice(1).concat(diaphragm))});CA.recalcCharacterStats();near(S.getState().diqi_cap_limit,246);
 near(S.getState().diqi_max,246);near(S.getState().diqi_current,246);assert.equal(S.getState().diqi_shield_remaining,7);
 // Reloading derived cap data cannot turn the multiplier into a stored flat reward.
 const saved=copy(S.getState()),muscles=copy(M.getState());
 for(let i=0;i<3;i++){S.setState(saved);M.setState(muscles);CA.recalcCharacterStats();near(S.getState().diqi_cap_limit,246);assert.deepEqual(copy(S.getState().diqi_cap_limit_flat_bonuses),{fixture:10});}
 S.removeDiqiCapLimitFlatBonus('fixture');M.setState({unlocked:lit(pelvis)});level=0;CA.recalcCharacterStats();near(S.getState().diqi_cap_limit,0);
 assert.equal(S.getState().diqi_max,0);assert.equal(S.getState().diqi_current,0);
 g.Muscles=null;level=100;near(S.computeDiqiCapLimitFromBreath(20),120);
});

for(const full of [false,true])test(`pelvis ${full?'Svelte':'classic'}: final training rollback, old saves, derived cap and both reward displays`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  d.getElementById('creation-name').value='盆底成长';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,G=g.GymSystem,S=g.Survival,SS=g.SaveSystem,IE=g.InventoryEquipment,CA=g.CharacterAttributes;
  IE.getState().skills.special_meridian_studies={level:1};IE.getState().skills.combat_basic_breath={level:100};S.setState({nutrition:20});CA.recalcCharacterStats();
  const baseline=CA.getState().acquired.breath,innate=copy(CA.getState().innate);assert.ok(baseline>0);
  const expectedBefore=100*(1+.01*(CA.getInnateAttr('breath')+baseline*1.16));
  const expectedAfter=100*(1+.01*(CA.getInnateAttr('breath')+baseline*1.17))*1.2;
  const target=pelvis[0].id,a=g.GymData.ACTIONS.find(a=>a.main.includes(target));assert.ok(a);
  const initial=copy(G.getState());initial.levels[a.station]=1;initial.levels[G.moduleKey(a)]=1;G.restore(initial,true);
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);
  let found=false;for(let y=0;y<10&&!found;y++)for(let x=0;x<9&&!found;x++)if(g.GameEngine.isWalkable(x,y)){g.GameEngine.setState('M0_Base_Inside_lv_1',x,y);found=G.at(a.station);}
  assert.ok(found);
  M.setState({unlocked:lit(pelvis.filter(m=>m.id!==target)),progress:{[target]:99.999}});CA.recalcCharacterStats();
  near(CA.getState().acquired.breath,baseline*1.16);near(S.getState().diqi_cap_limit,expectedBefore);
  S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,isDead:false,isComa:false,diqi_max:10,diqi_current:0});
  let serial=101000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
  g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++serial,fn),serial):oldSet(fn,ms,...args);
  g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
  const step=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  assert.equal(startTraining(g,a.id).ok,true);step();const before=copy(M.getState()),save=SS.saveNow;
  SS.saveNow=()=>false;step();SS.saveNow=save;assert.deepEqual(copy(M.getState()),before);
  near(CA.getState().acquired.breath,baseline*1.16);near(S.getState().diqi_cap_limit,expectedBefore);assert.equal(M.getDiqiCapMultiplier(),1);
  G.retry();step();near(CA.getState().acquired.breath,baseline*1.17);near(S.getState().diqi_cap_limit,expectedAfter);assert.equal(M.getDiqiCapMultiplier(),1.2);
  assert.deepEqual(copy(CA.getState().innate),innate);assert.equal(S.getState().diqi_max,10);
  const saved=copy(SS.buildSnapshotForDebug());
  for(let i=0;i<2;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();near(CA.getState().acquired.breath,baseline*1.17);near(S.getState().diqi_cap_limit,expectedAfter);}
  const old=copy(saved);old.muscles={unlocked:lit(pelvis),equipped:{}};
  assert.equal(SS.applySnapshotForDebug(old),true);await h.drain();near(S.getState().diqi_cap_limit,expectedAfter);
  g.GymPanel.close();await openMuscleRewards(h);
  const summary=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');
  for(const label of ['后天呼吸+17%','底气上限+20%'])assert.ok(summary.includes(label),summary);
  const groupView=await readMuscleGroup(h,'pelvis');
  const details=groupView.text;assert.ok(details.includes('后天呼吸+1%'),details);assert.equal(details.includes('后天呼吸+2'),false);
  const reward=completionText(g,groupView.id);assert.ok(reward.includes('底气上限+20%'),reward);assert.ok(reward.includes('已解锁'),reward);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
