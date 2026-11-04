import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

for (const full of [false, true]) {
  test(`Space waits use the same time and survival costs as walking (${full ? 'Svelte' : 'native'})`, async () => {
    const h = await boot(full), g = h.g, d = g.document;
    const press = (target = d.body, repeat = false) => target.dispatchEvent(new g.KeyboardEvent('keydown', { key: ' ', code: 'Space', repeat, bubbles: true, cancelable: true }));
    try {
      g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain();
      const name = d.getElementById('creation-name'); name.value = '原地等待测试';
      name.dispatchEvent(new g.Event('input', { bubbles: true })); await h.drain();
      d.getElementById('btn-confirm-creation').click(); await h.drain(); g.DialogueUI.close();
      g.GameEngine.setState('M0_Base_Inside_lv_1', 13, 14); g.SceneCtx.setFacingDir(6);
      assert.equal(g.GameEngine.isWalkable(12, 14), true);
      g.Survival.setState({ satiety: 80, thirst: 80, stamina: 80, fatigue: 10, tickCount: 1 });
      const snapshot = g.SaveSystem.buildSnapshotForDebug();
      const initialTicks = g.GameTime.getState().totalTicks;
      for (let i = 0; i < 4; i++) press();
      await h.drain();
      const waited = g.Survival.getState(), position = g.GameEngine.getState();
      assert.equal(g.GameTime.getState().totalTicks, initialTicks + 4);
      assert.equal(position.x, 13); assert.equal(position.y, 14);
      assert.equal(waited.satiety, 80, 'Space must not spend satiety');
      assert.equal(waited.thirst, 80, 'Space must not spend water');
      assert.equal(g.SceneCtx.getFacingDir(), 6, 'waiting does not turn the pawn');
      const afterWait = g.GameTime.getState().totalTicks;
      press(d.body, true);
      const input = d.createElement('input'); d.body.append(input); press(input); input.remove();
      assert.equal(g.GameTime.getState().totalTicks, afterWait, 'held keys and typing do not add ticks');
      assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot), true);
      for (let i = 0; i < 4; i++) g.SceneCtx.actions.tryMoveTo(i % 2 ? 13 : 12, 14);
      await h.drain();
      const walked = g.Survival.getState();
      assert.equal(g.GameTime.getState().totalTicks, initialTicks + 4);
      for (const field of ['satiety', 'thirst', 'stamina', 'fatigue', 'nutrition', 'weight_kg', 'dirtyness', 'tickCount'])
        assert.equal(waited[field], walked[field], field + ' matches four real walking steps');
      assert.equal(JSON.stringify(waited.food_metabolism), JSON.stringify(walked.food_metabolism), 'no deferred food bill');
      g.Survival.setState({ stamina: 0 });
      const exhaustedTick = g.GameTime.getState().totalTicks;
      press();
      assert.equal(g.GameTime.getState().totalTicks, exhaustedTick + 1, 'waiting can still advance status timers while exhausted');
      assert.equal(g.Survival.getState().satiety, 80);
      assert.equal(g.Survival.getState().thirst, 80);
      assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  });
}
