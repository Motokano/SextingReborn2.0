import assert from 'node:assert/strict';
import {boot} from './dungeon/fixture.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import {prepareThugScene,advanceThugScene} from './fixtures/street-thug-live.mjs';
const h=await boot(false);
try{
 const g=h.g,CE=g.CombatEnemies,CMR=g.CombatMeleeResolve,D=g.DungeonRuntime,N=g.RuinsEncounter,R=g.RuinsSettlement;
 const ids=[1,2,3].map(i=>'enemy.street_thug_tier'+i),templates=ids.map(id=>CE.getById(id));
 assert.deepEqual(templates.map(t=>t.thug.skill_level),[60,80,100]);assert.deepEqual(templates.map(t=>t.thug.diqi_max),[200,300,400]);
 for(const [i,t]of templates.entries()){
  assert.equal(!!t.boss,false);assert.equal(t.actions.length,i?4:3);assert.equal(!!t.thug.dash,i===2);assert.equal(t.body_part_destroy_max.lhand,[26,39,45][i]);
  assert.ok(Math.abs(t.speed-[7.0618,9.07725,11.0927][i])<1e-8);
  assert.ok(Math.abs(t.actions[0].power_min-[7.835828,10.88398528,15.080436][i])<1e-8);
  assert.ok(Math.abs(t.actions[0].power_max-[9.710428,13.26040128,18.108636][i])<1e-8);
 }
 const mapId='thug-test',map={map_id:mapId,width:12,height:12,enemies:[{enemy_id:ids[2],x:2,y:4,dungeonUid:'veteran-test'}],blocks:[],disabled:[],portals:[],npcs:[],entities:[]};
 g.GameEngine.getMaps()[mapId]=map;g.GameEngine.setState(mapId,6,4);let tick=50;
 const sim={map:{width:12,height:12,tiles:Array(144).fill(0)},staticTiles:Array(144).fill(0),doors:[],player:{cell:54,facing:6},enemies:[{uid:'veteran-test',cell:50,facing:2,state:'chase'}],visionProfile:{visual:12,identify:12,detail:12,adjacent:1}};
 const initial=CE.getDungeonState(mapId,0,ids[2]);
 function reset(qi=100,diqi=400){CE.endWorldTurn();CE.restoreDungeonState(mapId,0,ids[2],initial);map.enemies[0].x=2;map.enemies[0].y=4;sim.enemies[0].cell=50;sim.enemies[0].facing=N.direction(50,54,12);sim.enemies[0].skipTurn=false;sim.enemies[0].cannotMove=false;sim.staticTiles.fill(0);sim.doors=[];const st=CE.getDungeonState(mapId,0,ids[2]);st.qi_current=qi;st.thug={diqi,dashReadyTick:0};CE.restoreDungeonState(mapId,0,ids[2],st);CE.beginWorldTurn(++tick);CE.dungeonTurnStatus(mapId,0,ids[2],tick);return st;}
 reset(0,0);let path=CE.tryThugDash(ids[2],mapId,0,sim,sim.enemies[0]);assert.ok(path&&path.length<=5);assert.equal(CE.getEnemyQi(ids[2],mapId,0).current,0);assert.equal(CE.thugInfo(ids[2],mapId,0).diqi,0);assert.equal(CE.thugInfo(ids[2],mapId,0).dashReadyTick,tick+6);
 const saved=CE.getDungeonState(mapId,0,ids[2]);CE.restoreDungeonState(mapId,0,ids[2],saved);assert.equal(CE.thugInfo(ids[2],mapId,0).dashReadyTick,tick+6);
 sim.enemies[0].cell=50;CE.beginWorldTurn(tick+5);assert.equal(CE.tryThugDash(ids[2],mapId,0,sim,sim.enemies[0]),null);CE.beginWorldTurn(tick+6);assert.ok(CE.tryThugDash(ids[2],mapId,0,sim,sim.enemies[0]));
 reset();sim.staticTiles[51]=6;path=CE.tryThugDash(ids[2],mapId,0,sim,sim.enemies[0]);assert.ok(path&&path.length===5,'four-step detour');assert.ok(!path.some(p=>p.x===3&&p.y===4));
 reset();for(let y=1;y<=7;y++)sim.staticTiles[y*12+3]=6;assert.equal(CE.tryThugDash(ids[2],mapId,0,sim,sim.enemies[0]),null,'detour beyond four steps');
 reset();sim.doors=[{cell:51,closed:true}];assert.equal(CE.tryThugDash(ids[2],mapId,0,sim,sim.enemies[0]),null,'closed door blocks own vision');
 reset();CE.applyEnemyDestroy(mapId,0,'lfoot',54,ids[2]);assert.equal(CE.tryThugDash(ids[2],mapId,0,sim,sim.enemies[0]),null,'disabled support leg');
 reset();CE.addEnemyStun(mapId,0,ids[2],100);assert.equal(CE.tryThugDash(ids[2],mapId,0,sim,sim.enemies[0]),null,'stun');
 reset();map.enemies[0].x=5;sim.enemies[0].cell=53;const action=templates[2].actions[0],r=CMR.resolveEnemyVsPlayerAttack({enemyId:ids[2],enemyMapId:mapId,enemyIndex:0,attackerPos:{x:5,y:4},defenderPos:{x:6,y:4},plannedAction:action});assert.equal(r.notExecuted,undefined);assert.equal(CE.thugInfo(ids[2],mapId,0).diqi,390);assert.equal(CE.getEnemyQi(ids[2],mapId,0).current,75);CMR.finishActionResources(r);assert.equal(CE.thugInfo(ids[2],mapId,0).diqi,390,'no double payment');CE.endWorldTurn();assert.equal(CE.getEnemyQi(ids[2],mapId,0).current,75);
 reset(0,0);CE.prepareBossOpportunity(ids[2],mapId,0,true,false);assert.equal(CE.pickEnemyAction(ids[2],mapId,0),null);assert.equal(CE.parryContext({enemyId:ids[2],mapId,index:0},'head').reason,'meditating');CE.endWorldTurn();assert.equal(CE.thugInfo(ids[2],mapId,0).diqi,28);assert.equal(CE.getEnemyQi(ids[2],mapId,0).current,50);
 reset(0,0);CE.prepareBossOpportunity(ids[2],mapId,0,true,false);CE.applyEnemyDestroy(mapId,0,'chest',1,ids[2]);CE.endWorldTurn();assert.equal(CE.thugInfo(ids[2],mapId,0).diqi,0,'damage interrupts meditation');
 const cfg=JSON.parse(fs.readFileSync('data/street-thug-spawn.json','utf8'));for(let n=0;n<200;n++){const count=g.DungeonPopulation.outdoorCount(cfg,'seed'+n);assert.ok(count>=10&&count<=14);assert.notEqual(g.DungeonPopulation.tier(cfg,1,'seed'+n,'enemy'+n),'tier3');}
 for(let floor=1;floor<=4;floor++){const counts={tier1:0,tier2:0,tier3:0},weights=cfg.floorWeights[floor],total=Object.values(weights).reduce((a,b)=>a+b,0);for(let n=0;n<10000;n++)counts[g.DungeonPopulation.tier(cfg,floor,'distribution-seed','resident-'+n)]++;for(const k of Object.keys(counts))assert.ok(Math.abs(counts[k]/10000-weights[k]/total)<.02,'floor '+floor+' sampling '+k);}
 const more=g.DungeonPopulation.resolve(cfg,{nonRoom:{multiplier:1.25},rooms:{add:1}});for(let n=0;n<30;n++){const count=g.DungeonPopulation.outdoorCount(more,'seed'+n);assert.ok(count>=12&&count<=18);assert.equal(g.DungeonPopulation.roomCount(more,{id:1,populationProfile:'ordinary_small'},'seed'+n),2);assert.equal(g.DungeonPopulation.roomCount(more,{id:2,outpostType:'clinic',largeRoomState:'abandoned'},'seed'+n),0);}
 // Real entry/descent and save restore exercise the new generation path.
 g.CharacterAttributes.setState({character_creation_completed:true});g.GameEngine.setState('M0_Field_02',7,7);g.RuinsSeed.create=()=>'thug-runtime-integration-v1';assert.ok(D.enter());
 for(let floor=1;floor<=4;floor++){
  const s=D.getSim(),m=s.map,b=m.populationBudget;assert.ok(b.nonRoom>=10&&b.nonRoom<=14);assert.equal(m.enemies.length,b.nonRoom+b.rooms.reduce((n,r)=>n+r.count,0)+b.bosses);assert.equal(new Set(m.enemies.map(e=>e.cell)).size,m.enemies.length);
  for(const budget of b.rooms){const room=m.rooms.find(r=>r.id===budget.roomId);assert.equal(room.enemies.length,budget.count);}
  if(floor===1)assert.ok(s.enemies.every(e=>e.enemyId!==ids[2]));
  const snapshot=D.getState(),engine=g.GameEngine.getState();assert.ok(D.validate(snapshot,engine));const before=JSON.stringify(s.enemies.map(e=>[e.uid,e.enemyId,e.cell]));D.restore(snapshot);assert.equal(JSON.stringify(D.getSim().enemies.map(e=>[e.uid,e.enemyId,e.cell])),before);
  console.log('Floor '+floor+': '+b.nonRoom+' outside, '+b.rooms.reduce((n,r)=>n+r.count,0)+' inside, '+b.bosses+' boss');
  if(floor<4){g.GameEngine.setState(D.getRun().mapId,m.exit%m.width,Math.floor(m.exit/m.width));D.sync();assert.ok(D.descend());}
 }
 // The actual world tick commits the move, emits FX, then pays for one attack.
 const scene=prepareThugScene(g,{scene:'detour'}),events=[];g.SceneAnimation.on('combat:dash',p=>events.push(p));advanceThugScene(g);
 assert.equal(events.length,1);assert.equal(events[0].path.length,5);const dash=g.CombatFxDashRuntime.getEntries()[0];assert.ok(dash);assert.equal(CE.thugInfo(scene.id,scene.mapId,0).diqi,390.5);assert.equal(CE.getEnemyQi(scene.id,scene.mapId,0).current,75);
 const actions=g.CombatFxRuntime.getActiveActions();assert.equal(actions.length,1);assert.ok(actions[0].startMs>=dash.end,'attack animation waits for landing');
 const rec=g.GameEngine.getMap().enemies[0];assert.equal(rec.x,events[0].path.at(-1).x);assert.equal(rec.y,events[0].path.at(-1).y);
 const fxArgs={cellPx:144,cellCenter:(x,y)=>({x:(x-y)*72,y:(x+y)*72/Math.SQRT2}),combatNowMs:dash.start};const offset=g.CombatFxRuntime.getPawnOffsetAt(rec.x,rec.y,'enemy',fxArgs),a=fxArgs.cellCenter(events[0].path[0].x,events[0].path[0].y),b=fxArgs.cellCenter(rec.x,rec.y);assert.ok(Math.abs(offset.x-(a.x-b.x))<1e-6);
 const prevEvents=events.length;g.CombatWorld.tickEnemiesAfterWorldTick();assert.equal(events.length,prevEvents,'same tick does not dash twice');assert.equal(CE.getEnemyQi(scene.id,scene.mapId,0).current,75);
 prepareThugScene(g,{empty:true});advanceThugScene(g);assert.equal(events.length,prevEvents+1,'empty resources still dash');assert.equal(g.CombatFxRuntime.getActiveActions().length,0,'no free attack when unable to pay');
 prepareThugScene(g,{injured:true});advanceThugScene(g);assert.equal(events.length,prevEvents+1,'injured leg blocks live dash');
 prepareThugScene(g);g.GameTime.advanceTicks(1);const actedTick=g.GameTime.getState().totalTicks;CE.beginWorldTurn(actedTick);const plan=D.updateAI({map:g.GameEngine.getMap(),tick:actedTick,didActThisTick:()=>true});assert.ok(plan.moves[0].dashPath);assert.equal(plan.attacks.length,0,'free dash cannot refresh an already-used attack');CE.endWorldTurn();
 for(let n=0;n<30;n++)assert.ok(g.DungeonPopulation.roomCount(more,{id:1,outpostType:'clinic',largeRoomState:'light'},'seed'+n)>=1,'add applies to zero lower bound');
 assert.deepEqual(h.errors,[]);console.log('PASS: three tiers, free dash/cooldown/limbs/sight/detour, costs/recovery/meditation, independent populations/save restore, real world tick and dash-to-attack FX.');
}finally{await h.close();}
