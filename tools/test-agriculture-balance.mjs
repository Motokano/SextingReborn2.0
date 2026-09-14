import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const defs = read('data/agriculture-crop-defs.json');
const balance = read('data/agriculture-crop-balance.json');
const soils = read('data/agriculture-soils.json');
const items = read('data/agriculture-item-params.json').injectables;
const g = {};
new Function('globalThis', fs.readFileSync(path.join(root, 'js/agriculture-map.js'), 'utf8'))(g);
const A = g.AgricultureMap;
const env = { cropDefs: defs, soils, resolveInjectParams(id) {
  const d = items[id];
  return d && { name:id, injectFacility:d.inject_facility, fertilizerPerTick:d.agriculture_fertilizer_per_tick,
    effectDurationTicks:d.agriculture_venturi_effect_duration_ticks, nutrientPerBottle:d.agriculture_nutrient_per_bottle };
}};
A.bindEnv(env);
const round = n => Math.round(n * 10) / 10;

function fixture(id, {cap=2, jars=0, jarRate=3.75, concentration=0, soil=null, neighbor=false, power=10000, fertilizer="fertilizer_compost_plus"}={}) {
  const st = A.createDefaultState();
  for (let x=1; x<=6; x++) { A.tryPlaceChannelAt(st,x,0); A.cell(st,x,0).capacity=cap; }
  if (soil) { A.cell(st,10,10).kind='super_fusion'; st.power_charge=power; }
  const p = A.cell(st,3,1), d=defs.crops[id];
  p.tilled=true; p.cropStructure=d.required_crop_structure_id || null;
  if (soil) {p.soilId=soil; p.soilType=soils.soils[soil].display_name;}
  for (const [x,y] of [[2,1],[2,2],[3,2],[4,2]].slice(0,jars)) {
    Object.assign(A.cell(st,x,y), {kind:'buried_pot_jar',jarReleaseRate:jarRate,jarLiquid:{itemId:fertilizer,nutrientRemaining:99999,nutrientPerBottle:items[fertilizer]?.agriculture_nutrient_per_bottle || 1500,outputRate:jarRate}});
  }
  if (concentration) {
    A.tryPlaceVenturiAt(st,1,1);
    A.cell(st,1,1).venturiLevel=3;
    A.trySetSeaweedConcentrationAt(st,1,1,concentration);
    A.tryInjectSeaweedEffectAt(st,env,1,1);
  }
  A.recomputeIrrigationNetwork(st);
  assert(A.tryPlantCropAt(st,env,3,1,id).ok);
  if (neighbor) { A.cell(st,4,1).tilled=true; assert(A.tryPlantCropAt(st,env,4,1,'maize').ok); }
  return {st,p};
}
function finish(f) {
  for(let i=0;i<250 && f.p.crop && !f.p.crop.settled;i++) A.runAgricultureMapTick(f.st,env);
  return f.p.crop;
}
function candidates(id, soil, perfect=false) {
  const b=balance.crops[id], s=soils.soils[soil || 'soil_saline_alkali'];
  const mods=soil?s.fusion_gated?.absorption_modifiers || {}:{};
  const within=(v,band)=>!band || v>=band[perfect?1:0]-.0001 && v<=band[perfect?2:3]+.0001;
  const out=[];
  const traceRates=Array.from({length:21},(_,concentration)=>{if(!b.trace)return 0;const f=fixture(id,{cap:4,concentration,soil});A.runAgricultureMapTick(f.st,env);return f.p.crop?.traceAbsorbed || 0;});
  for(const cap of [2,4,6,8,10]) for(let jars=0;jars<=4;jars++) for(const jarRate of (jars ? Array.from({length:15},(_,i)=>(i+1)*.25) : [0])) for(let concentration=0;concentration<=18;concentration++) {
    if(!b.trace && concentration) continue;
    if(!b.fertilizer && jars) continue;
    const water=round(cap*s.water_retention*(mods.water_multiplier || 1));
    const fert=jars?jars*round(jarRate*s.fertilizer_retention*(mods.fertilizer_multiplier || 1)):
      soil==='soil_black' && b.fertilizer ? .2:0;
    const trace=traceRates[concentration];
    if(within(water,b.water) && within(fert,b.fertilizer) && within(trace,b.trace)) out.push({cap,jars,jarRate,concentration,soil,fertilizer:'fertilizer_compost_plus'});
  }
  return out.sort((a,b)=>(a.cap*6+a.jars*8+a.concentration)-(b.cap*6+b.jars*8+b.concentration));
}
function findPlan(id, soil, perfect=false) {
  for(const plan of candidates(id,soil,perfect)) {
    const crop=finish(fixture(id,plan));
    if(crop?.result==='mature' && (!perfect || ['Water','Fertilizer','Trace'].every(k => {const d=A.getCropDefForInstance(crop),min=d['perfectMin'+k],max=d['perfectMax'+k],v=crop[k.toLowerCase()+'Absorbed'];return min == null || v >= min && (max == null || v <= max);}))) return {...plan,waterAbsorbed:crop.waterAbsorbed,fertilizerAbsorbed:crop.fertilizerAbsorbed,traceAbsorbed:crop.traceAbsorbed,multiplier:crop.yieldMultiplier};
  }
  if (process.env.AGRI_DEBUG) console.log(id,soil,perfect,candidates(id,soil,perfect).slice(0,2).map(plan=>({plan,crop:finish(fixture(id,plan))})));
  return null;
}

const results=[];
for (const [id,d] of Object.entries(defs.crops)) {
  for (const [key, suffix] of [['water','Water'],['fertilizer','Fertilizer'],['trace','Trace']]) {
    if (!balance.crops[id][key]) continue;
    const expected=balance.crops[id][key].map(v=>round(v*d.growthTicks));
    assert.deepEqual(['min','perfectMin','perfectMax','max'].map(k=>d[k+suffix]),expected,id+' stale generated data');
  }
  const baseline=finish(fixture(id));
  if(d.tier===1) assert.equal(baseline?.result,'mature',id+' basic agriculture');
  if(d.tier>=3) assert.notEqual(baseline?.result,'mature',id+' must need investment');
  const unfused=findPlan(id,null);
  const fused=findPlan(id,balance.crops[id].reference_soil);
  assert(unfused,id+' must remain attainable without fusion');
  assert(fused,id+' must grow on its reference soil');
  const prosperity=findPlan(id,balance.crops[id].reference_soil,true);
  if(d.tier>=3) assert(prosperity,id+' must have a high-input-score fused setup');
  if(d.tier>=4) {
    assert(fused.cap<unfused.cap,id+' fusion must lower water demand');
    assert(fused.jars*fused.jarRate<unfused.jars*unfused.jarRate,id+' fusion must lower fertilizer output');
    const lacking=finish(fixture(id,{...unfused,jars:0}));
    assert.notEqual(lacking?.result,'mature',id+' fertilizer is necessary');
    const mixedBefore=fixture(id,{...unfused,neighbor:true}); assert.equal(finish(mixedBefore).result,'mature');
    assert.equal(A.cell(mixedBefore.st,4,1).crop.result,'flooded',id+' forcing supply sacrifices basic neighbor');
    const mixedAfter=fixture(id,{...fused,neighbor:true}); assert.equal(finish(mixedAfter).result,'mature');
    assert.equal(A.cell(mixedAfter.st,4,1).crop.result,'mature',id+' fusion enables coexistence');
  }
  results.push({id,name:d.name,tier:d.tier,baseline:baseline?.result || 'dead',unfused,fused,prosperity});
}

// Existing crops and their saves finish under the original rules, not the new nutrient gates.
const legacy=fixture('cherry'); delete legacy.p.crop.balanceRevision;
assert.equal(finish(legacy).result,'mature');
const restored=fixture('cherry',findPlan('cherry','soil_black'));
A.advanceMapTicks(restored.st,env,30);
const copy=JSON.parse(JSON.stringify(restored.st));
assert.equal(finish({st:copy,p:A.cell(copy,3,1)}).result,'mature');
assert.equal(finish(restored).harvestCount>=1,true);

const cherryPlan=findPlan('cherry','soil_black');
assert.notEqual(finish(fixture('cherry',{...cherryPlan,power:0})).result,'mature','inactive amended soil must not bypass fusion');
const anisePlan=findPlan('star_anise','soil_red');
assert.equal(finish(fixture('star_anise',{...anisePlan,concentration:0})).result,'trace_deficient');
assert.equal(finish(fixture('cherry',{...cherryPlan,concentration:20})).result,'mature','fusion must stop unrequested seaweed injection');
const contaminated=fixture('cherry',{...cherryPlan,concentration:20});
A.cell(contaminated.st,4,1).tilled=true;
assert(A.tryPlantCropAt(contaminated.st,env,4,1,'sesame').ok);
assert.notEqual(finish(contaminated)?.result,'mature','shared requested flow still harms a sensitive crop');
assert.equal(finish(fixture('cherry',{...cherryPlan,jarRate:3.75,jars:4})).result,'fertilizer_excess','high release rate and extra jars can overdose');

// Keep offline demo settlement and instance migration in sync with the runtime.
const runtime=fs.readFileSync(path.join(root,'js/agriculture-map.js'),'utf8').replace(/\r\n/g,'\n');
const demo=fs.readFileSync(path.join(root,'tools/agriculture-irrigation-demo.html'),'utf8').replace(/\r\n/g,'\n');
for(const name of ['getCropDefForInstance','applyCropDefs','scoreTraceDimension','scoreFertilizerDimension','settleCrop']) {
  const extract=s=>s.match(new RegExp('      function '+name+'\\([^]*?\\n      \\}'))[0];
  assert.equal(extract(demo),extract(runtime).replace('settleCrop(st, c)','settleCrop(c)').replace('computeGrowthYield(def, c, crop, st)','computeGrowthYield(def, c, crop)'),name+' demo drift');
}

if(process.argv.includes('--report')) {
  fs.writeFileSync(path.join(root,'docs/reference/agriculture-balance-results.json'),JSON.stringify(results,null,2)+'\n');
  const soilName=p=>soils.soils[p.soil || 'soil_saline_alkali'].display_name;
  const plan=p=>`${p.cap} / ${p.jars}`;
  const lines=[
    '# 农业作物重做：模拟验收结果', '',
    '由 `node tools/test-agriculture-balance.mjs --report` 生成。50 种作物全部使用实际农业模块跑完整生长周期。', '',
    '目标：基础农业可维生；高级作物在默认土需要专用高供水田与更多陶瓮；供电超融合和客土让高级作物与普通作物共存。', '',
    '## 实验条件与边界', '',
    '- 统一使用六格直渠、已有种植前置设施。表内是搜索到的可行方案，不是全地图最优解。',
    '- 供水数字是每渠格每刻水量，六格渠的水池占用为其六倍；没有启用窃流。',
    '- 陶瓮预装足够肥料，默认一次注入仍为一个库存单位、每个有效施肥刻每瓮扣一单位；表内瓮数不是整季肥料物品数。',
    '- 对照不含种子、客土、电池和肥料的获取成本，也未验证极端天气或玩家操作手感。',
    '- 四、五档逐种验证：默认土专用供水使邻接玉米淹死；融合方案中高级作物和邻接玉米都成熟。玉米地保留盐碱土。',
    '- 三到五档逐种验证：适合的融合土至少存在一个水、肥、微量均进入高产区间的方案；清水敏感作物使用清水。',
    '- 旧档已种作物保留旧季条件；新播种使用新条件；存读档后供肥和结果连续。', '',
    '## 全作物对照', '',
    '“供水 / 瓮数”只表示该布局的配置；肥料类型与浓度详见同目录 JSON。', '',
    '| 作物 | 档 | 基础清水结果 | 默认土供水 / 瓮数 | 融合客土 | 融合供水 / 瓮数 |',
    '|---|---:|---|---|---|---|',
    ...results.map(r=>`| ${r.name} | ${r.tier} | ${r.baseline==='mature'?'成熟':'不能收获'} | ${plan(r.unfused)} | ${soilName(r.fused)} | ${plan(r.fused)} |`), '',
    '## 后续体验验证', '',
    '本轮证明了需求冲突及融合解法成立。仍需用主游戏获得的实际肥料数量试玩一季，评估“一单位肥料只供一刻”的现有包装规则是否造成重复投料或过高生产成本。该问题应与肥料产出、库存及投料交互一起调整，不能靠偷偷放宽高级作物需求掩盖。', ''
  ];
  fs.writeFileSync(path.join(root,'docs/reference/agriculture-balance-results.md'),lines.join('\n'));
}
console.log('Agriculture balance: 50 crops; baseline, attainable setups, high-score fusion, shared-water coexistence, nutrient gates and save continuity passed.');
