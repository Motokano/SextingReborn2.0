/**
 * SceneStartup — 启动时序与已加载模块的依赖接线.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {

    function init() {
        // SceneHud 刷新通道：注册本闭包内面板刷新实现（P0 组合根化拆解）。
        // 内部调用与外部模块（buff-system/npc-system/scene-renderer/scene-systems）
        // 均已改走 SceneHud.refresh('status')；旧 SceneCtx.updateStatusPanel 兼容桥已删除（③-1）。
        if (window.SceneHud && typeof window.SceneHud.register === 'function') {
            window.SceneHud.register('status', window.SceneStatusPanel.updateStatusPanel);
            window.SceneHud.register('backpack', window.InventoryPanel.updateBackpackPanel);
            window.SceneHud.subscribe('status', function () {
                if (window.InventoryPanel.backpackPanelOpen && !window.SveltePanels) window.InventoryPanel.updateBackpackPanel();
            });
        }
        // 站点模块 UI 依赖注入（P1c-2 DI 基座）：搬入模块的函数经 deps 调主 JS 闭包 infra，
        // 不把 ui/showMsg/render 等塞进 window。
        var stationUiDeps = {
            ui: window.SceneFeedback.ui,
            showMsg: window.SceneFeedback.showMsg,
            render: window.SceneMapView.render,
            markCellDirty: window.SceneMapView.markCellDirty,
            registerCookingProcessor: window.StationActions.registerCookingRecipeProcessorIfNeeded,
            registerPharmacyProcessor: window.StationActions.registerPharmacyRecipeProcessorIfNeeded,
            recalcCharacterStats: window.SceneCharacter.recalcCharacterStatsFromIE,
            stopCookingIdle: window.StationActions.stopCookingCraftIdle,
            stopPharmacyIdle: window.StationActions.stopPharmacyCraftIdle,
            refreshCookingPanel: function () {
                if (window.CookingStationPanel && typeof window.CookingStationPanel.refreshIfOpen === 'function') window.CookingStationPanel.refreshIfOpen();
            },
            refreshPharmacyPanel: function () {
                if (window.PharmacyStationPanel && typeof window.PharmacyStationPanel.refreshIfOpen === 'function') window.PharmacyStationPanel.refreshIfOpen();
            },
            'getCurrentCookingStationContext': StationContext.getCurrentCookingStationContext,
            'getCurrentPharmacyStationContext': StationContext.getCurrentPharmacyStationContext
        };
        if (window.CookingStation && typeof window.CookingStation.setUiDeps === 'function') {
            window.CookingStation.setUiDeps(stationUiDeps);
        }
        if (window.PharmacyStation && typeof window.PharmacyStation.setUiDeps === 'function') {
            window.PharmacyStation.setUiDeps(stationUiDeps);
        }
        // 制药调试：药瘾 +10（k242 状态行联调）
        window.SceneDebug.bindPharmacyDebug();
        // 烹饪站面板（②）：依赖注入 + 事件绑定
        if (window.CookingStationPanel && typeof window.CookingStationPanel.setUiDeps === 'function') {
            window.CookingStationPanel.setUiDeps({
                ui: window.SceneFeedback.ui,
                showMsg: window.SceneFeedback.showMsg,
                render: window.SceneMapView.render,
                tryCookAtStation: window.StationActions.tryCookAtStation,
                canPourWaterAtCurrentTile: window.StationActions.canPourWaterAtCurrentTile,
                canAddFuelAtCurrentTile: window.StationActions.canAddFuelAtCurrentTile,
                onPourWaterClick: window.StationActions.onPourWaterClick,
                onAddFuelClick: window.StationActions.onAddFuelClick,
                isPreCreationGameplayRestricted: window.SceneAccess.isPreCreationGameplayRestricted,
                showIntroBlockedMsg: window.SceneAccess.showIntroBlockedMsg,
                guardPlayerComaBlocked: window.SceneAccess.guardPlayerComaBlocked
            });
        }
        if (window.CookingStationPanel && typeof window.CookingStationPanel.init === 'function') {
            window.CookingStationPanel.init();
        }
        // 沤肥站面板（②）：依赖注入
        if (window.CompostPanel && typeof window.CompostPanel.setUiDeps === 'function') {
            window.CompostPanel.setUiDeps({
                ui: window.SceneFeedback.ui,
                showMsg: window.SceneFeedback.showMsg,
                render: window.SceneMapView.render,
                recalcCharacterStats: window.SceneCharacter.recalcCharacterStatsFromIE,
                isPreCreationGameplayRestricted: window.SceneAccess.isPreCreationGameplayRestricted,
                showIntroBlockedMsg: window.SceneAccess.showIntroBlockedMsg,
                guardPlayerComaBlocked: window.SceneAccess.guardPlayerComaBlocked
            });
        }
        // 制药站面板（②）：依赖注入 + 事件绑定
        if (window.PharmacyStationPanel && typeof window.PharmacyStationPanel.setUiDeps === 'function') {
            window.PharmacyStationPanel.setUiDeps({
                ui: window.SceneFeedback.ui,
                showMsg: window.SceneFeedback.showMsg,
                render: window.SceneMapView.render,
                tryPharmacyAtStation: window.StationActions.tryPharmacyAtStation,
                tryCompoundAtStation: window.StationActions.tryCompoundAtStation,
                isPreCreationGameplayRestricted: window.SceneAccess.isPreCreationGameplayRestricted,
                showIntroBlockedMsg: window.SceneAccess.showIntroBlockedMsg,
                guardPlayerComaBlocked: window.SceneAccess.guardPlayerComaBlocked
            });
        }
        if (window.PharmacyStationPanel && typeof window.PharmacyStationPanel.init === 'function') {
            window.PharmacyStationPanel.init();
        }
        // 敌人世界模拟（P2）：CombatWorld 依赖注入（ui + 世界 tick 计数）
        if (window.CombatWorld && typeof window.CombatWorld.setUiDeps === 'function') {
            window.CombatWorld.setUiDeps({
                ui: window.SceneFeedback.ui,
                getWorldTotalTicks: window.WorldTick.getWorldTotalTicks
            });
        }
        // 物品使用规则（P6）：ItemUse 依赖注入（ui 文案取词）
        if (window.ItemUse && typeof window.ItemUse.setUiDeps === 'function') {
            window.ItemUse.setUiDeps({ ui: window.SceneFeedback.ui });
        }
        // 场景 UI 工具（P5）：SceneUi 依赖注入（ui 文案取词）
        if (window.SceneUi && typeof window.SceneUi.setUiDeps === 'function') {
            window.SceneUi.setUiDeps({ ui: window.SceneFeedback.ui });
        }
        // 畜牧技能簇（livestock-state 模块）：recalc 依赖注入
        if (window.LivestockState && typeof window.LivestockState.setUiDeps === 'function') {
            window.LivestockState.setUiDeps({ recalcCharacterStats: window.SceneCharacter.recalcCharacterStatsFromIE });
        }
        window.SceneWindows.registerUiWindows();
        return Promise.all([window.SceneConfig.loadConfig(), window.DungeonRuntime ? window.DungeonRuntime.ready : null,
            window.SaveSystem && window.SaveSystem.ready, window.DeathSystem && window.DeathSystem.ready,
            window.GymSystem && window.GymSystem.ready, window.GymSceneArt && window.GymSceneArt.ready]).then(function () {
            window.SceneStatusPanel.setupCombatEngagementFeedback();
            // i18n 已就绪（UIText.setDict 已完成）后再进行地图合并渲染
            if (window.SaveSystem && typeof window.SaveSystem.init === 'function') {
                window.SaveSystem.init();
            }
            // 世界 tick 后置：烹饪/制药/制肥/农业等（单一 patch，避免重复结算）
            window.WorldTick.patchSurvivalTickForWorldSystemsOnce();
            var mapsPromise = window.SceneMapView.bootstrapMapsFromJson();

            var mapsReady = Promise.resolve(mapsPromise).then(window.SceneSession.afterMaps);
            // The formal pawn is supplied by PlayerPawnRig / SceneCharacter.
            // Optional directional portraits remain unset until a caller supplies real assets.
            if (window.GameLog) window.GameLog.log(window.SceneFeedback.ui('log.system.enter.scene'), 'system');
            window.SceneCtx.actions = window.SceneCtx.actions || {};
            window.SceneCtx.actions.turnToward = window.SceneMovement.turnToward;
            window.SceneCtx.actions.waitInPlace = window.SceneMovement.waitInPlace;
            window.SceneCtx.actions.tryMoveTo = window.SceneMovement.tryMoveTo;
            window.SceneCtx.actions.attackEnemy = window.CombatExchange.attackEnemy;
            window.SceneCtx.actions.interactNpc = window.SceneMovement.interactNpc;
            window.SceneCtx.actions.tryIntentMove = window.SceneMovement.tryIntentMove;
            window.SceneCtx.actions.tryFootworkNieBuJump = window.SceneMovement.tryFootworkNieBuJump;
            window.SceneCtx.actions.startGatheringIdle = window.PlayerActions.onGatherClick;
            window.SceneCtx.actions.stopGatheringIdle = window.PlayerActions.stopGatheringIdleFromScene;
            window.SceneCtx.actions.canTakeWaterAtCurrentTile = window.StationActions.canTakeWaterAtCurrentTile;
            window.SceneCtx.actions.canAddFuelAtCurrentTile = window.StationActions.canAddFuelAtCurrentTile;
            window.SceneCtx.actions.canPourWaterAtCurrentTile = window.StationActions.canPourWaterAtCurrentTile;
            window.SceneCtx.actions.onEngineChanged = window.SceneMovement.onEngineChanged;

            window.PlayerActions.bindReadyControls();

            if (window.SceneSystems && typeof window.SceneSystems.init === 'function') window.SceneSystems.init();
            window.PlayerActions.bindQuickBarPinSlotsOnce();
            if (window.SceneRenderer) window.SceneRenderer.render();
            return mapsReady;
        }).catch(function (error) { window.SceneMapView.render(); throw error; });
    }

    function initialize() {

    }

    function bind() {

    }

    window.SceneStartup = {
        initialize: initialize,
        bind: bind,
        init: init
    };
})(window);
