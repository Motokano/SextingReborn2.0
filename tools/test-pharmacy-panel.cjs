// Real markup and panel in Chromium; controlled inventory avoids changing a save.
// Run with Playwright available on NODE_PATH: node tools/test-pharmacy-panel.cjs
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const html = read('index.html');
    const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(m => m[0]).join('\n');
    const markup = html.slice(html.indexOf('        <div id="modal-pharmacy-station"'), html.indexOf('        <div id="modal-compost-station"'));
    await page.setContent('<meta charset="utf-8">' + styles + markup);
    await page.evaluate(({ strings, items }) => {
      window.testInventory = Object.entries(items).filter(([, item]) => item.pharmacy_ingredient).map(([item_id]) => ({ item_id, count: 8 }));
      window.testCount = id => (testInventory.find(item => item.item_id === id) || {}).count || 0;
      window.SceneCtx = {};
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
      window.InventoryHelpers = { getInventoryCountByItemId: testCount, findAllContainerSlotsByPredicate: () => [] };
      window.StationContext = { isOnPharmacyStationTile: () => true, isPharmacyUiBlockedByRepair: () => false, getCurrentPharmacyStationContext: () => ({ station_type: 'main' }) };
      window.Survival = { getState: () => ({ stamina: 100 }), advanceTick() {} };
    }, { strings: JSON.parse(read('data/ui_text_zhCN.json')), items: JSON.parse(read('data/items.json')) });
    for (const file of ['station-craft-core', 'pharmacy-config', 'pharmacy-station', 'pharmacy-compounding', 'pharmacy-station-panel']) await page.addScriptTag({ content: read('js/' + file + '.js') });
    await page.evaluate(({ methods, csv, rules }) => {
      PharmacyStation.setConfig({ methods });
      PharmacyCompounding.setConfig(PharmacyConfig.parseCsv(csv), rules);
      window.testCalls = [];
      PharmacyStationPanel.setUiDeps({ ui: UIText.t,
        tryPharmacyAtStation: (method, inputs) => { testCalls.push({ mode: 'craft', method, inputs }); return { ok: true }; },
        tryCompoundAtStation: inputs => { testCalls.push({ mode: 'compound', inputs }); return { ok: true }; }
      });
      PharmacyStationPanel.init();
      PharmacyStationPanel.open();
    }, { methods: JSON.parse(read('data/recipe-methods.json')).methods, csv: read('data/pharmacy-system-config.csv'), rules: JSON.parse(read('data/pharmacy-conflict-rules.json')) });
    const start = page.locator('#pharmacy-start-btn');
    assert.equal(await start.textContent(), '制作');
    assert(await start.isDisabled());
    assert.equal(await page.locator('#pharmacy-method-list button').count(), 9);
    assert.equal(await page.locator('#pharmacy-equipment').getAttribute('open'), null);
    await page.locator('[data-method-id="life_pharmacy.crushing"]').click();
    await page.locator('#pharmacy-ingredient-list button').first().click();
    const quantity = page.locator('#pharmacy-input-list input');
    await quantity.fill('3'); await quantity.press('Tab');
    assert.equal(await quantity.inputValue(), '3');
    assert.match(await page.locator('#pharmacy-action-status').textContent(), /缺少/);
    await page.evaluate(() => { PharmacyStation.getState().installed_accessory_item_ids.push('tool_rolling_pin_pharmacy'); PharmacyStationPanel.render(); });
    assert.equal(await page.locator('#pharmacy-action-status').textContent(), '燃料不足');
    await page.locator('#pharmacy-fix-equipment').click();
    assert.equal(await page.locator('#pharmacy-equipment').getAttribute('open'), '');
    await page.locator('#pharmacy-equipment summary').click();
    await page.evaluate(() => { PharmacyStation.getState().fuel_points = 100; PharmacyStationPanel.render(); });
    assert(await start.isEnabled());
    await page.locator('#pharmacy-recipes-tab').click();
    assert(await page.locator('#pharmacy-recipes-view').isVisible());
    await page.locator('#pharmacy-materials-tab').click();
    assert(await page.locator('#pharmacy-materials-view').isVisible());
    const screenshot = path.join(os.tmpdir(), 'pharmacy-panel-desktop.png');
    await page.screenshot({ path: screenshot });
    await start.click();
    assert.equal(await page.evaluate(() => testCalls[0].mode), 'craft');
    assert.equal(await page.evaluate(() => testCalls[0].inputs[0].count), 3);
    assert.equal(await page.locator('#pharmacy-input-list input').count(), 0);
    await page.evaluate(() => {
      const recipe = { recipe_id: 'test_known', method_id: 'life_pharmacy.crushing', inputs: [{ item_id: testInventory[0].item_id, count: 2 }] };
      PharmacyStation.setConfig({ recipes: [recipe] });
      window.SceneApp = { getKnownPharmacyRecipeIds: () => ['test_known'] };
      PharmacyStationPanel.render();
    });
    await page.locator('#pharmacy-recipes-tab').click();
    await page.locator('#pharmacy-known-list button').click();
    assert.equal(await page.locator('#pharmacy-input-list input').inputValue(), '2');
    await page.locator('#pharmacy-mode-tabs button').nth(1).click();
    assert.equal(await start.textContent(), '配置');
    assert(await page.locator('#pharmacy-method-section').isHidden());
    assert(await page.locator('#pharmacy-equipment').isHidden());
    assert(await page.locator('#pharmacy-recipes-tab').isHidden());
    await page.locator('#pharmacy-clear-btn').click();
    assert.equal(await page.locator('#pharmacy-action-status').textContent(), '请加入材料');
    assert(await start.isDisabled());
    // Use real compounding inputs and rules, including capacity failure.
    for (const id of ['solvent_water_pure', 'med_cocaine_powder']) {
      await page.locator('#pharmacy-ingredient-filter').fill(id);
      await page.locator('#pharmacy-ingredient-list button').first().click();
    }
    await page.locator('#pharmacy-ingredient-filter').fill('');
    assert(await start.isEnabled());
    await page.locator('#pharmacy-input-list input').first().fill('2');
    await page.locator('#pharmacy-input-list input').first().press('Tab');
    assert(await start.isDisabled());
    assert.match(await page.locator('#pharmacy-action-status').textContent(), /溶媒/);
    await page.locator('#pharmacy-input-list input').first().fill('1');
    await page.locator('#pharmacy-input-list input').first().press('Tab');
    await page.screenshot({ path: path.join(os.tmpdir(), 'pharmacy-panel-compound.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(os.tmpdir(), 'pharmacy-panel-mobile.png') });
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector('#modal-pharmacy-station .cs-panel');
      const button = document.getElementById('pharmacy-start-btn').getBoundingClientRect();
      return { width: panel.clientWidth, scrollWidth: panel.scrollWidth, buttonBottom: button.bottom, height: innerHeight };
    });
    assert(geometry.scrollWidth <= geometry.width + 1, 'No horizontal overflow at 390px');
    assert(geometry.buttonBottom <= geometry.height, 'Action remains in view');
    await start.click();
    assert.equal(await page.evaluate(() => testCalls[1].mode), 'compound');
    assert.equal(await page.evaluate(() => testCalls[1].inputs.length), 2);
    await page.evaluate(() => {
      PharmacyStation.getState().active_craft = { method_id: 'life_pharmacy.crushing', remaining_ticks: 2, started_total_ticks: 10 };
      window.GameTime = { getState: () => ({ totalTicks: 12 }) };
      PharmacyStationPanel.render();
    });
    assert(await start.isDisabled());
    assert.equal(await page.locator('#pharmacy-action-status').textContent(), '剩余 2 tick');
    assert.equal(await page.locator('#pharmacy-active-craft progress').getAttribute('value'), '2');
    assert.deepEqual(errors, []);
    console.log('Pharmacy panel: modes, quantities, known recipes, action dispatch, progress, missing fuel, disclosure, real compounding and mobile layout passed.');
    console.log('Screenshots: ' + screenshot);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
