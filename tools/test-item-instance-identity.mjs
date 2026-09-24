import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ console, Math, Date });
context.window = context;
context.globalThis = context;
context.UIText = { t: key => key };
vm.runInContext(fs.readFileSync(new URL('../js/item-attribute-modules.js', import.meta.url), 'utf8'), context);
vm.runInContext(fs.readFileSync(new URL('../js/inventory-equipment.js', import.meta.url), 'utf8'), context);

const IE = context.InventoryEquipment;
IE.setConfig({
  equipment: {
    test_bag: { item_id: 'test_bag', name: 'Test bag', equip_slot: 'backpack', backpack_slots: 6, stack_limit: 1, weight_kg: 1 },
    test_armor: { item_id: 'test_armor', name: 'Test armor', equip_slot: 'clothing', module_slots: ['chest'], pocket_slots: 0, stack_limit: 1, weight_kg: 2 }
  },
  items: {
    stack_item: { item_id: 'stack_item', name: 'Stack item', stack_limit: 10, weight_kg: 0.1 },
    unique_item: { item_id: 'unique_item', name: 'Unique item', stack_limit: 1, weight_kg: 0.5 }
  },
  modules: {
    test_plate: { item_id: 'test_plate', name: 'Test plate', install_slots: ['clothing.chest'], occupies: ['clothing.chest'], max_per_armor: 1, weight_kg: 0.3 }
  },
  default_equipment: {}
});

const legacy = {
  equipment: { backpack: { item_id: 'test_bag' }, clothing: { item_id: 'test_armor', modules: { chest: { item_id: 'test_plate', wear: 2 } } } },
  inventory_backpack: [
    { item_id: 'stack_item', count: 2, future_state: { retained: true } },
    { item_id: 'unique_item', count: 1, wear: 7 }
  ],
  inventory_pocket: [], inventory_vest: [], inventory_vehicle: [], ground_items: {}
};

IE.setState(legacy);
const firstMigration = JSON.parse(JSON.stringify(IE.getState()));
assert.match(firstMigration.inventory_backpack[0].instance_id, /^itm:legacy-/);
assert.equal(firstMigration.inventory_backpack[0].instance_schema_version, 1);
assert.equal(firstMigration.inventory_backpack[0].future_state.retained, true);
IE.setState(legacy);
const secondMigration = IE.getState();
assert.equal(secondMigration.inventory_backpack[0].instance_id, firstMigration.inventory_backpack[0].instance_id, 'legacy migration is not deterministic');
assert.equal(secondMigration.inventory_backpack[1].instance_id, firstMigration.inventory_backpack[1].instance_id, 'legacy unique item identity changed');
assert.ok(secondMigration.equipment.clothing.modules.chest.instance_id, 'legacy installed module did not receive identity');
const legacyModuleId = secondMigration.equipment.clothing.modules.chest.instance_id;
const migratedModule = IE.uninstallModule('clothing', 'chest');
assert.equal(migratedModule.item.instance_id, legacyModuleId, 'legacy module identity changed during uninstall');

const stackId = secondMigration.inventory_backpack[0].instance_id;
const split = IE.takeItemFromContainer('backpack', 0);
assert.equal(split.success, true);
assert.notEqual(split.item.instance_id, stackId, 'split stack reused the source stack identity');
assert.equal(IE.getState().inventory_backpack[0].instance_id, stackId, 'source stack identity changed on split');
assert.equal(IE.putItemIntoDefaultContainer(split.item).placed, true);
assert.equal(IE.getState().inventory_backpack[0].instance_id, stackId, 'merge replaced destination stack identity');
assert.equal(IE.getState().inventory_backpack[0].count, 2);

const uniqueId = IE.getState().inventory_backpack[1].instance_id;
assert.equal(IE.dropItemToGround('backpack', 1, 'test_map', 2, 3).success, true);
assert.equal(IE.getGroundItemsAt('test_map', 2, 3)[0].instance_id, uniqueId, 'drop changed identity');
assert.equal(IE.pickUpFromGround('test_map', 2, 3, 0).success, true);
assert.equal(IE.getState().inventory_backpack[1].instance_id, uniqueId, 'pickup changed identity');

const duplicateAttempt = IE.putItemIntoDefaultContainer(IE.copyItemInstance(IE.getState().inventory_backpack[1]));
assert.equal(duplicateAttempt.placed, false);
assert.equal(duplicateAttempt.reason, 'duplicate_instance_id');

const duplicateEquip = IE.equip('backpack', IE.copyItemInstance(IE.getState().equipment.backpack));
assert.equal(duplicateEquip.success, false);
assert.equal(duplicateEquip.reason, 'duplicate_instance_id');

const installed = IE.installModule('clothing', 'chest', { item_id: 'test_plate', wear: 3 });
assert.equal(installed.success, true);
const moduleId = IE.getState().equipment.clothing.modules.chest.instance_id;
assert.ok(moduleId);
assert.ok(Math.abs(IE.getItemCombinedWeight(IE.getState().equipment.clothing) - 2.3) < 1e-9, 'installed module weight is missing');
const duplicateModule = IE.installModule('clothing', 'chest', IE.copyItemInstance(IE.getState().equipment.clothing.modules.chest));
assert.equal(duplicateModule.success, false);
assert.equal(duplicateModule.reason, 'duplicate_instance_id');
const uninstalled = IE.uninstallModule('clothing', 'chest');
assert.equal(uninstalled.item.instance_id, moduleId, 'uninstall changed real part identity');

const saved = JSON.parse(JSON.stringify(IE.getState()));
IE.setState(saved);
assert.equal(IE.getState().inventory_backpack[1].instance_id, uniqueId, 'save/load changed identity');
assert.equal(IE.auditItemOwnership().ok, true);

vm.runInContext(fs.readFileSync(new URL('../js/hideout-warehouse.js', import.meta.url), 'utf8'), context);
const HW = context.HideoutWarehouse;
HW.setUpgradeTable({ base_capacity: 2, base_free_qol_ids: ['deposit_auto_stack', 'withdraw_to_character_default_order'] });
HW.setState(HW.createDefaultState());
const beforeDepositId = IE.getState().inventory_backpack[1].instance_id;
assert.equal(HW.depositFromContainer('backpack', 1).ok, true);
assert.equal(HW.getState().slots[0].instance_id, beforeDepositId, 'warehouse deposit changed identity');
assert.equal(IE.getState().inventory_backpack[1], null);
assert.equal(IE.auditItemOwnership({ warehouse: HW.getState().slots }).ok, true);
assert.equal(HW.withdrawSlot(0, 1).ok, true);
assert.equal(IE.getState().inventory_backpack[1].instance_id, beforeDepositId, 'warehouse withdrawal changed identity');

const duplicatedAcrossDomains = IE.copyItemInstance(IE.getState().inventory_backpack[1]);
HW.setState({ capacity: 1, slots: [duplicatedAcrossDomains], unlocked_qol_ids: [], unlocked_upgrade_ids: [], settings: {} });
assert.notEqual(HW.getState().slots[0].instance_id, beforeDepositId, 'warehouse load kept a duplicate inventory identity');
assert.equal(IE.auditItemOwnership({ warehouse: HW.getState().slots }).ok, true);
const inventoryBeforeFailure = JSON.stringify(IE.getState());
const warehouseBeforeFailure = JSON.stringify(HW.getState());
assert.equal(HW.depositFromContainer('backpack', 1).ok, false);
assert.equal(JSON.stringify(IE.getState()), inventoryBeforeFailure, 'failed deposit changed inventory');
assert.equal(JSON.stringify(HW.getState()), warehouseBeforeFailure, 'failed deposit changed warehouse');

IE.setState({
  equipment: { backpack: { item_id: 'test_bag' }, clothing: { item_id: 'test_armor', modules: { chest: null } } },
  inventory_backpack: [{ item_id: 'stack_item', count: 2 }],
  inventory_pocket: [], inventory_vest: [], inventory_vehicle: [], ground_items: {}
});
HW.setUpgradeTable({ base_capacity: 2, base_free_qol_ids: ['deposit_auto_stack', 'withdraw_to_character_default_order'] });
HW.setState({
  capacity: 2,
  slots: [{ item_id: 'stack_item', count: 9 }, { item_id: 'unique_item', count: 1 }],
  unlocked_qol_ids: ['deposit_auto_stack'], unlocked_upgrade_ids: [], settings: {}
});
const inventoryBeforePartial = JSON.stringify(IE.getState());
const warehouseBeforePartial = JSON.stringify(HW.getState());
const partialDeposit = HW.depositFromContainer('backpack', 0);
assert.equal(partialDeposit.ok, false);
assert.equal(partialDeposit.reason, 'warehouse_full');
assert.equal(JSON.stringify(IE.getState()), inventoryBeforePartial, 'partial deposit rollback changed inventory');
assert.equal(JSON.stringify(HW.getState()), warehouseBeforePartial, 'partial deposit rollback changed warehouse');

console.log('[item-instance-identity] PASS', JSON.stringify({
  namespace: IE.getState().item_identity.namespace,
  ownership: IE.auditItemOwnership({ warehouse: HW.getState().slots })
}));
