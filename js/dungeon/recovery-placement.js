/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const R=RuinsSettlement,RS=RuinsResources;
// Preview tuning: shared indoor/outdoor quota; small roadside points never add a bonus quota.
const config={largeRoadCells:1200,smallTotal:2,largeTotal:3,outdoorMax:2,entryBuffer:10,exitBuffer:4,doorBuffer:2,spacing:15,propBuffer:3};
const distance=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
function nearestDistances(tiles,map,access){
 const result=new Int32Array(tiles.length).fill(-1);
 for(const from of access){const f=R.flood(tiles,map.width,map.height,from);for(let k=0;k<result.length;k++)if(f.dist[k]>=0&&(result[k]<0||f.dist[k]<result[k]))result[k]=f.dist[k];}
 return result;
}
function populate(map){
 if(map.contentConfig.version>=14)return RuinsPOIPlacement.recovery(map,config);
 const closed=R.closedPassages(map),initial=R.flood(closed,map.width,map.height,map.entry);
 const roads=closed.reduce((n,t,k)=>n+(R.walkable(t)&&map.road[k]&&initial.dist[k]>=0?1:0),0);
 const target=roads>=config.largeRoadCells?config.largeTotal:config.smallTotal;
 const quota=Math.min(config.outdoorMax,Math.max(0,target-map.recoveryPoints.length));
 map.recoveryBudget={target,roadCells:roads,indoor:map.recoveryPoints.length,outdoor:0};
 map.mixedBudget.recoveryMax=target;
 const types=RuinsMixed.recoveryCatalog.filter(p=>['campfire','kettle'].includes(p.id)&&!map.recoveryPoints.some(q=>q.id===p.id)).sort((a,b)=>R.hash(map.seed+'-road-recovery-kind-'+map.floor+'-'+a.id)-R.hash(map.seed+'-road-recovery-kind-'+map.floor+'-'+b.id));
 const trees=(map.trees||[]).map(t=>Math.floor(t.y)*map.width+Math.floor(t.x));
 const fixed=[...map.resources,...map.lootPoints];
 const candidates=[];
 for(let k=0;k<closed.length;k++){
  if(![0,3].includes(closed[k])||map.owner[k]>=0||initial.dist[k]<config.entryBuffer||distance(k,map.exit,map.width)<config.exitBuffer)continue;
  if(map.doors.some(d=>distance(d,k,map.width)<=config.doorBuffer)||fixed.some(p=>distance(p.cell,k,map.width)<config.propBuffer)||trees.some(t=>distance(t,k,map.width)<=1))continue;
  const orth=RS.neighbours(k,map);
  if(!orth.some(n=>map.tiles[n]===1||map.tiles[n]===R.VOID||!map.road[n]))continue;
  const x=k%map.width,y=Math.floor(k/map.width),around=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&x+dx<map.width&&y+dy>=0&&y+dy<map.height)around.push((y+dy)*map.width+x+dx);
  if(around.filter(n=>R.canStep(closed,map.width,map.height,n,k)).length<3||orth.filter(n=>initial.dist[n]>=0).length<2)continue;
  candidates.push(k);
 }
 let reached=initial.reached;
 for(const type of types.slice(0,quota)){
  const existing=map.recoveryPoints.map(p=>nearestDistances(map.collision,map,p.access));
  const score=k=>{
   const access=RS.neighbours(k,map).filter(n=>R.walkable(map.collision[n]));
   const gaps=existing.map(f=>Math.min(...access.map(n=>f[n]<0?Infinity:f[n])));
   return (gaps.length?Math.min(30,...gaps):0)+R.hash(map.seed+'-road-recovery-'+map.floor+'-'+type.id+'-'+k)/4294967296*12;
  };
  candidates.sort((a,b)=>score(b)-score(a)||a-b);
  for(const cell of candidates){
   if(!R.walkable(closed[cell]))continue;
   const access=RS.neighbours(cell,map).filter(k=>R.walkable(closed[k]));
   if(existing.some(f=>access.some(k=>f[k]>=0&&f[k]<config.spacing)))continue;
   const before=closed[cell];closed[cell]=6;
   const flow=R.flood(closed,map.width,map.height,map.entry);
   const open=map.collision.slice();open[cell]=6;const all=R.flood(open,map.width,map.height,map.entry);
   const usable=access.filter(k=>flow.dist[k]>=config.entryBuffer);
   const points=[...fixed,...map.recoveryPoints];
   if(flow.reached!==reached-1||all.reached!==open.filter(R.walkable).length||usable.length<2||points.some(p=>!RS.neighbours(p.cell,map).some(k=>all.dist[k]>=0))){closed[cell]=before;continue;}
   const point={...type,uid:'recovery-road-'+type.id+'-'+cell,roomId:null,outdoor:true,cell,access:usable,used:false};
   map.recoveryPoints.push(point);map.collision[cell]=6;map.recoveryBudget.outdoor++;reached=flow.reached;break;
  }
 }
 // Recompute final access after all fixed objects are present; never retain a now-blocked operating cell.
 const flow=R.flood(map.collision,map.width,map.height,map.entry);
 for(const p of [...fixed,...map.recoveryPoints])p.access=p.access.filter(k=>flow.dist[k]>=0);
 map.path=R.route(closed,map.width,map.height,map.entry,map.exit);
 if(!map.path.length)throw Error('恢复点阻断撤离通路。');
 map.recoveryBudget.actual=map.recoveryPoints.length;
 map.mixedSignature+=':road-recovery-v1:'+R.hash(JSON.stringify(map.recoveryPoints.map(p=>[p.uid,p.id,p.cell])));
 return map;
}
globalThis.RuinsRecoveryPlacement={config,populate,nearestDistances};
})();
