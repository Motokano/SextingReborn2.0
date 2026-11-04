import {LAYOUT_KEY,OBJECT_NAMES,objects,captureLayout,movedLayout,planLayout,applyLayout} from './street-thug-boss-room-layout-editor-model.mjs';

export function installLayoutEditor({g,art,frame,refresh,message,onMode}){
 const $=id=>document.getElementById(id),canvas=$('layout-overlay'),ctx=canvas.getContext('2d'),board=$('board');
 const map=()=>g.DungeonRuntime.getSim().map,defaults=captureLayout(map());
 const temporary=new URLSearchParams(location.search).has('temporary');
 let editing=false,selected='',drag=null,hover='',history=[],cursor=0;
 const select=$('layout-object');
 for(const p of objects(map())){const o=document.createElement('option');o.value=p.uid;o.textContent=OBJECT_NAMES[p.uid];select.append(o);}
 const current=()=>objects(map()).find(p=>p.uid===selected);
 const occupied=()=>{const p=g.GameEngine.getState();return [p.y*map().width+p.x,...g.GameEngine.getMap().enemies.map(e=>e.y*map().width+e.x)];};
 function persist(){if(temporary){$('layout-save').textContent='临时试摆，不覆盖已有布局';return;}try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(captureLayout(map())));$('layout-save').textContent='布局已自动保存';}catch{$('layout-save').textContent='浏览器无法保存，请导出布局';}}
 function controls(){
  $('layout-undo').disabled=cursor<=0;$('layout-redo').disabled=cursor>=history.length-1;
  for(const b of document.querySelectorAll('[data-layout-step]'))b.disabled=!editing||!selected;
  const p=current();$('layout-selection').textContent=p?`${OBJECT_NAMES[p.uid]} · 第${p.cell%map().width-3}列、第${Math.floor(p.cell/map().width)-3}行 · 占${(p.footprint||[p.cell]).length}格`:'直接拖动物件；被遮住的物件可从左侧选择';
  $('layout-mode').textContent=editing?'布置模式 · 切换试走':'试走模式 · 开始布置';$('layout-mode').setAttribute('aria-pressed',String(editing));
 }
 function choose(uid){selected=uid||'';select.value=selected;controls();}
 function apply(layout,label,{record=true,save=true}={}){
  const relocated=applyLayout(g,layout);
  if(record){history=history.slice(0,cursor+1);history.push(captureLayout(map()));if(history.length>100)history.shift();cursor=history.length-1;}
  if(save)persist();refresh();controls();message(label+(relocated.length?'（'+relocated.join('、')+'已移到旁边的空地）':''));
 }
 function commit(uid,dx,dy){
  if(!dx&&!dy)return;
  try{const next=movedLayout(map(),uid,dx,dy);planLayout(map(),next,occupied());apply(next,OBJECT_NAMES[uid]+'已放好，可继续拖动其他物件。');}catch(e){message(e.message+'，已保留原位置。');}
 }
 function cancel(){if(drag&&canvas.hasPointerCapture(drag.pointerId))canvas.releasePointerCapture(drag.pointerId);drag=null;canvas.style.cursor='grab';}
 function setEditing(value){cancel();editing=value;canvas.hidden=!value;canvas.style.pointerEvents=value?'auto':'none';onMode(value);controls();refresh();}
 // The iframe can be CSS-scaled, and its camera translates the map independently.
 // Convert pointer coordinates through both transforms, retaining the grab offset.
 function space(){
  const fr=frame.getBoundingClientRect(),br=board.getBoundingClientRect(),gr=g.document.getElementById('map-grid').getBoundingClientRect();
  const scale=fr.width/frame.offsetWidth;
  return {scale,x:fr.left-br.left-board.clientLeft+gr.left*scale,y:fr.top-br.top-board.clientTop+gr.top*scale,br};
 }
 function point(e){const t=space();return {x:(e.clientX-t.br.left-board.clientLeft-t.x)/t.scale,y:(e.clientY-t.br.top-board.clientTop-t.y)/t.scale};}
 function delta(point,start){const pr=art.projection,dx=(point.x-start.x)/pr.tileWidth,dy=(point.y-start.y)/pr.tileHeight;return [Math.round(dx+dy),Math.round(dy-dx)];}
 function candidate(e){
  [drag.dx,drag.dy]=delta(point(e),drag.start);
  try{planLayout(map(),movedLayout(map(),selected,drag.dx,drag.dy),occupied());drag.error='';}catch(error){drag.error=error.message;}
 }
 canvas.addEventListener('pointerdown',e=>{
  if(!editing||e.button!==0||!art.projection)return;e.preventDefault();canvas.focus({preventScroll:true});
  const at=point(e),uid=art.hitTest(at.x,at.y);if(!uid){choose('');return;}
  choose(uid);drag={pointerId:e.pointerId,start:at,dx:0,dy:0,error:''};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';
 });
 canvas.addEventListener('pointermove',e=>{
  if(drag){candidate(e);message(drag.error?drag.error+'，松手会回到原位。':'松手放下 · 按 Esc 取消');}
  else{const at=point(e);hover=art.hitTest(at.x,at.y)||'';canvas.style.cursor=hover?'grab':'default';}
 });
 canvas.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointerId)return;candidate(e);const {dx,dy}=drag;cancel();commit(selected,dx,dy);});
 canvas.addEventListener('pointercancel',()=>{cancel();message('已取消拖动，物件留在原位。');});
 canvas.addEventListener('lostpointercapture',()=>{drag=null;});
 canvas.addEventListener('pointerleave',()=>{hover='';});
 canvas.addEventListener('keydown',e=>{
  if(e.key==='Escape'){cancel();message('已取消拖动。');return;}
  if(!editing||!selected)return;
  const step={ArrowUp:[0,-1],ArrowRight:[1,0],ArrowDown:[0,1],ArrowLeft:[-1,0]}[e.key];
  if(step){e.preventDefault();cancel();commit(selected,...step);}
 });
 function draw(){
  if(editing&&art.projection){
   const w=board.clientWidth,h=board.clientHeight,dpr=devicePixelRatio||1;
   if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   const t=space(),pr=art.projection,m=map();ctx.translate(t.x,t.y);ctx.scale(t.scale,t.scale);
   const p=current()||objects(m).find(p=>p.uid===hover);
   if(p){
    const dx=drag?.dx||0,dy=drag?.dy||0,color=drag?.error?'#ee8673':'#e8c878';
    // Ground registration and native facing are identical to the actual renderer.
    if(drag&&(dx||dy)){
     const a=pr.cellCenter(p.cell%m.width+(p.offsetX||0)+dx,Math.floor(p.cell/m.width)+(p.offsetY||0)+dy);
     const live=g.DungeonRuntime.getSim().lootPoints.find(q=>q.uid===p.uid)||p;
     ctx.save();ctx.globalAlpha=.77;art.paintObject(ctx,live,a.x,a.y,pr.cellPx);ctx.restore();
    }
    ctx.strokeStyle=color;ctx.fillStyle=drag?.error?'#ef735d35':'#e8c87825';ctx.lineWidth=2.5/t.scale;
    for(const k of p.footprint||[p.cell]){const q=pr.cellPolygon(k%m.width+dx,Math.floor(k/m.width)+dy);ctx.beginPath();q.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](v.x,v.y));ctx.closePath();ctx.fill();ctx.stroke();}
    const a=pr.cellCenter(p.cell%m.width+dx,Math.floor(p.cell/m.width)+dy);
    ctx.font=`${12/t.scale}px Microsoft YaHei`;const label=OBJECT_NAMES[p.uid]+(drag?.error?' · 无法放置':''),tw=ctx.measureText(label).width;
    ctx.fillStyle='#18231fee';ctx.fillRect(a.x-tw/2-7/t.scale,a.y+24/t.scale,tw+14/t.scale,24/t.scale);ctx.fillStyle=color;ctx.fillText(label,a.x-tw/2,a.y+41/t.scale);
   }
  }
  requestAnimationFrame(draw);
 }
 select.onchange=()=>{cancel();if(!editing)setEditing(true);choose(select.value);};
 $('layout-mode').onclick=()=>{setEditing(!editing);message(editing?'拖动物件布置房间；金色可放，红色不能放。':'可以在棋盘上试走，检查新的通路。');};
 $('layout-undo').onclick=()=>{cancel();if(cursor>0)apply(history[--cursor],'已撤销上一步。',{record:false});};
 $('layout-redo').onclick=()=>{cancel();if(cursor<history.length-1)apply(history[++cursor],'已重做。',{record:false});};
 $('layout-default').onclick=()=>{cancel();apply(defaults,'已恢复默认布置；可以撤销。');};
 for(const b of document.querySelectorAll('[data-layout-step]'))b.onclick=()=>{cancel();commit(selected,...b.dataset.layoutStep.split(',').map(Number));};
 $('layout-export').onclick=()=>{
  const blob=new Blob([JSON.stringify(captureLayout(map()),null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='地痞据点-我的布局.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('已导出布局，之后可导入继续调整，也可以把文件发给我。');
 };
 $('layout-import').onclick=()=>$('layout-file').click();
 $('layout-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>50000)throw Error('布局文件过大');const layout=JSON.parse(await file.text());cancel();apply(layout,'布局已导入。');}catch(error){message('未导入：'+error.message+'。原布局保持不变。');}finally{e.target.value='';}
 };
 try{const saved=temporary?null:localStorage.getItem(LAYOUT_KEY);if(saved){applyLayout(g,JSON.parse(saved));$('layout-save').textContent='已恢复上次布局';}}catch{$('layout-save').textContent='旧草稿无法读取，当前使用默认布置';}
 if(temporary)$('layout-save').textContent='临时试摆，不覆盖已有布局';
 history=[captureLayout(map())];setEditing(true);draw();
 return {setEditing,controls,reapply(){cancel();apply(history[cursor],'人物和容器已重置，当前布局已保留。',{record:false,save:false});}};
}
