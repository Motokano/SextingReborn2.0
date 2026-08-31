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
        // 「吐纳」已取消（19 §6.4）：qi_li_restore 不再作为 hub 效果类型；呼吸条恢复仅由 breath_bar.regen 被动模型负责
        return '';
    }

    /** @deprecated 吐纳已取消（19 §6.4）：保留函数体仅为避免 reason_key 断链，实际不会再被 resolveEffectType 命中 */
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
        // 新激活（37 §4.2/§4.3）：读躯干防具的基础盾量与模块消耗；无防具（裸奔）不可激活
        var armorInfo = (IE && typeof IE.getArmorShieldInfo === 'function') ? IE.getArmorShieldInfo() : null;
        if (!armorInfo || !armorInfo.equipped || armorInfo.baseShield <= 0) {
            result.reason_key = 'combat.hub.fail.no_armor';
            return;
        }
        var shieldCap = Math.max(1, Math.floor(armorInfo.baseShield));
        var C = Math.max(1, Math.floor(armorInfo.baseShield * (1 + armorInfo.moduleCostSum)));
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
        if (typeof Surv.setDiqiShieldRemaining === 'function') Surv.setDiqiShieldRemaining(shieldCap);
        advanceActionTicks(Surv, ha.tick_cost);
        if (IE.incrementSkillMoveUsage) IE.incrementSkillMoveUsage(skillId, 'diqi_huti', 1);
        result.ok = true;
        result.reason_key = 'combat.hub.ok.diqi_huti';
        result.shield_value = shieldCap;
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
        // 调息（新资源模型）：消耗饱食/饮水恢复体力+底气——储备不足无法开始
        var tiaoSatCost = getCfgNum('tiao_xi_satiety_cost_per_tick', 1);
        var tiaoThirstCost = getCfgNum('tiao_xi_thirst_cost_per_tick', 0.5);
        if ((st0.satiety != null && st0.satiety < tiaoSatCost) || (st0.thirst != null && st0.thirst < tiaoThirstCost)) {
            result.reason_key = 'combat.hub.fail.tiao_xi.no_food';
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

    /** 读取 survival-config 数值（与管线 getCfg 同口径） */
    function getCfgNum(key, def) {
        try {
            if (global.CharacterAttributes && typeof global.CharacterAttributes.getCfg === 'function') {
                var v = Number(global.CharacterAttributes.getCfg(key, def));
                if (isFinite(v)) return v;
            }
        } catch (eCfg) { /* ignore */ }
        return def;
    }

    /** 进食/饮水（新资源模型）：消耗饱食/饮水 → 恢复体力（储备燃料转行动货币） */
    function tryExecuteEatRecovery(skillId, actionId, ha, IE, Surv, result) {
        var satCost = ha.eat_satiety_cost != null ? Number(ha.eat_satiety_cost) : getCfgNum('eat_satiety_cost', 10);
        var thirstCost = ha.eat_thirst_cost != null ? Number(ha.eat_thirst_cost) : getCfgNum('eat_thirst_cost', 5);
        var staminaGain = ha.eat_stamina_gain != null ? Number(ha.eat_stamina_gain) : getCfgNum('eat_stamina_gain', 20);
        if (typeof Surv.applyFoodConversion !== 'function') {
            result.reason_key = 'combat.hub.fail.modules';
            return;
        }
        var r = Surv.applyFoodConversion(satCost, thirstCost, staminaGain);
        if (!r.ok) {
            if (r.reason === 'low_satiety') result.reason_key = 'combat.hub.fail.eat.low_satiety';
            else if (r.reason === 'low_thirst') result.reason_key = 'combat.hub.fail.eat.low_thirst';
            else result.reason_key = 'combat.hub.fail.eat.invalid';
            return;
        }
        advanceActionTicks(Surv, ha.tick_cost);
        incrementBreathTuNaLine(IE, skillId);
        result.ok = true;
        result.reason_key = 'combat.hub.ok.eat';
        result.stamina_gain = r.stamina_gain;
        result.satiety_cost = r.satiety_cost;
        result.thirst_cost = r.thirst_cost;
        emitHubResolved(Surv, skillId, actionId, ['eat_recovery', actionId]);
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
        // 眩晕中（k13，37 §9.2）：本回合无法行动 → 吞掉本次动作
        if (IE && typeof IE.consumePlayerStunRoundIfBlocking === 'function' && IE.consumePlayerStunRoundIfBlocking()) {
            result.reason_key = 'combat.hub.fail.stunned';
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
            case 'eat_recovery':
                tryExecuteEatRecovery(skillId, actionId, ha, IE, Surv, result);
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
