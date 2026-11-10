import { cropArtIds } from './agriculture-crop-art.mjs';
import { structureArtIds,renderPlotArt,renderStructureArt } from './agriculture-structure-art.mjs';
const defs=await(await fetch('../data/agriculture-crop-defs.json')).json();
const crops=Object.entries(defs.crops).map(([id,c],index)=>({id,...c,index,type:'crop'}));
const structures=Object.entries(defs.crop_structure_requirements).map(([id,cropIds],index)=>({id,cropIds,name:defs.crop_structure_labels[id],index,type:'structure'}));
if(crops.length!==cropArtIds.length||crops.some(c=>!cropArtIds.includes(c.id)))throw Error('Crop illustration catalog is incomplete');
if(structures.length!==structureArtIds.length||structures.some(s=>!structureArtIds.includes(s.id)))throw Error('Structure illustration catalog is incomplete');
const labels={all:'全部',grain:'谷物',veg:'蔬菜',aromatics:'葱姜香草',spice:'香料',fruit:'果实'};
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mode=new URLSearchParams(location.search).get('tab')==='structures'?'structures':'crops';
let group='all',query='',filtered=crops,selected=null,composed=false,detailCrop=null,detailComposed=false;
$('#groups').innerHTML=Object.entries(labels).map(([id,label])=>`<button data-group="${id}" aria-pressed="${id===group}">${label}</button>`).join('');
$('.catalog-modes [data-mode="crops"] small').textContent=crops.length;
$('.catalog-modes [data-mode="structures"] small').textContent=structures.length;
function cropDrawing(c,withStructure=composed){return renderPlotArt(c.id,withStructure?c.required_crop_structure_id:null);}
function render(){
 const facility=mode==='structures',entries=facility?structures:crops;
 filtered=entries.filter(c=>(facility||group==='all'||c.group===group)&&(!query||`${c.name} ${c.id} ${c.seedName||''} ${c.cropIds?.map(id=>defs.crops[id].name).join(' ')||''}`.toLowerCase().includes(query)));
 document.querySelector('h1').textContent=facility?'设施图鉴':'作物图鉴';
 $('#total').textContent=`${entries.length} 种`;
 $('.catalog-modes').querySelectorAll('[data-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.mode===mode)));
 $('#groups').hidden=facility;$('#composed').hidden=facility;$('.sheet-download').hidden=facility;
 $('#search').placeholder=facility?'搜索设施或适用作物':'搜索作物';
 $('#gallery').classList.toggle('structures',facility);
 $('#gallery').innerHTML=filtered.map(c=>facility?
  `<button class="crop-card structure-card" data-entry="${c.id}" aria-label="查看${esc(c.name)}"><span class="crop-number">${String(c.index+1).padStart(2,'0')}</span><span class="structure-pair"><span>${renderStructureArt(c.id)}<small>设施</small></span><span>${renderPlotArt(c.cropIds[0],c.id)}<small>${esc(defs.crops[c.cropIds[0]].name)}</small></span></span><span class="crop-name">${esc(c.name)}</span><span class="structure-crops">${c.cropIds.map(id=>esc(defs.crops[id].name)).join(' · ')}</span></button>`:
  `<button class="crop-card" data-entry="${c.id}" aria-label="查看${esc(c.name)}"><span class="crop-number">${String(c.index+1).padStart(2,'0')}</span>${cropDrawing(c)}<span class="crop-name">${esc(c.name)}</span><span class="crop-group">${c.required_crop_structure_id?`${composed?'':'需 '}${defs.crop_structure_labels[c.required_crop_structure_id]}`:labels[c.group]}</span></button>`).join('');
 $('#result-label').textContent=query?`“${$('#search').value}”`:facility?'作物专用设施':group==='all'?'全部作物':labels[group];
 $('#result-count').textContent=`${filtered.length} / ${entries.length}`;
 $('#empty').hidden=filtered.length>0;$('#empty').textContent=facility?'未找到设施':'未找到作物';
}
function drawDetail(){
 const facility=selected.type==='structure',req=selected.required_crop_structure_id;
 const drawing=facility?renderPlotArt(detailCrop,selected.id):cropDrawing(selected,detailComposed);
 $('#detail-art').innerHTML=drawing;$('#detail-name').textContent=selected.name;
 $('#detail-group').textContent=facility?(detailCrop?defs.crops[detailCrop].name:'作物设施'):req?`前置设施 · ${defs.crop_structure_labels[req]}`:labels[selected.group];
 const link=$('#download');
 if(facility||detailComposed&&req){
  const structureId=facility?selected.id:req,cropId=facility?detailCrop:selected.id;
  link.href=`../assets/agriculture/structures-botanical-v1/${cropId?cropId+'--':''}${structureId}.svg`;
  link.download=`${selected.name}${facility&&cropId?'·'+defs.crops[cropId].name:''}.svg`;
 }else{link.href=`../assets/agriculture/crops-botanical-v1/${selected.id}.svg`;link.download=`${selected.name}.svg`;}
 const pairings=$('#detail-pairings');pairings.hidden=!facility&&!req;
 pairings.innerHTML=facility?[[null,'仅设施'],...selected.cropIds.map(id=>[id,defs.crops[id].name])].map(([id,label])=>`<button data-example="${id||''}" aria-pressed="${detailCrop===id}">${label}</button>`).join(''):
  req?`<button data-compose="false" aria-pressed="${!detailComposed}">仅作物</button><button data-compose="true" aria-pressed="${detailComposed}">带${defs.crop_structure_labels[req]}</button>`:'';
 $('.sizes').innerHTML=[32,48,64].map(size=>`<div class="size"><div style="width:${size}px;height:${size}px">${drawing}</div><span>${size} px</span></div>`).join('');
 $('#position').textContent=`${filtered.findIndex(c=>c.id===selected.id)+1} / ${filtered.length}`;
}
function open(id){
 selected=filtered.find(c=>c.id===id);if(!selected)return;
 detailCrop=selected.type==='structure'?selected.cropIds[0]:null;detailComposed=composed;
 drawDetail();if(!$('#detail').open)$('#detail').showModal();
}
function step(delta){const i=filtered.findIndex(c=>c.id===selected?.id);if(filtered.length)open(filtered[(i+delta+filtered.length)%filtered.length].id);}
$('.catalog-modes').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(!b)return;mode=b.dataset.mode;query='';$('#search').value='';const url=new URL(location.href);if(mode==='structures')url.searchParams.set('tab',mode);else url.searchParams.delete('tab');history.replaceState(null,'',url);render();});
$('#composed').addEventListener('click',()=>{composed=!composed;$('#composed').setAttribute('aria-pressed',String(composed));render();});
$('#detail-pairings').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-example'))detailCrop=b.dataset.example||null;else detailComposed=b.dataset.compose==='true';drawDetail();});
$('#groups').addEventListener('click',e=>{const b=e.target.closest('[data-group]');if(!b)return;group=b.dataset.group;$('#groups').querySelectorAll('button').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));render();});
$('#search').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();render();});
$('#gallery').addEventListener('click',e=>{const card=e.target.closest('[data-entry]');if(card)open(card.dataset.entry);});
$('#surface').addEventListener('click',()=>{const light=document.body.classList.toggle('light');$('#surface').setAttribute('aria-pressed',String(light));$('#surface').textContent=light?'深色底':'浅色底';});
$('.close').addEventListener('click',()=>$('#detail').close());
$('#detail').addEventListener('click',e=>{if(e.target===$('#detail')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('#previous').addEventListener('click',()=>step(-1));$('#next').addEventListener('click',()=>step(1));
document.addEventListener('keydown',e=>{if(!$('#detail').open||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();step(e.key==='ArrowLeft'?-1:1);});
render();
