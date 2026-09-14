import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fixture, read, species } from './lib/livestock-test-fixture.mjs';
const retired = ['link_schedule','waste_heat_recycle','climate_control'];
function legacy(f) {
  const saved=structuredClone(f.st);
  saved.arms.arm1.inner={module_id:'link_schedule',level:2,enabled_rules:['till_seed'],dispatch:2};
  saved.arms.arm1.front={module_id:'link_schedule',shadow:true};
  saved.arms.arm2.inner={module_id:'waste_heat_recycle',level:2,upgrading_remaining:7,mode:'fuel',points:22.5,points_by_mode:{fertilizer:13.25},output_queue:[{item_id:'hus_biogas',count:2}]};
  saved.arms.arm2.bottom={module_id:'waste_heat_recycle',shadow:true};
  saved.axis.slot2={module_id:'climate_control',level:1,mode:'sunny',mode_switch_cooldown:999};
  saved.zones.z1={grass_height:0.2,compaction:0,pollution:20,link_seed_ticks:1000,link_feed_ticks:1000,link_owner:'arm1'};
  saved.pollution_recovery={z1:20}; return saved;
}
function test(name,fn) { fn(); console.log('PASS '+name); }
test('three retired modules are unavailable even through stale config and compatibility APIs',()=>{
  const f=fixture(); const config=JSON.parse(read('data/livestock-modules.json')).modules;
  retired.forEach(id=>config[id]={module_id:id,tier:'large',requires_power:true});
  f.ls.setConfig(species,config,{}, {}, {});
  for(const id of retired) {
    assert(!f.ls.allModules()[id]); assert.equal(f.ls.getModule(id),null);
    assert.equal(f.ls.buildModule('arm1','inner',id).reason,'module_retired');
    assert.equal(f.ls.isModulePowered(id),false); assert.equal(f.ls.modulePowerDrainPerTick(id),0);
  }
  assert.equal(f.ls.climateSetMode('sunny').ok,false); assert.equal(f.ls.linkScheduleToggleRule('till_seed').ok,false);
  assert.equal(f.ls.wasteHeatSetMode('fuel').ok,false);
  for(const id of ['clinic_arm','feed_refine','pasture_arm','warehouse_hub']) assert(f.ls.allModules()[id]);
});
test('legacy primary and shadow slots retire once, effects and energy drain disappear',()=>{
  const f=fixture(); f.ls.setState(legacy(f)); const st=f.ls.getState();
  assert.equal(st.arms.arm1.inner,null); assert.equal(st.arms.arm1.front,null); assert.equal(st.axis.slot2,null);
  assert.equal(st.retired_module_storage.records.length,3);
  assert.equal(st.retired_module_storage.items.hus_biogas,2);
  assert.equal(st.retired_module_storage.records[1].snapshot.points,22.5);
  const before=JSON.stringify(st.retired_module_storage); const power=st.power_charge;
  f.tick(); assert(Math.abs(st.zones.z1.grass_height-0.2008)<1e-9); assert.equal(st.power_charge,power);
  assert.equal(st.zones.z1.link_seed_ticks,undefined); assert.equal(st.pollution_recovery,undefined);
  f.ls.setState(JSON.parse(JSON.stringify(st))); f.tick();
  assert.equal(JSON.stringify(f.ls.getState().retired_module_storage),before);
});
test('construction, completed upgrades and prepaid unfinished upgrades are refunded exactly once',()=>{
  const f=fixture(); f.ls.setState(legacy(f)); const box=f.ls.getRetiredModuleStorage();
  const expected={hus_biogas:2};
  // link Lv2 = build + 1→2; heat Lv2 upgrading = build + 1→2 + prepaid 2→3; climate Lv1 = build.
  for(const [tier,froms] of [['large',[1,1,1,1,2]],['axis',[1]]]) for(const from of froms) {
    for(const p of f.ls.getBuildStep(tier,from).inputs) expected[p.item_id]=(expected[p.item_id]||0)+p.count;
  }
  assert.deepEqual(JSON.parse(JSON.stringify(box.items)),expected); assert(box.records.every(r=>r.material_refund_pending===false));
  box.items.hus_biogas=999; assert.equal(f.ls.getRetiredModuleStorage().items.hus_biogas,2);
});
test('late config can settle deferred refunds without duplicating finished output',()=>{
  const f=fixture(); f.ls.setConfig({}, {}, {}, {}, {}); f.ls.setState(legacy(f));
  assert(f.ls.getRetiredModuleStorage().records.every(r=>r.material_refund_pending));
  f.ls.setConfig(species,JSON.parse(read('data/livestock-modules.json')).modules,{},JSON.parse(read('data/livestock-build-costs.json')).costs,{});
  const box=f.ls.getRetiredModuleStorage(); assert.equal(box.items.hus_biogas,2);
  assert(box.records.every(r=>!r.material_refund_pending));
});
test('claiming never loses full-inventory items and cannot claim the same item twice',()=>{
  const f=fixture(); f.ls.setState(legacy(f));
  const put=f.ie.putItemIntoDefaultContainer; f.ie.putItemIntoDefaultContainer=()=>({placed:false});
  const before=JSON.stringify(f.ls.getRetiredModuleStorage().items);
  assert.equal(f.ls.claimRetiredModuleItems().placed,0); assert.equal(JSON.stringify(f.ls.getRetiredModuleStorage().items),before);
  f.ie.putItemIntoDefaultContainer=put;
  const initial=Object.values(f.ls.getRetiredModuleStorage().items).reduce((a,b)=>a+b,0);
  const result=f.ls.claimRetiredModuleItems(); assert(result.placed>0); assert.equal(result.placed+result.remaining,initial);
  const remainder=f.ls.getRetiredModuleStorage().items;
  f.ls.setState(JSON.parse(JSON.stringify(f.ls.getState())));
  assert.deepEqual(f.ls.getRetiredModuleStorage().items,remainder);
});
test('actual module renderer omits retired controls and offers recovery inventory',()=>{
  const f=fixture(); f.ls.setState(legacy(f)); const box={innerHTML:''};
  f.ctx.document={getElementById:id=>id==='livestock-module-content'?box:null,querySelector:()=>null,querySelectorAll:()=>[]};
  const code=read('js/livestock-panel.js').replace('  window.LivestockPanel = {','  window.auditRenderModules = renderModules;\n  window.LivestockPanel = {');
  vm.runInContext(code,f.ctx); f.ctx.auditRenderModules(f.ls.getState(),100);
  retired.forEach(id=>assert(!box.innerHTML.includes('data-module="'+id+'"')));
  assert(!/data-climate|data-heat-mode|data-link-rule/.test(box.innerHTML)); assert(box.innerHTML.includes('data-retired-claim'));
});
