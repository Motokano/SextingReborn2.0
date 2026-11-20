import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { boot } from './ui-game-fixture.mjs';

function pointer(g, type, x = 500, y = 350, target = g.document.getElementById('map-grid'), extra = {}) {
  const e = new g.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra });
  Object.defineProperties(e, { pointerId: { value: extra.pointerId ?? 1 }, isPrimary: { value: extra.isPrimary ?? true } });
  target.dispatchEvent(e); return e;
}
function clock(g) {
  let now = 0, seq = 0; const timers = new Map();
  g.setTimeout = (fn, ms) => { timers.set(++seq, { at: now + ms, fn }); return seq; };
  g.clearTimeout = id => timers.delete(id);
  g.requestAnimationFrame = () => 0; g.cancelAnimationFrame = () => {};
  return ms => { const end = now + ms; for (;;) { const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0]; if (!next || next[1].at > end) break; now = next[1].at; timers.delete(next[0]); next[1].fn(); } now = end; };
}

test('gesture timing: silent 500ms, charge 1000ms; ordinary clicks/drags pass, execution has no leaked click', () => {
  const dom = new JSDOM('<div id="map-wrap"><div id="map-grid"></div><button id="hud">HUD</button></div>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const g = dom.window, tick = clock(g); let executions = [], mapClicks = 0;
  try {
    g.eval(fs.readFileSync('js/action-wheel.js', 'utf8'));
    g.ActionWheel.configure({ canOpen: () => true, getActions: () => Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: '动作' + i, desc: '' })), execute: id => executions.push(id) });
    g.document.getElementById('map-grid').addEventListener('click', () => mapClicks++);
    pointer(g, 'pointerdown'); tick(499); assert.equal(g.document.querySelector('.aw-hold').hidden, true);
    pointer(g, 'pointerup'); pointer(g, 'click'); assert.equal(mapClicks, 1); tick(2000); assert.equal(g.ActionWheel.isOpen(), false);
    pointer(g, 'pointerdown'); tick(500); assert.equal(g.document.querySelector('.aw-hold').hidden, false);
    tick(999); assert.equal(g.ActionWheel.isOpen(), false); tick(1); assert.equal(g.ActionWheel.isOpen(), true);
    pointer(g, 'pointermove', 500, 200); pointer(g, 'pointerup', 500, 200); pointer(g, 'click', 500, 200);
    assert.deepEqual(executions, ['0']); assert.equal(mapClicks, 1); assert.equal(g.ActionWheel.isOpen(), false);
    pointer(g, 'pointerdown'); pointer(g, 'pointerup'); pointer(g, 'click'); assert.equal(mapClicks, 2, 'next intentional map click is accepted immediately');
    pointer(g, 'pointerdown'); tick(500); pointer(g, 'pointermove', 520, 350); tick(2000); assert.equal(g.ActionWheel.isOpen(), false); assert.equal(g.document.querySelector('.aw-hold').hidden, true);
    pointer(g, 'pointerdown', 500, 350, g.document.getElementById('hud')); tick(2000); assert.equal(g.ActionWheel.isOpen(), false);
  } finally { dom.window.close(); }
});

test('cancel paths, multitouch, edge release and small screens never choose an accidental action', () => {
  const dom = new JSDOM('<div id="map-wrap"><div id="map-grid"></div></div>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const g = dom.window, tick = clock(g); let count = 0;
  try {
    g.eval(fs.readFileSync('js/action-wheel.js', 'utf8'));
    g.ActionWheel.configure({ canOpen: () => true, getActions: () => Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: '动作', desc: '' })), execute: () => count++ });
    for (const kind of ['pointercancel', 'blur', 'Escape', 'contextmenu', 'second-touch']) {
      pointer(g, 'pointerdown'); tick(1500); assert.equal(g.ActionWheel.isOpen(), true);
      if (kind === 'blur') g.dispatchEvent(new g.Event('blur'));
      else if (kind === 'Escape') g.document.dispatchEvent(new g.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else if (kind === 'second-touch') pointer(g, 'pointerdown', 520, 350, undefined, { pointerId: 2, isPrimary: false });
      else pointer(g, kind);
      pointer(g, 'pointerup'); assert.equal(g.ActionWheel.isOpen(), false);
    }
    pointer(g, 'pointerdown', 4, 4); tick(1500); pointer(g, 'pointerup', 4, 4); assert.equal(count, 0, 'edge clamp does not auto-select the sector under the held pointer');
    g.innerWidth = 320; g.innerHeight = 568; g.ActionWheel.open(4, 560);
    const wheel = g.document.querySelector('.aw-wheel'); assert.equal(wheel.style.width, '296px'); assert.equal(wheel.style.left, '12px'); assert.equal(wheel.style.top, '260px');
    g.ActionWheel.close(); assert.equal(count, 0);
  } finally { dom.window.close(); }
});

async function setup(full) {
  const h = await boot(full), g = h.g;
  g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain();
  const input = g.document.getElementById('creation-name'); input.value = '轮盘测试'; input.dispatchEvent(new g.Event('input', { bubbles: true }));
  await h.drain(); g.document.getElementById('btn-confirm-creation').click(); await h.drain(); g.DialogueUI.close();
  g.GameEngine.setState('M0_Base_Inside_lv_1', 4, 10);
  g.GameEngine.setMaps({ ...g.GameEngine.getMaps(), action_wheel_test: { map_id: 'action_wheel_test', name: '轮盘测试场', width: 9, height: 9, blocks: [{x: 4, y: 2}], disabled: [], enemies: [], npcs: [], portals: [] } });
  g.GameEngine.setState('action_wheel_test', 2, 2);
  g.Survival.setState({ stamina: 100, energy: 100, satiety: 100, thirst: 100, fatigue: 0, isDead: false, isComa: false });
  g.Math.random = () => .99;
  return h;
}
function choose(g, id) {
  assert.equal(g.ActionWheel.open(), true);
  const button = g.document.querySelector('#player-action-wheel [data-action="' + id + '"]');
  assert.ok(button); button.click();
}
function skills(g) {
  const I = g.InventoryEquipment;
  I.setState({ skills: { ...I.getState().skills, combat_basic_footwork: { level: 1 }, combat_basic_breath: { level: 60 } }, combat: { ...I.getCombatState(), hubs: { ...I.getCombatState().hubs, footwork: 'combat_basic_footwork', breath: 'combat_basic_breath' } } });
}
for (const full of [false, true]) {
  test((full ? 'Svelte' : 'native') + ': real actions, unlocks, step targeting, failed landing and rest interruption', async () => {
    const h = await setup(full), g = h.g;
    try {
      assert.equal(g.document.querySelectorAll('#player-action-wheel').length, 1);
      choose(g, 'rest'); assert.equal(g.Survival.getState().isResting, true); assert.ok(g.PlayerActions.restIdleTimer);
      choose(g, 'rest'); assert.equal(g.Survival.getState().isResting, true, 'rest entry does not toggle off');
      const before = g.WorldTick.getWorldTotalTicks();
      g.ActionWheel.open(); g.ActionWheel.close(); assert.equal(g.Survival.getState().isResting, true); assert.equal(g.WorldTick.getWorldTotalTicks(), before);
      choose(g, 'drink_flask'); assert.equal(g.Survival.getState().isResting, true, 'rejected drink does not stop rest');
      g.InventoryEquipment.setState({ skills: { ...g.InventoryEquipment.getState().skills, combat_basic_footwork: { level: 0 } } });
      choose(g, 'nie_bu'); assert.equal(g.SceneCtx.footworkNieBuMode, false, 'locked action cannot start targeting');
      skills(g); choose(g, 'nie_bu'); assert.equal(g.SceneCtx.footworkNieBuMode, true); assert.equal(g.Survival.getState().isResting, true);
      assert.equal(g.document.querySelector('.aw-target').hidden, false);
      const pos = g.GameEngine.getState();
      g.SceneMovement.tryFootworkNieBuJump(pos.x + 99, pos.y + 99); assert.equal(g.SceneCtx.footworkNieBuMode, true); assert.equal(g.Survival.getState().isResting, true);
      g.document.querySelector('.aw-target button').click(); assert.equal(g.SceneCtx.footworkNieBuMode, false); assert.equal(g.document.querySelector('.aw-target').hidden, true); assert.equal(g.Survival.getState().isResting, true);
      choose(g, 'nie_bu');
      const targets = [[pos.x + 1, pos.y], [pos.x - 1, pos.y], [pos.x, pos.y + 1], [pos.x, pos.y - 1]];
      let moved = false;
      for (const [x, y] of targets) { if (g.SceneMovement.tryFootworkNieBuJump(x, y)) { moved = true; break; } }
      assert.equal(moved, true, 'real engine jumps to a valid nearby tile'); assert.equal(g.SceneCtx.footworkNieBuMode, false);
      assert.equal(g.Survival.getState().isResting, false); assert.equal(g.PlayerActions.restIdleTimer, null); assert.equal(g.document.querySelector('.aw-target').hidden, true);
      assert.ok(g.InventoryEquipment.getHubActionCooldownRemaining('combat_basic_footwork', 'nie_bu') > 0);
      choose(g, 'nie_bu'); assert.equal(g.SceneCtx.footworkNieBuMode, false, 'cooldown remains enforced');
      choose(g, 'rest'); g.SceneMovement.waitInPlace(); assert.equal(g.Survival.getState().isResting, false);
      choose(g, 'rest'); g.Survival.advanceTick({ source: 'rest' }); assert.equal(g.Survival.getState().isResting, true);
      g.SceneMovement.turnToward(1, 0); assert.equal(g.Survival.getState().isResting, false);
      g.Survival.setState({ diqi_current: 1, diqi_max: 30, diqi_cap_limit: 100 }); choose(g, 'rest'); choose(g, 'tiao_xi_once');
      assert.equal(g.Survival.getState().isResting, false); assert.ok(g.PlayerActions.tiaoXiIdleTimer); assert.ok(g.Survival.getState().diqi_current > 1);
      choose(g, 'rest'); assert.equal(g.PlayerActions.tiaoXiIdleTimer, null, 'rest and meditation timers are mutually exclusive');
      assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  });
  test((full ? 'Svelte' : 'native') + ': drink consumes real water, instant burst interrupts rest, opening medical kit does not', async () => {
    const h = await setup(full), g = h.g, I = g.InventoryEquipment;
    try {
      assert.equal(I.equip('water_flask', { item_id: 'tool_flask_bamboo_water', count: 1 }).success, true);
      const flask = g.WaterFlaskUse.equipped(); I.setItemInstanceValue(flask, 'flask_water', 200);
      g.Survival.setState({ thirst: 30 }); choose(g, 'rest'); const before = g.WorldTick.getWorldTotalTicks();
      choose(g, 'drink_flask'); assert.equal(I.getItemInstanceValue(g.WaterFlaskUse.equipped(), 'flask_water'), 175);
      assert.equal(g.WorldTick.getWorldTotalTicks(), before + 1); assert.equal(g.Survival.getState().isResting, false);
      skills(g); g.CombatEngagement.engageEnemy({ mapId: g.GameEngine.getState().mapId, index: 0, enemyId: 'wheel_test', record: { enemy_id: 'wheel_test', x: 7, y: 7 } });
      g.CombatBreath.spent(200); assert.equal(g.CombatBreath.canActivate(), true);
      choose(g, 'rest'); const burstTick = g.WorldTick.getWorldTotalTicks(); choose(g, 'cui_qi');
      assert.ok(g.CombatBreath.active()); assert.equal(g.WorldTick.getWorldTotalTicks(), burstTick, 'instant burst retains its zero-tick cost');
      assert.equal(g.Survival.getState().isResting, false); assert.equal(g.PlayerActions.restIdleTimer, null);
      g.CombatEngagement.clear('wheel_test_complete');
      assert.equal(I.equip('medical_kit', { item_id: 'tool_medical_kit_basic', count: 1 }).success, true);
      const kit = g.MedicalKit.equipped().instance_id;
      I.setState({ inventory_pocket: [{ item_id: 'supply_medical_trauma_dressing', count: 1 }] });
      assert.equal(g.MedicalActions.refill(kit, 'trauma_dressing').ok, true);
      g.CharacterAttributes.setState({ part_destroy: { head: 0, chest: 0, abdomen: 0, lhand: 70, rhand: 0, lfoot: 20, rfoot: 0 }, surgical_max_loss: {} });
      let restTick; const interval = g.setInterval;
      g.setInterval = (fn, ms) => { if (ms === 5000) restTick = fn; return interval(fn, ms); };
      choose(g, 'rest'); g.setInterval = interval; const openTick = g.WorldTick.getWorldTotalTicks(); choose(g, 'medical_kit');
      assert.equal(g.MedicalKitPanel.isOpen(), true); assert.equal(g.Survival.getState().isResting, true);
      assert.equal(g.WorldTick.getWorldTotalTicks(), openTick); assert.ok(g.PlayerActions.restIdleTimer);
      assert.equal(g.document.querySelector('#part-lfoot .body-damage strong').textContent, '20');
      for (let i = 0; i < 4; i++) restTick();
      const recoveredFoot = g.CharacterAttributes.getPartDestroy('lfoot'); assert.ok(recoveredFoot < 20);
      assert.equal(Number(g.document.querySelector('#part-lfoot .body-damage strong').textContent), recoveredFoot, 'open kit updates as resting heals the body');
      assert.equal(g.MedicalActions.treat(kit, 'rhand', 'trauma_dressing', 'normal').ok, false);
      assert.equal(g.Survival.getState().isResting, true, 'invalid treatment keeps resting');
      const saveNow = g.SaveSystem.saveNow; g.SaveSystem.saveNow = () => false;
      assert.equal(g.MedicalActions.treat(kit, 'lhand', 'trauma_dressing', 'normal').ok, false);
      g.SaveSystem.saveNow = saveNow;
      assert.equal(g.CharacterAttributes.getPartDestroy('lhand'), 70);
      assert.equal(g.Survival.getState().isResting, true); assert.ok(g.PlayerActions.restIdleTimer, 'failed treatment restores rest timer');
      assert.equal(g.MedicalActions.treat(kit, 'lhand', 'trauma_dressing', 'normal').ok, true);
      assert.equal(g.CharacterAttributes.getPartDestroy('lhand'), 30); assert.equal(g.Survival.getState().isResting, false);
      assert.equal(g.PlayerActions.restIdleTimer, null); assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  });
}

test('rest stops before an action heals, and an atomic failure restores both rest state and timer', async () => {
  const h = await setup(false), g = h.g;
  try {
    choose(g, 'rest');
    let atTick; const old = g.CharacterAttributes.onWorldTickDestroyRecover;
    g.CharacterAttributes.onWorldTickDestroyRecover = options => { atTick = g.Survival.getState().isResting; return old(options); };
    g.Survival.advanceTick({ source: 'item_use' }); assert.equal(atTick, false); assert.equal(g.PlayerActions.restIdleTimer, null);
    choose(g, 'rest'); const tick = g.WorldTick.getWorldTotalTicks(), oldWrite = g.Storage.prototype.setItem;
    g.Storage.prototype.setItem = () => { throw Error('quota'); };
    const result = g.SaveSystem.runAtomicFor('water.drink', () => g.Survival.advanceTick({ source: 'water_flask_drink' }));
    g.Storage.prototype.setItem = oldWrite;
    assert.equal(result.saved, false); assert.equal(g.WorldTick.getWorldTotalTicks(), tick);
    assert.equal(g.Survival.getState().isResting, true); assert.ok(g.PlayerActions.restIdleTimer, 'rollback must not leave a resting player without an automatic timer');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
