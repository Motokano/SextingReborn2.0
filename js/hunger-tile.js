(function () {
    'use strict';
    var levels = {
        normal: [0, 6], mild: [.4, 5.5], moderate: [.65, 4.5],
        severe: [.85, 3.6], starvation: [1, 3]
    };
    var previewLevel = null;
    var motionKey = 'sexting-reborn.status-motion';
    var motionMode = 'system';
    try {
        var savedMotion = localStorage.getItem(motionKey);
        if (['system', 'on', 'off'].indexOf(savedMotion) !== -1) motionMode = savedMotion;
    } catch (e) { /* Storage may be unavailable; keep the setting for this session. */ }
    function setMotionMode(value) {
        if (['system', 'on', 'off'].indexOf(value) === -1) return;
        motionMode = value;
        try { localStorage.setItem(motionKey, value); } catch (e) { /* Session setting still applies. */ }
        refresh();
        document.querySelectorAll('[data-status-motion]').forEach(function (select) { select.value = value; });
    }
    function mountMotionControl(container) {
        var label = document.createElement('label');
        label.className = 'status-motion-control';
        var text = function (key, fallback) {
            var value = '';
            try { value = window.UIText && window.UIText.t ? window.UIText.t(key) : ''; }
            catch (e) { /* Preview controls can mount before the UI dictionary loads. */ }
            return value && value !== key ? value : fallback;
        };
        label.appendChild(document.createTextNode(text('ui.motion.label', '状态动画')));
        var select = document.createElement('select');
        select.setAttribute('data-status-motion', '');
        [['system', 'ui.motion.system', '跟随系统'], ['on', 'ui.motion.on', '播放'], ['off', 'ui.motion.off', '静态']].forEach(function (entry) {
            var option = document.createElement('option');
            option.value = entry[0];
            option.textContent = text(entry[1], entry[2]);
            select.appendChild(option);
        });
        select.value = motionMode;
        select.addEventListener('change', function () { setMotionMode(select.value); });
        label.addEventListener('keydown', function (event) { event.stopPropagation(); });
        label.addEventListener('keyup', function (event) { event.stopPropagation(); });
        label.appendChild(select);
        container.appendChild(label);
    }
    function refresh() {
        var sprite = document.getElementById('player-sprite');
        if (!sprite) return;
        var effect = sprite.querySelector('.hunger-tile');
        if (!effect) {
            effect = document.createElement('div');
            effect.className = 'hunger-tile';
            effect.setAttribute('aria-hidden', 'true');
            effect.innerHTML = '<svg class="hunger-folds" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
                '<g class="hunger-fold hunger-fold-left"><path d="M7 39 C9 52 12 69 30 78 L40 81"/>' +
                '<path class="hunger-fold-faint" d="M9 64 Q14 81 33 86"/>' +
                '<path d="M18 58 Q20 68 29 71"/></g>' +
                '<g class="hunger-fold hunger-fold-right"><path d="M93 47 C88 55 92 73 68 81 L59 83"/>' +
                '<path class="hunger-fold-faint" d="M90 74 Q79 89 66 88"/>' +
                '<path d="M82 62 Q79 72 72 73"/></g></svg>';
            sprite.insertBefore(effect, sprite.firstChild);
        }
        effect.dataset.motion = motionMode;
        var survival = window.Survival;
        var level = previewLevel || (survival && survival.getSatietyZone ? survival.getSatietyZone() : 'normal');
        if (!levels[level]) level = 'normal';
        if (effect.dataset.level === level) return;
        effect.dataset.level = level;
        effect.style.setProperty('--hunger-strength', levels[level][0]);
        effect.style.setProperty('--hunger-period', levels[level][1] + 's');
    }
    window.HungerTile = { refresh: refresh, mountMotionControl: mountMotionControl };
    if (new URLSearchParams(window.location.search).has('hunger-preview')) {
        var panel = document.createElement('aside');
        panel.id = 'hunger-preview';
        panel.addEventListener('keydown', function (event) { event.stopPropagation(); });
        panel.addEventListener('keyup', function (event) { event.stopPropagation(); });
        panel.innerHTML = '<label>脚下饥饿效果 <select aria-label="预览饥饿程度">' +
            '<option value="">跟随实际状态</option><option value="normal">饱足</option>' +
            '<option value="mild">轻度饥饿</option><option value="moderate">重度饥饿</option>' +
            '<option value="severe">极度饥饿</option><option value="starvation">饥饿归零</option>' +
            '</select></label>' +
            '<p>仅预览视觉，不修改饱食值。观察脚下格子数秒。</p>';
        panel.querySelector('select').addEventListener('change', function (event) {
            previewLevel = event.target.value || null;
            refresh();
        });
        mountMotionControl(panel);
        document.body.appendChild(panel);
    }
    refresh();
})();
