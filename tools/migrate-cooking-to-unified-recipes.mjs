/**
 * One-shot migration: data/cooking-recipes.json -> data/recipes.json (life_cooking.*)
 * and data/cooking-methods.json -> data/recipe-methods.json (life_cooking.<slug> methods).
 * Run: node tools/migrate-cooking-to-unified-recipes.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import RecipeSchema from '../js/recipe-schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const cookingRecipes = readJson('data/cooking-recipes.json');
const cookingMethods = readJson('data/cooking-methods.json');
const recipesRoot = readJson('data/recipes.json');
const methodsRoot = readJson('data/recipe-methods.json');
const interfacesRoot = readJson('data/life-skill-recipe-interfaces.json');

const COOKING_SYSTEM = 'life_cooking';
const PROCESSOR = 'processor.life_cooking.default';
const FAILURE_ITEM = 'food_cooking_fail_generic';

function methodEntryFromCooking(mid, row) {
  return {
    method_id: mid,
    recipe_system: COOKING_SYSTEM,
    cost: {
      fuel: Math.max(0, Math.floor(Number(row.fuel_cost) || 0)),
      water: Math.max(0, Math.floor(Number(row.water_cost) || 0)),
      ticks: Math.max(0, Math.floor(Number(row.craft_ticks) || 0)),
      stamina: Math.max(0, Math.floor(Number(row.stamina_cost) || 0))
    },
    base_success_rate: Math.max(0, Math.min(1, Number(row.base_success_rate) || 0.5)),
    required_skill_id: COOKING_SYSTEM,
    recipe_processor_id: PROCESSOR,
    proficiency_usage_key: mid,
    allowed_station_tags: ['station_cooking'],
    unlock: [{ type: 'skill_level_min', skill_id: COOKING_SYSTEM, level: 1 }],
    failure_output: { item_id: FAILURE_ITEM, count: 1 }
  };
}

const methods = { ...methodsRoot.methods };
for (const slug of Object.keys(cookingMethods.methods || {})) {
  const row = cookingMethods.methods[slug];
  const mid = `${COOKING_SYSTEM}.${slug}`;
  methods[mid] = methodEntryFromCooking(mid, row);
}

const recipes = {};
for (const k of Object.keys(recipesRoot.recipes || {})) {
  const row = recipesRoot.recipes[k];
  if (row && row.recipe_system === COOKING_SYSTEM) {
    recipes[k] = JSON.parse(JSON.stringify(row));
  }
}
const list = Array.isArray(cookingRecipes.recipes) ? cookingRecipes.recipes : [];
for (const r of list) {
  const legacyId = String(r.recipe_id || '').trim();
  if (!legacyId) continue;
  const rid = `${COOKING_SYSTEM}.${legacyId}`;
  const reqMethod = String(r.required_method || '').trim();
  if (!reqMethod) continue;
  const methodId = `${COOKING_SYSTEM}.${reqMethod}`;
  recipes[rid] = {
    recipe_id: rid,
    recipe_system: COOKING_SYSTEM,
    method_id: methodId,
    enabled: true,
    inputs: Array.isArray(r.inputs) ? r.inputs.map((x) => ({ item_id: String(x.item_id), count: Math.max(1, Math.floor(Number(x.count) || 1)) })) : [],
    main_output: { item_id: String(r.output_item_id), count: 1 },
    bonus_outputs: [],
    required_skill_level_min: 1,
    proficiency_usage_key: rid,
    required_skill_id: null,
    recipe_processor_id: null,
    base_success_rate: r.base_success_rate != null ? Math.max(0, Math.min(1, Number(r.base_success_rate))) : null,
    failure_output: null,
    allowed_station_tags: null,
    match_weight: r.match_weight != null ? Math.max(0.000001, Number(r.match_weight)) : 1
  };
}

const interfaces = { ...interfacesRoot.interfaces };
if (interfaces[COOKING_SYSTEM]) {
  interfaces[COOKING_SYSTEM] = {
    ...interfaces[COOKING_SYSTEM],
    default_method_id: `${COOKING_SYSTEM}.roast_bake`,
    default_recipe_id: `${COOKING_SYSTEM}.cook_flatbread_plain`
  };
}

const outRecipes = { ...recipesRoot, recipes };
const outMethods = { ...methodsRoot, methods };
const outInterfaces = { ...interfacesRoot, interfaces };

const report = RecipeSchema.validateRecipeTables(outRecipes, outMethods, outInterfaces, {});
if (report.errors.length) {
  console.error('Validation errors:', report.errors.length);
  report.errors.slice(0, 15).forEach((e) => console.error(e));
  process.exit(1);
}
if (report.warnings.length) {
  console.warn('Validation warnings:', report.warnings.length);
}

fs.writeFileSync(path.join(root, 'data/recipes.json'), JSON.stringify(outRecipes, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(root, 'data/recipe-methods.json'), JSON.stringify(outMethods, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(root, 'data/life-skill-recipe-interfaces.json'), JSON.stringify(outInterfaces, null, 2) + '\n', 'utf8');

console.log('OK: recipes', Object.keys(recipes).filter((k) => k.startsWith('life_cooking.')).length, 'cooking rows; methods', Object.keys(methods).filter((k) => k.startsWith('life_cooking.')).length, 'life_cooking.*');
