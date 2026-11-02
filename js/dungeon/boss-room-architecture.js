// Approved architecture shared by formal floors and the layout review.
// Thin wall faces retain the original wall-cell collision and visibility rules.
(()=>{'use strict';
const SCALE=DungeonBossRoomData.template.architecture;
function installRoomArchitecture(g,options){
 const A=g.RuinsModuleArt,oldWall=A.wall,oldDoor=A.door,oldFloor=g.RuinsOutpostDecor.floor;
 function texture(ctx,image,q,uv=[0,0,1,1]){
  if(!image?.complete||!image.naturalWidth)return;
  ctx.save();ctx.transform(q[1].x-q[0].x,q[1].y-q[0].y,q[3].x-q[0].x,q[3].y-q[0].y,q[0].x,q[0].y);
  ctx.drawImage(image,uv[0]*image.width,uv[1]*image.height,uv[2]*image.width,uv[3]*image.height,0,0,1,1);ctx.restore();
 }
 function box(ctx,point,poly,x0,y0,x1,y1,z,{shade=false}={}){
  const top=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([x,y])=>point(x,y,z));
  for(const [a,b,dark] of [[1,2,false],[2,3,true]]){
   const xy=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],q=[top[a],top[b],point(...xy[b]),point(...xy[a])];
   poly(q,dark?'#a49e87':'#bab59d');
   texture(ctx,options.wallTexture,q);if(dark)poly(q,'#23352a24');
   const skirt=[point(...xy[a],Math.min(z,.42)),point(...xy[b],Math.min(z,.42)),point(...xy[b]),point(...xy[a])];
   poly(skirt,shade?'#5e7069dd':'#6a8176ba');
   const foot=[point(...xy[a],.065),point(...xy[b],.065),point(...xy[b]),point(...xy[a])];poly(foot,'#3c5049c9');
  }
  poly(top,'#b5b39e','#56655b');
 }
 A.wall=(ctx,m,k,worldPoint,poly,s,height)=>{
  const meta=m.bossRoom||m.bossRoomReview,wx=k%m.width,wy=Math.floor(k/m.width);
  if(!meta||wx<meta.bounds[0]||wy<meta.bounds[1]||wx>meta.bounds[2]||wy>meta.bounds[3])return oldWall(ctx,m,k,worldPoint,poly,s,height);
  const dx=meta.bounds[0]-3,dy=meta.bounds[1]-3,point=(a,b,z=0)=>worldPoint(a+dx,b+dy,z);
  const [l,t,r,b]=[3,3,9,12],x=wx-dx,y=wy-dy,thick=.18;
  let x0=x-.5,x1=x+.5,y0=y-.5,y1=y+.5;
  if(x===l){x0=l+.5-thick;x1=l+.5;}else if(x===r){x0=r-.5;x1=r-.5+thick;}
  if(y===t){y0=t+.5-thick;y1=t+.5;}else if(y===b){y0=b-.5;y1=b-.5+thick;}
  x0=Math.max(x0,l+.5-thick);x1=Math.min(x1,r-.5+thick);y0=Math.max(y0,t+.5-thick);y1=Math.min(y1,b-.5+thick);
  const rear=x===l||y===t,z=rear?SCALE.wall:.15;
  ctx.save();ctx.lineWidth=Math.max(.6,s*.012);box(ctx,point,poly,x0,y0,x1,y1,z);
  if(!rear){ctx.restore();return;}
  // Wall dressing uses planes, so it follows the room axes instead of floating
  // in screen space. The south/east sides are deliberately cut away for play.
  const west=x===l&&y>t,along=west?y:x;
  const p=(u,z)=>west?point(l+.501,u,z*SCALE.wall/1.55):point(u,t+.501,z*SCALE.wall/1.55);
  const rect=(a,c,lo,hi,fill,stroke)=>poly([p(a,hi),p(c,hi),p(c,lo),p(a,lo)],fill,stroke);
  // Continuous painted dado trim and an old, unpowered conduit.
  rect(along-.5,along+.5,.53,.552,'#c6c5a687');
  rect(along-.5,along+.5,1.36,1.38,'#5e6b61');
  for(const u of [along-.36,along+.35])rect(u,u+.025,1.335,1.405,'#858d7d');
  // A two-bay rear window and a single side window; shutters and panes remain
  // visibly dirty, with cool daylight rather than mains-powered illumination.
  if((!west&&x===8)||(west&&y===8)){
   rect(along-.47,along+.47,.69,1.29,'#3f514d','#c4c2a5');
   rect(along-.41,along+.41,.75,1.23,'#829890');
   rect(along-.38,along+.38,.97,1.2,'#afbaaa88');
   rect(along-.02,along+.02,.72,1.26,'#425b55');
   rect(along-.44,along+.44,.97,1.005,'#425b55');
   rect(along-.50,along+.51,.65,.70,'#adb49f','#4a5b50');
   const crack=[p(along+.2,1.19),p(along+.1,1.07),p(along+.18,1.02),p(along+.09,.89)];
   ctx.beginPath();crack.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](v.x,v.y));ctx.strokeStyle='#d2d5bc90';ctx.lineWidth=.8;ctx.stroke();
   if(west){ // A salvaged sheet covers one broken pane, without blocking all daylight.
    poly([p(along+.05,.77),p(along+.38,.79),p(along+.38,.97),p(along+.05,.94)],'#726e56','#394c40');
    rect(along+.08,along+.105,.81,.84,'#b6b49a');rect(along+.32,along+.345,.91,.94,'#b6b49a');
   }
  }
  if(!west&&x===7){ // Old fluorescent tube is off.
   rect(6.57,7.43,1.37,1.48,'#4c5b54','#929a88');rect(6.63,7.37,1.405,1.45,'#c9c8ae');
  }
  if(!west&&x===6){ // A paper duty roster left on a pinboard.
   rect(5.68,6.30,.80,1.22,'#6f6550','#4e594c');rect(5.74,6.24,.85,1.16,'#d2cdb1');
   rect(5.74,6.24,1.09,1.16,'#854e3d');
   for(let i=0;i<4;i++)rect(5.80,6.17,.91+i*.043,.918+i*.043,'#827f6666');
  }
  if(west&&y===7){
   rect(6.77,7.25,.76,1.12,'#596a61','#b0b29a');rect(6.80,7.22,.79,1.08,'#8e9986');
   rect(7.12,7.15,.90,1.00,'#34493e');rect(7.0,7.025,1.12,1.37,'#58685d');
  }
  if(west&&y===10){ // Rough plaster repair where cargo repeatedly hit the wall.
   poly([p(9.62,.09),p(9.61,.31),p(9.77,.47),p(10.04,.39),p(10.18,.51),p(10.38,.30),p(10.31,.08)],'#aca384','#646b55');
   rect(9.85,10.15,.16,.19,'#7a7a6166');
  }
  // Paired skirting chips; seeded, fixed marks do not flicker on refresh.
  if(along%3===1){rect(along-.31,along-.16,.12,.17,'#b4aa8e80');rect(along+.15,along+.33,.31,.35,'#bab3985c');}
  ctx.restore();
 };
 A.door=(ctx,d,width,point,poly,s)=>{
  const m=g.DungeonRuntime.getSim()?.map,meta=m?.bossRoom||m?.bossRoomReview;
  if(!meta||d.cell!==(meta.bounds[1]+9)*width+meta.bounds[0]+4)return oldDoor(ctx,d,width,point,poly,s);
  // Same collision cell and open direction as the real door; its hinge sits
  // on the new thin front wall, not in the middle of the old one-cell block.
  const shift=(x,y,z=0)=>point(x,y-.5,z),x=d.cell%width,y=Math.floor(d.cell/width),tx=-d.dy,ty=d.dx,z=SCALE.door;
  const a=shift(x-tx*.42,y-ty*.42),b=shift(x+tx*.42,y+ty*.42),at=shift(x-tx*.42,y-ty*.42,z),bt=shift(x+tx*.42,y+ty*.42,z);
  const end=d.closed?b:shift(x-tx*.42+d.dx*.76,y-ty*.42+d.dy*.76),et={x:end.x,y:end.y-z*s};
  const p=(u,v)=>({x:a.x+(end.x-a.x)*u,y:a.y+(end.y-a.y)*u-z*s*v});
  const rect=(u,v,w,h,fill,stroke)=>poly([p(u,v+h),p(u+w,v+h),p(u+w,v),p(u,v)],fill,stroke);
  ctx.save();ctx.lineWidth=Math.max(1,s*.018);poly([at,et,end,a],'#6e847b','#263c34');
  rect(.09,.12,.82,.76,'#809789','#344a40');rect(.12,.16,.75,.33,'#677d70');
  rect(.16,.72,.18,.035,'#b4bca0');rect(.69,.22,.13,.027,'#b4bca0');rect(.79,.48,.055,.13,'#243c33','#aeb59b');
  for(const [lineWidth,color] of [[s*.072,'#263c34'],[s*.035,'#a5b09c']]){ctx.lineWidth=lineWidth;ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(at.x,at.y);ctx.lineTo(bt.x,bt.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  ctx.restore();
 };
 g.RuinsOutpostDecor.floor=(ctx,m,k,q)=>{
  const meta=m.bossRoom||m.bossRoomReview,wx=k%m.width,wy=Math.floor(k/m.width);
  if(!meta)return oldFloor(ctx,m,k,q);
  if(wx<meta.bounds[0]||wy<meta.bounds[1]||wx>meta.bounds[2]||wy>meta.bounds[3]||m.tiles[k]!==2)return oldFloor(ctx,m,k,q);
  const x=wx-(meta.bounds[0]-3),y=wy-(meta.bounds[1]-3),inside=m.tiles[k]===2;
  if(m.tiles[k]===g.RuinsSettlement.VOID)return false;
  const trace=()=>{ctx.beginPath();q.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();};
  ctx.save();trace();ctx.clip();
  // The approved interior remains fixed. Outdoors uses the shared terrain;
  // the reserved circulation apron must never read as a concrete picture frame.
  texture(ctx,options.floorTexture,q,[(x%4)/4,(y%4)/4,.25,.25]);
  trace();ctx.fillStyle=inside?'#b8b29a14':'#243b3b65';ctx.fill();
  const center={x:q.reduce((n,p)=>n+p.x,0)/4,y:q.reduce((n,p)=>n+p.y,0)/4};
  const ex={x:(q[1].x-q[0].x),y:(q[1].y-q[0].y)},ey={x:(q[3].x-q[0].x),y:(q[3].y-q[0].y)};
  const point=(a,b)=>({x:center.x+(a-x)*ex.x+(b-y)*ey.x,y:center.y+(a-x)*ex.y+(b-y)*ey.y});
  const rect=(a,b,c,d,fill)=>{const pts=[point(a,b),point(c,b),point(c,d),point(a,d)];ctx.beginPath();pts.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();};
  const patch=(pts,fill,stroke)=>{ctx.beginPath();pts.map(v=>point(...v)).forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.lineWidth=1;ctx.strokeStyle=stroke;ctx.stroke();}};
  if(inside){
   // Muted old floor paint ties together the sleeping and loading niches.
   if(x<=5&&y<=5){rect(3.5,3.5,5.6,5.7,'#4e706839');rect(5.48,3.5,5.53,5.7,'#c1baa240');}
   if(x<=5&&y>=8){rect(3.5,8.45,5.5,11.5,'#776c4e28');rect(5.43,8.5,5.49,11.5,'#b5a46c66');}
   // A single local warm pool from the battery lamp, plus cool window spill.
   for(const [a,b,r,color] of [[8.0,4.5,1.6,'#dfb96b29'],[4.3,8,1.8,'#a4c7bc1c']]){
    const p=point(a,b),radius=r*Math.hypot(ex.x,ex.y),gr=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);gr.addColorStop(0,color);gr.addColorStop(1,color.slice(0,7)+'00');ctx.fillStyle=gr;ctx.fillRect(center.x-radius*3,center.y-radius*3,radius*6,radius*6);
   }
   // Contact shading along the two full-height walls anchors the enclosure.
   if(x===4)rect(3.5,y-.5,3.62,y+.5,'#253e3454');if(y===4)rect(x-.5,3.5,x+.5,3.62,'#253e3454');
   // Broad directional wear follows actual use, not uniform dirt on every tile.
   if(x===7&&y>=7){patch([[6.75,y-.55],[7.17,y-.48],[7.30,y+.2],[7.06,y+.51],[6.78,y+.4]],'#c8b79820');}
   if((x===5&&y===9)||(x===5&&y===11)){
    patch([[4.7,y-.18],[5.02,y-.32],[5.3,y-.19],[5.24,y+.19],[4.89,y+.26]],'#443f2c38');
    patch([[4.77,y+.04],[4.98,y-.03],[5.06,y+.13],[4.91,y+.2]],'#b6ac82','#62664e');
    patch([[5.18,y+.13],[5.29,y+.1],[5.3,y+.22],[5.2,y+.24]],'#928666');
   }
   if(x===8&&y===5)patch([[7.66,4.64],[7.86,4.52],[8.18,4.69],[8.27,4.94],[8.01,5.08],[7.73,4.94]],'#414f3e34');
   if(x===5&&y===4)patch([[4.7,3.92],[4.87,3.96],[4.9,4.07],[4.72,4.14],[4.62,4.05]],'#726c5380');
   if(x===7&&y===11){for(let i=0;i<3;i++)rect(6.77+i*.19,10.55,6.79+i*.19,11.35-i*.1,'#8b785c45');}
  }
  if(options.grid){trace();ctx.strokeStyle=meta.clear.includes(k)?'#e4c27480':'#ddd4b42e';ctx.lineWidth=1;ctx.stroke();}
  ctx.restore();return true;
 };
 return {drawPartition(ctx,p,x,y,s){
  const m=g.DungeonRuntime.getSim().map,cx=p.cell%m.width,cy=Math.floor(p.cell/m.width);
  const point=(a,b,z=0)=>({x:x+((a-cx)-(b-cy))*s/Math.SQRT2,y:y+((a-cx)+(b-cy))*s/2-z*s});
  const poly=(q,fill,stroke)=>{ctx.beginPath();q.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](v.x,v.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}};
  ctx.save();ctx.lineWidth=Math.max(.7,s*.012);
  if(p.shape==='lowwall')box(ctx,point,poly,cx-.5,cy-.09,cx+.5,cy+.09,SCALE.partition,{shade:true});
  else{box(ctx,point,poly,cx-.5,cy-.09,cx-.18,cy+.09,SCALE.partition,{shade:true});box(ctx,point,poly,cx-.18,cy-.18,cx+.18,cy+.18,SCALE.column,{shade:true});}
  ctx.restore();
 }};
}

globalThis.DungeonBossRoomArchitecture={install:installRoomArchitecture};
})();
