import test from 'node:test';
import fs from 'node:fs';
const equipmentIds = Object.keys(JSON.parse(fs.readFileSync('data/equipment-catalog-v2.json', 'utf8')).items || {});
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { boot } from './ui-game-fixture.mjs';
import { inventoryPanel } from '../ui/src/runtime/inventory-panels.js';
const click = async (h, selector) => { const el = h.g.document.querySelector(selector); assert.ok(el, selector); el.click(); await h.drain(); return el; };
const input = async (h, id, value) => { const el = h.g.document.getElementById(id); assert.ok(el, id); el.value = value; el.dispatchEvent(new h.g.Event('input', { bubbles: true })); await h.drain(); };
async function created(h) { const g = h.g; g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain(); await input(h, 'creation-name', '面板测试'); await click(h, '#btn-confirm-creation'); }
const compact = s => s.replace(/\s+/g, '');
const leaf = (g, selector) => [...g.document.querySelectorAll(selector)].map(el => [el.className, compact(el.textContent)]);
const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
function stateItems(g, items, equipment) { const IE = g.InventoryEquipment, st = JSON.parse(JSON.stringify(IE.getState())); st.inventory_pocket = []; st.inventory_vest = []; st.inventory_backpack = items; const equipmentTable = Object.fromEntries(equipmentIds.map(id => [id, IE.getItemTemplate(id)])); equipmentTable.test_ui_bag = { item_id: 'test_ui_bag', name: '测试背包', equip_slot: 'backpack', backpack_slots: 12, weight_kg: 1 }; IE.setConfig({ equipment: equipmentTable }); st.equipment.backpack = { item_id: 'test_ui_bag' }; st.inventory_vehicle = []; if (equipment)
    Object.assign(st.equipment, equipment); IE.setState(st); }

async function learnAnatomyFromBook(h) {
    const g = h.g, d = g.document, IE = g.InventoryEquipment;
    const skillId = IE.SPECIAL_MERIDIAN_STUDIES_SKILL_ID || 'special_meridian_studies';
    const anatomyRow = () => [...d.querySelectorAll('#survival-skill-table .survival-row')]
        .find(row => row.querySelector('.survival-name')?.textContent === g.SceneFeedback.ui('special.skill.meridian_studies.name'));
    assert.equal(IE.getSkillLevel(skillId), 0);
    assert.ok(anatomyRow(), 'special skills show anatomy before learning');
    assert.equal(anatomyRow().querySelector('.survival-plus-btn'), null, 'book skills have no free upgrade or self-study button');
    assert.equal(g.MusclePanel.isAvailable(), false);
    await click(h, '#survival-modal-close');
    stateItems(g, [{ item_id: 'book_anatomy_textbook', count: 1, attribute_state: { knowledge: { book: { version: 1, fragments: 100 } } } }]);
    const bookId = IE.getBackpackArray()[0].instance_id;
    await click(h, '#btn-backpack');
    await click(h, `[data-bp-id="${bookId}"]`);
    assert.equal(d.querySelector('#book-reading-panel [data-book-consume]')?.disabled, false);
    await click(h, '#book-reading-panel [data-book-consume]');
    assert.equal(IE.getSkillLevel(skillId), 1, 'consuming the selected full textbook grants exactly one level');
    assert.ok(!IE.findItemInstanceRecord(bookId), 'learning consumes the selected book');
    await click(h, '#backpack-panel-close');
    g.SceneApp.openSurvivalPanel('special');
    await h.drain();
    assert.ok(anatomyRow().querySelector('.survival-level').textContent.startsWith('1' + g.SceneFeedback.ui('combat.level.suffix')));
    assert.equal(anatomyRow().querySelector('.survival-plus-btn'), null, 'learning does not restore the removed shortcuts');
    assert.equal(g.MusclePanel.isAvailable(), true);
}
test('P3 native/Svelte same save: backpack details/equipment, skill tabs, shared loadout and muscles retain text/classes', async () => {
    const old = await boot(false), h = await boot(true), g = h.g, n = old.g;
    try {
        await created(old);
        await created(h);
        stateItems(n, [{ item_id: 'fishing_rod_hand_basic' }, { item_id: 'fishing_line_main_nylon_thin' }]);
        stateItems(g, []);
        const snapshot = n.SaveSystem.buildSnapshotForDebug();
        assert.equal(g.SaveSystem.applySnapshotForDebug(snapshot), true);
        for (const f of [old, h]) {
            f.g.SceneApp.openBackpackPanel();
            await f.drain();
        }
        for (const selector of ['#backpack-item-list .bp-item-name', '#backpack-item-list .bp-item-sub', '#backpack-detail', '#equip-list .equip-row', '#equip-list .equip-group-title'])
            eq(leaf(g, selector), leaf(n, selector));
        for (const f of [old, h]) {
            f.g.SceneApp.closePublicModal('modal-backpack');
            f.g.SceneApp.openSurvivalPanel();
            await f.drain();
        }
        for (const tab of ['survival', 'life', 'special']) {
            for (const f of [old, h])
                await click(f, `[data-skill-tab="${tab}"]`);
            eq(leaf(g, '#survival-skill-table .survival-row'), leaf(n, '#survival-skill-table .survival-row'));
        }
        for (const f of [old, h]) {
            f.g.SceneApp.closePublicModal('modal-survival');
            f.g.SceneApp.openCombatPanel();
            await f.drain();
        }
        assert.equal(n.document.querySelectorAll('.ledger tbody tr').length, 4);
        for (const selector of ['.ledger tbody tr', '.global-strip .hub', '.order-chip'])
            eq(leaf(g, selector), leaf(n, selector));
        for (const f of [old, h]) await click(f, '[data-limb=rhand] [data-edit=skill]');
        eq(leaf(g, '.loadout-choice'), leaf(n, '.loadout-choice'));
        for (const f of [old, h]) await click(f, '#combat-loadout-picker .close');
        for (const f of [old, h]) {
            const IE = f.g.InventoryEquipment;
            IE.getState().skills[(IE.SPECIAL_MERIDIAN_STUDIES_SKILL_ID || 'special_meridian_studies')] = { level: 1 };
            f.g.SceneApp.closePublicModal('modal-combat');
            await f.drain();
            f.g.SceneHud.refresh('status');
            await click(f, '#btn-muscles');
        }
        assert.equal(n.document.querySelectorAll('#modal-muscles [data-slot]').length, 7);
        eq(leaf(g, '#modal-muscles [data-slot]'), leaf(n, '#modal-muscles [data-slot]'));
        for (const f of [old, h]) await click(f, '#modal-muscles [data-group=shoulder_l]');
        eq(leaf(g, '.ma-muscle-info'), leaf(n, '.ma-muscle-info'));
        assert.deepEqual(h.errors, []);
        assert.deepEqual(old.errors, []);
    }
    finally {
        await h.close();
        await old.close();
    }
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
        g.SceneHud.refresh('status'); await h.drain();
        assert.equal(d.querySelector('#modal-combat [data-mode=muscles]'),null,'muscle entry is exclusively in the HUD');
        await click(h, '#combat-modal-close');
        await click(h, '#btn-muscles');
        assert.equal(ticks,5,'each panel keeps its original opening/closing cost');
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
        assert.equal(ticks,5,'reading growth is free');
        d.activeElement.dispatchEvent(new g.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await h.drain();
        assert.equal(g.MusclePanel.isOpen(),false);assert.equal(g.SceneApp.combatApi.getOpen('combat'),false);
        assert.equal(ticks,6);
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

test('P3 inventory single consumption, identity on drop/pick/equip, stale click rejected, all seven medication targets', async () => {
    const h = await boot(true), g = h.g, IE = g.InventoryEquipment, d = g.document;
    try {
        await created(h);
        const ids = IE.getAllItemIds(), food = ids.find(id => { const tpl = IE.getItemTemplate(id); return tpl.edible === true && tpl.edible_buff_id && tpl.stack_limit >= 3; }), topical = ids.find(id => g.ItemUse.getUseActionRoute(IE.getItemTemplate(id)) === 'topical'), equipment = equipmentIds.find(id => IE.getItemTemplate(id)?.equip_slot === 'head');
        assert.ok(food && topical && equipment);
        stateItems(g, [{ item_id: food, count: 3 }, { item_id: topical, count: 2 }, { item_id: equipment }]);
        g.Survival.setState({ satiety: 0 });
        g.SceneApp.openBackpackPanel();
        await h.drain();
        const hovered = d.querySelector('#backpack-item-list .bp-item-row');
        hovered.dispatchEvent(new g.Event('mouseenter')); await h.drain();
        assert.ok(d.querySelector('#svelte-item-tooltip.show'));
        hovered.dispatchEvent(new g.Event('mouseleave')); g.SveltePanels.refresh('backpack'); await h.drain();
        assert.equal(d.querySelector('#svelte-item-tooltip.show'), null, 'refresh does not reopen a departed tooltip');
        let model; inventoryPanel(g, (_key, value) => { model = value; }, (key, vars) => g.UIText.t(key, vars)).refresh();
        function checkView(value) { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { assert.ok(!['tpl','item','hostItem','attribute_modules'].includes(key), 'view contains no raw template or writable item'); checkView(child); } }
        checkView(model);
        const initial = IE.getBackpackArray()[0].count, oldId = IE.getBackpackArray()[0].instance_id;
        const use = [...d.querySelectorAll('.bp-action-btn')].find(el => el.textContent === g.UIText.t('inv.use'));
        assert.ok(use);
        use.click();
        await h.drain();
        assert.equal(IE.getBackpackArray()[0].count, initial - 1);
        assert.equal(IE.getBackpackArray()[0].instance_id, oldId);
        await click(h, '#backpack-item-list .bp-item-row:nth-child(2)');
        assert.equal(d.querySelectorAll('.bp-action-btn').length, 8);
        await click(h, '#backpack-item-list .bp-item-row:nth-child(3)');
        const id = IE.getBackpackArray()[2].instance_id;
        const stale = [...d.querySelectorAll('.bp-action-btn')].find(el => el.textContent === g.UIText.t('inv.drop'));
        assert.ok(stale);
        const original = IE.dropItemToGround;
        let drops = 0;
        IE.dropItemToGround = (...args) => { drops++; return original(...args); };
        const saved = JSON.parse(JSON.stringify(IE.getState())), replacement = JSON.parse(JSON.stringify(saved));
        delete replacement.inventory_backpack[2].instance_id;
        IE.setState(replacement);
        stale.click();
        await h.drain();
        assert.equal(drops, 0, 'stale selection cannot drop replacement');
        IE.setState(saved);
        g.SveltePanels.refresh('backpack');
        await h.drain();
        await click(h, '#backpack-item-list .bp-item-row:nth-child(3)');
        [...d.querySelectorAll('.bp-action-btn')].find(el => el.textContent === g.UIText.t('inv.drop')).click();
        await h.drain();
        assert.equal(drops, 1);
        const pos = g.SceneApp.panelApi.position();
        assert.ok(IE.getGroundItemsAt(pos.mapId, pos.x, pos.y).some(it => it.instance_id === id));
        await click(h, '[data-container=ground]');
        await input(h, 'backpack-search', equipment);
        const equip = [...d.querySelectorAll('.bp-action-btn')].find(el => el.textContent === g.UIText.t('inv.equip'));
        assert.ok(equip);
        equip.click();
        await h.drain();
        assert.equal(IE.getState().equipment.head.instance_id, id);
        assert.equal(IE.auditItemOwnership().ok, true);
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('P3 real assembly attach/detach keeps identity and nested children; failure does not consume a stale candidate', async () => {
    const h = await boot(true), g = h.g, IE = g.InventoryEquipment, d = g.document;
    try {
        await created(h);
        stateItems(g, [{ item_id: 'fishing_rod_hand_basic' }, { item_id: 'fishing_line_main_nylon_thin' }, { item_id: 'fishing_float_small' }]);
        const rod = IE.getBackpackArray()[0].instance_id, line = IE.getBackpackArray()[1].instance_id;
        g.SceneApp.openBackpackPanel();
        await h.drain();
        await click(h, '[data-assembly-attach][data-slot-id=main_line]');
        assert.equal(g.ItemAssembly.getConnectionPart(IE.findItemInstanceRecord(rod).instance, 'main_line').instance_id, line);
        assert.ok(d.querySelector('[data-slot-id=float]'));
        await click(h, '[data-assembly-attach][data-slot-id=float]');
        const mass = IE.getCurrentCarryWeight();
        await click(h, '[data-assembly-detach][data-slot-id=main_line]');
        assert.equal(g.ItemAssembly.getConnectionPart(IE.findItemInstanceRecord(rod).instance, 'main_line'), null);
        assert.equal(g.ItemAssembly.getConnectionPart(IE.findItemInstanceRecord(line).instance, 'float').item_id, 'fishing_float_small');
        assert.ok(Math.abs(IE.getCurrentCarryWeight() - mass) < 1e-9);
        assert.equal(IE.auditItemOwnership().ok, true);
        const candidateButton = d.querySelector('[data-assembly-attach][data-slot-id=main_line]'), before = JSON.stringify(IE.getState());
        const location = IE.findItemInstanceLocation(line);
        assert.ok(location);
        const taken = IE.takeItemFromContainer('backpack', IE.getBackpackArray().findIndex(it => it?.instance_id === line));
        assert.ok(taken.success);
        const afterTake = JSON.stringify(IE.getState());
        candidateButton.click();
        await h.drain();
        assert.equal(JSON.stringify(IE.getState()), afterTake, 'stale assembly candidate causes no additional mutation');
        assert.notEqual(before, afterTake);
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('P3 combat deploy, sequence picker, variants, hubs, strike order, skills and repeated modal ownership', async () => {
    const h = await boot(true), g = h.g, IE = g.InventoryEquipment, d = g.document;
    try {
        await created(h);
        g.SceneApp.openCombatPanel();
        await h.drain();
        const skill = 'combat_basic_unarmed';
        await click(h, '[data-limb=rhand] [data-edit=skill]');
        await click(h, `[data-pick=${skill}]`);
        if (d.querySelector('#combat-loadout-picker')) await click(h, '#combat-loadout-picker .close');
        await click(h, '[data-limb=rhand] [data-edit=detail]');
        await click(h, '#btn-debug-combat-skill-plus50');
        await click(h, '#combat-loadout-picker .close');
        assert.equal(IE.getCombatState().limbs.rhand.active, skill);
        await click(h, '[data-limb=rhand] [data-edit=move]');
        assert.ok(d.querySelector('#combat-loadout-picker'));
        if (d.querySelector('[data-pick]')) {
            await click(h, '[data-pick]');
            assert.ok(IE.getCombatState().move_sequences.rhand[0]);
        }
        const before = IE.getLimbStrikeOrderSlice().slice();
        await click(h, '.order-toggle');
        await click(h, '.swap');
        eq(IE.getLimbStrikeOrderSlice(), [before[1], before[0], ...before.slice(2)]);
        for (const cat of ['breath', 'footwork']) {
            await click(h, `[data-hub=${cat}]`);
            const id = g.CombatSkills.getSkillsByCategory(cat)[0].id;
            await click(h, `[data-pick=${id}]`);
            assert.equal(IE.getCombatState().hubs[cat], id);
        }
        g.SceneApp.closePublicModal('modal-combat');
        g.SceneApp.openSurvivalPanel('special');
        await h.drain();
        await learnAnatomyFromBook(h);
        assert.equal(IE.getSkillLevel((IE.SPECIAL_MERIDIAN_STUDIES_SKILL_ID || 'special_meridian_studies')), 1);
        g.SceneApp.closePublicModal('modal-survival');
        await h.drain();
        for (let i = 0; i < 20; i++) {
            await click(h, '#btn-backpack');
            await click(h, '#backpack-panel-close');
        }
        assert.equal(d.querySelectorAll('#modal-backpack').length, 1);
        assert.equal(g.SvelteInteractions.overlays.active(), false);
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('P3 save async duplicate suppression, errors, stale export, real encrypted roundtrip and older/corrupt rejection', async () => {
    const h = await boot(true), g = h.g, d = g.document;
    try {
        await created(h);
        Object.defineProperty(g, 'crypto', { value: webcrypto });
        g.TextEncoder = TextEncoder;
        g.TextDecoder = TextDecoder;
        g.SceneApp.openSavePanel();
        await h.drain();
        await input(h, 'save-input-account', 'test-account');
        await input(h, 'save-input-password', 'test-password');
        const original = g.SaveSystem.exportSaveCode;
        let resolve, calls = 0;
        g.SaveSystem.exportSaveCode = () => { calls++; return new Promise(r => { resolve = r; }); };
        const btn = d.querySelector('#btn-save-export');
        btn.click();
        btn.click();
        await h.drain();
        assert.equal(calls, 1);
        assert.equal(btn.disabled, true);
        await click(h, '#save-modal-close');
        await click(h, '#btn-save');
        resolve('stale');
        await h.drain();
        assert.equal(d.querySelector('#save-textarea-export').value, '');
        g.SaveSystem.exportSaveCode = () => Promise.reject(Error('busy'));
        await click(h, '#btn-save-export');
        assert.equal(d.querySelector('#btn-save-export').disabled, false);
        g.SaveSystem.exportSaveCode = original;
        await click(h, '#btn-save-export');
        for (let i = 0; i < 100 && d.querySelector('#btn-save-export')?.disabled; i++)
            await h.drain();
        const code = d.querySelector('#save-textarea-export').value;
        assert.ok(code.length > 100);
        const before = g.SaveSystem.buildSnapshotForDebug();
        let copied = '';
        Object.defineProperty(g.navigator, 'clipboard', { value: { writeText: async (value) => { copied = value; } } });
        await click(h, '#btn-save-copy-code');
        assert.equal(copied, code);
        let saves = 0;
        const local = g.SaveSystem.saveNow;
        g.SaveSystem.saveNow = () => { saves++; return false; };
        await click(h, '#btn-save-local-now');
        assert.equal(saves, 1);
        g.SaveSystem.saveNow = local;
        await input(h, 'save-textarea-import', 'corrupt');
        await click(h, '#btn-save-import');
        for (let i = 0; i < 100 && d.querySelector('#btn-save-import')?.disabled; i++)
            await h.drain();
        assert.equal(g.SceneApp.panelApi.getOpen('save'), true);
        await input(h, 'save-input-password', 'wrong');
        await input(h, 'save-textarea-import', code);
        await click(h, '#btn-save-import');
        for (let i = 0; i < 100 && d.querySelector('#btn-save-import')?.disabled; i++)
            await h.drain();
        assert.equal(g.SceneApp.panelApi.getOpen('save'), true);
        await input(h, 'save-input-password', 'test-password');
        await click(h, '#btn-save-export');
        for (let i = 0; i < 100 && d.querySelector('#btn-save-export')?.disabled; i++)
            await h.drain();
        const newer = d.querySelector('#save-textarea-export').value;
        assert.notEqual(newer, code);
        await click(h, '#btn-save-import');
        for (let i = 0; i < 100 && d.querySelector('#btn-save-import')?.disabled; i++)
            await h.drain();
        assert.equal(g.SceneApp.panelApi.getOpen('save'), true, 'older generation rejected');
        await input(h, 'save-textarea-import', newer);
        await click(h, '#btn-save-import');
        for (let i = 0; i < 100 && g.SceneApp.panelApi.getOpen('save'); i++)
            await h.drain();
        assert.equal(g.SceneApp.panelApi.getOpen('save'), false);
        Object.values(before.player.inventoryEquipment.skills).forEach(s => s.study_exp ??= 0);
        eq(g.SaveSystem.buildSnapshotForDebug().player.inventoryEquipment, before.player.inventoryEquipment);
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('P3 armor modules install/uninstall and failure return preserve instances; nested Escape and warehouse search/take', async () => {
    const h = await boot(true), g = h.g, IE = g.InventoryEquipment, d = g.document;
    try {
        await created(h);
        const moduleIds = Object.keys(JSON.parse(fs.readFileSync('data/attachment-catalog-v2.json', 'utf8')).items);
        const moduleId = moduleIds.find(id => IE.getModuleTemplate(id)?.install_slots?.includes('clothing.arm_l'));
        assert.ok(moduleId);
        stateItems(g, [{ item_id: moduleId }], { clothing: { item_id: 'eq_clothing_combat_suit' } });
        const instanceId = IE.getBackpackArray()[0].instance_id;
        g.SceneApp.openBackpackPanel();
        await h.drain();
        const add = () => [...d.querySelectorAll('.equip-module-slot')].find(el => el.querySelector('.m-label')?.textContent === '左臂').querySelector('.btn-module-add');
        add().click();
        await h.drain();
        assert.ok(d.querySelector('.module-picker-overlay'));
        const first = d.querySelector('.module-picker-item');
        assert.ok(first);
        first.click();
        await h.drain();
        assert.equal(IE.getState().equipment.clothing.modules.arm_l.instance_id, instanceId);
        assert.equal(d.querySelector('.module-picker-overlay'), null);
        assert.equal(d.querySelector('#modal-backpack').classList.contains('show'), true);
        await click(h, '.btn-module-remove');
        assert.equal(IE.auditItemOwnership().ok, true);
        assert.ok(IE.findItemInstanceRecord(instanceId));
        const install = IE.installModule;
        IE.installModule = () => ({ success: false, message: '测试安装失败' });
        add().click();
        await h.drain();
        await click(h, '.module-picker-item');
        assert.equal(IE.getState().equipment.clothing.modules.arm_l, null);
        assert.ok(IE.findItemInstanceRecord(instanceId));
        assert.equal(IE.auditItemOwnership().ok, true);
        IE.installModule = install;
        add().click();
        await h.drain();
        d.activeElement.dispatchEvent(new g.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await h.drain();
        assert.equal(d.querySelector('.module-picker-overlay'), null);
        assert.ok(d.querySelector('#modal-backpack.show'));
        await click(h, '#backpack-panel-close');
        // Substitute only proximity lookup; item placement and tick cost remain real.
        const adjacent = g.StationContext.isAdjacentToWarehouseTile;
        g.StationContext.isAdjacentToWarehouseTile = () => true;
        g.SceneApp.openBaseWarehousePanel();
        await h.drain();
        g.StationContext.isAdjacentToWarehouseTile = adjacent;
        assert.ok(d.querySelector('#modal-base-warehouse.show'));
        await input(h, 'base-warehouse-filter', 'fishing_float_small');
        assert.equal(d.querySelectorAll('#base-warehouse-list .warehouse-item-row').length, 1);
        let takes = 0;
        const put = IE.putItemIntoDefaultContainer;
        IE.putItemIntoDefaultContainer = (...args) => { takes++; return put(...args); };
        const tick = g.GameTime.getState().totalTicks;
        await click(h, '.btn-take-one');
        assert.equal(takes, 1);
        assert.equal(g.GameTime.getState().totalTicks, tick + 1);
        await click(h, '#base-warehouse-close');
        assert.equal(g.SvelteInteractions.overlays.active(), false);
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('P3 study controls, muscle unlock/passive equipment and variant slots use existing game rules', async () => {
    const h = await boot(true), g = h.g, IE = g.InventoryEquipment, d = g.document;
    try {
        await created(h);
        g.SceneApp.openSurvivalPanel();
        await h.drain();
        const firstId = g.SurvivalSkills.getAll()[0].id;
        let starts = 0;
        const start = g.Survival.startStudy;
        g.Survival.startStudy = (...args) => { starts++; return start(...args); };
        await click(h, '.survival-row .survival-plus-btn:last-child');
        assert.equal(starts, 1);
        assert.equal(g.Survival.getStudySkillId(), firstId);
        await click(h, '.survival-row .survival-plus-btn:last-child');
        assert.equal(g.Survival.isStudyActive(), false);
        await click(h, '[data-skill-tab=special]');
        await learnAnatomyFromBook(h);
        await click(h, '#survival-modal-close');
        g.SceneHud.refresh('status');await click(h,'#btn-muscles');
        await click(h,'#modal-muscles [data-group=shoulder_l]');
        const id=g.Muscles.getMusclesByGroup('shoulder_l')[0].id;
        await click(h,'#modal-muscles [data-muscle="'+id+'"]');
        assert.equal(g.Muscles.isUnlocked(id),false,'viewing never grants growth');
        for(const group of g.Muscles.getGroups())for(const m of g.Muscles.getMuscleEntriesByGroup(group.id))g.Muscles.addGrowth(m.id,100);
        g.SceneHud.refresh('status');await h.drain();
        await click(h,'#modal-muscles [data-view=chain]');
        const equip=d.querySelector('#modal-muscles [data-passive]:not(:disabled)');assert.ok(equip);
        const passiveId=equip.dataset.chainId;equip.click();await h.drain();assert.equal(g.Muscles.getEquippedPassiveIds().length,1);
        await click(h,'#modal-muscles [data-chain-id="'+passiveId+'"]');assert.equal(g.Muscles.getEquippedPassiveIds().length,0);
        await click(h,'#modal-muscles [data-close]');g.SceneApp.openCombatPanel();await h.drain();
        const state = IE.getState();
        for (const cat of g.CombatSkills.getCategories())
            for (const sk of g.CombatSkills.getSkillsByCategory(cat.id)) {
                state.skills[sk.id] = { level: 500, move_usage: Object.fromEntries((sk.moves || []).map(m => [m.id, 10000])) };
            }
        g.SveltePanels.refresh('combat');
        await h.drain();
        await click(h, '[data-limb=rhand] [data-edit=skill]');
        await click(h, '[data-pick=combat_basic_unarmed]');
        if (d.querySelector('#combat-loadout-picker')) await click(h, '#combat-loadout-picker .close');
        await click(h, '[data-limb=rhand] [data-variant="1"]');
        assert.ok(d.querySelector('.simple-empty'), 'current catalog has no active variants');
        d.activeElement.dispatchEvent(new g.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await h.drain();
        g.CombatVariants.setTable({ variants: { test_ui_variant: { id: 'test_ui_variant', variant_id: 'test_ui_variant', assist_scope: 'active_moves', source_skill_id: g.SceneApp.panelApi.combatState.curSkillId, min_source_level: 1 } } });
        await click(h, '[data-limb=rhand] [data-variant="1"]');
        const choices = d.querySelectorAll('[data-pick]:not(:disabled)');
        assert.ok(choices.length);
        choices[0].click();
        await h.drain();
        assert.ok(IE.getCombatState().move_sequences.rhand[1].startsWith('variant:'));
        await click(h, '[data-limb=rhand] [data-variant="1"]');
        await click(h, '[data-clear-slot]');
        assert.equal(IE.getCombatState().move_sequences.rhand[1], '');
        await click(h, '[data-limb=rhand] [data-edit=move]');
        const selected = IE.getCombatState();
        selected.limbs.rhand.active = null;
        IE.setCombatState({ limbs: selected.limbs });
        const oldChoice = d.querySelector('[data-pick]');
        assert.ok(oldChoice);
        oldChoice.click();
        await h.drain();
        assert.equal(d.querySelector('#combat-loadout-picker'), null);
        assert.equal(IE.getCombatState().limbs.rhand.active, null);
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
