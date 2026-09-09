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
      if (tpl.onsetTicks !== rp.onset_ticks || tpl.durationTicks !== rp.duration_ticks) routeMismatch.push(id);
    });
  });
});
assert.strictEqual(missingCells.join(','), '', '矩阵有效格子应全部落成 buff：' + missingCells.slice(0, 5).join(','));
assert.strictEqual(routeMismatch.join(','), '', '生效时间/持续时间应取自途径档：' + routeMismatch.slice(0, 5).join(','));
ok('剂型矩阵 ' + cellCount + ' 个有效格子（family × route × potency）全部生成');

// 峰值缩放：inject 峰值 1.0 × potent 1.5 = 1.5；drink 0.8 × weak 0.5 = 0.4
const stimInjectPotent = buffById['buff_pharm_stimulant_inject_potent'];
const stimDrinkWeak = buffById['buff_pharm_stimulant_drink_weak'];
const energyOf = (tpl) => (tpl.effects.find((e) => e.type === 'survival_delta') || { params: {} }).params.energy;
assert.strictEqual(energyOf(stimInjectPotent), 1.8, '注射·强效 兴奋 energy = 1.2×1.0×1.5');
assert.strictEqual(energyOf(stimDrinkWeak), 0.48, '口服·弱效 兴奋 energy = 1.2×0.8×0.5');
assert.strictEqual(stimInjectPotent.onsetTicks, 0, '注射立即生效');
assert.strictEqual(stimDrinkWeak.onsetTicks, 5, '口服 5 tick 起效');
ok('峰值强度 = 途径峰值 × potency 档（注射强效 1.8 / 口服弱效 0.48）');

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
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_potent', 'test:smoke');
const speed = BS3.getBattleMoveSpeedMultiplier('player');
assert(Math.abs(speed - 1.12) < 1e-6, '注射强效兴奋出手速度乘区 = 1 + 0.08×1.5 = 1.12（实际 ' + speed + '）');
ok('注射立即生效：出手速度乘区 1.12');

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

// 途径增量：外敷 0 / 口服 +4 / 刺入 +15（联合按成分数累加）
assert.strictEqual(PE.getRouteGain('topical'), 0, '外敷不涨瘾');
assert.strictEqual(PE.getRouteGain('drink'), 4, '口服增量 4');
assert.strictEqual(PE.getRouteGain('inject'), 15, '刺入增量 15');
assert.strictEqual(PE.addAddictionFromRoute('topical'), 0, '外敷用药后成瘾仍为 0');
assert.strictEqual(PE.addAddictionFromRoute('drink'), 4, '口服一次 → 4');
assert.strictEqual(PE.addAddictionFromRoute('inject', 3), 49, '联合注射液 3 成分 → 4 + 15×3 = 49');
ok('途径增量与联合累加（外敷恒 0）');

// 四阶段阈值 + 阶段惩罚 buff + 乘区
assert.strictEqual(PE.getAddictionStage(24), 1);
assert.strictEqual(PE.getAddictionStage(49), 2);
assert.strictEqual(PE.getAddictionStage(60), 3);
assert.strictEqual(PE.getAddictionStage(80), 4);
assert.strictEqual(PE.getState().stage, 2, '成瘾 49 → 阶段二');
assert(BS3.hasBuffByBuffId('player', 'buff_pharm_addiction_stage2'), '阶段二惩罚 buff 在场');
assert(Math.abs(CA3.getExternalAcquiredMultiplier().jingu - 0.9) < 1e-9, '阶段二五维 ×0.90');
ok('四阶段阈值 + 阶段惩罚（−10%/−20%/−35%）');

// 压制：入体途径 potency 够档 → 惩罚暂时取消（§4.4）
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_weak', 'test');
assert(PE.isPenaltySuppressed(), '阶段二 + 弱效注射药 → 压制成立');
assert(Math.abs(CA3.getExternalAcquiredMultiplier().jingu - 1) < 1e-9, '压制期间五维乘区恢复 1.0');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_weak');
PE.addAddiction(15); // 49+15=64 → 阶段三（需 ≥regular）
assert.strictEqual(PE.getState().stage, 3, '成瘾 64 → 阶段三');
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_weak', 'test');
assert(!PE.isPenaltySuppressed(), '阶段三：弱效压不住');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_weak');
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_regular', 'test');
assert(PE.isPenaltySuppressed(), '阶段三：常效可压');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_regular');
ok('potency 压制门槛（阶段二 ≥weak / 阶段三 ≥regular）');

// 免疫三向接线（§4.5）
immunityLevel = 100;
assert(PE.getRouteGain('inject') < 15 * 0.06 && PE.getRouteGain('inject') > 0, '免疫 100 级 → 累积增量大幅减免');
const beforeDecay = PE.getAddiction();
PE.onWorldTick();
const decayWithImmunity = beforeDecay - PE.getAddiction();
immunityLevel = 0;
assert(decayWithImmunity > 0.05, '免疫加速自然衰减（' + decayWithImmunity.toFixed(3) + ' > 0.05）');
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
assert(PE.getLethalTicksRemaining() === 39, '倒计时上限 40（已走 1 tick）');
PE.accelerateToxicityDecay(100);
assert.strictEqual(PE.getToxicityBand(), 'none', '解毒加速 → 毒性清空');
PE.onWorldTick();
assert(!PE.isLethalCountdownActive(), '降到重档之下 → 倒计时清零');
ok('毒性档位映射 + 解毒清空 + 倒计时脱离');

// 走完倒计时 → setDead('drug_toxicity')
// 注：自然衰减 1/tick + 重档门槛 56 + 倒计时 40 → 需初始毒性 ≥96 才可能在致命区待满 40 tick
// （47 §9.2 数值标 ❓，k246 收口时需调平衡；此处按当前配置验证链路本身）。
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
  addAddictionFromRoute(route, n) { addictionCalls.push([route, n]); return 0; }
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

// B. 成盐不足 → 沉淀注射液：可卡因 35 + 吗啡 35 + 护肝草 30 = 100（无余量放助剂）
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
ok('成盐不足 → 沉淀注射液（药效 ×0.5 / 净毒性 ×1.5，配得出来但坑）');

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
// 功能成分（toxicity=0）与助剂不参与相冲
const noConflict1 = PCC.resolve([SOLVENT, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'med_rehydration_powder', count: 1 }]);
assert.strictEqual(noConflict1.conflicts.length, 0, '功能成分不参与相冲');
const noConflict2 = PCC.resolve([SOLVENT, { item_id: 'med_cocaine_powder', count: 1 }, { item_id: 'adj_citric_acid', count: 1 }]);
assert.strictEqual(noConflict2.conflicts.length, 0, '助剂（成盐助溶）不参与相冲');
ok('相冲类别级判定 + 助剂/溶媒/功能成分豁免');

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
assert(addictionCalls.length === 1 && addictionCalls[0][0] === 'inject' && addictionCalls[0][1] === 1, '成瘾按刺入途径 1 份累加');
// 沉淀针实例自带标记
const builtPrecip = PCC.buildInstance(speedball);
assert.strictEqual(builtPrecip.instance.precipitated, true, '沉淀针实例带 precipitated 标记');
assert.strictEqual(builtPrecip.instance.salt_deficit, 2, '实例记录成盐缺口');
ok('动态注射液实例 + 一次滴注多族 buff + 毒性/成瘾结算');

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

// 制药水口径：纯净水 = 制药溶媒（配药底液 + 配方用水）；纯净软水留给烹饪
const pureRecipes = Object.keys(recipesDoc.recipes)
  .filter((k) => recipesDoc.recipes[k].recipe_system === 'life_pharmacy')
  .filter((k) => (recipesDoc.recipes[k].inputs || []).some((i) => i.item_id === 'ore_water_pure_soft'));
assert.strictEqual(pureRecipes.length, 0, '制药配方不再使用烹饪水（纯净软水）：' + pureRecipes.join(','));
assert.strictEqual(PCC.classifyItem('solvent_water_pure'), 'solvent', '纯净水是配药溶媒');
assert(PCC.getConcentrationInfo([{ item_id: 'solvent_water_pure', count: 1 }, { item_id: 'med_cocaine_powder', count: 1 }]).used === 35, '溶媒不占浓度');
ok('制药水口径：纯净水=溶媒（不占浓度）/ 纯净软水=烹饪水');

console.log('\n⑯ 成盐判定接线（§9.5）');
const panelSrc2 = readText('js/pharmacy-station-panel.js');
const cfgCsv = readText('data/pharmacy-system-config.csv');
assert(panelSrc2.includes('getSaltRequirement'), '面板读取成盐需求');
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
assert.strictEqual(dur0, 10, '注射剂型基准时长 10 tick');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_regular');
immunityLevel = 100;
BS3.applyBuff('player', 'buff_pharm_stimulant_inject_regular', 'test:imm');
const inst1 = (BS3.getState().instancesByOwner['player'] || []).find((i) => i.buff_id === 'buff_pharm_stimulant_inject_regular');
const dur1 = inst1.expires_at_tick - inst1.started_tick;
assert(Math.abs(dur1 - dur0 * 2) <= 1, '免疫 100 级 → 时长 ×2（' + dur0 + '→' + dur1 + '）');
BS3.removeBuffByBuffId('player', 'buff_pharm_stimulant_inject_regular');
ok('免疫延长药效持续时间（§4.5 / 11-skills）');

// 副作用强度：免疫 50 级 → 减免 80%（封顶）→ 缩放 0.2
immunityLevel = 50;
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

console.log('\n[smoke-pharmacy] ' + pass + ' 组断言全部通过');
