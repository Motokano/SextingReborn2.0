/**
 * 战斗结算管线：数据驱动 phases，支持 registerPhaseHandler 覆盖内置实现。
 * 配置：data/combat-pipeline.json
 */
(function (global) {
    'use strict';

    var config = { pipelines: {}, effect_type_catalog: {} };
    var customHandlers = {};

    function setConfig(obj) {
        if (!obj || typeof obj !== 'object') return;
        config.pipelines = obj.pipelines || {};
        config.effect_type_catalog = obj.effect_type_catalog || {};
        config.balance_config_keys = obj.balance_config_keys;
        config.version = obj.version;
    }

    function getConfig() {
        return config;
    }

    function registerPhaseHandler(handlerKey, fn) {
        if (handlerKey && typeof fn === 'function') customHandlers[handlerKey] = fn;
    }

    function getParryCaps() {
        var caps = { chance: 0.75, shunt: 0.5 };
        if (global.CharacterAttributes && typeof global.CharacterAttributes.getCfg === 'function') {
            var c1 = global.CharacterAttributes.getCfg('parry_chance_cap', 0.75);
            var c2 = global.CharacterAttributes.getCfg('parry_damage_reduce_cap', 0.5);
            if (typeof c1 === 'number' && isFinite(c1)) caps.chance = c1;
            if (typeof c2 === 'number' && isFinite(c2)) caps.shunt = c2;
        }
        return caps;
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function rnd() {
        return Math.random();
    }

    function emitCombat(eventName, tags, payload, idSuffix) {
        if (!global.BuffSystem || typeof global.BuffSystem.triggerBuffPipeline !== 'function') return;
        var tick = 0;
        if (global.Survival && typeof global.Survival.getState === 'function') {
            var st = global.Survival.getState();
            tick = st && st.tickCount != null ? st.tickCount : 0;
        }
        global.BuffSystem.triggerBuffPipeline({
            event_kind: 'combat',
            event_name: eventName,
            event_id: 'cp_' + eventName + '_' + tick + '_' + String(idSuffix || ''),
            tags: tags || ['combat_pipeline'],
            payload: payload || null
        });
    }

    function isPlayerInSitMeditationState() {
        var Surv = global.Survival;
        if (!Surv) return false;
        if (typeof Surv.isSitMeditationActive === 'function' && Surv.isSitMeditationActive()) return true;
        if (global.SceneCtx && global.SceneCtx.idleActionType === 'tiao_xi') return true;
        return false;
    }

    function phaseEmitHitRoll(ctx, phase) {
        if (ctx && ctx.defender && ctx.defender.kind === 'player' && isPlayerInSitMeditationState()) {
            // 行气/调息中被选为受击目标：命中强制成功，并标记本 tick 行气收益作废。
            ctx.hitRollSuccess = true;
            if (global.Survival && typeof global.Survival.interruptSitMeditationThisTick === 'function') {
                global.Survival.interruptSitMeditationThisTick();
            }
            ctx.sitMeditationInterrupted = true;
        }
        ctx.hitRollSuccess = ctx.hitRollSuccess !== false;
        if (phase.buff_event_name) {
            emitCombat(phase.buff_event_name, ['attack', 'hit_roll', 'subhit'], {
                move_id: ctx.moveId,
                skill_id: ctx.skillId,
                hit_roll_success: ctx.hitRollSuccess,
                defender_kind: ctx.defender && ctx.defender.kind,
                sit_meditation_interrupted: !!ctx.sitMeditationInterrupted
            }, ctx.eventIdSuffix || ctx.moveId);
        }
        return ctx;
    }

    function phaseParryEnemySimple(ctx, phase) {
        var d = ctx.defender || {};
        var rate = typeof d.parry_rate === 'number' ? d.parry_rate : (parseFloat(d.parry_rate) || 0);
        var red = typeof d.parry_damage_reduce === 'number' ? d.parry_damage_reduce : (parseFloat(d.parry_damage_reduce) || 0);
        var caps = getParryCaps();
        rate = clamp(rate, 0, caps.chance);
        red = clamp(red, 0, caps.shunt);
        if (!ctx.hitRollSuccess) return ctx;
        if (rate <= 0) {
            ctx.parrySucceeded = false;
            ctx.damageAfterParry = ctx.rawDamage * (1 - red);
            return ctx;
        }
        if (rnd() < rate) {
            ctx.parrySucceeded = true;
            ctx.damageAfterParry = 0;
            emitCombat(phase.buff_event_parry_ok || 'parry_roll_succeeded', ['parry', 'parry_roll'], { defender_kind: 'enemy' }, ctx.eventIdSuffix);
        } else {
            ctx.parrySucceeded = false;
            ctx.damageAfterParry = ctx.rawDamage * (1 - red);
            emitCombat(phase.buff_event_parry_fail || 'parry_roll_failed', ['parry', 'parry_roll'], { shunt_ratio: red }, ctx.eventIdSuffix);
            emitCombat('parry_shunt_applied', ['parry', 'parry_shunt'], { shunt_ratio: red }, ctx.eventIdSuffix);
        }
        return ctx;
    }

    function phaseParryPlayerCombatParry(ctx, phase) {
        if (!ctx.hitRollSuccess) return ctx;
        if (ctx.sitMeditationInterrupted) {
            ctx.parryPhaseSkipped = true;
            ctx.skipReason = 'sit_meditation_interrupted';
            ctx.parrySucceeded = false;
            ctx.damageAfterParry = ctx.rawDamage;
            emitCombat(phase.buff_event_skip || 'parry_phase_skipped', ['parry', 'parry_skip'], { reason: 'sit_meditation_interrupted' }, ctx.eventIdSuffix);
            return ctx;
        }
        var CP = global.CombatParry;
        var IE = global.InventoryEquipment;
        if (!CP || !IE || typeof CP.resolveParryPhaseContext !== 'function') {
            ctx.parrySucceeded = false;
            ctx.damageAfterParry = ctx.rawDamage;
            return ctx;
        }
        var combatState = IE.getCombatState ? IE.getCombatState() : {};
        var skillsState = IE.getSkillsState ? IE.getSkillsState() : {};
        var isDes = ctx.defender && typeof ctx.defender.isBodyPartDestroyed === 'function'
            ? ctx.defender.isBodyPartDestroyed
            : function () { return false; };
        var pctx = CP.resolveParryPhaseContext({
            hitPart: ctx.hitPart || 'chest',
            combatState: combatState,
            skillsState: skillsState,
            isBodyPartDestroyed: isDes
        });
        if (pctx.skip) {
            ctx.parryPhaseSkipped = true;
            ctx.skipReason = pctx.reason;
            ctx.parrySucceeded = false;
            ctx.damageAfterParry = ctx.rawDamage;
            if (typeof CP.logParryPhaseSkipped === 'function') CP.logParryPhaseSkipped(pctx, ctx.hitPart);
            emitCombat(phase.buff_event_skip || 'parry_phase_skipped', ['parry', 'parry_skip'], { reason: pctx.reason, guard_limb: pctx.guardLimb }, ctx.eventIdSuffix);
            return ctx;
        }
        ctx.guardLimb = pctx.guardLimb;
        ctx.parrySkillId = pctx.parrySkillId;
        var isTorso = CP.isTorsoHit && CP.isTorsoHit(ctx.hitPart);
        if (typeof CP.logParryGuardLimb === 'function') CP.logParryGuardLimb(ctx.hitPart, pctx.guardLimb, !!isTorso);
        emitCombat(phase.buff_event_guard || 'parry_guard_limb_resolved', ['parry', 'parry_guard', isTorso ? 'torso_guard' : 'limb_struck'], {
            hit_part: ctx.hitPart,
            guard_limb: pctx.guardLimb,
            parry_skill_id: pctx.parrySkillId
        }, ctx.eventIdSuffix);
        var CS = global.CombatSkills;
        var flex = 0;
        if (global.CharacterAttributes && typeof global.CharacterAttributes.getEffectiveAttr === 'function') {
            flex = global.CharacterAttributes.getEffectiveAttr('flexibility') || 0;
        }
        var multPer = 0.005;
        if (global.CharacterAttributes && typeof global.CharacterAttributes.getCfg === 'function') {
            multPer = global.CharacterAttributes.getCfg('parry_flexibility_mult_per_point', 0.005);
        }
        var baseS = 0;
        var baseR = 0;
        if (CS && typeof CS.getParryValues === 'function') {
            var pv = CS.getParryValues(pctx.parrySkillId, pctx.skillLevel, null);
            baseS = pv.success || 0;
            baseR = pv.reduce || 0;
        }
        var flexM = 1 + multPer * flex;
        var caps = getParryCaps();
        var pChance = clamp(baseS * flexM, 0, caps.chance);
        var pReduce = clamp(baseR * flexM, 0, caps.shunt);
        if (global.BuffSystem && typeof global.BuffSystem.getParryChanceDeltaPercent === 'function') {
            var deltaPct = global.BuffSystem.getParryChanceDeltaPercent('player') || 0;
            pChance = clamp(pChance + deltaPct / 100, 0, caps.chance);
        }
        if (rnd() < pChance) {
            ctx.parrySucceeded = true;
            ctx.damageAfterParry = 0;
            if (IE.incrementSkillMoveUsage && CS && typeof CS.getParryProficiencyUsageKey === 'function') {
                var uk = CS.getParryProficiencyUsageKey(pctx.parrySkillId);
                if (uk) IE.incrementSkillMoveUsage(pctx.parrySkillId, uk, 1);
            }
            if (typeof CP.logParryRollSuccess === 'function') CP.logParryRollSuccess();
            emitCombat(phase.buff_event_ok || 'parry_roll_succeeded', ['parry', 'parry_roll'], { parry_skill_id: pctx.parrySkillId }, ctx.eventIdSuffix);
        } else {
            ctx.parrySucceeded = false;
            ctx.damageAfterParry = ctx.rawDamage * (1 - pReduce);
            if (typeof CP.logParryRollFail === 'function') CP.logParryRollFail(Math.round((1 - pReduce) * 1000) / 10 + '%');
            emitCombat(phase.buff_event_fail || 'parry_roll_failed', ['parry', 'parry_roll'], { shunt_ratio: pReduce }, ctx.eventIdSuffix);
            emitCombat(phase.buff_event_shunt || 'parry_shunt_applied', ['parry', 'parry_shunt'], { shunt_ratio: pReduce }, ctx.eventIdSuffix);
        }
        return ctx;
    }

    function phasePostEffectsHook(ctx) {
        if (global.CombatPostEffects && typeof global.CombatPostEffects.runPostEffectsForHook === 'function') {
            global.CombatPostEffects.runPostEffectsForHook(ctx, 'hit_roll_success');
        }
        return ctx;
    }

    function getDiqiHutiShieldReducePct() {
        var CS = global.CombatSkills;
        if (!CS || typeof CS.getSkill !== 'function') return 0.25;
        var sk = CS.getSkill('combat_basic_breath');
        if (!sk || !sk.hub_actions || !sk.hub_actions.length) return 0.25;
        var hi;
        for (hi = 0; hi < sk.hub_actions.length; hi++) {
            var h = sk.hub_actions[hi];
            if (h && h.id === 'diqi_huti' && h.shield_tri_type_damage_reduce_pct != null) {
                var p = Number(h.shield_tri_type_damage_reduce_pct);
                return (isFinite(p) && p >= 0) ? p : 0.25;
            }
        }
        return 0.25;
    }

    /** 防方为玩家时消耗护体盾减伤；非玩家或无 Survival 则透传 */
    function phaseDiqiShieldPlayer(ctx, phase) {
        var d = ctx.defender;
        var baseD = ctx.damageAfterParry != null ? ctx.damageAfterParry : ctx.rawDamage;
        baseD = Math.max(0, Number(baseD) || 0);
        ctx.damageBeforeDiqiShield = baseD;
        if (!d || d.kind !== 'player' || baseD <= 0) {
            ctx.damageAfterDiqiShield = baseD;
            ctx.diqiShieldAbsorbed = 0;
            return ctx;
        }
        var Surv = global.Survival;
        if (!Surv || typeof Surv.applyDiqiShieldToDamage !== 'function') {
            ctx.damageAfterDiqiShield = baseD;
            ctx.diqiShieldAbsorbed = 0;
            return ctx;
        }
        var pct = getDiqiHutiShieldReducePct();
        var r = Surv.applyDiqiShieldToDamage(baseD, pct);
        ctx.damageAfterDiqiShield = r.outDamage;
        ctx.diqiShieldAbsorbed = r.absorbed;
        if (r.absorbed > 0) {
            emitCombat('diqi_shield_absorbed', ['combat', 'diqi_shield', 'damage'], {
                absorbed: r.absorbed,
                damage_in: baseD,
                damage_out: r.outDamage
            }, ctx.eventIdSuffix || 'shield');
        }
        return ctx;
    }

    function phaseDamageStub(ctx, phase) {
        var dmg = ctx.damageAfterDiqiShield != null ? ctx.damageAfterDiqiShield : (ctx.damageAfterParry != null ? ctx.damageAfterParry : ctx.rawDamage);
        ctx.finalDamage = dmg;
        if (phase.buff_event_name) {
            emitCombat(phase.buff_event_name, ['attack', 'damage'], {
                damage_final: dmg,
                parry_succeeded: !!ctx.parrySucceeded,
                move_id: ctx.moveId
            }, ctx.eventIdSuffix);
        }
        return ctx;
    }

    var builtins = {
        'builtin.emit_hit_roll': phaseEmitHitRoll,
        'builtin.parry_enemy_simple': phaseParryEnemySimple,
        'builtin.parry_player_combat_parry': phaseParryPlayerCombatParry,
        'builtin.post_effects_hook': phasePostEffectsHook,
        'builtin.diqi_shield_player': phaseDiqiShieldPlayer,
        'builtin.damage_stub': phaseDamageStub
    };

    function runPipeline(pipelineName, ctx) {
        var pipe = config.pipelines && config.pipelines[pipelineName];
        if (!pipe || !pipe.phases) return ctx;
        ctx.pipelineName = pipelineName;
        var i;
        for (i = 0; i < pipe.phases.length; i++) {
            var phase = pipe.phases[i];
            var h = phase.handler;
            var fn = customHandlers[h] || builtins[h];
            if (fn) ctx = fn(ctx, phase) || ctx;
        }
        return ctx;
    }

    global.CombatPipeline = {
        setConfig: setConfig,
        getConfig: getConfig,
        registerPhaseHandler: registerPhaseHandler,
        runPipeline: runPipeline,
        getParryCaps: getParryCaps
    };
})(typeof window !== 'undefined' ? window : this);
