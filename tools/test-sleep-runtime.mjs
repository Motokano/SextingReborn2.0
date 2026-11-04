import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

// Control only the 1-second callbacks. Saves, world ticks and both UI shells stay real.
function clockFor(g) {
  let now = 0, serial = 0;
  g.performance.now = () => now;
  const pending = new Map(), nativeSet = g.setTimeout.bind(g), nativeClear = g.clearTimeout.bind(g);
  g.setTimeout = (fn, ms, ...args) => {
    if (ms !== 1000) return nativeSet(fn, ms, ...args);
    const id = 'sleep-test-' + (++serial); pending.set(id, { at: now + ms, fn: () => fn(...args) }); return id;
  };
  g.clearTimeout = id => { if (!pending.delete(id)) nativeClear(id); };
  return {
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...pending].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at; pending.delete(next[0]); next[1].fn();
      }
      now = end;
    },
    get size() { return pending.size; },
    fireLate(ms) {
      const first = [...pending.entries()][0];
      now += ms; pending.delete(first[0]); first[1].fn();
    },
    get callback() { return [...pending.values()][0]?.fn; }
  };
}
async function fresh(full, storage) {
  let clock;
  const h = await boot(full, { storage, beforeScripts: g => { clock = clockFor(g); } });
  return Object.assign(h, { clock });
}
async function createPlayer(h) {
  const g = h.g;
  g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain();
  const name = g.document.getElementById('creation-name'); name.value = '睡眠测试';
  name.dispatchEvent(new g.Event('input', { bubbles: true })); await h.drain();
  g.document.getElementById('btn-confirm-creation').click(); await h.drain(); g.DialogueUI.close();
  g.GameEngine.setState('M0_Base_Inside_lv_1', 10, 15);
  assert.equal(g.StationContext.isOnBedStationTile(), true); reset(g);
}
function reset(g, extra = {}) {
  g.Survival.setState({ stamina: 4, fatigue: 100, satiety: 100, thirst: 100, energy: 100,
    isDead: false, isComa: false, food_metabolism: null, weight_kg: 60, starvationTicks: 0, ...extra });
  g.confirm = () => true;
}
const plain = v => JSON.parse(JSON.stringify(v));
const resources = g => {
  const s = g.Survival.getState();
  return [s.tickCount, s.stamina, s.fatigue, s.satiety, s.thirst, g.GameTime.getState().totalTicks];
};
function failWrites(g) {
  const old = g.Storage.prototype.setItem;
  g.Storage.prototype.setItem = () => { throw Error('quota'); };
  return () => { g.Storage.prototype.setItem = old; };
}
for (const full of [false, true]) test(`48 paid seconds, action lock and atomic retry in ${full ? 'Svelte' : 'classic'}`, async () => {
  const h = await fresh(full), { g, clock } = h;
  try {
    await createPlayer(h);
    const S = g.Survival, B = g.BedSleep, savedKey = g.SaveSystem.getStatus().realtimeKey;
    const before = resources(g), startTick = before[0];
    S.setState({ fatigue: 50 }); assert.equal(g.SceneApp.trySleepAtBed(), false);
    S.setState({ fatigue: 100 }); g.confirm = () => false;
    assert.equal(g.SceneApp.trySleepAtBed(), false); assert.deepEqual(resources(g), before);
    g.confirm = () => true;
    let repair = failWrites(g);
    assert.equal(g.SceneApp.trySleepAtBed(), false, 'failed start grants no recovery');
    assert.equal(B.isActive(), false); assert.deepEqual(resources(g), before); repair();
    let confirmation;
    g.confirm = t => { confirmation = t; return true; };
    let settles = 0;
    const settle = g.CharacterAttributes.settleAttributeExpOnce;
    g.CharacterAttributes.settleAttributeExpOnce = (...args) => { settles++; return settle(...args); };
    g.CharacterAttributes.setState({ attribute_experience: { jingu: { exp: 5000, attribute_level: 0, total_gained: 5000 } } });
    assert.equal(g.SceneApp.trySleepAtBed(), true);
    assert.match(confirmation, /48 刻，需等待 48 秒/);
    assert.deepEqual(resources(g), before, 'start cannot advance time or grant recovery');
    assert.equal(g.document.querySelector('#bed-sleep-panel').open, true);
    assert.match(g.document.querySelector('.bed-sleep-time').textContent, /48 秒/);
    assert.equal(JSON.parse(g.localStorage.getItem(savedKey)).bed_sleep.completed, 0);
    assert.equal(g.SceneApp.trySleepAtBed(), false, 'duplicate start rejected');
    assert.equal(g.SceneApp.isStoryMovementLocked(), true);
    assert.equal(g.SceneApp.guardPlayerActionBlocked('item_use'), true);
    assert.equal(g.SceneApp.guardPlayerActionBlocked('craft'), true);
    S.advanceTick(); S.advanceTick({ source: 'sleep' });
    assert.deepEqual(resources(g), before, 'other callers cannot accelerate sleep');
    const cancel = new g.Event('cancel', { cancelable: true });
    g.document.querySelector('#bed-sleep-panel').dispatchEvent(cancel); assert.equal(cancel.defaultPrevented, true);
    clock.advance(999); assert.deepEqual(resources(g), before); clock.advance(1);
    assert.deepEqual(resources(g), [startTick + 1, 6, 98, 99, 99, before[5] + 1]);
    assert.equal(JSON.parse(g.localStorage.getItem(savedKey)).bed_sleep.completed, 1);
    // Failed ticks restore resources and time; retry waits a new full second.
    const tickOne = resources(g), sessionOne = plain(B.getState()); repair = failWrites(g);
    clock.advance(1000); assert.deepEqual(resources(g), tickOne); assert.deepEqual(plain(B.getState()), sessionOne);
    assert.equal(clock.size, 0); assert.equal(g.document.querySelector('.bed-sleep-retry').hidden, false);
    repair(); g.document.querySelector('.bed-sleep-retry').click();
    clock.advance(999); assert.deepEqual(resources(g), tickOne); clock.advance(1);
    assert.equal(B.getState().completed, 2);
    // Hidden time and stale callbacks do not count as completed seconds.
    let hidden = false;
    Object.defineProperty(g.document, 'hidden', { configurable: true, get: () => hidden });
    clock.advance(500); const stale = clock.callback;
    hidden = true; g.document.dispatchEvent(new g.Event('visibilitychange'));
    clock.advance(10000); stale(); assert.equal(B.getState().completed, 2);
    hidden = false; g.document.dispatchEvent(new g.Event('visibilitychange'));
    clock.advance(999); assert.equal(B.getState().completed, 2); clock.advance(1);
    assert.equal(B.getState().completed, 3);
    clock.fireLate(10000); assert.equal(B.getState().completed, 4, 'a late callback settles only one tick');
    clock.advance(999); assert.equal(B.getState().completed, 4); clock.advance(1);
    assert.equal(B.getState().completed, 5, 'the next tick still waits a full second');
    // Final-tick rollback must restore both attribute experience and its dedup marker.
    const deterministic = B.getState(); deterministic.rolls.fill(0);
    B.restore(deterministic, true); B.resume();
    clock.advance(42000); assert.equal(B.getState().completed, 47); assert.equal(settles, 0);
    assert.equal(S.getStamina(), 98); assert.equal(S.getFatigue(), 6);
    const lastBefore = resources(g), attrsBefore = plain(g.CharacterAttributes.getState().attribute_experience);
    repair = failWrites(g); clock.advance(1000);
    assert.equal(settles, 1); assert.equal(B.getState().completed, 47);
    assert.deepEqual(resources(g), lastBefore); assert.deepEqual(plain(g.CharacterAttributes.getState().attribute_experience), attrsBefore);
    repair(); g.document.querySelector('.bed-sleep-retry').click(); const lastCallback = clock.callback;
    clock.advance(999); assert.equal(B.isActive(), true); clock.advance(1);
    assert.equal(settles, 2); assert.equal(B.isActive(), false);
    assert.equal(g.CharacterAttributes.getState().attribute_experience.jingu.attribute_level, 1);
    assert.deepEqual(resources(g), [startTick + 48, 100, 4, 52, 52, before[5] + 48]);
    assert.equal(S.getState().isResting, false);
    assert.equal(g.document.querySelector('#bed-sleep-panel').open, false);
    assert.equal(JSON.parse(g.localStorage.getItem(savedKey)).bed_sleep, null);
    lastCallback(); clock.advance(10000); assert.equal(settles, 2); assert.equal(S.getState().tickCount, startTick + 48);
    assert.equal(g.SceneApp.guardPlayerActionBlocked('item_use'), false);
    reset(g, { satiety: 5 }); const poorTick = S.getState().tickCount;
    assert.equal(g.SceneApp.trySleepAtBed(), true); clock.advance(48000);
    assert.equal(S.getState().tickCount, poorTick + 48); assert.equal(S.getStamina(), 14);
    assert.equal(S.getFatigue(), 90); assert.equal(S.getSatiety(), 0); assert.equal(S.getThirst(), 52);
    reset(g, { stamina: 100, fatigue: 60 });
    assert.equal(g.SceneApp.trySleepAtBed(), true); clock.advance(30000);
    assert.equal(S.getFatigue(), 0); assert.equal(B.isActive(), true);
    clock.advance(18000); assert.equal(S.getSatiety(), 52); assert.equal(S.getThirst(), 52);
    assert.equal(B.isActive(), false);
    // Death interrupts immediately without completion settlement.
    reset(g, { satiety: 0, starvationTicks: 431 }); const deathTick = S.getState().tickCount, settledBeforeDeath = settles;
    assert.equal(g.SceneApp.trySleepAtBed(), true); clock.advance(1000); await h.drain();
    assert.equal(S.isDead(), true); assert.equal(B.isActive(), false);
    clock.advance(48000); assert.equal(S.getState().tickCount, deathTick + 1); assert.equal(settles, settledBeforeDeath);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('reload resumes remaining seconds; old saves work and malformed sessions are rejected', async () => {
  let h = await fresh(false);
  try {
    await createPlayer(h); h.g.SceneApp.trySleepAtBed(); h.clock.advance(7000);
    const before = resources(h.g), session = plain(h.g.BedSleep.getState());
    const storage = Object.fromEntries(Object.entries(h.g.localStorage));
    await h.close(); h = await fresh(true, storage);
    const { g, clock } = h;
    assert.deepEqual(resources(g), before); assert.deepEqual(plain(g.BedSleep.getState()), session);
    assert.equal(g.document.querySelector('#bed-sleep-panel').open, true);
    clock.advance(999); assert.deepEqual(resources(g), before); clock.advance(1);
    assert.equal(g.BedSleep.getState().completed, 8);
    clock.advance(40000); assert.equal(g.BedSleep.isActive(), false); assert.equal(g.Survival.getSatiety(), 52);
    const snapshot = g.SaveSystem.buildSnapshotForDebug(); snapshot.bed_sleep = { ...session, completed: -1 };
    const unchanged = resources(g); assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot), false);
    assert.deepEqual(resources(g), unchanged); delete snapshot.bed_sleep;
    assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot), true); await h.drain();
    assert.equal(g.BedSleep.isActive(), false); assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
