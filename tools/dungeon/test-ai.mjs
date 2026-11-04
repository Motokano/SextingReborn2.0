import assert from 'node:assert/strict';
import {boot} from './fixture.mjs';
const h=await boot(false);
try{
 const g=h.g,D=g.DungeonRuntime,N=g.RuinsEncounter;await D.ready;
 g.CharacterAttributes.setState({character_creation_completed:true});g.GameEngine.setState('M0_Field_02',7,7);assert.ok(D.enter());
 const s=D.getSim(),m=g.GameEngine.getMap(),e=s.enemies[0],rec=m.enemies[0];assert.ok(e);
 for(const d of s.doors)d.closed=false;
 const near=N.neighbours(e.cell,s.map).find(k=>g.RuinsSettlement.walkable(s.map.tiles[k])&&!s.enemies.some(n=>n.cell===k)&&![...s.harvestPoints,...s.lootPoints,...s.recoveryPoints,...s.insightPoints].some(p=>p.cell===k)&&N.lineOfSight(s,e.cell,k));assert.ok(near!=null);
 g.GameEngine.setState(D.getRun().mapId,near%s.map.width,Math.floor(near/s.map.width));D.sync();e.facing=N.direction(e.cell,near,s.map.width);
 const args={map:m,tick:1,didActThisTick:()=>false};const plan=g.CombatEnemies.updateEnemyAI(args);assert.equal(e.state,'chase');assert.ok(plan.attacks.some(a=>a.index===0));
 assert.equal(g.CombatEnemies.updateEnemyAI(args).attacks.length,0,'repeated query does not repeat the tick');
 assert.equal(g.CombatEnemies.updateEnemyAI({...args,tick:2,didActThisTick:()=>true}).attacks.length,0,'counterattack is not doubled');
 // Put the observer well outside every line of sight, with real enemy injury.
 const far=s.map.tiles.findIndex((t,k)=>g.RuinsSettlement.walkable(t)&&N.dist(k,e.cell,s.map.width)>30);assert.ok(far>=0);
 g.GameEngine.setState(D.getRun().mapId,far%s.map.width,Math.floor(far/s.map.width));
 const state=g.CombatEnemies.getDungeonState(m.map_id,0,rec.enemy_id);state.part_destroy.lhand=20;g.CombatEnemies.restoreDungeonState(m.map_id,0,rec.enemy_id,state);
 e.state='search';e.lost=3;e.lastSeen=e.cell;
 g.CombatEnemies.updateEnemyAI({...args,tick:3});assert.ok(['return','idle'].includes(e.state));assert.equal(g.CombatEnemies.getDungeonState(m.map_id,0,rec.enemy_id).part_destroy.lhand,12);
 // A crippled returner heals where it stands, then walks on its next opportunity.
 const CE=g.CombatEnemies,injury=CE.getDungeonState(m.map_id,0,rec.enemy_id);
 injury.part_destroy.lhand=0;injury.part_destroy.lfoot=injury.maxes.lfoot;
 CE.restoreDungeonState(m.map_id,0,rec.enemy_id,injury);
 e.spawn=near;e.state='return';e.returningOnce=true;const beforeCell=e.cell;
 const crippledPlan=CE.updateEnemyAI({...args,tick:4});
 assert(!crippledPlan.moves.some(a=>a.index===0));assert.equal(e.cell,beforeCell);
 assert.equal(CE.getDungeonState(m.map_id,0,rec.enemy_id).part_destroy.lfoot,injury.maxes.lfoot-8);
 assert.equal(CE.cannotMove(rec.enemy_id,m.map_id,0),false,'healed leg becomes usable');
 const restoredPlan=CE.updateEnemyAI({...args,tick:5});assert(restoredPlan.moves.some(a=>a.index===0),'returner can walk after recovery');
 for(const mv of restoredPlan.moves){m.enemies[mv.index].x=mv.toX;m.enemies[mv.index].y=mv.toY;}
 const beforeStun=CE.getDungeonState(m.map_id,0,rec.enemy_id).part_destroy.lfoot;
 CE.addEnemyStun(m.map_id,0,rec.enemy_id,100);
 CE.updateEnemyAI({...args,tick:6});assert.equal(CE.getDungeonState(m.map_id,0,rec.enemy_id).part_destroy.lfoot,beforeStun,'stunned opportunity skips return healing');
 CE.updateEnemyAI({...args,tick:7});assert.equal(CE.getDungeonState(m.map_id,0,rec.enemy_id).part_destroy.lfoot,Math.max(0,beforeStun-8));
 const w=30,at=(x,y)=>y*w+x,plain={map:{width:w,height:w,tiles:Array(w*w).fill(0)},staticTiles:Array(w*w).fill(0),doors:[],player:{cell:at(2,2),facing:2},visionProfile:{visual:3,identify:3,detail:3,adjacent:0},enemies:[4,6,8].map((x,i)=>({uid:String(i),cell:at(x,2),facing:6}))};
 plain.enemies.forEach(x=>x.facing=N.direction(x.cell,plain.player.cell,w));const sense=N.perception(plain);assert.deepEqual(Array.from(sense.known),['direct','shared',null]);
 plain.doors.push({cell:at(3,2),closed:true});assert.equal(N.sees(plain,plain.enemies[0],plain.player.cell),false);
 console.log('Actual enemy attack, counterattack deduplication, lost-sight return, real injury healing, direct support without relay and closed-door sight pass');
 assert.deepEqual(h.errors,[]);
}finally{await h.close();}
