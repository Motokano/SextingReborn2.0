/**
 * 标记制药投料（k128④）：为 data/items/*.csv 的 pharmacy_ingredient 列填 1。
 *
 * 用法：
 *   node tools/mark-pharmacy-ingredients.mjs            # 应用规则并写回 CSV
 *   node tools/mark-pharmacy-ingredients.mjs --dry-run  # 只报告，不写文件
 *
 * 规则（唯一口径，见 docs/design/27-item-template-fields-inventory.md §8.2「制药信息」）：
 *   1) tags 含 `alchemy` 的物品 → 可作制药投料（既有约定）。
 *   2) EXPLICIT_IDS 显式清单 → 47 §9.1/§9.6 已点名的原料族（溶媒底液 / 盐 / 糖 / 硫磺 /
 *      兽心·兽骨（强心·凝血原料）/ 药草（苦根草·赤花藤·涩堇草·毒草））。
 * 之后需执行 `npm run build:items` 让 data/items.json 出现 pharmacy_ingredient。
 *
 * 本脚本只改 pharmacy_ingredient 单元格，其余字符原样保留（最小 diff）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'data', 'items');
const DRY_RUN = process.argv.includes('--dry-run');

/** 47 已点名、但 tags 里没有 alchemy 的制药原料。 */
const EXPLICIT_IDS = new Set([
  // 溶媒 / 底液（§9.1：生理盐水·葡萄糖液·纯水）
  'ore_water_pure_soft',
  // 盐（生理盐水原料）
  'ore_salt_sea', 'ore_salt_sea_coarse', 'ore_salt_rock', 'ore_salt_black',
  // 糖（葡萄糖液原料）
  'herb_sugarcane', 'herb_sugar_white',
  // 化工（§9.6：军用爆发针）
  'ore_sulfur',
  // 兽心（复苏/强心原料）
  'hus_beef_heart', 'hus_chicken_heart', 'hus_mutton_heart', 'hus_pork_heart',
  // 兽骨（凝血/钙原料）
  'hus_beef_bone', 'hus_chicken_bone', 'hus_mutton_bone', 'hus_pork_bone',
  // 药草（§6.2/§6.3 示例链点名）
  'herb_root_bitter', 'herb_vine_red', 'herb_bitter', 'herb_poison_plant'
]);

const TAG_RE = /(^|;)alchemy(;|$)/;

function isTarget(id, tags, category) {
  if (EXPLICIT_IDS.has(id)) return true;
  // 熟食（category=food 的成品菜）不因 alchemy 风味标签而成为制药投料。
  if (String(category || '').trim() === 'food') return false;
  return TAG_RE.test(String(tags || ''));
}

/** 只读检测用的引号感知单行解析。 */
function parseCsvLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; continue; }
        inQuotes = false;
        continue;
      }
      field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { out.push(field); field = ''; continue; }
    field += c;
  }
  out.push(field);
  return out;
}

function main() {
  const files = fs.readdirSync(ITEMS_DIR).filter((f) => f.toLowerCase().endsWith('.csv'));
  let totalChanged = 0;
  const report = [];

  for (const fname of files) {
    const fp = path.join(ITEMS_DIR, fname);
    const raw = fs.readFileSync(fp, 'utf8');
    const lines = raw.split(/\r?\n/);
    if (!lines.length) continue;
    const header = lines[0].replace(/^\uFEFF/, '').split(',').map((s) => s.trim());
    const idIdx = header.indexOf('id');
    const tagIdx = header.indexOf('tags');
    const catIdx = header.indexOf('category');
    if (idIdx < 0) continue;

    if (raw.includes('"')) {
      // 含引号字段（如 currency_base.convert_to_high）：仅做只读检测，避免破坏性重写。
      const targets = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cells = parseCsvLine(lines[i]);
        const id = (cells[idIdx] || '').trim();
        const tags = tagIdx >= 0 ? (cells[tagIdx] || '').trim() : '';
        const cat = catIdx >= 0 ? (cells[catIdx] || '').trim() : '';
        if (id && isTarget(id, tags, cat)) targets.push(id);
      }
      if (targets.length) {
        console.error('[mark-pharmacy-ingredients] 中止：' + fname + ' 含引号字段且有制药投料目标 → ' + targets.join(', '));
        process.exitCode = 1;
        return;
      }
      continue;
    }

    let phIdx = header.indexOf('pharmacy_ingredient');
    let headerTouched = false;
    if (phIdx < 0) {
      phIdx = header.length;
      header.push('pharmacy_ingredient');
      lines[0] = lines[0] + ',pharmacy_ingredient';
      headerTouched = true;
    }

    let changed = 0;
    const ids = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cells = line.split(',');
      const id = (cells[idIdx] || '').trim();
      if (!id) continue;
      const tags = tagIdx >= 0 ? (cells[tagIdx] || '').trim() : '';
      const cat = catIdx >= 0 ? (cells[catIdx] || '').trim() : '';
      if (!isTarget(id, tags, cat)) continue;
      if ((cells[phIdx] || '').trim() === '1') continue;
      while (cells.length <= phIdx) cells.push('');
      cells[phIdx] = '1';
      lines[i] = cells.join(',');
      changed++;
      ids.push(id);
    }

    if (changed > 0 || headerTouched) {
      if (!DRY_RUN) fs.writeFileSync(fp, lines.join('\n'), 'utf8');
      totalChanged += changed;
      report.push('  ' + fname + ': +' + changed + (changed ? ' → ' + ids.join(', ') : ''));
    }
  }

  console.log('[mark-pharmacy-ingredients] ' + (DRY_RUN ? '(dry-run) ' : '') + '标记 ' + totalChanged + ' 个物品为制药投料');
  report.forEach((r) => console.log(r));
  if (!DRY_RUN && totalChanged > 0) console.log('[mark-pharmacy-ingredients] 下一步：npm run build:items');
}

main();
