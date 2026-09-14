(function (global) {
    'use strict';
    var parts = ['head', 'chest', 'abdomen', 'lhand', 'rhand', 'lfoot', 'rfoot'];
    var base = 'assets/map/isometric/player-atlas-v1/';
    var manifestPromise, pages = {}, frames = {};
    function readMask(attributes) {
        if (!attributes || typeof attributes.getPartDestroy !== 'function' || typeof attributes.getBodyPartDestroyMax !== 'function') return 0;
        return parts.reduce(function (mask, part, bit) {
            var max = Number(attributes.getBodyPartDestroyMax(part));
            var value = Number(attributes.getPartDestroy(part));
            return Number.isFinite(max) && max > 0 && Number.isFinite(value) && value >= max ? mask | (1 << bit) : mask;
        }, 0);
    }
    function loadManifest() {
        if (!manifestPromise) manifestPromise = fetch(base + 'manifest.json').then(function (res) {
            if (!res.ok) throw new Error('Pawn atlas manifest unavailable');
            return res.json();
        }).catch(function (error) { manifestPromise = null; throw error; });
        return manifestPromise;
    }
    function loadPage(file) {
        if (!pages[file]) pages[file] = new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () { delete pages[file]; reject(new Error('Pawn atlas page unavailable: ' + file)); };
            img.src = base + file;
        });
        return pages[file];
    }
    function frame(mask) {
        if (frames[mask]) return Promise.resolve(frames[mask]);
        return loadManifest().then(function (data) {
            var state = data.states[mask];
            if (!state || state.mask !== mask) throw new Error('Invalid pawn atlas mapping');
            return loadPage(state.file).then(function (img) {
                var crop = state.crop, scale = data.displayBaseWidth / state.baseWidth;
                var width = crop[2] * scale, height = crop[3] * scale;
                // Canvas is a display surface, preserving the source PNGs and their alpha.
                var canvas = document.createElement('canvas'), resolution = Math.max(3, Math.min(4, global.devicePixelRatio || 1));
                canvas.width = Math.ceil(width * resolution);
                canvas.height = Math.ceil(height * resolution);
                var ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, crop[0], crop[1], crop[2], crop[3], 0, 0, canvas.width, canvas.height);
                return frames[mask] = {url:canvas.toDataURL('image/png'),width:width,height:height,x:state.anchor[0]*scale,y:state.anchor[1]*scale,id:state.id};
            });
        });
    }
    function renderMask(el, mask) {
        if (!el) return false;
        if (!Number.isInteger(mask) || mask < 0 || mask > 127) throw new RangeError('Invalid pawn state');
        var id = 'D' + String(mask).padStart(3, '0');
        if (el.getAttribute('data-rig-error') === id) return false;
        if (el.getAttribute('data-rig-request') === id) return true;
        el.setAttribute('data-rig-request', id);
        el.setAttribute('data-texture-src', 'player-atlas-v1');
        frame(mask).then(function (f) {
            if (el.getAttribute('data-rig-request') !== id) return;
            el.style.setProperty('--atlas-image', 'url("' + f.url + '")');
            el.style.setProperty('--atlas-width', f.width + 'px');
            el.style.setProperty('--atlas-height', f.height + 'px');
            el.style.setProperty('--atlas-x', -f.x + 'px');
            el.style.setProperty('--atlas-y', (8-f.y) + 'px');
            el.classList.remove('has-pawn-texture');
            el.classList.remove('has-rig-pawn');
            el.classList.add('has-atlas-pawn');
            el.setAttribute('data-rig-state', id);
            el.removeAttribute('data-rig-error');
        }).catch(function () {
            if (el.getAttribute('data-rig-request') !== id) return;
            el.classList.remove('has-rig-pawn');
            el.classList.remove('has-atlas-pawn');
            el.setAttribute('data-rig-error', id);
            el.removeAttribute('data-rig-request');
        });
        return true;
    }
    function update(el) { return renderMask(el, readMask(global.CharacterAttributes)); }
    // Compatibility name for the existing HUD hook. Art now comes only from the approved atlas.
    global.PlayerPawnRig = {update:update,readMask:readMask,renderMask:renderMask};
})(window);
