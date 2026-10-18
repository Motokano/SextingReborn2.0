<script lang="ts">
 import type {Readable} from 'svelte/store';
 import MaterialContribution from './MaterialContribution.svelte';
 let {store,materials,controller,repair,overlays}=$props<{store:Readable<any>,materials:Readable<any>,controller:any,repair:any,overlays:any}>();
 let root=$state<HTMLDivElement>();
 let open=$derived($store.open);
 $effect(()=>{if(open&&root)return overlays.enter(root,{escape:controller.close});});
</script>
{#if $store.open}<div id="toolbench-panel" class="cooking-repair-overlay" data-ui-owner="svelte" bind:this={root}><!-- Retain the original section/dialog markup and CSS. --><!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role --><section class="tb-window" role="dialog" tabindex="-1" aria-modal="true" aria-label="工具台"><header class="tb-header"><h1>工具台</h1><button type="button" data-close aria-label="关闭工具台" onclick={controller.close}>×</button></header><div class="tb-layout"><nav class="tb-list" aria-label="工具列表">{#each $store.entries as e(e.id)}<button type="button" data-tool={e.id} aria-pressed={$store.selected===e.id} onclick={()=>controller.choose(e.id)}><strong>{e.name}</strong><span>{e.status}</span><small>{e.description}</small></button>{/each}</nav><main class="tb-detail"><p class="tb-state" role="status" hidden={!$store.message}>{$store.message}</p><div class="tb-materials" hidden={!$store.materials}>{#if $materials.open&&$materials.location==='toolbench'}<div class="facility-material-embedded" data-ui-owner="svelte"><MaterialContribution value={$materials} controller={repair}/></div>{/if}</div></main></div></section></div>{/if}
