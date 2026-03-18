/**
 * 生存技能元数据与简单查询 - 按 docs/design/11-skills.md 8.1
 * 仅负责：生存技能列表、展示名、说明文案。
 * 数值公式与具体效果分别在 06-survival 与各系统中实现。
 */
(function (global) {
    'use strict';

    /** 生存系技能清单（已在 11-skills.md 中确定 ID） */
    var SURVIVAL_SKILLS = [
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

    function getAll() {
        return SURVIVAL_SKILLS.slice();
    }

    function getById(id) {
        for (var i = 0; i < SURVIVAL_SKILLS.length; i++) {
            if (SURVIVAL_SKILLS[i].id === id) return SURVIVAL_SKILLS[i];
        }
        return null;
    }

    global.SurvivalSkills = {
        getAll: getAll,
        getById: getById
    };
})(typeof window !== 'undefined' ? window : this);

