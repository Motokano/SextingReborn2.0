/** Shared build-time contract for the modular item catalogue (k278 / design 63). */
export const ITEM_ATTRIBUTE_SCHEMA_VERSION = 2;

export const CATEGORY_GROUP_FIELDS = {
  base: {
    identity: ['name', 'name_0', 'name_1', 'name_2', 'sn', 'placeholder_name', 'fn_before', 'fn', 'desc', 'desc_0', 'desc_1', 'desc_2', 'display_skill_id'],
    stacking: ['stack_limit', 'stack_max', 'pocketable'],
    trade: ['base_value', 'price_class', 'volatility', 'region_restrict'],
    currency: ['accept_code', 'convert_to_high', 'usable_regions'],
    spoilage: ['spoilage_ticks'],
    presentation: ['info_module_set_id'],
    provenance: ['source', 'production_lines']
  },
  food: {
    edible: ['edible', 'edible_buff_id', 'food_profile', 'meal_tier', 'satiety_total', 'digestion_ticks', 'food_buff_duration_ticks', 'meal_composition', 'workhorse', 'food_thirst_instant', 'food_special_ticks', 'food_composition_text', 'food_experience_text', 'food_special_text'],
    packing: ['slots_taken']
  },
  production: {
    cooking: ['cooking_ingredient'],
    fuel: ['fuel_points'],
    water: ['water_points'],
    pharmacy: ['pharmacy_ingredient', 'chem_class', 'pharm_family', 'pharm_effect', 'pharm_toxicity', 'concentration_cost', 'adjuvant_strength', 'pharmacy_active_components'],
    compost: ['fert_c', 'fert_n', 'compost_inoculant_aerobic', 'compost_inoculant_anaerobic'],
    fertilizer: ['inject_facility', 'agriculture_venturi_injectable', 'agriculture_buried_jar_injectable', 'agriculture_nutrient_per_bottle', 'is_anaerobic_fertilizer'],
    soil: ['grants_soil_id'],
    seed: ['harvest_item_id', 'seed_tier']
  },
  medicine: {
    use: ['usable', 'use_action', 'use_buff_id', 'use_charges', 'use_effect'],
    compound: ['pharmacy_compound', 'concentration_capacity'],
    effects: ['pharmacy_addiction_gain', 'pharmacy_relief_stages', 'pharmacy_oral_toxicity', 'pharmacy_extra_toxicity_decay', 'pharmacy_legacy']
  },
  equipment: {
    wearable: ['equip_slot', 'req_innate_jingu'],
    combat: ['weapon_attack_power', 'attack_power', 'skill_coef', 'form_coefs', 'limb_tags', 'parry_coef', 'speed_coef', 'move_cost_mod', 'damage_type_effects'],
    fishing_tackle: ['fishing_load_rating','fishing_length_dm','fishing_cast_range_dm'],
    armor: ['damage_reduce_blunt_pct', 'damage_reduce_pierce_pct', 'damage_reduce_slash_pct', 'base_shield'],
    effects: ['activation_cost_pct', 'effects', 'segments', 'special', 'special_effect'],
    enchantment: ['enchant_slot', 'enchant_slots']
  },
  structure: {
    storage: ['pocket_slots', 'vest_slots', 'backpack_slots', 'backpack_weight_factor'],
    host: ['module_slots'],
    attachment: ['install_slots', 'occupies', 'max_per_armor'],
    assembly_host: ['assembly_slots'],
    assembly_part: ['assembly_types']
  },
  energy: {
    storage: ['battery_capacity', 'battery_charge']
  },
  organism: {}
};

const ROOT_FIELDS = new Set(['item_id', 'id', 'editor_name', 'category', 'sub_category', 'tags', 'weight_kg', 'material']);
const RETIRED_FIELDS = new Set(['quality', '_special_reserved']);
const FIELD_OWNER = new Map();
for (const [category, groups] of Object.entries(CATEGORY_GROUP_FIELDS)) {
  for (const [group, fields] of Object.entries(groups)) {
    for (const field of fields) {
      if (FIELD_OWNER.has(field)) throw new Error('Duplicate modular field owner: ' + field);
      FIELD_OWNER.set(field, { category, group });
    }
  }
}

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clone = value => JSON.parse(JSON.stringify(value));
const isMeaningful = value => value !== undefined && value !== null && value !== '';

function shouldIncludeGroup(category, group, values) {
  if (category === 'base' && group === 'identity') return true;
  if (category === 'base' && group === 'stacking') return true;
  if (category === 'base' && group === 'spoilage') return Number(values.spoilage_ticks) > 0;
  if (category === 'food' && group === 'edible') return values.edible === true || Object.keys(values).some(k => k !== 'edible');
  if (category === 'production' && group === 'cooking') return values.cooking_ingredient === true;
  if (category === 'production' && group === 'fuel') return Number(values.fuel_points) > 0;
  if (category === 'production' && group === 'water') return Number(values.water_points) > 0;
  if (category === 'production' && group === 'pharmacy') return values.pharmacy_ingredient === true || Object.keys(values).some(k => k !== 'pharmacy_ingredient');
  if (category === 'medicine' && group === 'use') return values.usable === true || !!values.use_action || !!values.use_buff_id || !!values.use_effect || Number(values.use_charges) > 0;
  if (category === 'medicine' && group === 'compound') return values.pharmacy_compound === true || Number(values.concentration_capacity) > 0;
  if (category === 'energy' && group === 'storage') return Number(values.battery_capacity) > 0;
  return Object.keys(values).length > 0;
}

export function buildModularItem(template) {
  if (!template || typeof template !== 'object') throw new Error('Item template must be an object');
  const itemId = String(template.item_id || template.id || '').trim();
  if (!itemId) throw new Error('Item template is missing item_id/id');
  const out = {
    item_id: itemId,
    editor_name: String(template.sn || template.name || template.name_0 || itemId),
    weight_kg: Number(template.weight_kg) || 0,
    attribute_modules: {}
  };
  if (template.id != null) out.id = itemId;
  for (const field of ['category', 'sub_category', 'tags', 'material']) if (isMeaningful(template[field])) out[field] = clone(template[field]);
  const seen = new Set([...ROOT_FIELDS, ...RETIRED_FIELDS]);
  for (const [category, groups] of Object.entries(CATEGORY_GROUP_FIELDS)) {
    const categoryValue = {};
    for (const [group, fields] of Object.entries(groups)) {
      const values = {};
      for (const field of fields) {
        seen.add(field);
        if (own(template, field) && isMeaningful(template[field])) values[field] = clone(template[field]);
      }
      if (shouldIncludeGroup(category, group, values)) categoryValue[group] = values;
    }
    if (Object.keys(categoryValue).length) out.attribute_modules[category] = categoryValue;
  }
  const unknown = Object.keys(template).filter(field => !seen.has(field));
  if (unknown.length) throw new Error(itemId + ': unclassified item fields: ' + unknown.join(', '));
  return out;
}

export function buildModularCatalog(items) {
  const out = { schema_version: ITEM_ATTRIBUTE_SCHEMA_VERSION, items: {} };
  for (const id of Object.keys(items).sort()) {
    if (id.charAt(0) === '_' || !items[id] || typeof items[id] !== 'object' || Array.isArray(items[id])) continue;
    out.items[id] = buildModularItem(items[id]);
  }
  return out;
}

export function hydrateModularItem(item) {
  if (!item || typeof item !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(item)) if (key !== 'attribute_modules' && key !== 'editor_name') out[key] = clone(value);
  out.item_id = String(item.item_id || item.id || '');
  const modules = item.attribute_modules && typeof item.attribute_modules === 'object' ? item.attribute_modules : {};
  for (const groups of Object.values(modules)) {
    if (!groups || typeof groups !== 'object') continue;
    for (const values of Object.values(groups)) {
      if (!values || typeof values !== 'object') continue;
      for (const [field, value] of Object.entries(values)) out[field] = clone(value);
    }
  }
  out.attribute_modules = clone(modules);
  return out;
}

export function hydrateModularCatalog(catalog) {
  if (!catalog || Number(catalog.schema_version) !== ITEM_ATTRIBUTE_SCHEMA_VERSION || !catalog.items) throw new Error('Invalid modular item catalogue');
  const out = {};
  for (const [id, item] of Object.entries(catalog.items)) out[id] = hydrateModularItem(item);
  return out;
}

export function buildModuleDefinitionsDocument() {
  return {
    schema_version: ITEM_ATTRIBUTE_SCHEMA_VERSION,
    categories: Object.fromEntries(Object.entries(CATEGORY_GROUP_FIELDS).map(([category, groups]) => [category, {
      groups: Object.fromEntries(Object.entries(groups).map(([group, fields]) => [group, { fields }]))
    }])),
    instance_state: {
      energy: { storage: { charge: { type: 'integer', min: 0, template_capacity_field: 'battery_capacity', template_initial_field: 'battery_charge' } } },
      base: { spoilage: { elapsed_ticks: { type: 'integer', min: 0, template_duration_field: 'spoilage_ticks' } } },
      equipment: { fishing_tackle: {
        wear_stage: { type: 'integer', min: 0, max: 2, instance_field: 'fishing_wear_stage' },
        broken: { type: 'boolean', instance_field: 'fishing_broken' }
      } }
    }
  };
}
