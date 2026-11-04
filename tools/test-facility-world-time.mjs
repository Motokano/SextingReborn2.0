import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';
import { equipPharmacyTestBag } from './pharmacy-test-fixture.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const times = g => [g.GameTime.getState().totalTicks, g.Survival.getState().tickCount];
function expectTicks(g, before, count, message) {
  assert.deepEqual(times(g), before.map(n => n + count), message);
}
async function player(h, x = 13, y = 12) {
  const g = h.g;
  g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain();
  assert.equal(g.SceneApp.creation.confirm({ name: '设施时间回归', height: 178, gender: 'male', hand: 'right', leg: 'right' }), true);
  await h.drain(); g.DialogueUI.close();
  g.GameEngine.setState('M0_Base_Inside_lv_1', x, y);
  g.SceneCtx.survivalMetricVisibilityRules.time = true;
  g.Survival.setState({ stamina: 100, energy: 100, satiety: 100, thirst: 100, fatigue: 0, isDead: false, isComa: false, isResting: false });
}
function intervals(g) {
  const originalSet = g.setInterval, originalClear = g.clearInterval, timers = new Map();
  let serial = 0;
  g.setInterval = (fn, ms) => { const id = 'facility-clock-' + ++serial; timers.set(id, { fn, ms }); return id; };
  g.clearInterval = id => { if (!timers.delete(id)) originalClear(id); };
  return { timers, step() { for (const { fn } of [...timers.values()]) fn(); }, restore() { g.setInterval = originalSet; g.clearInterval = originalClear; timers.clear(); } };
}
async function click(h, selector) {
  const el = h.g.document.querySelector(selector);
  assert.ok(el, selector); assert.equal(el.disabled, false, selector); el.click(); await h.drain();
}
async function warehouse(h) {
  const g = h.g, HW = g.HideoutWarehouse;
  HW.setState(HW.createDefaultState());
  assert.equal(HW.pickInitialRoute('U-A1').ok, true);
  HW.setMaterialProgress('U-A1', HW.getUpgradeEntry('U-A1').material_points);
  assert.equal(HW.isUpgradeMaterialReady('U-A1'), true);
  g.SceneApp.openHideoutWarehousePanel(); await h.drain();
  await click(h, '#hw-btn-upgrade'); await click(h, '#hw-btn-upgrade-start');
}

for (const full of [false, true]) test(`warehouse waits advance world time (${full ? 'Svelte' : 'classic'})`, async () => {
  const h = await boot(full), g = h.g; let clock;
  try {
    await player(h); clock = intervals(g); await warehouse(h);
    const before = times(g), remaining = g.HideoutWarehouse.getActiveUpgradeTask().ticks_remaining;
    assert.equal(clock.timers.size, 1);
    clock.step(); await h.drain();
    assert.equal(g.HideoutWarehouse.getActiveUpgradeTask().ticks_remaining, remaining - 1);
    expectTicks(g, before, 1, 'a paid construction step must also advance the world clock');
    const saved = JSON.parse(g.localStorage.getItem(g.SaveSystem.getStatus().realtimeKey));
    assert.equal(saved.time.totalTicks, before[0] + 1);
    assert.equal(saved.player.survival.tickCount, before[1] + 1);
    assert.match(g.document.getElementById('hud-time-period').textContent, /09:10/);
    await click(h, '#hw-btn-upgrade-start');
    clock.step(); expectTicks(g, before, 1, 'paused construction spends no time');
    await click(h, '#hw-btn-upgrade-start');
    const save = g.SaveSystem.saveNow;
    g.SaveSystem.saveNow = () => false;
    clock.step(); await h.drain(); g.SaveSystem.saveNow = save;
    assert.equal(clock.timers.size, 0, 'save failure stops the wait');
    expectTicks(g, before, 2, 'unsaved work and world time remain together in memory');
    assert.equal(g.HideoutWarehouse.getActiveUpgradeTask().ticks_remaining, remaining - 2);
    await click(h, '#hw-btn-upgrade-start');
    g.GameEngine.setState('M0_Base_Inside_lv_1', 10, 7);
    const stamina = g.Survival.getStamina(); clock.step();
    expectTicks(g, before, 2, 'stale timer after leaving the warehouse does not work');
    assert.equal(g.Survival.getStamina(), stamina);
    assert.equal(g.HideoutWarehouse.getActiveUpgradeTask().ticks_remaining, remaining - 2);
    assert.deepEqual(h.errors, []);
  } finally { clock?.restore(); await h.close(); }
});

for (const full of [false, true]) test(`cooking and pharmacy timers drive real world systems (${full ? 'Svelte' : 'classic'})`, async () => {
  const h = await boot(full), g = h.g; let clock;
  try {
    await player(h, 12, 14); clock = intervals(g); equipPharmacyTestBag(g);
    g.NPCSystem.setDemoFlag('facility_restored:livestock', true);
    g.NPCSystem.setDemoFlag('facility_restored:agriculture', true);
    g.SceneCtx.agriculture_unlocked = true;
    const farm = g.AgricultureMap.ensureState();
    g.LivestockState.ensureState();
    assert.equal(g.CompostSystem.startBatch('anaerobic', { c_total: 30, n_total: 1, materials: [{ item_id: 'herb_straw', count: 2 }] }).ok, true);
    const observed = () => [g.LivestockState.getState().elapsed_ticks || 0, g.CompostSystem.getBatch('anaerobic').age_ticks];
    g.NPCSystem.setDemoFlag('cooking_base_station_unlocked', true);
    g.CookingStation.getState().fuel_points = 100;
    const inputs = [{ item_id: 'herb_wheat_flour', count: 1 }, { item_id: 'ore_water_pure_soft', count: 1 }, { item_id: 'ore_salt_sea', count: 1 }];
    g.InventoryEquipment.setState({ ...g.InventoryEquipment.getState(), inventory_backpack: inputs });
    let before = times(g), other = observed();
    const cooking = g.SceneApp.tryCookAtStation('roast_bake', inputs);
    assert.equal(cooking.ok, true, JSON.stringify(cooking));
    expectTicks(g, before, 0, 'starting a timed craft does not skip the wait');
    for (let i = 1; i <= cooking.remaining_ticks; i++) {
      clock.step(); expectTicks(g, before, i);
      assert.deepEqual(observed(), other.map(n => n + i));
      assert.equal(farm.tick, g.GameTime.getState().totalTicks);
    }
    assert.equal(g.CookingStation.getActiveCraft(), null); assert.equal(clock.timers.size, 0);
    g.GameEngine.setState('M0_Base_Inside_lv_1', 13, 14);
    g.NPCSystem.setDemoFlag('npc_station_pharmacy_base_repaired', true);
    const ps = g.PharmacyStation, recipe = ps.getRecipes().find(r => r.recipe_id === 'life_pharmacy.crush_cannabis_powder');
    ps.getState().installed_accessory_item_ids = [ps.getMethods()[recipe.method_id].requires_accessory_item_id];
    g.InventoryEquipment.setState({ ...g.InventoryEquipment.getState(), inventory_backpack: copy(recipe.inputs) });
    before = times(g); other = observed();
    const pharmacy = g.SceneApp.tryPharmacyAtStation(recipe.method_id, recipe.inputs);
    assert.equal(pharmacy.ok, true, JSON.stringify(pharmacy)); expectTicks(g, before, 0);
    for (let i = 1; i <= pharmacy.remaining_ticks; i++) {
      clock.step(); expectTicks(g, before, i);
      assert.deepEqual(observed(), other.map(n => n + i));
      assert.equal(farm.tick, g.GameTime.getState().totalTicks);
    }
    assert.equal(ps.getActiveCraft(), null); assert.equal(clock.timers.size, 0);
    assert.deepEqual(h.errors, []);
  } finally { clock?.restore(); await h.close(); }
});

test('outdoor construction, farm and ranch waiting share the clock with fermentation', async () => {
  const h = await boot(false), g = h.g; let clock;
  try {
    await player(h); clock = intervals(g);
    g.GameEngine.setState('M0_Base_Outside_lv_1', 5, 10);
    let before = times(g);
    assert.equal(g.FacilityLabor.work('agriculture').ok, true); expectTicks(g, before, 1);
    g.GameEngine.setState('M0_Base_Outside_lv_1', 10, 9); before = times(g);
    assert.equal(g.FacilityLabor.work('livestock').ok, true); expectTicks(g, before, 1);
    for (const id of ['agriculture', 'livestock']) g.NPCSystem.setDemoFlag('facility_restored:' + id, true);
    assert.equal(g.CompostSystem.startBatch('aerobic', { c_total: 30, n_total: 1, materials: [{ item_id: 'herb_straw', count: 2 }] }).ok, true);
    g.GameEngine.setState('M0_Base_Outside_lv_1', 5, 10); g.SceneApp.openAgriculturePanel();
    const farm = g.AgricultureMap.ensureState();
    farm.task = { type: 'till', x: 3, y: 3, progress: 0, paused: false };
    before = times(g);
    const age = g.CompostSystem.getBatch('aerobic').age_ticks;
    const ranch = g.LivestockState.getState().elapsed_ticks;
    g.SceneApp.setAgricultureAutoTickEnabled(true); clock.step();
    expectTicks(g, before, 1); assert.equal(farm.task.progress, 1); assert.equal(farm.tick, before[0] + 1);
    assert.equal(g.CompostSystem.getBatch('aerobic').age_ticks, age + 1);
    assert.equal(g.LivestockState.getState().elapsed_ticks, ranch + 1);
    g.SceneApp.setAgricultureAutoTickEnabled(false);
    const manual = g.SceneApp.tryAgricultureAction('advance_ticks', { n: 2 });
    assert.equal(manual.advanced, 2); expectTicks(g, before, 3); assert.equal(farm.task.progress, 3);
    g.GameEngine.setState('M0_Base_Outside_lv_1', 10, 9); g.SceneApp.openLivestockPanel();
    before = times(g); g.SceneApp.setLivestockAutoTickEnabled(true); clock.step();
    expectTicks(g, before, 1); assert.equal(farm.task.progress, 3, 'closed farm does not continue manual construction');
    assert.equal(farm.tick, before[0] + 1); assert.equal(g.CompostSystem.getBatch('aerobic').age_ticks, age + 4);
    assert.equal(g.LivestockState.getState().elapsed_ticks, ranch + 4);
    g.SceneApp.setLivestockAutoTickEnabled(false); assert.deepEqual(h.errors, []);
  } finally { clock?.restore(); await h.close(); }
});

test('sewing tools, sewing jobs and forging work pay world ticks', async () => {
  const h = await boot(false), g = h.g;
  try {
    await player(h, 6, 12);
    const tools = g.FacilityUnlock.get('sewing_tape');
    // Resume already-prepared construction without depending on the material-picker UI.
    g.NPCSystem.setDemoFlag(tools.spec.key || 'facility_progress:sewing_tape',
      Object.fromEntries(tools.groups.map(row => [row.id, row.need])));
    let before = times(g); assert.equal(tools.work().ok, true); expectTicks(g, before, 1);
    assert.equal(tools.work().ok, true); expectTicks(g, before, 2);
    g.NPCSystem.setDemoFlag('sewing_scale_unlocked', true); g.NPCSystem.setDemoFlag('sewing_station_unlocked', true);
    assert.equal(g.SewingStationPanel.open(), true);
    before = times(g); assert.equal(g.SewingSystem.start([{ type: 'measure' }]).ok, true); expectTicks(g, before, 0);
    assert.equal(g.SewingSystem.step().ok, true); expectTicks(g, before, 1); assert.equal(g.SewingSystem.jobState(), null);
    g.SewingStationPanel.close();
    g.GameEngine.setState('M0_Base_Inside_lv_1', 5, 12); g.NPCSystem.setDemoFlag('forging_station_unlocked', true);
    g.InventoryEquipment.setState({ ...g.InventoryEquipment.getState(), inventory_pocket: [{ item_id: 'ore_iron_raw', count: 1 }] });
    const raw = g.ForgingSystem.snapshot().items.find(item => item.item_id === 'ore_iron_raw');
    assert.equal(g.ForgingSystem.inspectOre(raw.instance_id).ok, true);
    const start = g.ForgingSystem.start({ type: 'process', id: raw.instance_id }); assert.equal(start.ok, true, JSON.stringify(start));
    before = times(g);
    for (let i = 1; i <= start.job.ticks; i++) { assert.equal(g.ForgingSystem.step().ok, true); expectTicks(g, before, i); }
    assert.equal(g.ForgingSystem.state().job, null); assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('world consumers do not advance when survival rejects a tick', async () => {
  const h = await boot(false), g = h.g;
  try {
    await player(h);
    g.CookingStation.getState().active_craft = { remaining_ticks: 3 };
    g.PharmacyStation.getState().active_craft = { remaining_ticks: 3 };
    g.Survival.setState({ isDead: true });
    const before = times(g);
    g.Survival.advanceTick();
    expectTicks(g, before, 0);
    assert.equal(g.CookingStation.getActiveCraft().remaining_ticks, 3);
    assert.equal(g.PharmacyStation.getActiveCraft().remaining_ticks, 3);
  } finally { await h.close(); }
});

test('gym and sleep locks stop other clocks; their paid ticks advance time across midnight', async () => {
  const h = await boot(false), g = h.g;
  try {
    await player(h, 5, 5);
    let now = 0, serial = 0;
    const pending = new Map(), set = g.setTimeout, clear = g.clearTimeout;
    g.performance.now = () => now;
    g.setTimeout = (fn, ms, ...args) => {
      if (![1000, 3000].includes(ms)) return set(fn, ms, ...args);
      const id = 'world-time-' + ++serial; pending.set(id, { fn, ms }); return id;
    };
    g.clearTimeout = id => { if (!pending.delete(id)) clear(id); };
    const step = () => {
      assert.equal(pending.size, 1);
      const [id, { fn, ms }] = [...pending][0]; pending.delete(id); now += ms; fn();
    };
    g.GameTime.reset({ year: 1, day: 1, hour: 23, minute: 50 });
    let before = times(g);
    assert.equal(g.GymSystem.startTraining('pushup').ok, true); expectTicks(g, before, 0);
    g.Survival.advanceTick({ source: 'rest' }); expectTicks(g, before, 0);
    step(); expectTicks(g, before, 1); assert.equal(g.GymSystem.getState().job.ticks, 1);
    assert.equal(g.GameTime.getState().dayOfYear, 2); assert.equal(g.GameTime.getState().hour, 0);
    step(); expectTicks(g, before, 2); assert.equal(g.GymSystem.isActive(), false);
    g.GameEngine.setState('M0_Base_Inside_lv_1', 10, 15); g.Survival.setState({ fatigue: 100 }); g.confirm = () => true;
    before = times(g); assert.equal(g.SceneApp.trySleepAtBed(), true); expectTicks(g, before, 0);
    g.Survival.advanceTick({ source: 'warehouse_construction' }); expectTicks(g, before, 0);
    step(); expectTicks(g, before, 1); assert.equal(g.BedSleep.getState().completed, 1);
    g.BedSleep.interrupt(); assert.equal(pending.size, 0); assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
