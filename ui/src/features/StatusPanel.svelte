<script lang="ts">
  import PanelFrame from '../components/PanelFrame.svelte';
  import MetricRow from '../components/MetricRow.svelte';
  import { formatReading as n } from '../bridge/carry.mjs';
  import type { Readable } from 'svelte/store';
  import type { readBody, readSurvival, readGrowth, readBattle, readEffects } from '../bridge/hud';
  type View = ReturnType<typeof readBody> | ReturnType<typeof readSurvival> | ReturnType<typeof readGrowth> | ReturnType<typeof readBattle> | ReturnType<typeof readEffects>;
  // Each domain is mounted separately; branches below consume only their own view.
  let { domain, title, path, store, chrome, close, fold, actions }: {
    domain: string; title: string; path: string; store: Readable<View>;
    chrome: Readable<{ folded: boolean }>; close: () => void; fold: () => void;
    actions: { tooltip: (kind: string, value: any, el: Element) => void; hideTooltip: () => void; debug: (id: string, key?: string) => void; text: (key: string) => string };
  } = $props();
  const body = $derived($store as ReturnType<typeof readBody>);
  const survival = $derived($store as ReturnType<typeof readSurvival>);
  const growth = $derived($store as ReturnType<typeof readGrowth>);
  const battle = $derived($store as ReturnType<typeof readBattle>);
  const effects = $derived($store as ReturnType<typeof readEffects>);
  let moreOpen = $state(false);
  const moreTitle = $derived(domain === 'survival' && survival.rows.some(r => r.extra) ? '更多生存读数' : domain === 'growth' && $store.available ? '研习与属性经验' : '');
  // A Svelte action gives mouse hover listeners a deterministic cleanup path.
  function tooltip(node: HTMLElement, value: { kind: string; data: any }) {
    let current = value;
    const enter = () => actions.tooltip(current.kind, current.data, node);
    const touch = (event: PointerEvent) => { if (event.pointerType === 'touch') enter(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); enter(); } else if (event.key === 'Escape') actions.hideTooltip(); };
    node.tabIndex = 0;
    node.addEventListener('focus', enter); node.addEventListener('blur', actions.hideTooltip);
    node.addEventListener('pointerup', touch); node.addEventListener('keydown', key);
    node.addEventListener('mouseenter', enter);
    node.addEventListener('mouseleave', actions.hideTooltip);
    return { update(next: typeof value) { current = next; actions.hideTooltip(); }, destroy() { node.removeEventListener('focus', enter); node.removeEventListener('blur', actions.hideTooltip); node.removeEventListener('pointerup', touch); node.removeEventListener('keydown', key); node.removeEventListener('mouseenter', enter); node.removeEventListener('mouseleave', actions.hideTooltip); actions.hideTooltip(); } };
  }
</script>

<PanelFrame {title} {path} folded={$chrome.folded} onclose={close} onfold={fold} {moreTitle} {moreOpen} onmore={() => moreOpen = !moreOpen}>
  {#if $store.available}
    {#if domain === 'body'}
      <div id="limb-rows" class="body-readings">
        {#if body.detail}<div class="field-caption">累计损毁 / 损毁上限</div>{/if}
        {#each body.rows as row (row.id)}
          <div class="limb-row body-reading" class:hurt={row.hurt} use:tooltip={{ kind: 'body', data: row }}>
            <div class="row body-reading-caption"><span>{row.label}</span><b id={'limb-' + row.id}>{#if body.detail}{n(row.value)} <small>/ {n(row.max)}</small>{:else}{row.hurt ? '受伤' : '无碍'}{/if}</b><button type="button" class="limb-debug-destroy" style="margin-left:6px;padding:1px 5px;font-size:11px;flex-shrink:0" title={'调试：' + row.label + '满损毁'} onclick={() => actions.debug('destroy', row.key)}>满损毁</button></div>
            {#if body.detail}<div class="body-damage-track" aria-hidden="true"><i style:width={`${row.ratio}%`}></i></div>{/if}
          </div>
        {/each}
      </div>
    {:else if domain === 'survival'}
      {#each survival.rows.filter(r => !r.extra) as row (row.id)}<MetricRow {row}/>{/each}
      {#if moreTitle}<details class="moss-supplement" bind:open={moreOpen}><summary>更多生存读数</summary>{#each survival.rows.filter(r => r.extra) as row (row.id)}<MetricRow {row}/>{/each}</details>{/if}
    {:else if domain === 'growth'}
      {#if growth.attrsKnown}<div class="attributes">{#each growth.attrs as attr (attr.id)}<div><span class="label">{attr.label}</span><strong id={'status-attr-' + attr.id} title={'先天 ' + n(attr.base) + ' · 当前 ' + attr.value}>{n(attr.value)}</strong></div>{/each}</div>{/if}
      {#if growth.resourcesKnown}<div id="status-resources" class="status-card ui-window-host"><div class="ruled-row"><span class="label">{actions.text('status.label.potential')}</span><span class="value" id="status-potential">{growth.potential ?? '—'}</span></div><div class="ruled-row"><span class="label">战斗经验</span><span class="value" id="status-combat-experience">{growth.experience ?? '—'}</span></div></div>{/if}
      <details class="moss-supplement" bind:open={moreOpen}><summary>研习与属性经验</summary>
        {#if growth.resourcesKnown}<div class="ruled-row"><span class="label">{actions.text('status.label.study')}</span><span class="value" id="status-study">{growth.study}</span></div>{/if}
        {#if growth.attrsKnown}<details id="status-attr-exp-block" class="details-block ui-window-host" open><summary><span>{actions.text('status.block.attr_exp')}</span> <span>▼</span></summary><div class="details-body">{#each growth.attrs as attr (attr.id)}<div class="row"><span class="label">{attr.label}经验</span><span class="value" id={'status-attr-exp-exp-' + attr.id}>{attr.exp}</span><button type="button" id={'status-attr-exp-debug-plus-' + attr.id} title={'调试：' + attr.label + '经验 +50000'} onclick={() => actions.debug('experience', attr.id)}>+5万</button></div>{/each}</div></details>{/if}
      </details>
    {:else if domain === 'battle'}
      <div id="status-battle-resources" class="survival-row">
        {#each battle.meters as row (row.id)}<div class="metric"><div class="row metric-caption" style:margin-top={row.id === 'diqi' ? '8px' : undefined}><span class="label">{row.label}</span><b id={'status-' + row.id + '-text'}>{row.value}</b>{#if row.id === 'diqi'}<button type="button" id="status-diqi-debug-plus50" title="调试：底气上限 +50" style="margin-left:6px" onclick={() => actions.debug('diqi')}>+50</button>{/if}</div><div class="track" style:--tone={row.tone}><i id={'status-' + row.id + '-bar'} style:width={`${row.ratio}%`}></i></div></div>{/each}
        {#each battle.rows as row (row.id)}<div class="row" style="margin-top:6px"><span class="label">{row.label}</span><span class="value" id={'status-' + row.id + '-text'}>{row.value}</span>{#if ['stun','pain','addiction'].includes(row.id)}<button type="button" id={'status-' + row.id + '-debug-plus' + (row.id === 'stun' ? 50 : row.id === 'pain' ? 30 : 10)} style="margin-left:6px" onclick={() => actions.debug(row.id)}>+{row.id === 'stun' ? 50 : row.id === 'pain' ? 30 : 10}</button>{/if}</div>{/each}
      </div>
    {:else if domain === 'effects'}
      {#each effects.sections as section (section.id)}<div class="buff-hud-section" class:game-empty-buffs={!section.chips.length}><div class="buff-hud-title" id={'buff-hud-' + section.titleId + '-title'}>{section.title}</div><div class="buff-hud-chips" id={'buff-hud-' + section.id + '-chips'}>{#each section.chips as chip}<span class="buff-chip" title={chip.name + (chip.desc ? ': ' + chip.desc : '')} aria-label={chip.name + '，' + chip.stacks + '层' + (chip.remaining != null ? '，剩余' + chip.remaining + '回合' : '')} use:tooltip={{ kind: 'buff', data: chip }}><span class="game-buff-original">{chip.name}×{chip.stacks}{chip.remaining != null ? ' ' + chip.remaining + 't' : ''}</span><span class="game-buff-name">{chip.name}</span><span class="game-buff-count">{chip.stacks > 1 ? '×' + chip.stacks : ''}</span><span class="game-buff-time" title={chip.remaining != null ? '剩余 ' + chip.remaining + ' 回合' : undefined}>{chip.remaining ?? ''}</span></span>{:else}{section.empty}{/each}</div></div>{/each}
    {/if}
  {/if}
</PanelFrame>
