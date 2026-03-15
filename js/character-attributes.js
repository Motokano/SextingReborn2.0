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
    var state = {
        characterName: '',
        characterGender: 'male',
        innate: { jingu: 10, flexibility: 10, breath: 10, dexterity: 10, focus: 10 },
        acquired: { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 },
        dominant_hand: 'right',
        dominant_leg: 'right'
    };

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

    function getEffectiveAttr(attrId) {
        var v = (state.innate[attrId] || 0) + (state.acquired[attrId] || 0);
        return Math.max(0, v);
    }

    function getInnateAttr(attrId) {
        return Math.max(0, state.innate[attrId] != null ? state.innate[attrId] : 0);
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
            'glove_left', 'glove_right', 'shoe_left', 'shoe_right', 'ring_left', 'ring_right', 'earring_left', 'earring_right', 'necklace'];
        for (var i = 0; i < slotIds.length; i++) {
            var eq = equipmentState[slotIds[i]];
            if (!eq || !eq.item_id || !eq.enchants || !eq.enchants.length) continue;
            for (var j = 0; j < eq.enchants.length; j++) {
                var enc = getEnchantEntry(eq.enchants[j]);
                if (!enc || enc.effect_type !== 'stat_bonus' && enc.effect_type !== 'hit_bonus') continue;
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
        }
        return { acquired: acquired, hit_bonus: hitBonus };
    }

    /** 从技能等级汇总后天属性（如基本拳脚 200 级 +1 筋骨 +1 柔韧；暂无技能表则返回 0） */
    function sumFromSkills(skillsState, skillAttrGainTable) {
        var out = { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 };
        if (!skillsState || !skillAttrGainTable) return out;
        for (var skillId in skillAttrGainTable) {
            if (!skillAttrGainTable.hasOwnProperty(skillId)) continue;
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
        var skillAttrGainTable = options.skillAttrGainTable || {};

        var equipmentState = getEquipmentState();
        var skillsState = getSkillsState();

        var fromEquip = sumFromEquipment(equipmentState, getItemTemplate, getEnchantEntry);
        var fromSkills = sumFromSkills(skillsState, skillAttrGainTable);

        state.acquired.jingu = fromEquip.acquired.jingu + fromSkills.jingu;
        state.acquired.flexibility = fromEquip.acquired.flexibility + fromSkills.flexibility;
        state.acquired.breath = fromEquip.acquired.breath + fromSkills.breath;
        state.acquired.dexterity = fromEquip.acquired.dexterity + fromSkills.dexterity;
        state.acquired.focus = fromEquip.acquired.focus + fromSkills.focus;

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

        var vBase = getCfg('base_speed_no_qinggong', 1);
        var dexPct = getCfg('dexterity_speed_pct_per_point', 0.005);
        var speedPctFromEquip = 0;
        if (equipmentState) {
            var qinggongSlots = ['shoe_left', 'shoe_right'];
            for (var s = 0; s < qinggongSlots.length; s++) {
                var eq = equipmentState[qinggongSlots[s]];
                if (eq && eq.item_id) {
                    var tpl = getItemTemplate(eq.item_id);
                    if (tpl && tpl.base_speed != null) vBase = tpl.base_speed;
                    break;
                }
            }
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
        cache.combat_speed = Math.max(1, Math.floor(speedFloat));
        cache.hit_bonus_from_equipment = fromEquip.hit_bonus || 0;
    }

    /** 负重上限（只读缓存） */
    function getCarryCapacity() {
        return cache.carry_capacity;
    }

    /** 战斗速度（取整后，用于先手/连击/命中） */
    function getCombatSpeed() {
        return cache.combat_speed;
    }

    /** 徒手基础威力 B_fist(S) = floor(650 * (1 - e^(-S/450))) */
    function getFistBasePower() {
        var S = getEffectiveAttr('jingu');
        var cap = getCfg('fist_power_cap', 650);
        var scale = getCfg('fist_jingu_scale', 450);
        return Math.floor(cap * (1 - Math.exp(-S / scale)));
    }

    /**
     * 兵器筋骨：门槛修正 M_threshold 与超额增伤 M_jingu，仅看先天筋骨。
     * 返回 { canUse: boolean, M_threshold: number, M_jingu: number, M_total: number }
     */
    function getWeaponThresholdAndBonus(weaponReqJingu) {
        var req = weaponReqJingu != null ? Math.max(0, parseInt(weaponReqJingu, 10)) : getCfg('weapon_req_innate_jingu_default', 20);
        var S = getInnateAttr('jingu');
        var halfReq = req / 2;

        if (S < halfReq)
            return { canUse: false, M_threshold: 0, M_jingu: 0, M_total: 0 };

        var M_threshold = 1;
        if (S < req) {
            var t = (S - halfReq) / halfReq;
            M_threshold = 0.5 + 0.5 * t;
        }
        var bonusPct = getCfg('weapon_innate_jingu_bonus_pct_per_point', 0.05);
        var M_jingu = 1 + bonusPct * Math.max(0, S - req);
        var M_total = M_threshold * M_jingu;
        return { canUse: true, M_threshold: M_threshold, M_jingu: M_jingu, M_total: M_total };
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
    }

    function getState() {
        return {
            characterName: state.characterName,
            characterGender: state.characterGender,
            innate: { jingu: state.innate.jingu, flexibility: state.innate.flexibility, breath: state.innate.breath, dexterity: state.innate.dexterity, focus: state.innate.focus },
            acquired: { jingu: state.acquired.jingu, flexibility: state.acquired.flexibility, breath: state.acquired.breath, dexterity: state.acquired.dexterity, focus: state.acquired.focus },
            dominant_hand: state.dominant_hand,
            dominant_leg: state.dominant_leg
        };
    }

    /** 创建角色时的默认状态（基础 10、50 自由点、惯用右右） */
    function getDefaultState() {
        return {
            characterName: '',
            characterGender: 'male',
            innate: { jingu: 10, flexibility: 10, breath: 10, dexterity: 10, focus: 10 },
            acquired: { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 },
            dominant_hand: 'right',
            dominant_leg: 'right'
        };
    }

    function getCharacterName() {
        return state.characterName || '';
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

        recalcCharacterStats: recalcCharacterStats,
        getEffectiveAttr: getEffectiveAttr,
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
        getBreathActual: getBreathActual,
        getCharacterName: getCharacterName,
        getCharacterGender: getCharacterGender,
        getCharacterGenderLabel: getCharacterGenderLabel,

        getHitBonusFromEquipment: function () { return cache.hit_bonus_from_equipment; }
    };
})(typeof window !== 'undefined' ? window : this);
