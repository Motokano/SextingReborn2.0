import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v)),read=p=>fs.readFileSync(p,'utf8');
const data=JSON.parse(read('data/muscles.json'));
const back=data.muscles.filter(m=>m.group==='back');
const attrs=['jingu','flexibility','breath','dexterity'];
const labels={jingu:'筋骨',flexibility:'柔韧',breath:'呼吸',dexterity:'身手'};
const lit=list=>Object.fromEntries(list.map(m=>[m.id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function context(){
 const g=vm.createContext({fetch:async()=>({ok:true,json:async()=>copy(data)})});g.window=g;
 vm.runInContext(read('js/muscles.js'),g);await g.Muscles.ready;return g;
}

test('64 back muscles give one 0.5% acquired reward each, exactly 16 per attribute with symmetric pairs',async()=>{
 const g=await context(),M=g.Muscles;
 assert.equal(back.length,64);
 for(const attr of attrs)assert.equal(back.filter(m=>m.effects[0].attribute===attr).length,16);
 for(const m of back){
  const attr=m.effects[0].attribute;assert.ok(attrs.includes(attr));
  assert.deepEqual(m.effects,[{type:'acquiredAttributePercent',attribute:attr,delta:.5}]);
  const other=back.find(x=>x.id===m.id.replace(/_[LR]$/,m.id.endsWith('_L')?'_R':'_L'));
  assert.deepEqual(other.effects,m.effects);
  M.setState({progress:{[m.id]:99.999}});
  for(const a of attrs)assert.equal(M.getStatBonus().acquiredPercent[a],0);
  M.addGrowth(m.id,.001);
  for(const a of attrs)assert.equal(M.getStatBonus().acquiredPercent[a],a===attr?.5:0);
  assert.equal(M.getEffectsText(m.id),`后天${labels[attr]}+0.5%`);
  for(const n of Object.values(M.getStatBonus().acquired))assert.equal(n,0);
  assert.equal(M.getSexualAbilityBonus(),0);
  for(let i=0;i<2;i++){M.setState(copy(M.getState()));M.addGrowth(m.id,10);assert.equal(M.getStatBonus().acquiredPercent[attr],.5);}
  M.setState({unlocked:{...lit(back.filter(x=>x.id!==m.id)),unknown_back:true},progress:{[m.id]:99.999}});
  assert.equal(M.isGroupComplete('back'),false);
  for(const a of attrs)assert.equal(M.getStatBonus().acquiredPercent[a],a===attr?7.5:8);
  M.addGrowth(m.id,.001);assert.equal(M.isGroupComplete('back'),true);
  for(const a of attrs)assert.equal(M.getStatBonus().acquiredPercent[a],18);
 }
 assert.deepEqual(copy(M.getGroupCompletionEffects('back')),attrs.map(attribute=>({type:'acquiredAttributePercent',attribute,delta:10})));
 for(let i=0;i<3;i++){
  M.setState(copy(M.getState()));M.addGrowth(back[0].id,10);
  for(const a of attrs)assert.equal(M.getStatBonus().acquiredPercent[a],18);
 }
 for(const n of Object.values(M.getStatBonus().innate))assert.equal(n,0);
 M.setState({unlocked:{unknown_back:true}});
 for(const a of attrs)assert.equal(M.getStatBonus().acquiredPercent[a],0);
});

test('back percentages replace flat strength and add to other muscles before multiplying live acquired attributes',async()=>{
 const g=await context(),M=g.Muscles;vm.runInContext(read('js/character-attributes.js'),g);const CA=g.CharacterAttributes;
 CA.setState({innate:{jingu:20,flexibility:20,breath:20,dexterity:20,focus:20}});
 const base={jingu:100,flexibility:50,breath:80,dexterity:40,focus:70};
 const recalc=()=>{CA.recalcCharacterStats();return CA.getState().acquired;};
 CA.setExternalAcquiredBonus(base);M.setState({unlocked:lit(back)});
 for(let i=0;i<3;i++)for(const a of attrs)near(recalc()[a],base[a]*1.18);
 near(recalc().focus,70);for(const a of [...attrs,'focus'])assert.equal(CA.getInnateAttr(a),20);
 const others=data.muscles.filter(m=>/^(shoulder|hip|calf|forearm)_/.test(m.group)||m.group==='pelvis');
 M.setState({unlocked:lit([...back,...others])});
 const percents={jingu:28,flexibility:30,breath:35,dexterity:55};
 for(const a of attrs){assert.equal(M.getStatBonus().acquiredPercent[a],percents[a]);near(recalc()[a],base[a]*(1+percents[a]/100));}
 CA.setExternalAcquiredMultiplier(Object.fromEntries(attrs.map(a=>[a,.9])));
 for(const a of attrs)near(recalc()[a],base[a]*.9*(1+percents[a]/100));
 const unlitWithOthers={unlocked:lit(others)};M.setState(unlitWithOthers);const beforeBreath=copy(recalc());
 g.CombatBreath={mounted:()=>({acquired_total_attribute_pct:.1})};const otherSources=copy(recalc());
 assert.ok(otherSources.jingu>beforeBreath.jingu);
 M.setState({unlocked:lit([...back,...others])});
 for(const a of attrs)near(recalc()[a],otherSources[a]/(1+(percents[a]-18)/100)*(1+percents[a]/100));
 g.CombatBreath=null;M.setState({unlocked:lit(back)});CA.setExternalAcquiredMultiplier({});
 for(const n of [1,200,0]){CA.setExternalAcquiredBonus(Object.fromEntries(attrs.map(a=>[a,n])));for(const a of attrs)near(recalc()[a],n*1.18);}
 M.setState({});CA.setExternalAcquiredBonus(base);for(const a of attrs)near(recalc()[a],base[a]);
});

for(const full of [false,true])test(`back ${full?'Svelte':'classic'}: training rollback, old saves and four percentage displays`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
  d.getElementById('creation-name').value='背部成长';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,G=g.GymSystem,S=g.Survival,SS=g.SaveSystem,IE=g.InventoryEquipment,CA=g.CharacterAttributes;
  IE.getState().skills.special_meridian_studies={level:1};IE.getState().skills.combat_basic_unarmed={level:50};IE.getState().skills.combat_basic_breath={level:100};
  S.setState({nutrition:20});CA.recalcCharacterStats();
  const baseline=copy(CA.getState().acquired),innate=copy(CA.getState().innate);for(const a of attrs)assert.ok(baseline[a]>0,a);
  const target='back_trapezius_L',action=g.GymData.ACTIONS.find(a=>a.main.includes(target));assert.ok(action);
  const initial=copy(G.getState());initial.levels[action.station]=1;initial.levels[G.moduleKey(action)]=1;G.restore(initial,true);
  g.GameEngine.setState('M0_Base_Inside_lv_1',5,5);let found=false;
  for(let y=0;y<10&&!found;y++)for(let x=0;x<9&&!found;x++)if(g.GameEngine.isWalkable(x,y)){g.GameEngine.setState('M0_Base_Inside_lv_1',x,y);found=G.at(action.station);}assert.ok(found);
  M.setState({unlocked:lit(back.filter(m=>m.id!==target)),progress:{[target]:99.999}});CA.recalcCharacterStats();
  const check=complete=>{for(const a of attrs)near(CA.getState().acquired[a],baseline[a]*(complete?1.18:a==='jingu'?1.075:1.08));assert.deepEqual(copy(CA.getState().innate),innate);};check(false);
  S.setState({stamina:100,fatigue:0,satiety:100,thirst:100,nutrition:20,isDead:false,isComa:false});
  let serial=104000;const timers=new Map(),oldSet=g.setTimeout,oldClear=g.clearTimeout;
  g.setTimeout=(fn,ms,...args)=>ms===3000?(timers.set(++serial,fn),serial):oldSet(fn,ms,...args);g.clearTimeout=id=>{if(!timers.delete(id))oldClear(id);};
  const step=()=>{assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  assert.equal(G.startTraining(action.id).ok,true);step();const before=copy(M.getState()),save=SS.saveNow;
  SS.saveNow=()=>false;step();SS.saveNow=save;assert.deepEqual(copy(M.getState()),before);check(false);
  G.retry();step();check(true);assert.equal(M.isGroupComplete('back'),true);
  const saved=copy(SS.buildSnapshotForDebug());for(let i=0;i<2;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();check(true);}
  const old=copy(saved);old.muscles={unlocked:lit(back),equipped:{}};
  assert.equal(SS.applySnapshotForDebug(old),true);await h.drain();check(true);
  g.GymPanel.close();await openMuscleRewards(h);
  const summary=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');
  for(const a of attrs)assert.ok(summary.includes(`后天${labels[a]}+18%`),summary);
  const groupView=await readMuscleGroup(h,'back');
  const reward=completionText(g,groupView.id);
  for(const a of attrs)assert.ok(reward.includes(`后天${labels[a]}+10%`),reward);
  assert.ok(reward.includes('已解锁'),reward);
  const details=groupView.text;
  for(const a of attrs)assert.ok(details.includes(`后天${labels[a]}+0.5%`),details);
  assert.equal(M.getStatBonus().acquired.jingu,0);assert.equal(M.getSexualAbilityBonus(),0);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
