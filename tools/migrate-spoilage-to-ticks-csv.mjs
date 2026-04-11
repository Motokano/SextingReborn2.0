/**
 * 一次性迁移：将 data/items/*.csv 表头 spoilage 改为 spoilage_ticks，
 * 并把 none/fast/slow 映射为数字（0 / 600 / 3600）。
 * 若已无 spoilage 列则跳过对应文件。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'data', 'items');

const FILES = ['consumables_base.csv', 'materials_all.csv', 'product_base.csv', 'currency_base.csv'];

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

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function stringifyCsv(headers, dataRows) {
  const out = [headers.map(csvEscape).join(',')];
  for (const cells of dataRows) {
    const row = [];
    for (let i = 0; i < headers.length; i++) {
      row.push(csvEscape(cells[i] !== undefined ? cells[i] : ''));
    }
    out.push(row.join(','));
  }
  return out.join('\n') + '\n';
}

function mapSpoilageCell(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!s || s === 'none') return '0';
  if (s === 'fast') return '600';
  if (s === 'slow') return '3600';
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n >= 0) return String(n);
  return '0';
}

function migrateFile(fname) {
  const fp = path.join(ITEMS_DIR, fname);
  if (!fs.existsSync(fp)) {
    console.log('[skip] missing', fp);
    return;
  }
  const text = fs.readFileSync(fp, 'utf8');
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (!rows.length) return;
  const headers = trimRow(rows[0]);
  const spoilIdx = headers.indexOf('spoilage');
  const ticksIdx = headers.indexOf('spoilage_ticks');
  if (spoilIdx < 0 && ticksIdx >= 0) {
    console.log('[skip] already spoilage_ticks:', fname);
    return;
  }
  if (spoilIdx < 0) {
    console.log('[skip] no spoilage column:', fname);
    return;
  }
  headers[spoilIdx] = 'spoilage_ticks';
  const dataRows = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells || !cells.length || (cells.length === 1 && String(cells[0]).trim() === '')) continue;
    const line = [];
    for (let c = 0; c < headers.length; c++) {
      if (c === spoilIdx) {
        const old = cells[c] !== undefined ? cells[c] : '';
        line.push(mapSpoilageCell(old));
      } else {
        line.push(cells[c] !== undefined ? cells[c] : '');
      }
    }
    while (line.length < headers.length) line.push('');
    dataRows.push(line);
  }
  fs.writeFileSync(fp, stringifyCsv(headers, dataRows), 'utf8');
  console.log('[ok]', fname, 'rows', dataRows.length);
}

for (const f of FILES) migrateFile(f);
