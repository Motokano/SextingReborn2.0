import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ console });
for (const file of ['combat-damage', 'combat-skills', 'combat-melee-resolve', 'combat-pipeline']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), ctx);
}
ctx.CombatSkills.setConfig(JSON.parse(fs.readFileSync(new URL('../data/combat-skills.json', import.meta.url), 'utf8')));
ctx.CombatPipeline.setConfig(JSON.parse(fs.readFileSync(new URL('../data/combat-pipeline.json', import.meta.url), 'utf8')));
const cost = { ratio_of_diqi_max_at_10_power: 0.1, min: 1, max: 50 };
const resolve = ctx.CombatMeleeResolve;
for (const [k, expected] of [[1, 1], [10, 10], [11, 20], [12, 30]]) {
  assert.equal(resolve.computeIntendedResourceCost(100, cost, k), expected);
}
for (const value of [-10, 10]) {
  for (const k of [1, 10, 11, 12]) {
    const bar = { action_delta: { punch: { type: 'flat', value, scale_by_power: true } } };
    assert.equal(resolve.computeBreathMoveCost(bar, 'jab', ['挥拳'], k, 100).amount, 10);
  }
}
for (const k of [1, 10, 11, 12]) {
  const bar = { action_delta: { punch: { value: -0.25, move_overrides: { jab: -0.2 } } } };
  assert.equal(resolve.computeBreathMoveCost(bar, 'jab', ['挥拳'], k, 100).amount, 20);
}

let state;
let applied;
ctx.InventoryEquipment = {
  getSkillLevel: () => 1,
  getSkillsState: () => ({}),
  getCombatState: () => ({ hubs: { breath: 'combat_basic_breath' } }),
};
ctx.CharacterAttributes = {
  getCombatSpeed: () => 10,
  getHitRate: () => 1,
  getFistBasePower: () => 100,
  getDominantLimbMultiplier: () => 1,
};
ctx.Survival = {
  getState: () => state,
  getQiLiMax: () => 100,
  consumeDiqi: n => { const spent = Math.min(n, state.diqi_current); state.diqi_current -= spent; return spent; },
  consumeQiLi: n => { const spent = Math.min(n, state.qi_li_current); state.qi_li_current -= spent; return spent; },
  drainQiLi: () => { state.qi_li_current = 0; },
};
ctx.CombatEnemies = { onEnemyDamageResolved: c => { applied += c.finalDamage; } };
for (const deferred of [false, true]) {
  for (const k of [1, 10, 11, 12]) {
    const needed = resolve.computeIntendedResourceCost(100, cost, k);
    for (const available of [0, needed - 1, needed]) {
      state = { diqi_current: available, diqi_max_effective: 100, qi_li_current: 100 };
      applied = 0;
      const r = resolve.resolvePlayerVsEnemyAttack({ skillId: 'combat_basic_unarmed', moveId: 'jab', limbId: 'lhand', powerLevel: k, deferResourceSpend: deferred });
      assert.equal(r.diqiIntended, needed);
      assert.equal(r.forceZeroDamageByResourceInsufficient, available < needed);
      const strike = { ...r, attacker: { kind: 'player' }, defender: { kind: 'enemy', enemyId: 'test' }, simultaneousDryRun: deferred };
      ctx.CombatPipeline.runPipeline('melee_hit_enemy_defender', strike);
      assert.equal(strike.finalDamage > 0, available >= needed);
      if (deferred) {
        assert.equal(state.diqi_current, available);
        resolve.applyDeferredResourceSpendFromResolveResult(r);
      }
      assert.equal(state.diqi_current, 0);
      assert.equal(state.qi_li_current, 80);
      if (available < needed) assert.equal(applied, 0);
    }
  }
}
console.log('PASS: power costs, independent breath changes, insufficient/exact resources, normal/deferred damage pipeline');
