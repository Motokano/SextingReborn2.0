/**
 * Read-only livestock audit against real runtime/configuration, not a replacement simulator.
 * node tools/audit-livestock-runtime.mjs [--write | --after]
 * --write persists JSON evidence under docs/reference; game code and saves are untouched.
 * --after writes separate post-repair evidence, preserving the historical baseline.
 * Seeded RNG; ordinary fixtures use only public buildModule and valid slot layouts.
 * Deliberate edge fixtures are explicitly identified. Panel probes expose real closures
 * in memory and suppress rendering only; inventory calls use the real inventory module.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p));
const species = json('data/livestock-species.json').species;
const modules = json('data/livestock-modules.json').modules;
const perks = json('data/livestock-perks.json').perks;
const costs = json('data/livestock-build-costs.json').costs;
const crops = json('data/livestock-feed-crops.json').crops;
const items = json('data/items.json');
const runtime = new vm.Script(read('js/livestock-state.js'), { filename: 'livestock-state.js' });
const inventory = new vm.Script(read('js/inventory-equipment.js'), { filename: 'inventory-equipment.js' });
const clone = x => JSON.parse(JSON.stringify(x));
const round = x => Math.round(x * 1e6) / 1e6;
const output = { scope: 'current implementation; proposed advanced-module redesign is not implemented', seed: 9122026,
  sourceHashes: Object.fromEntries(['js/livestock-state.js', 'js/livestock-panel.js', 'js/inventory-equipment.js', 'data/livestock-species.json', 'data/livestock-modules.json', 'data/livestock-perks.json', 'data/items.json'].map(p => [p, createHash('sha256').update(read(p)).digest('hex')])),
  checks: [], combinations: [] };

function env(seed = output.seed) {
  let rng = seed >>> 0;
  const math = Object.create(Math);
  math.random = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const ctx = vm.createContext({ console, Math: math, UIText: { t: (k, v) => k + (v ? JSON.stringify(v) : '') } });
  ctx.window = ctx;
  // Material supply is unlimited for construction fixtures, not treated as free in balance claims.
  ctx.InventoryEquipment = {
    countCarriedItemsByTemplateId: () => 1e6,
    removeCarriedItemsByTemplateId: () => ({ ok: true }),
  };
  runtime.runInContext(ctx);
  const ls = ctx.LivestockState;
  ls.setConfig(clone(species), clone(modules), clone(perks), clone(costs), clone(crops));
  ls.initDemoState();
  const st = ls.getState();
  st.rotation_ticks_remaining = 1000; // one full initial round, instead of UI demo's 862
  st.power_charge = 1e7; // isolate module behavior; no claim about external power sustainability
  return { ctx, ls, st, random: math };
}
function build(e, arm, slot, id, level = 1) {
  const result = e.ls.buildModule(arm, slot, id);
  if (result.reason === 'module_retired') throw Object.assign(new Error('Retired module: ' + id), { code: 'module_retired' });
  assert.equal(result.ok, true, `invalid fixture ${arm}/${slot}/${id}: ${JSON.stringify(result)}`);
  const inst = arm === 'axis' ? e.st.axis[slot] : e.st.arms[arm][slot];
  inst.level = level; // valid upgraded state; no engineering wait needed for a behavior fixture
  return inst;
}
function animal(e, kind, loc, opts = {}) {
  const sp = species[kind];
  const a = {
    uid: `audit_${e.st.animals.length + 1}`, species_id: kind, gender: 'male',
    age_ticks: sp.growth.maturity_ticks || 0,
    weight_kg: sp.growth.graze_cap_kg ?? sp.growth.wean_weight_kg ?? sp.growth.birth_weight_kg,
    satiety: 80, hp: 100, perks: [], pregnant: null, reproduction_cooldown: 0,
    cooldowns: {}, location_type: kind === 'chicken' ? 'coop' : 'zone',
    zone_id: kind === 'chicken' ? null : loc, arm_id: kind === 'chicken' ? loc : null,
    dead: false, death_cause: null, starvation_ticks: 0,
    earth_cry_cooldown: 0, crossbreed_cooldown: 0, pheromone_cooldown: 0,
    ...opts,
  };
  e.st.animals.push(a);
  return a;
}
function tick(e, n, before) {
  for (let i = 0; i < n; i++) { if (before) before(i); e.ls.advanceTick(); }
}
function probe(id, title, fn) {
  let result;
  try { result = fn(); } catch (e) {
    if (e.code !== 'module_retired') throw e;
    output.checks.push({ id, title, status: 'retired', reason: e.message });
    console.log(`RETIRED ${id}: ${e.message}`); return;
  }
  assert.equal(typeof result.issue, 'boolean', `probe must report predicate: ${id}`);
  output.checks.push({ id, title, ...result });
  console.log(`${result.issue ? 'ISSUE' : 'OK'} ${id}: ${JSON.stringify(result.evidence)}`);
}
function realInventory(e, stock = 2) {
  inventory.runInContext(e.ctx);
  const ie = e.ctx.InventoryEquipment;
  ie.setConfig({ items });
  ie.setState({ inventory_pocket: Array.from({ length: stock }, () => ({ item_id: 'herb_maize', count: 1 })), equipment: { clothing: { item_id: 'eq_clothing_combat_suit' } } });
  assert.equal(ie.countCarriedItemsByTemplateId('herb_maize'), stock, 'real inventory fixture');
  return ie;
}
function panelHooks(e) {
  const source = read('js/livestock-panel.js');
  const seam = '  window.LivestockPanel = {';
  assert.equal(source.split(seam).length, 2, 'panel seam changed');
  vm.runInContext(source.replace(seam, `
    render = function () {};
    renderFeedPicker = function () {};
    window.__auditPanel = {
      feed: function (arm, mode, crop) { feedTargetArm = arm; feedPickerMode = mode; doFeedCrop(crop); return feedbackMsg; },
      chicken: doFeedChickens
    };
${seam}`), e.ctx, { filename: 'livestock-panel.js (audit closure seam)' });
  return e.ctx.__auditPanel;
}

probe('slaughter_mass', 'Newborn slaughter versus real item mass', () => {
  const evidence = [];
  for (const id of Object.keys(species)) {
    const e = env();
    build(e, 'axis', 'slot1', 'slaughter');
    if (id === 'chicken') build(e, 'arm1', 'inner', 'coop');
    const a = animal(e, id, id === 'chicken' ? 'arm1' : 'z1', { age_ticks: 0, weight_kg: species[id].growth.birth_weight_kg });
    const r = e.ls.slaughterAnimal(a.uid);
    if (!r.ok && r.reason === 'slaughter_underweight') {
      assert(e.st.animals.includes(a), 'rejected slaughter must preserve animal');
      evidence.push({ species: id, liveKg: a.weight_kg, productKg: 0, rejected: r.reason, minimumKg: r.minimum_weight_kg });
      continue;
    }
    assert(r.ok);
    const missing = r.items.filter(p => !items[p.item_id] || !Number.isFinite(items[p.item_id].weight_kg));
    assert.equal(missing.length, 0, 'product item mass missing');
    const kg = r.items.reduce((sum, p) => sum + items[p.item_id].weight_kg * p.count, 0);
    evidence.push({ species: id, liveKg: a.weight_kg, productKg: round(kg), ratio: round(kg / a.weight_kg), items: r.items });
  }
  return { issue: evidence.some(r => r.productKg > r.liveKg), evidence };
});

probe('sick_slaughter', 'Healthy and critically ill cattle yield the same meat', () => {
  const counts = [100, 45, 20].map(hp => {
    const e = env(); build(e, 'axis', 'slot1', 'slaughter');
    const a = animal(e, 'cattle', 'z1', { hp, weight_kg: 600 });
    return { hp, meat: e.ls.slaughterAnimal(a.uid).items[0].count };
  });
  return { issue: counts[0].meat === counts[2].meat, evidence: counts };
});

probe('juvenile_milk', 'Milk can be collected from a newborn male calf', () => {
  const e = env(); const a = animal(e, 'cattle', 'z1', { age_ticks: 0, weight_kg: 4.5 });
  const result = e.ls.collectProduct(a.uid, 'milk');
  return { issue: result.ok === true, evidence: { gender: a.gender, age: a.age_ticks, result } };
});

probe('free_chicken_feed', 'Panel hand-feeding has no resource or world-time cost', () => {
  const e = env(); build(e, 'arm1', 'inner', 'coop');
  const a = animal(e, 'chicken', 'arm1', { satiety: 0 });
  const ie = realInventory(e, 2); const hooks = panelHooks(e);
  const before = clone(ie.getState()); const rotation = e.st.rotation_ticks_remaining;
  for (let i = 0; i < 5; i++) hooks.chicken('arm1');
  const unchanged = JSON.stringify(before) === JSON.stringify(ie.getState());
  return { issue: a.satiety === 100 && unchanged && rotation === e.st.rotation_ticks_remaining,
    evidence: { clicks: 5, satietyBefore: 0, satietyAfter: a.satiety, inventoryUnchanged: unchanged, elapsedTicks: rotation - e.st.rotation_ticks_remaining,
      seam: 'real panel handler and real inventory; rendering suppressed; no real browser interaction' } };
});

probe('process_inventory', 'Actual processing panel consumes a crop then fails at an absent inventory API', () => {
  const e = env(); const p = build(e, 'arm1', 'inner', 'feed_preprocess');
  build(e, 'arm1', 'cw_side', 'feed_trough');
  const ie = realInventory(e, 2); const apiPresent = typeof ie.takeItemFromDefaultContainer === 'function';
  const before = ie.countCarriedItemsByTemplateId('herb_maize');
  const feedback = panelHooks(e).feed('arm1', 'process', 'herb_maize');
  const after = ie.countCarriedItemsByTemplateId('herb_maize');
  const queued = (p.input_queue || []).reduce((n, q) => n + q.count, 0);
  return { issue: after < before && queued === 0, evidence: { before, after, queued, apiPresent, feedback } };
});

probe('full_direct_feed', 'Direct feeding a full trough still consumes inventory', () => {
  const e = env(); const t = build(e, 'arm1', 'cw_side', 'feed_trough'); t.feed_units = 100;
  const ie = realInventory(e, 2); const feedback = panelHooks(e).feed('arm1', 'feed', 'herb_maize');
  return { issue: ie.countCarriedItemsByTemplateId('herb_maize') === 1 && t.feed_units === 100,
    evidence: { cropsBefore: 2, cropsAfter: ie.countCarriedItemsByTemplateId('herb_maize'), troughBefore: 100, troughAfter: t.feed_units, feedback } };
});

probe('processor_overflow', 'Existing queued feed is consumed with no output capacity', () => {
  const evidence = [false, true].map(withTrough => {
    const e = env(); const p = build(e, 'arm1', 'inner', 'feed_preprocess');
    const t = withTrough ? build(e, 'arm1', 'cw_side', 'feed_trough') : null;
    if (t) t.feed_units = 100;
    p.input_queue = [{ item_id: 'herb_maize', nutrition: 10, count: 10 }]; // persisted queue; input API is separately tested
    tick(e, 10);
    return { withTrough, queuedBefore: 10, queuedAfter: p.input_queue.reduce((s, q) => s + q.count, 0), outputIncrease: t ? t.feed_units - 100 : 0, cache: p.refine_cache };
  });
  return { issue: evidence.every(r => r.queuedAfter === 0 && r.outputIncrease === 0), evidence };
});

probe('refiner_no_receiver', 'Refiner occupies the only currently buildable side trough slot', () => {
  const e = env(); build(e, 'arm1', 'inner', 'feed_refine');
  const cw = e.ls.canBuildModule('arm1', 'cw_side', 'feed_trough');
  const ccw = e.ls.canBuildModule('arm1', 'ccw_side', 'feed_trough');
  return { issue: !cw.ok && !ccw.ok, evidence: { cw, ccw } };
});

probe('pig_free_maintenance', 'Unfed pigs retain mass and do not uproot grass', () => {
  const e = env(); e.st.zones.z1 = { grass_height: 1, compaction: 50, pollution: 20 };
  const a = animal(e, 'pig', 'z1', { weight_kg: 120, satiety: 10 });
  tick(e, 900);
  return { issue: a.weight_kg === 120 && e.st.zones.z1.grass_height > 1,
    evidence: { ticks: 900, animal: { weight: a.weight_kg, satiety: round(a.satiety), dead: a.dead }, zone: e.st.zones.z1 } };
});

probe('finished_pig_feed', 'A full-weight pig still spends the growth ration', () => {
  const e = env(); const t = build(e, 'arm4', 'cw_side', 'feed_trough'); t.feed_units = 100;
  const a = animal(e, 'pig', 'z1', { weight_kg: 120, satiety: 100 }); tick(e, 1);
  return { issue: a.weight_kg === 120 && 100 - t.feed_units > 0.05,
    evidence: { feedSpent: round(100 - t.feed_units), weightBefore: 120, weightAfter: a.weight_kg } };
});

probe('sheep_chicken_nutrition', 'Three sheep cannot maintain five chickens even with abundant pollution on both sides', () => {
  const e = env(); build(e, 'arm1', 'inner', 'coop');
  for (const z of Object.values(e.st.zones)) { z.pollution = 80; z.grass_height = 0.5; }
  for (let i = 0; i < 3; i++) animal(e, 'sheep', 'z1');
  const chickens = Array.from({ length: 5 }, () => animal(e, 'chicken', 'arm1'));
  tick(e, 1000);
  const evidence = chickens.map(a => ({ satietyBefore: 80, satietyAfter: round(a.satiety), weightAfter: round(a.weight_kg) }));
  return { issue: chickens.every(a => a.satiety < 80), evidence,
    qualification: 'A favorable food-availability fixture, not a claim that the sheep herd survives long-term at pollution 80.' };
});

probe('chicken_capacity', 'Chickens keep cleaning after their occupied coop is dismantled', () => {
  const e = env(); build(e, 'arm1', 'inner', 'coop'); animal(e, 'chicken', 'arm1');
  e.st.zones.z1.pollution = 20; e.st.zones.z2.pollution = 20;
  const result = e.ls.dismountModule('arm1', 'inner'); tick(e, 1);
  return { issue: result.ok && e.st.zones.z1.pollution < 20,
    evidence: { dismantle: result, coopRemaining: e.st.arms.arm1.inner, pollutionBefore: [20, 20], pollutionAfter: [e.st.zones.z1.pollution, e.st.zones.z2.pollution] } };
});

probe('feed_order', 'Identical animals receive different feed based on insertion order', () => {
  function run(reverse) {
    const e = env(); const t = build(e, 'arm4', 'cw_side', 'feed_trough');
    const a = animal(e, 'cattle', 'z1', { uid: 'A' }); const b = animal(e, 'cattle', 'z1', { uid: 'B' });
    if (reverse) e.st.animals.reverse();
    tick(e, 1000, () => { t.feed_units = 0.72; }); // resource-limited equal daily allocation, 720 total supplied
    return { order: reverse ? 'B,A' : 'A,B', A: round(a.weight_kg), B: round(b.weight_kg) };
  }
  const evidence = [run(false), run(true)];
  return { issue: evidence[0].A !== evidence[1].A, evidence };
});

probe('pollution_order', 'Sheep/pig update order changes pollution at the zero boundary', () => {
  function run(reverse) {
    const e = env(); animal(e, 'sheep', 'z1'); animal(e, 'pig', 'z1'); animal(e, 'pig', 'z1');
    if (reverse) e.st.animals.reverse(); tick(e, 1);
    return round(e.st.zones.z1.pollution);
  }
  const evidence = { sheepFirst: run(false), pigsFirst: run(true) };
  return { issue: evidence.sheepFirst !== evidence.pigsFirst, evidence };
});

probe('warehouse_capacity', 'Warehouse counts item types, allowing hundreds of physical products in one slot', () => {
  const e = env(); build(e, 'arm1', 'front', 'auto_collect'); build(e, 'axis', 'slot2', 'warehouse_hub');
  for (let i = 0; i < 51; i++) animal(e, 'cattle', 'z1', { gender: 'female', cooldowns: { blood: 1000 } });
  tick(e, 1); const cache = e.ls.getWarehouseHub().cache.items;
  return { issue: cache.hus_milk_buffalo > e.ls.getWarehouseCapacity(),
    evidence: { physicalProducts: cache.hus_milk_buffalo, declaredCapacity: e.ls.getWarehouseCapacity(), reportedUsage: e.ls.getWarehouseUsage(), fixture: 'density edge case; no configured zone animal cap' } };
});

probe('warehouse_full_loss', 'At full distinct-key capacity, collected output is lost rather than sent to the backpack', () => {
  const e = env(); build(e, 'arm1', 'front', 'auto_collect'); const h = build(e, 'axis', 'slot2', 'warehouse_hub');
  h.cache = { items: Object.fromEntries(Object.keys(items).slice(0, 50).map(k => [k, 1])) };
  const a = animal(e, 'cattle', 'z1', { gender: 'female', cooldowns: { blood: 1000 } });
  const before = clone(h.cache.items); tick(e, 1);
  const pending = e.ls.drainAutoCollectItems();
  return { issue: a.cooldowns.milk > 0 && JSON.stringify(before) === JSON.stringify(h.cache.items) && pending.length === 0,
    evidence: { milkCooldown: a.cooldowns.milk, cacheUnchanged: JSON.stringify(before) === JSON.stringify(h.cache.items), pending },
    qualification: 'Injected boundary state: current four species do not naturally supply 50 distinct living product types.' };
});

probe('climate_cooldown', 'Climate mode cooldown does not advance', () => {
  const e = env(); const tower = build(e, 'axis', 'slot2', 'climate_control');
  const first = e.ls.climateSetMode('sunny'); tick(e, 2001); const second = e.ls.climateSetMode('shade');
  return { issue: !second.ok && tower.mode_switch_cooldown === 2000, evidence: { first, elapsed: 2001, second } };
});

probe('link_seed_duration', 'Link sowing can run without source/executor modules and lasts only one tick', () => {
  const e = env(); build(e, 'arm1', 'inner', 'link_schedule');
  e.ls.linkScheduleToggleRule('till_seed'); e.st.rotation_ticks_remaining = 1;
  for (const z of Object.values(e.st.zones)) z.grass_height = 0.2;
  const before = e.st.zones.z1.grass_height; tick(e, 1); const once = e.st.zones.z1.grass_height;
  tick(e, 1); const twice = e.st.zones.z1.grass_height;
  return { issue: round(once - before) === 0.0012 && round(twice - once) === 0.0008,
    evidence: { firstTickGrowth: round(once - before), nextTickGrowth: round(twice - once), installed: ['link_schedule'] } };
});

probe('link_collect', 'Clean-collect spends scheduling points without collecting a ready animal', () => {
  const e = env(); const link = build(e, 'arm1', 'inner', 'link_schedule');
  build(e, 'arm2', 'inner', 'coop'); build(e, 'arm4', 'front', 'auto_collect');
  const a = animal(e, 'cattle', 'z2', { gender: 'female' }); // in link reach, outside normal collector reach before/after rotation
  e.ls.linkScheduleToggleRule('clean_collect'); e.st.rotation_ticks_remaining = 1; tick(e, 1);
  const pending = e.ls.drainAutoCollectItems();
  return { issue: pending.length === 0 && !a.cooldowns.milk && link.dispatch === 0,
    evidence: { pending, cooldowns: a.cooldowns, pointsRemaining: link.dispatch } };
});

probe('waste_heat_netting', 'Simultaneous manure generation hides actual cleaning from recovery', () => {
  function run(withSheep) {
    const e = env(); const heat = build(e, 'arm1', 'inner', 'waste_heat_recycle');
    e.st.zones.z1.pollution = 20;
    if (withSheep) animal(e, 'sheep', 'z1'); animal(e, 'pig', 'z1'); tick(e, 1);
    return { recoveredPoints: heat.points, finalPollution: round(e.st.zones.z1.pollution) };
  }
  const evidence = { pigOnly: run(false), samePigPlusSheep: run(true), pigCleaningBothCases: 0.01 };
  return { issue: evidence.pigOnly.recoveredPoints > 0 && evidence.samePigPlusSheep.recoveredPoints === 0, evidence };
});

probe('multiple_heat_arms', 'Only the first heat arm recovers; both consume power', () => {
  const e = env(); const a = build(e, 'arm1', 'inner', 'waste_heat_recycle'); const b = build(e, 'arm3', 'inner', 'waste_heat_recycle');
  animal(e, 'pig', 'z1'); animal(e, 'pig', 'z3');
  e.st.zones.z1.pollution = 20; e.st.zones.z3.pollution = 20; tick(e, 1);
  return { issue: a.points > 0 && !(b.points > 0), evidence: { arm1Points: a.points, arm3Points: b.points || 0, drain: e.ls.currentPowerDrainPerTick() } };
});

probe('starving_pig_birth', 'A zero-satiety, birth-weight pig can reproduce after age-based maturity', () => {
  const e = env(); e.random.random = () => 0; // forced success isolates eligibility, not probability/frequency
  animal(e, 'pig', 'z1', { weight_kg: 0.9, satiety: 0 });
  const mother = animal(e, 'pig', 'z1', { gender: 'female', weight_kg: 0.9, satiety: 0 });
  tick(e, 1); const pregnant = !!mother.pregnant;
  tick(e, 2040);
  return { issue: pregnant && e.st.animals.length > 2,
    evidence: { motherWeight: mother.weight_kg, motherSatiety: mother.satiety, pregnantAfterFirstTick: pregnant, animalsAfter2041Ticks: e.st.animals.length },
    qualification: 'Eligibility boundary with forced random success; not a measurement of average population growth.' };
});

probe('hermaphrodite_activation', 'Carrying hermaphrodite does not give either-sex behavior', () => {
  const e = env(); e.random.random = () => 0;
  const a = animal(e, 'cattle', 'z1', { gender: 'female', perks: ['hermaphrodite'] }); tick(e, 1);
  const b = animal(e, 'cattle', 'z2', { gender: 'hermaphrodite', perks: ['hermaphrodite', 'high_yield'] });
  const mult = e.ls.getModifier(b, 'product_cooldown_mult_milk');
  return { issue: !a.pregnant || mult === 1,
    evidence: { carrierGender: a.gender, carrierSelfPregnant: !!a.pregnant, explicitHermaphroditeHighYieldMultiplier: mult, expectedHighYieldMultiplier: 0.7 } };
});

// Checks that should hold, included to distinguish real issues from intentional scarcity.
probe('rotation_invariant', 'Synchronous rotation preserves relative animal/trough service and restores geometry after four turns', () => {
  const e = env(); build(e, 'arm4', 'cw_side', 'feed_trough');
  const a = animal(e, 'pig', 'z1'); const arm = clone(e.st.arm_zones); let stable = true;
  for (let i = 0; i < 4; i++) { tick(e, 1000); stable &&= e.ls.findTroughForZone(a.zone_id) === e.st.arms.arm4.cw_side; }
  return { issue: !stable || JSON.stringify(arm) !== JSON.stringify(e.st.arm_zones), evidence: { stableService: stable, animalZoneAfter4000: a.zone_id, geometryRestored: JSON.stringify(arm) === JSON.stringify(e.st.arm_zones) } };
});

probe('cattle_prepare_sheep', 'Two cows leave grass above the sheep feeding ceiling at the first handover', () => {
  const evidence = [2, 3, 4].map(count => {
    const e = env();
    for (let i = 0; i < count; i++) animal(e, 'cattle', 'z1');
    tick(e, 1000);
    return { cattle: count, handoverGrass: round(e.st.zones.z1.grass_height), sheepCanGraze: e.st.zones.z1.grass_height <= 0.8 };
  });
  return { issue: !evidence[0].sheepCanGraze, evidence,
    qualification: 'Design/balance lock, not a floating-point bug. Initial grass 1.5 m and compaction 0; no mowing module.' };
});

probe('roundtrip_state', 'Serialization and reload preserve a deterministic mixed-herd continuation', () => {
  function run(reload) {
    const e = env(); build(e, 'arm1', 'inner', 'coop');
    animal(e, 'pig', 'z1'); animal(e, 'cattle', 'z2'); animal(e, 'chicken', 'arm1');
    tick(e, 500);
    if (reload) { e.ls.setState(clone(e.ls.getState())); e.st = e.ls.getState(); }
    tick(e, 500); return clone(e.ls.getState());
  }
  const a = run(false), b = run(true);
  const differences = [];
  function compare(x, y, p = '') {
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) compare(x[k], y[k], `${p}.${k}`);
    } else if (x !== y) differences.push({ path: p, before: x, after: y });
  }
  compare(a, b);
  // Reload adds harmless defaults to shadow slot markers, which never execute.
  const behaviorDifferences = differences.filter(d => !(b.arms.arm1.bottom.shadow === true && d.before === undefined && (
    (d.path === '.arms.arm1.bottom.level' && d.after === 1) ||
    (d.path === '.arms.arm1.bottom.upgrading_remaining' && d.after === 0)
  )));
  const same = behaviorDifferences.length === 0;
  return { issue: !same, evidence: { behaviorEqualAfter1000Ticks: same, checkpointTick: 500, migrationMetadataDifferences: differences, behaviorDifferences },
    qualification: 'Runtime JSON roundtrip only, not a browser SaveSystem end-to-end test or general RNG serialization proof.' };
});

probe('pig_growth_perk', 'Early growth perk is inactive on pig feed-based growth', () => {
  const evidence = [[], ['fast_growth'], ['easy_fat']].map(ps => {
    const e = env(); const t = build(e, 'arm4', 'cw_side', 'feed_trough'); t.feed_units = 100;
    const a = animal(e, 'pig', 'z1', { perks: ps, weight_kg: 30, satiety: 100 }); tick(e, 1);
    return { perks: ps, growthKg: round(a.weight_kg - 30) };
  });
  return { issue: evidence[0].growthKg === evidence[1].growthKg, evidence };
});

probe('unfed_pig_population', 'Unfed breeding pigs grow their population across seeded runs', () => {
  const evidence = [];
  for (let seed = 1; seed <= 8; seed++) {
    const e = env(seed); animal(e, 'pig', 'z1'); animal(e, 'pig', 'z1', { gender: 'female' });
    tick(e, 12000);
    evidence.push({ seed, initialAnimals: 2, finalAnimals: e.st.animals.length,
      newbornOrUnfedWeightAnimals: e.st.animals.filter(a => a.weight_kg === 0.9).length,
      dead: e.st.animals.filter(a => a.dead).length, suppliedFeed: 0 });
  }
  return { issue: evidence.every(r => r.finalAnimals > 2), evidence,
    qualification: 'Biological/resource-budget risk; nutrition-free gestation is permitted by current eligibility rules. Does not measure infinite growth.' };
});

probe('chicken_food_budget_control', 'With no pollution and no feed chicken satiety declines and starvation occurs', () => {
  const e = env(); build(e, 'arm1', 'inner', 'coop');
  const a = animal(e, 'chicken', 'arm1'); let deathTick = null;
  for (let t = 1; t <= 3000; t++) { e.ls.advanceTick(); if (a.dead) { deathTick = t; break; } }
  return { issue: !a.dead || a.death_cause !== 'starvation', evidence: { deathTick, cause: a.death_cause, initialSatiety: 80 } };
});

probe('processor_not_full_control', 'Queued maize transfers to a trough with space', () => {
  const e = env(); const p = build(e, 'arm1', 'inner', 'feed_preprocess'); const t = build(e, 'arm1', 'cw_side', 'feed_trough');
  p.input_queue = [{ item_id: 'herb_maize', nutrition: 10, count: 10 }]; tick(e, 10);
  const remaining = p.input_queue.reduce((n, x) => n + x.count * x.nutrition / 10, 0) + (p.processing_units || 0);
  return { issue: t.feed_units !== 5 || Math.abs(remaining + t.feed_units - 10) > 1e-9,
    evidence: { initialFeedEquivalent: 10, ticks: 10, configuredThroughput: 0.5, remainingFeedEquivalent: remaining, feedReceived: t.feed_units },
    qualification: 'Post-repair control uses configured level-1 throughput, checks conservation including partially processed input. Baseline evidence retains the historical 10-units expectation.' };
});

probe('cleaning_upgrade_control', 'A stronger cleaning brush removes more pollution', () => {
  const evidence = [1, 5].map(level => {
    const e = env(); build(e, 'arm1', 'bottom', 'clean_brush', level);
    e.st.zones.z1.pollution = 50; tick(e, 900);
    return { level, pollutionRemoved: round(50 - e.st.zones.z1.pollution) };
  });
  return { issue: evidence[1].pollutionRemoved <= evidence[0].pollutionRemoved, evidence };
});

function summarize(e) {
  const bySpecies = {};
  for (const kind of Object.keys(species)) {
    const aa = e.st.animals.filter(a => a.species_id === kind); if (!aa.length) continue;
    const live = aa.filter(a => !a.dead);
    bySpecies[kind] = {
      live: live.length, total: aa.length,
      satiety: live.length ? [round(Math.min(...live.map(a => a.satiety))), round(Math.max(...live.map(a => a.satiety)))] : null,
      weightKg: round(live.reduce((n, a) => n + a.weight_kg, 0)),
      hpMin: live.length ? round(Math.min(...live.map(a => a.hp))) : null,
      causes: aa.filter(a => a.dead).map(a => a.death_cause),
    };
  }
  return { bySpecies, zones: clone(e.st.zones) };
}
const scenarios = [
  { id: 'cattle_2', animals: [['cattle', 2, 'z1']] },
  { id: 'sheep_3_tall_start', animals: [['sheep', 3, 'z1']] },
  { id: 'pig_2', animals: [['pig', 2, 'z1']] },
  { id: 'cattle2_sheep3_same_zone', animals: [['cattle', 2, 'z1'], ['sheep', 3, 'z1']] },
  { id: 'sheep3_chicken5', animals: [['sheep', 3, 'z1'], ['chicken', 5, 'arm1']], coop: 'arm1', grass: 0.5 },
  { id: 'sheep3_pig2_chicken5', animals: [['sheep', 3, 'z1'], ['pig', 2, 'z1'], ['chicken', 5, 'arm1']], coop: 'arm1', grass: 0.5 },
  { id: 'full_following_rotation', animals: [['cattle', 2, 'z1'], ['sheep', 3, 'z4'], ['pig', 2, 'z3'], ['chicken', 5, 'arm4']], coop: 'arm4' },
  { id: 'full_opposite_order', animals: [['cattle', 2, 'z1'], ['sheep', 3, 'z2'], ['pig', 2, 'z3'], ['chicken', 5, 'arm1']], coop: 'arm1' },
  { id: 'full_following_plus_feed', animals: [['cattle', 2, 'z1'], ['sheep', 3, 'z4'], ['pig', 2, 'z3'], ['chicken', 5, 'arm4']], coop: 'arm4', feed: true },
  { id: 'full_following_feed_clean', animals: [['cattle', 2, 'z1'], ['sheep', 3, 'z4'], ['pig', 2, 'z3'], ['chicken', 5, 'arm4']], coop: 'arm4', feed: true, cleaning: true },
  { id: 'full_prepared_start', animals: [['cattle', 2, 'z1'], ['sheep', 3, 'z4'], ['pig', 2, 'z3'], ['chicken', 5, 'arm4']], coop: 'arm4', feed: true, grass: 0.5 },
  { id: 'full_three_cattle_feed', animals: [['cattle', 3, 'z1'], ['sheep', 3, 'z4'], ['pig', 2, 'z3'], ['chicken', 5, 'arm4']], coop: 'arm4', feed: true },
  { id: 'full_four_cattle_feed', animals: [['cattle', 4, 'z1'], ['sheep', 3, 'z4'], ['pig', 2, 'z3'], ['chicken', 5, 'arm4']], coop: 'arm4', feed: true },
  { id: 'full_feed_auto_maintenance', animals: [['cattle', 2, 'z1'], ['sheep', 3, 'z4'], ['pig', 2, 'z3'], ['chicken', 5, 'arm4']], coop: 'arm4', feed: true, cleaning: true, auto: true },
  { id: 'three_cattle_feed_auto', animals: [['cattle', 3, 'z1'], ['sheep', 3, 'z4'], ['pig', 2, 'z3'], ['chicken', 5, 'arm4']], coop: 'arm4', feed: true, cleaning: true, auto: true },
  { id: 'low_density_prepared', animals: [['cattle', 3, 'z1'], ['sheep', 1, 'z4'], ['pig', 1, 'z3'], ['chicken', 5, 'arm4']], coop: 'arm4', feed: true, grass: 0.5, cleaning: true },
  { id: 'low_density_prepared_40k', animals: [['cattle', 3, 'z1'], ['sheep', 1, 'z4'], ['pig', 1, 'z3'], ['chicken', 5, 'arm4']], coop: 'arm4', feed: true, grass: 0.5, cleaning: true, duration: 40000 },
  { id: 'three_cattle_feed_40k', animals: [['cattle', 3, 'z1'], ['sheep', 3, 'z4'], ['pig', 2, 'z3'], ['chicken', 5, 'arm4']], coop: 'arm4', feed: true, duration: 40000 },
];
for (const scenario of scenarios) {
  const e = env();
  if (scenario.coop) build(e, scenario.coop, 'inner', 'coop');
  if (scenario.grass != null) for (const z of Object.values(e.st.zones)) z.grass_height = scenario.grass;
  for (const [kind, count, loc] of scenario.animals) for (let i = 0; i < count; i++) animal(e, kind, loc);
  const troughs = [];
  if (scenario.feed) for (const arm of Object.keys(e.st.arms)) troughs.push(build(e, arm, 'cw_side', 'feed_trough'));
  if (scenario.cleaning) {
    build(e, 'arm1', 'bottom', 'clean_brush', 5);
    build(e, 'arm2', 'bottom', 'clean_brush', 5);
    build(e, 'arm3', 'bottom', 'clean_brush', 5);
  }
  if (scenario.auto) for (const arm of Object.keys(e.st.arms)) build(e, arm, 'front', 'auto_collect', 4);
  const duration = scenario.duration || 12000;
  const result = { id: scenario.id, setup: scenario, ticks: duration, seed: output.seed, checkpoints: [], firstDeath: null, feedSupplied: 0, finiteAndBounded: true, autoCollected: {}, disappearedAnimals: [] };
  for (let t = 1; t <= duration; t++) {
    // Idealized continuous feed boundary isolates animal/ecology behavior; crop logistics tested separately.
    for (const tr of troughs) { result.feedSupplied += 100 - (tr.feed_units || 0); tr.feed_units = 100; }
    const beforeAnimals = e.st.animals.map(a => a.uid);
    e.ls.advanceTick();
    for (const id of beforeAnimals) if (!e.st.animals.some(a => a.uid === id)) result.disappearedAnimals.push({ id, tick: t });
    for (const product of e.ls.drainAutoCollectItems()) result.autoCollected[product.item_id] = (result.autoCollected[product.item_id] || 0) + product.count;
    if (!result.firstDeath && e.st.animals.some(a => a.dead)) result.firstDeath = { tick: t, species: e.st.animals.filter(a => a.dead).map(a => a.species_id) };
    for (const a of e.st.animals) if (![a.satiety, a.hp, a.weight_kg].every(Number.isFinite) || a.satiety < 0 || a.satiety > 100 || a.hp < 0 || a.hp > 100 || a.weight_kg < 0) result.finiteAndBounded = false;
    for (const z of Object.values(e.st.zones)) if (![z.grass_height, z.compaction, z.pollution].every(Number.isFinite) || z.grass_height < 0 || z.grass_height > 1.5 || z.compaction < 0 || z.compaction > 100 || z.pollution < 0 || z.pollution > 100) result.finiteAndBounded = false;
    if (t % 1000 === 0) result.checkpoints.push({ tick: t, ...summarize(e) });
  }
  result.feedSupplied = round(result.feedSupplied);
  result.finalFeedStored = round(troughs.reduce((n, tr) => n + (tr.feed_units || 0), 0));
  result.final = summarize(e);
  output.combinations.push(result);
  console.log(`COMBO ${scenario.id}: ${JSON.stringify({ firstDeath: result.firstDeath, feedSupplied: result.feedSupplied, bounded: result.finiteAndBounded, final: result.final.bySpecies })}`);
}
output.summary = { probes: output.checks.length, issuePredicatesObserved: output.checks.filter(c => c.issue).length, combinations: output.combinations.length,
  totalCombinationTicks: output.combinations.reduce((n, c) => n + c.ticks, 0), durations: [...new Set(output.combinations.map(c => c.ticks))], allCombinationsFiniteAndBounded: output.combinations.every(c => c.finiteAndBounded) };
output.summary.retiredProbes = output.checks.filter(c => c.status === 'retired').length;
if (process.argv.includes('--write') || process.argv.includes('--after') || process.argv.includes('--retirement')) {
  const dest = path.join(root, process.argv.includes('--retirement') ? 'docs/reference/livestock-runtime-after-retirement.json' : process.argv.includes('--after') ? 'docs/reference/livestock-runtime-after-integrity.json' : 'docs/reference/livestock-runtime-audit-results.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(output, null, 2) + '\n');
  console.log(`Evidence: ${dest}`);
}
console.log(JSON.stringify(output.summary));
