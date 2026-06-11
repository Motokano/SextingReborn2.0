/**
 * 仿真层全链路：开垦→渠→文丘里→海藻精→埋瓮→肥液→客土→建造物→播种→成熟→收获。
 * 运行：node tools/test-agriculture-e2e-chain.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function loadMap() {
  const code = fs.readFileSync(path.join(root, "js", "agriculture-map.js"), "utf8");
  const fn = new Function("globalThis", code + "\n;return globalThis.AgricultureMap;");
  const g = {};
  fn(g);
  return g.AgricultureMap;
}

function cell(st, AM, x, y) {
  return AM.cell(st, x, y);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function finishTask(st, AM, taskTicks) {
  const ticks = taskTicks || AM.constants.taskTicks || 10;
  let stamina = 500;
  for (let i = 0; i < ticks; i++) {
    const r = AM.advanceConstructionTask(st, {
      panelOpen: true,
      getStamina: () => stamina,
      setStamina: (v) => { stamina = v; },
    });
    assert(r.advanced, "工程 tick 应推进，i=" + i + " reason=" + (r.reason || ""));
  }
  assert(!st.task, "工程完成后 task 应清空");
}

function main() {
  const cropDefsDoc = readJson("data/agriculture-crop-defs.json");
  const soilsDoc = readJson("data/agriculture-soils.json");
  const itemParamsDoc = readJson("data/agriculture-item-params.json");
  const AM = loadMap();

  function resolveInjectParams(itemId) {
    const row = (itemParamsDoc.injectables || {})[itemId];
    if (!row) return null;
    const out = { name: itemId, injectFacility: row.inject_facility || "" };
    if (row.agriculture_fertilizer_per_tick != null) {
      out.fertilizerPerTick = Number(row.agriculture_fertilizer_per_tick);
    }
    if (row.agriculture_venturi_effect_duration_ticks != null) {
      out.effectDurationTicks = Math.floor(Number(row.agriculture_venturi_effect_duration_ticks));
    }
    return out;
  }

  const env = {
    cropDefsDoc,
    soilsDoc,
    resolveInjectParams,
  };
  AM.bindEnv(env);

  /** 与 test-agriculture-map 相同渠网布局（接池可灌溉） */
  const LAYOUT = {
    channels: [[1, 0], [2, 0], [3, 0]],
    venturi: [1, 1],
    crop: [3, 1],
    jar: [2, 1],
  };

  const st = AM.createDefaultState();
  const px = LAYOUT.crop[0];
  const py = LAYOUT.crop[1];
  const ventX = LAYOUT.venturi[0];
  const ventY = LAYOUT.venturi[1];
  const jarX = LAYOUT.jar[0];
  const jarY = LAYOUT.jar[1];

  for (let i = 0; i < LAYOUT.channels.length; i++) {
    const xy = LAYOUT.channels[i];
    st.task = { type: "build", x: xy[0], y: xy[1], progress: 0, paused: false };
    finishTask(st, AM);
  }
  AM.recomputeIrrigationNetwork(st);

  /** 1. 开垦 */
  st.task = { type: "till", x: px, y: py, progress: 0, paused: false };
  finishTask(st, AM);
  assert(cell(st, AM, px, py).tilled, "开垦后应 tilled");

  /** 2. 文丘里（邻接渠） */
  st.task = { type: "build_venturi", x: ventX, y: ventY, progress: 0, paused: false };
  finishTask(st, AM);
  assert(cell(st, AM, ventX, ventY).kind === "venturi_fertilizer", "应建成文丘里");

  /** 3. 海藻精注入 */
  const inj = AM.tryInjectSeaweedEffectAt(st, env, ventX, ventY);
  assert(inj.ok, "文丘里注海藻精应成功");

  /** 4. 埋瓮 */
  st.task = { type: "build_buried_pot_jar", x: jarX, y: jarY, progress: 0, paused: false };
  finishTask(st, AM);
  assert(cell(st, AM, jarX, jarY).kind === "buried_pot_jar", "应建成埋瓮");

  /** 5. 瓮注肥（模拟 scene-app 注液） */
  cell(st, AM, jarX, jarY).jarLiquid = { itemId: "fertilizer_basic", name: "沤肥·中", units: 1 };

  /** 6. 客土 */
  st.task = {
    type: "soil_amend",
    x: px,
    y: py,
    progress: 0,
    paused: false,
    soilId: "soil_black",
    soilType: "典型黑土",
  };
  finishTask(st, AM);
  assert(cell(st, AM, px, py).soilId === "soil_black", "客土后 soilId 应为 soil_black");

  /** 7. 带建造物播种 */
  st.task = {
    type: "build_crop_structure",
    x: px,
    y: py,
    progress: 0,
    paused: false,
    structureId: "support_frame",
  };
  finishTask(st, AM);
  assert(cell(st, AM, px, py).cropStructure === "support_frame", "应装上支撑架");

  const maizeDef = cropDefsDoc.crops.maize;
  const plant = AM.tryPlantCropAt(st, env, px, py, "maize");
  assert(plant.ok, "带建造物播种应成功：" + (plant.reason || ""));

  /** 8. 成熟 + 收获 */
  const growN = maizeDef.growthTicks || 80;
  AM.advanceMapTicks(st, env, growN + 20);
  const plot = cell(st, AM, px, py);
  assert(plot.crop && plot.crop.settled, "应已成熟结算");
  assert(plot.crop.result === "mature", "结果应为 mature，实际=" + (plot.crop && plot.crop.result));

  const peek = AM.peekHarvestAt(st, px, py);
  assert(peek.ok && peek.harvestCount >= 1, "peek 应有收获量");
  const commit = AM.commitHarvestAt(st, px, py);
  assert(commit.ok, "commit 收获应成功");
  assert(!cell(st, AM, px, py).crop, "收获后 crop 应清除");

  /** 关面板冻工程 / 开面板推进（回归） */
  st.task = { type: "till", x: 3, y: 3, progress: 2, paused: false };
  const frozen = AM.advanceConstructionTask(st, { panelOpen: false, getStamina: () => 99, setStamina: () => {} });
  assert(frozen.reason === "panel_closed" && st.task.progress === 2, "关面板进度应冻结");

  console.log("tools/test-agriculture-e2e-chain.mjs: all assertions passed");
}

main();
