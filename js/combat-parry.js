/**
 * 招架：承担格挡的肢体解析、跳过理由、战斗日志与 Buff 事件发射。
 * 规则见 docs/design/08-hit-parry-damage.md「招架结算阶段」、11-skills 8.3.5。
 */
(function (global) {
    'use strict';

    /** 与 inventory COMBAT_LIMB_IDS 顺序一致：躯干受击时依次选首条未毁肢 */
    var GUARD_LIMB_PRIORITY = ['lhand', 'rhand', 'lfoot', 'rfoot'];

    var HIT_PART_TO_LIMB = {
        left_arm: 'lhand',
        right_arm: 'rhand',
        left_leg: 'lfoot',
        right_leg: 'rfoot'
    };

    var LIMB_TO_BODY_PART = {
        lhand: 'left_arm',
        rhand: 'right_arm',
        lfoot: 'left_leg',
        rfoot: 'right_leg'
    };

    var TORSO_PARTS = { head: true, chest: true, abdomen: true };

    var HIT_PART_UI_KEYS = {
        head: 'combat.hit_part.head',
        chest: 'combat.hit_part.chest',
        abdomen: 'combat.hit_part.abdomen',
        left_arm: 'combat.hit_part.left_arm',
        right_arm: 'combat.hit_part.right_arm',
        left_leg: 'combat.hit_part.left_leg',
        right_leg: 'combat.hit_part.right_leg'
    };

    var GUARD_LIMB_UI_KEYS = { lhand: 'body.part.lhand', rhand: 'body.part.rhand', lfoot: 'body.part.lfoot', rfoot: 'body.part.rfoot' };

    function isTorsoHit(hitPart) {
        return !!(hitPart && TORSO_PARTS[hitPart]);
    }

    function formatHitPartForLog(hitPart) {
        var id = hitPart != null && hitPart !== '' ? String(hitPart) : '—';
        var k = HIT_PART_UI_KEYS[hitPart];
        var label = k ? tUi(k, {}) : id;
        return { label: label, id: id };
    }

    function formatGuardLimbForLog(guardLimb) {
        var id = guardLimb != null && guardLimb !== '' ? String(guardLimb) : '—';
        var k = GUARD_LIMB_UI_KEYS[guardLimb];
        var label = k ? tUi(k, {}) : id;
        return { label: label, id: id };
    }

    function tUi(key, vars) {
        try {
            if (global.UIText && typeof global.UIText.t === 'function') return global.UIText.t(key, vars);
        } catch (e) { /* ignore */ }
        return key;
    }

    function logParry(textKey, vars, logType) {
        if (global.GameLog && typeof global.GameLog.log === 'function') {
            global.GameLog.log(tUi(textKey, vars), logType || 'info');
        }
    }

    function normalizeForbiddenGuardLimbs(arr) {
        var out = [];
        if (!Array.isArray(arr)) return out;
        var seen = {};
        var i;
        for (i = 0; i < arr.length; i++) {
            var x = arr[i];
            if (!x || seen[x]) continue;
            if (GUARD_LIMB_PRIORITY.indexOf(x) < 0) continue;
            seen[x] = true;
            out.push(x);
        }
        return out;
    }

    function limbParryUsable(lid, limbs, skillsState, isDestroyed) {
        var bp = LIMB_TO_BODY_PART[lid];
        if (bp && isDestroyed(bp)) return false;
        var limbRow = limbs[lid] || {};
        var parrySkillId = limbRow.parry || null;
        if (!parrySkillId) return false;
        var entry = skillsState[parrySkillId];
        var lvl = (entry && entry.level != null) ? parseInt(entry.level, 10) || 0 : 0;
        return lvl >= 1;
    }

    function collectGuardCandidates(limbs, skillsState, isDestroyed, forbiddenSet) {
        var cands = [];
        var gi;
        for (gi = 0; gi < GUARD_LIMB_PRIORITY.length; gi++) {
            var lid = GUARD_LIMB_PRIORITY[gi];
            if (forbiddenSet[lid]) continue;
            if (!limbParryUsable(lid, limbs, skillsState, isDestroyed)) continue;
            cands.push(lid);
        }
        return cands;
    }

    /**
     * @param {object} opts
     * @param {string} opts.hitPart 命中部位 id：head|chest|abdomen|left_arm|right_arm|left_leg|right_leg
     * @param {object} opts.combatState getCombatState() 形状
     * @param {object} opts.skillsState skills 存档
     * @param {function(string): boolean} [opts.isBodyPartDestroyed] 参数为 left_arm 等，未传则恒 false
     * @param {string[]} [opts.forbiddenGuardLimbs] 本 tick 已用于普攻的肢，不可再用于招架；躯干招架时在候选中随机
     */
    function resolveParryPhaseContext(opts) {
        opts = opts || {};
        var hitPart = opts.hitPart;
        var combatState = opts.combatState || {};
        var skillsState = opts.skillsState || {};
        var isDestroyed = typeof opts.isBodyPartDestroyed === 'function' ? opts.isBodyPartDestroyed : function () { return false; };
        var forbiddenList = normalizeForbiddenGuardLimbs(opts.forbiddenGuardLimbs);
        var forbiddenSet = {};
        var fi;
        for (fi = 0; fi < forbiddenList.length; fi++) forbiddenSet[forbiddenList[fi]] = true;

        var limbs = combatState.limbs || {};
        var preferredFromHit = null;
        if (hitPart && HIT_PART_TO_LIMB[hitPart]) {
            preferredFromHit = HIT_PART_TO_LIMB[hitPart];
            var struckBp0 = LIMB_TO_BODY_PART[preferredFromHit];
            if (struckBp0 && isDestroyed(struckBp0)) {
                return { skip: true, reason: 'struck_limb_destroyed', guardLimb: preferredFromHit, parrySkillId: null, skillLevel: 0 };
            }
        }

        var cands;
        if (preferredFromHit) {
            if (!forbiddenSet[preferredFromHit] && limbParryUsable(preferredFromHit, limbs, skillsState, isDestroyed)) {
                cands = [preferredFromHit];
            } else {
                cands = collectGuardCandidates(limbs, skillsState, isDestroyed, forbiddenSet);
                if (!cands.length) {
                    return { skip: true, reason: 'no_parry_candidate', guardLimb: preferredFromHit, parrySkillId: null, skillLevel: 0 };
                }
            }
        } else if (isTorsoHit(hitPart)) {
            cands = collectGuardCandidates(limbs, skillsState, isDestroyed, forbiddenSet);
            if (!cands.length) {
                var reasonTorso = forbiddenList.length ? 'no_parry_candidate' : 'all_limbs_destroyed';
                return { skip: true, reason: reasonTorso, guardLimb: null, parrySkillId: null, skillLevel: 0 };
            }
        } else {
            return { skip: true, reason: 'unknown_hit_part', guardLimb: null, parrySkillId: null, skillLevel: 0 };
        }

        var guardLimb = cands.length === 1 ? cands[0] : cands[Math.floor(Math.random() * cands.length)];

        var limbRow = limbs[guardLimb] || {};
        var parrySkillId = limbRow.parry || null;
        if (!parrySkillId) {
            return { skip: true, reason: 'empty_parry_slot', guardLimb: guardLimb, parrySkillId: null, skillLevel: 0 };
        }

        var entry = skillsState[parrySkillId];
        var lvl = (entry && entry.level != null) ? parseInt(entry.level, 10) || 0 : 0;
        if (lvl < 1) {
            return { skip: true, reason: 'unlearned', guardLimb: guardLimb, parrySkillId: parrySkillId, skillLevel: lvl };
        }

        return { skip: false, reason: null, guardLimb: guardLimb, parrySkillId: parrySkillId, skillLevel: lvl };
    }

    var SKIP_LOG_KEYS = {
        unlearned: 'log.combat.parry.skipped.unlearned',
        empty_parry_slot: 'log.combat.parry.skipped.empty_slot',
        all_limbs_destroyed: 'log.combat.parry.skipped.all_limbs_destroyed',
        struck_limb_destroyed: 'log.combat.parry.skipped.limb_destroyed',
        unknown_hit_part: 'log.combat.parry.skipped.unknown_part',
        no_parry_candidate: 'log.combat.parry.skipped.no_parry_candidate'
    };

    function logParryPhaseSkipped(ctx, hitPart) {
        var key = SKIP_LOG_KEYS[ctx.reason] || 'log.combat.parry.skipped.unknown_part';
        var hp = formatHitPartForLog(hitPart);
        var gl = formatGuardLimbForLog(ctx.guardLimb);
        logParry(key, {
            hitLabel: hp.label,
            hitId: hp.id,
            limbLabel: gl.label,
            limbId: gl.id,
            skill: ctx.parrySkillId || '—'
        }, 'info');
    }

    function logParryGuardLimb(hitPart, guardLimb, isTorso) {
        var hp = formatHitPartForLog(hitPart);
        var gl = formatGuardLimbForLog(guardLimb);
        logParry(isTorso ? 'log.combat.parry.guard.torso' : 'log.combat.parry.guard.limb_hit', {
            hitLabel: hp.label,
            hitId: hp.id,
            guardLabel: gl.label,
            guardId: gl.id
        }, 'info');
    }

    function logParryRollSuccess() {
        logParry('log.combat.parry.roll.success', {}, 'info');
    }

    function logParryRollFail(shuntPctDisplay) {
        logParry('log.combat.parry.roll.fail_shunt', { pct: shuntPctDisplay != null ? String(shuntPctDisplay) : '—' }, 'info');
    }

    function emitParryCombatEvent(eventName, tags, payload, idSuffix) {
        if (!global.BuffSystem || typeof global.BuffSystem.triggerBuffPipeline !== 'function') return;
        var tick = 0;
        if (global.Survival && typeof global.Survival.getState === 'function') {
            var st = global.Survival.getState();
            tick = st && st.tickCount != null ? st.tickCount : 0;
        }
        var suf = idSuffix != null ? String(idSuffix) : String(Math.random()).slice(2, 10);
        global.BuffSystem.triggerBuffPipeline({
            event_kind: 'combat',
            event_name: eventName,
            event_id: 'parry_evt_' + eventName + '_' + String(tick) + '_' + suf,
            tags: tags || ['parry'],
            payload: payload || null
        });
    }

    global.CombatParry = {
        GUARD_LIMB_PRIORITY: GUARD_LIMB_PRIORITY.slice(),
        HIT_PART_TO_LIMB: Object.assign({}, HIT_PART_TO_LIMB),
        LIMB_TO_BODY_PART: Object.assign({}, LIMB_TO_BODY_PART),
        isTorsoHit: isTorsoHit,
        resolveParryPhaseContext: resolveParryPhaseContext,
        logParryPhaseSkipped: logParryPhaseSkipped,
        logParryGuardLimb: logParryGuardLimb,
        logParryRollSuccess: logParryRollSuccess,
        logParryRollFail: logParryRollFail,
        emitParryCombatEvent: emitParryCombatEvent
    };
})(typeof window !== 'undefined' ? window : this);
