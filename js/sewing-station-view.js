/* Production sewing workbench: personal jobs, real inventory and cognition-filtered details. */
(function(){
'use strict';
const P=window.parent,bridge=P!==window&&P.SewingStationPanel,S=P.SewingSystem,IE=P.InventoryEquipment,$=id=>document.getElementById(id);
if(!bridge||!S||!bridge.snapshot()){ $('editor').textContent='请从基地缝纫台进入。';return; }
let menu='制作',category='衣服部件',selected='',drafts={},query='',timer=null,actions=[];
const menus=['制作','组装','改制','研究','硅叶处理'],esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,fn,cls){const b=el('button',text,cls);b.onclick=fn;return b;}
function row(a,b){const n=el('div',null,'row');n.append(el('span',a),el('span',b));return n;}
function message(r){$('feedback').textContent=r.message||'';}
function field(label,options,value,change){const box=el('div',null,'field'),l=el('label',label),select=el('select');select.setAttribute('aria-label',label);options.forEach(([id,name])=>{const o=el('option',name);o.value=id;select.append(o);});select.value=value;select.onchange=()=>change(select.value);box.append(l,select);return box;}
function tooltip(n,item){function show(e){const t=$('item-tooltip');t.textContent=S.describe(item);t.style.whiteSpace='pre-line';t.hidden=false;const r=n.getBoundingClientRect();t.style.left=Math.min(r.right+8,innerWidth-310)+'px';t.style.top=Math.max(8,Math.min(r.top,innerHeight-t.offsetHeight-8))+'px';}n.onmouseenter=show;n.onfocus=show;n.onmouseleave=n.onblur=()=>{$('item-tooltip').hidden=true;};}
function categories(){return menu==='制作'?['整套衣服','衣服部件','面料与填充']:menu==='研究'?['版型','材料工艺']:menu==='组装'?['独立部件','已组装部件']:['所有部件'];}
function entries(){
 const own=S.owned(),k=S.knowledge();
 if(menu==='制作'){
  if(category==='面料与填充')return Object.keys(S.materials).filter(id=>(k.materials[id]||0)>=S.materials[id][7]).map(id=>({id,name:S.name(id),material:id,sub:'已掌握加工工艺'}));
  return Object.keys(S.styles).flatMap(style=>category==='整套衣服'?(S.parts.every(p=>S.level(style,p)>=3)?[{id:style,style,name:S.name('sewing_outfit_'+style),sub:'完整款式 · 六个部件'}]:[]):S.parts.filter(part=>S.level(style,part)>=3).map(part=>({id:style+':'+part,style,part,name:S.name('sewing_part_'+style+'_'+part),sub:'可仿制'})));
 }
 return own.filter(r=>menu==='研究'&&category==='材料工艺'?r.item.sewing||S.materials[r.item.item_id]:!!r.item.sewing).filter(r=>menu!=='组装'||(category==='独立部件'?!r.parent:!!r.parent)).map(r=>({id:r.item.instance_id,item:r.item,record:r,name:S.itemName(r.item),sub:(r.parent?'衣服中的部件':'独立物品')+(r.item.sewing?.researched?' · 已研究版型':'')}));
}
function begin(list){const r=S.start(list);message(r);if(!r.ok)return;tickUI();timer=setInterval(()=>{const r=S.step();message(r);if(!r.ok||r.done){clearInterval(timer);timer=null;draw();}else tickUI();},700);}
function tickUI(){const j=S.jobState();$('job').replaceChildren();if(j){$('job').append(el('div','正在亲自操作 · 第 '+(j.index+1)+' / '+j.total+' 项','action-label'),el('p','本项剩余 '+j.remaining+' 分钟'),button('停止工作',()=>{clearInterval(timer);timer=null;message(S.cancel());draw();}));}document.querySelectorAll('#commit button').forEach(b=>b.disabled=!!j||b.dataset.invalid==='true');}
function planEditor(e,d){
 const part=e.part||d.part||'chest';if(!e.part)$('editor').append(field('编辑部位',S.parts.map((p,i)=>[p,S.labels[i]]),part,v=>{d.part=v;draw();}));
 const plan=e.part?d.plan:d.plans[part],style=e.style;
 $('editor').append(field('剪裁',[['male','男装'],['female','女装']],d.cut,v=>{d.cut=v;draw();}));
 if(menu==='改制')$('editor').append(field('改制范围',[['','改尺寸／剪裁（完整重做）'],...S.layersFor(style,part).map(k=>[k,({outer:'仅换面料',liner:'仅换内衬',fill:'仅换填充'})[k]])],d.layer||'',v=>{d.layer=v;draw();}));
 const visibleLayers=Object.keys(plan).filter(k=>menu!=='改制'||!d.layer||d.layer===k);if(!visibleLayers.includes(d.layerTab))d.layerTab=visibleLayers[0];if(visibleLayers.length>1){const tabs=el('div',null,'inline');visibleLayers.forEach(k=>tabs.append(button(({outer:'面料',fill:'填充',liner:'内衬'})[k],()=>{d.layerTab=k;draw();},d.layerTab===k?'active':'')));$('editor').append(tabs);}
 Object.entries(plan).filter(([k])=>k===d.layerTab).forEach(([key,l])=>{
  const card=el('div',null,'card');card.append(el('h3',({outer:'面料',fill:'填充',liner:'内衬'})[key]));
  const candidates=Object.keys(S.materials).filter(id=>id.startsWith('filling_')===(key==='fill')&&(IE.countCarriedItemsByTemplateId(id)>0||Object.hasOwn(l.mix,id)||(S.knowledge().materials[id]||0)>0));
  const ids=Object.keys(l.mix),first=ids[0]||'',second=ids[1]||'';
  card.append(field('材料',candidates.map(id=>[id,S.name(id)+' · '+IE.countCarriedItemsByTemplateId(id)+'份']),first,v=>{l.mix={[v]:100};draw();}));
  const thick=key==='liner'?['standard']:style==='winter'?['standard','thick']:['thin','standard'];card.append(field('用料厚度',thick.map(t=>[t,({thin:'薄',standard:'标准',thick:'厚'})[t]]),l.thickness,v=>{l.thickness=v;draw();}));
  if(key==='fill'){
   card.append(field('混合材料',[['','不混合'],...candidates.filter(id=>id!==first).map(id=>[id,S.name(id)])],second,v=>{l.mix=v?{[first]:50,[v]:50}:{[first]:100};draw();}));
   if(second){const range=el('input'),label=el('label',S.name(first)+' '+l.mix[first]+'% / '+S.name(second)+' '+l.mix[second]+'%');range.type='range';range.min=0;range.max=100;range.step=10;range.value=l.mix[first];range.setAttribute('aria-label','填充配比');range.oninput=()=>{const n=Number(range.value);label.textContent=S.name(first)+' '+n+'% / '+S.name(second)+' '+(100-n)+'%';};range.onchange=()=>{const n=Number(range.value);l.mix=n===0?{[second]:100}:n===100?{[first]:100}:{[first]:n,[second]:100-n};draw();};card.append(label,range,el('p','混合时两种材料各支付完整份数。','muted'));}
  }
  $('editor').append(card);
 });
}
function preview(list,label){
 if(!list.length){$('preview').append(el('p','请选择待处理部件。','intro'));const b=button(label,()=>{});b.disabled=true;b.dataset.invalid='true';$('commit').append(b);return;}
 actions=list;const quotes=list.filter(a=>a.type!=='assemble_created').map(a=>S.preview(a)),bad=quotes.find(q=>!q.ok),cost={},ticks=quotes.reduce((n,q)=>n+(q.ticks||0),0)+(list.some(a=>a.type==='assemble_created')?6:0);
 quotes.forEach(q=>Object.entries(q.cost||{}).forEach(([id,n])=>cost[id]=(cost[id]||0)+n));
 const estimates=list.map(a=>S.estimate(a)).filter(Boolean);if(estimates.length){let cold=[0,0],heat=[0,0],weight=0,pockets=0;estimates.forEach(e=>{for(let i=0;i<2;i++){cold[i]+=e.cold[i];heat[i]+=e.heat[i];}weight+=e.weight;pockets+=e.pockets;});if(list.some(a=>a.type==='assemble_created')){const b=S.styles[list[0].style].bonus;cold=cold.map(n=>n+b[0]);heat=heat.map(n=>n+b[1]);}$('preview').append(el('h3','制成后预计'),row('耐寒修正',cold.map(n=>n.toFixed(1)).join('～')+'℃'),row('耐热修正',heat.map(n=>n.toFixed(1)).join('～')+'℃'),row('重量 / 口袋',Math.round(weight*1000)+'克 / '+pockets+'格'));if(estimates.length===1)$('preview').append(row('天然减伤范围',estimates[0].base[0].map((v,i)=>Math.round(v*100)+'～'+Math.round(estimates[0].base[1][i]*100)+'%').join(' / ')),el('small','劈砍 / 穿刺 / 钝击；实际防护另受覆盖与合身度影响。'));}
 $('preview').append(el('h3','本次操作'),row('预计时间',ticks*10+' 分钟'));
 Object.entries(cost).forEach(([id,n])=>$('preview').append(row(S.name(id),n+'份')));
 if(menu==='硅叶处理'&&Object.keys(cost).length)$('preview').append(el('p','硅叶从桶内扣除。','muted'));
 const warning=quotes.find(q=>q.warning);if(warning)$('preview').append(el('p',warning.warning,'notice'));
 if(bad)$('preview').append(el('p',bad.message,'warning'));
 const b=button(label,()=>begin(actions),'wh-primary');b.dataset.invalid=String(!!bad||!list.length);b.disabled=!!bad||!list.length||!!S.jobState();$('commit').append(b);
}
function draw(){
 $('item-tooltip').hidden=true;const snap=bridge.snapshot();if(!snap)return;
 $('menus').replaceChildren(...menus.map(m=>button(m,()=>{menu=m;category=categories()[0];selected='';draw();},m===menu?'active':'')));
 if(!categories().includes(category))category=categories()[0];$('categories').replaceChildren(...categories().map(c=>button(c,()=>{category=c;selected='';draw();},c===category?'active':'')));
 const list=entries().filter(e=>e.name.includes(query));if(!list.some(e=>e.id===selected))selected=list[0]?.id||'';
 $('list').replaceChildren();list.forEach(e=>{const b=button('',()=>{selected=e.id;draw();},'entry'+(selected===e.id?' selected':''));const t=el('span');t.append(el('strong',e.name),el('small',e.sub));b.append(t);if(e.item)tooltip(b,e.item);$('list').append(b);});
 $('listFoot').textContent=menu==='制作'?'仅显示已掌握的配方':'穿着中的衣服请先脱下，再进行加工。';
 $('editor').replaceChildren();$('preview').replaceChildren();$('commit').replaceChildren();actions=[];
 const e=list.find(e=>e.id===selected);if(!e){$('editor').append(el('h2',menu),el('p',menu==='制作'?'尚无已掌握的配方。可先从现有衣服研究版型或材料工艺。':'没有可操作的物品。','intro'));}
 if(e){
  $('editor').append(el('h2',e.name));const key=menu+':'+category+':'+e.id;let d=drafts[key];
  if(!d){d=drafts[key]={cut:'male',part:'chest',layer:'',count:1};if(e.style){if(e.part)d.plan=S.defaultPlan(e.style,e.part);else d.plans=Object.fromEntries(S.parts.map(p=>[p,S.defaultPlan(e.style,p)]));}if(e.item?.sewing){d.plan=JSON.parse(JSON.stringify(e.item.sewing.known?.layers?e.item.sewing.layers:S.defaultPlan(e.item.sewing.style,e.item.sewing.part))); d.cut=e.item.sewing.known?.cut?e.item.sewing.cut:'male';}if(!e.item?.sewing?.known?.layers){const plans=d.plan?[d.plan]:Object.values(d.plans||{});plans.forEach(plan=>Object.entries(plan).forEach(([key,l])=>{const available=Object.keys(S.materials).filter(id=>id.startsWith('filling_')===(key==='fill')&&(IE.countCarriedItemsByTemplateId(id)>0||(S.knowledge().materials[id]||0)>0));if(!Object.keys(l.mix).every(id=>available.includes(id)))l.mix=available.length?{[available[0]]:100}:{};}));}}
  if(e.item){const info=el('p',S.describe(e.item),'intro');info.style.whiteSpace='pre-line';$('preview').append(info);if(e.item.sewing&&!e.item.sewing.known?.outer&&!e.item.sewing.known?.layers)$('preview').append(button('检查外观 · 10分钟',()=>begin([{type:'inspect',id:e.id}])));}
  if(menu==='制作'){
   if(e.material){$('editor').append(el('p','使用原料加工为已掌握的面料或填充。每批产出 '+S.materials[e.material][10]+' 份。','intro'));const n=el('input');n.type='number';n.min=1;n.max=100;n.value=d.count;n.setAttribute('aria-label','加工批数');n.onchange=()=>{d.count=Math.max(1,Math.min(100,Math.floor(Number(n.value)||1)));draw();};$('editor').append(n);preview(Array.from({length:d.count},()=>({type:'process',material:e.material})),'开始加工');}
   else {planEditor(e,d);const jobs=e.part?[{type:'craft',style:e.style,part:e.part,plan:d.plan,cut:d.cut}]:S.parts.map(p=>({type:'craft',style:e.style,part:p,plan:d.plans[p],cut:d.cut,forSet:true})).concat([{type:'assemble_created'}]);preview(jobs,e.part?'制作部件':'制作并组装整套');}
  }else if(menu==='改制'){
   const s=e.item.sewing;if(S.level(s.style,s.part)>=1)planEditor({style:s.style,part:s.part},d);else $('editor').append(el('p','先研究这个部件的版型，了解结构后才能改制。','intro'));preview([{type:'modify',id:e.id,plan:d.plan,cut:d.cut,layer:d.layer||undefined}],'按最终方案改制');
  }else if(menu==='研究'){
   const s=e.item.sewing;if(category==='版型')$('editor').append(row('理解程度',['尚未掌握','可改造','可改造','可仿制'][S.level(s.style,s.part)]));
   else {const ids=s?[...new Set(Object.values(s.layers).flatMap(l=>Object.keys(l.mix)))]:[e.item.item_id];
    // Hidden layers are not disclosed merely by selecting a research target.
    if(!s||s.known?.layers)ids.forEach(id=>{const n=S.knowledge().materials[id]||0,max=S.materials[id][7];$('editor').append(row(S.name(id),n>=max?'已掌握':n>=max*.7?'接近掌握':n?'初步认识':'尚未研究'));});
   }preview([{type:category==='版型'?'pattern':'research',id:e.id}],category==='版型'?'研究版型':'拆开并研究材料');
  }else if(menu==='组装'){
   if(e.record.parent)preview([{type:'detach',id:e.id}],'完整拆下部件');
   else {const part=e.item.sewing.part,targets=S.owned().filter(r=>r.item.sewing_parts&&!r.item.sewing_parts[part]);$('editor').append(field('安装到',[['','开始组合一套衣服'],...targets.map(r=>[r.item.instance_id,S.name(r.item.item_id)+' · '+Object.keys(r.item.sewing_parts).length+'件'])],d.target||'',v=>{d.target=v;draw();}),el('p','按部位自动安装，无需选择整套款式。','intro'));preview([{type:'assemble',id:e.id,target:d.target||null}],e.item.sewing.known?.structure?'安装到'+S.labels[S.parts.indexOf(part)]:'安装部件');}
  }else if(menu==='硅叶处理'){
   $('editor').append(el('p','每个部件只能浸泡一次。以后改尺寸、换料和移植都保留本次结果。','notice'));
   const candidates=list.filter(x=>!x.item.sewing.soak);d.checked=d.checked||[e.id];candidates.forEach(x=>{const label=el('label',null,'check-row'),check=el('input');check.type='checkbox';check.checked=d.checked.includes(x.id);check.onchange=()=>{d.checked=check.checked?[...new Set([...d.checked,x.id])]:d.checked.filter(id=>id!==x.id);draw();};label.append(check,el('span',x.name));$('editor').append(label);});preview(d.checked.filter(id=>candidates.some(x=>x.id===id)).map(id=>({type:'soak',id})),'开始浸泡');
  }
 }
 if(menu==='硅叶处理'){
  const box=el('div',null,'bucket');box.append(el('h3','浸泡桶'),row('存料',snap.bucket+' / 50份'),row('随身硅叶',snap.leaves+'份'));
  if(snap.bucketUnlocked){const n=el('input');n.type='number';n.min=1;n.max=Math.min(50-snap.bucket,snap.leaves);n.value=Math.max(1,Number(n.max));n.setAttribute('aria-label','添加硅叶份数');const b=button('添加硅叶',()=>{message(bridge.refill(Number(n.value)));draw();});b.disabled=Number(n.max)<1;box.append(n,b);}else box.append(el('p','装配浸泡桶后，可在此添加硅叶。'),button('装配浸泡桶',()=>{const r=bridge.installBucket();if(!r.ok)message(r);}));$('preview').prepend(box);
 }
 tickUI();
}
function mannequin(){const snap=bridge.snapshot();$('manContent').replaceChildren();const size=x=>x?x.height_cm+'厘米 / '+(x.weight_kg??'未称重')+'公斤':'尚未记录';$('manContent').append(row('最近测量',size(snap.measurement)),row('人台尺寸',size(snap.mannequin)),button('重新测量 · 10分钟',()=>{begin([{type:'measure'}]);$('manDialog').close();}));const offer={};P.FacilityUnlockConfig.materials.filter(m=>['wood','fiber'].includes(m[1])&&m[0]!=='hus_wool'&&IE.countCarriedItemsByTemplateId(m[0])>0).forEach(m=>{const box=el('label',S.name(m[0])+'（'+IE.countCarriedItemsByTemplateId(m[0])+'份）'),n=el('input');n.type='number';n.min=0;n.max=IE.countCarriedItemsByTemplateId(m[0]);n.value=0;n.oninput=()=>offer[m[0]]=Number(n.value);box.append(n);$('manContent').append(box);});$('manContent').append(el('p','按记录更新人台，使用木作与纤维材料，需30分钟。','intro'),button('更新人台',()=>{const r=S.preview({type:'mannequin',materials:offer});if(!r.ok){message(r);return;}begin([{type:'mannequin',materials:offer}]);$('manDialog').close();}));$('manDialog').showModal();}
$('search').oninput=e=>{query=e.target.value;draw();};$('mannequin').onclick=mannequin;$('closeMan').onclick=()=>$('manDialog').close();$('closeStation').onclick=()=>{clearInterval(timer);bridge.close();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();if($('manDialog').open)$('manDialog').close();else{clearInterval(timer);bridge.close();}}});
window.addEventListener('pagehide',()=>{clearInterval(timer);S.cancel();});draw();
})();
