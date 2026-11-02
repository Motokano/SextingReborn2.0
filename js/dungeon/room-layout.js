/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const R=RuinsSettlement;
const roll=(map,channel,id)=>RuinsContainerSearch.random(map.seed+'-rooms-'+map.floor+'-'+channel+'-'+id)();
function prepare(map,floor,config){
 map.floor=floor;map.contentConfig=config;
 if(config.version<2)return map;
 // Empty reservations cannot consume the floor's existing resource allocation.
 const resourceSlots=RuinsResources.quota(map,floor,config).target;
 const studySlots=map.rooms.filter(r=>r.recipeStudyRoom).length;
 const candidates=map.rooms.slice().sort((a,b)=>roll(map,'empty-order',a.id)-roll(map,'empty-order',b.id));
 let vacant=0;
 for(const room of candidates){
  if(room.recipeStudyRoom)continue;
  const large=config.version>=13&&config.outposts.enabled&&RuinsLargeRooms.eligible(room,config.largeRooms);
  room.reservedEmpty=!large&&roll(map,'empty',room.id)<config.rooms.emptyChance&&vacant<map.rooms.length-resourceSlots-studySlots;
  vacant+=Number(room.reservedEmpty);
  room.hasDoor=roll(map,'door',room.id)>=config.rooms.doorlessChance;
  if(config.version>=14){
   const large=room.inner.length>=config.ruins.largeRoomArea,n=roll(map,'ruin-state',room.id),doorless=large?config.ruins.largeDoorlessChance:config.rooms.doorlessChance,damage=large?config.ruins.largeDamagedChance:config.ruins.smallWalllessChance;
   room.enclosure=n<doorless?'doorless':n<doorless+damage?(large?'breached':'open-foundation'):'intact';
   room.hasDoor=room.enclosure==='intact';
  }
 }
 map.roomAllocation={reservedEmpty:vacant,resourceSlots};return map;
}
function openRuins(map){
 const cfg=map.contentConfig.ruins;if(!cfg)return;
 map.ruinOpenings=[];
 for(const room of map.rooms){
  if(room.templateId||!['breached','open-foundation'].includes(room.enclosure))continue;
  const walls=room.cells.filter(k=>map.tiles[k]===1),inner=new Set(room.inner),orth=k=>RuinsResources.neighbours(k,map);
  let removed=walls;
  if(room.enclosure==='breached'){
   const choices=walls.filter(k=>orth(k).some(n=>inner.has(n))&&orth(k).some(n=>map.owner[n]!==room.id&&R.walkable(map.collision[n])));
   choices.sort((a,b)=>roll(map,'breach',a)-roll(map,'breach',b));
   if(!choices.length){room.enclosure='doorless';continue;}
   const desired=Math.min(Math.floor(walls.length*.25),cfg.breachMin+Math.floor(roll(map,'breach-size',room.id)*(cfg.breachMax-cfg.breachMin+1)));
   const pending=new Set(walls),q=[choices[0]];pending.delete(q[0]);removed=[];
   for(let i=0;i<q.length&&removed.length<desired;i++){const k=q[i];removed.push(k);for(const n of orth(k))if(pending.delete(n))q.push(n);}
  }
  for(const k of removed){map.tiles[k]=2;map.collision[k]=2;}
  const flow=R.flood(map.collision,map.width,map.height,map.entry);
  if(flow.reached!==map.collision.filter(R.walkable).length){for(const k of removed){map.tiles[k]=1;map.collision[k]=1;}room.enclosure='doorless';continue;}
  room.removedWalls=removed;map.ruinOpenings.push(...removed);
 }
 map.ruinSummary=Object.fromEntries(['intact','doorless','open-foundation','breached'].map(key=>[key,map.rooms.filter(r=>r.enclosure===key).length]));
}
function finish(map){
 // Decorators reserve all thresholds before opening any: outdoor props and
 // patrols cannot spill into the newly accessible rooms or block their entries.
 map.doorlessRooms=map.rooms.filter(r=>r.hasDoor===false);
 for(const r of map.doorlessRooms){map.tiles[r.door]=2;map.collision[r.door]=2;}
 map.doors=map.rooms.filter(r=>r.hasDoor!==false).map(r=>r.door);
 if(map.contentConfig.version>=14)openRuins(map);
 for(const r of map.rooms)r.isEmpty=!(r.enemyCount||r.nodes?.length||r.lootPoints?.length||r.recoveryPoints?.length||r.insightPoints?.length);
 map.emptyRooms=map.rooms.filter(r=>r.isEmpty);
 if(map.contentConfig.version>=2)map.mixedSignature+=':rooms-v1:'+R.hash(JSON.stringify(map.rooms.map(r=>[r.id,r.reservedEmpty,r.hasDoor,r.isEmpty])));
 map.path=R.route(R.closedPassages(map),map.width,map.height,map.entry,map.exit);
 if(!map.path.length)throw Error('房间入口阻断撤离通路');
 return map;
}
function generate(seed,preset,floor,{legacy=false,contentConfig=RuinsContentConfig.defaults,mixed='natural',recovery='water',environment={},population=null,populationSeed=seed,studyPlan=null}={}){
 const config=legacy?RuinsContentConfig.legacyV1:RuinsContentConfig.normalize(contentConfig);
 let map=R.make(seed,preset);map.floor=floor;map.contentConfig=config;map.populationConfig=population;map.populationSeed=populationSeed;
 if(config.version>=16&&config.recipeStudy.enabled)RuinsRecipeStudy.reserve(map,studyPlan||RuinsRecipeStudy.plan(seed,1,4,config.recipeStudy));
 prepare(map,floor,config);
 RuinsEnemies.plan(map);RuinsResources.populate(map,floor,{legacy,contentConfig:config});
 RuinsLoot.populate(map);RuinsMixed.populate(map,mixed,recovery);
 if(config.version>=14)RuinsPOIPlacement.containers(map);
 RuinsRecoveryPlacement.populate(map);RuinsWanderers.populate(map);RuinsInsight.populate(map);
 if(config.recipeStudy?.enabled)RuinsRecipeStudy.populate(map);
 finish(map);if(config.version>2){globalThis.RuinsWoodland?.populate(map,environment);globalThis.RuinsOutpostDecor?.populate(map);}
 if(config.version>=16)RuinsRecipeStudy.decorate(map);
 if(config.version>=11&&config.containers.enabled){if(!globalThis.RuinsContainerProfiles)throw Error('缺少容器分类模块');RuinsContainerProfiles.assign(map);}return map;
}
globalThis.RuinsRooms={prepare,finish,generate};
})();
