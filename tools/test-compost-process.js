const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.join(__dirname, '..');
const table = JSON.parse(fs.readFileSync(path.join(root, 'data/compost-events.json'), 'utf8'));
const code = fs.readFileSync(path.join(root, 'js/compost-system.js'), 'utf8');

function setup(ratio = 30, random = 0.99) {
  const costs = { ticks: 0, stamina: 0, proficiency: 0, buffs: [] };
  let cs;
  const window = {
    Survival: {
      advanceTick() { costs.ticks++; cs.onWorldTick(); },
      consumeStamina(n) { costs.stamina += n; }
    },
    BuffSystem: { applyBuff(...args) { costs.buffs.push(args); } }
  };
  const math = Object.create(Math);
  math.random = () => random;
  vm.runInNewContext(code, { window, Math: math, JSON });
  cs = window.CompostSystem;
  cs.setEventsTable(table);
  cs.setHooks({ on_window_interacted() { costs.proficiency++; } });
  assert(cs.startBatch('anaerobic', { c_total: ratio, n_total: 1, materials: [{ item_id: 'fixture', count: 2 }] }).ok);
  return { cs, costs };
}
function at(cs, age) { cs.advanceByTicks(age - cs.getBatch('anaerobic').age_ticks); }
function event(cs) { return cs.getWindowInteractionState('anaerobic').pending_window.event.event_id; }
function choose(cs, action) {
  const result = cs.interact('anaerobic', action);
  assert(result.ok, result.reason);
  assert(result.feedback_text, 'specific feedback must be returned');
  return result;
}
function batch(cs) { return cs.getBatch('anaerobic'); }
function finish(cs) { at(cs, 1008); return batch(cs); }
const tests = [];
function test(name, body) { tests.push([name, body]); }

test('vigorous batch: vent then wait preserves quantity and grade', () => {
  const { cs, costs } = setup();
  at(cs, 336);
  assert.equal(event(cs), 'anaerobic_pressure_rising');
  choose(cs, 'vent_gas');
  at(cs, 672);
  assert.equal(event(cs), 'anaerobic_ready');
  choose(cs, 'leave_as_is');
  const b = finish(cs);
  assert.equal(b.results[0].count, 4);
  assert.equal(b.final_tier, 'high');
  assert.equal(costs.ticks, 2);
  assert.equal(costs.stamina, 0);
  assert.equal(costs.proficiency, 2);
});
test('carbon-heavy batch: seal first, vent later', () => {
  const { cs } = setup(40);
  at(cs, 336);
  assert.equal(event(cs), 'anaerobic_slow_start');
  choose(cs, 'leave_as_is');
  at(cs, 672);
  assert.equal(event(cs), 'anaerobic_pressure_rising');
  choose(cs, 'vent_gas');
  const b = finish(cs);
  assert.equal(b.results[0].count, 4);
  assert.equal(b.final_tier, 'mid');
});
test('wrong early vent changes later state; recovery does not refund loss', () => {
  const { cs } = setup(40);
  at(cs, 336);
  choose(cs, 'vent_gas');
  at(cs, 672);
  assert.equal(event(cs), 'anaerobic_recovering');
  choose(cs, 'leave_as_is');
  assert.equal(finish(cs).results[0].count, 3);
});
test('miss processed exactly at next trigger; later rescue saves remainder', () => {
  const { cs, costs } = setup();
  at(cs, 672);
  assert.equal(batch(cs).windows[0].miss, true);
  assert.equal(event(cs), 'anaerobic_pressure_high');
  assert.equal(batch(cs).anaerobic_loss, 0.25);
  cs.getWindowInteractionState('anaerobic');
  assert.equal(batch(cs).anaerobic_loss, 0.25);
  choose(cs, 'vent_gas');
  assert.equal(finish(cs).results[0].count, 3);
  assert.equal(costs.buffs.length, 0);
});
test('fully unattended pressure chain loses half and applies buff once', () => {
  const { cs, costs } = setup();
  const b = finish(cs);
  assert.equal(b.results[0].count, 2);
  assert.equal(b.windows[1].event.event_id, 'anaerobic_pressure_high');
  assert(b.windows.every(w => w.miss && w.feedback_text));
  assert.equal(costs.proficiency, 0);
  assert.equal(costs.buffs.length, 1);
  cs.setState(cs.getState());
  cs.advanceByTicks(50);
  assert.equal(costs.buffs.length, 1);
});
test('unattended slow stage remains sealed without proficiency or artificial loss', () => {
  const { cs, costs } = setup(40);
  at(cs, 672);
  assert.equal(batch(cs).anaerobic_loss, 0);
  assert.equal(event(cs), 'anaerobic_pressure_rising');
  choose(cs, 'vent_gas');
  assert.equal(finish(cs).results[0].count, 4);
  assert.equal(costs.proficiency, 1);
});
test('stable late stage can be left unattended without penalty', () => {
  const { cs } = setup();
  at(cs, 336);
  choose(cs, 'vent_gas');
  assert.equal(finish(cs).results[0].count, 4);
});
test('early harvest is only offered after a stable first stage', () => {
  const { cs } = setup();
  assert.equal(cs.forceTerminate('anaerobic').reason, 'not_ready');
  assert.equal(cs.settleBatch('anaerobic', 'early_harvest').reason, 'not_ready');
  at(cs, 336);
  assert.equal(cs.interact('anaerobic', 'harvest_early').reason, 'invalid_action');
  choose(cs, 'vent_gas');
  at(cs, 672);
  choose(cs, 'harvest_early');
  const b = batch(cs);
  assert.equal(b.status, 'SETTLED');
  assert.equal(b.age_ticks, 672);
  assert.equal(b.final_tier, 'mid');
  assert.equal(b.results[0].count, 3);
  assert.equal(b.settled_reason, 'early_harvest');
  assert(b.windows[1].feedback_text.includes('提前结束'));
  assert(!cs.interact('anaerobic', 'harvest_early').ok);
  assert.equal(cs.collect('anaerobic', 1).remaining_in_batch, 2);
  assert.equal(cs.startBatch('anaerobic', {}).reason, 'output_pending');
});
test('last-tick early action cannot turn into full normal settlement', () => {
  const { cs } = setup();
  at(cs, 336); choose(cs, 'vent_gas');
  at(cs, 1007); choose(cs, 'harvest_early');
  assert.equal(batch(cs).final_tier, 'mid');
  assert.equal(batch(cs).results[0].count, 3);
});
test('save/load preserves sampled text, condition, yield and feedback', () => {
  const { cs } = setup(40);
  at(cs, 336); choose(cs, 'vent_gas');
  at(cs, 672);
  const snapshot = cs.getState();
  const resumed = setup(30, 0).cs;
  resumed.setState(snapshot);
  assert.deepEqual(resumed.getState(), snapshot);
  assert.equal(event(resumed), 'anaerobic_recovering');
  choose(resumed, 'leave_as_is');
  assert.equal(finish(resumed).results[0].count, 3);
});
test('legacy saves retain two-vent behavior', () => {
  const { cs } = setup();
  const save = cs.getState();
  delete save.batches.anaerobic.process_version;
  cs.setState(save);
  at(cs, 336);
  assert.equal(event(cs), 'anaerobic_vent_window_1');
  choose(cs, 'vent_gas');
  assert.equal(finish(cs).results[0].count, 4);
});
test('invalid CN still yields one waste item with no events', () => {
  const { cs } = setup(0);
  const b = finish(cs);
  assert.equal(b.results[0].item_id, 'fertilizer_batch_void');
  assert.equal(b.results[0].count, 1);
  assert.equal(b.windows.length, 0);
});
test('missing event data blocks new batch rather than inventing fallback prose', () => {
  const { cs } = setup();
  cs.abort('anaerobic');
  cs.setEventsTable({ events: {} });
  assert.equal(cs.startBatch('anaerobic', { c_total: 30, n_total: 1 }).reason, 'events_unavailable');
});
test('unknown action costs nothing and does not consume the window', () => {
  const { cs, costs } = setup();
  at(cs, 336);
  assert.equal(cs.interact('anaerobic', 'invented').reason, 'invalid_action');
  assert.equal(costs.ticks, 0);
  assert(cs.getWindowInteractionState('anaerobic').can_interact);
});
test('aerobic windows never sample anaerobic process events', () => {
  const { cs } = setup();
  cs.startBatch('aerobic', { c_total: 30, n_total: 1 });
  for (let i = 0; i < 5; i++) {
    cs.advanceByTicks(48);
    const w = cs.getWindowInteractionState('aerobic').pending_window;
    assert(!/^anaerobic_/.test(w.event.event_id) || w.event.event_id === 'anaerobic_risk');
  }
});

test('foam needs gentle vent; stable second stage preserves yield', () => {
  const { cs } = setup(12);
  at(cs, 336);
  assert.equal(event(cs), 'anaerobic_foam_rising');
  choose(cs, 'vent_gently');
  at(cs, 672);
  assert.equal(event(cs), 'anaerobic_ready');
  choose(cs, 'leave_as_is');
  const b = finish(cs);
  assert.equal(b.final_tier, 'low');
  assert.equal(b.results[0].count, 4);
  assert.equal(b.result_report.actual, 4);
  assert(b.result_report.text.includes('原定产量得以保留'));
});
test('opening foam quickly spills liquid and needs recovery', () => {
  const { cs } = setup(12);
  at(cs, 336);
  const result = choose(cs, 'vent_gas');
  assert.equal(result.success, false);
  assert(result.feedback_text.includes('开得太快'));
  assert.equal(batch(cs).windows[0].loss_delta, 0.25);
  at(cs, 672);
  assert.equal(event(cs), 'anaerobic_recovering');
  choose(cs, 'leave_as_is');
  assert.equal(finish(cs).results[0].count, 3);
});
test('ignored foam leads to pressure instead of recovery', () => {
  const { cs } = setup(12);
  at(cs, 672);
  assert.equal(event(cs), 'anaerobic_pressure_high');
  assert(batch(cs).windows[0].feedback_text.includes('积压仍未解除'));
  choose(cs, 'vent_gas');
  const b = finish(cs);
  assert.equal(b.results[0].count, 3);
  assert.equal(b.result_report.planned, 4);
  assert.equal(b.result_report.actual, 3);
});
test('report survives save and partial collection without rewriting total', () => {
  const { cs } = setup(12);
  finish(cs);
  const report = batch(cs).result_report;
  cs.collect('anaerobic', 1);
  cs.setState(cs.getState());
  assert.deepEqual(batch(cs).result_report, report);
  assert.equal(batch(cs).results[0].count, 1);
});
test('v2 low-ratio batch retains original active chain after load', () => {
  const { cs } = setup(12);
  const snapshot = cs.getState();
  snapshot.batches.anaerobic.process_version = 2;
  snapshot.batches.anaerobic.anaerobic_condition = 'active';
  cs.setState(snapshot);
  at(cs, 336);
  assert.equal(event(cs), 'anaerobic_pressure_rising');
});
test('foam state and sampled text survive reload', () => {
  const { cs } = setup(12);
  at(cs, 336);
  const snapshot = cs.getState();
  const resumed = setup(40, 0).cs;
  resumed.setState(snapshot);
  assert.deepEqual(batch(resumed), snapshot.batches.anaerobic);
  choose(resumed, 'vent_gently');
  at(resumed, 672);
  assert.equal(event(resumed), 'anaerobic_ready');
});

for (const [name, body] of tests) {
  try { body(); } catch (error) { error.message = name + ': ' + error.message; throw error; }
}
console.log(`[ok] compost process tests passed: ${tests.length}`);
