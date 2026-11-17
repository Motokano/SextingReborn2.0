// Isolated balance rehearsal. Uses production combat, medical, rest, XP and save rules.
// Artificial starting injuries and arena/extraction placement are explicitly tagged in output.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {boot} from './ui-game-fixture.mjs';
const copy=v=>JSON.parse(JSON.stringify(v));
const boss=process.argv.includes('--boss'),edges=process.argv.includes('--edges');
const prepared=process.argv.includes('--prepared')||boss;
const parts=['head','chest','belly','lhand','rhand','lfoot','rfoot'];
const skills=['survival_health','survival_vitality','survival_surgery'];
const h=await boot(false),g=h.g,I=g.InventoryEquipment,S=g.Survival,C=g.CharacterAttributes,K=g.MedicalKit,A=g.MedicalActions;
const out={method:{engine:'formal native entry in isolated DOM; no live save',scope:'fixed injury recovery drills plus existing-enemy combat fragments',tick_minutes:10,rest_seconds_per_tick:5,build:prepared?'combat skills60; innate attributes20/acquired0; diqi filled subject to real cap; medical skills0':'new character combat skills1, default loadout and diqi1; medical skills0',automatic_treatment_policy:'heavy bleed, ordinary bleed, fracture, infection, surgery, dressings; then rest',combat_policy:`repeat default attacks up to ${boss?24:8} turns; no drugs, no tactical healing; extraction is a fixture, not tested escape`},drills:[],combat:[],endurance:[],edges:[]};
function random(seed){return()=>{seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=(t+Math.imul(t^t>>>7,61|t))^t;return((t^t>>>14)>>>0)/4294967296;};}
const tick=()=>g.WorldTick.getWorldTotalTicks();
const body=()=>Object.fromEntries(parts.map(p=>[p,K.body(p)]));
const total=()=>parts.reduce((n,p)=>n+C.getPartDestroy(p),0);
const resources=()=>{const s=S.getState();return Object.fromEntries(['stamina','satiety','thirst','fatigue','pain','qi_li_current','diqi_current','diqi_max','diqi_cap_limit'].map(k=>[k,s[k]]));};
const xp=()=>Object.fromEntries(skills.map(id=>[id,I.getStudyExp(id)]));
const remaining=id=>K.profile(K.find(id)).state.remaining;
const delta=(a,b)=>Object.fromEntries(Object.keys(a).map(k=>[k,a[k]-b[k]]));
let baseline,id;
function reset(seed=1){
  g.PlayerActions.setRestingActionActive(false,{showMsg:false});A.cancel();
  assert.equal(g.SaveSystem.applySnapshotForDebug(copy(baseline)),true);
  g.DialogueUI.close();g.Math.random=random(seed);id=K.equipped().instance_id;
}
function safeArea(){
  g.GameEngine.getMap().enemies=[];g.CombatEngagement.clear('balance_extraction');
  g.GameEngine.setState('M0_Base_Inside_lv_1',4,10);
}
function setLevels(level){const st=I.getState();for(const key of skills)st.skills[key]={level,study_exp:0,move_usage:{}};I.setState(st);}
function freshKit(kind='none',affixes=[]){
  const item=g.MedicalKitData.bodies[kind].item_id;
  assert.equal(I.equip('medical_kit',{item_id:item,count:1}).success,true);id=K.equipped().instance_id;
  const instance=K.find(id),p=K.profile(instance);
  // Supply a fully stocked kit before each drill; use the actual refill planner and mass conversion.
  for(const key of Object.keys(p.caps))while(K.profile(instance).state.remaining[key]<p.caps[key])K.refill(instance,key,K.refillPlan(instance,key,1));
  instance.attribute_state.structure.medical_storage.affixes=affixes;
}
function treat(part,key,mode,log){
  const at=tick(),before=copy(remaining(id)),r=A.treat(id,part,key,mode);
  if(!r.ok){log.push({part,key,rejected:r.message});return false;}
  while(A.isActive()){const step=A.advance();if(!step.ok){log.push({part,key,interrupted:step.message});return false;}}
  log.push({part,key,mode,ticks:tick()-at,cost:delta(before,remaining(id))});return true;
}
function medical(){
  const start=tick(),stock=copy(remaining(id)),before=body(),log=[];
  for(const [type,key] of [['heavy_bleeding','tourniquet'],['bleeding','hemostatic_gauze'],['fracture','fracture_band'],['wound_infection','medical_alcohol']]){
    for(const p of parts)if(K.body(p).injuries.includes(type)){
      // Fixed bandaging may solve the fracture and ordinary bleed together.
      let use=key;if(type==='bleeding' && K.profile(K.find(id)).state.affixes.includes('fixed') && K.body(p).injuries.includes('fracture'))use='fracture_band';
      const linked=K.profile(K.find(id)).kind==='linked' && !A.therapyPlan(id,p,use,'linked').reason;
      treat(p,use,linked?'linked':'normal',log);
    }
  }
  for(const p of parts){const b=K.body(p);if(b.damage>=b.max && !A.therapyPlan(id,p,'surgical_staples','normal').reason){
    const mode=K.profile(K.find(id)).kind==='linked' && !A.therapyPlan(id,p,'surgical_staples','linked').reason?'linked':'normal';
    treat(p,'surgical_staples',mode,log);
  }}
  for(const p of parts)if(!A.therapyPlan(id,p,'trauma_dressing','normal').reason)treat(p,'trauma_dressing','normal',log);
  return{ticks:tick()-start,cost:delta(stock,remaining(id)),before,after:body(),actions:log,remaining:copy(remaining(id)),xp:xp(),resources:resources()};
}
function rest(limit=160){
  const at=tick(),before=resources(),initial=total(),beforeXP=xp();let n=0,stalled=0,last=initial;
  g.PlayerActions.setRestingActionActive(true,{showMsg:false});
  while(total()>0 && n<limit && !S.isDead() && !S.isComa()){
    const t=tick();S.advanceTick();if(tick()===t)break;n++;
    if(total()===last)stalled++;else stalled=0;last=total();
    if(stalled>=12)break;
  }
  g.PlayerActions.setRestingActionActive(false,{showMsg:false});
  const normalMax=parts.every(p=>K.body(p).max===out.initial.body[p].max);
  return{ticks:tick()-at,real_seconds:(tick()-at)*out.method.rest_seconds_per_tick,healed:initial-total(),remaining_damage:total(),after:body(),resource_cost:delta(before,resources()),resources:resources(),xp_gain:delta(xp(),beforeXP),damage_cleared:total()===0,normal_maxima_restored:normalMax};
}
function injure(damage,injuries=[]){for(const [part,n] of Object.entries(damage))C.applyCombatDestroy(part,n);for(const [part,type] of injuries)assert.equal(g.InjurySystem.apply('player',part,type),true);}
try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  const name=g.document.getElementById('creation-name');name.value='医疗平衡隔离测试';name.dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();g.document.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  safeArea();freshKit();setLevels(0);
  if(prepared){
    C.setState({innate:{jingu:20,flexibility:20,breath:20,dexterity:20,focus:20},acquired:{jingu:0,flexibility:0,breath:0,dexterity:0,focus:0}});
    const st=I.getState();for(const key of ['combat_basic_unarmed','combat_basic_breath','combat_basic_footwork'])st.skills[key]={level:60,study_exp:0,move_usage:{}};I.setState(st);
    S.setState({diqi_cap_limit:200,diqi_max:200,diqi_current:200});
  }
  S.setState({stamina:100,energy:100,satiety:100,thirst:100,fatigue:0,isDead:false,isComa:false,qi_li_current:100});
  baseline=copy(g.SaveSystem.buildSnapshotForDebug());
  out.initial={attributes:C.getState(),resources:resources(),skills:I.getSkillsState(),combat:I.getCombatState(),body:body(),full_kit:copy(remaining(id))};
  // Omit repeated presentation work, never state mutation, time, saves or combat formulas.
  for(const [obj,key] of [[g.SceneHud,'refresh'],[g.SceneMapView,'render'],[g.SceneRenderer,'render'],[g.InventoryPanel,'updateBackpackPanel'],[g.MedicalKitPanel,'refresh'],[g.ManufacturingPanel,'refresh']])if(obj)obj[key]=()=>{};
  const drills=[
    {name:'轻伤：单臂20',damage:{lhand:20}},
    {name:'轻伤：四肢各20',damage:{lhand:20,rhand:20,lfoot:20,rfoot:20}},
    {name:'中伤：单臂70＋普通出血',damage:{lhand:70},injuries:[['lhand','bleeding']]},
    {name:'中伤：胸55、腹50、臂70、腿80',damage:{chest:55,belly:50,lhand:70,lfoot:80},injuries:[['lhand','bleeding'],['lfoot','fracture']]},
    {name:'重伤：单臂满损毁＋大出血',damage:{lhand:100},injuries:[['lhand','heavy_bleeding']]},
    {name:'重伤：单腿满损毁＋大出血＋骨折＋感染',damage:{lfoot:100},injuries:[['lfoot','heavy_bleeding'],['lfoot','fracture'],['lfoot','wound_infection']]},
    {name:'多处普通出血：头20、胸55、腹50、腿60',damage:{head:20,chest:55,belly:50,lfoot:60},injuries:[['head','bleeding'],['chest','bleeding'],['belly','bleeding'],['lfoot','bleeding']]}
  ];
  const pilot=process.argv.includes('--pilot');
  for(const d of (prepared||edges?[]:pilot?drills.slice(0,1):drills)){
    reset(19);S.setState({stamina:60});injure(d.damage,d.injuries);const treatment=medical(),recovery=rest();out.drills.push({...d,kind:'none',level:0,treatment,recovery});
    console.log('DRILL',d.name,treatment.ticks,recovery.ticks,JSON.stringify(treatment.cost));
  }
  if(!pilot&&!prepared&&!edges){
    for(const kind of ['expand','meter','quick','linked']){
      reset(19);freshKit(kind);S.setState({stamina:60});const d=drills[3];injure(d.damage,d.injuries);const treatment=medical(),recovery=rest();out.drills.push({...d,kind,level:0,treatment,recovery});
    }
    for(const level of [50,100]){
      reset(19);setLevels(level);S.setState({stamina:60});const d=drills[4];injure(d.damage,d.injuries);const treatment=medical(),recovery=rest();out.drills.push({...d,kind:'none',level,treatment,recovery});
    }
    for(const kind of ['none','quick','meter','expand']){
      reset(19);freshKit(kind);const episodes=[];
      for(let n=1;n<=12;n++){
        // Only reset damage between identical episodes; kit, experience and world costs persist.
        C.setState({part_destroy:{head:0,chest:0,abdomen:0,lhand:0,rhand:0,lfoot:0,rfoot:0},surgical_max_loss:{}});
        injure({lhand:70},[['lhand','bleeding']]);const t=medical();episodes.push(t);
        if(K.body('lhand').injuries.length || K.body('lhand').damage>=35)break;
      }
      out.endurance.push({kind,method:'repeat identical arm70+ordinary bleed; no refill, between-episode healing assumed; not a full journey',episodes});
    }
  }
  // Existing enemies and production default player build. Stop after eight turns to compare pressure, not claim player win rates.
  if(edges){
    reset(19);S.setState({stamina:60});injure({lhand:70},[['lhand','bleeding']]);const t=medical();
    I.setState({...I.getState(),inventory_pocket:[{item_id:'supply_medical_trauma_dressing',count:1},{item_id:'supply_medical_hemostatic_gauze',count:1}]});
    const start=tick(),before=copy(remaining(id)),result=A.refillAll(id);
    out.edges.push({name:'refill_after_one_arm_treatment',treatment:t,refill:{result,ticks:tick()-start,gain:delta(remaining(id),before),inventory:I.getPocketArray()}});
    reset(19);S.setState({stamina:60});injure({lhand:100},[['lhand','heavy_bleeding']]);const treatment=medical(),recovery=rest();
    g.GameEngine.setState('M0_Base_Inside_lv_1',10,15);g.confirm=()=>true;
    const denied=!g.PlayerActions.trySleepAtBed(),fatigue=S.getState().fatigue;
    assert.equal(denied,true);assert.equal(g.BedSleep.isActive(),false);
    let now=0,serial=0;const callbacks=new Map(),nativeSet=g.setTimeout.bind(g),nativeClear=g.clearTimeout.bind(g);
    g.performance.now=()=>now;
    g.setTimeout=(fn,ms,...args)=>{if(ms!==1000)return nativeSet(fn,ms,...args);const key='sleep-balance-'+(++serial);callbacks.set(key,()=>fn(...args));return key;};
    g.clearTimeout=key=>{if(!callbacks.delete(key))nativeClear(key);};
    S.setState({fatigue:60,satiety:100,thirst:100});const prior=resources(),sleepTick=tick();assert.equal(g.PlayerActions.trySleepAtBed(),true);
    for(let n=0;n<48;n++){const [key,fn]=callbacks.entries().next().value||[];assert.ok(fn);callbacks.delete(key);now+=1000;fn();}
    assert.equal(g.BedSleep.isActive(),false);assert.equal(K.body('lhand').max,100);
    out.edges.push({name:'sleep_admission_and_maximum_recovery',treatment,recovery,post_surgery_fatigue:fatigue,denied_while_not_tired:denied,qualified_sleep:{fixture:'set fatigue60 and food/water100 only to test admission/completion; not included in natural recovery timing',ticks:tick()-sleepTick,cost:delta(prior,resources()),after:body(),xp:xp()}});
  }
  const enemies=edges?[]:boss?['enemy.street_thug_boss']:pilot?['enemy.street_thug_tier1']:prepared?['enemy.street_thug_tier1','enemy.street_thug_tier2','enemy.street_thug_tier3']:['enemy.street_thug','enemy.street_thug_tier1','enemy.street_thug_tier2','enemy.street_thug_tier3'];
  const count=pilot?2:12;
  for(const enemyId of enemies)for(let seed=1;seed<=count;seed++){
    reset(seed*137);S.setState({stamina:100});
    const map=g.GameEngine.getMap(),pos=g.GameEngine.getState(),enemy={enemy_id:enemyId,x:pos.x+1,y:pos.y};map.enemies.push(enemy);
    const index=map.enemies.indexOf(enemy),start=tick();let turns=0,stop='turn_limit',stalled=0;
    for(;turns<(boss?24:8);turns++){
      if(S.isDead()){stop='dead';break;}if(g.CombatEnemies.isEnemyDead(map.map_id,index)){stop='enemy_defeated';break;}
      const p=g.GameEngine.getState(),e=map.enemies[index];if(!e){stop='enemy_removed';break;}
      if(Math.max(Math.abs(e.x-p.x),Math.abs(e.y-p.y))>1){stop='separated';break;}
      const t=tick();g.SceneCtx.actions.attackEnemy(enemyId,{x:e.x,y:e.y,fromX:p.x,fromY:p.y});
      if(tick()===t){g.SceneMovement.waitInPlace();if(++stalled>=3){stop='cannot_attack';break;}}else stalled=0;
    }
    const fight={enemyId,seed,turns,ticks:tick()-start,stop,dead:S.isDead(),after:body(),xp:xp(),resources:resources()};
    if(!S.isDead()){safeArea();fight.treatment=medical();fight.recovery=rest();}
    out.combat.push(fight);console.log('FIGHT',enemyId,seed,turns,stop,fight.dead,JSON.stringify(fight.xp));
  }
  assert.deepEqual(h.errors,[]);
  out.runtime_errors=h.errors;
  fs.writeFileSync(edges?'tmp/medical-balance-edges-20261117.json':boss?'tmp/medical-balance-boss-20261117.json':prepared?'tmp/medical-balance-prepared-20261117.json':pilot?'tmp/medical-balance-pilot.json':'tmp/medical-balance-20261117.json',JSON.stringify(out,null,2)+'\n');
}finally{await h.close();}
