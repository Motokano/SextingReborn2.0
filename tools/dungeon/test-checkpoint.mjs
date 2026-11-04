import assert from 'node:assert/strict';
import {boot} from './fixture.mjs';
const h=await boot(true),sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const g=h.g,D=g.DungeonRuntime,E=g.GameEngine,C=g.DungeonCheckpoint,P=g.DungeonPanel,IE=g.InventoryEquipment;
 g.CharacterAttributes.setState({character_creation_completed:true,characterName:'入口检查'});
 g.DialogueUI.close();await h.drain();
 const root=g.document.querySelector('.du-modal'),button=text=>[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
 const ticks=()=>g.GameTime.getState().totalTicks;
 E.setState('M0_Field_02',4,7);assert.equal(C.canAccess(),false);assert.equal(D.canPrepare(),false);assert.equal(D.enter(),false);
 await g.NPCSystem.openMenu(C.id());assert.equal(root.hidden,true,'direct remote interaction stays closed');
 for(const [map,x,y]of [['M0_Field_02',8,7],['M0_JInmuTown_01',2,7]]){
  E.setState(map,x-1,y);assert.equal(C.canAccess(),true);assert.equal(E.getNpcAt(x,y),C.id());assert.equal(E.isWalkable(x,y),false);assert.equal(E.moveTo(x,y),false);
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]])assert.equal(E.isWalkable(x+dx,y+dy),true,'only one blocking tile');
  assert.equal(E.moveTo(x,y+1),false,'cannot cut the corner of the checkpoint');
 }
 E.setState('M0_Field_02',7,7);let t=ticks();await g.NPCSystem.openMenu(C.id());assert.equal(root.hidden,false);assert.ok(button('进入废墟'));assert.ok(button('交谈'));assert.equal(button('任务'),undefined);assert.equal(button('回收物品'),undefined);assert.ok(g.NPCSystem.isMenuOpen());
 g.SceneCtx.actions.tryIntentMove(7,8,0,1,'keyboard');assert.equal(E.getState().y,7,'menu blocks world movement');assert.equal(ticks(),t);
 button('交谈').click();assert.ok(root.textContent.includes('封好口的'));root.querySelector('[aria-label="返回"]').click();button('进入废墟').click();assert.equal(root.querySelectorAll('select').length,2);assert.equal(ticks(),t);root.querySelector('[aria-label="返回"]').click();P.close();
 // Travel is charged normally; opening menus and choosing dialogue is free.
 E.setState('M0_Field_02',5,7);t=ticks();assert.ok(C.approach(8,7));await sleep(700);await h.drain();assert.equal(C.canAccess(),true);assert.ok(P.isEntryOpen());assert.equal(ticks(),t+2);P.close();
 E.setState('M0_Field_02',4,7);assert.ok(C.approach(8,7));g.document.dispatchEvent(new g.KeyboardEvent('keydown',{key:'Escape'}));const stopped=JSON.stringify(E.getState());await sleep(350);assert.equal(JSON.stringify(E.getState()),stopped);assert.equal(P.isEntryOpen(),false);
 console.log('Two single-cell checkpoints, adjacent access, corners, real movement ticks, approach cancellation and compact NPC menu pass');
 E.setState('M0_Field_02',7,7);
 const battery=IE.getAllItemIds().find(x=>x.includes('battery'));IE.putItemIntoDefaultContainer({item_id:battery,count:1});
 D.config().tickets=[{id:'test-entry',floor:3,name:'测试票',item_id:battery}];D.config().clues=[{id:'test-clue',floor:2,name:'测试线索'}];g.DungeonContent={hasClue:()=>true};
 P.prepare();const ticket=root.querySelector('[aria-label="起始层"]'),clue=root.querySelector('[aria-label="线索"]');ticket.value='test-entry';ticket.dispatchEvent(new g.Event('change'));clue.value='test-clue';clue.dispatchEvent(new g.Event('change'));assert.ok(button('进入').disabled);P.close();
 let tasks=[{id:'real-task',name:'测试服务任务',state:'available'}];g.DungeonContent.checkpointTasks=()=>tasks;g.DungeonContent.performCheckpointTask=()=>{IE.addPotential(5);return true;};
 P.showCheckpoint();assert.ok(button('任务'));const old=IE.getPotential(),save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;assert.equal(C.task('real-task'),false);assert.equal(IE.getPotential(),old);g.SaveSystem.saveNow=save;assert.equal(C.task('real-task'),true);assert.equal(IE.getPotential(),old+5);tasks=[];P.close();delete g.DungeonContent;
 assert.ok(D.enter());let s=D.getSim();s.enemies=[];E.getMap().enemies=[];
 const c={uid:'checkpoint-bag',kind:'corpse',name:'尸体',cell:s.player.cell,marked:false,search:{opened:false,complete:false,cursor:0,items:[{item_id:battery,count:10,rarity:'rare',revealed:false,claimed:false,ticks:0}]}};s.corpses.push(c);assert.ok(D.mark(c.uid));
 E.setState(D.getRun().mapId,s.map.exit%s.map.width,Math.floor(s.map.exit/s.map.width));assert.ok(D.withdraw());P.close();assert.equal(E.getState().mapId,'M0_Field_02');assert.equal(E.getState().x,7);assert.equal(E.getState().y,7);assert.equal(C.outstanding(),1);
 P.showCheckpoint();assert.ok([...root.querySelectorAll('button')].some(b=>b.textContent==='回收物品1'));P.close();const b=D.getRecovered()[0];t=ticks();assert.ok(D.openBag(b.uid));assert.equal(b.allocation.npc[0].count,3);assert.equal(C.outstanding(),1);assert.ok(D.claimBag(b.uid,0));
 for(let i=0;!b.allocation.player[0].claimed&&i<8;i++){assert.equal(C.outstanding(),1,'partially claimed bag keeps its badge');IE.removeCarriedItemsByTemplateId(battery,IE.countCarriedItemsByTemplateId(battery));assert.ok(D.claimBag(b.uid,0));}
 assert.equal(C.outstanding(),0);assert.equal(ticks(),t);const count=IE.countCarriedItemsByTemplateId(battery),snapshot=g.SaveSystem.buildSnapshotForDebug();assert.ok(g.SaveSystem.applySnapshotForDebug(snapshot));assert.equal(D.claimBag(b.uid,0),false);assert.equal(IE.countCarriedItemsByTemplateId(battery),count);
 E.setState('M0_Field_02',4,7);assert.equal(D.claimBag(b.uid,0),false);P.prepare();assert.ok(root.hidden);
 console.log('Ticket/clue mismatch, conditional tasks with save rollback, return position, badge, real 30% recovery and exactly-once save pass');
 assert.deepEqual(h.errors,[]);
}finally{await h.close();}
