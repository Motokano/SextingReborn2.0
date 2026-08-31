/**
 * 角色战斗属性模块 - 按设计文档 05-character-attributes、08-hit-parry-damage、14-implementation
 * 负责：五项基础属性（先天/后天）、衍生属性缓存、负重/速度/徒手威力/兵器筋骨/命中/招架/基础防御/伤害类型微调
 * 装备/技能/buff 变化后需调用 recalcCharacterStats() 重算缓存。
 */
(function (global) {
    'use strict';

    var ATTR_IDS = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
    var INNATE_MAX_CREATION = 29;
    var INNATE_MAX_ABSOLUTE = 40;
    var BASE_INNATE = 10;
    var FREE_POINTS_CREATION = 50;

    /** 身体部位（用于伤害类型微调） */
    var BODY_PARTS = ['head', 'chest', 'abdomen', 'left_hand', 'right_hand', 'left_foot', 'right_foot'];
    /** 伤害类型 */
    var DAMAGE_TYPES = ['slash', 'pierce', 'blunt'];

    /** 伤害类型微调系数 M[部位][类型] - 设计文档 5.6.2 推荐表 */
    var DAMAGE_TYPE_MOD = {
        head:     { slash: 1.0,  pierce: 1.1,  blunt: 1.3 },
        chest:    { slash: 1.0,  pierce: 1.2,  blunt: 1.1 },
        abdomen:  { slash: 1.1,  pierce: 1.3,  blunt: 1.0 },
        left_hand:  { slash: 1.0, pierce: 1.0, blunt: 1.1 },
        right_hand: { slash: 1.0, pierce: 1.0, blunt: 1.1 },
        left_foot:  { slash: 0.9, pierce: 1.0, blunt: 1.1 },
        right_foot: { slash: 0.9, pierce: 1.0, blunt: 1.1 }
    };

    var cfg = {};
    /** 创角完成前占位显示名（与 scene-app / npc-system 一致） */
    var PLACEHOLDER_CHARACTER_NAME = '无名氏';
    /** 隐藏称号/标签（不入常规 UI，可参与剧情条件；创角五维全 20 → 无用之人） */
    var HIDDEN_EPITHET_USELESS = '无用之人';

    var state = {
        characterName: '',
        characterGender: 'male',
        /** false：序章未创角（先天占位、侧栏隐藏）；true：已完成创角或读档老存档 */
        character_creation_completed: false,
        /** 不可见剧情用标签，字符串去重列表 */
        hidden_epithets: [],
        innate: { jingu: 10, flexibility: 10, breath: 10, dexterity: 10, focus: 10 },
        acquired: { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 },
        dominant_hand: 'right',
        dominant_leg: 'right',
        /** 曾获得过的后遗症 id 去重列表（统计「获得多少种」= length） */
        post_effects_obtained: [],
        /** 属性经验系统（24）：五维独立池，attribute_level 作为后天来源之一并入统一重算 */
        attribute_experience: {
            jingu: { exp: 0, attribute_level: 0, total_gained: 0 },
            flexibility: { exp: 0, attribute_level: 0, total_gained: 0 },
            breath: { exp: 0, attribute_level: 0, total_gained: 0 },
            dexterity: { exp: 0, attribute_level: 0, total_gained: 0 },
            focus: { exp: 0, attribute_level: 0, total_gained: 0 }
        },
        /** 七部位损毁累积值；键为 head/chest/abdomen/lhand/rhand/lfoot/rfoot（与 09、GAME_DESIGN 速查一致） */
        part_destroy: { head: 0, chest: 0, abdomen: 0, lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 }
    };

    var LIMB_DESTROY_IDS = ['lhand', 'rhand', 'lfoot', 'rfoot'];
    var PART_DESTROY_IDS = ['head', 'chest', 'abdomen', 'lhand', 'rhand', 'lfoot', 'rfoot'];
    var ATTRIBUTE_EXP_IDS = ATTR_IDS.slice();
    var ATTR_EXP_GAMMA = 1.6;
    var ATTR_EXP_PCAP = {
        tier20: 0.80,
        tier30: 0.72,
        tier40: 0.64,
        tier50Plus: 0.56
    };
    var ATTR_EXP_ESCALE = {
        tier20: 5060.86,
        tier30: 6447.65,
        tier40: 7063.27,
        tier50: 8330.74
    };
    var ATTR_EXP_DIFFICULTY_MULT_PER_TIER = 1.03;
    var ATTR_EXP_TIER_MIN = 0;
    var ATTR_EXP_TIER_MAX = 199;
    var attrExpRuntime = {
        settleLockByOwner: {},
        lastSettledTickByOwner: {}
    };
    var attrExpDebugEnabled = false;
    /** 招架/受击语义：身体部位 id（与 combat-parry 一致）→ 战斗肢 id */
    var PARRY_BODY_PART_TO_LIMB = { left_arm: 'lhand', right_arm: 'rhand', left_leg: 'lfoot', right_leg: 'rfoot' };

    function normalizePartDestroyKey(rawId) {
        var k = String(rawId || '').trim();
        if (k === 'belly') return 'abdomen';
        return k;
    }

    /** 各部位损毁「满值」：优先 `survival-config.body_part_destroy_max`，缺键时四肢回退 `limb_destroy_max`，躯干回退 09 设计值 */
    function getBodyPartDestroyMax(canonicalOrHudKey) {
        var key = normalizePartDestroyKey(canonicalOrHudKey);
        var tab = getCfg('body_part_destroy_max', null);
        if (tab && typeof tab === 'object' && tab[key] != null) {
            var tv = Math.floor(Number(tab[key]) || 0);
            if (tv > 0) return Math.max(1, tv);
        }
        var limbFb = Math.floor(Number(getCfg('limb_destroy_max', 100)) || 100);
        if (LIMB_DESTROY_IDS.indexOf(key) >= 0) return Math.max(1, limbFb);
        var designFb = { head: 50, chest: 100, abdomen: 80 };
        if (designFb[key] != null) return Math.max(1, designFb[key]);
        return Math.max(1, limbFb);
    }

    function mergePartDestroyScalar(rawKey, val) {
        if (val == null) return;
        var k = normalizePartDestroyKey(rawKey);
        if (PART_DESTROY_IDS.indexOf(k) < 0) return;
        state.part_destroy[k] = Math.max(0, Math.floor(Number(val) || 0));
    }

    function mergePartDestroyFromObject(obj) {
        if (!obj || typeof obj !== 'object') return;
        var pi;
        for (pi = 0; pi < PART_DESTROY_IDS.length; pi++) {
            var pk = PART_DESTROY_IDS[pi];
            if (obj[pk] != null) mergePartDestroyScalar(pk, obj[pk]);
        }
    }

    function createDefaultAttributeExpEntry() {
        return { exp: 0, attribute_level: 0, total_gained: 0 };
    }

    function normalizeAttributeExpEntry(raw) {
        var entry = raw && typeof raw === 'object' ? raw : {};
        return {
            exp: Math.max(0, Math.floor(Number(entry.exp) || 0)),
            attribute_level: Math.max(0, Math.floor(Number(entry.attribute_level) || 0)),
            total_gained: Math.max(0, Math.floor(Number(entry.total_gained) || 0))
        };
    }

    function ensureAttributeExperienceState() {
        if (!state.attribute_experience || typeof state.attribute_experience !== 'object') {
            state.attribute_experience = {};
        }
        for (var ai = 0; ai < ATTRIBUTE_EXP_IDS.length; ai++) {
            var attrId = ATTRIBUTE_EXP_IDS[ai];
            state.attribute_experience[attrId] = normalizeAttributeExpEntry(state.attribute_experience[attrId]);
        }
        return state.attribute_experience;
    }

    function buildAttributeExperienceSnapshot() {
        var expState = ensureAttributeExperienceState();
        var out = {};
        for (var ai = 0; ai < ATTRIBUTE_EXP_IDS.length; ai++) {
            var attrId = ATTRIBUTE_EXP_IDS[ai];
            var e = expState[attrId] || createDefaultAttributeExpEntry();
            out[attrId] = {
                exp: e.exp,
                attribute_level: e.attribute_level,
                total_gained: e.total_gained
            };
        }
        return out;
    }

    function normalizeOwnerId(ownerId) {
        return String(ownerId || '').trim();
    }

    function getCurrentTickForAttributeExp(context) {
        if (context && context.tick != null) {
            var tCtx = Math.floor(Number(context.tick) || 0);
            if (isFinite(tCtx) && tCtx >= 0) return tCtx;
        }
        var Surv = global.Survival;
        if (Surv && typeof Surv.getState === 'function') {
            var st = Surv.getState() || {};
            if (st.tickCount != null) {
                var t = Math.floor(Number(st.tickCount) || 0);
                if (isFinite(t) && t >= 0) return t;
            }
        }
        return -1;
    }

    function getAttrExpTierIndex(attributeLevel) {
        var lvl = Math.max(0, Math.floor(Number(attributeLevel) || 0));
        var tier = Math.floor(lvl / 10);
        if (tier < ATTR_EXP_TIER_MIN) tier = ATTR_EXP_TIER_MIN;
        if (tier > ATTR_EXP_TIER_MAX) tier = ATTR_EXP_TIER_MAX;
        return tier;
    }

    function getAttrExpCurveParamsByTier(tierIdx) {
        var t = Math.max(ATTR_EXP_TIER_MIN, Math.min(ATTR_EXP_TIER_MAX, Math.floor(Number(tierIdx) || 0)));
        if (t < 3) return { p_cap: ATTR_EXP_PCAP.tier20, e_scale: ATTR_EXP_ESCALE.tier20 };
        if (t === 3) return { p_cap: ATTR_EXP_PCAP.tier30, e_scale: ATTR_EXP_ESCALE.tier30 };
        if (t === 4) return { p_cap: ATTR_EXP_PCAP.tier40, e_scale: ATTR_EXP_ESCALE.tier40 };
        if (t === 5) return { p_cap: ATTR_EXP_PCAP.tier50Plus, e_scale: ATTR_EXP_ESCALE.tier50 };
        var stepFrom50 = t - 5;
        return {
            p_cap: ATTR_EXP_PCAP.tier50Plus,
            e_scale: ATTR_EXP_ESCALE.tier50 * Math.pow(ATTR_EXP_DIFFICULTY_MULT_PER_TIER, stepFrom50)
        };
    }

    function calcAttrExpProbability(expCurrent, attributeLevelSnapshot) {
        var E = Math.max(0, Math.floor(Number(expCurrent) || 0));
        if (E <= 0) return 0;
        var tierIdx = getAttrExpTierIndex(attributeLevelSnapshot);
        var curve = getAttrExpCurveParamsByTier(tierIdx);
        var pCap = Math.max(0, Math.min(0.999999, Number(curve.p_cap) || 0));
        var eScale = Math.max(1, Number(curve.e_scale) || 1);
        var ratio = E / eScale;
        var inner = 1 - Math.exp(-Math.pow(ratio, ATTR_EXP_GAMMA));
        var p = pCap * inner;
        if (!isFinite(p)) return 0;
        return Math.max(0, Math.min(pCap, p));
    }

    function sumFromAttributeExperience(attributeExperienceState) {
        var out = { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 };
        if (!attributeExperienceState || typeof attributeExperienceState !== 'object') return out;
        for (var ai = 0; ai < ATTRIBUTE_EXP_IDS.length; ai++) {
            var attrId = ATTRIBUTE_EXP_IDS[ai];
            var e = normalizeAttributeExpEntry(attributeExperienceState[attrId]);
            out[attrId] = e.attribute_level;
        }
        return out;
    }

    function warnAttrExp(message, payload) {
        if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
            if (payload !== undefined) console.warn('[AttributeEXP]', message, payload);
            else console.warn('[AttributeEXP]', message);
        }
    }
    function logAttrExpDebug(payload) {
        if (!attrExpDebugEnabled) return;
        if (typeof console !== 'undefined' && console && typeof console.log === 'function') {
            console.log('[AttributeEXP][DEBUG]', payload);
        }
    }

    function getDefaultRecalcOptions() {
        return {
            getEquipmentState: function () {
                return (global.InventoryEquipment && typeof global.InventoryEquipment.getState === 'function')
                    ? (global.InventoryEquipment.getState().equipment || {})
                    : {};
            },
            getSkillsState: function () {
                return (global.InventoryEquipment && typeof global.InventoryEquipment.getState === 'function')
                    ? (global.InventoryEquipment.getState().skills || {})
                    : {};
            },
            getItemTemplate: function (itemId) {
                return (global.InventoryEquipment && typeof global.InventoryEquipment.getItemTemplate === 'function')
                    ? global.InventoryEquipment.getItemTemplate(itemId)
                    : null;
            },
            getEnchantEntry: function (enchantId) {
                return (global.InventoryEquipment && typeof global.InventoryEquipment.getEnchantEntry === 'function')
                    ? global.InventoryEquipment.getEnchantEntry(enchantId)
                    : null;
            },
            getStrengthLevel: function () {
                var IE = global.InventoryEquipment;
                if (!IE || typeof IE.getState !== 'function') return 0;
                var st = IE.getState() || {};
                return st.skills && st.skills.survival_strength ? (st.skills.survival_strength.level || 0) : 0;
            }
        };
    }
    // 供 Buff 等系统注入的后天五维修正（最终会并入 acquired 参与重算）
    var externalAcquiredBonus = { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 };

    // 肌肉/来源带来的“先天五维”奖励缓存（每次重算时覆盖写入；先天成就待定，见 34 §6）
    var innateBonusFromMuscles = { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 };

    /** 缓存：重算后写入，公式与 UI 只读缓存 */
    var cache = {
        effective: {},
        carry_capacity: 25,
        combat_speed: 1,
        hit_bonus_from_equipment: 0
    };

    function getCfg(key, def) {
        return (cfg[key] !== undefined && cfg[key] !== null) ? cfg[key] : def;
    }

    function normalizeDamageTypeId(v) {
        var id = String(v || '').toLowerCase();
        return DAMAGE_TYPES.indexOf(id) >= 0 ? id : null;
    }

    function toPct(raw) {
        var v = Number(raw);
        if (!isFinite(v)) return 0;
        if (Math.abs(v) > 1) return v / 100;
        return v;
    }

    function createDamageTypeModifierBag() {
        return {
            add_flat: { blunt: 0, slash: 0, pierce: 0 },
            add_from_pct: [],
            increase_pct: { blunt: 0, slash: 0, pierce: 0 },
            convert_pct: { blunt_to_slash: 0, slash_to_pierce: 0 }
        };
    }

    function mergeDamageTypeModifierBag(dst, src) {
        if (!src || typeof src !== 'object') return dst;
        var t;
        if (src.add_flat && typeof src.add_flat === 'object') {
            for (t in dst.add_flat) {
                if (!dst.add_flat.hasOwnProperty(t)) continue;
                dst.add_flat[t] += Number(src.add_flat[t]) || 0;
            }
        }
        if (src.increase_pct && typeof src.increase_pct === 'object') {
            for (t in dst.increase_pct) {
                if (!dst.increase_pct.hasOwnProperty(t)) continue;
                dst.increase_pct[t] += toPct(src.increase_pct[t]);
            }
        }
        if (src.convert_pct && typeof src.convert_pct === 'object') {
            dst.convert_pct.blunt_to_slash += toPct(src.convert_pct.blunt_to_slash);
            dst.convert_pct.slash_to_pierce += toPct(src.convert_pct.slash_to_pierce);
        }
        if (Array.isArray(src.add_from_pct)) {
            for (var i = 0; i < src.add_from_pct.length; i++) {
                var ent = src.add_from_pct[i] || {};
                var source = normalizeDamageTypeId(ent.source || ent.from);
                var target = normalizeDamageTypeId(ent.target || ent.to);
                var pct = toPct(ent.pct != null ? ent.pct : ent.value);
                if (!source || !target || !pct) continue;
                dst.add_from_pct.push({ source: source, target: target, pct: pct });
            }
        }
        dst.convert_pct.blunt_to_slash = Math.max(0, Math.min(1, dst.convert_pct.blunt_to_slash));
        dst.convert_pct.slash_to_pierce = Math.max(0, Math.min(1, dst.convert_pct.slash_to_pierce));
        return dst;
    }

    function parseEnchantDamageTypeModifier(enc) {
        if (!enc || !enc.effect_type || !enc.effect_params) return null;
        var p = enc.effect_params || {};
        var bag = createDamageTypeModifierBag();
        if (enc.effect_type === 'damage_type_flat_bonus') {
            var t1 = normalizeDamageTypeId(p.damage_type || p.type || p.target_damage_type);
            if (!t1) return null;
            bag.add_flat[t1] += Number(p.value) || 0;
            return bag;
        }
        if (enc.effect_type === 'damage_type_increase_pct') {
            var t2 = normalizeDamageTypeId(p.damage_type || p.type);
            if (!t2) return null;
            bag.increase_pct[t2] += toPct(p.pct != null ? p.pct : p.value);
            return bag;
        }
        if (enc.effect_type === 'damage_type_convert_pct') {
            var from = normalizeDamageTypeId(p.from_damage_type || p.from);
            var to = normalizeDamageTypeId(p.to_damage_type || p.to);
            if (!from || !to) return null;
            if (from === 'blunt' && to === 'slash') bag.convert_pct.blunt_to_slash += toPct(p.pct != null ? p.pct : p.value);
            if (from === 'slash' && to === 'pierce') bag.convert_pct.slash_to_pierce += toPct(p.pct != null ? p.pct : p.value);
            return bag;
        }
        if (enc.effect_type === 'damage_type_gain_from_type_pct') {
            var src = normalizeDamageTypeId(p.source_damage_type || p.source || p.from_damage_type);
            var dst = normalizeDamageTypeId(p.target_damage_type || p.target || p.to_damage_type);
            if (!src || !dst) return null;
            bag.add_from_pct.push({ source: src, target: dst, pct: toPct(p.pct != null ? p.pct : p.value) });
            return bag;
        }
        return null;
    }

    function getDamageTypeCombatModifiers() {
        var bag = createDamageTypeModifierBag();
        var IE = global.InventoryEquipment;
        if (!IE || typeof IE.getState !== 'function' || typeof IE.getEnchantEntry !== 'function') return bag;
        var eq = IE.getState() && IE.getState().equipment ? IE.getState().equipment : {};
        for (var slot in eq) {
            if (!Object.prototype.hasOwnProperty.call(eq, slot)) continue;
            var inst = eq[slot];
            if (!inst || !Array.isArray(inst.enchants)) continue;
            for (var i = 0; i < inst.enchants.length; i++) {
                var ench = IE.getEnchantEntry(inst.enchants[i]);
                mergeDamageTypeModifierBag(bag, parseEnchantDamageTypeModifier(ench));
            }
        }
        return bag;
    }

    function getEffectiveAttr(attrId) {
        var v = getInnateAttr(attrId) + (state.acquired[attrId] || 0);
        return Math.max(0, v);
    }

    function getBaseInnateAttr(attrId) {
        return Math.max(0, state.innate[attrId] != null ? state.innate[attrId] : 0);
    }

    function getInnateAttr(attrId) {
        var base = getBaseInnateAttr(attrId);
        var bonus = innateBonusFromMuscles[attrId] != null ? innateBonusFromMuscles[attrId] : 0;
        return Math.max(0, base + bonus);
    }

    function getAcquiredAttr(attrId) {
        return Math.max(0, state.acquired[attrId] != null ? state.acquired[attrId] : 0);
    }

    /** 从装备词条汇总后天属性与命中加成（供 recalc 使用） */
    function sumFromEquipment(equipmentState, getItemTemplate, getEnchantEntry) {
        var acquired = { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 };
        var hitBonus = 0;
        if (!equipmentState || !getItemTemplate || !getEnchantEntry) return { acquired: acquired, hit_bonus: hitBonus };

        var slotIds = ['head', 'clothing', 'vest', 'backpack', 'weapon_left', 'weapon_right',
            'glove_left', 'glove_right', 'shoe_left', 'shoe_right'];
        function applyEnchant(encId) {
            var enc = getEnchantEntry(encId);
            if (!enc || enc.effect_type !== 'stat_bonus' && enc.effect_type !== 'hit_bonus') return;
            if (enc.effect_type === 'stat_bonus' && enc.effect_params) {
                var sid = enc.effect_params.stat_id;
                var val = enc.effect_params.value;
                if (sid && acquired[sid] !== undefined && typeof val === 'number') {
                    var cap = (enc.cap != null) ? enc.cap : 999;
                    var current = acquired[sid];
                    acquired[sid] = current + Math.max(-cap, Math.min(cap, val));
                }
            }
            if (enc.effect_type === 'hit_bonus' && enc.effect_params && typeof enc.effect_params.hit_pct === 'number') {
                var hcap = (enc.cap != null) ? enc.cap : 1;
                hitBonus += Math.max(-hcap, Math.min(hcap, enc.effect_params.hit_pct));
            }
        }
        for (var i = 0; i < slotIds.length; i++) {
            var eq = equipmentState[slotIds[i]];
            if (!eq || !eq.item_id) continue;
            // 模块化防具（37/38）：词条来自模块实例的 enchant_id
            if (eq.modules && typeof eq.modules === 'object') {
                for (var mk in eq.modules) {
                    var mi = eq.modules[mk];
                    if (mi && mi.enchant_id) applyEnchant(mi.enchant_id);
                }
                continue;
            }
            if (!eq.enchants || !eq.enchants.length) continue;
            for (var j = 0; j < eq.enchants.length; j++) applyEnchant(eq.enchants[j]);
        }
        return { acquired: acquired, hit_bonus: hitBonus };
    }

    /**
     * 从技能等级汇总后天属性。表结构见 survival-config `skill_attr_gain`：
     * 每属性 { threshold, value } → 当 level >= threshold 时加 value * floor(level / threshold)。
     */
    function sumFromSkills(skillsState, skillAttrGainTable) {
        var out = { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 };
        if (!skillsState || !skillAttrGainTable) return out;
        for (var skillId in skillAttrGainTable) {
            if (!skillAttrGainTable.hasOwnProperty(skillId)) continue;
            // 整条"技能等级 -> 后天五维"成长线已下线（05 5.4）：skill_attr_gain 空表 + combat_* 显式跳过，仅保留函数体防旧档/工具误用
            if (String(skillId).indexOf('combat_') === 0) continue;
            var level = skillsState[skillId] && skillsState[skillId].level != null ? Math.max(0, parseInt(skillsState[skillId].level, 10)) : 0;
            var gains = skillAttrGainTable[skillId];
            if (!gains) continue;
            for (var attr in gains) {
                if (gains.hasOwnProperty(attr) && out[attr] !== undefined) {
                    var perLevel = gains[attr].perLevel || 0;
                    var threshold = gains[attr].threshold || 0;
                    if (threshold > 0 && level >= threshold)
                        out[attr] += (gains[attr].value || 0) * Math.floor(level / threshold);
                    else if (threshold === 0 && perLevel !== 0)
                        out[attr] += perLevel * level;
                }
            }
        }
        return out;
    }

    /**
     * 统一重算入口：装备、技能、buff 等变化后调用。
     * 需要外部传入：getEquipmentState(), getSkillsState(), getItemTemplate(), getEnchantEntry(), getStrengthLevel()
     */
    function recalcCharacterStats(options) {
        options = options || {};
        var getEquipmentState = options.getEquipmentState || function () { return {}; };
        var getSkillsState = options.getSkillsState || function () { return {}; };
        var getItemTemplate = options.getItemTemplate || function () { return null; };
        var getEnchantEntry = options.getEnchantEntry || function () { return null; };
        var getStrengthLevel = options.getStrengthLevel || function () { return 0; };
        var skillAttrGainTable = options.skillAttrGainTable;
        if (skillAttrGainTable == null || typeof skillAttrGainTable !== 'object') {
            skillAttrGainTable = cfg.skill_attr_gain && typeof cfg.skill_attr_gain === 'object' ? cfg.skill_attr_gain : {};
        }

        var equipmentState = getEquipmentState();
        var skillsState = getSkillsState();

        var fromEquip = sumFromEquipment(equipmentState, getItemTemplate, getEnchantEntry);
        var fromSkills = sumFromSkills(skillsState, skillAttrGainTable);
        var fromAttributeExp = sumFromAttributeExperience(state.attribute_experience);
        // 基础后天来源：装备 + 技能等级表（已移除“熟练度阈值奖励后天五维”）
        state.acquired.jingu = fromEquip.acquired.jingu + fromSkills.jingu + fromAttributeExp.jingu;
        state.acquired.flexibility = fromEquip.acquired.flexibility + fromSkills.flexibility + fromAttributeExp.flexibility;
        state.acquired.breath = fromEquip.acquired.breath + fromSkills.breath + fromAttributeExp.breath;
        state.acquired.dexterity = fromEquip.acquired.dexterity + fromSkills.dexterity + fromAttributeExp.dexterity;
        state.acquired.focus = fromEquip.acquired.focus + fromSkills.focus + fromAttributeExp.focus;

        // 外部来源（例如 Buff）统一并入后天
        state.acquired.jingu += externalAcquiredBonus.jingu || 0;
        state.acquired.flexibility += externalAcquiredBonus.flexibility || 0;
        state.acquired.breath += externalAcquiredBonus.breath || 0;
        state.acquired.dexterity += externalAcquiredBonus.dexterity || 0;
        state.acquired.focus += externalAcquiredBonus.focus || 0;

        // 肌肉来源（替代原经脉穴位，见 34-muscle-system-rework.md）：后天四维（不奖励专注）+ 底气上限 maxQi；先天成就待定（34 §6）
        var extraMaxQi = 0;
        for (var k in innateBonusFromMuscles) {
            if (innateBonusFromMuscles.hasOwnProperty(k)) innateBonusFromMuscles[k] = 0;
        }
        if (typeof global !== 'undefined' && global.Muscles && typeof global.Muscles.getStatBonus === 'function') {
            var bonus = global.Muscles.getStatBonus() || {};
            var acq = bonus.acquired || {};
            state.acquired.jingu       += acq.jingu       || 0;
            state.acquired.flexibility += acq.flexibility || 0;
            state.acquired.breath      += acq.breath      || 0;
            state.acquired.dexterity   += acq.dexterity   || 0;
            state.acquired.focus       += acq.focus       || 0;
            // innate（先天成就）保持 0：原任督/全通先天奖励的去留见 34 §6 未决项
            extraMaxQi = bonus.maxQi || 0;
        }

        var jingu = getEffectiveAttr('jingu');
        var flexibility = getEffectiveAttr('flexibility');
        var breath = getEffectiveAttr('breath');
        var dexterity = getEffectiveAttr('dexterity');

        cache.effective = {
            jingu: jingu,
            flexibility: flexibility,
            breath: breath,
            dexterity: dexterity,
            focus: getEffectiveAttr('focus')
        };

        var Wbase = getCfg('base_carry_weight_kg', 25);
        var jinguCoef = getCfg('jingu_carry_weight_pct_per_point', 0.0005);
        var strCoef = getCfg('strength_carry_weight_pct_per_level', 0.01);
        var strLevel = getStrengthLevel();
        cache.carry_capacity = Wbase * (1 + strCoef * strLevel + jinguCoef * jingu);

        var vBase = getCfg('base_speed_no_footwork', getCfg('base_speed_no_qinggong', 1));
        var dexPct = getCfg('dexterity_speed_pct_per_point', 0.005);
        var speedPctFromEquip = 0;
        var hubFoot = null;
        if (typeof options.getCombatHubs === 'function') {
            var H = options.getCombatHubs();
            if (H) {
                hubFoot = H.footwork != null ? H.footwork : H.light;
            }
        } else if (typeof global !== 'undefined' && global.InventoryEquipment && typeof global.InventoryEquipment.getCombatState === 'function') {
            try {
                var cst = global.InventoryEquipment.getCombatState();
                if (cst && cst.hubs) hubFoot = cst.hubs.footwork != null ? cst.hubs.footwork : cst.hubs.light;
            } catch (eHub) { hubFoot = null; }
        }
        var footworkSpeedFlat = 0;
        if (hubFoot && typeof global !== 'undefined' && global.CombatSkills && typeof global.CombatSkills.getSkill === 'function') {
            var fskFoot = global.CombatSkills.getSkill(hubFoot);
            if (fskFoot && fskFoot.category === 'footwork') {
                if (fskFoot.combat_speed_base != null) {
                    var vb = Number(fskFoot.combat_speed_base);
                    if (isFinite(vb) && vb > 0) vBase = vb;
                }
                var per10 = fskFoot.combat_speed_per_10_levels;
                if (typeof per10 === 'number' && isFinite(per10) && per10 !== 0 && skillsState && skillsState[hubFoot]) {
                    var flv = parseInt(skillsState[hubFoot].level, 10);
                    if (!isFinite(flv) || flv < 0) flv = 0;
                    footworkSpeedFlat = Math.floor(flv / 10) * per10;
                }
            }
        }
        if (equipmentState) {
            for (var slot in equipmentState) {
                if (!equipmentState.hasOwnProperty(slot) || !equipmentState[slot] || !equipmentState[slot].enchants) continue;
                var encList = equipmentState[slot].enchants;
                for (var e = 0; e < encList.length; e++) {
                    var ent = getEnchantEntry(encList[e]);
                    if (ent && ent.effect_type === 'speed_bonus' && ent.effect_params && typeof ent.effect_params.speed_pct === 'number')
                        speedPctFromEquip += Math.min(ent.cap != null ? ent.cap : 1, ent.effect_params.speed_pct);
                }
            }
        }
        var speedFloat = vBase * (1 + dexPct * dexterity + speedPctFromEquip);
        // 鞋子速度加成（k17，39 §6.4 闪避侧重）：左右取更差，乘到战斗速度上（运动鞋/钉鞋加速，重靴不加成）
        var shoeSpeedCoef = 1;
        if (typeof global !== 'undefined' && global.InventoryEquipment && typeof global.InventoryEquipment.getShoeSpeedCoef === 'function') {
            try {
                var ssc = Number(global.InventoryEquipment.getShoeSpeedCoef());
                if (isFinite(ssc) && ssc > 0) shoeSpeedCoef = ssc;
            } catch (eShoe) { shoeSpeedCoef = 1; }
        }
        // 内部保留小数（每点身手都有真实增量，05 5.7）；仅展示层取整
        cache.combat_speed = Math.max(1, (speedFloat + footworkSpeedFlat) * shoeSpeedCoef);
        cache.hit_bonus_from_equipment = fromEquip.hit_bonus || 0;

        // 肌肉「底气上限+N」→ Survival.diqi_cap_limit 的扁平加成（见 computeDiqiCapLimitFromBreath）
        if (typeof global !== 'undefined' && global.Survival && typeof global.Survival.setDiqiCapLimitFlatBonus === 'function') {
            global.Survival.setDiqiCapLimitFlatBonus('muscles', Math.max(0, Math.round(Number(extraMaxQi) || 0)));
        }
        if (typeof global !== 'undefined' && global.Survival && typeof global.Survival.refreshDiqiMaxFromBreath === 'function') {
            global.Survival.refreshDiqiMaxFromBreath(breath);
        }
    }

    /** 负重上限（只读缓存） */
    function getCarryCapacity() {
        return cache.carry_capacity;
    }

    /** 战斗速度（内部保留小数，用于先手/连击/命中；仅展示取整，见 05 5.7） */
    function getCombatSpeed() {
        return cache.combat_speed;
    }

    /** 徒手拳底 B_fist（05 5.5.2 分段曲线）：S ≤ fist_lin_segment_max 线性（每点 fist_lin_gain_per_point），
     *  高段接原饱和尾（cap/div 封顶、fist_curve_scale 衰减）——低段手感更稳，500+/800+ 锚点与旧表一致。
     *  配置字段 fist_base_cap/fist_curve_scale/fist_base_div/fist_lin_segment_max/fist_lin_gain_per_point */
    function getFistBasePower() {
        var S = getEffectiveAttr('jingu');
        var cap = getCfg('fist_base_cap', 650);
        var scale = getCfg('fist_curve_scale', 450);
        var div = getCfg('fist_base_div', 2);
        var linMax = getCfg('fist_lin_segment_max', 150);
        var linGain = getCfg('fist_lin_gain_per_point', 0.7);
        if (!isFinite(cap) || cap <= 0) cap = 650;
        if (!isFinite(scale) || scale <= 0) scale = 450;
        if (!isFinite(div) || div <= 0) div = 2;
        if (!isFinite(linMax) || linMax < 0) linMax = 150;
        if (!isFinite(linGain) || linGain < 0) linGain = 0.7;
        var raw;
        if (S <= linMax) {
            raw = linGain * S;
        } else {
            var linValue = linGain * linMax;
            var tailCap = cap / div - linValue;
            if (tailCap <= 0) tailCap = 0;
            raw = linValue + tailCap * (1 - Math.exp(-(S - linMax) / scale));
        }
        return Math.max(0, Math.floor(raw));
    }

    /**
     * 兵器筋骨（05 5.5.3）：只作**门槛判定**——先天筋骨决定"能不能用"与"惩罚区减伤"；
     * **不提供任何增伤**（先天增伤是徒手技能专属特色，见 05 5.5.2/5.5.3）。
     * 返回 { canUse: boolean, M_threshold: number, M_total: number }（M_total = M_threshold）
     */
    function getWeaponThresholdAndBonus(weaponReqJingu) {
        var req = weaponReqJingu != null ? Math.max(0, parseInt(weaponReqJingu, 10)) : getCfg('weapon_req_innate_jingu_default', 20);
        var S = getInnateAttr('jingu');
        var halfReq = req / 2;

        if (S < halfReq)
            return { canUse: false, M_threshold: 0, M_total: 0 };

        var M_threshold = 1;
        if (S < req) {
            var t = (S - halfReq) / halfReq;
            M_threshold = 0.5 + 0.5 * t;
        }
        return { canUse: true, M_threshold: M_threshold, M_total: M_threshold };
    }

    /** 能否装备/挥动该兵器（先天筋骨 >= 0.5 * req） */
    function canUseWeapon(weaponReqJingu) {
        var req = weaponReqJingu != null ? Math.max(0, parseInt(weaponReqJingu, 10)) : getCfg('weapon_req_innate_jingu_default', 20);
        return getInnateAttr('jingu') >= req / 2;
    }

    /** 基础防御减伤率 DR = S_柔韧 / (S_柔韧 + 3*D_进)；D_进 为进入该步的伤害 */
    function getBaseDefenseDR(damageIn) {
        var S = getEffectiveAttr('flexibility');
        if (S <= 0) return 0;
        var D = Math.max(0, damageIn);
        var factor = getCfg('base_defense_D_factor', 3);
        return S / (S + factor * D);
    }

    /** 基础防御后输出伤害 D_out = D_in * (1 - DR) */
    function applyBaseDefense(damageIn) {
        var dr = getBaseDefenseDR(damageIn);
        return Math.max(0, damageIn * (1 - dr));
    }

    /** 伤害类型微调系数 M[部位][类型] */
    function getDamageTypeModifier(bodyPart, damageType) {
        var part = DAMAGE_TYPE_MOD[bodyPart];
        if (!part) return 1;
        var v = part[damageType];
        return v != null ? v : 1;
    }

    /** 命中率：攻防速度、词条加成；常数从配置读取。返回 0～1 */
    function getHitRate(attackerSpeed, defenderSpeed) {
        var Peq = getCfg('hit_base_at_equal_speed', 0.825);
        var Pmax = getCfg('hit_base_max', 0.95);
        var Pmin = getCfg('hit_base_min', 0.05);
        var Ccap = getCfg('hit_final_cap', 0.99);
        var L = getCfg('hit_curve_L', 2);
        var eps = getCfg('hit_epsilon', 1e-6);

        var Vatk = Math.max(0, attackerSpeed);
        var Vdef = Math.max(eps, defenderSpeed);
        var r = Vatk / Vdef;

        var Pbase;
        if (r >= 1) {
            Pbase = Peq + (Pmax - Peq) * (Math.log(r) / (L + Math.log(r)));
            Pbase = Math.max(Peq, Math.min(Pmax, Pbase));
        } else {
            Pbase = Peq * r + Pmin * (1 - r);
            Pbase = Math.max(Pmin, Math.min(Peq, Pbase));
        }
        var withBonus = Pbase + cache.hit_bonus_from_equipment;
        return Math.min(Ccap, Math.max(0, withBonus));
    }

    /** 招架成功率（柔韧倍率 + 硬上限 75%） */
    function getParryChance(baseParryChance) {
        var mult = getCfg('parry_flexibility_mult_per_point', 0.005);
        var cap = getCfg('parry_chance_cap', 0.75);
        var raw = baseParryChance * (1 + mult * getEffectiveAttr('flexibility'));
        return Math.min(cap, Math.max(0, raw));
    }

    /** 卸力比例（柔韧倍率 + 硬上限 50%） */
    function getParryDamageReduce(baseParryReduce) {
        var mult = getCfg('parry_flexibility_mult_per_point', 0.005);
        var cap = getCfg('parry_damage_reduce_cap', 0.5);
        var raw = baseParryReduce * (1 + mult * getEffectiveAttr('flexibility'));
        return Math.min(cap, Math.max(0, raw));
    }

    /** 惯用肢体系数：出招肢体为惯用手/腿 1.1，否则 0.9。limbSlot: 'weapon_left'|'weapon_right'|'glove_left'|'glove_right'|'shoe_left'|'shoe_right' */
    function getDominantLimbMultiplier(limbSlot) {
        var dominant = getCfg('dominant_limb_damage_mult', 1.1);
        var nonDominant = getCfg('non_dominant_limb_damage_mult', 0.9);
        var hand = state.dominant_hand || 'right';
        var leg = state.dominant_leg || 'right';
        if (limbSlot === 'weapon_right' || limbSlot === 'glove_right')
            return hand === 'right' ? dominant : nonDominant;
        if (limbSlot === 'weapon_left' || limbSlot === 'glove_left')
            return hand === 'left' ? dominant : nonDominant;
        if (limbSlot === 'shoe_right')
            return leg === 'right' ? dominant : nonDominant;
        if (limbSlot === 'shoe_left')
            return leg === 'left' ? dominant : nonDominant;
        return 1;
    }

    function setConfig(config) {
        if (config && typeof config === 'object') {
            for (var k in config) if (config.hasOwnProperty(k)) cfg[k] = config[k];
        }
    }

    function setState(s) {
        if (!s || typeof s !== 'object') return;
        ensureAttributeExperienceState();
        if (s.innate) {
            ATTR_IDS.forEach(function (id) {
                if (s.innate[id] != null) state.innate[id] = Math.max(0, Math.min(INNATE_MAX_ABSOLUTE, parseInt(s.innate[id], 10)));
            });
        }
        if (s.acquired) {
            ATTR_IDS.forEach(function (id) {
                if (s.acquired[id] != null) state.acquired[id] = Math.max(0, parseInt(s.acquired[id], 10));
            });
        }
        if (s.dominant_hand === 'left' || s.dominant_hand === 'right') state.dominant_hand = s.dominant_hand;
        if (s.dominant_leg === 'left' || s.dominant_leg === 'right') state.dominant_leg = s.dominant_leg;
        if (s.characterName !== undefined) state.characterName = String(s.characterName);
        if (s.characterGender === 'male' || s.characterGender === 'female') state.characterGender = s.characterGender;
        if (s.character_creation_completed === true) {
            state.character_creation_completed = true;
        } else if (s.character_creation_completed === false) {
            state.character_creation_completed = false;
        } else if (!Object.prototype.hasOwnProperty.call(s, 'character_creation_completed')) {
            var nm = state.characterName;
            if (nm && nm !== PLACEHOLDER_CHARACTER_NAME) {
                state.character_creation_completed = true;
            } else {
                var ssum = 0;
                ATTR_IDS.forEach(function (id) {
                    ssum += (state.innate[id] != null) ? Number(state.innate[id]) : 0;
                });
                state.character_creation_completed = ssum > 5;
            }
        }
        if (Array.isArray(s.post_effects_obtained)) {
            var seenPe = {};
            state.post_effects_obtained = [];
            for (var pi = 0; pi < s.post_effects_obtained.length; pi++) {
                var pid = String(s.post_effects_obtained[pi] || '').trim();
                if (!pid || seenPe[pid]) continue;
                seenPe[pid] = true;
                state.post_effects_obtained.push(pid);
            }
        }
        if (s.part_destroy && typeof s.part_destroy === 'object') {
            mergePartDestroyFromObject(s.part_destroy);
        }
        if (s.limb_destroy && typeof s.limb_destroy === 'object') {
            for (var li = 0; li < LIMB_DESTROY_IDS.length; li++) {
                var lid = LIMB_DESTROY_IDS[li];
                if (s.limb_destroy[lid] != null) mergePartDestroyScalar(lid, s.limb_destroy[lid]);
            }
        }
        if (s.torso_destroy && typeof s.torso_destroy === 'object') {
            var ts = s.torso_destroy;
            if (ts.head != null) mergePartDestroyScalar('head', ts.head);
            if (ts.chest != null) mergePartDestroyScalar('chest', ts.chest);
            if (ts.abdomen != null) mergePartDestroyScalar('abdomen', ts.abdomen);
            if (ts.belly != null) mergePartDestroyScalar('abdomen', ts.belly);
        }
        if (Array.isArray(s.hidden_epithets)) {
            var seenH = {};
            state.hidden_epithets = [];
            for (var he = 0; he < s.hidden_epithets.length; he++) {
                var het = String(s.hidden_epithets[he] || '').trim();
                if (!het || seenH[het]) continue;
                seenH[het] = true;
                state.hidden_epithets.push(het);
            }
        }
        if (s.attribute_experience && typeof s.attribute_experience === 'object') {
            for (var ae = 0; ae < ATTRIBUTE_EXP_IDS.length; ae++) {
                var aid = ATTRIBUTE_EXP_IDS[ae];
                if (Object.prototype.hasOwnProperty.call(s.attribute_experience, aid)) {
                    state.attribute_experience[aid] = normalizeAttributeExpEntry(s.attribute_experience[aid]);
                }
            }
        }
        try {
            if (typeof global !== 'undefined' && global.NPCSystem && typeof global.NPCSystem.syncPlayerEpithetFlags === 'function') {
                global.NPCSystem.syncPlayerEpithetFlags();
            }
        } catch (eEpSync) { /* ignore */ }
    }

    /** 当前部位损毁累积值；`belly` 与 `abdomen` 同键 */
    function getPartDestroy(rawId) {
        var k = normalizePartDestroyKey(rawId);
        if (PART_DESTROY_IDS.indexOf(k) < 0) return 0;
        var raw = state.part_destroy[k];
        if (raw == null || raw === '') return 0;
        return Math.max(0, Math.floor(Number(raw) || 0));
    }

    function getLimbDestroy(limbId) {
        return getPartDestroy(limbId);
    }

    /** 规范部位空间（head/chest/abdomen/left_arm/right_arm/left_leg/right_leg）→ 运行时损毁键（head/chest/abdomen/lhand/rhand/lfoot/rfoot） */
    function normalizeDestroyKeyForCombat(rawId) {
        var k = String(rawId || '').trim();
        if (k === 'belly') return 'abdomen';
        if (k === 'left_arm') return 'lhand';
        if (k === 'right_arm') return 'rhand';
        if (k === 'left_leg') return 'lfoot';
        if (k === 'right_leg') return 'rfoot';
        return k;
    }

    /**
     * 战斗受击损毁写入（09-body-parts「损毁写入」规则，玩家侧；敌人侧同规则在 combat-enemies）：
     * Q = 本次最终伤害（已取整）。命中部位未损毁 → Q 全加该部位（封顶溢出作废）；
     * 已损毁 → Q 均分到未损毁部位（每部位先 floor(Q/n)，余数按 头→胸→腹→左手→右手→左脚→右脚 顺序 +1）；全损毁 → Q 作废。
     * @param {string} hitPartId 规范或运行时部位键（left_arm / lhand 等均可）
     * @param {number} q 损毁增加值（最终伤害）
     */
    function applyCombatDestroy(hitPartId, q) {
        q = Math.max(0, Math.floor(Number(q) || 0));
        if (q <= 0) return;
        var k = normalizeDestroyKeyForCombat(hitPartId);
        if (PART_DESTROY_IDS.indexOf(k) < 0) k = 'chest';
        var cur = getPartDestroy(k);
        var mx = getBodyPartDestroyMax(k);
        if (cur < mx) {
            state.part_destroy[k] = Math.min(mx, cur + q);
            return;
        }
        var open = [];
        for (var i = 0; i < PART_DESTROY_IDS.length; i++) {
            var pk = PART_DESTROY_IDS[i];
            if (getPartDestroy(pk) < getBodyPartDestroyMax(pk)) open.push(pk);
        }
        if (!open.length) return;
        var base = Math.floor(q / open.length);
        var rem = q % open.length;
        for (var j = 0; j < open.length; j++) {
            var ok = open[j];
            var addj = base + (j < rem ? 1 : 0);
            if (addj <= 0) continue;
            var cj = getPartDestroy(ok);
            var mj = getBodyPartDestroyMax(ok);
            var av = Math.min(addj, mj - cj);
            if (av > 0) state.part_destroy[ok] = cj + av;
        }
    }

    /**
     * 与 CombatParry.resolveParryPhaseContext 的 isBodyPartDestroyed 一致：参数为 left_arm 等。
     * 损毁值 ≥ 该肢 `getBodyPartDestroyMax` 视为已损毁。
     */
    function isBodyPartDestroyedForParry(bodyPartId) {
        var bp = String(bodyPartId || '').trim();
        var limb = PARRY_BODY_PART_TO_LIMB[bp];
        if (!limb) return false;
        var maxV = getBodyPartDestroyMax(limb);
        return getLimbDestroy(limb) >= maxV;
    }

    /**
     * 血气化劲：选一非头肢 +destroyDelta 损毁（须 ≤ 上限−1），并返还 diqiGain 底气（经 Survival 夹紧）。
     * @returns {{ ok: boolean, reason_key?: string, limb?: string }}
     */
    function tryApplyXueQiHuaJing(destroyDelta, diqiGain) {
        var dDel = Math.max(0, Math.floor(Number(destroyDelta) || 0));
        var dGain = Math.max(0, Math.floor(Number(diqiGain) || 0));
        if (dDel <= 0) return { ok: false, reason_key: 'combat.hub.fail.xue_qi.params' };
        var order = LIMB_DESTROY_IDS.slice();
        var seed = Date.now() % 1000;
        for (var s = 0; s < order.length; s++) {
            var j = s + (seed % (order.length - s));
            var tmp = order[s];
            order[s] = order[j];
            order[j] = tmp;
        }
        var i;
        for (i = 0; i < order.length; i++) {
            var limb = order[i];
            var maxTotal = getBodyPartDestroyMax(limb);
            var capAfter = maxTotal - 1;
            if (capAfter < 1) continue;
            var cur = getLimbDestroy(limb);
            if (cur + dDel <= capAfter) {
                state.part_destroy[limb] = cur + dDel;
                if (typeof global !== 'undefined' && global.Survival && dGain > 0) {
                    if (typeof global.Survival.changeDiqi === 'function') {
                        global.Survival.changeDiqi({ curDelta: dGain, sourceTag: 'hub_action:xue_qi_hua_jing' });
                    } else if (typeof global.Survival.addDiqiCurrent === 'function') {
                        global.Survival.addDiqiCurrent(dGain);
                    }
                }
                return { ok: true, limb: limb };
            }
        }
        return { ok: false, reason_key: 'combat.hub.fail.xue_qi.no_limb' };
    }

    /** 登记曾获得的后遗症（去重）；返回是否新加入 */
    function registerPostEffectObtained(postEffectId) {
        var id = String(postEffectId || '').trim();
        if (!id) return false;
        for (var i = 0; i < state.post_effects_obtained.length; i++) {
            if (state.post_effects_obtained[i] === id) return false;
        }
        state.post_effects_obtained.push(id);
        return true;
    }

    /** 不对玩家 UI 展示；查询前会合并熟练度解锁项（与 sync 一致）。 */
    function getPostEffectsObtainedCount() {
        syncPostEffectsObtainedFromSkillsState();
        return state.post_effects_obtained.length;
    }

    /** 不对玩家 UI 展示；查询前会合并熟练度解锁项。 */
    function getPostEffectsObtainedIds() {
        syncPostEffectsObtainedFromSkillsState();
        return state.post_effects_obtained.slice();
    }

    /** 不对玩家 UI 展示；供条件脚本判断是否曾获得某后遗症 id。 */
    function hasPostEffectObtained(postEffectId) {
        syncPostEffectsObtainedFromSkillsState();
        var id = String(postEffectId || '').trim();
        if (!id) return false;
        for (var hi = 0; hi < state.post_effects_obtained.length; hi++) {
            if (state.post_effects_obtained[hi] === id) return true;
        }
        return false;
    }

    /**
     * 根据 InventoryEquipment 中技能招式使用次数与 combat-skills 配置的 post_effect_unlocks 同步「已获得」列表。
     * 通常由查询 API 内部调用；剧情发奖用 registerPostEffectObtained。
     */
    function syncPostEffectsObtainedFromSkillsState() {
        var IE = global.InventoryEquipment;
        var CS = global.CombatSkills;
        if (!IE || typeof IE.getState !== 'function' || !CS || typeof CS.getSkill !== 'function' || typeof CS.getProficiencyRatio !== 'function') return;
        var skillsState = IE.getState().skills || {};
        function syncPostEffectsForEntries(entries, moveUsage) {
            if (!entries || !entries.length) return;
            var mi;
            for (mi = 0; mi < entries.length; mi++) {
                var m = entries[mi];
                if (!m || !m.id || !m.post_effect_unlocks || !m.post_effect_unlocks.length) continue;
                var uses = moveUsage[m.id] != null ? parseInt(moveUsage[m.id], 10) || 0 : 0;
                var maxU = m.proficiency_max_uses != null ? m.proficiency_max_uses : null;
                var ratio = CS.getProficiencyRatio(uses, maxU);
                var ui;
                for (ui = 0; ui < m.post_effect_unlocks.length; ui++) {
                    var pu = m.post_effect_unlocks[ui];
                    if (!pu || pu.post_effect_id == null) continue;
                    var minR = pu.min_proficiency_ratio != null ? Number(pu.min_proficiency_ratio) : 0;
                    if (ratio >= minR) registerPostEffectObtained(pu.post_effect_id);
                }
            }
        }
        for (var skillId in skillsState) {
            if (!Object.prototype.hasOwnProperty.call(skillsState, skillId)) continue;
            var entry = skillsState[skillId];
            var moveUsage = (entry && entry.move_usage && typeof entry.move_usage === 'object') ? entry.move_usage : {};
            var skill = CS.getSkill(skillId);
            if (!skill) continue;
            if (skill.category === 'footwork') continue;
            syncPostEffectsForEntries(skill.moves, moveUsage);
            syncPostEffectsForEntries(skill.hub_actions, moveUsage);
        }
    }

    function setExternalAcquiredBonus(bonus) {
        bonus = bonus || {};
        ATTR_IDS.forEach(function (id) {
            var v = bonus[id];
            externalAcquiredBonus[id] = (typeof v === 'number' && isFinite(v)) ? v : 0;
        });
    }

    function getExternalAcquiredBonus() {
        return {
            jingu: externalAcquiredBonus.jingu,
            flexibility: externalAcquiredBonus.flexibility,
            breath: externalAcquiredBonus.breath,
            dexterity: externalAcquiredBonus.dexterity,
            focus: externalAcquiredBonus.focus
        };
    }

    /**
     * 发放属性经验（仅入账，不触发重算）。
     * 条目级容错：非法 attr_id/exp 仅跳过该条并告警，不中断整批。
     */
    function grantAttributeExp(ownerId, grants, context) {
        var owner = normalizeOwnerId(ownerId);
        if (owner !== 'player') return { ok: false, reason: 'unsupported_owner', applied: [] };
        ensureAttributeExperienceState();
        var applied = [];
        if (!Array.isArray(grants)) return { ok: true, applied: applied };
        for (var i = 0; i < grants.length; i++) {
            var g = grants[i] || {};
            var attrId = String(g.attr_id || '').trim();
            if (ATTRIBUTE_EXP_IDS.indexOf(attrId) < 0) {
                warnAttrExp('grantAttributeExp ignored invalid attr_id', { ownerId: owner, attr_id: g.attr_id, context: context });
                continue;
            }
            var exp = Math.floor(Number(g.exp) || 0);
            if (!(exp > 0)) {
                warnAttrExp('grantAttributeExp ignored invalid exp', { ownerId: owner, attr_id: attrId, exp: g.exp, context: context });
                continue;
            }
            state.attribute_experience[attrId].exp += exp;
            state.attribute_experience[attrId].total_gained += exp;
            applied.push({ attr_id: attrId, exp_applied: exp });
        }
        return { ok: true, applied: applied };
    }

    /**
     * 结算一次属性经验：固定时序（快照->判定->批量落盘->统一重算一次）。
     * 同 tick 去重 + 同 owner 重入锁，避免重复结算与并发重入。
     */
    function settleAttributeExpOnce(ownerId, context) {
        var owner = normalizeOwnerId(ownerId);
        if (owner !== 'player') {
            return { ok: false, reason: 'unsupported_owner', dedup_skipped: false, lock_skipped: false, any_success: false, settled: [] };
        }
        ensureAttributeExperienceState();
        var nowTick = getCurrentTickForAttributeExp(context);
        if (nowTick >= 0 && attrExpRuntime.lastSettledTickByOwner[owner] === nowTick) {
            return { ok: true, dedup_skipped: true, lock_skipped: false, any_success: false, settled: [] };
        }
        if (attrExpRuntime.settleLockByOwner[owner]) {
            warnAttrExp('settleAttributeExpOnce skipped by reentry lock', { ownerId: owner, context: context });
            return { ok: true, dedup_skipped: false, lock_skipped: true, any_success: false, settled: [] };
        }
        attrExpRuntime.settleLockByOwner[owner] = true;
        try {
            var rng = (context && typeof context.rng === 'function') ? context.rng : Math.random;
            var snapshot = buildAttributeExperienceSnapshot();
            var staged = {};
            var settled = [];
            var anySuccess = false;
            for (var ai = 0; ai < ATTRIBUTE_EXP_IDS.length; ai++) {
                var attrId = ATTRIBUTE_EXP_IDS[ai];
                var before = snapshot[attrId] || createDefaultAttributeExpEntry();
                var probability = calcAttrExpProbability(before.exp, before.attribute_level);
                var roll = Number(rng());
                if (!isFinite(roll)) roll = 1;
                var success = before.exp > 0 && roll < probability;
                var nextExp = success ? 0 : before.exp;
                var nextLevel = before.attribute_level + (success ? 1 : 0);
                staged[attrId] = {
                    exp: nextExp,
                    attribute_level: nextLevel,
                    total_gained: before.total_gained
                };
                if (success) anySuccess = true;
                settled.push({
                    attr_id: attrId,
                    exp_before: before.exp,
                    attribute_level_before: before.attribute_level,
                    probability: probability,
                    success: success,
                    exp_after: nextExp,
                    attribute_level_after: nextLevel
                });
                logAttrExpDebug({
                    tick: nowTick,
                    ownerId: owner,
                    attr_id: attrId,
                    exp_before: before.exp,
                    probability: probability,
                    success: success,
                    exp_after: nextExp,
                    attribute_level_after: nextLevel
                });
            }
            for (var si = 0; si < ATTRIBUTE_EXP_IDS.length; si++) {
                var sid = ATTRIBUTE_EXP_IDS[si];
                state.attribute_experience[sid] = staged[sid];
            }
            if (anySuccess) {
                recalcCharacterStats(getDefaultRecalcOptions());
            }
            if (nowTick >= 0) attrExpRuntime.lastSettledTickByOwner[owner] = nowTick;
            return {
                ok: true,
                dedup_skipped: false,
                lock_skipped: false,
                any_success: anySuccess,
                settled: settled
            };
        } finally {
            attrExpRuntime.settleLockByOwner[owner] = false;
        }
    }

    function getAttributeExpState(ownerId) {
        var owner = normalizeOwnerId(ownerId);
        if (owner !== 'player') return {};
        return buildAttributeExperienceSnapshot();
    }

    function previewAttributeExpProbability(ownerId, attr_id) {
        var owner = normalizeOwnerId(ownerId);
        var attrId = String(attr_id || '').trim();
        if (owner !== 'player' || ATTRIBUTE_EXP_IDS.indexOf(attrId) < 0) {
            return { ok: false, probability: 0 };
        }
        ensureAttributeExperienceState();
        var e = state.attribute_experience[attrId];
        var tierIdx = getAttrExpTierIndex(e.attribute_level);
        return {
            ok: true,
            attr_id: attrId,
            exp_current: e.exp,
            attribute_level: e.attribute_level,
            tier_index: tierIdx,
            probability: calcAttrExpProbability(e.exp, e.attribute_level)
        };
    }

    function setAttributeExpDebugEnabled(enabled) {
        attrExpDebugEnabled = !!enabled;
    }

    function isAttributeExpDebugEnabled() {
        return !!attrExpDebugEnabled;
    }

    function getState() {
        ensureAttributeExperienceState();
        return {
            characterName: state.characterName,
            characterGender: state.characterGender,
            character_creation_completed: !!state.character_creation_completed,
            innate: { jingu: state.innate.jingu, flexibility: state.innate.flexibility, breath: state.innate.breath, dexterity: state.innate.dexterity, focus: state.innate.focus },
            acquired: { jingu: state.acquired.jingu, flexibility: state.acquired.flexibility, breath: state.acquired.breath, dexterity: state.acquired.dexterity, focus: state.acquired.focus },
            dominant_hand: state.dominant_hand,
            dominant_leg: state.dominant_leg,
            post_effects_obtained: state.post_effects_obtained.slice(),
            attribute_experience: buildAttributeExperienceSnapshot(),
            part_destroy: {
                head: state.part_destroy.head,
                chest: state.part_destroy.chest,
                abdomen: state.part_destroy.abdomen,
                lhand: state.part_destroy.lhand,
                rhand: state.part_destroy.rhand,
                lfoot: state.part_destroy.lfoot,
                rfoot: state.part_destroy.rfoot
            },
            limb_destroy: {
                lhand: state.part_destroy.lhand,
                rhand: state.part_destroy.rhand,
                lfoot: state.part_destroy.lfoot,
                rfoot: state.part_destroy.rfoot
            },
            hidden_epithets: state.hidden_epithets.slice()
        };
    }

    /** 创建角色时的默认状态（基础 10、50 自由点、惯用右右） */
    function getDefaultState() {
        return {
            characterName: PLACEHOLDER_CHARACTER_NAME,
            characterGender: 'male',
            character_creation_completed: false,
            innate: { jingu: 1, flexibility: 1, breath: 1, dexterity: 1, focus: 1 },
            acquired: { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 },
            dominant_hand: 'right',
            dominant_leg: 'right',
            post_effects_obtained: [],
            attribute_experience: {
                jingu: createDefaultAttributeExpEntry(),
                flexibility: createDefaultAttributeExpEntry(),
                breath: createDefaultAttributeExpEntry(),
                dexterity: createDefaultAttributeExpEntry(),
                focus: createDefaultAttributeExpEntry()
            },
            part_destroy: { head: 0, chest: 0, abdomen: 0, lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 },
            limb_destroy: { lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 },
            hidden_epithets: []
        };
    }

    function getCharacterName() {
        return state.characterName || '';
    }

    function isCharacterCreationCompleted() {
        return !!state.character_creation_completed;
    }

    function hasHiddenEpithet(epithet) {
        var t = String(epithet || '').trim();
        if (!t) return false;
        for (var hi = 0; hi < state.hidden_epithets.length; hi++) {
            if (state.hidden_epithets[hi] === t) return true;
        }
        return false;
    }

    /** 创角：先天五维均为 20 时写入隐藏称号「无用之人」 */
    function innateAllTwentyForUselessPerson(innate) {
        if (!innate || typeof innate !== 'object') return false;
        for (var ai = 0; ai < ATTR_IDS.length; ai++) {
            var id = ATTR_IDS[ai];
            var v = innate[id] != null ? parseInt(innate[id], 10) : 0;
            if (v !== 20) return false;
        }
        return true;
    }

    function getCharacterGender() {
        return state.characterGender === 'female' ? 'female' : 'male';
    }

    function getCharacterGenderLabel() {
        return state.characterGender === 'female' ? '女' : '男';
    }

    /** 呼吸实际值（供 Survival 等模块回调） */
    function getBreathActual() {
        return getEffectiveAttr('breath');
    }

    global.CharacterAttributes = {
        ATTR_IDS: ATTR_IDS,
        BODY_PARTS: BODY_PARTS,
        DAMAGE_TYPES: DAMAGE_TYPES,
        DAMAGE_TYPE_MOD: DAMAGE_TYPE_MOD,
        BASE_INNATE: BASE_INNATE,
        FREE_POINTS_CREATION: FREE_POINTS_CREATION,
        INNATE_MAX_CREATION: INNATE_MAX_CREATION,
        INNATE_MAX_ABSOLUTE: INNATE_MAX_ABSOLUTE,

        setConfig: setConfig,
        setState: setState,
        getState: getState,
        getDefaultState: getDefaultState,
        setExternalAcquiredBonus: setExternalAcquiredBonus,
        getExternalAcquiredBonus: getExternalAcquiredBonus,

        recalcCharacterStats: recalcCharacterStats,
        getEffectiveAttr: getEffectiveAttr,
        getBaseInnateAttr: getBaseInnateAttr,
        getInnateAttr: getInnateAttr,
        getAcquiredAttr: getAcquiredAttr,
        getCarryCapacity: getCarryCapacity,
        getCombatSpeed: getCombatSpeed,
        getFistBasePower: getFistBasePower,
        getWeaponThresholdAndBonus: getWeaponThresholdAndBonus,
        canUseWeapon: canUseWeapon,
        getBaseDefenseDR: getBaseDefenseDR,
        applyBaseDefense: applyBaseDefense,
        getDamageTypeModifier: getDamageTypeModifier,
        getHitRate: getHitRate,
        getParryChance: getParryChance,
        getParryDamageReduce: getParryDamageReduce,
        getDominantLimbMultiplier: getDominantLimbMultiplier,
        getDamageTypeCombatModifiers: getDamageTypeCombatModifiers,
        getBreathActual: getBreathActual,
        getCfg: getCfg,
        getBodyPartDestroyMax: getBodyPartDestroyMax,
        getPartDestroy: getPartDestroy,
        getLimbDestroy: getLimbDestroy,
        applyCombatDestroy: applyCombatDestroy,
        isBodyPartDestroyedForParry: isBodyPartDestroyedForParry,
        tryApplyXueQiHuaJing: tryApplyXueQiHuaJing,
        getCharacterName: getCharacterName,
        isCharacterCreationCompleted: isCharacterCreationCompleted,
        PLACEHOLDER_CHARACTER_NAME: PLACEHOLDER_CHARACTER_NAME,
        HIDDEN_EPITHET_USELESS: HIDDEN_EPITHET_USELESS,
        hasHiddenEpithet: hasHiddenEpithet,
        innateAllTwentyForUselessPerson: innateAllTwentyForUselessPerson,
        getCharacterGender: getCharacterGender,
        getCharacterGenderLabel: getCharacterGenderLabel,

        registerPostEffectObtained: registerPostEffectObtained,
        getPostEffectsObtainedCount: getPostEffectsObtainedCount,
        getPostEffectsObtainedIds: getPostEffectsObtainedIds,
        hasPostEffectObtained: hasPostEffectObtained,
        syncPostEffectsObtainedFromSkillsState: syncPostEffectsObtainedFromSkillsState,
        grantAttributeExp: grantAttributeExp,
        settleAttributeExpOnce: settleAttributeExpOnce,
        getAttributeExpState: getAttributeExpState,
        previewAttributeExpProbability: previewAttributeExpProbability,
        setAttributeExpDebugEnabled: setAttributeExpDebugEnabled,
        isAttributeExpDebugEnabled: isAttributeExpDebugEnabled,

        getHitBonusFromEquipment: function () { return cache.hit_bonus_from_equipment; }
    };
})(typeof window !== 'undefined' ? window : this);
