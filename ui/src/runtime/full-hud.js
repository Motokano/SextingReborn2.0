import { mount, unmount, flushSync } from 'svelte';
import { writable } from 'svelte/store';
import { createUiBridge } from '../bridge/store.mjs';
import { readCarry } from '../bridge/carry.mjs';
import { readBody, readSurvival, readGrowth, readBattle, readEffects, readEnvironment, readJournal, text } from '../bridge/hud';
import CarryPanel from '../features/CarryPanel.svelte';
import StatusPanel from '../features/StatusPanel.svelte';
import Journal from '../features/Journal.svelte';
import WindowMenu from '../features/WindowMenu.svelte';
import TopShell from '../features/TopShell.svelte';
import { createActions } from './actions';
import { paths } from './icons';
import { createLayout } from './layout';

export function mountHud(g) {
  if (g.SvelteHUD) return;
  const U = g.UIWindows, doc = g.document, $ = id => doc.getElementById(id);
  let ready = false, disposed = false, arrange = () => {}, queuedLayout = false;
  const components = [], disposers = [], panels = {};
  const readers = { body: readBody, survival: readSurvival, growth: readGrowth, carry: readCarry, effects: readEffects, battle: readBattle, journal: readJournal, environment: readEnvironment };
  const bridge = createUiBridge({
    ...Object.fromEntries(Object.entries(readers).map(([id, read]) => [id, () => read(g, ready)])),
    windows: () => ({ items: U.getPanelList().map(it => ({ ...it, label: text(g, it.titleKey) })), locked: U.getLock(), mode: g.MapProjection?.getMode() || 'isometric', motion: g.HungerTile?.getMotionMode() || 'system', labels: Object.fromEntries(['menu','title','lock','reset','motion','system','on','off'].map(k => [k, text(g, k === 'title' ? 'ui.windows.menu.title' : ['motion','system','on','off'].includes(k) ? 'ui.motion.' + (k === 'motion' ? 'label' : k) : 'ui.windows.' + k)])) }),
  });
  const domains = Object.keys(readers);
  const invalidate = domain => { if (domain) bridge.invalidate(domain); else domains.forEach(id => bridge.invalidate(id)); };
  const layoutSoon = () => { if (!queuedLayout) { queuedLayout = true; queueMicrotask(() => { queuedLayout = false; if (!disposed) arrange(); }); } };
  g.SvelteHUD = { bridge, owns: domain => !disposed && (domains.includes(domain) || domain === 'windows'), invalidate, dispose };
  const store = domain => ({ subscribe: listener => bridge.subscribe(domain, listener) });
  const actions = createActions(g, () => ready);
  const specs = {
    body: ['status-limbs', 'win-limbs', '身体', 'limbs'], survival: ['status-survival', 'win-survival', '生存', 'survival'],
    growth: ['status-attrs-block', 'win-attrs', '成长', 'attrs'], carry: ['status-carry-card', 'win-carry', '携行', 'carry'],
    effects: ['buff-hud', 'win-buff', '状态', 'buff'], battle: ['status-combat-resources-card', 'win-battle-resources', '战斗', 'battle_resources'], journal: ['game-log-panel', 'win-log', '事件记录', 'log'],
  };
  const left = $('left-hud'), buffParent = $('buff-hud').parentElement, logParent = $('game-log-panel').parentElement;
  left.classList.add('moss-runtime'); $('bottom-hud-stack').classList.add('moss-runtime');
  // Retire old subtrees before mounting; no duplicate hidden HUD or inherited handlers.
  $('status-resources').remove(); $('status-attr-exp-block').remove();
  for (const [domain, [domId, winId, title, titleKey]] of Object.entries(specs)) {
    const previous = $(domId), host = doc.createElement('section');
    host.id = domId; host.className = (previous ? (previous.tagName !== 'DETAILS' ? previous.className + ' ' : 'ui-window-host ') : '') + 'moss-panel' + (['effects','journal'].includes(domain) ? ' moss-runtime' : '');
    host.dataset.panel = domain; host.dataset.uiOwner = 'svelte'; host.setAttribute('aria-label', title);
    if (previous) previous.replaceWith(host); else left.append(host);
    panels[domain] = host;
    const chrome = writable({ folded: U.isFolded(winId) });
    const props = { domain, title, path: paths[domain], store: store(domain), chrome, host, actions,
      close: () => U.setVisible(winId, false), fold: () => U.setFolded(winId, !U.isFolded(winId)) };
    components.push(mount(domain === 'carry' ? CarryPanel : domain === 'journal' ? Journal : StatusPanel, { target: host, props }));
    flushSync();
    U.registerPanel(winId, { type: 'free', titleKey: 'ui.windows.' + titleKey, el: host, defaultPos: 'dock', minW: 160, minH: 48, closable: true, resizable: false, foldInPlace: true, managedChrome: true, dragHandle: '.panel-head',
      gameVisible: () => bridge.getSnapshot(domain).available,
      onVisibility: () => { const folded = U.isFolded(winId); chrome.set({ folded }); if (folded || !U.getVisible(winId)) actions.hideTooltip(); layoutSoon(); },
    });
    disposers.push(bridge.subscribe(domain, view => { U.setGameVisible(winId, view.available); layoutSoon(); }));
  }
  // These historical window IDs remain registered only to preserve old storage
  // semantics. They never write into Svelte-owned growth children.
  ['win-role','win-resources','win-attr-exp'].forEach(id => U.registerPanel(id, { type: 'anchored', menuHidden: true, displayManaged: false, el: () => null, gameVisible: () => false }));
  $('top-hud').remove();
  const shell = doc.createElement('div'); shell.className = 'moss-runtime moss-top-shell'; doc.body.append(shell);
  const navigation = $('right-hud'); navigation.classList.add('demo-tools');
  components.push(mount(TopShell, { target: shell, props: { store: store('environment'), path: paths.environment, navigation,
    connect(env, top) {
      U.registerPanel('win-time', { type: 'anchored', titleKey: 'ui.windows.time', el: env, closable: true, gameVisible: () => bridge.getSnapshot('environment').available });
      disposers.push(bridge.subscribe('environment', view => U.setGameVisible('win-time', view.available)));
      arrange = createLayout(g, U, panels, Object.fromEntries(Object.entries(specs).map(([id,s]) => [id,s[1]])), left, top, buffParent, logParent);
      arrange();
    },
  } }));
  flushSync();
  const menuHost = $('ui-windows-hud-wrap'); menuHost.replaceChildren(); menuHost.dataset.uiOwner = 'svelte';
  const menuActions = { visible: (id, v) => U.setVisible(id, v), lock: v => U.setLock(v), reset: () => U.resetAll(), mode: v => { g.MapProjection?.setMode(v); bridge.invalidate('windows'); }, motion: v => { g.HungerTile?.setMotionMode(v); bridge.invalidate('windows'); }, invalidate: () => bridge.invalidate('windows') };
  const menuComponent = mount(WindowMenu, { target: menuHost, props: { store: store('windows'), actions: menuActions } });
  components.push(menuComponent);
  g.SvelteHUD.openMenu = () => menuComponent.openMenu();
  g.SvelteHUD.closeMenu = () => menuComponent.closeMenu();
  flushSync();
  disposers.push(U.subscribe(() => { bridge.invalidate('windows'); layoutSoon(); }));
  disposers.push(g.SceneHud.subscribe('status', () => invalidate()));
  disposers.push(g.GameLog.subscribe(() => invalidate('journal')));
  const viewChanged = () => bridge.invalidate('windows');
  g.addEventListener('mapviewchange', viewChanged);
  g.addEventListener('resize', layoutSoon);
  g.MossGameHUD = { refresh: () => invalidate(), arrange, panels, registrationComplete: false };
  g.AppBoot = g.AppBoot || {}; g.AppBoot.afterStart = g.AppBoot.afterStart || []; g.AppBoot.afterReady = g.AppBoot.afterReady || [];
  g.AppBoot.afterStart.push(() => { g.MossGameHUD.registrationComplete = true; U.init(); invalidate(); bridge.invalidate('windows'); });
  g.AppBoot.afterReady.push(() => { ready = true; invalidate(); bridge.invalidate('windows'); });
  function dispose() {
    if (disposed) return; disposed = true;
    disposers.forEach(fn => fn()); bridge.dispose();
    g.removeEventListener('resize', layoutSoon);
    g.removeEventListener('mapviewchange', viewChanged);
    components.forEach(component => unmount(component));
  }
  g.addEventListener('pagehide', event => { if (!event.persisted) dispose(); });
}
