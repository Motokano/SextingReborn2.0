/**
 * 将 data/items/*.csv 合并为 data/items.json（单一运行时数据源）。
 * 用法：node tools/build-items-json.mjs
 * 合并顺序（先出现的 id 优先，后表重复 id 会跳过并打印警告）：
 *   consumables_base → materials_all → product_base → currency_base
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'data', 'items');
const OUT = path.join(ROOT, 'data', 'items.json');

const MERGE_FILES = [
  'consumables_base.csv',
  'materials_all.csv',
  'product_base.csv',
  'currency_base.csv'
];

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let row = [];
  let field = '';
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  row.push(field);
  if (row.length > 1 || field.length) rows.push(row);
  return rows;
}

function trimRow(r) {
  return r.map((c) => (c == null ? '' : String(c).trim()));
}

function csvRowToObject(headers, cells) {
  const o = {};
  for (let i = 0; i < headers.length; i++) {
    o[headers[i]] = cells[i] !== undefined ? cells[i] : '';
  }
  return o;
}

function numOrNull(s) {
  if (s === '' || s == null) return null;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function intOrNull(s) {
  if (s === '' || s == null) return null;
  const n = parseInt(s, 10);
  return isFinite(n) ? n : null;
}

/** 0 = 不腐败；>0 表示自进入可腐败状态起经过多少 tick 后腐败（具体结算由玩法接入）。 */
function resolveSpoilageTicks(o) {
  if (Object.prototype.hasOwnProperty.call(o, 'spoilage_ticks')) {
    const raw = String(o.spoilage_ticks == null ? '' : o.spoilage_ticks).trim();
    if (raw !== '') {
      const n = intOrNull(raw);
      if (n != null && n >= 0) return n;
    }
  }
  const leg = String(o.spoilage == null ? '' : o.spoilage).trim().toLowerCase();
  if (!leg || leg === 'none') return 0;
  if (leg === 'fast') return 600;
  if (leg === 'slow') return 3600;
  const n2 = intOrNull(o.spoilage);
  if (n2 != null && n2 >= 0) return n2;
  return 0;
}

function buildUseEffect(o) {
  if (!Object.prototype.hasOwnProperty.call(o, 'satiety_restore')) return null;
  const sat = numOrNull(o.satiety_restore);
  const thi = numOrNull(o.thirst_restore);
  const nut = numOrNull(o.nutrition_restore);
  const ue = {};
  if (sat != null && sat !== 0) ue.satiety = sat;
  if (thi != null && thi !== 0) ue.thirst = thi;
  if (nut != null && nut !== 0) ue.nutrition = nut;
  return Object.keys(ue).length ? ue : null;
}

function rowToItem(o, filename) {
  const id = o.id;
  if (!id) return null;
  const w = numOrNull(o.weight);
  const item = {
    item_id: id,
    name: o.sn || id,
    name_0: o.sn || id,
    weight_kg: w != null ? w : 0
  };
  if (o.sn) item.sn = o.sn;
  if (o.placeholder_name) item.placeholder_name = o.placeholder_name;
  if (o.fn_before) item.fn_before = o.fn_before;
  if (o.fn) {
    item.fn = o.fn;
    item.desc_0 = o.fn;
  }
  if (o.category) item.category = o.category;
  if (o.sub_category) item.sub_category = o.sub_category;
  const sl = intOrNull(o.stack_limit);
  if (sl != null) item.stack_limit = sl;
  if (o.quality) item.quality = o.quality;
  if (o.tags) item.tags = o.tags;
  if (o.source) item.source = o.source;
  if (o.production_lines) item.production_lines = o.production_lines;
  item.spoilage_ticks = resolveSpoilageTicks(o);
  if (o.price_class) item.price_class = o.price_class;
  if (o.volatility) item.volatility = o.volatility;
  if (o.region_restrict !== '' && o.region_restrict != null) {
    const rr = intOrNull(o.region_restrict);
    if (rr != null) item.region_restrict = rr;
  }
  const bv = numOrNull(o.base_value);
  if (bv != null) item.base_value = bv;

  if (o.accept_code) item.accept_code = o.accept_code;
  if (o.convert_to_high) item.convert_to_high = o.convert_to_high;
  if (o.usable_regions !== '' && o.usable_regions != null) {
    const ur = intOrNull(o.usable_regions);
    if (ur != null) item.usable_regions = ur;
  }

  const ue = buildUseEffect(o);
  if (ue) item.use_effect = ue;
  if (Object.prototype.hasOwnProperty.call(o, 'edible')) {
    const v = String(o.edible == null ? '' : o.edible).trim().toLowerCase();
    item.edible = (v === '1' || v === 'true' || v === 'yes');
  }
  if (Object.prototype.hasOwnProperty.call(o, 'cooking_ingredient')) {
    const cv = String(o.cooking_ingredient == null ? '' : o.cooking_ingredient).trim().toLowerCase();
    if (cv === '1' || cv === 'true' || cv === 'yes') item.cooking_ingredient = true;
  }
  if (o.edible_buff_id) item.edible_buff_id = String(o.edible_buff_id).trim();
  const foodBuffDur = intOrNull(o.food_buff_duration_ticks);
  if (foodBuffDur != null && foodBuffDur > 0) item.food_buff_duration_ticks = foodBuffDur;
  const fp = intOrNull(o.fuel_points);
  item.fuel_points = (fp != null && fp > 0) ? fp : 0;
  const wp = intOrNull(o.water_points);
  item.water_points = (wp != null && wp > 0) ? wp : 0;

  return item;
}

function main() {
  const merged = {};
  const warnings = [];

  for (const fname of MERGE_FILES) {
    const fp = path.join(ITEMS_DIR, fname);
    if (!fs.existsSync(fp)) {
      warnings.push('missing file: ' + fp);
      continue;
    }
    const raw = fs.readFileSync(fp, 'utf8');
    const rows = parseCsv(raw.replace(/^\uFEFF/, ''));
    if (!rows.length) continue;
    const headerRow = trimRow(rows[0]);
    const headers = headerRow.map((h) => h.trim());
    for (let r = 1; r < rows.length; r++) {
      const cells = trimRow(rows[r]);
      if (!cells.length || (cells.length === 1 && cells[0] === '')) continue;
      const o = csvRowToObject(headers, cells);
      if (!o.id || String(o.id).trim() === '') continue;
      const id = String(o.id).trim();
      if (merged[id]) {
        warnings.push('duplicate id skipped: ' + id + ' (in ' + fname + ')');
        continue;
      }
      const item = rowToItem(o, fname);
      if (item) merged[id] = item;
    }
  }

  const ordered = {};
  Object.keys(merged)
    .sort()
    .forEach((k) => {
      ordered[k] = merged[k];
    });

  fs.writeFileSync(OUT, JSON.stringify(ordered, null, 2) + '\n', 'utf8');

  const count = Object.keys(ordered).length;
  console.log('[build-items-json] wrote ' + OUT + ' (' + count + ' items)');
  if (warnings.length) {
    console.log('[build-items-json] warnings (' + warnings.length + '):');
    warnings.forEach((w) => console.log('  - ' + w));
  }
}

main();
