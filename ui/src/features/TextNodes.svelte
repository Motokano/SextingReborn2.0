<script lang="ts">
  let { nodes = [] } = $props<{nodes?: any[]}>();
</script>
{#snippet node(n: any)}
  <svelte:element this={n.tag} class={n.className || undefined}>{#if n.breakLines}{#each n.text.split('\n') as line, i}{#if i}<br />{/if}{line}{/each}{:else}{n.text}{/if}{#each n.children || [] as child}{@render node(child)}{/each}</svelte:element>
{/snippet}
{#each nodes as n}{@render node(n)}{/each}
