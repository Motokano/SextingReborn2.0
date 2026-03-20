/**
 * 生产品质数值模块（A 方案）
 * 目标：把“品质影响制作成功率/产出品质”做成统一可复用入口。
 *
 * 说明：
 * - 本模块不绑定具体生产线（cook/forge/alchemy/weave），只提供统一公式。
 * - 具体系统在执行“制作一次”时调用 evaluateProduction() 即可。
 */
(function (global) {
    'use strict';

    var cfg = {
        // 成功率：每 1 档输入品质提供 +4% 相对加成
        production_success_bonus_per_quality_tier: 0.04,
        // 成功率：满级技能（1000）提供 +20% 相对加成
        production_success_bonus_at_skill_1000: 0.20,
        // 产出上修：每 1 档输入品质提供 +3% 基础上修概率
        production_upgrade_chance_per_quality_tier: 0.03,
        // 产出上修：满级技能（1000）额外 +25% 上修概率
        production_upgrade_chance_at_skill_1000: 0.25,
        // 连续上修衰减（每成功上修 1 次后，下一次概率乘此值）
        production_upgrade_chain_decay: 0.35
    };

    var QUALITY_MIN = 0;
    var QUALITY_MAX = 5;

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function normalizeQualityTier(rawTier) {
        if (rawTier == null) return QUALITY_MIN;
        var v = Number(rawTier);
        if (Number.isNaN(v)) return QUALITY_MIN;
        // 兼容旧口径 1~6
        if (v >= 1 && v <= 6) return clamp(v - 1, QUALITY_MIN, QUALITY_MAX);
        return clamp(v, QUALITY_MIN, QUALITY_MAX);
    }

    function getWeightedInputQuality(items) {
        if (!Array.isArray(items) || items.length === 0) return QUALITY_MIN;
        var totalWeight = 0;
        var weightedSum = 0;
        for (var i = 0; i < items.length; i++) {
            var it = items[i] || {};
            var count = Math.max(1, parseInt(it.count, 10) || 1);
            var q = normalizeQualityTier(it.quality_tier);
            weightedSum += q * count;
            totalWeight += count;
        }
        if (totalWeight <= 0) return QUALITY_MIN;
        return weightedSum / totalWeight;
    }

    function calcSuccessRate(baseSuccessRate, skillLevel, weightedInputQuality) {
        var base = clamp(Number(baseSuccessRate) || 0, 0, 1);
        var skill = clamp((Number(skillLevel) || 0) / 1000, 0, 1);
        var q = clamp(Number(weightedInputQuality) || 0, QUALITY_MIN, QUALITY_MAX);

        var successFactor =
            (1 + q * cfg.production_success_bonus_per_quality_tier) *
            (1 + skill * cfg.production_success_bonus_at_skill_1000);

        return clamp(base * successFactor, 0, 1);
    }

    function rollOutputQuality(baseOutputQualityTier, skillLevel, weightedInputQuality, rng) {
        var out = normalizeQualityTier(baseOutputQualityTier);
        var skill = clamp((Number(skillLevel) || 0) / 1000, 0, 1);
        var q = clamp(Number(weightedInputQuality) || 0, QUALITY_MIN, QUALITY_MAX);

        var upChance =
            q * cfg.production_upgrade_chance_per_quality_tier +
            skill * cfg.production_upgrade_chance_at_skill_1000;
        upChance = clamp(upChance, 0, 1);

        while (out < QUALITY_MAX && (rng || Math.random)() < upChance) {
            out += 1;
            upChance *= cfg.production_upgrade_chain_decay;
        }
        return out;
    }

    /**
     * 评估一次制作结果。
     * @param {Object} p
     * @param {number} p.base_success_rate - 基础成功率（0~1）
     * @param {number} p.skill_level - 对应生产技能等级（0~1000）
     * @param {Array<{quality_tier:number,count?:number}>} p.input_items - 输入材料实例列表
     * @param {number} p.base_output_quality_tier - 配方基础产出品质（0~5）
     * @param {Function} [p.rng] - 可注入随机源，便于测试
     * @returns {{success:boolean, success_rate:number, output_quality_tier:number|null, weighted_input_quality:number}}
     */
    function evaluateProduction(p) {
        p = p || {};
        var weightedQ = getWeightedInputQuality(p.input_items || []);
        var successRate = calcSuccessRate(p.base_success_rate, p.skill_level, weightedQ);
        var rng = p.rng || Math.random;
        var success = rng() < successRate;
        if (!success) {
            return {
                success: false,
                success_rate: successRate,
                output_quality_tier: null,
                weighted_input_quality: weightedQ
            };
        }
        return {
            success: true,
            success_rate: successRate,
            output_quality_tier: rollOutputQuality(
                p.base_output_quality_tier,
                p.skill_level,
                weightedQ,
                rng
            ),
            weighted_input_quality: weightedQ
        };
    }

    function setConfig(nextCfg) {
        if (!nextCfg || typeof nextCfg !== 'object') return;
        for (var k in cfg) {
            if (!cfg.hasOwnProperty(k)) continue;
            if (nextCfg[k] != null && !Number.isNaN(Number(nextCfg[k]))) {
                cfg[k] = Number(nextCfg[k]);
            }
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

