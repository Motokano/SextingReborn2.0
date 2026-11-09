import {startTraining} from './lib/gym-training-test.mjs';
import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v)),read=p=>fs.readFileSync(p,'utf8');
const data=JSON.parse(read('data/muscles.json'));
const lit=list=>Object.fromEntries(list.map(m=>[m.id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function context(){
 const g=vm.createContext({fetch:async()=>({ok:true,json:async()=>copy(data)}),Math:Object.create(Math)});g.window=g;
 vm.runInContext(read('js/muscles.js'),g);await g.Muscles.ready;return g;
}

for(const {prefix,count,limbs,aliases,names} of [
 {prefix:'thigh',count:14,limbs:['lfoot','rfoot'],aliases:['left_leg','right_leg'],names:['左腿','右腿']},
 {prefix:'upperarm',count:5,limbs:['lhand','rhand'],aliases:['left_arm','right_arm'],names:['左臂','右臂']}
]){
const parts=side=>data.muscles.filter(m=>m.group===prefix+'_'+side),all=[...parts('l'),...parts('r')];
const sidePercent=count/10,totalPercent=count/5,sideBonus=count/1000,bonus=count/500,partialBonus=(count*2-1)/1000;
const hiddenTotal=7+count*2,hiddenPartial=hiddenTotal-1;

test(`all ${count*2} ${prefix} muscles replace strength with global 0.1 percentage-point parry rewards`,async()=>{
 const g=await context(),M=g.Muscles;
 assert.equal(parts('l').length,count);assert.equal(parts('r').length,count);
 for(const m of all){
  assert.deepEqual(m.effects,[{type:'parryChancePercent',delta:.1}]);
  M.setState({progress:{[m.id]:99.999}});near(M.getParryChanceBonus(),0);
  M.addGrowth(m.id,.001);near(M.getParryChanceBonus(),.001);assert.equal(M.getStatBonus().acquired.jingu,0);
  assert.equal(M.getStatBonus().acquiredPercent.jingu,0);
  assert.equal(M.getEffectsText(m.id),'全局招架率+0.1%');
  for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(m.id,10);near(M.getParryChanceBonus(),.001);}
 }
 for(const side of ['l','r']){M.setState({unlocked:lit(parts(side))});assert.equal(M.getStatBonus().parryChancePercent,sidePercent);near(M.getParryChanceBonus(),sideBonus);assert.equal(M.getStatBonus().acquiredPercent.jingu,0);assert.equal(M.getDestroyMaxPercentForLimb(side==='l'?limbs[0]:limbs[1]),10);assert.equal(M.getDestroyMaxPercentForLimb(side==='l'?limbs[1]:limbs[0]),0);}
 for(const missing of all){
  M.setState({unlocked:lit(all.filter(m=>m.id!==missing.id)),progress:{[missing.id]:99.999}});near(M.getParryChanceBonus(),partialBonus);
  assert.equal(M.getStatBonus().acquiredPercent.jingu,0);
  const own=missing.group===prefix+'_l'?limbs[0]:limbs[1],other=own===limbs[0]?limbs[1]:limbs[0];
  assert.equal(M.getStatBonus().destroyMaxPercent[own],0);assert.equal(M.getStatBonus().destroyMaxPercent[other],10);
  M.addGrowth(missing.id,.001);assert.equal(M.getStatBonus().parryChancePercent,totalPercent);near(M.getParryChanceBonus(),bonus);
  for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(missing.id,1);assert.equal(M.getStatBonus().acquiredPercent.jingu,0);assert.equal(M.getDestroyMaxPercentForLimb(own),10);assert.equal(M.getDestroyMaxPercentForLimb(other),10);}
 }
 M.setState({unlocked:{unknown:true}});near(M.getParryChanceBonus(),0);
 assert.equal(M.getStatBonus().acquiredPercent.jingu,0);
});

test(`${prefix} completion increases only the same limb destroy cap, replaces strength and applies to real damage and disability thresholds`,async()=>{
 const g=await context(),M=g.Muscles;
 vm.runInContext(read('js/character-attributes.js'),g);const CA=g.CharacterAttributes;
 CA.setState({innate:{jingu:20,dexterity:20}});
 const strength=()=>{CA.recalcCharacterStats();return CA.getState().acquired.jingu;};
 CA.setExternalAcquiredBonus({jingu:100,dexterity:50});near(strength(),100);
 for(const side of ['l','r']){
  M.setState({unlocked:lit(parts(side))});near(strength(),100);
  assert.equal(CA.getBodyPartDestroyMax(side==='l'?limbs[0]:limbs[1]),110);assert.equal(CA.getBodyPartDestroyMax(side==='l'?limbs[1]:limbs[0]),100);
 }
 M.setState({unlocked:lit(all)});near(strength(),100);assert.equal(CA.getInnateAttr('jingu'),20);near(CA.getState().acquired.dexterity,50);
 for(let i=0;i<4;i++){near(strength(),100);assert.equal(CA.getBodyPartDestroyMax(aliases[0]),110);assert.equal(CA.getBodyPartDestroyMax(aliases[1]),110);}
 for(const [part,max] of Object.entries({head:50,chest:100,abdomen:80,belly:80,...Object.fromEntries(['lhand','rhand','lfoot','rfoot'].filter(k=>!limbs.includes(k)).map(k=>[k,100]))}))assert.equal(CA.getBodyPartDestroyMax(part),max);
 CA.setConfig({body_part_destroy_max:{[limbs[0]]:200,[limbs[1]]:150}});assert.equal(CA.getBodyPartDestroyMax(limbs[0]),220);assert.equal(CA.getBodyPartDestroyMax(limbs[1]),165);
 CA.setConfig({body_part_destroy_max:null,limb_destroy_max:125});assert.equal(CA.getBodyPartDestroyMax(limbs[0]),137);
 CA.setConfig({limb_destroy_max:100});M.setState({unlocked:lit(parts('l'))});
 CA.setState({part_destroy:{[limbs[0]]:100}});assert.equal(CA.getPartDestroy(limbs[0]),100);assert.equal(CA.isBodyPartDestroyedForParry(aliases[0]),false);
 const pain=[];g.Survival={addPainFromDestroy:v=>pain.push(v),isDead:()=>false,setDead:()=>{throw Error('unexpected death');}};
 CA.applyCombatDestroy(aliases[0],9);assert.equal(CA.getPartDestroy(limbs[0]),109);assert.equal(CA.isBodyPartDestroyedForParry(aliases[0]),false);
 assert.equal(pain[0].actualIncrement,9);assert.equal(pain[0].partMax,110);assert.equal(pain[0].partPreValue,100);
 CA.applyCombatDestroy(aliases[0],2);assert.equal(CA.getPartDestroy(limbs[0]),110);assert.equal(CA.getPartDestroy('head'),0);assert.equal(CA.isBodyPartDestroyedForParry(aliases[0]),true);
 CA.applyCombatDestroy(aliases[0],7);assert.equal(CA.getPartDestroy(limbs[0]),110);assert.equal(CA.getPartDestroy('head'),2);assert.equal(CA.getPartDestroy(limbs[1]),1);
 CA.recoverPartDestroy(limbs[0],1);assert.equal(CA.getPartDestroy(limbs[0]),109);assert.equal(CA.isBodyPartDestroyedForParry(aliases[0]),false);
 CA.applyCombatDestroy(aliases[1],100);assert.equal(CA.getPartDestroy(limbs[1]),100);assert.equal(CA.isBodyPartDestroyedForParry(aliases[1]),true);
 M.setState({});assert.equal(CA.getBodyPartDestroyMax(limbs[0]),100);assert.equal(CA.getPartDestroy(limbs[0]),109);assert.equal(CA.isBodyPartDestroyedForParry(aliases[0]),true);
 g.Muscles=null;assert.equal(CA.getBodyPartDestroyMax(limbs[0]),100);
});

test(`each ${prefix} muscle grants one hidden sexual ability point, preserves the base across saves and respects the total cap`,async()=>{
 const g=await context(),M=g.Muscles;
 vm.runInContext(read('js/survival.js'),g);const S=g.Survival;
 S.setConfig(JSON.parse(read('data/survival-config.json')));
 S.setState({sexual_ability:7});assert.equal(S.getSexualAbility(),7);
 for(const m of all){
  M.setState({progress:{[m.id]:99.999}});assert.equal(S.getSexualAbility(),7);
  M.addGrowth(m.id,.001);assert.equal(M.getSexualAbilityBonus(),1);assert.equal(S.getState().sexual_ability,8);
  assert.equal(S.getState().sexual_ability_base,7);
  for(let i=0;i<3;i++){S.setState(copy(S.getState()));M.setState(copy(M.getState()));M.addGrowth(m.id,10);assert.equal(S.getSexualAbility(),8);}
 }
 for(const side of ['l','r']){M.setState({unlocked:lit(parts(side))});assert.equal(S.getSexualAbility(),7+count);}
 M.setState({unlocked:lit(all)});assert.equal(S.getSexualAbility(),hiddenTotal);
 // 新档以基础值恢复；总值被改动或已封顶都不能被再次当成基础加点。
 const saved=copy(S.getState());S.setState({...saved,sexual_ability:100});assert.equal(S.getSexualAbility(),hiddenTotal);
 S.setState({satiety:50});assert.equal(S.getSexualAbility(),hiddenTotal);
 S.setState({sexual_ability:90});assert.equal(S.getSexualAbility(),100);
 for(let i=0;i<3;i++){S.setState(copy(S.getState()));assert.equal(S.getSexualAbility(),100);assert.equal(S.getState().sexual_ability_base,90);}
 M.setState({});assert.equal(S.getSexualAbility(),90);
 // 旧档从原有基础值迁入，先还原生存、后还原肌肉的正式顺序同样生效。
 S.setState({sexual_ability:7});M.setState({unlocked:lit(all)});assert.equal(S.getSexualAbility(),hiddenTotal);
 M.setState({unlocked:lit(data.muscles.filter(m=>!/^thigh_|^upperarm_|^abdomen$/.test(m.group)))});assert.equal(S.getSexualAbility(),7);
 M.setState({unlocked:{unknown:true,[all[0].id]:false},progress:{[all[1].id]:99.999}});assert.equal(S.getSexualAbility(),7);
 M.setState({unlocked:lit(all)});
 const visible=JSON.stringify([M.getStatBonus(),...[prefix+'_l',prefix+'_r'].map(id=>[M.getMuscleEntriesByGroup(id),M.getGroupCompletionEffects(id)]),...all.map(m=>M.getEffectsText(m.id))]);
 assert.doesNotMatch(visible,/sexual|性能力|性功能|隐藏/);
 g.Muscles=null;assert.equal(S.getSexualAbility(),7);
 const fallback=vm.createContext({});fallback.window=fallback;vm.runInContext(read('js/muscles.js'),fallback);
 fallback.Muscles.setState({unlocked:{thigh_l_quadriceps:true,thigh_r_quadriceps:true}});assert.equal(fallback.Muscles.getSexualAbilityBonus(),0);
});

test(`${prefix} real parry phases apply global growth to all guard limbs and weapons, preserve gates/unload/enemies, and respect the configured total cap`,async()=>{
 const g=await context(),M=g.Muscles;
 for(const file of ['character-attributes','combat-skills','combat-parry','combat-pipeline'])vm.runInContext(read('js/'+file+'.js'),g);
 const CA=g.CharacterAttributes,CS=g.CombatSkills,P=g.CombatPipeline;
 CA.setState({innate:{flexibility:20}});CA.recalcCharacterStats();
 const skill={id:'test_footwork',category:'footwork',parry_success_at_level_1:.2,parry_success_at_max:.2,parry_reduce_at_level_1:.1,parry_reduce_at_max:.1};
 CS.setConfig({skills:{test_footwork:skill}});
 let hub='test_footwork',stunned=false,delta=0,fw=0,guard=null,guardChance=0;
 g.InventoryEquipment={getCombatState:()=>({hubs:{footwork:hub}}),getSkillsState:()=>({test_footwork:{level:1}}),isPlayerStunned:()=>stunned,getFootworkParryBonus:()=>({chance:fw,reduce:0})};
 g.BuffSystem={getParryChanceDeltaPercent:()=>delta};
 g.ModularWeaponCombat={selectGuard:()=>guard,guardBonus:()=>({chance:guardChance,unload:0}),unloadBonus:()=>0,finish:()=>{},targetDefense:()=>({chance:0,unload:0})};
 P.setConfig({pipelines:{player:{phases:[{handler:'builtin.parry_player_combat_parry'}]},enemy:{phases:[{handler:'builtin.parry_enemy_simple'}]}}});
 const run=(hitPart='left_arm',extra={})=>P.runPipeline('player',{attacker:{kind:'enemy',enemyId:'test'},defender:{kind:'player',isBodyPartDestroyed:()=>false},hitRollSuccess:true,hitPart,rawDamage:100,...extra});
 g.Math.random=()=>.2205;
 assert.equal(run().parrySucceeded,false);
 M.setState({unlocked:lit([all[0]])});near(CA.getParryChance(.2),.221);assert.equal(run().parrySucceeded,true);
 if(prefix==='upperarm'){
  M.setState({unlocked:lit(data.muscles.filter(m=>/^thigh_|^upperarm_/.test(m.group)))});
  near(M.getParryChanceBonus(),.038);near(run().parryChance,.258);near(CA.getParryChance(.2),.258);
  assert.equal(M.getSexualAbilityBonus(),38);
  for(const limb of ['lhand','rhand','lfoot','rfoot'])assert.equal(CA.getBodyPartDestroyMax(limb),110);
 }
 M.setState({unlocked:lit(all)});
 for(const part of ['head','chest','abdomen','left_arm','right_arm','left_leg','right_leg']){
  const r=run(part);near(r.parryChance,.22+bonus);near(r.unloadRatio,.11);
 }
 delta=-5;near(run().parryChance,.17+bonus);delta=10;fw=.05;near(run().parryChance,.37+bonus);
 guard={position:{slot:'weapon_left',blockCoefficient:1,deflectionCoefficient:1}};guardChance=.1;
 const weapon=run();assert.equal(weapon.guardLimb,'weapon_left');near(weapon.parryChance,.47+bonus);near(weapon.unloadRatio,.11);
 delta=0;fw=0;guardChance=0;guard=null;
 skill.parry_success_at_level_1=.7;skill.parry_success_at_max=.7;
 near(run().parryChance,.75);near(CA.getParryChance(.7),.75);
 delta=30;fw=.3;guardChance=.3;guard={position:{slot:'weapon_left',blockCoefficient:1,deflectionCoefficient:1}};
 near(run().parryChance,.75);
 CA.setConfig({parry_chance_cap:.6});near(run().parryChance,.6);near(CA.getParryChance(.7),.6);
 CA.setConfig({parry_chance_cap:.75});delta=0;fw=0;guardChance=0;guard=null;
 skill.parry_success_at_level_1=.2;skill.parry_success_at_max=.2;
 for(const dry of [false,true]){
  const r=run('chest',{simultaneousDryRun:dry,segments:[{hitRollSuccess:true,hitPart:'left_arm',rawDamage:100},{hitRollSuccess:true,hitPart:'right_leg',rawDamage:100}]});
  assert.equal(r.segmentsResults.length,2);for(const s of r.segmentsResults)near(s.parryChance,.22+bonus);
 }
 hub=null;assert.equal(run().skipReason,'empty_footwork_slot');hub='test_footwork';
 stunned=true;assert.equal(run().skipReason,'stunned');stunned=false;
 assert.equal(run('left_leg',{defender:{kind:'player',isBodyPartDestroyed:()=>true}}).skipReason,'struck_limb_destroyed');
 g.SceneCtx={playerExchangeAttackLimb:'lhand'};
 assert.equal(run('chest',{defender:{kind:'player',isBodyPartDestroyed:part=>part!=='left_arm'}}).skipReason,'no_parry_candidate');
 g.SceneCtx=null;
 const enemy=P.runPipeline('enemy',{attacker:{kind:'player'},defender:{kind:'enemy',enemyId:'test',parry_rate:.2,parry_damage_reduce:.1},hitRollSuccess:true,hitPart:'chest',rawDamage:100});
 assert.equal(enemy.parrySucceeded,false);near(enemy.damageAfterParry,90);
});

for(const full of [false,true])test(`${prefix} ${full?'Svelte':'classic'}: final training save rollback, old saves, and both group/detail reward displays`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  d.getElementById('creation-name').value=names[0]+'成长';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,G=g.GymSystem,S=g.Survival,SS=g.SaveSystem,IE=g.InventoryEquipment,CA=g.CharacterAttributes;
  IE.getState().skills.special_meridian_studies={level:1};
  IE.getState().skills.combat_basic_unarmed={level:50};CA.recalcCharacterStats();
  const baseStrength=CA.getState().acquired.jingu;assert.ok(baseStrength>0);
  const target=all[0].id,a=g.GymData.ACTIONS.find(a=>a.main.includes(target));assert.ok(a);
  const initial=copy(G.getState());initial.levels[a.station]=1;initial.levels[G.moduleKey(a)]=1;G.restore(initial,true);assert.equal(G.level(a),1);
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);
  let found=false;for(let y=0;y<10&&!found;y++)for(let x=0;x<9&&!found;x++)if(g.GameEngine.isWalkable(x,y)){g.GameEngine.setState('M0_Base_Inside_lv_1',x,y);found=G.at(a.station);}
  assert.ok(found);
  M.setState({unlocked:lit(all.filter(m=>m.id!==target)),progress:{[target]:99.999}});CA.recalcCharacterStats();
  const strength=CA.getState().acquired.jingu,parry=CA.getParryChance(.2);
  near(strength,baseStrength);assert.equal(CA.getBodyPartDestroyMax(limbs[0]),100);assert.equal(CA.getBodyPartDestroyMax(limbs[1]),110);
  S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20,isDead:false,isComa:false,sexual_ability_base:7});
  assert.equal(S.getSexualAbility(),hiddenPartial);
  let serial=97000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
  g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++serial,fn),serial):oldSet(fn,ms,...args);
  g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
  const step=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  assert.equal(startTraining(g,a.id).ok,true);step();const before=copy(M.getState()),save=SS.saveNow;
  SS.saveNow=()=>false;step();SS.saveNow=save;assert.deepEqual(copy(M.getState()),before);near(M.getParryChanceBonus(),partialBonus);near(CA.getParryChance(.2),parry);
  near(CA.getState().acquired.jingu,strength);assert.equal(M.getStatBonus().acquiredPercent.jingu,0);assert.equal(CA.getBodyPartDestroyMax(limbs[0]),100);assert.equal(CA.getBodyPartDestroyMax(limbs[1]),110);
  assert.equal(S.getSexualAbility(),hiddenPartial);assert.equal(S.getState().sexual_ability_base,7);
  G.retry();step();near(M.getParryChanceBonus(),bonus);near(CA.getParryChance(.2),parry+.001);near(CA.getState().acquired.jingu,baseStrength);assert.equal(CA.getBodyPartDestroyMax(limbs[0]),110);assert.equal(CA.getBodyPartDestroyMax(limbs[1]),110);
  assert.equal(S.getSexualAbility(),hiddenTotal);
  const saved=copy(SS.buildSnapshotForDebug());
  assert.equal(saved.player.survival.sexual_ability_base,7);assert.equal(saved.player.survival.sexual_ability,hiddenTotal);
  for(let i=0;i<2;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();near(M.getParryChanceBonus(),bonus);near(CA.getState().acquired.jingu,baseStrength);assert.equal(CA.getBodyPartDestroyMax(limbs[0]),110);assert.equal(CA.getBodyPartDestroyMax(limbs[1]),110);assert.equal(S.getSexualAbility(),hiddenTotal);}
  const old=copy(saved);old.muscles={unlocked:lit(all),equipped:{}};
  delete old.player.survival.sexual_ability_base;old.player.survival.sexual_ability=7;
  assert.equal(SS.applySnapshotForDebug(old),true);await h.drain();near(M.getParryChanceBonus(),bonus);
  assert.equal(S.getSexualAbility(),hiddenTotal);
  near(CA.getState().acquired.jingu,baseStrength);assert.equal(CA.getBodyPartDestroyMax(limbs[0]),110);assert.equal(CA.getBodyPartDestroyMax(limbs[1]),110);
  g.GymPanel.close();await openMuscleRewards(h);
  const summary=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');assert.ok(summary.includes('全局招架率+'+totalPercent+'%'),summary);
  for(const label of names.map(name=>name+'损毁上限+10%'))assert.ok(summary.includes(label),summary);
  assert.equal(summary.includes('后天筋骨'),false);
  for(const [limb,id,name]of [[limbs[0],prefix+'_l',names[0]],[limbs[1],prefix+'_r',names[1]]]){
   const groupView=await readMuscleGroup(h,id);
   const details=groupView.text;assert.ok(details.includes('全局招架率+0.1%'),details);
   const reward=completionText(g,groupView.id);assert.ok(reward.includes(name+'损毁上限+10%'),reward);assert.ok(reward.includes('已解锁'),reward);assert.equal(details.includes('后天筋骨'),false);
   assert.doesNotMatch(d.body.textContent,/sexual_ability|性能力|性功能/);

  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

}
