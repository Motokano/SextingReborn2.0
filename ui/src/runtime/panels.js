import { mount, unmount, flushSync } from 'svelte';
import { writable } from 'svelte/store';
import Backpack from '../features/Backpack.svelte';
import BaseWarehouse from '../features/BaseWarehouse.svelte';
import SkillOverview from '../features/SkillOverview.svelte';
import CombatPanel from '../features/CombatPanel.svelte';
import SavePanel from '../features/SavePanel.svelte';
import { inventoryPanel } from './inventory-panels';
import { skillOverview, savePanel } from './skill-save-panels';
import { combatPanel } from './combat-panel';
import { text } from '../bridge/hud';
export function mountPanels(g, overlays) {
    if (g.SveltePanels)
        return () => { };
    const api = g.SceneApp.panelApi, t = (key, vars) => text(g, key, vars), stores = Object.fromEntries(['backpack', 'warehouse', 'survival', 'combat', 'save'].map(k => [k, writable({ open: false })])), components = [];
    let ready = false, disposed = false;
    const publish = (key, value) => { if (!disposed)
        stores[key].set(value); };
    const inventory = inventoryPanel(g, publish, t), skills = skillOverview(g, publish, t), combat = combatPanel(g, publish, t), save = savePanel(g, publish, t);
    function tooltip(el, nodes) {
        let value = nodes, active = false;
        const show = () => { active = true; if (value?.length) g.SceneUi.showTooltipView(value, el); };
        const hide = () => { active = false; g.SceneUi.hideItemTooltip(); };
        for (const type of ['mouseenter', 'focusin']) el.addEventListener(type, show);
        for (const type of ['mouseleave', 'focusout']) el.addEventListener(type, hide);
        return {
            update(next) { value = next; if (active) { if (value?.length) show(); else hide(); } },
            destroy() {
                for (const type of ['mouseenter', 'focusin']) el.removeEventListener(type, show);
                for (const type of ['mouseleave', 'focusout']) el.removeEventListener(type, hide);
                if (active) hide();
            }
        };
    }
    const refresh = (key, value) => { if (disposed || !ready)
        return; if (key === 'backpack')
        inventory.refresh();
    else if (key === 'warehouse')
        inventory.warehouse(value);
    else if (key === 'survival')
        skills.refresh();
    else if (key === 'combat')
        combat.refresh();
    else if (key === 'save')
        save.refresh(); };
    const refreshAll = () => Object.keys(stores).forEach(k => refresh(k));
    g.SveltePanels = { refresh, refreshAll };
    const specs = [['backpack', 'modal-backpack', Backpack, inventory], ['warehouse', 'modal-base-warehouse', BaseWarehouse, inventory], ['survival', 'modal-survival', SkillOverview, skills], ['combat', 'modal-combat', CombatPanel, combat], ['save', 'modal-save', SavePanel, save]];
    g.document.getElementById('picker-move')?.remove();
    for (const [key, id, Component, controller] of specs) {
        const old = g.document.getElementById(id), parent = old.parentElement, anchor = old.nextSibling;
        old.remove();
        components.push(mount(Component, { target: parent, anchor, props: { store: stores[key], controller: { ...controller, close: api.close, tooltip }, overlays, t } }));
    }
    flushSync();
    const unsubscribe = g.SceneHud.subscribe('status', () => { if (ready) {
        for (const key of ['backpack', 'combat', 'survival'])
            if (api.getOpen(key))
                refresh(key);
    } });
    g.AppBoot.afterReady.push(() => { if (disposed)
        return; ready = true; refreshAll(); });
    return () => { if (disposed)
        return; disposed = true; unsubscribe(); save.dispose(); components.forEach(c => unmount(c)); delete g.SveltePanels; };
}
