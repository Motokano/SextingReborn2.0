/* Dialogue presentation reuses map pawn art; never uses per-line portrait overrides. */
(function (global) {
    'use strict';
    var cache = {};
    function resolve(role, entityId) {
        if (role === 'narration' || role === 'unknown') return Promise.resolve('');
        if (role === 'player' || entityId === 'player') {
            return global.PlayerPawnRig ? global.PlayerPawnRig.getDialoguePortrait() : Promise.resolve('');
        }
        // No invented identity for unidentified speakers.
        if (!entityId || entityId === 'unknown' || entityId === 'npc') return Promise.resolve('');
        var spec = global.TileRendererV2 && global.TileRendererV2.getSpeakerPawn
            ? global.TileRendererV2.getSpeakerPawn(entityId) : null;
        if (!spec) return Promise.resolve('');
        if (!spec.crop) return Promise.resolve(spec.url);
        var key = spec.url + ':' + spec.crop.join(',');
        if (!cache[key]) cache[key] = new Promise(function (resolveImage, reject) {
            var image = new Image();
            image.onload = function () {
                var crop = spec.crop, canvas = document.createElement('canvas');
                canvas.width = Math.round(crop[2] * 256 / crop[3]); canvas.height = 256;
                canvas.getContext('2d').drawImage(image,crop[0],crop[1],crop[2],crop[3],0,0,canvas.width,canvas.height);
                resolveImage(canvas.toDataURL('image/png'));
            };
            image.onerror = function () { delete cache[key]; reject(new Error('Speaker pawn unavailable')); };
            image.src = spec.url;
        });
        return cache[key];
    }
    global.DialoguePawn = {resolve:resolve};
})(window);
