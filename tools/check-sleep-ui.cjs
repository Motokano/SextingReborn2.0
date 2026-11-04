// Isolated browser storage; serves workspace files without a live server or player saves.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright-core');
const origin = 'http://127.0.0.1:8048';
(async () => {
  const browser = await chromium.launch({ headless: true });
  fs.mkdirSync('tmp/sleep-ui', { recursive: true });
  try {
    for (const mode of ['classic', 'svelte', 'touch']) {
      const ctx = await browser.newContext({ viewport: { width: mode === 'touch' ? 390 : 1280, height: mode === 'touch' ? 844 : 800 },
        hasTouch: mode === 'touch', isMobile: mode === 'touch' });
      await ctx.route('**/*', async route => {
        const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort();
        const file = path.resolve('.', decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).slice(1));
        if (!file.startsWith(process.cwd() + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json',
          '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
        return route.fulfill({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
      });
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
      await page.goto(origin + '/?no_reload' + (mode === 'classic' ? '' : '&ui=svelte-hud'));
      await page.evaluate(() => AppBoot.ready);
      await page.evaluate(() => { DialogueUI.close(); SceneApp.openCharacterCreationAfterIntro(); });
      await page.locator('#creation-name').fill('睡眠验收'); await page.locator('#btn-confirm-creation').click();
      await page.evaluate(() => {
        DialogueUI.close(); GameEngine.setState('M0_Base_Inside_lv_1', 10, 15);
        Survival.setState({ stamina: 4, fatigue: 100, satiety: 100, thirst: 100, energy: 100,
          food_metabolism: null, weight_kg: 60 });
        window.sleepTimes = []; window.sleepStarted = performance.now();
        const old = Survival.advanceTick;
        Survival.advanceTick = function (options) {
          if (options?.source === 'sleep') sleepTimes.push(performance.now());
          return old.apply(this, arguments);
        };
        if (!SceneApp.trySleepAtBed()) throw Error('bed sleep did not start');
      });
      assert.equal(await page.evaluate(() => Survival.getSatiety()), 100);
      await page.keyboard.press('Escape'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space');
      assert.equal(await page.locator('#bed-sleep-panel').isVisible(), true);
      assert.deepEqual(await page.evaluate(() => [GameEngine.getState().x, GameEngine.getState().y]), [10, 15]);
      await page.waitForFunction(() => BedSleep.getState()?.completed >= 1);
      assert(await page.locator('.bed-sleep-time').innerText().then(t => /剩余 \d+ 秒/.test(t)));
      const box = await page.locator('#bed-sleep-panel').boundingBox();
      assert(box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1);
      await page.screenshot({ path: `tmp/sleep-ui/${mode}.png` });
      if (mode === 'classic') {
        await page.waitForFunction(() => !BedSleep.isActive(), null, { timeout: 70000 });
        const result = await page.evaluate(() => ({ elapsed: performance.now() - sleepStarted, times: sleepTimes,
          first: sleepTimes[0] - sleepStarted, stamina: Survival.getStamina(), fatigue: Survival.getFatigue(),
          food: Survival.getSatiety(), water: Survival.getThirst() }));
        assert.equal(result.times.length, 48); assert(result.elapsed >= 48000); assert(result.first >= 995);
        for (let i = 1; i < result.times.length; i++) assert(result.times[i] - result.times[i - 1] >= 995);
        assert.deepEqual([result.stamina, result.fatigue, result.food, result.water], [100, 4, 52, 52]);
        assert.equal(await page.locator('#bed-sleep-panel').isVisible(), false);
        console.log(`PASS actual 48-tick sleep: ${(result.elapsed / 1000).toFixed(2)} seconds, every tick waited >= 1 second`);
      }
      assert.deepEqual(errors, []); console.log('PASS sleep browser layout and input lock: ' + mode);
      await ctx.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
