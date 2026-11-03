import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

const flag = 'pharmacy_injection_unlocked';
const copy = value => JSON.parse(JSON.stringify(value));
const inputs = [{ item_id: 'solvent_water_pure', count: 1 }, { item_id: 'med_antler_powder', count: 1 }];

for (const full of [false, true]) test(`injection discovery switch (${full ? 'Svelte' : 'native'})`, async () => {
  const h = await boot(full), g = h.g, d = g.document;
  try {
    const pc = g.PharmacyCompounding;
    assert.equal(pc.UNLOCK_FLAG, flag);
    assert.equal(pc.isUnlocked(), false, 'new saves are closed without a flag');
    let steps = 0;
    while (g.DialogueUI.isDialogueOpen() && steps++ < 1000) g.DialogueUI.next();
    await h.drain();
    g.SceneApp.openCharacterCreationAfterIntro();
    assert.equal(g.SceneApp.creation.confirm({ name: '制药开关回归', height: 178, gender: 'male', hand: 'right', leg: 'right' }), true);
    await h.drain();
    g.GameEngine.setState('M0_Base_Inside_lv_1', 13, 14);
    g.NPCSystem.setDemoFlag('npc_station_pharmacy_base_repaired', true);
    g.Survival.setState({ thirst: 0, dirtyness: 0 });
    g.InventoryEquipment.setState({ ...g.InventoryEquipment.getState(), inventory_pocket: copy(inputs), inventory_backpack: [], inventory_vehicle: [] });
    g.PharmacyStationPanel.open();
    await h.drain();
    assert.equal(g.PharmacyStationPanel.isOpen(), true, JSON.stringify({ at: g.GameEngine.getState(), station: g.StationContext.getCurrentPharmacyStationContext(), messages: g.GameLog.getState?.() }));

    const tabs = () => d.getElementById('pharmacy-mode-tabs');
    const panel = () => d.getElementById('modal-pharmacy-station');
    function assertHidden() {
      assert.equal(tabs().children.length, 0, 'no disabled tab or placeholder');
      assert.equal(tabs().hidden, true);
      assert.doesNotMatch(panel().textContent, /注射|配药|助溶|浓度|尚未解锁/);
      assert.equal(d.getElementById('pharmacy-method-section').hidden, true, 'no empty method row before installing equipment');
      assert.equal(d.getElementById('pharmacy-equipment-section').hidden, false);
      assert.equal(d.getElementById('pharmacy-equipment-toggle').textContent, '安装设备');
      assert.equal(d.querySelectorAll('#pharmacy-method-list button').length, 0, 'no equipment is installed');
    }
    assertHidden();

    const powder = g.InventoryEquipment.getItemTemplate('med_antler_powder');
    const character = { skills: { life_pharmacy: { level: 100 } } };
    const detailArgs = { tpl: powder, inst: { item_id: powder.item_id }, character };
    const details = () => g.ItemFieldDisplayRules.renderFieldBlocksHtml(detailArgs) + JSON.stringify(g.ItemFieldDisplayRules.tooltipView(detailArgs));
    assert.doesNotMatch(details(), /浓度|助溶/);
    const medicineArgs = { tpl: g.InventoryEquipment.getItemTemplate('potion_calm_brew'), character };
    const medicineInfo = () => g.ItemInfoModules.renderTooltipModulesHtml(medicineArgs) + JSON.stringify(g.ItemInfoModules.tooltipView(medicineArgs));
    assert.doesNotMatch(medicineInfo(), /配药|针具|扎针/);
    assert.match(medicineInfo(), /久服或致依赖/, 'ordinary medicine risk stays visible');

    const oldInjection = { item_id: 'potion_compound_injection', count: 1, components: copy(inputs) };
    const injectionTpl = g.InventoryEquipment.getItemTemplate(oldInjection.item_id);
    const before = copy(g.SaveSystem.buildSnapshotForDebug());
    assert.equal(g.SceneApp.tryCompoundAtStation(copy(inputs)).reason, 'injection_locked');
    assert.equal(pc.buildInstance(copy(inputs)).reason, 'injection_locked');
    assert.equal(pc.applyInjection(oldInjection).reason, 'injection_locked');
    assert.equal(g.ItemUse.itemTemplateIsConsumable(injectionTpl), false);
    assert.equal(g.ItemUse.applyItemUseEffectFromTemplate(oldInjection.item_id, injectionTpl, { instance: oldInjection }), false);
    assert.equal(g.ItemUse.takeLastUseFailure().reason, 'injection_locked');
    const after = copy(g.SaveSystem.buildSnapshotForDebug());
    for (const key of ['inventoryEquipment', 'survival']) assert.deepEqual(after.player[key], before.player[key]);
    assert.deepEqual(after.buffs, before.buffs);
    assert.deepEqual(after.time, before.time, 'locked calls spend no time');
    assert.equal(g.ItemUse.itemTemplateIsConsumable(g.InventoryEquipment.getItemTemplate('potion_calm_brew')), true, 'ordinary medicine stays available');

    for (const value of [false, 0, 'false', '0']) {
      g.NPCSystem.setDemoFlag(flag, value);
      assert.equal(pc.isUnlocked(), false);
    }
    g.NPCSystem.setDemoFlag(flag, true);
    g.PharmacyStationPanel.refreshIfOpen();
    assert.equal(pc.isUnlocked(), true);
    assert.deepEqual(Array.from(tabs().children, b => b.textContent), ['药粉与成品', '注射液配置']);
    assert.match(details(), /浓度占用/);
    assert.match(medicineInfo(), /针具/);
    const staleTab = tabs().lastElementChild;
    staleTab.click();
    assert.equal(d.getElementById('pharmacy-method-section').hidden, true);
    assert.equal(d.getElementById('pharmacy-help'), null, 'help stays removed after injection unlock');
    const injection = g.SceneApp.tryCompoundAtStation(copy(inputs));
    assert.equal(injection.ok, true, JSON.stringify(injection));
    assert.equal(g.ItemUse.itemTemplateIsConsumable(injectionTpl), true);
    assert.ok(g.InventoryHelpers.getInventoryCountByItemId('potion_compound_injection') > 0);

    // Closing while in the mode cancels a pending click instead of crafting with stale inputs.
    const stock = JSON.stringify(g.InventoryEquipment.getState());
    g.NPCSystem.setDemoFlag(flag, false);
    d.getElementById('pharmacy-start-btn').disabled = false;
    d.getElementById('pharmacy-start-btn').click();
    assertHidden();
    staleTab.click();
    assertHidden();
    assert.equal(JSON.stringify(g.InventoryEquipment.getState()), stock, 'old injection items are preserved');

    // Reuse the saved NPC flag: same snapshot path as realtime saves and save codes.
    g.NPCSystem.setDemoFlag(flag, true);
    assert.equal(g.SaveSystem.saveNow('manual'), true);
    const saved = copy(g.SaveSystem.buildSnapshotForDebug());
    assert.equal(saved.player.npcDemo.flags[flag], true);
    const realtime = JSON.parse(g.localStorage.getItem(g.SaveSystem.getStatus().realtimeKey));
    assert.ok(JSON.stringify(realtime).includes(flag));
    g.NPCSystem.setDemoFlag(flag, false);
    assert.equal(g.SaveSystem.applySnapshotForDebug(saved), true);
    assert.equal(pc.isUnlocked(), true);

    const legacy = copy(saved);
    delete legacy.player.npcDemo.flags[flag];
    assert.equal(g.SaveSystem.applySnapshotForDebug(legacy), true);
    assert.equal(pc.isUnlocked(), false, 'loading a different/old save does not inherit the open switch');
    assert.ok(g.InventoryHelpers.getInventoryCountByItemId('potion_compound_injection') > 0);
    g.PharmacyStationPanel.render();
    assertHidden();

    const save = g.SaveSystem.saveNow;
    g.SaveSystem.saveNow = () => false;
    try {
      const result = g.SaveSystem.runAtomic(() => g.NPCSystem.setDemoFlag(flag, true), { trigger: 'manual' });
      assert.equal(result.saved, false);
      assert.equal(pc.isUnlocked(), false, 'failed future unlock transaction rolls back with the save');
    } finally { g.SaveSystem.saveNow = save; }
    g.NPCSystem.setDemoFlag(flag, true);
    g.SaveSystem.clearAllLocalProgress();
    assert.equal(pc.isUnlocked(), false, 'starting over clears the switch');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
