/** Compile confirmed innate medicine rules into templates; no consumption or crafting runtime. */
const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
const clone = value => JSON.parse(JSON.stringify(value));
const attributes = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
const assert = (condition, message) => { if (!condition) throw new Error('innate-medicines: ' + message); };
function fields(value, keys, at) {
  assert(value && typeof value === 'object' && !Array.isArray(value), at + ': expected object');
  assert(Object.keys(value).length === keys.length && keys.every(key => own(value, key)), at + ': missing or unknown fields');
}
function positiveInteger(value, at) {
  assert(Number.isSafeInteger(value) && value > 0, at + ': expected positive integer');
}

export function applyInnateMedicines(items, source) {
  fields(source, ['schema_version', 'implementation', 'growth_rule', 'upgrade_rule', 'pending_values', 'families', 'tiers'], 'source');
  assert(source.schema_version === 1 && source.implementation === 'data_only', 'unsupported schema or implementation');
  const growth = source.growth_rule;
  fields(growth, ['attribute_gain', 'innate_cap', 'first_portions', 'counter_scope', 'count_on', 'count_failed_rolls', 'consumption_limit', 'after_first_portions', 'inherent_effects_on_every_portion'], 'growth_rule');
  for (const key of ['attribute_gain', 'innate_cap', 'first_portions']) positiveInteger(growth[key], key);
  assert(growth.counter_scope === 'character_family' && growth.count_on === 'consumed_portion' && growth.count_failed_rolls === true, 'count consumed portions per character and family, including failed rolls');
  assert(growth.consumption_limit === null && growth.after_first_portions === 'inherent_effects_only' && growth.inherent_effects_on_every_portion === true, 'later portions must remain usable for inherent effects');
  const upgrade = source.upgrade_rule;
  fields(upgrade, ['station', 'required_station_upgrades', 'mode', 'same_family', 'same_tier', 'min_inputs', 'max_inputs', 'output_count', 'probability', 'consume_inputs_on_failure', 'counts_as_consumption', 'ordinary_success_modifiers', 'craftable_from_raw'], 'upgrade_rule');
  assert(upgrade.station === 'pharmacy' && upgrade.mode === 'adjacent_tier' && upgrade.same_family === true && upgrade.same_tier === true, 'upgrade requires the same family and tier at the pharmacy');
  assert(upgrade.required_station_upgrades === 1, 'medicine upgrades require the first pharmacy station upgrade');
  for (const key of ['min_inputs', 'max_inputs', 'output_count']) positiveInteger(upgrade[key], key);
  assert(upgrade.min_inputs <= upgrade.max_inputs, 'invalid input range');
  fields(upgrade.probability, ['formula', 'denominator', 'exponent', 'skill_multiplier', 'cap'], 'upgrade probability');
  assert(upgrade.probability.formula === 'power' && upgrade.probability.denominator === upgrade.max_inputs && Number.isFinite(upgrade.probability.exponent) && upgrade.probability.exponent > 1, 'upgrade must be nonlinear with maximum input guaranteed');
  const skill = upgrade.probability.skill_multiplier;
  fields(skill, ['skill_id', 'bonus_per_level', 'max_level'], 'upgrade skill multiplier');
  assert(skill.skill_id === 'life_pharmacy', 'upgrade multiplier must use the pharmacy skill');
  assert(Number.isFinite(skill.bonus_per_level) && skill.bonus_per_level > 0, 'invalid relative probability bonus per level');
  positiveInteger(skill.max_level, 'upgrade skill max level');
  assert(upgrade.probability.cap === 1, 'upgrade probability must cap at 100%');
  // P = min(cap, (N / denominator)^exponent * (1 + clamp(L, 0, max_level) * bonus_per_level)).
  // This dedicated multiplier does not enable ordinary pharmacy modifiers or level-100 auto-success.
  assert(upgrade.consume_inputs_on_failure === true && upgrade.counts_as_consumption === false && upgrade.ordinary_success_modifiers === false && upgrade.craftable_from_raw === false, 'invalid upgrade consumption or crafting rules');
  fields(source.pending_values, ['inherent_effects', 'weight_kg', 'base_value', 'spoilage_ticks', 'acquisition', 'upgrade_equipment', 'upgrade_ticks', 'upgrade_stamina', 'upgrade_experience', 'upgrade_equipment_wear', 'upgrade_failure_byproduct'], 'pending_values');
  assert(Object.values(source.pending_values).every(value => value === null), 'unconfirmed values must remain null');
  fields(source.families, attributes, 'families');
  assert(Array.isArray(source.tiers) && source.tiers.length === 4, 'expected four tiers');
  const prefixes = new Set();
  source.tiers.forEach((tier, index) => {
    fields(tier, ['id', 'prefix', 'success_probability'], 'tier');
    assert(tier.id === 't' + (index + 1), 'tier IDs must be t1 through t4 in order');
    assert(typeof tier.prefix === 'string' && tier.prefix.trim() === tier.prefix && tier.prefix.length > 0 && !prefixes.has(tier.prefix), 'invalid or duplicate tier prefix');
    prefixes.add(tier.prefix);
    assert(Number.isFinite(tier.success_probability) && tier.success_probability > 0 && tier.success_probability <= 1, 'invalid growth probability');
    if (index) assert(tier.success_probability > source.tiers[index - 1].success_probability, 'growth probabilities must increase');
  });
  assert(source.tiers[3].success_probability === 1, 'last tier must have guaranteed growth when eligible');

  const pending = new Map();
  const names = new Set();
  for (const [familyId, family] of Object.entries(source.families)) {
    fields(family, ['name', 'attribute'], familyId);
    assert(family.attribute === familyId && typeof family.name === 'string' && family.name.trim() === family.name && family.name.length > 0 && !names.has(family.name), 'invalid family identity: ' + familyId);
    names.add(family.name);
    source.tiers.forEach((tier, index) => {
      const id = `potion_innate_${familyId}_${tier.id}`;
      const item = items[id];
      assert(item && item.item_id === id && item.category === 'potion' && item.sub_category === 'innate_medicine', 'missing or misclassified item: ' + id);
      assert(item.name === tier.prefix + family.name && item.stack_limit === 100, 'incorrect name or stack limit: ' + id);
      assert(item.edible === false && item.usable === false, 'catalogue-only medicine must not be food or usable: ' + id);
      for (const key of ['use_effect', 'use_buff_id', 'use_action', 'edible_buff_id', 'food_profile', 'pharmacy_compound', 'pharmacy_ingredient', 'cooking_ingredient', 'source', 'production_lines', 'base_value', 'innate_medicine_profile']) {
        assert(!own(item, key), 'unexpected runtime/source field ' + key + ' on ' + id);
      }
      // Existing catalogue contract requires numeric weight/spoilage defaults; these are not approved values.
      assert(item.weight_kg === 0 && item.spoilage_ticks === 0, 'unconfirmed physical values must keep build defaults: ' + id);
      pending.set(id, {
        schema_version: source.schema_version,
        implementation: source.implementation,
        family_id: familyId,
        attribute: family.attribute,
        tier_id: tier.id,
        success_probability: tier.success_probability,
        counter_key: 'innate_medicine:' + familyId,
        growth: clone(growth),
        upgrade: { ...clone(upgrade), next_item_id: index < 3 ? `potion_innate_${familyId}_${source.tiers[index + 1].id}` : null },
        pending_values: clone(source.pending_values)
      });
    });
  }
  for (const [id, item] of Object.entries(items)) {
    if (item.sub_category === 'innate_medicine' || id.startsWith('potion_innate_') || own(item, 'innate_medicine_profile')) {
      assert(pending.has(id), 'unconfigured medicine: ' + id);
    }
  }
  // Reject the complete source before mutating any item.
  for (const [id, profile] of pending) items[id].innate_medicine_profile = profile;
}
