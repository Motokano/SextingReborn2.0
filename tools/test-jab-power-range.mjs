import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolvePreviewMove } from '../js/combat-fx-action-prototype.mjs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
let roll = 0.5, draws = 0;
const math = Object.create(Math);
math.random = () => { draws++; return roll; };
const g = vm.createContext({ console, Math: math });
g.window = g;
for (const name of ['combat-damage', 'combat-skills', 'combat-melee-resolve', 'combat-pipeline'])
  vm.runInContext(read(`js/${name}.js`), g, { filename: name });
const config = JSON.parse(read('data/combat-skills.json'));
g.CombatSkills.setConfig(config);
g.CombatPipeline.setConfig(JSON.parse(read('data/combat-pipeline.json')));
const CS = g.CombatSkills, R = g.CombatMeleeResolve, P = g.CombatPipeline;
const skillId = 'combat_basic_unarmed', skill = config.skills[skillId];
const jab = skill.moves.find(m => m.id === 'jab');
const beforeConfig = JSON.stringify(config);
const approved = [
  ['combat_basic_unarmed','jab',.2,.4,.002,1],
  ['combat_basic_unarmed','front_kick',.3,.5,.002,1],
  ['combat_basic_unarmed','swing_punch',.6,.8,.004,1],
  ['combat_basic_unarmed','whip_kick',.2,.5,.003,1],
  ['combat_rogue_sanda','poke_eye',.22,.33,.002,1],
  ['combat_rogue_sanda','kick_knee',.3,.5,.001,1],
  ['combat_rogue_sanda','shove',.1,.4,.002,1],
  ['combat_rogue_sanda','slap_combo',.2,.4,.001,2],
  ['combat_basic_weapon_melee','weapon_strike',.1,.1,0,1],
];

// The display/profile is pure; every point of level growth is retained, including 0.002 steps.
for (const [level, min, max] of [[0,.2,.4], [1,.2,.4], [99,.396,.596], [100,.398,.598], [101,.4,.6], [500,1.198,1.398], [1000,2.198,2.398], [1001,2.198,2.398]]) {
  const p = CS.getMovePowerProfile(skillId, jab, level);
  near(p.min, min); near(p.max, max); near(p.max - p.min, .2); assert.equal(p.levelBonus, 0);
}
assert.equal(draws, 0, 'inspection never consumes a combat roll');
for (const [sid,mid,min,max,growth,segments] of approved) {
  const move = CS.getSkill(sid).moves.find(m => m.id === mid);
  assert.equal(move.hit_segments, segments);
  assert.equal(move.move_power_multiplier, undefined);
  for (const level of [1,2,50,99,100,101,500,1000,1001]) {
    const p = CS.getMovePowerProfile(sid, move, level), steps = Math.min(level,1000)-1;
    near(p.min, min+steps*growth); near(p.max, max+steps*growth);
    assert.equal(p.levelBonus, 0, mid+' must not retain the old level bonus');
  }
}
const legacy = CS.getMovePowerProfile('combat_rogue_sanda', {move_power_multiplier:1.2}, 120);
near(legacy.min, 1.2); near(legacy.max, 1.2); near(legacy.levelBonus, .3);

let level = 100, usage = 0, innate = 20, experience = 1, burst = false, delivered = 0;
let state;
g.InventoryEquipment = {
  getSkillLevel: () => level,
  getSkillsState: () => Object.fromEntries(Object.values(config.skills).map(sk => [sk.id,
    {move_usage:Object.fromEntries((sk.moves||[]).map(m => [m.id,usage]))}])),
  getState: () => ({equipment:{weapon_right:{item_id:'test_weapon'}}}),
  getItemTemplate: () => ({weapon_attack_power:35}),
  getCombatState: () => ({ hubs: { breath: 'combat_basic_breath' } }),
  getCombatExperienceDamageMultiplier: () => experience,
};
g.CharacterAttributes = {
  getCombatSpeed: () => 10, getHitRate: () => 1,
  getFistBasePower: () => 35, getInnateAttr: () => innate,
  getDamageTypeModifier: () => 1, getDominantLimbMultiplier: () => 1,
};
g.CombatBreath = { active: () => burst ? { damage_multiplier: 1.8 } : null, range: () => 1, finish() {} };
g.Survival = {
  isDead: () => false, getState: () => state, getQiLiMax: () => 100,
  consumeDiqi: n => { const spent = Math.min(n, state.diqi_current); state.diqi_current -= spent; return spent; },
  consumeQiLi: n => { const spent = Math.min(n, state.qi_li_current); state.qi_li_current -= spent; return spent; },
  drainQiLi: () => { state.qi_li_current = 0; },
};
g.CombatEnemies = { isEnemyDead: () => false, onEnemyDamageResolved: () => { delivered++; } };
function resolve(options = {}) {
  state = { diqi_current: 100, diqi_max_effective: 100, qi_li_current: 100 };
  return R.resolvePlayerVsEnemyAttack({ skillId, moveId: 'jab', limbId: 'rhand', powerLevel: 10, ...options });
}
function strike(r, dry = false) {
  const ctx = { ...r, resourceResult: r, attacker: { kind: 'player' }, defender: { kind: 'enemy', enemyId: 'test' }, simultaneousDryRun: dry };
  P.runPipeline('melee_hit_enemy_defender', ctx);
  return ctx;
}

// All approved moves use their owning skill level; late unlocks keep the level-1 baseline.
for (const [sid,mid,min,max,growth,segments] of approved) for (const L of [100,1000]) for (const unit of [0,.5,.999999999]) {
  level=L; roll=unit; usage=25000; innate=30; experience=1.2;
  const before=draws, r=resolve({skillId:sid,moveId:mid});
  const coefficient=min+(L-1)*growth+unit*(max-min);
  assert.equal(r.moveId,mid); near(r.movePowerMultiplier,coefficient);
  near(r.wSkill,2.7); near(r.rawDamage,35*2.7*coefficient);
  assert.equal(draws-before,segments*2+(max>min?1:0),'one range draw per action, none for fixed 0.1');
  if (mid==='slap_combo' && unit===.5) {
    const ctx=strike(r);
    assert.equal(ctx.segmentsResults.length,2);
    for (const segment of ctx.segmentsResults) near(segment.rawDamage,r.rawDamage);
    assert.equal(ctx.finalDamage,2*Math.floor(r.rawDamage),'range is per palm, not total or divided in half');
  }
}
usage=0; innate=20; experience=1;

// Real resolver: no old +25%/+250% level bonus remains in the additive growth bucket.
for (const L of [1,100,101,1000]) for (const unit of [0,.5,.999999999]) {
  level = L; roll = unit;
  const r = resolve(), expected = .2 + (L - 1) * .002 + unit * .2;
  near(r.movePowerMultiplier, expected); near(r.rawDamage, 35 * expected); near(r.wSkill, 1);
  assert.ok(r.movePowerMultiplier >= r.movePowerRange.min && r.movePowerMultiplier <= r.movePowerRange.max);
}
level = 100; roll = .5; usage = 25000; innate = 30; experience = 1.2;
let r = resolve();
near(r.wSkill, 2.7); near(r.rawDamage, 47.061);
assert.equal(strike(r).finalDamage, 47, 'only the final damage is floored');
burst = true;
r = resolve({ powerLevel: 12 }); near(r.rawDamage, 47.061 * 1.2 * 1.8);
assert.equal(r.qiIntended, 25); assert.equal(r.diqiIntended, 30);
burst = false;

// Both the ordinary and same-speed paths use the already drawn value at commit time.
for (const dry of [false,true]) {
  roll = 0;
  const before = draws;
  r = resolve({ deferResourceSpend: dry });
  assert.equal(draws - before, 3, 'one hit roll, one part roll, one coefficient roll');
  near(r.rawDamage, 37.611);
  roll = .9;
  const ctx = strike(r, dry), afterResolve = draws;
  assert.equal(ctx.finalDamage, 37);
  const beforeCommit = delivered;
  if (dry) {
    assert.equal(state.diqi_current, 100); assert.equal(state.qi_li_current, 100);
    R.applyDeferredResourceSpendFromResolveResult(r); R.applyDeferredResourceSpendFromResolveResult(r);
    P.finalizeSimultaneousStrike(ctx); P.finalizeSimultaneousStrike(ctx);
    assert.equal(delivered, beforeCommit + 1);
  }
  assert.equal(draws, afterResolve, 'committing the pending result cannot reroll damage');
  assert.equal(state.diqi_current, 90); assert.equal(state.qi_li_current, 75);
  const next = resolve(); near(next.movePowerMultiplier, .578);
}
for (const resource of ['diqi_current','qi_li_current']) {
  r = resolve({ deferResourceSpend: true });
  state[resource] = 0;
  r = R.resolvePlayerVsEnemyAttack({ skillId, moveId: 'jab', limbId: 'rhand', powerLevel: 10 });
  assert.equal(strike(r).finalDamage, 0);
}
const preview = resolvePreviewMove(jab, 'none', 'jab');
near(preview.move_power_multiplier, .3);
near(resolvePreviewMove(jab, 'triple', 'jab').move_power_multiplier, .15);
assert.equal(JSON.stringify(config), beforeConfig, 'resolution and previews never mutate the catalog');
console.log('PASS: all nine attack ranges/growth, preserved bonuses, two palms, fixed strike, one roll per action, deferred commits, costs and preview');
