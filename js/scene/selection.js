/**
 * CombatSelection — 战斗招式名称、标签与实际攻击意图选择.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {

    function getCombatSkillName(skillId) {
        // 防御：旧格式/损坏存档可能把技能槽存成数组或逗号串，一律取最后一个有效 id
        if (Array.isArray(skillId)) {
            for (var ai = skillId.length - 1; ai >= 0; ai--) {
                if (typeof skillId[ai] === 'string' && String(skillId[ai]).trim()) { skillId = String(skillId[ai]).trim(); break; }
            }
            if (Array.isArray(skillId)) skillId = null;
        }
        if (typeof skillId === 'string' && skillId.indexOf(',') >= 0) {
            var parts = skillId.split(',');
            skillId = null;
            for (var pi = parts.length - 1; pi >= 0; pi--) {
                if (String(parts[pi]).trim()) { skillId = String(parts[pi]).trim(); break; }
            }
        }
        if (!skillId) return window.SceneFeedback.ui('combat.empty');
        var sk = window.CombatSkills && window.CombatSkills.getSkill(skillId);
        return (sk && sk.name) ? sk.name : skillId;
    }

    /** 招式显示名：按技能 id + 招式 id 从 combat-skills 配置取 name；找不到退回 moveId。 */
    function getMoveDisplayName(skillId, moveId) {
        if (!moveId) return '';
        var CS = window.CombatSkills;
        var sk = CS && typeof CS.getSkill === 'function' ? CS.getSkill(skillId) : null;
        if (!sk || !Array.isArray(sk.moves)) return String(moveId);
        for (var i = 0; i < sk.moves.length; i++) {
            var m = sk.moves[i];
            if (m && m.id === moveId) return m.name || String(moveId);
        }
        return String(moveId);
    }

    /** 招式形态标签（required_limb_tags），供肌群被动侧向近似判定（34 §3.4 中间态口径） */
    function getFormTagsForMove(skillId, moveId) {
        var CS = window.CombatSkills;
        if (!CS || typeof CS.getSkill !== 'function' || !skillId || !moveId) return [];
        var sk = CS.getSkill(String(skillId));
        if (!sk || !Array.isArray(sk.moves)) return [];
        for (var i = 0; i < sk.moves.length; i++) {
            var m = sk.moves[i];
            if (m && m.id === moveId) {
                return Array.isArray(m.required_limb_tags) ? m.required_limb_tags.slice() : [];
            }
        }
        return [];
    }

    function buildDefaultMoveSequenceArray(CS, IE, skillId, limbId) {
        if (!CS || !IE || !skillId) return [];
        limbId = limbId || 'lhand';
        if (typeof CS.buildDefaultMoveSequenceForLimb === 'function') {
            return CS.buildDefaultMoveSequenceForLimb(skillId, limbId, IE.getSkillLevel(skillId));
        }
        var lv = IE.getSkillLevel(skillId);
        var maxSlots = CS.getMaxSlotsForLevel(skillId, lv);
        var unlocked = CS.getUnlockedMoves(skillId, lv);
        var out = [];
        var i;
        for (i = 0; i < maxSlots; i++) {
            if (unlocked[i]) out.push(unlocked[i].id);
            else if (unlocked[0]) out.push(unlocked[0].id);
            else out.push('');
        }
        return out;
    }

    function initialize() {

    }

    function bind() {

    }

    window.CombatSelection = {
        initialize: initialize,
        bind: bind,
        buildDefaultMoveSequenceArray: buildDefaultMoveSequenceArray,
        getCombatSkillName: getCombatSkillName,
        getFormTagsForMove: getFormTagsForMove,
        getMoveDisplayName: getMoveDisplayName
    };
})(window);
