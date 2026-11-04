/* One book detail and reading control shared by both inventory shells. */
(function (g) {
    'use strict';
    var root, request, notice, noticeTimer, signature = '';
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var fmt = function (n) { return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 1 }); };
    function refresh() { g.SceneApp.panelApi.changed(); }
    function notify(message) {
        if (!notice) { notice = document.createElement('div'); notice.id = 'book-reading-notice'; notice.setAttribute('role', 'status'); document.body.appendChild(notice); }
        notice.textContent = message; notice.hidden = false; g.clearTimeout(noticeTimer);
        noticeTimer = g.setTimeout(function () { notice.hidden = true; }, 5000);
        if (g.GameLog) g.GameLog.log(message, 'success');
    }
    function ensure(modal) {
        if (root) { if (root.parentNode !== modal.querySelector('.panel')) modal.querySelector('.panel').appendChild(root); return; }
        root = document.createElement('section'); root.id = 'book-reading-panel'; root.setAttribute('aria-label', '教材阅读');
        modal.querySelector('.panel').appendChild(root);
        new MutationObserver(function () { if (!modal.classList.contains('show')) g.BookReading.pause(); }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        root.addEventListener('click', function (event) {
            var button = event.target.closest('button'); if (!button || button.disabled || !request) return;
            // A detached old button must never act on a newly selected book.
            if (button.dataset.bookId !== request.id) return;
            if (button.hasAttribute('data-book-read')) {
                if (g.BookReading.isActive() && g.BookReading.sessionFor(request)) g.BookReading.pause();
                else { var result = g.BookReading.start(request); if (!result.ok) g.SceneApp.panelApi.message(result.message, 'warn'); }
            } else if (button.hasAttribute('data-book-consume')) {
                var consumed = g.BookLearning.consumeFullBook(request);
                if (consumed.ok) notify(consumed.message); else g.SceneApp.panelApi.message(consumed.message, 'warn');
            }
            refresh();
        });
    }
    function render(modal, selected) {
        var I = g.InventoryEquipment, reading = g.BookReading;
        var storage = selected && g.InventoryTransfer.read(selected.context), item = storage && storage.ok && storage.items.find(function (x) { return x && x.instance_id === selected.id; });
        var book = item && I.getBookInfo(item);
        var carried = selected && ['pocket', 'backpack', 'vehicle'].indexOf(selected.context.type) >= 0;
        var nextSignature = book && carried ? JSON.stringify(selected) : '';
        if (signature !== nextSignature && reading.isActive()) reading.pause();
        signature = nextSignature; request = book && carried ? selected : null;
        modal.classList.toggle('bp-book-selected', !!request);
        if (!request) { if (root) root.hidden = true; return; }
        ensure(modal); root.hidden = !modal.classList.contains('show');
        var status = reading.check(request), progress = reading.progress(book.profile), session = reading.sessionFor(request);
        var active = reading.isActive() && !!session;
        if (active && !status.ok) { reading.pause(status.message); active = false; session = reading.sessionFor(request); }
        var character = I.getCharacterForDisplay(), tpl = I.getItemTemplate(item.item_id);
        var title = I.getDisplayName(tpl, I.getItemDisplayTier(item.item_id, character), character);
        var description = I.getDisplayDesc(tpl, I.getItemDisplayTier(item.item_id, character), character);
        if (book.fragments === book.total && I.isLanguageTextUnlocked('fn', character)) description = '一本补齐了全部内容的解剖学教材，记载着骨骼、关节与肌肉的知识。';
        var lines = g.ItemInfoModules.bookDescription(item), consumption = g.BookLearning.checkConsumption(request);
        var ratio = progress.cost ? Math.min(100, progress.exp / progress.cost * 100) : 100;
        var html = '<div class="book-reading-description"><div class="book-reading-title"><h3>' + esc(title) + '</h3><span>完整度 ' + book.label + '</span></div>' +
            (description ? '<p>' + esc(description) + '</p>' : '') + '<p class="book-reading-limit">' + esc(lines[1]) + '</p>' +
            (book.fragments === book.total ? '<p class="book-reading-complete">' + esc(lines[2]) + '</p>' : '') + '</div>' +
            '<div class="book-reading-actions"><div class="book-reading-level">解剖学 <b>' + progress.level + ' 级</b></div>' +
            '<div class="book-reading-buttons"><button data-book-read data-book-id="' + esc(request.id) + '" ' + (!active && !status.ok ? 'disabled' : '') + '>' + esc(active ? '暂停阅读' : status.ok ? '阅读' : status.message) + '</button>' +
            (book.fragments === book.total ? '<button data-book-consume data-book-id="' + esc(request.id) + '" ' + (consumption.ok ? '' : 'disabled') + '>' + (consumption.reason === 'max_level' ? '已达技能上限' : '消耗整本，升 1 级') + '</button>' : '') + '</div>' +
            '<progress max="100" value="' + ratio + '" aria-label="解剖学升级进度" title="' + fmt(progress.exp) + ' / ' + fmt(progress.cost) + '"></progress>' +
            '<p class="book-reading-earned" aria-live="polite">本次获得：解剖学经验 +' + fmt(session ? session.earned : 0) + ' · 阅读经验 +' + fmt(session ? session.languageTenths / 10 : 0) + '</p>' +
            (session && session.status ? '<p class="book-reading-status">' + esc(session.status) + '</p>' : '') + '</div>';
        if (root.innerHTML !== html) root.innerHTML = html;
    }
    g.BookPanel = { render: render, notify: notify };
})(window);
