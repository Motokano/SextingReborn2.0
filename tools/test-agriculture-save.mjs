/**
 * A2 验收：agriculture_map 存档 round-trip 与缺字段迁移。
 * 运行：node tools/test-agriculture-save.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadAgricultureMap() {
  const code = fs.readFileSync(path.join(root, "js", "agriculture-map.js"), "utf8");
  const fn = new Function("globalThis", code + "\n;return globalThis.AgricultureMap;");
  const g = {};
  fn(g);
  return g.AgricultureMap;
}

function loadSaveSystem(ctx) {
  const code = fs.readFileSync(path.join(root, "js", "save-system.js"), "utf8");
  vm.runInNewContext(code, ctx, { filename: "save-system.js" });
  return ctx.SaveSystem;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeMinimalSnapshot(overrides) {
  return Object.assign({
    schemaVersion: 1,
    saveGeneration: 0,
    savedAt: Date.now(),
    time: { totalTicks: 100 },
    player: {
      engine: { mapId: "hideout", x: 5, y: 5 },
      characterAttributes: {},
      survival: {},
      inventoryEquipment: {},
      sceneUi: { action_bar_slots: [null, null, null, null], known_cooking_recipe_ids: [] }
    },
    buffs: null,
    compost: null
  }, overrides || {});
}

function main() {
  const AM = loadAgricultureMap();
  const st = AM.createDefaultState();
  st.tick = 42; /* 故意写旧值，读档后应由世界时间覆盖 */
  st.map[3][3].tilled = true;
  st.map[3][3].soilId = "soil_sandy";
  st.task = { type:'remove_buried_pot_jar', x:4, y:4, progress:3, paused:false,
    paymentMeta:{ spec:{ task_ticks:10, stamina_per_tick:5, refund_inputs_on_cancel:true }, consumed:[{item_id:'ore_clay_raw',count:1}] } };

  const ctx = {
    GameTime: {
      getState: () => ({ totalTicks: 100 }),
      reset: (x) => { ctx._time = x; }
    },
    GameEngine: {
      getState: () => ({ mapId: "hideout", x: 5, y: 5 }),
      setState: () => {}
    },
    CharacterAttributes: {
      getState: () => ({}),
      setState: () => {},
      recalcCharacterStats: () => {}
    },
    Survival: { getState: () => ({}), setState: () => {} },
    InventoryEquipment: { getState: () => ({}), setState: () => {} },
    SceneCtx: {
      agriculture_map_state: st,
      getActionBarSlots: () => [null, null, null, null],
      getFacingDir: () => 0
    },
    AgricultureMap: AM,
    SceneApp: {
      getAgricultureMapState: () => ctx.SceneCtx.agriculture_map_state,
      setAgricultureMapState: (s) => { ctx.SceneCtx.agriculture_map_state = s; }
    }
  };

  const SaveSystem = loadSaveSystem(ctx);
  const snap = SaveSystem.buildSnapshotForDebug();
  assert(snap && snap.agriculture_map, "buildSnapshot 应含 agriculture_map");
  assert(snap.agriculture_map.schema_version === 2, "schema_version 应为 2");
  assert(snap.agriculture_map.state.tick === 100, "存档 tick 应镜像世界 totalTicks");
  assert(snap.agriculture_map.state.map[3][3].tilled === true, "格 tilled 应持久化");
  assert(snap.player.sceneUi.action_bar_slots.length === 4, "sceneUi 不应破坏");

  ctx.SceneCtx.agriculture_map_state = AM.createDefaultState();
  const ok = SaveSystem.applySnapshotForDebug(snap);
  assert(ok, "applySnapshot 应成功");
  const restored = ctx.SceneCtx.agriculture_map_state;
  assert(restored.tick === 100, "读档后 tick 应对齐世界 totalTicks（忽略档内旧 tick）");
  assert(restored.map[3][3].tilled === true, "读档后格 tilled 一致");
  assert(restored.map[3][3].soilId === "soil_sandy", "读档后 soilId 一致");
  assert(restored.task && restored.task.progress === 3 && restored.task.paymentMeta.consumed.length === 1, "在建工程与取消返料信息应持久化");

  const legacyAgriculture = AM.createDefaultState();
  delete legacyAgriculture.agricultureSupplyVersion;
  legacyAgriculture.map[1][1].kind = 'venturi_fertilizer';
  legacyAgriculture.map[1][1].venturiLiquid = { itemId:'liquid_seaweed_extract', effectDurationTicks:5000, effectTicksRemaining:2500 };
  const legacyV1 = makeMinimalSnapshot({ agriculture_map:{ schema_version:1, state:legacyAgriculture } });
  assert(SaveSystem.applySnapshotForDebug(legacyV1), 'v1 农业档应可迁移');
  assert(ctx.SceneCtx.agriculture_map_state.agricultureSupplyVersion === 2, '旧农业档应升级规则版本');
  assert(ctx.SceneCtx.agriculture_map_state.map[1][1].venturiLiquid.nutrientRemaining === 1200, '旧海藻精时间应按比例折算储量');

  ctx.SceneCtx.agriculture_map_state = null;
  const legacy = makeMinimalSnapshot();
  delete legacy.agriculture_map;
  const okLegacy = SaveSystem.applySnapshotForDebug(legacy);
  assert(okLegacy, "旧档无 agriculture_map 应可读");
  assert(ctx.SceneCtx.agriculture_map_state && Array.isArray(ctx.SceneCtx.agriculture_map_state.map), "缺字段应补默认图");
  assert(ctx.SceneCtx.agriculture_map_state.map.length === 11, "默认图 11 行");

  console.log("test-agriculture-save: OK");
}

main();
