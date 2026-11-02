/* Fixed optional fourth-floor encounter. Independent enemies in new runs;
 * preserve the legacy donor budget only for runs without population config. */
(()=>{'use strict';
 const R=RuinsSettlement;
 function appearance(seed,floor,config){
  const chance=config?.spawnChance??1;
  if(!Number.isFinite(chance)||chance<0||chance>1)throw Error('头目出现率必须为0～1');
  const roll=R.hash(seed+'|boss-appearance|'+floor+'|'+config?.enemyId)/4294967296;
  return{chance,roll,present:floor===config?.floor&&roll<chance};
 }
 function place(map,config,{seed=map.seed}={}){
  if(map.floor!==config?.floor||map.bossRoom?.templateId)return map;
  const spawn=appearance(seed,map.floor,config);
  const w=map.width,h=map.height,base=map.collision||map.tiles;
  const donors=map.enemies.filter(e=>!e.boss).sort((a,b)=>Number(!!a.roaming)-Number(!!b.roaming)||Number(!!map.rooms.find(r=>r.id===a.roomId)?.outpostType)-Number(!!map.rooms.find(r=>r.id===b.roomId)?.outpostType)||R.hash(map.seed+'boss-donor'+a.uid)-R.hash(map.seed+'boss-donor'+b.uid));
  const loot=map.lootPoints.filter(p=>p.roomId===undefined&&!p.foodCrate).sort((a,b)=>Number(!!b.reservedForBoss)-Number(!!a.reservedForBoss)).slice(0,2);
  if(spawn.present&&!map.populationConfig&&!donors.length||loot.length!==2)throw Error('第四层头目小屋缺少可调配的敌人与容器额度');
  const protectedCells=new Set([map.entry,map.exit,...map.doors,...map.enemies.map(p=>p.cell),...map.resources.map(p=>p.cell),...map.lootPoints.map(p=>p.cell),...map.recoveryPoints.map(p=>p.cell),...map.insightPoints.map(p=>p.cell),...(map.sceneryBlocked||[]),...(map.decorBlocked||[]),...(map.trees||[]).map(p=>p.cell??Math.floor(p.y)*w+Math.floor(p.x))]);
  const outside=R.flood(R.closedPassages(map),w,h,map.entry),candidates=[];
  // A 7x10 shell plus a one-cell apron fits the exact 5x8 approved interior.
  // Only use unowned vacant parcels; preserve all buildings, POIs and roads.
  for(let y=1;y<h-12;y++)for(let x=1;x<w-9;x++){
   let ok=true,connected=false;
   for(let j=0;j<12&&ok;j++)for(let i=0;i<9;i++){
    const k=(y+j)*w+x+i,body=i>=1&&i<=7&&j>=1&&j<=10;
    if(map.owner[k]>=0||protectedCells.has(k)||![0,3,R.VOID].includes(map.tiles[k])||body&&map.road[k]){ok=false;break;}
    if(!body&&outside.dist[k]>=0)connected=true;
   }
   if(ok&&connected)candidates.push({x,y,rank:R.hash(map.seed+'-fixed-den-'+x+','+y)});
  }
  candidates.sort((a,b)=>a.rank-b.rank);
  const roomId=Math.max(0,...map.buildings.map(r=>r.id))+1;
  for(const pos of candidates){
   const draft={...map,tiles:map.tiles.slice(),owner:map.owner.slice(),road:map.road.slice()};
   for(let y=pos.y;y<pos.y+12;y++)for(let x=pos.x;x<pos.x+9;x++)draft.tiles[y*w+x]=0;
   const prefab=DungeonBossRoomTemplate.stamp(draft,[pos.x+1,pos.y+1],roomId,config.enemyId);
   prefab.meta.bossSpawn=spawn;
   if(!spawn.present){prefab.room.enemies=[];prefab.room.enemyCount=0;}
   DungeonBossRewards.attach(prefab.enemy,config.loot?.corpse);
   for(const point of prefab.points)DungeonBossRewards.attach(point,config.loot?.containers?.[point.assetId]);
   const collision=base.slice();
   for(let y=pos.y;y<pos.y+12;y++)for(let x=pos.x;x<pos.x+9;x++)collision[y*w+x]=draft.tiles[y*w+x];
   for(const p of prefab.decor)if(p.solid)for(const k of p.footprint)collision[k]=6;
   for(const p of prefab.points)collision[p.cell]=6;
   if(spawn.present)collision[prefab.enemy.cell]=7;
   // Releasing transferred points can only improve access, and never adds loot.
   for(const p of [...loot,...(spawn.present&&!map.populationConfig?[donors[0]]:[])])collision[p.cell]=draft.tiles[p.cell];
   const open=R.flood(collision,w,h,map.entry,false);
   if(open.reached!==collision.filter(R.walkable).length)continue;
   const closed=collision.slice();for(const k of [...map.doors,prefab.room.door])closed[k]=1;
   const bypass=R.route(closed,w,h,map.entry,map.exit),flow=R.flood(closed,w,h,map.entry);
   if(!bypass.length||flow.dist[prefab.room.door+w]<0)continue;
   const shell=new Set(prefab.room.cells);
   if(base.some((_,k)=>outside.dist[k]>=0&&!shell.has(k)&&flow.dist[k]<0))continue;
   map.tiles=draft.tiles;map.owner=draft.owner;map.road=draft.road;map.collision=collision;
   if(spawn.present){
    const donor=map.populationConfig?null:donors[0],oldRoom=donor&&map.rooms.find(r=>r.id===donor.roomId);
    if(oldRoom){oldRoom.enemies=oldRoom.enemies.filter(e=>e.uid!==donor.uid);oldRoom.enemyCount=oldRoom.enemies.length;}
    if(donor?.roaming)map.wanderers=map.wanderers.filter(e=>e.uid!==donor.uid);
    if(donor)map.enemies=map.enemies.filter(e=>e.uid!==donor.uid);map.enemies.push(prefab.enemy);
   }
   for(let i=0;i<2;i++){
    const previous=loot[i],p=prefab.points[i];p.uid=previous.uid;p.index=previous.index;
    const cfg=map.contentConfig.containers;
    if(cfg?.enabled)p.contentWeights=RuinsContainerProfiles.weights(p.containerUse,'residential',cfg);
    map.lootPoints[map.lootPoints.indexOf(previous)]=p;
   }
   map.rooms.push(prefab.room);map.buildings.push(prefab.room);map.doors.push(prefab.room.door);
   map.enemyRooms=map.rooms.filter(r=>r.enemyCount);(map.outposts??=[]).push(prefab.room);
   map.outpostDecor??=[];map.decorBlocked??=new Set();map.workshopOpaque??=new Set();map.outpostFloor??=new Map();
   for(const p of prefab.decor){map.outpostDecor.push(p);if(p.solid)for(const k of p.footprint)map.decorBlocked.add(k);if(p.opaque)for(const k of p.footprint)map.workshopOpaque.add(k);}
   for(const k of prefab.room.inner)map.outpostFloor.set(k,{kind:'concrete',span:4});
   for(const p of prefab.points)p.access=RuinsResources.neighbours(p.cell,map).filter(k=>open.dist[k]>=0);
   for(const r of map.rooms)r.isEmpty=!(r.enemyCount||r.nodes?.length||r.lootPoints?.length||r.recoveryPoints?.length||r.insightPoints?.length);
   map.emptyRooms=map.rooms.filter(r=>r.isEmpty);
   map.bossRoom=prefab.meta;
   map.boss=spawn.present?{uid:prefab.enemy.uid,roomId,enemyId:config.enemyId,optional:true,bypass,templateId:prefab.meta.templateId,templateVersion:prefab.meta.version}:null;map.path=bypass;
   if(map.active)for(let y=pos.y;y<pos.y+12;y++)for(let x=pos.x;x<pos.x+9;x++)map.active[y*w+x]=1;
   map.voidCells=map.tiles.filter(t=>t===R.VOID).length;map.walkable=collision.filter(R.walkable).length;map.reached=open.reached;
   map.containerDistribution=Object.fromEntries(Object.keys(RuinsContainerProfiles.groups).map(k=>[k,map.lootPoints.filter(p=>p.containerCategory===k).length]));
   map.mixedSignature+=':fixed-den-v6:'+pos.x+','+pos.y;
   return map;
  }
  throw Error('第四层未找到能放下固定头目小屋且保持绕行的位置');
 }
 globalThis.DungeonBoss={place,appearance};
})();
