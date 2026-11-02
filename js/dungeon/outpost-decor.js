/* SPDX-License-Identifier: GPL-3.0-only
 * Cosmetic dressing gets the last allocation pass. It never displaces gameplay
 * content. Low furniture blocks one cell, but does not block sight or give loot.
 */
(()=>{'use strict';
const R=RuinsSettlement,RS=RuinsResources;
const distance=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
const roll=(m,key,k)=>R.hash(m.seed+'-decor-'+m.floor+'-'+key+'-'+k)/4294967296;
function fits(m,room,cells){
 const cfg=m.contentConfig.outposts,inside=new Set(room.inner),points=[...(room.lootPoints||[]),...(room.recoveryPoints||[]),...(room.nodes||[])];
 const landings=RS.neighbours(room.door,m).filter(k=>inside.has(k));
 const occupied=[...points.map(p=>p.cell),...room.enemies.map(e=>e.cell),...cells],blocked=new Set(occupied);
 if(!landings.length||blocked.size!==occupied.length||cells.some(k=>!inside.has(k))||landings.some(k=>blocked.has(k)))return false;
 if(room.inner.length-blocked.size<Math.ceil(room.inner.length*cfg.freeRatio))return false;
 const seen=new Set([landings[0]]),queue=[landings[0]];
 for(let i=0;i<queue.length;i++)for(const k of RS.neighbours(queue[i],m))if(inside.has(k)&&!blocked.has(k)&&!seen.has(k)){seen.add(k);queue.push(k);}
 return seen.size===room.inner.length-blocked.size&&landings.every(k=>seen.has(k))&&points.every(p=>RS.neighbours(p.cell,m).filter(k=>seen.has(k)).length>=cfg.pointAccess)&&room.enemies.every(e=>RS.neighbours(e.cell,m).some(k=>seen.has(k)));
}
function populate(m){
 m.outpostDecor=[];m.decorBlocked=new Set();m.outpostFloor=new Map();
 const cfg=m.contentConfig?.outpostDecor;if(!cfg?.enabled)return m;
 for(const room of m.outposts||[]){
  const points=[...(room.lootPoints||[]),...(room.recoveryPoints||[]),...(room.nodes||[])],orth=k=>RS.neighbours(k,m),w=m.width;
  const wallDepth=k=>orth(k).some(n=>m.tiles[n]===1)?1:orth(k).some(n=>orth(n).some(a=>m.tiles[a]===1))?2:3;
  const blocked=[...(room.workshop?.cells||[]),...(room.workshop?.terrain?.blocked||[]),...(room.clinic?.solid||[]),...(room.canteen?.solid||[]),...(room.largeRoomTerrain?.cells||[])],groups=[];
  if(room.largeRoomTerrain){const t=room.largeRoomTerrain;m.outpostDecor.push(...t.decor);room.barrierGroups=t.groups;room.partitionStatus=t.status;room.partitionRoutes=t.routes;}
  else if(room.workshop||room.clinic||room.canteen)room.barrierGroups=[];
  else if(cfg.partitions){room.barrierGroups=[];if(cfg.partitions.enabled)placePartitions(m,room,blocked);}else placeBarriers(m,room,blocked);
  const barrierCount=blocked.length;
  const target=Math.min(cfg.maxFurniture,Math.max(cfg.minFurniture,Math.round(room.inner.length/cfg.cellsPerFurniture)));
  const barrierCells=blocked.slice(),barrierEnds=new Set([...(room.barrierGroups||[]).flatMap(g=>g.ends),...(room.workshop?.ring||[]),...(room.workshop?.terrain?.clear||[]),...(room.clinic?.reserved||[]),...(room.canteen?.reserved||[])]);
  const candidates=room.inner.filter(k=>!barrierEnds.has(k)&&barrierCells.every(q=>distance(k,q,w)>=cfg.barriers.groupSpacing)&&wallDepth(k)<=cfg.wallBand&&distance(k,room.door,w)>=cfg.doorBuffer&&points.every(p=>distance(k,p.cell,w)>=cfg.pointBuffer)&&room.enemies.every(e=>distance(k,e.cell,w)>=cfg.enemyBuffer)&&R.walkable(m.collision[k]));
  // Two or more small wall-side groups, with a gap between groups. Candidates
  // are finite: failed placements reduce decoration, never move a door or POI.
  while(blocked.length-barrierCount<target){
   const group=groups[groups.length-1],extend=group&&!group.closed&&group.cells.length<cfg.groupSize;
   const choices=candidates.filter(k=>!blocked.includes(k)&&(extend?distance(k,group.anchor,w)<=cfg.groupRadius:groups.every(g=>distance(k,g.anchor,w)>=cfg.groupSpacing)));
   const rank=k=>wallDepth(k)*2+(extend?distance(k,group.anchor,w):0)-Math.min(8,distance(k,room.door,w))*.15+roll(m,'furniture',k);
   choices.sort((a,b)=>rank(a)-rank(b)||a-b);
   const cell=choices.find(k=>fits(m,room,[...blocked,k]));
   if(cell===undefined){if(extend){group.closed=true;continue;}break;}
   if(extend)group.cells.push(cell);else groups.push({anchor:cell,cells:[cell]});
   const palette=room.clinic||room.canteen?['broken-chair','old-radiator']:room.outpostType==='loot'?['timber-rack','tire-pair','broken-fan','old-radiator','broken-chair']:['broken-chair','old-radiator','timber-rack','broken-fan','tire-pair'];
   const index=blocked.length-barrierCount,offset=R.hash(m.seed+'-furniture-kind-'+room.id)%palette.length,kind=palette[(index+offset)%palette.length];
   blocked.push(cell);m.outpostDecor.push({uid:'decor-'+room.id+'-'+index,roomId:room.id,cell,kind,solid:true,flip:roll(m,'flip',cell)<.5});
  }
  for(const k of blocked){if(m.workshopBlocked?.has(k)||m.clinicBlocked?.has(k)||m.canteenBlocked?.has(k))continue;m.decorBlocked.add(k);m.collision[k]=6;if(m.patrolTiles)m.patrolTiles[k]=6;}
  const mats=cfg.minMats+R.hash(m.seed+'-mats-'+room.id+'-'+m.floor)%(cfg.maxMats-cfg.minMats+1),placed=[];
  const matCandidates=room.inner.filter(k=>R.walkable(m.collision[k])&&distance(k,room.door,w)>=cfg.doorBuffer&&points.every(p=>distance(k,p.cell,w)>=2));
  matCandidates.sort((a,b)=>{
   const rank=k=>Math.abs(wallDepth(k)-2)+Math.abs(Math.min(...blocked.map(b=>distance(k,b,w)),3)-2)+roll(m,'mat',k);
   return rank(a)-rank(b)||a-b;
  });
  for(const cell of matCandidates){
   if(placed.length>=mats)break;if(placed.some(k=>distance(k,cell,w)<3))continue;
   placed.push(cell);m.outpostDecor.push({uid:'mat-'+room.id+'-'+placed.length,roomId:room.id,cell,kind:'worn-mat',solid:false,flip:roll(m,'flip',cell)<.5});
  }
  room.decorations=m.outpostDecor.filter(p=>p.roomId===room.id);
 }
 // Validate the completed floor, including all closed-gate outdoor routes.
 const flow=R.flood(m.collision,m.width,m.height,m.entry),allPoints=[...m.resources,...m.lootPoints,...m.recoveryPoints,...m.insightPoints];
 const path=R.route(R.closedPassages(m),m.width,m.height,m.entry,m.exit);
 if(flow.reached!==m.collision.filter(R.walkable).length||!path.length||allPoints.some(p=>!RS.neighbours(p.cell,m).some(k=>flow.dist[k]>=0))){
  for(const k of m.decorBlocked){if(m.largeRoomBlocked?.has(k))continue;m.collision[k]=m.tiles[k];if(m.patrolTiles)m.patrolTiles[k]=m.tiles[k];}
  if(m.contentConfig.version>=13){
   m.decorBlocked=new Set(m.largeRoomBlocked);m.outpostDecor=(m.outposts||[]).flatMap(r=>r.largeRoomTerrain?.decor||[]);
   for(const room of m.outposts||[]){room.decorations=m.outpostDecor.filter(p=>p.roomId===room.id);room.barrierGroups=room.largeRoomTerrain?.groups||[];}
   dressFloor(m);return m;
  }
  m.decorBlocked.clear();m.outpostDecor=[];for(const room of m.outposts||[]){room.decorations=[];room.barrierGroups=[];if(room.partitionStatus){room.partitionStatus='floor-validation-failed';room.partitionRoutes=[];}}return m;
 }
 for(const p of allPoints)p.access=RS.neighbours(p.cell,m).filter(k=>flow.dist[k]>=0);
 m.path=path;dressFloor(m);return m;
}
// Compare actual entrance-to-function routes. Actors are deliberately omitted
// here: temporary enemy occupancy must not count as a permanent spatial detour.
function functionRoutes(m,room,cells){
 const w=m.width,inside=new Set(room.inner),points=[...(room.lootPoints||[]),...(room.recoveryPoints||[]),...(room.nodes||[])];
 const blocked=new Set([...cells,...points.map(p=>p.cell)]),dist=new Map(),queue=[];
 for(const k of RS.neighbours(room.door,m))if(inside.has(k)&&!blocked.has(k)){dist.set(k,0);queue.push(k);}
 const free=k=>inside.has(k)&&!blocked.has(k);
 for(let i=0;i<queue.length;i++){
  const k=queue[i],x=k%w,y=Math.floor(k/w);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy,n=ny*w+nx;
   if(nx<0||nx>=w||ny<0||ny>=m.height||!free(n)||dist.has(n)||dx&&dy&&(!free(y*w+nx)||!free(ny*w+x)))continue;
   dist.set(n,dist.get(k)+1);queue.push(n);
  }
 }
 return points.map(p=>({uid:p.uid,steps:Math.min(...RS.neighbours(p.cell,m).filter(k=>dist.has(k)).map(k=>dist.get(k)))}));
}
function placePartitions(m,room,blocked){
 const cfg=m.contentConfig.outpostDecor.partitions,w=m.width,inside=new Set(room.inner),points=[...(room.lootPoints||[]),...(room.recoveryPoints||[]),...(room.nodes||[])];
 room.barrierGroups=[];room.partitionRoutes=[];
 const occupied=new Set([...points,...room.enemies].map(p=>p.cell)),baseline=functionRoutes(m,room,[]);
 const maxCells=Math.floor(room.inner.length*cfg.maxBlockedRatio),candidates=[];
 const coord=(k,axis)=>axis==='x'?k%w:Math.floor(k/w);
 // Each strip meets the room boundary at one end. Its other end leaves a
 // two-cell opening. Two opposing strips make a staggered passage rather than
 // several islands that can all be ignored along the same straight route.
 for(const axis of ['x','y']){
  const depthAxis=axis==='x'?'y':'x',lo=Math.min(...room.inner.map(k=>coord(k,depthAxis))),hi=Math.max(...room.inner.map(k=>coord(k,depthAxis)));
  for(let depth=lo+1;depth<hi;depth++)for(const thickness of [2,1])for(const side of [-1,1])for(let gap=cfg.gapWidth;gap<=cfg.maxGapWidth;gap++){
   const cells=[],gaps=[];
   for(let v=depth;v<depth+thickness;v++){
    const line=room.inner.filter(k=>coord(k,depthAxis)===v).sort((a,b)=>coord(a,axis)-coord(b,axis));
    if(line.length<gap+3){cells.length=0;break;}
    const opening=side<0?line.slice(-gap):line.slice(0,gap);
    gaps.push(...opening);cells.push(...line.filter(k=>!opening.includes(k)));
   }
   if(cells.length<cfg.minCells||cells.length>maxCells||cells.some(k=>occupied.has(k)||distance(k,room.door,w)<cfg.doorBuffer)||gaps.some(k=>occupied.has(k))||!fits(m,room,cells))continue;
   const route=functionRoutes(m,room,cells),extra=route.reduce((n,r,i)=>n+r.steps-baseline[i].steps,0)/points.length;
   candidates.push({axis,depth,thickness,side,shape:'partition',cells,ends:gaps,extra});
  }
 }
 let best=null;
 function consider(bands){
  const cells=bands.flatMap(b=>b.cells);
  if(cells.length>maxCells||new Set(cells).size!==cells.length||!fits(m,room,cells))return;
  const route=functionRoutes(m,room,cells),extra=route.map((r,i)=>r.steps-baseline[i].steps);
  const mean=extra.reduce((a,b)=>a+b,0)/extra.length,ratio=route.reduce((n,r)=>n+r.steps,0)/Math.max(1,baseline.reduce((n,r)=>n+r.steps,0));
  // Every destination must need a meaningful detour, not just a conveniently
  // chosen pair of empty squares on opposite sides of one prop.
  if(extra.some(n=>!Number.isFinite(n)||n<cfg.minExtraSteps)||ratio<cfg.minRouteRatio)return;
  const score=Math.min(...extra)*3+mean+bands.length*.35+cells.length*.025;
  if(!best||score>best.score)best={bands,cells,route,extra,mean,ratio,score};
 }
 candidates.sort((a,b)=>b.extra-a.extra||b.cells.length-a.cells.length||a.depth-b.depth);
 for(const a of candidates)consider([a]);
 if(cfg.maxBands>=2)for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
  const a=candidates[i],b=candidates[j];
  if(a.axis!==b.axis||a.side===b.side||Math.abs(a.depth-b.depth)<Math.max(a.thickness,b.thickness)+2||a.ends.some(k=>b.cells.includes(k))||b.ends.some(k=>a.cells.includes(k)))continue;
  consider([a,b]);
 }
 if(!best){room.partitionStatus='no-safe-detour';return;}
 room.partitionStatus='placed';room.partitionRoutes=best.route.map((r,i)=>({...r,before:baseline[i].steps,extra:best.extra[i]}));
 for(const [group,band] of best.bands.entries()){
  room.barrierGroups.push({...band,id:group});blocked.push(...band.cells);
  const pending=new Set(band.cells);let piece=0;
  // Tile the occupied strip with real 2x2 piles, then fill its irregular ends
  // with approved single-cell racks. Art and collision share these footprints.
  for(const k of [...pending].sort((a,b)=>a-b)){
   if(!pending.has(k))continue;
   const square=[k,k+1,k+w,k+w+1],pile=square.every(n=>pending.has(n)&&inside.has(n)&&n%w>=k%w);
   const next=k+(band.axis==='x'?1:w),pair=!pile&&pending.has(next),footprint=pile?square:pair?[k,next]:[k];
   const kind=pile?(group%2===0?'sealed-cargo-obstacle-v1':'collapsed-rubble-obstacle-v1'):pair?'timber-stone-barricade-v1':'timber-rack';
   for(const [i,cell] of footprint.entries()){
    pending.delete(cell);m.outpostDecor.push({uid:'partition-'+room.id+'-'+group+'-'+piece+'-'+i,roomId:room.id,cell,kind,solid:true,role:'barrier',group,flip:!pile&&band.axis==='y',...(pile?{render:i===3,footprint,offsetX:-.5,offsetY:-.5}:pair?{render:i===1,footprint,offsetX:band.axis==='x'?-.5:0,offsetY:band.axis==='y'?-.5:0}:{})});
   }
   piece++;
  }
 }
}
// Dry run with all planned occupants present. Removing some or all of them
// later leaves the same safe terrain in lightly occupied and abandoned rooms.
function planPartitions(m,room,placement){
 const preview={...m,outpostDecor:[]},draft={...room,enemies:placement.cells.map(cell=>({cell})),lootPoints:placement.points.map((cell,i)=>({cell,uid:'layout-'+room.id+'-'+i})),recoveryPoints:[],nodes:[]},cells=[];
 if(m.contentConfig.outpostDecor.partitions.enabled)placePartitions(preview,draft,cells);
 if(!cells.length)placeBarriers(preview,draft,cells);
 return {cells,decor:preview.outpostDecor,groups:draft.barrierGroups||[],routes:draft.partitionRoutes||[],status:draft.partitionStatus||'fallback'};
}
function placeBarriers(m,room,blocked){
 const d=m.contentConfig.outpostDecor,b=d.barriers;room.barrierGroups=[];
 if(!b?.enabled||!b.maxGroups)return;
 const w=m.width,inside=new Set(room.inner),points=[...(room.lootPoints||[]),...(room.recoveryPoints||[]),...(room.nodes||[])];
 const occupied=new Set([...points,...room.enemies].map(p=>p.cell));
 const at=(k,dx,dy)=>{const x=k%w+dx,y=Math.floor(k/w)+dy;return x>=0&&x<w&&y>=0&&y<m.height?y*w+x:-1;};
 const clearWall=k=>{
  for(let dy=-b.wallClearance;dy<=b.wallClearance;dy++)for(let dx=-b.wallClearance;dx<=b.wallClearance;dx++)if(!inside.has(at(k,dx,dy)))return false;
  return true;
 };
 const target=room.inner.length>=b.largeArea?b.maxGroups:b.minGroups;
 const centerX=room.inner.reduce((sum,k)=>sum+k%w,0)/room.inner.length,centerY=room.inner.reduce((sum,k)=>sum+Math.floor(k/w),0)/room.inner.length;
 const transverse=Math.abs(centerX-room.door%w)>Math.abs(centerY-Math.floor(room.door/w))?'y':'x';
 const candidates=[],shapes=[];
 if(b.piles)shapes.push({width:2,height:2,shape:'pile',axis:transverse});
 for(let length=b.maxLength;length>=b.minLength;length--)for(const axis of ['x','y'])shapes.push({width:axis==='x'?length:1,height:axis==='y'?length:1,shape:'row',axis});
 for(const shape of shapes)for(const start of room.inner){
  const {width,height,axis}=shape,cells=[];for(let dy=0;dy<height;dy++)for(let dx=0;dx<width;dx++)cells.push(at(start,dx,dy));
  if(cells.some(k=>!inside.has(k)||!clearWall(k)||distance(k,room.door,w)<b.doorBuffer||points.some(p=>distance(k,p.cell,w)<d.pointBuffer)||room.enemies.some(e=>distance(k,e.cell,w)<b.enemyBuffer)))continue;
  const ends=[];
  // Reserve a two-cell bypass band past both ends of the footprint.
  for(let n=1;n<=2;n++)if(axis==='x'){for(let y=0;y<height;y++)ends.push(at(start,-n,y),at(start,width-1+n,y));}
  else for(let x=0;x<width;x++)ends.push(at(start,x,-n),at(start,x,height-1+n));
  if(ends.some(k=>!inside.has(k)||occupied.has(k)))continue;
  const central=Math.abs(start%w+(width-1)/2-centerX)+Math.abs(Math.floor(start/w)+(height-1)/2-centerY);
  const probe=axis==='x'?[at(start,Math.floor(width/2),-1),at(start,Math.floor(width/2),height)]:[at(start,-1,Math.floor(height/2)),at(start,width,Math.floor(height/2))];
  candidates.push({...shape,cells,ends,probe,score:central*.25+(axis===transverse?0:1.2)-(cells.length-2)*.8+(shape.shape==='pile'?-2.5:0)+roll(m,'barrier',start+cells.length)});
 }
 candidates.sort((a,c)=>a.score-c.score||a.cells[0]-c.cells[0]);
 if(target>1){
  let best=null;
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
   const a=candidates[i],c=candidates[j],score=a.score+c.score;
   if(best&&score>=best.score||a.cells.some(k=>c.cells.some(q=>distance(k,q,w)<b.groupSpacing))||a.ends.some(k=>c.cells.includes(k))||c.ends.some(k=>a.cells.includes(k))||!fits(m,room,[...a.cells,...c.cells]))continue;
   best={a,c,score};
  }
  if(best){candidates.splice(candidates.indexOf(best.a),1);candidates.splice(candidates.indexOf(best.c),1);candidates.unshift(best.a,best.c);}
 }
 const reserved=new Set();
 for(const candidate of candidates){
  if(room.barrierGroups.length>=target)break;
  if(candidate.cells.some(k=>reserved.has(k)||blocked.some(q=>distance(k,q,w)<b.groupSpacing))||candidate.ends.some(k=>blocked.includes(k))||!fits(m,room,[...blocked,...candidate.cells]))continue;
  const group=room.barrierGroups.length;room.barrierGroups.push({...candidate,id:group});candidate.ends.forEach(k=>reserved.add(k));
  // Consistent material within a short row reads as a pile/barricade, not a
  // scatter of unrelated props. All pieces retain their approved map sizes.
  const kind=candidate.shape==='pile'?(R.hash(m.seed+'-pile-'+room.id+'-'+group)%2?'sealed-cargo-obstacle-v1':'collapsed-rubble-obstacle-v1'):group%2===0?'timber-rack':'tire-pair';
  for(const [i,cell] of candidate.cells.entries()){
   const pile=candidate.shape==='pile',primary=i===candidate.cells.length-1;
   blocked.push(cell);m.outpostDecor.push({uid:'barrier-'+room.id+'-'+group+'-'+i,roomId:room.id,cell,kind,solid:true,role:'barrier',group,flip:!pile&&candidate.axis==='y',...(pile?{render:primary,footprint:candidate.cells,offsetX:-.5,offsetY:-.5}:{})});
  }
 }
}
function dressFloor(m){
 const cfg=m.contentConfig?.outpostDecor?.floor;if(!cfg?.enabled)return;
 const kinds=Object.keys(cfg.weights),total=Object.values(cfg.weights).reduce((a,b)=>a+b,0);
 for(const room of m.outposts||[]){
  let rollValue=roll(m,'floor',room.id)*total,main=kinds[kinds.length-1];
  for(const kind of kinds){rollValue-=cfg.weights[kind];if(rollValue<0){main=kind;break;}}
  if(room.workshop||room.clinic||room.canteen)main='concrete';
  const w=m.width,dx=room.center%w-room.door%w,dy=Math.floor(room.center/w)-Math.floor(room.door/w),axis=Math.abs(dx)>Math.abs(dy)?'x':'y',sign=(axis==='x'?dx:dy)>=0?1:-1;
  const coord=k=>sign*(axis==='x'?k%w:Math.floor(k/w)),min=Math.min(...room.inner.map(coord)),max=Math.max(...room.inner.map(coord));
  const strip=room.inner.filter(k=>coord(k)>=max-Math.max(1,Math.round((max-min+1)*cfg.accentRatio))+1);
  const xs=strip.map(k=>k%w),ys=strip.map(k=>Math.floor(k/w));
  const useAccent=cfg.accentRatio>0&&room.inner.length>=cfg.largeArea&&strip.length>=6&&new Set(xs).size>=2&&new Set(ys).size>=2;
  const accent=main==='timber'?'concrete':main==='concrete'?(room.outpostType==='recovery'?'timber':'industrial'):'concrete',accentCells=new Set(useAccent?strip:[]);
  room.floorStyle={main,accent:useAccent?accent:null};
  for(const k of room.inner)if(k!==room.door){
   const bay=room.workshop,x=k%m.width,y=Math.floor(k/m.width),edges=[];
   if(bay){if(x>=bay.x&&x<bay.x+bay.width){if(y===bay.y-1)edges.push(2);if(y===bay.y+bay.height)edges.push(0);}if(y>=bay.y&&y<bay.y+bay.height){if(x===bay.x-1)edges.push(1);if(x===bay.x+bay.width)edges.push(3);}}
   const bands=bay?.terrain?.bands,depth=bands?(bands[0].axis==='x'?y:x):0,lo=bands?Math.min(...bands.map(b=>b.depth)):0,hi=bands?Math.max(...bands.map(b=>b.depth)):0;
   const bayKind=bands&&(depth<lo||depth>hi)?'industrial':'concrete';
   m.outpostFloor.set(k,{kind:room.clinic?'concrete':bay?bayKind:accentCells.has(k)?accent:main,span:cfg.textureSpan,clinic:!!room.clinic,canteen:!!room.canteen,...(bay?{bay:true,edges,oil:bay.cells.includes(k)||edges.length>0}:{})});
  }
 }
}
const catalog={
 'timber-rack':{bounds:[223,128,933,962],anchor:[690,900],width:.77},
 'broken-chair':{bounds:[231,14,897,1178],anchor:[680,970],width:.60},
 'worn-mat':{bounds:[43,302,1220,735],anchor:[650,670],width:1.16},
 'old-radiator':{bounds:[212,164,894,916],anchor:[665,875],width:.71},
 'tire-pair':{bounds:[303,239,785,737],anchor:[695,780],width:.59},
 'broken-fan':{bounds:[154,95,1041,965],anchor:[700,880],width:.68},
 'sealed-cargo-obstacle-v1':{bounds:[66,61,1259,1022],anchor:[690,825],width:2.35},
 'collapsed-rubble-obstacle-v1':{bounds:[90,161,1123,916],anchor:[650,830],width:2.35},
 'timber-stone-barricade-v1':{bounds:[55,88,1433,895],anchor:[775,670],width:1.98},
 'workshop-machine-v1':{src:'workshop-machine-v2.png',bounds:[94,12,1390,1000],anchor:[790,740],width:3.15},
 'workshop-bench-v1':{bounds:[80,80,1370,885],anchor:[765,710],width:1.98},
 'canteen-table-v1':{bounds:[60,28,1420,960],anchor:[763,653],width:1.90,groundSlopes:[.45,-.56]},
 'canteen-counter-v1':{bounds:[35,8,1455,1008],anchor:[755,670],width:1.90,groundSlopes:[.44,-.70]},
 'clinic-bed-v1':{bounds:[130,30,1295,960],anchor:[785,710],width:1.82},
 'clinic-bench-v1':{bounds:[175,40,1170,925],anchor:[765,740],width:1.65}
};
const images=new Map();let invalidate=()=>{};
function setInvalidation(fn){invalidate=fn;if(typeof Image==='undefined')return;for(const key of [...Object.keys(catalog),'floor-timber','floor-concrete','floor-industrial']){if(globalThis.DungeonGridArt?.asset(key)){DungeonGridArt.load(key);continue;}if(images.has(key))continue;const im=new Image();images.set(key,im);im.onload=()=>invalidate();im.onerror=()=>console.error('据点装饰加载失败：'+key);im.src=globalThis.DungeonGridArt?.materials[key]||'assets/dungeon/outpost-decor-v1/'+(catalog[key]?.src||key+'.png');}}
function draw(ctx,p,x,y,s){
 if(globalThis.DungeonBossRoomArt?.drawDecor(ctx,p,x,y,s))return;
 if(globalThis.DungeonGridArt?.asset(p.kind)){DungeonGridArt.draw(ctx,p.kind,'normal',x,y,s,{flip:p.flip,shadow:!!p.solid,point:p});return;}
 const a=catalog[p.kind],im=images.get(p.kind);if(!a||!im?.complete||!im.naturalWidth)return;
 const [bx,by,bw,bh]=a.bounds,[cx,cy]=a.anchor,f=s*a.width/bw;
 ctx.save();ctx.translate(x,y);if(p.flip)ctx.scale(-1,1);
 if(p.solid){
  ctx.save();ctx.translate(0,s*.025);ctx.scale(s*a.width*.36,s*a.width*.13);
  const shade=ctx.createRadialGradient(0,0,0,0,0,1);shade.addColorStop(0,'#101a1460');shade.addColorStop(1,'#101a1400');
  ctx.fillStyle=shade;ctx.fillRect(-1,-1,2,2);ctx.restore();
  ctx.filter='saturate(86%) brightness(96%)';
 }
 // Sprite art may use a different ground-plane camera. Register its two
 // measured horizontal axes to project(x,y), keeping verticals vertical and
 // the ground anchor fixed. This is applied once, before the footprint flip.
 if(a.groundSlopes){const [u,v]=a.groundSlopes,d=Math.SQRT2/(u-v),b=1/Math.SQRT2-d*u;ctx.transform(1,b,0,d,0,0);}
 ctx.drawImage(im,bx,by,bw,bh,(bx-cx)*f,(by-cy)*f,bw*f,bh*f);ctx.restore();
}
function floor(ctx,m,k,q){
 const a=m.outpostFloor?.get(k),im=a&&images.get('floor-'+a.kind);if(!im?.complete||!im.naturalWidth)return false;
 const n=a.span,x=k%m.width,y=Math.floor(k/m.width),mod=(v,d)=>(v%d+d)%d;
 // Mirrored texture repeats match their edge pixels even when generated art is
 // not perfectly tileable. Every cell samples one continuous world-space plane.
 const flipX=mod(Math.floor(x/n),2)===1,flipY=mod(Math.floor(y/n),2)===1;
 const u=(flipX?n-1-mod(x,n):mod(x,n))/n,v=(flipY?n-1-mod(y,n):mod(y,n))/n;
 ctx.save();ctx.beginPath();q.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();ctx.clip();
 ctx.transform(q[1].x-q[0].x,q[1].y-q[0].y,q[3].x-q[0].x,q[3].y-q[0].y,q[0].x,q[0].y);
 if(flipX){ctx.translate(1,0);ctx.scale(-1,1);}if(flipY){ctx.translate(0,1);ctx.scale(1,-1);}
 ctx.drawImage(im,u*im.naturalWidth,v*im.naturalHeight,im.naturalWidth/n,im.naturalHeight/n,0,0,1,1);
 ctx.fillStyle='#17231c24';ctx.fillRect(0,0,1,1);
 if(a.canteen){ctx.fillStyle='#cbbd8b19';ctx.fillRect(0,0,1,1);}
 if(a.clinic){ctx.fillStyle='#c4d0bc27';ctx.fillRect(0,0,1,1);}
 if(a.bay){
  // Undo texture mirroring before placing markings in world-grid directions.
  if(flipY){ctx.scale(1,-1);ctx.translate(0,-1);}if(flipX){ctx.scale(-1,1);ctx.translate(-1,0);}
  if(a.oil){
   // One worn patch crosses cell boundaries, rather than a stamped dot per tile.
   const ax=mod(x,5),ay=mod(y,5),q=[[.7,1.3],[1.5,.9],[2.1,1.2],[2.7,1.05],[3.4,1.7],[3.1,2.3],[2.35,2.55],[1.4,2.2],[.9,2.35]];
   ctx.fillStyle='#26302924';ctx.beginPath();q.forEach(([u,v],i)=>ctx[i?'lineTo':'moveTo'](u-ax,v-ay));ctx.closePath();ctx.fill();
  }
  ctx.strokeStyle='#c3a85a92';ctx.lineWidth=.055;ctx.setLineDash([.22,.11]);
  for(const edge of a.edges){const lines=[[[.05,.12],[.95,.12]],[[.88,.05],[.88,.95]],[[.05,.88],[.95,.88]],[[.12,.05],[.12,.95]]],l=lines[edge];ctx.beginPath();ctx.moveTo(...l[0]);ctx.lineTo(...l[1]);ctx.stroke();}
 }
 ctx.restore();return true;
}
globalThis.RuinsOutpostDecor={populate,fits,functionRoutes,planPartitions,catalog,draw,floor,setInvalidation};
})();
