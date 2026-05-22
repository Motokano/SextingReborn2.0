/**
 * 由 agriculture-seed-shop.json 生成作物生长默认参数（五档：越高越讲究，但成熟带宽宽裕）
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

/** 每档基准（相对花生二档略放宽成熟区间，完美窗口随档位收窄） */
const TIER_BASE = {
  1: {
    growthTicks: 85,
    minWater: 70,
    maxWater: 360,
    perfectHalfWidth: 95,
    perfectMinTrace: null,
    perfectMaxTrace: null,
    requestsSeaweedExtract: false,
    harvestMin: 3,
    harvestMax: 5
  },
  2: {
    growthTicks: 100,
    minWater: 98,
    maxWater: 310,
    perfectHalfWidth: 52,
    perfectMinTrace: 38,
    perfectMaxTrace: null,
    requestsSeaweedExtract: false,
    harvestMin: 2,
    harvestMax: 4
  },
  3: {
    growthTicks: 112,
    minWater: 90,
    maxWater: 295,
    perfectHalfWidth: 44,
    perfectMinTrace: 30,
    perfectMaxTrace: null,
    requestsSeaweedExtract: false,
    harvestMin: 2,
    harvestMax: 3
  },
  4: {
    growthTicks: 128,
    minWater: 100,
    maxWater: 280,
    perfectHalfWidth: 36,
    perfectMinTrace: 36,
    perfectMaxTrace: 88,
    requestsSeaweedExtract: true,
    harvestMin: 1,
    harvestMax: 3
  },
  5: {
    growthTicks: 148,
    minWater: 105,
    maxWater: 270,
    perfectHalfWidth: 30,
    perfectMinTrace: 42,
    perfectMaxTrace: 82,
    requestsSeaweedExtract: true,
    harvestMin: 1,
    harvestMax: 2
  }
};

/** 作物形态修正（在档位基准上叠加） */
const KIND_MOD = {
  fast: { growthTicksMul: 0.48, minWaterDelta: -12, maxWaterDelta: 30, perfectHalfBonus: 20 },
  aquatic: { minWaterDelta: 18, maxWaterDelta: 35, perfectHalfBonus: 12 },
  tree: { growthTicksMul: 1.22, minWaterDelta: 5, maxWaterDelta: -15, perfectHalfBonus: -6 },
  spice: { perfectMinTraceDelta: -4, perfectHalfBonus: 4 }
};

const KIND_BY_CROP = {
  sprout: 'fast',
  rice: 'aquatic',
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

/** 花生：与设计文档 §4b.2 完全一致 */
const PEANUT_OVERRIDE = {
  growthTicks: 100,
  minWater: 100,
  maxWater: 300,
  perfectMinWater: 150,
  perfectMaxWater: 250,
  perfectMinTrace: 50,
  perfectMaxTrace: null,
  requestsSeaweedExtract: true,
  harvestMin: 2,
  harvestMax: 3
};

/** 种植前须在已开垦耕地上建造对应建造物（§2.2f） */
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

const CROP_STRUCTURE_LABELS = {
  support_frame: '支架',
  protection_cage: '保护笼',
  binding_strap: '捆绑带',
  water_storage_ridge: '蓄水田埂',
  deep_pool: '深水池',
  shade_cover: '遮光罩',
  canopy: '顶棚'
};

/**
 * 微量排斥（海藻精累计 traceAbsorbed，与施肥值无关）
 * lethal：绝对致死 — 水体腐败/窒息；severe：严重排斥 — 盐害灼伤/落果
 */
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
    return def;
  }
  return def;
}

/** 个别作物微调（避免过难 / 贴合现实） */
const CROP_OVERRIDE = {
  rice: { minWaterDelta: 8 },
  maize: { maxWaterDelta: 15 },
  potato: { growthTicksMul: 0.95, perfectHalfBonus: 8 },
  konjac: { growthTicksMul: 1.08, perfectMinTraceDelta: -8 },
  plantain: { growthTicksMul: 1.1 },
  sugarcane: { growthTicksMul: 1.15, maxWaterDelta: 20 }
};

function cropIdFromSeed(seedId) {
  if (seedId === 'seed_peanut') return 'peanut';
  return seedId.replace(/^seed_/, '');
}

function cropNameFromSeedName(seedName) {
  return String(seedName || '').replace(/种子$/, '').replace(/种$/, '').trim() || '作物';
}


function buildCropDef(seed) {
  const tier = Number(seed.tier) || 2;
  const base = { ...TIER_BASE[Math.min(5, Math.max(1, tier))] };
  const cropId = cropIdFromSeed(seed.item_id);
  const kind = KIND_BY_CROP[cropId];
  const kindMod = kind ? KIND_MOD[kind] : null;
  const extra = CROP_OVERRIDE[cropId] || {};

  let growthTicks = Math.round(base.growthTicks * (extra.growthTicksMul || 1));
  if (kindMod && kindMod.growthTicksMul) growthTicks = Math.round(growthTicks * kindMod.growthTicksMul);
  growthTicks = Math.max(40, Math.min(175, growthTicks));

  let minWater = base.minWater + (kindMod?.minWaterDelta || 0) + (extra.minWaterDelta || 0);
  let maxWater = base.maxWater + (kindMod?.maxWaterDelta || 0) + (extra.maxWaterDelta || 0);
  minWater = Math.max(55, Math.round(minWater));
  maxWater = Math.max(minWater + 120, Math.round(maxWater));

  const mid = (minWater + maxWater) / 2;
  let half =
    base.perfectHalfWidth +
    (kindMod?.perfectHalfBonus || 0) +
    (extra.perfectHalfBonus || 0);
  half = Math.max(22, Math.min(110, Math.round(half)));

  let perfectMinWater = Math.round(mid - half);
  let perfectMaxWater = Math.round(mid + half);
  perfectMinWater = Math.max(minWater + 8, perfectMinWater);
  perfectMaxWater = Math.min(maxWater - 8, perfectMaxWater);
  if (perfectMaxWater - perfectMinWater < 24) {
    perfectMinWater = Math.max(minWater + 8, mid - 14);
    perfectMaxWater = Math.min(maxWater - 8, mid + 14);
  }

  let perfectMinTrace = base.perfectMinTrace;
  if (perfectMinTrace != null) {
    perfectMinTrace += (kindMod?.perfectMinTraceDelta || 0) + (extra.perfectMinTraceDelta || 0);
    perfectMinTrace = Math.max(18, Math.round(perfectMinTrace));
  }

  let requestsSeaweedExtract = base.requestsSeaweedExtract;
  if (tier <= 2 && cropId !== 'peanut') requestsSeaweedExtract = false;
  if (tier === 3) requestsSeaweedExtract = false;

  let requestsLiquidFertilizer = tier >= 3;
  if (tier <= 2 && cropId !== 'peanut') requestsLiquidFertilizer = false;

  let perfectMinFertilizer = null;
  let perfectMaxFertilizer = null;
  if (tier >= 3) {
    perfectMinFertilizer = tier === 3 ? 12 : tier === 4 ? 18 : 22;
    if (tier >= 4) perfectMaxFertilizer = tier === 4 ? 85 : 80;
  }

  const def = {
    cropId,
    tier,
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
    perfectMaxTrace: base.perfectMaxTrace,
    requests_seaweed_extract: requestsSeaweedExtract,
    requests_liquid_fertilizer: requestsLiquidFertilizer,
    perfectMinFertilizer,
    perfectMaxFertilizer,
    harvestMin: base.harvestMin,
    harvestMax: base.harvestMax,
    growNote: seed.grow_note || ''
  };

  const reqStruct = CROP_ID_TO_REQUIRED_STRUCTURE[cropId];
  if (reqStruct) {
    def.required_crop_structure_id = reqStruct;
    const structLabel = CROP_STRUCTURE_LABELS[reqStruct] || reqStruct;
    def.growNote = (def.growNote ? def.growNote + '；' : '') + '种植需「' + structLabel + '」';
  }

  if (cropId === 'peanut') {
    Object.assign(def, PEANUT_OVERRIDE, {
      name: '花生',
      seedItemId: seed.item_id,
      seedName: seed.name,
      productItemId: seed.harvest_item_id,
      productName: '花生',
      tier: 2,
      growNote: seed.grow_note
    });
    def.requests_seaweed_extract = true;
    def.requests_liquid_fertilizer = true;
    def.perfectMinFertilizer = 15;
    def.perfectMaxFertilizer = null;
    delete def.requestsSeaweedExtract;
  }

  return applyTraceSensitivityToDef(def);
}

const shop = JSON.parse(fs.readFileSync(SHOP_JSON, 'utf8'));
const crops = {};
for (const s of shop.seeds) {
  const def = buildCropDef(s);
  crops[def.cropId] = def;
}

const doc = {
  schema_version: 2,
  design_note:
    '成熟区间宽裕；完美可配水分+微量+施肥值(AND)。trace_sensitivity：lethal/severe 为微量排斥作物，见 trace_sensitivity_catalog。',
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
  tier_growth_summary: {
    1: '生长快、枯/淹宽容、完美窗口很宽、无微量要求',
    2: '花生锚点或同档：中等周期与窗口',
    3: '略长周期、完美需适量浇水；微量门槛偏低',
    4: '更长周期；可请求海藻精+液态肥；完美可含水/微量/施肥',
    5: '最长周期仍≤175tick；双请求+完美三指标（门槛仍偏松）'
  },
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
