// 主场景渲染层：只做 DOM/UI 渲染，不做规则运算
(function () {
    function getCtx() {
        return window.SceneCtx || null;
    }

    function isDialogueBlockingWorldInput() {
        return !!(window.DialogueUI && typeof window.DialogueUI.isDialogueOpen === 'function' && window.DialogueUI.isDialogueOpen());
    }

    var tooltipEl = null;
    var tooltipHideTimer = null;
    var tileRenderer = null;
    var interactionBound = false;
    var latestFrame = null;
    var lastStaticDataKey = '';
    var prevRenderState = null;
    var prevDynamicCellMarks = {};
    var dynamicDiffTick = 0;
    /** 上一帧是否处于蹑步选点；用于检测 true→false 并强制整层动态重画（见 render 内说明） */
    var prevFootworkNieBuMode = false;
    var quickBeltCacheKey = '';
    var hoverRafId = 0;
    var hoverPendingClientX = 0;
    var hoverPendingClientY = 0;
    var quickBeltHoverMenuEl = null;
    var quickBeltHoverHideTimer = null;
    var quickBeltHoverDocBound = false;
    var visionDebugEnabled = false;

    function buildDirtyCells(prev, cur, radius) {
        var out = [];
        var seen = {};
        var r = radius != null ? radius : 1;
        function add(x, y) {
            var k = x + ',' + y;
            if (seen[k]) return;
            seen[k] = true;
            out.push({ x: x, y: y });
        }
        function addAround(x, y) {
            for (var yy = y - r; yy <= y + r; yy++) {
                for (var xx = x - r; xx <= x + r; xx++) add(xx, yy);
            }
        }
        if (prev && cur && prev.mapId === cur.mapId) {
            addAround(prev.x, prev.y);
            addAround(cur.x, cur.y);
        }
        return out;
    }

    function mergeDirtyCells(primary, extra) {
        var out = [];
        var seen = {};
        function push(c) {
            if (!c || c.x == null || c.y == null) return;
            var k = (c.x | 0) + ',' + (c.y | 0);
            if (seen[k]) return;
            seen[k] = true;
            out.push({ x: (c.x | 0), y: (c.y | 0) });
        }
        var a = Array.isArray(primary) ? primary : [];
        var b = Array.isArray(extra) ? extra : [];
        for (var i = 0; i < a.length; i++) push(a[i]);
        for (var j = 0; j < b.length; j++) push(b[j]);
        return out;
    }

    function collectDynamicCellMarks(map, mapId, E, IE, range) {
        var marks = {};
        if (!map) return marks;
        var minX = 0, minY = 0, maxX = map.width - 1, maxY = map.height - 1;
        if (range) {
            minX = Math.max(0, range.minX | 0);
            minY = Math.max(0, range.minY | 0);
            maxX = Math.min(map.width - 1, range.maxX | 0);
            maxY = Math.min(map.height - 1, range.maxY | 0);
        }
        for (var gy = minY; gy <= maxY; gy++) {
            for (var gx = minX; gx <= maxX; gx++) {
                var k = gx + ',' + gy;
                var npcId = (typeof E.getInteractNpcIdAt === 'function')
                    ? E.getInteractNpcIdAt(gx, gy)
                    : ((typeof E.getNpcAt === 'function') ? E.getNpcAt(gx, gy) : null);
                var enemyId = (typeof E.getEnemyAt === 'function') ? E.getEnemyAt(gx, gy) : null;
                if (npcId && window.GameTime && window.NPCSystem && typeof window.NPCSystem.isNpcPresentNow === 'function') {
                    if (!window.NPCSystem.isNpcPresentNow(npcId)) npcId = null;
                }
                var groundCount = 0;
                if (IE && typeof IE.getGroundItemsAt === 'function' && mapId != null) {
                    var arr = IE.getGroundItemsAt(mapId, gx, gy);
                    groundCount = Array.isArray(arr) ? arr.length : 0;
                }
                if (npcId || enemyId || groundCount > 0) {
                    marks[k] = (npcId ? ('n:' + npcId) : '-') + '|' + (enemyId ? ('e:' + enemyId) : '-') + '|g:' + groundCount;
                }
            }
        }
        return marks;
    }

    function buildDirtyFromDynamicDiff(prevMarks, curMarks) {
        var out = [];
        var seen = {};
        function pushKey(k) {
            if (!k || seen[k]) return;
            seen[k] = true;
            var p = k.split(',');
            out.push({ x: Number(p[0]) || 0, y: Number(p[1]) || 0 });
        }
        for (var k in curMarks) {
            if (!curMarks.hasOwnProperty(k)) continue;
            if (prevMarks[k] !== curMarks[k]) pushKey(k);
        }
        for (var k2 in prevMarks) {
            if (!prevMarks.hasOwnProperty(k2)) continue;
            if (curMarks[k2] == null) pushKey(k2);
        }
        return out;
    }

    function buildScanRange(st, map, radius) {
        if (!st || !map) return null;
        var r = Math.max(2, radius | 0);
        return {
            minX: st.x - r,
            minY: st.y - r,
            maxX: st.x + r,
            maxY: st.y + r
        };
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function wrapMinuteOfDay(minute) {
        var m = Math.floor(Number(minute) || 0) % 1440;
        if (m < 0) m += 1440;
        return m;
    }

    function getDayNightVisionConfig() {
        var fallback = {
            enabled: true,
            overlayRgb: [8, 12, 24],
            darknessKeyframes: [
                { minute: 0, alpha: 0.58 },
                { minute: 240, alpha: 0.52 },
                { minute: 360, alpha: 0.30 },
                { minute: 480, alpha: 0.14 },
                { minute: 720, alpha: 0.04 },
                { minute: 1080, alpha: 0.22 },
                { minute: 1320, alpha: 0.48 },
                { minute: 1440, alpha: 0.58 }
            ],
            clearRadiusCellsDay: 5.4,
            clearRadiusCellsNight: 2.8,
            clearFalloffCells: 3.4
        };
        var cfg = null;
        if (window.Survival && typeof window.Survival.getConfigValue === 'function') {
            cfg = window.Survival.getConfigValue('vision_day_night', null);
        }
        if (!cfg || typeof cfg !== 'object') return fallback;

        var out = {
            enabled: cfg.enabled !== false,
            overlayRgb: fallback.overlayRgb.slice(),
            darknessKeyframes: fallback.darknessKeyframes.slice(),
            clearRadiusCellsDay: fallback.clearRadiusCellsDay,
            clearRadiusCellsNight: fallback.clearRadiusCellsNight,
            clearFalloffCells: fallback.clearFalloffCells
        };

        if (Array.isArray(cfg.overlay_rgb) && cfg.overlay_rgb.length >= 3) {
            var r = Math.max(0, Math.min(255, Number(cfg.overlay_rgb[0]) || 0));
            var g = Math.max(0, Math.min(255, Number(cfg.overlay_rgb[1]) || 0));
            var b = Math.max(0, Math.min(255, Number(cfg.overlay_rgb[2]) || 0));
            out.overlayRgb = [r, g, b];
        }
        if (Array.isArray(cfg.darkness_keyframes) && cfg.darkness_keyframes.length >= 2) {
            var rows = [];
            for (var i = 0; i < cfg.darkness_keyframes.length; i++) {
                var row = cfg.darkness_keyframes[i];
                if (!row || typeof row !== 'object') continue;
                var minute = Math.max(0, Math.min(1440, Number(row.minute)));
                var alpha = Math.max(0, Math.min(1, Number(row.alpha)));
                if (!Number.isFinite(minute) || !Number.isFinite(alpha)) continue;
                rows.push({ minute: minute, alpha: alpha });
            }
            rows.sort(function (a, b) { return a.minute - b.minute; });
            if (rows.length >= 2) out.darknessKeyframes = rows;
        }
        var dayRadius = Number(cfg.clear_radius_cells_day);
        var nightRadius = Number(cfg.clear_radius_cells_night);
        var falloffCells = Number(cfg.clear_falloff_cells);
        if (Number.isFinite(dayRadius) && dayRadius > 0.2) out.clearRadiusCellsDay = dayRadius;
        if (Number.isFinite(nightRadius) && nightRadius > 0.2) out.clearRadiusCellsNight = nightRadius;
        if (Number.isFinite(falloffCells) && falloffCells > 0.1) out.clearFalloffCells = falloffCells;
        return out;
    }

    function getVisionRevealUiConfig() {
        var fallback = {
            visualRadiusDay: 8.0,
            visualRadiusNight: 4.0,
            identifyRatio: 0.72,
            detailRatio: 0.45,
            adjacentDetailRadius: 1,
            debugEnabledDefault: false
        };
        var cfg = null;
        if (window.Survival && typeof window.Survival.getConfigValue === 'function') {
            cfg = window.Survival.getConfigValue('vision_reveal_ui', null);
        }
        if (!cfg || typeof cfg !== 'object') return fallback;
        var out = {
            visualRadiusDay: fallback.visualRadiusDay,
            visualRadiusNight: fallback.visualRadiusNight,
            identifyRatio: fallback.identifyRatio,
            detailRatio: fallback.detailRatio,
            adjacentDetailRadius: fallback.adjacentDetailRadius,
            debugEnabledDefault: fallback.debugEnabledDefault
        };
        var day = Number(cfg.visual_radius_day);
        var night = Number(cfg.visual_radius_night);
        var identifyRatio = Number(cfg.identify_ratio);
        var detailRatio = Number(cfg.detail_ratio);
        var adjacent = Number(cfg.adjacent_detail_radius);
        out.debugEnabledDefault = cfg.debug_enabled === true;
        if (Number.isFinite(day) && day >= 2) out.visualRadiusDay = day;
        if (Number.isFinite(night) && night >= 1) out.visualRadiusNight = night;
        if (Number.isFinite(identifyRatio) && identifyRatio > 0 && identifyRatio <= 1) out.identifyRatio = identifyRatio;
        if (Number.isFinite(detailRatio) && detailRatio > 0 && detailRatio <= out.identifyRatio) out.detailRatio = detailRatio;
        if (Number.isFinite(adjacent) && adjacent >= 0) out.adjacentDetailRadius = adjacent;
        return out;
    }

    function getVisionFacingUiConfig() {
        var fallback = {
            enabled: false,
            frontHalfAngleDeg: 45,
            sideHalfAngleDeg: 90,
            frontMul: 1.0,
            sideMul: 0.65,
            backMul: 0.35,
            showConeOverlay: true,
            coneOpacity: 0.16,
            edgeOpacity: 0.28
        };
        var cfg = null;
        if (window.Survival && typeof window.Survival.getConfigValue === 'function') {
            cfg = window.Survival.getConfigValue('vision_facing_ui', null);
        }
        if (!cfg || typeof cfg !== 'object') return fallback;
        var out = {
            enabled: cfg.enabled === true,
            frontHalfAngleDeg: fallback.frontHalfAngleDeg,
            sideHalfAngleDeg: fallback.sideHalfAngleDeg,
            frontMul: fallback.frontMul,
            sideMul: fallback.sideMul,
            backMul: fallback.backMul,
            showConeOverlay: fallback.showConeOverlay,
            coneOpacity: fallback.coneOpacity,
            edgeOpacity: fallback.edgeOpacity
        };
        var frontA = Number(cfg.front_half_angle_deg);
        var sideA = Number(cfg.side_half_angle_deg);
        var frontMul = Number(cfg.front_mul);
        var sideMul = Number(cfg.side_mul);
        var backMul = Number(cfg.back_mul);
        var coneOpacity = Number(cfg.cone_opacity);
        var edgeOpacity = Number(cfg.edge_opacity);
        if (Number.isFinite(frontA) && frontA >= 5 && frontA <= 180) out.frontHalfAngleDeg = frontA;
        if (Number.isFinite(sideA) && sideA >= out.frontHalfAngleDeg && sideA <= 180) out.sideHalfAngleDeg = sideA;
        if (Number.isFinite(frontMul) && frontMul > 0 && frontMul <= 2) out.frontMul = frontMul;
        if (Number.isFinite(sideMul) && sideMul > 0 && sideMul <= 2) out.sideMul = sideMul;
        if (Number.isFinite(backMul) && backMul > 0 && backMul <= 2) out.backMul = backMul;
        if (cfg.show_cone_overlay != null) out.showConeOverlay = cfg.show_cone_overlay !== false;
        if (Number.isFinite(coneOpacity) && coneOpacity >= 0 && coneOpacity <= 1) out.coneOpacity = coneOpacity;
        if (Number.isFinite(edgeOpacity) && edgeOpacity >= 0 && edgeOpacity <= 1) out.edgeOpacity = edgeOpacity;
        return out;
    }

    function getVisionOcclusionUiConfig() {
        var fallback = {
            enabled: false,
            hideNonvisibleTerrain: true,
            occlusionRgb: [6, 8, 14],
            occlusionAlpha: 0.96,
            stripDynamicOnRearAdjacent: true,
            distanceShadeEnabled: false,
            distanceShadeRgb: [10, 12, 22],
            distanceShadeMaxAlpha: 0.24,
            distanceShadeStartRatio: 0.2,
            distanceShadePower: 1.25
        };
        var cfg = null;
        if (window.Survival && typeof window.Survival.getConfigValue === 'function') {
            cfg = window.Survival.getConfigValue('vision_occlusion_ui', null);
        }
        if (!cfg || typeof cfg !== 'object') return fallback;
        var out = {
            enabled: cfg.enabled === true,
            hideNonvisibleTerrain: cfg.hide_nonvisible_terrain !== false,
            occlusionRgb: fallback.occlusionRgb.slice(),
            occlusionAlpha: fallback.occlusionAlpha,
            stripDynamicOnRearAdjacent: cfg.strip_dynamic_on_rear_adjacent !== false,
            distanceShadeEnabled: cfg.distance_shade_enabled === true,
            distanceShadeRgb: fallback.distanceShadeRgb.slice(),
            distanceShadeMaxAlpha: fallback.distanceShadeMaxAlpha,
            distanceShadeStartRatio: fallback.distanceShadeStartRatio,
            distanceShadePower: fallback.distanceShadePower
        };
        if (Array.isArray(cfg.occlusion_rgb) && cfg.occlusion_rgb.length >= 3) {
            var r = Math.max(0, Math.min(255, Number(cfg.occlusion_rgb[0]) || 0));
            var g = Math.max(0, Math.min(255, Number(cfg.occlusion_rgb[1]) || 0));
            var b = Math.max(0, Math.min(255, Number(cfg.occlusion_rgb[2]) || 0));
            out.occlusionRgb = [r, g, b];
        }
        var oa = Number(cfg.occlusion_alpha);
        if (Number.isFinite(oa) && oa >= 0 && oa <= 1) out.occlusionAlpha = oa;
        if (Array.isArray(cfg.distance_shade_rgb) && cfg.distance_shade_rgb.length >= 3) {
            var r2 = Math.max(0, Math.min(255, Number(cfg.distance_shade_rgb[0]) || 0));
            var g2 = Math.max(0, Math.min(255, Number(cfg.distance_shade_rgb[1]) || 0));
            var b2 = Math.max(0, Math.min(255, Number(cfg.distance_shade_rgb[2]) || 0));
            out.distanceShadeRgb = [r2, g2, b2];
        }
        var dma = Number(cfg.distance_shade_max_alpha);
        if (Number.isFinite(dma) && dma >= 0 && dma <= 0.95) out.distanceShadeMaxAlpha = dma;
        var dsr = Number(cfg.distance_shade_start_ratio);
        if (Number.isFinite(dsr) && dsr >= 0 && dsr <= 0.9) out.distanceShadeStartRatio = dsr;
        var dsp = Number(cfg.distance_shade_power);
        if (Number.isFinite(dsp) && dsp >= 0.5 && dsp <= 3) out.distanceShadePower = dsp;
        return out;
    }

    /** 与玩家距离 1 且处于朝向「背后」半空间的三个邻格（八向一格一步）。 */
    function isRearAdjacentTriple(st, gx, gy) {
        if (!st) return false;
        var dx = (gx | 0) - (st.x | 0);
        var dy = (gy | 0) - (st.y | 0);
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;
        var fv = facingDirToVector(resolvePlayerFacingDir());
        var dot = dx * fv.x + dy * fv.y;
        return dot < 0;
    }

    function getDarknessAlphaNow() {
        var gt = window.GameTime;
        if (!gt || typeof gt.getState !== 'function') return 0;
        var state = gt.getState() || {};
        var dayNightCfg = getDayNightVisionConfig();
        return sampleNightDarknessByMinute(state.minuteOfDay, dayNightCfg.darknessKeyframes);
    }

    function getMaxDarknessAlphaRef(keyframes) {
        var maxAlpha = 0;
        var rows = Array.isArray(keyframes) ? keyframes : [];
        for (var i = 0; i < rows.length; i++) {
            maxAlpha = Math.max(maxAlpha, Number(rows[i].alpha) || 0);
        }
        return Math.max(0.01, maxAlpha);
    }

    function getVisionRevealProfile() {
        var dayNightCfg = getDayNightVisionConfig();
        var uiCfg = getVisionRevealUiConfig();
        var darknessAlpha = getDarknessAlphaNow();
        var maxDarknessAlphaRef = getMaxDarknessAlphaRef(dayNightCfg.darknessKeyframes);
        var nightT = Math.min(1, Math.max(0, darknessAlpha / maxDarknessAlphaRef));
        var visualRadius = lerp(uiCfg.visualRadiusDay, uiCfg.visualRadiusNight, nightT);
        var identifyRadius = Math.max(1, visualRadius * uiCfg.identifyRatio);
        var detailRadius = Math.max(1, visualRadius * uiCfg.detailRatio);
        return {
            visualRadius: visualRadius,
            identifyRadius: identifyRadius,
            detailRadius: detailRadius,
            adjacentDetailRadius: uiCfg.adjacentDetailRadius
        };
    }

    function chebyshevDistance(ax, ay, bx, by) {
        return Math.max(Math.abs((ax | 0) - (bx | 0)), Math.abs((ay | 0) - (by | 0)));
    }

    function facingDirToVector(dir) {
        var d = Number(dir);
        if (!Number.isFinite(d)) d = 4;
        d = Math.round(d) % 8;
        if (d < 0) d += 8;
        switch (d) {
            case 0: return { x: 0, y: -1 };
            case 1: return { x: 1, y: -1 };
            case 2: return { x: 1, y: 0 };
            case 3: return { x: 1, y: 1 };
            case 4: return { x: 0, y: 1 };
            case 5: return { x: -1, y: 1 };
            case 6: return { x: -1, y: 0 };
            case 7: return { x: -1, y: -1 };
            default: return { x: 0, y: 1 };
        }
    }

    function resolvePlayerFacingDir() {
        if (window.PlayerFacing && typeof window.PlayerFacing.getDir === 'function') {
            return window.PlayerFacing.getDir();
        }
        if (window.SceneCtx && typeof window.SceneCtx.getFacingDir === 'function') {
            return window.SceneCtx.getFacingDir();
        }
        return 4;
    }

    function hasVisibleDomDirectionIndicator() {
        var el = document.getElementById('player-direction-indicator');
        if (!el) return false;
        var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (!style) return true;
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    function getFacingVisionMultiplier(st, gx, gy) {
        var cfg = getVisionFacingUiConfig();
        if (!cfg.enabled) return 1;
        var tx = (gx | 0) - (st.x | 0);
        var ty = (gy | 0) - (st.y | 0);
        if (!tx && !ty) return 1;
        var fv = facingDirToVector(resolvePlayerFacingDir());
        var lenA = Math.sqrt(fv.x * fv.x + fv.y * fv.y) || 1;
        var lenB = Math.sqrt(tx * tx + ty * ty) || 1;
        var dot = fv.x * tx + fv.y * ty;
        var c = dot / (lenA * lenB);
        if (c > 1) c = 1;
        if (c < -1) c = -1;
        var ang = Math.acos(c) * 180 / Math.PI;
        if (ang <= cfg.frontHalfAngleDeg) return cfg.frontMul;
        if (ang <= cfg.sideHalfAngleDeg) return cfg.sideMul;
        return cfg.backMul;
    }

    /**
     * 通用的实体朝向指示器绘制模块，可以在人物或敌人格子边缘的八个方向绘制箭头
     */
    function renderEntityDirectionIndicator(ctx, cx, cy, cellPx, dir, isEnemy) {
        var fv = facingDirToVector(dir);
        var baseAng = Math.atan2(fv.y, fv.x);
        
        // 沿朝向推到格子的边缘
        var dist = cellPx * 0.44; 
        var tipX = cx + Math.cos(baseAng) * dist;
        var tipY = cy + Math.sin(baseAng) * dist;
        var size = cellPx * 0.16;

        ctx.save();
        ctx.translate(tipX, tipY);
        ctx.rotate(baseAng);

        ctx.beginPath();
        ctx.moveTo(size * 0.6, 0);
        ctx.lineTo(-size * 0.6, size * 0.5);
        ctx.lineTo(-size * 0.25, 0);
        ctx.lineTo(-size * 0.6, -size * 0.5);
        ctx.closePath();

        var color = isEnemy ? 'rgba(239, 68, 68, 0.95)' : 'rgba(250, 230, 140, 0.95)';
        var shadow = isEnemy ? 'rgba(220, 38, 38, 0.6)' : 'rgba(250, 230, 140, 0.6)';

        ctx.fillStyle = color;
        ctx.shadowColor = shadow;
        ctx.shadowBlur = 6;
        ctx.fill();

        ctx.strokeStyle = 'rgba(20, 20, 20, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
    }

    function sampleNightDarknessByMinute(minuteOfDay, keyframes) {
        var m = wrapMinuteOfDay(minuteOfDay);
        var src = Array.isArray(keyframes) ? keyframes : [];
        if (src.length < 2) return 0.2;
        var keys = [];
        for (var i = 0; i < src.length; i++) {
            var row = src[i] || {};
            keys.push({
                m: Math.max(0, Math.min(1440, Number(row.minute) || 0)),
                a: Math.max(0, Math.min(1, Number(row.alpha) || 0))
            });
        }
        keys.sort(function (a, b) { return a.m - b.m; });
        for (var i = 0; i < keys.length - 1; i++) {
            var a = keys[i];
            var b = keys[i + 1];
            if (m >= a.m && m <= b.m) {
                var span = Math.max(1, b.m - a.m);
                var t = (m - a.m) / span;
                return lerp(a.a, b.a, t);
            }
        }
        return 0.2;
    }

    function renderDayNightVisionOverlay(args) {
        if (!args || !args.ctx || !args.map || !args.state) return;
        var ctx2d = args.ctx;
        var map = args.map;
        var st = args.state;
        var cellPx = args.cellPx || 101;
        var cellToPx = args.cellToPx || function (x, y) { return { x: x * cellPx, y: y * cellPx }; };
        var gt = window.GameTime;
        if (!gt || typeof gt.getState !== 'function') return;
        var cfg = getDayNightVisionConfig();
        if (!cfg.enabled) return;
        var timeState = gt.getState() || {};
        var darknessAlpha = sampleNightDarknessByMinute(timeState.minuteOfDay, cfg.darknessKeyframes);
        if (!(darknessAlpha > 0.01)) return;

        var mapW = (map.width | 0) * cellPx;
        var mapH = (map.height | 0) * cellPx;
        if (!(mapW > 0) || !(mapH > 0)) return;

        var p = cellToPx(st.x | 0, st.y | 0);
        var cx = p.x + cellPx / 2;
        var cy = p.y + cellPx / 2;

        // 夜越深，清晰半径越小；只做视觉层，不改变规则判定。
        var maxDarknessAlphaRef = getMaxDarknessAlphaRef(cfg.darknessKeyframes);
        var nightT = Math.min(1, darknessAlpha / maxDarknessAlphaRef);
        var clearRadiusInner = cellPx * lerp(cfg.clearRadiusCellsDay, cfg.clearRadiusCellsNight, nightT);
        var clearRadiusOuter = clearRadiusInner + cellPx * cfg.clearFalloffCells;
        var rgb = cfg.overlayRgb;

        ctx2d.save();
        ctx2d.fillStyle = 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + darknessAlpha.toFixed(3) + ')';
        ctx2d.fillRect(0, 0, mapW, mapH);

        var g = ctx2d.createRadialGradient(cx, cy, clearRadiusInner * 0.2, cx, cy, clearRadiusOuter);
        g.addColorStop(0, 'rgba(0,0,0,0.95)');
        g.addColorStop(0.55, 'rgba(0,0,0,0.50)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx2d.globalCompositeOperation = 'destination-out';
        ctx2d.fillStyle = g;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, clearRadiusOuter, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.restore();
    }

    function renderFacingVisionOverlay(args) {
        if (!args || !args.ctx || !args.map || !args.state) return;
        var cfg = getVisionFacingUiConfig();
        // 若 DOM 朝向光标存在且可见，避免在 FX 层重复绘制第二个光标。
        if (hasVisibleDomDirectionIndicator()) return;
        var ctx2d = args.ctx;
        var st = args.state;
        var cellPx = args.cellPx || 101;
        var cellToPx = args.cellToPx || function (x, y) { return { x: x * cellPx, y: y * cellPx }; };
        
        var p = cellToPx(st.x | 0, st.y | 0);
        var cx = p.x + cellPx / 2;
        var cy = p.y + cellPx / 2;
        var currentDir = resolvePlayerFacingDir();
        if (!Number.isFinite(Number(currentDir))) currentDir = 4;

        renderEntityDirectionIndicator(ctx2d, cx, cy, cellPx, currentDir, false);
    }

    /**
     * 对「当前不可视」格子叠色盖住地形；身后三邻格在 strip_dynamic_on_rear_adjacent 为真时不叠（便于后退）。
     * 不并入 adjacent_detail_radius，与 20-map-vision-ui.md 一致。
     */
    function renderVisionOcclusionOverlay(args) {
        if (!args || !args.ctx || !args.map || !args.state) return;
        var occCfg = getVisionOcclusionUiConfig();
        if (!occCfg.enabled || !occCfg.hideNonvisibleTerrain) return;
        var facingCfg = getVisionFacingUiConfig();
        if (!facingCfg.enabled) return;
        var ctx2d = args.ctx;
        var map = args.map;
        var st = args.state;
        var cellPx = args.cellPx || 101;
        var cellToPx = args.cellToPx || function (x, y) { return { x: x * cellPx, y: y * cellPx }; };
        var mapW = (map.width | 0) * cellPx;
        var mapH = (map.height | 0) * cellPx;
        if (!(mapW > 0) || !(mapH > 0)) return;
        var profile = getVisionRevealProfile();
        var gap = 1;
        var rgb = occCfg.occlusionRgb;
        var a = occCfg.occlusionAlpha;
        if (!(a > 0.02)) return;
        ctx2d.save();
        var rgba = 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + a.toFixed(3) + ')';
        ctx2d.fillStyle = rgba;
        for (var gy = 0; gy < map.height; gy++) {
            for (var gx = 0; gx < map.width; gx++) {
                if ((gx | 0) === (st.x | 0) && (gy | 0) === (st.y | 0)) continue;
                if (occCfg.stripDynamicOnRearAdjacent && isRearAdjacentTriple(st, gx, gy)) continue;
                var dist = chebyshevDistance(gx, gy, st.x, st.y);
                var facingMul = getFacingVisionMultiplier(st, gx, gy);
                if (dist <= profile.visualRadius * facingMul) continue;
                var p = cellToPx(gx | 0, gy | 0);
                var x = p.x + gap;
                var y = p.y + gap;
                var w = cellPx - gap * 2 - 1;
                var h = cellPx - gap * 2 - 1;
                ctx2d.fillRect(x, y, w, h);
            }
        }
        ctx2d.restore();
    }

    /**
     * 可视区内按距离叠半透明暗色：近亮远略暗（仅 FX，不改规则）。
     * 使用与遮挡相同的有效半径 visualRadius * facingMul；玩家格不叠。
     */
    function renderVisionDistanceShadeOverlay(args) {
        if (!args || !args.ctx || !args.map || !args.state) return;
        var occCfg = getVisionOcclusionUiConfig();
        if (!occCfg.enabled || !occCfg.distanceShadeEnabled) return;
        var maxA = occCfg.distanceShadeMaxAlpha;
        if (!(maxA > 0.004)) return;
        var ctx2d = args.ctx;
        var map = args.map;
        var st = args.state;
        var cellPx = args.cellPx || 101;
        var cellToPx = args.cellToPx || function (x, y) { return { x: x * cellPx, y: y * cellPx }; };
        var mapW = (map.width | 0) * cellPx;
        var mapH = (map.height | 0) * cellPx;
        if (!(mapW > 0) || !(mapH > 0)) return;
        var profile = getVisionRevealProfile();
        var gap = 1;
        var rgb = occCfg.distanceShadeRgb;
        var startRatio = occCfg.distanceShadeStartRatio;
        var pow = occCfg.distanceShadePower;
        var span = Math.max(0.02, 1 - startRatio);
        ctx2d.save();
        for (var gy = 0; gy < map.height; gy++) {
            for (var gx = 0; gx < map.width; gx++) {
                if ((gx | 0) === (st.x | 0) && (gy | 0) === (st.y | 0)) continue;
                var dist = chebyshevDistance(gx, gy, st.x, st.y);
                var facingMul = getFacingVisionMultiplier(st, gx, gy);
                var rEff = profile.visualRadius * facingMul;
                if (!(rEff > 0.05)) continue;
                if (dist > rEff) continue;
                var t = dist / rEff;
                if (t <= startRatio) continue;
                var u = (t - startRatio) / span;
                if (u < 0) u = 0;
                if (u > 1) u = 1;
                var cellAlpha = maxA * Math.pow(u, pow);
                if (!(cellAlpha > 0.006)) continue;
                var p = cellToPx(gx | 0, gy | 0);
                ctx2d.fillStyle = 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + cellAlpha.toFixed(4) + ')';
                ctx2d.fillRect(p.x + gap, p.y + gap, cellPx - gap * 2 - 1, cellPx - gap * 2 - 1);
            }
        }
        ctx2d.restore();
    }

    function renderVisionDebugOverlay(args) {
        if (!visionDebugEnabled || !args || !args.ctx || !args.state) return;
        var ctx2d = args.ctx;
        var st = args.state;
        var cellPx = args.cellPx || 101;
        var cellToPx = args.cellToPx || function (x, y) { return { x: x * cellPx, y: y * cellPx }; };
        var profile = getVisionRevealProfile();
        var darkness = getDarknessAlphaNow();
        var facingCfg = getVisionFacingUiConfig();
        var p = cellToPx(st.x | 0, st.y | 0);
        var boxX = p.x - 150;
        var boxY = p.y - cellPx * 2.25;
        var boxW = 300;
        var boxH = 118;
        ctx2d.save();
        ctx2d.fillStyle = 'rgba(10, 10, 10, 0.66)';
        ctx2d.fillRect(boxX, boxY, boxW, boxH);
        ctx2d.strokeStyle = 'rgba(251, 191, 36, 0.7)';
        ctx2d.lineWidth = 1;
        ctx2d.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
        ctx2d.fillStyle = 'rgba(245, 245, 245, 0.96)';
        ctx2d.font = '12px monospace';
        ctx2d.textAlign = 'left';
        ctx2d.textBaseline = 'top';
        ctx2d.fillText('[VISION DEBUG]', boxX + 8, boxY + 8);
        ctx2d.fillText(
            'visual=' + profile.visualRadius.toFixed(2) +
            ' identify=' + profile.identifyRadius.toFixed(2) +
            ' detail=' + profile.detailRadius.toFixed(2),
            boxX + 8,
            boxY + 28
        );
        ctx2d.fillText('darkness=' + darkness.toFixed(3), boxX + 8, boxY + 48);
        ctx2d.fillText('facingDir=' + resolvePlayerFacingDir() + ' sideHalf=' + facingCfg.sideHalfAngleDeg, boxX + 8, boxY + 64);
        var occDbg = getVisionOcclusionUiConfig();
        ctx2d.fillText(
            'occlusion=' + (occDbg.enabled ? 'on' : 'off') +
            ' hideTerr=' + (occDbg.hideNonvisibleTerrain ? 'y' : 'n') +
            ' rearStrip=' + (occDbg.stripDynamicOnRearAdjacent ? 'y' : 'n'),
            boxX + 8,
            boxY + 80
        );
        ctx2d.fillText(
            'distShade=' + (occDbg.distanceShadeEnabled ? 'on' : 'off') +
            ' maxA=' + occDbg.distanceShadeMaxAlpha.toFixed(2),
            boxX + 8,
            boxY + 96
        );
        ctx2d.restore();
    }

    function renderDomFallback(grid, map, st, E, ctx) {
        grid.innerHTML = '';
        grid.style.width = (map.width * ctx.CELL_PX) + 'px';
        grid.style.height = (map.height * ctx.CELL_PX) + 'px';
        var gap = 1;
        var nieBuMode = ctx && ctx.footworkNieBuMode;
        var nieR = nieBuMode && ctx.nieBuLeapRadius != null ? (ctx.nieBuLeapRadius | 0) : 2;
        for (var gy = 0; gy < map.height; gy++) {
            for (var gx = 0; gx < map.width; gx++) {
                var tile = document.createElement('div');
                var adjacent = E.isAdjacent(gx, gy);
                var walkable = E.isWalkable(gx, gy);
                var leapTarget = false;
                if (nieBuMode && typeof E.canStandAt === 'function' && !(gx === st.x && gy === st.y)) {
                    var chDom = Math.max(Math.abs(gx - st.x), Math.abs(gy - st.y));
                    if (chDom >= 1 && chDom <= nieR && E.canStandAt(gx, gy)) leapTarget = true;
                }
                tile.className = 'tile';
                if (!walkable) tile.classList.add('blocked');
                if (adjacent) tile.classList.add('adjacent');
                if (leapTarget) tile.classList.add('leap-target');
                if (gx === st.x && gy === st.y) tile.classList.add('player');
                tile.style.left = (gx * ctx.CELL_PX + gap) + 'px';
                tile.style.top = (gy * ctx.CELL_PX + gap) + 'px';
                if (nieBuMode) {
                    if (leapTarget) {
                        tile.onclick = (function (tx, ty) {
                            return function () {
                                if (isDialogueBlockingWorldInput()) return;
                                if (ctx.actions && typeof ctx.actions.tryFootworkNieBuJump === 'function') {
                                    ctx.actions.tryFootworkNieBuJump(tx, ty);
                                }
                            };
                        })(gx, gy);
                    }
                } else if (adjacent) {
                    tile.onclick = (function (tx, ty) {
                        return function () {
                            if (isDialogueBlockingWorldInput()) return;
                            var ddx = tx - st.x;
                            var ddy = ty - st.y;
                            if (ctx.actions && typeof ctx.actions.tryIntentMove === 'function') {
                                ctx.actions.tryIntentMove(tx, ty, ddx, ddy, 'click');
                            } else if (ctx.actions && typeof ctx.actions.tryMoveTo === 'function') {
                                ctx.actions.tryMoveTo(tx, ty, ddx, ddy);
                            }
                        };
                    })(gx, gy);
                }
                grid.appendChild(tile);
            }
        }
    }

    function showItemTooltip(html, anchorEl) {
        if (!tooltipEl) tooltipEl = document.getElementById('item-tooltip');
        if (!tooltipEl || !html) return;
        tooltipEl.innerHTML = html;
        tooltipEl.style.left = '-9999px';
        tooltipEl.style.top = '0';
        tooltipEl.classList.add('show');
        if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
        requestAnimationFrame(function () {
            var rect = anchorEl.getBoundingClientRect();
            var tr = tooltipEl.getBoundingClientRect();
            var tw = tr.width || 220;
            var th = tr.height || 100;
            var pad = 12;
            var left = rect.right + pad;
            var top = rect.top;
            if (left + tw > window.innerWidth - pad) left = rect.left - tw - pad;
            if (left < pad) left = pad;
            if (top + th > window.innerHeight - pad) top = window.innerHeight - th - pad;
            if (top < pad) top = pad;
            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top = top + 'px';
        });
    }

    function hideItemTooltip() {
        if (!tooltipEl) tooltipEl = document.getElementById('item-tooltip');
        if (tooltipEl) tooltipEl.classList.remove('show');
    }

    function formatItemAttributes(tpl, inst) {
        if (window.SceneApp && typeof window.SceneApp.formatItemAttributes === 'function') {
            return window.SceneApp.formatItemAttributes(tpl, inst);
        }
        var ctx = getCtx();
        var IE = ctx ? ctx.IE : null;
        if (!tpl) return '';
        var lines = [];
        if (tpl.weight_kg != null) lines.push('重量：' + tpl.weight_kg + ' kg');
        if (tpl.pocket_slots != null) lines.push('口袋：' + tpl.pocket_slots + ' 格');
        if (tpl.vest_slots != null) lines.push('背心栏：' + tpl.vest_slots + ' 格');
        if (tpl.backpack_slots != null) lines.push('背包：' + tpl.backpack_slots + ' 格');
        if (tpl.backpack_weight_factor != null) lines.push('背包减重：' + (tpl.backpack_weight_factor * 100) + '%');
        if (tpl.damage_reduce_slash_pct != null || tpl.damage_reduce_pierce_pct != null || tpl.damage_reduce_blunt_pct != null) {
            var dr = [];
            if (tpl.damage_reduce_slash_pct != null && tpl.damage_reduce_slash_pct > 0) dr.push('劈砍 ' + (tpl.damage_reduce_slash_pct * 100) + '%');
            if (tpl.damage_reduce_pierce_pct != null && tpl.damage_reduce_pierce_pct > 0) dr.push('戳刺 ' + (tpl.damage_reduce_pierce_pct * 100) + '%');
            if (tpl.damage_reduce_blunt_pct != null && tpl.damage_reduce_blunt_pct > 0) dr.push('钝击 ' + (tpl.damage_reduce_blunt_pct * 100) + '%');
            if (dr.length) lines.push('减伤：' + dr.join('、'));
        }
        if (tpl.skill_coef != null) lines.push('技能系数：' + tpl.skill_coef);
        if (tpl.req_innate_jingu != null) lines.push('先天筋骨要求：' + tpl.req_innate_jingu);
        if (tpl.enchant_slots != null) lines.push('词条槽：' + tpl.enchant_slots);
        var q = (inst && inst.quality_tier != null) ? inst.quality_tier : tpl.quality_tier;
        if (q != null && IE && IE.QUALITY_NAMES) lines.push('品质：' + (IE.QUALITY_NAMES[q] || '—'));
        return lines.length ? lines.join('\n') : '';
    }

    function buildItemTooltipHtml(name, desc, attrs) {
        if (window.SceneApp && typeof window.SceneApp.buildItemTooltipHtml === 'function') {
            return window.SceneApp.buildItemTooltipHtml(name, desc, attrs);
        }
        var html = '<div class="tooltip-name">' + (name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        if (desc) html += '<div class="tooltip-desc">' + (desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
        if (attrs) html += '<div class="tooltip-attrs">' + (attrs || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
        return html;
    }

    function tQuick(key, fallback, vars) {
        try {
            if (window.UIText && typeof window.UIText.t === 'function') return window.UIText.t(key, vars);
        } catch (e0) { /* ignore */ }
        return fallback || key;
    }

    function itemTemplateIsConsumableQuick(tpl) {
        if (!tpl) return false;
        var edibleRaw = tpl.edible;
        var edible = edibleRaw === true || edibleRaw === 1 || edibleRaw === '1' || edibleRaw === 'true';
        if (edible && tpl.edible_buff_id && String(tpl.edible_buff_id).trim()) return true;
        var ue = tpl.use_effect;
        return !!(ue && typeof ue === 'object');
    }

    function ensureQuickBeltHoverMenu() {
        if (quickBeltHoverMenuEl && document.body && document.body.contains(quickBeltHoverMenuEl)) return quickBeltHoverMenuEl;
        var el = document.createElement('div');
        el.className = 'quick-belt-hover-menu';
        el.addEventListener('mouseenter', function () {
            if (quickBeltHoverHideTimer) { clearTimeout(quickBeltHoverHideTimer); quickBeltHoverHideTimer = null; }
        });
        el.addEventListener('mouseleave', function () {
            hideQuickBeltHoverMenuDelayed();
        });
        document.body.appendChild(el);
        quickBeltHoverMenuEl = el;
        if (!quickBeltHoverDocBound) {
            quickBeltHoverDocBound = true;
            document.addEventListener('click', function () { hideQuickBeltHoverMenuNow(); });
        }
        return el;
    }

    function hideQuickBeltHoverMenuNow() {
        if (!quickBeltHoverMenuEl) return;
        quickBeltHoverMenuEl.classList.remove('show');
        quickBeltHoverMenuEl.style.left = '-9999px';
        quickBeltHoverMenuEl.style.top = '0';
    }

    function hideQuickBeltHoverMenuDelayed() {
        if (quickBeltHoverHideTimer) clearTimeout(quickBeltHoverHideTimer);
        quickBeltHoverHideTimer = setTimeout(function () {
            quickBeltHoverHideTimer = null;
            hideQuickBeltHoverMenuNow();
        }, 120);
    }

    function openQuickBeltHoverMenu(slotEl, actions) {
        var menu = ensureQuickBeltHoverMenu();
        if (quickBeltHoverHideTimer) { clearTimeout(quickBeltHoverHideTimer); quickBeltHoverHideTimer = null; }
        menu.innerHTML = '';
        var actList = Array.isArray(actions) ? actions : [];
        for (var i = 0; i < actList.length; i++) {
            var it = actList[i];
            if (!it || typeof it.onClick !== 'function') continue;
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'quick-belt-hover-btn';
            btn.textContent = String(it.label || '');
            btn.addEventListener('click', function (fn) {
                return function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    hideQuickBeltHoverMenuNow();
                    fn();
                };
            }(it.onClick));
            menu.appendChild(btn);
        }
        if (!menu.children.length) return;
        var r = slotEl.getBoundingClientRect();
        menu.style.left = Math.round(r.right + 6) + 'px';
        menu.style.top = Math.round(r.top) + 'px';
        menu.classList.add('show');
    }

    function updateTopTimeHud() {
        var ctx = getCtx();
        if (!ctx || !ctx.isTimeHudVisible || !ctx.isTimeHudVisible()) return;
        var tEl = document.getElementById('hud-time-text');
        var pEl = document.getElementById('hud-time-period');
        if (!tEl && !pEl) return;
        var GT = window.GameTime;
        if (!GT || typeof GT.getState !== 'function') return;
        var st = GT.getState();
        if (tEl) tEl.textContent = st.display || '—';
        if (pEl) pEl.textContent = st.timePeriodLabel || '';
    }

    function hasAdjacentAnnotation(E, st, matcher) {
        if (!E || !st || typeof E.getAnnotationAt !== 'function' || typeof matcher !== 'function') return false;
        var dy;
        for (dy = -1; dy <= 1; dy++) {
            var dx;
            for (dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                var ann = E.getAnnotationAt((st.x | 0) + dx, (st.y | 0) + dy);
                var s = ann != null ? String(ann) : '';
                if (matcher(s)) return true;
            }
        }
        return false;
    }

    function appendQuickBeltSlot(frag, IE, char, it, slotIndex, sourceType, sourceIndex) {
        var slot = document.createElement('div');
        slot.className = 'slot';
        if (slotIndex < 9) {
            var keyEl = document.createElement('span');
            keyEl.className = 'quick-belt-slot-key';
            keyEl.textContent = String(slotIndex + 1);
            slot.appendChild(keyEl);
        }
        var body = document.createElement('span');
        body.className = 'quick-belt-slot-body';
        if (it && it.item_id) {
            var tpl = IE.getItemTemplate(it.item_id);
            var tier = IE.getItemDisplayTier(it.item_id, char);
            body.textContent = tpl ? IE.getDisplayName(tpl, tier, char).slice(0, 2) : it.item_id.slice(0, 2);
            var name = tpl ? IE.getDisplayName(tpl, tier, char) : it.item_id;
            var desc = tpl ? IE.getDisplayDesc(tpl, tier, char) : '';
            var tipHtml = '';
            if (window.SceneApp && typeof window.SceneApp.buildItemTooltipHtmlForTemplate === 'function') {
                tipHtml = window.SceneApp.buildItemTooltipHtmlForTemplate(it.item_id, tpl, it, char);
            } else {
                var attrs = formatItemAttributes(tpl, it);
                tipHtml = buildItemTooltipHtml(name, desc, attrs);
            }
            slot.addEventListener('mouseenter', function (html, el) { return function () { showItemTooltip(html, el); }; }(tipHtml, slot));
            slot.addEventListener('mouseleave', function () { hideItemTooltip(); hideQuickBeltHoverMenuDelayed(); });
            slot.addEventListener('mouseenter', function () {
                var actions = [];
                if (itemTemplateIsConsumableQuick(tpl)) {
                    actions.push({
                        label: tQuick('inv.use', '使用'),
                        onClick: function () {
                            if (window.SceneApp && typeof window.SceneApp.tryUseItemFromContainer === 'function') {
                                window.SceneApp.tryUseItemFromContainer(sourceType, sourceIndex);
                            }
                        }
                    });
                }
                if (tpl && tpl.equip_slot) {
                    actions.push({
                        label: tQuick('inv.equip', '穿上'),
                        onClick: function () {
                            if (window.SceneApp && typeof window.SceneApp.tryEquipItemFromContainer === 'function') {
                                window.SceneApp.tryEquipItemFromContainer(sourceType, sourceIndex);
                            }
                        }
                    });
                }
                actions.push({
                    label: tQuick('inv.drop', '丢弃'),
                    onClick: function () {
                        var ctx = getCtx();
                        if (!ctx || !ctx.E || typeof IE.dropItemToGround !== 'function') return;
                        var pos = ctx.E.getState ? ctx.E.getState() : null;
                        if (!pos || pos.mapId == null || pos.x == null || pos.y == null) return;
                        IE.dropItemToGround(sourceType, sourceIndex, pos.mapId, pos.x, pos.y);
                        if (typeof window.SceneRenderer !== 'undefined' && window.SceneRenderer && typeof window.SceneRenderer.render === 'function') {
                            window.SceneRenderer.render();
                        }
                    }
                });
                openQuickBeltHoverMenu(slot, actions);
            });
        } else {
            body.textContent = '—';
        }
        slot.appendChild(body);
        frag.appendChild(slot);
    }

    function updateQuickBelt() {
        var ctx = getCtx();
        if (!ctx || !ctx.IE) return;
        var IE = ctx.IE;
        var el = document.getElementById('quick-belt');
        if (!el) return;
        hideQuickBeltHoverMenuNow();
        var pocketArr = IE.getPocketArray();
        var vestArr = IE.getVestArray();
        var char = IE.getCharacterForDisplay();
        var keyParts = [];
        for (var pk = 0; pk < pocketArr.length; pk++) {
            var pit = pocketArr[pk];
            if (pit && pit.item_id) {
                var pTier = (typeof IE.getItemDisplayTier === 'function') ? IE.getItemDisplayTier(pit.item_id, char) : '';
                keyParts.push(pit.item_id + ':' + (pit.count || 1) + ':' + (pit.quality_tier || '') + ':' + pTier);
            } else {
                keyParts.push('-');
            }
        }
        keyParts.push('|');
        for (var vk = 0; vk < vestArr.length; vk++) {
            var vit = vestArr[vk];
            if (vit && vit.item_id) {
                var vTier = (typeof IE.getItemDisplayTier === 'function') ? IE.getItemDisplayTier(vit.item_id, char) : '';
                keyParts.push(vit.item_id + ':' + (vit.count || 1) + ':' + (vit.quality_tier || '') + ':' + vTier);
            } else {
                keyParts.push('-');
            }
        }
        var nextKey = keyParts.join(',');
        if (nextKey === quickBeltCacheKey) return;
        quickBeltCacheKey = nextKey;

        el.innerHTML = '';
        var frag = document.createDocumentFragment();
        var slotIndex = 0;
        var pi;
        for (pi = 0; pi < pocketArr.length; pi++) {
            appendQuickBeltSlot(frag, IE, char, pocketArr[pi], slotIndex++, 'pocket', pi);
        }
        if (pocketArr.length && vestArr.length) {
            var sep = document.createElement('div');
            sep.className = 'quick-belt-sep';
            sep.setAttribute('aria-hidden', 'true');
            frag.appendChild(sep);
        }
        var vj;
        for (vj = 0; vj < vestArr.length; vj++) {
            appendQuickBeltSlot(frag, IE, char, vestArr[vj], slotIndex++, 'vest', vj);
        }
        el.appendChild(frag);
        if (window.GameLog && typeof window.GameLog.syncQuickBeltDock === 'function') {
            window.GameLog.syncQuickBeltDock();
        }
    }

    function render() {
        var ctx = getCtx();
        if (!ctx || !ctx.E || !ctx.G || !ctx.IE) return;
        var curFootworkNieBuMode = !!(ctx.footworkNieBuMode);
        /**
         * 蹑步结束帧必须整视野重画动态层：V2 在 dirtyCells 非空时只清列表内格子，否则整 canvas 先 clear 再画。
         * moveDirty 在玩家不动时只有身边 3×3，无法覆盖环上半径 2 的落点格；仅靠 pushDirty 易漏格或遇双次 render 只带 3×3。
         */
        var nieBuModeJustEnded = prevFootworkNieBuMode && !curFootworkNieBuMode;
        var E = ctx.E;
        var G = ctx.G;
        var IE = ctx.IE;
        var CELL_PX = ctx.CELL_PX;
        var CENTER_OFFSET_X = ctx.CENTER_OFFSET_X;
        var CENTER_OFFSET_Y = ctx.CENTER_OFFSET_Y;
        var container = document.getElementById('map-container');
        var viewportWidth = (container && container.clientWidth) ? container.clientWidth : 1042;
        var viewportHeight = (container && container.clientHeight) ? container.clientHeight : 638;
        var runtimeCenterOffsetX = (viewportWidth / 2) - (CELL_PX / 2);
        var runtimeCenterOffsetY = (viewportHeight / 2) - (CELL_PX / 2);

        var grid = document.getElementById('map-grid');
        if (!grid) {
            prevFootworkNieBuMode = curFootworkNieBuMode;
            return;
        }

        var map = E.getMap();
        var st = E.getState();
        var visionProfile = getVisionRevealProfile();
        var facingCfgForVisionMeta = getVisionFacingUiConfig();
        var occlusionUiCfgForMeta = getVisionOcclusionUiConfig();
        if (!map) {
            prevFootworkNieBuMode = curFootworkNieBuMode;
            return;
        }

        if (!tileRenderer && window.TileRendererV2 && typeof window.TileRendererV2.create === 'function') {
            tileRenderer = window.TileRendererV2.create(grid, { cellPx: CELL_PX });
            tileRenderer.setEffectsRenderer(function (fxCtx) {
                if (window.SceneAnimation && typeof window.SceneAnimation.render === 'function') {
                    window.SceneAnimation.render(fxCtx);
                }
                renderDayNightVisionOverlay(fxCtx);
                renderVisionOcclusionOverlay(fxCtx);
                renderVisionDistanceShadeOverlay(fxCtx);
                renderFacingVisionOverlay(fxCtx);
                renderVisionDebugOverlay(fxCtx);
            });
            if (typeof tileRenderer.startAnimationLoop === 'function') tileRenderer.startAnimationLoop();
        }
        var hasV2 = !!tileRenderer;

        var entityAtPlayer = E.getEntityAt(st.x, st.y);
        var canGather = entityAtPlayer && G.getGatheringPointConfig(entityAtPlayer) && G.canGather(entityAtPlayer);
        var pointName = entityAtPlayer && G.getGatheringPointConfig(entityAtPlayer) ? G.getGatheringPointConfig(entityAtPlayer).display_name : '';

        latestFrame = {
            map: map,
            st: st,
            getStaticMetaAt: function (gx, gy) {
                var walkable = E.isWalkable(gx, gy);
                var portal = E.getPortalAt(gx, gy);
                var entityId = E.getEntityAt(gx, gy);
                var cookingStation = typeof E.isCookingStationCell === 'function' && E.isCookingStationCell(gx, gy);
                var pharmacyStation = typeof E.isPharmacyStationCell === 'function' && E.isPharmacyStationCell(gx, gy);
                var compostStation = typeof E.isCompostStationCell === 'function' && E.isCompostStationCell(gx, gy);
                return {
                    walkable: walkable,
                    portal: !!portal,
                    gathering: (entityId === 'gathering_bush' || entityId === 'gathering_grass'),
                    cookingStation: cookingStation,
                    pharmacyStation: pharmacyStation,
                    compostStation: compostStation,
                                        adjacent: false,
                    groundCount: 0,
                    npc: false,
                    enemy: false,
                    player: false
                };
            },
            getDynamicMetaAt: function (gx, gy) {
                var ctxDyn = getCtx();
                var adjacent = E.isAdjacent(gx, gy);
                var dist = chebyshevDistance(gx, gy, st.x, st.y);
                var walkable = E.isWalkable(gx, gy);
                var portal = E.getPortalAt(gx, gy);
                var entityId = E.getEntityAt(gx, gy);
                var npcId = (typeof E.getInteractNpcIdAt === 'function')
                    ? E.getInteractNpcIdAt(gx, gy)
                    : ((typeof E.getNpcAt === 'function') ? E.getNpcAt(gx, gy) : null);
                var enemyId = (typeof E.getEnemyAt === 'function') ? E.getEnemyAt(gx, gy) : null;
                if (npcId && window.GameTime && window.NPCSystem && typeof window.NPCSystem.isNpcPresentNow === 'function') {
                    if (!window.NPCSystem.isNpcPresentNow(npcId)) npcId = null;
                }
                var groundAt = (IE && IE.getGroundItemsAt) ? IE.getGroundItemsAt(st.mapId, gx, gy) : [];
                var rawGroundCount = Array.isArray(groundAt) ? groundAt.length : 0;
                var facingMul = getFacingVisionMultiplier(st, gx, gy);
                var canVisual = dist <= (visionProfile.visualRadius * facingMul);
                var canIdentify = dist <= (visionProfile.identifyRadius * facingMul);
                var canDetail = dist <= (visionProfile.detailRadius * facingMul);
                var adjacentForcedDetail = dist <= visionProfile.adjacentDetailRadius;
                if (adjacentForcedDetail) {
                    canVisual = true;
                    canIdentify = true;
                    canDetail = true;
                }
                var leapTarget = false;
                if (ctxDyn && ctxDyn.footworkNieBuMode && typeof E.canStandAt === 'function' && !(gx === st.x && gy === st.y)) {
                    var rDyn = ctxDyn.nieBuLeapRadius != null ? (ctxDyn.nieBuLeapRadius | 0) : 2;
                    var chDyn = Math.max(Math.abs(gx - st.x), Math.abs(gy - st.y));
                    if (chDyn >= 1 && chDyn <= rDyn && E.canStandAt(gx, gy)) leapTarget = true;
                }
                var hasGatheringPoint = (entityId === 'gathering_bush' || entityId === 'gathering_grass');
                var showGathering = hasGatheringPoint && canIdentify;
                var cookingStationCell = typeof E.isCookingStationCell === 'function' && E.isCookingStationCell(gx, gy);
                var showCookingStation = !!(cookingStationCell && canVisual && canIdentify);
                var pharmacyStationCell = typeof E.isPharmacyStationCell === 'function' && E.isPharmacyStationCell(gx, gy);
                var showPharmacyStation = !!(pharmacyStationCell && canVisual && canIdentify);
                var compostStationCell = typeof E.isCompostStationCell === 'function' && E.isCompostStationCell(gx, gy);
                var showCompostStation = !!(compostStationCell && canVisual && canIdentify);
                var unknownPresence = false;
                if (!canVisual) {
                    npcId = null;
                    enemyId = null;
                    rawGroundCount = 0;
                    showGathering = false;
                    showCookingStation = false;
                    showPharmacyStation = false;
                    showCompostStation = false;
                } else if (!canIdentify) {
                    unknownPresence = !!(npcId || enemyId);
                    npcId = null;
                    enemyId = null;
                    showCookingStation = false;
                    showPharmacyStation = false;
                    showCompostStation = false;
                }
                var unknownGround = false;
                if (rawGroundCount > 0 && !canIdentify) {
                    unknownGround = true;
                    rawGroundCount = 0;
                }
                var shownEnemyId = canDetail ? (enemyId || null) : null;
                var gatheringBlurred = !!(hasGatheringPoint && canVisual && !canIdentify);
                if (
                    occlusionUiCfgForMeta.enabled &&
                    occlusionUiCfgForMeta.stripDynamicOnRearAdjacent &&
                    facingCfgForVisionMeta.enabled &&
                    isRearAdjacentTriple(st, gx, gy)
                ) {
                    npcId = null;
                    enemyId = null;
                    rawGroundCount = 0;
                    unknownPresence = false;
                    unknownGround = false;
                    showGathering = false;
                    shownEnemyId = null;
                    gatheringBlurred = false;
                    showCookingStation = false;
                    showPharmacyStation = false;
                    showCompostStation = false;
                }
                var npcLabel = '';
                if (npcId && window.NPCSystem && typeof window.NPCSystem.getNpcMapLabel === 'function') {
                    npcLabel = window.NPCSystem.getNpcMapLabel(npcId) || '';
                }
                return {
                    x: gx,
                    y: gy,
                    player: (gx === st.x && gy === st.y),
                    adjacent: adjacent,
                    leapTarget: leapTarget,
                    walkable: walkable,
                    portal: !!portal,
                    gathering: showGathering,
                    gatheringBlurred: gatheringBlurred,
                    cookingStation: showCookingStation,
                    pharmacyStation: showPharmacyStation,
                    compostStation: showCompostStation,
                    npc: !!npcId,
                    npcLabel: npcLabel,
                    enemy: !!enemyId,
                    enemyId: shownEnemyId,
                    unknownPresence: unknownPresence,
                    groundUnknown: unknownGround,
                    groundCount: rawGroundCount,
                    playerFacingDir: resolvePlayerFacingDir()
                };
            },
            onTileClick: function (gx, gy) {
                var ctxTile = getCtx();
                if (ctxTile && ctxTile.footworkNieBuMode && ctxTile.actions && typeof ctxTile.actions.tryFootworkNieBuJump === 'function') {
                    ctxTile.actions.tryFootworkNieBuJump(gx, gy);
                    return;
                }
                var ddx = gx - st.x;
                var ddy = gy - st.y;
                if (Math.abs(ddx) > 1 || Math.abs(ddy) > 1 || (!ddx && !ddy)) return;
                var npcId = (typeof E.getInteractNpcIdAt === 'function')
                    ? E.getInteractNpcIdAt(gx, gy)
                    : ((typeof E.getNpcAt === 'function') ? E.getNpcAt(gx, gy) : null);
                if (npcId && window.GameTime && window.NPCSystem && typeof window.NPCSystem.isNpcPresentNow === 'function') {
                    if (!window.NPCSystem.isNpcPresentNow(npcId)) npcId = null;
                }
                if (npcId && ctx.actions && typeof ctx.actions.interactNpc === 'function') {
                    ctx.actions.interactNpc(npcId);
                    return;
                }
                if (ctx.actions && typeof ctx.actions.tryIntentMove === 'function') {
                    ctx.actions.tryIntentMove(gx, gy, ddx, ddy, 'click');
                } else if (ctx.actions && typeof ctx.actions.tryMoveTo === 'function') {
                    ctx.actions.tryMoveTo(gx, gy, ddx, ddy);
                }
            }
        };

        var staticDataKey = '';
        try {
            var parts = [];
            var blocks = Array.isArray(map.blocks) ? map.blocks.length : 0;
            var portals = Array.isArray(map.portals) ? map.portals.length : 0;
            var entities = Array.isArray(map.entities) ? map.entities.length : 0;
            var npcs = Array.isArray(map.npcs) ? map.npcs.length : 0;
            var enemies = Array.isArray(map.enemies) ? map.enemies.length : 0;
            parts.push('b=' + blocks, 'p=' + portals, 'e=' + entities, 'n=' + npcs, 'm=' + enemies);
            if (Array.isArray(map.blocks)) {
                for (var bi = 0; bi < map.blocks.length; bi++) {
                    parts.push('B' + map.blocks[bi].x + ',' + map.blocks[bi].y);
                }
            }
            if (Array.isArray(map.portals)) {
                for (var pi = 0; pi < map.portals.length; pi++) {
                    parts.push('P' + map.portals[pi].x + ',' + map.portals[pi].y + '>' + map.portals[pi].target_map_id);
                }
            }
            if (Array.isArray(map.entities)) {
                for (var ei = 0; ei < map.entities.length; ei++) {
                    parts.push('E' + map.entities[ei].x + ',' + map.entities[ei].y + ':' + (map.entities[ei].entity_id || ''));
                }
            }
            if (map.annotations && typeof map.annotations === 'object') {
                var annKeys = Object.keys(map.annotations).sort();
                for (var ai = 0; ai < annKeys.length; ai++) {
                    var ak = annKeys[ai];
                    parts.push('@' + ak + '=' + String(map.annotations[ak]));
                }
            }
            if (map.cooking_station_interact_npc_by_cell && typeof map.cooking_station_interact_npc_by_cell === 'object') {
                var csk = Object.keys(map.cooking_station_interact_npc_by_cell).sort();
                for (var ci = 0; ci < csk.length; ci++) {
                    var ck = csk[ci];
                    parts.push('C' + ck + '=' + String(map.cooking_station_interact_npc_by_cell[ck]));
                }
            }
            if (map.cooking_station_interact_npc_id != null && String(map.cooking_station_interact_npc_id).trim()) {
                parts.push('CSI=' + String(map.cooking_station_interact_npc_id).trim());
            }
            if (map.pharmacy_station_interact_npc_by_cell && typeof map.pharmacy_station_interact_npc_by_cell === 'object') {
                var psk = Object.keys(map.pharmacy_station_interact_npc_by_cell).sort();
                for (var pi = 0; pi < psk.length; pi++) {
                    var pk = psk[pi];
                    parts.push('P' + pk + '=' + String(map.pharmacy_station_interact_npc_by_cell[pk]));
                }
            }
            if (map.pharmacy_station_interact_npc_id != null && String(map.pharmacy_station_interact_npc_id).trim()) {
                parts.push('PSI=' + String(map.pharmacy_station_interact_npc_id).trim());
            }
            if (map.compost_station_interact_npc_by_cell && typeof map.compost_station_interact_npc_by_cell === 'object') {
                var xsk = Object.keys(map.compost_station_interact_npc_by_cell).sort();
                for (var xi = 0; xi < xsk.length; xi++) {
                    var xk = xsk[xi];
                    parts.push('X' + xk + '=' + String(map.compost_station_interact_npc_by_cell[xk]));
                }
            }
            if (map.compost_station_interact_npc_id != null && String(map.compost_station_interact_npc_id).trim()) {
                parts.push('XSI=' + String(map.compost_station_interact_npc_id).trim());
            }
            staticDataKey = parts.join('|');
        } catch (e) {
            staticDataKey = String(map.map_id || '') + ':' + String(map.width || 0) + 'x' + String(map.height || 0);
        }

        if (tileRenderer) {
            if (staticDataKey !== lastStaticDataKey && typeof tileRenderer.invalidateStatic === 'function') {
                tileRenderer.invalidateStatic();
                lastStaticDataKey = staticDataKey;
            }
            var curPos = { mapId: st.mapId, x: st.x, y: st.y };
            var moveDirty = buildDirtyCells(prevRenderState, curPos, 1);
            var actionDirty = (ctx && Array.isArray(ctx.dirtyCells)) ? ctx.dirtyCells.slice() : [];
            if (ctx && Array.isArray(ctx.dirtyCells)) ctx.dirtyCells.length = 0;
            var profile = (ctx && ctx.renderProfile) ? String(ctx.renderProfile) : 'normal';
            var defaultScanInterval = (profile === 'combat') ? 1 : 2;
            var diffScanInterval = (ctx && ctx.dynamicDiffScanInterval != null) ? Math.max(1, ctx.dynamicDiffScanInterval | 0) : defaultScanInterval;
            var diffScanRadius = (ctx && ctx.dynamicDiffScanRadius != null) ? Math.max(4, ctx.dynamicDiffScanRadius | 0) : 16;
            var diffDirty = [];
            dynamicDiffTick++;
            if ((dynamicDiffTick % diffScanInterval) === 0 || !prevDynamicCellMarks || !Object.keys(prevDynamicCellMarks).length) {
                var scanRange = buildScanRange(st, map, diffScanRadius);
                var curMarks = collectDynamicCellMarks(map, st.mapId, E, IE, scanRange);
                diffDirty = buildDirtyFromDynamicDiff(prevDynamicCellMarks, curMarks);
                prevDynamicCellMarks = curMarks;
            }
            var mergedDirty = mergeDirtyCells(mergeDirtyCells(moveDirty, actionDirty), diffDirty);
            var dirtyForV2 = nieBuModeJustEnded ? null : (mergedDirty.length ? mergedDirty : null);
            tileRenderer.render({
                map: map,
                st: st,
                staticMetaAt: latestFrame.getStaticMetaAt,
                dynamicMetaAt: latestFrame.getDynamicMetaAt,
                staticDataKey: staticDataKey,
                dirtyCells: dirtyForV2,
                viewport: {
                    width: viewportWidth,
                    height: viewportHeight
                }
            });
            prevRenderState = curPos;
        } else {
            renderDomFallback(grid, map, st, E, ctx);
        }

        if (hasV2 && !interactionBound) {
            interactionBound = true;
            grid.addEventListener('click', function (ev) {
                if (isDialogueBlockingWorldInput()) return;
                if (!tileRenderer || !latestFrame) return;
                var hit = tileRenderer.hitTest(ev.clientX, ev.clientY);
                if (!hit) return;
                latestFrame.onTileClick(hit.x, hit.y);
            });
            grid.addEventListener('mousemove', function (ev) {
                hoverPendingClientX = ev.clientX;
                hoverPendingClientY = ev.clientY;
                if (hoverRafId) return;
                hoverRafId = requestAnimationFrame(function () {
                    hoverRafId = 0;
                    if (!tileRenderer) return;
                    if (isDialogueBlockingWorldInput()) {
                        grid.style.cursor = 'default';
                        grid.title = '';
                        return;
                    }
                    tileRenderer.setHoverCursor(hoverPendingClientX, hoverPendingClientY);
                    if (!latestFrame) return;
                    var hit = tileRenderer.hitTest(hoverPendingClientX, hoverPendingClientY);
                    if (!hit) {
                        grid.title = '';
                        return;
                    }
                    var meta = latestFrame.getDynamicMetaAt(hit.x, hit.y);
                    var tips = [];
                    if (!meta.walkable) tips.push('不可走');
                    if (meta.portal) tips.push('传送点');
                    if (meta.gathering) tips.push('采集点');
                    else if (meta.gatheringBlurred) tips.push('附近似乎有可采资源');
                    if (meta.unknownPresence) tips.push('有未知动静');
                    if (meta.npc) {
                        if (meta.npcLabel && String(meta.npcLabel).trim()) tips.push(String(meta.npcLabel).trim());
                        else tips.push('可对话');
                    }
                    if (meta.enemy) {
                        if (meta.enemyId === 'enemy.training_dummy_wooden') {
                            try {
                                if (window.UIText && typeof window.UIText.t === 'function') {
                                    tips.push(window.UIText.t('map.tooltip.enemy.training_dummy'));
                                } else {
                                    tips.push('训练木桩');
                                }
                            } catch (eTip) {
                                tips.push('训练木桩');
                            }
                        } else {
                            tips.push('敌人');
                        }
                    }
                    if (meta.compostStation) tips.push('制肥桶');
                    if (meta.groundCount > 0) tips.push('地面有 ' + meta.groundCount + ' 件物品');
                    else if (meta.groundUnknown) tips.push('地面似乎有东西');
                    if (meta.leapTarget) tips.push('蹑步落点');
                    grid.title = tips.join(' · ');
                });
            });
            grid.addEventListener('mouseleave', function () {
                grid.style.cursor = 'default';
                grid.title = '';
            });
        }

        var centerOffsetX = Number.isFinite(runtimeCenterOffsetX) ? runtimeCenterOffsetX : CENTER_OFFSET_X;
        var centerOffsetY = Number.isFinite(runtimeCenterOffsetY) ? runtimeCenterOffsetY : CENTER_OFFSET_Y;
        var tx = centerOffsetX - st.x * CELL_PX;
        var ty = centerOffsetY - st.y * CELL_PX;
        if (tileRenderer) tileRenderer.setCamera(tx, ty);
        else grid.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';

        var isIdling = ctx && ctx.isGatheringIdling ? !!ctx.isGatheringIdling() : false;
        var groundAtPlayer = (IE && IE.getGroundItemsAt) ? IE.getGroundItemsAt(st.mapId, st.x, st.y) : [];
        var hasGroundItems = groundAtPlayer.length > 0;
        var bubble = document.getElementById('player-action-bubble');
        var bubbleGather = document.getElementById('player-action-gather');
        var bubbleStop = document.getElementById('player-action-gather-stop');
        var bubbleTakeWater = document.getElementById('player-action-take-water');
        var bubbleAddFuel = document.getElementById('player-action-add-fuel');
        var bubblePourWater = document.getElementById('player-action-pour-water');
        var bubbleCook = document.getElementById('player-action-cook');
        var bubblePharmacy = document.getElementById('player-action-pharmacy');
        var bubbleGroundItems = document.getElementById('player-action-ground-items');
        var bubbleDiqiHuti = document.getElementById('player-action-diqi-huti');
        var canTakeWater = !!(ctx && ctx.actions && typeof ctx.actions.canTakeWaterAtCurrentTile === 'function' && ctx.actions.canTakeWaterAtCurrentTile());
        var adjEnemyCombat = ctx && typeof ctx.hasAdjacentEnemyForCombat === 'function' ? !!ctx.hasAdjacentEnemyForCombat() : false;
        var breathSkillId = 'combat_basic_breath';
        var diqiHutiOk = false;
        if (IE && E && window.CombatSkills && adjEnemyCombat) {
            var breathLv = typeof IE.getSkillLevel === 'function' ? IE.getSkillLevel(breathSkillId) : 0;
            var hubsB = IE.getCombatState && IE.getCombatState().hubs ? IE.getCombatState().hubs : null;
            if (breathLv >= 50 && hubsB && hubsB.breath === breathSkillId) {
                var shRem = (window.Survival && typeof window.Survival.getDiqiShieldRemaining === 'function') ? window.Survival.getDiqiShieldRemaining() : 0;
                if (shRem <= 0) diqiHutiOk = true;
            }
        }
        var tNie = function (key, vars) {
            try {
                if (window.UIText && typeof window.UIText.t === 'function') return window.UIText.t(key, vars);
            } catch (e1) { /* ignore */ }
            return key;
        };
        if (bubbleDiqiHuti) {
            bubbleDiqiHuti.style.display = diqiHutiOk ? 'inline-block' : 'none';
            bubbleDiqiHuti.textContent = tNie('player.action.diqi_huti');
        }
        // 烹饪台：与 NPC 一致，不靠邻格冒泡；点击灶台格打开面板后在面板内选倒水/添柴/制作
        var showBubble = canGather || isIdling || canTakeWater || hasGroundItems || diqiHutiOk;
        if (bubble) bubble.classList.toggle('visible', !!showBubble);
        // 采集/停止：仅与「站在可采集格」或「正在挂机采集」相关；勿因脚下物品/护体等其它理由把采集钮常驻显示
        if (bubbleGather && bubbleStop) {
            if (showBubble) {
                bubbleGather.style.display = (!isIdling && canGather) ? 'inline-block' : 'none';
                bubbleGather.disabled = !canGather;
                bubbleGather.textContent = pointName ? '采集 · ' + pointName + '（挂机）' : '采集（挂机）';
                bubbleStop.style.display = isIdling ? 'inline-block' : 'none';
            } else {
                bubbleGather.style.display = 'none';
                bubbleStop.style.display = 'none';
            }
        }
        if (bubbleGroundItems) {
            bubbleGroundItems.style.display = hasGroundItems ? 'inline-block' : 'none';
            bubbleGroundItems.textContent = hasGroundItems ? '📦 脚下 ' + groundAtPlayer.length + ' 件' : '📦 脚下物品';
        }
        if (bubbleTakeWater) {
            bubbleTakeWater.style.display = canTakeWater ? 'inline-block' : 'none';
            bubbleTakeWater.textContent = tNie('player.action.take_water');
        }
        if (bubbleAddFuel) {
            bubbleAddFuel.style.display = 'none';
            bubbleAddFuel.textContent = tNie('player.action.add_fuel');
        }
        if (bubblePourWater) {
            bubblePourWater.style.display = 'none';
            bubblePourWater.textContent = tNie('player.action.pour_water');
        }
        if (bubbleCook) {
            bubbleCook.style.display = 'none';
            bubbleCook.textContent = tNie('player.action.cook');
        }
        if (bubblePharmacy) {
            bubblePharmacy.style.display = 'none';
            bubblePharmacy.textContent = tNie('player.action.pharmacy');
        }

        var abGather = document.getElementById('action-bar-gather');
        var abStop = document.getElementById('action-bar-gather-stop');
        var abTakeWater = document.getElementById('action-bar-take-water');
        var abAddFuel = document.getElementById('action-bar-add-fuel');
        var abPourWater = document.getElementById('action-bar-pour-water');
        var abCook = document.getElementById('action-bar-cook');
        var abGround = document.getElementById('action-bar-ground');
        var abDiqi = document.getElementById('action-bar-diqi-huti');
        var abWarehouse = document.getElementById('action-bar-warehouse');
        var onWarehouseTile = hasAdjacentAnnotation(E, st, function (sWh) { return sWh === '仓库'; });
        if (abGather && bubbleGather) {
            abGather.style.display = bubbleGather.style.display;
            abGather.disabled = !!bubbleGather.disabled;
            abGather.textContent = bubbleGather.textContent || '';
        }
        if (abStop && bubbleStop) {
            abStop.style.display = bubbleStop.style.display;
            abStop.textContent = bubbleStop.textContent || '';
        }
        if (abTakeWater && bubbleTakeWater) {
            abTakeWater.style.display = bubbleTakeWater.style.display;
            abTakeWater.textContent = bubbleTakeWater.textContent || '';
        }
        if (abAddFuel && bubbleAddFuel) {
            abAddFuel.style.display = bubbleAddFuel.style.display;
            abAddFuel.textContent = bubbleAddFuel.textContent || '';
        }
        if (abPourWater && bubblePourWater) {
            abPourWater.style.display = bubblePourWater.style.display;
            abPourWater.textContent = bubblePourWater.textContent || '';
        }
        if (abCook && bubbleCook) {
            abCook.style.display = bubbleCook.style.display;
            abCook.textContent = bubbleCook.textContent || '';
        }
        if (abGround && bubbleGroundItems) {
            abGround.style.display = bubbleGroundItems.style.display;
            abGround.textContent = bubbleGroundItems.textContent || '';
        }
        if (abDiqi && bubbleDiqiHuti) {
            abDiqi.style.display = bubbleDiqiHuti.style.display;
            abDiqi.textContent = bubbleDiqiHuti.textContent || '';
        }
        if (abWarehouse) {
            abWarehouse.style.display = onWarehouseTile ? 'inline-block' : 'none';
            if (onWarehouseTile) {
                try {
                    if (window.UIText && typeof window.UIText.t === 'function') abWarehouse.textContent = window.UIText.t('action.bar.warehouse');
                } catch (eWh) { /* ignore */ }
            }
        }

        var anyCtxAb = (abGather && abGather.style.display !== 'none')
            || (abStop && abStop.style.display !== 'none')
            || (abTakeWater && abTakeWater.style.display !== 'none')
            || (abAddFuel && abAddFuel.style.display !== 'none')
            || (abPourWater && abPourWater.style.display !== 'none')
            || (abCook && abCook.style.display !== 'none')
            || (abGround && abGround.style.display !== 'none')
            || (abDiqi && abDiqi.style.display !== 'none')
            || (abWarehouse && abWarehouse.style.display !== 'none');
        var sepAb = document.getElementById('action-bar-sep');
        if (sepAb) sepAb.style.display = anyCtxAb ? 'block' : 'none';

        var slotsAb = (ctx && typeof ctx.getActionBarSlots === 'function') ? ctx.getActionBarSlots() : [null, null, null, null];
        var pxi;
        for (pxi = 0; pxi < 4; pxi++) {
            var pBtn = document.getElementById('action-bar-pin-' + pxi);
            if (!pBtn) continue;
            var tokp = slotsAb[pxi];
            if (!tokp) {
                pBtn.textContent = '·';
                pBtn.classList.add('empty');
                pBtn.title = tNie('action.bar.pin.empty_title') + ' · ' + tNie('action.bar.pin.right_clear');
                continue;
            }
            pBtn.classList.remove('empty');
            var partsp = String(tokp).split('|');
            var lblPin = '—';
            if (partsp.length >= 3 && partsp[0] === 'hub') {
                var skPin = partsp[1];
                var acPin = partsp[2];
                var CSab = (typeof window !== 'undefined' && window.CombatSkills) ? window.CombatSkills : null;
                if (CSab && typeof CSab.getSkill === 'function') {
                    var tplab = CSab.getSkill(skPin);
                    if (tplab && tplab.hub_actions) {
                        var hx;
                        for (hx = 0; hx < tplab.hub_actions.length; hx++) {
                            if (tplab.hub_actions[hx].id === acPin) {
                                lblPin = tplab.hub_actions[hx].name || acPin;
                                break;
                            }
                        }
                    }
                }
                if (lblPin === '—') lblPin = acPin;
            }
            pBtn.textContent = lblPin;
            pBtn.title = lblPin + ' · ' + tNie('action.bar.pin.right_clear');
        }

        updateTopTimeHud();
        if (ctx && typeof ctx.updateStatusPanel === 'function') ctx.updateStatusPanel(G.getCharacterState());
        updateQuickBelt();
        prevFootworkNieBuMode = curFootworkNieBuMode;
    }

    window.SceneRenderer = {
        render: render,
        setVisionDebugEnabled: function (enabled) {
            visionDebugEnabled = !!enabled;
            render();
            return visionDebugEnabled;
        },
        toggleVisionDebug: function () {
            visionDebugEnabled = !visionDebugEnabled;
            render();
            return visionDebugEnabled;
        },
        isVisionDebugEnabled: function () {
            return !!visionDebugEnabled;
        },
        updateQuickBelt: updateQuickBelt,
        showItemTooltip: showItemTooltip,
        hideItemTooltip: hideItemTooltip,
        buildItemTooltipHtml: buildItemTooltipHtml,
        formatItemAttributes: formatItemAttributes,
        renderEntityDirectionIndicator: renderEntityDirectionIndicator
    };
    window.VisionDebug = {
        on: function () { return window.SceneRenderer.setVisionDebugEnabled(true); },
        off: function () { return window.SceneRenderer.setVisionDebugEnabled(false); },
        toggle: function () { return window.SceneRenderer.toggleVisionDebug(); },
        status: function () { return window.SceneRenderer.isVisionDebugEnabled(); }
    };
    try {
        visionDebugEnabled = !!getVisionRevealUiConfig().debugEnabledDefault;
    } catch (e) {
        visionDebugEnabled = false;
    }
})();

