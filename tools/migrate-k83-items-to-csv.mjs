/**
 * k120：把 items.json 中「仅存在于 items.json、不在任何 data/items/*.csv」的条目
 * 迁入 materials_all.csv（含 region_restrict / tags 列），使 `npm run build:items`
 * 不再整批丢失这些条目（k83 材料 + hus_* 畜牧产出，共 93 条）。
 *
 * 同时清理 D5 海产重复 id：CSV 原生 fish_bonito/fish_cockle/… 已被 k83 的
 * hunt_* 系列（42 文档 / 掉落表引用）取代，删除这 10 行 fish_* 重复行。
 *
 * 用法：node tools/migrate-k83-items-to-csv.mjs
 *       node tools/migrate-k83-items-to-csv.mjs --dry-run   # 只打印计划
 *
 * 字段映射：items.json 条目 → materials_all.csv 列（缺失列自动追加到表头：
 * water_points / food_buff_duration_ticks / meal_tier / satiety_total /
 * digestion_ticks / slots_taken / meal_composition / workhorse）。
 * 注：thirst_restore 顶层字段在 build-items-json 中属于 handled（仅在
 * satiety_restore 存在时写入 use_effect），materials_all.csv 无 satiety_restore
 * 列，故该字段无法经 CSV 管线保留（当前无运行时消费者，不迁移）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ITEMS_JSON = path.join(ROOT, 'data', 'items.json');
const ITEMS_DIR = path.join(ROOT, 'data', 'items');
const TARGET = 'materials_all.csv';
const DRY = process.argv.includes('--dry-run');

/** 需从 materials_all.csv 删除的 fish_* 重复 id（42 文档用 hunt_*，掉落表已按 hunt_* 引用） */
const FISH_DUPS = [
  'fish_bonito', 'fish_cockle', 'fish_abalone', 'fish_eel', 'fish_mussel',
  'fish_crab_spider', 'fish_sea_cucumber', 'fish_fish_maw_glue',
  'fish_scallop_dried', 'fish_shrimp_sea'
];

/** items.json 字段 → CSV 列名（列不在表头时追加） */
const FIELD_TO_COL = {
  item_id: 'id',
  sn: 'sn',
  name: 'sn',
  placeholder_name: 'placeholder_name',
  fn_before: 'fn_before',
  fn: 'fn',
  category: 'category',
  sub_category: 'sub_category',
  weight_kg: 'weight',
  stack_limit: 'stack_limit',
  quality: 'quality',
  tags: 'tags',
  source: 'source',
  production_lines: 'production_lines',
  spoilage_ticks: 'spoilage_ticks',
  price_class: 'price_class',
  volatility: 'volatility',
  region_restrict: 'region_restrict',
  base_value: 'base_value',
  edible: 'edible',
  edible_buff_id: 'edible_buff_id',
  usable: 'usable',
  use_buff_id: 'use_buff_id',
  fuel_points: 'fuel_points',
  cooking_ingredient: 'cooking_ingredient',
  pharmacy_ingredient: 'pharmacy_ingredient',
  info_module_set_id: 'info_module_set_id',
  fert_c: 'fert_c',
  fert_n: 'fert_n',
  compost_inoculant_aerobic: 'compost_inoculant_aerobic',
  compost_inoculant_anaerobic: 'compost_inoculant_anaerobic',
  water_points: 'water_points',
  food_buff_duration_ticks: 'food_buff_duration_ticks',
  meal_tier: 'meal_tier',
  satiety_total: 'satiety_total',
  digestion_ticks: 'digestion_ticks',
  slots_taken: 'slots_taken',
  meal_composition: 'meal_composition',
  workhorse: 'workhorse'
};

function parseCsv(text) {
  const rows = [];
  let i = 0, row = [], field = '', inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  row.push(field);
  if (row.length > 1 || field.length) rows.push(row);
  return rows;
}

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function serializeCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}

function main() {
  const items = JSON.parse(fs.readFileSync(ITEMS_JSON, 'utf8'));
  const csvFiles = fs.readdirSync(ITEMS_DIR).filter((f) => f.endsWith('.csv'));

  // 1) 收集所有 CSV 中已存在的 id
  const existingIds = new Set();
  for (const fname of csvFiles) {
    const raw = fs.readFileSync(path.join(ITEMS_DIR, fname), 'utf8').replace(/^\uFEFF/, '');
    const rows = parseCsv(raw);
    if (!rows.length) continue;
    for (let r = 1; r < rows.length; r++) {
      const id = String(rows[r][0] || '').trim();
      if (id) existingIds.add(id);
    }
  }

  // 2) 找出 items.json-only 条目（要迁移）
  const toMigrate = Object.keys(items)
    .filter((id) => !existingIds.has(id))
    .sort();

  // 3) 读取目标 CSV
  const targetPath = path.join(ITEMS_DIR, TARGET);
  const rawTarget = fs.readFileSync(targetPath, 'utf8').replace(/^\uFEFF/, '');
  const targetRows = parseCsv(rawTarget);
  const header = targetRows[0].map((h) => h.trim());
  const colIndex = new Map(header.map((h, i) => [h, i]));

  // 4) 计算需要的额外列（仅限迁移条目实际拥有的字段）
  const extraCols = [];
  for (const id of toMigrate) {
    const it = items[id];
    for (const k of Object.keys(FIELD_TO_COL)) {
      const col = FIELD_TO_COL[k];
      if (col && it[k] != null && !colIndex.has(col) && !extraCols.includes(col)) extraCols.push(col);
    }
  }
  const newHeader = header.concat(extraCols);
  extraCols.forEach((c, i) => colIndex.set(c, header.length + i));

  // 5) 生成新行
  const newRows = [];
  for (const id of toMigrate) {
    const it = items[id];
    const row = new Array(newHeader.length).fill('');
    const put = (col, val) => {
      if (col == null || col === '') return;
      const idx = colIndex.get(col);
      if (idx == null) return;
      row[idx] = String(val == null ? '' : val);
    };
    for (const k of Object.keys(FIELD_TO_COL)) {
      const col = FIELD_TO_COL[k];
      const v = it[k];
      if (v == null) continue;
      if (col === 'edible' || col === 'cooking_ingredient' || col === 'pharmacy_ingredient') {
        put(col, v ? '1' : '');
      } else {
        put(col, v);
      }
    }
    // quality 列：与全表其它行一致用 white（items.json 无 quality 字段，构建后统一补 white）
    put('quality', 'white');
    newRows.push(row);
  }

  // 6) 删除 fish_* 重复行（先校验 hunt_* 对应项存在，且 fish_* 行确实在目标 CSV 中）
  const HUNT_COUNTERPART = {
    fish_bonito: 'hunt_fish_bonito', fish_cockle: 'hunt_cockle', fish_abalone: 'hunt_abalone',
    fish_eel: 'hunt_fish_eel', fish_mussel: 'hunt_mussel', fish_crab_spider: 'hunt_crab',
    fish_sea_cucumber: 'hunt_sea_cucumber', fish_fish_maw_glue: 'hunt_fish_maw',
    fish_scallop_dried: 'hunt_scallop_dried', fish_shrimp_sea: 'hunt_shrimp'
  };
  const missingCounterpart = FISH_DUPS.filter((id) => !items[HUNT_COUNTERPART[id]]);
  if (missingCounterpart.length) {
    console.error('[migrate-k83] 缺少 hunt_* 对应项: ' + missingCounterpart.join(', '));
    process.exit(1);
  }
  const fishInTarget = FISH_DUPS.filter((id) =>
    targetRows.some((r, i) => i > 0 && String(r[0] || '').trim() === id));
  if (fishInTarget.length !== 0 && fishInTarget.length !== FISH_DUPS.length) {
    console.error('[migrate-k83] materials_all.csv fish_* 重复行不完整，缺: ' +
      FISH_DUPS.filter((id) => !fishInTarget.includes(id)).join(', '));
    process.exit(1);
  }
  const rowsAfterDedup = targetRows.filter((r, i) => {
    if (i === 0) return true;
    const id = String(r[0] || '').trim();
    return !FISH_DUPS.includes(id);
  });

  const removedFish = targetRows.length - rowsAfterDedup.length;
  const finalRows = [newHeader].concat(rowsAfterDedup.slice(1), newRows);

  console.log('[migrate-k83] items.json 总数 ' + Object.keys(items).length);
  console.log('[migrate-k83] 待迁移（仅存在于 items.json）: ' + toMigrate.length);
  console.log('[migrate-k83] 删除 fish_* 重复行: ' + removedFish + (removedFish === 0 ? '（已清理，跳过）' : ''));
  console.log('[migrate-k83] 新增列: ' + (extraCols.length ? extraCols.join(', ') : '(无)'));
  console.log('[migrate-k83] materials_all.csv 数据行: ' + (targetRows.length - 1) + ' → ' + (finalRows.length - 1));

  if (DRY) {
    toMigrate.forEach((id) => console.log('  + ' + id));
    return;
  }

  fs.writeFileSync(targetPath, serializeCsv(finalRows) + '\n', 'utf8');
  console.log('[migrate-k83] 已写 ' + targetPath);
}

main();
