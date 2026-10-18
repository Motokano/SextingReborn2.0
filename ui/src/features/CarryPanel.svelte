<script lang="ts">
  import PanelFrame from '../components/PanelFrame.svelte';
  import type { Readable } from 'svelte/store';
  import { formatReading } from '../bridge/carry.mjs';
  type CarryView = ReturnType<typeof import('../bridge/carry.mjs').readCarry> & { revision: number };
  let { store, chrome, close, fold }: {
    store: Readable<CarryView>;
    chrome: Readable<{ folded: boolean }>;
    close: () => void;
    fold: () => void;
  } = $props();
</script>

<PanelFrame title="携行" path="M6 7h12l1 13H5L6 7Z M9 7V5a3 3 0 0 1 6 0v2 M9 12h6" folded={$chrome.folded} onclose={close} onfold={fold}>
  {#if $store.available}
    <div class="metric">
      <div class="metric-caption"><span class="label">负重</span><b id="status-carry">{formatReading($store.current)} <small>/ {formatReading($store.capacity)} kg</small></b></div>
      <div class="track" style="--tone:#b6a078"><i id="moss-carry-bar" style:width={`${$store.ratio}%`}></i></div>
    </div>
    <div class="capacity-left"><span>剩余容量</span><strong id="moss-capacity-left">{formatReading($store.remaining)} <small>kg</small></strong></div>
    {#if $store.weightKnown}
      <div id="status-metric-weight" class="ruled-row"><span class="label">体重</span><span class="value" id="status-weight">{$store.weight ?? '—'} kg</span></div>
    {/if}
  {/if}
</PanelFrame>
