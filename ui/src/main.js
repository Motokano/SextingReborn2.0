import { mountInteractions } from './runtime/interactions';
import { mountHud } from './runtime/full-hud';
import { mount, flushSync } from 'svelte';
import { writable } from 'svelte/store';
import CarryPanel from './features/CarryPanel.svelte';
import { createUiBridge } from './bridge/store.mjs';
import { readCarry } from './bridge/carry.mjs';

// Opt-in until the same-save browser visual comparison has passed.
const g = window;
if (new URLSearchParams(g.location.search).get('ui') === 'svelte-carry' && !g.SvelteCarryPilot) {
  let ready = false;
  let mounted = false;
  const bridge = createUiBridge({ carry: () => readCarry(g, ready) });
  const chrome = writable({ folded: false });
  const id = 'win-carry';
  const U = g.UIWindows;
  const unsubscribe = g.SceneHud.subscribe('status', () => bridge.invalidate('carry'));
  g.SvelteCarryPilot = {
    bridge,
    owns: domain => mounted && domain === 'carry',
    invalidate: () => bridge.invalidate('carry'),
    mount(host) {
      if (mounted) throw new Error('Carry panel already mounted');
      mounted = true;
      host.dataset.uiOwner = 'svelte';
      const store = { subscribe: listener => bridge.subscribe('carry', listener) };
      mount(CarryPanel, { target: host, props: {
        store, chrome,
        close: () => U.setVisible(id, false),
        fold: () => U.setFolded(id, !U.isFolded(id)),
      } });
      flushSync();
      U.registerPanel(id, {
        type: 'free', titleKey: 'ui.windows.carry', el: host,
        defaultPos: 'dock', minW: 160, minH: 48, closable: true,
        resizable: false, foldInPlace: true, managedChrome: true, dragHandle: '.panel-head',
        gameVisible: () => bridge.getSnapshot('carry').available,
        onVisibility: () => { chrome.set({ folded: U.isFolded(id) }); },
      });
      bridge.subscribe('carry', snapshot => {
        U.setGameVisible(id, snapshot.available);
        // The existing layout owns the outer host only; Svelte owns its children.
        queueMicrotask(() => g.MossGameHUD?.arrange());
      });
    },
  };
  g.AppBoot = g.AppBoot || {};
  g.AppBoot.afterReady = g.AppBoot.afterReady || [];
  g.AppBoot.afterReady.push(() => { ready = true; bridge.invalidate('carry'); });
  g.addEventListener('pagehide', event => {
    if (event.persisted) return;
    unsubscribe();
    bridge.dispose();
  });
}

if (new URLSearchParams(g.location.search).get('ui') === 'svelte-hud') { mountHud(g); if (g.SceneApp?.creation && g.DialogueUI) mountInteractions(g); }
