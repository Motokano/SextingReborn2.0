/**
 * 物品栏与装备栏系统 - 按设计文档 02-regions、05、14-implementation
 * 四类容器：口袋、背心、背包、载具；15 个装备槽；快捷腰带 = 口袋 + 背心（先口袋后背心）
 * getItemTemplate 先 equipment 再 items；装备穿戴校验；死亡清空、新游戏仅 default_equipment
 */
(function (global) {
    'use strict';

    /** 装备槽位 ID（呼吸法、步法、招架为技能而非装备，不占装备槽；招架在肢体技能栏配置；饰品分五槽） */
    var EQUIP_SLOT_IDS = [
        'head', 'clothing', 'vest', 'backpack',
        'weapon_left', 'weapon_right',
        'glove_left', 'glove_right',
        'shoe_left', 'shoe_right',
        'ring_left', 'ring_right', 'earring_left', 'earring_right', 'necklace'
    ];

    /** 品质六档：粗糙→普通→精良→稀有→史诗→传说，0～5 */
    var QUALITY_TIERS = [0, 1, 2, 3, 4, 5];
    var QUALITY_NAMES = ['粗糙', '普通', '精良', '稀有', '史诗', '传说'];

    var equipmentTable = {};
    var itemsTable = {};
    var enchantTable = {};
    var defaultEquipmentConfig = {};
    var displayTierThreshold1 = null;
    var displayTierThreshold2 = null;

    /** 特殊技能：经络学（0 级未入门；≥1 解锁战斗配置中的经脉/穴位分页） */
    var SPECIAL_MERIDIAN_STUDIES_SKILL_ID = 'special_meridian_studies';

    function ensureMeridianStudiesSkillPresent() {
        if (!state.skills || typeof state.skills !== 'object') state.skills = {};
        if (!state.skills[SPECIAL_MERIDIAN_STUDIES_SKILL_ID] || typeof state.skills[SPECIAL_MERIDIAN_STUDIES_SKILL_ID] !== 'object') {
            state.skills[SPECIAL_MERIDIAN_STUDIES_SKILL_ID] = { level: 0, move_usage: {} };
            return;
        }
        var ent = state.skills[SPECIAL_MERIDIAN_STUDIES_SKILL_ID];
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
            /** 后遗症装配（肢体级）：post_effect_sequences[limbId] = post_effect_id|null */
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
            variant_effect_param_overrides: {}
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
            var lr = state.combat.limbs[lidNorm];
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

    /**
     * 先查 equipment、再查 items；无则返回 null
     */
    function getItemTemplate(itemId) {
        if (!itemId) return null;
        if (equipmentTable[itemId]) return equipmentTable[itemId];
        if (itemsTable[itemId]) return itemsTable[itemId];
        return null;
    }

    /** 仅物品表（items.json）中的 id，已排序；不含装备表 */
    function getAllItemIds() {
        return Object.keys(itemsTable || {}).sort();
    }

    /**
     * 含品质档的有效基价（贸易/任务/事件）：模板 base_value × (1 + 每档加成 × 档)，见全局 ItemValue。
     * @param {string} itemId
     * @param {object|number|null} [instanceOrTier] 实例 { quality_tier, ... }，或仅品质档；缺省用模板 quality_tier
     * @returns {number}
     */
    function getEffectiveBaseValue(itemId, instanceOrTier) {
        var IV = global.ItemValue;
        if (IV && typeof IV.getEffectiveBaseValue === 'function') {
            var opts = {};
            if (instanceOrTier != null && typeof instanceOrTier === 'object' && !Array.isArray(instanceOrTier)) {
                opts.instance = instanceOrTier;
            } else if (instanceOrTier != null) {
                opts.quality_tier = instanceOrTier;
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
        var qt = qualityTier != null ? Math.max(0, Math.floor(Number(qualityTier))) : 0;
        var placed = 0;
        for (var i = 0; i < c; i++) {
            var pr = putItemIntoDefaultContainer({ item_id: id, count: 1, quality_tier: qt });
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
                var instQ = itemInstance && itemInstance.quality_tier != null ? itemInstance.quality_tier : 0;
                var existQ = existing && existing.quality_tier != null ? existing.quality_tier : 0;
                if (canStack && existing && existing.item_id === itemInstance.item_id
                    && instQ === existQ
                    && !(existing.enchants && existing.enchants.length)) {
                    var count = (existing.count || 1) + (itemInstance.count || 1);
                    var maxStack = getMaxStack(itemInstance.item_id);
                    if (count <= maxStack) {
                        arr[i] = { item_id: existing.item_id, count: count, quality_tier: existing.quality_tier };
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
        if (existing) {
            var instQ = instance && instance.quality_tier != null ? instance.quality_tier : 0;
            var existQ = existing && existing.quality_tier != null ? existing.quality_tier : 0;
            if (instQ !== existQ) return false;
        }
        return true;
    }

    function getMaxStack(itemId) {
        var tpl = getItemTemplate(itemId);
        if (!tpl) return 1;
        if (tpl.enchant_slots != null && tpl.enchant_slots > 0) return 1;
        return (tpl.stack_max != null) ? Math.max(1, parseInt(tpl.stack_max, 10)) : 99;
    }

    function copyItemInstance(inst) {
        var c = { item_id: inst.item_id };
        if (inst.count != null) c.count = inst.count;
        if (inst.quality_tier != null) c.quality_tier = inst.quality_tier;
        if (inst.enchants && inst.enchants.length) c.enchants = inst.enchants.slice();
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
        if (EQUIP_SLOT_IDS.indexOf(slotId) < 0) return { success: false, message: '无效槽位' };
        if (!instance || !instance.item_id) return { success: false, message: '无效物品' };
        var tpl = getItemTemplate(instance.item_id);
        if (!tpl) return { success: false, message: '未知物品' };
        if (tpl.equip_slot !== slotId) return { success: false, message: '装备槽位不匹配' };
        var maxEnchants = (tpl.enchant_slots != null) ? parseInt(tpl.enchant_slots, 10) : 6;
        var enc = instance.enchants;
        if (enc && enc.length > maxEnchants) return { success: false, message: '词条数量超过上限' };

        state.equipment[slotId] = copyItemInstance(instance);
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
        if (!key) return { success: false, message: '无效的位置，无法丢弃' };
        var taken = takeItemFromContainer(containerType, index);
        if (!taken.success || !taken.item) return { success: false, message: '无法取出物品' };
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
        if (!arr || index < 0 || index >= arr.length) return { success: false, message: '该位置无物品' };
        var item = removeItemFromGround(mapId, x, y, index);
        if (!item) return { success: false, message: '拾取失败' };
        var placed = putItemIntoDefaultContainer(item);
        if (placed.placed) return { success: true, placed: true };
        addItemToGround(mapId, x, y, item);
        return { success: false, placed: false, message: '背包已满' };
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
        if (!arr || index < 0 || index >= arr.length) return { success: false, message: '该位置无物品' };
        var item = removeItemFromGround(mapId, x, y, index);
        if (!item || !item.item_id) {
            if (item) addItemToGround(mapId, x, y, item);
            return { success: false, message: '拾取失败' };
        }
        var tpl = getItemTemplate(item.item_id);
        if (!tpl || !tpl.equip_slot) {
            addItemToGround(mapId, x, y, item);
            return { success: false, message: '不是装备' };
        }
        var slotId = tpl.equip_slot;
        if (EQUIP_SLOT_IDS.indexOf(slotId) < 0) {
            addItemToGround(mapId, x, y, item);
            return { success: false, message: '无效槽位' };
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
        clothing: 'eq_clothing_commute',
        vest: 'eq_vest_hoodie',
        shoe_left: 'eq_shoe_left_sport',
        shoe_right: 'eq_shoe_right_sport'
    };

    /**
     * 新手装备的内置模板。当 equipment.json 未加载（如 file://）时，getItemTemplate 仍能返回这些条目，避免显示「空」或裸 id。
     */
    var BUILTIN_EQUIPMENT_TEMPLATES = {
        eq_clothing_commute: {
            id: 'eq_clothing_commute',
            quality_tier: 0,
            name_0: '灰扑扑的外套',
            name_1: '通勤外套',
            name_2: '通勤套服',
            desc_0: '一件能穿的外套，兜里能塞点东西，好像能挡一点伤。',
            desc_1: '日常通勤用的套服，两格口袋；对劈砍、钝击有一定防护。',
            desc_2: '通勤套服，劈砍抗性 5%、钝击抗性 10%，提供两格口袋。',
            display_skill_id: 'survival_language',
            equip_slot: 'clothing',
            enchant_slots: 6,
            weight_kg: 0.5,
            pocket_slots: 2,
            damage_reduce_slash_pct: 0.05,
            damage_reduce_pierce_pct: 0,
            damage_reduce_blunt_pct: 0.10
        },
        eq_vest_hoodie: {
            id: 'eq_vest_hoodie',
            quality_tier: 0,
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
            quality_tier: 0,
            name_0: '左脚运动鞋',
            name_1: '运动鞋',
            name_2: '运动鞋',
            desc_0: '左脚穿的运动鞋，走路跑步都行。',
            desc_1: '左脚的运动鞋，脚上出招时系数 1.0。',
            desc_2: '左脚运动鞋，脚部战斗技能系数 1.0。',
            display_skill_id: 'survival_language',
            equip_slot: 'shoe_left',
            enchant_slots: 6,
            weight_kg: 0.25,
            skill_coef: 1.0
        },
        eq_shoe_right_sport: {
            id: 'eq_shoe_right_sport',
            quality_tier: 0,
            name_0: '右脚运动鞋',
            name_1: '运动鞋',
            name_2: '运动鞋',
            desc_0: '右脚穿的运动鞋，走路跑步都行。',
            desc_1: '右脚的运动鞋，脚上出招时系数 1.0。',
            desc_2: '右脚运动鞋，脚部战斗技能系数 1.0。',
            display_skill_id: 'survival_language',
            equip_slot: 'shoe_right',
            enchant_slots: 6,
            weight_kg: 0.25,
            skill_coef: 1.0
        }
    };

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
            var seq = state.combat.move_sequences[lid];
            if (!Array.isArray(seq) || !seq.length) continue;
            var limbKeys = (getTags ? getTags(lid) : null) || (typeof CS.getDefaultLimbTagKeysForLimbId === 'function' ? CS.getDefaultLimbTagKeysForLimbId(lid) : []);
            var si;
            var changed = false;
            for (si = 0; si < seq.length; si++) {
                var mid = seq[si];
                if (!mid) continue;
                if (String(mid).indexOf('variant:') === 0) continue;
                var mj;
                var moveObj = null;
                for (mj = 0; mj < sk.moves.length; mj++) {
                    if (sk.moves[mj] && sk.moves[mj].id === mid) {
                        moveObj = sk.moves[mj];
                        break;
                    }
                }
                if (!moveObj || !CS.moveAllowedOnLimbByTagKeys(moveObj, limbKeys)) {
                    seq[si] = '';
                    changed = true;
                    // 肢体级后遗症不随单槽清空；是否生效由运行时 validateSocket 判定。
                }
            }
            if (changed) state.combat.move_sequences[lid] = seq.slice();
        }
    }

    /**
     * 每肢进攻技能至少保留 1 个非空招式槽（轮转依赖 getCompactMoveIdsForLimb）。
     * 在标签清洗之后调用。
     */
    function ensureMinimumOneFilledMovePerLimb() {
        var CS = typeof global !== 'undefined' && global.CombatSkills;
        if (!CS || typeof CS.getSkill !== 'function' || typeof CS.getUnlockedMoves !== 'function' || typeof CS.getMaxSlotsForLevel !== 'function') return;
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
            var maxSlots = CS.getMaxSlotsForLevel(skillId, lv);
            if (!maxSlots || maxSlots < 1) continue;
            var seq = Array.isArray(state.combat.move_sequences[lid]) ? state.combat.move_sequences[lid].slice() : [];
            while (seq.length < maxSlots) seq.push('');
            seq = seq.slice(0, maxSlots);
            var filled = 0;
            var si;
            for (si = 0; si < seq.length; si++) {
                if (seq[si] && String(seq[si]).indexOf('variant:') !== 0) filled++;
            }
            if (filled >= 1) {
                state.combat.move_sequences[lid] = seq;
                continue;
            }
            var limbKeys = (getTags ? getTags(lid) : null) || (typeof CS.getDefaultLimbTagKeysForLimbId === 'function' ? CS.getDefaultLimbTagKeysForLimbId(lid) : []);
            var unlocked = CS.getUnlockedMoves(skillId, lv);
            var pick = null;
            var uidx;
            if (typeof CS.moveAllowedOnLimbByTagKeys === 'function') {
                for (uidx = 0; uidx < unlocked.length; uidx++) {
                    if (CS.moveAllowedOnLimbByTagKeys(unlocked[uidx], limbKeys)) {
                        pick = unlocked[uidx].id;
                        break;
                    }
                }
            }
            if (!pick && unlocked[0]) pick = unlocked[0].id;
            if (!pick) {
                state.combat.move_sequences[lid] = seq;
                continue;
            }
            var placed = false;
            for (si = 0; si < seq.length; si++) {
                if (!seq[si]) {
                    seq[si] = pick;
                    placed = true;
                    break;
                }
            }
            if (!placed) seq[0] = pick;
            state.combat.move_sequences[lid] = seq;
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

    function validateAtLeastOneMovePerActiveLimb() {
        ensureCombatState();
        var CS = typeof global !== 'undefined' && global.CombatSkills;
        for (var i = 0; i < COMBAT_LIMB_IDS.length; i++) {
            var lid = COMBAT_LIMB_IDS[i];
            var limbRec = state.combat.limbs[lid] || {};
            var activeSkillId = limbRec.active;
            if (!activeSkillId) continue;
            var sk = CS && typeof CS.getSkill === 'function' ? CS.getSkill(activeSkillId) : null;
            if (!sk || (sk.category !== 'unarmed' && sk.category !== 'weapon')) continue;
            var seq = Array.isArray(state.combat.move_sequences[lid]) ? state.combat.move_sequences[lid] : [];
            var hasMove = false;
            for (var si = 0; si < seq.length; si++) {
                if (seq[si] && String(seq[si]).indexOf('variant:') !== 0) { hasMove = true; break; }
            }
            if (!hasMove) return false;
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
            state.skills[skillId] = { level: minLevel, move_usage: {} };
            return;
        }
        var lv = parseInt(state.skills[skillId].level, 10);
        if (!isFinite(lv) || lv < 1) state.skills[skillId].level = minLevel;
        if (!state.skills[skillId].move_usage || typeof state.skills[skillId].move_usage !== 'object') {
            state.skills[skillId].move_usage = {};
        }
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
        ensureMeridianStudiesSkillPresent();
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
            if (itemId) state.equipment[key] = { item_id: String(itemId), enchants: [] };
        }
        state.combat = getDefaultCombatState();
        state.hub_action_cooldowns = {};
        state.potential = 0;
        state.combat_experience = 0;
        applyDefaultStarterCombatLayout();
        ensureMeridianStudiesSkillPresent();
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
        if (s.skill_max_level_bonus && typeof s.skill_max_level_bonus === 'object') {
            state.skill_max_level_bonus = {};
            for (var bk in s.skill_max_level_bonus) {
                if (s.skill_max_level_bonus.hasOwnProperty(bk)) state.skill_max_level_bonus[bk] = s.skill_max_level_bonus[bk];
            }
        }
        clampSkillLevelsToProgressionCaps();
        ensureMeridianStudiesSkillPresent();
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
        SPECIAL_MERIDIAN_STUDIES_SKILL_ID: SPECIAL_MERIDIAN_STUDIES_SKILL_ID,
        EQUIP_SLOT_IDS: EQUIP_SLOT_IDS,
        COMBAT_LIMB_IDS: COMBAT_LIMB_IDS,
        QUALITY_TIERS: QUALITY_TIERS,
        QUALITY_NAMES: QUALITY_NAMES,
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
        getCombatExperience: getCombatExperience,
        getCombatExperienceDamageMultiplier: getCombatExperienceDamageMultiplier,
        addCombatExperience: addCombatExperience
    };
})(typeof window !== 'undefined' ? window : this);
