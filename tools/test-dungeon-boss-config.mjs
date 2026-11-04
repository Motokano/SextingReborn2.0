import assert from 'node:assert/strict';
import {boot} from './dungeon/fixture.mjs';
const f=await boot(false),plain=v=>JSON.parse(JSON.stringify(v));
try{
 const g=f.g,D=g.DungeonRuntime,E=g.GameEngine,R=g.RuinsSettlement,B=g.DungeonBoss,W=g.DungeonBossRewards;
 await D.ready;
 const cfg=D.config(),boss=cfg.boss;
 assert.equal(boss.spawnChance,.6);
 for(const probability of [0,1])for(let n=0;n<100;n++)assert.equal(B.appearance('rate-'+n,4,{...boss,spawnChance:probability}).present,!!probability);
 const sample=Array.from({length:10000},(_,n)=>B.appearance('boss-rate-audit-'+n,4,boss).present).filter(Boolean).length;
 assert.ok(sample>5700&&sample<6300,'60% across deterministic independent seeds');
 assert.equal(B.appearance('fixed',3,boss).present,false);
 assert.deepEqual(plain(B.appearance('fixed',4,boss)),plain(B.appearance('fixed',4,boss)));
 for(const chance of [-.1,1.1,NaN,'0.6'])assert.throws(()=>W.validate({...boss,spawnChance:chance},cfg.search.rarities));
 const rule=(item,min=1,max=min,chance=1)=>({item_id:item,min,max,chance,rarity:'common'});
 const exclusive=(...extraDrops)=>({inheritSharedPool:false,extraDrops});
 boss.loot={corpse:exclusive(rule('sewing_toe_cap',3)),containers:{'den-private':exclusive(rule('sewing_rubber_sheet',2)),'den-basket':exclusive(rule('sewing_straw',4))}};
 W.validate(boss,cfg.search.rarities,id=>!!g.InventoryEquipment.getItemTemplate(id));
 assert.throws(()=>W.profile(exclusive(rule('does-not-exist')),cfg.search.rarities,()=>false));
 assert.throws(()=>W.profile(exclusive(rule('sewing_straw',3,1)),cfg.search.rarities));
 assert.throws(()=>W.profile(exclusive({...rule('sewing_straw'),rarity:'invalid'}),cfg.search.rarities));
 assert.equal(W.extras(exclusive(rule('sewing_straw',1,1,0)),()=>0).length,0);
 assert.equal(W.extras(exclusive(rule('sewing_straw',2,5)),()=>.999999)[0].count,5);
 assert.equal(W.extras(exclusive(rule('sewing_straw',2,5)),()=>0)[0].count,2);
 g.CharacterAttributes.setState({character_creation_completed:true});
 g.RuinsSeed.create=()=>'boss-config-check';
 const at=k=>{const s=D.getSim();E.setState(D.getRun().mapId,k%s.map.width,Math.floor(k/s.map.width));D.sync();};
 function enterFourth(probability){
  D.restore(null);boss.spawnChance=probability;g.Survival.setState({isDead:false,qi_li_current:100,diqi_current:1000});E.setState('M0_Field_02',7,7);
  assert.ok(D.enter());for(let floor=1;floor<4;floor++){at(D.getSim().map.exit);assert.ok(D.descend());}
  return D.getSim();
 }
 let s=enterFourth(0);const absentMap=plain(s.map),absentCount=s.enemies.length;
 assert.ok(s.map.bossRoom);assert.equal(s.map.bossRoom.bossSpawn.present,false);assert.equal(s.map.boss,null);
 assert.equal(s.enemies.filter(e=>e.boss).length,0);assert.equal(s.map.rooms.find(r=>r.id===s.map.bossRoom.roomId).enemyCount,0);
 assert.equal(s.lootPoints.filter(p=>p.assetId.startsWith('den-')).length,2);assert.ok(R.route(R.closedPassages(s.map),s.map.width,s.map.height,s.map.entry,s.map.exit).length);
 const absent=g.SaveSystem.buildSnapshotForDebug();boss.spawnChance=1;assert.ok(g.SaveSystem.applySnapshotForDebug(absent));assert.equal(D.getSim().enemies.filter(e=>e.boss).length,0,'reload cannot spawn an absent boss');
 console.log('0%: fixed room and containers survive, normal enemies preserved, no reroll on load');
 s=enterFourth(1);assert.equal(s.enemies.filter(e=>e.boss).length,1);assert.equal(s.enemies.length,absentCount+1,'boss has its own budget');
 assert.deepEqual(plain(s.map.populationBudget.rooms),absentMap.populationBudget.rooms,'boss appearance does not take room residents');
 assert.equal(s.map.populationBudget.nonRoom,absentMap.populationBudget.nonRoom,'boss appearance does not take outdoor residents');
 assert.deepEqual(plain(s.map.bossRoom.origin),absentMap.bossRoom.origin,'chance does not change the room placement for this fixture');
 assert.equal(s.map.bossRoom.bossSpawn.roll,B.appearance(D.getRun().seed,4,boss).roll,'uses run seed, independent of layout retry');
 const before=JSON.stringify(plain(s.map));B.place(s.map,{...boss,spawnChance:0});assert.equal(JSON.stringify(plain(s.map)),before);
 const present=g.SaveSystem.buildSnapshotForDebug();boss.spawnChance=0;boss.loot.containers['den-private'].extraDrops[0].min=9;boss.loot.containers['den-private'].extraDrops[0].max=9;
 assert.ok(g.SaveSystem.applySnapshotForDebug(present));s=D.getSim();assert.equal(s.enemies.filter(e=>e.boss).length,1);
 assert.equal(s.lootPoints.find(p=>p.assetId==='den-private').lootOverride.extraDrops[0].min,2,'generated loot override is a saved snapshot');
 const bad=structuredClone(present);bad.dungeon.sim.lootPoints.find(p=>p.assetId==='den-private').lootOverride.extraDrops[0].chance=2;assert.equal(D.validate(bad.dungeon,bad.player.engine),false);
 // Exercise real search and death, with AI paused only in the transaction fixture.
 D.updateAI=()=>({moves:[],attacks:[]});for(const door of s.doors)door.closed=false;
 function open(id){const p=D.getSim().lootPoints.find(p=>p.assetId===id);at(p.access[0]);g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(D.getSim().player.cell,p.cell,s.map.width));D.sync();assert.ok(D.begin('search',p.uid),id);assert.ok(D.completeTick(),id);return p;}
 const privateBox=open('den-private'),basket=open('den-basket');
 assert.deepEqual(plain(privateBox.search.items.map(i=>[i.item_id,i.count])),[['sewing_rubber_sheet',2]]);
 assert.deepEqual(plain(basket.search.items.map(i=>[i.item_id,i.count])),[['sewing_straw',4]]);
 const enemy=s.enemies.find(e=>e.boss),record=E.getMap().enemies.find(e=>e.dungeonUid===enemy.uid);
 D.killed(record);E.getMap().enemies=E.getMap().enemies.filter(e=>e!==record);
 const corpse=s.corpses.at(-1);assert.deepEqual(plain(corpse.search.items.map(i=>[i.item_id,i.count])),[['sewing_toe_cap',3]]);
 D.killed(record);assert.equal(s.corpses.length,1,'duplicate kill cannot reroll or add rewards');
 assert.equal(D.getState().pool.remaining.length,0,'exclusive rewards do not consume shared stock');
 // Ordinary containers still use the finite shared pool, special additive rewards can use both.
 cfg.pool.batches=[{id:'boss-loot-test',items:[{item_id:'sewing_shoe_nails',category:'repair',stock:10,count:1,rarity:'common'}]}];
 cfg.search.container.emptyChance=0;cfg.search.container.weights=[1,0,0];
 const normal=s.lootPoints.find(p=>!p.lootOverride);normal.contentWeights={repair:1};open(normal.assetId);
 assert.deepEqual(plain(normal.search.items.map(i=>[i.item_id,i.count])),[['sewing_shoe_nails',1]]);assert.equal(D.getState().pool.remaining[0].stock,9);
 const additive=s.lootPoints.find(p=>!p.lootOverride&&!p.search.opened);additive.contentWeights={repair:1};additive.lootOverride={inheritSharedPool:true,extraDrops:[rule('sewing_straw',5)]};open(additive.assetId);
 assert.deepEqual(plain(additive.search.items.map(i=>[i.item_id,i.count])),[['sewing_shoe_nails',1],['sewing_straw',5]]);assert.equal(D.getState().pool.remaining[0].stock,8);
 const lootSave=g.SaveSystem.buildSnapshotForDebug();assert.ok(g.SaveSystem.applySnapshotForDebug(lootSave));s=D.getSim();assert.deepEqual(plain(s.corpses[0].search.items),plain(corpse.search.items));assert.equal(D.getState().pool.remaining[0].stock,8);
 assert.deepEqual(f.errors,[]);
 console.log('PASS: '+sample+'/10000 spawn samples; fixed room at 0/1, independent rewards, actual search/death, shared pool, duplicate protection, save/load and validation');
}finally{await f.close();}
