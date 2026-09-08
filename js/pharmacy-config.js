/**
 * PharmacyConfig — 制药系统全局配置（data/pharmacy-system-config.csv 解析）
 *
 * 口径来源：docs/design/47-pharmacy-system.md（§2.2 失败物 / §3.2 四途径 / §4 成瘾 / §9 配药）
 * 与 11-skills §8.2.1（生活技能熟练度）。
 *
 * 分工：本模块只做「CSV 文本 → 归一化配置对象」，不含运行时状态、不碰 SceneCtx。
 * 装载方：scene-app loadConfig → PharmacyConfig.parseCsv(text) → PharmacyStation.setConfig({ systemConfig }）。
 * 数值占位（47 内标 ❓）在此表集中维护，内容卡（k225/k240/k242/k231）调数值时只改 CSV。
 */
(function (global) {
    'use strict';

    /** 缺省值：与烹饪同口径的熟练度曲线 + 制药默认失败物（药渣）。 */
    var DEFAULTS = {
        pharmacy_global_failure_item_id: 'item.scrap.herb_dregs',
        pharmacy_skill_max_level: 100,
        pharmacy_max_proficiency_uses: 5000000,
        pharmacy_success_bonus_per_level: 0.005,
        pharmacy_proficiency_usage_key: 'pharmacy_success',
        pharmacy_use_routes: 'drink|topical|inhale|inject',
        pharmacy_addiction_gain_topical: 0,
        pharmacy_addiction_gain_drink: 4,
        pharmacy_addiction_gain_inhale: 10,
        pharmacy_addiction_gain_inject: 15,
        pharmacy_addiction_decay_per_tick: 0.05,
        pharmacy_addiction_immunity_gain_reduction: 0.01,
        pharmacy_addiction_immunity_decay_bonus: 0.02,
        pharmacy_addiction_immunity_penalty_reduction: 0.01,
        pharmacy_addiction_stage_thresholds: '25|50|75',
        pharmacy_addiction_stage_penalties: '0.10|0.20|0.35',
        pharmacy_potency_thresholds: '33|66',
        pharmacy_toxicity_band_thresholds: '0|25|55',
        pharmacy_toxicity_decay_per_tick: 1,
        pharmacy_toxicity_lethal_ticks: 40,
        pharmacy_concentration_capacity: 100,
        pharmacy_offset_rate_cap: 0.9,
        pharmacy_synergy_bonus_per_unit: 0.2,
        pharmacy_injectable_template_id: 'potion_compound_injection',
        pharmacy_disposable_kit_item_ids: 'tool_iv_set_pharmacy',
        pharmacy_sterilizer_item_ids: 'food_wine',
        pharmacy_dirty_injection_toxicity: 8
    };

    var USE_ROUTE_IDS = ['drink', 'topical', 'inhale', 'inject'];

    function asText(v) {
        return v == null ? '' : String(v).trim();
    }

    function toNumber(v, fallback) {
        var n = Number(asText(v));
        return isFinite(n) ? n : fallback;
    }

    function toInt(v, fallback) {
        var n = parseInt(asText(v), 10);
        return isFinite(n) ? n : fallback;
    }

    /** 竖线分隔列表 → 字符串数组（去空、去重、保序）。 */
    function toList(v, fallback) {
        var raw = asText(v);
        if (!raw) raw = asText(fallback);
        if (!raw) return [];
        var parts = raw.split('|');
        var out = [];
        var seen = {};
        var i;
        for (i = 0; i < parts.length; i++) {
            var s = asText(parts[i]);
            if (!s || seen[s]) continue;
            seen[s] = true;
            out.push(s);
        }
        return out;
    }

    /** 竖线分隔列表 → 数字数组（非法项丢弃）。 */
    function toNumberList(v, fallback) {
        var list = toList(v, fallback);
        var out = [];
        var i;
        for (i = 0; i < list.length; i++) {
            var n = Number(list[i]);
            if (isFinite(n)) out.push(n);
        }
        return out;
    }

    /** 解析 key,value,notes 三列 CSV；返回原始键值（含表头行跳过与注释跳过）。 */
    function parseKeyValueCsv(text) {
        var out = {};
        if (!text || typeof text !== 'string') return out;
        var lines = text.split(/\r?\n/);
        var i;
        for (i = 0; i < lines.length; i++) {
            var line = asText(lines[i]);
            if (!line || line.charAt(0) === '#') continue;
            var comma = line.indexOf(',');
            if (comma < 0) continue;
            var key = asText(line.slice(0, comma));
            if (!key || key === 'key') continue;
            var rest = line.slice(comma + 1);
            var comma2 = rest.indexOf(',');
            var val = asText(comma2 >= 0 ? rest.slice(0, comma2) : rest);
            if (!val) continue;
            out[key] = val;
        }
        return out;
    }

    /**
     * 归一化配置：原始字符串键 + 派生类型字段。
     * 派生字段：pharmacy_skill_curve / pharmacy_use_routes / pharmacy_addiction_gain /
     *           pharmacy_addiction_stage_thresholds / pharmacy_addiction_stage_penalties /
     *           pharmacy_potency_thresholds / pharmacy_toxicity_band_thresholds /
     *           pharmacy_inhale_igniter_item_ids / pharmacy_inject_kit_item_ids /
     *           pharmacy_concentration_capacity / pharmacy_offset_rate_cap / ...
     */
    function normalize(raw) {
        var kv = {};
        var k;
        for (k in DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) kv[k] = DEFAULTS[k];
        }
        var src = raw && typeof raw === 'object' ? raw : {};
        for (k in src) {
            if (Object.prototype.hasOwnProperty.call(src, k)) kv[k] = src[k];
        }

        var out = {};
        for (k in kv) {
            if (Object.prototype.hasOwnProperty.call(kv, k)) out[k] = kv[k];
        }

        out.pharmacy_global_failure_item_id = asText(kv.pharmacy_global_failure_item_id) || DEFAULTS.pharmacy_global_failure_item_id;
        out.pharmacy_skill_curve = {
            max_level: Math.max(1, toInt(kv.pharmacy_skill_max_level, DEFAULTS.pharmacy_skill_max_level)),
            max_proficiency_uses: Math.max(1, toInt(kv.pharmacy_max_proficiency_uses, DEFAULTS.pharmacy_max_proficiency_uses)),
            success_bonus_per_level: Math.max(0, toNumber(kv.pharmacy_success_bonus_per_level, DEFAULTS.pharmacy_success_bonus_per_level)),
            proficiency_usage_key: asText(kv.pharmacy_proficiency_usage_key) || DEFAULTS.pharmacy_proficiency_usage_key
        };
        out.pharmacy_use_routes = toList(kv.pharmacy_use_routes, DEFAULTS.pharmacy_use_routes);
        out.pharmacy_inhale_igniter_item_ids = toList(kv.pharmacy_inhale_igniter_item_ids, '');
        out.pharmacy_inject_kit_item_ids = toList(kv.pharmacy_inject_kit_item_ids, '');
        out.pharmacy_addiction_gain = {
            topical: toNumber(kv.pharmacy_addiction_gain_topical, DEFAULTS.pharmacy_addiction_gain_topical),
            drink: toNumber(kv.pharmacy_addiction_gain_drink, DEFAULTS.pharmacy_addiction_gain_drink),
            inhale: toNumber(kv.pharmacy_addiction_gain_inhale, DEFAULTS.pharmacy_addiction_gain_inhale),
            inject: toNumber(kv.pharmacy_addiction_gain_inject, DEFAULTS.pharmacy_addiction_gain_inject)
        };
        out.pharmacy_addiction_decay_per_tick = Math.max(0, toNumber(kv.pharmacy_addiction_decay_per_tick, DEFAULTS.pharmacy_addiction_decay_per_tick));
        out.pharmacy_addiction_immunity_gain_reduction = Math.max(0, toNumber(kv.pharmacy_addiction_immunity_gain_reduction, DEFAULTS.pharmacy_addiction_immunity_gain_reduction));
        out.pharmacy_addiction_immunity_decay_bonus = Math.max(0, toNumber(kv.pharmacy_addiction_immunity_decay_bonus, DEFAULTS.pharmacy_addiction_immunity_decay_bonus));
        out.pharmacy_addiction_immunity_penalty_reduction = Math.max(0, toNumber(kv.pharmacy_addiction_immunity_penalty_reduction, DEFAULTS.pharmacy_addiction_immunity_penalty_reduction));
        out.pharmacy_addiction_stage_thresholds = toNumberList(kv.pharmacy_addiction_stage_thresholds, DEFAULTS.pharmacy_addiction_stage_thresholds);
        out.pharmacy_addiction_stage_penalties = toNumberList(kv.pharmacy_addiction_stage_penalties, DEFAULTS.pharmacy_addiction_stage_penalties);
        out.pharmacy_potency_thresholds = toNumberList(kv.pharmacy_potency_thresholds, DEFAULTS.pharmacy_potency_thresholds);
        out.pharmacy_toxicity_band_thresholds = toNumberList(kv.pharmacy_toxicity_band_thresholds, DEFAULTS.pharmacy_toxicity_band_thresholds);
        out.pharmacy_toxicity_decay_per_tick = Math.max(0, toNumber(kv.pharmacy_toxicity_decay_per_tick, DEFAULTS.pharmacy_toxicity_decay_per_tick));
        out.pharmacy_toxicity_lethal_ticks = Math.max(1, toInt(kv.pharmacy_toxicity_lethal_ticks, DEFAULTS.pharmacy_toxicity_lethal_ticks));
        out.pharmacy_concentration_capacity = Math.max(1, toNumber(kv.pharmacy_concentration_capacity, DEFAULTS.pharmacy_concentration_capacity));
        out.pharmacy_offset_rate_cap = Math.max(0, Math.min(1, toNumber(kv.pharmacy_offset_rate_cap, DEFAULTS.pharmacy_offset_rate_cap)));
        out.pharmacy_synergy_bonus_per_unit = Math.max(0, toNumber(kv.pharmacy_synergy_bonus_per_unit, DEFAULTS.pharmacy_synergy_bonus_per_unit));
        out.pharmacy_injectable_template_id = asText(kv.pharmacy_injectable_template_id) || DEFAULTS.pharmacy_injectable_template_id;
        out.pharmacy_disposable_kit_item_ids = toList(kv.pharmacy_disposable_kit_item_ids, DEFAULTS.pharmacy_disposable_kit_item_ids);
        out.pharmacy_sterilizer_item_ids = toList(kv.pharmacy_sterilizer_item_ids, DEFAULTS.pharmacy_sterilizer_item_ids);
        out.pharmacy_dirty_injection_toxicity = Math.max(0, toNumber(kv.pharmacy_dirty_injection_toxicity, DEFAULTS.pharmacy_dirty_injection_toxicity));
        return out;
    }

    /** CSV 文本 → 归一化配置。 */
    function parseCsv(text) {
        return normalize(parseKeyValueCsv(text));
    }

    /** 缺省配置（未装载 CSV 时的等价结果）。 */
    function getDefaults() {
        return normalize(null);
    }

    /** use_action 是否属于允许的给药途径。 */
    function isUseRouteAllowed(routeId, config) {
        var rid = asText(routeId).toLowerCase();
        if (!rid) return false;
        var routes = (config && Array.isArray(config.pharmacy_use_routes))
            ? config.pharmacy_use_routes
            : USE_ROUTE_IDS;
        return routes.indexOf(rid) >= 0;
    }

    /** 净药效数值 → potency 档（weak/regular/potent）。 */
    function getPotencyBand(effectSum, config) {
        var t = (config && Array.isArray(config.pharmacy_potency_thresholds)) ? config.pharmacy_potency_thresholds : [33, 66];
        var v = Number(effectSum);
        if (!isFinite(v) || v <= 0) return 'none';
        if (v <= (t[0] != null ? t[0] : 33)) return 'weak';
        if (v <= (t[1] != null ? t[1] : 66)) return 'regular';
        return 'potent';
    }

    /** 体内毒性数值 → 副作用档（none/mild/moderate/severe）。 */
    function getToxicityBand(toxicity, config) {
        var t = (config && Array.isArray(config.pharmacy_toxicity_band_thresholds)) ? config.pharmacy_toxicity_band_thresholds : [0, 25, 55];
        var v = Number(toxicity);
        if (!isFinite(v) || v <= 0) return 'none';
        if (v <= (t[1] != null ? t[1] : 25)) return 'mild';
        if (v <= (t[2] != null ? t[2] : 55)) return 'moderate';
        return 'severe';
    }

    /** 成瘾值 → 阶段（1..4；阈值取自配置）。 */
    function getAddictionStage(addiction, config) {
        var t = (config && Array.isArray(config.pharmacy_addiction_stage_thresholds)) ? config.pharmacy_addiction_stage_thresholds : [25, 50, 75];
        var v = Number(addiction);
        if (!isFinite(v) || v < (t[0] != null ? t[0] : 25)) return 1;
        if (v < (t[1] != null ? t[1] : 50)) return 2;
        if (v < (t[2] != null ? t[2] : 75)) return 3;
        return 4;
    }

    var api = {
        DEFAULTS: DEFAULTS,
        USE_ROUTE_IDS: USE_ROUTE_IDS,
        parseKeyValueCsv: parseKeyValueCsv,
        normalize: normalize,
        parseCsv: parseCsv,
        getDefaults: getDefaults,
        isUseRouteAllowed: isUseRouteAllowed,
        getPotencyBand: getPotencyBand,
        getToxicityBand: getToxicityBand,
        getAddictionStage: getAddictionStage
    };

    global.PharmacyConfig = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
