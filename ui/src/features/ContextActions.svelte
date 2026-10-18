<script lang="ts">
  import type { Readable } from 'svelte/store';
  let { store, controller, bubble = false } = $props<{store: Readable<any>, controller: any, bubble?: boolean}>();
</script>
{#if bubble}
  <div id="player-action-bubble" class:visible={$store.context.some((a: any) => a.visible && a.id !== 'warehouse')} data-ui-owner="svelte"><div class="action-bubble-inner">
    {#each $store.context.filter((a: any) => a.id !== 'warehouse') as a}<button type="button" id={'player-action-' + (a.id === 'ground' ? 'ground-items' : a.id)} class={'action-btn' + (a.id === 'gather' ? ' primary' : '')} style:display={a.visible ? 'inline-block' : 'none'} disabled={!!a.disabled} title={a.id === 'ground' ? $store.groundTitle : undefined} onclick={() => controller.run(a.id)}>{a.label}</button>{/each}
  </div></div>
{:else}
  <div id="action-bar-dock" class="action-bar-dock" role="toolbar" aria-label={$store.label} data-ui-owner="svelte">
    <div class="action-bar-context" id="action-bar-context">{#each $store.context.filter((a: any) => a.id !== 'pharmacy') as a}<button type="button" id={'action-bar-' + a.id} class="action-bar-btn" style:display={a.visible ? 'inline-block' : 'none'} disabled={!!a.disabled} onclick={() => controller.run(a.id)}>{a.label}</button>{/each}</div>
    <div class="action-bar-sep" id="action-bar-sep" aria-hidden="true" style:display={$store.context.some((a: any) => a.visible) ? 'block' : 'none'}></div>
    <div class="action-bar-pinned" id="action-bar-pinned">{#each $store.pins as p, i}<button type="button" id={'action-bar-pin-' + i} class="action-bar-btn action-bar-pin-slot" class:empty={!p.token} data-slot={i} title={p.title} onclick={() => controller.pin(i)} oncontextmenu={e => { e.preventDefault(); controller.clear(i); }}>{p.label}</button>{/each}</div>
  </div>
{/if}
