<script lang="ts">
  import type { Readable } from 'svelte/store';
  let { store } = $props<{store: Readable<any>}>();
</script>
{#snippet node(n: any)}
  <svelte:element this={n.tag} class={n.className || undefined}>{#if n.breakLines}{#each n.text.split('\n') as line, i}{#if i}<br />{/if}{line}{/each}{:else}{n.text}{/if}{#each n.children as child}{@render node(child)}{/each}</svelte:element>
{/snippet}
<div id="svelte-item-tooltip" role="tooltip" class:show={$store.open} style:left={$store.left + 'px'} style:top={$store.top + 'px'} data-ui-owner="svelte">{#each $store.nodes as n}{@render node(n)}{/each}</div>
