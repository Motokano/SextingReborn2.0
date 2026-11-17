import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './ui-game-fixture.mjs';

test('medical exploration batch migrates once and produces empty independent equipment through real search and claim',async()=>{
 const h=await boot(false),g=h.g,D=g.DungeonRuntime,I=g.InventoryEquipment;
 try{
  await D.ready;
  g.CharacterAttributes.setState({character_creation_completed:true,characterName:'医疗掉落验收'});
  g.GameEngine.setState('M0_Field_02',7,7);
  I.equip('backpack',g.BackpackSystem.generate('eq_backpack_light_canvas'));
  assert.equal(D.enter(),true);
  const cfg=D.config(),batch=cfg.pool.batches.find(v=>v.id==='medical-kit-supplies-v1');
  assert.equal(batch.items.length,7);assert.ok(batch.items.every(v=>v.category==='medical'&&v.count===1&&I.getItemTemplate(v.item_id)));
  // A save from before this batch retains old stock, then adds the new batch at the next search.
  const old=D.getState();delete old.pool.batches[batch.id];old.pool.remaining=old.pool.remaining.filter(v=>v.batch!==batch.id);
  old.pool.remaining.forEach(v=>v.stock=0);D.restore(old);
  cfg.search.container.emptyChance=0;cfg.search.container.weights=[1,0,0];
  let s=D.getSim();s.enemies=[];g.GameEngine.getMap().enemies=[];for(const d of s.doors)d.closed=false;
  const p=s.lootPoints.find(v=>!v.lootOverride);assert.ok(p);
  p.contentWeights={medical:1};
  const k=p.access[0];g.GameEngine.setState(D.getRun().mapId,k%s.map.width,Math.floor(k/s.map.width));
  g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(k,p.cell,s.map.width));D.sync();
  const random=g.Math.random;g.Math.random=()=>0;
  assert.equal(D.begin('search',p.uid),true);assert.equal(D.completeTick(),true);g.Math.random=random;
  const found=p.search.items[0];assert.equal(found.item_id,'tool_medical_kit_basic');
  const pool=D.getState().pool;assert.equal(pool.batches[batch.id],true);assert.equal(pool.remaining.filter(v=>v.batch===batch.id).length,7);
  assert.equal(pool.remaining.find(v=>v.item_id===found.item_id).stock,11);
  assert.equal(D.begin('search',p.uid),true);
  for(let n=0;n<cfg.search.rarities[found.rarity].ticks;n++)assert.equal(D.completeTick(),true);
  assert.equal(found.revealed,true);assert.equal(D.claim(p.uid,0),true);assert.equal(D.claim(p.uid,0),false);
  const kit=g.MedicalKit.carried().find(v=>v.instance.item_id==='tool_medical_kit_basic');assert.ok(kit);
  const profile=g.MedicalKit.profile(g.MedicalKit.find(kit.id));
  assert.equal(Object.values(profile.state.remaining).reduce((a,b)=>a+b,0),0);
  assert.equal(I.auditItemOwnership().ok,true);
  const saved=g.SaveSystem.buildSnapshotForDebug();assert.equal(g.SaveSystem.applySnapshotForDebug(saved),true);
  assert.equal(D.getState().pool.remaining.filter(v=>v.batch===batch.id).length,7);
  assert.equal(D.getState().pool.remaining.find(v=>v.item_id===found.item_id).stock,11);
  assert.equal(g.MedicalKit.find(kit.id).count,1);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
