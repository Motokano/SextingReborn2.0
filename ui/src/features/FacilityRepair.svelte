<script lang="ts">
 import type {Readable} from 'svelte/store';
 import MaterialContribution from './MaterialContribution.svelte';
 let {store,controller,overlays}=$props<{store:Readable<any>,controller:any,overlays:any}>();
 let root=$state<HTMLDivElement>();
 let open=$derived($store.open&&!$store.embedded);
 $effect(()=>{if(open&&root)return overlays.enter(root,{escape:controller.close});});
</script>
{#if $store.open&&!$store.embedded}<div class="cooking-repair-overlay" data-ui-owner="svelte" bind:this={root}><MaterialContribution value={$store} {controller}/></div>{/if}
