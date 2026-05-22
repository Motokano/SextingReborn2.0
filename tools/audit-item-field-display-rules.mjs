/**
 * 对账：物品/装备模板字段集合 vs data/item-field-display-rules.json，
 * 并扫描 CSV/JSON 中旧轨即时恢复相关列与 use_effect。
 *
 * 用法：node tools/audit-item-field-display-rules.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ITEMS_JSON = path.join(ROOT, 'data', 'items.json');
const EQUIP_JSON = path.join(ROOT, 'data', 'equipment.json');
const RULES_JSON = path.join(ROOT, 'data', 'item-field-display-rules.json');
const ITEMS_DIR = path.join(ROOT, 'data', 'items');

const MERGE_FILES = [
  'consumables_base.csv',
  'materials_all.csv',
  'product_base.csv',
  'currency_base.csv',
  'compost_matrix_base.csv'
];

/** 与 build-items-json 一致：旧轨 CSV 列 → JSON use_effect 子键 */
const DEPRECATED_CSV_RESTORE_COLS = ['satiety_restore', 'thirst_restore', 'nutrition_restore'];

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

function collectPathsFromTemplate(tpl) {
  const paths = new Set();
  if (!tpl || typeof tpl !== 'object' || Array.isArray(tpl)) return paths;
  for (const k of Object.keys(tpl)) {
    paths.add(k);
    if (k === 'use_effect' && tpl[k] && typeof tpl[k] === 'object' && !Array.isArray(tpl[k])) {
      for (const sk of Object.keys(tpl[k])) {
        paths.add(`use_effect.${sk}`);
      }
    }
  }
  return paths;
}

function unionTemplateFieldPaths(itemsMap, equipmentMap) {
  const union = new Set();
  for (const id of Object.keys(itemsMap)) {
    const tpl = itemsMap[id];
    for (const p of collectPathsFromTemplate(tpl)) union.add(p);
  }
  for (const id of Object.keys(equipmentMap)) {
    if (id === '_comment') continue;
    const tpl = equipmentMap[id];
    for (const p of collectPathsFromTemplate(tpl)) union.add(p);
  }
  return union;
}

function countItemsWithUseEffect(itemsMap) {
  let n = 0;
  const ids = [];
  for (const id of Object.keys(itemsMap)) {
    const tpl = itemsMap[id];
    if (tpl && tpl.use_effect && typeof tpl.use_effect === 'object' && !Array.isArray(tpl.use_effect)) {
      if (Object.keys(tpl.use_effect).length) {
        n++;
        ids.push(id);
      }
    }
  }
  return { count: n, itemIds: ids };
}

function numOrNull(s) {
  if (s === '' || s == null) return null;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function cellActivatesLegacyRestore(cell) {
  const t = String(cell == null ? '' : cell).trim();
  if (t === '') return false;
  const n = numOrNull(t);
  if (n != null) return n !== 0;
  return true;
}

function auditCsvDeprecatedColumns() {
  const perFile = [];
  for (const fname of MERGE_FILES) {
    const fp = path.join(ITEMS_DIR, fname);
    const rec = { file: fname, exists: fs.existsSync(fp), headers: [], colIndex: {}, rowsWithAnyLegacyCell: 0, sampleRows: [] };
    if (!rec.exists) {
      perFile.push(rec);
      continue;
    }
    const raw = fs.readFileSync(fp, 'utf8');
    const rows = parseCsv(raw.replace(/^\uFEFF/, ''));
    if (!rows.length) {
      perFile.push(rec);
      continue;
    }
    const headers = trimRow(rows[0]).map((h) => h.trim());
    rec.headers = headers;
    for (const col of DEPRECATED_CSV_RESTORE_COLS) {
      const idx = headers.indexOf(col);
      rec.colIndex[col] = idx;
    }
    const hasAnyCol = DEPRECATED_CSV_RESTORE_COLS.some((c) => rec.colIndex[c] >= 0);
    if (!hasAnyCol) {
      perFile.push(rec);
      continue;
    }
    for (let r = 1; r < rows.length; r++) {
      const cells = trimRow(rows[r]);
      if (!cells.length || (cells.length === 1 && cells[0] === '')) continue;
      let hit = false;
      for (const col of DEPRECATED_CSV_RESTORE_COLS) {
        const idx = rec.colIndex[col];
        if (idx < 0) continue;
        if (cellActivatesLegacyRestore(cells[idx])) {
          hit = true;
          break;
        }
      }
      if (hit) {
        rec.rowsWithAnyLegacyCell++;
        if (rec.sampleRows.length < 5) {
          const id = cells[0] || '(no id)';
          rec.sampleRows.push(id);
        }
      }
    }
    perFile.push(rec);
  }
  return perFile;
}

function printSection(title) {
  console.log('');
  console.log('='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

function main() {
  const items = JSON.parse(fs.readFileSync(ITEMS_JSON, 'utf8'));
  const equipment = JSON.parse(fs.readFileSync(EQUIP_JSON, 'utf8'));
  const rulesDoc = JSON.parse(fs.readFileSync(RULES_JSON, 'utf8'));
  const ruleFields = rulesDoc.fields && typeof rulesDoc.fields === 'object' ? rulesDoc.fields : {};
  const ruleKeys = Object.keys(ruleFields).sort();
  const ruleKeySet = new Set(ruleKeys);

  const itemPaths = new Set();
  for (const id of Object.keys(items)) {
    for (const p of collectPathsFromTemplate(items[id])) itemPaths.add(p);
  }
  const equipPaths = new Set();
  for (const id of Object.keys(equipment)) {
    if (id === '_comment') continue;
    for (const p of collectPathsFromTemplate(equipment[id])) equipPaths.add(p);
  }
  const unionPaths = unionTemplateFieldPaths(items, equipment);
  const unionArr = [...unionPaths].sort();

  printSection('1) 模板字段路径（扁平 + use_effect.*）');
  console.log('items.json 不同字段数:', itemPaths.size);
  console.log('equipment.json 不同字段数:', equipPaths.size);
  console.log('并集 items ∪ equipment 字段数:', unionArr.length);
  console.log('');
  console.log('并集字段列表（字典序）：');
  console.log(unionArr.join(', '));

  const rulesNotInData = ruleKeys.filter((k) => !unionPaths.has(k));
  const dataNotInRules = unionArr.filter((k) => !ruleKeySet.has(k));

  printSection('2) 规则表有定义、但当前 items/equipment 模板从未出现的字段');
  if (rulesNotInData.length) {
    rulesNotInData.forEach((k) => console.log('  - ' + k));
  } else {
    console.log('  （无）');
  }

  printSection('3) 当前模板出现、但 item-field-display-rules.json 未覆盖的字段');
  console.log('  数量:', dataNotInRules.length);
  if (dataNotInRules.length <= 80) {
    dataNotInRules.forEach((k) => console.log('  - ' + k));
  } else {
    dataNotInRules.slice(0, 80).forEach((k) => console.log('  - ' + k));
    console.log('  ... 另有 ' + (dataNotInRules.length - 80) + ' 条，略。');
  }

  printSection('4) 废弃口径：CSV 旧轨列 + JSON use_effect');
  console.log('说明：satiety_restore / thirst_restore / nutrition_restore 为旧轨，构建后写入 use_effect.*；');
  console.log('      新展示分块以 edible + edible_buff_id 为主轨；use_effect 即时恢复不进新分块（见设计 §8.4）。');
  console.log('');
  const csvAudit = auditCsvDeprecatedColumns();
  for (const rec of csvAudit) {
    console.log('文件: ' + rec.file + (rec.exists ? '' : ' （缺失）'));
    if (!rec.exists) continue;
    const present = DEPRECATED_CSV_RESTORE_COLS.filter((c) => rec.colIndex[c] >= 0);
    if (!present.length) {
      console.log('  表头：无 ' + DEPRECATED_CSV_RESTORE_COLS.join('/') + ' 列');
      continue;
    }
    console.log('  表头含列: ' + present.join(', '));
    console.log('  含「非空且非零数值」或「非数值非空」的行数（会生成 use_effect 分量）: ' + rec.rowsWithAnyLegacyCell);
    if (rec.sampleRows.length) console.log('  样例行 id: ' + rec.sampleRows.join(', '));
  }

  const ue = countItemsWithUseEffect(items);
  printSection('5) items.json 中带非空 use_effect 的模板数量');
  console.log('  计数:', ue.count);
  if (ue.itemIds.length) console.log('  item_id: ' + ue.itemIds.join(', '));

  printSection('6) 规则表中 deprecated 标记（字段级）');
  const depInRules = ruleKeys.filter((k) => ruleFields[k] && ruleFields[k].deprecated);
  if (!depInRules.length) {
    console.log('  （无 deprecated 字段）');
  } else {
    depInRules.forEach((k) => console.log('  - ' + k));
  }

  console.log('');
  console.log('[audit-item-field-display-rules] 完成。');
}

main();
