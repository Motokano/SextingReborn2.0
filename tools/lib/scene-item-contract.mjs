import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Exercise complete production modules. Only effects, inventory and clocks are adapters.
export function verifySceneItemContract(itemUse, salveTemplate) {
  let bag = [], template, inCombat = false, ticks = 0, effects = 0, accept = true;
  const g = {
    PlayerActions: {}, CombatEngagement: { isPlayerInCombat: () => inCombat },
    ItemUse: { isFoodTemplate: () => false, itemTemplateIsConsumable: () => true,
      getUseActionRoute: itemUse.getUseActionRoute, getUseTickCost: itemUse.getUseTickCost,
      applyItemUseEffectFromTemplate: () => { if (accept) effects++; return accept; },
      takeLastFoodExpGrantText: () => '' },
    InventoryEquipment: { getPocketArray: () => bag, getItemTemplate: () => template,
      takeItemFromContainer: () => ({ success: true, item: bag.shift() }),
      putItemIntoDefaultContainer: item => { bag.push(item); return { placed: true }; } },
    SceneFeedback: { ui: key => key, showMsg() {} }, SceneHud: { refresh() {} },
    InventoryPanel: { backpackPanelOpen: false }, SceneStatusPanel: { updateStatusPanel() {} },
    WorldTick: { advanceWorldTicks: n => { ticks += n; } }, Survival: { advanceTick: () => { ticks++; } }
  };
  g.window = g; vm.createContext(g);
  for (const file of ['access', 'items']) vm.runInContext(fs.readFileSync(new URL('../../js/scene/' + file + '.js', import.meta.url), 'utf8'), g);
  g.SceneAccess.initialize(); g.ItemUseActions.initialize();
  const use = () => g.ItemUseActions.tryUseItemFromContainer('pocket', 0, { silent: true });
  template = salveTemplate; bag = [{ item_id: 'salve', count: 1 }];
  for (const remaining of [2, 1, 0]) {
    assert.equal(use(), true);
    assert.equal(bag.length, remaining ? 1 : 0);
    if (remaining) assert.equal(bag[0].charges, remaining);
  }
  assert.equal(effects, 3); assert.equal(ticks, 3);
  for (const [route, expected] of [['drink', 1], ['topical', 1], ['inhale', 2], ['inject', 3]]) {
    template = { use_action: route }; bag = [{ item_id: route, count: 1 }];
    const before = ticks; assert.equal(use(), true); assert.equal(ticks - before, expected);
  }
  inCombat = true;
  for (const route of ['topical', 'inject']) {
    template = { use_action: route }; const item = { item_id: route, count: 1 }; bag = [item];
    const before = ticks, oldEffects = effects;
    assert.equal(use(), false); assert.equal(bag[0], item); assert.equal(ticks, before); assert.equal(effects, oldEffects);
  }
  for (const route of ['drink', 'inhale']) assert.equal(g.SceneAccess.checkUseRouteGate({ use_action: route }), null);
  inCombat = false; g.PlayerActions.restIdleTimer = 1;
  assert.equal(g.SceneAccess.checkUseRouteGate({ use_action: 'inject' }).reason, 'must_be_still');
  g.PlayerActions.restIdleTimer = null;
  template = { use_action: 'inject' }; const original = { item_id: 'inject', count: 1 }; bag = [original]; accept = false;
  const before = ticks; assert.equal(use(), false); assert.equal(bag[0], original); assert.equal(ticks, before);
  return true;
}
