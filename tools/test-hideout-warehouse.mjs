/**
 * hideout_warehouse 单元测试：叠堆、满格、装备实例往返、取出顺序、存档。
 * 运行：node tools/test-hideout-warehouse.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadHideoutWarehouse(ctx) {
  const code = fs.readFileSync(path.join(root, "js", "hideout-warehouse.js"), "utf8");
  vm.runInNewContext(code, ctx, { filename: "hideout-warehouse.js" });
  return ctx.HideoutWarehouse;
}

function loadSaveSystem(ctx) {
  const code = fs.readFileSync(path.join(root, "js", "save-system.js"), "utf8");
  vm.runInNewContext(code, ctx, { filename: "save-system.js" });
  return ctx.SaveSystem;
}

function makeMockIE(opts) {
  const o = opts || {};
  const templates = o.templates || {};
  const state = {
    inventory_pocket: o.pocket || [null, null],
    inventory_vest: o.vest || [null, null],
    inventory_backpack: o.backpack || [null, null, null],
    inventory_vehicle: o.vehicle || [null],
    bound_vehicle_id: o.bound_vehicle_id || null,
    equipment: o.equipment || { backpack: o.backpackEquip || null }
  };
  const placeLog = [];

  return {
    state,
    placeLog,
    getState() {
      return JSON.parse(JSON.stringify(state));
    },
    setState(next) {
      Object.assign(state, next);
    },
    getItemTemplate(id) {
      return templates[id] || null;
    },
    getPocketArray() {
      return state.inventory_pocket;
    },
    getVestArray() {
      return state.inventory_vest;
    },
    getBackpackArray() {
      return state.inventory_backpack;
    },
    getBackpackSlots() {
      return state.inventory_backpack.length;
    },
    getVestSlots() {
      return state.inventory_vest.length;
    },
    getPocketSlots() {
      return state.inventory_pocket.length;
    },
    putItemIntoDefaultContainer(item) {
      placeLog.push({ action: "put", item: JSON.parse(JSON.stringify(item)) });
      if (o.putSequence) {
        for (const step of o.putSequence) {
          if (step === "backpack" && state.inventory_backpack.some((c) => !c)) {
            const i = state.inventory_backpack.findIndex((c) => !c);
            state.inventory_backpack[i] = JSON.parse(JSON.stringify(item));
            return { placed: true, container: "backpack", index: i };
          }
          if (step === "vehicle" && state.bound_vehicle_id) {
            const i = state.inventory_vehicle.findIndex((c) => !c);
            if (i >= 0) {
              state.inventory_vehicle[i] = JSON.parse(JSON.stringify(item));
              return { placed: true, container: "vehicle", index: i };
            }
          }
          if (step === "vest" && state.inventory_vest.some((c) => !c)) {
            const i = state.inventory_vest.findIndex((c) => !c);
            state.inventory_vest[i] = JSON.parse(JSON.stringify(item));
            if (state.inventory_vest[i].count > 1) state.inventory_vest[i].count = 1;
            return { placed: true, container: "vest", index: i };
          }
          if (step === "pocket" && state.inventory_pocket.some((c) => !c)) {
            const i = state.inventory_pocket.findIndex((c) => !c);
            state.inventory_pocket[i] = JSON.parse(JSON.stringify(item));
            if (state.inventory_pocket[i].count > 1) state.inventory_pocket[i].count = 1;
            return { placed: true, container: "pocket", index: i };
          }
        }
        return { placed: false, dropped: true };
      }
      const i = state.inventory_backpack.findIndex((c) => !c);
      if (i >= 0) {
        state.inventory_backpack[i] = JSON.parse(JSON.stringify(item));
        return { placed: true, container: "backpack", index: i };
      }
      return { placed: false, dropped: true };
    },
    addItemToGround(mapId, x, y, item) {
      placeLog.push({ action: "ground", mapId, x, y, item: JSON.parse(JSON.stringify(item)) });
    },
    takeItemFromContainer(containerType, index) {
      const key = containerType === "vehicle" ? "inventory_vehicle"
        : containerType === "backpack" ? "inventory_backpack"
          : containerType === "vest" ? "inventory_vest"
            : containerType === "pocket" ? "inventory_pocket" : null;
      if (!key || index < 0 || index >= state[key].length) {
        return { success: false };
      }
      const cell = state[key][index];
      if (!cell || !cell.item_id) return { success: false };
      const have = cell.count != null ? Math.max(1, Math.floor(Number(cell.count))) : 1;
      const item = JSON.parse(JSON.stringify(cell));
      item.count = 1;
      if (have <= 1) {
        state[key][index] = null;
      } else {
        cell.count = have - 1;
      }
      return { success: true, item };
    }
  };
}

function loadUpgradeTable() {
  return JSON.parse(fs.readFileSync(path.join(root, "data", "warehouse-upgrades.json"), "utf8"));
}

function testStackMerge(HW, ctx) {
  const templates = {
    wood_bits: { stack_limit: 99 }
  };
  ctx.InventoryEquipment = { getItemTemplate: (id) => templates[id] || null };

  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());

  const r1 = HW.depositFromInstance({ item_id: "wood_bits", count: 10 });
  assert(r1.ok, "首次存入应成功");
  assert(HW.getUsedCount() === 1, "应占 1 格");

  const r2 = HW.depositFromInstance({ item_id: "wood_bits", count: 5 });
  assert(r2.ok, "叠堆存入应成功");
  assert(HW.getUsedCount() === 1, "叠堆后仍 1 格");
  assert(HW.countItem("wood_bits") === 15, "count 应为 15");

  const st = HW.getState();
  assert(st.slots[r1.slotIndex].count === 15, "同格 count 合并为 15");
}

function testFullReject(HW, ctx) {
  HW.setUpgradeTable({ base_capacity: 2, base_free_qol_ids: ["deposit_auto_stack"] });
  HW.setState({ capacity: 2, slots: [null, null], unlocked_qol_ids: ["deposit_auto_stack"], unlocked_upgrade_ids: [], settings: { prefer_deduct_warehouse: false } });

  const templates = { a: { stack_limit: 1 }, b: { stack_limit: 1 }, c: { stack_limit: 1 } };
  ctx.InventoryEquipment = { getItemTemplate: (id) => templates[id] || null };

  assert(HW.depositFromInstance({ item_id: "a", count: 1 }).ok, "第 1 格");
  assert(HW.depositFromInstance({ item_id: "b", count: 1 }).ok, "第 2 格");
  const fail = HW.depositFromInstance({ item_id: "c", count: 1 });
  assert(!fail.ok && fail.reason === "warehouse_full", "满格应拒绝");
  assert(!HW.canDepositInstance({ item_id: "c", count: 1 }), "canDeposit 满格 false");
}

function testEquipmentRoundTrip(HW, ctx, IE) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());
  ctx.InventoryEquipment = IE;

  const inst = {
    item_id: "armor_cloth_rag_shirt",
    count: 1,
    enchants: [{ id: "test_enchant", value: 2 }]
  };

  IE.state.inventory_pocket[0] = JSON.parse(JSON.stringify(inst));
  const dep = HW.depositFromContainer("pocket", 0);
  assert(dep.ok, "装备存入应成功");
  assert(IE.state.inventory_pocket[0] == null, "容器格应清空");

  const slotIdx = dep.slotIndex;
  const stored = HW.getState().slots[slotIdx];
  assert(stored.enchants[0].id === "test_enchant", "enchants 保留");

  const wd = HW.withdrawSlot(slotIdx);
  assert(wd.ok, "取出应成功");
  assert(wd.placed.container === "backpack", "默认进背包");
  assert(HW.getState().slots[slotIdx] == null, "仓格应变空");

  const out = IE.state.inventory_backpack[wd.placed.index];
  assert(out.item_id === inst.item_id, "item_id 一致");
  assert(out.enchants[0].value === 2, "取出 enchants 一致");
}

function testWithdrawOrder(HW, ctx) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());

  const IE = makeMockIE({
    backpack: [null],
    bound_vehicle_id: "cart_1",
    vehicle: [null],
    vest: [null],
    pocket: [null],
    putSequence: ["backpack", "vehicle", "vest", "pocket"]
  });
  ctx.InventoryEquipment = IE;
  ctx.GameEngine = { getState: () => ({ mapId: "hideout", x: 1, y: 2 }) };

  HW.depositFromInstance({ item_id: "wood_bits", count: 1 });
  const w1 = HW.withdrawSlot(0);
  assert(w1.placed.container === "backpack", "优先背包");

  HW.depositFromInstance({ item_id: "wood_bamboo_green", count: 1 });
  IE.state.inventory_backpack[0] = { item_id: "fill", count: 1 };
  const w2 = HW.withdrawSlot(0);
  assert(w2.placed.container === "vehicle", "背包满则载具");

  HW.depositFromInstance({ item_id: "wood_cork", count: 1 });
  IE.state.inventory_backpack[0] = { item_id: "fill", count: 1 };
  IE.state.inventory_vehicle[0] = { item_id: "fill2", count: 1 };
  const w3 = HW.withdrawSlot(0);
  assert(w3.placed.container === "vest", "载具满则背心");
}

function testSaveRoundTrip() {
  const upgradeTable = loadUpgradeTable();
  const ctx = {
    GameTime: { getState: () => ({ totalTicks: 50 }), reset: () => {} },
    GameEngine: { getState: () => ({ mapId: "hideout", x: 0, y: 0 }), setState: () => {} },
    CharacterAttributes: { getState: () => ({}), setState: () => {}, recalcCharacterStats: () => {} },
    Survival: { getState: () => ({}), setState: () => {} },
    InventoryEquipment: { getState: () => ({}), setState: () => {} },
    SceneCtx: { getActionBarSlots: () => [null, null, null, null], getFacingDir: () => 0 }
  };

  const HW = loadHideoutWarehouse(ctx);
  ctx.HideoutWarehouse = HW;
  HW.setUpgradeTable(upgradeTable);
  HW.setState(HW.createDefaultState());
  HW.depositFromInstance({ item_id: "wood_bits", count: 3 });

  const SaveSystem = loadSaveSystem(ctx);
  const snap = SaveSystem.buildSnapshotForDebug();
  assert(snap.hideout_warehouse, "snapshot 应含 hideout_warehouse");
  assert(snap.hideout_warehouse.capacity === 100, "capacity 100");
  assert(snap.hideout_warehouse.slots.length === 100, "slots 长度一致");

  HW.setState(HW.createDefaultState());
  assert(HW.countItem("wood_bits") === 0, "重置后为空");

  const ok = SaveSystem.applySnapshotForDebug(snap);
  assert(ok, "读档成功");
  assert(HW.countItem("wood_bits") === 3, "读档后物品恢复");

  const legacy = {
    schemaVersion: 1,
    saveGeneration: 0,
    savedAt: Date.now(),
    time: { totalTicks: 0 },
    player: {
      engine: { mapId: "hideout", x: 0, y: 0 },
      characterAttributes: {},
      survival: {},
      inventoryEquipment: {},
      sceneUi: { action_bar_slots: [null, null, null, null] }
    }
  };
  HW.setState({ capacity: 5, slots: [null, null, null, null, null], unlocked_qol_ids: [], unlocked_upgrade_ids: [], settings: {} });
  assert(SaveSystem.applySnapshotForDebug(legacy), "旧档无 hideout_warehouse 可读");
  assert(HW.getCapacity() === 100, "缺字段迁移为默认 capacity");
  assert(HW.getState().slots.length === 100, "缺字段迁移 slots 长度");
}

function testUnlockUpgrade(HW) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());
  assert(HW.getCapacity() === 100, "初始 100 格");

  const r = HW.unlockUpgrade("U-A1");
  assert(r.ok, "U-A1 应可解锁（A0 默认满足）");
  assert(HW.getCapacity() === 200, "扩仓后 200 格");
  assert(HW.hasQoL("capacity_200"), "应获得 capacity_200 qol");
  assert(HW.getState().slots.length === 200, "slots 扩展至 200");
}

function makeMockIEWithItems(itemsByContainer, templates) {
  const IE = makeMockIE({ templates: templates || {} });
  if (itemsByContainer.pocket) IE.state.inventory_pocket = itemsByContainer.pocket.slice();
  if (itemsByContainer.backpack) IE.state.inventory_backpack = itemsByContainer.backpack.slice();
  return IE;
}

function testRoutePickAndDiscovery(HW) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());

  assert(HW.needsInitialRoutePick(), "新档应待三选一");
  assert(HW.listVisibleUpgradeIds().length === 0, "未发现节点完全隐藏");
  assert(HW.getUpgradeStatus("U-C1") === "hidden", "未选路线时 C1 隐藏");

  const pick = HW.pickInitialRoute("U-A1");
  assert(pick.ok, "应可选扩容路线");
  assert(!HW.needsInitialRoutePick(), "选路线后不再三选一");
  assert(HW.listVisibleUpgradeIds().includes("U-A1"), "仅发现所选路线");
  assert(!HW.listVisibleUpgradeIds().includes("U-C1"), "未选路线仍隐藏");
  assert(HW.getUpgradeStatus("U-A1") === "insufficient", "发现后无材料为不足");

  const badPick = HW.pickInitialRoute("U-C1");
  assert(!badPick.ok, "不可二次选路线");
}

function testUpgradeStatusAndStart(HW, ctx) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());
  assert(HW.pickInitialRoute("U-A1").ok, "先选扩容路线");

  const uA1 = HW.getUpgradeEntry("U-A1");
  assert(uA1, "U-A1 配置存在");
  assert(HW.getUpgradeStatus("U-A1") === "insufficient", "无材料时应材料不足");

  const templates = { wood_bits: { stack_limit: 99 } };
  ctx.InventoryEquipment = makeMockIEWithItems({
    pocket: [
      { item_id: "wood_bits", count: 50 },
      { item_id: "wood_bamboo_green", count: 10 },
      { item_id: "supply_rope_hemp_short", count: 10 },
      { item_id: "wood_shrub_dry", count: 10 }
    ]
  }, templates);
  ctx.Survival = {
    _stamina: 100,
    getState() { return { stamina: this._stamina }; },
    setState(p) { if (p && p.stamina != null) this._stamina = p.stamina; }
  };

  assert(HW.getUpgradeStatus("U-A1") === "available", "材料+体力足够时可扩建");

  const start = HW.startUpgrade("U-A1");
  assert(start.ok, "启动 U-A1 应成功");
  assert(HW.getActiveUpgradeTask(), "应有 active_upgrade_task");
  assert(HW.getUpgradeStatus("U-A1") === "in_progress", "状态应为施工中");
  assert(HW.countItemEverywhere("wood_bits") === 40, "应扣走 10 木屑");

  const failAgain = HW.startUpgrade("U-C1");
  assert(!failAgain.ok && failAgain.reason === "task_busy", "进行中不可再开");

  let ticks = 0;
  while (HW.getActiveUpgradeTask() && ticks < 20) {
    const tr = HW.tickConstructionTask({
      getStamina: () => ctx.Survival.getState().stamina,
      setStamina: (v) => ctx.Survival.setState({ stamina: v })
    });
    assert(tr.advanced, "每 tick 应推进: " + ticks);
    ticks += 1;
    if (tr.completed) break;
  }
  assert(HW.getCapacity() === 200, "U-A1 完工后 200 格");
  assert(HW.getUpgradeStatus("U-A1") === "completed", "U-A1 已部署");
  assert(!HW.getActiveUpgradeTask(), "任务应清空");
  assert(HW.listVisibleUpgradeIds().includes("U-A2"), "完成 A1 后发现 A2");
  assert(!HW.listVisibleUpgradeIds().includes("U-C1"), "未选路线仍不可见");

  const repeat = HW.startUpgrade("U-A1");
  assert(!repeat.ok && repeat.reason === "already_completed", "已完成不可重复扣料");
}

function testUpgradeSaveRoundTrip(HW, ctx) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());
  assert(HW.pickInitialRoute("U-A1").ok, "存档测试先选路线");
  ctx.InventoryEquipment = makeMockIEWithItems({
    pocket: [
      { item_id: "wood_bits", count: 50 },
      { item_id: "wood_bamboo_green", count: 10 },
      { item_id: "supply_rope_hemp_short", count: 10 },
      { item_id: "wood_shrub_dry", count: 10 }
    ]
  });
  ctx.Survival = {
    _stamina: 100,
    getState() { return { stamina: this._stamina }; },
    setState(p) { if (p && p.stamina != null) this._stamina = p.stamina; }
  };
  assert(HW.startUpgrade("U-A1").ok, "启动工程");
  const snapTask = HW.getState().active_upgrade_task;
  assert(snapTask && snapTask.upgrade_id === "U-A1", "存档含 active_upgrade_task");

  HW.setState(HW.createDefaultState());
  HW.setState({
    ...HW.createDefaultState(),
    active_upgrade_task: snapTask
  });
  assert(HW.getActiveUpgradeTask().upgrade_id === "U-A1", "读档恢复工程");
}

function enableColdStorage(HW) {
  const st = HW.getState();
  const qols = st.unlocked_qol_ids.slice();
  if (!qols.includes("qol_cold_storage")) qols.push("qol_cold_storage");
  HW.setState({ ...st, unlocked_qol_ids: qols });
}

function testSpoilageWarehouseTicks(HW, ctx) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());
  ctx.InventoryEquipment = {
    getItemTemplate(id) {
      if (id === "test_perishable") return { stack_limit: 10, spoilage_ticks: 5 };
      return null;
    }
  };

  HW.depositFromInstance({ item_id: "test_perishable", count: 1 });
  let cell = HW.getState().slots[0];
  assert(cell.spoilage_elapsed_ticks === 0, "存入后 elapsed 初始为 0");

  HW.tickSpoilage();
  HW.tickSpoilage();
  HW.tickSpoilage();
  cell = HW.getState().slots[0];
  assert(cell && cell.spoilage_elapsed_ticks === 3, "无冷藏时仓内 elapsed 随 tick 增");

  enableColdStorage(HW);
  assert(HW.hasColdStorage(), "冷藏 QoL 生效");
  HW.tickSpoilage();
  HW.tickSpoilage();
  cell = HW.getState().slots[0];
  assert(cell && cell.spoilage_elapsed_ticks === 3, "U-G3 后仓内 elapsed 冻结");

  HW.tickSpoilage();
  HW.tickSpoilage();
  assert(HW.getState().slots[0].spoilage_elapsed_ticks === 3, "冷藏开启后不再递增");
}

function testSpoilageWithdrawContinues(HW, ctx) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());

  const IE = makeMockIE({
    templates: { test_perishable: { stack_limit: 1, spoilage_ticks: 4 } },
    backpack: [null]
  });
  ctx.InventoryEquipment = IE;
  ctx.GameEngine = { getState: () => ({ mapId: "hideout", x: 0, y: 0 }) };

  HW.depositFromInstance({ item_id: "test_perishable", count: 1 });
  HW.tickSpoilage();
  assert(HW.getState().slots[0].spoilage_elapsed_ticks === 1, "仓内先计 1 tick");

  const wd = HW.withdrawSlot(0);
  assert(wd.ok, "取出成功");
  const out = IE.state.inventory_backpack[wd.placed.index];
  assert(out.spoilage_elapsed_ticks === 1, "取出后 elapsed 保留");

  HW.tickSpoilage();
  const out2 = IE.state.inventory_backpack[wd.placed.index];
  assert(out2 && out2.spoilage_elapsed_ticks === 2, "取出后身上继续计时");
}

function testSpoilageExpires(HW, ctx) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());
  ctx.InventoryEquipment = {
    getItemTemplate(id) {
      if (id === "test_short_rot") return { stack_limit: 1, spoilage_ticks: 2 };
      return null;
    }
  };

  HW.depositFromInstance({ item_id: "test_short_rot", count: 1 });
  HW.tickSpoilage();
  assert(HW.getState().slots[0], "第 1 tick 仍在");
  HW.tickSpoilage();
  assert(HW.getState().slots[0] == null, "达到 spoilage_ticks 后移除");
  assert(HW.getUsedCount() === 0, "腐败后格位清空");
}

function testSpoilageSaveRoundTrip(HW, ctx) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());
  ctx.InventoryEquipment = {
    getItemTemplate(id) {
      if (id === "test_perishable") return { stack_limit: 1, spoilage_ticks: 10 };
      return null;
    }
  };

  HW.depositFromInstance({ item_id: "test_perishable", count: 1 });
  HW.tickSpoilage();
  HW.tickSpoilage();
  const snap = HW.getState();
  assert(snap.slots[0].spoilage_elapsed_ticks === 2, "tick 后 elapsed=2");

  HW.setState(HW.createDefaultState());
  HW.setState(snap);
  assert(HW.getState().slots[0].spoilage_elapsed_ticks === 2, "读档保留 elapsed（离线不补算由全局 tick 冻结保证）");
}

function unlockQol(HW, qolId) {
  const st = HW.getState();
  if (!st.unlocked_qol_ids.includes(qolId)) {
    st.unlocked_qol_ids.push(qolId);
  }
  HW.setState(st);
}

function testOutpostWithdrawBlocked(HW, ctx) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());
  ctx.GameEngine = {
    getState: () => ({ mapId: "test_dungeon_floor_1", x: 0, y: 0 }),
    getMaps: () => ({ test_dungeon_floor_1: { is_dungeon: true } })
  };
  ctx.InventoryEquipment = makeMockIE({
    templates: { wood_bits: { stack_limit: 99 } },
    backpack: [null]
  });

  unlockQol(HW, "qol_dungeon_access");
  assert(HW.isOutpostMode(), "地牢 + 远驿 QoL → outpost 模式");

  HW.depositFromInstance({ item_id: "wood_bits", count: 3 });
  const wd = HW.withdrawSlot(0, 1);
  assert(!wd.ok && wd.reason === "outpost_withdraw_blocked", "远驿模式禁止取出");

  ctx.GameEngine = { getState: () => ({ mapId: "M0_Base_Inside_lv_1", x: 0, y: 0 }), getMaps: () => ({}) };
  assert(!HW.isOutpostMode(), "离开地牢后 outpost 关闭");
  const wd2 = HW.withdrawSlot(0, 1);
  assert(wd2.ok, "基地内可正常取出");
}

function testTidySlots(HW, ctx) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());
  ctx.InventoryEquipment = {
    getItemTemplate(id) {
      if (id === "wood_bits") return { stack_limit: 99, category: "material" };
      if (id === "ore_clay_raw") return { stack_limit: 99, category: "ore" };
      return null;
    }
  };

  assert(!HW.tidySlots().ok, "未解锁理仓时拒绝");

  HW.setState(HW.createDefaultState());
  unlockQol(HW, "qol_tidy_one_click");
  HW.depositFromInstance({ item_id: "wood_bits", count: 2 });
  HW.depositFromInstance({ item_id: "ore_clay_raw", count: 1 });
  HW.depositFromInstance({ item_id: "wood_bits", count: 3 });
  assert(HW.getUsedCount() === 2, "自动叠堆后占 2 格");

  const tidy = HW.tidySlots();
  assert(tidy.ok, "理仓成功");
  assert(HW.getUsedCount() === 2, "理仓后仍 2 格");
  assert(HW.getState().slots[0].item_id === "wood_bits", "按 category 字母序：material 在 ore 前");
  assert(HW.getState().slots[1].item_id === "ore_clay_raw", "ore 在后");
  assert(HW.getState().slots[0].count === 5, "wood_bits 合并为 5");
}

function testSlotPinMeta(HW) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());
  HW.depositFromInstance({ item_id: "wood_bits", count: 1 });

  assert(!HW.toggleSlotStarred(0).ok, "未解锁封签/星标时拒绝");
  unlockQol(HW, "qol_lock_and_pin");

  const star = HW.toggleSlotStarred(0);
  assert(star.ok && star.starred, "可设星标");
  HW.setSlotWarehouseMeta(0, { locked: true });
  assert(HW.getState().slots[0].warehouse_locked, "可设封签");

  const wd = HW.withdrawSlot(0, 1);
  assert(!wd.ok && wd.reason === "slot_locked", "封签格禁止取出");
}

function testPreferDeductWarehouse(HW, ctx) {
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());
  ctx.InventoryEquipment = makeMockIEWithItems({
    pocket: [{ item_id: "wood_bits", count: 5 }]
  }, { wood_bits: { stack_limit: 99 } });

  HW.depositFromInstance({ item_id: "wood_bits", count: 10 });
  HW.setPreferDeductWarehouse(false);
  let pay = HW.consumeItems([{ item_id: "wood_bits", count: 3 }]);
  assert(pay.ok, "默认先扣身上应成功");
  assert(ctx.InventoryEquipment.state.inventory_pocket[0].count === 2, "身上应剩 2");
  assert(HW.countItem("wood_bits") === 10, "仓内仍 10");

  HW.setState(HW.createDefaultState());
  HW.depositFromInstance({ item_id: "wood_bits", count: 10 });
  ctx.InventoryEquipment.state.inventory_pocket[0] = { item_id: "wood_bits", count: 5 };
  HW.setPreferDeductWarehouse(true);
  pay = HW.consumeItems([{ item_id: "wood_bits", count: 3 }]);
  assert(pay.ok, "优先扣仓应成功");
  assert(HW.countItem("wood_bits") === 7, "仓内应剩 7");
  assert(ctx.InventoryEquipment.state.inventory_pocket[0].count === 5, "身上不变 5");
}

function loadAgriculturePlayerItems(ctx) {
  ctx.global = ctx;
  const code = fs.readFileSync(path.join(root, "js", "agriculture-player-items.js"), "utf8");
  vm.runInNewContext(code, ctx, { filename: "agriculture-player-items.js" });
  return ctx.AgriculturePlayerItems;
}

function testAgricultureConsumeViaWarehouse(HW, ctx) {
  const API = loadAgriculturePlayerItems(ctx);
  ctx.HideoutWarehouse = HW;
  HW.setUpgradeTable(loadUpgradeTable());
  HW.setState(HW.createDefaultState());
  ctx.InventoryEquipment = makeMockIEWithItems({
    pocket: [{ item_id: "wood_bits", count: 2 }]
  }, { wood_bits: { stack_limit: 99 } });
  HW.depositFromInstance({ item_id: "wood_bits", count: 8 });

  assert(API.countItemId("wood_bits") === 10, "农业计数应含仓+身");
  HW.setPreferDeductWarehouse(true);
  const pay = API.consumeInputs([{ item_id: "wood_bits", count: 4 }]);
  assert(pay.ok, "农业扣物应成功");
  assert(HW.countItem("wood_bits") === 4, "优先扣仓后仓剩 4");
  assert(ctx.InventoryEquipment.state.inventory_pocket[0].count === 2, "身上未动");

  const rows = API.listSeeds();
  assert(Array.isArray(rows), "listSeeds 返回数组");
}

function main() {
  const ctx = {};
  const HW = loadHideoutWarehouse(ctx);
  ctx.HideoutWarehouse = HW;

  testStackMerge(HW, ctx);
  testFullReject(HW, ctx);
  testEquipmentRoundTrip(HW, ctx, makeMockIE({ templates: { armor_cloth_rag_shirt: { stack_limit: 1, enchant_slots: 6 } } }));
  testWithdrawOrder(HW, ctx);
  testUnlockUpgrade(HW);
  testRoutePickAndDiscovery(HW);
  testUpgradeStatusAndStart(HW, ctx);
  testUpgradeSaveRoundTrip(HW, ctx);
  testSpoilageWarehouseTicks(HW, ctx);
  testSpoilageWithdrawContinues(HW, ctx);
  testSpoilageExpires(HW, ctx);
  testSpoilageSaveRoundTrip(HW, ctx);
  testOutpostWithdrawBlocked(HW, ctx);
  testTidySlots(HW, ctx);
  testSlotPinMeta(HW);
  testPreferDeductWarehouse(HW, ctx);
  testAgricultureConsumeViaWarehouse(HW, ctx);
  testSaveRoundTrip();

  console.log("test-hideout-warehouse: OK");
}

main();
