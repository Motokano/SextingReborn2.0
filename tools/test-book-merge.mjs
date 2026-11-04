import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

const id = 'book_anatomy_textbook';
const book = (fragments = 1) => ({ item_id: id, count: 1, attribute_state: { knowledge: { book: { version: 1, fragments } } } });
const filler = () => ({ item_id: 'textile_cotton_cloth', count: 1 });
async function setup(h) {
  const g = h.g;
  g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain();
  const name = g.document.getElementById('creation-name'); name.value = '教材合并';
  name.dispatchEvent(new g.Event('input', { bubbles: true })); await h.drain();
  g.document.getElementById('btn-confirm-creation').click(); await h.drain(); g.DialogueUI.close();
  g.GameEngine.setState('M0_Base_Inside_lv_1', 5, 12);
  g.Survival.setState({ isDead: false, isComa: false, stamina: 100, energy: 100, thirst: 100 });
  reset(g);
}
function reset(g, backpack = [], pocket = []) {
  const I = g.InventoryEquipment, s = I.getState();
  s.equipment = Object.fromEntries(Object.keys(s.equipment).map(k => [k, null]));
  s.equipment.clothing = { item_id: 'eq_clothing_combat_suit', count: 1 };
  s.equipment.backpack = g.BackpackSystem.generate('eq_backpack_light_canvas');
  s.inventory_backpack = backpack; s.inventory_pocket = pocket; s.inventory_vest = [];
  s.inventory_vehicle = []; s.bound_vehicle_id = null; s.ground_items = {}; I.setState(s);
}
const fragments = (I, xs) => Array.from(xs.filter(x => I.getBookInfo(x)), x => I.getBookInfo(x).fragments);
const snapshot = g => JSON.stringify([g.InventoryEquipment.getState(), g.HideoutWarehouse.getState(), g.GameTime.getState(), g.Survival.getState()]);

test('book receipts merge in full containers, preserve overflow, skip locks and do not award XP', async () => {
  const h = await boot(false), g = h.g;
  try {
    await setup(h); const I = g.InventoryEquipment;
    const packed = n => [book(n), ...Array.from({ length: I.getBackpackSlots() - 1 }, filler)];
    const pockets = () => Array.from({ length: I.getPocketSlots() }, filler);
    reset(g, packed(99), pockets());
    const skills = JSON.stringify(I.getState().skills), before = I.getBackpackArray()[0].instance_id;
    assert.equal(I.putItemIntoDefaultContainer({ item_id: id, count: 1 }).placed, true);
    assert.deepEqual(fragments(I, I.getBackpackArray()), [100]);
    assert.equal(I.getBackpackArray()[0].instance_id, before);
    const full = JSON.stringify(I.getState());
    assert.equal(I.putItemIntoDefaultContainer(book()).placed, false);
    assert.equal(JSON.stringify(I.getState()), full);
    assert.equal(JSON.stringify(I.getState().skills), skills);
    reset(g, packed(60), pockets().slice(1));
    assert.equal(I.putItemIntoDefaultContainer(book(50)).placed, true);
    assert.deepEqual(fragments(I, I.getBackpackArray()), [100]);
    assert.deepEqual(fragments(I, I.getPocketArray()), [10]);
    assert.equal(I.auditItemOwnership().ok, true);
    reset(g);
    assert.equal(I.putItemIntoDefaultContainer({ item_id: id, count: 201 }).placed, true);
    assert.deepEqual(fragments(I, I.getBackpackArray()), [100, 100, 1]);
    assert.equal(I.auditItemOwnership().ok, true);
    const owned = I.getBackpackArray()[2], intact = JSON.stringify(I.getState());
    assert.equal(g.InventoryTransfer.receive(owned).ok, false);
    assert.equal(JSON.stringify(I.getState()), intact);
    reset(g, [book(20)]);
    const locked = I.getBackpackArray()[0].instance_id, oldLock = g.ForgingSystem.isInstanceLocked;
    g.ForgingSystem.isInstanceLocked = x => x === locked;
    assert.equal(I.putItemIntoDefaultContainer(book()).placed, true);
    assert.deepEqual(fragments(I, I.getBackpackArray()), [20, 1]);
    g.ForgingSystem.isInstanceLocked = oldLock;
    reset(g, packed(99), [book(50), ...pockets().slice(1)]);
    const transfer = g.InventoryTransfer, partialBefore = snapshot(g), source = I.getPocketArray()[0];
    assert.equal(transfer.move({ from: transfer.context('pocket'), to: transfer.context('backpack'), id: source.instance_id, count: 1 }).ok, false);
    assert.equal(snapshot(g), partialBefore, 'failed overflow leaves both books untouched');
    reset(g);
    const vehicleState = I.getState(); vehicleState.bound_vehicle_id = 'book_test_cart'; vehicleState.inventory_vehicle = [book(10)]; I.setState(vehicleState);
    const tickBefore = g.GameTime.getState().totalTicks;
    assert.equal(transfer.receive(book()).ok, true);
    assert.deepEqual(fragments(I, I.getVehicleArray()), [11]);
    assert.equal(I.getBackpackArray().filter(Boolean).length, 0);
    assert.equal(g.GameTime.getState().totalTicks, tickBefore + 1, 'vehicle handling costs exactly the original one tick');
    const save = g.SaveSystem.saveNow, vehicleBefore = snapshot(g); g.SaveSystem.saveNow = () => false;
    assert.equal(transfer.receive(book()).ok, false); g.SaveSystem.saveNow = save;
    assert.equal(snapshot(g), vehicleBefore, 'failed vehicle receipt restores completeness and time');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

for (const full of [false, true]) test(`${full ? 'Svelte' : 'native'} book transfer, warehouse, save rollback and completeness display`, async () => {
  const h = await boot(full), g = h.g;
  try {
    await setup(h); const I = g.InventoryEquipment, T = g.InventoryTransfer, W = g.HideoutWarehouse;
    reset(g, [], [book()]);
    const pos = T.position(), skillBefore = JSON.stringify(I.getState().skills);
    I.addItemToGround(pos.mapId, pos.x, pos.y, { item_id: id, count: 1 });
    let incoming = I.getGroundItemsAt(pos.mapId, pos.x, pos.y)[0];
    assert.equal(T.quickTake(T.context('ground'), incoming.instance_id).ok, true);
    assert.deepEqual(fragments(I, I.getPocketArray()), [2], 'existing pocket book precedes empty backpack slots');
    assert.equal(I.getBackpackArray().filter(Boolean).length, 0);
    assert.equal(T.quickTake(T.context('ground'), incoming.instance_id).ok, false, 'stale pickup cannot award again');
    g.SceneApp.openBackpackPanel(); await h.drain();
    assert.match(g.document.querySelector('[data-bp-zone="pocket"]').textContent, /残旧薄册 · 2\/100/);
    const s = I.getState(); s.inventory_backpack = [book(5)]; I.setState(s);
    let item = I.getPocketArray()[0];
    assert.equal(T.move({ from: T.context('pocket'), to: T.context('backpack'), id: item.instance_id, count: 1 }).ok, true);
    assert.deepEqual(fragments(I, I.getBackpackArray()), [7]);
    const packedBag = g.BackpackSystem.generate('eq_backpack_light_canvas'); packedBag.backpack_contents = [book(10)];
    I.addItemToGround(pos.mapId, pos.x, pos.y, packedBag);
    const groundBag = I.getGroundItemsAt(pos.mapId, pos.x, pos.y)[0];
    assert.equal(T.move({ from: T.context('backpack'), to: T.context('groundBag', groundBag.instance_id), id: I.getBackpackArray()[0].instance_id, count: 1 }).ok, true);
    assert.deepEqual(fragments(I, T.read(T.context('groundBag', groundBag.instance_id)).items), [17]);
    g.SceneApp.closePublicModal('modal-backpack'); await h.drain();
    reset(g, [book(40)]);
    W.setState({ ...W.createDefaultState(), slots: [book(10)] });
    g.SceneApp.openHideoutWarehousePanel(); await h.drain();
    g.document.querySelector('#hw-slot-grid [data-slot-index="0"]').click(); await h.drain();
    assert.match(g.document.querySelector('#modal-hideout-warehouse').textContent, /残旧薄册 · 10\/100/);
    item = W.getState().slots[0];
    const save = g.SaveSystem.saveNow, before = snapshot(g); g.SaveSystem.saveNow = () => false;
    assert.equal(T.fromWarehouse(0, item.instance_id).ok, false);
    g.SaveSystem.saveNow = save;
    assert.equal(snapshot(g), before, 'save failure restores the book, warehouse and time');
    assert.equal(T.fromWarehouse(0, item.instance_id).ok, true);
    assert.deepEqual(fragments(I, I.getBackpackArray()), [50]);
    assert.equal(W.getState().slots.filter(Boolean).length, 0);
    assert.equal(JSON.stringify(I.getState().skills), skillBefore);
    const persisted = g.SaveSystem.buildSnapshotForDebug();
    reset(g); assert.equal(g.SaveSystem.applySnapshotForDebug(persisted), true);
    assert.deepEqual(fragments(I, I.getBackpackArray()), [50]);
    assert.equal(I.auditItemOwnership({ warehouse: W.getState().slots }).ok, true);
    // Storage merging is automatic even before the ordinary stack convenience unlock.
    const ws = W.createDefaultState(); ws.slots = [book(95), ...Array.from({ length: ws.capacity - 1 }, filler)]; W.setState(ws);
    const warehouseBefore = JSON.stringify(W.getState());
    assert.equal(W.canDepositInstance(book(10)), false);
    assert.equal(W.depositFromInstance(book(10)).ok, false);
    assert.equal(JSON.stringify(W.getState()), warehouseBefore);
    assert.equal(W.canDepositInstance(book(5)), true);
    assert.equal(W.depositFromInstance(book(5), { autoStack: false }).ok, true);
    assert.deepEqual(fragments(I, W.getState().slots), [100]);
    const sealed = W.getState(); sealed.slots[0] = { ...book(95), warehouse_locked: true }; W.setState(sealed);
    assert.equal(W.depositFromInstance(book()).ok, false);
    assert.deepEqual(fragments(I, W.getState().slots), [95]);
    reset(g, Array.from({ length: I.getBackpackSlots() }, filler), Array.from({ length: I.getPocketSlots() }, filler));
    W.setState({ ...W.createDefaultState(), slots: [book(5)] });
    assert.equal(W.withdrawSlot(0, 1).ok, false, 'legacy withdrawal cannot drop a book after failed storage');
    assert.deepEqual(fragments(I, W.getState().slots), [5]);
    assert.equal(I.getGroundItemsAt(pos.mapId, pos.x, pos.y).length, 0);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
