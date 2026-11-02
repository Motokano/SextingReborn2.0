/* V14: distribute existing rewards into room areas; leave sparse street finds. */
(()=>{'use strict';
const R=RuinsSettlement,RS=RuinsResources;
const dist=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
const rank=(m,key,id)=>R.hash(m.seed+'-poi-'+m.floor+'-'+key+'-'+id)/4294967296;
const points=m=>[...m.resources,...m.lootPoints,...m.recoveryPoints,...(m.insightPoints||[])];
function nearRoom(m,k){
 let closest=null,distance=Infinity;
 for(const room of m.rooms)for(const n of room.cells){const d=dist(k,n,m.width);if(d<distance){distance=d;closest=room;}}
 return{room:closest,distance};
}
function attempt(m,cell,minAccess=2){
 if(!R.walkable(m.collision[cell]))return null;
 const before=m.collision[cell],count=m.collision.filter(R.walkable).length;
 m.collision[cell]=6;const flow=R.flood(m.collision,m.width,m.height,m.entry),access=RS.neighbours(cell,m).filter(k=>flow.dist[k]>=0);
 if(flow.reached!==count-1||access.length<minAccess||points(m).some(p=>p.cell!==cell&&!RS.neighbours(p.cell,m).some(k=>flow.dist[k]>=0))){m.collision[cell]=before;return null;}
 return access;
}
function indoor(m,kind){
 const cfg=m.contentConfig.poi,all=points(m),occupied=all.map(p=>p.cell);
 const rooms=m.rooms.filter(r=>!r.templateId&&!r.reservedEmpty&&r.largeRoomState!=='abandoned'&&(kind==='loot'?(r.lootPoints?.length||0)<cfg.maxRoomContainers:!r.recoveryPoints?.length));
 const score=r=>(r.lootPoints?.length||0)*12+Number(!!r.nodes?.length)*18+Number(!!r.enemyCount)*5+Math.abs(r.inner.length-22)*.1+rank(m,kind+'-room',r.id);
 rooms.sort((a,b)=>score(a)-score(b));
 for(const room of rooms){
  const candidates=room.inner.filter(k=>R.walkable(m.collision[k])&&dist(k,room.door,m.width)>=2&&occupied.every(n=>dist(n,k,m.width)>=2));
  candidates.sort((a,b)=>Number(RS.neighbours(b,m).some(k=>m.tiles[k]===1))-Number(RS.neighbours(a,m).some(k=>m.tiles[k]===1))||rank(m,kind+'-cell',a)-rank(m,kind+'-cell',b));
  for(const cell of candidates){
   if(room.inner.filter(k=>R.walkable(m.collision[k])).length-1<room.inner.length*.6)break;
   const access=attempt(m,cell);if(access)return{room,cell,access};
  }
 }
 return null;
}
function settle(m){
 const f=R.flood(m.collision,m.width,m.height,m.entry);
 if(f.reached!==m.collision.filter(R.walkable).length)throw Error('兴趣点编排阻断通路');
 for(const p of points(m)){p.access=RS.neighbours(p.cell,m).filter(k=>f.dist[k]>=0);if(!p.access.length)throw Error('兴趣点缺少操作格');}
 m.path=R.route(R.closedPassages(m),m.width,m.height,m.entry,m.exit);
 if(!m.path.length)throw Error('兴趣点阻断撤离路线');
}
function containers(m){
 const cfg=m.contentConfig.poi,free=m.lootPoints.filter(p=>p.roomId===undefined),reserve=m.floor===4?2:0;
 if(free.length<reserve)throw Error('缺少头目房容器预留');
 const boss=free.slice(0,reserve);for(const p of boss)p.reservedForBoss=true;
 const remaining=free.slice(reserve),target=Math.min(remaining.length,cfg.outdoorContainersMin+Math.floor(rank(m,'outdoor-count',0)*(cfg.outdoorContainersMax-cfg.outdoorContainersMin+1)));
 const road=p=>m.road[p.cell]||RS.neighbours(p.cell,m).some(k=>m.road[k]);
 remaining.sort((a,b)=>Number(road(b))-Number(road(a))||rank(m,'street',a.uid)-rank(m,'street',b.uid));
 const street=new Set(remaining.slice(0,target));let moved=0;
 for(const p of remaining){
  if(street.has(p)){p.outdoor=true;continue;}
  const old=p.cell;m.collision[old]=m.tiles[old];const slot=indoor(m,'loot');
  if(!slot){m.collision[old]=6;throw Error('房内没有足够的容器位置');}
  p.cell=slot.cell;p.roomId=slot.room.id;p.outdoor=false;p.access=slot.access;(slot.room.lootPoints??=[]).push(p);moved++;
 }
 m.poiBudget={containers:m.lootPoints.length,outdoorContainers:target,bossReserved:reserve,movedIndoors:moved};settle(m);
 m.mixedSignature+=':room-poi-v1:'+R.hash(JSON.stringify(m.lootPoints.map(p=>[p.uid,p.roomId,p.cell])));
 return m;
}
function recovery(m,legacy){
 const cfg=m.contentConfig.poi,closed=R.closedPassages(m),initial=R.flood(closed,m.width,m.height,m.entry);
 const roads=closed.reduce((n,t,k)=>n+Number(R.walkable(t)&&m.road[k]&&initial.dist[k]>=0),0),target=roads>=legacy.largeRoadCells?legacy.largeTotal:legacy.smallTotal;
 m.recoveryBudget={target,roadCells:roads,indoor:m.recoveryPoints.length,outdoor:0};m.mixedBudget.recoveryMax=target;
 const outsideRequested=cfg.maxOutdoorRecovery&&rank(m,'recovery-outside',0)<cfg.outdoorRecoveryChance;
 const types=RuinsMixed.recoveryCatalog.filter(p=>['water','stove','medical','rest'].includes(p.id));
 function exterior(){
  if(m.recoveryBudget.outdoor>=cfg.maxOutdoorRecovery)return false;
  const all=points(m),candidates=[];
  for(let k=0;k<closed.length;k++){
   if(m.owner[k]>=0||![0,3].includes(m.collision[k])||initial.dist[k]<legacy.entryBuffer||dist(k,m.exit,m.width)<legacy.exitBuffer||m.doors.some(d=>dist(k,d,m.width)<=legacy.doorBuffer)||all.some(p=>dist(k,p.cell,m.width)<legacy.propBuffer))continue;
   const nearby=nearRoom(m,k);if(nearby.distance<=cfg.nearRoomDistance)candidates.push({k,...nearby});
  }
  candidates.sort((a,b)=>a.distance-b.distance||rank(m,'recovery-edge',a.k)-rank(m,'recovery-edge',b.k));
  for(const candidate of candidates){
   const cell=candidate.k,access=attempt(m,cell);if(!access)continue;
   const type=RuinsMixed.recoveryCatalog.find(p=>p.id==='kettle'),p={...type,uid:'recovery-edge-'+cell,cell,access,roomId:null,nearRoomId:candidate.room.id,outdoor:true,used:false};
   m.recoveryPoints.push(p);m.recoveryBudget.outdoor++;return true;
  }return false;
 }
 while(m.recoveryPoints.length<target){
  if(outsideRequested&&m.recoveryPoints.length===target-1&&exterior())break;
  const slot=indoor(m,'recovery');
  if(!slot){exterior();break;}
  const available=types.filter(p=>!m.recoveryPoints.some(q=>q.id===p.id)),pool=available.length?available:types;
  const type=pool[Math.floor(rank(m,'recovery-kind',slot.room.id)*pool.length)],p={...type,uid:'recovery-room-'+slot.room.id,roomId:slot.room.id,cell:slot.cell,access:slot.access,outdoor:false,used:false};
  m.recoveryPoints.push(p);(slot.room.recoveryPoints??=[]).push(p);m.recoveryBudget.indoor++;
 }
 settle(m);m.recoveryBudget.actual=m.recoveryPoints.length;
 m.mixedSignature+=':room-recovery-v1:'+R.hash(JSON.stringify(m.recoveryPoints.map(p=>[p.uid,p.id,p.cell])));return m;
}
globalThis.RuinsPOIPlacement={containers,recovery,nearRoom};
})();
