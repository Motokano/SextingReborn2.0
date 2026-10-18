import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const c = vm.createContext({ console });
c.window = c;
for (const name of ['inventory-equipment', 'combat-variants']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'), c);
}
const IE = c.InventoryEquipment;
IE.setConfig({ equipment: {}, items: {}, default_equipment: {} });
const legacy = {
  skills: { combat_basic_parry: { level: 600, move_usage: {} } },
  combat: {
    limbs: { lhand: { active: null, parry: 'combat_basic_parry' } },
    hubs: { breath: null, footwork: 'combat_basic_footwork' },
    parry_variant_sequences: { lhand: ['old_defense'] },
    parry_variant_slots: [{ slot_index: 0, variant_id: 'old_defense' }]
  }
};
function assertRetired() {
  for (const combat of [IE.getState().combat, IE.getCombatState()]) {
    assert.equal(Object.hasOwn(combat, 'parry_variant_sequences'), false);
    assert.equal(Object.hasOwn(combat, 'parry_variant_slots'), false);
    assert.equal(Object.hasOwn(combat.limbs.lhand, 'parry'), false);
    assert.equal(combat.hubs.footwork, 'combat_basic_footwork');
  }
  assert.equal(IE.getSkillLevel('combat_basic_footwork'), 600);
  assert.equal(IE.getSkillLevel('combat_basic_parry'), 0);
}
IE.setState(legacy);
assertRetired();
IE.setCombatState({ parry_variant_sequences: legacy.combat.parry_variant_sequences });
assertRetired();
IE.setState(JSON.parse(JSON.stringify(IE.getState())));
assertRetired();

// Offensive variants remain executable, including legacy dual-scope templates.
const CV = c.CombatVariants;
let applied = 0;
CV.registerVariantResolver('probe', () => { applied++; });
CV.setTable({ active: { assist_scope: 'active_moves', variant_effect_type: 'probe' },
  shared: { assist_scope: 'both', variant_effect_type: 'probe' },
  retired: { assist_scope: 'parry', variant_effect_type: 'probe' } });
CV.applyToActiveContext({ attacker: { activeVariantIds: ['active', 'shared', 'retired'] } });
assert.equal(applied, 2);
assert.equal(CV.applyToParryContext, undefined);
assert.equal(IE.getParryVariantIdsForLimb, undefined);
console.log('Parry variant retirement: migration, round-trip and active variants passed.');
