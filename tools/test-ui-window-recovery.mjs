import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

const key = 'ui_windows_moss_c_v1';
function exposed(g, el) {
  assert.ok(el, 'control exists');
  for (let node = el; node; node = node.parentElement) {
    if (node.hidden || g.getComputedStyle(node).display === 'none') return false;
  }
  return true;
}
async function click(h, selector) {
  const el = h.g.document.querySelector(selector);
  assert.ok(exposed(h.g, el), selector + ' must be reachable, not just present in hidden DOM');
  el.click(); await h.drain();
}

for (const full of [false, true]) for (const savedHidden of [false, true]) {
  test(`${full ? 'Svelte' : 'native'}: panel manager restores ${savedHidden ? 'previously saved' : 'newly hidden'} function buttons`, async () => {
    const storage = savedHidden ? { [key]: JSON.stringify({ version: 1, lock: false, windows: {
      'win-actions-right': { visible: false }, 'win-log': { visible: false }
    } }) } : {};
    const h = await boot(full, { storage }), g = h.g, doc = g.document;
    try {
      g.DialogueUI.close(); await h.drain();
      assert.ok(!g.SvelteInteractions?.overlays.active(), 'story overlays have released input');
      const row = '[data-win-id="win-actions-right"]';
      const ticks = g.GameTime.getState().totalTicks;
      if (!savedHidden) {
        assert.ok(exposed(g, doc.getElementById('btn-backpack')));
        await click(h, '#btn-ui-windows');
        await click(h, row + ' input');
        await click(h, '#btn-ui-windows'); // Close, then reopen through the retained entry.
      }
      assert.equal(g.UIWindows.getVisible('win-actions-right'), false);
      assert.equal(exposed(g, doc.getElementById('btn-backpack')), false);
      await click(h, '#btn-ui-windows');
      assert.equal(doc.getElementById('ui-windows-menu').getAttribute('aria-hidden'), 'false');
      assert.equal(doc.querySelector(row + ' input').checked, false);
      await click(h, row);
      assert.equal(g.UIWindows.getVisible('win-actions-right'), true);
      for (const id of ['btn-backpack', 'btn-survival', 'btn-combat', 'btn-save']) {
        assert.ok(exposed(g, doc.getElementById(id)), id + ' restored');
      }
      assert.equal(doc.getElementById('btn-bgm'), null, 'removed music control stays absent');
      assert.equal(doc.querySelector('audio'), null, 'navigation does not create a music player');
      assert.equal(g.BackgroundMusic, undefined);
      assert.equal(g.GameTime.getState().totalTicks, ticks, 'window preferences do not advance the game');
      if (savedHidden) assert.equal(g.UIWindows.getVisible('win-log'), false, 'other preferences preserved');
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.notEqual(JSON.parse(g.localStorage.getItem(key)).windows['win-actions-right']?.visible, false);
      assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  });
}
