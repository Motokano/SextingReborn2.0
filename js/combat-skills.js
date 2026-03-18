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
     * 某等级升到下一级所需潜能（难度 1 时基础曲线）
     * 1～200: 5000; 201～400: 5000+75*(L-200); 401～1000: 20000+25*(L-400)
     */
    function getPotentialCostForLevel(skillId, level) {
        level = Math.max(1, Math.min(1000, parseInt(level, 10) || 1));
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

    /** 招式熟练度比例 R_move = min(P/50000, 1) */
    function getMoveProficiencyRatio(useCount) {
        var maxU = getMoveProficiencyMax();
        if (maxU <= 0) return 1;
        return Math.min(1, (parseInt(useCount, 10) || 0) / maxU);
    }

    /** 技能总熟练度 = 所有招式熟练度比例的算术平均 */
    function getSkillTotalProficiency(skillId, moveUsage) {
        var sk = getSkill(skillId);
        if (!sk || !sk.moves || !sk.moves.length) return 0;
        var sum = 0;
        for (var i = 0; i < sk.moves.length; i++) {
            var mid = sk.moves[i].id;
            var count = (moveUsage && moveUsage[mid] != null) ? parseInt(moveUsage[mid], 10) || 0 : 0;
            sum += getMoveProficiencyRatio(count);
        }
        return sum / sk.moves.length;
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
     * 1≤L≤200: M(L)=1+3/199*(L-1); 200<L≤400: M(L)=4+3/200*(L-200); 400<L≤1000: M(L)=7+3/600*(L-400)
     */
    function getBasePower(skillId, level) {
        var sk = getSkill(skillId);
        if (!sk) return 0;
        level = Math.max(1, Math.min(1000, parseInt(level, 10) || 1));
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

    /** 招架技能：基础招架成功率、基础卸力比例（线性随等级，满级 1000 时为配置值） */
    function getParryValues(skillId, level) {
        var sk = getSkill(skillId);
        if (!sk || !sk.only_parry) return { success: 0, reduce: 0 };
        level = Math.max(0, Math.min(1000, parseInt(level, 10) || 0));
        var successAt1000 = sk.parry_success_at_1000 != null ? sk.parry_success_at_1000 : (config.constants.parry_success_at_1000 || 0.35);
        var reduceAt1000 = sk.parry_reduce_at_1000 != null ? sk.parry_reduce_at_1000 : (config.constants.parry_reduce_at_1000 || 0.35);
        var ratio = level / 1000;
        return {
            success: successAt1000 * ratio,
            reduce: reduceAt1000 * ratio
        };
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
        getPotentialCostForLevel: getPotentialCostForLevel,
        getMoveProficiencyMax: getMoveProficiencyMax,
        getMoveProficiencyRatio: getMoveProficiencyRatio,
        getSkillTotalProficiency: getSkillTotalProficiency,
        getUnlockedMoves: getUnlockedMoves,
        getMaxSlotsForLevel: getMaxSlotsForLevel,
        getBasePower: getBasePower,
        getParryValues: getParryValues,
        getLimbIds: getLimbIds,
        MOVE_PROFICIENCY_MAX: MOVE_PROFICIENCY_MAX
    };
})(typeof window !== 'undefined' ? window : this);
