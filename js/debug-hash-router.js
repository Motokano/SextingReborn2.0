// debug-hash-router.js — 开发预览直达：URL ?panel=xxx（可加 &tab=）在游戏就绪后自动打开对应面板。
// 配合 tools/serve-live.mjs 使用：agent 修改代码后，可在右侧 better-sidebar 浏览器打开
//   http://127.0.0.1:8000/?panel=agriculture
// 页面加载后持续等待角色就绪（手动读取存档 / 完成角色创建后即就绪），然后自动打开指定面板。
// 面板名见 window.SceneApp.debugPanelOpeners：
//   backpack / agriculture / livestock / hideout / baseWarehouse / cooking / pharmacy
//   / compost / combat / survival / save / uiMenu
(function () {
    'use strict';
    var params = new URLSearchParams(window.location.search);
    var panel = params.get('panel');
    if (!panel) return; // 无 ?panel= 参数时不启用直达

    var tab = params.get('tab') || '';

    function characterReady() {
        var CA = window.CharacterAttributes;
        return !!(CA && typeof CA.isCharacterCreationCompleted === 'function' && CA.isCharacterCreationCompleted());
    }

    function panelExists() {
        return typeof window.SceneApp === 'object' && window.SceneApp &&
            typeof window.SceneApp.debugPanelOpeners === 'object' && window.SceneApp.debugPanelOpeners &&
            typeof window.SceneApp.debugPanelOpeners[panel] === 'function';
    }

    var opened = false;
    var warned = false;

    function tryOpen() {
        if (opened) return true;
        if (typeof window.SceneApp !== 'object' || !window.SceneApp ||
            typeof window.SceneApp.debugOpenPanel !== 'function') return false; // 场景未就绪
        if (!panelExists()) {
            // 面板名无效：告警一次并停止轮询（避免无限空转）
            if (!warned) {
                warned = true;
                try { console.warn('[debug-router] 未知面板名: ' + panel + '（可用: ' + Object.keys(window.SceneApp.debugPanelOpeners || {}).join(', ') + '）'); } catch (e) { /* ignore */ }
            }
            return true; // 停止
        }
        if (!characterReady()) return false; // 角色未就绪（未建号/存档未载入）→ 继续等待
        opened = window.SceneApp.debugOpenPanel(panel, tab);
        return opened;
    }

    // 立即试一次（若已在 afterStart 之后被调用）
    if (tryOpen()) return;

    // 每 500ms 轮询，直到成功打开或面板名无效；不设超时（等待用户读取存档/完成建号）
    var timer = setInterval(function () {
        if (tryOpen()) clearInterval(timer);
    }, 500);

    // bootstrap 的 afterStart 钩子：场景启动后立刻再试一次
    if (window.AppBoot && typeof window.AppBoot.addAfterStart === 'function') {
        window.AppBoot.addAfterStart(function () { tryOpen(); });
    }
})();
