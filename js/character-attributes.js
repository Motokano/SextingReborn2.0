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
        /** 四肢损毁累积值（非头）；血气化劲等见 19 §6.1 */
        limb_destroy: { lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 }
    };

    var LIMB_DESTROY_IDS = ['lhand', 'rhand', 'lfoot', 'rfoot'];
    // 供 Buff 等系统注入的后天五维修正（最终会并入 acquired 参与重算）
    var externalAcquiredBonus = { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 };

    // 经脉穴位带来的“先天五维”奖励（每次重算时覆盖写入）
    var innateBonusFromAcupoints = { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 };

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
        var v = getInnateAttr(attrId) + (state.acquired[attrId] || 0);
        return Math.max(0, v);
    }

    function getBaseInnateAttr(attrId) {
        return Math.max(0, state.innate[attrId] != null ? state.innate[attrId] : 0);
    }

    function getInnateAttr(attrId) {
        var base = getBaseInnateAttr(attrId);
        var bonus = innateBonusFromAcupoints[attrId] != null ? innateBonusFromAcupoints[attrId] : 0;
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

    /**
     * 从技能等级汇总后天属性。表结构见 survival-config `skill_attr_gain`：
     * 每属性 { threshold, value } → 当 level >= threshold 时加 value * floor(level / threshold)。
     */
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

    function accumulateProficiencyAttrUnlocks(entries, moveUsage, getProfRatio, out) {
        if (!entries || !entries.length) return;
        var ei;
        for (ei = 0; ei < entries.length; ei++) {
            var ent = entries[ei];
            if (!ent || !ent.id || !ent.proficiency_attr_unlocks || !ent.proficiency_attr_unlocks.length) continue;
            var uses = moveUsage[ent.id] != null ? parseInt(moveUsage[ent.id], 10) || 0 : 0;
            var maxU = ent.proficiency_max_uses != null ? ent.proficiency_max_uses : null;
            var r = getProfRatio(uses, maxU);
            var ui;
            for (ui = 0; ui < ent.proficiency_attr_unlocks.length; ui++) {
                var u = ent.proficiency_attr_unlocks[ui];
                if (!u || u.min_proficiency_ratio == null) continue;
                var minR = Number(u.min_proficiency_ratio);
                if (!(r >= minR)) continue;
                var acq = u.acquired;
                if (!acq || typeof acq !== 'object') continue;
                var aid;
                for (aid in acq) {
                    if (!acq.hasOwnProperty(aid)) continue;
                    if (out[aid] === undefined) continue;
                    var add = acq[aid];
                    if (typeof add === 'number' && isFinite(add)) out[aid] += add;
                }
            }
        }
    }

    /**
     * 单招式 / hub_actions 熟练度达阈值时给予后天五维（与 post_effect_unlocks 同一套 R）。
     * 配置：`data/combat-skills.json` 的 `moves[]`、**`hub_actions[]`** 上 `proficiency_attr_unlocks`，以及招架类 **`parry_proficiency_attr_unlocks`**（按 `parry_proficiency_usage_key` 计 R）。
     * 依赖 global.CombatSkills；未加载时返回零。
     */
    /** 招架类：按 `parry_proficiency_usage_key` 的 R 触发 `parry_proficiency_attr_unlocks` */
    function accumulateParryProficiencyAttrUnlocks(skTpl, moveUsage, getProfRatio, out) {
        if (!skTpl || skTpl.category !== 'parry' || !skTpl.parry_proficiency_attr_unlocks || !skTpl.parry_proficiency_attr_unlocks.length) return;
        var pKey = skTpl.parry_proficiency_usage_key || 'parry_success';
        var pMax = skTpl.parry_proficiency_max_uses != null ? skTpl.parry_proficiency_max_uses : null;
        var uses = moveUsage[pKey] != null ? parseInt(moveUsage[pKey], 10) || 0 : 0;
        var r = getProfRatio(uses, pMax);
        var pi;
        for (pi = 0; pi < skTpl.parry_proficiency_attr_unlocks.length; pi++) {
            var pu = skTpl.parry_proficiency_attr_unlocks[pi];
            if (!pu || pu.min_proficiency_ratio == null) continue;
            if (!(r >= Number(pu.min_proficiency_ratio))) continue;
            var acq = pu.acquired;
            if (!acq || typeof acq !== 'object') continue;
            var aid;
            for (aid in acq) {
                if (!acq.hasOwnProperty(aid)) continue;
                if (out[aid] === undefined) continue;
                var add = acq[aid];
                if (typeof add === 'number' && isFinite(add)) out[aid] += add;
            }
        }
    }

    function sumFromMoveProficiencyAttrUnlocks(skillsState) {
        var out = { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 };
        if (!skillsState || typeof global === 'undefined' || !global.CombatSkills) return out;
        var CS = global.CombatSkills;
        var getSkill = CS.getSkill;
        var getProfRatio = CS.getProficiencyRatio;
        if (typeof getSkill !== 'function' || typeof getProfRatio !== 'function') return out;
        for (var skillId in skillsState) {
            if (!skillsState.hasOwnProperty(skillId)) continue;
            var skTpl = getSkill(skillId);
            if (!skTpl) continue;
            if (skTpl.category === 'footwork') continue;
            var entry = skillsState[skillId];
            var moveUsage = (entry && entry.move_usage && typeof entry.move_usage === 'object') ? entry.move_usage : {};
            accumulateProficiencyAttrUnlocks(skTpl.moves || [], moveUsage, getProfRatio, out);
            accumulateProficiencyAttrUnlocks(skTpl.hub_actions || [], moveUsage, getProfRatio, out);
            accumulateParryProficiencyAttrUnlocks(skTpl, moveUsage, getProfRatio, out);
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
        var fromMoveProf = sumFromMoveProficiencyAttrUnlocks(skillsState);

        // 基础后天来源：装备 + 技能等级表 + 招式熟练度阈值奖励
        state.acquired.jingu = fromEquip.acquired.jingu + fromSkills.jingu + fromMoveProf.jingu;
        state.acquired.flexibility = fromEquip.acquired.flexibility + fromSkills.flexibility + fromMoveProf.flexibility;
        state.acquired.breath = fromEquip.acquired.breath + fromSkills.breath + fromMoveProf.breath;
        state.acquired.dexterity = fromEquip.acquired.dexterity + fromSkills.dexterity + fromMoveProf.dexterity;
        state.acquired.focus = fromEquip.acquired.focus + fromSkills.focus + fromMoveProf.focus;

        // 外部来源（例如 Buff）统一并入后天
        state.acquired.jingu += externalAcquiredBonus.jingu || 0;
        state.acquired.flexibility += externalAcquiredBonus.flexibility || 0;
        state.acquired.breath += externalAcquiredBonus.breath || 0;
        state.acquired.dexterity += externalAcquiredBonus.dexterity || 0;
        state.acquired.focus += externalAcquiredBonus.focus || 0;

        // 经脉穴位来源：后天五维 + 先天五维（任督/全通成就）
        var extraMaxQi = 0;
        for (var k in innateBonusFromAcupoints) {
            if (innateBonusFromAcupoints.hasOwnProperty(k)) innateBonusFromAcupoints[k] = 0;
        }
        if (typeof global !== 'undefined' && global.Acupoints && typeof global.Acupoints.getStatBonus === 'function') {
            var bonus = global.Acupoints.getStatBonus() || {};
            var acq = bonus.acquired || {};
            var inn = bonus.innate || {};
            state.acquired.jingu       += acq.jingu       || 0;
            state.acquired.flexibility += acq.flexibility || 0;
            state.acquired.breath      += acq.breath      || 0;
            state.acquired.dexterity   += acq.dexterity   || 0;
            state.acquired.focus       += acq.focus       || 0;
            innateBonusFromAcupoints.jingu       = inn.jingu       || 0;
            innateBonusFromAcupoints.flexibility = inn.flexibility || 0;
            innateBonusFromAcupoints.breath      = inn.breath      || 0;
            innateBonusFromAcupoints.dexterity   = inn.dexterity   || 0;
            innateBonusFromAcupoints.focus       = inn.focus       || 0;
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
        cache.combat_speed = Math.max(1, Math.floor(speedFloat) + footworkSpeedFlat);
        cache.hit_bonus_from_equipment = fromEquip.hit_bonus || 0;

        if (typeof global !== 'undefined' && global.Survival && typeof global.Survival.refreshDiqiMaxFromBreath === 'function') {
            global.Survival.refreshDiqiMaxFromBreath(breath);
        }
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
        if (s.limb_destroy && typeof s.limb_destroy === 'object') {
            for (var li = 0; li < LIMB_DESTROY_IDS.length; li++) {
                var lid = LIMB_DESTROY_IDS[li];
                if (s.limb_destroy[lid] != null) {
                    state.limb_destroy[lid] = Math.max(0, Math.floor(Number(s.limb_destroy[lid]) || 0));
                }
            }
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
        try {
            if (typeof global !== 'undefined' && global.NPCSystem && typeof global.NPCSystem.syncPlayerEpithetFlags === 'function') {
                global.NPCSystem.syncPlayerEpithetFlags();
            }
        } catch (eEpSync) { /* ignore */ }
    }

    function getLimbDestroy(limbId) {
        if (!limbId || state.limb_destroy[limbId] == null) return 0;
        return Math.max(0, Math.floor(state.limb_destroy[limbId] || 0));
    }

    /**
     * 血气化劲：选一非头肢 +destroyDelta 损毁（须 ≤ 上限−1），并返还 diqiGain 底气（经 Survival 夹紧）。
     * @returns {{ ok: boolean, reason_key?: string, limb?: string }}
     */
    function tryApplyXueQiHuaJing(destroyDelta, diqiGain) {
        var dDel = Math.max(0, Math.floor(Number(destroyDelta) || 0));
        var dGain = Math.max(0, Math.floor(Number(diqiGain) || 0));
        if (dDel <= 0) return { ok: false, reason_key: 'combat.hub.fail.xue_qi.params' };
        var maxTotal = getCfg('limb_destroy_max', 100);
        var capAfter = maxTotal - 1;
        if (capAfter < 1) return { ok: false, reason_key: 'combat.hub.fail.xue_qi.config' };
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
            var cur = getLimbDestroy(limb);
            if (cur + dDel <= capAfter) {
                state.limb_destroy[limb] = cur + dDel;
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

    function getState() {
        return {
            characterName: state.characterName,
            characterGender: state.characterGender,
            character_creation_completed: !!state.character_creation_completed,
            innate: { jingu: state.innate.jingu, flexibility: state.innate.flexibility, breath: state.innate.breath, dexterity: state.innate.dexterity, focus: state.innate.focus },
            acquired: { jingu: state.acquired.jingu, flexibility: state.acquired.flexibility, breath: state.acquired.breath, dexterity: state.acquired.dexterity, focus: state.acquired.focus },
            dominant_hand: state.dominant_hand,
            dominant_leg: state.dominant_leg,
            post_effects_obtained: state.post_effects_obtained.slice(),
            limb_destroy: {
                lhand: state.limb_destroy.lhand,
                rhand: state.limb_destroy.rhand,
                lfoot: state.limb_destroy.lfoot,
                rfoot: state.limb_destroy.rfoot
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
        getBreathActual: getBreathActual,
        getLimbDestroy: getLimbDestroy,
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

        getHitBonusFromEquipment: function () { return cache.hit_bonus_from_equipment; }
    };
})(typeof window !== 'undefined' ? window : this);
