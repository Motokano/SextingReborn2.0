<script lang="ts">
  import { onMount } from 'svelte';
  import Environment from './Environment.svelte';
  import type { Readable } from 'svelte/store';
  import type { readEnvironment } from '../bridge/hud';
  let { store, path, navigation, connect }: { store: Readable<ReturnType<typeof readEnvironment>>; path: string; navigation: HTMLElement; connect: (env: HTMLElement, top: HTMLElement) => void } = $props();
  let top: HTMLElement, env: HTMLDivElement;
  onMount(() => { top.append(navigation); connect(env, top); });
</script>
<header class="demo-top" bind:this={top}><div id="top-hud" class="top-environment" aria-label="环境信息" data-ui-owner="svelte" bind:this={env}><Environment {store} {path}/></div></header>
