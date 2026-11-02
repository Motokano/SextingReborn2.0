/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const D=DungeonRuntime,U=RuinsUIIcons,effects=createLootRevealEffects();
let root,near,mini,mapView,mode=null,selected=null,frame=null,timer=null,clock=0,startFraction=0;
let retainedRows=new Map(),rowContext=null;
let taking=false,opening=false,continuous=false,batchQueue=[],reveals=[],lastCell=null,receiptPhase='已到账',drag=null;
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
function btn(label,fn,icon){const b=el('button');b.type='button';if(icon)b.innerHTML=U.svg(icon);if(label)b.append(el('span','',label));b.onclick=fn;return b;}
function iconButton(icon,label,fn){const b=btn('',fn,icon);b.className='du-icon';b.setAttribute('aria-label',label);return b;}
function stop(){clearTimeout(timer);timer=null;cancelAnimationFrame(frame);frame=null;D.cancel();taking=false;opening=false;continuous=false;batchQueue=[];}
function close(options={}){const corpse=mode==='corpse'?selected:null;stop();effects.clearAll();reveals=[];mode=null;selected=null;if(root)root.hidden=true;
 if(!options.silent&&corpse&&D.active())D.windowAction('close',corpse);
 if(!options.silent)D.checkpoint();refresh();
}
function isEntryOpen(){return !!mode&&!D.active();}
function showCheckpoint(){if(!globalThis.DungeonCheckpoint?.canAccess())return false;stop();selected=null;mode='checkpoint';renderModal();root.focus();return true;}
function shell(title){const context=mode+':'+selected;retainedRows=context===rowContext?new Map(Array.from(root.querySelectorAll('[data-reveal-key]')).map(r=>[r.dataset.revealKey,r])):new Map();if(context!==rowContext)effects.clearAll();rowContext=context;root.replaceChildren();const head=el('header','du-head'),body=el('div','du-body');head.append(el('strong','',title));
 root.classList.toggle('du-checkpoint',['checkpoint','chat','tasks'].includes(mode));root.setAttribute('aria-label',title||'地牢准备');
 if(['prepare','bags','chat','tasks'].includes(mode))head.prepend(iconButton('back','返回',showCheckpoint));
 if(['corpse','container','bags','bag','opening'].includes(mode)){const sound=iconButton('point','音效',()=>{});sound.dataset.revealSound='';head.append(sound);}head.append(iconButton('close','关闭',()=>close()));root.append(head,body);root.hidden=false;LOOT_REVEAL_AUDIO.renderButtons();visibility();return body;
}
function note(text){if(!text)return;const state=root.querySelector('.du-state')||el('div','du-state');state.textContent=text;root.querySelector('.du-body')?.append(state);}
function nameOf(it){const ie=InventoryEquipment,t=ie.getItemTemplate(it.item_id),c=ie.getCharacterForDisplay();return t?ie.getDisplayName(t,ie.getItemDisplayTier(it.item_id,c),c):it.item_id;}
function itemRow(it,claimFn,key){const c=D.config().search.rarities[it.rarity]||D.config().search.rarities.common,row=el('div','du-item loot-row rarity-'+it.rarity);
 row.dataset.rarity=it.rarity;row.dataset.revealKey=key;row.style.setProperty('--rarity-color',c.color);row.innerHTML=ItemIcons.forItem(InventoryEquipment.getItemTemplate(it.item_id)||it);
 row.append(el('span','',nameOf(it)),el('small','','×'+it.count));if(claimFn){const b=btn(it.claimed?'已领取':it.taken?'领取 '+(it.count-it.taken):'领取',claimFn);b.disabled=it.claimed||taking;row.append(b);}const previous=retainedRows.get(key);if(previous){const flare=previous.querySelector('.loot-flare');previous.replaceChildren(...row.childNodes);if(flare)previous.append(flare);return previous;}return row;
}
function inventory(body){const strip=el('div','du-inventory');for(const it of [...InventoryEquipment.getPocketArray(),...InventoryEquipment.getVestArray(),...InventoryEquipment.getBackpackArray().slice(0,InventoryEquipment.getBackpackSlots()),...InventoryEquipment.getState().inventory_vehicle]){
 if(!it)continue;const tile=el('div','du-slot');tile.dataset.dungeonRarity=it.dungeon_rarity||'common';tile.title=nameOf(it);tile.innerHTML=ItemIcons.forItem(InventoryEquipment.getItemTemplate(it.item_id)||it);tile.append(el('small','',it.count||1));strip.append(tile);
 }if(strip.children.length)body.append(strip);}
function prepare(){if(!D.canPrepare())return;stop();mode='prepare';const body=shell(''),tickets=D.availableTickets(),clues=D.availableClues();
 const row=(label,values)=>{const r=el('div','du-row'),s=el('select');s.setAttribute('aria-label',label);for(const [value,text]of values){const o=el('option','',text);o.value=value;s.append(o);}r.append(el('label','',label),s);body.append(r);return s;};
 const ticket=row('起始层',[['','第 1 层'],...tickets.map(t=>[t.id,t.name+' · '+t.floor])]);const attributes=el('div','du-attributes');body.append(attributes);
 ticket.onchange=()=>{attributes.replaceChildren();for(const text of tickets.find(t=>t.id===ticket.value)?.attributes||[])attributes.append(el('div','',text));};
 const clue=row('线索',[['','未选择'],...clues.map(c=>[c.id,c.name])]);
 const foot=el('footer','du-foot'),enter=btn('进入',()=>{if(D.enter({ticket:ticket.value,clue:clue.value}))close({silent:true});else note(D.lastError()||'无法进入');},'enter');foot.append(enter);root.append(foot);
 const validate=()=>{const floor=tickets.find(t=>t.id===ticket.value)?.floor||1,c=clues.find(c=>c.id===clue.value);enter.disabled=!!c&&floor>c.floor;};ticket.addEventListener('change',validate);clue.addEventListener('change',validate);root.focus();
}
function start(kind,id,part,repeat=false){if(!D.begin(kind,id,part)){note(D.lastError()||(kind==='harvest'&&D.threat()?'遭遇敌人':kind==='harvest'&&Survival.getStamina()<RuinsHarvest.cost(D.getSim(),D.find(id))?'体力不足':'无法使用'));return false;}
 continuous=repeat;renderModal();cycle();return true;
}
function tickMs(){return D.getPending()?.kind==='harvest'?D.config().harvest.tickMs:D.config().search.tickMs;}
function cycle(){cancelAnimationFrame(frame);clock=performance.now();startFraction=D.progressState()?.fraction||0;frame=requestAnimationFrame(step);}
function step(time){if(document.hidden){pause();return;}const a=D.getPending();if(!a)return;const f=Math.min(1,startFraction+(time-clock)/tickMs());D.setProgress(f);const q=D.progressState(),bar=root.querySelector('progress');if(bar&&q)bar.value=(q.paid+f)/q.total;
 if(f<1){frame=requestAnimationFrame(step);return;}
 const repeat=continuous,ok=D.completeTick();frame=null;renderModal();const revealed=flushReveals();
 if(!ok){continuous=false;note(D.lastError());return;}
 if(D.getPending()){if(revealed.count)timer=setTimeout(cycle,D.config().search.revealPauseMs||420);else cycle();}
 else if(repeat&&a.kind==='harvest'){timer=setTimeout(()=>start(a.kind,a.id,a.part,true),200);}
}
function pause(){stop();D.checkpoint();renderModal();}
function interrupted(){clearTimeout(timer);cancelAnimationFrame(frame);frame=null;taking=false;opening=false;continuous=false;batchQueue=[];if(root&&!root.hidden)renderModal();}
function openPoint(kind,id){const oldCorpse=mode==='corpse'?selected:null;stop();
 if(kind==='corpse'){if(!D.windowAction(oldCorpse?'switch':'open',id)){note(D.lastError());return;}}
 else if(oldCorpse)D.windowAction('close',oldCorpse);
 mode=kind;selected=id;renderModal();
 const p=D.find(id);if(kind==='container'&&!p?.search.opened)start('search',id);
}
function take(id,index){stop();taking=true;renderModal();timer=setTimeout(()=>{taking=false;D.claim(id,index);renderModal();note(D.lastError());},D.config().search.pickupMs||550);}
function beginOpening(id,queue=[]){if(!DungeonCheckpoint.canAccess())return;stop();selected=id;batchQueue=queue;mode='opening';opening=true;clock=performance.now();startFraction=D.getRecovered().find(b=>b.uid===id)?.openingProgress||0;renderModal();frame=requestAnimationFrame(openStep);}
function openStep(time){if(document.hidden){pause();return;}if(!opening)return;const f=Math.min(1,startFraction+(time-clock)/(D.config().search.bagOpeningMs||800));D.openingProgress(selected,f);const bar=root.querySelector('progress');if(bar)bar.value=f;
 if(f<1){frame=requestAnimationFrame(openStep);return;}frame=null;opening=false;const queue=batchQueue.slice();batchQueue=[];
 if(!D.openBag(selected)){renderModal();note(D.lastError());return;}mode='bag';renderModal();const b=D.getRecovered().find(b=>b.uid===selected);
 for(const key of ['player','npc'])for(const [i,it]of b.allocation[key].entries())reveal(it,b.uid+':'+key+':'+i);const feedback=flushReveals();
 if(queue.length){batchQueue=queue;timer=setTimeout(()=>beginOpening(queue[0],queue.slice(1)),Math.max(D.config().search.bagRevealMs||700,feedback.duration)+100);}
}
function bagList(){if(!DungeonCheckpoint.canAccess())return;stop();mode='bags';renderModal();root.focus();}
function showReceipt(){mode='receipt';receiptPhase='交图中';renderModal();timer=setTimeout(()=>{receiptPhase='结算中';renderModal();timer=setTimeout(()=>{receiptPhase='已到账';renderModal();},450);},450);}
function progressBar(body,value){const p=el('progress','du-progress');p.max=1;p.value=Math.max(0,Math.min(1,value||0));body.append(p);return p;}
function valueChip(icon,text){const e=el('span','du-chip');e.innerHTML=U.svg(icon);e.append(el('span','',text));return e;}
function renderModal(){if(!root||!mode||mode==='prepare')return;
 if(['checkpoint','chat','tasks'].includes(mode)){
  if(!DungeonCheckpoint.canAccess()){close({silent:true});return;}const body=shell(DungeonCheckpoint.title());
  if(mode==='chat'){body.append(el('p','du-dialogue',DungeonCheckpoint.greeting()));return;}
  const menu=el('div','du-menu');body.append(menu);
  if(mode==='tasks'){for(const t of DungeonCheckpoint.tasks()){const row=el('div','du-row');row.append(el('span','',t.name),btn(t.state==='ready'?'交付':'接取',()=>{if(DungeonCheckpoint.task(t.id)){if(!DungeonCheckpoint.tasks().length)showCheckpoint();else renderModal();}else note('未完成');},'check'));menu.append(row);}return;}
  menu.append(btn('进入废墟',prepare,'enter'));if(D.getRecovered().length){const b=btn('回收物品',bagList,'bag'),n=DungeonCheckpoint.outstanding();if(n)b.append(el('small','du-badge',n));menu.append(b);}
  menu.append(btn('交谈',()=>{mode='chat';renderModal();},'chat'));if(DungeonCheckpoint.tasks().length)menu.append(btn('任务',()=>{mode='tasks';renderModal();},'flag'));return;
 }
 if(mode==='exit'){const body=shell('通行口'),s=D.getSim();if(!D.active()){close({silent:true});return;}
  const row=el('div','du-row');row.append(el('span','','第 '+s.map.floor+' 层'),valueChip('potential',D.totals().total));body.append(row);const actions=el('div','du-actions');
  if(s.map.floor<D.config().maxFloor)actions.append(btn('深入第 '+(s.map.floor+1)+' 层',()=>{if(D.descend())close({silent:true});else note(D.lastError());},'descend'));
  actions.append(btn('撤离',()=>{if(D.withdraw())showReceipt();else note(D.lastError());},'exit'));body.append(actions);return;
 }
 if(mode==='receipt'){const r=D.getReceipt(),body=shell(receiptPhase);if(!r)return;const values=el('div','du-values');
  for(const [label,value]of [['探开',r.cells],['倍率','×'+(r.percent/100).toFixed(2)],['潜能','+'+r.total]]){const v=el('div','du-value');v.append(el('span','',label),el('strong','',value));values.append(v);}body.append(values);
  if(receiptPhase==='已到账'&&D.getRecovered().length)body.append(btn('回收',bagList,'bag'));return;
 }
 if(mode==='bags'){const body=shell('回收'),groups=D.getRecovered().reduce((m,b)=>(m.set(b.batch,[...(m.get(b.batch)||[]),b]),m),new Map());
  let num=0;for(const [batch,bags]of groups){body.append(el('div','du-section','第 '+(++num)+' 趟'));const actions=el('div','du-actions'),unopened=bags.filter(b=>!b.opened);
   const all=btn('全部开袋',()=>beginOpening(unopened[0].uid,unopened.slice(1).map(b=>b.uid)),'bag');all.disabled=!unopened.length;
   const claim=btn('全部领取',()=>{D.claimBatch(batch);renderModal();note(D.lastError());},'check');claim.disabled=!bags.some(b=>b.opened&&b.allocation.player.some(i=>!i.claimed));actions.append(all,claim);body.append(actions);
   for(const [i,b]of bags.entries()){const row=el('div','du-row');row.append(el('span','','第 '+(b.floor||1)+' 层 · 封袋 '+(i+1)),btn(b.opened?'查看':b.openingProgress?'继续开袋':'开袋',()=>{if(b.opened){selected=b.uid;mode='bag';renderModal();}else beginOpening(b.uid);},'bag'));body.append(row);}
  }inventory(body);return;
 }
 if(mode==='opening'){const b=D.getRecovered().find(b=>b.uid===selected),body=shell('开袋');if(!b)return;const image=el('img','du-opening-bag');image.src=DungeonCorpseArt.source(true);image.alt='';image.style.animationPlayState=opening?'running':'paused';body.append(image);progressBar(body,b.openingProgress);
  body.append(btn(opening?'暂停':'继续开袋',()=>opening?pause():beginOpening(selected),opening?'pause':'play'));return;
 }
 if(mode==='bag'){const b=D.getRecovered().find(b=>b.uid===selected),body=shell('回收');if(!b?.opened)return;
  const columns=el('div','du-allocation');for(const [key,title]of [['player','你获得'],['npc','NPC 抽成']]){const column=el('section');column.append(el('div','du-section',title));for(const [i,it]of b.allocation[key].entries())column.append(itemRow(it,key==='player'?()=>{D.claimBag(b.uid,i);renderModal();note(D.lastError());}:null,b.uid+':'+key+':'+i));columns.append(column);}body.append(columns);
  if(!b.search.items.length)body.append(el('div','du-state','空'));const actions=el('div','du-actions');actions.append(btn('全部领取',()=>{D.claimBatch(b.batch);renderModal();note(D.lastError());},'check'),btn('返回',bagList,'bag'));
  if(batchQueue.length)actions.append(btn('暂停',()=>{clearTimeout(timer);batchQueue=[];renderModal();},'pause'));body.append(actions);inventory(body);return;
 }
 const p=D.find(selected);if(!p||!D.active()||!D.isAccessible(p)){close({silent:true});return;}const body=shell(p.name||RuinsHarvest.definitions[p.id]?.name||'尸体'),working=!!D.getPending();
 if(mode==='harvest'){
  const art=RuinsHarvestPawns.art(p);if(art){const cv=el('canvas','du-bag-art');cv.width=200;cv.height=220;body.append(cv);RuinsHarvestPawns.draw(cv.getContext('2d'),p,100,195,170);}
  const cost=RuinsHarvest.cost(D.getSim(),p),row=el('div','du-row');row.append(valueChip('stamina',Number(Survival.getStamina().toFixed(2))+'  /  −'+cost),valueChip('clock','1 tick'));body.append(row);
  const actions=el('div','du-actions'),once=btn(working?'停止':p.used?'已采尽':RuinsHarvest.action(p),()=>working?pause():start('harvest',p.uid),working?'pause':'play');once.disabled=p.used;
  const repeat=btn('连续采收',()=>start('harvest',p.uid,null,true),'play');repeat.disabled=p.used||working;actions.append(once,repeat);body.append(actions);
  const last=D.getSim().lastHarvest;if(last?.uid===p.uid){body.append(itemRow({...last.item,rarity:'common'},null,'harvest'));body.append(valueChip('stamina',Number(last.before.toFixed(2))+' → '+Number(last.after.toFixed(2))));}
 }else if(mode==='recovery'){
  const c=D.config().recovery[p.id],q=p.recovery,k=RuinsRecovery.kind(p),row=el('div','du-row');
  const current=k==='water'?Survival.getThirst():k==='stove'?Survival.getSatiety():p.id==='rest'?Survival.getFatigue():null;
  row.append(valueChip(k==='stove'?'food':k==='water'?'water':p.id==='rest'?'fatigue':'medical',p.id==='medical'?Math.round(c.ratio*100)+'%':Number(current.toFixed(1))+'  /  '+(p.id==='rest'?'−':'+')+c.amount),valueChip('clock',q.progress+' / '+c.ticks+' tick'),el('span','du-chip',q.remaining+' / '+c.uses));body.append(row);
  let part=null;if(p.id==='medical'){part=el('select');part.setAttribute('aria-label','治疗部位');for(const [key,v]of Object.entries(RuinsRecovery.parts)){const o=el('option','',v.name+' '+CharacterAttributes.getPartDestroy(key));o.value=key;part.append(o);}if(q.part)part.value=q.part;part.disabled=!!q.part||working;body.append(part);}
  const b=btn(working?'停止':p.used?'已用完':c.action,()=>working?pause():start('recovery',p.uid,part?.value),working?'pause':'play');b.disabled=p.used;body.append(b);
 }else if(mode==='recipe'){
  const image=el('img','du-bag-art');image.src=RuinsInsight.art(p).src;image.alt=p.name;body.append(image);
  if(p.used)body.append(el('div','du-state',p.potentialReward?'已获得潜能：'+p.potentialReward.amount:'已掌握：'+ManufacturingKnowledge.recipe(p.learnedRecipeId).name));
  const empty=!p.used&&!RuinsRecipeStudy.eligible(p).length;
  if(empty){body.append(el('div','du-state','这里的配方已全部掌握'),valueChip('potential','潜能 +'+RuinsRecipeStudy.fallbackPotential(D.getSim())));}
  const b=btn(p.used?(p.potentialReward?'已领取':'已研究'):working?'停止':empty?'研读并获得潜能':'研读资料',()=>working?pause():start('recipe',p.uid),empty?'potential':'play');b.disabled=p.used;body.append(b);
 }else if(mode==='insight'){body.append(el('div','du-value','+'+p.amount));const b=btn(p.used?'已领悟':working?'停止':'领悟',()=>working?pause():start('insight',p.uid),'potential');b.disabled=p.used;body.append(b);
 }else{
  const q=p.search;for(const [i,it]of q.items.entries())if(it.revealed)body.append(itemRow(it,()=>take(p.uid,i),p.uid+':'+i));
  if(q.complete&&!q.items.length)body.append(el('div','du-state','空'));
  if(!q.complete){const b=btn(working?'暂停':q.searchedTicks&&!(q.opened&&q.cursor===0&&q.items.every(it=>!it.ticks))?'继续搜索':'开始搜索',()=>working?pause():start('search',p.uid),'search');b.disabled=taking;body.append(b);}
  if(taking)body.append(el('div','du-state','领取中'));
 }
 const q=D.progressState();let f=q?(q.paid+q.fraction)/q.total:0;
 if(!q&&mode==='recipe'&&p.used)f=1;
 if(!q&&mode==='recovery')f=(p.recovery.progress+(p.recovery.fraction||0))/D.config().recovery[p.id].ticks;
 if(!q&&(mode==='corpse'||mode==='container')){const it=p.search.items[p.search.cursor];f=p.search.complete?1:it?(it.ticks+(it.fraction||0))/(it.requiredTicks||D.config().search.rarities[it.rarity].ticks):p.search.fraction||0;}
 progressBar(body,f);if(mode!=='recipe')inventory(body);
}
function reveal(it,key){reveals.push({it,key});}
function flushReveals(){const entries=reveals.splice(0);let duration=0;for(const {key}of entries){const row=Array.from(root.querySelectorAll('[data-reveal-key]')).find(r=>r.dataset.revealKey===key);if(row)duration=Math.max(duration,effects.play(row));}return{count:entries.length,duration};}
function visibility(){if(!mini)return;const foreign=Array.from(document.querySelectorAll('dialog[open],#backpack-panel,#modal-backpack.show')).some(e=>!e.hidden&&e.getClientRects().length>0),hidden=!D.active()||!!mode||foreign;if(mini.hidden!==hidden)mini.hidden=hidden;}
function refresh(){if(!root||globalThis.SaveSystem?.isAtomic?.())return;if(isEntryOpen()&&!DungeonCheckpoint.canAccess()){close({silent:true});return;}
 near.replaceChildren();near.hidden=!D.active();visibility();if(!D.active()){lastCell=null;return;}D.observe();
 if(['corpse','container','harvest','recovery','insight','recipe'].includes(mode)&&(!D.find(selected)||!D.isAccessible(D.find(selected)))){close({silent:true});return;}
 const s=D.getSim(),cell=D.getRun().mapId+':'+s.player.cell,arrived=lastCell!==cell;lastCell=cell;
 if(arrived&&s.player.cell===s.map.exit&&!mode){stop();mode='exit';renderModal();}
 for(const p of D.nearby()){const row=el('div');row.append(el('span','',(p.kind==='corpse'?'尸体 '+(s.corpses.filter(c=>c.cell===p.cell).findIndex(c=>c.uid===p.uid)+1):p.name)||RuinsHarvest.definitions[p.id]?.name||'尸体'));
  if(p.kind==='door')row.append(btn(String(RuinsEncounter.doorCost(s,p)),()=>{D.openDoor(p.cell);},'stamina'));
  else if(p.kind==='exit')row.append(btn('通行',()=>{stop();mode='exit';renderModal();},'arrow'));
  else if(p.kind==='corpse'){row.append(btn('搜刮',()=>openPoint('corpse',p.uid),'search'));const b=btn('标记',()=>{if(D.mark(p.uid)&&mode==='corpse'&&selected===p.uid)close({silent:true});},'flag');b.disabled=p.search.opened||!!D.getPending()||taking;row.append(b);}
  else row.append(btn(p.kind==='harvest'?RuinsHarvest.action(p):p.kind==='container'?'搜索':p.kind==='recipe'?'研读资料':p.kind==='insight'?'领悟':D.config().recovery[p.id].action,()=>openPoint(p.kind,p.uid),'arrow'));near.append(row);
 }near.hidden=!near.children.length;if(!mini.hidden)mapView?.draw();
}
function interactAt(x,y){if(!D.active())return false;const s=D.getSim(),k=y*s.map.width+x,p=D.nearby().find(p=>p.cell===k&&p.kind!=='corpse');if(!p)return false;if(p.kind==='door')D.openDoor(k);else openPoint(p.kind,p.uid);return true;}
function init(){root=el('section','dungeon-ui du-modal');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.tabIndex=-1;root.setAttribute('aria-label','地牢');root.hidden=true;near=el('aside','dungeon-ui du-nearby');mini=el('aside','dungeon-ui du-mini');mini.id='minimap';mini.setAttribute('aria-label','小地图');
 const cv=el('canvas');cv.id='minimap-canvas';const controls=el('div','du-mini-controls');for(const [id,icon,label]of [['out','minus','缩小'],['in','plus','放大'],['fit','fit','已探索范围'],['follow','locate','跟随玩家']]){const b=iconButton(icon,label,()=>{});b.id='minimap-'+id;controls.append(b);}mini.append(cv,controls);document.body.append(root,near,mini);mapView=createRuinsMinimap({getSim:D.getSim});
 root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const items=[...root.querySelectorAll('button:not(:disabled),select:not(:disabled)')];const first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===root)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===root)){e.preventDefault();first?.focus();}}});for(const element of [root,near,mini])for(const type of ['pointerdown','click','dblclick'])element.addEventListener(type,e=>{if(!e.target.closest('[data-reveal-sound]'))e.stopPropagation();});
 root.addEventListener('pointerdown',e=>{if(!e.target.closest('.du-head')||e.target.closest('button'))return;const r=root.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};root.setPointerCapture(e.pointerId);});
 root.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const r=root.getBoundingClientRect();root.style.transform='none';root.style.left=Math.max(8,Math.min(innerWidth-r.width-8,drag.left+e.clientX-drag.x))+'px';root.style.top=Math.max(8,Math.min(innerHeight-r.height-8,drag.top+e.clientY-drag.y))+'px';});root.addEventListener('pointerup',()=>drag=null);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',()=>{stop();D.checkpoint();});
 new MutationObserver(visibility).observe(document.body,{attributes:true,subtree:true,attributeFilter:['open','hidden','class']});refresh();
}
globalThis.DungeonPanel={init,refresh,prepare,openPoint,close,interactAt,reveal,interrupted,showCheckpoint,isEntryOpen};
globalThis.AppBoot=globalThis.AppBoot||{};AppBoot.afterReady=AppBoot.afterReady||[];AppBoot.afterReady.push(init);
})();
