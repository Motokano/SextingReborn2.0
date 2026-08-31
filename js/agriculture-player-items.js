(function (global) {
    'use strict';

    var CONTAINER_IDS = ['pocket', 'vest', 'backpack', 'vehicle'];
    var SOURCE_HIDEOUT_WAREHOUSE = 'hideout_warehouse';

    function getIE() {
        return global.InventoryEquipment || null;
    }

    function getHW() {
        return global.HideoutWarehouse || null;
    }

    function hasVehicleInventory(IE) {
        if (!IE || typeof IE.getState !== 'function') return false;
        var st = IE.getState();
        return !!(st && st.bound_vehicle_id);
    }

    function getContainerArray(IE, containerId) {
        if (!IE) return [];
        if (containerId === 'pocket' && typeof IE.getPocketArray === 'function') return IE.getPocketArray() || [];
        if (containerId === 'vest' && typeof IE.getVestArray === 'function') return IE.getVestArray() || [];
        if (containerId === 'backpack' && typeof IE.getBackpackArray === 'function') return IE.getBackpackArray() || [];
        if (containerId === 'vehicle') {
            if (!hasVehicleInventory(IE)) return [];
            var st = IE.getState();
            return Array.isArray(st.inventory_vehicle) ? st.inventory_vehicle : [];
        }
        return [];
    }

    function activeContainerIds() {
        var IE = getIE();
        if (!IE) return [];
        var out = ['pocket', 'vest', 'backpack'];
        if (hasVehicleInventory(IE)) out.push('vehicle');
        return out;
    }

    function listWarehouseItemStacks(filterFn) {
        var HW = getHW();
        if (!HW || typeof HW.getState !== 'function') return [];
        var IE = getIE();
        var st = HW.getState();
        if (!st || !Array.isArray(st.slots)) return [];
        var rows = [];
        var i;
        for (i = 0; i < st.slots.length; i++) {
            var cell = st.slots[i];
            if (!cell || !cell.item_id) continue;
            var count = Math.max(0, Math.floor(Number(cell.count) || 0));
            if (count < 1) count = 1;
            var tpl = IE && IE.getItemTemplate ? IE.getItemTemplate(cell.item_id) : null;
            var row = {
                source: SOURCE_HIDEOUT_WAREHOUSE,
                container: SOURCE_HIDEOUT_WAREHOUSE,
                index: i,
                item_id: String(cell.item_id),
                count: count,
                template: tpl || null
            };
            if (typeof filterFn === 'function' && !filterFn(row)) continue;
            rows.push(row);
        }
        return rows;
    }

    /**
     * @param {function({ container: string, index: number, item_id: string, count: number, template: object|null }): boolean} [filterFn]
     * @returns {Array<{ container: string, index: number, item_id: string, count: number, template: object|null }>}
     */
    function listAgricultureItemStacks(filterFn) {
        var IE = getIE();
        var rows = [];
        if (IE) {
            var containers = activeContainerIds();
            var ci;
            for (ci = 0; ci < containers.length; ci++) {
                var containerId = containers[ci];
                var arr = getContainerArray(IE, containerId);
                var i;
                for (i = 0; i < arr.length; i++) {
                    var cell = arr[i];
                    if (!cell || !cell.item_id) continue;
                    var count = Math.max(0, Math.floor(Number(cell.count) || 0));
                    if (count < 1) count = 1;
                    var tpl = IE.getItemTemplate ? IE.getItemTemplate(cell.item_id) : null;
                    var row = {
                        source: containerId,
                        container: containerId,
                        index: i,
                        item_id: String(cell.item_id),
                        count: count,
                        template: tpl || null
                    };
                    if (typeof filterFn === 'function' && !filterFn(row)) continue;
                    rows.push(row);
                }
            }
        }
        var whRows = listWarehouseItemStacks(filterFn);
        if (whRows.length) rows = rows.concat(whRows);
        return rows;
    }

    function isSeedStack(row) {
        var tpl = row && row.template;
        if (!tpl) return false;
        if (String(tpl.sub_category || '').trim() === 'seed') return true;
        if (String(tpl.category || '').trim() === 'seed' && String(tpl.sub_category || '').trim() === 'farming') return true;
        if (String(tpl.category || '').trim() === 'seed') return true;
        var tags = String(tpl.tags || '');
        if (tags.indexOf('farming') >= 0 && tags.indexOf('seed') >= 0) return true;
        return tags.indexOf('seed') >= 0 || tags.indexOf('life_planting') >= 0;
    }

    function isSoilAmendStack(row) {
        var AC = global.AgricultureConfig;
        if (!row || !row.item_id) return false;
        if (AC && typeof AC.getGrantsSoilId === 'function') {
            return !!AC.getGrantsSoilId(row.item_id);
        }
        var tpl = row.template;
        return !!(tpl && tpl.grants_soil_id);
    }

    function isVenturiInjectableStack(row) {
        var AC = global.AgricultureConfig;
        if (!row || !row.item_id || !AC || typeof AC.getInjectableParams !== 'function') return false;
        var p = AC.getInjectableParams(row.item_id);
        return !!(p && p.agriculture_venturi_injectable && p.inject_facility === 'venturi_fertilizer');
    }

    function isJarInjectableStack(row) {
        var AC = global.AgricultureConfig;
        if (!row || !row.item_id || !AC || typeof AC.getInjectableParams !== 'function') return false;
        var p = AC.getInjectableParams(row.item_id);
        return !!(p && p.agriculture_buried_jar_injectable && p.inject_facility === 'buried_pot_jar');
    }

    function listSeeds() {
        return listAgricultureItemStacks(isSeedStack);
    }

    function listSoilAmendments() {
        return listAgricultureItemStacks(isSoilAmendStack);
    }

    function listVenturiInjectables() {
        return listAgricultureItemStacks(isVenturiInjectableStack);
    }

    function listJarInjectables() {
        return listAgricultureItemStacks(isJarInjectableStack);
    }

    function countItemId(itemId) {
        var id = String(itemId || '').trim();
        if (!id) return 0;
        var HW = getHW();
        if (HW && typeof HW.countItemEverywhere === 'function') {
            return HW.countItemEverywhere(id);
        }
        var rows = listAgricultureItemStacks(function (row) {
            return row.item_id === id;
        });
        var total = 0;
        var i;
        for (i = 0; i < rows.length; i++) total += rows[i].count;
        return total;
    }

    function canAffordInputs(inputs) {
        var list = Array.isArray(inputs) ? inputs : [];
        var j;
        for (j = 0; j < list.length; j++) {
            var need = list[j];
            if (!need || !need.item_id) continue;
            var want = Math.max(1, Math.floor(Number(need.count) || 0));
            if (countItemId(need.item_id) < want) return false;
        }
        return true;
    }

    /**
     * @param {string} container
     * @param {number} index
     * @param {number} [count]
     * @returns {{ ok: boolean, reason?: string, item?: object }}
     */
    function mapHideoutConsumedRows(rows) {
        var out = [];
        var i;
        for (i = 0; i < (rows || []).length; i++) {
            var row = rows[i];
            if (!row || !row.item_id) continue;
            out.push({
                source: row.source || SOURCE_HIDEOUT_WAREHOUSE,
                container: SOURCE_HIDEOUT_WAREHOUSE,
                slotIndex: row.slotIndex != null ? row.slotIndex : row.index,
                item_id: String(row.item_id),
                count: Math.max(1, Math.floor(Number(row.count) || 1))
            });
        }
        return out;
    }

    function consumeFromStack(container, index, count) {
        var containerId = String(container || '').trim();
        if (containerId === SOURCE_HIDEOUT_WAREHOUSE) {
            var HW = getHW();
            if (!HW || typeof HW.getState !== 'function' || typeof HW.consumeItems !== 'function') {
                return { ok: false, reason: 'warehouse_unavailable' };
            }
            var idx = Math.floor(Number(index));
            if (idx < 0) return { ok: false, reason: 'invalid_index' };
            var st = HW.getState();
            if (!st || !Array.isArray(st.slots) || idx >= st.slots.length) {
                return { ok: false, reason: 'invalid_index' };
            }
            var cell = st.slots[idx];
            if (!cell || !cell.item_id) return { ok: false, reason: 'empty_slot' };
            var have = Math.max(1, Math.floor(Number(cell.count) || 0));
            var takeN = Math.max(1, Math.floor(Number(count) || 1));
            if (takeN > have) return { ok: false, reason: 'insufficient_count' };
            var pay = HW.consumeItems([{ item_id: cell.item_id, count: takeN }]);
            if (!pay || !pay.ok) return { ok: false, reason: pay && pay.reason ? pay.reason : 'consume_failed' };
            return {
                ok: true,
                item: {
                    item_id: cell.item_id,
                    count: takeN
                },
                consumed: mapHideoutConsumedRows(pay.consumed)
            };
        }

        var IE = getIE();
        if (!IE || typeof IE.takeItemFromContainer !== 'function') {
            return { ok: false, reason: 'inventory_unavailable' };
        }
        if (CONTAINER_IDS.indexOf(containerId) < 0) {
            return { ok: false, reason: 'invalid_container' };
        }
        if (containerId === 'vehicle' && !hasVehicleInventory(IE)) {
            return { ok: false, reason: 'no_vehicle' };
        }
        var idx = Math.floor(Number(index));
        if (idx < 0) return { ok: false, reason: 'invalid_index' };
        var arr = getContainerArray(IE, containerId);
        var cell = arr[idx];
        if (!cell || !cell.item_id) return { ok: false, reason: 'empty_slot' };
        var have = Math.max(1, Math.floor(Number(cell.count) || 0));
        var takeN = Math.max(1, Math.floor(Number(count) || 1));
        if (takeN > have) return { ok: false, reason: 'insufficient_count' };

        var lastTaken = null;
        var n;
        for (n = 0; n < takeN; n++) {
            var taken = IE.takeItemFromContainer(containerId, idx);
            if (!taken.success || !taken.item) return { ok: false, reason: 'take_failed' };
            lastTaken = taken.item;
        }
        return {
            ok: true,
            item: {
                item_id: lastTaken.item_id,
                count: takeN
            }
        };
    }

    /**
     * @param {Array<{ item_id: string, count: number }>} inputs
     * @returns {{ ok: boolean, reason?: string, consumed?: Array<{ container: string, index: number, item_id: string, count: number }> }}
     */
    function consumeInputs(inputs) {
        var list = Array.isArray(inputs) ? inputs : [];
        if (!list.length) return { ok: true, consumed: [] };
        if (!canAffordInputs(list)) return { ok: false, reason: 'insufficient_items' };

        var HW = getHW();
        if (HW && typeof HW.consumeItems === 'function') {
            var pay = HW.consumeItems(list);
            if (!pay || !pay.ok) {
                return { ok: false, reason: pay && pay.reason ? pay.reason : 'insufficient_items', consumed: [] };
            }
            var mapped = [];
            var rawConsumed = pay.consumed || [];
            var ri;
            for (ri = 0; ri < rawConsumed.length; ri++) {
                var row = rawConsumed[ri];
                if (!row || !row.item_id) continue;
                if (row.source === 'warehouse' || row.container === SOURCE_HIDEOUT_WAREHOUSE) {
                    mapped.push({
                        source: SOURCE_HIDEOUT_WAREHOUSE,
                        container: SOURCE_HIDEOUT_WAREHOUSE,
                        slotIndex: row.slotIndex != null ? row.slotIndex : row.index,
                        item_id: String(row.item_id),
                        count: Math.max(1, Math.floor(Number(row.count) || 1))
                    });
                } else {
                    mapped.push({
                        source: row.container || row.source || 'container',
                        container: row.container || 'pocket',
                        index: row.index,
                        item_id: String(row.item_id),
                        count: Math.max(1, Math.floor(Number(row.count) || 1))
                    });
                }
            }
            return { ok: true, consumed: mapped };
        }

        var consumed = [];
        var reqIdx;
        for (reqIdx = 0; reqIdx < list.length; reqIdx++) {
            var req = list[reqIdx];
            var itemId = String(req.item_id || '').trim();
            var remaining = Math.max(1, Math.floor(Number(req.count) || 0));
            if (!itemId || remaining < 1) continue;

            while (remaining > 0) {
                var rows = listAgricultureItemStacks(function (row) {
                    return row.item_id === itemId && row.count > 0;
                });
                if (!rows.length) return { ok: false, reason: 'insufficient_items', consumed: consumed };
                var pick = rows[0];
                var take = Math.min(remaining, pick.count);
                var res = consumeFromStack(pick.container, pick.index, take);
                if (!res.ok) return { ok: false, reason: res.reason || 'consume_failed', consumed: consumed };
                consumed.push({
                    container: pick.container,
                    index: pick.index,
                    item_id: itemId,
                    count: take
                });
                remaining -= take;
            }
        }
        return { ok: true, consumed: consumed };
    }

    /**
     * @param {string} buildId
     * @returns {{ ok: boolean, reason?: string, spec?: object, consumed?: Array }}
     */
    function payBuildCost(buildId) {
        var AC = global.AgricultureConfig;
        if (!AC || typeof AC.getBuildSpec !== 'function') {
            return { ok: false, reason: 'agriculture_config_missing' };
        }
        var spec = AC.getBuildSpec(buildId);
        if (!spec) return { ok: false, reason: 'unknown_build' };
        var pay = consumeInputs(spec.inputs);
        if (!pay.ok) return { ok: false, reason: pay.reason || 'insufficient_items', spec: spec };
        return { ok: true, spec: spec, consumed: pay.consumed || [] };
    }

    /**
     * @param {number} fromLevel
     */
    function payVenturiUpgrade(fromLevel) {
        var AC = global.AgricultureConfig;
        if (!AC || typeof AC.getVenturiUpgradeSpec !== 'function') {
            return { ok: false, reason: 'agriculture_config_missing' };
        }
        var spec = AC.getVenturiUpgradeSpec(fromLevel);
        if (!spec) return { ok: false, reason: 'no_upgrade_step' };
        var pay = consumeInputs(spec.inputs);
        if (!pay.ok) return { ok: false, reason: pay.reason || 'insufficient_items', spec: spec };
        return { ok: true, spec: spec, consumed: pay.consumed || [] };
    }

    function payPoolUpgrade(fromLevel) {
        var AC = global.AgricultureConfig;
        if (!AC || typeof AC.getPoolUpgradeSpec !== 'function') {
            return { ok: false, reason: 'agriculture_config_missing' };
        }
        var spec = AC.getPoolUpgradeSpec(fromLevel);
        if (!spec) return { ok: false, reason: 'no_upgrade_step' };
        var pay = consumeInputs(spec.inputs);
        if (!pay.ok) return { ok: false, reason: pay.reason || 'insufficient_items', spec: spec };
        return { ok: true, spec: spec, consumed: pay.consumed || [] };
    }

    function getStaminaNow() {
        var Surv = global.Survival;
        if (!Surv || typeof Surv.getState !== 'function') return 0;
        var st = Surv.getState();
        return st && st.stamina != null ? Number(st.stamina) : 0;
    }

    function canAffordTaskStamina(spec) {
        var ticks = spec && spec.task_ticks != null ? Math.max(1, Math.floor(Number(spec.task_ticks))) : 10;
        var per = spec && spec.stamina_per_tick != null ? Math.max(0, Number(spec.stamina_per_tick)) : 5;
        return getStaminaNow() >= ticks * per;
    }

    global.AgriculturePlayerItems = {
        SOURCE_HIDEOUT_WAREHOUSE: SOURCE_HIDEOUT_WAREHOUSE,
        CONTAINER_IDS: CONTAINER_IDS.slice(),
        activeContainerIds: activeContainerIds,
        listWarehouseItemStacks: listWarehouseItemStacks,
        listAgricultureItemStacks: listAgricultureItemStacks,
        listSeeds: listSeeds,
        listSoilAmendments: listSoilAmendments,
        listVenturiInjectables: listVenturiInjectables,
        listJarInjectables: listJarInjectables,
        countItemId: countItemId,
        canAffordInputs: canAffordInputs,
        consumeFromStack: consumeFromStack,
        consumeInputs: consumeInputs,
        payBuildCost: payBuildCost,
        payVenturiUpgrade: payVenturiUpgrade,
        payPoolUpgrade: payPoolUpgrade,
        canAffordTaskStamina: canAffordTaskStamina,
        getStaminaNow: getStaminaNow
    };
})(typeof window !== 'undefined' ? window : global);
