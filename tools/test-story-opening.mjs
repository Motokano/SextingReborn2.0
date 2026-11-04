import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot } from './ui-game-fixture.mjs';
const first = JSON.parse(fs.readFileSync('data/npc/npc_supervisor_manager_triggers.json', 'utf8')).entries[0];
function end(g) { let n = 0; while (g.DialogueUI.isDialogueOpen() && n++ < 1000) g.DialogueUI.next(); assert.ok(n < 1000); }
function storage(g) { return Object.fromEntries(Array.from({ length: g.localStorage.length }, (_, i) => { const k = g.localStorage.key(i); return [k, g.localStorage.getItem(k)]; })); }
for (const svelte of [false, true]) {
  test(`automatic opening, completion, unfinished reload and completed save (${svelte ? 'Svelte' : 'native'})`, async () => {
    const h = await boot(svelte), g = h.g; let afterOpening, completed, interrupted;
    try {
      assert.equal(g.DialogueUI.isDialogueOpen(), true, 'new game starts without NPC interaction');
      g.DialogueUI.next(); assert.equal(g.DialogueUI.getView().text, first.dialogue.linesRich[0].text);
      assert.equal(g.NPCSystem.getDemoState().triggered.includes(first.id), false);
      const at = JSON.stringify(g.GameEngine.getState()); g.SceneCtx.actions.tryIntentMove(0, 0, 1, 0, 'test'); assert.equal(JSON.stringify(g.GameEngine.getState()), at);
      await g.NPCSystem.resumeOpening(); assert.equal(g.DialogueUI.getView().text, first.dialogue.linesRich[0].text, 'repeated request does not restart');
      assert.ok(g.SaveSystem.saveNow('manual')); interrupted = storage(g);
      end(g); await h.drain();
      assert.equal(g.NPCSystem.getDemoState().triggered.filter(id => id === first.id).length, 1);
      assert.ok(g.NPCSystem.getFlagValue('supervisor_has_talked'));
      assert.equal(g.CharacterAttributes.isCharacterCreationCompleted(), false);
      assert.ok(!g.document.querySelector('#character-creation-overlay').classList.contains('hidden'));
      afterOpening = storage(g);
      const beforeCreation = g.SaveSystem.buildSnapshotForDebug();
      const saveCreation = g.SaveSystem.saveNow; g.SaveSystem.saveNow = () => false;
      assert.equal(g.SceneApp.creation.confirm({ name: '开场回归', height: 178, gender: 'male', hand: 'right', leg: 'right' }), false);
      await h.drain();
      assert.equal(g.CharacterAttributes.isCharacterCreationCompleted(), false);
      assert.equal(g.document.getElementById('creation-save-error').textContent, '创建角色的进度未能保存，请再次点击完成重试。');
      const inventoryAfterFailure = g.SaveSystem.buildSnapshotForDebug().player.inventoryEquipment;
      for (const key of ['equipment', 'inventory_pocket', 'inventory_backpack', 'inventory_vehicle', 'item_identity', 'potential']) assert.deepEqual(inventoryAfterFailure[key], beforeCreation.player.inventoryEquipment[key]);
      for (const [id, skill] of Object.entries(beforeCreation.player.inventoryEquipment.skills)) assert.equal(inventoryAfterFailure.skills[id].level, skill.level);
      g.SaveSystem.saveNow = saveCreation;
      assert.equal(g.SceneApp.creation.confirm({ name: '开场回归', height: 178, gender: 'male', hand: 'right', leg: 'right' }), true);
      completed = storage(g);
      assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
    for (const [saved, expectedDialogue, expectedCreation] of [[interrupted, true, false], [afterOpening, false, true], [completed, false, false]]) {
      const reload = await boot(svelte, { storage: saved });
      try {
        assert.equal(reload.g.DialogueUI.isDialogueOpen(), expectedDialogue);
        assert.equal(!reload.g.document.querySelector('#character-creation-overlay').classList.contains('hidden'), expectedCreation);
        if (saved === completed) assert.equal(reload.g.CharacterAttributes.getCharacterName(), '开场回归');
        assert.deepEqual(reload.errors, []);
      } finally { await reload.close(); }
    }
  });
  test(`opening save failure freezes for retry without replay (${svelte ? 'Svelte' : 'native'})`, async () => {
    const h = await boot(svelte), g = h.g;
    try {
      const save = g.SaveSystem.saveNow; g.SaveSystem.saveNow = () => false;
      end(g); await h.drain();
      assert.equal(g.DialogueUI.isDialogueOpen(), false); assert.equal(g.NPCSystem.isMenuOpen(), true);
      g.NPCSystem.menu.close(); assert.equal(g.NPCSystem.isMenuOpen(), true, 'Escape/outside close cannot strand the required retry');
      assert.equal(g.NPCSystem.getDemoState().triggered.includes(first.id), false);
      assert.notEqual(g.NPCSystem.getFlagValue('supervisor_has_talked'), true);
      assert.equal(JSON.parse(g.localStorage.getItem('cabi_demo_flags_v1') || '{}').supervisor_has_talked, undefined, 'failed commit leaves no standalone completion flag');
      const at = JSON.stringify(g.GameEngine.getState()); g.SceneCtx.actions.tryIntentMove(0, 0, 1, 0, 'test'); assert.equal(JSON.stringify(g.GameEngine.getState()), at);
      g.SaveSystem.saveNow = save; g.NPCSystem.menu.choose(0); await h.drain();
      assert.equal(g.DialogueUI.isDialogueOpen(), false); assert.equal(g.NPCSystem.isMenuOpen(), false);
      assert.equal(g.NPCSystem.getDemoState().triggered.filter(id => id === first.id).length, 1);
      assert.ok(!g.document.querySelector('#character-creation-overlay').classList.contains('hidden'));
    } finally { await h.close(); }
  });
}
