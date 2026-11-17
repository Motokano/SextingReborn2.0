// Isolated production-UI review. No user saves or prototype rules are read.
if(!window.__MEDICAL_UI_MEMORY__)throw Error('Memory isolation required');
await window.__MEDICAL_UI_READY__;
DialogueUI.close();SceneApp.openCharacterCreationAfterIntro();
await new Promise(r=>setTimeout(r,60));
SceneApp.creation.confirm({name:'医疗验收',height:178,gender:'male',hand:'right',leg:'right'});
await new Promise(r=>setTimeout(r,60));DialogueUI.close();
GameEngine.setState('M0_Base_Inside_lv_1',4,10);
const I=InventoryEquipment,D=MedicalKitData;
const kit=(kind,i)=>{
 const b=D.bodies[kind],remaining=Object.fromEntries(Object.keys(D.reserves).map(k=>[k,0]));
 if(i<5)Object.assign(remaining,{trauma_dressing:kind==='quick'?50:100,hemostatic_gauze:375,tourniquet:150,fracture_band:kind==='quick'?225:450,medical_alcohol:150,surgical_staples:35});
 return {item_id:b.item_id,count:1,attribute_state:{structure:{medical_storage:{version:1,remaining,dressing_weight_g:i<5?75:0,affixes:i===1?['universal']:i===2?['dressing']:i===4?['fixed']:[]}}}};
};
const state=I.getState();state.equipment.backpack={item_id:'eq_backpack_multi_pocket',count:1};state.equipment.medical_kit=kit('none',0);
if(new URLSearchParams(location.search).get('view')==='production'){
 state.skills.life_manufacturing={level:25,exp:0};state.skills.life_weaving={level:1,exp:0};
 for(const r of ManufacturingData.recipes)ManufacturingKnowledge.grant(r.recipe_id);
 ManufacturingActions.restore({version:1,level:2,facilities:['bench','metal','kiln'],job:null,lastResult:null});
}
if(new URLSearchParams(location.search).get('view')==='crafting')state.skills.life_manufacturing={level:1,exp:0};
state.inventory_backpack=['meter','expand','quick','linked','none','none','none','none'].map((k,i)=>kit(k,i+1));
for(const r of Object.values(D.reserves))state.inventory_backpack.push({item_id:r.item_id,count:1});
for(const id of ['textile_cotton_cloth','textile_hemp_cloth','material_nylon_stock','material_steel_wire'])state.inventory_backpack.push({item_id:id,count:8});
if(new URLSearchParams(location.search).get('view')==='crafting')state.inventory_backpack.push({item_id:'textile_hemp_fiber',count:3});
if(new URLSearchParams(location.search).get('view')==='production')state.inventory_backpack.push({item_id:'textile_hemp_fiber',count:6},{item_id:'tool_sewing_kit_cloth',count:1},{item_id:'solvent_water_pure',count:6});
I.setState(state);Survival.setState({stamina:100,energy:100,satiety:100,thirst:100,isDead:false,isComa:false});
HideoutWarehouse.setState({...HideoutWarehouse.createDefaultState(),slots:Object.values(D.reserves).flatMap(r=>Array.from({length:3},()=>({item_id:r.item_id,count:1})))});
CharacterAttributes.setState({part_destroy:{head:15,chest:55,abdomen:50,lhand:100,rhand:65,lfoot:100,rfoot:80}});
for(const [type,part] of [['heavy_bleeding','lhand'],['bleeding','chest'],['fracture','lfoot']]){
 const id='review_medical_'+type;BuffSystem.registerRuntimeBuffTemplate({buff_id:id,display_name:MedicalKit.INJURIES[type],injury_type:type,manualLifetime:true,maxStacks:1,stacksAddOnApply:1,effects:[]});BuffSystem.applyBuff('player',id,'review',{body_part:part});
}
SceneApp.render();document.title='急救包 · 正式界面验收';
const view=new URLSearchParams(location.search).get('view');
if(view==='crafting'||view==='production')SceneCtx.actions.interactNpc('npc.station.manufacturing_base');
else if(view==='workbench')MedicalKitPanel.openWorkbench();else MedicalKitPanel.openDaily();
