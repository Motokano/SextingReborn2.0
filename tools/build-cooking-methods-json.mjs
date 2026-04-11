/**
 * 将 data/cooking-methods.csv 生成 data/cooking-methods.json（运行时唯一读取的技法表）。
 * 用法：node tools/build-cooking-methods-json.mjs
 *
 * 表头（必填列）：
 *   method_id, name, requires_accessory_item_id, fuel_cost, water_cost, craft_ticks, stamina_cost, base_success_rate
 * 可选列：notes（仅备注，不写 JSON）
 * requires_accessory_item_id 留空 → JSON 为 null（烤/焙等基线工艺）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'data', 'cooking-methods.csv');
const OUT_PATH = path.join(ROOT, 'data', 'cooking-methods.json');

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

function parseNonNegInt(s, fallback) {
  const n = Math.floor(Number(String(s).trim()));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function parseRate(s, fallback) {
  const n = Number(String(s).trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('Missing:', CSV_PATH);
    process.exit(1);
  }
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(raw).map(trimRow).filter((r) => r.some((c) => c !== ''));

  if (rows.length < 2) {
    console.error('cooking-methods.csv: need header + at least one data row');
    process.exit(1);
  }

  const header = rows[0].map((h) => h.toLowerCase());
  const idx = (name) => header.indexOf(name);

  const need = ['method_id', 'name', 'requires_accessory_item_id', 'fuel_cost', 'water_cost', 'craft_ticks', 'stamina_cost', 'base_success_rate'];
  for (const col of need) {
    if (idx(col) < 0) {
      console.error('cooking-methods.csv: missing column:', col);
      process.exit(1);
    }
  }

  const methods = {};
  const seen = new Set();
  let errors = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => c === '')) continue;

    const methodId = row[idx('method_id')] || '';
    if (!methodId) {
      console.warn('Skip row', r + 1, ': empty method_id');
      continue;
    }
    if (seen.has(methodId)) {
      console.error('Duplicate method_id:', methodId);
      errors++;
      continue;
    }
    seen.add(methodId);

    const accRaw = row[idx('requires_accessory_item_id')] || '';
    const requiresAccessory = accRaw === '' ? null : accRaw;

    const fuel = parseNonNegInt(row[idx('fuel_cost')], 0);
    const water = parseNonNegInt(row[idx('water_cost')], 0);
    const ticks = parseNonNegInt(row[idx('craft_ticks')], 1);
    const stamina = parseNonNegInt(row[idx('stamina_cost')], 1);
    const rate = parseRate(row[idx('base_success_rate')], 0.5);
    const name = row[idx('name')] || methodId;

    methods[methodId] = {
      method_id: methodId,
      name,
      requires_accessory_item_id: requiresAccessory,
      fuel_cost: fuel,
      water_cost: water,
      craft_ticks: ticks,
      stamina_cost: stamina,
      base_success_rate: rate
    };
  }

  if (errors > 0) {
    console.error('Fix duplicates and re-run.');
    process.exit(1);
  }

  if (Object.keys(methods).length === 0) {
    console.error('No methods parsed from CSV');
    process.exit(1);
  }

  const out = { methods };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log('Wrote', OUT_PATH, 'methods:', Object.keys(methods).length);
}

main();
