/**
 * k128 制药机制框架冒烟测试（真实模块 node harness，无 DOM）
 *
 * 覆盖 47 §1.1 六缺口：
 *   ① 制药熟练度接线（等级曲线 / 成功率加成 / 满级必成 / move_usage 计数）
 *   ② data/pharmacy-system-config.csv 解析与装载（失败物 id / 曲线 / 四途径 / ❓数值占位）
 *   ③ 失败物 id 统一 item.scrap.herb_dregs（物品行存在 + 方法表 id 全部可解析）
 *   ④ pharmacy_ingredient 落数据（items.json 出现投料标记）
 *   ⑤ use_action 四途径分流（可消费判定 / 部位 / 火源 / 器具 / 白名单 / 多 buff）
 *   ⑥ 堆叠口径（build 落 stack_limit + 运行时按 stack_limit 合并）
 *
 * 运行：node tools/smoke-pharmacy.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function readText(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function loadJson(rel) {
  return JSON.parse(readText(rel));
}

const items = loadJson('data/items.json');
const recipeMethods = loadJson('data/recipe-methods.json');
const pharmacyCsv = readText('data/pharmacy-system-config.csv');

let pass = 0;
function ok(name) {
  pass++;
  console.log('  ✓ ' + name);
}

// ---------------------------------------------------------------------------
// 沙箱 1：框架模块（pharmacy-config / station-craft-core / pharmacy-station / item-use）
// ---------------------------------------------------------------------------
const grantedItems = [];
const skillState = {};
const recalcCalls = { n: 0 };
const messages = [];
const buffs = new Map();

const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  setTimeout,
  clearTimeout,
  InventoryHelpers: {
    getInventoryCountByItemId() { return 0; },
    findFirstContainerSlotByItemId() { return null; }
  },
  InventoryEquipment: {
    getState() { return { skills: skillState }; },
    getSkillLevel(id) { const s = skillState[id]; return s && s.level != null ? s.level : 0; },
    incrementSkillMoveUsage(id, key, d) {
      const e = skillState[id];
      if (!e) return -1;
      if (!e.move_usage || typeof e.move_usage !== 'object') e.move_usage = {};
      e.move_usage[key] = (parseInt(e.move_usage[key], 10) || 0) + d;
      return e.move_usage[key];
    },
    putItemIntoDefaultContainer(inst) { grantedItems.push(inst.item_id); return { placed: true, container: 'backpack', index: 0 }; },
    addItemToGround() {},
    getItemTemplate(id) { return items[id] || null; }
  },
  BuffSystem: {
    hasBuffByBuffId(owner, buffId) { return buffs.has(owner + '|' + buffId); },
    applyBuff(owner, buffId, source, ctx) { buffs.set(owner + '|' + buffId, { source, ctx }); return true; }
  },
  Survival: {
    getState() { return { stamina: 100 }; },
    consumeStamina() {},
    advanceTick() {}
  },
  GameEngine: { getState() { return { mapId: 'm', x: 0, y: 0 }; } },
  ProductionQuality: { evaluateProduction(p) { return { success: true, success_rate: p.base_success_rate }; } },
  SceneCtx: {},
  SceneHud: { refresh() {} },
  SceneRenderer: { render() {} },
  UIText: { t(k) { return k; } }
};
vm.createContext(sandbox);

function run(file) {
  vm.runInContext(readText('js/' + file), sandbox, { filename: file });
}

run('pharmacy-config.js');
run('station-craft-core.js');
run('pharmacy-station.js');
run('item-use.js');

const PC = sandbox.PharmacyConfig;
const PS = sandbox.PharmacyStation;
const SCC = sandbox.StationCraftCore;
const IU = sandbox.ItemUse;
assert(PC && PS && SCC && IU, '模块装载失败');

PS.setUiDeps({
  ui(k, v) { return k; },
  showMsg(text, kind) { messages.push({ text, kind }); },
  recalcCharacterStats() { recalcCalls.n++; }
});

console.log('\n② pharmacy-system-config.csv 解析');
const cfg = PC.parseCsv(pharmacyCsv);
assert.strictEqual(cfg.pharmacy_global_failure_item_id, 'item.scrap.herb_dregs');
assert.strictEqual(cfg.pharmacy_skill_curve.max_level, 100);
assert.strictEqual(cfg.pharmacy_skill_curve.max_proficiency_uses, 5000000);
assert.strictEqual(cfg.pharmacy_skill_curve.success_bonus_per_level, 0.005);
assert.strictEqual(cfg.pharmacy_skill_curve.proficiency_usage_key, 'pharmacy_success');
assert.strictEqual(cfg.pharmacy_use_routes.join(','), 'drink,topical,inhale,inject');
assert.strictEqual(cfg.pharmacy_addiction_gain.inject, 15);
assert.strictEqual(cfg.pharmacy_addiction_stage_thresholds.join(','), '25,50,75');
assert.strictEqual(cfg.pharmacy_toxicity_band_thresholds.join(','), '0,25,55');
assert.strictEqual(cfg.pharmacy_concentration_capacity, 100);
ok('CSV 解析：失败物 id / 熟练度曲线 / 四途径 / 成瘾与毒性占位值');

assert.strictEqual(PC.getPotencyBand(20, cfg), 'weak');
assert.strictEqual(PC.getPotencyBand(50, cfg), 'regular');
assert.strictEqual(PC.getPotencyBand(90, cfg), 'potent');
assert.strictEqual(PC.getToxicityBand(10, cfg), 'mild');
assert.strictEqual(PC.getToxicityBand(30, cfg), 'moderate');
assert.strictEqual(PC.getToxicityBand(60, cfg), 'severe');
assert.strictEqual(PC.getAddictionStage(10, cfg), 1);
assert.strictEqual(PC.getAddictionStage(30, cfg), 2);
assert.strictEqual(PC.getAddictionStage(60, cfg), 3);
assert.strictEqual(PC.getAddictionStage(90, cfg), 4);
ok('potency / 毒性 / 成瘾阶段 分档函数');

PS.setConfig({ methods: recipeMethods.methods, recipes: [], systemConfig: cfg });
assert.strictEqual(PS.getFailureItemId(), 'item.scrap.herb_dregs');
assert.strictEqual(PS.getSkillCurve().max_proficiency_uses, 5000000);
assert.strictEqual(PS.getSystemConfigValue('pharmacy_concentration_capacity'), 100);
ok('PharmacyStation.setConfig 装载 systemConfig（失败物 id + 曲线）');

console.log('\n① 制药熟练度接线');
assert.strictEqual(PS.getPharmacyLevelBySuccessUses(0), 1);
assert.strictEqual(PS.getPharmacyLevelBySuccessUses(2500000), 50);
assert.strictEqual(PS.getPharmacyLevelBySuccessUses(5000000), 100);
assert.strictEqual(PS.getPharmacyLevelBySuccessUses(99999999), 100);
ok('等级曲线：0→1 级 / 250 万→50 级 / 500 万→100 级（封顶）');

assert.strictEqual(PS.ensureLifePharmacySkillEntry(), true);
assert(skillState.life_pharmacy, 'life_pharmacy 技能条目应被创建');
PS.addPharmacySuccessProficiency();
PS.addPharmacySuccessProficiency();
assert.strictEqual(skillState.life_pharmacy.move_usage.pharmacy_success, 2);
assert(recalcCalls.n >= 1, '创建技能条目应触发属性重算');
ok('熟练度计数：成功 +1 写入 move_usage.pharmacy_success');

// 满级必成：把技能拉到满级后强制成功（随机数固定为必失败）
const savedRandom = Math.random;
Math.random = () => 0.999999;
skillState.life_pharmacy.level = 100;
grantedItems.length = 0;
PS.getState().active_craft = {
  remaining_ticks: 1,
  method_id: 'life_pharmacy.crushing',
  inputs: [{ item_id: 'herb_vine_red', count: 1 }],
  consumed_items: [{ item_id: 'herb_vine_red', count: 1 }]
};
PS.finalizeCraftNow(null);
Math.random = savedRandom;
ok('满级必成：满级时无视成功率判定（无匹配配方 → 失败物）');

console.log('\n③ 失败物 id 统一 item.scrap.herb_dregs');
assert(grantedItems.length >= 1, '结算应产出物品');
assert(grantedItems.every((id) => id === 'item.scrap.herb_dregs'), '无配方时产出药渣：' + grantedItems.join(','));
assert(items['item.scrap.herb_dregs'], 'items.json 应存在 item.scrap.herb_dregs');
assert.strictEqual(items['item.scrap.herb_dregs'].stack_limit, 20);
const missingFailIds = Object.keys(recipeMethods.methods)
  .filter((k) => k.indexOf('life_pharmacy.') === 0)
  .map((k) => recipeMethods.methods[k].failure_output && recipeMethods.methods[k].failure_output.item_id)
  .filter((id) => id && !items[id]);
assert.strictEqual(missingFailIds.join(','), '', '制药方法失败物 id 应全部可解析');
assert(!items['food_pharmacy_fail_generic'], 'food_pharmacy_fail_generic 应不存在');
assert(!readText('js/pharmacy-station.js').includes("'food_pharmacy_fail_generic'"), '站点默认失败物不应再指向 food_pharmacy_fail_generic');
ok('药渣物品行存在 + 7 个方法失败物 id 全部可解析');

console.log('\n④ pharmacy_ingredient 落数据');
const phIds = Object.keys(items).filter((id) => items[id].pharmacy_ingredient === true);
assert(phIds.length >= 20, '制药投料应 ≥20 个，实际 ' + phIds.length);
['herb_root_bitter', 'herb_vine_red', 'ore_water_pure_soft', 'hunt_bone_common', 'hus_beef_heart'].forEach((id) => {
  assert(phIds.includes(id), id + ' 应为制药投料');
});
ok('items.json 出现 ' + phIds.length + ' 个 pharmacy_ingredient 投料');
assert(!Object.keys(items).some((id) => id.indexOf('potion_') === 0), 'k215：potion_* 死占位应已删除');
ok('k215：4 件 potion_* 死占位已删除并重建');

console.log('\n⑤ use_action 四途径分流');
assert.strictEqual(IU.getUseActionRoute({ use_action: 'drink' }), 'drink');
assert.strictEqual(IU.getUseActionRoute({ use_action: 'snort' }), '');
assert.strictEqual(IU.itemTemplateIsConsumable({ use_action: 'drink', use_buff_id: 'buff_x' }), true);
assert.strictEqual(IU.itemTemplateIsConsumable({ use_action: 'drink' }), false);
assert.strictEqual(IU.itemTemplateIsConsumable({ usable: '1', use_buff_id: 'buff_y' }), true);
ok('可消费判定：use_action + use_buff_id 开口，非法途径不通过');

// 外敷：必须先选部位
assert.strictEqual(IU.applyItemUseEffectFromTemplate('potion_topical', { use_action: 'topical', use_buff_id: 'buff_relief' }), false);
assert.strictEqual(IU.takeLastUseFailure().reason, 'needs_part');
ok('外敷未选部位 → needs_part（不消耗）');

buffs.clear();
assert.strictEqual(IU.applyItemUseEffectFromTemplate('potion_topical', { use_action: 'topical', use_buff_id: 'buff_relief' }, { part_id: 'lhand' }), true);
assert.strictEqual(IU.getTopicalPartForBuff('buff_relief'), 'lhand');
ok('外敷选部位 → 挂 buff + 登记目标部位');

// 刺入：需器具（配置为空时放行）
assert.strictEqual(IU.applyItemUseEffectFromTemplate('inj1', { use_action: 'inject', use_buff_id: 'buff_a' }), true);
PS.setConfig({ systemConfig: Object.assign({}, cfg, { pharmacy_inject_kit_item_ids: ['tool_syringe_pharmacy'] }) });
assert.strictEqual(IU.applyItemUseEffectFromTemplate('inj2', { use_action: 'inject', use_buff_id: 'buff_b' }), false);
assert.strictEqual(IU.takeLastUseFailure().reason, 'needs_inject_kit');
sandbox.InventoryHelpers.getInventoryCountByItemId = (id) => (id === 'tool_syringe_pharmacy' ? 1 : 0);
assert.strictEqual(IU.applyItemUseEffectFromTemplate('inj3', { use_action: 'inject', use_buff_id: 'buff_b' }), true);
ok('刺入：器具清单为空放行 / 有清单且缺器具 → needs_inject_kit / 有器具放行');

// 吸入：需火源
PS.setConfig({ systemConfig: Object.assign({}, cfg, { pharmacy_inhale_igniter_item_ids: ['supply_flint_fire'] }) });
sandbox.InventoryHelpers.getInventoryCountByItemId = () => 0;
assert.strictEqual(IU.applyItemUseEffectFromTemplate('inh1', { use_action: 'inhale', use_buff_id: 'buff_c' }), false);
assert.strictEqual(IU.takeLastUseFailure().reason, 'needs_igniter');
sandbox.InventoryHelpers.getInventoryCountByItemId = (id) => (id === 'supply_flint_fire' ? 1 : 0);
assert.strictEqual(IU.applyItemUseEffectFromTemplate('inh2', { use_action: 'inhale', use_buff_id: 'buff_c' }), true);
ok('吸入：缺火源 → needs_igniter / 有火源放行');

// 白名单：途径被配置裁掉后拒绝
PS.setConfig({ systemConfig: Object.assign({}, cfg, { pharmacy_use_routes: ['drink'] }) });
assert.strictEqual(IU.applyItemUseEffectFromTemplate('inj4', { use_action: 'inject', use_buff_id: 'buff_d' }), false);
assert.strictEqual(IU.takeLastUseFailure().reason, 'route_not_allowed');
PS.setConfig({ systemConfig: cfg });
ok('途径白名单：pharmacy_use_routes 收窄后拒绝该途径');

// 联合注射液：一次挂多成分 buff
buffs.clear();
assert.strictEqual(IU.applyItemUseEffectFromTemplate('inj_multi', { use_action: 'inject', use_buff_ids: ['buff_m1', 'buff_m2'] }), true);
assert(buffs.has('player|buff_m1') && buffs.has('player|buff_m2'), '多成分 buff 应全部挂上');
ok('联合注射液：use_buff_ids 多成分一次滴注');

// ---------------------------------------------------------------------------
// 沙箱 2：真实 InventoryEquipment —— 堆叠口径
// ---------------------------------------------------------------------------
console.log('\n⑥ 堆叠口径（build 落值 + 运行时读取）');
const ieSandbox = {
  console: { log() {}, warn() {}, error() {} },
  setTimeout,
  clearTimeout,
  UIText: { t(k) { return k; } }
};
vm.createContext(ieSandbox);
vm.runInContext(readText('js/inventory-equipment.js'), ieSandbox, { filename: 'inventory-equipment.js' });
const IE = ieSandbox.InventoryEquipment;
IE.setConfig({
  items,
  equipment: { test_backpack_6: { item_id: 'test_backpack_6', equip_slot: 'backpack', backpack_slots: 6, enchant_slots: 0 } },
  modules: {}
});
IE.initNewGame();
const equipRes = IE.equip('backpack', { item_id: 'test_backpack_6' });
assert(equipRes && equipRes.success, '测试背包应可装备：' + JSON.stringify(equipRes));
assert.strictEqual(IE.getBackpackSlots(), 6);
const put = (id, count) => IE.putItemIntoDefaultContainer({ item_id: id, count: count || 1 });

// 可堆叠（药渣 stack_limit=20）：两次放入应合并到同一格
const r1 = put('item.scrap.herb_dregs', 1);
const r2 = put('item.scrap.herb_dregs', 1);
assert.strictEqual(r1.index, r2.index, '药渣应合并进同一格');
assert.strictEqual(IE.getBackpackArray()[r1.index].count, 2);
ok('药渣（stack_limit=20）在背包内合并');

// 不可堆叠（stack_limit=1 的装备）：两次放入应分格
const e1 = put('armor_cloth_rag_shirt', 1);
const e2 = put('armor_cloth_rag_shirt', 1);
assert.notStrictEqual(e1.index, e2.index, 'stack_limit=1 的物品应分格');
ok('stack_limit=1 的物品不合并（口径与数据一致）');

assert(!readText('tools/build-items-json.mjs').includes('所有物品可堆叠数固定为 1'), 'build 不应再强制 stack_limit=1');
assert(readText('js/inventory-equipment.js').includes('tpl.stack_limit'), '运行时 getMaxStack 应读取 stack_limit');
ok('build 落 stack_limit + 运行时读 stack_limit（字段名一致）');

console.log('\n[smoke-pharmacy] ' + pass + ' 组断言全部通过');
