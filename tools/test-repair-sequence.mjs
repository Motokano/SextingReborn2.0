import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
async function click(h,selector){const el=h.g.document.querySelector(selector);assert.ok(el,selector);assert.ok(!el.disabled,selector+' enabled');el.click();await h.drain();}
async function slide(h,id,value){const el=h.g.document.querySelector('[data-item="'+id+'"]');assert.ok(el&&!el.disabled,id+' slider enabled');el.value=value;el.dispatchEvent(new h.g.Event('input',{bubbles:true}));await h.drain();}
async function setup(h){
 const g=h.g;g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
 const name=g.document.getElementById('creation-name');name.value='顺序修复测试';name.dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();
 await click(h,'#btn-confirm-creation');g.DialogueUI.close();g.GameEngine.setState('M0_Base_Inside_lv_1',13,14);
 g.InventoryEquipment.setState({...g.InventoryEquipment.getState(),inventory_pocket:[{item_id:'ore_clay_raw',count:2},{item_id:'wood_plank_soft',count:2}],inventory_vest:[],inventory_backpack:[],inventory_vehicle:[]});
 g.FacilityUnlockPanel.open('cooking');await h.drain();
}
for(const full of [false,true])test(`${full?'Svelte':'native'} repair: direct materials, quantities, partial save, ordered parts, rollback and completion`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  await setup(h);const P=g.FacilityUnlockPanel,R=g.FacilityUnlock.get('cooking'),IE=g.InventoryEquipment;
  assert.equal(d.querySelectorAll('.cr-steps li').length,2);
  assert.equal(d.querySelectorAll('.cr-steps button,[data-step]').length,0,'progress is not tab navigation');
  assert.doesNotMatch(d.querySelector('.cr-body').textContent,/核对材料|继续准备/);
  assert.doesNotMatch(d.querySelector('.cr-current').textContent,/检查用料|检查其他用料|用料未知/);
  assert.equal(d.querySelector('[data-action="inspect"]'),null);
  assert.equal(d.querySelector('[data-item="ore_clay_raw"]').closest('label').querySelector('small').textContent,'2/5');
  assert.equal(g.NPCSystem.isDemoFlagTrue('repair_use_known:ore_clay_raw'),false,'opening materials does not grant global knowledge');
  assert.deepEqual(Array.from(P.getView().sequence.items,i=>i.id),['ore_clay_raw']);
  assert.equal(d.querySelector('[data-item="ore_limestone"],[data-item="ore_granite"],.cr-alternatives'),null,'unheld, unused alternatives are absent');
  const held=copy(IE.getState());R.preview({ore_clay_raw:1});P.close();
  IE.setState({...held,inventory_pocket:[]});g.NPCSystem.setDemoFlag('repair_use_known:ore_granite',true);P.open('cooking');await h.drain();
  assert.deepEqual(Array.from(P.getView().sequence.items,i=>i.id),['ore_clay_raw'],'empty inventory shows the first basic material only');
  assert.equal(d.querySelectorAll('.cr-material').length,1);
  assert.equal(d.querySelector('[data-item="ore_clay_raw"]').closest('label').querySelector('small').textContent,'0/5');
  assert.equal(d.querySelector('[data-item="ore_clay_raw"]').disabled,true);
  assert.equal(d.querySelector('[data-action="repair"]').disabled,true);
  P.close();IE.setState({...held,inventory_pocket:[{item_id:'ore_granite',count:1}]});P.open('cooking');await h.drain();
  assert.deepEqual(Array.from(P.getView().sequence.items,i=>i.id),['ore_clay_raw','ore_granite'],'bringing an alternative reveals it');
  assert.equal(d.querySelector('[data-item="ore_clay_raw"]').closest('details'),null,'basic hint stays visible even when only an alternative is held');
  assert.equal(d.querySelector('[data-item="ore_granite"]').disabled,false);
  await slide(h,'ore_granite',1);
  P.close();IE.setState({...held,inventory_pocket:[]});P.open('cooking');await h.drain();
  assert.deepEqual(Array.from(P.getView().sequence.items,i=>i.id),['ore_clay_raw'],'holding and previewing an alternative without consuming it does not persist discovery');
  P.close();IE.setState(held);P.open('cooking');await h.drain();
  P.act(null,1);P.select('wood_plank_soft',2);
  assert.equal(P.getView().sequence.current,0);
  const initial=JSON.stringify(IE.getState());
  assert.equal(R.repair({wood_plank_soft:2}).ok,false);
  assert.equal(R.repair({ore_clay_raw:2,wood_plank_soft:2}).ok,false,'cannot repair multiple parts at once');
  assert.equal(JSON.stringify(IE.getState()),initial);
  let row=P.getView().sequence.items.find(i=>i.id==='ore_clay_raw');
  assert.deepEqual([row.required,row.stock,row.missing,row.selected],[5,2,3,0]);
  assert.equal(d.querySelector('[data-action="repair"]').disabled,true,'opening does not choose materials');
  assert.equal(d.querySelectorAll('[data-action="all"],[data-action="clear"]').length,0);
  await slide(h,'ore_clay_raw',2);
  assert.doesNotMatch(d.querySelector('.cr-current').textContent,/本次消耗|修补后还需/);
  assert.equal(d.querySelector('.cr-commit').children.length,1,'only the repair button follows the list');
  assert.equal(d.querySelector('.cr-commit').firstElementChild.dataset.action,'repair');
  assert.match(d.querySelector('[data-action="repair"]').textContent,/先修补一部分/);
  assert.equal(R.preview({ore_clay_raw:2}).currentComplete,false);
  assert.equal(JSON.stringify(IE.getState()),initial,'selection and preview do not consume materials');
  await click(h,'[data-action="repair"]');
  assert.equal(R.state().stone,4);assert.equal(R.state().wood,0);
  assert.equal(IE.countCarriedItemsByTemplateId('wood_plank_soft'),2);
  assert.equal(P.getView().sequence.current,0);
  assert.doesNotMatch(d.querySelector('.cr-current').textContent,/随身无可用材料/);
  assert.equal(d.querySelector('[data-item="ore_clay_raw"]').disabled,true);
  assert.equal(d.querySelector('[data-item="ore_clay_raw"]').closest('label').querySelector('small').textContent,'0/3');
  assert.equal(d.querySelector('[data-action="repair"]').disabled,true);
  const partial=g.SaveSystem.buildSnapshotForDebug();
  g.NPCSystem.setDemoFlag('cooking_base_repair_progress',{});g.NPCSystem.setDemoFlag('repair_material_used:ore_clay_raw',false);assert.equal(g.SaveSystem.applySnapshotForDebug(partial),true);await h.drain();
  P.open('cooking');await h.drain();
  row=P.getView().sequence.items.find(i=>i.id==='ore_clay_raw');assert.deepEqual([row.required,row.stock,row.missing],[3,0,3]);
  P.close();const state=copy(IE.getState());state.inventory_pocket[0]={item_id:'ore_clay_raw',count:10};IE.setState(state);P.open('cooking');await h.drain();
  row=P.getView().sequence.items.find(i=>i.id==='ore_clay_raw');assert.equal(row.selected,0,'reopening leaves material quantities for the player to choose');
  assert.equal(d.querySelector('[data-item="ore_clay_raw"]').closest('label').querySelector('small').textContent,'10/3');
  const slider=d.querySelector('[data-item="ore_clay_raw"]');assert.equal(slider.type,'range');assert.equal(slider.max,'3');slider.focus();
  for(const value of [0,2,1]){
   slider.value=value;slider.dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();
   assert.equal(d.querySelector('[data-item="ore_clay_raw"]'),slider,'continuous slider input retains the active control');assert.equal(d.activeElement,slider);
   assert.equal(slider.nextElementSibling.textContent,'投入 '+value+' 件');assert.equal(P.getView().sequence.used[0]?.count||0,value,'slider updates consumption preview');
  }
  await slide(h,'ore_clay_raw',3);assert.equal(P.getView().sequence.used[0].count,3);
  const beforeFailure=JSON.stringify(IE.getState()),save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
  await click(h,'[data-action="repair"]');assert.equal(JSON.stringify(IE.getState()),beforeFailure);assert.equal(R.state().stone,4);assert.equal(P.getView().sequence.current,0);assert.match(d.querySelector('.cr-body [role="alert"]').textContent,/保存/);
  g.SaveSystem.saveNow=save;await click(h,'[data-action="repair"]');assert.equal(R.state().stone,10);assert.equal(R.state().wood,0);assert.equal(IE.countCarriedItemsByTemplateId('ore_clay_raw'),7);
  assert.equal(P.getView().sequence.current,1);assert.equal(d.querySelector('.cr-steps li').textContent.includes('已完成'),true);
  assert.equal(d.querySelector('[data-action="repair"]').disabled,true,'next part needs its own selection');
  P.act('repair');await h.drain();assert.equal(IE.countCarriedItemsByTemplateId('wood_plank_soft'),2,'duplicate click cannot charge next part');
  P.close();const ready=g.SaveSystem.buildSnapshotForDebug();assert.equal(g.SaveSystem.applySnapshotForDebug(ready),true);await h.drain();P.open('cooking');await h.drain();
  assert.equal(P.getView().sequence.current,1,'reopen resumes first unfinished part');
  assert.equal(P.getView().sequence.items.find(i=>i.id==='wood_plank_soft').required,2);
  assert.equal(d.querySelector('[data-action="repair"]').disabled,true);
  await slide(h,'wood_plank_soft',2);
  await click(h,'[data-action="repair"]');assert.equal(R.isComplete(),true);assert.equal(IE.countCarriedItemsByTemplateId('wood_plank_soft'),0);
  assert.match(d.querySelector('.cr-finished').textContent,/全部部件已修好/);assert.equal(d.querySelector('[data-action="repair"]'),null);
  P.close();IE.setState({...copy(IE.getState()),inventory_pocket:[]});g.NPCSystem.resetCookingStationRepairQuestFlags();P.open('cooking');await h.drain();
  assert.equal(g.NPCSystem.isDemoFlagTrue('repair_material_used:ore_clay_raw'),false,'new-character reset clears previous material use');
  assert.deepEqual(Array.from(P.getView().sequence.items,i=>i.id),['ore_clay_raw'],'fresh game still shows its basic material hint');
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
