// Read-only production-runtime audit. Known defects are observations, not desired behavior.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture, species, items, read } from './lib/livestock-test-fixture.mjs';
const modules = JSON.parse(read('data/livestock-modules.json')).modules;
const perks = JSON.parse(read('data/livestock-perks.json')).perks;
const costs = JSON.parse(read('data/livestock-build-costs.json')).costs;
const crops = JSON.parse(read('data/livestock-feed-crops.json')).crops;
const result = { date: '2026-09-12', scope: 'actual runtime; no gameplay mutations on disk; injected boundaries explicitly identified', checks: [], moduleLevels: [], massSweep: {}, hashes: {} };
function probe(id, scope, fn) {
  try { const evidence = fn(); result.checks.push({ id, scope, evidence }); console.log(id + ': ' + JSON.stringify(evidence)); }
  catch (e) {
    if (e.code === 'module_retired') { result.checks.push({ id, scope, status: 'retired', reason: e.message }); console.log(id + ': RETIRED ' + e.message); return; }
    result.checks.push({ id, scope, error: e.stack }); console.log(id + ': ERROR ' + e.message); process.exitCode = 1;
  }
}
probe('slaughter_without_equipment', 'public operation, empty module layout', () => {
  const f = fixture(), a = f.animal('cattle', 'z1', { weight_kg: 600 });
  return { preview: f.ls.previewSlaughter(a.uid).ok, slaughter: f.ls.slaughterAnimal(a.uid).ok, remainingAnimals: f.st.animals.length };
});
probe('sprinkler_upgrade_regression', 'legally built modules, levels 1–5', () => [1,2,3,4,5].map(level => {
  const f = fixture(); f.mount('arm1', 'bottom', 'sprinkler', level); f.st.zones.z1.compaction = 50; f.tick();
  return { level, decompaction: 50 - f.st.zones.z1.compaction };
}));
probe('collector_order', 'two real collectors overlap one zone', () => [false,true].map(reverse => {
  const f = fixture(); f.mount('arm1', 'front', 'auto_collect', 1); f.mount('arm4', 'front', 'auto_collect', 5);
  const a = f.animal('cattle', 'z1', { gender: 'female' });
  if (reverse) f.st.arms = Object.fromEntries(Object.entries(f.st.arms).reverse()); f.tick();
  return { reverse, milkCooldown: a.cooldowns.milk, products: f.ls.drainAutoCollectItems().length };
}));
probe('single_side_seeder', 'legal opposite-side placement', () => ['cw_side','ccw_side'].map(slot => {
  const f = fixture(); f.mount('arm1', slot, 'seeder'); Object.values(f.st.zones).forEach(z => z.grass_height = 0.2); f.tick();
  return { slot, grass: Object.fromEntries(Object.entries(f.st.zones).map(([k,z]) => [k,z.grass_height])) };
}));
probe('chicken_auto_collection', 'coop and collector legally share one arm', () => {
  const f = fixture(); f.mount('arm1', 'inner', 'coop'); f.mount('arm1', 'front', 'auto_collect', 5);
  const a = f.animal('chicken', 'arm1', { gender: 'female' }); f.tick();
  return { auto: f.ls.drainAutoCollectItems(), manual: f.ls.collectProduct(a.uid, 'egg') };
});
probe('chicken_capacity', 'injected 6-bird stock; no animal-intake API exists', () => [1,5].map(level => {
  const f = fixture(); f.mount('arm1', 'inner', 'coop', level); Object.values(f.st.zones).forEach(z => z.pollution = 50);
  const birds = Array.from({length:6}, () => f.animal('chicken', 'arm1', { satiety: 70 })); f.tick();
  return { level, satieties: birds.map(a => a.satiety), pollutionRemoved: 200 - Object.values(f.st.zones).reduce((s,z) => s+z.pollution,0) };
}));
probe('clinic_tie_order', 'equal-health animal insertion order', () => [false,true].map(reverse => {
  const f = fixture(); f.mount('arm1', 'inner', 'clinic_arm');
  const aa = Array.from({length:3}, () => f.animal('cattle', 'z1', { hp: 50, satiety: 0 }));
  if (reverse) f.st.animals.reverse(); f.tick(); return { reverse, hp: aa.map(a => a.hp) };
}));
probe('mixed_grazing_floor', 'cow and sheep near cow edible floor', () => [false,true].map(withSheep => {
  const f = fixture(); f.st.zones.z1.grass_height = 0.40001;
  const a = f.animal('cattle', 'z1', { satiety: 80 }); if (withSheep) f.animal('sheep');
  // Compaction still permits a small amount of natural growth; both layouts use the same state.
  f.st.zones.z1.compaction = 100; f.tick();
  return { withSheep, cattleSatiety: a.satiety, remainingGrass: f.st.zones.z1.grass_height };
}));
probe('graze_perk_nutrition', 'same animal, ample identical grass', () => [[],['fast_graze'],['picky_eater']].map(ps => {
  const f = fixture(); const a = f.animal('cattle', 'z1', { perks: ps, satiety: 50 }); f.tick();
  return { perks: ps, satiety: a.satiety, grass: f.st.zones.z1.grass_height };
}));
probe('fed_growth_after_no_grazing', 'satiety reserve but no edible grass', () => {
  const f = fixture(); Object.values(f.st.zones).forEach(z => z.grass_height = 0);
  const a = f.animal('cattle', 'z1', { weight_kg: 10, satiety: 100 }); f.tick(100);
  return { suppliedFeed: 0, initialWeight: 10, finalWeight: a.weight_kg, finalSatiety: a.satiety };
});
probe('processing_residue_dismount', 'legal processor input with no receiver', () => {
  const f = fixture(); f.mount('arm1', 'inner', 'feed_preprocess'); f.ls.feedProcessInput('arm1','herb_maize',1); f.tick(20);
  return { dismount: f.ls.dismountModule('arm1','inner'), withdrawalFunctions: Object.keys(f.ls).filter(k => /withdraw|cancel|refund/i.test(k)) };
});
probe('trough_upgrade_capacity', 'same configured capacity at all levels', () => [1,5].map(level => {
  const f = fixture(); const t = f.mount('arm1','cw_side','feed_trough',level); t.feed_units = 100;
  return { level, insert: f.ls.addFeedToTrough('arm1','herb_maize',1), units: t.feed_units };
}));
probe('configured_crossbreed_zero', 'config mutation to verify whether params drive runtime', () => {
  const f = fixture(); const pp = structuredClone(perks); pp.crossbreed_swine.params.trigger_chance = 0;
  f.ls.setConfig(species,modules,pp,costs,crops); f.ctx.Math.random = () => 0;
  f.animal('pig','z1',{ perks:['crossbreed_swine'] }); const ewe = f.animal('sheep','z2',{gender:'female'});
  f.st.rotation_ticks_remaining = 1; f.tick(); return { configuredChance:0, pregnant:ewe.pregnant };
});
probe('sire_removed_before_birth', 'slaughtering a father during existing pregnancy', () => [false,true].map(removeFather => {
  const f = fixture(); f.ctx.Math.random = () => 0;
  const father = f.animal('pig','z1',{perks:['meaty'],weight_kg:120});
  f.animal('pig','z1',{gender:'female',weight_kg:120,pregnant:{father_uid:father.uid,remaining_ticks:1}});
  if(removeFather) f.ls.slaughterAnimal(father.uid); f.tick();
  return { removeFather, offspring:f.st.animals.filter(a => a.age_ticks === 0).map(a => a.perks) };
}));
probe('litter_inheritance', 'seeded individual random rolls, siblings', () => {
  const f = fixture(); let seed = 912;
  f.ctx.Math.random = () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const father = f.animal('pig','z1',{perks:['meaty','fast_growth','easy_fat'],weight_kg:120});
  f.animal('pig','z1',{gender:'female',perks:['light_eater','hardy'],weight_kg:120,pregnant:{father_uid:father.uid,remaining_ticks:1}});
  f.tick(); return f.st.animals.filter(a => a.age_ticks === 0).map(a => ({gender:a.gender,perks:a.perks}));
});
probe('partial_save', 'legacy/damaged save boundary, not ordinary gameplay', () => {
  const f = fixture(); const saved = structuredClone(f.st); saved.animals=[{uid:'old',species_id:'cattle',zone_id:'z1'}];
  f.ls.setState(saved); f.tick(); const a = f.ls.getState().animals[0];
  return { weightFinite:Number.isFinite(a.weight_kg), hpFinite:Number.isFinite(a.hp), satiety:a.satiety };
});
probe('missing_arms_save', 'legacy/damaged save boundary', () => {
  const f = fixture(); f.ls.setState({zones:{z1:{grass_height:1,pollution:0,compaction:0}},animals:[]});
  try { f.tick(); return { threw:false }; } catch(e) { return { threw:true,message:e.message }; }
});
probe('coop_legacy_wrong_arm', 'legacy animal lacks location_type, coop primary in bottom slot', () => {
  const f = fixture(); f.mount('arm3','bottom','coop'); const a=f.animal('chicken','arm3'); delete a.location_type; delete a.arm_id;
  f.ls.setState(structuredClone(f.st)); return { actualCoopArm:'arm3',migratedArm:f.ls.getState().animals[0].arm_id };
});
probe('fertilizer_references', 'all production and feed template references', () => {
  const refs = new Set(['fertilizer_basic','hus_biogas','hus_insect_powder']);
  Object.values(species).forEach(sp => { (sp.products.living||[]).forEach(p=>refs.add(p.item_id)); ['meat_item_ids','offal_item_ids','byproduct_item_ids'].forEach(k=>(sp.products.slaughter[k]||[]).forEach(id=>refs.add(id))); });
  return { checked:refs.size,missing:[...refs].filter(id=>!items[id]) };
});
probe('climate_cannot_switch_off_on_low_power', 'legal activation with insufficient next-cycle charge', () => {
  const f=fixture(); const c=f.mount('axis','slot2','climate_control'); f.st.power_charge=1;
  const on=f.ls.climateSetMode('sunny'); f.tick(2000);
  return {on,remainingCharge:f.st.power_charge,cooldown:c.mode_switch_cooldown,off:f.ls.climateSetMode('off')};
});
probe('link_source_removed', 'active sowing survives removal of its source partner', () => {
  const f=fixture(); f.mount('arm1','inner','link_schedule'); f.mount('arm2','front','tiller'); f.mount('arm4','cw_side','seeder');
  f.ls.linkScheduleToggleRule('till_seed'); Object.values(f.st.zones).forEach(z=>z.grass_height=0.2);
  f.st.rotation_ticks_remaining=1; f.tick(); const z=f.st.zones.z1;
  const remove=f.ls.dismountModule('arm2','front'); const before=z.grass_height;
  const g=fixture(); g.ls.setState(JSON.parse(JSON.stringify(f.st))); g.ls.getState().zones.z1.link_seed_ticks=0; g.tick(); f.tick();
  return {remove,remainingLinkTicks:z.link_seed_ticks,growthAfterSourceRemoved:z.grass_height-before,growthWithoutLink:g.ls.getState().zones.z1.grass_height-before};
});
probe('milk_at_critical_health', 'mature well-fed female at near-death health', () => {
  const f=fixture(); const a=f.animal('cattle','z1',{gender:'female',hp:0.01}); return f.ls.collectProduct(a.uid,'milk');
});
probe('old_save_keeps_previous_herd', 'real applySnapshot function; unrelated systems and shape validation stubbed', () => {
  const f=fixture(); f.animal('cattle'); const src=read('js/save-system.js');
  const start=src.indexOf('    function applySnapshot(snapshot) {');
  const end=src.indexOf('    // Export / Import Save Code',start);
  if(start<0||end<0) throw Error('save seam not found');
  const empty=()=>{};
  const apply=new Function('global','assertSnapshotShape','getAllModulesForSnapshot','applyAgricultureMapFromSnapshot','applyHideoutWarehouseFromSnapshot',src.slice(start,end)+'\nreturn applySnapshot;')(
    f.ctx,()=>true,()=>({GameTime:{},GameEngine:{},CharacterAttributes:{},Survival:{},InventoryEquipment:{}}),empty,empty);
  const loaded=apply({player:{},time:{totalTicks:0}});
  return {loaded,animalsRetained:f.ls.getState().animals.length};
});
// Every currently declared module at every legal level, including save/continue.
for (const [id,m] of Object.entries(modules)) for(let level=1;level<=5;level++) {
  const f=fixture(); const arm=m.axis_slot?'axis':'arm1'; const slot=m.axis_slot?'slot'+m.axis_slot:Object.keys(m.slots)[0]==='side'?'cw_side':Object.keys(m.slots)[0];
  try { f.mount(arm,slot,id,level); f.tick(3); const g=fixture(); g.ls.setState(JSON.parse(JSON.stringify(f.st))); g.tick(3);
    result.moduleLevels.push({id,level,ok:true});
  } catch(e) { result.moduleLevels.push({id,level,ok:false,error:e.message}); }
}
// Mass conservation and preview/commit consistency across species, health, yield and weight boundaries.
let count=0,failures=[];
for(const kind of Object.keys(species)) for(const hp of [0.01,29.99,30,59.99,60,100]) for(const ps of [[],['meaty'],['lean']]) for(const fraction of [0.001,0.01,0.1,0.25,0.5,0.99999,1]) {
  const f=fixture(), weight=species[kind].growth.fatten_cap_kg*fraction;
  const a=f.animal(kind,kind==='chicken'?'arm1':'z1',{weight_kg:weight,hp,perks:ps});
  const p=f.ls.previewSlaughter(a.uid), r=f.ls.slaughterAnimal(a.uid); count++;
  const mass=(r.items||[]).reduce((n,it)=>n+items[it.item_id].weight_kg*it.count,0);
  if(mass>weight+1e-8 || p.ok!==r.ok || (!r.ok&&!f.st.animals.includes(a))) failures.push({kind,hp,ps,weight,mass});
}
result.massSweep={cases:count,failures};
for(const p of ['js/livestock-state.js','js/livestock-panel.js','js/save-system.js','data/livestock-species.json','data/livestock-modules.json','data/livestock-perks.json']) result.hashes[p]=createHash('sha256').update(read(p)).digest('hex');
result.summary={probes:result.checks.length,probeErrors:result.checks.filter(x=>x.error).length,moduleLevels:result.moduleLevels.length,moduleFailures:result.moduleLevels.filter(x=>!x.ok).length,massCases:count,massFailures:failures.length};
result.summary.retiredProbes=result.checks.filter(x=>x.status==='retired').length;
fs.writeFileSync(new URL(process.argv.includes('--retirement')?'../docs/reference/livestock-comprehensive-after-retirement.json':'../docs/reference/livestock-comprehensive-evidence.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log('SUMMARY '+JSON.stringify(result.summary));
