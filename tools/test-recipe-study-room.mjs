import assert from 'node:assert/strict';
import {boot} from './dungeon/fixture.mjs';
const h=await boot(false),plain=v=>JSON.parse(JSON.stringify(v));
try{
 const g=h.g,D=g.DungeonRuntime,Q=g.RuinsRecipeStudy,E=g.GameEngine;
 await D.ready;
 const rules={...D.config().content.recipeStudy,enabled:true,chance:.03};
 const totals=[0,0,0,0,0];
 for(let i=0;i<100000;i++)totals[Q.plan('rarity-audit-'+i,1,4,rules).floor]++;
 assert.ok(totals[0]>=96700&&totals[0]<=97300,JSON.stringify(totals));
 for(const n of totals.slice(1))assert.ok(n>600&&n<900,JSON.stringify(totals));
 assert.equal(Q.plan('off',1,4,{...rules,chance:0}).floor,0);
 assert.equal(Q.plan('disabled',1,4,{...rules,enabled:false,chance:1}).floor,0);
 for(let i=0;i<100;i++)assert.ok(Q.plan('ticket-'+i,3,4,{...rules,chance:1}).floor>=3);
 const forced={...rules,chance:1};
 const seed=Array.from({length:100},(_,i)=>'study-room-review-'+i).find(s=>Q.plan(s,1,4,forced).floor===2);
 D.config().content.recipeStudy=forced;
 g.CharacterAttributes.setState({character_creation_completed:true});E.setState('M0_Field_02',7,7);
 g.RuinsSeed.create=()=>seed;
 // Make the first geometry attempt fail: it must reuse the same expedition decision.
 const generate=g.RuinsRooms.generate;let failOnce=true;const plans=[];
 g.RuinsRooms.generate=(...args)=>{plans.push(plain(args[3].studyPlan));if(failOnce){failOnce=false;throw Error('fixture geometry retry');}return generate(...args);};
 assert.ok(D.enter());const locked=plain(D.getRun().recipeStudyPlan);assert.equal(locked.floor,2);
 const descend=()=>{const s=D.getSim();s.enemies=[];E.getMap().enemies=[];for(const door of s.doors)door.closed=false;E.setState(D.getRun().mapId,s.map.exit%s.map.width,Math.floor(s.map.exit/s.map.width));D.sync();assert.ok(D.descend());};
 let seen=0;
 for(let floor=1;floor<=4;floor++){
  const s=D.getSim(),m=s.map,points=s.insightPoints.filter(Q.isPoint);seen+=points.length;
  assert.equal(points.length,floor===2?1:0);
  assert.deepEqual(plain(D.getRun().recipeStudyPlan),locked);
  if(points.length){
   const p=points[0],r=m.rooms.find(r=>r.id===p.roomId);
   assert.ok(r.recipeStudyRoom);assert.equal(r.inner.length,12);assert.equal(r.cells.length,30);
   assert.equal(r.enclosure,'intact');assert.equal(r.hasDoor,true);assert.equal(r.doorMaterial,'wood');
   assert.equal(m.tiles[p.cell-m.width],1);assert.ok(p.access.includes(p.cell+m.width));
   assert.ok(!m.enemies.some(e=>e.roomId===r.id));
   assert.ok(![...m.resources,...m.lootPoints,...m.recoveryPoints].some(p=>p.roomId===r.id));
   assert.equal(r.insightPoints.length,1);assert.ok(m.path.length);
   const decor=m.outpostDecor.filter(p=>p.roomId===r.id);assert.equal(decor.length,3);
   assert.equal(r.studyDecorVersion,1);assert.equal(r.inner.filter(k=>g.RuinsSettlement.walkable(s.staticTiles[k])).length,8);
   assert.deepEqual(plain(decor.map(p=>p.kind)).sort(),['study-art-archive-shelf','study-art-drawing-rolls','study-art-patched-stool'].sort());
   for(const item of decor){assert.ok(m.decorBlocked.has(item.cell));assert.equal(s.staticTiles[item.cell],6);assert.ok(D.blocked(item.cell%m.width,Math.floor(item.cell/m.width)));assert.ok(!p.access.includes(item.cell));}
   assert.ok(g.RuinsSettlement.walkable(s.staticTiles[r.door-m.width]));
   const layout=plain(decor);Q.decorate(m);assert.deepEqual(plain(m.outpostDecor.filter(p=>p.roomId===r.id)),layout,'furnishing is idempotent');
   const saved=g.SaveSystem.buildSnapshotForDebug();assert.ok(g.SaveSystem.applySnapshotForDebug(saved));
   assert.deepEqual(plain(D.getSim().map.outpostDecor.filter(p=>p.roomId===r.id)),layout,'save/reload preserves furnishing');
   for(const item of decor)assert.ok(D.blocked(item.cell%m.width,Math.floor(item.cell/m.width)));
   const bad=plain(saved);bad.dungeon.run.recipeStudyPlan.floor=3;assert.equal(g.SaveSystem.applySnapshotForDebug(bad),false);
   D.config().content.recipeStudy={...rules,enabled:false};
   const current=D.getSim(),desk=current.insightPoints.find(Q.isPoint);current.enemies=[];E.getMap().enemies=[];
   for(const door of current.doors)door.closed=false;
   E.setState(D.getRun().mapId,desk.access[0]%m.width,Math.floor(desk.access[0]/m.width));g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(desk.access[0],desk.cell,m.width));D.sync();
   assert.ok(D.begin('recipe',desk.uid));assert.ok(D.completeTick());assert.ok(desk.used);assert.ok(g.ManufacturingKnowledge.knows(desk.learnedRecipeId));
  }
  if(floor<4)descend();
 }
 assert.equal(seen,1);assert.ok(plans.length>=5);assert.ok(plans.every(p=>JSON.stringify(p)===JSON.stringify(locked)));
 assert.deepEqual(h.errors,[]);
 console.log(JSON.stringify({expeditions:100000,appearanceRate:(100000-totals[0])/1000+'%',floors:totals.slice(1),runtime:'single room across four floors, retry, save/reload, range snapshot and recipe award pass',previewSeed:seed}));
}finally{await h.close();}
