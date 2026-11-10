import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot } from './ui-game-fixture.mjs';

async function setup(h) {
 const g=h.g;g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
 const input=g.document.getElementById('creation-name');input.value='灶台入口测试';input.dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();
 g.document.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
 g.GameEngine.setState('M0_Base_Inside_lv_1',13,14);
 g.Survival.setState({thirst:0,dirtyness:100});
}

for(const full of [false,true])test(`${full?'Svelte':'native'} facilities share the panel layout and stove menu follows repair state`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 const buttons=()=>Array.from(d.querySelectorAll('#npc-menu-buttons button'));
 const names=()=>buttons().map(b=>b.textContent.trim());
 async function click(text){const b=buttons().find(b=>b.textContent.trim()===text);assert.ok(b&&!b.disabled,text);b.click();await h.drain();}
 async function open(){await g.NPCSystem.openMenu('npc.station.cooking_base');await h.drain();}
 function materials(items){g.InventoryEquipment.setState({...g.InventoryEquipment.getState(),inventory_pocket:items,inventory_vest:[],inventory_backpack:[],inventory_vehicle:[]});}
 try{
  await setup(h);const tick=g.GameTime.getState().totalTicks;await open();
  const root=d.getElementById('npc-menu');
  assert.equal(root.classList.contains('npc-menu-checkpoint'),true);
  assert.deepEqual(names(),['修复灶台','查看灶台']);
  assert.ok(d.querySelector('#npc-menu-close svg[data-ui-icon="close"]'));
  assert.ok(buttons().every(b=>b.querySelector('svg')&&b.querySelector('span')),'consistent icon and label rows');
  assert.equal(d.getElementById('npc-menu-hint').hidden,true,'no redundant instruction text');
  const flags=JSON.stringify(g.NPCSystem.getDemoState());
  await click('查看灶台');assert.match(d.getElementById('npc-menu-detail').textContent,/破损/);
  assert.deepEqual(names(),[]);assert.equal(g.DialogueUI.isDialogueOpen(),false,'inspection stays inside the compact window');
  assert.equal(JSON.stringify(g.NPCSystem.getDemoState()),flags,'viewing the stove does not teach hidden material alternatives');
  assert.equal(g.GameTime.getState().totalTicks,tick);
  d.getElementById('npc-menu-back').click();await h.drain();assert.deepEqual(names(),['修复灶台','查看灶台']);
  g.SceneCtx.actions.tryIntentMove(13,13,0,-1,'keyboard');assert.equal(g.GameEngine.getState().y,14,'open menu blocks world movement');
  await click('修复灶台');assert.equal(g.FacilityUnlockPanel.isOpen(),true);assert.equal(g.NPCSystem.isMenuOpen(),false);
  assert.equal(g.FacilityUnlockPanel.getView().title,'修复烹饪台');
  g.FacilityUnlockPanel.close();await h.drain();assert.deepEqual(names(),['修复灶台','查看灶台'],'closing unfinished repair returns to the menu');
  await click('修复灶台');materials([{item_id:'ore_clay_raw',count:5},{item_id:'wood_plank_soft',count:2}]);
  const repair=g.FacilityUnlock.get('cooking');assert.equal(repair.repair({ore_clay_raw:5}).ok,true);assert.equal(repair.repair({wood_plank_soft:2}).ok,true);
  g.FacilityUnlockPanel.close();await h.drain();assert.deepEqual(names(),['使用灶台','修复灶台供水','查看灶台']);
  await click('查看灶台');assert.match(d.getElementById('npc-menu-detail').textContent,/供水尚未接通/);d.getElementById('npc-menu-back').click();await h.drain();
  await click('修复灶台供水');assert.equal(g.FacilityUnlockPanel.getView().title,'修复灶台供水');
  materials([{item_id:'ore_clay_raw',count:3},{item_id:'ore_scrap_metal',count:4},{item_id:'mechanical_parts',count:1}]);
  const water=g.FacilityUnlock.get('water');for(const offer of [{ore_clay_raw:3},{ore_scrap_metal:4},{mechanical_parts:1}])assert.equal(water.repair(offer).ok,true);
  g.FacilityUnlockPanel.close();await h.drain();assert.deepEqual(names(),['使用灶台','查看灶台'],'completed upgrades disappear');
  await click('查看灶台');assert.match(d.getElementById('npc-menu-detail').textContent,/供水已接通/);d.getElementById('npc-menu-back').click();await h.drain();
  assert.equal(g.GameTime.getState().totalTicks,tick,'menu, inspection and repair navigation do not advance world time');
  await click('使用灶台');assert.equal(g.CookingStationPanel.isOpen(),true);assert.equal(g.NPCSystem.isMenuOpen(),false);
  g.CookingStationPanel.close();await h.drain();await open();
  root.dispatchEvent(new g.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await h.drain();assert.equal(g.NPCSystem.isMenuOpen(),false);
  await open();d.getElementById('npc-menu-close').click();await h.drain();assert.equal(g.NPCSystem.isMenuOpen(),false);
  await open();g.GameEngine.setState('M0_Base_Inside_lv_1',3,3);await click('使用灶台');assert.equal(g.CookingStationPanel.isOpen(),false,'stale menu cannot use a remote stove');
  g.NPCSystem.menu.close();await open();assert.equal(g.NPCSystem.isMenuOpen(),false,'remote opening stays closed');
  const registry=JSON.parse(fs.readFileSync('data/npc/npc_registry.json','utf8'));
  const facilities=Object.values(registry.npcs).map(row=>JSON.parse(fs.readFileSync(row.def,'utf8'))).filter(def=>def.id.startsWith('npc.station.'));
  assert.ok(facilities.length>=11);
  const beforeMenus=JSON.stringify([g.InventoryEquipment.getState(),g.NPCSystem.getDemoState(),g.GameTime.getState()]);
  for(const def of facilities){
   g.GameEngine.setState(def.location.sceneId,def.location.x,def.location.y+1);
   // A fixed south tile may be outside the map or inside another facility.
   const footprint=(g.GameEngine.getMap().facility_footprints||[]).find(f=>f.npc_id===def.id);
   const {x,y}=footprint||def.location,[width,height]=def.gymStation?.footprint||[footprint?.width||1,footprint?.height||1],candidates=[];
   const directions=def.gymStation?[[1,0],[-1,0],[0,1],[0,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
   for(let dy=0;dy<height;dy++)for(let dx=0;dx<width;dx++)for(const [ax,ay] of directions)candidates.push({x:x+dx+ax,y:y+dy+ay});
   const p=candidates.find(p=>g.GameEngine.canStandAt(p.x,p.y));assert.ok(p,def.id+' has an accessible unoccupied neighbor');
   g.GameEngine.setState(def.location.sceneId,p.x,p.y);
   await g.NPCSystem.openMenu(def.id);await h.drain();
   if(def.id==='npc.station.agriculture_base'){
    assert.equal(g.NPCSystem.isMenuOpen(),false,'farm bypasses the shared NPC menu');
    assert.equal(g.FacilityLaborPanel.isOpen(),true);
    g.FacilityLaborPanel.close();await h.drain();continue;
   }
   assert.equal(g.NPCSystem.isMenuOpen(),true,def.id);
   assert.equal(root.classList.contains('npc-menu-checkpoint'),true,def.id);
   assert.equal(d.getElementById('npc-menu-title').textContent,def.displayTitle||def.name);
   assert.ok(buttons().length>0,def.id);
   assert.ok(buttons().every(b=>b.querySelector('svg')&&b.querySelector('span')),def.id+' icon rows');
   assert.ok(!names().includes('离开'),def.id+' uses header close');
   const close=d.getElementById('npc-menu-close');assert.ok(close&&!close.hidden,def.id);
   close.click();await h.drain();assert.equal(g.NPCSystem.isMenuOpen(),false,def.id);
  }
  assert.equal(JSON.stringify([g.InventoryEquipment.getState(),g.NPCSystem.getDemoState(),g.GameTime.getState()]),beforeMenus,'opening and closing facilities does not consume materials or time');
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

for (const full of [false, true]) test(`${full ? 'Svelte' : 'native'} facility entries switch from repair to use after real completion`, async () => {
 const h = await boot(full), g = h.g, d = g.document;
 const names = () => Array.from(d.querySelectorAll('#npc-menu-buttons button'), b => b.textContent.trim());
 async function open(id) { await g.NPCSystem.openMenu('npc.station.' + id + '_base'); await h.drain(); }
 async function click(label) {
  const button = Array.from(d.querySelectorAll('#npc-menu-buttons button')).find(b => b.textContent.trim() === label);
  assert.ok(button && !button.disabled, label); button.click(); await h.drain();
 }
 function supply(...projects) {
  const groups = new Set(projects.flatMap(id => Array.from(g.FacilityUnlock.get(id).groups, group => group.id)));
  const items = Array.from(groups, group => ({item_id:g.FacilityUnlockConfig.materials.find(m => m[1] === group && m[0] !== 'hus_wool')[0],count:100}));
  assert.ok(items.length <= 4, 'test stock fits the character pockets');
  g.InventoryEquipment.setState({...g.InventoryEquipment.getState(), inventory_pocket:items, inventory_vest:[], inventory_backpack:[], inventory_vehicle:[]});
 }
 function finish(id) {
  const project = g.FacilityUnlock.get(id);
  for (let i = 0; !project.isComplete() && i < 6; i++) {
   const result = project.repair(project.suggest()); assert.equal(result.ok, true, id+' '+result.message);
  }
  assert.equal(project.isComplete(), true, id);
 }
 try {
  await setup(h);
  for (const [id, title, panelName] of [
   ['forging','铸造台','ForgingStationPanel'], ['pharmacy','制药台','PharmacyStationPanel'], ['compost','制肥桶','CompostPanel']
  ]) {
   const project = g.FacilityUnlock.get(id), [x,y] = project.spec.position;
   // Pharmacy has no inspection entry; no upgrade project is registered in this fixture.
   const inspection = id === 'pharmacy' ? [] : ['查看'+title];
   const repairMenu = ['修复'+title,...inspection], useMenu = ['使用'+title,...inspection];
   // Avoid blocked ground and occupied NPC cells; world ticks relocate characters standing on facilities.
   const position = [[0,-1],[-1,-1],[1,-1],[-1,0],[1,0],[0,1],[-1,1],[1,1]]
    .map(([dx,dy]) => [x+dx,y+dy]).find(([px,py]) => g.GameEngine.canStandAt(px,py));
   assert.ok(position,id+' has an unoccupied test position');
   g.GameEngine.setState('M0_Base_Inside_lv_1',...position); supply(id);
   await open(id); assert.deepEqual(names(),repairMenu,id+' initially hides use');
   await click('修复'+title); assert.equal(g.FacilityUnlockPanel.isOpen(),true);
   const first = project.rows().find(row => row.group === project.currentGroup().id);
   assert.equal(project.repair({[first.id]:1}).ok,true);
   g.FacilityUnlockPanel.close(); await h.drain();
   assert.deepEqual(names(),repairMenu,id+' partial progress still needs repair');
   await click('修复'+title); finish(id);
   g.FacilityUnlockPanel.close(); await h.drain();
   assert.deepEqual(names(),useMenu,id+' completion replaces repair');
   const saved = g.SaveSystem.buildSnapshotForDebug();
   g.NPCSystem.setDemoFlag(project.spec.unlock,false); assert.equal(g.SaveSystem.applySnapshotForDebug(saved),true);
   await open(id); assert.deepEqual(names(),useMenu,id+' restored saves keep completed repair hidden');
   await click('使用'+title); assert.equal(g[panelName].isOpen(),true,id+' opens real use panel');
   g[panelName].close(); await h.drain();
   await open(id);
   assert.deepEqual(names(),useMenu,id+' closing the use panel returns to the same valid entry');
   g.NPCSystem.setDemoFlag(project.spec.unlock,false);
   await click('使用'+title); assert.equal(g[panelName].isOpen(),false,id+' rechecks unlock on click');
   g.NPCSystem.setDemoFlag(project.spec.unlock,true); g.NPCSystem.menu.close();
  }
  g.GameEngine.setState('M0_Base_Inside_lv_1',7,12); supply('calendar','temperature');
  await open('observation'); assert.deepEqual(names(),['装配工具台','查看工具台']);
  await click('装配工具台'); assert.equal(g.ToolbenchPanel.isOpen(),true);
  finish('calendar'); g.ToolbenchPanel.close(); await h.drain();
  await open('observation'); assert.deepEqual(names(),['装配工具台','查看工具台'],'one unfinished tool retains assembly entry');
  await click('装配工具台'); finish('temperature'); g.ToolbenchPanel.close(); await h.drain();
  await open('observation'); assert.deepEqual(names(),['使用工具台','查看工具台']);
  await click('使用工具台'); assert.equal(g.ToolbenchPanel.isOpen(),true); g.ToolbenchPanel.close(); await h.drain();
  for (const [id, restore, use, title] of [['agriculture','恢复农场','管理农田','农田'],['livestock','恢复牧场','管理牧场','牧场']]) {
   const position=id==='agriculture'?[5,10]:[10,9];
   g.NPCSystem.menu.close();g.GameEngine.setState('M0_Base_Outside_lv_1',...position); supply(id);
   await open(id);
   if(id==='agriculture')assert.equal(g.NPCSystem.isMenuOpen(),false,'farm opens restoration directly');
   else{assert.deepEqual(names(),[restore,'查看'+title]);await click(restore);}
   assert.equal(g.FacilityLaborPanel.isOpen(),true);
   g.FacilityLaborPanel.close(); await h.drain();
   g.NPCSystem.setDemoFlag('facility_labor:'+id,g.FacilityLabor.total);
   g.NPCSystem.setDemoFlag('facility_cleaned:'+id,true);
   await open(id);
   if(id==='agriculture'){
    assert.equal(g.NPCSystem.isMenuOpen(),false);
    assert.equal(g.FacilityLaborPanel.isOpen(),true,'cleaning alone still requires repair');
    assert.equal(g.document.querySelector('#modal-agriculture').classList.contains('show'),false);
    g.FacilityLaborPanel.close();
   }else assert.deepEqual(names(),[restore,'查看'+title],'cleaning alone does not enable management');
   g.NPCSystem.menu.close(); finish(id);
   await open(id);
   if(id==='agriculture'){
    assert.equal(g.NPCSystem.isMenuOpen(),false);
    assert.equal(g.document.querySelector('#modal-agriculture').classList.contains('show'),true,'repaired farm opens its actual panel directly');
    g.SceneApp.closeAgriculturePanel({automatic:true});
   }else{assert.deepEqual(names(),[use,'查看'+title]);g.NPCSystem.menu.close();}
  }
  assert.deepEqual(h.errors,[]);
 } finally { await h.close(); }
});
