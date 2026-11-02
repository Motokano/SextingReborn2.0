/* SPDX-License-Identifier: GPL-3.0-only
 * SettleMaker owns street/building geometry. This adapter handles dungeon bounds,
 * rasterisation, room openings and placeholder ruin dressing, not city generation.
 */
(()=>{'use strict';
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
const moveDirs=[...dirs,[1,1],[1,-1],[-1,1],[-1,-1]];
const VOID=5;
const walkable=tile=>tile===0||tile===2||tile===3||tile===4;
function canStep(tiles,width,height,from,to){
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=width*height||to>=width*height||!walkable(tiles[from])||!walkable(tiles[to]))return false;
 const x=from%width,y=Math.floor(from/width),nx=to%width,ny=Math.floor(to/width),dx=nx-x,dy=ny-y;
 if((dx===0&&dy===0)||Math.abs(dx)>1||Math.abs(dy)>1)return false;
 // Both orthogonal neighbours must be clear: no squeezing past even one corner.
 return !dx||!dy||(walkable(tiles[y*width+nx])&&walkable(tiles[ny*width+x]));
}
function hash(s){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
function random(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function inside(x,y,ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a.y>y)!==(b.y>y))&&(x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x))c=!c;}return c;}
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function roadDistance(x,y,roads){let best=Infinity;for(const r of roads)for(let i=1;i<r.path.length;i++)best=Math.min(best,distance({x,y},r.path[i-1],r.path[i])-r.width/2);return best;}
function flood(tiles,width,height,start,eightWay=true){const dist=new Int32Array(width*height).fill(-1),prev=new Int32Array(width*height).fill(-1),q=new Int32Array(width*height);let head=0,tail=0;if(!Number.isInteger(start)||start<0||start>=tiles.length||!walkable(tiles[start]))return{dist,prev,reached:0};dist[start]=0;q[tail++]=start;while(head<tail){const a=q[head++],x=a%width,y=Math.floor(a/width);for(const [dx,dy]of eightWay?moveDirs:dirs){const nx=x+dx,ny=y+dy,b=ny*width+nx;if(nx<0||nx>=width||ny<0||ny>=height||dist[b]>=0||!canStep(tiles,width,height,a,b))continue;dist[b]=dist[a]+1;prev[b]=a;q[tail++]=b;}}return{dist,prev,reached:tail};}
function route(tiles,width,height,start,end){const flow=flood(tiles,width,height,start);if(flow.dist[end]<0||flow.dist[end]===undefined)return[];const path=[];for(let k=end;k>=0;k=flow.prev[k]){path.push(k);if(k===start)break;}return path.reverse();}
const exitConfig={entryBuffer:12,zoneSize:12};
function closedPassages(map){
 const tiles=(map.collision||map.tiles).slice();for(const k of map.doors)tiles[k]=1;return tiles;
}
function chooseExit(map,placementSeed=map.seed+'-exit-v2'){
 const {width,height,entry}=map,tiles=closedPassages(map),flow=flood(tiles,width,height,entry),excluded=new Set([entry]);
 // Keep the point out of paid rooms, door landings and decorative tree trunks.
 for(const door of map.doors){const x=door%width,y=Math.floor(door/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<width&&ny<height)excluded.add(ny*width+nx);}}
 for(const tree of map.trees||[])excluded.add(Math.floor(tree.y)*width+Math.floor(tree.x));
 const zones=new Map();let candidates=0;
 for(let k=0;k<tiles.length;k++){
  if((tiles[k]!==0&&tiles[k]!==3)||flow.dist[k]<exitConfig.entryBuffer||excluded.has(k))continue;
  const x=k%width,y=Math.floor(k/width);
  if(Math.max(Math.abs(x-entry%width),Math.abs(y-Math.floor(entry/width)))<exitConfig.entryBuffer)continue;
  const zone=Math.floor(x/exitConfig.zoneSize)+','+Math.floor(y/exitConfig.zoneSize);
  if(!zones.has(zone))zones.set(zone,[]);zones.get(zone).push(k);candidates++;
 }
 if(!candidates)throw Error('没有可达的撤离点候选位置，请换一个种子。');
 // A separate random stream preserves all SettleMaker geometry and contents.
 // First sample an occupied spatial zone, then a cell: no farthest-edge bias.
 const rnd=random(hash(placementSeed)),pool=[...zones.values()],zone=pool[Math.floor(rnd()*pool.length)],cell=zone[Math.floor(rnd()*zone.length)];
 const path=[];for(let k=cell;k>=0;k=flow.prev[k]){path.push(k);if(k===entry)break;}path.reverse();
 return {cell,path,placement:{version:2,candidates,zones:zones.size,entryBuffer:exitConfig.entryBuffer,zoneSize:exitConfig.zoneSize,steps:flow.dist[cell]}};
}
function trimStreetDistrict(tiles,width,height,buildings,roads){
 const active=new Uint8Array(tiles.length);
 // Retain a narrow shoulder around the actual roads and a working apron around
 // buildings; the remaining rectangular canvas is outside the generated terrain.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(roadDistance(x+.5,y+.5,roads)<=1.2)active[y*width+x]=1;
 for(const b of buildings)for(const k of b.cells){const x=k%width,y=Math.floor(k/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<width&&ny<height)active[ny*width+nx]=1;}}
 // Small enclosed gaps become courtyards. Large empty parcels remain absent.
 const seen=new Uint8Array(tiles.length);let courtyardCells=0;
 for(let k=0;k<active.length;k++){if(active[k]||seen[k])continue;const component=[k];seen[k]=1;let edge=false;
  for(let n=0;n<component.length;n++){const a=component[n],x=a%width,y=Math.floor(a/width);if(x===0||y===0||x===width-1||y===height-1)edge=true;for(const [dx,dy]of dirs){const nx=x+dx,ny=y+dy,j=ny*width+nx;if(nx<0||ny<0||nx>=width||ny>=height||active[j]||seen[j])continue;seen[j]=1;component.push(j);}}
  if(!edge&&component.length<=36){for(const a of component)active[a]=1;courtyardCells+=component.length;}
 }
 for(let k=0;k<tiles.length;k++)if(!active[k])tiles[k]=VOID;
 return{active,courtyardCells};
}
function make(seed='ruins-001',preset='city'){
 const rnd=random(hash(seed+'-frame')),seedValue=seed==='ruins-001'?42:hash(seed)&0x7fffffff;
 const input={name:'村外废墟',population:preset==='city'?120:72,engine:preset,biome:'temperate',port:false,citadel:false,walls:false,plaza:true,temple:false,shanty:false,capital:false,roadBearings:[{bearing_deg:25,kind:'town',route_id:'north'},{bearing_deg:185,kind:'town',route_id:'south'},{bearing_deg:285,kind:'local',route_id:'west'}]};
 const model=SettleMaker.createSettlementModel(input,{seed:seedValue});
 const raw=model.buildings.filter(b=>b.settlementRole!=='rural'),points=raw.flatMap(b=>b.footprint);
 if(!points.length)throw Error('未生成建筑，请换一个种子。');
 const minX=Math.min(...points.map(p=>p.x))-8,minY=Math.min(...points.map(p=>p.y))-8,maxX=Math.max(...points.map(p=>p.x))+8,maxY=Math.max(...points.map(p=>p.y))+8;
 const longest=82+Math.floor(rnd()*17),scale=(longest-2)/Math.max(maxX-minX,maxY-minY);
 const width=Math.ceil((maxX-minX)*scale)+2,height=Math.ceil((maxY-minY)*scale)+2;
 const convert=p=>({x:(p.x-minX)*scale+1,y:(p.y-minY)*scale+1});
 const roads=model.scene.layers.roads.map(r=>({...r,path:r.path.map(convert),width:Math.max(1.15,(r.width||2)*scale)}));
 const greens=model.scene.layers.greens.map(g=>({...g,ring:g.ring.map(convert)}));
 const buildings=raw.map((b,i)=>({id:i+1,sourceId:b.id,polygon:b.footprint.map(convert),cells:[],inner:[],ruined:false,door:null}));
 const owner=new Int16Array(width*height).fill(-1),tiles=new Uint8Array(width*height),road=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const k=y*width+x;road[k]=roadDistance(x+.5,y+.5,roads)<=0?1:0;for(const b of buildings)if(inside(x+.5,y+.5,b.polygon)){owner[k]=b.id;b.cells.push(k);break;}}
 for(const b of buildings){
  for(const k of b.cells){const x=k%width,y=Math.floor(k/width);const boundary=dirs.some(([dx,dy])=>owner[(y+dy)*width+x+dx]!==b.id);tiles[k]=boundary?1:2;if(!boundary)b.inner.push(k);}
  // Thin polygon necks can split the rasterised floor. Keep the largest room
  // component and fill the fragments, rather than cutting extra exterior holes.
  const remaining=new Set(b.inner),components=[];
  while(remaining.size){const q=[remaining.values().next().value];remaining.delete(q[0]);for(let n=0;n<q.length;n++){const a=q[n],x=a%width,y=Math.floor(a/width);for(const [dx,dy]of dirs){const j=(y+dy)*width+x+dx;if(remaining.delete(j))q.push(j);}}components.push(q);}
  components.sort((a,b)=>b.length-a.length);b.inner=components[0]||[];
  for(const fragment of components.slice(1))for(const k of fragment)tiles[k]=1;
  b.ruined=b.inner.length<6||(hash(seed+'-ruin-'+b.id)%7===0);
  if(b.ruined){for(const k of b.cells)tiles[k]=3;continue;}
  const cx=b.polygon.reduce((a,p)=>a+p.x,0)/b.polygon.length,cy=b.polygon.reduce((a,p)=>a+p.y,0)/b.polygon.length;
  b.center=b.inner.reduce((a,k)=>Math.hypot(k%width+.5-cx,Math.floor(k/width)+.5-cy)<Math.hypot(a%width+.5-cx,Math.floor(a/width)+.5-cy)?k:a,b.inner[0]);
 }
 let outside=flood(tiles,width,height,0);const rooms=[],doors=[];
 for(const b of buildings.filter(b=>!b.ruined)){
  // Find a doorway that joins interior to the already reachable exterior.
  let candidates=[];
  for(const k of b.cells){if(tiles[k]!==1)continue;const x=k%width,y=Math.floor(k/width);
   const through=dirs.some(([dx,dy])=>{const inner=(y-dy)*width+x-dx,outer=(y+dy)*width+x+dx;return owner[inner]===b.id&&tiles[inner]===2&&owner[outer]!==b.id&&outside.dist[outer]>=0;});
   if(through)candidates.push({k,score:roadDistance(x+.5,y+.5,roads)});
  }
  candidates.sort((a,b)=>a.score-b.score||a.k-b.k);
  if(!candidates.length){b.ruined=true;for(const k of b.cells)tiles[k]=3;outside=flood(tiles,width,height,0);continue;}
  const opening=candidates[0].k;tiles[opening]=4;b.door=opening;doors.push(opening);
  outside=flood(tiles,width,height,0);
  rooms.push(b);
 }
 if(!rooms.length)throw Error('当前尺寸无法保留内容房，请换一个种子。');
 // City mode omits unoccupied green parcels from the generated/playable terrain.
 const trim=preset==='city'?trimStreetDistrict(tiles,width,height,buildings,roads):{active:new Uint8Array(tiles.length).fill(1),courtyardCells:0};
 // Keep the existing arrival. The exit is sampled separately after sealing.
 const edge=[];for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if((x===1||x===width-2||y===1||y===height-2)&&owner[y*width+x]<0&&road[y*width+x])edge.push(y*width+x);
 const fallback=(height-2)*width+Math.floor(width/2),entry=edge.reduce((a,k)=>Math.floor(k/width)>Math.floor(a/width)?k:a,edge[0]??fallback);
 const flow=flood(tiles,width,height,entry);
 // Seal sub-tile rasterisation pockets instead of inventing connecting corridors.
 let sealedPockets=0;for(let k=0;k<tiles.length;k++)if(walkable(tiles[k])&&flow.dist[k]<0){tiles[k]=1;sealedPockets++;}
 for(const b of rooms)b.inner=b.inner.filter(k=>tiles[k]===2);
 if(rooms.some(b=>flow.dist[b.center]<0))throw Error('内容房未连通，请换一个种子。');
 const trees=preset==='city'?[]:model.scene.layers.vegetation.map(v=>({...convert(v.at),size:Math.min(2.4,v.scale*scale*.4)})).filter(v=>v.x>1&&v.y>1&&v.x<width-1&&v.y<height-1&&owner[Math.floor(v.y)*width+Math.floor(v.x)]<0&&roadDistance(v.x,v.y,roads)>2).filter((_,i)=>i%3===0);
 const result={seed,preset,seedValue,width,height,tiles:Array.from(tiles),active:Array.from(trim.active),voidCells:tiles.filter(v=>v===VOID).length,courtyardCells:trim.courtyardCells,owner:Array.from(owner),road:Array.from(road),buildings,rooms,roads,greens:preset==='city'?[]:greens,doors,trees,entry,scale,sealedPockets,sourceBounds:{minX,minY,maxX,maxY},input,upstreamVersion:'4.0.0',diagnostics:model.diagnostics,walkable:tiles.filter(walkable).length,reached:flow.reached};
 const exit=chooseExit(result);result.exit=exit.cell;result.path=exit.path;result.exitPlacement=exit.placement;return result;
}
globalThis.RuinsSettlement={make,hash,random,inside,flood,route,canStep,walkable,VOID,exitConfig,closedPassages,chooseExit};
})();
