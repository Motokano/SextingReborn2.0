<script lang="ts">
 let {value:v,controller:c}=$props<{value:any,controller:any}>();
</script>
{#snippet rows(items:any[],embedded=false)}
 {#each items as i(i.id)}<label class="cr-material"><span>{i.name}<small>{embedded?'可用':'持有'} {i.stock} 件</small></span><span class="cr-slider"><input type="range" step="1" aria-label={i.name+'投入数量'} data-item={i.id} min="0" max={i.stock} value={i.selected} oninput={e=>c.select(i.id,e.currentTarget.value)}/><output>投入 {i.selected} 件</output></span></label>{/each}
{/snippet}
{#snippet receipt(label:string,items:any[])}<section><h3>{label}</h3>{#each items as i}<p>{i.name} × {i.count}</p>{:else}<p>无</p>{/each}</section>{/snippet}
{#snippet repairRows(items:any[])}
 {#each items as i(i.id)}<label class="cr-material cr-repair-material"><span><strong>{i.name}</strong><small title="持有 / 单独使用所需" aria-label={'持有 '+i.stock+' 件，单独使用需 '+i.required+' 件'}>{i.stock}/{i.required}</small></span><span class="cr-slider cr-repair-slider"><input type="range" step="1" aria-label={i.name+'投入数量'} data-item={i.id} min="0" max={i.limit} value={i.selected} disabled={!i.stock} oninput={e=>c.select(i.id,e.currentTarget.value)}/><output>投入 {i.selected} 件</output></span></label>{/each}
{/snippet}
<section class="cr-window" class:cr-embedded={v.embedded} role={v.embedded?undefined:'dialog'} aria-modal={v.embedded?undefined:'true'} aria-label={v.embedded?undefined:v.title}>
 {#if !v.embedded}<header><h1>{v.title}</h1><button data-action="close" aria-label="关闭修复" onclick={c.close}>×</button></header>{/if}
 <div class="cr-body">
 {#if v.work}
  <h2>{v.complete?'装配完成':'材料已备齐'}</h2><p>{v.complete?'现在可以使用。':`需要亲自施工，剩余 ${v.minutes} 分钟。中断后可继续。`}</p>{#if v.result?.message}<p role="status">{v.result.message}</p>{/if}{#if !v.complete}<button data-sewing-work onclick={()=>c.act('work')}>施工10分钟 · 消耗体力</button>{/if} <button data-action="close" onclick={c.close}>关闭</button>
 {:else if v.sequence}
  {@const s=v.sequence}
  <ol class="cr-steps" aria-label="修复顺序">{#each s.steps as g,n}<li class={'cr-step'+(g.status==='已完成'?' is-complete':n===s.current?' is-current':' is-locked')} aria-current={n===s.current?'step':undefined}><span class="cr-step-number">{g.status==='已完成'?'✓':n+1}</span><span>{g.note}<small>{g.status}</small></span></li>{/each}</ol>
  {#if v.result?.ok}<div class="cr-feedback" role="status"><strong>{v.result.partNote||'当前部件'}{v.result.partFinished?'已完成。':'已修补一部分。'}</strong><p>实际消耗：{v.result.used.map((i:any)=>i.name+' × '+i.count).join('、')}</p></div>{:else if v.result}<p role="alert">{v.result.message}</p>{/if}
  {#if v.done}<div class="cr-finished"><h2>全部部件已修好</h2><button class="cr-primary" data-action="close" onclick={c.close}>完成</button></div>
  {:else}
   {@const g=s.steps[s.current]}
   {@const alternatives=s.items.filter((i:any)=>!i.basic&&!i.stock)}
   <section class="cr-current"><h2>{g.note}</h2>
    {@render repairRows(s.items.filter((i:any)=>i.basic||!s.hasStock||i.stock>0))}
    {#if s.hasStock&&alternatives.length}<details class="cr-alternatives"><summary>其他可替代材料（{alternatives.length} 种）</summary>{@render repairRows(alternatives)}</details>{/if}
    <div class="cr-commit"><button class="cr-primary" data-action="repair" disabled={!s.canRepair} onclick={()=>c.act('repair')}>{s.button}</button></div>
   </section>
  {/if}
 {:else if v.result?.ok}
  <h2>{v.done?(v.warehouse?'材料已备妥，可以开始施工':'装配完成，可以使用了'):(v.warehouse?'材料已收下，还需要继续准备':'还需要继续修补')}</h2>{#each v.groups as g}<p>{g.description}</p>{/each}<div class="cr-receipts">{@render receipt('实际消耗',v.result.used)}{@render receipt('整件退回',v.result.returned)}</div><p class="cr-muted">用不上的整件材料仍在原处，已用材料不折成碎片返还。</p><button data-action={v.done?'close':'continue'} onclick={()=>c.act(v.done?'close':'continue')}>{v.done?(v.embedded?'收起交付明细':'完成'):'继续准备材料'}</button>
 {:else}
  <div class="wh-material-heading"><h2>准备材料</h2><p class="cr-muted">{v.warehouse?'已列出随身与仓库中可用于本项整备的材料。':'已列出随身可用于装配这件工具的材料。'}拖动滑条选择本次交付的件数。</p></div>{#if v.result&&!v.result.ok}<p role="alert">{v.result.message}</p>{/if}
  {#each v.groups as g(g.id)}<section class="wh-material-group"><header><h3>{g.note}</h3><span>{g.description}</span></header>{#if g.finished}<p class="cr-muted">这类材料不用再交付。</p>{:else if g.rows.length}{@render rows(g.rows,true)}{:else}<p class="cr-muted">手边没有适用的材料，可以先交付其他类别，之后再补。</p>{/if}</section>{/each}
  <div class="wh-delivery"><div><strong>本次交付</strong><p data-selection-summary>{v.summary||'尚未选择材料'}</p><small>多余整件留在原处，已交材料会保留。</small></div><button class="wh-primary" data-action="repair" disabled={!v.summary} onclick={()=>c.act('repair')}>交付所选材料</button></div>
 {/if}
 </div>
</section>
