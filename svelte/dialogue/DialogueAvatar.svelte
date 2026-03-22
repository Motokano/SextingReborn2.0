<script>
  import { onMount } from 'svelte';

  export let avatarUrl = '';
  export let fallbackGlyph = '❖';

  let hasImage = !!avatarUrl;
  let imgSrc = avatarUrl || '';
  let triedFallback = false;

  function deriveAvatarAltUrl(url) {
    if (!url) return '';
    const s = String(url).trim();
    const flat = /^image\/([^/]+)\/([^/]+)$/.exec(s);
    if (flat) return `image/${flat[1]}/${flat[1]}/${flat[2]}`;
    const nested = /^image\/([^/]+)\/\1\/([^/]+)$/.exec(s);
    if (nested) return `image/${nested[1]}/${nested[2]}`;
    return '';
  }

  $: if ((avatarUrl || '') !== imgSrc && !triedFallback) {
    hasImage = !!avatarUrl;
    imgSrc = avatarUrl || '';
  }

  $: if (!avatarUrl) {
    hasImage = false;
    imgSrc = '';
    triedFallback = false;
  }

  function onLoad() {
    if (!avatarUrl) return;
    hasImage = true;
  }

  function onError() {
    const fallbackUrl = deriveAvatarAltUrl(avatarUrl);
    if (!triedFallback && fallbackUrl && fallbackUrl !== imgSrc) {
      triedFallback = true;
      imgSrc = fallbackUrl;
      return;
    }
    hasImage = false;
  }

  onMount(() => {
    hasImage = !!avatarUrl;
    imgSrc = avatarUrl || '';
  });
</script>

<img
  id="dialogue-avatar-img"
  src={imgSrc}
  alt=""
  on:load={onLoad}
  on:error={onError}
  style:display={hasImage ? 'block' : 'none'}
/>
<span
  class="fallback"
  id="dialogue-avatar-fallback"
  style:display={hasImage ? 'none' : 'block'}
>{fallbackGlyph}</span>
