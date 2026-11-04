// Isolated review/test fixture. Decisions, movement, payments and FX use the game.
export function prepareThugScene(g,{scene='straight',tier=3,empty=false,injured=false}={}){
 const D=g.DungeonRuntime,E=g.GameEngine,CE=g.CombatEnemies,N=g.RuinsEncounter,R=g.RuinsSettlement;
 if(!D.active()){g.CharacterAttributes.setState({character_creation_completed:true});g.Survival.setState({isDead:false});E.setState('M0_Field_02',7,7);if(!D.enter())throw Error('试场地牢生成失败');}
 const s=D.getSim(),m=s.map,w=m.width;
 if(s.dashCheckObstacle!==undefined)s.staticTiles[s.dashCheckObstacle]=m.tiles[s.dashCheckObstacle];
 m.outpostDecor=(m.outpostDecor||[]).filter(p=>p.uid!=='dash-check-obstacle');
 const points=[...s.lootPoints,...s.harvestPoints,...s.recoveryPoints,...s.insightPoints];
 let origin=-1;
 for(let y=5;y<m.height-5&&origin<0;y++)for(let x=5;x<w-8;x++){
  const cells=[];for(let dy=-2;dy<=2;dy++)for(let dx=-1;dx<=5;dx++)cells.push((y+dy)*w+x+dx);
  if(cells.every(k=>R.walkable(s.staticTiles[k])&&m.owner[k]<0)&&!points.some(p=>cells.includes(p.cell))&&!s.doors.some(d=>cells.includes(d.cell))){origin=y*w+x;break;}
 }
 if(origin<0)throw Error('没有找到开放试招区域');
 // Reset the fixture obstacle from a previous run without touching generated props.
 const goal=origin+4,id='enemy.street_thug_tier'+tier,uid='live-thug-'+tier;
 const actor={uid,enemyId:id,cell:origin,spawn:origin,spawnFacing:2,facing:2,state:'chase',lost:0,lastSeen:goal,injury:0,healPerTick:8,healed:0,returningOnce:false};
 s.enemies=[actor];const map=E.getMap();map.enemies=[{enemy_id:id,x:origin%w,y:Math.floor(origin/w),dungeonUid:uid}];
 E.setState(map.map_id,goal%w,Math.floor(goal/w));g.SceneCtx.setFacingDir(6);s.player.cell=goal;s.player.facing=6;
 const saved=CE.getDungeonState(map.map_id,0,id);saved.dead=false;saved.stunned=false;saved.stun_value=0;saved.last_turn_tick=-1;saved.qi_current=empty?0:100;saved.part_destroy=Object.fromEntries(['head','chest','abdomen','lhand','rhand','lfoot','rfoot'].map(k=>[k,0]));saved.thug={diqi:empty?0:CE.getById(id).thug.diqi_max,dashReadyTick:0};CE.restoreDungeonState(map.map_id,0,id,saved);
 if(injured)CE.applyEnemyDestroy(map.map_id,0,'lfoot',CE.getById(id).body_part_destroy_max.lfoot,id);
 s.dashCheckObstacle=scene==='detour'?origin+1:undefined;if(s.dashCheckObstacle!==undefined){s.staticTiles[s.dashCheckObstacle]=6;m.outpostDecor.push({uid:'dash-check-obstacle',cell:s.dashCheckObstacle,kind:'tire-pair',solid:true});}
 for(const part of Object.keys(saved.part_destroy))g.CharacterAttributes.recoverPartDestroy(part,10000);
 g.Survival.setState({isDead:false,qi_li_current:100,diqi_current:1000});g.InventoryEquipment.setPlayerStunValue(0);
 g.BuffSystem.clearOwnerBuffs?.('player');g.CombatWorld.resetTransientState();g.CombatFxRuntime.clear();D.refresh();
 return {id,mapId:map.map_id,origin,goal,actor,obstacle:s.dashCheckObstacle};
}
export function advanceThugScene(g){g.GameTime.advanceTicks(1);g.CombatWorld.tickEnemiesAfterWorldTick();g.DungeonRuntime.refresh();}
