/**
 * 物品有效基价（统一入口，供交易/任务/事件调用）
 *
 * 规则（品质系统已移除，见 docs/design/41-quality-removal.md）：
 * - 有效基价 = round(模板 base_value)，不再乘品质系数
 * - `registerEffectiveBaseValueModifier(fn)` 在基价之后叠加（事件临时 buff 等）
 */
(function (global) {
    'use strict';

    var modifiers = [];

    function getTemplate(itemId) {
        var IE = global.InventoryEquipment;
        if (IE && typeof IE.getItemTemplate === 'function') return IE.getItemTemplate(itemId);
        return null;
    }

    /** 兼容旧 API：品质相关函数保留为无害占位（品质系统已移除） */
    function normalizeQualityTier() { return 0; }
    function getQualityTierValueMultiplier() { return 1; }

    /**
     * @param {string} itemId
     * @param {object} [opts] 旧接口兼容：{ template?, instance?, quality_tier? }，品质字段不再参与数值
     * @returns {number} 非负整数（已 round）
     */
    function getEffectiveBaseValue(itemId, opts) {
        opts = opts || {};
        var tpl = opts.template || getTemplate(itemId);
        var base = tpl && tpl.base_value != null ? Number(tpl.base_value) : 0;
        if (!isFinite(base)) base = 0;
        var v = Math.max(0, base);
        for (var i = 0; i < modifiers.length; i++) {
            try {
                var next = modifiers[i](v, itemId, opts);
                if (next != null && isFinite(Number(next))) v = Number(next);
            } catch (e) { /* ignore broken event hook */ }
        }
        return Math.max(0, Math.round(v));
    }

    /** 每件按该基价 × 数量（qualityTier 参数保留为兼容，忽略） */
    function getEffectiveBaseValueStack(itemId, count, qualityTier, opts) {
        var c = Math.max(0, parseInt(count, 10) || 0);
        if (c <= 0) return 0;
        return getEffectiveBaseValue(itemId, opts) * c;
    }

    function computeQualityAdjustedBase(itemId, opts) {
        return getEffectiveBaseValue(itemId, opts);
    }

    /** @param {function(number, string, object): number|undefined} fn */
    function registerEffectiveBaseValueModifier(fn) {
        if (typeof fn === 'function') modifiers.push(fn);
    }

    function clearEffectiveBaseValueModifiers() {
        modifiers.length = 0;
    }

    /** 品质参数已移除，保留为兼容空操作 */
    function setParams() { /* no-op */ }
    function getParams() { return {}; }

    global.ItemValue = {
        getEffectiveBaseValue: getEffectiveBaseValue,
        getEffectiveBaseValueStack: getEffectiveBaseValueStack,
        getQualityTierValueMultiplier: getQualityTierValueMultiplier,
        normalizeQualityTier: normalizeQualityTier,
        computeQualityAdjustedBase: computeQualityAdjustedBase,
        setParams: setParams,
        getParams: getParams,
        registerEffectiveBaseValueModifier: registerEffectiveBaseValueModifier,
        clearEffectiveBaseValueModifiers: clearEffectiveBaseValueModifiers
    };
})(typeof window !== 'undefined' ? window : this);
