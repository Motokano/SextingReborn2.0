import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';
const click = async (h, selector) => { const el = h.g.document.querySelector(selector); assert.ok(el, selector); el.click(); await h.drain(); return el; };
const input = async (h, id, value) => { const el = h.g.document.getElementById(id); assert.ok(el, id); el.value = value; el.dispatchEvent(new h.g.Event('input', { bubbles: true })); await h.drain(); };
async function created(h) { const g = h.g; g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain(); await input(h, 'creation-name', '装配测试'); await click(h, '#btn-confirm-creation'); }
const compact = s => s.replace(/\s+/g, '');
const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

test('approved default loadout: ownership, breathing costs, muscle gate/progress, passive uniqueness and save restore', async () => {
    const h = await boot(false), g = h.g, d = g.document, IE = g.InventoryEquipment, AP = g.Muscles;
    try {
        await created(h);
        assert.ok(g.SvelteCombat, 'default HUD mounts the approved loadout');
        assert.equal(g.SveltePanels, undefined, 'other native panels retain ownership');
        assert.equal(d.querySelectorAll('#modal-combat').length, 1);
        const advance = g.Survival.advanceTick;
        let ticks = 0;
        g.Survival.advanceTick = (...args) => { ticks++; return advance(...args); };
        await click(h, '#btn-combat');
        assert.equal(ticks, 1, 'opening still costs exactly one tick');
        assert.equal(d.querySelector('[data-mode=muscles]'), null, 'meridian study remains required');
        await click(h, '[data-hub=breath]');
        const current = IE.getCombatState().hubs.breath;
        await click(h, `[data-pick=${current}]`);
        assert.equal(ticks, 1, 'selecting the same breathing skill is free');
        await click(h, '[data-hub=breath]');
        await click(h, '[data-clear-slot]');
        assert.equal(ticks, 2, 'unequipping breathing costs one tick');
        await click(h, '[data-hub=breath]');
        await click(h, `[data-pick=${current}]`);
        assert.equal(ticks, 3, 'equipping breathing costs one tick');

        IE.getState().skills.special_meridian_studies = { level: 1 };
        g.SvelteCombat.refresh(); await h.drain();
        await click(h, '[data-mode=muscles]');
        await click(h, '[data-group-open=shoulder_l]');
        assert.ok(d.querySelector('#modal-combat .window').inert);
        const muscle = AP.getMusclesByGroup('shoulder_l')[0];
        await click(h, `[data-muscle=${muscle.id}] button`);
        assert.equal(AP.isUnlocked(muscle.id), true);
        assert.ok(d.activeElement.closest(`[data-muscle=${muscle.id}]`), 'unlock keeps focus on the same tile');
        const bonus = AP.getStatBonus();
        for (const [key, name] of [['jingu', '后天筋骨'], ['flexibility', '后天柔韧'], ['breath', '后天呼吸'], ['dexterity', '后天身手']]) {
            if (bonus.acquired[key]) assert.ok(compact(d.querySelector('.muscle-bonuses').textContent).includes(name + '+' + bonus.acquired[key]));
        }
        assert.equal(d.querySelector('[data-group-passive=shoulder_l]'), null, 'partial group cannot equip a passive');
        d.activeElement.dispatchEvent(new g.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await h.drain();
        assert.equal(d.querySelector('#combat-loadout-picker'), null);
        assert.equal(g.SceneApp.combatApi.getOpen('combat'), true, 'nested Escape keeps main loadout open');
        assert.equal(ticks, 3, 'nested navigation and unlock do not advance time');

        for (const group of ['shoulder_l', 'shoulder_r']) for (const entry of AP.getMusclesByGroup(group)) AP.unlock(entry.id);
        g.SvelteCombat.refresh(); await h.drain();
        await click(h, '[data-group-passive=shoulder_l]');
        const equip = d.querySelector('[data-passive]:not(:disabled)'), passiveId = equip.dataset.passive;
        equip.click(); await h.drain();
        assert.equal(AP.getEquippedPassiveForGroup('shoulder_l'), passiveId);
        await click(h, '[data-region=rhand]');
        await click(h, '[data-group-passive=shoulder_r]');
        assert.equal(d.querySelector(`[data-passive=${passiveId}]`).disabled, true, 'equipped passive remains globally unique');
        await click(h, '#combat-loadout-picker .close');
        await click(h, '[data-region=headneck]');
        await click(h, '[data-group-open=head]');
        const firstPage = [...d.querySelectorAll('[data-muscle]')].map(el => el.dataset.muscle);
        assert.equal(firstPage.length, 8);
        await click(h, '[aria-label="下一页肌肉"]');
        assert.ok([...d.querySelectorAll('[data-muscle]')].every(el => !firstPage.includes(el.dataset.muscle)));
        await click(h, '[aria-label="上一页肌肉"]');
        eq([...d.querySelectorAll('[data-muscle]')].map(el => el.dataset.muscle), firstPage);
        await click(h, '#combat-loadout-picker .close');

        const savedMuscles = JSON.parse(JSON.stringify(AP.getState())), savedCombat = IE.getCombatState(), snapshot = g.SaveSystem.buildSnapshotForDebug();
        AP.setState({ unlocked: {}, equipped: {} });
        IE.setCombatState({ hubs: { breath: null } });
        assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot), true);
        eq(AP.getState(), savedMuscles); eq(IE.getCombatState(), savedCombat);
        g.SceneApp.openCombatPanel(); await h.drain();
        await click(h, '[data-mode=muscles]');
        await click(h, '[data-region=lhand]');
        await click(h, '[data-group-open=shoulder_l]');
        IE.getState().skills.special_meridian_studies.level = 0;
        g.SvelteCombat.refresh(); await h.drain();
        assert.equal(d.querySelector('#combat-loadout-picker'), null, 'losing the gate dismisses old muscle UI');
        assert.equal(d.querySelector('[data-mode=muscles]'), null);
        await click(h, '#combat-modal-close');
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

test('loadout moves, variants and strike order use real equipment transactions and reject stale picks', async () => {
    const h = await boot(false), g = h.g, d = g.document, IE = g.InventoryEquipment;
    try {
        await created(h);
        await click(h, '#btn-combat');
        await click(h, '[data-limb=rhand] [data-edit=detail]');
        const skill = IE.getCombatState().limbs.rhand.active;
        const beforeLevel = IE.getSkillLevel(skill);
        await click(h, '#btn-debug-combat-skill-plus50');
        assert.equal(IE.getSkillLevel(skill), beforeLevel + 50);
        await click(h, '#combat-loadout-picker .close');
        await click(h, '[data-limb=rhand] [data-edit=move]');
        const move = d.querySelector('[data-pick]');
        const moveId = move.dataset.pick;
        move.click(); await h.drain();
        assert.equal(IE.getCombatState().move_sequences.rhand[0], moveId);

        g.CombatVariants.setTable({ variants: { loadout_test: { id: 'loadout_test', variant_id: 'loadout_test', assist_scope: 'active_moves', source_skill_id: skill, min_source_level: 1 } } });
        await click(h, '[data-limb=rhand] [data-variant="1"]');
        await click(h, '[data-pick="variant:loadout_test"]');
        assert.equal(IE.getCombatState().move_sequences.rhand[1], 'variant:loadout_test');
        await click(h, '[data-limb=rhand] [data-variant="1"]');
        assert.equal(d.querySelector('[data-pick="variant:loadout_test"]').disabled, true);
        await click(h, '[data-clear-slot]');
        assert.equal(IE.getCombatState().move_sequences.rhand[1], '');
        const order = IE.getLimbStrikeOrderSlice().slice();
        await click(h, '.order-toggle'); await click(h, '.swap');
        eq(IE.getLimbStrikeOrderSlice(), [order[1], order[0], ...order.slice(2)]);

        await click(h, '[data-limb=rhand] [data-edit=move]');
        const stale = d.querySelector('[data-pick]');
        const state = IE.getCombatState(); state.limbs.rhand.active = null;
        IE.setCombatState({ limbs: state.limbs });
        stale.click(); await h.drain();
        assert.equal(d.querySelector('#combat-loadout-picker'), null);
        assert.equal(IE.getCombatState().limbs.rhand.active, null);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});
