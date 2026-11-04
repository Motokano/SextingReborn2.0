import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './fixture.mjs';
// The actual clock supplies new runs, including simultaneous requests.
let clock=1793000000123;const ctx=vm.createContext({Date:{now:()=>clock}});
vm.runInContext(fs.readFileSync('js/dungeon/seed.js','utf8'),ctx);
assert.equal(ctx.RuinsSeed.create(),'ruins-1793000000123-0');
assert.equal(ctx.RuinsSeed.create(),'ruins-1793000000123-1');clock+=1000;
assert.equal(ctx.RuinsSeed.create(),'ruins-1793000001123-0');
const h=await boot(false);try{
 const g=h.g,D=g.DungeonRuntime,E=g.GameEngine,R=g.RuinsSettlement,N=g.RuinsEncounter;
 await D.ready;g.CharacterAttributes.setState({character_creation_completed:true});E.setState('M0_Field_02',7,7);
 const before=Date.now();assert.ok(D.enter());const after=Date.now(),seed=D.getRun().seed,ms=Number(seed.split('-')[1]);assert.ok(ms>=before&&ms<=after);
 let s=D.getSim(),m=s.map;assert.equal(D.getRun().content.version,D.config().content.version);assert.ok(m.woodland&&m.outposts.length);
 const setKeys=['sceneryBlocked','decorBlocked','largeRoomBlocked','workshopBlocked','workshopOpaque','workshopWalls','clinicBlocked','clinicOpaque','clinicWalls','canteenBlocked','canteenOpaque','canteenWalls'];
 const sets=Object.fromEntries(setKeys.map(k=>[k,[...(m[k]||[])]])),floors=JSON.stringify([...m.outpostFloor]);
 const collision=JSON.stringify(s.staticTiles),signature=m.mixedSignature;
 for(const key of ['sceneryBlocked','decorBlocked','workshopBlocked','clinicBlocked','canteenBlocked'])for(const k of m[key]||[]){assert.equal(E.isWalkable(k%m.width,Math.floor(k/m.width)),false,key);assert.equal(D.blocked(k%m.width,Math.floor(k/m.width)),true);}
 assert.equal(R.flood(m.collision,m.width,m.height,m.entry).reached,m.collision.filter(R.walkable).length);
 for(const k of m.sceneryBlocked){assert.ok(['moss','litter'].includes(m.woodland.ground[k]));}
 const door=s.doors[0];if(door){E.setState(D.getRun().mapId,door.outside%m.width,Math.floor(door.outside/m.width));D.sync();assert.equal(N.lineOfSight(s,door.outside,door.inside),false);assert.ok(D.openDoor(door.cell));assert.equal(N.lineOfSight(s,door.outside,door.inside),true);}
 const snap=g.SaveSystem.buildSnapshotForDebug();const wire=JSON.parse(JSON.stringify(snap));assert.equal(D.validate(wire.dungeon,wire.player.engine),true);assert.ok(g.SaveSystem.applySnapshotForDebug(wire));
 s=D.getSim();m=s.map;assert.equal(D.getRun().seed,seed);assert.equal(m.mixedSignature,signature);assert.equal(JSON.stringify(s.staticTiles),collision);assert.equal(JSON.stringify([...m.outpostFloor]),floors);
 for(const key of setKeys){assert.ok(m[key] instanceof g.Set,key);assert.deepEqual([...m[key]],sets[key]);}
 if(door)assert.equal(s.doors.find(d=>d.cell===door.cell).closed,false);
 // Every render path runs after hydration with all geometry, without images.
 const paint=g.document.createElement('canvas').getContext('2d'),pr=g.MapProjection.create(E.getMap(),101);
 for(const a of [...m.outpostDecor,...m.workshopObstacles,...m.clinicObstacles,...m.canteenObstacles])g.DungeonArt.object(paint,a.cell%m.width,Math.floor(a.cell/m.width),pr);
 g.DungeonArt.ground(paint,pr);
 const malformed=structuredClone(wire);malformed.dungeon.sim.map.decorBlocked=[-1];assert.equal(g.SaveSystem.applySnapshotForDebug(malformed),false);
 const ie=g.InventoryEquipment,level=n=>{const v=ie.getState();v.skills.survival_search={level:n};ie.setState(v);};
 for(const [n,p]of [[0,.4],[50,.3],[100,.2],[200,0],[500,0]]){level(n);assert.ok(Math.abs(D.containerEmptyChance()-p)<1e-9);}
 level(50);assert.equal(D.rolls('container',0,()=>.29),0);assert.equal(D.rolls('container',0,()=>.31),1);
 const draws=[.9,.1,.9,.31,.1];assert.equal(D.rolls('container',1,()=>draws.shift()),1,'extra quantity round can rescue empty container');
 const p={contentWeights:{food:6,misc:1}},W=g.RuinsContainerProfiles.itemWeight;assert.equal(W(p,'food',10,{eligible:true}),60);assert.equal(W(p,'misc',10,{eligible:true}),10);assert.equal(W(p,'food',10),0);
 const at=k=>E.setState(D.getRun().mapId,k%s.map.width,Math.floor(k/s.map.width));at(s.map.exit);assert.ok(D.descend());assert.equal(D.getRun().seed,seed);assert.equal(D.getSim().map.floor,2);
 console.log('Time seed, V13 real collision, obstacle/ground save hydration, one-way doors, skill empty rates, category weights and cross-floor seed pass');
 assert.deepEqual(h.errors,[]);
}finally{await h.close();}
