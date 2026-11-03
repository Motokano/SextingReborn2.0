import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildModularCatalog, hydrateModularCatalog } from './item-attribute-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const base = read('docs/design/examples/weapon-forging-ores-v1.json');
const extra = read('docs/design/examples/weapon-ore-intrinsic-traits-v1.json');
const balance = read('docs/design/examples/weapon-forging-balance-v1.json');
const combinations = read('docs/design/examples/weapon-ore-combinations-v1.json');
const ores = [...base.ores, ...extra.oreAdditions];
assert.equal(ores.length, 12);
assert.equal(new Set(ores.map(o => o.id)).size, 12);
assert.equal(combinations.rules.maxTraitsPerRealComponent, 1);

const flat = {};
const entries = {};
for (const [i, o] of ores.entries()) {
  const r = o.rawItem, a = r.identity;
  const pi = balance.ores.findIndex(x => x.id === o.id);
  const ti = extra.intrinsicTraits.findIndex(x => x.oreId === o.id);
  assert(pi >= 0 && ti >= 0, o.id + ': missing cost or trait');
  assert([...a.placeholder_name].length <= 8);
  const halves = a.fn_before.split('，');
  assert.equal(halves.length, 2);
  assert([...halves[0]].length <= 16 && [...halves[1]].length <= 6);
  const sourceFile = i < base.ores.length ? 'weapon-forging-ores-v1.json' : 'weapon-ore-intrinsic-traits-v1.json';
  const sourcePointer = i < base.ores.length ? `/ores/${i}` : `/oreAdditions/${i - base.ores.length}`;
  flat[o.id] = {
    item_id: o.id, name: a.sn, name_0: a.sn, sn: a.sn,
    placeholder_name: a.placeholder_name, fn_before: a.fn_before, fn: a.fn, desc_0: a.fn,
    category: r.category, sub_category: r.subCategory, weight_kg: r.weightKg,
    stack_limit: r.stackLimit, tags: r.tags.join(';'), source: r.source.join(';'),
    production_lines: r.productionLines.join(';'), spoilage_ticks: r.spoilageTicks,
    base_value: r.baseValue, price_class: r.priceClass, volatility: r.volatility,
    region_restrict: r.regionRestrict,
  };
  entries[o.id] = {
    itemRef: `weapon-forging-ore-items-v1.json#/items/${o.id}`,
    sourceRef: `${sourceFile}#${sourcePointer}`,
    scoresRef: `${sourceFile}#${sourcePointer}/scores`,
    processingRef: `weapon-forging-balance-v1.json#/ores/${pi}/processing`,
    intrinsicTraitRef: `weapon-ore-intrinsic-traits-v1.json#/intrinsicTraits/${ti}`,
    traitSelectionRef: 'weapon-ore-combinations-v1.json#/rules',
    information: o.information,
    spawnPolicy: { status: 'pending', sourceIndex: 'mining',
      candidateRef: `${sourceFile}#${sourcePointer}/mining`,
      discoveryCandidateRef: `${sourceFile}#${sourcePointer}/discoveryCandidate`,
      autoRegister: false, preserveExistingPlacement: o.existingItem },
  };
}
const catalog = buildModularCatalog(flat);
const restored = hydrateModularCatalog(catalog);
for (const o of ores) {
  const r = restored[o.id];
  for (const field of ['item_id', 'sn', 'placeholder_name', 'fn_before', 'fn', 'weight_kg', 'base_value', 'production_lines']) {
    assert.equal(r[field], flat[o.id][field], `${o.id}.${field}`);
  }
  assert.deepEqual(Object.keys(catalog.items[o.id].attribute_modules), ['base']);
  assert.equal(r.info_module_set_id, undefined);
  assert.equal(r.quality, undefined);
}

const information = {
  version: 1, date: '2026-10-17', status: 'design_only',
  itemCatalog: 'weapon-forging-ore-items-v1.json',
  scope: '十二矿逐字段认识与设计数据引用；不是新增物品字段，不注册运行时物品、知识或矿点。',
  knowledgePolicy: {
    owner: 'character', defaultKnown: false, language: base.itemInformation.languagePolicy,
    identity: 'identity_known && language>=3; otherwise placeholder_name',
    description: 'language<2: omit; language>=4 && identity_known: fn; otherwise fn_before',
    materialNumbers: { minForgingLevel: 10, requires: ['material_seen', 'forge_use_known', 'feed_route_known', 'feed_unit_known'], axesTogether: true },
    productPotential: { minForgingLevel: 25, requires: ['all_contributing_material_routes_known', 'component_structure_known'],
      reverseCalculationRequires: ['instance_recipe_known'] },
    traitStrength: { minForgingLevel: 50, requires: ['effect_known', 'trigger_known', 'relevant_route_known'],
      predictionRequires: ['recipe_known', 'inheritance_rule_known'], randomWinnerVisibleBeforeFinish: false },
    traitsStillApplyWhenUnknown: true,
    noUnseenEnumeration: true, noPlaceholderRowsOrHiddenCounts: true,
    noNumbersViaSortingAutofillLogsOrErrors: true, noUnknownContributionTreatedAsZero: true,
    noIdentityGrantFromLanguageOrForgingLevel: true, noAutomaticRecipeGrant: true,
    showProcessingQuoteWhen: ['material_seen', 'forge_use_known', 'feed_route_known'],
    recognitionCosts: { observationConsumesMaterial: false, assayEnabled: false,
      separateRecognitionFee: 0, componentStructureResearchIsSeparate: true },
    processingInspection: base.itemInformation.recognitionMethod.processingInspection,
    backendOnly: base.itemInformation.knowledgePolicy.backendOnly,
    noRawOreCombatBonus: true,
    legacyMaterialOreModuleAllowed: false,
    safeFallback: '基础外观文案；专业数值和未认识标题整体省略。',
  },
  entries,
};
const tr = cells => `| ${cells.join(' | ')} |`;
const mdTable = (head, rows) => [tr(head), tr(head.map(() => '---')), ...rows.map(tr)].join('\n');
const textRows = ores.map(o => { const a = o.rawItem.identity; return [a.sn, a.placeholder_name, a.fn_before, a.fn]; });
const statRows = ores.map(o => {
  const c = balance.ores.find(x => x.id === o.id).processing;
  const t = extra.intrinsicTraits.find(x => x.oreId === o.id);
  return [o.name, o.scores.hardness, o.scores.toughness, o.scores.deformationResistance,
    o.scores.density, c.ticks, c.baseStamina, c.xp, t.name];
});
const fieldsRows = ores.map(o => {const r=o.rawItem;return [o.id,r.subCategory,r.weightKg,r.baseValue,
  `${r.priceClass}／${r.volatility}`,r.regionRestrict,r.productionLines.join('；')];});
const md = `# 十二种铸造矿石的物品信息与认知显示

2026-10-17对齐版。十二矿沿用已设计的身份、外观、四项分值、重量与固有特性；加工读取1∶1出料和本轮成本表，精确信息按铸造10／25／50级开放。矿材特性按每个真实成品部件最多一条结算。获取途径仍待定，没有把候选矿点或样本位置写入运行配置。

本页同时汇总原八矿与后增四矿。资料按既有物品schema v2整理为[十二矿物品设计目录](examples/weapon-forging-ore-items-v1.json)，独立的[认知与引用数据](examples/weapon-forging-ore-information-v1.json)关联材性、加工与继承规则。工序数值见[铸造成本与成长配表](weapon-forging-costs-and-progression.md)，组合和缺陷见[单条矿材特性规则](weapon-ore-combinations-draft.md)。这是接入用设计资料，尚未替换游戏或独立试玩。

## 物品固定文案

初见只说明可见外形，身份说明只补矿种。专业材性、配料推荐、特性效果不塞进fn。外观名最多8字；初步观察使用一处逗号，外形最多16字、模糊用途最多6字。

${mdTable(['正式名sn','外观称呼','初步观察fn_before','识别说明fn'],textRows)}

铁、铜、金、银复用既有ID；锡、铅、锌、钛砂、黑重矿、银片矿、黑纹矿、针晶矿为新增候选。黑重矿和银片矿等俗称用于游戏辨识，不把钨、钼、锰、锑的对应关系提前写进未知状态。没有新增同名金银物品。

## 材性 加工与固有特性对应

四项数值为每份加工投料的游戏分数，不是现实矿物的物性测量。1件原矿对应1份投料，不产生边角料，分值不乘4；加工与锻造各付自己的费用。表中费用为每件原矿的基础费用，应用技能和环境修正后再结算。

${mdTable(['矿石','硬度','韧性','抗变形','密度','加工tick','基础体力','加工经验','单矿固有特性'],statRows)}

原矿与成品不要求等重，成品重量仍按部件基重乘密度达成率计算。原矿随身携带不会授予表中的战斗效果；固有特性是打造后按既定条件继承到部件上的性质。三星纯矿继承一条且按矿料份数／固定容量缩放；混投优先匹配组合，多个命中随机一条；完全未命中只给一条缺陷。正面组合未达三星不生效，也不改判缺陷，未命中混投的缺陷在任何完成度都保留。

固有特性的原强度与触发条件继续读取[十二矿特性表](weapon-ore-intrinsic-traits-draft.md#3-十二种矿的固有属性首轮认可)，组合特性和缺陷读取现行单条规则；本次不重配强度、不叠加参与矿原有特性。

## 认识与显示

遵循[认知论](01-philosophy.md)、[物品文案规范](../../capitalism/items_template_and_style.md)、[属性模块](63-item-attribute-modules.md)及[品质移除](41-quality-removal.md)。身份、用途、定性材性、效果、触发条件和配方认识分别记录；铸造等级只开放可显示的精确信息种类。

| 条件 | 可显示内容 |
|---|---|
| 尚未接触 | 没有条目、剪影、问号、锁定行或未发现数量 |
| 已接触、身份未知 | 外观称呼；语言至少2显示fn_before，语言再高也不自动认识身份 |
| 身份已认识 | 语言至少5显示正式名称；至少10显示fn；语言低于2不显示说明 |
| 用途或某项定性材性已认识 | 只显示对应已知说明，不要求先知道正式名称，不补未知标题 |
| 加工路线已知且操作可用 | 可见1∶1投入产出及本次费用，不用等到10级 |
| 铸造10级 | 已接触、用途与加工路线／单份规格已知时，四项分数同时开放；已知部件结构的要求可显示 |
| 铸造25级 | 全部参与矿料路线与部件结构已知时，显示配料性能潜力；反推外来成品还需认识其实际配料 |
| 铸造50级 | 已认识效果、触发条件及对应路线时，显示固有、组合或惩罚特性的精确强度；预测还需配方和继承规则认识 |

语言小于2没有说明；语言2至9使用fn_before；语言至少10但身份未知仍使用fn_before。名字和说明不能由editor_name、name_0、原始ID或后台标签兜底泄露。精确字段继续沿用语言和信息展示规则，技能达标不自动认识新矿或配方。

以黑重矿为例：初见只有“黑亮条晶”；认识身份和相应语言条件后显示“黑重矿”；只知道硬度较高时可显示定性描述。10级且认识加工路线后，可显示硬度58、韧性6、抗变形30、密度56。50级仍须认识破挡效果及条件，才能显示其精确强度；不会因升到50级自动获得破挡知识或揭示隐藏组合。

所有投料仍按真实数值检查四项各达30%。未知贡献不能当0，也不能把部分已知值当完整总分；隐藏数值时同样不得通过排序、自动推荐、拒绝原因或日志反推。未知特性实际上可以生效，但不显示隐藏词条数。完美收工不自动鉴定，预测不能提前显示本炉随机胜出的特性。信息开放只提供可查字段，不恢复已移除的备料与锻造大段预估面板。

观察辨认不消耗材料。玩家可在铸造台检查当前实物原矿，认识该矿的铸造用途、加工路线和单份规格；不要求先认识矿石真名，不消耗样本，不额外扣时、扣体力或给经验。检查不会顺带鉴定矿种、揭示材性与特性、解锁组合或部件图纸；精确分数继续遵守10／25／50级与认识条件。试料、材性试验、属性试条及其费用、经验和前置条件均取消；正常加工、打造、使用不另收认识费用。阅读工艺记录、他人试验结果或向别人学习不授予本系统材料知识。研究部件结构仍会破坏1件部件样本，与认识矿石分开处理。

## 通用物品字段

十二矿均为ore类，来源索引mining，堆叠上限1、不腐败；不新增品质、食用、主动使用、燃料、供水或装配资格。物品目录只使用已有base模块；四项分数、工序费用、认识条件和成品继承配置放在相应系统表，通过ID关联，不擅自扩展物品schema。

${mdTable(['ID','子类','原矿kg','后台基价','价格类／波动','地区字段','生产索引'],fieldsRows)}

原矿重量参与实际携带负重；后台基价、价格类、波动、地区字段、来源与生产索引、矿点权重、完整分布和地质参考不能作为玩家鉴定奖励展示。表中后台值沿用既有设计，不因1∶1出料同步乘4或更改价格。正式经济仍需随获取途径校核。

铁、铜保留既有生产索引；金银新增forge设计索引时不覆盖其其他用途。金银旧region_restrict＝6原样保留，不解释成地牢第6层；其他条目的0也不意味着自动加入任意资源池。现有物品的实际投放不因本页更改；新增矿点与发现样本仍是未绑定候选。

## 实物接触候选与接入

旧矿石资料中的样本盘、矿样袋等保留为场景设计候选，统一从[八矿源数据](examples/weapon-forging-ores-v1.json)和[四矿补充数据](examples/weapon-ore-intrinsic-traits-v1.json)按ID引用。只提供亲自观察和检查的机会，不靠打开容器、读料签或得到矿石自动赠送工艺、全部数值或特性；加工方法另由铸造台上的实物检查认识。获取途径未定，不能把这些候选直接当作正式矿脉、商人库存或掉落表。正式原矿、加工料与部件模板已汇入[铸造物品配表](weapon-forging-formal-items.md)，尚未注册到游戏。

当前旧module.material_ore会直接写冶炼用途与固定性质，新设计目录不引用它。正式接入需使背包、仓库、地面、矿点、日志、交易、加工和配料界面共用逐字段认识过滤；没有可见专业字段就连标题一起省略。资料目录和数据引用已对齐，不等于角色认识存档或界面消费者已经实现。

本页及两个十二矿汇总JSON由tools/build-forging-ore-items.mjs生成；身份、四项分值与固有特性分别以源数据为准，费用读取成长配表。修改源数据后重新生成，避免八矿、四矿和配表重复手抄。
`;
const outputs = [
  ['docs/design/examples/weapon-forging-ore-items-v1.json', JSON.stringify(catalog, null, 2) + '\n'],
  ['docs/design/examples/weapon-forging-ore-information-v1.json', JSON.stringify(information, null, 2) + '\n'],
  ['docs/design/weapon-forging-ore-item-information-draft.md', md],
];
for (const [p, contents] of outputs) {
  if (process.argv.includes('--check')) assert.equal(fs.readFileSync(path.join(root, p), 'utf8'), contents, p + ' needs regeneration');
  else fs.writeFileSync(path.join(root, p), contents);
}
console.log(`${process.argv.includes('--check') ? 'Checked' : 'Wrote'} 12 ore definitions in schema v2, information references and consolidated document.`);
