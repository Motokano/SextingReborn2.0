/** Presentation and pointer gestures only. PlayerActions owns eligibility and execution. */
(function (window) {
    'use strict';
    var root, wheel, hold, targetHint, config, actions = [], buttons = [], sectors = [];
    var selected = -1, opened = false, press = null, delay = 0, charge = 0, frame = 0;
    var center = { x: 0, y: 0, size: 420 }, ignoreClickUntil = 0, previousFocus;
    var step = 360 / 7;
    function point(radius, angle) {
        var a = (angle - 90) * Math.PI / 180;
        return [210 + radius * Math.cos(a), 210 + radius * Math.sin(a)];
    }
    function segment(i) {
        var a = i * step - step / 2 + .75, b = i * step + step / 2 - .75;
        return 'M ' + point(198, a) + ' A 198 198 0 0 1 ' + point(198, b) + ' L ' + point(89, b) + ' A 89 89 0 0 0 ' + point(89, a) + ' Z';
    }
    function polygon(i) {
        var points = [], a = i * step - step / 2, b = i * step + step / 2, j;
        for (j = 0; j <= 20; j++) points.push(point(201, a + (b - a) * j / 20));
        for (j = 20; j >= 0; j--) points.push(point(86, a + (b - a) * j / 20));
        return 'polygon(' + points.map(function (p) { return p[0] / 4.2 + '% ' + p[1] / 4.2 + '%'; }).join(',') + ')';
    }
    function select(index) {
        selected = index;
        buttons.forEach(function (b, i) { b.classList.toggle('is-selected', i === index); });
        sectors.forEach(function (s, i) { s.classList.toggle('is-selected', i === index); });
        var action = actions[index];
        root.querySelector('.aw-hub-name').textContent = action ? action.name : '取消';
        root.querySelector('.aw-hub-desc').textContent = action ? action.desc : '移向动作，松开执行';
        root.querySelector('.aw-hub-hint').textContent = action ? (action.disabled ? '暂不可用' : '松开执行') : '中心松开取消';
    }
    function pick(x, y) {
        var dx = x - center.x, dy = y - center.y;
        if (Math.hypot(dx, dy) < center.size * .21) return -1;
        return Math.floor((((Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360) + step / 2) / step) % 7;
    }
    function stopHold() {
        clearTimeout(delay); clearTimeout(charge); cancelAnimationFrame(frame);
        delay = charge = frame = 0;
        if (hold) hold.hidden = true;
    }
    function close() {
        stopHold(); press = null;
        if (!opened) return;
        opened = false; root.dataset.open = 'false'; wheel.hidden = true;
        if (root.contains(document.activeElement) && previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    }
    function abort() {
        if (opened || (hold && !hold.hidden)) ignoreClickUntil = Date.now() + 700;
        close();
    }
    function open(x, y) {
        if (!config || !config.canOpen()) return false;
        stopHold(); actions = config.getActions();
        if (actions.length !== 7) return false;
        previousFocus = document.activeElement;
        opened = true; root.dataset.open = 'true'; wheel.hidden = false;
        center.size = Math.max(180, Math.min(420, window.innerWidth - 24, window.innerHeight - 24));
        var r = center.size / 2;
        center.x = Math.max(r + 12, Math.min(window.innerWidth - r - 12, x == null ? window.innerWidth / 2 : x));
        center.y = Math.max(r + 12, Math.min(window.innerHeight - r - 12, y == null ? window.innerHeight / 2 : y));
        wheel.style.width = center.size + 'px'; wheel.style.left = center.x - r + 'px'; wheel.style.top = center.y - r + 'px';
        actions.forEach(function (a, i) {
            buttons[i].dataset.action = a.id;
            buttons[i].querySelector('.aw-label').textContent = a.name;
            buttons[i].setAttribute('aria-label', a.name + '：' + a.desc);
            buttons[i].setAttribute('aria-disabled', String(!!a.disabled));
            sectors[i].classList.toggle('is-disabled', !!a.disabled);
        });
        select(-1);
        if (config.onOpen) config.onOpen();
        wheel.focus({ preventScroll: true });
        return true;
    }
    function execute(index) {
        var action = actions[index];
        close();
        // Revalidate at dispatch; state may have changed while the wheel was visible.
        if (action && config.canOpen()) config.execute(action.id);
    }
    function consume(event) { event.preventDefault(); event.stopImmediatePropagation(); }
    function start(event) {
        if (event.button !== 0 || event.isPrimary === false) { if (press || opened) abort(); return; }
        if (press) { abort(); return; }
        ignoreClickUntil = 0;
        if (opened) { press = { id: event.pointerId, x: event.clientX, y: event.clientY, wheel: true }; select(pick(event.clientX, event.clientY)); consume(event); return; }
        var el = event.target;
        if (!config.canOpen() || !el.closest || !el.closest('#map-wrap') || el.closest('button,a,input,textarea,select,[contenteditable="true"],[role="button"],#status-survival,#game-log-panel,#top-hud,#right-hud,#bottom-hud-stack,.status-panel,.ui-draggable-panel')) return;
        // Ordinary short clicks continue to the game's original input handlers.
        press = { id: event.pointerId, x: event.clientX, y: event.clientY, wheel: false };
        delay = setTimeout(function () {
            if (!press || !config.canOpen()) { abort(); return; }
            hold.style.left = press.x + 'px'; hold.style.top = press.y + 'px'; hold.hidden = false;
            var started = performance.now();
            function paint() {
                hold.style.setProperty('--aw-progress', Math.min(360, (performance.now() - started) / 1000 * 360) + 'deg');
                frame = requestAnimationFrame(paint);
            }
            paint();
            charge = setTimeout(function () {
                if (!press || !open(press.x, press.y)) { abort(); return; }
                press.wheel = true;
                // At a screen edge the wheel shifts inward. Selection still starts at cancel.
            }, 1000);
        }, 500);
    }
    function move(event) {
        if (press && event.pointerId !== press.id) return;
        if (opened) { select(pick(event.clientX, event.clientY)); consume(event); }
        else if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) { abort(); }
    }
    function end(event) {
        if (!press || event.pointerId !== press.id) return;
        var wasWheel = press.wheel;
        if (wasWheel && opened) {
            consume(event); ignoreClickUntil = Date.now() + 700;
            execute(selected);
        } else { stopHold(); press = null; }
    }
    function configure(options) {
        config = options;
        if (root) return;
        root = document.createElement('div'); root.id = 'player-action-wheel'; root.dataset.open = 'false';
        root.innerHTML = '<div class="aw-wheel" role="dialog" aria-label="动作轮盘" tabindex="-1" hidden><div class="aw-rim" aria-hidden="true"></div><svg class="aw-geometry" viewBox="0 0 420 420" aria-hidden="true"><defs><linearGradient id="game-aw-moss" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#3b4838"/><stop offset=".15" stop-color="#303e31"/><stop offset="1" stop-color="#1d2a20"/></linearGradient><linearGradient id="game-aw-selected" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stop-color="#9b8b5d"/><stop offset=".12" stop-color="#706b48"/><stop offset="1" stop-color="#424c31"/></linearGradient></defs><g class="aw-sectors"></g></svg><div class="aw-texture" aria-hidden="true"></div><div class="aw-choices"></div><div class="aw-hub" aria-live="polite"><strong class="aw-hub-name"></strong><span class="aw-hub-desc"></span><span class="aw-hub-rule"></span><span class="aw-hub-hint"></span></div></div><div class="aw-hold" hidden aria-hidden="true"></div><div class="aw-target" role="status" hidden><span>蹑步 · 点击高亮格选择落脚位置</span><button type="button">取消</button></div>';
        document.body.appendChild(root); wheel = root.querySelector('.aw-wheel'); hold = root.querySelector('.aw-hold'); targetHint = root.querySelector('.aw-target');
        for (var i = 0; i < 7; i++) {
            var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', segment(i)); path.classList.add('aw-sector'); root.querySelector('.aw-sectors').appendChild(path); sectors.push(path);
            var b = document.createElement('button'); b.type = 'button'; b.className = 'aw-choice'; b.style.clipPath = polygon(i);
            var p = point(145, i * step);
            b.innerHTML = '<span class="aw-choice-content" style="left:' + p[0] / 4.2 + '%;top:' + p[1] / 4.2 + '%"><span class="aw-icon" aria-hidden="true" style="--aw-icon-x:' + (i % 4) * 100 / 3 + '%;--aw-icon-y:' + Math.floor(i / 4) * 100 + '%"></span><span class="aw-label"></span></span>';
            (function (index, button) {
                button.addEventListener('focus', function () { select(index); });
                button.addEventListener('click', function (event) { consume(event); if (event.detail === 0) execute(index); });
            })(i, b);
            root.querySelector('.aw-choices').appendChild(b); buttons.push(b);
            var screw = document.createElement('span'); screw.className = 'aw-notch'; p = point(205, i * step + step / 2);
            screw.style.left = p[0] / 4.2 + '%'; screw.style.top = p[1] / 4.2 + '%'; screw.style.transform = 'translate(-50%,-50%)'; screw.setAttribute('aria-hidden', 'true'); wheel.appendChild(screw);
        }
        targetHint.querySelector('button').onclick = function () { if (config.cancelTarget) config.cancelTarget(); };
        document.addEventListener('pointerdown', start, true);
        document.addEventListener('pointermove', move, { capture: true, passive: false });
        document.addEventListener('pointerup', end, true);
        document.addEventListener('pointercancel', abort, true);
        document.addEventListener('click', function (event) { if (Date.now() < ignoreClickUntil) { consume(event); ignoreClickUntil = 0; } }, true);
        document.addEventListener('contextmenu', function (event) {
            if (press || opened || (!targetHint.hidden && event.target.closest('#map-wrap'))) { consume(event); abort(); if (config.cancelTarget) config.cancelTarget(); }
        }, true);
        document.addEventListener('keydown', function (event) {
            if (!opened) {
                if (event.key === 'Escape') { abort(); if (!targetHint.hidden && config.cancelTarget) { consume(event); config.cancelTarget(); } }
                else if (press) abort();
                return;
            }
            consume(event);
            if (event.key === 'Escape') abort();
            else if (event.key === 'Enter' || event.key === ' ') execute(selected);
            else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Tab'].indexOf(event.key) >= 0) {
                var back = event.key === 'ArrowLeft' || event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey);
                var next = selected < 0 ? 0 : (selected + (back ? 6 : 1)) % 7;
                select(next); buttons[next].focus();
            }
        }, true);
        window.addEventListener('blur', abort); window.addEventListener('resize', abort);
        document.addEventListener('visibilitychange', function () { if (document.hidden) abort(); });
        // Touch holds must not trigger browser scrolling, text selection or callouts on the map.
        var map = document.getElementById('map-wrap'); if (map) map.classList.add('aw-gesture-surface');
    }
    window.ActionWheel = { configure: configure, open: open, close: close,
        isOpen: function () { return opened; },
        setTarget: function (active) { if (targetHint) targetHint.hidden = !active; }
    };
})(window);
