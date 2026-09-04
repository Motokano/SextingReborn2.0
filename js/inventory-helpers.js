/**
 * InventoryHelpers — 物品栏纯读 helper（scene-app 组合根化拆解 P1a）
 *
 * 来源：自 js/scene-app.js 原样迁出（findFirstContainerSlotByItemId /
 * getInventoryContainerArray / getInventoryCountByItemId），行为零变。
 * 语义：只读 window.InventoryEquipment（IE）各容器数组与
 * window.HideoutWarehouse 计数，不产生任何状态变更。
 *
 * 拆解动机：烹饪/制药/沤肥站点切片（P1b+）与后续各子系统都需要这些
 * 跨容器查询；把它们从 scene-app 闭包移出后，迁出模块不必反向依赖主 JS。
 *
 * 加载序：须在 scene-app.js 之前加载（index.html 已保证）；本模块只在
 * 调用时读取 window.InventoryEquipment，不要求提前加载 IE。
 */
(function (global) {
    'use strict';

    function getIE() {
        return global.InventoryEquipment || null;
    }

    /** 在 pocket/vest/backpack 三容器中查找第一个匹配 item_id 的槽位。 */
    function findFirstContainerSlotByItemId(itemId) {
        var IE = getIE();
        if (!IE || !itemId) return null;
        var targets = [
            { type: 'pocket', arr: IE.getPocketArray ? IE.getPocketArray() : [] },
            { type: 'vest', arr: IE.getVestArray ? IE.getVestArray() : [] },
            { type: 'backpack', arr: IE.getBackpackArray ? IE.getBackpackArray() : [] }
        ];
        var t, i;
        for (t = 0; t < targets.length; t++) {
            var arr = targets[t].arr;
            if (!Array.isArray(arr)) continue;
            for (i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                if (String(cell.item_id) === String(itemId)) {
                    return { containerType: targets[t].type, index: i };
                }
            }
        }
        return null;
    }

    /** 取指定容器（pocket/vest/backpack）的数组引用；未知类型返回 null。 */
    function getInventoryContainerArray(containerType) {
        var IE = getIE();
        if (!IE) return null;
        var t = containerType != null ? String(containerType) : '';
        if (t === 'pocket') return IE.getPocketArray ? IE.getPocketArray() : null;
        if (t === 'vest') return IE.getVestArray ? IE.getVestArray() : null;
        if (t === 'backpack') return IE.getBackpackArray ? IE.getBackpackArray() : null;
        return null;
    }

    /**
     * 统计 item_id 在「仓库(若有) + pocket/vest/backpack」中的总数。
     * 与原 scene-app 实现一致：优先 HideoutWarehouse.countItemEverywhere，
     * 否则手动遍历三容器（无词条堆叠按 count，无 count 按 1）。
     */
    function getInventoryCountByItemId(itemId) {
        if (!itemId) return 0;
        var HW = global.HideoutWarehouse;
        if (HW && typeof HW.countItemEverywhere === 'function') {
            return HW.countItemEverywhere(itemId);
        }
        var IE = getIE();
        if (!IE) return 0;
        var total = 0;
        var groups = [
            IE.getPocketArray ? IE.getPocketArray() : [],
            IE.getVestArray ? IE.getVestArray() : [],
            IE.getBackpackArray ? IE.getBackpackArray() : []
        ];
        var g, i;
        for (g = 0; g < groups.length; g++) {
            var arr = groups[g];
            if (!Array.isArray(arr)) continue;
            for (i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                if (String(cell.item_id) !== String(itemId)) continue;
                total += (cell.count != null && cell.count > 0) ? parseInt(cell.count, 10) : 1;
            }
        }
        return total;
    }

    /** 按谓词找首个命中槽位（谓词签名 (cell, containerType, index)；原 scene-app findFirstContainerSlotByPredicate）。 */
    function findFirstContainerSlotByPredicate(predicateFn) {
        var IE = getIE();
        if (!IE || typeof predicateFn !== 'function') return null;
        var targets = [
            { type: 'pocket', arr: IE.getPocketArray ? IE.getPocketArray() : [] },
            { type: 'vest', arr: IE.getVestArray ? IE.getVestArray() : [] },
            { type: 'backpack', arr: IE.getBackpackArray ? IE.getBackpackArray() : [] }
        ];
        var t, i;
        for (t = 0; t < targets.length; t++) {
            var arr = targets[t].arr;
            if (!Array.isArray(arr)) continue;
            for (i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                if (predicateFn(cell, targets[t].type, i)) {
                    return { containerType: targets[t].type, index: i, item: cell };
                }
            }
        }
        return null;
    }

    /** 按谓词找全部命中槽位（原 scene-app findAllContainerSlotsByPredicate）。 */
    function findAllContainerSlotsByPredicate(predicateFn) {
        var IE = getIE();
        if (!IE || typeof predicateFn !== 'function') return [];
        var targets = [
            { type: 'pocket', arr: IE.getPocketArray ? IE.getPocketArray() : [] },
            { type: 'vest', arr: IE.getVestArray ? IE.getVestArray() : [] },
            { type: 'backpack', arr: IE.getBackpackArray ? IE.getBackpackArray() : [] }
        ];
        var out = [];
        var t, i;
        for (t = 0; t < targets.length; t++) {
            var arr = targets[t].arr;
            if (!Array.isArray(arr)) continue;
            for (i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                if (predicateFn(cell, targets[t].type, i)) {
                    out.push({ containerType: targets[t].type, index: i, item: cell });
                }
            }
        }
        return out;
    }

    global.InventoryHelpers = {
        findFirstContainerSlotByItemId: findFirstContainerSlotByItemId,
        getInventoryContainerArray: getInventoryContainerArray,
        getInventoryCountByItemId: getInventoryCountByItemId,
        findFirstContainerSlotByPredicate: findFirstContainerSlotByPredicate,
        findAllContainerSlotsByPredicate: findAllContainerSlotsByPredicate
    };
})(typeof window !== 'undefined' ? window : globalThis);
