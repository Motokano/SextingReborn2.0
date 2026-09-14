// Real panel, markup and styles with isolated inventory. Requires Playwright.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const html = read('index.html');
    const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(m => m[0]).join('\n');
    const markup = html.slice(html.indexOf('        <div id="modal-cooking-station"'), html.indexOf('        <div id="modal-pharmacy-station"'));
    await page.setContent('<meta charset="utf-8">' + styles + markup);
    await page.evaluate(({ strings, items }) => {
      window.testInventory = Object.entries(items).filter(([, item]) => item.cooking_ingredient).map(([item_id]) => ({ item_id, count: 8 }));
      for (const item_id of ['wood_firewood', 'tool_bucket_water_full']) if (!testInventory.some(item => item.item_id === item_id)) testInventory.push({ item_id, count: 8 });
      window.testCount = id => (testInventory.find(item => item.item_id === id) || {}).count || 0;
      window.testContext = { station_type: 'main' };
      window.testStamina = 100;
      window.testCalls = [];
      window.SceneCtx = {};
      window.SceneHud = { refresh() {} };
      window.UIText = { t: (key, vars = {}) => (strings[key] || key).replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? ''),
        applyDom: parent => parent.querySelectorAll('[data-ui]').forEach(el => {
          const value = UIText.t(el.dataset.ui);
          if (el.dataset.uiAttr) el.setAttribute(el.dataset.uiAttr, value); else el.textContent = value;
        }) };
      window.InventoryEquipment = {
        getPocketArray: () => testInventory, getVestArray: () => [], getBackpackArray: () => [],
        getItemTemplate: id => items[id], getSkillLevel: () => 6, getDisplayName: item => item.name,
        getItemDisplayTier: () => 2, getCharacterForDisplay: () => ({})
      };
      window.InventoryHelpers = { getInventoryCountByItemId: testCount,
        findAllContainerSlotsByPredicate: predicate => testInventory.map((item, index) => ({ item, index, containerType: 'pocket' })).filter(slot => predicate(slot.item)) };
      window.StationContext = { isOnCookingStationTile: () => true, isCookingUiBlockedByRepair: () => false, getCurrentCookingStationContext: () => testContext };
      window.Survival = { getState: () => ({ stamina: testStamina }), advanceTick() {} };
    }, { strings: JSON.parse(read('data/ui_text_zhCN.json')), items: JSON.parse(read('data/items.json')) });
    for (const file of ['station-craft-core', 'cooking-station', 'cooking-station-panel']) await page.addScriptTag({ content: read('js/' + file + '.js') });
    await page.evaluate(({ methods, recipes }) => {
      CookingStation.setConfig({ methods, recipes });
      CookingStation.setUiDeps({ getCurrentCookingStationContext: () => testContext });
      window.SceneApp = { getKnownCookingRecipeIds: () => ['cook_stew_meat_simple'] };
      CookingStationPanel.setUiDeps({ ui: UIText.t,
        tryCookAtStation: (method, inputs) => { testCalls.push({ method, inputs }); return { ok: true }; },
        canPourWaterAtCurrentTile: () => true, canAddFuelAtCurrentTile: () => true,
        onPourWaterClick: slot => { testCalls.push({ service: 'water', slot }); CookingStation.getState().water_points += 200; },
        onAddFuelClick: slot => { testCalls.push({ service: 'fuel', slot }); CookingStation.getState().fuel_points += 100; }
      });
      CookingStationPanel.init(); CookingStationPanel.open();
    }, { methods: JSON.parse(read('data/cooking-methods.json')).methods, recipes: JSON.parse(read('data/cooking-recipes.json')).recipes });
    const start = page.locator('#cooking-start-btn');
    const status = page.locator('#cooking-action-status');
    assert.equal(await start.textContent(), '开始烹饪');
    assert(await start.isDisabled());
    assert.equal(await page.locator('#cooking-equipment').getAttribute('open'), null);
    await page.locator('#cooking-ingredient-list button').first().click();
    const qty = page.locator('#cooking-input-list input');
    await qty.fill('3'); await qty.press('Tab');
    assert.equal(await qty.inputValue(), '3');
    assert.equal(await status.textContent(), '柴火不够了');
    await page.locator('#cooking-fix-equipment').click();
    assert.equal(await page.locator('#cooking-equipment').getAttribute('open'), '');
    await page.locator('#cooking-fuel-source-list .cs-resource-pick').first().click();
    await page.locator('#cooking-modal-add-fuel-btn').click();
    assert.equal(await page.evaluate(() => testCalls[0].service), 'fuel');
    assert(await start.isEnabled());
    await page.locator('#cooking-equipment summary').click();
    await start.click();
    assert.equal(await page.evaluate(() => testCalls[1].inputs[0].count), 3);
    // Known recipes supply their own method and quantities, including a locked pot.
    await page.locator('#cooking-recipes-tab').click();
    await page.locator('#cooking-known-list button').first().click();
    assert.equal(await page.locator('#cooking-input-list input').count(), 3);
    assert.match(await status.textContent(), /缺少/);
    await page.evaluate(() => { CookingStation.getState().installed_accessory_item_ids.push('tool_pot_clay_cooking'); CookingStationPanel.render(); });
    assert.equal(await status.textContent(), '水不够了');
    await page.locator('#cooking-fix-equipment').click();
    await page.locator('#cooking-water-source-list .cs-resource-pick').first().click();
    await page.locator('#cooking-modal-pour-btn').click();
    assert.equal(await page.evaluate(() => testCalls.at(-1).service), 'water');
    assert(await start.isEnabled());
    await page.locator('#cooking-equipment summary').click();
    await page.locator('#cooking-materials-tab').click();
    await page.evaluate(() => { CookingStation.getState().water_points = 0; CookingStation.getState().water_unlimited = true; CookingStationPanel.render(); });
    assert(await start.isEnabled());
    assert(await page.locator('#cooking-water-service').isHidden());
    // Main-station unlimited water must not apply to a temporary station.
    await page.evaluate(() => { testContext = { station_type: 'temp', temp_station: { allowed_methods: ['boil_stew'], installed_accessory_item_ids: ['tool_pot_clay_cooking'] } }; CookingStationPanel.render(); });
    assert.equal(await status.textContent(), '水不够了');
    await page.evaluate(() => { testContext = { station_type: 'main' }; testStamina = 0; CookingStationPanel.render(); });
    assert.equal(await status.textContent(), '体力不足');
    await page.evaluate(() => { testStamina = 100; CookingStationPanel.render(); });
    assert(!/\b(?:item_|tool_|hunt_|ore_)/.test(await page.locator('#cooking-input-list').innerText()));
    const output = path.join(os.tmpdir(), 'cooking-panel-desktop.png');
    await page.screenshot({ path: output });
    await page.locator('#cooking-help summary').click();
    assert(!/API|tryCook|（|）/.test(await page.locator('#cooking-help-text').innerText()));
    await page.locator('#cooking-help summary').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(os.tmpdir(), 'cooking-panel-mobile.png') });
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector('#modal-cooking-station .cs-panel');
      const button = document.getElementById('cooking-start-btn').getBoundingClientRect();
      return { width: panel.clientWidth, scroll: panel.scrollWidth, bottom: button.bottom, height: innerHeight };
    });
    assert(geometry.scroll <= geometry.width + 1);
    assert(geometry.bottom <= geometry.height);
    await page.evaluate(() => {
      CookingStation.getState().active_craft = { method_id: 'boil_stew', remaining_ticks: 2, started_total_ticks: 10 };
      window.GameTime = { getState: () => ({ totalTicks: 11 }) }; CookingStationPanel.render();
    });
    assert(await start.isDisabled());
    assert.equal(await status.textContent(), '剩余 2 tick');
    assert.equal(await page.locator('#cooking-active-craft progress').getAttribute('value'), '1');
    assert.deepEqual(errors, []);
    console.log('Cooking panel: ingredients, quantities, recipes, missing equipment, fuel/water actions, unlimited/temporary water, stamina, progress and mobile layout passed.');
    console.log(output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
