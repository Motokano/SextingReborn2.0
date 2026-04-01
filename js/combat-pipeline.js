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

    function normalizeDir(v) {
        var n = Number(v);
        if (!isFinite(n)) return 4;
        n = Math.round(n) % 8;
        if (n < 0) n += 8;
        return n;
    }

    function dirToVec(dir) {
        switch (normalizeDir(dir)) {
            case 0: return { x: 0, y: -1 };
            case 1: return { x: 1, y: -1 };
            case 2: return { x: 1, y: 0 };
            case 3: return { x: 1, y: 1 };
            case 4: return { x: 0, y: 1 };
            case 5: return { x: -1, y: 1 };
            case 6: return { x: -1, y: 0 };
            case 7: return { x: -1, y: -1 };
            default: return { x: 0, y: 1 };
        }
    }

    function classifyHitArcByFacing(attackerPos, defenderPos, defenderFacingDir) {
        var ax = attackerPos && attackerPos.x != null ? Number(attackerPos.x) : NaN;
        var ay = attackerPos && attackerPos.y != null ? Number(attackerPos.y) : NaN;
        var dx = defenderPos && defenderPos.x != null ? Number(defenderPos.x) : NaN;
        var dy = defenderPos && defenderPos.y != null ? Number(defenderPos.y) : NaN;
        if (!isFinite(ax) || !isFinite(ay) || !isFinite(dx) || !isFinite(dy)) {
            return { arc: 'front', angleDeg: 0 };
        }
        var toAtkX = ax - dx;
        var toAtkY = ay - dy;
        if (!toAtkX && !toAtkY) return { arc: 'front', angleDeg: 0 };
        var fv = dirToVec(defenderFacingDir);
        var lenA = Math.sqrt(fv.x * fv.x + fv.y * fv.y) || 1;
        var lenB = Math.sqrt(toAtkX * toAtkX + toAtkY * toAtkY) || 1;
        var c = (fv.x * toAtkX + fv.y * toAtkY) / (lenA * lenB);
        if (c > 1) c = 1;
        if (c < -1) c = -1;
        var angleDeg = Math.acos(c) * 180 / Math.PI;
        if (angleDeg <= 45) return { arc: 'front', angleDeg: angleDeg };
        if (angleDeg <= 120) return { arc: 'side', angleDeg: angleDeg };
        return { arc: 'back', angleDeg: angleDeg };
    }

    function ensureDirectionalHitCtx(ctx) {
        if (!ctx) return { arc: 'front', angleDeg: 0 };
        if (ctx.directionalHit && ctx.directionalHit.arc) return ctx.directionalHit;
        var atk = ctx.attacker || {};
        var def = ctx.defender || {};
        var r = classifyHitArcByFacing(atk.pos, def.pos, def.facingDir);
        ctx.directionalHit = r;
        ctx.attackerStrikeArc = r.arc;
        ctx.defenderHitArc = r.arc;
        return r;
    }

    function recordDirectionalCombatSnapshot(ctx, finalDamage) {
        if (!global.SceneCtx) return;
        var d = ensureDirectionalHitCtx(ctx || {});
        var tick = 0;
        if (global.GameTime && typeof global.GameTime.getState === 'function') {
            var gts = global.GameTime.getState();
            tick = gts && gts.totalTicks != null ? Number(gts.totalTicks) || 0 : 0;
        }
        global.SceneCtx.lastCombatDirectional = {
            tick: tick,
            attacker_strike_arc: d.arc || 'front',
            defender_hit_arc: d.arc || 'front',
            relative_angle_deg: Math.round(d.angleDeg || 0),
            attacker_kind: ctx && ctx.attacker ? String(ctx.attacker.kind || '') : '',
            defender_kind: ctx && ctx.defender ? String(ctx.defender.kind || '') : '',
            final_damage: Math.max(0, Math.floor(Number(finalDamage) || 0))
        };
    }

    function isSimultaneousDryRun(ctx) {
        return !!(ctx && ctx.simultaneousDryRun);
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

    /**
     * 读取 combat-skills 招式 on_hit_roll_success_apply_buff_actor / target，
     * 在命中 roll 成功后对己方/受击方施加 Buff（先叠层再进入招架，见 08 / 11）。
     */
    function phaseApplyMoveHitRollBuffs(ctx, phase) {
        if (!ctx || ctx.hitRollSuccess === false) return ctx;
        var CS = global.CombatSkills;
        var BS = global.BuffSystem;
        if (!CS || typeof CS.getSkill !== 'function' || !BS || typeof BS.applyBuff !== 'function') return ctx;
        var sk = CS.getSkill(ctx.skillId);
        if (!sk || !Array.isArray(sk.moves)) return ctx;
        var move = null;
        var mi;
        for (mi = 0; mi < sk.moves.length; mi++) {
            if (sk.moves[mi] && sk.moves[mi].id === ctx.moveId) {
                move = sk.moves[mi];
                break;
            }
        }
        if (!move) return ctx;
        var tick = 0;
        if (global.GameTime && typeof global.GameTime.getState === 'function') {
            var gts = global.GameTime.getState();
            tick = gts && gts.totalTicks != null ? Number(gts.totalTicks) || 0 : 0;
        } else if (global.Survival && typeof global.Survival.getState === 'function') {
            var s0 = global.Survival.getState();
            tick = s0 && s0.tickCount != null ? Number(s0.tickCount) || 0 : 0;
        }
        var evCtx = { tick: tick };
        var src = 'move_' + String(ctx.moveId || '') + '_' + String(ctx.eventIdSuffix || '');
        var atk = ctx.attacker || {};
        var actorOwner = 'player';
        if (atk.kind === 'enemy' && atk.enemyId != null) actorOwner = String(atk.enemyId);
        else if (atk.kind === 'player') actorOwner = 'player';
        if (isSimultaneousDryRun(ctx)) {
            ctx.pendingBuffApplies = ctx.pendingBuffApplies || [];
            if (move.on_hit_roll_success_apply_buff_actor) {
                ctx.pendingBuffApplies.push({ owner: actorOwner, buffId: move.on_hit_roll_success_apply_buff_actor, src: src, evCtx: evCtx });
            }
            if (move.on_hit_roll_success_apply_buff_target) {
                var defDry = ctx.defender || {};
                var targetOwnerDry = 'player';
                if (defDry.kind === 'enemy' && defDry.enemyId != null) targetOwnerDry = String(defDry.enemyId);
                else if (defDry.kind === 'player') targetOwnerDry = 'player';
                ctx.pendingBuffApplies.push({ owner: targetOwnerDry, buffId: move.on_hit_roll_success_apply_buff_target, src: src, evCtx: evCtx });
            }
            return ctx;
        }
        if (move.on_hit_roll_success_apply_buff_actor) {
            BS.applyBuff(actorOwner, move.on_hit_roll_success_apply_buff_actor, src, evCtx);
        }
        if (move.on_hit_roll_success_apply_buff_target) {
            var def = ctx.defender || {};
            var targetOwner = 'player';
            if (def.kind === 'enemy' && def.enemyId != null) targetOwner = String(def.enemyId);
            else if (def.kind === 'player') targetOwner = 'player';
            BS.applyBuff(targetOwner, move.on_hit_roll_success_apply_buff_target, src, evCtx);
        }
        return ctx;
    }

    function phaseEmitHitRoll(ctx, phase) {
        if (global.CombatVariants && typeof global.CombatVariants.applyToActiveContext === 'function') {
            global.CombatVariants.applyToActiveContext(ctx);
        }
        if (ctx && ctx.defender && ctx.defender.kind === 'player' && isPlayerInSitMeditationState()) {
            // 行气/调息中被选为受击目标：命中强制成功，并标记本 tick 行气收益作废。
            ctx.hitRollSuccess = true;
            if (global.Survival && typeof global.Survival.interruptSitMeditationThisTick === 'function') {
                global.Survival.interruptSitMeditationThisTick();
            }
            ctx.sitMeditationInterrupted = true;
        }
        ctx.hitRollSuccess = ctx.hitRollSuccess !== false;
        if (phase.buff_event_name && !isSimultaneousDryRun(ctx)) {
            var dirInfo = ensureDirectionalHitCtx(ctx);
            emitCombat(phase.buff_event_name, ['attack', 'hit_roll', 'subhit', 'hit_arc_' + dirInfo.arc], {
                move_id: ctx.moveId,
                skill_id: ctx.skillId,
                hit_roll_success: ctx.hitRollSuccess,
                defender_kind: ctx.defender && ctx.defender.kind,
                sit_meditation_interrupted: !!ctx.sitMeditationInterrupted,
                attacker_facing_dir: ctx.attacker && ctx.attacker.facingDir,
                defender_facing_dir: ctx.defender && ctx.defender.facingDir,
                attacker_strike_arc: dirInfo.arc,
                defender_hit_arc: dirInfo.arc,
                relative_angle_deg: Math.round(dirInfo.angleDeg || 0)
            }, ctx.eventIdSuffix || ctx.moveId);
        }
        return ctx;
    }

    function phaseParryEnemySimple(ctx, phase) {
        if (global.CombatVariants && typeof global.CombatVariants.applyToParryContext === 'function') {
            global.CombatVariants.applyToParryContext(ctx);
        }
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
            if (!isSimultaneousDryRun(ctx)) {
                emitCombat(phase.buff_event_parry_ok || 'parry_roll_succeeded', ['parry', 'parry_roll'], { defender_kind: 'enemy' }, ctx.eventIdSuffix);
            }
        } else {
            ctx.parrySucceeded = false;
            ctx.damageAfterParry = ctx.rawDamage * (1 - red);
            if (!isSimultaneousDryRun(ctx)) {
                emitCombat(phase.buff_event_parry_fail || 'parry_roll_failed', ['parry', 'parry_roll'], { shunt_ratio: red }, ctx.eventIdSuffix);
                emitCombat('parry_shunt_applied', ['parry', 'parry_shunt'], { shunt_ratio: red }, ctx.eventIdSuffix);
            }
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
            if (!isSimultaneousDryRun(ctx)) {
                emitCombat(phase.buff_event_skip || 'parry_phase_skipped', ['parry', 'parry_skip'], { reason: 'sit_meditation_interrupted' }, ctx.eventIdSuffix);
            }
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
        var isDes;
        if (ctx.defender && typeof ctx.defender.isBodyPartDestroyed === 'function') {
            isDes = ctx.defender.isBodyPartDestroyed;
        } else if (ctx.defender && ctx.defender.kind === 'player' && global.CharacterAttributes
            && typeof global.CharacterAttributes.isBodyPartDestroyedForParry === 'function') {
            isDes = global.CharacterAttributes.isBodyPartDestroyedForParry;
        } else {
            isDes = function () { return false; };
        }
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
            if (!isSimultaneousDryRun(ctx)) {
                emitCombat(phase.buff_event_skip || 'parry_phase_skipped', ['parry', 'parry_skip'], { reason: pctx.reason, guard_limb: pctx.guardLimb }, ctx.eventIdSuffix);
            }
            return ctx;
        }
        ctx.guardLimb = pctx.guardLimb;
        ctx.parrySkillId = pctx.parrySkillId;
        if (global.InventoryEquipment && typeof global.InventoryEquipment.getParryVariantIdsForLimb === 'function') {
            ctx.defender = ctx.defender || {};
            ctx.defender.parryVariantIds = global.InventoryEquipment.getParryVariantIdsForLimb(pctx.guardLimb);
        }
        if (global.CombatVariants && typeof global.CombatVariants.applyToParryContext === 'function') {
            global.CombatVariants.applyToParryContext(ctx);
        }
        var isTorso = CP.isTorsoHit && CP.isTorsoHit(ctx.hitPart);
        if (typeof CP.logParryGuardLimb === 'function') CP.logParryGuardLimb(ctx.hitPart, pctx.guardLimb, !!isTorso);
        if (!isSimultaneousDryRun(ctx)) {
            emitCombat(phase.buff_event_guard || 'parry_guard_limb_resolved', ['parry', 'parry_guard', isTorso ? 'torso_guard' : 'limb_struck'], {
                hit_part: ctx.hitPart,
                guard_limb: pctx.guardLimb,
                parry_skill_id: pctx.parrySkillId
            }, ctx.eventIdSuffix);
        }
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
            if (!isSimultaneousDryRun(ctx)) {
                emitCombat(phase.buff_event_ok || 'parry_roll_succeeded', ['parry', 'parry_roll'], { parry_skill_id: pctx.parrySkillId }, ctx.eventIdSuffix);
            }
        } else {
            ctx.parrySucceeded = false;
            ctx.damageAfterParry = ctx.rawDamage * (1 - pReduce);
            if (typeof CP.logParryRollFail === 'function') CP.logParryRollFail(Math.round((1 - pReduce) * 1000) / 10 + '%');
            if (!isSimultaneousDryRun(ctx)) {
                emitCombat(phase.buff_event_fail || 'parry_roll_failed', ['parry', 'parry_roll'], { shunt_ratio: pReduce }, ctx.eventIdSuffix);
                emitCombat(phase.buff_event_shunt || 'parry_shunt_applied', ['parry', 'parry_shunt'], { shunt_ratio: pReduce }, ctx.eventIdSuffix);
            }
        }
        return ctx;
    }

    function phasePostEffectsHook(ctx) {
        if (isSimultaneousDryRun(ctx)) return ctx;
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
    /** 敌人防方：内功% × 身体减伤% × 部位伤害类型微调（与 08 / 10-enemies 对齐） */
    function phaseEnemyDamageMitigation(ctx, phase) {
        var def = ctx.defender || {};
        if (def.kind !== 'enemy') {
            ctx.damageAfterEnemyMitigation = null;
            return ctx;
        }
        if (!ctx.hitRollSuccess) {
            ctx.damageAfterEnemyMitigation = 0;
            return ctx;
        }
        var d = ctx.damageAfterParry != null ? ctx.damageAfterParry : ctx.rawDamage;
        d = Math.max(0, Number(d) || 0);
        var inner = typeof def.inner_damage_reduce === 'number' ? def.inner_damage_reduce : 0;
        var body = typeof def.body_damage_reduce === 'number' ? def.body_damage_reduce : 0;
        inner = clamp(inner, 0, 1);
        body = clamp(body, 0, 1);
        d = d * (1 - inner) * (1 - body);
        var dmgType = ctx.damageType || 'blunt';
        var modKey = ctx.hitPartModifierKey;
        if (!modKey && global.CombatMeleeResolve && typeof global.CombatMeleeResolve.mapHitPartToModifierKey === 'function') {
            modKey = global.CombatMeleeResolve.mapHitPartToModifierKey(ctx.hitPart || 'chest');
        }
        var M = 1;
        if (global.CharacterAttributes && typeof global.CharacterAttributes.getDamageTypeModifier === 'function') {
            M = global.CharacterAttributes.getDamageTypeModifier(modKey || 'chest', dmgType);
        }
        d *= M;
        ctx.damageAfterEnemyMitigation = d;
        if (global.GameLog && typeof global.GameLog.log === 'function' && global.UIText && typeof global.UIText.t === 'function') {
            try {
                global.GameLog.log(global.UIText.t('log.combat.resolve.enemy_mit', {
                    inner: String(Math.round(inner * 1000) / 10),
                    body: String(Math.round(body * 1000) / 10),
                    mType: String(Math.round(M * 1000) / 1000),
                    dmg: String(Math.round(d * 100) / 100)
                }), 'damage');
            } catch (eM) { /* ignore */ }
        }
        return ctx;
    }

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
        if (r.absorbed > 0 && !isSimultaneousDryRun(ctx)) {
            emitCombat('diqi_shield_absorbed', ['combat', 'diqi_shield', 'damage'], {
                absorbed: r.absorbed,
                damage_in: baseD,
                damage_out: r.outDamage
            }, ctx.eventIdSuffix || 'shield');
        }
        return ctx;
    }

    function phaseDamageStub(ctx, phase) {
        if (ctx.hitRollSuccess === false) {
            ctx.finalDamage = 0;
            if (isSimultaneousDryRun(ctx)) {
                ctx.simultaneousPendingDamage = {
                    defenderKind: (ctx.defender && ctx.defender.kind) || '',
                    finalDamage: 0,
                    ctxRef: ctx
                };
                return ctx;
            }
            if (phase.buff_event_name) {
                var dirInfoMiss = ensureDirectionalHitCtx(ctx);
                emitCombat(phase.buff_event_name, ['attack', 'damage', 'miss', 'hit_arc_' + dirInfoMiss.arc], {
                    damage_final: 0,
                    parry_succeeded: !!ctx.parrySucceeded,
                    move_id: ctx.moveId,
                    attacker_facing_dir: ctx.attacker && ctx.attacker.facingDir,
                    defender_facing_dir: ctx.defender && ctx.defender.facingDir,
                    attacker_strike_arc: dirInfoMiss.arc,
                    defender_hit_arc: dirInfoMiss.arc,
                    relative_angle_deg: Math.round(dirInfoMiss.angleDeg || 0)
                }, ctx.eventIdSuffix);
            }
            if (global.CombatEnemies && typeof global.CombatEnemies.onEnemyDamageResolved === 'function') {
                global.CombatEnemies.onEnemyDamageResolved(ctx);
            }
            recordDirectionalCombatSnapshot(ctx, 0);
            return ctx;
        }
        var def = ctx.defender || {};
        var dmg;
        if (def.kind === 'enemy' && ctx.damageAfterEnemyMitigation != null) {
            dmg = ctx.damageAfterEnemyMitigation;
        } else {
            dmg = ctx.damageAfterDiqiShield != null ? ctx.damageAfterDiqiShield : (ctx.damageAfterParry != null ? ctx.damageAfterParry : ctx.rawDamage);
        }
        if (ctx.forceZeroDamageByResourceInsufficient) {
            dmg = 0;
        }
        dmg = Math.max(0, Math.floor(Number(dmg) || 0));
        ctx.finalDamage = dmg;
        if (isSimultaneousDryRun(ctx)) {
            ctx.simultaneousPendingDamage = {
                defenderKind: (ctx.defender && ctx.defender.kind) || '',
                finalDamage: dmg,
                ctxRef: ctx
            };
            return ctx;
        }
        if (phase.buff_event_name) {
            var dirInfoDmg = ensureDirectionalHitCtx(ctx);
            emitCombat(phase.buff_event_name, ['attack', 'damage', 'hit_arc_' + dirInfoDmg.arc], {
                damage_final: dmg,
                parry_succeeded: !!ctx.parrySucceeded,
                move_id: ctx.moveId,
                attacker_facing_dir: ctx.attacker && ctx.attacker.facingDir,
                defender_facing_dir: ctx.defender && ctx.defender.facingDir,
                attacker_strike_arc: dirInfoDmg.arc,
                defender_hit_arc: dirInfoDmg.arc,
                relative_angle_deg: Math.round(dirInfoDmg.angleDeg || 0)
            }, ctx.eventIdSuffix);
        }
        if (global.CombatEnemies && typeof global.CombatEnemies.onEnemyDamageResolved === 'function') {
            global.CombatEnemies.onEnemyDamageResolved(ctx);
        }
        recordDirectionalCombatSnapshot(ctx, dmg);
        return ctx;
    }

    /**
     * 同速同时提交（单侧）：后遗症 → 落地伤害 → 补发战斗 Buff 事件（须先 flushPendingBuffApplies）。
     */
    function finalizeSimultaneousStrike(ctx) {
        if (!ctx || !ctx.simultaneousPendingDamage) return;
        var p = ctx.simultaneousPendingDamage;
        var sub = p.ctxRef || ctx;
        sub.finalDamage = p.finalDamage;
        if (global.CombatPostEffects && typeof global.CombatPostEffects.runPostEffectsForHook === 'function') {
            global.CombatPostEffects.runPostEffectsForHook(sub, 'hit_roll_success');
        }
        if (p.defenderKind === 'enemy' && global.CombatEnemies && typeof global.CombatEnemies.onEnemyDamageResolved === 'function') {
            global.CombatEnemies.onEnemyDamageResolved(sub);
        }
        if (!global.BuffSystem || typeof global.BuffSystem.triggerBuffPipeline !== 'function') return;
        var tick = 0;
        if (global.GameTime && typeof global.GameTime.getState === 'function') {
            var gts = global.GameTime.getState();
            tick = gts && gts.totalTicks != null ? Number(gts.totalTicks) || 0 : 0;
        } else if (global.Survival && typeof global.Survival.getState === 'function') {
            var s0 = global.Survival.getState();
            tick = s0 && s0.tickCount != null ? Number(s0.tickCount) || 0 : 0;
        }
        var dirInfoCommit = ensureDirectionalHitCtx(sub);
        global.BuffSystem.triggerBuffPipeline({
            event_kind: 'combat',
            event_name: 'attack_hit_roll_resolved',
            event_id: 'cp_commit_hit_' + tick + '_' + String(sub.eventIdSuffix || sub.moveId || ''),
            tags: ['attack', 'hit_roll', 'subhit', 'hit_arc_' + dirInfoCommit.arc],
            payload: {
                move_id: sub.moveId,
                skill_id: sub.skillId,
                hit_roll_success: sub.hitRollSuccess,
                defender_kind: sub.defender && sub.defender.kind,
                attacker_facing_dir: sub.attacker && sub.attacker.facingDir,
                defender_facing_dir: sub.defender && sub.defender.facingDir,
                attacker_strike_arc: dirInfoCommit.arc,
                defender_hit_arc: dirInfoCommit.arc,
                relative_angle_deg: Math.round(dirInfoCommit.angleDeg || 0)
            }
        });
        var miss = sub.hitRollSuccess === false;
        global.BuffSystem.triggerBuffPipeline({
            event_kind: 'combat',
            event_name: 'attack_damage_applied',
            event_id: 'cp_commit_dmg_' + tick + '_' + String(sub.eventIdSuffix || sub.moveId || ''),
            tags: miss ? ['attack', 'damage', 'miss', 'hit_arc_' + dirInfoCommit.arc] : ['attack', 'damage', 'hit_arc_' + dirInfoCommit.arc],
            payload: {
                damage_final: p.finalDamage,
                parry_succeeded: !!sub.parrySucceeded,
                move_id: sub.moveId,
                attacker_facing_dir: sub.attacker && sub.attacker.facingDir,
                defender_facing_dir: sub.defender && sub.defender.facingDir,
                attacker_strike_arc: dirInfoCommit.arc,
                defender_hit_arc: dirInfoCommit.arc,
                relative_angle_deg: Math.round(dirInfoCommit.angleDeg || 0)
            }
        });
        recordDirectionalCombatSnapshot(sub, p.finalDamage);
    }

    function flushPendingBuffApplies(ctx) {
        if (!ctx || !ctx.pendingBuffApplies || !ctx.pendingBuffApplies.length) return;
        var BS = global.BuffSystem;
        if (!BS || typeof BS.applyBuff !== 'function') return;
        var i;
        for (i = 0; i < ctx.pendingBuffApplies.length; i++) {
            var b = ctx.pendingBuffApplies[i];
            if (!b || !b.buffId) continue;
            try {
                BS.applyBuff(b.owner, b.buffId, b.src, b.evCtx || {});
            } catch (eB) { /* ignore */ }
        }
        ctx.pendingBuffApplies = [];
    }

    var builtins = {
        'builtin.emit_hit_roll': phaseEmitHitRoll,
        'builtin.apply_move_hit_roll_buffs': phaseApplyMoveHitRollBuffs,
        'builtin.parry_enemy_simple': phaseParryEnemySimple,
        'builtin.parry_player_combat_parry': phaseParryPlayerCombatParry,
        'builtin.post_effects_hook': phasePostEffectsHook,
        'builtin.enemy_damage_mitigation': phaseEnemyDamageMitigation,
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
        getParryCaps: getParryCaps,
        finalizeSimultaneousStrike: finalizeSimultaneousStrike,
        flushPendingBuffApplies: flushPendingBuffApplies
    };
})(typeof window !== 'undefined' ? window : this);
