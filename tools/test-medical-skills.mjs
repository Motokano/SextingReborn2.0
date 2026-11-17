import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';
const copy=v=>JSON.parse(JSON.stringify(v));
const surgery='survival_surgery';
const skills=(health,vitality)=>({survival_health:{level:health},survival_vitality:{level:vitality}});
function probabilityRuntime(){
  const g={Math:Object.create(Math)};g.window=g;vm.createContext(g);
  for(const f of ['injury-data','injury-system'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),g);
  return g;
}
test('health and vitality apply relative reductions once, retain decimals, zeros and part restrictions',()=>{
  const g=probabilityRuntime(),p=g.InjurySystem.probabilities;
  for(const [level,expected] of [[0,[45,50,60]],[50,[33.75,42.5,45]],[100,[22.5,35,30]],[-20,[45,50,60]],[1000,[22.5,35,30]]]){
    assert.deepEqual(Object.values(p({blunt:50,slash:50,pierce:50},100,'lhand',skills(level,level))),expected);
  }
  assert.deepEqual(Object.values(p({blunt:50},100,'lhand',skills(100,0))),[30,10,30]);
  assert.deepEqual(Object.values(p({pierce:50},100,'lhand',skills(0,100))),[15,35,15]);
  assert.deepEqual(Object.values(p({slash:5},100,'head',skills(1,1))),[14.925,0,0]);
  assert.deepEqual(Object.values(p({pierce:4.99},100,'lhand',skills(100,100))),[0,0,0]);
});
test('attack aggregation uses defender skills, one mutually exclusive bleed roll and an independent fracture roll',()=>{
  const g=probabilityRuntime(),I=g.InjurySystem;
  let level=100,rolls=[];
  g.InventoryEquipment={getSkillLevel:()=>level};
  g.CharacterAttributes={getNormalBodyPartDestroyMax:()=>100};
  g.CombatEnemies={getById:()=>({}),getDungeonState:()=>({ownerId:'enemy-1',maxes:{lhand:100}})};
  g.Math.random=()=>{assert.ok(rolls.length);return rolls.shift();};
  const run=(defender,draws,segments)=>{
    rolls=[...draws];const ctx={attacker:{kind:'player',skills:skills(100,100)},defender,simultaneousDryRun:true,
      segmentsResults:segments||[{hitPart:'lhand',finalDamage:50,damageType:'pierce'}]};
    I.finishAttack(ctx);assert.equal(rolls.length,0);return copy(ctx.injuryOutcomes).map(o=>o.type);
  };
  assert.deepEqual(run({kind:'player'},[.34,.99]),['heavy_bleeding']);
  assert.deepEqual(run({kind:'player'},[.36,.99]),['bleeding']);
  assert.deepEqual(run({kind:'player'},[.51,.99]),[],'removed bleed chance becomes no injury');
  assert.deepEqual(run({kind:'enemy',mapId:'test',index:0,enemyId:'test'},[.4,.1]),['heavy_bleeding','fracture'],'player skills cannot protect an enemy');
  assert.deepEqual(run({kind:'enemy',mapId:'test',index:0,enemyId:'test',skills:skills(100,100)},[.51,.1]),[]);
  level=0;assert.deepEqual(run({kind:'player'},[.4,.1]),['heavy_bleeding','fracture'],'attacker level cannot protect defender');
  level=100;
  assert.deepEqual(run({kind:'player'},[.26,.2],[{hitPart:'lhand',finalDamage:25,damageType:'blunt'},{hitPart:'lhand',finalDamage:25,damageType:'blunt'}]),['fracture']);
  assert.deepEqual(run({kind:'player'},[],[{hitPart:'lhand',finalDamage:0,damageType:'slash'}]),[]);
});

// Advance scheduled world actions without real waiting; game transactions remain intact.
function clockFor(g){
  let now=0,serial=0;const pending=new Map(),set=g.setTimeout.bind(g),clear=g.clearTimeout.bind(g);
  g.performance.now=()=>now;
  g.setTimeout=(fn,ms,...args)=>{if(ms!==1000)return set(fn,ms,...args);const id='medical-skill-'+(++serial);pending.set(id,{at:now+ms,fn:()=>fn(...args)});return id;};
  g.clearTimeout=id=>{if(!pending.delete(id))clear(id);};
  return {advance(ms){const end=now+ms;for(;;){const next=[...pending].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;pending.delete(next[0]);next[1].fn();}now=end;}};
}
async function setup(full){
  let clock;const h=await boot(full,{beforeScripts:g=>{clock=clockFor(g);}}),g=h.g;
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  const input=g.document.getElementById('creation-name');input.value='医疗技能';input.dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();g.document.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  g.GameEngine.setState('M0_Base_Inside_lv_1',4,10);healthy(g);
  g.InventoryEquipment.equip('medical_kit',{item_id:'tool_medical_kit_basic',count:1});
  return Object.assign(h,{clock});
}
function healthy(g){g.Survival.setState({stamina:100,energy:100,satiety:100,thirst:100,fatigue:0,isDead:false,isComa:false});}
function setSkill(g,level,exp=0){g.InventoryEquipment.setState({skills:{...g.InventoryEquipment.getState().skills,[surgery]:{level,study_exp:exp,move_usage:{}}}});}
function fill(g){
  const I=g.InventoryEquipment,A=g.MedicalActions,id=g.MedicalKit.equipped().instance_id;
  I.setState({inventory_pocket:[{item_id:'supply_skin_stapler',count:1},{item_id:'supply_skin_stapler',count:1}]});
  while(!A.refillPlan(id,'surgical_staples').reason)assert.equal(A.refill(id,'surgical_staples').ok,true);
  return id;
}
function fullDamage(g,part){g.CharacterAttributes.setState({part_destroy:{...g.CharacterAttributes.getState().part_destroy,[part]:g.CharacterAttributes.getBodyPartDestroyMax(part)}});}
function operate(g,part,mode='normal'){
  healthy(g);const id=fill(g);fullDamage(g,part);
  const started=g.MedicalActions.treat(id,part,'surgical_staples',mode);assert.equal(started.ok,true,started.message);
  let r;for(let i=0;i<6;i++)r=g.MedicalActions.advance();assert.equal(r.ok,true);return r;
}
const exp=g=>g.InventoryEquipment.getStudyExp(surgery);
const rewarded=g=>copy(g.MedicalActions.getProgress().rewarded_parts).sort();
function failWrites(g){const old=g.Storage.prototype.setItem;g.Storage.prototype.setItem=()=>{throw Error('quota');};return ()=>{g.Storage.prototype.setItem=old;};}

for(const full of [false,true]){
  const ui=full?'Svelte':'native';
  test(`${ui}: successful surgery awards 1 shared XP, freezes its level, and rolls back the last tick atomically`,async()=>{
    const h=await setup(full),g=h.g,A=g.MedicalActions,I=g.InventoryEquipment;
    try{
      setSkill(g,49,4999);const id=fill(g);fullDamage(g,'lhand');
      I.addPotential(12345);const potential=I.getPotential();
      assert.equal(A.treat(id,'lhand','surgical_staples','normal').ok,true);assert.equal(A.getState().afterMax,74);
      for(let i=0;i<5;i++)A.advance();
      const tick=g.WorldTick.getWorldTotalTicks(),repair=failWrites(g);
      assert.equal(A.advance().ok,false);assert.equal(exp(g),4999);assert.equal(I.getSkillLevel(surgery),49);
      assert.deepEqual(rewarded(g),[]);assert.equal(A.getState().elapsed,5);assert.equal(g.MedicalKit.body('lhand').max,100);
      assert.equal(g.WorldTick.getWorldTotalTicks(),tick);repair();
      assert.equal(A.advance().experience,1);assert.equal(I.getSkillLevel(surgery),50);assert.equal(exp(g),0);
      assert.equal(g.MedicalKit.body('lhand').max,74,'new level does not change this operation');
      assert.equal(I.getPotential(),potential);assert.deepEqual(rewarded(g),['lhand']);
      assert.equal(A.advance().ok,false);assert.equal(exp(g),0);
      const snapshot=copy(g.SaveSystem.buildSnapshotForDebug());assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot),true);await h.drain();
      assert.deepEqual(rewarded(g),['lhand']);assert.equal(operate(g,'lhand').experience,0);
      assert.equal(operate(g,'rhand').experience,1);assert.equal(g.MedicalKit.body('rhand').max,75);assert.equal(exp(g),1);
      assert.deepEqual(rewarded(g),['lhand','rhand']);assert.deepEqual(h.errors,[]);
    }finally{await h.close();}
  });
  test(`${ui}: cancellation, interruption and unfinished saves keep first-success eligibility; old saves migrate safely`,async()=>{
    const h=await setup(full),g=h.g,A=g.MedicalActions;
    try{
      setSkill(g,0);const id=fill(g);
      assert.equal(A.treat(id,'lhand','surgical_staples','normal').ok,false);assert.equal(exp(g),0);
      fullDamage(g,'lhand');assert.equal(A.treat(id,'lhand','surgical_staples','normal').ok,true);
      A.advance();assert.equal(A.cancel().ok,true);assert.deepEqual(rewarded(g),[]);assert.equal(exp(g),0);
      healthy(g);assert.equal(A.treat(id,'lhand','surgical_staples','normal').ok,true);A.advance();
      g.GameEngine.setState('M0_Base_Inside_lv_1',4,11);assert.equal(A.advance().ok,false);
      assert.deepEqual(rewarded(g),[]);assert.equal(exp(g),0);g.GameEngine.setState('M0_Base_Inside_lv_1',4,10);
      healthy(g);fill(g);assert.equal(A.treat(id,'lhand','surgical_staples','normal').ok,true);A.advance();A.advance();
      const old=copy(g.SaveSystem.buildSnapshotForDebug());delete old.medical_progress;
      assert.equal(g.SaveSystem.applySnapshotForDebug(old),true);await h.drain();
      assert.equal(A.getState().elapsed,2);assert.equal(exp(g),0);
      for(let i=0;i<4;i++)A.advance();assert.equal(exp(g),1);assert.deepEqual(rewarded(g),['lhand']);
      const saved=copy(g.SaveSystem.buildSnapshotForDebug());saved.medical_progress.rewarded_parts.push('head');
      assert.equal(g.SaveSystem.applySnapshotForDebug(saved),false);assert.equal(exp(g),1);assert.deepEqual(rewarded(g),['lhand']);
      healthy(g);fill(g);fullDamage(g,'rhand');assert.equal(A.treat(id,'rhand','surgical_staples','normal').ok,true);
      for(let i=0;i<5;i++)A.advance();
      g.CharacterAttributes.setState({part_destroy:{...g.CharacterAttributes.getState().part_destroy,head:g.CharacterAttributes.getBodyPartDestroyMax('head')-1}});
      g.InjurySystem.apply('player','head','bleeding');
      assert.equal(A.advance().ok,false,'death on the final tick prevents completion');
      assert.equal(g.Survival.isDead(),true);assert.equal(exp(g),1);assert.deepEqual(rewarded(g),['lhand']);
      assert.equal(g.MedicalKit.body('rhand').max,100);
      assert.deepEqual(h.errors,[]);
    }finally{await h.close();}
  });
  test(`${ui}: only complete 48-tick sleep resets all limb eligibility; failed final save preserves flags`,async()=>{
    const h=await setup(full),g=h.g,A=g.MedicalActions,B=g.BedSleep;
    try{
      setSkill(g,0);operate(g,'lhand');operate(g,'lfoot');assert.equal(exp(g),2);
      const original=rewarded(g);
      g.GameEngine.setState('M0_Base_Inside_lv_1',10,15);healthy(g);
      assert.equal(g.SceneApp.trySleepAtBed(),false,'postoperative loss does not waive fatigue');
      g.Survival.setResting(true);g.Survival.advanceTick();g.Survival.setResting(false);assert.deepEqual(rewarded(g),original);
      g.confirm=()=>true;g.Survival.setState({fatigue:100});assert.equal(g.SceneApp.trySleepAtBed(),true);
      h.clock.advance(2000);B.interrupt();assert.deepEqual(rewarded(g),original);
      g.Survival.setState({fatigue:100,satiety:100,thirst:100});assert.equal(g.SceneApp.trySleepAtBed(),true);
      h.clock.advance(47000);assert.equal(B.getState().completed,47);assert.deepEqual(rewarded(g),original);
      const loss=copy(g.CharacterAttributes.getState().surgical_max_loss),repair=failWrites(g);
      h.clock.advance(1000);assert.equal(B.getState().completed,47);assert.deepEqual(rewarded(g),original);
      assert.deepEqual(copy(g.CharacterAttributes.getState().surgical_max_loss),loss);assert.equal(exp(g),2);repair();
      g.document.querySelector('.bed-sleep-retry').click();h.clock.advance(1000);assert.equal(B.isActive(),false);assert.deepEqual(rewarded(g),[]);
      assert.deepEqual(copy(g.CharacterAttributes.getState().surgical_max_loss),{});assert.equal(exp(g),2);
      assert.equal(operate(g,'lhand').experience,1);assert.equal(exp(g),3);assert.deepEqual(h.errors,[]);
    }finally{await h.close();}
  });
}
test('surgery reaches 100 through the shared 5000-XP pool, with no overflow through study or imported saves',async()=>{
  const h=await setup(false),g=h.g,I=g.InventoryEquipment;
  try{
    setSkill(g,99,4999);assert.equal(operate(g,'lhand').experience,1);assert.equal(I.getSkillLevel(surgery),100);assert.equal(exp(g),0);
    assert.equal(operate(g,'rhand').experience,0);assert.equal(g.MedicalKit.body('rhand').max,100);assert.equal(exp(g),0);
    assert.equal(g.Survival.startStudy(surgery).reason,'max_level');I.addStudyExp(surgery,100000);I.tryAdvanceSkillLevel(surgery);
    assert.equal(exp(g),0);assert.equal(I.getSkillLevel(surgery),100);
    g.SceneApp.panelApi.addSkill(surgery,1,{});assert.equal(I.getSkillLevel(surgery),100);assert.equal(exp(g),0);
    I.setState({skills:{...I.getState().skills,[surgery]:{level:1000,study_exp:9999}},skill_max_level_bonus:{[surgery]:100}});
    assert.equal(I.getSkillLevel(surgery),100);assert.equal(I.getProgressionSkillCap(surgery),100);assert.equal(exp(g),0);
    for(const lv of [0,1,50,99])assert.equal(g.CombatSkills.getPotentialCostForLevel(surgery,lv),5000);
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
test('all bodies and limbs share rewards; linked surgery can skip dressing, quick combat has no XP bonus',async()=>{
  const h=await setup(false),g=h.g,I=g.InventoryEquipment;
  try{
    setSkill(g,0);
    for(const [kind,part] of [['basic','lhand'],['expanded','rhand'],['metered','lfoot'],['linked','rfoot']]){
      assert.equal(I.equip('medical_kit',{item_id:'tool_medical_kit_'+kind,count:1}).success,true);
      if(kind==='linked'){
        I.setState({inventory_pocket:[{item_id:'supply_medical_trauma_dressing',count:1}]});
        assert.equal(g.MedicalActions.refill(g.MedicalKit.equipped().instance_id,'trauma_dressing').ok,true);
        g.InjurySystem.apply('player',part,'fracture');
      }
      assert.equal(operate(g,part,kind==='linked'?'linked':'normal').experience,1);
      if(kind==='linked'){
        assert.equal(g.InjurySystem.has('player',part,'fracture'),true);
        assert.equal(g.MedicalKit.profile(g.MedicalKit.equipped()).state.remaining.trauma_dressing,100);
      }
    }
    assert.equal(exp(g),4);I.equip('medical_kit',{item_id:'tool_medical_kit_quick',count:1});fill(g);
    g.CombatEngagement.engageEnemy({mapId:g.GameEngine.getState().mapId,index:0,enemyId:'test',record:{},silent:true});
    healthy(g);fullDamage(g,'lhand');const id=g.MedicalKit.equipped().instance_id;
    assert.equal(g.MedicalActions.treat(id,'lhand','surgical_staples','normal').ok,true);
    for(let i=0;i<6;i++)g.MedicalActions.advance();assert.equal(exp(g),4,'changing kits and fighting never resets eligibility');
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
