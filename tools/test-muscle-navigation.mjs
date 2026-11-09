import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot} from './ui-game-fixture.mjs';

for (const full of [false, true]) test(`muscle HUD ${full ? 'Svelte' : 'classic'}: Anatomy gate, live atlas, saved chains and modal lifecycle`, async () => {
  const h = await boot(full, {beforeScripts(g) { g.CSS = {escape: value => String(value)}; }});
  const {g} = h, d = g.document, M = g.Muscles, SS = g.SaveSystem;
  const button = () => d.getElementById('btn-muscles');
  const tick = () => g.GameTime.getState().totalTicks;
  const click = async selector => { const el = d.querySelector(selector); assert.ok(el, selector); el.click(); await h.drain(); return el; };
  const level = async value => { g.InventoryEquipment.getState().skills.special_meridian_studies = {level:value}; g.SceneHud.refresh('status'); await h.drain(); };
  try {
    assert.equal(button().hidden, true);
    assert.equal(g.MusclePanel.open(), false);
    g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain();
    d.getElementById('creation-name').value = '肌肉入口验收';
    d.getElementById('creation-name').dispatchEvent(new g.Event('input', {bubbles:true}));
    await h.drain(); await click('#btn-confirm-creation'); g.DialogueUI.close();
    await level(0); const unlearned = structuredClone(SS.buildSnapshotForDebug());
    const closedTick = tick(); await click('#btn-muscles');
    assert.equal(g.MusclePanel.isOpen(), false); assert.equal(tick(), closedTick);
    await level(1); assert.equal(button().hidden, false);
    await click('#btn-combat');
    assert.equal(d.querySelector('#modal-combat [data-mode=muscles]'),null,'combat no longer exposes the old muscle entry');
    g.SceneApp.combatApi.combatState.mode='muscles';
    g.CombatPanel.renderCombatModal(); await h.drain();
    assert.equal(g.SceneApp.combatApi.combatState.mode,'skills','stale muscle mode returns to skills');
    assert.equal(d.querySelector('#modal-combat .muscle-body'),null);
    await click('#combat-modal-close');
    const before = structuredClone(M.getState()), openTick = tick();
    button().focus(); await click('#btn-muscles');
    assert.equal(g.MusclePanel.isOpen(), true); assert.equal(tick(), openTick + 1);
    assert.equal(g.SceneAccess.isStoryMovementLocked(), true);
    assert.equal(d.querySelectorAll('#modal-muscles [data-slot]').length, 7);
    assert.equal(d.querySelectorAll('#modal-muscles [data-scenario],#modal-muscles [data-light],#modal-muscles [data-complete],#modal-muscles [data-reset]').length, 0);
    assert.deepEqual(structuredClone(M.getState()), before, 'opening does not seed progression');
    const ms = M.getMusclesByGroup('hand_l'); M.addGrowth(ms[0].id, 0.001); g.SceneHud.refresh('status'); await h.drain();
    assert.match(d.querySelector(`#modal-muscles [data-muscle="${ms[0].id}"]`).getAttribute('aria-label'), /0\.001%/);
    await click('#modal-muscles [data-view=chain]');
    assert.equal(d.querySelector('#modal-muscles [data-passive]').disabled, true);
    for (const group of M.getChainSlot('lhand').groups) for (const m of M.getMusclesByGroup(group)) M.addGrowth(m.id, 100);
    g.SceneHud.refresh('status'); await h.drain();
    const save = SS.saveNow;
    SS.saveNow = () => false;
    await click('#modal-muscles [data-passive=post_no_second_thought]');
    assert.equal(M.getEquippedPassiveForSlot('lhand'), null);
    SS.saveNow = save;
    await click('#modal-muscles [data-passive=post_no_second_thought]');
    assert.equal(M.getEquippedPassiveForSlot('lhand'), 'post_no_second_thought');
    const equipped = structuredClone(SS.buildSnapshotForDebug());
    await click('#modal-muscles [data-chain-search]');
    const search = d.querySelector('#modal-muscles [data-chain-search]'); search.value = '破相'; search.dispatchEvent(new g.Event('input',{bubbles:true}));
    await h.drain(); assert.equal(d.querySelectorAll('#modal-muscles .ma-passive').length,1);
    const closeTick = tick(); g.dispatchEvent(new g.KeyboardEvent('keydown', {key:'Escape', bubbles:true})); await h.drain();
    assert.equal(g.MusclePanel.isOpen(), false); assert.equal(tick(), closeTick + 1);
    assert.equal(d.activeElement, button()); assert.equal(d.querySelector('#modal-muscles .muscle-atlas'),null);
    await click('#btn-muscles'); await click('#modal-muscles [data-view=chain]');
    const stale = d.querySelector('#modal-muscles [data-chain-id=post_no_second_thought]');
    await level(0); assert.equal(button().hidden,true); assert.equal(g.MusclePanel.isOpen(),false);
    stale.click(); await h.drain(); assert.equal(M.getEquippedPassiveForSlot('lhand'),'post_no_second_thought');
    assert.equal(g.MusclePanel.equip('lhand',null).ok,false);
    assert.equal(SS.applySnapshotForDebug(equipped),true); g.SceneHud.refresh('status'); await h.drain();
    assert.equal(button().hidden,false); await click('#btn-muscles');
    assert.equal(M.getEquippedPassiveForSlot('lhand'),'post_no_second_thought');
    assert.equal(SS.applySnapshotForDebug(unlearned),true); g.SceneHud.refresh('status'); await h.drain();
    assert.equal(button().hidden,true); assert.equal(g.MusclePanel.isOpen(),false);
    assert.equal(d.querySelectorAll('#btn-muscles').length,1);
    const previewHost=d.createElement('div'); d.body.append(previewHost);
    const preview=g.MuscleAtlasView.create({host:previewHost,M,texts:{},onClose(){},onEquip(){return {ok:false};},getProgress:()=>12.345});
    assert.match(previewHost.querySelector('[data-muscle]').getAttribute('aria-label'),/12\.345%/, 'isolated preview can read its own training progress without changing formal state');
    assert.equal(M.getProgress(ms[0].id),0); preview.destroy(); previewHost.remove();
    assert.deepEqual(h.errors,[]);
  } finally { g.MusclePanel.close({automatic:true}); await h.close(); }
});

test('both formal entries load the same atlas and initially hide the gated button', () => {
  for(const file of ['index.html','tools/street-thug-boss-room-game.html']){
    const html=fs.readFileSync(file,'utf8');
    assert.match(html, /id="btn-muscles"[^>]*hidden/);
    assert.doesNotMatch(html,/data-mode="muscles"/);
    assert.equal((html.match(/src="js\/muscle-atlas-view.js"/g)||[]).length,1);
    assert.match(html,/href="css\/muscle-atlas.css"/);
    assert.ok(html.indexOf('js/muscle-atlas-view.js')<html.indexOf('js/scene/muscles.js'));
  }
});
