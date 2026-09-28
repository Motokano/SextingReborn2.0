// C prototype: hidden accounting; all progress and inventory remain in memory.
const $=id=>document.getElementById(id);
const catalog=(await (await fetch('../data/item-catalog-v2.json')).json()).items;
const groups=[{id:'stone',name:'土石',need:10,note:'修补灶体与台基'},{id:'wood',name:'木作',need:8,note:'加固支架与外框'}];
// Known-use flags are fixture knowledge, never inferred by exposing hidden categories.
const items=[['ore_clay_raw','stone',2,6,true],['ore_limestone','stone',3,3,true],['ore_granite','stone',5,1,false],['wood_plank_soft','wood',4,3,true],['wood_bamboo_green','wood',2,5,true],['wood_pine','wood',3,2,false]].map(([id,group,points,stock,knownUse])=>({id,group,points,stock,initial:stock,knownUse,template:{item_id:id,...catalog[id].attribute_modules.base.identity}}));
const character={skills:{survival_language:{level:0}}};
const name=i=>window.InventoryEquipment.getDisplayName(i.template,0,character);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected={},progress={stone:0,wood:0},step=0,result=null;
const qty=i=>selected[i.id]||0;
const done=()=>groups.every(g=>progress[g.id]>=g.need);
const chosen=()=>items.filter(i=>i.knownUse&&qty(i)>0);
function condition(g){const p=progress[g.id];if(g.id==='stone')return p===0?'灶体裂着口子，台基也有些松散。':p<g.need?'裂口补上了一部分，台基还不够牢靠。':'裂缝已经填实，台基稳固了。';return p===0?'支架松动，锅架还撑不稳。':p<g.need?'支架比之前稳了些，但还有几处松动。':'支架不再晃动，锅架已经撑稳。';}
function counter(i){const label=esc(name(i));return `<div class="material-slider"><input aria-label="${label}投入数量" data-qty="${i.id}" type="range" step="1" min="0" max="${i.stock}" value="${qty(i)}"><output>投入 ${qty(i)} 件</output></div>`;}
function groupPanel(g){return `<section class="group"><div class="group-head"><h3>${g.note}</h3><p class="muted">${condition(g)}</p></div>${progress[g.id]>=g.need?'<p class="settled">这里已经修好，不必再投入材料。</p>':items.filter(i=>i.knownUse&&i.group===g.id).map(i=>`<div class="row material-row"><div>${esc(name(i))}<small>持有 ${i.stock} 件</small></div>${counter(i)}</div>`).join('')}</section>`;}
function unknown(){return `<details class="unknown"><summary>尚不清楚用途的随身物品</summary><p class="muted">你还不知道这些东西是否适合修补，暂不列入可用材料。</p>${items.filter(i=>!i.knownUse).map(i=>`<div class="receipt-row"><span>${esc(name(i))}</span><span>持有 ${i.stock} 件</span></div>`).join('')}</details>`;}
function summary(){return `<h2>准备投入</h2><div class="summary-list">${chosen().length?chosen().map(i=>`<div class="spread"><span>${esc(name(i))}</span><span>× ${qty(i)}</span></div>`).join(''):'<small>尚未选择材料。</small>'}</div><p class="muted">修补后检查灶台。用不上的整件材料会退回，已完成的修补会保留。</p><button class="primary" data-confirm ${!chosen().length?'disabled':''}>核对并修复</button>`;}
function receipt(label,rows){return `<h3>${label}</h3>${rows.length?rows.map(r=>`<div class="receipt-row"><span>${esc(name(r.item))}</span><span>× ${r.count}</span></div>`).join(''):'<p class="muted">无</p>'}`;}
function render(){
 let content;
 if(result)content=`<section class="repair-result"><div class="eyebrow">修补后的检查</div><h2>${done()?'灶台可以用了':'灶台还需要修补'}</h2>${groups.map(g=>`<p>${condition(g)}</p>`).join('')}<div class="benefit">${done()?'灶体和支架都已稳固，可以生火做饭了。':'还不能放心生火。已经修好的部分会保留，下次可以接着修。'}</div><div class="receipt-columns"><section>${receipt('实际消耗',result.used)}</section><section>${receipt('整件退回',result.returned)}</section></div><p class="muted">退回的材料仍在随身物品中。已用材料内部的余料不另行折算。</p>${!done()?'<button class="primary" data-continue>继续准备材料</button>':''}<details><summary>查看剩余材料</summary>${items.map(i=>`<div class="receipt-row"><span>${esc(name(i))}</span><span>× ${i.stock}</span></div>`).join('')}</details></section>`;
 else content=`<nav class="steps" aria-label="修复步骤">${['修补灶体','加固支架','核对材料'].map((s,n)=>`<button data-step="${n}" class="${step===n?'active':''}" ${step===n?'aria-current="step"':''}>${n+1}. ${s}</button>`).join('')}</nav>${step<2?`<div class="toolbar"><small>选择已知适合${groups[step].name}修补的材料</small><button data-all ${progress[groups[step].id]>=groups[step].need?'disabled':''}>备齐这类材料</button><button data-clear>清空本步</button></div>${groupPanel(groups[step])}${unknown()}<div class="actions">${step?'<button data-step="0">上一步</button>':''}<button class="primary" data-step="${step+1}">${step===0?'继续准备支架材料':'核对材料'}</button></div>`:`<aside>${summary()}</aside><div class="actions"><button data-step="1">返回选材</button></div>`}`;
 $('app').innerHTML=`<div class="window"><header class="heading"><img src="../assets/map/isometric/interactive-devices-v1/stove.png" alt="灶台棋子"><div><div class="eyebrow">藏身处 / 装置修复</div><h1>${done()?'修好的灶台':'修复烹饪台'}</h1><p class="muted">${done()?'灶台已经可以使用。':'修补灶体，重新撑稳支架。'}</p></div><span class="badge">${done()?'可使用':'尚不可用'}</span></header><div class="body"><div class="wizard">${content}</div></div></div>`;
}
// Whole-item settlement: minimize overfill, then number of consumed pieces.
function plan(g){const available=chosen().filter(i=>i.group===g.id),remaining=Math.max(0,g.need-progress[g.id]);if(!remaining)return [];
 const offered=available.reduce((n,i)=>n+qty(i)*i.points,0);if(offered<remaining)return available.map(item=>({item,count:qty(item)}));
 let options=[[]];for(const item of available)options=options.flatMap(a=>Array.from({length:qty(item)+1},(_,count)=>[...a,{item,count}]));
 return options.map(rows=>({rows,value:rows.reduce((n,r)=>n+r.count*r.item.points,0),count:rows.reduce((n,r)=>n+r.count,0)})).filter(a=>a.value>=remaining).sort((a,b)=>a.value-b.value||a.count-b.count)[0].rows.filter(r=>r.count);
}
function repair(){if(done()||!chosen().length||chosen().some(i=>qty(i)>i.stock))return;const used=groups.flatMap(plan),returned=chosen().map(item=>({item,count:qty(item)-(used.find(r=>r.item===item)?.count||0)})).filter(r=>r.count>0);
 for(const r of used){r.item.stock-=r.count;const g=groups.find(g=>g.id===r.item.group);progress[g.id]=Math.min(g.need,progress[g.id]+r.count*r.item.points);}result={used,returned};selected={};render();
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.delta){const i=items.find(i=>i.id===b.dataset.id);selected[i.id]=Math.max(0,Math.min(i.stock,qty(i)+Number(b.dataset.delta)));render();}if(b.hasAttribute('data-all')){for(const i of items.filter(i=>i.knownUse&&i.group===groups[step].id))selected[i.id]=i.stock;render();}if(b.hasAttribute('data-clear')){for(const i of items.filter(i=>i.group===groups[step].id))delete selected[i.id];render();}if(b.hasAttribute('data-step')){step=Number(b.dataset.step);render();}if(b.hasAttribute('data-continue')){result=null;step=groups.findIndex(g=>progress[g.id]<g.need);render();}if(b.hasAttribute('data-confirm'))repair();});
document.addEventListener('input',e=>{if(!e.target.dataset.qty)return;const i=items.find(i=>i.id===e.target.dataset.qty);selected[i.id]=Math.max(0,Math.min(i.stock,Math.floor(Number(e.target.value)||0)));e.target.value=selected[i.id];e.target.nextElementSibling.textContent=`投入 ${selected[i.id]} 件`;});
$('reset').onclick=()=>{selected={};progress={stone:0,wood:0};result=null;step=0;for(const i of items)i.stock=i.initial;render();};

render();
