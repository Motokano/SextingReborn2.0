// 主场景逻辑层：输入/移动/采集/事件绑定（不直接拼 DOM）
(function () {
    function getCtx() {
        return window.SceneCtx || null;
    }

    function initSystems() {
        var ctx = getCtx();
        if (!ctx || !ctx.E || !ctx.G) return;
        var E = ctx.E;

        // 键盘移动
        document.addEventListener('keydown', function (e) {
            var tag = (e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;
            // 数字键 1–9：快捷腰带使用物品（与 UI 格序一致；长按连发屏蔽）
            var keyDigit = e.key;
            if (keyDigit >= '1' && keyDigit <= '9' && keyDigit.length === 1) {
                if (e.repeat) return;
                if (window.DialogueUI && typeof window.DialogueUI.isDialogueOpen === 'function' && window.DialogueUI.isDialogueOpen()) return;
                if (window.SceneApp && typeof window.SceneApp.isPreCreationGameplayRestricted === 'function' && window.SceneApp.isPreCreationGameplayRestricted()) return;
                if (window.SceneApp && typeof window.SceneApp.tryUseQuickBeltDigit === 'function') {
                    window.SceneApp.tryUseQuickBeltDigit(parseInt(keyDigit, 10));
                    e.preventDefault();
                }
                return;
            }
            // 空格：过 1 个全局 tick（长按连发由 e.repeat 屏蔽）
            if (e.key === ' ' || e.key === 'Spacebar') {
                if (e.repeat) return;
                if (window.DialogueUI && typeof window.DialogueUI.isDialogueOpen === 'function' && window.DialogueUI.isDialogueOpen()) return;
                if (window.SceneApp && typeof window.SceneApp.isStoryMovementLocked === 'function' && window.SceneApp.isStoryMovementLocked()) return;
                e.preventDefault();
                if (window.Survival && typeof window.Survival.advanceTick === 'function') {
                    window.Survival.advanceTick();
                }
                if (window.GameLog && window.UIText && typeof window.UIText.t === 'function') {
                    window.GameLog.log(window.UIText.t('log.system.tick.space'), 'system');
                }
                if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') {
                    window.SceneRenderer.render();
                }
                if (ctx && typeof ctx.updateStatusPanel === 'function') {
                    ctx.updateStatusPanel();
                }
                return;
            }
            if (window.SceneApp && typeof window.SceneApp.isStoryMovementLocked === 'function' && window.SceneApp.isStoryMovementLocked()) return;
            var dx = 0, dy = 0;
            switch (e.key) {
                case 'ArrowUp':    case 'w': case 'W': dy = -1; break;
                case 'ArrowDown':  case 's': case 'S': dy =  1; break;
                case 'ArrowLeft':  case 'a': case 'A': dx = -1; break;
                case 'ArrowRight': case 'd': case 'D': dx =  1; break;
                case 'q': case 'Q': case 'Home': dx = -1; dy = -1; break;
                case 'e': case 'E': case 'PageUp': dx = 1; dy = -1; break;
                case 'z': case 'Z': case 'End': dx = -1; dy = 1; break;
                case 'c': case 'C': case 'PageDown': dx = 1; dy = 1; break;
                case 'Numpad7': dx = -1; dy = -1; break;
                case 'Numpad9': dx = 1; dy = -1; break;
                case 'Numpad1': dx = -1; dy = 1; break;
                case 'Numpad3': dx = 1; dy = 1; break;
                default: return;
            }
            e.preventDefault();
            var st = E.getState();
            if (ctx.actions && typeof ctx.actions.tryIntentMove === 'function') {
                ctx.actions.tryIntentMove(st.x + dx, st.y + dy, dx, dy, 'keyboard');
            } else if (ctx.actions && typeof ctx.actions.tryMoveTo === 'function') {
                ctx.actions.tryMoveTo(st.x + dx, st.y + dy, dx, dy);
            }
        });

        // 采集按钮
        var bubbleGatherBtn = document.getElementById('player-action-gather');
        var bubbleStopBtn = document.getElementById('player-action-gather-stop');
        if (bubbleGatherBtn && ctx.actions && typeof ctx.actions.startGatheringIdle === 'function') {
            bubbleGatherBtn.addEventListener('click', function () { ctx.actions.startGatheringIdle(); });
        }
        if (bubbleStopBtn && ctx.actions && typeof ctx.actions.stopGatheringIdle === 'function') {
            bubbleStopBtn.addEventListener('click', function () { ctx.actions.stopGatheringIdle(true); });
        }
        var abGather = document.getElementById('action-bar-gather');
        var abStop = document.getElementById('action-bar-gather-stop');
        if (abGather && ctx.actions && typeof ctx.actions.startGatheringIdle === 'function') {
            abGather.addEventListener('click', function () { ctx.actions.startGatheringIdle(); });
        }
        if (abStop && ctx.actions && typeof ctx.actions.stopGatheringIdle === 'function') {
            abStop.addEventListener('click', function () { ctx.actions.stopGatheringIdle(true); });
        }

        // 引擎变化 -> 触发重渲染（渲染由 renderer 完成）
        if (typeof E.onChange === 'function') {
            E.onChange(function () {
                if (ctx.actions && typeof ctx.actions.onEngineChanged === 'function') ctx.actions.onEngineChanged();
            });
        }
    }

    window.SceneSystems = {
        init: initSystems
    };
})();

