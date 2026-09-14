import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const methods = JSON.parse(read('data/recipe-methods.json')).methods;
const originalMethods = JSON.stringify(methods);
const expected = Object.keys(methods).filter(id => methods[id].recipe_system === 'life_pharmacy').sort();
assert(expected.length > 0 && expected.length < Object.keys(methods).length);
function element() {
  return { style: {}, children: [], attributes: {},
    set innerHTML(value) { this.children = []; },
    appendChild(child) { this.children.push(child); },
    setAttribute(key, value) { this.attributes[key] = value; }
  };
}
const list = element();
const modal = element();
const ctx = { SceneCtx: {}, document: {
  getElementById: id => id === 'modal-pharmacy-station' ? modal : id === 'pharmacy-method-list' ? list : null,
  createElement: element
} };
vm.createContext(ctx);
for (const file of ['station-craft-core', 'pharmacy-station', 'pharmacy-station-panel']) {
  vm.runInContext(read('js/' + file + '.js'), ctx);
}
// Match scene-app: the station receives the shared, unfiltered methods table.
ctx.PharmacyStation.setConfig({ methods });
ctx.PharmacyStationPanel.render();
assert.deepEqual(list.children.map(button => button.attributes['data-method-id']), expected,
  'The pharmacy panel must display all and only pharmacy methods');
const expectedAccessories = [...new Set(expected.map(id => methods[id].requires_accessory_item_id).filter(Boolean))].sort();
assert.deepEqual(Array.from(ctx.PharmacyStation.getPharmacyAccessoryItemIdsFromMethods()), expectedAccessories);
assert.equal(JSON.stringify(methods), originalMethods, 'Loading a station must not mutate the shared table');
ctx.PharmacyStation.setConfig({ methods: {} });
ctx.PharmacyStationPanel.render();
assert.equal(list.children.length, 0, 'Reloading an empty config clears old methods');
console.log('Pharmacy method list and accessory isolation regression passed.');
