import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createUiBridge } from '../ui/src/bridge/store.mjs';
import { readCarry } from '../ui/src/bridge/carry.mjs';

function game() {
  return {
    SceneCtx: { leftHudBlockVisibilityRules: {}, survivalMetricVisibilityRules: {} },
    CharacterAttributes: { getCarryCapacity: () => 30 },
    InventoryEquipment: { getCurrentCarryWeight: () => 18.4 },
    Survival: { getState: () => ({ weight_kg: 70 }) },
  };
}
test('ready and knowledge gates remove private values instead of hiding a populated model', () => {
  const g = game();
  assert.equal(readCarry(g, false).current, null);
  assert.equal(readCarry(g, true).weight, 70);
  g.SceneCtx.survivalMetricVisibilityRules.weight = false;
  assert.equal(readCarry(g, true).weight, null);
  g.SceneCtx.survivalMetricVisibilityRules.weight = () => { throw Error('rule failed'); };
  assert.equal(readCarry(g, true).weightKnown, false);
  g.SceneCtx.leftHudBlockVisibilityRules.carry = false;
  assert.equal(readCarry(g, true).capacity, null);
  g.SceneCtx.leftHudBlockVisibilityRules.carry = () => { throw Error('rule failed'); };
  assert.equal(readCarry(g, true).available, false);
});
test('carry calculation handles overload, zero capacity and unavailable values', () => {
  const g = game();
  g.InventoryEquipment.getCurrentCarryWeight = () => 40;
  assert.equal(readCarry(g, true).remaining, 0);
  assert.equal(readCarry(g, true).ratio, 100);
  g.CharacterAttributes.getCarryCapacity = () => 0;
  assert.equal(readCarry(g, true).ratio, 0);
  g.InventoryEquipment.getCurrentCarryWeight = () => NaN;
  assert.equal(readCarry(g, true).current, null);
  assert.equal(readCarry(g, true).remaining, null);
});
test('domain subscriptions batch, deduplicate, freeze, unsubscribe and dispose', async () => {
  let value = 1;
  const bridge = createUiBridge({ carry: () => ({ value }) });
  const updates = [];
  const stop = bridge.subscribe('carry', s => updates.push(s));
  assert.equal(updates.length, 1);
  assert.throws(() => { updates[0].value = 9; }, TypeError);
  bridge.invalidate('carry');
  await Promise.resolve();
  assert.equal(updates.length, 1);
  value = 2;
  bridge.invalidate('carry'); bridge.invalidate('carry');
  await Promise.resolve();
  assert.equal(updates.length, 2);
  assert.equal(updates[1].revision, 2);
  stop(); value = 3; bridge.invalidate('carry');
  await Promise.resolve();
  assert.equal(updates.length, 2);
  assert.throws(() => bridge.getSnapshot('other'), /Unknown UI domain/);
  bridge.dispose(); bridge.invalidate('carry');
  assert.throws(() => bridge.subscribe('carry', () => {}), /disposed/);
});
test('SceneHud observers run after the existing owner without replacing it', () => {
  const g = {}; g.window = g;
  vm.runInNewContext(fs.readFileSync('js/scene-hud.js', 'utf8'), g);
  const seen = [];
  g.SceneHud.register('status', v => seen.push(`old:${v}`));
  const stop = g.SceneHud.subscribe('status', v => seen.push(`new:${v}`));
  g.SceneHud.refresh('status', 2);
  assert.deepEqual(seen, ['old:2', 'new:2']);
  stop(); g.SceneHud.refresh('status', 3);
  assert.equal(seen.at(-1), 'old:3');
});
test('bootstrap distinguishes synchronous registration from asynchronous game readiness', async () => {
  const seen = [];
  let finish;
  const initialized = new Promise(resolve => { finish = resolve; });
  const g = {
    document: { readyState: 'complete' },
    SceneApp: { init: () => { seen.push('init'); return initialized; } },
    AppBoot: { afterStart: [() => seen.push('registered')], afterReady: [() => seen.push('ready')] },
  };
  g.window = g;
  vm.runInNewContext(fs.readFileSync('js/bootstrap.js', 'utf8'), g);
  assert.deepEqual(seen, ['init', 'registered']);
  finish(); await g.AppBoot.ready; await Promise.resolve();
  assert.deepEqual(seen, ['init', 'registered', 'ready']);
});
