// One-time, repeatable source-table and reference migration for hunting items.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const renames = {
  hunt_bacon_smoked: 'cook_bacon_smoked', hunt_salo: 'cook_salo',
  hunt_snail_land: 'fish_snail_land', hunt_abalone: 'fish_abalone',
  hunt_cockle: 'fish_cockle', hunt_crab: 'fish_crab',
  hunt_fish_bonito: 'fish_bonito', hunt_fish_eel: 'fish_eel',
  hunt_fish_maw: 'fish_maw', hunt_mussel: 'fish_mussel',
  hunt_scallop_dried: 'fish_scallop_dried', hunt_sea_cucumber: 'fish_sea_cucumber',
  hunt_shrimp: 'fish_shrimp', weapon_javelin_stone: 'consumable_javelin_stone'
};
const original = JSON.parse(fs.readFileSync(path.join(root, 'data/items.json'), 'utf8'));
for (const [oldId, newId] of Object.entries(renames)) {
  if (original[oldId] && original[newId]) throw new Error(`ID collision: ${newId}`);
}
const self = fileURLToPath(import.meta.url);
const pattern = new RegExp(`\\b(${Object.keys(renames).join('|')})\\b`, 'g');
function visit(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (!['node_modules', '.git'].includes(ent.name)) visit(p); continue; }
    if (p === self || !/\.(json|csv|js|mjs|cjs|html|md)$/.test(p)) continue;
    const before = fs.readFileSync(p, 'utf8');
    const after = before.replace(pattern, id => renames[id]);
    if (after !== before) fs.writeFileSync(p, after);
  }
}
for (const dir of ['data', 'js', 'tools', 'docs', 'capitalism']) visit(path.join(root, dir));

// Only the affected rows are rewritten; their fields contain no quoted commas.
function editCsv(relative, edit) {
  const p = path.join(root, relative), text = fs.readFileSync(p, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/), headers = lines[0].split(',');
  const out = [lines[0]];
  for (const line of lines.slice(1)) {
    if (!line) { out.push(line); continue; }
    const id = line.slice(0, line.indexOf(','));
    const changes = edit(id);
    if (changes === null) continue;
    if (!changes) { out.push(line); continue; }
    if (line.includes('"')) throw new Error(`Quoted affected row: ${id}`);
    const cells = line.split(',');
    for (const [key, value] of Object.entries(changes)) {
      const index = headers.indexOf(key);
      if (index < 0) throw new Error(`Missing column ${key}`);
      cells[index] = value;
    }
    out.push(cells.join(','));
  }
  fs.writeFileSync(p, out.join(eol));
}
const fishing = new Set(Object.values(renames).filter(id => id.startsWith('fish_')));
editCsv('data/items/materials_all.csv', id => {
  if (fishing.has(id)) return { category: 'fish', source: 'fishing' };
  if (['cook_bacon_smoked', 'cook_salo'].includes(id)) return { category: 'material', source: 'cooking' };
});
editCsv('data/items/product_base.csv', id => {
  if (id === 'armor_leather_vest_basic') return null;
  if (id === 'consumable_javelin_stone') return {
    category: 'consumable', sub_category: 'hunting', tags: 'consumable;hunting;throw',
    source: 'craft', production_lines: 'craft', weapon_attack_power: '', skill_coef: '',
    fn: '石尖绑在木杆前端，用于狩猎投掷。每次投掷消耗一支，未命中也不回收。'
  };
});
console.log('Hunting source tables and references migrated; rebuild data/items.json next.');
