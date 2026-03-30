/**
 * Framework-agnostic game state core.
 * No React/Vue/Svelte hooks, no DOM, no global window dependencies.
 */
(function (global) {
    'use strict';

    function clone(v) {
        return JSON.parse(JSON.stringify(v));
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function createMapState(options) {
        var opts = options || {};
        var maps = clone(opts.maps || {});
        var state = {
            mapId: opts.initialMapId || 'M0_Base_Inside_lv_1',
            x: opts.initialX != null ? opts.initialX : 10,
            y: opts.initialY != null ? opts.initialY : 12
        };

        function getMap() {
            return maps[state.mapId] || null;
        }

        function isBlocked(map, x, y) {
            if (!map || !Array.isArray(map.blocks)) return false;
            for (var i = 0; i < map.blocks.length; i++) {
                if (map.blocks[i].x === x && map.blocks[i].y === y) return true;
            }
            return false;
        }

        function getPortalAt(map, x, y) {
            if (!map || !Array.isArray(map.portals)) return null;
            for (var i = 0; i < map.portals.length; i++) {
                var p = map.portals[i];
                if (p.x === x && p.y === y) return p;
            }
            return null;
        }

        function canMoveTo(x, y) {
            var map = getMap();
            if (!map) return false;
            if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
            return !isBlocked(map, x, y);
        }

        function moveBy(dx, dy) {
            var map = getMap();
            if (!map) return { moved: false, reason: 'missing_map' };
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) return { moved: false, reason: 'invalid_step' };

            var nx = state.x + dx;
            var ny = state.y + dy;
            if (!canMoveTo(nx, ny)) return { moved: false, reason: 'blocked' };

            state.x = nx;
            state.y = ny;
            var portal = getPortalAt(map, nx, ny);
            if (portal) {
                state.mapId = portal.target_map_id;
                state.x = portal.target_x || 0;
                state.y = portal.target_y || 0;
                return { moved: true, teleported: true, portal: clone(portal), position: getState() };
            }
            return { moved: true, teleported: false, position: getState() };
        }

        function setMaps(nextMaps) {
            maps = clone(nextMaps || {});
        }

        function getMaps() {
            return clone(maps);
        }

        function getState() {
            return { mapId: state.mapId, x: state.x, y: state.y };
        }

        function setState(next) {
            if (!next) return;
            if (next.mapId != null) state.mapId = next.mapId;
            if (next.x != null) state.x = next.x;
            if (next.y != null) state.y = next.y;
            var curMap = getMap();
            if (curMap) {
                state.x = clamp(state.x, 0, curMap.width - 1);
                state.y = clamp(state.y, 0, curMap.height - 1);
            }
        }

        return {
            getMap: getMap,
            getMaps: getMaps,
            setMaps: setMaps,
            getState: getState,
            setState: setState,
            canMoveTo: canMoveTo,
            moveBy: moveBy
        };
    }

    function createVitalsState(options) {
        var opts = options || {};
        var state = {
            hp: opts.hp != null ? opts.hp : 100,
            hpMax: opts.hpMax != null ? opts.hpMax : 100,
            stamina: opts.stamina != null ? opts.stamina : 100,
            staminaMax: opts.staminaMax != null ? opts.staminaMax : 100,
            energy: opts.energy != null ? opts.energy : 100,
            energyMax: opts.energyMax != null ? opts.energyMax : 100
        };

        function normalize() {
            state.hpMax = Math.max(1, state.hpMax);
            state.staminaMax = Math.max(1, state.staminaMax);
            state.energyMax = Math.max(1, state.energyMax);
            state.hp = clamp(state.hp, 0, state.hpMax);
            state.stamina = clamp(state.stamina, 0, state.staminaMax);
            state.energy = clamp(state.energy, 0, state.energyMax);
        }
        normalize();

        function getState() {
            return clone(state);
        }

        function setState(next) {
            if (!next) return;
            if (next.hpMax != null) state.hpMax = Number(next.hpMax);
            if (next.staminaMax != null) state.staminaMax = Number(next.staminaMax);
            if (next.energyMax != null) state.energyMax = Number(next.energyMax);
            if (next.hp != null) state.hp = Number(next.hp);
            if (next.stamina != null) state.stamina = Number(next.stamina);
            if (next.energy != null) state.energy = Number(next.energy);
            normalize();
        }

        function applyDamage(value) {
            var dmg = Math.max(0, Number(value) || 0);
            state.hp = clamp(state.hp - dmg, 0, state.hpMax);
            return { hp: state.hp, dead: state.hp <= 0, damage: dmg };
        }

        function heal(value) {
            var amount = Math.max(0, Number(value) || 0);
            state.hp = clamp(state.hp + amount, 0, state.hpMax);
            return { hp: state.hp, healed: amount };
        }

        function spendStamina(value) {
            var cost = Math.max(0, Number(value) || 0);
            if (state.stamina < cost) return { ok: false, reason: 'insufficient_stamina', stamina: state.stamina };
            state.stamina = clamp(state.stamina - cost, 0, state.staminaMax);
            return { ok: true, stamina: state.stamina, spent: cost };
        }

        function regenPerTurn() {
            state.stamina = clamp(state.stamina + 1, 0, state.staminaMax);
            state.energy = clamp(state.energy + 1, 0, state.energyMax);
            return getState();
        }

        return {
            getState: getState,
            setState: setState,
            applyDamage: applyDamage,
            heal: heal,
            spendStamina: spendStamina,
            regenPerTurn: regenPerTurn
        };
    }

    function createTurnState(options) {
        var opts = options || {};
        var state = {
            turn: opts.turn != null ? opts.turn : 1,
            tick: opts.tick != null ? opts.tick : 0,
            actor: opts.actor || 'player',
            queue: Array.isArray(opts.queue) && opts.queue.length ? opts.queue.slice() : ['player', 'enemies']
        };

        function nextActor() {
            var idx = state.queue.indexOf(state.actor);
            var nextIdx = idx >= 0 ? (idx + 1) % state.queue.length : 0;
            state.actor = state.queue[nextIdx];
            state.tick += 1;
            if (state.actor === state.queue[0]) state.turn += 1;
            return getState();
        }

        function getState() {
            return clone(state);
        }

        function setState(next) {
            if (!next) return;
            if (next.turn != null) state.turn = Number(next.turn);
            if (next.tick != null) state.tick = Number(next.tick);
            if (next.actor != null) state.actor = String(next.actor);
            if (Array.isArray(next.queue) && next.queue.length) state.queue = next.queue.slice();
        }

        return {
            getState: getState,
            setState: setState,
            nextActor: nextActor
        };
    }

    function createGameStateCore(options) {
        var opts = options || {};
        var mapState = createMapState(opts.map);
        var vitalsState = createVitalsState(opts.vitals);
        var turnState = createTurnState(opts.turn);

        function getState() {
            return {
                map: mapState.getState(),
                vitals: vitalsState.getState(),
                turn: turnState.getState()
            };
        }

        function actMove(dx, dy) {
            var move = mapState.moveBy(dx, dy);
            if (!move.moved) return { ok: false, reason: move.reason, state: getState() };
            turnState.nextActor();
            vitalsState.regenPerTurn();
            return { ok: true, kind: 'move', move: move, state: getState() };
        }

        function actWait() {
            turnState.nextActor();
            vitalsState.regenPerTurn();
            return { ok: true, kind: 'wait', state: getState() };
        }

        function actAttack(payload) {
            var p = payload || {};
            var staminaCost = p.staminaCost != null ? p.staminaCost : 5;
            var spend = vitalsState.spendStamina(staminaCost);
            if (!spend.ok) return { ok: false, reason: spend.reason, state: getState() };
            turnState.nextActor();
            return { ok: true, kind: 'attack', targetId: p.targetId || null, state: getState() };
        }

        return {
            getState: getState,
            map: mapState,
            vitals: vitalsState,
            turn: turnState,
            actions: {
                move: actMove,
                wait: actWait,
                attack: actAttack
            }
        };
    }

    var api = {
        createMapState: createMapState,
        createVitalsState: createVitalsState,
        createTurnState: createTurnState,
        createGameStateCore: createGameStateCore
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        global.GameStateCore = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
