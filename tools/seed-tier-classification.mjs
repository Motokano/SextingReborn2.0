/**
 * 50 种种子五档分类（现实价值 + 种植难度）→ agriculture-seed-shop.json + seeds_farming.csv
 * 用法：node tools/seed-tier-classification.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOP_JSON = path.join(ROOT, 'data', 'agriculture-seed-shop.json');
const CSV_PATH = path.join(ROOT, 'data', 'items', 'seeds_farming.csv');
const EMBED_JS = path.join(__dirname, 'agriculture-seed-shop.embed.js');
const EMBED_JS_JS = path.join(ROOT, 'js', 'agriculture-seed-shop.embed.js');

/** @type {Record<string, { tier: number, price: number, grow_note: string }>} */
const TIER_META = {
  seed_maize: { tier: 1, price: 7, grow_note: '耐旱广种，一季收' },
  seed_rice: { tier: 1, price: 6, grow_note: '水田主食，需稳水' },
  seed_wheat: { tier: 1, price: 6, grow_note: '冬夏麦，田间常规' },
  seed_potato: { tier: 1, price: 6, grow_note: '种薯下沟，易管' },
  seed_cabbage: { tier: 1, price: 6, grow_note: '秋冬包心，常规菜' },
  seed_carrot: { tier: 1, price: 6, grow_note: '撒沟直根，易种' },
  seed_radish_white: { tier: 1, price: 6, grow_note: '快生根茎' },
  seed_sprout: { tier: 1, price: 6, grow_note: '湿布催芽，数日收' },
  seed_cucumber: { tier: 1, price: 7, grow_note: '架栽脆瓜，夏季常见' },
  seed_beans_white_haricot: { tier: 1, price: 7, grow_note: '扁豆熬粥，易栽培' },

  seed_green_beans: { tier: 2, price: 8, grow_note: '搭架嫩荚' },
  seed_tomato: { tier: 2, price: 9, grow_note: '育苗移栽' },
  seed_tomato_green: { tier: 2, price: 9, grow_note: '硬果腌渍品种' },
  seed_beet: { tier: 2, price: 8, grow_note: '甜菜根，常规管理' },
  seed_onion: { tier: 2, price: 7, grow_note: '育苗球葱' },
  seed_garlic: { tier: 2, price: 8, grow_note: '蒜瓣下种' },
  seed_scallion: { tier: 2, price: 7, grow_note: '长管葱，常规' },
  seed_garrofo: { tier: 2, price: 9, grow_note: '大芸豆，煮汤用' },
  seed_peanut: { tier: 2, price: 10, grow_note: '地下结荚，基准作物' },
  seed_sugarcane: { tier: 2, price: 8, grow_note: '蔗节埋条，耗地' },

  seed_rice_bomba: { tier: 3, price: 10, grow_note: '短粒稻，需精细水肥' },
  seed_rice_glutinous_round: { tier: 3, price: 10, grow_note: '糯稻，水分敏感' },
  seed_wheat_durum: { tier: 3, price: 10, grow_note: '硬质麦，筋道面用' },
  seed_ginger: { tier: 3, price: 10, grow_note: '姜块暖畦' },
  seed_shallot: { tier: 3, price: 9, grow_note: '红葱头，炼油用' },
  seed_cilantro: { tier: 3, price: 9, grow_note: '香菜，温度敏感' },
  seed_leek: { tier: 3, price: 11, grow_note: '韭葱白管，周期略长' },
  seed_celery: { tier: 3, price: 10, grow_note: '西芹育苗，水分要求高' },
  seed_chili_red: { tier: 3, price: 10, grow_note: '红椒，温热气候' },
  seed_mustard_seed: { tier: 3, price: 10, grow_note: '芥末籽，香料作物' },

  seed_rice_basmati: { tier: 4, price: 14, grow_note: '长粒香稻，溢价米' },
  seed_euryale: { tier: 4, price: 14, grow_note: '芡实，池沼栽植' },
  seed_konjac: { tier: 4, price: 12, grow_note: '魔芋，收后须处理' },
  seed_sesame: { tier: 4, price: 12, grow_note: '油料小粒，成熟齐收' },
  seed_pumpkin_seed: { tier: 4, price: 13, grow_note: '南瓜兼籽，蔓生占地' },
  seed_turmeric: { tier: 4, price: 12, grow_note: '姜黄块根，染色用' },
  seed_fennel_seed: { tier: 4, price: 12, grow_note: '小茴香，香料专种' },
  seed_coriander_seed: { tier: 4, price: 12, grow_note: '芫荽籽，香料兼种' },
  seed_plantain: { tier: 4, price: 13, grow_note: '大蕉芽苗，热带移栽' },
  seed_chestnut: { tier: 4, price: 13, grow_note: '板栗，成树后收' },

  seed_bamboo_shoot: { tier: 5, price: 18, grow_note: '竹鞭发笋，多年生' },
  seed_star_anise: { tier: 5, price: 20, grow_note: '八角树，多年成树' },
  seed_cumin: { tier: 5, price: 16, grow_note: '孜然，干旱区精细管理' },
  seed_chili_kashmir: { tier: 5, price: 17, grow_note: '克什米尔椒，高价值香料' },
  seed_lemon: { tier: 5, price: 18, grow_note: '柠檬，盆栽多年结果' },
  seed_apricot: { tier: 5, price: 19, grow_note: '杏树，核种育苗' },
  seed_pear: { tier: 5, price: 18, grow_note: '梨树，宜嫁接优良品' },
  seed_cherry: { tier: 5, price: 22, grow_note: '樱桃，需冷层与精细管理' },
  seed_almond: { tier: 5, price: 24, grow_note: '扁桃，多年成树高价值' },
  seed_lotus_seed: { tier: 5, price: 17, grow_note: '莲子，池栽水生精品' }
};

const TIER_LABELS = {
  1: '一档 · 大宗易种',
  2: '二档 · 常见田园',
  3: '三档 · 精品粮油',
  4: '四档 · 特种经济',
  5: '五档 · 珍稀高值'
};

/** Demo 商店：按累计交易额解锁购买；一档无门槛，二档 2000，之后每档 +2000 */
const TIER_TRADE_UNLOCK = { 1: 0, 2: 2000, 3: 4000, 4: 6000, 5: 8000 };
const TIER_TRADE_UNLOCK_STEP = 2000;

const shop = JSON.parse(fs.readFileSync(SHOP_JSON, 'utf8'));
const missing = [];
for (const s of shop.seeds) {
  const m = TIER_META[s.item_id];
  if (!m) {
    missing.push(s.item_id);
    continue;
  }
  s.tier = m.tier;
  s.price = m.price;
  s.grow_note = m.grow_note;
}
if (missing.length) {
  console.error('Missing tier for:', missing.join(', '));
  process.exit(1);
}
if (shop.seeds.length !== 50) {
  console.error('Expected 50 seeds, got', shop.seeds.length);
  process.exit(1);
}

shop.schema_version = 2;
shop.tiers = TIER_LABELS;
shop.tier_order = [1, 2, 3, 4, 5];
shop.tier_trade_unlock = TIER_TRADE_UNLOCK;
shop.tier_trade_unlock_step = TIER_TRADE_UNLOCK_STEP;
shop.demo_sell_price = shop.demo_sell_price || { seed_ratio: 0.5, crop_ratio: 0.8, min: 3 };
fs.writeFileSync(SHOP_JSON, JSON.stringify(shop, null, 2) + '\n', 'utf8');

const csvRaw = fs.readFileSync(CSV_PATH, 'utf8');
const lines = csvRaw.replace(/\r\n/g, '\n').split('\n');
const header = lines[0].split(',');
let tierCol = header.indexOf('seed_tier');
if (tierCol < 0) {
  header.push('seed_tier');
  tierCol = header.length - 1;
}
const out = [header.join(',')];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const cols = line.split(',');
  const id = cols[0];
  const m = TIER_META[id];
  if (!m) {
    console.error('CSV row missing tier:', id);
    process.exit(1);
  }
  while (cols.length < header.length) cols.push('');
  cols[tierCol] = String(m.tier);
  out.push(cols.join(','));
}
fs.writeFileSync(CSV_PATH, out.join('\n') + '\n', 'utf8');

const embedLine =
  '/* AUTO-GENERATED by tools/seed-tier-classification.mjs — do not edit */\n'
  + 'window.AGRICULTURE_SEED_SHOP = '
  + JSON.stringify(shop)
  + ';\n';
for (const p of [EMBED_JS, EMBED_JS_JS]) {
  fs.writeFileSync(p, embedLine, 'utf8');
}

const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
for (const s of shop.seeds) counts[s.tier]++;
console.log('Updated', SHOP_JSON, CSV_PATH);
console.log('Tier counts:', counts);
console.log('Embed:', EMBED_JS, EMBED_JS_JS);
