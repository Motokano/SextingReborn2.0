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

