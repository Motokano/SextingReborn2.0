/**
 * 生产成功率数值模块（品质系统已移除，见 docs/design/41-quality-removal.md）
 * 目标：把“成功率”做成统一可复用入口；产出不再有品质档。
 * 具体系统在执行“制作一次”时调用 evaluateProduction() 即可。
 */
(function (global) {
    'use strict';

    var cfg = {
        // 成功率：满级技能（1000）提供 +20% 相对加成
        production_success_bonus_at_skill_1000: 0.20
    };

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    /** 兼容旧 API：品质相关函数保留为无害占位（品质系统已移除） */
    function normalizeQualityTier() { return 0; }
    function getWeightedInputQuality() { return 0; }
    function rollOutputQuality() { return 0; }

    function calcSuccessRate(baseSuccessRate, skillLevel) {
        var base = clamp(Number(baseSuccessRate) || 0, 0, 1);
        var skill = clamp((Number(skillLevel) || 0) / 1000, 0, 1);
        return clamp(base * (1 + skill * cfg.production_success_bonus_at_skill_1000), 0, 1);
    }

    /**
     * 评估一次制作结果（只判成功率，无品质档）。
     * @param {Object} p
     * @param {number} p.base_success_rate - 基础成功率（0~1）
     * @param {number} p.skill_level - 对应生产技能等级（0~1000）
     * @param {Function} [p.rng] - 可注入随机源，便于测试
     * @returns {{success:boolean, success_rate:number, output_quality_tier:number, weighted_input_quality:number}}
     */
    function evaluateProduction(p) {
        p = p || {};
        var successRate = calcSuccessRate(p.base_success_rate, p.skill_level);
        var rng = p.rng || Math.random;
        var success = rng() < successRate;
        return {
            success: success,
            success_rate: successRate,
            output_quality_tier: 0,
            weighted_input_quality: 0
        };
    }

    function setConfig(nextCfg) {
        if (!nextCfg || typeof nextCfg !== 'object') return;
        if (nextCfg.production_success_bonus_at_skill_1000 != null && !Number.isNaN(Number(nextCfg.production_success_bonus_at_skill_1000))) {
            cfg.production_success_bonus_at_skill_1000 = Number(nextCfg.production_success_bonus_at_skill_1000);
        }
    }

    function getConfig() {
        return Object.assign({}, cfg);
    }

    global.ProductionQuality = {
        setConfig: setConfig,
        getConfig: getConfig,
        normalizeQualityTier: normalizeQualityTier,
        getWeightedInputQuality: getWeightedInputQuality,
        calcSuccessRate: calcSuccessRate,
        rollOutputQuality: rollOutputQuality,
        evaluateProduction: evaluateProduction
    };
})(typeof window !== 'undefined' ? window : this);
