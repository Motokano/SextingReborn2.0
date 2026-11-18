/**
 * SavePanel — 存档窗口与清档确认.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {

    var savePanelOpen;

    function requestResetProgress(btn) {
            window.ResetProgressDialog.open({
                button: btn,
                message: window.SceneFeedback.ui('confirm.reset.demo'),
                clear: function () {
                if (window.SaveSystem && typeof window.SaveSystem.clearAllLocalProgress === 'function') {
                    return window.SaveSystem.clearAllLocalProgress();
                } else {
                    localStorage.removeItem('cabi_realtime_save_v1');
                    localStorage.removeItem('cabi_demo_flags_v1');
                    localStorage.removeItem('cabi_demo_triggered_entries_v1');
                    return true;
                }
                },
                reload: function () { window.location.reload(); }
            });
    }

    function getSaveCredentials() {
        var accEl = document.getElementById('save-input-account');
        var pwEl = document.getElementById('save-input-password');
        return {
            account: accEl && accEl.value ? String(accEl.value).trim() : '',
            password: pwEl && pwEl.value ? String(pwEl.value) : ''
        };
    }

    function openSavePanel() {
        if (savePanelOpen) return;
        savePanelOpen = true;
        if (window.SveltePanels) window.SveltePanels.refresh('save');
        var modal = document.getElementById('modal-save');
        if (modal && !window.SveltePanels) modal.classList.add('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '0.1';
            left.style.pointerEvents = 'none';
        }
    }

    function closeSavePanel() {
        if (!savePanelOpen) return;
        savePanelOpen = false;
        if (window.SveltePanels) window.SveltePanels.refresh('save');
        var modal = document.getElementById('modal-save');
        if (modal && !window.SveltePanels) modal.classList.remove('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '';
            left.style.pointerEvents = '';
        }
        window.SceneMapView.render();
    }

    function initialize() {
        savePanelOpen = false;
    }

    function bind() {

    (function () {
        var btn = document.getElementById('btn-reset-demo-save');
        if (btn) btn.addEventListener('click',function () { requestResetProgress(btn); });
    })();

    if (document.getElementById('btn-save')) {
        document.getElementById('btn-save').addEventListener('click', function () {
            if (savePanelOpen) closeSavePanel(); else openSavePanel();
        });
    }

    if (document.getElementById('save-modal-close')) {
        document.getElementById('save-modal-close').addEventListener('click', closeSavePanel);
    }

    if (document.getElementById('btn-save-local-now')) {
        document.getElementById('btn-save-local-now').addEventListener('click', function () {
            if (!window.SaveSystem || typeof window.SaveSystem.saveNow !== 'function') {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.localFail'), 'error');
                return;
            }
            var ok = window.SaveSystem.saveNow('manual');
            window.SceneFeedback.showMsg(ok ? window.SceneFeedback.ui('save.msg.localOk') : window.SceneFeedback.ui('save.msg.localFail'), ok ? 'info' : 'error');
        });
    }

    if (document.getElementById('btn-save-export')) {
        document.getElementById('btn-save-export').addEventListener('click', function () {
            if (!window.SaveSystem || typeof window.SaveSystem.exportSaveCode !== 'function') {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.exportFail'), 'error');
                return;
            }
            var cred = getSaveCredentials();
            if (!cred.account || !cred.password) {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.needAccountPassword'), 'warning');
                return;
            }
            window.SaveSystem.exportSaveCode(cred).then(function (code) {
                var ta = document.getElementById('save-textarea-export');
                if (ta) ta.value = code || '';
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.exportOk'), 'info');
            }).catch(function (e) {
                var m = e && e.message ? String(e.message) : '';
                if (m.indexOf('WebCrypto') >= 0 || m.indexOf('busy') >= 0) {
                    window.SceneFeedback.showMsg(m.indexOf('busy') >= 0 ? window.SceneFeedback.ui('save.msg.busy') : window.SceneFeedback.ui('save.msg.exportFail'), 'error');
                } else {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.exportFail'), 'error');
                }
            });
        });
    }

    if (document.getElementById('btn-save-copy-code')) {
        document.getElementById('btn-save-copy-code').addEventListener('click', function () {
            var ta = document.getElementById('save-textarea-export');
            var v = ta && ta.value ? String(ta.value).trim() : '';
            if (!v) {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.copyFail'), 'warning');
                return;
            }
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(v).then(function () {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.copyOk'), 'info');
                }).catch(function () {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.copyFail'), 'warning');
                });
            } else {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.copyFail'), 'warning');
            }
        });
    }

    if (document.getElementById('btn-save-import')) {
        document.getElementById('btn-save-import').addEventListener('click', function () {
            if (!window.SaveSystem || typeof window.SaveSystem.importSaveCode !== 'function') {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.importFail'), 'error');
                return;
            }
            var taIn = document.getElementById('save-textarea-import');
            var code = taIn && taIn.value ? String(taIn.value).trim() : '';
            var cred = getSaveCredentials();
            if (!cred.account || !cred.password) {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.needAccountPassword'), 'warning');
                return;
            }
            if (!code) {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.importFail'), 'warning');
                return;
            }
            window.SaveSystem.importSaveCode(code, cred).then(function (r) {
                if (!r || !r.ok) {
                    if (r && r.reason === 'older') window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.importRejectedOlder'), 'warning');
                    else window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.importFail'), 'error');
                    return;
                }
                window.SceneCharacter.hideCreationOverlay();
                window.SceneCharacter.updateRoleNameFromCharacter();
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.importOk'), 'info');
                closeSavePanel();
                window.SceneMapView.render();
            }).catch(function () {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('save.msg.importFail'), 'error');
            });
        });
    }
    }

    window.SavePanel = {
        initialize: initialize,
        bind: bind,
        closeSavePanel: closeSavePanel,
        openSavePanel: openSavePanel,
        requestResetProgress: requestResetProgress,
        get savePanelOpen() { return savePanelOpen; }
    };
})(window);
