/**
 * 战斗技能系统 - 按 docs/design/11-skills.md 8.3
 * 负责：配置读取、潜能消耗曲线、基础威力、招式熟练度、技能总熟练度、招架数值
 * 不负责状态存储，状态由 InventoryEquipment 的 skills + combat 提供
 */
(function (global) {
    'use strict';

    var config = {
        constants: {},
        categories: [],
        skills: {}
    };

    function setConfig(cfg) {
        if (!cfg) return;
        if (cfg.constants) config.constants = cfg.constants;
        if (cfg.categories && Array.isArray(cfg.categories)) config.categories = cfg.categories;
        if (cfg.skills && typeof cfg.skills === 'object') config.skills = cfg.skills;
    }

    function getConstants() {
        return config.constants;
    }

    function getCategories() {
        return config.categories;
    }

    function getSkill(skillId) {
        return config.skills[skillId] || null;
    }

    function getSkills() {
        return config.skills;
    }

    /** 按分类返回技能列表（仅该分类下的技能） */
    function getSkillsByCategory(catId) {
        var list = [];
        for (var sid in config.skills) {
            if (config.skills[sid].category === catId) list.push(config.skills[sid]);
        }
        return list;
    }

    /** 难度系数 1~4 对应倍数 */
    function getDifficultyMultiplier(skillId) {
        var sk = getSkill(skillId);
        if (!sk || sk.difficulty == null) return 1;
        var idx = Math.max(0, Math.min(3, parseInt(sk.difficulty, 10) - 1));
        var mults = config.constants.difficulty_multipliers || [1, 2, 3, 4];
        return mults[idx] != null ? mults[idx] : 1;
    }

    /**
     * 技能模板上的等级上限（未含角色事件修正）。缺省取 constants.default_combat_skill_max_level（通常 1000）。
     */
    function getTemplateMaxLevel(skillId) {
        var def = config.constants.default_combat_skill_max_level != null
            ? parseInt(config.constants.default_combat_skill_max_level, 10)
            : 1000;
        if (!isFinite(def) || def < 1) def = 1000;
        var sk = getSkill(skillId);
        if (sk && sk.max_level != null) {
            var ml = parseInt(sk.max_level, 10);
            if (isFinite(ml) && ml >= 1) return ml;
        }
        return def;
    }

    /**
     * 角色对某战斗技能等级上限的加成（可正可负），来自剧情/事件等；存于 character.skill_max_level_bonus[skillId]
     */
    function getSkillMaxLevelBonus(character, skillId) {
        if (!character || !character.skill_max_level_bonus || typeof character.skill_max_level_bonus !== 'object') return 0;
        var b = character.skill_max_level_bonus[skillId];
        if (b == null) return 0;
        var n = parseInt(b, 10);
        return isFinite(n) ? n : 0;
    }

    /**
     * 有效等级上限（模板 + 角色修正），至少为 1。character 可省略，则等于模板值。
     * 仅决定「能练到多少级」；潜能/Base(L)/招架等曲线以 getTemplateMaxLevel 封顶，超额等级无额外数值（见 11-skills）。
     */
    function getEffectiveSkillMaxLevel(character, skillId) {
        var base = getTemplateMaxLevel(skillId);
        var bonus = getSkillMaxLevelBonus(character, skillId);
        return Math.max(1, base + bonus);
    }

    /**
     * 参与威力/潜能/招架等**数值曲线**的等级：min(实际等级, 模板上限)。超额级（如事件 +1 后的 1001）与满模板级属性相同。
     */
    function getSkillLevelForStatCurves(skillId, level) {
        var cap = getTemplateMaxLevel(skillId);
        var L = parseInt(level, 10);
        if (!isFinite(L)) L = 0;
        return Math.min(Math.max(0, L), cap);
    }

    function getDependencySkillLevel(character, skillId) {
        var sk = getSkill(skillId);
        if (!sk || !sk.level_cap_skill_id) return null;
        var depId = sk.level_cap_skill_id;
        if (!character || !character.skills || !character.skills[depId]) return 0;
        var lv = character.skills[depId].level;
        return Math.max(0, parseInt(lv, 10) || 0);
    }

    /**
     * 实际可练到的等级上限：min(有效上限, 依赖技能等级)（若配置了 level_cap_skill_id）。
     */
    function getProgressionSkillMaxLevel(character, skillId) {
        var eff = getEffectiveSkillMaxLevel(character, skillId);
        var dep = getDependencySkillLevel(character, skillId);
        if (dep === null) return eff;
        return Math.max(0, Math.min(eff, dep));
    }

    function addSkillMaxLevelBonus(character, skillId, delta) {
        if (!character || !skillId) return;
        if (!character.skill_max_level_bonus || typeof character.skill_max_level_bonus !== 'object') {
            character.skill_max_level_bonus = {};
        }
        var cur = getSkillMaxLevelBonus(character, skillId);
        character.skill_max_level_bonus[skillId] = cur + (parseInt(delta, 10) || 0);
    }

    function setSkillMaxLevelBonus(character, skillId, value) {
        if (!character || !skillId) return;
        if (!character.skill_max_level_bonus || typeof character.skill_max_level_bonus !== 'object') {
            character.skill_max_level_bonus = {};
        }
        character.skill_max_level_bonus[skillId] = parseInt(value, 10) || 0;
    }

    /**
     * 某等级升到下一级所需潜能（难度 1 时基础曲线）
     * 1～200: 5000; 201～400: 5000+75*(L-200); 401～模板满级: 20000+25*(L-400)。曲线不随事件加上限外推。
     * @param {string} skillId
     * @param {number} level 当前等级（升级前）
     * @param {object} [character] 含 skills、skill_max_level_bonus，用于夹紧可练区间
     */
    function getPotentialCostForLevel(skillId, level, character) {
        var progCap = character ? getProgressionSkillMaxLevel(character, skillId) : getTemplateMaxLevel(skillId);
        var raw = Math.max(1, parseInt(level, 10) || 1);
        raw = Math.min(raw, progCap);
        var templateCap = getTemplateMaxLevel(skillId);
        level = Math.max(1, Math.min(templateCap, raw));
        var c = config.constants;
        var base = 5000;
        if (level >= 201 && level <= 400) {
            base = (c.potential_cost_201_400_base || 5000) + (c.potential_cost_201_400_per_level || 75) * (level - 200);
        } else if (level >= 401) {
            base = (c.potential_cost_401_1000_base || 20000) + (c.potential_cost_401_1000_per_level || 25) * (level - 400);
        } else {
            base = c.potential_cost_1_200 != null ? c.potential_cost_1_200 : 5000;
        }
        return Math.floor(base * getDifficultyMultiplier(skillId));
    }

    /** 单招式满熟练度所需使用次数 */
    var MOVE_PROFICIENCY_MAX = 50000;

    function getMoveProficiencyMax() {
        return (config.constants.move_proficiency_max_uses != null)
            ? config.constants.move_proficiency_max_uses
            : MOVE_PROFICIENCY_MAX;
    }

    /** 熟练度比例 R = min(P/maxUses, 1)；maxUses 缺省用全局 move_proficiency_max_uses */
    function getProficiencyRatio(useCount, proficiencyMaxUses) {
        var maxU = proficiencyMaxUses != null && isFinite(proficiencyMaxUses) && proficiencyMaxUses > 0
            ? Math.floor(Number(proficiencyMaxUses))
            : getMoveProficiencyMax();
        if (maxU <= 0) return 1;
        return Math.min(1, (parseInt(useCount, 10) || 0) / maxU);
    }

    /** 招式熟练度比例 R_move = min(P/50000, 1) */
    function getMoveProficiencyRatio(useCount) {
        return getProficiencyRatio(useCount, null);
    }

    /** 技能总熟练度 = 所有 moves + hub_actions 熟练度比例的算术平均（无条目则 0） */
    function getSkillTotalProficiency(skillId, moveUsage) {
        var sk = getSkill(skillId);
        if (!sk) return 0;
        if (sk.category === 'footwork') return 0;
        if (sk.category === 'parry') {
            var pKey = sk.parry_proficiency_usage_key || 'parry_success';
            var pMax = sk.parry_proficiency_max_uses != null ? sk.parry_proficiency_max_uses : getMoveProficiencyMax();
            var pc = (moveUsage && moveUsage[pKey] != null) ? parseInt(moveUsage[pKey], 10) || 0 : 0;
            return getProficiencyRatio(pc, pMax);
        }
        var sum = 0;
        var n = 0;
        var i;
        if (sk.moves && sk.moves.length) {
            for (i = 0; i < sk.moves.length; i++) {
                var mid = sk.moves[i].id;
                var count = (moveUsage && moveUsage[mid] != null) ? parseInt(moveUsage[mid], 10) || 0 : 0;
                sum += getProficiencyRatio(count, sk.moves[i].proficiency_max_uses);
                n++;
            }
        }
        if (sk.hub_actions && sk.hub_actions.length) {
            for (i = 0; i < sk.hub_actions.length; i++) {
                var ha = sk.hub_actions[i];
                if (!ha || !ha.id) continue;
                if (ha.exclude_from_skill_total_proficiency) continue;
                var hc = (moveUsage && moveUsage[ha.id] != null) ? parseInt(moveUsage[ha.id], 10) || 0 : 0;
                sum += getProficiencyRatio(hc, ha.proficiency_max_uses);
                n++;
            }
        }
        if (n === 0) return 0;
        return sum / n;
    }

    /** 呼吸法等：hub 专用动作（非肢上招式槽） */
    function getUnlockedHubActions(skillId, level) {
        var sk = getSkill(skillId);
        if (!sk || !sk.hub_actions || !sk.hub_actions.length) return [];
        level = parseInt(level, 10) || 0;
        return sk.hub_actions.filter(function (a) {
            return (a.unlock_level != null ? a.unlock_level : 1) <= level;
        });
    }

    /** 当前等级下已解锁的招式列表 */
    function getUnlockedMoves(skillId, level) {
        var sk = getSkill(skillId);
        if (!sk || !sk.moves) return [];
        level = parseInt(level, 10) || 0;
        return sk.moves.filter(function (m) {
            return (m.unlock_level != null ? m.unlock_level : 1) <= level;
        });
    }

    /** 当前等级下该技能可用的招式槽数量 */
    function getMaxSlotsForLevel(skillId, level) {
        var sk = getSkill(skillId);
        if (!sk || !sk.slots_unlock_by_level || !sk.slots_unlock_by_level.length) return 0;
        level = parseInt(level, 10) || 0;
        var slots = 0;
        for (var i = 0; i < sk.slots_unlock_by_level.length; i++) {
            if (sk.slots_unlock_by_level[i].level <= level) {
                slots = sk.slots_unlock_by_level[i].slots;
            }
        }
        return slots;
    }

    /**
     * 基本拳脚基础威力系数 Base(L) = 10 * M(L)
     * 1≤L≤200: M(L)=1+3/199*(L-1); 200<L≤400: M(L)=4+3/200*(L-200); 400<L≤模板满级: M(L)=7+3/600*(L-400)
     * @param {object} [character] 未使用；保留签名便于调用方统一传角色
     */
    function getBasePower(skillId, level, character) {
        var sk = getSkill(skillId);
        if (!sk) return 0;
        var raw = parseInt(level, 10);
        if (!isFinite(raw) || raw < 1) raw = 1;
        var cap = getTemplateMaxLevel(skillId);
        level = Math.max(1, Math.min(cap, raw));
        var curve = sk.base_power_curve;
        if (curve === 'unarmed_simple') {
            var M = 1;
            if (level <= 200) {
                M = 1 + (3 / 199) * (level - 1);
            } else if (level <= 400) {
                M = 4 + (3 / 200) * (level - 200);
            } else {
                M = 7 + (3 / 600) * (level - 400);
            }
            var base1 = config.constants.base_power_unarmed_1 != null ? config.constants.base_power_unarmed_1 : 10;
            return base1 * M;
        }
        return 0;
    }

    /**
     * 招架技能：基础招架成功率、基础卸力比例。
     * - 若配置 `parry_success_at_level_1` + `parry_success_at_max`（及卸力一对）：在 L=1 与模板满级间线性插值；L&lt;1 为 0。
     * - 否则沿用旧式：满模板级值 × (Lcurve/cap)，满级值取自技能或 constants 的 parry_*_at_1000。
     */
    function getParryValues(skillId, level, character) {
        var sk = getSkill(skillId);
        if (!sk || !sk.only_parry) return { success: 0, reduce: 0 };
        var cap = getTemplateMaxLevel(skillId);
        var Lcurve = getSkillLevelForStatCurves(skillId, level);
        if (Lcurve < 1) return { success: 0, reduce: 0 };

        var s1 = sk.parry_success_at_level_1;
        var sMax = sk.parry_success_at_max;
        var r1 = sk.parry_reduce_at_level_1;
        var rMax = sk.parry_reduce_at_max;
        if (typeof s1 === 'number' && isFinite(s1) && typeof sMax === 'number' && isFinite(sMax)
            && typeof r1 === 'number' && isFinite(r1) && typeof rMax === 'number' && isFinite(rMax)) {
            var denom = cap > 1 ? (cap - 1) : 1;
            var t = cap > 1 ? (Lcurve - 1) / denom : 0;
            if (t < 0) t = 0;
            if (t > 1) t = 1;
            return {
                success: s1 + (sMax - s1) * t,
                reduce: r1 + (rMax - r1) * t
            };
        }

        var successAt1000 = sk.parry_success_at_1000 != null ? sk.parry_success_at_1000 : (config.constants.parry_success_at_1000 || 0.35);
        var reduceAt1000 = sk.parry_reduce_at_1000 != null ? sk.parry_reduce_at_1000 : (config.constants.parry_reduce_at_1000 || 0.35);
        var ratio = cap > 0 ? Lcurve / cap : 0;
        return {
            success: successAt1000 * ratio,
            reduce: reduceAt1000 * ratio
        };
    }

    /** 招架类熟练度计数键（用于 `skills[id].move_usage`），无则 null */
    function getParryProficiencyUsageKey(skillId) {
        var sk = getSkill(skillId);
        if (!sk || sk.category !== 'parry') return null;
        return sk.parry_proficiency_usage_key || 'parry_success';
    }

    /**
     * \(F_{\text{呼吸法威力}}\)：见 docs/design/11-skills 8.3.3。
     * `breath_power_multiplier.base` + 各档 `proficiency_bonus_unlocks`（总熟练度 ≥ min 则加 `multiplier_delta`）。
     * 非 `category: breath` 或无配置对象时返回 1。
     */
    function getBreathPowerMultiplier(skillId, moveUsage) {
        var sk = getSkill(skillId);
        if (!sk || sk.category !== 'breath') return 1;
        var bpm = sk.breath_power_multiplier;
        if (!bpm || typeof bpm !== 'object') return 1;
        var base = (typeof bpm.base === 'number' && isFinite(bpm.base)) ? bpm.base : 1;
        var total = base;
        var r = getSkillTotalProficiency(skillId, moveUsage || {});
        var unlocks = bpm.proficiency_bonus_unlocks;
        if (unlocks && unlocks.length) {
            for (var ui = 0; ui < unlocks.length; ui++) {
                var u = unlocks[ui];
                if (!u || u.min_proficiency_ratio == null) continue;
                if (r < Number(u.min_proficiency_ratio)) continue;
                var d = u.multiplier_delta;
                if (typeof d === 'number' && isFinite(d)) total += d;
            }
        }
        return Math.max(0, total);
    }

    /** 肢体 ID 列表（与 scene-app COMBAT_LIMB_IDS 一致） */
    var LIMB_IDS = ['lhand', 'rhand', 'lfoot', 'rfoot'];

    function getLimbIds() {
        return LIMB_IDS.slice();
    }

    global.CombatSkills = {
        setConfig: setConfig,
        getConstants: getConstants,
        getCategories: getCategories,
        getSkill: getSkill,
        getSkills: getSkills,
        getSkillsByCategory: getSkillsByCategory,
        getDifficultyMultiplier: getDifficultyMultiplier,
        getTemplateMaxLevel: getTemplateMaxLevel,
        getSkillMaxLevelBonus: getSkillMaxLevelBonus,
        getEffectiveSkillMaxLevel: getEffectiveSkillMaxLevel,
        getProgressionSkillMaxLevel: getProgressionSkillMaxLevel,
        getSkillLevelForStatCurves: getSkillLevelForStatCurves,
        addSkillMaxLevelBonus: addSkillMaxLevelBonus,
        setSkillMaxLevelBonus: setSkillMaxLevelBonus,
        getPotentialCostForLevel: getPotentialCostForLevel,
        getMoveProficiencyMax: getMoveProficiencyMax,
        getProficiencyRatio: getProficiencyRatio,
        getMoveProficiencyRatio: getMoveProficiencyRatio,
        getSkillTotalProficiency: getSkillTotalProficiency,
        getUnlockedHubActions: getUnlockedHubActions,
        getUnlockedMoves: getUnlockedMoves,
        getMaxSlotsForLevel: getMaxSlotsForLevel,
        getBasePower: getBasePower,
        getParryValues: getParryValues,
        getParryProficiencyUsageKey: getParryProficiencyUsageKey,
        getBreathPowerMultiplier: getBreathPowerMultiplier,
        getLimbIds: getLimbIds,
        MOVE_PROFICIENCY_MAX: MOVE_PROFICIENCY_MAX
    };
})(typeof window !== 'undefined' ? window : this);
