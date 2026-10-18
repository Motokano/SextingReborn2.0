// Real game modules/configuration in an offline DOM fixture. Canvas/audio are
// inert platform substitutes: this verifies integration, never visual rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

test('real bootstrap, status actions, window API and save restore use the new owner without changing game state', async () => {
  const h = await boot(true), g = h.g, doc = g.document;
  try {
    assert.equal(g.SvelteHUD.bridge.getSnapshot('body').ready, true);
    const map = doc.querySelector('#map-grid');
    const before = g.GameTime.getState().totalTicks;
    const staminaBefore = g.Survival.getStamina();
    g.Survival.consumeStamina(7, { raw: true });
    g.SceneHud.refresh('status'); await h.drain();
    assert.equal(g.SvelteHUD.bridge.getSnapshot('survival').rows.find(r => r.id === 'stamina').value, staminaBefore - 7);
    assert.equal(g.GameTime.getState().totalTicks, before, 'UI refresh never advances game time');
    g.SceneCtx.setSurvivalMetricVisibilityRule('thirst', false); await h.drain();
    assert.equal(doc.querySelector('#status-metric-thirst'), null);
    g.HUD.setTimeHudVisible(false); await h.drain();
    assert.equal(doc.querySelector('#top-hud').style.display, 'none');
    g.HUD.setTimeHudVisible(true);
    g.NPCSystem.setDemoFlag('observation_calendar_unlocked', true);
    g.NPCSystem.setDemoFlag('observation_temperature_unlocked', true);
    g.SceneHud.refresh('status'); await h.drain();
    assert.ok(doc.querySelector('#hud-time-text'));
    assert.match(doc.querySelector('#hud-weather').textContent, /℃/);
    g.SceneApp.openUiWindowsMenu(); await h.drain();
    assert.equal(doc.querySelector('#btn-ui-windows').getAttribute('aria-expanded'), 'true');
    assert.equal(doc.querySelectorAll('#ui-windows-menu .uwm-title').length, 1);
    const snap = g.SaveSystem.buildSnapshotForDebug();
    assert.ok(snap && snap.player);
    const savedStamina = g.Survival.getStamina();
    g.Survival.consumeStamina(5, { raw: true });
    assert.equal(g.SaveSystem.applySnapshotForDebug(snap), true);
    await h.drain();
    assert.equal(g.Survival.getStamina(), savedStamina);
    assert.equal(g.SvelteHUD.bridge.getSnapshot('survival').rows.find(r => r.id === 'stamina').value, savedStamina);
    assert.equal(doc.querySelector('#map-grid'), map);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('same real-game scenario produces equivalent HUD readings, classes and track widths in native and Svelte paths', async () => {
  const old = await boot(false), next = await boot(true);
  try {
    for (const h of [old, next]) {
      const g = h.g;
      g.GameTime.reset({ totalTicks: 600 }); g.Weather.reset(1234);
      g.NPCSystem.setDemoFlag('observation_calendar_unlocked', true);
      g.Survival.consumeStamina(9, { raw: true }); g.Survival.consumeEnergy(4);
      g.CharacterAttributes.applyCombatDestroy('lhand', 18);
      g.Survival.debugAddPain(30);
      g.SceneHud.refresh('status'); g.SceneRenderer.render(); await h.drain();
    }
    const ids = ['limb-head','limb-lhand','status-satiety-text','status-thirst-text','status-stamina-text','status-energy-text','status-fatigue-text','status-nutrition','status-mood','status-dirtyness','status-carry','moss-capacity-left','status-weight','status-potential','status-combat-experience','status-study','status-attr-jingu','status-attr-exp-exp-jingu','status-qi-li-text','status-diqi-text','status-diqi-shield-text','status-stun-text','status-pain-text','status-addiction-text','status-toxicity-text','hud-weather','hud-time-period','hud-time-text'];
    for (const id of ids) {
      const a = old.g.document.getElementById(id), b = next.g.document.getElementById(id);
      assert.ok(a && b, id + ' exists in both renderers');
      assert.equal(b.textContent.replace(/\s+/g, ' ').trim(), a.textContent.replace(/\s+/g, ' ').trim(), id + ' text');
      assert.equal(b.tagName, a.tagName, id + ' semantic element');
      assert.equal(b.className, a.className, id + ' CSS classes');
    }
    for (const id of ['satiety','thirst','stamina','energy','fatigue','nutrition','mood','dirtyness','qi-li','diqi']) {
      assert.equal(next.g.document.getElementById('status-' + id + '-bar').style.width, old.g.document.getElementById('status-' + id + '-bar').style.width, id + ' bar');
    }
    for (const id of ['status-limbs','status-survival','status-attrs-block','status-carry-card','status-combat-resources-card','buff-hud','game-log-panel']) {
      const classes = h => [...h.g.document.getElementById(id).classList].filter(c => c !== 'moss-time-unknown').sort();
      assert.deepEqual(classes(next), classes(old), id + ' host classes');
    }
    assert.deepEqual(old.errors, []); assert.deepEqual(next.errors, []);
  } finally { await old.close(); await next.close(); }
});
