/**
 * 生存技能元数据 - 数据来自 data/survival-skills.json（与 Survival 模块、survival-config 数值解耦）
 * 等级、经验与存档：InventoryEquipment.skills；本模块只定义元数据及身体成长发奖策略。
 *
 * 公开 API：
 * - SurvivalSkills.setTable(json) — 由 scene-app loadConfig 注入
 * - SurvivalSkills.getAll() / getById(id) / getIds() / isRegisteredSkillId(id)
 * - gainBodyExperience(id, points) / completeAttackExperience(ctx) — 实际损毁变化后的成长结算
 */
(function (global) {
    'use strict';

    /** fetch 失败或未加载时的兜底（与 survival-skills.json 保持一致） */
    var FALLBACK_SKILLS = [
        { id: 'survival_language', name: '语言', desc: '5级可读物品真实名，10级可读完整描述；也影响对 NPC 语言的理解。' },
        { id: 'survival_endurance', name: '耐力', desc: '降低各类生产活动的体力消耗，长时间干活不容易累垮。' },
        { id: 'survival_health', name: '健康', max_level: 100, exp_per_level: 5000, experience_per_destroy_point: 1, desc: '每级使骨折概率相对降低0.5%，100级降低50%；并略微减少饱食与饮水的日常消耗。休息自然恢复每1点损毁获1经验，每5000经验升1级。' },
        { id: 'survival_immunity', name: '免疫', desc: '降低药物副作用，提高治愈速度，并延长止痛药等药物的有效时间。' },
        { id: 'survival_metabolism', name: '代谢', desc: '提升料理类物品的效果，让同一份食物发挥更强功效。' },
        { id: 'survival_strength', name: '力量', desc: '提升负重上限；满级时已装备在双手的武器不再计入负重。' },
        { id: 'survival_vitality', name: '活力', max_level: 100, exp_per_level: 5000, experience_per_destroy_point: 1, desc: '每级使普通／大出血概率相对降低0.5%／0.3%，100级降低50%／30%。敌人直接攻击实际增加每1点损毁获1经验，每5000经验升1级；持续伤害和致死攻击不发经验。' },
        { id: 'survival_stress_resist', name: '抗压', desc: '手部受伤时，减轻命中率与招架率下降的幅度。' },
        { id: 'survival_search', name: '搜索', desc: '每级降低空容器概率 0.2 个百分点。' },
        { id: 'survival_surgery', name: '手术', max_level: 100, exp_per_level: 5000, desc: '提升术后损毁上限保留比例，100级不再扣上限。每部位完整睡眠后首次成功手术获1经验，每5000经验升1级；中断与重复手术无经验。' },
        { id: 'survival_sleep', name: '睡眠', desc: '缩短通过睡眠恢复体力所需的 tick 数。' },
        { id: 'survival_ningqi', name: '凝气', desc: '每回合额外回复体力与底气，与呼吸属性共同决定回复速度。' },
        { id: 'survival_weather_resist', name: '耐候', desc: '提高极端温度触发阈值容忍度（每级 +0.1°C）。' }
    ];

    var skillsTable = FALLBACK_SKILLS.map(function (r) {
        return Object.assign({}, r);
    });
    var idSet = {};
    rebuildIdSet();

    function rebuildIdSet() {
        idSet = {};
        for (var i = 0; i < skillsTable.length; i++) {
            if (skillsTable[i] && skillsTable[i].id) idSet[String(skillsTable[i].id)] = true;
        }
    }

    /**
     * @param {object} data - { skills: [...] } 或兼容顶层为数组的旧形
     */
    function setTable(data) {
        var arr = [];
        if (data && Array.isArray(data.skills)) arr = data.skills;
        else if (Array.isArray(data)) arr = data;

        var next = [];
        for (var i = 0; i < arr.length; i++) {
            var e = arr[i];
            if (!e || e.id == null || String(e.id).trim() === '') continue;
            next.push({
                id: String(e.id).trim(),
                name: (e.name != null) ? String(e.name) : String(e.id),
                desc: (e.desc != null) ? String(e.desc) : '',
                ...(Number.isInteger(e.max_level) && e.max_level > 0 ? { max_level: e.max_level } : {}),
                ...(Number.isInteger(e.exp_per_level) && e.exp_per_level > 0 ? { exp_per_level: e.exp_per_level } : {}),
                ...(Number.isInteger(e.experience_per_destroy_point) && e.experience_per_destroy_point > 0 ? { experience_per_destroy_point: e.experience_per_destroy_point } : {})
            });
        }
        if (!next.length) {
            skillsTable = FALLBACK_SKILLS.map(function (r) {
                return Object.assign({}, r);
            });
        } else {
            skillsTable = next;
        }
        rebuildIdSet();
    }

    function getAll() {
        return skillsTable.map(function (r) {
            return Object.assign({}, r);
        });
    }

    function getById(id) {
        var sid = String(id || '').trim();
        if (!sid) return null;
        for (var i = 0; i < skillsTable.length; i++) {
            if (skillsTable[i].id === sid) return Object.assign({}, skillsTable[i]);
        }
        return null;
    }

    function getIds() {
        return skillsTable.map(function (r) { return r.id; });
    }

    function isRegisteredSkillId(id) {
        return !!idSet[String(id || '').trim()];
    }

    // Definitions and award policy live here; the shared XP pool stays in InventoryEquipment.
    function gainBodyExperience(id, points) {
        var meta = getById(id), I = global.InventoryEquipment;
        var amount = Math.floor(Number(points) || 0);
        if (!meta || !meta.experience_per_destroy_point || !Number.isSafeInteger(amount) || amount <= 0 || !I || !I.addStudyExp) return 0;
        if (I.getSkillLevel(id) >= meta.max_level) return 0;
        var exp = amount * meta.experience_per_destroy_point;
        I.addStudyExp(id, exp); I.tryAdvanceSkillLevel(id);
        return exp;
    }
    function completeAttackExperience(ctx) {
        var receipt = ctx && ctx.vitalityReward;
        if (!receipt || receipt.settled || ctx.simultaneousDryRun || ctx._segmentOfAction) return;
        receipt.settled = true;
        if (global.Survival && global.Survival.isDead()) return;
        gainBodyExperience('survival_vitality', receipt.damage);
    }

    global.SurvivalSkills = {
        gainBodyExperience: gainBodyExperience,
        completeAttackExperience: completeAttackExperience,
        setTable: setTable,
        getAll: getAll,
        getById: getById,
        getIds: getIds,
        isRegisteredSkillId: isRegisteredSkillId
    };
})(typeof window !== 'undefined' ? window : globalThis);
