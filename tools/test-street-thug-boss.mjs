import assert from 'node:assert/strict';
import {boot} from './dungeon/fixture.mjs';
import {resolvePreviewMove} from '../js/combat-fx-action-prototype.mjs';
const h=await boot(false),g=h.g,CE=g.CombatEnemies,R=g.CombatMeleeResolve,P=g.CombatPipeline,B=g.BuffSystem,I=g.InventoryEquipment;
const id='enemy.street_thug_boss',mapId='boss_test',plain=v=>JSON.parse(JSON.stringify(v));
const breathTransitions=[],fxEvents=[];g.SceneAnimation.on('combat:breath-state',e=>breathTransitions.push(e));g.SceneAnimation.on('combat:resolved',e=>fxEvents.push(e));
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
try{
 const t=CE.getById(id),moves=Object.fromEntries(t.actions.map(a=>[a.id,a]));
 assert.equal(CE.validateTemplates().length,0);
 approx(t.speed,13.1133);approx(t.parry_rate,.2548665165165165);approx(t.parry_damage_reduce,.3100165165165165);
 assert.deepEqual(plain(t.body_part_destroy_max),{head:60,chest:120,abdomen:90,lhand:48,rhand:60,lfoot:72,rfoot:72});
 for(const [move,[min,max]]of Object.entries({swing_punch:[20.4810144,24.2878944],poke_eye:[8.7177552,10.8115392],kick_knee:[7.9754136,11.7822936],shove:[6.4336272,12.1439472],collar_knee:[22.746108,26.552988]})){
  approx(moves[move].power_min,min);approx(moves[move].power_max,max);
 }
 assert.equal(moves.collar_knee.move_power_multiplier,undefined);
 assert.equal(moves.collar_knee.hit_segments,1);
 assert.equal(g.CombatSkills.getSkill('combat_rogue_sanda').moves.some(m=>m.id==='collar_knee'),false,'boss-exclusive move stays out of player learnable moves');
 for(const [level,min,max]of [[1,.6,.8],[2,.605,.805],[100,1.095,1.295],[120,1.195,1.395],[121,1.2,1.4],[1000,5.595,5.795],[1001,5.595,5.795]]){
  const copy=plain(t);delete copy.bossDerived;copy.boss.skill_level=level;
  g.CombatEnemyBoss.prepare(copy);
  const a=copy.actions.find(a=>a.id==='collar_knee'),profile=g.CombatSkills.getMovePowerProfile(a.skill_id,a,level);
  approx(profile.min,min);approx(profile.max,max);assert.equal(profile.levelBonus,0);
  approx(a.power_min,19.0344*min);approx(a.power_max,19.0344*max);
 }
 approx(resolvePreviewMove(moves.collar_knee,'none','collar_knee').move_power_multiplier,.7);
 const map={map_id:mapId,width:12,height:12,enemies:[{enemy_id:id,x:5,y:5}],npcs:[],portals:[],blocks:[],disabled:[],entities:[]};
 g.GameEngine.getMaps()[mapId]=map;g.GameEngine.setState(mapId,6,5);
 const walk=g.GameEngine.isWalkable;let walls=new Set();g.GameEngine.isWalkable=(x,y)=>x>=0&&y>=0&&x<12&&y<12&&!walls.has(`${x},${y}`);
 g.CharacterAttributes.setState({character_creation_completed:true,innate:{jingu:20,flexibility:20,breath:20,dexterity:20,focus:20}});
 I.getSkillsState().combat_basic_footwork={level:120,move_usage:{}};
 I.setCombatState({hubs:{footwork:'combat_basic_footwork'},limbs:{lhand:{active:'combat_basic_unarmed'},rhand:{active:'combat_basic_unarmed'},lfoot:{active:'combat_basic_unarmed'},rfoot:{active:'combat_basic_unarmed'}}});
 const initial=CE.getDungeonState(mapId,0,id);let tick=0;
 function info(){return CE.getDungeonState(mapId,0,id);}
 function boss(){return CE.bossInfo(id,mapId,0);}
 function reset(b={}){
  CE.endWorldTurn();CE.restoreDungeonState(mapId,0,id,initial);
  for(const owner of ['player',CE.getOwnerId(id,mapId,0)])for(const b of B.getState().instancesByOwner[owner]||[])B.removeBuffByBuffId(owner,b.buff_id);
  const s=info();s.boss={...boss(),...b};CE.restoreDungeonState(mapId,0,id,s);
  map.enemies[0].x=5;map.enemies[0].y=5;walls.clear();g.GameEngine.setState(mapId,6,5);
  g.Survival.setState({isDead:false,pain_value:0});I.setPlayerStunValue(0);
  for(const part of ['head','chest','abdomen','lhand','rhand','lfoot','rfoot'])g.CharacterAttributes.recoverPartDestroy(part,100000);
 }
 function begin(){CE.beginWorldTurn(++tick);CE.dungeonTurnStatus(mapId,0,id,tick);}
 function resolve(move,extra={}){g.Math.random=()=>.1;return R.resolveEnemyVsPlayerAttack({enemyId:id,enemyMapId:mapId,enemyIndex:0,...(move?{plannedAction:moves[move]}:{}),...extra});}
 function pipeline(r,dry=false,roll=.99){g.Math.random=()=>roll;const c=g.CombatWorld.buildEnemyCounterAtkCtx(r,dry,{enemyId:id,ex:5,ey:5,px:6,py:5});return P.runPipeline('melee_hit_player_defender',c);}
 function buff(id,n=1){B.setBuffStacks('player',id,n);}
 // Real random damage keeps decimals, retains burst and never rerolls on deferred payment.
 const originalRandom=g.Math.random;
 for(const burst of [false,true])for(const dry of [false,true])for(const unit of [0,.5,1-Number.EPSILON]){
  g.Math.random=originalRandom;reset({burstRemaining:burst?3:0});begin();buff('buff_off_balance');
  let draws=0;g.Math.random=()=>++draws===3?unit:0;
  const r=R.resolveEnemyVsPlayerAttack({enemyId:id,enemyMapId:mapId,enemyIndex:0,plannedAction:moves.collar_knee,deferResourceSpend:dry});
  assert.equal(draws,3,'hit, body part and one coefficient draw');
  approx(r.rawDamage,(22.746108+3.80688*unit)*(burst?1.8:1));
  g.Math.random=()=>{throw Error('deferred commit must not reroll');};
  if(dry){assert.equal(boss().diqi,500);R.applyDeferredResourceSpendFromResolveResult(r);R.applyDeferredResourceSpendFromResolveResult(r);}
  assert.equal(boss().diqi,479);assert.equal(info().qi_current,75);
 }
 g.Math.random=originalRandom;
 reset();begin();assert.equal(boss().diqi,500);assert.equal(CE.pickEnemyAction(id,mapId,0).id,'poke_eye');
 buff('buff_dazzled');assert.equal(CE.pickEnemyAction(id,mapId,0).id,'kick_knee');
 buff('buff_limping');assert.equal(CE.pickEnemyAction(id,mapId,0).id,'swing_punch');
 walls.add('7,5');assert.equal(CE.pickEnemyAction(id,mapId,0).id,'shove');
 buff('buff_off_balance');assert.equal(CE.pickEnemyAction(id,mapId,0).id,'collar_knee');
 const before=plain(info());for(let i=0;i<5;i++)CE.pickEnemyAction(id,mapId,0);assert.deepEqual(plain(info()),before,'queries never replenish resources');
 const owner=CE.getOwnerId(id,mapId,0);B.setBuffStacks(owner,'buff_limping',1);approx(g.CombatInitiative.effectiveSpeed(owner,t.speed),t.speed-.2);B.setBuffStacks(owner,'buff_limping',0);
 const knee=resolve('collar_knee');approx(knee.rawDamage,23.126796);assert.equal(boss().diqi,479);assert.equal(info().qi_current,75);assert.equal(boss().kneeReadyTick,tick+6);assert.equal(B.getBuffStacksSum('player','buff_off_balance'),0);
 buff('buff_off_balance');assert.equal(CE.actionStatus(id,mapId,0,moves.collar_knee).reason,'knee_cooldown');CE.endWorldTurn();assert.equal(info().qi_current,75);approx(boss().diqi,479.6);
 begin();CE.endWorldTurn();assert.equal(info().qi_current,100,'idle world tick regenerates qi');
 reset();begin();buff('buff_off_balance');const plan=CE.planAction(id,mapId,0);CE.applyEnemyDestroy(mapId,0,'lhand',48,id);
 assert.equal(resolve('collar_knee').notExecuted,true);assert.equal(boss().diqi,500);assert.equal(boss().kneeReadyTick,0);assert.equal(B.getBuffStacksSum('player','buff_off_balance'),1);
 assert.deepEqual(Array.from(plan.occupiedLimbs),['rfoot','lhand','lfoot']);
 reset();begin();buff('buff_off_balance');g.GameEngine.setState(mapId,9,5);const miss=resolve('collar_knee');assert.equal(miss.hitRollSuccess,false);assert.equal(boss().diqi,479,'locked distance whiff still pays');
 reset();begin();const normal=pipeline({...resolve('swing_punch'),hitPart:'chest'},true);
 reset();begin();buff('buff_off_balance');const q=resolve('collar_knee',{deferResourceSpend:true}),dry=pipeline({...q,hitPart:'chest'},true);
 assert.equal(boss().diqi,500);assert.equal(B.getBuffStacksSum('player','buff_off_balance'),1);
 approx(dry.parryChance,normal.parryChance);approx(dry.unloadRatio,normal.unloadRatio*.5);
 R.applyDeferredResourceSpendFromResolveResult(q);R.finishActionResources(q);assert.equal(boss().diqi,479,'deferred resources commit exactly once');
 reset();begin();const eye=pipeline(resolve('poke_eye'),false,0);assert.equal(eye.parrySucceeded,true);assert.equal(B.getBuffStacksSum('player','buff_dazzled'),1,'parry does not block on-hit-roll debuff');
 reset();let count=0;while(count<8){begin();for(let n=0;n<4;n++){const r=resolve('swing_punch');if(r.notExecuted)break;count++;}CE.endWorldTurn();}
 assert.equal(boss().charge,200);assert.equal(boss().burstRemaining,0);assert.equal(boss().warningTick,tick);
 assert.equal(breathTransitions.at(-1).phase,'warning','eighth paid boss attack emits the real warning');
 assert.equal(resolve('swing_punch').notExecuted,true,'no ninth strike in warning tick');
 CE.beginWorldTurn(tick);{const s=info();s.qi_current=100;CE.restoreDungeonState(mapId,0,id,s);}assert.equal(resolve('swing_punch').skipReason,'burst_warning','warning blocks the current tick even with available qi');
 begin();CE.prepareBossOpportunity(id,mapId,0,true,false);assert.equal(boss().burstRemaining,3);assert.equal(info().qi_current,100);
 assert.equal(breathTransitions.at(-1).phase,'activate','legal next-tick opportunity emits activation');
 const burstStart=boss().diqi;for(let i=0;i<3;i++){const r=resolve('swing_punch');approx(r.rawDamage,37.55106432);assert.ok(r.breathBurst);assert.equal(r.breathBurst.remainingAttacks,3-i);pipeline({...r,hitRollSuccess:false,distanceMiss:true});assert.equal(fxEvents.at(-1).breath.remainingAfter,2-i,'real boss pipeline publishes each burst commitment exactly once');assert.equal(fxEvents.at(-1).attacker.ownerId,info().ownerId);}
 approx(boss().diqi,burstStart-42);assert.equal(boss().burstRemaining,0);assert.equal(boss().charge,0,'burst attacks do not recharge themselves');
 reset({diqi:42,burstRemaining:3});begin();buff('buff_off_balance');assert.notEqual(CE.pickEnemyAction(id,mapId,0).id,'collar_knee','reserve ordinary costs for all remaining burst attacks');
 reset({charge:200,warningTick:0});begin();CE.prepareBossOpportunity(id,mapId,0,true,false,false);assert.equal(boss().burstRemaining,0,'searching without current sight cannot activate an attack');
 reset({diqi:20,charge:200,warningTick:0});begin();assert.equal(CE.planAction(id,mapId,0).action,null);CE.endWorldTurn();assert.equal(boss().diqi,58);begin();CE.prepareBossOpportunity(id,mapId,0,true,false);assert.equal(boss().burstRemaining,3,'ready burst meditates to the 42-cost reserve first');
 reset({diqi:10});begin();assert.equal(CE.planAction(id,mapId,0).action,null);assert.equal(CE.parryContext({enemyId:id,mapId,index:0},'chest').reason,'meditating');CE.endWorldTurn();assert.equal(boss().diqi,48);
 reset({diqi:10});begin();CE.planAction(id,mapId,0);CE.applyEnemyDestroy(mapId,0,'abdomen',1,id);CE.endWorldTurn();assert.equal(boss().diqi,10,'effective damage interrupts meditation without natural regen fallback');
 reset({burstRemaining:3});begin();g.GameEngine.setState(mapId,7,5);const charge=resolve();assert.equal(charge.notExecuted,undefined);assert.equal(map.enemies[0].x,6);assert.ok(charge.breathBurst);
 reset({burstRemaining:3});begin();g.GameEngine.setState(mapId,7,5);walls.add('6,5');assert.equal(resolve().notExecuted,true);assert.equal(boss().diqi,500);assert.equal(boss().burstRemaining,3);
 reset({burstRemaining:3});begin();walls.add('7,5');const collision=pipeline({...resolve('shove'),hitPart:'abdomen'});assert.equal(g.CharacterAttributes.getPartDestroy('abdomen'),collision.finalDamage+Math.floor(collision.finalDamage*.3));assert.equal(I.getPlayerStunValue(),50,'ordinary shove plus burst collides once');
 reset({burstRemaining:3});begin();const parriedBurst=pipeline({...resolve('shove'),hitPart:'abdomen'},false,0);assert.equal(parriedBurst.parrySucceeded,true);assert.equal(g.GameEngine.getState().x,7,'burst knockback survives successful parry');
 reset();begin();CE.addEnemyStun(mapId,0,id,100);assert.equal(resolve('swing_punch').notExecuted,true);assert.equal(boss().diqi,500,'stunned attack is canceled without cost');
 reset();begin();CE.applyEnemyDestroy(mapId,0,'lfoot',72,id);CE.applyEnemyDestroy(mapId,0,'rfoot',72,id);assert.equal(CE.cannotMove(id,mapId,0),true);assert.equal(CE.actionStatus(id,mapId,0,moves.kick_knee).ok,false);assert.equal(CE.actionStatus(id,mapId,0,moves.shove).ok,true,'hands remain usable with disabled legs');
 reset({diqi:123.4,charge:175,kneeReadyTick:tick+6});begin();CE.setShieldRemaining(mapId,0,id,7);CE.applyEnemyDestroy(mapId,0,'lfoot',72,id);
 const snapshot=CE.getState();CE.setState(snapshot);approx(boss().diqi,123.4);assert.equal(CE.getShieldRemaining(mapId,0,id),7);assert.equal(info().part_destroy.lfoot,72);
 CE.prepareBossOpportunity(id,mapId,0,false,false);assert.equal(boss().charge,0);assert.equal(boss().burstRemaining,0);approx(boss().diqi,123.4);
 CE.endWorldTurn();g.GameEngine.isWalkable=walk;
 // Exercise formal generation, descent, save/load and optional withdrawal, not a separate prototype.
 const D=g.DungeonRuntime;await D.ready;D.config().boss.spawnChance=1;g.GameEngine.setState('M0_Field_02',7,7);assert.ok(D.enter());
 for(let floor=1;floor<4;floor++){assert.equal(g.GameEngine.getMap().enemies.filter(e=>e.enemy_id===id).length,0);const s=D.getSim();g.GameEngine.setState(D.getRun().mapId,s.map.exit%s.map.width,Math.floor(s.map.exit/s.map.width));D.sync();assert.ok(D.descend());}
 const s=D.getSim(),bossIndex=g.GameEngine.getMap().enemies.findIndex(e=>e.enemy_id===id);assert.ok(bossIndex>=0);assert.equal(s.enemies.filter(e=>e.enemyId===id).length,1);
 assert.ok(s.map.boss.optional&&s.map.boss.bypass.length);assert.ok(s.doors.find(d=>d.roomId===s.map.boss.roomId).closed);
 const mid=D.getRun().mapId;CE.setShieldRemaining(mid,bossIndex,id,3);const savedBoss=CE.getDungeonState(mid,bossIndex,id);savedBoss.boss={...CE.bossInfo(id,mid,bossIndex),diqi:211,charge:175,kneeReadyTick:12345};CE.restoreDungeonState(mid,bossIndex,id,savedBoss);
 const denLayout=plain(s.map.bossRoom),denLoot=s.lootPoints.find(p=>p.assetId==='den-private');denLoot.search.opened=true;
 const denDoor=s.doors.find(d=>d.roomId===s.map.boss.roomId);denDoor.closed=false;
 const save=g.SaveSystem.buildSnapshotForDebug();assert.ok(g.SaveSystem.applySnapshotForDebug(save));assert.equal(CE.bossInfo(id,mid,bossIndex).diqi,211);assert.equal(CE.getShieldRemaining(mid,bossIndex,id),3);
 assert.deepEqual(plain(D.getSim().map.bossRoom),denLayout,'fixed layout persists without regeneration');assert.equal(D.getSim().lootPoints.find(p=>p.uid===denLoot.uid).search.opened,true,'search state survives');assert.equal(D.getSim().doors.find(d=>d.cell===denDoor.cell).closed,false,'door state survives');
 assert.equal(g.CombatFxRuntime.getActiveActions().length,0,'loading clears the previous visual action queue');assert.equal(g.CombatFxBreathRuntime.inspect().length,0,'loading clears previous aura clocks');
 // The actual scene exchange uses the same logical turn as the following world tick.
 const arena=D.getSim(),record=g.GameEngine.getMap().enemies[bossIndex],foe=arena.enemies.find(e=>e.uid===record.dungeonUid);
 const near=g.RuinsEncounter.neighbours(foe.cell,arena.map).find(k=>D.walkable(k%arena.map.width,Math.floor(k/arena.map.width))&&!arena.enemies.some(e=>e.cell===k)&&g.RuinsEncounter.lineOfSight(arena,foe.cell,k));assert.ok(near!=null);
 g.GameEngine.setState(mid,near%arena.map.width,Math.floor(near/arena.map.width));D.sync();
 for(const part of ['head','chest','abdomen','lhand','rhand','lfoot','rfoot'])g.CharacterAttributes.recoverPartDestroy(part,100000);
 g.Survival.setState({isDead:false,qi_li_current:100,diqi_current:200});I.setPlayerStunValue(0);
 for(const b of B.getState().instancesByOwner.player||[])B.removeBuffByBuffId('player',b.buff_id);
 I.setCombatState({hubs:{footwork:'combat_basic_footwork'},limbs:{lhand:{active:'combat_basic_unarmed'},rhand:{active:'combat_basic_unarmed'},lfoot:{active:'combat_basic_unarmed'},rfoot:{active:'combat_basic_unarmed'}},move_sequences:{lhand:['jab'],rhand:['jab'],lfoot:['front_kick'],rfoot:['front_kick']},limb_strike_order:['lhand','rhand','lfoot','rfoot'],limb_strike_order_cursor:0});
 const ready=CE.getDungeonState(mid,bossIndex,id);ready.qi_current=100;ready.boss.charge=0;ready.boss.warningTick=null;CE.restoreDungeonState(mid,bossIndex,id,ready);
 const clock=g.GameTime.getState().totalTicks;g.Math.random=()=>.1;
 g.SceneCtx.actions.attackEnemy(id,{x:record.x,y:record.y,fromX:near%arena.map.width,fromY:Math.floor(near/arena.map.width)});
 assert.equal(g.GameTime.getState().totalTicks,clock+1);assert.equal(CE.getEnemyQi(id,mid,bossIndex).current,75,'counter is not immediately regenerated or repeated by the world tick');
 approx(CE.bossInfo(id,mid,bossIndex).diqi,197.6);assert.equal(CE.bossInfo(id,mid,bossIndex).charge,25);
 const loaded=D.getSim();g.GameEngine.setState(mid,loaded.map.exit%loaded.map.width,Math.floor(loaded.map.exit/loaded.map.width));D.sync();assert.ok(D.withdraw(),'living boss never gates withdrawal');
 assert.equal(D.getRun().status,'settled');assert.deepEqual(h.errors,[]);
 console.log('Street thug boss: exact stats, conditional AI, limb cancellation, fixed costs, cooldown, parry/buffs, meditation, burst, charge paths, save/load, optional floor-four exit pass');
}finally{await h.close();}
