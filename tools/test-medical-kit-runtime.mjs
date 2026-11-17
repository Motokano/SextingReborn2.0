import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-game-fixture.mjs';
async function setup(h,kind='basic') {
  const g=h.g;
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  const input=g.document.getElementById('creation-name');input.value='医疗验收';input.dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();g.document.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  g.GameEngine.setState('M0_Base_Inside_lv_1',4,10);
  g.Survival.setState({stamina:100,energy:100,satiety:100,thirst:100,fatigue:0,isDead:false,isComa:false});
  const IE=g.InventoryEquipment;
  assert.equal(IE.equip('medical_kit',{item_id:'tool_medical_kit_'+kind,count:1}).success,true);
  return g.MedicalKit.equipped().instance_id;
}
function stock(g,id,count=1){const IE=g.InventoryEquipment;IE.setState({...IE.getState(),inventory_pocket:Array.from({length:count},()=>({item_id:id,count:1}))});}
function damage(g,values){g.CharacterAttributes.setState({part_destroy:{head:0,chest:0,abdomen:0,lhand:0,rhand:0,lfoot:0,rfoot:0,...values},surgical_max_loss:{}});}
const left=(g,id,key)=>g.MedicalKit.profile(g.MedicalKit.find(id)).state.remaining[key];
for(const svelte of [false,true])test(`medical equipment ${svelte?'Svelte':'native'}: transfer identity, contents, time and failed saves`,async()=>{
  const h=await boot(svelte),g=h.g;
  try{
    const id=await setup(h),I=g.InventoryEquipment,A=g.MedicalActions;
    I.equip('backpack',g.BackpackSystem.generate('eq_backpack_light_canvas'));
    stock(g,'supply_skin_stapler');A.refill(id,'surgical_staples');
    const tick=g.WorldTick.getWorldTotalTicks();
    assert.equal(A.transfer({action:'unequip',id}).ok,true);
    assert.equal(g.MedicalKit.equipped(),null);assert.equal(left(g,id,'surgical_staples'),35);
    assert.equal(g.WorldTick.getWorldTotalTicks(),tick+1);
    const index=I.getBackpackArray().findIndex(v=>v?.instance_id===id);assert.ok(index>=0);
    const save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
    assert.equal(A.transfer({action:'equip',source:'backpack',index,id}).ok,false);
    assert.equal(g.MedicalKit.equipped(),null);assert.equal(left(g,id,'surgical_staples'),35);
    assert.equal(g.WorldTick.getWorldTotalTicks(),tick+1);g.SaveSystem.saveNow=save;
    assert.equal(A.transfer({action:'equip',source:'backpack',index,id}).ok,true);
    assert.equal(g.MedicalKit.equipped().instance_id,id);assert.equal(left(g,id,'surgical_staples'),35);
    assert.equal(I.auditItemOwnership().ok,true);
    g.SceneApp.openBackpackPanel();await h.drain();
    assert.match(g.document.querySelector('#modal-backpack').textContent,/急救包/);
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('metered surgery, universal haemostasis and temporary dressing retain their distinct costs',async()=>{
  const h=await boot(false),g=h.g;
  try{
    const id=await setup(h,'metered'),A=g.MedicalActions,K=g.MedicalKit;
    for(const item of ['supply_skin_stapler','supply_medical_tourniquet','supply_medical_hemostatic_gauze']){stock(g,item);assert.equal(A.refill(id,Object.keys(g.MedicalKitData.reserves).find(k=>g.MedicalKitData.reserves[k].item_id===item)).ok,true);}
    K.find(id).attribute_state.structure.medical_storage.affixes=['universal','dressing'];
    damage(g,{lhand:70,lfoot:100});injury(g,'bleeding','lhand');
    assert.equal(A.treat(id,'lhand','tourniquet','normal').ok,true);assert.equal(left(g,id,'tourniquet'),110);
    assert.equal(A.treat(id,'lhand','hemostatic_gauze','normal').ok,true);assert.equal(left(g,id,'hemostatic_gauze'),175);assert.equal(K.body('lhand').damage,30);
    assert.equal(A.therapyPlan(id,'lfoot','surgical_staples','normal').costs.surgical_staples,12);
    damage(g,{lhand:100});assert.equal(A.therapyPlan(id,'lhand','surgical_staples','normal').costs.surgical_staples,8);
    const skill=g.InventoryEquipment.getSkillLevel;
    for(const [level,expected] of [[0,50],[50,75],[100,100]]){g.InventoryEquipment.getSkillLevel=id=>id==='survival_surgery'?level:skill(id);assert.equal(A.therapyPlan(id,'lhand','surgical_staples','normal').afterMax,expected);}
    g.InventoryEquipment.getSkillLevel=skill;
    assert.equal(A.treat(id,'lhand','surgical_staples','normal').ok,true);
    for(let i=0;i<5;i++)A.advance();
    const save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
    assert.equal(A.advance().ok,false);assert.equal(A.getState().elapsed,5);assert.equal(K.body('lhand').max,100);assert.equal(left(g,id,'surgical_staples'),27);
    g.SaveSystem.saveNow=save;assert.equal(A.advance().ok,true);assert.equal(K.body('lhand').max,50);assert.equal(left(g,id,'surgical_staples'),27);
  }finally{await h.close();}
});
function injury(g,type,part){const id='medical_test_'+type;g.BuffSystem.registerRuntimeBuffTemplate({buff_id:id,display_name:type,injury_type:type,manualLifetime:true,maxStacks:1,stacksAddOnApply:1,effects:[]});assert.equal(g.BuffSystem.applyBuff('player',id,'test',{body_part:part}),true);}
test('standalone medical items use the formal item action and consume one whole portion only on a valid target',async()=>{
  const h=await boot(false),g=h.g;
  try{
    await setup(h);
    for(const [item,type,part] of [['tourniquet','heavy_bleeding','lhand'],['hemostatic_gauze','bleeding','chest'],['fracture_band','fracture','lfoot'],['alcohol','wound_infection','belly']]){
      stock(g,'supply_medical_'+item);damage(g,{[part==='belly'?'abdomen':part]:70});injury(g,type,part);
      const tick=g.WorldTick.getWorldTotalTicks();
      assert.equal(g.ItemUseActions.tryUseItemFromContainer('pocket',0,{part_id:'rhand'}),false);
      assert.equal(g.WorldTick.getWorldTotalTicks(),tick);
      assert.equal(g.ItemUseActions.tryUseItemFromContainer('pocket',0,{part_id:part}),true);
      assert.equal(g.WorldTick.getWorldTotalTicks(),tick+1);assert.equal(g.BuffSystem.getPartInjuries('player',part).length,0);
      assert.equal(g.InventoryEquipment.countCarriedItemsByTemplateId('supply_medical_'+item),0);assert.equal(g.CharacterAttributes.getPartDestroy(part),70);
    }
    stock(g,'supply_medical_trauma_dressing');damage(g,{lhand:40});
    assert.equal(g.ItemUseActions.tryUseItemFromContainer('pocket',0,{part_id:'lhand'}),true);
    assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),30);assert.equal(g.InventoryEquipment.countCarriedItemsByTemplateId('supply_medical_trauma_dressing'),0);
    stock(g,'supply_medical_trauma_dressing');damage(g,{lhand:100});
    assert.equal(g.ItemUseActions.tryUseItemFromContainer('pocket',0,{part_id:'lhand'}),false);
    assert.equal(g.InventoryEquipment.countCarriedItemsByTemplateId('supply_medical_trauma_dressing'),1);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
for(const svelte of [false,true])test(`medical integration ${svelte?'Svelte':'native'}: real stock, display, recovery and save rollback`,async()=>{
  const h=await boot(svelte),g=h.g;
  try{
    const id=await setup(h);stock(g,'supply_medical_trauma_dressing');damage(g,{lhand:70});
    assert.equal(g.MedicalKitPanel.openDaily(),true);
    assert.equal(g.document.querySelectorAll('#medical-kit-panel [data-action="refill"]').length,6);
    assert.equal(g.document.querySelector('#medical-kit-panel .equipment'),null);
    assert.equal(g.document.querySelector('#medical-kit-panel [data-reserve="trauma_dressing"] button').textContent.includes('补充'),true);
    const before=g.WorldTick.getWorldTotalTicks();
    assert.equal(g.MedicalActions.refill(id,'trauma_dressing').ok,true);
    assert.equal(left(g,id,'trauma_dressing'),100);
    assert.equal(g.InventoryEquipment.countCarriedItemsByTemplateId('supply_medical_trauma_dressing'),0);
    assert.equal(g.WorldTick.getWorldTotalTicks(),before+1);
    assert.equal(g.MedicalActions.treat(id,'lhand','trauma_dressing','normal').ok,true);
    assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),30);assert.equal(left(g,id,'trauma_dressing'),60);
    const save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
    damage(g,{lhand:50});const tick=g.WorldTick.getWorldTotalTicks();
    assert.equal(g.MedicalActions.treat(id,'lhand','trauma_dressing','normal').ok,false);
    assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),50);assert.equal(left(g,id,'trauma_dressing'),60);assert.equal(g.WorldTick.getWorldTotalTicks(),tick);
    g.SaveSystem.saveNow=save;
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
test('injuries are local and mutually exclusive; fixed bandaging and linked treatment use real records',async()=>{
  const h=await boot(false),g=h.g;
  try{
    const id=await setup(h,'linked'),IE=g.InventoryEquipment;
    stock(g,'supply_medical_fracture_band');g.MedicalActions.refill(id,'fracture_band');
    stock(g,'supply_medical_trauma_dressing');g.MedicalActions.refill(id,'trauma_dressing');damage(g,{lhand:70,rhand:70});
    const inst=g.MedicalKit.find(id);inst.attribute_state.structure.medical_storage.affixes=['fixed'];
    injury(g,'bleeding','lhand');injury(g,'heavy_bleeding','lhand');injury(g,'bleeding','rhand');
    assert.equal(g.BuffSystem.getPartInjuries('player','lhand').length,1);
    assert.equal(g.BuffSystem.applyBuff('player','medical_test_bleeding','test',{body_part:'lhand'}),false);
    assert.equal(g.BuffSystem.getPartInjuries('player','lhand')[0].type,'heavy_bleeding');
    g.BuffSystem.clearPartInjury('player','lhand','heavy_bleeding');
    injury(g,'bleeding','lhand');injury(g,'fracture','lhand');
    const before=g.WorldTick.getWorldTotalTicks();
    assert.equal(g.MedicalActions.treat(id,'lhand','fracture_band','linked').ok,true);
    assert.equal(g.WorldTick.getWorldTotalTicks(),before+1);assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),30);
    assert.equal(g.BuffSystem.getPartInjuries('player','lhand').length,0);assert.equal(g.BuffSystem.getPartInjuries('player','rhand').length,1);
    assert.equal(left(g,id,'fracture_band'),300);assert.equal(left(g,id,'trauma_dressing'),60);
    // A new injury in the linked surgery interval suppresses only its dressing stage.
    stock(g,'supply_skin_stapler');g.MedicalActions.refill(id,'surgical_staples');damage(g,{lhand:100});
    injury(g,'fracture','lhand');
    assert.equal(g.MedicalActions.treat(id,'lhand','surgical_staples','linked').ok,true);
    injury(g,'wound_infection','lhand');for(let i=0;i<6;i++)g.MedicalActions.advance();
    assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),49);assert.equal(left(g,id,'trauma_dressing'),60);
    const snap=g.SaveSystem.buildSnapshotForDebug();g.SaveSystem.applySnapshotForDebug(snap);
    assert.equal(g.BuffSystem.getPartInjuries('player','lhand').some(v=>v.type==='wound_infection'),true);
    assert.equal(g.BuffSystem.getPartInjuries('player','lhand').some(v=>v.type==='fracture'),true);
  }finally{await h.close();}
});
test('surgery ignores injuries, keeps them, and repeated current-maximum loss rounds down to one',async()=>{
  const h=await boot(false),g=h.g;
  try{
    const id=await setup(h);stock(g,'supply_skin_stapler',2);g.MedicalActions.refill(id,'surgical_staples');g.MedicalActions.refill(id,'surgical_staples');
    injury(g,'heavy_bleeding','lhand');injury(g,'fracture','lhand');injury(g,'wound_infection','lhand');
    for(const expected of [50,25,12,6,3,1,1]){
      g.Survival.setState({stamina:100,energy:100,satiety:100,thirst:100});
      g.CharacterAttributes.setState({part_destroy:{lhand:g.CharacterAttributes.getBodyPartDestroyMax('lhand')}});
      assert.equal(g.MedicalActions.treat(id,'lhand','surgical_staples','normal').ok,true);
      for(let i=0;i<6;i++)assert.equal(g.MedicalActions.advance().ok,true);
      assert.equal(g.CharacterAttributes.getBodyPartDestroyMax('lhand'),expected);assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),expected-1);
      assert.equal(g.BuffSystem.getPartInjuries('player','lhand').length,3);
    }
    // Existing damage owner still accepts the next damage event; surgery grants no immunity.
    g.CharacterAttributes.applyCombatDestroy('left_arm',1);assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),1);
  }finally{await h.close();}
});
test('quick combat use keeps ordinary time and costs; other bodies and all combat refills reject',async()=>{
  const h=await boot(false),g=h.g;
  try{
    const id=await setup(h,'quick');stock(g,'supply_medical_trauma_dressing');g.MedicalActions.refill(id,'trauma_dressing');
    assert.equal(left(g,id,'trauma_dressing'),50);assert.equal(g.MedicalKit.profile(g.MedicalKit.find(id)).caps.surgical_staples,35);
    damage(g,{lhand:70});
    g.CombatEngagement.engageEnemy({mapId:g.GameEngine.getState().mapId,index:0,enemyId:'test',record:{},silent:true});
    assert.equal(g.MedicalActions.refill(id,'trauma_dressing').ok,false);
    const before=g.WorldTick.getWorldTotalTicks();assert.equal(g.MedicalActions.treat(id,'lhand','trauma_dressing','normal').ok,true);
    assert.equal(g.WorldTick.getWorldTotalTicks(),before+1);assert.equal(left(g,id,'trauma_dressing'),10);
    g.MedicalKit.find(id).item_id='tool_medical_kit_basic';damage(g,{lhand:70});
    g.CombatEngagement.engageEnemy({mapId:g.GameEngine.getState().mapId,index:0,enemyId:'test',record:{},silent:true});
    assert.equal(g.MedicalActions.treat(id,'lhand','trauma_dressing','normal').ok,false);
  }finally{await h.close();}
});
test('rest alone restores eligible local damage; ordinary actions, 35% boundary and full-damage drugs cannot bypass surgery',async()=>{
  const h=await boot(false),g=h.g;
  try{
    await setup(h);damage(g,{lhand:34,rhand:35,lfoot:100,rfoot:20});injury(g,'fracture','rfoot');
    const C=g.CharacterAttributes;
    for(let i=0;i<20;i++)C.onWorldTickDestroyRecover();assert.equal(C.getPartDestroy('lhand'),34);
    g.Survival.setResting(true);C.setState({destroy_recover_block_ticks:40});
    for(let i=0;i<20;i++)C.onWorldTickDestroyRecover();
    assert.ok(C.getPartDestroy('lhand')<34);assert.equal(C.getPartDestroy('rhand'),35);assert.equal(C.getPartDestroy('rfoot'),20);
    assert.equal(C.recoverPartDestroy('lfoot',100),0);assert.equal(C.getPartDestroy('lfoot'),100);
  }finally{await h.close();}
});
test('workbench conversions preserve instance/contents/mass; quick overflow and stale target reject free',async()=>{
  const h=await boot(false),g=h.g;
  try{
    const id=await setup(h),IE=g.InventoryEquipment;
    stock(g,'supply_medical_trauma_dressing',2);g.MedicalActions.refill(id,'trauma_dressing');g.MedicalActions.refill(id,'trauma_dressing');
    const tick=g.WorldTick.getWorldTotalTicks();assert.equal(g.MedicalActions.modify(id,'quick').message,'储量超出上限');assert.equal(g.WorldTick.getWorldTotalTicks(),tick);
    IE.setState({...IE.getState(),inventory_pocket:[{item_id:'textile_cotton_cloth',count:2},{item_id:'material_nylon_stock',count:1}]});
    const mass=g.MedicalKit.contentsWeight(g.MedicalKit.find(id));
    assert.equal(g.MedicalActions.modify(id,'expand').ok,true);assert.equal(g.MedicalKit.find(id).item_id,'tool_medical_kit_expanded');
    assert.equal(left(g,id,'trauma_dressing'),200);assert.equal(g.MedicalKit.contentsWeight(g.MedicalKit.find(id)),mass);
    assert.equal(g.WorldTick.getWorldTotalTicks(),tick+4);assert.equal(g.MedicalActions.modify(id,'linked').ok,false);
    assert.equal(g.MedicalActions.modify('stale','quick').ok,false);
    g.MedicalKitPanel.openWorkbench();assert.equal(g.document.querySelectorAll('#manufacturing-panel .reserve').length,0);
    assert.ok(g.document.querySelector('#manufacturing-panel .converted'));
  }finally{await h.close();}
});
test('surgery commits after six real world ticks; cancellation, reload and sleep restore stay independent',async()=>{
  const h=await boot(false),g=h.g;
  try{
    const id=await setup(h);stock(g,'supply_skin_stapler',2);damage(g,{lhand:100,rhand:100});
    assert.equal(g.MedicalActions.refill(id,'surgical_staples').ok,true);
    assert.equal(g.MedicalActions.refill(id,'surgical_staples').ok,true);
    const staminaBefore=g.Survival.getState().stamina;
    assert.equal(g.MedicalActions.treat(id,'lhand','surgical_staples','normal').ok,true);
    assert.equal(left(g,id,'surgical_staples'),60);assert.equal(g.Survival.getState().stamina,staminaBefore-10);
    assert.equal(g.CharacterAttributes.getBodyPartDestroyMax('lhand'),100);
    g.MedicalActions.advance();g.MedicalActions.advance();
    const snapshot=g.SaveSystem.buildSnapshotForDebug();
    assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot),true);
    assert.equal(g.MedicalActions.getState().elapsed,2);assert.equal(left(g,id,'surgical_staples'),60);
    for(let i=0;i<4;i++)assert.equal(g.MedicalActions.advance().ok,true);
    assert.equal(g.CharacterAttributes.getBodyPartDestroyMax('lhand'),50);assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),49);
    assert.equal(g.MedicalActions.isActive(),false);
    assert.equal(g.MedicalActions.treat(id,'rhand','surgical_staples','normal').ok,true);g.MedicalActions.advance();g.MedicalActions.cancel();
    assert.equal(left(g,id,'surgical_staples'),50);assert.equal(g.CharacterAttributes.getBodyPartDestroyMax('rhand'),100);
    g.CharacterAttributes.recoverSurgicalMaxAfterSleep();assert.equal(g.CharacterAttributes.getBodyPartDestroyMax('lhand'),100);assert.equal(g.CharacterAttributes.getPartDestroy('lhand'),49);
  }finally{await h.close();}
});
