/**
 * §15.0 / §9 海藻精场景：固定布局跑 N tick，断言关键格与 standalone E2E 一致。
 * 运行：node tools/test-agriculture-map.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);

const cropDefsDoc = JSON.parse(
  fs.readFileSync(path.join(root, "data", "agriculture-crop-defs.json"), "utf8")
);
const soilsDoc = JSON.parse(
  fs.readFileSync(path.join(root, "data", "agriculture-soils.json"), "utf8")
);
const itemParamsDoc = JSON.parse(
  fs.readFileSync(path.join(root, "data", "agriculture-item-params.json"), "utf8")
);

/** 与 standalone E2E_SEAWEED_LAYOUT 一致 */
const LAYOUT = {
  channels: [[1, 0], [2, 0], [3, 0]],
  venturi: [1, 1],
  crop: [3, 1],
  injectEntry: [1, 0],
  dilutedChannel: [3, 0],
};

function loadMap() {
  const p = path.join(root, "js", "agriculture-map.js");
  const code = fs.readFileSync(p, "utf8");
  const fn = new Function("globalThis", code + "\n;return globalThis.AgricultureMap;");
  const g = { AgricultureMap: null };
  fn(g);
  return g.AgricultureMap;
}

/** 与 scene-app buildAgricultureEnv → AgricultureConfig.getInjectableParams 口径一致 */
function resolveInjectParams(itemId) {
  const id = String(itemId || "").trim();
  if (!id) return null;
  const injectables = itemParamsDoc.injectables || {};
  const row = injectables[id];
  if (!row) return null;
  const out = {
    name: id,
    injectFacility: String(row.inject_facility || "").trim(),
  };
  if (row.agriculture_fertilizer_per_tick != null && isFinite(row.agriculture_fertilizer_per_tick)) {
    out.fertilizerPerTick = Number(row.agriculture_fertilizer_per_tick);
  }
  if (row.agriculture_venturi_effect_duration_ticks != null) {
    out.effectDurationTicks = Math.max(
      1,
      Math.floor(Number(row.agriculture_venturi_effect_duration_ticks))
    );
  }
  return out;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function cell(st, AM, x, y) {
  return AM.cell(st, x, y);
}

function main() {
  const AM = loadMap();
  const env = {
    cropDefs: cropDefsDoc,
    soils: soilsDoc,
    resolveInjectParams,
  };

  const st = AM.createDefaultState();
  AM.bindEnv(env);

  for (let i = 0; i < LAYOUT.channels.length; i++) {
    const xy = LAYOUT.channels[i];
    assert(AM.tryPlaceChannelAt(st, xy[0], xy[1]).ok, "放置水渠失败");
  }
  AM.recomputeIrrigationNetwork(st);
  assert(st.trunkPath && st.trunkPath.length >= 1, "应有主干路径");
  assert(cell(st, AM, 3, 0).water > 0, "下游渠格应有水");

  assert(AM.tryPlaceVenturiAt(st, LAYOUT.venturi[0], LAYOUT.venturi[1]).ok, "文丘里失败");
  AM.recomputeIrrigationNetwork(st);
  assert(AM.tryInjectSeaweedEffectAt(st, env, LAYOUT.venturi[0], LAYOUT.venturi[1]).ok, "注入海藻精失败");
  assert(AM.trySetSeaweedConcentrationAt(st, LAYOUT.venturi[0], LAYOUT.venturi[1], 10).ok, "浓度10失败");

  const cx = LAYOUT.crop[0];
  const cy = LAYOUT.crop[1];
  assert(AM.tryTillAt(st, cx, cy).ok, "开垦失败");
  assert(AM.tryPlantCropAt(st, env, cx, cy, "sesame").ok, "种芝麻失败");
  AM.syncCropSeaweedExtractRequests(st);
  assert(AM.cropDefRequestsSeaweedExtract(cropDefsDoc.crops.sesame), "芝麻应请求海藻精");

  AM.advanceMapTicks(st, env, 1);

  const ex = LAYOUT.injectEntry[0];
  const ey = LAYOUT.injectEntry[1];
  const dx = LAYOUT.dilutedChannel[0];
  const dy = LAYOUT.dilutedChannel[1];
  const entryCh = cell(st, AM, ex, ey);
  const downCh = cell(st, AM, dx, dy);
  const plot = cell(st, AM, cx, cy);

  assert(round1(entryCh.seaweedConcentration || 0) === 0, "注入口浓度应为0");
  assert(downCh.seaweedConcentration > 0, "下游渠应有海藻精浓度");
  assert(plot.crop && plot.crop.traceAbsorbed > 0, "应吸收微量元素");

  assert(plot.crop.traceAbsorbed === round1(plot.crop.traceAbsorbed), "trace 一位小数");

  /** 延长主干触发 §5 重算 */
  assert(AM.tryPlaceChannelAt(st, 4, 0).ok, "延长主干失败");
  AM.recomputeIrrigationNetwork(st);
  for (let y = 0; y < AM.constants.size; y++) {
    for (let x = 0; x < AM.constants.size; x++) {
      const c = cell(st, AM, x, y);
      if (c.kind === "channel" && round1(c.seaweedConcentration || 0) !== 0) {
        throw new Error("重算后全场渠浓度应为0");
      }
    }
  }
  AM.syncCropSeaweedExtractRequests(st);
  AM.advanceMapTicks(st, env, 1);
  assert(cell(st, AM, dx, dy).seaweedConcentration > 0, "重算后下一 tick 应恢复浓度");

  /** panelOpen=false 时工程不推进 */
  st.task = { type: "till", x: 5, y: 5, progress: 0, paused: false };
  const before = st.task.progress;
  const r = AM.advanceConstructionTask(st, { panelOpen: false, getStamina: () => 100, setStamina: () => {} });
  assert(r.advanced === false && r.reason === "panel_closed", "关面板应冻结工程");
  assert(st.task.progress === before, "进度不变");

  /** 成熟结算（独立地图，避免海藻精 E2E 污染） */
  const stMat = AM.createDefaultState();
  AM.bindEnv(env);
  for (let i = 0; i < LAYOUT.channels.length; i++) {
    const xy = LAYOUT.channels[i];
    assert(AM.tryPlaceChannelAt(stMat, xy[0], xy[1]).ok, "成熟测试渠失败");
  }
  AM.recomputeIrrigationNetwork(stMat);
  const sx = LAYOUT.crop[0];
  const sy = LAYOUT.crop[1];
  assert(AM.tryTillAt(stMat, sx, sy).ok, "成熟测试开垦失败");
  assert(AM.tryPlantCropAt(stMat, env, sx, sy, "maize").ok, "种玉米失败");
  const maizeDef = cropDefsDoc.crops.maize;
  const growN = (maizeDef && maizeDef.growthTicks) || 80;
  AM.advanceMapTicks(stMat, env, growN + 12);
  const maizePlot = cell(stMat, AM, sx, sy);
  assert(maizePlot.crop && maizePlot.crop.settled, "玉米应已成熟结算");
  assert(maizePlot.crop.result === "mature", "玉米应可收获成熟，实际=" + (maizePlot.crop && maizePlot.crop.result));
  assert((maizePlot.crop.harvestCount || 0) >= 1, "成熟玉米应有收获量");

  /** peek / commit：预览不清 crop，commit 才清 */
  assert(typeof AM.peekHarvestAt === "function", "应有 peekHarvestAt");
  assert(typeof AM.commitHarvestAt === "function", "应有 commitHarvestAt");
  const peekRes = AM.peekHarvestAt(stMat, sx, sy);
  assert(peekRes.ok && peekRes.harvestCount >= 1, "peek 应返回可收获预览");
  assert(cell(stMat, AM, sx, sy).crop, "peek 后 crop 应仍在");
  const commitRes = AM.commitHarvestAt(stMat, sx, sy);
  assert(commitRes.ok, "commit 应成功");
  assert(!cell(stMat, AM, sx, sy).crop, "commit 后 crop 应清除");

  /** §8.4 窃流：牺牲支路总水量比例缩 */
  const stTh = AM.createDefaultState();
  AM.bindEnv(env);
  for (const xy of [[1, 0], [2, 0], [3, 0], [2, 1], [3, 1]]) {
    assert(AM.tryPlaceChannelAt(stTh, xy[0], xy[1]).ok, "窃流测渠 " + xy);
  }
  AM.recomputeIrrigationNetwork(stTh);
  assert((stTh.branches || []).length >= 2, "应至少两条支流");
  stTh.pool_level = 2;
  stTh.pool_theft = { enabled: true, victim_branch_index: 1, gain_branch_index: 2 };
  let w1Before = 0;
  let w2Before = 0;
  for (let y = 0; y < AM.constants.size; y++) {
    for (let x = 0; x < AM.constants.size; x++) {
      const c = cell(stTh, AM, x, y);
      if (c.kind === "channel" && c.branchIndex === 1) w1Before += c.water || 0;
      if (c.kind === "channel" && c.branchIndex === 2) w2Before += c.water || 0;
    }
  }
  w1Before = round1(w1Before);
  w2Before = round1(w2Before);
  assert(w1Before > 0, "牺牲支路应有水");
  const gainEnd = cell(stTh, AM, 3, 1);
  if (gainEnd.kind === "channel" && gainEnd.branchIndex === 2) gainEnd.water = 0;
  const theft = AM.applyBranchTheft(stTh);
  assert(theft.moved > 0, "窃流应挪动水量");
  let w1After = 0;
  let w2After = 0;
  for (let y = 0; y < AM.constants.size; y++) {
    for (let x = 0; x < AM.constants.size; x++) {
      const c = cell(stTh, AM, x, y);
      if (c.kind === "channel" && c.branchIndex === 1) w1After += c.water || 0;
      if (c.kind === "channel" && c.branchIndex === 2) w2After += c.water || 0;
    }
  }
  w1After = round1(w1After);
  w2After = round1(w2After);
  assert(w1After < w1Before, "牺牲支路总水量应下降");
  assert(w2After >= w2Before, "受益支路总水量应上升");

  console.log("tools/test-agriculture-map.mjs: all assertions passed");
}

main();
