import assert from 'node:assert/strict';
import {boot} from './fixture.mjs';
const h=await boot(true);
try{
 const g=h.g,D=g.DungeonRuntime;await D.ready;
 g.CharacterAttributes.setState({character_creation_completed:true});g.GameEngine.setState('M0_Field_02',7,7);assert.ok(D.enter());
 let s=D.getSim();g.GameEngine.getMap().enemies=[];s.enemies=[];
 for(const d of s.doors)d.closed=false;
 const at=k=>{g.GameEngine.setState(D.getRun().mapId,k%s.map.width,Math.floor(k/s.map.width));D.sync();};
 const base=s.harvestPoints[0]||s.lootPoints[0];assert.ok(base);
 for(const d of Object.values(g.RuinsHarvest.definitions))assert.ok(g.InventoryEquipment.getItemTemplate(d.itemId),d.itemId);
 const valid=g.SaveSystem.buildSnapshotForDebug();assert.equal(D.validate(valid.dungeon,valid.player.engine),true);
 const bad=structuredClone(valid);bad.dungeon.sim.harvestPoints[0].remaining=-1;assert.equal(g.SaveSystem.applySnapshotForDebug(bad),false);assert.equal(D.getSim().harvestPoints[0].remaining,valid.dungeon.sim.harvestPoints[0].remaining);
 for(const [id,c]of Object.entries(D.config().recovery)){
  if(!c?.uses)continue;
  const p={...structuredClone(base),uid:'test-'+id,id,name:id,used:false,recovery:{remaining:c.uses,progress:0,part:null,fraction:0}};
  s.recoveryPoints=[p];at(base.access[0]);g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(s.player.cell,p.cell,s.map.width));
  g.Survival.setState({thirst:15,satiety:30,fatigue:80,stamina:50});
  if(id==='medical')g.CharacterAttributes.applyCombatDestroy('chest',g.CharacterAttributes.getBodyPartDestroyMax('chest')*.6);
  D.sync();const injury=g.CharacterAttributes.getPartDestroy('chest'),fatigue=g.Survival.getFatigue();
  assert.equal(D.begin('recovery',p.uid,'chest'),true,id+' begin');assert.equal(D.completeTick(),true,id+' tick');
  if(c.ticks>1){D.cancel();assert.equal(p.recovery.progress,1,id+' progress retained');assert.equal(p.recovery.remaining,c.uses);assert.equal(D.begin('recovery',p.uid,'chest'),true);for(let i=1;i<c.ticks;i++)assert.equal(D.completeTick(),true,id+' continuation');}
  assert.equal(p.recovery.remaining,c.uses-1,id+' uses');assert.equal(p.used,c.uses===1,id+' spent');
  if(id==='medical')assert.ok(g.CharacterAttributes.getPartDestroy('chest')<=injury-g.CharacterAttributes.getBodyPartDestroyMax('chest')*.199);
  if(id==='rest')assert.ok(g.Survival.getFatigue()<=fatigue-19);
  if(id==='water'||id==='kettle')assert.ok(g.Survival.getThirst()>15);
  if(id==='stove'||id==='campfire')assert.ok(D.getState().meals.some(m=>m.remaining===c.amount));
 }
 console.log('All 34 item mappings, malformed-save rejection, six recovery types and interruption pass (Svelte HUD)');
 const door=s.doors[0];assert.ok(door);at(door.outside);door.closed=true;
 for(const material of ['wood','iron']){door.material=material;D.sync();const p={...s.player,skills:{...s.player.skills,logging:0,mining:0}},t={...s,player:p};const initial=g.RuinsEncounter.doorCost(t,door);p.skills.logging=p.skills.mining=100;const reduced=g.RuinsEncounter.doorCost(t,door);assert.equal(initial,1,'both doors use the high-intensity base cost');assert.equal(reduced,0.7,'level 100 preserves the 30% skill discount');}
 const stamina=g.Survival.getStamina();assert.equal(D.openDoor(door.cell),true);assert.ok(g.Survival.getStamina()<stamina);assert.equal(D.openDoor(door.cell),false);
 const battery=g.InventoryEquipment.getAllItemIds().find(id=>id.includes('battery'));
 D.config().pool.batches=[{id:'test',items:[{item_id:battery,stock:100,rarity:'rare'}]}];D.config().search.corpse.emptyChance=0;D.config().search.corpse.weights=[1,0,0,0];
 const npc={uid:'test-enemy',cell:s.player.cell};s.enemies.push(npc);D.killed({dungeonUid:npc.uid,x:s.player.cell%s.map.width,y:Math.floor(s.player.cell/s.map.width)});
 const corpse=s.corpses.at(-1);assert.equal(corpse.search.items.length,1);corpse.search.items[0].count=10;assert.equal(D.mark(corpse.uid),true);assert.equal(D.mark(corpse.uid),false);
 // A known, marked 10-unit bag exercises rounding by item units, not row count.
 assert.equal(D.getRun().marked[0].allocation.npc.reduce((n,i)=>n+i.count,0),3,'commission locks at marking');
 const potential=g.InventoryEquipment.getPotential();D.die();assert.equal(D.getRun().status,'dead');assert.equal(g.InventoryEquipment.getPotential(),potential);assert.equal(D.getReceipt(),null);
 const b=D.getRecovered()[0];assert.ok(b);assert.equal(D.openBag(b.uid),false,'dead expedition cannot recover remotely');g.GameEngine.setState('M0_Field_02',7,7);assert.equal(D.openBag(b.uid),true);assert.equal(D.openBag(b.uid),false);assert.equal(b.allocation.npc.reduce((n,i)=>n+i.count,0),3);assert.equal(b.allocation.player.reduce((n,i)=>n+i.count,0),7);
 const deathSave=g.SaveSystem.buildSnapshotForDebug();assert.equal(g.SaveSystem.applySnapshotForDebug(deathSave),true,'dead run restores');
 // Recovery claims remain available after returning through the game's resurrection flow.
 g.GameEngine.setState('M0_Field_02',7,7);const rest=D.getRecovered()[0];assert.ok(rest.opened);assert.equal(D.claimBag(rest.uid,0),false,'no carrying equipment keeps the bag unclaimed');g.InventoryEquipment.applyNewGameEquipment();const got=D.claimBag(rest.uid,0);assert.equal(got,true);const count=rest.allocation.player[0].taken;assert.ok(count>0&&count<=7);assert.equal(g.InventoryEquipment.countCarriedItemsByTemplateId(battery),count);
 assert.equal(D.rolls('container',.5,()=>.99),D.rolls('container',0,()=>.99));
 console.log('Door costs, one-way opening, death potential, marked recovery, 30% floor and partial-capacity pickup pass');
 assert.deepEqual(h.errors,[]);
}finally{await h.close();}
