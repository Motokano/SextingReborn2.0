/**
 * 生存技能元数据 - 数据来自 data/survival-skills.json（与 Survival 模块、survival-config 数值解耦）
 * 等级与存档：InventoryEquipment.skills[skillId].level
 *
 * 公开 API：
 * - SurvivalSkills.setTable(json) — 由 scene-app loadConfig 注入
 * - SurvivalSkills.getAll() / getById(id) / getIds() / isRegisteredSkillId(id)
 */
(function (global) {
    'use strict';

    /** fetch 失败或未加载时的兜底（与 survival-skills.json 保持一致） */
    var FALLBACK_SKILLS = [
        { id: 'survival_language', name: '语言', desc: '决定能否看懂物品描述、听懂 NPC 语言，等级越高可理解的信息越多。' },
        { id: 'survival_endurance', name: '耐力', desc: '降低各类生产活动的体力消耗，长时间干活不容易累垮。' },
        { id: 'survival_health', name: '健康', desc: '降低骨折等严重伤害概率，并略微减少饱食与饮水的日常消耗。' },
        { id: 'survival_immunity', name: '免疫', desc: '降低药物副作用，提高治愈速度，并延长止痛药等药物的有效时间。' },
        { id: 'survival_metabolism', name: '代谢', desc: '提升料理类物品的效果，让同一份食物发挥更强功效。' },
        { id: 'survival_strength', name: '力量', desc: '提升负重上限；满级时已装备在双手的武器不再计入负重。' },
        { id: 'survival_vitality', name: '活力', desc: '降低身体部位受伤后触发出血的概率。' },
        { id: 'survival_stress_resist', name: '抗压', desc: '手部受伤时，减轻命中率与招架率下降的幅度。' },
        { id: 'survival_search', name: '搜索', desc: '缩短开箱搜索时间，提升单次搜索完成度。' },
        { id: 'survival_surgery', name: '手术', desc: '提升手术对肢体损毁值上限的临时修复比例。' },
        { id: 'survival_sleep', name: '睡眠', desc: '缩短通过睡眠恢复体力所需的 tick 数。' },
        { id: 'survival_ningqi', name: '凝气', desc: '每回合额外回复体力与底气，与呼吸属性共同决定回复速度。' },
        { id: 'survival_weather_resist', name: '耐候', desc: '降低极端气候导致的体温波动与额外消耗。' }
    ];

    var skillsTable = FALLBACK_SKILLS.map(function (r) {
        return { id: r.id, name: r.name, desc: r.desc };
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
                desc: (e.desc != null) ? String(e.desc) : ''
            });
        }
        if (!next.length) {
            skillsTable = FALLBACK_SKILLS.map(function (r) {
                return { id: r.id, name: r.name, desc: r.desc };
            });
        } else {
            skillsTable = next;
        }
        rebuildIdSet();
    }

    function getAll() {
        return skillsTable.map(function (r) {
            return { id: r.id, name: r.name, desc: r.desc };
        });
    }

    function getById(id) {
        var sid = String(id || '').trim();
        if (!sid) return null;
        for (var i = 0; i < skillsTable.length; i++) {
            if (skillsTable[i].id === sid) return { id: skillsTable[i].id, name: skillsTable[i].name, desc: skillsTable[i].desc };
        }
        return null;
    }

    function getIds() {
        return skillsTable.map(function (r) { return r.id; });
    }

    function isRegisteredSkillId(id) {
        return !!idSet[String(id || '').trim()];
    }

    global.SurvivalSkills = {
        setTable: setTable,
        getAll: getAll,
        getById: getById,
        getIds: getIds,
        isRegisteredSkillId: isRegisteredSkillId
    };
})(typeof window !== 'undefined' ? window : globalThis);
