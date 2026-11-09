import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v)),read=p=>fs.readFileSync(p,'utf8'),json=p=>JSON.parse(read(p));
const data=json('data/muscles.json'),head=data.muscles.filter(m=>m.group==='head');
const mouth=head.filter(m=>m.effects.some(e=>e.type==='foodExpPercent')),abdomen=data.muscles.filter(m=>m.group==='abdomen');
const config=json('data/survival-config.json'),foods=json('data/food-balance.json').foods,items=json('data/items.json');
const lit=list=>Object.fromEntries(list.map(m=>[m.id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function load(g,names){for(const name of names)vm.runInContext(read('js/'+name+'.js'),g);}
async function context(){const g=vm.createContext({console,fetch:async p=>({ok:true,json:async()=>json(p)})});g.window=g;load(g,['muscles']);await g.Muscles.ready;return g;}

test('mouth rewards cover the 41 food-growth muscles plus 18 perioral muscles, adding 1% only when each is lit',async()=>{
 const g=await context(),M=g.Muscles;
 const perioral=['levator_labii_alaque_nasi','levator_labii_superioris','zygomaticus_minor','zygomaticus_major','levator_anguli_oris','risorius','depressor_anguli_oris','depressor_labii_inferioris','mentalis'].flatMap(n=>['head_'+n+'_L','head_'+n+'_R']);
 const food=M.getFoodGrowthRewards();assert.equal(food.length,41);assert.ok(food.every(r=>r.pct===.001));
 assert.deepEqual(mouth.map(m=>m.id).sort(),[...food.map(r=>r.id),...perioral].sort());assert.equal(mouth.length,59);
 for(const m of mouth){
  assert.deepEqual(m.effects,[{type:'foodExpPercent',delta:1}]);
  M.setState({progress:{[m.id]:99.999}});assert.equal(M.getFoodExperienceMultiplier(),1);M.addGrowth(m.id,.001);
  near(M.getFoodExperienceMultiplier(),1.01);assert.equal(M.getEffectsText(m.id),'食物经验奖励+1%');assert.equal(M.getStatBonus().acquired.flexibility,0);
  M.setState({unlocked:lit(mouth.filter(x=>x.id!==m.id))});near(M.getFoodExperienceMultiplier(),1.58);
 }
 const other=head.filter(m=>!mouth.includes(m));assert.equal(other.length,38);
 for(const m of other)assert.ok(m.effects.every(e=>e.type!=='foodExpPercent'));
 M.setState({unlocked:lit(mouth)});near(M.getFoodExperienceMultiplier(),1.59);assert.equal(M.isGroupComplete('head'),false);assert.equal(M.getFoodBuffDurationBonus(),0);
 for(const n of Object.values(M.getStatBonus().innate))assert.equal(n,0);
 for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(mouth[0].id,1);near(M.getFoodExperienceMultiplier(),1.59);}
 M.setState({unlocked:lit([...mouth,...abdomen])});near(M.getFoodExperienceMultiplier(),1.99);
 M.setState({unlocked:lit(other)});assert.equal(M.getFoodExperienceMultiplier(),1);
});

test('all food XP and fractional budgets combine mouth/abdomen additively, multiply nutrition, and preserve non-XP effects',async()=>{
 const g=await context(),M=g.Muscles;load(g,['food-metabolism','game-time','survival','item-use']);
 const F=g.FoodMetabolism,S=g.Survival,U=g.ItemUse,cfg={...config.food_model,exp_mult:config.nutrition_tier_exp_mult};
 for(const abdominal of [false,true]){
  M.setState({unlocked:lit(abdominal?[...mouth,...abdomen]:mouth)});const expected=abdominal?1.99:1.59;
  for(const nutrition of [0,20,50,80])for(const [id,f] of Object.entries(foods)){
   const s=F.fresh(),body={satiety:60,nutrition,weight_kg:69.7,height_cm:178},totals={};F.eat(s,id,f);const base=F.restore(s);
   for(let t=0;t<f.digestion_ticks;t++){
    const r=F.tick(s,body,cfg,{foodExpMultiplier:M.getFoodExperienceMultiplier()}),control=F.tick(base,body,cfg);
    for(const key of ['satiety','nutrition','weight_kg','intake','expenditure','surplus'])near(r[key],control[key]);
    for(const x of r.grants)totals[x.attr_id]=(totals[x.attr_id]||0)+x.exp;
   }
   const tier=nutrition>=71?'peak':nutrition>=31?'abundant':nutrition>=11?'normal':'malnutrition';
   for(const [dim,exp] of Object.entries(f.attribute_exp))near((totals[dim]||0)+(s.expRemainders[dim]||0),exp*cfg.exp_mult[tier]*expected);
  }
 }
 let gained=0;g.CharacterAttributes={grantAttributeExp:(_o,grants)=>{gained+=grants.reduce((n,x)=>n+x.exp,0);return {applied:grants};}};
 S.setConfig(config);S.setState({nutrition:20,satiety:60,food_metabolism:null});M.setState({});
 U.applyItemUseEffectFromTemplate('food_stew_meat_simple',items.food_stew_meat_simple);
 const xp=()=>gained+Object.values(S.getState().food_metabolism.expRemainders).reduce((n,x)=>n+x,0);
 S.advanceTick();near(xp(),36/45);M.setState({unlocked:lit(mouth)});S.setState({nutrition:20});S.advanceTick();near(xp(),36/45*(1+1.59));
 const old=xp(),snapshot=copy(S.getState());S.setState(snapshot);M.setState(copy(M.getState()));S.setState({nutrition:20});S.advanceTick();near(xp()-old,36/45*1.59);
 const before=gained;U.grantFoodAttributeExp('legacy',{meal_tier:'refined',attr_exp_grants:['jingu']});assert.equal(gained-before,Math.round(120*1.59));
});

for(const full of [false,true])test(`mouth ${full?'Svelte':'classic'}: food completion rollback, old saves, unchanged growth and mixed head reward UI`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();d.getElementById('creation-name').value='嘴部成长';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,S=g.Survival,SS=g.SaveSystem,IE=g.InventoryEquipment,CA=g.CharacterAttributes;
  IE.getState().skills.special_meridian_studies={level:1};
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,12);const target='head_masseter_L';
  CA.recalcCharacterStats();const baseline=CA.getState().acquired.flexibility,innate=copy(CA.getState().innate);
  M.setState({unlocked:lit(mouth.filter(m=>m.id!==target)),progress:{[target]:99.999}});CA.recalcCharacterStats();
  const inv=IE.getState();inv.equipment.backpack=g.BackpackSystem.generate('eq_backpack_light_canvas');inv.inventory_backpack=[{item_id:'food_stew_meat_simple',count:2}];IE.setState(inv);
  S.setState({nutrition:20,satiety:60,thirst:100,stamina:100,fatigue:0,food_metabolism:null,isDead:false,isComa:false});
  const snap=()=>JSON.stringify([IE.getState(),M.getState(),S.getState(),CA.getState(),g.GameTime.getState()]);
  const before=snap(),save=SS.saveNow;SS.saveNow=()=>false;assert.equal(g.SceneApp.panelApi.use('backpack',0,{silent:true}),false);SS.saveNow=save;
  assert.equal(snap(),before);near(M.getFoodExperienceMultiplier(),1.58);assert.equal(M.isUnlocked(target),false);
  const xp=()=>CA.getState().attribute_experience.jingu.exp+(S.getState().food_metabolism?.expRemainders.jingu||0),prior=xp();
  assert.equal(g.SceneApp.panelApi.use('backpack',0,{silent:true}),true);assert.equal(M.getProgress(target),100);near(M.getFoodExperienceMultiplier(),1.59);near(xp()-prior,36/45*1.59);assert.equal(IE.getBackpackArray()[0].count,1);
  near(CA.getState().acquired.flexibility,baseline);assert.deepEqual(copy(CA.getState().innate),innate);assert.equal(M.isGroupComplete('head'),false);
  const saved=copy(SS.buildSnapshotForDebug());for(let i=0;i<2;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();near(M.getFoodExperienceMultiplier(),1.59);near(CA.getState().acquired.flexibility,baseline);}
  saved.muscles={unlocked:lit(mouth),equipped:{}};assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();near(M.getFoodExperienceMultiplier(),1.59);near(CA.getState().acquired.flexibility,baseline);
  M.setState({unlocked:lit(abdomen)});S.setState({satiety:60});assert.equal(g.SceneApp.panelApi.use('backpack',0,{silent:true}),true);
  const targets=M.getFoodGrowthRewards();assert.ok(targets.every(r=>M.getProgress(r.id)===.001));assert.equal(M.getProgress('head_mentalis_L'),0);
  M.setState({unlocked:lit([...mouth,...abdomen])});CA.recalcCharacterStats();
  await openMuscleRewards(h);
  assert.ok(d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'').includes('食物经验奖励+99%'));
  const groupView=await readMuscleGroup(h,'head');
  const checked=new Set();

   for(const el of groupView.nodes){const id=el.id,m=head.find(m=>m.id===id);if(!m)continue;checked.add(id);assert.equal(el.text.includes('食物经验奖励+1%'),mouth.includes(m));}

  assert.equal(checked.size,97);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
