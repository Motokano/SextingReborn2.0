// Hand-authored review fixture. Uses the real dungeon cell/LOS/collision model;
// it does not participate in random floor generation.
let reviewSerial=0;
export function createBossRoomBoard(g){
 const w=16,h=17,cell=(x,y)=>y*w+x,R=g.RuinsSettlement;
 const m={seed:'factory-den-board-v6',preset:'city',floor:4,width:w,height:h,
  tiles:Array(w*h).fill(R.VOID),owner:Array(w*h).fill(-1),road:Array(w*h).fill(0),
  rooms:[],buildings:[],enemyRooms:[],outposts:[],doors:[],enemies:[],resources:[],lootPoints:[],recoveryPoints:[],insightPoints:[],trees:[],outpostDecor:[],
  outpostFloor:new g.Map(),decorBlocked:new g.Set(),sceneryBlocked:new g.Set(),workshopBlocked:new g.Set(),workshopOpaque:new g.Set(),workshopWalls:new g.Set(),
  entry:cell(2,14),exit:cell(11,14),contentConfig:g.RuinsContentConfig.resolve(),
  bossRoomReview:{clear:[],lowWalls:[],columns:[],rubble:[],start:cell(7,9),bounds:[3,3,9,12],
   observations:{entrance:[7,13],center:[7,9],back:[5,5],pillar:[6,6],rack:[5,10]}}};
 for(let y=2;y<=14;y++)for(let x=2;x<=10;x++){m.tiles[cell(x,y)]=0;if(y>=13||x===2||x===10)m.road[cell(x,y)]=1;}
 m.tiles[m.exit]=0;m.road[m.exit]=1;
 const prefab=g.DungeonBossRoomTemplate.stamp(m,[3,3],1),room=prefab.room;
 m.bossRoom=prefab.meta;m.bossRoomReview.bounds=prefab.meta.bounds;m.bossRoomReview.clear=prefab.meta.clear;
 m.rooms=[room];m.buildings=[room];m.enemyRooms=[room];m.outposts=[room];m.doors=[room.door];
 m.outpostDecor=prefab.decor;m.lootPoints=prefab.points;m.enemies=[prefab.enemy];
 for(const k of room.inner)m.outpostFloor.set(k,{kind:'concrete',span:4});
 for(const p of prefab.decor){
  if(p.solid)for(const k of p.footprint)m.decorBlocked.add(k);
  if(p.opaque)for(const k of p.footprint)m.workshopOpaque.add(k);
  if(p.shape==='column')m.bossRoomReview.columns.push(p.cell);
  if(p.shape==='lowwall')m.bossRoomReview.lowWalls.push(p.cell);
  if(p.kind==='den-rubble')m.bossRoomReview.rubble.push(p.cell);
 }
 m.collision=m.tiles.slice();for(const k of m.decorBlocked)m.collision[k]=6;for(const p of m.lootPoints)m.collision[p.cell]=6;
 m.patrolTiles=m.collision.slice();m.path=R.route(R.closedPassages(m),w,h,m.entry,m.exit);
 m.boss={uid:'den-boss',roomId:1,enemyId:'enemy.street_thug_boss',optional:true,bypass:m.path};
 return m;
}

export function installBossRoomBoard(g){
 const D=g.DungeonRuntime,E=g.GameEngine,m=createBossRoomBoard(g),s=g.RuinsEncounter.create(m);
 s.formalRuntime=true;s.corpses=[];s.bag=[];s.player.cell=m.bossRoomReview.start;s.player.facing=0;s.doors[0].closed=false;s.doors[0].material='iron';
 const mapId='dungeon_boss_room_review_'+(++reviewSerial)+'_4',enemyState=g.CombatEnemies.getDungeonState(mapId,0,'enemy.street_thug_boss');
 const data={version:1,run:{id:'boss-room-review',mapId,status:'active',seed:m.seed,startFloor:4,content:m.contentConfig,returnTo:{mapId:'M0_Field_02',x:7,y:7},quantityBonus:0,actionCostMultiplier:1,records:[],marked:[]},sim:s,pool:{batches:{},remaining:[]},recovered:[],meals:[],receipt:null,enemyState:[enemyState]};
 data.run.recipeStudyPlan=g.RuinsRecipeStudy.plan(m.seed,4,4,m.contentConfig.recipeStudy);
 const wire=JSON.parse(JSON.stringify(data,(_k,v)=>v instanceof g.Set?[...v]:v instanceof g.Map?[...v.entries()]:v));
 const x=m.bossRoomReview.start%m.width,y=Math.floor(m.bossRoomReview.start/m.width);
 if(!D.validate(wire,{mapId,x,y}))throw Error('房间试场数据未通过正式校验');
 D.restore(wire);E.setState(mapId,x,y);g.SceneCtx.setFacingDir(0);D.refresh();
 return D.getSim();
}
