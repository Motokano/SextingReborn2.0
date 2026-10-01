/**
 * 游戏实时日志模块
 * 在游戏下方显示行为与战斗信息；默认全宽贴底。
 * 面板拖拽/缩放/持久化已迁移至 UIWindows 管线（docs/design/36-ui-windows.md，win-log 窗口）。
 * 本文件保留内容逻辑与公开 API 兼容：log / clear / getLineCount / bindDragScroll /
 * bindPanelChrome / bindPanelPositionDrag / resetLogPanelLayout / clampLogPanelForLeftHud / syncQuickBeltDock。
 */
(function (global) {
    'use strict';

    var MAX_LINES = 80;
    /** 旧版曾写入 localStorage；启动时清除，避免恢复左下角窄条布局 */
    var LEGACY_PANEL_POS_KEY = 'game_log_panel_pos';
    var CONTAINER_ID = 'game-log-lines';
    var MIN_PANEL_H = 64;
    var MIN_PANEL_W = 220;
    var TYPE_CLASS = {
        info: 'log-info',
        success: 'log-success',
        warn: 'log-warn',
        combat: 'log-combat',
        damage: 'log-damage',
        system: 'log-system'
    };

    /** Compatibility API: shortcut layout now belongs exclusively to UIWindows win-bottom. */
    function syncQuickBeltDockPosition() {
        // Deliberate no-op for existing callers. Never derive quickbar position from the log.
    }

    var lines = [];

    function ensureDOM() {
        var wrap = document.getElementById('game-log-panel');
        if (!wrap) return null;
        var list = document.getElementById(CONTAINER_ID);
        if (!list) {
            list = document.createElement('div');
            list.id = CONTAINER_ID;
            list.className = 'game-log-lines';
            wrap.appendChild(list);
        }
        return list;
    }

    function escapeHtml(s) {
        if (typeof s !== 'string') s = String(s);
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * 追加一条日志
     * @param {string} message - 显示内容（会做 HTML 转义）
     * @param {string} [type] - 类型：info | success | warn | combat | damage | system，默认 info
     */
    function log(message, type) {
        if (message == null || message === '') return;
        type = type || 'info';
        var cssClass = TYPE_CLASS[type] || TYPE_CLASS.info;
        var ts = new Date();
        var timeStr = ('0' + ts.getHours()).slice(-2) + ':' +
            ('0' + ts.getMinutes()).slice(-2) + ':' +
            ('0' + ts.getSeconds()).slice(-2);
        lines.push({
            text: escapeHtml(String(message)),
            type: cssClass,
            time: timeStr
        });
        if (lines.length > MAX_LINES) lines.shift();

        var list = ensureDOM();
        if (!list) return;
        var wasAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= 24;
        var lineEl = document.createElement('div');
        lineEl.className = 'game-log-line ' + cssClass;
        lineEl.setAttribute('data-time', timeStr);
        lineEl.innerHTML = '<span class="log-time">[' + timeStr + ']</span> ' + lines[lines.length - 1].text;
        list.appendChild(lineEl);
        if (wasAtBottom)
            list.scrollTop = list.scrollHeight;
        list.dispatchEvent(new CustomEvent('game-log-appended', { detail: { line: lineEl, wasAtBottom: wasAtBottom } }));
    }

    function clearLegacyPanelLayoutStorage() {
        try { localStorage.removeItem(LEGACY_PANEL_POS_KEY); } catch (e) { /* ignore */ }
    }

    /**
     * 面板拖拽/缩放：注册 win-log 到 UIWindows 管线。
     * 未加载 UIWindows（脚本顺序异常）时静默降级：仅保留内容日志，面板不可拖（可接受）。
     */
    var logPanelSpec = null;
    function defaultLogPosition() {
        // The shared layout uses CSS docking; saved player geometry still takes precedence.
        return document.body && document.body.classList.contains('ui-layout') ? 'dock' : 'fullwidth-bottom';
    }
    function defaultLogHeight() {
        return document.body && document.body.classList.contains('ui-refined')
            ? Math.max(160, Math.min(320, Math.round(window.innerHeight * 0.26))) : 100;
    }
    function refreshDefaultSize() {
        if (!logPanelSpec || !global.UIWindows) return;
        logPanelSpec.defaultPos = defaultLogPosition();
        logPanelSpec.defaultSize.h = defaultLogHeight();
        global.UIWindows.applyLayout('win-log');
    }
    function bindPanelChrome() {
        if (!global.UIWindows || typeof global.UIWindows.registerPanel !== 'function') return;
        clearLegacyPanelLayoutStorage();
        logPanelSpec = global.UIWindows.registerPanel('win-log', {
            type: 'free',
            titleKey: 'ui.windows.log',
            el: function () { return document.getElementById('game-log-panel'); },
            defaultPos: defaultLogPosition(),
            defaultSize: { h: defaultLogHeight() },
            minW: MIN_PANEL_W,
            minH: MIN_PANEL_H,
            closable: false,        // M1：暂不加关闭按钮（M3 窗口列表菜单再开）
            resizable: true,
            dragHandle: '.game-log-header',
            handles: {
                top: '.game-log-resize-handle-top',
                left: '.game-log-resize-handle-left',
                right: '.game-log-resize-handle-right'
            },
            dblclickReset: true
        });
        if (typeof global.UIWindows.init === 'function') global.UIWindows.init();
    }

    /** 兼容旧调用：重置日志面板为当前主题默认布局（委托管线） */
    function resetLogPanelLayout() {
        if (global.UIWindows && typeof global.UIWindows.resetWindow === 'function') {
            global.UIWindows.resetWindow('win-log');
            return;
        }
        // 降级：直接回默认并同步快捷腰带
        var panel = document.getElementById('game-log-panel');
        if (!panel) return;
        panel.style.position = 'fixed';
        panel.style.left = '0';
        panel.style.right = '0';
        panel.style.width = 'auto';
        panel.style.bottom = '0';
        panel.style.top = 'auto';
        panel.style.height = '100px';
        panel.style.maxHeight = '';
        syncQuickBeltDockPosition();
    }

    /** 兼容旧调用：把日志面板 clamp 回视口（委托管线） */
    function clampLogPanelForLeftHud() {
        if (global.UIWindows && typeof global.UIWindows.clampWindow === 'function') {
            global.UIWindows.clampWindow('win-log');
        }
        syncQuickBeltDockPosition();
    }

    function bindDragScroll() {
        var list = document.getElementById(CONTAINER_ID);
        if (!list) return;
        var dragging = false;
        var startY = 0;
        var startScrollTop = 0;
        list.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            dragging = true;
            startY = e.clientY;
            startScrollTop = list.scrollTop;
            list.classList.add('log-dragging');
        });
        document.addEventListener('mousemove', function (e) {
            if (!dragging) return;
            var dy = startY - e.clientY;
            list.scrollTop = Math.max(0, Math.min(list.scrollHeight - list.clientHeight, startScrollTop + dy));
        });
        function stopDrag() {
            dragging = false;
            list.classList.remove('log-dragging');
        }
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('mouseleave', stopDrag);
    }

    function clear() {
        lines.length = 0;
        var list = document.getElementById(CONTAINER_ID);
        if (list) list.innerHTML = '';
    }

    function getLineCount() {
        return lines.length;
    }

    global.GameLog = {
        log: log,
        clear: clear,
        getLineCount: getLineCount,
        bindDragScroll: bindDragScroll,
        bindPanelPositionDrag: bindPanelChrome,
        bindPanelChrome: bindPanelChrome,
        resetLogPanelLayout: resetLogPanelLayout,
        clampLogPanelForLeftHud: clampLogPanelForLeftHud,
        syncQuickBeltDock: syncQuickBeltDockPosition,
        refreshDefaultSize: refreshDefaultSize
    };

    function bindLogUi() {
        bindDragScroll();
        bindPanelChrome();
    }

    if (typeof document !== 'undefined' && document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', bindLogUi);
    else if (typeof document !== 'undefined')
        bindLogUi();
})(typeof window !== 'undefined' ? window : this);
