<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Readable } from 'svelte/store';
  let { store, controller } = $props<{store: Readable<any>, controller: any}>();
  let selected = $state<any>(null), menu: HTMLDivElement, anchor: HTMLElement | null = null, timer: ReturnType<typeof setTimeout>;
  let left = $state(-9999), top = $state(0);
  function hide() { clearTimeout(timer); selected = null; controller.hideTooltip(); }
  function later() { controller.hideTooltip(); timer = setTimeout(hide, 250); }
  async function show(item: any, el: HTMLElement) {
    clearTimeout(timer); if (!item.filled) { hide(); return; }
    selected = item; anchor = el; controller.tooltip(item, el); await tick();
    // Match the original ordering: position details first, then place actions beside it.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); await tick();
    if (!selected || !menu || anchor !== el) return;
    const pos = controller.position(el, menu); left = pos.left; top = pos.top;
  }
  $effect(() => { $store; hide(); });
  onDestroy(() => clearTimeout(timer));
</script>
<svelte:document onclick={e => { if (!(e.target instanceof Node) || (!menu?.contains(e.target) && !anchor?.contains(e.target))) hide(); }} />
<div id="quick-belt-dock" class="quick-belt-dock" role="toolbar" aria-label={$store.label} style:display={$store.available ? '' : 'none'} data-ui-owner="svelte"><div class="quick-belt" id="quick-belt">
  {#each $store.slots as item}
    {#if item.separator}<div class="quick-belt-sep" aria-hidden="true"></div>{:else}
      <div class="slot" role="button" tabindex="0" aria-label={item.name || '空位'} onmouseenter={e => show(item, e.currentTarget)} onmouseleave={later} onfocus={e => show(item, e.currentTarget)} onblur={later} onclick={e => { e.stopPropagation(); show(item, e.currentTarget); }} onkeydown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); show(item, e.currentTarget); } }}>
        {#if item.digit}<span class="quick-belt-slot-key">{item.digit}</span>{/if}<span class="quick-belt-slot-body">{item.short}</span>
      </div>
    {/if}
  {/each}
</div></div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="quick-belt-hover-menu" class:show={!!selected} bind:this={menu} style:left={left + 'px'} style:top={top + 'px'} onmouseenter={() => clearTimeout(timer)} onmouseleave={later} onfocusin={() => clearTimeout(timer)} onfocusout={later}>
  {#if selected}{#each selected.actions as action}<button type="button" class="quick-belt-hover-btn" onclick={e => { e.preventDefault(); e.stopPropagation(); const item = selected; hide(); controller.execute(action.id, item); }}>{action.label}</button>{/each}{/if}
</div>
