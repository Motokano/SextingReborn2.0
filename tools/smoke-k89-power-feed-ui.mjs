// 集成冒烟：畜牧面板「🔋塞电池」真实依赖链（InventoryEquipment 容器 → LivestockState 储能）。
// 直接复用 js/livestock-state.js + 真实 data/items.json + data/livestock-modules.json，
// 用最小 IE 桩模拟 doPowerFeed(listBatteriesInInventory→takeItemFromContainer→addPowerCharge) 的关键步，
// 验证：背包里有电池时能正确读取实例电量、整格清空、储能累加；无电池时给出正确提示分支。
import { readFileSync } from 'node:fs';

const items = JSON.parse(readFileSync(new URL('../data/items.json', import.meta.url), 'utf8'));
const modules = JSON.parse(readFileSync(new URL('../data/livestock-modules.json', import.meta.url), 'utf8')).modules;

// ---- 浏览器全局桩（与 smoke 一致）----
const g = { UIText: { t: (k) => k } };
globalThis.global = g;
globalThis.window = g;
// eslint-disable-next-line no-eval
(0, eval)(readFileSync(new URL('../js/livestock-state.js', import.meta.url), 'utf8'));
const LS = g.LivestockState;
if (!LS) { console.error('FAIL: LivestockState 未挂载'); process.exit(1); }
LS.setConfig({}, modules, {}, {}, {});

let bad = 0;
const ok = (name) => console.log('  ✓ ' + name);
const fail = (name, detail) => { console.error('FAIL: ' + name + (detail ? ' | ' + detail : '')); bad++; };

// 模板电量（与面板 doPowerFeed 一致）：优先实例 battery_charge；否则模板 battery_charge/capacity
function templateAmount(itemId) {
  const tpl = items[itemId];
  if (!tpl) return 0;
  if (tpl.battery_charge != null) return Number(tpl.battery_charge) || 0;
  if (tpl.battery_capacity != null) return Number(tpl.battery_capacity) || 0;
  return 0;
}

// ---- 最小 InventoryEquipment 桩（模拟三容器 + takeItemFromContainer + getItemTemplate）----
function makeIE(backpackCells, pocketCells) {
  const state = {
    inventory_backpack: (backpackCells || []).slice(),
    inventory_pocket: (pocketCells || []).slice(),
    inventory_vest: [],
    inventory_vehicle: []
  };
  const slots = { backpack: state.inventory_backpack.length, pocket: state.inventory_pocket.length, vest: 0, vehicle: 0 };
  return {
    getPocketArray: () => state.inventory_pocket.slice(0, slots.pocket).concat(new Array(Math.max(0, slots.pocket - state.inventory_pocket.length)).fill(null)),
    getVestArray: () => [],
    getBackpackArray: () => state.inventory_backpack.slice(0, slots.backpack).concat(new Array(Math.max(0, slots.backpack - state.inventory_backpack.length)).fill(null)),
    getVehicleArray: () => [],
    getItemTemplate: (id) => items[id] || null,
    takeItemFromContainer: (ct, idx) => {
      const arr = state['inventory_' + ct];
      if (!arr || idx < 0 || idx >= arr.length || !arr[idx]) return { item: null, success: false };
      const taken = { item_id: arr[idx].item_id, count: 1 };
      if (arr[idx].battery_charge != null) taken.battery_charge = arr[idx].battery_charge;
      arr[idx] = null;
      return { item: taken, success: true };
    }
  };
}

// ---- 复刻 livestock-panel.js 的 listBatteriesInInventory 收集逻辑 ----
function listBatteries(IE) {
  const out = [];
  const containers = [];
  if (IE.getPocketArray) containers.push(...IE.getPocketArray());
  if (IE.getVestArray) containers.push(...IE.getVestArray());
  if (IE.getBackpackArray) containers.push(...IE.getBackpackArray());
  if (IE.getVehicleArray) containers.push(...IE.getVehicleArray());
  containers.forEach((cell) => {
    if (!cell || !cell.item_id) return;
    if (String(cell.item_id).indexOf('battery_') !== 0) return;
    out.push({ item_id: cell.item_id, count: cell.count || 1 });
  });
  return out;
}

// ---- 复刻 doPowerFeed 的核心：找第一颗电池 → 读电量 → take → addPowerCharge ----
function doPowerFeed(IE, batteryId) {
  const containers = [
    { key: 'pocket', arr: IE.getPocketArray() },
    { key: 'vest', arr: IE.getVestArray() },
    { key: 'backpack', arr: IE.getBackpackArray() },
    { key: 'vehicle', arr: IE.getVehicleArray() }
  ];
  for (let c = 0; c < containers.length; c++) {
    const arr = containers[c].arr || [];
    for (let i = 0; i < arr.length; i++) {
      const cell = arr[i];
      if (cell && cell.item_id === batteryId) {
        const tpl = IE.getItemTemplate(batteryId);
        let amount = 0;
        if (cell.battery_charge != null) amount = Number(cell.battery_charge);
        else if (tpl && tpl.battery_charge != null) amount = Number(tpl.battery_charge);
        else if (tpl && tpl.battery_capacity != null) amount = Number(tpl.battery_capacity);
        if (!(amount > 0)) return { result: 'empty' };
        const taken = IE.takeItemFromContainer(containers[c].key, i);
        if (!taken || !taken.success) return { result: 'empty' };
        const r = LS.addPowerCharge(Math.floor(amount));
        return { result: 'ok', added: Math.floor(amount), charge: r.charge, tookCharge: taken.item.battery_charge != null ? taken.item.battery_charge : null };
      }
    }
  }
  return { result: 'no_battery' };
}

console.log('== 1) 背包有拾荒半电五号电池（实例电量 37）==');
{
  LS.setState({ power_charge: 10, arms: {}, axis: {}, zones: { z1:{grass_height:0.5,compaction:50,pollution:0}, z2:{grass_height:0.5,compaction:50,pollution:0}, z3:{grass_height:0.5,compaction:50,pollution:0}, z4:{grass_height:0.5,compaction:50,pollution:0} }, animals: [] });
  const IE = makeIE([{ item_id: 'battery_aa', battery_charge: 37, count: 1 }], []);
  const bats = listBatteries(IE);
  if (bats.length !== 1 || bats[0].item_id !== 'battery_aa') fail('应列出 1 颗五号', JSON.stringify(bats));
  else ok('listBatteries 命中 battery_aa');
  const r = doPowerFeed(IE, 'battery_aa');
  if (r.result !== 'ok' || r.added !== 37 || r.charge !== 47) fail('应整格塞入实例电量 37 → 储能 10+37=47', JSON.stringify(r));
  else ok('整格塞入实例电量 37（储能 47）');
  if (IE.getBackpackArray().filter(Boolean).length !== 0) fail('电池格应清空');
  else ok('该格已清空（物品消耗）');
}

console.log('== 2) 满电五号（无实例电量 → 用模板电池容量 100）==');
{
  LS.setState({ power_charge: 0, arms: {}, axis: {}, zones: { z1:{grass_height:0.5,compaction:50,pollution:0}, z2:{grass_height:0.5,compaction:50,pollution:0}, z3:{grass_height:0.5,compaction:50,pollution:0}, z4:{grass_height:0.5,compaction:50,pollution:0} }, animals: [] });
  const IE = makeIE([{ item_id: 'battery_aa', count: 1 }], []);
  const r = doPowerFeed(IE, 'battery_aa');
  if (r.result !== 'ok' || r.added !== 100 || r.charge !== 100) fail('模板满电应塞入 100', JSON.stringify(r));
  else ok('模板满电塞入 100（储能 100）');
}

console.log('== 3) 充电电池 400 / 蓄电池 1500 ==');
{
  const IE = makeIE([{ item_id: 'battery_rechargeable', count: 1 }, { item_id: 'battery_storage', count: 1 }], []);
  LS.setState({ power_charge: 0, arms: {}, axis: {}, zones: { z1:{grass_height:0.5,compaction:50,pollution:0}, z2:{grass_height:0.5,compaction:50,pollution:0}, z3:{grass_height:0.5,compaction:50,pollution:0}, z4:{grass_height:0.5,compaction:50,pollution:0} }, animals: [] });
  const r1 = doPowerFeed(IE, 'battery_rechargeable');
  const r2 = doPowerFeed(IE, 'battery_storage');
  if (r1.added !== 400 || r2.added !== 1500 || r2.charge !== 1900) fail('400+1500 应累计 1900', JSON.stringify([r1, r2]));
  else ok('充电 400 + 蓄电 1500 → 储能 1900');
}

console.log('== 4) 背包无电池 → no_battery 分支 ==');
{
  const IE = makeIE([{ item_id: 'wood_oak', count: 1 }], []);
  const r = doPowerFeed(IE, 'battery_aa');
  if (r.result !== 'no_battery') fail('无电池应返回 no_battery', JSON.stringify(r));
  else ok('无电池 → no_battery 提示分支');
}

console.log('== 5) 电量 0 电池（废电）→ empty 分支，不塞入 ==');
{
  const IE = makeIE([{ item_id: 'battery_aa', battery_charge: 0, count: 1 }], []);
  const r = doPowerFeed(IE, 'battery_aa');
  if (r.result !== 'empty') fail('0 电电池应拒绝', JSON.stringify(r));
  else ok('0 电电池拒绝（不塞入、不扣格）');
}

console.log(bad === 0 ? 'ALL PASS' : `${bad} FAIL`);
process.exit(bad === 0 ? 0 : 1);
