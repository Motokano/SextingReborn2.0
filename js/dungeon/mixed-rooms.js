/* SPDX-License-Identifier: GPL-3.0-only
 * Compose existing encounter allocations; never add enemies/resources/containers.
 * Indoor recovery allocation <= 1; the shared floor budget is completed by recovery-placement.js.
 */
(()=>{'use strict';
const R=RuinsSettlement,ER=RuinsEnemies,RS=RuinsResources,L=RuinsLoot;
const profiles={recovery:{name:'恢复',min:18,max:32,target:24,maxEnemies:2,maxPoints:1},gather:{name:'采集',min:20,max:36,target:28,maxEnemies:2,maxPoints:3},mine:{name:'采矿',min:18,max:32,target:24,maxEnemies:2,maxPoints:2},wood:{name:'伐木',min:24,max:36,target:30,maxEnemies:2,maxPoints:2},loot:{name:'容器',min:18,max:48,target:36,maxEnemies:3,maxPoints:2}};
const recoveryCatalog=[['water','旧净水桶','old-water-filter',1],['stove','铁桶小灶','barrel-cooking-stove',1],['medical','急救推车','first-aid-trolley',1],['rest','车座铺位','car-seat-rest-berth',1],['campfire','篝火小锅','campfire-small-pot',1],['kettle','旧提水壶','small-enamel-water-jug',2]].map(([id,name,file,version])=>({id,name,file,src:'assets/dungeon/recovery/'+file+'-v'+version+'.png',usedSrc:'assets/dungeon/recovery/'+file+'-used-v'+version+'.png'}));
const compactLoot=new Set(['abandoned-chest-v1','lost-backpack-v1','discarded-toolbox-v1','reused-fridge-v1','reused-plastic-drum-v1','patched-suitcase-v1','repaired-cooler-v1','computer-tower-cabinet-v1','postbox-cache-v1','factory-locker-cache-v1','wire-cage-trolley-v1','stacked-plastic-crates-v1','milk-churn-storage-v1','motorcycle-topbox-cache-v1','aluminum-flight-case-v1']);
const distance=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
const euclidean=(a,b,w)=>Math.hypot(a%w-b%w,Math.floor(a/w)-Math.floor(b/w));
const orth=(k,m)=>RS.neighbours(k,m);
function positions(map,room,type,count){
 const w=map.width,inside=new Set(room.inner),landing=orth(room.door,map).filter(k=>inside.has(k));
 const candidates=room.inner.filter(k=>!landing.includes(k)&&distance(k,room.door,w)>=(type==='loot'?3:2)).map(k=>({k,wall:orth(k,map).some(n=>map.tiles[n]===1)?1:0,jitter:R.hash(map.seed+'-mixed-'+type+'-'+k)/4294967296+(type==='wood'?(k%w+Math.floor(k/w))*.3:0)})).sort((a,b)=>b.wall-a.wall||b.jitter-a.jitter);
 const combos=[];
 function collect(chosen,start){
  if(combos.length>=180)return;
  if(chosen.length===count){combos.push(chosen.slice());return;}
  for(let i=start;i<candidates.length;i++){
   const k=candidates[i].k;
   if(chosen.some(a=>type==='loot'?distance(a,k,w)<2:euclidean(a,k,w)<1.9))continue;
   // A patch, not resources scattered to opposite ends of a room.
   if(type!=='loot'&&chosen.some(a=>euclidean(a,k,w)>4))continue;
   chosen.push(k);collect(chosen,i+1);chosen.pop();if(combos.length>=180)break;
  }
 }
 collect([],0);
 for(const cells of combos){
  const layout=ER.layout(map,room,room.enemyCount,cells);
  if(layout)return{cells,layout};
 }
 return null;
}
function rebuild(map){
 map.collision=map.tiles.slice();
 for(const k of map.largeRoomBlocked||[])map.collision[k]=6;
 for(const k of map.workshopBlocked||[])map.collision[k]=6;
 for(const k of map.clinicBlocked||[])map.collision[k]=6;
 for(const k of map.canteenBlocked||[])map.collision[k]=6;
 for(const e of map.enemies)map.collision[e.cell]=7;
 for(const p of [...map.resources,...map.lootPoints,...map.recoveryPoints])map.collision[p.cell]=6;
 map.resourceRooms=map.rooms.filter(r=>r.nodes?.length);
 for(const room of map.rooms)if(room.resourceType&&!room.nodes?.length){delete room.resourceType;delete room.resourceSize;delete room.nodes;}
 map.resourceSummary=Object.fromEntries(Object.keys(RS.types).map(type=>[type,{rooms:map.resourceRooms.filter(r=>r.resourceType===type).length,nodes:map.resources.filter(n=>n.type===type).length}]));
 const flow=R.flood(map.collision,map.width,map.height,map.entry);
 if(flow.reached!==map.collision.filter(R.walkable).length)throw Error('混合房通路未连通。');
 for(const p of [...map.resources,...map.lootPoints,...map.recoveryPoints]){
  p.access=orth(p.cell,map).filter(k=>flow.dist[k]>=0);
  if(!p.access.length)throw Error('混合房缺少操作位置。');
 }
 map.path=R.route(R.closedPassages(map),map.width,map.height,map.entry,map.exit);
 if(!map.path.length)throw Error('混合房阻断撤离路线。');
}
function populate(map,requested='natural',recoveryId=null){
 const variant=profiles[requested]?requested:'natural';
 map.mixedVariant=variant;map.mixedRooms=[];map.recoveryPoints=[];
 map.mixedBudget={enemies:map.enemies.length,enemyRooms:map.enemyRooms.length,resources:map.resources.length,resourceTypes:Object.fromEntries(Object.keys(RS.types).map(t=>[t,map.resources.filter(n=>n.type===t).length])),containers:map.lootPoints.length,recoveryMax:1};
 globalThis.RuinsOutposts?.populate(map,recoveryCatalog,variant==='recovery'?recoveryId:null);
 const quota=Math.floor(map.enemyRooms.filter(r=>!r.outpostType).length/3);
 const order=Object.keys(profiles).sort((a,b)=>R.hash(map.seed+'-'+map.floor+'-mix-order-'+a)-R.hash(map.seed+'-'+map.floor+'-mix-order-'+b));
 if(variant!=='natural'){order.splice(order.indexOf(variant),1);order.unshift(variant);}
 for(const type of order){
  if(map.mixedRooms.filter(r=>!r.outpostType).length>=quota)break;
  if(type==='recovery'&&map.recoveryPoints.length)continue;
  const profile=profiles[type];
  const donor=RS.types[type]?map.resourceRooms.find(r=>r.resourceType===type&&!r.mixedType):null;
  let items=type==='recovery'?[recoveryCatalog.find(p=>p.id===recoveryId)||recoveryCatalog[(map.floor-1)%4]]:type==='loot'?map.lootPoints.filter(p=>!p.roomId&&compactLoot.has(p.assetId)).slice(0,profile.maxPoints):(donor?.nodes||[]).slice(0,profile.maxPoints);
  if(!items.length)continue;
  if(map.contentVersion&&donor){if(donor.nodes.length>profile.maxPoints)continue;items=donor.nodes.slice();}
  const rooms=map.enemyRooms.filter(r=>!r.mixedType&&r.enemyCount<=profile.maxEnemies&&r.inner.length>=profile.min&&r.inner.length<=profile.max&&(r.enemyCount<3||r.inner.length>=36)).sort((a,b)=>(type==='loot'?b.enemyCount-a.enemyCount:0)||Math.abs(a.inner.length-profile.target)-Math.abs(b.inner.length-profile.target)||a.id-b.id);
  let selected=null,placement=null;
  for(let count=items.length;count>=(map.contentVersion&&donor?items.length:1)&&!selected;count--){
   if(type==='gather'&&count<2)break;
   for(const room of rooms){const p=positions(map,room,type,count);if(p){selected=room;placement=p;items=items.slice(0,count);break;}}
  }
  if(!selected)continue;
  const room=selected;room.mixedType=type;room.landings=placement.layout.landings;
  room.enemies.forEach((enemy,i)=>{enemy.cell=placement.layout.cells[i];enemy.entrySteps=placement.layout.depth(enemy.cell);});
  if(type==='recovery'){
   const item=items[0],point={...item,uid:'recovery-'+room.id,roomId:room.id,cell:placement.cells[0],used:false};
   room.recoveryPoints=[point];map.recoveryPoints.push(point);
  }else if(type==='loot'){
   room.lootPoints=items;items.forEach((point,i)=>{point.cell=placement.cells[i];point.roomId=room.id;});
  }else{
   donor.nodes=donor.nodes.filter(n=>!items.includes(n));room.resourceType=type;room.nodes=items;room.resourceSize=room.inner.length<18?0:room.inner.length<45?1:2;
   items.forEach((point,i)=>{point.cell=placement.cells[i];point.roomId=room.id;});
  }
  map.mixedRooms.push(room);
 }
 rebuild(map);
 // Keep legacy saves untouched; each generated composition owns its own session.
 map.mixedSignature='mixed-v1:'+variant+':'+R.hash(JSON.stringify([map.enemies.map(e=>[e.uid,e.cell]),map.resources.map(n=>[n.uid,n.cell]),map.lootPoints.map(p=>[p.uid,p.cell]),map.recoveryPoints.map(p=>[p.id,p.cell])]));
 if(map.contentVersion)map.mixedSignature+=RuinsContentConfig.signature(map.contentConfig);
 return map;
}
const images=new Map();let invalidate=()=>{};
function recoveryArt(p,used=p.used){const g=globalThis.DungeonGridArt;return g?.legacy(g.recoveryIds[p.id],used?'used':'normal');}
function recoverySrc(p,used=p.used){const a=recoveryArt(p,used);if(a)return a.src;const src=used?p.usedSrc:p.src;return globalThis.RuinsPOIArtMap?.[src]?.src||src;}
function loadRecovery(point){if(typeof Image==='undefined')return;for(const src of [recoverySrc(point,false),recoverySrc(point,true)])if(!images.has(src)){const im=new Image();images.set(src,im);im.onload=()=>invalidate();im.onerror=()=>console.error('恢复棋子加载失败：'+src);im.src=src;}}
function drawRecovery(ctx,p,x,y,scale){
 const g=globalThis.DungeonGridArt;if(recoveryArt(p)){g.draw(ctx,g.recoveryIds[p.id],p.used?'used':'normal',x,y,scale,{point:p});return;}
 loadRecovery(p);const src=recoverySrc(p),im=images.get(src),bounds=globalThis.RuinsRecoveryBounds?.[src];
 if(im?.complete&&im.naturalWidth){const [bx,by,bw,bh,cx,bottom,baseWidth]=bounds||[0,0,im.naturalWidth,im.naturalHeight,im.naturalWidth/2,im.naturalHeight*.96,im.naturalWidth*.75],f=scale*1.05/baseWidth;ctx.drawImage(im,bx,by,bw,bh,x+(bx-cx)*f,y+scale*.16+(by-bottom)*f,bw*f,bh*f);}
}
function thumbnail(p){const src=recoverySrc(p),b=recoveryArt(p)?.bounds||globalThis.RuinsRecoveryBounds[src];return '<svg class="recovery-thumb" viewBox="'+b.slice(0,4).join(' ')+'" aria-hidden="true"><image href="'+src+'" width="'+b[7]+'" height="'+b[8]+'"/></svg>';}
globalThis.RuinsMixed={profiles,recoveryCatalog,populate,positions,loadRecovery,drawRecovery,thumbnail,setInvalidation:fn=>invalidate=fn};
})();
