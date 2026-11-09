import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v)),read=p=>fs.readFileSync(p,'utf8'),json=p=>JSON.parse(read(p));
const data=json('data/muscles.json'),abdomen=data.muscles.filter(m=>m.group==='abdomen');
const config=json('data/survival-config.json'),foods=json('data/food-balance.json').foods,items=json('data/items.json');
const lit=list=>Object.fromEntries(list.map(m=>[m.id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function load(g,names){for(const name of names)vm.runInContext(read('js/'+name+'.js'),g);}
async function context(){
 const g=vm.createContext({console,fetch:async p=>({ok:true,json:async()=>json(p)})});g.window=g;
 load(g,['muscles']);await g.Muscles.ready;return g;
}

test('all ten abdominal entries grant additive food XP and hidden +2; both completion rewards require every entry',async()=>{
 const g=await context(),M=g.Muscles;load(g,['survival']);const S=g.Survival;S.setConfig(config);S.setState({sexual_ability:7});
 assert.equal(abdomen.length,10);
 for(const m of abdomen){
  assert.deepEqual(m.effects,[{type:'foodExpPercent',delta:4}]);
  M.setState({progress:{[m.id]:99.999}});assert.equal(M.getFoodExperienceMultiplier(),1);assert.equal(S.getSexualAbility(),7);
  M.addGrowth(m.id,.001);assert.equal(M.getFoodExperienceMultiplier(),1.04);assert.equal(M.getEffectsText(m.id),'食物经验奖励+4%');assert.equal(S.getSexualAbility(),9);
  assert.equal(M.getStatBonus().acquired.flexibility,0);
  M.setState({unlocked:lit(abdomen.filter(x=>x.id!==m.id)),progress:{[m.id]:99.999}});
  near(M.getFoodExperienceMultiplier(),1.36);assert.equal(M.getFoodBuffDurationBonus(),0);assert.equal(M.getDestroyMaxPercentForLimb('abdomen'),0);assert.equal(S.getSexualAbility(),25);
  M.addGrowth(m.id,.001);
  for(let i=0;i<3;i++){
   M.setState(copy(M.getState()));S.setState(copy(S.getState()));M.addGrowth(m.id,1);
   assert.equal(M.getFoodExperienceMultiplier(),1.4);assert.equal(M.getFoodBuffDurationBonus(),1);assert.equal(M.getStatBonus().destroyMaxPercent.abdomen,10);assert.equal(S.getSexualAbility(),27);
  }
 }
 assert.deepEqual(copy(M.getGroupCompletionEffects('abdomen').map(M.getEffectDisplay)),[{name:'食物Buff时间',value:1,unit:'tick'},{name:'腹部损毁上限',value:10,unit:'%'}]);
 const visible=JSON.stringify([M.getStatBonus(),M.getMuscleEntriesByGroup('abdomen'),M.getGroupCompletionEffects('abdomen')]);assert.doesNotMatch(visible,/sexual|性能力|性功能|隐藏/);
 M.setState({unlocked:lit(data.muscles)});assert.equal(M.getSexualAbilityBonus(),58);assert.equal(S.getSexualAbility(),65);
 S.setState({sexual_ability:90});assert.equal(S.getSexualAbility(),100);S.setState(copy(S.getState()));M.setState({});assert.equal(S.getSexualAbility(),90);
 M.setState({unlocked:lit(data.muscles.filter(m=>m.group!=='abdomen'))});near(M.getFoodExperienceMultiplier(),1.59);assert.equal(M.getFoodBuffDurationBonus(),0);assert.equal(M.getDestroyMaxPercentForLimb('abdomen'),0);
 M.setState({unlocked:{unknown:true}});assert.equal(M.getSexualAbilityBonus(),0);
 const fallback=vm.createContext({});fallback.window=fallback;load(fallback,['muscles']);assert.equal(fallback.Muscles.getFoodExperienceMultiplier(),1);assert.equal(fallback.Muscles.getFoodBuffDurationBonus(),0);
});

test('digestion applies current muscle XP before fractional rounding, stacks with nutrition and never amplifies old remainders or other rewards',async()=>{
 const g=await context(),M=g.Muscles;load(g,['food-metabolism','game-time','survival','item-use']);
 const F=g.FoodMetabolism,S=g.Survival,U=g.ItemUse,cfg={...config.food_model,exp_mult:config.nutrition_tier_exp_mult};
 M.setState({unlocked:lit(abdomen)});
 for(const nutrition of [0,20,50,80])for(const [id,f] of Object.entries(foods)){
  const s=F.fresh(),b={satiety:60,nutrition,weight_kg:69.7,height_cm:178},totals={};F.eat(s,id,f);
  const base=F.restore(s);let intake=0;
  for(let t=0;t<f.digestion_ticks;t++){
   const r=F.tick(s,b,cfg,{foodExpMultiplier:M.getFoodExperienceMultiplier()}),control=F.tick(base,b,cfg);
   for(const key of ['satiety','nutrition','weight_kg','intake','expenditure','surplus'])near(r[key],control[key]);
   for(const x of r.grants)totals[x.attr_id]=(totals[x.attr_id]||0)+x.exp;intake+=r.intake;
  }
  const mult=nutrition>=71?cfg.exp_mult.peak:nutrition>=31?cfg.exp_mult.abundant:nutrition>=11?cfg.exp_mult.normal:cfg.exp_mult.malnutrition;
  for(const [dim,exp] of Object.entries(f.attribute_exp))near((totals[dim]||0)+(s.expRemainders[dim]||0),exp*mult*1.4);
  near(intake,f.satiety_total);assert.equal(s.portions.length,0);assert.deepEqual(copy(s),copy(F.restore(s)));
 }
 S.setConfig(config);S.setState({nutrition:20,satiety:60,stamina:100,fatigue:0,food_metabolism:null});let gained=0;
 g.CharacterAttributes={grantAttributeExp:(_o,grants)=>{gained+=grants.reduce((n,x)=>n+x.exp,0);return {applied:grants};}};
 M.setState({});const id='food_stew_meat_simple';assert.equal(U.applyItemUseEffectFromTemplate(id,items[id]),true);assert.equal(gained,0);
 const xp=()=>gained+Object.values(S.getState().food_metabolism.expRemainders).reduce((n,x)=>n+x,0);
 S.advanceTick();near(xp(),36/45);M.setState({unlocked:lit(abdomen)});S.setState({nutrition:20});S.advanceTick();near(xp(),36/45*(1+1.4));
 const saved=copy(S.getState()),muscles=copy(M.getState()),old=xp();S.setState(saved);M.setState(muscles);S.setState({nutrition:20});S.advanceTick();near(xp()-old,36/45*1.4);
 const head=M.getFoodGrowthRewards()[0].id;assert.equal(M.getProgress(head),0,'changing abdominal state does not award eating growth');
 U.applyItemUseEffectFromTemplate(id,items[id]);assert.equal(M.getProgress(head),.001,'food growth remains fixed at 0.001%');
 const beforeLegacy=gained;U.grantFoodAttributeExp('legacy',{meal_tier:'refined',attr_exp_grants:['jingu']});assert.equal(gained-beforeLegacy,Math.round(120*1.4));
 const afterLegacy=gained;U.grantFoodAttributeExp('legacy',{meal_tier:'refined',workhorse:true});assert.equal(gained,afterLegacy);
});

test('all food special buffs receive one extra tick on application/refresh, with no extension on load, to enemies, digestion or nonfood buffs',async()=>{
 const g=await context(),M=g.Muscles;load(g,['food-metabolism','game-time','survival','buff-system','item-use']);
 const S=g.Survival,B=g.BuffSystem,U=g.ItemUse;S.setConfig(config);B.init();
 for(let n=0;n<30&&!B.getState().loaded;n++)await new Promise(r=>setTimeout(r,1));assert.equal(B.getState().loaded,true);
 const now=()=>g.GameTime.getState().totalTicks,active=(id,owner='player')=>B.getState().instancesByOwner[owner].find(x=>x.buff_id===id);
 for(const [id,f] of Object.entries(foods)){
  M.setState({});B.applyBuff('player',f.edible_buff_id,'item:'+id);assert.equal(active(f.edible_buff_id).expires_at_tick-now(),f.special.duration_ticks);
  M.setState({unlocked:lit(abdomen)});
  for(let i=0;i<3;i++){B.applyBuff('player',f.edible_buff_id,'item:'+id);assert.equal(active(f.edible_buff_id).expires_at_tick-now(),f.special.duration_ticks+1);assert.equal(active(f.edible_buff_id).stacks,1);}
  B.applyBuff('enemy:test',f.edible_buff_id);assert.equal(active(f.edible_buff_id,'enemy:test').expires_at_tick-now(),f.special.duration_ticks);
  const saved=copy(B.getState());B.setState(saved);assert.equal(active(f.edible_buff_id).expires_at_tick-now(),f.special.duration_ticks+1);
  M.setState({});B.setState(saved);assert.equal(active(f.edible_buff_id).expires_at_tick-now(),f.special.duration_ticks+1,'old instances retain their saved expiry');
 }
 M.setState({unlocked:lit(abdomen)});
 for(const [id,extra] of [['plain',{}],['digest',{food_digest:true}],['permanent',{manualLifetime:true,judgment_tags:{food_special:true}}],['medicine',{pharmacy_generated:true,judgment_tags:{food_special:true}}]]){
  B.registerRuntimeBuffTemplate({buff_id:id,durationTicks:10,...extra});B.applyBuff('player',id);assert.equal(active(id).expires_at_tick-now(),10);
 }
 B.setState({instancesByOwner:{}});S.setState({nutrition:20,satiety:60,energy:0,food_metabolism:null});
 const tea='food_herb_tea_bitter',f=foods[tea];assert.equal(U.applyItemUseEffectFromTemplate(tea,items[tea]),true);
 assert.equal(S.getState().food_metabolism.portions[0].remaining,f.digestion_ticks);
 assert.equal(active(f.edible_buff_id).expires_at_tick-now(),f.special.duration_ticks+1);
 for(let n=0;n<f.special.duration_ticks;n++)S.advanceTick();near(S.getState().energy,4.5);
 assert.equal(S.getState().food_metabolism.portions.length,0);S.advanceTick();near(S.getState().energy,4.8);S.advanceTick();near(S.getState().energy,4.8);
});

test('abdominal completion increases only abdominal destruction cap and real vital-death threshold, with hidden points bounded and separate',async()=>{
 const g=await context(),M=g.Muscles;load(g,['character-attributes','survival']);const CA=g.CharacterAttributes,S=g.Survival;
 CA.setConfig(config);S.setConfig(config);CA.setExternalAcquiredBonus({flexibility:100});CA.recalcCharacterStats();assert.equal(CA.getBodyPartDestroyMax('abdomen'),80);
 M.setState({unlocked:lit(abdomen)});CA.recalcCharacterStats();assert.equal(CA.getState().acquired.flexibility,100);
 for(const key of ['abdomen','belly'])assert.equal(CA.getBodyPartDestroyMax(key),88);
 assert.equal(CA.getBodyPartDestroyMax('head'),50);assert.equal(CA.getBodyPartDestroyMax('chest'),100);assert.equal(CA.getBodyPartDestroyMax('left_arm'),100);
 CA.setConfig({...config,body_part_destroy_max:{abdomen:123}});assert.equal(CA.getBodyPartDestroyMax('belly'),135);CA.setConfig(config);
 CA.setState({part_destroy:{abdomen:80}});assert.equal(CA.getPartDestroy('abdomen'),80);CA.applyCombatDestroy('belly',7);assert.equal(CA.getPartDestroy('abdomen'),87);assert.equal(S.isDead(),false);
 CA.applyCombatDestroy('abdomen',2);assert.equal(CA.getPartDestroy('abdomen'),88);assert.equal(S.isDead(),true);
});

for(const full of [false,true])test(`abdomen ${full?'Svelte':'classic'}: training and eating transactions, old saves, public rewards and hidden bonus`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();d.getElementById('creation-name').value='腹部成长';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,G=g.GymSystem,S=g.Survival,SS=g.SaveSystem,IE=g.InventoryEquipment,CA=g.CharacterAttributes,B=g.BuffSystem;
  IE.getState().skills.special_meridian_studies={level:1};const target=abdomen[0].id,a=g.GymData.ACTIONS.find(a=>a.main.includes(target));assert.ok(a);
  const initial=copy(G.getState());initial.levels[a.station]=1;initial.levels[G.moduleKey(a)]=1;G.restore(initial,true);g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);
  let found=false;for(let y=0;y<10&&!found;y++)for(let x=0;x<9&&!found;x++)if(g.GameEngine.isWalkable(x,y)){g.GameEngine.setState('M0_Base_Inside_lv_1',x,y);found=G.at(a.station);}assert.ok(found);
  M.setState({unlocked:lit(abdomen.filter(m=>m.id!==target)),progress:{[target]:99.999}});CA.recalcCharacterStats();
  S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20,sexual_ability:7,isDead:false,isComa:false});
  let serial=102000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
  g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++serial,fn),serial):oldSet(fn,ms,...args);g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
  const step=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  assert.equal(G.startTraining(a.id).ok,true);step();const before=copy(M.getState()),save=SS.saveNow;SS.saveNow=()=>false;step();SS.saveNow=save;
  assert.deepEqual(copy(M.getState()),before);near(M.getFoodExperienceMultiplier(),1.36);assert.equal(M.getFoodBuffDurationBonus(),0);assert.equal(CA.getBodyPartDestroyMax('abdomen'),80);assert.equal(S.getSexualAbility(),25);
  G.retry();step();assert.equal(M.getFoodExperienceMultiplier(),1.4);assert.equal(M.getFoodBuffDurationBonus(),1);assert.equal(CA.getBodyPartDestroyMax('abdomen'),88);assert.equal(S.getSexualAbility(),27);
  const saved=copy(SS.buildSnapshotForDebug());for(let i=0;i<2;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();assert.equal(M.getFoodBuffDurationBonus(),1);assert.equal(S.getSexualAbility(),27);}
  const old=copy(saved);old.muscles={unlocked:lit(abdomen),equipped:{}};delete old.player.survival.sexual_ability_base;old.player.survival.sexual_ability=7;
  assert.equal(SS.applySnapshotForDebug(old),true);await h.drain();assert.equal(S.getSexualAbility(),27);
  g.GymPanel.close();const inv=IE.getState();inv.equipment.backpack=g.BackpackSystem.generate('eq_backpack_light_canvas');inv.inventory_backpack=[{item_id:'food_stew_meat_simple',count:2},{item_id:'food_herb_tea_bitter',count:1}];IE.setState(inv);
  S.setState({nutrition:20,satiety:60,thirst:100,stamina:100,fatigue:0,food_metabolism:null});
  const snapshot=()=>JSON.stringify([IE.getState(),M.getState(),S.getState(),CA.getState(),B.getState(),g.GameTime.getState()]);
  const snap=snapshot();SS.saveNow=()=>false;assert.equal(g.SceneApp.panelApi.use('backpack',0,{silent:true}),false);SS.saveNow=save;assert.equal(snapshot(),snap);
  const totalXP=()=>CA.getState().attribute_experience.jingu.exp+(S.getState().food_metabolism?.expRemainders.jingu||0),xp=totalXP();
  assert.equal(g.SceneApp.panelApi.use('backpack',0,{silent:true}),true);near(totalXP()-xp,36/45*1.4);assert.equal(IE.getBackpackArray()[0].count,1);
  assert.equal(M.getProgress(M.getFoodGrowthRewards()[0].id),.001);
  const foodBuff=B.getState().instancesByOwner.player.find(x=>x.buff_id===items.food_stew_meat_simple.edible_buff_id);assert.equal(foodBuff.expires_at_tick-g.GameTime.getState().totalTicks,foods.food_stew_meat_simple.special.duration_ticks);
  const eaten=copy(SS.buildSnapshotForDebug()),expiry=foodBuff.expires_at_tick;assert.equal(SS.applySnapshotForDebug(eaten),true);await h.drain();assert.equal(B.getState().instancesByOwner.player.find(x=>x.buff_id===foodBuff.buff_id).expires_at_tick,expiry);
  await openMuscleRewards(h);
  const summary=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');for(const label of ['食物经验奖励+40%','食物Buff时间+1tick','腹部损毁上限+10%'])assert.ok(summary.includes(label),summary);
  const groupView=await readMuscleGroup(h,'abdomen');
  const detail=groupView.text;assert.ok(detail.includes('食物经验奖励+4%'));assert.equal(detail.includes('后天柔韧+1'),false);
  const reward=completionText(g,groupView.id);for(const label of ['已解锁','食物Buff时间+1tick','腹部损毁上限+10%'])assert.ok(reward.includes(label),reward);
  assert.doesNotMatch(summary+detail,/性能力|性功能|隐藏|sexual/);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
