// Offline integration of the compiled HUD and real legacy window/log services.
// No browser, local server, network requests, or user save storage is accessed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
const html = fs.readFileSync('index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
const dictionary = JSON.parse(fs.readFileSync('data/ui_text_zhCN.json', 'utf8'));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const key = 'ui_windows_moss_c_v1';

function harness({ width = 1440, storage, native = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://ui-test.invalid/' + (native ? '' : '?ui=svelte-hud'), runScripts: 'outside-only', pretendToBeVisual: true });
  const g = dom.window, doc = g.document;
  g.innerWidth = width; g.innerHeight = 1000;
  g.ResizeObserver = class { observe() {} disconnect() {} };
  if (storage) g.localStorage.setItem(key, storage);
  const state = { satiety: 72, thirst: 58, stamina: 63, stamina_max: 100, energy: 86, energy_max: 100, fatigue: 22, nutrition: 84, mood: 400, dirtyness: 9, weight_kg: 70, pain: 0, qi_li_current: 15, qi_li_max: 30, diqi_current: 20, diqi_max: 40, diqi_shield_remaining: 8 };
  const flags = { observation_calendar_unlocked: true, observation_temperature_unlocked: false };
  let inCombat = false, destroyed = 18, carry = 18.4, ticks = 12, mode = 'isometric', motion = 'system';
  let buffs = {}, study = false, tooltip = '', debugCalls = 0;
  g.SceneCtx = { leftHudBlockVisibilityRules: {}, survivalMetricVisibilityRules: {}, lastAttackedEnemyId: 'enemy.a',
    shouldShowLeftHudBlock(id) { return this.leftHudBlockVisibilityRules[id] !== false; },
    shouldShowSurvivalMetric(id) { return this.survivalMetricVisibilityRules[id] !== false; },
    hudDebugActions: { 'status-attr-exp-debug-plus-jingu': () => debugCalls++ },
  };
  g.UIText = { t(name, args = {}) { return String(dictionary[name] || name).replace(/\{(\w+)\}/g, (_, k) => args[k] ?? ''); } };
  g.CharacterAttributes = { getCarryCapacity: () => 30, getEffectiveAttr: () => 12, getBaseInnateAttr: () => 9, getInnateAttr: () => 9, getPartDestroy: id => id === 'lhand' ? destroyed : 0, getBodyPartDestroyMax: () => 100, getAttributeExpState: () => ({ jingu: { exp: 567 } }), getDestroyRecoverBlockTicks: () => 3 };
  g.InventoryEquipment = { getCurrentCarryWeight: () => carry, getPotential: () => 240, getCombatExperience: () => 80, getPlayerStunValue: () => 0, isPlayerStunned: () => false };
  g.Survival = { getState: () => state, getMood: () => state.mood, getSatietyZone: () => 'normal', getMoodRangeByValue: () => 'normal', getStudyState: () => ({ active: study }), getStudySkillId: () => 'training', getEnergy: () => state.energy, getPainInfo: () => ({ effective: 20, tier: 'mild', unmedicated: 40, ignored_ratio: .5 }) };
  g.CombatSkills = { getSkill: () => ({ name: '呼吸研习' }) };
  g.PharmacyEffects = { getInfo: () => ({ addiction: 0, toxicity: 0 }) };
  g.CombatEngagement = { isPlayerInCombat: () => inCombat, onChange: () => {} };
  g.BuffSystem = { getState: () => ({ instancesByOwner: buffs }) };
  g.GameTime = { getState: () => ({ totalTicks: ticks, hour: 15, minute: ticks, year: 1, dayOfYear: 9, timePeriodLabel: '午后' }) };
  g.NPCSystem = { isDemoFlagTrue: id => !!flags[id] };
  g.GameEngine = { getMap: () => ({ id: 'yard' }) };
  g.Weather = { observe: () => ({ label: '晴' }), getEnvironment: () => ({ temperature: 21.4 }) };
  g.MapProjection = { getMode: () => mode, setMode: v => mode = v };
  g.HungerTile = { getMotionMode: () => motion, setMotionMode: v => motion = v };
  g.SceneUi = { buildItemTooltipHtml: (...args) => args.join('|'), showItemTooltip: value => tooltip = value, hideItemTooltip: () => tooltip = '' };
  g.getLimbActionTagLabels = () => ['持握'];
  const load = file => g.eval(fs.readFileSync(file, 'utf8'));
  load('js/ui-windows.js'); load('js/scene-hud.js'); load('js/game-log.js');
  load('assets/ui/svelte-hud.js'); load('js/ui-moss-game.js'); load('js/game-theme-navigation.js'); load('js/game-theme.js');
  for (const fn of g.AppBoot.afterStart) fn();
  for (const host of doc.querySelectorAll('.moss-panel')) {
    host.getBoundingClientRect = () => ({ left: parseFloat(host.style.left) || 30, top: parseFloat(host.style.top) || 500, width: 272, height: 280, right: 302, bottom: 780 });
    Object.defineProperty(host, 'offsetHeight', { get: () => host.classList.contains('folded') ? 40 : 280 });
  }
  const map = doc.getElementById('map-grid');
  return { g, doc, state, flags, map, load,
    get debugCalls() { return debugCalls; }, get tooltip() { return tooltip; },
    combat(v) { inCombat = v; }, buffs(v) { buffs = v; }, study(v) { study = v; }, ticks(v) { ticks = v; },
    async refresh() { g.SceneHud.refresh('status'); await settle(); },
    async ready() { for (const fn of g.AppBoot.afterReady || []) fn(); await settle(); },
    close() { g.SvelteHUD?.dispose(); dom.window.close(); },
  };
}

test('all HUD domains wait for ready, then render actual values with one owner and unchanged C structure', async () => {
  const h = harness();
  try {
    assert.equal(h.doc.querySelector('#status-satiety-text'), null);
    assert.equal(h.doc.querySelector('#limb-head'), null);
    assert.equal(h.doc.querySelector('#hud-weather'), null);
    await h.ready();
    assert.equal(h.doc.querySelectorAll('.moss-panel[data-ui-owner=svelte]').length, 7);
    assert.equal(h.doc.querySelectorAll('.body-reading').length, 7);
    assert.equal(Object.isFrozen(h.g.SvelteHUD.bridge.getSnapshot('body').rows[0]), true);
    assert.equal(h.doc.querySelectorAll('#status-survival .panel-content > .metric').length, 6);
    assert.match(h.doc.querySelector('#limb-lhand').textContent, /18\s*\/ 100/);
    assert.match(h.doc.querySelector('#status-satiety-text').textContent, /72\s*\/ 120/);
    assert.equal(h.doc.querySelector('#status-attr-jingu').textContent, '12');
    assert.equal(h.doc.querySelector('#status-attr-jingu').title, '先天 9 · 当前 12');
    h.g.CharacterAttributes.getInnateAttr = () => 11;
    h.g.CharacterAttributes.getEffectiveAttr = () => 14;
    await h.refresh();
    assert.equal(h.doc.querySelector('#status-attr-jingu').title, '先天 11 · 当前 14', 'HUD includes earned innate bonuses');
    assert.equal(h.g.CharacterAttributes.getBaseInnateAttr('jingu'), 9);
    assert.equal(h.doc.querySelector('#status-attr-exp-exp-jingu').textContent, '567');
    assert.match(h.doc.querySelector('#moss-capacity-left').textContent, /11.6/);
    assert.equal(h.doc.querySelector('#hud-weather').textContent, '晴');
    assert.match(h.doc.querySelector('#hud-time-period').textContent, /午后\s*15:12/);
    assert.equal(h.doc.querySelector('#map-grid'), h.map);
    const ids = [...h.doc.querySelectorAll('[id]')].map(el => el.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate DOM IDs');
    for (const host of h.doc.querySelectorAll('.moss-panel')) {
      assert.equal(host.querySelectorAll(':scope > .panel-head').length, 1);
      assert.equal(host.querySelectorAll(':scope > .panel-content').length, 1);
      assert.ok(host.querySelector('.sigil .panel-icon path'));
    }
  } finally { h.close(); }
});

test('knowledge filters values, tooltips and window menu, preserves close preferences and separate growth gates', async () => {
  const h = harness();
  try {
    await h.ready();
    h.doc.querySelector('#limb-lhand').closest('.body-reading').dispatchEvent(new h.g.MouseEvent('mouseenter'));
    assert.match(h.tooltip, /18/);
    h.g.SceneCtx.survivalMetricVisibilityRules.body_detail = false;
    h.g.SceneCtx.survivalMetricVisibilityRules.thirst = () => { throw new Error('not known'); };
    h.g.SceneCtx.survivalMetricVisibilityRules.time = false;
    h.flags.observation_calendar_unlocked = false;
    h.g.SceneCtx.leftHudBlockVisibilityRules.attrs = false;
    h.g.SceneCtx.leftHudBlockVisibilityRules.survival = false;
    h.g.UIWindows.setVisible('win-survival', false);
    h.g.GameLog.log('只知道这件事');
    await h.refresh();
    assert.equal(h.tooltip, '', 'old precise tooltip is removed on knowledge change');
    assert.equal(h.doc.querySelector('#limb-lhand').textContent, '受伤');
    assert.equal(h.doc.querySelector('.body-damage-track'), null);
    assert.equal(h.g.SvelteHUD.bridge.getSnapshot('body').rows[3].value, null);
    h.doc.querySelector('#limb-lhand').closest('.body-reading').dispatchEvent(new h.g.MouseEvent('mouseenter'));
    assert.doesNotMatch(h.tooltip, /18|100|回合/);
    assert.equal(h.doc.querySelector('#status-metric-thirst'), null);
    assert.equal(h.doc.querySelector('#status-attr-jingu'), null);
    assert.equal(h.doc.querySelector('#status-potential').textContent, '240');
    assert.equal(h.doc.querySelector('#hud-time-period'), null);
    assert.equal(h.doc.querySelector('#hud-time-text'), null);
    assert.equal(h.doc.querySelector('.log-time'), null);
    assert.equal(h.g.SvelteHUD.bridge.getSnapshot('journal').entries[0].time, '');
    assert.equal(h.doc.querySelector('[data-win-id="win-survival"]'), null);
    h.g.SceneCtx.leftHudBlockVisibilityRules.survival = true;
    await h.refresh();
    assert.equal(h.doc.querySelector('#status-survival').style.display, 'none');
    h.g.UIWindows.setVisible('win-survival', true); await settle();
    assert.equal(h.doc.querySelector('#status-survival').style.display, '');
    assert.equal(h.doc.querySelector('#status-metric-thirst'), null);
    h.g.SceneCtx.leftHudBlockVisibilityRules.resources = false;
    await h.refresh();
    assert.equal(h.doc.querySelector('#status-attrs-block').style.display, 'none');
    assert.equal(h.doc.querySelector('[data-win-id="win-attrs"]'), null);
  } finally { h.close(); }
});

test('battle relevance, buff targets/lifetimes and temperature unlock refresh without legacy decorators', async () => {
  const h = harness();
  try {
    await h.ready();
    assert.equal(h.doc.querySelector('#status-combat-resources-card').style.display, 'none');
    assert.equal(h.doc.querySelector('#buff-hud').style.display, 'none');
    h.combat(true);
    h.buffs({ player: [{ buff_id: 'heal', stacks: 2, expires_at_tick: 20, template: { name: '恢复', desc: '<恢复>' } }], 'enemy.new': [{ buff_id: 'manual', stacks: 1, started_tick: 11, template: { name: '积蓄', manualLifetime: true } }] });
    h.flags.observation_temperature_unlocked = true;
    await h.refresh();
    assert.equal(h.doc.querySelector('#status-combat-resources-card').style.display, '');
    assert.equal(h.doc.querySelector('#status-qi-li-text').textContent, '15 / 30');
    assert.match(h.doc.querySelector('#status-pain-text').textContent, /20|50/);
    assert.equal(h.doc.querySelector('#buff-hud').style.display, '');
    assert.equal(h.doc.querySelector('#buff-hud-player-chips .game-buff-time').textContent, '8');
    assert.equal(h.doc.querySelector('#buff-hud-enemy-chips .game-buff-time').textContent, '');
    assert.match(h.doc.querySelector('#buff-hud-enemy-title').textContent, /enemy_new/);
    assert.equal(h.doc.querySelector('#hud-weather').textContent, '晴 · 21℃');
    h.ticks(15); await h.refresh();
    assert.equal(h.doc.querySelector('#buff-hud-player-chips .game-buff-time').textContent, '5');
    assert.equal(h.doc.querySelectorAll('#buff-hud-player-chips .game-buff-name').length, 1);
    h.g.SceneCtx.buffHudVisible = false; await h.refresh();
    assert.equal(h.doc.querySelector('#buff-hud').style.display, 'none');
    assert.equal(h.doc.querySelector('.buff-chip'), null);
  } finally { h.close(); }
});

test('fold/close/reopen, supplements, keyboard menu, checkboxes and shared commands fire once', async () => {
  const h = harness();
  try {
    await h.ready();
    const U = h.g.UIWindows, button = h.doc.querySelector('#status-survival .ui-window-min');
    for (let i = 0; i < 10; i++) { button.click(); await settle(); assert.equal(U.isFolded('win-survival'), i % 2 === 0); }
    const more = h.doc.querySelector('#status-survival .moss-more'); more.click(); await settle();
    assert.equal(h.doc.querySelector('#status-survival details').open, true);
    assert.equal(more.getAttribute('aria-expanded'), 'true');
    h.doc.querySelector('#status-attrs-block .moss-more').click(); await settle();
    h.doc.querySelector('#status-attr-exp-debug-plus-jingu').click(); assert.equal(h.debugCalls, 1);
    h.doc.querySelector('#status-survival .ui-window-close').click(); await settle();
    assert.equal(U.getVisible('win-survival'), false);
    const trigger = h.doc.querySelector('#btn-ui-windows');
    trigger.dispatchEvent(new h.g.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await settle();
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(h.doc.activeElement.tagName, 'BUTTON');
    const row = h.doc.querySelector('[data-win-id="win-survival"]');
    row.querySelector('input').click(); await settle();
    assert.equal(U.getVisible('win-survival'), true);
    h.doc.querySelector('#uwm-lock-check').click(); await settle(); assert.equal(U.getLock(), true);
    h.doc.querySelector('#uwm-reset').click(); await settle(); assert.equal(U.getLock(), false);
    row.dispatchEvent(new h.g.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
    assert.equal(trigger.getAttribute('aria-expanded'), 'false'); assert.equal(h.doc.activeElement, trigger);
    U.setFolded('win-survival', true); await settle();
    const stored = h.g.localStorage.getItem(key), reloaded = harness({ storage: stored });
    try { await reloaded.ready(); assert.equal(reloaded.g.UIWindows.isFolded('win-survival'), true); assert.equal(reloaded.doc.querySelector('#status-survival .ui-window-min').textContent, '+'); } finally { reloaded.close(); }
  } finally { h.close(); }
});

test('journal retains safe text, filters, scroll position/new records, session history and clear', async () => {
  const h = harness();
  try {
    await h.ready();
    const list = h.doc.querySelector('#game-log-lines'), host = h.doc.querySelector('#game-log-panel');
    Object.defineProperty(list, 'scrollHeight', { value: 1000 }); Object.defineProperty(list, 'clientHeight', { value: 100 });
    list.scrollTop = 900;
    h.g.GameLog.log('<img src=x onerror=bad()>受伤', 'damage'); await settle();
    assert.equal(list.querySelector('img'), null); assert.match(list.textContent, /<img/); assert.equal(list.scrollTop, 1000);
    list.scrollTop = 100;
    h.g.GameLog.log('[debug] engine'); await settle();
    assert.equal(host.querySelector('.game-log-new').hidden, true);
    h.g.GameLog.log('移动'); await settle();
    assert.equal(list.scrollTop, 100); assert.equal(host.querySelector('.game-log-new').hidden, false);
    host.querySelector('.game-log-new').click(); assert.equal(list.scrollTop, 1000);
    host.querySelector('[data-filter=all]').click(); await settle(); assert.equal(host.classList.contains('game-log-reading'), false);
    for (let i = 0; i < 100; i++) h.g.GameLog.log('条目' + i);
    await settle(); assert.equal(list.querySelectorAll('.game-log-line').length, 103);
    assert.equal(h.g.GameLog.getLineCount(), 80);
    h.g.GameLog.clear(); await settle(); assert.equal(list.children.length, 0);
    h.g.GameLog.log('清空后'); await settle(); assert.equal(list.children.length, 1);
  } finally { h.close(); }
});

test('compact desktop widths and narrow-screen stacking retain map identity and reach all panels', async () => {
  for (const width of [1440, 1024, 390]) {
    const h = harness({ width });
    try {
      await h.ready(); h.combat(true); h.buffs({ player: [{ buff_id: 'test', stacks: 1 }] }); await h.refresh();
      const body = h.doc.querySelector('#status-limbs'), carry = h.doc.querySelector('#status-carry-card');
      if (width >= 760) assert.equal(body.style.getPropertyValue('--moss-default-w'), (width === 1440 ? 272 : 240) + 'px');
      else {
        assert.equal(h.doc.querySelector('#buff-hud').parentElement.id, 'left-hud');
        assert.equal(h.doc.querySelector('#game-log-panel').parentElement.id, 'left-hud');
        assert.ok(parseFloat(carry.style.getPropertyValue('--moss-default-y')) > parseFloat(body.style.getPropertyValue('--moss-default-y')));
        assert.ok(parseFloat(h.doc.querySelector('#left-hud').style.getPropertyValue('--moss-scroll-height')) > 1900);
      }
      assert.equal(h.doc.querySelector('#map-grid'), h.map);
    } finally { h.close(); }
  }
});

test('disposing unsubscribes stores and journal drag listeners', async () => {
  const h = harness();
  try {
    await h.ready(); const view = h.g.SvelteHUD.bridge.getSnapshot('body');
    h.g.SvelteHUD.dispose(); await settle();
    h.g.SceneHud.refresh('status'); h.g.GameLog.log('after dispose'); await settle();
    assert.equal(h.g.SvelteHUD.bridge.getSnapshot('body'), view);
    assert.equal(h.doc.querySelector('.body-reading'), null);
  } finally { h.close(); }
});
