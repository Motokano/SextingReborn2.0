/* Shared Buff and log presentation. Original knowledge gates, text and tooltip handlers are retained. */
(function () {
    'use strict';
    var hud = document.getElementById('buff-hud');
    function decorateBuffs() {
        if (!hud) return;
        hud.querySelectorAll('.buff-hud-section').forEach(function (section) {
            section.classList.toggle('game-empty-buffs', !section.querySelector('.buff-chip'));
        });
        hud.querySelectorAll('.buff-chip').forEach(function (chip) {
            if (chip.querySelector('.game-buff-name')) return;
            var original = chip.textContent;
            var match = original.match(/^(.*?)×(\d+)(?:\s+(\d+)t)?$/);
            if (!match) return;
            chip.textContent = '';
            var raw = document.createElement('span');
            raw.className = 'game-buff-original'; raw.textContent = original;
            var name = document.createElement('span');
            name.className = 'game-buff-name'; name.textContent = match[1];
            var count = document.createElement('span');
            count.className = 'game-buff-count'; count.textContent = Number(match[2]) > 1 ? '×' + match[2] : '';
            var time = document.createElement('span');
            time.className = 'game-buff-time'; time.textContent = match[3] != null ? match[3] : '';
            if (match[3] != null) time.title = '剩余 ' + match[3] + ' 回合';
            chip.append(raw, name, count, time);
            chip.setAttribute('aria-label', match[1] + '，' + match[2] + '层' + (match[3] != null ? '，剩余' + match[3] + '回合' : ''));
        });
    }
    if (hud) {
        new MutationObserver(decorateBuffs).observe(hud, { childList: true, subtree: true });
        decorateBuffs();
    }
    var panel = document.getElementById('game-log-panel');
    var list = document.getElementById('game-log-lines');
    if (!panel || !list) return;
    function syncReadingSpace() {
        var height = panel.getBoundingClientRect().height;
        document.body.style.setProperty('--game-log-height', height + 'px');
    }
    new ResizeObserver(syncReadingSpace).observe(panel);
    syncReadingSpace();
    var tools = document.createElement('div'); tools.className = 'game-log-tools';
    tools.innerHTML = '<button type="button" data-filter="reading" aria-pressed="true" title="隐藏技术调试记录，保留游戏消息">阅读</button><button type="button" data-filter="all" aria-pressed="false">全部记录</button>';
    panel.querySelector('.game-log-header').appendChild(tools);
    ['pointerdown', 'mousedown', 'dblclick'].forEach(function (type) { tools.addEventListener(type, function (e) { e.stopPropagation(); }); });
    panel.classList.add('game-log-reading');
    function classify(line) {
        var text = Array.from(line.childNodes).filter(function (n) { return !(n.nodeType === 1 && n.classList.contains('log-time')); }).map(function (n) { return n.textContent; }).join('').trim();
        // Only explicit engine diagnostics, never arbitrary bracketed dialogue or game system results.
        var debug = /^\[(?:NPCSystem|SaveSystem|BUFF-HUD|debug|bootstrap)\]/i.test(text);
        line.classList.toggle('game-log-debug', debug);
        return debug;
    }
    list.querySelectorAll('.game-log-line').forEach(classify);
    var newest = document.createElement('button'); newest.type = 'button';
    newest.className = 'game-log-new'; newest.hidden = true;
    newest.textContent = '有新记录 ↓'; panel.appendChild(newest);
    function atBottom() { return list.scrollHeight - list.scrollTop - list.clientHeight <= 24; }
    list.addEventListener('game-log-appended', function (event) {
        var debug = classify(event.detail.line);
        if (!document.body.classList.contains('ui-refined')) return;
        var relevant = !debug || !panel.classList.contains('game-log-reading');
        if (event.detail.wasAtBottom) list.scrollTop = list.scrollHeight;
        else if (relevant) newest.hidden = false;
    });
    list.addEventListener('scroll', function () { if (atBottom()) newest.hidden = true; });
    newest.onclick = function () { list.scrollTop = list.scrollHeight; newest.hidden = true; };
    tools.onclick = function (e) {
        var button = e.target.closest('[data-filter]'); if (!button) return;
        panel.classList.toggle('game-log-reading', button.dataset.filter === 'reading');
        tools.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
        list.scrollTop = list.scrollHeight; newest.hidden = true;
    };
    if (window.GameLog && window.GameLog.refreshDefaultSize) window.GameLog.refreshDefaultSize();
    window.addEventListener('resize', function () { if (window.GameLog && window.GameLog.refreshDefaultSize) window.GameLog.refreshDefaultSize(); });
})();
