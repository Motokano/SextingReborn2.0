import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot} from './dungeon/fixture.mjs';
const f=await boot(false),plain=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const approved=JSON.parse(fs.readFileSync('assets/dungeon/street-thug-boss-room-v6/default-layout.json','utf8'));
try{
 const g=f.g,R=g.RuinsSettlement,T=g.DungeonBossRoomTemplate.data,config={floor:4,enemyId:'enemy.street_thug_boss',spawnChance:1},positions=new Set();let count=0;
 for(const variant of ['normal','doorless','empty'])for(let n=0;n<8;n++){
  const content=plain(g.RuinsContentConfig.resolve());if(variant==='doorless'){content.rooms.doorlessChance=1;Object.assign(content.ruins,{smallWalllessChance:0,largeDoorlessChance:1,largeDamagedChance:0});}if(variant==='empty')content.rooms.emptyChance=1;
  let m,error;
  for(let attempt=0;attempt<8;attempt++){try{m=g.RuinsRooms.generate('fixed-den-test-'+variant+'-'+n+'|4|'+attempt,'city',4,{contentConfig:content});const budget=[m.enemies.length,m.lootPoints.length];g.DungeonBoss.place(m,config);assert.deepEqual([m.enemies.length,m.lootPoints.length],budget,'transfer only existing allocation');error=null;break;}catch(e){error=e;}}
  if(error)throw error;
  const meta=m.bossRoom,[dx,dy]=[meta.origin[0]-3,meta.origin[1]-3],local=k=>[k%m.width-dx,Math.floor(k/m.width)-dy],cell=(x,y)=>(y+dy)*m.width+x+dx;
  positions.add(meta.origin.join(','));assert.equal(meta.templateId,T.id);assert.equal(m.rooms.filter(r=>r.templateId===T.id).length,1);
  const room=m.rooms.find(r=>r.id===meta.roomId),boss=m.enemies.filter(e=>e.enemyId===config.enemyId);
  assert.equal(room.inner.length,40);assert.equal(room.cells.length,70);assert.equal(boss.length,1);assert.deepEqual(local(boss[0].cell),[7,6]);assert.deepEqual(local(room.door),[7,12]);
  const objects=[...m.outpostDecor.filter(p=>p.roomId===room.id),...room.lootPoints];
  assert.equal(objects.length,12);assert.equal(room.lootPoints.length,2);
  for(const expected of approved.objects){const p=objects.find(p=>(p.kind||p.assetId)===expected.uid),spec=T.objects.find(p=>p.uid===expected.uid);assert.ok(p,expected.uid);assert.deepEqual(local(p.cell),[expected.x,expected.y]);assert.equal(!!p.flip,false);assert.deepEqual(plain(p.front),plain(spec.front));
   if(p.footprint)assert.deepEqual(plain(p.footprint.map(local)),plain((spec.footprintOffsets||[[0,0]]).map(([a,b])=>[spec.x+a,spec.y+b])));
  }
  assert.deepEqual(plain(meta.bounds),[3+dx,3+dy,9+dx,12+dy]);assert.equal(m.tiles[room.door],4);
  for(let y=3;y<=12;y++)for(let x=3;x<=9;x++)assert.equal(m.tiles[cell(x,y)],x===7&&y===12?4:x===3||x===9||y===3||y===12?1:2);
  const sim=g.RuinsEncounter.create(m),door=sim.doors.find(d=>d.roomId===room.id);assert.equal(door.material,'iron');assert.equal(door.closed,true);
  const closed=R.closedPassages(m),flow=R.flood(closed,m.width,m.height,m.entry);assert.ok(flow.dist[door.outside]>=0);assert.ok(R.route(closed,m.width,m.height,m.entry,m.exit).length);
  const free=sim.staticTiles.slice();free[boss[0].cell]=7;const inside=R.flood(free,m.width,m.height,door.inside,false);assert.ok(room.inner.every(k=>!R.walkable(free[k])||inside.dist[k]>=0));
  assert.ok(R.flood(sim.staticTiles,m.width,m.height,door.inside).dist[boss[0].cell]>=5);
  assert.ok(room.lootPoints.every(p=>p.access.length>=1));assert.equal(sim.map.workshopOpaque.has(cell(5,6)),true);
  assert.equal(g.RuinsEncounter.lineOfSight(sim,cell(4,5),cell(6,7)),false,'column blocks sight');
  assert.equal(g.RuinsEncounter.lineOfSight(sim,cell(4,5),cell(4,7)),true,'half wall preserves sight');
  const before=JSON.stringify(plain(m));g.DungeonBoss.place(m,config);assert.equal(JSON.stringify(plain(m)),before,'reapplication is idempotent');
  count++;console.log('fixed room',variant,n,'origin',meta.origin.join(','));
 }
 assert.ok(positions.size>1,'position varies while the local template stays fixed');
 console.log('PASS: '+count+' fourth floors, exact approved walls/door/12 objects/boss, budgets, closed-door bypass, collision, LOS and forced doorless/empty settings.');
}finally{await f.close();}
