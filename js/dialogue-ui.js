/**
 * 底部对话框 UI
 * - 固定高度面板，显示说话人头像 + 名称 + 台词
 * - 头像可为玩家与各 NPC 分别设置（setPortrait），也会尝试从 EntityAppearance 取值
 *
 * 公开 API：
 * - DialogueUI.setPortrait(entityId, imageUrl)
 * - DialogueUI.clearPortrait(entityId)
 * - DialogueUI.open()
 * - DialogueUI.close()（仅内部在台词推进完毕时调用；玩家不可用 Esc/关闭键跳过）
 * - DialogueUI.say({ speakerRole, speakerId, speakerName, text })
 * - DialogueUI.playLinesRich(linesRich, opts?)
 * - speakerRole === 'narration'（旁白）：不显示名字栏
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
    var typingTimer = null;
    var typingSpeedMs = 24;
    var typingTickChars = 1;
    var isTyping = false;
    var fullText = '';
    var visibleText = '';
    var currentSpeakerName = '';
    /** 当前句 speaker 角色（如 narration），用于旁白隐藏名字栏 */
    var currentLineSpeakerRole = '';
    var currentAvatarUrl = '';
    var currentFallbackGlyph = '❖';
    var currentNextLabel = '';
    var currentNextDisabled = false;
    var currentCloseLabel = '';
    /** playLinesRich：队列自然耗尽（非 Esc 中途关闭）时回调一次 */
    var dialogueOnQueueExhausted = null;

    function setDialogueInputBlockerVisible(visible) {
        var b = document.getElementById('dialogue-input-blocker');
        if (!b) return;
        if (visible) {
            b.style.display = 'block';
            b.setAttribute('aria-hidden', 'false');
        } else {
            b.style.display = 'none';
            b.setAttribute('aria-hidden', 'true');
        }
    }

    function deriveAvatarAltUrl(url) {
        // 兼容 npc-editor 在“选择目录层级错误”导致的多/少一层路径：
        // 1) 期望：image/<folder>/<file>
        //    实际：image/<folder>/<folder>/<file>
        // 2) 期望：image/<folder>/<folder>/<file>
        //    实际：image/<folder>/<file>
        if (!url) return '';
        var s = String(url).trim();
        var flat = /^image\/([^\/]+)\/([^\/]+)$/.exec(s);
        if (flat) {
            return 'image/' + flat[1] + '/' + flat[1] + '/' + flat[2];
        }
        var nested = /^image\/([^\/]+)\/\1\/([^\/]+)$/.exec(s);
        if (nested) {
            return 'image/' + nested[1] + '/' + nested[2];
        }
        return '';
    }

    function ui(key, vars) {
        try {
            if (!global.UIText || typeof global.UIText.t !== 'function') throw new Error('[DialogueUI] UIText not ready');
            return global.UIText.t(key, vars);
        } catch (e) {
            var msg = '[E_UI_CALL] ' + JSON.stringify({ module: 'DialogueUI', key: String(key || ''), fix_hint: 'Usually add/fix key in data/ui_text_zhCN.json' });
            var err = new Error(msg + ' cause=' + (e && e.message ? e.message : String(e)));
            err.code = 'E_UI_CALL';
            err.details = { module: 'DialogueUI', key: String(key || '') };
            err.cause = e;
            throw err;
        }
    }

    function logDialogueLine(speakerName, text) {
        if (!global.GameLog || typeof global.GameLog.log !== 'function') return;
        var name = speakerName != null ? String(speakerName) : '';
        var t = text != null ? String(text) : '';
        if (!t.trim()) return;
        global.GameLog.log((name ? (name + ui('dialogue.punct.colon')) : '') + t, 'info');
    }

    function logDialogueChoice(choiceText) {
        if (!global.GameLog || typeof global.GameLog.log !== 'function') return;
        if (choiceText == null) return;
        global.GameLog.log(ui('dialogue.choice.prefix') + String(choiceText), 'system');
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
        // React 模式下，next/close 的点击由 React 处理，避免原生事件导致 next/close 被触发两次。
        var useReact = !!(global.DialogueReactView && typeof global.DialogueReactView.render === 'function');
        if (nextBtn && !nextBtn.__dlgBound) {
            nextBtn.__dlgBound = true;
            if (!useReact) nextBtn.addEventListener('click', function () { next(); });
        }
        if (closeBtn && !closeBtn.__dlgBound) {
            closeBtn.__dlgBound = true;
            if (!useReact) closeBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
            });
        }
        if (!document.__dlgKeyBound) {
            document.__dlgKeyBound = true;
            document.addEventListener('keydown', function (e) {
                if (!isOpen) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    return;
                }
                if (e.key === 'Enter' || e.key === ' ') {
                    // 避免在输入框里误触（当前对话框没有输入框，但保持通用）
                    var tag = (e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : '';
                    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
                    next();
                }
            });
        }
    }

    function clearTypingTimer() {
        if (typingTimer) {
            clearTimeout(typingTimer);
            typingTimer = null;
        }
    }

    function visibleTextAsHtml(text) {
        return escapeHtml(text || '').replace(/\n/g, '<br>');
    }

    function renderDialogueText() {
        var nameEl = $(NAME_ID);
        var avatarWrap = $(AVATAR_WRAP_ID);
        var textEl = $(TEXT_ID);
        var optionsEl = $(OPTIONS_ID);
        if (!textEl) return;

        // 名字和文字始终同步写入 DOM，不依赖 React 异步调度
        if (nameEl) {
            var hideName = currentLineSpeakerRole === 'narration';
            nameEl.textContent = hideName ? '' : (currentSpeakerName || '');
            nameEl.style.display = hideName ? 'none' : '';
            if (hideName) nameEl.setAttribute('aria-hidden', 'true');
            else nameEl.removeAttribute('aria-hidden');
        }
        var textHtml = visibleTextAsHtml(visibleText || '');
        if (isTyping) {
            textHtml += '<span class="dlg-typing-cursor" aria-hidden="true">▋</span>';
        }
        textEl.innerHTML = textHtml;

        // React 负责头像和操作按钮（有状态需求），不再接管 nameEl / textEl
        if (global.DialogueReactView && typeof global.DialogueReactView.render === 'function') {
            global.DialogueReactView.render({
                avatarUrl: currentAvatarUrl || '',
                fallbackGlyph: currentFallbackGlyph || '❖',
                nextLabel: currentNextLabel || '',
                nextDisabled: !!currentNextDisabled,
                closeLabel: currentCloseLabel || '',
                showCloseButton: false,
                onNext: next,
                onClose: function () { /* 禁止手动关闭，仅 next 推进至结束 */ },
                options: (Array.isArray(options) && queue.length === 1) ? options : [],
                onChoose: onChooseOption
            });
            if (avatarWrap) avatarWrap.classList.toggle('avatar-has-image', !!currentAvatarUrl);
        }
        if (optionsEl) optionsEl.style.display = (Array.isArray(options) && options.length && queue.length === 1) ? 'flex' : 'none';
    }

    function mountDialogueTextRenderer() {
        var avatarEl = $(AVATAR_WRAP_ID);
        var panel = $(PANEL_ID);
        var actionsEl = panel ? panel.querySelector('.dlg-actions') : null;
        var optionsEl = $(OPTIONS_ID);
        if (!avatarEl || !actionsEl || !optionsEl) return;
        if (global.DialogueReactView && typeof global.DialogueReactView.mount === 'function') {
            global.DialogueReactView.mount({
                avatarEl: avatarEl,
                actionsEl: actionsEl,
                optionsEl: optionsEl
            });
        }
    }

    function unmountDialogueTextRenderer() {
        if (global.DialogueReactView && typeof global.DialogueReactView.unmount === 'function') {
            global.DialogueReactView.unmount();
        }
    }

    function startTyping(text) {
        clearTypingTimer();
        fullText = String(text || '');
        visibleText = '';
        isTyping = !!fullText;
        renderDialogueText();
        if (!isTyping) return;

        var idx = 0;
        function step() {
            if (!isTyping) return;
            idx += typingTickChars;
            if (idx >= fullText.length) {
                idx = fullText.length;
                visibleText = fullText;
                isTyping = false;
                renderDialogueText();
                return;
            }
            visibleText = fullText.slice(0, idx);
            renderDialogueText();
            typingTimer = setTimeout(step, typingSpeedMs);
        }
        typingTimer = setTimeout(step, typingSpeedMs);
    }

    function completeTypingImmediately() {
        if (!isTyping) return false;
        clearTypingTimer();
        isTyping = false;
        visibleText = fullText || '';
        renderDialogueText();
        return true;
    }

    function open() {
        ensureBound();
        var panel = $(PANEL_ID);
        if (!panel) return;
        // 对话安全（docs/design/36-ui-windows.md §4.5）：玩家在窗口列表里隐藏过对话面板时，
        // 触发对话强制恢复显示（仅本次会话，不持久化）——对话是叙事核心，不可因误隐藏错过台词。
        if (global.UIWindows && typeof global.UIWindows.forceVisible === 'function') {
            try { global.UIWindows.forceVisible('win-dialogue'); } catch (eF) { /* ignore */ }
        }
        setDialogueInputBlockerVisible(true);
        mountDialogueTextRenderer();
        lastActiveEl = document.activeElement || null;
        isOpen = true;
        panel.classList.add('show');
        panel.classList.add('dialogue-advance-only');
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
        if (!panel) {
            setDialogueInputBlockerVisible(false);
            return;
        }
        setDialogueInputBlockerVisible(false);
        panel.classList.remove('dialogue-advance-only');
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
        clearTypingTimer();
        isTyping = false;
        fullText = '';
        visibleText = '';
        currentSpeakerName = '';
        currentLineSpeakerRole = '';
        currentAvatarUrl = '';
        currentFallbackGlyph = '❖';
        currentNextLabel = '';
        currentNextDisabled = false;
        currentCloseLabel = '';
        try {
            var nameElClose = $(NAME_ID);
            if (nameElClose) {
                nameElClose.style.display = '';
                nameElClose.removeAttribute('aria-hidden');
            }
        } catch (eName) { /* ignore */ }
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
        unmountDialogueTextRenderer();
        dialogueOnQueueExhausted = null;
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
        dialogueOnQueueExhausted = null;
        options = null;
        optionsContext = null;
        lastLoggedKey = null;
        var sayName = role === 'narration' ? '' : (payload.speakerName || (role === 'player' ? ui('dialogue.player.name') : ui('dialogue.npc.name')));
        queue = [{
            speakerRole: role,
            speakerId: entityId,
            speakerName: sayName,
            text: (payload.text != null && String(payload.text).trim())
                ? String(payload.text)
                : '（对话内容缺失）'
        }];
        open();
    }

    function playLinesRich(linesRich, opts) {
        opts = opts || {};
        if (!Array.isArray(linesRich)) return;
        dialogueOnQueueExhausted = (typeof opts.onQueueExhausted === 'function') ? opts.onQueueExhausted : null;
        options = Array.isArray(opts.options) ? opts.options : null;
        optionsContext = null;
        if (opts && typeof opts === 'object') {
            optionsContext = {};
            for (var ok in opts) {
                if (!Object.prototype.hasOwnProperty.call(opts, ok) || ok === 'onQueueExhausted') continue;
                optionsContext[ok] = opts[ok];
            }
        }
        lastLoggedKey = null;
        function deriveRole(l) {
            var v = (l && (l.speaker || l.role)) ? String(l.speaker || l.role) : '';
            return v || 'npc';
        }

        function deriveText(l) {
            if (!l || typeof l !== 'object') return '';
            var t = (l.text != null) ? String(l.text)
                : (l.content != null) ? String(l.content)
                    : (l.line != null) ? String(l.line)
                        : (l.lineText != null) ? String(l.lineText)
                            : (l.dialogueText != null) ? String(l.dialogueText)
                                : '';
            return t;
        }

        function deriveAvatarUrl(l) {
            if (!l || typeof l !== 'object') return '';
            var a = (l.avatar != null) ? String(l.avatar)
                : (l.avatarUrl != null) ? String(l.avatarUrl)
                    : (l.imageUrl != null) ? String(l.imageUrl)
                        : (l.portrait != null) ? String(l.portrait)
                            : (l.portraitUrl != null) ? String(l.portraitUrl)
                                : '';
            return a ? a.trim() : '';
        }

        queue = [];
        for (var i = 0; i < linesRich.length; i++) {
            var l = linesRich[i];
            var role = deriveRole(l);
            var entityId = normalizeEntityId(role, opts.npcId);
            var avatarUrl = deriveAvatarUrl(l);
            var text = deriveText(l);
            // 避免“触发了但台词为空白”的空对话框
            if (!text || !String(text).trim()) continue;
            var lineName = role === 'narration' ? '' : ((role === 'player')
                ? (opts.playerName || ui('dialogue.player.name'))
                : (opts.npcName || opts.speakerName || ui('dialogue.npc.name')));
            queue.push({
                speakerRole: role,
                speakerId: entityId,
                speakerName: lineName,
                text: String(text),
                avatarUrl: avatarUrl || ''
            });
        }
        // 如果所有 linesRich 都是空文本，给一个显式占位，便于看出是数据问题
        if (!queue.length) {
            queue = [{
                speakerRole: 'npc',
                speakerId: normalizeEntityId('npc', opts.npcId),
                speakerName: opts.npcName || opts.speakerName || ui('dialogue.npc.name'),
                text: '（对话内容缺失）',
                avatarUrl: ''
            }];
        }
        open();
    }

    function clearOptionsUi() {
        var wrap = $(OPTIONS_ID);
        if (!wrap) return;
        if (!(global.DialogueReactView && typeof global.DialogueReactView.render === 'function')) {
            wrap.innerHTML = '';
        } else {
            renderDialogueText();
        }
        wrap.style.display = 'none';
    }

    function onChooseOption(index) {
        if (!Array.isArray(options) || index < 0 || index >= options.length) return;
        var opt = options[index];
        var next = opt && opt.next;
        var ctx = optionsContext || {};
        logDialogueChoice(opt && opt.text != null ? opt.text : '');
        if (global.BuffSystem && typeof global.BuffSystem.notifyDialogueChoice === 'function') {
            global.BuffSystem.notifyDialogueChoice({
                option_text: opt && opt.text != null ? String(opt.text) : '',
                npc_id: ctx.npcId || null,
                npc_name: ctx.npcName || null
            });
        }
        clearOptionsUi();
        options = null;
        optionsContext = null;
        if (Array.isArray(next) && next.length) {
            playLinesRich(next, ctx);
        } else {
            close();
        }
    }

    function renderOptionsUi() {
        var wrap = $(OPTIONS_ID);
        var nextBtn = $(BTN_NEXT_ID);
        if (!wrap) return;
        if (!options || !options.length) {
            wrap.style.display = 'none';
            if (global.DialogueReactView && typeof global.DialogueReactView.render === 'function') renderDialogueText();
            return;
        }
        wrap.style.display = 'flex';
        // 有选项时，避免用户继续“下一句”导致误关
        currentNextDisabled = true;
        if (nextBtn) nextBtn.disabled = true;
        if (global.DialogueReactView && typeof global.DialogueReactView.render === 'function') {
            renderDialogueText();
            return;
        }
        wrap.innerHTML = '';
        for (var i = 0; i < options.length; i++) {
            (function (opt, idx) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'dlg-option-btn';
                b.textContent = (opt && opt.text != null) ? String(opt.text) : ui('dialogue.choice.untitled');
                b.addEventListener('click', function () {
                    onChooseOption(idx);
                });
                wrap.appendChild(b);
            })(options[i], i);
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

        var useReact = !!(global.DialogueReactView && typeof global.DialogueReactView.render === 'function');
        // avatarImg/avatarFallback/nextBtn 由 React 管理，关闭后会被移除，不能放入 guard
        if (!nameEl || !textEl || !avatarWrap || !optionsWrap) return;

        if (!queue.length) {
            currentSpeakerName = '';
            currentLineSpeakerRole = '';
            currentAvatarUrl = '';
            currentFallbackGlyph = ui('dialogue.ellipsis');
            currentNextDisabled = true;
            currentNextLabel = '';
            currentCloseLabel = ui('dialogue.close');
            clearTypingTimer();
            isTyping = false;
            fullText = '';
            visibleText = '';
            renderDialogueText();
            avatarWrap.classList.remove('avatar-has-image');
            if (!useReact) {
                if (avatarImg) { avatarImg.src = ''; avatarImg.removeAttribute('src'); }
                if (avatarFallback) avatarFallback.textContent = ui('dialogue.ellipsis');
                if (nextBtn) nextBtn.disabled = true;
            }
            clearOptionsUi();
            return;
        }

        var cur = queue[0];
        currentLineSpeakerRole = cur.speakerRole || '';
        currentSpeakerName = (currentLineSpeakerRole === 'narration') ? '' : (cur.speakerName || '');
        currentCloseLabel = ui('dialogue.close');
        var entityId = cur.speakerId || normalizeEntityId(cur.speakerRole, null);
        var url = getPortraitUrl(entityId);
        // 优先使用 linesRich 的逐句头像（npc-editor 会导出 avatar 字段）
        if (cur && cur.avatarUrl) url = String(cur.avatarUrl);
        var glyph = getFallbackGlyph(cur.speakerRole);
        currentAvatarUrl = url || '';
        currentFallbackGlyph = glyph || '❖';
        currentNextDisabled = false;
        currentNextLabel = (queue.length > 1) ? ui('dialogue.next') : ui('dialogue.end');
        startTyping(cur.text || '');
        // 同步写入游戏日志（避免重复写同一句）
        try {
            var key = String(cur.speakerName || '') + '|' + String(cur.text || '');
            if (key && key !== lastLoggedKey) {
                lastLoggedKey = key;
                logDialogueLine(cur.speakerName || '', cur.text || '');
            }
        } catch (e0) { /* ignore */ }

        if (!useReact) {
            if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = currentNextLabel; }
            if (avatarFallback) avatarFallback.textContent = currentFallbackGlyph;
        }
        clearOptionsUi();
        if (queue.length === 1) {
            renderOptionsUi();
        }

        if (!url) {
            avatarWrap.classList.remove('avatar-has-image');
            if (!useReact && avatarImg) {
                avatarImg.src = '';
                avatarImg.removeAttribute('src');
            }
            renderDialogueText();
            return;
        }

        renderDialogueText();
        if (useReact) return;

        // React
        if (!avatarImg) return;
        avatarImg.onload = function () { avatarWrap.classList.add('avatar-has-image'); };
        var triedFallback = false;
        var fallbackUrl = deriveAvatarAltUrl(url);
        avatarImg.onerror = function () {
            if (!triedFallback && fallbackUrl && fallbackUrl !== url) {
                triedFallback = true;
                avatarImg.src = fallbackUrl;
                return;
            }
            avatarWrap.classList.remove('avatar-has-image');
        };
        avatarImg.src = url;
    }

    function next() {
        if (!queue.length) return close();
        if (completeTypingImmediately()) return;
        // 有分支选项时，“下一句”应无效，直到用户选择
        if (options && options.length && queue.length === 1) return;
        queue.shift();
        if (!queue.length) {
            var endCb = dialogueOnQueueExhausted;
            dialogueOnQueueExhausted = null;
            if (typeof endCb === 'function') {
                try { endCb(); } catch (e0) { /* ignore */ }
            }
            return close();
        }
        renderCurrent();
    }

    function isDialogueOpen() {
        return !!isOpen;
    }

    global.DialogueUI = {
        open: open,
        close: close,
        say: say,
        playLinesRich: playLinesRich,
        isDialogueOpen: isDialogueOpen,
        setPortrait: setPortrait,
        clearPortrait: clearPortrait
    };
})(typeof window !== 'undefined' ? window : this);

