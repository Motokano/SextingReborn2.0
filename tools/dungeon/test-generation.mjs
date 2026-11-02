import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=f=>fs.readFileSync(f,'utf8');
const context=vm.createContext({console,structuredClone,TextDecoder,TextEncoder});context.window=context;
for(const file of ['js/manufacturing-knowledge-catalog.js','js/manufacturing-knowledge.js','js/dungeon/recipe-study.js','js/dungeon/recipe-ranges.js'])vm.runInContext(read(file),context,{filename:file});
for(const file of ['vendor/settlemaker','engine','enemies','content-config','resources','loot-catalog','loot','recovery-bounds','container-profiles','workshop-terrain','workshop','clinic','canteen','outposts','large-room-states','outpost-decor','mixed-rooms','poi-placement','recovery-placement','wanderers','container-search','recovery','encounter','insight','exploration','expedition','harvest','woodland','room-layout'])vm.runInContext(read('js/dungeon/'+file+'.js'),context,{filename:file});
const C=context.RuinsContentConfig,cfg=JSON.parse(read('data/dungeon-config.json'));
cfg.content.recipeStudy=context.DungeonRecipeRanges.forDungeon(JSON.parse(read(cfg.recipeStudyRangesSource)),cfg.id);
for(const file of ['boss-room-data','boss-room-template','boss-rewards','boss'])vm.runInContext(read('js/dungeon/'+file+'.js'),context,{filename:file});
cfg.content.recipeStudy.chance=1; // Force the dedicated room to exercise placement on every checked floor.
cfg.boss.spawnChance=1; // This suite verifies placement; probability has its own regression coverage.
let empty=0,doorlessContent=0,noInsight=0,totalRooms=0,resources=0;
function generate(seed,floor,contentConfig){
 for(let attempt=0;attempt<8;attempt++)try{const map=context.RuinsRooms.generate(seed+'|'+floor+'|'+attempt,'city',floor,{contentConfig,studyPlan:{floor}});context.DungeonBoss.place(map,cfg.boss);return map;}catch(error){if(attempt===7)throw error;}
}
for(let i=0;i<16;i++){
 const floor=i%4+1,map=generate('audit-rules-'+i,floor,C.resolve({overrides:cfg.content}));
 assert.equal(map.enemies.filter(e=>e.enemyId===cfg.boss.enemyId).length,floor===4?1:0);
 if(floor===4){const room=map.rooms.find(r=>r.id===map.boss.roomId);assert.ok(room.hasDoor);assert.equal(room.enemies.length,1);assert.ok(map.boss.bypass.length);assert.ok(map.boss.bypass.every(k=>!room.inner.includes(k)&&k!==room.door));}
 assert.ok(map.width<=100&&map.height<=100);assert.ok(map.path.length>0);
 const rooms=map.rooms.filter(r=>r.nodes?.length);const n=map.rooms.length;assert.ok(rooms.length<=Math.floor(n*.2));if(Math.ceil(n*.1)<=Math.floor(n*.2))assert.ok(rooms.length>=Math.ceil(n*.1));
 totalRooms+=n;resources+=rooms.length;empty+=map.emptyRooms.length;doorlessContent+=map.rooms.filter(r=>r.hasDoor===false&&!r.isEmpty).length;noInsight+=!map.insightPoints.filter(p=>p.kind!=='recipe').length;
 for(const r of map.rooms.filter(r=>r.hasDoor===false)){assert.equal(map.tiles[r.door],2);assert.ok(!map.doors.includes(r.door));}
 for(const p of map.insightPoints)assert.equal(p.amount,p.kind==='recipe'?0:cfg.content.insight.rewards[p.id]);
 assert.equal(map.insightPoints.filter(p=>p.kind==='recipe').length,1);
 const s=context.RuinsEncounter.create(map);for(const p of s.harvestPoints){assert.ok(p.access.length);for(const cell of p.access)assert.equal(Math.abs(cell%map.width-p.cell%map.width)+Math.abs(Math.floor(cell/map.width)-Math.floor(p.cell/map.width)),1);assert.ok(p.remaining>=1);}
 assert.equal(s.doors.length,map.rooms.filter(r=>r.hasDoor!==false).length);
}
assert.ok(empty>0&&doorlessContent>0&&noInsight>0);
const overridden=C.resolve({overrides:cfg.content,ticketOverrides:{rooms:{emptyChance:0,doorlessChance:1},ruins:{smallWalllessChance:0,largeDoorlessChance:1,largeDamagedChance:0},resourceRooms:{minRatio:0,maxRatio:0},insight:{chance:0},recipeStudy:{enabled:false}}});
const changed=generate('audit-ticket',1,overridden);assert.ok(changed.rooms.every(r=>r.hasDoor===false));assert.equal(changed.resources.length,0);assert.equal(changed.insightPoints.length,0);
console.log(JSON.stringify({maps:16,totalRooms,resources,empty,doorlessContent,floorsWithoutInsight:noInsight,ticketOverrides:true}));
for(let i=0;i<24;i++){
 let map;
 for(let attempt=0;attempt<8;attempt++){
  try{map=context.RuinsRooms.generate('boss-placement-'+i+'|4|'+attempt,'city',4,{contentConfig:i%2?overridden:C.resolve({overrides:cfg.content}),studyPlan:{floor:4}});context.DungeonBoss.place(map,cfg.boss);break;}
  catch(e){if(attempt===7)throw Error('boss placement seed '+i+': '+e.message);}
 }
 assert.equal(map.enemies.filter(e=>e.enemyId===cfg.boss.enemyId).length,1);
 const room=map.rooms.find(r=>r.id===map.boss.roomId);assert.equal(room.hasDoor,true);
 const collision=context.RuinsSettlement.closedPassages(map);for(const k of room.inner)collision[k]=context.RuinsSettlement.VOID;
 assert.ok(context.RuinsSettlement.route(collision,map.width,map.height,map.entry,map.exit).length);
}
console.log('24 additional floor-four seeds, including doorless-room overrides: exactly one boss and an independent exit path pass');
