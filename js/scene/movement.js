/**
 * SceneMovement — 移动、等待、交互意图与蹑步.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var E = window.GameEngine;
    var IE = window.InventoryEquipment;

    function computeMoveStaminaCost() {
        var base = 0.25;
        try {
            if (window.CharacterAttributes && typeof window.CharacterAttributes.getCfg === 'function') {
                var b = Number(window.CharacterAttributes.getCfg('move_stamina_base', 0.25));
                if (isFinite(b) && b > 0) base = b;
            }
        } catch (eB) { /* ignore */ }
        var shoeMod = 0;
        if (window.InventoryEquipment && typeof window.InventoryEquipment.getShoeSharedMods === 'function') {
            try { shoeMod = Number(window.InventoryEquipment.getShoeSharedMods().moveCostMod) || 0; } catch (eS) { shoeMod = 0; }
        }
        var cost = base * (1 + shoeMod);
        try {
            var IEw = window.InventoryEquipment;
            var CAw = window.CharacterAttributes;
            if (IEw && typeof IEw.getCurrentCarryWeight === 'function' && CAw && typeof CAw.getCarryCapacity === 'function') {
                var W = Number(IEw.getCurrentCarryWeight()) || 0;
                var Wmax = Number(CAw.getCarryCapacity()) || 1;
                if (W > Wmax && Wmax > 0) {
                    var k = 20;
                    try {
                        var kk = Number(window.CharacterAttributes.getCfg('move_stamina_overload_k', 20));
                        if (isFinite(kk) && kk >= 0) k = kk;
                    } catch (eK) { /* ignore */ }
                    cost = cost * (1 + k * ((W - Wmax) / Wmax));
                }
            }
        } catch (eO) { /* ignore */ }
        return Math.max(0.01, Math.round(cost * 100) / 100);
    }

    function getStepStaminaCost(moving) {
        var cost = computeMoveStaminaCost();
        if (moving && window.InjurySystem) cost *= window.InjurySystem.moveMultiplier('player');
        return window.Survival && window.Survival.getActionStaminaCost ? window.Survival.getActionStaminaCost(cost) : cost;
    }
    function turnToward(dx, dy) {
                if (window.SceneAccess.isStoryMovementLocked()) return false;
                if (window.SceneAccess.guardPlayerComaBlocked()) return false;
                if (window.SceneAccess.guardPlayerActionBlocked(window.SceneAccess.ACTION_TYPES.MOVE)) return false;
                var ddx = Math.sign(Number(dx) || 0);
                var ddy = Math.sign(Number(dy) || 0);
                if (!ddx && !ddy) return false;
                window.SceneMapView.setFacingFromMove(ddx, ddy);
                window.PlayerActions.stopGatheringIdle();
                // The current formal rules do not charge time for an in-place facing change.
                // Keep that behavior here instead of inventing a new world tick cost.
                if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
                return true;
            }

    function waitInPlace() {
                var S = window.Survival;
                if (!S || S.isDead() || window.SceneAccess.isStoryMovementLocked()) return false;
                var cost = getStepStaminaCost();
                S.advanceTick({ source: 'wait' });
                S.consumeStamina(cost, { source: 'wait', raw: true });
                window.PlayerActions.setRestingActionActive(false, { showMsg: false });
                window.PlayerActions.stopGatheringIdle();
                return true;
            }

    function tryMoveTo(tx, ty, dx, dy) {
                if (window.SceneAccess.isStoryMovementLocked()) return;
                if (window.SceneAccess.guardPlayerComaBlocked()) return;
                if (window.WarehouseActions.isHideoutWarehouseConstructionLive()) {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('hideout_warehouse.move.blocked'), 'info');
                    return;
                }
                var ac = CookingStation.getActiveCraft();
                if (ac) {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.move.blocked', { n: ac.remaining_ticks }), 'info');
                    return;
                }
                if (window.SceneAccess.guardPlayerActionBlocked(window.SceneAccess.ACTION_TYPES.MOVE)) return;
                // 移动耗体力（k17 补全，05 5.5.4）：每格 = 配置基础消耗 × (1+鞋moveCostMod) × 超重系数；体力不足无法移动
                var moveStaminaCost = getStepStaminaCost(true);
                var survSt = (window.Survival && typeof window.Survival.getState === 'function') ? window.Survival.getState() : null;
                if (moveStaminaCost > 0 && survSt && Number(survSt.stamina || 0) < moveStaminaCost) {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.info.move_no_stamina'), 'warn');
                    return;
                }
                var st = E.getState();
                var ddx = (dx != null) ? dx : (tx - st.x);
                var ddy = (dy != null) ? dy : (ty - st.y);
                var fromX = st.x;
                var fromY = st.y;
                if (E.moveTo(tx, ty)) {
                    if (moveStaminaCost > 0 && window.Survival && typeof window.Survival.consumeStamina === 'function') {
                        window.Survival.consumeStamina(moveStaminaCost, { source: 'movement', raw: true });
                    }
                    var restStoppedByMove = window.PlayerActions.setRestingActionActive(false, { showMsg: false });
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode(fromX, fromY);
                    }
                    window.SceneMapView.setFacingFromMove(ddx, ddy);
                    window.PlayerActions.stopGatheringIdle();
                    if (restStoppedByMove) window.SceneFeedback.showMsg(window.SceneFeedback.ui('player.action.rest.cancelled_by_move'), 'info');
                    if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                        window.SceneCtx.pushDirtyCell(fromX, fromY);
                        window.SceneCtx.pushDirtyCell(tx, ty);
                    }
                    if (window.SceneAnimation && typeof window.SceneAnimation.emit === 'function') {
                        window.SceneAnimation.emit('move:step', {
                            mapId: st.mapId,
                            fromX: fromX,
                            fromY: fromY,
                            toX: tx,
                            toY: ty,
                            dx: ddx,
                            dy: ddy
                        });
                    }
                }
            }

    function interactNpc(npcId) {
                if (window.SceneAccess.guardPlayerComaBlocked()) return;
                if (window.SceneAccess.guardPlayerActionBlocked(window.SceneAccess.ACTION_TYPES.NPC_INTERACT)) return;
                if (typeof window.SceneFeedback.showMsg === 'function' && !(window.DungeonCheckpoint && window.DungeonCheckpoint.isKeeper(npcId))) window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.system.try.interact.npc', { npcId: npcId }), 'system');
                if (window.NPCSystem && typeof window.NPCSystem.openMenu === 'function') window.NPCSystem.openMenu(npcId);
            }

    function tryIntentMove(tx, ty, dx, dy, source) {
                if (window.DungeonRuntime && window.DungeonRuntime.active()) {
                    window.DungeonRuntime.cancel();
                    if (window.DungeonPanel && window.DungeonPanel.interactAt(tx, ty)) return;
                }
                if (window.SceneAccess.isStoryMovementLocked()) return;
                if (window.SceneAccess.guardPlayerComaBlocked()) return;
                if (window.WarehouseActions.isHideoutWarehouseConstructionLive()) {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('hideout_warehouse.move.blocked'), 'info');
                    return;
                }
                var st = E.getState();
                var ddx = (dx != null) ? dx : (tx - st.x);
                var ddy = (dy != null) ? dy : (ty - st.y);
                if (!ddx && !ddy) return;
                if (Math.abs(ddx) > 1 || Math.abs(ddy) > 1) {
                    var distantEnemy = E.getEnemyAt(tx,ty);
                    if (distantEnemy) window.SceneCtx.actions.attackEnemy(distantEnemy,{source:source,x:tx,y:ty,fromX:st.x,fromY:st.y});
                    return;
                }
                var targetX = st.x + ddx;
                var targetY = st.y + ddy;

                // Inspection is deliberate: walking into the wall never reveals it.
                var wallMap = E.getMap();
                var wallInspection = wallMap && wallMap.inspectable_walls && wallMap.inspectable_walls[targetX + ',' + targetY];
                if (wallInspection && !E.isWalkable(targetX, targetY)) {
                    if (source === 'click' && !window.SceneAccess.guardPlayerActionBlocked(window.SceneAccess.ACTION_TYPES.NPC_INTERACT)) {
                        if (window.GymEntrancePanel && window.GymEntrancePanel.show(targetX, targetY)) return;
                        window.SceneFeedback.showMsg(window.SceneFeedback.ui(wallInspection.message_key), 'info');
                    }
                    return;
                }

                // 固定优先级：敌人攻击 > NPC 对话 > 烹饪台互动 > 制药台互动 > 制肥桶互动 > 普通移动
                var enemyId = (typeof E.getEnemyAt === 'function') ? E.getEnemyAt(targetX, targetY) : null;
                if (!enemyId && window.CombatBreath && window.CombatBreath.active()) {
                    var chargeEnemy = E.getEnemyAt(st.x + ddx * 2, st.y + ddy * 2);
                    if (chargeEnemy) { targetX = st.x + ddx * 2; targetY = st.y + ddy * 2; enemyId = chargeEnemy; }
                }
                if (enemyId) {
                    if (window.SceneAccess.isPreCreationGameplayRestricted()) {
                        window.SceneAccess.showIntroBlockedMsg();
                        return;
                    }
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode();
                    }
                    if (window.SceneCtx.actions && typeof window.SceneCtx.actions.attackEnemy === 'function') {
                        window.SceneCtx.actions.attackEnemy(enemyId, {
                            source: source || 'unknown',
                            x: targetX,
                            y: targetY,
                            fromX: st.x,
                            fromY: st.y
                        });
                    }
                    window.SceneMapView.setFacingFromMove(ddx, ddy);
                    window.PlayerActions.stopGatheringIdle();
                    return;
                }

                var npcId = (typeof E.getInteractNpcIdAt === 'function')
                    ? E.getInteractNpcIdAt(targetX, targetY)
                    : ((typeof E.getNpcAt === 'function') ? E.getNpcAt(targetX, targetY) : null);
                if (npcId && window.GameTime && window.NPCSystem && typeof window.NPCSystem.isNpcPresentNow === 'function') {
                    if (!window.NPCSystem.isNpcPresentNow(npcId)) npcId = null;
                }
                if (npcId) {
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode();
                    }
                    if (window.SceneCtx.actions && typeof window.SceneCtx.actions.interactNpc === 'function') {
                        window.SceneCtx.actions.interactNpc(npcId);
                    }
                    window.SceneMapView.setFacingFromMove(ddx, ddy);
                    window.PlayerActions.stopGatheringIdle();
                    return;
                }

                // 烹饪台：若地图未绑定设施 NPC，则邻格点灶格仍直接打开烹饪面板；已绑定则走上方 interactNpc 管线（与林经理同套菜单 + 闲聊）
                var cookingCell = (typeof E.isCookingStationCell === 'function') && E.isCookingStationCell(targetX, targetY);
                var cookingBoundNpc = cookingCell && typeof E.getCookingStationInteractNpcId === 'function'
                    ? E.getCookingStationInteractNpcId(targetX, targetY)
                    : null;
                if (cookingCell && !cookingBoundNpc) {
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode();
                    }
                    if (typeof CookingStationPanel.open === 'function') {
                        CookingStationPanel.open();
                    }
                    window.SceneMapView.setFacingFromMove(ddx, ddy);
                    window.PlayerActions.stopGatheringIdle();
                    return;
                }

                // 制药台：未绑定设施 NPC 时邻格点台格直接打开面板；已绑定则走上方 interactNpc（闲聊 +「使用制药台」）
                var pharmacyCell = (typeof E.isPharmacyStationCell === 'function') && E.isPharmacyStationCell(targetX, targetY);
                var pharmacyBoundNpc = pharmacyCell && typeof E.getPharmacyStationInteractNpcId === 'function'
                    ? E.getPharmacyStationInteractNpcId(targetX, targetY)
                    : null;
                if (pharmacyCell && !pharmacyBoundNpc) {
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode();
                    }
                    if (typeof PharmacyStationPanel.open === 'function') {
                        PharmacyStationPanel.open();
                    }
                    window.SceneMapView.setFacingFromMove(ddx, ddy);
                    window.PlayerActions.stopGatheringIdle();
                    return;
                }

                // 制肥桶：未绑定设施 NPC 时邻格点桶格直接打开面板；已绑定则走上方 interactNpc。
                var compostCell = (typeof E.isCompostStationCell === 'function') && E.isCompostStationCell(targetX, targetY);
                var compostBoundNpc = compostCell && typeof E.getCompostStationInteractNpcId === 'function'
                    ? E.getCompostStationInteractNpcId(targetX, targetY)
                    : null;
                if (compostCell && !compostBoundNpc) {
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode();
                    }
                    if (typeof CompostPanel.open === 'function') {
                        CompostPanel.open();
                    }
                    window.SceneMapView.setFacingFromMove(ddx, ddy);
                    window.PlayerActions.stopGatheringIdle();
                    return;
                }

                if (window.SceneCtx.actions && typeof window.SceneCtx.actions.tryMoveTo === 'function') {
                    window.SceneCtx.actions.tryMoveTo(targetX, targetY, ddx, ddy);
                }
            }

    function tryFootworkNieBuJump(gx, gy) {
                if (window.SceneAccess.isStoryMovementLocked()) return false;
                if (window.SceneAccess.guardPlayerComaBlocked()) return false;
                if (window.SceneAccess.guardPlayerActionBlocked(window.SceneAccess.ACTION_TYPES.MOVE)) return false;
                if (window.SceneAccess.isPreCreationGameplayRestricted()) {
                    window.SceneAccess.showIntroBlockedMsg();
                    return false;
                }
                var SKILL_ID = 'combat_basic_footwork';
                var ACTION_ID = 'nie_bu';
                if (!window.SceneCtx || !window.SceneCtx.footworkNieBuMode) return false;
                var st0 = E.getState();
                var fromX = st0.x;
                var fromY = st0.y;
                if (gx === fromX && gy === fromY) return false;
                if (!IE || !IE.getSkillLevel || IE.getSkillLevel(SKILL_ID) < 1) {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('player.action.niebu.fail.no_skill'), 'info');
                    if (typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode(fromX, fromY);
                    }
                    window.SceneMapView.render();
                    return false;
                }
                var hubs = IE.getCombatState ? IE.getCombatState().hubs : null;
                if (!hubs || hubs.footwork !== SKILL_ID) {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('player.action.niebu.fail.hub'), 'info');
                    if (typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode(fromX, fromY);
                    }
                    window.SceneMapView.render();
                    return false;
                }
                var cdRem = IE.getHubActionCooldownRemaining ? IE.getHubActionCooldownRemaining(SKILL_ID, ACTION_ID) : 0;
                if (cdRem > 0) {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('player.action.niebu.fail.cooldown', { ticks: cdRem }), 'info');
                    return false;
                }
                var ha = null;
                var CS = window.CombatSkills;
                if (CS && typeof CS.getSkill === 'function') {
                    var skTpl = CS.getSkill(SKILL_ID);
                    if (skTpl && skTpl.hub_actions) {
                        for (var hi = 0; hi < skTpl.hub_actions.length; hi++) {
                            if (skTpl.hub_actions[hi].id === ACTION_ID) {
                                ha = skTpl.hub_actions[hi];
                                break;
                            }
                        }
                    }
                }
                var radius = ha && ha.leap_radius != null ? (parseInt(ha.leap_radius, 10) || 2) : 2;
                var cooldownTicks = ha && ha.cooldown_ticks != null ? (parseInt(ha.cooldown_ticks, 10) || 10) : 10;
                if (!E.jumpTo || !E.jumpTo(gx, gy, radius)) {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('player.action.niebu.fail.bad_target'), 'info');
                    return false;
                }
                if (IE.setHubActionCooldownRemaining) IE.setHubActionCooldownRemaining(SKILL_ID, ACTION_ID, cooldownTicks);
                var restStoppedByMove = window.PlayerActions.setRestingActionActive(false, { showMsg: false });
                window.PlayerActions.stopGatheringIdle();
                if (typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                    window.SceneCtx.exitFootworkNieBuMode(fromX, fromY, radius);
                }
                window.SceneMapView.setFacingFromMove(gx - fromX, gy - fromY);
                if (restStoppedByMove) window.SceneFeedback.showMsg(window.SceneFeedback.ui('player.action.rest.cancelled_by_move'), 'info');
                if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                    window.SceneCtx.pushDirtyCell(fromX, fromY);
                    window.SceneCtx.pushDirtyCell(gx, gy);
                }
                var stAfter = E.getState();
                if (window.SceneAnimation && typeof window.SceneAnimation.emit === 'function') {
                    window.SceneAnimation.emit('move:step', {
                        mapId: stAfter.mapId,
                        fromX: fromX,
                        fromY: fromY,
                        toX: stAfter.x,
                        toY: stAfter.y,
                        dx: stAfter.x - fromX,
                        dy: stAfter.y - fromY
                    });
                }
                if (window.Survival && typeof window.Survival.advanceTick === 'function') {
                    window.Survival.advanceTick({ source: 'movement' });
                }
                var tickSnap = window.Survival && typeof window.Survival.getState === 'function' ? window.Survival.getState().tickCount : 0;
                if (window.BuffSystem && typeof window.BuffSystem.triggerBuffPipeline === 'function') {
                    window.BuffSystem.triggerBuffPipeline({
                        event_kind: 'action',
                        event_name: 'footwork_nie_bu_resolved',
                        event_id: 'footwork_nie_bu_' + String(tickSnap) + '_' + fromX + '_' + fromY + '_' + gx + '_' + gy,
                        tags: ['footwork_nie_bu', 'hub_action', 'move'],
                        payload: {
                            hub_skill_id: SKILL_ID,
                            hub_action_id: ACTION_ID,
                            from_x: fromX,
                            from_y: fromY,
                            to_x: stAfter.x,
                            to_y: stAfter.y,
                            facing_dir: (window.PlayerFacing && typeof window.PlayerFacing.getDir === 'function') ? window.PlayerFacing.getDir() : 4
                        }
                    });
                }
                window.SceneMapView.render();
                return true;
            }

    function onEngineChanged() {
                if (window.DungeonRuntime) window.DungeonRuntime.observe();
                if (window.DungeonPanel) window.DungeonPanel.refresh();
                if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                    window.SceneCtx.exitFootworkNieBuMode();
                }
                if (window.PlayerActions.gatheringIdleTimer && window.PlayerActions.gatheringIdleAt) {
                    var st2 = E.getState();
                    if (st2.mapId !== window.PlayerActions.gatheringIdleAt.mapId || st2.x !== window.PlayerActions.gatheringIdleAt.x || st2.y !== window.PlayerActions.gatheringIdleAt.y)
                        window.PlayerActions.stopGatheringIdle();
                }
                window.SceneMapView.refreshRenderProfile();
                if (window.SceneRenderer) window.SceneRenderer.render();
            }

    function initialize() {

    }

    function bind() {

    }

    window.SceneMovement = {
        initialize: initialize,
        bind: bind,
        interactNpc: interactNpc,
        onEngineChanged: onEngineChanged,
        tryFootworkNieBuJump: tryFootworkNieBuJump,
        tryIntentMove: tryIntentMove,
        tryMoveTo: tryMoveTo,
        turnToward: turnToward,
        waitInPlace: waitInPlace
    };
})(window);
