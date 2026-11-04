import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-game-fixture.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
async function setup(h){const g=h.g;g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();const el=g.document.getElementById('creation-name');el.value='背包存取';el.dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();g.document.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();g.GameEngine.setState('M0_Base_Inside_lv_1',5,12);g.Survival.setState({isDead:false,isComa:false,stamina:100,energy:100,thirst:100});reset(g);}
function reset(g){const I=g.InventoryEquipment,s=I.getState();s.equipment=Object.fromEntries(Object.keys(s.equipment).map(k=>[k,null]));s.equipment.clothing={item_id:'eq_clothing_combat_suit',count:1};s.equipment.backpack=g.BackpackSystem.generate('eq_backpack_light_canvas');s.inventory_backpack=[{item_id:'material_iron_blank_common',count:5},null,{item_id:'tool_flask_iron_water',count:1,attribute_state:{structure:{liquid_storage:{version:1,water:125}}}},{item_id:'food_flatbread_plain',count:2,spoilage_elapsed_ticks:40}];s.inventory_pocket=[];s.inventory_vest=[];s.inventory_vehicle=[];s.bound_vehicle_id=null;s.ground_items={};I.setState(s);}
test('quantity transfers preserve items, slots, identity, state, locks, timing and atomic saves',async()=>{
 const h=await boot(false),g=h.g;try{await setup(h);const I=g.InventoryEquipment,T=g.InventoryTransfer,B=g.BackpackSystem;
 let bag=T.context('backpack'),pocket=T.context('pocket'),id=I.getBackpackArray()[0].instance_id;
 assert.equal(T.move({from:bag,to:pocket,id,count:3}).ok,true);assert.equal(I.getBackpackArray()[0].count,2);assert.deepEqual(Array.from(I.getPocketArray(),x=>x.count),[1,1,1]);assert.equal(I.auditItemOwnership().ok,true);
 const full=JSON.stringify(I.getState());assert.equal(T.move({from:bag,to:pocket,id,count:2}).ok,false);assert.equal(JSON.stringify(I.getState()),full);
 const first=I.getPocketArray()[0];assert.equal(T.move({from:pocket,to:bag,id:first.instance_id,count:1}).ok,true);assert.equal(I.getPocketArray()[0],null);assert.equal(I.getPocketArray()[1].count,1);assert.equal(I.getBackpackArray()[0].count,3);
 assert.equal(T.move({from:bag,to:pocket,id,count:0}).ok,false);assert.equal(T.move({from:bag,to:pocket,id,count:1.2}).ok,false);
 const lock=g.ForgingSystem.isInstanceLocked;g.ForgingSystem.isInstanceLocked=x=>x===id;assert.equal(T.move({from:bag,to:pocket,id,count:1}).ok,false);g.ForgingSystem.isInstanceLocked=lock;
 const bagId=I.getState().equipment.backpack.instance_id,water=clone(I.getBackpackArray()[2]);assert.equal(B.transfer({action:'drop',source:'equipment',index:'backpack',id:bagId}).ok,true);
 const floor=T.context('groundBag',bagId),stamp=T.read(floor).owner.ground_drop_tick;assert.equal(T.move({from:bag,to:pocket,id,count:1}).ok,false,'old equipped context rejected');
 assert.equal(T.move({from:floor,to:pocket,id,count:1}).ok,true);assert.equal(T.read(floor).owner.ground_drop_tick,stamp);
 const pos=T.position();g.GameEngine.setState(pos.mapId,pos.x+1,pos.y);assert.equal(T.move({from:floor,to:pocket,id,count:1}).ok,false,'adjacent rejected');g.GameEngine.setState(pos.mapId,pos.x,pos.y);
 const s=I.getState();s.bound_vehicle_id='transfer_test_cart';I.setState(s);const vehicle=T.context('vehicle'),beforeTick=g.GameTime.getState().totalTicks;
 assert.equal(T.move({from:floor,to:vehicle,id:water.instance_id,count:1}).ok,true);assert.equal(g.GameTime.getState().totalTicks,beforeTick+1);assert.deepEqual(clone(I.getVehicleArray()[0]),water);
 const saved=JSON.stringify(I.getState()),time=g.GameTime.getState().totalTicks,save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
 assert.equal(T.move({from:vehicle,to:floor,id:water.instance_id,count:1}).ok,false);assert.equal(JSON.stringify(I.getState()),saved);assert.equal(g.GameTime.getState().totalTicks,time);g.SaveSystem.saveNow=save;
 const retry=T.move({from:vehicle,to:floor,id:water.instance_id,count:1});assert.equal(retry.ok,true,retry.message+' '+JSON.stringify({position:T.position(),floor,vehicle,bound:I.getState().bound_vehicle_id}));assert.equal(T.read(floor).owner.ground_drop_tick,stamp);
 const other=B.generate('eq_backpack_multi_pocket');assert.equal(I.equip('backpack',other).success,true);assert.equal(T.move({from:T.context('ground'),to:T.context('backpack'),id:bagId,count:1}).ok,false,'nonempty nesting refused');
 const state=I.getState();state.inventory_pocket=[{item_id:'textile_cotton_cloth',count:1},{item_id:'textile_cotton_cloth',count:1},null];state.inventory_backpack=[{item_id:'material_iron_blank_common',count:5},{item_id:'textile_cotton_cloth',count:1}];I.setState(state);
 assert.equal(T.takeAll(T.context('backpack'),T.context('pocket')).ok,true);assert.equal(I.getBackpackArray()[0].count,5);assert.equal(I.getBackpackArray()[1],null);assert.equal(I.getPocketArray()[2].count,1);
 assert.equal(I.auditItemOwnership().ok,true);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
for(const full of [false,true])test(`${full?'Svelte':'native'} grid entry, equipment, same-cell ground and safe invalidation`,async()=>{
 const h=await boot(full),g=h.g;try{await setup(h);const d=g.document,I=g.InventoryEquipment,T=g.InventoryTransfer;g.SceneApp.openBackpackPanel();await h.drain();
 assert.equal(d.querySelectorAll('#backpack-transfer').length,1);assert.equal(d.querySelectorAll('.bp-equipment-column #equip-list').length,1);assert.equal(d.querySelectorAll('.bp-personal-column [data-bp-zone="backpack"] .bp-grid-slot').length,12);assert.equal(d.querySelectorAll('.bp-personal-column [data-bp-zone="pocket"] .bp-grid-slot').length,3);assert.ok(d.querySelector('.bp-external-column [data-bp-zone="right"]'));
 const id=I.getBackpackArray()[0].instance_id;d.querySelector(`[data-bp-id="${id}"]`).click();await h.drain();const qty=d.querySelector('[data-bp-quantity="backpack"]');qty.value='2';qty.dispatchEvent(new g.Event('input',{bubbles:true}));d.querySelector('[data-bp-transfer="backpack"]').click();await h.drain();assert.equal(I.getBackpackArray()[0].count,3);assert.equal(I.getPocketArray().filter(Boolean).length,2);
 assert.equal(d.querySelector('[data-bp-view="equipment"]'),null);g.SceneApp.closePublicModal('modal-backpack');await h.drain();d.querySelector('#btn-equipment').click();await h.drain();assert.equal(d.querySelector('.bp-title').textContent,'背包');assert.equal(d.querySelector('#backpack-transfer').hidden,false);assert.ok(d.querySelector('.bp-equipment-column .equip-row'));
 const row=[...d.querySelectorAll('.equip-row')].find(x=>x.querySelector('.slot-name')?.textContent==='背包');row.click();await h.drain();assert.ok(d.querySelector('#modal-backpack').classList.contains('bp-grid-mode'));
 d.querySelector('[data-bp-owner="backpack"][data-bp-whole="drop"]').click();await h.drain();const bagId=I.getGroundItemsAt(T.position().mapId,T.position().x,T.position().y)[0].instance_id;g.SceneApp.openGroundItems(bagId);await h.drain();assert.equal(g.BackpackPanel.groundContext().id,bagId);assert.equal(d.querySelectorAll('[data-bp-zone="right"] .bp-grid-slot').length,12);
 const time=g.GameTime.getState().totalTicks,pos=T.position();g.GameEngine.setState(pos.mapId,pos.x+1,pos.y);g.SceneHud.refresh('status');await h.drain();assert.equal(g.SceneApp.panelApi.getOpen('backpack'),false);assert.equal(g.GameTime.getState().totalTicks,time,'automatic invalidation has no extra close tick');
 assert.equal(I.auditItemOwnership().ok,true);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
for(const full of [false,true])test(`${full?'Svelte':'native'} opening/closing time, expiry, death and ground save restoration`,async()=>{
 const h=await boot(full),g=h.g;try{await setup(h);const I=g.InventoryEquipment,T=g.InventoryTransfer,B=g.BackpackSystem;
 const start=g.GameTime.getState().totalTicks;g.SceneApp.openBackpackPanel();await h.drain();assert.equal(g.GameTime.getState().totalTicks,start+1);
 g.SceneApp.openBackpackPanel();await h.drain();assert.equal(g.GameTime.getState().totalTicks,start+1);
 g.SceneApp.closePublicModal('modal-backpack');await h.drain();assert.equal(g.GameTime.getState().totalTicks,start+2);
 const id=I.getState().equipment.backpack.instance_id;assert.equal(B.transfer({action:'drop',source:'equipment',index:'backpack',id}).ok,true);
 g.SceneApp.openGroundItems(id);await h.drain();const ctx=g.BackpackPanel.groundContext(),item=T.read(ctx).items[0];
 assert.equal(T.move({from:ctx,to:T.context('pocket'),id:item.instance_id,count:1}).ok,true);
 const snapshot=g.SaveSystem.buildSnapshotForDebug(),saved=clone(T.read(ctx).owner),stamp=saved.ground_drop_tick;
 assert.equal(I.getGroundItemRemainingTicks(ctx.mapId,saved),99);
 assert.equal(I.getGroundItemRemainingTicks('dungeon_test',saved),null);
 g.SceneApp.closeGroundBackpackView();I.setState({...I.getState(),ground_items:{}});assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot),true);assert.deepEqual(clone(T.read(ctx).owner),saved);
 g.SceneApp.openGroundItems(id);await h.drain();const time=g.GameTime.getState().totalTicks;I.pruneExpiredGroundItems(stamp+100);g.SceneHud.refresh('status');await h.drain();assert.equal(g.SceneApp.panelApi.getOpen('backpack'),false);assert.equal(g.GameTime.getState().totalTicks,time);
 assert.equal(T.move({from:ctx,to:T.context('pocket'),id:item.instance_id,count:1}).ok,false);
 reset(g);g.SceneApp.openBackpackPanel();await h.drain();g.Survival.setState({isComa:true});g.SceneHud.refresh('status');await h.drain();assert.equal(g.SceneApp.panelApi.getOpen('backpack'),false);
 assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
for(const full of [false,true])test(full+' three-column warehouse docking, quantity deposit, save rollback, withdrawal and close',async()=>{
 const h=await boot(full),g=h.g,d=g.document;try{
  await setup(h);const I=g.InventoryEquipment,T=g.InventoryTransfer,W=g.HideoutWarehouse;
  const initialTime=g.GameTime.getState().totalTicks;
  W.setState({...W.createDefaultState(),slots:[{item_id:'food_flatbread_plain',count:4}]});
  const modal=d.querySelector('#modal-hideout-warehouse'),parent=modal.parentNode;
  g.SceneApp.openHideoutWarehousePanel();await h.drain();
  assert.ok(g.BackpackPanel.interactionIs('warehouse'));
  assert.ok(d.querySelector('.bp-external-column #modal-hideout-warehouse'));
  assert.ok(d.querySelector('.bp-personal-column [data-bp-zone="backpack"]'));
  assert.equal(g.GameTime.getState().totalTicks,initialTime,'docking does not add inventory opening ticks');
  const iron=I.getBackpackArray()[0].instance_id;
  d.querySelector('[data-bp-id="'+iron+'"]').click();await h.drain();
  const qty=d.querySelector('[data-bp-quantity="backpack"]');qty.value='2';qty.dispatchEvent(new g.Event('input',{bubbles:true}));
  d.querySelector('[data-bp-deposit="backpack"]').click();await h.drain();
  assert.equal(I.getBackpackArray()[0].count,3);assert.equal(W.countItem('material_iron_blank_common'),2);
  const before=JSON.stringify([I.getState(),W.getState(),g.GameTime.getState()]),save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
  assert.equal(T.toWarehouse({from:T.context('backpack'),id:iron,count:1}).ok,false);
  assert.equal(JSON.stringify([I.getState(),W.getState(),g.GameTime.getState()]),before);g.SaveSystem.saveNow=save;
  g.HideoutWarehousePanel.render();await h.drain();
  d.querySelector('[data-slot-index="0"]').click();await h.drain();d.querySelector('#hw-btn-withdraw-one').click();await h.drain();
  assert.equal(W.getState().slots[0].count,3);assert.ok(d.querySelector('.bp-personal-column').textContent.includes('3'),'carried inventory remains rendered');
  g.SceneApp.closePublicModal('modal-backpack');await h.drain();
  assert.equal(g.HideoutWarehousePanel.isOpen(),false);assert.equal(g.SceneApp.panelApi.getOpen('backpack'),false);assert.equal(modal.parentNode,parent);
  assert.equal(T.toWarehouse({from:T.context('backpack'),id:iron,count:1}).ok,false,'stale deposit refused');
  g.SceneApp.openHideoutWarehousePanel();await h.drain();g.SceneApp.closeHideoutWarehousePanel();await h.drain();
  assert.equal(g.SceneApp.panelApi.getOpen('backpack'),false);assert.equal(modal.parentNode,parent);
  assert.equal(g.GameTime.getState().totalTicks,initialTime);assert.ok(I.auditItemOwnership().ok);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
for(const full of [false,true])test(full+' dungeon search and corpse windows dock without extra time and restore their host',async()=>{
 const h=await boot(full),g=h.g,d=g.document;try{
  await setup(h);const D=g.DungeonRuntime,E=g.GameEngine;E.setState('M0_Field_02',7,7);assert.ok(D.enter());
  const s=D.getSim();s.enemies=[];E.getMap().enemies=[];for(const door of s.doors)door.closed=false;
  const p=s.lootPoints.find(p=>p.access?.length);assert.ok(p);
  const at=k=>{E.setState(D.getRun().mapId,k%s.map.width,Math.floor(k/s.map.width));g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(k,p.cell,s.map.width));D.sync();};
  at(p.access[0]);p.search={opened:true,complete:true,cursor:1,items:[{item_id:'material_iron_blank_common',count:1,rarity:'common',revealed:true,claimed:false,ticks:1}]};
  const root=d.querySelector('.du-modal'),parent=root.parentNode,time=g.GameTime.getState().totalTicks;
  g.DungeonPanel.openPoint('container',p.uid);await h.drain();
  assert.ok(d.querySelector('.bp-external-column .du-modal'));assert.ok(root.textContent.includes('领取'));assert.equal(g.GameTime.getState().totalTicks,time);
  g.SceneApp.closePublicModal('modal-backpack');await h.drain();assert.equal(root.parentNode,parent);assert.equal(root.hidden,true);assert.equal(g.GameTime.getState().totalTicks,time);
  g.DungeonPanel.openPoint('container',p.uid);await h.drain();at(s.map.entry);g.SceneHud.refresh('status');await h.drain();assert.equal(g.SceneApp.panelApi.getOpen('backpack'),false);assert.equal(root.parentNode,parent);
  const corpse={uid:'layout-corpse',kind:'corpse',name:'尸体',cell:s.map.entry,marked:false,search:{opened:true,complete:true,cursor:1,items:[{item_id:'food_flatbread_plain',count:1,rarity:'common',revealed:true,claimed:false,ticks:1}]}};s.corpses.push(corpse);at(corpse.cell);
  const corpseTime=g.GameTime.getState().totalTicks;g.DungeonPanel.openPoint('corpse',corpse.uid);await h.drain();
  assert.ok(d.querySelector('.bp-external-column .du-modal'));assert.equal(g.GameTime.getState().totalTicks,corpseTime+1,'corpse retains its own opening tick only');
  g.SceneApp.closePublicModal('modal-backpack');await h.drain();assert.equal(g.GameTime.getState().totalTicks,corpseTime+2,'corpse retains its own closing tick only');assert.equal(root.parentNode,parent);assert.equal(g.SceneApp.panelApi.getOpen('backpack'),false);
  assert.deepEqual(h.errors,[]);
 }finally{g.DungeonPanel.close({silent:true});await h.close();}
});

for(const full of [false,true])test(`${full?'Svelte':'native'} Ctrl-click transfers whole stacks both ways across ground, bags, warehouse and loot`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;try{
  await setup(h);const I=g.InventoryEquipment,T=g.InventoryTransfer,W=g.HideoutWarehouse,D=g.DungeonRuntime;
  const ctrl=async selector=>{const el=d.querySelector(selector);assert.ok(el,selector);el.dispatchEvent(new g.MouseEvent('click',{bubbles:true,ctrlKey:true,button:0}));await h.drain();};
  const pos=T.position();I.addItemToGround(pos.mapId,pos.x,pos.y,{item_id:'textile_cotton_cloth',count:2});g.SceneApp.openBackpackPanel();await h.drain();
  const floorId=I.getGroundItemsAt(pos.mapId,pos.x,pos.y)[0].instance_id;await ctrl('[data-bp-id="'+floorId+'"]');
  assert.equal(I.getGroundItemsAt(pos.mapId,pos.x,pos.y).length,0);assert.equal(I.getBackpackArray().find(x=>x?.instance_id===floorId).count,2);assert.equal(g.BackpackPanel.hasSelection(),false);
  const iron=I.getBackpackArray()[0].instance_id;d.querySelector('[data-bp-id="'+iron+'"]').click();await h.drain();const qty=d.querySelector('[data-bp-quantity="backpack"]');qty.value='1';qty.dispatchEvent(new g.Event('input',{bubbles:true}));
  await ctrl('[data-bp-id="'+iron+'"]');assert.equal(I.getGroundItemsAt(pos.mapId,pos.x,pos.y).find(x=>x.instance_id===iron).count,5,'Ctrl ignores selected quantity and moves whole stack');
  const bag=g.BackpackSystem.generate('eq_backpack_multi_pocket',[]);I.addItemToGround(pos.mapId,pos.x,pos.y,bag);g.SceneApp.openGroundItems(bag.instance_id);await h.drain();
  const water=I.getBackpackArray().find(x=>x?.item_id==='tool_flask_iron_water'),waterBefore=clone(water);await ctrl('[data-bp-id="'+water.instance_id+'"]');
  assert.deepEqual(clone(T.read(g.BackpackPanel.groundContext()).items.filter(Boolean)[0]),waterBefore);await ctrl('[data-bp-id="'+water.instance_id+'"]');assert.deepEqual(clone(I.getBackpackArray().find(x=>x?.instance_id===water.instance_id)),waterBefore);
  g.SceneApp.closePublicModal('modal-backpack');await h.drain();W.setState({...W.createDefaultState(),slots:[]});g.SceneApp.openHideoutWarehousePanel();await h.drain();
  await ctrl('[data-bp-id="'+water.instance_id+'"]');assert.equal(W.getState().slots.filter(Boolean)[0].instance_id,water.instance_id);
  await ctrl('[data-bp-warehouse-id="'+water.instance_id+'"]');assert.equal(W.getState().slots.filter(Boolean).length,0);assert.deepEqual(clone(I.getBackpackArray().find(x=>x?.instance_id===water.instance_id)),waterBefore);
  W.setState({...W.getState(),slots:[{item_id:'textile_cotton_cloth',count:2,warehouse_locked:true}]});g.HideoutWarehousePanel.render();await h.drain();const locked=W.getState().slots[0].instance_id;
  const before=JSON.stringify([I.getState(),W.getState()]);await ctrl('[data-bp-warehouse-id="'+locked+'"]');assert.equal(JSON.stringify([I.getState(),W.getState()]),before,'sealed warehouse item remains');
  g.SceneApp.closePublicModal('modal-backpack');await h.drain();g.GameEngine.setState('M0_Field_02',7,7);assert.ok(D.enter());const sim=D.getSim();sim.enemies=[];g.GameEngine.getMap().enemies=[];for(const door of sim.doors)door.closed=false;
  const p=sim.lootPoints.find(x=>x.access?.length),cell=p.access[0];g.GameEngine.setState(D.getRun().mapId,cell%sim.map.width,Math.floor(cell/sim.map.width));g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(cell,p.cell,sim.map.width));D.sync();
  p.search={opened:true,complete:true,cursor:2,items:[{item_id:'material_iron_blank_common',count:3,rarity:'common',revealed:true,claimed:false,ticks:1},{item_id:'textile_cotton_cloth',count:1,rarity:'common',revealed:false,claimed:false,ticks:0}]};
  g.DungeonPanel.openPoint('container',p.uid);await h.drain();const start=g.GameTime.getState().totalTicks;
  await ctrl('[data-bp-loot-index="0"]');await ctrl('[data-bp-loot-index="0"]');await new Promise(r=>setTimeout(r,650));await h.drain();
  assert.equal(D.find(p.uid).search.items[0].claimed,true);assert.equal(D.find(p.uid).search.items[1].claimed,false);assert.equal(g.GameTime.getState().totalTicks,start+1,'repeat click does not claim twice');
  // Loot pickup already pays one tick, including its automatic vehicle fallback.
  const carried=clone(I.getState()),vehicleState=clone(carried);vehicleState.equipment.backpack=null;vehicleState.inventory_backpack=[];vehicleState.bound_vehicle_id='loot_quick_cart';vehicleState.inventory_vehicle=[];I.setState(vehicleState);
  D.find(p.uid).search.items.push({item_id:'material_iron_blank_common',count:3,rarity:'common',revealed:true,claimed:false,ticks:1});g.DungeonPanel.renderInteraction();await h.drain();const vehicleTick=g.GameTime.getState().totalTicks;
  await ctrl('[data-bp-loot-index="2"]');await new Promise(r=>setTimeout(r,650));await h.drain();assert.equal(I.getVehicleArray()[0].count,3);assert.equal(g.GameTime.getState().totalTicks,vehicleTick+1,'loot vehicle transfer does not add a second tick');I.setState(carried);g.SceneHud.refresh('status');await h.drain();
  await ctrl('[data-bp-id="'+water.instance_id+'"]');assert.deepEqual(clone(D.find(p.uid).stored_items[0]),waterBefore);
  const food=I.getBackpackArray().find(x=>x?.item_id==='food_flatbread_plain');await ctrl('[data-bp-id="'+food.instance_id+'"]');const aging=D.find(p.uid).stored_items.find(x=>x?.instance_id===food.instance_id),age=aging.spoilage_elapsed_ticks;W.tickSpoilage();assert.equal(aging.spoilage_elapsed_ticks,age+1);await ctrl('[data-bp-stored-id="'+food.instance_id+'"]');assert.equal(I.getBackpackArray().find(x=>x?.instance_id===food.instance_id).spoilage_elapsed_ticks,age+1);
  const snapshot=g.SaveSystem.buildSnapshotForDebug();assert.equal(D.validate(snapshot.dungeon,snapshot.player.engine),true);assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot),true);g.DungeonPanel.openPoint('container',p.uid);await h.drain();
  await ctrl('[data-bp-stored-id="'+water.instance_id+'"]');assert.deepEqual(clone(I.getBackpackArray().find(x=>x?.instance_id===water.instance_id)),waterBefore);assert.equal(D.storedItemRoots().length,0);
  const save=g.SaveSystem.saveNow,storedContext=g.DungeonPanel.storageContext(),pre=JSON.stringify([I.getState(),D.storedItemRoots(),g.GameTime.getState()]);g.SaveSystem.saveNow=()=>false;
  assert.equal(T.move({from:T.context('backpack'),to:storedContext,id:water.instance_id,count:1}).ok,false);g.SaveSystem.saveNow=save;assert.equal(JSON.stringify([I.getState(),D.storedItemRoots(),g.GameTime.getState()]),pre);
  assert.equal(I.auditItemOwnership({warehouse:W.getState().slots,dungeon:D.storedItemRoots()}).ok,true);assert.deepEqual(h.errors,[]);
 }finally{g.DungeonPanel.close({silent:true});await h.close();}
});

test('quick pickup splits without loss, uses vehicle fallback and rolls back full/failed transfers',async()=>{
 const h=await boot(false),g=h.g;try{await setup(h);const I=g.InventoryEquipment,T=g.InventoryTransfer,W=g.HideoutWarehouse,pos=T.position();
  let s=I.getState();s.equipment.backpack=null;s.inventory_backpack=[];s.inventory_pocket=[];I.setState(s);
  I.addItemToGround(pos.mapId,pos.x,pos.y,{item_id:'food_flatbread_plain',count:3,spoilage_elapsed_ticks:17});let item=I.getGroundItemsAt(pos.mapId,pos.x,pos.y)[0];
  assert.equal(T.quickTake(T.context('ground'),item.instance_id).ok,true);assert.deepEqual(Array.from(I.getPocketArray(),x=>[x.count,x.spoilage_elapsed_ticks]),[[1,17],[1,17],[1,17]]);assert.equal(I.auditItemOwnership().ok,true);
  I.addItemToGround(pos.mapId,pos.x,pos.y,{item_id:'food_flatbread_plain',count:2});item=I.getGroundItemsAt(pos.mapId,pos.x,pos.y)[0];const before=JSON.stringify([I.getState(),g.GameTime.getState()]);assert.equal(T.quickTake(T.context('ground'),item.instance_id).ok,false);assert.equal(JSON.stringify([I.getState(),g.GameTime.getState()]),before);
  s=I.getState();s.bound_vehicle_id='quick_cart';I.setState(s);const tick=g.GameTime.getState().totalTicks,save=g.SaveSystem.saveNow,held=JSON.stringify([I.getState(),g.GameTime.getState()]);g.SaveSystem.saveNow=()=>false;
  assert.equal(T.quickTake(T.context('ground'),item.instance_id).ok,false);assert.equal(JSON.stringify([I.getState(),g.GameTime.getState()]),held);g.SaveSystem.saveNow=save;
  assert.equal(T.quickTake(T.context('ground'),item.instance_id).ok,true);assert.equal(g.GameTime.getState().totalTicks,tick+1);assert.equal(I.getVehicleArray()[0].count,2);
  // Warehouse failure keeps the source inside the warehouse; no floor fallback.
  s=I.getState();s.bound_vehicle_id=null;s.inventory_vehicle=[];I.setState(s);W.setState({...W.createDefaultState(),slots:[{item_id:'textile_cotton_cloth',count:2}]});g.SceneApp.openHideoutWarehousePanel();await h.drain();const w=W.getState().slots[0],all=JSON.stringify([I.getState(),W.getState()]);assert.equal(T.fromWarehouse(0,w.instance_id).ok,false);assert.equal(JSON.stringify([I.getState(),W.getState()]),all);
  s=I.getState();s.inventory_pocket=[];I.setState(s);g.SceneApp.openHideoutWarehousePanel();await h.drain();const wBefore=JSON.stringify([I.getState(),W.getState(),g.GameTime.getState()]);g.SaveSystem.saveNow=()=>false;assert.equal(T.fromWarehouse(0,w.instance_id).ok,false);g.SaveSystem.saveNow=save;assert.equal(JSON.stringify([I.getState(),W.getState(),g.GameTime.getState()]),wBefore,'warehouse save failure restores both sides');
  g.SceneApp.closePublicModal('modal-backpack');await h.drain();reset(g);s=I.getState();const limit=I.getItemTemplate('food_flatbread_plain').stack_limit||I.getItemTemplate('food_flatbread_plain').stack_max||1;
  s.inventory_backpack=Array.from({length:I.getBackpackSlots()},()=>g.BackpackSystem.generate('eq_backpack_multi_pocket',[]));s.inventory_backpack[0]={item_id:'food_flatbread_plain',count:limit-1||1,spoilage_elapsed_ticks:40};s.inventory_pocket=[];I.setState(s);
  if(limit>1){I.addItemToGround(pos.mapId,pos.x,pos.y,{item_id:'food_flatbread_plain',count:3,spoilage_elapsed_ticks:17});const incoming=I.getGroundItemsAt(pos.mapId,pos.x,pos.y)[0];assert.equal(T.quickTake(T.context('ground'),incoming.instance_id).ok,true);assert.equal(I.getBackpackArray()[0].count,limit);assert.equal(I.getBackpackArray()[0].spoilage_elapsed_ticks,40);assert.deepEqual(Array.from(I.getPocketArray().filter(Boolean),x=>x.count),[1,1]);assert.equal(I.auditItemOwnership().ok,true);}
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
