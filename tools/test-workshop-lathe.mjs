import assert from 'node:assert/strict';
import {boot} from './dungeon/fixture.mjs';
const f=await boot(false);
try{
 const g=f.g,R=g.RuinsSettlement,orientations=new Set();let machines=0;
 for(const terrain of [false,true])for(let i=0;i<6;i++){
  const content=JSON.parse(JSON.stringify(g.RuinsContentConfig.resolve()));
  content.workshop.terrain.enabled=terrain;
  const m=g.RuinsRooms.generate('lathe-proportion-'+i,'city',4,{contentConfig:content});
  for(const p of m.workshopObstacles.filter(p=>p.kind==='workshop-machine-v1')){
   machines++;assert.equal(p.footprint.length,2);
   const [a,b]=p.footprint,vertical=b-a===m.width;assert.ok(vertical||b-a===1);
   assert.equal(p.flip,vertical);orientations.add(vertical?'y':'x');
   assert.ok(p.offsetX===(vertical?0:-.5));assert.ok(p.offsetY===(vertical?-.5:0));
   for(const k of p.footprint){assert.ok(m.workshopBlocked.has(k));assert.ok(m.workshopOpaque.has(k));assert.equal(R.walkable(m.collision[k]),false);}
   const room=m.rooms.find(r=>r.id===p.roomId),core=room.workshop,ring=core.ring;
   assert.ok(ring.length&&ring.every(k=>!m.workshopBlocked.has(k)),'operator aisles stay open');
  }
  assert.equal(R.flood(m.collision,m.width,m.height,m.entry).reached,m.collision.filter(R.walkable).length,'floor stays connected');
 }
 assert.ok(machines>0);assert.equal(orientations.size,2);
 assert.deepEqual(f.errors,[]);console.log('PASS: '+machines+' native 2×1 lathes across 12 maps, both orientations, terrain on/off, collision and circulation.');
}finally{await f.close();}
