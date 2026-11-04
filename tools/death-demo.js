// Review the real runtime in an isolated, memory-only iframe. No copied death logic.
(async function () {
    'use strict';
    const frame = document.getElementById('game');
    const start = document.getElementById('start');
    const number = document.getElementById('number');
    const status = document.getElementById('status');
    const loading = document.getElementById('loading');
    document.getElementById('reset').onclick = () => location.reload();

    // Serialized into the first script, before any production module can access storage.
    function isolate() {
        try {
            function memoryStorage() {
                const entries = new Map();
                return {
                    getItem: key => entries.get(String(key)) ?? null,
                    setItem: (key, value) => { entries.set(String(key), String(value)); },
                    removeItem: key => { entries.delete(String(key)); },
                    clear: () => entries.clear(),
                    key: index => Array.from(entries.keys())[index] ?? null,
                    get length() { return entries.size; }
                };
            }
            Object.defineProperty(window, 'localStorage', { value: memoryStorage() });
            Object.defineProperty(window, 'sessionStorage', { value: memoryStorage() });
            // Each preview has independent state; it must not hold the real game's lock.
            Object.defineProperty(navigator, 'locks', { value: undefined });
            window.__DEATH_DEMO_MEMORY__ = true;
        } catch (error) {
            // Stop the original parser, so production scripts never run without isolation.
            document.open(); document.write('<p>演示隔离初始化失败，请关闭此页。</p>'); document.close();
            throw error;
        }
    }

    try {
        const root = new URL('../', location.href);
        const response = await fetch(new URL('index.html?no_reload', root));
        if (!response.ok) throw new Error('无法加载游戏页面');
        let html = await response.text();
        // The demo uses only local game assets and never opts into live reload.
        html = html.replace(/<link\b[^>]*href="https:\/\/fonts\.[^>]*>/gi, '');
        const head = '<base href="' + root.href + '"><script>(' + isolate.toString() + ')();<\/script>';
        html = html.replace(/<head>/i, '<head>' + head);
        const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
        frame.srcdoc = html;
        await loaded;
        const game = frame.contentWindow;
        if (!game.__DEATH_DEMO_MEMORY__ || !game.AppBoot?.ready) throw new Error('演示未能初始化');
        await game.AppBoot.ready;
        game.DialogueUI.close();
        game.SceneApp.openCharacterCreationAfterIntro();
        game.SceneApp.creation.confirm({ name: '演示角色', height: 178, hand: 'right', leg: 'right', gender: 'male' });
        game.GameEngine.setState('M0_Base_Inside_lv_1', 10, 14);
        game.SceneApp.render();
        loading.hidden = true;
        number.disabled = start.disabled = false;
        status.textContent = '独立演示 · 仅在本页内存中运行';

        start.onclick = () => {
            if (game.DeathSystem.blocked() || !number.reportValidity()) return;
            const value = Number(number.value);
            if (!Number.isSafeInteger(value) || value < 1) return;
            game.DeathSystem.restore({ version: 1, deathCount: value - 1, current: null });
            game.GameLog.clear();
            document.body.classList.add('playing');
            game.CharacterAttributes.applyCombatDestroy('chest', game.CharacterAttributes.getBodyPartDestroyMax('chest'));
            frame.focus();
        };
        let previous = '';
        function watch() {
            const state = game.DeathSystem.getState();
            const phase = state.current?.phase || '';
            if (phase !== previous) {
                previous = phase;
                const playing = game.DeathSystem.blocked();
                document.body.classList.toggle('playing', playing);
                number.disabled = start.disabled = playing;
                if (phase === 'revived') {
                    status.textContent = '已在藏身处复活 · 累计死亡 ' + state.deathCount + ' 次';
                    number.value = String(state.deathCount + 1);
                    start.textContent = '再演示一次';
                }
            }
            requestAnimationFrame(watch);
        }
        watch();
    } catch (error) {
        loading.hidden = false;
        loading.textContent = '演示加载失败：' + error.message;
        console.error(error);
    }
})();
