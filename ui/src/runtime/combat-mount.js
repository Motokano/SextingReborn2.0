import { mount, unmount, flushSync } from 'svelte';
import { writable } from 'svelte/store';
import CombatPanel from '../features/CombatPanel.svelte';
import { combatPanel } from './combat-panel';
import { createOverlayHost } from './overlays';

function text(g, key, vars) {
    try { return g.UIText?.t(key, vars) || key; } catch { return key; }
}

// The approved loadout is also mounted on the default/native HUD. No other
// panels opt into the broader Svelte migration as a side effect.
export function mountCombat(g) {
    if (g.SvelteCombat || g.SveltePanels) return;
    const api = g.SceneApp?.combatApi || g.SceneApp?.panelApi, old = g.document.getElementById('modal-combat');
    if (!api || !old) return;
    let ready = false, disposed = false;
    const store = writable({ open: false }), overlays = createOverlayHost(g);
    const controller = combatPanel(g, (_key, value) => { if (!disposed) store.set(value); }, (key, vars) => text(g, key, vars));
    const refresh = () => { if (ready && !disposed) controller.refresh(); };
    g.SvelteCombat = { refresh, dispose };
    const target = old.parentElement, anchor = old.nextSibling;
    old.remove(); g.document.getElementById('picker-move')?.remove();
    const component = mount(CombatPanel, { target, anchor, props: { store, controller: { ...controller, close: api.close }, overlays, t: (key, vars) => text(g, key, vars) } });
    flushSync();
    const unsubscribe = g.SceneHud.subscribe('status', () => { if (api.getOpen('combat')) refresh(); });
    g.AppBoot = g.AppBoot || {};
    g.AppBoot.afterReady = g.AppBoot.afterReady || [];
    g.AppBoot.afterReady.push(() => { if (!disposed) { ready = true; refresh(); } });
    const pagehide = event => { if (!event.persisted) dispose(); };
    g.addEventListener('pagehide', pagehide);
    function dispose() {
        if (disposed) return;
        disposed = true;
        g.removeEventListener('pagehide', pagehide);
        unsubscribe(); overlays.dispose(); unmount(component); delete g.SvelteCombat;
    }
}
