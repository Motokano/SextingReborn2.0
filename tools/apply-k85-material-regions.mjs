/**
 * k85：材料打 region_restrict（地区编码）+ dungeon_only / surface_only 标签（接 42 §七）。
 *
 * 事实源：docs/design/42-dungeon-material-allocation.md 的地表基础池（§二）与七座地牢（§三）分配。
 * 约定：
 *   - region_restrict：0 = 全局；非 0 = 限定地区（编码见 data/regions.json）。
 *   - 跨区材料（地表+地牢 / 地牢+地牢）填 0；纯地牢跨区（如 D2+D4 的 ore_spirit_crystal）仍带 dungeon_only。
 *   - 种植/种子为农牧产出，不入采集掉落池（42 §一.7），不打标签。
 *   - 电池不进采集池（42 §一.5），仅打 region/dungeon_only 标签供敌人掉落（k89）。
 *
 * 写入目标：
 *   - data/items.json（运行时数据源，k83 手工追加的条目不在任何 CSV 中，必须直接改 items.json）
 *   - data/items/*.csv（同步 region_restrict 列与 tags 列，保证下次 npm run build:items 不丢改动）
 *
 * 用法：node tools/apply-k85-material-regions.mjs          # 应用
 *       node tools/apply-k85-material-regions.mjs --dry-run # 只打印计划
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ITEMS_JSON = path.join(ROOT, 'data', 'items.json');
const ITEMS_DIR = path.join(ROOT, 'data', 'items');
const DRY = process.argv.includes('--dry-run');

const REGION = { surface: 1, dungeon_beginner: 2, d1: 3, d2: 4, d3: 5, d4: 6, d5: 7, d6: 8, d7: 9 };

/**
 * id → 地区码（0 = 跨区/全局）。
 * 派生标签：地区码为地牢 → dungeon_only；为地表 → surface_only；为 0 时按 dungeonOnly 显式标记。
 */
const MAP = {
  // ---- 地表基础池（42 §二）----
  wood_oak: REGION.surface, wood_zelkova: REGION.surface, wood_birch: REGION.surface,
  wood_bamboo_green: REGION.surface, wood_firewood: REGION.surface, wood_bits: REGION.surface,
  wood_shrub_dry: REGION.surface, wood_charcoal: REGION.surface,
  ore_clay_raw: REGION.surface, ore_salt_sea_coarse: REGION.surface, ore_salt_rock: REGION.surface,
  herb_green: REGION.surface, herb_sweet: REGION.surface, herb_bitter: REGION.surface,
  herb_leaf_fresh: REGION.surface, herb_vine_red: REGION.surface, herb_shiitake: REGION.surface,
  herb_onion: REGION.surface, herb_garlic: REGION.surface, herb_ginger: REGION.surface,
  herb_scallion: REGION.surface, herb_shallot: REGION.surface,
  herb_parsley: REGION.surface, herb_cilantro: REGION.surface, herb_thyme: REGION.surface,
  herb_rosemary: REGION.surface, herb_sage: REGION.surface, herb_oregano: REGION.surface,
  herb_bay_leaf: REGION.surface, herb_dill: REGION.surface, herb_mustard_yellow: REGION.surface,
  herb_cherry: REGION.surface, herb_pear: REGION.surface, herb_lemon: REGION.surface,
  herb_peanut: REGION.surface, herb_chestnut: REGION.surface, herb_pecan: REGION.surface,
  wild_fruit_red: REGION.surface, wild_fruit_purple: REGION.surface, wild_fruit_yellow: REGION.surface,
  hunt_meat_rabbit: REGION.surface, hunt_meat_boar: REGION.surface, hunt_meat_deer: REGION.surface,
  hunt_turkey: REGION.surface, hunt_squab: REGION.surface, hunt_bone_common: REGION.surface,
  hunt_salo: REGION.surface, textile_cocoon_wild: REGION.surface,

  // ---- 跨区（地表+地牢）：region 0，无粗标签，靠 loot_table 门控 ----
  ore_iron_raw: 0, ore_copper_raw: 0, ore_limestone: 0, ore_salt_sea: 0,
  herb_mushroom_floral: 0, herb_root_bitter: 0,

  // ---- D1 高山哨塔（42 §三）----
  wood_pine: REGION.d1, resin_pine: REGION.d1, ore_granite: REGION.d1,
  hunt_mountain_goat: REGION.d1, hunt_feather: REGION.d1, herb_alpine_herb: REGION.d1,
  herb_juniper_berry: REGION.d1, herb_bamboo_shoot_winter: REGION.d1,
  herb_cardamom_black: REGION.d1, herb_cardamom_green: REGION.d1,
  herb_nutmeg: REGION.d1, herb_mace: REGION.d1, herb_clove: REGION.d1,
  herb_black_pepper_whole: REGION.d1,

  // ---- D2 化工厂药田 ----
  herb_ginseng: REGION.d2, herb_goji: REGION.d2, herb_saffron: REGION.d2,
  herb_vanilla_pod: REGION.d2, ore_salt_black: REGION.d2, ore_lime_water: REGION.d2,
  ore_water_pure_soft: REGION.d2, chem_reagent: REGION.d2, herb_poison_plant: REGION.d2,
  hunt_venom_sac: REGION.d2,

  // ---- D3 主锻炉 ----
  ore_cast_iron: REGION.d3, ore_iron_sand_highcarbon: REGION.d3, ore_steel_ingot: REGION.d3,
  wood_charcoal_fruit: REGION.d3, wood_firewood_fruit: REGION.d3, wood_firewood_rubber: REGION.d3,
  ore_sulfur: REGION.d3, ore_scrap_metal: REGION.d3, oil_heavy: REGION.d3, forge_flux: REGION.d3,

  // ---- D4 矿坑拳场 ----
  gem_ruby: REGION.d4, gem_sapphire: REGION.d4, ore_gold_raw: REGION.d4,
  ore_silver_raw: REGION.d4, hunt_horn: REGION.d4,

  // ---- D5 沿岸堂口 ----
  herb_kombu: REGION.d5, wood_coconut: REGION.d5, herb_cacao_pod: REGION.d5,
  herb_candlenut: REGION.d5, herb_bunga_kantan: REGION.d5, herb_laksa_leaf: REGION.d5,
  herb_galangal: REGION.d5,
  hunt_fish_bonito: REGION.d5, hunt_fish_eel: REGION.d5, hunt_shrimp: REGION.d5,
  hunt_crab: REGION.d5, hunt_mussel: REGION.d5, hunt_cockle: REGION.d5,
  hunt_abalone: REGION.d5, hunt_sea_cucumber: REGION.d5, hunt_fish_maw: REGION.d5,
  hunt_scallop_dried: REGION.d5, textile_coir: REGION.d5,

  // ---- D6 城市废墟 ----
  textile_cocoon_domestic: REGION.d6, wood_apple: REGION.d6, wood_orange: REGION.d6,
  wood_olive: REGION.d6, herb_orange_peel_dried: REGION.d6,
  electronic_component: REGION.d6, paper_scrap: REGION.d6, leather_fine: REGION.d6,
  item_porcelain: REGION.d6, item_glass: REGION.d6, food_wine: REGION.d6,
  battery_rechargeable: REGION.d6,

  // ---- D7 地下暗道 ----
  metal_pipe: REGION.d7, mechanical_parts: REGION.d7, generator_parts: REGION.d7,
  supply_crate_old: REGION.d7, battery_storage: REGION.d7,

  // ---- 跨区（地牢+地牢）：region 0，仍带 dungeon_only ----
  ore_spirit_crystal: { region: 0, dungeonOnly: true },
  electronic_wire: { region: 0, dungeonOnly: true }
};

const DUNGEON_CODES = new Set(Object.values(REGION).filter((c) => c !== REGION.surface));

function resolve(entry) {
  if (typeof entry === 'number') {
    const region = entry;
    const tag = region === 0 ? null : (DUNGEON_CODES.has(region) ? 'dungeon_only' : 'surface_only');
    return { region, tag };
  }
  const tag = entry.dungeonOnly ? 'dungeon_only' : null;
  return { region: entry.region, tag };
}

function mergeTag(existingTags, tag) {
  if (!tag) return existingTags;
  const parts = String(existingTags || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (!parts.includes(tag)) parts.push(tag);
  return parts.join(';');
}

// ---------- CSV 读写（与 build-items-json.mjs 同一套解析口径） ----------
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

function serializeCsv(rows) {
  return rows.map((r) => r.join(',')).join('\n');
}

function main() {
  const items = JSON.parse(fs.readFileSync(ITEMS_JSON, 'utf8'));
  const missing = Object.keys(MAP).filter((id) => !items[id]);
  if (missing.length) {
    console.error('[apply-k85] 缺失 item_id（items.json 中不存在）: ' + missing.join(', '));
    process.exit(1);
  }

  // 收集 CSV 索引：id → { file, rowIndex, headerIndex }
  const csvIndex = new Map();
  const csvFiles = fs.readdirSync(ITEMS_DIR).filter((f) => f.endsWith('.csv'));
  for (const fname of csvFiles) {
    const raw = fs.readFileSync(path.join(ITEMS_DIR, fname), 'utf8').replace(/^\uFEFF/, '');
    const rows = parseCsv(raw);
    if (!rows.length) continue;
    const header = rows[0].map((h) => h.trim());
    const tagsIdx = header.indexOf('tags');
    const rrIdx = header.indexOf('region_restrict');
    for (let r = 1; r < rows.length; r++) {
      const id = String(rows[r][0] || '').trim();
      if (!id) continue;
      if (!csvIndex.has(id)) csvIndex.set(id, { file: fname, row: rows[r], tagsIdx, rrIdx, header });
    }
  }

  let csvFound = 0, csvMissing = 0;
  const plan = Object.keys(MAP).sort().map((id) => {
    const { region, tag } = resolve(MAP[id]);
    const item = items[id];
    const newTags = mergeTag(item.tags, tag);
    const oldRr = item.region_restrict != null ? item.region_restrict : 0;
    const changed = oldRr !== region || newTags !== (item.tags || '');
    const inCsv = csvIndex.has(id);
    if (inCsv) csvFound++; else csvMissing++;
    return { id, region, tag, oldRr, oldTags: item.tags || '', newTags, changed, inCsv };
  });

  const changedCount = plan.filter((p) => p.changed).length;
  console.log('[apply-k85] 计划条目 ' + plan.length + '（将变更 ' + changedCount + '），CSV 命中 ' + csvFound + ' / 仅 items.json ' + csvMissing + '，' + (DRY ? 'DRY-RUN 不写盘' : '将写盘'));

  // 汇总每个地区码的条目数（便于核对 42）
  const byRegion = {};
  plan.forEach((p) => { byRegion[p.region] = (byRegion[p.region] || 0) + 1; });
  console.log('[apply-k85] 按地区码计数: ' + JSON.stringify(byRegion));

  if (DRY) {
    const changed = plan.filter((p) => p.changed);
    changed.forEach((p) => {
      console.log(`  ${p.id}: region_restrict ${p.oldRr}→${p.region}${p.tag ? ' +' + p.tag : ''} | tags "${p.oldTags}" → "${p.newTags}"${p.inCsv ? ' [csv]' : ''}`);
    });
    return;
  }

  // 1) items.json
  plan.forEach((p) => {
    const item = items[p.id];
    item.region_restrict = p.region;
    item.tags = p.newTags;
  });
  const ordered = {};
  Object.keys(items).sort().forEach((k) => { ordered[k] = items[k]; });
  fs.writeFileSync(ITEMS_JSON, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
  console.log('[apply-k85] 已写 ' + ITEMS_JSON + '（' + Object.keys(ordered).length + ' items）');

  // 2) CSVs（只改 tags / region_restrict 两列，其余原样）
  const touchedFiles = new Set();
  plan.forEach((p) => {
    const hit = csvIndex.get(p.id);
    if (!hit) return;
    const { row, tagsIdx, rrIdx } = hit;
    if (tagsIdx >= 0 && row.length > tagsIdx) row[tagsIdx] = p.newTags;
    if (rrIdx >= 0 && row.length > rrIdx) row[rrIdx] = String(p.region);
    touchedFiles.add(hit.file);
  });
  for (const fname of touchedFiles) {
    const fp = path.join(ITEMS_DIR, fname);
    const raw = fs.readFileSync(fp, 'utf8').replace(/^\uFEFF/, '');
    const rows = parseCsv(raw);
    const header = rows[0].map((h) => h.trim());
    const tagsIdx = header.indexOf('tags');
    const rrIdx = header.indexOf('region_restrict');
    const byRowId = new Map();
    for (let r = 1; r < rows.length; r++) byRowId.set(String(rows[r][0] || '').trim(), rows[r]);
    for (const p of plan) {
      const row = byRowId.get(p.id);
      if (!row) continue;
      if (tagsIdx >= 0 && row.length > tagsIdx) row[tagsIdx] = p.newTags;
      if (rrIdx >= 0 && row.length > rrIdx) row[rrIdx] = String(p.region);
    }
    fs.writeFileSync(fp, serializeCsv(rows) + '\n', 'utf8');
    console.log('[apply-k85] 已写 ' + fp);
  }
}

main();
