import {openMuscleRewards,readMuscleGroup,completionText} from './lib/muscle-atlas-test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './ui-game-fixture.mjs';

const copy=v=>JSON.parse(JSON.stringify(v)),read=p=>fs.readFileSync(p,'utf8'),json=p=>JSON.parse(read(p));
const data=json('data/muscles.json'),config=json('data/survival-config.json');
const ids=names=>names.flatMap(n=>['head_'+n+'_L','head_'+n+'_R']);
const focusIds=ids(['orbicularis_oculi','levator_palpebrae_superioris','superior_rectus','inferior_rectus','medial_rectus','lateral_rectus','superior_oblique','inferior_oblique','auricularis_anterior','auricularis_superior','auricularis_posterior','tensor_tympani','stapedius','corrugator_supercilii','depressor_supercilii','procerus']);
const capIds=ids(['frontalis','occipitalis','nasalis']),browIds=ids(['corrugator_supercilii','depressor_supercilii','procerus']);
const allIds=[...focusIds,...capIds],lit=list=>Object.fromEntries(list.map(id=>[id,true]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function load(g,names){for(const name of names)vm.runInContext(read('js/'+name+'.js'),g);}
async function context(){const g=vm.createContext({console,fetch:async p=>({ok:true,json:async()=>json(p)})});g.window=g;load(g,['muscles']);await g.Muscles.ready;return g;}

test('32 eye/ear/brow muscles grant acquired focus 0.5%; six scalp/nose muscles grant fixed head cap 2, individually on lighting',async()=>{
 const g=await context(),M=g.Muscles;assert.equal(focusIds.length,32);assert.equal(capIds.length,6);
 for(const id of allIds){
  const focus=focusIds.includes(id),m=M.getMuscleById(id);assert.equal(m.group,'head');
  assert.deepEqual(copy(m.effects),focus?[{type:'acquiredAttributePercent',attribute:'focus',delta:.5}]:[{type:'limbDestroyMaxFlat',limb:'head',delta:2}]);
  M.setState({progress:{[id]:99.999}});assert.equal(M.getStatBonus().acquiredPercent.focus,0);assert.equal(M.getDestroyMaxFlatForLimb('head'),0);
  M.addGrowth(id,.001);assert.equal(M.getStatBonus().acquiredPercent.focus,focus?.5:0);assert.equal(M.getDestroyMaxFlatForLimb('head'),focus?0:2);
  assert.equal(M.getEffectsText(id),focus?'后天专注+0.5%':'头部损毁上限+2');assert.equal(M.getStatBonus().acquired.flexibility,0);
  M.setState({unlocked:{...lit(allIds.filter(x=>x!==id)),unknown_head:true}});
  assert.equal(M.getStatBonus().acquiredPercent.focus,focus?15.5:16);assert.equal(M.getDestroyMaxFlatForLimb('head'),focus?12:10);
 }
 M.setState({unlocked:lit(allIds)});
 for(let i=0;i<3;i++){M.setState(copy(M.getState()));M.addGrowth(allIds[0],1);assert.equal(M.getStatBonus().acquiredPercent.focus,16);assert.equal(M.getDestroyMaxFlatForLimb('head'),12);assert.equal(M.getStatBonus().destroyMaxFlat.head,12);}
 assert.equal(M.isGroupComplete('head'),false);for(const v of Object.values(M.getStatBonus().innate))assert.equal(v,0);
 M.setState({unlocked:lit(browIds)});assert.equal(M.getStatBonus().acquiredPercent.focus,3);assert.equal(M.getStatBonus().acquired.flexibility,0);
 assert.deepEqual(data.muscles.filter(m=>m.group==='head'&&m.effects.some(e=>e.type==='flexibility')).map(m=>m.id).sort(),[]);
 M.setState({unlocked:lit(data.muscles.filter(m=>!allIds.includes(m.id)).map(m=>m.id))});assert.equal(M.getStatBonus().acquiredPercent.focus,0);assert.equal(M.getDestroyMaxFlatForLimb('head'),0);
 M.setState({unlocked:{unknown_head:true}});assert.equal(M.getDestroyMaxFlatForLimb('head'),0);
 const fallback=vm.createContext({});fallback.window=fallback;load(fallback,['muscles']);assert.equal(fallback.Muscles.getDestroyMaxFlatForLimb('head'),0);
});

test('focus percentage adds within muscles and independently scales current acquired focus, not innate or other attributes',async()=>{
 const g=await context(),M=g.Muscles;load(g,['character-attributes']);const CA=g.CharacterAttributes;
 CA.setState({innate:{focus:20}});CA.setExternalAcquiredBonus({focus:101,flexibility:50});
 const recalc=()=>{CA.recalcCharacterStats();return CA.getState().acquired;};
 M.setState({unlocked:lit(focusIds)});near(recalc().focus,117.16);near(recalc().flexibility,50);assert.equal(CA.getInnateAttr('focus'),20);
 CA.setExternalAcquiredMultiplier({focus:.9});near(recalc().focus,90*1.16);
 g.CombatBreath={mounted:()=>({acquired_total_attribute_pct:.1})};M.setState({});const other=recalc().focus;
 M.setState({unlocked:lit(focusIds)});near(recalc().focus,other*1.16);
 g.CombatBreath=null;CA.setExternalAcquiredMultiplier({});
 for(const base of [0,1,20.25,200]){CA.setExternalAcquiredBonus({focus:base});for(let i=0;i<3;i++)near(recalc().focus,base*1.16);}
 M.setState({unlocked:lit([focusIds[0]])});near(recalc().focus,201);
 M.setState({});near(recalc().focus,200);assert.equal(CA.getInnateAttr('focus'),20);
});

test('fixed head cap follows configured base, actual injury, pain, death and recovery; neck reduction remains separate and enemies unchanged',async()=>{
 const g=await context(),M=g.Muscles;load(g,['character-attributes','survival','combat-damage','combat-pipeline','combat-enemies']);
 const CA=g.CharacterAttributes,S=g.Survival,P=g.CombatPipeline,CE=g.CombatEnemies;CA.setConfig(config);S.setConfig(config);
 M.setState({unlocked:lit(capIds)});assert.equal(CA.getBodyPartDestroyMax('head'),62);
 CA.setConfig({...config,body_part_destroy_max:{head:101}});assert.equal(CA.getBodyPartDestroyMax('head'),113);CA.setConfig(config);
 for(const [part,max] of Object.entries({chest:100,abdomen:80,belly:80,left_arm:100,rhand:100,left_leg:100,rfoot:100}))assert.equal(CA.getBodyPartDestroyMax(part),max);
 CA.setState({part_destroy:{head:40}});M.setState({});assert.equal(CA.getPartDestroy('head'),40);M.setState({unlocked:lit(capIds)});assert.equal(CA.getPartDestroy('head'),40);
 const pains=[],addPain=S.addPainFromDestroy;S.addPainFromDestroy=x=>{pains.push(x);addPain(x);};
 CA.applyCombatDestroy('head',21);assert.equal(CA.getPartDestroy('head'),61);assert.equal(S.isDead(),false);assert.equal(pains[0].partMax,62);
 CA.recoverPartDestroy('head',11);assert.equal(CA.getPartDestroy('head'),50);
 // In production the neck's last-stage reduction and the increased head capacity both apply.
 M.setState({unlocked:lit([...capIds,...data.muscles.filter(m=>m.group==='neck').map(m=>m.id)])});
 P.setConfig({pipelines:{damage:{phases:[{handler:'builtin.damage_stub'}]}}});
 const hit=n=>P.runPipeline('damage',{rawDamage:n,hitPart:'head',hitRollSuccess:true,attacker:{kind:'enemy'},defender:{kind:'player'}});
 assert.equal(hit(10).finalDamage,8);assert.equal(CA.getPartDestroy('head'),58);assert.equal(S.isDead(),false);
 assert.equal(hit(10).finalDamage,8);assert.equal(CA.getPartDestroy('head'),62);assert.equal(S.isDead(),true);assert.equal(pains.at(-1).actualIncrement,4);
 CE.setTable({enemies:{test:{can_attack:false}}});assert.equal(CE.getDungeonState('test',0,'test').maxes.head,50);
 CE.onEnemyDamageResolved({defender:{kind:'enemy',enemyId:'test',mapId:'test',index:0},hitPart:'head',hitRollSuccess:true,finalDamage:50});assert.equal(CE.getDungeonState('test',0,'test').dead,true);
});

for(const full of [false,true])test(`head ${full?'Svelte':'classic'}: atomic growth rollback, legacy saves, body bar and both reward types`,async()=>{
 const h=await boot(full),g=h.g,d=g.document;
 try{
  g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();d.getElementById('creation-name').value='眼耳头皮';d.getElementById('creation-name').dispatchEvent(new g.Event('input',{bubbles:true}));
  await h.drain();d.getElementById('btn-confirm-creation').click();await h.drain();g.DialogueUI.close();
  const M=g.Muscles,CA=g.CharacterAttributes,SS=g.SaveSystem,IE=g.InventoryEquipment;
  IE.getState().skills.special_meridian_studies={level:1};CA.recalcCharacterStats();const flex=CA.getState().acquired.flexibility,innate=copy(CA.getState().innate);
  const almost={unlocked:lit(allIds.filter(id=>id!==browIds[0]&&id!==capIds[0])),progress:{[browIds[0]]:99.999,[capIds[0]]:99.999}};
  M.setState(almost);CA.recalcCharacterStats();const before=copy(M.getState()),save=SS.saveNow;
  const grow=()=>SS.runAtomicFor('inventory.transfer',()=>{M.addGrowth(browIds[0],.001);M.addGrowth(capIds[0],.001);CA.recalcCharacterStats();});
  SS.saveNow=()=>false;assert.equal(grow().saved,false);SS.saveNow=save;
  assert.deepEqual(copy(M.getState()),before);assert.equal(M.getStatBonus().acquiredPercent.focus,15.5);assert.equal(CA.getBodyPartDestroyMax('head'),60);
  assert.equal(grow().saved,true);assert.equal(M.getStatBonus().acquiredPercent.focus,16);assert.equal(CA.getBodyPartDestroyMax('head'),62);
  const saved=copy(SS.buildSnapshotForDebug());saved.muscles={unlocked:lit(allIds),equipped:{}};
  for(let i=0;i<3;i++){assert.equal(SS.applySnapshotForDebug(saved),true);await h.drain();assert.equal(M.getStatBonus().acquiredPercent.focus,16);assert.equal(CA.getBodyPartDestroyMax('head'),62);near(CA.getState().acquired.flexibility,flex);assert.deepEqual(copy(CA.getState().innate),innate);}
  CA.setState({part_destroy:{head:31}});g.SceneCtx.setSurvivalMetricVisibilityRule('body_detail',true);g.SceneHud.refresh('status');await h.drain();
  assert.equal(d.getElementById('limb-head').textContent.replace(/\s+/g,''),'31/62');near(parseFloat(d.getElementById('limb-head').closest('.body-reading').querySelector('.body-damage-track i').style.width),50);
  await openMuscleRewards(h);
  const summary=d.querySelector('.ma-rewards-overview').textContent.replace(/\s+/g,'');assert.ok(summary.includes('后天专注+16%'));assert.ok(summary.includes('头部损毁上限+12'));assert.equal(summary.includes('头部损毁上限+12%'),false);
  const groupView=await readMuscleGroup(h,'head');
  const checked=new Set();

   for(const el of groupView.nodes){const id=el.id;if(!allIds.includes(id))continue;checked.add(id);assert.ok(el.text.includes(focusIds.includes(id)?'后天专注+0.5%':'头部损毁上限+2'));assert.equal(el.text.includes('后天柔韧'),false);}

  assert.equal(checked.size,38);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
