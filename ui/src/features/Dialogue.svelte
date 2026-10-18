<script lang="ts">
  import type { Readable } from 'svelte/store';
  let { store, controller, overlays } = $props<{store: Readable<any>, controller: any, overlays: any}>();
  let panel: HTMLDivElement;
  let failed = $state(false);
  let avatarUrl = $derived($store.avatarUrl), open = $derived($store.open);
  $effect(() => { avatarUrl; failed = false; });
  $effect(() => { if (open && panel) return overlays.enter(panel, { advance: () => controller.next() }); });
</script>
<div id="dialogue-input-blocker" style:display={$store.open ? 'block' : 'none'} aria-hidden={!$store.open}></div>
<div id="dialogue-panel" bind:this={panel} class:show={$store.open} class:dialogue-advance-only={$store.open} aria-hidden={!$store.open} inert={!$store.open} role="dialog" aria-modal="true" aria-label="对话" tabindex="-1" data-ui-owner="svelte">
  <div class="dlg-inner">
    <div class="dlg-avatar dlg-pawn" id="dialogue-avatar" class:avatar-has-image={!!$store.avatarUrl && !failed} style:display={$store.role === 'narration' ? 'none' : ''}>
      <img id="dialogue-avatar-img" src={$store.avatarUrl || undefined} alt="" style:display={$store.avatarUrl && !failed ? 'block' : 'none'} onerror={() => failed = true} />
      <span class="fallback" id="dialogue-avatar-fallback" style:display={$store.avatarUrl && !failed ? 'none' : 'block'}>{$store.fallbackGlyph || '❖'}</span>
    </div>
    <div class="dlg-main">
      <div class="dlg-top">
        <div class="dlg-name" id="dialogue-speaker-name" style:display={$store.role === 'narration' ? 'none' : ''} aria-hidden={$store.role === 'narration' ? true : undefined}>{$store.speakerName}</div>
        <div class="dlg-actions"><button type="button" class="dlg-btn primary" id="dialogue-btn-next" disabled={$store.nextDisabled} onclick={() => controller.next()}>{$store.nextLabel || '...'}</button></div>
      </div>
      <div class="dlg-text" id="dialogue-text">{#each ($store.text || '').split('\n') as line, i}{#if i > 0}<br />{/if}{line}{/each}{#if $store.typing}<span class="dlg-typing-cursor" aria-hidden="true">▋</span>{/if}</div>
      <div class="dlg-options" id="dialogue-options" style:display={$store.options.length ? 'flex' : 'none'}>{#each $store.options as option, i}<button type="button" class="dlg-option-btn" onclick={() => controller.choose(i)}>{option.text}</button>{/each}</div>
      <div class="dlg-hint">{$store.hint}</div>
    </div>
  </div>
</div>
