<script lang="ts">
  import AssemblySlot from './AssemblySlot.svelte';
  let { slot, depth = 0, interactive, controller, t } = $props<{slot:any,depth?:number,interactive:boolean,controller:any,t:any}>();
  let select=$state<HTMLSelectElement>();
</script>
<div class={'item-assembly-slot depth-'+Math.min(depth,4)}>
  <div class="item-assembly-slot-head"><span class="item-assembly-slot-label">{slot.label}</span>
    {#if slot.child}<span class="item-assembly-part-name">{slot.child.name}</span>{#if interactive}<button type="button" class="item-assembly-action" data-assembly-detach="1" data-host-instance={slot.host} data-slot-id={slot.id} onclick={() => controller.connect(slot,null)}>{t('item.assembly.detach')}</button>{/if}
    {:else}<span class="item-assembly-empty">{t('item.assembly.empty')}</span>{/if}
  </div>
  {#if slot.child?.slots.length}<div class="item-assembly-children">{#each slot.child.slots as child}<AssemblySlot slot={child} depth={depth+1} {interactive} {controller} {t} />{/each}</div>
  {:else if !slot.child && interactive}<div class="item-assembly-picker">
    {#if slot.candidates.length}<select bind:this={select} data-assembly-candidate="1" aria-label={t('item.assembly.choose')}>{#each slot.candidates as c}<option value={c.value}>{c.name}{c.count>1?' ×'+c.count:''}</option>{/each}</select><button type="button" class="item-assembly-action" data-assembly-attach="1" data-host-instance={slot.host} data-slot-id={slot.id} onclick={() => {const candidate=slot.candidates.find((c:any)=>c.value===select?.value);if(candidate)controller.connect(slot,candidate);}}>{t('item.assembly.attach')}</button>
    {:else}<span class="item-assembly-no-candidate">{t('item.assembly.no_candidate')}</span>{/if}
  </div>{/if}
</div>
