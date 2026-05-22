/**
 * 扫描 data/items.json 与 data/equipment.json 中「模板对象」的顶层键集合，
 * 用于与设计文档 docs/design/27-item-template-fields-inventory.md 对账。
 * 用法：node tools/audit-item-template-keys.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function collectTemplateKeys(mapJson, options) {
  const opts = options || {};
  const skipTopLevel = opts.skipTopLevelKeys || [];
  const set = new Set();
  const nestedUnder = opts.nestedUnder || null;
  const nested = nestedUnder ? new Set() : null;

  for (const top of Object.keys(mapJson)) {
    if (skipTopLevel.indexOf(top) >= 0) continue;
    const tpl = mapJson[top];
    if (!tpl || typeof tpl !== 'object' || Array.isArray(tpl)) continue;
    for (const k of Object.keys(tpl)) {
      set.add(k);
      if (nested && k === nestedUnder && tpl[k] && typeof tpl[k] === 'object' && !Array.isArray(tpl[k])) {
        for (const nk of Object.keys(tpl[k])) nested.add(nk);
      }
    }
  }
  return { keys: set, nestedKeys: nested };
}

function main() {
  const itemsPath = path.join(ROOT, 'data', 'items.json');
  const equipPath = path.join(ROOT, 'data', 'equipment.json');

  const itemsRaw = fs.readFileSync(itemsPath, 'utf8');
  const equipRaw = fs.readFileSync(equipPath, 'utf8');
  const items = JSON.parse(itemsRaw);
  const equipment = JSON.parse(equipRaw);

  const itemRes = collectTemplateKeys(items, { nestedUnder: 'use_effect' });
  const eqRes = collectTemplateKeys(equipment, { skipTopLevelKeys: ['_comment'] });

  const itemArr = [...itemRes.keys].sort();
  const eqArr = [...eqRes.keys].sort();

  const union = new Set([...itemRes.keys, ...eqRes.keys]);
  const unionArr = [...union].sort();

  console.log('[audit-item-template-keys] data/items.json template key count:', itemArr.length);
  console.log(itemArr.join(', '));
  console.log('');
  console.log('[audit-item-template-keys] data/equipment.json template key count:', eqArr.length);
  console.log(eqArr.join(', '));
  console.log('');
  console.log('[audit-item-template-keys] union (items ∪ equipment) key count:', unionArr.length);
  console.log(unionArr.join(', '));
  if (itemRes.nestedKeys && itemRes.nestedKeys.size) {
    console.log('');
    console.log('[audit-item-template-keys] use_effect subkeys present in items:', [...itemRes.nestedKeys].sort().join(', '));
  } else {
    console.log('');
    console.log('[audit-item-template-keys] no use_effect objects found in items.json (no subkeys to list).');
  }
}

main();
