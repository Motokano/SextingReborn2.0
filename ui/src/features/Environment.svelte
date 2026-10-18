<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { readEnvironment } from '../bridge/hud';
  let { store, path }: { store: Readable<ReturnType<typeof readEnvironment>>; path: string } = $props();
</script>
<div class="time-pill">
  {#if $store.available}
    {#if $store.weatherKnown}<span class="env-weather"><svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={path}/></svg><span class="env-weather" id="hud-weather" aria-label="当前可见天气">{$store.weather}</span></span>{/if}
    {#if $store.timeKnown}<span class="env-time" id="hud-time-period">{$store.period} <b>{$store.time}</b></span>{/if}
    {#if $store.dateKnown}<span class="env-date" id="hud-time-text">{$store.date}</span>{/if}
  {/if}
</div>
