/**
 * SceneFeedback — 文案与日志适配.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {

    function showMsg(text, logType) {
        if (window.GameLog && text) window.GameLog.log(text, logType || 'info');
    }

    function ui(key, vars) {
        try {
            if (!window.UIText || typeof window.UIText.t !== 'function') throw new Error('[SceneApp] UIText not ready');
            return window.UIText.t(key, vars);
        } catch (e) {
            var msg = '[E_UI_CALL] ' + JSON.stringify({ module: 'SceneApp', key: String(key || ''), fix_hint: 'Usually add/fix key in data/ui_text_zhCN.json' });
            var err = new Error(msg + ' cause=' + (e && e.message ? e.message : String(e)));
            err.code = 'E_UI_CALL';
            err.details = { module: 'SceneApp', key: String(key || '') };
            err.cause = e;
            throw err;
        }
    }

    function initialize() {

    }

    function bind() {

    window.SceneCtx.showMsg = showMsg;

    // Route NPC messages into game log
    if (window.NPCSystem && typeof window.NPCSystem.configure === 'function') {
        window.NPCSystem.configure({ log: showMsg });
    }
    }

    window.SceneFeedback = {
        initialize: initialize,
        bind: bind,
        showMsg: showMsg,
        ui: ui
    };
})(window);
