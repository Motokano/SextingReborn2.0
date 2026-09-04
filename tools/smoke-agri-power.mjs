/**
 * 农业电力冒烟（k89 电池经济扩展：只超融合耗电，45 §四·农业）
 * 覆盖：起步储能 500；无超融合不扣电；超融合有电 → gate on + 每 tick -1；
 * 耗尽 → gate off（文丘里回 B 面）；塞电池来电 → gate on + 作物刻度翻转不崩。
 * 运行：node tools/smoke-agri-power.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadMap() {
  const p = path.join(root, "js", "agriculture-map.js");
  const code = fs.readFileSync(p, "utf8");
  const fn = new Function("globalThis", code + "\n;return globalThis.AgricultureMap;");
  const g = { AgricultureMap: null };
  fn(g);
  return g.AgricultureMap;
}

function assert(cond, msg) {
  if (!cond) throw new Error("断言失败: " + msg);
}

function main() {
  const AM = loadMap();
  const st = AM.createDefaultState();

  // 1. 起步储能 500
  assert(st.power_charge === 500, "起步储能应为 500，实际 " + st.power_charge);
  assert(AM.constants.superFusionPowerDrainPerTick === 1, "drain 应为 1/tick");
  assert(AM.getPowerCharge(st) === 500, "getPowerCharge 应返回 500");

  // 2. 无超融合：跑 tick 不扣电
  AM.runAgricultureMapTick(st, { cropDefs: {}, soils: {} });
  assert(st.power_charge === 500, "无超融合不应扣电");

  // 3. 放一座超融合 + 有电 → gate on
  st.map[2][2].kind = "super_fusion";
  assert(AM.isSuperFusionPowered(st) === true, "有电超融合应供电");
  assert(AM.currentPowerDrainPerTick(st) === 1, "供电时 drain 应为 1");

  // 4. 跑 500 tick → 耗尽 → gate off
  for (let i = 0; i < 500; i++) AM.runAgricultureMapTick(st, { cropDefs: {}, soils: {} });
  assert(st.power_charge === 0, "500 tick 后储能应为 0，实际 " + st.power_charge);
  assert(AM.isSuperFusionPowered(st) === false, "耗尽后 gate 应关闭");
  assert(AM.currentPowerDrainPerTick(st) === 0, "断电后 drain 应为 0");
  assert(st.map[2][2].kind === "super_fusion", "断电只停摆、不拆建筑");

  // 5. 塞电池来电 → gate on + 多座不叠加 drain 语义（再加一座仍 1/tick）
  st.map[3][3].kind = "super_fusion";
  let r = AM.addPowerCharge(st, 400);
  assert(r.ok && r.charge === 400, "塞 400 电后储能应为 400，实际 " + r.charge);
  assert(AM.isSuperFusionPowered(st) === true, "来电后 gate 应恢复");
  assert(AM.currentPowerDrainPerTick(st) === 1, "多座超融合 drain 仍应为 1（效果不叠加）");

  // 6. 作物在场：断电/来电翻转 sync 不崩（生长刻度按 gate 重算）
  const env = {
    cropDefs: { crops: { maize: { growthTicks: 80, minWater: 1, maxWater: 10, water_profile: "xeric" } } },
    soils: {},
    resolveInjectParams: null
  };
  AM.runAgricultureMapTick(st, env); // 先跑一 tick（当前 400 电，仍供电）
  const plot = st.map[5][5];
  plot.kind = "land";
  plot.tilled = true;
  const plant = AM.tryPlantCropAt(st, env, 5, 5, "maize");
  assert(plant && plant.ok, "种玉米失败: " + (plant && plant.reason));
  const beforeTicks = st.map[5][5].crop.totalTicks;
  // 耗到 0（来电翻转）→ 再充电（来电翻转），全程不应抛错
  st.power_charge = 0;
  AM.runAgricultureMapTick(st, env);
  assert(st.map[5][5].crop, "断电后作物应仍在");
  AM.addPowerCharge(st, 500);
  AM.runAgricultureMapTick(st, env);
  assert(st.map[5][5].crop, "来电后作物应仍在");
  const afterTicks = st.map[5][5].crop.totalTicks;
  assert(afterTicks > 0, "生长刻度应有效");

  // 7. 模拟旧档迁移（power_charge 缺失 → 运行时按 0 处理，save 层补 500）
  const legacy = AM.createDefaultState();
  delete legacy.power_charge;
  assert(AM.isSuperFusionPowered(legacy) === false, "无储能字段不应供电（save 层迁移兜底）");

  console.log("tools/smoke-agri-power.mjs: all assertions passed (start=" + beforeTicks + ", after=" + afterTicks + ")");
}

main();
