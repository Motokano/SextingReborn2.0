<script>
  export let options = [];
  export let onChoose = null;

  function choose(index) {
    if (typeof onChoose === 'function') onChoose(index);
  }
</script>

{#if options && options.length}
  {#each options as opt, idx}
    <button
      type="button"
      class="dlg-option-btn"
      on:click={() => choose(idx)}
    >
      {opt && opt.text != null ? String(opt.text) : '...'}
    </button>
  {/each}
{/if}
