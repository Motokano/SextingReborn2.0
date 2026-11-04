<script lang="ts">
  import { untrack } from 'svelte';
  import type { Readable } from 'svelte/store';
  let { store, controller, overlays, t } = $props<{store: Readable<any>, controller: any, overlays: any, t: (key: string, vars?: any) => string}>();
  let root: HTMLDivElement;
  let name = $state(''), gender = $state('male'), hand = $state('right'), leg = $state('right'), height = $state<number | undefined>(178);
  const attrs = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
  let open = $derived($store.open);
  $effect(() => { if (open) { name = ''; height = untrack(() => $store.height); return overlays.enter(root); } });
</script>
<div id="character-creation-overlay" class:hidden={!$store.open} bind:this={root} role="dialog" aria-modal="true" aria-labelledby="creation-title" tabindex="-1" data-ui-owner="svelte">
  {#if open}<div id="character-creation-card">
    <h2 id="creation-title">{t('creation.title')}</h2>
    <div class="creation-field"><label for="creation-name">{t('creation.name.label')}</label><input type="text" id="creation-name" class="creation-name" bind:value={name} maxlength="20" autocomplete="off" placeholder={t('creation.name.placeholder')} /></div>
    <div class="creation-field"><!-- svelte-ignore a11y_label_has_associated_control --><label>{t('creation.gender.label')}</label><div class="creation-dominant" style="margin-bottom:0"><div class="group" style="flex:1"><div class="opt">
      <label><input type="radio" name="creation-gender" value="male" bind:group={gender} /> <span>{t('creation.gender.male')}</span></label><label><input type="radio" name="creation-gender" value="female" bind:group={gender} /> <span>{t('creation.gender.female')}</span></label>
    </div></div></div></div>
    <div class="creation-field"><label for="creation-height">{t('creation.height.label')}</label><input type="number" id="creation-height" class="creation-height" min="140" max="210" step="1" bind:value={height} onchange={() => height = controller.clampHeight(height)} placeholder={t('creation.height.placeholder')} /></div>
    <div class="creation-field"><!-- svelte-ignore a11y_label_has_associated_control --><label>{t('creation.innate.label')}</label><div id="creation-attr-rows">
      {#each attrs as id}<div class="attr-row"><span class="attr-label">{t('status.attr.' + id)}</span><div class="attr-controls"><button type="button" class="attr-btn" aria-label={t('creation.attr.minus')} disabled={$store.innate[id] <= 0} onclick={() => controller.change(id, -1)}>−</button><span class="attr-value">{$store.innate[id]}</span><button type="button" class="attr-btn" aria-label={t('creation.attr.plus')} disabled={$store.innate[id] >= $store.max || $store.free <= 0} onclick={() => controller.change(id, 1)}>+</button></div></div>{/each}
    </div><div id="creation-points" class="creation-points" class:ok={$store.free === 0}>{t('creation.points.left', { free: $store.free })}</div></div>
    <div class="creation-dominant">
      <div class="group"><!-- svelte-ignore a11y_label_has_associated_control --><label class="group-label">{t('creation.dominant.hand')}</label><div class="opt"><label><input type="radio" name="creation-hand" value="left" bind:group={hand} /> <span>{t('creation.left')}</span></label><label><input type="radio" name="creation-hand" value="right" bind:group={hand} /> <span>{t('creation.right')}</span></label></div></div>
      <div class="group"><!-- svelte-ignore a11y_label_has_associated_control --><label class="group-label">{t('creation.dominant.foot')}</label><div class="opt"><label><input type="radio" name="creation-leg" value="left" bind:group={leg} /> <span>{t('creation.left')}</span></label><label><input type="radio" name="creation-leg" value="right" bind:group={leg} /> <span>{t('creation.right')}</span></label></div></div>
    </div>
    {#if $store.error}<p id="creation-save-error" role="alert">{$store.error}</p>{/if}
    <button type="button" id="btn-confirm-creation" class="btn-confirm-creation" disabled={!name.trim()} onclick={() => controller.confirm({ name, gender, hand, leg, height })}>{t('creation.finish')}</button>
  </div>{/if}
</div>
