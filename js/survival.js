/**
 * 生存属性模块 - 按设计文档 06-survival.md 实装
 * 负责：饱食、饮水、体力、精力、心情、定力、营养、体温、体重、肮脏度及每 tick 结算
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
        dirtyness: 0,
        body_temperature: 37,
        body_temperature_standard: 37,
        weight_kg: 60,

        tickCount: 0,
        starvationTicks: 0,
        thirstDeathTicks: 0,
        staminaZeroTicks: 0,
        overfedTicks: 0,
        severeHungerTicks: 0,
        satietyWeightLossBuffId: '',
        isResting: false,
        /** 常态体力恢复动作开关：默认关闭，需外部动作显式开启 */
        is_stamina_regen_action_active: false,
        is_sit_meditation_active: false,
        isDead: false,
        deathReason: null,
        isComa: false,

        /** 战斗：气力（快耗快消）、底气、底气护体剩余盾量（见 07 / 11 基本呼吸法） */
        qi_li_current: 100,
        diqi_current: 0,
        diqi_cap_limit: 0,
        diqi_cap_limit_flat_bonuses: {},
        diqi_max_effective: 0,
        diqi_shield_remaining: 0,
        last_sit_meditation_gain: 0,
        sit_meditation_interrupt_this_tick: false,
        /** 自上一次 advanceTick 起是否发生过 consumeQiLi 的实际扣减（用于 07 空闲回气） */
        qi_li_spent_this_tick: false
    };

    /** 从外部获取呼吸实际值、凝气加成（可选），用于体力/底气恢复公式 */
    var getBreathActual = function () { return 10; };
    var getNingqiBonus = function () { return 0; };
    var lastMoodRangeId = null;
    var lastDirtynessRangeId = null;
    var lastSatietyRangeId = null;
    var lastThirstRangeId = null;
    var lastBmiTierId = null;
    var runtimeHeightCm = 178;
    var MOOD_RANGE_BUFF_IDS = [
        'survival_mood_low',
        'survival_mood_high'
    ];
    var SATIETY_RANGE_BUFF_IDS = [
        'survival_satiety_starving_zero',
        'survival_satiety_extreme_hunger',
        'survival_satiety_heavy_hunger',
        'survival_satiety_light_hunger',
        'survival_satiety_satiated',
        'survival_satiety_overeat',
        'survival_satiety_stuffed'
    ];
    var THIRST_RANGE_BUFF_IDS = [
        'survival_thirst_dehydrated_zero',
        'survival_thirst_dry',
        'survival_thirst_hydrated'
    ];
    var TEMP_RANGE_BUFF_IDS = [
        'survival_temp_extreme_cold',
        'survival_temp_extreme_hot'
    ];
    var DIRTYNESS_RANGE_BUFF_IDS = [
        'survival_dirty_messy',
        'survival_dirty_clean_refreshing'
    ];
    var BMI_TIER_BUFF_IDS = [
        'survival_bmi_underweight',
        'survival_bmi_normal',
        'survival_bmi_overweight',
        'survival_bmi_obese'
    ];
    var isEmittingSurvivalState = false;

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

    function getHeightCm() {
        var cfgHeight = Number(get('height_cm', get('height_cm_default', runtimeHeightCm)));
        var h = isFinite(cfgHeight) && cfgHeight > 0 ? cfgHeight : Number(runtimeHeightCm);
        if (!isFinite(h) || h <= 0) h = 178;
        return clamp(Math.round(h), 140, 210);
    }

    function computeBmiByWeightAndHeight(weightKg, heightCm) {
        var w = Number(weightKg);
        var h = Number(heightCm);
        if (!isFinite(w) || w <= 0) return 0;
        if (!isFinite(h) || h <= 0) return 0;
        var hm = h / 100;
        if (!isFinite(hm) || hm <= 0) return 0;
        return round1(w / (hm * hm));
    }

    function getBmiTierByValue(bmi) {
        var b = Number(bmi);
        if (!isFinite(b) || b <= 0) b = computeBmiByWeightAndHeight(state.weight_kg, getHeightCm());
        if (b < 18.5) return 'underweight';
        if (b < 25.0) return 'normal';
        if (b < 30.0) return 'overweight';
        return 'obese';
    }

    function getBmiTierTag(tierId) {
        if (tierId === 'underweight') return 'bmi_underweight';
        if (tierId === 'normal') return 'bmi_normal';
        if (tierId === 'overweight') return 'bmi_overweight';
        return 'bmi_obese';
    }

    function getBMI() {
        return computeBmiByWeightAndHeight(state.weight_kg, getHeightCm());
    }

    function emitBmiTierChangedEvent(oldTier, newTier, bmi) {
        if (!global || !global.BuffSystem || typeof global.BuffSystem.triggerBuffPipeline !== 'function') return;
        global.BuffSystem.triggerBuffPipeline({
            event_kind: 'survival',
            event_name: 'bmi_tier_changed',
            tags: [getBmiTierTag(newTier)],
            actor_id: 'player',
            owner_id: 'player',
            tick: state.tickCount,
            payload: {
                bmi: round1(Number(bmi) || 0),
                old_tier: oldTier || null,
                new_tier: newTier || null
            }
        });
    }

    function getBmiTierBuffId(tierId) {
        if (tierId === 'underweight') return 'survival_bmi_underweight';
        if (tierId === 'normal') return 'survival_bmi_normal';
        if (tierId === 'overweight') return 'survival_bmi_overweight';
        if (tierId === 'obese') return 'survival_bmi_obese';
        return '';
    }

    function syncBmiTierState() {
        var bmi = getBMI();
        var tier = getBmiTierByValue(bmi);
        var prevTier = lastBmiTierId;
        if (global && global.BuffSystem) {
            var Buff = global.BuffSystem;
            if (typeof Buff.applyBuff === 'function' && typeof Buff.removeBuffByBuffId === 'function') {
                var targetBuffId = getBmiTierBuffId(tier);
                for (var i = 0; i < BMI_TIER_BUFF_IDS.length; i++) {
                    var bid = BMI_TIER_BUFF_IDS[i];
                    if (bid === targetBuffId) continue;
                    if (typeof Buff.hasBuffByBuffId !== 'function' || Buff.hasBuffByBuffId('player', bid)) {
                        Buff.removeBuffByBuffId('player', bid);
                    }
                }
                if (targetBuffId) {
                    Buff.applyBuff('player', targetBuffId, 'survival_bmi_listener', { tick: getBuffApplyTick(), bmi_tier: tier });
                }
            }
        }
        if (prevTier !== tier) {
            emitBmiTierChangedEvent(prevTier, tier, bmi);
        }
        lastBmiTierId = tier;
        return tier;
    }

    function setConfig(config) {
        if (config && typeof config === 'object') {
            var k;
            for (k in config) if (config.hasOwnProperty(k)) cfg[k] = config[k];
        }
    }

    function getConfigValue(key, def) {
        if (key == null) return def;
        return get(String(key), def);
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
            dirtyness: state.dirtyness,
            body_temperature: state.body_temperature,
            body_temperature_standard: state.body_temperature_standard,
            weight_kg: state.weight_kg,
            height_cm: getHeightCm(),
            tickCount: state.tickCount,
            starvationTicks: state.starvationTicks,
            thirstDeathTicks: state.thirstDeathTicks,
            staminaZeroTicks: state.staminaZeroTicks,
            overfedTicks: state.overfedTicks,
            severeHungerTicks: state.severeHungerTicks,
            satietyWeightLossBuffId: state.satietyWeightLossBuffId,
            isResting: state.isResting,
            is_stamina_regen_action_active: !!state.is_stamina_regen_action_active,
            is_sit_meditation_active: !!state.is_sit_meditation_active,
            isDead: state.isDead,
            deathReason: state.deathReason || null,
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
        var beforeSnapshot = buildSurvivalStateSnapshot();
        // tick-based internal counters (for deterministic progression after reload)
        if (s.tickCount !== undefined) state.tickCount = Math.max(0, Math.floor(Number(s.tickCount) || 0));
        if (s.starvationTicks !== undefined) state.starvationTicks = Math.max(0, Math.floor(Number(s.starvationTicks) || 0));
        if (s.thirstDeathTicks !== undefined) state.thirstDeathTicks = Math.max(0, Math.floor(Number(s.thirstDeathTicks) || 0));
        if (s.staminaZeroTicks !== undefined) state.staminaZeroTicks = Math.max(0, Math.floor(Number(s.staminaZeroTicks) || 0));
        if (s.overfedTicks !== undefined) state.overfedTicks = Math.max(0, Math.floor(Number(s.overfedTicks) || 0));
        if (s.severeHungerTicks !== undefined) state.severeHungerTicks = Math.max(0, Math.floor(Number(s.severeHungerTicks) || 0));
        if (s.satietyWeightLossBuffId !== undefined) state.satietyWeightLossBuffId = String(s.satietyWeightLossBuffId || '');

        if (s.satiety !== undefined) state.satiety = round1(clamp(s.satiety, 0, get('satiety_overcap_max', 120)));
        if (s.thirst !== undefined) state.thirst = round1(clamp(s.thirst, 0, get('thirst_max', 100)));
        if (s.stamina !== undefined) state.stamina = round1(clamp(s.stamina, 0, get('stamina_max', 100)));
        if (s.energy !== undefined) state.energy = round1(clamp(s.energy, 0, get('energy_max', 100)));
        if (s.mood !== undefined) state.mood = clamp(Math.round(s.mood), get('mood_min', 0), get('mood_max', 1000));
        if (s.composure !== undefined) state.composure = clamp(Math.round(s.composure), get('composure_min', 0), get('composure_max', 20));
        if (s.sexual_ability !== undefined) state.sexual_ability = clamp(Math.round(s.sexual_ability), get('sexual_ability_min', 0), get('sexual_ability_max', 100));
        if (s.gender_value !== undefined) state.gender_value = clamp(Math.round(s.gender_value), get('gender_value_min', 0), get('gender_value_max', 100));
        if (s.nutrition !== undefined) state.nutrition = clamp(Math.round(s.nutrition), get('nutrition_min', 0), get('nutrition_max', 100));
        if (s.dirtyness !== undefined) state.dirtyness = clamp(Math.round(s.dirtyness), get('dirtyness_min', 0), get('dirtyness_max', 100));
        if (s.body_temperature !== undefined) state.body_temperature = round1(clamp(Number(s.body_temperature) || 0, get('body_temperature_min', 30), get('body_temperature_max', 42)));
        if (s.body_temperature_standard !== undefined) state.body_temperature_standard = round1(clamp(Number(s.body_temperature_standard) || 0, get('body_temperature_min', 30), get('body_temperature_max', 42)));
        if (s.weight_kg !== undefined) state.weight_kg = Math.max(0, s.weight_kg);
        if (s.height_cm !== undefined) {
            var hcm = Number(s.height_cm);
            if (isFinite(hcm) && hcm > 0) runtimeHeightCm = clamp(Math.round(hcm), 140, 210);
        }
        if (s.isResting !== undefined) state.isResting = !!s.isResting;
        if (s.is_stamina_regen_action_active !== undefined) state.is_stamina_regen_action_active = !!s.is_stamina_regen_action_active;
        if (s.is_sit_meditation_active !== undefined) state.is_sit_meditation_active = !!s.is_sit_meditation_active;
        if (s.isDead !== undefined) state.isDead = !!s.isDead;
        if (s.deathReason !== undefined) state.deathReason = s.deathReason == null ? null : String(s.deathReason || '');
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
        syncStaminaExhaustedBuff();
        syncEnergyDepletedBuff();
        syncNutritionStateBuff();
        syncSatietyStateBuff();
        syncThirstStateBuff();
        syncMoodStateBuff();
        syncExtremeTemperatureBuff(getExtremeTemperatureState(resolveAmbientTemperatureForCurrentMap(), state.body_temperature_standard, computeTempThresholdShiftByWeatherResist()));
        syncDirtynessStateBuff();
        syncBmiTierState();
        emitSurvivalStateChangedIfNeeded('set_state', beforeSnapshot, null);
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
        state.qi_li_spent_this_tick = false;
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
        if (take > 0) state.qi_li_spent_this_tick = true;
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

    function getSatietyRangeByValue(satietyValue) {
        var s = Number(satietyValue);
        if (!isFinite(s)) s = Number(state.satiety) || 0;
        s = round1(clamp(s, 0, get('satiety_overcap_max', 150)));
        if (s <= 0) return 'starving_zero';
        if (s < get('satiety_buff_tier_heavy_hunger_min', 10)) return 'extreme_hunger';
        if (s < get('satiety_buff_tier_light_hunger_min', 30)) return 'heavy_hunger';
        if (s < get('satiety_buff_tier_satiated_min', 60)) return 'light_hunger';
        if (s < get('satiety_buff_tier_overeat_min', 100.1)) return 'satiated';
        if (s < get('satiety_buff_tier_stuffed_min', 120.1)) return 'overeat';
        return 'stuffed';
    }

    function getSatietyRangeBuffId(rangeId) {
        if (rangeId === 'starving_zero') return 'survival_satiety_starving_zero';
        if (rangeId === 'extreme_hunger') return 'survival_satiety_extreme_hunger';
        if (rangeId === 'heavy_hunger') return 'survival_satiety_heavy_hunger';
        if (rangeId === 'light_hunger') return 'survival_satiety_light_hunger';
        if (rangeId === 'satiated') return 'survival_satiety_satiated';
        if (rangeId === 'overeat') return 'survival_satiety_overeat';
        if (rangeId === 'stuffed') return 'survival_satiety_stuffed';
        return '';
    }

    function syncSatietyStateBuff() {
        if (!global || !global.BuffSystem) return '';
        var Buff = global.BuffSystem;
        if (typeof Buff.applyBuff !== 'function' || typeof Buff.removeBuffByBuffId !== 'function') return '';
        var targetRange = getSatietyRangeByValue(state.satiety);
        var targetBuffId = getSatietyRangeBuffId(targetRange);
        var i;
        for (i = 0; i < SATIETY_RANGE_BUFF_IDS.length; i++) {
            var bid = SATIETY_RANGE_BUFF_IDS[i];
            if (bid === targetBuffId) continue;
            if (typeof Buff.hasBuffByBuffId !== 'function' || Buff.hasBuffByBuffId('player', bid)) {
                Buff.removeBuffByBuffId('player', bid);
            }
        }
        if (targetBuffId) {
            Buff.applyBuff('player', targetBuffId, 'survival_satiety_listener', { tick: getBuffApplyTick() });
        }
        lastSatietyRangeId = targetRange;
        return targetRange;
    }

    function getThirstRangeByValue(thirstValue) {
        var t = Number(thirstValue);
        if (!isFinite(t)) t = Number(state.thirst) || 0;
        t = round1(clamp(t, 0, get('thirst_max', 100)));
        if (t <= 0) return 'dehydrated_zero';
        if (t < get('thirst_buff_tier_hydrated_min', 40.1)) return 'dry';
        return 'hydrated';
    }

    function getThirstRangeBuffId(rangeId) {
        if (rangeId === 'dehydrated_zero') return 'survival_thirst_dehydrated_zero';
        if (rangeId === 'dry') return 'survival_thirst_dry';
        if (rangeId === 'hydrated') return 'survival_thirst_hydrated';
        return '';
    }

    function syncThirstStateBuff() {
        if (!global || !global.BuffSystem) return '';
        var Buff = global.BuffSystem;
        if (typeof Buff.applyBuff !== 'function' || typeof Buff.removeBuffByBuffId !== 'function') return '';
        var targetRange = getThirstRangeByValue(state.thirst);
        var targetBuffId = getThirstRangeBuffId(targetRange);
        var i;
        for (i = 0; i < THIRST_RANGE_BUFF_IDS.length; i++) {
            var bid = THIRST_RANGE_BUFF_IDS[i];
            if (bid === targetBuffId) continue;
            if (typeof Buff.hasBuffByBuffId !== 'function' || Buff.hasBuffByBuffId('player', bid)) {
                Buff.removeBuffByBuffId('player', bid);
            }
        }
        if (targetBuffId) {
            Buff.applyBuff('player', targetBuffId, 'survival_thirst_listener', { tick: getBuffApplyTick() });
        }
        lastThirstRangeId = targetRange;
        return targetRange;
    }

    /** 兼容老入口：映射到 Buff 分段语义 */
    function getSatietyZone() {
        var range = getSatietyRangeFromBuffFirst() || getSatietyRangeByValue(state.satiety);
        if (range === 'satiated' || range === 'overeat' || range === 'stuffed') return 'normal';
        if (range === 'light_hunger') return 'mild';
        if (range === 'heavy_hunger') return 'moderate';
        if (range === 'extreme_hunger') return 'severe';
        return 'starvation';
    }

    function hasComaBuffActive() {
        if (!global || !global.BuffSystem || typeof global.BuffSystem.hasBuffByBuffId !== 'function') return !!state.isComa;
        return !!global.BuffSystem.hasBuffByBuffId('player', 'survival_coma');
    }

    function clearStaminaExhaustedBuffIfAny() {
        if (!global || !global.BuffSystem || typeof global.BuffSystem.removeBuffByBuffId !== 'function') return;
        global.BuffSystem.removeBuffByBuffId('player', 'survival_stamina_exhausted');
    }

    function getBuffSystem() {
        return (global && global.BuffSystem) ? global.BuffSystem : null;
    }

    function getBuffApplyTick() {
        if (global && global.GameTime && typeof global.GameTime.getState === 'function') {
            var ts = global.GameTime.getState();
            if (ts && typeof ts.totalTicks === 'number' && isFinite(ts.totalTicks)) return ts.totalTicks;
        }
        return state.tickCount;
    }

    function hasBuffDebugEnabled() {
        try {
            return !!(global && global.BuffDebug && global.BuffDebug.buff_debug_enabled);
        } catch (e) {
            return false;
        }
    }

    function debugTempLog(msg) {
        if (!hasBuffDebugEnabled()) return;
        var text = '[TEMP] ' + String(msg || '');
        if (global && global.GameLog && typeof global.GameLog.log === 'function') {
            global.GameLog.log(text, 'system');
        } else if (typeof console !== 'undefined' && typeof console.log === 'function') {
            console.log(text);
        }
    }

    function hasActiveBuffById(buffId) {
        if (!buffId) return false;
        var Buff = getBuffSystem();
        if (!Buff || typeof Buff.hasBuffByBuffId !== 'function') return false;
        return !!Buff.hasBuffByBuffId('player', String(buffId));
    }

    function hasAnyActiveBuff(buffIds) {
        if (!Array.isArray(buffIds) || !buffIds.length) return false;
        for (var i = 0; i < buffIds.length; i++) {
            if (hasActiveBuffById(buffIds[i])) return true;
        }
        return false;
    }

    function getFirstActiveBuff(buffIds) {
        if (!Array.isArray(buffIds) || !buffIds.length) return '';
        for (var i = 0; i < buffIds.length; i++) {
            var bid = String(buffIds[i] || '');
            if (bid && hasActiveBuffById(bid)) return bid;
        }
        return '';
    }

    function getSatietyRangeFromBuffFirst() {
        var bid = getFirstActiveBuff([
            'survival_satiety_starving_zero',
            'survival_satiety_extreme_hunger',
            'survival_satiety_heavy_hunger',
            'survival_satiety_light_hunger',
            'survival_satiety_satiated',
            'survival_satiety_overeat',
            'survival_satiety_stuffed'
        ]);
        if (!bid) return '';
        if (bid === 'survival_satiety_starving_zero') return 'starving_zero';
        if (bid === 'survival_satiety_extreme_hunger') return 'extreme_hunger';
        if (bid === 'survival_satiety_heavy_hunger') return 'heavy_hunger';
        if (bid === 'survival_satiety_light_hunger') return 'light_hunger';
        if (bid === 'survival_satiety_satiated') return 'satiated';
        if (bid === 'survival_satiety_overeat') return 'overeat';
        if (bid === 'survival_satiety_stuffed') return 'stuffed';
        return '';
    }

    function inClosedOpenRange(value, minInclusive, maxExclusive) {
        return value >= minInclusive && value < maxExclusive;
    }

    function getNutritionRangeByValue(nutritionValue) {
        var n = Number(nutritionValue);
        if (!isFinite(n)) n = Number(state.nutrition) || 0;
        n = clamp(Math.round(n), get('nutrition_min', 0), get('nutrition_max', 100));
        var malMaxExclusive = Number(get('nutrition_malnutrition_max', 10)) + 1;
        var normalMin = Number(get('nutrition_normal_min', 11));
        var normalMaxExclusive = Number(get('nutrition_normal_max', 30)) + 1;
        var abundantMin = Number(get('nutrition_abundant_min', 31));
        var abundantMaxExclusive = Number(get('nutrition_abundant_max', 70)) + 1;
        var peakMin = Number(get('nutrition_peak_min', 71));
        var peakMaxExclusive = Number(get('nutrition_max', 100)) + 1;
        // 闭开区间：[min, max)
        if (inClosedOpenRange(n, get('nutrition_min', 0), malMaxExclusive)) return 'malnutrition';
        if (inClosedOpenRange(n, normalMin, normalMaxExclusive)) return 'normal';
        if (inClosedOpenRange(n, abundantMin, abundantMaxExclusive)) return 'abundant';
        if (inClosedOpenRange(n, peakMin, peakMaxExclusive)) return 'peak';
        if (n < normalMin) return 'malnutrition';
        if (n < abundantMin) return 'normal';
        if (n < peakMin) return 'abundant';
        return 'peak';
    }

    function getNutritionTierBuffIdByRangeId(rangeId) {
        if (rangeId === 'malnutrition') return 'survival_nutrition_malnutrition';
        if (rangeId === 'normal') return 'survival_nutrition_normal';
        if (rangeId === 'abundant') return 'survival_nutrition_abundant';
        if (rangeId === 'peak') return 'survival_nutrition_peak';
        return '';
    }

    function getMoodRangeByValue(moodValue) {
        var m = Number(moodValue);
        if (!isFinite(m)) m = Number(state.mood) || 0;
        m = clamp(Math.round(m), get('mood_min', 0), get('mood_max', 1000));
        // 若分段阈值缺失，回退到 0~300 坏心情、701~1000 好心情、中间无状态 Buff。
        var lowMax = Number(get('mood_low_max', 300));
        var normalMin = Number(get('mood_normal_min', 301));
        var normalMax = Number(get('mood_normal_max', 700));
        var highMin = Number(get('mood_high_min', 701));

        if (!isFinite(lowMax)) lowMax = 300;
        if (!isFinite(normalMin)) normalMin = lowMax + 1;
        if (!isFinite(normalMax)) normalMax = 700;
        if (!isFinite(highMin)) highMin = normalMax + 1;

        if (m <= lowMax) return 'low';
        if (m >= highMin) return 'high';
        if (m >= normalMin && m <= normalMax) return 'normal';
        if (m < normalMin) return 'low';
        return 'high';
    }

    function getMoodRangeBuffId(rangeId) {
        if (rangeId === 'low') return 'survival_mood_low';
        if (rangeId === 'high') return 'survival_mood_high';
        return '';
    }

    function emitMoodStateChangedEvent(oldRangeId, newRangeId) {
        if (!global || !global.BuffSystem || typeof global.BuffSystem.triggerBuffPipeline !== 'function') return;
        global.BuffSystem.triggerBuffPipeline({
            event_kind: 'survival',
            event_name: 'mood_state_changed',
            tags: ['survival', 'mood', 'state', 'player'],
            actor_id: 'player',
            owner_id: 'player',
            tick: state.tickCount,
            payload: {
                old_range: oldRangeId || null,
                new_range: newRangeId || null,
                mood: state.mood
            }
        });
    }

    function buildSurvivalStateSnapshot() {
        return {
            satiety: Number(state.satiety),
            thirst: Number(state.thirst),
            stamina: Number(state.stamina),
            energy: Number(state.energy),
            mood: Number(state.mood),
            nutrition: Number(state.nutrition),
            dirtyness: Number(state.dirtyness),
            body_temperature: Number(state.body_temperature),
            body_temperature_standard: Number(state.body_temperature_standard),
            isDead: !!state.isDead,
            isComa: !!state.isComa
        };
    }

    function diffSnapshotKeys(beforeSnapshot, afterSnapshot) {
        var changed = [];
        if (!beforeSnapshot || !afterSnapshot) return changed;
        var keys = Object.keys(afterSnapshot);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (beforeSnapshot[k] !== afterSnapshot[k]) changed.push(k);
        }
        return changed;
    }

    function emitSurvivalStateChangedIfNeeded(reason, beforeSnapshot, extraPayload) {
        if (!global || !global.BuffSystem || typeof global.BuffSystem.triggerBuffPipeline !== 'function') return;
        if (isEmittingSurvivalState) return;
        var afterSnapshot = buildSurvivalStateSnapshot();
        var changed = diffSnapshotKeys(beforeSnapshot || {}, afterSnapshot);
        if (!changed.length) return;
        isEmittingSurvivalState = true;
        try {
            global.BuffSystem.triggerBuffPipeline({
                event_kind: 'survival',
                event_name: 'survival_state_changed',
                tags: ['survival', 'state', 'player', 'survival_state'],
                actor_id: 'player',
                owner_id: 'player',
                tick: state.tickCount,
                payload: {
                    reason: reason || 'changed',
                    changed_fields: changed,
                    before: beforeSnapshot || null,
                    after: afterSnapshot,
                    extra: extraPayload || null
                }
            });
        } finally {
            isEmittingSurvivalState = false;
        }
    }

    function syncMoodStateBuff() {
        var targetRange = getMoodRangeByValue(state.mood);
        var targetBuffId = getMoodRangeBuffId(targetRange);
        var prevRange = lastMoodRangeId;
        if (!global || !global.BuffSystem) {
            lastMoodRangeId = targetRange;
            return targetRange;
        }
        var Buff = global.BuffSystem;
        if (typeof Buff.applyBuff !== 'function' || typeof Buff.removeBuffByBuffId !== 'function') {
            lastMoodRangeId = targetRange;
            return targetRange;
        }
        var i;
        for (i = 0; i < MOOD_RANGE_BUFF_IDS.length; i++) {
            var bid = MOOD_RANGE_BUFF_IDS[i];
            if (bid === targetBuffId) continue;
            if (typeof Buff.hasBuffByBuffId !== 'function' || Buff.hasBuffByBuffId('player', bid)) {
                Buff.removeBuffByBuffId('player', bid);
            }
        }
        if (targetBuffId) {
            Buff.applyBuff('player', targetBuffId, 'survival_mood_listener', { tick: getBuffApplyTick(), mood_range: targetRange });
        }
        if (prevRange !== targetRange) {
            emitMoodStateChangedEvent(prevRange, targetRange);
        }
        lastMoodRangeId = targetRange;
        return targetRange;
    }

    function getBodyTemperatureStandard() {
        return round1(clamp(Number(state.body_temperature_standard) || 0, get('body_temperature_min', 30), get('body_temperature_max', 42)));
    }

    function getBodyTemperature() {
        return round1(clamp(Number(state.body_temperature) || 0, get('body_temperature_min', 30), get('body_temperature_max', 42)));
    }

    function resolveAmbientTemperatureForCurrentMap() {
        var E = global && global.GameEngine;
        if (!E || typeof E.getMap !== 'function') return null;
        var map = E.getMap();
        if (!map || typeof map !== 'object') return null;
        var season = 'spring';
        function parseAmbientValue(raw) {
            if (raw == null) return null;
            if (typeof raw === 'string') {
                var s = raw.trim();
                if (!s) return null;
                var ns = Number(s);
                return isFinite(ns) ? ns : null;
            }
            var n = Number(raw);
            return isFinite(n) ? n : null;
        }
        if (map.ambient_temperature_by_season && typeof map.ambient_temperature_by_season === 'object') {
            var bySeason = map.ambient_temperature_by_season;
            if (bySeason[season] != null) {
                var n1 = parseAmbientValue(bySeason[season]);
                if (n1 != null) return n1;
            }
        }
        if (map.ambient_temperature != null) {
            var n2 = parseAmbientValue(map.ambient_temperature);
            if (n2 != null) return n2;
        }
        return null;
    }

    function getWeatherResistLevel() {
        if (!global || !global.InventoryEquipment || typeof global.InventoryEquipment.getSkillLevel !== 'function') return 0;
        return Math.max(0, Math.floor(Number(global.InventoryEquipment.getSkillLevel('survival_weather_resist')) || 0));
    }

    function computeTempThresholdShiftByWeatherResist() {
        var L = Math.min(get('weather_resist_max_level', 100), getWeatherResistLevel());
        return Number(get('weather_resist_threshold_delta_per_level', 0.1)) * L;
    }

    function getExtremeTemperatureState(ambientE, standardS, thresholdShiftR) {
        if (ambientE == null) return 'comfort';
        if (!isFinite(Number(ambientE))) return 'comfort';
        var E = Number(ambientE);
        var S = Number(standardS);
        var R = Number(thresholdShiftR) || 0;
        var coldBase = Number(get('body_temperature_extreme_cold_base_delta', 15));
        var hotBase = Number(get('body_temperature_extreme_hot_base_delta', 12));
        if (E < (S - (coldBase + R))) return 'cold';
        if (E > (S + (hotBase + R))) return 'hot';
        return 'comfort';
    }

    function emitBodyTemperatureStateChangedEvent(oldRangeId, newRangeId, ambientE, standardS, thresholdShiftR) {
        if (!global || !global.BuffSystem || typeof global.BuffSystem.triggerBuffPipeline !== 'function') return;
        var tag = 'temp_comfort';
        if (newRangeId === 'cold') tag = 'temp_extreme_cold';
        else if (newRangeId === 'hot') tag = 'temp_extreme_hot';
        global.BuffSystem.triggerBuffPipeline({
            event_kind: 'survival',
            event_name: 'body_temperature_state_changed',
            tags: ['survival', 'temperature', 'state', 'player', tag],
            actor_id: 'player',
            owner_id: 'player',
            tick: state.tickCount,
            payload: {
                old_range: oldRangeId || null,
                new_range: newRangeId || null,
                body_temperature: state.body_temperature,
                body_temperature_standard: standardS,
                ambient_temperature: ambientE,
                weather_resist_shift: thresholdShiftR
            }
        });
    }

    function syncExtremeTemperatureBuff(tempState, ambientE, standardS, thresholdShiftR) {
        var targetRange = tempState || 'comfort';
        var targetBuffId = '';
        if (targetRange === 'cold') targetBuffId = 'survival_temp_extreme_cold';
        else if (targetRange === 'hot') targetBuffId = 'survival_temp_extreme_hot';
        if (!global || !global.BuffSystem) return targetRange;
        var Buff = global.BuffSystem;
        if (typeof Buff.applyBuff !== 'function' || typeof Buff.removeBuffByBuffId !== 'function') return targetRange;
        var i;
        for (i = 0; i < TEMP_RANGE_BUFF_IDS.length; i++) {
            var bid = TEMP_RANGE_BUFF_IDS[i];
            if (bid === targetBuffId) continue;
            if (typeof Buff.hasBuffByBuffId !== 'function' || Buff.hasBuffByBuffId('player', bid)) {
                Buff.removeBuffByBuffId('player', bid);
            }
        }
        if (targetBuffId) {
            Buff.applyBuff('player', targetBuffId, 'survival_temperature_listener', { tick: getBuffApplyTick(), temp_state: targetRange });
        }
        var prevRange = state.lastBodyTemperatureRange || null;
        if (prevRange !== targetRange) {
            debugTempLog('state_changed old=' + String(prevRange || 'none')
                + ' new=' + String(targetRange)
                + ' ambient=' + String(ambientE == null ? 'null' : ambientE)
                + ' standard=' + String(standardS)
                + ' shift=' + String(thresholdShiftR));
            emitBodyTemperatureStateChangedEvent(prevRange, targetRange, ambientE, standardS, thresholdShiftR);
        }
        state.lastBodyTemperatureRange = targetRange;
        return targetRange;
    }

    function applyBodyTemperatureTick(tempState) {
        var next = getBodyTemperature();
        var minT = get('body_temperature_min', 30);
        var maxT = get('body_temperature_max', 42);
        if (tempState === 'cold') {
            var cTicks = Math.max(1, Math.floor(Number(get('body_temperature_cold_move_ticks', 10)) || 10));
            if (state.tickCount % cTicks === 0) next += Number(get('body_temperature_cold_move_delta', -0.1)) || -0.1;
        } else if (tempState === 'hot') {
            var hTicks = Math.max(1, Math.floor(Number(get('body_temperature_heat_move_ticks', 10)) || 10));
            if (state.tickCount % hTicks === 0) next += Number(get('body_temperature_heat_move_delta', 0.1)) || 0.1;
        } else {
            var S = getBodyTemperatureStandard();
            var recover = Number(get('body_temperature_comfort_recover_per_tick', 0.03)) || 0;
            if (recover > 0) {
                if (next < S) next = Math.min(S, next + recover);
                else if (next > S) next = Math.max(S, next - recover);
            }
        }
        state.body_temperature = round1(clamp(next, minT, maxT));
    }

    function tryGainWeatherResistProficiencyPerTick(tempState) {
        if (tempState !== 'cold' && tempState !== 'hot') return;
        if (!global || !global.InventoryEquipment) return;
        var IE = global.InventoryEquipment;
        if (typeof IE.getSkillLevel !== 'function' || typeof IE.incrementSkillMoveUsage !== 'function') return;
        var curLv = Math.max(0, Math.floor(Number(IE.getSkillLevel('survival_weather_resist')) || 0));
        var maxLv = Math.max(0, Math.floor(Number(get('weather_resist_max_level', 100)) || 100));
        if (curLv >= maxLv) return;
        IE.incrementSkillMoveUsage('survival_weather_resist', 'extreme_temp_tick', 1);
    }

    function getDirtynessRangeByValue(dirtynessValue) {
        var d = Number(dirtynessValue);
        if (!isFinite(d)) d = Number(state.dirtyness) || 0;
        d = clamp(Math.round(d), get('dirtyness_min', 0), get('dirtyness_max', 100));
        if (d >= 91) return 'messy';
        if (d <= 30) return 'clean';
        return 'normal';
    }

    function getDirtynessRangeBuffId(rangeId) {
        if (rangeId === 'messy') return 'survival_dirty_messy';
        if (rangeId === 'clean') return 'survival_dirty_clean_refreshing';
        return '';
    }

    function syncDirtynessStateBuff() {
        if (!global || !global.BuffSystem) return;
        var Buff = global.BuffSystem;
        if (typeof Buff.applyBuff !== 'function' || typeof Buff.removeBuffByBuffId !== 'function') return;
        var targetRange = getDirtynessRangeByValue(state.dirtyness);
        var targetBuffId = getDirtynessRangeBuffId(targetRange);
        var i;
        for (i = 0; i < DIRTYNESS_RANGE_BUFF_IDS.length; i++) {
            var bid = DIRTYNESS_RANGE_BUFF_IDS[i];
            if (bid === targetBuffId) continue;
            if (typeof Buff.hasBuffByBuffId !== 'function' || Buff.hasBuffByBuffId('player', bid)) {
                Buff.removeBuffByBuffId('player', bid);
            }
        }
        if (targetBuffId) {
            Buff.applyBuff('player', targetBuffId, 'survival_dirtyness_listener', { tick: getBuffApplyTick() });
        }
        lastDirtynessRangeId = targetRange;
    }

    function syncNutritionStateBuff() {
        if (!global || !global.BuffSystem) return;
        var Buff = global.BuffSystem;
        if (typeof Buff.applyBuff !== 'function' || typeof Buff.removeBuffByBuffId !== 'function') return;
        var targetRange = getNutritionRangeByValue(state.nutrition);
        var targetBuffId = getNutritionTierBuffIdByRangeId(targetRange);
        if (!targetBuffId) return;
        var allNutritionBuffIds = [
            'survival_nutrition_malnutrition',
            'survival_nutrition_normal',
            'survival_nutrition_abundant',
            'survival_nutrition_peak'
        ];
        var i;
        for (i = 0; i < allNutritionBuffIds.length; i++) {
            var bid = allNutritionBuffIds[i];
            if (bid === targetBuffId) continue;
            if (typeof Buff.hasBuffByBuffId !== 'function' || Buff.hasBuffByBuffId('player', bid)) {
                Buff.removeBuffByBuffId('player', bid);
            }
        }
        if (targetBuffId) {
            Buff.applyBuff('player', targetBuffId, 'survival_nutrition_listener', { tick: getBuffApplyTick() });
        }
        // 营养段位影响底气上限时，需要在切段后立刻重算并夹紧。
        recomputeDiqiCapLimitAndClamp();
    }

    function syncEnergyDepletedBuff() {
        if (!global || !global.BuffSystem) return;
        var Buff = global.BuffSystem;
        if (typeof Buff.applyBuff !== 'function' || typeof Buff.removeBuffByBuffId !== 'function') return;
        if (state.energy <= 0) {
            Buff.applyBuff('player', 'survival_energy_depleted', 'survival_energy_zero', { tick: getBuffApplyTick() });
        } else {
            Buff.removeBuffByBuffId('player', 'survival_energy_depleted');
        }
    }

    function syncStaminaExhaustedBuff() {
        if (!global || !global.BuffSystem) return;
        var Buff = global.BuffSystem;
        if (typeof Buff.applyBuff !== 'function' || typeof Buff.removeBuffByBuffId !== 'function') return;
        if (state.stamina <= 0 && !hasComaBuffActive()) {
            Buff.applyBuff('player', 'survival_stamina_exhausted', 'survival_stamina_zero', { tick: getBuffApplyTick() });
        } else {
            Buff.removeBuffByBuffId('player', 'survival_stamina_exhausted');
        }
    }

    /** 重度饥饿或极限饥饿时禁止消耗体力/精力的动作 */
    function canPerformStaminaOrEnergyAction() {
        if (state.isDead || hasComaBuffActive()) return false;
        var blockingBuffIds = get('stamina_energy_action_blocking_buff_ids', [
            'survival_satiety_extreme_hunger',
            'survival_satiety_starving_zero',
            'survival_coma'
        ]);
        if (hasAnyActiveBuff(blockingBuffIds)) return false;
        if (state.stamina <= 0) {
            var limit = get('stamina_zero_ticks_to_coma', 50);
            if (state.staminaZeroTicks >= limit) return false;
        }
        return true;
    }

    /** 体力自然恢复倍率（由 Buff 状态驱动；无 Buff 时回退为 1） */
    function getStaminaRegenMultiplier() {
        var satBuff = getFirstActiveBuff([
            'survival_satiety_starving_zero',
            'survival_satiety_extreme_hunger',
            'survival_satiety_heavy_hunger',
            'survival_satiety_light_hunger',
            'survival_satiety_satiated'
        ]);
        if (satBuff === 'survival_satiety_satiated') return Number(get('stamina_regen_mult_satiety_satiated', 1.1)) || 1;
        if (satBuff === 'survival_satiety_light_hunger' || satBuff === 'survival_satiety_heavy_hunger') return Number(get('stamina_regen_mult_satiety_hunger', 0.9)) || 1;
        if (satBuff === 'survival_satiety_extreme_hunger' || satBuff === 'survival_satiety_starving_zero') return Number(get('stamina_regen_mult_satiety_extreme_hunger', 0.6)) || 1;
        return 1;
    }

    /** 底气自然恢复倍率（由 Buff 状态驱动；无 Buff 时回退为 1） */
    function getDiqiRegenMultiplier() {
        var m = 1;
        var satBuff = getFirstActiveBuff([
            'survival_satiety_starving_zero',
            'survival_satiety_extreme_hunger',
            'survival_satiety_heavy_hunger'
        ]);
        if (satBuff === 'survival_satiety_heavy_hunger') m *= 0.9;
        if (satBuff === 'survival_satiety_extreme_hunger' || satBuff === 'survival_satiety_starving_zero') m *= 0.6;
        var thirstBuff = getFirstActiveBuff([
            'survival_thirst_dehydrated_zero',
            'survival_thirst_dry',
            'survival_thirst_hydrated'
        ]);
        if (thirstBuff === 'survival_thirst_dehydrated_zero') m *= 0.4;
        else if (thirstBuff === 'survival_thirst_dry') m *= 0.5;
        else if (thirstBuff === 'survival_thirst_hydrated') m *= 1.1;
        if (hasActiveBuffById('survival_nutrition_malnutrition')) {
            m *= get('nutrition_malnutrition_diqi_regen_mult', 0.5);
        }
        return m;
    }

    /** 营养档位：malnutrition / normal / abundant / peak */
    function getNutritionTier() {
        if (global && global.BuffSystem && typeof global.BuffSystem.hasBuffByBuffId === 'function') {
            if (global.BuffSystem.hasBuffByBuffId('player', 'survival_nutrition_malnutrition')) return 'malnutrition';
            if (global.BuffSystem.hasBuffByBuffId('player', 'survival_nutrition_normal')) return 'normal';
            if (global.BuffSystem.hasBuffByBuffId('player', 'survival_nutrition_abundant')) return 'abundant';
            if (global.BuffSystem.hasBuffByBuffId('player', 'survival_nutrition_peak')) return 'peak';
        }
        return getNutritionRangeByValue(state.nutrition);
    }

    function getNutritionPotPerEnergyMultiplier() {
        if (global && global.BuffSystem && typeof global.BuffSystem.hasBuffByBuffId === 'function'
            && global.BuffSystem.hasBuffByBuffId('player', 'survival_nutrition_abundant')) {
            return Number(get('nutrition_abundant_pot_per_energy_mult', 1.3)) || 1;
        }
        return 1;
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
            var allowOvercap = false;
            if (global && global.BuffSystem && typeof global.BuffSystem.hasActiveSatietyDigestBuff === 'function') {
                allowOvercap = !!global.BuffSystem.hasActiveSatietyDigestBuff('player');
            }
            next = Math.min(next, allowOvercap ? overcapMax : maxVal);
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
        syncStaminaExhaustedBuff();
    }

    function consumeEnergy(amount) {
        var a = amount || 0;
        state.energy = round1(Math.max(0, state.energy - a));
        syncEnergyDepletedBuff();
    }

    function addEnergy(amount) {
        var a = Math.max(0, Number(amount) || 0);
        if (a <= 0) return;
        var em = get('energy_max', 100);
        state.energy = round1(clamp(state.energy + a, 0, em));
        syncEnergyDepletedBuff();
    }

    function getStarvationDeathTicksLimit() {
        var n = Number(get('satiety_starving_death_ticks', get('satiety_starvation_ticks_to_death', 100)));
        return Math.max(1, Math.floor(isFinite(n) ? n : 100));
    }

    function getDehydrationDeathTicksLimit() {
        var n = Number(get('thirst_dehydration_death_ticks', get('thirst_death_ticks', 500)));
        return Math.max(1, Math.floor(isFinite(n) ? n : 500));
    }

    function getOverfedWeightGainTicksLimit() {
        var n = Number(get('satiety_weight_gain_ticks_stuffed', get('satiety_overfed_ticks_to_weight_gain', 500)));
        return Math.max(1, Math.floor(isFinite(n) ? n : 500));
    }

    function getSevereHungerWeightLossTicksLimit() {
        var n = Number(get('satiety_weight_loss_ticks_hunger', get('satiety_severe_hunger_ticks_to_weight_loss', 500)));
        return Math.max(1, Math.floor(isFinite(n) ? n : 500));
    }

    function getSevereHungerSatietyMax() {
        var n = Number(get('satiety_severe_hunger_max', get('satiety_buff_tier_heavy_hunger_min', 10)));
        return isFinite(n) ? n : 10;
    }

    function setDead(reason) {
        state.isDead = true;
        state.deathReason = reason ? String(reason) : 'unknown';
    }

    function addNutrition(amount) {
        if (amount <= 0) return;
        var maxVal = get('nutrition_max', 100);
        state.nutrition = clamp(state.nutrition + Math.round(amount), 0, maxVal);
        syncNutritionStateBuff();
    }

    function addDirtyness(amount) {
        if (amount <= 0) return;
        var maxVal = get('dirtyness_max', 100);
        state.dirtyness = clamp(state.dirtyness + Math.round(amount), get('dirtyness_min', 0), maxVal);
        syncDirtynessStateBuff();
    }

    function reduceDirtyness(amount) {
        if (amount <= 0) return;
        var minVal = get('dirtyness_min', 0);
        state.dirtyness = clamp(state.dirtyness - Math.round(amount), minVal, get('dirtyness_max', 100));
        syncDirtynessStateBuff();
    }

    function setResting(resting) {
        state.isResting = !!resting;
    }

    function setStaminaRegenActionActive(active) {
        state.is_stamina_regen_action_active = !!active;
    }

    /** 单 tick 结算；返回 { death: string|null, coma: boolean } */
    function advanceTick() {
        var result = { death: null, coma: false };
        if (state.isDead) return result;
        var beforeSnapshot = buildSurvivalStateSnapshot();
        syncStaminaExhaustedBuff();
        syncEnergyDepletedBuff();
        syncNutritionStateBuff();
        syncSatietyStateBuff();
        syncThirstStateBuff();
        syncMoodStateBuff();
        syncDirtynessStateBuff();
        var comaActive = hasComaBuffActive();
        state.isComa = comaActive;
        if (comaActive) {
            // 昏迷期间不保留筋疲力尽计时，且不显示筋疲力尽状态
            state.staminaZeroTicks = 0;
            clearStaminaExhaustedBuffIfAny();
        }

        // 07：本 tick 推进前，若自上一 tick 以来未扣除过气力，则按上限比例回气（与其它 addQiLi 不互斥）
        if (!state.qi_li_spent_this_tick) {
            var pct = get('qi_li_regen_pct_per_turn', 0.5);
            if (typeof pct !== 'number' || !isFinite(pct)) pct = 0.25;
            pct = clamp(pct, 0, 1);
            var regenAmt = Math.floor(getQiLiMax() * pct);
            if (regenAmt > 0) addQiLi(regenAmt);
        }
        state.qi_li_spent_this_tick = false;

        state.tickCount += 1;
        var tick = state.tickCount;

        // 推进世界时间（若时间系统已加载）
        if (typeof global !== 'undefined' && global.GameTime && typeof global.GameTime.advanceTicks === 'function') {
            global.GameTime.advanceTicks(1);
        }

        // ---------- 饱食（仅状态衰减 + Buff 同步） ----------
        var satDecay = get('satiety_tick_decay', 1);
        state.satiety = round1(Math.max(0, state.satiety - satDecay));
        var satietyRange = syncSatietyStateBuff();
        var severeHungerSatietyMax = getSevereHungerSatietyMax();
        if (state.satiety <= 0) state.starvationTicks += 1;
        else state.starvationTicks = 0;
        if (state.satiety > get('satiety_max', 100)) state.overfedTicks += 1;
        else state.overfedTicks = 0;
        if (state.satiety <= severeHungerSatietyMax) state.severeHungerTicks += 1;
        else state.severeHungerTicks = 0;
        if (satietyRange === 'starving_zero' || satietyRange === 'extreme_hunger' || satietyRange === 'heavy_hunger') {
            state.satietyWeightLossBuffId = getSatietyRangeBuffId(satietyRange);
        } else {
            state.satietyWeightLossBuffId = '';
        }
        if (state.overfedTicks >= getOverfedWeightGainTicksLimit()) {
            state.weight_kg = Math.max(0, round1(state.weight_kg + 1));
            state.overfedTicks = 0;
        }
        if (state.severeHungerTicks >= getSevereHungerWeightLossTicksLimit()) {
            state.weight_kg = Math.max(0, round1(state.weight_kg - 1));
            state.severeHungerTicks = 0;
        }
        if (state.starvationTicks >= getStarvationDeathTicksLimit()) {
            setDead('starvation');
            result.death = 'starvation';
            emitSurvivalStateChangedIfNeeded('tick_death', beforeSnapshot, { death: result.death });
            return result;
        }

        // ---------- 饮水（仅状态衰减 + Buff 同步） ----------
        var thirstInterval = get('thirst_tick_decay_interval', 2);
        if (tick % thirstInterval === 0) {
            var thirstDecay = get('thirst_tick_decay_amount', 1);
            state.thirst = round1(Math.max(0, state.thirst - thirstDecay));
        }
        syncThirstStateBuff();
        if (state.thirst <= 0) state.thirstDeathTicks += 1;
        else state.thirstDeathTicks = 0;
        if (state.thirstDeathTicks >= getDehydrationDeathTicksLimit()) {
            setDead('dehydration');
            result.death = 'dehydration';
            emitSurvivalStateChangedIfNeeded('tick_death', beforeSnapshot, { death: result.death });
            return result;
        }

        // ---------- 体力恢复 ----------
        var staminaMax = get('stamina_max', 100);
        var baseRegen = 0;
        if (state.isResting) {
            baseRegen = get('stamina_rest_tick_regen_base', 5);
        } else if (state.is_stamina_regen_action_active) {
            // 常态恢复公式保留，仅在指定动作态开启时生效
            baseRegen = get('stamina_tick_regen_base', 0.5);
        }
        var breath = Math.max(0, (typeof getBreathActual === 'function' ? getBreathActual() : 10));
        var coef = get('breath_diqi_stamina_coef', 0.02);
        var ningqi = (typeof getNingqiBonus === 'function' ? getNingqiBonus() : 0) || 0;
        var regen = (baseRegen + coef * breath) * (1 + ningqi) * getStaminaRegenMultiplier();
        state.stamina = round1(Math.min(staminaMax, state.stamina + regen));
        syncStaminaExhaustedBuff();
        if (state.stamina <= 0 && !comaActive) {
            state.staminaZeroTicks += 1;
            if (state.staminaZeroTicks >= get('stamina_zero_ticks_to_coma', 50)) {
                if (global && global.BuffSystem && typeof global.BuffSystem.applyBuff === 'function') {
                    global.BuffSystem.applyBuff('player', 'survival_coma', 'survival_stamina_zero', { tick: getBuffApplyTick() });
                } else {
                    state.isComa = true;
                }
                // 触发昏迷后，筋疲力尽计数归零（下次从 0 重计）
                state.staminaZeroTicks = 0;
                state.isComa = hasComaBuffActive() || !!state.isComa;
                clearStaminaExhaustedBuffIfAny();
                result.coma = true;
            }
        } else {
            state.staminaZeroTicks = 0;
        }

        // ---------- 心情回归（每 1 tick） ----------
        var moodInterval = get('mood_regression_interval_ticks', 1);
        if (tick % moodInterval === 0) {
            var center = get('mood_center', 500);
            var step = get('mood_regression_step_base', 5) * getComposureMoodFactor();
            var delta = state.mood > center ? -step : (state.mood < center ? step : 0);
            state.mood = clamp(Math.round(state.mood + delta), get('mood_min', 0), get('mood_max', 1000));
        }
        syncMoodStateBuff();

        // ---------- 营养衰减（每 25 tick） ----------
        var nutInterval = get('nutrition_tick_decay_interval', 25);
        if (tick % nutInterval === 0) {
            var nutDecay = get('nutrition_tick_decay_amount', 1);
            state.nutrition = clamp(state.nutrition - nutDecay, get('nutrition_min', 0), get('nutrition_max', 100));
        }
        syncNutritionStateBuff();
        syncDirtynessStateBuff();
        syncBmiTierState();

        // ---------- 体温（环境判定 -> 体温变化 -> 状态 Buff -> 耐候熟练） ----------
        var standardT = getBodyTemperatureStandard();
        var ambientT = resolveAmbientTemperatureForCurrentMap();
        var tempShift = computeTempThresholdShiftByWeatherResist();
        var tempState = getExtremeTemperatureState(ambientT, standardT, tempShift);
        if (hasBuffDebugEnabled()) {
            var coldBase = Number(get('body_temperature_extreme_cold_base_delta', 15));
            var hotBase = Number(get('body_temperature_extreme_hot_base_delta', 12));
            var coldThreshold = standardT - (coldBase + tempShift);
            var hotThreshold = standardT + (hotBase + tempShift);
            debugTempLog('tick=' + String(state.tickCount)
                + ' ambient=' + String(ambientT == null ? 'null' : ambientT)
                + ' standard=' + String(standardT)
                + ' threshold_cold<' + String(coldThreshold)
                + ' threshold_hot>' + String(hotThreshold)
                + ' state=' + String(tempState));
        }
        applyBodyTemperatureTick(tempState);
        syncExtremeTemperatureBuff(tempState, ambientT, standardT, tempShift);
        tryGainWeatherResistProficiencyPerTick(tempState);

        var bt = getBodyTemperature();
        var coldDeathDelta = Number(get('body_temperature_death_below_standard', 13));
        var hotDeathDelta = Number(get('body_temperature_death_above_standard', 13));
        if (bt <= standardT - coldDeathDelta) {
            setDead('temperature_extreme_cold');
            result.death = 'temperature_extreme_cold';
            emitSurvivalStateChangedIfNeeded('tick_death', beforeSnapshot, { death: result.death });
            return result;
        }
        if (bt >= standardT + hotDeathDelta) {
            setDead('temperature_extreme_hot');
            result.death = 'temperature_extreme_hot';
            emitSurvivalStateChangedIfNeeded('tick_death', beforeSnapshot, { death: result.death });
            return result;
        }

        if (typeof global !== 'undefined' && global.InventoryEquipment && typeof global.InventoryEquipment.tickHubActionCooldowns === 'function') {
            global.InventoryEquipment.tickHubActionCooldowns(1);
        }
        if (typeof global !== 'undefined' && global.InventoryEquipment && typeof global.InventoryEquipment.pruneExpiredGroundItems === 'function') {
            global.InventoryEquipment.pruneExpiredGroundItems(state.tickCount, 100);
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
        emitSurvivalStateChangedIfNeeded('tick', beforeSnapshot, { coma: !!result.coma });

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
    function getDirtyness() { return state.dirtyness; }
    function getWeightKg() { return state.weight_kg; }
    function getHeightCmValue() { return getHeightCm(); }
    function getBmiTier() { return getBmiTierByValue(getBMI()); }
    function isDead() { return state.isDead; }
    function getDeathReason() { return state.deathReason || null; }
    function isComa() { return state.isComa; }

    global.Survival = {
        setConfig: setConfig,
        getConfigValue: getConfigValue,
        setCharacterCallbacks: setCharacterCallbacks,
        getState: getState,
        setState: setState,
        advanceTick: advanceTick,
        canPerformStaminaOrEnergyAction: canPerformStaminaOrEnergyAction,
        getStaminaRegenMultiplier: getStaminaRegenMultiplier,
        getDiqiRegenMultiplier: getDiqiRegenMultiplier,
        getSatietyZone: getSatietyZone,
        getNutritionTier: getNutritionTier,
        getNutritionPotPerEnergyMultiplier: getNutritionPotPerEnergyMultiplier,
        getMoodRangeByValue: getMoodRangeByValue,
        syncMoodStateBuff: syncMoodStateBuff,
        getBodyTemperature: getBodyTemperature,
        getBodyTemperatureStandard: getBodyTemperatureStandard,
        resolveAmbientTemperatureForCurrentMap: resolveAmbientTemperatureForCurrentMap,
        getExtremeTemperatureState: getExtremeTemperatureState,
        syncExtremeTemperatureBuff: syncExtremeTemperatureBuff,
        getDirtynessRangeByValue: getDirtynessRangeByValue,
        syncDirtynessStateBuff: syncDirtynessStateBuff,
        getComposureMoodFactor: getComposureMoodFactor,
        addSatiety: addSatiety,
        addThirst: addThirst,
        consumeStamina: consumeStamina,
        consumeEnergy: consumeEnergy,
        addNutrition: addNutrition,
        addDirtyness: addDirtyness,
        reduceDirtyness: reduceDirtyness,
        setResting: setResting,
        setStaminaRegenActionActive: setStaminaRegenActionActive,
        getStamina: getStamina,
        getStaminaMax: getStaminaMax,
        getSatiety: getSatiety,
        getThirst: getThirst,
        getEnergy: getEnergy,
        getEnergyMax: getEnergyMax,
        getMood: getMood,
        getComposure: getComposure,
        getNutrition: getNutrition,
        getDirtyness: getDirtyness,
        getWeightKg: getWeightKg,
        getHeightCm: getHeightCmValue,
        getBMI: getBMI,
        getBmiTier: getBmiTier,
        isDead: isDead,
        getDeathReason: getDeathReason,
        setDead: setDead,
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
