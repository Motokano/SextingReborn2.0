/**
 * 由 agriculture-seed-shop.json 生成作物生长默认参数（五档生长分：越高维越多、窗口越窄）
 * 用法：node tools/gen-agriculture-crop-defs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOP_JSON = path.join(ROOT, 'data', 'agriculture-seed-shop.json');
const OUT_JSON = path.join(ROOT, 'data', 'agriculture-crop-defs.json');
const EMBED_TOOLS = path.join(__dirname, 'agriculture-crop-defs.embed.js');
const EMBED_JS = path.join(ROOT, 'js', 'agriculture-crop-defs.embed.js');

/**
 * 各档生长分参与维与基准（成熟带仍宽裕；高分窗随档位收窄；微量/肥逐档接入）
 * scoreDimensions.trace: false | 'partial' | true
 */
const TIER_SCORING = {
  1: {
    growthTicks: 80,
    minWater: 66,
    maxWater: 378,
    perfectHalfWidth: 102,
    scoreDimensions: { trace: false, fertilizer: false },
    requestsSeaweedExtract: false,
    requestsLiquidFertilizer: false,
    harvestMin: 3,
    harvestMax: 5,
    label: '仅水分+土+轮作；水分高分窗极宽'
  },
  2: {
    growthTicks: 98,
    minWater: 92,
    maxWater: 318,
    perfectHalfWidth: 56,
    scoreDimensions: { trace: 'partial', fertilizer: 'partial' },
    defaultPerfectMinTrace: 30,
    requestsSeaweedExtract: false,
    requestsLiquidFertilizer: false,
    harvestMin: 2,
    harvestMax: 4,
    label: '水分+土+轮作；部分作物接入微量（田园精品）'
  },
  3: {
    growthTicks: 108,
    minWater: 86,
    maxWater: 300,
    perfectHalfWidth: 42,
    scoreDimensions: { trace: true, fertilizer: true },
    defaultPerfectMinTrace: 24,
    defaultPerfectMaxTrace: null,
    defaultPerfectMinFertilizer: 9,
    defaultPerfectMaxFertilizer: 78,
    requestsSeaweedExtract: false,
    requestsLiquidFertilizer: true,
    harvestMin: 2,
    harvestMax: 3,
    label: '水+微量+肥+土+轮作；窗口中等'
  },
  4: {
    growthTicks: 124,
    minWater: 96,
    maxWater: 278,
    perfectHalfWidth: 34,
    scoreDimensions: { trace: true, fertilizer: true },
    defaultPerfectMinTrace: 32,
    defaultPerfectMaxTrace: 94,
    defaultPerfectMinFertilizer: 15,
    defaultPerfectMaxFertilizer: 84,
    requestsSeaweedExtract: true,
    requestsLiquidFertilizer: true,
    harvestMin: 1,
    harvestMax: 3,
    label: '全维计分；可登记海藻精+液态肥；窗口偏窄'
  },
  5: {
    growthTicks: 142,
    minWater: 100,
    maxWater: 265,
    perfectHalfWidth: 27,
    scoreDimensions: { trace: true, fertilizer: true },
    defaultPerfectMinTrace: 38,
    defaultPerfectMaxTrace: 70,
    defaultPerfectMinFertilizer: 20,
    defaultPerfectMaxFertilizer: 66,
    requestsSeaweedExtract: true,
    requestsLiquidFertilizer: true,
    harvestMin: 1,
    harvestMax: 2,
    label: '全维计分且窗口最窄；高值作物'
  }
};

/** 二档中额外参与微量生长分的作物（其余二档只看水分/土/轮作） */
const TIER2_TRACE_CROP_IDS = new Set([
  'tomato',
  'tomato_green',
  'onion',
  'garlic',
  'scallion',
  'beet',
  'sugarcane',
  'peanut'
]);

/** 作物组对计分窗口的叠加（在档位基准上） */
const GROUP_SCORING_MOD = {
  grain: { minWaterDelta: 0, maxWaterDelta: 8, perfectHalfDelta: 6, perfectMinTraceDelta: -2, perfectMinFertDelta: -1 },
  veg: { perfectHalfDelta: 2, perfectMinTraceDelta: 0, perfectMinFertDelta: 0 },
  aromatics: { perfectHalfDelta: -2, perfectMinTraceDelta: -3, perfectMinFertDelta: -2 },
  spice: { perfectHalfDelta: -5, perfectMinTraceDelta: 4, perfectMaxTraceDelta: -6, perfectMinFertDelta: 2 },
  fruit: { minWaterDelta: 2, maxWaterDelta: -6, perfectHalfDelta: -4, perfectMinTraceDelta: 2, perfectMinFertDelta: 1 }
};

/** 形态修正（生长周期与水分形态） */
const KIND_MOD = {
  fast: { growthTicksMul: 0.48, minWaterDelta: -14, maxWaterDelta: 28, perfectHalfDelta: 18 },
  aquatic: { minWaterDelta: 20, maxWaterDelta: 38, perfectHalfDelta: 10 },
  tree: { growthTicksMul: 1.2, minWaterDelta: 4, maxWaterDelta: -12, perfectHalfDelta: -5 },
  spice: { perfectMinTraceDelta: -3, perfectHalfDelta: 3 }
};

const KIND_BY_CROP = {
  sprout: 'fast',
  rice: 'aquatic',
  rice_bomba: 'aquatic',
  rice_basmati: 'aquatic',
  rice_glutinous_round: 'aquatic',
  euryale: 'aquatic',
  lotus_seed: 'aquatic',
  almond: 'tree',
  apricot: 'tree',
  pear: 'tree',
  cherry: 'tree',
  lemon: 'tree',
  chestnut: 'tree',
  star_anise: 'tree',
  bamboo_shoot: 'tree',
  cumin: 'spice',
  chili_kashmir: 'spice',
  turmeric: 'spice',
  coriander_seed: 'spice',
  fennel_seed: 'spice',
  mustard_seed: 'spice'
};

/** 单作物计分微调（在同档内拉开差异） */
const CROP_SCORING_OVERRIDE = {
  maize: { minWaterDelta: -8, maxWaterDelta: 18, perfectHalfDelta: 14, growNoteSuffix: '耐旱，水分高分窗宽' },
  rice: { minWaterDelta: 6, maxWaterDelta: 12, perfectHalfDelta: 8 },
  wheat: { perfectHalfDelta: 10, minWaterDelta: -4 },
  wheat_durum: { perfectMinTrace: 28, perfectMinFertilizer: 11, perfectHalfDelta: -3 },
  potato: { growthTicksMul: 0.94, perfectHalfDelta: 12, maxWaterDelta: 12 },
  cucumber: { minWaterDelta: 6, perfectHalfDelta: 4 },
  carrot: { minWaterDelta: -10, perfectHalfDelta: 10 },
  radish_white: { growthTicksMul: 0.88, perfectHalfDelta: 16 },
  cabbage: { perfectHalfDelta: 8 },
  beans_white_haricot: { perfectHalfDelta: 4 },
  sprout: { growthTicksMul: 0.45 },
  tomato: { perfectMinTrace: 34, perfectHalfDelta: -6 },
  tomato_green: { perfectMinTrace: 32, perfectHalfDelta: -5 },
  beet: { perfectMinTrace: 28 },
  onion: { perfectMinTrace: 30, perfectHalfDelta: -2 },
  garlic: { perfectMinTrace: 28 },
  scallion: { perfectMinTrace: 26, perfectHalfDelta: 4 },
  sugarcane: { growthTicksMul: 1.12, maxWaterDelta: 22, perfectMinTrace: 36, perfectHalfDelta: -4 },
  peanut: { perfectMinTrace: 28, perfectHalfDelta: -2 },
  rice_bomba: { perfectMinTrace: 26, perfectMinFertilizer: 10, perfectHalfDelta: -4 },
  rice_glutinous_round: { perfectMinTrace: 22, perfectMinFertilizer: 11, perfectHalfDelta: -6 },
  rice_basmati: { perfectMinTrace: 36, perfectMaxTrace: 88, perfectMinFertilizer: 17, perfectMaxFertilizer: 80 },
  celery: { minWaterDelta: 10, perfectMinTrace: 26, perfectMinFertilizer: 8, perfectHalfDelta: -5 },
  ginger: { perfectMinFertilizer: 10, perfectMinTrace: 24 },
  shallot: { perfectMinTrace: 26, perfectMinFertilizer: 10 },
  leek: { perfectMinTrace: 28, perfectMinFertilizer: 11, perfectHalfDelta: -3 },
  cilantro: { perfectMinTrace: 24, perfectMinFertilizer: 9, perfectHalfDelta: -4 },
  mustard_seed: { perfectMinTrace: 30, perfectMinFertilizer: 10 },
  chili_red: { perfectMinTrace: 32, perfectMinFertilizer: 12, perfectHalfDelta: -3 },
  konjac: { growthTicksMul: 1.06, perfectMinTrace: 20, perfectMinFertilizer: 13, perfectMinTraceDelta: -4 },
  sesame: { perfectMinTrace: 34, perfectMinFertilizer: 16 },
  pumpkin_seed: { perfectMinTrace: 30, perfectMinFertilizer: 14, maxWaterDelta: 15 },
  turmeric: { perfectMinTrace: 36, perfectMinFertilizer: 17, perfectMaxFertilizer: 78 },
  coriander_seed: { perfectMinTrace: 32, perfectMinFertilizer: 15 },
  fennel_seed: { perfectMinTrace: 34, perfectMinFertilizer: 16 },
  plantain: { growthTicksMul: 1.08, perfectMinFertilizer: 18, perfectHalfDelta: -4 },
  chestnut: { perfectMinTrace: 38, perfectMaxTrace: 72, perfectMinFertilizer: 19 },
  bamboo_shoot: { perfectMinTrace: 40, perfectMaxTrace: 68, perfectMinFertilizer: 22 },
  star_anise: { perfectMinTrace: 42, perfectMaxTrace: 65, perfectMinFertilizer: 24 },
  cumin: { minWaterDelta: -6, maxWaterDelta: -10, perfectMinTrace: 44, perfectMaxTrace: 62, perfectMinFertilizer: 26, perfectHalfDelta: -6 },
  chili_kashmir: { perfectMinTrace: 40, perfectMaxTrace: 66, perfectMinFertilizer: 23 }
};

/**
 * 水分习性：影响完美窗、涝害判定；与土种偏好分轨（§2.2b / §4b.3）
 * mesic 为默认，未列即 mesic
 */
const WATER_PROFILE = {
  maize: 'xeric',
  wheat: 'xeric',
  wheat_durum: 'xeric',
  carrot: 'xeric',
  radish_white: 'xeric',
  cumin: 'xeric',
  rice: 'hydrophilic',
  rice_bomba: 'hydrophilic',
  rice_basmati: 'hydrophilic',
  rice_glutinous_round: 'hydrophilic',
  celery: 'hydrophilic',
  cucumber: 'hydrophilic',
  cabbage: 'hydrophilic',
  beet: 'hydrophilic',
  tomato: 'hydrophilic',
  tomato_green: 'hydrophilic',
  konjac: 'hydrophilic',
  lotus_seed: 'aquatic',
  euryale: 'aquatic'
};

/** 融合透滤（盐碱土）额外 +1 的耐盐作物；勿与 xeric 画等号 */
const SALT_TOLERANT_CROP_IDS = new Set([
  'maize',
  'wheat',
  'wheat_durum',
  'carrot',
  'radish_white',
  'cumin'
]);

const WATER_PROFILE_LABELS = {
  xeric: '耐旱忌涝',
  mesic: '常规',
  hydrophilic: '喜湿',
  aquatic: '水生'
};

/** 超融合土性融合：作物标签（demo scoreWaterDimension / scoreSoilDimension 等读取） */
const HEAT_LOVING_CROP_IDS = new Set([
  'tomato',
  'tomato_green',
  'chili_red',
  'chili_kashmir',
  'cucumber',
  'eggplant'
]);

const ACID_LOVING_CROP_IDS = new Set([
  'peanut',
  'ginger',
  'turmeric',
  'konjac',
  'potato',
  'beans_white_haricot',
  'green_beans',
  'garrofo',
  'shallot',
  'leek',
  'lemon',
  'plantain',
  'sugarcane',
  'bamboo_shoot',
  'star_anise',
  'chili_red',
  'chili_kashmir',
  'sesame'
]);

const REQUIRED_CROP_STRUCTURE = {
  support_frame: ['cucumber', 'green_beans', 'garrofo', 'beans_white_haricot'],
  protection_cage: ['tomato', 'tomato_green'],
  binding_strap: ['sugarcane', 'plantain'],
  water_storage_ridge: ['rice', 'rice_bomba', 'rice_basmati', 'rice_glutinous_round'],
  deep_pool: ['lotus_seed', 'euryale'],
  shade_cover: ['sprout'],
  canopy: ['ginger']
};

const CROP_ID_TO_REQUIRED_STRUCTURE = {};
for (const [structId, cropIds] of Object.entries(REQUIRED_CROP_STRUCTURE)) {
  for (const cid of cropIds) {
    CROP_ID_TO_REQUIRED_STRUCTURE[cid] = structId;
  }
}

const NITROGEN_FIXING_CROP_IDS = new Set([
  'peanut',
  'green_beans',
  'garrofo',
  'beans_white_haricot'
]);

/**
 * 入门向作物（仅数据标记；游戏 UI 不作专标，供玩家自行研究）
 * starter_sequence 越小越适合作为上手顺序参考
 */
const STARTER_CROP_META = {
  maize: { starter_sequence: 1 },
  carrot: { starter_sequence: 2 },
  radish_white: { starter_sequence: 2 },
  potato: { starter_sequence: 3 }
};

function buildSoilTags(cropId, group) {
  const tags = [];
  if (SALT_TOLERANT_CROP_IDS.has(cropId)) tags.push('salt_tolerant');
  if (HEAT_LOVING_CROP_IDS.has(cropId)) tags.push('heat_loving');
  if (ACID_LOVING_CROP_IDS.has(cropId)) tags.push('acid_loving');
  return tags;
}

const CROP_STRUCTURE_LABELS = {
  support_frame: '支架',
  protection_cage: '保护笼',
  binding_strap: '捆绑带',
  water_storage_ridge: '蓄水田埂',
  deep_pool: '深水池',
  shade_cover: '遮光罩',
  canopy: '顶棚'
};

const TRACE_SENSITIVITY = {
  lethal: {
    sprout: {
      trace_safe_max: 4,
      trace_lethal_at: 8,
      trace_stress_loss_per_tick: 5,
      trace_lethal_loss_per_tick: 60,
      growNote: '忌渠内海藻精；微量过量即水体腐败窒息'
    },
    lotus_seed: {
      trace_safe_max: 8,
      trace_lethal_at: 15,
      trace_stress_loss_per_tick: 4,
      trace_lethal_loss_per_tick: 55,
      growNote: '清水池栽；海藻精污染池水易烂种'
    },
    euryale: {
      trace_safe_max: 8,
      trace_lethal_at: 14,
      trace_stress_loss_per_tick: 4,
      trace_lethal_loss_per_tick: 55,
      growNote: '池栽芡实；忌海藻精进入灌溉水'
    }
  },
  severe: {
    apricot: {
      trace_safe_max: 26,
      trace_fail_harvest_at: 42,
      trace_toxic_health_loss_per_tick: 3,
      growNote: '敏感果树；微量过剩盐害灼伤落果'
    },
    cherry: {
      trace_safe_max: 24,
      trace_fail_harvest_at: 40,
      trace_toxic_health_loss_per_tick: 3,
      growNote: '敏感果树；微量过剩易落果'
    },
    almond: {
      trace_safe_max: 25,
      trace_fail_harvest_at: 41,
      trace_toxic_health_loss_per_tick: 3,
      growNote: '敏感果树；忌高浓度海藻精'
    },
    pear: {
      trace_safe_max: 26,
      trace_fail_harvest_at: 42,
      trace_toxic_health_loss_per_tick: 3,
      growNote: '敏感果树；微量过剩灼伤'
    },
    lemon: {
      trace_safe_max: 25,
      trace_fail_harvest_at: 41,
      trace_toxic_health_loss_per_tick: 3,
      growNote: '柑橘类敏感；海藻精宜远离'
    },
    green_beans: {
      trace_safe_max: 20,
      trace_fail_harvest_at: 36,
      trace_toxic_health_loss_per_tick: 2.5,
      growNote: '豆科；微量过剩易盐害落荚'
    },
    garrofo: {
      trace_safe_max: 22,
      trace_fail_harvest_at: 38,
      trace_toxic_health_loss_per_tick: 2.5,
      growNote: '大芸豆；忌海藻精浓灌溉'
    },
    beans_white_haricot: {
      trace_safe_max: 20,
      trace_fail_harvest_at: 36,
      trace_toxic_health_loss_per_tick: 2.5,
      growNote: '豆科扁豆；微量上限低'
    }
  }
};

/** 八种土展示名；与 data/agriculture-soils.json display_name 一致 */
const SOIL_NAME = {
  YELLOW: '黄绵土',
  CINNAMON: '褐土',
  PURPLE: '紫色土',
  RED: '红壤',
  SALINE: '盐碱土',
  ALPINE: '高山草甸土',
  PADDY: '水稻土',
  BLACK: '典型黑土'
};

const LOW_RETENTION_SOILS = [SOIL_NAME.SALINE, SOIL_NAME.YELLOW];
const HIGH_RETENTION_SOILS = [SOIL_NAME.PADDY, SOIL_NAME.BLACK];

/**
 * 八种土壤 × 作物生长门槛（成熟土种维 ±1）
 * 编排原则：黄绵/褐=旱作粮豆；紫/黑=高产粮菜；红=酸性亚热带；盐碱=默认耐盐旱作；
 * 水稻土=稻/水生/高需水叶菜；高山草甸=冷凉慢生高值。
 */
const CROP_SOIL_AFFINITY = {
  maize: {
    preferred: [SOIL_NAME.YELLOW, SOIL_NAME.CINNAMON, SOIL_NAME.SALINE],
    unsuitable: [SOIL_NAME.PADDY]
  },
  wheat: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.BLACK, SOIL_NAME.YELLOW],
    unsuitable: [SOIL_NAME.PADDY, SOIL_NAME.SALINE]
  },
  wheat_durum: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.YELLOW],
    unsuitable: [SOIL_NAME.PADDY, SOIL_NAME.SALINE]
  },
  rice: {
    preferred: [SOIL_NAME.PADDY, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  rice_bomba: {
    preferred: [SOIL_NAME.PADDY, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  rice_basmati: {
    preferred: [SOIL_NAME.PADDY, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  rice_glutinous_round: {
    preferred: [SOIL_NAME.PADDY, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  euryale: {
    preferred: [SOIL_NAME.PADDY, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  lotus_seed: {
    preferred: [SOIL_NAME.PADDY, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  potato: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.BLACK, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.PADDY]
  },
  carrot: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.YELLOW, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.PADDY]
  },
  radish_white: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.YELLOW, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.PADDY]
  },
  sprout: {
    preferred: [SOIL_NAME.BLACK, SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.PADDY, SOIL_NAME.SALINE]
  },
  cucumber: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  cabbage: {
    preferred: [SOIL_NAME.BLACK, SOIL_NAME.PADDY, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  beet: {
    preferred: [SOIL_NAME.BLACK, SOIL_NAME.PURPLE, SOIL_NAME.CINNAMON],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  tomato: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.PADDY]
  },
  tomato_green: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.PADDY]
  },
  celery: {
    preferred: [SOIL_NAME.BLACK, SOIL_NAME.PADDY, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  konjac: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  bamboo_shoot: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.PURPLE, SOIL_NAME.PADDY],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  green_beans: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.YELLOW, SOIL_NAME.CINNAMON],
    unsuitable: [SOIL_NAME.PADDY, SOIL_NAME.SALINE]
  },
  garrofo: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.YELLOW, SOIL_NAME.CINNAMON],
    unsuitable: [SOIL_NAME.PADDY, SOIL_NAME.SALINE]
  },
  beans_white_haricot: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.YELLOW, SOIL_NAME.CINNAMON],
    unsuitable: [SOIL_NAME.PADDY, SOIL_NAME.SALINE]
  },
  peanut: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.YELLOW, SOIL_NAME.CINNAMON],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.PADDY]
  },
  onion: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.YELLOW, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.PADDY, SOIL_NAME.SALINE]
  },
  garlic: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.YELLOW, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.PADDY, SOIL_NAME.SALINE]
  },
  scallion: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.PADDY]
  },
  shallot: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.PURPLE, SOIL_NAME.CINNAMON],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.PADDY]
  },
  leek: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.CINNAMON, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.PADDY]
  },
  ginger: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  cilantro: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  sugarcane: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.PURPLE, SOIL_NAME.PADDY],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  mustard_seed: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.YELLOW, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.PADDY, SOIL_NAME.SALINE]
  },
  sesame: {
    preferred: [SOIL_NAME.YELLOW, SOIL_NAME.CINNAMON, SOIL_NAME.RED],
    unsuitable: [SOIL_NAME.PADDY, SOIL_NAME.SALINE]
  },
  cumin: {
    preferred: [SOIL_NAME.YELLOW, SOIL_NAME.CINNAMON, SOIL_NAME.ALPINE],
    unsuitable: [SOIL_NAME.PADDY, SOIL_NAME.SALINE]
  },
  turmeric: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  coriander_seed: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.ALPINE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.PADDY]
  },
  fennel_seed: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.ALPINE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.PADDY]
  },
  pumpkin_seed: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.PADDY]
  },
  chili_red: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.PURPLE, SOIL_NAME.CINNAMON],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.PADDY]
  },
  chili_kashmir: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.PURPLE, SOIL_NAME.CINNAMON],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.PADDY]
  },
  star_anise: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  plantain: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.PURPLE, SOIL_NAME.PADDY],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  chestnut: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.ALPINE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  almond: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  apricot: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  pear: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  cherry: {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  },
  lemon: {
    preferred: [SOIL_NAME.RED, SOIL_NAME.PURPLE],
    unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
  }
};

function applyWaterProfileWindows(def, cropId) {
  const profile = WATER_PROFILE[cropId] || 'mesic';
  def.water_profile = profile;
  if (profile === 'xeric') {
    def.perfectMinWater = Math.max(def.minWater + 4, Math.round(def.perfectMinWater * 0.78));
    def.perfectMaxWater = Math.min(def.maxWater - 8, Math.round(def.perfectMaxWater * 0.72));
    def.waterlogged_above = Math.min(
      def.maxWater - 4,
      def.perfectMaxWater + Math.round((def.maxWater - def.perfectMaxWater) * 0.35)
    );
  } else if (profile === 'hydrophilic') {
    def.perfectMinWater = Math.round(def.perfectMinWater * 1.08);
    def.perfectMaxWater = Math.min(def.maxWater - 6, Math.round(def.perfectMaxWater * 1.12));
  } else if (profile === 'aquatic') {
    def.perfectMinWater = Math.round(def.perfectMinWater * 1.15);
    def.perfectMaxWater = Math.min(def.maxWater - 4, Math.round(def.perfectMaxWater * 1.18));
  } else {
    def.water_profile = 'mesic';
  }
}

function buildSoilScoring(cropId, tier, group) {
  const explicit = CROP_SOIL_AFFINITY[cropId];
  if (explicit) {
    return {
      preferred: [...explicit.preferred],
      unsuitable: [...explicit.unsuitable]
    };
  }
  const wp = WATER_PROFILE[cropId] || 'mesic';
  if (wp === 'xeric') {
    return {
      preferred: [SOIL_NAME.YELLOW, SOIL_NAME.CINNAMON],
      unsuitable: [SOIL_NAME.PADDY, SOIL_NAME.SALINE]
    };
  }
  if (wp === 'hydrophilic' || wp === 'aquatic') {
    return {
      preferred: [SOIL_NAME.PADDY, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
      unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
    };
  }
  if (tier >= 5) {
    return {
      preferred: [SOIL_NAME.PURPLE, SOIL_NAME.CINNAMON],
      unsuitable: [SOIL_NAME.SALINE, SOIL_NAME.YELLOW]
    };
  }
  return {
    preferred: [SOIL_NAME.CINNAMON, SOIL_NAME.PURPLE, SOIL_NAME.BLACK],
    unsuitable: [SOIL_NAME.SALINE]
  };
}

function applyTraceSensitivityToDef(def) {
  const lethal = TRACE_SENSITIVITY.lethal[def.cropId];
  if (lethal) {
    Object.assign(def, lethal, {
      trace_sensitivity: 'lethal',
      requests_seaweed_extract: false,
      perfectMinTrace: null,
      perfectMaxTrace: lethal.trace_safe_max,
      perfectMinFertilizer: def.perfectMinFertilizer
    });
    delete def.growNote;
    if (def.score_dimensions) def.score_dimensions.trace = true;
    return def;
  }
  const severe = TRACE_SENSITIVITY.severe[def.cropId];
  if (severe) {
    Object.assign(def, severe, {
      trace_sensitivity: 'severe',
      requests_seaweed_extract: false,
      perfectMinTrace: null,
      perfectMaxTrace: severe.trace_safe_max,
      perfectMinFertilizer: def.perfectMinFertilizer
    });
    delete def.growNote;
    if (def.score_dimensions) def.score_dimensions.trace = true;
    return def;
  }
  return def;
}

function resolveTraceParticipation(tierProfile, cropId, cropOverride) {
  const mode = tierProfile.scoreDimensions.trace;
  if (cropOverride.perfectMinTrace != null) return true;
  if (mode === true) return true;
  if (mode === 'partial') return TIER2_TRACE_CROP_IDS.has(cropId);
  return false;
}

function resolveFertParticipation(tierProfile, cropId, cropOverride) {
  const mode = tierProfile.scoreDimensions.fertilizer;
  if (cropOverride.perfectMinFertilizer != null) return true;
  if (mode === true) return true;
  return false;
}

function cropIdFromSeed(seedId) {
  if (seedId === 'seed_peanut') return 'peanut';
  return seedId.replace(/^seed_/, '');
}

function cropNameFromSeedName(seedName) {
  return String(seedName || '').replace(/种子$/, '').replace(/种$/, '').trim() || '作物';
}

function buildCropDef(seed) {
  const tier = Number(seed.tier) || 2;
  const tierProfile = { ...TIER_SCORING[Math.min(5, Math.max(1, tier))] };
  const cropId = cropIdFromSeed(seed.item_id);
  const group = seed.group || 'veg';
  const groupMod = GROUP_SCORING_MOD[group] || {};
  const kind = KIND_BY_CROP[cropId];
  const kindMod = kind ? KIND_MOD[kind] : null;
  const cropOverride = CROP_SCORING_OVERRIDE[cropId] || {};

  let growthTicks = Math.round(tierProfile.growthTicks * (cropOverride.growthTicksMul || 1));
  if (kindMod?.growthTicksMul) growthTicks = Math.round(growthTicks * kindMod.growthTicksMul);
  growthTicks = Math.max(40, Math.min(175, growthTicks));

  let minWater =
    tierProfile.minWater +
    (groupMod.minWaterDelta || 0) +
    (kindMod?.minWaterDelta || 0) +
    (cropOverride.minWaterDelta || 0);
  let maxWater =
    tierProfile.maxWater +
    (groupMod.maxWaterDelta || 0) +
    (kindMod?.maxWaterDelta || 0) +
    (cropOverride.maxWaterDelta || 0);
  minWater = Math.max(55, Math.round(minWater));
  maxWater = Math.max(minWater + 118, Math.round(maxWater));

  const mid = (minWater + maxWater) / 2;
  let half =
    tierProfile.perfectHalfWidth +
    (groupMod.perfectHalfDelta || 0) +
    (kindMod?.perfectHalfDelta || 0) +
    (cropOverride.perfectHalfDelta || 0);
  half = Math.max(20, Math.min(112, Math.round(half)));

  let perfectMinWater = Math.round(mid - half);
  let perfectMaxWater = Math.round(mid + half);
  perfectMinWater = Math.max(minWater + 6, perfectMinWater);
  perfectMaxWater = Math.min(maxWater - 6, perfectMaxWater);
  if (perfectMaxWater - perfectMinWater < 22) {
    perfectMinWater = Math.max(minWater + 6, mid - 12);
    perfectMaxWater = Math.min(maxWater - 6, mid + 12);
  }

  const traceParticipates = resolveTraceParticipation(tierProfile, cropId, cropOverride);
  const fertParticipates = resolveFertParticipation(tierProfile, cropId, cropOverride);

  let perfectMinTrace = null;
  let perfectMaxTrace = null;
  if (traceParticipates) {
    perfectMinTrace =
      cropOverride.perfectMinTrace != null
        ? cropOverride.perfectMinTrace
        : tierProfile.defaultPerfectMinTrace;
    perfectMinTrace +=
      (groupMod.perfectMinTraceDelta || 0) +
      (kindMod?.perfectMinTraceDelta || 0) +
      (cropOverride.perfectMinTraceDelta || 0);
    perfectMinTrace = Math.max(14, Math.round(perfectMinTrace));
    if (tierProfile.defaultPerfectMaxTrace != null || cropOverride.perfectMaxTrace != null) {
      perfectMaxTrace = cropOverride.perfectMaxTrace ?? tierProfile.defaultPerfectMaxTrace;
      if (perfectMaxTrace != null) {
        perfectMaxTrace +=
          (groupMod.perfectMaxTraceDelta || 0) + (cropOverride.perfectMaxTraceDelta || 0);
        perfectMaxTrace = Math.max(perfectMinTrace + 8, Math.round(perfectMaxTrace));
      }
    }
  }

  let perfectMinFertilizer = null;
  let perfectMaxFertilizer = null;
  if (fertParticipates) {
    perfectMinFertilizer =
      cropOverride.perfectMinFertilizer != null
        ? cropOverride.perfectMinFertilizer
        : tierProfile.defaultPerfectMinFertilizer;
    perfectMinFertilizer +=
      (groupMod.perfectMinFertDelta || 0) + (cropOverride.perfectMinFertDelta || 0);
    perfectMinFertilizer = Math.max(6, Math.round(perfectMinFertilizer));
    const maxFert = cropOverride.perfectMaxFertilizer ?? tierProfile.defaultPerfectMaxFertilizer;
    if (maxFert != null) {
      perfectMaxFertilizer = Math.max(perfectMinFertilizer + 12, Math.round(maxFert));
    }
  }

  let requestsSeaweedExtract = tierProfile.requestsSeaweedExtract;
  let requestsLiquidFertilizer = tierProfile.requestsLiquidFertilizer;
  if (tier <= 2) {
    requestsSeaweedExtract = false;
    requestsLiquidFertilizer = false;
  }
  if (tier === 3) requestsSeaweedExtract = false;

  const def = {
    cropId,
    tier,
    group,
    nitrogen_fixing: NITROGEN_FIXING_CROP_IDS.has(cropId),
    name: cropNameFromSeedName(seed.name),
    seedItemId: seed.item_id,
    seedName: seed.name,
    productItemId: seed.harvest_item_id,
    productName: cropNameFromSeedName(seed.name),
    growthTicks,
    minWater,
    maxWater,
    perfectMinWater,
    perfectMaxWater,
    perfectMinTrace,
    perfectMaxTrace,
    score_dimensions: {
      water: true,
      trace: traceParticipates,
      fertilizer: fertParticipates,
      soil: true,
      rotation: true
    },
    requests_seaweed_extract: requestsSeaweedExtract,
    requests_liquid_fertilizer: requestsLiquidFertilizer,
    perfectMinFertilizer,
    perfectMaxFertilizer,
    soil_scoring: buildSoilScoring(cropId, tier, group),
    soil_tags: buildSoilTags(cropId, group),
    harvestMin: tierProfile.harvestMin,
    harvestMax: tierProfile.harvestMax
  };

  const reqStruct = CROP_ID_TO_REQUIRED_STRUCTURE[cropId];
  if (reqStruct) {
    def.required_crop_structure_id = reqStruct;
  }

  const starterMeta = STARTER_CROP_META[cropId];
  if (starterMeta || seed.starter_recommended === true) {
    def.starter_recommended = true;
    const seq = seed.starter_sequence != null ? Number(seed.starter_sequence) : starterMeta?.starter_sequence;
    if (seq != null && !Number.isNaN(seq)) def.starter_sequence = seq;
  }

  applyWaterProfileWindows(def, cropId);

  return applyTraceSensitivityToDef(def);
}

function buildTierScoringSummary() {
  const out = {};
  for (const [t, p] of Object.entries(TIER_SCORING)) {
    out[t] = {
      label: p.label,
      typical_max_positive_score: estimateMaxScore(Number(t))
    };
  }
  return out;
}

function estimateMaxScore(tier) {
  let max = 2 + 1 + 1;
  const p = TIER_SCORING[tier];
  if (p.scoreDimensions.trace === true) max += 2;
  else if (p.scoreDimensions.trace === 'partial') max += 2;
  if (p.scoreDimensions.fertilizer === true) max += 2;
  else if (tier === 2) max += 2;
  return max;
}

function buildStarterCropCatalog(crops) {
  const entries = Object.keys(crops)
    .filter((id) => crops[id].starter_recommended)
    .map((id) => ({
      crop_id: id,
      starter_sequence: crops[id].starter_sequence ?? null,
      tier: crops[id].tier,
      seed_item_id: crops[id].seedItemId
    }))
    .sort((a, b) => (a.starter_sequence ?? 99) - (b.starter_sequence ?? 99) || a.crop_id.localeCompare(b.crop_id));
  return {
    entries
  };
}

const shop = JSON.parse(fs.readFileSync(SHOP_JSON, 'utf8'));
const crops = {};
for (const s of shop.seeds) {
  const def = buildCropDef(s);
  crops[def.cropId] = def;
}

const doc = {
  schema_version: 3,
  design_note:
    '成熟硬门槛后按生长分结算产量：每正分+25%产量，每负分-25%（负分惩罚封顶-50%）。各档 score_dimensions 控制参与维；perfect* 区间为各维 2 分闭区间。',
  crop_structure_requirements: REQUIRED_CROP_STRUCTURE,
  crop_structure_labels: CROP_STRUCTURE_LABELS,
  trace_sensitivity_catalog: {
    lethal: {
      label: '绝对致死（水体腐败与窒息）',
      crop_ids: Object.keys(TRACE_SENSITIVITY.lethal)
    },
    severe: {
      label: '严重排斥（盐害灼伤与落果）',
      crop_ids: Object.keys(TRACE_SENSITIVITY.severe)
    }
  },
  tier_scoring_summary: buildTierScoringSummary(),
  tier_growth_summary: Object.fromEntries(
    Object.entries(TIER_SCORING).map(([k, v]) => [k, v.label])
  ),
  growth_score_rules: {
    yield_per_positive_point: 0.25,
    yield_per_negative_point: 0.25,
    negative_penalty_cap: 0.5,
    water_perfect_interval: 'closed',
    dimension_scores: {
      water: 'xeric：完美窗偏低，超 waterlogged_above 生长分0；hydrophilic/aquatic 窗偏高；均受土壤锁值影响入账',
      trace: 'score_dimensions.trace=false不参与；排斥作物≤safe_max得2否则0',
      fertilizer: 'score_dimensions.fertilizer=false不参与',
      soil: '偏好+1；不适-1；其余0（CROP_SOIL_AFFINITY 按八种土编排；融合透滤/酸性固磷等见 demo）',
      rotation: '跨group或豆科后种非豆科+1；黑土连作同作物-1；黄绵土豆科后+1'
    }
  },
  water_profile_labels: WATER_PROFILE_LABELS,
  starter_crop_catalog: buildStarterCropCatalog(crops),
  crops
};

fs.writeFileSync(OUT_JSON, JSON.stringify(doc, null, 2) + '\n', 'utf8');

const embed =
  '/* AUTO-GENERATED by tools/gen-agriculture-crop-defs.mjs — do not edit */\n'
  + 'window.AGRICULTURE_CROP_DEFS = '
  + JSON.stringify(doc)
  + ';\n';
for (const p of [EMBED_TOOLS, EMBED_JS]) {
  fs.writeFileSync(p, embed, 'utf8');
}

console.log('Wrote', OUT_JSON, '(' + Object.keys(crops).length + ' crops)');
console.log('Embed:', EMBED_TOOLS, EMBED_JS);
