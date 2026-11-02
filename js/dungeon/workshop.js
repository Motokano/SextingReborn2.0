/* SPDX-License-Identifier: GPL-3.0-only
 * Reserve the structural machine and its circulation before placing actors.
 * This layout consumes the existing large-room, enemy and container pools.
 */
(()=>{'use strict';
const R=RuinsSettlement,RS=RuinsResources;
const distance=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
function layout(m,room,count,cfg){
 if(cfg.terrain?.enabled)return RuinsWorkshopTerrain.layout(m,room,count,cfg);
 const w=m.width,inside=new Set(room.inner),orth=k=>RS.neighbours(k,m),landing=orth(room.door).filter(k=>inside.has(k));
 if(!landing.length||room.inner.length<cfg.minArea||room.inner.length>cfg.maxArea)return null;
 const center={x:room.inner.reduce((n,k)=>n+k%w,0)/room.inner.length,y:room.inner.reduce((n,k)=>n+Math.floor(k/w),0)/room.inner.length};
 const o=m.contentConfig.outposts,cores=[],jitter=k=>R.hash(m.seed+'-workshop-'+room.id+'-'+k)/4294967296;
 const rect=(x,y,ww,hh)=>{const a=[];for(let yy=y;yy<y+hh;yy++)for(let xx=x;xx<x+ww;xx++){if(xx<0||xx>=w||yy<0||yy>=m.height)return[];a.push(yy*w+xx);}return a;};
 for(const [width,height]of [[2,1],[1,2]])for(const start of room.inner){
  const x=start%w,y=Math.floor(start/w),pad=cfg.aisleWidth,cells=rect(x,y,width,height),ring=rect(x-pad,y-pad,width+pad*2,height+pad*2);
  if(!ring.length||ring.some(k=>!inside.has(k))||cells.some(k=>distance(k,room.door,w)<cfg.doorBuffer))continue;
  const axis=width>height?'x':'y',cross=k=>axis==='x'?Math.floor(k/w):k%w;
  const mid=axis==='x'?y+(height-1)/2:x+(width-1)/2;
  const score=Math.abs(x+(width-1)/2-center.x)+Math.abs(y+(height-1)/2-center.y)+jitter(start)*.2;
  cores.push({x,y,width,height,cells,ring:ring.filter(k=>!cells.includes(k)),axis,mid,score,cross});
 }
 cores.sort((a,b)=>a.score-b.score);let attempts=0;
 for(const core of cores){
  const blocked=new Set(core.cells),corridor=new Set(core.ring),local=m.tiles.map(()=>5);
  for(const k of room.inner)local[k]=blocked.has(k)?6:2;
  const flows=landing.map(k=>R.flood(local,w,m.height,k)),depth=k=>Math.min(...flows.map(f=>f.dist[k]));
  const side=k=>Math.sign(core.cross(k)-core.mid);
  const choices=room.inner.filter(k=>!blocked.has(k)&&!corridor.has(k)&&distance(k,room.door,w)>=o.pointDoorBuffer&&depth(k)>=o.entrySteps&&orth(k).some(n=>m.tiles[n]===1));
  const pointSides=[-1,1].map(sign=>choices.filter(k=>side(k)===sign).sort((a,b)=>depth(b)-depth(a)||jitter(a)-jitter(b)).slice(0,10));
  for(const a of pointSides[0])for(const b of pointSides[1]){
   if(distance(a,b,w)<o.pointSpacing)continue;
   const fixed=[a,b],tiles=local.slice();for(const k of fixed)tiles[k]=6;
   const flow=R.flood(tiles,w,m.height,landing[0]),entry=k=>flow.dist[k];
   if(flow.reached!==room.inner.length-core.cells.length-fixed.length)continue;
   const available=room.inner.filter(k=>R.walkable(tiles[k])&&entry(k)>=o.entrySteps);
   const maxDepth=Math.max(...available.map(entry));
   const goals=[{d:o.entrySteps,side:0},{d:maxDepth*.65,side:-1},{d:maxDepth*.8,side:1},{d:maxDepth,side:0}];
   let answer=null;
   function check(enemies){
    const occupied=new Set([...core.cells,...fixed,...enemies]);
    if(room.inner.length-occupied.size<Math.ceil(room.inner.length*o.freeRatio)||landing.some(k=>occupied.has(k)))return false;
    const seen=new Set([landing[0]]),q=[landing[0]];
    for(let i=0;i<q.length;i++)for(const n of orth(q[i]))if(inside.has(n)&&!occupied.has(n)&&!seen.has(n)){seen.add(n);q.push(n);}
    return seen.size===room.inner.length-occupied.size&&landing.every(k=>seen.has(k))&&fixed.every(k=>orth(k).filter(n=>seen.has(n)).length>=o.pointAccess)&&enemies.every(k=>orth(k).some(n=>seen.has(n)))&&[-1,1].every(sign=>enemies.some(k=>side(k)===sign));
   }
   function search(enemies){
    if(answer||attempts>=cfg.layoutAttempts)return;
    if(enemies.length===count){if(check(enemies))answer=enemies.slice();return;}
    const goal=goals[enemies.length],rank=k=>Math.abs(entry(k)-goal.d)+(goal.side&&side(k)!==goal.side?4:0)+jitter(k)*.3;
    const list=available.filter(k=>enemies.every(e=>distance(k,e,w)>=o.minEnemySpacing&&distance(k,e,w)<=o.maxEnemySpacing)).sort((a,b)=>rank(a)-rank(b)||a-b).slice(0,14);
    for(const k of list){attempts++;search([...enemies,k]);if(answer||attempts>=cfg.layoutAttempts)return;}
   }
   search([]);
   if(answer){const {cross,score,...structure}=core;return{cells:answer,points:fixed,landings:landing,depths:answer.map(entry),workshop:structure};}
   if(attempts>=cfg.layoutAttempts)return null;
  }
 }
 return null;
}
function commit(m,room,structure){
 room.workshop=structure;
 for(const k of structure.cells)m.workshopBlocked.add(k);
 for(const k of structure.cells)m.workshopOpaque.add(k);
 const primary=structure.cells[structure.cells.length-1];
 m.workshopObstacles.push({uid:'machine-'+room.id,roomId:room.id,cell:primary,kind:'workshop-machine-v1',solid:true,opaque:true,footprint:structure.cells,flip:structure.width<structure.height,offsetX:-(structure.width-1)/2,offsetY:-(structure.height-1)/2});
 const terrain=structure.terrain;if(!terrain)return;
 for(const k of terrain.blocked)m.workshopBlocked.add(k);
 for(const k of terrain.walls){m.workshopOpaque.add(k);m.workshopWalls.add(k);m.workshopObstacles.push({uid:'bay-wall-'+room.id+'-'+k,roomId:room.id,cell:k,kind:'workshop-divider',moduleWall:true,solid:true,opaque:true,footprint:[k]});}
 const band=terrain.bands[1],pending=new Set(band.cells);let i=0;
 for(const k of band.cells){if(!pending.has(k))continue;const n=k+(band.axis==='x'?1:m.width),pair=pending.has(n),footprint=pair?[k,n]:[k],cell=footprint.at(-1);footprint.forEach(v=>pending.delete(v));
  m.workshopObstacles.push({uid:'bay-bench-'+room.id+'-'+i++,roomId:room.id,cell,kind:pair?'workshop-bench-v1':'tire-pair',solid:true,opaque:false,footprint,flip:band.axis==='y',offsetX:pair&&band.axis==='x'?-.5:0,offsetY:pair&&band.axis==='y'?-.5:0});
 }
}
globalThis.RuinsWorkshop={layout,commit};
})();
