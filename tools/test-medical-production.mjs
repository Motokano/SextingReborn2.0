import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot} from './ui-game-fixture.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const ticks=g=>g.WorldTick.getWorldTotalTicks();
async function setup(h){
  const g=h.g;g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  assert.equal(g.SceneApp.creation.confirm({name:'医疗生产',height:178,gender:'male',hand:'right',leg:'right'}),true);await h.drain();g.DialogueUI.close();
  g.GameEngine.setState('M0_Base_Inside_lv_1',4,10);g.Survival.setState({stamina:100,energy:100,satiety:100,thirst:100,fatigue:0,isDead:false,isComa:false});
  const I=g.InventoryEquipment,s=copy(I.getState());s.skills.life_manufacturing={level:1,exp:0};s.skills.life_weaving={level:1,exp:0};
  s.inventory_pocket=[];s.inventory_vest=[];s.inventory_backpack=[];s.equipment.backpack=g.BackpackSystem.generate('eq_backpack_light_canvas');s.equipment.medical_kit=null;I.setState(s);
}
function stock(g,rows){const I=g.InventoryEquipment;I.setState({...I.getState(),inventory_pocket:[],inventory_vest:[],inventory_backpack:rows.map(x=>({item_id:x[0],count:x[1]}))});}
function supply(g,r){stock(g,[...r.inputs.map(x=>Array.isArray(x)?x:[x.item_id,x.count]),...(r.required_tools||[]).map(x=>[typeof x==='string'?x:x.item_id,1])]);}
function finish(g){const M=g.ManufacturingActions;let n=0;while(M.getState().job?.phase==='work'&&n++<100){const r=M.step();assert.equal(r.ok,true,JSON.stringify(r));}assert.equal(M.getState().job,null);}
for(const svelte of [false,true])test(`medical production ${svelte?'Svelte':'native'}: shared tabs, all five workshop recipes, permanent knowledge and saved output`,async()=>{
 const h=await boot(svelte),g=h.g;try{
  await setup(h);const M=g.ManufacturingActions,I=g.InventoryEquipment,d=g.document;
  g.SceneCtx.actions.interactNpc('npc.station.manufacturing_base');await h.drain();
  assert.ok(d.querySelector('#manufacturing-panel'));assert.equal(d.querySelector('#npc-menu')?.style.display==='none'||!g.NPCSystem.menu.isOpen?.(),true);
  d.getElementById('manufacturing-tab-medical').click();assert.match(d.querySelector('#manufacturing-content').textContent,/没有随身急救包/);
  assert.equal(d.querySelector('#manufacturing-content .reserve'),null);d.getElementById('manufacturing-tab-facilities').click();assert.match(d.querySelector('#manufacturing-content').textContent,/金工工位/);
  g.ManufacturingPanel.close();M.restore({version:1,level:3,facilities:['bench','metal','kiln','precision'],job:null,lastResult:null});
  for(const r of g.ManufacturingData.recipes.filter(r=>r.recipe_id.startsWith('manufacturing.medical_')&&r.station!=='pharmacy')){
   supply(g,r);assert.match(M.plan('recipe',r.recipe_id).reason,/尚未掌握/);g.ManufacturingKnowledge.grant(r.recipe_id);assert.equal(M.plan('recipe',r.recipe_id).reason,'');
   const t=ticks(g);g.Math.random=()=>0;assert.equal(M.start('recipe',r.recipe_id).ok,true);assert.equal(M.start('recipe',r.recipe_id).ok,false);finish(g);
   assert.equal(ticks(g),t+r.ticks);assert.equal(I.countCarriedItemsByTemplateId(r.item_id),r.output_count);
   const outputs=I.getBackpackArray().filter(x=>x?.item_id===r.item_id);assert.equal(outputs.length,r.output_count);assert.ok(outputs.every(x=>x.count===1));assert.equal(new Set(outputs.map(x=>x.instance_id)).size,r.output_count);
   assert.equal(Number(I.getItemTemplate(r.item_id).spoilage_ticks)||0,0);g.Survival.setState({stamina:100});
  }
  const snap=copy(g.SaveSystem.buildSnapshotForDebug());assert.equal(g.SaveSystem.applySnapshotForDebug(snap),true);assert.equal(M.getState().level,3);assert.equal(g.ManufacturingKnowledge.knows('manufacturing.medical_stapler'),true);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
test('workshop payments: upgrades, tool locks, pause/reload, save rollback and pending output',async()=>{
 const h=await boot(false),g=h.g;try{
  await setup(h);const M=g.ManufacturingActions,I=g.InventoryEquipment;
  const make=(type,id)=>{const p=M.plan(type,id);supply(g,p);g.Survival.setState({stamina:100});assert.equal(M.start(type,id).ok,true,JSON.stringify(M.plan(type,id)));finish(g);};
  make('facility','metal');assert.ok(M.getState().facilities.includes('metal'));
  make('upgrade','manufacturing.bench_1_to_2');assert.equal(M.getState().level,2);assert.equal(M.start('upgrade','manufacturing.bench_1_to_2').ok,false);
  make('facility','precision');make('upgrade','manufacturing.bench_2_to_3');assert.equal(M.getState().level,3);
  const r=g.ManufacturingData.recipes.find(r=>r.recipe_id==='manufacturing.medical_gauze');g.ManufacturingKnowledge.grant(r.recipe_id);supply(g,r);g.Survival.setState({stamina:100});
  const save=g.SaveSystem.saveNow,t=ticks(g),before=copy(I.getState());g.SaveSystem.saveNow=()=>false;assert.equal(M.start('recipe',r.recipe_id).ok,false);assert.equal(M.getState().job,null);assert.deepEqual(copy(I.getState()),before);g.SaveSystem.saveNow=save;
  g.Math.random=()=>0;assert.equal(M.start('recipe',r.recipe_id).ok,true);const tool=M.getState().job.tools[0];assert.equal(M.isInstanceLocked(tool.id),true);
  assert.equal(I.countCarriedItemsByTemplateId('textile_cotton_cloth'),0);assert.equal(M.step().ok,true);assert.equal(ticks(g),t+1);M.pause();
  const snap=copy(g.SaveSystem.buildSnapshotForDebug());assert.equal(g.SaveSystem.applySnapshotForDebug(snap),true);assert.equal(M.getState().job.elapsed,1);assert.equal(M.getState().job.paused,true);assert.equal(M.resume().ok,true);
  const invalid=copy(snap);invalid.manufacturing_workshop.job.ticks=1;assert.equal(g.SaveSystem.applySnapshotForDebug(invalid),false);
  g.SaveSystem.saveNow=()=>false;const progress=copy(M.getState());assert.equal(M.step().ok,false);assert.deepEqual(copy(M.getState()),progress);assert.equal(ticks(g),t+1);g.SaveSystem.saveNow=save;
  assert.equal(M.resume().ok,true);finish(g);assert.equal(ticks(g),t+r.ticks);assert.equal(I.countCarriedItemsByTemplateId(r.item_id),4);assert.equal(M.isInstanceLocked(tool.id),false);
  supply(g,r);assert.equal(M.start('recipe',r.recipe_id).ok,true);M.step();const used=ticks(g);assert.equal(M.cancel().ok,true);assert.equal(ticks(g),used);assert.equal(I.countCarriedItemsByTemplateId(r.item_id),0);assert.equal(I.countCarriedItemsByTemplateId('textile_cotton_cloth'),0);
  supply(g,r);assert.equal(M.start('recipe',r.recipe_id).ok,true);for(let i=0;i<r.ticks-1;i++)assert.equal(M.step().ok,true);
  const put=I.putItemIntoDefaultContainer;I.putItemIntoDefaultContainer=()=>({placed:false});assert.equal(M.step().ok,false);assert.equal(M.getState().job.phase,'claim');assert.equal(I.countCarriedItemsByTemplateId(r.item_id),0);I.putItemIntoDefaultContainer=put;
  assert.equal(M.claim().ok,true);assert.equal(I.countCarriedItemsByTemplateId(r.item_id),4);assert.equal(M.claim().ok,false);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
test('production prerequisites: six borrowed tools and two processing routes actually produce their batches',async()=>{
 const h=await boot(false),g=h.g;try{
  await setup(h);const M=g.ManufacturingActions,I=g.InventoryEquipment;M.restore({version:1,level:3,facilities:['bench','metal','kiln','precision'],job:null,lastResult:null});
  assert.equal(M.start('facility','simple').ok,false);assert.equal(M.start('upgrade','bad').ok,false);
  for(const r of g.ManufacturingData.recipes.filter(r=>!r.recipe_id.startsWith('manufacturing.medical_'))){
   g.ManufacturingKnowledge.grant(r.recipe_id);supply(g,r);g.Survival.setState({stamina:100,satiety:100,thirst:100});const t=ticks(g);g.Math.random=()=>0;
   assert.equal(M.start('recipe',r.recipe_id).ok,true,JSON.stringify(M.plan('recipe',r.recipe_id)));assert.equal(M.pause().ok,true);assert.equal(M.step().ok,false);assert.equal(ticks(g),t);assert.equal(M.resume().ok,true);finish(g);
   assert.equal(ticks(g),t+r.ticks);assert.equal(I.countCarriedItemsByTemplateId(r.item_id),r.output_count,r.recipe_id);
   for(const tool of r.required_tools||[])assert.equal(I.countCarriedItemsByTemplateId(tool),1,'borrowed tool survives');
  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
test('medical alcohol: both installed devices, learned recipe, paid 48 ticks, six bottles and rollback',async()=>{
 const h=await boot(false),g=h.g;try{
  await setup(h);const P=g.PharmacyStation,I=g.InventoryEquipment,id='life_pharmacy.medical_alcohol',r=P.getRecipes().find(x=>x.recipe_id===id);assert.ok(r);
  g.GameEngine.setState('M0_Base_Inside_lv_1',13,14);g.NPCSystem.setDemoFlag('npc_station_pharmacy_base_repaired',true);
  stock(g,[['herb_rice',4],['solvent_water_pure',4]]);const ctx=g.StationContext.getCurrentPharmacyStationContext();assert.ok(ctx);
  P.getState().installed_accessory_item_ids=['tool_distiller_pharmacy'];assert.equal(P.isPharmacyMethodUnlockedAtStation(id,ctx),false);g.ManufacturingKnowledge.grant('manufacturing.medical_alcohol');assert.equal(P.isPharmacyMethodUnlockedAtStation(id,ctx),false);
  P.getState().installed_accessory_item_ids.push('tool_fermentation_jar_cooking');assert.equal(P.isPharmacyMethodUnlockedAtStation(id,ctx),true);assert.ok(g.StationActions.getKnownPharmacyRecipeIds().includes(id));assert.equal(g.StationCraftCore.isItemAllowedPharmacyIngredient('herb_rice'),true);
  g.Math.random=()=>0;const save=g.SaveSystem.saveNow,t=ticks(g);g.SaveSystem.saveNow=()=>false;assert.equal(g.StationActions.tryPharmacyAtStation(id,r.inputs).ok,false);assert.equal(P.getActiveCraft(),null);assert.equal(I.countCarriedItemsByTemplateId('herb_rice'),4);g.SaveSystem.saveNow=save;
  assert.equal(g.StationActions.tryPharmacyAtStation(id,r.inputs).ok,true);g.StationActions.stopPharmacyCraftIdle();assert.equal(P.getActiveCraft().remaining_ticks,48);assert.equal(P.isAccessoryInUse('tool_fermentation_jar_cooking'),true);
  for(let i=0;i<47;i++)g.Survival.advanceTick({source:'wait'});assert.equal(P.getActiveCraft().remaining_ticks,1);assert.equal(I.countCarriedItemsByTemplateId(r.main_output.item_id),0);
  g.SaveSystem.saveNow=()=>false;g.Survival.advanceTick({source:'wait'});assert.equal(P.getActiveCraft().remaining_ticks,1);assert.equal(ticks(g),t+47);assert.equal(I.countCarriedItemsByTemplateId(r.main_output.item_id),0);g.SaveSystem.saveNow=save;
  const snap=copy(g.SaveSystem.buildSnapshotForDebug());assert.equal(g.SaveSystem.applySnapshotForDebug(snap),true);g.StationActions.stopPharmacyCraftIdle();g.Math.random=()=>.99999;g.Survival.advanceTick({source:'wait'});
  assert.equal(ticks(g),t+48);assert.equal(P.getActiveCraft(),null);assert.equal(I.countCarriedItemsByTemplateId(r.main_output.item_id),6);assert.equal(I.countCarriedItemsByTemplateId('herb_rice'),2);assert.equal(P.isAccessoryInUse('tool_fermentation_jar_cooking'),false);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
test('renewable production inputs: cotton/hemp regrow, repaired bathroom fills soft water atomically',async()=>{
 const h=await boot(false),g=h.g;try{
  await setup(h);const def=JSON.parse(fs.readFileSync('data/npc/npc_station_bathroom_base.json','utf8'));g.GameEngine.setState(def.location.sceneId,13,14);
  assert.match(g.BathroomFacility.reason(def,'bottle'),/修好/);g.NPCSystem.setDemoFlag('bathroom_station_unlocked',true);let t=ticks(g);assert.equal(g.BathroomFacility.use(def,'bottle').ok,true);assert.equal(ticks(g),t+1);assert.equal(g.InventoryEquipment.countCarriedItemsByTemplateId('ore_water_pure_soft'),1);
  const save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;assert.equal(g.BathroomFacility.use(def,'bottle').ok,false);g.SaveSystem.saveNow=save;assert.equal(ticks(g),t+1);assert.equal(g.InventoryEquipment.countCarriedItemsByTemplateId('ore_water_pure_soft'),1);
  for(const id of ['gp_sewing_cotton','gp_sewing_hemp']){
   const p=g.GameEngine.getState(),key=p.mapId+':'+p.x+':'+p.y+':'+id;g.NPCSystem.setDemoFlag('sewing_gathering_uses',{[key]:3});g.NPCSystem.setDemoFlag('sewing_gathering_exhausted',{});
   assert.equal(g.Gathering.canGather('gathering_grass',id),false);assert.equal(g.Gathering.canGather('gathering_grass',id),false);const gt=copy(g.GameTime.getState());g.GameTime.advanceTicks(143);assert.equal(g.Gathering.canGather('gathering_grass',id),false);g.GameTime.advanceTicks(1);assert.equal(g.Gathering.canGather('gathering_grass',id),true);
  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
