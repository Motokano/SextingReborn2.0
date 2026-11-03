import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot} from './dungeon/fixture.mjs';

const flag='血腥开关',copy=v=>JSON.parse(JSON.stringify(v));
const manifest=JSON.parse(fs.readFileSync('assets/map/isometric/street-thugs-marked-v1/manifest.json'));
const triggerPath='data/npc/npc_supervisor_manager_triggers.json';
const endDialogue=g=>{let n=0;while(g.DialogueUI.isDialogueOpen()&&n++<1000)g.DialogueUI.next();assert.ok(n<1000);};

for(const full of [false,true])test(`story-controlled corpse art (${full?'Svelte':'native'})`,async()=>{
 const h=await boot(full),g=h.g,D=g.DungeonRuntime,E=g.GameEngine,A=g.DungeonCorpseArt,N=g.NPCSystem;
 try{
  await A.ready;assert.equal(A.GORE_FLAG,flag);assert.equal(A.isGoreEnabled(),false);
  endDialogue(g);await h.drain();g.CharacterAttributes.setState({character_creation_completed:true});
  E.setState('M0_Field_02',7,7);assert.ok(D.enter());
  // Keep the appearance/save assertions independent of unrelated catalog changes.
  const itemId=g.InventoryEquipment.getAllItemIds().find(id=>id.includes('battery'));assert.ok(itemId);
  D.config().pool.batches=[{id:'corpse-gore-test',items:[{item_id:itemId,stock:40,rarity:'common'}]}];
  const s=D.getSim(),map=E.getMap(),corpses=[];
  for(const art of manifest.entries){
   const record=map.enemies[0],enemy=s.enemies.find(e=>e.uid===record.dungeonUid);
   record.enemy_id=enemy.enemyId=art.enemyIds[0];
   D.killed(record);map.enemies=map.enemies.filter(e=>e!==record);
   const p=s.corpses.at(-1);assert.equal(p.enemyId,art.enemyIds[0]);corpses.push(p);
   const count=s.corpses.length;D.killed(record);assert.equal(s.corpses.length,count,'repeat death cannot add a corpse');
  }
  s.enemies=[];map.enemies=[]; // No AI interference in the presentation/marking assertions.
  g.Image=class{complete=true;naturalWidth=1536;naturalHeight=1024;set src(v){this._src=v;this.onload?.();}get src(){return this._src;}};
  const draws=[],moves=[],ctx=new Proxy({drawImage(...args){draws.push(args);},translate(...args){moves.push(args);}},{get:(o,k)=>o[k]??(()=>{})});
  const projection={isIsometric:true,tileWidth:144,cellCenter:()=>({x:300,y:400})};
  D.inspect=()=>({terrain:true,identify:true,dynamic:true});
  const paint=p=>{draws.length=0;moves.length=0;g.DungeonArt.object(ctx,p.cell%s.map.width,Math.floor(p.cell/s.map.width),projection);return draws.filter(d=>d[0].src).at(-1);};
  for(const value of [undefined,false,0,'false','true',1]){
   N.setDemoFlag(flag,value);assert.equal(A.isGoreEnabled(),false,'only the boolean true enables gore');
   for(const p of corpses)assert.equal(paint(p)[0].src,'assets/dungeon/corpse-bag-v3/normal.png');
  }
  let refreshed=0;const render=g.SceneRenderer.render;g.SceneRenderer.render=()=>{refreshed++;};
  N.setDemoFlag(flag,true);await h.drain();assert.ok(refreshed>0,'story mutation invalidates the map immediately');g.SceneRenderer.render=render;
  for(const [i,p]of corpses.entries()){
   const art=manifest.entries[i],body=paint(p);assert.equal(body[0].src,art.normal.src);
   assert.ok(Math.abs(body[7]-art.normal.crop[2]*art.normal.scaleAt144)<1e-8);
   assert.deepEqual(moves.at(-1),[300,410]);
   E.setState(D.getRun().mapId,p.cell%s.map.width,Math.floor(p.cell/s.map.width));
   assert.equal(D.mark(p.uid),true,'real mark action');assert.equal(paint(p)[0].src,art.marked.src);
   const width=paint(p)[7];g.PawnDisplayScale=1;assert.ok(Math.abs(width/paint(p)[7]-1.25)<1e-8);g.PawnDisplayScale=1.25;
  }
  const loot=JSON.stringify(corpses.map(p=>p.search)),marked=JSON.stringify(D.getRun().marked);
  N.setDemoFlag(flag,false);for(const p of corpses)assert.equal(paint(p)[0].src,'assets/dungeon/corpse-bag-v3/marked.png');
  N.setDemoFlag(flag,true);assert.equal(JSON.stringify(corpses.map(p=>p.search)),loot);assert.equal(JSON.stringify(D.getRun().marked),marked,'switching never marks, rerolls or claims loot');
  D.inspect=()=>({terrain:true,identify:true,dynamic:false});assert.equal(paint(corpses[0]),undefined,'neither body nor shadow leaks through visibility');
  for(const p of [{marked:false},{enemyId:'unknown',marked:false},{enemyId:manifest.entries[0].enemyIds[0],marked:true}]){
   const expected=p.enemyId===manifest.entries[0].enemyIds[0]?manifest.entries[0].marked.src:'assets/dungeon/corpse-bag-v3/normal.png';assert.equal(A.source(p),expected);
  }
  assert.equal(A.source({enemyId:'enemy.street_thug',marked:false}),manifest.entries[0].normal.src,'known legacy enemy identity uses its matching pawn');
  assert.equal(A.source(true),'assets/dungeon/corpse-bag-v3/marked.png','recovered physical sacks keep sack art');
  const engine=copy(E.getState()),dungeon=copy(D.getState());assert.ok(D.validate(dungeon,engine));D.restore(dungeon);
  assert.deepEqual(copy(D.getSim().corpses.map(p=>p.enemyId)),manifest.entries.map(a=>a.enemyIds[0]));
  const saved=copy(g.SaveSystem.buildSnapshotForDebug());assert.equal(saved.player.npcDemo.flags[flag],true);
  N.setDemoFlag(flag,false);assert.equal(g.SaveSystem.applySnapshotForDebug(saved),true);assert.equal(A.isGoreEnabled(),true);
  const old=copy(saved);delete old.player.npcDemo.flags[flag];for(const p of old.dungeon.sim.corpses)delete p.enemyId;
  assert.equal(g.SaveSystem.applySnapshotForDebug(old),true);assert.equal(A.isGoreEnabled(),false,'old saves default off');
  N.setDemoFlag(flag,true);for(const p of D.getSim().corpses)assert.equal(A.source(p),'assets/dungeon/corpse-bag-v3/marked.png','old corpses with no identity remain sacks');
  N.setDemoFlag(flag,false);const save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
  try{assert.equal(g.SaveSystem.runAtomic(()=>N.setDemoFlag(flag,true),{trigger:'manual'}).saved,false);assert.equal(A.isGoreEnabled(),false,'failed save rolls back the flag');}finally{g.SaveSystem.saveNow=save;}
  N.setDemoFlag(flag,true);g.SaveSystem.clearAllLocalProgress();assert.equal(A.isGoreEnabled(),false);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('real dialogue setFlag effect and realtime save carry the switch',async()=>{
 const triggers=JSON.parse(fs.readFileSync(triggerPath,'utf8'));
 triggers.entries[0].effects.push({type:'setFlag',params:{flag,value:true}});
 const h=await boot(false,{jsonOverrides:{[triggerPath]:triggers}});
 try{
  const g=h.g;assert.equal(g.DungeonCorpseArt.isGoreEnabled(),false);
  // Exercise the same dialogue effect whether the intro is automatic or opened from the NPC menu.
  if(!g.DialogueUI.isDialogueOpen()){
   g.GameEngine.setState('M0_Base_Inside_lv_1',10,4);g.GameTime.reset({totalTicks:54});
   await g.NPCSystem.openMenu('npc.supervisor.manager');g.NPCSystem.menu.choose(0);await h.drain();
  }
  assert.equal(g.DialogueUI.isDialogueOpen(),true);endDialogue(g);await h.drain();
  assert.equal(g.DungeonCorpseArt.isGoreEnabled(),true);
  assert.equal(g.SaveSystem.buildSnapshotForDebug().player.npcDemo.flags[flag],true);
  assert.equal(g.SaveSystem.saveNow('manual'),true);
  const realtime=JSON.parse(g.localStorage.getItem(g.SaveSystem.getStatus().realtimeKey));assert.ok(JSON.stringify(realtime).includes(flag));
  const storage=Object.fromEntries(Array.from({length:g.localStorage.length},(_,i)=>{const k=g.localStorage.key(i);return[k,g.localStorage.getItem(k)];}));
  const reload=await boot(false,{storage});try{assert.equal(reload.g.DungeonCorpseArt.isGoreEnabled(),true);assert.deepEqual(reload.errors,[]);}finally{await reload.close();}
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
