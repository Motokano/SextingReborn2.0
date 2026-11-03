// Isolated art preview; production drawing with an in-memory story flag, no player saves.
const base='assets/map/isometric/street-thugs-marked-v1/';
const json=async p=>{const r=await fetch(p);if(!r.ok)throw Error(p);return r.json();};
const load=async src=>{const image=new Image();image.src=src;await image.decode();return image;};
let mode=new URLSearchParams(location.search).get('view')==='board'?'board':'detail',marked=true,gore=false;
globalThis.NPCSystem={getFlagValue:key=>key===DungeonCorpseArt.GORE_FLAG?gore:undefined};
try{
 await DungeonCorpseArt.ready;
 const manifest=await json(base+'manifest.json');
 const pm=await json('assets/map/isometric/player-atlas-v1/manifest.json'),ps=pm.states[0];
 const pi=await load('assets/map/isometric/player-atlas-v1/'+ps.file);
 const player={src:'player',crop:ps.crop,anchor:[ps.crop[0]+ps.anchor[0],ps.crop[1]+ps.anchor[1]],scaleAt144:pm.displayBaseWidth/ps.baseWidth*1.25,image:pi};
 const prepare=spec=>{spec.shadow=TileRendererV2.makeGroundShadow(spec.image,{...spec,width:spec.crop[2]*spec.scaleAt144},[spec.crop[2]*spec.scaleAt144*.45,spec.src==='player'?8.75:12]);return spec;};
 prepare(player);
 const entries=await Promise.all(manifest.entries.map(async entry=>({...entry,normal:prepare({...entry.normal,image:await load(entry.normal.src)}),marked:prepare({...entry.marked,image:await load(entry.marked.src)})})));
 const cards=entries.map(entry=>{
  const section=document.createElement('section');section.className='card';section.dataset.enemy=entry.id;
  section.innerHTML='<h2>'+entry.name+'</h2><div class="art-scroll"><canvas aria-label="'+entry.name+'标记前后对照"></canvas></div><div class="links"><a target="_blank" href="'+entry.normal.src+'">未标记原图</a><a target="_blank" href="'+entry.marked.src+'">标记原图</a></div>';
  document.querySelector('#gallery').append(section);return {entry,canvas:section.querySelector('canvas')};
 });
 function pawn(ctx,spec,x,y,zoom=1,shadow=false){
  const [bx,by,bw,bh]=spec.crop,[ax,ay]=spec.anchor,f=spec.scaleAt144*zoom;
  if(shadow){ctx.save();ctx.translate(x,y);ctx.scale(zoom,zoom);ctx.drawImage(spec.shadow,...spec.shadow.drawBounds);ctx.restore();}
  ctx.drawImage(spec.image,bx,by,bw,bh,x+(bx-ax)*f,y+(by-ay)*f,bw*f,bh*f);
 }
 function label(ctx,text,x,y){ctx.fillStyle='#dedbc5';ctx.font='13px Microsoft YaHei';ctx.textAlign='center';ctx.fillText(text,x,y);}
 function render(){
  document.body.dataset.mode=mode;
  for(const {entry,canvas}of cards){
   const w=544,h=mode==='board'?320:220,dpr=window.devicePixelRatio||1;
   canvas.width=w*dpr;canvas.height=h*dpr;
   const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   const next=marked?entry.marked:entry.normal;
   if(mode==='detail'){
    ctx.fillStyle='#283b30';ctx.fillRect(0,0,w,h);
    pawn(ctx,entry.normal,140,164,2.1);pawn(ctx,next,404,164,2.1);
    label(ctx,'未标记',140,199);label(ctx,marked?'已标记':'未标记',404,199);
   }else{
    const projection=MapProjection.create({width:3,height:3},144/Math.SQRT2,'isometric'),center=projection.cellCenter(1,1);
    ctx.save();ctx.translate(w/2-center.x,160-center.y);
    for(let y=0;y<3;y++)for(let x=0;x<3;x++){
     ctx.beginPath();projection.cellPolygon(x,y).forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();
     ctx.fillStyle=(x+y)%2?'#485b47':'#40533f';ctx.fill();ctx.strokeStyle='#a9b18b55';ctx.stroke();
    }
    for(const [spec,x,y,text]of [[player,0,2,'主角'],[entry.normal,1,1,'未标记'],[next,2,0,marked?'已标记':'未标记']]){
     const c=projection.cellCenter(x,y);
     if(spec===player)pawn(ctx,spec,c.x,c.y+manifest.groundOffsetY,1,true);
     else DungeonCorpseArt.draw(ctx,{enemyId:entry.enemyIds[0],marked:text==='已标记'},c.x,c.y,144);
     label(ctx,text,c.x,c.y+43);
    }
    ctx.restore();label(ctx,'144px格宽 · 人物125%',w/2,300);
   }
  }
  for(const id of ['detail','board'])document.getElementById(id).setAttribute('aria-pressed',String(mode===id));
  document.querySelector('#marker').textContent='标记：'+(marked?'开':'关');document.querySelector('#marker').setAttribute('aria-pressed',String(marked));
  const toggle=document.querySelector('#gore');toggle.hidden=mode!=='board';toggle.textContent='血腥开关：'+(gore?'开':'关');toggle.setAttribute('aria-pressed',String(gore));
  document.body.dataset.ready='true';document.querySelector('#status').textContent='';
 }
 for(const id of ['detail','board'])document.getElementById(id).onclick=()=>{mode=id;render();};
 document.querySelector('#marker').onclick=()=>{marked=!marked;render();};
 document.querySelector('#gore').onclick=()=>{gore=!gore;DungeonCorpseArt.refresh();};
 DungeonCorpseArt.setInvalidation(()=>requestAnimationFrame(render));render();
}catch(error){document.querySelector('#status').textContent='载入失败：'+error.message;console.error(error);}
