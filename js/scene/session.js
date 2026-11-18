/**
 * SceneSession — 地图就绪后的读档、新角色与活动恢复.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {

            function afterMaps() {
                if (window.DeathSystem && window.DeathSystem.isSessionBlocked()) {
                    window.DeathSystem.resume(); return;
                }
                if (window.SaveSystem && typeof window.SaveSystem.loadRealtime === 'function') {
                    var ok = window.SaveSystem.loadRealtime();
                    if (ok && window.DeathSystem) window.DeathSystem.resume();
                    if (ok) {
                        // 读档成功后，确保 UI 状态与角色数据一致。
                        window.SceneCharacter.hideCreationOverlay();
                        window.SceneCharacter.updateRoleNameFromCharacter();
                        window.SceneAccess.syncIntroShellUi();
                        if (window.GameLog) window.GameLog.log('[SaveSystem] loaded realtime save', 'system');
                    } else {
                        // 新档自动播放首次对话；结束后再创角。
                        window.SceneCharacter.hideCreationOverlay();
                        window.SceneAccess.syncIntroShellUi();
                    }
                    if (window.InventoryEquipment && typeof window.InventoryEquipment.ensureCombatBasicsMigrated === 'function') {
                        window.InventoryEquipment.ensureCombatBasicsMigrated();
                    }
                    if (!ok && window.Survival && typeof window.Survival.initBattleResourcesFull === 'function') {
                        window.Survival.initBattleResourcesFull();
                    }
                }
                CookingStation.syncCookingTempStationsIntoMaps();
                // 读档后：若存在进行中制作，恢复自动 tick 推进
                if ((!window.DeathSystem || !window.DeathSystem.blocked()) && (!window.BedSleep || !window.BedSleep.isActive()) && (!window.GymSystem || !window.GymSystem.isActive())) {
                    if (StationContext.getCurrentPharmacyStationContext() && PharmacyStation.getActiveCraft()) window.StationActions.startPharmacyCraftIdleIfNeeded();
                    else if (StationContext.getCurrentCookingStationContext()) window.StationActions.startCookingCraftIdleIfNeeded();
                }
                // 读档后再渲染一次，避免出现“短暂默认状态闪屏”。
                window.SceneMapView.render();
                if (window.NPCSystem && window.NPCSystem.resumeOpening) return window.NPCSystem.resumeOpening();
            }

    function initialize() {

    }

    function bind() {

    }

    window.SceneSession = {
        initialize: initialize,
        bind: bind,
        afterMaps: afterMaps
    };
})(window);
