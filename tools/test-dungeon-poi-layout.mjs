import assert from 'node:assert/strict';
import {boot} from './dungeon/fixture.mjs';
const f=await boot(false),plain=v=>JSON.parse(JSON.stringify(v));
try{
 const g=f.g,R=g.RuinsSettlement,C=g.RuinsContentConfig,stats={maps:0,containers:0,outdoor:0,recovery:0,outdoorRecovery:0,sightGaps:0,enclosures:{}};
 function validate(m){
  const outside=m.lootPoints.filter(p=>p.roomId===undefined);
  assert.ok(outside.length>=1&&outside.length<=3,'only 1–3 outdoor containers after boss allocation');
  assert.equal(m.lootPoints.length,m.mixedBudget.containers,'relocation never changes loot quota');
  assert.equal(new Set(m.lootPoints.map(p=>p.uid)).size,m.lootPoints.length);
  assert.equal(m.recoveryPoints.length,m.recoveryBudget.actual);assert.ok(m.recoveryPoints.length<=m.recoveryBudget.target);
  assert.ok(m.recoveryPoints.filter(p=>p.outdoor).length<=1);
  for(const p of [...m.resources,...m.insightPoints])assert.ok(m.rooms.find(r=>r.id===p.roomId)?.inner.includes(p.cell));
  for(const p of m.recoveryPoints){if(p.outdoor)assert.ok(g.RuinsPOIPlacement.nearRoom(m,p.cell).distance<=2);else assert.ok(m.rooms.find(r=>r.id===p.roomId)?.inner.includes(p.cell));}
  for(const p of m.lootPoints.filter(p=>p.roomId!==undefined))assert.ok(m.rooms.find(r=>r.id===p.roomId)?.inner.includes(p.cell));
  const open=R.flood(m.collision,m.width,m.height,m.entry);assert.equal(open.reached,m.collision.filter(R.walkable).length);
  assert.ok(R.route(R.closedPassages(m),m.width,m.height,m.entry,m.exit).length);
  const s=g.RuinsEncounter.create(m),closed=R.closedPassages(m),flow=R.flood(closed,m.width,m.height,m.entry);
  for(const p of [...m.resources,...m.lootPoints,...m.recoveryPoints,...m.insightPoints])assert.ok(g.RuinsResources.neighbours(p.cell,m).some(k=>open.dist[k]>=0));
  for(const r of m.rooms){
   if(!r.enclosure)continue;stats.enclosures[r.enclosure]=(stats.enclosures[r.enclosure]||0)+1;
   if(r.enclosure==='intact'){assert.ok(r.hasDoor&&s.doors.some(d=>d.roomId===r.id));continue;}
   assert.equal(r.hasDoor,false);assert.ok(!s.doors.some(d=>d.roomId===r.id));assert.ok(r.inner.some(k=>flow.dist[k]>=0),'open room needs no door payment');
   if(r.enclosure==='open-foundation'){assert.ok(r.inner.length<49);assert.ok(r.cells.every(k=>m.tiles[k]!==1));}
   if(r.enclosure==='breached'){assert.ok(r.inner.length>=49);assert.ok(r.removedWalls.length>=2&&r.removedWalls.length<=4);assert.ok(r.cells.some(k=>m.tiles[k]===1));}
   for(const k of r.removedWalls||[]){assert.equal(s.staticTiles[k],2);for(const delta of [1,m.width]){const a=k-delta,b=k+delta;if(a<0||b>=m.tiles.length||!R.walkable(s.staticTiles[a])||!R.walkable(s.staticTiles[b]))continue;if(delta===1&&Math.floor(a/m.width)!==Math.floor(b/m.width))continue;assert.ok(g.RuinsEncounter.lineOfSight(s,a,b),'sight passes through the removed wall');stats.sightGaps++;}}
  }
  stats.maps++;stats.containers+=m.lootPoints.length;stats.outdoor+=outside.length;stats.recovery+=m.recoveryPoints.length;stats.outdoorRecovery+=m.recoveryPoints.filter(p=>p.outdoor).length;
 }
 for(let i=0;i<16;i++){
  const floor=i%4+1;let map,error;
  for(let n=0;n<8;n++){try{map=g.RuinsRooms.generate('poi-layout-'+i+'|'+floor+'|'+n,'city',floor,{contentConfig:C.resolve()});g.DungeonBoss.place(map,{floor:4,enemyId:'enemy.street_thug_boss'});error=null;break;}catch(e){error=e;}}
  if(error)throw error;validate(map);console.log('checked floor',floor,'seed',i);
 }
 assert.ok(stats.enclosures['open-foundation']>0&&stats.enclosures.breached>0);
 assert.ok(stats.sightGaps>0);
 assert.ok(stats.outdoorRecovery<stats.recovery*.3);
 const old=C.normalize(plain(C.legacyV13));assert.equal(old.version,13);assert.ok(!old.poi&&!old.ruins);
 const legacy=g.RuinsRooms.generate('legacy-poi-compat','city',1,{contentConfig:old});assert.ok(!legacy.poiBudget&&!legacy.ruinSummary);assert.ok(legacy.rooms.every(r=>!r.enclosure));
 assert.throws(()=>C.resolve({overrides:{poi:{nearRoomDistance:3}}}));
 assert.throws(()=>C.resolve({overrides:{ruins:{largeDoorlessChance:.9,largeDamagedChance:.5}}}));
 assert.deepEqual(f.errors,[]);console.log('PASS: V14 room-first POIs, physical ruin openings, rewards, connectivity and V13 compatibility',JSON.stringify(stats));
}finally{await f.close();}
