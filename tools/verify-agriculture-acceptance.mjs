/**
 * Phase 1 联调总验收 · 可静态/单测项自动核对。
 * 运行：node tools/verify-agriculture-acceptance.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const checks = [];

function check(id, label, ok, detail) {
  checks.push({ id, label, ok, detail: detail || "" });
}

function main() {
  const sceneApp = read("js/scene-app.js");
  const agPanel = read("js/agriculture-panel.js");
  const agMap = read("js/agriculture-map.js");
  const saveSys = read("js/save-system.js");
  const playerItems = read("js/agriculture-player-items.js");
  const mapJson = JSON.parse(read("data/maps/M0_Base_Inside_lv_1.json"));
  const buildCosts = JSON.parse(read("data/agriculture-build-costs.json"));
  const npcJson = JSON.parse(read("data/npc/npc_station_agriculture_base.json"));

  check(
    "tick_global",
    "全局 tick：advanceTick → tickAgricultureAfterWorldTick",
    sceneApp.includes("tickAgricultureAfterWorldTick()") &&
      sceneApp.includes("AM.runAgricultureMapTick"),
    ""
  );

  check(
    "panel_freeze",
    "关面板冻工程：仅 agriculturePanelOpen 时 advanceConstructionTask",
    sceneApp.includes("agriculturePanelOpen && st.task") &&
      agMap.includes('reason: \'panel_closed\''),
    ""
  );

  check(
    "harvest_peek",
    "收获：peek → 入包 → commit（背包满保留 crop）",
    agMap.includes("function peekHarvestAt") &&
      agMap.includes("function commitHarvestAt") &&
      sceneApp.includes("peekHarvestAt") &&
      sceneApp.includes("commitHarvestAt") &&
      sceneApp.includes("inventory_full"),
    ""
  );

  check(
    "harvest_prof",
    "收获熟练度：life_planting + harvestCount（仅入包成功）",
    sceneApp.includes("incrementSkillMoveUsage(PLANTING_SKILL_ID, 'harvest', n)") ||
      sceneApp.includes('incrementSkillMoveUsage(PLANTING_SKILL_ID, "harvest", n)'),
    "addAgricultureHarvestProficiency(placed)"
  );

  check(
    "no_shop",
    "无农业商店 UI",
    !/shop|金钱|money|buySeed/i.test(agPanel),
    ""
  );

  check(
    "seeds_backpack",
    "种子列表仅背包：listSeeds",
    playerItems.includes("function listSeeds") &&
      sceneApp.includes("API.listSeeds"),
    ""
  );

  check(
    "npc_entry",
    "藏身处 NPC 入口",
    mapJson.agriculture_station_interact_npc_by_cell &&
      Object.values(mapJson.agriculture_station_interact_npc_by_cell).includes(
        "npc.station.agriculture_base"
      ) &&
      npcJson.mainMenu &&
      npcJson.mainMenu.showOpenAgriculturePanel === true,
    ""
  );

  check(
    "save_roundtrip",
    "存档 agriculture_map",
    saveSys.includes("agriculture_map") &&
      saveSys.includes("agriculture_map_state"),
    "见 test-agriculture-save.mjs"
  );

  const buriedJar = buildCosts.builds && buildCosts.builds.buried_pot_jar;
  const usesPicklingJar =
    buriedJar &&
    Array.isArray(buriedJar.inputs) &&
    buriedJar.inputs.some((i) => i.item_id === "tool_pickling_jar_cooking");
  check(
    "build_costs_jar",
    "埋瓮扣 tool_pickling_jar_cooking（广口密封腌缸，贴厌氧埋瓮）",
    usesPicklingJar,
    ""
  );

  const mapTest = spawnSync(process.execPath, ["tools/test-agriculture-map.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  check(
    "test_map",
    "node tools/test-agriculture-map.mjs",
    mapTest.status === 0,
    (mapTest.stdout || mapTest.stderr || "").trim()
  );

  const saveTest = spawnSync(process.execPath, ["tools/test-agriculture-save.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  check(
    "test_save",
    "node tools/test-agriculture-save.mjs",
    saveTest.status === 0,
    (saveTest.stdout || saveTest.stderr || "").trim()
  );

  const e2eTest = spawnSync(process.execPath, ["tools/test-agriculture-e2e-chain.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  check(
    "test_e2e_chain",
    "仿真全链路 test-agriculture-e2e-chain.mjs",
    e2eTest.status === 0,
    (e2eTest.stdout || e2eTest.stderr || "").trim()
  );

  check(
    "apply_task",
    "工程完成 applyTask 已定义",
    agMap.includes("function applyTask(st, task)") &&
      agMap.includes("task.type === 'build_buried_pot_jar'"),
    ""
  );

  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    if (!c.ok) failed += 1;
    console.log(`[${mark}] ${c.label}${c.detail ? " — " + c.detail : ""}`);
  }

  console.log("");
  console.log("需浏览器手测（本脚本不覆盖）：");
  console.log("  - 全链路：开垦→挖渠→文丘里→埋瓮→客土→带建造物播种→成熟收获");
  console.log("  - 关面板野外 tick 后作物变化肉眼确认");
  console.log("  - 开面板工程完成与体力消耗体感确认");

  if (failed > 0) {
    process.exitCode = 1;
    console.error(`\n${failed} 项未通过`);
  } else {
    console.log("\n自动核对项全部通过（共 " + checks.length + " 项）");
  }
}

main();
