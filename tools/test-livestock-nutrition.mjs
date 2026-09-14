import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fixture, species, read } from './lib/livestock-test-fixture.mjs';
let failures = 0, checks = 0;
const near = (a, b, eps = 1e-8) => assert(Math.abs(a - b) < eps, `${a} != ${b}`);
function test(name, fn) { try { fn(); checks++; console.log('PASS ' + name); } catch (e) { failures++; console.error('FAIL ' + name + '\n' + e.stack); } }
function bare(f) { for (const z of Object.values(f.ls.getState().zones)) { z.grass_height = 0; z.pollution = 0; } }
function ledger(a) {
  const n = a.nutrition_state.last;
  for (const v of Object.values(n)) assert(Number.isFinite(v) && v >= -1e-9);
  near(n.intake, n.grass + n.feed + n.pollution_food);
  near(n.intake + n.reserve_used, n.maintenance_paid + n.reserve_refilled + n.recovery_spent + n.growth_spent + n.production_spent + n.unused);
  near(n.grass, n.grass_taken_m * 3000);
  near(n.maintenance_required, n.maintenance_paid + n.shortfall);
}
function feeding(kind, options = {}) {
  const f = fixture(); if (kind === 'chicken') f.mount('arm1', 'inner', 'coop');
  const trough = f.mount(kind === 'chicken' ? 'arm1' : 'arm4', 'cw_side', 'feed_trough');
  const a = f.animal(kind, kind === 'chicken' ? 'arm1' : 'z1', { satiety: 100, gender: 'female', ...options });
  return { ...f, a, trough, step(feed) { bare(f); trough.feed_units = feed; f.tick(); ledger(a); } };
}
test('zero reserve starvation and half-maintenance damage are proportional for all four species', () => {
  for (const kind of Object.keys(species)) for (const ratio of [0, 0.5]) {
    const f = feeding(kind, { satiety: 0 });
    for (let i = 0; i < 100; i++) f.step(f.ls.getAnimalLoad(f.a.uid).maintenance * ratio / 10);
    near(f.a.hp, 100 - 100 * species[kind].nutrition.hunger_damage_hp_per_tick * (1 - ratio));
    near(f.a.nutrition_state.last.growth_spent, 0); near(f.a.nutrition_state.last.production_spent, 0);
  }
});
test('a crumb before death does not reset damage; half-fed chicken dies at 1200 ticks', () => {
  const f = feeding('chicken', { satiety: 0 });
  for (let i = 0; i < 599; i++) f.step(0);
  f.step(f.ls.getAnimalLoad(f.a.uid).maintenance / 10); assert(!f.a.dead); assert(f.a.hp < 0.17);
  f.step(0); assert(f.a.dead);
  const g = feeding('chicken', { satiety: 0 });
  for (let i = 0; i < 1199; i++) g.step(g.ls.getAnimalLoad(g.a.uid).maintenance / 20);
  assert(!g.a.dead); g.step(g.ls.getAnimalLoad(g.a.uid).maintenance / 20); assert(g.a.dead);
});
test('stored satiety maintains life but cannot grow animals or produce items', () => {
  for (const kind of Object.keys(species)) {
    const f = feeding(kind); const w = f.a.weight_kg;
    for (let i = 0; i < 100; i++) f.step(0);
    near(f.a.weight_kg, w); near(f.a.hp, 100); assert(f.a.satiety < 100);
    near(f.a.nutrition_state.last.growth_spent, 0); near(f.a.nutrition_state.last.production_spent, 0);
  }
});
test('clinic and passive healing cannot repair hunger damage without surplus food', () => {
  const f = feeding('pig', { satiety: 0 }); f.mount('arm1', 'inner', 'clinic_arm', 5);
  for (let i = 0; i < 100; i++) f.step(0);
  near(f.a.hp, 90); const damage = f.a.nutrition_state.hunger_damage;
  for (let i = 0; i < 20; i++) f.step(species.pig.nutrition.maintenance_per_tick / 10);
  near(f.a.hp, 90); near(f.a.nutrition_state.hunger_damage, damage);
  f.step(1); near(f.a.hp, 90.05); near(f.a.nutrition_state.last.recovery_spent, species.pig.nutrition.hunger_recovery_hp_per_tick * species.pig.nutrition.recovery_nutrition_per_hp);
});
test('full-weight middle supply never redirects growth into milk, wool or eggs', () => {
  for (const kind of ['cattle', 'sheep', 'chicken']) {
    const f = feeding(kind, { weight_kg: species[kind].growth.fatten_cap_kg });
    const ratio = kind === 'chicken' ? 1.5 : 2;
    for (let i = 0; i < 1000; i++) f.step(species[kind].nutrition.maintenance_per_tick * ratio / 10);
    assert.equal(f.a.nutrition_state.tier, 'growth');
    near(Object.values(f.a.production_buffers).reduce((n, v) => n + v, 0), 0);
  }
});
test('production requires sustained full supply and exact item nutrition; collecting does not refill it', () => {
  for (const kind of ['cattle', 'sheep', 'chicken']) {
    const f = feeding(kind, { weight_kg: species[kind].growth.fatten_cap_kg });
    const p = species[kind].products.living.find(p => p.nutrition_per_item > 0);
    assert(!f.ls.collectProduct(f.a.uid, p.product_id).ok);
    let spent = 0;
    for (let i = 0; i < p.cooldown_ticks + 300; i++) { f.step(1); spent += f.a.nutrition_state.last.production_spent; }
    assert(f.ls.getProductStatus(f.a.uid, p.product_id).ready); near(spent, p.nutrition_per_item);
    f.a.hp = 1; f.a.satiety = 0; // Already formed items remain collectible.
    assert(f.ls.collectProduct(f.a.uid, p.product_id).ok); assert(!f.ls.collectProduct(f.a.uid, p.product_id).ok);
    f.step(0); near(f.a.production_buffers[p.product_id], 0);
  }
});
test('cow cannot share sheep-only layers, and sheep cannot eat above its own ceiling', () => {
  for (const height of [0.3993, 0.4, 0.6, 0.9]) {
    const f = fixture(); const cow = f.animal('cattle'), sheep = f.animal('sheep');
    f.st.zones.z1.grass_height = height; f.tick(); ledger(cow); ledger(sheep);
    const c = cow.nutrition_state.last.grass_taken_m, s = sheep.nutrition_state.last.grass_taken_m;
    assert(c <= Math.max(0, height + 0.0008 - 0.4) + 1e-9);
    if (height > 0.8) near(s, 0);
    near(height + 0.0008 - f.st.zones.z1.grass_height, c + s);
  }
});
test('grazing perks change consumed quantity, not nutrition per grass unit', () => {
  for (const perk of [null, 'fast_graze', 'picky_eater']) {
    const f = fixture(); const a = f.animal('cattle', 'z1', { perks: perk ? [perk] : [] }); f.tick(); ledger(a);
    near(a.nutrition_state.last.grass_taken_m, species.cattle.graze.comfort_rate_m_per_tick * f.ls.getModifier(a, 'graze_rate_mult'));
  }
});
test('manual chicken feeding transfers bounded nutrition and repeated clicking cannot create it', () => {
  const f = feeding('chicken', { satiety: 0 }); f.trough.feed_units = 1;
  assert(f.ls.feedChickens('arm1').ok); const queued = f.a.nutrition_state.feed_buffer;
  near(queued, species.chicken.nutrition.maintenance_per_tick * 20); near(f.a.satiety, 0);
  assert(!f.ls.feedChickens('arm1').ok); near((1 - f.trough.feed_units) * 10, queued);
  f.step(0); near(f.a.nutrition_state.feed_buffer + f.a.nutrition_state.last.intake, queued);
});
test('legacy starvation migrates once and nutrition/production survives save reload', () => {
  const f = feeding('chicken', { satiety: 0, starvation_ticks: 300 });
  f.ls.setState(JSON.parse(JSON.stringify(f.ls.getState())));
  near(f.ls.getState().animals[0].hp, 50);
  const saved = JSON.parse(JSON.stringify(f.ls.getState()));
  f.ls.setState(saved); near(f.ls.getState().animals[0].hp, 50);
  const g = feeding('chicken'); for (let i = 0; i < 220; i++) g.step(1);
  const h = fixture(); h.ls.setState(JSON.parse(JSON.stringify(g.ls.getState())));
  g.tick(20); h.tick(20);
  for (const field of ['nutrition_state', 'production_buffers', 'hp', 'satiety', 'weight_kg', 'age_ticks']) {
    assert.equal(JSON.stringify(g.ls.getState().animals[0][field]), JSON.stringify(h.ls.getState().animals[0][field]));
  }
});
test('health scales egg production continuously and overlap uses only the best collector', () => {
  const progress = [100, 50].map(hp => {
    const f = feeding('chicken', { hp }); for (let i = 0; i < 400; i++) f.step(1);
    f.a.production_buffers.egg=0;for(let i=0;i<100;i++)f.step(1);
    return f.a.production_buffers.egg;
  });
  near(progress[0], progress[1] * 2);
  function milk(two) {
    const f = feeding('cattle', { weight_kg: 600 }); f.mount('arm1', 'front', 'auto_collect', 5);
    if (two) f.mount('arm4', 'front', 'auto_collect', 5);
    for (let i = 0; i < 220; i++) { f.a.cooldowns.blood = 100; f.step(1); }
    return f.a.production_buffers.milk;
  }
  near(milk(false), milk(true));
});
test('full supply pays separate growth and production; one abundant tick never activates production', () => {
  const f = feeding('cattle'); f.step(1); near(f.a.nutrition_state.last.production_spent, 0);
  for (let i = 0; i < 200; i++) f.step(1);
  assert(f.a.nutrition_state.last.growth_spent > 0); assert(f.a.nutrition_state.last.production_spent > 0);
  const p = f.a.production_buffers.milk; f.step(0); near(f.a.production_buffers.milk, p);
});
test('same-arm collector takes completed eggs once, including upgraded corpse clearing', () => {
  const f = feeding('chicken'); f.mount('arm1', 'front', 'auto_collect', 4);
  f.a.production_buffers = { egg: 1 }; f.tick();
  assert.equal(f.ls.drainAutoCollectItems().filter(x => x.item_id === 'hus_egg').length, 1);
  f.a.dead = true; f.a.production_buffers.egg = 1; f.tick(); assert.equal(f.st.animals.length, 0);
  assert.equal(f.ls.drainAutoCollectItems().filter(x => x.item_id === 'hus_egg').length, 1);
  f.tick(); assert.equal(f.ls.drainAutoCollectItems().length, 0);
});
test('actual product panel readiness follows completed stock, including hungry animals', () => {
  const f = feeding('chicken'); const box = {innerHTML:'', querySelectorAll:()=>[], querySelector:()=>({onclick:null})};
  f.ctx.document = {getElementById:id=>id==='livestock-product-content'?box:null,querySelector:()=>null,querySelectorAll:()=>[]};
  vm.runInContext(read('js/livestock-panel.js').replace('  window.LivestockPanel = {', '  window.auditProducts = renderProducts;\n  window.LivestockPanel = {'),f.ctx);
  f.ctx.auditProducts(f.st,100);
  assert(box.innerHTML.includes('data-collect-one="'+f.a.uid+'|egg" disabled'));
  f.a.production_buffers = {egg:1}; f.a.satiety = 0; f.ctx.auditProducts(f.st,100);
  assert(!box.innerHTML.includes('data-collect-one="'+f.a.uid+'|egg" disabled'));
  assert(f.ls.collectProduct(f.a.uid,'egg').ok);
});
console.log(`${checks} passed, ${failures} failed`);
if (failures) process.exitCode = 1;
