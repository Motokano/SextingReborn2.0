import assert from 'node:assert/strict';
import {boot} from './fixture.mjs';
const h=await boot(false);
try{
 const g=h.g,D=g.DungeonRuntime,IE=g.InventoryEquipment,E=g.GameEngine,S=g.Survival,N=g.RuinsEncounter;
 g.CharacterAttributes.setState({character_creation_completed:true});E.setState('M0_Field_02',7,7);assert.ok(D.enter());
 let s=D.getSim();const safe=()=>{s=D.getSim();s.enemies=[];E.getMap().enemies=[];for(const d of s.doors)d.closed=false;};safe();
 const at=k=>{E.setState(D.getRun().mapId,k%s.map.width,Math.floor(k/s.map.width));D.sync();};
 const ticks=()=>g.GameTime.getState().totalTicks;
 const battery=IE.getAllItemIds().find(id=>id.includes('battery'));
 const item=(rarity='common',count=1)=>({item_id:battery,count,rarity,revealed:false,claimed:false,ticks:0});
 const corpse=(id,items)=>{const p={uid:id,kind:'corpse',name:'尸体',cell:s.player.cell,marked:false,search:{opened:false,complete:false,cursor:0,items}};s.corpses.push(p);return p;};
 let c=corpse('fees',[item('exceptional',3)]),t=ticks();
 assert.ok(D.windowAction('open',c.uid));assert.equal(ticks(),++t);assert.equal(c.search.opened,false);
 assert.ok(D.windowAction('close',c.uid));assert.equal(ticks(),++t);
 assert.ok(D.begin('search',c.uid));D.setProgress(.4);D.cancel();assert.equal(c.search.items[0].fraction,.4);assert.ok(D.begin('search',c.uid));assert.equal(D.progressState().fraction,.4);
 assert.ok(D.completeTick());assert.equal(c.search.items[0].ticks,1);assert.equal(c.search.items[0].requiredTicks,5);assert.equal(D.mark(c.uid),false);
 D.config().search.rarities.exceptional.ticks=1;
 for(let i=0;i<3;i++){assert.ok(D.completeTick());assert.equal(c.search.items[0].revealed,false);}
 assert.ok(D.completeTick());assert.equal(c.search.items[0].revealed,true);D.config().search.rarities.exceptional.ticks=5;
 t=ticks();assert.ok(D.claim(c.uid,0));assert.equal(ticks(),t+1);assert.equal(c.search.items[0].claimed,true);assert.equal(D.getPending(),null);
 const rewardCount=s.reward.point.length;const empty=corpse('empty',[]);assert.ok(D.begin('search',empty.uid));assert.ok(D.completeTick());assert.equal(empty.search.complete,true);assert.equal(s.reward.point.length,rewardCount,'corpses do not count as independent POIs');
 console.log('Corpse window/claim ticks, resumable fractions, locked durations, empty search and reward identity pass');

 // Whole-stack pickup must not remove a partial stack when it fails.
 c=corpse('full',[{...item('rare',100000),revealed:true}]);c.search.opened=c.search.complete=true;c.search.cursor=1;
 const carried=()=>JSON.stringify([IE.getPocketArray(),IE.getVestArray(),IE.getBackpackArray()]);const inv=carried();t=ticks();assert.equal(D.claim(c.uid,0),false);assert.equal(carried(),inv);assert.equal(c.search.items[0].taken,0);assert.equal(ticks(),t);
 // Allocation is private until opening, and locked at marking, independently of subsequent RNG/config.
 const sealed=corpse('sealed',[item('rare',10)]);t=ticks();assert.ok(D.mark(sealed.uid));assert.equal(ticks(),t+1);
 const allocation=JSON.stringify(D.getRun().marked.at(-1).allocation);assert.equal(D.getRun().marked.at(-1).allocation.npc[0].count,3);
 D.config().search.commission=.8;
 at(s.map.exit);assert.ok(D.descend());safe();let b=D.getRecovered().find(b=>b.uid.endsWith(':sealed'));assert.ok(b);assert.equal(JSON.stringify(b.allocation),allocation);assert.equal(b.opened,false);
 at(s.map.exit);assert.ok(D.withdraw());assert.equal(D.claimBag(b.uid,0),false,'sealed bag cannot be claimed');
 assert.ok(D.openingProgress(b.uid,.4));const snapshot=g.SaveSystem.buildSnapshotForDebug();assert.ok(g.SaveSystem.applySnapshotForDebug(snapshot));b=D.getRecovered().find(x=>x.uid===b.uid);assert.equal(b.openingProgress,.4);
 assert.ok(D.openBag(b.uid));assert.equal(JSON.stringify(b.allocation),allocation);D.config().search.commission=.3;
 console.log('All-or-nothing world pickup, commission lock, floor handoff, sealed bag protection and opening save pass');

 // Failed entry must restore the ticket and the previous completed expedition.
 E.setState('M0_Field_02',7,7);IE.putItemIntoDefaultContainer({item_id:battery,count:1});
 D.config().tickets=[{id:'audit-ticket',item_id:battery,floor:2,name:'测试门票'}];
 const owned=IE.countCarriedItemsByTemplateId(battery),previous=JSON.stringify(D.getState()),save=g.SaveSystem.saveNow;
 g.SaveSystem.saveNow=()=>false;assert.equal(D.enter({ticket:'audit-ticket'}),false);g.SaveSystem.saveNow=save;
 assert.equal(IE.countCarriedItemsByTemplateId(battery),owned);assert.equal(D.active(),false);assert.equal(D.getRun().status,'settled');assert.equal(D.lastError(),'保存失败');
 let applied=[];D.config().clues=[{id:'audit-clue',floor:3,name:'测试线索'}];g.DungeonContent={hasClue:()=>true,apply:(next)=>{applied.push(next.map.floor);return true;}};
 assert.ok(D.enter({clue:'audit-clue'}));safe();assert.deepEqual(applied,[]);
 at(s.map.exit);const floorOne=D.getRun().mapId;g.SaveSystem.saveNow=()=>false;assert.equal(D.descend(),false);g.SaveSystem.saveNow=save;safe();assert.equal(D.getRun().mapId,floorOne);assert.equal(D.getRun().records.length,0);
 assert.ok(D.descend());safe();assert.deepEqual(applied,[]);at(s.map.exit);assert.ok(D.descend());safe();assert.deepEqual(applied,[3]);
 at(s.map.exit);const potential=IE.getPotential();g.SaveSystem.saveNow=()=>false;assert.equal(D.withdraw(),false);g.SaveSystem.saveNow=save;safe();assert.equal(IE.getPotential(),potential);assert.equal(D.getRun().status,'active');assert.equal(D.getReceipt(),null);
 console.log('Entry ticket rollback, floor rollback, reward rollback and clue generation on required floor pass');

 // The recovery interruption rule differs intentionally from harvesting.
 const base=s.harvestPoints[0]||s.lootPoints[0],p={...structuredClone(base),uid:'audit-water',id:'water',used:false,recovery:{remaining:2,progress:0,part:null,fraction:0}};
 s.recoveryPoints=[p];at(base.access[0]);S.setState({thirst:20});D.sync();const perception=N.perception;N.perception=()=>({known:[true]});
 assert.ok(D.begin('recovery',p.uid),'merely seeing an enemy does not prevent recovery');assert.ok(D.completeTick());assert.equal(p.recovery.remaining,1);N.perception=perception;
 S.setState({thirst:20});assert.ok(D.begin('recovery',p.uid));D.setProgress(.35);g.CharacterAttributes.applyCombatDestroy('lhand',1);assert.equal(D.getPending(),null);assert.equal(p.recovery.remaining,1);assert.equal(p.recovery.fraction,.35);
 S.setState({thirst:100});D.sync();t=ticks();assert.equal(D.begin('recovery',p.uid),false);assert.equal(ticks(),t);
 S.setState({thirst:20});assert.ok(D.begin('recovery',p.uid));S.advanceTick();assert.equal(D.getPending(),null,'another action interrupts recovery');assert.equal(p.recovery.remaining,1);
 console.log('Visible-enemy recovery, confirmed-hit interruption, fraction retention and useless-action rejection pass');

 // Malformed optional map memory cannot destroy the rest of an otherwise valid save.
 const corrupt=g.SaveSystem.buildSnapshotForDebug();corrupt.dungeon.sim.exploration.tiles=[];const remaining=corrupt.dungeon.sim.harvestPoints.map(p=>p.remaining);
 assert.ok(g.SaveSystem.applySnapshotForDebug(corrupt));safe();assert.equal(s.exploration.tiles.length,s.map.tiles.length);assert.ok(s.exploration.tiles.filter(t=>t>=0).length<s.map.tiles.length/2);assert.deepEqual(s.harvestPoints.map(p=>p.remaining),remaining);
 const hp=s.harvestPoints[0];hp.remaining=0;hp.used=true;at(hp.access[0]);g.SceneCtx.setFacingDir(N.direction(s.player.cell,hp.cell,s.map.width));D.observe();assert.equal(s.exploration.marks['resource:'+hp.cell]?.state,'spent');
 // Real death path retains deposited potential and marked bags, discards map rewards.
 at(s.map.entry);const doomed=corpse('death-sealed',[item('rare',4)]);assert.ok(D.mark(doomed.uid));const retained=IE.getPotential();S.setDead('audit');D.afterTick();await h.drain();assert.equal(D.getRun().status,'dead');assert.equal(IE.getPotential(),retained);assert.equal(D.getReceipt(),null);assert.equal(D.getRun().records.length,0);assert.ok(D.getRecovered().some(b=>b.uid.endsWith(':death-sealed')));
 console.log('Optional-memory repair, exhausted resource minimap state and actual death settlement pass');
 assert.deepEqual(h.errors,[]);
}finally{await h.close();}
