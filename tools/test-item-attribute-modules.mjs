import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { CATEGORY_GROUP_FIELDS, buildModularCatalog, buildModuleDefinitionsDocument, hydrateModularCatalog } from './item-attribute-catalog.mjs';
import { applyWaterFlaskStorage } from './water-flask-storage-fields.mjs';

const legacy = JSON.parse(fs.readFileSync(new URL('../data/items.json', import.meta.url), 'utf8'));
const written = JSON.parse(fs.readFileSync(new URL('../data/item-catalog-v2.json', import.meta.url), 'utf8'));
const legacyEquipment = JSON.parse(fs.readFileSync(new URL('../data/equipment.json', import.meta.url), 'utf8'));
const writtenEquipment = JSON.parse(fs.readFileSync(new URL('../data/equipment-catalog-v2.json', import.meta.url), 'utf8'));
const legacyAttachments = JSON.parse(fs.readFileSync(new URL('../data/modules.json', import.meta.url), 'utf8'));
const writtenAttachments = JSON.parse(fs.readFileSync(new URL('../data/attachment-catalog-v2.json', import.meta.url), 'utf8'));
const definitions = JSON.parse(fs.readFileSync(new URL('../data/item-attribute-module-definitions.json', import.meta.url), 'utf8'));
assert.deepEqual(written, buildModularCatalog(legacy), 'modular catalogue is stale');
assert.deepEqual(writtenEquipment, buildModularCatalog(legacyEquipment), 'modular equipment catalogue is stale');
assert.deepEqual(writtenAttachments, buildModularCatalog(legacyAttachments), 'modular attachment catalogue is stale');
assert.deepEqual(definitions, buildModuleDefinitionsDocument(), 'module definitions are stale');
assert.equal(Object.keys(written.items).length, Object.keys(legacy).length);

const hydrated = hydrateModularCatalog(written);
for (const [id, oldItem] of Object.entries(legacy)) {
  const item = written.items[id];
  assert.ok(item.attribute_modules.base, id + ' missing base category');
  for (const groups of Object.values(item.attribute_modules)) {
    for (const values of Object.values(groups)) assert.ok(Object.keys(values).length, id + ' has empty attribute group');
  }
  for (const [key, value] of Object.entries(oldItem)) {
    if (key === 'quality') continue;
    // Legacy builder wrote absence as zero/false for several capabilities. V2 intentionally omits them.
    if ((key === 'fuel_points' || key === 'water_points' || key === 'spoilage_ticks') && Number(value) === 0) continue;
    if ((key === 'edible' || key === 'usable') && value === false) continue;
    assert.deepEqual(hydrated[id][key], value, id + ' changed ' + key);
  }
}

function assertRoundTrip(source, catalog, label) {
  const sourceEntries = Object.entries(source).filter(([id, value]) => id.charAt(0) !== '_' && value && typeof value === 'object' && !Array.isArray(value));
  assert.equal(Object.keys(catalog.items).length, sourceEntries.length, label + ' count changed');
  const roundTripped = hydrateModularCatalog(catalog);
  for (const [id, oldItem] of sourceEntries) {
    assert.ok(catalog.items[id].attribute_modules.base, id + ' missing base category');
    for (const [key, value] of Object.entries(oldItem)) {
      if (key === 'quality' || key === '_special_reserved') continue;
      assert.deepEqual(roundTripped[id][key], value, label + ' ' + id + ' changed ' + key);
    }
  }
}
assertRoundTrip(legacyEquipment, writtenEquipment, 'equipment');
assertRoundTrip(legacyAttachments, writtenAttachments, 'attachment');

const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../js/item-attribute-modules.js', import.meta.url), 'utf8'), context);
const IAM = context.globalThis.ItemAttributeModules;
assert.deepEqual(JSON.parse(JSON.stringify(IAM.getDefinitions())), CATEGORY_GROUP_FIELDS, 'runtime and build-time field ownership diverged');
const runtimeItems = IAM.hydrateCatalog(written);
const battery = runtimeItems.battery_aa;
assert.equal(IAM.hasGroup(battery, 'energy', 'storage'), true);
assert.equal(IAM.hasGroup(battery, 'production', 'fuel'), false);
let instance = IAM.normalizeInstance({ item_id: 'battery_aa', battery_charge: 0, extra_future_state: { x: 7 } }, battery);
assert.equal(instance.attribute_state.energy.storage.charge, 0, 'zero charge was replaced by template default');
assert.equal(IAM.getInstanceValue(instance, battery, 'battery_charge'), 0);
assert.equal(JSON.stringify(instance.extra_future_state), '{"x":7}', 'unknown instance state was lost');
IAM.setInstanceValue(instance, battery, 'battery_charge', 25);
assert.equal(instance.attribute_state.energy.storage.charge, 25);
assert.equal(instance.battery_charge, 25);
const dotted = { item_id: 'test', use_effect: { nutrition: 0 } };
assert.equal(IAM.getInstanceValue(dotted, {}, 'use_effect.nutrition'), 0, 'nested instance zero was not preserved');
IAM.setInstanceValue(dotted, {}, 'use_effect.nutrition', 4);
assert.equal(dotted.use_effect.nutrition, 4, 'nested instance write created a literal dotted key');
const wood = runtimeItems.wood_firewood_dry;
assert.equal(IAM.hasGroup(wood, 'production', 'fuel'), false, 'legacy zero created a fuel capability');
assert.equal(IAM.getTemplateValue(wood, 'fuel_points'), undefined);

context.window = context.globalThis;
vm.runInContext("globalThis.UIText = { t: function (key, vars) { return String(key).replace('{v}', String(vars && vars.v)); } };", context);
vm.runInContext(fs.readFileSync(new URL('../js/item-info-modules.js', import.meta.url), 'utf8'), context);
const infoModules = context.globalThis.ItemInfoModules;
infoModules.setTable({ module_sets: { [battery.info_module_set_id]: { modules: [{
  module_id: 'energy', title: 'Energy', content: { type: 'tpl_kv', entries: [{ field: 'battery_charge', label_key: 'charge {v}' }] }
}] } } });
const zeroChargeHtml = infoModules.renderTooltipModulesHtml({
  tpl: battery,
  inst: IAM.normalizeInstance({ item_id: 'battery_aa', battery_charge: 0 }, battery),
  character: {}
});
assert.match(zeroChargeHtml, /charge 0/, 'information module displayed template charge instead of instance zero');

const flaskTemplate = runtimeItems.tool_flask_bamboo_water;
const flask = IAM.normalizeInstance({ item_id: 'tool_flask_bamboo_water', future_state: { retained: true } }, flaskTemplate);
assert.equal(IAM.getInstanceValue(flask, flaskTemplate, 'flask_water'), 0);
assert.equal(IAM.setInstanceValue(flask, flaskTemplate, 'flask_water', 64), true);
assert.equal(IAM.getInstanceValue(flask, flaskTemplate, 'flask_water'), 64);
assert.equal(IAM.getInstanceValue(IAM.normalizeInstance({ item_id: flask.item_id }, flaskTemplate), flaskTemplate, 'flask_water'), 0, 'same-model instances share water');
assert.equal(IAM.setInstanceValue(flask, flaskTemplate, 'flask_water', Infinity), false);
assert.equal(IAM.setInstanceValue(flask, flaskTemplate, 'flask_water', 201), false);
assert.equal(flask.future_state.retained, true);
flask.attribute_state.structure.liquid_storage.version = 99;
assert.equal(IAM.setInstanceValue(flask, flaskTemplate, 'flask_water', 0), false);
assert.equal(IAM.normalizeInstance(flask, flaskTemplate).attribute_state.structure.liquid_storage.version, 99, 'unknown state version was overwritten');
infoModules.setTable(JSON.parse(fs.readFileSync(new URL('../data/item-info-modules.json', import.meta.url), 'utf8')));
const texts = JSON.parse(fs.readFileSync(new URL('../data/ui_text_zhCN.json', import.meta.url), 'utf8'));
context.globalThis.UIText.t = (key, vars) => (texts[key] || key).replace('{v}', String(vars?.v));
const emptyFlaskHtml = infoModules.renderTooltipModulesHtml({ tpl: flaskTemplate, inst: IAM.normalizeInstance({ item_id: flask.item_id }, flaskTemplate), character: {} });
assert.match(emptyFlaskHtml, /当前存水：0/);
assert.match(emptyFlaskHtml, /储水容量：200/);
assert.doesNotMatch(emptyFlaskHtml, /60%|1\.6/, 'storage information exposed unrecognized special performance');
const storageSource = JSON.parse(fs.readFileSync(new URL('../data/water-flask-storage.json', import.meta.url), 'utf8'));
assert.throws(() => applyWaterFlaskStorage({}, storageSource), /Unknown water flask/);
for (const patch of [{ flask_capacity: '200' }, { flask_initial_water: 20 }, { flask_source_multiplier: 0 }, { accidental_field: 1 }]) {
  const broken = structuredClone(storageSource);
  Object.assign(broken.items.tool_flask_bamboo_water, patch);
  assert.throws(() => applyWaterFlaskStorage(structuredClone(legacy), broken), /tool_flask_bamboo_water/);
}

const counts = {};
for (const item of Object.values(written.items)) for (const category of Object.keys(item.attribute_modules)) counts[category] = (counts[category] || 0) + 1;
console.log('[item-attribute-modules] PASS', JSON.stringify({
  items: Object.keys(written.items).length,
  equipment: Object.keys(writtenEquipment.items).length,
  attachments: Object.keys(writtenAttachments.items).length,
  categories: counts
}));
