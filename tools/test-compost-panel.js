// Runs the real panel and scene button bindings against a small DOM adapter.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const strings = JSON.parse(read('data/ui_text_zhCN.json'));
function element() {
  return {
    children: [], style: {}, listeners: {}, disabled: false, textContent: '',
    classList: { add() {}, remove() {}, toggle() {} },
    attrs: {},
    setAttribute(key, value) { this.attrs[key] = value; },
    set innerHTML(value) { this.children = []; this.html = value; },
    get innerHTML() { return this.html || ''; },
    appendChild(child) { this.children.push(child); },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    click() { if (!this.disabled && this.style.display !== 'none' && this.listeners.click) this.listeners.click(); }
  };
}
const elements = new Map();
const get = id => {
  if (!elements.has(id)) elements.set(id, element());
  return elements.get(id);
};
const inventory = [{ item_id: 'feed' }, { item_id: 'feed' }, { item_id: 'starter' }];
const templates = { feed: { fert_c: 30, fert_n: 1 }, starter: { compost_inoculant_anaerobic: true } };
let capacity = 20;
let nearStation = true;
let dirtyness = 0;
const skills = {};
const count = id => inventory.filter(i => i.item_id === id).length;
const context = {
  console, JSON, Math: Object.assign(Object.create(Math), { random: () => 0.99 }),
  document: { getElementById: get, createElement: element },
  StationContext: { isOnCompostStationTile: () => nearStation },
  InventoryEquipment: {
    getState: () => ({ skills }), getItemTemplate: id => templates[id],
    getPocketArray: () => inventory, getVestArray: () => [], getBackpackArray: () => [],
    putItemIntoDefaultContainer(item) {
      if (inventory.length >= capacity) return { placed: false };
      inventory.push(item); return { placed: true };
    },
    takeItemFromContainer(type, index) { return inventory.splice(index, 1)[0]; }
  },
  InventoryHelpers: {
    getInventoryCountByItemId: count,
    findFirstContainerSlotByItemId(id) {
      const index = inventory.findIndex(item => item.item_id === id);
      return index < 0 ? null : { containerType: 'pocket', index };
    }
  },
  StationCraftCore: {
    getItemDisplayNameSafe: id => id,
    consumeInventoryItemsByList(list) {
      if (list.some(item => count(item.item_id) < item.count)) return { ok: false };
      for (const item of list) for (let i = 0; i < item.count; i++) inventory.splice(inventory.findIndex(x => x.item_id === item.item_id), 1);
      return { ok: true, consumed: list };
    },
    putItemsBack(list) { for (const item of list) for (let i = 0; i < item.count; i++) inventory.push({ item_id: item.item_id }); }
  },
  ui(key, vars = {}) {
    assert(Object.hasOwn(strings, key), 'missing UI string: ' + key);
    return strings[key].replace(/\{(\w+)\}/g, (all, name) => vars[name] ?? all);
  },
  showMsg() {},
  Survival: {
    advanceTick() { context.CompostSystem.onWorldTick(); },
    addDirtyness(n) { dirtyness += n; }
  }
};
context.window = context;
context.IE = context.InventoryEquipment;
vm.createContext(context);
vm.runInContext(read('js/compost-system.js'), context);
vm.runInContext(read('js/compost-panel.js'), context);
const source = read('js/scene-app.js');
const begin = source.indexOf('    (function bindCompostStationPanel()');
const end = source.indexOf('    })();', begin) + '    })();'.length;
assert(begin >= 0 && end > begin, 'scene compost binding must exist');
vm.runInContext(source.slice(begin, end), context);
const cs = context.CompostSystem;
const panel = context.CompostPanel;
cs.setEventsTable(JSON.parse(read('data/compost-events.json')));
panel.setUiDeps({ ui: context.ui });
panel.setEventActionDisplayById(Object.fromEntries(read('data/compost-event-actions.csv').trim().split(/\r?\n/).slice(1).map(row => row.split(',').slice(0, 2))));
panel.uiState.mode = 'anaerobic';
panel.open();
panel.uiState.staged_inputs = ['feed', 'feed'];
panel.uiState.staged_inoculant_item_id = 'starter';
panel.render();
get('compost-start-btn').click();
assert.equal(cs.getBatch('anaerobic').status, 'FERMENTING');
assert.equal(inventory.length, 0, 'start consumes selected materials and inoculant');
assert.equal(get('compost-stop-btn').style.display, 'none');
assert(get('compost-window-text').textContent.includes('下次检查'));
function at(age) { cs.advanceByTicks(age - cs.getBatch('anaerobic').age_ticks); panel.render(); }
function clickAction(action) {
  const slot = Object.keys(panel.windowActionSlots).find(key => panel.windowActionSlots[key] === action);
  assert(slot, 'visible action: ' + action);
  get('compost-interact-' + slot + '-btn').click();
}
at(336);
assert(get('compost-observation-title').textContent.includes('排气口嘶鸣'));
assert.equal(get('modal-compost-station').attrs['data-phase'], 'ferment');
assert.equal(get('compost-preparation').hidden, true);
assert.equal(get('compost-material-details').open, false);
const slots = JSON.stringify(panel.windowActionSlots);
panel.render();
assert.equal(JSON.stringify(panel.windowActionSlots), slots, 'rerender keeps choice order');
nearStation = false;
clickAction('vent_gas');
assert.equal(cs.getBatch('anaerobic').age_ticks, 336, 'remote action rejected');
nearStation = true;
clickAction('vent_gas');
assert.equal(cs.getBatch('anaerobic').age_ticks, 337);
assert.equal(dirtyness, 10);
assert(get('compost-immediate-feedback').textContent.includes('放气后渗漏停止'));
assert(get('compost-log-list').children.some(el => el.textContent.includes('放气后渗漏停止')));
assert(get('compost-progress-kv').children.some(el => el.textContent.includes('桶内平稳')));
at(672);
assert(Object.values(panel.windowActionSlots).includes('harvest_early'));
clickAction('harvest_early');
assert.equal(cs.getBatch('anaerobic').status, 'SETTLED');
assert.equal(get('modal-compost-station').attrs['data-phase'], 'settled');
assert.equal(get('compost-history-details').open, true);
assert(get('compost-result-list').children.some(el => el.children.some(child => child.textContent.includes('实际产出 3 瓶'))));
assert.equal(dirtyness, 20);
assert(get('compost-log-list').children.some(el => el.textContent.includes('提前结束')));
const save = cs.getState();
panel.uiState.logs = [];
cs.setState(save);
panel.render();
assert(get('compost-log-list').children.some(el => el.textContent.includes('提前结束')), 'feedback survives reload');
capacity = 1;
get('compost-collect-btn').click();
assert.equal(inventory.length, 1);
assert.equal(cs.getBatch('anaerobic').results[0].count, 2);
nearStation = false;
capacity = 20;
get('compost-collect-btn').click();
assert.equal(inventory.length, 1, 'remote collection rejected');
nearStation = true;
get('compost-collect-btn').click();
assert.equal(inventory.length, 3);
assert.equal(cs.getBatch('anaerobic').results.length, 0);
assert(get('compost-result-list').children.some(el => el.children.some(child => child.textContent.includes('实际产出 3 瓶'))));
assert.equal(get('compost-discard-btn').textContent, '准备下一批');
get('compost-discard-btn').click();
assert.equal(get('modal-compost-station').attrs['data-phase'], 'prepare');
assert.equal(get('compost-preparation').hidden, false);
cs.startBatch('anaerobic', { c_total: 12, n_total: 1 });
at(336);
assert(Object.values(panel.windowActionSlots).includes('vent_gently'));
clickAction('vent_gently');
assert.equal(cs.getBatch('anaerobic').anaerobic_condition, 'stable');
assert(get('compost-log-list').children.some(el => el.textContent.includes('缓慢放气')));
// Real catalog regression: three octopuses are valid feed, but need a starter.
cs.abort('anaerobic');
const catalog = JSON.parse(read('data/items.json'));
templates.fish_octopus = catalog.fish_octopus;
templates.herb_shiitake = catalog.herb_shiitake;
inventory.splice(0, inventory.length, ...Array.from({ length: 3 }, () => ({ item_id: 'fish_octopus' })), { item_id: 'herb_shiitake' });
panel.uiState.staged_inputs = Array(3).fill('fish_octopus');
panel.uiState.staged_inoculant_item_id = '';
panel.render();
assert.equal(get('compost-start-btn').disabled, true);
assert(get('compost-start-hint').textContent.includes('菌种'), 'disabled start must explain missing starter without requiring a click');
panel.uiState.staged_inoculant_item_id = 'herb_shiitake';
panel.render();
assert.equal(get('compost-start-btn').disabled, false);
assert.equal(get('compost-start-hint').textContent, '');
get('compost-start-btn').click();
assert.equal(cs.getBatch('anaerobic').status, 'FERMENTING');
assert.equal(cs.getBatch('anaerobic').base_tier, 'low');
assert.equal(inventory.length, 0);
console.log('[ok] compost panel integration including three octopuses + starter and visible start guard');
