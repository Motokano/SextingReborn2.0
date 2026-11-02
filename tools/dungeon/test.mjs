import assert from 'node:assert/strict';
import {boot} from './fixture.mjs';
const h=await boot(false);try{
 const g=h.g,D=g.DungeonRuntime;
 await D.ready;
 console.log('Boot passed',g.GameEngine.getState(),D.config().name);
 g.CharacterAttributes.setState({character_creation_completed:true,characterName:'地牢验收'});
 g.GameEngine.setState('M0_Field_02',7,7);
 assert.equal(D.canPrepare(),true);
 assert.equal(D.enter(),true);
 let s=D.getSim();console.log('Generated',s.map.width,s.map.height,'rooms',s.map.rooms.length,'resources',s.harvestPoints.length);
 const map=g.GameEngine.getMap();map.enemies=[];s.enemies=[]; // deterministic no-combat transaction fixture
 const at=k=>g.GameEngine.setState(D.getRun().mapId,k%s.map.width,Math.floor(k/s.map.width));
 const resource=s.harvestPoints[0];assert.ok(resource);
 for(const d of s.doors)d.closed=false;
 at(resource.access[0]);g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(s.player.cell,resource.cell,s.map.width));D.sync();
 const before=g.Survival.getStamina(),count=resource.remaining;
 assert.equal(D.begin('harvest',resource.uid),true,'begin harvest');D.cancel();assert.equal(resource.remaining,count);assert.equal(g.Survival.getStamina(),before);
 assert.equal(D.begin('harvest',resource.uid),true);assert.equal(D.completeTick(),true);
 assert.equal(resource.remaining,count-1);assert.ok(g.Survival.getStamina()<before);assert.equal(g.InventoryEquipment.countCarriedItemsByTemplateId(g.RuinsHarvest.definitions[resource.id].itemId),1);
 const saved=g.SaveSystem.buildSnapshotForDebug();assert.equal(g.SaveSystem.applySnapshotForDebug(saved),true);s=D.getSim();assert.equal(s.harvestPoints.find(p=>p.uid===resource.uid).remaining,count-1);
 console.log('Harvest, cancellation and save restore pass');
 const pc=D.config(),battery=g.InventoryEquipment.getAllItemIds().find(id=>id.includes('battery'));
 assert.ok(battery);pc.pool.batches=[{id:'test-only',items:[{item_id:battery,stock:100,count:1,rarity:'legendary'}]}];
 pc.search.container.emptyChance=0;pc.search.container.weights=[1,0,0];
 const loot=s.lootPoints[0];assert.ok(loot);at(loot.access[0]);g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(s.player.cell,loot.cell,s.map.width));D.sync();
 assert.equal(D.begin('search',loot.uid),true);assert.equal(D.completeTick(),true);assert.equal(loot.search.opened,true);assert.equal(loot.search.items[0].revealed,false);
 assert.equal(D.getPending(),null,'opening stops before item search');assert.equal(D.begin('search',loot.uid),true);
 for(let i=0;i<7;i++){assert.equal(D.completeTick(),true);assert.equal(loot.search.items[0].revealed,false);}
 assert.equal(D.completeTick(),true);assert.equal(loot.search.items[0].revealed,true);assert.equal(D.getState().pool.remaining[0].stock,99);
 const poolSaved=g.SaveSystem.buildSnapshotForDebug();assert.equal(g.SaveSystem.applySnapshotForDebug(poolSaved),true);s=D.getSim();assert.equal(s.lootPoints[0].search.items[0].revealed,true);assert.equal(D.getState().pool.remaining[0].stock,99);
 assert.equal(D.claim(loot.uid,0),true);assert.equal(D.claim(loot.uid,0),false);
 const actualLoot=[...g.InventoryEquipment.getPocketArray(),...g.InventoryEquipment.getVestArray(),...g.InventoryEquipment.getBackpackArray()].find(i=>i?.item_id===battery);assert.equal(actualLoot.dungeon_rarity,'legendary');
 console.log('Container opening, 8-tick reveal, finite stock and real inventory pass');
 const recovery=s.recoveryPoints.find(p=>p.id==='kettle'||p.id==='water');if(recovery){g.Survival.setState({thirst:20});at(recovery.access[0]);g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(s.player.cell,recovery.cell,s.map.width));D.sync();const left=recovery.recovery.remaining;assert.equal(D.begin('recovery',recovery.uid),true);assert.equal(D.completeTick(),true);assert.equal(recovery.recovery.remaining,left-1);assert.ok(g.Survival.getThirst()>20);}
 console.log('Recovery use and actual survival value pass');
 at(s.map.exit);const records=D.totals().cells;assert.equal(D.descend(),true);s=D.getSim();assert.equal(D.getRun().records[0].cells,records);
 at(s.map.exit);const p0=g.InventoryEquipment.getPotential(),reward=D.totals().total;assert.equal(D.withdraw(),true);assert.equal(g.InventoryEquipment.getPotential(),p0+reward);assert.equal(D.withdraw(),false);
 const settled=g.SaveSystem.buildSnapshotForDebug();assert.equal(g.SaveSystem.applySnapshotForDebug(settled),true);assert.equal(g.InventoryEquipment.getPotential(),p0+reward);
 console.log('Cross-floor exploration and exactly-once reward pass');
 assert.ok(JSON.stringify(settled).length<2500000,'save size is bounded');
 assert.deepEqual(h.errors,[]);
}finally{await h.close();}
