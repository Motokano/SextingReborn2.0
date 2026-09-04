// k85 收尾校验：JSON 可解析 + CSV 行列完整性 + 与 HEAD 版本对比（确认脚本未破坏行结构）
// 用法：node tools/verify-k85-final.mjs [HEAD_materials.csv] [HEAD_consumables.csv]
// 例：先 git show HEAD:data/items/materials_all.csv > %TEMP%\head_mat.csv
import fs from 'fs';

const regions = JSON.parse(fs.readFileSync('data/regions.json', 'utf8'));
const loot = JSON.parse(fs.readFileSync('data/loot_tables.json', 'utf8'));
const items = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
console.log('regions.json OK, regions:', Object.keys(regions.regions).length,
  '| region_gated all boolean:', Object.values(regions.regions).every((r) => typeof r.region_gated === 'boolean'));
console.log('loot_tables.json OK, tables:', Object.keys(loot).join(', '));
console.log('items.json OK, items:', Object.keys(items).length);

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

const PAIRS = [
  ['data/items/materials_all.csv', process.argv[2]],
  ['data/items/consumables_base.csv', process.argv[3]]
];
for (const [work, headPath] of PAIRS) {
  const workRows = parseCsv(fs.readFileSync(work, 'utf8').replace(/^\uFEFF/, ''));
  const hdr = workRows[0].map((x) => x.trim());
  const tagsIdx = hdr.indexOf('tags');
  const rrIdx = hdr.indexOf('region_restrict');
  const ids = workRows.slice(1).map((r) => String(r[0] || '').trim()).filter(Boolean);
  const dup = ids.filter((id, idx) => ids.indexOf(id) !== idx);
  const short = workRows.slice(1).filter((r) => r.length < hdr.length).length;
  const nonZero = workRows.slice(1).filter((r) => r[rrIdx] && r[rrIdx] !== '0').length;
  const tagged = workRows.slice(1).filter((r) => String(r[tagsIdx] || '').includes('_only')).length;
  console.log(work, '| rows:', workRows.length - 1, '| cols:', hdr.length,
    '| dup ids:', dup.length ? '[' + dup.join(',') + ']' : 'none',
    '| short rows:', short, '| region!=0:', nonZero, '| _only tagged:', tagged);

  if (headPath && fs.existsSync(headPath)) {
    const headRows = parseCsv(fs.readFileSync(headPath, 'utf8').replace(/^\uFEFF/, ''));
    const headHdrLen = headRows[0].length;
    const headShort = headRows.slice(1).filter((r) => r.length < headHdrLen).length;
    // 结构对比：行数、每行字段数分布应一致（允许 tags/region_restrict 两个单元格内容变化）
    const headLenDist = headRows.slice(1).map((r) => r.length).join(',');
    const workLenDist = workRows.slice(1).map((r) => r.length).join(',');
    console.log('   HEAD rows:', headRows.length - 1, '| HEAD short rows:', headShort,
      '| 字段数分布一致:', headLenDist === workLenDist);
  }
}
