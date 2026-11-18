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
        assert.equal(ticks, 0, 'opening the combat panel is free');
        assert.equal(d.querySelector('[data-mode=muscles]'), null, 'meridian study remains required');
        await click(h, '[data-hub=breath]');
        const current = IE.getCombatState().hubs.breath;
        await click(h, `[data-pick=${current}]`);
        assert.equal(ticks, 0, 'selecting the same breathing skill is free');
        await click(h, '[data-hub=breath]');
        await click(h, '[data-clear-slot]');
        assert.equal(ticks, 1, 'unequipping breathing costs one tick');
        await click(h, '[data-hub=breath]');
        await click(h, `[data-pick=${current}]`);
        assert.equal(ticks, 2, 'equipping breathing costs one tick');

        IE.getState().skills.special_meridian_studies = { level: 1 };
        g.SceneHud.refresh('status'); await h.drain();
        assert.equal(d.querySelector('#modal-combat [data-mode=muscles]'),null,'muscle entry is exclusively in the HUD');
        await click(h, '#combat-modal-close');
        await click(h, '#btn-muscles');
        assert.equal(ticks,2,'switching panels is free');
        await click(h, '#modal-muscles [data-group=shoulder_l]');
        const muscle=AP.getMusclesByGroup('shoulder_l')[0];
        await click(h, '#modal-muscles [data-muscle="'+muscle.id+'"]');
        assert.equal(AP.isUnlocked(muscle.id),false,'viewing does not unlock');
        AP.addGrowth(muscle.id,19.75);g.SceneHud.refresh('status');await h.drain();
        assert.match(d.querySelector('.ma-muscle-progress').textContent,/19\.750%/);
        AP.addGrowth(muscle.id,80.25);g.SceneHud.refresh('status');await h.drain();
        assert.equal(AP.isUnlocked(muscle.id),true);assert.match(d.querySelector('.ma-muscle-progress').textContent,/100\.000%/);
        await click(h, '#modal-muscles [data-view=rewards]');
        const bonus=AP.getStatBonus();
        for(const [key,name] of [['jingu','后天筋骨'],['flexibility','后天柔韧'],['breath','后天呼吸'],['dexterity','后天身手']]){
            if(bonus.acquired[key])assert.ok(compact(d.querySelector('.ma-rewards-overview').textContent).includes(name+'+'+bonus.acquired[key]));
        }
        await click(h, '#modal-muscles [data-view=chain]');
        assert.equal(d.querySelector('#modal-muscles [data-passive]').disabled,true,'partial body cannot equip');
        assert.equal(ticks,2,'reading growth is free');
        d.activeElement.dispatchEvent(new g.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await h.drain();
        assert.equal(g.MusclePanel.isOpen(),false);assert.equal(g.SceneApp.combatApi.getOpen('combat'),false);
        assert.equal(ticks,2);
        for(const group of ['shoulder_l','upperarm_l','forearm_l','hand_l','shoulder_r','upperarm_r','forearm_r','hand_r'])for(const entry of AP.getMusclesByGroup(group))AP.unlock(entry.id);
        await click(h,'#btn-muscles');await click(h,'#modal-muscles [data-view=chain]');
        const equip=d.querySelector('#modal-muscles [data-passive]:not(:disabled)'),passiveId=equip.dataset.passive;
        equip.click();await h.drain();assert.equal(AP.getEquippedPassiveForGroup('shoulder_l'),passiveId);
        await click(h,'#modal-muscles [data-slot=rhand]');
        assert.equal(d.querySelector('#modal-muscles [data-chain-id="'+passiveId+'"]').disabled,true,'passives stay globally unique');
        await click(h,'#modal-muscles [data-slot=head]');await click(h,'#modal-muscles [data-view=muscles]');
        const head=AP.getMusclesByGroup('head');
        assert.equal(d.querySelectorAll('#modal-muscles [data-muscle]').length,97);
        const search=d.querySelector('#modal-muscles [data-search]');search.value=head[0].name;search.dispatchEvent(new g.Event('input',{bubbles:true}));await h.drain();
        assert.equal(d.querySelectorAll('#modal-muscles [data-muscle]').length,1);
        assert.equal(d.querySelector('#modal-muscles [data-muscle]').dataset.muscle,head[0].id);
        const savedMuscles=JSON.parse(JSON.stringify(AP.getState())),savedCombat=IE.getCombatState(),snapshot=g.SaveSystem.buildSnapshotForDebug();
        AP.setState({unlocked:{},equipped:{}});IE.setCombatState({hubs:{breath:null}});
        assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot),true);
        eq(AP.getState(),savedMuscles);eq(IE.getCombatState(),savedCombat);
        IE.getState().skills.special_meridian_studies.level=0;g.SceneHud.refresh('status');await h.drain();
        assert.equal(g.MusclePanel.isOpen(),false,'lost gate dismisses the atlas');
        assert.equal(d.getElementById('btn-muscles').hidden,true);
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
