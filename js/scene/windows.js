/**
 * SceneWindows — 窗口注册、布局菜单与可见性.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {

    var uiWindowsMenuOpen;

    /**
     * UI 自由窗口（docs/design/36-ui-windows.md M2）：注册左侧状态区 7 块 + buff-hud。
     * - defaultPos 'dock'：未自定义时清空内联定位，回退 CSS/文档流 → 默认布局与现版一致。
     * - gameVisible：认知门控查询（shouldShowLeftHudBlock），未解锁不占位。
     * - 游戏门控写入口：setBlockDisplay / renderBuffHud 经 UIWindows.setGameVisible（见下）。
     */
    function registerUiWindows() {
        if (!window.UIWindows || typeof window.UIWindows.registerPanel !== 'function') return;
        var U = window.UIWindows;
        function blockVisible(blockId) {
            var ctx = window.SceneCtx;
            if (ctx && typeof ctx.shouldShowLeftHudBlock === 'function') {
                return !!ctx.shouldShowLeftHudBlock(blockId);
            }
            return true;
        }
        if (!window.SvelteHUD) {
        U.registerPanel('win-role', {
            type: 'free', titleKey: 'ui.windows.role',
            el: function () { return document.getElementById('status-role-card'); },
            defaultPos: 'dock', minW: 160, minH: 64,
            closable: true, resizable: false,
            dragHandle: '.panel-head, .block-title, h1, summary, .buff-hud-title',
            dragThreshold: 4,
            gameVisible: function () { return blockVisible('role'); }
        });
        U.registerPanel('win-limbs', {
            type: 'free', titleKey: 'ui.windows.limbs',
            el: function () { return document.getElementById('status-limbs'); },
            defaultPos: 'dock', minW: 160, minH: 64,
            closable: true, resizable: false,
            dragHandle: '.panel-head, .block-title, h1, summary, .buff-hud-title',
            dragThreshold: 4,
            gameVisible: function () { return blockVisible('limbs'); }
        });
        U.registerPanel('win-battle-resources', {
            type: 'free', titleKey: 'ui.windows.battle_resources',
            el: function () { return document.getElementById('status-combat-resources-card'); },
            defaultPos: 'dock', minW: 160, minH: 64,
            closable: true, resizable: false,
            dragHandle: '.panel-head, .block-title, h1, summary, .buff-hud-title',
            dragThreshold: 4,
            gameVisible: function () { return blockVisible('combat_resources'); }
        });
        U.registerPanel('win-survival', {
            type: 'free', titleKey: 'ui.windows.survival',
            el: function () { return document.getElementById('status-survival'); },
            defaultPos: 'dock', minW: 180, minH: 80,
            closable: true, resizable: false,
            dragHandle: '.panel-head, .block-title, h1, summary, .buff-hud-title',
            dragThreshold: 4,
            gameVisible: function () { return blockVisible('survival'); }
        });
        U.registerPanel('win-resources', {
            type: 'free', titleKey: 'ui.windows.resources',
            el: function () { return document.getElementById('status-resources'); },
            defaultPos: 'dock', minW: 160, minH: 64,
            closable: true, resizable: false,
            dragHandle: '.panel-head, .block-title, h1, summary, .buff-hud-title',
            dragThreshold: 4,
            gameVisible: function () { return blockVisible('resources'); }
        });
        U.registerPanel('win-attrs', {
            type: 'free', titleKey: 'ui.windows.attrs',
            el: function () { return document.getElementById('status-attrs-block'); },
            defaultPos: 'dock', minW: 160, minH: 64,
            closable: true, resizable: false,
            dragHandle: '.panel-head, .block-title, h1, summary, .buff-hud-title',
            dragThreshold: 4,
            gameVisible: function () { return blockVisible('attrs'); }
        });
        U.registerPanel('win-attr-exp', {
            type: 'free', titleKey: 'ui.windows.attr_exp',
            el: function () { return document.getElementById('status-attr-exp-block'); },
            defaultPos: 'dock', minW: 160, minH: 64,
            closable: true, resizable: false,
            dragHandle: '.panel-head, .block-title, h1, summary, .buff-hud-title',
            dragThreshold: 4,
            gameVisible: function () { return blockVisible('attrs'); } // 属性经验跟随五维门控
        });
        U.registerPanel('win-buff', {
            type: 'free', titleKey: 'ui.windows.buff',
            el: function () { return document.getElementById('buff-hud'); },
            defaultPos: 'dock', minW: 160, minH: 64,
            closable: true, resizable: false,
            dragHandle: '.panel-head, .block-title, h1, summary, .buff-hud-title',
            dragThreshold: 4,
            gameVisible: function () { return blockVisible('buff_hud'); }
        });
        // 锚定窗口：仅显隐（位置由 CSS 管，不持久化位置）
        U.registerPanel('win-time', {
            type: 'anchored', titleKey: 'ui.windows.time',
            el: function () { return document.getElementById('top-hud'); },
            closable: true
        });
        }
        U.registerPanel('win-actions-right', {
            type: 'anchored', titleKey: 'ui.windows.right_actions',
            // 保留面板管理入口，避免隐藏功能按钮时一并失去恢复入口。
            el: function () { return document.getElementById('right-hud-actions'); },
            closable: true
        });
        U.registerPanel('win-bottom', {
            type: 'free', titleKey: 'ui.windows.bottom_bar',
            el: function () { return document.getElementById('bottom-hud-stack'); },
            defaultPos: 'dock', minW: 220, minH: 64,
            dragHandle: '.quickbar-drag-handle',
            dblclickReset: true,
            closable: true,
        });
        U.registerPanel('win-dialogue', {
            type: 'anchored', titleKey: 'ui.windows.dialogue',
            el: function () { return document.getElementById('dialogue-panel'); },
            closable: true,
            displayManaged: false // 对话面板 DOM 显隐归 DialogueUI 管（.show class）；管线只记玩家偏好
        });
        if (typeof U.init === 'function') U.init();
        initUiWindowsMenu();
    }

    function rebuildUiWindowsMenu() {
        if (window.SvelteHUD) { window.SvelteHUD.invalidate('windows'); return; }
        var menu = document.getElementById('ui-windows-menu');
        if (!menu) return;
        if (!window.UIWindows || typeof window.UIWindows.getPanelList !== 'function') return;
        var items = window.UIWindows.getPanelList();
        var html = '<div class="uwm-title">' + window.SceneFeedback.ui('ui.windows.menu.title') + '</div>';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var label = window.SceneFeedback.ui(it.titleKey);
            var checked = it.visible ? ' checked' : '';
            var disabled = it.closable ? '' : ' disabled';
            html += '<button type="button" class="uwm-row" data-win-id="' + it.id + '"' + disabled + '>' +
                '<input type="checkbox"' + checked + disabled + ' />' +
                '<span class="uwm-label">' + label + '</span></button>';
        }
        html += '<hr class="uwm-sep" />';
        var locked = window.UIWindows.getLock ? window.UIWindows.getLock() : false;
        html += '<button type="button" class="uwm-row" id="uwm-lock">' +
            '<input type="checkbox"' + (locked ? ' checked' : '') + ' id="uwm-lock-check" />' +
            '<span class="uwm-label">' + window.SceneFeedback.ui('ui.windows.lock') + '</span></button>';
        html += '<button type="button" class="uwm-btn" id="uwm-reset">' + window.SceneFeedback.ui('ui.windows.reset') + '</button>';
        menu.innerHTML = html;

        if (window.MapProjection) window.MapProjection.mountControl(menu);
        if (window.HungerTile) window.HungerTile.mountMotionControl(menu);

        var rows = menu.querySelectorAll('.uwm-row[data-win-id]');
        for (var j = 0; j < rows.length; j++) {
            (function (row) {
                row.addEventListener('click', function (e) {
                    if (e.target && e.target.closest && e.target.closest('input')) return; // checkbox 自身的 change 处理
                    var winId = row.getAttribute('data-win-id');
                    if (!winId) return;
                    var cb = row.querySelector('input[type="checkbox"]');
                    if (!cb) return;
                    cb.checked = !cb.checked;
                    window.UIWindows.setVisible(winId, cb.checked);
                });
                var cb = row.querySelector('input[type="checkbox"]');
                if (cb) {
                    cb.addEventListener('change', function () {
                        var winId = row.getAttribute('data-win-id');
                        if (!winId) return;
                        window.UIWindows.setVisible(winId, cb.checked);
                    });
                }
            })(rows[j]);
        }
        var lockBtn = menu.querySelector('#uwm-lock');
        if (lockBtn) {
            lockBtn.addEventListener('click', function (e) {
                if (e.target && e.target.closest && e.target.closest('input')) return;
                var cb = document.getElementById('uwm-lock-check');
                if (!cb) return;
                cb.checked = !cb.checked;
                window.UIWindows.setLock(cb.checked);
            });
        }
        var lockCb = document.getElementById('uwm-lock-check');
        if (lockCb) {
            lockCb.addEventListener('change', function () {
                window.UIWindows.setLock(lockCb.checked);
            });
        }
        var resetBtn = document.getElementById('uwm-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                window.UIWindows.resetAll();
                rebuildUiWindowsMenu(); // 重置后刷新勾选状态
            });
        }
    }

    function openUiWindowsMenu() {
        if (window.SvelteHUD) { window.SvelteHUD.openMenu(); return; }
        var menu = document.getElementById('ui-windows-menu');
        if (!menu) return;
        rebuildUiWindowsMenu();
        menu.classList.add('open');
        menu.setAttribute('aria-hidden', 'false');
        uiWindowsMenuOpen = true;
    }

    function closeUiWindowsMenu() {
        if (window.SvelteHUD) { window.SvelteHUD.closeMenu(); return; }
        var menu = document.getElementById('ui-windows-menu');
        if (!menu) return;
        menu.classList.remove('open');
        menu.setAttribute('aria-hidden', 'true');
        uiWindowsMenuOpen = false;
    }

    function initUiWindowsMenu() {
        if (window.SvelteHUD) return;
        var btn = document.getElementById('btn-ui-windows');
        if (!btn) return;
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (uiWindowsMenuOpen) closeUiWindowsMenu();
            else openUiWindowsMenu();
        });
        // 点击外部关闭
        document.addEventListener('click', function (e) {
            if (!uiWindowsMenuOpen) return;
            var btn2 = document.getElementById('btn-ui-windows');
            var menu = document.getElementById('ui-windows-menu');
            if (btn2 && btn2.contains(e.target)) return;
            if (menu && menu.contains(e.target)) return;
            closeUiWindowsMenu();
        });
        // 与玩家动作菜单互斥：打开玩家动作菜单时先关窗口列表
        var playerBtn = document.getElementById('btn-player-actions');
        if (playerBtn) {
            playerBtn.addEventListener('click', function () {
                closeUiWindowsMenu();
            });
        }
    }

    function initialize() {
        uiWindowsMenuOpen = false;
    }

    function bind() {

    }

    window.SceneWindows = {
        initialize: initialize,
        bind: bind,
        openUiWindowsMenu: openUiWindowsMenu,
        registerUiWindows: registerUiWindows
    };
})(window);
