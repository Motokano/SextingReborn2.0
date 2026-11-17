import assert from 'node:assert/strict';
import {boot} from './dungeon/fixture.mjs';
const full=process.argv.includes('--svelte'),h=await boot(full),plain=v=>JSON.parse(JSON.stringify(v));
try{
 const g=h.g,D=g.DungeonRuntime,K=g.ManufacturingKnowledge,Q=g.RuinsRecipeStudy,C=g.RuinsContentConfig,E=g.GameEngine;
 await D.ready;
 // This fixture jumps past the intro into a dungeon. Release its dialogue
 // through the real controller before testing clicks on another modal.
 g.DialogueUI.close();await h.drain();
 assert.equal(g.DialogueUI.isDialogueOpen(),false);
 assert.equal(g.SvelteInteractions?.overlays.active()??false,false);
 g.CharacterAttributes.setState({character_creation_completed:true});E.setState('M0_Field_02',7,7);
 const all=K.catalog.filter(r=>r.unlock==='exploration');assert.equal(all.length,47);
 assert.ok(all.every(r=>!K.knows(r.id)),'fresh character has no free research recipes');
 const level=g.InventoryEquipment.getSkillLevel;g.InventoryEquipment.getSkillLevel=()=>100;
 assert.equal(K.getState().learned.length,25,'24 level-one basics and linked wire processing, with no free research recipes');
 assert.ok(all.every(r=>!K.knows(r.id)));g.InventoryEquipment.getSkillLevel=level;
 const clean=plain(K.getState()),oldKnows=g.Hunting.knows;g.Hunting.knows=id=>['snare_tightening','snare_anchor'].includes(id);
 assert.ok(K.knows('existing_hunting.consumable_hunting_snare'));K.getState();g.Hunting.knows=()=>false;
 assert.ok(K.knows('existing_hunting.consumable_hunting_snare'),'legacy knowledge persists after its flags are normalized');g.Hunting.knows=oldKnows;K.restore(clean);
 // A fixed study scenario; the designer's saved range may legitimately differ.
 D.config().content={...plain(C.legacyV15),recipeStudy:{enabled:true,count:1,recipeIds:all.map(r=>r.id)}}; // Legacy V15 study/save compatibility; rare V16 placement has its own suite.
 const [a,b,c]=all;const originalConfig=plain(D.config().content);
 assert.equal(originalConfig.recipeStudy.recipeIds.length,47);
 const rules=patch=>C.resolve({overrides:{...originalConfig,recipeStudy:{...originalConfig.recipeStudy,...patch}}});
 for(const patch of [{recipeIds:[]},{recipeIds:['bad.id']},{recipeIds:[a.id,a.id]},{recipeIds:[K.catalog.find(r=>r.unlock==='skill_level').id]},{count:-1},{count:1.5},{count:4},{enabled:'yes'}])assert.throws(()=>rules(patch));
 assert.deepEqual(plain(C.resolve({overrides:originalConfig,ticketOverrides:{recipeStudy:{recipeIds:[b.id]}}}).recipeStudy.recipeIds),[b.id],'ticket replaces allowlist instead of merging it');
 assert.equal(rules({enabled:false,recipeIds:[]}).recipeStudy.enabled,false);
 const baseline=g.SaveSystem.buildSnapshotForDebug();
 K.grant(a.id);D.config().content.recipeStudy.recipeIds=[a.id,b.id];g.RuinsSeed.create=()=>full?'recipe-study-svelte':'recipe-study-classic';
 assert.ok(D.enter());let s=D.getSim();
 function safe(){s=D.getSim();s.enemies=[];E.getMap().enemies=[];for(const door of s.doors)door.closed=false;}
 function desk(){return s.insightPoints.find(Q.isPoint);}
 function at(k){E.setState(D.getRun().mapId,k%s.map.width,Math.floor(k/s.map.width));D.sync();}
 function approach(){const p=desk();at(p.access[0]);g.SceneCtx.setFacingDir(g.RuinsEncounter.direction(s.player.cell,p.cell,s.map.width));D.sync();return p;}
 const ticks=()=>g.GameTime.getState().totalTicks;
 safe();let p=approach();assert.ok(p);assert.equal(s.insightPoints.filter(Q.isPoint).length,1);
 assert.ok(s.map.rooms.find(r=>r.id===p.roomId).inner.includes(p.cell));
 assert.ok(D.blocked(p.cell%s.map.width,Math.floor(p.cell/s.map.width)));
 assert.deepEqual(plain(Q.eligible(p)),[b.id]);assert.equal(Q.choice(s,p),b.id);assert.equal(D.begin('insight',p.uid),false,'cannot use potential-reward branch');
 g.DungeonPanel.openPoint('recipe',p.uid);const modal=g.document.querySelector('.du-modal');
 function clickStudy(label){
  const button=[...modal.querySelectorAll('button')].find(b=>b.textContent===label);
  assert.ok(button?.isConnected,`${label}: current study button is attached`);
  assert.equal(button.disabled,false);button.click();
  assert.equal(D.getPending()?.kind,'recipe',`${label}: click starts studying`);
  assert.equal(D.getPending().id,p.uid);
 }
 assert.ok(modal.textContent.includes('研读资料'));assert.ok(!modal.textContent.includes(b.name),'future recipe name stays hidden');
 assert.ok(modal.querySelector('img').src.endsWith('/available.png'));
 const firstClickTick=ticks();clickStudy('研读资料');
 [...modal.querySelectorAll('button')].find(b=>b.textContent==='停止').click();
 assert.equal(D.getPending(),null);assert.equal(ticks(),firstClickTick,'starting and stopping through the UI costs no tick');
 const untouched=g.SaveSystem.buildSnapshotForDebug();assert.ok(g.SaveSystem.applySnapshotForDebug(untouched));safe();p=approach();assert.equal(Q.choice(s,p),b.id,'reload cannot reroll');
 let t=ticks();assert.ok(D.begin('recipe',p.uid));D.cancel();assert.equal(ticks(),t);assert.equal(p.used,false);
 assert.ok(D.begin('recipe',p.uid));at(s.map.entry);assert.equal(D.completeTick(),false);assert.equal(ticks(),t);p=approach();
 assert.ok(D.begin('recipe',p.uid));D.receiveHit();assert.equal(D.completeTick(),false);assert.equal(K.knows(b.id),false);
 const disabled=g.BuffSystem.hasActionDisabled;g.BuffSystem.hasActionDisabled=()=>true;assert.equal(D.begin('recipe',p.uid),false);g.BuffSystem.hasActionDisabled=disabled;
 const inventory=plain(g.InventoryEquipment.getState()),potential=g.InventoryEquipment.getPotential(),reward=plain(s.reward.point);
 assert.ok(D.begin('recipe',p.uid));const stored=g.Storage.prototype.setItem;
 g.Storage.prototype.setItem=function(key,value){if(key===g.SaveSystem.getStatus().realtimeKey)throw Error('fixture storage full');return stored.call(this,key,value);};
 assert.equal(D.completeTick(),false);g.Storage.prototype.setItem=stored;
 safe();p=approach();assert.equal(p.used,false);assert.equal(p.learnedRecipeId,null);assert.equal(K.knows(b.id),false);assert.equal(ticks(),t);assert.deepEqual(plain(g.InventoryEquipment.getState()),inventory);
 g.DungeonPanel.openPoint('recipe',p.uid);clickStudy('研读资料');
 assert.equal(D.completeTick(),true);g.DungeonPanel.close({silent:true});assert.equal(ticks(),t+1);assert.equal(K.knows(b.id),true);assert.equal(K.knows(c.id),false);assert.equal(p.learnedRecipeId,b.id);assert.equal(p.used,true);
 assert.equal(g.InventoryEquipment.getPotential(),potential);assert.deepEqual(plain(s.reward.point),reward,'recipe desk adds no exploration point reward');
 assert.equal(D.begin('recipe',p.uid),false);assert.equal(D.completeTick(),false);assert.equal(ticks(),t+1);
 g.DungeonPanel.openPoint('recipe',p.uid);assert.ok(modal.textContent.includes(b.name));assert.ok(modal.querySelector('img').src.endsWith('/used.png'));assert.ok([...modal.querySelectorAll('button')].find(b=>b.textContent==='已研究').disabled);g.DungeonPanel.close({silent:true});
 const learned=g.SaveSystem.buildSnapshotForDebug();assert.ok(learned.manufacturing_knowledge.learned.includes(b.id));assert.ok(g.SaveSystem.applySnapshotForDebug(learned));safe();p=approach();assert.equal(p.used,true);assert.ok(K.knows(b.id));
 const bad=plain(learned);bad.manufacturing_knowledge.learned.push('invalid.recipe');assert.equal(g.SaveSystem.applySnapshotForDebug(bad),false);assert.ok(K.knows(b.id));
 const badPoint=plain(learned);badPoint.dungeon.sim.insightPoints.find(Q.isPoint).learnedRecipeId=c.id;assert.equal(g.SaveSystem.applySnapshotForDebug(badPoint),false);
 D.config().content.recipeStudy.recipeIds=[c.id];at(s.map.exit);assert.ok(D.descend());safe();p=approach();assert.deepEqual(plain(p.recipeIds),[a.id,b.id],'active expedition keeps its allowlist on next floor');
 // A fully known scope now offers one potential reward. It shares the same
 // consumed flag as recipes: learning the last recipe never grants a second reward.
 t=ticks();const beforePotential=g.InventoryEquipment.getPotential(),known=plain(K.getState()),points=plain(s.reward.point);
 const base=Q.fallbackPotential(s);assert.equal(base,1500);
 D.config().content.insight.rewards.desk=999;
 assert.equal(Q.fallbackPotential(s),base,'reward is three times the expedition book-desk standard, unaffected by live edits');
 g.DungeonPanel.openPoint('recipe',p.uid);
 assert.ok(modal.textContent.includes('这里的配方已全部掌握'));assert.ok(modal.textContent.includes('潜能 +1500'));
 assert.equal([...modal.querySelectorAll('button')].find(b=>b.textContent==='研读并获得潜能').disabled,false);
 assert.equal(g.InventoryEquipment.getPotential(),beforePotential,'opening the panel does not claim the reward');
 assert.ok(D.begin('recipe',p.uid));D.cancel();assert.equal(ticks(),t);assert.equal(p.used,false);
 assert.ok(D.begin('recipe',p.uid));D.receiveHit();assert.equal(D.completeTick(),false);assert.equal(p.used,false);
 const allKnown=g.SaveSystem.buildSnapshotForDebug();assert.ok(g.SaveSystem.applySnapshotForDebug(allKnown));safe();p=approach();
 assert.ok(D.begin('recipe',p.uid));
 g.Storage.prototype.setItem=function(key,value){if(key===g.SaveSystem.getStatus().realtimeKey)throw Error('fixture storage full');return stored.call(this,key,value);};
 assert.equal(D.completeTick(),false);g.Storage.prototype.setItem=stored;
 safe();p=approach();assert.equal(ticks(),t);assert.equal(p.used,false);assert.equal(p.potentialReward,undefined);assert.equal(g.InventoryEquipment.getPotential(),beforePotential);
 g.DungeonPanel.openPoint('recipe',p.uid);clickStudy('研读并获得潜能');
 assert.ok(D.completeTick());g.DungeonPanel.close({silent:true});
 assert.equal(ticks(),t+1);assert.equal(g.InventoryEquipment.getPotential(),beforePotential+base);assert.equal(p.used,true);assert.equal(p.learnedRecipeId,null);assert.deepEqual(plain(p.potentialReward),{base,amount:base});
 assert.deepEqual(plain(K.getState()),known,'potential reward grants no additional recipe');assert.deepEqual(plain(s.reward.point),points,'no extra exploration settlement reward');
 g.DungeonPanel.openPoint('recipe',p.uid);assert.ok(modal.textContent.includes('已获得潜能：1500'));assert.ok(modal.querySelector('img').src.endsWith('/used.png'));assert.ok([...modal.querySelectorAll('button')].find(b=>b.textContent==='已领取').disabled);g.DungeonPanel.close({silent:true});
 assert.equal(D.begin('recipe',p.uid),false);assert.equal(D.begin('insight',p.uid),false);assert.equal(Q.grant(s,p),null);assert.equal(D.completeTick(),false);assert.equal(ticks(),t+1);
 const rewarded=g.SaveSystem.buildSnapshotForDebug();assert.ok(g.SaveSystem.applySnapshotForDebug(rewarded));safe();p=approach();
 assert.equal(D.begin('recipe',p.uid),false);assert.equal(g.InventoryEquipment.getPotential(),beforePotential+base);
 for(const change of [p=>p.used=false,p=>p.learnedRecipeId=a.id,p=>p.potentialReward.base++,p=>p.potentialReward.amount=-1,p=>delete p.potentialReward]){
  const invalid=plain(rewarded);change(invalid.dungeon.sim.insightPoints.find(Q.isPoint));assert.equal(g.SaveSystem.applySnapshotForDebug(invalid),false,'reject inconsistent reward receipts');
 }
 // Follow the existing potential award pipeline, including its gain multiplier,
 // and persist the amount actually credited for the used-state UI.
 assert.ok(g.SaveSystem.applySnapshotForDebug(allKnown));safe();p=approach();const gain=g.BuffSystem.getBattlePotentialGainMultiplier;
 g.BuffSystem.getBattlePotentialGainMultiplier=()=>1.5;
 assert.ok(D.begin('recipe',p.uid));assert.ok(D.completeTick());g.BuffSystem.getBattlePotentialGainMultiplier=gain;
 assert.equal(g.InventoryEquipment.getPotential(),beforePotential+2250);assert.deepEqual(plain(p.potentialReward),{base:1500,amount:2250});
 D.die();assert.ok(K.knows(a.id)&&K.knows(b.id));const death=g.SaveSystem.buildSnapshotForDebug();assert.ok(g.SaveSystem.applySnapshotForDebug(death));assert.ok(K.knows(b.id),'knowledge survives death and reload');
 const old=plain(baseline);delete old.manufacturing_knowledge;assert.ok(g.SaveSystem.applySnapshotForDebug(old));assert.equal(K.knows(b.id),false,'loading old save does not leak current-session knowledge');
 D.config().content=plain(C.legacyV14);g.RuinsSeed.create=()=>full?'recipe-old-svelte':'recipe-old-classic';assert.ok(D.enter());safe();assert.equal(s.insightPoints.filter(Q.isPoint).length,0);
 const oldActive=g.SaveSystem.buildSnapshotForDebug();D.config().content=originalConfig;assert.ok(g.SaveSystem.applySnapshotForDebug(oldActive));safe();assert.equal(s.insightPoints.filter(Q.isPoint).length,0,'old floor receives no new point');at(s.map.exit);assert.ok(D.descend());assert.equal(D.getSim().insightPoints.filter(Q.isPoint).length,0,'old expedition retains old configuration');
 assert.deepEqual(h.errors,[]);
 console.log(`PASS (${full?'Svelte':'classic'}): generated placement, locked scope, actual recipe and potential buttons, one recipe OR triple book-desk potential, one tick, no extra exploration reward, interruption, both failed-save rollbacks, receipt validation, repeat/reload protection, potential multiplier, death and legacy saves.`);
}finally{await h.close();}
