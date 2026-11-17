import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot } from './ui-game-fixture.mjs';
const def = JSON.parse(fs.readFileSync('data/npc/npc_station_bathroom_base.json', 'utf8'));
async function setup(h, repair = true) {
  const g = h.g;
  g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain();
  const input = g.document.getElementById('creation-name'); input.value = '卫生间测试';
  input.dispatchEvent(new g.Event('input', { bubbles: true })); await h.drain();
  g.document.getElementById('btn-confirm-creation').click(); await h.drain(); g.DialogueUI.close();
  g.GameEngine.setState(def.location.sceneId, 13, 14);
  g.Survival.setState({ thirst: 0, dirtyness: 100, isDead: false, isComa: false, stamina: 100, energy: 100 });
  if (repair) repairBathroom(g);
}
function repairBathroom(g) {
  const IE = g.InventoryEquipment;
  IE.setState({ ...IE.getState(), inventory_pocket: [
    { item_id: 'ore_clay_raw', count: 4 }, { item_id: 'ore_scrap_metal', count: 3 },
    { item_id: 'mechanical_parts', count: 1 }, null
  ] });
  const model = g.FacilityUnlock.get('bathroom');
  assert.equal(model.inspect().ok, true);
  for (const offer of [{ore_clay_raw:4},{ore_scrap_metal:3},{mechanical_parts:1}]) assert.equal(model.repair(offer).ok, true);
  assert.equal(model.isComplete(), true);
}

function giveFlasks(g) {
  const IE = g.InventoryEquipment;
  IE.setState({ ...IE.getState(), inventory_pocket: [
    { item_id: 'tool_flask_bamboo_water', count: 1, enchants: [{ id: 'preserve-test', value: 7 }],
      attribute_state: { equipment: { water_flask: { modification: { id: 'kept', version: 1 }, cooldown_until_tick: 999 } } } },
    { item_id: 'tool_flask_bamboo_water', count: 1 },
    { item_id: 'tool_flask_iron_water', count: 1 }, null
  ] });
  return IE.getPocketArray().filter(Boolean).map(item => item.instance_id);
}

test('refill chooses a real instance, honors source conversion and preserves water, identity and weight through transfers/save', async () => {
  const h = await boot(true), g = h.g;
  try {
    await setup(h);
    const IE = g.InventoryEquipment, F = g.WaterFlaskStorage;
    const [bamboo, otherBamboo, iron] = giveFlasks(g);
    const item = id => IE.findItemInstanceRecord(id)?.instance;
    const water = id => IE.getItemInstanceValue(item(id), 'flask_water');
    assert.equal(water(bamboo), 0, 'legacy/new real flasks initialize empty');
    assert.equal(F.plan(item(bamboo), 40).water, 64);
    assert.equal(F.plan(item(iron), 40).water, 40);
    assert.equal(water(bamboo), 0, 'preview does not mutate');
    IE.setItemInstanceValue(item(bamboo), 'flask_water', 190);
    assert.equal(F.plan(item(bamboo), 40).source_used, 6.25);
    assert.equal(F.plan(item(bamboo), 40).water, 200);
    const configBefore = JSON.stringify(item(bamboo).attribute_state.equipment);
    const enchantsBefore = JSON.stringify(item(bamboo).enchants);
    const emptyWeight = IE.getItemTemplate(item(bamboo).item_id).weight_kg;
    assert.equal(IE.getItemCombinedWeight(item(bamboo)), emptyWeight + 0.95);
    g.Survival.setState({ thirst: 50 });
    await g.NPCSystem.openMenu(def.id); await h.drain();
    const buttons = () => [...g.document.querySelectorAll('#npc-menu-buttons button')];
    buttons().find(b => b.textContent === '给水壶装水').click(); await h.drain();
    assert.equal(buttons().length, 3);
    assert.match(buttons()[0].textContent, /口袋第1格.*190／200/);
    const tick = g.GameTime.getState().totalTicks;
    buttons()[0].click(); await h.drain();
    assert.equal(water(bamboo), 200);
    assert.equal(water(otherBamboo), 0);
    assert.equal(water(iron), 0);
    assert.equal(g.GameTime.getState().totalTicks, tick + 1);
    assert.ok(g.Survival.getState().thirst <= 50, 'refill does not drink for the player');
    assert.equal(IE.getItemCombinedWeight(item(bamboo)), emptyWeight + 1);
    assert.equal(JSON.stringify(item(bamboo).attribute_state.equipment), configBefore);
    assert.equal(JSON.stringify(item(bamboo).enchants), enchantsBefore);
    assert.equal(buttons()[0].disabled, true);
    assert.match(buttons()[0].textContent, /200／200/);
    assert.equal(g.BathroomFacility.use(def, 'refill', bamboo).ok, false);
    assert.equal(g.BathroomFacility.use(def, 'refill').ok, false);
    assert.equal(g.GameTime.getState().totalTicks, tick + 1, 'full/missing selection costs nothing');
    const saved = g.SaveSystem.buildSnapshotForDebug();
    IE.setItemInstanceValue(item(bamboo), 'flask_water', 0);
    assert.equal(g.SaveSystem.applySnapshotForDebug(saved), true);
    assert.equal(water(bamboo), 200);
    assert.equal(water(otherBamboo), 0, 'zero stays empty after load');
    assert.equal(IE.dropItemToGround('pocket', 0, def.location.sceneId, 13, 14).success, true);
    assert.equal(g.BathroomFacility.use(def, 'refill', bamboo).ok, false, 'ground flask is not carried');
    assert.equal(IE.pickUpFromGround(def.location.sceneId, 13, 14, 0).success, true);
    assert.equal(water(bamboo), 200);
    const entry = F.carried().find(e => e.instance_id === bamboo);
    assert.ok(entry);
    const pocketIndex = IE.getPocketArray().findIndex(i => i?.instance_id === bamboo);
    assert.ok(pocketIndex >= 0);
    assert.equal(g.HideoutWarehouse.depositFromContainer('pocket', pocketIndex).ok, true);
    const warehouseIndex = g.HideoutWarehouse.getState().slots.findIndex(i => i?.instance_id === bamboo);
    assert.ok(warehouseIndex >= 0);
    assert.equal(g.HideoutWarehouse.getState().slots[warehouseIndex].attribute_state.structure.liquid_storage.water, 200);
    assert.equal(g.BathroomFacility.use(def, 'refill', bamboo).ok, false, 'warehouse flask cannot be filled remotely');
    assert.equal(g.HideoutWarehouse.withdrawSlot(warehouseIndex, 1).ok, true);
    assert.equal(water(bamboo), 200);
    assert.equal(IE.auditItemOwnership({ warehouse: g.HideoutWarehouse.getState().slots }).ok, true);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('refill rejects invalid/stale targets and restrictions, rolls back save failures and cannot grant water after interruption', async () => {
  const h = await boot(true), g = h.g;
  try {
    await setup(h);
    const IE = g.InventoryEquipment, B = g.BathroomFacility;
    const [id] = giveFlasks(g);
    const item = () => IE.findItemInstanceRecord(id)?.instance;
    const water = () => IE.getItemInstanceValue(item(), 'flask_water');
    g.Survival.setState({ thirst: 80 });
    const tick = g.GameTime.getState().totalTicks;
    g.NPCSystem.setDemoFlag('bathroom_station_unlocked', false);
    assert.equal(B.use(def, 'refill', id).ok, false);
    g.NPCSystem.setDemoFlag('bathroom_station_unlocked', true);
    g.GameEngine.setState(def.location.sceneId, 11, 14);
    assert.equal(B.use(def, 'refill', id).ok, false);
    g.GameEngine.setState(def.location.sceneId, 13, 14);
    const combat = g.CombatEngagement.isPlayerInCombat;
    g.CombatEngagement.isPlayerInCombat = () => true;
    assert.equal(B.use(def, 'refill', id).ok, false);
    g.CombatEngagement.isPlayerInCombat = combat;
    g.BuffSystem.applyBuff('player', 'survival_coma', 'test');
    assert.equal(B.use(def, 'refill', id).ok, false);
    g.BuffSystem.removeBuffByBuffId('player', 'survival_coma');
    item().attribute_state.structure.liquid_storage.version = 9;
    assert.equal(B.use(def, 'refill', id).ok, false);
    assert.equal(item().attribute_state.structure.liquid_storage.version, 9, 'unknown version is preserved');
    item().attribute_state.structure.liquid_storage.version = 1;
    assert.equal(IE.setItemInstanceValue(item(), 'flask_water', 201), false);
    assert.equal(IE.setItemInstanceValue(item(), 'flask_water', NaN), false);
    assert.equal(water(), 0);
    assert.equal(g.GameTime.getState().totalTicks, tick);
    const save = g.SaveSystem.saveNow;
    const before = JSON.stringify(g.Survival.getState());
    g.SaveSystem.saveNow = () => false;
    try {
      assert.match(B.use(def, 'refill', id).message, /保存失败/);
      assert.equal(water(), 0);
      assert.equal(g.GameTime.getState().totalTicks, tick);
      assert.equal(JSON.stringify(g.Survival.getState()), before);
    } finally { g.SaveSystem.saveNow = save; }
    const advance = g.Survival.advanceTick;
    g.Survival.advanceTick = function (...args) {
      const r = advance.apply(g.Survival, args);
      g.GameEngine.setState(def.location.sceneId, 11, 14);
      return r;
    };
    try {
      assert.match(B.use(def, 'refill', id).message, /中断/);
      assert.equal(water(), 0);
      assert.equal(g.GameTime.getState().totalTicks, tick + 1);
    } finally { g.Survival.advanceTick = advance; }
    g.GameEngine.setState(def.location.sceneId, 13, 14);
    g.Survival.advanceTick = function (...args) {
      const r = advance.apply(g.Survival, args);
      IE.clearAllOnDeath();
      return r;
    };
    try {
      assert.equal(B.use(def, 'refill', id).ok, false);
      assert.equal(item(), undefined, 'removed flask is not recreated by completion');
      assert.equal(g.WaterFlaskStorage.carried().length, 0);
    } finally { g.Survival.advanceTick = advance; }
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
test('damaged bathroom opens repair while dehydrated and dirty; materials and unlock survive saving', async () => {
  const h = await boot(true), g = h.g;
  try {
    await setup(h, false);
    const tick = g.GameTime.getState().totalTicks;
    assert.equal(g.BathroomFacility.use(def, 'drink').ok, false);
    assert.equal(g.BathroomFacility.use(def, 'shower').ok, false);
    assert.equal(g.GameTime.getState().totalTicks, tick);
    g.SceneCtx.actions.interactNpc(def.id); await h.drain();
    let buttons = [...g.document.querySelectorAll('#npc-menu-buttons button')];
    assert.deepEqual(buttons.map(b => b.textContent), ['修复卫生间']);
    assert.equal(buttons[0].disabled, false);
    buttons[0].click(); await h.drain();
    assert.equal(g.FacilityUnlockPanel.isOpen(), true);
    repairBathroom(g);
    assert.equal(g.InventoryEquipment.countCarriedItemsByTemplateId('ore_clay_raw'), 0);
    assert.equal(g.InventoryEquipment.countCarriedItemsByTemplateId('ore_scrap_metal'), 0);
    assert.equal(g.InventoryEquipment.countCarriedItemsByTemplateId('mechanical_parts'), 0);
    g.FacilityUnlockPanel.close(); await h.drain();
    const saved = g.SaveSystem.buildSnapshotForDebug();
    g.NPCSystem.setDemoFlag('bathroom_station_unlocked', false);
    assert.equal(g.SaveSystem.applySnapshotForDebug(saved), true);
    assert.equal(g.BathroomFacility.isUnlocked(), true);
    await g.NPCSystem.openMenu(def.id); await h.drain();
    buttons = [...g.document.querySelectorAll('#npc-menu-buttons button')];
    assert.deepEqual(buttons.map(b => b.textContent), ['饮水 · 10分钟', '洗澡 · 30分钟', '给水壶装水', '取纯净软水 · 1刻']);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
test('bathroom preserves drinking and showering and offers flask refill through the real menu', async () => {
  const h = await boot(true), g = h.g;
  try {
    await setup(h);
    const entries = g.GameEngine.getMap().npcs.filter(n => n.npc_id === def.id);
    assert.equal(entries.length, 1, 'one map placement');
    assert.equal(g.GameEngine.getNpcAt(14, 14), def.id);
    assert.equal(g.BathroomFacility.nearby(def), true);
    g.SceneCtx.actions.interactNpc(def.id); await h.drain();
    const buttons = () => [...g.document.querySelectorAll('#npc-menu-buttons button')];
    assert.deepEqual(buttons().map(b => b.textContent), ['饮水 · 10分钟', '洗澡 · 30分钟', '给水壶装水', '取纯净软水 · 1刻']);
    assert.equal(buttons()[2].disabled, true, 'no carried flask');
    assert.equal(buttons()[0].disabled, false); assert.equal(buttons()[1].disabled, false);
    let tick = g.GameTime.getState().totalTicks;
    g.Survival.setState({ thirstDeathTicks: 431 });
    buttons()[0].click(); await h.drain();
    assert.equal(g.GameTime.getState().totalTicks, tick + 1);
    assert.equal(g.Survival.getState().thirst, g.Survival.getThirstMax());
    assert.equal(g.Survival.getState().thirstDeathTicks, 0);
    assert.equal(g.Survival.getState().isDead, false, 'last-tick drinking rescues dehydration');
    assert.equal(g.Survival.getDirtyness(), 100);
    assert.equal(buttons()[0].disabled, true);
    assert.equal(g.BuffSystem.hasBuffByBuffId('player', 'survival_thirst_dehydrated_zero'), false);
    tick = g.GameTime.getState().totalTicks;
    const mood = g.Survival.getState().mood;
    buttons()[1].click(); await h.drain();
    assert.equal(g.GameTime.getState().totalTicks, tick + 3);
    assert.equal(g.Survival.getDirtyness(), 0);
    assert.equal(buttons()[1].disabled, true);
    assert.equal(g.BuffSystem.hasBuffByBuffId('player', 'survival_dirty_messy'), false);
    assert.equal(g.BuffSystem.hasBuffByBuffId('player', 'survival_dirty_clean_refreshing'), true);
    assert.ok(g.Survival.getState().mood <= Math.max(500, mood), 'no extra shower mood grant');
    const saved = g.SaveSystem.buildSnapshotForDebug();
    g.Survival.setState({ thirst: 0, dirtyness: 100 });
    assert.equal(g.SaveSystem.applySnapshotForDebug(saved), true);
    assert.equal(g.Survival.getDirtyness(), 0);
    assert.ok(g.Survival.getState().thirst > 0);
    tick = g.GameTime.getState().totalTicks;
    assert.equal(g.BathroomFacility.use(def, 'shower').ok, false, 'clean body does not spend time');
    assert.equal(g.GameTime.getState().totalTicks, tick);
    g.Survival.setState({ thirst: g.Survival.getThirstMax() });
    assert.equal(g.BathroomFacility.use(def, 'drink').ok, false);
    assert.equal(g.GameTime.getState().totalTicks, tick);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
test('bathroom rechecks access, preserves other restrictions, rolls back failed saves and stops interrupted bathing', async () => {
  const h = await boot(true), g = h.g;
  try {
    await setup(h);
    const S = g.Survival, F = g.BathroomFacility;
    let tick = g.GameTime.getState().totalTicks;
    g.GameEngine.setState(def.location.sceneId, 11, 14);
    assert.equal(F.use(def, 'drink').ok, false, 'cannot use remotely');
    assert.equal(g.GameTime.getState().totalTicks, tick);
    g.GameEngine.setState(def.location.sceneId, 13, 14);
    g.BuffSystem.applyBuff('player', 'survival_coma', 'test');
    assert.equal(F.use(def, 'drink').ok, false);
    g.BuffSystem.removeBuffByBuffId('player', 'survival_coma');
    S.setState({ isDead: true }); assert.equal(F.use(def, 'drink').ok, false); S.setState({ isDead: false });
    const combat = g.CombatEngagement.isPlayerInCombat; g.CombatEngagement.isPlayerInCombat = () => true;
    assert.equal(F.use(def, 'shower').ok, false); g.CombatEngagement.isPlayerInCombat = combat;
    assert.equal(g.GameTime.getState().totalTicks, tick);
    const save = g.SaveSystem.saveNow; g.SaveSystem.saveNow = () => false;
    const before = JSON.stringify(S.getState());
    try {
      const result = F.use(def, 'drink');
      assert.equal(result.ok, false); assert.match(result.message, /保存失败/);
      assert.equal(JSON.stringify(S.getState()), before);
      assert.equal(g.GameTime.getState().totalTicks, tick);
    } finally { g.SaveSystem.saveNow = save; }
    S.setState({ thirst: 80, dirtyness: 100 });
    const advance = S.advanceTick;
    S.advanceTick = function (...args) { const r = advance.apply(S, args); g.GameEngine.setState(def.location.sceneId, 11, 14); return r; };
    try {
      const r = F.use(def, 'shower'); assert.equal(r.ok, false); assert.match(r.message, /中断/);
      assert.equal(g.GameTime.getState().totalTicks, tick + 1);
      assert.equal(S.getDirtyness(), 100, 'unfinished shower grants no cleaning');
    } finally { S.advanceTick = advance; }
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
