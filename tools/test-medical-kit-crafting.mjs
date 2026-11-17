import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-game-fixture.mjs';
const itemId='tool_medical_kit_basic',recipeId='manufacturing.tool_medical_kit_basic';
const plain=x=>JSON.parse(JSON.stringify(x));
async function setup(h,level=1){
  const g=h.g,I=g.InventoryEquipment;
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  const input=g.document.getElementById('creation-name');input.value='急救包制作';input.dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();g.document.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  g.GameEngine.setState('M0_Base_Inside_lv_1',4,10);
  g.Survival.setState({stamina:100,energy:100,satiety:100,thirst:100,fatigue:0,isDead:false,isComa:false});
  const state=plain(I.getState());state.skills.life_manufacturing={level,exp:0};
  state.inventory_pocket=[];state.inventory_vest=[];state.inventory_backpack=[];
  state.equipment.backpack=g.BackpackSystem.generate('eq_backpack_light_canvas');
  state.equipment.medical_kit=null;I.setState(state);
  supply(g);
}
function supply(g){
  const I=g.InventoryEquipment;
  I.setState({...I.getState(),inventory_pocket:[{item_id:'textile_hemp_fiber',count:6}]});
}
const kits=g=>g.InventoryEquipment.getBackpackArray().filter(x=>x?.item_id===itemId);
const ticks=g=>g.WorldTick.getWorldTotalTicks();
for(const svelte of [false,true])test(`basic kit crafting ${svelte?'Svelte':'native'}: workbench menu, paid time, empty independent output and persistence`,async()=>{
  const h=await boot(svelte),g=h.g;
  try{
    await setup(h);const I=g.InventoryEquipment,A=g.MedicalActions,t=ticks(g);
    assert.equal(A.basicCraftPlan().reason,'');assert.equal(g.ManufacturingKnowledge.knows(recipeId),true);
    g.SceneCtx.actions.interactNpc('npc.station.manufacturing_base');await h.drain();
    assert.match(g.document.querySelector('#manufacturing-panel').textContent,/基础急救包/);
    assert.match(g.document.querySelector('#manufacturing-panel').textContent,/麻纤维6 \/ 3/);
    assert.equal(ticks(g),t,'viewing the recipe is free');
    g.document.getElementById('manufacturing-craft').click();await h.drain();
    assert.equal(kits(g).length,1);assert.equal(ticks(g),t+4);
    assert.equal(I.countCarriedItemsByTemplateId('textile_hemp_fiber'),3);
    g.document.getElementById('manufacturing-craft').click();await h.drain();
    const outputs=kits(g);assert.equal(outputs.length,2);assert.notEqual(outputs[0].instance_id,outputs[1].instance_id);
    for(const kit of outputs){
      const profile=g.MedicalKit.profile(kit);
      assert.ok(Object.values(profile.state.remaining).every(n=>n===0));
      assert.deepEqual(plain(profile.state.affixes),[]);assert.equal(profile.state.dressing_weight_g,0);
    }
    assert.equal(g.MedicalKit.equipped(),null,'crafting does not equip the new bag');
    assert.equal(ticks(g),t+8);
    const snap=g.SaveSystem.buildSnapshotForDebug();assert.equal(g.SaveSystem.applySnapshotForDebug(snap),true);
    assert.deepEqual(plain(kits(g).map(x=>x.instance_id)),plain(outputs.map(x=>x.instance_id)));
    assert.equal(I.auditItemOwnership().ok,true);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
test('basic kit crafting: knowledge, location, combat, materials and capacity rejection; save failure rolls back payment and time',async()=>{
  const h=await boot(false),g=h.g;
  try{
    await setup(h,0);const A=g.MedicalActions,I=g.InventoryEquipment,t=ticks(g);
    assert.match(A.basicCraftPlan().reason,/制造1级/);assert.equal(A.craftBasic().ok,false);
    const state=plain(I.getState());state.skills.life_manufacturing.level=1;I.setState(state);
    g.ManufacturingKnowledge.getState();state.skills.life_manufacturing.level=0;I.setState(state);
    assert.equal(A.basicCraftPlan().reason,'','learned knowledge survives a later skill reduction');
    g.GameEngine.setState('M0_Base_Inside_lv_1',8,15);assert.equal(A.craftBasic().ok,false);
    g.GameEngine.setState('M0_Base_Outside_lv_1',4,10);assert.equal(A.craftBasic().ok,false);
    g.GameEngine.setState('M0_Base_Inside_lv_1',4,10);
    const combat=g.CombatEngagement.isPlayerInCombat;g.CombatEngagement.isPlayerInCombat=()=>true;
    assert.equal(A.craftBasic().ok,false);g.CombatEngagement.isPlayerInCombat=combat;
    I.setState({...I.getState(),inventory_pocket:[{item_id:'textile_hemp_fiber',count:2},{item_id:'textile_cotton_cloth',count:5},{item_id:'material_nylon_stock',count:1}]});
    assert.equal(A.craftBasic().ok,false);assert.equal(ticks(g),t);supply(g);
    const before=plain(I.getState()),save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
    assert.equal(A.craftBasic().ok,false);g.SaveSystem.saveNow=save;
    assert.deepEqual(plain(I.getState()),before);assert.equal(ticks(g),t);assert.equal(kits(g).length,0);
    I.setState({...I.getState(),equipment:{...I.getState().equipment,backpack:null,vest:null},bound_vehicle_id:null});
    const full=plain(I.getState());assert.match(A.craftBasic().message,/空位/);
    assert.deepEqual(plain(I.getState()),full);assert.equal(ticks(g),t);
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
test('basic kit crafting stops after the first invalid world tick without producing a bag',async()=>{
  const h=await boot(false),g=h.g;
  try{
    await setup(h);const t=ticks(g),advance=g.Survival.advanceTick;
    g.Survival.advanceTick=function(options){const r=advance(options);g.GameEngine.setState('M0_Base_Inside_lv_1',8,15);return r;};
    const result=g.MedicalActions.craftBasic();g.Survival.advanceTick=advance;
    assert.equal(result.ok,false);assert.match(result.message,/中断/);assert.equal(kits(g).length,0);
    assert.equal(ticks(g),t+1);assert.equal(g.InventoryEquipment.countCarriedItemsByTemplateId('textile_hemp_fiber'),3);
  }finally{await h.close();}
});
