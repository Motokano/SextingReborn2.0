/**
 * 为 data/items/*.csv 追加 pharmacy_ingredient 列（若尚无）。
 * 与 build-items-json 同口径：1/true/yes → items.json 写入 pharmacy_ingredient: true。
 * 可重复执行；新列默认空（视为不可作制药投料）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'data', 'items');

const FILES = [
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

function escapeField(f) {
  const s = f == null ? '' : String(f);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function rowToLine(row) {
  return row.map(escapeField).join(',');
}

function padRow(row, len) {
  const out = row.slice();
  while (out.length < len) out.push('');
  return out;
}

function main() {
  for (const fname of FILES) {
    const fp = path.join(ITEMS_DIR, fname);
    if (!fs.existsSync(fp)) {
      console.warn('[ensure-pharmacy-ingredient] skip missing', fp);
      continue;
    }
    const raw = fs.readFileSync(fp, 'utf8').replace(/^\uFEFF/, '');
    const rows = parseCsv(raw);
    if (!rows.length) continue;
    const headerRow = rows[0].map((h) => String(h).trim());
    if (headerRow.includes('pharmacy_ingredient')) {
      console.log('[ensure-pharmacy-ingredient] already has column:', fname);
      continue;
    }
    headerRow.push('pharmacy_ingredient');
    const hLen = headerRow.length;
    const outLines = [rowToLine(headerRow)];
    for (let r = 1; r < rows.length; r++) {
      const cells = padRow(rows[r], hLen - 1);
      cells.push('');
      outLines.push(rowToLine(cells));
    }
    fs.writeFileSync(fp, outLines.join('\n') + '\n', 'utf8');
    console.log('[ensure-pharmacy-ingredient] updated', fname, '(' + (outLines.length - 1) + ' rows)');
  }
}

main();
