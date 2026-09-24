// One music player for the entire page, independent of scenes and save data.
(function () {
    'use strict';
    if (window.BackgroundMusic) return;

    var storageKey = 'sexting-reborn.bgm.enabled';
    var enabled = true;
    try { enabled = localStorage.getItem(storageKey) !== 'false'; } catch (_) { /* optional storage */ }

    var audio = new Audio('bga/A_beautiful_criminal_2.mp3');
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = 'metadata';
    audio.id = 'global-background-music';
    audio.hidden = true;
    document.body.appendChild(audio);
    var pending = false;
    var button = document.getElementById('btn-bgm');

    function updateButton() {
        if (!button) return;
        button.textContent = enabled ? '♫' : '♪';
        var label = enabled ? '背景音乐已开启，点击关闭' : '背景音乐已关闭，点击开启';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(enabled));
        button.style.opacity = enabled ? '1' : '0.5';
    }

    function play() {
        if (!enabled || document.hidden || pending || !audio.paused) return;
        pending = true;
        // Rejected autoplay is expected; the next user interaction retries it.
        audio.play().catch(function () {}).finally(function () {
            pending = false;
            if (!enabled || document.hidden) audio.pause();
        });
    }

    function setEnabled(value) {
        enabled = Boolean(value);
        try { localStorage.setItem(storageKey, String(enabled)); } catch (_) { /* optional storage */ }
        if (enabled) play();
        else audio.pause();
        updateButton();
    }

    if (button) button.addEventListener('click', function () { setEnabled(!enabled); });
    function unlock(event) {
        // Let the toggle itself decide whether playback should start.
        if (button && button.contains(event.target)) return;
        play();
    }
    document.addEventListener('click', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) audio.pause();
        else play();
    });
    window.BackgroundMusic = { setEnabled: setEnabled };
    updateButton();
    play();
})();
