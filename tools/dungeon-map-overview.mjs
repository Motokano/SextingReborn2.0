// Overview uses the same terrain, walls and props as the live detail view.
// It never replaces the generated map or writes a normal game save.
export function createDungeonOverview(g,canvas,onVisit){
 let projection,bounds,timer=0,drawing=false;
 const ctx=canvas.getContext('2d');
 function draw(){
  timer=0;const s=g.DungeonRuntime.getSim();if(!s||!canvas.closest('details').open||drawing)return;
  drawing=true;
  try{
   const m=s.map;projection=g.MapProjection.create(m,24,'isometric');
   const cells=[];for(let k=0;k<m.tiles.length;k++)if(m.tiles[k]!==g.RuinsSettlement.VOID)cells.push(k);
   const centers=cells.map(k=>projection.cellCenter(k%m.width,Math.floor(k/m.width)));
   bounds={x:Math.floor(Math.min(...centers.map(p=>p.x))-40),y:Math.floor(Math.min(...centers.map(p=>p.y))-85)};
   const width=Math.ceil(Math.max(...centers.map(p=>p.x))-bounds.x+40),height=Math.ceil(Math.max(...centers.map(p=>p.y))-bounds.y+45);
   if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
   ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#101a16';ctx.fillRect(0,0,width,height);ctx.translate(-bounds.x,-bounds.y);
   for(const k of cells)g.DungeonArt.terrain(ctx,k%m.width,Math.floor(k/m.width),projection);
   g.DungeonArt.ground(ctx,projection);
   cells.sort((a,b)=>a%m.width+Math.floor(a/m.width)-b%m.width-Math.floor(b/m.width)||a-b);
   for(const k of cells)g.DungeonArt.object(ctx,k%m.width,Math.floor(k/m.width),projection);
   // Small red position markers stay legible at overview scale; detail retains full pawns.
   for(const e of s.enemies){const p=projection.cellCenter(e.cell%m.width,Math.floor(e.cell/m.width));ctx.fillStyle='#df8b73';ctx.beginPath();ctx.arc(p.x,p.y-4,3,0,Math.PI*2);ctx.fill();}
   const label=(cell,text,color)=>{const p=projection.cellCenter(cell%m.width,Math.floor(cell/m.width));ctx.font='bold 27px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.lineWidth=7;ctx.strokeStyle='#101a16';ctx.strokeText(text,p.x,p.y-17);ctx.fillStyle=color;ctx.fillText(text,p.x,p.y-17);};
   label(m.entry,'入口','#a8e2ba');label(m.exit,m.floor===4?'撤离口':'下层通道','#eed08a');
   if(m.bossRoom){const room=m.rooms.find(r=>r.id===m.bossRoom.roomId);label(room.center,'头目小屋','#efb687');}
   const p=projection.cellCenter(s.player.cell%m.width,Math.floor(s.player.cell/m.width));ctx.strokeStyle='#fff3b0';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.stroke();
  }finally{drawing=false;}
 }
 function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(draw,180);}
 canvas.addEventListener('click',e=>{
  if(!projection||!bounds)return;const rect=canvas.getBoundingClientRect(),p=projection.pick((e.clientX-rect.left)*canvas.width/rect.width+bounds.x,(e.clientY-rect.top)*canvas.height/rect.height+bounds.y);
  if(!p)return;const s=g.DungeonRuntime.getSim(),m=s.map,occupied=new Set(s.enemies.map(e=>e.cell)),candidates=[];
  for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=p.x+dx,y=p.y+dy,k=y*m.width+x;if(x>=0&&y>=0&&x<m.width&&y<m.height&&!occupied.has(k)&&g.RuinsSettlement.walkable(s.staticTiles[k])&&!s.doors.some(d=>d.cell===k&&d.closed))candidates.push({k,d:dx*dx+dy*dy});}
  candidates.sort((a,b)=>a.d-b.d);if(candidates.length)onVisit(candidates[0].k);
 });
 canvas.closest('details').addEventListener('toggle',schedule);
 return{draw,schedule};
}
