/* Fixed vessel POV; no playable basement or additional dialogue. */
(function (g) {
    'use strict';
    var root, signature = '', dialogueNumber = 0, heldKeys = new Set();
    function ensure() {
        if (root) return;
        root = document.createElement('dialog'); root.id = 'death-panel'; root.hidden = true;
        root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '死亡与复活');
        document.body.appendChild(root);
        root.addEventListener('cancel', function (e) { e.preventDefault(); });
        root.addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            if (b.dataset.action === 'revive') g.DeathSystem.chooseRevival();
            if (b.dataset.action === 'retry') g.DeathSystem.retry();
            if (b.dataset.action === 'reload') g.location.reload();
        });
    }
    function stopDialogue() {
        if (!dialogueNumber) return;
        dialogueNumber = 0;
        g.DialogueUI.close();
    }
    function playDialogue(number) {
        if (dialogueNumber === number && g.DialogueUI.isDialogueOpen()) return;
        dialogueNumber = number;
        g.DialogueUI.playLinesRich([{ speaker: 'narration', text: g.DeathSystem.line() }], {
            host: root,
            onQueueExhausted: function () {
                // Let the shared view close and return to its normal host first.
                dialogueNumber = 0;
                Promise.resolve().then(function () { g.DeathSystem.completeDialogue(number); });
            }
        });
    }
    function render() {
        ensure();
        var D = g.DeathSystem, s = D.getState(), c = s.current, err = D.getError();
        if (!c || c.phase !== 'revival_scene' || err || c.number !== dialogueNumber) stopDialogue();
        var isBlocked = D.blocked(); root.hidden = !isBlocked;
        if (isBlocked && !root.open) root.showModal();
        if (!isBlocked && root.open) root.close();
        document.documentElement.classList.toggle('death-active', isBlocked);
        if (!isBlocked) { signature = ''; return; }
        var key = D.isSessionBlocked() ? 'session' : [c.phase, c.number, err].join('|');
        if (key !== signature) {
            signature = key;
            root.className = c && c.phase === 'revival_scene' ? 'death-vessel' : 'death-wait';
            root.replaceChildren();
            if (D.isSessionBlocked()) {
                root.innerHTML = '<div class="death-card"><p>游戏已在另一个窗口运行。</p><button data-action="reload">重新进入</button></div>';
            } else if (c.phase === 'revival_scene') {
                root.innerHTML = '<div class="vessel-light"></div><div class="vessel-person"></div><div class="vessel-liquid"></div><div class="vessel-glass"></div>';
            } else {
                root.innerHTML = '<section class="death-card death-record-card" aria-labelledby="death-record-heading"><header class="death-record-heading"><span class="death-record-mark" aria-hidden="true"></span><h2 id="death-record-heading">最后记录</h2><span class="death-record-rule" aria-hidden="true"></span></header><ol class="death-records" tabindex="0" aria-label="死亡前的事件记录"></ol><footer class="death-record-footer"><button data-action="revive">回藏身处复活<span class="death-return-arrow" aria-hidden="true">↗</span></button></footer></section>';
                var entries = D.getLogEntries(), list = root.querySelector('.death-records');
                entries.forEach(function (entry, i) {
                    var row = document.createElement('li'); row.className = 'death-record' + (i === entries.length - 1 ? ' is-final' : '');
                    if (entry.time) {
                        var time = document.createElement('time'); time.textContent = entry.time; row.appendChild(time);
                    }
                    var text = document.createElement('p'); text.textContent = entry.message; row.appendChild(text); list.appendChild(row);
                });
                root.querySelector('button').hidden = c.phase !== 'awaiting_revival' || !!err;
            }
            if (err) {
                var box = document.createElement('div'); box.className = 'death-error';
                var p = document.createElement('p'); p.textContent = err; box.appendChild(p);
                var btn = document.createElement('button'); btn.dataset.action = 'retry'; btn.textContent = '重试保存'; box.appendChild(btn);
                root.appendChild(box);
            }
            var first = root.querySelector('button:not([hidden])'); if (first) first.focus();
            var records = root.querySelector('.death-records'); if (records) records.scrollTop = records.scrollHeight;
        }
        if (c && c.phase === 'revival_scene' && !c.dialogueCompleted && !err) playDialogue(c.number);
    }
    // Capture before map shortcuts and keep focus within the modal in both UI shells.
    g.addEventListener('keydown', function (e) {
        var key = e.code || e.key;
        if (!g.DeathSystem.blocked()) {
            if (heldKeys.has(key)) { e.preventDefault(); e.stopImmediatePropagation(); }
            return;
        }
        heldKeys.add(key);
        if (dialogueNumber && g.DialogueUI.isDialogueOpen() && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault(); e.stopImmediatePropagation();
            if (!e.repeat) g.DialogueUI.next();
            return;
        }
        var inside = root && root.contains(e.target);
        if (e.key === 'Tab') {
            e.preventDefault();
            var nodes = root ? Array.from(root.querySelectorAll('button:not([hidden]),[tabindex="0"]')) : [];
            var at = nodes.indexOf(document.activeElement);
            if (nodes.length) nodes[(at + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length].focus();
        }
        var scrollingLog = e.target && e.target.closest && e.target.closest('.death-records') &&
            ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].indexOf(e.key) >= 0;
        if (!scrollingLog && (!inside || (e.key !== 'Enter' && e.key !== ' '))) e.preventDefault();
        e.stopImmediatePropagation();
    }, true);
    g.addEventListener('keyup', function (e) {
        if (heldKeys.delete(e.code || e.key)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    g.addEventListener('blur', function () { heldKeys.clear(); });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) g.DeathSystem.checkpointScene();
    });
    g.DeathPanel = { render: render };
})(window);
