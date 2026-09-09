/**
 * PharmacyEffects — 药物负担与毒性运行时（47 §4 成瘾 / §9.2 毒性代谢 / k242 / k240）
 *
 * 职责（纯规则 + 状态，不含 UI/存档 IO）：
 *   - 成瘾：全局单条 addiction 0–100，途径增量累积（外敷不涨瘾）、自然衰减、免疫三向接线、
 *           四阶段惩罚（阶段二~四按实际值乘区压后天五维）+ potency 压制（§4.4 泛药物交叉压制）。
 *   - 毒性：体内毒性随 tick 衰减，档位（轻/中/重）实时映射到副作用 buff；
 *           ≥ 重档期间累计致死倒计时（toxicity_ticks），走完 → setDead('drug_toxicity')。
 *
 * 状态落点：window.SceneCtx.pharmacy_effects（save-system 显式快照，与站点运行时同构）。
 * 配置来源：PharmacyStation.getSystemConfig()（data/pharmacy-system-config.csv 解析结果）。
 */
(function (global) {
    'use strict';

    var ADDICTION_MAX = 100;

    /** 途径 → 配置键（§4.1 增量；外敷恒 0）。 */
    var ROUTE_GAIN_KEYS = {
        drink: 'pharmacy_addiction_gain_drink',
        inhale: 'pharmacy_addiction_gain_inhale',
        inject: 'pharmacy_addiction_gain_inject',
        topical: 'pharmacy_addiction_gain_topical'
    };

    /** 入体途径（外敷既不涨瘾也不参与压制，§4.4）。 */
    var SYSTEMIC_ROUTES = ['drink', 'inhale', 'inject'];

    /** potency 档序（§4.4 压制门槛比较）。 */
    var POTENCY_RANK = { weak: 1, regular: 2, potent: 3 };

    /** 阶段 → 压制所需 potency 档（§4.4：二阶段 ≥weak / 三阶段 ≥regular / 四阶段 ≥potent）。 */
    var STAGE_SUPPRESS_REQUIREMENT = { 1: '', 2: 'weak', 3: 'regular', 4: 'potent' };

    var DEFAULTS = {
        gain: { topical: 0, drink: 4, inhale: 10, inject: 15 },
        decay_per_tick: 0.05,
        immunity_gain_reduction: 0.01,
        immunity_decay_bonus: 0.02,
        immunity_penalty_reduction: 0.01,
        stage_thresholds: [25, 50, 75],
        stage_penalties: [0.1, 0.2, 0.35],
        toxicity_decay_per_tick: 1,
        toxicity_lethal_ticks: 40,
        toxicity_bands: [0, 25, 55],
        duration_immunity_bonus_per_level: 0.01,
        immunity_sideeffect_reduction: 0.02,
        immunity_sideeffect_cap: 0.8
    };

    var cfg = JSON.parse(JSON.stringify(DEFAULTS));

    function num(v, fallback) {
        var n = Number(v);
        return isFinite(n) ? n : fallback;
    }

    /** 装载配置：接受 pharmacy-system-config.csv 的归一化对象（缺失项沿用缺省）。 */
    function setConfig(parsed) {
        var p = parsed && typeof parsed === 'object' ? parsed : {};
        var gain = p.pharmacy_addiction_gain && typeof p.pharmacy_addiction_gain === 'object' ? p.pharmacy_addiction_gain : null;
        if (gain) {
            cfg.gain = {
                topical: num(gain.topical, DEFAULTS.gain.topical),
                drink: num(gain.drink, DEFAULTS.gain.drink),
                inhale: num(gain.inhale, DEFAULTS.gain.inhale),
                inject: num(gain.inject, DEFAULTS.gain.inject)
            };
        }
        cfg.decay_per_tick = Math.max(0, num(p.pharmacy_addiction_decay_per_tick, cfg.decay_per_tick));
        cfg.immunity_gain_reduction = Math.max(0, num(p.pharmacy_addiction_immunity_gain_reduction, cfg.immunity_gain_reduction));
        cfg.immunity_decay_bonus = Math.max(0, num(p.pharmacy_addiction_immunity_decay_bonus, cfg.immunity_decay_bonus));
        cfg.immunity_penalty_reduction = Math.max(0, num(p.pharmacy_addiction_immunity_penalty_reduction, cfg.immunity_penalty_reduction));
        if (Array.isArray(p.pharmacy_addiction_stage_thresholds) && p.pharmacy_addiction_stage_thresholds.length >= 3) {
            cfg.stage_thresholds = p.pharmacy_addiction_stage_thresholds.slice(0, 3).map(function (v) { return num(v, 0); });
        }
        if (Array.isArray(p.pharmacy_addiction_stage_penalties) && p.pharmacy_addiction_stage_penalties.length >= 3) {
            cfg.stage_penalties = p.pharmacy_addiction_stage_penalties.slice(0, 3).map(function (v) { return num(v, 0); });
        }
        cfg.toxicity_decay_per_tick = Math.max(0, num(p.pharmacy_toxicity_decay_per_tick, cfg.toxicity_decay_per_tick));
        cfg.toxicity_lethal_ticks = Math.max(1, Math.floor(num(p.pharmacy_toxicity_lethal_ticks, cfg.toxicity_lethal_ticks)));
        if (Array.isArray(p.pharmacy_toxicity_band_thresholds) && p.pharmacy_toxicity_band_thresholds.length >= 3) {
            cfg.toxicity_bands = p.pharmacy_toxicity_band_thresholds.slice(0, 3).map(function (v) { return num(v, 0); });
        }
        cfg.duration_immunity_bonus_per_level = Math.max(0, num(p.pharmacy_duration_immunity_bonus_per_level, cfg.duration_immunity_bonus_per_level));
        cfg.immunity_sideeffect_reduction = Math.max(0, num(p.pharmacy_immunity_sideeffect_reduction, cfg.immunity_sideeffect_reduction));
        cfg.immunity_sideeffect_cap = Math.max(0, Math.min(1, num(p.pharmacy_immunity_sideeffect_cap, cfg.immunity_sideeffect_cap)));
        return getConfig();
    }

    function getConfig() {
        return {
            gain: JSON.parse(JSON.stringify(cfg.gain)),
            decay_per_tick: cfg.decay_per_tick,
            immunity_gain_reduction: cfg.immunity_gain_reduction,
            immunity_decay_bonus: cfg.immunity_decay_bonus,
            immunity_penalty_reduction: cfg.immunity_penalty_reduction,
            stage_thresholds: cfg.stage_thresholds.slice(),
            stage_penalties: cfg.stage_penalties.slice(),
            toxicity_decay_per_tick: cfg.toxicity_decay_per_tick,
            toxicity_lethal_ticks: cfg.toxicity_lethal_ticks,
            toxicity_bands: cfg.toxicity_bands.slice(),
            duration_immunity_bonus_per_level: cfg.duration_immunity_bonus_per_level,
            immunity_sideeffect_reduction: cfg.immunity_sideeffect_reduction,
            immunity_sideeffect_cap: cfg.immunity_sideeffect_cap
        };
    }

    // ---------------------------
    // 状态
    // ---------------------------
    function createDefaultState() {
        return {
            addiction: 0,
            toxicity: 0,
            toxicity_lethal_ticks: 0,
            stage: 1,
            last_band: 'none',
            lethal_active: false
        };
    }

    function getState() {
        if (!global.SceneCtx) return createDefaultState();
        if (!global.SceneCtx.pharmacy_effects || typeof global.SceneCtx.pharmacy_effects !== 'object') {
            global.SceneCtx.pharmacy_effects = createDefaultState();
        }
        var s = global.SceneCtx.pharmacy_effects;
        s.addiction = Math.max(0, Math.min(ADDICTION_MAX, num(s.addiction, 0)));
        s.toxicity = Math.max(0, num(s.toxicity, 0));
        s.toxicity_lethal_ticks = Math.max(0, Math.floor(num(s.toxicity_lethal_ticks, 0)));
        s.stage = Math.max(1, Math.min(4, Math.floor(num(s.stage, 1))));
        if (typeof s.last_band !== 'string' || !s.last_band) s.last_band = 'none';
        s.lethal_active = s.lethal_active === true;
        return s;
    }

    function setState(s) {
        var st = getState();
        if (!s || typeof s !== 'object') return st;
        if (s.addiction != null) st.addiction = Math.max(0, Math.min(ADDICTION_MAX, num(s.addiction, st.addiction)));
        if (s.toxicity != null) st.toxicity = Math.max(0, num(s.toxicity, st.toxicity));
        if (s.toxicity_lethal_ticks != null) st.toxicity_lethal_ticks = Math.max(0, Math.floor(num(s.toxicity_lethal_ticks, st.toxicity_lethal_ticks)));
        if (s.stage != null) st.stage = Math.max(1, Math.min(4, Math.floor(num(s.stage, st.stage))));
        if (s.last_band != null) st.last_band = String(s.last_band);
        if (s.lethal_active != null) st.lethal_active = s.lethal_active === true;
        return st;
    }

    function resetState() {
        if (global.SceneCtx) global.SceneCtx.pharmacy_effects = createDefaultState();
        clearAllBuffs();
        applyStagePenalty();
        return getState();
    }

    // ---------------------------
    // 依赖读取
    // ---------------------------
    function getBuffSystem() {
        return global.BuffSystem || null;
    }

    /** 免疫等级（11 §8.1 免疫：降低副作用 / 加速代谢 / 缩小惩罚）。 */
    function getImmunityLevel() {
        var IE = global.InventoryEquipment;
        if (IE && typeof IE.getSkillLevel === 'function') {
            var lv = parseInt(IE.getSkillLevel('survival_immunity'), 10);
            if (isFinite(lv) && lv > 0) return lv;
        }
        return 0;
    }

    /** 读任一在场 buff 的模板字段（供 potency 压制判定）。 */
    function getActiveInstances(ownerId) {
        var BS = getBuffSystem();
        if (!BS || typeof BS.getState !== 'function') return [];
        var st = BS.getState();
        var map = st && st.instancesByOwner ? st.instancesByOwner : null;
        if (!map) return [];
        return map[ownerId || 'player'] || [];
    }

    // ---------------------------
    // 成瘾（§4.1 / §4.2 / §4.4 / §4.5）
    // ---------------------------
    function getAddiction() {
        return getState().addiction;
    }

    /** 途径单次上瘾增量（含免疫减免；外敷恒 0）。 */
    function getRouteGain(routeId) {
        var rid = routeId != null ? String(routeId).trim().toLowerCase() : '';
        var key = ROUTE_GAIN_KEYS[rid];
        if (!key) return 0;
        var base = num(cfg.gain[rid], 0);
        if (!(base > 0)) return 0;
        var immunity = getImmunityLevel();
        var reduction = Math.max(0, Math.min(0.95, immunity * cfg.immunity_gain_reduction));
        return base * (1 - reduction);
    }

    /**
     * 按途径累积成瘾。componentCount = 该次使用的致瘾成分数（联合注射液各成分累加，§4.1）。
     * 返回新的成瘾值。
     */
    function addAddictionFromRoute(routeId, componentCount) {
        var st = getState();
        var n = Math.max(1, Math.floor(num(componentCount, 1)));
        var gain = getRouteGain(routeId) * n;
        if (!(gain > 0)) return st.addiction;
        st.addiction = Math.max(0, Math.min(ADDICTION_MAX, st.addiction + gain));
        refreshAddictionStage();
        return st.addiction;
    }

    /** 直接加成瘾值（调试/剧情脚本用）。 */
    function addAddiction(amount) {
        var st = getState();
        var d = num(amount, 0);
        if (!d) return st.addiction;
        st.addiction = Math.max(0, Math.min(ADDICTION_MAX, st.addiction + d));
        refreshAddictionStage();
        return st.addiction;
    }

    /** 成瘾值 → 阶段（1–4）。 */
    function getAddictionStage(addiction) {
        var v = (addiction != null) ? num(addiction, 0) : getState().addiction;
        var t = cfg.stage_thresholds;
        if (v < num(t[0], 25)) return 1;
        if (v < num(t[1], 50)) return 2;
        if (v < num(t[2], 75)) return 3;
        return 4;
    }

    /** 阶段 → 惩罚 buff id（阶段一无 buff）。 */
    function getStageBuffId(stage) {
        var s = Math.max(1, Math.min(4, Math.floor(num(stage, 1))));
        return s >= 2 ? 'buff_pharm_addiction_stage' + s : '';
    }

    /** 阶段 → 惩罚乘区（0 / 0.1 / 0.2 / 0.35；含免疫缩小，§4.5）。 */
    function getStagePenaltyPct(stage) {
        var s = Math.max(1, Math.min(4, Math.floor(num(stage, 1))));
        if (s < 2) return 0;
        var base = num(cfg.stage_penalties[s - 2], 0);
        var immunity = getImmunityLevel();
        var shrink = Math.max(0, Math.min(0.95, immunity * cfg.immunity_penalty_reduction));
        return base * (1 - shrink);
    }

    /** 压制判定（§4.4）：在场入体药 buff（drink/inhale/inject）中最高 potency 是否够当前阶段的门槛。 */
    function isPenaltySuppressed() {
        var stage = getAddictionStage();
        var need = STAGE_SUPPRESS_REQUIREMENT[stage] || '';
        if (!need) return false;
        var needRank = POTENCY_RANK[need] || 0;
        var arr = getActiveInstances('player');
        var i;
        for (i = 0; i < arr.length; i++) {
            var inst = arr[i];
            if (!inst || !inst.template || (inst.stacks || 0) <= 0) continue;
            var tpl = inst.template;
            var route = String(tpl.pharmacy_route || '').toLowerCase();
            if (SYSTEMIC_ROUTES.indexOf(route) < 0) continue;
            var rank = POTENCY_RANK[String(tpl.pharmacy_potency || '').toLowerCase()] || 0;
            if (rank >= needRank && rank > 0) return true;
        }
        return false;
    }

    /** 把阶段惩罚乘区写进 CharacterAttributes（压制期间视为无惩罚，§4.4）。 */
    function applyStagePenalty() {
        var CA = global.CharacterAttributes;
        if (!CA || typeof CA.setExternalAcquiredMultiplier !== 'function') return false;
        var stage = getAddictionStage();
        var pct = isPenaltySuppressed() ? 0 : getStagePenaltyPct(stage);
        var mul = Math.max(0, 1 - pct);
        CA.setExternalAcquiredMultiplier({ jingu: mul, flexibility: mul, breath: mul, dexterity: mul, focus: mul });
        if (typeof CA.recalcCharacterStats === 'function') {
            var IE = global.InventoryEquipment;
            if (IE && typeof IE.getState === 'function') {
                CA.recalcCharacterStats({
                    getEquipmentState: function () { return IE.getState().equipment; },
                    getSkillsState: function () { return IE.getState().skills; },
                    getItemTemplate: IE.getItemTemplate,
                    getEnchantEntry: IE.getEnchantEntry,
                    getStrengthLevel: function () { return IE.getSkillLevel('survival_strength'); }
                });
            }
        }
        return true;
    }

    /** 同步阶段惩罚 buff（在场性 + 压制状态）。 */
    function refreshAddictionStage() {
        var st = getState();
        var nextStage = getAddictionStage(st.addiction);
        var stageChanged = nextStage !== st.stage;
        st.stage = nextStage;
        var BS = getBuffSystem();
        var buffId = getStageBuffId(nextStage);
        var suppressed = isPenaltySuppressed();
        if (BS) {
            ['buff_pharm_addiction_stage2', 'buff_pharm_addiction_stage3', 'buff_pharm_addiction_stage4'].forEach(function (id) {
                if (id !== buffId && typeof BS.removeBuffByBuffId === 'function') BS.removeBuffByBuffId('player', id);
            });
            if (buffId && typeof BS.applyBuff === 'function') {
                if (!suppressed) BS.applyBuff('player', buffId, 'pharmacy:addiction');
                else if (typeof BS.removeBuffByBuffId === 'function') BS.removeBuffByBuffId('player', buffId);
            }
        }
        if (stageChanged || suppressed) applyStagePenalty();
        return st.stage;
    }

    // ---------------------------
    // 毒性（§9.2 / k240）
    // ---------------------------
    function getToxicity() {
        return getState().toxicity;
    }

    /** 体内毒性 → 副作用档（none/mild/moderate/severe）。 */
    function getToxicityBand(toxicity) {
        var v = (toxicity != null) ? num(toxicity, 0) : getState().toxicity;
        var t = cfg.toxicity_bands;
        if (!(v > num(t[0], 0))) return 'none';
        if (v <= num(t[1], 25)) return 'mild';
        if (v <= num(t[2], 55)) return 'moderate';
        return 'severe';
    }

    function getToxicityBandBuffId(band) {
        var b = String(band || '').toLowerCase();
        if (b === 'mild' || b === 'moderate' || b === 'severe') return 'buff_pharm_sideeffect_' + b;
        return '';
    }

    /** 注入净毒性（配药/注射结算调用）。 */
    function addToxicity(amount) {
        var st = getState();
        var d = num(amount, 0);
        if (!(d > 0)) return st.toxicity;
        st.toxicity = Math.max(0, st.toxicity + d);
        refreshToxicityBand();
        return st.toxicity;
    }

    /** 解毒/辅药加速衰减（§9.2：加速至 ≈3/tick）。 */
    function accelerateToxicityDecay(perTick) {
        var st = getState();
        var d = Math.max(0, num(perTick, 0));
        if (!(d > 0)) return st.toxicity;
        st.toxicity = Math.max(0, st.toxicity - d);
        refreshToxicityBand();
        return st.toxicity;
    }

    /** 毒性档位 → 副作用 buff（换档时清掉旧档）。 */
    function refreshToxicityBand() {
        var st = getState();
        var band = getToxicityBand(st.toxicity);
        if (band === st.last_band) return band;
        var BS = getBuffSystem();
        if (BS) {
            // 移除在场的一切副作用档（含免疫缩放版 __immNN）
            var arr = getActiveInstances('player');
            var i;
            for (i = 0; i < arr.length; i++) {
                var inst = arr[i];
                var bid = inst && inst.buff_id ? String(inst.buff_id) : '';
                if (bid.indexOf('buff_pharm_sideeffect_') === 0 && typeof BS.removeBuffByBuffId === 'function') {
                    BS.removeBuffByBuffId('player', bid);
                }
            }
            var nextId = getScaledSideEffectBuffId(band);
            if (nextId && typeof BS.applyBuff === 'function') BS.applyBuff('player', nextId, 'pharmacy:toxicity');
        }
        st.last_band = band;
        return band;
    }

    /** 致死倒计时是否进行中（体内毒性处于重档期间累计）。 */
    function isLethalCountdownActive() {
        return getState().lethal_active === true;
    }

    function getLethalTicksRemaining() {
        var st = getState();
        if (!st.lethal_active) return 0;
        return Math.max(0, cfg.toxicity_lethal_ticks - st.toxicity_lethal_ticks);
    }

    // ---------------------------
    // 世界 tick
    // ---------------------------
    /** 每世界 tick：成瘾衰减 + 阶段/压制刷新 + 毒性衰减 + 副作用档 + 致死倒计时。 */
    function onWorldTick() {
        var st = getState();
        var changed = false;

        // 成瘾自然衰减（免疫加速，§4.5）
        if (st.addiction > 0) {
            var immunity = getImmunityLevel();
            var decay = cfg.decay_per_tick * (1 + immunity * cfg.immunity_decay_bonus);
            if (decay > 0) {
                var before = st.addiction;
                st.addiction = Math.max(0, st.addiction - decay);
                if (st.addiction !== before) changed = true;
            }
        }

        // 毒性自然衰减
        if (st.toxicity > 0) {
            var tdecay = cfg.toxicity_decay_per_tick;
            if (tdecay > 0) {
                st.toxicity = Math.max(0, st.toxicity - tdecay);
                changed = true;
            }
        }

        // 阶段与压制（成瘾值变化或在场药 buff 变化都可能改判定）
        refreshAddictionStage();
        refreshToxicityBand();

        // 致死倒计时：重档期间累计，降到档下即清零（§9.2）
        var band = getToxicityBand(st.toxicity);
        if (band === 'severe') {
            st.toxicity_lethal_ticks += 1;
            st.lethal_active = true;
            if (st.toxicity_lethal_ticks >= cfg.toxicity_lethal_ticks) {
                st.lethal_active = false;
                var Surv = global.Survival;
                if (Surv && typeof Surv.setDead === 'function') Surv.setDead('drug_toxicity');
            }
        } else if (st.lethal_active || st.toxicity_lethal_ticks > 0) {
            st.lethal_active = false;
            st.toxicity_lethal_ticks = 0;
        }

        return changed;
    }

    function clearAllBuffs() {
        var BS = getBuffSystem();
        if (!BS || typeof BS.removeBuffByBuffId !== 'function') return;
        [
            'buff_pharm_addiction_stage2', 'buff_pharm_addiction_stage3', 'buff_pharm_addiction_stage4',
            'buff_pharm_sideeffect_mild', 'buff_pharm_sideeffect_moderate', 'buff_pharm_sideeffect_severe'
        ].forEach(function (id) { BS.removeBuffByBuffId('player', id); });
    }

    /** buff 在场状态变化回调（由 BuffSystem.setBuffStateListener 注册）：即时刷新压制/阶段惩罚。 */
    function onBuffStateChanged(ownerId) {
        var oid = ownerId != null ? String(ownerId) : 'player';
        if (oid !== 'player') return;
        refreshAddictionStage();
    }

    /** 47 §4.5/11-skills：免疫延长药效持续时间（BuffSystem.applyBuff 调用；仅制药剂型 buff）。 */
    function getBuffDurationMultiplier(tpl) {
        if (!tpl || tpl.pharmacy_generated !== true) return 1;
        var lv = getImmunityLevel();
        if (!(lv > 0)) return 1;
        var mul = 1 + lv * cfg.duration_immunity_bonus_per_level;
        return Math.max(1, Math.min(3, mul));
    }

    /** 47 §4.5：免疫降低药物副作用强度（1 = 不减免）。 */
    function getSideEffectScale() {
        var lv = getImmunityLevel();
        if (!(lv > 0)) return 1;
        var red = Math.min(cfg.immunity_sideeffect_cap, lv * cfg.immunity_sideeffect_reduction);
        return Math.max(0, 1 - red);
    }

    /** 按 scale 缩放单条 effect（倍率类只缩超出 1 的部分）。 */
    function scaleEffectForImmunity(effect, scale) {
        var e = effect && typeof effect === 'object' ? effect : {};
        var params = e.params && typeof e.params === 'object' ? e.params : {};
        var out = {};
        var keys = Object.keys(params);
        var i;
        for (i = 0; i < keys.length; i++) {
            var k = keys[i];
            var v = params[k];
            if (typeof v !== 'number' || !isFinite(v)) { out[k] = v; continue; }
            if (/multiplier$/.test(k)) {
                // 增益（>1）按超出部分缩放；减益（<1）向 1 收敛
                out[k] = Math.round((v >= 1 ? (1 + (v - 1) * scale) : (1 - (1 - v) * scale)) * 1000) / 1000;
            } else {
                out[k] = Math.round(v * scale * 100) / 100;
            }
        }
        return { type: String(e.type || ''), params: out };
    }

    /**
     * 副作用 buff id：免疫等级 >0 时注册一个按免疫缩放的运行时模板（副作用强度下降），否则用静态模板。
     */
    function getScaledSideEffectBuffId(band) {
        var baseId = getToxicityBandBuffId(band);
        if (!baseId) return '';
        var scale = getSideEffectScale();
        if (scale >= 0.999) return baseId;
        var BS = getBuffSystem();
        if (!BS || typeof BS.getTemplate !== 'function' || typeof BS.registerRuntimeBuffTemplate !== 'function') return baseId;
        var base = BS.getTemplate(baseId);
        if (!base) return baseId;
        var id = baseId + '__imm' + Math.round(scale * 100);
        var tpl = JSON.parse(JSON.stringify(base));
        tpl.buff_id = id;
        tpl.name = String(base.name || '') + '·减';
        tpl.desc = String(base.desc || '') + '（免疫减轻 ' + Math.round((1 - scale) * 100) + '%）';
        tpl.effects = (base.effects || []).map(function (e) { return scaleEffectForImmunity(e, scale); });
        tpl.pharmacy_generated = true;
        BS.registerRuntimeBuffTemplate(tpl);
        return id;
    }

    /** 读当前生效的副作用 buff id（含免疫缩放版）。 */
    function getActiveSideEffectBuffId() {
        return getScaledSideEffectBuffId(getToxicityBand(getState().toxicity));
    }

    /** 状态摘要（状态栏/调试用）。 */
    function getInfo() {
        var st = getState();
        return {
            addiction: st.addiction,
            stage: getAddictionStage(st.addiction),
            stage_penalty_pct: getStagePenaltyPct(st.stage),
            suppressed: isPenaltySuppressed(),
            toxicity: st.toxicity,
            toxicity_band: getToxicityBand(st.toxicity),
            lethal_active: st.lethal_active,
            lethal_remaining: getLethalTicksRemaining()
        };
    }

    var api = {
        ADDICTION_MAX: ADDICTION_MAX,
        SYSTEMIC_ROUTES: SYSTEMIC_ROUTES,
        POTENCY_RANK: POTENCY_RANK,
        setConfig: setConfig,
        getConfig: getConfig,
        createDefaultState: createDefaultState,
        getState: getState,
        setState: setState,
        resetState: resetState,
        getImmunityLevel: getImmunityLevel,
        getBuffDurationMultiplier: getBuffDurationMultiplier,
        getSideEffectScale: getSideEffectScale,
        getScaledSideEffectBuffId: getScaledSideEffectBuffId,
        getActiveSideEffectBuffId: getActiveSideEffectBuffId,
        getAddiction: getAddiction,
        getRouteGain: getRouteGain,
        addAddictionFromRoute: addAddictionFromRoute,
        addAddiction: addAddiction,
        getAddictionStage: getAddictionStage,
        getStageBuffId: getStageBuffId,
        getStagePenaltyPct: getStagePenaltyPct,
        isPenaltySuppressed: isPenaltySuppressed,
        applyStagePenalty: applyStagePenalty,
        refreshAddictionStage: refreshAddictionStage,
        getToxicity: getToxicity,
        addToxicity: addToxicity,
        accelerateToxicityDecay: accelerateToxicityDecay,
        getToxicityBand: getToxicityBand,
        getToxicityBandBuffId: getToxicityBandBuffId,
        refreshToxicityBand: refreshToxicityBand,
        isLethalCountdownActive: isLethalCountdownActive,
        getLethalTicksRemaining: getLethalTicksRemaining,
        onWorldTick: onWorldTick,
        onBuffStateChanged: onBuffStateChanged,
        clearAllBuffs: clearAllBuffs,
        getInfo: getInfo
    };

    global.PharmacyEffects = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
