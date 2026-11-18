import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';
import {createGymPrototype} from './gym-prototype-model.mjs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
const config=read('data/survival-config.json'),items=read('data/items.json');
const foodIds=Object.keys(read('data/food-balance.json').foods);
const allMuscles=read('data/muscles.json').muscles;

test('every food portion grants fixed 0.001 percentage points only once, with prototype parity',async()=>{
 const g=vm.createContext({console,fetch:async p=>({ok:true,json:async()=>read(p)})});
 g.window=g;
 for(const name of ['food-metabolism','game-time','survival','muscles','item-use'])vm.runInContext(fs.readFileSync('js/'+name+'.js','utf8'),g);
 await g.Muscles.ready;g.Survival.setConfig(config);
 const M=g.Muscles,S=g.Survival,U=g.ItemUse,rewards=M.getFoodGrowthRewards(),targets=new Set(rewards.map(r=>r.id));
 assert.equal(targets.size,41);assert.equal(rewards.length,41);assert.ok(rewards.every(r=>r.pct===.001));
 assert.ok(rewards.every(r=>M.getMuscleById(r.id).group==='head'));
 assert.ok(!targets.has('head_superior_rectus_L'));assert.ok(!targets.has('head_stapedius_L'));assert.ok(!targets.has('head_frontalis_L'));
 function check(amount){for(const m of allMuscles)assert.equal(M.getProgress(m.id),targets.has(m.id)?amount:0,m.id);}
 for(const id of foodIds){
  M.setState({});S.setState({fatigue:95,nutrition:100,food_metabolism:null});
  assert.equal(U.itemTemplateIsConsumable(items[id]),true);assert.equal(U.isFoodTemplate(items[id]),true,id);
  assert.equal(U.applyItemUseEffectFromTemplate(id,items[id]),true,id);check(.001);
  assert.equal(U.applyItemUseEffectFromTemplate(id,items[id]),true,id);check(.002);
 }
 const before=clone(M.getState());for(let i=0;i<60;i++)S.advanceTick();assert.deepEqual(clone(M.getState()),before,'digestion cannot pay again');
 assert.equal(U.applyItemUseEffectFromTemplate('invalid',{...items.food_flatbread_plain,food_profile:{digestion_ticks:0}}),false);
 assert.equal(U.applyItemUseEffectFromTemplate('invalid',{}),false);
 S.setState({thirst:20});assert.equal(U.applyItemUseEffectFromTemplate('water',{category:'supply',use_effect:{thirst:10}}),true);
 assert.deepEqual(clone(M.getState()),before,'failed food and drinking water do not grow muscles');
 g.BuffSystem={applyBuff:()=>true,hasBuffByBuffId:()=>false};
 assert.equal(U.applyItemUseEffectFromTemplate('medicine',{category:'medicine',use_action:'drink',use_buff_id:'test'}),true);
 assert.deepEqual(clone(M.getState()),before,'medicine does not count as food');
 const capped={progress:Object.fromEntries([...targets].map(id=>[id,99.9995]))};M.setState(capped);
 U.applyItemUseEffectFromTemplate(foodIds[0],items[foodIds[0]]);assert.ok([...targets].every(id=>M.getProgress(id)===100&&M.isUnlocked(id)));
 const bonus=clone(M.getStatBonus());U.applyItemUseEffectFromTemplate(foodIds[0],items[foodIds[0]]);assert.deepEqual(clone(M.getStatBonus()),bonus);
 assert.equal(M.isGroupComplete('head'),false,'other head muscles still need their own sources');
 delete g.BuffSystem;
 const demo=createGymPrototype(g,config);S.setState({satiety:70,thirst:50});const portions=demo.state.food;
 demo.eat('food');assert.equal(demo.state.food,portions-1);for(const id of targets)assert.equal(demo.percent(id),.001);
 demo.eat('water');for(const id of targets)assert.equal(demo.percent(id),.001);
 demo.state.food=0;assert.throws(()=>demo.eat('food'));for(const id of targets)assert.equal(demo.percent(id),.001);
});

async function setup(h){
 const g=h.g;g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
 const el=g.document.getElementById('creation-name');el.value='进食成长';el.dispatchEvent(new g.Event('input',{bubbles:true}));
 await h.drain();g.document.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
 g.GameEngine.setState('M0_Base_Inside_lv_1',5,12);
 const I=g.InventoryEquipment,s=I.getState();s.equipment.backpack=g.BackpackSystem.generate('eq_backpack_light_canvas');
 s.inventory_backpack=[{item_id:'food_flatbread_plain',count:3},{item_id:'food_fish_soup_clear',count:1},{item_id:'material_iron_blank_common',count:1}];
 s.inventory_pocket=[];s.inventory_vest=[];s.inventory_vehicle=[];s.bound_vehicle_id=null;I.setState(s);
 g.Muscles.setState({});g.Survival.setState({satiety:60,thirst:100,stamina:100,fatigue:0,nutrition:20,food_metabolism:null,isDead:false,isComa:false});
}
for(const full of [false,true])test(`food muscle growth ${full?'Svelte':'classic'}: actual consumption, rollback, cap and saved progress`,async()=>{
 const h=await boot(full),g=h.g;
 try{
  await setup(h);const I=g.InventoryEquipment,M=g.Muscles,S=g.Survival,SS=g.SaveSystem,d=g.document;
  const targets=M.getFoodGrowthRewards().map(r=>r.id),first=targets[0],use=(i=0)=>g.SceneApp.panelApi.use('backpack',i,{silent:true});
  const snapshot=()=>JSON.stringify([I.getState(),M.getState(),S.getState(),g.GameTime.getState()]);
  g.SceneApp.openBackpackPanel();await h.drain();
  d.querySelector('[data-bp-id="'+I.getBackpackArray()[0].instance_id+'"]').click();await h.drain();
  const button=[...d.querySelectorAll('#modal-backpack button')].find(b=>b.textContent.trim()==='使用');assert.ok(button,'real inventory food button');
  const ticks=S.getState().tickCount;button.click();await h.drain();
  assert.equal(I.getBackpackArray()[0].count,2);assert.ok(targets.every(id=>M.getProgress(id)===.001));assert.equal(S.getState().tickCount,ticks+1);
  assert.equal(S.getState().food_metabolism.portions.length,1);
  assert.equal(JSON.parse(g.localStorage.getItem('cabi_realtime_save_v1')).muscles.progress[first],.001,'growth saved with consumed item');
  assert.equal(use(),true);assert.equal(I.getBackpackArray()[0].count,1);assert.ok(targets.every(id=>M.getProgress(id)===.002));
  const state=M.getState();state.progress[first]=99.9995;M.setState(state);
  const before=snapshot(),oldBonus=clone(M.getStatBonus()),oldAttr=g.CharacterAttributes.getEffectiveAttr('jingu'),save=SS.saveNow;
  SS.saveNow=()=>false;assert.equal(use(),false);SS.saveNow=save;
  assert.equal(snapshot(),before,'failure restores item, digestion, time, progress and unlock');assert.equal(M.isUnlocked(first),false);assert.deepEqual(clone(M.getStatBonus()),oldBonus);
  assert.equal(g.CharacterAttributes.getEffectiveAttr('jingu'),oldAttr);
  assert.equal(use(),true);assert.equal(I.getBackpackArray()[0],null);assert.equal(M.getProgress(first),100);assert.equal(M.isUnlocked(first),true);
  const gain=M.getMuscleById(first).effects.filter(e=>e.type==='jingu').reduce((n,e)=>n+e.delta,0);
  assert.equal(g.CharacterAttributes.getEffectiveAttr('jingu'),oldAttr+gain,'newly lit muscle recalculates permanent stats');
  const paid=clone(SS.buildSnapshotForDebug());assert.equal(SS.applySnapshotForDebug(paid),true);await h.drain();
  assert.equal(M.getProgress(first),100);assert.equal(M.getProgress(targets[1]),.003);assert.equal(I.getBackpackArray()[0],null);
  const earned=clone(M.getState());assert.equal(use(),false);assert.equal(use(2),false);assert.deepEqual(clone(M.getState()),earned,'empty and nonfood clicks give nothing');
  S.setState({isDead:true});const blocked=snapshot();assert.equal(use(1),false);assert.equal(snapshot(),blocked);S.setState({isDead:false});
  const ingest=S.ingestFood;S.ingestFood=()=>false;const failed=snapshot();assert.equal(use(1),false);S.ingestFood=ingest;assert.equal(snapshot(),failed,'rejected ingestion restores its item');
  assert.equal(use(1),true);assert.equal(I.getBackpackArray()[1],null);assert.equal(M.getProgress(targets[1]),.004,'soup and solid foods grant the same amount');
  const finished=clone(M.getState());S.advanceTick();assert.deepEqual(clone(M.getState()),finished);
  assert.ok(M.getMusclesByGroup('head').filter(m=>!targets.includes(m.id)).every(m=>M.getProgress(m.id)===0));
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
