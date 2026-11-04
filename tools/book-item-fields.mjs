/** Build book learning metadata into the formal item catalogue; no runtime rewards. */
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const clone = value => JSON.parse(JSON.stringify(value));

function fields(value, keys, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${at}: expected an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw Error(`${at}: unknown field ${key}`);
  for (const key of keys) if (!own(value, key)) throw Error(`${at}: missing ${key}`);
}

function positiveInteger(value, at) {
  if (!Number.isSafeInteger(value) || value <= 0) throw Error(`${at}: expected a positive integer`);
}

export function applyBookLearning(items, source) {
  fields(source, ['schema_version', 'full_book_consumption', 'special_skill_learning', 'skills', 'books'], 'book-learning');
  if (source.schema_version !== 1) throw Error('book-learning: unsupported schema_version');
  const consumption = source.full_book_consumption;
  fields(consumption, ['levels_gained', 'potential_cost', 'language_exp', 'tick_cost'], 'book-learning.full_book_consumption');
  if (consumption.levels_gained !== 1 || consumption.potential_cost !== 0 || consumption.language_exp !== 0 || consumption.tick_cost !== 0) {
    throw Error('book-learning: consuming a full book grants exactly one level with no extra potential, language experience or tick cost');
  }
  const rules = source.special_skill_learning;
  fields(rules, ['potential_per_exp', 'language_skill_id', 'language_exp_ratio', 'language_costs_extra_potential', 'stop_all_exp_at_book_cap', 'preserve_fractional_exp'], 'book-learning.special_skill_learning');
  positiveInteger(rules.potential_per_exp, 'book-learning.potential_per_exp');
  if (rules.language_skill_id !== 'survival_language') throw Error('book-learning: unknown language_skill_id');
  fields(rules.language_exp_ratio, ['numerator', 'denominator'], 'book-learning.language_exp_ratio');
  for (const key of ['numerator', 'denominator']) positiveInteger(rules.language_exp_ratio[key], `book-learning.language_exp_ratio.${key}`);
  if (rules.language_exp_ratio.numerator > rules.language_exp_ratio.denominator) throw Error('book-learning: language experience ratio exceeds 1');
  if (rules.language_costs_extra_potential !== false || rules.stop_all_exp_at_book_cap !== true || rules.preserve_fractional_exp !== true) {
    throw Error('book-learning: language must be a free proportional reward, stop at the book cap and preserve fractional experience');
  }
  for (const key of ['skills', 'books']) {
    if (!source[key] || typeof source[key] !== 'object' || Array.isArray(source[key]) || !Object.keys(source[key]).length) throw Error(`book-learning: invalid ${key}`);
  }
  for (const [id, skill] of Object.entries(source.skills)) {
    if (!/^special_[a-z0-9_]+$/.test(id)) throw Error(`book-learning: invalid special skill ${id}`);
    fields(skill, ['max_level', 'exp_to_max_level', 'experience_curve'], id);
    for (const key of ['max_level', 'exp_to_max_level']) positiveInteger(skill[key], `${id}.${key}`);
    if (skill.experience_curve !== 'linear' || skill.exp_to_max_level % skill.max_level !== 0) throw Error(`${id}: expected equal integer experience per level`);
  }
  const pending = new Map();
  for (const [id, book] of Object.entries(source.books)) {
    if (!/^[a-z][a-z0-9_]*$/.test(id)) throw Error(`book-learning: invalid book id ${id}`);
    fields(book, ['item_id', 'skill_id', 'fragments_total', 'fragments_per_item', 'levels_per_fragment', 'progress_scope', 'consumed_by_reading'], id);
    const item = items[book.item_id];
    if (!item || item.category !== 'book') throw Error(`${id}: unknown book item ${book.item_id}`);
    if (pending.has(book.item_id) || own(item, 'book_profile')) throw Error(`${id}: duplicate book profile for ${book.item_id}`);
    if (!own(source.skills, book.skill_id)) throw Error(`${id}: unknown skill ${book.skill_id}`);
    for (const key of ['fragments_total', 'fragments_per_item', 'levels_per_fragment']) positiveInteger(book[key], `${id}.${key}`);
    if (book.fragments_per_item > book.fragments_total) throw Error(`${id}: fragment item exceeds collection capacity`);
    const teachingCap = book.fragments_total * book.levels_per_fragment;
    if (!Number.isSafeInteger(teachingCap) || teachingCap > source.skills[book.skill_id].max_level) throw Error(`${id}: teaching cap exceeds skill max_level`);
    if (book.progress_scope !== 'character' || book.consumed_by_reading !== false) throw Error(`${id}: reading progress belongs to the character and reading must preserve the book`);
    pending.set(book.item_id, {
      schema_version: source.schema_version,
      book_id: id,
      ...clone(book),
      skill: {
        ...clone(source.skills[book.skill_id]),
        exp_thresholds: Array.from({ length: source.skills[book.skill_id].max_level + 1 }, (_, level) =>
          source.skills[book.skill_id].exp_to_max_level / source.skills[book.skill_id].max_level * level)
      },
      consumption: clone(consumption),
      learning: clone(rules)
    });
  }
  for (const [id, item] of Object.entries(items)) {
    if (item.category === 'book' && !pending.has(id)) throw Error(`${id}: missing book learning profile`);
  }
  // Validate the whole source before mutating any item.
  for (const [id, profile] of pending) items[id].book_profile = profile;
}
