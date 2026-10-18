<script lang="ts">
  import type { Readable } from 'svelte/store';
  let { store, id, glyph, path, onclick } = $props<{store: Readable<any>, id: string, glyph: string, path?: string, onclick: (el: HTMLButtonElement) => void}>();
  let music = $derived(id === 'bgm'), enabled = $derived($store.music);
  let label = $derived(music ? (enabled ? '背景音乐已开启，点击关闭' : '背景音乐已关闭，点击开启') : $store.labels[id]);
</script>
<button type="button" class="hud-btn" id={'btn-' + id} title={label} aria-label={music ? label : undefined} aria-pressed={music ? enabled : undefined} style:opacity={music ? (enabled ? '1' : '0.5') : undefined} onclick={e => onclick(e.currentTarget)} data-ui-owner="svelte">{#if music}{enabled ? '♫' : '♪'}{:else}<span class="jianghu-nav-original">{glyph}</span><span class="jianghu-nav-content"><svg class="jianghu-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg></span>{/if}</button>
