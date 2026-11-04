import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { applyBookLearning } from './book-item-fields.mjs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const json = path => JSON.parse(read(path));
const id = 'book_anatomy_textbook';
const source = json('data/book-learning.json');
const legacy = json('data/items.json');
const catalog = json('data/item-catalog-v2.json');
const bare = () => Object.fromEntries(Object.entries(legacy).map(([key, value]) => {
  const item = structuredClone(value);
  delete item.book_profile;
  return [key, item];
}));

function runtime() {
  const context = vm.createContext({ console, Math, Date });
  context.window = context;
  context.globalThis = context;
  context.UIText = { t: key => key };
  for (const file of ['js/item-attribute-modules.js', 'js/item-field-display-rules.js', 'js/inventory-equipment.js', 'js/item-value.js', 'js/item-info-modules.js', 'js/dungeon/icons.js', 'js/dungeon/item-icons.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  context.ItemFieldDisplayRules.setTable(json('data/item-field-display-rules.json'));
  context.InventoryEquipment.setConfig({ items: catalog, equipment: {}, modules: {}, default_equipment: {} });
  return context;
}

test('book source reaches both generated catalogues with the confirmed collection and XP contract', () => {
  const items = bare();
  applyBookLearning(items, source);
  assert.deepEqual(items[id], legacy[id], 'book catalogue needs rebuilding');
  const book = legacy[id];
  assert.equal(book.category, 'book');
  assert.equal(book.sub_category, 'skill_textbook');
  assert.equal(book.stack_limit, 1);
  assert.equal(book.spoilage_ticks, 0);
  assert.ok(book.weight_kg > 0);
  assert.ok(!book.usable && !book.use_action && !book.use_effect && !book.use_buff_id, 'book must not use the consumable path');
  const profile = book.book_profile;
  assert.equal(profile.skill_id, 'special_meridian_studies');
  assert.equal(profile.fragments_per_item, 1);
  assert.equal(profile.fragments_total, 100);
  assert.equal(profile.levels_per_fragment, 1);
  assert.equal(profile.skill.max_level, 100);
  assert.equal(profile.skill.exp_to_max_level, 1000000);
  assert.equal(profile.skill.experience_curve, 'linear');
  assert.equal(profile.skill.exp_thresholds.length, 101);
  assert.equal(profile.skill.exp_thresholds[0], 0);
  assert.equal(profile.skill.exp_thresholds[100], 1000000);
  assert.ok(profile.skill.exp_thresholds.every((n, i, a) => Number.isInteger(n) && (!i || n > a[i - 1])));
  assert.equal(profile.learning.potential_per_exp, 100);
  assert.deepEqual(profile.learning.language_exp_ratio, { numerator: 1, denominator: 10 });
  assert.equal(profile.learning.language_skill_id, 'survival_language');
  assert.equal(profile.learning.language_costs_extra_potential, false);
  assert.equal(profile.learning.stop_all_exp_at_book_cap, true);
  assert.equal(profile.learning.preserve_fractional_exp, true);
  assert.equal(profile.progress_scope, 'character');
  assert.equal(profile.consumed_by_reading, false);
  assert.deepEqual(profile.consumption, { levels_gained: 1, potential_cost: 0, language_exp: 0, tick_cost: 0 });
  assert.deepEqual(catalog.items[id].attribute_modules.knowledge.book.book_profile, profile);
  assert.ok(!Object.hasOwn(profile, 'collected_fragments'), 'template must not hold character collection progress');
  assert.ok(profile.skill.exp_thresholds.slice(1).every((n, i) => n - profile.skill.exp_thresholds[i] === 10000), 'each level requires exactly ten thousand XP');
});

const book = (fragments = 1, extra = {}) => ({ item_id: id, count: 1, attribute_state: { knowledge: { book: { version: 1, fragments } } }, ...extra });
test('automatic book plans conserve fragments, mass, value and identity at capacity boundaries', () => {
  const g = runtime(), I = g.InventoryEquipment;
  const first = book(60, { instance_id: 'book:first' }), incoming = book(50, { instance_id: 'book:incoming' });
  const before = JSON.stringify([first, incoming, I.getState()]);
  const plan = I.planBookPlacement([first], 2, incoming);
  assert.equal(plan.remainingFragments, 0);
  assert.deepEqual(Array.from(plan.items, x => I.getBookInfo(x).fragments), [100, 10]);
  assert.deepEqual(Array.from(plan.items, x => x.instance_id), ['book:first', 'book:incoming']);
  assert.ok(plan.items.every(x => x.count === 1));
  assert.equal(JSON.stringify([first, incoming, I.getState()]), before, 'planning must not mutate source or player');
  const sumWeight = xs => xs.reduce((n, x) => n + I.getItemCombinedWeight(x), 0);
  const sumValue = xs => xs.reduce((n, x) => n + I.getEffectiveBaseValue(x.item_id, x) * x.count, 0);
  assert.ok(Math.abs(sumWeight(plan.items) - sumWeight([first, incoming])) < 1e-10);
  assert.equal(sumValue(plan.items), sumValue([first, incoming]));
  assert.equal(I.planBookPlacement([first], 1, incoming).remainingFragments, 10);
  assert.equal(I.planBookPlacement([book(99)], 1, { item_id: id, count: 1 }).items[0].attribute_state.knowledge.book.fragments, 100);
  assert.equal(I.planBookPlacement([book(99, { warehouse_locked: false, warehouse_starred: false })], 1, book()).remainingFragments, 0, 'removed warehouse marks no longer block merging');
  const batch = I.planBookPlacement([], 3, { item_id: id, count: 201, instance_id: 'batch' });
  assert.deepEqual(Array.from(batch.items, x => I.getBookInfo(x).fragments), [100, 100, 1]);
  const instances = batch.items.map(x => I.copyItemInstance(x));
  assert.equal(new Set(instances.map(x => x.instance_id)).size, 3);
  assert.equal(I.planBookPlacement([first], 2, first).placedFragments, 0, 'same owned identity cannot be absorbed twice');
  const html = g.ItemInfoModules.renderTooltipModulesHtml({ tpl: I.getItemTemplate(id), inst: book(42) });
  const view = g.ItemInfoModules.tooltipView({ tpl: I.getItemTemplate(id), inst: book(42) });
  assert.match(html, /完整度 42\/100/);
  assert.match(JSON.stringify(view), /完整度 42\/100/);
});

test('merge rejects incompatible books, locks and invalid/future states without erasing metadata', () => {
  const g = runtime(), I = g.InventoryEquipment;
  const other = structuredClone(legacy[id]); other.item_id = 'book_other'; other.book_profile.book_id = 'other';
  I.setConfig({ items: { ...legacy, book_other: other }, equipment: {}, modules: {}, default_equipment: {} });
  const targets = [
    book(20, { item_id: 'book_other' }), book(20, { warehouse_locked: true }),
    book(20, { dungeon_rarity: 'special' }), book(20, { custom_mark: 'keep' }),
    book(20, { connections: { clip: { item_id: 'textile_cotton_cloth', count: 1 } } }),
    book(20, { attribute_state: { knowledge: { book: { version: 2, fragments: 20 } } } }),
    book(0), book(101), book(1.5), book(20, { count: 2 }),
    book(20, { instance_id: 'locked' })
  ];
  g.ForgingSystem = { isInstanceLocked: id => id === 'locked' };
  for (const target of targets) {
    const before = JSON.stringify(target);
    const result = I.planBookPlacement([target], 1, book());
    assert.equal(result.placedFragments, 0, before);
    assert.equal(JSON.stringify(result.items[0]), before);
  }
  assert.equal(I.planBookPlacement([], 1, { item_id: 'textile_cotton_cloth', count: 1 }), null);
});

test('runtime inventory reads the book and preserves language gates without awarding knowledge', () => {
  const context = runtime();
  const IE = context.InventoryEquipment;
  const before = JSON.stringify(IE.getState());
  const item = IE.getItemTemplate(id);
  assert.equal(context.ItemAttributeModules.hasGroup(item, 'knowledge', 'book'), true);
  assert.equal(context.ItemAttributeModules.getTemplateValue(item, 'book_profile').book_id, 'anatomy_textbook');
  for (const level of [0, 1, 2, 4, 5, 9, 10]) {
    const character = { skills: { survival_language: { level } } };
    assert.equal(IE.getDisplayName(item, 0, character), level < 5 ? '残旧薄册' : '解剖学教材');
    assert.equal(IE.getDisplayDesc(item, 0, character), level < 2 ? '' : level < 10 ? item.fn_before : item.fn);
  }
  assert.equal(context.ItemFieldDisplayRules.getFieldRule('book_profile').renderer, 'hidden');
  assert.equal(context.ItemIcons.resolve(item), 'paper');
  assert.equal(JSON.stringify(IE.getState()), before, 'viewing a book must not grant skills or collection progress');
});

test('invalid book metadata fails before modifying any item', () => {
  const mutations = [
    s => { s.full_book_consumption.levels_gained = 2; },
    s => { s.full_book_consumption.potential_cost = 100; },
    s => { s.full_book_consumption.language_exp = 1; },
    s => { s.full_book_consumption.tick_cost = 1; },
    s => { delete s.full_book_consumption; },
    s => { s.special_skill_learning.potential_per_exp = '100'; },
    s => { s.special_skill_learning.language_exp_ratio.denominator = 0; },
    s => { s.special_skill_learning.language_exp_ratio.numerator = 11; },
    s => { s.special_skill_learning.language_skill_id = 'missing_language'; },
    s => { s.special_skill_learning.language_costs_extra_potential = true; },
    s => { s.special_skill_learning.stop_all_exp_at_book_cap = false; },
    s => { s.special_skill_learning.preserve_fractional_exp = false; },
    s => { s.skills.special_meridian_studies.exp_to_max_level = -1; },
    s => { s.books.anatomy_textbook.skill_id = 'special_unknown'; },
    s => { s.books.anatomy_textbook.item_id = 'book_missing'; },
    s => { s.books.anatomy_textbook.fragments_total = 101; },
    s => { s.books.anatomy_textbook.fragments_per_item = 101; },
    s => { s.books.anatomy_textbook.levels_per_fragment = 0.5; },
    s => { s.books.anatomy_textbook.consumed_by_reading = true; },
    s => { s.books.anatomy_textbook.progress_scope = 'item'; },
    s => { s.books.anatomy_textbook.typo = 1; },
    s => { s.books.duplicate = structuredClone(s.books.anatomy_textbook); },
    s => { s.books.invalid_second = { ...s.books.anatomy_textbook, item_id: 'book_missing' }; }
  ];
  for (const mutate of mutations) {
    const broken = structuredClone(source);
    const items = bare();
    const before = JSON.stringify(items);
    mutate(broken);
    assert.throws(() => applyBookLearning(items, broken));
    assert.equal(JSON.stringify(items), before, 'rejected source partially changed the catalogue');
  }
  const items = bare();
  items.book_unconfigured = { item_id: 'book_unconfigured', category: 'book' };
  assert.throws(() => applyBookLearning(items, source), /missing book learning profile/);
  assert.ok(!items[id].book_profile);
});
