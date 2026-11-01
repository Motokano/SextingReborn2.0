const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.BATHROOM_SCREENSHOT_DIR || path.join(os.tmpdir(), 'sexting-bathroom-review');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('http://bathroom.test/**', async route => {
      const url = new URL(route.request().url());
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      assert.ok(file.startsWith(root + path.sep));
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      await route.fulfill({ status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.goto('http://bathroom.test/?no_reload&ui=svelte-hud');
    await page.waitForFunction(() => window.AppBoot && window.SceneApp);
    await page.evaluate(async () => { await AppBoot.ready; DialogueUI.close(); SceneApp.openCharacterCreationAfterIntro(); });
    await page.locator('#creation-name').fill('卫生间验收');
    await page.locator('#btn-confirm-creation').click();
    await page.evaluate(() => {
      DialogueUI.close(); GameEngine.setState('M0_Base_Inside_lv_1', 13, 14); SceneCtx.setFacingDir(2);
      Survival.setState({ thirst: 0, dirtyness: 100 });
      SceneRenderer.render(); SceneHud.refresh('status');
      SceneCtx.actions.interactNpc('npc.station.bathroom_base');
    });
    await page.getByRole('button', { name: '修复卫生间', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'locked.png') });
    await page.getByRole('button', { name: '修复卫生间', exact: true }).click();
    await page.waitForFunction(() => FacilityUnlockPanel.isOpen());
    await page.evaluate(() => {
      const IE = InventoryEquipment;
      IE.setState({ ...IE.getState(), inventory_pocket: [
        { item_id: 'ore_clay_raw', count: 4 }, { item_id: 'ore_scrap_metal', count: 3 }, { item_id: 'mechanical_parts', count: 1 }, null
      ] });
      const model = FacilityUnlock.get('bathroom');
      if (!model.inspect().ok) throw Error('inspect failed');
      for (const offer of [{ore_clay_raw:4},{ore_scrap_metal:3},{mechanical_parts:1}]) if (!model.repair(offer).ok) throw Error('repair failed');
      FacilityUnlockPanel.close();
    });
    await page.getByRole('button', { name: '饮水 · 10分钟', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'ready.png') });
    await page.getByRole('button', { name: '饮水 · 10分钟', exact: true }).click();
    assert.equal(await page.evaluate(() => Survival.getState().thirst), 100);
    await page.getByRole('button', { name: '洗澡 · 30分钟', exact: true }).click();
    assert.equal(await page.evaluate(() => Survival.getDirtyness()), 0);
    await page.screenshot({ path: path.join(output, 'washed.png') });
    await page.getByRole('button', { name: '离开', exact: true }).click();
    await page.waitForFunction(() => !NPCSystem.isMenuOpen());
    await page.screenshot({ path: path.join(output, 'map.png') });
    assert.deepEqual(errors, []);
    // Inspect the same renderer at an exact 144px tile width with a clean neutral surround.
    await page.evaluate(async () => {
      document.body.replaceChildren(); document.body.style.cssText = 'margin:0;background:#d9ddcf;';
      const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:500px;top:250px;'; document.body.append(host);
      const renderer = TileRendererV2.create(host, { cellPx: 144 / Math.SQRT2 });
      renderer.render({ map: { map_id: 'bathroom-review', width: 3, height: 3 }, st: { x: 1, y: 2 },
        viewport: { width: 500, height: 400 }, staticMetaAt: () => ({ walkable: true }),
        dynamicMetaAt: (x, y) => ({ terrainVisible: true, ...(x === 1 && y === 1 ? { npc: true, npcId: 'npc.station.bathroom_base', npcLabel: '卫生间' } : {}) }) });
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ path: path.join(output, '144px.png'), clip: { x: 480, y: 220, width: 520, height: 500 } });
    console.log('PASS browser repair entry, drinking, washing, no runtime errors; screenshots: ' + output);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
