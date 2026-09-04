/**
 * StationContext — 站点上下文与格位探测（scene-app 组合根化拆解 ②-准备刀）
 *
 * 来源：自 js/scene-app.js 迁出（21 函数 + 2 解锁 flag 常量）。语义零变。
 *
 * 职责：
 * - 邻格扫描 forEachAdjacentCell / findAdjacentStandableCellAround
 * - 注解文本判定（烹饪/制药/制肥/床）
 * - 当前站点上下文探测（常驻站注解 / 临时灶台实体；仅邻接交互口径）
 * - 修复门控（主灶台绑定设施 NPC + 解锁 flag：is*UiBlockedByRepair*）
 * - 格位谓词（isOn*StationTile / isAdjacentToWarehouseTile）
 *
 * 依赖：window.GameEngine（E）；CookingStation（temp station 运行时/实体判定）；
 * window.NPCSystem（解锁 flag）；其余均为纯逻辑。
 * 注：pharmacy 上下文的 isPharmacyTempStationEntity/findPharmacyTempStationAt 原为
 * 引用未定义的潜伏死路径（制药无临时台），逐字保留以维持行为等价。
 */
(function (global) {
    'use strict';

    var E = global.GameEngine;

    var COOKING_BASE_STATION_UNLOCK_FLAG = 'cooking_base_station_unlocked';
    var PHARMACY_BASE_STATION_UNLOCK_FLAG = 'npc_station_pharmacy_base_repaired';

    function forEachAdjacentCell(x, y, fn) {
        var dy;
        for (dy = -1; dy <= 1; dy++) {
            var dx;
            for (dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                var rx = (x | 0) + dx;
                var ry = (y | 0) + dy;
                if (fn(rx, ry) === true) return true;
            }
        }
        return false;
    }

    function isCookingStationAnnotationText(s) {
        if (!s) return false;
        var t = String(s).trim();
        if (t === '制药台' || t === '药炉') return false;
        return t === '烹饪台' || t === '灶台' || t === '烹饪灶' || t.indexOf('烹饪') >= 0 || t.indexOf('灶') >= 0;
    }

    function isPharmacyStationAnnotationText(s) {
        if (!s) return false;
        var t = String(s).trim();
        return t === '制药台' || t === '药炉';
    }

    // 口径：烹饪设施仅允许邻接交互，不允许站在同格交互。
    function getCurrentCookingStationContext() {
        if (!E || typeof E.getState !== 'function') return null;
        var st = E.getState();
        var hit = null;
        forEachAdjacentCell(st.x, st.y, function (x, y) {
            var rec = (E.getEntityRecordAt && typeof E.getEntityRecordAt === 'function') ? E.getEntityRecordAt(x, y) : null;
            if (CookingStation.isCookingTempStationEntity(rec)) {
                var temp = CookingStation.findCookingTempStationAt(st.mapId, x, y) || CookingStation.normalizeTempStationEntry(Object.assign({ map_id: st.mapId }, rec));
                hit = {
                    station_type: 'temp',
                    map_id: st.mapId,
                    x: x,
                    y: y,
                    temp_station: temp
                };
                return true;
            }
            var ann = (E.getAnnotationAt && typeof E.getAnnotationAt === 'function') ? E.getAnnotationAt(x, y) : null;
            var s = ann != null ? String(ann) : '';
            if (isCookingStationAnnotationText(s)) {
                hit = {
                    station_type: 'main',
                    map_id: st.mapId,
                    x: x,
                    y: y
                };
                return true;
            }
            return false;
        });
        if (hit) return hit;
        return null;
    }

    function getCurrentPharmacyStationContext() {
        if (!E || typeof E.getState !== 'function') return null;
        var st = E.getState();
        var hit = null;
        forEachAdjacentCell(st.x, st.y, function (x, y) {
            var rec = (E.getEntityRecordAt && typeof E.getEntityRecordAt === 'function') ? E.getEntityRecordAt(x, y) : null;
            if (isPharmacyTempStationEntity(rec)) {
                var temp = findPharmacyTempStationAt(st.mapId, x, y) || CookingStation.normalizeTempStationEntry(Object.assign({ map_id: st.mapId }, rec));
                hit = {
                    station_type: 'temp',
                    map_id: st.mapId,
                    x: x,
                    y: y,
                    temp_station: temp
                };
                return true;
            }
            var ann = (E.getAnnotationAt && typeof E.getAnnotationAt === 'function') ? E.getAnnotationAt(x, y) : null;
            var s = ann != null ? String(ann) : '';
            if (isPharmacyStationAnnotationText(s)) {
                hit = {
                    station_type: 'main',
                    map_id: st.mapId,
                    x: x,
                    y: y
                };
                return true;
            }
            return false;
        });
        if (hit) return hit;
        return null;
    }

    function isCompostStationAnnotationText(s) {
        var t = String(s || '').trim();
        return t === '制肥桶';
    }

    function isBedStationAnnotationText(s) {
        var t = String(s || '').trim();
        return t === '床' || t === '床铺';
    }

    function getCurrentCompostStationContext() {
        if (!E || typeof E.getState !== 'function') return null;
        var st = E.getState();
        var hit = null;
        forEachAdjacentCell(st.x, st.y, function (x, y) {
            var ann = (E.getAnnotationAt && typeof E.getAnnotationAt === 'function') ? E.getAnnotationAt(x, y) : null;
            var s = ann != null ? String(ann) : '';
            if (isCompostStationAnnotationText(s)) {
                hit = {
                    station_type: 'main',
                    map_id: st.mapId,
                    x: x,
                    y: y
                };
                return true;
            }
            return false;
        });
        if (hit) return hit;
        return null;
    }

    function getCurrentBedStationContext() {
        if (!E || typeof E.getState !== 'function') return null;
        var st = E.getState();
        var hit = null;
        forEachAdjacentCell(st.x, st.y, function (x, y) {
            var ann = (E.getAnnotationAt && typeof E.getAnnotationAt === 'function') ? E.getAnnotationAt(x, y) : null;
            var s = ann != null ? String(ann) : '';
            if (isBedStationAnnotationText(s)) {
                hit = {
                    station_type: 'main',
                    map_id: st.mapId,
                    x: x,
                    y: y
                };
                return true;
            }
            return false;
        });
        if (hit) return hit;
        return null;
    }

    /** 当前地图格是否配置了「灶格 → 设施 NPC」绑定（见 map.cooking_station_interact_npc_*） */
    function isCookingStationCellRepairGated(mapId, x, y) {
        if (!E || typeof E.getMap !== 'function' || typeof E.getCookingStationInteractNpcId !== 'function') return false;
        var map = E.getMap();
        if (!map || String(map.map_id || '') !== String(mapId || '')) return false;
        return !!E.getCookingStationInteractNpcId(x | 0, y | 0);
    }

    /** 与烹饪对称：仅当地图为制药格绑定了设施 NPC 时，才走 `PHARMACY_BASE_STATION_UNLOCK_FLAG` 维修门控 */
    function isPharmacyStationCellRepairGated(mapId, x, y) {
        if (!E || typeof E.getMap !== 'function' || typeof E.getPharmacyStationInteractNpcId !== 'function') return false;
        var map = E.getMap();
        if (!map || String(map.map_id || '') !== String(mapId || '')) return false;
        return !!E.getPharmacyStationInteractNpcId(x | 0, y | 0);
    }

    /**
     * 主灶台且地图绑定了设施 NPC 时：未解锁 `COOKING_BASE_STATION_UNLOCK_FLAG` 则禁止打开烹饪 UI、倒水添柴、tryCookAtStation。
     * 临时灶 / 无绑定格不受此限制。
     */
    function isCookingUiBlockedByRepairForContext(stationCtx) {
        if (!stationCtx || stationCtx.station_type === 'temp') return false;
        if (!isCookingStationCellRepairGated(stationCtx.map_id, stationCtx.x, stationCtx.y)) return false;
        if (!global.NPCSystem || typeof global.NPCSystem.isDemoFlagTrue !== 'function') return true;
        return !global.NPCSystem.isDemoFlagTrue(COOKING_BASE_STATION_UNLOCK_FLAG);
    }

    function isPharmacyUiBlockedByRepairForContext(stationCtx) {
        if (!stationCtx || stationCtx.station_type === 'temp') return false;
        if (!isPharmacyStationCellRepairGated(stationCtx.map_id, stationCtx.x, stationCtx.y)) return false;
        if (!global.NPCSystem || typeof global.NPCSystem.isDemoFlagTrue !== 'function') return true;
        return !global.NPCSystem.isDemoFlagTrue(PHARMACY_BASE_STATION_UNLOCK_FLAG);
    }

    function isCookingUiBlockedByRepair() {
        return isCookingUiBlockedByRepairForContext(getCurrentCookingStationContext());
    }

    function isPharmacyUiBlockedByRepair() {
        return isPharmacyUiBlockedByRepairForContext(getCurrentPharmacyStationContext());
    }

    function isAdjacentToWarehouseTile() {
        if (!E || typeof E.getState !== 'function' || typeof E.getAnnotationAt !== 'function') return false;
        var st = E.getState();
        var ok = false;
        forEachAdjacentCell(st.x, st.y, function (x, y) {
            if (E.getAnnotationAt(x, y) === '仓库') {
                ok = true;
                return true;
            }
            return false;
        });
        return ok;
    }

    /** 环绕 R1/R2 找可站立格（NPC 强占工作格挤位用）。 */
    function findAdjacentStandableCellAround(x, y) {
        if (!E || typeof E.canStandAt !== 'function') return null;
        var dirsR1 = [
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
            { dx: 1, dy: -1 },
            { dx: 1, dy: 1 },
            { dx: -1, dy: 1 },
            { dx: -1, dy: -1 }
        ];
        var dirsR2 = [
            { dx: 0, dy: -2 }, { dx: 1, dy: -2 }, { dx: 2, dy: -2 }, { dx: 2, dy: -1 },
            { dx: 2, dy: 0 }, { dx: 2, dy: 1 }, { dx: 2, dy: 2 }, { dx: 1, dy: 2 },
            { dx: 0, dy: 2 }, { dx: -1, dy: 2 }, { dx: -2, dy: 2 }, { dx: -2, dy: 1 },
            { dx: -2, dy: 0 }, { dx: -2, dy: -1 }, { dx: -2, dy: -2 }, { dx: -1, dy: -2 }
        ];
        var i;
        for (i = 0; i < dirsR1.length; i++) {
            var nx = (x | 0) + dirsR1[i].dx;
            var ny = (y | 0) + dirsR1[i].dy;
            if (E.canStandAt(nx, ny)) return { x: nx, y: ny };
        }
        for (i = 0; i < dirsR2.length; i++) {
            var nx2 = (x | 0) + dirsR2[i].dx;
            var ny2 = (y | 0) + dirsR2[i].dy;
            if (E.canStandAt(nx2, ny2)) return { x: nx2, y: ny2 };
        }
        return null;
    }

    function isOnCookingStationTile() {
        return !!getCurrentCookingStationContext();
    }

    function isOnPharmacyStationTile() {
        return !!getCurrentPharmacyStationContext();
    }

    function isOnCompostStationTile() {
        return !!getCurrentCompostStationContext();
    }

    function isOnBedStationTile() {
        return !!getCurrentBedStationContext();
    }

    global.StationContext = {
        forEachAdjacentCell: forEachAdjacentCell,
        isCookingStationAnnotationText: isCookingStationAnnotationText,
        isPharmacyStationAnnotationText: isPharmacyStationAnnotationText,
        getCurrentCookingStationContext: getCurrentCookingStationContext,
        getCurrentPharmacyStationContext: getCurrentPharmacyStationContext,
        isCompostStationAnnotationText: isCompostStationAnnotationText,
        isBedStationAnnotationText: isBedStationAnnotationText,
        getCurrentCompostStationContext: getCurrentCompostStationContext,
        getCurrentBedStationContext: getCurrentBedStationContext,
        isCookingStationCellRepairGated: isCookingStationCellRepairGated,
        isPharmacyStationCellRepairGated: isPharmacyStationCellRepairGated,
        isCookingUiBlockedByRepairForContext: isCookingUiBlockedByRepairForContext,
        isPharmacyUiBlockedByRepairForContext: isPharmacyUiBlockedByRepairForContext,
        isCookingUiBlockedByRepair: isCookingUiBlockedByRepair,
        isPharmacyUiBlockedByRepair: isPharmacyUiBlockedByRepair,
        isAdjacentToWarehouseTile: isAdjacentToWarehouseTile,
        findAdjacentStandableCellAround: findAdjacentStandableCellAround,
        isOnCookingStationTile: isOnCookingStationTile,
        isOnPharmacyStationTile: isOnPharmacyStationTile,
        isOnCompostStationTile: isOnCompostStationTile,
        isOnBedStationTile: isOnBedStationTile
    };
})(typeof window !== 'undefined' ? window : globalThis);
