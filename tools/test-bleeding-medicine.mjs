import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const json=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const copy=v=>JSON.parse(JSON.stringify(v));
const items=json('data/items.json');
async function core(){
  const g={console,SceneCtx:{},Math:Object.create(Math),fetch:async p=>({ok:true,json:async()=>json(String(p))}),
    NPCSystem:{isDemoFlagTrue:k=>k==='pharmacy_injection_unlocked'},
    InventoryEquipment:{getItemTemplate:id=>items[id],getSkillLevel:()=>0,getState:()=>({}),getSkillsState:()=>({})},
    GameTime:{tick:0,getState(){return {totalTicks:this.tick};},advanceTicks(n){this.tick+=n;}}};
  g.window=g;vm.createContext(g);
  for(const f of ['injury-data','injury-system','survival','character-attributes','combat-enemies','buff-system','pharmacy-effects','pharmacy-compounding','item-use'])
    vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),g,{filename:f});
  g.Survival.setConfig(json('data/survival-config.json'));g.CharacterAttributes.setConfig(json('data/survival-config.json'));
  g.CombatEnemies.setTable(json('data/combat-enemies.json'));g.BuffSystem.init();
  for(let i=0;i<50&&!g.BuffSystem.getState().loaded;i++)await new Promise(r=>setTimeout(r,5));
  assert.ok(g.BuffSystem.getState().loaded);
  g.Survival.setState({stamina:100,energy:100,satiety:100,thirst:100,mood:500,dirtyness:0,fatigue:0,isDead:false,isComa:false});
  return g;
}
const advance=(g,n=1)=>{for(let i=0;i<n;i++)g.Survival.advanceTick();};
const hurt=(g,type='bleeding',part='lhand',owner='player')=>g.InjurySystem.apply(owner,part,type);
const wound=(g,part='lhand')=>g.BuffSystem.getState().instancesByOwner.player.find(i=>i.body_part===part&&i.template.injury_group==='bleeding');
const damage=(g,part='lhand')=>g.CharacterAttributes.getPartDestroy(part);
const dose=(g,route='inject',potency='regular',part='lhand',source='test',owner='player')=>
  g.BuffSystem.applyBuff(owner,`buff_pharm_coagulant_${route}_${potency}`,source,{part_id:part});
const slow=(g,part='lhand',tick=g.GameTime.getState().totalTicks,owner='player')=>g.PharmacyEffects.getBleedingSlowRatio(owner,part,tick);
const useTopical=(g,id,part)=>g.ItemUse.applyItemUseEffectFromTemplate(id,items[id],{part_id:part});

test('all eight existing coagulant strengths honor onset, inclusive expiry and local scope',async()=>{
  for(const [route,values] of Object.entries({topical:[.18,.35,.53,.67],inject:[.25,.5,.75,.95]})){
    for(const [idx,potency] of ['weak','regular','potent','pure'].entries()){
      const g=await core(),onset=route==='topical'?3:0,end=route==='topical'?90:10;
      assert.ok(dose(g,route,potency,'belly'));
      if(onset)assert.equal(slow(g,'abdomen',onset-1),0);
      assert.equal(slow(g,'abdomen',onset),values[idx]);
      assert.equal(slow(g,'abdomen',end),values[idx]);
      assert.equal(slow(g,'abdomen',end+1),0,'expired buff must stop before cleanup runs');
      assert.equal(slow(g,'head',onset),route==='topical'?0:values[idx]);
    }
  }
});
test('same ointment on separate parts retains independent targets, onset and timers',async()=>{
  const g=await core(),id='potion_coagulant_powder';
  assert.ok(useTopical(g,id,'lhand'));advance(g,3);
  assert.ok(useTopical(g,id,'rhand'));
  assert.equal(slow(g),.35);assert.equal(slow(g,'rhand'),0);
  advance(g,3);assert.equal(slow(g,'rhand'),.35);
  assert.ok(useTopical(g,id,'lhand'));
  const active=g.BuffSystem.getState().instancesByOwner.player.filter(i=>i.buff_id===items[id].use_buff_id);
  assert.equal(active.length,2);
  assert.equal(active.find(i=>i.body_part==='lhand').started_tick,0);
  assert.equal(active.find(i=>i.body_part==='lhand').expires_at_tick,96);
  assert.equal(active.find(i=>i.body_part==='rhand').expires_at_tick,93);
  assert.equal(slow(g,'chest'),0);
  g.GameTime.tick=97;assert.ok(useTopical(g,id,'lhand'));
  assert.equal(slow(g),0,'reusing an expired instance waits for onset again');
  assert.equal(slow(g,'lhand',100),.35);
});
test('legacy topical save keeps its old target when the same medicine is applied elsewhere',async()=>{
  const g=await core(),id='potion_coagulant_salve';assert.ok(useTopical(g,id,'lhand'));advance(g,3);
  const saved=copy(g.BuffSystem.getState());
  saved.instancesByOwner.player.find(i=>i.buff_id===items[id].use_buff_id).body_part=null;
  g.BuffSystem.setState(saved);assert.equal(slow(g),.53);
  assert.ok(useTopical(g,id,'rhand'));assert.equal(slow(g),.53);assert.equal(slow(g,'rhand'),0);
  advance(g,3);assert.equal(slow(g),.53);assert.equal(slow(g,'rhand'),.53);
});
test('different routes and sources take only the strongest active effect, falling back after expiry',async()=>{
  const g=await core();dose(g,'topical','potent');dose(g,'inject','regular','lhand','formula-A');
  assert.equal(slow(g),.5);advance(g,3);assert.equal(slow(g),.53);assert.equal(slow(g,'rhand'),.5);
  dose(g,'inject','potent','lhand','formula-B');assert.equal(slow(g),.75);
  assert.equal(slow(g,'lhand',14),.53);assert.equal(slow(g,'rhand',14),0);
  assert.equal(slow(g,'lhand',91),0);
});
test('fractional bleeding damage accumulates per wound, without losing ordinary or heavy damage',async()=>{
  const g=await core();hurt(g);hurt(g,'heavy_bleeding','rhand');dose(g);
  advance(g);assert.equal(damage(g),0);assert.equal(damage(g,'rhand'),1);
  assert.equal(wound(g).injury_progress.bleed_damage_units,500000);
  advance(g);assert.equal(damage(g),1);assert.equal(damage(g,'rhand'),3);
  advance(g,8);assert.equal(damage(g),5);assert.equal(damage(g,'rhand'),15);
  advance(g);assert.equal(damage(g),6);assert.equal(damage(g,'rhand'),18);
  assert.ok(g.InjurySystem.has('player','lhand','bleeding'));
});
test('95 percent mitigation eventually deals damage; refreshing does not reset wound remainder',async()=>{
  const g=await core();hurt(g);dose(g,'inject','pure');advance(g,10);
  assert.equal(damage(g),0);assert.equal(wound(g).injury_progress.bleed_damage_units,500000);
  dose(g,'inject','pure');advance(g,10);assert.equal(damage(g),1);
  assert.equal(wound(g).injury_progress.bleed_damage_units,0);
});
test('remainder survives upgrade and reload, clears on treatment, and old saves start at zero',async()=>{
  const g=await core();hurt(g);dose(g);advance(g);
  hurt(g,'heavy_bleeding');assert.equal(wound(g).injury_progress.bleed_damage_units,500000);
  g.BuffSystem.setState(copy(g.BuffSystem.getState()));advance(g);
  assert.equal(damage(g),2);assert.equal(wound(g).injury_progress.bleed_damage_units,0);
  advance(g);g.BuffSystem.clearPartInjury('player','lhand','heavy_bleeding');hurt(g);
  advance(g);assert.equal(damage(g),3,'new wound does not inherit the old half point');
  const old=copy(g.BuffSystem.getState());delete old.instancesByOwner.player.find(i=>i.buff_id==='injury_bleeding').injury_progress.bleed_damage_units;
  g.BuffSystem.setState(old);assert.equal(wound(g).injury_progress.bleed_damage_units,0);
});
test('zero-rounded damage still advances infection checks and surgery preserves bleeding',async()=>{
  const g=await core();hurt(g);dose(g,'inject','pure');
  const b=wound(g);for(let n=0;;n++)if(g.InjurySystem.infectionRoll(String(n),1)<.05){b.injury_progress.seed=String(n);break;}
  advance(g,6);assert.equal(damage(g),0);assert.ok(g.InjurySystem.has('player','lhand','wound_infection'));
  assert.equal(b.injury_progress.checks,1);assert.equal(b.injury_progress.bleed_damage_units,300000);
  g.CharacterAttributes.applyCombatDestroy('lhand',100);
  assert.ok(g.CharacterAttributes.completeMedicalSurgery('lhand',100,50));
  assert.equal(wound(g).injury_progress.bleed_damage_units,300000);
  advance(g);assert.equal(wound(g).injury_progress.bleed_damage_units,350000);
  assert.equal(damage(g),49);assert.ok(g.InjurySystem.has('player','lhand','bleeding'));
  advance(g,4);assert.equal(damage(g),50,'expired medicine gives no extra protection tick');
});
test('real compounded coagulation injection affects player wounds without leaking to an enemy',async()=>{
  const g=await core(),PC=g.PharmacyCompounding;
  const made=PC.buildInstance([{item_id:'solvent_saline',count:1},{item_id:'med_notoginseng_powder',count:1}]);
  assert.ok(made.ok,JSON.stringify(made));assert.ok(PC.applyInjection(made.instance).ok);
  assert.equal(slow(g),.5);hurt(g);hurt(g,'heavy_bleeding','rhand');advance(g,2);
  assert.equal(damage(g),1);assert.equal(damage(g,'rhand'),3);
  const owner=g.CombatEnemies.getOwnerId('enemy.street_thug','test',0);hurt(g,'bleeding','lhand',owner);
  g.CombatEnemies.dungeonTurnStatus('test',0,'enemy.street_thug',3);
  assert.equal(g.CombatEnemies.getDungeonState('test',0,'enemy.street_thug').part_destroy.lhand,1);
  assert.equal(slow(g,'lhand',1,owner),0);
});
test('six coagulation recipes are released through the generated runtime recipe catalog',()=>{
  const recipes=Object.values(json('data/recipes.json').recipes);
  for(const name of ['crush_baiji_powder','crush_notoginseng_powder','refine_notoginseng','purify_notoginseng','blend_coagulant_powder','blend_coagulant_salve']){
    const r=recipes.find(r=>r.recipe_id==='life_pharmacy.'+name);assert.ok(r,name);assert.notEqual(r.enabled,false,name);
  }
  assert.equal(recipes.find(r=>r.recipe_id==='life_pharmacy.macerate_cardiac_powder').enabled,false);
});
for(const full of [false,true])test(`formal ${full?'Svelte':'native'} medicine use, save restore and failed transaction`,async()=>{
  const h=await boot(full),g=h.g;
  try{
    g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
    assert.ok(g.SceneApp.creation.confirm({name:'凝血药验收',height:178,gender:'male',hand:'right',leg:'right'}));await h.drain();g.DialogueUI.close();
    g.GameEngine.setState('M0_Base_Inside_lv_1',4,10);
    g.Survival.setState({stamina:100,energy:100,satiety:100,thirst:100,fatigue:0,isDead:false,isComa:false});
    const stock=()=>g.InventoryEquipment.setState({...g.InventoryEquipment.getState(),inventory_pocket:[{item_id:'potion_coagulant_powder',count:1}]});
    stock();hurt(g);hurt(g,'bleeding','rhand');
    const start=g.WorldTick.getWorldTotalTicks();
    assert.ok(g.ItemUseActions.tryUseItemFromContainer('pocket',0,{part_id:'lhand'}));
    assert.equal(g.WorldTick.getWorldTotalTicks(),start+1);
    advance(g,3);assert.equal(slow(g),.35);assert.equal(slow(g,'rhand'),0);
    assert.ok(wound(g).injury_progress.bleed_damage_units>0);
    const snapshot=g.SaveSystem.buildSnapshotForDebug(),before=copy(wound(g).injury_progress),body=damage(g);
    advance(g,2);const next=damage(g);
    assert.ok(g.SaveSystem.applySnapshotForDebug(snapshot));
    assert.equal(damage(g),body);assert.deepEqual(copy(wound(g).injury_progress),before);assert.equal(slow(g),.35);
    advance(g,2);assert.equal(damage(g),next);
    // A real medical transaction advances world bleeding before its final save. Failed saves
    // must restore the fractional wound state as well as medicine targets, inventory and time.
    g.InventoryEquipment.equip('medical_kit',{item_id:'tool_medical_kit_basic',count:1});
    const kit=g.MedicalKit.equipped().instance_id;
    g.InventoryEquipment.setState({...g.InventoryEquipment.getState(),inventory_pocket:[{item_id:'supply_medical_hemostatic_gauze',count:1}]});
    const tick=g.WorldTick.getWorldTotalTicks(),p=copy(wound(g).injury_progress),d=damage(g),inventory=copy(g.InventoryEquipment.getState().inventory_pocket);
    const save=g.SaveSystem.saveNow;g.SaveSystem.saveNow=()=>false;
    assert.equal(g.MedicalActions.refill(kit,'hemostatic_gauze').ok,false);
    g.SaveSystem.saveNow=save;
    assert.equal(g.WorldTick.getWorldTotalTicks(),tick);assert.equal(damage(g),d);
    assert.deepEqual(copy(wound(g).injury_progress),p);assert.deepEqual(copy(g.InventoryEquipment.getState().inventory_pocket),inventory);
    assert.equal(slow(g),.35);assert.equal(slow(g,'rhand'),0);
    assert.ok(g.MedicalActions.refill(kit,'hemostatic_gauze').ok);
    stock();assert.ok(g.ItemUseActions.tryUseItemFromContainer('pocket',0,{part_id:'rhand'}));advance(g,3);
    assert.equal(slow(g),.35);assert.equal(slow(g,'rhand'),.35);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
