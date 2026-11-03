import fs from 'node:fs';

// Keep pharmacy tests independent of the separately developed backpack system.
export function equipPharmacyTestBag(g) {
  const ie = g.InventoryEquipment;
  let bag;
  if (g.BackpackSystem) bag = g.BackpackSystem.generate('eq_backpack_light_canvas', []);
  else {
    const equipment = JSON.parse(fs.readFileSync('data/equipment.json', 'utf8'));
    equipment.pharmacy_test_bag = { id: 'pharmacy_test_bag', name_0: '测试背包', equip_slot: 'backpack', backpack_slots: 30, backpack_weight_factor: 1 };
    ie.setConfig({ equipment });
    bag = { item_id: 'pharmacy_test_bag', count: 1 };
  }
  ie.setState({ ...ie.getState(), equipment: { ...ie.getState().equipment, backpack: bag } });
}
