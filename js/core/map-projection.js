/**
 * MapProjection
 * Shared square/isometric world-to-screen geometry for rendering, camera and picking.
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'sexting-reborn.map-view';
    var MODE_LEGACY = 'legacy';
    var MODE_ISOMETRIC = 'isometric';
    var mode = MODE_ISOMETRIC;

    try {
        var requested = new URLSearchParams(global.location && global.location.search || '').get('view');
        var saved = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
        var value = requested || saved;
        if (value === MODE_LEGACY || value === MODE_ISOMETRIC) mode = value;
    } catch (e) { /* Keep the session default when URL/storage is unavailable. */ }

    function applyModeClass() {
        if (!global.document || !global.document.documentElement) return;
        global.document.documentElement.classList.toggle('map-view-isometric', mode === MODE_ISOMETRIC);
        global.document.documentElement.classList.toggle('map-view-legacy', mode === MODE_LEGACY);
    }

    function getMode() { return mode; }

    function setMode(nextMode) {
        if (nextMode !== MODE_LEGACY && nextMode !== MODE_ISOMETRIC) return false;
        if (mode === nextMode) return true;
        mode = nextMode;
        try { global.localStorage.setItem(STORAGE_KEY, mode); } catch (e) { /* Session mode still applies. */ }
        applyModeClass();
        if (global.dispatchEvent && typeof global.CustomEvent === 'function') {
            global.dispatchEvent(new CustomEvent('mapviewchange', { detail: { mode: mode } }));
        }
        if (global.SceneRenderer && typeof global.SceneRenderer.invalidate === 'function') global.SceneRenderer.invalidate();
        if (global.SceneRenderer && typeof global.SceneRenderer.render === 'function') global.SceneRenderer.render();
        return true;
    }

    function create(map, cellPx, forcedMode) {
        var width = Math.max(1, Number(map && map.width) || 1);
        var height = Math.max(1, Number(map && map.height) || 1);
        var size = Math.max(24, Number(cellPx) || 101);
        var useMode = forcedMode || mode;
        var isometric = useMode === MODE_ISOMETRIC;

        if (!isometric) {
            return {
                mode: MODE_LEGACY,
                isIsometric: false,
                cellPx: size,
                tileWidth: size,
                tileHeight: size,
                thickness: 0,
                widthPx: Math.ceil(width * size),
                heightPx: Math.ceil(height * size),
                cellCenter: function (x, y) { return { x: (x + 0.5) * size, y: (y + 0.5) * size }; },
                cellToPx: function (x, y) { return { x: x * size, y: y * size }; },
                cellPolygon: function (x, y) {
                    var px = x * size;
                    var py = y * size;
                    return [{ x: px, y: py }, { x: px + size, y: py }, { x: px + size, y: py + size }, { x: px, y: py + size }];
                },
                pick: function (px, py) {
                    var gx = Math.floor(px / size);
                    var gy = Math.floor(py / size);
                    return gx >= 0 && gy >= 0 && gx < width && gy < height ? { x: gx, y: gy } : null;
                },
                directionVector: function (dx, dy) { return { x: dx * size, y: dy * size }; }
            };
        }

        // C variant: a 45 degree camera-to-ground presentation. World north points upper-right.
        var halfW = size / Math.SQRT2;
        // A 45° ground angle projects one tile's depth to sin(45°) of its width.
        // With tileWidth = sqrt(2) * size, halfHeight = size / 2 gives that ratio.
        var halfH = size / 2;
        var tileW = halfW * 2;
        var tileH = halfH * 2;
        var thickness = 30;
        var sidePadding = 16;
        var topPadding = Math.max(86, Math.round(size * 0.9));
        var bottomPadding = 24;
        var originX = sidePadding + height * halfW;
        var originY = topPadding + halfH;
        var widthPx = Math.ceil(sidePadding * 2 + (width + height) * halfW);
        var heightPx = Math.ceil(topPadding + (width + height) * halfH + thickness + bottomPadding);

        function center(x, y) {
            return {
                x: originX + (x - y) * halfW,
                y: originY + (x + y) * halfH
            };
        }

        function polygon(x, y) {
            var c = center(x, y);
            return [
                { x: c.x, y: c.y - halfH },
                { x: c.x + halfW, y: c.y },
                { x: c.x, y: c.y + halfH },
                { x: c.x - halfW, y: c.y }
            ];
        }

        function insideDiamond(px, py, c) {
            return Math.abs(px - c.x) / halfW + Math.abs(py - c.y) / halfH <= 1.00001;
        }

        function pick(px, py) {
            var sx = (px - originX) / halfW;
            var sy = (py - originY) / halfH;
            var approxX = Math.round((sx + sy) / 2);
            var approxY = Math.round((sy - sx) / 2);
            // Check the rounded cell and its immediate neighbors to make edge picking stable.
            for (var radius = 0; radius <= 1; radius++) {
                for (var oy = -radius; oy <= radius; oy++) {
                    for (var ox = -radius; ox <= radius; ox++) {
                        if (radius && Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
                        var gx = approxX + ox;
                        var gy = approxY + oy;
                        if (Object.is(gx, -0)) gx = 0;
                        if (Object.is(gy, -0)) gy = 0;
                        if (gx < 0 || gy < 0 || gx >= width || gy >= height) continue;
                        if (insideDiamond(px, py, center(gx, gy))) return { x: gx, y: gy };
                    }
                }
            }
            return null;
        }

        return {
            mode: MODE_ISOMETRIC,
            isIsometric: true,
            cellPx: size,
            tileWidth: tileW,
            tileHeight: tileH,
            halfWidth: halfW,
            halfHeight: halfH,
            thickness: thickness,
            widthPx: widthPx,
            heightPx: heightPx,
            cellCenter: center,
            // Compatibility contract: callers adding cellPx / 2 land on the projected center.
            cellToPx: function (x, y) {
                var c = center(x, y);
                return { x: c.x - size / 2, y: c.y - size / 2 };
            },
            cellPolygon: polygon,
            pick: pick,
            directionVector: function (dx, dy) {
                return { x: (dx - dy) * halfW, y: (dx + dy) * halfH };
            }
        };
    }

    function directionAngleDeg(dir) {
        var vectors = [
            { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
            { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }
        ];
        var d = Math.round(Number(dir) || 0) % 8;
        if (d < 0) d += 8;
        if (mode !== MODE_ISOMETRIC) return d * 45;
        var p = create({ width: 1, height: 1 }, 101, MODE_ISOMETRIC);
        var v = p.directionVector(vectors[d].x, vectors[d].y);
        return Math.atan2(v.x, -v.y) * 180 / Math.PI;
    }

    function isAdjacentTurnTarget(playerX, playerY, targetX, targetY) {
        var dx = Math.abs((Number(targetX) || 0) - (Number(playerX) || 0));
        var dy = Math.abs((Number(targetY) || 0) - (Number(playerY) || 0));
        return Math.max(dx, dy) === 1;
    }

    function mountControl(container) {
        if (!container || container.querySelector('[data-map-view-control]')) return;
        var label = document.createElement('label');
        label.className = 'map-view-control';
        label.setAttribute('data-map-view-control', '');
        label.appendChild(document.createTextNode('地图视角'));
        var select = document.createElement('select');
        [['isometric', '棋子视角 C · 45°'], ['legacy', '原俯视视角']].forEach(function (entry) {
            var option = document.createElement('option');
            option.value = entry[0];
            option.textContent = entry[1];
            select.appendChild(option);
        });
        select.value = mode;
        select.addEventListener('change', function () { setMode(select.value); });
        label.addEventListener('keydown', function (event) { event.stopPropagation(); });
        label.addEventListener('keyup', function (event) { event.stopPropagation(); });
        label.appendChild(select);
        container.appendChild(label);
    }

    applyModeClass();
    global.MapProjection = {
        MODE_LEGACY: MODE_LEGACY,
        MODE_ISOMETRIC: MODE_ISOMETRIC,
        getMode: getMode,
        setMode: setMode,
        create: create,
        directionAngleDeg: directionAngleDeg,
        isAdjacentTurnTarget: isAdjacentTurnTarget,
        mountControl: mountControl
    };
})(typeof window !== 'undefined' ? window : this);

