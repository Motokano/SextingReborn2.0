/**
 * 潮碧物语 - 游戏主引擎
 * 负责：地图数据、玩家状态、移动与传送、可走/不可走（blocks）
 * 不负责 DOM 渲染，通过 onChange 回调通知页面刷新。
 */
(function (global) {
    'use strict';

    var CELL_PX = 72;
    var VIEW_W = 744;
    var VIEW_H = 456;
    var CENTER_OFFSET_X = (VIEW_W / 2) - (CELL_PX / 2);
    var CENTER_OFFSET_Y = (VIEW_H / 2) - (CELL_PX / 2);

    var MAPS = {
        home: {
            map_id: 'home',
            name: '基地',
            width: 16,
            height: 16,
            blocks: [],
            portals: [
                { x: 8, y: 15, target_map_id: 'field', target_x: 2, target_y: 11, label: '出基地→野外' }
            ]
        },
        field: {
            map_id: 'field',
            name: '野外',
            width: 25,
            height: 25,
            blocks: [],
            portals: [
                { x: 2, y: 12, target_map_id: 'home', target_x: 8, target_y: 14, label: '回基地' },
                { x: 22, y: 12, target_map_id: 'town', target_x: 8, target_y: 14, label: '进城镇' }
            ]
        },
        town: {
            map_id: 'town',
            name: '城镇',
            width: 16,
            height: 16,
            blocks: [],
            portals: [
                { x: 8, y: 15, target_map_id: 'field', target_x: 22, target_y: 11, label: '出城镇→野外' }
            ]
        }
    };

    var state = {
        mapId: 'home',
        x: 8,
        y: 8
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
        return !isBlocked(map, x, y);
    }

    function getPortalAt(x, y) {
        var map = getMap();
        if (!map || !map.portals) return null;
        for (var i = 0; i < map.portals.length; i++) {
            if (map.portals[i].x === x && map.portals[i].y === y) return map.portals[i];
        }
        return null;
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function isAdjacent(nx, ny) {
        var dx = Math.abs(nx - state.x);
        var dy = Math.abs(ny - state.y);
        return (dx <= 1 && dy <= 1) && (dx !== 0 || dy !== 0);
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
        isAdjacent: isAdjacent,
        moveTo: moveTo,
        onChange: function (cb) { onChange = typeof cb === 'function' ? cb : function () {}; }
    };
})(typeof window !== 'undefined' ? window : this);
