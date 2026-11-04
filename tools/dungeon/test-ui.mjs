import assert from 'node:assert/strict';
import {boot} from './fixture.mjs';
const h=await boot(false);const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const g=h.g,D=g.DungeonRuntime,E=g.GameEngine;g.DialogueUI.close();g.CharacterAttributes.setState({character_creation_completed:true});g.document.getElementById('character-creation-overlay').classList.add('hidden');E.setState('M0_Field_02',7,7);assert.ok(D.enter());
 let s=D.getSim();s.enemies=[];E.getMap().enemies=[];for(const d of s.doors)d.closed=false;
 let clock=0,sequence=0;const frames=new Map();g.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};g.cancelAnimationFrame=id=>frames.delete(id);Object.defineProperty(g.performance,'now',{value:()=>clock});
 const frame=ms=>{clock+=ms;const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn(clock);};
 const at=k=>{E.setState(D.getRun().mapId,k%s.map.width,Math.floor(k/s.map.width));D.sync();};
 const root=g.document.querySelector('.du-modal'),button=text=>Array.from(root.querySelectorAll('button')).find(b=>b.textContent.trim()===text);
 const battery=g.InventoryEquipment.getAllItemIds().find(id=>id.includes('battery')),p=s.lootPoints[0];
 D.config().pool.batches=[{id:'ui-only',items:[{item_id:battery,stock:20,rarity:'rare'}]}];D.config().search.container.emptyChance=0;D.config().search.container.weights=[0,1,0];D.config().search.tickMs=80;D.config().search.revealPauseMs=40;
 at(p.access[0]);g.DungeonPanel.openPoint('container',p.uid);frame(90);assert.equal(D.getPending(),null);assert.ok(button('开始搜索'),JSON.stringify({ui:root.textContent,opened:p.search.opened,error:D.lastError()}));assert.equal(p.search.items.filter(i=>i.revealed).length,0);assert.equal(g.document.querySelector('#minimap').hidden,true);
 button('开始搜索').click();frame(90);frame(30);assert.ok(root.querySelector('progress').value>1/3&&root.querySelector('progress').value<1,'whole-item progress');
 button('暂停').click();const pausedTicks=g.GameTime.getState().totalTicks;const fraction=p.search.items[0].fraction;assert.ok(fraction>0);frame(200);assert.equal(g.GameTime.getState().totalTicks,pausedTicks);
 button('继续搜索').click();frame(90);frame(90);const first=root.querySelector('[data-reveal-key="'+p.uid+':0"]');assert.ok(first.classList.contains('loot-discovered'));
 await sleep(60);frame(90);assert.equal(root.querySelector('[data-reveal-key="'+p.uid+':0"]'),first,'earlier reward row survives subsequent tick renders');
 // Hidden tabs pause instead of advancing missed ticks.
 Object.defineProperty(g.document,'hidden',{configurable:true,value:true});g.document.dispatchEvent(new g.Event('visibilitychange'));const ticks=g.GameTime.getState().totalTicks;frame(10000);assert.equal(g.GameTime.getState().totalTicks,ticks);Object.defineProperty(g.document,'hidden',{configurable:true,value:false});
 const sound=root.querySelector('[data-reveal-sound]'),old=sound.getAttribute('aria-pressed');sound.click();assert.notEqual(sound.getAttribute('aria-pressed'),old,'sound control reaches shared handler');
 g.DungeonPanel.close();assert.equal(g.document.querySelector('#minimap').hidden,false);
 const pos=JSON.stringify(E.getState()),turnTicks=g.GameTime.getState().totalTicks;g.document.dispatchEvent(new g.KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}));assert.equal(JSON.stringify(E.getState()),pos);assert.equal(g.GameTime.getState().totalTicks,turnTicks);assert.equal(g.SceneCtx.getFacingDir(),2);
 for(const id of ['minimap-in','minimap-out','minimap-fit','minimap-follow']){g.document.getElementById(id).click();assert.equal(JSON.stringify(E.getState()),pos);assert.equal(g.GameTime.getState().totalTicks,turnTicks);}
 at(s.map.exit);assert.ok(!root.hidden);assert.ok(button('撤离'));g.DungeonPanel.close();assert.ok(root.hidden);g.DungeonPanel.refresh();assert.ok(root.hidden,'closing passage does not immediately reopen it');
 at(s.map.entry);at(s.map.exit);assert.ok(!root.hidden);assert.ok(button('撤离'));
 console.log('Two-stage UI, whole-item progress, pause/background, stable reward rows, sound toggle, minimap/Shift no-tick controls and exit auto-popup pass');
 assert.deepEqual(h.errors,[]);
}finally{await h.close();}
