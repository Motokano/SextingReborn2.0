// Resource-budget regression tests. Uses production runtime/config and real inventory.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../../', import.meta.url);
export const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const data = p => JSON.parse(read('data/' + p));
export const species = data('livestock-species.json').species;
export const items = data('items.json');
export function fixture() {
  const math = Object.create(Math); math.random = () => 0.5;
  const ctx = vm.createContext({ Math: math, console, UIText: { t: k => k } }); ctx.window = ctx;
  vm.runInContext(read('js/inventory-equipment.js'), ctx);
  const ie = ctx.InventoryEquipment; ie.setConfig({ items });
  ie.setState({ equipment: { clothing: { item_id: 'eq_clothing_combat_suit' } }, inventory_pocket: [{ item_id: 'herb_maize' }, { item_id: 'herb_maize' }] });
  vm.runInContext(read('js/livestock-state.js'), ctx);
  const ls = ctx.LivestockState;
  ls.setConfig(species, data('livestock-modules.json').modules, data('livestock-perks.json').perks, data('livestock-build-costs.json').costs, data('livestock-feed-crops.json').crops, data('livestock-species.json').pasture_rules);
  ls.initDemoState(); const st = ls.getState(); st.rotation_ticks_remaining = 1000; st.power_charge = 100000;
  function mount(arm, slot, id, level = 1) {
    const old = ctx.InventoryEquipment;
    ctx.InventoryEquipment = { countCarriedItemsByTemplateId: () => 1000, removeCarriedItemsByTemplateId: () => ({ ok: true }) };
    try {
      const r = ls.buildModule(arm, slot, id);
      if (r.reason === 'module_retired') throw Object.assign(new Error('Retired module: ' + id), { code: 'module_retired' });
      assert.equal(r.ok, true);
    } finally { ctx.InventoryEquipment = old; }
    const inst = arm === 'axis' ? st.axis[slot] : st.arms[arm][slot]; inst.level = level; return inst;
  }
  function animal(kind, loc = 'z1', opts = {}) {
    const sp = species[kind];
    const a = { uid: 'animal_' + (st.animals.length + 1), species_id: kind, gender: 'male', age_ticks: Math.max(sp.growth.maturity_ticks || 0, ...sp.products.living.map(p=>p.min_age_ticks||0)),
      weight_kg: sp.growth.graze_cap_kg || sp.growth.wean_weight_kg || 2.5, satiety: 80, hp: 100, perks: [], cooldowns: {},
      location_type: kind === 'chicken' ? 'coop' : 'zone', zone_id: kind === 'chicken' ? null : loc,
      arm_id: kind === 'chicken' ? loc : null, dead: false, starvation_ticks: 0, ...opts };
    st.animals.push(a); return a;
  }
  return { ctx, ls, st, ie, mount, animal, tick(n = 1) { for (let i = 0; i < n; i++) ls.advanceTick(); } };
}
