import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const quietConsole = Object.assign({}, console, { warn() {} });
const context = vm.createContext({ console: quietConsole, Math, Date });
context.window = context;
context.globalThis = context;
context.UIText = { t: key => key };
for (const file of [
  'item-attribute-modules.js',
  'inventory-equipment.js',
  'item-assembly.js',
  'hideout-warehouse.js',
  'fishing-session.js'
]) {
  vm.runInContext(fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8'), context);
}

const catalog = JSON.parse(fs.readFileSync(new URL('../data/item-catalog-v2.json', import.meta.url), 'utf8'));
const fishingConfig = JSON.parse(fs.readFileSync(new URL('../data/fishing-session-config.json', import.meta.url), 'utf8'));
const IE = context.InventoryEquipment;
const Assembly = context.ItemAssembly;
const HW = context.HideoutWarehouse;
const Fishing = context.FishingSession;
const hydrated = context.ItemAttributeModules.hydrateCatalog(catalog);

IE.setConfig({
  equipment: {
    test_fishing_bag: {
      item_id: 'test_fishing_bag', name: 'Fishing test bag', equip_slot: 'backpack',
      backpack_slots: 20, backpack_weight_factor: 0.7, weight_kg: 1
    }
  },
  items: hydrated,
  modules: {},
  default_equipment: {}
});
HW.setUpgradeTable({ base_capacity: 4, base_free_qol_ids: ['deposit_auto_stack', 'withdraw_to_character_default_order'] });
HW.setState(HW.createDefaultState());
assert.equal(Fishing.configure(fishingConfig), true);

let ticks = 0;
let stamina = 100;
let lastSpoilage = null;
Fishing.setHost({
  stamina: () => stamina,
  spendStamina: amount => { stamina -= amount; },
  advanceTick: () => { ticks += 1; lastSpoilage = HW.tickSpoilage(); }
});

function backpackIndex(itemId) {
  return IE.getState().inventory_backpack.findIndex(cell => cell && cell.item_id === itemId);
}

function assembleRig(options = {}) {
  Fishing.setState(null);
  ticks = 0;
  stamina = options.stamina == null ? 100 : options.stamina;
  lastSpoilage = null;
  IE.setState({
    equipment: { backpack: { item_id: 'test_fishing_bag' } },
    inventory_backpack: [
      { item_id: 'fishing_rod_hand_basic' },
      { item_id: 'fishing_line_main_nylon_thin' },
      { item_id: 'fishing_float_small' },
      { item_id: 'fishing_sinker_fixed_1g' },
      { item_id: 'fishing_leader_nylon_basic' },
      { item_id: 'fishing_hook_single_small' },
      { item_id: 'fishing_bait_worm', spoilage_elapsed_ticks: options.baitElapsed || 0 }
    ],
    inventory_pocket: [], inventory_vest: [], inventory_vehicle: [], ground_items: {}
  });
  const rodId = IE.getState().inventory_backpack[0].instance_id;
  const line = Assembly.attachFromContainer(rodId, 'main_line', 'backpack', backpackIndex('fishing_line_main_nylon_thin'));
  assert.equal(line.ok, true);
  const lineId = line.part_instance_id;
  assert.equal(Assembly.attachFromContainer(lineId, 'float', 'backpack', backpackIndex('fishing_float_small')).ok, true);
  assert.equal(Assembly.attachFromContainer(lineId, 'sinker', 'backpack', backpackIndex('fishing_sinker_fixed_1g')).ok, true);
  const leader = Assembly.attachFromContainer(lineId, 'leader', 'backpack', backpackIndex('fishing_leader_nylon_basic'));
  assert.equal(leader.ok, true);
  const leaderId = leader.part_instance_id;
  const hook = Assembly.attachFromContainer(leaderId, 'hook', 'backpack', backpackIndex('fishing_hook_single_small'));
  assert.equal(hook.ok, true);
  const hookId = hook.part_instance_id;
  const bait = Assembly.attachFromContainer(hookId, 'bait', 'backpack', backpackIndex('fishing_bait_worm'));
  assert.equal(bait.ok, true);
  const root = IE.findItemInstanceRecord(rodId).instance;
  assert.equal(Assembly.validateAssembly(root, { requireComplete: true }).ok, true);
  return { rodId, lineId, leaderId, hookId, baitId: bait.part_instance_id };
}

function contact(overrides = {}) {
  return Object.assign({
    event_id: 'contact:test-carp',
    load_rating: 3,
    endurance: 10,
    hook_fit: 'good',
    visible_signal: 'float_submerged',
    behavior_sequence: [
      { id: 'steady', load_delta: 0, progress_delta: 0, hook_delta: 0 },
      { id: 'surge', load_delta: 0, progress_delta: 0, hook_delta: 0 }
    ]
  }, overrides);
}

// Full job: one real bait is consumed, overload wear persists, then the actual leader subtree is lost.
let ids = assembleRig();
assert.equal(Fishing.start(ids.rodId, 'pond:test').ok, true);
assert.equal(Fishing.cast().ok, true);
assert.equal(ticks, 1);
assert.equal(Assembly.detachToInventory(ids.hookId, 'bait').reason, 'item_locked');
const rigIndexWhileActive = IE.getState().inventory_backpack.findIndex(cell => cell && cell.instance_id === ids.rodId);
assert.equal(IE.takeItemFromContainer('backpack', rigIndexWhileActive).reason, 'item_locked');
assert.equal(HW.depositFromContainer('backpack', rigIndexWhileActive).reason, 'item_locked');
assert.equal(Fishing.acceptContactEvent(contact()).ok, true);
const struck = Fishing.strike('normal');
assert.equal(struck.ok, true);
assert.equal(struck.hooked, true);
assert.equal(struck.bait_consumed, true);
assert.equal(IE.findItemInstanceRecord(ids.baitId), null);
const firstFight = Fishing.fightStep('steady');
assert.equal(firstFight.ok, true);
assert.equal(firstFight.phase, 'fight');
assert.equal(IE.findItemInstanceRecord(ids.leaderId).instance.fishing_wear_stage, 1);
assert.equal(Fishing.getState().active.overload_counts[ids.leaderId], 1);

const savedInventory = JSON.parse(JSON.stringify(IE.getState()));
const savedFishing = Fishing.getState();
const savedBehaviorIndex = savedFishing.active.contact.behavior_index;
Fishing.setState(null);
IE.setState(savedInventory);
assert.equal(Fishing.setState(savedFishing), true);
assert.equal(Fishing.getState().active.contact.behavior_index, savedBehaviorIndex);
const secondFight = Fishing.fightStep('steady');
assert.equal(secondFight.ok, true);
assert.equal(secondFight.phase, 'ended');
assert.equal(secondFight.broken.broken_item_id, 'fishing_leader_nylon_basic');
assert.deepEqual(Array.from(secondFight.broken.lost.lost_items, x => x.item_id), [
  'fishing_leader_nylon_basic', 'fishing_hook_single_small'
]);
assert.equal(IE.findItemInstanceRecord(ids.leaderId), null);
assert.ok(IE.findItemInstanceRecord(ids.lineId));
assert.equal(IE.auditItemOwnership().ok, true);

// Player-facing state contains feedback and phase, without hidden fish/load or item instance identities.
const publicJson = JSON.stringify(Fishing.getPublicState());
for (const hidden of ['contact:test-carp', 'load_rating', 'behavior_sequence', 'rig_instance_id', ids.rodId]) {
  assert.equal(publicJson.includes(hidden), false, 'public state leaked ' + hidden);
}

// Cutting the accessible main line loses exactly its current downstream tree and leaves the rod.
ids = assembleRig();
assert.equal(Fishing.start(ids.rodId, 'pond:test').ok, true);
assert.equal(Fishing.cast().ok, true);
const cut = Fishing.cutLine();
assert.equal(cut.ok, true);
assert.equal(cut.lost.lost_items.length, 6);
assert.deepEqual(new Set(Array.from(cut.lost.lost_items, x => x.item_id)), new Set([
  'fishing_line_main_nylon_thin', 'fishing_float_small', 'fishing_sinker_fixed_1g',
  'fishing_leader_nylon_basic', 'fishing_hook_single_small', 'fishing_bait_worm'
]));
assert.ok(Math.abs(cut.lost.lost_weight_kg - 0.076) < 1e-9);
assert.ok(Math.abs(IE.getItemCombinedWeight(IE.findItemInstanceRecord(ids.rodId).instance) - 0.45) < 1e-9);

// A submerged bait may expire on a tick; the player learns this only when retrieving.
ids = assembleRig({ baitElapsed: 598 });
assert.equal(Fishing.start(ids.rodId, 'pond:test').ok, true);
assert.equal(Fishing.cast().ok, true); // 599
assert.equal(Fishing.getPublicState().active.last_feedback, 'rig_settled');
assert.equal(Fishing.waitTick().ok, true); // 600, bait expires inside the connection tree
assert.equal(lastSpoilage.expired_items.fishing_bait_worm, 1);
assert.equal(IE.findItemInstanceRecord(ids.baitId), null);
assert.equal(Fishing.getPublicState().active.last_feedback, 'no_obvious_movement');
const retrieved = Fishing.retrieve();
assert.equal(retrieved.ok, true);
assert.equal(retrieved.bait_missing, true);
assert.equal(retrieved.feedback, 'bait_missing_on_retrieve');
assert.equal(Assembly.detachToInventory(ids.lineId, 'leader').ok, true, 'rig should unlock after retrieval');

// Failed stamina check is atomic: no tick, phase or rig mutation.
ids = assembleRig({ stamina: 0 });
assert.equal(Fishing.start(ids.rodId, 'pond:test').ok, true);
const beforeFailedCast = JSON.stringify(IE.getState());
const beforeFailedSession = Fishing.getState();
const failedCast = Fishing.cast();
assert.equal(failedCast.ok, false);
assert.equal(failedCast.reason, 'stamina');
assert.equal(ticks, 0);
assert.equal(Fishing.getState().active.phase, 'ready');
assert.deepEqual(JSON.parse(JSON.stringify(Fishing.getState())), JSON.parse(JSON.stringify(beforeFailedSession)));
assert.equal(JSON.stringify(IE.getState()), beforeFailedCast);

const malformed = Fishing.getState();
malformed.active.progress = -1;
assert.equal(Fishing.validate(malformed), false);
assert.equal(Fishing.setState({ version: 99, serial: 0, active: null }), false);

// Formal save envelope includes the job and restores it only after the referenced rig inventory.
context.GameTime = { getState: () => ({ totalTicks: ticks }), reset: () => {} };
context.GameEngine = { getState: () => ({ mapId: 'fishing_test', x: 1, y: 2 }), setState: () => {} };
context.CharacterAttributes = { getState: () => ({}), setState: () => {}, recalcCharacterStats: () => {} };
context.Survival = { getState: () => ({ stamina }), setState: () => {} };
vm.runInContext(fs.readFileSync(new URL('../js/save-system.js', import.meta.url), 'utf8'), context);
const formalSnapshot = context.SaveSystem.buildSnapshotForDebug();
assert.ok(formalSnapshot && formalSnapshot.fishing);
const formalFishingState = JSON.parse(JSON.stringify(formalSnapshot.fishing));
Fishing.setState(null);
assert.equal(context.SaveSystem.applySnapshotForDebug(formalSnapshot), true);
assert.deepEqual(JSON.parse(JSON.stringify(Fishing.getState())), formalFishingState);
const corruptSnapshot = JSON.parse(JSON.stringify(formalSnapshot));
corruptSnapshot.fishing.active.elapsed_ticks = -1;
assert.equal(context.SaveSystem.applySnapshotForDebug(corruptSnapshot), false);
const legacySnapshot = JSON.parse(JSON.stringify(formalSnapshot));
delete legacySnapshot.fishing;
assert.equal(context.SaveSystem.applySnapshotForDebug(legacySnapshot), true);
assert.equal(Fishing.getState().active, null);

console.log('[fishing-session] PASS', JSON.stringify({
  overload_break: 'leader subtree',
  cut_line_lost_items: 6,
  submerged_bait_discovery: 'on retrieve',
  save_resume: true,
  hidden_contact_leak: false
}));
