<script lang="ts">
  import { tick, onMount } from 'svelte';
  import type { Readable } from 'svelte/store';
  import type { readJournal } from '../bridge/hud';
  import PanelFrame from '../components/PanelFrame.svelte';
  let { store, chrome, path, close, fold, host }: {
    store: Readable<ReturnType<typeof readJournal>>; chrome: Readable<{ folded: boolean }>;
    path: string; close: () => void; fold: () => void; host: HTMLElement;
  } = $props();
  let list: HTMLDivElement;
  let reading = $state(true), hasNew = $state(false);
  let lastId = 0;
  const atBottom = () => !list || list.scrollHeight - list.scrollTop - list.clientHeight <= 24;
  function latest() { if (list) list.scrollTop = list.scrollHeight; hasNew = false; }
  async function filter(value: boolean) { reading = value; await tick(); latest(); }
  $effect(() => { host.classList.toggle('game-log-reading', reading); });
  $effect.pre(() => {
    const entries = $store.entries, id = entries.at(-1)?.id || 0;
    const wasBottom = atBottom(), newEntries = entries.filter((e: any) => e.id > lastId);
    lastId = id;
    if (!entries.length) hasNew = false;
    else if (wasBottom) tick().then(latest);
    else if (newEntries.some((e: any) => !reading || !e.debug)) hasNew = true;
  });
  function scrollArea(node: HTMLDivElement) {
    let drag: { y: number; top: number } | null = null;
    const down = (e: MouseEvent) => { if (e.button === 0) { drag = { y: e.clientY, top: node.scrollTop }; node.classList.add('log-dragging'); } };
    const move = (e: MouseEvent) => { if (drag) node.scrollTop = Math.max(0, Math.min(node.scrollHeight - node.clientHeight, drag.top + drag.y - e.clientY)); };
    const stop = () => { drag = null; node.classList.remove('log-dragging'); };
    const scroll = () => { if (atBottom()) hasNew = false; };
    node.addEventListener('mousedown', down); node.addEventListener('scroll', scroll);
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', stop); document.addEventListener('mouseleave', stop);
    return { destroy() { node.removeEventListener('mousedown', down); node.removeEventListener('scroll', scroll); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', stop); document.removeEventListener('mouseleave', stop); } };
  }
  onMount(() => {
    const sync = () => document.body.style.setProperty('--game-log-height', host.getBoundingClientRect().height + 'px');
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    observer?.observe(host); sync();
    return () => observer?.disconnect();
  });
</script>
<PanelFrame title="事件记录" {path} folded={$chrome.folded} onclose={close} onfold={fold}>
  <div class="game-log-resize-handle-top" aria-hidden="true"></div>
  <div class="game-log-resize-handle-left" aria-hidden="true"></div>
  <div class="game-log-resize-handle-right" aria-hidden="true"></div>
  <div id="game-log-lines" class="game-log-lines journal" bind:this={list} use:scrollArea>
    {#each $store.entries as entry (entry.id)}<div class={'game-log-line ' + entry.type} class:game-log-debug={entry.debug} data-time={entry.time || undefined}><p data-time={entry.time || undefined}>{#if $store.timeKnown}<span class="log-time">[{entry.time}]</span> {/if}{entry.message}</p></div>{/each}
  </div>
  <div class="game-log-tools"><button type="button" data-filter="reading" aria-pressed={reading} title="隐藏技术调试记录，保留游戏消息" onclick={() => filter(true)}>阅读</button><button type="button" data-filter="all" aria-pressed={!reading} onclick={() => filter(false)}>全部记录</button></div>
  {#snippet footer()}<button type="button" class="game-log-new" hidden={!hasNew} onclick={latest}>有新记录 ↓</button>{/snippet}
</PanelFrame>
