// Single boot entry: load i18n/config then start scene
(function () {
    'use strict';

    // Prevent double boot (e.g. script injected twice)
    if (window.__APP_BOOTED__) return;
    window.__APP_BOOTED__ = true;

    function fatal(msg, err) {
        try { console.error(msg, err || ''); } catch (e) { /* ignore */ }
        var e2 = (err instanceof Error) ? err : new Error(String(msg));
        // Render a visible fatal overlay (so failures never go silent)
        try {
            var wrap = document.createElement('div');
            wrap.style.position = 'fixed';
            wrap.style.inset = '0';
            wrap.style.zIndex = '99999';
            wrap.style.background = 'rgba(0,0,0,0.88)';
            wrap.style.color = '#e8e6e3';
            wrap.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace';
            wrap.style.padding = '24px';
            wrap.style.overflow = 'auto';
            wrap.innerHTML =
                '<div style="max-width:960px;margin:0 auto">' +
                '<h2 style="margin:0 0 12px 0;font-size:18px;letter-spacing:0.08em">BOOT FAILED</h2>' +
                '<div style="opacity:0.9;margin-bottom:12px">启动失败（为避免静默脱钩，已主动中止）。</div>' +
                '<pre style="white-space:pre-wrap;line-height:1.5;background:rgba(255,255,255,0.06);padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.12)">' +
                (String(e2 && e2.stack ? e2.stack : e2.message || e2)).replace(/</g, '&lt;') +
                '</pre>' +
                '<div style="opacity:0.75;margin-top:12px">提示：通常是 i18n key 缺失或模块未加载。修复后刷新即可。</div>' +
                '</div>';
            document.body.appendChild(wrap);
        } catch (e3) { /* ignore */ }
        throw e2;
    }

    function requireGlobal(name) {
        if (!window[name]) fatal('[bootstrap] missing global: ' + name);
        return window[name];
    }

    // Stable extension points (modules can register hooks without touching boot logic)
    window.AppBoot = window.AppBoot || {};
    window.AppBoot.beforeStart = Array.isArray(window.AppBoot.beforeStart) ? window.AppBoot.beforeStart : [];
    window.AppBoot.afterStart = Array.isArray(window.AppBoot.afterStart) ? window.AppBoot.afterStart : [];
    window.AppBoot.addBeforeStart = window.AppBoot.addBeforeStart || function (fn) {
        if (typeof fn === 'function') window.AppBoot.beforeStart.push(fn);
    };
    window.AppBoot.addAfterStart = window.AppBoot.addAfterStart || function (fn) {
        if (typeof fn === 'function') window.AppBoot.afterStart.push(fn);
    };

    function runHooks(list, label) {
        for (var i = 0; i < list.length; i++) {
            try { list[i](); } catch (e) { fatal('[bootstrap] hook failed: ' + label + '[' + i + ']', e); }
        }
    }

    function boot() {
        var SceneApp = requireGlobal('SceneApp');
        var BuffSystem = window.BuffSystem;

        try {
            if (typeof SceneApp.init !== 'function') fatal('[bootstrap] SceneApp.init missing');
        } catch (e) {
            fatal('[bootstrap] preflight failed', e);
        }

        runHooks(window.AppBoot.beforeStart, 'beforeStart');
        if (BuffSystem && typeof BuffSystem.init === 'function') BuffSystem.init();
        SceneApp.init(); // SceneApp.init loads ui_text_zhCN.json and applies DOM i18n.
        runHooks(window.AppBoot.afterStart, 'afterStart');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

