<script lang="ts">
  import { tick } from 'svelte';
  import type { Readable } from 'svelte/store';
  let { store, controller } = $props<{store: Readable<any>, controller: any}>();
  let root: HTMLDivElement, menu: HTMLDivElement, trigger: HTMLButtonElement;
  function outside(e: MouseEvent) { if ($store.open && !root.contains(e.target as Node)) controller.close(); }
  async function keys(e: KeyboardEvent) {
    if (!['ArrowDown','ArrowUp','Home','End','Escape'].includes(e.key)) return;
    e.stopPropagation(); e.preventDefault();
    if (e.key === 'Escape') { controller.close(); trigger.focus(); return; }
    if (!$store.open) { controller.open(); await tick(); }
    const items = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    items[next]?.focus();
  }
</script>
<svelte:document onclick={outside} />
{#snippet item(node: any)}
  {#if node.kind === 'button'}<button type="button" class={node.className} disabled={!!node.disabled} title={node.title} {...node.attrs} onclick={node.onclick}>{node.textContent || ''}</button>
  {:else}<div class={node.className}>{node.textContent || ''}{#each node.children as child}{@render item(child)}{/each}</div>{/if}
{/snippet}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="hud-dropdown-wrap" id="player-actions-hud-wrap" style="display:flex" bind:this={root} onkeydown={keys} onfocusout={e => { if (e.relatedTarget && !root.contains(e.relatedTarget as Node)) controller.close(); }} data-ui-owner="svelte">
  <button type="button" class="hud-btn" id="btn-player-actions" title={$store.label} aria-controls="player-actions-submenu" aria-haspopup="true" aria-expanded={$store.open} bind:this={trigger} onclick={e => { e.stopPropagation(); controller.toggle(); }}><span class="jianghu-nav-original">⚙</span><span class="jianghu-nav-content"><svg class="jianghu-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16 M4 16h16 M8 4v8 M16 12v8" /></svg></span></button>
  <div id="player-actions-submenu" class="player-actions-submenu" class:open={$store.open} role="menu" aria-hidden={!$store.open} bind:this={menu}>{#each $store.items as node}{@render item(node)}{/each}</div>
</div>
