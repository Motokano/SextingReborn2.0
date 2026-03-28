/**
 * 生存属性模块 - 按设计文档 06-survival.md 实装
 * 负责：饱食、饮水、体力、精力、心情、定力、营养、体温、体重及每 tick 结算
 */
(function (global) {
    'use strict';

    var cfg = {};
    var state = {
        satiety: 100,
        thirst: 100,
        stamina: 100,
        energy: 100,
        mood: 500,
        composure: 10,
        sexual_ability: 0,
        gender_value: 0,
        nutrition: 40,
        body_temperature: 37,
        body_temperature_standard: 37,
        weight_kg: 60,

        tickCount: 0,
        starvationTicks: 0,
        thirstDeathTicks: 0,
        staminaZeroTicks: 0,
        overfedTicks: 0,
        severeHungerTicks: 0,
        isResting: false,
        is_sit_meditation_active: false,
        isDead: false,
        isComa: false,

        /** 战斗：气力（快耗快消）、底气、底气护体剩余盾量（见 07 / 11 基本呼吸法） */
        qi_li_current: 100,
        diqi_current: 0,
        diqi_cap_limit: 0,
        diqi_cap_limit_flat_bonuses: {},
        diqi_max_effective: 0,
        diqi_shield_remaining: 0,
        last_sit_meditation_gain: 0,
        sit_meditation_interrupt_this_tick: false
    };

    /** 从外部获取呼吸实际值、凝气加成（可选），用于体力/底气恢复公式 */
    var getBreathActual = function () { return 10; };
    var getNingqiBonus = function () { return 0; };

    function get(key, def) {
        return (cfg[key] !== undefined && cfg[key] !== null) ? cfg[key] : def;
    }

    function clamp(val, min, max) {
        if (val < min) return min;
        if (val > max) return max;
        return val;
    }

    function round1(v) {
        return Math.round(v * 10) / 10;
    }

    function setConfig(config) {
        if (config && typeof config === 'object') {
            var k;
            for (k in config) if (config.hasOwnProperty(k)) cfg[k] = config[k];
        }
    }

    function setCharacterCallbacks(options) {
        if (options.getBreathActual) getBreathActual = options.getBreathActual;
        if (options.getNingqiBonus) getNingqiBonus = options.getNingqiBonus;
    }

    function getState() {
        return {
            satiety: state.satiety,
            thirst: state.thirst,
            stamina: state.stamina,
            stamina_max: get('stamina_max', 100),
            energy: state.energy,
            energy_max: get('energy_max', 100),
            mood: state.mood,
            composure: state.composure,
            sexual_ability: state.sexual_ability,
            gender_value: state.gender_value,
            nutrition: state.nutrition,
            body_temperature: state.body_temperature,
            body_temperature_standard: state.body_temperature_standard,
            weight_kg: state.weight_kg,
            tickCount: state.tickCount,
            isResting: state.isResting,
            is_sit_meditation_active: !!state.is_sit_meditation_active,
            isDead: state.isDead,
            isComa: state.isComa,

            qi_li_current: state.qi_li_current,
            qi_li_max: getQiLiMax(),
            diqi_current: state.diqi_current,
            diqi_cap_limit: state.diqi_cap_limit,
            diqi_cap_limit_flat_bonuses: state.diqi_cap_limit_flat_bonuses,
            diqi_max: state.diqi_max_effective,
            diqi_max_effective: state.diqi_max_effective,
            diqi_shield_remaining: state.diqi_shield_remaining
        };
    }

    function setState(s) {
        if (!s || typeof s !== 'object') return;
        // tick-based internal counters (for deterministic progression after reload)
        if (s.tickCount !== undefined) state.tickCount = Math.max(0, Math.floor(Number(s.tickCount) || 0));
        if (s.starvationTicks !== undefined) state.starvationTicks = Math.max(0, Math.floor(Number(s.starvationTicks) || 0));
        if (s.thirstDeathTicks !== undefined) state.thirstDeathTicks = Math.max(0, Math.floor(Number(s.thirstDeathTicks) || 0));
        if (s.staminaZeroTicks !== undefined) state.staminaZeroTicks = Math.max(0, Math.floor(Number(s.staminaZeroTicks) || 0));
        if (s.overfedTicks !== undefined) state.overfedTicks = Math.max(0, Math.floor(Number(s.overfedTicks) || 0));
        if (s.severeHungerTicks !== undefined) state.severeHungerTicks = Math.max(0, Math.floor(Number(s.severeHungerTicks) || 0));

        if (s.satiety !== undefined) state.satiety = round1(clamp(s.satiety, 0, get('satiety_overcap_max', 120)));
        if (s.thirst !== undefined) state.thirst = round1(clamp(s.thirst, 0, get('thirst_max', 100)));
        if (s.stamina !== undefined) state.stamina = round1(clamp(s.stamina, 0, get('stamina_max', 100)));
        if (s.energy !== undefined) state.energy = round1(clamp(s.energy, 0, get('energy_max', 100)));
        if (s.mood !== undefined) state.mood = clamp(Math.round(s.mood), get('mood_min', 0), get('mood_max', 1000));
        if (s.composure !== undefined) state.composure = clamp(Math.round(s.composure), get('composure_min', 0), get('composure_max', 20));
        if (s.sexual_ability !== undefined) state.sexual_ability = clamp(Math.round(s.sexual_ability), get('sexual_ability_min', 0), get('sexual_ability_max', 100));
        if (s.gender_value !== undefined) state.gender_value = clamp(Math.round(s.gender_value), get('gender_value_min', 0), get('gender_value_max', 100));
        if (s.nutrition !== undefined) state.nutrition = clamp(Math.round(s.nutrition), get('nutrition_min', 0), get('nutrition_max', 100));
        if (s.body_temperature !== undefined) state.body_temperature = round1(s.body_temperature);
        if (s.body_temperature_standard !== undefined) state.body_temperature_standard = round1(s.body_temperature_standard);
        if (s.weight_kg !== undefined) state.weight_kg = Math.max(0, s.weight_kg);
        if (s.isResting !== undefined) state.isResting = !!s.isResting;
        if (s.is_sit_meditation_active !== undefined) state.is_sit_meditation_active = !!s.is_sit_meditation_active;
        if (s.isDead !== undefined) state.isDead = !!s.isDead;
        if (s.isComa !== undefined) state.isComa = !!s.isComa;

        if (s.diqi_cap_limit !== undefined) {
            state.diqi_cap_limit = Math.max(0, Math.round(Number(s.diqi_cap_limit) || 0));
        }
        if (s.diqi_cap_limit_flat_bonuses && typeof s.diqi_cap_limit_flat_bonuses === 'object') {
            state.diqi_cap_limit_flat_bonuses = normalizeDiqiCapLimitBonuses(s.diqi_cap_limit_flat_bonuses);
        }
        var diqiCapLoad = Math.max(0, Math.round(Number(s.diqi_max != null ? s.diqi_max : s.diqi_max_effective) || 0));
        state.diqi_max_effective = diqiCapLoad;
        if (state.diqi_cap_limit > 0) {
            state.diqi_max_effective = Math.min(state.diqi_max_effective, state.diqi_cap_limit);
        }
        if (s.diqi_current !== undefined) {
            var capD = state.diqi_max_effective > 0 ? state.diqi_max_effective : 9999;
            state.diqi_current = round1(clamp(s.diqi_current, 0, capD));
        }
        if (s.qi_li_current !== undefined) state.qi_li_current = round1(clamp(s.qi_li_current, 0, getQiLiMax()));
        if (s.diqi_shield_remaining !== undefined) state.diqi_shield_remaining = Math.max(0, Math.round(Number(s.diqi_shield_remaining) || 0));
    }

    function getQiLiMax() {
        return Math.max(1, get('qi_li_max', 100));
    }

    function normalizeDiqiCapLimitBonuses(map) {
        var out = {};
        if (!map || typeof map !== 'object') return out;
        var k;
        for (k in map) {
            if (!map.hasOwnProperty(k)) continue;
            var key = String(k || '');
            if (!key) continue;
            var v = Math.round(Number(map[k]) || 0);
            if (v !== 0) out[key] = v;
        }
        return out;
    }

    function sumDiqiCapLimitFlatBonuses() {
        var map = state.diqi_cap_limit_flat_bonuses || {};
        var sum = 0;
        var k;
        for (k in map) {
            if (!map.hasOwnProperty(k)) continue;
            var v = Math.round(Number(map[k]) || 0);
            if (isFinite(v)) sum += v;
        }
        return sum;
    }

    function recomputeDiqiCapLimitAndClamp() {
        var cap = computeDiqiCapLimitFromBreath();
        state.diqi_cap_limit = cap;
        if (cap <= 0) {
            state.diqi_max_effective = 0;
            state.diqi_current = 0;
            state.diqi_shield_remaining = 0;
            return;
        }
        state.diqi_max_effective = clamp(state.diqi_max_effective, 0, cap);
        state.diqi_current = round1(clamp(state.diqi_current, 0, state.diqi_max_effective));
        if (state.diqi_shield_remaining > state.diqi_current && state.diqi_shield_remaining > 0) {
            state.diqi_shield_remaining = Math.min(state.diqi_shield_remaining, Math.floor(state.diqi_current));
        }
    }

    function setDiqiCapLimitFlatBonus(sourceTag, value) {
        var key = String(sourceTag || '').trim();
        if (!key) return;
        var map = state.diqi_cap_limit_flat_bonuses || {};
        var v = Math.round(Number(value) || 0);
        if (v === 0) {
            delete map[key];
        } else {
            map[key] = v;
        }
        state.diqi_cap_limit_flat_bonuses = map;
        recomputeDiqiCapLimitAndClamp();
    }

    function removeDiqiCapLimitFlatBonus(sourceTag) {
        var key = String(sourceTag || '').trim();
        if (!key) return;
        var map = state.diqi_cap_limit_flat_bonuses || {};
        delete map[key];
        state.diqi_cap_limit_flat_bonuses = map;
        recomputeDiqiCapLimitAndClamp();
    }

    /** 由“基本呼吸法”等级推导底气上限容器（diqi_cap_limit） */
    function computeDiqiCapLimitFromBreath(breathEffective) {
        var lv = 0;
        if (typeof global !== 'undefined' && global.InventoryEquipment && typeof global.InventoryEquipment.getSkillLevel === 'function') {
            lv = Math.max(0, parseInt(global.InventoryEquipment.getSkillLevel('combat_basic_breath'), 10) || 0);
        }
        var cap = lv;
        var nPeakPct = Number(get('nutrition_peak_diqi_cap_pct', 0));
        if (isFinite(nPeakPct) && nPeakPct > 0 && getNutritionTier() === 'peak') {
            cap += Math.max(0, Math.floor(lv * nPeakPct));
        }
        cap += sumDiqiCapLimitFlatBonuses();
        var hardMax = Number(get('diqi_cap_limit_hard_max', 999999));
        if (isFinite(hardMax) && hardMax >= 0) cap = Math.min(cap, Math.floor(hardMax));
        return Math.max(0, cap);
    }

    /**
     * 属性重算后调用：更新 diqi 上限并夹紧 current；护体盾不超过 current 逻辑在扣盾侧处理
     */
    function refreshDiqiMaxFromBreath(breathEffective) {
        var prevCap = Math.max(0, Math.round(Number(state.diqi_cap_limit) || 0));
        var prevMax = Math.max(0, Math.round(Number(state.diqi_max_effective) || 0));
        var cap = computeDiqiCapLimitFromBreath(breathEffective);
        state.diqi_cap_limit = cap;
        if (cap <= 0) {
            state.diqi_max_effective = 0;
            state.diqi_current = 0;
            state.diqi_shield_remaining = 0;
            return;
        }
        // 学会基础呼吸法后底气上限至少为 1；后续仅通过调息突破增长
        if (state.diqi_max_effective <= 0) state.diqi_max_effective = 1;
        state.diqi_max_effective = clamp(state.diqi_max_effective, 1, cap);
        var maxChanged = (state.diqi_cap_limit !== prevCap) || (state.diqi_max_effective !== prevMax);
        if (maxChanged) {
            // 文档约定：当上限发生变化时，若 current 超过新上限，夹紧到新上限。
            state.diqi_current = round1(clamp(state.diqi_current, 0, state.diqi_max_effective));
        } else {
            // 上限未变化时，保留调息突破过程中的溢出区间（最多 2*diqi_max-1）。
            var keepUpper = Math.max(0, state.diqi_max_effective);
            if (state.diqi_current > keepUpper) {
                keepUpper = Math.max(keepUpper, 2 * state.diqi_max_effective - 1);
            }
            state.diqi_current = round1(clamp(state.diqi_current, 0, keepUpper));
        }
        if (state.diqi_shield_remaining > state.diqi_current && state.diqi_shield_remaining > 0) {
            state.diqi_shield_remaining = Math.min(state.diqi_shield_remaining, Math.floor(state.diqi_current));
        }
    }

    /**
     * 调息 / 行气单 tick：
     * - 未封顶：恢复到 2*diqi_max 触发突破（current 归零，diqi_max +1，不超过 cap_limit）
     * - 已封顶：允许溢出到 2*diqi_max-1（达到后不再继续增加）
     * @returns {number} 实际增加的底气量
     */
    function applySitMeditationDiqiOnce() {
        var mx = Math.max(0, state.diqi_max_effective);
        if (mx <= 0) {
            state.last_sit_meditation_gain = 0;
            return 0;
        }
        var base = Math.max(1, Math.ceil(mx * 0.05));
        var breath = Math.max(0, (typeof getBreathActual === 'function' ? getBreathActual() : 10));
        var coef = Number(get('breath_diqi_stamina_coef', 0.02));
        if (!isFinite(coef) || coef < 0) coef = 0;
        var mBreath = Math.max(0, 1 + coef * breath);
        var ningqi = (typeof getNingqiBonus === 'function' ? getNingqiBonus() : 0) || 0;
        if (!isFinite(ningqi) || ningqi < 0) ningqi = 0;
        var R = Math.max(1, Math.ceil(base * (1 + ningqi) * mBreath * getDiqiRegenMultiplier()));
        var before = state.diqi_current;
        var capLimit = Math.max(0, state.diqi_cap_limit || 0);
        var atCap = capLimit > 0 && mx >= capLimit;
        if (atCap) {
            var overflowMax = Math.max(0, 2 * mx - 1);
            state.diqi_current = round1(clamp(before + R, 0, overflowMax));
            state.last_sit_meditation_gain = Math.max(0, state.diqi_current - before);
            return state.last_sit_meditation_gain;
        }
        var curAfterGain = before + R;
        if (curAfterGain >= 2 * mx) {
            state.diqi_current = 0;
            var nextMx = mx + 1;
            if (capLimit > 0) nextMx = Math.min(nextMx, capLimit);
            state.diqi_max_effective = Math.max(0, nextMx);
            state.last_sit_meditation_gain = Math.max(0, round1(curAfterGain - before));
            return state.last_sit_meditation_gain;
        }
        state.diqi_current = round1(clamp(curAfterGain, 0, 2 * mx - 1));
        state.last_sit_meditation_gain = Math.max(0, state.diqi_current - before);
        return state.last_sit_meditation_gain;
    }

    function setSitMeditationActive(active) {
        state.is_sit_meditation_active = !!active;
    }

    function isSitMeditationActive() {
        return !!state.is_sit_meditation_active;
    }

    function getLastSitMeditationGain() {
        return Math.max(0, Number(state.last_sit_meditation_gain) || 0);
    }

    function interruptSitMeditationThisTick() {
        state.sit_meditation_interrupt_this_tick = true;
    }

    function initBattleResourcesFull() {
        var qm = getQiLiMax();
        state.qi_li_current = qm;
        if (typeof global !== 'undefined' && global.CharacterAttributes && typeof global.CharacterAttributes.getEffectiveAttr === 'function') {
            refreshDiqiMaxFromBreath(global.CharacterAttributes.getEffectiveAttr('breath'));
        } else {
            refreshDiqiMaxFromBreath(10);
        }
        state.diqi_current = round1(state.diqi_max_effective);
        state.diqi_shield_remaining = 0;
    }

    function addQiLi(amount) {
        var a = Math.max(0, Number(amount) || 0);
        if (a <= 0) return;
        var mx = getQiLiMax();
        state.qi_li_current = round1(clamp(state.qi_li_current + a, 0, mx));
    }

    function consumeQiLi(amount) {
        var a = Math.max(0, Number(amount) || 0);
        if (a <= 0) return 0;
        var take = Math.min(a, state.qi_li_current);
        state.qi_li_current = round1(Math.max(0, state.qi_li_current - take));
        return take;
    }

    function consumeDiqi(amount) {
        var a = Math.max(0, Math.floor(Number(amount) || 0));
        if (a <= 0) return 0;
        var take = Math.min(a, state.diqi_current);
        state.diqi_current = round1(Math.max(0, state.diqi_current - take));
        return take;
    }

    /** 增加底气，夹紧到当前 diqi_max_effective */
    function addDiqiCurrent(amount) {
        var a = Math.max(0, Number(amount) || 0);
        if (a <= 0) return;
        var mx = Math.max(0, state.diqi_max_effective);
        if (mx <= 0) return;
        state.diqi_current = round1(clamp(state.diqi_current + a, 0, mx));
    }

    /**
     * 统一底气入口（06 约定）：同时支持当前值、上限、上限容器增减，并处理夹紧。
     * @param {{curDelta?:number,maxDelta?:number,capLimitDelta?:number,sourceTag?:string}} patch
     */
    function changeDiqi(patch) {
        patch = patch || {};
        var capDelta = Number(patch.capLimitDelta || 0);
        var maxDelta = Number(patch.maxDelta || 0);
        var curDelta = Number(patch.curDelta || 0);
        var sourceTag = String(patch.sourceTag || '').trim();
        if (isFinite(capDelta) && capDelta !== 0) {
            var key = sourceTag || '__legacy_cap_delta__';
            var oldVal = (state.diqi_cap_limit_flat_bonuses && state.diqi_cap_limit_flat_bonuses[key]) || 0;
            setDiqiCapLimitFlatBonus(key, oldVal + Math.round(capDelta));
        }
        if (isFinite(maxDelta) && maxDelta !== 0) {
            state.diqi_max_effective = Math.max(0, Math.round(state.diqi_max_effective + maxDelta));
        }
        if (state.diqi_cap_limit > 0) {
            state.diqi_max_effective = Math.min(state.diqi_max_effective, state.diqi_cap_limit);
        }
        if (isFinite(curDelta) && curDelta !== 0) {
            state.diqi_current = round1(state.diqi_current + curDelta);
        }
        var curCap = Math.max(0, state.diqi_max_effective);
        state.diqi_current = round1(clamp(state.diqi_current, 0, curCap));
        if (state.diqi_shield_remaining > state.diqi_current && state.diqi_shield_remaining > 0) {
            state.diqi_shield_remaining = Math.min(state.diqi_shield_remaining, Math.floor(state.diqi_current));
        }
        return {
            diqi_current: state.diqi_current,
            diqi_max: state.diqi_max_effective,
            diqi_cap_limit: state.diqi_cap_limit
        };
    }

    /**
     * 受击侧底气护体：按配置比例从本击伤害中「吸收」数值，并从 shield 扣除（见 06 / 08 / 19 §6.6）。
     * @param {number} incomingDamage 进入护体层前的伤害（通常已过完招架）
     * @param {number} reducePct 如 0.25 表示理想吸收 floor(D×pct)，实际吸收 min(理想, 剩余盾)
     * @returns {{ outDamage: number, absorbed: number }}
     */
    function applyDiqiShieldToDamage(incomingDamage, reducePct) {
        var D = Math.max(0, Number(incomingDamage) || 0);
        if (D <= 0) return { outDamage: 0, absorbed: 0 };
        var sh = getDiqiShieldRemaining();
        if (sh <= 0) return { outDamage: D, absorbed: 0 };
        var pct = typeof reducePct === 'number' && isFinite(reducePct) ? reducePct : 0.25;
        if (pct < 0) pct = 0;
        if (pct > 0.95) pct = 0.95;
        var ideal = Math.floor(D * pct);
        var absorb = Math.min(ideal, sh);
        if (absorb < 0) absorb = 0;
        var outD = Math.max(0, D - absorb);
        if (absorb > 0) {
            setDiqiShieldRemaining(sh - absorb);
            breakDiqiShieldIfDepleted();
        }
        return { outDamage: outD, absorbed: absorb };
    }

    function getDiqiShieldRemaining() {
        return Math.max(0, Math.floor(state.diqi_shield_remaining || 0));
    }

    function setDiqiShieldRemaining(v) {
        state.diqi_shield_remaining = Math.max(0, Math.floor(Number(v) || 0));
    }

    function breakDiqiShieldIfDepleted() {
        if (state.diqi_shield_remaining <= 0) state.diqi_shield_remaining = 0;
    }

    /** 饱食区间：正常 / 稍微饥饿 / 中等饥饿 / 重度饥饿 / 极限饥饿 */
    function getSatietyZone() {
        var s = state.satiety;
        if (s >= get('satiety_normal_min', 60)) return 'normal';
        if (s >= get('satiety_mild_min', 40)) return 'mild';
        if (s >= get('satiety_moderate_min', 15)) return 'moderate';
        if (s > 0) return 'severe';
        return 'starvation';
    }

    /** 重度饥饿或极限饥饿时禁止消耗体力/精力的动作 */
    function canPerformStaminaOrEnergyAction() {
        if (state.isDead || state.isComa) return false;
        var zone = getSatietyZone();
        if (zone === 'severe' || zone === 'starvation') return false;
        if (state.stamina <= 0) {
            var limit = get('stamina_zero_ticks_to_coma', 50);
            if (state.staminaZeroTicks >= limit) return false;
        }
        return true;
    }

    /** 体力自然恢复倍率（中等饥饿 0.5） */
    function getStaminaRegenMultiplier() {
        if (getSatietyZone() === 'moderate' || getSatietyZone() === 'severe' || getSatietyZone() === 'starvation') return 0.5;
        return 1;
    }

    /** 底气自然恢复倍率（中等饥饿/渴了/营养不良时 0.5） */
    function getDiqiRegenMultiplier() {
        var m = 1;
        if (getSatietyZone() === 'moderate' || getSatietyZone() === 'severe' || getSatietyZone() === 'starvation') m *= 0.5;
        if (state.thirst < get('thirst_normal_min', 60) && state.thirst > 0) m *= 0.5;
        if (state.nutrition <= get('nutrition_malnutrition_max', 10)) m *= get('nutrition_malnutrition_diqi_regen_mult', 0.5);
        return m;
    }

    /** 营养档位：malnutrition / normal / abundant / peak */
    function getNutritionTier() {
        var n = state.nutrition;
        if (n <= get('nutrition_malnutrition_max', 10)) return 'malnutrition';
        if (n <= get('nutrition_normal_max', 30)) return 'normal';
        if (n <= get('nutrition_abundant_max', 70)) return 'abundant';
        return 'peak';
    }

    /** 生活技能收益乘数 M_mood = 1 + 0.01 * (mood - 500) */
    function getMoodLifeSkillMultiplier() {
        var center = get('mood_center', 500);
        var pct = get('mood_life_skill_pct_per_point', 0.01);
        return 1 + pct * (state.mood - center);
    }

    /** 定力对心情变动幅度的系数 K_comp = 1 + 0.05 * (10 - composure) */
    function getComposureMoodFactor() {
        var center = get('composure_center', 10);
        var pct = get('composure_mood_change_pct_per_point', 0.05);
        return 1 + pct * (center - state.composure);
    }

    function addSatiety(amount) {
        if (amount <= 0) return;
        var overcapThreshold = get('satiety_overcap_threshold', 90);
        var maxVal = get('satiety_max', 100);
        var overcapMax = get('satiety_overcap_max', 120);
        var next = state.satiety + amount;
        if (state.satiety < overcapThreshold) {
            next = Math.min(next, maxVal);
        } else {
            next = Math.min(next, overcapMax);
        }
        state.satiety = round1(clamp(next, 0, overcapMax));
        if (state.satiety > 0) state.starvationTicks = 0;
    }

    function addThirst(amount) {
        if (amount <= 0) return;
        var maxVal = get('thirst_max', 100);
        state.thirst = round1(clamp(state.thirst + amount, 0, maxVal));
        if (state.thirst > 0) state.thirstDeathTicks = 0;
    }

    function consumeStamina(amount) {
        var a = amount || 0;
        state.stamina = round1(Math.max(0, state.stamina - a));
        if (state.stamina > 0) state.staminaZeroTicks = 0;
    }

    function consumeEnergy(amount) {
        var a = amount || 0;
        state.energy = round1(Math.max(0, state.energy - a));
    }

    function addEnergy(amount) {
        var a = Math.max(0, Number(amount) || 0);
        if (a <= 0) return;
        var em = get('energy_max', 100);
        state.energy = round1(clamp(state.energy + a, 0, em));
    }

    function addNutrition(amount) {
        if (amount <= 0) return;
        var maxVal = get('nutrition_max', 100);
        state.nutrition = clamp(state.nutrition + Math.round(amount), 0, maxVal);
    }

    function setResting(resting) {
        state.isResting = !!resting;
    }

    /** 单 tick 结算；返回 { death: 'starvation'|'thirst'|null, coma: boolean } */
    function advanceTick() {
        var result = { death: null, coma: false };
        if (state.isDead) return result;

        state.tickCount += 1;
        var tick = state.tickCount;

        // 推进世界时间（若时间系统已加载）
        if (typeof global !== 'undefined' && global.GameTime && typeof global.GameTime.advanceTicks === 'function') {
            global.GameTime.advanceTicks(1);
        }

        // ---------- 饱食 ----------
        var satDecay = get('satiety_tick_decay', 1);
        state.satiety = round1(Math.max(0, state.satiety - satDecay));
        if (state.satiety <= 0) {
            state.starvationTicks += 1;
            if (state.starvationTicks >= get('satiety_starvation_ticks_to_death', 100)) {
                state.isDead = true;
                result.death = 'starvation';
                return result;
            }
        } else {
            state.starvationTicks = 0;
        }

        if (state.satiety > get('satiety_severe_hunger_max', 10)) state.severeHungerTicks = 0;
        if (state.satiety <= get('satiety_severe_hunger_max', 10) && state.satiety > 0) {
            state.severeHungerTicks += 1;
            var lossTicks = get('satiety_severe_hunger_ticks_to_weight_loss', 500);
            if (state.severeHungerTicks >= lossTicks) {
                state.weight_kg = Math.max(0, state.weight_kg - 1);
                state.severeHungerTicks = 0;
            }
        }
        if (state.satiety > 100) {
            state.overfedTicks += 1;
            var gainTicks = get('satiety_overfed_ticks_to_weight_gain', 500);
            if (state.overfedTicks >= gainTicks) {
                state.weight_kg += 1;
                state.overfedTicks = 0;
            }
        } else {
            state.overfedTicks = 0;
        }

        // ---------- 饮水 ----------
        var thirstInterval = get('thirst_tick_decay_interval', 2);
        if (tick % thirstInterval === 0) {
            var thirstDecay = get('thirst_tick_decay_amount', 1);
            state.thirst = round1(Math.max(0, state.thirst - thirstDecay));
        }
        if (state.thirst <= 0) {
            state.thirstDeathTicks += 1;
            if (state.thirstDeathTicks >= get('thirst_death_ticks', 500)) {
                state.isDead = true;
                result.death = 'thirst';
                return result;
            }
        } else {
            state.thirstDeathTicks = 0;
        }

        // ---------- 体力恢复 ----------
        var staminaMax = get('stamina_max', 100);
        var baseRegen = state.isResting ? get('stamina_rest_tick_regen_base', 5) : get('stamina_tick_regen_base', 0.5);
        var breath = Math.max(0, (typeof getBreathActual === 'function' ? getBreathActual() : 10));
        var coef = get('breath_diqi_stamina_coef', 0.02);
        var ningqi = (typeof getNingqiBonus === 'function' ? getNingqiBonus() : 0) || 0;
        var regen = (baseRegen + coef * breath) * (1 + ningqi) * getStaminaRegenMultiplier();
        state.stamina = round1(Math.min(staminaMax, state.stamina + regen));
        if (state.stamina <= 0) {
            state.staminaZeroTicks += 1;
            if (state.staminaZeroTicks >= get('stamina_zero_ticks_to_coma', 50)) {
                state.isComa = true;
                result.coma = true;
            }
        } else {
            state.staminaZeroTicks = 0;
        }

        // ---------- 心情回归（每 50 tick） ----------
        var moodInterval = get('mood_regression_interval_ticks', 50);
        if (tick % moodInterval === 0) {
            var center = get('mood_center', 500);
            var step = get('mood_regression_step_base', 10) * getComposureMoodFactor();
            var delta = state.mood > center ? -step : (state.mood < center ? step : 0);
            state.mood = clamp(Math.round(state.mood + delta), get('mood_min', 0), get('mood_max', 1000));
        }

        // ---------- 营养衰减（每 25 tick） ----------
        var nutInterval = get('nutrition_tick_decay_interval', 25);
        if (tick % nutInterval === 0) {
            var nutDecay = get('nutrition_tick_decay_amount', 1);
            state.nutrition = clamp(state.nutrition - nutDecay, get('nutrition_min', 0), get('nutrition_max', 100));
        }

        if (typeof global !== 'undefined' && global.InventoryEquipment && typeof global.InventoryEquipment.tickHubActionCooldowns === 'function') {
            global.InventoryEquipment.tickHubActionCooldowns(1);
        }

        // ---------- 底气恢复（行气/调息激活时替代自然恢复） ----------
        var dMax = Math.max(0, state.diqi_max_effective);
        if (dMax > 0) {
            if (state.is_sit_meditation_active) {
                if (state.sit_meditation_interrupt_this_tick) {
                    state.sit_meditation_interrupt_this_tick = false;
                    state.last_sit_meditation_gain = 0;
                } else {
                    // 调息可在 current>=max 时继续累积，用于触发“烧蓝换上限”与封顶溢出区间。
                    applySitMeditationDiqiOnce();
                }
            } else if (state.diqi_current < dMax) {
                var breath = Math.max(0, (typeof getBreathActual === 'function' ? getBreathActual() : 10));
                var coef = get('breath_diqi_stamina_coef', 0.02);
                var dRegen = (get('diqi_tick_regen_base', 0.12) + coef * breath) * getDiqiRegenMultiplier();
                state.diqi_current = round1(clamp(state.diqi_current + dRegen, 0, dMax));
            }
        }
        if (!state.is_sit_meditation_active) state.sit_meditation_interrupt_this_tick = false;

        return result;
    }

    function getStamina() { return state.stamina; }
    function getStaminaMax() { return get('stamina_max', 100); }
    function getSatiety() { return state.satiety; }
    function getThirst() { return state.thirst; }
    function getEnergy() { return state.energy; }
    function getEnergyMax() { return get('energy_max', 100); }
    function getMood() { return state.mood; }
    function getComposure() { return state.composure; }
    function getNutrition() { return state.nutrition; }
    function getWeightKg() { return state.weight_kg; }
    function isDead() { return state.isDead; }
    function isComa() { return state.isComa; }

    global.Survival = {
        setConfig: setConfig,
        setCharacterCallbacks: setCharacterCallbacks,
        getState: getState,
        setState: setState,
        advanceTick: advanceTick,
        canPerformStaminaOrEnergyAction: canPerformStaminaOrEnergyAction,
        getStaminaRegenMultiplier: getStaminaRegenMultiplier,
        getDiqiRegenMultiplier: getDiqiRegenMultiplier,
        getSatietyZone: getSatietyZone,
        getNutritionTier: getNutritionTier,
        getMoodLifeSkillMultiplier: getMoodLifeSkillMultiplier,
        getComposureMoodFactor: getComposureMoodFactor,
        addSatiety: addSatiety,
        addThirst: addThirst,
        consumeStamina: consumeStamina,
        consumeEnergy: consumeEnergy,
        addNutrition: addNutrition,
        setResting: setResting,
        getStamina: getStamina,
        getStaminaMax: getStaminaMax,
        getSatiety: getSatiety,
        getThirst: getThirst,
        getEnergy: getEnergy,
        getEnergyMax: getEnergyMax,
        getMood: getMood,
        getComposure: getComposure,
        getNutrition: getNutrition,
        getWeightKg: getWeightKg,
        isDead: isDead,
        isComa: isComa,

        getQiLiMax: getQiLiMax,
        refreshDiqiMaxFromBreath: refreshDiqiMaxFromBreath,
        initBattleResourcesFull: initBattleResourcesFull,
        addQiLi: addQiLi,
        consumeQiLi: consumeQiLi,
        consumeDiqi: consumeDiqi,
        getDiqiShieldRemaining: getDiqiShieldRemaining,
        setDiqiShieldRemaining: setDiqiShieldRemaining,
        breakDiqiShieldIfDepleted: breakDiqiShieldIfDepleted,
        computeDiqiMaxFromBreath: computeDiqiCapLimitFromBreath,
        computeDiqiCapLimitFromBreath: computeDiqiCapLimitFromBreath,
        addDiqiCurrent: addDiqiCurrent,
        changeDiqi: changeDiqi,
        applyDiqiShieldToDamage: applyDiqiShieldToDamage,
        addEnergy: addEnergy,
        applySitMeditationDiqiOnce: applySitMeditationDiqiOnce,
        setSitMeditationActive: setSitMeditationActive,
        isSitMeditationActive: isSitMeditationActive,
        getLastSitMeditationGain: getLastSitMeditationGain,
        interruptSitMeditationThisTick: interruptSitMeditationThisTick,
        setDiqiCapLimitFlatBonus: setDiqiCapLimitFlatBonus,
        removeDiqiCapLimitFlatBonus: removeDiqiCapLimitFlatBonus
    };
})(typeof window !== 'undefined' ? window : this);
