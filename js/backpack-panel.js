/* Shared three-column inventory: equipment, carried storage, interaction target. */
(function(g){
 'use strict';
 const I=()=>g.InventoryEquipment,T=()=>g.InventoryTransfer,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const state={external:null,selected:{},quantity:{},targets:{},detail:false,detailRef:null};
 let adapter,drag=null,suppress=false,signature='',interaction=null,closingInteraction=false;
 const refresh=()=>g.SceneApp.panelApi.changed(),message=r=>g.SceneApp.panelApi.message(r.message,r.ok?'success':'warn');
 function display(x){if((x.sewing||x.sewing_parts)&&g.SewingSystem)return g.SewingSystem.itemName(x);const c=I().getCharacterForDisplay(),t=I().getItemTemplate(x.item_id),book=I().getBookInfo(x);return I().getDisplayName(t,I().getItemDisplayTier(x.item_id,c),c)+(book?' · '+book.label:'');}
 function clear(){state.selected={};state.quantity={};state.detail=false;state.detailRef=null;cancelDrag();const ui=g.SceneApp?.panelApi?.backpackState;if(ui){ui.selectedIndex=-1;ui.equipDetailSlot=null;}}
 function equipped(){if(!closeInteraction())return;clear();state.external=T().context('ground');signature='';}
 function ground(id){if(!closeInteraction())return;clear();state.external=T().context(id?'groundBag':'ground',id);signature='';}
 function restoreInteraction(){const old=interaction;if(!old)return;interaction=null;old.node.classList.remove('bp-docked-container');if(old.next?.parentNode===old.parent)old.parent.insertBefore(old.node,old.next);else old.parent.append(old.node);}
 function closeInteraction(){if(!interaction||closingInteraction)return true;closingInteraction=true;let ok;try{ok=interaction.close?.()!==false;}finally{closingInteraction=false;}if(ok)restoreInteraction();return ok;}
 function attachInteraction(spec){
  if(interaction?.id===spec.id)return true;
  if(!closeInteraction())return false;
  clear();interaction={...spec,parent:spec.node.parentNode,next:spec.node.nextSibling,position:T().position()};signature='';
  spec.node.classList.add('bp-docked-container');g.SceneApp.openBackpackPanel({interaction:true});refresh();return true;
 }
 function endInteraction(id){if(closingInteraction||interaction?.id!==id)return;restoreInteraction();g.SceneApp.closeGroundBackpackView();}
 function interactionValid(){if(!interaction)return false;const p=T().position(),q=interaction.position;return p.mapId===q.mapId&&p.x===q.x&&p.y===q.y&&(!interaction.valid||interaction.valid());}
 function contexts(){return {pocket:T().context('pocket'),backpack:T().context('backpack'),...(I().getState().bound_vehicle_id?{vehicle:T().context('vehicle')}:{}),right:state.external||T().context('ground')};}
 function groundContext(){return state.external?.type==='groundBag'?state.external:null;}
 function refFor(key){const context=contexts()[key];if(!context)return null;const r=T().read(context),index=r.items.findIndex(x=>x?.instance_id===state.selected[key]);return index<0?null:{context,index,item:r.items[index]};}
 function select(key,id){
  const c=contexts()[key],r=T().read(c),index=r.items.findIndex(x=>x?.instance_id===id);if(index<0)return;
  if(c.type==='ground'&&T().isBackpack(r.items[index])){ground(id);refresh();return;}
  state.selected={[key]:id};state.quantity[key]=r.items[index].count??1;state.detail=true;state.detailRef={context:c,id};adapter.select(c,index);refresh();
 }
 function label(key,c){return key==='right'?(c.type==='groundBag'?'地面背包':'脚下物品'):key==='backpack'?'背包':T().labels[key];}
 function destinations(key){return Object.entries(contexts()).filter(([k,c])=>k!==key&&!(interaction&&k==='right')&&T().read(c).capacity>0);}
 function target(key){const options=destinations(key);if(!options.some(([k])=>k===state.targets[key]))state.targets[key]=options.find(([k])=>k==='backpack')?.[0]||options[0]?.[0];return contexts()[state.targets[key]];}
 function transfer(key,to){const r=refFor(key);if(!r)return;const dest=to||target(key);if(!dest)return;message(T().move({from:r.context,to:dest,id:r.item.instance_id,count:state.quantity[key]}));refresh();}
 function quickTransfer(key,id){
  if(interaction&&!interactionValid()){message({ok:false,message:'已离开交互容器。'});refresh();return;}
  const from=contexts()[key],x=T().read(from).items.find(x=>x?.instance_id===id);if(!x)return;
  const a={from,id,count:x.count??1};let result;
  if(key==='right')result=T().quickTake(from,id);
  else if(interaction?.id==='warehouse')result=T().toWarehouse(a);
  else if(interaction?.id==='dungeon'){const to=g.DungeonPanel.storageContext();result=to?T().move({...a,to}):{ok:false,message:'当前容器不可用。'};}
  else result=T().move({...a,to:contexts().right});
  message(result);refreshInteraction();
 }
 function refreshInteraction(){g.HideoutWarehousePanel?.render();g.DungeonPanel?.renderInteraction?.();refresh();}
 function whole(action,key){
  const c=contexts()[key],x=T().read(c).owner;if(!x)return;
  const source=c.type==='groundBag'?'ground':'equipment',index=source==='equipment'?'backpack':I().getGroundItemsAt(c.mapId,c.x,c.y).findIndex(v=>v.instance_id===x.instance_id);
  const result=action==='pickup'?T().move({from:T().context('ground'),to:target('right'),id:x.instance_id,count:1}):g.BackpackSystem.transfer({action,source,index,id:x.instance_id});
  message(result);if(result.ok){clear();if(action==='drop')state.external=T().context('groundBag',x.instance_id);else if(key==='right')state.external=T().context('ground');signature='';}refresh();
 }
 function grid(key,c){
  const r=T().read(c),items=r.items,owner=r.owner,p=owner&&T().isBackpack(owner)&&g.BackpackSystem.profile(owner),capacity=r.capacity;
  const chosen=items.find(x=>x?.instance_id===state.selected[key]);if(!chosen){delete state.selected[key];state.quantity[key]=1;}else state.quantity[key]=Math.min(state.quantity[key]??1,chosen.count??1);
  const title=label(key,c),remaining=c.type==='groundBag'?I().getGroundItemRemainingTicks(c.mapId,owner):null;
  const meta=items.filter(Boolean).length+' / '+(capacity===Infinity?'不限':capacity)+' 格'+(p&&c.type==='backpack'?' · 减重 '+Math.round((1-p.weightFactor)*100)+'%':'')+(remaining==null?'':' · 剩余 '+remaining+' 刻');
  const search=(g.SceneApp.panelApi.backpackState.search||'').trim().toLowerCase(),count=capacity===Infinity?Math.max(key==='right'?12:8,items.length):capacity;
  const slots=Array.from({length:count},(_,index)=>{
   const x=items[index],name=x&&display(x),match=!search||!x||name.toLowerCase().includes(search);
   return x?'<button type="button" class="bp-grid-slot '+(match?'':'bp-search-dim')+'" data-bp-side="'+key+'" data-bp-id="'+esc(x.instance_id)+'" draggable="false" aria-pressed="'+(state.selected[key]===x.instance_id)+'" aria-label="'+esc(name)+'，数量'+(x.count??1)+'"><small>'+(index+1)+'</small><span>'+esc(name)+'</span>'+((x.count??1)>1?'<b>×'+x.count+'</b>':'')+'</button>':'<div class="bp-grid-slot bp-grid-empty"><small>'+(index+1)+'</small></div>';
  }).join('');
  const options=destinations(key);target(key);
  const destination='<select data-bp-target="'+key+'" aria-label="'+title+'转移目的地">'+options.map(([k,v])=>'<option value="'+k+'" '+(state.targets[key]===k?'selected':'')+'>'+esc(label(k,v))+'</option>').join('')+'</select>';
  let controls='';
  if(chosen||key==='right')controls='<div class="bp-grid-controls">'+(chosen?'<label class="bp-grid-quantity">数量 <input type="number" min="1" max="'+(chosen.count??1)+'" value="'+state.quantity[key]+'" data-bp-quantity="'+key+'" aria-label="'+title+'移动数量"></label>':'')+'<div class="bp-grid-actions">'+destination+(chosen?'<button data-bp-transfer="'+key+'">移入</button>':'')+(key==='right'?'<button data-bp-all '+(items.some(Boolean)?'':'disabled')+'>全部取出</button>':'')+'</div></div>';
  if(chosen&&key!=='right'&&I().getBookInfo(chosen)&&g.BookLearning){
   const status=g.BookLearning.checkConsumption({context:c,id:chosen.instance_id});
   controls+='<div class="bp-grid-actions"><button data-bp-consume-book="'+key+'" data-bp-book-id="'+esc(chosen.instance_id)+'" '+(status.ok?'':'disabled title="'+esc(status.message)+'"')+'>'+(status.reason==='max_level'?'已达技能上限':'消耗整本，技能 +1 级')+'</button></div>';
  }
  if(c.type==='groundBag')controls+='<div class="bp-grid-actions"><button data-bp-whole="equip" data-bp-owner="right">'+(I().getState().equipment.backpack?'换上此包':'背上')+'</button><button data-bp-whole="pickup" data-bp-owner="right">整包收起</button></div>';
  if(chosen&&interaction?.id==='warehouse')controls+='<div class="bp-grid-actions"><button data-bp-deposit="'+key+'">存入仓库 →</button></div>';
  if(interaction?.id==='warehouse'&&g.HideoutWarehouse.hasQoL('qol_deposit_all'))controls+='<div class="bp-grid-actions"><button data-bp-deposit-all="'+key+'" '+(items.some(Boolean)?'':'disabled')+'>全部存入仓库 →</button></div>';
  return '<section class="bp-grid-pane bp-pane-'+key+'" aria-label="'+esc(title)+'"><div class="bp-grid-title"><strong>'+esc(title)+'</strong>'+(c.type==='backpack'&&owner?'<button class="bp-small-action" data-bp-whole="drop" data-bp-owner="backpack">整包放下</button>':'')+(c.type==='groundBag'?'<button class="bp-small-action" data-bp-ground>返回脚下</button>':'')+'</div>'+(p?'<div class="bp-container-name">'+esc(display(owner))+'</div>':'')+'<div class="bp-grid-meta">'+meta+'</div>'+(capacity?'<div class="bp-grid-slots" data-bp-zone="'+key+'">'+slots+'</div>':'<div class="bp-grid-unavailable">未装备</div>')+(key==='right'&&!items.some(Boolean)?'<div class="bp-grid-empty-label">'+(c.type==='ground'?'脚下没有物品':'容器为空')+'</div>':'')+controls+(p?'<details class="bp-grid-properties"><summary>背包属性</summary><div>自重 '+p.selfWeight.toFixed(2)+' kg · '+p.slots+' 格</div><div>词条：'+esc(p.affixes.map(id=>g.BackpackSystem.config.affixes[id].name).join('、')||'无')+'</div><div>改造：'+esc(p.modification==='none'?'无':g.BackpackSystem.config.modifications[p.modification].name)+'</div></details>':'')+'</section>';
 }
 function render(node,callbacks){
  adapter=callbacks;const modal=node.closest('#modal-backpack');if(!modal)return;
  if(!state.external)state.external=T().context('ground');
  const alive=!g.Survival?.getState()?.isDead&&!g.Survival?.getState()?.isComa;
  if(!alive||(interaction?!interactionValid():!T().read(state.external).ok)){g.SceneApp.closeGroundBackpackView();return;}
  const all=contexts(),next=JSON.stringify([all,interaction?.id]);if(signature&&signature!==next)clear();signature=next;
  if(state.detailRef&&!T().read(state.detailRef.context).items.some(x=>x?.instance_id===state.detailRef.id)){state.detail=false;state.detailRef=null;}
  if(state.detail&&!state.detailRef&&!g.SceneApp.panelApi.backpackState.equipDetailSlot)state.detail=false;
  const html='<section class="bp-personal-column" aria-label="随身物品"><h4 class="bp-column-title">随身物品</h4>'+grid('pocket',all.pocket)+grid('backpack',all.backpack)+(all.vehicle?grid('vehicle',all.vehicle):'')+'</section><section class="bp-external-column" aria-label="交互物品"><h4 class="bp-column-title">交互物品</h4>'+(interaction?'<div data-bp-interaction'+(interaction.id==='warehouse'?' data-bp-deposit-zone':'')+'></div>':grid('right',all.right))+'</section>';
  node.hidden=false;modal.classList.add('bp-grid-mode');modal.classList.remove('bp-equipment-mode');modal.classList.toggle('bp-detail-selected',state.detail);
  // Keep active inputs and pointer capture stable during unrelated HUD refreshes.
  if(node._bpHtml!==html){cancelDrag();if(interaction)interaction.parent.append(interaction.node);node.innerHTML=html;node._bpHtml=html;}
  if(interaction){const mount=node.querySelector('[data-bp-interaction]');if(interaction.node.parentNode!==mount)mount.append(interaction.node);}
  if(!node._bpBound){bind(node);node._bpBound=true;}
  if(g.BookPanel)g.BookPanel.render(modal,state.detailRef);
 }
 function bind(node){
  node.addEventListener('click',e=>{
   if(!e.ctrlKey||e.button!==0)return;
   const slot=e.target.closest('[data-bp-id]'),warehouse=e.target.closest('[data-bp-warehouse-id]'),loot=e.target.closest('[data-bp-loot-index]'),stored=e.target.closest('[data-bp-stored-id]');
   if(!slot&&!warehouse&&!loot&&!stored)return;
   e.preventDefault();e.stopImmediatePropagation();cancelDrag();
   if(slot)quickTransfer(slot.dataset.bpSide,slot.dataset.bpId);
   else if(warehouse){message(T().fromWarehouse(Number(warehouse.dataset.slotIndex),warehouse.dataset.bpWarehouseId));refreshInteraction();}
   else if(loot)g.DungeonPanel.quickTake(loot.dataset.bpPoint,Number(loot.dataset.bpLootIndex),loot.dataset.bpLootGuard);
   else {const c=g.DungeonPanel.storageContext();if(c){message(T().quickTake(c,stored.dataset.bpStoredId));refreshInteraction();}}
  },true);
  node.addEventListener('dblclick',e=>{if(e.ctrlKey){e.preventDefault();e.stopImmediatePropagation();}},true);
  node.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.dataset.bpId){select(b.dataset.bpSide,b.dataset.bpId);return;}
   if(b.dataset.bpConsumeBook){message(g.BookLearning.consumeFullBook({context:contexts()[b.dataset.bpConsumeBook],id:b.dataset.bpBookId}));refreshInteraction();return;}
   if(b.hasAttribute('data-bp-ground')){ground();refresh();return;}
   if(b.dataset.bpTransfer)transfer(b.dataset.bpTransfer);
   if(b.dataset.bpDeposit){const r=refFor(b.dataset.bpDeposit);if(r){message(T().toWarehouse({from:r.context,id:r.item.instance_id,count:state.quantity[b.dataset.bpDeposit]}));g.HideoutWarehousePanel.render();refresh();}}
   if(b.dataset.bpDepositAll&&interactionValid()){g.HideoutWarehousePanel.act('depositAll',b.dataset.bpDepositAll);refresh();}
   if(b.hasAttribute('data-bp-all')){const to=target('right');if(to)message(T().takeAll(contexts().right,to));refresh();}
   if(b.dataset.bpWhole)whole(b.dataset.bpWhole,b.dataset.bpOwner);
  });
  node.addEventListener('change',e=>{if(e.target.dataset.bpTarget)state.targets[e.target.dataset.bpTarget]=e.target.value;});
  node.addEventListener('input',e=>{if(e.target.dataset.bpQuantity)state.quantity[e.target.dataset.bpQuantity]=Number(e.target.value);});
  node.addEventListener('pointerdown',e=>{
   const b=e.target.closest('[data-bp-id]');if(!b||b.disabled||e.button!==0||!e.isPrimary||e.ctrlKey)return;
   const key=b.dataset.bpSide,from=contexts()[key],x=T().read(from).items.find(x=>x?.instance_id===b.dataset.bpId);if(!x)return;
   const count=state.selected[key]===x.instance_id?state.quantity[key]:(x.count??1);
   if(!Number.isInteger(count)||count<1||count>(x.count??1)){message({ok:false,message:'数量无效。'});return;}
   drag={pointer:e.pointerId,source:b,from,side:key,id:x.instance_id,count,name:display(x),x:e.clientX,y:e.clientY,node};
  });
 }
 function cancelDrag(){const d=drag;drag=null;d?.ghost?.remove();d?.source.classList.remove('bp-drag-source');g.document.querySelectorAll('.bp-drop-ready,.bp-drop-over').forEach(el=>el.classList.remove('bp-drop-ready','bp-drop-over'));if(d?.node.hasPointerCapture?.(d.pointer))d.node.releasePointerCapture(d.pointer);}
 function zone(e){const z=g.document.elementFromPoint?.(e.clientX,e.clientY)?.closest('[data-bp-zone],[data-bp-deposit-zone]');return z&&z.dataset.bpZone!==drag?.side?z:null;}
 g.document.addEventListener('pointermove',e=>{
  const d=drag;if(!d||e.pointerId!==d.pointer)return;
  if(!d.ghost){if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<7)return;d.node.setPointerCapture?.(d.pointer);d.source.classList.add('bp-drag-source');d.node.querySelectorAll('[data-bp-zone]').forEach(z=>{if(z.dataset.bpZone!==d.side)z.classList.add('bp-drop-ready');});d.ghost=g.document.createElement('div');d.ghost.className='bp-drag-ghost';d.ghost.textContent=d.name+' ×'+d.count;g.document.body.append(d.ghost);}
  e.preventDefault();const z=zone(e);g.document.querySelectorAll('.bp-drop-over').forEach(el=>el.classList.remove('bp-drop-over'));z?.classList.add('bp-drop-over');d.ghost.style.left=Math.max(4,Math.min(e.clientX+12,g.innerWidth-d.ghost.offsetWidth-4))+'px';d.ghost.style.top=Math.max(4,Math.min(e.clientY+12,g.innerHeight-d.ghost.offsetHeight-4))+'px';
 },{passive:false});
 g.document.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointer)return;const d=drag,z=zone(e),active=!!d.ghost,to=z&&contexts()[z.dataset.bpZone],warehouse=z?.hasAttribute('data-bp-deposit-zone');cancelDrag();if(!active)return;suppress=true;setTimeout(()=>suppress=false,0);if(warehouse){message(T().toWarehouse(d));g.HideoutWarehousePanel.render();refresh();}else if(to){message(T().move({...d,to}));refresh();}});
 g.document.addEventListener('pointercancel',cancelDrag);g.addEventListener('blur',cancelDrag);
 g.document.addEventListener('lostpointercapture',e=>{if(drag?.ghost&&e.target===drag.node&&e.pointerId===drag.pointer)cancelDrag();});
 g.document.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation();}},true);
 g.document.addEventListener('keydown',e=>{if(e.key==='Escape')cancelDrag();});
 g.BackpackPanel={render,equipped,equipment:equipped,ground,groundContext,cancelDrag,hasGround:()=>!!state.external,hasSelection:()=>state.detail,isEquipment:()=>false,
  attachInteraction,endInteraction,closeInteraction,hasInteraction:()=>!!interaction,interactionIs:id=>interaction?.id===id,interactionValid,
  showEquipment(){state.selected={};state.detailRef=null;state.detail=true;cancelDrag();},hideDetail(){clear();refresh();},
  invalidate(){clear();state.external=null;signature='';},selectEquipmentBag(){clear();refresh();}};
})(window);
