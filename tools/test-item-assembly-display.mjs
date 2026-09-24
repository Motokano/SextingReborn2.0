import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const labels = JSON.parse(fs.readFileSync(new URL('../data/ui_text_zhCN.json', import.meta.url), 'utf8'));
const context = vm.createContext({ console, Math, Date });
context.window = context;
context.globalThis = context;
context.UIText = {
  t(key, vars) {
    let text = labels[key] || key;
    for (const [name, value] of Object.entries(vars || {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  }
};

for (const file of ['item-attribute-modules.js', 'inventory-equipment.js', 'item-assembly.js', 'item-assembly-display.js', 'scene-ui.js']) {
  vm.runInContext(fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8'), context);
}

const catalog = JSON.parse(fs.readFileSync(new URL('../data/item-catalog-v2.json', import.meta.url), 'utf8'));
const items = context.ItemAttributeModules.hydrateCatalog(catalog);
const IE = context.InventoryEquipment;
const Assembly = context.ItemAssembly;
const Display = context.ItemAssemblyDisplay;

IE.setConfig({
  equipment: { display_bag: { item_id: 'display_bag', name: '验收背包', equip_slot: 'backpack', backpack_slots: 8, weight_kg: 1 } },
  items,
  modules: {},
  default_equipment: {}
});
IE.setState({
  equipment: { backpack: { item_id: 'display_bag' } },
  inventory_backpack: [
    { item_id: 'fishing_rod_hand_basic' },
    { item_id: 'fishing_line_main_nylon_thin' },
    { item_id: 'fishing_float_small' },
    { item_id: 'fishing_bait_worm', count: 2 }
  ],
  inventory_pocket: [], inventory_vest: [], inventory_vehicle: [], ground_items: {}
});

const rodId = IE.getState().inventory_backpack[0].instance_id;
const attached = Assembly.attachFromContainer(rodId, 'main_line', 'backpack', 1);
assert.equal(attached.ok, true);
const line = IE.findItemInstanceRecord(attached.part_instance_id).instance;
const candidates = Display.listCompatibleCandidates(line, 'float', null);
assert.deepEqual(Array.from(candidates, c => c.source + ':' + c.index), ['backpack:2']);

const rod = IE.findItemInstanceRecord(rodId).instance;
const view = Display.buildView(rod, null);
assert.ok(view);
assert.equal(view.complete, false, 'missing required leader should remain visibly incomplete');
assert.equal(view.root.slots[0].child.instance.instance_id, attached.part_instance_id);

const html = Display.renderAssemblyHtml({ inst: rod, character: null, interactive: true });
const visibleText = html.replace(/<[^>]*>/g, ' ');
assert.match(visibleText, /连接结构/);
assert.match(visibleText, /尚未接全/);
assert.match(visibleText, /浮漂位置/);
assert.match(visibleText, /一卷细线|尼龙主线/);
assert.doesNotMatch(visibleText, /iteminst_/);
assert.doesNotMatch(visibleText, /fishing\./);
assert.doesNotMatch(visibleText, /instance_id|assembly_types|accepts/);
assert.match(html, /data-assembly-attach/);
assert.match(html, /data-assembly-detach/);
assert.match(html, /backpack:2/);
assert.doesNotMatch(html, /backpack:3/, 'incompatible bait leaked into float picker');

context.SceneUi.setUiDeps({ ui: context.UIText.t });
const rodTemplate = IE.getItemTemplate(rod.item_id);
const attrsText = context.SceneUi.formatItemAttributes(rodTemplate, rod);
assert.match(attrsText, /组合重量：0\.48 kg/);
const tooltipHtml = context.SceneUi.buildItemTooltipHtmlForTemplate(rod.item_id, rodTemplate, rod, null);
assert.equal((tooltipHtml.match(/组合重量/g) || []).length, 1, 'combined weight rendered twice');
const tooltipText = tooltipHtml.replace(/<[^>]*>/g, ' ');
assert.doesNotMatch(tooltipText, /iteminst_|itm:/);
assert.doesNotMatch(tooltipText, /fishing\./);
assert.equal(Display.messageForReason('take_failed'), labels['item.assembly.error.unknown']);

console.log('[item-assembly-display] PASS', JSON.stringify({
  visible_status: 'incomplete',
  compatible_candidates: candidates.length,
  combined_weight_kg: IE.getItemCombinedWeight(rod)
}));
