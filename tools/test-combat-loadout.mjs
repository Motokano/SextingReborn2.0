import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';
const click = async (h, selector) => { const el = h.g.document.querySelector(selector); assert.ok(el, selector); el.click(); await h.drain(); return el; };
const input = async (h, id, value) => { const el = h.g.document.getElementById(id); assert.ok(el, id); el.value = value; el.dispatchEvent(new h.g.Event('input', { bubbles: true })); await h.drain(); };
async function created(h) { const g = h.g; g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain(); await input(h, 'creation-name', '装配测试'); await click(h, '#btn-confirm-creation'); }
const compact = s => s.replace(/\s+/g, '');
const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

for (const full of [false, true]) test(`jab coefficient display follows skill level in ${full ? 'full' : 'default'} UI`, async () => {
    const h = await boot(full), g = h.g, d = g.document, IE = g.InventoryEquipment;
    try {
        await created(h);
        const skillId = 'combat_basic_unarmed';
        IE.getState().skills[skillId].level = 100;
        const combat = IE.getCombatState();
        combat.limbs.rhand.active = skillId;
        combat.limbs.rfoot.active = skillId;
        combat.move_sequences.rhand = ['jab'];
        IE.setCombatState({ limbs: combat.limbs, move_sequences: combat.move_sequences });
        await click(h, '#btn-combat');
        await click(h, '[data-limb=rhand] [data-edit=move]');
        assert.match(d.querySelector('[data-pick=jab]').textContent, /倍率 ×0\.398～0\.598/);
        assert.match(d.querySelector('[data-pick=swing_punch]').textContent, /倍率 ×0\.996～1\.196/);
        await click(h, '[data-pick=jab]');
        await click(h, '[data-limb=rhand] [data-edit=detail]');
        assert.match(d.querySelector('.loadout-detail').textContent, /倍率 ×0\.398～0\.598/);
        await click(h, '#btn-debug-combat-skill-plus50');
        assert.match(d.querySelector('.loadout-detail').textContent, /倍率 ×0\.498～0\.698/);
        await click(h, '#combat-loadout-picker .close');
        await click(h, '[data-limb=rhand] [data-edit=move]');
        assert.match(d.querySelector('[data-pick=jab]').textContent, /倍率 ×0\.498～0\.698/);
        await click(h, '#combat-loadout-picker .close');
        await click(h, '[data-limb=rfoot] [data-edit=move]');
        assert.match(d.querySelector('[data-pick=front_kick]').textContent, /倍率 ×0\.598～0\.798/);
        assert.match(d.querySelector('[data-pick=whip_kick]').textContent, /倍率 ×0\.647～0\.947/);
        await click(h, '#combat-loadout-picker .close');
        await click(h, '#combat-modal-close');
        IE.getState().skills.combat_rogue_sanda={level:100,move_usage:{}};
        const rogue=IE.getCombatState();rogue.limbs.rhand.active='combat_rogue_sanda';rogue.move_sequences.rhand=['slap_combo'];
        IE.setCombatState({limbs:rogue.limbs,move_sequences:rogue.move_sequences});
        await click(h, '#btn-combat');
        await click(h, '[data-limb=rhand] [data-edit=move]');
        assert.match(d.querySelector('[data-pick=poke_eye]').textContent, /倍率 ×0\.418～0\.528/);
        assert.match(d.querySelector('[data-pick=shove]').textContent, /倍率 ×0\.298～0\.598/);
        assert.match(d.querySelector('[data-pick=slap_combo]').textContent, /倍率 ×0\.299～0\.499 · 2 段/);
        assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
});

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
        assert.equal(d.querySelector(`[data-muscle=${muscle.id}] button`),null,'no manual unlock control');
        await click(h, `[data-muscle=${muscle.id}] .muscle-tile`);
        assert.equal(AP.isUnlocked(muscle.id),false,'viewing does not unlock');
        AP.addGrowth(muscle.id,19.75);g.SvelteCombat.refresh();await h.drain();
        assert.match(d.querySelector(`[data-muscle=${muscle.id}]`).textContent,/19\.75%/);
        AP.addGrowth(muscle.id,80.25);g.SvelteCombat.refresh();await h.drain();
        assert.equal(AP.isUnlocked(muscle.id),true);assert.match(d.querySelector(`[data-muscle=${muscle.id}]`).textContent,/100\.00%/);
        const bonus = AP.getStatBonus();
        for (const [key, name] of [['jingu', '后天筋骨'], ['flexibility', '后天柔韧'], ['breath', '后天呼吸'], ['dexterity', '后天身手']]) {
            if (bonus.acquired[key]) assert.ok(compact(d.querySelector('.muscle-bonuses').textContent).includes(name + '+' + bonus.acquired[key]));
        }
        assert.equal(d.querySelector('[data-group-passive=shoulder_l]'), null, 'partial group cannot equip a passive');
        d.activeElement.dispatchEvent(new g.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await h.drain();
        assert.equal(d.querySelector('#combat-loadout-picker'), null);
        assert.equal(g.SceneApp.combatApi.getOpen('combat'), true, 'nested Escape keeps main loadout open');
        assert.equal(ticks, 3, 'reading growth does not advance time');

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
