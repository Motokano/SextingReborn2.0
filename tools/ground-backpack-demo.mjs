import {createGroundBackpackDemo} from './ground-backpack-demo-model.mjs';
import {loadReviewArt} from './ground-backpack-art-draw.mjs';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const I=window.InventoryEquipment,B=window.BackpackSystem;
let demo,art,projection,offset,drawScale=1,showGrid=true,groundId=null,carryId=null,groundQty=1,carryQty=1,moving=false,moveToken=0,hitBags=[];
let panelMode='',listCell=null,returnToList=false,lastOpener=null;
let itemDrag=null,suppressDragClick=false;
const names={pocket:'口袋',backpack:'装备背包',vehicle:'载具'},kg=n=>Number(n||0).toFixed(2)+' kg';
function feedback(r){for(const id of ['feedback','window-feedback']){$(id).textContent=r?.message||'';$(id).hidden=!r?.message;$(id).classList.toggle('error',r?.ok===false);}}
function act(fn){if(moving)return;const r=fn();feedback(r);render();return r;}
function closeWindow(){panelMode='';demo?.close();if($('interaction-window').open)$('interaction-window').close();if(lastOpener?.isConnected)lastOpener.focus({preventScroll:true});render();}
function chooseGround(id,fromList=false){
 if(moving)return;const s=demo.snapshot(),r=s.ground.find(v=>v.item.instance_id===id);if(!r)return;
 if(r.x!==s.world.x||r.y!==s.world.y){closeWindow();walk(demo.pathTo(r.x,r.y));return;}
 lastOpener=document.activeElement?.closest('dialog')?$('show-ground'):document.activeElement;returnToList=fromList;groundId=carryId=null;
 demo.select(id);const result=B.managed(r.item.item_id)?demo.open():{ok:true};
 panelMode=result.ok?'item':'';feedback(result);render();
}
function chooseCell(x,y){const s=demo.snapshot(),items=s.ground.filter(r=>r.x===x&&r.y===y);if(!items.length)return false;if(x!==s.world.x||y!==s.world.y){closeWindow();walk(demo.pathTo(x,y));return true;}listCell={x,y};if(items.length===1)chooseGround(items[0].item.instance_id);else{demo.close();panelMode='list';returnToList=false;lastOpener=$('show-ground');feedback();render();}return true;}
function syncWindow(s){
 if(s.world.dead||(panelMode==='item'&&(!s.target||!s.reachable||(B.managed(s.target.item.item_id)&&!s.opened)))||(panelMode==='list'&&listCell&&(listCell.x!==s.world.x||listCell.y!==s.world.y)))panelMode='';
 const win=$('interaction-window'),expanded=panelMode==='item';
 win.classList.toggle('expanded',expanded);win.dataset.mode=panelMode;
 $('interaction-title').textContent=panelMode==='carry'?'随身物品':panelMode==='list'?'脚下物品':'背包存取';
 $('ground-picker').hidden=panelMode!=='list';
 $('back-to-list').hidden=panelMode!=='item'||!returnToList;
 $('inventory-columns').hidden=!expanded&&panelMode!=='carry';$('ground-content').hidden=!expanded;
 if(panelMode){if(!win.open){win.show();$('close-window').focus({preventScroll:true});}}else if(win.open)win.close();
}
function selectedItem(arr,id){return arr?.find(x=>x?.instance_id===id);}
function detail(x){if(!x)return '';const water=I.getItemInstanceValue(x,'flask_water'),age=x.spoilage_elapsed_ticks;return `<div class="item-detail"><b>${esc(demo.name(x))}</b><br>实际重量 ${kg(I.getItemCombinedWeight(x))}${Number.isFinite(water)?'<br>存水 '+water:''}${age!=null?'<br>已累计腐坏 '+Number(age.toFixed(2))+' 刻':''}${B.managed(x.item_id)?'<br>'+I.getBackpackContents(x).filter(Boolean).length+' 件在包内':''}</div>`;}
function bagProperties(x){const p=B.profile(x);return [p.slots+'格 · 自重 '+kg(p.selfWeight)+' · 减重 '+Number(((1-p.weightFactor)*100).toFixed(2))+'%','词条：'+(p.affixes.map(id=>B.config.affixes[id].name).join('、')||'无'),'改造：'+(p.modification==='none'?'无':B.config.modifications[p.modification].name),...(p.spoilageFactor<1?['食物腐坏速度：'+Number((p.spoilageFactor*100).toFixed(2))+'%']:[])].join('\n');}
function slotGrid(arr,cap,side,id){return `<div class="stack-info">${arr.filter(Boolean).length} / ${cap===Infinity?'不限':cap} 格</div><div class="slots" data-drop-side="${side}">${Array.from({length:cap===Infinity?Math.max(6,arr.length+1):cap},(_,i)=>{const x=arr[i];return x?`<button class="slot" data-side="${side}" data-id="${esc(x.instance_id)}" draggable="false" aria-pressed="${x.instance_id===id}" aria-label="${esc(demo.name(x))}，数量${x.count??1}"><span class="idx">${i+1}</span>${esc(demo.name(x))}${(x.count??1)>1?'<span class="qty">×'+x.count+'</span>':''}</button>`:`<div class="slot empty"><span class="idx">${i+1}</span>空格</div>`;}).join('')}</div>`;}
function quantity(side,value,x){return `<label class="quantity">数量<input id="${side}-qty" aria-label="${side==='ground'?'取出':'存入'}数量" type="number" min="1" max="${x?.count??1}" value="${value}" ${x?'':'disabled'}></label>`;}
function clearItemDrag(){
 const d=itemDrag;itemDrag=null;d?.ghost?.remove();d?.source.classList.remove('drag-source');
 document.querySelectorAll('.drop-ready,.drop-hover').forEach(el=>el.classList.remove('drop-ready','drop-hover'));
 document.body.classList.remove('dragging-item');
 if(d&&$('interaction-window').hasPointerCapture(d.pointer))$('interaction-window').releasePointerCapture(d.pointer);
 return d;
}
function dragZone(x,y){const zone=document.elementFromPoint(x,y)?.closest('[data-drop-side]');return zone?.dataset.dropSide===itemDrag?.to?zone:null;}
document.addEventListener('pointerdown',e=>{
 if(!demo||itemDrag||moving||!e.isPrimary||e.button!==0||panelMode!=='item')return;
 const source=e.target.closest('button.slot[data-side]');if(!source||source.disabled)return;
 const s=demo.snapshot(),container=$('destination').value,side=source.dataset.side;
 if(!s.opened||!s.reachable||s.world.dead)return;
 const id=source.dataset.id,item=selectedItem(side==='carry'?s.inventory['inventory_'+container]:s.target?.item.backpack_contents,id);if(!item)return;
 const count=id===(side==='carry'?carryId:groundId)?(side==='carry'?carryQty:groundQty):(item.count??1);
 if(!Number.isInteger(count)||count<1||count>(item.count??1)){feedback({ok:false,message:'数量无效。'});return;}
 itemDrag={pointer:e.pointerId,source,side,to:side==='carry'?'ground':'carry',id,count,container,bag:s.target.item.instance_id,name:demo.name(item),x:e.clientX,y:e.clientY,active:false};
});
document.addEventListener('pointermove',e=>{
 const d=itemDrag;if(!d||e.pointerId!==d.pointer)return;
 if(!d.active){
  if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<7)return;
  d.active=true;$('interaction-window').setPointerCapture(d.pointer);d.source.classList.add('drag-source');document.body.classList.add('dragging-item');
  document.querySelector(`[data-drop-side="${d.to}"]`)?.classList.add('drop-ready');
  d.ghost=document.createElement('div');d.ghost.className='item-drag-ghost';d.ghost.setAttribute('aria-hidden','true');
  d.ghost.innerHTML=`<b>${esc(d.name)} ×${d.count}</b>`;document.body.append(d.ghost);
 }
 e.preventDefault();const zone=dragZone(e.clientX,e.clientY);
 document.querySelectorAll('.drop-hover').forEach(el=>el.classList.remove('drop-hover'));zone?.classList.add('drop-hover');
 d.ghost.classList.toggle('can-drop',!!zone);
 d.ghost.style.left=Math.max(4,Math.min(e.clientX+14,innerWidth-d.ghost.offsetWidth-4))+'px';
 d.ghost.style.top=Math.max(4,Math.min(e.clientY+14,innerHeight-d.ghost.offsetHeight-4))+'px';
},{passive:false});
document.addEventListener('pointerup',e=>{
 if(!itemDrag||e.pointerId!==itemDrag.pointer)return;
 const zone=dragZone(e.clientX,e.clientY),d=clearItemDrag();if(!d.active)return;
 // A completed gesture must not also click a slot, map tile, or action button.
 suppressDragClick=true;setTimeout(()=>{suppressDragClick=false;},0);
 if(!zone){feedback({ok:true,message:'已取消拖动。'});return;}
 const s=demo.snapshot();
 if(moving||panelMode!=='item'||!s.opened||!s.reachable||s.target?.item.instance_id!==d.bag||$('destination').value!==d.container){feedback({ok:false,message:'背包或容器已变化。'});render();return;}
 if(d.side==='carry'){carryId=d.id;carryQty=d.count;}else{groundId=d.id;groundQty=d.count;}
 act(()=>demo.transfer(d.side==='carry'?'in':'out',d.id,d.count,d.container));
});
document.addEventListener('pointercancel',e=>{if(e.pointerId===itemDrag?.pointer)clearItemDrag();});
$('interaction-window').addEventListener('lostpointercapture',e=>{if(e.target===e.currentTarget&&e.pointerId===itemDrag?.pointer)clearItemDrag();});
window.addEventListener('blur',clearItemDrag);
document.addEventListener('click',e=>{if(suppressDragClick){e.preventDefault();e.stopImmediatePropagation();}},true);
function render(){
 clearItemDrag();if(!demo)return;const s=demo.snapshot(),c=$('destination').value,eq=s.inventory.equipment.backpack,p=eq&&B.profile(eq),r=s.target;
 $('world-status').textContent=`${s.world.dungeon?'地牢试玩':'藏身处外试玩'} · 第 ${s.world.tick} 刻 · 随身负重 ${kg(s.weight)}${s.world.dead?' · 已死亡':''}`;
 $('position').textContent=`人物（${s.world.x+1}, ${s.world.y+1}）`;
 $('equipped-name').textContent=eq?demo.name(eq):'未装备';$('equipped-meta').textContent=p?`${s.inventory.inventory_backpack.filter(Boolean).length}/${p.slots}格 · 包内减重 ${Math.round((1-p.weightFactor)*100)}%`:'';$('drop').disabled=!eq||s.world.dead||moving;
 const groundChoices=s.ground.filter(v=>v.x===s.world.x&&v.y===s.world.y);
 $('ground-count').textContent=groundChoices.length+' 件';$('show-ground').textContent='脚下物品 · '+groundChoices.length;
 $('ground-picker-title').textContent=`（${s.world.x+1}, ${s.world.y+1}）脚下物品`;
 $('ground-list').innerHTML=groundChoices.map(v=>`<button class="ground-choice" data-ground="${esc(v.item.instance_id)}" aria-pressed="${v.item.instance_id===s.selected}">${B.managed(v.item.item_id)?'<img src="assets/map/isometric/ground-backpack-v1/closed.png" alt="">':''}<span>${esc(demo.name(v.item))}<small>（${v.x+1}, ${v.y+1}）${B.managed(v.item.item_id)?' · '+I.getBackpackContents(v.item).filter(Boolean).length+'格物品':''}</small></span></button>`).join('')||'<span class="muted">暂无物品</span>';
 const isBag=r&&B.managed(r.item.item_id),used=isBag?I.getBackpackContents(r.item).filter(Boolean).length:0;
 const remain=r?Math.max(0,100-(s.world.tick-(r.item.ground_drop_tick||0))):0;
 const arr=s.inventory['inventory_'+c]||[],cap=demo.capacity(c);
 if(!selectedItem(arr,carryId)){carryId=null;carryQty=1;}
 const carried=selectedItem(arr,carryId);if(carried)carryQty=Math.min(carryQty,carried.count??1);$('carry-slots').innerHTML=cap?slotGrid(arr,cap,'carry',carryId):'<div class="placeholder">未装备背包</div>';
 $('carry-title').textContent='随身容器';
 $('carry-detail').innerHTML=detail(carried)+quantity('carry',carryQty,carried)+`<div class="actions">${panelMode==='item'&&s.opened?`<button class="primary" data-action="deposit" ${!carried?'disabled':''}>放入 →</button>`:''}<button data-action="drop-carried" ${!carried||s.world.dead?'disabled':''}>放到脚下</button></div>`;
 if(s.opened&&isBag){
  const a=r.item.backpack_contents||[];if(!selectedItem(a,groundId)){groundId=null;groundQty=1;}const stored=selectedItem(a,groundId);if(stored)groundQty=Math.min(groundQty,stored.count??1);
  $('ground-content').innerHTML=`<div class="container-title"><h2>地面背包</h2><span>${esc(demo.name(r.item))}</span><span class="muted">${kg(I.getItemCombinedWeight(r.item))} · ${s.world.dungeon?'地牢内保留':'剩余'+remain+'刻'}</span></div>`+slotGrid(a,B.profile(r.item).slots,'ground',groundId)+detail(stored)+quantity('ground',groundQty,stored)+`<div class="actions"><button class="primary" data-action="take" ${!stored?'disabled':''}>← 取出</button><button data-action="take-all" ${!used?'disabled':''}>← 全部取出</button><button data-action="drop-content" ${!stored?'disabled':''}>放到地上</button></div><div class="bag-actions"><button data-action="equip">${eq?'换上此包':'背上'}</button><button data-action="pickup">整包收起</button></div><details class="bag-properties"><summary>背包属性</summary>${esc(bagProperties(r.item))}\n背上后负重：${kg(equipPreview(s,r.item))}</details>`;
 }else if(r&&!isBag){$('ground-content').innerHTML='<div class="container-title"><h2>脚下物品</h2></div>'+detail(r.item)+'<div class="actions"><button class="primary" data-action="pickup">← 拾起</button></div>';
 }else $('ground-content').innerHTML='';
 $('fail').textContent=s.failNext?'已安排下次失败':'下次保存失败';$('door').textContent=s.world.door?'关门':'开门';$('stop').hidden=!moving;
 document.querySelectorAll('.dpad button').forEach(b=>b.disabled=moving||s.world.dead);
 $('back-to-list').disabled=moving||s.world.dead;
 if(moving||s.world.dead)document.querySelectorAll('.interaction button,.dpad button').forEach(b=>b.disabled=true);
 $('close-window').disabled=false;
 syncWindow(s);const canDrag=panelMode==='item'&&s.opened&&isBag&&!moving&&!s.world.dead;
 document.querySelectorAll('.slot[data-side]').forEach(el=>el.classList.toggle('can-drag',!!canDrag));draw(s);
}
function equipPreview(s,b){const old=s.inventory.equipment.backpack;let w=s.weight;if(old){w-=B.profile(old).selfWeight;w-=s.inventory.inventory_backpack.filter(Boolean).reduce((n,x)=>n+I.getItemCombinedWeight(x)*B.weightFactor(old,x),0);}return w+B.profile(b).selfWeight+(b.backpack_contents||[]).filter(Boolean).reduce((n,x)=>n+I.getItemCombinedWeight(x)*B.weightFactor(b,x),0);}
function draw(s){
 if(!art)return;const canvas=$('board'),ctx=canvas.getContext('2d'),width=canvas.clientWidth,pad=16;
 projection=MapProjection.create({width:6,height:5},144/Math.SQRT2,'isometric');drawScale=Math.min(1,(width-2*pad)/projection.widthPx);const height=Math.ceil((projection.heightPx-80)*drawScale);offset={x:(width-projection.widthPx*drawScale)/2,y:-60*drawScale};
 const dpr=window.devicePixelRatio||1;canvas.width=width*dpr;canvas.height=height*dpr;canvas.style.height=height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#25372b';ctx.fillRect(0,0,width,height);ctx.translate(offset.x,offset.y);ctx.scale(drawScale,drawScale);
 const poly=(points,fill,stroke)=>{ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}};
 for(let y=0;y<5;y++)for(let x=0;x<6;x++){let fill=(x+y)%2?'#4f6048':'#495941';if(s.target?.x===x&&s.target?.y===y)fill='#68744c';poly(projection.cellPolygon(x,y),fill,showGrid?'#96a37b88':null);}
 hitBags=[];const objects=[];
 for(const r of s.ground){objects.push({depth:r.x+r.y+.1,draw:()=>{const center=projection.cellCenter(r.x,r.y),same=r.x===s.world.x&&r.y===s.world.y,peers=s.ground.filter(v=>v.x===r.x&&v.y===r.y),idx=peers.findIndex(v=>v.item.instance_id===r.item.instance_id);center.x+=(same?28:0)+(idx%3)*15;center.y+=(same?7:0)+Math.floor(idx/3)*10;
  if(B.managed(r.item.item_id))art.bag(ctx,center.x,center.y);else{ctx.fillStyle='#c5b88d';ctx.strokeStyle='#253427';ctx.lineWidth=2;ctx.fillRect(center.x-7,center.y-12,14,11);ctx.strokeRect(center.x-7,center.y-12,14,11);}
  if(r.item.instance_id===s.selected){ctx.strokeStyle='#f0d08e';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(center.x,center.y+7,29,12,0,0,Math.PI*2);ctx.stroke();}
  hitBags.push({x:offset.x+center.x*drawScale,y:offset.y+(center.y-16)*drawScale,id:r.item.instance_id,cellX:r.x,cellY:r.y});
 }});}
 for(const y of [1,2,3]){if(y===2&&s.world.door)continue;objects.push({depth:3+y,draw:()=>{const p=projection.cellPolygon(3,y),h=y===2?37:48,top=p.map(v=>({x:v.x,y:v.y-h}));poly([p[1],p[2],top[2],top[1]],y===2?'#604f35':'#63705e','#253a2b');poly([p[2],p[3],top[3],top[2]],y===2?'#4b402c':'#485846','#253a2b');poly(top,y===2?'#85734a':'#818a70','#253a2b');ctx.fillStyle='#e4d9b8';ctx.font='12px Microsoft YaHei';const c=projection.cellCenter(3,y);ctx.fillText(y===2?'门':'墙',c.x-7,c.y-h+5);}});}
 objects.push({depth:s.world.x+s.world.y+.05,draw:()=>{const c=projection.cellCenter(s.world.x,s.world.y);ctx.globalAlpha=s.world.dead?.4:1;art.player(ctx,c.x,c.y);ctx.globalAlpha=1;}});
 objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());
}
async function walk(path){if(moving)return;if(path===null){feedback({ok:false,message:'没有可通行的路线。'});return;}if(!path.length){feedback({ok:true,message:'已在此格。'});return;}moving=true;const token=++moveToken;render();for(const p of path){await new Promise(r=>setTimeout(r,150));if(token!==moveToken)break;const result=demo.step(p.x,p.y);feedback(result);render();if(!result.ok)break;}if(token===moveToken){moving=false;const s=demo.snapshot();if(s.ground.some(r=>r.x===s.world.x&&r.y===s.world.y))feedback({ok:true,message:'已到达。'});render();}}
function stop(){moveToken++;moving=false;render();}
document.addEventListener('click',e=>{
 if(!demo)return;const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.ground){chooseGround(b.dataset.ground,true);return;}
 if(b.dataset.side){if(b.dataset.side==='ground'){groundId=b.dataset.id;groundQty=selectedItem(demo.snapshot().target?.item.backpack_contents,groundId)?.count??1;}else{carryId=b.dataset.id;carryQty=selectedItem(demo.snapshot().inventory['inventory_'+$('destination').value],carryId)?.count??1;}render();return;}
 if(b.dataset.step){const [dx,dy]=b.dataset.step.split(',').map(Number),s=demo.snapshot();act(()=>demo.step(s.world.x+dx,s.world.y+dy));return;}
 const c=$('destination').value;
 const actions={equip:()=>demo.equip(),pickup:()=>demo.pickup(c),take:()=>demo.transfer('out',groundId,groundQty,c),deposit:()=>demo.transfer('in',carryId,carryQty,c),'take-all':()=>demo.takeAll(c),'drop-content':()=>demo.transfer('ground',groundId,groundQty,c),'drop-carried':()=>demo.dropCarried(carryId,carryQty,c)};
 if(actions[b.dataset.action])act(actions[b.dataset.action]);
});
document.addEventListener('input',e=>{if(e.target.id==='ground-qty')groundQty=Number(e.target.value);if(e.target.id==='carry-qty')carryQty=Number(e.target.value);});
$('destination').onchange=()=>{carryId=null;carryQty=1;render();};
$('drop').onclick=()=>act(()=>{const r=demo.drop();if(r.ok){$('destination').value='pocket';panelMode='';}return r;});
$('restart').onclick=()=>{stop();closeWindow();groundId=carryId=null;listCell=null;$('destination').value=['start','full','swap'].includes($('scenario').value)?'backpack':'pocket';act(()=>{const r=demo.reset($('scenario').value);demo.close();return r;});};
$('scenario').onchange=()=>{$('restart').click();};
$('wait').onclick=()=>act(()=>demo.wait(1));$('wait10').onclick=()=>act(()=>demo.wait(10));$('fail').onclick=()=>act(()=>demo.failSave());$('reload').onclick=()=>act(()=>demo.reload());$('death').onclick=()=>act(()=>demo.death());$('door').onclick=()=>act(()=>demo.toggleDoor());$('grid').onclick=()=>{showGrid=!showGrid;$('grid').setAttribute('aria-pressed',String(showGrid));render();};$('stop').onclick=stop;
$('show-ground').onclick=()=>{if(!demo||moving)return;const s=demo.snapshot();lastOpener=$('show-ground');if(!chooseCell(s.world.x,s.world.y))feedback({ok:false,message:'脚下没有物品。'});};
$('show-carry').onclick=()=>{if(!demo||moving)return;demo.close();lastOpener=$('show-carry');panelMode='carry';feedback();render();};
$('close-window').onclick=closeWindow;
$('interaction-window').addEventListener('cancel',e=>{e.preventDefault();closeWindow();});
$('back-to-list').onclick=()=>{demo.close();panelMode='list';render();};
$('board').onclick=e=>{if(!demo||moving||demo.snapshot().world.dead)return;const rect=e.currentTarget.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,hit=hitBags.filter(p=>Math.hypot(p.x-x,p.y-y)<25*drawScale).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];if(hit){chooseGround(hit.id);return;}const cell=projection.pick((x-offset.x)/drawScale,(y-offset.y)/drawScale);if(cell){if(chooseCell(cell.x,cell.y))return;closeWindow();walk(demo.pathTo(cell.x,cell.y));}};
window.addEventListener('keydown',e=>{if(!demo)return;if(e.key==='Escape'){e.preventDefault();stop();closeWindow();return;}if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;const d={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[e.key];if(d){e.preventDefault();const s=demo.snapshot();act(()=>demo.step(s.world.x+d[0],s.world.y+d[1]));}});
new ResizeObserver(()=>{if(demo)draw(demo.snapshot());}).observe($('board').parentElement);
try{
 const read=async p=>{const r=await fetch('data/'+p+'.json');if(!r.ok)throw Error('物品数据加载失败。');return r.json();};
 const [items,equipment,enchant]=await Promise.all(['item-catalog-v2','equipment-catalog-v2','enchant'].map(read));I.setConfig({items:ItemAttributeModules.hydrateCatalog(items),equipment:ItemAttributeModules.hydrateCatalog(equipment),modules:{},enchant,default_equipment:{}});
 demo=createGroundBackpackDemo(window);feedback(demo.reset());$('destination').value='backpack';art=await loadReviewArt();window.groundBackpackDemo=demo;render();window.demoReady=true;
}catch(e){feedback({ok:false,message:e.message});window.demoError=e.message;console.error(e);}
