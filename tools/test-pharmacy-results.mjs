import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';
import { equipPharmacyTestBag } from './pharmacy-test-fixture.mjs';

for (const full of [false, true]) test(`pharmacy seconds and actual receipts (${full ? 'Svelte' : 'native'})`, async () => {
  const h = await boot(full), g = h.g, d = g.document;
  try {
    let steps = 0;
    while (g.DialogueUI.isDialogueOpen() && steps++ < 1000) g.DialogueUI.next();
    await h.drain();
    g.SceneApp.openCharacterCreationAfterIntro();
    assert.equal(g.SceneApp.creation.confirm({ name: '制药结果回归', height: 178, gender: 'male', hand: 'right', leg: 'right' }), true);
    await h.drain();
    g.GameEngine.setState('M0_Base_Inside_lv_1', 13, 14);
    g.NPCSystem.setDemoFlag('npc_station_pharmacy_base_repaired', true);
    g.Survival.setState({ thirst: 100, dirtyness: 0 });
    const ps = g.PharmacyStation, ie = g.InventoryEquipment;
    // This suite isolates timing/output behavior; equipment wear has its own regression suite.
    ps.setConfig({ systemConfig: { ...ps.getSystemConfig(), pharmacy_equipment_break_chance: 0 } });
    equipPharmacyTestBag(g);
    const recipe = ps.getRecipes().find(r => r.recipe_id === 'life_pharmacy.crush_cannabis_powder');
    const count = id => g.InventoryHelpers.getInventoryCountByItemId(id);
    const stock = ids => ie.setState({ ...ie.getState(), inventory_pocket: ids.map(item_id => ({ item_id, count: 10 })), inventory_backpack: [] });
    stock([...recipe.inputs.map(i => i.item_id)]);
    ps.getState().installed_accessory_item_ids = ['tool_rolling_pin_pharmacy'];
    ps.getState().fuel_points = 100;
    g.PharmacyStationPanel.open();
    await h.drain();
    const panel = d.getElementById('pharmacy-result');
    assert.equal(panel.hidden, true);
    assert.equal(d.getElementById('pharmacy-help'), null);
    // The footer uses the HUD meter style and follows actual state/status refreshes.
    const meter = d.getElementById('pharmacy-stamina-meter');
    const staminaBar = d.getElementById('pharmacy-stamina-bar');
    assert.equal(meter.className, 'track');
    assert.equal(meter.style.getPropertyValue('--tone'), '#9daf91');
    g.Survival.setState({ stamina: 38.4 });
    g.SceneHud.refresh('status');
    await h.drain();
    assert.equal(Number(meter.getAttribute('aria-valuenow')), g.Survival.getState().stamina);
    assert.equal(Number(meter.getAttribute('aria-valuemax')), g.Survival.getState().stamina_max);
    assert.equal(staminaBar.style.width, d.getElementById('status-stamina-bar').style.width);
    assert.equal(d.getElementById('pharmacy-stamina-text').textContent.replace(/\s/g, ''), d.getElementById('status-stamina-text').textContent.replace(/\s/g, ''));
    g.Survival.setState({ stamina: 100 });
    g.SceneHud.refresh('status');

    // Capture the real scheduler: no sleep and no early materialization of output.
    const originalSet = g.setInterval, originalClear = g.clearInterval;
    const timers = new Map(); let sequence = 90000;
    g.setInterval = (fn, ms) => { const id = ++sequence; timers.set(id, { fn, ms }); return id; };
    g.clearInterval = id => { if (!timers.delete(id)) originalClear.call(g, id); };
    const originalRandom = g.Math.random, originalRoute = g.RecipeSystem.craft;
    try {
      g.Math.random = () => 0;
      // Include a guaranteed extra output to ensure the receipt uses actual grants.
      g.RecipeSystem.craft = args => {
        const result = originalRoute(args);
        if (!result.ok) return result;
        return { ...result, result: { ...result.result, bonus_outputs: [{ item_id: 'med_antler_powder', count: 2, chance: 1 }] } };
      };
      const before = count(recipe.main_output.item_id), beforeBonus = count('med_antler_powder');
      const started = g.SceneApp.tryPharmacyAtStation(recipe.method_id, recipe.inputs);
      assert.equal(started.ok, true, JSON.stringify(started));
      g.PharmacyStationPanel.render();
      assert.equal(timers.size, 1);
      const timer = [...timers.values()][0];
      assert.equal(timer.ms, 1000, 'each automatic work tick waits one second');
      assert.equal(count(recipe.main_output.item_id), before, 'starting grants no output');
      assert.equal(panel.hidden, true);
      assert.equal(d.getElementById('pharmacy-action-status').textContent, '制作中');
      assert.doesNotMatch(d.querySelector('.pharmacy-footer').textContent, /等待|剩余|秒|需\s*\d/);
      assert.equal(Number(meter.getAttribute('aria-valuenow')), g.Survival.getState().stamina, 'craft cost updates the shared-state meter immediately');
      for (let remaining = started.remaining_ticks; remaining > 0; remaining--) {
        assert.equal(ps.getActiveCraft().remaining_ticks, remaining);
        const tick = g.GameTime.getState().totalTicks;
        timer.fn();
        assert.equal(g.GameTime.getState().totalTicks, tick + 1);
        if (remaining > 1) assert.equal(panel.hidden, true);
      }
      assert.equal(timers.size, 0, 'completion stops the timer');
      assert.equal(ps.getActiveCraft(), null);
      const receipt = ps.getLastCraftResult();
      assert.equal(receipt.success, true);
      assert.equal(receipt.outputs.find(r => r.item_id === recipe.main_output.item_id).count, count(recipe.main_output.item_id) - before);
      assert.equal(receipt.outputs.find(r => r.item_id === 'med_antler_powder').count, count('med_antler_powder') - beforeBonus);
      assert.equal(count('med_antler_powder') - beforeBonus, 2);
      assert.equal(panel.hidden, false);
      assert.match(panel.textContent, /本次制作获得/);
      assert.ok(panel.textContent.includes(g.StationCraftCore.getItemDisplayNameSafe(recipe.main_output.item_id)));
      assert.doesNotMatch(panel.textContent, /life_pharmacy\.|med_|potion_/);
      const text = panel.textContent;
      g.PharmacyStationPanel.render();
      assert.equal(panel.textContent, text, 'routine renders retain the receipt');
      const inventoryAfterCraft = count(recipe.main_output.item_id);
      panel.querySelector('button[aria-label="关闭制作结果"]').click();
      assert.equal(panel.hidden, true);
      g.PharmacyStationPanel.render();
      assert.equal(panel.hidden, true, 'a dismissed result stays closed after rendering');
      assert.equal(ps.getLastCraftResult(), receipt, 'dismissal only changes presentation');
      assert.equal(count(recipe.main_output.item_id), inventoryAfterCraft);

      // A new job clears the old receipt; a failed job reports the real residue.
      g.RecipeSystem.craft = originalRoute;
      g.Math.random = () => 0.999999;
      const failStarted = g.SceneApp.tryPharmacyAtStation(recipe.method_id, recipe.inputs);
      assert.equal(failStarted.ok, true, JSON.stringify(failStarted));
      g.PharmacyStationPanel.render();
      assert.equal(panel.hidden, true);
      const failureBefore = count(ps.getFailureItemId());
      const failTimer = [...timers.values()][0];
      for (let i = 0; i < failStarted.remaining_ticks; i++) failTimer.fn();
      assert.equal(ps.getLastCraftResult().success, false);
      assert.equal(panel.hidden, false, 'the next batch shows a new result');
      assert.equal(count(ps.getFailureItemId()), failureBefore + 1);
      assert.match(panel.textContent, /制作失败，获得/);
      assert.ok(panel.textContent.includes(g.StationCraftCore.getItemDisplayNameSafe(ps.getFailureItemId())));

      // Inventory can fill while waiting: ground output is still reported accurately.
      g.Math.random = () => 0;
      const groundStarted = g.SceneApp.tryPharmacyAtStation(recipe.method_id, recipe.inputs);
      assert.equal(groundStarted.ok, true, JSON.stringify(groundStarted));
      const originalPut = ie.putItemIntoDefaultContainer;
      ie.putItemIntoDefaultContainer = () => ({ placed: false });
      try {
        const groundTimer = [...timers.values()][0];
        for (let i = 0; i < groundStarted.remaining_ticks; i++) groundTimer.fn();
      } finally { ie.putItemIntoDefaultContainer = originalPut; }
      assert.equal(ps.getLastCraftResult().outputs[0].destination, 'ground');
      assert.ok(ie.getGroundItemsAt('M0_Base_Inside_lv_1', 13, 14).some(i => i.item_id === recipe.main_output.item_id));
      assert.match(panel.textContent, /已放在脚下/);

      g.NPCSystem.setDemoFlag('pharmacy_injection_unlocked', true);
      const inputs = ['solvent_water_pure', 'med_antler_powder'];
      stock(inputs);
      const compound = g.SceneApp.tryCompoundAtStation(inputs.map(item_id => ({ item_id, count: 1 })));
      assert.equal(compound.ok, true, JSON.stringify(compound));
      assert.equal(count(compound.instance.item_id), 1);
      assert.equal(ps.getLastCraftResult().outputs[0].item_id, compound.instance.item_id);
      assert.ok(panel.textContent.includes(g.StationCraftCore.getItemDisplayNameSafe(compound.instance.item_id)));
      const incompatible = ['solvent_water_pure', 'med_cocaine_powder', 'adj_vitamin_c', 'med_vitamin_c_powder'];
      stock(incompatible);
      const failed = g.SceneApp.tryCompoundAtStation(incompatible.map(item_id => ({ item_id, count: 1 })));
      assert.equal(failed.consumed, true, JSON.stringify(failed));
      assert.equal(ps.getLastCraftResult().success, false);
      assert.equal(count(ps.getFailureItemId()), 1);
      assert.match(panel.textContent, /制作失败，获得/);
      g.NPCSystem.setDemoFlag('pharmacy_injection_unlocked', false);
      g.PharmacyStationPanel.render();
      assert.equal(panel.hidden, true, 'a closed injection switch also conceals its receipt');
      assert.equal(panel.textContent, '');
    } finally {
      g.setInterval = originalSet; g.clearInterval = originalClear;
      g.Math.random = originalRandom; g.RecipeSystem.craft = originalRoute;
    }
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
