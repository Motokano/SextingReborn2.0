/**
 * Tile Renderer V2
 * Canvas-based map tile rendering with pointer hit-test.
 */
(function (global) {
    'use strict';

    function getNowMs() {
        return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function create(mapGridEl, options) {
        var opts = options || {};
        var cellPx = opts.cellPx || 101;
        var staticCanvas = document.createElement('canvas');
        staticCanvas.id = 'map-grid-canvas-static';
        staticCanvas.style.position = 'absolute';
        staticCanvas.style.left = '0';
        staticCanvas.style.top = '0';
        staticCanvas.style.width = '100%';
        staticCanvas.style.height = '100%';
        staticCanvas.style.pointerEvents = 'none';
        mapGridEl.appendChild(staticCanvas);
        var staticCtx = staticCanvas.getContext('2d');

        var dynamicCanvas = document.createElement('canvas');
        dynamicCanvas.id = 'map-grid-canvas-dynamic';
        dynamicCanvas.style.position = 'absolute';
        dynamicCanvas.style.left = '0';
        dynamicCanvas.style.top = '0';
        dynamicCanvas.style.width = '100%';
        dynamicCanvas.style.height = '100%';
        dynamicCanvas.style.pointerEvents = 'none';
        mapGridEl.appendChild(dynamicCanvas);
        var dynamicCtx = dynamicCanvas.getContext('2d');

        var fxCanvas = document.createElement('canvas');
        fxCanvas.id = 'map-grid-canvas-fx';
        fxCanvas.style.position = 'absolute';
        fxCanvas.style.left = '0';
        fxCanvas.style.top = '0';
        fxCanvas.style.width = '100%';
        fxCanvas.style.height = '100%';
        fxCanvas.style.pointerEvents = 'none';
        mapGridEl.appendChild(fxCanvas);
        var fxCtx = fxCanvas.getContext('2d');

        var scene = {
            map: null,
            st: null,
            staticMetaAt: null,
            dynamicMetaAt: null,
            viewport: null
        };
        var staticMapKey = '';
        var staticDataKey = '';
        var staticSizeKey = '';
        var lastInput = null;
        var effectsRenderer = typeof opts.effectsRenderer === 'function' ? opts.effectsRenderer : null;
        var animationLoopId = null;
        var animationLoopEnabled = false;

        function resize(widthPx, heightPx) {
            if (staticCanvas.width !== widthPx) staticCanvas.width = widthPx;
            if (staticCanvas.height !== heightPx) staticCanvas.height = heightPx;
            if (dynamicCanvas.width !== widthPx) dynamicCanvas.width = widthPx;
            if (dynamicCanvas.height !== heightPx) dynamicCanvas.height = heightPx;
            if (fxCanvas.width !== widthPx) fxCanvas.width = widthPx;
            if (fxCanvas.height !== heightPx) fxCanvas.height = heightPx;
            mapGridEl.style.width = widthPx + 'px';
            mapGridEl.style.height = heightPx + 'px';
        }

        function colorForCell(meta) {
            if (!meta.walkable) {
                if (meta.cookingStation) return '#3d2b1f';
                if (meta.pharmacyStation) return '#1e2d2c';
                if (meta.compostStation) return '#2f2f18';
                return '#3d2a2a';
            }
            if (meta.portal) return '#2a2d35';
            if (meta.gathering) return '#2a3324';
            if (meta.groundCount > 0) return '#332a24';
            if (meta.pharmacyStation) return '#243530';
            if (meta.compostStation) return '#363620';
            return '#312a24';
        }

        function strokeForCell(meta) {
            if (!meta.walkable) {
                if (meta.cookingStation) return 'rgba(251,146,60,0.5)';
                if (meta.pharmacyStation) return 'rgba(45,212,191,0.45)';
                if (meta.compostStation) return 'rgba(202,138,4,0.45)';
                return 'rgba(180,80,80,0.4)';
            }
            if (meta.portal) return 'rgba(100,200,255,0.35)';
            if (meta.gathering) return 'rgba(120,180,80,0.45)';
            if (meta.groundCount > 0) return 'rgba(212,163,115,0.5)';
            if (meta.pharmacyStation) return 'rgba(45,212,191,0.22)';
            if (meta.compostStation) return 'rgba(202,138,4,0.22)';
            return 'rgba(255,255,255,0.08)';
        }

        function drawDynamicCell(gx, gy, meta) {
            var gap = 1;
            var x = gx * cellPx + gap;
            var y = gy * cellPx + gap;
            var w = cellPx - gap * 2 - 1;
            var h = cellPx - gap * 2 - 1;

            if (meta.adjacent && !meta.leapTarget) {
                dynamicCtx.fillStyle = 'rgba(255,255,255,0.05)';
                dynamicCtx.fillRect(x, y, w, h);
            }

            if (meta.leapTarget) {
                dynamicCtx.fillStyle = 'rgba(56,189,248,0.14)';
                dynamicCtx.fillRect(x, y, w, h);
                dynamicCtx.strokeStyle = 'rgba(56,189,248,0.55)';
                dynamicCtx.lineWidth = 2;
                dynamicCtx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            }

            if (meta.unknownPresence) {
                dynamicCtx.fillStyle = 'rgba(245, 222, 179, 0.95)';
                dynamicCtx.font = 'bold 20px sans-serif';
                dynamicCtx.fillText('?', x + w / 2 - 5, y + h / 2 + 7);
            } else if (meta.npc) {
                dynamicCtx.fillStyle = 'rgba(210,190,255,0.95)';
                var rawLab = meta.npcLabel != null ? String(meta.npcLabel).trim() : '';
                var lab = rawLab;
                if (lab) {
                    if (lab.length > 6) lab = lab.slice(0, 6);
                    var fs = lab.length > 3 ? 11 : 13;
                    dynamicCtx.font = 'bold ' + fs + 'px "Microsoft YaHei","PingFang SC",sans-serif';
                    var tw = dynamicCtx.measureText(lab).width;
                    dynamicCtx.fillText(lab, x + w / 2 - tw / 2, y + h / 2 + 7);
                } else {
                    // 无地图短标签时使用中性标记，避免误导为“人形 NPC”。
                    dynamicCtx.beginPath();
                    dynamicCtx.arc(x + w / 2, y + h / 2, 4, 0, Math.PI * 2);
                    dynamicCtx.fill();
                }
            } else if (meta.enemy) {
                if (meta.enemyId === 'enemy.training_dummy_wooden') {
                    dynamicCtx.fillStyle = 'rgba(139,90,43,0.95)';
                    dynamicCtx.fillRect(x + w / 2 - 5, y + h / 2 - 16, 10, 26);
                    dynamicCtx.strokeStyle = 'rgba(60,40,20,0.6)';
                    dynamicCtx.lineWidth = 1;
                    dynamicCtx.strokeRect(x + w / 2 - 5 + 0.5, y + h / 2 - 16 + 0.5, 9, 25);
                } else {
                    dynamicCtx.fillStyle = 'rgba(248,113,113,0.95)';
                    dynamicCtx.beginPath();
                    dynamicCtx.arc(x + w / 2, y + h / 2, 8, 0, Math.PI * 2);
                    dynamicCtx.fill();
                }
            } else if (meta.cookingStation || meta.pharmacyStation || meta.compostStation) {
                var stationLabel = meta.cookingStation ? '灶' : (meta.pharmacyStation ? '制药台' : '制肥桶');
                dynamicCtx.fillStyle = 'rgba(251,146,60,0.95)';
                dynamicCtx.font = 'bold 20px "Microsoft YaHei","PingFang SC",sans-serif';
                var stationLabelWidth = dynamicCtx.measureText(stationLabel).width;
                dynamicCtx.fillText(stationLabel, x + w / 2 - stationLabelWidth / 2, y + h / 2 + 7);
            }

            if (meta.groundCount > 0) {
                dynamicCtx.fillStyle = 'rgba(212,163,115,0.95)';
                dynamicCtx.font = '14px sans-serif';
                dynamicCtx.fillText('📦', x + w - 18, y + h - 6);
            } else if (meta.groundUnknown) {
                dynamicCtx.fillStyle = 'rgba(212,163,115,0.75)';
                dynamicCtx.font = '13px sans-serif';
                dynamicCtx.fillText('?', x + w - 14, y + h - 6);
            }

            if (meta.player) {
                dynamicCtx.strokeStyle = 'rgba(251,191,36,0.85)';
                dynamicCtx.lineWidth = 2;
                dynamicCtx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            }
        }

        function drawCellStatic(gx, gy, meta) {
            var gap = 1;
            var x = gx * cellPx + gap;
            var y = gy * cellPx + gap;
            var w = cellPx - gap * 2 - 1;
            var h = cellPx - gap * 2 - 1;
            staticCtx.fillStyle = colorForCell(meta);
            staticCtx.fillRect(x, y, w, h);
            staticCtx.strokeStyle = strokeForCell(meta);
            staticCtx.lineWidth = 1;
            staticCtx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }

        function ensureStaticLayer(nextScene) {
            var map = nextScene.map;
            var mapKey = (map.map_id || 'map') + ':' + map.width + 'x' + map.height + ':' + (map.version || 0);
            var dataKey = nextScene.staticDataKey || '';
            var sizeKey = staticCanvas.width + 'x' + staticCanvas.height;
            if (
                staticMapKey === mapKey &&
                staticDataKey === dataKey &&
                staticSizeKey === sizeKey
            ) return;
            staticMapKey = mapKey;
            staticDataKey = dataKey;
            staticSizeKey = sizeKey;
            staticCtx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);

            var staticMetaAt = nextScene.staticMetaAt || nextScene.dynamicMetaAt || function () { return {}; };
            for (var gy = 0; gy < map.height; gy++) {
                for (var gx = 0; gx < map.width; gx++) {
                    drawCellStatic(gx, gy, staticMetaAt(gx, gy));
                }
            }
        }

        function getVisibleRange(nextScene) {
            var map = nextScene.map;
            var st = nextScene.st || { x: 0, y: 0 };
            var vp = nextScene.viewport || { width: 1042, height: 638 };
            var halfW = Math.ceil((vp.width || 1042) / cellPx / 2) + 2;
            var halfH = Math.ceil((vp.height || 638) / cellPx / 2) + 2;
            return {
                minX: clamp(st.x - halfW, 0, map.width - 1),
                maxX: clamp(st.x + halfW, 0, map.width - 1),
                minY: clamp(st.y - halfH, 0, map.height - 1),
                maxY: clamp(st.y + halfH, 0, map.height - 1)
            };
        }

        function render(nextScene) {
            lastInput = nextScene;
            scene.map = nextScene.map;
            scene.st = nextScene.st;
            scene.staticMetaAt = nextScene.staticMetaAt;
            scene.dynamicMetaAt = nextScene.dynamicMetaAt || nextScene.metaAt;
            scene.viewport = nextScene.viewport || null;
            if (!scene.map || !scene.st || typeof scene.dynamicMetaAt !== 'function') return;

            resize(scene.map.width * cellPx, scene.map.height * cellPx);
            ensureStaticLayer(nextScene);

            var dirtyCells = Array.isArray(nextScene.dirtyCells) ? nextScene.dirtyCells : null;
            if (dirtyCells && dirtyCells.length > 0) {
                var seen = {};
                for (var di = 0; di < dirtyCells.length; di++) {
                    var c = dirtyCells[di];
                    if (!c || c.x == null || c.y == null) continue;
                    var gx = c.x | 0;
                    var gy = c.y | 0;
                    if (gx < 0 || gy < 0 || gx >= scene.map.width || gy >= scene.map.height) continue;
                    var k = gx + ',' + gy;
                    if (seen[k]) continue;
                    seen[k] = true;
                    var gap = 1;
                    var x = gx * cellPx + gap;
                    var y = gy * cellPx + gap;
                    var w = cellPx - gap * 2 - 1;
                    var h = cellPx - gap * 2 - 1;
                    dynamicCtx.clearRect(x - 2, y - 2, w + 4, h + 4);
                    drawDynamicCell(gx, gy, scene.dynamicMetaAt(gx, gy));
                }
            } else {
                /* dirtyCells 为空 / null：整块动态层清空后仅重画当前视野内格子（与 partial 路径互补） */
                dynamicCtx.clearRect(0, 0, dynamicCanvas.width, dynamicCanvas.height);
                var vr = getVisibleRange(nextScene);
                for (var gy = vr.minY; gy <= vr.maxY; gy++) {
                    for (var gx = vr.minX; gx <= vr.maxX; gx++) {
                        drawDynamicCell(gx, gy, scene.dynamicMetaAt(gx, gy));
                    }
                }
            }
            renderFxLayer(getNowMs());
        }

        function clearFxLayer() {
            fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
        }

        function renderFxLayer(nowMs) {
            clearFxLayer();
            if (!effectsRenderer || !scene.map || !scene.st) return;
            try {
                effectsRenderer({
                    ctx: fxCtx,
                    nowMs: nowMs,
                    map: scene.map,
                    state: scene.st,
                    cellPx: cellPx,
                    cellToPx: function (x, y) {
                        return { x: x * cellPx, y: y * cellPx };
                    }
                });
            } catch (e) {
                // Effect renderer failures must not break core map rendering.
            }
        }

        function tickAnimationLoop(nowMs) {
            if (!animationLoopEnabled) return;
            if (lastInput) renderFxLayer(nowMs);
            animationLoopId = requestAnimationFrame(tickAnimationLoop);
        }

        function startAnimationLoop() {
            if (animationLoopEnabled) return;
            animationLoopEnabled = true;
            animationLoopId = requestAnimationFrame(tickAnimationLoop);
        }

        function stopAnimationLoop() {
            animationLoopEnabled = false;
            if (animationLoopId) {
                cancelAnimationFrame(animationLoopId);
                animationLoopId = null;
            }
        }

        function hitTest(clientX, clientY) {
            var rect = mapGridEl.getBoundingClientRect();
            var rx = clientX - rect.left;
            var ry = clientY - rect.top;
            var gx = Math.floor(rx / cellPx);
            var gy = Math.floor(ry / cellPx);
            if (!scene.map) return null;
            if (gx < 0 || gy < 0 || gx >= scene.map.width || gy >= scene.map.height) return null;
            return { x: gx, y: gy };
        }

        function setCamera(tx, ty) {
            mapGridEl.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';
        }

        function setHoverCursor(clientX, clientY) {
            var hit = hitTest(clientX, clientY);
            if (!hit || !scene.dynamicMetaAt) {
                mapGridEl.style.cursor = 'default';
                return;
            }
            var meta = scene.dynamicMetaAt(hit.x, hit.y);
            var canClick = !!(meta.leapTarget || (meta.adjacent && (meta.walkable || meta.npc || meta.enemy)));
            mapGridEl.style.cursor = canClick ? 'pointer' : 'default';
        }

        return {
            render: render,
            hitTest: hitTest,
            setCamera: setCamera,
            setHoverCursor: setHoverCursor,
            setEffectsRenderer: function (fn) {
                effectsRenderer = typeof fn === 'function' ? fn : null;
            },
            startAnimationLoop: startAnimationLoop,
            stopAnimationLoop: stopAnimationLoop,
            renderFxLayer: function (ts) {
                renderFxLayer(ts != null ? ts : getNowMs());
            },
            invalidateStatic: function () {
                staticMapKey = '';
                staticDataKey = '';
                staticSizeKey = '';
                staticCtx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
                dynamicCtx.clearRect(0, 0, dynamicCanvas.width, dynamicCanvas.height);
                clearFxLayer();
            }
        };
    }

    global.TileRendererV2 = {
        create: create,
        clamp: clamp
    };
})(typeof window !== 'undefined' ? window : this);
