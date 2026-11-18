/* One paid world tick per completed second; shared by both UI shells. */
(function (g) {
    'use strict';
    var state = null, timer = null, epoch = 0, dueAt = 0, advancing = false, error = '', root;
    var hooks = {}, heldKeys = new Set();
    function copy(value) { return value == null ? null : JSON.parse(JSON.stringify(value)); }
    function text(key, vars) { return g.UIText.t('bed.sleep.' + key, vars); }
    function active() { return !!state; }
    function blocked() { return g.Survival.isDead() || g.Survival.isComa() || (g.DeathSystem && g.DeathSystem.blocked()); }
    function stopTimer() { epoch++; if (timer !== null) g.clearTimeout(timer); timer = null; dueAt = 0; }
    function validate(s) {
        return s == null || (s.version === 1 && Number.isInteger(s.total) && s.total > 0 && s.total <= 10000 &&
            Number.isInteger(s.completed) && s.completed >= 0 && s.completed < s.total &&
            Number.isFinite(s.tickMs) && s.tickMs >= 1000 && typeof s.mapId === 'string' &&
            Number.isInteger(s.x) && Number.isInteger(s.y) && Array.isArray(s.rolls) &&
            s.rolls.length === g.CharacterAttributes.ATTR_IDS.length && s.rolls.every(function (n) { return Number.isFinite(n) && n >= 0 && n < 1; }));
    }
    function ensureView() {
        if (root) return;
        root = document.createElement('dialog'); root.id = 'bed-sleep-panel'; root.hidden = true;
        root.setAttribute('aria-labelledby', 'bed-sleep-heading'); root.setAttribute('aria-modal', 'true');
        root.innerHTML = '<section class="bed-sleep-card"><span class="bed-sleep-moon" aria-hidden="true">☾</span>' +
            '<h2 id="bed-sleep-heading"></h2><p class="bed-sleep-time" aria-live="polite"></p>' +
            '<progress class="bed-sleep-progress" aria-label="睡眠进度"></progress>' +
            '<p class="bed-sleep-resources"></p><p class="bed-sleep-error" role="alert" hidden></p>' +
            '<button type="button" class="bed-sleep-retry" hidden></button></section>';
        root.addEventListener('cancel', function (e) { e.preventDefault(); });
        root.querySelector('button').addEventListener('click', function () { error = ''; render(); schedule(); });
        document.body.appendChild(root);
    }
    function render() {
        ensureView();
        var visible = active() && !blocked(); root.hidden = !visible;
        if (visible && !root.open) root.showModal();
        if (!visible && root.open) root.close();
        if (!visible) return;
        root.querySelector('h2').textContent = text('sleeping');
        root.querySelector('.bed-sleep-time').textContent = text(document.hidden ? 'paused' : 'remaining', { seconds: Math.ceil((state.total - state.completed) * state.tickMs / 1000) });
        var progress = root.querySelector('progress'); progress.max = state.total; progress.value = state.completed;
        var s = g.Survival.getState();
        root.querySelector('.bed-sleep-resources').textContent = text('resources', {
            stamina: s.stamina.toFixed(1), fatigue: s.fatigue.toFixed(1), satiety: s.satiety.toFixed(1), thirst: s.thirst.toFixed(1)
        });
        var warning = root.querySelector('.bed-sleep-error'); warning.hidden = !error; warning.textContent = error;
        var retry = root.querySelector('button'); retry.hidden = !error; retry.textContent = text('retry');
    }
    function refresh() { render(); if (hooks.refresh) hooks.refresh(); }
    function transaction(operation) {
        try {
            var result = g.SaveSystem.runAtomicFor('sleep', operation);
            if (result.saved) return result;
        } catch (e) { /* The shared transaction restores resources, world time and sleep progress. */ }
        error = text('save_failed'); refresh(); return null;
    }
    function schedule() {
        if (!state || timer !== null || error || document.hidden || blocked()) return;
        // Include save/render work in the next second instead of adding it to all 48 waits.
        // A late callback starts a fresh interval; it never catches up missed ticks.
        if (!dueAt) dueAt = g.performance.now() + state.tickMs;
        var token = epoch;
        timer = g.setTimeout(function () {
            if (token !== epoch || !state) return;
            timer = null;
            if (document.hidden) return;
            dueAt = g.performance.now() + state.tickMs;
            advance();
        }, Math.max(0, Math.ceil(dueAt - g.performance.now())));
    }
    function advance() {
        if (!state || error || blocked()) { stopTimer(); render(); return; }
        var upgraded = false, completed = false;
        var result = transaction(function () {
            var p = g.GameEngine.getState();
            if (p.mapId !== state.mapId || p.x !== state.x || p.y !== state.y) { state = null; return; }
            var before = g.Survival.getState().tickCount;
            advancing = true; g.Survival.setResting(true);
            try { g.Survival.advanceTick({ source: 'sleep' }); }
            finally { advancing = false; g.Survival.setResting(false); }
            if (blocked()) { state = null; return; }
            if (g.Survival.getState().tickCount !== before + 1) throw new Error('Sleep tick blocked');
            state.completed++;
            if (state.completed === state.total) {
                g.CharacterAttributes.recoverSurgicalMaxAfterSleep();
                if (g.MedicalActions) g.MedicalActions.completeSleep(state.total);
                var rolls = state.rolls, next = 0;
                var settled = hooks.settle(function () { return rolls[next++]; });
                upgraded = !!(settled && settled.ok && settled.any_success);
                completed = true; state = null;
            }
        });
        if (!result) return;
        if (completed) {
            if (upgraded) g.GameLog.log(text('attr_exp_upgraded'), 'success');
            g.GameLog.log(text('done'), 'success');
        }
        refresh(); schedule();
    }
    function start(total) {
        if (state || blocked()) return false;
        stopTimer();
        g.SceneApp.prepareFacilityAction(); g.Survival.stopStudy();
        var p = g.GameEngine.getState(); error = '';
        var result = transaction(function () {
            state = { version: 1, total: total, completed: 0,
                tickMs: Math.max(1000, Number(g.Survival.getConfigValue('sleep_tick_seconds', 1)) * 1000 || 1000),
                mapId: p.mapId, x: p.x, y: p.y,
                rolls: g.CharacterAttributes.ATTR_IDS.map(function () { return Math.random(); }) };
        });
        if (!result) { g.GameLog.log(error, 'warn'); return false; }
        refresh(); schedule(); return true;
    }
    function resume() {
        if (!state) { render(); return; }
        if (blocked()) { stopTimer(); render(); return; }
        g.SceneApp.prepareFacilityAction(); g.Survival.stopStudy();
        refresh(); schedule();
    }
    function restore(s, rollback) {
        stopTimer(); state = validate(s) ? copy(s) : null; error = '';
        if (!rollback) Promise.resolve().then(resume);
    }
    function interrupt() { stopTimer(); state = null; error = ''; if (root) render(); }
    document.addEventListener('visibilitychange', function () { stopTimer(); if (state) { render(); schedule(); } });
    g.addEventListener('pagehide', stopTimer);
    g.addEventListener('pageshow', function () { if (state) schedule(); });
    g.addEventListener('keydown', function (e) {
        var key = e.code || e.key;
        if (!active() || blocked()) {
            if (heldKeys.has(key)) { e.preventDefault(); e.stopImmediatePropagation(); }
            return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        heldKeys.add(key);
        if (error && root.contains(e.target) && (e.key === 'Enter' || e.key === ' ')) { e.stopPropagation(); return; }
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.key === 'Tab' && error) root.querySelector('button').focus();
    }, true);
    g.addEventListener('keyup', function (e) { if (heldKeys.delete(e.code || e.key)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    g.addEventListener('blur', function () { heldKeys.clear(); });
    ['click', 'pointerdown', 'contextmenu'].forEach(function (kind) {
        g.addEventListener(kind, function (e) {
            if (active() && !blocked() && root && !root.contains(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);
    });
    g.BedSleep = { start: start, resume: resume, interrupt: interrupt, isActive: active, validate: validate,
        allowsTick: function (options) { return !state || (advancing && options && options.source === 'sleep'); },
        getState: function () { return copy(state); }, restore: restore,
        configure: function (callbacks) { hooks = callbacks; } };
})(window);
