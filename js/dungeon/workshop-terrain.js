/* SPDX-License-Identifier: GPL-3.0-only
 * Plan real staggered work bays before committing actors or rewards.
 */
(()=>{'use strict';
const R=RuinsSettlement,RS=RuinsResources;
const dist=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
function layout(m,room,count,cfg){
 const w=m.width,inside=new Set(room.inner),orth=k=>RS.neighbours(k,m),landing=orth(room.door).filter(k=>inside.has(k)),t=cfg.terrain,o=m.contentConfig.outposts;
 if(!landing.length||room.inner.length<cfg.minArea||room.inner.length>cfg.maxArea)return null;
 const rect=(x,y,ww,hh)=>{const a=[];for(let yy=y;yy<y+hh;yy++)for(let xx=x;xx<x+ww;xx++){if(xx<0||xx>=w||yy<0||yy>=m.height)return[];a.push(yy*w+xx);}return a;};
 function flood(blocked,eight=false){
  const d=new Map(),q=[];for(const k of landing)if(!blocked.has(k)){d.set(k,0);q.push(k);}
  const free=k=>inside.has(k)&&!blocked.has(k);
  for(let i=0;i<q.length;i++){const k=q[i],x=k%w,y=Math.floor(k/w);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy||!eight&&dx&&dy)continue;const nx=x+dx,ny=y+dy,n=ny*w+nx;
    if(nx<0||nx>=w||!free(n)||d.has(n)||dx&&dy&&(!free(y*w+nx)||!free(ny*w+x)))continue;
    d.set(n,d.get(k)+1);q.push(n);
   }
  }return d;
 }
 function connected(cells){const blocked=new Set(cells);return blocked.size===cells.length&&landing.every(k=>!blocked.has(k))&&flood(blocked).size===room.inner.length-blocked.size;}
 const center={x:room.inner.reduce((s,k)=>s+k%w,0)/room.inner.length,y:room.inner.reduce((s,k)=>s+Math.floor(k/w),0)/room.inner.length};
 const cores=[];for(const [width,height]of [[2,1],[1,2]])for(const start of room.inner){
  const x=start%w,y=Math.floor(start/w),cells=rect(x,y,width,height),full=rect(x-cfg.aisleWidth,y-cfg.aisleWidth,width+cfg.aisleWidth*2,height+cfg.aisleWidth*2);
  if(!full.length||full.some(k=>!inside.has(k))||cells.some(k=>dist(k,room.door,w)<cfg.doorBuffer))continue;
  // Two lanes parallel to the machine stay clear. The end approaches may now
  // turn through staggered openings instead of reserving a huge empty ring.
  const axis=width>height?'x':'y',ring=full.filter(k=>axis==='x'?k%w>=x&&k%w<x+width&&!cells.includes(k):Math.floor(k/w)>=y&&Math.floor(k/w)<y+height&&!cells.includes(k));
  const collar=rect(x-1,y-1,width+2,height+2),protectedCells=new Set([...collar,...ring]);
  const score=Math.abs(x+(width-1)/2-center.x)+Math.abs(y+(height-1)/2-center.y);
  cores.push({x,y,width,height,cells,ring,axis,mid:axis==='x'?y+(height-1)/2:x+(width-1)/2,protectedCells,score});
 }
 cores.sort((a,b)=>a.score-b.score||a.cells[0]-b.cells[0]);
 const maxBlocked=Math.min(Math.floor(room.inner.length*t.maxBlockedRatio),room.inner.length-Math.ceil(room.inner.length*o.freeRatio)-count-2),coord=(k,axis)=>axis==='x'?k%w:Math.floor(k/w);
 let tries=0;
 for(const core of cores.slice(0,t.maxCoreCandidates)){
  const bands=[];
  for(const axis of ['x','y']){
   const depthAxis=axis==='x'?'y':'x',depths=[...new Set(room.inner.map(k=>coord(k,depthAxis)))].sort((a,b)=>a-b);
   for(const depth of depths.slice(1,-1))for(const side of [-1,1])for(let gap=t.gapWidth;gap<=t.maxGapWidth;gap++){
    const line=room.inner.filter(k=>coord(k,depthAxis)===depth).sort((a,b)=>coord(a,axis)-coord(b,axis));
    if(line.length<gap+t.minBandCells||line.some((k,i)=>i&&coord(k,axis)!==coord(line[i-1],axis)+1))continue;
    const ends=side<0?line.slice(-gap):line.slice(0,gap),cells=line.filter(k=>!ends.includes(k));
    if(cells.some(k=>core.protectedCells.has(k)||dist(k,room.door,w)<cfg.doorBuffer)||ends.some(k=>core.cells.includes(k))||!connected([...core.cells,...cells]))continue;
    bands.push({axis,depth,side,cells,ends});
   }
  }
  const plans=[];
  for(let i=0;i<bands.length;i++)for(let j=i+1;j<bands.length;j++){
   const a=bands[i],b=bands[j];if(a.axis!==b.axis||a.side===b.side||Math.abs(a.depth-b.depth)<3)continue;
   const blocks=[...core.cells,...a.cells,...b.cells];if(blocks.length>maxBlocked||a.ends.some(k=>b.cells.includes(k))||b.ends.some(k=>a.cells.includes(k))||!connected(blocks))continue;
   const before=flood(new Set(core.cells),true),after=flood(new Set(blocks),true),free=room.inner.filter(k=>after.has(k)),extra=free.reduce((s,k)=>s+after.get(k)-before.get(k),0)/free.length;
   plans.push({bands:[a,b],blocks,score:extra+blocks.length*.06});
  }
  plans.sort((a,b)=>b.score-a.score);
  for(const plan of plans.slice(0,t.maxPlans)){
   const reserved=new Set([...core.ring,...plan.bands.flatMap(b=>b.ends)]),blockSet=new Set(plan.blocks),pre=flood(blockSet,true);
   const candidates=room.inner.filter(k=>!blockSet.has(k)&&!reserved.has(k)&&dist(k,room.door,w)>=o.pointDoorBuffer&&pre.get(k)>=o.entrySteps&&orth(k).some(n=>m.tiles[n]===1));
   candidates.sort((a,b)=>pre.get(b)-pre.get(a)||a-b);
   for(let ai=0;ai<candidates.length;ai++)for(let bi=ai+1;bi<candidates.length;bi++){
    const points=[candidates[ai],candidates[bi]];
    if(dist(...points,w)<o.pointSpacing||dist(...points,w)<3)continue;
    const fixed=[...plan.blocks,...points];if(!connected(fixed))continue;
    const after=flood(new Set(fixed),true),before=flood(new Set([...core.cells,...points]),true);
    const routes=points.map(cell=>{const access=orth(cell).filter(k=>after.has(k));return{cell,before:Math.min(...orth(cell).filter(k=>before.has(k)).map(k=>before.get(k))),steps:Math.min(...access.map(k=>after.get(k))),access};});
    if(routes.some(r=>r.access.length<o.pointAccess||r.steps-r.before<t.minExtraSteps)||routes.reduce((s,r)=>s+r.steps,0)/Math.max(1,routes.reduce((s,r)=>s+r.before,0))<t.minRouteRatio)continue;
    const available=room.inner.filter(k=>after.has(k)&&after.get(k)>=o.entrySteps&&!reserved.has(k));
    const far=Math.max(...available.map(k=>after.get(k))),goals=[o.entrySteps,far*.55,far*.8,far];let answer=null;
    function search(chosen){
     if(answer||tries>=cfg.layoutAttempts)return;
     if(chosen.length===count){
      const all=[...fixed,...chosen];if(!connected(all))return;const d=flood(new Set(all));
      if(points.some(k=>orth(k).filter(n=>d.has(n)).length<o.pointAccess)||chosen.some(k=>!orth(k).some(n=>d.has(n))))return;
      if(Math.max(...chosen.map(k=>after.get(k)))-Math.min(...chosen.map(k=>after.get(k)))<3)return;answer=chosen.slice();return;
     }
     const slot=chosen.length,rank=k=>Math.abs(after.get(k)-goals[slot])+(slot?Math.min(...points.map(p=>dist(k,p,w)))*.1:0);
     const list=available.filter(k=>chosen.every(n=>dist(k,n,w)>=o.minEnemySpacing&&dist(k,n,w)<=o.maxEnemySpacing)).sort((a,b)=>rank(a)-rank(b)||a-b).slice(0,16);
     for(const k of list){tries++;search([...chosen,k]);if(answer||tries>=cfg.layoutAttempts)return;}
    }
    search([]);
    if(answer){const {protectedCells,score,...structure}=core;structure.terrain={bands:plan.bands,blocked:plan.bands.flatMap(b=>b.cells),walls:plan.bands[0].cells,clear:[...reserved],routes:routes.map(({access,...r})=>({...r,extra:r.steps-r.before}))};return{cells:answer,points,landings:landing,depths:answer.map(k=>after.get(k)),workshop:structure};}
    if(tries>=cfg.layoutAttempts)return null;
   }
  }
 }
 return null;
}
globalThis.RuinsWorkshopTerrain={layout};
})();
