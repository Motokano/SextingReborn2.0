import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureLayout} from './street-thug-boss-room-layout-editor-model.mjs';
import {boot} from './dungeon/fixture.mjs';
import {createBossRoomBoard,installBossRoomBoard} from './street-thug-boss-room-board-layout.mjs';
const h=await boot(false);
try{
 const g=h.g;await g.DungeonRuntime.ready;g.CharacterAttributes.setState({character_creation_completed:true});
 const R=g.RuinsSettlement,N=g.RuinsEncounter,m=createBossRoomBoard(g),w=m.width,k=(x,y)=>y*w+x;
 assert.deepEqual(captureLayout(m),JSON.parse(await readFile(new URL('../assets/dungeon/street-thug-boss-room-v6/default-layout.json',import.meta.url),'utf8')),'default matches the exact user export');
 assert.equal(m.enemies.length,1);assert.equal(m.lootPoints.length,2);assert.ok(m.path.length,'closed-room bypass');
 assert.equal(m.rooms[0].inner.length,40,'compact 5x8 interior');
 assert.equal(m.bossRoomReview.clear.length,12,'continuous 3x4 fighting area');
 assert.ok(m.bossRoomReview.clear.every(c=>R.walkable(m.collision[c])),'clear floor');
 const flow=R.flood(m.collision,w,m.height,m.entry,false);assert.equal(flow.reached,m.collision.filter(R.walkable).length,'all walkable cells orthogonally connected');
 for(const p of m.lootPoints)assert.ok([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>flow.dist[p.cell+dy*w+dx]>=0),'user-placed containers have a reachable interaction side');
 assert.ok(R.flood(m.collision,w,m.height,k(7,11)).dist[m.enemies[0].cell]>=5,'boss at least five legal steps from doorway landing');
 for(const p of [...m.outpostDecor,...m.lootPoints]){
  if(p.approach===undefined)continue;
  assert.ok(flow.dist[p.approach]>=0,p.uid+' usable front is reachable');
  const [dx,dy]=p.front,cells=p.footprint||[p.cell];
  assert.ok(p.sideAccess||cells.some(c=>c+dy*w+dx===p.approach),p.uid+' reachable front or explicit side access');
  const native=p.nativeFront||[0,1],facing=p.flip?[native[1],native[0]]:native;
  assert.deepEqual(Array.from(p.front),Array.from(facing),p.uid+' sprite facing agrees with usable front');
 }
 const chair=m.outpostDecor.find(p=>p.uid==='den-chair');
 assert.equal(!!chair.flip,false,'boss chair back faces the rear wall');
 for(const pos of Object.values(m.bossRoomReview.observations))assert.ok(R.walkable(m.collision[k(...pos)]),'observation point is walkable');
 const s=installBossRoomBoard(g),D=g.DungeonRuntime,E=g.GameEngine;
 for(const c of [...m.decorBlocked,...m.lootPoints.map(p=>p.cell)])assert.equal(E.isWalkable(c%w,Math.floor(c/w)),false,'real engine blocks scenery');
 assert.equal(N.lineOfSight(s,k(5,5),k(5,8)),false,'partition end post occludes');
 assert.equal(N.lineOfSight(s,k(4,5),k(4,7)),true,'low wall allows LOS');
 assert.equal(R.canStep(s.staticTiles,w,m.height,k(5,5),k(6,6)),false,'two free endpoints cannot cut the column corner');
 assert.ok(m.rooms[0].inner.filter(c=>R.walkable(m.collision[c])).length/m.rooms[0].inner.length>=.6,'at least 60% interior remains walkable');
 const ai=D.updateAI;D.updateAI=()=>({moves:[],attacks:[]});E.setState(E.getState().mapId,5,5);
 assert.equal(E.moveTo(6,6),false,'real player movement rejects the blocked corner');
 assert.equal(E.moveTo(6,5),true,'real player movement follows the open bypass');D.updateAI=ai;
 const snap=D.getState();assert.ok(D.validate(snap,E.getState()));D.restore(snap);assert.equal(D.getSim().map.workshopOpaque.has(k(5,6)),true,'opaque pillar survives serialization');
 assert.deepEqual(Array.from(D.getSim().lootPoints.find(p=>p.uid==='den-basket').nativeFront),[1,0],'container orientation survives serialization');
 assert.deepEqual(h.errors,[]);console.log('Boss room board: clear area, connected routes, bypass, containers, real collision, LOS and state round-trip pass.');
}finally{await h.close();}
