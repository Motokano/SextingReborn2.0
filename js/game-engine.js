/**
 * 潮碧物语 - 游戏主引擎
 * 负责：地图数据、玩家状态、移动与传送、可走/不可走（blocks）
 * 不负责 DOM 渲染，通过 onChange 回调通知页面刷新。
 */
(function (global) {
    'use strict';

    var CELL_PX = 101;
    var VIEW_W = 1042;
    var VIEW_H = 638;
    var CENTER_OFFSET_X = (VIEW_W / 2) - (CELL_PX / 2);
    var CENTER_OFFSET_Y = (VIEW_H / 2) - (CELL_PX / 2);

    var MAPS = {
        home: {
            map_id: 'home',
            name: '',
            width: 16,
            height: 16,
            blocks: [],
            portals: [
                { x: 8, y: 15, target_map_id: 'field', target_x: 2, target_y: 11, label: '' }
            ]
        },
        field: {
            map_id: 'field',
            name: '',
            width: 25,
            height: 25,
            blocks: [],
            entities: [
                { x: 5, y: 5, entity_id: 'gathering_bush' },
                { x: 7, y: 6, entity_id: 'gathering_grass' },
                { x: 10, y: 10, entity_id: 'gathering_bush' },
                { x: 12, y: 8, entity_id: 'gathering_grass' },
                { x: 15, y: 14, entity_id: 'gathering_bush' }
            ],
            portals: [
                { x: 2, y: 12, target_map_id: 'home', target_x: 8, target_y: 14, label: '' },
                { x: 22, y: 12, target_map_id: 'town', target_x: 8, target_y: 14, label: '' }
            ]
        },
        town: {
            map_id: 'town',
            name: '',
            width: 16,
            height: 16,
            blocks: [],
            portals: [
                { x: 8, y: 15, target_map_id: 'field', target_x: 22, target_y: 11, label: '' }
            ]
        },
        /** 与 data/maps/*.json 的 map_id 一致；启动后由 bootstrapMapsFromJson 合并完整数据 */
        M0_Base_Inside_lv_1: { map_id: 'M0_Base_Inside_lv_1', name: '', width: 16, height: 16, blocks: [], portals: [], disabled: [] },
        M0_Base_Outside_lv_1: { map_id: 'M0_Base_Outside_lv_1', name: '', width: 16, height: 16, blocks: [], portals: [] },
        M0_Field_01: { map_id: 'M0_Field_01', name: '', width: 16, height: 16, blocks: [], portals: [] },
        M0_Field_02: { map_id: 'M0_Field_02', name: '', width: 16, height: 16, blocks: [], portals: [] },
        M0_JInmuTown_01: { map_id: 'M0_JinmuTown_01', name: '', width: 18, height: 18, blocks: [], portals: [] }
    };

    var state = {
        mapId: 'M0_Base_Inside_lv_1',
        x: 10,
        y: 12
    };

    var onChange = function () {};

    function getMap() {
        return MAPS[state.mapId] || null;
    }

    function isDisabled(map, x, y) {
        if (!map || !map.disabled || !map.disabled.length) return false;
        for (var i = 0; i < map.disabled.length; i++) {
            if (map.disabled[i].x === x && map.disabled[i].y === y) return true;
        }
        return false;
    }

    function isBlocked(map, x, y) {
        if (!map || !map.blocks || !map.blocks.length) return false;
        for (var i = 0; i < map.blocks.length; i++) {
            if (map.blocks[i].x === x && map.blocks[i].y === y) return true;
        }
        return false;
    }

    function isWalkable(x, y) {
        var map = getMap();
        if (!map) return false;
        if (x < 0 || x >= map.width || y < 0 || y >= map.height) return false;
        if (isDisabled(map, x, y)) return false;
        if (isBlocked(map, x, y)) return false;
        if (isCookingStationCell(x, y)) return false;
        if (isAgricultureStationCell(x, y)) return false;
        if (isPharmacyFacilityNpcBlockingWalk(x, y)) return false;
        if (isCompostFacilityNpcBlockingWalk(x, y)) return false;
        if (isBedStationCell(x, y)) return false;
        if (isWarehouseStationCell(x, y)) return false;
        return true;
    }

    function getPortalAt(x, y) {
        var map = getMap();
        if (!map || !map.portals) return null;
        for (var i = 0; i < map.portals.length; i++) {
            if (map.portals[i].x === x && map.portals[i].y === y) return map.portals[i];
        }
        return null;
    }

    function getEntityRecordAt(x, y) {
        var map = getMap();
        if (!map || !map.entities) return null;
        for (var i = 0; i < map.entities.length; i++) {
            var e = map.entities[i];
            if (e.x === x && e.y === y) return e;
        }
        return null;
    }

    function getEntityAt(x, y) {
        var e = getEntityRecordAt(x, y);
        return e ? (e.entity_id || null) : null;
    }

    function getNpcAt(x, y) {
        var map = getMap();
        if (!map || !map.npcs) return null;
        for (var i = 0; i < map.npcs.length; i++) {
            var n = map.npcs[i];
            if (n.x === x && n.y === y) return n.npc_id || null;
        }
        return null;
    }

    function getEnemyAt(x, y) {
        var map = getMap();
        if (!map || !map.enemies) return null;
        for (var i = 0; i < map.enemies.length; i++) {
            var n = map.enemies[i];
            if (n.x === x && n.y === y) return n.enemy_id || null;
        }
        return null;
    }

    /** 地图 annotations 键为 "x,y"，与 data/maps/*.json 中一致 */
    function getAnnotationAt(x, y) {
        var map = getMap();
        if (!map || !map.annotations || typeof map.annotations !== 'object') return null;
        var key = x + ',' + y;
        if (!Object.prototype.hasOwnProperty.call(map.annotations, key)) return null;
        var v = map.annotations[key];
        return v != null && v !== '' ? String(v) : null;
    }

    /** 与 scene-app 烹饪邻格判定一致：该格视为设施本体，不可走入（同 NPC 占格） */
    var COOKING_TEMP_STATION_ENTITY_ID = 'cooking_station_temp';

    function isBlockingStationAnnotation(ann) {
        if (ann == null || ann === '') return false;
        var s = String(ann).trim();
        var isCooking = s === '烹饪台' || s === '灶台' || s === '烹饪灶';
        return isCooking;
    }

    /** 固定标注的烹饪台，或临时灶台实体（野外临时灶） */
    function isCookingStationCell(x, y) {
        var ann = getAnnotationAt(x, y);
        if (ann && (String(ann) === '烹饪台' || String(ann).indexOf('烹饪') >= 0 || String(ann).indexOf('灶') >= 0)) return true;
        var rec = getEntityRecordAt(x, y);
        return !!(rec && String(rec.entity_id || '') === COOKING_TEMP_STATION_ENTITY_ID);
    }

    /** 制药台判定：使用标注法 */
    function isPharmacyStationCell(x, y) {
        var ann = getAnnotationAt(x, y);
        if (ann) {
            var s = String(ann).trim();
            if (s === '制药台' || s === '药炉') return true;
        }
        return false;
    }

    /** 制肥桶判定：使用标注法 */
    function isCompostStationCell(x, y) {
        var ann = getAnnotationAt(x, y);
        if (ann) {
            var s = String(ann).trim();
            if (s === '制肥桶') return true;
        }
        return false;
    }

    /** 农业互动点判定：使用标注法（与灶台同口径，格不可走） */
    function isAgricultureStationCell(x, y) {
        var ann = getAnnotationAt(x, y);
        if (ann) {
            var s = String(ann).trim();
            if (s === '农业' || s === '农田' || s.indexOf('农业') >= 0) return true;
        }
        return false;
    }

    /** 床设施判定：使用标注法 */
    function isBedStationCell(x, y) {
        var ann = getAnnotationAt(x, y);
        if (ann) {
            var s = String(ann).trim();
            if (s === '床' || s === '床铺') return true;
        }
        return false;
    }

    /** 藏身处账号仓库设施判定：使用标注法 */
    function isWarehouseStationCell(x, y) {
        var ann = getAnnotationAt(x, y);
        if (ann) {
            var s = String(ann).trim();
            if (s === '仓库') return true;
        }
        return false;
    }

    /**
     * 地图上烹饪格绑定的「设施 NPC」id（与 map.npcs 互斥：格上无实体 NPC 时仍可对灶走 NPC 菜单管线）。
     * 优先 `cooking_station_interact_npc_by_cell["x,y"]`，否则回落 `cooking_station_interact_npc_id`（该图任意烹饪台共用）。
     */
    function getCookingStationInteractNpcId(x, y) {
        var map = getMap();
        if (!map || !isCookingStationCell(x, y)) return null;
        var by = map.cooking_station_interact_npc_by_cell;
        if (by && typeof by === 'object') {
            var k = (x | 0) + ',' + (y | 0);
            if (Object.prototype.hasOwnProperty.call(by, k)) {
                var v = by[k];
                if (v != null && String(v).trim()) return String(v).trim();
            }
        }
        var id = map.cooking_station_interact_npc_id;
        if (id != null && String(id).trim()) return String(id).trim();
        return null;
    }

    /**
     * 地图上制药格绑定的「设施 NPC」id（与 map.npcs 互斥：格上无实体 NPC 时仍可对台走 NPC 菜单管线）。
     * 优先 `pharmacy_station_interact_npc_by_cell["x,y"]`，否则回落 `pharmacy_station_interact_npc_id`。
     */
    function getPharmacyStationInteractNpcId(x, y) {
        var map = getMap();
        if (!map || !isPharmacyStationCell(x, y)) return null;
        var by = map.pharmacy_station_interact_npc_by_cell;
        if (by && typeof by === 'object') {
            var k = (x | 0) + ',' + (y | 0);
            if (Object.prototype.hasOwnProperty.call(by, k)) {
                var v = by[k];
                if (v != null && String(v).trim()) return String(v).trim();
            }
        }
        var pid = map.pharmacy_station_interact_npc_id;
        if (pid != null && String(pid).trim()) return String(pid).trim();
        return null;
    }

    /**
     * 地图上制肥桶格绑定的「设施 NPC」id。
     * 优先 `compost_station_interact_npc_by_cell["x,y"]`，否则回落 `compost_station_interact_npc_id`。
     */
    function getCompostStationInteractNpcId(x, y) {
        var map = getMap();
        if (!map || !isCompostStationCell(x, y)) return null;
        var by = map.compost_station_interact_npc_by_cell;
        if (by && typeof by === 'object') {
            var k = (x | 0) + ',' + (y | 0);
            if (Object.prototype.hasOwnProperty.call(by, k)) {
                var v = by[k];
                if (v != null && String(v).trim()) return String(v).trim();
            }
        }
        var pid = map.compost_station_interact_npc_id;
        if (pid != null && String(pid).trim()) return String(pid).trim();
        return null;
    }

    /**
     * 地图上农业格绑定的「设施 NPC」id。
     * 优先 `agriculture_station_interact_npc_by_cell["x,y"]`，否则回落 `agriculture_station_interact_npc_id`。
     */
    function getAgricultureStationInteractNpcId(x, y) {
        var map = getMap();
        if (!map || !isAgricultureStationCell(x, y)) return null;
        var by = map.agriculture_station_interact_npc_by_cell;
        if (by && typeof by === 'object') {
            var k = (x | 0) + ',' + (y | 0);
            if (Object.prototype.hasOwnProperty.call(by, k)) {
                var v = by[k];
                if (v != null && String(v).trim()) return String(v).trim();
            }
        }
        var aid = map.agriculture_station_interact_npc_id;
        if (aid != null && String(aid).trim()) return String(aid).trim();
        return null;
    }

    /**
     * 地图上床位格绑定的「设施 NPC」id。
     * 优先 `bed_station_interact_npc_by_cell["x,y"]`，否则回落 `bed_station_interact_npc_id`。
     */
    function getBedStationInteractNpcId(x, y) {
        var map = getMap();
        if (!map || !isBedStationCell(x, y)) return null;
        var by = map.bed_station_interact_npc_by_cell;
        if (by && typeof by === 'object') {
            var k = (x | 0) + ',' + (y | 0);
            if (Object.prototype.hasOwnProperty.call(by, k)) {
                var v = by[k];
                if (v != null && String(v).trim()) return String(v).trim();
            }
        }
        var bid = map.bed_station_interact_npc_id;
        if (bid != null && String(bid).trim()) return String(bid).trim();
        return null;
    }

    /**
     * 地图上仓库格绑定的「设施 NPC」id。
     * 优先 `warehouse_station_interact_npc_by_cell["x,y"]`，否则回落 `warehouse_station_interact_npc_id`。
     */
    function getWarehouseStationInteractNpcId(x, y) {
        var map = getMap();
        if (!map || !isWarehouseStationCell(x, y)) return null;
        var by = map.warehouse_station_interact_npc_by_cell;
        if (by && typeof by === 'object') {
            var k = (x | 0) + ',' + (y | 0);
            if (Object.prototype.hasOwnProperty.call(by, k)) {
                var v = by[k];
                if (v != null && String(v).trim()) return String(v).trim();
            }
        }
        var wid = map.warehouse_station_interact_npc_id;
        if (wid != null && String(wid).trim()) return String(wid).trim();
        return null;
    }

    /**
     * 制药台格本身不因标注挡行走；若配置了设施 NPC，则按 NPC 在场语义占格（与 map.npcs 不可走一致）。
     * 未绑定 `pharmacy_station_interact_npc_*` 时该格可走。
     */
    function isPharmacyFacilityNpcBlockingWalk(x, y) {
        var fid = getPharmacyStationInteractNpcId(x, y);
        if (!fid) return false;
        if (typeof global !== 'undefined' && global.NPCSystem && typeof global.NPCSystem.isNpcPresentNow === 'function') {
            return global.NPCSystem.isNpcPresentNow(fid);
        }
        return true;
    }

    /**
     * 制肥桶格与制药台同口径：若绑定设施 NPC，则按 NPC 在场语义占格；否则可走。
     */
    function isCompostFacilityNpcBlockingWalk(x, y) {
        var fid = getCompostStationInteractNpcId(x, y);
        if (!fid) return false;
        if (typeof global !== 'undefined' && global.NPCSystem && typeof global.NPCSystem.isNpcPresentNow === 'function') {
            return global.NPCSystem.isNpcPresentNow(fid);
        }
        return true;
    }

    /** 格上实体 NPC，或灶/制药台格绑定的设施 NPC（供邻格点击与气泡逻辑统一） */
    function getInteractNpcIdAt(x, y) {
        var nid = getNpcAt(x, y);
        if (nid) return nid;
        nid = getCookingStationInteractNpcId(x, y);
        if (nid) return nid;
        nid = getPharmacyStationInteractNpcId(x, y);
        if (nid) return nid;
        nid = getCompostStationInteractNpcId(x, y);
        if (nid) return nid;
        nid = getAgricultureStationInteractNpcId(x, y);
        if (nid) return nid;
        nid = getWarehouseStationInteractNpcId(x, y);
        if (nid) return nid;
        return getBedStationInteractNpcId(x, y);
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function isAdjacent(nx, ny) {
        var dx = Math.abs(nx - state.x);
        var dy = Math.abs(ny - state.y);
        return (dx <= 1 && dy <= 1) && (dx !== 0 || dy !== 0);
    }

    /** 可走且格上无敌人、无当前在场的 NPC（与蹑步落点一致） */
    function canStandAt(x, y) {
        if (!isWalkable(x, y)) return false;
        if (getEnemyAt(x, y)) return false;
        var nid = getNpcAt(x, y);
        if (nid) {
            if (typeof global !== 'undefined' && global.NPCSystem && typeof global.NPCSystem.isNpcPresentNow === 'function') {
                if (global.NPCSystem.isNpcPresentNow(nid)) return false;
            } else {
                return false;
            }
        }
        return true;
    }

    /**
     * 蹑步等：切比雪夫距离 ∈ [1, maxRadius] 的跳跃；不消耗 tick（由调用方 advanceTick）。
     * @param {number} maxRadius 默认 2（身边两格）
     */
    function jumpTo(nx, ny, maxRadius) {
        var map = getMap();
        if (!map) return false;
        var r = maxRadius != null ? Math.max(1, parseInt(maxRadius, 10) || 2) : 2;
        if (nx === state.x && ny === state.y) return false;
        nx = clamp(nx, 0, map.width - 1);
        ny = clamp(ny, 0, map.height - 1);
        var cheb = Math.max(Math.abs(nx - state.x), Math.abs(ny - state.y));
        if (cheb < 1 || cheb > r) return false;
        if (!canStandAt(nx, ny)) return false;

        state.x = nx;
        state.y = ny;

        var portal = getPortalAt(state.x, state.y);
        if (portal) {
            state.mapId = portal.target_map_id;
            state.x = portal.target_x;
            state.y = portal.target_y;
        }

        onChange();
        return true;
    }

    function moveTo(nx, ny) {
        var map = getMap();
        if (!map) return false;
        if (nx === state.x && ny === state.y) return false;
        if (!isAdjacent(nx, ny)) return false;
        nx = clamp(nx, 0, map.width - 1);
        ny = clamp(ny, 0, map.height - 1);
        if (!isWalkable(nx, ny)) return false;

        state.x = nx;
        state.y = ny;

        var portal = getPortalAt(state.x, state.y);
        if (portal) {
            state.mapId = portal.target_map_id;
            state.x = portal.target_x;
            state.y = portal.target_y;
        }

        if (typeof global !== 'undefined' && global.Survival && typeof global.Survival.advanceTick === 'function') {
            global.Survival.advanceTick();
        }
        onChange();
        return true;
    }

    function setMaps(maps) {
        if (maps && typeof maps === 'object') MAPS = maps;
    }

    function getMaps() {
        return MAPS;
    }

    function getState() {
        return { mapId: state.mapId, x: state.x, y: state.y };
    }

    function setState(mapId, x, y) {
        if (MAPS[mapId]) {
            state.mapId = mapId;
            state.x = clamp(x, 0, MAPS[mapId].width - 1);
            state.y = clamp(y, 0, MAPS[mapId].height - 1);
            onChange();
        }
    }

    global.GameEngine = {
        CELL_PX: CELL_PX,
        VIEW_W: VIEW_W,
        VIEW_H: VIEW_H,
        CENTER_OFFSET_X: CENTER_OFFSET_X,
        CENTER_OFFSET_Y: CENTER_OFFSET_Y,
        setMaps: setMaps,
        getMaps: getMaps,
        getState: getState,
        setState: setState,
        getMap: getMap,
        isWalkable: isWalkable,
        isBlocked: isBlocked,
        isDisabled: isDisabled,
        getPortalAt: getPortalAt,
        getEntityRecordAt: getEntityRecordAt,
        getEntityAt: getEntityAt,
        getNpcAt: getNpcAt,
        getCookingStationInteractNpcId: getCookingStationInteractNpcId,
        getPharmacyStationInteractNpcId: getPharmacyStationInteractNpcId,
        getCompostStationInteractNpcId: getCompostStationInteractNpcId,
        getAgricultureStationInteractNpcId: getAgricultureStationInteractNpcId,
        getBedStationInteractNpcId: getBedStationInteractNpcId,
        getWarehouseStationInteractNpcId: getWarehouseStationInteractNpcId,
        getInteractNpcIdAt: getInteractNpcIdAt,
        getEnemyAt: getEnemyAt,
        getAnnotationAt: getAnnotationAt,
        isBlockingStationAnnotation: isBlockingStationAnnotation,
        isCookingStationCell: isCookingStationCell,
        isPharmacyStationCell: isPharmacyStationCell,
        isCompostStationCell: isCompostStationCell,
        isAgricultureStationCell: isAgricultureStationCell,
        isBedStationCell: isBedStationCell,
        isWarehouseStationCell: isWarehouseStationCell,
        isAdjacent: isAdjacent,
        canStandAt: canStandAt,
        jumpTo: jumpTo,
        moveTo: moveTo,
        onChange: function (cb) { onChange = typeof cb === 'function' ? cb : function () {}; }
    };
})(typeof window !== 'undefined' ? window : this);
