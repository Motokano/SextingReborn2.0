import assert from 'node:assert/strict';
import {boot} from './dungeon/fixture.mjs';
import {resolvePreviewMove} from '../js/combat-fx-action-prototype.mjs';

const h=await boot(false),g=h.g,CE=g.CombatEnemies,R=g.CombatMeleeResolve,B=g.BuffSystem;
const plain=v=>JSON.parse(JSON.stringify(v));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
try {
  const id='enemy.street_thug_boss',mapId='attack_ranges_test',t=CE.getById(id);
  const moves=Object.fromEntries(t.actions.map(a=>[a.id,a]));
  for(const [move,[min,max]]of Object.entries({swing_punch:[20.4810144,24.2878944],poke_eye:[8.7177552,10.8115392],kick_knee:[7.9754136,11.7822936],shove:[6.4336272,12.1439472],collar_knee:[22.746108,26.552988]})){
    near(moves[move].power_min,min);near(moves[move].power_max,max);
  }
  for(const [tier,min,max]of [[1,7.835828,9.710428],[2,10.88398528,13.26040128],[3,15.080436,18.108636]]){
    const swing=CE.getById('enemy.street_thug_tier'+tier).actions.find(a=>a.id==='swing_punch');
    near(swing.power_min,min);near(swing.power_max,max);
  }
  assert.equal(moves.collar_knee.move_power_multiplier,undefined);
  assert.equal(moves.collar_knee.hit_segments,1);
  assert.equal(g.CombatSkills.getSkill('combat_rogue_sanda').moves.some(m=>m.id==='collar_knee'),false);
  for(const [level,min,max]of [[1,.6,.8],[2,.605,.805],[100,1.095,1.295],[120,1.195,1.395],[121,1.2,1.4],[1000,5.595,5.795],[1001,5.595,5.795]]){
    const copy=plain(t);delete copy.bossDerived;copy.boss.skill_level=level;
    g.CombatEnemyBoss.prepare(copy);
    const a=copy.actions.find(a=>a.id==='collar_knee'),profile=g.CombatSkills.getMovePowerProfile(a.skill_id,a,level);
    near(profile.min,min);near(profile.max,max);assert.equal(profile.levelBonus,0);
    near(a.power_min,19.0344*min);near(a.power_max,19.0344*max);
  }
  near(resolvePreviewMove(moves.collar_knee,'none','collar_knee').move_power_multiplier,.7);
  const map={map_id:mapId,width:12,height:12,enemies:[{enemy_id:id,x:5,y:5}],npcs:[],portals:[],blocks:[],disabled:[],entities:[]};
  g.GameEngine.getMaps()[mapId]=map;g.GameEngine.setState(mapId,6,5);
  g.CharacterAttributes.setState({character_creation_completed:true,innate:{jingu:20,flexibility:20,breath:20,dexterity:20,focus:20}});
  const initial=CE.getDungeonState(mapId,0,id),random=g.Math.random;
  let tick=0;
  const state=()=>CE.getDungeonState(mapId,0,id),boss=()=>CE.bossInfo(id,mapId,0);
  function reset(burst=false){
    g.Math.random=random;CE.endWorldTurn();CE.restoreDungeonState(mapId,0,id,initial);
    const s=state();s.boss={...boss(),burstRemaining:burst?3:0};CE.restoreDungeonState(mapId,0,id,s);
    B.setBuffStacks('player','buff_off_balance',1);
    CE.beginWorldTurn(++tick);CE.dungeonTurnStatus(mapId,0,id,tick);
  }
  for(const burst of [false,true])for(const dry of [false,true])for(const unit of [0,.5,1-Number.EPSILON]){
    reset(burst);let draws=0;g.Math.random=()=>++draws===3?unit:0;
    const r=R.resolveEnemyVsPlayerAttack({enemyId:id,enemyMapId:mapId,enemyIndex:0,plannedAction:moves.collar_knee,deferResourceSpend:dry});
    assert.equal(draws,3,'one hit, one body part and one coefficient draw');
    near(r.rawDamage,(22.746108+3.80688*unit)*(burst?1.8:1));
    g.Math.random=()=>{throw Error('deferred commit must not reroll');};
    if(dry){assert.equal(boss().diqi,500);R.applyDeferredResourceSpendFromResolveResult(r);R.applyDeferredResourceSpendFromResolveResult(r);}
    assert.equal(boss().diqi,479);assert.equal(state().qi_current,75);
    assert.equal(boss().kneeReadyTick,tick+6);assert.equal(B.getBuffStacksSum('player','buff_off_balance'),0);
  }
  g.Math.random=random;
  console.log('PASS enemy ranges: three thug tiers, boss growth/cap, exclusive knee, preserved proficiency, continuous rolls, burst, costs and deferred commits');
} finally {await h.close();}
