/**
 * CompostPanel — 沤肥站面板 DOM（scene-app 组合根化拆解 ②）
 *
 * 来源：自 js/scene-app.js 迁出（沤肥面板族：状态计算/交互/渲染/开合 + UI 态变量）。
 * 状态/规则在 CompostSystem；本模块管 DOM 与暂存交互。
 *
 * 依赖注入 setUiDeps({ ui, showMsg, render, recalcCharacterStats,
 *   isPreCreationGameplayRestricted, showIntroBlockedMsg, guardPlayerComaBlocked })。
 */
(function (global) {
    'use strict';

    var IE = global.InventoryEquipment;

    var compostStationPanelOpen = false;
    var compostEventActionDisplayById = {};
    var PLANTING_SKILL_ID = 'life_planting';
    var LEGACY_FARMING_SKILL_ID = 'life_farming';
    var compostStationUiState = {
        mode: 'aerobic',
        staged_inputs: [],
        staged_inoculant_item_id: '',
        logs: []
    };
    var compostWindowActionSlots = {
        best: '',
        mid: '',
        alt: ''
    };

    var uiDeps = {};
    function setUiDeps(deps) {
        if (deps && typeof deps === 'object') uiDeps = Object.assign({}, uiDeps, deps);
    }
    function ui(key, vars) {
        return (typeof uiDeps.ui === 'function') ? uiDeps.ui(key, vars) : (key != null ? String(key) : '');
    }
    function showMsg(text, kind) {
        if (typeof uiDeps.showMsg === 'function') uiDeps.showMsg(text, kind);
    }
    function renderScene() {
        if (typeof uiDeps.render === 'function') uiDeps.render();
    }
    function recalcCharacterStats() {
        if (typeof uiDeps.recalcCharacterStats === 'function') uiDeps.recalcCharacterStats();
    }
    function isPreCreationGameplayRestricted() {
        return (typeof uiDeps.isPreCreationGameplayRestricted === 'function') ? !!uiDeps.isPreCreationGameplayRestricted() : false;
    }
    function showIntroBlockedMsg() {
        if (typeof uiDeps.showIntroBlockedMsg === 'function') uiDeps.showIntroBlockedMsg();
    }
    function guardPlayerComaBlocked() {
        return (typeof uiDeps.guardPlayerComaBlocked === 'function') ? !!uiDeps.guardPlayerComaBlocked() : false;
    }

    function getCompostActionDisplay(actionId) {
        var id = String(actionId || '').trim();
        if (!id) return '';
        return String(compostEventActionDisplayById[id] || id);
    }

    function getCompostBatchOrIdle(mode) {
        if (!global.CompostSystem || typeof global.CompostSystem.getBatch !== 'function') return null;
        return global.CompostSystem.getBatch(mode);
    }

    function hasCompostInteractionContext() {
        return !!compostStationPanelOpen;
    }

    function getMountedBreathSkillIdForCompostProficiency() {
        if (!IE || typeof IE.getCombatState !== 'function' || typeof IE.getSkillLevel !== 'function') return '';
        var hubs = IE.getCombatState().hubs || {};
        var breathSkillId = String(hubs.breath || '').trim();
        if (!breathSkillId) return '';
        return IE.getSkillLevel(breathSkillId) >= 1 ? breathSkillId : '';
    }

    function addCompostProficiencyForAction(actionType) {
        if (!IE || typeof IE.incrementSkillMoveUsage !== 'function') return;
        ensureLifePlantingSkillEntry();
        var actionKey = String(actionType || '').trim() || 'compost_action';
        IE.incrementSkillMoveUsage(PLANTING_SKILL_ID, actionKey, 1);
        var mountedBreathSkillId = getMountedBreathSkillIdForCompostProficiency();
        if (mountedBreathSkillId) IE.incrementSkillMoveUsage(mountedBreathSkillId, 'tu_na', 1);
    }

    function ensureLifePlantingSkillEntry() {
        if (!IE || typeof IE.getState !== 'function') return false;
        var st = IE.getState();
        if (!st || typeof st !== 'object') return false;
        if (!st.skills || typeof st.skills !== 'object') st.skills = {};

        var changed = false;
        var planting = st.skills[PLANTING_SKILL_ID];
        var legacy = st.skills[LEGACY_FARMING_SKILL_ID];
        if (!planting || typeof planting !== 'object') {
            if (legacy && typeof legacy === 'object') {
                st.skills[PLANTING_SKILL_ID] = {
                    level: Math.max(1, parseInt(legacy.level, 10) || 1),
                    move_usage: legacy.move_usage && typeof legacy.move_usage === 'object'
                        ? Object.assign({}, legacy.move_usage)
                        : {}
                };
            } else {
                st.skills[PLANTING_SKILL_ID] = { level: 1, move_usage: {} };
            }
            planting = st.skills[PLANTING_SKILL_ID];
            changed = true;
        }
        if ((parseInt(planting.level, 10) || 0) < 1) {
            planting.level = 1;
            changed = true;
        }
        if (!planting.move_usage || typeof planting.move_usage !== 'object') {
            planting.move_usage = {};
            changed = true;
        }
        if (changed) recalcCharacterStats();
        return true;
    }

    function getCompostStartGuardState(mode, stagedTotals) {
        var m = mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        var totals = stagedTotals || computeStagedCompostTotals();
        var block = null;
        if (global.CompostSystem && typeof global.CompostSystem.getStartBlockState === 'function') {
            block = global.CompostSystem.getStartBlockState(m);
        } else if (global.CompostSystem && typeof global.CompostSystem.canStartNewBatch === 'function') {
            block = global.CompostSystem.canStartNewBatch(m)
                ? { blocked: false, reason: 'ok' }
                : { blocked: true, reason: 'slot_not_ready' };
        } else {
            block = { blocked: false, reason: 'ok' };
        }
        if (block && block.blocked) return { canStart: false, reason: String(block.reason || 'slot_not_ready') };
        if (!Array.isArray(compostStationUiState.staged_inputs) || compostStationUiState.staged_inputs.length < 2) {
            return { canStart: false, reason: 'insufficient_inputs' };
        }
        if (Number(totals && totals.invalid_main_count || 0) > 0) {
            return { canStart: false, reason: 'invalid_inputs' };
        }
        var inoculantId = String(compostStationUiState.staged_inoculant_item_id || '');
        if (!inoculantId || !isItemAllowedCompostInoculant(inoculantId, m)) {
            return { canStart: false, reason: 'inoculant_required' };
        }
        if (global.InventoryHelpers.getInventoryCountByItemId(inoculantId) <= getStagedCompostCountForItem(inoculantId)) {
            return { canStart: false, reason: 'inoculant_missing_inventory' };
        }
        return { canStart: true, reason: 'ok' };
    }

    function showCompostStartBlockedHint(reason) {
        var r = String(reason || '');
        var key = 'compost.start.fail';
        if (r === 'output_pending') key = 'compost.start.blocked_output_pending';
        else if (r === 'already_fermenting') key = 'compost.start.blocked_fermenting';
        else if (r === 'insufficient_inputs') key = 'compost.start.blocked_inputs';
        else if (r === 'invalid_inputs') key = 'compost.start.blocked_invalid_inputs';
        else if (r === 'inoculant_required') key = 'compost.start.blocked_inoculant_required';
        else if (r === 'inoculant_missing_inventory') key = 'compost.start.blocked_inoculant_missing_inventory';
        showMsg(ui(key), 'warn');
    }

    function tryCollectCompostToInventory(mode) {
        if (!global.CompostSystem || typeof global.CompostSystem.collect !== 'function' || !IE || typeof IE.putItemIntoDefaultContainer !== 'function') {
            return { ok: false, reason: 'unavailable' };
        }
        var batch = getCompostBatchOrIdle(mode);
        var results = batch && Array.isArray(batch.results) ? batch.results : [];
        if (!results.length) return { ok: false, reason: 'nothing_to_collect' };
        var row = results[0] || {};
        var itemId = String(row.item_id || '');
        var left = Math.max(0, Math.floor(Number(row.count) || 0));
        if (!itemId || left <= 0) return { ok: false, reason: 'nothing_to_collect' };
        var wantAll = mode !== 'anaerobic';
        var tryCount = wantAll ? left : left;
        var canPut = 0;
        function rollbackInserted(itemId, n) {
            for (var t = 0; t < n; t++) {
                var s = global.InventoryHelpers.findFirstContainerSlotByItemId(itemId);
                if (!s) break;
                IE.takeItemFromContainer(s.containerType, s.index);
            }
        }
        for (var i = 0; i < tryCount; i++) {
            var placedTry = IE.putItemIntoDefaultContainer({ item_id: itemId, count: 1 });
            if (!placedTry || !placedTry.placed) break;
            canPut += 1;
        }
        if (canPut <= 0) return { ok: false, reason: 'inventory_full' };
        var takeCount = wantAll ? left : canPut;
        if (wantAll && canPut < left) {
            rollbackInserted(itemId, canPut);
            return { ok: false, reason: 'inventory_full' };
        }
        var ret = global.CompostSystem.collect(mode, takeCount);
        if (!ret || !ret.ok) {
            rollbackInserted(itemId, canPut);
            return { ok: false, reason: ret && ret.reason ? ret.reason : 'collect_failed' };
        }
        return {
            ok: true,
            item_id: ret.item_id,
            collected: ret.count,
            remaining_in_batch: Math.max(0, Number(ret.remaining_in_batch) || 0),
            partial: Number(ret.remaining_in_batch) > 0
        };
    }

    function isItemAllowedCompostIngredient(itemId) {
        if (!IE || typeof IE.getItemTemplate !== 'function') return false;
        var tpl = IE.getItemTemplate(itemId);
        if (global.CompostSystem && typeof global.CompostSystem.isTemplateEligibleMainMaterial === 'function') {
            return !!global.CompostSystem.isTemplateEligibleMainMaterial(tpl);
        }
        if (!tpl || typeof tpl !== 'object') return false;
        var hasC = Object.prototype.hasOwnProperty.call(tpl, 'fert_c');
        var hasN = Object.prototype.hasOwnProperty.call(tpl, 'fert_n');
        return hasC || hasN;
    }

    function isItemAllowedCompostInoculant(itemId, mode) {
        if (!IE || typeof IE.getItemTemplate !== 'function') return false;
        var tpl = IE.getItemTemplate(itemId);
        var m = mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        if (global.CompostSystem && typeof global.CompostSystem.isTemplateEligibleInoculant === 'function') {
            return !!global.CompostSystem.isTemplateEligibleInoculant(tpl, m);
        }
        if (!tpl || typeof tpl !== 'object') return false;
        return m === 'anaerobic' ? (tpl.compost_inoculant_anaerobic === true) : (tpl.compost_inoculant_aerobic === true);
    }

    function getCompostInoculantOptionsFromInventory(mode) {
        if (!IE) return [];
        var m = mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        var seen = {};
        var out = [];
        var groups = [
            IE.getPocketArray ? IE.getPocketArray() : [],
            IE.getVestArray ? IE.getVestArray() : [],
            IE.getBackpackArray ? IE.getBackpackArray() : []
        ];
        for (var g = 0; g < groups.length; g++) {
            var arr = groups[g];
            if (!Array.isArray(arr)) continue;
            for (var i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                var id = String(cell.item_id);
                if (seen[id]) continue;
                if (!isItemAllowedCompostInoculant(id, m)) continue;
                if (global.InventoryHelpers.getInventoryCountByItemId(id) <= 0) continue;
                seen[id] = true;
                out.push(id);
            }
        }
        out.sort();
        return out;
    }

    function trySetCompostInoculantFromInventory(iid, mode) {
        var m = mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        var id = iid != null ? String(iid) : '';
        if (!id || !isItemAllowedCompostInoculant(id, m)) return;
        var have = global.InventoryHelpers.getInventoryCountByItemId(id);
        var staged = getStagedCompostCountForItem(id);
        if (have <= staged) return;
        compostStationUiState.staged_inoculant_item_id = id;
        renderCompostStationPanel();
    }

    function getCompostIngredientOptionsFromInventory() {
        if (!IE) return [];
        var seen = {};
        var out = [];
        var groups = [
            IE.getPocketArray ? IE.getPocketArray() : [],
            IE.getVestArray ? IE.getVestArray() : [],
            IE.getBackpackArray ? IE.getBackpackArray() : []
        ];
        for (var g = 0; g < groups.length; g++) {
            var arr = groups[g];
            if (!Array.isArray(arr)) continue;
            for (var i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                var id = String(cell.item_id);
                if (seen[id]) continue;
                if (!isItemAllowedCompostIngredient(id)) continue;
                if (global.InventoryHelpers.getInventoryCountByItemId(id) <= 0) continue;
                seen[id] = true;
                out.push(id);
            }
        }
        out.sort();
        return out;
    }

    function getStagedCompostCountForItem(itemId) {
        var n = 0;
        var arr = Array.isArray(compostStationUiState.staged_inputs) ? compostStationUiState.staged_inputs : [];
        for (var i = 0; i < arr.length; i++) if (String(arr[i]) === String(itemId)) n += 1;
        return n;
    }

    function getReservedCompostCountForItem(itemId, mode) {
        var id = String(itemId || '');
        if (!id) return 0;
        var n = getStagedCompostCountForItem(id);
        var m = mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        var inocId = String(compostStationUiState.staged_inoculant_item_id || '');
        if (inocId && inocId === id && isItemAllowedCompostInoculant(id, m)) n += 1;
        return n;
    }

    function pushCompostLog(text) {
        var line = String(text || '').trim();
        if (!line) return;
        compostStationUiState.logs.push(line);
        if (compostStationUiState.logs.length > 60) compostStationUiState.logs = compostStationUiState.logs.slice(compostStationUiState.logs.length - 60);
    }

    function computeStagedCompostTotals() {
        var arr = Array.isArray(compostStationUiState.staged_inputs) ? compostStationUiState.staged_inputs : [];
        if (global.CompostSystem && typeof global.CompostSystem.computeCnTotalsFromInputItems === 'function') {
            return global.CompostSystem.computeCnTotalsFromInputItems(arr, {
                getTemplate: function (itemId) {
                    return IE && typeof IE.getItemTemplate === 'function' ? IE.getItemTemplate(itemId) : null;
                }
            });
        }
        var cTotal = 0;
        var nTotal = 0;
        for (var i = 0; i < arr.length; i++) {
            var iid = String(arr[i] || '');
            if (!iid) continue;
            var tpl = IE && typeof IE.getItemTemplate === 'function' ? IE.getItemTemplate(iid) : null;
            cTotal += Math.floor(Number(tpl && tpl.fert_c) || 0);
            nTotal += Math.floor(Number(tpl && tpl.fert_n) || 0);
        }
        return { c_total: cTotal, n_total: nTotal, legal_cn: cTotal > 0 && nTotal > 0, ratio: (cTotal > 0 && nTotal > 0) ? (cTotal / nTotal) : null };
    }

    function getCompostPerceptionText(cTotal, nTotal, mode) {
        if (cTotal <= 0 && nTotal <= 0) return { text: ui('compost.perception.empty'), severity: 'neutral', text_key: 'compost.perception.empty' };
        var feedback = null;
        if (global.CompostSystem && typeof global.CompostSystem.classifyCnFeedbackByTotals === 'function') {
            feedback = global.CompostSystem.classifyCnFeedbackByTotals(cTotal, nTotal, mode);
        }
        if (!feedback || !feedback.text_key) {
            var ratio = (nTotal > 0) ? (cTotal / nTotal) : null;
            if (cTotal <= 0 || nTotal <= 0) feedback = { text_key: 'compost.perception.void', severity: 'fatal', ratio: null };
            else if (ratio >= 25 && ratio <= 35) feedback = { text_key: 'compost.perception.good', severity: 'good', ratio: ratio };
            else if ((ratio >= 18 && ratio < 25) || (ratio > 35 && ratio <= 45)) feedback = { text_key: 'compost.perception.mid', severity: 'mid', ratio: ratio };
            else feedback = { text_key: mode === 'anaerobic' ? 'compost.perception.bad_anaerobic' : 'compost.perception.bad_aerobic', severity: 'bad', ratio: ratio };
        }
        return { text: ui(feedback.text_key), severity: String(feedback.severity || 'neutral'), text_key: feedback.text_key };
    }

    function tryAddOneCompostInputFromInventory(iid) {
        if (!compostStationPanelOpen) return;
        iid = iid != null ? String(iid) : '';
        if (!iid || !isItemAllowedCompostIngredient(iid)) return;
        var have = global.InventoryHelpers.getInventoryCountByItemId(iid);
        var reserved = getReservedCompostCountForItem(iid, compostStationUiState.mode);
        if (reserved >= have) return;
        compostStationUiState.staged_inputs.push(iid);
        renderCompostStationPanel();
    }

    function renderCompostIngredientPickerList() {
        var wrap = document.getElementById('compost-ingredient-list');
        if (!wrap) return;
        wrap.innerHTML = '';
        var opts = getCompostIngredientOptionsFromInventory();
        var oi;
        for (oi = 0; oi < opts.length; oi++) {
            var iid = opts[oi];
            var disp = StationCraftCore.getItemDisplayNameSafe(iid);
            var have = global.InventoryHelpers.getInventoryCountByItemId(iid);
            var reserved = getReservedCompostCountForItem(iid, compostStationUiState.mode);
            var canAdd = have > reserved;
            var row = document.createElement('div');
            row.className = 'cs-ingredient-row';
            var left = document.createElement('div');
            left.className = 'cs-ing-left';
            var nameEl = document.createElement('div');
            nameEl.className = 'cs-ing-name';
            nameEl.textContent = disp;
            var idEl = document.createElement('div');
            idEl.className = 'cs-ing-id';
            idEl.textContent = iid;
            left.appendChild(nameEl);
            left.appendChild(idEl);
            var countsEl = document.createElement('div');
            countsEl.className = 'cs-ing-counts';
            countsEl.textContent = ui('compost.ingredient.available_staged_fmt', { have: String(have), staged: String(reserved) });
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-add-ingredient';
            btn.textContent = ui('compost.btn.add_input');
            btn.disabled = !canAdd;
            btn.onclick = (function (xid) {
                return function (ev) {
                    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                    tryAddOneCompostInputFromInventory(xid);
                };
            })(iid);
            row.appendChild(left);
            row.appendChild(countsEl);
            row.appendChild(btn);
            wrap.appendChild(row);
        }
        if (!opts.length) wrap.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui('compost.ingredient.empty') + '</div>';
    }

    function renderCompostInoculantPickerList(mode) {
        var wrap = document.getElementById('compost-inoculant-list');
        if (!wrap) return;
        var m = mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        var selected = String(compostStationUiState.staged_inoculant_item_id || '');
        if (selected && !isItemAllowedCompostInoculant(selected, m)) {
            selected = '';
            compostStationUiState.staged_inoculant_item_id = '';
        }
        var opts = getCompostInoculantOptionsFromInventory(m);
        wrap.innerHTML = '';
        for (var i = 0; i < opts.length; i++) {
            var iid = opts[i];
            var row = document.createElement('div');
            row.className = 'cs-ingredient-row';
            var left = document.createElement('div');
            left.className = 'cs-ing-left';
            var nameEl = document.createElement('div');
            nameEl.className = 'cs-ing-name';
            nameEl.textContent = StationCraftCore.getItemDisplayNameSafe(iid);
            var idEl = document.createElement('div');
            idEl.className = 'cs-ing-id';
            idEl.textContent = iid;
            left.appendChild(nameEl);
            left.appendChild(idEl);
            var countsEl = document.createElement('div');
            countsEl.className = 'cs-ing-counts';
            countsEl.textContent = ui('compost.ingredient.available_fmt', { have: String(global.InventoryHelpers.getInventoryCountByItemId(iid)) });
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-add-ingredient';
            btn.textContent = (selected === iid) ? ui('compost.btn.selected') : ui('compost.btn.select');
            btn.disabled = selected === iid;
            btn.onclick = (function (xid, xm) {
                return function (ev) {
                    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                    trySetCompostInoculantFromInventory(xid, xm);
                };
            })(iid, m);
            row.appendChild(left);
            row.appendChild(countsEl);
            row.appendChild(btn);
            wrap.appendChild(row);
        }
        if (!opts.length) wrap.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui('compost.inoculant.empty') + '</div>';
    }

    function renderCompostStationPanel() {
        var modal = document.getElementById('modal-compost-station');
        if (!modal) return;
        var mode = compostStationUiState.mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        compostStationUiState.mode = mode;
        var batch = getCompostBatchOrIdle(mode);
        var inputWrap = document.getElementById('compost-input-list');
        var perceptionEl = document.getElementById('compost-perception-text');
        var progressWrap = document.getElementById('compost-progress-kv');
        var windowEl = document.getElementById('compost-window-text');
        var resultWrap = document.getElementById('compost-result-list');
        var logWrap = document.getElementById('compost-log-list');
        var tabA = document.getElementById('compost-tab-aerobic');
        var tabN = document.getElementById('compost-tab-anaerobic');
        if (tabA) tabA.classList.toggle('active', mode === 'aerobic');
        if (tabN) tabN.classList.toggle('active', mode === 'anaerobic');

        function getCompostStatusText(statusRaw) {
            var s = String(statusRaw || 'IDLE').trim().toUpperCase();
            if (s === 'FERMENTING') return ui('compost.status.fermenting');
            if (s === 'SETTLED') return ui('compost.status.settled');
            return ui('compost.status.idle');
        }

        if (inputWrap) {
            inputWrap.innerHTML = '';
            if (batch && Array.isArray(batch.materials) && batch.materials.length) {
                for (var mi = 0; mi < batch.materials.length; mi++) {
                    var mat = batch.materials[mi] || {};
                    var r0 = document.createElement('div');
                    r0.className = 'cs-input-row';
                    r0.innerHTML = '<div class="iname">' + StationCraftCore.getItemDisplayNameSafe(mat.item_id) + ' (' + String(mat.item_id || '') + ')</div><div class="icnt">x' + String(mat.count || 1) + '</div><div></div>';
                    inputWrap.appendChild(r0);
                }
                if (batch.inoculant_item_id) {
                    var inocBatchRow = document.createElement('div');
                    inocBatchRow.className = 'cs-input-row';
                    inocBatchRow.innerHTML = '<div class="iname">' + ui('compost.inoculant.label') + ': ' + StationCraftCore.getItemDisplayNameSafe(batch.inoculant_item_id) + ' (' + String(batch.inoculant_item_id || '') + ')</div><div class="icnt">x1</div><div></div>';
                    inputWrap.appendChild(inocBatchRow);
                }
            } else if (Array.isArray(compostStationUiState.staged_inputs) && compostStationUiState.staged_inputs.length) {
                var stagedMap = {};
                for (var si = 0; si < compostStationUiState.staged_inputs.length; si++) {
                    var sid = String(compostStationUiState.staged_inputs[si] || '');
                    if (!sid) continue;
                    stagedMap[sid] = (stagedMap[sid] || 0) + 1;
                }
                var keys = Object.keys(stagedMap);
                for (var ki = 0; ki < keys.length; ki++) {
                    var id0 = keys[ki];
                    var row = document.createElement('div');
                    row.className = 'cs-input-row';
                    var name = document.createElement('div');
                    name.className = 'iname';
                    name.textContent = StationCraftCore.getItemDisplayNameSafe(id0) + ' (' + id0 + ')';
                    var cnt = document.createElement('div');
                    cnt.className = 'icnt';
                    cnt.textContent = 'x' + String(stagedMap[id0]);
                    var btnDel = document.createElement('button');
                    btnDel.type = 'button';
                    btnDel.className = 'btn-mini';
                    btnDel.textContent = ui('compost.btn.remove');
                    btnDel.onclick = (function (rid) {
                        return function () {
                            for (var dx = compostStationUiState.staged_inputs.length - 1; dx >= 0; dx--) {
                                if (String(compostStationUiState.staged_inputs[dx]) === String(rid)) {
                                    compostStationUiState.staged_inputs.splice(dx, 1);
                                    break;
                                }
                            }
                            renderCompostStationPanel();
                        };
                    })(id0);
                    row.appendChild(name);
                    row.appendChild(cnt);
                    row.appendChild(btnDel);
                    inputWrap.appendChild(row);
                }
                if (compostStationUiState.staged_inoculant_item_id) {
                    var inocRow = document.createElement('div');
                    inocRow.className = 'cs-input-row';
                    var inocName = document.createElement('div');
                    inocName.className = 'iname';
                    inocName.textContent = ui('compost.inoculant.label') + ': ' + StationCraftCore.getItemDisplayNameSafe(compostStationUiState.staged_inoculant_item_id) + ' (' + compostStationUiState.staged_inoculant_item_id + ')';
                    var inocCnt = document.createElement('div');
                    inocCnt.className = 'icnt';
                    inocCnt.textContent = 'x1';
                    var inocDel = document.createElement('button');
                    inocDel.type = 'button';
                    inocDel.className = 'btn-mini';
                    inocDel.textContent = ui('compost.btn.remove');
                    inocDel.onclick = function () {
                        compostStationUiState.staged_inoculant_item_id = '';
                        renderCompostStationPanel();
                    };
                    inocRow.appendChild(inocName);
                    inocRow.appendChild(inocCnt);
                    inocRow.appendChild(inocDel);
                    inputWrap.appendChild(inocRow);
                }
            } else {
                if (compostStationUiState.staged_inoculant_item_id) {
                    var inocOnly = document.createElement('div');
                    inocOnly.className = 'cs-input-row';
                    inocOnly.innerHTML = '<div class="iname">' + ui('compost.inoculant.label') + ': ' + StationCraftCore.getItemDisplayNameSafe(compostStationUiState.staged_inoculant_item_id) + ' (' + compostStationUiState.staged_inoculant_item_id + ')</div><div class="icnt">x1</div><div></div>';
                    inputWrap.appendChild(inocOnly);
                } else {
                    inputWrap.innerHTML = '<div class="cs-empty-hint">' + ui('compost.inputs.empty') + '</div>';
                }
            }
        }
        renderCompostIngredientPickerList();
        renderCompostInoculantPickerList(mode);

        var totals = computeStagedCompostTotals();
        if (batch && batch.status === 'FERMENTING') totals = { c_total: Number(batch.c_total) || 0, n_total: Number(batch.n_total) || 0 };
        if (perceptionEl) {
            var perception = getCompostPerceptionText(totals.c_total, totals.n_total, mode);
            perceptionEl.textContent = perception.text;
            perceptionEl.setAttribute('data-severity', perception.severity || 'neutral');
        }

        if (progressWrap) {
            progressWrap.innerHTML = '';
            var age = batch ? (Number(batch.age_ticks) || 0) : 0;
            var duration = batch ? (Number(batch.duration_ticks) || 0) : 0;
            var stat = getCompostStatusText(batch ? batch.status : 'IDLE');
            var kv1 = document.createElement('div'); kv1.className = 'kv'; kv1.textContent = ui('compost.kv.status', { status: stat });
            var kv2 = document.createElement('div'); kv2.className = 'kv'; kv2.textContent = ui('compost.kv.tick', { cur: age, max: duration });
            progressWrap.appendChild(kv1); progressWrap.appendChild(kv2);
        }

        var pendingWindow = null;
        var windowInteractState = null;
        if (global.CompostSystem && typeof global.CompostSystem.getWindowInteractionState === 'function') {
            windowInteractState = global.CompostSystem.getWindowInteractionState(mode);
            if (windowInteractState && windowInteractState.can_interact) {
                pendingWindow = windowInteractState.pending_window || null;
            }
        } else if (batch && Array.isArray(batch.windows) && Number(batch.pending_window_index) >= 0) {
            pendingWindow = batch.windows[Number(batch.pending_window_index)] || null;
        }
        if (windowEl) {
            if (pendingWindow && batch && batch.status === 'FERMENTING') {
                var evt = pendingWindow.event || {};
                var vEvt = evt.variant || {};
                var evtTitle = String(vEvt.title || evt.title || evt.event_id || 'window');
                var evtDesc = String(vEvt.desc || evt.desc || '').trim();
                windowEl.textContent = ui('compost.window.pending', { title: evtTitle }) + (evtDesc ? ('\n' + evtDesc) : '');
            } else if (windowInteractState && windowInteractState.reason === 'illegal_cn_batch') {
                windowEl.textContent = ui('compost.window.disabled_illegal');
            } else {
                windowEl.textContent = ui('compost.window.none');
            }
        }

        var bestBtn = document.getElementById('compost-interact-best-btn');
        var midBtn = document.getElementById('compost-interact-mid-btn');
        var altBtn = document.getElementById('compost-interact-alt-btn');
        var canInteract = !!(batch && batch.status === 'FERMENTING' && pendingWindow);
        var pEvt = (pendingWindow && pendingWindow.event) ? pendingWindow.event : {};
        var isAerobicWindow = canInteract && mode === 'aerobic';
        var btnSlots = [
            { key: 'best', el: bestBtn },
            { key: 'mid', el: midBtn },
            { key: 'alt', el: altBtn }
        ];
        compostWindowActionSlots.best = '';
        compostWindowActionSlots.mid = '';
        compostWindowActionSlots.alt = '';
        var actionChoices = [];
        if (canInteract) {
            if (isAerobicWindow) {
                if (String(pEvt.best_action || '').trim()) actionChoices.push({ id: String(pEvt.best_action || '').trim() });
                if (String(pEvt.secondary_action || '').trim()) actionChoices.push({ id: String(pEvt.secondary_action || '').trim() });
                if (String(pEvt.bad_action || '').trim()) actionChoices.push({ id: String(pEvt.bad_action || '').trim() });
                // 固定种子洗牌：同一事件窗顺序稳定，但不同事件窗会变化。
                var seedSrc = String(pEvt.event_id || '') + '|' + String(pendingWindow && pendingWindow.index || 0) + '|' + String(pendingWindow && pendingWindow.trigger_tick || 0);
                var seed = 0;
                for (var sx = 0; sx < seedSrc.length; sx++) seed = (((seed * 131) + seedSrc.charCodeAt(sx)) >>> 0);
                function seededRand() { seed = ((seed * 1664525 + 1013904223) >>> 0); return seed / 4294967296; }
                for (var sh = actionChoices.length - 1; sh > 0; sh--) {
                    var j = Math.floor(seededRand() * (sh + 1));
                    var tmp = actionChoices[sh];
                    actionChoices[sh] = actionChoices[j];
                    actionChoices[j] = tmp;
                }
            } else {
                actionChoices.push({ id: 'vent_gas' }, { id: 'leave_as_is' });
            }
        }
        for (var bi = 0; bi < btnSlots.length; bi++) {
            var slot = btnSlots[bi];
            if (!slot.el) continue;
            var ch = actionChoices[bi] || null;
            if (!canInteract || !ch || !ch.id) {
                slot.el.disabled = true;
                slot.el.style.display = 'none';
                slot.el.textContent = '';
                compostWindowActionSlots[slot.key] = '';
            } else {
                slot.el.disabled = false;
                slot.el.style.display = '';
                slot.el.textContent = getCompostActionDisplay(ch.id);
                compostWindowActionSlots[slot.key] = String(ch.id);
            }
        }

        if (resultWrap) {
            resultWrap.innerHTML = '';
            var results = batch && Array.isArray(batch.results) ? batch.results : [];
            if (!results.length) {
                resultWrap.innerHTML = '<div class="cs-empty-hint">' + ui('compost.results.empty') + '</div>';
            } else {
                for (var ri = 0; ri < results.length; ri++) {
                    var r = results[ri] || {};
                    var rowR = document.createElement('div');
                    rowR.className = 'cs-input-row';
                    rowR.innerHTML = '<div class="iname">' + StationCraftCore.getItemDisplayNameSafe(r.item_id) + ' (' + String(r.item_id || '') + ')</div><div class="icnt">x' + String(r.count || 0) + '</div><div></div>';
                    resultWrap.appendChild(rowR);
                }
            }
        }
        if (logWrap) {
            logWrap.innerHTML = '';
            var logs = compostStationUiState.logs.slice(-20);
            if (!logs.length) {
                logWrap.innerHTML = '<div class="line">' + ui('compost.log.empty') + '</div>';
            } else {
                for (var li = 0; li < logs.length; li++) {
                    var l = document.createElement('div');
                    l.className = 'line';
                    l.textContent = logs[li];
                    logWrap.appendChild(l);
                }
            }
        }

        var startBtn = document.getElementById('compost-start-btn');
        var stopBtn = document.getElementById('compost-stop-btn');
        var collectBtn = document.getElementById('compost-collect-btn');
        var discardBtn = document.getElementById('compost-discard-btn');
        var stagedTotals = computeStagedCompostTotals();
        var startGuard = getCompostStartGuardState(mode, stagedTotals);
        var canStart = !!startGuard.canStart;
        if (startBtn) startBtn.disabled = !canStart;
        if (stopBtn) stopBtn.disabled = !(batch && batch.status === 'FERMENTING');
        if (collectBtn) collectBtn.disabled = !(batch && batch.status === 'SETTLED' && Array.isArray(batch.results) && batch.results.length > 0);
        if (discardBtn) discardBtn.disabled = !(batch && batch.status === 'SETTLED');

        if (global.UIText && typeof global.UIText.applyDom === 'function') {
            try { global.UIText.applyDom(modal); } catch (eApplyCompost) { /* ignore */ }
        }
    }

    function openCompostStationPanel() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (guardPlayerComaBlocked()) return;
        if (compostStationPanelOpen) return;
        if (!StationContext.isOnCompostStationTile()) {
            showMsg(ui('compost.station.not_on_tile'), 'info');
            return;
        }
        ensureLifePlantingSkillEntry();
        if (global.Survival && typeof global.Survival.advanceTick === 'function') global.Survival.advanceTick();
        compostStationPanelOpen = true;
        var modal = document.getElementById('modal-compost-station');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }
        renderCompostStationPanel();
        renderScene();
    }

    function closeCompostStationPanel() {
        if (!compostStationPanelOpen) return;
        if (global.Survival && typeof global.Survival.advanceTick === 'function') global.Survival.advanceTick();
        compostStationPanelOpen = false;
        var modal = document.getElementById('modal-compost-station');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        renderScene();
    }

    function refreshIfOpen() {
        if (compostStationPanelOpen) renderCompostStationPanel();
    }

    function isOpen() {
        return compostStationPanelOpen;
    }

    global.CompostPanel = {
        setUiDeps: setUiDeps,
        open: openCompostStationPanel,
        close: closeCompostStationPanel,
        render: renderCompostStationPanel,
        refreshIfOpen: refreshIfOpen,
        isOpen: isOpen,
        uiState: compostStationUiState,
        eventActionDisplayById: compostEventActionDisplayById,
        windowActionSlots: compostWindowActionSlots,
        setEventActionDisplayById: function (map) {
            compostEventActionDisplayById = (map && typeof map === 'object') ? map : {};
        },
        getCompostActionDisplay: getCompostActionDisplay,
        getCompostStartGuardState: getCompostStartGuardState,
        showCompostStartBlockedHint: showCompostStartBlockedHint,
        tryCollectCompostToInventory: tryCollectCompostToInventory,
        computeStagedCompostTotals: computeStagedCompostTotals,
        pushCompostLog: pushCompostLog,
        addCompostProficiencyForAction: addCompostProficiencyForAction,
        ensureLifePlantingSkillEntry: ensureLifePlantingSkillEntry,
        hasCompostInteractionContext: hasCompostInteractionContext,
        getCompostPerceptionText: getCompostPerceptionText,
        isItemAllowedCompostIngredient: isItemAllowedCompostIngredient,
        isItemAllowedCompostInoculant: isItemAllowedCompostInoculant
    };
})(typeof window !== 'undefined' ? window : globalThis);
