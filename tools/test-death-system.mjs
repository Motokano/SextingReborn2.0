import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { boot } from './dungeon/fixture.mjs';
const full = process.argv.includes('--svelte');
const copy = x => JSON.parse(JSON.stringify(x));
const storageOf = g => Object.fromEntries(Object.keys(g.localStorage).map(k => [k,g.localStorage.getItem(k)]));
const enableCrypto = g => {Object.defineProperty(g.crypto,'subtle',{value:webcrypto.subtle,configurable:true});g.TextEncoder=TextEncoder;g.TextDecoder=TextDecoder;};
const credentials={account:'isolated-death-test',password:'test-only'};
let transferCode, activeSnapshot;
let h = await boot(full);
async function finishDialogue() {
 const g=h.g;
 assert(g.DialogueUI.isDialogueOpen());
 if(g.DialogueUI.getView().typing)g.DialogueUI.next();
 g.DialogueUI.next();await h.drain();
}
try {
 let g=h.g, S=g.SaveSystem, D=g.DeathSystem, I=g.InventoryEquipment, C=g.CharacterAttributes;
 C.setState({character_creation_completed:true,characterName:'死亡回归'});
 I.getSkillsState().combat_basic_unarmed.level=57;
 I.getSkillsState().combat_basic_unarmed.move_usage={basic_punch:123};
 I.getSkillsState().survival_strength={level:20,move_usage:{}};
 I.addPotential(1500);
 const recipe=g.ManufacturingKnowledge.catalog.find(x=>x.unlock!=='skill_level');
 g.ManufacturingKnowledge.grant(recipe.id);
 const baseline=S.buildSnapshotForDebug();
 // All three vitals use their real maxima.
 for (const part of ['head','chest','abdomen']) {
  assert(S.applySnapshotForDebug(baseline));
  C.applyCombatDestroy(part,C.getBodyPartDestroyMax(part));await h.drain();
  assert.equal(D.getState().current.reason,'vital_'+part);assert.equal(D.getState().deathCount,1);
 }
 assert(S.applySnapshotForDebug(baseline));
 const basePotential=I.getPotential(), baseItems=JSON.stringify(baseline.player.inventoryEquipment.equipment);
 assert.notEqual(baseItems,'{}');
 // Nonlethal limbs and zero damage; use the real resolved-damage entry point.
 C.applyCombatDestroy('lhand',C.getBodyPartDestroyMax('lhand'));
 C.applyCombatDestroy('head',0);await h.drain();assert.equal(D.getState().deathCount,0);
 assert.equal(g.Survival.isDead(),false);
 assert(S.applySnapshotForDebug(baseline));
 const setItem=g.Storage.prototype.setItem;
 g.Storage.prototype.setItem=function(){throw Error('quota');};
 g.GameLog.clear();
 g.GameLog.log('不会作为死亡原因的开窗消息','info');
 g.GameLog.log('── 地痞攻击你 ──','combat');
 C.applyCombatDestroy('head',C.getBodyPartDestroyMax('head'));
 // The pipeline normally writes its damage summary after applying destruction.
 g.GameLog.log('本击结算：最终伤害 50，未招架','damage');
 // Synchronous group retains equipment, even after the player has become dead.
 assert.equal(JSON.stringify(I.getState().equipment),baseItems);
 await h.drain();
 assert.equal(D.getState().deathCount,0);assert.equal(D.getState().current.phase,'pending');
 assert.equal(I.getSkillLevel('combat_basic_unarmed'),57);assert.equal(JSON.stringify(I.getState().equipment),baseItems);
 assert(D.getError());assert(D.blocked());
 const deathLog=copy(D.getLogEntries());
 assert(deathLog.some(e=>e.message==='本击结算：最终伤害 50，未招架'));
 assert(deathLog.at(-1).message.includes('头部损毁达到'));
 assert(!deathLog.some(e=>e.message.includes('开窗消息')));
 const journalBeforeRetry=g.GameLog.getEntries().length;
 const tick=g.GameTime.getState().totalTicks;
 g.Survival.advanceTick();g.GameTime.advanceTicks(5);assert.equal(g.GameTime.getState().totalTicks,tick);
 g.Storage.prototype.setItem=setItem;D.retry();
 assert.deepEqual(copy(D.getLogEntries()),deathLog);assert.equal(g.GameLog.getEntries().length,journalBeforeRetry);
 assert.equal(D.getState().deathCount,1);assert.equal(D.getState().current.phase,'awaiting_revival');
 assert.equal(I.getSkillLevel('combat_basic_unarmed'),52);assert.equal(I.getSkillLevel('survival_strength'),20);
 assert.equal(I.getState().skills.combat_basic_unarmed.move_usage.basic_punch,123);
 assert.equal(I.getPotential(),basePotential);assert(g.ManufacturingKnowledge.knows(recipe.id));
 assert(Object.values(I.getState().equipment).every(x=>x===null));
 assert.equal(D.line(),'变...求...00001号，...准');
 D.settle();g.Survival.setDead('other');await h.drain();assert.equal(D.getState().deathCount,1);
 // Startup resumes the waiting phase; no implicit choice or second loss.
 let storage=storageOf(g);await h.close();h=await boot(full,{storage});g=h.g;S=g.SaveSystem;D=g.DeathSystem;I=g.InventoryEquipment;C=g.CharacterAttributes;
 assert.equal(D.getState().current.phase,'awaiting_revival');assert.equal(D.getState().deathCount,1);
 assert.equal(I.getSkillLevel('combat_basic_unarmed'),52);
 assert.deepEqual(copy(D.getLogEntries()),deathLog,'death journal survives a reload independently of the live log');
 g.document.querySelector('#death-panel [data-action="revive"]').click();
 assert.equal(D.getState().current.phase,'revival_scene');assert(g.Survival.isDead());
 assert(g.DialogueUI.isDialogueOpen());
 assert(g.document.querySelector('#death-panel #dialogue-panel'));
 assert(g.DialogueUI.getView().typing);
 g.dispatchEvent(new g.KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));
 assert(!g.DialogueUI.getView().typing);assert(g.Survival.isDead());
 g.dispatchEvent(new g.KeyboardEvent('keydown',{key:'Enter',code:'Enter',repeat:true,bubbles:true}));
 await h.drain();assert(g.DialogueUI.isDialogueOpen(),'holding Enter only completes typing, not the line');
 g.dispatchEvent(new g.KeyboardEvent('keyup',{key:'Enter',code:'Enter',bubbles:true}));
 assert.equal(D.revive(),false,'opening dialogue is not completion');
 assert.equal(D.completeDialogue(999),false,'a stale dialogue callback cannot revive another death');
 Object.defineProperty(g.document,'hidden',{configurable:true,value:true});
 D.checkpointScene();assert(g.Survival.isDead());
 Object.defineProperty(g.document,'hidden',{configurable:true,value:false});
 // An older timed cutscene save replays its one line through the shared pipeline.
 const oldScene=D.getState();oldScene.current.elapsedMs=6000;delete oldScene.current.dialogueCompleted;
 D.restore(oldScene);D.checkpointScene();storage=storageOf(g);
 await h.close();h=await boot(full,{storage});g=h.g;S=g.SaveSystem;D=g.DeathSystem;I=g.InventoryEquipment;C=g.CharacterAttributes;
 assert.equal(D.getState().current.phase,'revival_scene');assert.equal(D.getState().deathCount,1);
 assert(g.DialogueUI.isDialogueOpen());assert(g.Survival.isDead());
 const setItem2=g.Storage.prototype.setItem;g.Storage.prototype.setItem=function(){throw Error('quota');};
 await finishDialogue();assert(g.Survival.isDead());assert.equal(D.getState().current.phase,'revival_scene');assert(D.getError());
 assert(D.getState().current.dialogueCompleted);assert(!g.DialogueUI.isDialogueOpen());
 assert(!g.document.querySelector('#death-panel #dialogue-panel'),'the shared view returns to its normal host on failure');
 g.Storage.prototype.setItem=setItem2;D.retry();assert.equal(g.Survival.isDead(),false);assert.equal(D.getState().current.phase,'revived');
 assert.equal(g.GameEngine.getState().mapId,'M0_Base_Inside_lv_1');assert.equal(g.GameTime.getState().totalTicks,tick);
 for(const p of ['head','chest','abdomen','lhand','rhand','lfoot','rfoot']) assert.equal(C.getPartDestroy(p),Math.floor(C.getBodyPartDestroyMax(p)*.5));
 assert.equal(g.Survival.getStamina(),g.Survival.getStaminaMax()*.5);
 assert.equal(I.getPotential(),basePotential);assert.equal(D.revive(),false);
 // Policy changes affect existing optional actions; protected commits cannot be disabled.
 const policy=S.getTriggerPolicy();for(const k of Object.keys(policy.triggers))policy.triggers[k]=false;
 policy.triggers['dungeon.enter']=false;policy.triggers['dungeon.withdraw']=false;policy.triggers['death.settle']=false;
 S.setTriggerPolicy(policy);
 let persisted=g.localStorage.getItem(S.getStatus().realtimeKey);
 assert(S.runAtomicFor('inventory.transfer',()=>I.addPotential(3)).saved);
 assert.equal(g.localStorage.getItem(S.getStatus().realtimeKey),persisted);
 assert(S.runAtomicFor('inventory.transfer',()=>S.runAtomicFor('death.scene',()=>I.addPotential(0))).saved);
 assert.notEqual(g.localStorage.getItem(S.getStatus().realtimeKey),persisted,'nested mandatory commit remains mandatory');
 g.GameEngine.setState('M0_Field_02',7,7);assert(g.DungeonRuntime.enter());
 persisted=g.localStorage.getItem(S.getStatus().realtimeKey);assert.equal(JSON.parse(persisted).dungeon.run.status,'active');
 activeSnapshot=JSON.parse(persisted);
 enableCrypto(g);transferCode=await S.exportSaveCode(credentials);
 g.document.dispatchEvent(new g.Event('visibilitychange'));assert.equal(g.Survival.isDead(),false,'background alone never judges interruption');
 // Generic rollback/restoration is deliberately NOT a startup interruption.
 assert(S.applySnapshotForDebug(JSON.parse(persisted)));assert.equal(g.Survival.isDead(),false);
 const failed=S.saveNow;S.saveNow=()=>false;
 assert.equal(S.runAtomic(()=>I.addPotential(77)).saved,false);assert.equal(g.Survival.isDead(),false);
 S.saveNow=failed;
 storage=storageOf(g);await h.close();h=await boot(full,{storage});g=h.g;S=g.SaveSystem;D=g.DeathSystem;I=g.InventoryEquipment;
 assert.equal(g.DungeonRuntime.getRun().status,'dead');assert.equal(D.getState().deathCount,2);
 assert.equal(D.getState().current.reason,'dungeon_interrupted');assert.equal(D.getState().current.phase,'awaiting_revival');
 assert.equal(I.getPotential(),basePotential+3);assert.equal(I.getSkillLevel('combat_basic_unarmed'),47);
 D.resume();D.resume();assert.equal(D.getState().deathCount,2);
 D.chooseRevival();await finishDialogue();
 g.GameEngine.setState('M0_Field_02',7,7);assert(g.DungeonRuntime.enter());
 const sim=g.DungeonRuntime.getSim();g.GameEngine.setState(g.DungeonRuntime.getRun().mapId,sim.map.exit%sim.map.width,Math.floor(sim.map.exit/sim.map.width));
 assert(g.DungeonRuntime.withdraw());storage=storageOf(g);await h.close();h=await boot(full,{storage});g=h.g;
 assert.equal(g.Survival.isDead(),false);assert.equal(g.DeathSystem.getState().deathCount,2);
 // Old dead saves have no historical count or proof of previously deducted levels.
 const legacy=g.SaveSystem.buildSnapshotForDebug();delete legacy.death;legacy.player.survival.isDead=true;
 const oldLevel=g.InventoryEquipment.getSkillLevel('combat_basic_unarmed');
 assert(g.SaveSystem.applySnapshotForDebug(legacy));g.DeathSystem.resume();
 assert.equal(g.DeathSystem.getState().deathCount,1);assert.equal(g.InventoryEquipment.getSkillLevel('combat_basic_unarmed'),oldLevel);
 g.DeathSystem.resume();assert.equal(g.DeathSystem.getState().deathCount,1);
 for(const count of [12,99999,100000,1000000]){
  const numbered=g.DeathSystem.getState();numbered.deathCount=count;numbered.current.number=count;g.DeathSystem.restore(numbered);
  assert.equal(g.DeathSystem.line(),`变...求...${String(count).padStart(5,'0')}号，...准`);
 }
 // Restoring an active run must work even with all storage writes unavailable; settlement stays frozen for retry.
 await h.close();h=await boot(full);g=h.g;
 g.localStorage.setItem(g.SaveSystem.getStatus().realtimeKey,JSON.stringify(activeSnapshot));
 const startupWriter=g.Storage.prototype.setItem;g.Storage.prototype.setItem=function(){throw Error('quota');};
 assert(g.SaveSystem.loadRealtime());g.DeathSystem.resume();
 assert.equal(g.DeathSystem.getState().current.phase,'pending');assert.equal(g.DeathSystem.getState().deathCount,1);
 assert.equal(g.InventoryEquipment.getPotential(),basePotential+3);
 assert.equal(g.DungeonRuntime.getRun().status,'active');assert(g.DeathSystem.blocked());
 g.Storage.prototype.setItem=startupWriter;g.DeathSystem.retry();
 assert.equal(g.DeathSystem.getState().deathCount,2);assert.equal(g.DungeonRuntime.getRun().status,'dead');
 // A genuine encrypted device-transfer code follows the same startup rule, after persistence succeeds.
 await h.close();h=await boot(full);g=h.g;enableCrypto(g);
 const cold=g.SaveSystem.buildSnapshotForDebug();
 const setItem3=g.Storage.prototype.setItem;g.Storage.prototype.setItem=function(){throw Error('quota');};
 const rejected=await g.SaveSystem.importSaveCode(transferCode,credentials);
 assert.equal(rejected.ok,false);assert(['save','apply'].includes(rejected.reason));assert.equal(g.DeathSystem.getState().deathCount,0);
 assert.equal(JSON.stringify(g.InventoryEquipment.getState().equipment),JSON.stringify(cold.player.inventoryEquipment.equipment));
 g.Survival.setDead('vital_head');await h.drain();
 assert.equal(g.DeathSystem.getState().deathCount,0);assert.equal(g.DeathSystem.getState().current.phase,'pending');
 assert.equal(JSON.stringify(g.InventoryEquipment.getState().equipment),JSON.stringify(cold.player.inventoryEquipment.equipment),'first-ever death rollback does not run storage-writing migrations');
 g.Storage.prototype.setItem=setItem3;
 assert(g.SaveSystem.applySnapshotForDebug(cold));
 assert.equal((await g.SaveSystem.importSaveCode(transferCode,credentials)).ok,true);
 assert.equal(g.DeathSystem.getState().deathCount,2);assert.equal(g.DeathSystem.getState().current.reason,'dungeon_interrupted');
 assert.equal(g.DeathSystem.getState().current.phase,'awaiting_revival');
 const waitingCode=await g.SaveSystem.exportSaveCode(credentials);
 assert.equal((await g.SaveSystem.importSaveCode(waitingCode,credentials)).ok,true);
 assert.equal(g.DeathSystem.getState().deathCount,2,'transferring a settled death never repeats penalties');
 assert.deepEqual(h.errors,[]);
 console.log(`PASS ${full?'Svelte':'classic'}: vital death, rollback/retry, skill and potential rules, phase reloads, interrupted runs, withdrawal, configurable triggers`);
} finally {await h.close();}
