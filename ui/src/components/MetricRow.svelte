<script lang="ts">
  import { formatReading } from '../bridge/carry.mjs';
  import type { readSurvival } from '../bridge/hud';
  let { row }: { row: ReturnType<typeof readSurvival>['rows'][number] } = $props();
</script>
<div id={'status-metric-' + row.id} class="survival-row metric">
  <div class="row metric-caption"><span class="label">{row.label}</span><b id={row.valueId} class={'value ' + row.state}>{formatReading(row.value)} <small>/ {formatReading(row.max)}</small></b></div>
  <div class="track" style:--tone={row.tone}><i id={'status-' + row.id + '-bar'} style:width={`${row.ratio}%`}></i></div>
</div>
