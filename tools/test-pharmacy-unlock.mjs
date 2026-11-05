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
    assert.deepEqual(Array.from(tabs().children, b => b.textContent), ['普通制药', '制作注射液']);
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

    // Enhancement shares the station header, but is undiscoverable until construction completes.
    const station = g.PharmacyStationPanel;
    if (!station.isOpen()) station.open();
    let enhanced = false;
    const enhancement = d.createElement('section');
    enhancement.textContent = '强化投料';
    enhancement.hidden = true;
    panel().querySelector('.cs-panel').appendChild(enhancement);
    station.setEnhancementView({
      isUnlocked: () => enhanced,
      render: () => { enhancement.hidden = false; },
      hide: () => { enhancement.hidden = true; }
    });
    const tabNames = () => Array.from(tabs().children, b => b.textContent);
    assert.deepEqual(tabNames(), ['普通制药', '制作注射液']);
    assert.equal(station.selectMode('enhance'), false);
    assert.equal(enhancement.hidden, true);
    enhanced = true;
    station.refreshIfOpen();
    assert.deepEqual(tabNames(), ['普通制药', '制作注射液', '强化药品']);
    assert.equal(tabs().parentElement.classList.contains('cs-head'), true, 'modes stay beside the station title');
    const staleEnhanceTab = tabs().lastElementChild;
    const beforeModes = copy(g.SaveSystem.buildSnapshotForDebug());
    staleEnhanceTab.click();
    assert.equal(station.getMode(), 'enhance');
    assert.equal(enhancement.hidden, false);
    assert.equal(panel().querySelector('.cs-body').hidden, true);
    assert.equal(panel().querySelector('.pharmacy-footer').hidden, true);
    assert.equal(tabs().lastElementChild.getAttribute('aria-pressed'), 'true');
    d.getElementById('pharmacy-start-btn').disabled = false;
    d.getElementById('pharmacy-start-btn').click();
    assert.equal(station.getMode(), 'enhance', 'stale normal crafting cannot run in enhancement mode');
    tabs().children[1].click();
    assert.equal(station.getMode(), 'compound');
    assert.equal(enhancement.hidden, true);
    assert.equal(panel().querySelector('.cs-body').hidden, false);
    assert.equal(panel().querySelector('.pharmacy-footer').hidden, false);
    tabs().children[0].click();
    assert.equal(station.getMode(), 'craft');
    tabs().lastElementChild.click();
    enhanced = false;
    station.refreshIfOpen();
    assert.deepEqual(tabNames(), ['普通制药', '制作注射液'], 'reset removes the entry completely');
    assert.equal(station.getMode(), 'craft');
    assert.equal(enhancement.hidden, true);
    staleEnhanceTab.click();
    assert.equal(station.getMode(), 'craft', 'old button cannot bypass the construction gate');
    const afterModes = copy(g.SaveSystem.buildSnapshotForDebug());
    for (const key of ['inventoryEquipment', 'survival']) assert.deepEqual(afterModes.player[key], beforeModes.player[key]);
    assert.deepEqual(afterModes.time, beforeModes.time, 'switching modes does not advance world time');
    station.setEnhancementView(null);
    enhancement.remove();

    g.SaveSystem.clearAllLocalProgress();
    assert.equal(pc.isUnlocked(), false, 'starting over clears the switch');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

for (const full of [false, true]) test(`pharmacy entry follows repair and upgrade progress (${full ? 'Svelte' : 'native'})`, async () => {
  const h = await boot(full), g = h.g, d = g.document;
  try {
    g.DialogueUI.close();
    g.SceneApp.openCharacterCreationAfterIntro();
    await h.drain();
    assert.equal(g.SceneApp.creation.confirm({ name: '制药入口回归', height: 178, gender: 'male', hand: 'right', leg: 'right' }), true);
    await h.drain(); g.DialogueUI.close();
    g.GameEngine.setState('M0_Base_Inside_lv_1', 13, 14);
    const npc = g.NPCSystem, station = g.PharmacyStationPanel, construction = g.FacilityUnlockPanel;
    const repair = g.FacilityUnlock.get('pharmacy'), projectId = 'pharmacy_entry_test';
    npc.setDemoFlag(repair.spec.unlock, false);
    g.FacilityUnlockConfig.projects[projectId] = {
      id: projectId, title: '升级制药台', position: [14, 15],
      requires: repair.spec.unlock, unlock: 'facility_ready:' + projectId,
      groups: g.FacilityUnlockConfig.makeGroups({ wood: 8, metal: 8, parts: 4 })
    };
    const upgrade = g.FacilityUnlock.get(projectId);
    station.setEnhancementView({ stationProjectId: projectId, isUnlocked: () => upgrade.isComplete(), render() {}, hide() {} });
    const inventory = copy(g.InventoryEquipment.getState());
    inventory.equipment.backpack = g.BackpackSystem.generate('eq_backpack_frame_hauler', []);
    inventory.inventory_pocket = []; inventory.inventory_vest = []; inventory.inventory_vehicle = [];
    inventory.inventory_backpack = Object.entries({ ore_clay_raw: 5, wood_plank_soft: 4, ore_scrap_metal: 4, mechanical_parts: 1 })
      .flatMap(([item_id, count]) => Array.from({ length: count }, () => ({ item_id, count: 1 })));
    g.InventoryEquipment.setState(inventory);
    const menuNames = () => Array.from(d.querySelectorAll('#npc-menu-buttons button'), b => b.textContent.trim());
    async function enter() { g.SceneCtx.actions.interactNpc('npc.station.pharmacy_base'); await h.drain(); }
    async function choose(index) { npc.menu.choose(index); await h.drain(); }
    async function finish(item, count) {
      construction.select(item, count); construction.act('repair'); await h.drain();
      assert.equal(construction.getView().result.ok, true);
    }
    async function closeConstruction() { construction.close(); await h.drain(); }

    const beforeMenu = copy(g.SaveSystem.buildSnapshotForDebug());
    await enter();
    assert.deepEqual(menuNames(), ['修复制药台']);
    assert.equal(station.isOpen(), false);
    const afterMenu = copy(g.SaveSystem.buildSnapshotForDebug());
    assert.deepEqual(afterMenu.player.inventoryEquipment, beforeMenu.player.inventoryEquipment);
    assert.deepEqual(afterMenu.time, beforeMenu.time, 'looking at repair options does not spend time');
    await choose(0);
    assert.equal(construction.getView().title, '修复制药台');
    assert.equal(npc.isMenuOpen(), false);
    await finish('ore_clay_raw', 2);
    await closeConstruction();
    assert.deepEqual(menuNames(), ['修复制药台']);
    await choose(0);
    assert.equal(repair.state().stone, 4, 'partial repair survives closing and re-entry');
    await finish('ore_clay_raw', 3); await finish('wood_plank_soft', 2);
    await closeConstruction();
    assert.deepEqual(menuNames(), ['使用制药台', '升级制药台']);
    await choose(0);
    assert.equal(station.isOpen(), true);
    assert.equal(npc.isMenuOpen(), false);
    assert.equal(d.querySelector('[data-pharmacy-mode="enhance"]'), null);
    station.close(); await enter(); await choose(1);
    assert.equal(construction.getView().title, '升级制药台');
    await finish('wood_plank_soft', 1);
    await closeConstruction();
    assert.deepEqual(menuNames(), ['使用制药台', '升级制药台']);
    await choose(1);
    assert.equal(upgrade.state().wood, 4, 'partial upgrade survives closing and re-entry');
    await finish('wood_plank_soft', 1); await finish('ore_scrap_metal', 4);
    const saveNow = g.SaveSystem.saveNow;
    try {
      g.SaveSystem.saveNow = () => false;
      construction.select('mechanical_parts', 1); construction.act('repair'); await h.drain();
      assert.equal(construction.getView().result.ok, false);
      assert.equal(upgrade.isComplete(), false, 'failed save cannot promote the station entry');
    } finally { g.SaveSystem.saveNow = saveNow; }
    await closeConstruction();
    assert.deepEqual(menuNames(), ['使用制药台', '升级制药台']);
    await choose(1); await finish('mechanical_parts', 1);
    await closeConstruction();
    assert.equal(upgrade.isComplete(), true);
    assert.equal(npc.isMenuOpen(), false, 'completed station skips the NPC menu');
    assert.equal(station.isOpen(), true);
    assert.ok(d.querySelector('[data-pharmacy-mode="enhance"]'));
    station.close(); await enter();
    assert.equal(npc.isMenuOpen(), false);
    assert.equal(station.isOpen(), true, 'later map interactions open the station directly');

    station.close(); npc.setDemoFlag(upgrade.spec.unlock, false); await enter();
    g.GameEngine.setState('M0_Base_Inside_lv_1', 13, 13); await choose(1);
    assert.equal(construction.isOpen(), false, 'walking away invalidates an old upgrade choice');
    npc.menu.close(); await enter();
    assert.equal(npc.isMenuOpen(), false, 'remote direct menu calls cannot expose station actions');
    g.GameEngine.setState('M0_Base_Inside_lv_1', 13, 14);
    npc.setDemoFlag(upgrade.spec.unlock, true); npc.setDemoFlag(repair.spec.unlock, false);
    await enter();
    assert.deepEqual(menuNames(), ['修复制药台'], 'repair check has priority even with an old upgrade flag');
    assert.equal(station.isOpen(), false);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
