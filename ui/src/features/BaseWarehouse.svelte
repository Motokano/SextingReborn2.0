<script lang="ts">
 import type {Readable} from 'svelte/store';
 let {store,controller,overlays,t}=$props<{store:Readable<any>,controller:any,overlays:any,t:any}>();
 let root:HTMLDivElement,open=$derived($store.open);
 $effect(()=>{if(open&&root)return overlays.enter(root,{escape:()=>controller.close('warehouse')});});
</script>
<div id="modal-base-warehouse" bind:this={root} class:show={open} aria-hidden={!open} role="dialog" aria-modal="true" aria-label={t('warehouse.modal.title')} tabindex="-1" data-ui-owner="svelte">
 {#if open}<div class="bw-panel"><div class="bw-head"><h2>{t('warehouse.modal.title')}</h2><span class="bw-hint">{t('warehouse.modal.hint')}</span><input type="search" id="base-warehouse-filter" autocomplete="off" placeholder={t('warehouse.search.placeholder')} value={$store.filter} oninput={e=>controller.warehouse(e.currentTarget.value)}/></div><div class="bw-body" id="base-warehouse-list">{#each $store.rows as row}<div class="warehouse-item-row" use:controller.tooltip={row.tooltip}><div class="wname">{row.name}</div><button type="button" class="btn-take-one" data-item-id={row.id} onclick={()=>controller.take(row.id)}>{t('warehouse.take.one')}</button></div>{/each}</div><div class="bw-close" id="base-warehouse-close" role="button" tabindex="0" onclick={()=>controller.close('warehouse')} onkeydown={e=>{if(e.key==='Enter')controller.close('warehouse');}}>{t('warehouse.modal.close')}</div></div>{/if}
</div>
