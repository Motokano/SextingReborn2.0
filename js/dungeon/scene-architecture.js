/* Grid-aligned boundary walls, shared by all ordinary generated buildings. */
(()=>{'use strict';
 const THICK=.18,HEIGHT=1.16,CUT=.16;
 const caches=new WeakMap();
 function cache(m){if(!caches.has(m))caches.set(m,{plans:new Map(),meshes:new Map(),polygons:new Map((m.buildings||m.rooms||[]).map(r=>[r.id,r.polygon]))});return caches.get(m);}
 function sideHeight(m,k){
  const polygon=cache(m).polygons.get(m.owner[k]);if(!polygon?.length)return null;
  // Use the original building side, before it was rasterised into grid stairs.
  // A one-cell return must not switch a front facade back to full height.
  const x=k%m.width+.5,y=Math.floor(k/m.width)+.5;
  const area=polygon.reduce((n,a,i)=>{const b=polygon[(i+1)%polygon.length];return n+a.x*b.y-b.x*a.y;},0);
  let nearest=Infinity,height=null;
  for(let i=0;i<polygon.length;i++){
   const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;if(!len)continue;
   const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len)),distance=(x-a.x-t*dx)**2+(y-a.y-t*dy)**2;
   if(distance<nearest-1e-8){nearest=distance;height=(dy-dx)*Math.sign(area)>0?CUT:HEIGHT;}
  }return height;
 }
 function plan(m,k){
  const cached=cache(m).plans;if(cached.has(k))return cached.get(k);
  const x=k%m.width,y=Math.floor(k/m.width),id=m.owner[k];
  const inside=(dx,dy)=>{const a=x+dx,b=y+dy,n=b*m.width+a;return a>=0&&b>=0&&a<m.width&&b<m.height&&m.owner[n]===id&&[2,4].includes(m.tiles[n]);};
  if(id<0||m.tiles[k]!==1)return null;
  const sides=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>inside(dx,dy));
  const boxes=sides.map(([dx,dy])=>({x0:dx===1?.5-THICK:-.5,y0:dy===1?.5-THICK:-.5,x1:dx===-1?-.5+THICK:.5,y1:dy===-1?-.5+THICK:.5,z:dx===1||dy===1?HEIGHT:CUT}));
  if(!boxes.length)for(const dx of [-1,1])for(const dy of [-1,1])if(inside(dx,dy))boxes.push({x0:dx>0?.5-THICK:-.5,x1:dx>0?.5:-.5+THICK,y0:dy>0?.5-THICK:-.5,y1:dy>0?.5:-.5+THICK,z:dx>0&&dy>0?HEIGHT:CUT});
  const z=sideHeight(m,k);if(z!==null)for(const b of boxes)b.z=z;
  const result=boxes.length?{x,y,boxes}:null;cached.set(k,result);return result;
 }
 function partitionPlan(m,k){
  const x=k%m.width,y=Math.floor(k/m.width),sets=[m.workshopWalls,m.clinicWalls,m.canteenWalls],has=n=>sets.some(a=>a?.has(n));
  if(!has(k))return null;
  const half=THICK/2,boxes=[],left=x>0&&has(k-1),right=x<m.width-1&&has(k+1),up=y>0&&has(k-m.width),down=y<m.height-1&&has(k+m.width);
  if(left||right)boxes.push({x0:left?-.5:-half,x1:right?.5:half,y0:-half,y1:half,z:.50});
  if(up||down)boxes.push({x0:-half,x1:half,y0:up?-.5:-half,y1:down?.5:half,z:.50});
  if(!boxes.length)boxes.push({x0:-half,x1:half,y0:-half,y1:half,z:.50});
  return {x,y,boxes};
 }
 function mesh(m,k,partition=false){
  const key=k+':'+partition,cached=cache(m).meshes;if(cached.has(key))return cached.get(key);
  const p=partition?partitionPlan(m,k):plan(m,k);if(!p)return null;
  const world=q=>q?.boxes.map(b=>({...b,x0:q.x+b.x0,x1:q.x+b.x1,y0:q.y+b.y0,y1:q.y+b.y1}))||[],own=world(p),all=[...own];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy)continue;const x=p.x+dx,y=p.y+dy,n=y*m.width+x;
   if(x<0||y<0||x>=m.width||y>=m.height||m.owner[n]!==m.owner[k])continue;
   all.push(...world(plan(m,n)||partitionPlan(m,n)));
  }
  const height=(boxes,x,y)=>Math.max(0,...boxes.filter(b=>x>b.x0-1e-8&&x<b.x1+1e-8&&y>b.y0-1e-8&&y<b.y1+1e-8).map(b=>b.z));
  const cuts=(axis,center)=>[...new Set([center-.5,center+.5,...all.flatMap(b=>[b[axis+'0'],b[axis+'1']]).filter(v=>v>center-.5+1e-7&&v<center+.5-1e-7)])].sort((a,b)=>a-b);
  const xs=cuts('x',p.x),ys=cuts('y',p.y),faces=[],epsilon=1e-5;
  // A height field of the UNION of wall strips removes buried vertical faces
  // and overlapping caps at L/T corners, including neighbours across grid cells.
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){
   const x0=xs[i],x1=xs[i+1],y0=ys[j],y1=ys[j+1],cx=(x0+x1)/2,cy=(y0+y1)/2,z=height(own,cx,cy);if(!z)continue;
   const points=[[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]],around=[[cx,y0-epsilon],[x1+epsilon,cy],[cx,y1+epsilon],[x0-epsilon,cy]];
   faces.push({type:'top',points,edges:around.map(([x,y])=>height(all,x,y)<z-1e-7)});
   for(const [axis,nx,ny,a,b]of[['x',x1+epsilon,cy,points[1],points[2]],['y',cx,y1+epsilon,points[2],points[3]]]){
    const lo=height(all,nx,ny);if(lo>=z-1e-7)continue;
    faces.push({type:'side',axis,lo,hi:z,points:[a,b,[b[0],b[1],lo],[a[0],a[1],lo]]});
   }
  }
  faces.sort((a,b)=>a.points.reduce((n,p)=>n+p[0]+p[1],0)-b.points.reduce((n,p)=>n+p[0]+p[1],0)||(a.type==='top'?1:0)-(b.type==='top'?1:0));
  cached.set(key,faces);return faces;
 }
 function wall(ctx,m,k,point,poly,s,surface,material,partition=false){
  const faces=mesh(m,k,partition);if(!faces)return false;
  ctx.save();ctx.lineWidth=Math.max(.65,s*.012);
  for(const f of faces){
   const q=f.points.map(p=>point(...p));
   if(f.type==='top'){
    poly(q,'#b5af98');ctx.strokeStyle='#5e6557';
    for(let i=0;i<4;i++)if(f.edges[i]){ctx.beginPath();ctx.moveTo(q[i].x,q[i].y);ctx.lineTo(q[(i+1)%4].x,q[(i+1)%4].y);ctx.stroke();}
    continue;
   }
   const dark=f.axis==='y',a=f.points[0],b=f.points[1],length=Math.hypot(b[0]-a[0],b[1]-a[1]),coordinate=(f.axis==='x'?a[1]:b[0])+.5,u=((coordinate%4)+4)%4/4;
   poly(q,dark?'#a49e87':'#bab59d');surface(ctx,material,dark?[q[1],q[0],q[3],q[2]]:q,[u,1-f.hi/HEIGHT,length/4,(f.hi-f.lo)/HEIGHT],dark?.15:.02);
   const band=(height,color)=>{const hi=Math.min(height,f.hi);if(hi<=f.lo)return;poly([point(a[0],a[1],hi),point(b[0],b[1],hi),point(b[0],b[1],f.lo),point(a[0],a[1],f.lo)],color);};
   if(material!=='wall-damp-stone')band(.34,material==='wall-peeling-workshop'?'#526b5a60':'#67695124');band(.055,'#34443a70');
  }
  ctx.restore();return true;
 }
 globalThis.DungeonSceneArchitecture={plan,partitionPlan,mesh,wall,thickness:THICK,height:HEIGHT,cutaway:CUT};
})();
