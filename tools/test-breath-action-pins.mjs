import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

const breath = 'combat_basic_breath';
const meditation = `hub|${breath}|tiao_xi_once`;
const retired = ['xue_qi_hua_jing', 'tu_qi_na_jing'];
async function setup(h) {
  const g = h.g;
  g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain();
  const input = g.document.getElementById('creation-name'); input.value = '调息验收';
  input.dispatchEvent(new g.Event('input', { bubbles: true })); await h.drain();
  g.document.getElementById('btn-confirm-creation').click(); await h.drain(); g.DialogueUI.close();
  const IE = g.InventoryEquipment, state = IE.getState();
  IE.setState({ ...state, skills: { ...state.skills, [breath]: { level: 100 } } });
  IE.setCombatState({ hubs: { ...IE.getCombatState().hubs, breath } });
  g.Survival.setState({ thirst: 80, satiety: 80, stamina: 80, diqi_current: 0, diqi_max: 100, isDead: false, isComa: false });
}

for (const svelte of [false, true]) {
  const mode = svelte ? 'Svelte' : 'native';
  test(`${mode}: menu-pinned meditation displays its name, survives load and toggles the same real action`, async () => {
    const h = await boot(svelte), g = h.g, d = g.document;
    try {
      await setup(h);
      g.SceneCtx.setActionBarSlots(['action|drink_flask', null, 'action|rest_toggle', null]);
      g.SceneApp.actionMenu.open(); await h.drain();
      const row = [...d.querySelectorAll('.player-action-item-row')].find(r => r.querySelector('.player-action-item')?.textContent === '调息');
      assert.ok(row); assert.equal(row.querySelector('.player-action-pin').disabled, false);
      const before = g.GameTime.getState().totalTicks;
      row.querySelector('.player-action-pin').click(); await h.drain();
      g.SceneApp.actionMenu.close(); await h.drain();
      const pin = () => d.getElementById('action-bar-pin-1');
      assert.equal(g.SceneCtx.getActionBarSlots()[1], meditation);
      assert.equal(pin().textContent, '调息'); assert.match(pin().title, /调息/);
      assert.equal(g.GameTime.getState().totalTicks, before, 'pinning is free');
      const snapshot = g.SaveSystem.buildSnapshotForDebug();
      g.SceneCtx.setActionBarSlots([]); assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot), true);
      g.SceneRenderer.render(); await h.drain(); assert.equal(pin().textContent, '调息');
      // Hold only the automatic tick timer so the real first meditation tick is deterministic.
      const interval = g.setInterval; g.setInterval = () => 0x7fffffff;
      try { pin().click(); await h.drain(); } finally { g.setInterval = interval; }
      assert.equal(g.SceneCtx.isTiaoXiIdling(), true);
      assert.equal(g.GameTime.getState().totalTicks, before + 1);
      assert.ok(g.Survival.getState().diqi_current > 0, 'the actual meditation effect runs');
      pin().click(); await h.drain();
      assert.equal(g.SceneCtx.isTiaoXiIdling(), false);
      assert.equal(g.GameTime.getState().totalTicks, before + 1, 'stopping costs no additional tick');
      assert.deepEqual(h.errors, []);
    } finally { if (g.SceneCtx.isTiaoXiIdling()) g.SceneApp.executeQuickBarPinnedSlot(1); await h.close(); }
  });

  test(`${mode}: retired actions disappear and old saved pins clear without shifting other slots`, async () => {
    const h = await boot(svelte), g = h.g, d = g.document;
    try {
      await setup(h);
      g.SceneApp.actionMenu.open(); await h.drain();
      const menu = d.getElementById('player-actions-submenu').textContent;
      assert.doesNotMatch(menu, /血气化劲|吐气纳精/);
      assert.match(menu, /调息/); assert.match(menu, /催气/);
      g.SceneApp.actionMenu.close();
      const snapshot = g.SaveSystem.buildSnapshotForDebug();
      snapshot.player.sceneUi.action_bar_slots = [`hub|${breath}|${retired[0]}`, meditation, `hub|${breath}|${retired[1]}`, 'action|drink_flask'];
      assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot), true);
      g.SceneRenderer.render(); await h.drain();
      assert.deepEqual(Array.from(g.SceneCtx.getActionBarSlots()), [null, meditation, null, 'action|drink_flask']);
      assert.equal(d.getElementById('action-bar-pin-0').textContent, '·');
      assert.equal(d.getElementById('action-bar-pin-1').textContent, '调息');
      assert.equal(d.getElementById('action-bar-pin-2').textContent, '·');
      assert.equal(d.getElementById('action-bar-pin-3').textContent, '从壶饮用');
      const before = JSON.stringify(g.SaveSystem.buildSnapshotForDebug().player), time = g.GameTime.getState().totalTicks;
      for (const id of retired) {
        assert.equal(g.CombatHubActions.findHubActionTemplate(breath, id), null);
        assert.equal(g.CombatHubActions.tryExecuteHubAction(breath, id).ok, false);
      }
      assert.equal(JSON.stringify(g.SaveSystem.buildSnapshotForDebug().player), before);
      assert.equal(g.GameTime.getState().totalTicks, time);
      assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  });
}
