import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ console, Math, Date });
context.window = context;
context.globalThis = context;
context.UIText = { t: key => key };
for (const file of ['item-attribute-modules.js', 'inventory-equipment.js', 'item-assembly.js']) {
  vm.runInContext(fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8'), context);
}

const catalog = JSON.parse(fs.readFileSync(new URL('../data/item-catalog-v2.json', import.meta.url), 'utf8'));
const IE = context.InventoryEquipment;
const Assembly = context.ItemAssembly;
const extraItems = {
  test_node_a: { item_id: 'test_node_a', name: 'Node A', weight_kg: 0.1, stack_limit: 1, assembly_types: ['test.node'], assembly_slots: { child: { accepts: ['test.node'] } } },
  test_node_b: { item_id: 'test_node_b', name: 'Node B', weight_kg: 0.1, stack_limit: 1, assembly_types: ['test.node'], assembly_slots: { child: { accepts: ['test.node'] } } }
};
const hydrated = context.ItemAttributeModules.hydrateCatalog(catalog);
IE.setConfig({
  equipment: { test_bag_12: { item_id: 'test_bag_12', name: 'Test bag', equip_slot: 'backpack', backpack_slots: 12, backpack_weight_factor: 0.7, weight_kg: 1 } },
  items: Object.assign({}, hydrated, extraItems), modules: {}, default_equipment: {}
});

const fixture = {
  equipment: { backpack: { item_id: 'test_bag_12' } },
  inventory_backpack: [
    { item_id: 'fishing_rod_hand_basic' },
    { item_id: 'fishing_line_main_nylon_thin' },
    { item_id: 'fishing_float_small' },
    { item_id: 'fishing_sinker_fixed_1g' },
    { item_id: 'fishing_leader_nylon_basic', wear: 2 },
    { item_id: 'fishing_hook_single_small', wear: 1 },
    { item_id: 'fishing_bait_worm', count: 2, spoilage_elapsed_ticks: 17 },
    { item_id: 'fishing_sinker_fixed_1g' },
    { item_id: 'test_node_a' },
    { item_id: 'test_node_b' }
  ],
  inventory_pocket: [], inventory_vest: [], inventory_vehicle: [], ground_items: {}
};

IE.setState(fixture);
const initialCarryWeight = IE.getCurrentCarryWeight();
const rodId = IE.getState().inventory_backpack[0].instance_id;

const lineAttach = Assembly.attachFromContainer(rodId, 'main_line', 'backpack', 1);
assert.equal(lineAttach.ok, true);
const lineId = lineAttach.part_instance_id;
assert.equal(Assembly.attachFromContainer(lineId, 'float', 'backpack', 2).ok, true);
assert.equal(Assembly.attachFromContainer(lineId, 'sinker', 'backpack', 3).ok, true);
const leaderAttach = Assembly.attachFromContainer(lineId, 'leader', 'backpack', 4);
assert.equal(leaderAttach.ok, true);
const leaderId = leaderAttach.part_instance_id;
const hookAttach = Assembly.attachFromContainer(leaderId, 'hook', 'backpack', 5);
assert.equal(hookAttach.ok, true);
const hookId = hookAttach.part_instance_id;
const sourceBaitId = IE.getState().inventory_backpack[6].instance_id;
const baitAttach = Assembly.attachFromContainer(hookId, 'bait', 'backpack', 6);
assert.equal(baitAttach.ok, true);
assert.notEqual(baitAttach.part_instance_id, sourceBaitId, 'split bait stack reused source stack identity');
assert.equal(IE.getState().inventory_backpack[6].count, 1);

const rod = IE.findItemInstanceRecord(rodId).instance;
const complete = Assembly.validateAssembly(rod, { requireComplete: true });
assert.equal(complete.ok, true, JSON.stringify(complete.errors));
assert.equal(complete.instance_count, 7);
assert.ok(Math.abs(IE.getItemCombinedWeight(rod) - 0.526) < 1e-9, 'combined rig weight is wrong');
assert.ok(Math.abs(IE.getCurrentCarryWeight() - initialCarryWeight) < 1e-9, 'assembly changed carried mass');
assert.equal(IE.getState().inventory_backpack.filter(Boolean).length, 5, 'connected parts still occupy backpack slots');
assert.equal(IE.auditItemOwnership().ok, true);

const beforeMismatch = JSON.stringify(IE.getState());
const mismatch = Assembly.attachFromContainer(hookId, 'bait', 'backpack', 7);
assert.equal(mismatch.ok, false);
assert.equal(mismatch.reason, 'slot_occupied');
assert.equal(JSON.stringify(IE.getState()), beforeMismatch, 'failed attachment mutated state');
const detachedBait = Assembly.detachToInventory(hookId, 'bait');
assert.equal(detachedBait.ok, true);
const beforeWrongType = JSON.stringify(IE.getState());
const wrongType = Assembly.attachFromContainer(hookId, 'bait', 'backpack', 7);
assert.equal(wrongType.ok, false);
assert.equal(wrongType.reason, 'incompatible_part');
assert.equal(JSON.stringify(IE.getState()), beforeWrongType, 'incompatible attachment mutated state');
assert.equal(Assembly.attachFromContainer(hookId, 'bait', 'backpack', detachedBait.placed.index).ok, true);

const nodeAId = IE.getState().inventory_backpack[8].instance_id;
const nodeBId = IE.getState().inventory_backpack[9].instance_id;
assert.equal(Assembly.attachFromContainer(nodeAId, 'child', 'backpack', 9).ok, true);
const beforeCycle = JSON.stringify(IE.getState());
const cycle = Assembly.attachFromContainer(nodeBId, 'child', 'backpack', 8);
assert.equal(cycle.ok, false);
assert.equal(cycle.reason, 'cycle');
assert.equal(JSON.stringify(IE.getState()), beforeCycle, 'cycle rejection mutated state');

const saved = JSON.parse(JSON.stringify(IE.getState()));
const leaderBeforeSave = IE.findItemInstanceRecord(leaderId).instance;
const hookBeforeSave = IE.findItemInstanceRecord(hookId).instance;
const baitBeforeSave = IE.findItemInstanceRecord(baitAttach.part_instance_id).instance;
IE.setState(saved);
assert.equal(IE.findItemInstanceRecord(leaderId).instance.wear, leaderBeforeSave.wear);
assert.equal(IE.findItemInstanceRecord(hookId).instance.wear, hookBeforeSave.wear);
assert.equal(IE.findItemInstanceRecord(baitAttach.part_instance_id).instance.spoilage_elapsed_ticks, baitBeforeSave.spoilage_elapsed_ticks);

const weightBeforeDetach = IE.getCurrentCarryWeight();
const detached = Assembly.detachToInventory(lineId, 'leader');
assert.equal(detached.ok, true);
assert.equal(detached.part_instance_id, leaderId);
assert.ok(IE.findItemInstanceLocation(hookId).startsWith('inventory_backpack['), 'hook did not remain inside detached subassembly');
assert.ok(Math.abs(IE.getCurrentCarryWeight() - weightBeforeDetach) < 1e-9, 'detaching changed carried mass');
const detachedIndex = detached.placed.index;
assert.equal(Assembly.attachFromContainer(lineId, 'leader', 'backpack', detachedIndex).ok, true);
assert.equal(Assembly.validateAssembly(IE.findItemInstanceRecord(rodId).instance, { requireComplete: true }).ok, true);

vm.runInContext(fs.readFileSync(new URL('../js/hideout-warehouse.js', import.meta.url), 'utf8'), context);
const HW = context.HideoutWarehouse;
HW.setUpgradeTable({ base_capacity: 4, base_free_qol_ids: ['deposit_auto_stack', 'withdraw_to_character_default_order'] });
HW.setState(HW.createDefaultState());
const rodIndex = IE.findItemInstanceRecord(rodId).location.match(/\[(\d+)\]/);
assert.ok(rodIndex);
assert.equal(HW.depositFromContainer('backpack', Number(rodIndex[1])).ok, true);
const warehouseRod = HW.getState().slots.find(Boolean);
assert.equal(warehouseRod.instance_id, rodId);
assert.equal(Assembly.validateAssembly(warehouseRod, { requireComplete: true }).ok, true);
assert.equal(IE.auditItemOwnership({ warehouse: HW.getState().slots }).ok, true);
assert.equal(HW.withdrawSlot(0).ok, true);
assert.equal(Assembly.validateAssembly(IE.findItemInstanceRecord(rodId).instance, { requireComplete: true }).ok, true);

const rodAfterWarehouse = IE.findItemInstanceRecord(rodId);
const rodBackpackIndex = Number(rodAfterWarehouse.location.match(/\[(\d+)\]/)[1]);
assert.equal(IE.dropItemToGround('backpack', rodBackpackIndex, 'assembly_map', 4, 5).success, true);
const groundRig = IE.getGroundItemsAt('assembly_map', 4, 5)[0];
assert.equal(groundRig.instance_id, rodId);
assert.equal(Assembly.validateAssembly(groundRig, { requireComplete: true }).ok, true);
assert.equal(IE.pickUpFromGround('assembly_map', 4, 5, 0).success, true);
assert.equal(Assembly.validateAssembly(IE.findItemInstanceRecord(rodId).instance, { requireComplete: true }).ok, true);

const fullRig = JSON.parse(JSON.stringify(IE.findItemInstanceRecord(rodId).instance));
IE.setConfig({
  equipment: { test_bag_1: { item_id: 'test_bag_1', name: 'One slot bag', equip_slot: 'backpack', backpack_slots: 1, backpack_weight_factor: 0.7, weight_kg: 1 } },
  items: Object.assign({}, hydrated, extraItems), modules: {}, default_equipment: {}
});
IE.setState({ equipment: { backpack: { item_id: 'test_bag_1' } }, inventory_backpack: [fullRig], inventory_pocket: [], inventory_vest: [], inventory_vehicle: [], ground_items: {} });
const fullBefore = JSON.stringify(IE.getState());
const noRoom = Assembly.detachToInventory(lineId, 'leader');
assert.equal(noRoom.ok, false);
assert.equal(noRoom.reason, 'inventory_full');
assert.equal(JSON.stringify(IE.getState()), fullBefore, 'failed detach did not roll back');

console.log('[item-assembly] PASS', JSON.stringify({
  rig_instance_id: rodId,
  connected_instances: complete.instance_count,
  combined_weight_kg: 0.526,
  ownership: IE.auditItemOwnership()
}));
