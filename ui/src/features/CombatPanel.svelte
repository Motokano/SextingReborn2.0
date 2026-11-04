<script lang="ts">
 import type {Readable} from 'svelte/store';
 import {paths} from '../runtime/icons';
 let {store,controller,overlays,t}=$props<{store:Readable<any>,controller:any,overlays:any,t:any}>();
 let root=$state<HTMLDivElement>(), pickerRoot=$state<HTMLDivElement>();
 let open=$derived(!!$store.open), p=$derived($store.picker), pickerOpen=$derived(open&&!!p);
 $effect(()=>{if(open&&root)return overlays.enter(root,{escape:()=>controller.close('combat')});});
 $effect(()=>{if(pickerOpen&&pickerRoot)return overlays.enter(pickerRoot,{escape:()=>controller.closePicker(),dismissOutside:()=>controller.closePicker()});});
 function show(kind:string,id:string,index=0){controller.openPicker(kind,id,index);}
</script>

{#snippet lockIcon()}<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3.5" y="7" width="9" height="7" rx="1.3"/><path d="M5.5 7V4a2.5 2.5 0 0 1 5 0v3"/></svg>{/snippet}
{#snippet muscleContents(m:any)}
 <span class="muscle-tile-copy"><strong>{m.name}</strong><span class="muscle-tile-effects">{#each m.effects as effect}<span>{effect.name}<b>{effect.value>0?'+':''}{effect.value}</b></span>{/each}</span></span>
 <span class="muscle-tile-mark"><small>{Number(m.progress||0).toFixed(3)}%</small></span>
{/snippet}

<div id="modal-combat" bind:this={root} class="combat-loadout" class:show={open} role="dialog" aria-modal="true" aria-label="技能装配" tabindex="-1" data-ui-owner="svelte">
 {#if open}
 <section class="window" inert={pickerOpen}>
  <header class="window-head"><h1><svg class="title-sigil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths.battle}/></svg>技能装配</h1>
   <nav class="window-tabs" aria-label="配置类别"><button class:active={!$store.muscle} data-mode="skills" aria-pressed={!$store.muscle} onclick={()=>controller.select('mode','skills')}>招式</button>{#if $store.unlocked}<button class:active={$store.muscle} data-mode="muscles" aria-pressed={$store.muscle} onclick={()=>controller.select('mode','muscles')}>肌群</button>{/if}</nav>
   <button class="close" id="combat-modal-close" aria-label="关闭技能装配" onclick={()=>controller.close('combat')}>×</button>
  </header>
  {#if !$store.muscle}
   <div class="ledger-body"><section class="global-strip" aria-label="全局技能">{#each $store.hubs as hub}<button class="hub" data-hub={hub.id} aria-label={'更换'+hub.label} onclick={()=>show('hub',hub.id)}><span class="hub-label">{hub.label}</span><strong>{hub.name}</strong><span class="chevron" aria-hidden="true">⌄</span></button>{/each}</section>
   {#if $store.weapon}<section class="weapon-cycle" aria-label="武器循环"><header>{$store.weapon.hand}持械 · {$store.weapon.active?'武器循环':'徒手循环'}</header><div>{#each $store.weapon.rows as row,i}<article class:next={row.next}>
    <small>{row.label}{#if row.next} · 下一招{/if}</small><strong>{row.name}</strong>
    {#if row.powerLevel}<label class="weapon-power">出力<select aria-label={row.label+'出力'} value={row.powerLevel} onchange={e=>controller.weaponPower(row.slot,e.currentTarget.value)}>{#each Array.from({length:12},(_,n)=>n+1) as power}<option value={power}>{power}成</option>{/each}</select></label>{/if}
    {#if row.durability}<small>{row.durability}</small>{/if}{#if row.broken}<small>损坏</small>{/if}</article>{#if i<3}<button aria-label={'交换'+row.label+'与下一位置'} onclick={()=>controller.swapWeapon(i)}>⇄</button>{/if}{/each}</div></section>{/if}
   <div class="table-wrap"><table class="ledger"><thead><tr><th scope="col">顺位</th><th scope="col">肢体</th><th scope="col">主动技能</th><th scope="col">主招式</th><th scope="col">变式</th><th scope="col"><span class="sr-only">操作</span></th></tr></thead><tbody>
    {#each $store.limbs as limb (limb.id)}<tr class:selected={limb.id===$store.selected} data-limb={limb.id}>
     <td class="row-order"><span>{limb.order}</span></td><th scope="row" class="limb-table-name">{limb.label}</th>
     <td><button class="table-edit" data-edit="skill" aria-label={'更换'+limb.label+'技能'} onclick={()=>show('skill',limb.id)}><span class="cell-title">{limb.name}<span class="cell-caret" aria-hidden="true">⌄</span></span>{#if limb.skillId}<small class="skill-level">{limb.level} 级</small>{/if}</button></td>
     <td><button class="table-edit table-main" data-edit="move" aria-label={'更换'+limb.label+'招式'} onclick={()=>show('move',limb.id)}><span class="cell-title">{limb.move}<span class="cell-caret" aria-hidden="true">⌄</span></span>{#if limb.prof!==null}<small>熟练 {limb.prof}%</small><span class="ledger-track" aria-hidden="true"><i style:width={limb.prof+'%'}></i></span>{/if}</button></td>
     <td><div class="variant-sockets">{#each limb.variants as v}<button class="table-slot" class:filled={!!v.name} title={v.name||'空变式槽'} data-variant={v.index} aria-label={limb.label+'变式槽'+v.index+(v.name?'：'+v.name:'')} onclick={()=>show('move',limb.id,v.index)}>{v.name||'＋'}</button>{:else}<small>—</small>{/each}</div></td>
     <td class="ledger-action"><button class="outlined" data-edit="detail" aria-label={limb.label+'详情'} onclick={()=>show('detail',limb.id)}>详情</button></td>
    </tr>{/each}
   </tbody></table></div>
   <section class="order-band" aria-label="出手顺序"><span class="field-label">出手顺序</span><div class="order">{#each $store.order as limb,i}<span class="order-chip">{limb.label}</span>{#if i<$store.order.length-1}{#if $store.editingOrder}<button class="swap" aria-label={'交换'+limb.label+'与'+$store.order[i+1].label} onclick={()=>controller.swap(i)}>⇄</button>{:else}<span class="order-arrow" aria-hidden="true">→</span>{/if}{/if}{/each}</div><button class="order-toggle" aria-expanded={$store.editingOrder} onclick={()=>controller.toggleOrder()}>{$store.editingOrder?'完成':'调整'}</button></section></div>
  {:else}
   {@const ms=$store.muscles}
   <div class="ledger-body muscle-body"><div class="muscle-toolbar"><nav class="muscle-regions" aria-label="肌群部位">{#each ms.regions as r}<button class:active={ms.region===r.id} aria-pressed={ms.region===r.id} data-region={r.id} onclick={()=>controller.select('region',r.id)}>{r.name}</button>{/each}</nav><div class="muscle-totals"><span>解锁 <b>{ms.count}</b><small> / {ms.total}</small></span><span>全通 <b>{ms.complete}</b><small> / {ms.groupTotal}</small></span></div></div>
   <div class="muscle-table-wrap"><table class="muscle-table"><thead><tr><th scope="col">肌群</th><th scope="col">解锁进度</th><th scope="col">大型被动</th><th scope="col"><span class="sr-only">操作</span></th></tr></thead><tbody>{#each ms.groups as gr (gr.id)}<tr class:complete={gr.complete} data-group={gr.id}><th scope="row"><span class="muscle-group-name">{gr.name}</span></th><td><div class="muscle-count"><b>{gr.count}</b><span> / {gr.total}</span>{#if gr.complete}<small class="complete-mark">✓</small>{/if}</div><span class="ledger-track" aria-hidden="true"><i style:width={(gr.total?gr.count/gr.total*100:0)+'%'}></i></span></td><td>{#if gr.complete}<button class="passive-socket" class:filled={!!gr.passive} data-group-passive={gr.id} aria-label={gr.name+'被动：'+(gr.passive||'空槽')} onclick={()=>show('passive',gr.id)}><span class="socket-mark" aria-hidden="true">{gr.passive?'◆':'＋'}</span><span>{gr.passive||'装配被动'}</span><span class="cell-caret" aria-hidden="true">⌄</span></button>{:else}<span class="muscle-slot-locked">{@render lockIcon()}全通后开放</span>{/if}</td><td><button class="outlined" data-group-open={gr.id} aria-label={'查看'+gr.name+'肌肉'} onclick={()=>show('muscles',gr.id)}>查看</button></td></tr>{/each}</tbody></table></div>
   <footer class="muscle-bonuses"><span class="field-label">肌群加成</span><div>{#each ms.bonuses as bonus}<span>{bonus.name}<b>+{bonus.value}</b></span>{:else}<span>暂无</span>{/each}</div></footer></div>
  {/if}
 </section>
 {/if}
</div>

{#if pickerOpen}
<div id="combat-loadout-picker" class="combat-loadout-overlay">
 <div bind:this={pickerRoot} class="picker" class:muscle-picker={p.kind==='muscles'||p.kind==='passive'} class:muscle-group-picker={p.kind==='muscles'} role="dialog" aria-modal="true" aria-labelledby="combat-picker-title" tabindex="-1" data-ui-owner="svelte">
  <header class="picker-head"><h2 id="combat-picker-title">{p.title}{#if p.kind==='muscles'}<small>肌肉</small>{/if}</h2>{#if p.kind==='muscles'}<div class="muscle-head-count"><span>已解锁</span><strong>{p.count}<small> / {p.total}</small></strong></div>{/if}<button class="close" aria-label="关闭选择面板" onclick={()=>controller.closePicker()}>×</button></header>
  {#if p.kind==='muscles'}
   <div class="muscle-detail-body"><div class="muscle-detail-track" role="progressbar" aria-label={p.title+'解锁进度'} aria-valuemin="0" aria-valuemax={p.total} aria-valuenow={p.count}><i style:width={(p.total?p.count/p.total*100:0)+'%'}></i></div>
    <ul class="muscle-list" class:paged={p.pages>1}>{#each p.items as m (m.id)}<li data-muscle={m.id}><div class="muscle-tile" class:unlocked={m.unlocked} aria-label={m.fullName+'成长进度'}>{@render muscleContents(m)}</div></li>{/each}</ul>
    <footer class="muscle-detail-footer"><div class="muscle-slot-summary" class:ready={p.complete}>{#if p.complete}<span class="slot-indicator" aria-hidden="true">◇</span><button onclick={()=>show('passive',p.id)}>{p.passive||'配置被动'} <span aria-hidden="true">↗</span></button>{:else}{@render lockIcon()}<span>被动槽</span><small>全通后开放</small>{/if}</div>{#if p.pages>1}<nav class="muscle-pagination" aria-label="肌肉列表分页"><button aria-label="上一页肌肉" disabled={p.page===0} onclick={()=>controller.page(-1)}>‹</button><span>{p.page+1}<small> / {p.pages}</small></span><button aria-label="下一页肌肉" disabled={p.page>=p.pages-1} onclick={()=>controller.page(1)}>›</button></nav>{/if}</footer>
   </div>
  {:else if p.kind==='passive'}
   <div class="muscle-passive-list">{#each p.items as item (item.id)}<article class="passive-option" class:active={item.selected}><div><h3>{item.name}</h3><p>{item.description}</p></div><button class="primary" disabled={item.disabled} data-passive={item.id} data-session={p.session} data-intent={item.action} onclick={e=>controller.passive(item.id,e.currentTarget.dataset.intent,Number(e.currentTarget.dataset.session))}>{item.actionLabel}</button></article>{:else}<p class="simple-empty">{p.empty}</p>{/each}</div>
  {:else if p.kind==='detail'}
   <div class="loadout-detail"><h3>{p.name} <small>{p.level} 级</small></h3><p>主招式：{p.move}{#if p.multiplier!=null}<span>倍率 ×{p.multiplier}</span>{/if}</p>{#if p.description}<p>{p.description}</p>{/if}</div>
   <footer class="picker-footer"><button class="outlined" onclick={()=>show('skill',p.id)}>更换技能</button>{#if p.skillId}<button class="text-button" id="btn-debug-combat-skill-plus50" title="调试：给当前战斗技能加 50 级" onclick={()=>controller.debug()}>+50级</button>{/if}{#if p.report.length}<button class="text-button" onclick={()=>controller.toggleReport()}>配置校验（{p.report.length}）</button>{/if}</footer>
   {#if p.reportOpen}<ul class="loadout-report">{#each p.report as item}<li>{item.id} · {item.message}</li>{/each}</ul>{/if}
  {:else}
   {#if p.subtitle}<p class="picker-intro">{p.subtitle}</p>{/if}
   <div class="loadout-choices">{#each p.items as item (item.id)}<button class="loadout-choice" class:active={item.selected} disabled={item.disabled} data-pick={item.id} data-session={p.session} onclick={e=>controller.pick(item.id,Number(e.currentTarget.dataset.session))}><span><strong>{item.name}</strong>{#if item.description}<small>{item.description}</small>{/if}</span><span class="choice-meta">{item.meta}{#if item.selected}<small>已装配</small>{/if}</span></button>{:else}<p class="simple-empty">{p.empty}</p>{/each}</div>
   {#if p.canClear}<footer class="picker-footer"><button class="text-button" data-clear-slot data-session={p.session} onclick={e=>controller.pick('',Number(e.currentTarget.dataset.session))}>{p.kind==='hub'?'卸下':'清空'}</button></footer>{/if}
  {/if}
 </div>
</div>
{/if}
