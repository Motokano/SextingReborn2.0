/** Design inventory only: never rewrites production data. Run with --write to refresh reports. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/^\uFEFF/, '');
const json = p => JSON.parse(read(p));
const groups = [
  ['core', '主表与身份', 'id item_id category sub_category tags weight weight_kg material count'],
  ['identity_text', '名称与认知描述', 'sn name name_0 name_1 name_2 placeholder_name fn fn_before desc desc_0 desc_1 desc_2 display_skill_id'],
  ['stacking', '堆叠', 'stack_limit stack_max'],
  ['trade', '交易价值与流通', 'base_value price_class volatility region_restrict'],
  ['currency', '货币兑换', 'accept_code convert_to_high usable_regions'],
  ['edible', '食用与消化', 'edible edible_buff_id food_profile meal_tier satiety_total digestion_ticks food_buff_duration_ticks meal_composition workhorse food_thirst_instant food_special_ticks food_composition_text food_experience_text food_special_text'],
  ['meal_packing', '食物装盒规格', 'slots_taken'],
  ['spoilage', '腐败', 'spoilage spoilage_ticks spoilage_elapsed_ticks'],
  ['cooking_input', '烹饪投料', 'cooking_ingredient'],
  ['fuel', '燃料', 'fuel_points'],
  ['water_supply', '供水', 'water_points'],
  ['usable', '主动使用', 'usable use_action use_buff_id use_charges charges'],
  ['pharmacy_input', '制药投料', 'pharmacy_ingredient chem_class pharm_family pharm_effect pharm_toxicity concentration_cost adjuvant_strength pharmacy_active_components'],
  ['pharmacy_compound', '复方承载与配方状态', 'pharmacy_compound concentration_capacity components pharmacy_formula_key pharmacy_rules_version precipitated salt_deficit'],
  ['pharmacy_effect', '药品效果参数', 'pharmacy_addiction_gain pharmacy_relief_stages pharmacy_oral_toxicity pharmacy_extra_toxicity_decay'],
  ['compost_input', '堆肥投料与菌剂', 'fert_c fert_n compost_inoculant_aerobic compost_inoculant_anaerobic'],
  ['fertilizer', '农业施肥', 'inject_facility agriculture_venturi_injectable agriculture_buried_jar_injectable agriculture_nutrient_per_bottle is_anaerobic_fertilizer'],
  ['soil_amendment', '土壤改良', 'grants_soil_id'],
  ['seed', '播种', 'harvest_item_id seed_tier'],
  ['power', '储能供电', 'battery_capacity battery_charge'],
  ['equippable', '装备位置与条件', 'equip_slot req_innate_jingu'],
  ['storage', '穿戴收纳', 'pocket_slots vest_slots backpack_slots backpack_weight_factor'],
  ['combat_carrier', '攻击载体与动作修正', 'weapon_attack_power attack_power skill_coef form_coefs limb_tags parry_coef speed_coef move_cost_mod damage_type_effects'],
  ['armor', '防护与激活盾', 'damage_reduce_blunt_pct damage_reduce_pierce_pct damage_reduce_slash_pct base_shield'],
  ['attachment_host', '装配宿主', 'module_slots modules'],
  ['attachment_part', '可装配部件', 'install_slots occupies max_per_armor'],
  ['assembly_host', '通用组合宿主', 'assembly_slots connections'],
  ['assembly_part', '通用组合部件类型', 'assembly_types'],
  ['assembly_connection', '真实部件连接记录', 'connection_schema_version'],
  ['attachment_effect', '部件效果', 'activation_cost_pct effects segments special special_effect'],
  ['enchantment', '附魔', 'enchant_slot enchant_slots enchant_id enchants'],
  ['live_animal', '活体个体', 'hunting_juvenile'],
  ['presentation', '显示编排（非能力）', 'info_module_set_id'],
  ['provenance', '来源与生产索引', 'source production_lines'],
  ['location', '所在地与地面时间（非能力）', 'ground_drop_tick'],
  ['legacy', '旧轨兼容与废弃候选', 'quality pharmacy_legacy use_effect satiety_restore thirst_restore nutrition_restore energy_restore'],
  ['reserved', '保留设计（非已实现能力）', '_special_reserved numeric_rolls resolved_rolls']
];
const owners = new Map();
const categories = [
  ['base', '基础', 'core identity_text stacking trade currency spoilage presentation provenance location'],
  ['food', '食物', 'edible meal_packing'],
  ['production', '材料与生产', 'cooking_input fuel water_supply pharmacy_input compost_input fertilizer soil_amendment seed'],
  ['medicine', '药品与使用', 'usable pharmacy_compound pharmacy_effect'],
  ['equipment', '装备', 'equippable combat_carrier armor attachment_effect enchantment'],
  ['structure', '收纳与装配', 'storage attachment_host attachment_part assembly_host assembly_part assembly_connection'],
  ['energy', '能源', 'power'],
  ['organism', '活体', 'live_animal'],
  ['migration', '迁移审计（不可加载）', 'legacy reserved']
];
const categoryOf = new Map();
for (const [id, label, sections] of categories) for (const section of sections.split(' ')) {
  if (categoryOf.has(section)) throw Error('Duplicate category ownership: ' + section);
  categoryOf.set(section, { id, label });
}
for (const [id, label, fields] of groups) for (const f of fields.split(' ')) {
  if (!categoryOf.has(id)) throw Error('Unclassified section: ' + id);
  if (owners.has(f)) throw Error('Duplicate field owner: ' + f);
  owners.set(f, { module: id, label });
}
const records = new Map();
function add(field, source, value, observed = true) {
  if (!records.has(field)) records.set(field, { field, sources: {}, types: new Set() });
  const rec = records.get(field);
  rec.sources[source] = (rec.sources[source] || 0) + 1;
  if (observed) rec.types.add(value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);
}
function walk(value, prefix, source) {
  add(prefix, source, value);
  if (Array.isArray(value)) for (const child of value) walk(child, prefix + '[]', source);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, prefix + '.' + k, source);
}
// CSV parsing preserves quoted commas and multiline descriptions.
function csv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(cell); cell = ''; if (c === '\n') { rows.push(row); row = []; } }
    else if (c !== '\r' || quoted) cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const tableCounts = {};
for (const source of ['data/items.json', 'data/equipment.json', 'data/modules.json']) {
  const entries = Object.entries(json(source)).filter(([id, v]) => !id.startsWith('_') && v && typeof v === 'object');
  tableCounts[source] = entries.length;
  for (const [, item] of entries) for (const [k, v] of Object.entries(item)) walk(v, k, source);
}
const csvCounts = [];
for (const file of fs.readdirSync(path.join(root, 'data/items')).filter(x => x.endsWith('.csv')).sort()) {
  const source = 'data/items/' + file, [headers, ...rows] = csv(read(source));
  const data = rows.filter(r => r.some(v => v.trim()));
  csvCounts.push({ source, rows: data.length, columns: headers.length });
  for (let i = 0; i < headers.length; i++) {
    const field = headers[i].trim();
    add(field, source + ':header', undefined, false);
    for (const row of data) if (row[i]?.trim()) add(field, source + ':nonempty', row[i]);
  }
}
const rules = json('data/item-field-display-rules.json').fields;
for (const field of Object.keys(rules)) add(field, 'display-rule', undefined, false);
const displays = new Map();
const infoSets = json('data/item-info-modules.json').module_sets;
for (const [setId, set] of Object.entries(infoSets)) for (const m of set.modules || []) {
  const content = m.content || {};
  const fields = content.type === 'tpl_kv' ? (content.entries || []).map(e => e.field) : content.type === 'csv_field_text' ? [content.field] : [];
  for (const field of fields.filter(Boolean)) {
    add(field, 'info-module-reference', undefined, false);
    if (!displays.has(field)) displays.set(field, []);
    displays.get(field).push({ set: setId, module: m.module_id, title: m.title, unlock: m.unlock || null, content_type: content.type });
  }
}
// Explicitly reviewed runtime state, including nested juvenile state and old compound output.
const instanceFields = 'item_id count enchants enchant_id modules connections connection_schema_version ground_drop_tick battery_charge components components[].item_id components[].count charges pharmacy_formula_key pharmacy_rules_version spoilage_elapsed_ticks hunting_juvenile hunting_juvenile.species hunting_juvenile.gender hunting_juvenile.perks precipitated salt_deficit'.split(' ');
for (const f of instanceFields) add(f, 'reviewed-instance-field', undefined, false);
for (const f of 'backpack_slots backpack_weight_factor max_per_armor attack_power req_innate_jingu stack_max damage_type_effects'.split(' ')) add(f, 'runtime-contract-candidate', undefined, false);
for (const f of ['numeric_rolls', 'resolved_rolls']) add(f, 'design-26-not-runtime-confirmed', undefined, false);
const coreField = f => f.split(/[.[]/)[0];
const derived = new Set('food_composition_text food_experience_text food_special_text meal_composition'.split(' '));
const aliases = new Set('id weight name name_0 desc_0 enchant_slot stack_max attack_power spoilage'.split(' '));
const foodAliases = new Set('meal_tier satiety_total digestion_ticks food_buff_duration_ticks slots_taken workhorse food_thirst_instant food_special_ticks'.split(' '));
const codeFiles = [];
function listJs(dir) { for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const f = dir + '/' + e.name; if (e.isDirectory()) listJs(f); else if (f.endsWith('.js')) codeFiles.push({ file: f, lines: read(f).split('\n') }); } }
listJs('js');
const evidenceCache = new Map();
function evidence(f) {
  if (evidenceCache.has(f)) return evidenceCache.get(f);
  const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\b' + escaped + '\\b');
  const hits = [];
  for (const code of codeFiles) { const i = code.lines.findIndex(l => re.test(l)); if (i >= 0) hits.push(code.file + ':' + (i + 1)); }
  evidenceCache.set(f, hits); return hits;
}
const fields = [...records.values()].sort((a, b) => a.field.localeCompare(b.field, 'en')).map(rec => {
  const k = coreField(rec.field), owner = owners.get(rec.field === 'food_profile.slots_taken' ? 'slots_taken' : k);
  let disposition = '迁入所属模块，保留语义';
  if (owner?.module === 'core') disposition = '通用主表/实例核心；子项以父模块为准';
  if (aliases.has(k)) disposition = '统一命名候选；逐来源保留差异，不盲合并';
  if (foodAliases.has(k)) disposition = '食物目录覆盖范围内归一；目录外保留现有数据，核对后迁移';
  if (derived.has(k)) disposition = '计算/显示派生，不作第二数值真源';
  if (['legacy', 'reserved'].includes(owner?.module)) disposition = '隔离审计；不因归类直接删除或启用';
  if (k === 'battery_charge') disposition = '模板初始电量与实例剩余电量分开';
  if (['precipitated', 'salt_deficit'].includes(k)) disposition = '现有产出字段；由成分推导，需核实历史档后处理';
  if (k === 'info_module_set_id') disposition = '保留显示编排引用；不能作为属性模块声明';
  const category = categoryOf.get(owner?.module);
  return { ...rec, types: [...rec.types].sort(), module: category?.id || 'UNCLASSIFIED', module_label: category?.label || '未分类', field_group: owner?.module, field_group_label: owner?.label, disposition,
    instance_state: instanceFields.includes(rec.field), existing_display_rule: rules[rec.field] || null,
    existing_info_modules: displays.get(rec.field) || [], code_mentions: evidence(k) };
});
const unknown = fields.filter(f => f.module === 'UNCLASSIFIED');
if (unknown.length) { console.error('Unclassified:', unknown.map(x => x.field).join(', ')); process.exit(1); }
const report = { status: 'runtime-schema-with-assembly', date: '2026-09-22', table_counts: tableCounts, csv_tables: csvCounts,
  scope: '全量扫描所列三张模板、十一张CSV、两套显示配置及嵌套字段；实例字段为人工核对集合，代码命中只是文本线索，非完整读写链路证明。',
  categories: categories.map(([id, label]) => ({ id, label, loadable: id !== 'migration' })),
  groups: groups.map(([id, label]) => ({ id, label, category: categoryOf.get(id).id, independently_loadable: false })), fields,
  static_info_modules: Object.entries(infoSets).flatMap(([set, v]) => (v.modules || []).filter(m => !['tpl_kv', 'csv_field_text'].includes(m.content?.type)).map(m => ({ set, ...m }))) };
const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
let md = '# 物品属性模块分类：逐字段盘点\n\n> 2026-09-22，模块目录与通用组合字段已接入运行时。由 `node tools/audit-item-module-classification.mjs --write` 生成。分类原则见 [63号设计](63-item-attribute-modules.md)，连接契约见 [65号设计](65-item-assembly-and-combined-weight.md)。\n\n';
md += report.scope + '\n\n代码命中保存在同名 JSON 中；不是调用或生效证明。CSV 的 string 类型是源文件文本，不代表目标字段类型。嵌套字段随父模块归属，附魔/效果载荷仍需相应子系统校验。\n\n';
md += '| 来源 | 物品/行数 | CSV列数 |\n|---|---:|---:|\n';
for (const [source, count] of Object.entries(tableCounts)) md += `| ${source} | ${count} | — |\n`;
for (const t of csvCounts) md += `| ${t.source} | ${t.rows} | ${t.columns} |\n`;
md += `\n共 ${fields.length} 个不同字段路径（含嵌套、CSV空列、显示引用、人工核对状态与兼容候选），未分类 0。此数不是顶层字段数。\n`;
for (const [categoryId, categoryLabel, sections] of categories) {
  md += `\n## ${categoryLabel}（${categoryId}）\n\n${categoryId === 'migration' ? '仅审计保留，不是可加载模块。' : '主表按此大类加载；下列分组在类内按需配置，不单独加载。'}\n`;
for (const [id, label] of groups.filter(g => sections.split(' ').includes(g[0]))) {
  md += `\n### ${label}（类内分组 ${id}）\n\n| 原字段路径 | 观察类型 | 来源 | 处理建议 | 当前字段规则 / 信息模块 |\n|---|---|---|---|---|\n`;
  for (const f of fields.filter(x => x.field_group === id)) {
    const r = f.existing_display_rule;
    const display = [r ? `${r.primary_block}；${r.renderer}；${r.skill_id || '无技能门槛'}≥${r.level_min || 0}${r.deprecated ? '；废弃标记' : ''}` : '无逐字段规则', ...f.existing_info_modules.map(m => `${m.set}/${m.module}（${m.unlock?.skill_id || '无模块技能门槛'}≥${m.unlock?.level_min || 0}）`)].join('；');
    md += `| \`${f.field}\` | ${f.types.join('/')} | ${esc(Object.keys(f.sources).join('；'))} | ${esc(f.disposition)}${f.instance_state ? '；含实例状态' : ''} | ${esc(display)} |\n`;
  }
}
}
md += '\n## 静态信息模块\n\n这些说明没有字段引用，也必须保留文案与认知条件；不能仅按字段数量迁移。完整内容在配套 JSON 的 static_info_modules。\n\n';
for (const m of report.static_info_modules) md += `- ${m.set}/${m.module_id}：${m.title || ''}，${m.unlock?.skill_id || '无模块技能门槛'}≥${m.unlock?.level_min || 0}\n`;
if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(root, 'docs/design/item-module-field-inventory.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'docs/design/item-module-field-inventory.md'), md);
}
if (process.argv.includes('--check')) {
  if (read('docs/design/item-module-field-inventory.json') !== JSON.stringify(report, null, 2) + '\n'
      || read('docs/design/item-module-field-inventory.md') !== md) throw Error('Inventory report is stale; review source changes and run --write.');
}
console.log(JSON.stringify({ tables: tableCounts, paths: fields.length, unclassified: unknown.length, loadable_categories: categories.length - 1, internal_groups: groups.length, wrote: process.argv.includes('--write') }));
