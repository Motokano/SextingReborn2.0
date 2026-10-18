<script lang="ts">
  import { onMount } from 'svelte';
  import type { Readable } from 'svelte/store';
  let { store, controller, overlays } = $props<{store: Readable<any>, controller: any, overlays: any}>();
  let dialog: HTMLDialogElement, open = $derived($store.open);
  $effect(() => {
    if (open && dialog) { dialog.showModal(); const leave = overlays.enter(dialog, { escape: () => controller.close() }); return () => { dialog.close(); leave(); }; }
  });
  const buttonStyle = 'padding:9px 14px;border-radius:5px;border:1px solid #8a6948;background:#342a20;color:#eee4d5;cursor:pointer;font:inherit';
</script>
<dialog bind:this={dialog} aria-labelledby="reset-progress-title" style="max-width:440px;width:calc(100% - 32px);background:#25211c;color:#eee4d5;border:1px solid #99734b;border-radius:10px;padding:24px;box-shadow:0 20px 80px #0009" oncancel={e => { e.preventDefault(); controller.close(); }}>
  <h2 id="reset-progress-title" style="margin-top:0">清空本机存档</h2><p data-message>{$store.message}</p><p role="alert" data-error style="color:#f3aa91">{$store.error}</p>
  <div style="display:flex;justify-content:flex-end;gap:12px"><button type="button" data-cancel style={buttonStyle} onclick={() => controller.close()}>取消</button><button type="button" data-delete style={buttonStyle + ';background:#703b2c'} disabled={$store.busy} onclick={() => controller.confirm()}>清空并重新开始</button></div>
</dialog>
