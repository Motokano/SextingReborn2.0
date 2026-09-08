/**
 * 合并制药首版配方（data/pharmacy-recipes.json）进统一配方表 data/recipes.json。
 *
 * 用法：node tools/build-pharmacy-recipes.mjs [--check]
 *
 * 幂等：按 recipe_id 覆盖（带 pharmacy_generated 标记）；源表里删掉的旧生成条目会被清理。
 * 统一表条目口径见 docs/design/22 与 data/recipes.json 现有条目。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SRC_PATH = path.join(root, 'data', 'pharmacy-recipes.json');
const OUT_PATH = path.join(root, 'data', 'recipes.json');
const CHECK_ONLY = process.argv.includes('--check');

const src = JSON.parse(fs.readFileSync(SRC_PATH, 'utf8'));
const doc = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
const recipes = doc.recipes && typeof doc.recipes === 'object' ? doc.recipes : {};

function toInputs(list) {
  return (Array.isArray(list) ? list : []).map((row) => ({
    item_id: String(row[0] || ''),
    count: Math.max(1, parseInt(row[1], 10) || 1)
  }));
}

function toOutput(row) {
  return { item_id: String(row[0] || ''), count: Math.max(1, parseInt(row[1], 10) || 1) };
}

const generatedIds = new Set();
let added = 0;
let replaced = 0;

(src.recipes || []).forEach((r) => {
  const rid = String(r.recipe_id || '').trim();
  if (!rid) return;
  const entry = {
    recipe_id: rid,
    recipe_system: 'life_pharmacy',
    method_id: String(r.method_id || ''),
    enabled: r.enabled !== false,
    inputs: toInputs(r.inputs),
    main_output: toOutput(r.main_output),
    bonus_outputs: [],
    required_skill_level_min: r.required_skill_level_min != null ? r.required_skill_level_min : null,
    proficiency_usage_key: r.proficiency_usage_key != null ? r.proficiency_usage_key : null,
    required_skill_id: null,
    recipe_processor_id: null,
    base_success_rate: r.base_success_rate != null ? r.base_success_rate : null,
    failure_output: null,
    allowed_station_tags: null,
    match_weight: r.match_weight != null ? r.match_weight : 1,
    pharmacy_generated: true
  };
  if (recipes[rid]) replaced++;
  else added++;
  recipes[rid] = entry;
  generatedIds.add(rid);
});

// 清理源表已删除的旧生成条目
let removed = 0;
Object.keys(recipes).forEach((rid) => {
  const r = recipes[rid];
  if (r && r.pharmacy_generated === true && !generatedIds.has(rid)) {
    delete recipes[rid];
    removed++;
  }
});

doc.recipes = recipes;
console.log('[build-pharmacy-recipes] 生成 ' + generatedIds.size + ' 条（新增 ' + added + ' / 覆盖 ' + replaced + ' / 清理 ' + removed + '），统一表总数 ' + Object.keys(recipes).length);
if (!CHECK_ONLY) {
  fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log('[build-pharmacy-recipes] 写入 ' + OUT_PATH);
}
