import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

const skill = 'special_meridian_studies';
const book = n => ({ item_id: 'book_anatomy_textbook', count: 1, attribute_state: { knowledge: { book: { version: 1, fragments: n } } } });
async function setup(h, fragments = 1) {
  const g = h.g;
  g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain();
  g.SceneApp.creation.confirm({ name: '教材阅读验收', height: 178, gender: 'male', hand: 'right', leg: 'right' }); await h.drain(); g.DialogueUI.close();
  g.GameEngine.setState('M0_Base_Inside_lv_1', 10, 7);
  const s = g.InventoryEquipment.getState();
  s.equipment.backpack = g.BackpackSystem.generate('eq_backpack_light_canvas');
  s.inventory_backpack = [book(fragments)]; s.inventory_pocket = []; s.inventory_vehicle = []; s.bound_vehicle_id = null;
  s.skills[skill] = { level: 0, study_exp: 37, move_usage: {} };
  s.skills.survival_language = { level: 0, study_exp: 0, move_usage: {} }; s.potential = 10000;
  g.InventoryEquipment.setState(s); g.Survival.setState({ energy: 100, stamina: 100, satiety: 100, thirst: 100, isDead: false, isComa: false });
  // Exercise the real scheduler without wall-clock waits or missed-tick catch-up.
  const timers = new Map(), originalSet = g.setTimeout, originalClear = g.clearTimeout; let id = 900000;
  g.setTimeout = (fn, ms, ...args) => { if (ms === g.SceneApp.getFacilityLaborTickMs()) { timers.set(++id, fn); return id; } return originalSet(fn, ms, ...args); };
  g.clearTimeout = timer => { if (!timers.delete(timer)) originalClear(timer); };
  return { g, I: g.InventoryEquipment, B: g.BookReading, timers,
    request: () => ({ context: g.InventoryTransfer.context('backpack'), id: g.InventoryEquipment.getBackpackArray()[0].instance_id }),
    tick: async () => { assert.equal(timers.size, 1); const [key, fn] = [...timers][0]; timers.delete(key); fn(); await h.drain(); }
  };
}
const balances = g => JSON.stringify([g.InventoryEquipment.getState(), g.Survival.getState(), g.GameTime.getState()]);

test('reading uses real million-XP thresholds, atomic world ticks and persistent fractional language rewards', async () => {
  const h = await boot(false);
  try {
    const { g, I, B, request, tick, timers } = await setup(h);
    const profile = I.getBookInfo(I.getBackpackArray()[0]).profile;
    assert.equal(profile.skill.exp_thresholds[0], 0); assert.equal(profile.skill.exp_thresholds[1], 10000);
    assert.equal(profile.skill.exp_thresholds[10], 100000); assert.equal(profile.skill.exp_thresholds[100], 1000000);
    const req = request(), cost = B.check(req), before = I.getPotential(), world = g.GameTime.getState().totalTicks;
    assert.equal(B.start(req).ok, true); assert.equal(B.start(req).ok, true); assert.equal(timers.size, 1);
    assert.equal(I.getPotential(), before); assert.equal(I.getSkillLevel(skill), 0, 'starting has no free level or XP');
    await tick();
    assert.equal(I.getSkillsState()[skill].book_exp, cost.gain); assert.equal(I.getSkillLevel(skill), 0);
    assert.equal(I.getPotential(), before - cost.gain * 100); assert.equal(g.GameTime.getState().totalTicks, world + 1);
    assert.equal(B.sessionFor(req).languageTenths, cost.gain); assert.equal(I.getSkillsState().survival_language.book_language_tenths, cost.gain % 10);
    B.pause(); const save = g.SaveSystem.buildSnapshotForDebug();
    I.getSkillsState()[skill].book_exp = 0; assert.equal(g.SaveSystem.applySnapshotForDebug(save), true);
    assert.equal(I.getSkillsState()[skill].book_exp, cost.gain); assert.equal(B.isActive(), false); assert.equal(timers.size, 0);
    assert.equal(I.getSkillsState().survival_language.book_language_tenths, cost.gain % 10);
    const old = g.SaveSystem.buildSnapshotForDebug(); delete old.book_reading; assert.equal(g.SaveSystem.applySnapshotForDebug(old), true);
    assert.equal(B.getState().session, null);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('teaching caps stop both rewards and costs; full books preserve reading progress and cannot bypass the cap', async () => {
  const h = await boot(false);
  try {
    const { g, I, B, request, tick } = await setup(h);
    I.getSkillsState()[skill].book_exp = 9999;
    const before = I.getPotential(); assert.equal(B.start(request()).ok, true); await tick();
    assert.equal(I.getSkillLevel(skill), 1); assert.equal(I.getSkillsState()[skill].book_exp, 0);
    assert.equal(I.getPotential(), before - 100); assert.equal(B.sessionFor(request()).earned, 1); assert.equal(B.sessionFor(request()).languageTenths, 1);
    assert.equal(B.isActive(), false); const stopped = balances(g);
    assert.equal(B.start(request()).reason, 'book_cap'); assert.equal(balances(g), stopped);
    assert.equal(g.Survival.startStudy(skill).ok, false, 'generic self-study cannot bypass the book');
    const s = I.getState(); s.inventory_backpack = [book(100)]; s.skills[skill].book_exp = 25; I.setState(s);
    assert.equal(g.BookLearning.consumeFullBook(request()).ok, true);
    assert.equal(I.getSkillLevel(skill), 2); assert.equal(I.getSkillsState()[skill].book_exp, 25);
    assert.equal(I.getSkillsState()[skill].study_exp, 37);
  } finally { await h.close(); }
});

test('one million real reading XP reaches exactly level 100 and grants one hundred thousand language XP', async () => {
  const h = await boot(false);
  try {
    const { g, I, B, request, tick } = await setup(h, 100);
    const s = I.getState(); s.potential = 100000000; I.setState(s);
    const original = g.Survival.getStudyState; g.Survival.getStudyState = () => ({ potentialPerEnergy: 100000000 });
    assert.equal(B.start(request()).ok, true); await tick(); g.Survival.getStudyState = original;
    assert.equal(I.getSkillLevel(skill), 100); assert.equal(I.getSkillsState()[skill].book_total_exp, 1000000);
    assert.equal(I.getSkillsState()[skill].book_exp, 0); assert.equal(I.getPotential(), 0);
    assert.equal(B.sessionFor(request()).languageTenths / 10, 100000); assert.equal(B.isActive(), false);
    let languageSpent = 0;
    for (let level = 0; level < I.getSkillLevel('survival_language'); level++) {
      languageSpent += g.CombatSkills.getPotentialCostForLevel('survival_language', level, { skills: I.getSkillsState(), skill_max_level_bonus: I.getState().skill_max_level_bonus || {} });
    }
    assert.equal(languageSpent + I.getStudyExp('survival_language'), 100000, 'the displayed reward must also reach the actual language skill');
    assert.equal(I.getSkillsState().survival_language.book_language_tenths, 0);
    assert.equal(I.getBookInfo(I.getBackpackArray()[0]).fragments, 100);
  } finally { await h.close(); }
});

test('failed saves restore paid ticks and XP; stale ownership, movement, hidden pages and other actions stop reading', async () => {
  const h = await boot(false);
  try {
    const { g, I, B, request, tick, timers } = await setup(h, 100);
    assert.equal(B.start(request()).ok, true); const before = balances(g), save = g.SaveSystem.saveNow;
    g.SaveSystem.saveNow = () => false; await tick(); g.SaveSystem.saveNow = save;
    assert.equal(balances(g), before); assert.equal(B.sessionFor(request()).earned, 0); assert.equal(B.isActive(), false); assert.equal(timers.size, 0);
    assert.equal(B.start(request()).ok, true); await tick(); assert.ok(B.sessionFor(request()).earned > 0);
    B.pause(); const gained = B.sessionFor(request()).earned; assert.equal(B.start(request()).ok, true);
    g.document.dispatchEvent(new g.Event('visibilitychange')); // Visible events do not interrupt.
    Object.defineProperty(g.document, 'hidden', { configurable: true, value: true }); g.document.dispatchEvent(new g.Event('visibilitychange'));
    assert.equal(B.isActive(), false); assert.equal(timers.size, 0); Object.defineProperty(g.document, 'hidden', { configurable: true, value: false });
    assert.equal(B.start(request()).ok, true); g.Survival.advanceTick(); assert.equal(B.isActive(), false); assert.equal(B.sessionFor(request()).earned, gained);
    assert.equal(B.start(request()).ok, true); const moved = balances(g); g.GameEngine.setState('M0_Base_Inside_lv_1', 11, 7); await tick();
    assert.equal(B.isActive(), false); assert.equal(balances(g), moved);
    const req = request(); assert.equal(B.start(req).ok, true); I.takeItemFromContainer('backpack', 0); await tick(); assert.equal(B.isActive(), false); assert.equal(B.check(req).reason, 'item_moved');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

for (const full of [false, true]) test(`${full ? 'Svelte' : 'native'} inventory reads through the shared book panel and shows completion only after commit`, async () => {
  const h = await boot(full);
  try {
    const { g, I, B, request, tick } = await setup(h, 99), d = g.document;
    g.SceneApp.openBackpackPanel(); await h.drain(); d.querySelector('[data-bp-id="' + request().id + '"]').click(); await h.drain();
    const panel = d.getElementById('book-reading-panel'); assert.equal(panel.hidden, false);
    assert.match(panel.textContent, /学到 99 级/); assert.doesNotMatch(panel.textContent, /潜能|精力|本次语言/);
    d.querySelector('[data-book-read]').click(); await h.drain(); await tick();
    assert.match(panel.textContent, /本次获得：解剖学经验 \+\d+ · 阅读经验 \+0\./);
    g.SceneApp.closePublicModal('modal-backpack'); await h.drain(); assert.equal(B.isActive(), false);
    g.SceneApp.openBackpackPanel(); await h.drain(); d.querySelector('[data-bp-id="' + request().id + '"]').click(); await h.drain();
    assert.equal(panel.isConnected, true); assert.equal(panel.hidden, false);
    const save = g.SaveSystem.saveNow; g.SaveSystem.saveNow = () => false;
    assert.equal(g.InventoryTransfer.receive(book(1)).ok, false); g.SaveSystem.saveNow = save;
    assert.equal(d.getElementById('book-reading-notice')?.hidden ?? true, true);
    assert.equal(g.InventoryTransfer.receive(book(1)).ok, true); await h.drain();
    assert.match(d.getElementById('book-reading-notice').textContent, /教材已集齐/);
    g.SceneApp.panelApi.changed(); await h.drain();
    assert.ok(panel.querySelector('[data-book-consume]'));
    panel.querySelector('[data-book-consume]').click(); await h.drain(); assert.equal(I.getSkillLevel(skill), 1);
    assert.equal(I.getBackpackArray()[0], null);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
