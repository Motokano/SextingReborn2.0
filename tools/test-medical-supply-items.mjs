import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { applyMedicalSupplies } from './medical-supply-item-fields.mjs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const json = file => JSON.parse(read(file));
const source = json('data/medical-supplies.json');
const legacy = json('data/items.json');
const catalog = json('data/item-catalog-v2.json');
const expected = {
  supply_medical_tourniquet: ['止血带', 'tourniquet', 'heavy_bleeding'],
  supply_medical_hemostatic_gauze: ['止血纱布', 'hemostatic_gauze', 'bleeding'],
  supply_medical_trauma_dressing: ['创伤敷料', 'trauma_dressing', null],
  supply_medical_fracture_band: ['骨折带', 'fracture_band', 'fracture'],
  supply_medical_alcohol: ['酒精', 'medical_alcohol', 'wound_infection']
};
const ids = Object.keys(expected);
const expectedPhysical = {
  supply_medical_tourniquet: [0.08, 1400],
  supply_medical_hemostatic_gauze: [0.035, 160],
  supply_medical_trauma_dressing: [0.075, 360],
  supply_medical_fracture_band: [0.16, 1000],
  supply_medical_alcohol: [0.04, 80]
};
const bare = () => Object.fromEntries(ids.map(id => {
  const item = structuredClone(legacy[id]);
  delete item.medical_supply_profile;
  return [id, item];
}));

test('five separate supplies reach both catalogues with whole-portion, selected-part treatment contracts', () => {
  assert.deepEqual(Object.keys(source.items).sort(), ids.slice().sort());
  assert.deepEqual(Object.keys(legacy).filter(id => id.startsWith('supply_medical_')).sort(), ids.slice().sort());
  const items = bare();
  applyMedicalSupplies(items, source);
  for (const [id, [name, type, injury]] of Object.entries(expected)) {
    const item = legacy[id], p = item.medical_supply_profile;
    assert.deepEqual(items[id], item, 'stale generated item: ' + id);
    assert.equal(item.name, name);
    assert.equal(item.category, 'supply');
    assert.equal(item.sub_category, type);
    assert.equal(p.supply_type, type);
    assert.equal(p.standalone.consume_portions, 1);
    assert.equal(p.standalone.consume_whole_portion, true);
    assert.deepEqual(p.target, { actor: 'player', selection: 'single_body_part', injury_check_scope: 'selected_body_part' });
    assert.deepEqual(p.injury_uniqueness, { scope: 'body_part_and_injury_group', max_active: 1 });
    assert.deepEqual(source.injury_uniqueness_rule, p.injury_uniqueness);
    assert.deepEqual(Object.fromEntries(Object.entries(p.injury_types).map(([type, injury]) => [type, injury.group])), {
      heavy_bleeding: 'bleeding', bleeding: 'bleeding', fracture: 'fracture', wound_infection: 'wound_infection'
    }, 'ordinary and heavy bleeding share one local group; fracture and infection have separate groups');
    if (injury) assert.deepEqual(p.standalone.effect, { kind: 'remove_injury', injury_type: injury, destroy_recovery_points: 0 });
    assert.deepEqual(catalog.items[id].attribute_modules.medicine.medical_supply.medical_supply_profile, p);
  }
  assert.equal(legacy.supply_bandage_cloth.name, '布制绷带', 'existing bandage is a distinct item');
  assert.ok(!legacy.supply_bandage_cloth.medical_supply_profile, 'do not silently convert the old bandage');
});

test('dressing data encodes fixed 30 points, a rounded-up dynamic 30% floor, local injury exclusion and full consumption at the floor', () => {
  const effect = legacy.supply_medical_trauma_dressing.medical_supply_profile.standalone.effect;
  assert.deepEqual(effect, {
    kind: 'recover_destroy', amount: 30, unit: 'destroy_points', requires_no_injury_buffs: true,
    minimum_destroy_ratio: 0.3, limit_basis: 'current_body_part_destroy_max',
    partial_recovery_consumes_whole_portion: true, rounding: 'ceil'
  });
  // This is a data contract test, not a copied treatment algorithm or a claim of runtime healing.
  assert.ok(!('injury_type' in effect), 'dressing must not clear injuries');
});

test('researched physical data, approved single stacks and trade values reach both catalogues with permanent no-expiry rules', () => {
  const [header, ...lines] = read('data/items/medical_supplies_base.csv').trim().split(/\r?\n/).map(line => line.split(','));
  assert.equal(lines.length, 5);
  for (const row of lines) {
    assert.equal(row.length, header.length, 'CSV column alignment');
    const [weight, value] = expectedPhysical[row[0]];
    const columns = { weight, stack_limit: 1, source: 'buy;dungeon;craft', spoilage_ticks: 0,
      base_value: value, price_class: 'life_good', volatility: 'low', region_restrict: 0 };
    for (const [column, expected] of Object.entries(columns)) assert.equal(row[header.indexOf(column)], String(expected), row[0] + ': ' + column);
    assert.equal(row[header.indexOf('production_lines')], '', 'crafting route waits for recipe design');
  }
  for (const id of ids) {
    const item = legacy[id], p = item.medical_supply_profile;
    const [weight, value] = expectedPhysical[id];
    assert.equal(item.weight_kg, weight);
    assert.equal(item.stack_limit, 1);
    assert.equal(item.base_value, value);
    assert.equal(catalog.items[id].weight_kg, weight);
    assert.equal(catalog.items[id].attribute_modules.base.stacking.stack_limit, 1);
    assert.equal(catalog.items[id].attribute_modules.base.trade.base_value, value);
    assert.deepEqual(source.expiry_rule, { mode: 'never' });
    assert.deepEqual(source.items[id].shelf_life, { policy: 'never', basis: 'user_design' });
    assert.deepEqual(p.shelf_life, { policy: 'never', basis: 'user_design', activation: 'never' });
    assert.equal(item.spoilage_ticks, 0, 'all five supplies permanently have no expiration');
    assert.deepEqual(p.pending_values, {});
    assert.deepEqual(p.acquisition, { sources: ['buy', 'dungeon', 'craft'], crafting: 'medical_production', placement: 'dungeon_medical_pool' });
    assert.equal(p.standalone.use_ticks, 1);
    assert.equal(p.standalone.use_stamina, 0);
    assert.equal(p.standalone.skill_requirement, 'none');
    assert.equal(p.standalone.packaging_after_use, 'discard_no_return');
    assert.deepEqual(p.kit_use, { implementation: 'runtime', storage: 'separate_item_types', more_uses_per_portion: true, consumption_multiplier: null });
    assert.deepEqual(Object.keys(p.injury_types).sort(), ['bleeding', 'fracture', 'heavy_bleeding', 'wound_infection']);
    for (const [type, injury] of Object.entries(p.injury_types)) assert.deepEqual(injury.buff_ids, ['injury_'+type]);
    const limbOnly = id.endsWith('_tourniquet') || id.endsWith('_fracture_band');
    assert.deepEqual(p.allowed_body_parts, limbOnly ? ['lhand', 'rhand', 'lfoot', 'rfoot'] : ['head', 'chest', 'belly', 'lhand', 'rhand', 'lfoot', 'rfoot']);
  }
  assert.deepEqual(source.items.supply_medical_alcohol.portion.size, { volume_ml: 30, ethanol_percent_vv: 75 });
  assert.equal(source.items.supply_medical_fracture_band.portion.size.wrap_count, 1);
  assert.equal(source.items.supply_medical_hemostatic_gauze.portion.size.plies, 6);
});

test('registered medical actions remain separate from generic drugs and have dedicated production recipes', () => {
  for (const id of ids) {
    const item = legacy[id];
    assert.equal(item.edible, false);
    assert.equal(item.usable, true);
    assert.equal(item.medical_supply_profile.implementation, 'runtime');
    for (const key of ['use_action', 'use_charges', 'use_effect', 'use_buff_id', 'edible_buff_id', 'pharmacy_ingredient', 'pharmacy_compound', 'production_lines', 'equip_slot']) assert.ok(!(key in item), id + ': ' + key);
    assert.deepEqual(Object.keys(catalog.items[id].attribute_modules).sort(), ['base', 'medicine']);
    assert.deepEqual(Object.keys(catalog.items[id].attribute_modules.medicine).sort(), ['medical_supply','use']);
    assert.ok(json('data/medical-crafting.json').recipes.some(r=>r.item_id===id));
    const outputs=Object.values(json('data/recipes.json').recipes).filter(r=>r.main_output?.item_id===id);
    assert.deepEqual(outputs.map(r=>r.recipe_id),id==='supply_medical_alcohol'?['life_pharmacy.medical_alcohol']:[]);
  }
  assert.equal(json('data/item-field-display-rules.json').fields.medical_supply_profile.renderer, 'hidden');
});

test('real inventory preserves identities, recognition and dedicated medical action eligibility', () => {
  const g = vm.createContext({ console, Math, Date });
  g.window = g;
  g.UIText = { t: key => key };
  for (const file of ['js/item-attribute-modules.js', 'js/item-field-display-rules.js', 'js/inventory-equipment.js', 'js/item-use.js', 'js/dungeon/icons.js', 'js/dungeon/item-icons.js']) vm.runInContext(read(file), g, { filename: file });
  const I = g.InventoryEquipment;
  I.setConfig({ items: catalog, equipment: { test_pack: { item_id: 'test_pack', backpack_slots: 12, weight_kg: 0, backpack_weight_factor: 1 } }, modules: {}, default_equipment: {} });
  I.setState({ sewing_version: 2, equipment: { backpack: { item_id: 'test_pack', count: 1 } }, inventory_backpack: [] });
  for (const id of ids) assert.equal(I.putItemIntoDefaultContainer({ item_id: id, count: 1 }).placed, true);
  const before = JSON.stringify(I.getState());
  for (const id of ids) {
    const tpl = I.getItemTemplate(id);
    assert.equal(g.ItemUse.itemTemplateIsConsumable(tpl), true);
    assert.equal(g.ItemUse.isFoodTemplate(tpl), false);
    assert.equal(g.ItemAttributeModules.hasGroup(tpl, 'medicine', 'medical_supply'), true);
    assert.deepEqual(JSON.parse(JSON.stringify(g.ItemAttributeModules.getTemplateValue(tpl, 'medical_supply_profile'))), legacy[id].medical_supply_profile);
    assert.equal(g.ItemIcons.resolve(tpl), id === 'supply_medical_alcohol' ? 'reagent' : 'bandage');
    for (const part of legacy[id].medical_supply_profile.allowed_body_parts) assert.ok(g.ItemUse.BODY_PART_IDS.includes(part), 'must use a real game body-part key');
    for (const level of [0, 2, 5, 10]) {
      const character = { skills: { survival_language: { level } } };
      assert.equal(I.getDisplayName(tpl, 0, character), level < 5 ? legacy[id].placeholder_name : legacy[id].name);
      assert.equal(I.getDisplayDesc(tpl, 0, character), level < 2 ? '' : level < 10 ? legacy[id].fn_before : legacy[id].fn);
    }
  }
  assert.equal(JSON.stringify(I.getState()), before, 'reading data must not spend supplies or alter the inventory');
  const saved = JSON.parse(before);
  I.setState(saved);
  const after = I.getBackpackArray().filter(Boolean);
  assert.deepEqual(after.map(item => item.item_id).sort(), ids.slice().sort());
  assert.equal(new Set(after.map(item => item.instance_id)).size, 5, 'independent supply instances must not share an identity');
  for (const item of after) assert.equal(I.getItemCombinedWeight(item), expectedPhysical[item.item_id][0]);
  assert.ok(Math.abs(I.getCurrentCarryWeight() - 0.39) < 1e-9, 'five packed supplies weigh 390 g');
  for (const id of ids) assert.equal(I.putItemIntoDefaultContainer({ item_id: id, count: 1 }).placed, true);
  I.setState(JSON.parse(JSON.stringify(I.getState())));
  const doubles = I.getBackpackArray().filter(Boolean);
  assert.equal(doubles.length, 10, 'two of each supply occupy ten cells');
  assert.equal(new Set(doubles.map(item => item.instance_id)).size, 10);
  for (const item of doubles) assert.equal(item.count, 1, 'same supplies cannot merge into a multi-portion stack');
  assert.ok(Math.abs(I.getCurrentCarryWeight() - 0.78) < 1e-9);
});

test('malformed rules or a bad final item reject the whole catalogue update atomically', () => {
  const mutations = [
    s => { s.schema_version = 99; }, s => { s.implementation = 'active'; },
    s => { s.injury_category = 'food_special'; }, s => { s.injury_types.bleeding.buff_ids = ['invented_buff']; },
    s => { s.injury_types.burn = { name: '烧伤', buff_ids: null }; },
    s => { s.injury_types.heavy_bleeding.group = 'heavy_bleeding'; },
    s => { s.injury_types.fracture.group = 'bleeding'; },
    s => { s.injury_uniqueness_rule.scope = 'whole_body'; },
    s => { s.injury_uniqueness_rule.scope = 'body_part'; },
    s => { s.injury_uniqueness_rule.max_active = 2; },
    s => { s.pending_values.same_type_injury_multiplicity = null; },
    s => { s.target_rule.selection = 'all_body_parts'; }, s => { s.target_rule.injury_check_scope = 'whole_body'; },
    s => { s.standalone_rule.consume_portions = 0.5; }, s => { s.standalone_rule.consume_whole_portion = false; },
    s => { s.kit_use_rule.consumption_multiplier = 0.5; }, s => { s.kit_use_rule.storage = 'shared_medical_pool'; },
    s => { s.pending_values.weight_kg = 0; }, s => { s.pending_values.use_ticks = 1; },
    s => { s.standalone_rule.use_ticks = 2; }, s => { s.standalone_rule.use_stamina = 1; },
    s => { s.standalone_rule.skill_requirement = 'life_pharmacy'; },
    s => { s.standalone_rule.packaging_after_use = 'return_bottle'; },
    s => { s.acquisition_rule.crafting = 'enabled'; }, s => { s.expiry_rule.mode = 'existing_spoilage'; },
    s => { s.expiry_rule.mode = 'reference_only'; },
    s => { s.items.supply_medical_tourniquet.allowed_body_parts.push('head'); },
    s => { s.items.supply_medical_alcohol.portion.size.volume_ml = 100; },
    s => { s.items.supply_medical_alcohol.portion.size.ethanol_percent_vv = 95; },
    s => { s.items.supply_medical_alcohol.inventory.weight_kg = 0; },
    s => { s.items.supply_medical_alcohol.inventory.stack_limit = 2; },
    s => { s.items.supply_medical_alcohol.portion.size.container_uses = 3; },
    s => { s.items.supply_medical_alcohol.shelf_life.years = 2; },
    s => { s.items.supply_medical_alcohol.shelf_life.policy = 'fixed_sealed'; },
    s => { s.items.supply_medical_alcohol.standalone_effect.injury_type = 'bleeding'; },
    s => { s.items.supply_medical_tourniquet.standalone_effect.destroy_recovery_points = 30; },
    s => { s.items.supply_medical_trauma_dressing.standalone_effect.amount = '30'; },
    s => { s.items.supply_medical_trauma_dressing.standalone_effect.amount = 10; },
    s => { s.items.supply_medical_trauma_dressing.standalone_effect.unit = 'percent'; },
    s => { s.items.supply_medical_trauma_dressing.standalone_effect.requires_no_injury_buffs = false; },
    s => { s.items.supply_medical_trauma_dressing.standalone_effect.minimum_destroy_ratio = 0; },
    s => { s.items.supply_medical_trauma_dressing.standalone_effect.limit_basis = 'fixed_100'; },
    s => { s.items.supply_medical_trauma_dressing.standalone_effect.partial_recovery_consumes_whole_portion = false; },
    s => { s.items.supply_medical_trauma_dressing.standalone_effect.rounding = 'floor'; },
    s => { s.items.supply_medical_trauma_dressing.standalone_effect.rounding = null; },
    s => { delete s.items.supply_medical_alcohol; },
    s => { s.items.supply_medical_alcohol.remaining_uses = 5; }
  ];
  for (const mutate of mutations) {
    const broken = structuredClone(source), items = bare();
    mutate(broken);
    const before = JSON.stringify(items);
    assert.throws(() => applyMedicalSupplies(items, broken), /medical-supplies:/);
    assert.equal(JSON.stringify(items), before);
  }
  for (const mutate of [
    items => { delete items.supply_medical_alcohol; },
    items => { items.supply_medical_alcohol.name = '乙醇药剂'; },
    items => { items.supply_medical_alcohol.usable = 'invalid'; },
    items => { items.supply_medical_alcohol.use_effect = { thirst: 10 }; },
    items => { items.supply_medical_alcohol.weight_kg = 0.2; },
    items => { items.supply_medical_alcohol.stack_limit = 10; },
    items => { items.supply_medical_alcohol.base_value = 100; },
    items => { items.supply_medical_alcohol.spoilage_ticks = 103680; },
    items => { items.supply_medical_other = { item_id: 'supply_medical_other' }; }
  ]) {
    const items = bare();
    mutate(items);
    const before = JSON.stringify(items);
    assert.throws(() => applyMedicalSupplies(items, source), /medical-supplies:/);
    assert.equal(JSON.stringify(items), before);
  }
});
