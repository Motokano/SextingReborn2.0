import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const c = vm.createContext({ console });
c.window = c;
const load = name => vm.runInContext(read(`js/${name}.js`), c, { filename: name });
for (const name of ['combat-damage', 'combat-skills', 'combat-melee-resolve', 'combat-pipeline']) load(name);
const D = c.CombatDamage, P = c.CombatPipeline, R = c.CombatMeleeResolve;
P.setConfig(JSON.parse(read('data/combat-pipeline.json')));

// A–E: production arithmetic, including source ancestry and constrained mixed absorption.
near(D.attack({ base: 100, levelBonus: 1, proficiencyBonus: .5, innateBonus: .8, experienceBonus: .2, move: 1.4, power: 1.1, breath: .8 }), 431.2);
near(D.attack({ base: 100, levelBonus: 1, proficiencyBonus: .5, innateBonus: .8, experienceBonus: .2, move: 1.4, power: 1.1, breath: 4 }), 2156);
near(D.total(D.typed({ blunt: 100 }, { add_flat: { blunt: 20 }, add_from_pct: [{ source: 'blunt', target: 'pierce', pct: .2 }], increase_pct: { blunt: .5, pierce: .5 } }).typedDamage), 234);
let t = D.typed({ blunt: 100 }, { convert_pct: { blunt_to_slash: .8, blunt_to_pierce: .6 } }).typedDamage;
near(t.blunt, 0); near(t.slash, 80); near(t.pierce, 20);
near(D.total(D.typed({ blunt: 100 }, { convert_pct: { blunt_to_slash: .8, slash_to_pierce: .5 }, increase_pct: { blunt: .5, slash: .4, pierce: .2 } }).typedDamage), 214.8);
near(D.total(D.typed({ blunt: 100 }, { convert_pct: { blunt_to_slash: .8, blunt_to_pierce: .6, slash_to_pierce: .5 }, increase_pct: { blunt: .5, slash: .4, pierce: .2 } }).typedDamage), 220.8);
const defense = D.defend({ blunt: 100, pierce: 100 }, { unload: .2, armor: { blunt: .3, pierce: .1 }, shield: 16, flexibility: 144, part: { blunt: .8, pierce: 1.2 } });
near(defense.damage, 109.2); near(defense.shieldRemaining, 0);
assert.equal(Math.floor(defense.damage * 1.4), 152);
near(D.defend({ blunt: 1 }, { armor: { blunt: .3 }, shield: 1 }).shieldRemaining, .7);
near(D.defend({ blunt: 100 }, { armor: { blunt: .3 }, permanentArmor: true, shield: 0 }).damage, 70);

let state = { qi_li_current: 0, diqi_current: 1000, diqi_max_effective: 100 };
let restored = 0, delivered = [], shield = 0;
let innate = 20, actual = 100 / .7, exp = 1, level = 1, usage = 0;
c.Survival = {
  getState: () => state, getQiLiMax: () => 100,
  consumeQiLi: n => { const spent = Math.min(n, state.qi_li_current); state.qi_li_current -= spent; return spent; },
  consumeDiqi: n => { const spent = Math.min(n, state.diqi_current); state.diqi_current -= spent; return spent; },
  drainQiLi: () => { state.qi_li_current = 0; },
  addQiLi: n => { restored++; state.qi_li_current = Math.min(100, state.qi_li_current + n); },
  getDiqiShieldRemaining: () => shield, setDiqiShieldRemaining: n => { shield = n; },
};
c.CharacterAttributes = {
  getCombatSpeed: () => 10, getHitRate: () => 1,
  getEffectiveAttr: id => id === 'flexibility' ? 0 : actual,
  getInnateAttr: () => innate, getFistBasePower: () => D.basePower(actual),
  getDamageTypeModifier: () => 1, getDominantLimbMultiplier: () => 1,
  applyCombatDestroy: (part, damage) => delivered.push({ part, finalDamage: damage }),
};
c.InventoryEquipment = {
  getSkillLevel: () => level, getSkillsState: () => ({ test: { move_usage: { hit: usage } } }),
  getCombatState: () => ({ hubs: { breath: 'breath' } }),
  getCombatExperienceDamageMultiplier: () => exp,
  getPlateDamageReduce: () => .3, getHeadDamageReduce: () => .3,
};
c.CombatEnemies = { onEnemyDamageResolved: ctx => delivered.push(ctx), getById: () => ({}), isEnemyDead: () => false };
const skill = { id: 'test', category: 'unarmed', primary_attribute: 'jingu', innate_damage_baseline: 20, moves: [
  { id: 'hit', unlock_level: 1, move_power_multiplier: 1, damage_type: 'blunt', hit_part_weights: { chest: 1 }, hit_segments: 2,
    diqi_cost: { ratio_of_diqi_max_at_10_power: .1, min: 1, max: 50 }, damage_type_effects: { add_flat: { pierce: 10 } } }
] };
const bar = { damage_states: [ { id: 'burst', when: 'full', multiplier: 4, consume_all: true }, { id: 'charge', when: 'always', multiplier: .8, gain_after_attack: 10 } ] };
c.CombatSkills.setConfig({ constants: {}, skills: { test: skill, breath: { id: 'breath', category: 'breath', breath_bar: bar } } });
const resolve = deferred => R.resolvePlayerVsEnemyAttack({ skillId: 'test', moveId: 'hit', limbId: 'lhand', powerLevel: 10, deferResourceSpend: deferred });
function strike(r, dry = false, overrides = {}) {
  const ctx = { ...r, resourceResult: r, attacker: { kind: 'player', postEffectIds: [] }, defender: { kind: 'enemy', enemyId: 'target' }, simultaneousDryRun: dry, ...overrides };
  P.runPipeline('melee_hit_enemy_defender', ctx);
  return ctx;
}
// F: each segment gets the full flat addition; breath and resources belong to the action.
actual = 62.5 / .7;
let r = resolve(false);
near(r.rawDamage, 60);
let ctx = strike(r, false, { actionConditionBonus: .5 });
assert.equal(ctx.finalDamage, 180); assert.equal(restored, 1); assert.equal(state.qi_li_current, 10);
assert.equal(state.diqi_current, 990);
R.finishActionResources(r); assert.equal(restored, 1);
r = resolve(false); r.segments[1].hitRollSuccess = false;
assert.equal(strike(r, false, { actionConditionBonus: .5 }).finalDamage, 90);

// Burst is selected at action start, spent once even when parried/missed, never charged again.
state.qi_li_current = 100;
r = resolve(false); near(r.breathMultiplier, 4); assert.equal(state.qi_li_current, 0);
const beforeRestore = restored;
ctx = strike(r); assert.equal(restored, beforeRestore); assert.equal(state.qi_li_current, 0);
state.qi_li_current = 90;
r = resolve(true); assert.equal(state.qi_li_current, 90);
ctx = strike(r, true); assert.equal(state.qi_li_current, 90);
R.applyDeferredResourceSpendFromResolveResult(r); R.applyDeferredResourceSpendFromResolveResult(r);
P.finalizeSimultaneousStrike(ctx); P.finalizeSimultaneousStrike(ctx);
assert.equal(state.qi_li_current, 100); assert.equal(restored, beforeRestore + 1);
state.qi_li_current = 100; r = resolve(false);
r.hitRollSuccess = false; r.segments.forEach(s => { s.hitRollSuccess = false; });
assert.equal(strike(r).finalDamage, 0); assert.equal(state.qi_li_current, 0);

// H: the actual resolver uses primary innate excess; no early rounding of base.
bar.damage_states = []; skill.moves[0].hit_segments = 1; skill.moves[0].damage_type_effects = {};
skill.moves[0].move_power_multiplier = 1.4;
actual = 21; innate = 18;
near(resolve(false).rawDamage, 20.58); assert.equal(strike(resolve(false)).finalDamage, 20);
actual = 100 / .7; innate = 28; exp = 1.2; usage = 25000;
r = resolve(false); near(r.rawDamage, 100 * (1 + .8 + .2 + .5) * 1.4);
near(D.basePower(150), 105); near(D.basePower(600), 244.0665229422827);

// G: actual BuffSystem, normal and simultaneous runs must agree on segment snapshots.
const buffs = { buffs: [
  { buff_id: 'bruise', durationTicks: 100, maxStacks: 20, stacksAddOnApply: 1, effects: [{ type: 'battle_final_damage_taken_multiplier', params: { multiplier: 1.1 } }] },
  { buff_id: 'extra', durationTicks: 100, effects: [{ type: 'battle_final_damage_taken_multiplier', params: { multiplier: 1.2 } }] },
  { buff_id: 'reduce', durationTicks: 100, effects: [{ type: 'battle_final_damage_taken_multiplier', params: { multiplier: .9 } }] },
] };
c.fetch = async path => ({ ok: true, json: async () => path === 'data/buffs.json' ? buffs : {} });
load('buff-system'); c.BuffSystem.init();
await new Promise(resolve => setImmediate(resolve));
c.CombatPostEffects = { getPostEffect: () => ({ effect_type: 'damage_scale_by_target_debuff_stacks', effect_params: { per_stack_multiplier: .05 } }) };
for (const dry of [false, true]) {
  c.BuffSystem.setState({ instancesByOwner: {} });
  const r2 = { rawDamage: 100, typedDamage: { blunt: 100 }, hitRollSuccess: true, hitPart: 'chest', skillId: 'test', moveId: 'hit', segments: [{ hitRollSuccess: true }, { hitRollSuccess: true }] };
  skill.moves[0].on_hit_roll_success_apply_buff_target = 'bruise';
  ctx = strike(r2, dry, { attacker: { kind: 'player', postEffectIds: ['dog'] } });
  assert.equal(ctx.finalDamage, 210);
  if (dry) {
    assert.equal(c.BuffSystem.getBuffStacksSum('target', 'bruise'), 0);
    P.flushPendingBuffApplies(ctx); P.finalizeSimultaneousStrike(ctx);
  }
  assert.equal(c.BuffSystem.getBuffStacksSum('target', 'bruise'), 2);
  const next = strike({ ...r2, segments: null }, false, { attacker: { kind: 'player', postEffectIds: ['dog'] } });
  assert.equal(next.finalDamage, 132);
}
c.BuffSystem.applyBuff('target', 'extra'); c.BuffSystem.applyBuff('target', 'reduce');
near(c.BuffSystem.getBattleFinalDamageTakenMultiplier('target'), 1.4);
// Resource failure blocks target effects before they can be dispatched.
const stacks = c.BuffSystem.getBuffStacksSum('target', 'bruise');
state.diqi_current = 0; r = resolve(false);
assert.equal(strike(r).finalDamage, 0);
assert.equal(c.BuffSystem.getBuffStacksSum('target', 'bruise'), stacks);

// Shared defense: dry runs don't mutate shield; normal/deferred commits match.
for (const dry of [false, true]) {
  c.BuffSystem.setState({ instancesByOwner: {} }); shield = 16;
  const defCtx = { rawDamage: 100, typedDamage: { blunt: 100 }, hitRollSuccess: true, hitPart: 'chest', attacker: { kind: 'enemy' }, defender: { kind: 'player' }, simultaneousDryRun: dry };
  P.runPipeline('melee_hit_player_defender', defCtx);
  assert.equal(defCtx.finalDamage, 84);
  if (dry) { assert.equal(shield, 16); P.finalizeSimultaneousStrike(defCtx); }
  assert.equal(shield, 0);
}

// D collision: only the winning, actually blocked displacement appends damage.
const map = { map_id: 'test', enemies: [{ enemy_id: 'target', x: 1, y: 1 }] };
c.GameEngine = { getMap: () => map, getState: () => ({ mapId: 'test', x: 0, y: 1 }), isWalkable: () => false };
load('combat-world');
const wallCtx = { finalDamage: 152, hitRollSuccess: true, hitPart: 'chest', attacker: { kind: 'player', pos: { x: 0, y: 1 } }, defender: { kind: 'enemy', enemyId: 'target', index: 0, mapId: 'test' } };
delivered = [];
c.CombatWorld.queueDisplacement(wallCtx, { cells: 1, wall_slam_final_damage_multiplier: 1.3 });
c.CombatWorld.queueDisplacement({ ...wallCtx, finalDamage: 1000 }, { cells: 1, wall_slam_final_damage_multiplier: 1.3 });
c.CombatWorld.flushDisplacements();
assert.equal(delivered.length, 1); assert.equal(delivered[0].finalDamage, 45); assert.equal(delivered[0].collisionDamage, true);
c.CombatWorld.flushDisplacements(); assert.equal(delivered.length, 1);
c.GameEngine.isWalkable = () => true;
c.CombatWorld.queueDisplacement(wallCtx, { cells: 1, wall_slam_final_damage_multiplier: 1.3 });
c.CombatWorld.flushDisplacements(); assert.equal(map.enemies[0].x, 2); assert.equal(delivered.length, 1);
// Real attribute adapter: alternate main stat, fractional weapon threshold, >100% type bonuses.
const attrs = vm.createContext({ console });
vm.runInContext(read('js/character-attributes.js'), attrs);
attrs.CharacterAttributes.setState({ innate: { jingu: 15, flexibility: 21 } });
near(attrs.CharacterAttributes.getFistBasePower('flexibility'), 14.7);
near(attrs.CharacterAttributes.getWeaponThresholdAndBonus(20).M_threshold, .75);
attrs.CharacterAttributes.setState({ innate: { jingu: 9 } });
assert.equal(attrs.CharacterAttributes.getWeaponThresholdAndBonus(20).canUse, false);
attrs.InventoryEquipment = { getState: () => ({ equipment: { glove_left: { enchants: ['a', 'b', 'c'] } } }),
  getEnchantEntry: id => id === 'c' ? { effect_type: 'damage_type_convert_pct', effect_params: { from: 'blunt', to: 'pierce', pct: .6 } }
    : { effect_type: 'damage_type_increase_pct', effect_params: { damage_type: 'blunt', pct: .8 } } };
const mods = attrs.CharacterAttributes.getDamageTypeCombatModifiers();
near(mods.increase_pct.blunt, 1.6); near(mods.convert_pct.blunt_to_pierce, .6);
c.CharacterAttributes.getDamageTypeCombatModifiers = () => mods;
state.diqi_current = 1000; innate = 20; exp = 1; usage = 0; actual = 100 / .7;
skill.moves[0].move_power_multiplier = 1;
near(resolve(false).rawDamage, 260);
console.log('PASS: runtime A–H, breath action costs, multi-segment snapshots, additive taken buffs, shared shield, blocked effects and tick-end collision');
