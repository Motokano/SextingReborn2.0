import assert from 'node:assert/strict';
import { boot } from './dungeon/fixture.mjs';

const h=await boot(false);
try {
 const g=h.g,D=g.DungeonRuntime,IE=g.InventoryEquipment;await D.ready;
 const batch=D.config().pool.batches.find(b=>b.id==='sewing-accessory-supplies-v1');assert(batch);
 g.CharacterAttributes.setState({character_creation_completed:true,characterName:'缝纫材料验收'});
 g.GameEngine.setState('M0_Field_02',7,7);assert(D.enter());
 let sim=D.getSim();sim.enemies=[];g.GameEngine.getMap().enemies=[];
 for(const d of sim.doors)d.closed=false;
 D.config().search.container.emptyChance=0;D.config().search.container.weights=[1,0,0];
 const random=g.Math.random;
 for(let i=0;i<batch.items.length;i++){
  const material=batch.items[i],point=sim.lootPoints[i];assert(point);
  g.GameEngine.setState(D.getRun().mapId,point.access[0]%sim.map.width,Math.floor(point.access[0]/sim.map.width));
  g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(point.access[0],point.cell,sim.map.width));D.sync();
  // Deterministically select each real supply using the container's actual weights.
  // Search lazily appends every unapplied batch, including the medical supplies.
  const pool=D.getState().pool;
  const rows=[...pool.remaining,...D.config().pool.batches.filter(b=>!pool.batches[b.id]).flatMap(b=>b.items)];
  const weights=rows.map(row=>point.contentWeights?g.RuinsContainerProfiles.itemWeight(point,row.category||'misc',row.stock,{eligible:true}):row.stock);
  const index=rows.findIndex(r=>r.item_id===material.item_id),total=weights.reduce((a,b)=>a+b,0);
  assert(weights[index]>0);const selected=(weights.slice(0,index).reduce((a,b)=>a+b,0)+weights[index]/2)/total;
  g.Math.random=()=>selected;
  assert(D.begin('search',point.uid));assert(D.completeTick());assert.equal(point.search.items[0].item_id,material.item_id);
  assert(D.begin('search',point.uid));for(let t=0;t<D.config().search.rarities[material.rarity].ticks;t++)assert(D.completeTick());
  assert(D.claim(point.uid,0));assert.equal(IE.countCarriedItemsByTemplateId(material.item_id),1);
  assert.equal(D.getState().pool.remaining.find(r=>r.item_id===material.item_id).stock,material.stock-1);
 }
 g.Math.random=random;
 const state=D.getState(),snapshot=g.SaveSystem.buildSnapshotForDebug();assert(g.SaveSystem.applySnapshotForDebug(snapshot));
 assert.deepEqual(JSON.parse(JSON.stringify(D.getState().pool)),JSON.parse(JSON.stringify(state.pool)),'loading preserves finite material stock');
 for(const row of batch.items)assert.equal(IE.countCarriedItemsByTemplateId(row.item_id),1);
 assert(IE.auditItemOwnership().ok);assert.deepEqual(h.errors,[]);
 console.log('PASS formal game: all four supplies found through real container search, claimed into inventory and preserved without stock refill on reload.');
} finally { await h.close(); }
