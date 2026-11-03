import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot } from './ui-game-fixture.mjs';
import { equipPharmacyTestBag } from './pharmacy-test-fixture.mjs';

const copy = value => JSON.parse(JSON.stringify(value));

test('pharmacy catalog has no fuel cost; cooking retains its costs', () => {
  const methods = JSON.parse(fs.readFileSync('data/recipe-methods.json', 'utf8')).methods;
  for (const method of Object.values(methods).filter(m => m.recipe_system === 'life_pharmacy')) assert.equal(method.cost.fuel, 0);
  assert.ok(Object.values(methods).some(m => m.recipe_system === 'life_cooking' && m.cost.fuel > 0));
  for (const path of ['data/pharmacy-recipes.json', 'data/recipes.json']) {
    const recipes = Object.values(JSON.parse(fs.readFileSync(path, 'utf8')).recipes);
    for (const recipe of recipes.filter(r => r.recipe_id.startsWith('life_pharmacy.'))) {
      if (recipe.cost_override) assert.equal(recipe.cost_override.fuel, 0);
    }
  }
});

for (const full of [false, true]) test(`pharmacy equipment wear and saved batches (${full ? 'Svelte' : 'native'})`, async () => {
  const h = await boot(full), g = h.g, d = g.document;
  try {
    let steps = 0;
    while (g.DialogueUI.isDialogueOpen() && steps++ < 1000) g.DialogueUI.next();
    await h.drain();
    g.SceneApp.openCharacterCreationAfterIntro();
    assert.equal(g.SceneApp.creation.confirm({ name: '制药设备回归', height: 178, gender: 'male', hand: 'right', leg: 'right' }), true);
    await h.drain();
    g.GameEngine.setState('M0_Base_Inside_lv_1', 13, 14);
    g.NPCSystem.setDemoFlag('npc_station_pharmacy_base_repaired', true);
    g.Survival.setState({ thirst: 100, dirtyness: 0, stamina: 100 });
    const ps = g.PharmacyStation, ie = g.InventoryEquipment;
    equipPharmacyTestBag(g);
    const recipe = ps.getRecipes().find(r => r.recipe_id === 'life_pharmacy.crush_cannabis_powder');
    const used = ps.getMethods()[recipe.method_id].requires_accessory_item_id;
    const other = ps.getPharmacyAccessoryItemIdsFromMethods().find(id => id !== used);
    const stock = () => ie.setState({ ...ie.getState(), inventory_pocket: recipe.inputs.map(i => ({ item_id: i.item_id, count: 10 })), inventory_backpack: [{ item_id: used, count: 1 }] });
    const count = id => g.InventoryHelpers.getInventoryCountByItemId(id);
    const realSkill = ie.getSkillLevel;
    let level = 1;
    ie.getSkillLevel = id => id === 'life_pharmacy' ? level : realSkill(id);
    const chance = lv => { level = lv; return ps.getEquipmentBreakChance(); };
    assert.equal(chance(0), 0.20);
    assert.ok(Math.abs(chance(1) - 0.1985) < 1e-12);
    assert.ok(Math.abs(chance(100) - 0.05) < 1e-12);
    assert.equal(chance(134), 0);
    level = 1;
    stock();
    ps.getState().installed_accessory_item_ids = [used, other];
    ps.getState().fuel_points = 0;
    ps.markRecipeKnown(recipe.recipe_id);
    g.PharmacyStationPanel.open();
    d.getElementById('pharmacy-recipes-tab').click();
    d.querySelector('[data-recipe-id="' + recipe.recipe_id + '"]').click();
    assert.doesNotMatch(d.getElementById('modal-pharmacy-station').textContent, /燃料|添柴/);
    assert.equal(d.getElementById('pharmacy-fuel-source-list'), null);
    assert.equal(d.getElementById('pharmacy-start-btn').disabled, false);
    assert.match(d.getElementById('pharmacy-status-kv').textContent, /设备损坏率 19\.85%/);

    // A rejected job neither consumes ingredients nor rolls equipment wear.
    let rolls = 0;
    g.Math.random = () => { rolls++; return 0; };
    const beforeInvalid = JSON.stringify(ie.getState());
    assert.equal(g.SceneApp.tryPharmacyAtStation(recipe.method_id, []).ok, false);
    assert.equal(rolls, 0);
    assert.equal(JSON.stringify(ie.getState()), beforeInvalid);

    // Even a stale recipe override cannot reintroduce a fuel requirement.
    const route = g.RecipeSystem.craft;
    g.RecipeSystem.craft = args => {
      const result = route(args);
      if (!result.ok) return result;
      return { ...result, result: { ...result.result, cost_override: { ...(result.result.cost_override || ps.getMethods()[recipe.method_id].cost), fuel: 999 } } };
    };
    assert.equal(ps.getCraftPreview(recipe.method_id, recipe.inputs).cost.fuel, 0);
    const started = g.SceneApp.tryPharmacyAtStation(recipe.method_id, recipe.inputs);
    assert.equal(started.ok, true, JSON.stringify(started));
    assert.equal(started.consumed.fuel, 0);
    assert.equal(ps.getState().fuel_points, 0);
    assert.equal(ps.getActiveCraft().equipment_wear.broken, true);
    assert.ok(Math.abs(ps.getActiveCraft().equipment_wear.chance - 0.1985) < 1e-12);
    assert.equal(ps.uninstallPharmacyAccessoryToInventory(used).reason, 'accessory_in_use');
    g.PharmacyStationPanel.render();
    const deviceName = g.StationCraftCore.getItemDisplayNameSafe(used);
    const deviceRow = [...d.querySelectorAll('#pharmacy-accessory-list .cs-input-row')].find(r => r.textContent.includes(deviceName));
    assert.equal(deviceRow.querySelector('button').disabled, true);

    // The pending decision survives save/load; later RNG/skill changes do not reroll it.
    assert.equal(g.SaveSystem.saveNow('manual'), true);
    const saved = copy(g.SaveSystem.buildSnapshotForDebug());
    g.Math.random = () => 0.999999;
    level = 100;
    assert.equal(g.SaveSystem.applySnapshotForDebug(saved), true);
    assert.equal(ps.getActiveCraft().equipment_wear.broken, true);
    assert.ok(Math.abs(ps.getActiveCraft().equipment_wear.chance - 0.1985) < 1e-12);
    const oldBatch = ps.getState().active_craft;
    const beforeProduct = count(recipe.main_output.item_id);
    ps.finalizeCraftNow(oldBatch);
    assert.equal(ps.getLastCraftResult().success, true);
    assert.equal(count(recipe.main_output.item_id), beforeProduct + 1, 'equipment damage does not destroy finished medicine');
    assert.deepEqual(copy(ps.getState().installed_accessory_item_ids), [other]);
    assert.equal(ps.getLastCraftResult().broken_equipment_id, used);
    assert.equal(ps.isPharmacyMethodUnlockedAtStation(recipe.method_id), false);
    assert.equal(d.querySelector('[data-method-id="' + recipe.method_id + '"]'), null);
    assert.match(d.getElementById('pharmacy-result').textContent, /已损坏，需要重新安装/);
    assert.equal(d.getElementById('pharmacy-equipment-toggle').textContent, '重新安装');
    assert.equal(d.getElementById('pharmacy-equipment-status').textContent, deviceName + '已损坏');
    const finished = JSON.stringify(ie.getState());
    ps.finalizeCraftNow(oldBatch);
    ps.tickCraftAfterWorldTick();
    assert.equal(JSON.stringify(ie.getState()), finished, 'duplicate completion cannot grant another item');
    const brokenSave = copy(g.SaveSystem.buildSnapshotForDebug());
    assert.equal(g.SaveSystem.applySnapshotForDebug(brokenSave), true);
    assert.equal(ps.isPharmacyMethodUnlockedAtStation(recipe.method_id), false);
    d.getElementById('pharmacy-equipment-toggle').click();
    d.querySelector('#pharmacy-available-accessories [data-equipment-id="' + used + '"] button').click();
    assert.equal(ps.isPharmacyMethodUnlockedAtStation(recipe.method_id), true);
    assert.equal(d.getElementById('pharmacy-equipment-toggle').textContent, '管理设备');
    assert.doesNotMatch(d.getElementById('pharmacy-equipment-status').textContent, /已损坏/);

    // Failed production also settles one decision. High rolls leave the device intact.
    g.RecipeSystem.craft = route;
    level = 1;
    stock();
    g.Math.random = () => 0.999999;
    assert.equal(g.SceneApp.tryPharmacyAtStation(recipe.method_id, recipe.inputs).ok, true);
    ps.finalizeCraftNow(null, { force_failure: true });
    assert.equal(ps.getLastCraftResult().success, false);
    assert.equal(ps.getLastCraftResult().broken_equipment_id, '');
    assert.equal(ps.isPharmacyMethodUnlockedAtStation(recipe.method_id), true);
    g.Math.random = () => 0;
    const residue = count(ps.getFailureItemId());
    assert.equal(g.SceneApp.tryPharmacyAtStation(recipe.method_id, recipe.inputs).ok, true);
    ps.finalizeCraftNow(null, { force_failure: true });
    assert.equal(count(ps.getFailureItemId()), residue + 1);
    assert.equal(ps.getLastCraftResult().broken_equipment_id, used);
    assert.deepEqual(copy(ps.getState().installed_accessory_item_ids), [other]);

    // Injection mixing uses no device; unrelated installed equipment must be preserved.
    g.NPCSystem.setDemoFlag('pharmacy_injection_unlocked', true);
    const injectionInputs = ['solvent_water_pure', 'med_antler_powder'].map(item_id => ({ item_id, count: 1 }));
    ie.setState({ ...ie.getState(), inventory_pocket: injectionInputs, inventory_backpack: [] });
    assert.equal(g.SceneApp.tryCompoundAtStation(injectionInputs).ok, true);
    assert.deepEqual(copy(ps.getState().installed_accessory_item_ids), [other]);
    assert.equal(ps.getLastCraftResult().broken_equipment_id, '');

    // A pre-update unfinished batch is migrated at completion, once, with normal wear.
    stock();
    ps.getState().installed_accessory_item_ids.push(used);
    ps.getState().active_craft = { method_id: recipe.method_id, inputs: recipe.inputs, remaining_ticks: 1 };
    ps.tickCraftAfterWorldTick();
    assert.equal(ps.getLastCraftResult().broken_equipment_id, used);
    assert.equal(ps.getActiveCraft(), null);
  } finally { h.close(); }
});
