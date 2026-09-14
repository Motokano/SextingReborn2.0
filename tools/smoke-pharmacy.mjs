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
import os from 'node:os';
import { spawnSync } from 'node:child_process';
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
assert.strictEqual(cfg.pharmacy_addiction_gain.inject, 12);
assert.strictEqual(cfg.pharmacy_addiction_stage_thresholds.join(','), '25,50,75');
assert.strictEqual(cfg.pharmacy_toxicity_band_thresholds.join(','), '0,25,55');
assert.strictEqual(cfg.pharmacy_concentration_capacity, 100);
ok('CSV 解析：失败物 id / 熟练度曲线 / 四途径 / 成瘾与毒性占位值');

assert.strictEqual(PC.getPotencyBand(20, cfg), 'weak');
assert.strictEqual(PC.getPotencyBand(50, cfg), 'regular');
assert.strictEqual(PC.getPotencyBand(90, cfg), 'potent');
assert.strictEqual(PC.getPotencyBand(110, cfg), 'pure', '≥100 → pure（纯品档，加工阶梯最高层）');
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
['potion_hemostatic_cloth', 'potion_painkiller_herb', 'potion_energy_brew', 'potion_antidote_basic'].forEach((id) => {
  assert(!items[id], 'k215：死占位 ' + id + ' 应已删除');
});
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

// 刺入：器具清单为空 → 放行；清单非空 + 背包无器具 → 门禁；有器具 → 放行
PS.setConfig({ systemConfig: Object.assign({}, cfg, { pharmacy_inject_kit_item_ids: [] }) });
sandbox.InventoryHelpers.getInventoryCountByItemId = () => 0;
assert.strictEqual(IU.applyItemUseEffectFromTemplate('inj1', { use_action: 'inject', use_buff_id: 'buff_a' }), true);
PS.setConfig({ systemConfig: Object.assign({}, cfg, { pharmacy_inject_kit_item_ids: ['tool_syringe_pharmacy'] }) });
assert.strictEqual(IU.applyItemUseEffectFromTemplate('inj2', { use_action: 'inject', use_buff_id: 'buff_b' }), false);
assert.strictEqual(IU.takeLastUseFailure().reason, 'needs_inject_kit');
sandbox.InventoryHelpers.getInventoryCountByItemId = (id) => (id === 'tool_syringe_pharmacy' ? 1 : 0);
assert.strictEqual(IU.applyItemUseEffectFromTemplate('inj3', { use_action: 'inject', use_buff_id: 'buff_b' }), true);
assert(cfg.pharmacy_inject_kit_item_ids.length >= 1, '配置表应落注射器具 id（k244）');
assert(cfg.pharmacy_inhale_igniter_item_ids == null, '吸入不再需要火源（2026-09 裁决，配置键已移除）');
PS.setConfig({ systemConfig: cfg });
ok('刺入：清单为空放行 / 缺器具 → needs_inject_kit / 有器具放行（k244 器具 id 已落配置）');

// 吸入：不需火源（裁决）——背包里什么都没有也能吸
sandbox.InventoryHelpers.getInventoryCountByItemId = () => 0;
assert.strictEqual(IU.applyItemUseEffectFromTemplate('inh1', { use_action: 'inhale', use_buff_id: 'buff_c' }), true);
ok('吸入不需火源：无任何点火物也可用');

// 白名单：途径被配置裁掉后拒绝
PS.setConfig({ systemConfig: Object.assign({}, cfg, { pharmacy_use_routes: ['drink'] }) });
assert.strictEqual(IU.applyItemUseEffectFromTemplate('inj4', { use_action: 'inject', use_buff_id: 'buff_d' }), false);
assert.strictEqual(IU.takeLastUseFailure().reason, 'route_not_allowed');
PS.setConfig({ systemConfig: cfg });
ok('途径白名单：pharmacy_use_routes 收窄后拒绝该途径');

// 联合注射液：一次挂多成分 buff
buffs.clear();
sandbox.InventoryHelpers.getInventoryCountByItemId = (id) => (id === 'tool_syringe_pharmacy' ? 1 : 0);
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

const d1 = IE.putItemIntoDefaultContainer({ item_id: 'potion_compound_injection', count: 1, components: [{ item_id: 'med_morphine_powder', count: 1 }], pharmacy_formula_key: 'formula:a', pharmacy_rules_version: 2, spoilage_elapsed_ticks: 100 });
const d2 = IE.putItemIntoDefaultContainer({ item_id: 'potion_compound_injection', count: 1, components: [{ item_id: 'med_morphine_powder', count: 1 }], pharmacy_formula_key: 'formula:a', pharmacy_rules_version: 2, spoilage_elapsed_ticks: 300 });
assert.strictEqual(d1.index, d2.index, '相同动态公式应合并');
assert.strictEqual(IE.getBackpackArray()[d1.index].count, 2, '动态药合并数量正确');
assert.strictEqual(IE.getBackpackArray()[d1.index].spoilage_elapsed_ticks, 300, '合并取较旧腐败进度');
assert.strictEqual(d2.freshness_shortened, true, '新鲜度不同应回报缩短提示');
const d3 = IE.putItemIntoDefaultContainer({ item_id: 'potion_compound_injection', count: 1, components: [{ item_id: 'med_ephedra_powder', count: 1 }], pharmacy_formula_key: 'formula:b', pharmacy_rules_version: 2, spoilage_elapsed_ticks: 50 });
assert.notStrictEqual(d1.index, d3.index, '不同动态公式不得合并');
ok('动态药实例：公式隔离、元数据保留、合并取较短期限');

const inherited = PS.inheritSpoilageOnOutput({ item_id: 'potion_strength_pill', count: 1 }, [
  { item_id: 'potion_strength_pill', count: 1, spoilage_elapsed_ticks: 1800 },
  { item_id: 'item.scrap.herb_dregs', count: 1 }
]);
assert.strictEqual(inherited.spoilage_elapsed_ticks, 1800, '7200 成品继承易腐投入 75% 剩余新鲜度');
const freshOutput = PS.inheritSpoilageOnOutput({ item_id: 'potion_strength_pill', count: 1 }, [{ item_id: 'item.scrap.herb_dregs', count: 1 }]);
assert.strictEqual(freshOutput.spoilage_elapsed_ticks, 0, '全非易腐投入产出视为全新');
ok('加工保存：继承最低剩余新鲜度，全非易腐投入为全新');

console.log('\n⑦ k233 剂型 buff 矩阵（源表 → buffs.json）');
const matrix = loadJson('data/pharmacy-buff-matrix.json');
const buffsDoc = loadJson('data/buffs.json');
const buffById = {};
buffsDoc.buffs.forEach((b) => { if (b && b.buff_id) buffById[b.buff_id] = b; });

let cellCount = 0;
const missingCells = [];
const routeMismatch = [];
Object.keys(matrix.families).forEach((family) => {
  const fam = matrix.families[family];
  fam.routes.forEach((route) => {
    Object.keys(matrix.potency_profiles).forEach((potency) => {
      cellCount++;
      const id = 'buff_pharm_' + family + '_' + route + '_' + potency;
      const tpl = buffById[id];
      if (!tpl) { missingCells.push(id); return; }
      const rp = matrix.route_profiles[route];
      const override = matrix.route_family_overrides?.[route]?.[family];
      const expectedDuration = override?.duration_by_potency?.[potency] ?? override?.duration_ticks ?? rp.duration_ticks;
      if (tpl.onsetTicks !== rp.onset_ticks || tpl.durationTicks !== expectedDuration) routeMismatch.push(id);
    });
  });
});
assert.strictEqual(missingCells.join(','), '', '矩阵有效格子应全部落成 buff：' + missingCells.slice(0, 5).join(','));
assert.strictEqual(routeMismatch.join(','), '', '生效时间/持续时间应取自途径档：' + routeMismatch.slice(0, 5).join(','));
ok('剂型矩阵 ' + cellCount + ' 个有效格子（family × route × potency）全部生成');

const injectionWindows = {
  stimulant: 20, strength: 120, antistun: 40, analgesic: 50,
  rehydrate: 30, energy: 30, sedative: 40, hallucinogen: 180,
  synergist: 10, revive: 10, coagulant: 10
};
Object.entries(injectionWindows).forEach(([family, duration]) => {
  Object.keys(matrix.potency_profiles).forEach((potency) => {
    const expected = matrix.route_family_overrides.inject[family]?.duration_by_potency?.[potency] ?? duration;
    assert.strictEqual(buffById[`buff_pharm_${family}_inject_${potency}`].durationTicks, expected, `${family}/${potency} 注射窗口`);
  });
});
assert.strictEqual(buffById.buff_pharm_stimulant_drink_regular.durationTicks, 60, '非注射口服窗口不变');
assert.strictEqual(buffById.buff_pharm_stimulant_inhale_regular.durationTicks, 18, '非注射吸入窗口不变');
assert.strictEqual(buffById.buff_pharm_strength_drink_potent.durationTicks, 180, '续力口服长效窗口');
ok('注射按族窗口覆盖四档；续力口服 180 tick；其他剂型窗口不变');

const invalidMatrix = structuredClone(matrix);
invalidMatrix.route_family_overrides.inject.stimulant.duration_ticks = 0;
const invalidMatrixPath = path.join(os.tmpdir(), `pharmacy-matrix-invalid-${process.pid}.json`);
fs.writeFileSync(invalidMatrixPath, JSON.stringify(invalidMatrix), 'utf8');
try {
  const invalidBuild = spawnSync(process.execPath, [path.join(root, 'tools/build-pharmacy-buffs.mjs'), '--check', `--matrix=${invalidMatrixPath}`], { encoding: 'utf8' });
  assert.notStrictEqual(invalidBuild.status, 0, '非法 duration_ticks 必须拒绝生成');
  assert((invalidBuild.stderr + invalidBuild.stdout).includes('invalid duration_ticks'), '非法配置错误应可诊断');
} finally {
  fs.rmSync(invalidMatrixPath, { force: true });
}
ok('生成器拒绝非法注射族窗口配置');

// 峰值缩放不变；延长注射的 survival_delta 另按旧10-tick预算分摊。
const stimInjectPotent = buffById['buff_pharm_stimulant_inject_potent'];
const stimDrinkWeak = buffById['buff_pharm_stimulant_drink_weak'];
const energyOf = (tpl) => (tpl.effects.find((e) => e.type === 'survival_delta') || { params: {} }).params.energy;
assert.strictEqual(energyOf(stimInjectPotent), 0.9, '注射·强效兴奋 energy = (1.2×1.0×1.5)×10/20');
assert.strictEqual(energyOf(stimDrinkWeak), 0.48, '口服·弱效 兴奋 energy = 1.2×0.8×0.5');
assert.strictEqual(stimInjectPotent.onsetTicks, 0, '注射立即生效');
assert.strictEqual(stimDrinkWeak.onsetTicks, 5, '口服 5 tick 起效');
ok('持续增益峰值不变；注射 survival_delta 按新窗口分摊（强效 energy 0.9 / 口服仍 0.48）');

// 部位性只有外敷：mobility 无全身格子；全身族无外敷格子
assert.strictEqual(matrix.families.mobility.routes.join(','), 'topical', '活络仅外敷');
Object.keys(matrix.families).forEach((f) => {
  if (f === 'mobility' || f === 'coagulant') return;
  assert(!matrix.families[f].routes.includes('topical'), f + ' 不应有外敷格子（全身性效果）');
});
ok('作用域约束：部位性仅外敷、全身性不含外敷');

['buff_pharm_sideeffect_mild', 'buff_pharm_sideeffect_moderate', 'buff_pharm_sideeffect_severe',
  'buff_pharm_conflict_settle_mild', 'buff_pharm_conflict_toxic_severe',
  'buff_pharm_addiction_stage2', 'buff_pharm_addiction_stage3', 'buff_pharm_addiction_stage4'
].forEach((id) => assert(buffById[id], id + ' 应存在'));
ok('副作用 3 档 / 相冲 2 结局 / 成瘾 3 阶段惩罚模板齐备');

console.log('\n⑧ 生效时间（onsetTicks）运行时行为');
const buffSandbox = {
  console: { log() {}, warn() {}, error() {} },
  fetch: async (p) => ({ ok: true, json: async () => loadJson(String(p)) }),
  GameTime: {
    tick: 0,
    getState() { return { totalTicks: this.tick, year: 1, dayOfYear: 1, hour: 8, minute: 0, timePeriod: 'morning' }; },
    advanceTicks(n) { this.tick += Math.max(0, Math.floor(Number(n) || 0)); }
  }
};
vm.createContext(buffSandbox);
vm.runInContext(readText('js/survival.js'), buffSandbox, { filename: 'survival.js' });
vm.runInContext(readText('js/character-attributes.js'), buffSandbox, { filename: 'character-attributes.js' });
vm.runInContext(readText('js/buff-system.js'), buffSandbox, { filename: 'buff-system.js' });
const S3 = buffSandbox.Survival;
const BS3 = buffSandbox.BuffSystem;
const CA3 = buffSandbox.CharacterAttributes;
const survCfg = loadJson('data/survival-config.json');
S3.setConfig(survCfg);
CA3.setConfig(survCfg);
BS3.init();
for (let i = 0; i < 200 && !BS3.getState().loaded; i++) await new Promise((r) => setTimeout(r, 10));
assert(BS3.getState().loaded, 'BuffSystem 载入真实 buffs.json');
assert(BS3.getState().templateCount >= 160, 'buffs.json 模板数含制药矩阵（' + BS3.getState().templateCount + '）');

S3.setState({ mood: 500, dirtyness: 50, stamina: 100, energy: 100 });
BS3.applyBuff('player', 'buff_pharm_sedative_drink_regular', 'test:smoke');
assert(BS3.hasBuffByBuffId('player', 'buff_pharm_sedative_drink_regular'), '口服镇静 buff 在场');
S3.advanceTick();
S3.advanceTick();
S3.advanceTick();
S3.advanceTick();
assert.strictEqual(S3.getState().mood, 500, 'onset 未到（4/5 tick）→ 心情不涨（效果未结算）');
S3.advanceTick();
assert(S3.getState().mood > 500, 'onset 到达（5 tick）→ 心情开始上涨（实际 ' + S3.getState().mood + '）');
ok('口服 5 tick 起效：前 4 tick 无效、第 5 tick 起生效');

BS3.removeBuffByBuffId('player', 'buff_pharm_sedative_drink_regular');
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_potent', 'item:test_stimulant');
const speed = BS3.getBattleMoveSpeedMultiplier('player');
assert(Math.abs(speed - 1.12) < 1e-6, '注射强效兴奋出手速度乘区 = 1 + 0.08×1.5 = 1.12（实际 ' + speed + '）');
ok('注射立即生效：出手速度乘区 1.12');

// 同一来源续药刷新、多来源独立计时；同类药效只取最高值。
const doseStartTick = buffSandbox.GameTime.tick;
const firstDose = BS3.getState().instancesByOwner.player.find((x) => x.buff_id === 'buff_pharm_stimulant_inject_potent');
const firstStarted = firstDose.started_tick;
const firstExpiry = firstDose.expires_at_tick;
for (let i = 0; i < 3; i++) S3.advanceTick();
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_potent', 'item:test_stimulant');
let potentDoses = BS3.getState().instancesByOwner.player.filter((x) => x.buff_id === 'buff_pharm_stimulant_inject_potent');
assert.strictEqual(potentDoses.length, 1, '同来源续药不新增实例');
assert.strictEqual(potentDoses[0].started_tick, firstStarted, '已起效续药保留原起效时刻');
assert(potentDoses[0].expires_at_tick > firstExpiry, '同来源续药从本次刷新结束时间');
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_potent', 'pharmacy:compound:other-formula');
potentDoses = BS3.getState().instancesByOwner.player.filter((x) => x.buff_id === 'buff_pharm_stimulant_inject_potent');
assert.strictEqual(potentDoses.length, 2, '不同药物来源各自保留实例');
assert(Math.abs(BS3.getBattleMoveSpeedMultiplier('player') - 1.12) < 1e-6, '同类倍率跨来源取最高，不连乘');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_potent');

S3.setState({ energy: 0, stamina: 0, fatigue: 50 });
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_weak', 'pharmacy:compound:weak');
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_potent', 'pharmacy:compound:potent');
S3.advanceTick();
assert(Math.abs(S3.getState().energy - 0.9) < 0.0001, '生存恢复每字段只发最高速率，弱来源不叠加');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_weak');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_potent');
ok('同来源刷新、多来源独立计时、同类药效取最高');

console.log('\n⑨ k242 成瘾四阶段 / k240 毒性代谢与致死倒计时');
buffSandbox.SceneCtx = {};
let immunityLevel = 0;
let deathReason = '';
buffSandbox.InventoryEquipment = {
  getSkillLevel(id) { return id === 'survival_immunity' ? immunityLevel : 0; },
  getState() { return { equipment: {}, skills: {} }; },
  getItemTemplate() { return null; },
  getEnchantEntry() { return null; }
};
buffSandbox.Survival.setDead = function (reason) { deathReason = String(reason || ''); };
// 续力直接改变实际承载缓存：起效、混用、存读档、到期均走真实模块。
const carrySavedState = JSON.parse(JSON.stringify(BS3.getState()));
const carrySavedTick = buffSandbox.GameTime.tick;
CA3.recalcCharacterStats();
const baseCarry = CA3.getCarryCapacity();
const baseJingu = CA3.getExternalAcquiredBonus().jingu;
BS3.applyBuff('player', 'buff_pharm_strength_drink_potent', 'test:carry');
assert.strictEqual(CA3.getCarryCapacity(), baseCarry, '药汤起效前负重不变');
for (let i = 0; i < 5; i++) S3.advanceTick();
assert.strictEqual(CA3.getCarryCapacity(), baseCarry + 6, '药汤起效后实际负重 +6 kg');
BS3.applyBuff('player', 'buff_pharm_strength_inject_potent', 'test:carry');
assert.strictEqual(CA3.getCarryCapacity(), baseCarry + 7.5, '注射立即 +7.5 kg，和药汤取最高值');
assert.strictEqual(CA3.getExternalAcquiredBonus().jingu, baseJingu, '续力不增加筋骨');
BS3.applyBuff('npc:test', 'buff_pharm_strength_inject_pure', 'test:carry');
assert.strictEqual(CA3.getCarryCapacity(), baseCarry + 7.5, '他人药效不增加玩家负重');
BS3.setState(JSON.parse(JSON.stringify(BS3.getState())));
assert.strictEqual(CA3.getCarryCapacity(), baseCarry + 7.5, '读档恢复负重效果');
for (let i = 0; i < 120; i++) S3.advanceTick();
assert.strictEqual(CA3.getCarryCapacity(), baseCarry + 7.5, '注射窗口末 tick 仍有效');
S3.advanceTick();
assert.strictEqual(CA3.getCarryCapacity(), baseCarry + 6, '注射到期退回尚有效的药汤');
while (buffSandbox.GameTime.tick <= carrySavedTick + 180) S3.advanceTick();
assert.strictEqual(CA3.getCarryCapacity(), baseCarry, '所有续力到期恢复原负重');
buffSandbox.GameTime.tick = carrySavedTick;
BS3.setState(carrySavedState);
ok('续力真实负重缓存：延迟起效、最高值混用、玩家隔离、存读档及到期回退');
vm.runInContext(readText('js/pharmacy-config.js'), buffSandbox, { filename: 'pharmacy-config.js' });
vm.runInContext(readText('js/pharmacy-effects.js'), buffSandbox, { filename: 'pharmacy-effects.js' });
const PE = buffSandbox.PharmacyEffects;
assert(PE, 'PharmacyEffects 模块装载失败');
PE.setConfig(PC.parseCsv(pharmacyCsv));
CA3.setState(CA3.getDefaultState());
// 清掉 ⑧ 留下的强效注射 buff（否则阶段二起就一直被 potency 压制）
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_potent');
BS3.setBuffStateListener(function (ownerId) { PE.onBuffStateChanged(ownerId); });
PE.resetState();

// 途径增量：外敷 0 / 口服 +3 / 刺入 +12（联合按成分数累加）
assert.strictEqual(PE.getRouteGain('topical'), 0, '外敷不涨瘾');
assert.strictEqual(PE.getRouteGain('drink'), 3, '口服增量 3');
assert.strictEqual(PE.getRouteGain('inject'), 12, '刺入增量 12');
assert.strictEqual(PE.addAddictionFromRoute('topical'), 0, '外敷用药后成瘾仍为 0');
assert.strictEqual(PE.addAddictionFromRoute('drink'), 3, '口服一次 → 3');
assert.strictEqual(PE.addAddictionFromRoute('inject', 3), 39, '联合注射液 3 成分 → 3 + 12×3 = 39');
ok('途径增量与联合累加（外敷恒 0）');

// 四阶段阈值 + 阶段惩罚 buff + 乘区
assert.strictEqual(PE.getAddictionStage(24), 1);
assert.strictEqual(PE.getAddictionStage(49), 2);
assert.strictEqual(PE.getAddictionStage(60), 3);
assert.strictEqual(PE.getAddictionStage(80), 4);
assert.strictEqual(PE.getState().stage, 2, '成瘾 39 → 阶段二');
assert(BS3.hasBuffByBuffId('player', 'buff_pharm_addiction_stage2'), '阶段二惩罚 buff 在场');
assert(Math.abs(CA3.getExternalAcquiredMultiplier().jingu - 0.9) < 1e-9, '阶段二五维 ×0.90');
ok('四阶段阈值 + 阶段惩罚（−10%/−20%/−35%）');

// 缓解：最高已起效来源按阶段抵扣实际惩罚阶段。
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_weak', 'pharmacy:compound:test-weak', { pharmacy_relief_stages: 1 });
assert.strictEqual(PE.getEffectiveAddictionStage(), 1, '阶段二 − 缓解1 → 实际惩罚阶段一');
assert(Math.abs(CA3.getExternalAcquiredMultiplier().jingu - 1) < 1e-9, '缓解期间五维乘区恢复 1.0');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_weak');
PE.addAddiction(21); // 39+21=60 → 阶段三
assert.strictEqual(PE.getState().stage, 3, '成瘾 60 → 阶段三');
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_weak', 'pharmacy:compound:test-weak', { pharmacy_relief_stages: 1 });
assert.strictEqual(PE.getEffectiveAddictionStage(), 2, '阶段三 − 缓解1 → 实际惩罚阶段二');
assert(Math.abs(CA3.getExternalAcquiredMultiplier().jingu - 0.9) < 1e-9, '部分缓解后保留阶段二惩罚');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_weak');
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_regular', 'pharmacy:compound:test-regular', { pharmacy_relief_stages: 2 });
assert.strictEqual(PE.getEffectiveAddictionStage(), 1, '阶段三 − 缓解2 → 实际惩罚阶段一');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_regular');
ok('依赖实际阶段 − 最高已起效缓解阶段');

// 免疫三向接线（§4.5）
immunityLevel = 100;
assert(PE.getRouteGain('inject') < 12 * 0.6 && PE.getRouteGain('inject') > 0, '免疫 100 级 → 累积增量减免 50%');
const beforeDecay = PE.getAddiction();
PE.onWorldTick();
const decayWithImmunity = beforeDecay - PE.getAddiction();
immunityLevel = 0;
assert(decayWithImmunity > 0.02, '免疫加速自然衰减（' + decayWithImmunity.toFixed(3) + ' > 0.02）');
ok('免疫接线：累积减免 + 衰减加速');

// 毒性：档位映射 + 代谢衰减 + 致死倒计时
PE.setState({ addiction: 0, toxicity: 0, toxicity_lethal_ticks: 0, last_band: 'none', lethal_active: false });
PE.clearAllBuffs();
PE.addToxicity(10);
assert.strictEqual(PE.getToxicityBand(), 'mild', '毒性 10 → 轻');
assert(BS3.hasBuffByBuffId('player', 'buff_pharm_sideeffect_mild'), '轻度副作用 buff 在场');
PE.addToxicity(20); // 30 → 中
assert.strictEqual(PE.getToxicityBand(), 'moderate', '毒性 30 → 中');
assert(BS3.hasBuffByBuffId('player', 'buff_pharm_sideeffect_moderate'), '中度副作用 buff 换档');
assert(!BS3.hasBuffByBuffId('player', 'buff_pharm_sideeffect_mild'), '轻度副作用 buff 已移除');
PE.addToxicity(30); // 60 → 重
assert.strictEqual(PE.getToxicityBand(), 'severe', '毒性 60 → 重');
PE.onWorldTick();
assert(PE.isLethalCountdownActive(), '重档 → 致死倒计时启动');
assert(PE.getLethalTicksRemaining() === 15, '倒计时上限 16（已走 1 tick）');
PE.accelerateToxicityDecay(100);
assert.strictEqual(PE.getToxicityBand(), 'none', '解毒加速 → 毒性清空');
PE.onWorldTick();
assert(!PE.isLethalCountdownActive(), '降到重档之下 → 倒计时清零');
ok('毒性档位映射 + 解毒清空 + 倒计时脱离');

PE.setState({ addiction: 0, toxicity: 10, toxicity_lethal_ticks: 0, last_band: 'mild', lethal_active: false });
const detoxStart = buffSandbox.GameTime.tick;
BS3.applyBuff('player', 'buff_pharm_detox_pill', 'item:potion_detox_pill', { tick: detoxStart });
PE.onWorldTick();
assert(Math.abs(PE.getToxicity() - 8.5) < 0.0001, '清毒等待期只走基础代谢1.5');
buffSandbox.GameTime.advanceTicks(3);
PE.onWorldTick();
assert(Math.abs(PE.getToxicity() - 6.25) < 0.0001, '清毒起效后合计代谢2.25/tick');
BS3.applyBuff('player', 'buff_pharm_detox_pill', 'pharmacy:compound:detox-other', { tick: buffSandbox.GameTime.tick });
PE.onWorldTick();
assert(Math.abs(PE.getToxicity() - 4) < 0.0001, '多个清毒来源额外代谢仍只取最高0.75');
BS3.removeBuffByBuffId('player', 'buff_pharm_detox_pill');
ok('清毒等待、额外代谢和不叠速');

// 走完倒计时 → setDead('drug_toxicity')
// 数值口径（2026-09 定稿）：衰减 1.5/tick + 重档门槛 56 + 倒计时 16 → 初始毒性 ≥80 才致死
deathReason = '';
PE.addToxicity(100);
let guard = 0;
while (!deathReason && guard < 200) { PE.onWorldTick(); guard++; }
assert.strictEqual(deathReason, 'drug_toxicity', '倒计时走完 → 死亡原因 drug_toxicity');
ok('致死链：体内毒性 ≥56 累计 ' + guard + ' tick → setDead(drug_toxicity)');

console.log('\n⑩ 首版配方链（47 §6：前处理 → 中间品 → 剂型成品）');
const recipesDoc = loadJson('data/recipes.json');
const pharmacyRecipes = Object.keys(recipesDoc.recipes)
  .map((k) => recipesDoc.recipes[k])
  .filter((r) => r && r.recipe_system === 'life_pharmacy');
assert(pharmacyRecipes.length >= 20, '制药配方应 ≥20 条（实际 ' + pharmacyRecipes.length + '）');

const badItemRefs = [];
const badMethods = [];
pharmacyRecipes.forEach((r) => {
  if (!recipeMethods.methods[r.method_id]) badMethods.push(r.recipe_id + ':' + r.method_id);
  (r.inputs || []).forEach((row) => { if (!items[row.item_id]) badItemRefs.push(r.recipe_id + ':' + row.item_id); });
  if (r.main_output && !items[r.main_output.item_id]) badItemRefs.push(r.recipe_id + ':' + r.main_output.item_id);
});
assert.strictEqual(badItemRefs.join(','), '', '配方引用的物品应全部存在：' + badItemRefs.slice(0, 4).join(','));
assert.strictEqual(badMethods.join(','), '', '配方引用的方法应全部存在：' + badMethods.join(','));
assert.strictEqual(pharmacyRecipes.length, 77, '新版目录保留77条固定工艺配方记录');
assert.strictEqual(pharmacyRecipes.filter(r => r.enabled !== false).length, 70, '止血/复苏消费者缺口分支暂缓，另含海藻精浸提，当前启用70条');
assert(pharmacyRecipes.some(r => r.recipe_id === 'life_pharmacy.macerate_seaweed_extract' && r.main_output.item_id === 'liquid_seaweed_extract'), '海藻精应有稳定浸提配方');
assert(pharmacyRecipes.every(r => items[r.main_output.item_id].use_action !== 'inject'), '所有注射液必须走动态配置');
assert(pharmacyRecipes.some(r => r.main_output.item_id === 'med_morphine_powder_purified'), '精炼药粉链继续可制作');
ok('首版 ' + pharmacyRecipes.length + ' 条配方：物品/方法引用全部可解析');

// 多级链：赤花藤 →(crushing) 药粉 →(maceration) 提神汤液
run('recipe-system.js');
sandbox.RecipeSystem.setTables(recipesDoc, recipeMethods, loadJson('data/life-skill-recipe-interfaces.json'));
// 注册与 scene-app 同口径的制药处理器（processor.life_pharmacy.default）
sandbox.RecipeSystem.registerProcessor('processor.life_pharmacy.default', function (payload) {
  var recipe = (payload && payload.recipe) || {};
  var route = (payload && payload.route) || {};
  var method = (payload && payload.method) || {};
  return {
    selected_recipe_id: payload && payload.recipe_id ? String(payload.recipe_id) : '',
    method_id: method && method.method_id != null ? String(method.method_id) : '',
    route: route,
    main_output: recipe.main_output || null,
    bonus_outputs: Array.isArray(recipe.bonus_outputs) ? recipe.bonus_outputs : [],
    failure_output: route.failure_output || null,
    base_success_rate: route.base_success_rate != null ? route.base_success_rate : (method.base_success_rate != null ? method.base_success_rate : null)
  };
});
sandbox.SceneCtx.pharmacy_station_runtime = sandbox.PharmacyStation.createDefaultState();
sandbox.PharmacyStation.setConfig({ methods: recipeMethods.methods, recipes: pharmacyRecipes, systemConfig: cfg });

const stage1 = PS.tryResolvePharmacyByUnifiedRoute('life_pharmacy.crushing', [{ item_id: 'herb_vine_red', count: 1 }]);
assert(stage1.ok, '前处理配方应命中：' + JSON.stringify(stage1.error || {}));
assert.strictEqual(stage1.data.main_output.item_id, 'med_vine_red_powder', '赤花藤 →(粉碎) 赤花藤药粉');

const stage2 = PS.tryResolvePharmacyByUnifiedRoute('life_pharmacy.maceration', [
  { item_id: 'med_vine_red_powder', count: 1 },
  { item_id: 'solvent_water_pure', count: 1 }
]);
assert(stage2.ok, '终制配方应命中：' + JSON.stringify(stage2.error || {}));
assert.strictEqual(stage2.data.main_output.item_id, 'potion_tonic_broth', '赤花藤粉 + 纯净水 →(浸渍) 提神汤液');
const broth = items.potion_tonic_broth;
assert.strictEqual(broth.use_action, 'drink');
assert.strictEqual(broth.use_buff_id, 'buff_pharm_stimulant_drink_weak');
ok('多级链贯通：生药材 → 中间品药粉 → 剂型成品（含 use_action/use_buff_id 契约）');

// 端到端结算：满级必成 → 产出提神汤液（而非药渣）
grantedItems.length = 0;
skillState.life_pharmacy.level = 100;
skillState.life_pharmacy.move_usage = {};
sandbox.SceneCtx.pharmacy_station_runtime.active_craft = {
  remaining_ticks: 1,
  method_id: 'life_pharmacy.maceration',
  inputs: [{ item_id: 'med_vine_red_powder', count: 1 }, { item_id: 'solvent_water_pure', count: 1 }],
  consumed_items: [{ item_id: 'med_vine_red_powder', count: 1 }, { item_id: 'solvent_water_pure', count: 1 }]
};
PS.finalizeCraftNow(null);
assert(grantedItems.includes('potion_tonic_broth'), '端到端结算应产出提神汤液（实际 ' + grantedItems.join(',') + '）');
assert(skillState.life_pharmacy.move_usage.pharmacy_success === 1, '成功制作 +1 熟练度');
assert(sandbox.SceneCtx.known_recipe_ids_by_system.life_pharmacy['life_pharmacy.brew_tonic_broth'] === true, '盲配成功写图鉴（双写）');
ok('端到端：投料 → 成功 → 产出剂型 + 熟练度 +1 + 图鉴解锁');

console.log('\n⑪ k231 配药模式（浓度预算 / 净药效 / 净毒性 / 相冲 / 动态实例）');
const conflictRules = loadJson('data/pharmacy-conflict-rules.json');
let toxAddedTotal = 0;
const addictionCalls = [];
sandbox.PharmacyEffects = {
  addToxicity(n) { toxAddedTotal += Number(n) || 0; return Number(n) || 0; },
  addAddictionDose(n) { addictionCalls.push(Number(n) || 0); return 0; }
};
run('pharmacy-compounding.js');
const PCC = sandbox.PharmacyCompounding;
assert(PCC, 'PharmacyCompounding 模块装载失败');
PCC.setConfig(cfg, conflictRules);
assert.strictEqual(PCC.getConfig().capacity, 100, '浓度容量取自配置');

const SOLVENT = { item_id: 'solvent_saline', count: 1 };
assert.strictEqual(PCC.classifyItem('med_cocaine_powder'), 'drug', '可卡因粉 = 药成分');
assert.strictEqual(PCC.classifyItem('med_liver_herb_powder'), 'offset', '护肝草粉 = 辅成分');
assert.strictEqual(PCC.classifyItem('med_rehydration_powder'), 'functional', '补液粉 = 功能成分');
assert.strictEqual(PCC.classifyItem('solvent_saline'), 'solvent', '生理盐水 = 溶媒');
assert.strictEqual(PCC.classifyItem('adj_citric_acid'), 'adjuvant', '柠檬酸 = 助剂');
ok('成分三型 + 溶媒/助剂分类');

assert.strictEqual(PCC.validate([]).reason, 'empty_inputs');
assert.strictEqual(PCC.validate([{ item_id: 'med_cocaine_powder', count: 1 }]).reason, 'solvent_required');
assert.strictEqual(PCC.validate([SOLVENT, SOLVENT, { item_id: 'med_cocaine_powder', count: 1 }]).reason, 'too_many_solvent');
assert.strictEqual(PCC.validate([SOLVENT, { item_id: 'herb_coca', count: 1 }]).reason, 'not_compound_component');
const over = PCC.validate([SOLVENT, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'med_morphine_powder', count: 1 }, { item_id: 'med_liver_herb_powder', count: 1 }, { item_id: 'med_thc_powder', count: 1 }]);
assert.strictEqual(over.reason, 'over_capacity', '超浓度上限拒绝：' + JSON.stringify(over));
ok('配药前置校验：溶媒必需且仅 1、投料类型、浓度上限');
const singleStrength = PCC.buildInstance([SOLVENT, { item_id: 'med_antler_powder', count: 1 }]);
assert(singleStrength.ok, '单方续力允许配置');
assert.strictEqual(singleStrength.instance.item_id, 'potion_compound_injection', '单方也使用动态注射液模板');
assert.deepStrictEqual(JSON.parse(JSON.stringify(PCC.resolveInstance(singleStrength.instance).buff_ids)), ['buff_pharm_strength_inject_potent'], '保存成分的动态实例可重建续力药效');
assert.strictEqual(PCC.validate([SOLVENT, { item_id: 'potion_strength_injection', count: 1 }]).reason, 'item_not_found', '旧注射成品已退役，不能再次配置');
ok('注射统一动态配置：单方可制作、实例保留成分、旧成品不能再投料');

// A. 成盐充足（正常针）：可卡因 35 + 助剂 15 = 50
const saltedNeedle = [SOLVENT, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'adj_vitamin_c', count: 1 }];
const sn = PCC.resolve(saltedNeedle);
assert(sn.ok, '成盐针可配：' + JSON.stringify(sn.reason || {}));
assert.strictEqual(sn.precipitated, false, '助剂够 → 不沉淀');
assert.strictEqual(sn.salt.required, 1, '1 份碱型药 → 需 1 份助剂能力');
assert.strictEqual(sn.salt.provided, 1, '1 份维生素C（助剂形态）→ 供给 1');
assert.strictEqual(sn.concentration_used, 50, '浓度 35 + 15 = 50');
assert.strictEqual(sn.families[0].potency, 'potent', '正常针：可卡因 effect 90 → potent');
assert(Math.abs(sn.net_toxicity - 70) < 0.01, '正常针净毒性 70（未打折）');
ok('成盐充足：碱型主药 + 助剂 → 正常针（§9.5）');

// B. 成盐不足：resolve 保留沉淀风险投影，制作入口据此消耗并转为药渣
const speedball = [
  SOLVENT,
  { item_id: 'med_cocaine_powder', count: 1 },
  { item_id: 'med_morphine_powder', count: 1 },
  { item_id: 'med_liver_herb_powder', count: 1 }
];
const sb = PCC.resolve(speedball);
assert(sb.ok, '成盐不足仍能配出（沉淀针，不硬卡）：' + JSON.stringify(sb.reason || {}));
assert.strictEqual(sb.precipitated, true, '缺助剂 → 沉淀');
assert.strictEqual(sb.salt.required, 2, '2 份碱型药 → 需 2 份助剂能力');
assert.strictEqual(sb.salt.deficit, 2, '一份助剂都没有 → 缺 2');
assert.strictEqual(sb.concentration_used, 100, '浓度占用 = 35+35+30 = 100');
const sbFam = {};
sb.families.forEach((f) => { sbFam[f.family] = f.potency; });
assert.strictEqual(sbFam.stimulant, 'regular', '沉淀针：90×0.5=45 → regular（药效打折）');
assert.strictEqual(sbFam.analgesic, 'regular', '沉淀针：85×0.5=42.5 → regular');
assert.strictEqual(sb.base_toxicity, 135, '基础毒性 = 70 + 65');
assert(Math.abs(sb.offset_rate - 0.296) < 0.002, '抵消率 = 40/135 ≈ 0.296（未封顶）');
assert(Math.abs(sb.net_toxicity - 142.5) < 1, '沉淀针净毒性 = 95 × 1.5 ≈ 142.5：' + sb.net_toxicity);
assert.strictEqual(sb.addiction_components, 2, '两种致瘾主药 → 成瘾按 2 份累加');
ok('成盐不足：resolve 给出沉淀风险投影，制作入口拒绝注射产物');

// C. 缺口按份数计：可卡因 35 + 吗啡 35 + 1 份助剂 15 = 85
const halfSalt = PCC.resolve([SOLVENT, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'med_morphine_powder', count: 1 }, { item_id: 'adj_vitamin_c', count: 1 }]);
assert.strictEqual(halfSalt.salt.required, 2);
assert.strictEqual(halfSalt.salt.provided, 1);
assert.strictEqual(halfSalt.salt.deficit, 1, '2 份碱型 + 1 份助剂 → 缺 1');
assert.strictEqual(halfSalt.precipitated, true);
ok('成盐缺口按份数计（助剂 strength 参与供给）');

// D. 辅成分形态（维生素C粉）不计入助溶能力
const vitCAsOffset = PCC.getSaltRequirement([{ item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'med_vitamin_c_powder', count: 1 }]);
assert.strictEqual(vitCAsOffset.required, 1);
assert.strictEqual(vitCAsOffset.provided, 0, '辅成分形态不提供助溶能力');
assert.strictEqual(vitCAsOffset.precipitated, true);
ok('维生素C 两形态分工：辅成分形态只抵消、不当助剂');

// E. 抵消封顶 90%：护肝草粉 ×2（60 浓度）→ 抵消池 80 > 主药 70，封顶 0.9
const capped = PCC.resolve([SOLVENT, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'med_liver_herb_powder', count: 2 }]);
assert(capped.ok, '封顶用例可配：' + JSON.stringify(capped.reason || {}));
assert.strictEqual(capped.offset_rate, 0.9, '抵消率封顶 90%');
assert(Math.abs(capped.net_toxicity - 10.5) < 0.05, '残毒 = 70×10%×1.5（沉淀）= 10.5（永不落无副作用档）');
ok('抵消封顶 90% + 残毒保底（沉淀针按 ×1.5 计）');

// F. 增效：加 1 份骆驼蓬碱（synergist）+ 助剂满足成盐 → 其它族药效 ×1.2
const withSynergy = PCC.resolve([SOLVENT, { item_id: 'med_root_bitter_powder', count: 1 }, { item_id: 'med_harmaline_powder', count: 1 }, { item_id: 'adj_vitamin_c', count: 1 }]);
const rb = withSynergy.families.find((f) => f.family === 'analgesic');
assert.strictEqual(withSynergy.precipitated, false, '助剂够 → 不沉淀');
assert(Math.abs(withSynergy.synergy_multiplier - 1.2) < 1e-9, '增效倍率 = 1 + 0.2×1');
assert(Math.abs(rb.effect - 36) < 0.01, '苦根草粉 30 ×1.2 = 36');
assert.strictEqual(rb.potency, 'regular', '36 → regular 档');
ok('增效成分放大同针其它族药效');

// G. 相冲：维生素C粉（organic_acid 辅成分） + 可卡因（alkaloid）→ 轻症沉淀（用纯水避开溶媒错配）
const conflictHit = PCC.resolve([{ item_id: 'solvent_water_pure', count: 1 }, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'adj_vitamin_c', count: 1 }, { item_id: 'med_vitamin_c_powder', count: 1 }]);
assert.strictEqual(conflictHit.conflicts.length, 1, '酸 + 生物碱 → 命中 1 条相冲');
assert.strictEqual(conflictHit.conflicts[0].outcome, 'settle_mild');
assert.strictEqual(conflictHit.conflicts[0].buff_id, 'buff_pharm_conflict_settle_mild');
// 功能成分（toxicity=0）参与相冲；助剂不参与
const funcConflict = PCC.resolve([SOLVENT, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'med_rehydration_powder', count: 1 }]);
assert.strictEqual(funcConflict.conflicts.length, 1, '功能成分参与相冲（生物碱 × 矿物盐）');
const noConflict1 = PCC.resolve([SOLVENT, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'med_liver_herb_powder', count: 1 }]);
assert.strictEqual(noConflict1.conflicts.length, 0, '生物碱 × 苷类无规则 → 不相冲');
const noConflict2 = PCC.resolve([SOLVENT, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'adj_citric_acid', count: 1 }]);
assert.strictEqual(noConflict2.conflicts.length, 0, '助剂（成盐助溶）不参与相冲');
ok('相冲类别级判定 + 助剂/溶媒豁免（功能成分参与）');

// G2. 溶媒错配（§10.2）：糖水兑矿物盐 / 盐水盐析酸性成分 → 析出
const dextroseMismatch = PCC.resolve([{ item_id: 'solvent_glucose_solution', count: 1 }, { item_id: 'med_rehydration_powder', count: 1 }]);
assert.strictEqual(dextroseMismatch.conflicts.length, 1, '糖水 + 矿物盐 → 析出');
assert.strictEqual(dextroseMismatch.conflicts[0].kind, 'solvent_mismatch');
assert.strictEqual(dextroseMismatch.conflicts[0].buff_id, 'buff_pharm_conflict_settle_mild');
const salineMismatch = PCC.resolve([SOLVENT, { item_id: 'med_vitamin_c_powder', count: 1 }]);
assert.strictEqual(salineMismatch.conflicts.length, 1, '盐水 + 酸性成分 → 盐析');
const waterOk = PCC.resolve([{ item_id: 'solvent_water_pure', count: 1 }, { item_id: 'med_rehydration_powder', count: 1 }]);
assert.strictEqual(waterOk.conflicts.length, 0, '纯水 + 矿物盐 → 无相冲');
ok('溶媒错配相冲（糖水/盐水各一条规则）');

// H. 动态实例 + 注射后结算（正常针）
const built = PCC.buildInstance(saltedNeedle);
assert(built.ok, '配药产出实例');
assert.strictEqual(built.instance.item_id, 'potion_compound_injection');
assert.strictEqual(built.instance.precipitated, false, '正常针实例不带沉淀标记');
assert.strictEqual(built.instance.components.length, 3, '实例携带全部投料（含溶媒，便于复算）');
const compIds = built.instance.components.map((c) => c.item_id);
assert(compIds.indexOf('med_cocaine_powder') >= 0 && compIds.indexOf('adj_vitamin_c') >= 0, '主药与助剂都在实例里');
const injRes = PCC.applyInjection(built.instance, {});
assert(injRes.ok, '注射后结算成功');
assert(injRes.applied_buffs.indexOf('buff_pharm_stimulant_inject_potent') >= 0, '挂兴奋·注射·强效');
assert(Math.abs(toxAddedTotal - 70) < 0.01, '净毒性注入体内（' + toxAddedTotal + '）');
assert(addictionCalls.length === 1 && Math.abs(addictionCalls[0] - 12) < 0.0001, '可卡因粉口服基准4 × 注射途径3 = 依赖12');
// 配伍失败不再生成可注射物品。
const builtPrecip = PCC.buildInstance(speedball);
assert.strictEqual(builtPrecip.ok, false, '沉淀或相冲组合拒绝产出注射液');
assert.strictEqual(builtPrecip.reason, 'incompatible_compound');
ok('动态注射液实例 + 一次滴注多族 buff + 毒性/成瘾结算；配伍失败无注射产物');

// 实例经 use_action=inject 走通（item-use 分流）
const compoundTpl = items.potion_compound_injection;
assert.strictEqual(IU.itemTemplateIsConsumable(compoundTpl), true, '复方注射液模板可消费（药效来自实例）');
buffs.clear();
const useOk = IU.applyItemUseEffectFromTemplate('potion_compound_injection', compoundTpl, { instance: built.instance });
assert.strictEqual(useOk, true, 'use_action=inject + 实例成分 → 走配药结算');
assert(!IU.takeLastUseFailure(), '无失败原因');
ok('use_action 分流接入动态注射液实例');

// 醒神（§9.6）：抗眩晕 buff 提供眩晕抗性（k235 消费者）
S3.setState({ mood: 500, dirtyness: 50, stamina: 100, energy: 100 });
assert.strictEqual(BS3.getAntiStunPct('player'), 0, '未用药时药物抗眩晕 = 0');
BS3.applyBuff('player', 'buff_pharm_antistun_inject_regular', 'test:smoke');
const antiStun = BS3.getAntiStunPct('player');
assert(antiStun > 0 && antiStun <= 1, '醒神 buff 提供抗眩晕（' + antiStun + '）');
BS3.removeBuffByBuffId('player', 'buff_pharm_antistun_inject_regular');
assert.strictEqual(BS3.getAntiStunPct('player'), 0, 'buff 移除后抗眩晕归零');
ok('醒神 buff → BuffSystem.getAntiStunPct（供战斗管线叠加）');

console.log('\n⑫ k231 配药面板接线（静态口径）');
const panelSrc = readText('js/pharmacy-station-panel.js');
const sceneSrc = readText('js/scene-app.js');
assert(panelSrc.includes('compound_mode'), '面板含配药模式状态');
assert(panelSrc.includes('tryCompoundAtStation'), '面板调用配药入口');
assert(panelSrc.includes('pharmacy-status-kv'), '面板状态区 id 与 index.html 对齐（历史 pharmacy-kv 死引用已修）');
assert(panelSrc.includes('pharmacy-help-text'), '帮助区 id 与 index.html 对齐');
assert(sceneSrc.includes('window.SceneApp.tryCompoundAtStation'), 'scene-app 导出配药入口');
assert(sceneSrc.includes('PharmacyCompounding.setConfig'), 'scene-app 装载配药规则（含相冲表）');
const uiText = loadJson('data/ui_text_zhCN.json');
['pharmacy.mode.compound', 'pharmacy.compound.concentration', 'pharmacy.btn.compound_start',
  'pharmacy.compound.fail.over_capacity', 'pharmacy.compound.fail.solvent_required'].forEach((k) => {
  assert(!!uiText[k], '缺少文案键 ' + k);
});
ok('配药面板/入口/文案接线齐备');

console.log('\n⑬ k244 针具卫生门槛');
let slotFor = null;
let takenItems = [];
sandbox.InventoryHelpers.getInventoryCountByItemId = () => 1;
sandbox.InventoryHelpers.findFirstContainerSlotByItemId = (id) => (slotFor && slotFor === id ? { containerType: 'backpack', index: 0 } : null);
sandbox.InventoryEquipment.takeItemFromContainer = (ct, idx) => ({ success: true, item: { item_id: slotFor, count: 1 } });

// 两样都没有 → 不洁针具：仍可注射，但额外注入感染毒性
slotFor = null;
PS.setConfig({ systemConfig: cfg });
let h = IU.resolveInjectionHygiene();
assert.strictEqual(h.mode, 'dirty', '无一次性器具/消毒剂 → 不洁');
assert.strictEqual(h.penalty_toxicity, 8, '感染毒性取配置值 8');
ok('针具不洁 → 本次注射带感染毒性（配置 pharmacy_dirty_injection_toxicity）');

// 有一次性输液器 → 消耗它，无惩罚
slotFor = 'tool_iv_set_pharmacy';
h = IU.resolveInjectionHygiene();
assert.strictEqual(h.mode, 'disposable', '有输液器 → 一次性消耗');
assert.strictEqual(h.penalty_toxicity, 0);
ok('一次性器具优先消耗（输液器）');

// 只有消毒剂 → 消耗 1 份，无惩罚
slotFor = 'food_wine';
h = IU.resolveInjectionHygiene();
assert.strictEqual(h.mode, 'sterilized', '只有酒 → 消毒后注射');
assert.strictEqual(h.consumed, 'food_wine');
ok('消毒剂替代一次性器具（酒）');

// 走完整注射：不洁 → 毒性注入；洁净 → 不注入
toxAddedTotal = 0;
slotFor = null;
assert.strictEqual(IU.applyUseActionRoute('potion_compound_injection', items.potion_compound_injection, 'inject', { instance: built.instance }), true);
assert(Math.abs(toxAddedTotal - (70 + 8)) < 0.01, '不洁针具：净毒性 70 + 感染 8（实际 ' + toxAddedTotal + '）');
assert.strictEqual(IU.takeLastInjectionHygiene().mode, 'dirty');
toxAddedTotal = 0;
slotFor = 'tool_iv_set_pharmacy';
assert.strictEqual(IU.applyUseActionRoute('potion_compound_injection', items.potion_compound_injection, 'inject', { instance: built.instance }), true);
assert(Math.abs(toxAddedTotal - 70) < 0.01, '洁净针具：只算净毒性 70（实际 ' + toxAddedTotal + '）');
ok('注射全链路：卫生状态参与毒性结算');

console.log('\n⑭ k246 §8 收口（多次用量 / 调和·卷制 method）');
// 一盒多次用量：药膏 use_charges=3
assert.strictEqual(items.potion_mobility_salve.use_charges, 3, '活络药膏模板声明 3 次用量');
assert(readText('js/inventory-equipment.js').includes('inst.charges'), '实例复制保留 charges（剩余次数不丢）');
assert(readText('js/scene-app.js').includes('item.use.charges_left'), '使用流程处理次数递减与提示');
ok('外敷按次用量（模板 use_charges → 实例 charges 递减）');

// 新 method：调和 / 卷制 + 配件物品
['life_pharmacy.blending', 'life_pharmacy.rolling'].forEach((mid) => {
  assert(recipeMethods.methods[mid], mid + ' 方法已登记');
});
assert.strictEqual(recipeMethods.methods['life_pharmacy.blending'].requires_accessory_item_id, 'tool_mortar_pharmacy');
assert.strictEqual(recipeMethods.methods['life_pharmacy.rolling'].requires_accessory_item_id, 'tool_roller_pharmacy');
assert(items.tool_mortar_pharmacy && items.tool_roller_pharmacy, '药钵 / 卷药器物品已落库');
const salveRecipe = recipesDoc.recipes['life_pharmacy.blend_mobility_salve'];
const cigRecipe = recipesDoc.recipes['life_pharmacy.roll_tonic_cigarette'];
assert.strictEqual(salveRecipe.method_id, 'life_pharmacy.blending', '活络药膏走调和');
assert.strictEqual(cigRecipe.method_id, 'life_pharmacy.rolling', '提神药烟走卷制');
const uiT = loadJson('data/ui_text_zhCN.json');
assert(uiT['pharmacy.method.blending'] && uiT['pharmacy.method.rolling'], '调和 / 卷制显示名已配');
ok('新 method（调和 / 卷制）+ 配件物品 + 配方切换');

console.log('\n⑮ 2026-09 裁决落地（仅自己 / 吸入免火源 / 维生素C 两形态 / 制药水口径）');
// 给药对象永久仅自己：药效入口只认 player
assert(readText('js/item-use.js').includes("applyBuff('player'"), '药效只作用于 player（无他人用药通道）');
assert(!/applyBuff\(['"](?!player)/.test(readText('js/item-use.js')), 'item-use 无其它 owner 的用药调用');
// 吸入免火源：配置与代码都不再有火源门槛
assert(!readText('data/pharmacy-system-config.csv').includes('inhale_igniter'), '配置表已移除火源键');
assert(!readText('js/item-use.js').includes('needs_igniter'), '代码已移除火源门槛');
assert(!uiText['item.use.fail.needs_igniter'], '文案已移除火源提示');
ok('吸入免火源 + 给药对象仅自己（无他人用药调用）');

// 维生素C 两形态：辅成分（抵消毒性、参与相冲） vs 助剂（成盐助溶、不相冲不抵消）
const vitC = items.med_vitamin_c_powder;
const vitCAdj = items.adj_vitamin_c;
assert.strictEqual(vitC.sub_category, 'pharm_powder');
assert.strictEqual(vitC.pharm_toxicity, -15, '辅成分形态保留 −15 抵消');
assert.strictEqual(vitC.chem_class, 'organic_acid', '辅成分形态带化学身份（参与相冲）');
assert.strictEqual(vitCAdj.sub_category, 'pharm_adjuvant');
assert(vitCAdj.pharm_toxicity == null, '助剂形态不带毒性（不抵消）');
assert(vitCAdj.chem_class == null, '助剂形态不参与相冲');
const withVitC = PCC.resolve([{ item_id: 'solvent_water_pure', count: 1 }, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'adj_vitamin_c', count: 1 }, { item_id: 'med_vitamin_c_powder', count: 1 }]);
assert.strictEqual(withVitC.precipitated, false, '助剂补齐成盐 → 不沉淀');
assert.strictEqual(withVitC.conflicts.length, 1, '辅成分形态 + 生物碱 → 相冲');
assert(Math.abs(withVitC.base_toxicity - 70) < 0.01 && withVitC.net_toxicity < 70, '辅成分形态抵消主药毒性');
const withAdj = PCC.resolve([SOLVENT, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'adj_vitamin_c', count: 1 }]);
assert.strictEqual(withAdj.conflicts.length, 0, '助剂形态不参与相冲');
assert(Math.abs(withAdj.net_toxicity - 70) < 0.01, '助剂形态不抵消毒性（净毒性仍 70）');
ok('维生素C 两形态分工：辅成分抵消/可相冲 vs 助剂助溶/不相冲不抵消');

// 制药水口径：纯净软水只允许作为一次上游净化输入，成药配方统一使用制药溶媒。
const pureRecipes = Object.keys(recipesDoc.recipes)
  .filter((k) => recipesDoc.recipes[k].recipe_system === 'life_pharmacy')
  .filter((k) => (recipesDoc.recipes[k].inputs || []).some((i) => i.item_id === 'ore_water_pure_soft'));
assert.deepStrictEqual(pureRecipes, ['life_pharmacy.clean_soft_water'], '纯净软水只能进入制药溶媒净化路线');
assert.strictEqual(PCC.classifyItem('solvent_water_pure'), 'solvent', '纯净水是配药溶媒');
assert(PCC.getConcentrationInfo([{ item_id: 'solvent_water_pure', count: 1 }, { item_id: 'med_cocaine_powder', count: 1 }]).used === 35, '溶媒不占浓度');
ok('制药水口径：纯净软水仅作上游净化输入，纯净水=溶媒（不占浓度）');

console.log('\n⑯ 成盐判定接线（§9.5）');
const panelSrc2 = readText('js/pharmacy-station-panel.js');
const cfgCsv = readText('data/pharmacy-system-config.csv');
assert(panelSrc2.includes('PC.assess') && panelSrc2.includes('assessment.salt'), '面板通过分级判断读取已解锁成盐需求');
assert(panelSrc2.includes('pharmacy.compound.salt_precipitated'), '面板提示沉淀风险');
assert(cfgCsv.includes('pharmacy_salt_required_chem_classes,alkaloid'), '配置落成盐类别');
assert(cfgCsv.includes('pharmacy_salt_effect_multiplier,0.5') && cfgCsv.includes('pharmacy_salt_toxicity_multiplier,1.5'), '配置落沉淀针折算系数');
['pharmacy.compound.salt_ok', 'pharmacy.compound.salt_precipitated', 'pharmacy.compound.ok_precipitated'].forEach((k) => {
  assert(!!uiText[k], '缺少文案键 ' + k);
});
assert(items.adj_vitamin_c.adjuvant_strength === 1 && items.adj_citric_acid.adjuvant_strength === 1, '助剂成盐能力已落数据');
assert(items.adj_citric_acid.concentration_cost === 12, '柠檬酸补上浓度占用（助剂也是成本）');
ok('成盐：配置/数据/面板/文案齐备');

console.log('\n⑰ A1 免疫补完（延长药效时长 / 减轻副作用）');
// 时长：免疫 100 级 → ×2（1 + 100×0.01）
immunityLevel = 0;
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_regular');
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_regular', 'test:imm');
const inst0 = (BS3.getState().instancesByOwner['player'] || []).find((i) => i.buff_id === 'buff_pharm_stimulant_inject_regular');
const dur0 = inst0.expires_at_tick - inst0.started_tick;
assert.strictEqual(dur0, 20, '提神注射族基准时长 20 tick');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_regular');
immunityLevel = 100;
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_regular', 'test:imm');
const inst1 = (BS3.getState().instancesByOwner['player'] || []).find((i) => i.buff_id === 'buff_pharm_stimulant_inject_regular');
const dur1 = inst1.expires_at_tick - inst1.started_tick;
assert(Math.abs(dur1 - dur0 * 2) <= 1, '免疫 100 级 → 时长 ×2（' + dur0 + '→' + dur1 + '）');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_regular');
ok('免疫延长药效持续时间（§4.5 / 11-skills）');

// 注射窗口真实 tick：通过 Survival.advanceTick -> GameTime -> BuffSystem 管线结算。
function clearPharmacyTestBuffs() {
  const arr = (BS3.getState().instancesByOwner.player || []).slice();
  arr.forEach((inst) => {
    if (inst.buff_id.startsWith('buff_pharm_')) BS3.removeBuffByBuffId('player', inst.buff_id);
  });
}
function resetInjectionRuntime(state) {
  clearPharmacyTestBuffs();
  buffSandbox.GameTime.tick = 0;
  S3.setState(Object.assign({ tickCount: 0, isDead: false, deathReason: null }, state));
}
let injectionEventSeq = 0;
function advanceBuffTicks(n) {
  for (let i = 0; i < n; i++) {
    buffSandbox.GameTime.advanceTicks(1);
    BS3.triggerBuffPipeline({
      event_id: `test_injection_tick_${++injectionEventSeq}`,
      tick: buffSandbox.GameTime.tick,
      event_kind: 'world', event_name: 'tick_advanced', tags: ['time', 'tick'], actor_id: 'player'
    });
  }
}
immunityLevel = 0;
const injectionInitial = { energy: 20, stamina: 20, fatigue: 50, thirst: 20, nutrition: 20, mood: 500 };
for (const [route, onset, duration] of [['inject', 0, 180], ['drink', 5, 240], ['inhale', 2, 60]]) {
  resetInjectionRuntime(injectionInitial);
  const id = `buff_pharm_hallucinogen_${route}_regular`;
  const tpl = buffById[id];
  assert.strictEqual(tpl.durationTicks, duration);
  BS3.applyBuff('player', id, 'test:hallucinogen-window');
  if (onset) {
    advanceBuffTicks(onset - 1);
    assert.strictEqual(BS3.getBattlePotentialGainMultiplier('player'), 1, '起效前无成长收益');
    advanceBuffTicks(1);
  }
  const peak = tpl.effects.find(e => e.type === 'battle_potential_gain_multiplier').params.multiplier;
  assert.strictEqual(BS3.getBattlePotentialGainMultiplier('player'), peak);
  assert.strictEqual(BS3.getBattleCombatExperienceGainMultiplier('player'), peak);
  advanceBuffTicks(duration - onset);
  assert.strictEqual(BS3.getBattlePotentialGainMultiplier('player'), peak, '窗口末 tick 仍有效');
  advanceBuffTicks(1);
  assert.strictEqual(BS3.getBattlePotentialGainMultiplier('player'), 1, '到期撤销潜能倍率');
  assert.strictEqual(BS3.getBattleCombatExperienceGainMultiplier('player'), 1, '到期撤销实战经验倍率');
}
ok('致幻长效窗口：三途径起效、原收益倍率与真实到期撤销');
resetInjectionRuntime(injectionInitial);
for (let i = 0; i < 20; i++) S3.advanceTick();
const baseline20 = S3.getState();
resetInjectionRuntime(injectionInitial);
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_weak', 'test:window');
for (let i = 0; i < 20; i++) S3.advanceTick();
const stimulantEnd = S3.getState();
assert.strictEqual(stimulantEnd.energy - baseline20.energy, 6, '弱效提神 energy 总预算 = 0.6×10');
assert.strictEqual(stimulantEnd.fatigue - baseline20.fatigue, -3, '弱效提神 fatigue 总预算 = -0.3×10');
assert.strictEqual(stimulantEnd.stamina - baseline20.stamina, 4, '弱效提神 stamina 总预算 = 0.4×10');
assert(BS3.hasBuffByBuffId('player', 'buff_pharm_stimulant_inject_weak'), '第20 tick 仍含到期 tick 效果');
S3.advanceTick();
assert(!BS3.hasBuffByBuffId('player', 'buff_pharm_stimulant_inject_weak'), '第21 tick 移除20 tick窗口');

resetInjectionRuntime(injectionInitial);
BS3.applyBuff('player', 'buff_pharm_rehydrate_inject_weak', 'test:window');
advanceBuffTicks(30);
assert.strictEqual(S3.getState().thirst, 32.5, '弱效补液 thirst 小数预算 = 1.25×10');
// stamina 会反过来改变昏迷/疲劳等真实生存分支；预算精度由同一调度器的
// thirst 0.1 状态量子覆盖，这里不把耦合后的净状态误报成药物毛恢复量。

resetInjectionRuntime(injectionInitial);
BS3.applyBuff('player', 'buff_pharm_sedative_inject_weak', 'test:window');
advanceBuffTicks(40);
assert.strictEqual(S3.getState().mood, 508, '弱效安神 mood 整数状态累计为名义预算 0.75×10 的最近整数');
assert.strictEqual(S3.getState().nutrition, 22, '弱效安神 nutrition 总预算 = 0.2×10');
ok('真实世界 tick 保留提神/补液/安神的旧模板理论10-tick预算（含0.1与整数状态取整）');

resetInjectionRuntime({ energy: 20, stamina: 20, fatigue: 50, thirst: 20, nutrition: 20, mood: 500 });
buffSandbox.InventoryEquipment.getItemTemplate = (id) => items[id] || null;
vm.runInContext(readText('js/pharmacy-compounding.js'), buffSandbox, { filename: 'pharmacy-compounding-window-test.js' });
const PCCWindow = buffSandbox.PharmacyCompounding;
PCCWindow.setConfig(cfg, conflictRules);
PE.setState({ addiction: 0, toxicity: 0, toxicity_lethal_ticks: 0, last_band: 'none', lethal_active: false });
const threeFamilyBuilt = PCCWindow.buildInstance([
  { item_id: 'solvent_saline', count: 1 },
  { item_id: 'med_nicotine_powder', count: 1 },
  { item_id: 'med_acorus_powder_purified', count: 1 },
  { item_id: 'med_root_bitter_powder', count: 1 },
  { item_id: 'adj_vitamin_c', count: 2 }
]);
assert(threeFamilyBuilt.ok, '低毒三族复方可构建：' + JSON.stringify(threeFamilyBuilt.reason || {}));
const threeFamilyInjection = PCCWindow.applyInjection(threeFamilyBuilt.instance, {});
assert(threeFamilyInjection.ok, '低毒三族复方可经真实 applyInjection 注射');
const threeFamilyIds = threeFamilyInjection.applied_buffs;
const familyBuffId = (family) => threeFamilyIds.find((id) => id.startsWith(`buff_pharm_${family}_inject_`));
assert(familyBuffId('stimulant') && familyBuffId('antistun') && familyBuffId('analgesic'), '真实复方挂上提神/醒神/镇痛三族');
for (let i = 0; i < 21; i++) S3.advanceTick();
assert(!BS3.hasBuffByBuffId('player', familyBuffId('stimulant')), '复方提神先到期');
assert(BS3.hasBuffByBuffId('player', familyBuffId('antistun')), '复方醒神仍在场');
assert(!BS3.hasBuffByBuffId('player', familyBuffId('analgesic')), '复方弱效镇痛20tick到期');
for (let i = 0; i < 20; i++) S3.advanceTick();
assert(!BS3.hasBuffByBuffId('player', familyBuffId('antistun')), '复方醒神第二个到期');
assert(!BS3.hasBuffByBuffId('player', familyBuffId('analgesic')), '弱效镇痛不会被其他族延长');
for (let i = 0; i < 10; i++) S3.advanceTick();
assert(!BS3.hasBuffByBuffId('player', familyBuffId('analgesic')), '复方镇痛最后到期');
ok('真实 PharmacyCompounding 三族复方按20/40/20 tick独立到期');

resetInjectionRuntime({ energy: 20, stamina: 20, fatigue: 50, thirst: 20, nutrition: 20, mood: 500 });
immunityLevel = 100;
BS3.applyBuff('player', 'buff_pharm_rehydrate_inject_regular', 'test:immune-window');
const immuneInst = BS3.getState().instancesByOwner.player.find((i) => i.buff_id === 'buff_pharm_rehydrate_inject_regular');
assert.strictEqual(immuneInst.expires_at_tick - immuneInst.started_tick, 60, '免疫100延长30→60 tick');
advanceBuffTicks(60);
assert.strictEqual(S3.getState().thirst, 70, '免疫延时保留既有持续收益（2.5×10×2）');
immunityLevel = 0;

resetInjectionRuntime({ energy: 20, stamina: 20, fatigue: 50, thirst: 20, nutrition: 20, mood: 500 });
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_regular', 'test:old-instance');
const legacyState = JSON.parse(JSON.stringify(BS3.getState()));
const legacyInst = legacyState.instancesByOwner.player.find((i) => i.buff_id === 'buff_pharm_stimulant_inject_regular');
legacyInst.expires_at_tick = legacyInst.started_tick + 10;
delete legacyInst.pharmacy_survival_delta_steps;
delete legacyInst.pharmacy_survival_delta_last_tick;
BS3.setState(legacyState);
const restoredOldInst = BS3.getState().instancesByOwner.player.find((i) => i.buff_id === 'buff_pharm_stimulant_inject_regular');
assert.strictEqual(restoredOldInst.expires_at_tick - restoredOldInst.started_tick, 10, '缺新计数字段的旧10tick实例不主动续期');
resetInjectionRuntime(injectionInitial);
BS3.applyBuff('player', 'buff_pharm_rehydrate_inject_regular', 'test:budget-save');
advanceBuffTicks(7);
const savedBudgetState = JSON.parse(JSON.stringify(BS3.getState()));
const savedBudgetInst = savedBudgetState.instancesByOwner.player.find((i) => i.buff_id === 'buff_pharm_rehydrate_inject_regular');
assert.strictEqual(savedBudgetInst.pharmacy_survival_delta_steps['0'], 7, '预算步数进入实例存档');
BS3.setState(savedBudgetState);
advanceBuffTicks(23);
assert.strictEqual(S3.getState().thirst, 45, '读档后继续余数调度，总预算仍为2.5×10');

resetInjectionRuntime(Object.assign({}, injectionInitial, { thirst: 99.9 }));
BS3.registerRuntimeBuffTemplate({
  buff_id: 'test_pharmacy_multi_delta', durationTicks: 4, onsetTicks: 0,
  maxStacks: 1, stacksAddOnApply: 1, priority: 80, listenerSide: 'self',
  consumeMode: 'always', consumeLayersFixed: 0, applyMode: 'always_apply',
  triggerEventKind: ['world'], triggerEventName: ['tick_advanced'], triggerTags: ['time', 'tick'],
  pharmacy_generated: true, pharmacy_family: 'rehydrate', pharmacy_route: 'inject',
  pharmacy_survival_budget_quantized: true,
  effects: [
    { type: 'survival_delta', params: { thirst: 0.25 } },
    { type: 'survival_delta', params: { energy: 0.25 } }
  ]
});
BS3.applyBuff('player', 'test_pharmacy_multi_delta', 'test:multi-delta');
advanceBuffTicks(2);
assert.strictEqual(S3.getState().thirst, 100, '到上限的恢复被真实裁切');
S3.setState({ thirst: 90 });
advanceBuffTicks(2);
assert.strictEqual(S3.getState().thirst, 90.5, '裁切量不在后续补发');
assert.strictEqual(S3.getState().energy, 21, '第二条 survival_delta 独立结算且未被同tick去重吞掉');
ok('免疫延时语义与旧实例不刷新到期时间');

// 副作用强度：免疫 50 级 → 减免 80%（封顶）→ 缩放 0.2
immunityLevel = 50;
PE.setSideEffectFlavor('');
assert(Math.abs(PE.getSideEffectScale() - 0.2) < 1e-9, '免疫 50 级 → 副作用缩放 0.2（封顶 80%）');
const scaledId = PE.getScaledSideEffectBuffId('moderate');
assert(/__imm20$/.test(scaledId), '注册免疫缩放版副作用 buff：' + scaledId);
const scaledTpl = BS3.getTemplate(scaledId);
const scaledStamina = (scaledTpl.effects.find((e) => e.type === 'survival_delta') || { params: {} }).params.stamina;
assert(Math.abs(scaledStamina + 0.2) < 1e-9, '中度副作用体力 −1 → −0.2（按免疫缩放）');
const scaledSpeed = (scaledTpl.effects.find((e) => e.type === 'battle_move_speed_multiplier') || { params: {} }).params.multiplier;
assert(scaledSpeed > 0.9 && scaledSpeed < 1, '速度乘区 0.9 → 向 1 收敛（' + scaledSpeed + '）');
immunityLevel = 0;
assert.strictEqual(PE.getScaledSideEffectBuffId('moderate'), 'buff_pharm_sideeffect_moderate', '免疫 0 → 用静态模板');
ok('免疫减轻副作用强度（§4.5）');

console.log('\n⑱ A2 战斗中/静止门禁（接线口径）');
const sceneSrc2 = readText('js/scene-app.js');
assert(sceneSrc2.includes('function isPlayerInCombat'), '交战判定已实现（地图存活敌人 ≤2 格）');
assert(sceneSrc2.includes('function checkUseRouteGate'), '给药途径门禁已实现');
assert(sceneSrc2.includes("route !== 'topical' && route !== 'inject'"), '只有外敷/注射受战斗门禁');
assert(sceneSrc2.includes("reason: 'must_be_still'"), '注射需静止');
assert(uiText['item.use.fail.in_combat'] && uiText['item.use.fail.must_be_still'], '门禁文案已配');
assert(!sceneSrc2.includes("route === 'drink' && isPlayerInCombat"), '口服不受战斗门禁（§5.2 战斗中可用）');
ok('外敷/注射战斗中不可 + 注射需静止（口服/吸入不受限）');

console.log('\n⑲ A3 口服走 43 消化（drink 剂型按 tick 缓释）');
const brothTpl = items.potion_tonic_broth;
assert(brothTpl.use_effect && brothTpl.use_effect.thirst > 0, '提神汤液带 use_effect（口渴/营养/精力）');
assert(brothTpl.food_buff_duration_ticks === 30, '口服剂型声明消化时长 30 tick');
buffSandbox.PharmacyStation = PS;
buffSandbox.SceneCtx = buffSandbox.SceneCtx || {};
vm.runInContext(readText('js/item-use.js'), buffSandbox, { filename: 'item-use.js' });
const IU3 = buffSandbox.ItemUse;
assert(IU3, 'item-use 在 buff 沙箱装载成功');
const drinkOk = IU3.applyUseActionRoute('potion_tonic_broth', brothTpl, 'drink', {});
assert.strictEqual(drinkOk, true, '口服提神汤液成功');
assert(BS3.hasBuffByBuffId('player', 'buff_food_digest__potion_tonic_broth'), '挂上消化中 buff（43 消化曲线）');
const digestTpl = BS3.getTemplate('buff_food_digest__potion_tonic_broth');
assert(digestTpl && digestTpl.durationTicks === 30, '消化 buff 时长 = 30 tick');
const perTick = (digestTpl.effects.find((e) => e.type === 'survival_delta') || { params: {} }).params;
assert(Math.abs(perTick.thirst - 14 / 30) < 0.01 && Math.abs(perTick.energy - 10 / 30) < 0.01, '按 tick 均摊（口渴 14/30、精力 10/30）');
ok('口服剂型接 43 消化：按 tick 缓释而非一次性直加');

console.log('\n⑳ 配方身份 / 药渣去向 / 副作用逐族文案');
// 配方身份保留，玩家历史移除
const panelSrc3 = readText('js/pharmacy-station-panel.js');
assert(!panelSrc3.includes('getHistory'), '面板不读取配药历史');
assert.strictEqual(typeof PCC.getHistory, 'undefined', '运行时不暴露玩家配药历史');
assert(PCC.compoundIdentityKey([{ item_id: 'b', count: 2 }, { item_id: 'a', count: 1 }]).indexOf('a') === 0, '配方身份按成分组合归一化');
ok('配方身份保留，玩家历史移除');

// A6 药渣去向：当柴（fuel_points）+ 沤肥（fert_c/fert_n）
const dregs = items['item.scrap.herb_dregs'];
assert.strictEqual(dregs.fuel_points, 10, '药渣可当燃料（10）');
assert(Number(dregs.fert_c) > 0 && Number(dregs.fert_n) > 0, '药渣可进沤肥（fert_c/fert_n 已落）');
assert(readText('js/compost-panel.js').includes("'fert_c'"), '堆肥系统按 fert_c 判定可投料');
ok('药渣去向：燃料 + 沤肥');

// A7 副作用逐族文案
const sideTpl = loadJson('data/buffs.json').buffs.find((b) => b.buff_id === 'buff_pharm_sideeffect_mild');
assert(sideTpl && sideTpl.pharmacy_family_flavor && Object.keys(sideTpl.pharmacy_family_flavor).length >= 10, '副作用模板带逐族风味表');
assert.strictEqual(sideTpl.pharmacy_family_flavor.stimulant, '心悸', '兴奋族副作用风味 = 心悸');
PE.setSideEffectFlavor('stimulant');
const flavoredId = PE.getScaledSideEffectBuffId('mild');
assert(/__stimulant$/.test(flavoredId), '按主药族派生副作用 buff：' + flavoredId);
const flavoredTpl = BS3.getTemplate(flavoredId);
assert(flavoredTpl && flavoredTpl.name.indexOf('心悸') === 0, '副作用名带族风味（' + (flavoredTpl && flavoredTpl.name) + '）');
PE.setSideEffectFlavor('');
assert.strictEqual(PE.getScaledSideEffectBuffId('mild'), 'buff_pharm_sideeffect_mild', '清空族风味 → 回通用模板');
ok('副作用逐族文案（§9.5）');

console.log('\n㉑ 药品 roster 契约（成品剂型 × 途径 × 药效族）');
const buffIdSet = new Set(loadJson('data/buffs.json').buffs.map((b) => b.buff_id));
const legacyPotions = Object.keys(items).filter(id => String(items[id].pharmacy_legacy) === '1');
assert.strictEqual(legacyPotions.length, 0, '旧固定注射成品已从活跃数据移除');
const potions = Object.keys(items).filter((id) => items[id].category === 'potion' && items[id].pharmacy_compound !== true && !legacyPotions.includes(id));
assert.strictEqual(potions.length, 28, '当前固定非旧注射成品共 28 件');
const badPotions = potions.filter((id) => {
  const t = items[id];
  if (['drink', 'topical', 'inhale', 'inject'].indexOf(t.use_action) < 0) return true;
  return !(t.use_buff_id && buffIdSet.has(t.use_buff_id));
});
assert.strictEqual(badPotions.join(','), '', '成品剂的 use_action/use_buff_id 必须可解析：' + badPotions.join(','));
ok(potions.length + ' 件成品：use_action 合法 + use_buff_id 全部命中剂型矩阵');

// 途径覆盖：四条途径都有成品
const byRoute = {};
potions.forEach((id) => { const r = items[id].use_action; byRoute[r] = (byRoute[r] || 0) + 1; });
['drink', 'topical', 'inhale'].forEach((r) => assert(byRoute[r] >= 2, r + ' 途径成品 ≥2（实际 ' + (byRoute[r] || 0) + '）'));
assert(!byRoute.inject, '当前固定成品不含注射');
// 药效族覆盖：矩阵里有格子的族都至少有一件成品（复苏/增效除外：复苏只有注射、增效是辅药）
const matrixFams = new Set(Object.keys(loadJson('data/pharmacy-buff-matrix.json').families));
const coveredFams = new Set();
potions.forEach((id) => {
  const m = String(items[id].use_buff_id || '').match(/^buff_pharm_([a-z_]+)_(drink|topical|inhale|inject)_/);
  if (m) coveredFams.add(m[1]);
});
const uncovered = [...matrixFams].filter((f) => !coveredFams.has(f) && f !== 'synergist' && f !== 'revive');
assert.strictEqual(uncovered.join(','), '', '药效族应有成品覆盖（缺：' + uncovered.join(',') + '）');
ok('固定成品覆盖口服/外敷/吸入；注射统一动态配置，复苏留在配置族中');

// 剂型契约：口服药通过 buff 自身的起效时间表达吸收过程；外敷按次用量。
const rosterBuffById = Object.fromEntries(loadJson('data/buffs.json').buffs.map((b) => [b.buff_id, b]));
const drinkBad = potions.filter((id) => {
  if (items[id].use_action !== 'drink') return false;
  const b = rosterBuffById[items[id].use_buff_id];
  return !(b && Number.isFinite(Number(b.onsetTicks)) && Number(b.durationTicks) > 0);
});
assert.strictEqual(drinkBad.join(','), '', '口服剂型应有可解析的起效时间和持续时间：' + drinkBad.join(','));
const topicalBad = potions.filter((id) => items[id].use_action === 'topical' && !(items[id].use_charges > 0));
assert.strictEqual(topicalBad.join(','), '', '外敷剂型应按次用量：' + topicalBad.join(','));
ok('口服按起效时间吸收、外敷按次用量（剂型契约）');

// 新药材/药粉补齐 mobility 与 regular 档 coagulant 的药粉来源
assert.strictEqual(items.med_safflower_powder.pharm_family, 'mobility', '红花粉 = 活络族');
assert.strictEqual(items.med_notoginseng_powder.pharm_family, 'coagulant', '三七粉 = 凝血族');
assert(items.med_safflower_powder.pharm_toxicity === 0 && items.med_notoginseng_powder.pharm_toxicity === 0, '功能成分 toxicity=0');
ok('新增红花/三七（药材 + 药粉）补齐活络与常规凝血来源');

// 配药台不产「只有外敷格子」的族（活络粉进配药台不会挂空 buff）——需真实 BuffSystem 才能过滤
buffSandbox.InventoryEquipment.getItemTemplate = (id) => items[id] || null;
vm.runInContext(readText('js/pharmacy-compounding.js'), buffSandbox, { filename: 'pharmacy-compounding.js' });
const PCC3 = buffSandbox.PharmacyCompounding;
PCC3.setConfig(cfg, conflictRules);
const mobilityMix = PCC3.resolve([{ item_id: 'solvent_saline', count: 1 }, { item_id: 'med_safflower_powder', count: 1 }, { item_id: 'adj_vitamin_c', count: 1 }]);
assert(mobilityMix.ok, '红花粉可投配药台：' + JSON.stringify(mobilityMix.reason || {}));
assert.strictEqual(mobilityMix.buff_ids.length, 0, '活络族无注射格 → 不产 buff');
assert(mobilityMix.skipped_families.indexOf('mobility') >= 0, '记录被跳过的族（' + mobilityMix.skipped_families.join(',') + '）');
ok('配药台过滤无注射格的药效族（不挂空 buff）');

console.log('\n㉒ UI 信息显示接线（字段规则 + 信息模块 + tooltip）');
const uiDict = loadJson('data/ui_text_zhCN.json');
const uiSandbox = {
  console: { log() {}, warn() {}, error() {} },
  UIText: {
    t(key, vars) {
      var s = uiDict[key] != null ? String(uiDict[key]) : String(key);
      if (vars && typeof vars === 'object') {
        s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
      }
      return s;
    }
  },
  InventoryEquipment: {
    getItemTemplate(id) { return items[id] || null; },
    getItemDisplayTier() { return 0; },
    getDisplayName(tpl) { return (tpl && (tpl.name || tpl.sn)) || ''; },
    getDisplayDesc(tpl) { return (tpl && (tpl.fn || tpl.desc_0)) || ''; },
    getCharacterForDisplay() { return { skills: { life_pharmacy: { level: 5 } } }; }
  },
  BuffSystem: {
    getBuffTemplate(id) { return loadJson('data/buffs.json').buffs.find((b) => b.buff_id === id) || null; }
  }
};
vm.createContext(uiSandbox);
uiSandbox.window = uiSandbox;
vm.runInContext(readText('js/item-field-display-rules.js'), uiSandbox, { filename: 'item-field-display-rules.js' });
vm.runInContext(readText('js/item-info-modules.js'), uiSandbox, { filename: 'item-info-modules.js' });
vm.runInContext(readText('js/scene-ui.js'), uiSandbox, { filename: 'scene-ui.js' });
uiSandbox.ItemFieldDisplayRules.setTable(loadJson('data/item-field-display-rules.json'));
uiSandbox.ItemInfoModules.setTable(loadJson('data/item-info-modules.json'));

const charPharm = { skills: { life_pharmacy: { level: 5 } } };
const analgesicTpl = items.potion_analgesic_pill_potent;
const injHtml = uiSandbox.SceneUi.buildItemTooltipHtmlForTemplate('potion_analgesic_pill_potent', analgesicTpl, { item_id: 'potion_analgesic_pill_potent', count: 1 }, charPharm);
assert(injHtml.indexOf('止痛丸') >= 0, 'tooltip 含药名');
assert(injHtml.indexOf('给药方式') >= 0 && injHtml.indexOf('口服') >= 0, '显示给药方式 = 口服');
assert(injHtml.indexOf('镇痛·口服·强效') >= 0, '显示药效「族·途径·档位」：' + (injHtml.match(/镇痛·[^<]*/) || [''])[0]);
assert(injHtml.indexOf('持续 150 tick') >= 0, '显示止痛丸持续时间（150 tick）');
assert(injHtml.indexOf('风险提示') >= 0 && injHtml.indexOf('久服或致依赖') >= 0, '显示风险提示模块');
// 口服：显示起效时间（口服 5 tick）
const brothHtml = uiSandbox.SceneUi.buildItemTooltipHtmlForTemplate('potion_calm_brew', items.potion_calm_brew, null, charPharm);
assert(brothHtml.indexOf('镇静·口服·常效') >= 0 && brothHtml.indexOf('起效 5 tick') >= 0, '口服显示起效 5 tick：' + (brothHtml.match(/镇静·[^<]*/) || [''])[0]);
// 无关锁定块不再出现（药水不该提示灶台燃料/堆肥碳）
assert(injHtml.indexOf('灶台燃料点数') < 0 && injHtml.indexOf('堆肥碳（C）') < 0, '药品 tooltip 不再出现无关锁定项');
ok('成品药 tooltip：给药方式 / 族·途径·档位 / 起效持续 / 风险提示 / 无噪声块');

// 外敷：按次用量
const salveHtml = uiSandbox.SceneUi.buildItemTooltipHtmlForTemplate('potion_mobility_salve', items.potion_mobility_salve, { item_id: 'potion_mobility_salve', count: 1 }, charPharm);
assert(salveHtml.indexOf('可用 3 次') >= 0, '外敷显示按次用量');
assert(salveHtml.indexOf('外敷') >= 0 && salveHtml.indexOf('活络·外敷·常效') >= 0, '外敷显示活络族');
ok('外敷药 tooltip：按次用量 + 活络族');

// 动态注射液实例：保留完整成分，不再存在沉淀成品。
const compoundInst = { item_id: 'potion_compound_injection', count: 1, components: [{ item_id: 'solvent_saline', count: 1 }, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'adj_vitamin_c', count: 1 }], pharmacy_formula_key: 'adj_vitamin_cx1+med_cocaine_powderx1+solvent_salinex1', pharmacy_rules_version: 2 };
const compHtml = uiSandbox.SceneUi.buildItemTooltipHtmlForTemplate('potion_compound_injection', items.potion_compound_injection, compoundInst, charPharm);
assert(compHtml.indexOf('成分') >= 0 && compHtml.indexOf('可卡因粉×1') >= 0 && compHtml.indexOf('维生素C×1') >= 0, '实例显示成分列表：' + (compHtml.match(/成分[^<]*/) || [''])[0]);
assert(compHtml.indexOf('有沉淀') < 0, '合法动态注射液不显示已退役的沉淀成品标记');
ok('动态注射液 tooltip：完整成分与规则身份');

// 药粉：投料信息（药效族/毒性/浓度占用/成分身份）
const powderHtml = uiSandbox.SceneUi.buildItemTooltipHtmlForTemplate('med_morphine_powder', items.med_morphine_powder, null, charPharm);
assert(powderHtml.indexOf('制药信息') >= 0, '药粉走「制药信息」块');
assert(powderHtml.indexOf('镇痛') >= 0 && powderHtml.indexOf('生物碱') >= 0, '药粉显示药效族 + 成分身份');
assert(powderHtml.indexOf('浓度占用') >= 0 && powderHtml.indexOf('35') >= 0, '药粉显示浓度占用');
ok('药粉 tooltip：药效族 / 成分身份 / 毒性 / 浓度占用');

// 信息分级：0 级制药只看得到给药方式与风险提示，看不到数值
const charNoSkill = { skills: {} };
const lockedHtml = uiSandbox.SceneUi.buildItemTooltipHtmlForTemplate('potion_analgesic_pill_potent', analgesicTpl, null, charNoSkill);
assert(lockedHtml.indexOf('给药方式') >= 0, '无技能仍显示给药方式');
assert(lockedHtml.indexOf('制药经验不足') >= 0, '数值区显示锁定提示（信息分级）');
assert(lockedHtml.indexOf('持续 10 tick') < 0, '无技能看不到药效数值');
ok('信息分级：常驻（方式/风险）vs 技能解锁（族/档位/数值）');

console.log('\n㉓ 相冲表扩展（剂量分档 / 溶媒助溶豁免）');
const lowDose = PCC.resolve([{ item_id: 'solvent_water_pure', count: 1 }, { item_id: 'med_cardiac_powder', count: 1 }, { item_id: 'med_rehydration_powder', count: 1 }]);
assert.strictEqual(lowDose.conflicts.length, 1, '强心苷 + 矿物盐 → 命中');
assert.strictEqual(lowDose.conflicts[0].outcome, 'settle_mild', '低剂量（' + lowDose.conflicts[0].dose + ' < 40）→ 轻症沉淀');
const highDose = PCC.resolve([{ item_id: 'solvent_water_pure', count: 1 }, { item_id: 'med_cardiac_powder', count: 2 }, { item_id: 'med_rehydration_powder', count: 1 }]);
assert.strictEqual(highDose.conflicts.length, 1);
assert.strictEqual(highDose.conflicts[0].outcome, 'toxic_severe', '高剂量（' + highDose.conflicts[0].dose + ' ≥ 40）→ 重症');
const newPairs = [
  ['med_liver_herb_powder', 'med_notoginseng_powder', 'glycoside_tannin'],
  ['med_morphine_powder', 'med_rehydration_powder', 'alkaloid_mineral'],
  ['med_thc_powder', 'med_baiji_powder', 'volatile_oil_tannin']
];
newPairs.forEach(([a, b, rid]) => {
  const r = PCC.resolve([{ item_id: 'solvent_water_pure', count: 1 }, { item_id: a, count: 1 }, { item_id: b, count: 1 }]);
  assert(!!r.conflicts.find((c) => c.rule_id === rid), '新增规则命中 ' + rid + '（实际：' + r.conflicts.map((c) => c.rule_id).join(',') + '）');
});
ok('相冲表 9 条类别对 + 剂量分档（低剂量轻症 / 高剂量重症）');

const waterOil = PCC.resolve([{ item_id: 'solvent_water_pure', count: 1 }, { item_id: 'med_thc_powder', count: 1 }]);
assert(waterOil.conflicts.some((c) => c.rule_id === 'water_volatile_oil'), '纯水兑挥发油 → 不分层');
const waterOilAdj = PCC.resolve([{ item_id: 'solvent_water_pure', count: 1 }, { item_id: 'med_thc_powder', count: 1 }, { item_id: 'adj_vitamin_c', count: 1 }]);
assert(!waterOilAdj.conflicts.some((c) => c.rule_id === 'water_volatile_oil'), '加助剂后该错配不触发（助溶兜底）');
ok('溶媒错配新增「纯水 × 挥发油」+ 助剂助溶豁免');

console.log('\n㉔ 吸入用耗时区分（§5.2 裁决）');
PS.setConfig({ systemConfig: cfg });
assert.strictEqual(IU.getUseTickCost({ use_action: 'drink' }), 1, '口服 1 tick');
assert.strictEqual(IU.getUseTickCost({ use_action: 'topical' }), 1, '外敷 1 tick');
assert.strictEqual(IU.getUseTickCost({ use_action: 'inhale' }), 2, '吸入 2 tick');
assert.strictEqual(IU.getUseTickCost({ use_action: 'inject' }), 3, '刺入 3 tick');
assert.strictEqual(IU.getUseTickCost({}), 1, '非药品默认 1 tick');
assert(readText('js/scene-app.js').includes('advanceWorldTicks(useTicks)'), '使用流程按途径推进 tick');
ok('四途径使用耗时：口服/外敷 1 · 吸入 2 · 刺入 3（配置化）');

console.log('\n㉕ 成瘾/免疫/致死窗口数值（2026-09 定稿）');
const c2 = PC.parseCsv(pharmacyCsv);
assert.strictEqual(Number(c2.pharmacy_addiction_gain_drink), 3);
assert.strictEqual(Number(c2.pharmacy_addiction_gain_inhale), 8);
assert.strictEqual(Number(c2.pharmacy_addiction_gain_inject), 12);
assert.strictEqual(Number(c2.pharmacy_addiction_decay_per_tick), 0.02, '衰减 ≈0.4/分钟');
assert.strictEqual(Number(c2.pharmacy_addiction_immunity_gain_reduction), 0.005, '免疫满级 −50% 累积');
assert.strictEqual(Number(c2.pharmacy_addiction_immunity_decay_bonus), 0.015, '免疫满级 ×2.5 衰减');
assert.strictEqual(Number(c2.pharmacy_toxicity_decay_per_tick), 1.5);
assert.strictEqual(Number(c2.pharmacy_toxicity_lethal_ticks), 16);
function diesAt(startTox) {
  let tox = startTox;
  let ticks = 0;
  let inDanger = 0;
  while (ticks < 400) {
    tox = Math.max(0, tox - 1.5);
    ticks++;
    if (tox >= 56) { inDanger++; if (inDanger >= 16) return ticks; } else { inDanger = 0; }
  }
  return null;
}
assert.strictEqual(diesAt(79), null, '初始毒性 79 → 危险区不足 16 tick，活下来');
assert(diesAt(81) !== null, '初始毒性 81 → 致死');
assert.strictEqual(diesAt(100), 16, '初始毒性 100 → 满 16 tick 即死');
ok('致死窗口：门槛 ≈80（79 存活 / 81 致死 / 100 在 16 tick 内致死）');

console.log('\n㉖ 精制链（四个高层工艺 + 粗制/精制两档）');
const phRecipes2 = Object.keys(recipesDoc.recipes).map((k) => recipesDoc.recipes[k]).filter((r) => r.recipe_system === 'life_pharmacy');
const usedMethods = new Set(phRecipes2.map((r) => r.method_id));
const allPhMethods = Object.keys(recipeMethods.methods).filter((k) => k.indexOf('life_pharmacy.') === 0);
assert.strictEqual(allPhMethods.filter((m) => !usedMethods.has(m)).join(','), '', '9 个制药方法全部有配方（缺：' + allPhMethods.filter((m) => !usedMethods.has(m)).join(',') + '）');
['filtration', 'distillation', 'centrifugation', 'crystallization'].forEach((k) => {
  const gate = recipeMethods.methods['life_pharmacy.' + k].unlock;
  assert(Array.isArray(gate) && gate[0] && gate[0].type === 'skill_level_min' && gate[0].skill_id === 'life_pharmacy', k + ' 有技能解锁门槛');
});
[['med_morphine_powder', 'med_morphine_powder_refined'], ['med_thc_powder', 'med_thc_powder_refined'], ['med_psilocybin_powder', 'med_psilocybin_powder_refined']].forEach(([raw, ref]) => {
  const a = items[raw];
  const b = items[ref];
  assert(b && Number(b.pharm_effect) > Number(a.pharm_effect), ref + ' 药效更高');
  assert(Number(b.pharm_toxicity) < Number(a.pharm_toxicity), ref + ' 毒性更低');
  assert(Number(b.concentration_cost) < Number(a.concentration_cost), ref + ' 浓度占用更低');
});
assert(!items.potion_analgesic_injection_refined && !items.potion_antistun_injection_refined, '精制药粉不再生成固定注射成品');
const refinedAntistun = PCC.resolve([SOLVENT, { item_id: 'med_acorus_powder_refined', count: 1 }, { item_id: 'adj_vitamin_c', count: 1 }]);
assert(refinedAntistun.ok && refinedAntistun.buff_ids.includes('buff_pharm_antistun_inject_potent'), '精制醒神粉经动态配置进入 potent 档');
ok('精制链：9/9 方法有配方 + 高层技能门 + 精制粉更纯更省浓度 + 动态注射升档');

console.log('\n㉗ 制药不接鉴定（2026-09 裁决）');
const fieldRulesDoc = loadJson('data/item-field-display-rules.json');
const pharmFields = Object.keys(fieldRulesDoc.fields).filter((k) => /^(use_action|use_charges|use_buff_id|pharmacy_compound|concentration_|adjuvant_strength|pharm_|chem_class|components)/.test(k));
const wrongSkill = pharmFields.filter((k) => {
  const sid = fieldRulesDoc.fields[k].skill_id;
  return sid != null && sid !== '' && sid !== 'life_pharmacy';
});
assert.strictEqual(wrongSkill.join(','), '', '制药字段只用 life_pharmacy 门闸（不接鉴定）：' + wrongSkill.join(','));
assert(pharmFields.length >= 11, '制药字段规则齐备（' + pharmFields.length + ' 条）');
ok('制药产物信息门槛 = 药学等级（鉴定留给其他系统）');

console.log('\n㉘ 加工阶梯（粗制 → 精制 → 精炼，越加工越好、粗制也能用）');
const ladder = [
  ['med_morphine_powder', 'med_morphine_powder_refined', 'med_morphine_powder_purified'],
  ['med_thc_powder', 'med_thc_powder_refined', 'med_thc_powder_purified'],
  ['med_safflower_powder', 'med_safflower_powder_refined', 'med_safflower_powder_purified']
];
ladder.forEach(([t1, t2, t3]) => {
  const a = items[t1];
  const b = items[t2];
  const c = items[t3];
  assert(a && b && c, t1 + ' 三层齐全');
  assert(Number(b.pharm_effect) > Number(a.pharm_effect) && Number(c.pharm_effect) > Number(b.pharm_effect), t1 + ' 药效逐层递增');
  if (Number(a.pharm_toxicity) > 0) {
    assert(Number(b.pharm_toxicity) < Number(a.pharm_toxicity) && Number(c.pharm_toxicity) < Number(b.pharm_toxicity), t1 + ' 毒性逐层递减');
  } else {
    assert(Number(b.pharm_toxicity) === 0 && Number(c.pharm_toxicity) === 0, t1 + ' 功能成分毒性恒 0');
  }
  assert(Number(b.concentration_cost) < Number(a.concentration_cost) && Number(c.concentration_cost) < Number(b.concentration_cost), t1 + ' 浓度占用逐层递减');
});
ok('三层阶梯：药效↑ / 毒性↓ / 浓度占用↓（吗啡 85→106→128）');

// 粗制品仍可用：T1 粉末照样能配药出针（档位较低但可用）
const t1Mix = PCC.resolve([{ item_id: 'solvent_saline', count: 1 }, { item_id: 'med_morphine_powder', count: 1 }, { item_id: 'adj_vitamin_c', count: 1 }]);
assert(t1Mix.ok && t1Mix.buff_ids.length === 1, 'T1 粗制吗啡粉可配药：' + (t1Mix.buff_ids[0] || ''));
assert.strictEqual(t1Mix.buff_ids[0], 'buff_pharm_analgesic_inject_potent', 'T1 → potent 档');
const t3Mix = PCC.resolve([{ item_id: 'solvent_saline', count: 1 }, { item_id: 'med_morphine_powder_purified', count: 1 }, { item_id: 'adj_vitamin_c', count: 1 }]);
assert.strictEqual(t3Mix.buff_ids[0], 'buff_pharm_analgesic_inject_pure', 'T3 精炼吗啡粉 → pure 档（升档）');
assert(t3Mix.net_toxicity < t1Mix.net_toxicity, 'T3 净毒性低于 T1（' + t3Mix.net_toxicity + ' < ' + t1Mix.net_toxicity + '）');
ok('粗制可用（potent）/ 精炼升档（pure）且更干净');

// 固定注射成品已经退役；精炼口服/外敷成品仍走 pure buff，注射由精炼药粉动态升档
['potion_calm_brew_purified', 'potion_mobility_salve_purified'].forEach((id) => {
  assert(/_pure$/.test(items[id].use_buff_id), id + ' 引用 pure 档 buff（实际 ' + items[id].use_buff_id + '）');
});
assert(items.potion_calm_brew_purified && items.potion_mobility_salve_purified, '口服/外敷也有精炼成品');
assert(!items.potion_analgesic_injection_purified && !items.potion_stimulant_injection_purified, '固定注射成品已退出目录');
assert(loadJson('data/buffs.json').buffs.some((b) => b.pharmacy_potency === 'pure'), 'pure 档 buff 模板已生成');
ok('精炼口服/外敷成品引用 pure；注射由精炼粉动态升档');

console.log('\n㉙ 损毁恢复（09「损毁恢复」：自然自愈 + 外敷活络药）');

// 参数口径（survival-config）
const rcCfg = CA3.getPartRecoverCfg();
assert.strictEqual(rcCfg.grace, 40, '受击宽限 40 tick');
assert.strictEqual(rcCfg.interval, 6, '四肢 6 tick / 点');
assert.strictEqual(rcCfg.rest_multiplier, 3, '休息 ×3');
assert.strictEqual(rcCfg.part_multiplier.head, 0.5, '头部系数 0.5（最慢）');
assert.strictEqual(rcCfg.part_multiplier.lhand, 1, '四肢系数 1.0');
ok('自然自愈参数：宽限 40 / 间隔 6 / 休息 ×3 / 逐部位系数');

// 吃损毁 → 重置宽限；宽限内不回落
S3.setResting(false);
CA3.setState(CA3.getDefaultState());
CA3.applyCombatDestroy('lhand', 30);
assert.strictEqual(CA3.getPartDestroy('lhand'), 30, '受击写入 30 损毁');
assert.strictEqual(CA3.getDestroyRecoverBlockTicks(), 40, '受击即重置宽限计时');
for (let i = 0; i < 40; i++) CA3.onWorldTickDestroyRecover();
assert.strictEqual(CA3.getPartDestroy('lhand'), 30, '宽限 40 tick 内损毁不回落');
for (let i = 0; i < 6; i++) CA3.onWorldTickDestroyRecover();
assert.strictEqual(CA3.getPartDestroy('lhand'), 29, '宽限结束 + 6 tick → 四肢恢复 1 点');
ok('自然自愈：宽限 40 tick 后每 6 tick −1（四肢）');

// 部位系数差异：头 0.5（60 tick 5 点）/ 腹 0.7（60 tick 7 点）
CA3.setState(CA3.getDefaultState());
CA3.applyCombatDestroy('head', 20);
CA3.applyCombatDestroy('abdomen', 20);
for (let i = 0; i < 40; i++) CA3.onWorldTickDestroyRecover();
for (let i = 0; i < 60; i++) CA3.onWorldTickDestroyRecover();
assert.strictEqual(CA3.getPartDestroy('head'), 15, '头 0.5 系数：60 tick 恢复 5 点');
assert.strictEqual(CA3.getPartDestroy('abdomen'), 13, '腹 0.7 系数：60 tick 恢复 7 点');
ok('部位系数：头 5 点 / 腹 7 点（同一 60 tick 窗口）');

// 休息加速：×3
CA3.setState(CA3.getDefaultState());
S3.setResting(true);
CA3.applyCombatDestroy('lhand', 30);
for (let i = 0; i < 40; i++) CA3.onWorldTickDestroyRecover();
for (let i = 0; i < 6; i++) CA3.onWorldTickDestroyRecover();
assert.strictEqual(CA3.getPartDestroy('lhand'), 27, '休息 ×3 → 6 tick 恢复 3 点');
S3.setResting(false);
ok('休息加速：静止休息时自愈 ×3');

// 外敷活络药：逐 tick 降损毁，不受宽限限制
assert.strictEqual(PE.getPartRecoveryPerTick({ recovery_per_tick: 0.32 }), 0.32, 'recovery_per_tick 直读');
['weak', 'regular', 'potent', 'pure'].forEach((p) => {
  const t = buffById['buff_pharm_mobility_topical_' + p];
  assert(t && t.effects[0].type === 'pharmacy_part_recovery' && t.effects[0].params.recovery_per_tick > 0, p + ' 外敷活络药带 recovery_per_tick');
});
CA3.setState(CA3.getDefaultState());
CA3.applyCombatDestroy('rfoot', 20);
buffSandbox.GameTime.tick = 0;
BS3.removeBuffByBuffId('player', 'buff_pharm_mobility_topical_potent');
BS3.applyBuff('player', 'buff_pharm_mobility_topical_potent', 'test:smoke');
PE.setTopicalTarget('buff_pharm_mobility_topical_potent', 'rfoot');
assert.strictEqual(PE.getTopicalTarget('buff_pharm_mobility_topical_potent'), 'rfoot', '外敷目标部位登记');
buffSandbox.GameTime.advanceTicks(3);
assert.strictEqual(PE.tickPartRecovery(), 0, '强效 0.32/tick：1 tick 未满 1 点');
for (let i = 0; i < 3; i++) PE.tickPartRecovery();
assert.strictEqual(CA3.getPartDestroy('rfoot'), 19, '外敷强效 4 tick → 恢复 1 点（宽限期内照样治）');
ok('外敷活络药：强效 0.32/tick（约 4 tick 1 点，90 tick ≈ 29 点）');

// 成品链：精炼红花活络膏走 pure 档 → 0.4/tick（约 90 tick 36 点）
const pureSalveTpl = buffById[items.potion_mobility_salve_purified.use_buff_id];
assert(pureSalveTpl, '精炼红花活络膏引用 buff 存在');
assert.strictEqual(PE.getPartRecoveryPerTick(pureSalveTpl.effects[0].params), 0.4, '精炼外敷膏 = 0.4/tick');
ok('成品链：精炼红花活络膏（pure）0.4/tick');

// 无登记部位 → 兜底落「伤最重部位」；onWorldTick 也跑恢复
CA3.setState(CA3.getDefaultState());
CA3.applyCombatDestroy('chest', 10);
CA3.applyCombatDestroy('rhand', 40);
PE.setState({ topical_parts: {} });
BS3.removeBuffByBuffId('player', 'buff_pharm_mobility_topical_potent');
BS3.applyBuff('player', 'buff_pharm_mobility_topical_potent', 'test:smoke');
buffSandbox.GameTime.advanceTicks(3);
let changedByRecovery = false;
for (let i = 0; i < 4; i++) { if (PE.onWorldTick() === true) changedByRecovery = true; }
assert.strictEqual(CA3.getPartDestroy('rhand'), 39, '无登记 → 落伤最重部位（rhand 40/100）');
assert.strictEqual(CA3.getPartDestroy('chest'), 10, 'chest 不受影响');
assert(changedByRecovery, 'PharmacyEffects.onWorldTick 恢复落地 → changed');
BS3.removeBuffByBuffId('player', 'buff_pharm_mobility_topical_potent');
ok('兜底落点（伤最重部位）+ 世界 tick 接线');

// 存档字段（getState/setState 往返）
const recoverSnap = CA3.getState();
assert(recoverSnap.part_destroy_recover_acc && recoverSnap.part_destroy_recover_acc.rhand >= 0, '存档含每部位恢复进度');
assert(recoverSnap.destroy_recover_block_ticks >= 0, '存档含宽限计时');
CA3.setState({ part_destroy_recover_acc: { lfoot: 0.5 }, destroy_recover_block_ticks: 7 });
assert(Math.abs(CA3.getPartDestroyRecoverAcc('lfoot') - 0.5) < 1e-9, '恢复进度可回读');
assert.strictEqual(CA3.getDestroyRecoverBlockTicks(), 7, '宽限计时可回读');
assert.strictEqual(PE.getState().topical_parts && typeof PE.getState().topical_parts === 'object', true, 'pharmacy_effects 含外敷部位表（随存档持久化）');
ok('恢复进度 / 宽限计时 / 外敷部位表 全部进存档');

console.log('\n[smoke-pharmacy] ' + pass + ' 组断言全部通过');
