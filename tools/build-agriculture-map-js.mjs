/**
 * 从 agriculture-standalone.html 抽取纯仿真 → js/agriculture-map.js
 * 运行：node tools/build-agriculture-map-js.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const standalonePath = path.join(root, "agriculture-standalone.html");
const outPath = path.join(root, "js", "agriculture-map.js");

const html = fs.readFileSync(standalonePath, "utf8");
let simStart = html.indexOf("(function () {\r\n      var SIZE = 11;");
if (simStart < 0) simStart = html.indexOf("(function () {\n      var SIZE = 11;");
if (simStart < 0) throw new Error("simulation script start not found");
let domAnchor = html.indexOf("\r\n      var state = createInitialState();", simStart);
if (domAnchor < 0) domAnchor = html.indexOf("\n      var state = createInitialState();", simStart);
if (domAnchor < 0) throw new Error("DOM anchor not found");
let body = html.slice(simStart + "(function () {".length, domAnchor);

/** DOM 锚点之后仍有仿真函数（如 settleCrop），须补抽 */
const simTail = html.slice(domAnchor);
if (!/\n      function settleCrop\s*\(/.test(body)) {
  const settleBlock = extractFunctionBlock(simTail, "settleCrop");
  if (settleBlock) {
    const insertAt = body.indexOf("function agriTickStep7CropGrowthAndMisc");
    if (insertAt >= 0) {
      body = body.slice(0, insertAt) + settleBlock.trimStart() + "\n\n      " + body.slice(insertAt);
    } else {
      body += "\n" + settleBlock;
    }
  }
}

/** 按 function 名删除整段（含嵌套大括号） */
function removeFunctionBlock(src, name) {
  const re = new RegExp(
    `\\n      function ${name}\\s*\\([^)]*\\)\\s*\\{`,
    "g"
  );
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index;
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    src = src.slice(0, start) + "\n" + src.slice(i);
    re.lastIndex = 0;
  }
  return src;
}

/** 提取单个 function 块（含嵌套大括号） */
function extractFunctionBlock(src, name) {
  const re = new RegExp(`\\n      function ${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = re.exec(src);
  if (!m) return "";
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return src.slice(m.index, i);
}

const removeNames = [
  "renderShopSoilList",
  "renderPlantCropButtons",
  "listPlantableCropDefsForCell",
  "renderSeedShop",
  "getSeedTierTradeUnlockRequired",
  "isSeedTierTradeUnlocked",
  "getSeedShopRowByItemId",
  "applySeedShopCatalog",
  "loadSeedShopCatalog",
  "formatVenturiPanelSummary",
  "syncVenturiBuildMenuPanel",
  "demoAddTempItem",
  "addShopTradeVolume",
  "demoBuyShopItemOn",
  "demoPlaceChannelAt",
  "demoPlaceVenturiAt",
  "demoPlaceBuriedPotJarAt",
  "demoTillAt",
  "demoInjectSeaweedEffectAt",
  "demoInjectSeaweedFromBackpackAt",
  "demoSetSeaweedConcentrationOn",
  "demoPlantPeanutAt",
  "demoAdvanceMapTicks",
  "seaweedRequestsIncludePlot",
  "allChannelSeaweedConcentrationZero",
  "runSeaweedExtractE2EAcceptance",
  "closeSeaweedGuideModal",
  "openSeaweedGuideModal",
  "createTempBackpack",
  "plantCrop",
  "harvestCrop",
  "startVenturiBuildTask",
  "startBuriedPotJarBuildTask",
  "startSuperFusionBuildTask",
  "startCropStructureBuildTask",
  "startTask",
  "startPaidTask",
  "onCellClick",
  "tickOnce",
  "bind",
  "tryUpgradeVenturiAt",
  "setSeaweedSetConcentrationAt",
  "stepSeaweedSetConcentrationAt",
];

for (const n of removeNames) {
  body = removeFunctionBlock(body, n);
}

/** E2E 常量块 */
body = body.replace(
  /\n      \/\*\* §9 海藻精验收[\s\S]*?var E2E_SEAWEED_LAYOUT = \{[\s\S]*?\};\n/,
  "\n"
);

/** AgricultureIrrigationDemo 导出块 */
body = body.replace(
  /\n      \/\*\*\s*\n       \* window\.AgricultureIrrigationDemo[\s\S]*?window\.AgricultureIrrigationDemo = \{[\s\S]*?\n      \};\n/,
  "\n"
);
function stripExportBlock(src, marker) {
  const idx = src.indexOf(marker);
  if (idx < 0) return src;
  let start = src.lastIndexOf("\n      /**", idx);
  if (start < 0) start = src.lastIndexOf("\n      var ", idx);
  if (start < 0) start = idx;
  const end = src.indexOf("\n      };", idx);
  if (end < 0) return src;
  return src.slice(0, start) + src.slice(end + "\n      };".length);
}
body = stripExportBlock(body, "window.AgricultureIrrigationDemo");
body = body.replace(/\n      var seaweedGuideHtmlCache = null;[\s\S]*?\/\*\*[\s\S]*?§9 清单端到端[\s\S]*?\*\/\n/g, "\n");

/** 遗留 load* / 商店 tier */
body = removeFunctionBlock(body, "loadSeedShopCatalog");
body = removeFunctionBlock(body, "loadCropDefs");
body = removeFunctionBlock(body, "loadSoilDefs");
body = removeFunctionBlock(body, "getSeedTierTradeUnlockRequired");
body = removeFunctionBlock(body, "isSeedTierTradeUnlocked");
body = removeFunctionBlock(body, "getSeedShopRowByItemId");

body = body
  .replace(/\bstate \|\| state\b/g, "st")
  .replace(/anySuperFusionOnMap\(st \|\| state\)/g, "anySuperFusionOnMap(st)")
  .replace(/isSoilFusionActive\(st \|\| state\)/g, "isSoilFusionActive(st)")
  .replace(/function createInitialState\(\)/g, "function createDefaultState()")
  .replace(
    /return \{\r?\n          tick: 0,[\s\S]*?task: null,\r?\n          buildMenu: null,/,
    `return {
          tick: 0,
          stamina: MAX_STAMINA,
          task: null,`
  );

/** computeGrowthYield 使用参数 st 而非闭包 state */
body = body.replace(
  /function computeGrowthYield\(def, cell, crop\) \{/,
  "function computeGrowthYield(def, cell, crop, st) {"
);
body = body.replace(
  /var dimScores = \[scoreWaterDimension\(def, water, cell, state\)\];/g,
  "var dimScores = [scoreWaterDimension(def, water, cell, st)];"
);
body = body.replace(
  /scoreTraceDimension\(def, trace, cell, state\)/g,
  "scoreTraceDimension(def, trace, cell, st)"
);
body = body.replace(
  /getPlotSoilEffectId\(cell, state\)/g,
  "getPlotSoilEffectId(cell, st)"
);
body = body.replace(
  /scoreFertilizerDimension\(def, fert, cell, state\)/g,
  "scoreFertilizerDimension(def, fert, cell, st)"
);
body = body.replace(
  /scoreSoilDimension\(def, cell\.soilType \|\| DEFAULT_SOIL_TYPE, cell, state\)/g,
  "scoreSoilDimension(def, cell.soilType || DEFAULT_SOIL_TYPE, cell, st)"
);
body = body.replace(
  /scoreRotationDimension\(cell, def, state\)/g,
  "scoreRotationDimension(cell, def, st)"
);
body = body.replace(/function settleCrop\(c\)/, "function settleCrop(st, c)");
body = body.replace(/settleCrop\(c\)/g, "settleCrop(state, c)");
body = body.replace(
  /var yieldResult = computeGrowthYield\(def, c, crop\);/g,
  "var yieldResult = computeGrowthYield(def, c, crop, st);"
);
body = body.replace(
  /var yieldResult = computeGrowthYield\(def, c, crop, state\);/,
  "var yieldResult = computeGrowthYield(def, c, crop, st);"
);

/** injectable：优先 env.resolveInjectParams */
body = body.replace(
  /function injectableMeta\(itemId\) \{\n        return itemId \? AGRICULTURE_INJECTABLE_LIQUIDS\[itemId\] : null;\n      \}/,
  `function injectableMeta(itemId) {
        if (!itemId) return null;
        if (envCtx.resolveInjectParams) {
          var fromEnv = envCtx.resolveInjectParams(itemId);
          if (fromEnv) return fromEnv;
        }
        return AGRICULTURE_INJECTABLE_LIQUIDS[itemId] || null;
      }`
);

const header = `/**
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

`;

const footer = `
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
            finished.type === 'upgrade' || finished.type === 'downgrade';
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
        cell: cell,
        constants: {
          size: SIZE,
          poolX: POOL_X,
          poolY: POOL_Y,
          basePoolWater: BASE_POOL_WATER,
          defaultSoilId: DEFAULT_SOIL_ID,
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
`;

/** rename runAgricultureMapTick inner to runAgricultureMapTickCore */
body = body.replace(
  /function runAgricultureMapTick\(state\) \{/,
  "function runAgricultureMapTickCore(state) {"
);

/** applyTask：显式传入地图 state */
body = body.replace(/function applyTask\(task\) \{/, "function applyTask(st, task) {");
body = body.replace(
  /function applyTask\(st, task\) \{\n        var c = cell\(state, task\.x, task\.y\);/,
  "function applyTask(st, task) {\n        var c = cell(st, task.x, task.y);"
);
body = body.replace(
  /syncFertilizerRequestsNearBuriedJar\(state,/g,
  "syncFertilizerRequestsNearBuriedJar(st,"
);
body = body.replace(
  /function syncFertilizerRequestsNearBuriedJar\(st, jx, jy\) \{\s*forEachNeighbor8\(jx, jy, function \(nx, ny\) \{\s*syncPlotFertilizerRequests\(state,/,
  "function syncFertilizerRequestsNearBuriedJar(st, jx, jy) {\n        forEachNeighbor8(jx, jy, function (nx, ny) {\n          syncPlotFertilizerRequests(st,"
);
body = body.replace(
  /syncAllCropGrowthTicksForFusionChange\(state\)/g,
  "syncAllCropGrowthTicksForFusionChange(st)"
);
/** 拆除退回背包：仿真层忽略 */
body = body.replace(/addTempItem\([^)]+\);\n/g, "");

const shopVars = `
      var TEMP_BACKPACK_SIZE = 25;
      var INITIAL_MONEY = 50;
      var SHOP_ITEMS = {};
      var DEMO_SOIL_SHOP = [];
      var SEED_SHOP_CATALOG = [];
`;
body = body.replace(/var TEMP_BACKPACK_SIZE = 25;/, shopVars.trim().split("\n")[0] ? "" : "");
body = body.replace(/\s*var TEMP_BACKPACK_SIZE = 25;\n/, "\n");
body = body.replace(/\s*var INITIAL_MONEY = 50;\n/, "\n");
body = body.replace(/\s*var SHOP_ITEMS = \{[\s\S]*?\};\n/, "\n");
body = body.replace(/\s*var DEMO_SOIL_SHOP = \[[\s\S]*?\];\n/, "\n");
body = body.replace(/\s*var SEED_SHOP_CATALOG = \[\];\n[\s\S]*?var ITEM_SELL_PRICES[\s\S]*?function loadCropDefs/m, "\n      function loadCropDefs");

const out = header + body + footer;
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, "utf8");
console.log("Wrote", outPath, "(" + out.length + " chars)");
