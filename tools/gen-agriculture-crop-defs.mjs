/**
 * 由农业平衡主表生成作物参数；种子表仅提供身份、档位与产物映射
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

const BALANCE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/agriculture-crop-balance.json'), 'utf8'));
const TIER_LABELS = {1:'基础清水农业',2:'供水分化，微量可选增产',3:'肥料成为成熟条件',4:'高供水与肥料、微量投入',5:'高投入专用田；融合客土降低资源和空间成本'};



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

function cropIdFromSeed(seedId) {
  if (seedId === 'seed_peanut') return 'peanut';
  return seedId.replace(/^seed_/, '');
}

function cropNameFromSeedName(seedName) {
  return String(seedName || '').replace(/种子$/, '').replace(/种$/, '').trim() || '作物';
}

function buildCropDef(seed) {
  const cropId = cropIdFromSeed(seed.item_id);
  const b = BALANCE.crops[cropId];
  if (!b || b.tier !== Number(seed.tier)) throw new Error('Missing or mismatched balance: ' + cropId);
  for (const key of ['water', 'fertilizer', 'trace']) {
    const band = b[key];
    if (band && (band.length !== 4 || band.some((v, i) => !Number.isFinite(v) || v < 0 || (i && v < band[i - 1])))) throw new Error('Invalid band: ' + cropId + '/' + key);
  }
  const total = band => band ? band.map(v => Math.round(v * b.growth_ticks * 10) / 10) : [null,null,null,null];
  const [minWater, perfectMinWater, perfectMaxWater, maxWater] = total(b.water);
  const [minFertilizer, perfectMinFertilizer, perfectMaxFertilizer, maxFertilizer] = total(b.fertilizer);
  const [minTrace, perfectMinTrace, perfectMaxTrace, maxTrace] = total(b.trace);
  const group = seed.group || 'veg';
  const def = {
    cropId, tier:b.tier, group, nitrogen_fixing:NITROGEN_FIXING_CROP_IDS.has(cropId),
    name:cropNameFromSeedName(seed.name), seedItemId:seed.item_id, seedName:seed.name,
    productItemId:seed.harvest_item_id, productName:cropNameFromSeedName(seed.name),
    balance_revision:BALANCE.revision, growthTicks:b.growth_ticks,
    minWater, perfectMinWater, perfectMaxWater, maxWater,
    minFertilizer, perfectMinFertilizer, perfectMaxFertilizer, maxFertilizer,
    minTrace, perfectMinTrace, perfectMaxTrace, maxTrace,
    score_dimensions:{water:true,trace:!!b.trace,fertilizer:!!b.fertilizer,soil:true,rotation:true},
    requests_seaweed_extract:!!b.trace, requests_liquid_fertilizer:!!b.fertilizer,
    soil_scoring:buildSoilScoring(cropId,b.tier,group), soil_tags:buildSoilTags(cropId,group),
    harvestMin:b.tier===1?3:b.tier<=3?2:1, harvestMax:b.tier===1?5:b.tier===2?4:b.tier<=4?3:2,
    water_profile:WATER_PROFILE[cropId] || 'mesic'
  };
  if (def.water_profile === 'xeric') def.waterlogged_above = perfectMaxWater + (maxWater-perfectMaxWater)*.5;
  if (CROP_ID_TO_REQUIRED_STRUCTURE[cropId]) def.required_crop_structure_id=CROP_ID_TO_REQUIRED_STRUCTURE[cropId];
  const starter=STARTER_CROP_META[cropId];
  if(starter) {def.starter_recommended=true;def.starter_sequence=starter.starter_sequence;}
  return applyTraceSensitivityToDef(def);
}
function buildTierScoringSummary() {
  return Object.fromEntries(Object.entries(TIER_LABELS).map(([tier,label])=>[tier,{label,typical_max_positive_score:Number(tier)>=3?9:Number(tier)===2?7:5}]));
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
  schema_version: 4,
  result_labels: {"nutrient_deficient":"肥料不足·未能结实","fertilizer_excess":"施肥过量·无收成","trace_deficient":"微量元素不足·未能结实","trace_toxic":"微量元素过量·无收成"},
  design_note:
    '作物需求源为 agriculture-crop-balance.json 的每刻吸收区间；按生长周期换算。水、肥、微量成熟门槛通过后计产量，零投入不再自动获肥/微量分。',
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
    Object.entries(TIER_LABELS)
  ),
  growth_score_rules: {
    yield_per_positive_point: 0.25,
    yield_per_negative_point: 0.25,
    negative_penalty_cap: 0.5,
    water_perfect_interval: 'closed',
    dimension_scores: {
      water: 'xeric：完美窗偏低，超 waterlogged_above 生长分0；hydrophilic/aquatic 窗偏高；均受土壤锁值影响入账',
      trace: 'score_dimensions.trace=false不参与；排斥作物≤safe_max得2否则0',
      fertilizer: '缺肥/过肥可绝收；有效投入未进高产窗1分、进窗2分、零投入0分',
      soil: '偏好+1；不适-1；其余0（CROP_SOIL_AFFINITY 按八种土编排；融合透滤/酸性固磷等见 demo）',
      rotation: '跨group或豆科后种非豆科+2；黑土连作-1/-2；黄绵土豆科后+3'
    }
  },
  water_profile_labels: WATER_PROFILE_LABELS,
  starter_crop_catalog: buildStarterCropCatalog(crops),
  legacy_crops: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/agriculture-crops-legacy.json'), 'utf8')).crops,
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
