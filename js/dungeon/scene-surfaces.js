/* Shared world-space materials. Presentation only: never writes map tiles. */
(()=>{'use strict';
 const profiles=new WeakMap(),tiles=new Map(),N=4,SIDE=64,mod=(v,n)=>(v%n+n)%n;
 const outdoor=m=>k=>k>=0&&k<m.tiles.length&&m.tiles[k]!==RuinsSettlement.VOID&&(m.owner[k]<0||m.tiles[k]===1||m.tiles[k]===3);
 function profile(m){
  if(profiles.has(m))return profiles.get(m);
  const outside=outdoor(m),names=m.tiles.map((t,k)=>{
   if(t===RuinsSettlement.VOID)return null;
   const natural=m.woodland?.ground[k];
   if(!outside(k))return natural==='moss'||natural==='litter'?natural:'floor';
   // Border wall cells belong to the exterior surface, not a one-tile-wide plinth.
   if(natural&&natural!=='floor')return natural;
   return t===3?'cap':m.road[k]?'road':'earth';
  });
  // Newly activated boss-room apron inherits its neighbours' outdoor ground.
  // The apron reserves circulation; it is not a distinct concrete platform.
  const a=m.bossRoom?.apron;
  if(a)for(let y=a[1];y<=a[3];y++)for(let x=a[0];x<=a[2];x++){
   const k=y*m.width+x;if(!outside(k)||m.woodland?.ground[k]&&m.woodland.ground[k]!=='floor')continue;
   let best=null,dist=Infinity;
   for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    const nx=x+dx,ny=y+dy,n=ny*m.width+nx;if(nx<0||ny<0||nx>=m.width||ny>=m.height||nx>=a[0]&&nx<=a[2]&&ny>=a[1]&&ny<=a[3])continue;
    const name=m.woodland?.ground[n];if(!outside(n)||!name||name==='floor')continue;
    if(dx*dx+dy*dy<dist){dist=dx*dx+dy*dy;best=name;}
   }names[k]=best||'earth';
  }
  const data={names,outside};profiles.set(m,data);return data;
 }
 function corners(m,k){
  const p=profile(m),name=p.names[k],x=k%m.width,y=Math.floor(k/m.width);
  return [[0,0],[1,0],[1,1],[0,1]].map(([cx,cy])=>{
   const weights={};let count=0;for(const dx of [-1,0])for(const dy of [-1,0]){
    const nx=x+cx+dx,ny=y+cy+dy,n=ny*m.width+nx;
    if(nx<0||ny<0||nx>=m.width||ny>=m.height||!p.outside(n)||!p.names[n])continue;
    const next=p.names[n];weights[next]=(weights[next]||0)+1;count++;
   }if(!count)return {[name]:1};for(const key of Object.keys(weights))weights[key]/=count;return weights;
  });
 }
 function sample(ctx,name,q,x,y,surface,shade=0){
  const flipX=mod(Math.floor(x/N),2)===1,flipY=mod(Math.floor(y/N),2)===1;
  const u=(flipX?N-1-mod(x,N):mod(x,N))/N,v=(flipY?N-1-mod(y,N):mod(y,N))/N;
  let points=q;if(flipX)points=[points[1],points[0],points[3],points[2]];if(flipY)points=[points[3],points[2],points[1],points[0]];
  return surface(ctx,name,points,[u,v,1/N,1/N],shade);
 }
 function floor(ctx,m,k,q,surface){
  const p=profile(m),name=p.names[k],x=k%m.width,y=Math.floor(k/m.width);
  if(!name)return false;
  if(!p.outside(k))return sample(ctx,name,q,x,y,surface,.08);
  const weights=corners(m,k),kinds=[...new Set(weights.flatMap(v=>Object.keys(v)))].sort();
  if(kinds.length===1)return sample(ctx,name,q,x,y,surface,.06);
  if(typeof document==='undefined')return sample(ctx,name,q,x,y,surface,.06);
  const key=[name,mod(x,N*2),mod(y,N*2),JSON.stringify(weights)].join(':');let tile=tiles.get(key);
  if(!tile){
   tile=document.createElement('canvas');tile.width=tile.height=SIDE;const out=tile.getContext('2d');
   for(const kind of kinds){
    const layer=document.createElement('canvas');layer.width=layer.height=SIDE;const c=layer.getContext('2d');
    if(!sample(c,kind,[{x:0,y:0},{x:SIDE,y:0},{x:SIDE,y:SIDE},{x:0,y:SIDE}],x,y,surface,.06))return false;
    const data=c.getImageData(0,0,SIDE,SIDE);
    for(let j=0;j<SIDE;j++)for(let i=0;i<SIDE;i++){
     const u=i/(SIDE-1),v=j/(SIDE-1),w=weights.map(a=>a[kind]||0);
     const edge=(w[0]*(1-u)+w[1]*u)*(1-v)+(w[3]*(1-u)+w[2]*u)*v;
     const center=.60*Math.sin(Math.PI*u)*Math.sin(Math.PI*v);
     data.data[(j*SIDE+i)*4+3]=Math.round(255*(edge*(1-center)+(kind===name?center:0)));
    }
    c.putImageData(data,0,0);out.globalCompositeOperation='lighter';out.drawImage(layer,0,0);
   }
   if(tiles.size>2048)tiles.clear();tiles.set(key,tile);
  }
  ctx.save();ctx.transform(q[1].x-q[0].x,q[1].y-q[0].y,q[3].x-q[0].x,q[3].y-q[0].y,q[0].x,q[0].y);ctx.drawImage(tile,0,0,1,1);ctx.restore();return true;
 }
 globalThis.DungeonSurfaceStyle={profile,corners,sample,floor,clear:()=>tiles.clear()};
})();
