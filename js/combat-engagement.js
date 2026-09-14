/**
 * CombatEngagement — 玩家与敌人的统一交战状态。
 * 只维护状态并发出变化通知；DOM、日志和玩法门禁由调用方读取/响应。
 */
(function (global) {
    'use strict';

    var entries = {};
    var listeners = [];
    var currentMapId = '';
    var nextRuntimeId = 1;
    var batchDepth = 0;
    var batchBefore = false;

    function isPlayerInCombat() { return Object.keys(entries).length > 0; }

    function ensureRuntimeId(record) {
        if (!record || typeof record !== 'object') return '';
        if (!record.__combat_engagement_id) {
            try {
                Object.defineProperty(record, '__combat_engagement_id', {
                    value: 'ce_' + (nextRuntimeId++), writable: false, enumerable: false
                });
            } catch (e) { record.__combat_engagement_id = 'ce_' + (nextRuntimeId++); }
        }
        return String(record.__combat_engagement_id);
    }

    function keyFor(mapId, record, index) {
        var rid = ensureRuntimeId(record);
        return String(mapId || '') + '|' + (rid || ('i' + (index | 0)));
    }

    function emitIfChanged(before, reason, silent) {
        if (silent || batchDepth > 0) return;
        var after = isPlayerInCombat();
        if (before === after) return;
        var event = { inCombat: after, previous: before, reason: reason || '' };
        listeners.slice().forEach(function (fn) { try { fn(event); } catch (e) { /* observer isolation */ } });
    }

    function beginBatch() {
        if (batchDepth === 0) batchBefore = isPlayerInCombat();
        batchDepth++;
    }

    function endBatch(reason, silent) {
        if (batchDepth <= 0) return;
        batchDepth--;
        if (batchDepth === 0) emitIfChanged(batchBefore, reason, silent);
    }

    function setCurrentMap(mapId, opts) {
        opts = opts || {};
        mapId = String(mapId || '');
        if (currentMapId === mapId) return;
        var before = isPlayerInCombat();
        entries = {};
        currentMapId = mapId;
        emitIfChanged(before, 'map_changed', !!opts.silent);
    }

    function engageEnemy(o) {
        o = o || {};
        var mapId = String(o.mapId || '');
        if (mapId !== currentMapId) setCurrentMap(mapId, { silent: !!o.silent });
        var before = isPlayerInCombat();
        var key = keyFor(mapId, o.record, o.index);
        entries[key] = {
            mapId: mapId, index: o.index | 0,
            enemyId: o.enemyId != null ? String(o.enemyId) : '',
            runtimeId: o.record ? ensureRuntimeId(o.record) : '',
            reason: o.reason || ''
        };
        emitIfChanged(before, o.reason || 'engaged', !!o.silent);
        return key;
    }

    function disengageEnemy(o) {
        o = o || {};
        var before = isPlayerInCombat();
        var key = keyFor(o.mapId, o.record, o.index);
        delete entries[key];
        emitIfChanged(before, o.reason || 'disengaged', !!o.silent || !!o.defer);
    }

    function syncFromAi(map, isAggro, opts) {
        opts = opts || {};
        var mapId = String(map && map.map_id || '');
        beginBatch();
        setCurrentMap(mapId, { silent: true });
        var desired = {};
        var enemies = map && Array.isArray(map.enemies) ? map.enemies : [];
        for (var i = 0; i < enemies.length; i++) {
            var rec = enemies[i] || {};
            if (!isAggro || !isAggro(i, rec)) continue;
            var key = keyFor(mapId, rec, i);
            desired[key] = true;
            entries[key] = { mapId: mapId, index: i, enemyId: String(rec.enemy_id || ''), runtimeId: ensureRuntimeId(rec), reason: 'aggro' };
        }
        Object.keys(entries).forEach(function (key) { if (!desired[key]) delete entries[key]; });
        endBatch(opts.reason || 'ai_sync', !!opts.silent);
    }

    function clear(reason, opts) {
        opts = opts || {};
        var before = isPlayerInCombat();
        entries = {};
        if (opts.mapId != null) currentMapId = String(opts.mapId || '');
        emitIfChanged(before, reason || 'cleared', !!opts.silent);
    }

    function getState() {
        return { mapId: currentMapId, enemies: Object.keys(entries).map(function (k) {
            var e = entries[k];
            return { mapId: e.mapId, index: e.index, enemyId: e.enemyId };
        }) };
    }

    function setState(state) {
        entries = {};
        var engineState = global.GameEngine && global.GameEngine.getState ? global.GameEngine.getState() : null;
        currentMapId = String(engineState && engineState.mapId || (state && state.mapId) || '');
        var map = global.GameEngine && global.GameEngine.getMap ? global.GameEngine.getMap() : null;
        var saved = state && Array.isArray(state.enemies) ? state.enemies : [];
        for (var i = 0; i < saved.length; i++) {
            var s = saved[i] || {};
            if (String(s.mapId || '') !== currentMapId || !map || !Array.isArray(map.enemies)) continue;
            var rec = map.enemies[s.index | 0];
            if (!rec || String(rec.enemy_id || '') !== String(s.enemyId || '')) continue;
            engageEnemy({ mapId: currentMapId, index: s.index, enemyId: s.enemyId, record: rec, reason: 'load', silent: true });
            if (global.CombatEnemies && typeof global.CombatEnemies.forceAggro === 'function') {
                global.CombatEnemies.forceAggro(map, s.index | 0, 0);
            }
        }
    }

    function onChange(fn) {
        if (typeof fn !== 'function') return function () {};
        listeners.push(fn);
        return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    }

    global.CombatEngagement = {
        isPlayerInCombat: isPlayerInCombat,
        engageEnemy: engageEnemy,
        disengageEnemy: disengageEnemy,
        syncFromAi: syncFromAi,
        setCurrentMap: setCurrentMap,
        clear: clear,
        getState: getState,
        setState: setState,
        onChange: onChange,
        beginBatch: beginBatch,
        endBatch: endBatch
    };
})(typeof window !== 'undefined' ? window : globalThis);
