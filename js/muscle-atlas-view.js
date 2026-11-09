// Shared presentation for the formal muscle page and its isolated review.
(function (window) {
'use strict';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const layout = {
  head: {point:[350,94], label:[535,95], route:'M350 226V94'},
  chest: {point:[350,204], label:[151,194], route:'M350 226V174M350 185L296 173M350 185L404 173'},
  abdomen: {point:[350,288], label:[545,258], route:'M350 226V310'},
  lhand: {point:[480,351], label:[551,362], route:'M350 185L410 169L447 252L480 351'},
  rhand: {point:[220,351], label:[149,362], route:'M350 185L290 169L253 252L220 351'},
  lfoot: {point:[403,541], label:[551,541], route:'M350 310L383 340L393 444L403 541L419 587'},
  rfoot: {point:[297,541], label:[149,541], route:'M350 310L317 340L307 444L297 541L281 587'}
};
const shapes = {
  head:['M333 62L350 55L367 62L376 84L370 112L350 126L330 112L324 84Z','M337 132H363L366 148H334Z'],
  chest:['M332 154L348 170V235L309 225L290 181L302 163Z','M368 154L352 170V235L391 225L410 181L398 163Z'],
  abdomen:['M311 235L348 245V305L322 319L311 293Z','M389 235L352 245V305L378 319L389 293Z'],
  rhand:['M291 164L279 169L261 217L264 239L288 215L305 186Z','M258 239L242 256L224 307L234 319L255 281L266 254Z','M222 316L208 335L205 364L216 374L230 355L234 326Z'],
  lhand:['M409 164L421 169L439 217L436 239L412 215L395 186Z','M442 239L458 256L476 307L466 319L445 281L434 254Z','M478 316L492 335L495 364L484 374L470 355L466 326Z'],
  rfoot:['M320 314L346 322L341 362L327 420L311 438L297 419L297 361Z','M303 447L320 445L320 468L309 522L304 562L289 562L288 519Z','M288 572L305 572L304 591L289 608L266 606L273 590Z'],
  lfoot:['M380 314L354 322L359 362L373 420L389 438L403 419L403 361Z','M397 447L380 445L380 468L391 522L396 562L411 562L412 519Z','M412 572L395 572L396 591L411 608L434 606L427 590Z']
};

function createMuscleAtlas({host,M,texts,onClose,onEquip,getProgress=id=>M.getProgress(id)}) {

  let slotId='lhand', groupId='hand_l', muscleId='', view='muscles', back=false, query='', chainQuery='', renderedDetailKey='';
  let composingChainSearch=false;
  let effects=!matchMedia('(prefers-reduced-motion: reduce)').matches, destroyed=false, busy=false, frame=0, lastTime=0, toastTimer,pulseTimer;
  const timers=new Set(), particles=[], root=document.createElement('section');
  root.className='muscle-atlas';root.setAttribute('aria-label','肌肉与动力链');host.replaceChildren(root);
  root.innerHTML=`<canvas class="ma-dust" aria-hidden="true"></canvas>
    <header class="ma-header"><div class="ma-heading"><svg class="ma-heading-emblem" viewBox="0 0 56 56" aria-hidden="true"><circle class="ma-heading-orbit" cx="28" cy="28" r="25"/><path class="ma-heading-braces" d="M8 18L5 28L8 38M48 18L51 28L48 38"/><path class="ma-heading-links" d="M28 13V35M28 22L15 28M28 22L41 28M28 35L21 44M28 35L35 44"/><g class="ma-heading-joints"><path d="M28 6L32 10L28 14L24 10ZM28 18L32 22L28 26L24 22ZM28 29L32 33L28 37L24 33Z"/><circle cx="14" cy="29" r="2.3"/><circle cx="42" cy="29" r="2.3"/><circle cx="20" cy="45" r="2.3"/><circle cx="36" cy="45" r="2.3"/></g></svg><h2 aria-label="肌肉与动力链"><span class="ma-title-main">肌肉</span><span class="ma-title-secondary">动力链</span></h2></div><button class="ma-close" data-close aria-label="关闭肌肉页面"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18"/></svg></button></header>
    <div class="ma-main"><section class="ma-body" aria-label="身体部位"><div class="ma-figure"></div><div class="ma-orientation"><button data-turn aria-label="切换正背面">↻<span>转身</span></button></div></section><aside class="ma-detail" aria-label="部位详情"></aside></div>
    <footer class="ma-footer"><span class="ma-footer-spacer"></span><button data-effects aria-pressed="${effects}">特效 ${effects?'开':'关'}</button></footer><div class="ma-toast" role="status" aria-live="polite"></div>`;
  const $=s=>root.querySelector(s), canvas=$('.ma-dust'),ctx=canvas.getContext('2d');
  let width=0,height=0,dpr=1;
  const resize=new ResizeObserver(()=>{
    width=root.clientWidth;height=root.clientHeight;dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    if(!effects)ctx.clearRect(0,0,width,height);
  });resize.observe(root);
  const dust=Array.from({length:42},(_,i)=>({x:((i*139+17)%997)/997,y:((i*173+61)%991)/991,r:i%6?0.65:1.2,s:.4+(i%4)*.3}));
  function tick(time) {
    frame=0;if(destroyed||!effects||document.hidden)return;
    const dt=Math.min(40,time-lastTime||16);lastTime=time;ctx.clearRect(0,0,width,height);
    dust.forEach((p,i)=>{
      p.y-=dt*.000004*p.s;if(p.y<0)p.y=1;
      ctx.globalAlpha=.11+.19*(1+Math.sin(time*.0008+i))/2;ctx.fillStyle='#d9c088';
      ctx.beginPath();ctx.arc(p.x*width,p.y*height,p.r,0,Math.PI*2);ctx.fill();
    });
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=dt*.000045;ctx.globalAlpha=p.life/p.max;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;frame=requestAnimationFrame(tick);
  }
  function syncEffects(){root.dataset.effects=String(effects);$('button[data-effects]').textContent='特效 '+(effects?'开':'关');$('button[data-effects]').setAttribute('aria-pressed',String(effects));cancelAnimationFrame(frame);frame=0;if(effects&&!document.hidden)frame=requestAnimationFrame(tick);else ctx.clearRect(0,0,width,height);}
  function visibility(){syncEffects();}document.addEventListener('visibilitychange',visibility);
  function later(fn,ms){const timer=setTimeout(()=>{timers.delete(timer);if(!destroyed)fn();},ms);timers.add(timer);return timer;}
  function toast(message){clearTimeout(toastTimer);$('.ma-toast').textContent=message;$('.ma-toast').classList.add('visible');toastTimer=later(()=>$('.ma-toast').classList.remove('visible'),2600);}
  function burst(element,large=false){
    if(!effects||!element)return;
    const a=element.getBoundingClientRect(),b=root.getBoundingClientRect(),x=a.x+a.width/2-b.x,y=a.y+a.height/2-b.y;
    for(let i=0;i<(large?95:40);i++){const angle=Math.random()*Math.PI*2,speed=(large?.12:.05)+Math.random()*.15,life=500+Math.random()*1100;particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life,max:life,size:.8+Math.random()*1.7,color:i%3?'#e1bd74':'#f8edce'});}
    root.classList.remove('ma-pulse');void root.offsetWidth;root.classList.add('ma-pulse');
    clearTimeout(pulseTimer);pulseTimer=later(()=>root.classList.remove('ma-pulse'),1600);
  }
  const pointFor=id=>{const p=layout[id].point;return back?[700-p[0],p[1]]:p;};
  const labelFor=id=>{const p=layout[id].label;return back&&['lhand','rhand','lfoot','rfoot'].includes(id)?[700-p[0],p[1]]:p;};
  function figureHTML(){
    const slots=M.getChainSlots();
    const parts=slots.map(s=>`<g class="ma-anatomy ${s.id===slotId?'selected':''} ${s.unlocked?'complete':''}" data-part="${s.id}">${shapes[s.id].map(d=>`<path d="${d}"/>`).join('')}</g>`).join('');
    const routes=slots.map(s=>`<path class="ma-route ${s.id===slotId?'selected':''} ${s.unlocked?'complete':''}" d="${layout[s.id].route}"/>${s.id===slotId?`<path class="ma-flow" d="${layout[s.id].route}"/>`:''}`).join('');
    const leaders=slots.map(s=>{const[x,y]=pointFor(s.id),[lx,ly]=labelFor(s.id),end=lx>350?lx-40:lx+40;return `<path class="ma-leader ${s.id===slotId?'selected':''}" d="M${x} ${y}L${end+(end>x?-16:16)} ${ly}H${end}"/>`;}).join('');
    const anchors=slots.map(s=>{const[x,y]=pointFor(s.id);return `<g class="ma-anchor ${s.id===slotId?'selected':''} ${s.unlocked?'complete':''}" transform="translate(${x},${y})"><circle class="ma-aura" r="20"/><path d="M0 -9L9 0L0 9L-9 0Z"/><circle r="2.5"/></g>`;}).join('');
    return `<svg class="ma-body-art" viewBox="0 0 700 660" aria-hidden="true"><defs><radialGradient id="ma-halo"><stop stop-color="#9a8551" stop-opacity=".12"/><stop offset="1" stop-color="#9a8551" stop-opacity="0"/></radialGradient><linearGradient id="ma-plane" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#536052" stop-opacity=".48"/><stop offset="1" stop-color="#1d2c25" stop-opacity=".14"/></linearGradient><linearGradient id="ma-lit-plane"><stop stop-color="#bda46b" stop-opacity=".34"/><stop offset="1" stop-color="#695733" stop-opacity=".05"/></linearGradient><filter id="ma-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter></defs><ellipse cx="350" cy="319" rx="278" ry="302" fill="url(#ma-halo)"/>
    <g class="ma-orbits"><circle cx="350" cy="316" r="231"/><circle cx="350" cy="316" r="246" stroke-dasharray="1 12"/><path d="M350 24V38M350 614V630M77 316H90M610 316H623"/><path d="M132 140A280 280 0 0 1 568 140M132 490A280 280 0 0 0 568 490"/></g><g class="ma-etching"><path d="M350 39V619M247 172H453M297 312H403M285 442H415"/></g>
    <g ${back?'transform="translate(700 0) scale(-1 1)"':''}>${parts}<g class="ma-facets"><path d="M350 66V117M336 76L350 92L364 76M305 179L342 191M395 179L358 191M318 250L342 260M382 250L358 260M319 277L342 284M381 277L358 284M310 346L324 368L311 414M390 346L376 368L389 414"/>${back?'<path d="M350 157V307M308 170L331 214L347 190M392 170L369 214L353 190"/>':''}</g>${routes}</g>${leaders}${anchors}</svg>
    <nav class="ma-body-targets" aria-label="七个动力链部位">${slots.map(s=>{const[x,y]=labelFor(s.id),p=M.getPassiveById(M.getEquippedPassiveForSlot(s.id));return `<button class="ma-body-target ${s.id===slotId?'selected':''} ${s.unlocked?'complete':''}" style="--x:${x/7}%;--y:${y/6.6}%" data-slot="${s.id}" aria-pressed="${s.id===slotId}" aria-label="${s.name} ${s.count}/${s.total}"><span class="ma-target-mark" aria-hidden="true"></span><span class="ma-target-title">${esc(s.name)}</span><span class="ma-target-count"><span>${s.count}</span><i aria-hidden="true">/</i><small>${s.total}</small></span>${p?`<span class="ma-target-state">${esc(texts[p.name_key]||p.id)}</span>`:''}</button>`;}).join('')}</nav>`;
  }
  function selectDefaultMuscle(){const ms=M.getMusclesByGroup(groupId);if(!ms.some(m=>m.id===muscleId))muscleId=(ms.find(m=>!M.isUnlocked(m.id))||ms[0])?.id||'';}
  function muscleHTML(slot){
    const groups=M.getGroups(),ms=M.getMusclesByGroup(groupId),m=M.getMuscleById(muscleId),lit=ms.filter(m=>M.isUnlocked(m.id)).length;
    return `<nav class="ma-groups" aria-label="肌群">${slot.groups.map(id=>{const gr=groups.find(g=>g.id===id),all=M.getMusclesByGroup(id);return `<button data-group="${id}" aria-pressed="${id===groupId}" class="${id===groupId?'selected':''}">${esc(gr.name.replace(/^(左|右)/,''))}<small>${all.filter(m=>M.isUnlocked(m.id)).length}/${all.length}</small></button>`;}).join('')}</nav>
    <div class="ma-node-heading"><span>${esc(groups.find(g=>g.id===groupId)?.name)}</span><input data-search aria-label="查找肌肉" placeholder="查找肌肉" value="${esc(query)}"><span>${lit} <i>/ ${ms.length}</i></span></div>
    <div class="ma-node-field" role="group" aria-label="肌肉节点">${ms.map((item,i)=>({item,i})).filter(({item})=>!query||item.name.includes(query)).map(({item,i})=>`<button class="ma-node ${M.isUnlocked(item.id)?'lit':''} ${item.id===muscleId?'selected':''}" style="--progress:${getProgress(item.id)}%;--delay:${i*12}ms" data-muscle="${item.id}" aria-pressed="${item.id===muscleId}" aria-label="${esc(item.name)} ${getProgress(item.id).toFixed(3)}%" title="${esc(item.name)} · ${getProgress(item.id).toFixed(3)}%"><span class="ma-node-diamond"></span><small>${String(i+1).padStart(2,'0')}</small></button>`).join('')||'<span class="ma-no-results" aria-label="无匹配肌肉">—</span>'}</div>
    ${m?`<section class="ma-muscle-info"><h3>${esc(m.name)}</h3><div class="ma-muscle-progress"><strong>${getProgress(m.id).toFixed(3)}<small>%</small></strong><div class="ma-progress-line"><i style="width:${getProgress(m.id)}%"></i></div></div><div class="ma-reward">${esc(M.getEffectsText(m.id))}</div></section>`:''}`;
  }
  function chainHTML(slot){
    const equipped=M.getEquippedPassiveForSlot(slot.id),options=M.getPassives().filter(p=>p.allowed_slots?.includes(slot.id));
    const matching=options.filter(p=>(texts[p.name_key]||p.id).toLowerCase().includes(chainQuery.trim().toLowerCase()));
    return `${options.length?`<div class="ma-chain-tools"><div class="ma-chain-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5"/><path d="m12 12 4.5 4.5"/></svg><input type="search" data-chain-search aria-label="查找动力链" placeholder="查找动力链" autocomplete="off" value="${esc(chainQuery)}"><button data-clear-chain aria-label="清除动力链搜索" ${chainQuery?'':'hidden'}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg></button></div></div>`:''}<div class="ma-passives" role="list" aria-label="动力链被动">${matching.map(p=>{
      const current=equipped===p.id,check=M.canEquipPassive(p.id,slot.id),other=Object.entries(M.getEquippedMap()).find(([id,value])=>id!==slot.id&&value===p.id);
      const unavailable=!current&&!check.ok,name=texts[p.name_key]||p.id,owner=other?M.getChainSlot(other[0]).name:'';
      const mark=current?'<path d="m4 8 3 3 5-6"/>':unavailable?'<rect x="4" y="7" width="8" height="6" rx="1"/><path d="M6 7V5a2 2 0 0 1 4 0v2"/>':'<path d="M8 3v10M3 8h10"/>';
      return `<article class="ma-passive ${current?'equipped':''} ${unavailable?'unavailable':''}" role="listitem"><div class="ma-passive-seal" aria-hidden="true">${passiveIcon(p.id)}</div><h3>${esc(name)}</h3><button data-passive="${current?'':p.id}" data-chain-id="${esc(p.id)}" aria-label="${esc(current?'卸下'+name:owner?name+'已装配于'+owner:'装配'+name)}" ${unavailable?'disabled':''}><svg viewBox="0 0 16 16" aria-hidden="true">${mark}</svg><span>${current?'卸下':owner?esc(owner):'装配'}</span></button></article>`;
    }).join('')||`<div class="ma-chain-empty" role="listitem" aria-label="${options.length?'无匹配动力链':'暂无适用动力链'}">—</div>`}</div>`;
  }
  function passiveIcon(id){
    const paths={
      post_no_second_thought:'<path class="ma-glyph-fill" d="M28 6L13 27H23L20 42L36 20H26Z"/><path d="M11 13L8 17M9 33L6 35M37 11L40 8"/>',
      post_po_xiang:'<path class="ma-glyph-fill" d="M13 10L24 6L35 10L34 28L24 41L14 28Z"/><path d="M26 7L22 17L27 23L21 32L24 41M17 19L20 20M28 20L31 19"/>',
      post_wound_on_wound:'<path d="M11 12L31 38M23 8L38 28M8 26L19 40M10 19L17 15M20 33L27 28M28 20L35 15"/>',
      post_dog_beat_down:'<path class="ma-glyph-fill" d="M24 7V33M16 25L24 34L32 25M10 37L24 42L38 37"/><path d="M12 12V20M36 12V20M8 28L11 30M40 28L37 30"/>'
    };
    return `<svg class="ma-passive-glyph" viewBox="0 0 48 48" aria-hidden="true">${paths[id]||'<path d="M24 8L40 24L24 40L8 24Z"/>'}</svg>`;
  }
  function detailHTML(){
    const slot=M.getChainSlot(slotId);
    return `<nav class="ma-detail-tabs" aria-label="部位内容"><button data-view="muscles" class="${view==='muscles'?'selected':''}" aria-pressed="${view==='muscles'}">肌肉</button><button data-view="chain" class="${view==='chain'?'selected':''}" aria-pressed="${view==='chain'}">动力链 <i>${slot.unlocked?'◆':'◇'}</i></button><button data-view="rewards" class="${view==='rewards'?'selected':''}" aria-pressed="${view==='rewards'}">奖励总览</button></nav><div class="ma-detail-content">${view==='muscles'?muscleHTML(slot):view==='chain'?chainHTML(slot):rewardsHTML()}</div>`;
  }
  function rewardsHTML(){
    const bonus=M.getStatBonus(),names={jingu:'筋骨',flexibility:'柔韧',breath:'呼吸',dexterity:'身手',focus:'专注'};
    const rows=[];
    for(const [id,name] of Object.entries(names)){
      if(bonus.innate[id])rows.push({name:'先天'+name,value:bonus.innate[id],unit:''});
      if(bonus.acquired[id])rows.push({name:'后天'+name,value:bonus.acquired[id],unit:''});
    }
    for(const [map,type,key] of [['skillDamagePercent','limbSkillDamagePercent','limb'],['attackSpeedFlat','limbAttackSpeedFlat','limb'],['attackSpeedPercent','limbAttackSpeedPercent','limb'],['destroyMaxFlat','limbDestroyMaxFlat','limb'],['destroyMaxPercent','limbDestroyMaxPercent','limb'],['acquiredPercent','acquiredAttributePercent','attribute']]){
      for(const [id,delta] of Object.entries(bonus[map]))if(delta)rows.push(M.getEffectDisplay({type,[key]:id,delta}));
    }
    for(const type of ['foodExpPercent','foodBuffDurationTicks','headDamageReductionPercent','stunGainReductionPercent','diqiCapPercent','carryCapacityKg','parryChancePercent'])if(bonus[type])rows.push(M.getEffectDisplay({type,delta:bonus[type]}));
    if(bonus.maxQi)rows.push({name:'底气上限',value:bonus.maxQi,unit:''});
    return `<section class="ma-rewards-overview">${rows.map(d=>`<div><span>${esc(d.name)}</span><b>${d.value>0?'+':''}${d.value}${esc(d.unit)}</b></div>`).join('')||'<p aria-label="尚未获得奖励">—</p>'}</section>`;
  }
  function refresh(){
    if(destroyed)return;selectDefaultMuscle();
    // Keep keyboard focus and the node scroll position across presentation updates.
    const active=root.contains(document.activeElement)?document.activeElement:null;
    const key=active?.dataset,searchAttribute=active?.hasAttribute('data-search')?'data-search':active?.hasAttribute('data-chain-search')?'data-chain-search':null;
    const scroll=$('.ma-node-field')?.scrollTop||0,caret=searchAttribute?active.selectionStart:null;
    const detailKey=slotId+':'+view,detailScroll=renderedDetailKey===detailKey?$('.ma-detail-content')?.scrollTop||0:0;
    $('.ma-figure').innerHTML=figureHTML();$('.ma-detail').innerHTML=detailHTML();
    $('.ma-detail-content').scrollTop=detailScroll;renderedDetailKey=detailKey;
    if($('.ma-node-field'))$('.ma-node-field').scrollTop=scroll;
    if(key)for(const name of ['slot','group','muscle','view'])if(key[name])root.querySelector(`[data-${name}="${CSS.escape(key[name])}"]`)?.focus({preventScroll:true});
    if(key?.chainId)root.querySelector(`[data-chain-id="${CSS.escape(key.chainId)}"]`)?.focus({preventScroll:true});
    if(caret!==null&&$(`[${searchAttribute}]`)){$(`[${searchAttribute}]`).focus({preventScroll:true});$(`[${searchAttribute}]`).setSelectionRange(caret,caret);}
  }
  function searchChains(value){chainQuery=value;const detail=$('.ma-detail-content');if(detail)detail.scrollTop=0;refresh();}
  function click(e){
    e.stopPropagation();
    const part=e.target.closest('[data-part]');
    if(part&&!busy){slotId=part.dataset.part;groupId=M.getChainSlot(slotId).groups[0];muscleId='';query='';chainQuery='';refresh();return;}
    const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.hasAttribute('data-close')){onClose();return;}
    if(busy&&!b.hasAttribute('data-effects'))return;
    if(b.dataset.slot){slotId=b.dataset.slot;groupId=M.getChainSlot(slotId).groups[0];muscleId='';query='';chainQuery='';}
    else if(b.dataset.group){groupId=b.dataset.group;muscleId='';query='';}
    else if(b.dataset.muscle)muscleId=b.dataset.muscle;
    else if(b.dataset.view)view=b.dataset.view;
    else if(b.hasAttribute('data-turn')){back=!back;}
    else if(b.hasAttribute('data-effects')){effects=!effects;syncEffects();return;}
    else if(b.hasAttribute('data-clear-chain')){searchChains('');$('[data-chain-search]')?.focus({preventScroll:true});return;}
    else if(b.hasAttribute('data-passive')){const result=onEquip(slotId,b.dataset.passive||null);if(!result.ok){toast('装配失败');return;}}
    refresh();
  }
  root.addEventListener('click',click);
  root.addEventListener('input',e=>{
    if(e.target.hasAttribute('data-search')){query=e.target.value;refresh();}
    else if(e.target.hasAttribute('data-chain-search')&&!e.isComposing&&!composingChainSearch)searchChains(e.target.value);
  });
  root.addEventListener('compositionstart',e=>{if(e.target.hasAttribute('data-chain-search'))composingChainSearch=true;});
  root.addEventListener('compositionend',e=>{if(e.target.hasAttribute('data-chain-search')){composingChainSearch=false;searchChains(e.target.value);}});
  refresh();syncEffects();
  return {refresh, getSelection:()=>({slotId,muscleId}), setBusy(value){busy=!!value;}, resetSelection(){slotId='lhand';groupId='hand_l';muscleId='';query='';chainQuery='';view='muscles';refresh();}, celebrate(selector,large=false){burst(root.querySelector(selector),large);}, destroy(){destroyed=true;cancelAnimationFrame(frame);timers.forEach(clearTimeout);clearTimeout(toastTimer);clearTimeout(pulseTimer);resize.disconnect();document.removeEventListener('visibilitychange',visibility);root.remove();}};
}

window.MuscleAtlasView={create:createMuscleAtlas};
})(window);
