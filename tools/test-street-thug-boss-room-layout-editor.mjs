import assert from 'node:assert/strict';
import {boot} from './dungeon/fixture.mjs';
import {installBossRoomBoard} from './street-thug-boss-room-board-layout.mjs';
import {captureLayout,movedLayout,planLayout,applyLayout} from './street-thug-boss-room-layout-editor-model.mjs';
const h=await boot(false);
try{
 const g=h.g;await g.DungeonRuntime.ready;g.CharacterAttributes.setState({character_creation_completed:true});installBossRoomBoard(g);
 const D=g.DungeonRuntime,E=g.GameEngine,s=D.getSim(),m=s.map,w=m.width,k=(x,y)=>y*w+x,initial=captureLayout(m);
 // A two-cell shelf frees both old cells and blocks both new ones; facing stays fixed.
 applyLayout(g,movedLayout(m,'den-cargo',2,0));
 for(const y of [10,11]){assert.equal(E.isWalkable(4,y),true);assert.equal(E.isWalkable(6,y),false);}
 const cargo=m.outpostDecor.find(p=>p.uid==='den-cargo');assert.deepEqual(Array.from(cargo.footprint),[k(6,10),k(6,11)]);assert.deepEqual(Array.from(cargo.front),[1,0]);assert.equal(cargo.approach,k(7,10));
 const afterShelf=JSON.stringify(captureLayout(m));
 for(const [uid,dx,dy] of [['den-cargo',-3,0],['den-cargo',0,-7],['den-fan',1,6]]){
  assert.throws(()=>applyLayout(g,movedLayout(m,uid,dx,dy)));assert.equal(JSON.stringify(captureLayout(m)),afterShelf,'invalid drops are atomic');
 }
 assert.throws(()=>planLayout(m,movedLayout(m,'den-fan',2,5),[k(7,9)]),'cannot drop onto a person');
 // Container placement changes actual searches/collision without resetting contents or state.
 const basket=s.lootPoints.find(p=>p.uid==='den-basket');basket.search.opened=true;basket.search.complete=true;
 applyLayout(g,movedLayout(m,'den-basket',0,1));
 assert.equal(basket.cell,k(8,5));assert.equal(basket.search.opened,true);assert.equal(basket.search.complete,true);
 assert.equal(E.isWalkable(8,4),true);assert.equal(E.isWalkable(8,5),false);
 assert.equal(m.rooms[0].lootPoints.find(p=>p.uid===basket.uid).cell,k(8,5));
 // A moved pillar must update real sight, not only its painted sprite.
 assert.equal(g.RuinsEncounter.lineOfSight(s,k(5,5),k(5,8)),false);
 applyLayout(g,movedLayout(m,'den-column',3,2));
 assert.equal(g.RuinsEncounter.lineOfSight(s,k(5,5),k(5,8)),true);
 assert.equal(g.RuinsEncounter.lineOfSight(s,k(8,7),k(8,9)),false);
 // Rugs may lie under furniture; they do not add an invisible obstruction.
 applyLayout(g,movedLayout(m,'den-mat',0,-1));assert.equal(E.isWalkable(7,10),true);
 const saved=JSON.parse(JSON.stringify(captureLayout(m)));applyLayout(g,initial);
 assert.equal(E.isWalkable(4,9),false);assert.equal(m.workshopOpaque.has(k(5,6)),true);
 applyLayout(g,saved);assert.deepEqual(captureLayout(m),saved,'export/import and undo/redo round-trip');
 const invalid=structuredClone(saved);invalid.objects[0]=invalid.objects[1];assert.throws(()=>applyLayout(g,invalid));assert.deepEqual(captureLayout(m),saved);
 // Restoring a draft cannot bury a preview actor under furniture.
 E.setState(E.getState().mapId,4,10);const relocated=applyLayout(g,initial);assert.ok(relocated.includes('主角'));assert.ok(E.isWalkable(E.getState().x,E.getState().y));
 const snap=D.getState();assert.ok(D.validate(snap,E.getState()),'edited layout remains a valid dungeon state');D.restore(snap);
 assert.deepEqual(captureLayout(D.getSim().map),initial);assert.deepEqual(h.errors,[]);
 console.log('Layout editor: multi-cell collision, atomic rejection, loot state, LOS, rug overlap, round-trip and actor relocation pass.');
}finally{await h.close();}
