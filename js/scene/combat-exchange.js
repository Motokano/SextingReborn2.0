/**
 * CombatExchange — 一轮交战：先后手、整招重复、同速提交、伤后重选与收束.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var E = window.GameEngine;
    var IE = window.InventoryEquipment;

    /**
     * 地图近战：按 limb_strike_order + cursor 顺序扫描选肢；招式来自该肢 move_sequences 轮询。
     * ctxMeta 同时给出 skill_id、limb_id、move_id 时不抽样、不推进光标。
     */
    function pickWorldMeleeAttackIntent(ctxMeta) {
        ctxMeta = ctxMeta || {};
        var out = { skillId: 'combat_basic_unarmed', moveId: null, limbId: 'lhand', advanceCursor: false };
        var IE = window.InventoryEquipment;
        var CS = window.CombatSkills;
        if (ctxMeta.skill_id != null && ctxMeta.limb_id != null && ctxMeta.move_id != null) {
            out.skillId = ctxMeta.skill_id;
            out.limbId = ctxMeta.limb_id;
            out.moveId = ctxMeta.move_id;
            out.advanceCursor = false;
            return out;
        }
        if (!IE || !CS || typeof IE.getCombatState !== 'function') return out;
        var weaponIntent = window.ModularWeaponCombat && window.ModularWeaponCombat.intent();
        if (weaponIntent) return weaponIntent;
        var cmb = IE.getCombatState();
        var LIMB_IDS = IE.COMBAT_LIMB_IDS || ['lhand', 'rhand', 'lfoot', 'rfoot'];
        var LIMB_LABEL_KEYS = { lhand: 'body.part.lhand', rhand: 'body.part.rhand', lfoot: 'body.part.lfoot', rfoot: 'body.part.rfoot' };

        function limbLabel(lid) {
            return window.SceneFeedback.ui(LIMB_LABEL_KEYS[lid] || lid);
        }

        function displaySkillName(skillId) {
            var sk0 = CS.getSkill(skillId);
            return (sk0 && sk0.name) ? sk0.name : String(skillId || '');
        }
        function displayMoveName(skillId, moveId) {
            if (!moveId) return '';
            var sk0 = CS.getSkill(skillId);
            if (!sk0 || !Array.isArray(sk0.moves)) return String(moveId);
            var mmi;
            for (mmi = 0; mmi < sk0.moves.length; mmi++) {
                var mvo = sk0.moves[mmi];
                if (mvo && mvo.id === moveId) return mvo.name || String(moveId);
            }
            return String(moveId);
        }

        function firstValidMoveForLimb(lid, skillId) {
            var bodyPart = {lhand:'left_arm',rhand:'right_arm',lfoot:'left_leg',rfoot:'right_leg'}[lid];
            if (window.CharacterAttributes && window.CharacterAttributes.isBodyPartDestroyedForParry(bodyPart)) return null;
            var pk = typeof IE.peekMoveIdForLimb === 'function' ? IE.peekMoveIdForLimb(lid) : null;
            var lv = IE.getSkillLevel(skillId);
            var un = CS.getUnlockedMoves(skillId, lv);
            var limbKeys = typeof window.getLimbActionTags === 'function' ? window.getLimbActionTags(lid) : [];
            if (typeof CS.moveAllowedOnLimbByTagKeys !== 'function') {
                var ids = {};
                var u;
                for (u = 0; u < un.length; u++) ids[un[u].id] = 1;
                if (pk && ids[pk]) return pk;
                return un.length ? un[0].id : null;
            }
            function moveOk(moveId) {
                if (!moveId) return false;
                var mi;
                for (mi = 0; mi < un.length; mi++) {
                    if (un[mi].id === moveId) return CS.moveAllowedOnLimbByTagKeys(un[mi], limbKeys);
                }
                return false;
            }
            if (pk && moveOk(pk)) return pk;
            var ui;
            for (ui = 0; ui < un.length; ui++) {
                if (CS.moveAllowedOnLimbByTagKeys(un[ui], limbKeys)) return un[ui].id;
            }
            return null;
        }

        var orderedLimbs = (typeof IE.getLimbStrikeOrderSlice === 'function')
            ? IE.getLimbStrikeOrderSlice()
            : ((typeof IE.getLimbStrikeOrder === 'function') ? IE.getLimbStrikeOrder() : LIMB_IDS.slice());
        if (!Array.isArray(orderedLimbs) || !orderedLimbs.length) orderedLimbs = LIMB_IDS.slice();
        var rawCursor = (typeof IE.getLimbStrikeOrderCursor === 'function') ? IE.getLimbStrikeOrderCursor() : 0;
        var cursor = Math.floor(Number(rawCursor) || 0);
        cursor = ((cursor % orderedLimbs.length) + orderedLimbs.length) % orderedLimbs.length;
        var scanOrder = [];
        var si;
        for (si = 0; si < orderedLimbs.length; si++) {
            scanOrder.push(orderedLimbs[(cursor + si) % orderedLimbs.length]);
        }

        var candidates = [];
        var li;
        for (li = 0; li < scanOrder.length; li++) {
            var lid = scanOrder[li];
            var limb = cmb.limbs && cmb.limbs[lid];
            if (!limb || !limb.active) continue;
            var sk = CS.getSkill(limb.active);
            if (!sk || (sk.category !== 'unarmed' && sk.category !== 'weapon')) continue;
            if (window.ModularWeaponCombat && window.ModularWeaponCombat.equipped() && sk.category !== 'unarmed') continue;
            var fm = firstValidMoveForLimb(lid, limb.active);
            if (!fm) continue;
            candidates.push({ lid: lid, skillId: limb.active });
        }

        if (!candidates.length) {
            out.skip = true;
            out.limbId = 'lhand';
            out.skillId = (cmb.limbs && cmb.limbs.lhand && cmb.limbs.lhand.active) ? cmb.limbs.lhand.active : 'combat_basic_unarmed';
            var fm0 = firstValidMoveForLimb(out.limbId, out.skillId);
            out.moveId = fm0 || 'jab';
            out.advanceCursor = false;
            if (window.GameLog && typeof window.GameLog.log === 'function') {
                window.GameLog.log(window.SceneFeedback.ui('log.combat.resolve.player_offense_skipped'), 'combat');
            }
            return out;
        }

        var picked = candidates[0];
        out.limbId = picked.lid;
        out.skillId = picked.skillId;
        out.moveId = firstValidMoveForLimb(picked.lid, picked.skillId);
        out.advanceCursor = ctxMeta.move_id == null;
        // Selection is a peek. Only an executed main move advances either cursor.

        var stepIdx = scanOrder.indexOf(picked.lid);
        if (stepIdx < 0) stepIdx = 0;
        var seqNameParts = [];
        var sqi;
        for (sqi = 0; sqi < orderedLimbs.length; sqi++) {
            seqNameParts.push(limbLabel(orderedLimbs[sqi]));
        }
        var metForbid = ctxMeta && ctxMeta.exchange_parry_limb_ids;
        var parryIdList;
        if (Array.isArray(metForbid) && metForbid.length) {
            parryIdList = metForbid.map(function (x) { return String(x).trim(); }).filter(Boolean);
        } else if (window.SceneCtx) {
            parryIdList = (window.SceneCtx.playerExchangeParryLimbs && window.SceneCtx.playerExchangeParryLimbs.length)
                ? window.SceneCtx.playerExchangeParryLimbs.slice() : [];
        } else {
            parryIdList = [];
        }
        var parryLabelParts = [];
        var pvi;
        for (pvi = 0; pvi < parryIdList.length; pvi++) {
            parryLabelParts.push(limbLabel(parryIdList[pvi]));
        }
        var noneTxt = window.SceneFeedback.ui('log.combat.resolve.limb_pick_strike_forbid_empty');
        if (window.GameLog && typeof window.GameLog.log === 'function') {
            window.GameLog.log(window.SceneFeedback.ui('log.combat.resolve.limb_pick_strike', {
                seq: seqNameParts.join(' → '),
                seqIds: orderedLimbs.join('、'),
                cursor: String(cursor),
                step: String(stepIdx),
                forbid: parryLabelParts.length ? parryLabelParts.join('、') : noneTxt,
                forbidId: parryIdList.length ? parryIdList.join('、') : noneTxt,
                picked: limbLabel(picked.lid),
                pickedId: String(picked.lid),
                skillLabel: displaySkillName(picked.skillId),
                skillId: String(picked.skillId),
                moveLabel: displayMoveName(picked.skillId, out.moveId),
                moveId: out.moveId != null ? String(out.moveId) : ''
            }), 'combat');
        }
        return out;
    }
    function attackEnemy(enemyId, ctxMeta) {
                if (window.SaveSystem && !window.SaveSystem.isAtomic()) {
                    var transaction=window.SaveSystem.runAtomicFor('combat',function(){return attackEnemy(enemyId,ctxMeta);});
                    if(!transaction.saved){window.SceneFeedback.showMsg('保存失败，本次战斗结算已还原。','warn');window.SceneHud.refresh('status');window.SceneMapView.render();}
                    return transaction.value;
                }
                if (window.SceneAccess.guardPlayerComaBlocked()) return;
                // 眩晕中（k13，37 §9.2）：本回合无法行动
                if (IE && typeof IE.consumePlayerStunRoundIfBlocking === 'function' && IE.consumePlayerStunRoundIfBlocking()) {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.log.stun_blocked_action'), 'warn');
                    return;
                }
                if (window.SceneAccess.isPreCreationGameplayRestricted()) {
                    window.SceneAccess.showIntroBlockedMsg();
                    return;
                }
                ctxMeta = ctxMeta || {};
                if (window.SceneCtx && typeof window.SceneCtx.clearPlayerExchangeLimbLocks === 'function') {
                    window.SceneCtx.clearPlayerExchangeLimbLocks();
                }
                var st = (E && typeof E.getState === 'function') ? E.getState() : null;
                if (window.SceneCtx) window.SceneCtx.lastAttackedEnemyId = enemyId != null ? String(enemyId) : null;
                if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                    window.SceneCtx.exitFootworkNieBuMode();
                }
                if (window.CombatPipeline && typeof window.CombatPipeline.runPipeline === 'function') {
                    var Meta = window.CombatMetaSkills;
                    var normalIntent = pickWorldMeleeAttackIntent(ctxMeta);
                    if (!normalIntent.skip && !Meta.hasAttackOpportunity(normalIntent,{x:ctxMeta.x,y:ctxMeta.y})) return;
                    var metaPlan = Meta.select(normalIntent, {x:ctxMeta.x,y:ctxMeta.y});
                    var intent = metaPlan.main;
                    if (intent.skip) { if (window.Survival) window.Survival.advanceTick(); window.SceneMapView.render(); return; }
                    var approachSkill = window.CombatSkills && window.CombatSkills.getSkill(intent.skillId || intent.skill_id);
                    var approachMove = approachSkill && (approachSkill.moves || []).filter(function(m){return m.id === (intent.moveId || intent.move_id);})[0];
                    if (!CombatWorld.preparePlayerApproach({x:ctxMeta.x,y:ctxMeta.y}, approachMove, intent.weaponId ? intent : null)) { Meta.suspend(metaPlan); return; }
                    st = E.getState(); ctxMeta.fromX = st.x; ctxMeta.fromY = st.y;
                    Meta.prepareMain(intent);
                    var defSpeed = 10;
                    var defenderBase = {
                        kind: 'enemy',
                        enemyId: enemyId,
                        mapId: st && st.mapId != null ? st.mapId : null,
                        index: CombatWorld.findEnemyInstanceIndex(enemyId, ctxMeta.x, ctxMeta.y),
                        parry_rate: ctxMeta.enemy_parry_rate != null ? Number(ctxMeta.enemy_parry_rate) : 0,
                        parry_damage_reduce: ctxMeta.enemy_parry_reduce != null ? Number(ctxMeta.enemy_parry_reduce) : 0
                    };
                    // 有效攻击已通过目标/距离入口校验：命中结算前立即建立交战与 AI 仇恨。
                    if (defenderBase.index >= 0) {
                        var mapAttack = E && typeof E.getMap === 'function' ? E.getMap() : null;
                        var protectTick = window.WorldTick.getWorldTotalTicks() + 1;
                        if (window.CombatEnemies && typeof window.CombatEnemies.forceAggro === 'function') {
                            window.CombatEnemies.forceAggro(mapAttack, defenderBase.index, protectTick);
                        }
                        if (window.CombatEngagement && typeof window.CombatEngagement.engageEnemy === 'function') {
                            window.CombatEngagement.engageEnemy({
                                mapId: defenderBase.mapId,
                                index: defenderBase.index,
                                enemyId: enemyId,
                                record: mapAttack && mapAttack.enemies ? mapAttack.enemies[defenderBase.index] : null,
                                reason: 'player_attack'
                            });
                        }
                    }
                    if (window.CombatEnemies && typeof window.CombatEnemies.mergeIntoDefender === 'function') {
                        window.CombatEnemies.mergeIntoDefender(defenderBase);
                    }
                    var enemyActionPlan = window.CombatEnemies.planAction(enemyId,defenderBase.mapId,defenderBase.index);
                    defenderBase.occupiedLimbs = enemyActionPlan.occupiedLimbs;
                    // The enemy's exchange opportunity is spent even if its planned move is later disabled.
                    CombatWorld.markCounterAttackFlag(CombatWorld.enemyCounterAttackFlagKey(enemyId,defenderBase.index));
                    if (defenderBase.speed != null && isFinite(Number(defenderBase.speed))) defSpeed = Number(defenderBase.speed);

                    var limbUse = intent.limbId;
                    var skUse = intent.skillId;
                    var mvUse = intent.moveId;

                    // 出招肢本 tick 禁止招架（肢体互斥）：攻击发起时就标记，不受先后手影响（combat-pipeline 311 读取）
                    if (window.SceneCtx) window.SceneCtx.playerExchangeAttackLimb = limbUse;

                    // 出手日志（结算前宣告攻击，避免“发动攻击”出现在结算之后）：用已确定的 skUse/mvUse/limbUse
                    var enemyLogLabel = enemyId;
                    try {
                        if (window.UIText && typeof window.UIText.t === 'function') {
                            enemyLogLabel = window.UIText.t('enemy.name.' + String(enemyId).replace(/\./g, '_'));
                        }
                    } catch (eLabel) { /* 无专用名时退回 id */ }
                    var skIdLog = skUse;
                    var mvIdLog = mvUse;
                    var limbIdLog = limbUse;
                    var modeTag = window.SceneFeedback.ui('log.system.attack.mode.auto');
                    try {
                        if (ctxMeta.skill_id != null && ctxMeta.limb_id != null && ctxMeta.move_id != null) {
                            modeTag = window.SceneFeedback.ui('log.system.attack.mode.explicit');
                        }
                    } catch (eMode) { /* ignore */ }
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.system.attack.enemy', {
                        enemyId: enemyLogLabel,
                        modeTag: modeTag,
                        limbLabel: limbIdLog ? window.SceneFeedback.ui('body.part.' + String(limbIdLog)) : '',
                        limbId: limbIdLog != null ? String(limbIdLog) : '',
                        skillLabel: skIdLog ? window.CombatSelection.getCombatSkillName(skIdLog) : '',
                        skillId: skIdLog != null ? String(skIdLog) : '',
                        moveLabel: (skIdLog && mvIdLog) ? window.CombatSelection.getMoveDisplayName(skIdLog, mvIdLog) : '',
                        moveId: mvIdLog != null ? String(mvIdLog) : ''
                    }), 'system');

                    // 读取该肢当前槽位成数（ctxMeta 显式传入时优先）
                    var _slotPwr = ctxMeta.power_level != null ? Number(ctxMeta.power_level) : null;
                    if (intent.metaSource) _slotPwr = intent.powerLevel;
                    if (intent.weaponId && _slotPwr == null) _slotPwr = intent.powerLevel;
                    if (_slotPwr == null && IE && typeof IE.peekMoveSlotIndexForLimb === 'function') {
                        var _slotPwrIdx = IE.peekMoveSlotIndexForLimb(limbUse);
                        if (_slotPwrIdx >= 0 && typeof IE.getMoveSlotPowerLevel === 'function') {
                            _slotPwr = IE.getMoveSlotPowerLevel(limbUse, _slotPwrIdx);
                        }
                    }

                    var postIds = ctxMeta.post_effect_ids;
                    if (!postIds && ctxMeta.post_effect_id) postIds = [ctxMeta.post_effect_id];
                    if ((!postIds || !postIds.length) && window.CombatInitiative && typeof window.CombatInitiative.getPlayerPostEffectIds === 'function') {
                        postIds = window.CombatInitiative.getPlayerPostEffectIds({
                            limbId: limbUse,
                            formTags: window.CombatSelection.getFormTagsForMove(skUse, mvUse)
                        });
                    }
                    if (!Array.isArray(postIds)) postIds = [];
                    if (intent.weaponId) postIds = [];
                    var defPostIds = Array.isArray(defenderBase.counter_post_effect_ids) ? defenderBase.counter_post_effect_ids : [];

                    var plSpeed = 1;
                    if (window.CharacterAttributes && typeof window.CharacterAttributes.getCombatSpeed === 'function') {
                        plSpeed = window.CharacterAttributes.getCombatSpeed();
                    }
                    var initPlan = { mode: 'sequential', firstStrike: 'player' };
                    if (window.CombatInitiative && typeof window.CombatInitiative.resolvePlayerInitiatedExchange === 'function') {
                        initPlan = window.CombatInitiative.resolvePlayerInitiatedExchange({
                            playerSpeed: plSpeed,
                            limbId: limbUse,
                            weaponId: intent.weaponId,
                            enemySpeed: defSpeed,
                            enemyOwnerId: defenderBase.ownerId,
                            attackerPostEffectIds: postIds,
                            defenderPostEffectIds: defPostIds,
                            skillId: skUse,
                            moveId: mvUse
                        });
                    }
                    var CP = window.CombatPipeline;
                    var CMR = window.CombatMeleeResolve;
                    var canEnemyCounter = defenderBase.can_attack !== false && !!enemyActionPlan.action;
                    var useSimultaneous = initPlan.mode === 'simultaneous' && canEnemyCounter
                        && CP && typeof CP.flushPendingBuffApplies === 'function'
                        && typeof CP.finalizeSimultaneousStrike === 'function'
                        && CMR && typeof CMR.applyDeferredResourceSpendFromResolveResult === 'function';
                    var enemyActsFirst = initPlan.firstStrike === 'enemy' && canEnemyCounter;

                    var defenderFacingDir = 4;
                    if (window.CombatEnemies && typeof window.CombatEnemies.ensureFacingTowardTarget === 'function') {
                        defenderFacingDir = window.CombatEnemies.ensureFacingTowardTarget(
                            enemyId,
                            st && st.mapId != null ? st.mapId : null,
                            ctxMeta.x,
                            ctxMeta.y,
                            ctxMeta.fromX,
                            ctxMeta.fromY
                        );
                    }

                    function buildPlayerAtkCtx(r0, postIdsArr, simDry, actionIntent) {
                        actionIntent = actionIntent || intent;
                        var rawDmg0 = r0 && isFinite(r0.rawDamage) ? r0.rawDamage : 10;
                        var hitOk0 = r0 ? !!r0.hitRollSuccess : (ctxMeta.hit_roll_success !== false);
                        var hitPt0 = r0 ? r0.hitPart : (ctxMeta.hit_part || 'chest');
                        var skId0 = r0 ? r0.skillId : (ctxMeta.skill_id || 'combat_basic_unarmed');
                        var mvId0 = r0 ? r0.moveId : (ctxMeta.move_id || 'jab');
                        var lmId0 = r0 ? r0.limbId : (ctxMeta.limb_id || 'lhand');
                        var dmgType0 = r0 ? r0.damageType : 'blunt';
                        var modKey0 = r0 ? r0.hitPartModifierKey : null;
                        var moveTags0 = window.CombatSelection.getFormTagsForMove(skId0, mvId0);
                        return {
                            eventIdSuffix: String(enemyId) + '_' + String(mvId0),
                            hitRollSuccess: hitOk0,
                            hitPart: hitPt0,
                            moveId: mvId0,
                            skillId: skId0,
                            limbId: lmId0,
                            damageType: dmgType0,
                            hitPartModifierKey: modKey0,
                            moveTags: moveTags0,
                            subhit_index: 0,
                            is_last_subhit: true,
                            segments: r0 && r0.segments && r0.segments.length > 1 ? r0.segments : null,
                            rawDamage: rawDmg0,
                            typedDamage: r0 && r0.typedDamage,
                            damageComponents: r0 && r0.damageComponents,
                            blockTargetEffects: !!(r0 && r0.blockTargetEffects),
                            actionConditionBonus: r0 && r0.actionConditionBonus,
                            resourceResult: r0,
                            proficiencyDelta: r0 ? r0.proficiencyDelta : 0,
                            weaponAction: r0 && r0.weaponAction,
                            moveTemplate: r0 && r0.moveTemplate,
                            forceZeroDamageByResourceInsufficient: !!(r0 && r0.forceZeroDamageByResourceInsufficient),
                            simultaneousDryRun: !!simDry,
                            attacker: {
                                kind: 'player',
                                facingDir: (window.PlayerFacing && typeof window.PlayerFacing.getDir === 'function') ? window.PlayerFacing.getDir() : 4,
                                pos: { x: ctxMeta.fromX, y: ctxMeta.fromY },
                                postEffectIds: Array.isArray(postIdsArr) ? postIdsArr.slice() : [],
                                activeVariantIds: actionIntent.weaponId
                                    ? (actionIntent.skillId === window.ModularWeaponCombat.SKILL ? [] : (window.ModularWeaponCombat.equipped().item.weapon_moves[actionIntent.weaponPosition].variants || []))
                                    : (window.InventoryEquipment && typeof window.InventoryEquipment.getActiveVariantIdsForLimb === 'function')
                                    ? window.InventoryEquipment.getActiveVariantIdsForLimb(lmId0)
                                    : []
                            },
                            defender: (function () {
                                var d0 = Object.assign({}, defenderBase);
                                d0.facingDir = defenderFacingDir;
                                d0.pos = { x: ctxMeta.x, y: ctxMeta.y };
                                return d0;
                            })()
                        };
                    }

                    var pipeName = ctxMeta.pipeline || 'melee_hit_enemy_defender';
                    var r = null;
                    var atkCtx = null;
                    var rEnemyCounter = null;
                    var atkCtxEnemy = null;
                    var modularExchange = !!intent.weaponId || !!metaPlan.entry || Meta.bindings().length > 0;
                    function commitMain() { Meta.prepareMain(intent); Meta.consume(metaPlan); if (intent.metaSource) Meta.beginTriggered(metaPlan); Meta.advance(intent); }
                    function resolveMain(extra) {
                        return CMR.resolvePlayerVsEnemyAttack(Object.assign({targetIndex:defenderBase.index,enemyId:enemyId,enemyMapId:defenderBase.mapId,
                            skillId:skUse,moveId:mvUse,limbId:limbUse,powerLevel:_slotPwr,attackerSpeed:window.CombatInitiative.playerAttackSpeed(initPlan.playerBaseSpeed,intent),
                            defenderSpeed:initPlan.enemySpeed,speedsResolved:true,weaponIntent:intent.weaponId?intent:null,
                            metaSource:intent.metaSource,costWaivers:intent.costWaivers}, extra || {}));
                    }
                    function runAppend() {
                        if (!metaPlan.started) return;
                        if (window.Survival.getState().isDead || IE.isPlayerStunned()
                            || window.CombatEnemies.isEnemyDead(defenderBase.mapId,defenderBase.index)) { Meta.cancelSelected(metaPlan,'sequence_interrupted'); return; }
                        var targetNow=E.getMap().enemies[defenderBase.index],extra=Meta.appendIntent(metaPlan,targetNow);
                        if (!extra) return;
                        Meta.beginTriggered(metaPlan);
                        var extraPosts=extra.weaponId?[]:window.CombatInitiative.getPlayerPostEffectIds({limbId:extra.limbId,formTags:window.CombatSelection.getFormTagsForMove(extra.skillId,extra.moveId)});
                        var extraResolve=CMR.resolvePlayerVsEnemyAttack({targetIndex:defenderBase.index,enemyId:enemyId,enemyMapId:defenderBase.mapId,skillId:extra.skillId,moveId:extra.moveId,
                            limbId:extra.limbId,powerLevel:extra.powerLevel,weaponIntent:extra.weaponId?extra:null,attackerSpeed:window.CombatInitiative.playerAttackSpeed(initPlan.playerBaseSpeed,extra),
                            defenderSpeed:initPlan.enemySpeed,speedsResolved:true,metaSource:extra.metaSource,costWaivers:extra.costWaivers});
                        if (extraResolve.notExecuted) return;
                        var extraCtx=buildPlayerAtkCtx(extraResolve,extraPosts,false,extra),currentPos=E.getState();
                        extraCtx.attacker.pos={x:currentPos.x,y:currentPos.y};extraCtx.defender.pos={x:targetNow.x,y:targetNow.y};
                        CP.runPipeline(pipeName,extraCtx);
                        if (extra.skillId!==window.ModularWeaponCombat.SKILL&&extraCtx.proficiencyDelta) IE.adjustSkillMoveUsage(extra.skillId,extra.moveId,Math.round(extraCtx.proficiencyDelta));
                    }
                    // Repeat the selected position, then advance its cycle once. Each strike pays separately.
                    function weaponRepeats() {
                        if (!modularExchange) return;
                        var count = Math.min(4, Math.max(1, Math.floor(initPlan.playerSpeed / initPlan.enemySpeed)));
                        for (var repeat = 1; repeat < count; repeat++) {
                            var usable = intent.weaponId ? window.ModularWeaponCombat.validIntent(intent)
                                : !window.CharacterAttributes.isBodyPartDestroyedForParry({lhand:'left_arm',rhand:'right_arm',lfoot:'left_leg',rfoot:'right_leg'}[limbUse]);
                            if (!usable || window.Survival.getState().isDead || IE.isPlayerStunned()
                                || window.CombatEnemies.isEnemyDead(defenderBase.mapId, defenderBase.index)) break;
                            var next = resolveMain({repeatIndex:repeat});
                            var repeatedCtx = CP.runPipeline(pipeName, buildPlayerAtkCtx(next, postIds, false));
                            if (skUse !== window.ModularWeaponCombat.SKILL && repeatedCtx.proficiencyDelta) IE.adjustSkillMoveUsage(skUse,mvUse,Math.round(repeatedCtx.proficiencyDelta));
                        }
                    }
                    function enemyWeaponExchangeRepeats() {
                        if (!modularExchange || !rEnemyCounter || rEnemyCounter.notExecuted) return;
                        var count = Math.min(4, Math.max(1, Math.floor(initPlan.enemySpeed / initPlan.playerSpeed)));
                        for (var repeat = 1; repeat < count; repeat++) {
                            if (window.Survival.getState().isDead || window.CombatEnemies.isEnemyStunned(defenderBase.mapId, defenderBase.index)
                                || window.CombatEnemies.isEnemyDead(defenderBase.mapId, defenderBase.index)) break;
                            var next = CMR.resolveEnemyVsPlayerAttack({enemyId:enemyId,attackerSpeed:initPlan.enemySpeed,defenderSpeed:initPlan.playerBaseSpeed,speedsResolved:true,
                                enemyMapId:defenderBase.mapId,enemyIndex:defenderBase.index});
                            if(next.notExecuted)break;
                            defenderBase.occupiedLimbs=Array.from(new Set(defenderBase.occupiedLimbs.concat(window.CombatEnemies.actionLimbs(enemyId,defenderBase.mapId,defenderBase.index,next.moveTemplate))));
                            CP.runPipeline('melee_hit_player_defender', CombatWorld.buildEnemyCounterAtkCtx(next,false,{enemyId:enemyId,facingDir:defenderFacingDir,ex:ctxMeta.x,ey:ctxMeta.y,px:ctxMeta.fromX,py:ctxMeta.fromY}));
                        }
                    }
                    // 敌人眩晕（k13，37 §9.2）：眩晕中本回合无法行动 → 跳过其本击还击/先手
                    var enemyStunnedNow = !!(window.CombatEnemies && typeof window.CombatEnemies.isEnemyStunned === 'function'
                        && defenderBase && window.CombatEnemies.isEnemyStunned(defenderBase.mapId, defenderBase.index));

                    if (useSimultaneous && CMR && typeof CMR.resolvePlayerVsEnemyAttack === 'function' && typeof CMR.resolveEnemyVsPlayerAttack === 'function') {
                        if (window.ModularWeaponCombat) window.ModularWeaponCombat.beginSimultaneous();
                        commitMain();
                        r = resolveMain({deferResourceSpend:true});
                        if (!enemyStunnedNow) {
                            rEnemyCounter = CMR.resolveEnemyVsPlayerAttack({
                                enemyId: enemyId,
                                plannedAction: enemyActionPlan.action,
                                deferResourceSpend: true,
                                attackerSpeed: defSpeed,
                                enemyMapId: defenderBase.mapId,
                                enemyIndex: defenderBase.index
                            });
                        }
                        atkCtx = buildPlayerAtkCtx(r, postIds, true);
                        if (!enemyStunnedNow) {
                            atkCtxEnemy = CombatWorld.buildEnemyCounterAtkCtx(rEnemyCounter, true, { enemyId: enemyId, facingDir: defenderFacingDir, ex: ctxMeta.x, ey: ctxMeta.y, px: ctxMeta.fromX, py: ctxMeta.fromY });
                        }
                        if (window.CombatFxEvents) {
                            atkCtx.fxGroupId = window.CombatFxEvents.nextGroupId();
                            if (atkCtxEnemy) atkCtxEnemy.fxGroupId = atkCtx.fxGroupId;
                        }
                        CP.runPipeline(pipeName, atkCtx);
                        if (atkCtxEnemy) CP.runPipeline('melee_hit_player_defender', atkCtxEnemy);
                        if (typeof CP.flushPendingBuffApplies === 'function') {
                            CP.flushPendingBuffApplies(atkCtx);
                            if (atkCtxEnemy) CP.flushPendingBuffApplies(atkCtxEnemy);
                        }
                        if (typeof CMR.applyDeferredResourceSpendFromResolveResult === 'function') {
                            CMR.applyDeferredResourceSpendFromResolveResult(r);
                            CMR.applyDeferredResourceSpendFromResolveResult(rEnemyCounter);
                        }
                        if (typeof CP.finalizeSimultaneousStrike === 'function') {
                            CP.finalizeSimultaneousStrike(atkCtx);
                            if (atkCtxEnemy) CP.finalizeSimultaneousStrike(atkCtxEnemy);
                            if (window.ModularWeaponCombat) window.ModularWeaponCombat.endSimultaneous();
                            CombatWorld.flushDisplacements({deferKills:true});
                        }
                        runAppend();
                        {
                            var _ckSim = CombatWorld.enemyCounterAttackFlagKey(enemyId, defenderBase.index);
                            if (_ckSim) window.CombatWorld.markCounterAttackFlag(_ckSim);
                        }
                    } else if (enemyActsFirst && CMR && typeof CMR.resolveEnemyVsPlayerAttack === 'function' && typeof CMR.resolvePlayerVsEnemyAttack === 'function') {
                        if (!enemyStunnedNow) {
                            rEnemyCounter = CMR.resolveEnemyVsPlayerAttack({
                                enemyId: enemyId,
                                plannedAction: enemyActionPlan.action,
                                attackerSpeed: defSpeed,
                                enemyMapId: defenderBase.mapId,
                                enemyIndex: defenderBase.index
                            });
                            atkCtxEnemy = CombatWorld.buildEnemyCounterAtkCtx(rEnemyCounter, false, { enemyId: enemyId, facingDir: defenderFacingDir, ex: ctxMeta.x, ey: ctxMeta.y, px: ctxMeta.fromX, py: ctxMeta.fromY });
                            CP.runPipeline('melee_hit_player_defender', atkCtxEnemy);
                            enemyWeaponExchangeRepeats();
                            {
                                var _ckEf = CombatWorld.enemyCounterAttackFlagKey(enemyId, defenderBase.index);
                                if (_ckEf) window.CombatWorld.markCounterAttackFlag(_ckEf);
                            }
                            if (window.GameLog && atkCtxEnemy.finalDamage != null && typeof window.GameLog.log === 'function') {
                                window.GameLog.log(window.SceneFeedback.ui('log.combat.resolve.summary', {
                                    dmg: String(Math.round(atkCtxEnemy.finalDamage)),
                                    parry: atkCtxEnemy.parrySucceeded ? window.SceneFeedback.ui('log.combat.pipeline.parry_yes') : window.SceneFeedback.ui('log.combat.pipeline.parry_no')
                                }) + window.SceneFeedback.ui('combat.log.first_strike_reply'), 'damage');
                            }
                        }
                        var playerBlocked = (window.Survival && window.Survival.getState().isDead) || (IE.consumePlayerStunRoundIfBlocking && IE.consumePlayerStunRoundIfBlocking());
                        if (!playerBlocked && !Meta.legal(intent,E.getMap().enemies[defenderBase.index],metaPlan.entry?.definition.mode==='replace')) {
                            // Re-select from the preserved unarmed cycle after the holding hand is lost.
                            // Initiative and repeat count remain those fixed before this exchange.
                            metaPlan = Meta.reselect(metaPlan,E.getMap().enemies[defenderBase.index],function(){return pickWorldMeleeAttackIntent({});});
                            intent = metaPlan.main;
                            playerBlocked = !!intent.skip;
                            skUse = intent.skillId; mvUse = intent.moveId; limbUse = intent.limbId;
                            _slotPwr = intent.weaponId ? intent.powerLevel : IE.getMoveSlotPowerLevel(limbUse, IE.peekMoveSlotIndexForLimb(limbUse));
                            postIds = intent.weaponId ? [] : window.CombatInitiative.getPlayerPostEffectIds({limbId:limbUse,formTags:window.CombatSelection.getFormTagsForMove(skUse,mvUse)});
                            if (window.SceneCtx) window.SceneCtx.playerExchangeAttackLimb = limbUse;
                        }
                        if (playerBlocked) {
                            Meta.suspend(metaPlan);
                            if (window.Survival) window.Survival.advanceTick();
                            window.SceneMapView.render(); return;
                        }
                        commitMain();
                        r = resolveMain();
                        atkCtx = buildPlayerAtkCtx(r, postIds, false);
                        CP.runPipeline(pipeName, atkCtx);
                        weaponRepeats();
                        runAppend();
                    } else {
                        commitMain();
                        if (!CMR || typeof CMR.resolvePlayerVsEnemyAttack !== 'function') {
                            atkCtx = buildPlayerAtkCtx(null, postIds, false);
                        } else {
                            r = resolveMain();
                            atkCtx = buildPlayerAtkCtx(r, postIds, false);
                        }
                        CP.runPipeline(pipeName, atkCtx);
                        weaponRepeats();
                        runAppend();
                        // 出招肢已在攻击发起时标记（playerExchangeAttackLimb），此处不再重复设置
                        // 07「先击杀即避免再挨对方本击」：玩家段把敌人打死 → 跳过敌人还击段
                        var enemyDeadNow = false;
                        try {
                            if (window.CombatEnemies && typeof window.CombatEnemies.isEnemyDead === 'function') {
                                enemyDeadNow = window.CombatEnemies.isEnemyDead(defenderBase.mapId, defenderBase.index);
                            }
                        } catch (eD) { /* ignore */ }
                        enemyStunnedNow = !!(window.CombatEnemies && window.CombatEnemies.isEnemyStunned(defenderBase.mapId, defenderBase.index));
                        if (canEnemyCounter && !enemyDeadNow && !enemyStunnedNow && CMR && typeof CMR.resolveEnemyVsPlayerAttack === 'function') {
                            rEnemyCounter = CMR.resolveEnemyVsPlayerAttack({
                                enemyId: enemyId,
                                plannedAction: enemyActionPlan.action,
                                attackerSpeed: defSpeed,
                                enemyMapId: defenderBase.mapId,
                                enemyIndex: defenderBase.index
                            });
                            atkCtxEnemy = CombatWorld.buildEnemyCounterAtkCtx(rEnemyCounter, false, { enemyId: enemyId, facingDir: defenderFacingDir, ex: ctxMeta.x, ey: ctxMeta.y, px: ctxMeta.fromX, py: ctxMeta.fromY });
                            CP.runPipeline('melee_hit_player_defender', atkCtxEnemy);
                            enemyWeaponExchangeRepeats();
                            {
                                var _ckNm = CombatWorld.enemyCounterAttackFlagKey(enemyId, defenderBase.index);
                                if (_ckNm) window.CombatWorld.markCounterAttackFlag(_ckNm);
                            }
                            if (window.GameLog && atkCtxEnemy.finalDamage != null && typeof window.GameLog.log === 'function') {
                                window.GameLog.log(window.SceneFeedback.ui('log.combat.resolve.summary', {
                                    dmg: String(Math.round(atkCtxEnemy.finalDamage)),
                                    parry: atkCtxEnemy.parrySucceeded ? window.SceneFeedback.ui('log.combat.pipeline.parry_yes') : window.SceneFeedback.ui('log.combat.pipeline.parry_no')
                                }) + window.SceneFeedback.ui('combat.log.reply'), 'damage');
                            }
                        }
                    }

                    var skId = atkCtx.skillId;
                    var mvId = atkCtx.moveId;
                    var hitOk = atkCtx.hitRollSuccess;
                    if (window.InventoryEquipment && typeof window.InventoryEquipment.adjustSkillMoveUsage === 'function') {
                        var pd = Number(atkCtx.proficiencyDelta);
                        if (isFinite(pd) && pd !== 0) {
                            window.InventoryEquipment.adjustSkillMoveUsage(skId, mvId, Math.round(pd));
                        }
                    }
                    if (window.GameLog && atkCtx.finalDamage != null) {
                        window.GameLog.log(window.SceneFeedback.ui('log.combat.resolve.summary', {
                            dmg: String(Math.round(atkCtx.finalDamage)),
                            parry: atkCtx.parrySucceeded ? window.SceneFeedback.ui('log.combat.pipeline.parry_yes') : window.SceneFeedback.ui('log.combat.pipeline.parry_no')
                        }), 'damage');
                    }
                    ctxMeta.damageText = hitOk ? String(Math.round(atkCtx.finalDamage != null ? atkCtx.finalDamage : 0)) : window.SceneFeedback.ui('log.combat.resolve.hit_miss');
                    CombatWorld.settleEnemyKills();
                }
                if (window.SceneAnimation && typeof window.SceneAnimation.emit === 'function') {
                    var stNow = E.getState ? E.getState() : null;
                    window.SceneAnimation.emit('combat:attack', {
                        resolvedFx: !!(atkCtx && atkCtx._fxSnapshot && atkCtx._fxSnapshot.emitted),
                        enemyId: enemyId,
                        x: ctxMeta.x,
                        y: ctxMeta.y,
                        fromX: ctxMeta.fromX != null ? ctxMeta.fromX : (stNow ? stNow.x : null),
                        fromY: ctxMeta.fromY != null ? ctxMeta.fromY : (stNow ? stNow.y : null),
                        source: ctxMeta.source || 'unknown',
                        damageText: ctxMeta.damageText != null ? ctxMeta.damageText : null
                    });
                }
                if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                    if (ctxMeta.fromX != null && ctxMeta.fromY != null) window.SceneCtx.pushDirtyCell(ctxMeta.fromX, ctxMeta.fromY);
                    if (ctxMeta.x != null && ctxMeta.y != null) window.SceneCtx.pushDirtyCell(ctxMeta.x, ctxMeta.y);
                }
                window.SceneMapView.bumpCombatRenderProfile(700);
                if (window.Survival && typeof window.Survival.advanceTick === 'function') {
                    window.Survival.advanceTick();
                }
                if (window.GameLog && ctxMeta.source === 'keyboard') {
                    window.GameLog.log(window.SceneFeedback.ui('log.system.attack.intent.keyboard'), 'info');
                }
                window.SceneMapView.render();
                SceneHud.refresh('status');
            }

    function initialize() {

    }

    function bind() {

    }

    window.CombatExchange = {
        initialize: initialize,
        bind: bind,
        attackEnemy: attackEnemy
    };
})(window);
