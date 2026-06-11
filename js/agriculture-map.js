/**
 * 农业地图纯仿真（无 DOM / 背包 / 金钱）。由 tools/build-agriculture-map-js.mjs 从 agriculture-standalone 生成。
 * 改规则：先改 standalone 内联脚本，再 node tools/build-agriculture-map-js.mjs
 */
(function (global) {
  'use strict';

  var envCtx = {
    cropDefs: {},
    cropDefBySeed: {},
    soils: {},
    resolveInjectParams: null
  };

  function bindEnv(env) {
    env = env || {};
    if (env.cropDefs) applyCropDefs(env.cropDefs);
    else if (env.cropDefsDoc) applyCropDefs(env.cropDefsDoc);
    if (env.soils) applySoilDefs(env.soils);
    else if (env.soilsDoc) applySoilDefs(env.soilsDoc);
    if (typeof env.resolveInjectParams === 'function') {
      envCtx.resolveInjectParams = env.resolveInjectParams;
    }
  }

  function defaultResolveInjectParams(itemId) {
    return AGRICULTURE_INJECTABLE_LIQUIDS[itemId] || null;
  }


      var SIZE = 11;
      var POOL_X = 0;
      var POOL_Y = 0;
      var BASE_POOL_WATER = 200;
      /** 每 tick 天气：相对基准池水的随机倍率区间 [0.7, 1.3]（±30%） */
      var POOL_WEATHER_FACTOR_MIN = 0.7;
      var POOL_WEATHER_FACTOR_MAX = 1.3;
      var DEFAULT_CHANNEL_CAPACITY = 2;
      var CHANNEL_CAPACITY_STEP = 2;
      var CHANNEL_CAPACITY_CHANGE_COST = 5;
      /** 文丘里施肥器 / 埋地陶瓮 / 耕地建造物：建造预付金钱；工程 tick/体力与 TASK_* 一致 */
      var VENTURI_BUILD_COST_MONEY = 20;
      var BURIED_POT_JAR_BUILD_COST_MONEY = 20;
      var SUPER_FUSION_BUILD_COST_MONEY = 200;
      var CROP_STRUCTURE_BUILD_COST_MONEY = 20;
      /** §2.2f 耕地建造物（仅可建在已开垦耕地上） */
      var CROP_STRUCTURE_DEFS = {
        support_frame: { id: "support_frame", name: "支架" },
        protection_cage: { id: "protection_cage", name: "保护笼" },
        binding_strap: { id: "binding_strap", name: "捆绑带" },
        water_storage_ridge: { id: "water_storage_ridge", name: "蓄水田埂" },
        deep_pool: { id: "deep_pool", name: "深水池" },
        shade_cover: { id: "shade_cover", name: "遮光罩" },
        canopy: { id: "canopy", name: "顶棚" }
      };
      /** §4.3 水藻爆发 */
      var ALGAE_BLOOM_RATIO_THRESHOLD = 2.5;
      var ALGAE_BLOOM_HEALTH_LOSS_PER_TICK = 2;
      /** §2.2d 文丘里等级与设定浓度 */
      var VENTURI_MAX_LEVEL = 3;
      var VENTURI_UPGRADE_COST_MONEY = 5;
      var VENTURI_CONC_RANGE_BY_LEVEL = { 1: { min: 5, max: 10 }, 2: { min: 3, max: 15 }, 3: { min: 1, max: 20 } };
      var VENTURI_DEFAULT_SET_CONC = 7;
      /** 文丘里海藻精输送：A面=检测作物请求；B面=有水+海藻精即维持（见 §15.6） */
      var VENTURI_SEAWEED_LOGIC_A = "a";
      var VENTURI_SEAWEED_LOGIC_B = "b";
      var VENTURI_SEAWEED_LOGIC_DEFAULT = VENTURI_SEAWEED_LOGIC_B;
      var LIQUID_SEAWEED_EXTRACT_ITEM_ID = "liquid_seaweed_extract";
      /**
       * 农业液态肥登记（正式服按 injectFacility 分设施；两条作物累计分轨）
       * venturi_fertilizer + 海藻精 → 渠内浓度 → 作物 traceAbsorbed（累计微量元素），不写 fertilizerAbsorbed
       * buried_pot_jar + 液态肥 → 八邻施加 → 作物 fertilizerAbsorbed（累计施肥值），不写 traceAbsorbed
       * @type {Record<string, { name: string, injectFacility: string, fertilizerPerTick?: number, effectDurationTicks?: number }>}
       */
      var AGRICULTURE_INJECTABLE_LIQUIDS = {
        liquid_fertilizer_n: { name: "液态氮肥", injectFacility: "buried_pot_jar", fertilizerPerTick: 0.5 },
        liquid_seaweed_extract: { name: "海藻精", injectFacility: "venturi_fertilizer", effectDurationTicks: 5000 }
      };
      var VENTURI_INJECTABLE_LIQUIDS = AGRICULTURE_INJECTABLE_LIQUIDS;
      var DEFAULT_SOIL_TYPE = "盐碱土";
      var DEFAULT_SOIL_ID = "soil_saline_alkali";
      
      var INITIAL_MONEY = 500;
      /** 水池等级：L2 窃流；L3 蓄水池；L4 cap4+溢流回蓄（§8.4～8.6） */
      var POOL_MAX_LEVEL = 4;
      var POOL_UPGRADE_COST_BY_LEVEL = { 2: 100, 3: 200, 4: 350 };
      var THEFT_TRANSFER_CAP_BY_POOL_LEVEL = { 1: 0, 2: 2, 3: 2, 4: 4 };
      var POOL_RESERVOIR_CAPACITY_MAX = 50000;
      var POOL_LEVEL_LABELS = {
        1: "基础",
        2: "支流窃流",
        3: "蓄水池",
        4: "窃流强化+溢流回蓄"
      };
      var TASK_TICKS = 10;
      var TASK_STAMINA_PER_TICK = 5;
      var RECOVER_STAMINA_PER_TICK = 5;
      var MAX_STAMINA = 100;
      var TICK_MS = 1000;
      var DEFAULT_CROP_HEALTH_MAX = 100;
      var CROP_DEFS = {};
      var CROP_DEF_BY_SEED = {};
      var CROP_DEFS_LOADED = false;
      var SOIL_DEFS = {};
      var SOIL_DEFS_LOADED = false;
      var WATER_PROFILE_LABELS = {
        xeric: "耐旱忌涝",
        mesic: "常规",
        hydrophilic: "喜湿",
        aquatic: "水生"
      };
      var SHOP_ITEMS = {
        liquidFertilizerN: { itemId: "liquid_fertilizer_n", name: "液态氮肥", price: 8 },
        liquidSeaweedExtract: { itemId: "liquid_seaweed_extract", name: "海藻精", price: 5 }
      };
      /** demo 客土商店：除默认盐碱土外七种可购客土 */
      var DEMO_SOIL_SHOP = [
        { itemId: "soil_amend_yellow_cotton", soilId: "soil_yellow_cotton", name: "黄绵土", price: 14 },
        { itemId: "soil_amend_cinnamon", soilId: "soil_cinnamon", name: "褐土", price: 16 },
        { itemId: "soil_amend_purple", soilId: "soil_purple", name: "紫色土", price: 20 },
        { itemId: "soil_amend_red", soilId: "soil_red", name: "红壤", price: 16 },
        { itemId: "soil_amend_alpine_meadow", soilId: "soil_alpine_meadow", name: "高山草甸土", price: 18 },
        { itemId: "soil_amend_paddy", soilId: "soil_paddy", name: "水稻土", price: 22 },
        { itemId: "soil_amend_black", soilId: "soil_black", name: "典型黑土", price: 24 }
      ];
      var SEED_SHOP_CATALOG = [];
      var SEED_SHOP_GROUP_LABELS = {};
      var SEED_SHOP_GROUP_ORDER = ["grain", "veg", "aromatics", "spice", "fruit"];
      var SEED_SHOP_TIER_LABELS = {};
      var SEED_SHOP_TIER_ORDER = [1, 2, 3, 4, 5];
      var SEED_TIER_TRADE_UNLOCK = { 1: 0, 2: 2000, 3: 4000, 4: 6000, 5: 8000 };
      var SEED_TIER_TRADE_UNLOCK_STEP = 2000;
      /** 可用于客土改良的背包道具 id → 目标土壤（写入 cell.soilId / cell.soilType） */
      var SOIL_AMEND_ITEMS = (function () {
        var m = {};
        var i;
        for (i = 0; i < DEMO_SOIL_SHOP.length; i++) {
          var row = DEMO_SOIL_SHOP[i];
          m[row.itemId] = { soilId: row.soilId, soilType: row.name };
        }
        return m;
      })();
      var DEMO_SELL_PRICE_RULE = { seed_ratio: 0.5, crop_ratio: 0.8, min: 3 };
      var ITEM_SELL_PRICES = {
        liquid_fertilizer_n: 3,
        liquid_seaweed_extract: 2
      };
      (function () {
        var i;
        for (i = 0; i < DEMO_SOIL_SHOP.length; i++) {
          ITEM_SELL_PRICES[DEMO_SOIL_SHOP[i].itemId] = Math.max(3, Math.round(DEMO_SOIL_SHOP[i].price * 0.4));
        }
      })();
      function demoSellPriceFromShop(shopPrice, ratio) {
        var min = Number(DEMO_SELL_PRICE_RULE.min) || 3;
        var r = Number(ratio);
        if (!(r > 0)) r = 0.5;
        return Math.max(min, Math.round((Number(shopPrice) || 10) * r));
      }
      function seedSellPrice(shopPrice) {
        return demoSellPriceFromShop(shopPrice, DEMO_SELL_PRICE_RULE.seed_ratio);
      }
      function cropSellPrice(shopPrice) {
        return demoSellPriceFromShop(shopPrice, DEMO_SELL_PRICE_RULE.crop_ratio);
      }

      function applyCropDefs(doc) {
        CROP_DEFS = (doc && doc.crops) ? doc.crops : {};
        CROP_DEF_BY_SEED = {};
        for (var cid in CROP_DEFS) {
          if (!Object.prototype.hasOwnProperty.call(CROP_DEFS, cid)) continue;
          var d = CROP_DEFS[cid];
          if (d && d.seedItemId) CROP_DEF_BY_SEED[d.seedItemId] = d;
        }
        CROP_DEFS_LOADED = Object.keys(CROP_DEFS).length > 0;
        if (doc && doc.water_profile_labels) WATER_PROFILE_LABELS = doc.water_profile_labels;
      }
      function applySoilDefs(doc) {
        SOIL_DEFS = (doc && doc.soils) ? doc.soils : {};
        SOIL_DEFS_LOADED = Object.keys(SOIL_DEFS).length > 0;
      }
      /** 旧表顶层的 absorption_modifiers / special_effect 归并到 fusion_gated（兼容） */
      function getSoilFusionGated(soil) {
        if (!soil) return {};
        if (soil.fusion_gated) return soil.fusion_gated;
        var legacy = {};
        if (soil.absorption_modifiers) legacy.absorption_modifiers = soil.absorption_modifiers;
        if (soil.special_effect) legacy.special_effect = soil.special_effect;
        return legacy;
      }
      /** 与文丘里 A 面同一条件：场上至少一座超融合（§2.2g） */
      function isSoilFusionActive(st) {
        return anySuperFusionOnMap(st);
      }
            function getSoilDef(soilId) {
        if (soilId && SOIL_DEFS[soilId]) return SOIL_DEFS[soilId];
        if (SOIL_DEFS[DEFAULT_SOIL_ID]) return SOIL_DEFS[DEFAULT_SOIL_ID];
        return {
          soil_id: DEFAULT_SOIL_ID,
          display_name: DEFAULT_SOIL_TYPE,
          water_retention: 1,
          fertilizer_retention: 1,
          trace_retention: 1
        };
      }
      function getPlotSoilId(plotCell) {
        return plotCell.soilId || DEFAULT_SOIL_ID;
      }
      function getPlotSoilEffectId(plotCell, st) {
        if (!isSoilFusionActive(st)) return null;
        var gated = getSoilFusionGated(getSoilDef(getPlotSoilId(plotCell)));
        var fx = gated.special_effect;
        return fx && fx.effect_id ? fx.effect_id : null;
      }
      function cropHasSoilTag(def, tag) {
        if (!def || !tag) return false;
        var tags = def.soil_tags;
        if (tags && tags.length) {
          for (var ti = 0; ti < tags.length; ti++) {
            if (tags[ti] === tag) return true;
          }
          return false;
        }
        if (tag === "salt_tolerant" && def.water_profile === "xeric") return true;
        if (tag === "heat_loving" && (def.cropId === "tomato" || def.cropId === "tomato_green" ||
            def.cropId === "chili_red" || def.cropId === "chili_kashmir" || def.cropId === "cucumber")) return true;
        if (tag === "acid_loving" && (def.nitrogen_fixing || def.cropId === "ginger" ||
            def.cropId === "turmeric" || def.cropId === "konjac" || def.cropId === "potato")) return true;
        return false;
      }
      function isRiceCropId(cropId) {
        return cropId === "rice" || cropId === "rice_bomba" ||
          cropId === "rice_basmati" || cropId === "rice_glutinous_round";
      }
      function isPaddyPrimingPrevCrop(prevCropId) {
        if (!prevCropId) return false;
        if (isRiceCropId(prevCropId)) return true;
        var prevDef = CROP_DEFS[prevCropId];
        if (!prevDef) return false;
        return prevDef.water_profile === "aquatic" || prevDef.water_profile === "hydrophilic";
      }
      function getSoilRetentionRate(plotCell, kind, st) {
        var soil = getSoilDef(getPlotSoilId(plotCell));
        var base = soil[kind + "_retention"];
        if (!(base >= 0)) base = 1;
        var mul = 1;
        if (isSoilFusionActive(st)) {
          var gated = getSoilFusionGated(soil);
          var mods = gated.absorption_modifiers || {};
          mul = mods[kind + "_multiplier"];
          if (!(mul > 0)) mul = 1;
        }
        return base * mul;
      }
      function resolveAbsorptionAmount(plotCell, kind, supplyAmount, cropDef, st) {
        var amount = Number(supplyAmount) || 0;
        if (!(amount > 0)) return 0;
        amount *= getSoilRetentionRate(plotCell, kind, st);
        if (cropDef && cropDef[kind + "_absorption_multiplier"] > 0) {
          amount *= cropDef[kind + "_absorption_multiplier"];
        }
        return round1(amount);
      }
      function resolveCropGrowthTicks(plotCell, def, st) {
        var ticks = def.growthTicks;
        var effectId = getPlotSoilEffectId(plotCell, st);
        if (effectId === "cold_meadow") ticks = Math.ceil(ticks * 1.06);
        if (effectId === "ponding" && def.water_profile === "xeric") ticks = Math.ceil(ticks * 1.1);
        return ticks;
      }
      function syncAllCropGrowthTicksForFusionChange(st) {
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var c = cell(st, x, y);
            if (!c.crop || c.crop.settled) continue;
            var def = CROP_DEFS[c.crop.cropId];
            if (!def) continue;
            var newTotal = resolveCropGrowthTicks(c, def, st);
            var oldTotal = c.crop.totalTicks || def.growthTicks;
            if (oldTotal > 0 && c.crop.remainingTicks > 0) {
              c.crop.remainingTicks = Math.max(1, Math.ceil(c.crop.remainingTicks * newTotal / oldTotal));
            }
            c.crop.totalTicks = newTotal;
          }
        }
      }
      function updateSameCropStreakOnPlant(plotCell, def) {
        if (plotCell.previousCropId === def.cropId) {
          plotCell.sameCropStreak = (plotCell.sameCropStreak || 1) + 1;
        } else {
          plotCell.sameCropStreak = 1;
        }
      }
      function initCropSoilFieldsOnPlant(plotCell, crop, def, st) {
        crop.jarFertThisTick = false;
        crop.paddyPrimingTicks = 0;
        if (getPlotSoilEffectId(plotCell, st) === "ponding" && isPaddyPrimingPrevCrop(plotCell.previousCropId)) {
          crop.paddyPrimingTicks = 20;
        }
      }
      function applySoilWaterAbsorbSideEffects(plotCell, crop, dw, st) {
        if (!(dw > 0)) return;
        if (getPlotSoilEffectId(plotCell, st) !== "loose_drain") return;
        var fa = round1(crop.fertilizerAbsorbed || 0);
        if (fa > 0) crop.fertilizerAbsorbed = round1(Math.max(0, fa - fa * 0.04));
      }
      function agriTickStep5cSoilFusionExtras(state) {
        if (!isSoilFusionActive(state)) return;
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var c = cell(state, x, y);
            if (!c.crop || c.crop.settled) continue;
            var crop = c.crop;
            var def = CROP_DEFS[crop.cropId];
            if (!def) continue;
            var effectId = getPlotSoilEffectId(c, state);
            if (effectId === "humus_bank" && cropDefRequestsLiquidFertilizer(def) && !crop.jarFertThisTick) {
              crop.fertilizerAbsorbed = round1((crop.fertilizerAbsorbed || 0) + 0.2);
            }
            if (effectId === "ponding" && crop.paddyPrimingTicks > 0) {
              crop.fertilizerAbsorbed = round1((crop.fertilizerAbsorbed || 0) + 0.2);
              crop.paddyPrimingTicks -= 1;
            }
          }
        }
      }
      function formatSoilLockSummary(soilId, fusionActive) {
        var soil = getSoilDef(soilId);
        var w = Math.round((soil.water_retention != null ? soil.water_retention : 1) * 100);
        var f = Math.round((soil.fertilizer_retention != null ? soil.fertilizer_retention : 1) * 100);
        var t = Math.round((soil.trace_retention != null ? soil.trace_retention : 1) * 100);
        var line = "锁水 " + w + "% · 锁肥 " + f + "% · 锁微量 " + t + "%";
        if (fusionActive) {
          var fx = getSoilFusionGated(soil).special_effect;
          if (fx && fx.label) line += " · " + fx.label;
        }
        return line;
      }
      function getCropDefBySeedItemId(seedItemId) {
        return CROP_DEF_BY_SEED[seedItemId] || null;
      }
      function formatCropWaterBand(def) {
        if (!def) return "";
        return def.minWater + "~" + def.maxWater;
      }
                  function loadSeedShopCatalog(done) {
        applySeedShopCatalog(window.AGRICULTURE_SEED_SHOP);
        if (typeof done === "function") done(true);
      }




            function getSeedTierTradeUnlockRequired(tier) {
        var t = Number(tier) || 1;
        var map = SEED_TIER_TRADE_UNLOCK;
        if (map) {
          if (map[t] != null) return Math.max(0, Number(map[t]) || 0);
          if (map[String(t)] != null) return Math.max(0, Number(map[String(t)]) || 0);
        }
        return t <= 1 ? 0 : (t - 1) * (Number(SEED_TIER_TRADE_UNLOCK_STEP) || 2000);
      }






      var DIRS = [
        { dx: 0, dy: 1, key: "down" },
        { dx: 1, dy: 0, key: "right" },
        { dx: -1, dy: 0, key: "left" },
        { dx: 0, dy: -1, key: "up" }
      ];
      /** §2.2e 埋地陶瓮施肥：八方向（含斜角） */
      var DIRS_8 = [
        { dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 },
        { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 }
      ];
      var FACILITY_LIQUID_EMPTY_MSG = {
        venturi_fertilizer: "背包中无可用物品",
        buried_pot_jar: "背包中无可用物品"
      };

      function keyOf(x, y) { return x + "," + y; }
      function round1(n) { return Math.round((n || 0) * 10) / 10; }
      function inBounds(x, y) { return x >= 0 && x < SIZE && y >= 0 && y < SIZE; }

      function venturiConcRangeForLevel(level) {
        var lv = Math.max(1, Math.min(VENTURI_MAX_LEVEL, Number(level) || 1));
        return VENTURI_CONC_RANGE_BY_LEVEL[lv] || VENTURI_CONC_RANGE_BY_LEVEL[1];
      }

      function clampVenturiSetConc(level, setConc) {
        var r = venturiConcRangeForLevel(level);
        var v = Number(setConc);
        if (!(v >= 0)) v = VENTURI_DEFAULT_SET_CONC;
        if (v < r.min) v = r.min;
        if (v > r.max) v = r.max;
        return v;
      }

      function ensureVenturiCellFields(c) {
        if (!isVenturiCell(c)) return;
        if (c.venturiLevel == null) c.venturiLevel = 1;
        c.venturiLevel = Math.max(1, Math.min(VENTURI_MAX_LEVEL, Number(c.venturiLevel) || 1));
        if (c.seaweedSetConcentration == null && c.venturiSetConc != null) {
          c.seaweedSetConcentration = c.venturiSetConc;
        }
        c.seaweedSetConcentration = clampVenturiSetConc(c.venturiLevel, c.seaweedSetConcentration);
        delete c.venturiSetConc;
      }

      /** §4.3：C:W 高于阈值 :1 时爆发；C<=0 或 W<=0 不爆发（每 tick 实时，不跨 tick 锁存） */
      function isAlgaeBloom(W, C) {
        var w = Number(W) || 0;
        var c = Number(C) || 0;
        if (w <= 0 || c <= 0) return false;
        return c > ALGAE_BLOOM_RATIO_THRESHOLD * w;
      }

      function isChannelAlgaeBloom(water, concentration) {
        return isAlgaeBloom(water, concentration);
      }

      /** Buff/装备等对水藻爆发伤害的修正入口；最终扣减 ≥ 0 */
      function resolveAlgaeBloomHealthLoss(baseLoss) {
        var loss = Number(baseLoss);
        if (!(loss >= 0)) loss = 0;
        return loss;
      }

      function clearAllChannelSeaweedConcentration(state) {
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var c = cell(state, x, y);
            if (!isChannelCell(c)) continue;
            c.seaweedConcentration = 0;
          }
        }
      }

      function ensureSeaweedRequestsState(state) {
        if (!state.seaweedRequests) {
          state.seaweedRequests = { mainstream: [], byBranch: {} };
        }
        if (!state.seaweedRequests.mainstream) state.seaweedRequests.mainstream = [];
        if (!state.seaweedRequests.byBranch) state.seaweedRequests.byBranch = {};
      }

      function cropDefRequestsSeaweedExtract(def) {
        if (!def) return false;
        if (def.requestsSeaweedExtract === true || def.requests_seaweed_extract === true) return true;
        return false;
      }

      function cropDefRequestsLiquidFertilizer(def) {
        if (!def) return false;
        if (def.requestsLiquidFertilizer === true || def.requests_liquid_fertilizer === true) return true;
        return false;
      }

      function cropTraceSensitivity(def) {
        if (!def || !def.trace_sensitivity) return null;
        return def.trace_sensitivity === "lethal" || def.trace_sensitivity === "severe"
          ? def.trace_sensitivity
          : null;
      }

      function formatTraceSensitivityHint(def) {
        var sens = cropTraceSensitivity(def);
        if (!sens) return "";
        if (sens === "lethal") {
          return "微量排斥·致死：安全≤" + def.trace_safe_max + "，≥" + def.trace_lethal_at + " 窒息枯死";
        }
        return "微量排斥·严重：安全≤" + def.trace_safe_max + "，≥" + def.trace_fail_harvest_at + " 落果无收";
      }

      /** §4b.1g：吸收微量后的排斥扣血 */
      function applyTraceSensitivityToPlot(state, x, y) {
        var c = cell(state, x, y);
        if (!c.crop || c.crop.settled) return;
        var def = CROP_DEFS[c.crop.cropId];
        var sens = cropTraceSensitivity(def);
        if (!sens) return;
        var trace = round1(c.crop.traceAbsorbed || 0);
        var safeMax = Number(def.trace_safe_max);
        if (!(safeMax >= 0)) return;
        var hm = c.crop.healthMax != null ? Number(c.crop.healthMax) : DEFAULT_CROP_HEALTH_MAX;
        if (!(hm > 0)) hm = DEFAULT_CROP_HEALTH_MAX;
        var hc = c.crop.healthCurrent != null ? Number(c.crop.healthCurrent) : hm;
        var loss = 0;
        if (sens === "lethal") {
          var lethalAt = Number(def.trace_lethal_at);
          if (!(lethalAt > safeMax)) lethalAt = safeMax + 4;
          if (trace >= lethalAt) {
            loss = Number(def.trace_lethal_loss_per_tick) || 60;
          } else if (trace > safeMax) {
            loss = Number(def.trace_stress_loss_per_tick) || 4;
          } else if (trace > 0) {
            loss = 1;
          }
        } else if (sens === "severe" && trace > safeMax) {
          loss = Number(def.trace_toxic_health_loss_per_tick) || 2;
        }
        if (loss > 0) {
          c.crop.healthMax = hm;
          c.crop.healthCurrent = Math.min(hm, Math.max(0, hc - loss));
          if (applyGrowingCropHealthDeath(c)) {
            syncPlotSeaweedRequests(state, x, y);
            syncPlotFertilizerRequests(state, x, y);
          }
        }
      }

      function agriTickStep5aTraceSensitivity(state) {
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            applyTraceSensitivityToPlot(state, x, y);
          }
        }
      }

      function scoreWaterDimension(def, water, cell, st) {
        var pMin = def.perfectMinWater;
        var pMax = def.perfectMaxWater;
        var flood = def.waterlogged_above != null
          ? def.waterlogged_above
          : def.perfectMaxWater + Math.max(8, Math.round((def.maxWater - def.perfectMaxWater) * 0.35));
        var effectId = cell ? getPlotSoilEffectId(cell, st) : null;
        if (effectId === "filtration" && def.water_profile === "xeric") {
          flood = Math.round(flood * 1.15);
        }
        if (effectId === "ponding") {
          if (def.water_profile === "hydrophilic" || def.water_profile === "aquatic") {
            flood = Math.round(flood * 1.18);
          }
        }
        if (def.water_profile === "xeric") {
          if (water >= pMin && water <= pMax) return 2;
          if (water > flood) return 0;
          return 1;
        }
        if (def.water_profile === "hydrophilic" || def.water_profile === "aquatic") {
          if (water >= pMin && water <= pMax) return 2;
          if (water < def.minWater) return 0;
          return 1;
        }
        if (water >= pMin && water <= pMax) return 2;
        return 1;
      }

      function traceScoreParticipates(def) {
        if (cropTraceSensitivity(def)) return true;
        return def.perfectMinTrace != null;
      }

      function scoreTraceDimension(def, trace, cell, st) {
        var sens = cropTraceSensitivity(def);
        var effectId = cell ? getPlotSoilEffectId(cell, st) : null;
        if (sens) {
          var safeMax = Number(def.trace_safe_max);
          if (!(safeMax >= 0)) return 1;
          if (effectId === "mineral_rich") safeMax = round1(safeMax * 0.9);
          return trace <= safeMax ? 2 : 0;
        }
        if (def.perfectMinTrace == null) return null;
        var minT = Number(def.perfectMinTrace);
        var maxT = def.perfectMaxTrace != null ? Number(def.perfectMaxTrace) : Infinity;
        if (effectId === "mineral_rich" && cropDefRequestsSeaweedExtract(def)) {
          var spanT = maxT !== Infinity ? (maxT - minT) : Math.max(minT * 0.15, 8);
          minT = Math.max(0, round1(minT - spanT * 0.1));
          if (maxT !== Infinity) maxT = round1(maxT + spanT * 0.1);
        }
        if (trace >= minT && trace <= maxT) return 2;
        return 1;
      }

      function fertScoreParticipates(def) {
        return def.perfectMinFertilizer != null;
      }

      function scoreFertilizerDimension(def, fert, cell, st) {
        if (!fertScoreParticipates(def)) return null;
        var minF = Number(def.perfectMinFertilizer);
        var maxF = def.perfectMaxFertilizer != null ? Number(def.perfectMaxFertilizer) : Infinity;
        var effectId = cell ? getPlotSoilEffectId(cell, st) : null;
        if (effectId === "acidic_fixation" && cropHasSoilTag(def, "acid_loving")) {
          var spanF = maxF !== Infinity ? (maxF - minF) : Math.max(minF * 0.15, 5);
          minF = Math.max(0, round1(minF - spanF * 0.1));
          if (maxF !== Infinity) maxF = round1(maxF + spanF * 0.1);
        }
        if (fert >= minF && fert <= maxF) return 2;
        return 1;
      }

      function soilScoreParticipates(def) {
        if (!def.soil_scoring) return false;
        var sc = def.soil_scoring;
        return (sc.preferred && sc.preferred.length) || (sc.unsuitable && sc.unsuitable.length);
      }

      function scoreSoilDimension(def, soilType, cell, st) {
        if (!soilScoreParticipates(def)) return null;
        var sc = def.soil_scoring;
        var preferred = sc.preferred || [];
        var unsuitable = sc.unsuitable || [];
        var base = 0;
        var i;
        for (i = 0; i < preferred.length; i++) {
          if (preferred[i] === soilType) { base = 1; break; }
        }
        if (base === 0) {
          for (i = 0; i < unsuitable.length; i++) {
            if (unsuitable[i] === soilType) { base = -1; break; }
          }
        }
        if (cell && isSoilFusionActive(st)) {
          var effectId = getPlotSoilEffectId(cell, st);
          if (effectId === "filtration") {
            if (cropHasSoilTag(def, "salt_tolerant")) base += 1;
            else base -= 1;
          }
          if (effectId === "acidic_fixation" && def.water_profile === "hydrophilic" && def.group === "veg") {
            base -= 1;
          }
        }
        return base;
      }

      function scoreRotationDimension(cell, def, st) {
        var prev = cell.previousCropId;
        if (!prev) return 0;
        if (prev === def.cropId) {
          if (isSoilFusionActive(st) && getPlotSoilId(cell) === "soil_black") {
            var streak = cell.sameCropStreak || 2;
            return streak >= 3 ? -2 : -1;
          }
          return 0;
        }
        var prevDef = CROP_DEFS[prev];
        if (!prevDef) return 0;
        if (def.group && prevDef.group && def.group !== prevDef.group) {
          if (isSoilFusionActive(st) && getPlotSoilId(cell) === "soil_alpine_meadow") return 3;
          return 2;
        }
        if (prevDef.nitrogen_fixing && !def.nitrogen_fixing) {
          if (isSoilFusionActive(st) && getPlotSoilId(cell) === "soil_yellow_cotton") return 3;
          return 2;
        }
        return 0;
      }

      function computeGrowthYield(def, cell, crop, st) {
        var water = crop.waterAbsorbed;
        var trace = round1(crop.traceAbsorbed || 0);
        var fert = round1(crop.fertilizerAbsorbed || 0);
        var dimScores = [scoreWaterDimension(def, water, cell, st)];
        var ts = scoreTraceDimension(def, trace, cell, st);
        if (ts != null) {
          if (getPlotSoilEffectId(cell, st) === "calcareous_steady" && ts === 2) ts = 1;
          dimScores.push(ts);
        }
        var fs = scoreFertilizerDimension(def, fert, cell, st);
        if (fs != null) dimScores.push(fs);
        var ss = scoreSoilDimension(def, cell.soilType || DEFAULT_SOIL_TYPE, cell, st);
        if (ss != null) dimScores.push(ss);
        dimScores.push(scoreRotationDimension(cell, def, st));
        var positive = 0;
        var negative = 0;
        var i;
        for (i = 0; i < dimScores.length; i++) {
          var s = dimScores[i];
          if (s > 0) positive += s;
          else if (s < 0) negative += -s;
        }
        var penalty = Math.min(negative * 0.25, 0.5);
        var multiplier = 1 + positive * 0.25 - penalty;
        if (getPlotSoilEffectId(cell, st) === "calcareous_steady") {
          multiplier = Math.max(0.9, multiplier);
        }
        var baseCount = def.harvestMin + Math.floor(Math.random() * (def.harvestMax - def.harvestMin + 1));
        var harvestCount = Math.max(1, Math.floor(baseCount * multiplier));
        return {
          harvestCount: harvestCount,
          growthScorePositive: positive,
          growthScoreNegative: negative,
          yieldMultiplier: multiplier
        };
      }

      function ensureFertilizerRequestsState(state) {
        if (!state.fertilizerRequests) state.fertilizerRequests = [];
      }

      /** §4b.1f：八邻至少一格埋地陶瓮 */
      function hasAdjacentBuriedPotJar(state, x, y) {
        var found = false;
        forEachNeighbor8(x, y, function (nx, ny) {
          if (isBuriedPotJarCell(cell(state, nx, ny))) found = true;
        });
        return found;
      }

      function fertilizerRequestListHasPlot(list, x, y) {
        if (!list) return false;
        for (var i = 0; i < list.length; i++) {
          if (list[i].x === x && list[i].y === y) return true;
        }
        return false;
      }

      function isFertilizerRequestEntryStillValid(state, entry) {
        if (!entry || !inBounds(entry.x, entry.y)) return false;
        var c = cell(state, entry.x, entry.y);
        if (!c.crop) return false;
        var def = CROP_DEFS[c.crop.cropId];
        if (!cropDefRequestsLiquidFertilizer(def)) return false;
        if (!hasAdjacentBuriedPotJar(state, entry.x, entry.y)) return false;
        return true;
      }

      function removePlotFromFertilizerRequests(state, x, y) {
        ensureFertilizerRequestsState(state);
        state.fertilizerRequests = state.fertilizerRequests.filter(function (e) {
          return e.x !== x || e.y !== y;
        });
      }

      function registerPlotFertilizerRequestsIfEligible(state, x, y) {
        var c = cell(state, x, y);
        if (!c.crop) return;
        var def = CROP_DEFS[c.crop.cropId];
        if (!cropDefRequestsLiquidFertilizer(def)) return;
        if (!hasAdjacentBuriedPotJar(state, x, y)) return;
        ensureFertilizerRequestsState(state);
        var entry = { x: x, y: y, cropId: c.crop.cropId };
        if (!fertilizerRequestListHasPlot(state.fertilizerRequests, x, y)) {
          state.fertilizerRequests.push(entry);
        }
      }

      function syncPlotFertilizerRequests(state, x, y) {
        removePlotFromFertilizerRequests(state, x, y);
        registerPlotFertilizerRequestsIfEligible(state, x, y);
      }

      function syncCropFertilizerRequests(state) {
        ensureFertilizerRequestsState(state);
        var kept = [];
        for (var i = 0; i < state.fertilizerRequests.length; i++) {
          if (isFertilizerRequestEntryStillValid(state, state.fertilizerRequests[i])) {
            kept.push(state.fertilizerRequests[i]);
          }
        }
        state.fertilizerRequests = kept;
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            registerPlotFertilizerRequestsIfEligible(state, x, y);
          }
        }
      }

      /** 埋地陶瓮建成/拆除后，刷新八邻作物登记 */
      function syncFertilizerRequestsNearBuriedJar(st, jx, jy) {
        forEachNeighbor8(jx, jy, function (nx, ny) {
          syncPlotFertilizerRequests(st, nx, ny);
        });
      }

      /** §4b.1a：四邻接至少一格有水水渠（不含水池） */
      function hasAdjacentWetChannel(state, x, y) {
        var found = false;
        forEachNeighbor(x, y, function (nx, ny) {
          var nc = cell(state, nx, ny);
          if (isChannelCell(nc) && (Number(nc.water) || 0) > 0) found = true;
        });
        return found;
      }

      /** 受水归属为支流 #N 时返回 N；仅主干/水池归属返回 null */
      function getBranchIndexForSeaweedRegistration(source) {
        if (!source) return null;
        if (source.kind === "pool") return null;
        if (source.isTrunk) return null;
        var bi = Number(source.branchIndex);
        if (bi > 0) return bi;
        return null;
      }

      function seaweedRequestListHasPlot(list, x, y) {
        if (!list) return false;
        for (var i = 0; i < list.length; i++) {
          if (list[i].x === x && list[i].y === y) return true;
        }
        return false;
      }

      function isSeaweedRequestEntryStillValid(state, entry) {
        if (!entry || !inBounds(entry.x, entry.y)) return false;
        var c = cell(state, entry.x, entry.y);
        if (!c.crop) return false;
        var def = CROP_DEFS[c.crop.cropId];
        if (!cropDefRequestsSeaweedExtract(def)) return false;
        if (!hasAdjacentWetChannel(state, entry.x, entry.y)) return false;
        if (!getIrrigationSourceForPlot(state, entry.x, entry.y)) return false;
        return true;
      }

      function shouldSeaweedRequestOnBranch(state, x, y, branchIndex) {
        var source = getIrrigationSourceForPlot(state, x, y);
        return getBranchIndexForSeaweedRegistration(source) === branchIndex;
      }

      function removePlotFromSeaweedRequests(state, x, y) {
        ensureSeaweedRequestsState(state);
        var sr = state.seaweedRequests;
        sr.mainstream = sr.mainstream.filter(function (e) { return e.x !== x || e.y !== y; });
        for (var bk in sr.byBranch) {
          if (!Object.prototype.hasOwnProperty.call(sr.byBranch, bk)) continue;
          sr.byBranch[bk] = sr.byBranch[bk].filter(function (e) { return e.x !== x || e.y !== y; });
          if (!sr.byBranch[bk].length) delete sr.byBranch[bk];
        }
      }

      function registerPlotSeaweedRequestsIfEligible(state, x, y) {
        var c = cell(state, x, y);
        if (!c.crop) return;
        var def = CROP_DEFS[c.crop.cropId];
        if (!cropDefRequestsSeaweedExtract(def)) return;
        if (!hasAdjacentWetChannel(state, x, y)) return;
        var source = getIrrigationSourceForPlot(state, x, y);
        if (!source) return;
        ensureSeaweedRequestsState(state);
        var sr = state.seaweedRequests;
        var entry = { x: x, y: y, cropId: c.crop.cropId };
        if (!seaweedRequestListHasPlot(sr.mainstream, x, y)) sr.mainstream.push(entry);
        var branchIdx = getBranchIndexForSeaweedRegistration(source);
        if (branchIdx != null) {
          if (!sr.byBranch[branchIdx]) sr.byBranch[branchIdx] = [];
          if (!seaweedRequestListHasPlot(sr.byBranch[branchIdx], x, y)) {
            sr.byBranch[branchIdx].push(entry);
          }
        }
      }

      /** 单格：先撤销再按当前归属重登（§4b.1a 受水变更） */
      function syncPlotSeaweedRequests(state, x, y) {
        removePlotFromSeaweedRequests(state, x, y);
        registerPlotSeaweedRequestsIfEligible(state, x, y);
      }

      /** §5 / 每 tick：全表扫描，撤销无效、补登有效 */
      function syncCropSeaweedExtractRequests(state) {
        ensureSeaweedRequestsState(state);
        var sr = state.seaweedRequests;
        var prunedMain = [];
        for (var i = 0; i < sr.mainstream.length; i++) {
          if (isSeaweedRequestEntryStillValid(state, sr.mainstream[i])) prunedMain.push(sr.mainstream[i]);
        }
        var prunedByBranch = {};
        for (var bk in sr.byBranch) {
          if (!Object.prototype.hasOwnProperty.call(sr.byBranch, bk)) continue;
          var branchIdx = Number(bk);
          var list = sr.byBranch[bk];
          var kept = [];
          for (var j = 0; j < list.length; j++) {
            var e = list[j];
            if (!isSeaweedRequestEntryStillValid(state, e)) continue;
            if (!shouldSeaweedRequestOnBranch(state, e.x, e.y, branchIdx)) continue;
            kept.push(e);
          }
          if (kept.length) prunedByBranch[bk] = kept;
        }
        sr.mainstream = prunedMain;
        sr.byBranch = prunedByBranch;
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            registerPlotSeaweedRequestsIfEligible(state, x, y);
          }
        }
      }

      function isSeaweedEffectVenturi(c) {
        if (!isVenturiCell(c) || !c.venturiLiquid) return false;
        if (c.venturiLiquid.itemId !== LIQUID_SEAWEED_EXTRACT_ITEM_ID) return false;
        if (c.venturiLiquid.effectTicksRemaining == null || c.venturiLiquid.effectTicksRemaining <= 0) return false;
        return true;
      }

      function flowKindKey(flow) {
        if (!flow) return "";
        return flow.kind === "trunk" ? "trunk" : "branch:" + flow.index;
      }

      function flowPriorityRank(flow) {
        if (!flow) return 9999;
        if (flow.kind === "trunk") return 0;
        return Number(flow.index) || 9999;
      }

      function compareFlowPriority(a, b) {
        return flowPriorityRank(a) - flowPriorityRank(b);
      }

      function getChannelFlowTag(c) {
        if (!isChannelCell(c) || (Number(c.water) || 0) <= 0) return null;
        if (c.isTrunk) return { kind: "trunk" };
        var bi = Number(c.branchIndex);
        if (bi > 0) return { kind: "branch", index: bi };
        return null;
      }

      function getBranchByIndex(state, branchIndex) {
        if (!state.branches) return null;
        for (var i = 0; i < state.branches.length; i++) {
          if (state.branches[i].index === branchIndex) return state.branches[i];
        }
        return null;
      }

      function getFlowPath(state, flow) {
        if (!flow) return [];
        if (flow.kind === "trunk") return state.trunkPath || [];
        var br = getBranchByIndex(state, flow.index);
        return br ? br.path : [];
      }

      function getFlowEndpoint(state, flow) {
        var path = getFlowPath(state, flow);
        if (!path.length) return null;
        return path[path.length - 1];
      }

      function buildFlowPathKeySet(state, flow) {
        var set = {};
        var path = getFlowPath(state, flow);
        for (var i = 0; i < path.length; i++) set[keyOf(path[i].x, path[i].y)] = true;
        return set;
      }

      function channelBelongsToFlow(state, x, y, flow) {
        var c = cell(state, x, y);
        if (!isChannelCell(c) || (Number(c.water) || 0) <= 0) return false;
        var k = keyOf(x, y);
        var pathSet = buildFlowPathKeySet(state, flow);
        if (pathSet[k]) return true;
        if (flow.kind === "trunk") return !!c.isTrunk;
        return Number(c.branchIndex) === flow.index;
      }

      function buildFlowWetCellSet(state, flow) {
        var set = {};
        var path = getFlowPath(state, flow);
        for (var i = 0; i < path.length; i++) {
          var p = path[i];
          var cc = cell(state, p.x, p.y);
          if ((Number(cc.water) || 0) > 0) set[keyOf(p.x, p.y)] = true;
        }
        return set;
      }

      /** 施肥器水流归属：四邻接有水渠中取优先级最高（主流 > #1 > #2…） */
      function getVenturiFlowAttribution(state, vx, vy) {
        var best = null;
        forEachNeighbor(vx, vy, function (nx, ny) {
          var nc = cell(state, nx, ny);
          var tag = getChannelFlowTag(nc);
          if (!tag) return;
          if (!best || compareFlowPriority(tag, best) < 0) best = tag;
        });
        return best;
      }

      function getFlowsToMaintainForVenturi(state, attribution) {
        if (!attribution) return [];
        if (attribution.kind === "branch") return [attribution];
        var flows = [{ kind: "trunk" }];
        if (state.branches) {
          for (var i = 0; i < state.branches.length; i++) {
            flows.push({ kind: "branch", index: state.branches[i].index });
          }
        }
        return flows;
      }

      function getSeaweedRequestListForFlow(state, flow) {
        ensureSeaweedRequestsState(state);
        if (flow.kind === "trunk") return state.seaweedRequests.mainstream.slice();
        var bi = flow.index;
        return (state.seaweedRequests.byBranch[bi] || []).slice();
      }

      function seaweedBfsOnFlow(state, flowSet, startX, startY, goalKeys) {
        var sk = keyOf(startX, startY);
        if (!flowSet[sk]) return false;
        var goalMap = {};
        for (var g = 0; g < goalKeys.length; g++) goalMap[goalKeys[g]] = true;
        if (goalMap[sk]) return true;
        var q = [{ x: startX, y: startY }];
        var seen = {};
        seen[sk] = true;
        while (q.length) {
          var cur = q.shift();
          var curCell = cell(state, cur.x, cur.y);
          var hitGoal = false;
          forEachNeighbor(cur.x, cur.y, function (nx, ny) {
            if (hitGoal) return;
            var nk = keyOf(nx, ny);
            if (seen[nk] || !flowSet[nk]) return;
            var nc = cell(state, nx, ny);
            if ((Number(nc.water) || 0) <= 0) return;
            if (nc.height > curCell.height) return;
            if (goalMap[nk]) {
              hitGoal = true;
              return;
            }
            seen[nk] = true;
            q.push({ x: nx, y: ny });
          });
          if (hitGoal) return true;
        }
        return false;
      }

      function canReachCropOnFlow(state, flow, entryX, entryY, cropX, cropY) {
        var flowSet = buildFlowWetCellSet(state, flow);
        var goals = [];
        forEachNeighbor(cropX, cropY, function (nx, ny) {
          var nk = keyOf(nx, ny);
          if (flowSet[nk]) goals.push(nk);
        });
        if (!goals.length) return false;
        return seaweedBfsOnFlow(state, flowSet, entryX, entryY, goals);
      }

      function canReachFlowEndpointOnFlow(state, flow, entryX, entryY) {
        var end = getFlowEndpoint(state, flow);
        if (!end) return false;
        var flowSet = buildFlowWetCellSet(state, flow);
        return seaweedBfsOnFlow(state, flowSet, entryX, entryY, [keyOf(end.x, end.y)]);
      }

      function pickInjectionForFlow(state, vx, vy, flow, request) {
        for (var i = 0; i < DIRS.length; i++) {
          var ex = vx + DIRS[i].dx;
          var ey = vy + DIRS[i].dy;
          if (!inBounds(ex, ey)) continue;
          if (!channelBelongsToFlow(state, ex, ey, flow)) continue;
          var reachCrop = request
            ? canReachCropOnFlow(state, flow, ex, ey, request.x, request.y)
            : false;
          var reachEnd = canReachFlowEndpointOnFlow(state, flow, ex, ey);
          if (reachCrop || reachEnd) return { entryX: ex, entryY: ey, dirIndex: i };
        }
        return null;
      }

      function pickFirstReachableRequestForFlow(state, vx, vy, flow) {
        var list = getSeaweedRequestListForFlow(state, flow);
        for (var i = 0; i < list.length; i++) {
          var e = list[i];
          if (!isSeaweedRequestEntryStillValid(state, e)) continue;
          if (pickInjectionForFlow(state, vx, vy, flow, e)) return e;
        }
        return null;
      }

      function indexOnFlowPath(path, x, y) {
        for (var i = 0; i < path.length; i++) {
          if (path[i].x === x && path[i].y === y) return i;
        }
        return -1;
      }

      /** §15.4：注入口之后至水流终点之间的有水渠格（不含注入口） */
      function getPostEntryWetCells(state, flow, entryX, entryY) {
        var path = getFlowPath(state, flow);
        var entryIdx = indexOnFlowPath(path, entryX, entryY);
        if (entryIdx >= 0) {
          var out = [];
          for (var j = entryIdx + 1; j < path.length; j++) {
            var cc = cell(state, path[j].x, path[j].y);
            if ((Number(cc.water) || 0) > 0) out.push({ x: path[j].x, y: path[j].y });
          }
          return dedupeCoordCells(out);
        }
        var end = getFlowEndpoint(state, flow);
        if (!end) return [];
        var flowSet = buildFlowWetCellSet(state, flow);
        if (!flowSet[keyOf(entryX, entryY)]) return [];
        var distToEnd = {};
        for (var p = 0; p < path.length; p++) {
          distToEnd[keyOf(path[p].x, path[p].y)] = path.length - 1 - p;
        }
        var collected = [];
        var cx = entryX;
        var cy = entryY;
        var seen = {};
        seen[keyOf(cx, cy)] = true;
        while (!(cx === end.x && cy === end.y)) {
          var curCell = cell(state, cx, cy);
          var best = null;
          var bestD = Infinity;
          forEachNeighbor(cx, cy, function (nx, ny) {
            var nk = keyOf(nx, ny);
            if (seen[nk] || !flowSet[nk]) return;
            var nc = cell(state, nx, ny);
            if ((Number(nc.water) || 0) <= 0 || nc.height > curCell.height) return;
            var d = distToEnd[nk];
            if (d == null || d >= bestD) return;
            bestD = d;
            best = { x: nx, y: ny };
          });
          if (!best) break;
          collected.push(best);
          seen[keyOf(best.x, best.y)] = true;
          cx = best.x;
          cy = best.y;
        }
        return dedupeCoordCells(collected);
      }

      /** §15.4：均分路径坐标去重，避免同来源同格被重复计入分母导致浓度过低 */
      function dedupeCoordCells(cells) {
        var seen = {};
        var out = [];
        for (var i = 0; i < cells.length; i++) {
          var k = keyOf(cells[i].x, cells[i].y);
          if (seen[k]) continue;
          seen[k] = true;
          out.push(cells[i]);
        }
        return out;
      }

      function getSeaweedSetConcentration(c) {
        ensureVenturiCellFields(c);
        return Number(c.seaweedSetConcentration) || VENTURI_DEFAULT_SET_CONC;
      }

      function getVenturiSetConcentration(c) {
        return getSeaweedSetConcentration(c);
      }











      /**
       * §15.1～§15.4（A面）/ §15.6（B面）：海藻精渠内维持与浓度均分（每 tick 全量刷新，多来源相加）
       */
      function processSeaweedExtractMaintain(state) {
        clearAllChannelSeaweedConcentration(state);
        var perCellBySource = {};
        var logicMode = getVenturiSeaweedLogicMode(state);
        var sideB = logicMode === VENTURI_SEAWEED_LOGIC_B;

        for (var vy = 0; vy < SIZE; vy++) {
          for (var vx = 0; vx < SIZE; vx++) {
            var vc = cell(state, vx, vy);
            if (!isSeaweedEffectVenturi(vc)) continue;
            if (!hasAdjacentWetChannel(state, vx, vy)) continue;

            var attribution = getVenturiFlowAttribution(state, vx, vy);
            if (!attribution) continue;

            var flowsToRun = getFlowsToMaintainForVenturi(state, attribution);
            var setConc = getSeaweedSetConcentration(vc);
            var venturiSourcePrefix = keyOf(vx, vy);

            for (var fi = 0; fi < flowsToRun.length; fi++) {
              var flow = flowsToRun[fi];
              var injection;
              if (sideB) {
                injection = pickInjectionForFlow(state, vx, vy, flow, null);
              } else {
                var request = pickFirstReachableRequestForFlow(state, vx, vy, flow);
                if (!request) continue;
                injection = pickInjectionForFlow(state, vx, vy, flow, request);
              }
              if (!injection) continue;

              var distCells = dedupeCoordCells(getPostEntryWetCells(state, flow, injection.entryX, injection.entryY));
              if (!distCells.length) continue;

              var share = setConc / distCells.length;
              var sourceId = venturiSourcePrefix + ":" + flowKindKey(flow);

              for (var di = 0; di < distCells.length; di++) {
                var dk = keyOf(distCells[di].x, distCells[di].y);
                if (!perCellBySource[dk]) perCellBySource[dk] = {};
                perCellBySource[dk][sourceId] = round1(share);
              }
            }
          }
        }

        for (var ck in perCellBySource) {
          if (!Object.prototype.hasOwnProperty.call(perCellBySource, ck)) continue;
          var parts = perCellBySource[ck];
          var sum = 0;
          for (var sid in parts) {
            if (!Object.prototype.hasOwnProperty.call(parts, sid)) continue;
            sum += parts[sid];
          }
          var pt = decodeKey(ck);
          var ch = cell(state, pt.x, pt.y);
          if (isChannelCell(ch)) ch.seaweedConcentration = round1(sum);
        }
      }

      function heightOf(y) { return SIZE - 1 - y; }
      function byLowestHeightThenX(a, b) { return a.y !== b.y ? b.y - a.y : a.x - b.x; }
      function byHighestHeightThenX(a, b) { return a.y !== b.y ? a.y - b.y : a.x - b.x; }
      function comparePathCost(a, b) {
        if (a.steps !== b.steps) return a.steps - b.steps;
        if (a.sumX !== b.sumX) return a.sumX - b.sumX;
        if (a.turns !== b.turns) return a.turns - b.turns;
        return a.dirRank - b.dirRank;
      }





      function createDefaultState() {
        var map = [];
        for (var y = 0; y < SIZE; y++) {
          var row = [];
          for (var x = 0; x < SIZE; x++) {
            row.push({
              x: x,
              y: y,
              height: heightOf(y),
              soilId: DEFAULT_SOIL_ID,
              soilType: DEFAULT_SOIL_TYPE,
              tilled: false,
              cropStructure: null,
              crop: null,
              previousCropId: null,
              kind: (x === POOL_X && y === POOL_Y) ? "pool" : "land",
              capacity: 0,
              water: 0,
              seaweedConcentration: 0,
              algaeBloom: false,
              branchIndex: -1,
              isTrunk: false,
              sourceParent: null,
              venturiLiquid: null,
              venturiLevel: 1,
              seaweedSetConcentration: VENTURI_DEFAULT_SET_CONC
            });
          }
          map.push(row);
        }
        return {
          tick: 0,
          stamina: MAX_STAMINA,
          task: null,
          basePoolWater: BASE_POOL_WATER,
          poolCurrent: BASE_POOL_WATER,
          channels: {},
          trunkPath: [],
          branches: [],
          /** §4b.1a 海藻精请求登记 */
          seaweedRequests: { mainstream: [], byBranch: {} },
          /** §4b.1f 液态肥请求登记（埋地陶瓮八邻） */
          fertilizerRequests: [],
          pool_level: 1,
          last_pool_weather_factor: 1,
          pool_theft: { enabled: false, victim_branch_index: 1, gain_branch_index: 2 },
          pool_reservoir: { stored: 0, capacity_max: POOL_RESERVOIR_CAPACITY_MAX },
          last_branch_theft_moved: 0,
          last_theft_overflow_to_reservoir: 0,
          map: map
        };
      }

      function getPoolLevel(state) {
        return Math.max(1, Math.min(POOL_MAX_LEVEL, Math.floor(Number(state.pool_level) || 1)));
      }

      function getTheftTransferCap(poolLevel) {
        var lv = Math.max(1, Math.floor(Number(poolLevel) || 1));
        var cap = THEFT_TRANSFER_CAP_BY_POOL_LEVEL[lv];
        if (!(cap >= 0)) cap = THEFT_TRANSFER_CAP_BY_POOL_LEVEL[2] || 2;
        return cap;
      }

      function poolReservoirCapacityMax(state) {
        var res = state.pool_reservoir;
        if (res && res.capacity_max > 0) return res.capacity_max;
        return POOL_RESERVOIR_CAPACITY_MAX;
      }

      function addToPoolReservoir(state, amount) {
        if (!(amount > 0) || getPoolLevel(state) < 3) return 0;
        if (!state.pool_reservoir) {
          state.pool_reservoir = { stored: 0, capacity_max: POOL_RESERVOIR_CAPACITY_MAX };
        }
        var Cap = poolReservoirCapacityMax(state);
        var R = round1(state.pool_reservoir.stored || 0);
        var room = round1(Math.max(0, Cap - R));
        var add = round1(Math.min(amount, room));
        state.pool_reservoir.stored = round1(R + add);
        return add;
      }

      function rollPoolWeatherFactor() {
        var span = POOL_WEATHER_FACTOR_MAX - POOL_WEATHER_FACTOR_MIN;
        return POOL_WEATHER_FACTOR_MIN + Math.random() * span;
      }

      /** §8.5 步骤 0：本 tick 天气浮动（±30%）+ 蓄水池（L3+） */
      function applyPoolWeatherStep0(state) {
        var B = BASE_POOL_WATER;
        var factor = rollPoolWeatherFactor();
        var E = round1(B * factor);
        state.last_pool_weather_factor = round1(factor * 1000) / 1000;
        state.poolCurrent = E;
        if (getPoolLevel(state) < 3) {
          state.basePoolWater = E;
          return;
        }
        if (!state.pool_reservoir) {
          state.pool_reservoir = { stored: 0, capacity_max: POOL_RESERVOIR_CAPACITY_MAX };
        }
        var res = state.pool_reservoir;
        var Cap = poolReservoirCapacityMax(state);
        var R = round1(res.stored || 0);
        state.last_reservoir_day_surplus = 0;
        state.last_reservoir_day_draw = 0;
        if (E > B) {
          var surplus = round1(E - B);
          var room = round1(Math.max(0, Cap - R));
          var add = round1(Math.min(surplus, room));
          res.stored = round1(R + add);
          state.last_reservoir_day_surplus = add;
          state.basePoolWater = B;
        } else if (E < B) {
          var deficit = round1(B - E);
          var draw = round1(Math.min(deficit, res.stored || 0));
          res.stored = round1(Math.max(0, (res.stored || 0) - draw));
          state.last_reservoir_day_draw = draw;
          state.basePoolWater = round1(E + draw);
        } else {
          state.basePoolWater = B;
        }
        state.pool_reservoir = res;
      }

      function forEachBranchChannelCell(state, branchIndex, fn) {
        if (!state.branches || !(branchIndex > 0)) return;
        var bi = Math.floor(branchIndex);
        var i;
        for (i = 0; i < state.branches.length; i++) {
          var b = state.branches[i];
          if (!b || b.index !== bi) continue;
          var path = b.path || [];
          var j;
          for (j = 0; j < path.length; j++) {
            var pt = path[j];
            var c = cell(state, pt.x, pt.y);
            if (!isChannelCell(c) || c.isTrunk) continue;
            if (c.branchIndex !== bi) continue;
            fn(c, pt.x, pt.y);
          }
        }
      }

      /** §8.4～§8.6 支流窃流 */
      function applyBranchTheft(state) {
        state.last_branch_theft_moved = 0;
        state.last_theft_overflow_to_reservoir = 0;
        var cfg = state.pool_theft;
        if (!cfg || cfg.enabled === false) return { moved: 0, reason: "disabled" };
        var poolLevel = getPoolLevel(state);
        if (getTheftTransferCap(poolLevel) <= 0) return { moved: 0, reason: "pool_level" };
        var vicIdx = Math.floor(Number(cfg.victim_branch_index) || 0);
        var gainIdx = Math.floor(Number(cfg.gain_branch_index) || 0);
        if (!(vicIdx > 0 && gainIdx > 0 && vicIdx < gainIdx)) {
          return { moved: 0, reason: "invalid_branch_pair" };
        }
        var cap = getTheftTransferCap(poolLevel);
        var victimCells = [];
        var wVictim = 0;
        forEachBranchChannelCell(state, vicIdx, function (c) {
          var w = round1(c.water || 0);
          if (w <= 0) return;
          victimCells.push(c);
          wVictim += w;
        });
        wVictim = round1(wVictim);
        if (!(wVictim > 0)) return { moved: 0, reason: "no_victim_water" };
        var transfer = round1(Math.min(cap, wVictim));
        if (!(transfer > 0)) return { moved: 0, reason: "zero_transfer" };
        var factor = (wVictim - transfer) / wVictim;
        var vi;
        for (vi = 0; vi < victimCells.length; vi++) {
          victimCells[vi].water = round1((victimCells[vi].water || 0) * factor);
        }
        var gainCells = [];
        var gainHeadrooms = [];
        var totalHeadroom = 0;
        forEachBranchChannelCell(state, gainIdx, function (c) {
          var capCell = Number(c.capacity) || DEFAULT_CHANNEL_CAPACITY;
          var hr = round1(Math.max(0, capCell - (c.water || 0)));
          if (!(hr > 0)) return;
          gainCells.push(c);
          gainHeadrooms.push(hr);
          totalHeadroom += hr;
        });
        totalHeadroom = round1(totalHeadroom);
        if (!(totalHeadroom > 0)) {
          if (poolLevel >= 4) {
            var stored0 = addToPoolReservoir(state, transfer);
            state.last_theft_overflow_to_reservoir = stored0;
          }
          return { moved: 0, reason: "no_gain_headroom", overflow: state.last_theft_overflow_to_reservoir };
        }
        var moved = 0;
        var gi;
        for (gi = 0; gi < gainCells.length; gi++) {
          var gc = gainCells[gi];
          var capG = Number(gc.capacity) || DEFAULT_CHANNEL_CAPACITY;
          var add = round1(transfer * (gainHeadrooms[gi] / totalHeadroom));
          var before = round1(gc.water || 0);
          gc.water = round1(Math.min(capG, before + add));
          moved += round1(gc.water - before);
        }
        moved = round1(moved);
        state.last_branch_theft_moved = moved;
        if (poolLevel >= 4) {
          var overflow = round1(Math.max(0, transfer - moved));
          if (overflow > 0) {
            state.last_theft_overflow_to_reservoir = addToPoolReservoir(state, overflow);
          }
        }
        return { moved: moved, transfer: transfer, w_victim_before: wVictim };
      }

      function nextPoolUpgradeLevel(state) {
        var lv = getPoolLevel(state);
        if (lv >= POOL_MAX_LEVEL) return null;
        return lv + 1;
      }

      function applyPoolLevelUpgrade(state) {
        if (!state) return { ok: false, reason: 'no_state' };
        var nextLv = nextPoolUpgradeLevel(state);
        if (!nextLv) return { ok: false, reason: 'pool_max_level' };
        state.pool_level = nextLv;
        if (nextLv >= 3 && !state.pool_reservoir) {
          state.pool_reservoir = { stored: 0, capacity_max: POOL_RESERVOIR_CAPACITY_MAX };
        }
        return { ok: true, level: nextLv };
      }

      function poolUpgradeCostMoney(targetLevel) {
        return POOL_UPGRADE_COST_BY_LEVEL[targetLevel] != null ? POOL_UPGRADE_COST_BY_LEVEL[targetLevel] : null;
      }

      function tryUpgradePool() {
        var nextLv = nextPoolUpgradeLevel(state);
        if (!nextLv) {
          state.shopMessage = "水池已满级（" + POOL_MAX_LEVEL + "）。";
          return false;
        }
        var cost = poolUpgradeCostMoney(nextLv);
        if (cost == null) {
          state.shopMessage = "未配置水池 " + nextLv + " 级升级费用。";
          return false;
        }
        if (state.money < cost) {
          state.shopMessage = "金钱不足（升级至 " + nextLv + " 级需 " + cost + " 金）。";
          return false;
        }
        state.money -= cost;
        state.pool_level = nextLv;
        if (nextLv >= 3 && !state.pool_reservoir) {
          state.pool_reservoir = { stored: 0, capacity_max: POOL_RESERVOIR_CAPACITY_MAX };
        }
        state.shopMessage = "水池升至 " + nextLv + " 级：" + (POOL_LEVEL_LABELS[nextLv] || "") + "。";
        return true;
      }

      function syncPoolTheftFromUi() {
        if (!state.pool_theft) {
          state.pool_theft = { enabled: false, victim_branch_index: 1, gain_branch_index: 2 };
        }
        var cfg = state.pool_theft;
        cfg.enabled = !!(el.poolTheftEnabled && el.poolTheftEnabled.checked);
        if (el.poolTheftVictim) cfg.victim_branch_index = Math.floor(Number(el.poolTheftVictim.value) || 1);
        if (el.poolTheftGain) cfg.gain_branch_index = Math.floor(Number(el.poolTheftGain.value) || 2);
        if (cfg.victim_branch_index >= cfg.gain_branch_index) {
          cfg.gain_branch_index = cfg.victim_branch_index + 1;
          if (el.poolTheftGain) el.poolTheftGain.value = String(cfg.gain_branch_index);
        }
      }

      function renderPoolUpgradePanel() {
        if (!el.poolUpgradeSummary) return;
        var lv = getPoolLevel(state);
        var nextLv = nextPoolUpgradeLevel(state);
        var cost = nextLv ? poolUpgradeCostMoney(nextLv) : null;
        var res = state.pool_reservoir || { stored: 0 };
        var wf = round1(Number(state.last_pool_weather_factor) || 1);
        var wfPct = round1((wf - 1) * 100);
        var wfSign = wfPct >= 0 ? "+" : "";
        var lines =
          "<div class='muted'>等级</div><div>" + lv + " / " + POOL_MAX_LEVEL + " · " + (POOL_LEVEL_LABELS[lv] || "") + "</div>" +
          "<div class='muted'>上 tick 天气</div><div>×" + wf.toFixed(2) + "（" + wfSign + wfPct + "%）</div>" +
          "<div class='muted'>本 tick 池水 / 灌溉预算</div><div>" + round1(state.poolCurrent || 0).toFixed(1) +
          " / " + round1(state.basePoolWater || BASE_POOL_WATER).toFixed(1) + "</div>";
        if (lv >= 3) {
          lines +=
            "<div class='muted'>蓄水池</div><div>" + round1(res.stored || 0).toFixed(1) + " / " + poolReservoirCapacityMax(state) + "</div>";
        }
        if (lv >= 2) {
          lines +=
            "<div class='muted'>窃流 cap</div><div>" + getTheftTransferCap(lv) + "</div>" +
            "<div class='muted'>上 tick 窃流挪动</div><div>" + round1(state.last_branch_theft_moved || 0).toFixed(1) + "</div>";
        }
        if (lv >= 4) {
          lines += "<div class='muted'>上 tick 溢流回蓄</div><div>" + round1(state.last_theft_overflow_to_reservoir || 0).toFixed(1) + "</div>";
        }
        el.poolUpgradeSummary.innerHTML = lines;
        if (el.poolUpgradeBtn) {
          if (!nextLv) {
            el.poolUpgradeBtn.disabled = true;
            el.poolUpgradeBtn.textContent = "已满级";
          } else {
            el.poolUpgradeBtn.disabled = state.money < cost;
            el.poolUpgradeBtn.textContent = "升级至 " + nextLv + " 级（" + cost + " 金）";
          }
        }
        if (el.poolTheftPanel) {
          var theftOn = lv >= 2;
          el.poolTheftPanel.classList.toggle("disabled", !theftOn);
          if (el.poolTheftEnabled) el.poolTheftEnabled.disabled = !theftOn;
          if (el.poolTheftVictim) el.poolTheftVictim.disabled = !theftOn;
          if (el.poolTheftGain) el.poolTheftGain.disabled = !theftOn;
        }
        if (el.poolTheftEnabled && state.pool_theft) {
          el.poolTheftEnabled.checked = !!state.pool_theft.enabled;
          if (el.poolTheftVictim) el.poolTheftVictim.value = String(state.pool_theft.victim_branch_index || 1);
          if (el.poolTheftGain) el.poolTheftGain.value = String(state.pool_theft.gain_branch_index || 2);
        }
      }

      function isSuperFusionCell(c) { return c.kind === "super_fusion"; }

      function countSuperFusionOnMap(st) {
        var n = 0;
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            if (isSuperFusionCell(cell(st, x, y))) n++;
          }
        }
        return n;
      }

      function anySuperFusionOnMap(st) {
        return countSuperFusionOnMap(st) > 0;
      }

      /** 文丘里有效逻辑：默认 B；场上有超融合 → A（§2.2g） */
      function getVenturiSeaweedLogicMode(st) {
        return anySuperFusionOnMap(st) ? VENTURI_SEAWEED_LOGIC_A : VENTURI_SEAWEED_LOGIC_B;
      }

      function venturiSeaweedLogicLabel(mode) {
        return mode === VENTURI_SEAWEED_LOGIC_B ? "B面" : "A面";
      }

      function clonePoint(p) { return { x: p.x, y: p.y }; }
      function cell(state, x, y) { return state.map[y][x]; }
      function isChannelCell(c) { return c.kind === "channel"; }
      function isPoolCell(c) { return c.kind === "pool"; }
      function isVenturiCell(c) { return c.kind === "venturi_fertilizer"; }
      function isBuriedPotJarCell(c) { return c.kind === "buried_pot_jar"; }
      function isFacilityCell(c) { return isVenturiCell(c) || isBuriedPotJarCell(c); }
      function cropStructureDef(id) {
        return id ? CROP_STRUCTURE_DEFS[id] : null;
      }
      function cropStructureDisplayName(id) {
        var d = cropStructureDef(id);
        return d ? d.name : (id || "-");
      }
      function hasCropStructure(c) {
        return !!(c && c.cropStructure && cropStructureDef(c.cropStructure));
      }

      function cropRequiredStructureId(def) {
        if (!def) return null;
        return def.required_crop_structure_id || def.requiredCropStructureId || null;
      }

      function plotHasRequiredCropStructure(c, def) {
        var req = cropRequiredStructureId(def);
        if (!req) return true;
        return hasCropStructure(c) && c.cropStructure === req;
      }

      function cropStructureRequirementHint(def) {
        var req = cropRequiredStructureId(def);
        if (!req) return "";
        return "需建造物「" + cropStructureDisplayName(req) + "」";
      }
      function canBuildCropStructure(c) {
        return c.kind === "land" && c.tilled && !c.crop && !hasCropStructure(c);
      }
      function canRemoveCropStructure(c) {
        return c.kind === "land" && c.tilled && hasCropStructure(c) && !c.crop;
      }
      function isAgricultureInjectableItemId(itemId) {
        return !!(itemId && AGRICULTURE_INJECTABLE_LIQUIDS[itemId]);
      }
      function isVenturiInjectableItemId(itemId) { return isAgricultureInjectableItemId(itemId); }
      function injectableMeta(itemId) {
        return itemId ? AGRICULTURE_INJECTABLE_LIQUIDS[itemId] : null;
      }
      function isInjectableForFacility(itemId, facilityKind) {
        var meta = injectableMeta(itemId);
        return !!(meta && meta.injectFacility === facilityKind);
      }
      function venturiInjectMeta(itemId) { return injectableMeta(itemId); }
      function injectableIsTimedEffectItem(itemId) {
        var meta = injectableMeta(itemId);
        return !!(meta && meta.injectFacility === "venturi_fertilizer" && meta.effectDurationTicks > 0);
      }
      function venturiIsTimedEffectItem(itemId) { return injectableIsTimedEffectItem(itemId); }
      function facilityLiquidIsActive(vl) {
        if (!vl) return false;
        if (vl.effectTicksRemaining != null) return vl.effectTicksRemaining > 0;
        return !!(vl.units && vl.units > 0);
      }
      function venturiLiquidIsActive(vl) { return facilityLiquidIsActive(vl); }
      function getInjectableFertilizerPerTick(itemId) {
        if (!isInjectableForFacility(itemId, "buried_pot_jar")) return 0;
        var meta = injectableMeta(itemId);
        var v = meta && meta.fertilizerPerTick;
        return v != null && v > 0 ? Number(v) : 0;
      }
      function listInjectableItemIdsForFacility(facilityKind) {
        var ids = [];
        for (var id in AGRICULTURE_INJECTABLE_LIQUIDS) {
          if (Object.prototype.hasOwnProperty.call(AGRICULTURE_INJECTABLE_LIQUIDS, id)
            && isInjectableForFacility(id, facilityKind)) ids.push(id);
        }
        return ids;
      }
      function formatFacilityLiquidText(vl) {
        if (!vl || !facilityLiquidIsActive(vl)) return "空罐";
        var meta = injectableMeta(vl.itemId);
        var nm = vl.name || (meta && meta.name) || vl.itemId;
        if (vl.effectTicksRemaining != null) {
          var max = vl.effectDurationTicks || (meta && meta.effectDurationTicks) || 0;
          return nm + " 生效中 " + vl.effectTicksRemaining + " / " + max + " tick · 渠内浓度→微量元素";
        }
        var fert = getInjectableFertilizerPerTick(vl.itemId);
        return nm + " ×" + vl.units + " 单位 · 八邻→施肥值+" + fert + "/tick";
      }
      function formatVenturiLiquidText(vl) { return formatFacilityLiquidText(vl); }
      function getFacilityLiquidOnCell(c) {
        if (isVenturiCell(c)) return c.venturiLiquid;
        if (isBuriedPotJarCell(c)) return c.jarLiquid;
        return null;
      }
      function setFacilityLiquidOnCell(c, vl) {
        if (isVenturiCell(c)) c.venturiLiquid = vl;
        else if (isBuriedPotJarCell(c)) c.jarLiquid = vl;
      }
      function processFacilityTimedEffects(state) {
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var c = cell(state, x, y);
            var liq = getFacilityLiquidOnCell(c);
            if (!liq || liq.effectTicksRemaining == null) continue;
            liq.effectTicksRemaining -= 1;
            if (liq.effectTicksRemaining <= 0) setFacilityLiquidOnCell(c, null);
          }
        }
      }
      function processVenturiTimedEffects(state) { processFacilityTimedEffects(state); }

      function forEachNeighbor8(x, y, fn) {
        for (var i = 0; i < DIRS_8.length; i++) {
          var nx = x + DIRS_8[i].dx;
          var ny = y + DIRS_8[i].dy;
          if (inBounds(nx, ny)) fn(nx, ny, i);
        }
      }

      function forEachNeighbor(x, y, fn) {
        for (var i = 0; i < DIRS.length; i++) {
          var nx = x + DIRS[i].dx;
          var ny = y + DIRS[i].dy;
          if (inBounds(nx, ny)) fn(nx, ny, i);
        }
      }

      function resetHydrationFields(state) {
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var c = cell(state, x, y);
            c.water = 0;
            c.seaweedConcentration = 0;
            c.algaeBloom = false;
            c.isTrunk = false;
            c.branchIndex = -1;
            c.sourceParent = null;
          }
        }
      }

      function buildChannelSet(state) {
        var set = {};
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var c = cell(state, x, y);
            if (c.kind === "channel") set[keyOf(x, y)] = true;
          }
        }
        return set;
      }

      function computeReachableChannels(state, channels) {
        var reachable = {};
        var parent = {};
        var q = [{ x: POOL_X, y: POOL_Y }];
        var seen = { "0,0": true };
        while (q.length) {
          var cur = q.shift();
          var curCell = cell(state, cur.x, cur.y);
          forEachNeighbor(cur.x, cur.y, function (nx, ny) {
            var nk = keyOf(nx, ny);
            if (seen[nk]) return;
            if (!channels[nk]) return;
            var nCell = cell(state, nx, ny);
            if (nCell.height > curCell.height) return;
            seen[nk] = true;
            reachable[nk] = true;
            parent[nk] = keyOf(cur.x, cur.y);
            q.push({ x: nx, y: ny });
          });
        }
        return { reachable: reachable, bfsParent: parent };
      }

      function decodeKey(k) {
        var s = k.split(",");
        return { x: Number(s[0]), y: Number(s[1]) };
      }

      // 寻路用稳定的多键排序成本，保证每次重算输出一致。
      function findPreferredPath(state, channels, allowedTargets, targetKey) {
        var best = {};
        var prev = {};
        var startK = keyOf(POOL_X, POOL_Y);
        best[startK] = { steps: 0, sumX: 0, turns: 0, dirRank: 0, lastDir: -1 };
        var open = [startK];
        while (open.length) {
          open.sort(function (ka, kb) { return comparePathCost(best[ka], best[kb]); });
          var curK = open.shift();
          var cur = decodeKey(curK);
          var curCell = cell(state, cur.x, cur.y);
          for (var i = 0; i < DIRS.length; i++) {
            var nx = cur.x + DIRS[i].dx;
            var ny = cur.y + DIRS[i].dy;
            if (!inBounds(nx, ny)) continue;
            var nk = keyOf(nx, ny);
            if (nk !== targetKey && !channels[nk]) continue;
            if (nk !== targetKey && !allowedTargets[nk]) continue;
            var nCell = cell(state, nx, ny);
            if (nCell.kind !== "pool" && nCell.kind !== "channel") continue;
            if (nCell.height > curCell.height) continue;
            var curCost = best[curK];
            var nextCost = {
              steps: curCost.steps + 1,
              sumX: curCost.sumX + nx,
              turns: curCost.turns + ((curCost.lastDir === -1 || curCost.lastDir === i) ? 0 : 1),
              dirRank: curCost.dirRank * 10 + (i + 1),
              lastDir: i
            };
            if (!best[nk] || comparePathCost(nextCost, best[nk]) < 0) {
              best[nk] = nextCost;
              prev[nk] = curK;
              if (open.indexOf(nk) === -1) open.push(nk);
            }
          }
        }
        if (!best[targetKey]) return [];
        var path = [];
        var k = targetKey;
        while (k && k !== startK) {
          path.push(decodeKey(k));
          k = prev[k];
        }
        path.reverse();
        return path;
      }

      function computeTrunkAndBranches(state, reachable) {
        var reachableList = Object.keys(reachable).map(decodeKey);
        reachableList.sort(byLowestHeightThenX);
        var trunkTarget = reachableList[0] || null;
        var trunkPath = [];
        var trunkSet = {};
        if (trunkTarget) {
          trunkPath = findPreferredPath(state, state.channels, reachable, keyOf(trunkTarget.x, trunkTarget.y));
          for (var i = 0; i < trunkPath.length; i++) trunkSet[keyOf(trunkPath[i].x, trunkPath[i].y)] = true;
        }

        var candidates = [];
        for (var r in reachable) {
          if (!trunkSet[r]) candidates.push(decodeKey(r));
        }
        // 支流从最高高度层开始轮询；同层靠近 x=0 的终点优先。
        candidates.sort(byHighestHeightThenX);

        var branches = [];
        var usedTargets = {};
        for (var c = 0; c < candidates.length; c++) {
          var target = candidates[c];
          var tk = keyOf(target.x, target.y);
          if (usedTargets[tk]) continue;
          var path = findPreferredPath(state, state.channels, reachable, tk);
          if (!path.length) continue;
          branches.push({
            index: branches.length + 1,
            target: clonePoint(target),
            path: path
          });
          usedTargets[tk] = true;
        }
        return { trunkPath: trunkPath, trunkSet: trunkSet, branches: branches };
      }

      function allocateTrunk(state, trunkPath) {
        var pool = state.basePoolWater;
        if (!trunkPath.length) {
          state.poolCurrent = round1(pool);
          return { used: 0, waterByKey: {}, suppliedSet: {}, poolCurrentAfterTrunk: round1(pool), branchBudget: round1(pool) };
        }
        var caps = 0;
        for (var i = 0; i < trunkPath.length; i++) caps += cell(state, trunkPath[i].x, trunkPath[i].y).capacity;
        var waterByKey = {};
        var suppliedSet = {};
        var used = 0;

        if (pool < caps) {
          var unit = round1(pool / (trunkPath.length + 1));
          state.poolCurrent = unit;
          var prev = unit;
          for (var j = 0; j < trunkPath.length; j++) {
            var tc = cell(state, trunkPath[j].x, trunkPath[j].y);
            var w = round1(Math.min(unit, tc.capacity, prev));
            tc.water = w;
            tc.isTrunk = true;
            tc.sourceParent = (j === 0) ? keyOf(POOL_X, POOL_Y) : keyOf(trunkPath[j - 1].x, trunkPath[j - 1].y);
            waterByKey[keyOf(tc.x, tc.y)] = w;
            suppliedSet[keyOf(tc.x, tc.y)] = true;
            used += w;
            prev = w;
          }
          return { used: round1(used), waterByKey: waterByKey, suppliedSet: suppliedSet, poolCurrentAfterTrunk: unit, branchBudget: 0 };
        }

        var remain = pool;
        var source = pool;
        for (var k = 0; k < trunkPath.length; k++) {
          var pc = cell(state, trunkPath[k].x, trunkPath[k].y);
          var val = round1(Math.min(pc.capacity, source, remain));
          pc.water = val;
          pc.isTrunk = true;
          pc.sourceParent = (k === 0) ? keyOf(POOL_X, POOL_Y) : keyOf(trunkPath[k - 1].x, trunkPath[k - 1].y);
          waterByKey[keyOf(pc.x, pc.y)] = val;
          suppliedSet[keyOf(pc.x, pc.y)] = true;
          used += val;
          remain = round1(Math.max(0, remain - val));
          source = val;
        }
        state.poolCurrent = round1(Math.max(0, pool - used));
        return { used: round1(used), waterByKey: waterByKey, suppliedSet: suppliedSet, poolCurrentAfterTrunk: state.poolCurrent, branchBudget: state.poolCurrent };
      }

      function allocateOneBranch(state, branch, poolRemain, suppliedSet, waterByKey) {
        if (poolRemain <= 0) return { used: 0, remain: 0 };
        var freshNodes = [];
        for (var i = 0; i < branch.path.length; i++) {
          var pk = keyOf(branch.path[i].x, branch.path[i].y);
          if (!suppliedSet[pk]) freshNodes.push(branch.path[i]);
        }
        if (!freshNodes.length) return { used: 0, remain: poolRemain };

        var sumCaps = 0;
        for (var j = 0; j < freshNodes.length; j++) sumCaps += cell(state, freshNodes[j].x, freshNodes[j].y).capacity;
        var avgMode = poolRemain < sumCaps;
        var unit = avgMode ? round1(poolRemain / freshNodes.length) : null;
        var used = 0;

        for (var p = 0; p < branch.path.length; p++) {
          var cur = branch.path[p];
          var ck = keyOf(cur.x, cur.y);
          var cc = cell(state, cur.x, cur.y);
          if (suppliedSet[ck]) continue;

          var parentK = (p === 0) ? keyOf(POOL_X, POOL_Y) : keyOf(branch.path[p - 1].x, branch.path[p - 1].y);
          cc.sourceParent = parentK;
          var sourceWater = (parentK === keyOf(POOL_X, POOL_Y))
            ? state.poolCurrent
            : (waterByKey[parentK] != null ? waterByKey[parentK] : 0);
          var desired = avgMode ? unit : cc.capacity;
          var w = round1(Math.min(desired, cc.capacity, sourceWater, poolRemain));
          cc.water = w;
          if (!cc.isTrunk) cc.branchIndex = branch.index;
          waterByKey[ck] = w;
          suppliedSet[ck] = true;
          used += w;
          poolRemain = round1(Math.max(0, poolRemain - w));
          if (poolRemain <= 0) break;
        }
        return { used: round1(used), remain: poolRemain };
      }

      function allocateWater(state, trunkPath, branches) {
        var trunk = allocateTrunk(state, trunkPath);
        var poolRemain = trunk.branchBudget;
        var suppliedSet = trunk.suppliedSet;
        var waterByKey = trunk.waterByKey;

        for (var i = 0; i < branches.length; i++) {
          var result = allocateOneBranch(state, branches[i], poolRemain, suppliedSet, waterByKey);
          poolRemain = result.remain;
          if (poolRemain <= 0) break;
        }
        state.poolCurrent = round1(poolRemain);
        return { poolRemain: poolRemain, waterByKey: waterByKey };
      }

      function shortestPathLenToPool(state, start) {
        var startK = keyOf(start.x, start.y);
        var q = [{ x: start.x, y: start.y, d: 0 }];
        var seen = {};
        seen[startK] = true;
        while (q.length) {
          var cur = q.shift();
          if (cur.x === POOL_X && cur.y === POOL_Y) return cur.d;
          var curCell = cell(state, cur.x, cur.y);
          forEachNeighbor(cur.x, cur.y, function (nx, ny) {
            var nk = keyOf(nx, ny);
            if (seen[nk]) return;
            var nc = cell(state, nx, ny);
            if (!isPoolCell(nc) && !isChannelCell(nc)) return;
            if (curCell.height > nc.height && !(nx === POOL_X && ny === POOL_Y)) {
              // 逆向走回水池时，允许逆向遍历已成图渠道。
            }
            seen[nk] = true;
            q.push({ x: nx, y: ny, d: cur.d + 1 });
          });
        }
        return 9999;
      }

      function getIrrigationSourceForPlot(state, x, y) {
        var candidates = [];
        forEachNeighbor(x, y, function (nx, ny) {
          var c = cell(state, nx, ny);
          var water = 0;
          if (isPoolCell(c)) water = state.poolCurrent;
          else if (isChannelCell(c)) water = c.water;
          if (water <= 0) return;
          candidates.push({
            x: nx,
            y: ny,
            water: water,
            height: c.height,
            dist: (isPoolCell(c) ? 0 : shortestPathLenToPool(state, { x: nx, y: ny })),
            kind: c.kind,
            isTrunk: !!c.isTrunk,
            branchIndex: c.branchIndex
          });
        });
        if (!candidates.length) return null;
        candidates.sort(function (a, b) {
          if (a.dist !== b.dist) return a.dist - b.dist;
          if (a.x !== b.x) return a.x - b.x;
          if (a.height !== b.height) return b.height - a.height;
          return 0;
        });
        return candidates[0];
      }

      function recomputeIrrigationNetwork(state) {
        resetHydrationFields(state);
        state.channels = buildChannelSet(state);
        var reach = computeReachableChannels(state, state.channels);
        var network = computeTrunkAndBranches(state, reach.reachable);
        state.trunkPath = network.trunkPath;
        state.branches = network.branches;
        allocateWater(state, network.trunkPath, network.branches);
        clearAllChannelSeaweedConcentration(state);
        syncCropSeaweedExtractRequests(state);
        syncCropFertilizerRequests(state);
        return state;
      }

      /** §15.0 农业地图每 tick 固定顺序（①～5b～⑦） */
      function resetCropJarFertFlags(state) {
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var c = cell(state, x, y);
            if (c.crop) c.crop.jarFertThisTick = false;
          }
        }
      }

      function runAgricultureMapTickCore(state) {
        agriTickStep1FreshWater(state);
        resetCropJarFertFlags(state);
        syncCropSeaweedExtractRequests(state);
        syncCropFertilizerRequests(state);
        agriTickStep2SeaweedMaintain(state);
        agriTickStep3AlgaeBloomJudgment(state);
        agriTickStep4CropAbsorbWater(state);
        agriTickStep5CropAbsorbTraceElements(state);
        agriTickStep5aTraceSensitivity(state);
        agriTickStep5bBuriedJarFertilizer(state);
        agriTickStep5cSoilFusionExtras(state);
        agriTickStep6AlgaeBloomHealthLoss(state);
        agriTickStep7CropGrowthAndMisc(state);
      }

      /** �?清水分配（沿用已缓存主干/支流结构） */
      function agriTickStep1FreshWater(state) {
        applyPoolWeatherStep0(state);
        if (state.trunkPath && state.branches) {
          allocateWater(state, state.trunkPath, state.branches);
          applyBranchTheft(state);
        }
      }

      /** �?海藻精维持 / 注入（§15.1～§15.4） */
      function agriTickStep2SeaweedMaintain(state) {
        processSeaweedExtractMaintain(state);
      }

      /** �?水藻爆发判定（不跨 tick 锁存，每 tick 按 W/C 重算） */
      function agriTickStep3AlgaeBloomJudgment(state) {
        processAlgaeBloomFlags(state);
      }

      function processAlgaeBloomFlags(state) {
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var c = cell(state, x, y);
            if (!isChannelCell(c)) continue;
            c.algaeBloom = isAlgaeBloom(c.water, c.seaweedConcentration);
          }
        }
      }

      /** §12 唯一滋养来源渠是否处于水藻爆发（水池不适用 §4.3） */
      function isPlotIrrigationSourceAlgaeBloom(state, plotX, plotY) {
        var source = getIrrigationSourceForPlot(state, plotX, plotY);
        if (!source || source.kind !== "channel") return false;
        var ch = cell(state, source.x, source.y);
        return !!(ch.algaeBloom && ch.water > 0);
      }

      function applyGrowingCropHealthDeath(c) {
        if (!c.crop || c.crop.settled) return false;
        var hm = c.crop.healthMax != null ? Number(c.crop.healthMax) : DEFAULT_CROP_HEALTH_MAX;
        if (!(hm > 0)) hm = DEFAULT_CROP_HEALTH_MAX;
        var hc = c.crop.healthCurrent != null ? Number(c.crop.healthCurrent) : hm;
        c.crop.healthMax = hm;
        c.crop.healthCurrent = Math.min(hm, Math.max(0, hc));
        if (c.crop.healthCurrent <= 0) {
          c.previousCropId = c.crop.cropId;
          c.crop = null;
          return true;
        }
        return false;
      }

      /** �?作物吸收水分（§4.2�?*/
      function agriTickStep4CropAbsorbWater(state) {
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var c = cell(state, x, y);
            if (!c.crop || c.crop.settled) continue;
            if (applyGrowingCropHealthDeath(c)) syncPlotSeaweedRequests(state, x, y);
            if (!c.crop) continue;
            var source = getIrrigationSourceForPlot(state, x, y);
            if (source) {
              var plotDef = CROP_DEFS[c.crop.cropId];
              var dw = resolveAbsorptionAmount(c, "water", source.water, plotDef, state);
              if (dw > 0) {
                c.crop.waterAbsorbed = round1(c.crop.waterAbsorbed + dw);
                applySoilWaterAbsorbSideEffects(c, c.crop, dw, state);
              }
            }
          }
        }
      }

      /** �?tick 可从 §12 滋养来源读取的海藻精浓度（水池无浓度） */
      function getSeaweedConcentrationFromIrrigationSource(state, source) {
        if (!source || source.kind !== "channel") return 0;
        var ch = cell(state, source.x, source.y);
        return round1(ch.seaweedConcentration || 0);
      }

      /** �?作物吸收微量元素（�?b.1c / §12.1：与吸水同源、同 tick，不扣渠浓度） */
      /** §4b.1d：埋地陶瓮液态肥 → 仅累加 fertilizerAbsorbed；每瓮独立扫描八邻，同格多瓮效果相加 */
      function agriTickStep5bBuriedJarFertilizer(state) {
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var jar = cell(state, x, y);
            if (!isBuriedPotJarCell(jar)) continue;
            var liq = jar.jarLiquid;
            if (!facilityLiquidIsActive(liq)) continue;
            var perTick = getInjectableFertilizerPerTick(liq.itemId);
            if (!(perTick > 0)) continue;
            var appliedAny = false;
            forEachNeighbor8(x, y, function (nx, ny) {
              var plot = cell(state, nx, ny);
              if (plot.kind !== "land" || !plot.crop || plot.crop.settled) return;
              var plotDef = CROP_DEFS[plot.crop.cropId];
              if (!cropDefRequestsLiquidFertilizer(plotDef)) return;
              if (applyGrowingCropHealthDeath(plot)) {
                syncPlotSeaweedRequests(state, nx, ny);
                syncPlotFertilizerRequests(state, nx, ny);
              }
              if (!plot.crop || plot.crop.settled) return;
              var fertAmt = resolveAbsorptionAmount(plot, "fertilizer", perTick, plotDef, state);
              if (!(fertAmt > 0)) return;
              plot.crop.fertilizerAbsorbed = round1((plot.crop.fertilizerAbsorbed || 0) + fertAmt);
              plot.crop.jarFertThisTick = true;
              appliedAny = true;
            });
            if (liq.effectTicksRemaining != null) continue;
            if (liq.units && appliedAny) {
              liq.units -= 1;
              if (liq.units <= 0) jar.jarLiquid = null;
            }
          }
        }
      }

      /** §4b.1c：渠内海藻精浓度 → 仅累加 traceAbsorbed（微量元素），不写 fertilizerAbsorbed */
      function agriTickStep5CropAbsorbTraceElements(state) {
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var c = cell(state, x, y);
            if (!c.crop || c.crop.settled) continue;
            if (applyGrowingCropHealthDeath(c)) syncPlotSeaweedRequests(state, x, y);
            if (!c.crop) continue;
            var source = getIrrigationSourceForPlot(state, x, y);
            if (!source) continue;
            var absorbed = getSeaweedConcentrationFromIrrigationSource(state, source);
            if (!(absorbed > 0)) continue;
            var plotDef = CROP_DEFS[c.crop.cropId];
            var dTrace = resolveAbsorptionAmount(c, "trace", absorbed, plotDef, state);
            if (!(dTrace > 0)) continue;
            c.crop.traceAbsorbed = round1((c.crop.traceAbsorbed || 0) + dTrace);
            applyTraceSensitivityToPlot(state, x, y);
          }
        }
      }

      /** �?水藻爆发扣健康（§4.3：生长中 + §12 来源渠爆发） */
      function agriTickStep6AlgaeBloomHealthLoss(state) {
        processAlgaeBloomHealthDamage(state);
      }

      function processAlgaeBloomHealthDamage(state) {
        var loss = resolveAlgaeBloomHealthLoss(ALGAE_BLOOM_HEALTH_LOSS_PER_TICK);
        if (!(loss > 0)) return;
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var c = cell(state, x, y);
            if (!c.crop || c.crop.settled) continue;
            if (!isPlotIrrigationSourceAlgaeBloom(state, x, y)) continue;
            var hm = c.crop.healthMax != null ? Number(c.crop.healthMax) : DEFAULT_CROP_HEALTH_MAX;
            if (!(hm > 0)) hm = DEFAULT_CROP_HEALTH_MAX;
            var hc = c.crop.healthCurrent != null ? Number(c.crop.healthCurrent) : hm;
            c.crop.healthMax = hm;
            c.crop.healthCurrent = Math.min(hm, Math.max(0, hc - loss));
            if (applyGrowingCropHealthDeath(c)) syncPlotSeaweedRequests(state, x, y);
          }
        }
      }

      /** �?生长倒计时、罐内效果 tick、健康枯萎复检） */
      function settleCrop(st, c) {
        var crop = c.crop;
        if (!crop || crop.settled) return;
        var def = CROP_DEFS[crop.cropId];
        var water = crop.waterAbsorbed;
        crop.remainingTicks = 0;
        crop.settled = true;
        if (water < def.minWater) {
          crop.result = "withered";
          crop.resultLabel = "水分不足枯萎";
          crop.harvestCount = 0;
        } else if (water > def.maxWater) {
          crop.result = "flooded";
          crop.resultLabel = "水分过多淹死";
          crop.harvestCount = 0;
        } else if (
          cropTraceSensitivity(def) === "severe" &&
          def.trace_fail_harvest_at != null &&
          round1(crop.traceAbsorbed || 0) >= Number(def.trace_fail_harvest_at)
        ) {
          crop.result = "trace_toxic";
          crop.resultLabel = "微量过剩·盐害灼伤落果";
          crop.harvestCount = 0;
        } else {
          var yieldResult = computeGrowthYield(def, c, crop, st);
          crop.result = "mature";
          crop.resultLabel = "成熟";
          crop.harvestCount = yieldResult.harvestCount;
          crop.growthScorePositive = yieldResult.growthScorePositive;
          crop.growthScoreNegative = yieldResult.growthScoreNegative;
          crop.yieldMultiplier = yieldResult.yieldMultiplier;
        }
      }

      function agriTickStep7CropGrowthAndMisc(state) {
        processFacilityTimedEffects(state);
        for (var y = 0; y < SIZE; y++) {
          for (var x = 0; x < SIZE; x++) {
            var c = cell(state, x, y);
            if (!c.crop || c.crop.settled) continue;
            if (applyGrowingCropHealthDeath(c)) syncPlotSeaweedRequests(state, x, y);
            if (!c.crop) continue;
            c.crop.remainingTicks -= 1;
            if (c.crop.remainingTicks <= 0) settleCrop(state, c);
            if (applyGrowingCropHealthDeath(c)) syncPlotSeaweedRequests(state, x, y);
          }
        }
      }

      /** §9 海藻精验收场景坐标（池在 0,0；主干沿 y=0 向东） */
      var E2E_SEAWEED_LAYOUT = {
        channels: [[1, 0], [2, 0], [3, 0]],
        /** 邻主干 (1,0)，可对主流+#1+#2 各维持一次（§15.2） */
        venturi: [1, 1],
        crop: [3, 1],
        injectEntry: [1, 0],
        dilutedChannel: [3, 0]
      };





















      function demoPlantCropAt(st, x, y, cropId) {
        var c = cell(st, x, y);
        if (c.kind !== "land" || !c.tilled || c.crop) return false;
        var def = CROP_DEFS[cropId];
        if (!def) return false;
        var hMax = def.healthMax != null ? Number(def.healthMax) : DEFAULT_CROP_HEALTH_MAX;
        updateSameCropStreakOnPlant(c, def);
        var growTicks = resolveCropGrowthTicks(c, def, st);
        c.crop = {
          cropId: def.cropId,
          name: def.name,
          remainingTicks: growTicks,
          totalTicks: growTicks,
          waterAbsorbed: 0,
          traceAbsorbed: 0,
          fertilizerAbsorbed: 0,
          healthMax: hMax,
          healthCurrent: hMax,
          settled: false,
          result: "growing",
          resultLabel: "生长中",
          harvestItemId: def.productItemId,
          harvestItemName: def.productName,
          harvestCount: 0
        };
        initCropSoilFieldsOnPlant(c, c.crop, def, st);
        syncPlotSeaweedRequests(st, x, y);
        return true;
      }







      /**
       * §9 清单端到端：挖渠→文丘里→买/注入海藻精→浓度10→邻渠花生→tick 观测→改渠重算→断言。
       * 不弹玩家向提示；结果供控制台 / pill-e2e / shopMessage 查看。
       */
      var seaweedGuideHtmlCache = null;









      function advanceConstructionTask(state, ctx) {
        ctx = ctx || {};
        if (!state || !state.task) return { ok: true, advanced: false, reason: 'no_task' };
        if (ctx.panelOpen === false) return { ok: true, advanced: false, reason: 'panel_closed' };
        var taskTicks = ctx.taskTicks != null ? Number(ctx.taskTicks) : TASK_TICKS;
        var staminaPerTick = ctx.staminaPerTick != null ? Number(ctx.staminaPerTick) : TASK_STAMINA_PER_TICK;
        var getStamina = ctx.getStamina;
        var setStamina = ctx.setStamina;
        if (typeof getStamina !== 'function' || typeof setStamina !== 'function') {
          return { ok: false, advanced: false, reason: 'missing_stamina_api' };
        }
        if (state.task.paused) {
          return { ok: true, advanced: false, reason: 'paused' };
        }
        var stamina = Number(getStamina()) || 0;
        if (stamina < staminaPerTick) {
          return { ok: true, advanced: false, reason: 'insufficient_stamina' };
        }
        setStamina(round1(Math.max(0, stamina - staminaPerTick)));
        state.task.progress = (state.task.progress || 0) + 1;
        if (state.task.progress >= taskTicks) {
          applyConstructionTask(state, state.task);
          var finished = state.task;
          state.task = null;
          var needsNetwork = finished.type === 'build' || finished.type === 'remove' ||
            finished.type === 'upgrade' || finished.type === 'downgrade' ||
            finished.type === 'upgrade_venturi' || finished.type === 'upgrade_pool';
          if (needsNetwork) recomputeIrrigationNetwork(state);
          if (finished.type === 'build_super_fusion' || finished.type === 'remove_super_fusion') {
            syncAllCropGrowthTicksForFusionChange(state);
          }
          return { ok: true, advanced: true, completed: true, task: finished };
        }
        return { ok: true, advanced: true, completed: false, progress: state.task.progress };
      }

      function applyTask(st, task) {
        if (!st || !task) return;
        var c = cell(st, task.x, task.y);
        if (!c) return;
        if (task.type === 'build') {
          c.kind = 'channel';
          c.capacity = DEFAULT_CHANNEL_CAPACITY;
          c.seaweedConcentration = 0;
          c.algaeBloom = false;
          c.tilled = false;
          c.cropStructure = null;
          c.crop = null;
        } else if (task.type === 'remove') {
          c.kind = 'land';
          c.capacity = 0;
          c.water = 0;
          c.tilled = false;
          c.crop = null;
        } else if (task.type === 'upgrade') {
          c.capacity += CHANNEL_CAPACITY_STEP;
        } else if (task.type === 'downgrade') {
          c.capacity = Math.max(DEFAULT_CHANNEL_CAPACITY, c.capacity - CHANNEL_CAPACITY_STEP);
        } else if (task.type === 'upgrade_venturi') {
          ensureVenturiCellFields(c);
          if (isVenturiCell(c)) {
            c.venturiLevel = Math.min(VENTURI_MAX_LEVEL, (Number(c.venturiLevel) || 1) + 1);
            c.seaweedSetConcentration = clampVenturiSetConc(c.venturiLevel, c.seaweedSetConcentration);
          }
        } else if (task.type === 'upgrade_pool') {
          applyPoolLevelUpgrade(st);
        } else if (task.type === 'till') {
          c.tilled = true;
        } else if (task.type === 'remove_tilled') {
          c.tilled = false;
          c.cropStructure = null;
        } else if (task.type === 'soil_amend') {
          if (c.kind === 'land') {
            c.soilId = task.soilId || c.soilId;
            c.soilType = task.soilType;
          }
        } else if (task.type === 'build_venturi') {
          c.kind = 'venturi_fertilizer';
          c.tilled = false;
          c.crop = null;
          c.capacity = 0;
          c.water = 0;
          c.seaweedConcentration = 0;
          c.algaeBloom = false;
          c.venturiLiquid = null;
          c.venturiLevel = 1;
          c.seaweedSetConcentration = VENTURI_DEFAULT_SET_CONC;
          ensureVenturiCellFields(c);
        } else if (task.type === 'remove_venturi') {
          c.venturiLiquid = null;
          c.kind = 'land';
          c.capacity = 0;
          c.water = 0;
          c.tilled = false;
          c.crop = null;
        } else if (task.type === 'build_buried_pot_jar') {
          c.kind = 'buried_pot_jar';
          c.tilled = false;
          c.crop = null;
          c.capacity = 0;
          c.water = 0;
          c.seaweedConcentration = 0;
          c.algaeBloom = false;
          c.jarLiquid = null;
          syncFertilizerRequestsNearBuriedJar(st, task.x, task.y);
        } else if (task.type === 'remove_buried_pot_jar') {
          c.jarLiquid = null;
          c.kind = 'land';
          c.capacity = 0;
          c.water = 0;
          c.tilled = false;
          c.crop = null;
          syncFertilizerRequestsNearBuriedJar(st, task.x, task.y);
        } else if (task.type === 'build_super_fusion') {
          c.kind = 'super_fusion';
          c.tilled = false;
          c.crop = null;
          c.cropStructure = null;
          c.capacity = 0;
          c.water = 0;
          c.seaweedConcentration = 0;
          c.algaeBloom = false;
          syncAllCropGrowthTicksForFusionChange(st);
        } else if (task.type === 'remove_super_fusion') {
          c.kind = 'land';
          c.capacity = 0;
          c.water = 0;
          c.tilled = false;
          c.crop = null;
          syncAllCropGrowthTicksForFusionChange(st);
        } else if (task.type === 'build_crop_structure') {
          if (c.kind === 'land' && c.tilled) c.cropStructure = task.structureId;
        } else if (task.type === 'remove_crop_structure') {
          c.cropStructure = null;
        }
      }

      function applyConstructionTask(state, task) {
        applyTask(state, task);
      }

      function runAgricultureMapTick(state, env) {
        bindEnv(env);
        runAgricultureMapTickCore(state);
      }

      function tryTillAt(state, x, y) {
        if (!inBounds(x, y)) return { ok: false, reason: 'out_of_bounds' };
        var c = cell(state, x, y);
        if (c.kind !== 'land') return { ok: false, reason: 'not_land' };
        if (c.tilled) return { ok: false, reason: 'already_tilled' };
        c.tilled = true;
        return { ok: true };
      }

      function tryRemoveTilledAt(state, x, y) {
        if (!inBounds(x, y)) return { ok: false, reason: 'out_of_bounds' };
        var c = cell(state, x, y);
        if (c.kind !== 'land' || !c.tilled || c.crop) return { ok: false, reason: 'invalid' };
        c.tilled = false;
        c.cropStructure = null;
        return { ok: true };
      }

      function tryPlaceChannelAt(state, x, y) {
        if (!inBounds(x, y)) return { ok: false, reason: 'out_of_bounds' };
        var c = cell(state, x, y);
        if (c.kind === 'pool') return { ok: false, reason: 'pool' };
        if (isFacilityCell(c) || c.crop) return { ok: false, reason: 'blocked' };
        c.kind = 'channel';
        c.capacity = DEFAULT_CHANNEL_CAPACITY;
        c.water = 0;
        c.seaweedConcentration = 0;
        c.algaeBloom = false;
        c.tilled = false;
        c.crop = null;
        c.cropStructure = null;
        return { ok: true };
      }

      function tryPlaceVenturiAt(state, x, y) {
        if (!inBounds(x, y)) return { ok: false, reason: 'out_of_bounds' };
        var c = cell(state, x, y);
        if (c.kind === 'pool') return { ok: false, reason: 'pool' };
        c.kind = 'venturi_fertilizer';
        c.tilled = false;
        c.crop = null;
        c.capacity = 0;
        c.water = 0;
        c.seaweedConcentration = 0;
        c.algaeBloom = false;
        c.venturiLiquid = null;
        c.venturiLevel = 1;
        c.seaweedSetConcentration = VENTURI_DEFAULT_SET_CONC;
        ensureVenturiCellFields(c);
        return { ok: true };
      }

      function tryInjectSeaweedEffectAt(state, env, x, y) {
        bindEnv(env);
        if (!inBounds(x, y)) return { ok: false, reason: 'out_of_bounds' };
        var c = cell(state, x, y);
        if (!isVenturiCell(c)) return { ok: false, reason: 'not_venturi' };
        var meta = injectableMeta(LIQUID_SEAWEED_EXTRACT_ITEM_ID);
        if (!meta || !meta.effectDurationTicks) return { ok: false, reason: 'no_inject_meta' };
        var dur = meta.effectDurationTicks;
        c.venturiLiquid = {
          itemId: LIQUID_SEAWEED_EXTRACT_ITEM_ID,
          name: meta.name,
          effectDurationTicks: dur,
          effectTicksRemaining: dur
        };
        return { ok: true };
      }

      function trySetSeaweedConcentrationAt(state, x, y, value) {
        if (!inBounds(x, y)) return { ok: false, reason: 'out_of_bounds' };
        var c = cell(state, x, y);
        if (!isVenturiCell(c)) return { ok: false, reason: 'not_venturi' };
        ensureVenturiCellFields(c);
        c.seaweedSetConcentration = clampVenturiSetConc(c.venturiLevel, value);
        return { ok: true, concentration: c.seaweedSetConcentration };
      }

      function tryPlantCropAt(state, env, x, y, cropId) {
        bindEnv(env);
        if (!inBounds(x, y)) return { ok: false, reason: 'out_of_bounds' };
        var c = cell(state, x, y);
        var def = CROP_DEFS[cropId];
        if (!def) return { ok: false, reason: 'unknown_crop' };
        if (c.kind !== 'land' || !c.tilled || c.crop) return { ok: false, reason: 'cannot_plant' };
        if (!plotHasRequiredCropStructure(c, def)) {
          return { ok: false, reason: 'missing_crop_structure', required: cropRequiredStructureId(def) };
        }
        var hMax = def.healthMax != null ? Number(def.healthMax) : DEFAULT_CROP_HEALTH_MAX;
        if (!(hMax > 0)) hMax = DEFAULT_CROP_HEALTH_MAX;
        var hCur = def.healthCurrent != null ? Number(def.healthCurrent) : hMax;
        updateSameCropStreakOnPlant(c, def);
        var growTicks = resolveCropGrowthTicks(c, def, state);
        c.crop = {
          cropId: def.cropId,
          name: def.name,
          remainingTicks: growTicks,
          totalTicks: growTicks,
          waterAbsorbed: 0,
          traceAbsorbed: 0,
          fertilizerAbsorbed: 0,
          healthMax: hMax,
          healthCurrent: Math.min(hMax, Math.max(0, hCur)),
          settled: false,
          result: 'growing',
          resultLabel: '生长中',
          harvestItemId: def.productItemId,
          harvestItemName: def.productName,
          harvestCount: 0
        };
        initCropSoilFieldsOnPlant(c, c.crop, def, state);
        syncPlotSeaweedRequests(state, x, y);
        syncPlotFertilizerRequests(state, x, y);
        return { ok: true, cropId: def.cropId };
      }

      function buildHarvestPayload(crop) {
        return {
          ok: true,
          cropId: crop.cropId,
          itemId: crop.harvestItemId,
          itemName: crop.harvestItemName,
          harvestCount: crop.harvestCount || 0,
          result: crop.result
        };
      }

      function peekHarvestAt(state, x, y) {
        if (!inBounds(x, y)) return { ok: false, reason: 'out_of_bounds' };
        var c = cell(state, x, y);
        if (!c.crop || !c.crop.settled) return { ok: false, reason: 'not_harvestable' };
        return buildHarvestPayload(c.crop);
      }

      function commitHarvestAt(state, x, y) {
        if (!inBounds(x, y)) return { ok: false, reason: 'out_of_bounds' };
        var c = cell(state, x, y);
        if (!c.crop || !c.crop.settled) return { ok: false, reason: 'not_harvestable' };
        var crop = c.crop;
        var payload = buildHarvestPayload(crop);
        c.previousCropId = crop.cropId;
        c.crop = null;
        syncPlotSeaweedRequests(state, x, y);
        syncPlotFertilizerRequests(state, x, y);
        return payload;
      }

      function tryHarvestAt(state, x, y) {
        var preview = peekHarvestAt(state, x, y);
        if (!preview.ok) return preview;
        return commitHarvestAt(state, x, y);
      }

      function tryApplySoilAmendAt(state, x, y, soilId, soilDisplayName) {
        if (!inBounds(x, y)) return { ok: false, reason: 'out_of_bounds' };
        var c = cell(state, x, y);
        if (c.kind !== 'land' || !c.tilled) return { ok: false, reason: 'not_tilled_land' };
        c.soilId = soilId || DEFAULT_SOIL_ID;
        c.soilType = soilDisplayName || getSoilDef(c.soilId).display_name;
        return { ok: true, soilId: c.soilId };
      }

      function advanceMapTicks(state, env, n) {
        bindEnv(env);
        var count = Math.max(0, Math.floor(Number(n) || 0));
        for (var t = 0; t < count; t++) {
          state.tick = (state.tick || 0) + 1;
          runAgricultureMapTickCore(state);
        }
        return state.tick;
      }

      global.AgricultureMap = {
        createDefaultState: createDefaultState,
        bindEnv: bindEnv,
        recomputeIrrigationNetwork: recomputeIrrigationNetwork,
        runAgricultureMapTick: runAgricultureMapTick,
        advanceConstructionTask: advanceConstructionTask,
        advanceMapTicks: advanceMapTicks,
        tryTillAt: tryTillAt,
        tryRemoveTilledAt: tryRemoveTilledAt,
        tryPlaceChannelAt: tryPlaceChannelAt,
        tryPlaceVenturiAt: tryPlaceVenturiAt,
        tryInjectSeaweedEffectAt: tryInjectSeaweedEffectAt,
        trySetSeaweedConcentrationAt: trySetSeaweedConcentrationAt,
        tryPlantCropAt: tryPlantCropAt,
        peekHarvestAt: peekHarvestAt,
        commitHarvestAt: commitHarvestAt,
        tryHarvestAt: tryHarvestAt,
        tryApplySoilAmendAt: tryApplySoilAmendAt,
        getPoolLevel: getPoolLevel,
        nextPoolUpgradeLevel: nextPoolUpgradeLevel,
        applyPoolLevelUpgrade: applyPoolLevelUpgrade,
        venturiConcRangeForLevel: venturiConcRangeForLevel,
        cell: cell,
        constants: {
          size: SIZE,
          poolX: POOL_X,
          poolY: POOL_Y,
          basePoolWater: BASE_POOL_WATER,
          defaultSoilId: DEFAULT_SOIL_ID,
          defaultChannelCapacity: DEFAULT_CHANNEL_CAPACITY,
          channelCapacityStep: CHANNEL_CAPACITY_STEP,
          poolMaxLevel: POOL_MAX_LEVEL,
          venturiMaxLevel: VENTURI_MAX_LEVEL,
          taskTicks: TASK_TICKS,
          taskStaminaPerTick: TASK_STAMINA_PER_TICK,
          liquidSeaweedExtractItemId: LIQUID_SEAWEED_EXTRACT_ITEM_ID,
          algaeBloomRatioThreshold: ALGAE_BLOOM_RATIO_THRESHOLD
        },
        isAlgaeBloom: isAlgaeBloom,
        getIrrigationSourceForPlot: getIrrigationSourceForPlot,
        cropDefRequestsSeaweedExtract: cropDefRequestsSeaweedExtract,
        processSeaweedExtractMaintain: processSeaweedExtractMaintain,
        syncCropSeaweedExtractRequests: syncCropSeaweedExtractRequests,
        applyBranchTheft: applyBranchTheft
      };
})(typeof window !== 'undefined' ? window : globalThis);
