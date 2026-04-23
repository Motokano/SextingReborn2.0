const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function loadCompostSystem() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'compost-system.js'), 'utf8');
  const sandbox = {
    window: {},
    console,
    Math,
    JSON
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'compost-system.js' });
  const cs = sandbox.window.CompostSystem;
  cs.setEventsTable({
    events: {
      test_state_event: {
        stage: 'state',
        enabled: true,
        best_action: 'turn_pile',
        secondary_action: 'break_clumps',
        bad_action: 'leave_as_is',
        variants: [{ text_variant_id: 'v1', title: '测试状态事件' }]
      }
    }
  });
  return cs;
}

function startLegalBatch(cs, mode) {
  const ret = cs.startBatch(mode, {
    materials: [{ item_id: 'x', count: 2 }],
    c_total: 30,
    n_total: 1
  });
  assert.strictEqual(ret.ok, true, 'batch should start');
}

function testAerobicFixedWindows() {
  const cs = loadCompostSystem();
  startLegalBatch(cs, 'aerobic');
  const b = cs.getBatch('aerobic');
  const ticks = b.windows.map(w => w.trigger_tick);
  assert.deepStrictEqual(ticks, [48, 96, 144, 192, 240]);
}

function testAnaerobicFixedWindows() {
  const cs = loadCompostSystem();
  startLegalBatch(cs, 'anaerobic');
  const b = cs.getBatch('anaerobic');
  const ticks = b.windows.map(w => w.trigger_tick);
  assert.deepStrictEqual(ticks, [336, 672]);
}

function testSingleWindowSingleEffectiveAction() {
  const cs = loadCompostSystem();
  startLegalBatch(cs, 'aerobic');
  cs.advanceByTicks(48);
  const s1 = cs.getWindowInteractionState('aerobic');
  assert.strictEqual(s1.can_interact, true);
  const event = s1.pending_window.event;
  const best = String((event && event.best_action) || '');
  if (!best) throw new Error('expected a sampled aerobic event best_action');
  const first = cs.interact('aerobic', best, { advance_world_tick: false });
  assert.strictEqual(first.ok, true);
  const second = cs.interact('aerobic', best, { advance_world_tick: false });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.reason, 'no_pending_window');
}

function testCrossWindowMissDeductsScore() {
  const cs = loadCompostSystem();
  startLegalBatch(cs, 'aerobic');
  cs.advanceByTicks(97);
  const b = cs.getBatch('aerobic');
  assert.strictEqual(b.windows[0].miss, true, 'first window should be missed');
  assert.strictEqual(b.windows[0].score_delta, -1, 'miss should deduct 1');
  assert.strictEqual(b.compost_ops_score, -1, 'batch score should deduct after miss');
}

function testLastWindowBoundaryAndRepeatGuard() {
  const cs = loadCompostSystem();
  startLegalBatch(cs, 'aerobic');
  cs.advanceByTicks(240);
  const s1 = cs.getWindowInteractionState('aerobic');
  assert.strictEqual(s1.can_interact, true, 'last window should open at tick 240');
  const best = String((s1.pending_window.event && s1.pending_window.event.best_action) || '');
  const ret = cs.interact('aerobic', best, { advance_world_tick: false });
  assert.strictEqual(ret.ok, true);
  const s2 = cs.getWindowInteractionState('aerobic');
  assert.strictEqual(s2.can_interact, false, 'window should be consumed after operation');
}

function testForceTerminateAppliesMissBeforeSettlement() {
  const cs = loadCompostSystem();
  startLegalBatch(cs, 'aerobic');
  cs.advanceByTicks(200);
  const ret = cs.forceTerminate('aerobic', 'forced_test');
  assert.strictEqual(ret.ok, true);
  const b = cs.getBatch('aerobic');
  assert.strictEqual(b.status, 'SETTLED');
  assert.strictEqual(b.windows[0].miss, true);
  assert.strictEqual(b.windows[1].miss, true);
  assert.strictEqual(b.compost_ops_score, -3, 'missed passed windows should deduct before force settle');
}

function testIllegalBatchNeverInteractive() {
  const cs = loadCompostSystem();
  const ret = cs.startBatch('aerobic', {
    materials: [{ item_id: 'void', count: 2 }],
    c_total: 0,
    n_total: 0
  });
  assert.strictEqual(ret.ok, true);
  cs.advanceByTicks(200);
  const b = cs.getBatch('aerobic');
  assert.deepStrictEqual(b.windows, [], 'illegal batch should not own interactive windows');
  const s = cs.getWindowInteractionState('aerobic');
  assert.strictEqual(s.can_interact, false);
  assert.strictEqual(s.reason, 'illegal_cn_batch');
  const i = cs.interact('aerobic', 'turn_pile', { advance_world_tick: false });
  assert.strictEqual(i.ok, false);
  assert.strictEqual(i.reason, 'illegal_cn_batch');
}

function run() {
  const tests = [
    testAerobicFixedWindows,
    testAnaerobicFixedWindows,
    testSingleWindowSingleEffectiveAction,
    testCrossWindowMissDeductsScore,
    testLastWindowBoundaryAndRepeatGuard,
    testForceTerminateAppliesMissBeforeSettlement,
    testIllegalBatchNeverInteractive
  ];
  for (const t of tests) t();
  console.log(`[ok] compost window tests passed: ${tests.length}`);
}

run();
