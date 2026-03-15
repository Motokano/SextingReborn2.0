/**
 * 游戏实时日志模块
 * 在游戏正下方显示玩家行为、战斗信息等，供全局调用 GameLog.log(msg, type)
 */
(function (global) {
    'use strict';

    var MAX_LINES = 80;
    var CONTAINER_ID = 'game-log-lines';
    var TYPE_CLASS = {
        info: 'log-info',
        success: 'log-success',
        warn: 'log-warn',
        combat: 'log-combat',
        damage: 'log-damage',
        system: 'log-system'
    };

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
        // 只有用户在看底部附近时才自动滚到底，方便翻看历史时不被打断
        var threshold = 24;
        if (list.scrollHeight - list.scrollTop - list.clientHeight <= threshold)
            list.scrollTop = list.scrollHeight;
    }

    /** 为日志区域绑定拖拽滚动（向上/向下拖动翻看） */
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

    /** 清空当前显示的日志（内存与 DOM 一并清空） */
    function clear() {
        lines.length = 0;
        var list = document.getElementById(CONTAINER_ID);
        if (list) list.innerHTML = '';
    }

    /** 获取当前日志条数 */
    function getLineCount() {
        return lines.length;
    }

    global.GameLog = {
        log: log,
        clear: clear,
        getLineCount: getLineCount,
        bindDragScroll: bindDragScroll
    };

    if (typeof document !== 'undefined' && document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', bindDragScroll);
    else if (typeof document !== 'undefined')
        bindDragScroll();
})(typeof window !== 'undefined' ? window : this);
