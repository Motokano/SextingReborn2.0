// 一次性补齐畜牧产出物品到 items.json（§6.4 契约表「新增」项）。
// 用法：node tools/add-livestock-items.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ITEMS_PATH = path.join(ROOT, 'data', 'items.json');

// [item_id, name, weight_kg, sub_category, edible]
const DEFS = [
  // 活体产出
  ['hus_wool', '羊毛', 0.3, 'fiber', false],
  ['hus_beef_blood', '牛血', 0.5, 'offal', true],
  ['hus_mutton_blood', '羊血', 0.5, 'offal', true],
  ['hus_pork_blood', '猪血', 0.5, 'offal', true],
  // 牛
  ['hus_beef_steak', '牛排', 5, 'meat', true],
  ['hus_beef_heart', '牛心', 1.5, 'offal', true],
  ['hus_beef_liver', '牛肝', 2, 'offal', true],
  ['hus_beef_kidney', '牛肾', 0.6, 'offal', true],
  ['hus_beef_tripe', '牛肚', 2, 'offal', true],
  ['hus_beef_omasum', '牛百叶', 1.5, 'offal', true],
  ['hus_beef_intestine', '牛肠', 1.5, 'offal', true],
  ['hus_beef_lung', '牛肺', 1.5, 'offal', true],
  ['hus_beef_brain', '牛脑', 0.5, 'offal', true],
  ['hus_beef_marrow', '牛骨髓', 0.3, 'offal', true],
  ['hus_beef_hide', '牛皮', 8, 'hide', false],
  ['hus_beef_horn', '牛角', 0.8, 'horn', false],
  ['hus_beef_tallow', '牛脂', 1, 'fat', false],
  // 羊
  ['hus_mutton_chop', '羊排', 1.5, 'meat', true],
  ['hus_mutton_leg', '羊腿', 3, 'meat', true],
  ['hus_mutton_heart', '羊心', 0.3, 'offal', true],
  ['hus_mutton_liver', '羊肝', 0.6, 'offal', true],
  ['hus_mutton_kidney', '羊肾', 0.2, 'offal', true],
  ['hus_mutton_tripe', '羊肚', 0.6, 'offal', true],
  ['hus_mutton_intestine', '羊肠', 0.5, 'offal', true],
  ['hus_mutton_tongue', '羊舌', 0.2, 'offal', true],
  ['hus_mutton_lung', '羊肺', 0.4, 'offal', true],
  ['hus_mutton_brain', '羊脑', 0.1, 'offal', true],
  ['hus_mutton_hide', '羊皮', 2, 'hide', false],
  ['hus_mutton_bone', '羊骨', 1, 'bone', false],
  ['hus_mutton_tallow', '羊脂', 0.5, 'fat', false],
  // 猪
  ['hus_pork_chop', '猪排', 1.5, 'meat', true],
  ['hus_pork_heart', '猪心', 0.4, 'offal', true],
  ['hus_pork_liver', '猪肝', 1.5, 'offal', true],
  ['hus_pork_kidney', '猪腰', 0.3, 'offal', true],
  ['hus_pork_large_intestine', '猪大肠', 1, 'offal', true],
  ['hus_pork_small_intestine', '猪小肠', 0.5, 'offal', true],
  ['hus_pork_lung', '猪肺', 0.8, 'offal', true],
  ['hus_pork_brain', '猪脑', 0.2, 'offal', true],
  ['hus_pork_ear', '猪耳', 0.3, 'offal', true],
  // 鸡
  ['hus_chicken_thigh', '鸡腿肉', 0.4, 'meat', true],
  ['hus_chicken_breast', '鸡胸肉', 0.4, 'meat', true],
  ['hus_chicken_blood', '鸡血', 0.1, 'offal', true],
  ['hus_chicken_gizzard', '鸡胗', 0.1, 'offal', true],
  ['hus_chicken_liver', '鸡肝', 0.05, 'offal', true],
  ['hus_chicken_heart', '鸡心', 0.03, 'offal', true],
  ['hus_chicken_intestine', '鸡肠', 0.1, 'offal', true],
  ['hus_chicken_skin', '鸡皮', 0.2, 'hide', false],
  // 副产物
  ['hus_biogas', '沼气', 0.1, 'fuel', false],
  ['hus_insect_powder', '虫粉', 0.1, 'feed', false]
];

const CATEGORY = {
  wool: null, fiber: 'textile', fuel: 'material', feed: 'material'
};

function makeItem(def) {
  const [id, name, weight, sub, edible] = def;
  const category = (sub === 'fiber') ? 'textile' : ((sub === 'fuel' || sub === 'feed') ? 'material' : 'hunt');
  const spoil = (sub === 'meat' || sub === 'offal') ? 600 : 0;
  return {
    item_id: id,
    name: name,
    name_0: name,
    weight_kg: weight,
    sn: name,
    placeholder_name: name,
    fn: name + '，来自畜牧产出。',
    desc_0: name + '，来自畜牧产出。',
    category: category,
    sub_category: sub,
    stack_limit: 20,
    quality: 'white',
    tags: 'material' + (edible ? ';food;perishable' : ''),
    source: 'husbandry',
    spoilage_ticks: spoil,
    price_class: 'life_good',
    volatility: 'mid',
    region_restrict: 0,
    edible: edible,
    fuel_points: sub === 'fuel' ? 10 : 0,
    water_points: 0,
    fert_c: '0',
    fert_n: '0'
  };
}

const items = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf8'));
let added = 0;
for (const def of DEFS) {
  const it = makeItem(def);
  if (items[it.item_id]) {
    console.log('skip (exists):', it.item_id);
    continue;
  }
  items[it.item_id] = it;
  added++;
}
fs.writeFileSync(ITEMS_PATH, JSON.stringify(items, null, 2) + '\n', 'utf8');
console.log('added', added, 'items; total items now', Object.keys(items).length);
