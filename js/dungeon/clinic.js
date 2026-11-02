/* SPDX-License-Identifier: GPL-3.0-only
 * Two treatment bays, open portals and two independent circulation routes.
 * Plan on existing floor cells; only commit a fully reachable composition.
 */
(()=>{'use strict';
const R=RuinsSettlement,RS=RuinsResources;
const distance=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
function layout(m,room,count,cfg){
 const w=m.width,inside=new Set(room.inner),orth=k=>RS.neighbours(k,m),landings=orth(room.door).filter(k=>inside.has(k));
 if(!landings.length||room.inner.length<cfg.minArea||room.inner.length>cfg.maxArea)return null;
 function flow(blocked,from=landings[0],eight=false){
  const d=new Map(),prev=new Map(),q=[];if(inside.has(from)&&!blocked.has(from)){d.set(from,0);q.push(from);}
  for(let i=0;i<q.length;i++){const k=q[i],x=k%w,y=Math.floor(k/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy||!eight&&dx&&dy)continue;const nx=x+dx,ny=y+dy,n=ny*w+nx;
   if(nx<0||nx>=w||ny<0||ny>=m.height||!inside.has(n)||blocked.has(n)||d.has(n)||dx&&dy&&(blocked.has(y*w+nx)||blocked.has(ny*w+x)||!inside.has(y*w+nx)||!inside.has(ny*w+x)))continue;
   d.set(n,d.get(k)+1);prev.set(n,k);q.push(n);
  }}return{d,prev};
 }
 const empty=flow(new Set()).d,candidates=[];
 // Both map axes and both depth directions are possible. This compact bay
 // module has two 2x2 treatment areas and two-cell outer side lanes.
 for(const axis of ['x','y'])for(const sign of [-1,1])for(const origin of room.inner){
  const x=origin%w,y=Math.floor(origin/w),at=(u,v)=>{const nx=x+(axis==='x'?u:v*sign),ny=y+(axis==='x'?v*sign:u);return nx>=0&&nx<w&&ny>=0&&ny<m.height?ny*w+nx:-1;};
  const envelope=[];for(let v=-1;v<=7;v++)for(let u=-2;u<=4;u++)envelope.push(at(u,v));if(envelope.some(k=>!inside.has(k)))continue;
  const walls=new Set();for(const v of [0,3,4,5,6])walls.add(at(0,v));for(const v of [0,3,6])for(let u=0;u<=2;u++)walls.add(at(u,v));
  if([...walls].some(k=>distance(k,room.door,w)<cfg.doorBuffer))continue;
  const bays=[[at(1,1),at(2,1),at(1,2),at(2,2)],[at(1,4),at(2,4),at(1,5),at(2,5)]];
  const bed=[at(1,4),at(1,5)],points=[at(1,1),at(2,5)];
  const direct=[[-1,2],[0,2],[1,2],[2,2],[3,2],[3,3],[3,4],[3,5]].map(([u,v])=>at(u,v));
  const bypass=[[-1,2],[-1,3],[-1,4],[-1,5],[-1,6],[-1,7],[0,7],[1,7],[2,7],[3,7],[3,6],[3,5]].map(([u,v])=>at(u,v));
  const sideLanes=[];for(let v=0;v<=6;v++)for(const u of [-2,-1,3,4])sideLanes.push(at(u,v));
  const reserved=new Set([...direct,...bypass,...sideLanes,...landings]);
  const blocks=[...walls,...bed,...points],blocked=new Set(blocks),d=flow(blocked).d;
  if(blocks.length!==blocked.size||points.some(k=>distance(k,room.door,w)<cfg.doorBuffer)||d.size!==inside.size-blocked.size||landings.some(k=>!d.has(k))||points.some(k=>orth(k).filter(n=>d.has(n)).length<2)||[...reserved].some(k=>blocked.has(k)))continue;
  // The recovery bay must be deeper than the waiting area from the real door.
  const recoveryDepth=Math.min(...orth(points[1]).filter(k=>d.has(k)).map(k=>d.get(k))),frontDepth=empty.get(at(1,-1));
  if(recoveryDepth<frontDepth+3)continue;
  const benchOptions=[];
  for(const k of room.inner)for(const delta of [1,w]){
   const n=k+delta;if(!inside.has(n)||delta===1&&Math.floor(k/w)!==Math.floor(n/w))continue;
   const cells=[k,n];if(cells.some(c=>blocked.has(c)||reserved.has(c)||distance(c,room.door,w)<cfg.doorBuffer)||!cells.some(c=>orth(c).some(q=>m.tiles[q]===1)))continue;
   const probe=new Set([...blocked,...cells]),f=flow(probe).d;if(f.size!==inside.size-probe.size||points.some(p=>orth(p).filter(q=>f.has(q)).length<2))continue;
   benchOptions.push({cells,axis:delta===1?'x':'y',score:cells.reduce((a,c)=>a+(empty.get(c)||0),0)});
  }
  benchOptions.sort((a,b)=>a.score-b.score||a.cells[0]-b.cells[0]);
  // A waiting bench is part of the layout, not a substitute for a clear route.
  if(!benchOptions.length)continue;
  const bench=benchOptions[0],solid=[...walls,...bed,...bench.cells];if(solid.length>inside.size*cfg.maxBlockedRatio)continue;
  const front=Math.min(...direct.map(k=>empty.get(k))),score=frontDepth+Math.abs(recoveryDepth-10)*.2+R.hash(m.seed+'-clinic-'+origin+'-'+axis+'-'+sign)%997/997;
  candidates.push({axis,sign,origin,walls:[...walls],bed,bench,points,bays,direct,bypass,reserved:[...reserved],solid,score,front});
 }
 candidates.sort((a,b)=>a.score-b.score);let tries=0;
 for(const c of candidates.slice(0,cfg.maxCandidates)){
  const fixed=new Set([...c.solid,...c.points]),f=flow(fixed,landings[0],true).d,reserved=new Set([...c.direct,...c.bypass,...landings]);
  const available=room.inner.filter(k=>f.has(k)&&f.get(k)>=m.contentConfig.outposts.entrySteps&&!reserved.has(k)),far=Math.max(...available.map(k=>f.get(k))),goals=[3,far*.5,far,far*.75];let answer=null;
  function search(chosen){
   if(answer||tries>=cfg.layoutAttempts)return;
   if(chosen.length===count){const blocked=new Set([...fixed,...chosen]),d=flow(blocked).d;
    if(inside.size-blocked.size<Math.ceil(inside.size*Math.max(cfg.freeRatio,m.contentConfig.outposts.freeRatio))||d.size!==inside.size-blocked.size||c.points.some(k=>orth(k).filter(n=>d.has(n)).length<2)||chosen.some(k=>!orth(k).some(n=>d.has(n))))return;
    if(!chosen.some(k=>c.bays[0].includes(k))||Math.max(...chosen.map(k=>f.get(k)))-Math.min(...chosen.map(k=>f.get(k)))<3)return;answer=chosen.slice();return;
   }
   const slot=chosen.length,rank=k=>Math.abs(f.get(k)-goals[slot])+(slot===1&&!c.bays[0].includes(k)?20:0);
   const list=available.filter(k=>chosen.every(q=>distance(k,q,w)>=2&&distance(k,q,w)<=7)).sort((a,b)=>rank(a)-rank(b)||a-b).slice(0,18);
   for(const k of list){tries++;search([...chosen,k]);if(answer||tries>=cfg.layoutAttempts)return;}
  }
  search([]);if(answer){const{score,front,...clinic}=c;return{cells:answer,points:c.points,landings,depths:answer.map(k=>f.get(k)),clinic};}
 }
 return null;
}
function commit(m,room,c){
 room.clinic=c;
 for(const k of c.solid)m.clinicBlocked.add(k);
 for(const k of c.walls){m.clinicOpaque.add(k);m.clinicWalls.add(k);m.clinicObstacles.push({uid:'clinic-wall-'+room.id+'-'+k,roomId:room.id,cell:k,kind:'clinic-wall',moduleWall:true,solid:true,opaque:true,footprint:[k]});}
 const prop=(kind,cells)=>{const cell=Math.max(...cells),horizontal=Math.floor(cells[0]/m.width)===Math.floor(cells[1]/m.width);m.clinicObstacles.push({uid:kind+'-'+room.id,roomId:room.id,kind,cell,footprint:cells,solid:true,opaque:false,flip:!horizontal,offsetX:horizontal?-.5:0,offsetY:horizontal?0:-.5});};
 prop('clinic-bed-v1',c.bed);prop('clinic-bench-v1',c.bench.cells);
}
globalThis.RuinsClinic={layout,commit};
})();
