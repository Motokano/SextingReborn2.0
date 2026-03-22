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
        isDead: false,
        isComa: false,

        /** 战斗：气力（快耗快消）、底气、底气护体剩余盾量（见 07 / 11 基本呼吸法） */
        qi_li_current: 100,
        diqi_current: 0,
        diqi_max_effective: 0,
        diqi_shield_remaining: 0
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
            isDead: state.isDead,
            isComa: state.isComa,

            qi_li_current: state.qi_li_current,
            qi_li_max: getQiLiMax(),
            diqi_current: state.diqi_current,
            diqi_max: state.diqi_max_effective,
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
        if (s.isDead !== undefined) state.isDead = !!s.isDead;
        if (s.isComa !== undefined) state.isComa = !!s.isComa;

        var diqiCapLoad = Math.max(0, Math.round(Number(s.diqi_max != null ? s.diqi_max : s.diqi_max_effective) || 0));
        if (diqiCapLoad > 0) state.diqi_max_effective = diqiCapLoad;
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

    /** 由先天+后天呼吸推导底气上限缓存；实际 current 在 refresh 时夹紧 */
    function computeDiqiMaxFromBreath(breathEffective) {
        var b = Math.max(0, parseInt(breathEffective, 10) || 0);
        var base = get('diqi_max_base', 40);
        var per = get('diqi_max_per_breath_effective', 2);
        return Math.max(0, Math.floor(base + b * per));
    }

    /**
     * 属性重算后调用：更新 diqi 上限并夹紧 current；护体盾不超过 current 逻辑在扣盾侧处理
     */
    function refreshDiqiMaxFromBreath(breathEffective) {
        var mx = computeDiqiMaxFromBreath(breathEffective);
        state.diqi_max_effective = mx;
        state.diqi_current = round1(clamp(state.diqi_current, 0, mx));
        if (state.diqi_shield_remaining > state.diqi_current && state.diqi_shield_remaining > 0) {
            state.diqi_shield_remaining = Math.min(state.diqi_shield_remaining, Math.floor(state.diqi_current));
        }
    }

    /**
     * 调息 / 行气单 tick：ceil(diqi_max×5%)×底气恢复倍率，至少 1；夹紧到 diqi_max（满额行气溢出见 06，后续可扩展）。
     * @returns {number} 实际增加的底气量
     */
    function applySitMeditationDiqiOnce() {
        var mx = Math.max(0, state.diqi_max_effective);
        if (mx <= 0) return 0;
        var base = Math.max(1, Math.ceil(mx * 0.05));
        var R = Math.max(1, Math.ceil(base * getDiqiRegenMultiplier()));
        var before = state.diqi_current;
        state.diqi_current = round1(clamp(before + R, 0, mx));
        return Math.max(0, state.diqi_current - before);
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

        // ---------- 底气自然恢复（战斗外资源；与营养等同一 tick） ----------
        var dMax = Math.max(0, state.diqi_max_effective);
        if (dMax > 0 && state.diqi_current < dMax) {
            var dRegen = get('diqi_tick_regen_base', 0.12) * getDiqiRegenMultiplier();
            state.diqi_current = round1(clamp(state.diqi_current + dRegen, 0, dMax));
        }

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
        computeDiqiMaxFromBreath: computeDiqiMaxFromBreath,
        addDiqiCurrent: addDiqiCurrent,
        applyDiqiShieldToDamage: applyDiqiShieldToDamage,
        addEnergy: addEnergy,
        applySitMeditationDiqiOnce: applySitMeditationDiqiOnce
    };
})(typeof window !== 'undefined' ? window : this);
