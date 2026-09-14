import fs from 'node:fs';
import assert from 'node:assert/strict';

const g={};
new Function('globalThis',fs.readFileSync('js/agriculture-map.js','utf8'))(g);
const A=g.AgricultureMap;
const defs=JSON.parse(fs.readFileSync('data/agriculture-crop-defs.json','utf8'));
const soils=JSON.parse(fs.readFileSync('data/agriculture-soils.json','utf8'));
const params=JSON.parse(fs.readFileSync('data/agriculture-item-params.json','utf8')).injectables;
const env={cropDefs:defs,soils,resolveInjectParams(id){const p=params[id];return p&&{name:id,injectFacility:p.inject_facility,nutrientPerBottle:p.agriculture_nutrient_per_bottle};}};
A.bindEnv(env);

function lineState(){
  const s=A.createDefaultState();
  for(let y=1;y<=6;y++) A.tryPlaceChannelAt(s,0,y);
  A.tryPlaceVenturiAt(s,1,1);
  A.cell(s,10,10).kind='super_fusion';
  s.power_charge=1000;
  A.recomputeIrrigationNetwork(s);
  return s;
}
function plant(s,x,y,id='sesame'){
  const c=A.cell(s,x,y);c.tilled=true;c.cropStructure=defs.crops[id].required_crop_structure_id||null;
  assert(A.tryPlantCropAt(s,env,x,y,id).ok);
  return c;
}

{
  const s=lineState();
  const near=plant(s,1,2),far=plant(s,1,5);
  assert(A.tryLoadFacilityBottleAt(s,1,1,'venturi_fertilizer','liquid_seaweed_extract').ok);
  A.recomputeIrrigationNetwork(s);
  const inspected=A.inspectSupply(s);
  const trunk=inspected.routes.find(r=>r.flow.kind==='trunk');
  assert(trunk && trunk.request.x===1 && trunk.request.y===2,'A 面应选择沿实际湿水路更近的请求作物');
  near.crop.settled=true;
  const matureSignal=A.inspectSupply(s).routes.find(r=>r.flow.kind==='trunk');
  assert(matureSignal && matureSignal.request.y===2,'成熟未收获作物应继续保留信号');
  const stockBefore=A.cell(s,1,1).venturiLiquid.nutrientRemaining;
  A.runAgricultureMapTick(s,env);
  const stockAfter=A.cell(s,1,1).venturiLiquid.nutrientRemaining;
  assert(stockAfter<stockBefore,'有请求时应按实际输出消耗海藻精');
  assert.equal(near.crop.traceAbsorbed,0,'成熟信号作物不应继续吸收');
  const uniqueActual=new Set(inspected.routes.map(r=>r.device.x+','+r.device.y+':'+r.actualTotal));
  assert(uniqueActual.size===1 && trunk.actualTotal<=6,'同设备所有路径必须共享一级设备总输出上限');
  const maxima={};for(const r of inspected.routes)for(const p of r.cells){const k=p.x+','+p.y;maxima[k]=Math.max(maxima[k]||0,r.target);}
  const merged=Object.values(maxima).reduce((sum,v)=>sum+v,0);
  assert.equal(Math.round(merged*1000)/1000,trunk.requestedTotal,'同设备重叠渠格应取最大目标而非重复计费');
  A.commitHarvestAt(s,1,2);
  const next=A.inspectSupply(s).routes.find(r=>r.flow.kind==='trunk');
  assert(next && next.request.y===5,'完整收获后应切换到下一请求作物');
  far.crop.settled=true;
  A.commitHarvestAt(s,1,5);
  const idleBefore=A.cell(s,1,1).venturiLiquid.nutrientRemaining;
  A.runAgricultureMapTick(s,env);
  assert.equal(A.cell(s,1,1).venturiLiquid.nutrientRemaining,idleBefore,'无请求时不应消耗海藻精');
}

{
  const s=lineState();
  A.cell(s,10,10).kind='land';
  A.recomputeIrrigationNetwork(s);
  assert(A.tryLoadFacilityBottleAt(s,1,1,'venturi_fertilizer','liquid_seaweed_extract').ok);
  const initial=A.cell(s,1,1).venturiLiquid.nutrientRemaining;
  A.runAgricultureMapTick(s,env);
  assert.equal(A.cell(s,1,1).venturiLiquid.nutrientRemaining,initial,'首次 B 面默认关闭，不应静默耗料');
  A.trySetSeaweedConcentrationAt(s,1,1,2);
  A.runAgricultureMapTick(s,env);
  const afterB=A.cell(s,1,1).venturiLiquid.nutrientRemaining;
  assert(afterB<initial,'玩家开启 B 面后应投放');
  A.cell(s,10,10).kind='super_fusion';s.power_charge=10;
  A.runAgricultureMapTick(s,env);
  A.cell(s,10,10).kind='land';
  A.runAgricultureMapTick(s,env);
  assert(A.cell(s,1,1).venturiLiquid.nutrientRemaining<afterB,'A 面/断电切换后应恢复此前 B 面设定');
}

{
  const s=A.createDefaultState();
  const jar=A.cell(s,4,4);jar.kind='buried_pot_jar';jar.jarReleaseRate=2;
  const a=plant(s,3,4,'cherry'),b=plant(s,5,4,'cherry');
  assert(A.tryLoadFacilityBottleAt(s,4,4,'buried_pot_jar','fertilizer_compost_plus').ok);
  assert(A.tryLoadFacilityBottleAt(s,4,4,'buried_pot_jar','fertilizer_compost_plus').ok);
  const full=A.tryLoadFacilityBottleAt(s,4,4,'buried_pot_jar','fertilizer_compost_plus');
  assert.equal(full.reason,'facility_capacity','瓮满时必须拒绝整瓶装入');
  const before=jar.jarLiquid.nutrientRemaining;
  A.runAgricultureMapTick(s,env);
  assert.equal(jar.jarLiquid.nutrientRemaining,before-2,'瓮只扣设定的总输出');
  assert.equal(a.crop.fertilizerAbsorbed,b.crop.fertilizerAbsorbed,'两株作物应平均分配瓮肥');
  b.crop.settled=true;
  const prev=a.crop.fertilizerAbsorbed;
  A.runAgricultureMapTick(s,env);
  assert.equal(Math.round((a.crop.fertilizerAbsorbed-prev)*10)/10,.8,'成熟作物退出分配后生长作物应取得完整份额');
  const preview=A.previewChange(s,4,4,{task:{type:'remove_buried_pot_jar'}});
  assert(preview.ok && !A.cell(preview.state,4,4).jarLiquid,'拆除完成应清除设备内剩余养分');
}

console.log('Agriculture supply v2: request election, mature signal, shared budget, stock conservation, jar sharing, capacity and dismantle passed.');
