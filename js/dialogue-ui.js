/**
 * 底部对话框 UI
 * - 固定高度面板，显示说话人头像 + 名称 + 台词
 * - 头像可为玩家与各 NPC 分别设置（setPortrait），也会尝试从 EntityAppearance 取值
 *
 * 公开 API：
 * - DialogueUI.setPortrait(entityId, imageUrl)
 * - DialogueUI.clearPortrait(entityId)
 * - DialogueUI.open()
 * - DialogueUI.close()
 * - DialogueUI.say({ speakerRole, speakerId, speakerName, text })
 * - DialogueUI.playLinesRich(linesRich, opts?)
 */
(function (global) {
    'use strict';

    var PANEL_ID = 'dialogue-panel';
    var AVATAR_WRAP_ID = 'dialogue-avatar';
    var AVATAR_IMG_ID = 'dialogue-avatar-img';
    var AVATAR_FALLBACK_ID = 'dialogue-avatar-fallback';
    var NAME_ID = 'dialogue-speaker-name';
    var TEXT_ID = 'dialogue-text';
    var OPTIONS_ID = 'dialogue-options';
    var BTN_NEXT_ID = 'dialogue-btn-next';
    var BTN_CLOSE_ID = 'dialogue-btn-close';

    var portraits = {}; // entityId -> url
    var queue = [];
    var isOpen = false;
    var lastActiveEl = null;
    var options = null; // [{ text, next?, effects? }]
    var optionsContext = null; // pass-through context (npcId etc.)
    var lastLoggedKey = null;

    function logDialogueLine(speakerName, text) {
        if (!global.GameLog || typeof global.GameLog.log !== 'function') return;
        var name = speakerName != null ? String(speakerName) : '';
        var t = text != null ? String(text) : '';
        if (!t.trim()) return;
        global.GameLog.log((name ? (name + '：') : '') + t, 'info');
    }

    function logDialogueChoice(choiceText) {
        if (!global.GameLog || typeof global.GameLog.log !== 'function') return;
        if (choiceText == null) return;
        global.GameLog.log('【选择】' + String(choiceText), 'system');
    }

    function $(id) { return document.getElementById(id); }

    function escapeHtml(s) {
        if (typeof s !== 'string') s = String(s);
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeEntityId(role, speakerId) {
        if (speakerId && speakerId !== '') return String(speakerId);
        if (role === 'player') return 'player';
        if (role === 'npc') return 'npc';
        return role || 'unknown';
    }

    function getPortraitUrl(entityId) {
        if (entityId && portraits[entityId]) return portraits[entityId];
        if (global.EntityAppearance && typeof global.EntityAppearance.getEntityAppearance === 'function') {
            return global.EntityAppearance.getEntityAppearance(entityId);
        }
        return null;
    }

    function getFallbackGlyph(role) {
        if (role === 'player') return '👤';
        if (role === 'npc') return '🧑';
        return '❖';
    }

    function ensureBound() {
        var nextBtn = $(BTN_NEXT_ID);
        var closeBtn = $(BTN_CLOSE_ID);
        if (nextBtn && !nextBtn.__dlgBound) {
            nextBtn.__dlgBound = true;
            nextBtn.addEventListener('click', function () { next(); });
        }
        if (closeBtn && !closeBtn.__dlgBound) {
            closeBtn.__dlgBound = true;
            closeBtn.addEventListener('click', function () { close(); });
        }
        if (!document.__dlgKeyBound) {
            document.__dlgKeyBound = true;
            document.addEventListener('keydown', function (e) {
                if (!isOpen) return;
                if (e.key === 'Escape') close();
                if (e.key === 'Enter' || e.key === ' ') {
                    // 避免在输入框里误触（当前对话框没有输入框，但保持通用）
                    var tag = (e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : '';
                    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
                    next();
                }
            });
        }
    }

    function open() {
        ensureBound();
        var panel = $(PANEL_ID);
        if (!panel) return;
        lastActiveEl = document.activeElement || null;
        isOpen = true;
        panel.classList.add('show');
        panel.setAttribute('aria-hidden', 'false');
        // 避免隐藏/显示切换时焦点落在不可见区域
        try {
            panel.removeAttribute('inert');
            var nextBtn = $(BTN_NEXT_ID);
            if (nextBtn && typeof nextBtn.focus === 'function') nextBtn.focus();
        } catch (e) { /* ignore */ }
        renderCurrent();
    }

    function close() {
        var panel = $(PANEL_ID);
        if (!panel) return;
        // 若焦点仍在对话框内，先移走再 aria-hidden
        try {
            var ae = document.activeElement;
            if (ae && panel.contains(ae) && typeof ae.blur === 'function') ae.blur();
            if (document.body && typeof document.body.focus === 'function') document.body.focus();
        } catch (e) { /* ignore */ }
        isOpen = false;
        queue.length = 0;
        options = null;
        optionsContext = null;
        lastLoggedKey = null;
        clearOptionsUi();
        panel.classList.remove('show');
        panel.setAttribute('aria-hidden', 'true');
        // inert 会阻止面板内元素再次获取焦点（比 aria-hidden 更符合“不可交互”语义）
        try { panel.setAttribute('inert', ''); } catch (e) { /* ignore */ }
        // 尝试把焦点还给打开对话框前的控件
        try {
            if (lastActiveEl && typeof lastActiveEl.focus === 'function') lastActiveEl.focus();
        } catch (e) { /* ignore */ }
        lastActiveEl = null;
    }

    function setPortrait(entityId, imageUrl) {
        if (!entityId) return;
        portraits[String(entityId)] = (imageUrl != null && imageUrl !== '') ? String(imageUrl) : '';
        if (isOpen) renderCurrent();
    }

    function clearPortrait(entityId) {
        if (!entityId) return;
        delete portraits[String(entityId)];
        if (isOpen) renderCurrent();
    }

    function say(payload) {
        if (!payload) return;
        var role = payload.speakerRole || 'npc';
        var entityId = normalizeEntityId(role, payload.speakerId);
        options = null;
        optionsContext = null;
        lastLoggedKey = null;
        queue = [{
            speakerRole: role,
            speakerId: entityId,
            speakerName: payload.speakerName || (role === 'player' ? '主角' : 'NPC'),
            text: payload.text || ''
        }];
        open();
    }

    function playLinesRich(linesRich, opts) {
        opts = opts || {};
        if (!Array.isArray(linesRich) || !linesRich.length) return;
        options = Array.isArray(opts.options) ? opts.options : null;
        optionsContext = opts || null;
        lastLoggedKey = null;
        queue = linesRich.map(function (l) {
            var role = (l && l.speaker) ? String(l.speaker) : 'npc';
            var entityId = normalizeEntityId(role, opts.npcId);
            return {
                speakerRole: role,
                speakerId: entityId,
                speakerName: (role === 'player')
                    ? (opts.playerName || '主角')
                    : (opts.npcName || opts.speakerName || 'NPC'),
                text: (l && l.text != null) ? String(l.text) : ''
            };
        });
        open();
    }

    function clearOptionsUi() {
        var wrap = $(OPTIONS_ID);
        if (!wrap) return;
        wrap.innerHTML = '';
        wrap.style.display = 'none';
    }

    function renderOptionsUi() {
        var wrap = $(OPTIONS_ID);
        var nextBtn = $(BTN_NEXT_ID);
        if (!wrap) return;
        wrap.innerHTML = '';
        if (!options || !options.length) {
            wrap.style.display = 'none';
            return;
        }
        wrap.style.display = 'flex';
        // 有选项时，避免用户继续“下一句”导致误关
        if (nextBtn) nextBtn.disabled = true;
        for (var i = 0; i < options.length; i++) {
            (function (opt) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'dlg-option-btn';
                b.textContent = (opt && opt.text != null) ? String(opt.text) : '（无标题选项）';
                b.addEventListener('click', function () {
                    // 选项可选：next 为新的 linesRich；否则仅关闭
                    var next = opt && opt.next;
                    var ctx = optionsContext || {};
                    logDialogueChoice(opt && opt.text != null ? opt.text : '');
                    clearOptionsUi();
                    options = null;
                    optionsContext = null;
                    if (Array.isArray(next) && next.length) {
                        playLinesRich(next, ctx);
                    } else {
                        close();
                    }
                });
                wrap.appendChild(b);
            })(options[i]);
        }
    }

    function renderCurrent() {
        var nameEl = $(NAME_ID);
        var textEl = $(TEXT_ID);
        var avatarWrap = $(AVATAR_WRAP_ID);
        var avatarImg = $(AVATAR_IMG_ID);
        var avatarFallback = $(AVATAR_FALLBACK_ID);
        var nextBtn = $(BTN_NEXT_ID);
        var optionsWrap = $(OPTIONS_ID);

        if (!nameEl || !textEl || !avatarWrap || !avatarImg || !avatarFallback || !nextBtn || !optionsWrap) return;

        if (!queue.length) {
            nameEl.textContent = '';
            textEl.textContent = '';
            avatarWrap.classList.remove('avatar-has-image');
            avatarImg.src = '';
            avatarImg.removeAttribute('src');
            avatarFallback.textContent = '…';
            nextBtn.disabled = true;
            clearOptionsUi();
            return;
        }

        var cur = queue[0];
        nameEl.textContent = cur.speakerName || '';
        textEl.innerHTML = escapeHtml(cur.text || '').replace(/\n/g, '<br>');
        // 同步写入游戏日志（避免重复写同一句）
        try {
            var key = String(cur.speakerName || '') + '|' + String(cur.text || '');
            if (key && key !== lastLoggedKey) {
                lastLoggedKey = key;
                logDialogueLine(cur.speakerName || '', cur.text || '');
            }
        } catch (e0) { /* ignore */ }

        var entityId = cur.speakerId || normalizeEntityId(cur.speakerRole, null);
        var url = getPortraitUrl(entityId);
        var glyph = getFallbackGlyph(cur.speakerRole);
        avatarFallback.textContent = glyph;

        nextBtn.disabled = false;
        nextBtn.textContent = (queue.length > 1) ? '下一句' : '结束';
        clearOptionsUi();
        if (queue.length === 1) {
            // 最后一条显示完后，如果有 options，则展示选项并锁定 next
            // 这里不等用户点“结束”，避免体验割裂。
            // 注意：renderOptionsUi 内部会把 nextBtn.disabled = true
            renderOptionsUi();
        }

        if (!url) {
            avatarWrap.classList.remove('avatar-has-image');
            avatarImg.src = '';
            avatarImg.removeAttribute('src');
            return;
        }

        avatarImg.onload = function () { avatarWrap.classList.add('avatar-has-image'); };
        avatarImg.onerror = function () { avatarWrap.classList.remove('avatar-has-image'); };
        avatarImg.src = url;
    }

    function next() {
        if (!queue.length) return close();
        // 有分支选项时，“下一句”应无效，直到用户选择
        if (options && options.length && queue.length === 1) return;
        queue.shift();
        if (!queue.length) return close();
        renderCurrent();
    }

    global.DialogueUI = {
        open: open,
        close: close,
        say: say,
        playLinesRich: playLinesRich,
        setPortrait: setPortrait,
        clearPortrait: clearPortrait
    };
})(typeof window !== 'undefined' ? window : this);

