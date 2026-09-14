// Read-only diagnostics: load real runtime functions in memory; never access player saves.
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const read=p=>fs.readFileSync(p,'utf8');
const defs=JSON.parse(read('data/agriculture-crop-defs.json'));
const soils=JSON.parse(read('data/agriculture-soils.json'));
const extra=['pickFirstReachableRequestForFlow','getFlowsToMaintainForVenturi','getVenturiFlowAttribution','getPostEntryWetCells','pickInjectionForFlow','agriTickStep5CropAbsorbTraceElements','agriTickStep5aTraceSensitivity','syncAllCropGrowthTicksForFusionChange'];
function load(source=read('js/agriculture-map.js')) {
  const g={};
  source=source.replace('global.AgricultureMap = {','global.AgricultureMap = { __audit: {'+extra.join(',')+'},');
  new Function('globalThis','Math',source)(g,Object.assign(Object.create(Math),{random:()=>.5}));
  const A=g.AgricultureMap;
  const env={cropDefs:defs,soils}; A.bindEnv(env);
  return {A,env};
}
function layout(A,env,channels=Array.from({length:6},(_,i)=>[i+1,0]),powered=true){
  const s=A.createDefaultState();
  for(const [x,y] of channels) A.tryPlaceChannelAt(s,x,y);
  if(powered) A.cell(s,10,10).kind='super_fusion';
  A.tryPlaceVenturiAt(s,1,1); A.tryInjectSeaweedEffectAt(s,env,1,1);
  A.trySetSeaweedConcentrationAt(s,1,1,10); A.recomputeIrrigationNetwork(s);
  return s;
}
function plant(A,env,s,x,y,id='sesame'){
  const c=A.cell(s,x,y); c.tilled=true;c.cropStructure=defs.crops[id].required_crop_structure_id||null;
  const r=A.tryPlantCropAt(s,env,x,y,id);if(!r.ok)throw Error(JSON.stringify(r));return c;
}
const out={};
const {A,env}=load();
out.data={crops:Object.keys(defs.crops).length,legacyCrops:Object.keys(defs.legacy_crops||{}).length,requesters:Object.values(defs.crops).filter(d=>d.requests_seaweed_extract).length,requiresStructure:Object.values(defs.crops).filter(d=>d.required_crop_structure_id).length};
{
  const s=layout(A,env);const far=plant(A,env,s,6,1),near=plant(A,env,s,3,1);
  const pick=()=>A.__audit.pickFirstReachableRequestForFlow(s,1,1,{kind:'trunk'});
  const first=pick(); far.crop.traceAbsorbed=9999; far.crop.settled=true;
  A.syncCropSeaweedExtractRequests(s);const matureStillSelected=pick();
  A.processSeaweedExtractMaintain(s); const suppliedPastNear=A.cell(s,6,0).seaweedConcentration;
  far.crop=null; A.syncCropSeaweedExtractRequests(s);
  out.requests={first,matureStillSelected,afterRemoval:pick(),suppliedPastNear};
}
{
  const channels=[[1,0],[2,0],[3,0],[4,0],[3,1],[3,2],[4,1],[4,2]];
  const s=layout(A,env,channels,false);
  A.processSeaweedExtractMaintain(s);
  const sum=()=>s.map.flat().reduce((n,c)=>n+(c.seaweedConcentration||0),0);
  const one=sum(); const flows=A.__audit.getFlowsToMaintainForVenturi(s,A.__audit.getVenturiFlowAttribution(s,1,1));
  A.tryPlaceVenturiAt(s,2,1);A.tryInjectSeaweedEffectAt(s,env,2,1);A.trySetSeaweedConcentrationAt(s,2,1,10);
  A.processSeaweedExtractMaintain(s);
  out.multiflow={branches:s.branches.length,maintainedFlows:flows.length,totalConcentrationOneDevice:one,totalConcentrationTwoDevices:sum()};
}
{
  const s=layout(A,env); const c=plant(A,env,s,3,1,'maize');
  A.processSeaweedExtractMaintain(s);const a=A.cell(s,3,0).seaweedConcentration;
  s.power_charge=0;A.processSeaweedExtractMaintain(s);
  out.noRequester={poweredA:a,unpoweredB:A.cell(s,3,0).seaweedConcentration};
  s.power_charge=10;const liquid=A.cell(s,1,1).venturiLiquid;
  const before=liquid.effectTicksRemaining;A.runAgricultureMapTick(s,env);
  out.effectWithoutRequest={before,after:liquid.effectTicksRemaining};
  A.tryInjectSeaweedEffectAt(s,env,1,1);out.effectWithoutRequest.afterReinjection=A.cell(s,1,1).venturiLiquid.effectTicksRemaining;
}
{
  const id=Object.keys(defs.crops).find(k=>defs.crops[k].trace_sensitivity==='lethal');
  const s=layout(A,env,undefined,false),c=plant(A,env,s,3,1,id);
  A.cell(s,3,0).seaweedConcentration=1;
  const h0=c.crop.healthCurrent; A.__audit.agriTickStep5CropAbsorbTraceElements(s);
  const h1=c.crop?.healthCurrent; A.__audit.agriTickStep5aTraceSensitivity(s);
  out.sensitivity={id,h0,afterAbsorb:h1,afterDedicatedStep:c.crop?.healthCurrent};
}
{
  const s=layout(A,env),c=plant(A,env,s,3,1,'cherry');
  const j=A.cell(s,2,1);j.kind='buried_pot_jar';j.jarLiquid={itemId:'fertilizer_compost_plus',units:2};
  A.runAgricultureMapTick(s,env);const first={units:j.jarLiquid?.units,fertilizer:c.crop.fertilizerAbsorbed,power:s.power_charge};
  A.runAgricultureMapTick(s,env);out.jar={first,second:{liquid:j.jarLiquid,fertilizer:c.crop.fertilizerAbsorbed,power:s.power_charge}};
  const copy=JSON.parse(JSON.stringify(s)); A.runAgricultureMapTick(s,env);A.runAgricultureMapTick(copy,env);
  out.cloneContinuationEqual=JSON.stringify(s)===JSON.stringify(copy);
}
{
  const s=layout(A,env);const c=A.cell(s,3,1);c.soilId='soil_alpine_meadow';plant(A,env,s,3,1,'maize');
  const start=c.crop.totalTicks;s.power_charge=1;A.runAgricultureMapTick(s,env);
  const after={total:c.crop.totalTicks,remaining:c.crop.remainingTicks,power:s.power_charge};
  A.addPowerCharge(s,10);out.power={start,after,restoredTotal:c.crop.totalTicks,restoredPower:s.power_charge};
}
// Execute the unchanged scene action function, substituting only external inventory/UI services.
{
  const scene=read('js/scene-app.js');
  const action=scene.slice(scene.indexOf('    function tryAgricultureAction('),scene.indexOf('    function payAgricultureBuildCost('));
  const s=layout(A,env);const c=plant(A,env,s,3,1,'maize');c.crop.settled=true;c.crop.harvestCount=0;c.crop.result='withered';A.setState(s);
  const ctx={window:{AgricultureMap:A,AgriculturePlayerItems:{}},AgricultureMap:A,isAgricultureUnlocked:()=>true,buildAgricultureEnv:()=>env,addAgricultureHarvestProficiency:()=>{},IE:{putItemIntoDefaultContainer:()=>({placed:true})}};
  vm.createContext(ctx);vm.runInContext(action,ctx);
  out.sceneZeroHarvest={result:ctx.tryAgricultureAction('harvest',{x:3,y:1}),cropRemains:!!c.crop};
  c.crop.harvestCount=3;let space=2;ctx.IE.putItemIntoDefaultContainer=()=>({placed:space-->0});
  out.scenePartialHarvest={result:ctx.tryAgricultureAction('harvest',{x:3,y:1}),remaining:c.crop.harvestCount};
  ctx.IE.putItemIntoDefaultContainer=()=>({placed:true});ctx.tryAgricultureAction('harvest',{x:3,y:1});out.sceneFinalHarvestClears=!c.crop;
}
// Compare historical runtime function text with the current working tree, without claiming HEAD is deployed.
{
  const old=execFileSync('git',['show','HEAD:js/agriculture-map.js'],{encoding:'utf8'}),cur=read('js/agriculture-map.js');
  function body(src,name){const start=src.indexOf('      function '+name+'(');const next=src.indexOf('\n      function ',start+1);return src.slice(start,next<0?undefined:next).replace(/\r/g,'').trim();}
  out.historicalComparison=Object.fromEntries(['pickFirstReachableRequestForFlow','processSeaweedExtractMaintain','getPostEntryWetCells','getIrrigationSourceForPlot'].map(n=>[n,body(old,n)===body(cur,n)]));
}
// Render the actual action-selection function with inert button collectors (no browser/player state).
{
  const src=read('js/agriculture-panel.js');
  const action=src.slice(src.indexOf('    function renderActions('),src.indexOf('    function render(mapState)'));
  const buttons=[];const id=Object.keys(defs.crops).find(k=>defs.crops[k].required_crop_structure_id),d=defs.crops[id];
  const ctx={document:{getElementById:()=>({innerHTML:''})},getSceneApp:()=>({getAgriculturePlantOptions:()=>[{cropId:id,seedItemId:d.seedItemId,name:d.name,count:1}],getAgricultureSoilAmendmentOptions:()=>[]}),addActionGroup:()=>{},addBuildTaskButton:()=>{},addActionButton:(_e,label)=>buttons.push(label),t:k=>k,CROP_STRUCTURE_IDS:[],canTill:()=>false,canRemoveTilled:()=>false,canBuildLand:()=>false,canHarvest:()=>false};
  // Read the real hasCropStructure predicate too.
  const start=src.indexOf('    function hasCropStructure('),next=src.indexOf('\n    function ',start+1);
  Object.assign(ctx,{isVenturiCell:()=>false,isBuriedJarCell:()=>false,isSuperFusionCell:()=>false});
  vm.createContext(ctx);vm.runInContext(src.slice(start,next)+'\n'+action,ctx);
  const c={kind:'land',tilled:true,crop:null,cropStructure:null};ctx.renderActions({},c,3,1);const before=buttons.filter(x=>x==='agriculture.action.plant_fmt').length;
  buttons.length=0;c.cropStructure=d.required_crop_structure_id;ctx.renderActions({},c,3,1);
  out.structureMenu={id,structure:c.cropStructure,plantButtonsWithoutStructure:before,plantButtonsWithStructure:buttons.filter(x=>x==='agriculture.action.plant_fmt').length};
}
console.log(JSON.stringify(out,null,2));
