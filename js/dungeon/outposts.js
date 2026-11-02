/* SPDX-License-Identifier: GPL-3.0-only
 * Fit bandit outposts to existing buildings. Commit only complete, reachable
 * layouts; enemies and containers are reallocated from the floor's own pool.
 */
(()=>{'use strict';
const R=RuinsSettlement,RS=RuinsResources;
const names={loot:'藏货据点',recovery:'歇脚据点',workshop:'废弃修理车间',clinic:'废弃诊疗所',canteen:'废弃食堂'};
const compactLoot=new Set(['abandoned-chest-v1','lost-backpack-v1','discarded-toolbox-v1','reused-fridge-v1','reused-plastic-drum-v1','patched-suitcase-v1','repaired-cooler-v1','computer-tower-cabinet-v1','postbox-cache-v1','factory-locker-cache-v1','wire-cage-trolley-v1','stacked-plastic-crates-v1','milk-churn-storage-v1','motorcycle-topbox-cache-v1','aluminum-flight-case-v1']);
const distance=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
const jitter=(m,key,k)=>R.hash(m.seed+'-outpost-'+m.floor+'-'+key+'-'+k)/4294967296;
function layout(map,room,count,pointCount,cfg){
 const w=map.width,inside=new Set(room.inner),orth=k=>RS.neighbours(k,map);
 const landings=orth(room.door).filter(k=>inside.has(k));
 if(!landings.length||room.inner.length-count-pointCount<Math.ceil(room.inner.length*cfg.freeRatio))return null;
 const local=map.tiles.map(()=>5);for(const k of room.inner)local[k]=2;local[room.door]=4;
 const original=landings.map(k=>R.flood(local,w,map.height,k));
 const entryDepth=k=>Math.min(...original.map(f=>f.dist[k]));
 if(room.inner.some(k=>entryDepth(k)<0))return null;
 const far=Math.max(...room.inner.map(entryDepth));
 const dx=room.center%w-room.door%w,dy=Math.floor(room.center/w)-Math.floor(room.door/w),length=Math.hypot(dx,dy)||1;
 const side=k=>((k%w-room.door%w)*dy-(Math.floor(k/w)-Math.floor(room.door/w))*dx)/length;
 // Put the function zone against a side/rear wall. No freestanding clutter or
 // additional walls are inserted merely to force a composition into a room.
 const points=room.inner.filter(k=>entryDepth(k)>=Math.max(cfg.entrySteps,Math.floor(far*.5))&&distance(k,room.door,w)>=cfg.pointDoorBuffer&&orth(k).some(n=>map.tiles[n]===1))
  .sort((a,b)=>entryDepth(b)-entryDepth(a)||jitter(map,'point',b)-jitter(map,'point',a));
 let tries=0,answer=null;
 function evaluate(fixed){
  const terrain=local.slice();for(const k of fixed)terrain[k]=6;
  const flows=landings.map(k=>R.flood(terrain,w,map.height,k)),depth=k=>Math.min(...flows.map(f=>f.dist[k]));
  if(room.inner.some(k=>!fixed.includes(k)&&depth(k)<0))return;
  const candidates=room.inner.filter(k=>!fixed.includes(k)&&depth(k)>=cfg.entrySteps);
  const rear=Math.min(far-1,cfg.entrySteps+cfg.maxEnemySpacing-1),goals=Array.from({length:count},(_,i)=>cfg.entrySteps+(rear-cfg.entrySteps)*i/Math.max(1,count-1));
  function check(cells){
   const depths=cells.map(depth),sides=cells.map(side);
   if(Math.max(...depths)-Math.min(...depths)<1||Math.max(...sides)-Math.min(...sides)<1.5)return false;
   const blocked=new Set([...fixed,...cells]),seen=new Set(),q=[];
   if(landings.some(k=>blocked.has(k)))return false;
   // Stronger than eight-way reachability: the entire free floor is joined by
   // cardinal steps, so no diagonal wall-corner squeeze is needed anywhere.
   seen.add(landings[0]);q.push(landings[0]);
   for(let i=0;i<q.length;i++)for(const n of orth(q[i]))if(inside.has(n)&&!blocked.has(n)&&!seen.has(n)){seen.add(n);q.push(n);}
   return seen.size===room.inner.length-blocked.size&&landings.every(k=>seen.has(k))&&fixed.every(k=>orth(k).filter(n=>seen.has(n)).length>=cfg.pointAccess)&&cells.every(k=>orth(k).some(n=>seen.has(n)));
  }
  function search(chosen){
   if(answer||tries>=cfg.layoutAttempts)return;
   if(chosen.length===count){tries++;if(check(chosen))answer={cells:chosen.slice(),points:fixed.slice(),landings,depths:chosen.map(depth)};return;}
   const slot=chosen.length;
   const rank=k=>Math.abs(depth(k)-goals[slot])*2+Math.abs(side(k)-(slot%2?1.5:-1.5))*.3+(slot===count-1?Math.min(...fixed.map(p=>distance(k,p,w)))*.3:0)+jitter(map,'enemy-'+slot,k)*.3;
   const ranked=candidates.filter(k=>!chosen.includes(k)&&chosen.every(a=>distance(a,k,w)>=cfg.minEnemySpacing&&distance(a,k,w)<=cfg.maxEnemySpacing)).sort((a,b)=>rank(a)-rank(b)||a-b).slice(0,14);
   for(const k of ranked){tries++;if(tries>=cfg.layoutAttempts)return;search([...chosen,k]);if(answer)return;}
  }
  search([]);
 }
 // Try multiple compact POI clusters, rather than committing an attractive but
 // inaccessible corner. The attempt cap also bounds pathological thin rooms.
 function choose(chosen,start){
  if(answer||tries>=cfg.layoutAttempts)return;
  if(chosen.length===pointCount){tries++;evaluate(chosen);return;}
  for(let i=start;i<points.length;i++){
   const k=points[i];if(chosen.some(a=>distance(a,k,w)<cfg.pointSpacing||distance(a,k,w)>cfg.pointClusterRadius))continue;
   choose([...chosen,k],i+1);if(answer||tries>=cfg.layoutAttempts)return;
  }
 }
 choose([],0);return answer;
}
function populate(map,catalog,recoveryId){
 map.outposts=[];map.workshopBlocked=new Set();map.workshopOpaque=new Set();map.workshopWalls=new Set();map.workshopObstacles=[];
 map.clinicBlocked=new Set();map.clinicOpaque=new Set();map.clinicWalls=new Set();map.clinicObstacles=[];
 map.canteenBlocked=new Set();map.canteenOpaque=new Set();map.canteenWalls=new Set();map.canteenObstacles=[];
 const cfg=map.contentConfig?.outposts;
 if(!cfg?.enabled)return map;
 if(map.contentConfig.version>=13&&map.contentConfig.largeRooms.enabled)return RuinsLargeRooms.populate(map,catalog,recoveryId);
 const target=cfg.minCount+R.hash(map.seed+'-outpost-count-'+map.floor)%(cfg.maxCount-cfg.minCount+1);
 map.outpostBudget={target,enemies:map.enemies.length,containers:map.lootPoints.length};
 const rooms=map.rooms.filter(r=>!r.reservedEmpty&&!r.enemyCount&&!r.nodes?.length&&!r.mixedType&&r.inner.length>=cfg.minArea&&r.inner.length<=cfg.maxArea)
  .sort((a,b)=>Math.abs(a.inner.length-cfg.targetArea)-Math.abs(b.inner.length-cfg.targetArea)||jitter(map,'room',a.id)-jitter(map,'room',b.id));
 const foodContainers=map.contentConfig.version>=12;
 if(map.contentConfig.canteen?.enabled&&(foodContainers||globalThis.RuinsCanteen?.foodDonor(map))){const f=map.contentConfig.canteen,eligible=r=>r.inner.length>=f.minArea&&r.inner.length<=f.maxArea&&jitter(map,'canteen',r.id)<f.chance;rooms.sort((a,b)=>Number(eligible(b))-Number(eligible(a)));}
 for(const room of rooms){
  if(map.outposts.length>=target)break;
  const donors=map.enemyRooms.filter(r=>!r.outpostType),available=donors.reduce((n,r)=>n+r.enemyCount,0)-cfg.reserveEnemies;
  if(available<cfg.minRestEnemies)break;
  const preferred=jitter(map,'kind',room.id)<cfg.restChance?'recovery':'loot',wc=map.contentConfig.workshop,cc=map.contentConfig.clinic,fc=map.contentConfig.canteen;
  const donor=globalThis.RuinsCanteen?.foodDonor(map),canteen=fc?.enabled&&(foodContainers||donor)&&map.outposts.filter(r=>r.canteen).length<fc.maxPerFloor&&room.inner.length>=fc.minArea&&room.inner.length<=fc.maxArea&&jitter(map,'canteen',room.id)<fc.chance;
  const clinic=cc?.enabled&&!map.recoveryPoints.length&&map.outposts.filter(r=>r.clinic).length<cc.maxPerFloor&&room.inner.length>=cc.minArea&&room.inner.length<=cc.maxArea&&jitter(map,'clinic',room.id)<cc.chance;
  const workshop=wc?.enabled&&map.outposts.filter(r=>r.outpostType==='workshop').length<wc.maxPerFloor&&room.inner.length>=wc.minArea&&room.inner.length<=wc.maxArea&&jitter(map,'workshop',room.id)<wc.chance;
  for(const type of [...(canteen?['canteen']:[]),...(clinic?['clinic']:[]),...(workshop?['workshop']:[]),preferred,preferred==='loot'?'recovery':'loot']){
   if(type==='recovery'&&map.recoveryPoints.length)continue;
   const hasLoot=type!=='recovery';
   const recoveryTypes=catalog.filter(p=>['water','stove','medical','rest'].includes(p.id));
   const items=hasLoot?map.lootPoints.filter(p=>!p.roomId&&compactLoot.has(p.assetId)):[recoveryTypes.find(p=>p.id===recoveryId)||recoveryTypes[R.hash(map.seed+'-outpost-recovery-'+map.floor+'-'+room.id)%recoveryTypes.length]];
   if(type==='canteen'){const preferred=['reused-fridge-v1','stacked-plastic-crates-v1','repaired-cooler-v1','milk-churn-storage-v1'];const rank=p=>{const i=preferred.indexOf(p.assetId);return i<0?100:i;};items.sort((a,b)=>rank(a)-rank(b));}
   const minPoints=type==='canteen'?fc.minLoot:type==='clinic'?1:type==='workshop'?wc.lootPoints:hasLoot?cfg.lootPoints:1,maxPoints=type==='canteen'?fc.maxLoot:type==='clinic'?1:type==='workshop'?wc.lootPoints:hasLoot?(room.inner.length>=cfg.largeArea?cfg.largeLootPoints:cfg.lootPoints):1;
   const minEnemies=type==='canteen'?fc.minEnemies:type==='clinic'?cc.minEnemies:type==='workshop'?wc.minEnemies:hasLoot?cfg.lootEnemies:cfg.minRestEnemies,maxEnemies=type==='canteen'?(room.inner.length>=fc.largeArea?fc.maxEnemies:fc.minEnemies):type==='clinic'?(room.inner.length>=cc.largeArea?cc.maxEnemies:cc.minEnemies):type==='workshop'?(room.inner.length>=wc.largeArea?wc.maxEnemies:wc.minEnemies):hasLoot?(room.inner.length>=cfg.largeArea?cfg.largeEnemies:cfg.lootEnemies):cfg.restEnemies;
   const foodSlots=type==='canteen'&&foodContainers?fc.foodPoints:0,freeLoot=map.lootPoints.filter(p=>p.roomId===undefined);
   let placement=null,count=0,n=0;
   for(count=Math.min(maxEnemies,available);count>=minEnemies&&!placement;count--)
    for(n=Math.min(maxPoints,items.length,foodSlots?freeLoot.length-foodSlots:Infinity);n>=minPoints;n--){placement=type==='canteen'?globalThis.RuinsCanteen?.layout(map,room,count,n,fc):type==='clinic'?globalThis.RuinsClinic?.layout(map,room,count,cc):type==='workshop'?globalThis.RuinsWorkshop?.layout(map,room,count,wc):layout(map,room,count,n,cfg);if(placement)break;}
   if(!placement)continue;
   count=placement.cells.length;
   // Commit atomically after every occupied cell and operating cell fits.
   // Leave singles behind where possible, then consume the remaining pool.
   const transferred=[];
   while(transferred.length<count){
    const donor=donors.filter(r=>r.enemies?.length).sort((a,b)=>b.enemies.length-a.enemies.length||a.id-b.id)[0];
    transferred.push(donor.enemies.pop());donor.enemyCount=donor.enemies.length;
   }
   const removed=new Set(transferred.map(e=>e.uid));map.enemies=map.enemies.filter(e=>!removed.has(e.uid));
   map.enemyRooms=map.enemyRooms.filter(r=>r.enemyCount);
   for(const donor of donors)if(!donor.enemyCount){delete donor.enemies;delete donor.enemyCount;delete donor.landings;}
   room.outpostType=type;room.mixedType=hasLoot?'loot':'recovery';room.enemyCount=count;room.landings=placement.landings;
   if(placement.workshop)RuinsWorkshop.commit(map,room,placement.workshop);
   if(placement.clinic)RuinsClinic.commit(map,room,placement.clinic);
   if(placement.canteen)RuinsCanteen.commit(map,room,placement.canteen,donor);
   room.enemies=placement.cells.map((cell,i)=>({uid:'outpost-'+room.id+'-'+(i+1),roomId:room.id,cell,number:i+1,name:'土匪',entrySteps:placement.depths[i]}));
   map.enemies.push(...room.enemies);map.enemyRooms.push(room);
   if(hasLoot){
    room.lootPoints=items.slice(0,type==='clinic'?1:placement.points.length);
    room.lootPoints.forEach((p,i)=>{p.cell=placement.points[i];p.roomId=room.id;if(type==='canteen')p.lootTheme='household-preview';});
    if(foodSlots)RuinsCanteen.addContainers(map,room,freeLoot.filter(p=>!room.lootPoints.includes(p)).slice(0,foodSlots));
   }else{
    const point={...items[0],uid:'recovery-'+room.id,roomId:room.id,cell:placement.points[0],used:false};
    room.recoveryPoints=[point];map.recoveryPoints.push(point);
   }
   if(type==='clinic'){
    const point={...recoveryTypes.find(p=>p.id==='medical'),uid:'recovery-'+room.id,roomId:room.id,cell:placement.points[1],used:false};
    room.recoveryPoints=[point];map.recoveryPoints.push(point);
   }
   map.outposts.push(room);map.mixedRooms.push(room);break;
  }
 }
 return map;
}
globalThis.RuinsOutposts={names,layout,populate};
})();
