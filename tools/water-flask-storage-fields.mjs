// Validated overlays for the registered flasks; do not load the broader design draft.
export function applyWaterFlaskStorage(items, source) {
  if (source?.schema_version !== 1 || !source.items) throw new Error('Invalid water-flask storage catalogue');
  const fields = ['flask_capacity', 'flask_initial_water', 'flask_water_weight_kg', 'flask_source_multiplier'];
  for (const [id, profile] of Object.entries(source.items)) {
    if (!items[id]) throw new Error(`Unknown water flask: ${id}`);
    if (!profile || Object.keys(profile).some(key => !fields.includes(key))) throw new Error(`${id}: unknown storage field`);
    for (const field of fields) {
      const value = profile[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${id}.${field}: invalid number`);
    }
    if (profile.flask_capacity <= 0 || profile.flask_source_multiplier <= 0 || profile.flask_initial_water !== 0) {
      throw new Error(`${id}: capacity/multiplier must be positive; new flasks must be empty`);
    }
    Object.assign(items[id], profile, { info_module_set_id: 'module.water_flask_storage' });
  }
}

export function applyWaterFlaskUse(items, source) {
  if (source?.schema_version !== 1 || !source.items) throw new Error('Invalid water-flask use catalogue');
  const fields = ['flask_drink_cost', 'flask_drink_ticks', 'flask_effects'];
  for (const [id, profile] of Object.entries(source.items)) {
    if (!items[id]?.flask_capacity) throw new Error(`Unknown water flask: ${id}`);
    if (!profile || Object.keys(profile).some(key => !fields.includes(key))
      || !Number.isFinite(profile.flask_drink_cost) || profile.flask_drink_cost <= 0 || profile.flask_drink_cost > items[id].flask_capacity
      || !Number.isInteger(profile.flask_drink_ticks) || profile.flask_drink_ticks < 1 || profile.flask_drink_ticks > 12
      || !Array.isArray(profile.flask_effects) || !profile.flask_effects.length
      || profile.flask_effects.some(effect => !effect || effect.target !== 'thirst' || effect.timing !== 'instant'
        || effect.duration_ticks !== 0 || !Number.isFinite(effect.total) || effect.total <= 0
        || Object.keys(effect).some(key => !['target', 'total', 'timing', 'duration_ticks'].includes(key)))) {
      throw new Error(`${id}: invalid or unsupported flask use profile`);
    }
    Object.assign(items[id], profile, { equip_slot: 'water_flask', pocketable: true });
  }
}
