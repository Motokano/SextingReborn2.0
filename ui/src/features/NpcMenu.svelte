<script lang="ts">
  import type { Readable } from 'svelte/store';
  let { store, controller, overlays } = $props<{store: Readable<any>, controller: any, overlays: any}>();
  let root: HTMLDivElement, open = $derived($store.open);
  $effect(() => { if (open && root) return overlays.enter(root, { escape: () => controller.close() }); });
</script>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div id="npc-menu" bind:this={root} class:npc-menu-checkpoint={$store.compact} style="position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:9999" style:display={open ? 'block' : 'none'} role="dialog" aria-modal="true" aria-labelledby="npc-menu-title" tabindex="-1" data-ui-owner="svelte" onclick={e => { if (e.target === root) controller.close(); }} onkeydown={() => {}}>
  <div class="npc-menu-window" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:320px;background:#252525;border:1px solid #444;border-radius:8px;padding:14px;">
    <header class="npc-menu-head">{#if $store.compact}<button id="npc-menu-back" type="button" aria-label="返回" hidden={!$store.canBack} onclick={controller.back}>{@html controller.icon('back')}</button>{/if}<div id="npc-menu-title" style="color:#ddd;font-weight:bold;margin-bottom:10px;">{$store.title}</div>{#if $store.compact}<button id="npc-menu-close" type="button" aria-label="关闭" onclick={controller.close}>{@html controller.icon('close')}</button>{/if}</header>
    <p id="npc-menu-detail" hidden={!$store.detail}>{$store.detail}</p>
    <div id="npc-menu-buttons" style="display:flex;gap:8px;flex-wrap:wrap;">{#each $store.buttons as b}<button type="button" style="padding:8px 12px;background:#404040;border:1px solid #555;color:#fff;border-radius:6px;cursor:pointer" style:opacity={b.muted ? '0.55' : undefined} style:cursor={b.muted ? 'not-allowed' : 'pointer'} disabled={b.disabled} title={b.title} onclick={() => controller.choose(b.id)}>{#if $store.compact}{@html controller.icon(b.icon)}<span>{b.text}</span>{:else}{b.text}{/if}</button>{/each}</div>
    <div id="npc-menu-hint" role="status" hidden={$store.compact&&!$store.hint} style="margin-top:10px;color:#aaa;font-size:12px;line-height:1.6;">{$store.hint}</div>
  </div>
</div>
