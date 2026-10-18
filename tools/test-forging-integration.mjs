import assert from 'node:assert/strict';
import {boot} from './ui-game-fixture.mjs';
const h=await boot(true),g=h.g,doc=g.document;
g.Element.prototype.animate=function(){return {cancel(){},finished:Promise.resolve()};};
try{
 const S=g.ForgingSystem,I=g.InventoryEquipment;
 assert(I.getItemTemplate('material_forging_iron'),'main config registers formal items');
 assert.equal(g.GameEngine.getMap().npcs.find(n=>n.npc_id==='npc.station.forging_base').x,5);
 // Real test bag from configuration, no additions to production loot or starter items.
 const ids=Object.keys(g.ForgingConfig.catalog.items);assert.equal(ids.length,112);
 g.GameEngine.setState('M0_Base_Inside_lv_1',5,12);
 assert.equal(g.ForgingStationPanel.open(),false,'station is initially locked');
 g.NPCSystem.setDemoFlag('forging_station_unlocked',true);
 I.getSkillsState().life_forging={level:25,move_usage:{}};I.getSkillsState().survival_language={level:4,move_usage:{}};
 const inv=I.getState();inv.inventory_backpack=[];inv.inventory_pocket=[];
 // Keep the initial game's real bag and put samples in an available inventory root.
 inv.inventory_pocket.push({item_id:'ore_iron_raw',count:1});I.setState(inv);
 assert(S.canAccess());await g.NPCSystem.openMenu('npc.station.forging_base');await h.drain();
 const enter=[...doc.querySelectorAll('button')].find(b=>b.textContent==='使用铸造台');assert(enter&&!enter.disabled,'real NPC menu exposes the unlocked station');enter.click();await h.drain();
 assert(!g.NPCSystem.isMenuOpen());assert(g.ForgingStationPanel.isOpen());
 assert(doc.querySelector('#forging-station-panel'));
 const raw=S.snapshot().items.find(x=>x.item_id==='ore_iron_raw');assert(raw);
 assert.equal(S.identified('ore_iron_raw'),false);
 doc.querySelector('[data-action="inspect"]').click();assert(S.state().knowledge.routes.ore_iron_raw);assert(!S.identified('ore_iron_raw'));
 doc.querySelector('[data-action="identify"]').click();assert(S.identified('ore_iron_raw'));
 assert(doc.querySelector('#forge-content').textContent.includes('铁质矿石')||doc.querySelector('#forge-content').textContent.includes('铁矿'));
 doc.querySelector('[data-action="process"]').click();g.ForgingStationPanel.stopTimer();
 assert(S.state().job);assert(S.step().ok);assert(S.step().ok);
 assert.equal(I.countCarriedItemsByTemplateId('material_forging_iron'),1);
 const k=S.state();k.knowledge.structures.B01=true;k.knowledge.identity.weapon_component_b01=true;g.NPCSystem.setDemoFlag('forging_runtime_v1',k);
 for(let i=0;i<5;i++)assert(g.HideoutWarehouse.depositFromInstance(I.ensureItemInstanceIdentity({item_id:'material_forging_iron',count:1})).ok);
 assert.equal(g.HideoutWarehouse.countItemEverywhere('material_forging_iron'),6);
 g.ForgingStationPanel.render();doc.querySelector('[data-tab="patterns"]').click();
 const input=doc.querySelector('[data-feed="material_forging_iron"]');assert(input);input.value='6';input.dispatchEvent(new g.Event('change',{bubbles:true}));
 assert(S.quote({type:'craft',partId:'weapon_component_b01',recipe:{material_forging_iron:6}}).ok,'craft quote valid');
 const pay=g.HideoutWarehouse.consumeItems;g.HideoutWarehouse.consumeItems=(...args)=>{const result=pay(...args);assert(result.ok,JSON.stringify(result));return result;};
 doc.querySelector('[data-action="craft"]').click();g.ForgingStationPanel.stopTimer();assert(S.state().job,doc.querySelector('#forge-status').textContent);assert.equal(S.state().job.type,'craft');
 for(let i=0;i<12;i++)assert(S.step().ok);g.ForgingStationPanel.render();assert.equal(doc.querySelectorAll('#forge-board .cell').length,21);
 const ticks=g.GameTime.getState().totalTicks,hammer=S.state().job.board.left.h;
 const pickup=S.state().job.board.specials[0];doc.querySelector('[data-cell="'+pickup.index+'"]').click();assert.equal(S.state().job.board.left.h,hammer-1);assert.equal(S.state().job.board.stored[pickup.type],1,'special cell click strikes and collects, never toggles an unowned effect');assert.equal(g.GameTime.getState().totalTicks,ticks,'board actions do not charge world ticks');
 const board=JSON.stringify(S.state().job.board),snapshot=g.SaveSystem.buildSnapshotForDebug();assert(snapshot.player.npcDemo);
 g.ForgingStationPanel.close();assert(g.SaveSystem.applySnapshotForDebug(snapshot));assert.equal(JSON.stringify(S.state().job.board),board);
 assert(g.ForgingStationPanel.open());doc.querySelector('[data-action="finish"]').click();assert.equal(S.state().job,null);assert(S.state().lastResult);
 assert(I.auditItemOwnership().ok);assert.deepEqual(h.errors,[]);
 console.log('PASS main-game forging: registered catalog/map, real panel click path, paid world ticks, shared board, SaveSystem roundtrip and ownership.');
}finally{g.ForgingStationPanel.close();await h.close();}
