import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';
const read=p=>fs.readFileSync(p,'utf8'),copy=v=>JSON.parse(JSON.stringify(v));
const data=JSON.parse(read('data/muscles.json')),all=data.muscles.map(m=>m.id);
const mapping={head:['head','neck'],chest:['chest','back'],abdomen:['abdomen','pelvis'],lhand:['shoulder_l','upperarm_l','forearm_l','hand_l'],rhand:['shoulder_r','upperarm_r','forearm_r','hand_r'],lfoot:['hip_l','thigh_l','calf_l','foot_l'],rfoot:['hip_r','thigh_r','calf_r','foot_r']};
const entries=id=>data.muscles.filter(m=>mapping[id].includes(m.group)).map(m=>m.id);
const lit=ids=>Object.fromEntries(ids.map(id=>[id,true]));
const first='post_no_second_thought',second='post_po_xiang',wound='post_wound_on_wound';
async function context({defer=false,fallback=false}={}){
 let release;const g=vm.createContext({console});g.window=g;
 if(!fallback)g.fetch=()=>defer?new Promise(r=>release=()=>r({ok:true,json:async()=>copy(data)})):Promise.resolve({ok:true,json:async()=>copy(data)});
 vm.runInContext(read('js/muscles.js'),g);if(!defer)await g.Muscles.ready;return {g,M:g.Muscles,release};
}
test('exactly seven body slots partition all 22 groups and 478 muscles; each missing muscle locks only its body slot',async()=>{
 const {M}=await context();assert.deepEqual(copy(M.getChainSlots().map(s=>[s.id,s.groups])),Object.entries(mapping));
 assert.deepEqual(copy(M.getChainSlots().map(s=>s.total)),[152,83,27,48,48,60,60]);
 assert.equal(new Set(Object.values(mapping).flat()).size,22);
 assert.deepEqual(copy(M.getPassiveSlots()),{});
 for(const [id,groups] of Object.entries(mapping)){
  for(const missing of entries(id)){
   M.setState({unlocked:{...lit(all.filter(m=>m!==missing)),unknown:true}});
   assert.equal(M.isChainSlotUnlocked(id),false,missing);
   assert.equal(Object.keys(M.getPassiveSlots()).length,6);
   assert.equal(M.getChainSlot(id).count,entries(id).length-1);
   M.addGrowth(missing,100);assert.equal(M.isChainSlotUnlocked(id),true);assert.equal(Object.keys(M.getPassiveSlots()).length,7);
  }
  for(const group of groups){assert.equal(M.getChainSlotForGroup(group).id,id);}
 }
 const {M:F}=await context({fallback:true});F.setState({unlocked:lit(all)});assert.deepEqual(copy(F.getPassiveSlots()),{});
});
test('equipment requires the whole body, enforces one per slot/global uniqueness, and uses the original attack shape boundary',async()=>{
 const {g,M}=await context();vm.runInContext(read('js/combat-initiative.js'),g);
 M.setState({unlocked:lit(data.muscles.filter(m=>m.group==='shoulder_l').map(m=>m.id))});
 assert.equal(M.canEquipPassive(first,'shoulder_l').ok,false);assert.equal(M.equipPassive(first,'lhand').ok,false);
 M.setState({unlocked:lit(all)});assert.equal(M.equipPassive(first,'lhand').ok,true);
 assert.equal(M.equipPassive(second,'forearm_l').reason,'slot_occupied');assert.equal(M.equipPassive(first,'rhand').reason,'already_equipped');
 assert.equal(M.equipPassive(second,'head').reason,'slot_not_allowed');assert.equal(M.equipPassive(second,'unknown').ok,false);
 const attack=(limbId,formTags)=>copy(g.CombatInitiative.getPlayerPostEffectIds({limbId,formTags}));
 assert.deepEqual(attack('lhand',['挥拳']),[first]);assert.deepEqual(attack('rhand',['挥拳']),[]);assert.deepEqual(attack('lfoot',['踢击']),[]);
 assert.equal(M.equipPassive(wound,'lfoot').ok,true);assert.deepEqual(attack('lfoot',['踢击']),[wound]);assert.deepEqual(attack('rfoot',['踢击']),[]);
 M.setState({...copy(M.getState()),unlocked:lit(all.filter(m=>m!==entries('lhand')[0]))});
 assert.equal(M.getEquippedPassiveForSlot('lhand'),null);assert.deepEqual(attack('lhand',['挥拳']),[]);
 assert.deepEqual(copy(M.getEquippedPassiveIds()),[wound]);
});
test('old saves migrate after data loads; conflicting old slots retain records without choosing or stacking; new saves are stable',async()=>{
 const {M,release}=await context({defer:true});const legacy={shoulder_l:first,forearm_l:second,hand_r:first,calf_l:wound,unknown:second};
 M.setState({unlocked:lit(all),equipped:legacy});assert.deepEqual(copy(M.getEquippedMap()),{});release();await M.ready;
 assert.deepEqual(copy(M.getEquippedMap()),{rhand:first,lfoot:wound});assert.deepEqual(copy(M.getState().legacy_equipped),legacy);
 assert.equal(M.getState().chain_slots_version,1);const saved=copy(M.getState());
 for(let i=0;i<3;i++){M.setState(copy(saved));assert.deepEqual(copy(M.getState()),saved);}
 assert.equal(M.equipPassive(second,'lhand').ok,true);M.unequipPassive(second);M.setState(copy(M.getState()));assert.equal(M.getEquippedPassiveForSlot('lhand'),null);
 M.setState({unlocked:lit(entries('lhand').slice(1)),equipped:{shoulder_l:first}});assert.deepEqual(copy(M.getEquippedMap()),{});
 M.setState({unlocked:lit(all),chain_slots_version:1,equipped:{lhand:first,rhand:first,head:second,lfoot:'unknown',fake:wound}});
 assert.deepEqual(copy(M.getEquippedMap()),{lhand:first});assert.deepEqual(copy(M.getEquippedPostEffectIds()),[first]);
});
for(const full of [false,true])test(`seven chains ${full?'Svelte':'classic'}: actual UI gates, final growth rollback, equipment save rollback and reload`,async()=>{
 const h=await boot(full),g=h.g,d=g.document,M=g.Muscles,SS=g.SaveSystem;
 const click=async selector=>{const el=d.querySelector(selector);assert.ok(el,selector);el.click();await h.drain();return el;};
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();d.getElementById('creation-name').value='动力链验收';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();await click('#btn-confirm-creation');g.DialogueUI.close();
  g.InventoryEquipment.getState().skills.special_meridian_studies={level:1};
  g.SceneHud.refresh('status');await click('#btn-muscles');await click('[data-view=chain]');assert.equal(d.querySelectorAll('#modal-muscles [data-slot]').length,7);
  assert.equal(d.querySelectorAll('#modal-muscles .ma-body-target.complete').length,0);assert.equal(d.querySelectorAll('[data-group-passive]').length,0);
  for(const group of mapping.lhand.slice(0,3))for(const m of M.getMusclesByGroup(group))M.addGrowth(m.id,100);
  g.SceneHud.refresh('status');await h.drain();assert.equal(d.querySelector('#modal-muscles [data-slot=lhand]').classList.contains('complete'),false);assert.equal(d.querySelector('#modal-muscles [data-passive]').disabled,true);
  const target=entries('lhand').at(-1);M.setState({unlocked:lit(all.filter(id=>id!==target)),progress:{[target]:99.999}});const save=SS.saveNow;
  SS.saveNow=()=>false;const failed=SS.runAtomic(()=>M.addGrowth(target,.001),{required:true});SS.saveNow=save;assert.equal(failed.saved,false);assert.equal(M.isChainSlotUnlocked('lhand'),false);
  assert.equal(SS.runAtomic(()=>M.addGrowth(target,.001),{required:true}).saved,true);g.SceneHud.refresh('status');await h.drain();
  assert.equal(d.querySelectorAll('#modal-muscles .ma-body-target.complete').length,7);await click('[data-slot=lhand]');assert.match(d.querySelector('#modal-muscles [data-slot=lhand]').getAttribute('aria-label'),/48\/48/);
  SS.saveNow=()=>false;await click(`[data-chain-id=${first}]`);SS.saveNow=save;assert.equal(M.getEquippedPassiveForSlot('lhand'),null);
  await click(`[data-chain-id=${first}]`);assert.equal(M.getEquippedPassiveForSlot('lhand'),first);
  await click('[data-slot=rhand]');assert.equal(d.querySelector(`[data-chain-id=${first}]`).disabled,true);
  await click('[data-slot=lhand]');SS.saveNow=()=>false;await click(`[data-chain-id=${first}]`);SS.saveNow=save;assert.equal(M.getEquippedPassiveForSlot('lhand'),first);
  await click(`[data-chain-id=${first}]`);assert.equal(M.getEquippedPassiveForSlot('lhand'),null);
  await click(`[data-chain-id=${second}]`);const snapshot=copy(SS.buildSnapshotForDebug());M.setState({});assert.equal(SS.applySnapshotForDebug(snapshot),true);await h.drain();assert.equal(M.getEquippedPassiveForSlot('lhand'),second);
  await click('[data-slot=head]');assert.match(d.querySelector('.ma-chain-empty').getAttribute('aria-label'),/暂无适用动力链/);
  await click('[data-slot=lhand]');const stale=d.querySelector(`[data-chain-id=${second}]`);M.setState({...copy(M.getState()),unlocked:lit(all.filter(id=>id!==target))});stale.click();await h.drain();assert.equal(M.getEquippedPassiveForSlot('lhand'),null);assert.equal(g.CombatInitiative.getPlayerPostEffectIds({limbId:'lhand',formTags:['挥拳']}).length,0);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
