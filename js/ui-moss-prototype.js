/* THROWAWAY UI PROTOTYPE — mock state, no localStorage or game mutations.
   Question: which moss/brass HUD hierarchy leaves enough room for the world?
   Verdict pending user review. Run with the existing npm run dev server. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const stage = $('#stage'), host = $('#panels');
const variants = { A:['随身铭牌','信息分布四周 · 地图留在中央'], B:['行旅手册','信息集中左侧 · 便于连续阅读'], C:['轻量仪表','常用信息沉到底部 · 纵向视野开阔'] };
const requested = new URLSearchParams(location.search).get('variant');
let variant = variants[requested] ? requested : 'A';
let level=2, inCombat=false, locked=false, z=10, toastTimer;
const preference={}, positions={}, folded={}, categoryRules={}, metricRules={};
const names=['初来乍到','开始了解','熟悉自身'];
const definitions = [
{id:'carry',title:'携行',icon:'◇',min:1},
{id:'body',title:'身体',icon:'⟡',min:1},
{id:'survival',title:'生存',icon:'◒',min:0},
{id:'growth',title:'成长',icon:'⌁',min:2},
{id:'effects',title:'状态',icon:'❋',min:1},
{id:'environment',title:'环境',icon:'◷',min:0},
{id:'journal',title:'事件记录',icon:'≋',min:0},
{id:'battle',title:'战斗',icon:'⌖',min:1}
];
const known = d => categoryRules[d.id] ?? level>=d.min;
const metricKnown = (id,min) => metricRules[id] ?? level>=min;
const contextual = d => !['battle','effects'].includes(d.id)||inCombat;
function available(d){return known(d)&&contextual(d)&&content(d.id).trim().length>0}
function meter(id,label,value,tone,min=0,max=100,unit=''){
 if(!metricKnown(id,min)) return '';
 return `<div class="metric" data-metric="${id}"><div class="metric-caption"><span>${label}</span><b>${value} <small>/ ${max}${unit}</small></b></div><div class="track" style="--value:${Math.min(100,value/max*100)}%;--tone:${tone}"><i></i></div></div>`;
}
function content(id){
 if(id==='carry')return meter('carry','负重',18.4,'#b6a078',1,30,' kg')+(metricKnown('carry',1)?'<div class="capacity-left"><span>剩余容量</span><strong>11.6 <small>kg</small></strong></div>':'')+(metricKnown('weight',2)?'<div class="ruled-row"><span>体重</span><b>67.2 kg</b></div>':'');
 if(id==='body')return `<div class="body-readings">${metricKnown('body_detail',2)?'<div class="field-caption">累计损毁 / 损毁上限</div>':''}${['头部','胸部','腹部','左臂','右臂','左腿','右腿'].map((label,i)=>{const damage=i===3?18:0;return '<div class="body-reading'+(damage?' hurt':'')+'"><div class="body-reading-caption"><span>'+label+'</span><b>'+(metricKnown('body_detail',2)?damage+' <small>/ 100</small>':damage?'受伤':'无碍')+'</b></div>'+(metricKnown('body_detail',2)?'<div class="body-damage-track" aria-hidden="true"><i style="width:'+damage+'%"></i></div>':'')+'</div>';}).join('')}</div>`;
 if(id==='survival')return meter('satiety','饱食',72,'#b6a078',0,150)+meter('thirst','水分',58,'#8aa4a4')+meter('stamina','体力',63,'#9daf91',1)+meter('energy','精力',86,'#b1b99b',1)+meter('fatigue','疲劳',24,'#a8a18b',1)+meter('nutrition','营养',64,'#8d9b72',2);
 if(id==='growth')return `<div class="attributes">${['筋骨','柔韧','呼吸','身手','专注'].map((x,i)=>`<div><span>${x}</span><strong>${[12,9,11,14,10][i]}</strong></div>`).join('')}</div><div class="ruled-row"><span>潜能</span><b>240</b></div><div class="ruled-row"><span>战斗经验</span><b>1,280</b></div>`;
 if(id==='effects')return `<div class="effect"><span>⌖</span><div><strong>试探 <b class="effect-count">× 2</b></strong><p>${metricKnown('effect_detail',2)?'下一次摆拳伤害 +10%':'已识别：试探'}</p></div></div>${metricKnown('effect_detail',2)?'<div class="effect-facts"><span>剩余 <b>6 刻</b></span><span>上限 <b>3 层</b></span></div><p class="tiny-note">摆拳会消耗全部试探层数。</p>':''}`;
 if(id==='environment')return (metricKnown('weather',0)?'<span class="env-weather">'+icon('environment')+'<b>晴</b></span>':'')+(metricKnown('time',1)?'<span class="env-time">申时 <b>15:42</b></span>':'')+(metricKnown('date',1)?'<span class="env-date">九月十二</span>':'');
 if(id==='journal')return `<div class="journal">${known(definitions.find(d=>d.id==='body'))?`<p>${metricKnown('time',1)?'<time>15:42</time>':''}<span>左臂受伤</span>${metricKnown('body_detail',2)?'<b class="event-delta danger">损毁 +18</b>':''}</p>`:''}${metricKnown('stamina',1)?`<p>${metricKnown('time',1)?'<time>15:41</time>':''}<span>移动</span><b class="event-delta">体力 −0.3</b></p>`:''}<p>${metricKnown('time',1)?'<time>15:40</time>':''}<span>进入区域</span><b class="event-delta">旧街后院</b></p></div>`;
 if(id==='battle')return meter('qi','气力',68,'#b6a078',1)+meter('diqi','底气',45,'#8aa4a4',2);
 return '';
}
function icon(id){
 const paths={carry:'M6 7h12l1 13H5L6 7Z M9 7V5a3 3 0 0 1 6 0v2 M9 12h6',body:'M12 3 20 6v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z M7 12h3l2-4 2 8 2-4h2',survival:'M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z M8 15c0 2 1 3 3 3',growth:'M5 20V13h4v7 M10 20V9h4v11 M15 20V4h4v16',effects:'m12 2 2 7 7 3-7 3-2 7-2-7-7-3 7-3 2-7Z',environment:'M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',journal:'M5 3h14v18H5Z M8 7h8 M8 11h8 M8 15h5',battle:'m5 3 14 14-2 2L3 5V3h2Z M15 3h6v2L8 18 M14 17l5-5 M5 13l6 6'};
 return '<svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[id]+'"/></svg>';
}
function panelHTML(d,i){return `<section class="panel${folded[d.id]?' folded':''}" data-panel="${d.id}" aria-label="${d.title}"><header class="panel-head"><span class="sigil" aria-hidden="true"><span class="sigil-raw">${d.icon}</span>${icon(d.id)}</span><h2>${d.title}</h2><button data-action="fold" aria-label="${folded[d.id]?'展开':'收起'}${d.title}" aria-expanded="${!folded[d.id]}">${folded[d.id]?'+':'−'}</button><button data-action="close" aria-label="关闭${d.title}">×</button></header><div class="panel-content">${content(d.id)}</div></section>`}
function render(){
 const visible=definitions.filter(d=>available(d)&&preference[d.id]!==false);
 host.innerHTML=visible.filter(d=>d.id!=='environment').map(panelHTML).join('');
 const environment=$('#top-environment'),envDef=definitions.find(d=>d.id==='environment');
 const showEnvironment=available(envDef)&&preference.environment!==false;
 environment.hidden=!showEnvironment;environment.innerHTML=showEnvironment?content('environment'):'';
 arrange(); renderManager(); stateLabel();
}
function stateLabel(){const a=definitions.filter(available);$('#state-label').innerHTML=`认知：${names[level]}<br>可用 ${a.length} 栏 · 显示 ${a.filter(d=>preference[d.id]!==false).length} 栏`}
function renderManager(){
 $('#panel-list').innerHTML=definitions.filter(available).map(d=>`<label><input type="checkbox" data-toggle="${d.id}" ${preference[d.id]!==false?'checked':''}><span>${d.title}${d.id==='environment'?' · 顶部栏':''}</span><small>${preference[d.id]===false?'已关闭':folded[d.id]?'已收起':'显示中'}</small></label>`).join('');
}
function defaultBox(id){
 const w=stage.clientWidth,h=Math.max(stage.clientHeight,760),right=w-276;
 if(w<760){const index=definitions.filter(d=>available(d)&&preference[d.id]!==false).findIndex(d=>d.id===id);return [14,index*300+14,w-28]}
 if(variant==='A')return ({body:[24,22,272],carry:[24,372,272],survival:[right,182,252],growth:[right,h-219,252],effects:[320,22,256],environment:[right,22,252],journal:[320,h-190,Math.max(240,Math.min(370,w-620))],battle:[320,186,256]})[id];
 if(variant==='B')return ({body:[24,22,252],carry:[24,372,252],survival:[292,22,252],growth:[292,400,252],effects:[564,186,256],environment:[w-280,22,256],journal:[564,416,300],battle:[564,22,256]})[id];
 const ref=document.body.classList.contains('ui-reference-study'),cw=Math.min(ref?340:282,(w-(ref?64:84))/4),by=h-344,start=(w-(cw*4+36))/2;
 if(ref)return ({body:[start,by,cw],survival:[start+cw+12,by,cw],growth:[start+2*(cw+12),by,cw],carry:[start+3*(cw+12),by,cw],effects:[24,22,272],environment:[w-Math.min(310,w*.23)-18,22,Math.min(310,w*.23)],journal:[w-Math.min(360,w*.28)-18,22,Math.min(360,w*.28)],battle:[w/2-120,22,240]})[id];
 return ({body:[start,by,cw],survival:[start+(cw+12),by,cw],growth:[start+2*(cw+12),by,cw],carry:[start+3*(cw+12),by,cw],effects:[24,22,272],environment:[w-280,22,256],journal:[w-344,22,320],battle:[w/2-120,22,240]})[id];
}
function clampBox(el,x,y){const mobile=stage.clientWidth<760||stage.clientHeight<760;return [Math.max(0,Math.min(x,stage.clientWidth-el.offsetWidth)),Math.max(0,mobile?y:Math.min(y,stage.clientHeight-el.offsetHeight))]}
function arrange(){
 host.querySelectorAll('.panel').forEach(el=>el.style.height='');
 if(stage.clientWidth<760){let y=14;host.querySelectorAll('.panel').forEach(el=>{el.style.width=stage.clientWidth-28+'px';const custom=positions[variant+':'+el.dataset.panel];el.style.left=(custom?.x??14)+'px';el.style.top=(custom?.y??y)+'px';y+=el.offsetHeight+14;});host.style.height=y+20+'px';return;}
 host.querySelectorAll('.panel').forEach(el=>{
 const id=el.dataset.panel;const [x,y,width]=defaultBox(id);
 el.style.width=width+'px';
 const custom=positions[variant+':'+id];
 const p=clampBox(el,custom?.x??x,custom?.y??y);
 el.style.left=p[0]+'px';el.style.top=p[1]+'px';
 });
 if(variant==='C'){
 const bottom=[...host.querySelectorAll('.panel')].filter(el=>['body','survival','growth','carry'].includes(el.dataset.panel)&&!positions[variant+':'+el.dataset.panel]);
 if(document.body.classList.contains('ui-reference-study')){const expanded=bottom.filter(el=>!el.classList.contains('folded'));const maxH=Math.max(0,...expanded.map(el=>el.offsetHeight));expanded.forEach(el=>el.style.height=maxH+'px');}
 const y=Math.min(defaultBox('body')[1],Math.max(stage.clientHeight,760)-Math.max(0,...bottom.map(el=>el.offsetHeight))-16);
 bottom.forEach(el=>el.style.top=Math.max(0,y)+'px');
 }
 host.style.height=stage.clientWidth<760?definitions.filter(d=>available(d)&&preference[d.id]!==false).length*300+20+'px':Math.max(stage.clientHeight,760)+'px';
}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2200)}
function setVariant(value){variant=variants[value]?value:'A';document.body.dataset.variant=variant;$('#variant-label').textContent=variant+' / '+variants[variant][0];$('#variant-desc').textContent=variants[variant][1];const u=new URL(location.href);u.searchParams.set('variant',variant);history.replaceState(null,'',u);render();drawScene()}
function cycle(dir){const keys=Object.keys(variants);setVariant(keys[(keys.indexOf(variant)+dir+3)%3])}
function setVisualStyle(style){
 const mode=['original','polished','material','reference'].includes(style)?style:'reference';
 document.body.classList.toggle('ui-polished',mode!=='original');document.body.classList.toggle('ui-material-study',mode==='material'||mode==='reference');document.body.classList.toggle('ui-reference-study',mode==='reference');document.body.dataset.visualStyle=mode;
 $('#visual-style').setAttribute('aria-pressed',String(mode!=='original'));$('#visual-style').textContent={reference:'参考图版 · 对比上版',material:'立体材质 · 对比平面',polished:'平面精修 · 对比原样',original:'原样 · 查看立体'}[mode];
 const u=new URL(location.href);u.searchParams.set('style',mode);history.replaceState(null,'',u);arrange();drawScene();
}
$('#visual-style').onclick=()=>setVisualStyle({reference:'material',material:'polished',polished:'original',original:'reference'}[document.body.dataset.visualStyle]);
$('#prev').onclick=()=>cycle(-1);$('#next').onclick=()=>cycle(1);
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,button,[contenteditable]'))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();cycle(e.key==='ArrowLeft'?-1:1)}if(e.key==='Escape')showManager(false)});
function showManager(open){$('#manager').hidden=!open;$('#manage').setAttribute('aria-expanded',String(open))}
$('#manage').onclick=()=>showManager($('#manager').hidden);$('#manager-close').onclick=()=>showManager(false);
$('#panel-list').onchange=e=>{const id=e.target.dataset.toggle;if(id){preference[id]=e.target.checked;render()}};
$('#lock').onchange=e=>{locked=e.target.checked;toast(locked?'布局已锁定':'可以拖动各面板的标题栏')};
$('#reset').onclick=()=>{Object.keys(positions).forEach(k=>delete positions[k]);Object.keys(preference).forEach(k=>delete preference[k]);Object.keys(folded).forEach(k=>delete folded[k]);render();toast('已恢复布局，认知范围保持不变')};
function setLevel(v){level=Math.max(0,Math.min(2,Number(v)||0));$('#knowledge').value=String(level);render()}
$('#knowledge').onchange=e=>{setLevel(e.target.value);toast('当前认知：'+names[level])};
function setCombat(v){inCombat=!!v;$('#combat').setAttribute('aria-pressed',String(inCombat));$('#combat').textContent=inCombat?'离开战斗':'进入战斗';render()}
$('#combat').onclick=()=>setCombat(!inCombat);
host.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button)return;const id=button.closest('.panel').dataset.panel;if(button.dataset.action==='close'){preference[id]=false;toast('可从右上角「面板管理」重新显示')}else folded[id]=!folded[id];render()});
let drag=null;
host.addEventListener('pointerdown',e=>{const el=e.target.closest('.panel');if(el)el.style.zIndex=++z;if(!el||locked||e.button!==0||!e.target.closest('.panel-head')||e.target.closest('button'))return;const handle=e.target.closest('.panel-head');drag={el,handle,id:el.dataset.panel,x:e.clientX,y:e.clientY,left:parseFloat(el.style.left),top:parseFloat(el.style.top),pointer:e.pointerId};handle.setPointerCapture(e.pointerId);el.classList.add('dragging');e.preventDefault()});
host.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;let [x,y]=clampBox(drag.el,drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y);if(x<12)x=8;if(y<12)y=8;drag.el.style.left=x+'px';drag.el.style.top=y+'px'});
function endDrag(){if(!drag)return;positions[variant+':'+drag.id]={x:parseFloat(drag.el.style.left),y:parseFloat(drag.el.style.top)};drag.el.classList.remove('dragging');drag=null}
host.addEventListener('pointerup',endDrag);host.addEventListener('pointercancel',endDrag);host.addEventListener('lostpointercapture',endDrag);
// Prototype integration surface: category/field knowledge is independent of user preference.
window.MossUIDemo={
 setKnowledgeLevel:setLevel,
 setCategoryKnown(id,value){if(!definitions.some(d=>d.id===id))return false;categoryRules[id]=!!value;render();return true},
 setMetricKnown(id,value){metricRules[id]=!!value;render()},
 setVisible(id,value){if(!definitions.some(d=>d.id===id))return false;preference[id]=!!value;render();return true},
 setCombat,
 getState(){return {variant,level,inCombat,locked,categories:definitions.filter(known).map(d=>d.id),visible:definitions.filter(d=>available(d)&&preference[d.id]!==false).map(d=>d.id),positions:structuredClone(positions)}}
};
// Illustrative courtyard, using existing non-character props. No game bootstrap or save writes.
const canvas=$('#scene'),ctx=canvas.getContext('2d'),images={};
for(const key of ['stove','barrel','bed','sewing','warehouse']){const img=new Image();img.onload=()=>{images[key]=img;drawScene()};img.src='assets/map/isometric/interactive-devices-v1/'+key+'.png'}
function drawScene(){
 const w=stage.clientWidth,h=stage.clientHeight,dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle='#18221d';ctx.fillRect(0,0,w,h);
 const reference=document.body.classList.contains('ui-reference-study');
 const cx=variant==='B'?w*.71:reference?w*.48:w*.53,cy=variant==='C'?(reference?h*.40:h*.46):h*.57,scale=Math.min(w/1200,h/650,1.15),tw=112*scale,th=56*scale;
 function point(x,y,z=0){return [cx+(x-y)*tw/2,cy+(x+y)*th/2-z*scale]}
 function polygon(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}}
 for(let x=-5;x<=5;x++)for(let y=-5;y<=5;y++){let n=Math.abs((x*17+y*31)%7);polygon([point(x,y),point(x+1,y),point(x+1,y+1),point(x,y+1)],['#394238','#353f35','#3d453a','#333e33','#41483c','#3a4438','#374033'][n],'#8c937b15');const p=point(x+.5,y+.5);ctx.fillStyle='#afb29313';ctx.fillRect(p[0]-5,p[1],12,1)}
 // Low back walls emphasize the isometric scale without covering the HUD.
 for(let a=-5;a<5;a++){polygon([point(a,-5),point(a+1,-5),point(a+1,-5,70),point(a,-5,70)],'#465044','#87907333');polygon([point(-5,a),point(-5,a+1),point(-5,a+1,70),point(-5,a,70)],'#303d33','#87907333')}
 const props=[['warehouse',-3,-3,122],['bed',-3,0,112],['sewing',0,-3,104],['stove',3,-3,106],['barrel',3,1,76]];
 props.sort((a,b)=>(a[1]+a[2])-(b[1]+b[2]));
 for(const [key,x,y,size]of props){const p=point(x,y),img=images[key];if(!img)continue;ctx.fillStyle='#0b160e66';ctx.beginPath();ctx.ellipse(p[0]+10,p[1]+3,size*.3*scale,size*.09*scale,.25,0,Math.PI*2);ctx.fill();let hh=size*scale,ww=hh*img.width/img.height;ctx.drawImage(img,p[0]-ww/2,p[1]-hh+8*scale,ww,hh)}
 const p=point(.6,.6);ctx.strokeStyle='#c5b0838c';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(p[0],p[1],20*scale,10*scale,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#d8c69b';ctx.beginPath();ctx.arc(p[0],p[1],3,0,Math.PI*2);ctx.fill();ctx.font='10px Microsoft YaHei';ctx.textAlign='center';ctx.fillText('你的位置',p[0],p[1]+29);
 const fade=ctx.createRadialGradient(cx,cy,100,cx,cy,Math.max(w,h)*.67);fade.addColorStop(0,'#101b1600');fade.addColorStop(1,'#101b16df');ctx.fillStyle=fade;ctx.fillRect(0,0,w,h);
}
window.addEventListener('resize',()=>{arrange();drawScene()});
new ResizeObserver(()=>{document.documentElement.style.setProperty('--demo-header-height',$('.demo-top').offsetHeight+'px');arrange();drawScene()}).observe($('.demo-top'));
setVariant(variant);
setVisualStyle(new URLSearchParams(location.search).get('style'));
})();
