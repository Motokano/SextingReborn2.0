<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, path, folded, onclose, onfold, children, footer, moreTitle = '', moreOpen = false, onmore }:
    { title: string; path: string; folded: boolean; onclose: () => void; onfold: () => void; children: Snippet; footer?: Snippet; moreTitle?: string; moreOpen?: boolean; onmore?: () => void } = $props();
</script>

<header class="panel-head">
  <span class="sigil" aria-hidden="true">
    <svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={path}/></svg>
  </span>
  <h2 class="block-title">{title}</h2>
  {#if moreTitle}<button class="moss-more" type="button" title={moreTitle} aria-label={moreTitle} aria-expanded={moreOpen} onclick={onmore}>⋯</button>{/if}
  <button class="ui-window-min" type="button" aria-label={`${folded ? '展开' : '收起'}${title}`} aria-expanded={!folded} onclick={onfold}>{folded ? '+' : '−'}</button>
  <button class="ui-window-close" type="button" aria-label={`关闭${title}`} onclick={onclose}>×</button>
</header>
<div class="panel-content">{@render children()}</div>
{@render footer?.()}
