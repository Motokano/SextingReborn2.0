/**
 * 战斗枢纽 / 呼吸法动作（hub_actions + 19 §6）
 * 依赖：CombatSkills、InventoryEquipment、Survival、CharacterAttributes（部分）、BuffSystem（可选）
 */
(function (global) {
    'use strict';

    function findHubAction(skillId, actionId) {
        var CS = global.CombatSkills;
        if (!CS || typeof CS.getSkill !== 'function') return null;
        var sk = CS.getSkill(skillId);
        if (!sk || !sk.hub_actions || !sk.hub_actions.length) return null;
        for (var i = 0; i < sk.hub_actions.length; i++) {
            if (sk.hub_actions[i].id === actionId) return sk.hub_actions[i];
        }
        return null;
    }

    function hubMatchesMount(skillId, sk) {
        var IE = global.InventoryEquipment;
        if (!IE || typeof IE.getCombatState !== 'function') return false;
        var c = IE.getCombatState();
        var hubs = c && c.hubs ? c.hubs : {};
        if (!sk) return false;
        if (sk.category === 'breath') return hubs.breath === skillId;
        if (sk.category === 'footwork') return hubs.footwork === skillId;
        return false;
    }

    function advanceActionTicks(Surv, tickCost) {
        var tc = tickCost != null ? parseInt(tickCost, 10) : 1;
        if (!isFinite(tc) || tc < 1) tc = 1;
        var t;
        for (t = 0; t < tc; t++) {
            if (typeof Surv.advanceTick === 'function') Surv.advanceTick();
        }
    }

    /** 19 §6.5：仅 hubs.breath 挂载本技能时累加吐纳线熟练度 */
    function incrementBreathTuNaLine(IE, breathSkillId) {
        if (!IE || !breathSkillId || typeof IE.getCombatState !== 'function' || !IE.incrementSkillMoveUsage) return;
        var hubs = IE.getCombatState().hubs;
        if (hubs && hubs.breath === breathSkillId) {
            IE.incrementSkillMoveUsage(breathSkillId, 'tu_na', 1);
        }
    }

    function emitHubResolved(Surv, skillId, actionId, extraTags) {
        if (!global.BuffSystem || typeof global.BuffSystem.triggerBuffPipeline !== 'function') return;
        var tick = 0;
        if (Surv && Surv.getState && Surv.getState().tickCount != null) tick = Surv.getState().tickCount;
        var tags = ['hub_action', 'breath', actionId];
        if (extraTags && extraTags.length) tags = tags.concat(extraTags);
        global.BuffSystem.triggerBuffPipeline({
            event_kind: 'action',
            event_name: 'hub_action_resolved',
            event_id: 'hub_' + skillId + '_' + actionId + '_' + tick,
            tags: tags,
            payload: { skill_id: skillId, hub_action_id: actionId }
        });
    }

    function resolveEffectType(ha) {
        if (ha.hub_effect) return String(ha.hub_effect);
        if (ha.diqi_consume_ratio_of_max != null) return 'diqi_shield';
        if (ha.qi_li_restore != null && !ha.diqi_consume_ratio_of_max) return 'restore_qi_li';
        return '';
    }

    function tryExecuteRestoreQiLi(skillId, actionId, ha, IE, Surv, options, result) {
        var add = parseInt(ha.qi_li_restore, 10);
        if (!isFinite(add)) add = 0;
        if (typeof Surv.addQiLi === 'function') Surv.addQiLi(add);
        advanceActionTicks(Surv, ha.tick_cost);
        var cdt = ha.cooldown_ticks != null ? parseInt(ha.cooldown_ticks, 10) : 0;
        if (isFinite(cdt) && cdt > 0) IE.setHubActionCooldownRemaining(skillId, actionId, cdt);
        incrementBreathTuNaLine(IE, skillId);
        result.ok = true;
        result.reason_key = 'combat.hub.ok.restore_qi_li';
        result.qi_li_restored = add;
        emitHubResolved(Surv, skillId, actionId, [String(actionId || 'restore_qi_li')]);
    }

    function tryExecuteDiqiShield(skillId, actionId, ha, IE, Surv, result) {
        if (typeof Surv.getDiqiShieldRemaining === 'function' && Surv.getDiqiShieldRemaining() > 0) {
            result.reason_key = 'combat.hub.fail.shield_active';
            return;
        }
        var st = typeof Surv.getState === 'function' ? Surv.getState() : {};
        var dMax = st.diqi_max != null ? st.diqi_max : 0;
        if (dMax <= 0) {
            result.reason_key = 'combat.hub.fail.diqi_max_zero';
            return;
        }
        var ratio = Number(ha.diqi_consume_ratio_of_max);
        if (!isFinite(ratio) || ratio < 0) ratio = 0;
        var B = Math.floor(dMax * ratio);
        var dMin = ha.diqi_consume_min != null ? parseInt(ha.diqi_consume_min, 10) : 1;
        if (!isFinite(dMin) || dMin < 1) dMin = 1;
        var C = Math.max(dMin, B);
        var dCur = st.diqi_current != null ? st.diqi_current : 0;
        if (dCur < C) {
            result.reason_key = 'combat.hub.fail.diqi_low';
            return;
        }
        if (typeof Surv.changeDiqi === 'function') {
            Surv.changeDiqi({ curDelta: -C, sourceTag: 'hub_action:diqi_huti' });
        } else if (typeof Surv.consumeDiqi === 'function') {
            Surv.consumeDiqi(C);
        }
        if (typeof Surv.setDiqiShieldRemaining === 'function') Surv.setDiqiShieldRemaining(C);
        advanceActionTicks(Surv, ha.tick_cost);
        if (IE.incrementSkillMoveUsage) IE.incrementSkillMoveUsage(skillId, 'diqi_huti', 1);
        result.ok = true;
        result.reason_key = 'combat.hub.ok.diqi_huti';
        result.shield_value = C;
        emitHubResolved(Surv, skillId, actionId, ['diqi_shield', actionId]);
    }

    function tryExecuteXueQiHuaJing(skillId, actionId, ha, IE, Surv, result) {
        var CA = global.CharacterAttributes;
        if (!CA || typeof CA.tryApplyXueQiHuaJing !== 'function') {
            result.reason_key = 'combat.hub.fail.modules';
            return;
        }
        var dDel = ha.xue_qi_destroy != null ? parseInt(ha.xue_qi_destroy, 10) : 10;
        var dGain = ha.xue_qi_diqi_gain != null ? parseInt(ha.xue_qi_diqi_gain, 10) : 10;
        var xr = CA.tryApplyXueQiHuaJing(dDel, dGain);
        if (!xr.ok) {
            result.reason_key = xr.reason_key || 'combat.hub.fail.xue_qi.no_limb';
            return;
        }
        advanceActionTicks(Surv, ha.tick_cost);
        incrementBreathTuNaLine(IE, skillId);
        result.ok = true;
        result.reason_key = 'combat.hub.ok.xue_qi';
        result.limb = xr.limb;
        emitHubResolved(Surv, skillId, actionId, ['xue_qi_hua_jing']);
    }

    function tryExecuteTuQiNaJing(skillId, actionId, ha, IE, Surv, result) {
        var cost = ha.tu_qi_diqi_cost != null ? parseInt(ha.tu_qi_diqi_cost, 10) : 10;
        var eg = ha.tu_qi_energy_gain != null ? parseInt(ha.tu_qi_energy_gain, 10) : 1;
        var st = typeof Surv.getState === 'function' ? Surv.getState() : {};
        var dCur = st.diqi_current != null ? st.diqi_current : 0;
        if (dCur < cost) {
            result.reason_key = 'combat.hub.fail.tu_qi.diqi';
            return;
        }
        if (typeof Surv.changeDiqi === 'function') {
            Surv.changeDiqi({ curDelta: -cost, sourceTag: 'hub_action:tu_qi_na_jing' });
        } else if (typeof Surv.consumeDiqi === 'function') {
            Surv.consumeDiqi(cost);
        }
        if (typeof Surv.addEnergy === 'function') Surv.addEnergy(eg);
        advanceActionTicks(Surv, ha.tick_cost);
        incrementBreathTuNaLine(IE, skillId);
        result.ok = true;
        result.reason_key = 'combat.hub.ok.tu_qi';
        result.energy_gain = eg;
        emitHubResolved(Surv, skillId, actionId, ['tu_qi_na_jing']);
    }

    function tryExecuteTiaoXiOnce(skillId, actionId, ha, IE, Surv, result) {
        var st0 = typeof Surv.getState === 'function' ? Surv.getState() : {};
        var dmx = st0.diqi_max != null ? st0.diqi_max : (st0.diqi_max_effective != null ? st0.diqi_max_effective : 0);
        if (!isFinite(dmx) || dmx <= 0) {
            result.reason_key = 'combat.hub.fail.tiao_xi.diqi_max';
            return;
        }
        if (typeof Surv.setSitMeditationActive === 'function') Surv.setSitMeditationActive(true);
        try {
            advanceActionTicks(Surv, ha.tick_cost);
        } finally {
            if (typeof Surv.setSitMeditationActive === 'function') Surv.setSitMeditationActive(false);
        }
        var added = typeof Surv.getLastSitMeditationGain === 'function' ? Surv.getLastSitMeditationGain() : 0;
        incrementBreathTuNaLine(IE, skillId);
        result.ok = true;
        result.reason_key = 'combat.hub.ok.tiao_xi';
        result.diqi_gained = added;
        emitHubResolved(Surv, skillId, actionId, ['tiao_xi', 'sit_meditation']);
    }

    function tryExecuteHubAction(skillId, actionId, options) {
        options = options || {};
        var result = { ok: false, reason_key: 'combat.hub.fail.unknown' };
        var IE = global.InventoryEquipment;
        var Surv = global.Survival;
        var CS = global.CombatSkills;
        if (!IE || !Surv || !CS) {
            result.reason_key = 'combat.hub.fail.modules';
            return result;
        }
        if (!skillId || !actionId) {
            result.reason_key = 'combat.hub.fail.params';
            return result;
        }
        if (IE.getSkillLevel(skillId) < 1) {
            result.reason_key = 'combat.hub.fail.skill';
            return result;
        }
        var skTpl = CS.getSkill(skillId);
        var ha = findHubAction(skillId, actionId);
        if (!ha) {
            result.reason_key = 'combat.hub.fail.no_action';
            return result;
        }
        if (!hubMatchesMount(skillId, skTpl)) {
            result.reason_key = 'combat.hub.fail.hub_mount';
            return result;
        }
        var ul = ha.unlock_level != null ? ha.unlock_level : 1;
        if (IE.getSkillLevel(skillId) < ul) {
            result.reason_key = 'combat.hub.fail.unlock';
            return result;
        }
        var cdRem = IE.getHubActionCooldownRemaining(skillId, actionId);
        if (cdRem > 0) {
            result.reason_key = 'combat.hub.fail.cooldown';
            result.cooldown_ticks = cdRem;
            return result;
        }
        var needBattle = !!ha.battle_only;
        var inBattleCtx = typeof options.isBattleContext === 'function' ? !!options.isBattleContext() : false;
        if (needBattle && !inBattleCtx) {
            result.reason_key = 'combat.hub.fail.battle_only';
            return result;
        }

        var eff = resolveEffectType(ha);
        switch (eff) {
            case 'restore_qi_li':
                tryExecuteRestoreQiLi(skillId, actionId, ha, IE, Surv, options, result);
                break;
            case 'diqi_shield':
                tryExecuteDiqiShield(skillId, actionId, ha, IE, Surv, result);
                break;
            case 'xue_qi_hua_jing':
                tryExecuteXueQiHuaJing(skillId, actionId, ha, IE, Surv, result);
                break;
            case 'tu_qi_na_jing':
                tryExecuteTuQiNaJing(skillId, actionId, ha, IE, Surv, result);
                break;
            case 'tiao_xi_once':
                tryExecuteTiaoXiOnce(skillId, actionId, ha, IE, Surv, result);
                break;
            default:
                result.reason_key = 'combat.hub.fail.unimplemented';
        }
        return result;
    }

    global.CombatHubActions = {
        tryExecuteHubAction: tryExecuteHubAction,
        findHubActionTemplate: findHubAction
    };
})(typeof window !== 'undefined' ? window : this);
