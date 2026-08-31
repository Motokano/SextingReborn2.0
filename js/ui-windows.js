/**
 * UI 自由窗口系统（设计稿：docs/design/36-ui-windows.md）
 * - 信息面板抽象为「窗口」：可拖拽、可显隐、可锁定、位置记忆（设备级 localStorage）、可重置。
 * - 只存「被覆盖的窗口」：未自定义的窗口不写持久化条目，加载时用 CSS 默认（默认布局 = 设计稿）。
 * - 持久化带 schema 校验 + clamp：任何非法条目丢弃回退默认；加载后尺寸/坐标夹回视口内。
 *
 * 公开 API：
 * - UIWindows.registerPanel(id, spec)  注册窗口（幂等；el 可为元素或获取函数，支持后创建）
 * - UIWindows.init()                   对所有已注册窗口应用布局 + 绑定拖拽（幂等）
 * - UIWindows.applyLayout(id)          应用持久化布局或默认布局 + 显隐合并（可随时再调）
 * - UIWindows.bindPanel(id)            绑定拖拽/缩放（幂等）
 * - UIWindows.resetWindow(id)          该窗口恢复默认布局
 * - UIWindows.resetAll()               全部恢复默认 + 解锁
 * - UIWindows.setVisible(id, visible)  玩家偏好显隐（持久化）
 * - UIWindows.setGameVisible(id, v)    游戏门控显隐（运行时，不持久化）
 * - UIWindows.getVisible(id)           当前最终可见性（游戏门控 && 玩家偏好）
 * - UIWindows.setLock(v) / getLock()   全局锁定布局（锁定时禁止拖拽/缩放）
 * - UIWindows.clampWindow(id)          重新 clamp 到视口内
 * - UIWindows.hideLayer(id)/restoreLayer(id)/hideAll()  剧情演出用（8 层 UI 逐层打没）
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'ui_windows_v1';
    var STORAGE_VERSION = 1;
    var SAVE_DEBOUNCE_MS = 200;
    var VIEW_MARGIN_RIGHT = 8;
    var DEFAULT_MIN_W = 160;
    var DEFAULT_MIN_H = 64;
    var MAX_H_RATIO = 0.72; // 高度上限：视口高度比例（沿用 game-log 既有上限）

    var registry = {};    // id -> spec
    var stored = {};      // id -> { x, y, w, h, visible }（持久化覆盖，仅自定义过的窗口）
    var rawStored = {};   // id -> 原始持久化条目（注册前暂存；注册时校验归属）
    var lock = false;
    var gameVisibleMap = {}; // id -> boolean（运行时游戏门控）
    var boundIds = {};    // id -> true（已绑定拖拽，防重复）
    var saveTimer = null;
    var zTop = 30;        // 拖动 z-index 计数器（点谁谁在前；上限见 Z_CAP）
    var Z_CAP = 38;       // 低于 #dialogue-input-blocker (z-40) 与对话面板 (z-50)

    function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

    function getEl(spec) {
        if (!spec) return null;
        if (typeof spec.el === 'function') {
            try { return spec.el(); } catch (e) { return null; }
        }
        return spec.el || null;
    }

    function parsePx(v, fallback) {
        var n = parseFloat(v);
        return isFinite(n) ? n : fallback;
    }

    function clampNum(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function maxWindowHeight() {
        return Math.max(DEFAULT_MIN_H, Math.floor(global.innerHeight * MAX_H_RATIO));
    }

    function maxWindowWidthForLeft(leftPx) {
        return Math.max(DEFAULT_MIN_W, global.innerWidth - VIEW_MARGIN_RIGHT - leftPx);
    }

    // ---------------------------------------------------------------
    // 持久化（localStorage，设备级）
    // ---------------------------------------------------------------

    /**
     * 读取持久化到 rawStored（不依赖注册表：模块加载时注册表可能为空）。
     * 只做形状校验（有限数/布尔），归属与 min 夹紧在 registerPanel 时完成。
     * 正常路径不重置 stored（已收编/拖拽产生的条目保留）；版本不符/异常时整体重置。
     * 返回 true 表示存在被丢弃的条目（版本不符/非法），调用方应清理写回。
     */
    function readStorage() {
        rawStored = {};
        var discarded = false;
        try {
            var raw = global.localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            var data = JSON.parse(raw);
            if (!isObj(data) || data.version !== STORAGE_VERSION) {
                // 版本不符 → 整体丢弃重建（lock 一并重置）
                stored = {};
                lock = false;
                return true;
            }
            lock = !!data.lock;
            var wins = isObj(data.windows) ? data.windows : {};
            for (var id in wins) {
                if (!Object.prototype.hasOwnProperty.call(wins, id)) continue;
                var e = wins[id];
                if (!isObj(e)) { discarded = true; continue; }
                var entry = parseRawEntry(e);
                if (!entry) { discarded = true; continue; }
                rawStored[id] = entry;
            }
            return discarded;
        } catch (e0) {
            rawStored = {};
            stored = {};
            lock = false;
            return true;
        }
    }

    /**
     * 解析单条持久化条目（宽松：位置/显隐/最小化/任务条位置 任一存在即有效）。
     * 返回 null 表示非法（丢弃）。
     */
    function parseRawEntry(e) {
        var hasPos = isFinite(parsePx(e.x, NaN)) && isFinite(parsePx(e.y, NaN)) &&
            isFinite(parsePx(e.w, NaN)) && isFinite(parsePx(e.h, NaN));
        var hasVisible = e.visible === false;
        var hasMin = e.minimized === true;
        var hasBar = isFinite(parsePx(e.barX, NaN)) && isFinite(parsePx(e.barY, NaN));
        if (!hasPos && !hasVisible && !hasMin && !hasBar) return null; // 空操作/非法 → 丢弃
        var entry = { visible: e.visible !== false };
        if (hasPos) {
            entry.x = parsePx(e.x, 0);
            entry.y = parsePx(e.y, 0);
            entry.w = parsePx(e.w, 0);
            entry.h = parsePx(e.h, 0);
        }
        if (hasMin) entry.minimized = true;
        if (hasBar) {
            entry.barX = parsePx(e.barX, 0);
            entry.barY = parsePx(e.barY, 0);
        }
        return entry;
    }

    /** 窗口注册时：把原始条目按该窗口 spec 校验夹紧后收编进 stored；未知 id 永不收编（自然丢弃） */
    function adoptRawEntry(id, spec) {
        var raw = rawStored[id];
        if (!raw) return;
        delete rawStored[id];
        var entry = { visible: raw.visible !== false };
        if (isFinite(raw.x) && isFinite(raw.y) && isFinite(raw.w) && isFinite(raw.h)) {
            var minW = (spec && spec.minW) || DEFAULT_MIN_W;
            var minH = (spec && spec.minH) || DEFAULT_MIN_H;
            entry.x = raw.x;
            entry.y = raw.y;
            entry.w = Math.max(minW, raw.w);
            entry.h = Math.max(minH, raw.h);
        }
        if (raw.minimized === true) entry.minimized = true;
        if (isFinite(raw.barX) && isFinite(raw.barY)) {
            entry.barX = raw.barX;
            entry.barY = raw.barY;
        }
        stored[id] = entry;
    }

    function writeStorageNow() {
        var wins = {};
        for (var id in stored) {
            if (!Object.prototype.hasOwnProperty.call(stored, id)) continue;
            wins[id] = stored[id];
        }
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: STORAGE_VERSION,
                lock: lock,
                windows: wins
            }));
        } catch (e0) { /* 配额/隐私模式：忽略，仅本次会话有效 */ }
    }

    function scheduleSave() {
        if (saveTimer) global.clearTimeout(saveTimer);
        saveTimer = global.setTimeout(function () {
            saveTimer = null;
            writeStorageNow();
        }, SAVE_DEBOUNCE_MS);
    }

    // ---------------------------------------------------------------
    // 布局应用
    // ---------------------------------------------------------------

    /** 未自定义时的默认布局（与设计稿/CSS 一致） */
    function applyDefaultLayout(spec, el) {
        if (spec.defaultPos === 'fullwidth-bottom') {
            // 贴底全宽（win-log 现状；与 #game-log-panel CSS 一致）
            el.style.position = 'fixed';
            el.style.left = '0';
            el.style.right = '0';
            el.style.width = 'auto';
            el.style.bottom = '0';
            el.style.top = 'auto';
            el.style.height = (spec.defaultSize && spec.defaultSize.h) ? spec.defaultSize.h + 'px' : '100px';
            el.style.maxHeight = '';
            return;
        }
        if (isObj(spec.defaultPos)) {
            // 固定像素位
            el.style.position = 'fixed';
            el.style.left = spec.defaultPos.x + 'px';
            el.style.top = spec.defaultPos.y + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            if (spec.defaultSize && spec.defaultSize.w) el.style.width = spec.defaultSize.w + 'px';
            if (spec.defaultSize && spec.defaultSize.h) el.style.height = spec.defaultSize.h + 'px';
            return;
        }
        // 'dock'（默认）：保留文档流位置，清除内联定位
        el.style.position = '';
        el.style.left = '';
        el.style.top = '';
        el.style.right = '';
        el.style.bottom = '';
        el.style.width = '';
        el.style.height = '';
    }

    /** 应用持久化覆盖布局（像素盒） */
    function applyStoredLayout(spec, el, entry) {
        el.style.position = 'fixed';
        el.style.left = Math.round(entry.x) + 'px';
        el.style.top = Math.round(entry.y) + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.width = Math.round(entry.w) + 'px';
        el.style.height = Math.round(entry.h) + 'px';
        el.style.maxHeight = '';
    }

    /** 当前最终可见性 = 游戏门控 && 玩家偏好 */
    function isEffectivelyVisible(id) {
        var spec = registry[id];
        var entry = stored[id];
        if (spec && typeof spec.gameVisible === 'function') {
            if (!spec.gameVisible()) return false;
        }
        if (gameVisibleMap[id] === false) return false;
        if (entry) return entry.visible !== false;
        return true;
    }

    /** 应用显隐（合并游戏门控与玩家偏好）；displayManaged=false 时只回调不碰 style.display */
    function applyVisibility(id) {
        var spec = registry[id];
        if (!spec) return;
        var el = getEl(spec);
        if (!el) return;
        var visible = isEffectivelyVisible(id);
        var minimized = !!(stored[id] && stored[id].minimized === true);
        if (spec.displayManaged !== false) {
            el.style.display = (visible && !minimized) ? '' : 'none';
        }
        syncTaskBar(id); // 任务条显示条件：minimized && 游戏门控 && 玩家偏好
        if (spec.onVisibility && typeof spec.onVisibility === 'function') {
            try { spec.onVisibility(el, visible); } catch (e0) { /* ignore */ }
        }
    }

    /** 应用某窗口的完整布局（位置 + 显隐） */
    function applyLayout(id) {
        var spec = registry[id];
        if (!spec) return;
        var el = getEl(spec);
        if (!el) return;
        var entry = stored[id];
        var hasPos = entry && isFinite(entry.x) && isFinite(entry.y) && isFinite(entry.w) && isFinite(entry.h);
        if (hasPos) applyStoredLayout(spec, el, entry);
        else applyDefaultLayout(spec, el);
        applyVisibility(id);
        if (spec.onLayout && typeof spec.onLayout === 'function') {
            try { spec.onLayout(el); } catch (e0) { /* ignore */ }
        }
    }

    /** 把当前 rect 转成固定像素盒（拖拽/缩放前调用；贴底全宽窗口首次拖动时用） */
    function ensureFixedPixelBox(spec, el) {
        var r = el.getBoundingClientRect();
        var w = Math.min(r.width, maxWindowWidthForLeft(r.left));
        var h = Math.min(r.height, maxWindowHeight());
        var minW = spec.minW || DEFAULT_MIN_W;
        var minH = spec.minH || DEFAULT_MIN_H;
        if (w < minW) w = minW;
        if (h < minH) h = minH;
        el.style.position = 'fixed';
        el.style.left = r.left + 'px';
        el.style.top = r.top + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        el.style.maxHeight = '';
        clampWindowRect(spec, el);
    }

    /** 单窗口 clamp：左/上不出视口、右/下不出视口、宽高不低于 min、宽不超视口 */
    function clampWindowRect(spec, el) {
        var minW = spec.minW || DEFAULT_MIN_W;
        var minH = spec.minH || DEFAULT_MIN_H;
        var r = el.getBoundingClientRect();
        var l = r.left;
        var w = r.width;
        var t = r.top;
        var h = r.height;

        if (l < 0) { w = Math.max(minW, w + l); l = 0; }
        var maxW = maxWindowWidthForLeft(l);
        if (w > maxW) w = maxW;
        if (w < minW) w = minW;
        if (l + w > global.innerWidth - VIEW_MARGIN_RIGHT) {
            l = Math.max(0, global.innerWidth - VIEW_MARGIN_RIGHT - w);
        }

        if (t < 0) { h = Math.max(minH, h + t); t = 0; }
        var maxH = maxWindowHeight();
        if (h > maxH) h = maxH;
        if (h < minH) h = minH;
        if (t + h > global.innerHeight) t = Math.max(0, global.innerHeight - h);

        el.style.left = Math.round(l) + 'px';
        el.style.top = Math.round(t) + 'px';
        el.style.width = Math.round(w) + 'px';
        el.style.height = Math.round(h) + 'px';
    }

    function clampWindow(id) {
        var spec = registry[id];
        if (!spec) return;
        var el = getEl(spec);
        if (!el) return;
        var entry = stored[id];
        // 无持久化条目或仅可见性覆盖（无位置）：默认布局由 CSS 管，clamp 会破坏贴底全宽等语义 → 跳过
        if (!entry || !isFinite(entry.x) || !isFinite(entry.y) || !isFinite(entry.w) || !isFinite(entry.h)) {
            if (spec.onLayout && typeof spec.onLayout === 'function') {
                try { spec.onLayout(el); } catch (e0) { /* ignore */ }
            }
            return;
        }
        clampWindowRect(spec, el);
        // 同步回持久化条目（防改分辨率后坐标漂移）
        var r = el.getBoundingClientRect();
        entry.x = r.left;
        entry.y = r.top;
        entry.w = r.width;
        entry.h = r.height;
        if (spec.onLayout && typeof spec.onLayout === 'function') {
            try { spec.onLayout(el); } catch (e0) { /* ignore */ }
        }
    }

    // ---------------------------------------------------------------
    // 拖拽 / 缩放（公共实现，从 game-log 既有逻辑泛化）
    // ---------------------------------------------------------------

    /** 点谁谁在前：拖动/缩放开始时提升窗口 z-index（上限 Z_CAP，低于对话屏蔽层 z-40） */
    function raiseWindow(spec, el) {
        if (!el) return;
        zTop = Math.min(zTop + 1, Z_CAP);
        el.style.zIndex = String(zTop);
    }

    function bindPanel(id) {
        var spec = registry[id];
        if (!spec) return;
        if (boundIds[id]) return;
        if (spec.type === 'anchored') return; // 锚定窗口：仅显隐，不绑定拖拽/缩放
        var el = getEl(spec);
        if (!el) return;

        var header = null;
        if (spec.dragHandle) {
            header = el.querySelector(spec.dragHandle);
        } else {
            header = el.querySelector('.ui-window-grip') || el.querySelector('.ui-window-title') || el;
        }
        if (!header) return;

        // 关闭按钮（spec.closable !== false 且有 .ui-window-close 时）
        if (spec.closable !== false) {
            var closeEl = el.querySelector('.ui-window-close');
            if (closeEl) {
                closeEl.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    setVisible(id, false);
                });
            }
            // 最小化按钮（RO 式：收起为任务条；displayManaged=false 的窗口不支持）
            if (spec.displayManaged !== false) {
                var minEl = el.querySelector('.ui-window-min');
                if (minEl) {
                    minEl.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        minimizeWindow(id);
                    });
                }
            }
        }

        // grip 专属：点击不冒泡（details summary 场景：点 grip 不应折叠/展开）
        if (header.classList && header.classList.contains('ui-window-grip')) {
            header.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
            });
        }

        var handles = {};
        if (spec.handles && isObj(spec.handles)) {
            for (var hk in spec.handles) {
                if (!Object.prototype.hasOwnProperty.call(spec.handles, hk)) continue;
                var sel = spec.handles[hk];
                if (!sel) continue;
                var hEl = el.querySelector(sel);
                if (hEl) handles[hk] = hEl;
            }
        }

        boundIds[id] = true;

        var mode = null;
        var startX = 0, startY = 0;
        var startLeft = 0, startTop = 0, startW = 0, startH = 0;
        var startBottomEdge = 0; // 顶部手柄缩放时保持底边不动
        var startRightEdge = 0;  // 左侧手柄缩放时保持右边不动

        function isLocked() { return lock; }

        header.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (isLocked()) return;
            if (e.target && e.target.closest && e.target.closest('button')) return;
            e.preventDefault();
            raiseWindow(spec, el);
            mode = 'move';
            ensureFixedPixelBox(spec, el);
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parsePx(el.style.left, 0);
            startTop = parsePx(el.style.top, 0);
            if (header.classList) header.classList.add('ui-window-dragging');
        });

        if (handles.top) {
            handles.top.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                if (isLocked()) return;
                e.preventDefault();
                e.stopPropagation();
                raiseWindow(spec, el);
                mode = 'height';
                ensureFixedPixelBox(spec, el);
                startY = e.clientY;
                startH = el.getBoundingClientRect().height;
                startBottomEdge = el.getBoundingClientRect().bottom;
                if (handles.top.classList) handles.top.classList.add('ui-window-resize-active');
            });
        }

        if (handles.right) {
            handles.right.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                if (isLocked()) return;
                e.preventDefault();
                e.stopPropagation();
                raiseWindow(spec, el);
                mode = 'width';
                ensureFixedPixelBox(spec, el);
                startX = e.clientX;
                startW = el.getBoundingClientRect().width;
                if (handles.right.classList) handles.right.classList.add('ui-window-resize-active');
            });
        }

        if (handles.left) {
            handles.left.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                if (isLocked()) return;
                e.preventDefault();
                e.stopPropagation();
                raiseWindow(spec, el);
                mode = 'widthLeft';
                ensureFixedPixelBox(spec, el);
                startX = e.clientX;
                var rr = el.getBoundingClientRect();
                startLeft = rr.left;
                startW = rr.width;
                startRightEdge = rr.right;
                if (handles.left.classList) handles.left.classList.add('ui-window-resize-active');
            });
        }

        document.addEventListener('mousemove', function (e) {
            if (!mode) return;
            if (isLocked()) { mode = null; return; }
            var minW = spec.minW || DEFAULT_MIN_W;
            var minH = spec.minH || DEFAULT_MIN_H;
            var maxH = maxWindowHeight();
            if (mode === 'move') {
                var dx = e.clientX - startX;
                var dy = e.clientY - startY;
                var rect = el.getBoundingClientRect();
                var w = rect.width;
                var h = rect.height;
                var newL = Math.max(0, Math.min(startLeft + dx, global.innerWidth - w));
                var newT = Math.max(0, Math.min(startTop + dy, global.innerHeight - h));
                el.style.left = newL + 'px';
                el.style.top = newT + 'px';
            } else if (mode === 'height') {
                // 顶部手柄：改高度，保持底边不动
                var newH = Math.round(startH - (e.clientY - startY));
                if (newH < minH) newH = minH;
                if (newH > maxH) newH = maxH;
                var bottom = startBottomEdge;
                el.style.height = newH + 'px';
                el.style.top = Math.round(bottom - newH) + 'px';
            } else if (mode === 'width') {
                var newW = Math.round(startW + (e.clientX - startX));
                var l = parsePx(el.style.left, 0);
                var maxW = maxWindowWidthForLeft(l);
                if (newW < minW) newW = minW;
                if (newW > maxW) newW = maxW;
                el.style.width = newW + 'px';
            } else if (mode === 'widthLeft') {
                var newL2 = Math.round(startLeft + (e.clientX - startX));
                var maxL = startRightEdge - minW;
                if (newL2 < 0) newL2 = 0;
                if (newL2 > maxL) newL2 = maxL;
                var newW2 = startRightEdge - newL2;
                el.style.left = newL2 + 'px';
                el.style.width = newW2 + 'px';
            }
            if (spec.onLayout && typeof spec.onLayout === 'function') {
                try { spec.onLayout(el); } catch (e0) { /* ignore */ }
            }
        });

        function endDrag() {
            if (!mode) return;
            if (header.classList) header.classList.remove('ui-window-dragging');
            if (handles.top && handles.top.classList) handles.top.classList.remove('ui-window-resize-active');
            if (handles.right && handles.right.classList) handles.right.classList.remove('ui-window-resize-active');
            if (handles.left && handles.left.classList) handles.left.classList.remove('ui-window-resize-active');
            clampWindowRect(spec, el);
            // 同步持久化（仅自定义过的窗口；首次拖拽即视为自定义）
            var r = el.getBoundingClientRect();
            var entry = stored[id] || {};
            var minW = spec.minW || DEFAULT_MIN_W;
            var minH = spec.minH || DEFAULT_MIN_H;
            entry.x = r.left;
            entry.y = r.top;
            entry.w = Math.max(minW, r.width);
            entry.h = Math.max(minH, r.height);
            if (entry.visible === undefined) entry.visible = true;
            stored[id] = entry;
            scheduleSave();
            if (spec.onLayout && typeof spec.onLayout === 'function') {
                try { spec.onLayout(el); } catch (e0) { /* ignore */ }
            }
            mode = null;
        }
        document.addEventListener('mouseup', endDrag);

        if (spec.dblclickReset !== false) {
            header.addEventListener('dblclick', function (e) {
                if (e.target && e.target.closest && e.target.closest('button')) return;
                if (isLocked()) return;
                resetWindow(id);
            });
        }

        var resizeT = null;
        global.addEventListener('resize', function () {
            if (resizeT) global.clearTimeout(resizeT);
            resizeT = global.setTimeout(function () {
                resizeT = null;
                if (stored[id]) clampWindow(id);
                else if (spec.onLayout && typeof spec.onLayout === 'function') {
                    try { spec.onLayout(el); } catch (e0) { /* ignore */ }
                }
            }, 80);
        });
    }

    // ---------------------------------------------------------------
    // 公开 API
    // ---------------------------------------------------------------

    /** 注册窗口（幂等：重复注册覆盖元数据，不清已持久化布局） */
    function registerPanel(id, spec) {
        if (!id || !isObj(spec)) return null;
        var prev = registry[id];
        registry[id] = spec;
        // 首次注册：收编持久化原始条目（按本窗口 min 夹紧）；重复注册：保留既有 stored
        if (!prev) {
            adoptRawEntry(id, spec);
        } else if (stored[id]) {
            // 保留已持久化条目；若新 spec 的 min 更大则重新夹紧
            var s = stored[id];
            var minW = spec.minW || DEFAULT_MIN_W;
            var minH = spec.minH || DEFAULT_MIN_H;
            if (s.w < minW || s.h < minH) {
                s.w = Math.max(minW, s.w);
                s.h = Math.max(minH, s.h);
                scheduleSave();
            }
        }
        return registry[id];
    }

    /** 对所有已注册窗口应用布局 + 绑定拖拽（幂等，可重复调用） */
    function init() {
        var discarded = readStorage();
        // 收编：rawStored 中已注册但尚未收编的条目（覆盖 registerPanel 之前的时序变化）
        for (var rid2 in rawStored) {
            if (!Object.prototype.hasOwnProperty.call(rawStored, rid2)) continue;
            if (registry[rid2] && !stored[rid2]) adoptRawEntry(rid2, registry[rid2]);
        }
        // 未知 id：持久化中残留、但从未注册的窗口（版本残留）→ 丢弃并清理写回
        for (var rid in rawStored) {
            if (!Object.prototype.hasOwnProperty.call(rawStored, rid)) continue;
            if (!registry[rid]) {
                delete rawStored[rid];
                discarded = true;
            }
        }
        for (var id in registry) {
            if (!Object.prototype.hasOwnProperty.call(registry, id)) continue;
            applyLayout(id);
            bindPanel(id);
        }
        // 读取时发现被丢弃的条目（非法/未知 id/版本不符）→ 立即同步清理写回，避免残留
        if (discarded) {
            try { writeStorageNow(); } catch (e0) { /* ignore */ }
        }
    }

    function resetWindow(id) {
        var spec = registry[id];
        if (!spec) return;
        var el = getEl(spec);
        if (el) {
            delete stored[id];
            applyDefaultLayout(spec, el);
            applyVisibility(id);
            if (spec.onLayout && typeof spec.onLayout === 'function') {
                try { spec.onLayout(el); } catch (e0) { /* ignore */ }
            }
        }
        // 低频操作：同步落盘，确保重置立即生效（不依赖防抖窗口）
        try { writeStorageNow(); } catch (e0) { /* ignore */ }
    }

    function resetAll() {
        for (var id in registry) {
            if (!Object.prototype.hasOwnProperty.call(registry, id)) continue;
            resetWindow(id);
        }
        lock = false;
        try { writeStorageNow(); } catch (e0) { /* ignore */ }
    }

    function setVisible(id, visible) {
        var spec = registry[id];
        if (!spec) return;
        var entry = stored[id];
        if (visible && !(entry && isFinite(entry.x) && isFinite(entry.y) && isFinite(entry.w) && isFinite(entry.h))) {
            // 显示且无自定义位置 → 无覆盖可存，直接删除条目（保持默认布局）
            delete stored[id];
            applyVisibility(id);
            scheduleSave();
            return;
        }
        if (!entry) entry = {};
        entry.visible = !!visible;
        stored[id] = entry;
        applyVisibility(id);
        scheduleSave();
    }

    /** 仅本次会话强制显示（不持久化）：供 DialogueUI.open 等叙事场景使用（36 §4.5 对话安全） */
    function forceVisible(id) {
        var spec = registry[id];
        if (!spec) return;
        var entry = stored[id];
        if (entry) {
            entry.visible = true;
            stored[id] = entry;
        } else {
            delete stored[id];
        }
        applyVisibility(id);
    }

    function setGameVisible(id, v) {
        gameVisibleMap[id] = !!v;
        if (registry[id]) applyVisibility(id);
    }

    function getVisible(id) {
        return isEffectivelyVisible(id);
    }

    function setLock(v) {
        lock = !!v;
        try { writeStorageNow(); } catch (e0) { /* ignore */ } // 低频操作：同步落盘
    }

    function getLock() { return lock; }

    /** 窗口列表（供窗口列表菜单渲染）：只列当前已解锁（游戏门控放行）的窗口 */
    function getPanelList() {
        var out = [];
        for (var id in registry) {
            if (!Object.prototype.hasOwnProperty.call(registry, id)) continue;
            var spec = registry[id];
            if (!spec) continue;
            if (typeof spec.gameVisible === 'function' && !spec.gameVisible()) continue; // 认知论：未解锁不占位
            out.push({
                id: id,
                titleKey: spec.titleKey || ('ui.windows.' + id),
                visible: isEffectivelyVisible(id),
                minimized: !!(stored[id] && stored[id].minimized === true),
                closable: spec.closable !== false,
                type: spec.type || 'free'
            });
        }
        return out;
    }

    function hideLayer(id) { setVisible(id, false); }

    function restoreLayer(id) { setVisible(id, true); }

    function hideAll() {
        for (var id in registry) {
            if (!Object.prototype.hasOwnProperty.call(registry, id)) continue;
            setVisible(id, false);
        }
    }

    // ---------------------------------------------------------------
    // 最小化任务条（RO 式：窗口收起 → 画面底部一条可拖拽任务条，可恢复）
    // ---------------------------------------------------------------

    /** 任务条 DOM id 前缀 */
    var BAR_ID_PREFIX = 'ui-window-bar-';
    /** 任务条默认横向排布：从底部居中开始向左/右排，避免互相重叠 */
    var BAR_GAP = 6;
    /** 任务条距视口底部（px）：避开贴底日志(100px) + 快捷腰带(≈106px)，保证默认可见不被盖住 */
    var BAR_BOTTOM = 122;
    var BAR_W = 150;
    var BAR_H = 28;
    /** 任务条拖拽单例状态（模块级只绑一次 document 监听，避免反复 minimize 泄漏） */
    var barDrag = null;

    function taskBarTitle(id) {
        var spec = registry[id];
        var key = (spec && spec.titleKey) || ('ui.windows.' + id);
        try {
            if (global.UIText && typeof global.UIText.t === 'function') return global.UIText.t(key);
        } catch (e0) { /* fallback */ }
        return id;
    }

    function getBarEl(id) {
        if (!global.document) return null;
        return global.document.getElementById(BAR_ID_PREFIX + id);
    }

    /** 计算任务条默认位置：底部居中排布，新任务条往左补位 */
    function defaultBarPosition(id) {
        var count = 0;
        for (var k in stored) {
            if (!Object.prototype.hasOwnProperty.call(stored, k)) continue;
            if (k === id) continue;
            if (stored[k] && stored[k].minimized === true) count++;
        }
        var total = count * (BAR_W + BAR_GAP);
        var startX = Math.max(0, (global.innerWidth - total) / 2 - (BAR_W + BAR_GAP));
        var x = Math.max(0, startX);
        var y = Math.max(0, global.innerHeight - BAR_BOTTOM - BAR_H);
        return { x: Math.round(x), y: Math.round(y) };
    }

    /** 创建任务条（幂等：已存在则返回） */
    function ensureTaskBar(id) {
        var spec = registry[id];
        if (!spec || spec.displayManaged === false) return null; // displayManaged=false 窗口不最小化（DOM 归外部管）
        if (!global.document || typeof global.document.createElement !== 'function') return null;
        var bar = getBarEl(id);
        if (bar) return bar;
        bar = global.document.createElement('div');
        bar.id = BAR_ID_PREFIX + id;
        bar.className = 'ui-window-bar';
        bar.setAttribute('data-win-id', id);
        bar.innerHTML = '<span class="ui-window-bar-label"></span>' +
            '<button type="button" class="ui-window-bar-restore" title="' + taskBarTitle('restore_hint') + '">↥</button>';
        var labelEl = bar.querySelector('.ui-window-bar-label');
        if (labelEl) labelEl.textContent = taskBarTitle(id);
        // 位置：持久化 barX/barY 优先，否则默认排布
        var entry = stored[id];
        var x = (entry && isFinite(entry.barX)) ? entry.barX : null;
        var y = (entry && isFinite(entry.barY)) ? entry.barY : null;
        var pos = (x != null && y != null) ? { x: x, y: y } : defaultBarPosition(id);
        bar.style.left = pos.x + 'px';
        bar.style.top = pos.y + 'px';
        global.document.body.appendChild(bar);

        // 恢复按钮
        var restoreBtn = bar.querySelector('.ui-window-bar-restore');
        if (restoreBtn) {
            restoreBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                restoreWindow(id);
            });
        }
        // 任务条自身拖拽（点恢复键除外）
        bindBarDrag(bar);
        return bar;
    }

    /** 移除任务条（幂等） */
    function removeTaskBar(id) {
        var bar = getBarEl(id);
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    }

    /** 同步任务条显隐：minimized && 游戏门控 && 玩家偏好 时显示 */
    function syncTaskBar(id) {
        var spec = registry[id];
        if (!spec) return;
        var minimized = !!(stored[id] && stored[id].minimized === true);
        if (minimized && isEffectivelyVisible(id) && spec.displayManaged !== false) {
            ensureTaskBar(id);
        } else {
            removeTaskBar(id);
        }
    }

    /** 绑定任务条拖拽（模块级单例：document 监听只绑一次，barDrag 记录当前拖动目标） */
    function bindBarDrag(bar) {
        var id = bar.getAttribute('data-win-id');
        bar.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (lock) return;
            if (e.target && e.target.closest && e.target.closest('button')) return;
            e.preventDefault();
            var r = bar.getBoundingClientRect ? bar.getBoundingClientRect() : { left: 0, top: 0 };
            barDrag = {
                id: id,
                el: bar,
                startX: e.clientX,
                startY: e.clientY,
                left: r.left,
                top: r.top,
                moved: false
            };
            if (bar.classList) bar.classList.add('ui-window-bar-dragging');
        });
        if (!global._uiWindowBarDragBound) {
            global._uiWindowBarDragBound = true;
            global.document.addEventListener('mousemove', function (e) {
                if (!barDrag) return;
                var dx = e.clientX - barDrag.startX;
                var dy = e.clientY - barDrag.startY;
                var w = barDrag.el.offsetWidth || BAR_W;
                var h = barDrag.el.offsetHeight || BAR_H;
                var nl = Math.max(0, Math.min(barDrag.left + dx, global.innerWidth - w));
                var nt = Math.max(0, Math.min(barDrag.top + dy, global.innerHeight - h));
                barDrag.el.style.left = nl + 'px';
                barDrag.el.style.top = nt + 'px';
                barDrag.moved = true;
            });
            global.document.addEventListener('mouseup', function () {
                if (!barDrag) return;
                if (barDrag.el.classList) barDrag.el.classList.remove('ui-window-bar-dragging');
                // 持久化任务条位置
                var entry = stored[barDrag.id] || {};
                entry.barX = parsePx(barDrag.el.style.left, 0);
                entry.barY = parsePx(barDrag.el.style.top, 0);
                stored[barDrag.id] = entry;
                scheduleSave();
                barDrag = null;
            });
        }
    }

    /** 最小化：窗口收起，留任务条 */
    function minimizeWindow(id) {
        var spec = registry[id];
        if (!spec) return;
        if (spec.displayManaged === false) return; // 不支持最小化（DOM 归外部管）
        if (!isEffectivelyVisible(id)) return;    // 当前不可见则无意义
        var entry = stored[id] || {};
        entry.minimized = true;
        stored[id] = entry;
        applyVisibility(id);
        // 低频操作：同步落盘（玩家点击一次即生效）
        try { writeStorageNow(); } catch (e0) { /* ignore */ }
    }

    /** 恢复：移除任务条，窗口按原显隐显示 */
    function restoreWindow(id) {
        var entry = stored[id];
        if (entry) {
            delete entry.minimized;
            stored[id] = entry;
        }
        applyVisibility(id);
        try { writeStorageNow(); } catch (e0) { /* ignore */ }
    }

    function isMinimized(id) {
        return !!(stored[id] && stored[id].minimized === true);
    }

    global.UIWindows = {
        registerPanel: registerPanel,
        init: init,
        applyLayout: applyLayout,
        bindPanel: bindPanel,
        resetWindow: resetWindow,
        resetAll: resetAll,
        setVisible: setVisible,
        setGameVisible: setGameVisible,
        getVisible: getVisible,
        forceVisible: forceVisible,
        setLock: setLock,
        getLock: getLock,
        getPanelList: getPanelList,
        clampWindow: clampWindow,
        minimize: minimizeWindow,
        restore: restoreWindow,
        isMinimized: isMinimized,
        hideLayer: hideLayer,
        restoreLayer: restoreLayer,
        hideAll: hideAll
    };

    // 模块加载时立即读取持久化（布局应用等 init() 统一做）
    try { readStorage(); } catch (e0) { stored = {}; lock = false; }
})(typeof window !== 'undefined' ? window : this);
