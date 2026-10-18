// Offline component integration: no browser, server, network, or user save data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
const key = 'ui_windows_moss_c_v1';
const wait = () => new Promise(resolve => setTimeout(resolve, 0));

function harness({ pilot = true, storage = null } = {}) {
  const dom = new JSDOM(html, { url: `https://ui-test.invalid/${pilot ? '?ui=svelte-carry' : ''}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const g = dom.window;
  g.innerWidth = 1440; g.innerHeight = 1000;
  if (storage) g.localStorage.setItem(key, storage);
  let weight = 18.4;
  g.SceneCtx = {
    leftHudBlockVisibilityRules: {}, survivalMetricVisibilityRules: {},
    shouldShowLeftHudBlock(id) { return this.leftHudBlockVisibilityRules[id] !== false; },
    shouldShowSurvivalMetric(id) { return this.survivalMetricVisibilityRules[id] !== false; },
  };
  g.CharacterAttributes = { getCarryCapacity: () => 30, getEffectiveAttr: () => 10, getBaseInnateAttr: () => 10, getPartDestroy: () => 0, getBodyPartDestroyMax: () => 100 };
  g.InventoryEquipment = { getCurrentCarryWeight: () => weight };
  g.Survival = { getState: () => ({ weight_kg: 70, satiety: 80, thirst: 70, stamina: 60, energy: 50, fatigue: 10, nutrition: 80 }), getMood: () => 400 };
  g.NPCSystem = { isDemoFlagTrue: () => true };
  g.UIText = { t: name => name };
  function load(path) { g.eval(fs.readFileSync(path, 'utf8')); }
  load('js/ui-windows.js'); load('js/scene-hud.js');
  load('assets/ui/svelte-hud.js'); load('js/ui-moss-game.js');
  for (const fn of g.AppBoot.afterStart) fn();
  const host = g.document.getElementById('status-carry-card');
  // jsdom has no layout engine; a deterministic box tests drag persistence only.
  host.getBoundingClientRect = () => {
    const left = parseFloat(host.style.left) || 900, top = parseFloat(host.style.top) || 500;
    return { left, top, width: 272, height: 280, right: left + 272, bottom: top + 280 };
  };
  return { dom, g, host, setWeight(v) { weight = v; g.SceneHud.refresh('status'); }, async ready() { for (const fn of g.AppBoot.afterReady || []) fn(); await wait(); }, close() { dom.window.close(); } };
}

test('default entry stays native; pilot does not render values until ready', async () => {
  const baseline = harness({ pilot: false });
  assert.equal(baseline.g.SvelteCarryPilot, undefined);
  assert.equal(baseline.host.dataset.uiOwner, undefined);
  assert.match(baseline.host.textContent, /18.4/);
  baseline.close();
  const h = harness();
  try {
    assert.equal(h.host.dataset.uiOwner, 'svelte');
    assert.equal(h.host.style.display, 'none');
    assert.equal(h.host.querySelector('#status-carry'), null);
    await h.ready();
    assert.equal(h.host.style.display, '');
    assert.match(h.host.textContent, /18.4/);
    assert.match(h.host.querySelector('#moss-capacity-left').textContent, /11.6/);
    assert.equal(h.g.document.querySelectorAll('#status-carry').length, 1);
    h.setWeight(24); await wait();
    assert.match(h.host.querySelector('#status-carry').textContent, /24/);
    assert.match(h.host.querySelector('#moss-capacity-left').textContent, /6/);
  } finally { h.close(); }
});

test('knowledge removes readings and manager entry, then restores the player preference', async () => {
  const h = harness();
  try {
    await h.ready();
    h.g.SceneCtx.survivalMetricVisibilityRules.weight = false;
    h.g.SvelteCarryPilot.invalidate(); await wait();
    assert.equal(h.host.querySelector('#status-weight'), null);
    h.g.UIWindows.setVisible('win-carry', false);
    h.g.SceneCtx.leftHudBlockVisibilityRules.carry = false;
    h.g.SvelteCarryPilot.invalidate(); await wait();
    assert.equal(h.host.querySelector('#status-carry'), null);
    assert.equal(h.g.UIWindows.getPanelList().some(x => x.id === 'win-carry'), false);
    h.g.SceneCtx.leftHudBlockVisibilityRules.carry = true;
    h.g.SvelteCarryPilot.invalidate(); await wait();
    assert.equal(h.host.style.display, 'none');
    h.g.UIWindows.setVisible('win-carry', true); await wait();
    assert.equal(h.host.style.display, '');
  } finally { h.close(); }
});

test('Svelte buttons toggle once, persist folding, close/reopen and retain material structure', async () => {
  const h = harness();
  let saved;
  try {
    await h.ready();
    for (let i = 0; i < 20; i++) {
      h.host.querySelector('.ui-window-min').click(); await wait();
      assert.equal(h.g.UIWindows.isFolded('win-carry'), i % 2 === 0);
      assert.equal(h.host.querySelector('.ui-window-min').getAttribute('aria-expanded'), String(i % 2 !== 0));
    }
    h.host.querySelector('.ui-window-min').click(); await wait();
    saved = h.g.localStorage.getItem(key);
    assert.equal(JSON.parse(saved).windows['win-carry'].folded, true);
    h.host.querySelector('.ui-window-close').click(); await wait();
    assert.equal(h.host.style.display, 'none');
    h.g.UIWindows.setVisible('win-carry', true); await wait();
    assert.equal(h.host.style.display, '');
    assert.equal(h.host.querySelectorAll(':scope > .panel-head').length, 1);
    assert.equal(h.host.querySelectorAll(':scope > .panel-content').length, 1);
    assert.equal(h.host.querySelector('svg path').getAttribute('d'), 'M6 7h12l1 13H5L6 7Z M9 7V5a3 3 0 0 1 6 0v2 M9 12h6');
  } finally { h.close(); }
  const restored = harness({ storage: saved });
  try {
    await restored.ready();
    assert.equal(restored.host.classList.contains('folded'), true);
    assert.equal(restored.host.querySelector('.ui-window-min').textContent, '+');
  } finally { restored.close(); }
});

test('legacy window manager drags only the outer host and honors lock/reset', async () => {
  const h = harness();
  try {
    await h.ready();
    function drag() {
      h.host.querySelector('.panel-head').dispatchEvent(new h.g.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 910, clientY: 510 }));
      h.g.document.dispatchEvent(new h.g.MouseEvent('mousemove', { clientX: 610, clientY: 310 }));
      h.g.document.dispatchEvent(new h.g.MouseEvent('mouseup'));
    }
    const reading = h.host.querySelector('#status-carry');
    drag();
    assert.equal(h.host.style.left, '600px');
    assert.equal(h.host.style.top, '300px');
    assert.equal(h.host.querySelector('#status-carry'), reading);
    h.g.UIWindows.setLock(true); drag();
    assert.equal(h.host.style.left, '600px');
    h.g.UIWindows.resetAll();
    assert.equal(h.host.style.left, '');
    assert.equal(h.g.UIWindows.getLock(), false);
  } finally { h.close(); }
});
