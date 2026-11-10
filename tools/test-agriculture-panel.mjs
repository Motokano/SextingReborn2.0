import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot} from './ui-game-fixture.mjs';
const copy=v=>JSON.parse(JSON.stringify(v));
async function setup(full){
 const h=await boot(full),g=h.g;
 g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
 assert.equal(g.SceneApp.creation.confirm({name:'农田正式验收',height:178,gender:'male',hand:'right',leg:'right'}),true);
 await h.drain();g.DialogueUI.close();g.GameEngine.setState('M0_Base_Outside_lv_1',5,10);
 for(const stage of ['cleaned','restored'])g.NPCSystem.setDemoFlag(`facility_${stage}:agriculture`,true);
 g.Survival.setState({stamina:100,fatigue:0,satiety:100,thirst:100,isDead:false,isComa:false});
 const inventory=g.InventoryEquipment.getState();inventory.equipment.backpack={item_id:'eq_backpack_multi_pocket',count:1};inventory.inventory_backpack=[];g.InventoryEquipment.setState(inventory);
 const A=g.AgricultureMap,st=A.setState(A.createDefaultState());
 A.cell(st,3,3).tilled=true;A.cell(st,4,3).tilled=true;
 g.AgricultureActions.openAgriculturePanel();
 h.click=selector=>{const el=g.document.querySelector('#modal-agriculture '+selector);assert.ok(el,selector);assert.equal(el.disabled,false,selector+' enabled');el.click();return el;};
 h.action=(id,params={})=>g.AgricultureActions.performAgricultureAction(id,{x:3,y:3,...params});
 h.add=(id,count=1)=>{for(let i=0;i<count;i++)assert.equal(g.InventoryEquipment.putItemIntoDefaultContainer({item_id:id,count:1}).placed,true,id);};
 h.count=id=>g.AgriculturePlayerItems.countItemId(id);
 return h;
}

for(const full of [false,true])test(`formal farm ${full?'Svelte':'native'}: A layout, seeds, crop clearing, harvest, build and save rollback`,async()=>{
 const h=await setup(full),g=h.g,A=g.AgricultureMap,AA=g.AgricultureActions;
 try{
  assert.equal(g.document.querySelectorAll('#modal-agriculture .au-tile').length,121);
  assert.equal(g.document.querySelector('#agriculture-grid'),null);
  assert.equal(g.document.querySelector('#modal-agriculture .au-switcher'),null);
  assert.equal(g.document.querySelector('#modal-agriculture .au-tools'),null);
  const seed=AA.agricultureCropDefsDoc.crops.maize.seedItemId;
  h.add(seed,3);h.click('[data-cell="3,3"]');h.click('[data-action="plant-mode"]');h.click('[data-seed="maize"]');
  const beforeSeed=h.count(seed);h.click('[data-action="plant"]');
  assert.equal(h.count(seed),beforeSeed-1);assert.equal(A.cell(A.getState(),3,3).crop.cropId,'maize');
  assert.ok(g.document.querySelector('[data-cell="3,3"] .au-crop-fx'));
  const save=g.SaveSystem.saveNow,before=copy(g.SaveSystem.buildSnapshotForDebug());g.SaveSystem.saveNow=()=>false;
  try{assert.equal(h.action('clear_crop').reason,'save_failed');}finally{g.SaveSystem.saveNow=save;}
  assert.deepEqual(copy(A.getState()),before.agriculture_map.state,'clearing rolls back the crop and soil');
  h.click('[data-action="clear-crop"]');assert.equal(A.cell(A.getState(),3,3).crop,null);assert.equal(h.count(seed),beforeSeed-1,'clearing returns no seed');
  assert.equal(h.action('plant',{cropId:'maize',seedItemId:'wood_shrub_dry'}).reason,'invalid_seed');
  assert.equal(h.action('plant',{cropId:'maize',x:NaN}).reason,'invalid_cell');
  assert.equal(h.action('plant',{cropId:'maize'}).ok,true);
  Object.assign(A.cell(A.getState(),3,3).crop,{settled:true,remainingTicks:0,harvestCount:3,result:'good'});g.AgriculturePanel.update();
  const cropItem=A.cell(A.getState(),3,3).crop.harvestItemId;
  const realPut=g.InventoryEquipment.putItemIntoDefaultContainer;g.InventoryEquipment.putItemIntoDefaultContainer=()=>({placed:false});
  try{assert.equal(h.action('harvest').reason,'inventory_full');assert.equal(A.cell(A.getState(),3,3).crop.harvestCount,3);}finally{g.InventoryEquipment.putItemIntoDefaultContainer=realPut;}
  const had=h.count(cropItem);h.click('[data-action="harvest"]');assert.equal(h.count(cropItem),had+3);assert.equal(A.cell(A.getState(),3,3).crop,null);
  const build='crop_structure_water_storage_ridge',spec=g.AgricultureConfig.getBuildSpec(build);
  for(const row of spec.inputs)h.add(row.item_id,row.count);
  h.click('[data-mode="build"]');h.click('[data-build="water_storage_ridge"]');h.click('[data-action="build"]');
  assert.equal(A.getState().task.type,'build_crop_structure');assert.equal(A.cell(A.getState(),3,3).cropStructure,null,'no instant preview construction');
  assert.ok(g.document.querySelector('.au-construction'));
  const busy=copy(A.getState());assert.equal(h.action('plant',{cropId:'maize'}).reason,'task_busy');assert.deepEqual(copy(A.getState()),busy);
  h.click('[data-action="cancel-task"]');assert.equal(A.getState().task,null);
  assert.equal(h.action('start_build_task',{buildId:build}).ok,true);
  for(let i=0;i<spec.task_ticks;i++){g.Survival.setState({stamina:100});assert.equal(h.action('advance_ticks',{n:1}).ok,true);}
  assert.equal(A.getState().task,null);assert.equal(A.cell(A.getState(),3,3).cropStructure,'water_storage_ridge');
  const rice=AA.agricultureCropDefsDoc.crops.rice.seedItemId;h.add(rice);
  assert.equal(h.action('plant',{cropId:'rice'}).ok,true);
  assert.equal(h.action('start_build_task',{buildId:'crop_structure_remove'}).reason,'crop_structure_occupied');
  assert.equal(h.action('clear_crop').ok,true);assert.equal(A.cell(A.getState(),3,3).cropStructure,'water_storage_ridge');
  h.click('[data-action="remove-facility"]');assert.equal(A.getState().task.type,'remove_crop_structure');
  const unfinished=copy(A.getState().task);AA.closeAgriculturePanel();g.SceneMovement.waitInPlace();
  assert.deepEqual(copy(A.getState().task),unfinished,'closed farm freezes construction');AA.openAgriculturePanel();
  assert.ok(g.document.querySelector('.au-construction'),JSON.stringify({canUse:AA.canUseOutdoorFacility('agriculture'),modal:g.document.querySelector('#modal-agriculture').className,state:g.Survival.getState(),task:A.getState().task}));h.click('[data-action="cancel-task"]');
  h.click('[data-action="plant-mode"]');h.click('[data-cell="4,3"]');assert.match(g.document.querySelector('.au-inspector-top').textContent,/地块详情.*E04/);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('formal farm: one-second timer shares wait costs, stops on close/hidden/invalid context and rolls back world ticks',async()=>{
 const h=await setup(false),g=h.g,A=g.AgricultureMap,AA=g.AgricultureActions;
 const timers=new Map(),realSet=g.setInterval,realClear=g.clearInterval;let id=10000;
 try{
  g.setInterval=(fn,ms)=>{assert.equal(ms,1000);timers.set(++id,fn);return id;};g.clearInterval=key=>timers.delete(key);
  g.Survival.setState({stamina:80,fatigue:10,satiety:80,thirst:80});
  const snapshot=copy(g.SaveSystem.buildSnapshotForDebug());
  const observe=()=>({ticks:g.WorldTick.getWorldTotalTicks(),player:copy(g.Survival.getState()),farm:copy(A.getState())});
  for(let i=0;i<3;i++)g.SceneMovement.waitInPlace();const expected=observe();
  assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot),true);
  h.click('[data-action="toggle-wait"]');AA.setAgricultureAutoTickEnabled(true);assert.equal(timers.size,1);
  for(let i=0;i<3;i++)[...timers.values()][0]();assert.deepEqual(observe(),expected);
  const save=g.SaveSystem.saveNow,before=observe();g.SaveSystem.saveNow=()=>false;
  try{[...timers.values()][0]();}finally{g.SaveSystem.saveNow=save;}
  assert.deepEqual(observe(),before);assert.equal(timers.size,0);assert.equal(AA.isAgricultureAutoTickEnabled(),false);
  h.click('[data-action="toggle-wait"]');assert.equal(timers.size,1);
  Object.defineProperty(g.document,'hidden',{configurable:true,value:true});g.document.dispatchEvent(new g.Event('visibilitychange'));assert.equal(timers.size,0);
  Object.defineProperty(g.document,'hidden',{configurable:true,value:false});g.document.dispatchEvent(new g.Event('visibilitychange'));assert.equal(timers.size,0);
  h.click('[data-action="toggle-wait"]');AA.closeAgriculturePanel();assert.equal(timers.size,0);AA.openAgriculturePanel();assert.equal(timers.size,0);
  h.click('[data-action="toggle-wait"]');g.GameEngine.setState('M0_Base_Inside_lv_1',13,14);assert.equal(timers.size,0);
  assert.equal(h.action('clear_crop').reason,'panel_closed');assert.deepEqual(h.errors,[]);
 }finally{g.setInterval=realSet;g.clearInterval=realClear;await h.close();}
});

test('formal farm: bottle choice, release rates, soil inputs and actual battery charge commit atomically',async()=>{
 const h=await setup(false),g=h.g,A=g.AgricultureMap,AA=g.AgricultureActions;
 try{
  A.cell(A.getState(),3,3).kind='buried_pot_jar';h.add('fertilizer_compost_plus');g.AgriculturePanel.update();h.click('[data-cell="3,3"]');h.click('[data-action="refill"]');h.click('[data-item-index="0"]');
  assert.ok(A.cell(A.getState(),3,3).jarLiquid.nutrientRemaining>0);assert.equal(h.action('set_jar_release',{value:2.5}).ok,true);assert.equal(A.cell(A.getState(),3,3).jarReleaseRate,2.5);
  A.cell(A.getState(),4,3).kind='venturi_fertilizer';h.add('liquid_seaweed_extract');
  assert.equal(h.action('inject_facility',{x:4,facilityKind:'venturi_fertilizer',itemId:'liquid_seaweed_extract'}).ok,true);
  assert.equal(h.action('set_venturi_concentration',{x:4,value:2}).ok,true);
  assert.equal(A.cell(A.getState(),4,3).seaweedManualConcentration,2);
  A.cell(A.getState(),10,10).kind='super_fusion';h.add('battery_aa');
  const row=AA.getAgricultureBatteries()[0];assert.ok(row);const ie=g.InventoryEquipment.getState();g.InventoryEquipment.setItemInstanceValue(ie['inventory_'+row.container][row.index],'battery_charge',17);g.InventoryEquipment.setState(ie);
  const charge=A.getState().power_charge;const save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
  try{assert.equal(h.action('feed_power',row).reason,'save_failed');}finally{g.SaveSystem.saveNow=save;}
  assert.equal(A.getState().power_charge,charge);assert.equal(AA.getAgricultureBatteries()[0].charge,17);
  assert.equal(h.action('feed_power',row).ok,true);assert.equal(A.getState().power_charge,charge+17);assert.equal(h.action('feed_power',row).reason,'stale_item');
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('formal farm: rejected construction, partial harvest, soil amendments and failed refund preserve real inventories',async()=>{
 const h=await setup(false),g=h.g,A=g.AgricultureMap,AA=g.AgricultureActions,I=g.InventoryEquipment;
 try{
  const build='channel_dig',spec=g.AgricultureConfig.getBuildSpec(build),material=spec.inputs[0].item_id;
  const initial=copy(A.getState());assert.equal(h.action('start_build_task',{buildId:build}).reason,'insufficient_items');assert.deepEqual(copy(A.getState()),initial);
  h.add(material,2);const originalCount=h.count(material),save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
  try{assert.equal(h.action('start_build_task',{buildId:build}).reason,'save_failed');}finally{g.SaveSystem.saveNow=save;}
  assert.equal(h.count(material),originalCount);assert.equal(A.getState().task,null);
  assert.equal(h.action('start_build_task',{buildId:build}).ok,true);const task=copy(A.getState().task),paid=h.count(material),put=I.putItemIntoDefaultContainer;
  I.putItemIntoDefaultContainer=()=>({placed:false});
  try{assert.equal(h.action('cancel_task').reason,'inventory_full');}finally{I.putItemIntoDefaultContainer=put;}
  assert.equal(h.count(material),paid);assert.deepEqual(copy(A.getState().task),task);
  assert.equal(h.action('cancel_task').ok,true);assert.equal(h.count(material),originalCount);
  const catalog=JSON.parse(fs.readFileSync('data/items.json','utf8')),amend=Object.values(catalog).find(t=>t.grants_soil_id==='soil_black').item_id;
  h.add(amend,2);const beforeSoil=A.cell(A.getState(),3,3).soilId;
  h.click('[data-cell="3,3"]');h.click('[data-action="soil"]');h.click('[data-item-index="0"]');
  assert.equal(A.getState().task.type,'soil_amend');assert.equal(A.getState().task.soilId,'soil_black');assert.equal(h.count(amend),1);assert.equal(A.cell(A.getState(),3,3).soilId,beforeSoil);
  assert.equal(h.action('cancel_task').ok,true);
  const seed=AA.agricultureCropDefsDoc.crops.maize.seedItemId;h.add(seed,2);assert.equal(AA.getAgriculturePlantOptions().find(row=>row.cropId==='maize').count,2);
  assert.equal(h.action('plant',{cropId:'maize'}).ok,true);Object.assign(A.cell(A.getState(),3,3).crop,{settled:true,remainingTicks:0,harvestCount:3,result:'good'});
  let free=2;I.putItemIntoDefaultContainer=item=>free-->0?put(item):{placed:false};
  try{assert.equal(h.action('harvest').placedCount,2);}finally{I.putItemIntoDefaultContainer=put;}
  assert.equal(A.cell(A.getState(),3,3).crop.harvestCount,1);
  assert.equal(h.action('harvest').placedCount,1);assert.equal(A.cell(A.getState(),3,3).crop,null);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
