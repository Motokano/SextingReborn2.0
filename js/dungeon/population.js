/* Independent per-room and outdoor budgets. Applied once, to newly generated floors. */
(()=>{'use strict';
const R=RuinsSettlement,copy=v=>JSON.parse(JSON.stringify(v));
const dist=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
const near=(k,m)=>[[1,0],[-1,0],[0,1],[0,-1]].map(([x,y])=>[k%m.width+x,Math.floor(k/m.width)+y]).filter(([x,y])=>x>=0&&y>=0&&x<m.width&&y<m.height).map(([x,y])=>y*m.width+x);
function validate(c){
 if(!c||!Number.isFinite(c.nonRoomEnemies.base)||c.nonRoomEnemies.base<0||c.nonRoomEnemies.base>500||!Number.isFinite(c.nonRoomEnemies.variationRatio)||c.nonRoomEnemies.variationRatio<0||c.nonRoomEnemies.variationRatio>1)throw Error('无效非房间人数配置');
 const range=p=>{if(!Number.isSafeInteger(p.min)||!Number.isSafeInteger(p.max)||p.min<0||p.max<p.min||p.max>100)throw Error('无效房间人数范围');};
 for(const p of Object.values(c.roomEnemies.profiles)){if(p.full){for(const key of ['full','light','abandoned'])range(p[key]);}else range(p);}
 for(const row of Object.values(c.floorWeights))if(!['tier1','tier2','tier3'].every(k=>Number.isFinite(row[k])&&row[k]>=0)||Object.values(row).reduce((a,b)=>a+b,0)<=0)throw Error('无效地痞楼层权重');
 for(const source of c.modifierSources||[])for(const m of [source.all,source.nonRoom,source.rooms,...Object.values(source.profiles||{})].filter(Boolean))if(!Number.isFinite(m.add??0)||Math.abs(m.add??0)>100||!Number.isFinite(m.multiplier??1)||(m.multiplier??1)<0||(m.multiplier??1)>10)throw Error('无效敌人人数词条');
 return c;
}
function resolve(c,...sources){const result=copy(c);result.modifierSources=[...(result.modifierSources||[]),...sources.filter(Boolean).map(copy)];return validate(result);}
function modify(n,c,scope,profile){let add=0,mul=1;for(const source of c.modifierSources||[])for(const row of [source.all,source[scope],scope==='rooms'?source.profiles?.[profile]:null].filter(Boolean)){add+=row.add||0;mul*=row.multiplier??1;}return Math.max(0,Math.round((n+add)*mul));}
function sample(c,min,max,seed,key){const n=R.random(R.hash(seed+'|population|'+key))();return min+Math.floor(n*(max-min+1));}
function outdoorCount(c,seed){const n=modify(c.nonRoomEnemies.base,c,'nonRoom'),v=c.nonRoomEnemies.variationRatio;return sample(c,Math.ceil(n*(1-v)),Math.floor(n*(1+v)),seed,'outdoor-count');}
function profile(room){
 if(room.outpostType)return ({loot:'loot_outpost',recovery:'rest_outpost',workshop:'workshop',clinic:'clinic',canteen:'canteen'})[room.outpostType]||'non_enemy_room';
 if(room.mixedType)return room.mixedType==='loot'?'container_mixed':room.mixedType==='recovery'?'recovery_mixed':'resource_mixed';
 return room.populationProfile||'non_enemy_room';
}
function roomCount(c,room,seed){const key=profile(room),p=c.roomEnemies.profiles[key],range=p?.full?p[room.largeRoomState||'full']:p;if(!range)throw Error('缺少房型人数：'+key);if(!range.max)return 0;return sample(c,modify(range.min,c,'rooms',key),modify(range.max,c,'rooms',key),seed,'room-'+room.id+'-'+key);}
function tier(c,floor,seed,uid){const row=c.floorWeights[floor];if(!row)throw Error('缺少楼层敌人配比');let n=R.random(R.hash(seed+'|tier|'+uid))()*Object.values(row).reduce((a,b)=>a+b,0);return ['tier1','tier2','tier3'].find(k=>(n-=row[k])<0)||'tier3';}
function apply(m){
 const c=m.populationConfig;if(!c||m.populationApplied)return m;validate(c);
 const seed=m.populationSeed||m.seed,w=m.width,base=m.collision.slice();for(let k=0;k<base.length;k++)if(base[k]===7)base[k]=m.tiles[k];
 const bosses=m.enemies.filter(e=>e.boss||e.enemyId==='enemy.street_thug_boss'),occupied=new Set(bosses.map(e=>e.cell));
 const fixed=new Set([m.entry,m.exit,...m.rooms.flatMap(r=>[r.door,...near(r.door,m)])]);
 const points=[...m.resources,...m.lootPoints,...m.recoveryPoints,...m.insightPoints];
 const current=base.slice();for(const k of occupied)current[k]=7;
 const originalReach=R.flood(current,w,m.height,m.entry).reached;
 let placed=0;
 function claim(k,outside=false){
  if(!R.walkable(current[k])||fixed.has(k)||occupied.has(k))return false;
  current[k]=7;const f=R.flood(current,w,m.height,m.entry);
  if(f.reached!==originalReach-placed-1||points.some(p=>!near(p.cell,m).some(n=>f.dist[n]>=0))){current[k]=base[k];return false;}
  if(outside){const closed=current.slice();for(const d of m.doors)closed[d]=1;if(!R.route(closed,w,m.height,m.entry,m.exit).length){current[k]=base[k];return false;}}
  occupied.add(k);placed++;return true;
 }
 const enemies=[...bosses],budgets=[];
 for(const room of m.rooms){
  if(room.boss||room.id===m.boss?.roomId||room.id===m.bossRoom?.roomId||room.templateId||room.outpostType==='boss')continue;
  const key=profile(room),count=roomCount(c,room,seed);budgets.push({roomId:room.id,profile:key,state:room.largeRoomState||null,count});
  room.enemies=[];room.enemyCount=count;room.populationProfile=key;
  const candidates=room.inner.filter(k=>R.walkable(current[k])&&!fixed.has(k)).sort((a,b)=>R.hash(seed+'|room-place|'+room.id+'|'+a)-R.hash(seed+'|room-place|'+room.id+'|'+b));
  for(const k of candidates){if(room.enemies.length>=count)break;if(!claim(k))continue;const n=room.enemies.length+1,uid='resident-'+room.id+'-'+n,level=tier(c,m.floor,seed,uid),enemy={uid,roomId:room.id,cell:k,number:n,name:c.tiers[level].name,enemyId:c.tiers[level].enemyId,populationScope:'room',entrySteps:Math.max(1,dist(k,room.door,w))};room.enemies.push(enemy);enemies.push(enemy);}
  if(room.enemies.length!==count)throw Error('房间独立人数无法完整布置：'+room.id+' / '+count);
 }
 const count=outdoorCount(c,seed),outdoor=base.slice(),roomCells=new Set(m.rooms.flatMap(r=>r.cells||r.inner));
 for(let k=0;k<outdoor.length;k++)if(m.owner[k]>=0||roomCells.has(k)||!R.walkable(base[k]))outdoor[k]=5;
 const flow=R.flood(outdoor,w,m.height,m.entry),candidates=outdoor.map((_,k)=>k).filter(k=>flow.dist[k]>=12&&!fixed.has(k)&&!occupied.has(k)&&m.doors.every(d=>dist(k,d,w)>=3));
 candidates.sort((a,b)=>Number(!!m.road[b])-Number(!!m.road[a])||R.hash(seed+'|outdoor-place|'+a)-R.hash(seed+'|outdoor-place|'+b));
 m.wanderers=[];
 for(const k of candidates){if(m.wanderers.length>=count)break;if(m.wanderers.some(e=>dist(e.cell,k,w)<3))continue;const local=R.flood(outdoor,w,m.height,k),cells=outdoor.map((_,n)=>n).filter(n=>local.dist[n]>=0&&local.dist[n]<=5&&flow.dist[n]>=8);if(cells.length<8||!claim(k,true))continue;
  const number=m.wanderers.length+1,uid='wanderer-'+number,level=tier(c,m.floor,seed,uid),e={uid,roomId:null,cell:k,number,name:c.tiers[level].name,enemyId:c.tiers[level].enemyId,populationScope:'nonRoom',roaming:true,spawnFacing:R.hash(seed+'|facing|'+uid)%8,patrolRadius:5,patrolCells:cells,patrolLayoutKey:'population-v1:'+k};m.wanderers.push(e);enemies.push(e);
 }
 if(m.wanderers.length!==count)throw Error('非房间敌人无法完整布置：'+count);
 m.enemies=enemies;m.collision=current;m.patrolTiles=outdoor;m.patrolConfig={target:count};m.enemyRooms=m.rooms.filter(r=>r.enemyCount);
 for(const r of m.rooms)r.isEmpty=!(r.enemyCount||r.nodes?.length||r.lootPoints?.length||r.recoveryPoints?.length||r.insightPoints?.length);
 m.emptyRooms=m.rooms.filter(r=>r.isEmpty);m.populationBudget={nonRoom:count,rooms:budgets,bosses:bosses.length,total:enemies.length};m.populationApplied=true;
 return m;
}
globalThis.DungeonPopulation={validate,resolve,outdoorCount,roomCount,tier,apply};
})();
