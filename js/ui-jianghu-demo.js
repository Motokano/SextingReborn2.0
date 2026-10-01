/* Opt-in study on the real scene. Does not create characters, unlock UI, or write saves. */
(function () {
    'use strict';
    if (!['jianghu', 'industrial'].includes(new URLSearchParams(location.search).get('ui_demo'))) return;
    var materialStyle = document.createElement('link');
    materialStyle.rel = 'stylesheet'; materialStyle.href = 'css/ui-jianghu-material.css';
    document.head.appendChild(materialStyle);
    var craftedStyle = document.createElement('link');
    craftedStyle.rel = 'stylesheet'; craftedStyle.href = 'css/ui-jianghu-handcrafted.css';
    document.head.appendChild(craftedStyle);
    var bar = document.createElement('aside');
    bar.id = 'jianghu-demo-controls'; bar.setAttribute('aria-label', 'sewing 分支 UI 试作对比');
    bar.innerHTML = '<span>sewing · UI 试作</span><button type="button" data-demo="current">原版样式</button><button type="button" data-demo="flat">平面试作</button><button type="button" data-demo="study">材质试作</button><button type="button" data-demo="crafted">市井手作</button><button type="button" data-demo="industrial">sewing 配色 · 哑光</button><button type="button" class="demo-collapse" aria-label="收起或展开对比工具">◐</button>';
    document.body.appendChild(bar);
    function select(mode) {
        document.body.classList.toggle('ui-layout', mode !== 'current');
        document.body.classList.toggle('ui-jianghu', mode !== 'current');
        document.body.classList.toggle('ui-material', mode === 'study' || mode === 'crafted');
        document.body.classList.toggle('ui-handcrafted', mode === 'crafted');
        document.body.classList.toggle('ui-matte', mode === 'industrial');
        if (window.GameLog && window.GameLog.refreshDefaultSize) window.GameLog.refreshDefaultSize();
        bar.querySelectorAll('[data-demo]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.demo === mode)); });
    }
    bar.addEventListener('click', function (event) {
        var b = event.target.closest('button'); if (!b) return;
        if (b.dataset.demo) select(b.dataset.demo);
        else bar.classList.toggle('is-collapsed');
    });
    select('industrial');
})();
