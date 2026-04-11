/**
 * 物品价值与品质档（统一入口，供交易/任务/事件调用）
 *
 * 规则（当前默认）：
 * - 模板 `base_value` 为基线；归一化品质档 q∈[0,5]（与 ProductionQuality 一致，兼容旧 1~6）
 * - 有效价值 = round(base_value × (1 + value_bonus_per_quality_tier × q))
 * - 默认每高一档 +10% 基价（即 value_bonus_per_quality_tier = 0.1）
 *
 * 可选：`registerEffectiveBaseValueModifier(fn)` 在品质乘算之后叠加（事件临时 buff 等）
 */
(function (global) {
    'use strict';

    var params = {
        value_bonus_per_quality_tier: 0.1
    };
    var modifiers = [];

    function normTier(raw) {
        if (global.ProductionQuality && typeof global.ProductionQuality.normalizeQualityTier === 'function') {
            return global.ProductionQuality.normalizeQualityTier(raw);
        }
        if (raw == null) return 0;
        var v = Number(raw);
        if (Number.isNaN(v)) return 0;
        if (v >= 1 && v <= 6) return Math.max(0, Math.min(5, v - 1));
        return Math.max(0, Math.min(5, v));
    }

    function getTemplate(itemId) {
        var IE = global.InventoryEquipment;
        if (IE && typeof IE.getItemTemplate === 'function') return IE.getItemTemplate(itemId);
        return null;
    }

    /**
     * @param {object} [opts]
     * @param {object} [opts.template] 已取到的物品模板（可省 itemId 查表）
     * @param {object} [opts.instance] 含 quality_tier 的实例（背包格等）
     * @param {number} [opts.quality_tier] 直接指定档
     */
    function resolveQualityTier(opts, tpl) {
        opts = opts || {};
        if (opts.quality_tier != null) return normTier(opts.quality_tier);
        if (opts.instance && opts.instance.quality_tier != null) return normTier(opts.instance.quality_tier);
        if (tpl && tpl.quality_tier != null) return normTier(tpl.quality_tier);
        return 0;
    }

    /** @param {number} tier 原始或已归一化档 */
    function getQualityTierValueMultiplier(tier) {
        var q = normTier(tier);
        return 1 + params.value_bonus_per_quality_tier * q;
    }

    function computeQualityAdjustedBase(itemId, opts) {
        opts = opts || {};
        var tpl = opts.template || getTemplate(itemId);
        if (!tpl) return 0;
        var base = Number(tpl.base_value);
        if (!isFinite(base)) base = 0;
        var q = resolveQualityTier(opts, tpl);
        var mult = getQualityTierValueMultiplier(q);
        return Math.max(0, base * mult);
    }

    /**
     * @param {string} itemId
     * @param {object} [opts] 见 resolveQualityTier
     * @returns {number} 非负整数（已 round）
     */
    function getEffectiveBaseValue(itemId, opts) {
        var v = computeQualityAdjustedBase(itemId, opts);
        for (var i = 0; i < modifiers.length; i++) {
            try {
                var next = modifiers[i](v, itemId, opts || {});
                if (next != null && isFinite(Number(next))) v = Number(next);
            } catch (e) { /* ignore broken event hook */ }
        }
        return Math.max(0, Math.round(v));
    }

    /** 同档 × 数量（每件都按该档计价） */
    function getEffectiveBaseValueStack(itemId, count, qualityTier, opts) {
        var c = Math.max(0, parseInt(count, 10) || 0);
        if (c <= 0) return 0;
        var o = Object.assign({}, opts || {});
        if (qualityTier != null) o.quality_tier = qualityTier;
        return getEffectiveBaseValue(itemId, o) * c;
    }

    /** @param {function(number, string, object): number|undefined} fn */
    function registerEffectiveBaseValueModifier(fn) {
        if (typeof fn === 'function') modifiers.push(fn);
    }

    function clearEffectiveBaseValueModifiers() {
        modifiers.length = 0;
    }

    function setParams(p) {
        if (!p || typeof p !== 'object') return;
        if (p.value_bonus_per_quality_tier != null) {
            var x = Number(p.value_bonus_per_quality_tier);
            if (isFinite(x) && x >= 0) params.value_bonus_per_quality_tier = x;
        }
    }

    function getParams() {
        return { value_bonus_per_quality_tier: params.value_bonus_per_quality_tier };
    }

    global.ItemValue = {
        getEffectiveBaseValue: getEffectiveBaseValue,
        getEffectiveBaseValueStack: getEffectiveBaseValueStack,
        getQualityTierValueMultiplier: getQualityTierValueMultiplier,
        normalizeQualityTier: normTier,
        computeQualityAdjustedBase: computeQualityAdjustedBase,
        setParams: setParams,
        getParams: getParams,
        registerEffectiveBaseValueModifier: registerEffectiveBaseValueModifier,
        clearEffectiveBaseValueModifiers: clearEffectiveBaseValueModifiers
    };
})(typeof window !== 'undefined' ? window : this);
