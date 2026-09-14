/** Read-only audit for the deployed pharmacy catalog. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p));
const fail = message => { throw new Error(message); };

function csv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (quoted) fail('Unclosed CSV quote');
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const rows = csv(read('data/items/pharmacy_base.csv'));
const recipes = json('data/pharmacy-recipes.json').recipes;
const allItems = json('data/items.json');
const buffs = json('data/buffs.json').buffs;
const plan = json('docs/design/47-pharmacy-full-recipe-plan.json');
const byId = Object.fromEntries(rows.map(r => [r.id, r]));
const buffIds = new Set(buffs.map(b => b && b.buff_id).filter(Boolean));

if (Object.keys(byId).length !== rows.length) fail('Duplicate pharmacy item IDs');
if (new Set(recipes.map(r => r.recipe_id)).size !== recipes.length) fail('Duplicate pharmacy recipe IDs');
if (recipes.length !== 76) fail('Expected 76 recipe records, got ' + recipes.length);
const enabled = recipes.filter(r => r.enabled !== false);
if (enabled.length !== 69) fail('Expected 69 enabled recipes, got ' + enabled.length);

for (const r of recipes) {
  for (const [id, count] of [...r.inputs, r.main_output]) {
    if (!allItems[id]) fail('Unknown recipe item ' + id + ' in ' + r.recipe_id);
    if (!Number.isInteger(count) || count < 1) fail('Invalid count in ' + r.recipe_id);
  }
}

for (const entry of plan.new_products) if (!byId[entry.id]) fail('Planned product missing from runtime source: ' + entry.id);

const fixed = rows.filter(r => r.use_action && r.use_buff_id && r.pharmacy_legacy !== '1');
if (fixed.length !== 28) fail('Expected 28 fixed medicines, got ' + fixed.length);
for (const r of fixed) {
  if (r.use_action === 'inject') fail('Fixed injection medicine remains active: ' + r.id);
  if (!buffIds.has(r.use_buff_id)) fail('Unknown buff ' + r.use_buff_id + ' for ' + r.id);
  if (Number(r.spoilage_ticks) !== 7200) fail('Finished medicine spoilage must be 7200: ' + r.id);
  const stack = Number(r.stack_limit);
  if (stack < 2 || stack > 3) fail('Finished medicine stack must be 2-3: ' + r.id);
}

const legacy = rows.filter(r => r.pharmacy_legacy === '1');
if (legacy.length) fail('Legacy fixed injections remain in runtime source: ' + legacy.map(x => x.id).join(', '));
if (!byId.potion_compound_injection || byId.potion_compound_injection.pharmacy_compound !== '1') fail('Dynamic injection template missing');

const powders = rows.filter(r => r.sub_category === 'pharm_powder');
if (powders.length !== 41) fail('Expected 41 powders, got ' + powders.length);

const heldRecipeIds = new Set([
  'life_pharmacy.macerate_cardiac_powder',
  'life_pharmacy.crush_baiji_powder',
  'life_pharmacy.crush_notoginseng_powder',
  'life_pharmacy.refine_notoginseng',
  'life_pharmacy.purify_notoginseng',
  'life_pharmacy.blend_coagulant_powder',
  'life_pharmacy.blend_coagulant_salve'
]);
for (const id of heldRecipeIds) {
  const r = recipes.find(x => x.recipe_id === id);
  if (!r || r.enabled !== false) fail('Held consumer-gap recipe is not disabled: ' + id);
}
for (const r of recipes.filter(x => x.enabled === false)) if (!heldRecipeIds.has(r.recipe_id)) fail('Unexpected disabled recipe: ' + r.recipe_id);

console.log(JSON.stringify({
  items: rows.length,
  recipes: recipes.length,
  enabled_recipes: enabled.length,
  fixed_medicines: fixed.length,
  powders: powders.length,
  fixed_injections: 0,
  dynamic_injection_template: true,
  held_consumer_gap_recipes: heldRecipeIds.size,
  checks: 'passed',
  runtime_data_written: true
}, null, 2));
