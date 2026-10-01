/* Optional developer comparison toolbar; the shared theme is loaded by index.html. */
(function () {
    'use strict';
    var params = new URLSearchParams(location.search);
    if (!params.has('ui_review')) return;
    var sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = 'css/ui-theme-review.css';
    document.head.appendChild(sheet);
    var controls = document.createElement('aside');
    controls.id = 'ui-theme-review';
    controls.setAttribute('aria-label', '界面美术对比');
    controls.innerHTML = '<span class="review-label">现有界面 · 美术对比</span>' +
        '<button type="button" data-theme="original">原版</button>' +
        '<button type="button" data-theme="refined">美化版</button>' +
        '<button type="button" class="review-collapse" aria-label="收起对比工具" title="收起对比工具">−</button>';
    document.body.appendChild(controls);
    function select(mode) {
        mode = mode === 'original' ? 'original' : 'refined';
        document.body.classList.toggle('ui-refined', mode === 'refined');
        if (window.GameLog && window.GameLog.refreshDefaultSize) window.GameLog.refreshDefaultSize();
        controls.querySelectorAll('[data-theme]').forEach(function (button) {
            button.setAttribute('aria-pressed', String(button.dataset.theme === mode));
        });
        var url = new URL(location.href);
        url.searchParams.set('ui_review', mode);
        history.replaceState(null, '', url);
    }
    controls.addEventListener('click', function (event) {
        var button = event.target.closest('button');
        if (!button) return;
        if (button.dataset.theme) select(button.dataset.theme);
        else {
            var collapsed = controls.classList.toggle('is-collapsed');
            button.textContent = collapsed ? '◐' : '−';
            button.setAttribute('aria-label', collapsed ? '展开原版与美化版对比' : '收起对比工具');
            button.title = button.getAttribute('aria-label');
        }
    });
    select(params.get('ui_review'));
})();
