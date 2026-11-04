import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

for (const full of [false, true]) test(`${full ? 'Svelte' : 'native'} facility art follows real repair, assembly and saved flags`, async () => {
 const h=await boot(full),g=h.g;
 const ids=['cooking','pharmacy','forging','compost','bathroom','agriculture','livestock','sewing','observation'];
 const art=id=>g.TileRendererV2.getSpeakerPawn('npc.station.'+id+'_base').url;
 const outdoor=id=>id==='agriculture'||id==='livestock';
 const unfinished=id=>assert.match(art(id),outdoor(id)?/farm-ranch-5x5-v1\/.*-(ready|approved)\.png$/:/hideout-facilities-v2\/.*-damaged\.png$/,id);
 const ready=id=>assert.match(art(id),outdoor(id)?/farm-ranch-5x5-v1\/.*-(ready|approved)\.png$/:/hideout-facilities-v2\/.*-ready\.png$/,id);
 function supply(id) {
  const project=g.FacilityUnlock.get(id),[x,y]=project.spec.position;
  g.GameEngine.setState(project.spec.mapId||'M0_Base_Inside_lv_1',x,y-1);
  const items=Array.from(project.groups,c=>({item_id:g.FacilityUnlockConfig.materials.find(m=>m[1]===c.id&&m[0]!=='hus_wool')[0],count:100}));
  g.InventoryEquipment.setState({...g.InventoryEquipment.getState(),inventory_pocket:items,inventory_vest:[],inventory_backpack:[],inventory_vehicle:[]});
  assert.equal(project.inspect().ok,true,id+' material knowledge');
  return project;
 }
 const pending=project=>project.groups.find(group=>project.state()[group.id]<group.need);
 function materials(project) {
  for(let n=0;pending(project)&&n<6;n++) {
   const group=pending(project),row=project.rows().find(r=>r.group===group.id);
   assert.equal(project.repair({[row.id]:Math.ceil((group.need-project.state()[group.id])/row.points)}).ok,true,project.spec.id);
  }
  assert.equal(pending(project),undefined);
 }
 try {
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  const input=g.document.getElementById('creation-name');input.value='设施外观测试';input.dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();
  g.document.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  g.TileRendererV2.create(g.document.createElement('div'),{cellPx:144/Math.SQRT2});
  ids.forEach(unfinished);
  for(const id of ids.slice(0,7)) {
   // The appearance contract also covers installations whose gameplay module
   // is not present yet (the bathroom was introduced in a separate change).
   if(!g.FacilityUnlockConfig.projects[id])continue;
   if(id==='agriculture'||id==='livestock') {
    g.NPCSystem.setDemoFlag('facility_cleaned:'+id,true);unfinished(id);
   }
   const project=supply(id),first=project.rows().find(r=>r.group===pending(project).id);
   assert.equal(project.repair({[first.id]:1}).ok,true);unfinished(id);
   const partial=g.NPCSystem.getDemoState();g.NPCSystem.setDemoState(JSON.parse(JSON.stringify(partial)));unfinished(id);
   if(id==='pharmacy') {
    const save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
    try {assert.equal(project.repair({[first.id]:1}).ok,false);unfinished(id);} finally {g.SaveSystem.saveNow=save;}
   }
   materials(project);assert.equal(project.isComplete(),true);ready(id);
  }
  // Supply is a separate optional upgrade; the repaired stove stays ready.
  assert.equal(g.NPCSystem.isDemoFlagTrue('cooking_base_station_water_unlimited'),false);ready('cooking');
  g.NPCSystem.setDemoFlag('sewing_mannequin_unlocked',true);
  const sewing=supply('sewing');materials(sewing);unfinished('sewing');
  for(let n=0;n<sewing.spec.workTicks;n++) {
   g.Survival.setState({...g.Survival.getState(),stamina:100,thirst:100});
   assert.equal(sewing.work().ok,true);if(n<sewing.spec.workTicks-1)unfinished('sewing');
  }
  ready('sewing');assert.equal(g.NPCSystem.isDemoFlagTrue('sewing_bucket_unlocked'),false);
  materials(supply('calendar'));unfinished('observation');materials(supply('temperature'));ready('observation');
  const saved=JSON.parse(JSON.stringify(g.NPCSystem.getDemoState()));
  g.NPCSystem.resetCookingStationRepairQuestFlags();g.FacilityLabor.reset();ids.forEach(unfinished);
  g.NPCSystem.setDemoState(saved);ids.filter(id=>id==='observation'||g.FacilityUnlockConfig.projects[id]).forEach(ready);
  // Save compatibility uses NPCSystem's actual normalized boolean semantics.
  g.NPCSystem.setDemoFlag('bathroom_station_unlocked','false');unfinished('bathroom');
  g.NPCSystem.setDemoFlag('bathroom_station_unlocked','1');ready('bathroom');
  assert.deepEqual(h.errors,[]);
 } finally {await h.close();}
});
