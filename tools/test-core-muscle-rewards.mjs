import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';
import {createGymPrototype} from './gym-prototype-model.mjs';

const copy=x=>JSON.parse(JSON.stringify(x));
const groups=['chest','back','abdomen','pelvis'];
const attrs=['jingu','flexibility','breath','dexterity','focus'];
const expected=(n,head=0)=>Object.fromEntries(attrs.map(id=>[id,n+(['breath','focus'].includes(id)?head:0)]));
const data=JSON.parse(fs.readFileSync('data/muscles.json','utf8'));
const core=data.muscles.filter(m=>groups.includes(m.group));
const allLit=Object.fromEntries(core.map(m=>[m.id,true]));

test('core reward requires all 110 entries across the four entire groups, once for all five innate attributes',async()=>{
 const g=vm.createContext({fetch:async()=>({ok:true,json:async()=>copy(data)})});
 g.window=g;
 vm.runInContext(fs.readFileSync('js/muscles.js','utf8'),g);await g.Muscles.ready;
 const M=g.Muscles;assert.equal(core.length,110);
 const check=(n,head=0)=>assert.deepEqual(copy(M.getStatBonus().innate),expected(n,head));
 check(0);
 for(const m of core){
  const unlocked=Object.fromEntries(data.muscles.filter(x=>x.id!==m.id).map(x=>[x.id,true]));
  M.setState({unlocked,progress:{[m.id]:99.999}});check(0,1);
 }
 M.setState({unlocked:allLit});check(2);
 const bonus=copy(M.getStatBonus());
 for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(core[0].id,1);check(2);}
 assert.deepEqual(copy(M.getStatBonus()),bonus,'reload and already-lit growth cannot stack the reward');
 assert.equal(M.getStatBonus().acquired.focus,0,'the milestone belongs to innate, not acquired');
 const fake=M.getStatBonus();fake.innate.focus=999;check(2);
 M.setState({});check(0);
 const fallback=vm.createContext({});fallback.window=fallback;vm.runInContext(fs.readFileSync('js/muscles.js','utf8'),fallback);
 for(const group of fallback.Muscles.getGroups())for(const m of fallback.Muscles.getMusclesByGroup(group.id))fallback.Muscles.unlock(m.id);
 assert.deepEqual(copy(fallback.Muscles.getStatBonus().innate),expected(0),'missing full groups cannot satisfy the reward');
});

test('head reward requires all 97 entries, adds only innate focus/breath and stacks independently with core',async()=>{
 const g=vm.createContext({fetch:async()=>({ok:true,json:async()=>copy(data)})});g.window=g;
 vm.runInContext(fs.readFileSync('js/muscles.js','utf8'),g);await g.Muscles.ready;
 const M=g.Muscles,head=data.muscles.filter(m=>m.group==='head');assert.equal(head.length,97);
 for(const missing of head){
  const unlocked=Object.fromEntries(data.muscles.filter(m=>m.id!==missing.id).map(m=>[m.id,true]));
  M.setState({unlocked,progress:{[missing.id]:99.999}});
  assert.deepEqual(copy(M.getStatBonus().innate),expected(2),'missing '+missing.id);
 }
 const headLit=Object.fromEntries(head.map(m=>[m.id,true]));
 M.setState({unlocked:headLit});assert.deepEqual(copy(M.getStatBonus().innate),expected(0,1));
 for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(head[0].id,1);assert.deepEqual(copy(M.getStatBonus().innate),expected(0,1));}
 M.setState({unlocked:{...allLit,...headLit}});assert.deepEqual(copy(M.getStatBonus().innate),expected(2,1));
 M.setState({unlocked:Object.fromEntries(M.getFoodGrowthRewards().map(r=>[r.id,true]))});
 assert.deepEqual(copy(M.getStatBonus().innate),expected(0),'food target subset alone cannot satisfy head completion');
});

test('all-muscle reward requires every catalog entry and adds one to all five innate attributes only once',async()=>{
 const g=vm.createContext({fetch:async()=>({ok:true,json:async()=>copy(data)})});g.window=g;
 vm.runInContext(fs.readFileSync('js/muscles.js','utf8'),g);
 assert.deepEqual(copy(g.Muscles.getStatBonus().innate),expected(0),'unloaded catalog cannot award completion');
 await g.Muscles.ready;
 const M=g.Muscles,catalogLit=Object.fromEntries(data.muscles.map(m=>[m.id,true]));
 assert.equal(data.muscles.length,478);
 for(const missing of data.muscles){
  const unlocked={...catalogLit,unknown_muscle:true};delete unlocked[missing.id];
  M.setState({unlocked,progress:{[missing.id]:99.999}});
  assert.deepEqual(copy(M.getStatBonus().innate),expected(groups.includes(missing.group)?0:2,missing.group==='head'?0:1),'missing '+missing.id);
 }
 M.addGrowth(data.muscles.at(-1).id,0.001);
 assert.deepEqual(copy(M.getStatBonus().innate),expected(3,1),'the last actual entry completes all three milestones');
 for(let i=0;i<3;i++){
  M.setState(copy(M.getState()));M.addGrowth(data.muscles[0].id,1);
  assert.deepEqual(copy(M.getStatBonus().innate),expected(3,1));
 }
 M.setState({unlocked:catalogLit});assert.deepEqual(copy(M.getStatBonus().innate),expected(3,1),'old saves need no claim flag');
 M.setState({});assert.deepEqual(copy(M.getStatBonus().innate),expected(0));
 const empty=vm.createContext({fetch:async()=>({ok:true,json:async()=>({groups:[],muscles:[]})})});empty.window=empty;
 vm.runInContext(fs.readFileSync('js/muscles.js','utf8'),empty);await empty.Muscles.ready;
 assert.deepEqual(copy(empty.Muscles.getStatBonus().innate),expected(0),'an empty catalog is not full completion');
});

for(const full of [false,true])test(`muscle milestones ${full?'Svelte':'classic'}: completion, rollback, old saves and attribute display`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  const name=d.getElementById('creation-name');name.value='核心成长';name.dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,CA=g.CharacterAttributes,S=g.Survival,G=g.GymSystem,SS=g.SaveSystem,IE=g.InventoryEquipment;
  IE.getState().skills.special_meridian_studies={level:1};
  const base=copy(CA.getState().innate),last='chest_diaphragm',seed={unlocked:{...allLit},progress:{[last]:99.9}};
  delete seed.unlocked[last];
  const saved=copy(SS.buildSnapshotForDebug());saved.muscles=seed;
  assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);
  S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20,isDead:false,isComa:false});
  const assertInnate=(n,head=0)=>{for(const id of attrs){assert.equal(CA.getBaseInnateAttr(id),base[id]);assert.equal(CA.getInnateAttr(id),base[id]+expected(n,head)[id]);}};
  assertInnate(0);assert.equal(CA.canUseWeapon(2*(base.jingu+1)),false);
  let serial=90000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
  g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++serial,fn),serial):oldSet(fn,ms,...args);
  g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
  const step=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  assert.equal(G.startTraining('diaphragmatic_breathing').ok,true);
  step();assertInnate(0);assert.equal(M.isGroupComplete('chest'),false);
  const before=copy(M.getState()),save=SS.saveNow;
  SS.saveNow=()=>false;step();SS.saveNow=save;
  assert.deepEqual(copy(M.getState()),before);assertInnate(0);assert.ok(G.getError());
  G.retry();step();assertInnate(2);assert.equal(G.isActive(),false);
  assert.ok(groups.every(id=>M.isGroupComplete(id)));assert.equal(CA.canUseWeapon(2*(base.jingu+1)),true);
  assert.deepEqual(copy(CA.getState().innate),base,'base innate save data never receives a duplicate +2');
  const earned=copy(SS.buildSnapshotForDebug());
  const stats=copy(CA.getState().acquired);
  for(let i=0;i<3;i++){assert.equal(SS.applySnapshotForDebug(earned),true);await h.drain();assertInnate(2);}
  assert.deepEqual(copy(CA.getState().acquired),stats);
  // Old saves need only the original lit-muscle map, with no new claimed-reward field.
  earned.muscles={unlocked:{...allLit},equipped:{}};
  assert.equal(SS.applySnapshotForDebug(earned),true);await h.drain();assertInnate(2);
  g.GymPanel.close();await openMuscleRewards(h);
  const text=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');
  for(const name of ['筋骨','柔韧','呼吸','身手','专注'])assert.ok(text.includes('先天'+name+'+2'),text);
  d.querySelector('#modal-muscles [data-close]').click();await h.drain();
  // A final food target may complete the head group once its other muscles are lit.
  const headLit=Object.fromEntries(M.getMusclesByGroup('head').map(m=>[m.id,true])),lastHead='head_masseter_L';
  const almostHead=copy(SS.buildSnapshotForDebug());
  almostHead.muscles={unlocked:{...allLit,...headLit},progress:{[lastHead]:99.999}};delete almostHead.muscles.unlocked[lastHead];
  assert.equal(SS.applySnapshotForDebug(almostHead),true);await h.drain();assertInnate(2);
  const inventory=copy(IE.getState());inventory.inventory_pocket=[{item_id:'food_flatbread_plain',count:2}];IE.setState(inventory);
  S.setState({satiety:60,isDead:false,isComa:false});
  const beforeFood=copy(M.getState());SS.saveNow=()=>false;
  assert.equal(g.SceneApp.panelApi.use('pocket',0,{silent:true}),false);SS.saveNow=save;
  assertInnate(2);assert.deepEqual(copy(M.getState()),beforeFood);assert.equal(IE.getPocketArray()[0].count,2);
  assert.equal(g.SceneApp.panelApi.use('pocket',0,{silent:true}),true);assertInnate(2,1);
  assert.equal(IE.getPocketArray()[0].count,1);assert.equal(M.isGroupComplete('head'),true);
  assert.equal(g.SceneApp.panelApi.use('pocket',0,{silent:true}),true);assertInnate(2,1);
  const both=copy(SS.buildSnapshotForDebug());
  for(let i=0;i<3;i++){assert.equal(SS.applySnapshotForDebug(both),true);await h.drain();assertInnate(2,1);}
  await openMuscleRewards(h);
  const combined=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');
  for(const [name,value] of [['筋骨',2],['柔韧',2],['身手',2],['呼吸',3],['专注',3]])assert.ok(combined.includes('先天'+name+'+'+value),combined);
  d.querySelector('#modal-muscles [data-close]').click();await h.drain();
  both.muscles={unlocked:headLit,equipped:{}};
  assert.equal(SS.applySnapshotForDebug(both),true);await h.drain();assertInnate(0,1);
  // The same final food can complete head and the entire catalog atomically.
  const almostAll=copy(SS.buildSnapshotForDebug());
  almostAll.muscles={unlocked:Object.fromEntries(data.muscles.map(m=>[m.id,true])),progress:{[lastHead]:99.999}};
  delete almostAll.muscles.unlocked[lastHead];
  assert.equal(SS.applySnapshotForDebug(almostAll),true);await h.drain();assertInnate(2);
  const finalInventory=copy(IE.getState());finalInventory.inventory_pocket=[{item_id:'food_flatbread_plain',count:2}];IE.setState(finalInventory);
  S.setState({satiety:60,isDead:false,isComa:false});
  const beforeAll=copy(M.getState());SS.saveNow=()=>false;
  assert.equal(g.SceneApp.panelApi.use('pocket',0,{silent:true}),false);SS.saveNow=save;
  assert.deepEqual(copy(M.getState()),beforeAll);assertInnate(2);assert.equal(IE.getPocketArray()[0].count,2);
  assert.equal(g.SceneApp.panelApi.use('pocket',0,{silent:true}),true);assertInnate(3,1);
  assert.equal(M.getGroups().every(group=>M.isGroupComplete(group.id)),true);
  assert.equal(g.SceneApp.panelApi.use('pocket',0,{silent:true}),true);assertInnate(3,1);
  const completed=copy(SS.buildSnapshotForDebug());
  completed.muscles={unlocked:copy(M.getState().unlocked),equipped:{}};
  for(let i=0;i<3;i++){assert.equal(SS.applySnapshotForDebug(completed),true);await h.drain();assertInnate(3,1);}
  await openMuscleRewards(h);
  const allBonuses=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');
  for(const [name,value] of [['筋骨',3],['柔韧',3],['身手',3],['呼吸',4],['专注',4]])assert.ok(allBonuses.includes('先天'+name+'+'+value),allBonuses);
  d.querySelector('#modal-muscles [data-close]').click();await h.drain();
  // Prototype uses the same completion condition and starts one ordinary set short.
  const demo=createGymPrototype(g,JSON.parse(fs.readFileSync('data/survival-config.json','utf8')));
  demo.reset('core-near');assert.deepEqual(copy(M.getStatBonus().innate),expected(0));
  demo.startTraining('diaphragmatic_breathing');demo.tick();assert.deepEqual(copy(M.getStatBonus().innate),expected(0));
  demo.tick();assert.deepEqual(copy(M.getStatBonus().innate),expected(2));
  demo.reset();assert.deepEqual(copy(M.getStatBonus().innate),expected(0));
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
