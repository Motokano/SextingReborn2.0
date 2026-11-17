import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-game-fixture.mjs';
async function setup(h){
 const g=h.g;g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
 const name=g.document.getElementById('creation-name');name.value='医疗便利验收';name.dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();g.document.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
 g.GameEngine.setState('M0_Base_Inside_lv_1',4,10);g.Survival.setState({stamina:100,energy:100,satiety:100,thirst:100,fatigue:0,isDead:false,isComa:false});
 const I=g.InventoryEquipment;I.equip('medical_kit',{item_id:'tool_medical_kit_basic',count:1});I.setState({...I.getState(),inventory_pocket:[],inventory_backpack:[],inventory_vest:[]});
 g.HideoutWarehouse.setState(g.HideoutWarehouse.createDefaultState());return g.MedicalKit.equipped().instance_id;
}
function warehouse(g,rows){g.HideoutWarehouse.setState({...g.HideoutWarehouse.createDefaultState(),slots:rows.flatMap(([id,n,locked])=>Array.from({length:n},()=>({item_id:id,count:1,warehouse_locked:!!locked})))});}
function injury(g,type,part){const id='qol_'+type;g.BuffSystem.registerRuntimeBuffTemplate({buff_id:id,name:type,injury_type:type,manualLifetime:true,maxStacks:1,stacksAddOnApply:1,effects:[]});g.BuffSystem.applyBuff('player',id,'test',{body_part:part});}
const remaining=(g,id,k)=>g.MedicalKit.profile(g.MedicalKit.find(id)).state.remaining[k];
for(const full of [false,true])test(`${full?'Svelte':'native'} treatment buttons expose only valid local treatments and existing affix alternatives`,async()=>{
 const h=await boot(full),g=h.g;try{
  const id=await setup(h),kit=g.MedicalKit.find(id),storage=kit.attribute_state.structure.medical_storage;
  storage.remaining={...g.MedicalKit.profile(kit).caps};storage.dressing_weight_g=225;
  g.CharacterAttributes.setState({part_destroy:{head:40,lhand:100,rhand:70},surgical_max_loss:{}});injury(g,'heavy_bleeding','lhand');
  g.MedicalKitPanel.openDaily();
  const disabled=k=>g.document.getElementById('supply-'+k).disabled;
  assert.equal(disabled('trauma_dressing'),true);assert.equal(disabled('hemostatic_gauze'),true);assert.equal(disabled('tourniquet'),false);assert.equal(disabled('fracture_band'),true);assert.equal(disabled('medical_alcohol'),true);assert.equal(disabled('surgical_staples'),false);
  g.document.getElementById('part-head').click();assert.equal(disabled('trauma_dressing'),false);assert.equal(disabled('tourniquet'),true);assert.equal(disabled('surgical_staples'),true);
  g.document.getElementById('part-rhand').click();injury(g,'bleeding','rhand');injury(g,'fracture','rhand');g.MedicalKitPanel.refresh();
  assert.equal(disabled('hemostatic_gauze'),false);assert.equal(disabled('fracture_band'),false);assert.equal(disabled('trauma_dressing'),true);assert.equal(disabled('tourniquet'),true);
  storage.affixes=['universal','dressing'];g.MedicalKitPanel.refresh();assert.equal(disabled('tourniquet'),false);
  g.BuffSystem.clearPartInjury('player','rhand','bleeding');g.BuffSystem.clearPartInjury('player','rhand','fracture');g.MedicalKitPanel.refresh();assert.equal(disabled('hemostatic_gauze'),false,'temporary dressing remains available without bleeding');
  storage.remaining.hemostatic_gauze=0;g.MedicalKitPanel.refresh();assert.equal(disabled('hemostatic_gauze'),true,'material shortage is not selectable');
  assert.equal(g.document.querySelectorAll('#medical-kit-panel [data-action="refillAll"]').length,1);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('hideout direct refill prefers unlocked warehouse stock, supports courtyard, and cannot remotely consume it outside',async()=>{
 const h=await boot(false),g=h.g;try{
  const id=await setup(h),A=g.MedicalActions,I=g.InventoryEquipment,W=g.HideoutWarehouse,item='supply_medical_trauma_dressing';
  warehouse(g,[[item,1,true],[item,2]]);I.setState({...I.getState(),inventory_pocket:[{item_id:item,count:1}]});
  const start=g.WorldTick.getWorldTotalTicks();assert.deepEqual(JSON.parse(JSON.stringify(A.refillStock('trauma_dressing'))),{carried:1,warehouse:2,total:3});
  assert.equal(A.refill(id,'trauma_dressing').ok,true);assert.equal(W.countItem(item),2);assert.equal(I.countCarriedItemsByTemplateId(item),1);
  g.GameEngine.setState('M0_Base_Outside_lv_1',5,5);assert.equal(A.refill(id,'trauma_dressing').ok,true);assert.equal(W.countItem(item),1);assert.equal(W.countAvailableItem(item),0);
  assert.equal(A.refill(id,'trauma_dressing').ok,true);assert.equal(I.countCarriedItemsByTemplateId(item),0);assert.equal(remaining(g,id,'trauma_dressing'),300);
  assert.equal(g.WorldTick.getWorldTotalTicks(),start+3);assert.equal(A.refillAllPlan(id).portions,0);
  warehouse(g,[['supply_medical_alcohol',1]]);g.GameEngine.setState('M0_Field_02',7,7);
  assert.equal(A.refillStock('medical_alcohol').total,0);assert.equal(A.refill(id,'medical_alcohol').ok,false);assert.equal(A.refillAll(id).ok,false);assert.equal(W.countItem('supply_medical_alcohol'),1);
  assert.equal(I.auditItemOwnership().ok,true);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('one click fills six reserves using real per-portion costs; full and unavailable rows are skipped',async()=>{
 const h=await boot(false),g=h.g;try{
  const id=await setup(h),A=g.MedicalActions,W=g.HideoutWarehouse;
  warehouse(g,Object.values(g.MedicalKitData.reserves).map(r=>[r.item_id,3]));
  g.MedicalKitPanel.openDaily();const before=g.WorldTick.getWorldTotalTicks();
  assert.equal(A.refillAllPlan(id).portions,11);
  g.document.querySelector('#medical-kit-panel [data-action="refillAll"]').click();
  assert.equal(g.WorldTick.getWorldTotalTicks(),before+11);const p=g.MedicalKit.profile(g.MedicalKit.find(id));assert.deepEqual(p.state.remaining,p.caps);
  assert.ok(Math.abs(g.MedicalKit.contentsWeight(g.MedicalKit.find(id))-.662)<1e-8);
  assert.equal(W.countItem('supply_medical_alcohol'),2);assert.equal(W.countItem('supply_medical_trauma_dressing'),0);
  assert.equal(g.document.querySelector('#medical-kit-panel [data-action="refillAll"]').disabled,true);
  assert.equal(A.refillAll(id).ok,false);assert.equal(g.WorldTick.getWorldTotalTicks(),before+11);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('bulk refill saves each portion, rolls back a failed portion and rechecks location before taking more',async()=>{
 const h=await boot(false),g=h.g;try{
  const id=await setup(h),A=g.MedicalActions,W=g.HideoutWarehouse,item='supply_medical_trauma_dressing';warehouse(g,[[item,3],['supply_medical_alcohol',1]]);
  const save=g.SaveSystem.saveNow,start=g.WorldTick.getWorldTotalTicks();let saves=0;
  g.SaveSystem.saveNow=(...args)=>++saves===2?false:save(...args);
  const first=A.refillAll(id);assert.equal(first.ok,false);assert.equal(first.filled,1);assert.equal(remaining(g,id,'trauma_dressing'),100);assert.equal(W.countItem(item),2);assert.equal(g.WorldTick.getWorldTotalTicks(),start+1);
  g.SaveSystem.saveNow=save;const tick=g.Survival.advanceTick;
  g.Survival.advanceTick=(...args)=>{const r=tick(...args);g.GameEngine.setState('M0_Field_02',7,7);return r;};
  const stopped=A.refillAll(id);assert.equal(stopped.ok,false);assert.equal(stopped.filled,1);assert.equal(W.countItem(item),1);assert.equal(W.countItem('supply_medical_alcohol'),1);assert.equal(remaining(g,id,'trauma_dressing'),200);
  g.Survival.advanceTick=tick;assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
