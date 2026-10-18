import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Design tables only; this builder does not register recipes or change runtime saves.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const source = read('docs/design/examples/weapon-forging-material-requirements-v1.json');
const oreBase = read('docs/design/examples/weapon-forging-ores-v1.json');
const oreExtra = read('docs/design/examples/weapon-ore-intrinsic-traits-v1.json');
const repair = read('docs/design/examples/weapon-repair-tool-knowledge-v1.json');
const oreTicks = {
  ore_iron_raw: 2, ore_copper_raw: 2, ore_tin_raw: 2, ore_lead_raw: 2,
  ore_zinc_raw: 2, ore_titanium_raw: 3, ore_tungsten_raw: 4, ore_molybdenum_raw: 3,
  ore_manganese_raw: 3, ore_antimony_raw: 2, ore_silver_raw: 2, ore_gold_raw: 2,
};
const cumulativeXp = level => 25 * (level - 1) * (level + 2);
const components = source.components.map(c => {
  const n = c.capacity, s = c.tier, e = 4 + n + 2 * s;
  const handlingTicks = Math.ceil(n / 6);
  return {
    id: c.id, name: c.name, tier: s, capacity: n,
    craft: { ticks: 12, baseStamina: 2 * n + 2 * s, baseXp: e,
      xpByStars: [e / 4, e, e * 1.5, e * 2.5] },
    research: { ticks: Math.ceil(n / 2) + s, baseStamina: n + s,
      xp: 2 * n + 4 * s, sampleCount: 1, destroysSample: true,
      repeatKnownStructureAllowed: false },
    attach: { ticks: handlingTicks, baseStamina: handlingTicks * 2, xp: 0 },
    detach: { ticks: handlingTicks, baseStamina: handlingTicks * 2, xp: 0 },
    repairToolId: repair.repair_targets[c.id],
  };
});
const ores = [...oreBase.ores, ...oreExtra.oreAdditions].map(o => ({
  id: o.id, name: o.name,
  processing: { inputCount: 1, outputFeedCount: 1, byproducts: [],
    ticks: oreTicks[o.id], baseStamina: oreTicks[o.id], xp: oreTicks[o.id] / 4,
    outputRouteKey: o.id, outputItemId: o.id.replace(/^ore_/, 'material_forging_').replace(/_raw$/, '') },
}));
const levels = Array.from({ length: 100 }, (_, i) => {
  const level = i + 1;
  return { level, cumulativeXp: cumulativeXp(level),
    nextLevelXp: level === 100 ? null : 50 * level + 50,
    hammerBudget: level < 25 ? 8 : level < 75 ? 9 : 10,
    collectibleCells: level < 50 ? 2 : level < 100 ? 3 : 4,
    staminaReductionBps: 20 * level,
    repairRatioNumerator: level + 98, repairRatioDenominator: 198,
  };
});
const table = {
  version: 1, date: '2026-10-17', status: 'trial_balance_design_only',
  skillId: 'life_forging', sourceDoc: '../weapon-forging-costs-and-progression.md',
  description: '83件部件、12种原矿与1至100级的首版成本成长表；未注册到游戏或试玩。',
  sources: ['weapon-forging-material-requirements-v1.json', 'weapon-forging-ores-v1.json',
    'weapon-ore-intrinsic-traits-v1.json', 'weapon-repair-tool-knowledge-v1.json'],
  confirmedRules: { oreToFeed: [1, 1], noByproducts: true, craftFixedTicks: true,
    starsCompletionPercent: [60, 80, 100], craftXpMultipliers: [0.25, 1, 1.5, 2.5],
    noFuelManagement: true, noSalvage: true, acquisition: 'pending' },
  numericalChoices: { craftTicks: 12, craftBaseStamina: '2 * capacity + 2 * tier',
    craftBaseXp: '4 + capacity + 2 * tier',
    researchTicks: 'ceil(capacity / 2) + tier', researchBaseStamina: 'capacity + tier',
    researchXp: '2 * capacity + 4 * tier', handlingTicks: 'ceil(capacity / 6)',
    handlingBaseStamina: '2 * handlingTicks', processingXpPerTick: 0.25 },
  accounting: { xpUnitsPerPoint: 1000, staminaBillingQuantum: 0.1,
    staminaRounding: 'ceil_once_after_all_modifiers', durabilityQuantum: 0.01,
    productPowerQuantum: 0.01, productPowerRounding: 'half_up_at_final_product',
    processingSettlementUnit: 'one_raw_item',
    craftSettlementUnit: 'one_real_component_instance',
    assemblySettlementUnit: 'one_changed_real_instance_per_attach_or_detach',
    skillLevelSnapshot: 'operation_start',
    normalTemperatureOnlyInExamples: true, environmentCostSnapshot: 'operation_start',
    worldCostModifiers: 'use_current_shared_action_cost_once; no_invented_endurance_rate',
    noXpOperations: ['view', 'cancel', 'abandon', 'attach', 'detach', 'equip', 'swap_toolkit'] },
  progression: { minLearnedLevel: 1, maxLevel: 100, entryXp: 0,
    learnOnFirstSuccessfulWork: true, cumulativeXpFormula: '25 * (level - 1) * (level + 2)',
    nextLevelXpFormula: '50 * level + 50', maxXp: cumulativeXp(100),
    xpIsCurrentProgressNotLifetimeTotal: true, deathPolicy: 'follow_existing_level_loss_and_synchronize_progress',
    zeroLevelRepairUsesLevel: 1, zeroLevelDiscountBps: 0,
    zeroLevelGrantsKnowledge: false, levelGatesOnRecipes: false },
  knowledgeUnlocks: [
    { level: 0, group: 'operation', fields: ['quoted_ticks', 'quoted_stamina', 'owned_input_count',
      'known_component_capacity', 'board_completion'],
      requires: ['target_seen', 'operation_available'], allowsUnseenEnumeration: false },
    { level: 10, group: 'material_scores', fields: ['hardness', 'toughness', 'deformationResistance',
      'density', 'known_component_material_requirements', 'known_plan_achievement_ratios'],
      requires: ['material_seen', 'forge_use_known', 'feed_route_known', 'component_structure_known_for_targets'],
      allowsUnseenEnumeration: false },
    { level: 25, group: 'product_potential', fields: ['power_potential', 'durability_potential',
      'contact_loss_potential', 'material_adjusted_requirement', 'own_product_exact_performance'],
      requires: ['all_contributing_material_routes_known', 'component_structure_known',
        'instance_recipe_known_for_reverse_calculation'], allowsUnseenEnumeration: false },
    { level: 50, group: 'trait_strength', fields: ['known_intrinsic_strength', 'known_combination_strength',
      'known_penalty_strength'],
      requires: ['trait_effect_known', 'trait_trigger_known', 'relevant_route_known',
        'known_recipe_and_inheritance_rule_when_predicting'],
      allowsUnseenEnumeration: false, exposesUnrolledWinner: false },
  ],
  operationPolicies: {
    oreProcessingInspection: oreBase.itemInformation.recognitionMethod.processingInspection,
    craft: { chargeMaterialsAtStart: true, timePhase: 'before_board_play',
      saveElapsedCostTicks: true, resumeDoesNotReroll: true, completionXpOnce: true,
      staminaBasis: 'fixed_capacity_and_tier_not_actual_input_or_hammer_clicks' },
    research: { stationRequired: true, consumeSampleAtStart: true,
      resumeSameJob: true, xpAndKnowledgeOnCompletionOnly: true,
      knownStructureIsNoOp: true, grantsAllMaterialRecipes: false },
    processing: { stationRequired: true, requiresKnownRoute: true, batchExpandsIntoUnitJobs: true,
      inputConsumedAndOutputCommittedTogetherOnUnitCompletion: true,
      interruptedUnitGivesNoFeedOrXp: true, completedUnitsKept: true },
    assembly: { stationRequired: true, noChangeNoCost: true,
      swapChargesDetachPlusAttach: true, multiSlotCountedByInstance: true,
      unchangedPositionsKeepLoadout: true, changedPositionsResetToFallback: true },
  },
  repair: { formulaLevelRange: [1, 100], ratio: '(level + 98) / 198',
    ticksPerTenDurability: 1, baseStaminaPerDurability: 0.2, xpPerDurability: 0.1,
    staminaReductionPerLevel: 0.002, maxStaminaReduction: 0.2,
    enabledWhen: 'out_of_combat && matching_tool_in_selected_toolkit && current < ability_cap',
    interruptedGivesDurabilityOrXp: false, refundsSpentCosts: false, preservesPartialProgress: false },
  components, ores, levels,
};

assert.equal(components.length, 83);
assert.equal(new Set(components.map(c => c.id)).size, 83);
assert.equal(ores.length, 12);
assert.deepEqual(new Set(ores.map(o => o.id)), new Set(Object.keys(oreTicks)));
assert(components.every(c => c.repairToolId && c.capacity > 0 && c.tier >= 1 && c.tier <= 6));
assert(ores.every(o => Number.isInteger(o.processing.ticks)));

const row = cells => `| ${cells.join(' | ')} |`;
const num = v => Number(v.toFixed(3)).toString();
const tableText = (header, rows) => [row(header), row(header.map(() => '---')), ...rows.map(row)].join('\n');
const componentTable = ids => tableText(['部件', '阶段', '容量', '打造体力', '基础经验E', '未星／一／二／三星经验', '研究tick／体力／经验', '装入或取下tick／体力'],
  components.filter(c => ids.includes(c.id[0])).map(c => [c.id + ' ' + c.name, c.tier, c.capacity,
    c.craft.baseStamina, c.craft.baseXp, c.craft.xpByStars.map(num).join('／'),
    [c.research.ticks, c.research.baseStamina, c.research.xp].join('／'),
    [c.attach.ticks, c.attach.baseStamina].join('／')]));
const milestones = [1, 2, 10, 25, 50, 75, 100].map(l => levels[l - 1]);
const allLevelRows = levels.map(l => [l.level, l.cumulativeXp, l.nextLevelXp ?? '满级',
  l.hammerBudget, l.collectibleCells, num(l.staminaReductionBps / 100) + '%',
  (100 * l.repairRatioNumerator / l.repairRatioDenominator).toFixed(2) + '%']);
const blueprintGroups = [['剑刃', 'B'], ['前端', 'T'], ['钝击侧', 'D'], ['手柄', 'H'], ['跨位置件', 'M']];
const md = `# 铸造工序成本与技能成长配表

2026-10-17首版试调值，覆盖现行83件单手武器部件、12种原矿、研究与拆装、维修、1至100级成长及数值信息开放。已确认规则沿用[锻造技能成长](weapon-forging-skill-growth.md)；本次新增的具体数字用于首版接入和平衡，不冒充此前已经确认的数值，也不代表已经实装。获取途径仍待定。

结构化表：[成本与成长数据](examples/weapon-forging-balance-v1.json)。本页由 tools/build-forging-balance.mjs 生成；修改配表规则后重新生成，避免83件逐行漂移。此数据属于工序与成长配置，不向物品schema添加成本、认识或等级字段。

## 计费口径

- 所有部件每炉统一 **12 tick**。较大或较复杂部件多耗体力，开炉耗时一致；少投、少敲、提前收工、额外锤数、不同矿材、星级都不改变12 tick。
- 开始时锁定材料、部件、等级与本炉参数，扣材料并建立唯一炉况；先完成12个计费tick，再进入盘面。每tick推进世界并按累计应付额差值扣体力，盘面操作不再推进tick。中途退出或战斗打断暂停该炉，保存已付时间体力，回来补完剩余；主动放弃损失材料与已付费用。盘面及随机结果不重抽，收工只产出一次并给一次经验。维修的中断规则仍是作废且不保留进度。
- 表内体力是普通环境、未应用减耗的**整次基础费用**。技能减耗系数为1−0.002L，最高20%；应用既有通用行动费用修正后，整次费用最终向上对齐0.1，只进位一次。现有通用费用含体温修正，不能结算后再重复应用；耐力具体系数未接线，不在本表虚构一个数。
- 持续工序的累计扣费按开工报价分摊，完整执行总额等于报价。本次作业锁定开工等级与费用环境系数，后续新作业重新报价；世界状态仍随tick正常变化。正式接线应读取统一费用的原始倍率后最终进位，不能先使用已四舍五入的费用再向上进位一次。表内示例不含采矿、搬运、休息及饥渴成本。
- 制造、研究、加工和维修结算同一种铸造经验。使用千分之一经验整数记账，1经验＝1000单位；维修恢复0.01耐久对应0.001经验，不逐次取整吞掉小额收益。达到100级不继续提高等级；取消、放弃、查看、装卸不发经验。
- 材料公式与工艺系数乘完后，成品各位置基础威力首版四舍五入到0.01；耐久上限、当前耐久和接触损耗仍保留0.01。计算材料达成率、维修比例时不预先舍入。不修改战斗伤害原有取整时点。

## 原矿加工

1件原矿换1份对应矿料，整数处理，没有边角料，也不额外消耗燃料。下表是游戏工作量分档，不表示真实冶炼耗时或难度。金银不会仅因稀有就给额外经验；黑重矿等按较高加工成本配置，经验仍统一为每tick 0.25。

${tableText(['原矿', '投入→投料', 'tick', '基础体力', '经验'], ores.map(o => [o.name, '1→1', o.processing.ticks, o.processing.baseStamina, num(o.processing.xp)]))}

批量加工是逐件任务串行执行，不另收开批费，也没有批量折扣。每件独立报价、锁定1件原矿；该件完成时同时消耗原矿、产生1份投料、给经验。中断未完成件不产出、不发经验，已花时间体力不退、其原矿解锁返还；已完成件保留。拆批、合批不改变总份数、总tick与同等级同环境下的费用、经验。只认识身份不自动学会加工路线；玩家可在铸造台检查现有原矿，认识该矿加工用途、路线及单份规格，不消耗样本，不额外扣时、扣体力或给经验。精确数值仍按技能等级开放。加工料正式物品ID见[正式物品配表](weapon-forging-formal-items.md)。

## 制造 研究与拆装

N为部件固定投料容量，S为已配置的结构阶段，均读取既有表；不按玩家实际少投的数量缩小费用，不要求铸造等级达到某个阶段才能研究或制造。

| 工序 | tick | 基础体力 | 经验与材料 |
|---|---|---|---|
| 打造一个真实部件 | 固定12 | 2N＋2S | 基础经验E＝4＋N＋2S；消耗本炉选定材料 |
| 研究未知结构 | ⌈N÷2⌉＋S | N＋S | 经验2N＋4S；破坏并消耗1件样本，完成学会对应结构 |
| 装入一个真实部件 | ⌈N÷6⌉ | tick×2 | 无经验，不消耗额外材料 |
| 取下一个真实部件 | ⌈N÷6⌉ | tick×2 | 无经验，部件保留 |
| 维修 | ⌈实际恢复耐久÷10⌉ | 实际恢复耐久×0.2 | 每恢复10耐久1经验；需要匹配工具，不收原矿 |

制造按未达一星／一星／二星／三星分别给0.25E／E／1.5E／2.5E，0%也产出低性能部件。费用不因结果较差减少，不按每锤给经验。研究仅对尚未掌握的对应结构提供操作；已掌握不消耗样本，也不能反复研究刷经验。开始研究即锁定并消耗样本，暂停保存同一研究任务，完成才给知识与经验，主动放弃不返还样本。一次研究不自动揭露材料配方和矿材特性。

武器装卸仍在铸造台。更换部件计旧件取下＋新件装入，按真实实例去重；跨三个位置的同一件只计一次装卸，不乘三。每件每次装入或取下单独应用减耗并进位，整套费用再相加，合并操作不获得额外舍入折扣。先校验最终装配、接收空间和资源，再提交整次计划；未改动位置不收费，也不重置配招。空确认零成本。此表不收费于战斗中装备整把武器、metaskill切组、工具包管理，它们各走原有动作规则。更换部件不等于原料回收或改铸。

下面所有打造行都是12 tick；体力与经验均按整件列出。大部件每炉基础体力最多48，普通环境下不会仅因体量要求超过默认100体力上限。

${blueprintGroups.map(([name, ids]) => `### ${name}\n\n${componentTable(ids)}`).join('\n\n')}

## 经验曲线

沿用生活技能100级范围，使用铸造独立经验单位，不把“完成一炉”硬换成采集的一次成功计数。L级升下一级需要 **50L＋50经验**；从1级到L级累计需要 **25(L−1)(L＋2)经验**。入门几次成品能升级，后期保持长期积累。没有制造等级门槛，也不以临时隐藏的经验衰减限制低阶部件；低阶路线能慢慢练，高阶复杂件单炉收益更高。

${tableText(['等级', '从1级累计经验', '升下一级经验', '锤数', '可收取格'], milestones.map(l => [l.level, l.cumulativeXp, l.nextLevelXp ?? '满级', l.hammerBudget, l.collectibleCells]))}

未登记技能的0级为接入兼容状态：无体力减耗、8锤、2个可收取格，维修能力按1级的50%保底；有工具及其他条件即可实际操作，不凭空授予材料或图纸知识。首次成功完成有经验的工序登记1级，再加入本次经验；1级本身不额外索取经验。表内经验表示当前成长进度，死亡扣级必须按既有规则同步回退进度，不能从历史累计重新算出被扣掉的等级。原有技能等级迁移时保留现有等级，不把旧占位次数直接当成本表经验。

### 成长速度对照

下表仅使用B01每次三星制造30经验，不含采矿、加工、研究和维修收益，也不预设玩家实际每天玩多久。因此它是固定路线工作量，不是到达等级的承诺。

${tableText(['目标等级', '三星B01炉数', '需铁矿件数 全额铁料', '开炉tick 不含其他工序'], [10, 25, 50, 75, 100].map(l => {const runs = Math.ceil(cumulativeXp(l) / 30); return [l, runs, runs * 6, runs * 12];}))}

高阶整件M08-T6每炉三星85经验，仍需大量材料；单纯加工每tick仅0.25经验，维修每tick至多1经验。加工负责顺带积累，不能靠切换配方或拆分数量无成本涨经验。已经认识的83个结构也不能无限反复研究。

## 数值信息开放

| 铸造等级 | 新开放内容 | 仍须满足的认识条件 |
|---|---|---|
| 0起 | 当前可用操作的时间、体力、持有数量、已知部件容量；盘面目标与完成度 | 已接触该对象，且操作本身可用；不列出未发现目录 |
| 10 | 四项材料分数、已知部件要求、当前已知投料方案的四项达成率 | 矿料已接触、认识铸造用途与对应加工路线；部件结构已知 |
| 25 | 已知配料的威力、耐久、损耗潜力及材料修正门槛；自制成品精确性能 | 所有参与矿料路线和部件结构已知；反推外来成品还需认识其实际配料 |
| 50 | 已认识固有特性、组合特性和惩罚特性的精确强度 | 对应效果、触发条件与路线已知；预测还须认识实际配方与继承规则 |

10级一次开放四项材性，不人为让玩家只看见半张配料表。25级以前仍可按已知定性认识进行配料与锻造；准入失败可说明当前无法成形，但不能漏出未解锁的具体分值。物品自身重量沿用已接触实物的显示规则，不因为这张表而延迟到25级。

等级只开放可显示的信息种类，不能替代语言、身份、用途和配方认识。未知项整体省略，不生成问号、锁定行、隐藏数量或未认识组合清单。50级不提前揭示本炉随机选中的特性，不自动解锁组合；已结算成品只展示实际已知的那一条。技能解锁数值不要求再消耗材料试料，也不恢复阅读记录或向别人学习的材料认识途径。能力有信息入口，不要求在备料或锻造面板堆满说明与预估。

## 维修与成本算例

维修能力比例仍为(L＋98)÷198，最终能力上限乘实际最大耐久后保留两位小数；不可先把下表显示百分比拿回去计算。当前耐久达到或超过能力上限时不能修。战斗中不可启动，维修进入战斗即时作废，已耗费用不退，无耐久恢复、无经验、无中间进度，工具不消耗。

| 算例 | 时间 | 基础体力 | 经验 |
|---|---|---|---|
| B01平磨直刃，已备6份铁料，三星 | 12 tick | 14 | 30 |
| 上项从6件铁矿开始，包含加工 | 24 tick | 26 | 33 |
| 首次研究B01 | 4 tick | 7 | 16 |
| T01短菱剑尖，三星 | 12 tick | 8 | 22.5 |
| M08-T6冠刺锤头，三星 | 12 tick | 48 | 85 |
| 取下B01、装入B05 | 3 tick | 6 | 0 |
| 修复50点耐久 | 5 tick | 10 | 5 |

同一笔恢复50耐久的维修，仅计铸造减耗，50级支付9体力、100级支付8体力，时间与经验均不变。少量维修照样收费：恢复0.01耐久需1 tick、0.1体力、0.001经验。用于修复的耐久必须实际缺失，不凭预览、失败或达到能力上限后的重复点击计经验。

以B01＋B01＋T01＋H01组成一把单手剑、全额使用铁料并分别达到三星：共19件铁矿；加工38 tick、38基础体力，四炉48 tick、46基础体力，装入四件4 tick、8基础体力，合计90 tick、92基础体力、117经验。此例不含取得矿石、首次研究、移动、食物或休息；实际支付另应用开工等级与环境修正。

## 完整等级表

维修比例只作阅读展示；数据保存整数分子与分母，计算不使用舍入后的百分比。

${tableText(['等级', '累计经验', '下一级经验', '总锤数', '收取格数', '体力减耗', '可修比例'], allLevelRows)}

## 接入与验收范围

本表只写成本数据与索引，未接入动作处理器、存档或试玩HTML。原矿分值、组合特性、部件威力基准、小游戏目标和工具重量不随配表改动；加工料路线键保留矿石ID，并通过outputItemId对应[正式物品目录](../../data/forging/item-catalog-v2.json)中的独立加工料，目录尚未注册到运行时。

接入应校验83件与12矿全量覆盖、唯一实例结算、跨位去重、研究已知无收益、批量拆分等价、固定12 tick不随锤数变化、经验与体力小数精度、升级边界及逐项认识过滤。正式环境还需验证战斗打断、炉况保存和既有死亡扣级。经济平衡仍需取得途径确定后的实际试玩；本表没有代定商人、矿脉或掉落。
`;

const outputs = [
  ['docs/design/examples/weapon-forging-balance-v1.json', JSON.stringify(table, null, 2) + '\n'],
  ['docs/design/weapon-forging-costs-and-progression.md', md],
];
for (const [p, contents] of outputs) {
  if (process.argv.includes('--check')) assert.equal(fs.readFileSync(path.join(root, p), 'utf8'), contents, p + ' needs regeneration');
  else fs.writeFileSync(path.join(root, p), contents);
}
console.log(`${process.argv.includes('--check') ? 'Checked' : 'Wrote'} ${components.length} components, ${ores.length} ores, ${levels.length} levels.`);
