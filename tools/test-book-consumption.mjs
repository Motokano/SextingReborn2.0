import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

const skillId = 'special_meridian_studies';
const book = (fragments = 100) => ({ item_id: 'book_anatomy_textbook', count: 1, attribute_state: { knowledge: { book: { version: 1, fragments } } } });
const clone = x => JSON.parse(JSON.stringify(x));
async function setup(h, books = [book()], level = 0) {
  const g = h.g;
  g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain();
  const name = g.document.getElementById('creation-name'); name.value = '完整教材';
  name.dispatchEvent(new g.Event('input', { bubbles: true })); await h.drain();
  g.document.getElementById('btn-confirm-creation').click(); await h.drain(); g.DialogueUI.close();
  g.GameEngine.setState('M0_Base_Inside_lv_1', 5, 12);
  g.Survival.setState({ isDead: false, isComa: false, stamina: 100, energy: 100, thirst: 100 });
  reset(g, books, level);
}
function reset(g, books = [book()], level = 0) {
  const I = g.InventoryEquipment, s = I.getState();
  s.equipment = Object.fromEntries(Object.keys(s.equipment).map(k => [k, null]));
  s.equipment.clothing = { item_id: 'eq_clothing_combat_suit', count: 1 };
  s.equipment.backpack = g.BackpackSystem.generate('eq_backpack_light_canvas');
  s.inventory_backpack = books; s.inventory_pocket = []; s.inventory_vest = [];
  s.inventory_vehicle = []; s.bound_vehicle_id = null; s.ground_items = {};
  s.skills[skillId] = { level, study_exp: 37, move_usage: { kept: 4 }, reading_exp: 12.5 };
  s.skills.survival_language = { level: 0, study_exp: 9, move_usage: {} };
  I.setState(s);
}
const request = (g, type = 'backpack', index = 0) => ({ context: g.InventoryTransfer.context(type), id: g.InventoryTransfer.read(g.InventoryTransfer.context(type)).items[index].instance_id });
const snapshot = g => JSON.stringify([g.InventoryEquipment.getState(), g.HideoutWarehouse.getState(), g.GameTime.getState(), g.Survival.getState()]);

test('full books give exactly one level, preserve progress/resources and reject stale, partial or max-level use', async () => {
  const h = await boot(false), g = h.g;
  try {
    await setup(h, [book(), book(45), book()]); const I = g.InventoryEquipment, B = g.BookLearning;
    const r = request(g), oldSkill = clone(I.getSkillsState()[skillId]), oldLanguage = JSON.stringify(I.getSkillsState().survival_language);
    const resources = JSON.stringify([I.getState().potential, g.Survival.getState(), g.GameTime.getState()]);
    const statusBefore = snapshot(g); assert.equal(B.checkConsumption(r).ok, true); assert.equal(snapshot(g), statusBefore);
    assert.equal(B.consumeFullBook(r).ok, true);
    assert.deepEqual(clone(I.getSkillsState()[skillId]), { ...oldSkill, level: 1 });
    assert.equal(I.getBackpackArray()[0], null);
    assert.equal(I.getBookInfo(I.getBackpackArray()[1]).fragments, 45);
    assert.equal(I.getBookInfo(I.getBackpackArray()[2]).fragments, 100);
    assert.equal(JSON.stringify(I.getSkillsState().survival_language), oldLanguage);
    assert.equal(JSON.stringify([I.getState().potential, g.Survival.getState(), g.GameTime.getState()]), resources);
    const after = snapshot(g); assert.equal(B.consumeFullBook(r).ok, false); assert.equal(snapshot(g), after);
    const partial = request(g, 'backpack', 1); assert.equal(B.consumeFullBook(partial).reason, 'incomplete'); assert.equal(snapshot(g), after);
    const saved = g.SaveSystem.buildSnapshotForDebug(); reset(g);
    assert.equal(g.SaveSystem.applySnapshotForDebug(saved), true);
    assert.equal(I.getSkillLevel(skillId), 1); assert.equal(I.getBackpackArray()[0], null);
    assert.equal(I.getSkillsState()[skillId].reading_exp, 12.5);
    reset(g, [book(), book()], 99);
    assert.equal(B.consumeFullBook(request(g)).ok, true); assert.equal(I.getSkillLevel(skillId), 100);
    const max = snapshot(g); assert.equal(B.consumeFullBook(request(g, 'backpack', 1)).reason, 'max_level'); assert.equal(snapshot(g), max);
    reset(g); delete I.getSkillsState()[skillId];
    assert.equal(B.consumeFullBook(request(g)).ok, true); assert.equal(I.getSkillLevel(skillId), 1, 'missing skill can be learned');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('consuming checks current ownership, active actions, seals and rollback before removing the book', async () => {
  const h = await boot(false), g = h.g;
  try {
    await setup(h); const I = g.InventoryEquipment, B = g.BookLearning;
    let r = request(g); const before = snapshot(g), save = g.SaveSystem.saveNow;
    g.SaveSystem.saveNow = () => false;
    assert.equal(B.consumeFullBook(r).reason, 'save_failed'); g.SaveSystem.saveNow = save;
    assert.equal(snapshot(g), before, 'failed save restores the exact book identity and all progress');
    assert.equal(B.consumeFullBook(r).ok, true, 'retry uses the restored full book once');
    reset(g); r = request(g);
    const stale = clone(r), moved = I.takeItemFromContainer('backpack', 0).item;
    const pos = g.GameEngine.getState(); I.addItemToGround(pos.mapId, pos.x, pos.y, moved);
    assert.equal(B.consumeFullBook(stale).reason, 'item_moved');
    assert.equal(B.consumeFullBook({ context: g.InventoryTransfer.context('ground'), id: moved.instance_id }).reason, 'not_carried');
    for (const item of [{ ...book(), warehouse_locked: true }, { ...book(), connections: { clip: { item_id: 'textile_cotton_cloth', count: 1 } } }]) {
      reset(g, [item]); const unchanged = snapshot(g);
      assert.equal(B.consumeFullBook(request(g)).reason, 'locked'); assert.equal(snapshot(g), unchanged);
    }
    for (const [owner, method] of [[g.GymSystem, 'isActive'], [g.BedSleep, 'isActive'], [g.Hunting, 'isActive'], [g.DeathSystem, 'blocked'], [g.BuffSystem, 'hasActionDisabled']]) {
      reset(g); const fn = owner[method], unchanged = snapshot(g); owner[method] = () => true;
      assert.equal(B.consumeFullBook(request(g)).reason, 'action_blocked'); owner[method] = fn;
      assert.equal(snapshot(g), unchanged);
    }
    reset(g); g.Survival.setState({ isDead: true });
    const dead = snapshot(g); assert.equal(B.consumeFullBook(request(g)).reason, 'action_blocked'); assert.equal(snapshot(g), dead); g.Survival.setState({ isDead: false });
    reset(g); r = request(g); const oldLock = g.ForgingSystem.isInstanceLocked; g.ForgingSystem.isInstanceLocked = id => id === r.id;
    assert.equal(B.consumeFullBook(r).reason, 'locked'); g.ForgingSystem.isInstanceLocked = oldLock;
    const staleContainer = request(g), s = I.getState(); s.equipment.backpack = g.BackpackSystem.generate('eq_backpack_multi_pocket'); I.setState(s);
    assert.equal(B.consumeFullBook(staleContainer).reason, 'container_changed');
    for (const type of ['pocket', 'vehicle']) {
      reset(g, []); const current = I.getState(); current['inventory_' + type] = [book()]; if (type === 'vehicle') current.bound_vehicle_id = 'book_cart'; I.setState(current);
      const usage = request(g, type), ticks = g.GameTime.getState().totalTicks;
      assert.equal(B.consumeFullBook(usage).ok, true); assert.equal(I.getSkillLevel(skillId), 1);
      assert.equal(g.GameTime.getState().totalTicks, ticks, 'direct consumption adds no transfer or reading tick');
    }
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

for (const full of [false, true]) test(`${full ? 'Svelte' : 'native'} selected book exposes consumption, updates level and protects partial/max-level books`, async () => {
  const h = await boot(full), g = h.g;
  try {
    await setup(h, [book(99), book()]); const I = g.InventoryEquipment, d = g.document;
    g.SceneApp.openBackpackPanel(); await h.drain();
    d.querySelector('[data-bp-id="' + I.getBackpackArray()[0].instance_id + '"]').click(); await h.drain();
    let button = d.querySelector('[data-bp-consume-book="backpack"]'); assert.equal(button.disabled, true); assert.match(button.title, /100\/100/);
    d.querySelector('[data-bp-id="' + I.getBackpackArray()[1].instance_id + '"]').click(); await h.drain();
    button = d.querySelector('[data-bp-consume-book="backpack"]'); assert.equal(button.disabled, false); assert.match(button.textContent, /消耗整本/);
    button.click(); await h.drain(); assert.equal(I.getSkillLevel(skillId), 1); assert.equal(I.getBackpackArray()[1], null);
    button.click(); await h.drain(); assert.equal(I.getSkillLevel(skillId), 1, 'old DOM click cannot consume another book');
    g.SceneApp.closePublicModal('modal-backpack'); await h.drain();
    reset(g, [book()], 100); g.SceneApp.openBackpackPanel(); await h.drain();
    d.querySelector('[data-bp-id="' + I.getBackpackArray()[0].instance_id + '"]').click(); await h.drain();
    button = d.querySelector('[data-bp-consume-book="backpack"]'); assert.equal(button.disabled, true); assert.match(button.textContent, /上限/);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
