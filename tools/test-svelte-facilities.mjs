import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot } from './ui-game-fixture.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const equipmentIds=Object.keys(JSON.parse(fs.readFileSync('data/equipment-catalog-v2.json','utf8')).items);
const click=async(h,selector)=>{const el=h.g.document.querySelector(selector);assert.ok(el,selector);assert.ok(!el.disabled,selector+' enabled');el.click();await h.drain();return el;};
async function input(h,selector,value){const el=h.g.document.querySelector(selector);assert.ok(el,selector);el.value=value;el.dispatchEvent(new h.g.Event('input',{bubbles:true}));await h.drain();}
async function setup(h,x=7,y=12){
 const g=h.g;g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
 await input(h,'#creation-name','设施测试');await click(h,'#btn-confirm-creation');g.DialogueUI.close();
 g.GameEngine.setState('M0_Base_Inside_lv_1',x,y);await h.drain();
 assert.equal(g.SceneApp.isPreCreationGameplayRestricted(),false);
 const IE=g.InventoryEquipment,st=copy(IE.getState());
 const equipment=Object.fromEntries(equipmentIds.map(id=>[id,IE.getItemTemplate(id)]));
 equipment.facility_test_bag={item_id:'facility_test_bag',name:'测试背包',equip_slot:'backpack',backpack_slots:30,weight_kg:1};IE.setConfig({equipment});
 st.equipment.backpack={item_id:'facility_test_bag'};st.inventory_pocket=[];st.inventory_vest=[];st.inventory_vehicle=[];
 st.inventory_backpack=g.FacilityUnlockConfig.materials.map(m=>({item_id:m[0],count:25}));IE.setState(st);
 g.Survival.setState({stamina:100,isDead:false,isResting:false});
}
function shape(h,selector){const source=h.g.document.querySelector(selector);assert.ok(source,selector);const root=source.cloneNode(true);root.querySelectorAll('[hidden],.hw-hidden').forEach(el=>el.remove());return [root,...root.querySelectorAll('*')].map(el=>[el.tagName,[...el.classList].sort().join(' '),el.textContent.replace(/\s+/g,''),el.hidden,el.getAttribute('type')==='range'?el.value:null]);}
function equal(old,next,selector){assert.deepEqual(shape(next,selector),shape(old,selector),selector+' text, elements and classes');}
function clock(g){const set=g.setInterval,clear=g.clearInterval,timers=new Map();let id=1000000;g.setInterval=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};g.clearInterval=id=>{if(!timers.delete(id))clear(id);};return {timers,step(){for(const {fn} of [...timers.values()])fn();},restore(){g.setInterval=set;g.clearInterval=clear;timers.clear();}};}
async function offer(h,selector='.cr-body'){for(const el of h.g.document.querySelectorAll(selector+' input[type="range"]'))await input(h,`[data-item="${el.dataset.item}"]`,el.max);}

test('P4a native/Svelte preserve labor, all repair steps, embedded tools, warehouse contents and upgrade presentation',async()=>{
 const old=await boot(false),h=await boot(true);
 try{
  for(const f of [old,h]){await setup(f);f.g.GameEngine.setState('M0_Base_Outside_lv_1',5,10);f.g.FacilityLaborPanel.open('agriculture');await f.drain();}
  equal(old,h,'.cooking-repair-overlay');
  for(const f of [old,h]){f.g.FacilityLaborPanel.close();f.g.GameEngine.setState('M0_Base_Inside_lv_1',13,14);f.g.FacilityUnlockPanel.open('pharmacy');await f.drain();}
  equal(old,h,'.cooking-repair-overlay');
  for(const f of [old,h])await click(f,'[data-action="inspect"]');
  equal(old,h,'.cr-body');
  for(let step=0;step<2;step++){
   for(const f of [old,h]){await click(f,`[data-step="${step}"]`);await click(f,'[data-action="all"]');}
   equal(old,h,'.cr-body');
  }
  for(const f of [old,h])await click(f,'[data-step="2"]');equal(old,h,'.cr-body');
  for(const f of [old,h])await click(f,'[data-action="repair"]');equal(old,h,'.cr-body');
  for(const f of [old,h]){f.g.FacilityUnlockPanel.close();f.g.GameEngine.setState('M0_Base_Inside_lv_1',7,12);f.g.ToolbenchPanel.open();await f.drain();}
  equal(old,h,'#toolbench-panel');
  for(const id of ['humidity','temperature','calendar']){for(const f of [old,h])await click(f,`[data-tool="${id}"]`);equal(old,h,'#toolbench-panel');}
  for(const f of [old,h]){await offer(f);await click(f,'[data-action="repair"]');}equal(old,h,'#toolbench-panel');
  for(const f of [old,h]){
   f.g.ToolbenchPanel.close();f.g.GameEngine.setState('M0_Base_Inside_lv_1',13,12);
   const HW=f.g.HideoutWarehouse,st=HW.createDefaultState();st.slots[0]={item_id:'ore_clay_raw',count:3};HW.setState(st);f.g.SceneApp.openHideoutWarehousePanel();await f.drain();await click(f,'[data-slot-index="0"]');
  }
  equal(old,h,'#modal-hideout-warehouse');
  for(const f of [old,h])await click(f,'#hw-btn-upgrade');equal(old,h,'#hw-upgrade-overlay');
  for(const f of [old,h])await click(f,'[data-route-pick-id="U-A1"]');equal(old,h,'#hw-upgrade-overlay');
  for(const f of [old,h]){await offer(f,'#hw-material-host');await click(f,'[data-action="repair"]');}equal(old,h,'#hw-upgrade-overlay');
  assert.deepEqual(old.errors,[]);assert.deepEqual(h.errors,[]);
 }finally{await old.close();await h.close();}
});

test('P4a labor owns one interval, charges once, pauses on hidden/save failure/load, and transitions to repair',async()=>{
 const h=await boot(true),g=h.g;let timer;
 try{
  await setup(h);g.GameEngine.setState('M0_Base_Outside_lv_1',5,10);timer=clock(g);g.FacilityLaborPanel.open('agriculture');await h.drain();
  const before=g.GameTime.getState().totalTicks,stamina=g.Survival.getStamina(),cost=g.FacilityLabor.cost();
  await click(h,'[data-action="start"]');assert.equal(timer.timers.size,1);g.FacilityLaborPanel.act('start');assert.equal(timer.timers.size,1);
  timer.step();await h.drain();assert.equal(g.FacilityLabor.progress('agriculture'),1);assert.equal(g.GameTime.getState().totalTicks,before+1);assert.ok(g.Survival.getStamina()<=stamina-cost,'labor and ordinary world survival costs both apply');
  await click(h,'[data-action="pause"]');assert.equal(timer.timers.size,0);timer.step();assert.equal(g.FacilityLabor.progress('agriculture'),1);
  await click(h,'[data-action="start"]');Object.defineProperty(g.document,'hidden',{configurable:true,value:true});g.document.dispatchEvent(new g.Event('visibilitychange'));await h.drain();assert.equal(timer.timers.size,0);
  Object.defineProperty(g.document,'hidden',{configurable:true,value:false});
  const save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;await click(h,'[data-action="start"]');assert.equal(timer.timers.size,0);await click(h,'[data-action="close"]');assert.equal(g.FacilityLaborPanel.isOpen(),true);
  g.SaveSystem.saveNow=save;await click(h,'[data-action="start"]');const snap=g.SaveSystem.buildSnapshotForDebug();assert.ok(g.SaveSystem.applySnapshotForDebug(snap));await h.drain();assert.equal(timer.timers.size,0);assert.equal(g.FacilityLaborPanel.isOpen(),false);
  g.NPCSystem.setDemoFlag('facility_labor:agriculture',999);g.Survival.setState({stamina:100});g.FacilityLaborPanel.open('agriculture');await h.drain();await click(h,'[data-action="start"]');timer.step();await h.drain();assert.equal(timer.timers.size,0);assert.ok(g.NPCSystem.isDemoFlagTrue('facility_cleaned:agriculture'));
  await click(h,'[data-action="repair"]');assert.equal(g.FacilityLaborPanel.isOpen(),false);assert.equal(g.FacilityUnlockPanel.isOpen(),true);
  await click(h,'[data-action="close"]');assert.equal(g.FacilityLaborPanel.isOpen(),true);assert.equal(timer.timers.size,0);
  assert.deepEqual(h.errors,[]);
 }finally{timer?.restore();await h.close();}
});

test('P4a tool material rollback, stale quantity, receipts and immediate environment knowledge, repeated ownership and focus',async()=>{
 const h=await boot(true),g=h.g,d=g.document;
 try{
  await setup(h);const trigger=d.getElementById('btn-backpack');trigger.focus();g.ToolbenchPanel.open();await h.drain();
  assert.equal(g.NPCSystem.isDemoFlagTrue('observation_calendar_unlocked'),false);
  await offer(h);const before=copy(g.InventoryEquipment.getState()),save=g.SaveSystem.saveNow;
  g.SaveSystem.saveNow=()=>false;await click(h,'[data-action="repair"]');assert.deepEqual(copy(g.InventoryEquipment.getState()),before);assert.ok(d.querySelector('#toolbench-panel [role="alert"]'));assert.equal(g.NPCSystem.isDemoFlagTrue('observation_calendar_unlocked'),false);
  g.SaveSystem.saveNow=save;await click(h,'[data-action="repair"]');assert.ok(g.NPCSystem.isDemoFlagTrue('observation_calendar_unlocked'));assert.ok(d.querySelector('.cr-receipts'));const after=copy(g.InventoryEquipment.getState());g.FacilityUnlockPanel.act('repair');await h.drain();assert.deepEqual(copy(g.InventoryEquipment.getState()),after,'duplicate delivery never consumes twice');
  await click(h,'[data-tool="temperature"]');await offer(h);const state=copy(g.InventoryEquipment.getState());state.inventory_backpack=state.inventory_backpack.filter(i=>i?.item_id!=='mechanical_parts');g.InventoryEquipment.setState(state);await click(h,'[data-action="repair"]');assert.match(d.querySelector('#toolbench-panel [role="alert"]').textContent,/变化/);
  state.inventory_backpack.push({item_id:'mechanical_parts',count:5});g.InventoryEquipment.setState(state);await click(h,'[data-tool="calendar"]');await click(h,'[data-tool="temperature"]');await offer(h);await click(h,'[data-action="repair"]');assert.ok(g.NPCSystem.isDemoFlagTrue('observation_temperature_unlocked'));
  await h.drain();assert.match(d.getElementById('hud-weather').textContent,/℃/);assert.ok(d.getElementById('hud-time-text'));
  d.activeElement.dispatchEvent(new g.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await h.drain();assert.equal(g.ToolbenchPanel.isOpen(),false);assert.equal(d.activeElement,trigger);
  for(let i=0;i<10;i++){g.ToolbenchPanel.open();await h.drain();g.ToolbenchPanel.close();await h.drain();}assert.equal(d.querySelectorAll('#toolbench-panel').length,0);assert.equal(g.SvelteInteractions.overlays.active(),false);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('P4a warehouse material receipt, construction timing, save failure, close and load resume manually',async()=>{
 const h=await boot(true),g=h.g;let timer;
 try{
  await setup(h,13,12);timer=clock(g);g.SceneApp.openHideoutWarehousePanel();await h.drain();await click(h,'#hw-btn-upgrade');await click(h,'[data-route-pick-id="U-A1"]');
  await offer(h,'#hw-material-host');await click(h,'[data-action="repair"]');assert.ok(g.HideoutWarehouse.isUpgradeMaterialReady('U-A1'));assert.equal(g.HideoutWarehouse.getCapacity(),100);
  const items=copy(g.InventoryEquipment.getState());await click(h,'#hw-btn-upgrade-start');assert.equal(timer.timers.size,1);timer.step();await h.drain();assert.equal(g.HideoutWarehouse.getActiveUpgradeTask().ticks_remaining,9);assert.deepEqual(copy(g.InventoryEquipment.getState()),items);
  await click(h,'#hw-btn-upgrade-start');assert.equal(timer.timers.size,0);await click(h,'#hw-btn-upgrade-start');
  Object.defineProperty(g.document,'hidden',{configurable:true,value:true});g.document.dispatchEvent(new g.Event('visibilitychange'));await h.drain();assert.equal(timer.timers.size,0);assert.equal(g.HideoutWarehouse.getActiveUpgradeTask().ticks_remaining,9);
  Object.defineProperty(g.document,'hidden',{configurable:true,value:false});await click(h,'#hw-btn-upgrade-start');
  const save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;timer.step();await h.drain();assert.equal(timer.timers.size,0);assert.equal(g.HideoutWarehouse.getActiveUpgradeTask().ticks_remaining,8);await click(h,'#hw-close');assert.equal(g.HideoutWarehousePanel.isOpen(),true);
  g.SaveSystem.saveNow=save;await click(h,'#hw-close');assert.equal(g.HideoutWarehousePanel.isOpen(),false);g.SceneApp.openHideoutWarehousePanel();await h.drain();await click(h,'#hw-btn-upgrade');assert.equal(timer.timers.size,0);await click(h,'#hw-btn-upgrade-start');
  const snap=g.SaveSystem.buildSnapshotForDebug();assert.ok(g.SaveSystem.applySnapshotForDebug(snap));await h.drain();assert.equal(timer.timers.size,0);assert.equal(g.HideoutWarehouse.getActiveUpgradeTask().ticks_remaining,8);
  await click(h,'#hw-btn-upgrade');await click(h,'#hw-btn-upgrade-start');for(let i=0;i<8;i++){timer.step();await h.drain();}assert.equal(timer.timers.size,0);assert.equal(g.HideoutWarehouse.getCapacity(),200);assert.equal(g.HideoutWarehouse.getActiveUpgradeTask(),null);assert.deepEqual(copy(g.InventoryEquipment.getState()),items);
  await click(h,'#hw-btn-storage');await click(h,'#hw-pager-next');assert.equal(g.HideoutWarehousePanel.getUiState().page,2);assert.deepEqual(h.errors,[]);
 }finally{timer?.restore();await h.close();}
});

test('P4a warehouse transfer, instance identity, filters, locks, fill, tidy, batch deposit and outpost guard',async()=>{
 const h=await boot(true),g=h.g,d=g.document;
 try{
  await setup(h,13,12);const HW=g.HideoutWarehouse,IE=g.InventoryEquipment,st=HW.createDefaultState();
  st.unlocked_qol_ids.push('qol_lock_and_pin','qol_tab_view','qol_tidy_one_click','qol_withdraw_fill','qol_deposit_all','qol_quick_transfer','qol_craft_stash','qol_dungeon_access');
  st.slots[0]={item_id:'ore_clay_raw',count:3};st.slots[1]={item_id:'fishing_rod_hand_basic',count:1};HW.setState(st);
  const identity=HW.getState().slots[1].instance_id;g.SceneApp.openHideoutWarehousePanel();await h.drain();
  const ticks=g.GameTime.getState().totalTicks;
  await click(h,'[data-slot-index="0"]');await click(h,'#hw-btn-star');await click(h,'#hw-btn-lock');assert.equal(d.getElementById('hw-btn-withdraw-all').disabled,true);
  const locked=copy(HW.getState().slots[0]);g.HideoutWarehousePanel.act('withdraw',0,null);assert.deepEqual(copy(HW.getState().slots[0]),locked);
  await click(h,'[data-tab="starred"]');assert.equal(d.querySelectorAll('.hw-slot-label').length,1);await click(h,'[data-tab="all"]');await click(h,'#hw-btn-lock');await click(h,'#hw-btn-withdraw-one');assert.equal(HW.getState().slots[0].count,2);
  await click(h,'[data-slot-index="1"]');
  const beforeStale=HW.getState(),replacement=copy(beforeStale);replacement.slots[1]={item_id:'ore_limestone',count:2};HW.setState(replacement);
  await click(h,'#hw-btn-withdraw-all');assert.equal(HW.getState().slots[1].item_id,'ore_limestone','stale item action cannot withdraw replacement');
  HW.setState(beforeStale);g.HideoutWarehousePanel.render();await h.drain();await click(h,'[data-slot-index="1"]');await click(h,'#hw-btn-withdraw-all');assert.equal(HW.getState().slots[1],null);assert.ok(IE.findItemInstanceLocation(identity));
  const rod=d.querySelector('[data-bp-id="'+identity+'"]');assert.ok(rod);rod.click();await h.drain();await click(h,'[data-bp-deposit]');assert.ok(HW.getState().slots.some(i=>i?.instance_id===identity));assert.equal(IE.findItemInstanceLocation(identity),null);
  await click(h,'#hw-btn-settings');assert.equal(HW.getPreferDeductWarehouse(),true);await click(h,'#hw-btn-tidy');
  await click(h,'[data-bp-deposit-all="backpack"]');assert.equal(IE.getBackpackArray().filter(Boolean).length,0);
  const clay=HW.getState().slots.findIndex(i=>i?.item_id==='ore_clay_raw');await click(h,`[data-slot-index="${clay}"]`);await click(h,'#hw-btn-withdraw-fill');assert.ok(IE.countCarriedItemsByTemplateId('ore_clay_raw')>0);
  const maps=g.GameEngine.getMaps();g.GameEngine.setMaps({...maps,fixture_dungeon:{...copy(maps.M0_Base_Inside_lv_1),map_id:'fixture_dungeon',is_dungeon:true}});g.GameEngine.setState('fixture_dungeon',1,1);g.SceneHud.refresh('status');await h.drain();assert.equal(g.HideoutWarehousePanel.isOpen(),false);g.SceneApp.openHideoutWarehousePanel();await h.drain();assert.equal(d.getElementById('hw-btn-upgrade').hidden,true);
  const index=HW.getState().slots.findIndex(i=>i?.item_id);await click(h,`[data-slot-index="${index}"]`);assert.equal(d.getElementById('hw-btn-withdraw-all').disabled,true);const warehouse=copy(HW.getState());g.HideoutWarehousePanel.act('withdraw',index,null);assert.deepEqual(copy(HW.getState()),warehouse);assert.equal(g.GameTime.getState().totalTicks,ticks);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('P4a shared standalone work retains sewing construction ticks and releases all controllers on dispose',async()=>{
 const h=await boot(true),g=h.g;let timer;
 try{
  await setup(h,6,12);g.FacilityUnlockPanel.open('sewing_tape');await h.drain();await click(h,'[data-action="inspect"]');
  for(let step=0;step<2;step++){await click(h,`[data-step="${step}"]`);await click(h,'[data-action="all"]');}await click(h,'[data-step="2"]');await click(h,'[data-action="repair"]');
  assert.equal(g.NPCSystem.isDemoFlagTrue('sewing_tape_unlocked'),false);const ticks=g.GameTime.getState().totalTicks;
  await click(h,'[data-sewing-work]');assert.equal(g.GameTime.getState().totalTicks,ticks+1);await click(h,'[data-sewing-work]');assert.equal(g.GameTime.getState().totalTicks,ticks+2);assert.equal(g.NPCSystem.isDemoFlagTrue('sewing_tape_unlocked'),true);assert.equal(h.g.document.querySelector('[data-sewing-work]'),null);
  await click(h,'[data-action="close"]');g.GameEngine.setState('M0_Base_Outside_lv_1',5,10);timer=clock(g);g.FacilityLaborPanel.open('agriculture');await h.drain();await click(h,'[data-action="start"]');assert.equal(timer.timers.size,1);
  g.SvelteInteractions.dispose();await h.drain();assert.equal(timer.timers.size,0);assert.equal(g.FacilityLaborPanel.isOpen(),false);assert.equal(g.ToolbenchPanel.isOpen(),false);assert.equal(g.FacilityUnlockPanel.isOpen(),false);assert.equal(g.HideoutWarehousePanel.isOpen(),false);assert.deepEqual(h.errors,[]);
 }finally{timer?.restore();await h.close();}
});
