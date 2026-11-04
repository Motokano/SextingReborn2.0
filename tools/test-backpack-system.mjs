import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { boot } from './ui-game-fixture.mjs';
import { backpackTemplates, validateBackpacks } from './build-backpack-catalog.mjs';
const config=JSON.parse(fs.readFileSync('data/backpacks.json','utf8'));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const clone=x=>JSON.parse(JSON.stringify(x));
async function setup(h){
 const g=h.g;g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
 const input=g.document.getElementById('creation-name');input.value='背包验收';input.dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();
 g.document.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
 g.GameEngine.setState('M0_Base_Inside_lv_1',5,11);g.NPCSystem.setDemoFlag('sewing_station_unlocked',true);
 g.Survival.setState({isDead:false,isComa:false,stamina:100,energy:100,thirst:100});
 assert.equal(g.SewingStationPanel.open(),true);
}
function stock(g,n=100){const wh=g.HideoutWarehouse.getState(),ids=[...new Set([...Object.values(config.models).flatMap(m=>Object.keys(m.craft.cost)),...Object.values(config.modifications).flatMap(m=>Object.keys(m.cost))])];wh.capacity=100;wh.slots=ids.map(item_id=>({item_id,count:n}));wh.settings.prefer_deduct_warehouse=true;g.HideoutWarehouse.setState(wh);}
function mount(g,bag,contents=[]){const IE=g.InventoryEquipment,s=IE.getState();s.equipment=Object.fromEntries(Object.keys(s.equipment).map(k=>[k,null]));s.equipment.backpack=bag;s.inventory_pocket=[];s.inventory_vest=[];s.inventory_backpack=contents;s.inventory_vehicle=[];s.bound_vehicle_id=null;s.ground_items={};IE.setState(s);}
function complete(g,a){const q=g.SewingSystem.preview(a);assert.equal(q.ok,true,q.message);assert.equal(g.SewingSystem.start([a]).ok,true);let r;for(let i=0;i<q.ticks;i++){r=g.SewingSystem.step();assert.equal(r.ok,true,r.message);}assert.equal(r.done,true);}

test('backpack catalog, instances, weight, sewing transactions, preservation, persistence and death',async()=>{
 const h=await boot(false),g=h.g,IE=g.InventoryEquipment,B=g.BackpackSystem,S=g.SewingSystem;
 try{
  await setup(h);stock(g);
  assert.equal(validateBackpacks(config),config);
  for(const [id,m] of Object.entries(config.models)){
   const t=IE.getItemTemplate(id);assert.ok(t,id);assert.equal(t.enchant_slots,2);assert.equal(t.stack_limit,1);
   const bag=B.generate(id);mount(g,bag);assert.equal(IE.getBackpackSlots(),m.slots);near(IE.getCurrentCarryWeight(),m.weight_kg);
   assert.equal(backpackTemplates(config)[id].backpack_slots,m.slots);
   for(const material of Object.keys(m.craft.cost))assert.ok(IE.getItemTemplate(material),material);
  }
  assert.throws(()=>B.generate('eq_backpack_light_canvas',['enc_backpack_light','enc_backpack_light']));
  assert.throws(()=>B.generate('eq_backpack_light_canvas',['missing']));
  assert.throws(()=>B.generate('eq_backpack_light_canvas',Object.keys(config.affixes).slice(0,3)));
  const invalid=B.generate('eq_backpack_light_canvas');invalid.attribute_state.structure.backpack.modification='missing';assert.equal(B.validate(invalid).success,false);assert.match(B.describe(invalid),/12格/);
  let bag=B.generate('eq_backpack_frame_hauler',['enc_backpack_load','enc_backpack_mineral']);
  bag.attribute_state.structure.backpack.modification='frame';
  const mineral={item_id:'material_iron_blank_common',count:1},tool={item_id:'tool_flask_iron_water',count:1};
  mount(g,bag,[mineral,tool]);near(B.weightFactor(bag,mineral),.27);near(B.weightFactor(bag,tool),.36);
  near(IE.getCurrentCarryWeight(),3.8+IE.getItemCombinedWeight(mineral)*.27+IE.getItemCombinedWeight(tool)*.36);
  const equipmentBag=B.generate('eq_backpack_light_canvas',['enc_backpack_equipment']);near(B.weightFactor(equipmentBag,tool),.6);near(B.weightFactor(equipmentBag,mineral),.75);
  const combined={item_id:'tool_flask_iron_water',count:1,connections:{test:{item_id:'material_iron_blank_common',count:1}}};
  mount(g,equipmentBag,[combined]);assert.equal(IE.getBackpackArray().filter(Boolean).length,1);near(IE.getCurrentCarryWeight(),.5+IE.getItemCombinedWeight(IE.getBackpackArray()[0])*.6);
  const backup=B.generate('eq_backpack_frame_hauler',['enc_backpack_load']);mount(g,equipmentBag,[backup]);near(IE.getCurrentCarryWeight(),.5+3*.6);
  const savedFloor=config.minimum_weight_factor;g.BackpackConfig.minimum_weight_factor=.4;near(B.weightFactor(bag,mineral),.4);g.BackpackConfig.minimum_weight_factor=savedFloor;
  bag=B.generate('eq_backpack_light_canvas',['enc_backpack_capacity','enc_backpack_light']);mount(g,bag);
  const id=IE.getState().equipment.backpack.instance_id,live=()=>IE.findItemInstanceRecord(id).instance;
  for(const modification of ['pouches','frame','lighten','lining','none']){
   stock(g);const beforeCount=B.materialCount('textile_hemp_cloth'),beforeTick=g.GameTime.getState().totalTicks,recipe=config.modifications[modification];
   complete(g,{type:'backpack_modify',id,modification});assert.equal(live().instance_id,id);assert.equal(live().attribute_state.structure.backpack.modification,modification);
   assert.equal(g.GameTime.getState().totalTicks,beforeTick+recipe.ticks);assert.equal(B.materialCount('textile_hemp_cloth'),beforeCount-(recipe.cost.textile_hemp_cloth||0));
   near(IE.getCurrentCarryWeight(),B.profile(live()).selfWeight);assert.equal(IE.getBackpackSlots(),B.profile(live()).slots);
   assert.deepEqual(clone(live().enchants),['enc_backpack_capacity','enc_backpack_light']);
   const before=JSON.stringify(IE.getState());assert.equal(S.start([{type:'backpack_modify',id,modification}]).ok,false);assert.equal(JSON.stringify(IE.getState()),before);
  }
  // Shrink uses post-payment occupancy and compacts high occupied indices without losing identities.
  stock(g);mount(g,B.generate('eq_backpack_light_canvas'),Array.from({length:12},()=>({item_id:'material_iron_blank_common',count:1})));
  const shrinkId=IE.getState().equipment.backpack.instance_id,shrink={type:'backpack_modify',id:shrinkId,modification:'lighten'};
  const beforeFail=g.GameTime.getState().totalTicks;assert.equal(S.preview(shrink).ok,false);assert.equal(S.start([shrink]).ok,false);assert.equal(g.GameTime.getState().totalTicks,beforeFail);
  let state=IE.getState();state.inventory_backpack=[null,...state.inventory_backpack.slice(0,9),{item_id:'textile_cotton_cloth',count:2},{item_id:'material_nylon_stock',count:1}];IE.setState(state);
  let wh=g.HideoutWarehouse.getState();wh.settings.prefer_deduct_warehouse=false;g.HideoutWarehouse.setState(wh);
  assert.equal(S.preview(shrink).ok,true);const kept=IE.getBackpackArray().filter(x=>x?.item_id==='material_iron_blank_common').map(x=>x.instance_id);
  complete(g,shrink);assert.equal(IE.getBackpackSlots(),10);assert.deepEqual(Array.from(IE.getBackpackArray().filter(Boolean),x=>x.instance_id),Array.from(kept));
  // Atomic save failure restores this work tick, material stocks and the modified instance.
  stock(g);const change={type:'backpack_modify',id:shrinkId,modification:'frame'};assert.equal(S.start([change]).ok,true);
  for(let i=0;i<5;i++)assert.equal(S.step().ok,true);
  const failTick=g.GameTime.getState().totalTicks,failInv=JSON.stringify(IE.getState()),failStock=JSON.stringify(g.HideoutWarehouse.getState()),save=g.SaveSystem.saveNow;
  g.SaveSystem.saveNow=()=>false;try{assert.equal(S.step().ok,false);}finally{g.SaveSystem.saveNow=save;}
  assert.equal(g.GameTime.getState().totalTicks,failTick);assert.equal(JSON.stringify(IE.getState()),failInv);assert.equal(JSON.stringify(g.HideoutWarehouse.getState()),failStock);
  assert.equal(g.SewingStationPanel.open(),true,'rollback closes transient work panels');
  stock(g);assert.equal(S.start([change]).ok,true);assert.equal(S.step().ok,true);const cancelStock=JSON.stringify(g.HideoutWarehouse.getState());S.cancel();assert.equal(JSON.stringify(g.HideoutWarehouse.getState()),cancelStock);
  // No bag needed to rebuild: home materials, new identity, no affixes/modification, ground fallback.
  mount(g,null);stock(g);complete(g,{type:'backpack_craft',model:'eq_backpack_light_canvas'});
  const pos=g.GameEngine.getState();let made=IE.getGroundItemsAt(pos.mapId,pos.x,pos.y).find(x=>B.managed(x.item_id));assert.ok(made);assert.deepEqual(clone(made.enchants),[]);assert.equal(B.profile(made).modification,'none');
  // Real iframe navigation and action buttons use the same consumer, including equipped targets.
  mount(g,made);stock(g);const dom=new JSDOM(fs.readFileSync('sewing-station.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{runScripts:'outside-only'}),w=dom.window;
  Object.defineProperty(w,'parent',{value:g});let tick;w.setInterval=fn=>(tick=fn,1);w.clearInterval=()=>{tick=null;};w.eval(fs.readFileSync('js/sewing-station-view.js','utf8'));
  const click=(area,name)=>{const button=[...w.document.querySelectorAll(area+' button')].find(b=>b.textContent===name);assert.ok(button,name);assert.equal(button.disabled,false);button.click();};
  click('#workspaces','背包');assert.equal(w.document.querySelectorAll('#list button').length,3);assert.ok(w.document.getElementById('mannequin').hidden);click('#menus','改造');assert.match(w.document.querySelector('#list').textContent,/正在装备/);
  const select=w.document.querySelector('[aria-label="改造方案"]');select.value='pouches';select.dispatchEvent(new w.Event('change'));assert.match(w.document.querySelector('#editor').textContent,/16格/);click('#commit','开始改造');while(tick)tick();assert.equal(IE.getBackpackSlots(),16);dom.window.close();
  // Fractions survive moving, warehouse transfer and full save/load; only direct food is discounted.
  bag=B.generate('eq_backpack_light_canvas',['enc_backpack_fresh']);bag.attribute_state.structure.backpack.modification='lining';
  const food={item_id:'food_cooking_fail_generic',count:1};mount(g,bag,[food]);let foodId=IE.getBackpackArray()[0].instance_id;
  g.HideoutWarehouse.tickSpoilage();near(IE.findItemInstanceRecord(foodId).instance.spoilage_elapsed_ticks,.4);
  const snapshot=g.SaveSystem.buildSnapshotForDebug();assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot),true);near(IE.findItemInstanceRecord(foodId).instance.spoilage_elapsed_ticks,.4);
  g.HideoutWarehouse.tickSpoilage();near(IE.findItemInstanceRecord(foodId).instance.spoilage_elapsed_ticks,.8);
  assert.equal(g.HideoutWarehouse.depositFromContainer('backpack',0).ok,true);const whFood=()=>g.HideoutWarehouse.getState().slots.find(x=>x?.instance_id===foodId);near(whFood().spoilage_elapsed_ticks,.8);g.HideoutWarehouse.tickSpoilage();near(whFood().spoilage_elapsed_ticks,1.8);
  state=IE.getState();state.inventory_backpack=[{...food,spoilage_elapsed_ticks:599.8}];IE.setState(state);g.HideoutWarehouse.tickSpoilage();assert.equal(IE.getBackpackArray().filter(Boolean).length,0,'fractional expiration reaches the existing lifetime');
  const stored=JSON.stringify(g.HideoutWarehouse.getState()),knowledge=JSON.stringify(g.NPCSystem.getFlagValue('sewing_knowledge'));
  IE.clearAllOnDeath();assert.equal(IE.getState().equipment.backpack,null);assert.equal(IE.getBackpackSlots(),0);assert.equal(JSON.stringify(g.HideoutWarehouse.getState()),stored);assert.equal(JSON.stringify(g.NPCSystem.getFlagValue('sewing_knowledge')),knowledge);
  const legacy=IE.getState();delete legacy.equipment.backpack;IE.setState(legacy);assert.equal(IE.getState().equipment.backpack,null);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

for(const svelte of [false,true])test(`${svelte?'Svelte':'native'} backpack UI: equip, swap, details and unique contents`,async()=>{
 const h=await boot(svelte),g=h.g,IE=g.InventoryEquipment,B=g.BackpackSystem;
 try{
  await setup(h);g.SewingStationPanel.close();
  const old=B.generate('eq_backpack_multi_pocket',['enc_backpack_light']),next=B.generate('eq_backpack_light_canvas',['enc_backpack_capacity']);
  next.attribute_state.structure.backpack.modification='frame';mount(g,old,[next,{item_id:'material_iron_blank_common',count:3}]);
  const ids=[IE.getState().equipment.backpack.instance_id,...Array.from(IE.getBackpackArray().filter(Boolean),x=>x.instance_id)];
  g.SceneApp.openBackpackPanel();await h.drain();g.document.querySelector('[data-container="backpack"]').click();await h.drain();
  const row=[...g.document.querySelectorAll('.bp-item-row')].find(r=>r.textContent.includes('eq_backpack_light_canvas'));assert.ok(row);row.click();await h.drain();
  const buttons=[...g.document.querySelectorAll('#backpack-detail button')];const equip=buttons.find(b=>b.textContent.trim()==='穿上');assert.ok(equip,buttons.map(b=>b.textContent).join(','));equip.click();await h.drain();
  assert.equal(IE.getState().equipment.backpack.instance_id,ids[1]);assert.equal(IE.getBackpackSlots(),14);
  for(const id of ids)assert.ok(IE.findItemInstanceRecord(id),'swap retains '+id);
  assert.equal(IE.findItemInstanceRecord(ids[2]).instance.count,3,'swapping keeps the whole stack');
  assert.equal(IE.findItemInstanceRecord(ids[2]).parent.instance_id,ids[0],'contents stay in the old bag');
  assert.equal(IE.getBackpackArray().filter(Boolean).length,0,'new empty bag does not inherit old contents');
  assert.equal(IE.findItemInstanceRecord(ids[0]).relation,'ground');
  const x=IE.getState().equipment.backpack,tpl=IE.getItemTemplate(x.item_id),info=g.ItemInfoModules;
  assert.match(info.renderTooltipModulesHtml({inst:x,tpl}),/14格/);assert.match(JSON.stringify(info.tooltipView({inst:x,tpl})),/承重背架/);
  assert.equal(IE.equip('backpack',B.generate('eq_backpack_frame_hauler')).success,false,'direct replacement cannot delete equipped bag');
  const click=async(selector,label)=>{const b=[...g.document.querySelectorAll(selector)].find(x=>x.textContent.trim()===label);assert.ok(b,label);b.click();await h.drain();};
  g.document.querySelector('[data-container="ground"]').click();await h.drain();
  const oldRow=[...g.document.querySelectorAll('.bp-item-row')].find(r=>r.textContent.includes('eq_backpack_multi_pocket'));assert.ok(oldRow);oldRow.click();await h.drain();
  assert.match(g.document.querySelector('#backpack-detail').textContent,/包内占用：1 \/ 24格/);
  await click('#backpack-detail button','穿上');assert.equal(IE.getState().equipment.backpack.instance_id,ids[0]);assert.equal(IE.getBackpackArray().filter(Boolean)[0].instance_id,ids[2]);
  const eqRow=[...g.document.querySelectorAll('#equip-list .equip-row')].find(r=>r.querySelector('.slot-name')?.textContent==='背包');assert.ok(eqRow);eqRow.click();await h.drain();
  await click('[data-bp-whole="drop"]','整包放下');assert.equal(IE.getState().equipment.backpack,null);assert.equal(IE.getBackpackSlots(),0);
  assert.equal(IE.findItemInstanceRecord(ids[2]).relation,'backpack_content');assert.equal(IE.findItemInstanceRecord(ids[2]).parent.instance_id,ids[0]);
  const pos=g.GameEngine.getState();assert.equal(IE.getGroundItemsAt(pos.mapId,pos.x,pos.y).length,2,'two bag roots, no scattered materials');
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('whole bags: closed ownership, food aging, mass, ground/save/warehouse round trips, atomic failure and death',async()=>{
 const h=await boot(false),g=h.g,IE=g.InventoryEquipment,B=g.BackpackSystem,HW=g.HideoutWarehouse;
 try{
  await setup(h);g.GameEngine.setState('M0_Base_Inside_lv_1',5,12);g.SewingStationPanel.close();stock(g);
  const bag=B.generate('eq_backpack_light_canvas',['enc_backpack_fresh']);bag.attribute_state.structure.backpack.modification='lining';
  mount(g,bag,[{item_id:'material_iron_blank_common',count:3},null,{item_id:'food_cooking_fail_generic',count:1,spoilage_elapsed_ticks:17.4},{item_id:'tool_flask_iron_water',count:1,attribute_state:{structure:{liquid_storage:{version:1,water:125}}}},{item_id:'tool_flask_iron_water',count:1,connections:{test:{item_id:'material_iron_blank_common',count:1}}}]);
  const bagId=IE.getState().equipment.backpack.instance_id,contents=clone(IE.getState().inventory_backpack),foodId=contents[2].instance_id,childId=contents[4].connections.test.instance_id;
  const weight=IE.getCurrentCarryWeight(),physical=.8+contents.filter(Boolean).reduce((sum,x)=>sum+IE.getItemCombinedWeight(x),0);
  const drop=()=>B.transfer({action:'drop',source:'equipment',index:'backpack',id:bagId});
  const pos=()=>g.GameEngine.getState(),ground=()=>IE.getGroundItemsAt(pos().mapId,pos().x,pos().y);
  const equip=(id)=>B.transfer({action:'equip',source:'ground',index:ground().findIndex(x=>x.instance_id===id),id});
  assert.equal(drop().ok,true);assert.equal(ground().length,1);assert.equal(ground()[0].instance_id,bagId);assert.deepEqual(clone(ground()[0].backpack_contents),contents);
  near(IE.getCurrentCarryWeight(),0);near(IE.getItemCombinedWeight(ground()[0]),physical);assert.equal(IE.findItemInstanceRecord(childId).parent.instance_id,contents[4].instance_id);assert.equal(IE.auditItemOwnership().ok,true);
  HW.tickSpoilage();near(IE.findItemInstanceRecord(foodId).instance.spoilage_elapsed_ticks,18.4,'closed ground bag does not freeze food');
  const snap=g.SaveSystem.buildSnapshotForDebug();assert.equal(g.SaveSystem.applySnapshotForDebug(snap),true);assert.equal(ground()[0].instance_id,bagId);assert.equal(IE.auditItemOwnership().ok,true);
  const closed=clone(ground()[0].backpack_contents);assert.equal(equip(bagId).ok,true);assert.deepEqual(clone(IE.getState().inventory_backpack),closed);assert.equal(IE.getState().equipment.backpack.backpack_contents,undefined);near(IE.getCurrentCarryWeight(),weight);
  HW.tickSpoilage();near(IE.findItemInstanceRecord(foodId).instance.spoilage_elapsed_ticks,18.8);assert.equal(IE.getItemInstanceValue(IE.getBackpackArray()[3],'flask_water'),125);
  // New placement resets the ground timer; an earlier placement must not expire a worn bag.
  g.Survival.setState({tickCount:1000});assert.equal(drop().ok,true);assert.equal(ground()[0].ground_drop_tick,1000);IE.pruneExpiredGroundItems(1001,100);assert.equal(ground().length,1);
  const other=B.generate('eq_backpack_multi_pocket');assert.equal(IE.equip('backpack',other).success,true);
  const before=JSON.stringify(IE.getState());const failedPickup=B.transfer({action:'pickup',source:'ground',index:0,id:bagId});assert.equal(failedPickup.ok,false);assert.match(failedPickup.message,/整包/);assert.equal(JSON.stringify(IE.getState()),before);
  // A full bag can travel in a vehicle and then occupy one warehouse slot with all children.
  IE.setState({...IE.getState(),bound_vehicle_id:'backpack_test_cart',inventory_vehicle:[]});assert.equal(B.transfer({action:'pickup',source:'ground',index:0,id:bagId}).ok,true);
  assert.equal(IE.getBackpackArray().filter(Boolean).length,0);assert.equal(IE.getVehicleArray()[0].instance_id,bagId);near(IE.getItemCombinedWeight(IE.getVehicleArray()[0]),physical);
  assert.equal(HW.depositFromContainer('vehicle',0).ok,true);let slot=HW.getState().slots.findIndex(x=>x?.instance_id===bagId);assert.ok(slot>=0);
  const ware=()=>HW.getState().slots.find(x=>x?.instance_id===bagId);assert.equal(ware().backpack_contents[4].connections.test.instance_id,childId);HW.tickSpoilage();near(ware().backpack_contents[2].spoilage_elapsed_ticks,19.8);
  assert.equal(IE.auditItemOwnership(HW.getState().slots).ok,true);const warehouseSnap=g.SaveSystem.buildSnapshotForDebug();assert.equal(g.SaveSystem.applySnapshotForDebug(warehouseSnap),true);assert.equal(ware().instance_id,bagId);
  IE.setState({...IE.getState(),bound_vehicle_id:null});assert.equal(HW.withdrawSlot(slot,1).ok,true);assert.equal(ground()[0].instance_id,bagId);
  // Failed save after exchanging whole bags restores both roots, their contents and placement.
  const beforeFail=JSON.stringify(IE.getState()),save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
  try{const r=equip(bagId);assert.equal(r.ok,false);assert.match(r.message,/保存失败/);}finally{g.SaveSystem.saveNow=save;}
  assert.equal(JSON.stringify(IE.getState()),beforeFail);assert.equal(IE.auditItemOwnership().ok,true);assert.equal(equip(bagId).ok,true);assert.equal(IE.getBackpackArray()[4].connections.test.instance_id,childId);
  // Existing active-container saves remain lossless and become portable on first removal.
  const legacy=clone(IE.getState());assert.equal(legacy.equipment.backpack.backpack_contents,undefined);IE.setState(legacy);assert.equal(drop().ok,true);assert.equal(equip(bagId).ok,true);
  // Packed vehicle bags must also be checked when a modification shrinks their capacity.
  const tiny=B.generate('eq_backpack_light_canvas');tiny.backpack_contents=Array.from({length:11},()=>IE.ensureItemInstanceIdentity({item_id:'material_iron_blank_common',count:1}));
  IE.setState({...IE.getState(),bound_vehicle_id:'backpack_test_cart',inventory_vehicle:[tiny]});stock(g);assert.throws(()=>B.quote({type:'backpack_modify',id:tiny.instance_id,modification:'lighten'}),/整理/);
  const stored=JSON.stringify(HW.getState()),outside=JSON.stringify(IE.getState().ground_items);IE.clearAllOnDeath();assert.equal(IE.findItemInstanceRecord(bagId),null);assert.equal(IE.findItemInstanceRecord(childId),null);assert.equal(IE.findItemInstanceRecord(tiny.instance_id),null);assert.equal(JSON.stringify(HW.getState()),stored);assert.equal(JSON.stringify(IE.getState().ground_items),outside);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
