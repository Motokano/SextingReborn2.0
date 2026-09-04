<script>
  export let nextLabel = '...';
  export let nextDisabled = false;
  export let closeLabel = 'close';
  export let onNext = null;
  export let onClose = null;

  function handleNext() {
    if (typeof onNext === 'function') onNext();
  }

  function handleClose() {
    if (typeof onClose === 'function') onClose();
  }
</script>

<button
  type="button"
  class="dlg-btn primary"
  id="dialogue-btn-next"
  disabled={nextDisabled}
  on:click={handleNext}
>
  {nextLabel}
</button>

<button
  type="button"
  class="dlg-btn"
  id="dialogue-btn-close"
  on:click={handleClose}
>
  {closeLabel}
</button>
