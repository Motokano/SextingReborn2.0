<script lang="ts">
 let {value:v,controller:c}=$props<{value:any,controller:any}>();
</script>
{#snippet rows(items:any[],embedded=false)}
 {#each items as i(i.id)}<label class="cr-material"><span>{i.name}<small>{embedded?'可用':'持有'} {i.stock} 件</small></span><span class="cr-slider"><input type="range" step="1" aria-label={i.name+'投入数量'} data-item={i.id} min="0" max={i.stock} value={i.selected} oninput={e=>c.select(i.id,e.currentTarget.value)}/><output>投入 {i.selected} 件</output></span></label>{/each}
{/snippet}
{#snippet receipt(label:string,items:any[])}<section><h3>{label}</h3>{#each items as i}<p>{i.name} × {i.count}</p>{:else}<p>无</p>{/each}</section>{/snippet}
<section class="cr-window" class:cr-embedded={v.embedded} role={v.embedded?undefined:'dialog'} aria-modal={v.embedded?undefined:'true'} aria-label={v.embedded?undefined:v.title}>
 {#if !v.embedded}<header><h1>{v.title}</h1><button data-action="close" aria-label="关闭修复" onclick={c.close}>×</button></header>{/if}
 <div class="cr-body">
 {#if v.work}
  <h2>{v.complete?'装配完成':'材料已备齐'}</h2><p>{v.complete?'现在可以使用。':`需要亲自施工，剩余 ${v.minutes} 分钟。中断后可继续。`}</p>{#if v.result?.message}<p role="status">{v.result.message}</p>{/if}{#if !v.complete}<button data-sewing-work onclick={()=>c.act('work')}>施工10分钟 · 消耗体力</button>{/if} <button data-action="close" onclick={c.close}>关闭</button>
 {:else if v.result?.ok}
  <h2>{v.done?(v.warehouse?'材料已备妥，可以开始施工':'装配完成，可以使用了'):(v.warehouse?'材料已收下，还需要继续准备':'还需要继续修补')}</h2>{#each v.groups as g}<p>{g.description}</p>{/each}<div class="cr-receipts">{@render receipt('实际消耗',v.result.used)}{@render receipt('整件退回',v.result.returned)}</div><p class="cr-muted">用不上的整件材料仍在原处，已用材料不折成碎片返还。</p><button data-action={v.done?'close':'continue'} onclick={()=>c.act(v.done?'close':'continue')}>{v.done?(v.embedded?'收起交付明细':'完成'):'继续准备材料'}</button>
 {:else if v.embedded&&(v.warehouse||v.toolbench)}
  <div class="wh-material-heading"><h2>准备材料</h2><p class="cr-muted">{v.warehouse?'已列出随身与仓库中可用于本项整备的材料。':'已列出随身可用于装配这件工具的材料。'}拖动滑条选择本次交付的件数。</p></div>{#if v.result&&!v.result.ok}<p role="alert">{v.result.message}</p>{/if}
  {#each v.groups as g(g.id)}<section class="wh-material-group"><header><h3>{g.note}</h3><span>{g.description}</span></header>{#if g.finished}<p class="cr-muted">这类材料不用再交付。</p>{:else if g.rows.length}{@render rows(g.rows,true)}{:else}<p class="cr-muted">手边没有适用的材料，可以先交付其他类别，之后再补。</p>{/if}</section>{/each}
  <div class="wh-delivery"><div><strong>本次交付</strong><p data-selection-summary>{v.summary||'尚未选择材料'}</p><small>多余整件留在原处，已交材料会保留。</small></div><button class="wh-primary" data-action="repair" disabled={!v.summary} onclick={()=>c.act('repair')}>交付所选材料</button></div>
 {:else}
  <button data-action="inspect" onclick={()=>c.act('inspect')}>查看修补说明</button>{#if v.explanation}<p class="cr-explanation">{v.explanation}</p>{/if}<nav>{#each [...v.groups.map((g:any)=>g.note),'核对材料'] as label,n}<button data-step={n} aria-current={v.step===n?'step':undefined} onclick={()=>c.act(null,n)}>{label}</button>{/each}</nav>{#if v.result&&!v.result.ok}<p role="alert">{v.result.message}</p>{/if}
  {#if v.step<v.groups.length}
   {@const g=v.groups[v.step]}<h2>{g.note}</h2><p>{g.description}</p>{#if g.finished}<p>{v.warehouse?'这类材料已经备妥，不必再投入。':'这里已经修好，不必再投入材料。'}</p>{:else}<p class="cr-muted">选择已知适合的材料。{v.warehouse?'可使用随身与仓库中未封签的材料。':'使用随身材料。'}</p><button data-action="all" onclick={()=>c.act('all')}>备齐这类材料</button> <button data-action="clear" onclick={()=>c.act('clear')}>清空本步</button>{#if g.rows.length}{@render rows(g.rows)}{:else}<p>没有可用且已知适合这一步的材料。可以先查看修补说明，了解材料用途。</p>{/if}{/if}<footer><button data-step={v.step+1} onclick={()=>c.act(null,v.step+1)}>{v.step<v.groups.length-1?'继续准备':'核对材料'}</button></footer>
  {:else}<h2>准备投入</h2>{#each v.picked as i}<p>{i.name} × {i.count}</p>{/each}<p class="cr-muted">{v.warehouse?'提交后收下本次所需材料，已备材料会保留。':'点击后直接修补，已完成的修补会保留。'}用不上的整件材料仍留在原处。</p><footer><button data-step={v.groups.length-1} onclick={()=>c.act(null,v.groups.length-1)}>返回选材</button><button data-action="repair" disabled={!v.picked.length} onclick={()=>c.act('repair')}>{v.warehouse?'核对并交付材料':'核对并修复'}</button></footer>{/if}
 {/if}
 </div>
</section>
