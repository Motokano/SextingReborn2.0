import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot } from './ui-game-fixture.mjs';
import { applyWaterFlaskUse } from './water-flask-storage-fields.mjs';
const bathroom = JSON.parse(fs.readFileSync('data/npc/npc_station_bathroom_base.json', 'utf8'));
async function setup(h) {
  const g = h.g;
  g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain();
  const input = g.document.getElementById('creation-name'); input.value = '饮用验收';
  input.dispatchEvent(new g.Event('input', { bubbles: true }));
  await h.drain();
  g.document.getElementById('btn-confirm-creation').click(); await h.drain(); g.DialogueUI.close();
  g.GameEngine.setState(bathroom.location.sceneId, 13, 14);
  g.NPCSystem.setDemoFlag('bathroom_station_unlocked', true);
  g.Survival.setState({ thirst: 30, isDead: false, isComa: false, stamina: 100, energy: 100 });
  const IE = g.InventoryEquipment;
  IE.setState({ ...IE.getState(), inventory_pocket: [
    { item_id: 'tool_flask_bamboo_water', count: 1, attribute_state: { equipment: { water_flask: { future_modification: 'retained' } } } },
    { item_id: 'tool_flask_iron_water', count: 1 }, null, null
  ] });
}
const water = (g, id) => g.InventoryEquipment.getItemInstanceValue(g.InventoryEquipment.findItemInstanceRecord(id)?.instance, 'flask_water');
const tick = g => g.GameTime.getState().totalTicks;
async function clickText(h, selector, text) {
  const button = [...h.g.document.querySelectorAll(selector)].find(b => b.textContent.trim() === text);
  assert.ok(button, `missing button ${text}`); button.click(); await h.drain();
}

for (const svelte of [false, true]) test(`real ${svelte ? 'Svelte' : 'native'} equipment UI: fill, equip, drink, refill equipped and swap`, async () => {
  const h = await boot(svelte), g = h.g, IE = g.InventoryEquipment;
  try {
    await setup(h);
    const bamboo = IE.getPocketArray()[0].instance_id, iron = IE.getPocketArray()[1].instance_id;
    assert.equal(g.WaterFlaskUse.drink().ok, false, 'carrying alone does not equip');
    const fill = g.BathroomFacility.use(bathroom, 'refill', bamboo); assert.equal(fill.ok, true, fill.message);
    assert.equal(water(g, bamboo), 200);
    g.SceneApp.openBackpackPanel(); await h.drain();
    g.document.querySelector('[data-container="pocket"]').click(); await h.drain();
    const bambooRow = [...g.document.querySelectorAll('.bp-item-row')].find(r => r.textContent.includes('tool_flask_bamboo_water'));
    assert.ok(bambooRow); bambooRow.click(); await h.drain();
    await clickText(h, '#backpack-detail button', '装备水壶');
    assert.equal(IE.getState().equipment.water_flask.instance_id, bamboo);
    assert.equal(IE.findItemInstanceRecord(bamboo).relation, 'equipment');
    const row = [...g.document.querySelectorAll('#equip-list .equip-row')].find(r => r.querySelector('.slot-name')?.textContent === '水壶');
    assert.ok(row); row.click(); await h.drain();
    const beforeTick = tick(g), beforeWeight = IE.getCurrentCarryWeight();
    g.Survival.setState({ thirst: 30 });
    const addThirst = g.Survival.addThirst, recovered = [];
    g.Survival.addThirst = amount => { recovered.push(amount); return addThirst(amount); };
    await clickText(h, '#backpack-detail button', '从壶饮用');
    g.Survival.addThirst = addThirst;
    assert.equal(tick(g), beforeTick + 1);
    assert.equal(water(g, bamboo), 175);
    assert.equal(water(g, iron), 0);
    assert.deepEqual(recovered, [25], 'bamboo source bonus never multiplies drinking');
    assert.ok(Math.abs(IE.getCurrentCarryWeight() - (beforeWeight - 0.125)) < 1e-8);
    assert.match(g.document.querySelector('#backpack-detail').textContent, /当前存水：175/);
    assert.match(g.document.querySelector('#backpack-detail').textContent, /重量：1\.575 kg/);
    assert.equal(g.WaterFlaskUse.equipped().attribute_state.equipment.water_flask.future_modification, 'retained');
    const saved = g.SaveSystem.buildSnapshotForDebug();
    IE.setItemInstanceValue(g.WaterFlaskUse.equipped(), 'flask_water', 0);
    assert.equal(g.SaveSystem.applySnapshotForDebug(saved), true);
    assert.equal(water(g, bamboo), 175);
    assert.equal(g.BathroomFacility.use(bathroom, 'refill', bamboo).ok, true);
    assert.equal(water(g, bamboo), 200, 'equipped refill updates live instance, not equipment copy');
    g.SceneApp.closePublicModal('modal-backpack');
    g.Survival.setState({ thirst: 30 });
    g.SceneApp.actionMenu.open(); await h.drain();
    await clickText(h, '#player-actions-submenu button', '从壶饮用 · 200／200');
    assert.equal(water(g, bamboo), 175);
    g.SceneApp.openBackpackPanel(); await h.drain();
    const ironRow = [...g.document.querySelectorAll('.bp-item-row')].find(r => r.textContent.includes('tool_flask_iron_water'));
    assert.ok(ironRow); ironRow.click(); await h.drain();
    await clickText(h, '#backpack-detail button', '装备水壶');
    assert.equal(IE.getState().equipment.water_flask.instance_id, iron);
    assert.equal(water(g, bamboo), 175, 'swap preserves old flask water');
    assert.equal(g.WaterFlaskUse.drink(bamboo).ok, false, 'stale action must not drink replacement');
    assert.equal(IE.auditItemOwnership().ok, true);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

for (const svelte of [false, true]) test(`${svelte ? 'Svelte' : 'native'} flask pin: first empty slot, persistence, current equipment, failure and right-click removal`, async () => {
  const h = await boot(svelte), g = h.g, d = g.document, IE = g.InventoryEquipment;
  try {
    await setup(h);
    g.SceneCtx.setActionBarSlots(['action|rest_toggle', null, null, null]);
    const beforePin = tick(g);
    const pinFlask = async () => {
      g.SceneApp.actionMenu.open(); await h.drain();
      const row = [...d.querySelectorAll('.player-action-item-row')].find(r => r.querySelector('.player-action-item')?.textContent.startsWith('从壶饮用'));
      assert.ok(row, 'flask action has the same pin row as other actions');
      row.querySelector('.player-action-pin').click(); await h.drain();
      g.SceneApp.actionMenu.close(); await h.drain();
    };
    await pinFlask();
    assert.deepEqual(Array.from(g.SceneCtx.getActionBarSlots()), ['action|rest_toggle', 'action|drink_flask', null, null]);
    assert.equal(tick(g), beforePin, 'registering costs no world time and needs no equipped flask');
    const button = () => d.getElementById('action-bar-pin-1');
    assert.equal(button().textContent, '从壶饮用');
    button().click(); await h.drain(); assert.equal(tick(g), beforePin, 'no flask does not consume time');
    const bamboo = IE.takeItemFromContainer('pocket', 0).item;
    assert.equal(IE.equip('water_flask', bamboo).success, true);
    IE.setItemInstanceValue(g.WaterFlaskUse.equipped(), 'flask_water', 100);
    g.Survival.setState({ thirst: 30 }); g.SceneRenderer.render(); await h.drain();
    button().click(); await h.drain();
    assert.equal(water(g, bamboo.instance_id), 75); assert.equal(tick(g), beforePin + 1);
    const saved = g.SaveSystem.buildSnapshotForDebug();
    assert.equal(saved.player.sceneUi.action_bar_slots[1], 'action|drink_flask');
    g.SceneCtx.setActionBarSlots([]); assert.equal(g.SaveSystem.applySnapshotForDebug(saved), true);
    g.SceneRenderer.render(); await h.drain(); assert.equal(button().textContent, '从壶饮用');
    const iron = IE.takeItemFromContainer('pocket', 1).item;
    const old = IE.unequip('water_flask'); assert.equal(IE.putItemIntoDefaultContainer(old).placed, true);
    assert.equal(IE.equip('water_flask', iron).success, true);
    IE.setItemInstanceValue(g.WaterFlaskUse.equipped(), 'flask_water', 50);
    g.Survival.setState({ thirst: 30 }); g.SceneRenderer.render(); await h.drain();
    button().click(); await h.drain();
    assert.equal(water(g, iron.instance_id), 25); assert.equal(water(g, bamboo.instance_id), 75);
    assert.equal(tick(g), beforePin + 2, 'the same pin drinks from the replacement exactly once');
    for (const [remaining, thirst] of [[25, 100], [0, 30]]) {
      IE.setItemInstanceValue(g.WaterFlaskUse.equipped(), 'flask_water', remaining); g.Survival.setState({ thirst });
      button().click(); await h.drain();
      assert.equal(water(g, iron.instance_id), remaining); assert.equal(tick(g), beforePin + 2);
    }
    g.SceneCtx.setActionBarSlots(['action|rest_toggle', 'action|drink_flask', 'action|rest_toggle', 'action|rest_toggle']);
    const full = Array.from(g.SceneCtx.getActionBarSlots()); await pinFlask();
    assert.deepEqual(Array.from(g.SceneCtx.getActionBarSlots()), full, 'a full bar never overwrites existing pins');
    button().dispatchEvent(new g.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await h.drain();
    assert.equal(g.SceneCtx.getActionBarSlots()[1], null); assert.equal(button().textContent, '·');
    assert.equal(g.SaveSystem.buildSnapshotForDebug().player.sceneUi.action_bar_slots[1], null);
    assert.equal(tick(g), beforePin + 2);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('drink validation, eight uses keep empty flask, save rollback, old save and death ownership', async () => {
  const h = await boot(true), g = h.g, IE = g.InventoryEquipment;
  try {
    await setup(h);
    const taken = IE.takeItemFromContainer('pocket', 0).item;
    assert.equal(IE.equip('water_flask', taken).success, true);
    const id = taken.instance_id, item = () => g.WaterFlaskUse.equipped();
    IE.setItemInstanceValue(item(), 'flask_water', 200);
    for (const state of [{ thirst: 100 }, { thirst: 30, isDead: true }]) {
      g.Survival.setState(state); const before = tick(g);
      assert.equal(g.WaterFlaskUse.drink().ok, false); assert.equal(water(g, id), 200); assert.equal(tick(g), before);
    }
    g.Survival.setState({ isDead: false, isComa: false, thirst: 30 });
    item().attribute_state.structure.liquid_storage.version = 9;
    assert.equal(g.WaterFlaskUse.drink().ok, false);
    item().attribute_state.structure.liquid_storage.version = 1;
    IE.setItemInstanceValue(item(), 'flask_water', 24.5);
    const beforeLow = tick(g); assert.equal(g.WaterFlaskUse.drink().ok, false); assert.equal(tick(g), beforeLow);
    IE.setItemInstanceValue(item(), 'flask_water', 200);
    const save = g.SaveSystem.saveNow, beforeFail = tick(g), beforeThirst = g.Survival.getState().thirst;
    g.SaveSystem.saveNow = () => false;
    try { assert.equal(g.WaterFlaskUse.drink().ok, false); } finally { g.SaveSystem.saveNow = save; }
    assert.equal(water(g, id), 200); assert.equal(tick(g), beforeFail); assert.equal(g.Survival.getState().thirst, beforeThirst);
    const combat = g.CombatEngagement.isPlayerInCombat; g.CombatEngagement.isPlayerInCombat = () => true;
    try {
      for (let i = 0; i < 8; i++) { g.Survival.setState({ thirst: 30 }); const use = g.WaterFlaskUse.drink(); assert.equal(use.ok, true, use.message); }
    } finally { g.CombatEngagement.isPlayerInCombat = combat; }
    assert.equal(water(g, id), 0); assert.equal(item().instance_id, id); assert.equal(tick(g), beforeFail + 8);
    assert.equal(g.WaterFlaskUse.drink().ok, false); assert.equal(tick(g), beforeFail + 8);
    assert.equal(g.HideoutWarehouse.depositFromContainer('pocket', 1).ok, true);
    const warehouse = JSON.stringify(g.HideoutWarehouse.getState());
    IE.clearAllOnDeath();
    assert.equal(IE.getState().equipment.water_flask, null); assert.equal(IE.findItemInstanceRecord(id), null);
    assert.equal(JSON.stringify(g.HideoutWarehouse.getState()), warehouse);
    const legacy = IE.getState(); delete legacy.equipment.water_flask;
    IE.setState(legacy); assert.equal(IE.getState().equipment.water_flask, null, 'legacy save never grants flask');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('use catalogue keeps recovery independent of cost and rejects unsupported/malformed effects', () => {
  const items = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
  const source = JSON.parse(fs.readFileSync('data/water-flask-use.json', 'utf8'));
  const differing = structuredClone(source); differing.items.tool_flask_iron_water.flask_effects[0].total = 30;
  applyWaterFlaskUse(items, differing); assert.equal(items.tool_flask_iron_water.flask_drink_cost, 25);
  assert.equal(items.tool_flask_iron_water.flask_effects[0].total, 30);
  for (const patch of [{ flask_drink_cost: 0 }, { flask_drink_ticks: -1 }, { flask_effects: [] },
    { flask_effects: [{ target: 'thirst', total: 30, timing: 'over_time', duration_ticks: 5 }] }]) {
    const broken = structuredClone(source); Object.assign(broken.items.tool_flask_iron_water, patch);
    assert.throws(() => applyWaterFlaskUse(items, broken), /invalid or unsupported/);
  }
});
