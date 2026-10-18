import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const c = vm.createContext({ console });
c.window = c;
c.Math = Object.create(Math);
let roll = .99, flex = 0, debuff = 0;
c.Math.random = () => roll;
for (const name of ['combat-skills', 'inventory-equipment', 'combat-parry', 'combat-pipeline']) {
  vm.runInContext(read(`js/${name}.js`), c, { filename: name });
}
const IE = c.InventoryEquipment, CS = c.CombatSkills, P = c.CombatPipeline;
const config = JSON.parse(read('data/combat-skills.json'));
const fw = 'combat_basic_footwork';
config.skills.test_footwork = { id: 'test_footwork', category: 'footwork', max_level: 1000,
  parry_success_at_level_1: .1, parry_success_at_max: .1,
  parry_reduce_at_level_1: .1, parry_reduce_at_max: .1 };
CS.setConfig(config);
IE.setConfig({ equipment: {
  left: { item_id: 'left', equip_slot: 'shoe_left', parry_coef: 2 },
  right: { item_id: 'right', equip_slot: 'shoe_right', parry_coef: 1.2 }
}, items: {}, default_equipment: {} });
c.CharacterAttributes = { getEffectiveAttr: () => flex, getCfg: (key, fallback) => fallback };
c.BuffSystem = { getParryChanceDeltaPercent: () => debuff };
P.setConfig({ pipelines: { parry: { phases: [{ handler: 'builtin.parry_player_combat_parry' }] } } });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function load(level = 1, equipment = {}) {
  IE.setState({ equipment, skills: { [fw]: { level }, test_footwork: { level: 1 } },
    skill_max_level_bonus: {}, combat: { hubs: { footwork: fw }, limbs: {} } });
}
function strike(extra = {}) {
  return P.runPipeline('parry', { rawDamage: 100, hitRollSuccess: true, hitPart: 'left_arm',
    attacker: { kind: 'enemy' }, defender: { kind: 'player' }, ...extra });
}
assert.equal(CS.getSkill('combat_basic_parry'), null);
assert.equal(CS.getCategories().some(x => x.id === 'parry'), false);
load();
near(strike().damageAfterParry, 75);
roll = .199; assert.equal(strike().parrySucceeded, true);
roll = .201; assert.equal(strike().parrySucceeded, false);
assert.equal(IE.getSkillsState()[fw].move_usage.parry_success, 1);
assert.equal(CS.getSkillTotalProficiency(fw, { parry_success: 50000 }), 0);

// Growth receives flexibility; fixed +5 points receives the lower shoe coefficient only.
load(1, { shoe_left: { item_id: 'left' }, shoe_right: { item_id: 'right' } });
flex = 100; roll = .284; assert.equal(strike().parrySucceeded, true);
roll = .286; near(strike().damageAfterParry, 64);
debuff = -10; roll = .184; assert.equal(strike().parrySucceeded, true);
roll = .186; assert.equal(strike().parrySucceeded, false);
debuff = 0; flex = 0;
load(1000); roll = .499; assert.equal(strike().parrySucceeded, true);
roll = .501; near(strike().damageAfterParry, 50);
flex = 1000; roll = .749; assert.equal(strike().parrySucceeded, true);
roll = .751; near(strike().damageAfterParry, 50);

// Global switching/unmounting and unlearned skills change both growth and fixed defense.
flex = 0; roll = .99;
IE.setCombatState({ hubs: { footwork: 'test_footwork' } });
near(strike().damageAfterParry, 90);
IE.setCombatState({ hubs: { footwork: null } });
assert.equal(strike().skipReason, 'empty_footwork_slot');
near(strike().damageAfterParry, 100);
load(0); assert.equal(strike().skipReason, 'unlearned');
near(IE.getFootworkParryBonus().chance, 0);
load();
assert.equal(strike({ hitRollSuccess: false }).guardLimb, undefined);
assert.equal(strike({ defender: { kind: 'player', isBodyPartDestroyed: p => p === 'left_arm' } }).skipReason, 'struck_limb_destroyed');
assert.equal(strike({ hitPart: 'chest', defender: { kind: 'player', isBodyPartDestroyed: () => true } }).skipReason, 'all_limbs_destroyed');
c.SceneCtx = { playerExchangeAttackLimb: 'lhand' };
assert.notEqual(strike().guardLimb, 'lhand');
assert.equal(strike({ defender: { kind: 'player', isBodyPartDestroyed: p => p !== 'left_arm' } }).skipReason, 'no_parry_candidate');
c.SceneCtx = {};

// Migration preserves the larger level, unspent study, counters and unlocked cap; repeated load is idempotent.
const old = { skills: {
  combat_basic_parry: { level: 1100, study_exp: 40, move_usage: { parry_success: 8 } },
  [fw]: { level: 250, study_exp: 30, move_usage: { parry_success: 2, nie_bu: 4 } }
}, skill_max_level_bonus: { combat_basic_parry: 100 },
combat: { hubs: {}, limbs: { lhand: { parry: 'combat_basic_parry' } }, parry_variant_sequences: { lhand: ['old'] } } };
IE.setState(old);
assert.equal(old.skills.combat_basic_parry.level, 1100, 'loading must not mutate input');
assert.equal(IE.getSkillLevel(fw), 1100);
assert.equal(IE.getSkillLevel('combat_basic_parry'), 0);
assert.equal(IE.getSkillsState()[fw].study_exp, 70);
assert.equal(IE.getSkillsState()[fw].move_usage.parry_success, 10);
assert.equal(IE.getSkillsState()[fw].move_usage.nie_bu, 4);
assert.equal(IE.getCombatState().hubs.footwork, fw);
assert.equal(Object.hasOwn(IE.getCombatState().limbs.lhand, 'parry'), false);
assert.equal(Object.hasOwn(IE.getState().skill_max_level_bonus, 'combat_basic_parry'), false);
near(CS.getParryValues(fw, 1100).success, .45);
const saved = JSON.stringify(IE.getState());
IE.setState(JSON.parse(saved));
const savedState = JSON.parse(saved), reloadedState = JSON.parse(JSON.stringify(IE.getState()));
assert.deepEqual(reloadedState.skills[fw], savedState.skills[fw]);
assert.deepEqual(reloadedState.skill_max_level_bonus, savedState.skill_max_level_bonus);
assert.deepEqual(reloadedState.combat, savedState.combat);
old.combat.hubs.footwork = 'test_footwork';
IE.setState(old);
assert.equal(IE.getCombatState().hubs.footwork, 'test_footwork', 'migration must preserve another mounted footwork');

// Real attribute cache uses the same level and refreshes when the global slot changes.
vm.runInContext(read('js/character-attributes.js'), c, { filename: 'character-attributes' });
const CA = c.CharacterAttributes;
CA.setConfig({});
load(500);
IE.setCombatState({ hubs: { footwork: null } });
const withoutFootwork = CA.getCombatSpeed();
IE.setCombatState({ hubs: { footwork: fw } });
near(CA.getCombatSpeed(), withoutFootwork + 50);
IE.setCombatState({ hubs: { footwork: null } });
near(CA.getCombatSpeed(), withoutFootwork);

console.log('PASS: unified footwork growth, caps, shoes, flexibility, debuffs, guard eligibility, switching and legacy migration');
