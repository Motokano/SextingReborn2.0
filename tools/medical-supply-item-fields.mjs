/** Medical supply catalogue and its formal part-injury Buff bindings. */
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const clone = value => JSON.parse(JSON.stringify(value));
const assert = (condition, message) => { if (!condition) throw new Error('medical-supplies: ' + message); };
const definitions = {
  supply_medical_tourniquet: ['止血带', 'tourniquet', 'heavy_bleeding'],
  supply_medical_hemostatic_gauze: ['止血纱布', 'hemostatic_gauze', 'bleeding'],
  supply_medical_trauma_dressing: ['创伤敷料', 'trauma_dressing', null],
  supply_medical_fracture_band: ['骨折带', 'fracture_band', 'fracture'],
  supply_medical_alcohol: ['酒精', 'medical_alcohol', 'wound_infection']
};
const injuryNames = { heavy_bleeding: '大出血', bleeding: '普通出血', fracture: '骨折', wound_infection: '伤口感染' };
const injuryGroups = { heavy_bleeding: 'bleeding', bleeding: 'bleeding', fracture: 'fracture', wound_infection: 'wound_infection' };
const limbs = ['lhand', 'rhand', 'lfoot', 'rfoot'];
const allParts = ['head', 'chest', 'belly', ...limbs];
const forbiddenFields = ['use_effect', 'use_buff_id', 'use_action', 'use_charges', 'edible_buff_id', 'food_profile',
  'pharmacy_compound', 'pharmacy_ingredient', 'cooking_ingredient', 'production_lines',
  'equip_slot', 'backpack_slots', 'medical_supply_profile'];

function fields(value, keys, at) {
  assert(value && typeof value === 'object' && !Array.isArray(value), at + ': expected object');
  assert(Object.keys(value).length === keys.length && keys.every(key => own(value, key)), at + ': missing or unknown fields');
}

export function applyMedicalSupplies(items, source) {
  fields(source, ['schema_version', 'implementation', 'injury_category', 'injury_types', 'injury_uniqueness_rule', 'target_rule', 'standalone_rule', 'kit_use_rule', 'acquisition_rule', 'expiry_rule', 'items', 'pending_values'], 'source');
  assert(source.schema_version === 2 && source.implementation === 'runtime', 'unsupported schema or implementation');
  assert(source.injury_category === 'injury', 'expected injury category');
  fields(source.injury_types, Object.keys(injuryNames), 'injury_types');
  for (const [type, name] of Object.entries(injuryNames)) {
    fields(source.injury_types[type], ['name', 'group', 'buff_ids'], type);
    assert(source.injury_types[type].name === name && JSON.stringify(source.injury_types[type].buff_ids) === JSON.stringify(['injury_'+type]), type + ': invalid runtime Buff binding');
    assert(source.injury_types[type].group === injuryGroups[type], type + ': incorrect injury uniqueness group');
  }
  fields(source.injury_uniqueness_rule, ['scope', 'max_active'], 'injury_uniqueness_rule');
  assert(source.injury_uniqueness_rule.scope === 'body_part_and_injury_group'
    && source.injury_uniqueness_rule.max_active === 1, 'one active injury per type group on each body part');
  const target = source.target_rule;
  fields(target, ['actor', 'selection', 'injury_check_scope'], 'target_rule');
  assert(target.actor === 'player' && target.selection === 'single_body_part' && target.injury_check_scope === 'selected_body_part', 'treat and check only the selected player body part');
  fields(source.standalone_rule, ['consume_portions', 'consume_whole_portion', 'use_ticks', 'use_stamina', 'skill_requirement', 'packaging_after_use'], 'standalone_rule');
  assert(source.standalone_rule.consume_portions === 1 && source.standalone_rule.consume_whole_portion === true, 'standalone use consumes one whole portion');
  assert(source.standalone_rule.use_ticks === 1 && source.standalone_rule.use_stamina === 0
    && source.standalone_rule.skill_requirement === 'none', 'standalone use takes one tick, no extra stamina or skill gate');
  assert(source.standalone_rule.packaging_after_use === 'discard_no_return', 'packaging return is not configured');
  const acquisition = source.acquisition_rule;
  fields(acquisition, ['sources', 'crafting', 'placement'], 'acquisition_rule');
  assert(Array.isArray(acquisition.sources) && acquisition.sources.join(';') === 'buy;dungeon;craft', 'expected purchase, exploration and future crafting sources');
  assert(acquisition.crafting === 'medical_production' && acquisition.placement === 'dungeon_medical_pool', 'medical crafting and exploration placement');
  const expiry = source.expiry_rule;
  fields(expiry, ['mode'], 'expiry_rule');
  assert(expiry.mode === 'never', 'all five supplies never expire');
  const kit = source.kit_use_rule;
  fields(kit, ['implementation', 'storage', 'more_uses_per_portion', 'consumption_multiplier'], 'kit_use_rule');
  assert(kit.implementation === 'runtime' && kit.storage === 'separate_item_types' && kit.more_uses_per_portion === true && kit.consumption_multiplier === null, 'kit consumption is owned by the medical-kit catalogue');
  fields(source.pending_values, [], 'pending_values');
  fields(source.items, Object.keys(definitions), 'items');

  const profiles = new Map();
  for (const [id, [name, type, injury]] of Object.entries(definitions)) {
    const spec = source.items[id], item = items[id];
    fields(spec, ['name', 'supply_type', 'standalone_effect', 'inventory', 'trade', 'portion', 'shelf_life', 'allowed_body_parts'], id);
    assert(spec.name === name && spec.supply_type === type, id + ': incorrect supply identity');
    assert(item && item.item_id === id && item.name === name && item.category === 'supply' && item.sub_category === type, id + ': missing or misclassified item');
    assert(item.edible === false && typeof item.usable === 'boolean', id + ': medical supplies must not be food');
    assert(typeof item.placeholder_name === 'string' && item.placeholder_name.length > 0
      && typeof item.fn_before === 'string' && item.fn_before.length > 0
      && typeof item.fn === 'string' && item.fn.length > 0, id + ': missing recognition text');
    assert(item.tags === 'consumable;medical_supply', id + ': incorrect tags');
    for (const key of forbiddenFields) assert(!own(item, key), id + ': unexpected runtime/source field ' + key);
    fields(spec.inventory, ['weight_kg', 'stack_limit'], id + ' inventory');
    assert(Number.isFinite(spec.inventory.weight_kg) && spec.inventory.weight_kg > 0
      && spec.inventory.stack_limit === 1, id + ': positive packed weight and one portion per stack required');
    fields(spec.trade, ['base_value', 'price_class', 'volatility', 'region_restrict'], id + ' trade');
    assert(Number.isFinite(spec.trade.base_value) && spec.trade.base_value > 0
      && spec.trade.price_class === 'life_good' && spec.trade.volatility === 'low'
      && spec.trade.region_restrict === 0, id + ': invalid trade data');
    for (const [key, value] of Object.entries({ ...spec.inventory, ...spec.trade })) {
      assert(item[key] === value, id + ': CSV and medical specification disagree on ' + key);
    }
    assert(item.source === acquisition.sources.join(';'), id + ': incorrect acquisition metadata');
    const allowed = type === 'tourniquet' || type === 'fracture_band' ? limbs : allParts;
    assert(Array.isArray(spec.allowed_body_parts) && JSON.stringify(spec.allowed_body_parts) === JSON.stringify(allowed), id + ': incorrect body-part restrictions');
    const portion = spec.portion;
    fields(portion, ['description', 'materials', 'size', 'weight_basis', 'weight_note'], id + ' portion');
    assert(typeof portion.description === 'string' && portion.description.length > 0
      && Array.isArray(portion.materials) && portion.materials.length > 0 && portion.materials.every(x => typeof x === 'string' && x.length > 0)
      && ['manufacturer_rounded', 'estimated_with_packaging'].includes(portion.weight_basis)
      && typeof portion.weight_note === 'string' && portion.weight_note.length > 0, id + ': incomplete physical specification');
    const sizeKeys = {
      tourniquet: ['length_cm', 'width_cm'],
      hemostatic_gauze: ['length_cm', 'width_cm', 'plies'],
      trauma_dressing: ['length_cm', 'width_cm'],
      fracture_band: ['splint_length_cm', 'splint_width_cm', 'wrap_count', 'wrap_width_cm', 'wrap_length_cm'],
      medical_alcohol: ['volume_ml', 'ethanol_percent_vv']
    };
    fields(portion.size, sizeKeys[type], id + ' size');
    assert(Object.values(portion.size).every(value => Number.isFinite(value) && value > 0), id + ': dimensions must be positive numbers');
    if (type === 'medical_alcohol') assert(portion.size.volume_ml === 30 && portion.size.ethanol_percent_vv === 75, id + ': expected 30 ml of 75% ethanol');
    const shelf = spec.shelf_life;
    fields(shelf, ['policy', 'basis'], id + ' shelf_life');
    assert(shelf.policy === 'never' && shelf.basis === 'user_design', id + ': shelf life must follow the user-confirmed no-expiry rule');
    assert(item.spoilage_ticks === 0, id + ': supplies must never expire');
    const effect = spec.standalone_effect;
    if (injury) {
      fields(effect, ['kind', 'injury_type', 'destroy_recovery_points'], id + ' effect');
      assert(effect.kind === 'remove_injury' && effect.injury_type === injury && effect.destroy_recovery_points === 0, id + ': must remove only its corresponding injury without destroy recovery');
    } else {
      fields(effect, ['kind', 'amount', 'unit', 'requires_no_injury_buffs', 'minimum_destroy_ratio', 'limit_basis', 'partial_recovery_consumes_whole_portion', 'rounding'], id + ' effect');
      assert(effect.kind === 'recover_destroy' && effect.amount === 30 && effect.unit === 'destroy_points', id + ': dressing restores 30 fixed destroy points');
      assert(effect.requires_no_injury_buffs === true && effect.minimum_destroy_ratio === 0.3
        && effect.limit_basis === 'current_body_part_destroy_max' && effect.partial_recovery_consumes_whole_portion === true
        && effect.rounding === 'ceil', id + ': incorrect recovery eligibility, floor or consumption');
    }
    profiles.set(id, {
      schema_version: source.schema_version,
      implementation: source.implementation,
      supply_type: type,
      injury_category: source.injury_category,
      injury_types: clone(source.injury_types),
      injury_uniqueness: clone(source.injury_uniqueness_rule),
      target: clone(target),
      standalone: { ...clone(source.standalone_rule), effect: clone(effect) },
      kit_use: clone(kit),
      allowed_body_parts: clone(spec.allowed_body_parts),
      physical_portion_size: clone(portion),
      shelf_life: { ...clone(shelf), activation: expiry.mode },
      acquisition: clone(acquisition),
      pending_values: clone(source.pending_values)
    });
  }
  for (const [id, item] of Object.entries(items)) {
    if (id.startsWith('supply_medical_') || own(item, 'medical_supply_profile')) assert(profiles.has(id), 'unconfigured supply: ' + id);
  }
  // Validate every entry before changing any item, so a broken fifth item cannot partially publish the first four.
  for (const [id, profile] of profiles) { items[id].medical_supply_profile = profile; items[id].usable = true; }
}
