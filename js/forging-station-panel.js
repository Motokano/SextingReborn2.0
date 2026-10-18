(function(g){
 'use strict';
 const S=()=>g.ForgingSystem,F=()=>g.ForgingConfig,$=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let root=null,timer=null,tab='materials',partId='',recipe={},mode='heavy',effect='',forge=null,tiles=[],fx=null,focus=null;
 const labels={materials:'材料',patterns:'图纸',assembly:'装配',repair:'维修'},slots={front:'前端',side1:'侧一',side2:'侧二',hilt:'手柄',whetstone:'磨刀工具',hammer:'锤击工具',pliers:'钳夹工具'};
 function button(text,action,disabled=false){return '<button type="button" data-action="'+action+'"'+(disabled?' disabled':'')+'>'+esc(text)+'</button>';}
 function itemOption(item){return '<option value="'+esc(item.instance_id)+'">'+esc(S().name(item.item_id))+'</option>';}
 function stopTimer(){if(timer){clearInterval(timer);timer=null;}if(root)$('forge-work-toggle')?.setAttribute('aria-pressed','false');}
 function message(text){if(root)$('forge-status').textContent=text||'';}
 function act(result){if(!result.ok){stopTimer();message(result.message);return false;}render();message('');return true;}
 function start(a){if(act(S().start(a)))work();}
 function work(){stopTimer();if(!S().state().job||S().state().job.phase!=='work')return;timer=setInterval(()=>{const result=S().step();if(!result.ok||result.done||result.interrupted)stopTimer();act(result);if(result.interrupted)message('工作已中断。');},500);render();}
 function close(){stopTimer();S().pause();fx?.destroy();fx=null;root?.remove();root=null;focus?.focus();}
 function open(options={}){
  if(root)return true;if(options.repair!==true&&!S().canAccess())return false;
  if(g.CombatEngagement?.isPlayerInCombat())return false;
  focus=document.activeElement;tab=options.repair?'repair':'materials';
  root=document.createElement('div');root.id='forging-station-panel';root.className='forge-overlay';root.role='dialog';root.setAttribute('aria-modal','true');root.setAttribute('aria-label',options.repair?'维修':'铸造台');
  root.innerHTML='<section class="forge-window"><header><h2>铸造台</h2><nav id="forge-tabs"></nav><button type="button" data-action="close" aria-label="关闭">×</button></header><div id="forge-content"></div><footer><span id="forge-status" role="status"></span><span id="forge-level"></span></footer></section>';
  root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('input',e=>{if(e.target.dataset.feed)change(e);});root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){const a=[...root.querySelectorAll('button:not(:disabled),select,input')].filter(x=>x.getClientRects().length);if(e.shiftKey&&document.activeElement===a[0]){e.preventDefault();a.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===a.at(-1)){e.preventDefault();a[0]?.focus();}}});
  document.body.append(root);render();root.querySelector('button').focus();return true;
 }
 function render(){
  if(!root)return;const s=S().snapshot(),job=s.job;
  $('forge-level').textContent='铸造 '+s.level;
  $('forge-tabs').innerHTML=Object.entries(labels).filter(([id])=>s.atStation||id==='repair').map(([id,label])=>'<button type="button" data-tab="'+id+'" aria-pressed="'+(id===tab)+'"'+(job?' disabled':'')+'>'+label+'</button>').join('');
  if(job?.phase==='board'){renderBoard(job);return;}
  if(fx){fx.destroy();fx=null;}forge=null;
  if(job){$('forge-content').innerHTML='<div class="forge-work"><h3>'+esc({craft:'开炉',process:'加工',research:'研究',attach:'安装',detach:'卸下',repair:'维修'}[job.type])+'</h3><progress max="'+job.ticks+'" value="'+job.elapsed+'"></progress><p>'+job.elapsed+' / '+job.ticks+' tick · 体力 '+job.paid.toFixed(1)+' / '+job.stamina.toFixed(1)+'</p>'+button(timer?'暂停':'继续','work')+button(job.type==='craft'?'弃炉':'停止','cancel')+'</div>';return;}
  if(tab==='materials')renderMaterials(s);else if(tab==='patterns')renderPatterns(s);else if(tab==='assembly')renderAssembly(s);else renderRepair(s);
 }
 function renderMaterials(s){
  const grouped=new Map();for(const m of s.materials){if(!grouped.has(m.itemId))grouped.set(m.itemId,{...m,count:0});grouped.get(m.itemId).count+=m.count;}
  $('forge-content').innerHTML='<div class="forge-list">'+[...grouped.values()].map(m=>'<article data-id="'+esc(m.instanceId)+'"><div><strong>'+esc(m.name)+'</strong><small>× '+m.count+'</small><p>'+esc(S().description(m.itemId))+'</p>'+(m.scores?'<small>硬 '+m.scores.hardness+' · 韧 '+m.scores.toughness+' · 抗变形 '+m.scores.deformationResistance+' · 密 '+m.scores.density+'</small>':'')+'</div><div class="forge-row">'+button('辨认','identify',S().identified(m.itemId))+(m.raw?button('检查用途','inspect',m.routeKnown)+button('加工','process',!m.routeKnown):'')+'</div></article>').join('')+'</div>';
 }
 function mini(board){return '<div class="forge-mini" style="grid-template-columns:repeat('+board.mask[0].length+',6px)">'+board.mask.flatMap(row=>[...row].map(c=>'<i style="opacity:'+(c==='#'?1:0)+'"></i>')).join('')+'</div>';}
 function renderPatterns(s){
  const part=s.components.find(p=>p.itemId===partId);if(!part&&s.components.length){partId=s.components[0].itemId;recipe={};}
  const p=s.components.find(p=>p.itemId===partId),samples=s.items.filter(x=>F().components[x.item_id]&&!s.knowledge.structures[F().components[x.item_id].designId]);
  let html='<div class="forge-columns"><div class="forge-list">';
  if(s.components.length)html+='<label>图纸<select id="forge-part">'+s.components.map(p=>'<option value="'+p.itemId+'"'+(p.itemId===partId?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>';
  html+=samples.map(x=>'<article data-id="'+esc(x.instance_id)+'"><strong>'+esc(S().name(x.item_id))+'</strong>'+button('辨认','identify',S().identified(x.item_id))+button('研究 · 消耗样本','research')+'</article>').join('')+'</div><div>';
  if(p){
   html+='<div class="forge-part-card">'+mini(p.board)+'<div><strong>'+esc(p.name)+'</strong><small>容量 '+p.capacity+' 份</small></div></div>';
   const feeds=new Map();for(const m of s.materials.filter(m=>!m.raw&&m.routeKnown)){if(!feeds.has(m.itemId))feeds.set(m.itemId,{...m,count:0});feeds.get(m.itemId).count+=m.count;}
   html+='<div class="forge-list">'+[...feeds.values()].map(m=>'<label>'+esc(m.name)+' <small>× '+m.count+'</small><input type="number" min="0" max="'+Math.min(p.capacity,m.count)+'" step="1" value="'+(recipe[m.itemId]||0)+'" data-feed="'+m.itemId+'" aria-label="'+esc(m.name)+'投料份数"></label>').join('')+'</div><div id="forge-quote"></div>'+button('开炉','craft');
  }
  html+='</div></div>';
  if(s.lastResult?.type==='craft')html+='<div class="forge-result">'+esc(S().name(s.lastResult.itemId))+' · '+s.lastResult.completion+'% <span>'+'★'.repeat(s.lastResult.stars)+'☆'.repeat(3-s.lastResult.stars)+'</span></div>';
  $('forge-content').innerHTML=html;quoteCraft();
 }
 function quoteCraft(){if(!$('forge-quote'))return;const q=S().quote({type:'craft',partId,recipe});$('forge-quote').textContent=q.ok?q.quote.ticks+' tick · 体力 '+q.quote.stamina.toFixed(1):'';}
 function renderAssembly(s){
  const hosts=s.items.filter(x=>x.item_id==='weapon_single_hand_assembly'),parts=s.items.filter(x=>x.forged_component&&!s.items.some(p=>Object.values(p.connections||{}).some(c=>c.part?.instance_id===x.instance_id)));
  let html='<div class="forge-columns"><section><h3>单手武器</h3><label>组合<select id="forge-host"><option value="">新组合</option>'+hosts.map(itemOption).join('')+'</select></label><label>部件<select id="forge-assembly-part">'+parts.map(itemOption).join('')+'</select></label><label>位置<select id="forge-anchor">'+Object.entries(slots).slice(0,4).map(([id,n])=>'<option value="'+id+'">'+n+'</option>').join('')+'</select></label>'+button('安装','attach')+'<div class="forge-list">';
  for(const host of hosts)html+='<article><strong>'+esc(S().name(host.item_id))+'</strong><small>'+g.InventoryEquipment.getItemCombinedWeight(host).toFixed(2)+' kg</small>'+Object.entries(host.connections||{}).map(([slot,c])=>'<div data-host="'+host.instance_id+'" data-anchor="'+slot+'">'+slots[slot]+' · '+esc(S().name(c.part.item_id))+button('卸下','detach')+'</div>').join('')+'</article>';
  html+='</div></section><section><h3>工具包</h3>';
  const kits=s.items.filter(x=>x.item_id==='tool_repair_roll');
  for(const kit of kits){html+='<article><strong>'+esc(S().name(kit.item_id))+'</strong><small>'+g.InventoryEquipment.getItemCombinedWeight(kit).toFixed(2)+' kg</small>';
   for(const [slot,spec] of Object.entries(g.ItemAssembly.getSlotSpecs(kit))){const child=kit.connections?.[slot]?.part;html+='<div class="forge-row" data-host="'+kit.instance_id+'" data-anchor="'+slot+'"><span>'+slots[slot]+'</span>';if(child)html+='<span>'+esc(S().name(child.item_id))+'</span>'+button('取出','tool-detach');else{const tools=s.items.filter(x=>g.ItemAssembly.getPartTypes(x).some(t=>spec.accepts.includes(t))&&!s.items.some(p=>Object.values(p.connections||{}).some(c=>c.part?.instance_id===x.instance_id)));if(tools.length)html+='<select>'+tools.map(itemOption).join('')+'</select>'+button('放入','tool-attach');}html+='</div>';}
   html+='</article>';
  }
  $('forge-content').innerHTML=html+'</section></div>';
 }
 function renderRepair(s){
  const kits=s.items.filter(x=>x.item_id==='tool_repair_roll');
  $('forge-content').innerHTML='<label>工具包<select id="forge-repair-kit">'+kits.map(itemOption).join('')+'</select></label><div class="forge-list">'+s.items.filter(x=>x.forged_component).map(x=>'<article data-id="'+x.instance_id+'"><div><strong>'+esc(S().name(x.item_id))+'</strong><p>'+esc(S().describe(x)).replace(/\n/g,'<br>')+'</p><small data-repair-quote="'+x.instance_id+'"></small></div>'+button('维修','repair',!kits.length||s.inCombat)+'</article>').join('')+'</div>';quoteRepairs();
 }
 function quoteRepairs(){root.querySelectorAll('[data-repair-quote]').forEach(el=>{const r=S().quote({type:'repair',id:el.dataset.repairQuote,kitId:$('forge-repair-kit')?.value});el.textContent=r.ok?r.quote.ticks+' tick · 体力 '+r.quote.stamina.toFixed(1):r.message;el.closest('article').querySelector('[data-action="repair"]').disabled=!r.ok;});}
 function renderBoard(j){
  const p=F().components[j.partId];
  if(!$('forge-board')){
   $('forge-content').innerHTML='<div class="forge-score"><strong id="forge-goal"></strong><span id="forge-percent"></span><progress id="forge-completion" max="100"></progress><b id="forge-stars"></b></div><div class="forge-play"><div><div class="forge-row" id="forge-hammers"></div><div class="forge-board-wrap"><div id="forge-board"></div><canvas id="forge-fx"></canvas></div></div><aside><div class="forge-row" id="forge-heat"></div><div id="forge-stored"></div><div id="forge-pickups"></div>'+button('收工','finish')+'</aside></div>';
   forge=g.createBladeForge(p.board);tiles=[];const board=$('forge-board');board.style.gridTemplateColumns='repeat('+forge.cols+',clamp(30px,calc((100dvh - 380px) / '+forge.rows+'),64px))';
   for(let r=0;r<forge.rows;r++)for(let c=0;c<forge.cols;c++){
    const i=forge.cells.findIndex(v=>v.r===r&&v.c===c),tile=document.createElement(i<0?'i':'button');if(i>=0){tile.type='button';tile.className='cell';tile.dataset.cell=i;tile.innerHTML='<span class="sigil"></span><span class="value"></span><span class="badge"></span><span class="delta"></span><span class="lock"></span><span class="opportunity-badge"></span>';tiles[i]=tile;}board.append(tile);
   }
   fx=g.createForgeEffects?g.createForgeEffects({forge,tiles,canvas:$('forge-fx'),elements:{board:$('forge-board'),rating:$('forge-stars'),score:$('forge-percent'),'effect-belt':$('forge-stored'),'hammer-budget':$('forge-hammers')}}):null;
  }
  const b=j.board,q=forge.completion(b);$('forge-goal').textContent=forge.scoreLabel+' '+forge.goalText+' · '+forge.score(b)+' 分';$('forge-percent').textContent=q+'%';$('forge-completion').value=q;$('forge-stars').textContent='★'.repeat(forge.stars(b))+'☆'.repeat(3-forge.stars(b));
  $('forge-hammers').innerHTML=[['light','轻锤 · '+b.left.light],['heavy','大力锤'],['cross','十字锤 · '+b.left.cross]].map(([id,label])=>'<button type="button" data-mode="'+id+'" aria-pressed="'+(id===mode)+'">'+label+'</button>').join('')+'<small>剩 '+b.left.h+' 锤</small>';
  $('forge-heat').innerHTML=button('淬火 · '+b.left.q,'quench',!b.left.q)+button('回火 · '+b.left.t,'temper',!b.left.t);
  $('forge-stored').innerHTML=Object.entries(b.stored).filter(([,n])=>n>0).map(([type,n])=>'<button type="button" class="forge-effect" data-effect="'+type+'" aria-pressed="'+(type===effect)+'" title="'+esc(forge.effects[type].description)+'">'+g.forgeEffectSymbol(type)+esc(forge.effects[type].name)+' × '+n+'</button>').join('');
  $('forge-pickups').innerHTML=b.specials.map(e=>'<div style="color:'+forge.effects[e.type].color+'">'+g.forgeEffectSymbol(e.type)+forge.cells[e.index].label+' · '+forge.effects[e.type].name+'</div>').join('');
  tiles.forEach((tile,i)=>{const sp=b.specials.find(x=>x.index===i),op=b.opportunity?.index===i?b.opportunity:null,def=sp?forge.effects[sp.type]:op?forge.opportunityEffects[op.type]:null;
   tile.classList.toggle('scoring',forge.isScoring(i));tile.classList.toggle('locked',b.locked[i]);tile.classList.toggle('has-special',!!sp);tile.dataset.effect=sp?.type||op?.type||'';tile.style.setProperty('--effect-color',def?.color||'#d8b56f');tile.querySelector('.value').textContent=b.values[i];g.paintForgeSymbol(tile,sp?.type||op?.type||null,sp?'collect':'temporary');tile.querySelector('.lock').textContent=b.locked[i]?'×':'';tile.title=forge.cells[i].label+(def?' · '+def.name+'：'+def.description:'');tile.setAttribute('aria-label',forge.cells[i].label+' '+b.values[i]+'分'+(def?' '+def.name:''));
  });
 }
 function strike(a){const before=S().state().job?.board,r=S().boardAction(a);if(r.ok&&a.effect)effect='';if(!act(r))return;const after=S().state().job?.board;if(before&&after)fx?.play(a,before,after);}
 function click(e){
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.tab){stopTimer();tab=b.dataset.tab;render();return;}
  if(b.dataset.mode){mode=b.dataset.mode;effect='';render();return;}
  if(b.dataset.cell!==undefined){strike({kind:mode,index:Number(b.dataset.cell),...(effect?{effect}:{})});return;}
  if(b.dataset.effect){effect=effect===b.dataset.effect?'':b.dataset.effect;render();return;}
  const a=b.dataset.action,id=b.closest('[data-id]')?.dataset.id,row=b.closest('[data-host]');
  if(a==='close')close();else if(a==='work'){if(timer){stopTimer();S().pause();render();}else work();}
  else if(a==='cancel'){stopTimer();act(S().cancel());}
  else if(a==='identify')act(S().identify(id));else if(a==='inspect')act(S().inspectOre(id));
  else if(a==='process'||a==='research')start({type:a,id});else if(a==='craft')start({type:'craft',partId,recipe});
  else if(a==='repair')start({type:'repair',id,kitId:$('forge-repair-kit').value});
  else if(a==='attach')start({type:'attach',id:$('forge-assembly-part').value,hostId:$('forge-host').value,anchor:$('forge-anchor').value});
  else if(a==='detach')start({type:'detach',hostId:row.dataset.host,anchor:row.dataset.anchor});
  else if(a==='tool-attach'||a==='tool-detach')act(S().toolAction({type:a,hostId:row.dataset.host,anchor:row.dataset.anchor,id:row.querySelector('select')?.value}));
  else if(['quench','temper','finish'].includes(a)){if(a==='finish')tab='patterns';strike({kind:a});}
 }
 function change(e){if(e.target.id==='forge-part'){partId=e.target.value;recipe={};render();}else if(e.target.dataset.feed){const n=Number(e.target.value);if(Number.isSafeInteger(n)&&n>0)recipe[e.target.dataset.feed]=n;else delete recipe[e.target.dataset.feed];quoteCraft();}else if(e.target.id==='forge-repair-kit')quoteRepairs();}
 g.ForgingStationPanel={open,close,isOpen:()=>!!root,stopTimer,render};
})(window);
