(() => {
 'use strict';
 const $=id=>document.getElementById(id),data=WORKSHOP_DATA;
 const names={hardness:'硬度',toughness:'韧性',deformationResistance:'抗变形',density:'密度'},short={hardness:'硬',toughness:'韧',deformationResistance:'抗',density:'密'};
 const slotNames={front:'前端',side1:'侧一',side2:'侧二',hilt:'手柄'},modeNames={light:'轻锤',heavy:'大力锤',cross:'十字锤',quench:'淬火',temper:'回火'};
 let shop=createWorkshop(data,createBladeForge),fx=null,tiles=[],forge=null,selected=0,mode='heavy',selectedEffect='',toastTimer=0,compared=[],sound=false,audio=null,resetArmed=false;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=(n,d=2)=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:d});
 const fixed=n=>Number(n).toFixed(2),signed=n=>(n>0?'+':'')+num(n),pct=n=>num(n*100)+'%';
 const itemPart=i=>shop.parts.get(i.componentId),recipeText=r=>shop.feedList(r).map(f=>shop.oreName(f.id)+' '+f.count+'份').join(' · ');
 const categories=data.categories;
 function toast(text){if(!text)return;$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
 function outcome(result,render=true){if(result.message)toast(result.message);if(render)renderView();return result.ok;}
 function shape(part,width=88,height=150){
  const mask=part.level.mask,rows=mask.length,cols=mask[0].length,step=12,scoring=new Set(part.level.scoreIndices);let i=0,rects='';
  mask.forEach((row,r)=>[...row].forEach((v,c)=>{if(v!=='#')return;const gold=scoring.has(i++);rects+=`<rect x="${c*step}" y="${r*step}" width="10" height="10" rx="1.5" fill="${gold?'#dbb977':'#8ba993'}" stroke="${gold?'#f5d9a1':'#c0ceb6'}" stroke-opacity=".6" stroke-width=".5"/>`;}));
  return `<svg class="shape" viewBox="-4 -4 ${cols*step+6} ${rows*step+6}" width="${width}" height="${height}" aria-hidden="true">${rects}</svg>`;
 }
 const palettes=[['#854d39','#bc8260','#645143'],['#40624e','#74a877','#705b3b'],['#696048','#aea17c','#343c38'],['#637474','#a8b4ac','#38484b'],['#a38143','#d1b975','#6d562f'],['#4a5351','#808d83','#2a3934'],['#303b40','#6d807a','#192828'],['#829593','#bfcbc0','#506965'],['#56473d','#938366','#242d28'],['#7b9087','#c0d1bf','#41534e'],['#778e86','#d5e0c7','#465f57'],['#918443','#ded080','#5a623b']];
 function oreArt(id,size=52){const index=data.ores.findIndex(o=>o.id===id),p=palettes[index];return `<svg class="ore-art" width="${size}" height="${size}" viewBox="0 0 70 70" aria-hidden="true"><ellipse cx="35" cy="57" rx="27" ry="6" fill="#07130d" opacity=".5"/><path d="M8 42 18 19 39 10 61 28 62 48 39 58 14 52Z" fill="${p[0]}" stroke="${p[1]}" stroke-width=".8"/><path d="m18 19 21-9-9 25L8 42Z" fill="${p[1]}" opacity=".8"/><path d="m39 10 22 18-19 10-12-3Z" fill="${p[1]}" opacity=".45"/><path d="m30 35 12 3 20 10-23 10-25-6Z" fill="${p[2]}"/><path d="m18 19 12 16 9 23m-9-23 31-7" fill="none" stroke="${p[1]}" opacity=".6"/><path d="m43 23 6-3 4 7-7 5Zm-24 20 4-5 6 7-5 3Z" fill="${p[1]}" opacity=".8"/>${index===8?'<path d="m18 28 29 10m-31 1 28 11" stroke="#202923" stroke-width="4"/>':index===9?'<path d="m29 38 3-24m0 22 10-19m-7 22 17-12" stroke="#dfecdc" stroke-width="2"/>':''}</svg>`;}
 function traitText(t){
  const value=Math.abs(t.value??t.fullStrength),percent=num(value*100),point=num(value);
  const id=t.oreId;
  return ({ore_iron_raw:`本件攻击耐久损耗降低${percent}%`,ore_copper_raw:`本件承担防御时，卸力＋${point}个百分点`,ore_tin_raw:`本件成功格挡时，耐久损耗降低${percent}%`,ore_lead_raw:`本件钝击进入卸力时，对方本段卸力－${point}个百分点`,ore_zinc_raw:`本件打空后，下次本件攻击命中＋${point}个百分点（8tick内）`,ore_titanium_raw:`整武器普通速度修正＋${point}个百分点`,ore_tungsten_raw:`本件劈、刺攻击，对方本次格挡率－${point}个百分点`,ore_molybdenum_raw:`本件攻击与格挡的耐久损耗降低${percent}%`,ore_manganese_raw:`本件成功格挡后，下次本件攻击伤害＋${percent}%（4tick内）`,ore_antimony_raw:`造成实际伤害后，目标格挡率－${point}个百分点，持续4tick`,ore_silver_raw:`本件攻击命中率＋${point}个百分点`,ore_gold_raw:`本件剩余耐久不高于25%且大于0时，耐久损耗降低${percent}%`})[id];
 }
 function traitsHTML(traits){return traits.map(t=>{const ore=shop.ores.get(t.oreId);return `<div class="trait-line"><b>${esc(ore.trait.name)}</b> · ${esc(traitText(t))}</div>`;}).join('');}
 function stat(label,value,suffix=''){return `<div class="preview-stat"><span>${label}</span><b>${value}</b>${suffix?` <small>${suffix}</small>`:''}</div>`;}
 function head(kicker,title,description,actions=''){return `<div class="page-head"><div><h1>${title}</h1>${description?`<p>${description}</p>`:''}</div>${actions?`<div class="page-head-actions">${actions}</div>`:''}</div>`;}
 function nav(){document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===shop.state.view);b.setAttribute('aria-current',b.dataset.view===shop.state.view?'page':'false');});$('shelf-count').textContent=shop.state.items.length;}
 function navigate(view){
  if(view==='prepare'&&shop.active()){toast('这炉材料已经入炉，请先收工。');return;}
  if(view==='prepare'&&shop.state.session?.finished)shop.leaveFinished();
  if(view==='forge'&&!shop.state.session){toast('先在备料台选好配方并开炉。');return;}
  shop.state.view=view;renderView();window.scrollTo({top:0,behavior:'auto'});
 }
 function renderView(){
  fx?.destroy();fx=null;nav();
  if(shop.state.view==='prepare')renderPrepare();
  else if(shop.state.view==='forge')renderForgeShell();
  else if(shop.state.view==='shelf')renderShelf();
  else renderAssembly();
 }
 function renderPrepare(){
  const p=shop.component(),positions=p.positions.map(x=>x.damageType+' '+x.basePower).join(' / '),qty=shop.count(),ready=shop.readiness();
  const cards=data.ores.map(o=>{const inv=shop.inventory(o.id),n=shop.state.recipe[o.id]||0;return `<article class="ore-card ${n?'in-recipe':''}" data-ore-card="${o.id}"><button class="ore-top" data-ore="${o.id}" aria-label="查看${esc(shop.oreName(o.id))}">${oreArt(o.id)}<span><span class="ore-name">${esc(shop.oreName(o.id))}</span></span></button><div class="ore-stock">原矿 ${inv.raw} 块 · 用料 ${inv.feed} 份</div>${inv.assayed?`<div class="ore-scores">${shop.axes.map(a=>`<span><b>${short[a]}</b>${o.scores[a]}</span>`).join('')}</div>`:''}<div class="ore-actions"><button class="quiet" data-ore="${o.id}">${inv.identified?'加工 / 试料':'观察'}</button><div class="stepper"><button data-feed="${o.id}" data-step="-1" aria-label="减去1份${esc(shop.oreName(o.id))}" ${!n?'disabled':''}>−</button><output>${n}</output><button data-feed="${o.id}" data-step="1" aria-label="投入1份${esc(shop.oreName(o.id))}" ${!inv.identified||n>=inv.feed||qty>=p.capacity?'disabled':''}>＋</button></div></div></article>`;}).join('');
  let recipe=shop.feedList().map(f=>`<div class="recipe-row"><span>${esc(shop.oreName(f.id))}</span><span>${f.count} 份</span></div>`).join('')||'';
  $('main').innerHTML=head('','备料台','')+`<div class="prep-grid"><div class="prep-main"><button type="button" class="panel part-hero" data-catalog aria-label="更换图纸，当前部件：${esc(p.name)}" aria-haspopup="dialog" aria-controls="catalog-dialog"><span class="part-art">${shape(p,100,160)}</span><span class="part-info"><span class="eyebrow">${p.id} / ${categories[p.category]} / 第${p.tier}阶段</span><span class="part-title-row"><strong class="part-name">${esc(p.name)}</strong><span class="meta-tags"><span>${p.category==='M'?'跨位置':'单手'}</span><span>${p.canBlock?'可格挡':'不可格挡'}</span></span></span><span class="stat-inline"><span>结构威力<strong>${positions}</strong></span><span>基重<strong>${p.weight.toFixed(2)} kg</strong></span><span>容量<strong>${p.capacity} 份</strong></span></span></span></button><div class="section-top"><h3>矿料</h3></div><div class="ore-grid">${cards}</div></div><aside class="panel recipe-panel"><div class="panel-head"><h3>配方</h3><span class="eyebrow">${p.id}</span></div><div class="capacity"><span class="tiny muted">已投用料</span><strong>${qty}<small> / ${p.capacity} 份</small></strong></div><div class="capacity-slots">${Array.from({length:p.capacity},(_,i)=>`<i class="${i<qty?'filled':''}"></i>`).join('')}</div><div class="recipe-tools"><button class="small secondary" data-fill>纯铁填满</button><button class="small quiet" data-clear>清空配料</button></div><div class="recipe-list">${recipe}</div><div class="start-area">${qty&&!ready.ok?`<div class="hint-box ${ready.needsAssay?'neutral':'bad'}">${esc(ready.message)}</div>`:''}<button class="primary" data-start ${!ready.ok?'disabled':''}>开炉${qty?' · 扣'+qty+'份':''}</button></div></aside></div>`;
 }
 function openOre(id){shop.state.selectedOre=id;renderOre();if(!$('ore-dialog').open)$('ore-dialog').showModal();}
 function renderOre(){
  const id=shop.state.selectedOre,o=shop.ores.get(id),inv=shop.inventory(id);
  $('ore-dialog-body').innerHTML=`<div class="dialog-head"><div><h2>${esc(shop.oreName(id))}</h2></div><button data-close aria-label="关闭材料窗口">×</button></div><div class="ore-detail-hero">${oreArt(id,105)}<div><p>${esc(inv.identified?o.rawItem.identity.fn:o.rawItem.identity.fn_before)}</p><div class="ore-stock">原矿 ${inv.raw} 块 · 用料 ${inv.feed} 份</div></div></div>${!inv.identified?'<button class="primary" data-lab="identify">辨认 · 不耗料</button>':`<div class="lab-actions"><button data-lab="process" ${!inv.raw?'disabled':''}>加工一块<span>1块原矿 → 4份料</span></button><button data-lab="axes" ${inv.assayed||!inv.feed?'disabled':''}>${inv.assayed?'材性已测得':'材性试验'}<span>${inv.assayed?'已完成':'消耗1份'}</span></button><button data-lab="trait" ${inv.traitKnown||!inv.feed?'disabled':''}>${inv.traitKnown?'试条已验证':'锻制试条'}<span>${inv.traitKnown?'已完成':'消耗1份'}</span></button></div>`}${inv.assayed?`<div class="line-title">材性 / 每份</div><div class="lab-results">${shop.axes.map(a=>`<div><span>${names[a]}</span><b>${o.scores[a]}</b></div>`).join('')}</div>`:''}${inv.traitKnown?`<div class="line-title">固有属性</div><div class="trait-list">${traitsHTML([{...o.trait,oreId:id}])}</div><p class="tiny muted" style="margin-top:10px">三星继承强度＝满额×份数÷容量</p>`:''}<div class="dialog-actions"><button class="secondary" data-close>返回配料</button></div>`;
 }
 function renderCatalog(){
  const category=$('category-filter').value,tier=$('tier-filter').value,q=$('part-search').value.trim().toLowerCase();
  const list=data.components.filter(p=>(category==='all'||p.category===category)&&(tier==='all'||p.tier===+tier)&&(!q||(p.id+' '+p.name).toLowerCase().includes(q)));
  $('catalog-list').innerHTML=list.map(p=>`<button class="catalog-part ${p.id===shop.state.componentId?'current':''}" data-part="${p.id}">${shape(p,45,78)}<span><strong>${esc(p.name)}</strong><small>${p.id} · 第${p.tier}阶段 · ${p.capacity}份</small><small>${p.level.goalType==='high'?'堆分':p.level.goalType==='low'?'压分':'控分'} · ${categories[p.category]}</small></span></button>`).join('')||'<p class="muted">没有匹配的部件。</p>';
 }
 function ratingHTML(id){return `<div id="${id}" class="rating ${id==='result-stars'?'result-stars':''}" role="img">${[1,2,3].map((n)=>`<span data-star="${n}">★<small>${[60,80,100][n-1]}%</small></span>`).join('')}</div>`;}
 function renderForgeShell(){
  const s=shop.state.session;if(!s){shop.state.view='prepare';renderPrepare();return;}
  const p=shop.parts.get(s.componentId);forge=shop.forge();selected=Math.min(selected,forge.count-1);
  $('main').innerHTML=head('锻造台 / 02',esc(p.name),`${esc(recipeText(s.recipe))}`)+`<section class="objective"><span class="goal-chip ${p.level.goalType}">${forge.goalName}</span><div><strong>${forge.scoreLabel}${forge.goalText}</strong></div><span id="goal-guidance"></span></section><section class="score-band"><div class="score-main"><span>${forge.scoreLabel}总分</span><strong id="score"></strong></div><div class="score-progress"><div class="progress-heading"><span id="quality"></span><span id="percent"></span></div><div class="track"><i id="score-bar"></i></div></div>${ratingHTML('rating')}</section><div class="forge-layout"><section class="panel board-panel"><div class="panel-head"><h3>锤法</h3><span id="hammer-budget" class="tiny muted"></span></div><div class="hammer-tools"><button data-mode="light">轻锤<span>落点减半 · <b id="light-left"></b>次</span></button><button data-mode="heavy">大力锤<span>向四邻传分</span></button><button data-mode="cross">十字锤<span>近全额 · 远半额 · <b id="cross-left"></b>次</span></button></div><div id="effect-belt" class="effect-belt" role="group" aria-label="选择本锤效果"></div><div id="board" class="board"></div><div class="board-legend"><i></i>金色格计分</div><div class="board-bottom"><span id="board-total"></span><button class="small quiet" id="undo" data-undo>撤销</button></div><div id="history" class="history"></div></section><aside class="forge-aside"><section class="panel selection"><span class="eyebrow">落锤预览</span><strong id="selection-name"></strong><p id="selection-text"></p><p id="selection-score"></p></section><div class="heat-tools"><button data-heat="quench" id="quench"><b>淬火</b><span id="quench-left"></span><small>全盘＋1</small><small id="quench-preview"></small></button><button data-heat="temper" id="temper"><b>回火</b><span id="temper-left"></span><small>全盘均化 · 总量不变</small><small id="temper-preview"></small></button></div><section class="panel"><div class="panel-head"><h3>待收取</h3></div><div id="specials"></div><div id="opportunity"></div></section><div class="finish-block"><button class="primary" id="finish" data-finish>收工</button></div></aside></div><section class="panel result" id="result" hidden></section>`;
  buildBoard();updateForge();fx=createForgeEffects({forge,tiles,canvas:$('forge-fx')});
 }
 function buildBoard(){
  const board=$('board'),coords=new Map(forge.cells.map((p,i)=>[p.r+','+p.c,i]));board.style.setProperty('--cols',forge.cols);board.dataset.cols=forge.cols;tiles=[];
  board.append(document.createElement('span'));
  for(let c=0;c<forge.cols;c++){const el=document.createElement('span');el.className='col-label'+(forge.cells.some((p,i)=>p.c===c&&forge.isScoring(i))?' gold':'');el.textContent=String.fromCharCode(65+c);board.append(el);}
  for(let r=0;r<forge.rows;r++){
   const row=document.createElement('span');row.className='row-label';row.textContent=r+1;board.append(row);
   for(let c=0;c<forge.cols;c++){
    const i=coords.get(r+','+c);if(i===undefined){board.append(document.createElement('span'));continue;}
    const b=document.createElement('button');b.className='cell';b.dataset.cell=forge.cells[i].label;b.type='button';b.innerHTML='<span class="sigil" aria-hidden="true"></span><span class="value"></span><span class="badge"></span><span class="delta"></span><span class="lock"></span><span class="opportunity-badge"></span>';
    b.addEventListener('mouseenter',()=>{selected=i;updateForge();});b.addEventListener('focus',()=>{selected=i;updateForge();});
    b.addEventListener('click',()=>{selected=i;perform(hammerAction(i));});
    b.addEventListener('keydown',event=>{const d={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]}[event.key];if(!d)return;event.preventDefault();let nr=r+d[0],nc=c+d[1];while(nr>=0&&nr<forge.rows&&nc>=0&&nc<forge.cols){const n=coords.get(nr+','+nc);if(n!==undefined){tiles[n].focus();break;}nr+=d[0];nc+=d[1];}});
    tiles[i]=b;board.append(b);
   }
  }
 }
 function setRating(id,stars){const el=$(id);if(!el)return;el.setAttribute('aria-label',stars+'星');el.querySelectorAll('[data-star]').forEach(s=>s.classList.toggle('lit',+s.dataset.star<=stars));}
 const hammerAction=index=>({kind:mode,index,...(selectedEffect?{effect:selectedEffect}:{})});
 function updateForge(){
  const session=shop.state.session;if(!session||!$('board'))return;const s=session.board,p=shop.parts.get(session.componentId),score=forge.score(s),completion=forge.completion(s),stars=forge.stars(s),preview=forge.apply(s,hammerAction(selected));
  $('score').textContent=score;$('percent').textContent=completion+'%';$('quality').textContent=['未达标','一星','二星','三星完美'][stars];$('score-bar').style.width=completion+'%';$('goal-guidance').textContent=forge.guidance(s);setRating('rating',stars);
  $('hammer-budget').textContent='剩余 '+s.left.h+' / '+forge.budget.h+' 锤';$('light-left').textContent=s.left.light;$('cross-left').textContent=s.left.cross;
  document.querySelectorAll('[data-mode]').forEach(b=>{const k=b.dataset.mode;b.classList.toggle('active',mode===k);b.setAttribute('aria-pressed',String(mode===k));b.disabled=session.finished||!s.left.h||k==='light'&&!s.left.light||k==='cross'&&!s.left.cross;});
  const held=Object.entries(s.stored).filter(([,count])=>count>0);
  $('effect-belt').innerHTML='<span class="effect-caption">储存效果</span>'+(held.length?'<button type="button" data-effect="" aria-pressed="'+!selectedEffect+'" class="effect-chip '+(!selectedEffect?'active':'')+'" '+(s.finished||!s.left.h?'disabled':'')+'>不用效果</button>'+held.map(([type,count])=>{const e=forge.effects[type],usable=e.modes.includes(mode);return `<button type="button" data-effect="${type}" class="effect-chip ${selectedEffect===type?'active':''}" style="--effect-color:${e.color}" aria-pressed="${selectedEffect===type}" aria-label="${e.name}，${count}次，${e.summary}${usable?'':'，当前锤法不可用'}" title="${e.description}" ${s.finished||!s.left.h||!usable?'disabled':''}>${forgeEffectSymbol(type)}${e.name} ×${count}<small>${e.summary}</small></button>`;}).join(''):'<span class="effect-empty">'+(s.specials.length?'敲中符印收取':'本炉效果已用完')+'</span>');
  tiles.forEach((tile,i)=>{
   const effect=s.specials.find(e=>e.index===i),op=s.opportunity?.index===i?s.opportunity:null,delta=preview?preview.values[i]-s.values[i]:0;
   tile.className='cell'+(forge.isScoring(i)?' edge':'')+(i===selected?' selected':'')+(delta?' affected':'')+(s.locked[i]?' locked':'')+(op?' opportunity':'');
   tile.disabled=session.finished;tile.dataset.special=effect?.type||'';tile.querySelector('.value').textContent=s.values[i];tile.querySelector('.badge').textContent=effect?forge.effects[effect.type].mark:'';tile.querySelector('.delta').textContent=delta?signed(delta):'';tile.querySelector('.lock').textContent=s.locked[i]?'×':'';tile.querySelector('.opportunity-badge').textContent='';
   paintForgeSymbol(tile,effect?.type||op?.type,effect?'collect':'temporary');
   tile.querySelector('.value').classList.toggle('small',s.values[i]>=1000);
   if(op)tile.style.setProperty('--opportunity-color',forge.opportunityEffects[op.type].color);
   tile.title=effect?forge.effects[effect.type].name+' · 敲中收取 · '+forge.effects[effect.type].description:op?forge.opportunityEffects[op.type].name+' · '+forge.opportunityDescription(op):'';
   tile.setAttribute('aria-label',forge.cells[i].label+'，'+s.values[i]+'分'+(forge.isScoring(i)?'，计分':'')+(effect?'，'+forge.effects[effect.type].name:'')+(op?'，'+forge.opportunityEffects[op.type].name:'')+(s.locked[i]?'，不可再锤':''));
  });
  $('selection-name').textContent=forge.cells[selected].label+' · '+s.values[selected]+'分 · '+modeNames[mode]+(selectedEffect?' · '+forge.effects[selectedEffect].name:'');
  $('selection-text').hidden=!!preview||session.finished;$('selection-text').textContent=preview?'':forge.reason(s,hammerAction(selected));
  $('selection-score').textContent=preview?'计分 '+score+' → '+forge.score(preview)+' · 完成度 '+forge.completion(preview)+'%':session.finished?'已收工':'';
  for(const kind of ['quench','temper']){const next=forge.apply(s,{kind}),left=s.left[kind==='quench'?'q':'t'];$(kind).disabled=!next;$(kind+'-left').textContent=left+'次';$(kind+'-preview').textContent=next?'完成度 '+forge.completion(next)+'%':session.finished?'已收工':'已用完';}
  $('specials').innerHTML=s.specials.map(e=>`<div class="special-row" title="${forge.effects[e.type].description}"><b>${forgeEffectSymbol(e.type)}${forge.cells[e.index].label} · ${forge.effects[e.type].name}</b><span class="tiny muted"> · 敲中收取</span></div>`).join('');$('specials').parentElement.querySelector('h3').textContent=s.specials.length?'待收取':'临时机会';$('specials').parentElement.hidden=!s.specials.length&&!s.opportunity;
  const op=s.opportunity;$('opportunity').innerHTML=op?`<div class="special-row opportunity-row"><b>${forgeEffectSymbol(op.type)}${forge.cells[op.index].label} · ${forge.opportunityEffects[op.type].name}</b><p>下一锤 · ${op.type==='warmth'?'落点＋2':'邻格－1'}</p></div>`:'';

  $('board-total').textContent='全盘总量 '+forge.total(s)+' · 禁敲 '+s.locked.filter(Boolean).length+' 格';$('undo').disabled=session.finished||!session.history.length;
  $('history').innerHTML=session.history.map(h=>`<span>${modeNames[h.action.kind]}${h.action.index===undefined?'':' '+forge.cells[h.action.index].label}${h.action.effect?' · '+forge.effects[h.action.effect].name:''}</span>`).join('');
  $('finish').disabled=session.finished;$('result').hidden=!session.finished;
  if(session.finished){const item=shop.state.items.find(x=>x.id===session.itemId);$('result').classList.toggle('perfect',item.stars===3);$('result').innerHTML=`<div class="result-top"><div><h2>${esc(p.name)} · ${Math.round(item.completion*100)}%</h2></div>${ratingHTML('result-stars')}</div><div class="result-grid">${stat('成品威力',item.stats.powers.map(x=>num(x.actual)).join(' / '))}${stat('耐久上限',fixed(item.stats.maxDurability))}${stat('重量',num(item.stats.weight,3),'kg')}${stat('先天筋骨',item.stats.strength)}</div>${item.stars===3?`<div class="trait-list" style="margin-top:20px">${traitsHTML(shop.displayTraits(item))}</div>`:'<p class="tiny muted" style="margin-top:17px">未达三星 · 无材料继承</p>'}<div class="dialog-actions"><button class="secondary" data-inspect="${item.id}">成品明细</button><button class="primary" data-to-shelf>部件架</button></div>`;setRating('result-stars',item.stars);}
 }
 function clang(kind){if(!sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const now=audio.currentTime;for(const [frequency,volume,duration] of [[kind==='light'?520:kind==='cross'?170:250,.09,.11],[kind==='light'?1300:920,.035,.24]]){const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(frequency,now);o.frequency.exponentialRampToValueAtTime(frequency*.55,now+duration);g.gain.setValueAtTime(volume,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);o.connect(g).connect(audio.destination);o.start(now);o.stop(now+duration);}}catch{sound=false;$('sound-toggle').textContent='音效：关';}}
 function perform(action){const before=forge.clone(shop.state.session.board),r=shop.strike(action);if(!r.ok){toast(r.message);return;}if(Number.isInteger(action.index))selectedEffect='';updateForge();nav();fx?.play(action,before,shop.state.session.board);if(action.index!==undefined)clang(action.kind);if(action.kind==='finish'){$('result').scrollIntoView({block:'nearest',behavior:'auto'});toast(r.message);}}
 function inspectHTML(item){const p=itemPart(item),m=shop.material(p,item.recipe),known=shop.displayTraits(item);return `<div class="dialog-head"><div><span class="eyebrow">成品验看 / ${p.id}</span><h2>${esc(p.name)} <span style="color:var(--gold)">${'★'.repeat(item.stars)}</span></h2></div><button data-close aria-label="关闭成品明细">×</button></div><p class="tiny muted">完成度 ${Math.round(item.completion*100)}% · ${esc(recipeText(item.recipe))}</p><table class="data-table" style="margin:20px 0"><thead><tr><th>项目</th><th>结构基准</th><th>材料潜力</th><th>实际成品</th></tr></thead><tbody>${item.stats.powers.map(x=>`<tr><td>${x.slot==='side'?'本位':slotNames[x.slot]} · ${x.damageType}</td><td>${x.basePower}</td><td>${num(x.potential)}</td><td>${num(x.actual)}</td></tr>`).join('')}<tr><td>耐久上限</td><td>${fixed(p.durability)}</td><td>${fixed(item.stats.potentialDurability)}</td><td>${fixed(item.stats.maxDurability)}</td></tr><tr><td>重量 kg</td><td>${num(p.weight,3)}</td><td>${num(m.weight,3)}</td><td>${num(item.stats.weight,3)}</td></tr><tr><td>先天筋骨</td><td>${p.strength}</td><td>${m.strength}</td><td>${item.stats.strength}</td></tr><tr><td>材性接触损耗</td><td>1.00 / 2.00</td><td>${fixed(m.lossFactor)} / ${fixed(m.lossFactor*2)}</td><td>${fixed(item.stats.lossFactor)} / ${fixed(item.stats.lossFactor*2)}</td></tr></tbody></table><p class="tiny muted">损耗：接触 / 格挡，未计固有减耗</p>${known.length?'<div class="line-title">继承属性</div><div class="trait-list">'+traitsHTML(known)+'</div>':''}${item.completion<1?'<p class="hint-box neutral" style="margin-top:18px">未达三星 · 无材料继承</p>':''}<div class="dialog-actions"><button class="secondary" data-equip-item="${item.id}">装配</button><button data-close>返回</button></div>`;}
 function showInspect(id){const i=shop.state.items.find(x=>x.id===id);if(!i)return;$('inspect-body').innerHTML=inspectHTML(i);$('inspect-dialog').showModal();}
 function renderShelf(){
  const list=shop.state.items;
  $('main').innerHTML=head('','部件架','','<button class="secondary" data-to-prepare>继续打造</button>')+(list.length?`<div class="shelf-grid">${list.slice().reverse().map(i=>{const p=itemPart(i);return `<article class="panel item-card"><label class="compare-check"><input type="checkbox" data-compare="${i.id}" ${compared.includes(i.id)?'checked':''}>对比</label>${shape(p,120,120)}<span class="eyebrow">${p.id} · 第${p.tier}阶段</span><h3>${esc(p.name)}</h3><div class="stars-text">${'★'.repeat(i.stars)+'☆'.repeat(3-i.stars)} <small class="tiny muted">${Math.round(i.completion*100)}%</small></div><p class="item-stats">威力 ${i.stats.powers.map(x=>num(x.actual)).join(' / ')}<br>耐久 ${fixed(i.stats.maxDurability)} · ${num(i.stats.weight,3)} kg<br>筋骨 ${i.stats.strength}</p><div class="card-actions"><button class="secondary" data-inspect="${i.id}">验看明细</button><button data-equip-item="${i.id}">装配</button></div></article>`;}).join('')}</div><div id="comparison"></div>`:emptyState('暂无部件','','打造部件','prepare'));
  renderComparison();
 }
 function emptyState(title,desc,button,view){return `<section class="empty-state"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 22h40l-8 9H26v6h9v4H13v-4h8v-6h-8zM27 5h13v9H27z"/></svg><h2>${title}</h2>${desc?`<p>${desc}</p>`:''}<button class="primary" data-go="${view}">${button}</button></section>`;}
 function renderComparison(){if(!$('comparison'))return;const items=compared.map(id=>shop.state.items.find(i=>i.id===id)).filter(Boolean);if(items.length<2){$('comparison').innerHTML='';return;}const rows=[['完成度',i=>Math.round(i.completion*100)+'%'],['用料',i=>recipeText(i.recipe)],['本位威力',i=>i.stats.powers.map(x=>x.damageType+' '+num(x.actual)).join(' / ')],['耐久上限',i=>fixed(i.stats.maxDurability)],['重量',i=>num(i.stats.weight,3)+' kg'],['筋骨要求',i=>i.stats.strength]];$('comparison').innerHTML=`<section class="panel compare-panel"><h3>部件对比</h3><table class="data-table"><thead><tr><th>项目</th>${items.map(i=>`<th>${esc(itemPart(i).name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([label,f])=>`<tr><td>${label}</td>${items.map(i=>`<td>${esc(f(i))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;}
 function renderAssembly(){
  const a=shop.assembly(),c=slot=>shop.state.assembly[slot]?'#baac77':'#344e3c',stroke=slot=>shop.state.assembly[slot]?'#eee1b2':'#6b805d';
  const drawing=`<svg viewBox="0 0 600 190" role="img" aria-label="四个攻击部位的单手武器装配示意"><path d="M45 95 105 62V128Z" fill="${c('front')}" stroke="${stroke('front')}"/><path d="M110 61H410V94H110Z" fill="${c('side1')}" stroke="${stroke('side1')}"/><path d="M110 98H410V130H110Z" fill="${c('side2')}" stroke="${stroke('side2')}"/><path d="M418 46H441V81H540V111H441V145H418Z" fill="${c('hilt')}" stroke="${stroke('hilt')}"/><g fill="#b9c8a6" font-size="13" font-family="Microsoft YaHei" text-anchor="middle"><text x="68" y="155">前端</text><text x="254" y="43">侧一</text><text x="254" y="157">侧二</text><text x="500" y="143">手柄</text></g></svg>`;
  const slots=Object.keys(slotNames).map(slot=>{const id=shop.state.assembly[slot],item=shop.state.items.find(i=>i.id===id);return `<div class="slot"><label for="slot-${slot}">${slotNames[slot]}</label><select id="slot-${slot}" data-slot="${slot}"><option value="">选择部件</option>${shop.state.items.filter(i=>shop.slotsFor(itemPart(i),slot).includes(slot)).map(i=>`<option value="${i.id}" ${i.id===id?'selected':''}>${esc(itemPart(i).name)} #${i.id.split('-')[1]} · ${'★'.repeat(i.stars)||'无星'}</option>`).join('')}</select><small>${item?itemPart(item).category==='M'?'共用耐久 '+fixed(item.durability):'本件耐久 '+fixed(item.durability):''}</small></div>`;}).join('');
  const status=!a.complete?'缺少部件':!a.usable?'筋骨不足：低于要求的50%':a.factor<1?'降效：威力 '+pct(a.factor):'可用';
  $('main').innerHTML=head('','装配台','单手 · 距离1','<button class="secondary" data-to-shelf>部件架</button>')+`<div class="assembly-layout"><section class="panel"><div class="assembly-drawing">${drawing}</div><div class="slots-grid">${slots}</div></section><aside class="panel assembly-summary"><label class="strength-input">角色先天筋骨<input id="strength" type="number" min="10" max="100" step="1" value="${shop.state.strength}"></label><div class="preview-stats">${stat('整武器要求',a.strength)}${stat('实际总重',num(a.weight,3),'kg')}${stat('真实部件',a.items.length,'件')}${a.speedKnown?stat('武器速度修正',signed(a.speed),'个百分点'):''}</div><div class="hint-box assembly-result ${a.usable?'':'neutral'}">${status}</div><div class="positions-list"><div class="line-title">位置威力</div>${a.positions.map(pos=>`<div class="recipe-row"><span>${slotNames[pos.slot]}</span><span>${pos.item?pos.damageType+' '+num(pos.power):'—'}</span></div>`).join('')}</div></aside></div>`;
 }
 function autoEquip(id){const item=shop.state.items.find(i=>i.id===id);if(!item)return;const p=itemPart(item),choices=Object.keys(slotNames).filter(s=>shop.slotsFor(p,s).includes(s)),slot=choices.find(s=>!shop.state.assembly[s])||choices[0];const r=shop.equip(id,slot);if($('inspect-dialog').open)$('inspect-dialog').close();if(r.ok)navigate('assembly');toast(r.message);}
 $('main').addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||b.disabled)return;
  if(b.hasAttribute('data-catalog')){renderCatalog();$('catalog-dialog').showModal();}
  else if(b.dataset.ore)openOre(b.dataset.ore);
  else if(b.dataset.feed){const id=b.dataset.feed;outcome(shop.setFeed(id,(shop.state.recipe[id]||0)+Number(b.dataset.step)));}
  else if(b.hasAttribute('data-fill'))outcome(shop.fillIron());
  else if(b.hasAttribute('data-clear')){shop.state.recipe={};renderView();}
  else if(b.hasAttribute('data-start')){if(outcome(shop.start(),false)){mode='heavy';selectedEffect='';selected=0;renderView();window.scrollTo(0,0);}}
  else if(b.hasAttribute('data-effect')){selectedEffect=b.dataset.effect===selectedEffect?'':b.dataset.effect;updateForge();document.querySelector('[data-effect="'+selectedEffect+'"]')?.focus({preventScroll:true});}
  else if(b.dataset.mode){mode=b.dataset.mode;if(selectedEffect&&!forge.effects[selectedEffect].modes.includes(mode))selectedEffect='';updateForge();}
  else if(b.dataset.heat)perform({kind:b.dataset.heat});
  else if(b.hasAttribute('data-undo')){const r=shop.undo();if(r.ok){selectedEffect='';fx?.clear();updateForge();}toast(r.message);}
  else if(b.hasAttribute('data-finish'))perform({kind:'finish'});
  else if(b.hasAttribute('data-to-prepare'))navigate('prepare');
  else if(b.hasAttribute('data-to-shelf'))navigate('shelf');
  else if(b.dataset.inspect)showInspect(b.dataset.inspect);
  else if(b.dataset.equipItem)autoEquip(b.dataset.equipItem);
  else if(b.dataset.go)navigate(b.dataset.go);
 });
 $('main').addEventListener('change',event=>{
  const el=event.target;
  if(el.dataset.slot){const r=shop.equip(el.value,el.dataset.slot);renderAssembly();toast(r.message);}
  else if(el.id==='strength'){shop.state.strength=Math.max(10,Math.min(100,Math.round(Number(el.value)||10)));renderAssembly();}
  else if(el.dataset.compare){if(el.checked&&compared.length>=2){el.checked=false;toast('一次选两件对比。');return;}compared=el.checked?[...compared,el.dataset.compare]:compared.filter(id=>id!==el.dataset.compare);renderComparison();}
 });
 $('ore-dialog').addEventListener('click',event=>{const b=event.target.closest('[data-lab]');if(!b||b.disabled)return;const id=shop.state.selectedOre,kind=b.dataset.lab,r=kind==='identify'?shop.identify(id):kind==='process'?shop.process(id):shop.assay(id,kind);toast(r.message);renderView();renderOre();});
 $('catalog-dialog').addEventListener('click',event=>{const b=event.target.closest('[data-part]');if(!b)return;const r=shop.changeComponent(b.dataset.part);if(r.ok){$('catalog-dialog').close();renderView();document.querySelector('[data-catalog]')?.focus({preventScroll:true});}toast(r.message);});
 $('inspect-dialog').addEventListener('click',event=>{const b=event.target.closest('[data-equip-item]');if(b)autoEquip(b.dataset.equipItem);});
 document.addEventListener('click',event=>{const b=event.target.closest('[data-close]');if(b)b.closest('dialog').close();});
 document.querySelectorAll('.rail [data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
 for(const [id,options] of [['category-filter',Object.entries(categories)],['tier-filter',data.chapters.map((name,i)=>[i+1,'第'+(i+1)+'阶段 · '+name])]])for(const [value,label] of options){const o=document.createElement('option');o.value=value;o.textContent=label;$(id).append(o);}
 for(const id of ['category-filter','tier-filter'])$(id).addEventListener('change',renderCatalog);$('part-search').addEventListener('input',renderCatalog);
 $('help-open').addEventListener('click',()=>{$('help-dialog').showModal();resetArmed=false;$('reset-workshop').textContent='重置本次工坊';});
 $('restock').addEventListener('click',()=>{const r=shop.restock();$('help-dialog').close();renderView();toast(r.message);});
 $('reset-workshop').addEventListener('click',()=>{if(!resetArmed){resetArmed=true;$('reset-workshop').textContent='再次点击，清空本次试玩';return;}shop=createWorkshop(data,createBladeForge);compared=[];selected=0;mode='heavy';selectedEffect='';$('help-dialog').close();renderView();toast('工坊已重置，重新开始这次试玩。');});
 $('sound-toggle').addEventListener('click',()=>{sound=!sound;$('sound-toggle').textContent='音效：'+(sound?'开':'关');if(sound)clang('light');});
 renderView();
})();
