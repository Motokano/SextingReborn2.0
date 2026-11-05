import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { applyInnateMedicines } from './innate-medicine-item-fields.mjs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const json = file => JSON.parse(read(file));
const source = json('data/innate-medicines.json');
const legacy = json('data/items.json');
const catalog = json('data/item-catalog-v2.json');
const expected = { jingu: '剥剥星', flexibility: '达达糖', breath: '毛毛虫', dexterity: '咪咪脆', focus: '杏球杯' };
const prefixes = ['通常版', '初回版', '完全生产限定版', '初回限定生产版'];
const chances = [0.7, 0.8, 0.9, 1];
const ids = Object.keys(legacy).filter(id => id.startsWith('potion_innate_'));
const bare = () => Object.fromEntries(ids.map(id => {
  const item = structuredClone(legacy[id]);
  delete item.innate_medicine_profile;
  return [id, item];
}));

test('all 20 medicines reach both catalogues with shared first-ten growth and upgrade contracts', () => {
  assert.equal(ids.length, 20);
  const items = bare();
  applyInnateMedicines(items, source);
  const counters = new Set();
  for (const [attribute, name] of Object.entries(expected)) {
    const familyCounters = new Set();
    for (let tier = 1; tier <= 4; tier++) {
      const id = `potion_innate_${attribute}_t${tier}`;
      const item = legacy[id], profile = item.innate_medicine_profile;
      assert.deepEqual(items[id], item, 'stale built item: ' + id);
      assert.equal(item.name, prefixes[tier - 1] + name);
      assert.equal(item.category, 'potion');
      assert.equal(item.stack_limit, 100);
      assert.equal(profile.attribute, attribute);
      assert.equal(profile.success_probability, chances[tier - 1]);
      assert.equal(profile.growth.attribute_gain, 1);
      assert.equal(profile.growth.innate_cap, 40);
      assert.equal(profile.growth.first_portions, 10);
      assert.equal(profile.growth.counter_scope, 'character_family');
      assert.equal(profile.growth.count_on, 'consumed_portion');
      assert.equal(profile.growth.count_failed_rolls, true);
      assert.equal(profile.growth.consumption_limit, null, 'ten is not a consumption limit');
      assert.equal(profile.growth.after_first_portions, 'inherent_effects_only');
      assert.equal(profile.growth.inherent_effects_on_every_portion, true);
      assert.equal(profile.upgrade.next_item_id, tier < 4 ? `potion_innate_${attribute}_t${tier + 1}` : null);
      assert.equal(profile.upgrade.min_inputs, 1);
      assert.equal(profile.upgrade.required_station_upgrades, 1);
      assert.ok(!('upgrade_unlock' in profile.pending_values));
      assert.equal(profile.upgrade.max_inputs, 100);
      assert.equal(profile.upgrade.output_count, 1);
      assert.deepEqual(profile.upgrade.probability, {
        formula: 'power', denominator: 100, exponent: 1.5,
        skill_multiplier: { skill_id: 'life_pharmacy', bonus_per_level: 0.01, max_level: 100 },
        cap: 1
      });
      assert.equal(profile.upgrade.counts_as_consumption, false);
      assert.equal(profile.upgrade.consume_inputs_on_failure, true);
      assert.equal(profile.upgrade.ordinary_success_modifiers, false);
      assert.equal(profile.upgrade.craftable_from_raw, false);
      assert.deepEqual(catalog.items[id].attribute_modules.medicine.innate.innate_medicine_profile, profile);
      assert.ok(!catalog.items[id].attribute_modules.food);
      assert.ok(!catalog.items[id].attribute_modules.medicine.use);
      familyCounters.add(profile.counter_key);
      counters.add(profile.counter_key);
    }
    assert.equal(familyCounters.size, 1, 'versions must share the consumed-portions counter');
  }
  assert.equal(counters.size, 5, 'different medicines must not share a counter');
});

test('unconfirmed effects and economic values remain pending, with no production or runtime activation', () => {
  const recipeTexts = ['data/recipes.json', 'data/pharmacy-recipes.json'].map(read);
  for (const id of ids) {
    const item = legacy[id], profile = item.innate_medicine_profile;
    assert.equal(profile.implementation, 'data_only');
    assert.ok(Object.values(profile.pending_values).every(value => value === null));
    assert.ok(!('base_value' in item));
    assert.equal(item.weight_kg, 0, 'only the existing builder fallback, not approved weight');
    assert.equal(item.spoilage_ticks, 0, 'only the existing builder fallback, not approved shelf life');
    assert.equal(item.edible, false);
    assert.equal(item.usable, false);
    for (const key of ['use_effect', 'use_action', 'use_buff_id', 'food_profile', 'production_lines', 'source', 'pharmacy_ingredient']) assert.ok(!(key in item), id + ': ' + key);
    for (const text of recipeTexts) assert.ok(!text.includes('"' + id + '"'), 'data-only item was registered in a production recipe');
    assert.ok(!JSON.stringify(profile).includes('consumed_count'), 'player progress belongs in the future character save, not templates');
  }
  assert.equal(json('data/item-field-display-rules.json').fields.innate_medicine_profile.renderer, 'hidden');
});

test('real inventory recognises medicine names, 100-per-stack limits and separate versions without enabling consumption', () => {
  const g = vm.createContext({ console, Math, Date });
  g.window = g;
  g.UIText = { t: key => key };
  for (const file of ['js/item-attribute-modules.js', 'js/item-field-display-rules.js', 'js/inventory-equipment.js', 'js/item-use.js', 'js/dungeon/icons.js', 'js/dungeon/item-icons.js']) vm.runInContext(read(file), g, { filename: file });
  const I = g.InventoryEquipment;
  I.setConfig({ items: catalog, equipment: { test_pack: { item_id: 'test_pack', backpack_slots: 32 } }, modules: {}, default_equipment: {} });
  I.setState({ sewing_version: 2, equipment: { backpack: { item_id: 'test_pack', count: 1 } }, inventory_backpack: [] });
  const id = 'potion_innate_jingu_t1';
  assert.equal(I.putItemIntoDefaultContainer({ item_id: id, count: 99 }).placed, true);
  assert.equal(I.putItemIntoDefaultContainer({ item_id: id, count: 1 }).placed, true);
  assert.equal(I.getBackpackArray().filter(Boolean).length, 1);
  assert.equal(I.getBackpackArray()[0].count, 100);
  assert.equal(I.putItemIntoDefaultContainer({ item_id: id, count: 1 }).placed, true);
  assert.equal(I.getBackpackArray().filter(Boolean).length, 2, '101st item needs another stack');
  for (const otherId of ids.filter(other => other !== id)) assert.equal(I.putItemIntoDefaultContainer({ item_id: otherId, count: 1 }).placed, true);
  assert.equal(I.getBackpackArray().filter(Boolean).length, 21, 'families and versions cannot merge');
  const before = JSON.stringify(I.getState());
  for (const itemId of ids) {
    const template = I.getItemTemplate(itemId);
    assert.equal(g.ItemIcons.resolve(template), 'medicine');
    assert.equal(g.ItemUse.itemTemplateIsConsumable(template), false);
    assert.equal(g.ItemUse.isFoodTemplate(template), false);
    assert.equal(g.ItemAttributeModules.hasGroup(template, 'medicine', 'innate'), true);
    assert.equal(g.ItemAttributeModules.getTemplateValue(catalog.items[itemId], 'innate_medicine_profile').counter_key, legacy[itemId].innate_medicine_profile.counter_key);
    for (const level of [0, 2, 5, 10]) {
      const character = { skills: { survival_language: { level } } };
      assert.equal(I.getDisplayName(template, 0, character), level < 5 ? '未识别药品' : legacy[itemId].name);
      assert.equal(I.getDisplayDesc(template, 0, character), level < 2 ? '' : level < 10 ? '一种药品。' : legacy[itemId].fn);
    }
  }
  assert.equal(JSON.stringify(I.getState()), before, 'viewing data must not consume items or grant growth');
});

test('invalid sources and incomplete catalogues fail atomically', () => {
  const mutations = [
    s => { s.schema_version = 2; },
    s => { s.implementation = 'active'; },
    s => { s.growth_rule.first_portions = 0; },
    s => { s.growth_rule.first_portions = '10'; },
    s => { s.growth_rule.consumption_limit = 10; },
    s => { s.growth_rule.counter_scope = 'item'; },
    s => { s.growth_rule.count_failed_rolls = false; },
    s => { s.growth_rule.inherent_effects_on_every_portion = false; },
    s => { s.growth_rule.current_consumed = 0; },
    s => { delete s.upgrade_rule.required_station_upgrades; },
    s => { s.upgrade_rule.required_station_upgrades = 0; },
    s => { s.upgrade_rule.required_station_upgrades = 2; },
    s => { s.upgrade_rule.required_station_upgrades = '1'; },
    s => { s.upgrade_rule.probability.exponent = 1; },
    s => { s.upgrade_rule.probability.denominator = 101; },
    s => { delete s.upgrade_rule.probability.skill_multiplier; },
    s => { s.upgrade_rule.probability.skill_multiplier.skill_id = 'life_cooking'; },
    s => { s.upgrade_rule.probability.skill_multiplier.bonus_per_level = -0.01; },
    s => { s.upgrade_rule.probability.skill_multiplier.bonus_per_level = '0.01'; },
    s => { s.upgrade_rule.probability.skill_multiplier.bonus_per_level = Infinity; },
    s => { s.upgrade_rule.probability.skill_multiplier.max_level = 0; },
    s => { s.upgrade_rule.probability.skill_multiplier.max_level = 1.5; },
    s => { s.upgrade_rule.probability.cap = 1.1; },
    s => { s.upgrade_rule.counts_as_consumption = true; },
    s => { s.upgrade_rule.craftable_from_raw = true; },
    s => { s.upgrade_rule.ordinary_success_modifiers = true; },
    s => { s.pending_values.weight_kg = 0; },
    s => { s.pending_values.inherent_effects = {}; },
    s => { delete s.families.focus; },
    s => { s.families.focus.attribute = 'jingu'; },
    s => { s.tiers[1].success_probability = 0.7; },
    s => { s.tiers[3].success_probability = 1.1; },
    s => { s.tiers[3].prefix = s.tiers[2].prefix; }
  ];
  for (const mutate of mutations) {
    const broken = structuredClone(source), items = bare();
    mutate(broken);
    const before = JSON.stringify(items);
    assert.throws(() => applyInnateMedicines(items, broken));
    assert.equal(JSON.stringify(items), before);
  }
  for (const mutate of [
    items => { delete items.potion_innate_focus_t4; },
    items => { items.potion_innate_focus_t4.category = 'food'; },
    items => { items.potion_innate_focus_t4.stack_limit = 99; },
    items => { items.potion_innate_focus_t4.use_effect = {}; },
    items => { items.potion_innate_focus_t4.name = 'wrong name'; },
    items => { items.potion_innate_other_t1 = { sub_category: 'innate_medicine' }; }
  ]) {
    const items = bare();
    mutate(items);
    const before = JSON.stringify(items);
    assert.throws(() => applyInnateMedicines(items, source));
    assert.equal(JSON.stringify(items), before);
  }
});
