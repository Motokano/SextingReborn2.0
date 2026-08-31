/**
 * 物品栏与装备栏系统 - 按设计文档 02-regions、05、14-implementation
 * 四类容器：口袋、背心、背包、载具；10 个装备槽；快捷腰带 = 口袋 + 背心（先口袋后背心）
 * getItemTemplate 先 equipment 再 items；装备穿戴校验；死亡清空、新游戏仅 default_equipment
 */
(function (global) {
    'use strict';

    /** 装备槽位 ID（呼吸法、步法、招架为技能而非装备，不占装备槽；招架在肢体技能栏配置）。分三组：出招装备（武器/手套/鞋）、防具（头/衣服）、载物（背心/背包） */
    var EQUIP_SLOT_IDS = [
        'head', 'clothing', 'vest', 'backpack',
        'weapon_left', 'weapon_right',
        'glove_left', 'glove_right',
        'shoe_left', 'shoe_right'
    ];

    function t(key, vars) {
        if (global && global.UIText && typeof global.UIText.t === 'function') return global.UIText.t(key, vars);
        return key;
    }

    var equipmentTable = {};
    var itemsTable = {};
    var enchantTable = {};
    var moduleTable = {};
    var defaultEquipmentConfig = {};
    var displayTierThreshold1 = null;
    var displayTierThreshold2 = null;

    /** 特殊技能：解剖学（0 级未入门；≥1 解锁战斗配置中的肌肉分页） */
    var SPECIAL_ANATOMY_STUDIES_SKILL_ID = 'special_meridian_studies';

    function ensureAnatomyStudiesSkillPresent() {
        if (!state.skills || typeof state.skills !== 'object') state.skills = {};
        if (!state.skills[SPECIAL_ANATOMY_STUDIES_SKILL_ID] || typeof state.skills[SPECIAL_ANATOMY_STUDIES_SKILL_ID] !== 'object') {
            state.skills[SPECIAL_ANATOMY_STUDIES_SKILL_ID] = { level: 0, move_usage: {} };
            return;
        }
        var ent = state.skills[SPECIAL_ANATOMY_STUDIES_SKILL_ID];
        if (ent.level == null) ent.level = 0;
        var z = parseInt(ent.level, 10);
        if (!isFinite(z) || z < 0) ent.level = 0;
        if (!ent.move_usage || typeof ent.move_usage !== 'object') ent.move_usage = {};
    }

    /** 战斗肢体 ID（左手、右手、左脚、右脚），与设计 11-skills 一致 */
    var COMBAT_LIMB_IDS = ['lhand', 'rhand', 'lfoot', 'rfoot'];

    var GROUND_ITEM_DESPAWN_TICKS = 100;

    /** 潜能值：技能学习/升级资源；当前按非负整数持久化。 */
    var POTENTIAL_MIN = 0;

    /** 实战经验值：见 `docs/design/04-combat-exp.md`（上限 1000 亿；每 1 亿 +5% 全局伤害乘区） */
    var COMBAT_EXPERIENCE_MAX = 100000000000;
    var COMBAT_EXPERIENCE_UNIT = 100000000;
    var COMBAT_EXPERIENCE_BONUS_PER_UNIT = 0.05;

    /** 地面物品：key = "mapId_x_y"，value = 该格子上物品实例数组 */
    var state = {
        equipment: {},
        inventory_pocket: [],
        inventory_vest: [],
        inventory_backpack: [],
        inventory_vehicle: [],
        bound_vehicle_id: null,
        skills: {},
        skill_max_level_bonus: {},
        ground_items: {},
        combat: null,
        /** hub 动作冷却：key = "skillId:actionId" → 剩余 tick */
        hub_action_cooldowns: {},
        potential: 0,
        combat_experience: 0
    };

    function clampPotentialStored(n) {
        var v = Math.floor(Number(n));
        if (!isFinite(v) || v < POTENTIAL_MIN) return POTENTIAL_MIN;
        return v;
    }

    function normalizePotentialState() {
        if (state.potential == null || !isFinite(Number(state.potential))) state.potential = 0;
        else state.potential = clampPotentialStored(state.potential);
    }

    function getPotential() {
        normalizePotentialState();
        return state.potential;
    }

    /** 增加潜能；delta 正整数，叠加前应用 Buff 倍率（若有）。 */
    function addPotential(delta) {
        var d = Math.floor(Number(delta));
        if (!isFinite(d) || d <= 0) return getPotential();
        if (global && global.BuffSystem && typeof global.BuffSystem.getBattlePotentialGainMultiplier === 'function') {
            var mul = Number(global.BuffSystem.getBattlePotentialGainMultiplier('player')) || 1;
            if (isFinite(mul) && mul > 0) d = Math.floor(d * mul);
        }
        if (d <= 0) return getPotential();
        normalizePotentialState();
        state.potential = clampPotentialStored(state.potential + d);
        return state.potential;
    }

    /** 消耗潜能；不足时不扣除并返回 false。 */
    function consumePotential(cost) {
        var c = Math.floor(Number(cost));
        if (!isFinite(c) || c <= 0) return true;
        normalizePotentialState();
        if (state.potential < c) return false;
        state.potential = clampPotentialStored(state.potential - c);
        return true;
    }

    function clampCombatExperienceStored(n) {
        var v = Math.floor(Number(n));
        if (!isFinite(v) || v < 0) return 0;
        return Math.min(v, COMBAT_EXPERIENCE_MAX);
    }

    function normalizeCombatExperienceState() {
        if (state.combat_experience == null || !isFinite(Number(state.combat_experience))) state.combat_experience = 0;
        else state.combat_experience = clampCombatExperienceStored(state.combat_experience);
    }

    function getCombatExperience() {
        normalizeCombatExperienceState();
        return state.combat_experience;
    }

    /** @returns {number} 乘子 ≥1，公式：1 + clamp(值) / 1亿 × 5% */
    function getCombatExperienceDamageMultiplier() {
        var exp = getCombatExperience();
        var bonus = (exp / COMBAT_EXPERIENCE_UNIT) * COMBAT_EXPERIENCE_BONUS_PER_UNIT;
        var m = 1 + bonus;
        return isFinite(m) && m >= 1 ? m : 1;
    }

    /** 战斗胜利等路径调用；delta 正整数，累加后夹紧上限 */
    function addCombatExperience(delta) {
        var d = Math.floor(Number(delta));
        if (!isFinite(d) || d <= 0) return getCombatExperience();
        if (global && global.BuffSystem && typeof global.BuffSystem.getBattleCombatExperienceGainMultiplier === 'function') {
            var mul = Number(global.BuffSystem.getBattleCombatExperienceGainMultiplier('player')) || 1;
            if (isFinite(mul) && mul > 0) d = Math.floor(d * mul);
        }
        if (d <= 0) return getCombatExperience();
        normalizeCombatExperienceState();
        state.combat_experience = clampCombatExperienceStored(state.combat_experience + d);
        return state.combat_experience;
    }

    function getDefaultCombatState() {
        return {
            limbs: {
                lhand: { active: null, parry: null },
                rhand: { active: null, parry: null },
                lfoot: { active: null, parry: null },
                rfoot: { active: null, parry: null }
            },
            hubs: { breath: null, footwork: null },
            move_sequences: { lhand: [], rhand: [], lfoot: [], rfoot: [] },
            /** 仅作旧档兼容；运行时以 move_sequences[肢] 为权威 */
            skill_move_sequences: {},
            /** 各肢招式槽轮询下标（对应该肢 move_sequences 中非空槽位序列） */
            move_sequence_cursors: { lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 },
            /** 废弃字段（34 号草案阶段三起）：后遗症装配已迁移至肌群大型被动（Muscles.equipPassive）；此处仅保留以兼容旧存档读取，战斗不再读取 */
            post_effect_sequences: {},
            /** 主动链变式装配：variant_sequences[limbId] = [variant_id, ...] */
            variant_sequences: { lhand: [], rhand: [], lfoot: [], rfoot: [] },
            /** 招架变式装配：parry_variant_sequences[limbId] = [variant_id|null, ...]，最多 5 槽 */
            parry_variant_sequences: { lhand: [], rhand: [], lfoot: [], rfoot: [] },
            /** 各肢各槽位成数（null = 使用招式模板默认值；数字 = 玩家设定 1-12 成数） */
            move_slot_power_levels: { lhand: [], rhand: [], lfoot: [], rfoot: [] },
            /** 地图普攻四肢出手顺序（须为 lhand/rhand/lfoot/rfoot 各出现一次的排列） */
            limb_strike_order: ['lhand', 'rhand', 'lfoot', 'rfoot'],
            /** 下一击从 limb_strike_order 的该下标开始扫描（0～3） */
            limb_strike_order_cursor: 0,
            /** 变式效果参数覆盖（对 move-variants 模板的 variant_effect_params 深合并；清除键即复原表内原始） */
            variant_effect_param_overrides: {},
            /** 眩晕累积值 0-100（37 §9.2，k13）：命中头累积，-1/tick 衰减，≥100 触发眩晕 */
            stun_value: 0,
            /** 眩晕回合数：>0 = 眩晕中（下一次行动被吞，本回合无法行动） */
            stun_rounds_left: 0
        };
    }

    function isValidLimbStrikeOrderArray(arr) {
        if (!Array.isArray(arr) || arr.length !== COMBAT_LIMB_IDS.length) return false;
        var seen = {};
        var i;
        for (i = 0; i < arr.length; i++) {
            var id = arr[i];
            if (COMBAT_LIMB_IDS.indexOf(id) < 0) return false;
            if (seen[id]) return false;
            seen[id] = true;
        }
        return true;
    }

    function ensureLimbStrikeOrder() {
        if (!state.combat || typeof state.combat !== 'object') return;
        var o = state.combat.limb_strike_order;
        if (!isValidLimbStrikeOrderArray(o)) {
            state.combat.limb_strike_order = COMBAT_LIMB_IDS.slice();
        }
        var c = Math.floor(Number(state.combat.limb_strike_order_cursor) || 0);
        if (!isFinite(c)) c = 0;
        state.combat.limb_strike_order_cursor = ((c % COMBAT_LIMB_IDS.length) + COMBAT_LIMB_IDS.length) % COMBAT_LIMB_IDS.length;
    }

    function getLimbStrikeOrderSlice() {
        ensureCombatState();
        ensureLimbStrikeOrder();
        return state.combat.limb_strike_order.slice();
    }

    function getLimbStrikeOrderCursor() {
        ensureCombatState();
        ensureLimbStrikeOrder();
        return state.combat.limb_strike_order_cursor;
    }

    function swapLimbStrikeOrderIndices(i, j) {
        ensureCombatState();
        ensureLimbStrikeOrder();
        var o = state.combat.limb_strike_order;
        var ii = Math.floor(Number(i)) || 0;
        var jj = Math.floor(Number(j)) || 0;
        var n = COMBAT_LIMB_IDS.length;
        ii = ((ii % n) + n) % n;
        jj = ((jj % n) + n) % n;
        var t = o[ii];
        o[ii] = o[jj];
        o[jj] = t;
    }

    /**
     * 本击实际出手肢为 limbId 时，将出手顺序游标置于该肢在顺序表中的下一格（tick 内跳过肢同样落在此规则）。
     */
    function advanceLimbStrikeOrderAfterAttack(limbId) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0) return;
        ensureCombatState();
        ensureLimbStrikeOrder();
        var ord = state.combat.limb_strike_order;
        var idx = ord.indexOf(limbId);
        if (idx < 0) return;
        state.combat.limb_strike_order_cursor = (idx + 1) % COMBAT_LIMB_IDS.length;
    }

    function ensureMoveSequenceCursors() {
        var def = getDefaultCombatState().move_sequence_cursors;
        if (!state.combat.move_sequence_cursors || typeof state.combat.move_sequence_cursors !== 'object') {
            state.combat.move_sequence_cursors = {};
        }
        var i;
        for (i = 0; i < COMBAT_LIMB_IDS.length; i++) {
            var lid = COMBAT_LIMB_IDS[i];
            if (state.combat.move_sequence_cursors[lid] == null || !isFinite(Number(state.combat.move_sequence_cursors[lid]))) {
                state.combat.move_sequence_cursors[lid] = def[lid] != null ? def[lid] : 0;
            }
        }
    }

    function pickFirstPostEffectIdFromLegacyLimbMap(legacyMap) {
        if (!legacyMap || typeof legacyMap !== 'object') return null;
        for (var sk in legacyMap) {
            if (!Object.prototype.hasOwnProperty.call(legacyMap, sk) || !Array.isArray(legacyMap[sk])) continue;
            for (var i = 0; i < legacyMap[sk].length; i++) {
                var pid = legacyMap[sk][i];
                if (pid) return String(pid);
            }
        }
        return null;
    }

    function normalizePostEffectForLimbValue(v) {
        if (v == null || v === '') return null;
        if (typeof v === 'string') return v;
        if (typeof v === 'object') return pickFirstPostEffectIdFromLegacyLimbMap(v);
        return null;
    }

    function getCompactMoveIdsForLimb(limbId) {
        var seq = state.combat.move_sequences[limbId] || [];
        var out = [];
        var i;
        for (i = 0; i < seq.length; i++) {
            var v = seq[i];
            if (!v) continue;
            var s = String(v);
            if (s.indexOf('variant:') === 0) continue;
            out.push(s);
        }
        return out;
    }

    /** 旧档 skill_move_sequences[skillId] 为全局一份时，按肢上 active 技能补全空的 move_sequences */
    function migrateLegacySkillMoveSequencesIntoLimbs() {
        var flat = state.combat.skill_move_sequences;
        if (!flat || typeof flat !== 'object') return;
        var i;
        for (i = 0; i < COMBAT_LIMB_IDS.length; i++) {
            var lid = COMBAT_LIMB_IDS[i];
            var local = state.combat.move_sequences[lid];
            var active = state.combat.limbs[lid] && state.combat.limbs[lid].active;
            if (!active || !flat[active] || !Array.isArray(flat[active]) || !flat[active].length) continue;
            if (!local || !local.length) {
                state.combat.move_sequences[lid] = flat[active].slice();
            }
        }
    }

    function peekMoveIdForLimb(limbId) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0) return null;
        ensureCombatState();
        ensureMoveSequenceCursors();
        var compact = getCompactMoveIdsForLimb(limbId);
        if (!compact.length) return null;
        var idx = Math.floor(Number(state.combat.move_sequence_cursors[limbId]) || 0) % compact.length;
        if (idx < 0) idx = 0;
        return compact[idx];
    }

    function advanceMoveSequenceCursorForLimb(limbId) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0) return;
        ensureCombatState();
        ensureMoveSequenceCursors();
        var compact = getCompactMoveIdsForLimb(limbId);
        if (!compact.length) return;
        var cur = Math.floor(Number(state.combat.move_sequence_cursors[limbId]) || 0);
        state.combat.move_sequence_cursors[limbId] = (cur + 1) % compact.length;
    }

    /** 返回当前 compact 游标对应的在 move_sequences[limbId] 中的原始下标，找不到返回 -1 */
    function peekMoveSlotIndexForLimb(limbId) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0) return -1;
        ensureCombatState();
        ensureMoveSequenceCursors();
        var compact = getCompactMoveIdsForLimb(limbId);
        if (!compact.length) return -1;
        var compactIdx = Math.floor(Number(state.combat.move_sequence_cursors[limbId]) || 0) % compact.length;
        var seq = state.combat.move_sequences[limbId] || [];
        var count = 0;
        for (var i = 0; i < seq.length; i++) {
            var v = seq[i];
            if (!v) continue;
            var s = String(v);
            if (s.indexOf('variant:') === 0) continue;
            if (count === compactIdx) return i;
            count++;
        }
        return -1;
    }

    /** 读取指定肢体指定槽位保存的成数，未设置时返回 null */
    function getMoveSlotPowerLevel(limbId, slotIndex) {
        ensureCombatState();
        var arr = state.combat.move_slot_power_levels && state.combat.move_slot_power_levels[limbId];
        if (!Array.isArray(arr)) return null;
        var v = arr[slotIndex];
        if (v == null || !isFinite(Number(v))) return null;
        return Number(v);
    }

    /** 设置指定肢体指定槽位的成数（null = 清除回默认；数字会夹紧到 1-12） */
    function setMoveSlotPowerLevel(limbId, slotIndex, value) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0) return;
        ensureCombatState();
        if (!Array.isArray(state.combat.move_slot_power_levels[limbId])) {
            state.combat.move_slot_power_levels[limbId] = [];
        }
        if (value == null) {
            state.combat.move_slot_power_levels[limbId][slotIndex] = null;
        } else {
            var n = Math.round(Number(value));
            if (!isFinite(n)) return;
            state.combat.move_slot_power_levels[limbId][slotIndex] = Math.max(1, Math.min(12, n));
        }
    }

    /** 规范化肢体的技能槽值：必须为单技能 id 字符串。旧格式/损坏存档可能存数组或逗号串（如 ['a','b'] 或 'a,b'），
     *  取「最后一个」元素（最近写入的）；非法/空值归一为 null。见 11-skills：每肢 1 主动 + 1 招架。 */
    function normalizeLimbSkillValue(v) {
        if (typeof v === 'string') {
            var s = String(v).trim();
            if (!s) return null;
            if (s.indexOf(',') >= 0) {
                var parts = s.split(',');
                for (var pi = parts.length - 1; pi >= 0; pi--) {
                    var pv = String(parts[pi]).trim();
                    if (pv) return pv;
                }
                return null;
            }
            return s;
        }
        if (Array.isArray(v)) {
            for (var ai = v.length - 1; ai >= 0; ai--) {
                var ev = v[ai];
                if (typeof ev === 'string' && String(ev).trim()) return String(ev).trim();
            }
            return null;
        }
        return null;
    }

    function ensureCombatState() {
        if (!state.combat || typeof state.combat !== 'object') {
            state.combat = getDefaultCombatState();
        }
        var def = getDefaultCombatState();
        var limbIds = COMBAT_LIMB_IDS;
        for (var i = 0; i < limbIds.length; i++) {
            var lid = limbIds[i];
            if (!state.combat.limbs[lid]) {
                state.combat.limbs[lid] = { active: null, parry: null };
            }
            if (!state.combat.move_sequences[lid]) state.combat.move_sequences[lid] = [];
        }
        var j;
        for (j = 0; j < limbIds.length; j++) {
            var lidNorm = limbIds[j];
            var lrN = state.combat.limbs[lidNorm];
            if (lrN) {
                lrN.active = normalizeLimbSkillValue(lrN.active);
                lrN.parry = normalizeLimbSkillValue(lrN.parry);
            }
        }
        for (j = 0; j < limbIds.length; j++) {
            var lr = state.combat.limbs[limbIds[j]];
            if (lr && Object.prototype.hasOwnProperty.call(lr, 'priority')) {
                try { delete lr.priority; } catch (eDel) { lr.priority = undefined; }
            }
        }
        if (!state.combat.hubs) state.combat.hubs = { breath: null, footwork: null };
        if (state.combat.hubs.light != null && state.combat.hubs.footwork == null) {
            state.combat.hubs.footwork = state.combat.hubs.light;
            delete state.combat.hubs.light;
        }
        if (state.combat.hubs.breath === undefined) state.combat.hubs.breath = null;
        if (state.combat.hubs.footwork === undefined) state.combat.hubs.footwork = null;
        if (!state.combat.skill_move_sequences) state.combat.skill_move_sequences = {};
        if (!state.combat.post_effect_sequences || typeof state.combat.post_effect_sequences !== 'object') state.combat.post_effect_sequences = {};
        if (!state.combat.variant_sequences || typeof state.combat.variant_sequences !== 'object') state.combat.variant_sequences = {};
        if (!state.combat.parry_variant_sequences || typeof state.combat.parry_variant_sequences !== 'object') state.combat.parry_variant_sequences = {};
        for (var li = 0; li < limbIds.length; li++) {
            var lid2 = limbIds[li];
            state.combat.post_effect_sequences[lid2] = normalizePostEffectForLimbValue(state.combat.post_effect_sequences[lid2]);
            if (!Array.isArray(state.combat.variant_sequences[lid2])) state.combat.variant_sequences[lid2] = [];
            if (!Array.isArray(state.combat.parry_variant_sequences[lid2])) state.combat.parry_variant_sequences[lid2] = [];
        }
        if (!state.combat.move_slot_power_levels || typeof state.combat.move_slot_power_levels !== 'object') state.combat.move_slot_power_levels = {};
        for (var lmpl = 0; lmpl < limbIds.length; lmpl++) {
            if (!Array.isArray(state.combat.move_slot_power_levels[limbIds[lmpl]])) state.combat.move_slot_power_levels[limbIds[lmpl]] = [];
        }
        if (!isValidLimbStrikeOrderArray(state.combat.limb_strike_order)) {
            state.combat.limb_strike_order = COMBAT_LIMB_IDS.slice();
        }
        if (state.combat.limb_strike_order_cursor == null || !isFinite(Number(state.combat.limb_strike_order_cursor))) {
            state.combat.limb_strike_order_cursor = 0;
        }
        if (!state.combat.variant_effect_param_overrides || typeof state.combat.variant_effect_param_overrides !== 'object') {
            state.combat.variant_effect_param_overrides = {};
        }
        // 眩晕累积（37 §9.2，k13）：0-100 战斗状态字段；stun_rounds_left>0 = 眩晕中（下一次行动被吞）
        if (typeof state.combat.stun_value !== 'number' || !isFinite(state.combat.stun_value)) state.combat.stun_value = 0;
        state.combat.stun_value = Math.max(0, Math.min(100, Math.floor(state.combat.stun_value)));
        if (typeof state.combat.stun_rounds_left !== 'number' || !isFinite(state.combat.stun_rounds_left)) state.combat.stun_rounds_left = 0;
        state.combat.stun_rounds_left = Math.max(0, Math.floor(state.combat.stun_rounds_left));
        ensureLimbStrikeOrder();
        ensureMoveSequenceCursors();
    }

    /** 技能等级获取：未习得为 0 */
    function getSkillLevel(skillId) {
        var s = state.skills[skillId];
        if (!s || s.level == null) return 0;
        var lv = parseInt(s.level, 10);
        if (!isFinite(lv) || lv < 0) return 0;
        return lv;
    }

    function getProgressionSkillCap(skillId) {
        if (!skillId) return Number.MAX_SAFE_INTEGER;
        if (typeof global !== 'undefined' && global.CombatSkills) {
            var CS = global.CombatSkills;
            if (typeof CS.getProgressionSkillMaxLevel === 'function') {
                var characterLike = { skills: state.skills || {}, skill_max_level_bonus: state.skill_max_level_bonus || {} };
                var cap = parseInt(CS.getProgressionSkillMaxLevel(characterLike, skillId), 10);
                if (isFinite(cap)) return Math.max(0, cap);
            }
            if (typeof CS.getTemplateMaxLevel === 'function') {
                var tCap = parseInt(CS.getTemplateMaxLevel(skillId), 10);
                if (isFinite(tCap)) return Math.max(0, tCap);
            }
        }
        return Number.MAX_SAFE_INTEGER;
    }

    function clampSkillLevelsToProgressionCaps() {
        if (!state.skills || typeof state.skills !== 'object') return;
        for (var sid in state.skills) {
            if (!Object.prototype.hasOwnProperty.call(state.skills, sid)) continue;
            var ent = state.skills[sid];
            if (!ent || typeof ent !== 'object') continue;
            var lv = parseInt(ent.level, 10);
            if (!isFinite(lv) || lv < 0) lv = 0;
            var cap = getProgressionSkillCap(sid);
            ent.level = Math.min(lv, cap);
        }
    }

    function getSkillsState() {
        return state.skills;
    }

    /**
     * 增加 skills[skillId].move_usage[usageKey]（如招架成功 parry_success、呼吸法共用线 tu_na）。
     * 未习得（level &lt; 1）或无该技能条目时不写入。
     * @returns {number} 新累计值，未写入时 -1
     */
    function incrementSkillMoveUsage(skillId, usageKey, delta) {
        if (!skillId || !usageKey) return -1;
        var d = parseInt(delta, 10);
        if (!isFinite(d) || d <= 0) return -1;
        if (getSkillLevel(skillId) < 1) return -1;
        var entry = state.skills[skillId];
        if (!entry || typeof entry !== 'object') return -1;
        if (!entry.move_usage || typeof entry.move_usage !== 'object') entry.move_usage = {};
        var k = String(usageKey);
        var cur = parseInt(entry.move_usage[k], 10) || 0;
        var newTotal = cur + d;
        entry.move_usage[k] = newTotal;
        if (global.GameLog && global.UIText && typeof global.UIText.t === 'function') {
            global.GameLog.log(global.UIText.t('log.debug.proficiency.move_usage', {
                skillId: String(skillId),
                usageKey: k,
                delta: String(d),
                total: String(newTotal)
            }), 'system');
        }
        if (typeof global !== 'undefined' && global.CharacterAttributes && typeof global.CharacterAttributes.recalcCharacterStats === 'function') {
            global.CharacterAttributes.recalcCharacterStats({
                getEquipmentState: function () { return state.equipment; },
                getSkillsState: function () { return state.skills; },
                getItemTemplate: getItemTemplate,
                getEnchantEntry: getEnchantEntry,
                getStrengthLevel: function () { return getSkillLevel('survival_strength'); }
            });
        }
        return entry.move_usage[k];
    }

    /**
     * 调整 move_usage（支持正负）。未习得技能不写入。
     * @returns {number} 新累计值，未写入时 -1
     */
    function adjustSkillMoveUsage(skillId, usageKey, delta) {
        if (!skillId || !usageKey) return -1;
        var d = Number(delta);
        if (!isFinite(d) || d === 0) return -1;
        if (d > 0) return incrementSkillMoveUsage(skillId, usageKey, d);
        if (getSkillLevel(skillId) < 1) return -1;
        var entry = state.skills[skillId];
        if (!entry || typeof entry !== 'object') return -1;
        if (!entry.move_usage || typeof entry.move_usage !== 'object') entry.move_usage = {};
        var k = String(usageKey);
        var cur = parseInt(entry.move_usage[k], 10) || 0;
        var next = Math.max(0, cur + Math.floor(d));
        entry.move_usage[k] = next;
        if (typeof global !== 'undefined' && global.CharacterAttributes && typeof global.CharacterAttributes.recalcCharacterStats === 'function') {
            global.CharacterAttributes.recalcCharacterStats({
                getEquipmentState: function () { return state.equipment; },
                getSkillsState: function () { return state.skills; },
                getItemTemplate: getItemTemplate,
                getEnchantEntry: getEnchantEntry,
                getStrengthLevel: function () { return getSkillLevel('survival_strength'); }
            });
        }
        return next;
    }

    function initEquipmentSlots() {
        var i;
        for (i = 0; i < EQUIP_SLOT_IDS.length; i++) {
            var slot = EQUIP_SLOT_IDS[i];
            if (state.equipment[slot] === undefined) state.equipment[slot] = null;
        }
    }

    /** 根据词条 ID 返回词条配置（供属性重算等使用） */
    function getEnchantEntry(encId) {
        if (!encId) return null;
        return enchantTable[encId] || null;
    }

    /** 根据模块 ID 返回模块模板（data/modules.json，数据契约 38 §2） */
    function getModuleTemplate(moduleId) {
        if (!moduleId) return null;
        return moduleTable[moduleId] || null;
    }

    /** 判断模块模板是否跨槽位占用（复合模块：occupies 同时含 clothing.* 与 head.*） */
    function hasCrossSlotOccupancy(modTpl) {
        if (!modTpl || !Array.isArray(modTpl.occupies)) return false;
        var hasClothing = false, hasHead = false;
        for (var i = 0; i < modTpl.occupies.length; i++) {
            var oc = String(modTpl.occupies[i] || '');
            if (oc.indexOf('clothing.') === 0) hasClothing = true;
            else if (oc.indexOf('head.') === 0) hasHead = true;
        }
        return hasClothing && hasHead;
    }

    /** 读取指定槽点的已装模块实例 */
    function getInstalledModuleAt(slotId, plateKey) {
        var eq = state.equipment[slotId];
        if (eq && eq.modules && eq.modules[plateKey]) return eq.modules[plateKey];
        return null;
    }

    /** 命中部位 → 躯干板位映射（37 §3.2；头不归躯干防具） */
    var HIT_PART_TO_PLATE = {
        'chest': 'clothing.chest',
        'abdomen': 'clothing.abdomen',
        'left_arm': 'clothing.arm_l',
        'right_arm': 'clothing.arm_r',
        'left_leg': 'clothing.leg_l',
        'right_leg': 'clothing.leg_r'
    };

    /**
     * 读取当前躯干防具的激活信息（37 §4.2）：基础盾量 + Σ模块额外消耗%
     * @returns {{ baseShield: number, moduleCostSum: number, equipped: boolean }}
     */
    function getArmorShieldInfo() {
        var eq = state.equipment.clothing;
        if (!eq || !eq.item_id) return { baseShield: 0, moduleCostSum: 0, equipped: false };
        var tpl = getItemTemplate(eq.item_id);
        if (!tpl || tpl.base_shield == null) return { baseShield: 0, moduleCostSum: 0, equipped: false };
        var baseShield = Number(tpl.base_shield) || 0;
        var costSum = 0;
        if (eq.modules && typeof eq.modules === 'object') {
            for (var pk in eq.modules) {
                var mi = eq.modules[pk];
                if (!mi || !mi.item_id) continue;
                var mTpl = getModuleTemplate(mi.item_id);
                if (mTpl && mTpl.activation_cost_pct != null) costSum += Number(mTpl.activation_cost_pct) || 0;
            }
        }
        return { baseShield: baseShield, moduleCostSum: costSum, equipped: true };
    }

    /** 单模块对某伤害类型的减伤比例（基础 effects + 附魔，乘算，08 防具×词条口径） */
    function moduleReduceForDamageType(moduleInst, damageType) {
        if (!moduleInst || !moduleInst.item_id) return 0;
        var key = damageType === 'slash' ? 'slash_pct' : (damageType === 'pierce' ? 'pierce_pct' : 'blunt_pct');
        var keep = 1;
        var mTpl = getModuleTemplate(moduleInst.item_id);
        if (mTpl && Array.isArray(mTpl.effects)) {
            for (var i = 0; i < mTpl.effects.length; i++) {
                var e = mTpl.effects[i];
                if (e && e.effect_type === 'armor_bonus' && e.effect_params && e.effect_params[key] != null) {
                    var v = Number(e.effect_params[key]);
                    if (isFinite(v) && v > 0) keep *= (1 - Math.min(1, v));
                }
            }
        }
        if (moduleInst.enchant_id) {
            var enc = getEnchantEntry(moduleInst.enchant_id);
            if (enc && enc.effect_type === 'armor_bonus' && enc.effect_params && enc.effect_params[key] != null) {
                var v2 = Number(enc.effect_params[key]);
                if (isFinite(v2) && v2 > 0) keep *= (1 - Math.min(1, v2));
            }
        }
        return Math.max(0, 1 - keep);
    }

    /**
     * 命中部位对应的躯干板位模块减伤比例（激活盾的减伤比例，37 §4.3）
     * 命中头部或无躯干防具 → 0；空板 → 0（激活盾对空板无减伤）
     * @param {string} hitPart - 'chest'|'abdomen'|'left_arm'|... 
     * @param {string} damageType - 'blunt'|'slash'|'pierce'
     */
    function getPlateDamageReduce(hitPart, damageType) {
        var plateKey = HIT_PART_TO_PLATE[hitPart];
        if (!plateKey) return 0;
        var inst = getInstalledModuleAt('clothing', plateKey.slice('clothing.'.length));
        if (!inst) return 0;
        return moduleReduceForDamageType(inst, damageType);
    }

    // ---- 眩晕累积（37 §9.2，k13）----

    /** 玩家眩晕值（0-100，战斗状态字段，存档持久化） */
    function getPlayerStunValue() {
        ensureCombatState();
        return Math.max(0, Math.min(100, Math.floor(Number(state.combat.stun_value) || 0)));
    }

    /** 直接设置玩家眩晕值（衰减/调试用；不触发眩晕判定，0-100 夹紧） */
    function setPlayerStunValue(v) {
        ensureCombatState();
        state.combat.stun_value = Math.max(0, Math.min(100, Math.floor(Number(v) || 0)));
    }

    /** 玩家眩晕中（下一次行动将被吞，本回合无法行动） */
    function isPlayerStunned() {
        ensureCombatState();
        return state.combat.stun_rounds_left > 0;
    }

    /**
     * 玩家眩晕累积：加 stun 值；≥100 → 归 0 + 眩晕 1 回合（stun_rounds_left=1）。
     * @returns {{triggered:boolean, value:number}} triggered=是否触发眩晕
     */
    function addPlayerStun(amount) {
        ensureCombatState();
        var a = Math.max(0, Math.floor(Number(amount) || 0));
        if (a <= 0) return { triggered: false, value: getPlayerStunValue() };
        state.combat.stun_value = Math.min(100, state.combat.stun_value + a);
        var triggered = false;
        if (state.combat.stun_value >= 100) {
            state.combat.stun_value = 0;
            state.combat.stun_rounds_left = 1;
            triggered = true;
        }
        return { triggered: triggered, value: state.combat.stun_value };
    }

    /** 玩家眩晕回合消费：若眩晕中则吞掉本次行动并清空回合，返回 true（调用方应拦截该动作） */
    function consumePlayerStunRoundIfBlocking() {
        ensureCombatState();
        if (state.combat.stun_rounds_left <= 0) return false;
        state.combat.stun_rounds_left = 0;
        return true;
    }

    /**
     * 头部抗眩晕豁免%（37 §9.2/§9.4，头防具专属）：Σ 已装头模块 anti_stun 效果（软内衬等），
     * 封顶 stun_resist_cap（默认 60%，头永远是威胁）；其他槽位/模块/词条不提供。
     */
    function getHeadAntiStunPct() {
        var eq = state.equipment && state.equipment.head;
        if (!eq || !eq.item_id) return 0;
        var total = 0;
        if (eq.modules && typeof eq.modules === 'object') {
            for (var pk in eq.modules) {
                var mi = eq.modules[pk];
                if (!mi || !mi.item_id) continue;
                var mTpl = getModuleTemplate(mi.item_id);
                if (!mTpl || !Array.isArray(mTpl.effects)) continue;
                for (var i = 0; i < mTpl.effects.length; i++) {
                    var e = mTpl.effects[i];
                    if (e && e.effect_type === 'anti_stun' && e.effect_params && e.effect_params.anti_stun_pct != null) {
                        total += Number(e.effect_params.anti_stun_pct) || 0;
                    }
                }
            }
        }
        var cap = 0.6;
        try {
            if (global.CharacterAttributes && typeof global.CharacterAttributes.getCfg === 'function') {
                var c = Number(global.CharacterAttributes.getCfg('stun_resist_cap', 0.6));
                if (isFinite(c) && c >= 0) cap = c;
            }
        } catch (eCap) { /* ignore */ }
        return Math.min(cap, Math.max(0, total));
    }

    // ---- 鞋子结算（k17，39 §6.5/§6.6）----

    function getShoeTemplate(side) {
        var slot = side === 'left' ? 'shoe_left' : 'shoe_right';
        var eq = state.equipment && state.equipment[slot];
        if (!eq || !eq.item_id) return null;
        return getItemTemplate(eq.item_id);
    }

    /**
     * 全身共享维度（39 §6.6 左右取更差）：移动体力修正取 max（更耗体力者决定全身）、
     * 招架加成/速度加成取 min（加成更低者决定全身）；裸脚 = 0 / 1.0 / 1.0（中性）。
     * 招架加成与速度加成拆开（重靴只加招架不加速度，运动鞋只加速度不加招架）。
     * @returns {{moveCostMod:number, parryCoef:number, speedCoef:number}}
     */
    function getShoeSharedMods() {
        var L = getShoeTemplate('left');
        var R = getShoeTemplate('right');
        function mod(tpl, key, def) {
            if (!tpl || tpl[key] == null) return def;
            var v = Number(tpl[key]);
            return isFinite(v) ? v : def;
        }
        return {
            moveCostMod: Math.max(mod(L, 'move_cost_mod', 0), mod(R, 'move_cost_mod', 0)),
            parryCoef: Math.min(mod(L, 'parry_coef', 1), mod(R, 'parry_coef', 1)),
            speedCoef: Math.min(mod(L, 'speed_coef', 1), mod(R, 'speed_coef', 1))
        };
    }

    /**
     * 步法招架侧固定效果（k17，11 §8.3.4 / 39 §6.4）：挂载步法技能的招架率/卸力加成 × 鞋 parry_coef（左右取更差）。
     * 未挂载步法或无加成 → {chance:0, reduce:0}。
     * @returns {{chance:number, reduce:number}}
     */
    function getFootworkParryBonus() {
        ensureCombatState();
        var hubs = state.combat && state.combat.hubs;
        var fwId = hubs && hubs.footwork;
        if (!fwId) return { chance: 0, reduce: 0 };
        var CS = global.CombatSkills;
        var sk = (CS && typeof CS.getSkill === 'function') ? CS.getSkill(fwId) : null;
        if (!sk) return { chance: 0, reduce: 0 };
        var c = sk.parry_chance_bonus != null ? Number(sk.parry_chance_bonus) : 0;
        var r = sk.parry_damage_reduce_bonus != null ? Number(sk.parry_damage_reduce_bonus) : 0;
        if (!isFinite(c) || c <= 0) c = 0;
        if (!isFinite(r) || r <= 0) r = 0;
        if (c <= 0 && r <= 0) return { chance: 0, reduce: 0 };
        var shoe = getShoeSharedMods();
        return { chance: c * shoe.parryCoef, reduce: r * shoe.parryCoef };
    }

    /** 鞋子速度加成（k17）：左右取更差（speed_coef，裸脚 1.0），喂给战斗速度结算 */
    function getShoeSpeedCoef() {
        return getShoeSharedMods().speedCoef;
    }

    /**
     * 先查 equipment、再查 items；无则返回 null
     */
    function getItemTemplate(itemId) {
        if (!itemId) return null;
        if (equipmentTable[itemId]) return equipmentTable[itemId];
        if (itemsTable[itemId]) return itemsTable[itemId];
        if (moduleTable[itemId]) return moduleTable[itemId];
        return null;
    }

    /** 仅物品表（items.json）中的 id，已排序；不含装备表 */
    function getAllItemIds() {
        return Object.keys(itemsTable || {}).sort();
    }

    /**
     * 有效基价（贸易/任务/事件）：round(模板 base_value)，品质系统已移除（见 docs/design/41-quality-removal.md）。
     * @param {string} itemId
     * @param {object|number|null} [instanceOrTier] 旧接口兼容：实例或品质档，已不参与数值
     * @returns {number}
     */
    function getEffectiveBaseValue(itemId, instanceOrTier) {
        var IV = global.ItemValue;
        if (IV && typeof IV.getEffectiveBaseValue === 'function') {
            var opts = {};
            if (instanceOrTier != null && typeof instanceOrTier === 'object' && !Array.isArray(instanceOrTier)) {
                opts.instance = instanceOrTier;
            }
            return IV.getEffectiveBaseValue(itemId, opts);
        }
        var tpl = getItemTemplate(itemId);
        var b = tpl && tpl.base_value != null ? Number(tpl.base_value) : 0;
        return isFinite(b) ? Math.max(0, Math.round(b)) : 0;
    }

    /** 语言等级（survival_language）；character 缺省时用当前存档 skills */
    function getSurvivalLanguageLevel(character) {
        var lv;
        if (character && character.skills && character.skills.survival_language) {
            lv = parseInt(character.skills.survival_language.level, 10);
            if (isFinite(lv)) return Math.max(0, lv);
        }
        if (state.skills && state.skills.survival_language) {
            lv = parseInt(state.skills.survival_language.level, 10);
            if (isFinite(lv)) return Math.max(0, lv);
        }
        return 0;
    }

    /**
     * 根据技能等级返回展示档位 0/1/2，用于 name_0/1/2、desc_0/1/2
     * 档位阈值可留空，留空时默认档位 0
     * 名称/说明的最终展示另受「语言」等级约束，见 getDisplayName / getDisplayDesc
     */
    function getItemDisplayTier(itemId, character) {
        var tpl = getItemTemplate(itemId);
        if (!tpl || !tpl.display_skill_id) return 0;
        var skillId = tpl.display_skill_id;
        var level = character && character.skills && character.skills[skillId]
            ? Math.max(0, parseInt(character.skills[skillId].level, 10))
            : 0;
        var t1 = displayTierThreshold1 != null ? displayTierThreshold1 : Infinity;
        var t2 = displayTierThreshold2 != null ? displayTierThreshold2 : Infinity;
        if (level >= t2) return 2;
        if (level >= t1) return 1;
        return 0;
    }

    /**
     * 语言小于 3：名称 placeholder_name；大于等于 3：名称 sn（无 sn 时用 name_0/name）
     * @param {object} character 可选；缺省用当前角色 skills
     */
    function getDisplayName(tpl, tier, character) {
        if (!tpl) return '?';
        var langLv = getSurvivalLanguageLevel(character);
        if (langLv < 3) {
            if (tpl.placeholder_name != null && String(tpl.placeholder_name) !== '') return String(tpl.placeholder_name);
            return tpl.name_0 != null ? tpl.name_0 : (tpl.name || tpl.id || '?');
        }
        if (tpl.sn != null && String(tpl.sn) !== '') return String(tpl.sn);
        return tpl.name_0 != null ? tpl.name_0 : (tpl.name || tpl.id || '?');
    }

    /**
     * 语言小于 2：无说明；大于等于 2 且小于 4：fn_before（无则 desc_0）；大于等于 4：fn（无 fn 时用 desc_0）
     */
    function getDisplayDesc(tpl, tier, character) {
        if (!tpl) return '';
        var langLv = getSurvivalLanguageLevel(character);
        if (langLv < 2) return '';
        if (langLv < 4) {
            if (tpl.fn_before != null && String(tpl.fn_before) !== '') return String(tpl.fn_before);
            return tpl.desc_0 != null ? tpl.desc_0 : (tpl.desc || '');
        }
        var fn = tpl.fn != null ? String(tpl.fn) : '';
        if (fn === '' && tpl.desc_0 != null) fn = String(tpl.desc_0);
        return fn;
    }

    /** 当前装备提供的口袋格数（来自衣服） */
    function getPocketSlots() {
        var clothing = state.equipment.clothing;
        if (!clothing || !clothing.item_id) return 0;
        var tpl = getItemTemplate(clothing.item_id);
        return (tpl && tpl.pocket_slots != null) ? Math.max(0, parseInt(tpl.pocket_slots, 10)) : 0;
    }

    /** 当前装备提供的背心格数 */
    function getVestSlots() {
        var vest = state.equipment.vest;
        if (!vest || !vest.item_id) return 0;
        var tpl = getItemTemplate(vest.item_id);
        return (tpl && tpl.vest_slots != null) ? Math.max(0, parseInt(tpl.vest_slots, 10)) : 0;
    }

    /** 当前装备提供的背包格数 */
    function getBackpackSlots() {
        var backpack = state.equipment.backpack;
        if (!backpack || !backpack.item_id) return 0;
        var tpl = getItemTemplate(backpack.item_id);
        return (tpl && tpl.backpack_slots != null) ? Math.max(0, parseInt(tpl.backpack_slots, 10)) : 0;
    }

    /** 快捷腰带总格数 = 口袋 + 背心；格序先口袋、后背心 */
    function getQuickBeltSlots() {
        return getPocketSlots() + getVestSlots();
    }

    /** 快捷腰带索引 → 容器类型与格位 { type: 'pocket'|'vest', index: number } */
    function getQuickBeltSlotSource(beltIndex) {
        var pocket = getPocketSlots();
        if (beltIndex < pocket) return { type: 'pocket', index: beltIndex };
        return { type: 'vest', index: beltIndex - pocket };
    }

    /** 取口袋/背心/背包数组（按当前装备长度截断） */
    function getPocketArray() {
        var max = getPocketSlots();
        var arr = state.inventory_pocket.slice(0, max);
        while (arr.length < max) arr.push(null);
        return arr.slice(0, max);
    }

    function getVestArray() {
        var max = getVestSlots();
        var arr = state.inventory_vest.slice(0, max);
        while (arr.length < max) arr.push(null);
        return arr.slice(0, max);
    }

    function getBackpackArray() {
        var max = getBackpackSlots();
        var arr = state.inventory_backpack.slice(0, max);
        while (arr.length < max) arr.push(null);
        return arr.slice(0, max);
    }

    function getVehicleArray() {
        if (!state.bound_vehicle_id || !state.inventory_vehicle) return [];
        return state.inventory_vehicle.slice();
    }

    /** 统计 raw 容器数组前 maxSlots 格内某模板 id 的总数量（与口袋/背心/背包有效格一致） */
    function sumItemTemplateInRawArray(arr, itemId, maxSlots) {
        var want = String(itemId || '').trim();
        if (!want || !Array.isArray(arr)) return 0;
        var lim = arr.length;
        if (maxSlots != null && isFinite(maxSlots)) {
            var ms = Math.max(0, Math.floor(Number(maxSlots)));
            lim = Math.min(lim, ms);
        }
        var sum = 0;
        for (var i = 0; i < lim; i++) {
            var cell = arr[i];
            if (!cell || !cell.item_id) continue;
            if (String(cell.item_id) !== want) continue;
            var c = (cell.count != null && cell.count > 0) ? cell.count : 1;
            sum += c;
        }
        return sum;
    }

    /**
     * 口袋 + 背心 + 背包 +（已绑定载具时）载具栏内，按物品模板 id 合计数量（不含身上装备槽）。
     */
    function countCarriedItemsByTemplateId(itemId) {
        var want = String(itemId || '').trim();
        if (!want) return 0;
        var total = 0;
        total += sumItemTemplateInRawArray(state.inventory_pocket, want, getPocketSlots());
        total += sumItemTemplateInRawArray(state.inventory_vest, want, getVestSlots());
        total += sumItemTemplateInRawArray(state.inventory_backpack, want, getBackpackSlots());
        if (state.bound_vehicle_id && state.inventory_vehicle && state.inventory_vehicle.length) {
            total += sumItemTemplateInRawArray(state.inventory_vehicle, want, null);
        }
        return total;
    }

    function recalcStatsAfterInventoryChange() {
        if (typeof global === 'undefined' || !global.CharacterAttributes || typeof global.CharacterAttributes.recalcCharacterStats !== 'function') return;
        global.CharacterAttributes.recalcCharacterStats({
            getEquipmentState: function () { return state.equipment; },
            getSkillsState: function () { return state.skills; },
            getItemTemplate: getItemTemplate,
            getEnchantEntry: getEnchantEntry,
            getStrengthLevel: function () { return getSkillLevel('survival_strength'); }
        });
    }

    /**
     * 按模板 id 从携带容器扣减数量。顺序：口袋 → 背心 → 背包 → 载具。
     * @param {string} itemId
     * @param {number} count
     * @param {{ strict?: boolean }} options strict 默认 true：数量不足时整笔不扣；false 时扣到尽为止
     */
    function removeCarriedItemsByTemplateId(itemId, count, options) {
        options = options || {};
        var strict = options.strict !== false;
        var requested = Math.max(0, Math.floor(Number(count) || 0));
        if (!requested) return { ok: true, removed: 0, requested: 0, shortfall: 0 };
        var want = String(itemId || '').trim();
        if (!want) return { ok: false, removed: 0, requested: requested, shortfall: requested };
        var available = countCarriedItemsByTemplateId(want);
        if (strict && available < requested) {
            return { ok: false, removed: 0, requested: requested, shortfall: requested - available };
        }
        var toRemove = strict ? requested : Math.min(requested, available);
        var removed = 0;
        var order = ['pocket', 'vest', 'backpack'];
        var oi, idx;
        for (oi = 0; oi < order.length && removed < toRemove; oi++) {
            var ct = order[oi];
            var maxI = (ct === 'pocket') ? getPocketSlots() : (ct === 'vest') ? getVestSlots() : getBackpackSlots();
            if (maxI <= 0) continue;
            for (idx = 0; idx < maxI && removed < toRemove; idx++) {
                while (removed < toRemove) {
                    var arr = state['inventory_' + ct];
                    if (!arr || idx >= arr.length) break;
                    var cell = arr[idx];
                    if (!cell || String(cell.item_id) !== want) break;
                    var took = takeItemFromContainer(ct, idx);
                    if (!took.success) break;
                    removed++;
                }
            }
        }
        if (removed < toRemove && state.bound_vehicle_id && state.inventory_vehicle) {
            for (idx = 0; idx < state.inventory_vehicle.length && removed < toRemove; idx++) {
                while (removed < toRemove) {
                    var varr = state.inventory_vehicle;
                    if (!varr || idx >= varr.length) break;
                    var vc = varr[idx];
                    if (!vc || String(vc.item_id) !== want) break;
                    var tookV = takeItemFromContainer('vehicle', idx);
                    if (!tookV.success) break;
                    removed++;
                }
            }
        }
        if (removed > 0) recalcStatsAfterInventoryChange();
        var shortfall = Math.max(0, requested - removed);
        return {
            ok: strict ? (removed === requested) : true,
            removed: removed,
            requested: requested,
            shortfall: shortfall
        };
    }

    /**
     * 通过默认放置顺序逐件发放（与 putItemIntoDefaultContainer 一致）。
     */
    function giveCarriedItemsByTemplateId(itemId, count, qualityTier) {
        var id = String(itemId || '').trim();
        var c = Math.max(1, Math.floor(Number(count) || 1));
        if (!id || !getItemTemplate(id)) return { ok: false, placed: 0, requested: c, shortfall: c };
        var placed = 0;
        for (var i = 0; i < c; i++) {
            var pr = putItemIntoDefaultContainer({ item_id: id, count: 1 });
            if (!pr || !pr.placed) {
                return { ok: false, placed: placed, requested: c, shortfall: c - placed };
            }
            placed++;
        }
        if (placed > 0) recalcStatsAfterInventoryChange();
        return { ok: placed === c, placed: placed, requested: c, shortfall: Math.max(0, c - placed) };
    }

    /**
     * 当前实际负重 W（设计 05 5.5.4）
     * 装备 + 口袋 + 背心 + 背包内物品×背包折扣；力量满 100 时左右手武器不计入。
     * @returns {number} 公斤（kg），浮点
     */
    function getCurrentCarryWeight() {
        var total = 0;
        var strLevel = getSkillLevel('survival_strength');
        var excludeWeaponWeight = strLevel >= 100;

        for (var i = 0; i < EQUIP_SLOT_IDS.length; i++) {
            var slotId = EQUIP_SLOT_IDS[i];
            if (excludeWeaponWeight && (slotId === 'weapon_left' || slotId === 'weapon_right')) continue;
            var eq = state.equipment[slotId];
            if (!eq || !eq.item_id) continue;
            var tpl = getItemTemplate(eq.item_id);
            if (tpl && tpl.weight_kg != null) total += Number(tpl.weight_kg);
        }

        function addContainerWeight(arr) {
            if (!arr) return;
            for (var j = 0; j < arr.length; j++) {
                var cell = arr[j];
                if (!cell || !cell.item_id) continue;
                var tpl = getItemTemplate(cell.item_id);
                if (!tpl || tpl.weight_kg == null) continue;
                var qty = (cell.count != null && cell.count > 0) ? cell.count : 1;
                total += qty * Number(tpl.weight_kg);
            }
        }

        addContainerWeight(state.inventory_pocket);
        addContainerWeight(state.inventory_vest);

        var backpackFactor = 0.7;
        var backpack = state.equipment.backpack;
        if (backpack && backpack.item_id) {
            var bpTpl = getItemTemplate(backpack.item_id);
            if (bpTpl && bpTpl.backpack_weight_factor != null) backpackFactor = Number(bpTpl.backpack_weight_factor);
        }
        if (state.inventory_backpack && state.inventory_backpack.length) {
            for (var k = 0; k < state.inventory_backpack.length; k++) {
                var cell = state.inventory_backpack[k];
                if (!cell || !cell.item_id) continue;
                var tpl = getItemTemplate(cell.item_id);
                if (!tpl || tpl.weight_kg == null) continue;
                var qty = (cell.count != null && cell.count > 0) ? cell.count : 1;
                total += qty * Number(tpl.weight_kg) * backpackFactor;
            }
        }

        return total;
    }

    /**
     * 尝试将物品放入默认顺序：背包 → 载具 → 背心 → 口袋
     * 返回 { placed: boolean, container?: string, index?: number, dropped?: boolean }
     */
    function putItemIntoDefaultContainer(itemInstance) {
        if (!itemInstance || !itemInstance.item_id) return { placed: false, dropped: true };

        var backpackSlots = getBackpackSlots();
        if (backpackSlots > 0) {
            var arr = state.inventory_backpack.slice();
            var canStack = canStackInSlot(itemInstance, null);
            for (var i = 0; i < backpackSlots; i++) {
                var existing = arr[i] || null;
                if (canStack && existing && existing.item_id === itemInstance.item_id
                    && !(existing.enchants && existing.enchants.length)) {
                    var count = (existing.count || 1) + (itemInstance.count || 1);
                    var maxStack = getMaxStack(itemInstance.item_id);
                    if (count <= maxStack) {
                        arr[i] = { item_id: existing.item_id, count: count };
                        state.inventory_backpack = arr;
                        return { placed: true, container: 'backpack', index: i };
                    }
                }
                if (!existing) {
                    arr[i] = copyItemInstance(itemInstance);
                    state.inventory_backpack = arr;
                    return { placed: true, container: 'backpack', index: i };
                }
            }
        }

        if (state.bound_vehicle_id && state.inventory_vehicle) {
            var varr = state.inventory_vehicle.slice();
            for (var j = 0; j < varr.length; j++) {
                if (!varr[j]) {
                    varr[j] = copyItemInstance(itemInstance);
                    state.inventory_vehicle = varr;
                    return { placed: true, container: 'vehicle', index: j };
                }
            }
            varr.push(copyItemInstance(itemInstance));
            state.inventory_vehicle = varr;
            return { placed: true, container: 'vehicle', index: varr.length - 1 };
        }

        var vestSlots = getVestSlots();
        if (vestSlots > 0) {
            var v = state.inventory_vest.slice();
            for (var k = 0; k < vestSlots; k++) {
                if (!v[k]) {
                    v[k] = copyItemInstance(itemInstance);
                    if (v[k].count > 1) v[k].count = 1;
                    state.inventory_vest = v;
                    return { placed: true, container: 'vest', index: k };
                }
            }
        }

        var pocketSlots = getPocketSlots();
        if (pocketSlots > 0) {
            var p = state.inventory_pocket.slice();
            for (var m = 0; m < pocketSlots; m++) {
                if (!p[m]) {
                    p[m] = copyItemInstance(itemInstance);
                    if (p[m].count > 1) p[m].count = 1;
                    state.inventory_pocket = p;
                    return { placed: true, container: 'pocket', index: m };
                }
            }
        }

        return { placed: false, dropped: true };
    }

    /** 是否至少有一个容器能再放一件物品（用于采集等判定“背包是否满”） */
    function canAcceptItem() {
        var pocketSlots = getPocketSlots(), vestSlots = getVestSlots(), backpackSlots = getBackpackSlots();
        var pocketUsed = state.inventory_pocket.filter(Boolean).length;
        var vestUsed = state.inventory_vest.filter(Boolean).length;
        var backpackUsed = state.inventory_backpack.filter(Boolean).length;
        if (pocketSlots > 0 && pocketUsed < pocketSlots) return true;
        if (vestSlots > 0 && vestUsed < vestSlots) return true;
        if (backpackSlots > 0 && backpackUsed < backpackSlots) return true;
        if (state.bound_vehicle_id && state.inventory_vehicle) return true;
        return false;
    }

    function canStackInSlot(instance, existing) {
        var tpl = getItemTemplate(instance.item_id);
        if (!tpl) return false;
        if (tpl.enchant_slots != null && tpl.enchant_slots > 0) return false;
        if (instance.enchants && instance.enchants.length) return false;
        if (existing && (existing.enchants && existing.enchants.length)) return false;
        return true;
    }

    function getMaxStack(itemId) {
        var tpl = getItemTemplate(itemId);
        if (!tpl) return 1;
        if (tpl.enchant_slots != null && tpl.enchant_slots > 0) return 1;
        if (moduleTable[itemId]) return 1; // 模块为唯一实例（可带附魔），不可堆叠（契约 38 §2）
        return (tpl.stack_max != null) ? Math.max(1, parseInt(tpl.stack_max, 10)) : 99;
    }

    function copyItemInstance(inst) {
        var c = { item_id: inst.item_id };
        if (inst.count != null) c.count = inst.count;
        if (inst.enchants && inst.enchants.length) c.enchants = inst.enchants.slice();
        if (inst.enchant_id != null) c.enchant_id = inst.enchant_id;      // 模块附魔（契约 38 §4）
        if (inst.modules && typeof inst.modules === 'object') {           // 模块化防具实例（契约 38 §4）
            c.modules = {};
            for (var mk in inst.modules) c.modules[mk] = inst.modules[mk];
        }
        if (inst.ground_drop_tick != null) c.ground_drop_tick = Math.max(0, Math.floor(Number(inst.ground_drop_tick) || 0));
        return c;
    }

    function getCurrentTickCountSafe() {
        if (typeof global !== 'undefined' && global.Survival && typeof global.Survival.getState === 'function') {
            var s = global.Survival.getState();
            var t = s && s.tickCount != null ? Math.floor(Number(s.tickCount) || 0) : 0;
            return Math.max(0, t);
        }
        return 0;
    }

    function parseGroundItemKey(key) {
        var s = String(key || '');
        var last = s.lastIndexOf('_');
        if (last <= 0) return null;
        var prev = s.lastIndexOf('_', last - 1);
        if (prev <= 0) return null;
        var mapId = s.slice(0, prev);
        var x = parseInt(s.slice(prev + 1, last), 10);
        var y = parseInt(s.slice(last + 1), 10);
        if (!mapId || !isFinite(x) || !isFinite(y)) return null;
        return { mapId: mapId, x: x, y: y };
    }

    function isDungeonMapId(mapId) {
        var id = String(mapId || '');
        if (!id) return false;
        var info = null;
        if (typeof global !== 'undefined' && global.GameEngine && typeof global.GameEngine.getMaps === 'function') {
            var maps = global.GameEngine.getMaps();
            if (maps && typeof maps === 'object' && maps[id]) info = maps[id];
        }
        if (info && typeof info === 'object') {
            if (info.is_dungeon === true) return true;
            if (String(info.map_type || '').toLowerCase() === 'dungeon') return true;
            if (String(info.region_type || '').toLowerCase() === 'dungeon') return true;
            if (Array.isArray(info.tags)) {
                for (var i = 0; i < info.tags.length; i++) {
                    if (String(info.tags[i] || '').toLowerCase() === 'dungeon') return true;
                }
            }
        }
        return /dungeon|地牢/i.test(id);
    }

    /**
     * 穿戴装备：校验 equip_slot 一致、enchants 数量不超过 enchant_slots
     * 返回 { success: boolean, message?: string }
     */
    function equip(slotId, instance) {
        if (EQUIP_SLOT_IDS.indexOf(slotId) < 0) return { success: false, message: t('inv.equip.invalid_slot') };
        if (!instance || !instance.item_id) return { success: false, message: t('inv.equip.invalid_item') };
        var tpl = getItemTemplate(instance.item_id);
        if (!tpl) return { success: false, message: t('inv.equip.unknown_item') };
        if (tpl.equip_slot !== slotId) return { success: false, message: t('inv.equip.slot_mismatch') };
        var maxEnchants = (tpl.enchant_slots != null) ? parseInt(tpl.enchant_slots, 10) : 6;
        var enc = instance.enchants;
        if (enc && enc.length > maxEnchants) return { success: false, message: t('inv.equip.enchant_over') };

        // 兵器门槛（05 5.5.3）：先天筋骨 < 0.5×Req 不能装备/挥动
        if ((slotId === 'weapon_left' || slotId === 'weapon_right')
            && global.CharacterAttributes && typeof global.CharacterAttributes.canUseWeapon === 'function') {
            var wreqT = tpl.req_innate_jingu != null ? Number(tpl.req_innate_jingu) : undefined;
            if (!global.CharacterAttributes.canUseWeapon(wreqT)) {
                return { success: false, message: t('inv.equip.weapon_req_innate_jingu') };
            }
        }

        var inst = copyItemInstance(instance);
        // 模块化底材：实例化为槽点结构（modules 对象），词条随模块走（37 §4 / 契约 38 §4）
        if (Array.isArray(tpl.module_slots) && tpl.module_slots.length > 0) {
            var mods = {};
            for (var msi = 0; msi < tpl.module_slots.length; msi++) mods[tpl.module_slots[msi]] = null;
            if (inst.modules && typeof inst.modules === 'object') {
                for (var mki in inst.modules) if (mods.hasOwnProperty(mki)) mods[mki] = inst.modules[mki];
            }
            inst.modules = mods;
            delete inst.enchants;
        }
        state.equipment[slotId] = inst;
        if (typeof global !== 'undefined' && global.CharacterAttributes && typeof global.CharacterAttributes.recalcCharacterStats === 'function') {
            global.CharacterAttributes.recalcCharacterStats({
                getEquipmentState: function () { return state.equipment; },
                getSkillsState: function () { return state.skills; },
                getItemTemplate: getItemTemplate,
                getEnchantEntry: getEnchantEntry,
                getStrengthLevel: function () { return getSkillLevel('survival_strength'); }
            });
        }
        return { success: true };
    }

    /**
     * 安装模块到防具槽点（模块化底材专用，数据契约 38 §2/§7）
     * 校验：槽点存在、模块 occupies 匹配、占用冲突、复合模块 head 底材在场
     * @param {string} slotId - 'clothing' | 'head'
     * @param {string} plateKey - 槽点（如 'chest' / 'shell'）
     * @param {{ item_id: string, enchant_id?: string|null }} moduleInstance
     * @returns {{ success: boolean, message?: string }}
     */
    function installModule(slotId, plateKey, moduleInstance) {
        if (!moduleInstance || !moduleInstance.item_id) return { success: false, message: t('inv.module.invalid_module') };
        var eq = state.equipment[slotId];
        if (!eq || !eq.item_id) return { success: false, message: t('inv.module.no_armor') };
        var tpl = getItemTemplate(eq.item_id);
        if (!tpl || !Array.isArray(tpl.module_slots) || tpl.module_slots.indexOf(plateKey) < 0)
            return { success: false, message: t('inv.module.invalid_plate') };
        var modTpl = getModuleTemplate(moduleInstance.item_id);
        if (!modTpl) return { success: false, message: t('inv.module.unknown_module') };
        // 可安装槽点校验（install_slots，兼容旧 occupies 单槽语义）（契约 38 §2）
        var installSlots = (Array.isArray(modTpl.install_slots) && modTpl.install_slots.length)
            ? modTpl.install_slots
            : (Array.isArray(modTpl.occupies) ? modTpl.occupies : []);
        if (installSlots.indexOf(slotId + '.' + plateKey) < 0)
            return { success: false, message: t('inv.module.slot_mismatch') };
        // 实际占用集合（occupies 省略 = 默认占用被安装的槽点）
        var occupied = (Array.isArray(modTpl.occupies) && modTpl.occupies.length)
            ? modTpl.occupies
            : [slotId + '.' + plateKey];
        // 数量上限：同种模块在同一防具上的已装数（契约 38 §2 max_per_armor）
        if (modTpl.max_per_armor != null && countModulesOnArmor(slotId, moduleInstance.item_id) >= modTpl.max_per_armor)
            return { success: false, message: t('inv.module.max_count') };
        // 复合模块：必须 head 底材在场（37 §3.5 / 契约 38 §7.3）
        if (hasCrossSlotOccupancy(modTpl) && !(state.equipment.head && state.equipment.head.item_id))
            return { success: false, message: t('inv.module.need_head') };
        // 占用冲突：occupies 声明的所有槽点都不可被其他模块占用（契约 38 §7.2）
        for (var i = 0; i < occupied.length; i++) {
            var oc = String(occupied[i]);
            var dot = oc.indexOf('.');
            if (dot < 0) continue;
            var s = oc.slice(0, dot), p = oc.slice(dot + 1);
            var existing = getInstalledModuleAt(s, p);
            if (existing && existing.item_id !== moduleInstance.item_id)
                return { success: false, message: t('inv.module.occupied') };
        }
        // 复合模块挂在主槽位（clothing）的模块列表，occupies 为唯一事实源（契约 38 §4）
        // 装备实例可能没有 modules 字段（新手装/新物品未初始化）→ 先确保存在
        if (!eq.modules || typeof eq.modules !== 'object') eq.modules = {};
        eq.modules[plateKey] = { item_id: moduleInstance.item_id, enchant_id: moduleInstance.enchant_id || null };
        recalcCharacterStatsForEquipment();
        return { success: true };
    }

    /** 统计同一防具（底材）上同种模块的已装数量（max_per_armor 上限用） */
    function countModulesOnArmor(slotId, moduleId) {
        var eq = state.equipment[slotId];
        var n = 0;
        if (eq && eq.modules) {
            for (var pk in eq.modules) {
                var inst = eq.modules[pk];
                if (inst && inst.item_id === moduleId) n++;
            }
        }
        return n;
    }

    /**
     * 卸下防具槽点上的模块（复合模块：从主槽位卸下）
     * @param {string} slotId
     * @param {string} plateKey
     * @returns {{ success: boolean, item?: object }}
     */
    function uninstallModule(slotId, plateKey) {
        var eq = state.equipment[slotId];
        if (!eq || !eq.modules || !eq.modules[plateKey]) return { success: false };
        var item = eq.modules[plateKey];
        eq.modules[plateKey] = null;
        recalcCharacterStatsForEquipment();
        return { success: true, item: item };
    }

    /** 模块/词条变化后重算角色属性 */
    function recalcCharacterStatsForEquipment() {
        if (typeof global !== 'undefined' && global.CharacterAttributes && typeof global.CharacterAttributes.recalcCharacterStats === 'function') {
            global.CharacterAttributes.recalcCharacterStats({
                getEquipmentState: function () { return state.equipment; },
                getSkillsState: function () { return state.skills; },
                getItemTemplate: getItemTemplate,
                getEnchantEntry: getEnchantEntry,
                getStrengthLevel: function () { return getSkillLevel('survival_strength'); }
            });
        }
    }

    /**
     * 从指定容器取出指定格位的物品（从栏位移除并返回实例；可堆叠时取 1 个单位）
     * @param {string} containerType - 'pocket' | 'vest' | 'backpack' | 'vehicle'
     * @param {number} index - 格位索引
     * @returns {{ item: object|null, success: boolean }}
     */
    function takeItemFromContainer(containerType, index) {
        var key = 'inventory_' + containerType;
        if (key !== 'inventory_pocket' && key !== 'inventory_vest' && key !== 'inventory_backpack' && key !== 'inventory_vehicle') return { item: null, success: false };
        var arr = state[key];
        if (!arr || index < 0 || index >= arr.length) return { item: null, success: false };
        var raw = arr[index];
        if (!raw || !raw.item_id) return { item: null, success: false };
        var taken = copyItemInstance(raw);
        if (raw.count != null && raw.count > 1) {
            raw.count -= 1;
            taken.count = 1;
        } else {
            arr[index] = null;
        }
        return { item: taken, success: true };
    }

    /**
     * 脱下指定槽位装备；若为背心/背包/衣服，先迁移物品再置空容器
     * @param {string} slotId
     * @param {{ mapId: string, x: number, y: number }|undefined} optGroundPos - 迁移时放不下的物品掉落到该格子
     */
    function unequip(slotId, optGroundPos) {
        if (EQUIP_SLOT_IDS.indexOf(slotId) < 0) return null;
        var current = state.equipment[slotId];
        state.equipment[slotId] = null;

        if (slotId === 'vest') {
            migrateContainerToBackpack(state.inventory_vest, optGroundPos);
            state.inventory_vest = [];
        }
        if (slotId === 'backpack') {
            migrateContainerToBackpack(state.inventory_backpack, optGroundPos);
            state.inventory_backpack = [];
        }
        if (slotId === 'clothing') {
            migrateContainerToBackpack(state.inventory_pocket, optGroundPos);
            state.inventory_pocket = [];
        }

        if (typeof global !== 'undefined' && global.CharacterAttributes && typeof global.CharacterAttributes.recalcCharacterStats === 'function') {
            global.CharacterAttributes.recalcCharacterStats({
                getEquipmentState: function () { return state.equipment; },
                getSkillsState: function () { return state.skills; },
                getItemTemplate: getItemTemplate,
                getEnchantEntry: getEnchantEntry,
                getStrengthLevel: function () { return getSkillLevel('survival_strength'); }
            });
        }
        return current;
    }

    /** 地面物品 key */
    function getGroundItemKey(mapId, x, y) {
        if (mapId == null || x == null || y == null) return '';
        return String(mapId) + '_' + x + '_' + y;
    }

    /** 获取指定格子上的地面物品列表（副本） */
    function getGroundItemsAt(mapId, x, y) {
        var key = getGroundItemKey(mapId, x, y);
        var arr = state.ground_items[key];
        if (!arr || !arr.length) return [];
        return arr.slice();
    }

    /** 将物品放到指定格子地面 */
    function addItemToGround(mapId, x, y, itemInstance) {
        if (!itemInstance || !itemInstance.item_id) return;
        var key = getGroundItemKey(mapId, x, y);
        if (!key) return;
        if (!state.ground_items[key]) state.ground_items[key] = [];
        var inst = copyItemInstance(itemInstance);
        if (inst.ground_drop_tick == null) inst.ground_drop_tick = getCurrentTickCountSafe();
        state.ground_items[key].push(inst);
    }

    /**
     * 清理非地牢地图上超过存续 tick 的地面物品。
     * 仅对主动丢弃/掉落到地面的物品生效；地牢内物品不参与该规则。
     */
    function pruneExpiredGroundItems(currentTick, maxAgeTicks) {
        var nowTick = Math.max(0, Math.floor(Number(currentTick) || 0));
        var ttl = Math.max(1, Math.floor(Number(maxAgeTicks) || GROUND_ITEM_DESPAWN_TICKS));
        var removed = 0;
        for (var key in state.ground_items) {
            if (!Object.prototype.hasOwnProperty.call(state.ground_items, key)) continue;
            var arr = state.ground_items[key];
            if (!Array.isArray(arr) || arr.length === 0) {
                delete state.ground_items[key];
                continue;
            }
            var parsed = parseGroundItemKey(key);
            if (!parsed || isDungeonMapId(parsed.mapId)) continue;
            var kept = [];
            for (var i = 0; i < arr.length; i++) {
                var it = arr[i];
                if (!it || !it.item_id) continue;
                if (it.ground_drop_tick == null) it.ground_drop_tick = nowTick;
                var born = Math.max(0, Math.floor(Number(it.ground_drop_tick) || 0));
                if (nowTick - born >= ttl) {
                    removed += 1;
                    continue;
                }
                kept.push(it);
            }
            if (kept.length > 0) state.ground_items[key] = kept;
            else delete state.ground_items[key];
        }
        return removed;
    }

    /** 从地面移除并返回指定索引的物品 */
    function removeItemFromGround(mapId, x, y, index) {
        var key = getGroundItemKey(mapId, x, y);
        var arr = state.ground_items[key];
        if (!arr || index < 0 || index >= arr.length) return null;
        var item = arr.splice(index, 1)[0];
        if (arr.length === 0) delete state.ground_items[key];
        return item;
    }

    /**
     * 从容器取出物品并丢到指定格子地面（主动丢弃）
     * @returns {{ success: boolean, message?: string }}
     */
    function dropItemToGround(containerType, index, mapId, x, y) {
        var key = getGroundItemKey(mapId, x, y);
        if (!key) return { success: false, message: t('inv.drop.invalid_pos') };
        var taken = takeItemFromContainer(containerType, index);
        if (!taken.success || !taken.item) return { success: false, message: t('inv.drop.take_fail') };
        addItemToGround(mapId, x, y, taken.item);
        return { success: true };
    }

    /**
     * 从地面拾取指定索引的物品，尝试放入默认容器
     * @returns {{ success: boolean, placed?: boolean, message?: string }}
     */
    function pickUpFromGround(mapId, x, y, index) {
        var key = getGroundItemKey(mapId, x, y);
        var arr = state.ground_items[key];
        if (!arr || index < 0 || index >= arr.length) return { success: false, message: t('inv.pickup.no_item') };
        var item = removeItemFromGround(mapId, x, y, index);
        if (!item) return { success: false, message: t('inv.pickup.fail') };
        var placed = putItemIntoDefaultContainer(item);
        if (placed.placed) return { success: true, placed: true };
        addItemToGround(mapId, x, y, item);
        return { success: false, placed: false, message: t('inv.pickup.inventory_full') };
    }

    /**
     * 从地面直接穿上装备：若该槽位已有装备则先脱下，脱下装备优先进空物品栏，放不下则掉落在脚下
     * @param {string} mapId
     * @param {number} x
     * @param {number} y
     * @param {number} index - 地面物品列表中的索引
     * @returns {{ success: boolean, message?: string }}
     */
    function equipFromGround(mapId, x, y, index) {
        var key = getGroundItemKey(mapId, x, y);
        var arr = state.ground_items[key];
        if (!arr || index < 0 || index >= arr.length) return { success: false, message: t('inv.pickup.no_item') };
        var item = removeItemFromGround(mapId, x, y, index);
        if (!item || !item.item_id) {
            if (item) addItemToGround(mapId, x, y, item);
            return { success: false, message: t('inv.pickup.fail') };
        }
        var tpl = getItemTemplate(item.item_id);
        if (!tpl || !tpl.equip_slot) {
            addItemToGround(mapId, x, y, item);
            return { success: false, message: t('inv.pickup.not_equipment') };
        }
        var slotId = tpl.equip_slot;
        if (EQUIP_SLOT_IDS.indexOf(slotId) < 0) {
            addItemToGround(mapId, x, y, item);
            return { success: false, message: t('inv.equip.invalid_slot') };
        }
        var optGround = { mapId: mapId, x: x, y: y };
        var current = state.equipment[slotId];
        if (current) {
            var unequipped = unequip(slotId, optGround);
            if (unequipped) {
                var placed = putItemIntoDefaultContainer(unequipped);
                if (!placed.placed) addItemToGround(mapId, x, y, unequipped);
            }
        }
        var result = equip(slotId, item);
        if (!result.success) {
            addItemToGround(mapId, x, y, item);
            return result;
        }
        return { success: true };
    }

    /** 将容器内物品尝试移入背包，放不下的若提供 optGroundPos 则掉落到该格子 */
    function migrateContainerToBackpack(fromArr, optGroundPos) {
        if (!fromArr || !fromArr.length) return;
        var backpackSlots = getBackpackSlots();
        var toArr = state.inventory_backpack.slice();
        for (var i = 0; i < fromArr.length; i++) {
            var item = fromArr[i];
            if (!item) continue;
            var placed = false;
            for (var j = 0; j < backpackSlots; j++) {
                if (!toArr[j]) {
                    toArr[j] = copyItemInstance(item);
                    if (toArr[j].count > 1 && getPocketSlots() === 0 && getVestSlots() === 0) { }
                    else if (toArr[j].count > 1) toArr[j].count = 1;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                for (var k = 0; k < backpackSlots; k++) {
                    var ex = toArr[k];
                    if (ex && ex.item_id === item.item_id && !(ex.enchants && ex.enchants.length) && (ex.count || 1) < getMaxStack(item.item_id)) {
                        ex.count = (ex.count || 1) + (item.count || 1);
                        placed = true;
                        break;
                    }
                }
            }
            if (!placed && optGroundPos && optGroundPos.mapId != null && optGroundPos.x != null && optGroundPos.y != null) {
                addItemToGround(optGroundPos.mapId, optGroundPos.x, optGroundPos.y, item);
            }
        }
        state.inventory_backpack = toArr;
    }

    /** 死亡时：清空全部装备与四类物品栏、载具绑定（地面物品保留） */
    function clearAllOnDeath() {
        var slot;
        for (var i = 0; i < EQUIP_SLOT_IDS.length; i++) {
            slot = EQUIP_SLOT_IDS[i];
            state.equipment[slot] = null;
        }
        state.inventory_pocket = [];
        state.inventory_vest = [];
        state.inventory_backpack = [];
        state.inventory_vehicle = [];
        state.bound_vehicle_id = null;
    }

    /**
     * 新手默认穿戴（与 data/default_equipment.json 一致，不含帽子）。
     * initNewGame 始终以此为底，再被 default_equipment 配置覆盖，避免未 setConfig 或配置为空时不发装。
     */
    var BUILTIN_NEWGAME_EQUIPMENT = {
        head: 'eq_head_leather_helm',
        clothing: 'eq_clothing_combat_suit',
        vest: 'eq_vest_hoodie',
        shoe_left: 'eq_shoe_left_sport',
        shoe_right: 'eq_shoe_right_sport'
    };

    /**
     * 新手装备的内置模板。当 equipment.json 未加载（如 file://）时，getItemTemplate 仍能返回这些条目，避免显示「空」或裸 id。
     */
    var BUILTIN_EQUIPMENT_TEMPLATES = {
        eq_clothing_combat_suit: {
            id: 'eq_clothing_combat_suit',
            name_0: '灰布战斗服',
            name_1: '战斗服',
            name_2: '战斗服',
            desc_0: '一件耐穿的作战外套，能挂上不少东西。',
            desc_1: '模块化战斗服：可插入护片模块；需呼吸法激活以发挥防护。',
            desc_2: '模块化战斗服底材，提供六个板位模块槽；激活后防护生效。',
            display_skill_id: 'survival_language',
            info_module_set_id: 'module.equipment_armor',
            equip_slot: 'clothing',
            material: 'leather',
            base_shield: 24,
            module_slots: ['chest', 'abdomen', 'arm_l', 'arm_r', 'leg_l', 'leg_r'],
            pocket_slots: 3,
            enchant_slots: 0,
            weight_kg: 1.2
        },
        eq_head_leather_helm: {
            id: 'eq_head_leather_helm',
            name_0: '旧皮盔',
            name_1: '皮盔',
            name_2: '皮盔',
            desc_0: '鞣过的兽皮缝成的帽子，能护一点头。',
            desc_1: '模块化头盔底材：盔体/内衬/护面三个模块槽，常驻生效。',
            desc_2: '模块化头盔底材，三个模块槽（盔体/内衬/护面）；不接激活体系。',
            display_skill_id: 'survival_language',
            info_module_set_id: 'module.equipment_armor',
            equip_slot: 'head',
            material: 'leather',
            module_slots: ['shell', 'liner', 'face'],
            enchant_slots: 0,
            weight_kg: 0.4
        },
        eq_vest_hoodie: {
            id: 'eq_vest_hoodie',
            name_0: '带帽的厚衫',
            name_1: '连帽衫',
            name_2: '连帽衫',
            desc_0: '一件带帽子的厚衣服，里头能装点小东西。',
            desc_1: '连帽衫，胸前有两格收纳，当背心用。',
            desc_2: '连帽衫，提供两格背心栏位。',
            display_skill_id: 'survival_language',
            equip_slot: 'vest',
            enchant_slots: 6,
            weight_kg: 0.3,
            vest_slots: 2
        },
        eq_shoe_left_sport: {
            id: 'eq_shoe_left_sport',
            name_0: '左脚运动鞋',
            name_1: '运动鞋',
            name_2: '运动鞋',
            desc_0: '左脚穿的运动鞋，走路跑步都行。',
            desc_1: '左脚的运动鞋，脚上出招时系数 1.0。',
            desc_2: '左脚运动鞋，脚部战斗技能系数 1.0。',
            display_skill_id: 'survival_language',
            info_module_set_id: 'module.equipment_armor',
            equip_slot: 'shoe_left',
            enchant_slots: 6,
            weight_kg: 0.25,
            form_coefs: { '踹': 1.0, '扫': 1.2, '踏': 1.0 },
            move_cost_mod: -0.10,
            parry_coef: 0.95,
            speed_coef: 1.15
        },
        eq_shoe_right_sport: {
            id: 'eq_shoe_right_sport',
            name_0: '右脚运动鞋',
            name_1: '运动鞋',
            name_2: '运动鞋',
            desc_0: '右脚穿的运动鞋，走路跑步都行。',
            desc_1: '右脚的运动鞋，脚上出招时系数 1.0。',
            desc_2: '右脚运动鞋，脚部战斗技能系数 1.0。',
            display_skill_id: 'survival_language',
            info_module_set_id: 'module.equipment_armor',
            equip_slot: 'shoe_right',
            enchant_slots: 6,
            weight_kg: 0.25,
            form_coefs: { '踹': 1.0, '扫': 1.2, '踏': 1.0 },
            move_cost_mod: -0.10,
            parry_coef: 0.95,
            speed_coef: 1.15
        }
    };

    /**
     * 招式序列清洗（11-skills 设计变更）：每肢 = 1 主动技能 + 槽1（该肢可用招式）+ 槽2..N（变式槽）。
     * - 槽 0（下标 0）：必须为该主动技能在该肢上的合法可用招式；空/非法时回填第一个可用招式。
     * - 槽 1..N-1：只保留变式（'variant:' 条目），旧档/旧数据里混入的主动招式一律移除。
     */
    function sanitizeCombatMoveSequencesAgainstLimbTags() {
        var CS = typeof global !== 'undefined' && global.CombatSkills;
        if (!CS || typeof CS.getSkill !== 'function' || typeof CS.moveAllowedOnLimbByTagKeys !== 'function') return;
        ensureCombatState();
        var getTags = typeof global !== 'undefined' && typeof global.getLimbActionTags === 'function' ? global.getLimbActionTags : null;
        var li;
        for (li = 0; li < COMBAT_LIMB_IDS.length; li++) {
            var lid = COMBAT_LIMB_IDS[li];
            var limbRec = state.combat.limbs[lid];
            var skillId = limbRec && limbRec.active;
            if (!skillId) continue;
            var sk = CS.getSkill(skillId);
            if (!sk || !sk.moves || !sk.moves.length) continue;
            if (sk.category !== 'unarmed' && sk.category !== 'weapon') continue;
            var lv = getSkillLevel(skillId);
            var maxSlots = CS.getMaxSlotsForLevel ? CS.getMaxSlotsForLevel(skillId, lv) : 0;
            if (!maxSlots || maxSlots < 1) continue;
            var seq = state.combat.move_sequences[lid];
            if (!Array.isArray(seq)) seq = [];
            var limbKeys = (getTags ? getTags(lid) : null) || (typeof CS.getDefaultLimbTagKeysForLimbId === 'function' ? CS.getDefaultLimbTagKeysForLimbId(lid) : []);
            // 槽 1 招式（moves 顺序第一个该肢可用的）
            var firstMoveId = '';
            var unlocked = (typeof CS.getUnlockedMoves === 'function') ? CS.getUnlockedMoves(skillId, lv) : sk.moves;
            var ui2;
            for (ui2 = 0; ui2 < unlocked.length; ui2++) {
                if (CS.moveAllowedOnLimbByTagKeys(unlocked[ui2], limbKeys)) {
                    firstMoveId = unlocked[ui2].id;
                    break;
                }
            }
            var slot0 = (seq[0] && String(seq[0]).indexOf('variant:') !== 0) ? String(seq[0]) : '';
            if (slot0) {
                var valid0 = false;
                var vi;
                for (vi = 0; vi < unlocked.length; vi++) {
                    if (unlocked[vi].id === slot0 && CS.moveAllowedOnLimbByTagKeys(unlocked[vi], limbKeys)) { valid0 = true; break; }
                }
                if (!valid0) slot0 = '';
            }
            if (!slot0) slot0 = firstMoveId;
            // 槽 2..N-1：只留变式
            var kept = [slot0];
            var si;
            for (si = 1; si < seq.length && si < maxSlots; si++) {
                var item = seq[si];
                if (item && String(item).indexOf('variant:') === 0) {
                    kept.push(String(item));
                }
            }
            while (kept.length < maxSlots) kept.push('');
            state.combat.move_sequences[lid] = kept.slice(0, maxSlots);
        }
    }

    function getParryVariantMaxSlotsForSkillLevel(level) {
        var lv = Math.max(0, parseInt(level, 10) || 0);
        return Math.max(0, Math.min(5, Math.floor(lv / 200)));
    }

    function getVariantMeta(variantId) {
        if (!variantId || typeof global === 'undefined' || !global.CombatVariants || typeof global.CombatVariants.getVariant !== 'function') return null;
        return global.CombatVariants.getVariant(String(variantId));
    }

    function normalizeUniqueStringArray(arr) {
        var out = [];
        var seen = {};
        if (!Array.isArray(arr)) return out;
        for (var i = 0; i < arr.length; i++) {
            var v = arr[i];
            if (!v) continue;
            var k = String(v);
            if (seen[k]) continue;
            seen[k] = 1;
            out.push(k);
        }
        return out;
    }

    function variantScopeAllowsParry(meta) {
        var s = String((meta && meta.assist_scope) || 'active_moves');
        return s === 'parry' || s === 'both';
    }

    function getVariantUnlockDeps() {
        return {
            getSkillLevel: getSkillLevel,
            getMoveUsage: function (skillId) {
                var e = state.skills[skillId];
                return (e && e.move_usage && typeof e.move_usage === 'object') ? e.move_usage : {};
            },
            CombatSkills: typeof global !== 'undefined' ? global.CombatSkills : null
        };
    }

    function getVariantEffectParamOverride(vid) {
        ensureCombatState();
        if (!vid) return null;
        var o = state.combat.variant_effect_param_overrides;
        if (!o || !o[vid] || typeof o[vid] !== 'object') return null;
        var c = {};
        for (var k in o[vid]) {
            if (Object.prototype.hasOwnProperty.call(o[vid], k)) c[k] = o[vid][k];
        }
        return c;
    }

    function setVariantEffectParamOverride(vid, patch) {
        if (!vid || !patch || typeof patch !== 'object') return;
        ensureCombatState();
        if (!state.combat.variant_effect_param_overrides) state.combat.variant_effect_param_overrides = {};
        var s = String(vid);
        var cur = state.combat.variant_effect_param_overrides[s] || {};
        if (global.CombatVariants && typeof global.CombatVariants.mergeEffectParamsForVariant === 'function') {
            state.combat.variant_effect_param_overrides[s] = global.CombatVariants.mergeEffectParamsForVariant(cur, patch);
        } else {
            var next = Object.assign({}, cur, patch);
            state.combat.variant_effect_param_overrides[s] = next;
        }
    }

    function clearVariantEffectParamOverride(vid) {
        if (!vid) return;
        ensureCombatState();
        if (state.combat.variant_effect_param_overrides && state.combat.variant_effect_param_overrides[String(vid)] != null) {
            delete state.combat.variant_effect_param_overrides[String(vid)];
        }
    }

    function clearInvalidVariantSlotsBySourceLevel() {
        ensureCombatState();
        var CV = global.CombatVariants;
        var deps = getVariantUnlockDeps();
        for (var i = 0; i < COMBAT_LIMB_IDS.length; i++) {
            var lid = COMBAT_LIMB_IDS[i];
            var seq = Array.isArray(state.combat.move_sequences[lid]) ? state.combat.move_sequences[lid].slice() : [];
            var seenActive = {};
            for (var ai = 0; ai < seq.length; ai++) {
                var raw = seq[ai];
                if (!raw) continue;
                var rs = String(raw);
                if (rs.indexOf('variant:') !== 0) continue;
                var vid = rs.slice('variant:'.length);
                var m = getVariantMeta(vid);
                if (!m) { seq[ai] = ''; continue; }
                if (CV && typeof CV.isVariantUnlocked === 'function' && !CV.isVariantUnlocked(m, deps)) { seq[ai] = ''; continue; }
                if (seenActive[vid]) { seq[ai] = ''; continue; }
                var scope = String(m.assist_scope || 'active_moves');
                if (scope !== 'active_moves' && scope !== 'both') {
                    seq[ai] = '';
                    continue;
                }
                seenActive[vid] = 1;
            }
            state.combat.move_sequences[lid] = seq;

            var parrySeqRaw = Array.isArray(state.combat.parry_variant_sequences[lid]) ? state.combat.parry_variant_sequences[lid] : [];
            var cap = getParryVariantMaxSlotsForSkillLevel(getSkillLevel(state.combat.limbs[lid] && state.combat.limbs[lid].parry));
            var parrySeq = parrySeqRaw.slice(0, cap);
            while (parrySeq.length < cap) parrySeq.push(null);
            var seen = {};
            for (var pi = 0; pi < parrySeq.length; pi++) {
                var pvid = parrySeq[pi];
                if (!pvid) continue;
                var pm = getVariantMeta(pvid);
                if (!pm) { parrySeq[pi] = null; continue; }
                if (CV && typeof CV.isVariantUnlocked === 'function' && !CV.isVariantUnlocked(pm, deps)) { parrySeq[pi] = null; continue; }
                if (!variantScopeAllowsParry(pm) || seen[String(pvid)]) {
                    parrySeq[pi] = null;
                    continue;
                }
                seen[String(pvid)] = 1;
            }
            state.combat.parry_variant_sequences[lid] = parrySeq;
        }
    }

    /**
     * 主动技能肢体合法性校验（11-skills 设计变更后放宽）：
     * 每肢 = 1 主动技能 + N 变式槽，不再要求序列含主动招式（出招回退技能第一可用招式），
     * 因此这里只校验 active 技能 id 存在且非空；历史保留为 no-op 恒真，避免旧存档被拒。
     */
    function validateAtLeastOneMovePerActiveLimb() {
        ensureCombatState();
        var CS = typeof global !== 'undefined' && global.CombatSkills;
        for (var i = 0; i < COMBAT_LIMB_IDS.length; i++) {
            var lid = COMBAT_LIMB_IDS[i];
            var limbRec = state.combat.limbs[lid] || {};
            var activeSkillId = limbRec.active;
            if (!activeSkillId) continue;
            var sk = CS && typeof CS.getSkill === 'function' ? CS.getSkill(activeSkillId) : null;
            if (!sk) return false; // active 指向不存在的技能才视为非法
        }
        return true;
    }

    function getActiveVariantIdsForLimb(limbId) {
        ensureCombatState();
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0) return [];
        clearInvalidVariantSlotsBySourceLevel();
        var seq = state.combat.move_sequences[limbId] || [];
        var out = [];
        for (var i = 0; i < seq.length; i++) {
            var s = String(seq[i] || '');
            if (s.indexOf('variant:') === 0) out.push(s.slice('variant:'.length));
        }
        return normalizeUniqueStringArray(out);
    }

    function getParryVariantIdsForLimb(limbId) {
        ensureCombatState();
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0) return [];
        clearInvalidVariantSlotsBySourceLevel();
        var out = [];
        var arr = state.combat.parry_variant_sequences[limbId] || [];
        for (var i = 0; i < arr.length; i++) {
            if (arr[i]) out.push(String(arr[i]));
        }
        return normalizeUniqueStringArray(out);
    }

    function ensureSkillEntry(skillId, minLevel) {
        if (!skillId) return;
        minLevel = Math.max(1, parseInt(minLevel, 10) || 1);
        if (!state.skills[skillId] || typeof state.skills[skillId] !== 'object') {
            state.skills[skillId] = { level: minLevel, move_usage: {}, study_exp: 0 };
            return;
        }
        var lv = parseInt(state.skills[skillId].level, 10);
        if (!isFinite(lv) || lv < 1) state.skills[skillId].level = minLevel;
        if (!state.skills[skillId].move_usage || typeof state.skills[skillId].move_usage !== 'object') {
            state.skills[skillId].move_usage = {};
        }
        if (state.skills[skillId].study_exp == null) state.skills[skillId].study_exp = 0;
    }

    /** 存档/创建后规范化技能记录：level / move_usage / study_exp（自修进度，05 5.8） */
    function normalizeSkillsState() {
        if (!state.skills || typeof state.skills !== 'object') return;
        for (var sid in state.skills) {
            if (!Object.prototype.hasOwnProperty.call(state.skills, sid)) continue;
            var ent = state.skills[sid];
            if (!ent || typeof ent !== 'object') continue;
            if (ent.level == null) ent.level = 0;
            ent.level = Math.max(0, parseInt(ent.level, 10) || 0);
            if (!ent.move_usage || typeof ent.move_usage !== 'object') ent.move_usage = {};
            if (ent.study_exp == null) ent.study_exp = 0;
            ent.study_exp = Math.max(0, Math.floor(Number(ent.study_exp) || 0));
        }
    }

    /** 自修进度（study_exp）：该技能已转化但未用于升级的潜能经验 */
    function getStudyExp(skillId) {
        var ent = state.skills && state.skills[skillId];
        if (!ent) return 0;
        var v = parseInt(ent.study_exp, 10);
        return isFinite(v) && v > 0 ? v : 0;
    }

    function addStudyExp(skillId, amount) {
        if (!skillId) return 0;
        if (!state.skills[skillId] || typeof state.skills[skillId] !== 'object') {
            state.skills[skillId] = { level: 0, move_usage: {}, study_exp: 0 };
        }
        var ent = state.skills[skillId];
        if (!ent.move_usage || typeof ent.move_usage !== 'object') ent.move_usage = {};
        var cur = parseInt(ent.study_exp, 10);
        if (!isFinite(cur) || cur < 0) cur = 0;
        var d = Math.floor(Number(amount) || 0);
        ent.study_exp = d > 0 ? cur + d : cur;
        return ent.study_exp;
    }

    /**
     * 用该技能 study_exp 按潜能成本曲线推进等级（11 §8.3.1：getPotentialCostForLevel × 难度系数）。
     * 返回 { leveled, level, study_exp_remaining }；不直接消耗全局潜能（转化时已扣）。
     */
    function tryAdvanceSkillLevel(skillId) {
        var ent = state.skills && state.skills[skillId];
        if (!ent) return { leveled: 0, level: 0, study_exp_remaining: 0 };
        var cap = getProgressionSkillCap(skillId);
        var CS = global.CombatSkills;
        var getCost = (CS && typeof CS.getPotentialCostForLevel === 'function') ? CS.getPotentialCostForLevel : null;
        var characterLike = { skills: state.skills || {}, skill_max_level_bonus: state.skill_max_level_bonus || {} };
        var leveled = 0;
        var guard = 0;
        while (guard < 100000) {
            var lv = parseInt(ent.level, 10) || 0;
            if (lv >= cap) break;
            var cost = getCost ? parseInt(getCost(skillId, lv, characterLike), 10) : 0;
            if (!(cost > 0) || (ent.study_exp || 0) < cost) break;
            ent.study_exp = Math.max(0, (ent.study_exp || 0) - cost);
            ent.level = lv + 1;
            leveled++;
            guard++;
        }
        return {
            leveled: leveled,
            level: parseInt(ent.level, 10) || 0,
            study_exp_remaining: Math.floor(ent.study_exp || 0)
        };
    }

    /**
     * 发放徒手/呼吸/步法并写默认枢纽与四肢进攻槽（不含兵器、不含基本招架——招架初始未习得见 11-skills 8.3.5）。
     */
    function applyDefaultStarterCombatLayout() {
        ensureCombatState();
        ensureSkillEntry('combat_basic_unarmed', 1);
        ensureSkillEntry('combat_basic_breath', 1);
        ensureSkillEntry('combat_basic_footwork', 1);
        state.combat.hubs.breath = 'combat_basic_breath';
        state.combat.hubs.footwork = 'combat_basic_footwork';
        var CS = typeof global !== 'undefined' && global.CombatSkills;
        var lv = getSkillLevel('combat_basic_unarmed');
        for (var i = 0; i < COMBAT_LIMB_IDS.length; i++) {
            var lid = COMBAT_LIMB_IDS[i];
            state.combat.limbs[lid].active = 'combat_basic_unarmed';
            if (CS && typeof CS.buildDefaultMoveSequenceForLimb === 'function') {
                state.combat.move_sequences[lid] = CS.buildDefaultMoveSequenceForLimb('combat_basic_unarmed', lid, lv);
            } else {
                state.combat.move_sequences[lid] = (lid === 'lfoot' || lid === 'rfoot') ? ['front_kick', ''] : ['jab', ''];
            }
        }
        state.combat.move_sequence_cursors = { lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 };
    }

    /** 旧档或无战斗技能条目时补足（不覆盖已有装配） */
    function ensureCombatBasicsMigrated() {
        ensureAnatomyStudiesSkillPresent();
        if (getSkillLevel('combat_basic_unarmed') >= 1) return;
        applyDefaultStarterCombatLayout();
        if (typeof global !== 'undefined' && global.CharacterAttributes && typeof global.CharacterAttributes.recalcCharacterStats === 'function') {
            global.CharacterAttributes.recalcCharacterStats({
                getEquipmentState: function () { return state.equipment; },
                getSkillsState: function () { return state.skills; },
                getItemTemplate: getItemTemplate,
                getEnchantEntry: getEnchantEntry,
                getStrengthLevel: function () { return getSkillLevel('survival_strength'); }
            });
        }
    }

    /** 新游戏初始化：四类物品栏为空，仅根据 default_equipment 穿戴；地面物品清空 */
    function initNewGame() {
        state.skills = {};
        state.skill_max_level_bonus = {};
        state.inventory_pocket = [];
        state.inventory_vest = [];
        state.inventory_backpack = [];
        state.inventory_vehicle = [];
        state.bound_vehicle_id = null;
        state.ground_items = {};
        initEquipmentSlots();
        var slot;
        for (var i = 0; i < EQUIP_SLOT_IDS.length; i++) {
            slot = EQUIP_SLOT_IDS[i];
            state.equipment[slot] = null;
        }
        var merged = {};
        var k;
        for (k in BUILTIN_NEWGAME_EQUIPMENT) {
            if (BUILTIN_NEWGAME_EQUIPMENT.hasOwnProperty(k)) merged[k] = BUILTIN_NEWGAME_EQUIPMENT[k];
        }
        var def = defaultEquipmentConfig || {};
        for (k in def) {
            if (!def.hasOwnProperty(k) || k === '_comment' || !def[k]) continue;
            if (EQUIP_SLOT_IDS.indexOf(k) >= 0) merged[k] = def[k];
        }
        for (var key in merged) {
            if (!merged.hasOwnProperty(key) || EQUIP_SLOT_IDS.indexOf(key) < 0) continue;
            var itemId = merged[key];
            if (!itemId) continue;
            var inst = { item_id: String(itemId), enchants: [] };
            // 模块化底材：与 equip() 同构——实例化槽点结构（modules 对象），词条随模块走（37 §4 / 契约 38 §4）
            var tplS = getItemTemplate(String(itemId));
            if (tplS && Array.isArray(tplS.module_slots) && tplS.module_slots.length > 0) {
                var modsS = {};
                for (var msi2 = 0; msi2 < tplS.module_slots.length; msi2++) modsS[tplS.module_slots[msi2]] = null;
                inst.modules = modsS;
                delete inst.enchants;
            }
            state.equipment[key] = inst;
        }
        state.combat = getDefaultCombatState();
        state.hub_action_cooldowns = {};
        state.potential = 0;
        state.combat_experience = 0;
        applyDefaultStarterCombatLayout();
        ensureAnatomyStudiesSkillPresent();
    }

    function hubCooldownKey(skillId, actionId) {
        return String(skillId || '') + ':' + String(actionId || '');
    }

    function getHubActionCooldownRemaining(skillId, actionId) {
        var k = hubCooldownKey(skillId, actionId);
        var n = state.hub_action_cooldowns[k];
        return Math.max(0, parseInt(n, 10) || 0);
    }

    function setHubActionCooldownRemaining(skillId, actionId, ticks) {
        var t = Math.max(0, parseInt(ticks, 10) || 0);
        var k = hubCooldownKey(skillId, actionId);
        if (t <= 0) {
            delete state.hub_action_cooldowns[k];
            return;
        }
        state.hub_action_cooldowns[k] = t;
    }

    function tickHubActionCooldowns(delta) {
        var d = Math.max(0, parseInt(delta, 10) || 0);
        if (d <= 0) return;
        for (var k in state.hub_action_cooldowns) {
            if (!state.hub_action_cooldowns.hasOwnProperty(k)) continue;
            var v = Math.max(0, (parseInt(state.hub_action_cooldowns[k], 10) || 0) - d);
            if (v <= 0) delete state.hub_action_cooldowns[k];
            else state.hub_action_cooldowns[k] = v;
        }
    }

    /** 创建角色完成或需补发新手装时调用：等价于再执行一轮 initNewGame（仍清空口袋等，仅适合新档/创角） */
    function applyNewGameEquipment() {
        initNewGame();
    }

    function setConfig(cfg) {
        equipmentTable = (cfg.equipment && typeof cfg.equipment === 'object')
            ? Object.assign({}, cfg.equipment, BUILTIN_EQUIPMENT_TEMPLATES)
            : Object.assign({}, BUILTIN_EQUIPMENT_TEMPLATES);
        if (cfg.items) itemsTable = cfg.items;
        if (cfg.enchant) enchantTable = cfg.enchant;
        if (cfg.modules && typeof cfg.modules === 'object') moduleTable = cfg.modules;
        if (cfg.default_equipment && typeof cfg.default_equipment === 'object') {
            defaultEquipmentConfig = cfg.default_equipment;
        }
        if (cfg.item_display_tier_threshold_1 !== undefined) displayTierThreshold1 = cfg.item_display_tier_threshold_1;
        if (cfg.item_display_tier_threshold_2 !== undefined) displayTierThreshold2 = cfg.item_display_tier_threshold_2;
    }

    function setState(s) {
        if (!s) return;
        if (s.equipment) {
            state.equipment = {};
            initEquipmentSlots();
            for (var k in s.equipment) {
                if (EQUIP_SLOT_IDS.indexOf(k) >= 0) state.equipment[k] = s.equipment[k];
            }
        }
        if (s.inventory_pocket) state.inventory_pocket = s.inventory_pocket.slice();
        if (s.inventory_vest) state.inventory_vest = s.inventory_vest.slice();
        if (s.inventory_backpack) state.inventory_backpack = s.inventory_backpack.slice();
        if (s.inventory_vehicle) state.inventory_vehicle = s.inventory_vehicle.slice();
        if (s.bound_vehicle_id !== undefined) state.bound_vehicle_id = s.bound_vehicle_id;
        if (s.skills) state.skills = s.skills;
        normalizeSkillsState();
        if (s.skill_max_level_bonus && typeof s.skill_max_level_bonus === 'object') {
            state.skill_max_level_bonus = {};
            for (var bk in s.skill_max_level_bonus) {
                if (s.skill_max_level_bonus.hasOwnProperty(bk)) state.skill_max_level_bonus[bk] = s.skill_max_level_bonus[bk];
            }
        }
        clampSkillLevelsToProgressionCaps();
        ensureAnatomyStudiesSkillPresent();
        if (s.ground_items && typeof s.ground_items === 'object') {
            for (var gk in s.ground_items) {
                if (s.ground_items.hasOwnProperty(gk) && Array.isArray(s.ground_items[gk]))
                    state.ground_items[gk] = s.ground_items[gk].slice();
            }
        }
        if (s.combat && typeof s.combat === 'object') {
            var loadHubs = s.combat.hubs && typeof s.combat.hubs === 'object' ? s.combat.hubs : {};
            var footworkId = loadHubs.footwork != null ? loadHubs.footwork : loadHubs.light;
            state.combat = {
                limbs: {},
                hubs: { breath: loadHubs.breath != null ? loadHubs.breath : null, footwork: footworkId != null ? footworkId : null },
                move_sequences: {},
                skill_move_sequences: (function () {
                    var src = s.combat.skill_move_sequences;
                    if (!src || typeof src !== 'object') return {};
                    var out = {};
                    for (var sk in src) { if (src.hasOwnProperty(sk) && Array.isArray(src[sk])) out[sk] = src[sk].slice(); }
                    return out;
                })(),
                post_effect_sequences: (function () {
                    var src = s.combat.post_effect_sequences;
                    if (!src || typeof src !== 'object') return {};
                    var out = {};
                    for (var lid in src) {
                        if (!Object.prototype.hasOwnProperty.call(src, lid) || COMBAT_LIMB_IDS.indexOf(lid) < 0) continue;
                        out[lid] = normalizePostEffectForLimbValue(src[lid]);
                    }
                    return out;
                })(),
                variant_sequences: (function () {
                    var src = s.combat.variant_sequences;
                    var out = {};
                    for (var i = 0; i < COMBAT_LIMB_IDS.length; i++) {
                        var lid = COMBAT_LIMB_IDS[i];
                        out[lid] = (src && Array.isArray(src[lid])) ? src[lid].slice() : [];
                    }
                    return out;
                })(),
                parry_variant_sequences: (function () {
                    var src = s.combat.parry_variant_sequences;
                    var out = {};
                    for (var i = 0; i < COMBAT_LIMB_IDS.length; i++) {
                        var lid = COMBAT_LIMB_IDS[i];
                        out[lid] = (src && Array.isArray(src[lid])) ? src[lid].slice() : [];
                    }
                    return out;
                })(),
                variant_effect_param_overrides: (function () {
                    var src = s.combat.variant_effect_param_overrides;
                    if (!src || typeof src !== 'object') return {};
                    var o = {};
                    for (var vk in src) {
                        if (!Object.prototype.hasOwnProperty.call(src, vk) || !src[vk] || typeof src[vk] !== 'object') continue;
                        var inner = {};
                        for (var ik in src[vk]) { if (src[vk].hasOwnProperty(ik)) inner[ik] = src[vk][ik]; }
                        o[vk] = inner;
                    }
                    return o;
                })()
            };
            var limbIds = COMBAT_LIMB_IDS;
            for (var li = 0; li < limbIds.length; li++) {
                var lid = limbIds[li];
                state.combat.limbs[lid] = s.combat.limbs && s.combat.limbs[lid]
                    ? { active: s.combat.limbs[lid].active, parry: s.combat.limbs[lid].parry }
                    : { active: null, parry: null };
                state.combat.move_sequences[lid] = (s.combat.move_sequences && Array.isArray(s.combat.move_sequences[lid])) ? s.combat.move_sequences[lid].slice() : [];
            }
            state.combat.move_sequence_cursors = { lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 };
            var cursSrc = s.combat.move_sequence_cursors;
            if (cursSrc && typeof cursSrc === 'object') {
                for (var ci = 0; ci < limbIds.length; ci++) {
                    var clid = limbIds[ci];
                    if (cursSrc[clid] != null) {
                        state.combat.move_sequence_cursors[clid] = Math.max(0, Math.floor(Number(cursSrc[clid]) || 0));
                    }
                }
            }
            state.combat.move_slot_power_levels = {};
            var mslSrc = s.combat.move_slot_power_levels;
            for (var mli = 0; mli < limbIds.length; mli++) {
                var mliid = limbIds[mli];
                state.combat.move_slot_power_levels[mliid] = (mslSrc && Array.isArray(mslSrc[mliid])) ? mslSrc[mliid].slice() : [];
            }
            state.combat.limb_strike_order = (s.combat.limb_strike_order && isValidLimbStrikeOrderArray(s.combat.limb_strike_order))
                ? s.combat.limb_strike_order.slice()
                : COMBAT_LIMB_IDS.slice();
            if (s.combat.limb_strike_order_cursor != null && isFinite(Number(s.combat.limb_strike_order_cursor))) {
                state.combat.limb_strike_order_cursor = Math.floor(Number(s.combat.limb_strike_order_cursor)) || 0;
            } else {
                state.combat.limb_strike_order_cursor = 0;
            }
            migrateLegacySkillMoveSequencesIntoLimbs();
        }
        if (s.hub_action_cooldowns && typeof s.hub_action_cooldowns === 'object') {
            state.hub_action_cooldowns = {};
            for (var hk in s.hub_action_cooldowns) {
                if (!s.hub_action_cooldowns.hasOwnProperty(hk)) continue;
                var hv = parseInt(s.hub_action_cooldowns[hk], 10) || 0;
                if (hv > 0) state.hub_action_cooldowns[hk] = hv;
            }
        }
        if (s.potential !== undefined && s.potential !== null) {
            state.potential = clampPotentialStored(s.potential);
        }
        if (s.combat_experience !== undefined && s.combat_experience !== null) {
            state.combat_experience = clampCombatExperienceStored(s.combat_experience);
        }
        normalizePotentialState();
        normalizeCombatExperienceState();
        ensureCombatState();
        sanitizeCombatMoveSequencesAgainstLimbTags();
        clearInvalidVariantSlotsBySourceLevel();
        if (!validateAtLeastOneMovePerActiveLimb()) {
            throw new Error('[InventoryEquipment] Invalid save data: each active limb must keep at least one move slot.');
        }
    }

    function getState() {
        var eq = {};
        for (var i = 0; i < EQUIP_SLOT_IDS.length; i++) {
            var id = EQUIP_SLOT_IDS[i];
            eq[id] = state.equipment[id];
        }
        var groundCopy = {};
        for (var gk in state.ground_items) {
            if (state.ground_items.hasOwnProperty(gk))
                groundCopy[gk] = state.ground_items[gk].slice();
        }
        ensureCombatState();
        var combatCopy = {
            limbs: {},
            hubs: { breath: state.combat.hubs.breath, footwork: state.combat.hubs.footwork },
            move_sequences: {},
            skill_move_sequences: {},
            move_sequence_cursors: {},
            post_effect_sequences: {},
            variant_sequences: {},
            parry_variant_sequences: {},
            move_slot_power_levels: {}
        };
        ensureMoveSequenceCursors();
        for (var li = 0; li < COMBAT_LIMB_IDS.length; li++) {
            var lid = COMBAT_LIMB_IDS[li];
            combatCopy.limbs[lid] = { active: state.combat.limbs[lid].active, parry: state.combat.limbs[lid].parry };
            combatCopy.move_sequences[lid] = (state.combat.move_sequences[lid] || []).slice();
            combatCopy.move_sequence_cursors[lid] = Math.floor(Number(state.combat.move_sequence_cursors[lid]) || 0);
            combatCopy.move_slot_power_levels[lid] = (state.combat.move_slot_power_levels && Array.isArray(state.combat.move_slot_power_levels[lid])) ? state.combat.move_slot_power_levels[lid].slice() : [];
        }
        for (var sk in state.combat.skill_move_sequences) {
            if (state.combat.skill_move_sequences.hasOwnProperty(sk) && Array.isArray(state.combat.skill_move_sequences[sk]))
                combatCopy.skill_move_sequences[sk] = state.combat.skill_move_sequences[sk].slice();
        }
        for (var lidP in state.combat.post_effect_sequences) {
            if (!Object.prototype.hasOwnProperty.call(state.combat.post_effect_sequences, lidP) || COMBAT_LIMB_IDS.indexOf(lidP) < 0) continue;
            combatCopy.post_effect_sequences[lidP] = normalizePostEffectForLimbValue(state.combat.post_effect_sequences[lidP]);
        }
        for (var lidV in state.combat.variant_sequences) {
            if (Object.prototype.hasOwnProperty.call(state.combat.variant_sequences, lidV)) {
                combatCopy.variant_sequences[lidV] = (state.combat.variant_sequences[lidV] || []).slice();
            }
        }
        for (var lidPV in state.combat.parry_variant_sequences) {
            if (Object.prototype.hasOwnProperty.call(state.combat.parry_variant_sequences, lidPV)) {
                combatCopy.parry_variant_sequences[lidPV] = (state.combat.parry_variant_sequences[lidPV] || []).slice();
            }
        }
        ensureLimbStrikeOrder();
        combatCopy.limb_strike_order = state.combat.limb_strike_order.slice();
        combatCopy.limb_strike_order_cursor = state.combat.limb_strike_order_cursor;
        combatCopy.variant_effect_param_overrides = {};
        if (state.combat.variant_effect_param_overrides && typeof state.combat.variant_effect_param_overrides === 'object') {
            for (var vpo in state.combat.variant_effect_param_overrides) {
                if (!state.combat.variant_effect_param_overrides.hasOwnProperty(vpo)) continue;
                if (state.combat.variant_effect_param_overrides[vpo] && typeof state.combat.variant_effect_param_overrides[vpo] === 'object') {
                    var vo = state.combat.variant_effect_param_overrides[vpo];
                    var vcopy = {};
                    for (var vk in vo) { if (vo.hasOwnProperty(vk)) vcopy[vk] = vo[vk]; }
                    combatCopy.variant_effect_param_overrides[vpo] = vcopy;
                }
            }
        }
        var bonusCopy = {};
        for (var bj in state.skill_max_level_bonus) {
            if (state.skill_max_level_bonus.hasOwnProperty(bj)) bonusCopy[bj] = state.skill_max_level_bonus[bj];
        }
        var hubCd = {};
        for (var ck in state.hub_action_cooldowns) {
            if (state.hub_action_cooldowns.hasOwnProperty(ck)) hubCd[ck] = state.hub_action_cooldowns[ck];
        }
        normalizePotentialState();
        normalizeCombatExperienceState();
        return {
            equipment: eq,
            inventory_pocket: state.inventory_pocket.slice(),
            inventory_vest: state.inventory_vest.slice(),
            inventory_backpack: state.inventory_backpack.slice(),
            inventory_vehicle: state.inventory_vehicle.slice(),
            bound_vehicle_id: state.bound_vehicle_id,
            skills: state.skills,
            skill_max_level_bonus: bonusCopy,
            ground_items: groundCopy,
            combat: combatCopy,
            hub_action_cooldowns: hubCd,
            potential: state.potential,
            combat_experience: state.combat_experience
        };
    }

    function getCharacterForDisplay() {
        return { skills: state.skills, skill_max_level_bonus: state.skill_max_level_bonus };
    }

    function getCombatState() {
        ensureCombatState();
        clearInvalidVariantSlotsBySourceLevel();
        var c = state.combat;
        var out = { limbs: {}, hubs: { breath: c.hubs.breath, footwork: c.hubs.footwork }, move_sequences: {}, skill_move_sequences: {}, move_sequence_cursors: {}, post_effect_sequences: {}, variant_sequences: {}, parry_variant_sequences: {}, move_slot_power_levels: {} };
        ensureMoveSequenceCursors();
        for (var i = 0; i < COMBAT_LIMB_IDS.length; i++) {
            var lid = COMBAT_LIMB_IDS[i];
            out.limbs[lid] = { active: c.limbs[lid].active, parry: c.limbs[lid].parry };
            out.move_sequences[lid] = (c.move_sequences[lid] || []).slice();
            out.move_sequence_cursors[lid] = Math.floor(Number(c.move_sequence_cursors[lid]) || 0);
            out.move_slot_power_levels[lid] = (c.move_slot_power_levels && Array.isArray(c.move_slot_power_levels[lid])) ? c.move_slot_power_levels[lid].slice() : [];
        }
        for (var sk in c.skill_move_sequences) {
            if (c.skill_move_sequences.hasOwnProperty(sk) && Array.isArray(c.skill_move_sequences[sk]))
                out.skill_move_sequences[sk] = c.skill_move_sequences[sk].slice();
        }
        for (var lidP in c.post_effect_sequences) {
            if (!Object.prototype.hasOwnProperty.call(c.post_effect_sequences, lidP) || COMBAT_LIMB_IDS.indexOf(lidP) < 0) continue;
            out.post_effect_sequences[lidP] = normalizePostEffectForLimbValue(c.post_effect_sequences[lidP]);
        }
        for (var lidV in c.variant_sequences) {
            if (Object.prototype.hasOwnProperty.call(c.variant_sequences, lidV)) {
                out.variant_sequences[lidV] = (c.variant_sequences[lidV] || []).slice();
            }
        }
        for (var lidPV in c.parry_variant_sequences) {
            if (Object.prototype.hasOwnProperty.call(c.parry_variant_sequences, lidPV)) {
                out.parry_variant_sequences[lidPV] = (c.parry_variant_sequences[lidPV] || []).slice();
            }
        }
        ensureLimbStrikeOrder();
        out.limb_strike_order = state.combat.limb_strike_order.slice();
        out.limb_strike_order_cursor = state.combat.limb_strike_order_cursor;
        out.variant_effect_param_overrides = {};
        if (c.variant_effect_param_overrides && typeof c.variant_effect_param_overrides === 'object') {
            for (var vpi in c.variant_effect_param_overrides) {
                if (!c.variant_effect_param_overrides.hasOwnProperty(vpi)) continue;
                if (c.variant_effect_param_overrides[vpi] && typeof c.variant_effect_param_overrides[vpi] === 'object') {
                    var via = c.variant_effect_param_overrides[vpi];
                    var vic = {};
                    for (var vib in via) { if (via.hasOwnProperty(vib)) vic[vib] = via[vib]; }
                    out.variant_effect_param_overrides[vpi] = vic;
                }
            }
        }
        return out;
    }

    function setCombatState(partial) {
        ensureCombatState();
        if (!partial || typeof partial !== 'object') return;
        if (partial.limbs) {
            for (var lid in partial.limbs) {
                if (COMBAT_LIMB_IDS.indexOf(lid) >= 0 && partial.limbs[lid]) {
                    if (partial.limbs[lid].active !== undefined) state.combat.limbs[lid].active = partial.limbs[lid].active;
                    if (partial.limbs[lid].parry !== undefined) state.combat.limbs[lid].parry = partial.limbs[lid].parry;
                }
            }
        }
        if (partial.hubs) {
            if (partial.hubs.breath !== undefined) state.combat.hubs.breath = partial.hubs.breath;
            if (partial.hubs.footwork !== undefined) state.combat.hubs.footwork = partial.hubs.footwork;
            if (partial.hubs.light !== undefined && partial.hubs.footwork === undefined) state.combat.hubs.footwork = partial.hubs.light;
        }
        if (partial.hubs && typeof global !== 'undefined' && global.CharacterAttributes && typeof global.CharacterAttributes.recalcCharacterStats === 'function') {
            global.CharacterAttributes.recalcCharacterStats({
                getEquipmentState: function () { return state.equipment; },
                getSkillsState: function () { return state.skills; },
                getItemTemplate: getItemTemplate,
                getEnchantEntry: getEnchantEntry,
                getStrengthLevel: function () { return getSkillLevel('survival_strength'); }
            });
        }
        if (partial.move_sequences) {
            for (var lid in partial.move_sequences) {
                if (COMBAT_LIMB_IDS.indexOf(lid) >= 0 && Array.isArray(partial.move_sequences[lid]))
                    state.combat.move_sequences[lid] = partial.move_sequences[lid].slice();
            }
        }
        if (partial.skill_move_sequences && typeof partial.skill_move_sequences === 'object') {
            for (var sk in partial.skill_move_sequences) {
                if (partial.skill_move_sequences.hasOwnProperty(sk) && Array.isArray(partial.skill_move_sequences[sk]))
                    state.combat.skill_move_sequences[sk] = partial.skill_move_sequences[sk].slice();
            }
        }
        if (partial.move_sequence_cursors && typeof partial.move_sequence_cursors === 'object') {
            ensureMoveSequenceCursors();
            for (var cl in partial.move_sequence_cursors) {
                if (!Object.prototype.hasOwnProperty.call(partial.move_sequence_cursors, cl)) continue;
                if (COMBAT_LIMB_IDS.indexOf(cl) < 0) continue;
                var vx = Math.floor(Number(partial.move_sequence_cursors[cl]) || 0);
                state.combat.move_sequence_cursors[cl] = Math.max(0, vx);
            }
        }
        if (partial.post_effect_sequences && typeof partial.post_effect_sequences === 'object') {
            for (var lidP in partial.post_effect_sequences) {
                if (COMBAT_LIMB_IDS.indexOf(lidP) < 0) continue;
                state.combat.post_effect_sequences[lidP] = normalizePostEffectForLimbValue(partial.post_effect_sequences[lidP]);
            }
        }
        if (partial.variant_sequences && typeof partial.variant_sequences === 'object') {
            for (var lidV in partial.variant_sequences) {
                if (COMBAT_LIMB_IDS.indexOf(lidV) < 0 || !Array.isArray(partial.variant_sequences[lidV])) continue;
                state.combat.variant_sequences[lidV] = partial.variant_sequences[lidV].slice();
            }
        }
        if (partial.parry_variant_sequences && typeof partial.parry_variant_sequences === 'object') {
            for (var lidPV in partial.parry_variant_sequences) {
                if (COMBAT_LIMB_IDS.indexOf(lidPV) < 0 || !Array.isArray(partial.parry_variant_sequences[lidPV])) continue;
                state.combat.parry_variant_sequences[lidPV] = partial.parry_variant_sequences[lidPV].slice();
            }
        }
        if (partial.move_slot_power_levels && typeof partial.move_slot_power_levels === 'object') {
            if (!state.combat.move_slot_power_levels || typeof state.combat.move_slot_power_levels !== 'object') state.combat.move_slot_power_levels = {};
            for (var lidMPL in partial.move_slot_power_levels) {
                if (COMBAT_LIMB_IDS.indexOf(lidMPL) >= 0 && Array.isArray(partial.move_slot_power_levels[lidMPL])) {
                    state.combat.move_slot_power_levels[lidMPL] = partial.move_slot_power_levels[lidMPL].slice();
                }
            }
        }
        if (partial.limb_strike_order && isValidLimbStrikeOrderArray(partial.limb_strike_order)) {
            state.combat.limb_strike_order = partial.limb_strike_order.slice();
        }
        if (partial.limb_strike_order_cursor != null && isFinite(Number(partial.limb_strike_order_cursor))) {
            state.combat.limb_strike_order_cursor = Math.floor(Number(partial.limb_strike_order_cursor)) || 0;
        }
        if (partial.limb_strike_order || partial.limb_strike_order_cursor != null) {
            ensureLimbStrikeOrder();
        }
        if (partial.variant_effect_param_overrides && typeof partial.variant_effect_param_overrides === 'object') {
            if (!state.combat.variant_effect_param_overrides) state.combat.variant_effect_param_overrides = {};
            for (var vps in partial.variant_effect_param_overrides) {
                if (!Object.prototype.hasOwnProperty.call(partial.variant_effect_param_overrides, vps)) continue;
                if (partial.variant_effect_param_overrides[vps] == null) {
                    delete state.combat.variant_effect_param_overrides[vps];
                } else if (typeof partial.variant_effect_param_overrides[vps] === 'object') {
                    state.combat.variant_effect_param_overrides[vps] = partial.variant_effect_param_overrides[vps];
                }
            }
        }
        sanitizeCombatMoveSequencesAgainstLimbTags();
        clearInvalidVariantSlotsBySourceLevel();
        if (!validateAtLeastOneMovePerActiveLimb()) {
            throw new Error('[InventoryEquipment] Invalid combat layout: each active limb must keep at least one move slot.');
        }
    }

    global.InventoryEquipment = {
        SPECIAL_ANATOMY_STUDIES_SKILL_ID: SPECIAL_ANATOMY_STUDIES_SKILL_ID,
        EQUIP_SLOT_IDS: EQUIP_SLOT_IDS,
        getModuleTemplate: getModuleTemplate,
        installModule: installModule,
        uninstallModule: uninstallModule,
        hasCrossSlotOccupancy: hasCrossSlotOccupancy,
        getInstalledModuleAt: getInstalledModuleAt,
        getArmorShieldInfo: getArmorShieldInfo,
        getPlateDamageReduce: getPlateDamageReduce,
        getPlayerStunValue: getPlayerStunValue,
        setPlayerStunValue: setPlayerStunValue,
        isPlayerStunned: isPlayerStunned,
        addPlayerStun: addPlayerStun,
        consumePlayerStunRoundIfBlocking: consumePlayerStunRoundIfBlocking,
        getHeadAntiStunPct: getHeadAntiStunPct,
        getShoeSharedMods: getShoeSharedMods,
        getFootworkParryBonus: getFootworkParryBonus,
        getShoeSpeedCoef: getShoeSpeedCoef,
        COMBAT_LIMB_IDS: COMBAT_LIMB_IDS,
        setConfig: setConfig,
        setState: setState,
        getState: getState,
        getItemTemplate: getItemTemplate,
        getEffectiveBaseValue: getEffectiveBaseValue,
        getAllItemIds: getAllItemIds,
        getItemDisplayTier: getItemDisplayTier,
        getDisplayName: getDisplayName,
        getDisplayDesc: getDisplayDesc,
        getPocketSlots: getPocketSlots,
        getVestSlots: getVestSlots,
        getBackpackSlots: getBackpackSlots,
        getQuickBeltSlots: getQuickBeltSlots,
        getQuickBeltSlotSource: getQuickBeltSlotSource,
        getPocketArray: getPocketArray,
        getVestArray: getVestArray,
        getBackpackArray: getBackpackArray,
        getVehicleArray: getVehicleArray,
        countCarriedItemsByTemplateId: countCarriedItemsByTemplateId,
        removeCarriedItemsByTemplateId: removeCarriedItemsByTemplateId,
        giveCarriedItemsByTemplateId: giveCarriedItemsByTemplateId,
        getCurrentCarryWeight: getCurrentCarryWeight,
        putItemIntoDefaultContainer: putItemIntoDefaultContainer,
        canAcceptItem: canAcceptItem,
        equip: equip,
        unequip: unequip,
        takeItemFromContainer: takeItemFromContainer,
        getGroundItemKey: getGroundItemKey,
        getGroundItemsAt: getGroundItemsAt,
        addItemToGround: addItemToGround,
        removeItemFromGround: removeItemFromGround,
        dropItemToGround: dropItemToGround,
        pickUpFromGround: pickUpFromGround,
        equipFromGround: equipFromGround,
        pruneExpiredGroundItems: pruneExpiredGroundItems,
        clearAllOnDeath: clearAllOnDeath,
        initNewGame: initNewGame,
        applyNewGameEquipment: applyNewGameEquipment,
        applyDefaultStarterCombatLayout: applyDefaultStarterCombatLayout,
        ensureCombatBasicsMigrated: ensureCombatBasicsMigrated,
        getSkillLevel: getSkillLevel,
        getSkillsState: getSkillsState,
        incrementSkillMoveUsage: incrementSkillMoveUsage,
        adjustSkillMoveUsage: adjustSkillMoveUsage,
        getCharacterForDisplay: getCharacterForDisplay,
        getEnchantEntry: getEnchantEntry,
        getCombatState: getCombatState,
        setCombatState: setCombatState,
        getActiveVariantIdsForLimb: getActiveVariantIdsForLimb,
        getParryVariantIdsForLimb: getParryVariantIdsForLimb,
        getVariantEffectParamOverride: getVariantEffectParamOverride,
        setVariantEffectParamOverride: setVariantEffectParamOverride,
        clearVariantEffectParamOverride: clearVariantEffectParamOverride,
        peekMoveIdForLimb: peekMoveIdForLimb,
        peekMoveSlotIndexForLimb: peekMoveSlotIndexForLimb,
        getMoveSlotPowerLevel: getMoveSlotPowerLevel,
        setMoveSlotPowerLevel: setMoveSlotPowerLevel,
        advanceMoveSequenceCursorForLimb: advanceMoveSequenceCursorForLimb,
        advanceLimbStrikeOrderAfterAttack: advanceLimbStrikeOrderAfterAttack,
        swapLimbStrikeOrderIndices: swapLimbStrikeOrderIndices,
        getLimbStrikeOrderSlice: getLimbStrikeOrderSlice,
        getLimbStrikeOrderCursor: getLimbStrikeOrderCursor,
        ensureCombatState: ensureCombatState,
        getHubActionCooldownRemaining: getHubActionCooldownRemaining,
        setHubActionCooldownRemaining: setHubActionCooldownRemaining,
        tickHubActionCooldowns: tickHubActionCooldowns,
        getPotential: getPotential,
        addPotential: addPotential,
        consumePotential: consumePotential,
        getStudyExp: getStudyExp,
        addStudyExp: addStudyExp,
        tryAdvanceSkillLevel: tryAdvanceSkillLevel,
        getProgressionSkillCap: getProgressionSkillCap,
        getCombatExperience: getCombatExperience,
        getCombatExperienceDamageMultiplier: getCombatExperienceDamageMultiplier,
        addCombatExperience: addCombatExperience
    };
})(typeof window !== 'undefined' ? window : this);
