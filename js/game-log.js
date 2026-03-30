/**
 * 游戏实时日志模块
 * 在游戏下方显示行为与战斗信息；默认全宽贴底，可拖移与四向调整大小（存档恢复布局）。
 */
(function (global) {
    'use strict';

    var MAX_LINES = 80;
    var PANEL_POS_KEY = 'game_log_panel_pos';
    var CONTAINER_ID = 'game-log-lines';
    var MIN_PANEL_H = 64;
    var MIN_PANEL_W = 220;
    var VIEW_MARGIN_RIGHT = 8;
    var TYPE_CLASS = {
        info: 'log-info',
        success: 'log-success',
        warn: 'log-warn',
        combat: 'log-combat',
        damage: 'log-damage',
        system: 'log-system'
    };

    /** 快捷腰带底栏与日志面板上沿的间距（px） */
    var QUICK_BELT_DOCK_GAP = 6;

    /**
     * 底部快捷腰带紧贴游戏日志面板上沿（随日志拖拽、改高、窗口缩放同步）
     */
    function syncQuickBeltDockPosition() {
        var panel = document.getElementById('game-log-panel');
        var dock = document.getElementById('bottom-hud-stack');
        if (!panel || !dock) return;
        var rect = panel.getBoundingClientRect();
        var bottomPx = window.innerHeight - rect.top + QUICK_BELT_DOCK_GAP;
        if (!isFinite(bottomPx) || bottomPx < QUICK_BELT_DOCK_GAP) bottomPx = QUICK_BELT_DOCK_GAP;
        dock.style.bottom = bottomPx + 'px';
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
        var lineEl = document.createElement('div');
        lineEl.className = 'game-log-line ' + cssClass;
        lineEl.setAttribute('data-time', timeStr);
        lineEl.innerHTML = '<span class="log-time">[' + timeStr + ']</span> ' + lines[lines.length - 1].text;
        list.appendChild(lineEl);
        var threshold = 24;
        if (list.scrollHeight - list.scrollTop - list.clientHeight <= threshold)
            list.scrollTop = list.scrollHeight;
    }

    function parsePx(styleVal, fallback) {
        var n = parseFloat(styleVal);
        return isFinite(n) ? n : fallback;
    }

    function maxPanelHeight() {
        return Math.max(MIN_PANEL_H, Math.floor(window.innerHeight * 0.72));
    }

    function maxPanelWidthForLeft(leftPx) {
        return Math.max(MIN_PANEL_W, window.innerWidth - VIEW_MARGIN_RIGHT - leftPx);
    }

    /** 不超出视口左右边界、宽度不低于最小值 */
    function clampPanelHorizontal(panel) {
        if (!panel) return;
        var r = panel.getBoundingClientRect();
        var l = r.left;
        var w = r.width;
        if (l < 0) {
            w = Math.max(MIN_PANEL_W, w + l);
            l = 0;
        }
        var maxW = maxPanelWidthForLeft(l);
        if (w > maxW) w = maxW;
        if (w < MIN_PANEL_W) w = MIN_PANEL_W;
        if (l + w > window.innerWidth - VIEW_MARGIN_RIGHT) {
            l = Math.max(0, window.innerWidth - VIEW_MARGIN_RIGHT - w);
        }
        panel.style.left = Math.round(l) + 'px';
        panel.style.width = Math.round(w) + 'px';
        panel.style.right = 'auto';
    }

    function savePanelRect(panel) {
        try {
            var r = panel.getBoundingClientRect();
            localStorage.setItem(PANEL_POS_KEY, JSON.stringify({
                left: r.left,
                bottom: window.innerHeight - r.bottom,
                width: r.width,
                height: r.height
            }));
        } catch (err) { /* ignore */ }
    }

    /** 与 CSS 一致：贴底、横向铺满视口 */
    function applyDefaultFullWidthBottom(panel) {
        panel.style.position = 'fixed';
        panel.style.left = '0';
        panel.style.right = '0';
        panel.style.width = 'auto';
        panel.style.bottom = '0';
        panel.style.top = 'auto';
        panel.style.height = '100px';
        panel.style.maxHeight = '';
    }

    function resetLogPanelLayout() {
        var panel = document.getElementById('game-log-panel');
        if (!panel) return;
        try { localStorage.removeItem(PANEL_POS_KEY); } catch (e) { /* ignore */ }
        applyDefaultFullWidthBottom(panel);
        syncQuickBeltDockPosition();
    }

    function bindPanelChrome() {
        var panel = document.getElementById('game-log-panel');
        var header = panel && panel.querySelector('.game-log-header');
        var topHandle = panel && panel.querySelector('.game-log-resize-handle-top');
        var rightHandle = panel && panel.querySelector('.game-log-resize-handle-right');
        var leftHandle = panel && panel.querySelector('.game-log-resize-handle-left');
        if (!panel || !header) return;

        function applySaved() {
            try {
                var raw = localStorage.getItem(PANEL_POS_KEY);
                if (!raw) return;
                var o = JSON.parse(raw);
                if (o.left == null || o.bottom == null) return;
                var effL = Math.max(0, o.left);
                var maxW = maxPanelWidthForLeft(effL);
                var effW = o.width != null
                    ? Math.min(maxW, Math.max(MIN_PANEL_W, o.width))
                    : maxW;
                panel.style.position = 'fixed';
                panel.style.left = effL + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = Math.max(0, o.bottom) + 'px';
                panel.style.top = 'auto';
                panel.style.width = effW + 'px';
                if (o.height != null) {
                    var h = Math.max(MIN_PANEL_H, Math.min(maxPanelHeight(), o.height));
                    panel.style.height = h + 'px';
                }
                clampPanelHorizontal(panel);
            } catch (e) { /* ignore */ }
        }

        applySaved();
        try {
            if (!localStorage.getItem(PANEL_POS_KEY)) applyDefaultFullWidthBottom(panel);
        } catch (e) {
            applyDefaultFullWidthBottom(panel);
        }

        function ensureFixedPixelBox() {
            var r = panel.getBoundingClientRect();
            panel.style.position = 'fixed';
            panel.style.left = r.left + 'px';
            panel.style.width = Math.min(r.width, maxPanelWidthForLeft(r.left)) + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = (window.innerHeight - r.bottom) + 'px';
            panel.style.top = 'auto';
            panel.style.height = Math.min(r.height, maxPanelHeight()) + 'px';
            clampPanelHorizontal(panel);
        }

        var mode = null;
        var startX = 0;
        var startY = 0;
        var startLeft = 0;
        var startBottom = 0;
        var startW = 0;
        var startH = 0;

        header.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (e.target && e.target.closest && e.target.closest('button')) return;
            mode = 'move';
            ensureFixedPixelBox();
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parsePx(panel.style.left, 0);
            startBottom = parsePx(panel.style.bottom, 0);
            header.classList.add('log-panel-dragging');
            e.preventDefault();
        });

        if (topHandle) {
            topHandle.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                mode = 'height';
                ensureFixedPixelBox();
                startY = e.clientY;
                startH = panel.getBoundingClientRect().height;
                topHandle.classList.add('log-resize-active');
            });
        }

        if (rightHandle) {
            rightHandle.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                mode = 'width';
                ensureFixedPixelBox();
                startX = e.clientX;
                startW = panel.getBoundingClientRect().width;
                rightHandle.classList.add('log-resize-active');
            });
        }

        if (leftHandle) {
            leftHandle.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                mode = 'widthLeft';
                ensureFixedPixelBox();
                startX = e.clientX;
                var rr = panel.getBoundingClientRect();
                startLeft = rr.left;
                startW = rr.width;
                leftHandle.classList.add('log-resize-active');
            });
        }

        document.addEventListener('mousemove', function (e) {
            if (!mode) return;
            if (mode === 'move') {
                var dx = e.clientX - startX;
                var dy = e.clientY - startY;
                var rect = panel.getBoundingClientRect();
                var w = rect.width;
                var h = rect.height;
                var newL = startLeft + dx;
                var newB = startBottom - dy;
                newL = Math.max(0, Math.min(newL, window.innerWidth - w));
                newB = Math.max(0, Math.min(newB, window.innerHeight - h));
                panel.style.left = newL + 'px';
                panel.style.bottom = newB + 'px';
            } else if (mode === 'height') {
                var dyH = e.clientY - startY;
                var newH = Math.round(startH - dyH);
                if (newH < MIN_PANEL_H) newH = MIN_PANEL_H;
                if (newH > maxPanelHeight()) newH = maxPanelHeight();
                panel.style.height = newH + 'px';
            } else if (mode === 'width') {
                var dxW = e.clientX - startX;
                var newW = Math.round(startW + dxW);
                var l = parsePx(panel.style.left, 0);
                var maxW = maxPanelWidthForLeft(l);
                if (newW < MIN_PANEL_W) newW = MIN_PANEL_W;
                if (newW > maxW) newW = maxW;
                panel.style.width = newW + 'px';
            } else if (mode === 'widthLeft') {
                var dxL = e.clientX - startX;
                var rightEdge = startLeft + startW;
                var maxL = rightEdge - MIN_PANEL_W;
                var newL2 = Math.round(startLeft + dxL);
                if (newL2 < 0) newL2 = 0;
                if (newL2 > maxL) newL2 = maxL;
                var newW2 = rightEdge - newL2;
                panel.style.left = newL2 + 'px';
                panel.style.width = newW2 + 'px';
            }
            syncQuickBeltDockPosition();
        });

        document.addEventListener('mouseup', function () {
            if (!mode) return;
            if (mode === 'move') header.classList.remove('log-panel-dragging');
            if (topHandle) topHandle.classList.remove('log-resize-active');
            if (rightHandle) rightHandle.classList.remove('log-resize-active');
            if (leftHandle) leftHandle.classList.remove('log-resize-active');
            clampPanelHorizontal(panel);
            savePanelRect(panel);
            syncQuickBeltDockPosition();
            mode = null;
        });

        header.addEventListener('dblclick', function (e) {
            if (e.target && e.target.closest && e.target.closest('button')) return;
            resetLogPanelLayout();
            savePanelRect(panel);
        });

        var resizeT = null;
        window.addEventListener('resize', function () {
            if (resizeT) clearTimeout(resizeT);
            resizeT = setTimeout(function () {
                resizeT = null;
                clampPanelHorizontal(panel);
                savePanelRect(panel);
                syncQuickBeltDockPosition();
            }, 80);
        });

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
        clampLogPanelForLeftHud: function () {
            var p = document.getElementById('game-log-panel');
            clampPanelHorizontal(p);
            if (p) savePanelRect(p);
            syncQuickBeltDockPosition();
        },
        syncQuickBeltDock: syncQuickBeltDockPosition
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
