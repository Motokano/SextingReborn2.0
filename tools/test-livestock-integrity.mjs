// Resource-budget regression tests against the production runtime.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fixture, species, items, read } from './lib/livestock-test-fixture.mjs';
let failed = 0;
function test(name, fn) { try { fn(); console.log('PASS ' + name); } catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); } }
test('slaughter never generates more mass than the animal, including newborns and yield perks', () => {
  for (const kind of Object.keys(species)) for (const w of [species[kind].growth.birth_weight_kg, species[kind].growth.fatten_cap_kg]) {
    const f = fixture(); f.mount('axis', 'slot1', 'slaughter'); if (kind === 'chicken') f.mount('arm1', 'inner', 'coop');
    const a = f.animal(kind, kind === 'chicken' ? 'arm1' : 'z1', { weight_kg: w, perks: ['meaty'] });
    const r = f.ls.slaughterAnimal(a.uid);
    if (w === species[kind].growth.birth_weight_kg) {
      assert.equal(r.ok, false); assert.equal(r.reason, 'slaughter_underweight'); assert(f.st.animals.includes(a)); continue;
    }
    assert(r.ok);
    const mass = r.items.reduce((n, it) => n + items[it.item_id].weight_kg * it.count, 0);
    assert(mass <= w + 1e-9, `${kind}: ${w} -> ${mass}`);
  }
});
test('milk requires accumulated production; even a mature female starts empty', () => {
  const f = fixture(); const calf = f.animal('cattle', 'z1', { weight_kg: 4.5, age_ticks: 0 });
  assert.equal(f.ls.collectProduct(calf.uid, 'milk').ok, false);
  const cow = f.animal('cattle', 'z1', { gender: 'female' }); assert.equal(f.ls.collectProduct(cow.uid, 'milk').ok, false);
  cow.production_buffers = { milk: 1 }; assert(f.ls.collectProduct(cow.uid, 'milk').ok);
});
test('full trough rejects crops before inventory deduction', () => {
  const f = fixture(); const t = f.mount('arm1', 'cw_side', 'feed_trough'); t.feed_units = 100;
  const r = f.ls.addFeedToTrough('arm1', 'herb_maize', 1); assert.equal(r.ok, false);
  assert.equal(f.ie.countCarriedItemsByTemplateId('herb_maize'), 2);
});
test('processing uses real inventory once and pauses at full receiver', () => {
  const f = fixture(); const p = f.mount('arm1', 'inner', 'feed_preprocess'); const t = f.mount('arm1', 'cw_side', 'feed_trough');
  assert(f.ls.feedProcessInput('arm1', 'herb_maize', 1).ok); assert.equal(f.ie.countCarriedItemsByTemplateId('herb_maize'), 1);
  t.feed_units = 100; f.tick(10); assert.equal(p.input_queue[0].count, 1);
  t.feed_units = 0; f.tick(10); assert.equal(p.input_queue.length, 0); assert.equal(t.feed_units, 1);
});
test('opposite side trough can feed the opposite zone beside a refiner', () => {
  const f = fixture(); f.mount('arm1', 'inner', 'feed_refine'); const t = f.mount('arm1', 'ccw_side', 'feed_trough');
  assert.equal(f.ls.findTroughForZone('z1'), t);
});
test('equally hungry cattle share insufficient growth feed independently of array order', () => {
  function run(reverse) {
    const f = fixture(); const t = f.mount('arm4', 'cw_side', 'feed_trough');
    const a = f.animal('cattle'), b = f.animal('cattle'); if (reverse) f.st.animals.reverse();
    for (let i = 0; i < 100; i++) { t.feed_units = 0.72; f.tick(); }
    assert(Math.abs(a.weight_kg - b.weight_kg) < 1e-9); return a.weight_kg;
  }
  assert.equal(run(false), run(true));
});
test('unfed pig loses weight, roots grass, and cannot breed at birth weight', () => {
  const f = fixture(); f.ctx.Math.random = () => 0;
  const a = f.animal('pig', 'z1', { weight_kg: 120, satiety: 10 });
  const b = f.animal('pig', 'z1', { gender: 'female', weight_kg: 0.9, satiety: 0 }); f.tick(100);
  assert(a.weight_kg < 120); assert(f.st.zones.z1.grass_height < 1.5); assert(!b.pregnant); assert(a.satiety < 10); assert(b.hp < 100);
});
test('full-weight pig does not consume growth ration', () => {
  const f = fixture(); const t = f.mount('arm4', 'cw_side', 'feed_trough'); t.feed_units = 100;
  const a = f.animal('pig', 'z1', { weight_kg: 120, satiety: 100 });
  const maintenance = f.ls.getAnimalLoad(a.uid).maintenance; f.tick(); assert(Math.abs(100 - t.feed_units - maintenance / 10) < 1e-9);
});
test('chicken hand feeding cannot create food and occupied coops cannot be removed', () => {
  const f = fixture(); f.mount('arm1', 'inner', 'coop'); const a = f.animal('chicken', 'arm1', { satiety: 0 });
  const r = f.ls.feedChickens('arm1'); assert.equal(r.ok, false); assert.equal(a.satiety, 0);
  assert.equal(f.ls.dismountModule('arm1', 'inner').ok, false);
});
test('chicken nutrition can maintain satiety using sufficient actual pollution', () => {
  const f = fixture(); f.mount('arm1', 'inner', 'coop');
  for (const z of Object.values(f.st.zones)) z.pollution = 80;
  const birds = Array.from({ length: 5 }, () => f.animal('chicken', 'arm1', { weight_kg: 0.05 }));
  f.tick(1000); for (const a of birds) { assert(a.satiety >= 79.9); assert(a.weight_kg > 0.05); }
});
test('warehouse overflow is delivered instead of discarded', () => {
  const f = fixture(); f.mount('arm1', 'front', 'auto_collect'); const h = f.mount('axis', 'slot2', 'warehouse_hub');
  h.cache = { items: { hus_milk_buffalo: 50 } };
  const a = f.animal('cattle', 'z1', { gender: 'female', cooldowns: { blood: 100 }, production_buffers: { milk: 1 } }); f.tick();
  assert.equal(f.ls.getWarehouseUsage(), 50); assert(a.production_buffers.milk < 1);
  assert(f.ls.drainAutoCollectItems().some(x => x.item_id === 'hus_milk_buffalo'));
});
test('real panel processing debits once, and an opposite-side button targets its trough', () => {
  const f = fixture(); const processor = f.mount('arm1', 'inner', 'feed_preprocess');
  const cw = f.mount('arm1', 'cw_side', 'feed_trough'), ccw = f.mount('arm1', 'ccw_side', 'feed_trough');
  const source = read('js/livestock-panel.js').replace('  window.LivestockPanel = {', `
    render = function () {}; renderFeedPicker = function () {};
    window.auditFeed = function (mode, slot) { feedTargetArm = 'arm1'; feedTargetSlot = slot; feedPickerMode = mode; doFeedCrop('herb_maize'); };
    window.LivestockPanel = {`);
  vm.runInContext(source, f.ctx); f.ctx.auditFeed('process', null);
  assert.equal(f.ie.countCarriedItemsByTemplateId('herb_maize'), 1); assert.equal(processor.input_queue[0].count, 1);
  f.ctx.auditFeed('feed', 'ccw_side'); assert.equal(ccw.feed_units, 1); assert.equal(cw.feed_units, 0);
});
test('birth debits maternal mass, and insufficiently fed pregnancies pause', () => {
  const f = fixture(); const t = f.mount('arm4', 'cw_side', 'feed_trough'); t.feed_units = 100;
  const m = f.animal('pig', 'z1', { gender: 'female', weight_kg: 120, satiety: 80, pregnant: { remaining_ticks: 1 } });
  f.tick(); const children = f.st.animals.filter(a => a !== m);
  assert(children.length >= 3); assert(Math.abs(m.weight_kg + children.reduce((n, a) => n + a.weight_kg, 0) - 120) < 1e-8);
  m.satiety = 0; m.pregnant = { remaining_ticks: 10 }; t.feed_units = 0; f.tick(); assert.equal(m.pregnant.remaining_ticks, 10);
});
test('sex-dependent perks recognize hermaphroditism; pig early-growth increases throughput', () => {
  const f = fixture(); f.ctx.Math.random = () => 0;
  const a = f.animal('cattle', 'z1', { gender: 'female', perks: ['hermaphrodite', 'high_yield'] }); f.tick();
  assert(a.pregnant); assert.equal(f.ls.getModifier(a, 'product_cooldown_mult_milk'), 0.7);
  const t = f.mount('arm2', 'cw_side', 'feed_trough'); t.feed_units = 100;
  const p = f.animal('pig', 'z3', { satiety: 100, perks: ['fast_growth'] }); const growth=f.ls.lifecycleGrowth(p,species.pig)*1.15; f.tick();
  assert(Math.abs(p.weight_kg - 30 - growth) < 1e-9);
  assert(Math.abs(100 - t.feed_units - growth * species.pig.feed.nutrition_per_kg_meat / 10 - species.pig.nutrition.maintenance_per_tick / 10) < 1e-9);
});
test('pollution source/sink order is independent of animal array order', () => {
  function run(reverse) {
    const f = fixture(); f.animal('sheep'); f.animal('pig'); f.animal('pig');
    if (reverse) f.st.animals.reverse(); f.tick(); return f.st.zones.z1.pollution;
  }
  assert.equal(run(false), run(true));
});
test('sub-tick power cannot finance a complete powered-module cycle', () => {
  const f = fixture(); f.mount('arm1', 'inner', 'pasture_arm'); f.mount('axis', 'slot2', 'warehouse_hub');
  f.st.power_charge = 1; f.st.zones.z1.compaction = 50; f.tick();
  assert.equal(f.st.zones.z1.compaction, 50); assert.equal(f.st.power_charge, 1);
});
test('processing and feed state survive JSON reload', () => {
  const f = fixture(); const p = f.mount('arm1', 'inner', 'feed_preprocess'); const t = f.mount('arm1', 'cw_side', 'feed_trough');
  f.ls.feedProcessInput('arm1', 'herb_maize', 1); f.tick();
  assert.equal(t.feed_units, 0.5); assert.equal(p.processing_units, 0.5);
  const saved = JSON.parse(JSON.stringify(f.ls.getState())); f.tick(100); const expected = f.ls.getState();
  const g = fixture(); g.ls.setState(saved); g.tick(100); const actual = g.ls.getState();
  assert.equal(actual.arms.arm1.cw_side.feed_units, expected.arms.arm1.cw_side.feed_units);
  assert.equal(actual.zones.z1.grass_height, expected.zones.z1.grass_height);
});
test('corpse pollution has a finite shared budget across both coop zones and reloads', () => {
  const f = fixture(); f.mount('arm1', 'inner', 'coop');
  const a = f.animal('chicken', 'arm1', { dead: true, death_cause: 'old', weight_kg: 0.01 });
  f.tick(5);
  const total = Object.values(f.st.zones).reduce((n, z) => n + z.pollution, 0);
  assert(Math.abs(total - 0.01) < 1e-9); assert.equal(a.corpse_pollution_remaining, 0);
  const g = fixture(); g.ls.setState(JSON.parse(JSON.stringify(f.ls.getState()))); g.tick(50);
  assert(Math.abs(Object.values(g.ls.getState().zones).reduce((n, z) => n + z.pollution, 0) - total) < 1e-9);
});
test('processor upgrades increase actual throughput across multiple small crops', () => {
  const outputs = [1, 5].map(level => {
    const f = fixture(); const p = f.mount('arm1', 'inner', 'feed_preprocess', level); const t = f.mount('arm1', 'cw_side', 'feed_trough');
    p.input_queue = [{ item_id: 'herb_maize', nutrition: 10, count: 10 }]; f.tick();
    const balance = t.feed_units + (p.processing_units || 0) + p.input_queue.reduce((n, q) => n + q.count, 0);
    assert(Math.abs(balance - 10) < 1e-9); return t.feed_units;
  });
  assert.deepEqual(outputs, [0.5, 2]);
});
test('slaughter unlocks at the effective weight threshold without requiring adulthood; preview is pure', () => {
  for (const kind of Object.keys(species)) for (const hp of [20, 45, 100]) {
    const f = fixture(); const a = f.animal(kind, kind === 'chicken' ? 'arm1' : 'z1', { age_ticks: 0, weight_kg: 0.001, hp });
    f.mount('axis', 'slot1', 'slaughter'); if (kind === 'chicken') f.mount('arm1', 'inner', 'coop');
    const min = f.ls.previewSlaughter(a.uid).minimum_weight_kg; assert(min > 0);
    a.weight_kg = min - 0.00001; assert.equal(f.ls.slaughterAnimal(a.uid).ok, false); assert(f.st.animals.includes(a));
    a.weight_kg = min; const before = JSON.stringify(f.st); const p = f.ls.previewSlaughter(a.uid);
    assert(p.ok); assert.equal(JSON.stringify(f.st), before);
    const r = f.ls.slaughterAnimal(a.uid); assert(r.ok); assert.deepEqual(r.items, p.items); assert(!f.st.animals.includes(a));
  }
});
if (failed) process.exitCode = 1;
