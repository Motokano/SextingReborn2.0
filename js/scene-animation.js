/**
 * SceneAnimation
 * Lightweight event-driven effect layer for renderer FX canvas.
 */
(function (global) {
    'use strict';

    var effects = [];
    var listeners = {};
    var idSeed = 1;
    var debugEnabled = false;
    var prefabs = {};
    var maxActiveEffects = 320;
    var rateLimitWindowMs = 120;
    var rateLimitByEvent = {};
    var recordingEnabled = false;
    var replayingEnabled = false;
    var recordStartMs = 0;
    var eventRecordLog = [];
    var replayTimers = [];
    var replaySessionId = 0;

    function now() {
        return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }

    function on(eventName, handler) {
        if (!eventName || typeof handler !== 'function') return function () {};
        if (!listeners[eventName]) listeners[eventName] = [];
        listeners[eventName].push(handler);
        return function off() {
            var arr = listeners[eventName] || [];
            var i = arr.indexOf(handler);
            if (i >= 0) arr.splice(i, 1);
        };
    }

    function emit(eventName, payload) {
        if (!eventName) return;
        if (recordingEnabled && !replayingEnabled) {
            eventRecordLog.push({
                t: now() - recordStartMs,
                eventName: String(eventName),
                payload: payload ? JSON.parse(JSON.stringify(payload)) : {}
            });
        }
        var arr = listeners[eventName] || [];
        for (var i = 0; i < arr.length; i++) {
            try { arr[i](payload || {}); } catch (e) { /* ignore */ }
        }
    }

    function spawn(effect) {
        if (!effect || !effect.type) return null;
        if (effects.length >= maxActiveEffects) {
            effects.shift();
        }
        var e = {
            id: 'fx_' + (idSeed++),
            type: String(effect.type),
            x: effect.x != null ? effect.x : 0,
            y: effect.y != null ? effect.y : 0,
            x2: effect.x2 != null ? effect.x2 : null,
            y2: effect.y2 != null ? effect.y2 : null,
            startMs: effect.startMs != null ? effect.startMs : now(),
            durationMs: Math.max(1, effect.durationMs != null ? effect.durationMs : 220),
            color: effect.color || 'rgba(251,191,36,0.9)',
            radiusCells: effect.radiusCells != null ? effect.radiusCells : 0.42,
            text: effect.text != null ? String(effect.text) : '',
            textSize: effect.textSize != null ? effect.textSize : 13
        };
        effects.push(e);
        return e.id;
    }

    function spawnPrefab(prefabId, params) {
        var def = prefabs[prefabId];
        if (!def) return null;
        var p = params || {};
        var merged = {};
        for (var k in def) if (def.hasOwnProperty(k)) merged[k] = def[k];
        for (var k2 in p) if (p.hasOwnProperty(k2)) merged[k2] = p[k2];
        return spawn(merged);
    }

    function registerPrefab(prefabId, def) {
        if (!prefabId || !def || typeof def !== 'object') return false;
        prefabs[String(prefabId)] = JSON.parse(JSON.stringify(def));
        return true;
    }

    function unregisterPrefab(prefabId) {
        if (!prefabId) return;
        delete prefabs[String(prefabId)];
    }

    function getPrefab(prefabId) {
        var p = prefabs[String(prefabId)];
        return p ? JSON.parse(JSON.stringify(p)) : null;
    }

    function shouldPassRateLimit(eventName) {
        var n = now();
        var prev = rateLimitByEvent[eventName] || 0;
        if ((n - prev) < rateLimitWindowMs) return false;
        rateLimitByEvent[eventName] = n;
        return true;
    }

    function clear() {
        effects.length = 0;
    }

    function compactEffects(nowMs) {
        var alive = [];
        for (var i = 0; i < effects.length; i++) {
            var e = effects[i];
            if ((nowMs - e.startMs) <= e.durationMs) alive.push(e);
        }
        effects = alive;
    }

    function drawHitFlash(ctx, e, t, cellPx, cellToPx) {
        var p = cellToPx(e.x, e.y);
        var cx = p.x + cellPx / 2;
        var cy = p.y + cellPx / 2;
        var pulse = 1 + Math.sin(t * Math.PI * 4) * 0.18;
        var alpha = 1 - t;
        var radius = e.radiusCells * cellPx * pulse;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawProjectileTrail(ctx, e, t, cellPx, cellToPx) {
        if (e.x2 == null || e.y2 == null) return;
        var p1 = cellToPx(e.x, e.y);
        var p2 = cellToPx(e.x2, e.y2);
        var x1 = p1.x + cellPx / 2;
        var y1 = p1.y + cellPx / 2;
        var x2 = p2.x + cellPx / 2;
        var y2 = p2.y + cellPx / 2;
        var cx = x1 + (x2 - x1) * t;
        var cy = y1 + (y2 - y1) * t;

        ctx.save();
        ctx.globalAlpha = Math.max(0.1, 1 - t);
        ctx.strokeStyle = e.color || 'rgba(251,191,36,0.9)';
        ctx.lineWidth = Math.max(2, cellPx * 0.06);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(cx, cy);
        ctx.stroke();

        ctx.fillStyle = e.color || 'rgba(251,191,36,0.95)';
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(2, cellPx * 0.08), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawFloatingText(ctx, e, t, cellPx, cellToPx) {
        if (!e.text) return;
        var p = cellToPx(e.x, e.y);
        var x = p.x + cellPx * 0.5;
        var y = p.y + cellPx * (0.45 - t * 0.55);
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillStyle = e.color || 'rgba(255,240,200,0.95)';
        ctx.font = 'bold ' + (e.textSize || 13) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.text, x, y);
        ctx.restore();
    }

    function drawDebugHud(ctx, nowMs) {
        if (!debugEnabled) return;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(15,15,15,0.6)';
        ctx.fillRect(8, 8, 220, 84);
        ctx.fillStyle = 'rgba(236,236,236,0.95)';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('FX active: ' + effects.length, 14, 14);
        ctx.fillText('FX nowMs: ' + Math.floor(nowMs), 14, 30);
        ctx.fillText('FX debug: on', 14, 46);
        ctx.fillText('FX rec: ' + (recordingEnabled ? 'on' : 'off'), 14, 62);
        ctx.fillText('FX replay: ' + (replayingEnabled ? 'on' : 'off'), 14, 78);
        ctx.restore();
    }

    function startRecording() {
        recordingEnabled = true;
        recordStartMs = now();
        eventRecordLog = [];
    }

    function stopRecording() {
        recordingEnabled = false;
        return eventRecordLog.slice();
    }

    function clearRecording() {
        eventRecordLog = [];
    }

    function clearReplayTimers() {
        for (var i = 0; i < replayTimers.length; i++) {
            clearTimeout(replayTimers[i]);
        }
        replayTimers = [];
    }

    function stopReplay() {
        replaySessionId++;
        replayingEnabled = false;
        clearReplayTimers();
    }

    function replay(log, options) {
        var opts = options || {};
        if (!Array.isArray(log) || !log.length) return;
        stopReplay();
        replayingEnabled = true;
        var sid = ++replaySessionId;
        var speed = opts.speed != null ? Math.max(0.01, Number(opts.speed)) : 1;
        for (var i = 0; i < log.length; i++) {
            (function (entry) {
                var delay = Math.max(0, (entry.t || 0) / speed);
                var tid = setTimeout(function () {
                    if (!replayingEnabled || sid !== replaySessionId) return;
                    emit(entry.eventName, entry.payload || {});
                }, delay);
                replayTimers.push(tid);
            })(log[i]);
        }
        var lastDelay = Math.max(0, (log[log.length - 1].t || 0) / speed);
        var endTid = setTimeout(function () {
            if (sid !== replaySessionId) return;
            replayingEnabled = false;
            clearReplayTimers();
        }, lastDelay + 20);
        replayTimers.push(endTid);
    }

    function render(args) {
        var ctx = args && args.ctx;
        if (!ctx) return;
        var nowMs = args.nowMs != null ? args.nowMs : now();
        var cellPx = args.cellPx || 101;
        var cellToPx = args.cellToPx || function (x, y) { return { x: x * cellPx, y: y * cellPx }; };
        compactEffects(nowMs);
        for (var i = 0; i < effects.length; i++) {
            var e = effects[i];
            var t = (nowMs - e.startMs) / e.durationMs;
            if (t < 0 || t > 1) continue;
            if (e.type === 'hit_flash') drawHitFlash(ctx, e, t, cellPx, cellToPx);
            else if (e.type === 'projectile_trail') drawProjectileTrail(ctx, e, t, cellPx, cellToPx);
            else if (e.type === 'floating_text') drawFloatingText(ctx, e, t, cellPx, cellToPx);
        }
        drawDebugHud(ctx, nowMs);
    }

    // Built-in event bindings for common gameplay actions.
    on('combat:attack', function (p) {
        if (!shouldPassRateLimit('combat:attack')) return;
        if (!p) return;
        if (p.x == null || p.y == null) return;
        spawnPrefab('hit_flash_red', {
            x: p.x,
            y: p.y
        });
        if (p.fromX != null && p.fromY != null) {
            spawnPrefab('projectile_yellow', {
                x: p.fromX,
                y: p.fromY,
                x2: p.x,
                y2: p.y
            });
        }
        if (p.damageText) {
            spawnPrefab('damage_text', {
                x: p.x,
                y: p.y,
                text: String(p.damageText)
            });
        }
    });

    on('move:step', function (p) {
        if (!shouldPassRateLimit('move:step')) return;
        if (!p || p.fromX == null || p.fromY == null) return;
        spawnPrefab('move_afterglow', {
            x: p.fromX,
            y: p.fromY
        });
    });

    registerPrefab('hit_flash_red', {
        type: 'hit_flash',
        durationMs: 180,
        color: 'rgba(248,113,113,0.9)',
        radiusCells: 0.44
    });
    registerPrefab('projectile_yellow', {
        type: 'projectile_trail',
        durationMs: 140,
        color: 'rgba(251,191,36,0.9)'
    });
    registerPrefab('damage_text', {
        type: 'floating_text',
        durationMs: 520,
        color: 'rgba(255,220,190,0.98)',
        textSize: 13
    });
    registerPrefab('move_afterglow', {
        type: 'hit_flash',
        durationMs: 120,
        color: 'rgba(251,191,36,0.45)',
        radiusCells: 0.24
    });

    global.SceneAnimation = {
        on: on,
        emit: emit,
        spawn: spawn,
        spawnPrefab: spawnPrefab,
        registerPrefab: registerPrefab,
        unregisterPrefab: unregisterPrefab,
        getPrefab: getPrefab,
        clear: clear,
        render: render,
        startRecording: startRecording,
        stopRecording: stopRecording,
        clearRecording: clearRecording,
        replay: replay,
        stopReplay: stopReplay,
        setRateLimitWindowMs: function (ms) { rateLimitWindowMs = Math.max(0, Number(ms) || 0); },
        setMaxActiveEffects: function (n) { maxActiveEffects = Math.max(1, Number(n) || 1); },
        setDebugEnabled: function (enabled) { debugEnabled = !!enabled; },
        isDebugEnabled: function () { return !!debugEnabled; },
        isRecording: function () { return !!recordingEnabled; },
        isReplaying: function () { return !!replayingEnabled; },
        getRecordedEvents: function () { return eventRecordLog.slice(); }
    };
})(typeof window !== 'undefined' ? window : this);
