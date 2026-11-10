if (!window.__AGRICULTURE_UI_MEMORY__) throw Error('Memory isolation required');
const root = new URL('../', import.meta.url);
const [defs, soils] = await Promise.all(['agriculture-crop-defs.json','agriculture-soils.json'].map(async f => (await fetch(new URL('data/'+f, root))).json()));
await window.__AGRICULTURE_UI_READY__;
DialogueUI.close(); SceneApp.openCharacterCreationAfterIntro();
await new Promise(r=>setTimeout(r,60));
SceneApp.creation.confirm({name:'农田试玩',height:178,gender:'male',hand:'right',leg:'right'});
await new Promise(r=>setTimeout(r,60));
DialogueUI.close();
for (const id of ['agriculture','livestock']) { NPCSystem.setDemoFlag('facility_cleaned:'+id,true); NPCSystem.setDemoFlag('facility_restored:'+id,true); }
GameEngine.setState('M0_Base_Outside_lv_1',5,10); SceneApp.render();

document.title='农田 · 正式界面验收';
const A=window.AgricultureMap,env={cropDefs:defs,soils};A.bindEnv(env);
let st;
const cell=(x,y)=>A.cell(st,x,y);
function makeSample(){
 st=A.createDefaultState();
 for(let y=0;y<11;y++)for(let x=0;x<11;x++){const c=cell(x,y);if(c.kind==='land'){c.soilId=y<6?'soil_cinnamon':'soil_yellow_cotton';c.soilType=soils.soils[c.soilId].display_name;c.tilled=x>1&&x<10&&y>0&&y<10;}}
 for(let y=0;y<11;y++){A.tryPlaceChannelAt(st,1,y);cell(1,y).capacity=4;}
 for(const y of [4,8])for(let x=2;x<10;x++){A.tryPlaceChannelAt(st,x,y);cell(x,y).capacity=2;}
 A.tryPlaceVenturiAt(st,2,0);A.tryInjectSeaweedEffectAt(st,env,2,0);A.trySetSeaweedConcentrationAt(st,2,0,0);
 for(const [x,y] of [[3,3],[7,6]]){cell(x,y).kind='buried_pot_jar';cell(x,y).jarLiquid={itemId:'fertilizer_compost_plus',nutrientRemaining:2300,bottleCount:2,nutrientPerBottle:1500};cell(x,y).jarReleaseRate=3.2;}
 cell(10,10).kind='super_fusion';st.power_charge=420;
 const groups=[{id:'cherry',xs:[2,3,4],ys:[1,2],soil:'soil_black'},{id:'chili_red',xs:[6,7,8],ys:[2,3],soil:'soil_cinnamon'},{id:'maize',xs:[2,3,4],ys:[5,6,7],soil:'soil_red'},{id:'rice',xs:[6,7,8,9],ys:[5,7],soil:'soil_purple'},{id:'peanut',xs:[2,3,4],ys:[9],soil:'soil_cinnamon'}];
 for(const g of groups)for(const y of g.ys)for(const x of g.xs){const c=cell(x,y);c.tilled=true;c.soilId=g.soil;c.soilType=soils.soils[g.soil].display_name;c.cropStructure=defs.crops[g.id].required_crop_structure_id;A.tryPlantCropAt(st,env,x,y,g.id);if(c.crop){const f=.35+((x*5+y*3)%8)*.065;c.crop.remainingTicks=Math.round(c.crop.totalTicks*(1-f));c.crop.waterAbsorbed=(defs.crops[g.id].perfectMinWater||0)*f;c.crop.fertilizerAbsorbed=(defs.crops[g.id].perfectMinFertilizer||0)*f;c.crop.traceAbsorbed=(defs.crops[g.id].perfectMinTrace||0)*f;}}
 for(const [x,y]of [[2,7],[3,7],[4,7]]){Object.assign(cell(x,y).crop,{settled:true,remainingTicks:0,harvestCount:4,result:'good',resultLabel:'成熟'});}
 for(const [id,x,y]of [['tomato',5,1],['cucumber',6,1],['sugarcane',7,1],['sprout',8,1],['ginger',9,1],['lotus_seed',5,3]]){
  const c=cell(x,y),d=defs.crops[id];
  c.cropStructure=d.required_crop_structure_id;
  A.tryPlantCropAt(st,env,x,y,id);
  if(c.crop){c.crop.remainingTicks=Math.round(c.crop.totalTicks*.65);c.crop.waterAbsorbed=(d.perfectMinWater||0)*.35;c.crop.fertilizerAbsorbed=(d.perfectMinFertilizer||0)*.35;c.crop.traceAbsorbed=(d.perfectMinTrace||0)*.35;}
 }
 // Empty sample patches expose the three soils not used by the planted examples.
 for(const [id,points]of [['soil_saline_alkali',[[9,2],[9,3]]],['soil_alpine_meadow',[[5,5],[5,6]]],['soil_paddy',[[8,9],[9,9]]]]){
  for(const [x,y]of points){const c=cell(x,y);c.soilId=id;c.soilType=soils.soils[id].display_name;}
 }
 A.recomputeIrrigationNetwork(st);A.runAgricultureMapTick(st,env);st.power_charge=420;
 A.setState(st);AgricultureActions.unlockAgriculture();
}

// Sample preparation is confined to this isolated review route. The interface and actions are production code.
makeSample();
const wanted=new Map();
for(const crop of Object.values(defs.crops))wanted.set(crop.seedItemId,4);
for(const spec of Object.values((await(await fetch('data/agriculture-build-costs.json')).json()).builds))for(const row of spec.inputs||[])wanted.set(row.item_id,Math.max(wanted.get(row.item_id)||0,row.count*6));
for(const id of ['fertilizer_compost_plus','liquid_seaweed_extract','battery_aa'])wanted.set(id,4);
const warehouse=HideoutWarehouse.getState();
warehouse.slots=[...wanted].flatMap(([item_id,count])=>Array.from({length:count},()=>({item_id,count:1})));
warehouse.capacity=Math.max(warehouse.capacity,warehouse.slots.length);HideoutWarehouse.setState(warehouse);
InventoryEquipment.putItemIntoDefaultContainer({item_id:'battery_aa',count:1});
Survival.setState({stamina:90,fatigue:10,satiety:100,thirst:100});
AgricultureActions.openAgriculturePanel();
document.querySelector('#modal-agriculture [data-cell="5,1"]').click();
