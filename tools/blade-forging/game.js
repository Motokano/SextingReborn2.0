(() => {
 'use strict';
 const $=id=>document.getElementById(id),catalog=FORGE_CATALOG,levels=catalog.levels;
 const storageKey='blade-forge-free-campaign-v2',sessions=new Map();
 let progress={best:{},current:0},storageAvailable=true;
 try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved?.version===2){
  for(const level of levels){const stars=saved.best?.[level.id];if(Number.isInteger(stars)&&stars>=1&&stars<=3)progress.best[level.id]=stars;}
  if(Number.isInteger(saved.current))progress.current=saved.current;
 }}catch{storageAvailable=false;}
 const unlocked=()=>{let n=1;while(n<levels.length&&progress.best[levels[n-1].id]>=1)n++;return n;};
 let current=Math.max(0,Math.min(progress.current,unlocked()-1)),forge,level,chapter=1,filter='all';
 function saveProgress(){try{localStorage.setItem(storageKey,JSON.stringify({version:2,best:progress.best,current}));storageAvailable=true;}catch{storageAvailable=false;}}
 function updateProgress(){
  const total=Object.values(progress.best).reduce((a,b)=>a+b,0);
  $('campaign-progress').textContent=(current+1)+' / '+levels.length+' · ★ '+total+' / '+levels.length*3;
  $('previous-level').disabled=current===0;$('next-level').disabled=current+1>=unlocked();
  $('result-next').hidden=current+1>=unlocked();
  $('save-status').hidden=storageAvailable;$('save-status').textContent=storageAvailable?'':'无法保存进度';
 }
 function selectLevel(index){
  if(index<0||index>=unlocked())return;
  if(state)sessions.set(current,{state,originalSpecials,seed,mode,selected,selectedEffect,history});
  fx?.destroy();current=index;level=levels[index];forge=createBladeForge(level);chapter=level.tier;
  $('level-meta').textContent=level.id+' / '+catalog.categories[level.category]+' / 第'+level.tier+'章';
  $('level-name').textContent=level.name;

  $('goal-type').textContent={high:'堆分',low:'压分',range:'控分'}[forge.goal.type];$('goal-type').dataset.type=forge.goal.type;
  $('goal-text').textContent=forge.scoreLabel+' '+(forge.goal.type==='high'?'≥ '+forge.goal.min:forge.goal.type==='low'?'≤ '+forge.goal.max:forge.goal.min+'–'+forge.goal.max)+' 分';


  $('score-label').textContent=forge.scoreLabel+'总分';$('region-legend').textContent='计分格';
  buildBoard();fx=createForgeEffects({forge,tiles,canvas:$('forge-fx')});
  const remembered=sessions.get(index);
  if(remembered){({state,originalSpecials,seed,mode,selected,selectedEffect,history}=remembered);render();$('status').textContent='';}
  else {originalSpecials=undefined;newFurnace();}
  progress.current=current;saveProgress();updateProgress();
 }
 function renderCatalog(){
  const count=Object.keys(progress.best).length;
  $('catalog-summary').textContent='6章 · 83件 · 已完成 '+count+' 件 · 已解锁 '+unlocked()+' 件';
  $('chapter-tabs').replaceChildren();
  catalog.chapters.forEach((name,i)=>{const b=document.createElement('button');b.textContent=(i+1)+' · '+name;b.className=chapter===i+1?'active':'';b.setAttribute('aria-pressed',String(chapter===i+1));b.onclick=()=>{chapter=i+1;renderCatalog();};$('chapter-tabs').append(b);});
  document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});
  $('catalog-levels').replaceChildren();
  levels.forEach((part,index)=>{
   if(part.tier!==chapter||filter!=='all'&&part.goal.type!==filter)return;
   const card=document.createElement('button'),f=createBladeForge(part),best=progress.best[part.id]||0,locked=index>=unlocked();
   card.className='level-card'+(index===current?' current':'');card.disabled=locked;card.dataset.level=index;
   const meta=document.createElement('small');meta.textContent=String(index+1).padStart(2,'0')+' / '+part.id+' · '+catalog.categories[part.category];
   const name=document.createElement('strong');name.textContent=part.name;
   const detail=document.createElement('span');detail.textContent=f.goalName+' · '+f.goalText;
   const rating=document.createElement('span');rating.className='catalog-rating';rating.textContent=locked?'未解锁':best?'★'.repeat(best)+'☆'.repeat(3-best):'☆☆☆';
   card.append(meta,name,detail,rating);card.onclick=()=>{$('catalog').close();selectLevel(index);};$('catalog-levels').append(card);
  });
  if(!$('catalog-levels').children.length){const p=document.createElement('p');p.className='muted';p.textContent='本章暂无这类目标。';$('catalog-levels').append(p);}
 }
 const modeNames={light:'轻锤',heavy:'大力锤',cross:'十字锤',quench:'淬火',temper:'回火',finish:'收工'};
 let state,originalSpecials,seed,mode='heavy',selectedEffect='',selected=10,history=[],fx;
 let tiles=[];
 const signed=n=>(n>0?'+':'')+n;
 function randomFrom(seed){return()=>{let n=seed+=0x6D2B79F5;n=Math.imul(n^n>>>15,n|1);n^=n+Math.imul(n^n>>>7,n|61);return ((n^n>>>14)>>>0)/4294967296;};}
 function newFurnace(){
  const previous=JSON.stringify(originalSpecials);
  do{seed=crypto.getRandomValues(new Uint32Array(1))[0];originalSpecials=forge.randomSpecials(randomFrom(seed));}while(JSON.stringify(originalSpecials)===previous);
  restart();$('status').textContent='';
 }
 function restart(){fx?.clear();state=forge.create(originalSpecials,seed);history=[];mode='heavy';selectedEffect='';selected=forge.scoreIndices[0];render();$('status').textContent='';}
 function buildBoard(){
  tiles=[];const board=$('board');board.replaceChildren();board.style.setProperty('--columns',forge.cols);board.dataset.columns=forge.cols;board.setAttribute('aria-label',level.name+'锻造盘面');
  const coordinates=new Map(forge.cells.map((p,i)=>[p.r+','+p.c,i]));
  board.append(document.createElement('span'));
  for(let c=0;c<forge.cols;c++){
   const label=document.createElement('div');label.className='col-label'+(forge.cells.some((p,i)=>p.c===c&&forge.isScoring(i))?' edge-label':'');label.textContent=String.fromCharCode(65+c);board.append(label);
  }
  for(let r=0;r<forge.rows;r++){
   const label=document.createElement('span');label.className='row-label';label.textContent=r+1;board.append(label);
   for(let c=0;c<forge.cols;c++){
    const i=coordinates.get(r+','+c);
    if(i===undefined){const blank=document.createElement('span');blank.className='void';blank.setAttribute('aria-hidden','true');board.append(blank);continue;}
    const button=document.createElement('button');button.className='cell';button.dataset.index=i;button.dataset.cell=forge.cells[i].label;button.type='button';
    for(const name of ['sigil','value','badge','delta','lock','opportunity-badge']){const span=document.createElement('span');span.className=name;span.setAttribute('aria-hidden','true');button.append(span);}
    button.addEventListener('mouseenter',()=>{selected=i;render();});
    button.addEventListener('focus',()=>{selected=i;render();});
    button.addEventListener('click',()=>{selected=i;perform(hammerAction(i));});
    button.addEventListener('keydown',e=>{
     const move={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]}[e.key];if(!move)return;e.preventDefault();
     let nr=r+move[0],nc=c+move[1];
     while(nr>=0&&nr<forge.rows&&nc>=0&&nc<forge.cols){const next=coordinates.get(nr+','+nc);if(next!==undefined){tiles[next].focus();return;}nr+=move[0];nc+=move[1];}
    });
    tiles[i]=button;board.append(button);
   }
  }
 }
 const hammerAction=index=>({kind:mode,index,...(selectedEffect?{effect:selectedEffect}:{})});
 function effectStatus(){return '敲中收取';}
 function renderOpportunity(){
  const op=state.opportunity,card=$('opportunity-card');card.hidden=!op;$('opportunity-panel').hidden=!op||state.finished;

  card.disabled=state.finished;
  if(!op){delete card.dataset.type;delete card.dataset.index;return;}
  const config=forge.opportunityEffects[op.type];card.dataset.type=op.type;card.dataset.index=op.index;
  card.style.setProperty('--opportunity-color',config.color);
  $('opportunity-name').innerHTML=forgeEffectSymbol(op.type);$('opportunity-name').append(forge.cells[op.index].label+' · '+config.name);card.title=forge.opportunityDescription(op);
  $('opportunity-state').textContent=state.values[op.index]===0?'0分':'下一锤';
  $('opportunity-description').textContent=op.type==='warmth'?'落点＋2':'四邻－1';
 }
 function render(){
  const score=forge.score(state),percent=forge.completion(state),stars=forge.stars(state),next=forge.apply(state,hammerAction(selected));

  $('score').textContent=score;$('percent').textContent=percent+'%';$('score-bar').style.width=percent+'%';

  for(const id of ['rating','result-stars']){$(id).setAttribute('aria-label',(id==='rating'?'当前':'本炉')+stars+'星，完成度'+percent+'%');$(id).dataset.stars=stars;$(id).querySelectorAll('[data-star]').forEach(el=>el.classList.toggle('lit',Number(el.dataset.star)<=stars));}
  $('result').classList.toggle('perfect',stars===3);
  $('hammer-left').textContent=state.left.h+' / '+forge.budget.h;
  $('total').textContent=forge.total(state);const locks=state.locked.filter(Boolean).length;$('locks').textContent=locks?'禁敲 '+locks+' 格':'';
  $('light-count').textContent='剩 '+state.left.light+' / '+forge.budget.light+' 次';$('cross-count').textContent='剩 '+state.left.cross+' / '+forge.budget.cross+' 次';
  document.querySelectorAll('[data-mode]').forEach(b=>{const kind=b.dataset.mode;b.classList.toggle('active',kind===mode);b.setAttribute('aria-pressed',String(kind===mode));b.disabled=state.finished||!state.left.h||(kind!=='heavy'&&!state.left[kind]);});
  const held=Object.entries(state.stored).filter(([,count])=>count>0);$('effect-belt').hidden=!held.length;
  $('effect-belt').innerHTML='<span class="effect-caption">已收取</span>'+(held.length?'<button type="button" data-effect="" aria-pressed="'+!selectedEffect+'" class="effect-chip '+(!selectedEffect?'active':'')+'" '+(state.finished||!state.left.h?'disabled':'')+'>不用效果</button>'+held.map(([type,count])=>{const e=forge.effects[type],usable=e.modes.includes(mode);return `<button type="button" data-effect="${type}" class="effect-chip ${selectedEffect===type?'active':''}" style="--effect-color:${e.color}" aria-pressed="${selectedEffect===type}" aria-label="${e.name}，${count}次，${e.summary}${usable?'':'，当前锤法不可用'}" title="${e.description}" ${state.finished||!state.left.h||!usable?'disabled':''}>${forgeEffectSymbol(type)}${e.name} ×${count}<small>${e.summary}</small></button>`;}).join(''):'<span class="effect-empty">'+(state.specials.length?'敲中符印收取':'本炉效果已用完')+'</span>');
  tiles.forEach((tile,i)=>{
   const effect=state.specials.find(e=>e.index===i),delta=next?next.values[i]-state.values[i]:0;
   const opportunity=state.opportunity?.index===i?state.opportunity:null;
   tile.className='cell'+(forge.isScoring(i)?' edge':'')+(selected===i?' selected':'')+(delta?' affected':'')+(effect?' special':'')+(state.locked[i]?' locked':'')+(opportunity?' opportunity':'');
   paintForgeSymbol(tile,effect?.type||opportunity?.type,effect?'collect':'temporary');
   const marker=tile.querySelector('.opportunity-badge');marker.hidden=!opportunity;
   if(opportunity){
    const config=forge.opportunityEffects[opportunity.type];tile.dataset.opportunity=opportunity.type;tile.style.setProperty('--opportunity-color',config.color);
    marker.textContent='';
   }else {delete tile.dataset.opportunity;tile.style.removeProperty('--opportunity-color');marker.textContent='';}
   tile.querySelector('.value').textContent=state.values[i];tile.querySelector('.value').classList.toggle('small',state.values[i]>=1000);
   const badge=tile.querySelector('.badge');badge.hidden=!effect;badge.textContent=effect?forge.effects[effect.type].mark:'';
   if(effect)tile.dataset.special=effect.type;else delete tile.dataset.special;
   const prediction=tile.querySelector('.delta');prediction.hidden=!delta;prediction.textContent=signed(delta);prediction.classList.toggle('negative',delta<0);
   const lock=tile.querySelector('.lock');lock.hidden=!state.locked[i];lock.textContent='×';
   const information=forge.cells[i].label+'，当前'+state.values[i]+(forge.isScoring(i)?'，'+forge.scoreLabel+'计分':'')+(effect?'，'+forge.effects[effect.type].name+'：'+effectStatus(effect):'')+(state.locked[i]?'，不可再锤':'')+(opportunity?'，临时'+forge.opportunityEffects[opportunity.type].name+'，'+forge.opportunityDescription(opportunity):'')+(delta?'，预计变化'+signed(delta):'');
   tile.setAttribute('aria-label',information);tile.title=information;
  });
  $('selection-name').textContent=forge.cells[selected].label+' · '+state.values[selected]+'分';$('selection-kind').textContent=modeNames[mode]+(selectedEffect?' · '+forge.effects[selectedEffect].name:'');

  $('preview-score').textContent=next?'计分 '+score+' → '+forge.score(next)+' · '+forge.completion(next)+'%':state.finished?'已收工':forge.reason(state,hammerAction(selected));$('preview-score').classList.toggle('negative',!!next&&forge.completion(next)<percent);
  for(const kind of ['quench','temper']){
   const after=forge.apply(state,{kind}),remaining=state.left[kind==='quench'?'q':'t'];
   $(kind).disabled=!after;$(kind+'-count').textContent=remaining+'次';
   $(kind+'-preview').textContent=after?'计分 '+signed(forge.score(after)-score):'';
   $(kind).title=after?(kind==='temper'?'回火后每格为'+Math.floor(forge.total(state)/forge.count)+(forge.total(state)%forge.count?'或'+Math.ceil(forge.total(state)/forge.count):'')+'；全盘总量保持'+forge.total(state):'所有'+forge.count+'格各增加1，包括不可再锤的格子。'):'';
  }
  renderOpportunity();
  $('specials').replaceChildren();$('special-panel').hidden=!state.specials.length||state.finished;
  state.specials.forEach(effect=>{
   const config=forge.effects[effect.type],card=document.createElement('button');card.className='special-card';card.dataset.special=effect.type;card.dataset.index=effect.index;
   const heading=document.createElement('span');heading.className='card-heading';
   const name=document.createElement('b');name.innerHTML=forgeEffectSymbol(effect.type);name.append(forge.cells[effect.index].label+' · '+config.name);heading.append(name);card.title=config.description;
   const description=document.createElement('p');description.textContent=config.summary;
   card.append(heading,description);card.addEventListener('click',()=>{selected=effect.index;render();tiles[selected].focus({preventScroll:true});});$('specials').append(card);
  });
  $('finish').disabled=state.finished;$('finish').classList.toggle('ready',percent===100);
  $('result').hidden=!state.finished;
  if(state.finished){
   $('result-title').textContent=level.name+' · '+percent+'%';

   $('result-description').textContent='最佳 '+(progress.best[level.id]||0)+' 星'+(stars&&current+1<levels.length?' · 下一件已解锁':'');
  }
  updateProgress();
  $('undo').disabled=!history.length;

 }
 function perform(action){
  const next=forge.apply(state,action);if(!next){render();$('status').textContent=forge.reason(state,action);return;}
  const opportunityHit=Number.isInteger(action.index)&&state.opportunity?.index===action.index;
  const label=modeNames[action.kind]+(action.index===undefined?'':' '+forge.cells[action.index].label)+(action.effect?' · '+forge.effects[action.effect].name:'')+(opportunityHit?' · '+forge.opportunityEffects[state.opportunity.type].name:''),delta=forge.score(next)-forge.score(state);
  const before=state;history.push({before,label,delta});state=next;if(Number.isInteger(action.index))selectedEffect='';
  if(action.kind==='finish'){const stars=forge.stars(state);if(stars)progress.best[level.id]=Math.max(progress.best[level.id]||0,stars);saveProgress();}
  render();$('status').textContent='';
  if(action.kind==='finish')$('result').scrollIntoView({block:'nearest',behavior:'auto'});
  fx.play(action,before,next);
 }
 document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;if(selectedEffect&&!forge.effects[selectedEffect].modes.includes(mode))selectedEffect='';render();}));
 $('effect-belt').addEventListener('click',event=>{const b=event.target.closest('[data-effect]');if(!b||b.disabled)return;selectedEffect=b.dataset.effect===selectedEffect?'':b.dataset.effect;render();$('effect-belt').querySelector('[data-effect="'+selectedEffect+'"]')?.focus({preventScroll:true});});
 $('quench').addEventListener('click',()=>perform({kind:'quench'}));$('temper').addEventListener('click',()=>perform({kind:'temper'}));$('finish').addEventListener('click',()=>perform({kind:'finish'}));
 $('undo').addEventListener('click',()=>{if(!history.length)return;fx.clear();const entry=history.pop();state=entry.before;selectedEffect='';render();$('status').textContent='';});
 $('restart').addEventListener('click',restart);$('new-furnace').addEventListener('click',newFurnace);$('result-new').addEventListener('click',()=>{newFurnace();document.querySelector('.score-band').scrollIntoView({block:'start',behavior:'auto'});});
 $('opportunity-card').addEventListener('click',()=>{if(!state.opportunity)return;selected=state.opportunity.index;render();tiles[selected].focus({preventScroll:true});});
 $('help-open').addEventListener('click',()=>$('help').showModal());$('help-close').addEventListener('click',()=>$('help').close());
 $('previous-level').addEventListener('click',()=>selectLevel(current-1));$('next-level').addEventListener('click',()=>selectLevel(current+1));
 $('result-next').addEventListener('click',()=>{selectLevel(current+1);document.querySelector('.intro').scrollIntoView({block:'start',behavior:'auto'});});
 $('catalog-open').addEventListener('click',()=>{chapter=level.tier;renderCatalog();$('catalog').showModal();});$('catalog-close').addEventListener('click',()=>$('catalog').close());
 document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;renderCatalog();}));
 selectLevel(current);$('status').textContent='';
})();
