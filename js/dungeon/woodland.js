/* Village outskirts: seeded woodland mixed into the existing settlement footprint. */
(()=>{'use strict';
const R=RuinsSettlement;
const config={enabled:true,targetForestRatio:.50,ratioVariation:.03,patchScale:12,treeDensity:.065/3,treeSpacing:2.25,wallBuffer:2,doorBuffer:2,pathBuffer:1,groundBuffer:1};
const cardinal=[[1,0],[-1,0],[0,1],[0,-1]];
function neighbours(m,k){const x=k%m.width,y=Math.floor(k/m.width);return cardinal.map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>a>=0&&b>=0&&a<m.width&&b<m.height).map(([a,b])=>b*m.width+a);}
const hash=(seed,x,y)=>R.hash(seed+':'+x+':'+y)/4294967296;
function noise(seed,x,y,scale){x/=scale;y/=scale;const ix=Math.floor(x),iy=Math.floor(y),a=x-ix,b=y-iy,u=a*a*(3-2*a),v=b*b*(3-2*b);return (hash(seed,ix,iy)*(1-u)+hash(seed,ix+1,iy)*u)*(1-v)+(hash(seed,ix,iy+1)*(1-u)+hash(seed,ix+1,iy+1)*u)*v;}
function populate(m,overrides={}){
 const cfg={...config,...overrides};if(!cfg.enabled||m.preset!=='city')return m;
 if(!Number.isFinite(cfg.targetForestRatio)||cfg.targetForestRatio<0||cfg.targetForestRatio>1||!Number.isFinite(cfg.ratioVariation)||cfg.ratioVariation<0||cfg.patchScale<=0||cfg.treeDensity<0||cfg.treeSpacing<1)throw Error('无效林地配置');
 if(!Number.isInteger(cfg.groundBuffer)||cfg.groundBuffer<0)throw Error('无效植被地面间距');
 const active=m.active.reduce((n,v)=>n+!!v,0),distance=new Int16Array(m.tiles.length).fill(32767),queue=[];
 for(let k=0;k<m.tiles.length;k++)if(m.active[k]&&[1,2,4].includes(m.tiles[k])){distance[k]=0;queue.push(k);}
 for(let i=0;i<queue.length;i++)for(const n of neighbours(m,queue[i]))if(distance[n]>distance[queue[i]]+1){distance[n]=distance[queue[i]]+1;queue.push(n);}
 const candidates=m.tiles.flatMap((t,k)=>m.active[k]&&(t===0||t===3)?[k]:[]);
 const ratio=Math.max(0,Math.min(1,cfg.targetForestRatio+(hash(m.seed+'-forest-ratio',0,0)*2-1)*cfg.ratioVariation)),target=Math.min(candidates.length,Math.round(active*ratio));
 const score=k=>noise(m.seed+'-woodland',k%m.width,Math.floor(k/m.width),cfg.patchScale)*4+Math.min(8,distance[k])*.28;
 candidates.sort((a,b)=>score(b)-score(a)||a-b);
 const forest=new Uint8Array(m.tiles.length);for(const k of candidates.slice(0,target))forest[k]=1;
 // Preserve existing POI access and circulation. The network also supplies dirt paths.
 const closed=R.closedPassages(m),baseline=R.flood(closed,m.width,m.height,m.entry),reserved=new Set(),paths=new Set(m.path);
 const addBuffer=(k,r,set=reserved)=>{const x=k%m.width,y=Math.floor(k/m.width);for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const a=x+dx,b=y+dy;if(a>=0&&b>=0&&a<m.width&&b<m.height)set.add(b*m.width+a);}};
 const routeTo=k=>{if(baseline.dist[k]<0)return;for(let n=k;n>=0;n=baseline.prev[n]){paths.add(n);if(n===m.entry)break;}};
 addBuffer(m.entry,3);addBuffer(m.exit,3);routeTo(m.exit);
 for(const room of m.rooms){addBuffer(room.door,cfg.doorBuffer);for(const n of neighbours(m,room.door))if(m.owner[n]!==room.id)routeTo(n);}
 for(const p of [...m.resources,...m.lootPoints,...m.recoveryPoints,...(m.insightPoints||[])]){addBuffer(p.cell,1);for(const n of p.access||neighbours(m,p.cell)){reserved.add(n);routeTo(n);}}
 for(const e of m.enemies){addBuffer(e.cell,1);for(const n of e.patrolCells||[])reserved.add(n);}
 for(const k of paths)addBuffer(k,cfg.pathBuffer);
 m.woodland={version:1,config:cfg,forest:Array.from(forest),paths:Array.from(paths),ground:Array(m.tiles.length).fill(null),stats:{active,targetRatio:ratio,forestCells:target,forestRatio:target/active,trees:0}};
 // Resolve the actual visible ground before choosing vegetation positions.
 // Resource courtyards expose soil; their stone thresholds remain intact.
 const livingRooms=new Map(m.rooms.filter(r=>r.resourceType==='wood'||r.resourceType==='gather').map(r=>[r.id,r]));
 const thresholds=new Set(m.rooms.map(r=>r.door));
 for(let k=0;k<m.tiles.length;k++){
  if(!m.active[k])continue;
  const t=m.tiles[k],x=k%m.width,y=Math.floor(k/m.width),g=m.woodland.ground,room=livingRooms.get(m.owner[k]);
  if(t===2&&room&&!thresholds.has(k)){g[k]=room.resourceType==='wood'?'litter':'moss';continue;}
  if(t===1||t===2||t===4){g[k]='floor';continue;}
  if(forest[k])g[k]=paths.has(k)?'earth':noise(m.seed+'-litter',x,y,7)>.57?'litter':'moss';
  else g[k]=paths.has(k)?(distance[k]<=1?'road':'earth'):t===3?'cap':m.road[k]&&noise(m.seed+'-paving',x,y,9)>.38?'road':'earth';
 }
 const naturalGround=new Set(['moss','litter','earth']);
 const rootsFit=k=>{
  const x=k%m.width,y=Math.floor(k/m.width);
  for(let dy=-cfg.groundBuffer;dy<=cfg.groundBuffer;dy++)for(let dx=-cfg.groundBuffer;dx<=cfg.groundBuffer;dx++){
   const nx=x+dx,ny=y+dy,n=ny*m.width+nx;
   if(nx<0||ny<0||nx>=m.width||ny>=m.height||!m.active[n]||!naturalGround.has(m.woodland.ground[n]))return false;
  }return true;
 };
 m.sceneryBlocked=new Set();m.trees=[];
 const treeCandidates=candidates.filter(k=>forest[k]&&['moss','litter'].includes(m.woodland.ground[k])&&rootsFit(k)&&!reserved.has(k)&&distance[k]>=cfg.wallBuffer&&R.walkable(closed[k])&&baseline.dist[k]>=0);
 treeCandidates.sort((a,b)=>hash(m.seed+'-tree',a,0)-hash(m.seed+'-tree',b,0));
 const desired=Math.round(target*cfg.treeDensity);
 for(const k of treeCandidates){
  if(m.trees.length>=desired)break;
  const x=k%m.width,y=Math.floor(k/m.width);
  if(m.trees.some(t=>Math.hypot(x-t.x,y-t.y)<cfg.treeSpacing))continue;
  const old=closed[k];closed[k]=6;
  // Reject any trunk that disconnects even one previously reachable outdoor cell.
  if(R.flood(closed,m.width,m.height,m.entry).reached!==baseline.reached-m.trees.length-1){closed[k]=old;continue;}
  const n=hash(m.seed+'-tree-art',k,0);
  m.trees.push({cell:k,x,y,size:.87+n*.28,woodland:true,kind:n<.45?'scrub':n<.75?'tangle':'crooked'});
  m.sceneryBlocked.add(k);m.collision[k]=6;if(m.patrolTiles)m.patrolTiles[k]=6;
 }
 m.woodland.stats.trees=m.trees.length;
 // Corner weights soften natural-ground transitions instead of checkerboard edges.
 m.woodland.blend=m.tiles.map((_,k)=>{
  if(!['moss','litter','earth'].includes(m.woodland.ground[k]))return null;
  const x=k%m.width,y=Math.floor(k/m.width);
  return [[0,0],[1,0],[1,1],[0,1]].map(([cx,cy])=>{
   let value=0;
   for(const dx of [-1,0])for(const dy of [-1,0]){const nx=x+cx+dx,ny=y+cy+dy;
    if(nx>=0&&ny>=0&&nx<m.width&&ny<m.height&&['moss','litter'].includes(m.woodland.ground[ny*m.width+nx]))value+=.25;
   }return value;
  });
 });
 m.woodland.stats.stoneCells=m.woodland.ground.filter(g=>g==='road'||g==='cap').length;
 m.path=R.route(closed,m.width,m.height,m.entry,m.exit);
 if(!m.path.length)throw Error('林地阻断撤离通路');
 return m;
}
// Older prototype saves keep their rewards. If a new trunk occupies an old actor
// position, relocate only that actor to the closest clear reachable neighbour.
function restorePositions(s){
 const blocked=s.map.sceneryBlocked;if(!blocked?.size)return;
 for(const actor of [s.player,...s.enemies]){
  if(!blocked.has(actor.cell))continue;
  const tiles=RuinsEncounter.collision(s,actor,true);tiles[actor.cell]=0;
  const flow=R.flood(tiles,s.map.width,s.map.height,actor.cell);
  const choices=tiles.flatMap((t,k)=>k!==actor.cell&&R.walkable(t)&&flow.dist[k]>0?[k]:[]).sort((a,b)=>flow.dist[a]-flow.dist[b]||a-b);
  if(choices.length)actor.cell=choices[0];
 }
}
globalThis.RuinsWoodland={config,populate,restorePositions,noise};
})();
