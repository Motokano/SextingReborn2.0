/**
 * 藏身处账号仓库 hideout_warehouse — 运行时 API 与存档（无 DOM）。
 * 设计正本：docs/design/29-hideout-warehouse.md
 */
(function (global) {
    'use strict';

    var upgradeTable = null;
    var state = null;

    var FALLBACK_BASE_CAPACITY = 100;
    var FALLBACK_FREE_QOL_IDS = [
        'capacity_100',
        'deposit_manual_four_containers',
        'deposit_auto_stack',
        'withdraw_to_character_default_order'
    ];

    function getIE() {
        return global.InventoryEquipment || null;
    }

    function cloneJsonDeep(v) {
        if (v == null || typeof v !== 'object') return v;
        try {
            return JSON.parse(JSON.stringify(v));
        } catch (e) {
            return null;
        }
    }

    function coerceInt(v, fallback) {
        var n = Math.floor(Number(v));
        return isFinite(n) ? n : fallback;
    }

    function coercePositiveInt(v, fallback) {
        var n = coerceInt(v, fallback);
        return n > 0 ? n : fallback;
    }

    function getBaseCapacityFromTable() {
        if (upgradeTable && upgradeTable.base_capacity != null) {
            return coercePositiveInt(upgradeTable.base_capacity, FALLBACK_BASE_CAPACITY);
        }
        return FALLBACK_BASE_CAPACITY;
    }

    function getBaseFreeQolIdsFromTable() {
        if (upgradeTable && Array.isArray(upgradeTable.base_free_qol_ids) && upgradeTable.base_free_qol_ids.length) {
            return upgradeTable.base_free_qol_ids.slice();
        }
        return FALLBACK_FREE_QOL_IDS.slice();
    }

    function getSpoilageTicksFromTemplate(itemId) {
        var tpl = getItemTemplate(itemId);
        if (!tpl) return 0;
        var n = coerceInt(tpl.spoilage_ticks, 0);
        return n > 0 ? n : 0;
    }

    function isPerishableItemId(itemId) {
        return getSpoilageTicksFromTemplate(itemId) > 0;
    }

    function hasColdStorage() {
        return hasQoL('qol_cold_storage');
    }

    function ensureSpoilageElapsedOnInstance(inst) {
        if (!inst || !inst.item_id) return inst;
        var limit = getSpoilageTicksFromTemplate(inst.item_id);
        if (limit <= 0) {
            if (inst.spoilage_elapsed_ticks != null) delete inst.spoilage_elapsed_ticks;
            return inst;
        }
        if (inst.spoilage_elapsed_ticks == null) {
            inst.spoilage_elapsed_ticks = 0;
        } else {
            inst.spoilage_elapsed_ticks = Math.max(0, coerceInt(inst.spoilage_elapsed_ticks, 0));
        }
        return inst;
    }

    function copyItemInstance(inst) {
        if (!inst || typeof inst !== 'object') return null;
        var c = cloneJsonDeep(inst);
        if (!c || !c.item_id) return null;
        if (c.count == null || c.count < 1) c.count = 1;
        return ensureSpoilageElapsedOnInstance(c);
    }

    function logSpoilageExpired(itemId, context) {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[HideoutWarehouse] spoilage expired (no failure item configured):'
                + ' item_id=' + String(itemId || '')
                + ' context=' + String(context || ''));
        }
    }

    function resolveSpoiledInstance(inst, context) {
        if (!inst || !inst.item_id) return null;
        logSpoilageExpired(inst.item_id, context);
        return null;
    }

    function tickInstanceSpoilage(inst, context) {
        if (!inst || !inst.item_id) return inst;
        var limit = getSpoilageTicksFromTemplate(inst.item_id);
        if (limit <= 0) return inst;
        ensureSpoilageElapsedOnInstance(inst);
        inst.spoilage_elapsed_ticks = coerceInt(inst.spoilage_elapsed_ticks, 0) + 1;
        if (inst.spoilage_elapsed_ticks >= limit) {
            return resolveSpoiledInstance(inst, context);
        }
        return inst;
    }

    function tickSpoilageInContainerArray(arr, label) {
        if (!Array.isArray(arr)) return 0;
        var spoiled = 0;
        var i;
        for (i = 0; i < arr.length; i++) {
            var cell = arr[i];
            if (!cell || !cell.item_id) continue;
            var next = tickInstanceSpoilage(cell, label + ':' + i);
            if (next === null) {
                arr[i] = null;
                spoiled += 1;
            }
        }
        return spoiled;
    }

    function tickSpoilage() {
        var st = ensureState();
        var result = {
            ok: true,
            warehouse_spoiled: 0,
            inventory_spoiled: 0,
            warehouse_frozen: hasColdStorage()
        };

        if (!hasColdStorage()) {
            var wi;
            for (wi = 0; wi < st.slots.length; wi++) {
                var whCell = st.slots[wi];
                if (!whCell || !whCell.item_id) continue;
                var whNext = tickInstanceSpoilage(whCell, 'warehouse:' + wi);
                if (whNext === null) {
                    st.slots[wi] = null;
                    result.warehouse_spoiled += 1;
                }
            }
        }

        var IE = getIE();
        if (IE && typeof IE.getState === 'function' && typeof IE.setState === 'function') {
            var ieSt = IE.getState();
            if (ieSt) {
                var invSpoiled = 0;
                invSpoiled += tickSpoilageInContainerArray(ieSt.inventory_pocket, 'pocket');
                invSpoiled += tickSpoilageInContainerArray(ieSt.inventory_vest, 'vest');
                invSpoiled += tickSpoilageInContainerArray(ieSt.inventory_backpack, 'backpack');
                if (ieSt.bound_vehicle_id) {
                    invSpoiled += tickSpoilageInContainerArray(ieSt.inventory_vehicle, 'vehicle');
                }
                if (invSpoiled > 0) {
                    result.inventory_spoiled = invSpoiled;
                    IE.setState(ieSt);
                } else {
                    var hadPerishable = false;
                    var keys = ['inventory_pocket', 'inventory_vest', 'inventory_backpack'];
                    if (ieSt.bound_vehicle_id) keys.push('inventory_vehicle');
                    var ki;
                    for (ki = 0; ki < keys.length; ki++) {
                        var arr = ieSt[keys[ki]];
                        if (!Array.isArray(arr)) continue;
                        var ai;
                        for (ai = 0; ai < arr.length; ai++) {
                            if (arr[ai] && isPerishableItemId(arr[ai].item_id)) {
                                hadPerishable = true;
                                break;
                            }
                        }
                        if (hadPerishable) break;
                    }
                    if (hadPerishable) IE.setState(ieSt);
                }
            }
        }

        return result;
    }

    function getItemTemplate(itemId) {
        var IE = getIE();
        if (IE && typeof IE.getItemTemplate === 'function') return IE.getItemTemplate(itemId);
        return null;
    }

    function getWarehouseStackLimit(tpl) {
        if (!tpl || typeof tpl !== 'object') return 1;
        if (tpl.warehouse_stack_limit != null) {
            return Math.max(1, coerceInt(tpl.warehouse_stack_limit, 1));
        }
        if (tpl.warehouse_stackable === false) return 1;
        if (tpl.warehouse_stackable === true) {
            if (tpl.stack_limit != null) return Math.max(1, coerceInt(tpl.stack_limit, 99));
            if (tpl.stack_max != null) return Math.max(1, coerceInt(tpl.stack_max, 99));
            return 99;
        }
        var sl = tpl.stack_limit != null ? coerceInt(tpl.stack_limit, 1) : 1;
        if (sl > 1) return sl;
        if (tpl.stack_max != null) {
            var sm = coerceInt(tpl.stack_max, 1);
            if (sm > 1) return sm;
        }
        return 1;
    }

    function isWarehouseStackable(tpl) {
        if (!tpl || typeof tpl !== 'object') return false;
        if (tpl.warehouse_stackable === false) return false;
        if (tpl.warehouse_stackable === true) return true;
        if (tpl.enchant_slots != null && coerceInt(tpl.enchant_slots, 0) > 0) return false;
        return getWarehouseStackLimit(tpl) > 1;
    }

    function instancesCanStackInWarehouse(a, b) {
        if (!a || !b || !a.item_id || a.item_id !== b.item_id) return false;
        if (a.enchants && a.enchants.length) return false;
        if (b.enchants && b.enchants.length) return false;
        var tpl = getItemTemplate(a.item_id);
        if (tpl && tpl.enchant_slots != null && coerceInt(tpl.enchant_slots, 0) > 0) return false;
        if (!isWarehouseStackable(tpl)) return false;
        return true;
    }

    function ensureState() {
        if (!state) state = createDefaultState();
        return state;
    }

    function normalizeStringArray(arr, fallback) {
        if (!Array.isArray(arr)) return fallback ? fallback.slice() : [];
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] != null && String(arr[i])) out.push(String(arr[i]));
        }
        return out;
    }

    function mergeUniqueIds(base, extra) {
        var set = {};
        var out = [];
        var i;
        for (i = 0; i < base.length; i++) {
            var a = String(base[i]);
            if (!set[a]) { set[a] = true; out.push(a); }
        }
        for (i = 0; extra && i < extra.length; i++) {
            var b = String(extra[i]);
            if (!set[b]) { set[b] = true; out.push(b); }
        }
        return out;
    }

    function normalizeActiveUpgradeTask(raw) {
        if (!raw || typeof raw !== 'object' || !raw.upgrade_id) return null;
        var total = coercePositiveInt(raw.task_ticks_total, coercePositiveInt(raw.ticks_remaining, 1));
        var remaining = coerceInt(raw.ticks_remaining, total);
        if (remaining < 0) remaining = 0;
        if (remaining > total) remaining = total;
        return {
            upgrade_id: String(raw.upgrade_id),
            ticks_remaining: remaining,
            task_ticks_total: total,
            stamina_per_tick: Math.max(0, Number(raw.stamina_per_tick != null ? raw.stamina_per_tick : 5) || 0)
        };
    }

    function normalizeState(raw) {
        var def = createDefaultState();
        if (!raw || typeof raw !== 'object') return def;

        var capacity = coercePositiveInt(raw.capacity, def.capacity);
        var slots = Array.isArray(raw.slots) ? raw.slots.slice() : [];
        if (slots.length > capacity) slots.length = capacity;
        while (slots.length < capacity) slots.push(null);

        var settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
        var normalized = {
            capacity: capacity,
            slots: slots,
            unlocked_qol_ids: mergeUniqueIds(
                getBaseFreeQolIdsFromTable(),
                normalizeStringArray(raw.unlocked_qol_ids, def.unlocked_qol_ids)
            ),
            unlocked_upgrade_ids: normalizeStringArray(raw.unlocked_upgrade_ids, []),
            discovered_upgrade_ids: normalizeStringArray(raw.discovered_upgrade_ids, []),
            initial_route_picked: !!(raw.initial_route_picked === true
                || raw.initial_route_picked === 'true'
                || raw.initial_route_picked === 1),
            initial_route_id: raw.initial_route_id != null && String(raw.initial_route_id) !== ''
                ? String(raw.initial_route_id) : null,
            active_upgrade_task: normalizeActiveUpgradeTask(raw.active_upgrade_task),
            settings: {
                prefer_deduct_warehouse: !!(settings.prefer_deduct_warehouse === true
                    || settings.prefer_deduct_warehouse === 'true'
                    || settings.prefer_deduct_warehouse === 1)
            }
        };
        backfillDiscoveryFromLegacySave(normalized);
        return normalized;
    }

    function createDefaultState() {
        var capacity = getBaseCapacityFromTable();
        var slots = [];
        for (var i = 0; i < capacity; i++) slots.push(null);
        return {
            capacity: capacity,
            slots: slots,
            unlocked_qol_ids: getBaseFreeQolIdsFromTable().slice(),
            unlocked_upgrade_ids: [],
            discovered_upgrade_ids: [],
            initial_route_picked: false,
            initial_route_id: null,
            active_upgrade_task: null,
            settings: { prefer_deduct_warehouse: false }
        };
    }

    function getState() {
        return cloneJsonDeep(ensureState());
    }

    function setState(next) {
        state = normalizeState(next);
        return getState();
    }

    function setUpgradeTable(json) {
        upgradeTable = json && typeof json === 'object' ? json : null;
        if (state) state = normalizeState(state);
    }

    function getCapacity() {
        return ensureState().capacity;
    }

    function getUsedCount() {
        var st = ensureState();
        var n = 0;
        for (var i = 0; i < st.slots.length; i++) {
            if (st.slots[i]) n += 1;
        }
        return n;
    }

    function findEmptySlotIndex() {
        var st = ensureState();
        for (var i = 0; i < st.slots.length; i++) {
            if (!st.slots[i]) return i;
        }
        return -1;
    }

    function findStackSlotForDeposit(inst) {
        if (!inst || !inst.item_id) return -1;
        var tpl = getItemTemplate(inst.item_id);
        if (!isWarehouseStackable(tpl)) return -1;
        var st = ensureState();
        var limit = getWarehouseStackLimit(tpl);
        for (var i = 0; i < st.slots.length; i++) {
            var existing = st.slots[i];
            if (!existing) continue;
            if (!instancesCanStackInWarehouse(existing, inst)) continue;
            var cur = existing.count != null ? coerceInt(existing.count, 1) : 1;
            var add = inst.count != null ? coerceInt(inst.count, 1) : 1;
            if (cur + add <= limit) return i;
        }
        return -1;
    }

    function hasQoL(qolId) {
        if (!qolId) return false;
        var id = String(qolId);
        var free = getBaseFreeQolIdsFromTable();
        for (var i = 0; i < free.length; i++) {
            if (String(free[i]) === id) return true;
        }
        var st = ensureState();
        for (var j = 0; j < st.unlocked_qol_ids.length; j++) {
            if (String(st.unlocked_qol_ids[j]) === id) return true;
        }
        return false;
    }

    function isUpgradeRequirementMet(reqId) {
        if (reqId == null || String(reqId) === '') return true;
        var rid = String(reqId);
        if (rid === 'A0') return true;
        var st = ensureState();
        for (var i = 0; i < st.unlocked_upgrade_ids.length; i++) {
            if (String(st.unlocked_upgrade_ids[i]) === rid) return true;
        }
        return false;
    }

    function getUpgradeEntry(upgradeId) {
        if (!upgradeTable || !upgradeTable.upgrades || typeof upgradeTable.upgrades !== 'object') return null;
        return upgradeTable.upgrades[upgradeId] || null;
    }

    function getTaskDefaultsFromTable() {
        var def = upgradeTable && upgradeTable.task_defaults ? upgradeTable.task_defaults : {};
        return {
            task_ticks: Math.max(1, coerceInt(def.task_ticks, 10)),
            stamina_per_tick: Math.max(0, Number(def.stamina_per_tick != null ? def.stamina_per_tick : 5) || 0),
            panel_tick_ms: Math.max(250, coerceInt(def.panel_tick_ms, 2000))
        };
    }

    function getConstructionPanelTickMs() {
        return getTaskDefaultsFromTable().panel_tick_ms;
    }

    function getUpgradeTaskSpec(entry) {
        var defaults = getTaskDefaultsFromTable();
        if (!entry || typeof entry !== 'object') return defaults;
        return {
            task_ticks: entry.task_ticks != null
                ? Math.max(1, coerceInt(entry.task_ticks, defaults.task_ticks))
                : defaults.task_ticks,
            stamina_per_tick: entry.stamina_per_tick != null
                ? Math.max(0, Number(entry.stamina_per_tick) || 0)
                : defaults.stamina_per_tick
        };
    }

    function getActiveUpgradeTask() {
        var st = ensureState();
        return st.active_upgrade_task ? cloneJsonDeep(st.active_upgrade_task) : null;
    }

    function listUpgradeIds() {
        if (!upgradeTable || !upgradeTable.upgrades || typeof upgradeTable.upgrades !== 'object') return [];
        var ids = Object.keys(upgradeTable.upgrades);
        ids.sort(function (a, b) {
            var ea = upgradeTable.upgrades[a] || {};
            var eb = upgradeTable.upgrades[b] || {};
            var pa = coerceInt(ea.phase, 99);
            var pb = coerceInt(eb.phase, 99);
            if (pa !== pb) return pa - pb;
            return String(a).localeCompare(String(b));
        });
        return ids;
    }

    function getRouteStartsFromTable() {
        if (upgradeTable && upgradeTable.route_pick
            && Array.isArray(upgradeTable.route_pick.route_starts)
            && upgradeTable.route_pick.route_starts.length) {
            return upgradeTable.route_pick.route_starts.map(function (id) { return String(id); });
        }
        return ['U-A1', 'U-C1', 'U-B1'];
    }

    function getUpgradeRequiresExcludingA0(entry) {
        if (!entry || !Array.isArray(entry.requires)) return [];
        var out = [];
        var i;
        for (i = 0; i < entry.requires.length; i++) {
            var rid = String(entry.requires[i]);
            if (rid === 'A0') continue;
            out.push(rid);
        }
        return out;
    }

    function isUpgradeCompleted(upgradeId) {
        if (!upgradeId) return false;
        var uid = String(upgradeId);
        var st = ensureState();
        for (var i = 0; i < st.unlocked_upgrade_ids.length; i++) {
            if (String(st.unlocked_upgrade_ids[i]) === uid) return true;
        }
        return false;
    }

    function pushDiscoveredId(st, upgradeId) {
        if (!st || !upgradeId) return false;
        var uid = String(upgradeId);
        if (!Array.isArray(st.discovered_upgrade_ids)) st.discovered_upgrade_ids = [];
        var i;
        for (i = 0; i < st.discovered_upgrade_ids.length; i++) {
            if (String(st.discovered_upgrade_ids[i]) === uid) return true;
        }
        st.discovered_upgrade_ids.push(uid);
        return true;
    }

    function discoverUpgrade(upgradeId) {
        if (!upgradeId) return false;
        var uid = String(upgradeId);
        if (!getUpgradeEntry(uid)) return false;
        return pushDiscoveredId(ensureState(), uid);
    }

    function isUpgradeCompletedOnState(st, upgradeId) {
        if (!st || !upgradeId) return false;
        var uid = String(upgradeId);
        if (!Array.isArray(st.unlocked_upgrade_ids)) return false;
        var i;
        for (i = 0; i < st.unlocked_upgrade_ids.length; i++) {
            if (String(st.unlocked_upgrade_ids[i]) === uid) return true;
        }
        return false;
    }

    function isUpgradeDiscoveredOnState(st, upgradeId) {
        if (!st || !upgradeId) return false;
        var uid = String(upgradeId);
        if (isUpgradeCompletedOnState(st, uid)) return true;
        if (st.active_upgrade_task && String(st.active_upgrade_task.upgrade_id) === uid) return true;
        if (!Array.isArray(st.discovered_upgrade_ids)) return false;
        var i;
        for (i = 0; i < st.discovered_upgrade_ids.length; i++) {
            if (String(st.discovered_upgrade_ids[i]) === uid) return true;
        }
        return false;
    }

    function refreshDiscoveriesOnState(st) {
        if (!st || !upgradeTable || !upgradeTable.upgrades || typeof upgradeTable.upgrades !== 'object') return;
        var ids = Object.keys(upgradeTable.upgrades);
        var i;
        for (i = 0; i < ids.length; i++) {
            var uid = ids[i];
            if (isUpgradeDiscoveredOnState(st, uid)) continue;
            var entry = upgradeTable.upgrades[uid];
            if (!entry) continue;
            var parents = getUpgradeRequiresExcludingA0(entry);
            if (!parents.length) continue;
            var allDone = true;
            var j;
            for (j = 0; j < parents.length; j++) {
                if (!isUpgradeCompletedOnState(st, parents[j])) allDone = false;
            }
            if (allDone) pushDiscoveredId(st, uid);
        }
    }

    function isUpgradeDiscovered(upgradeId) {
        if (!upgradeId) return false;
        var uid = String(upgradeId);
        if (isUpgradeCompleted(uid)) return true;
        var st = ensureState();
        if (st.active_upgrade_task && String(st.active_upgrade_task.upgrade_id) === uid) return true;
        var i;
        for (i = 0; i < st.discovered_upgrade_ids.length; i++) {
            if (String(st.discovered_upgrade_ids[i]) === uid) return true;
        }
        return false;
    }

    function refreshDiscoveriesAfterUnlock(completedId) {
        refreshDiscoveriesOnState(ensureState());
    }

    function backfillDiscoveryFromLegacySave(st) {
        if (!st || typeof st !== 'object') return;
        if (!Array.isArray(st.discovered_upgrade_ids)) st.discovered_upgrade_ids = [];
        if (st.discovered_upgrade_ids.length > 0) return;

        var hasProgress = (Array.isArray(st.unlocked_upgrade_ids) && st.unlocked_upgrade_ids.length > 0)
            || st.active_upgrade_task != null
            || st.initial_route_picked;

        if (!hasProgress) return;

        st.initial_route_picked = true;
        var i;
        if (Array.isArray(st.unlocked_upgrade_ids)) {
            for (i = 0; i < st.unlocked_upgrade_ids.length; i++) {
                pushDiscoveredId(st, st.unlocked_upgrade_ids[i]);
            }
            refreshDiscoveriesOnState(st);
        }
        if (st.active_upgrade_task && st.active_upgrade_task.upgrade_id) {
            pushDiscoveredId(st, st.active_upgrade_task.upgrade_id);
        }
    }

    function needsInitialRoutePick() {
        var st = ensureState();
        if (st.initial_route_picked) return false;
        if (st.discovered_upgrade_ids.length > 0) return false;
        var starts = getRouteStartsFromTable();
        var i;
        for (i = 0; i < starts.length; i++) {
            if (isUpgradeCompleted(starts[i])) return false;
        }
        return true;
    }

    function pickInitialRoute(upgradeId) {
        if (!upgradeId) return { ok: false, reason: 'invalid_upgrade_id' };
        if (!needsInitialRoutePick()) return { ok: false, reason: 'route_already_picked' };
        var uid = String(upgradeId);
        var starts = getRouteStartsFromTable();
        var valid = false;
        var i;
        for (i = 0; i < starts.length; i++) {
            if (String(starts[i]) === uid) valid = true;
        }
        if (!valid) return { ok: false, reason: 'invalid_route_start' };
        if (!getUpgradeEntry(uid)) return { ok: false, reason: 'unknown_upgrade' };

        var st = ensureState();
        st.initial_route_picked = true;
        st.initial_route_id = uid;
        discoverUpgrade(uid);
        return { ok: true, upgrade_id: uid };
    }

    function listVisibleUpgradeIds() {
        var ids = listUpgradeIds();
        var out = [];
        var i;
        for (i = 0; i < ids.length; i++) {
            if (isUpgradeDiscovered(ids[i])) out.push(ids[i]);
        }
        return out;
    }

    function countItemInContainers(itemId) {
        var IE = getIE();
        if (!IE || !itemId) return 0;
        var want = String(itemId);
        var total = 0;
        var containers = ['pocket', 'vest', 'backpack', 'vehicle'];
        var ci;
        for (ci = 0; ci < containers.length; ci++) {
            var arr = getContainerArray(IE, containers[ci]);
            if (!arr) continue;
            var i;
            for (i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || String(cell.item_id) !== want) continue;
                total += cell.count != null ? coerceInt(cell.count, 1) : 1;
            }
        }
        return total;
    }

    function countItemEverywhere(itemId) {
        return countItem(itemId) + countItemInContainers(itemId);
    }

    function canAffordUpgradeInputs(inputs) {
        var list = Array.isArray(inputs) ? inputs : [];
        var j;
        for (j = 0; j < list.length; j++) {
            var need = list[j];
            if (!need || !need.item_id) continue;
            var want = Math.max(1, coerceInt(need.count, 1));
            if (countItemEverywhere(need.item_id) < want) return false;
        }
        return true;
    }

    function refundConsumedRows(consumed) {
        if (!Array.isArray(consumed) || !consumed.length) return;
        var st = ensureState();
        var IE = getIE();
        var i;
        for (i = consumed.length - 1; i >= 0; i--) {
            var row = consumed[i];
            if (!row || !row.item_id) continue;
            if (row.source === 'warehouse' && row.slotIndex != null) {
                var idx = coerceInt(row.slotIndex, -1);
                if (idx < 0 || idx >= st.slots.length) continue;
                var existing = st.slots[idx];
                if (!existing || existing.item_id !== row.item_id) {
                    st.slots[idx] = row.backup ? copyItemInstance(row.backup) : {
                        item_id: row.item_id,
                        count: row.count
                    };
                } else {
                    existing.count = (existing.count != null ? coerceInt(existing.count, 1) : 1)
                        + (row.count != null ? coerceInt(row.count, 1) : 1);
                }
                continue;
            }
            if (row.source === 'container' && IE && typeof IE.putItemIntoDefaultContainer === 'function') {
                IE.putItemIntoDefaultContainer({
                    item_id: row.item_id,
                    count: row.count != null ? coerceInt(row.count, 1) : 1
                });
            }
        }
    }

    function consumeFromWarehouseSlots(itemId, needCount) {
        var want = String(itemId || '').trim();
        var remaining = Math.max(1, coerceInt(needCount, 1));
        if (!want || remaining < 1) return { ok: false, reason: 'invalid_request' };

        var st = ensureState();
        var consumed = [];
        var i;
        for (i = 0; i < st.slots.length && remaining > 0; i++) {
            var cell = st.slots[i];
            if (!cell || String(cell.item_id) !== want) continue;
            var have = cell.count != null ? coerceInt(cell.count, 1) : 1;
            var take = Math.min(have, remaining);
            consumed.push({
                source: 'warehouse',
                slotIndex: i,
                item_id: want,
                count: take,
                backup: copyItemInstance(cell)
            });
            if (take >= have) {
                st.slots[i] = null;
            } else {
                cell.count = have - take;
            }
            remaining -= take;
        }
        if (remaining > 0) {
            refundConsumedRows(consumed);
            return { ok: false, reason: 'insufficient_items', consumed: [] };
        }
        return { ok: true, consumed: consumed };
    }

    function consumeFromContainerStacks(itemId, needCount) {
        var IE = getIE();
        if (!IE || typeof IE.takeItemFromContainer !== 'function') {
            return { ok: false, reason: 'no_inventory' };
        }
        var want = String(itemId || '').trim();
        var remaining = Math.max(1, coerceInt(needCount, 1));
        if (!want || remaining < 1) return { ok: false, reason: 'invalid_request' };

        var consumed = [];
        var containers = ['pocket', 'vest', 'backpack', 'vehicle'];

        while (remaining > 0) {
            var pick = null;
            var ci;
            for (ci = 0; ci < containers.length; ci++) {
                var containerId = containers[ci];
                var arr = getContainerArray(IE, containerId);
                if (!arr) continue;
                var idx;
                for (idx = 0; idx < arr.length; idx++) {
                    var cell = arr[idx];
                    if (!cell || String(cell.item_id) !== want) continue;
                    pick = {
                        container: containerId,
                        index: idx,
                        count: cell.count != null ? coerceInt(cell.count, 1) : 1
                    };
                    break;
                }
                if (pick) break;
            }
            if (!pick) {
                refundConsumedRows(consumed);
                return { ok: false, reason: 'insufficient_items', consumed: [] };
            }
            var take = Math.min(remaining, pick.count);
            var n;
            for (n = 0; n < take; n++) {
                var taken = IE.takeItemFromContainer(pick.container, pick.index);
                if (!taken || !taken.success) {
                    refundConsumedRows(consumed);
                    return { ok: false, reason: 'take_failed', consumed: [] };
                }
            }
            consumed.push({
                source: 'container',
                container: pick.container,
                index: pick.index,
                item_id: want,
                count: take
            });
            remaining -= take;
        }
        return { ok: true, consumed: consumed };
    }

    function consumeUpgradeInputs(inputs) {
        var list = Array.isArray(inputs) ? inputs : [];
        if (!list.length) return { ok: true, consumed: [] };
        if (!canAffordUpgradeInputs(list)) return { ok: false, reason: 'insufficient_items' };

        var st = ensureState();
        var preferWarehouse = !!st.settings.prefer_deduct_warehouse;
        var sourceOrder = preferWarehouse
            ? ['warehouse', 'containers']
            : ['containers', 'warehouse'];
        var allConsumed = [];
        var reqIdx;

        for (reqIdx = 0; reqIdx < list.length; reqIdx++) {
            var req = list[reqIdx];
            var itemId = String(req.item_id || '').trim();
            var remaining = Math.max(1, coerceInt(req.count, 1));
            if (!itemId || remaining < 1) continue;

            var si;
            for (si = 0; si < sourceOrder.length && remaining > 0; si++) {
                var src = sourceOrder[si];
                if (src === 'warehouse') {
                    var whPay = consumeFromWarehouseSlots(itemId, remaining);
                    if (!whPay.ok) continue;
                    allConsumed = allConsumed.concat(whPay.consumed || []);
                    remaining -= (whPay.consumed || []).reduce(function (sum, row) {
                        return sum + (row.count != null ? coerceInt(row.count, 1) : 1);
                    }, 0);
                } else if (src === 'containers') {
                    var ctPay = consumeFromContainerStacks(itemId, remaining);
                    if (!ctPay.ok) continue;
                    allConsumed = allConsumed.concat(ctPay.consumed || []);
                    remaining -= (ctPay.consumed || []).reduce(function (sum, row) {
                        return sum + (row.count != null ? coerceInt(row.count, 1) : 1);
                    }, 0);
                }
            }
            if (remaining > 0) {
                refundConsumedRows(allConsumed);
                return { ok: false, reason: 'insufficient_items', consumed: [] };
            }
        }
        return { ok: true, consumed: allConsumed };
    }

    function getStaminaNow() {
        var Surv = global.Survival;
        if (!Surv || typeof Surv.getState !== 'function') return 0;
        var st = Surv.getState();
        return st && st.stamina != null ? Number(st.stamina) : 0;
    }

    function canAffordTaskStamina(spec) {
        var taskSpec = spec || getTaskDefaultsFromTable();
        var ticks = taskSpec.task_ticks != null ? Math.max(1, coerceInt(taskSpec.task_ticks, 10)) : 10;
        var per = taskSpec.stamina_per_tick != null ? Math.max(0, Number(taskSpec.stamina_per_tick) || 0) : 5;
        return getStaminaNow() >= ticks * per;
    }

    function getUpgradeStatus(upgradeId) {
        if (!upgradeId) return 'locked';
        var entry = getUpgradeEntry(upgradeId);
        if (!entry) return 'locked';

        if (!isUpgradeDiscovered(upgradeId)) return 'hidden';

        if (isUpgradeCompleted(upgradeId)) return 'completed';

        var st = ensureState();
        if (st.active_upgrade_task) {
            if (String(st.active_upgrade_task.upgrade_id) === String(upgradeId)) return 'in_progress';
            return 'locked';
        }

        if (entry.requires_story === true) return 'locked';

        var requires = Array.isArray(entry.requires) ? entry.requires : [];
        var i;
        for (i = 0; i < requires.length; i++) {
            if (!isUpgradeRequirementMet(requires[i])) return 'locked';
        }

        var inputs = Array.isArray(entry.inputs) ? entry.inputs : [];
        if (inputs.length && !canAffordUpgradeInputs(inputs)) return 'insufficient';

        if (!canAffordTaskStamina(getUpgradeTaskSpec(entry))) return 'insufficient';

        return 'available';
    }

    function startUpgrade(upgradeId) {
        if (!upgradeId) return { ok: false, reason: 'invalid_upgrade_id' };
        var uid = String(upgradeId);
        var entry = getUpgradeEntry(uid);
        if (!entry) return { ok: false, reason: 'unknown_upgrade' };

        var st = ensureState();
        if (st.active_upgrade_task) return { ok: false, reason: 'task_busy' };

        var status = getUpgradeStatus(uid);
        if (status === 'hidden') return { ok: false, reason: 'not_discovered' };
        if (status === 'completed') return { ok: false, reason: 'already_completed' };
        if (status === 'in_progress') return { ok: false, reason: 'already_in_progress' };
        if (status === 'locked') return { ok: false, reason: 'locked' };
        if (status === 'insufficient') return { ok: false, reason: 'insufficient_items' };

        var inputs = Array.isArray(entry.inputs) ? entry.inputs : [];
        var pay = consumeUpgradeInputs(inputs);
        if (!pay.ok) return { ok: false, reason: pay.reason || 'insufficient_items' };

        var taskSpec = getUpgradeTaskSpec(entry);
        if (!canAffordTaskStamina(taskSpec)) {
            refundConsumedRows(pay.consumed);
            return { ok: false, reason: 'insufficient_stamina' };
        }

        st.active_upgrade_task = {
            upgrade_id: uid,
            ticks_remaining: taskSpec.task_ticks,
            task_ticks_total: taskSpec.task_ticks,
            stamina_per_tick: taskSpec.stamina_per_tick
        };
        return { ok: true, upgrade_id: uid, task: cloneJsonDeep(st.active_upgrade_task) };
    }

    function tickConstructionTask(ctx) {
        var st = ensureState();
        if (!st.active_upgrade_task) return { ok: true, advanced: false, reason: 'no_task' };

        var task = st.active_upgrade_task;
        var staminaPerTick = task.stamina_per_tick != null
            ? Math.max(0, Number(task.stamina_per_tick) || 0)
            : getTaskDefaultsFromTable().stamina_per_tick;

        var getStamina = ctx && typeof ctx.getStamina === 'function' ? ctx.getStamina : getStaminaNow;
        var setStamina = ctx && typeof ctx.setStamina === 'function' ? ctx.setStamina : null;

        if (staminaPerTick > 0) {
            var stamina = Number(getStamina()) || 0;
            if (stamina < staminaPerTick) {
                return { ok: true, advanced: false, reason: 'insufficient_stamina' };
            }
            if (setStamina) {
                setStamina(Math.max(0, stamina - staminaPerTick));
            }
        }

        task.ticks_remaining = Math.max(0, coerceInt(task.ticks_remaining, 0) - 1);
        if (task.ticks_remaining <= 0) {
            var upgradeId = task.upgrade_id;
            st.active_upgrade_task = null;
            var unlockResult = unlockUpgrade(upgradeId);
            return {
                ok: true,
                advanced: true,
                completed: true,
                upgrade_id: upgradeId,
                unlock: unlockResult
            };
        }
        return {
            ok: true,
            advanced: true,
            completed: false,
            ticks_remaining: task.ticks_remaining,
            upgrade_id: task.upgrade_id
        };
    }

    function refundConsumed(consumed) {
        refundConsumedRows(consumed);
    }

    function consumeItems(requests) {
        var list = Array.isArray(requests) ? requests : [];
        if (!list.length) return { ok: true, consumed: [] };
        return consumeUpgradeInputs(list);
    }

    function unlockUpgrade(upgradeId) {
        if (!upgradeId) return { ok: false, reason: 'invalid_upgrade_id' };
        var entry = getUpgradeEntry(upgradeId);
        if (!entry) return { ok: false, reason: 'unknown_upgrade' };

        var requires = Array.isArray(entry.requires) ? entry.requires : [];
        for (var i = 0; i < requires.length; i++) {
            if (!isUpgradeRequirementMet(requires[i])) {
                return { ok: false, reason: 'requires_not_met', missing: String(requires[i]) };
            }
        }

        var st = ensureState();
        var uid = String(upgradeId);
        for (var j = 0; j < st.unlocked_upgrade_ids.length; j++) {
            if (String(st.unlocked_upgrade_ids[j]) === uid) {
                return { ok: true, already: true };
            }
        }

        st.unlocked_upgrade_ids.push(uid);
        if (Array.isArray(entry.qol_ids)) {
            st.unlocked_qol_ids = mergeUniqueIds(st.unlocked_qol_ids, entry.qol_ids);
        }
        if (entry.capacity_after != null) {
            var newCap = coercePositiveInt(entry.capacity_after, st.capacity);
            if (newCap > st.capacity) {
                while (st.slots.length < newCap) st.slots.push(null);
                st.capacity = newCap;
            }
        }
        refreshDiscoveriesAfterUnlock(uid);
        return { ok: true, already: false };
    }

    function countItem(itemId) {
        if (!itemId) return 0;
        var want = String(itemId);
        var st = ensureState();
        var total = 0;
        for (var i = 0; i < st.slots.length; i++) {
            var cell = st.slots[i];
            if (!cell || String(cell.item_id) !== want) continue;
            total += cell.count != null ? coerceInt(cell.count, 1) : 1;
        }
        return total;
    }

    function canDepositInstance(inst) {
        if (!inst || !inst.item_id) return false;
        var st = ensureState();
        if (findStackSlotForDeposit(inst) >= 0) return true;
        return findEmptySlotIndex() >= 0;
    }

    function depositFromInstance(inst, opts) {
        var options = opts || {};
        if (!inst || !inst.item_id) return { ok: false, reason: 'invalid_instance' };

        var st = ensureState();
        var remaining = copyItemInstance(inst);
        if (!remaining) return { ok: false, reason: 'invalid_instance' };

        var useAutoStack = options.autoStack !== false && hasQoL('deposit_auto_stack');
        var deposited = 0;
        var lastSlot = -1;

        while (remaining && remaining.count > 0) {
            var targetIdx = useAutoStack ? findStackSlotForDeposit(remaining) : -1;
            if (targetIdx < 0) {
                targetIdx = findEmptySlotIndex();
                if (targetIdx < 0) break;
                st.slots[targetIdx] = copyItemInstance(remaining);
                if (!st.slots[targetIdx]) break;
                deposited += st.slots[targetIdx].count != null ? coerceInt(st.slots[targetIdx].count, 1) : 1;
                lastSlot = targetIdx;
                remaining = null;
                break;
            }

            var existing = st.slots[targetIdx];
            var tpl = getItemTemplate(remaining.item_id);
            var limit = getWarehouseStackLimit(tpl);
            var cur = existing.count != null ? coerceInt(existing.count, 1) : 1;
            var add = remaining.count != null ? coerceInt(remaining.count, 1) : 1;
            var space = limit - cur;
            if (space <= 0) break;
            var move = Math.min(space, add);
            existing.count = cur + move;
            deposited += move;
            lastSlot = targetIdx;
            remaining.count = add - move;
            if (remaining.count <= 0) remaining = null;
            if (remaining && !useAutoStack) break;
        }

        if (deposited <= 0) return { ok: false, reason: 'warehouse_full' };
        if (remaining && remaining.count > 0) {
            return { ok: true, partial: true, deposited: deposited, remainder: remaining, slotIndex: lastSlot };
        }
        return { ok: true, deposited: deposited, slotIndex: lastSlot };
    }

    function getContainerArray(IE, containerType) {
        if (!IE) return null;
        if (containerType === 'pocket' && typeof IE.getPocketArray === 'function') return IE.getPocketArray();
        if (containerType === 'vest' && typeof IE.getVestArray === 'function') return IE.getVestArray();
        if (containerType === 'backpack' && typeof IE.getBackpackArray === 'function') return IE.getBackpackArray();
        if (containerType === 'vehicle') {
            if (typeof IE.getState !== 'function') return null;
            var st = IE.getState();
            if (!st || !st.bound_vehicle_id) return null;
            return Array.isArray(st.inventory_vehicle) ? st.inventory_vehicle : null;
        }
        return null;
    }

    function clearContainerCell(IE, containerType, index) {
        if (!IE || typeof IE.getState !== 'function' || typeof IE.setState !== 'function') return false;
        var key = containerType === 'vehicle' ? 'inventory_vehicle'
            : containerType === 'backpack' ? 'inventory_backpack'
                : containerType === 'vest' ? 'inventory_vest'
                    : containerType === 'pocket' ? 'inventory_pocket' : null;
        if (!key) return false;
        var st = IE.getState();
        if (!st || !Array.isArray(st[key]) || index < 0 || index >= st[key].length) return false;
        var next = cloneJsonDeep(st);
        if (!next || !Array.isArray(next[key])) return false;
        next[key] = next[key].slice();
        next[key][index] = null;
        IE.setState(next);
        return true;
    }

    function depositFromContainer(containerType, index) {
        var IE = getIE();
        if (!IE) return { ok: false, reason: 'no_inventory' };
        var arr = getContainerArray(IE, containerType);
        if (!arr || index < 0 || index >= arr.length) return { ok: false, reason: 'invalid_container' };
        var cell = arr[index];
        if (!cell || !cell.item_id) return { ok: false, reason: 'empty_cell' };

        var inst = copyItemInstance(cell);
        if (!inst) return { ok: false, reason: 'invalid_instance' };

        var result = depositFromInstance(inst);
        if (!result.ok) return result;

        if (!clearContainerCell(IE, containerType, index)) {
            return { ok: false, reason: 'clear_container_failed' };
        }
        return result;
    }

    function getPlayerGroundPos() {
        if (global.GameEngine && typeof global.GameEngine.getState === 'function') {
            var eng = global.GameEngine.getState();
            if (eng && eng.mapId != null) {
                return {
                    mapId: String(eng.mapId),
                    x: coerceInt(eng.x, 0),
                    y: coerceInt(eng.y, 0)
                };
            }
        }
        return null;
    }

    function isCurrentMapDungeon() {
        var mapId = '';
        if (global.GameEngine && typeof global.GameEngine.getState === 'function') {
            var eng = global.GameEngine.getState();
            if (eng && eng.mapId != null) mapId = String(eng.mapId);
        }
        if (!mapId) return false;
        if (/dungeon|地牢/i.test(mapId)) return true;
        if (global.GameEngine && typeof global.GameEngine.getMaps === 'function') {
            var maps = global.GameEngine.getMaps();
            var info = maps && maps[mapId];
            if (info && typeof info === 'object') {
                if (info.is_dungeon === true) return true;
                if (String(info.map_type || '').toLowerCase() === 'dungeon') return true;
                if (String(info.region_type || '').toLowerCase() === 'dungeon') return true;
                if (Array.isArray(info.tags)) {
                    for (var ti = 0; ti < info.tags.length; ti++) {
                        if (String(info.tags[ti] || '').toLowerCase() === 'dungeon') return true;
                    }
                }
            }
        }
        return false;
    }

    function isOutpostMode() {
        return hasQoL('qol_dungeon_access') && isCurrentMapDungeon();
    }

    function setPreferDeductWarehouse(prefer) {
        var st = ensureState();
        st.settings.prefer_deduct_warehouse = !!prefer;
        return st.settings.prefer_deduct_warehouse;
    }

    function getPreferDeductWarehouse() {
        var st = ensureState();
        return !!(st.settings && st.settings.prefer_deduct_warehouse);
    }

    function setSlotWarehouseMeta(slotIndex, patch) {
        if (!hasQoL('qol_lock_and_pin')) return { ok: false, reason: 'qol_locked' };
        var st = ensureState();
        var idx = coerceInt(slotIndex, -1);
        if (idx < 0 || idx >= st.slots.length) return { ok: false, reason: 'invalid_slot' };
        var cell = st.slots[idx];
        if (!cell || !cell.item_id) return { ok: false, reason: 'empty_slot' };
        if (patch && patch.starred != null) cell.warehouse_starred = !!patch.starred;
        if (patch && patch.locked != null) cell.warehouse_locked = !!patch.locked;
        return { ok: true, starred: !!cell.warehouse_starred, locked: !!cell.warehouse_locked };
    }

    function toggleSlotStarred(slotIndex) {
        var st = ensureState();
        var idx = coerceInt(slotIndex, -1);
        if (idx < 0 || idx >= st.slots.length) return { ok: false, reason: 'invalid_slot' };
        var cell = st.slots[idx];
        if (!cell || !cell.item_id) return { ok: false, reason: 'empty_slot' };
        return setSlotWarehouseMeta(idx, { starred: !cell.warehouse_starred });
    }

    function toggleSlotLocked(slotIndex) {
        var st = ensureState();
        var idx = coerceInt(slotIndex, -1);
        if (idx < 0 || idx >= st.slots.length) return { ok: false, reason: 'invalid_slot' };
        var cell = st.slots[idx];
        if (!cell || !cell.item_id) return { ok: false, reason: 'empty_slot' };
        return setSlotWarehouseMeta(idx, { locked: !cell.warehouse_locked });
    }

    function tidySlots() {
        if (!hasQoL('qol_tidy_one_click')) return { ok: false, reason: 'qol_locked' };

        var st = ensureState();
        var cap = st.capacity;
        var lockedByIndex = [];
        var unlocked = [];
        var i;
        for (i = 0; i < st.slots.length; i++) {
            var cell = st.slots[i];
            if (!cell || !cell.item_id) continue;
            var copy = copyItemInstance(cell);
            if (!copy) continue;
            if (copy.warehouse_locked) {
                lockedByIndex.push({ index: i, inst: copy });
            } else {
                unlocked.push(copy);
            }
        }

        unlocked.sort(function (a, b) {
            var ta = getItemTemplate(a.item_id);
            var tb = getItemTemplate(b.item_id);
            var ca = ta && ta.category ? String(ta.category) : '';
            var cb = tb && tb.category ? String(tb.category) : '';
            if (ca !== cb) return ca.localeCompare(cb);
            return String(a.item_id).localeCompare(String(b.item_id));
        });

        var merged = [];
        for (i = 0; i < unlocked.length; i++) {
            var cur = unlocked[i];
            var placed = false;
            var m;
            for (m = 0; m < merged.length; m++) {
                if (!instancesCanStackInWarehouse(merged[m], cur)) continue;
                var tpl = getItemTemplate(cur.item_id);
                var limit = getWarehouseStackLimit(tpl);
                var curCount = merged[m].count != null ? coerceInt(merged[m].count, 1) : 1;
                var addCount = cur.count != null ? coerceInt(cur.count, 1) : 1;
                if (curCount + addCount <= limit) {
                    merged[m].count = curCount + addCount;
                    placed = true;
                    break;
                }
            }
            if (!placed) merged.push(cur);
        }

        var newSlots = [];
        for (i = 0; i < cap; i++) newSlots.push(null);
        for (i = 0; i < lockedByIndex.length; i++) {
            var lb = lockedByIndex[i];
            if (lb.index >= 0 && lb.index < cap) newSlots[lb.index] = lb.inst;
        }
        var slotCursor = 0;
        for (i = 0; i < merged.length; i++) {
            while (slotCursor < cap && newSlots[slotCursor]) slotCursor += 1;
            if (slotCursor >= cap) break;
            newSlots[slotCursor] = merged[i];
            slotCursor += 1;
        }
        st.slots = newSlots;
        return { ok: true, packed: merged.length + lockedByIndex.length };
    }

    function restoreContainerCell(IE, containerType, index, item) {
        if (!IE || !item || !item.item_id) return false;
        var arr = getContainerArray(IE, containerType);
        if (!arr || index < 0 || index >= arr.length) return false;
        if (!arr[index]) {
            arr[index] = copyItemInstance(item);
            return !!arr[index];
        }
        var existing = arr[index];
        if (instancesCanStackInWarehouse(existing, item)) {
            var tpl = getItemTemplate(item.item_id);
            var limit = getWarehouseStackLimit(tpl);
            var cur = existing.count != null ? coerceInt(existing.count, 1) : 1;
            var add = item.count != null ? coerceInt(item.count, 1) : 1;
            if (cur + add <= limit) {
                existing.count = cur + add;
                return true;
            }
        }
        return false;
    }

    function depositOneFromContainer(containerType, index) {
        var IE = getIE();
        if (!IE || typeof IE.takeItemFromContainer !== 'function') {
            return { ok: false, reason: 'no_inventory' };
        }
        var arr = getContainerArray(IE, containerType);
        if (!arr || index < 0 || index >= arr.length) return { ok: false, reason: 'invalid_container' };
        if (!arr[index] || !arr[index].item_id) return { ok: false, reason: 'empty_cell' };

        var taken = IE.takeItemFromContainer(containerType, index);
        if (!taken || !taken.success || !taken.item) return { ok: false, reason: 'empty_cell' };

        var inst = copyItemInstance(taken.item);
        if (!inst) return { ok: false, reason: 'invalid_instance' };

        var result = depositFromInstance(inst);
        if (!result.ok) {
            restoreContainerCell(IE, containerType, index, inst);
            return result;
        }
        return result;
    }

    function withdrawSlotSaturated(slotIndex) {
        if (!hasQoL('qol_withdraw_fill')) return { ok: false, reason: 'qol_locked' };
        if (isOutpostMode()) return { ok: false, reason: 'outpost_withdraw_blocked' };

        var total = 0;
        var idx = coerceInt(slotIndex, -1);
        while (true) {
            var st = ensureState();
            if (idx < 0 || idx >= st.slots.length) break;
            var cell = st.slots[idx];
            if (!cell || !cell.item_id) break;
            var r = withdrawSlot(idx, 1);
            if (!r.ok) break;
            total += r.withdrawn != null ? coerceInt(r.withdrawn, 1) : 1;
        }
        if (total <= 0) return { ok: false, reason: 'inventory_full', withdrawn: 0 };
        return { ok: true, withdrawn: total };
    }

    function withdrawSlot(slotIndex, count) {
        if (isOutpostMode()) return { ok: false, reason: 'outpost_withdraw_blocked' };

        var st = ensureState();
        var idx = coerceInt(slotIndex, -1);
        if (idx < 0 || idx >= st.slots.length) return { ok: false, reason: 'invalid_slot' };
        var cell = st.slots[idx];
        if (!cell || !cell.item_id) return { ok: false, reason: 'empty_slot' };
        if (cell.warehouse_locked) return { ok: false, reason: 'slot_locked' };

        var IE = getIE();
        if (!IE || typeof IE.putItemIntoDefaultContainer !== 'function') {
            return { ok: false, reason: 'no_inventory' };
        }

        var total = cell.count != null ? coerceInt(cell.count, 1) : 1;
        var take = count != null ? coerceInt(count, total) : total;
        if (take < 1) return { ok: false, reason: 'invalid_count' };
        if (take > total) take = total;

        var slotBackup = copyItemInstance(cell);
        var withdrawn = copyItemInstance(cell);
        if (!withdrawn || !slotBackup) return { ok: false, reason: 'invalid_instance' };
        withdrawn.count = take;

        if (take >= total) {
            st.slots[idx] = null;
        } else {
            cell.count = total - take;
        }

        var placed = IE.putItemIntoDefaultContainer(withdrawn);
        if (placed && placed.placed) {
            return { ok: true, placed: placed, withdrawn: take };
        }

        if (placed && placed.dropped) {
            var pos = getPlayerGroundPos();
            if (pos && typeof IE.addItemToGround === 'function') {
                IE.addItemToGround(pos.mapId, pos.x, pos.y, withdrawn);
                return { ok: true, placed: { placed: false, dropped: true }, withdrawn: take };
            }
        }

        st.slots[idx] = slotBackup;
        return { ok: false, reason: 'inventory_full', withdrawn: 0 };
    }

    global.HideoutWarehouse = {
        setUpgradeTable: setUpgradeTable,
        createDefaultState: createDefaultState,
        getState: getState,
        setState: setState,
        getCapacity: getCapacity,
        getUsedCount: getUsedCount,
        findEmptySlotIndex: findEmptySlotIndex,
        getWarehouseStackLimit: getWarehouseStackLimit,
        isWarehouseStackable: isWarehouseStackable,
        canDepositInstance: canDepositInstance,
        depositFromInstance: depositFromInstance,
        depositFromContainer: depositFromContainer,
        withdrawSlot: withdrawSlot,
        hasQoL: hasQoL,
        unlockUpgrade: unlockUpgrade,
        countItem: countItem,
        countItemEverywhere: countItemEverywhere,
        listUpgradeIds: listUpgradeIds,
        listVisibleUpgradeIds: listVisibleUpgradeIds,
        getRouteStarts: getRouteStartsFromTable,
        needsInitialRoutePick: needsInitialRoutePick,
        pickInitialRoute: pickInitialRoute,
        isUpgradeDiscovered: isUpgradeDiscovered,
        discoverUpgrade: discoverUpgrade,
        getUpgradeEntry: getUpgradeEntry,
        getUpgradeStatus: getUpgradeStatus,
        getActiveUpgradeTask: getActiveUpgradeTask,
        getConstructionPanelTickMs: getConstructionPanelTickMs,
        startUpgrade: startUpgrade,
        tickConstructionTask: tickConstructionTask,
        consumeItems: consumeItems,
        refundConsumed: refundConsumed,
        canAffordTaskStamina: canAffordTaskStamina,
        getSpoilageTicksFromTemplate: getSpoilageTicksFromTemplate,
        isPerishableItemId: isPerishableItemId,
        hasColdStorage: hasColdStorage,
        ensureSpoilageElapsedOnInstance: ensureSpoilageElapsedOnInstance,
        tickSpoilage: tickSpoilage,
        isOutpostMode: isOutpostMode,
        isCurrentMapDungeon: isCurrentMapDungeon,
        setPreferDeductWarehouse: setPreferDeductWarehouse,
        getPreferDeductWarehouse: getPreferDeductWarehouse,
        tidySlots: tidySlots,
        setSlotWarehouseMeta: setSlotWarehouseMeta,
        toggleSlotStarred: toggleSlotStarred,
        toggleSlotLocked: toggleSlotLocked,
        depositOneFromContainer: depositOneFromContainer,
        withdrawSlotSaturated: withdrawSlotSaturated
    };
})(typeof window !== 'undefined' ? window : globalThis);
