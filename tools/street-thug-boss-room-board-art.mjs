import {groundRegistration} from './street-thug-boss-room-projection.mjs';
import {ROOM_SCALE} from './street-thug-boss-room-scale.mjs';
// Review controls use the same registered paint, walls and assets as formal floors.
export async function installBossRoomArt(g){
 const shared=g.DungeonBossRoomArt,root='assets/dungeon/street-thug-boss-room-v6/',v5=g.DungeonBossRoomData.art;
 const props=shared.props,containers=shared.containers,images=new Map();
 await Promise.all([...props.values(),...containers.values(),...Object.values(v5.textures).map(src=>({src:root+src}))].flatMap(p=>p.src?[p.src]:[p.unsearched.src,p.searched.src]).map(async src=>{const im=shared.image(src);await im.decode();images.set(src,im);}));
 const paint=shared.paint,oldDraw=g.RuinsOutpostDecor.draw;
 const options=Object.assign(shared.options,{grid:false,directions:false,hits:[]}),architecture=shared.architecture;
 // Hit-test the visible painted pixels, not a tall sprite's transparent box.
 const masks=new Map();
 function record(p,a,x,y,s){options.hits.push({p,a,x,y,s});}
 options.hitTest=(x,y)=>{
  for(const h of [...options.hits].reverse()){
   const {p,a,s}=h;let dx=x-h.x,dy=y-h.y;
   if(!a){if(Math.abs(dx)<s*.45&&dy>-s*(p.shape==='column'?1.24:.60)&&dy<s*.27)return p.uid;continue;}
   const f=a.width*(s*Math.SQRT2/144)/(a.bodyWidth||a.crop[2]);
   if(p.flip)dx=-dx;const mat=groundRegistration(a.groundSlopes);dy=(dy-mat[1]*dx)/mat[3];
   const sx=dx/f+a.anchor[0]-a.crop[0],sy=dy/f+a.anchor[1]-a.crop[1];
   if(sx<0||sy<0||sx>=a.crop[2]||sy>=a.crop[3])continue;
   if(!masks.has(a.src)){const c=g.document.createElement('canvas');c.width=256;c.height=Math.max(1,Math.round(256*a.crop[3]/a.crop[2]));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(images.get(a.src),...a.crop,0,0,c.width,c.height);masks.set(a.src,{w:c.width,h:c.height,data:ctx.getImageData(0,0,c.width,c.height).data});}
   const mask=masks.get(a.src),ix=Math.min(mask.w-1,Math.floor(sx/a.crop[2]*mask.w)),iy=Math.min(mask.h-1,Math.floor(sy/a.crop[3]*mask.h));
   if(mask.data[(iy*mask.w+ix)*4+3]>45)return p.uid;
  }
  // Tiny objects and the rug remain easy to pick by their occupied ground cells.
  const cell=options.projection?.pick(x,y),m=g.DungeonRuntime.getSim()?.map;
  if(cell&&m){const k=cell.y*m.width+cell.x;return [...m.outpostDecor,...m.lootPoints].reverse().find(p=>(p.footprint||[p.cell]).includes(k))?.uid;}
  return null;
 };
 options.paintObject=(ctx,p,x,y,s)=>{
  if(p.shape)return architecture.drawPartition(ctx,p,x,y,s);
  const container=containers.get(p.assetId),a=container?{...container[p.search?.opened?'searched':'unsearched'],width:container.width}:props.get(p.kind);
  if(a)paint(ctx,a,x,y,s,p);
 };
 g.RuinsOutpostDecor.draw=(ctx,p,x,y,s)=>{
  if(p.shape==='lowwall'||p.shape==='column'){
   record(p,null,x,y,s);architecture.drawPartition(ctx,p,x,y,s);return;
  }
  const a=props.get(p.kind);if(a){record(p,a,x,y,s);paint(ctx,a,x,y,s,p);}else oldDraw(ctx,p,x,y,s);
 };
 const oldLootDraw=g.RuinsLoot.draw;
 g.RuinsLoot.draw=(ctx,p,x,y,s,selected=false,progress=null)=>{
  const a=containers.get(p.assetId);if(!a)return oldLootDraw(ctx,p,x,y,s,selected,progress);
  x+=((p.offsetX||0)-(p.offsetY||0))*s/Math.SQRT2;y+=((p.offsetX||0)+(p.offsetY||0))*s/2;
  const state=a[p.search?.opened?'searched':'unsearched'];record(p,{...state,width:a.width},x,y,s);paint(ctx,{...state,width:a.width},x,y,s,{bodyWidth:state.bodyWidth,flip:p.flip});
  if(selected){ctx.strokeStyle='#dfc693';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,a.width*.52,a.width*.24,0,0,Math.PI*2);ctx.stroke();}
  if(progress!==null){ctx.fillStyle='#dfc693';ctx.fillRect(x-s*.4,y+s*.25,s*.8*progress,3);}
 };
 const oldGround=g.DungeonArt.ground;
 g.DungeonArt.ground=(ctx,pr)=>{
  options.projection=pr;options.hits=[];oldGround(ctx,pr);
  const m=g.DungeonRuntime.getSim()?.map;if(!m?.bossRoomReview)return;
  if(options.grid){
   ctx.save();ctx.strokeStyle='#ecc774';ctx.fillStyle='#ecc774';ctx.lineWidth=2;
   for(const p of [...m.outpostDecor,...m.lootPoints]){
    const a=props.get(p.kind)||containers.get(p.assetId);if(!a?.footprint)continue;
    const cx=p.cell%m.width+(p.offsetX||0),cy=Math.floor(p.cell/m.width)+(p.offsetY||0),[w,h]=a.footprint;
    const corners=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([dx,dy])=>pr.cellCenter(cx+dx,cy+dy));
    ctx.beginPath();corners.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](v.x,v.y));ctx.closePath();ctx.stroke();
    for(const v of corners){ctx.beginPath();ctx.arc(v.x,v.y,2.5,0,Math.PI*2);ctx.fill();}
   }
   ctx.restore();
  }
  if(!options.directions)return;
  for(const p of [...m.outpostDecor,...m.lootPoints]){
   if(!p.front||!g.DungeonRuntime.inspect(p.cell)?.terrain)continue;
   const x=p.cell%m.width+(p.offsetX||0),y=Math.floor(p.cell/m.width)+(p.offsetY||0),[dx,dy]=p.front;
   const a=pr.cellCenter(x+dx*.30,y+dy*.30),b=pr.cellCenter(x+dx*.85,y+dy*.85),angle=Math.atan2(b.y-a.y,b.x-a.x);
   ctx.save();ctx.strokeStyle='#e8c780';ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(b.x-10*Math.cos(angle-.5),b.y-10*Math.sin(angle-.5));ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-10*Math.cos(angle+.5),b.y-10*Math.sin(angle+.5));ctx.stroke();ctx.restore();
  }
 };
 options.renderScaleComparison=async canvas=>{
  await g.PlayerPawnRig.getDialoguePortrait();
  const player=g.PlayerPawnRig.getPaintFrame(),bossImage=new g.Image();bossImage.src='assets/map/isometric/street-thug-boss-v1/standing.png';await bossImage.decode();
  const boss={image:bossImage,crop:[240,40,715,1200],anchor:[597.5,1238],width:46*(g.PawnDisplayScale||1)};
  const entries=[...Object.entries(ROOM_SCALE),['door',{label:'铁门',note:'门高约91px；对照当前人物尺寸检查通行观感'}]];
  const ctx=canvas.getContext('2d'),ratio=2,totalHeight=Math.ceil(entries.length/2)*350;canvas.width=960*ratio;canvas.height=totalHeight*ratio;ctx.scale(ratio,ratio);canvas.style.width='960px';canvas.style.height=totalHeight+'px';
  const pawn=(p,x,y)=>{const f=p.width/p.crop[2];ctx.drawImage(p.image,...p.crop,x+(p.crop[0]-p.anchor[0])*f,y+(p.crop[1]-p.anchor[1])*f,p.crop[2]*f,p.crop[3]*f);};
  entries.forEach(([id,scale],i)=>{
   const row=Math.floor(i/2),left=i%2*480,top=row*350,height=350,base=top+height-105;
   ctx.fillStyle=i%2?'#26372e':'#213129';ctx.fillRect(left,top,478,height-2);
   ctx.font='14px Microsoft YaHei';ctx.fillStyle='#ead8ac';ctx.fillText(scale.label,left+15,top+24);
   ctx.strokeStyle='#6e7d6855';ctx.beginPath();ctx.moveTo(left+12,base);ctx.lineTo(left+465,base);ctx.stroke();
   pawn(player,left+42,base);pawn(boss,left+110,base);
   if(id==='door'){
    const s=144/Math.SQRT2,point=(a,b,z=0)=>({x:left+213+(a-b)*s/Math.SQRT2,y:base+.04*s+(a+b)*s/2-z*s}),poly=(q,fill,stroke)=>{ctx.beginPath();q.forEach((p,j)=>ctx[j?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}};
    g.RuinsModuleArt.door(ctx,{cell:0,dx:0,dy:1,closed:true,material:'iron'},1,point,poly,s);
   }else{
    const a=containers.has(id)?{...containers.get(id).unsearched,width:containers.get(id).width}:props.get('den-'+id);
    const f=a.width/(a.bodyWidth||a.crop[2]),matrix=groundRegistration(a.groundSlopes),foot=a.probe?.[1]||a.anchor;
    const ox=(a.crop[0]+a.crop[2]/2-a.anchor[0])*f,oy=(matrix[1]*(foot[0]-a.anchor[0])+matrix[3]*(foot[1]-a.anchor[1]))*f;
    paint(ctx,a,left+330-ox,base-oy,144/Math.SQRT2,{bodyWidth:a.bodyWidth,solid:false});
    if(a.probe){const height=(a.probe[1][1]-a.probe[0][1])*matrix[3]*f;ctx.strokeStyle='#d6bd7770';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(left+12,base-height);ctx.lineTo(left+465,base-height);ctx.stroke();ctx.setLineDash([]);}
   }
   ctx.fillStyle='#c9cfbc';ctx.font='11px Microsoft YaHei';ctx.fillText('主角',left+30,base+18);ctx.fillText('头目',left+98,base+18);ctx.fillStyle='#aab9a7';ctx.fillText(scale.note,left+14,top+height-13);
  });
 };
 return options;
}
