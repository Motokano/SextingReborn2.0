import { mountPanels } from './panels';
import { mountFacilities } from './facilities';
import { mount, unmount, flushSync } from 'svelte';
import { writable } from 'svelte/store';
import NavButton from '../features/NavButton.svelte';
import Tooltip from '../features/Tooltip.svelte';
import ContextActions from '../features/ContextActions.svelte';
import QuickBelt from '../features/QuickBelt.svelte';
import { readBelt, readPins, beltActions } from './quick-actions';
import ActionMenu from '../features/ActionMenu.svelte';
import NpcMenu from '../features/NpcMenu.svelte';
import ResetConfirmation from '../features/ResetConfirmation.svelte';
import Dialogue from '../features/Dialogue.svelte';
import Creation from '../features/Creation.svelte';
import { createOverlayHost } from './overlays';
import { text } from '../bridge/hud';

export function mountInteractions(g) {
  if (g.SvelteInteractions) return;
  let disposed = false;
  const overlays = createOverlayHost(g), components = [], disposers = [];
  const host = g.document.createElement('div'); host.id = 'svelte-interactions'; g.document.body.append(host);
  function connect(controller, Component, target = host, anchor) {
    const store = writable({});
    disposers.push(controller.attachView(value => store.set(value)));
    components.push(mount(Component, { target, anchor, props: { store, controller, overlays, t: (key, vars) => text(g, key, vars) } }));
    flushSync();
  }
  ['dialogue-panel','dialogue-input-blocker','character-creation-overlay'].forEach(id => g.document.getElementById(id)?.remove());
  connect(g.DialogueUI, Dialogue);
  connect(g.SceneApp.creation, Creation);
  connect(g.NPCSystem.menu, NpcMenu);
  connect(g.ResetProgressDialog, ResetConfirmation);
  const oldMenu = g.document.getElementById('player-actions-hud-wrap');
  connect(g.SceneApp.actionMenu, ActionMenu, oldMenu.parentElement, oldMenu); oldMenu.remove();
  const actionStore = writable({ context: [], pins: readPins(g), label: '', groundTitle: '' });
  const beltStore = writable(readBelt(g, false)); let ready = false, beltSignature = '', actionSignature = '', context = [];
  function refreshActions() { const value={ context, pins: readPins(g), label: text(g,'action.bar.dock'), groundTitle:text(g,'player.action.ground.items.title') }, signature=JSON.stringify(value); if(signature!==actionSignature){actionSignature=signature;actionStore.set(value);} }
  function refreshBelt() { const value = readBelt(g, ready), signature = JSON.stringify(value); if (signature !== beltSignature) { beltSignature = signature; beltStore.set(value); } }
  const actionController = { run: id => g.SceneApp.runContextAction(id), pin: i => g.SceneApp.executeQuickBarPinnedSlot(i), clear: i => g.SceneApp.clearQuickBarPinSlot(i) };
  function replace(id, Component, props) { const old = g.document.getElementById(id); components.push(mount(Component, { target:old.parentElement, anchor:old, props })); old.remove(); }
  replace('player-action-bubble', ContextActions, { store:actionStore, controller:actionController, bubble:true });
  replace('action-bar-dock', ContextActions, { store:actionStore, controller:actionController });
  replace('quick-belt-dock', QuickBelt, { store:beltStore, controller:beltActions(g) });
  disposers.push(g.SceneHud.subscribe('status', () => { refreshActions(); refreshBelt(); }));
  g.AppBoot.afterReady.push(() => { ready = true; refreshActions(); refreshBelt(); });
  flushSync();
  const navKeys={backpack:'btn.backpack.title',equipment:'btn.equipment.title',survival:'btn.skill_overview.title',muscles:'btn.muscles.title',combat:'btn.combat.title',save:'btn.save.title','reset-demo-save':'btn.reset.demo.title'};
  const nav = writable({labels:{}});
  const refreshNav = () => nav.set({hidden:{muscles:!g.MusclePanel.isAvailable()},labels:Object.fromEntries(Object.entries(navKeys).map(([id,key]) => [id,text(g,key)]))});
  refreshNav(); g.AppBoot.afterReady.push(refreshNav);
  disposers.push(g.SceneHud.subscribe('status', refreshNav));
  const navSpecs = [
    ['backpack','🎒','M7 8V6a5 5 0 0 1 10 0v2 M5 8h14l1 13H4L5 8Z M8 13h8v5H8z'],
    ['equipment','♙','m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c0 4-8 4-8 0Z'],
    ['survival','🌿','M5 21c0-8 5-14 14-18 1 10-2 16-10 15 M5 21 16 8'],
    ['muscles','体','M12 3v18 M5 8l7-3 7 3 M5 8v8l7 5 7-5V8 M5 16l7-5 7 5'],
    ['combat','⚔️','m4 3 13 13 M3 4l3-1 13 12-4 4L3 6V4Z M14 20l6-6 M17 18l4 4'],
    ['save','💾','M4 4h6l2 2h8v15H4V4Z M8 11h8 M8 15h8'],
    ['reset-demo-save','🧹','M5 8a8 8 0 1 1-1 8 M5 3v5h5']
  ];
  for (const [id,glyph,path] of navSpecs) replace('btn-'+id,NavButton,{store:nav,id,glyph,path,onclick:button => g.SceneApp.navigate(id,button)});
  disposers.push(mountPanels(g, overlays));
  disposers.push(mountFacilities(g, overlays));
  // Remaining P4 modal contents retain their owner. Only input
  // priority/focus is registered here; closing always calls the business API.
  for (const el of g.document.querySelectorAll('[id^="modal-"]')) {
    if (el.dataset.uiOwner === 'svelte') continue;
    let leave;
    const sync = () => { const open=el.classList.contains('show'); if(open && !leave)leave=overlays.enter(el,{escape:() => g.SceneApp.closePublicModal(el.id)});else if(!open && leave){leave();leave=null;} };
    const observer=new g.MutationObserver(sync); observer.observe(el,{attributes:true,attributeFilter:['class']}); sync();
    disposers.push(() => { observer.disconnect(); leave?.(); });
  }
  const tooltip = writable({ open:false, nodes:[], left:-9999, top:0 }); let tooltipEpoch = 0, tooltipAnchor;
  components.push(mount(Tooltip,{target:host,props:{store:tooltip}}));
  function hideTooltip() { tooltipEpoch++; tooltipAnchor=null; tooltip.set({open:false,nodes:[],left:-9999,top:0}); }
  function showTooltip(nodes,anchor) {
    tooltipAnchor=anchor;
    const epoch=++tooltipEpoch; tooltip.set({open:true,nodes,left:-9999,top:0});
    g.requestAnimationFrame(() => {
      if(epoch!==tooltipEpoch || !anchor?.isConnected)return;
      const tip=g.document.getElementById('svelte-item-tooltip'); if(!tip)return;
      const r=anchor.getBoundingClientRect(),tr=tip.getBoundingClientRect(),w=tr.width||220,h=tr.height||100,pad=12;
      let left=r.right+pad; if(left+w>g.innerWidth-pad)left=r.left-w-pad;
      tooltip.set({open:true,nodes,left:Math.max(pad,left),top:Math.max(pad,Math.min(r.top,g.innerHeight-h-pad))});
    });
  }
  const outsideTooltip = e => { if(tooltipAnchor && !tooltipAnchor.contains(e.target))hideTooltip(); };
  g.document.addEventListener('pointerdown',outsideTooltip); disposers.push(() => g.document.removeEventListener('pointerdown',outsideTooltip));
  g.SvelteInteractions = { overlays, showTooltip, hideTooltip, setWorldActions(value) { context = value; refreshActions(); }, refreshBelt, dispose() { if(disposed)return; disposed=true; hideTooltip(); disposers.forEach(fn => fn()); components.forEach(c => unmount(c)); overlays.dispose(); host.remove(); } };
  g.addEventListener('pagehide', e => { if (!e.persisted) g.SvelteInteractions.dispose(); });
}
