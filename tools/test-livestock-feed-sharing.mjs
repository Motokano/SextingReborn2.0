// Real runtime, inventory and admission; no browser or player save access.
import assert from 'node:assert/strict';
import { fixture, species } from './lib/livestock-test-fixture.mjs';

const near = (a, b, message) => assert(Math.abs(a - b) < 1e-8, `${message}: ${a} != ${b}`);
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
function setup(kind, level, amounts = [1, 1]) {
  const f = fixture();
  f.mount('arm1', 'inner', 'coop', level);
  const troughs = ['ccw_side', 'cw_side'].map(slot => f.mount('arm1', slot, 'feed_trough', level));
  assert(f.ls.admitAnimal(kind, 'z1', { gender: 'female', perks: [] }).ok);
  assert(f.ls.admitAnimal('chicken', 'arm1', { perks: [] }).ok);
  for (let i = 0; i < amounts.length; i++) {
    if (amounts[i] === 1) assert(f.ls.addFeedToTrough('arm1', 'herb_maize', 1, ['ccw_side', 'cw_side'][i]).ok);
    else troughs[i].feed_units = amounts[i]; // Explicit empty/near-empty boundary fixture.
  }
  // Normalize optional module fields before comparing uninterrupted and loaded runs.
  assert(f.ls.setState(f.st).ok);
  return f;
}
function feedTotal(st) {
  return Object.values(st.arms).flatMap(arm => Object.values(arm))
    .filter(m => m && !m.shadow && m.module_id === 'feed_trough')
    .reduce((sum, m) => sum + m.feed_units, 0);
}
function finiteTree(value) {
  if (typeof value === 'number') assert(Number.isFinite(value), 'non-finite runtime state');
  else if (value && typeof value === 'object') Object.values(value).forEach(finiteTree);
}
function step(f) {
  const st = f.ls.getState(), before = feedTotal(st);
  const live = st.animals.filter(a => !a.dead);
  const buffered = live.reduce((sum, a) => sum + (a.nutrition_state?.feed_buffer || 0), 0);
  f.tick();
  finiteTree(st);
  const remainingBuffer = live.reduce((sum, a) => sum + (a.nutrition_state.feed_buffer || 0), 0);
  near((before - feedTotal(st)) * 10 + buffered - remainingBuffer,
    live.reduce((sum, a) => sum + a.nutrition_state.last.feed, 0), 'shared trough debit');
  for (const a of live) {
    assert(a.weight_kg >= 0 && a.weight_kg <= species[a.species_id].growth.fatten_cap_kg);
    assert(a.hp >= 0 && a.hp <= 100 && a.satiety >= 0 && a.satiety <= 100);
    const n = a.nutrition_state.last;
    near(n.intake, n.grass + n.feed + n.pollution_food, 'intake sources');
    near(n.intake + n.reserve_used, n.maintenance_paid + n.reserve_refilled + n.recovery_spent
      + n.growth_spent + n.production_spent + n.gestation_spent + n.unused, 'nutrition budget');
  }
}

for (const kind of ['sheep', 'pig']) for (const level of [1, 5]) {
  test(`${kind}+chicken level ${level}: real crops, depletion, save and continuation`, () => {
    const f = setup(kind, level);
    assert.equal(f.ie.countCarriedItemsByTemplateId('herb_maize'), 0);
    for (let tick = 1; tick <= 200; tick++) {
      step(f);
      if (tick === 147 || tick === 150) assert(f.ls.getState().animals.every(a => !a.dead && a.hp === 100), 'no sudden death at the original reproduction tick');
    }
    const saved = JSON.parse(JSON.stringify(f.ls.getState()));
    assert(f.ls.validateState(saved).ok);
    const g = fixture(); assert(g.ls.setState(saved).ok);
    for (let i = 0; i < 200; i++) { step(f); step(g); }
    assert.deepEqual(JSON.parse(JSON.stringify(f.ls.getState())), JSON.parse(JSON.stringify(g.ls.getState())), 'reload continues the same finite simulation');
  });
}
for (const amounts of [[0, 0], [0, 1], [1, 0], [0.0002, 0.0002], [0.001, 0.01], [1e-14, 1]]) {
  test(`empty and scarce troughs ${amounts.join('/')}`, () => {
    const f = setup('sheep', 1, amounts);
    for (let i = 0; i < 200; i++) step(f);
  });
}
test('no animals means zero demand and unchanged feed', () => {
  const f = fixture(), t = f.mount('arm1', 'cw_side', 'feed_trough'); t.feed_units = 1;
  for (let i = 0; i < 20; i++) step(f);
  assert.equal(t.feed_units, 1);
});
test('zero feed demand from satisfied grazing leaves both troughs intact', () => {
  const f = fixture();
  const a = f.animal('cattle', 'z1', { satiety: 100, weight_kg: 600 });
  f.mount('arm1', 'ccw_side', 'feed_trough').feed_units = 1;
  f.mount('arm4', 'cw_side', 'feed_trough').feed_units = 1;
  step(f); assert.equal(a.nutrition_state.last.feed, 0); assert.equal(feedTotal(f.st), 2);
});
test('animal array order does not change scarce shared allocation', () => {
  const f = setup('sheep', 5, [0.001, 0.01]), g = setup('sheep', 5, [0.001, 0.01]);
  g.st.animals.reverse();
  for (let i = 0; i < 200; i++) { step(f); step(g); }
  g.st.animals.reverse();
  assert.deepEqual(JSON.parse(JSON.stringify(f.st)), JSON.parse(JSON.stringify(g.st)));
});
console.log(`${passed} shared-feed regression cases passed`);
