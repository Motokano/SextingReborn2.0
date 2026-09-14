// THROWAWAY: vision helpers copied verbatim from scene-renderer.js for this camera experiment.
// Uses the live survival-config.json; does not load game saves.
window.PrototypeVision=(function(){let config={},direction=0,minute=0;const window={Survival:{getConfigValue:(k,f)=>config[k]??f},GameTime:{getState:()=>({minuteOfDay:minute})}};function resolvePlayerFacingDir(){return direction;}
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
    function facingAngleDeg(st, gx, gy) {
        var tx = (gx | 0) - (st.x | 0);
        var ty = (gy | 0) - (st.y | 0);
        if (!tx && !ty) return 0;
        var fv = facingDirToVector(resolvePlayerFacingDir());
        var lenA = Math.sqrt(fv.x * fv.x + fv.y * fv.y) || 1;
        var lenB = Math.sqrt(tx * tx + ty * ty) || 1;
        var dot = fv.x * tx + fv.y * ty;
        var c = dot / (lenA * lenB);
        if (c > 1) c = 1;
        if (c < -1) c = -1;
        return Math.acos(c) * 180 / Math.PI;
    }
    function getFacingVisionMultiplier(st, gx, gy) {
        var cfg = getVisionFacingUiConfig();
        if (!cfg.enabled) return 1;
        var ang = facingAngleDeg(st, gx, gy);
        if (ang <= cfg.frontHalfAngleDeg) return cfg.frontMul;
        if (ang <= cfg.sideHalfAngleDeg) return cfg.sideMul;
        return cfg.backMul;
    }
    function isInFieldOfView(st, gx, gy) {
        var cfg = getVisionFacingUiConfig();
        if (!cfg.enabled) return false;
        return facingAngleDeg(st, gx, gy) <= cfg.sideHalfAngleDeg;
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
return {load:c=>{config=c},set:(d,m)=>{direction=d;minute=m},profile:getVisionRevealProfile,cell:(st,x,y)=>{const profile=getVisionRevealProfile(),occ=getVisionOcclusionUiConfig(),dist=chebyshevDistance(st.x,st.y,x,y),r=profile.visualRadius*getFacingVisionMultiplier(st,x,y),rear=occ.stripDynamicOnRearAdjacent&&isRearAdjacentTriple(st,x,y),visible=dist<=r||dist<=profile.adjacentDetailRadius,identify=dist<=(isInFieldOfView(st,x,y)?profile.visualRadius:profile.identifyRadius)*getFacingVisionMultiplier(st,x,y)||dist<=profile.adjacentDetailRadius;const shade=occ.distanceShadeEnabled&&dist<=r?occ.distanceShadeMaxAlpha*Math.pow(Math.max(0,(dist/r-occ.distanceShadeStartRatio)/(1-occ.distanceShadeStartRatio)),occ.distanceShadePower):0;return {visible,identify,rear,alpha:!visible&&!rear&&occ.enabled?occ.occlusionAlpha:shade,rgb:!visible&&!rear?occ.occlusionRgb:occ.distanceShadeRgb};}};})();