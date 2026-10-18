<script lang="ts">
  import { tick } from 'svelte';
  import type { Readable } from 'svelte/store';
  type Item = { id: string; label: string; visible: boolean; closable: boolean };
  let { store, actions }: {
    store: Readable<{ items: Item[]; locked: boolean; mode: string; motion: string; labels: Record<string, string> }>;
    actions: { visible: (id: string, v: boolean) => void; lock: (v: boolean) => void; reset: () => void; mode: (v: string) => void; motion: (v: string) => void; invalidate: () => void };
  } = $props();
  let open = $state(false), menu: HTMLDivElement, trigger: HTMLButtonElement;
  export function openMenu() { actions.invalidate(); open = true; }
  export function closeMenu() { open = false; }
  async function toggle() { actions.invalidate(); open = !open; await tick(); }
  function outside(event: MouseEvent) { if (!trigger?.parentElement?.contains(event.target as Node)) open = false; }
  function controls() { return Array.from(menu.querySelectorAll<HTMLElement>('button,input,select')).filter(el => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0); }
  async function key(event: KeyboardEvent, fromTrigger = false) {
    if (event.key === 'Escape') { if (open) { event.preventDefault(); event.stopPropagation(); open = false; trigger.focus(); } return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if ((event.target as HTMLElement).tagName === 'SELECT') return;
    event.preventDefault(); event.stopPropagation();
    if (fromTrigger && !open) { actions.invalidate(); open = true; await tick(); }
    if (!open) return;
    const items = controls(); if (!items.length) return;
    let i = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Home' || fromTrigger && event.key === 'ArrowDown') i = 0;
    else if (event.key === 'End' || fromTrigger && event.key === 'ArrowUp') i = items.length - 1;
    else i = (i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[i].focus();
  }
  function focusout(event: FocusEvent) { if (event.relatedTarget && !trigger.parentElement?.contains(event.relatedTarget as Node)) open = false; }
</script>
<svelte:document onclick={outside}/>
<button type="button" class="hud-btn" id="btn-ui-windows" title={$store.labels.menu} aria-label={$store.labels.menu} aria-controls="ui-windows-menu" aria-haspopup="true" aria-expanded={open} bind:this={trigger} onclick={e => { e.preventDefault(); e.stopPropagation(); toggle(); }} onkeydown={e => key(e, true)} onfocusout={focusout}><span class="moss-menu-label">面板管理</span><span class="jianghu-nav-original">📑</span><span class="jianghu-nav-content"><svg class="jianghu-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3z M15 3h6v8h-6z M3 15h8v6H3z M15 15h6v6h-6z"/></svg></span></button>
<div id="ui-windows-menu" class="ui-windows-menu" class:open role="menu" aria-hidden={!open} bind:this={menu} onkeydown={e => key(e)} onfocusout={focusout}>
  <div class="uwm-title">{$store.labels.title}</div>
  {#each $store.items as item (item.id)}<button type="button" class="uwm-row" data-win-id={item.id} disabled={!item.closable} onclick={e => { if ((e.target as HTMLElement).tagName !== 'INPUT') actions.visible(item.id, !item.visible); }}><input type="checkbox" checked={item.visible} disabled={!item.closable} aria-label={item.label} onchange={e => actions.visible(item.id, e.currentTarget.checked)}/><span class="uwm-label">{item.label}</span></button>{/each}
  <hr class="uwm-sep"/>
  <button type="button" class="uwm-row" id="uwm-lock" onclick={e => { if ((e.target as HTMLElement).tagName !== 'INPUT') actions.lock(!$store.locked); }}><input type="checkbox" id="uwm-lock-check" checked={$store.locked} aria-label={$store.labels.lock} onchange={e => actions.lock(e.currentTarget.checked)}/><span class="uwm-label">{$store.labels.lock}</span></button>
  <button type="button" class="uwm-btn" id="uwm-reset" onclick={actions.reset}>{$store.labels.reset}</button>
  <label class="map-view-control" data-map-view-control>地图视角<select value={$store.mode} onchange={e => actions.mode(e.currentTarget.value)} onkeydown={e => e.stopPropagation()} onkeyup={e => e.stopPropagation()}><option value="isometric">棋子视角 C · 45°</option><option value="legacy">原俯视视角</option></select></label>
  <label class="status-motion-control">{$store.labels.motion}<select value={$store.motion} onchange={e => actions.motion(e.currentTarget.value)} onkeydown={e => e.stopPropagation()} onkeyup={e => e.stopPropagation()}><option value="system">{$store.labels.system}</option><option value="on">{$store.labels.on}</option><option value="off">{$store.labels.off}</option></select></label>
</div>
