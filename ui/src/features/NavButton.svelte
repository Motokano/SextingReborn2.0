<script lang="ts">
  import type { Readable } from 'svelte/store';
  let { store, id, glyph, path, onclick } = $props<{store: Readable<any>, id: string, glyph: string, path?: string, onclick: (el: HTMLButtonElement) => void}>();
  let label = $derived($store.labels[id]);
</script>
<button type="button" class="hud-btn" id={'btn-' + id} title={label} onclick={e => onclick(e.currentTarget)} data-ui-owner="svelte"><span class="jianghu-nav-original">{glyph}</span><span class="jianghu-nav-content"><svg class="jianghu-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg></span></button>
