/**
 * ScenePublicApi — 既有 SceneApp 兼容出口；只转发，不新增玩法规则.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {

    function initialize() {

    }

    function bind() {

    // Expose entrypoints for bootstrap.js
    window.SceneApp = window.SceneApp || {};

    window.SceneApp.closePublicModal = window.SceneNavigation.closePublicModal;

    window.SceneApp.navigate = window.SceneNavigation.navigate;

    window.SceneApp.tryDrinkWaterFlask = window.ItemUseActions.tryDrinkWaterFlask;

    window.SceneApp.runContextAction = window.PlayerActions.runContextAction;

    window.SceneApp.actionMenu = window.PlayerActions.legacyActionMenu();

    window.SceneApp.creation = window.SceneCharacter.legacyCreation();

    window.SceneApp.init = window.SceneStartup.init;

    window.SceneApp.loadConfig = window.SceneConfig.loadConfig;

    window.SceneApp.tryUseItemFromContainer = window.ItemUseActions.tryUseItemFromContainer;

    window.SceneApp.tryEquipItemFromContainer = window.ItemUseActions.tryEquipItemFromContainer;

    window.SceneApp.render = window.SceneMapView.render;

    window.SceneApp.openCharacterCreationAfterIntro = window.SceneCharacter.openCharacterCreationAfterIntro;

    window.SceneApp.isStoryMovementLocked = window.SceneAccess.isStoryMovementLocked;

    window.SceneApp.isPreCreationGameplayRestricted = window.SceneAccess.isPreCreationGameplayRestricted;

    window.SceneApp.tryUseQuickBeltDigit = window.ItemUseActions.tryUseQuickBeltDigit;

    window.SceneApp.ACTION_TYPES = window.SceneAccess.ACTION_TYPES;

    window.SceneApp.isPlayerActionDisabledByBuff = window.SceneAccess.isPlayerActionDisabledByBuff;

    window.SceneApp.guardPlayerActionBlocked = window.SceneAccess.guardPlayerActionBlocked;

    window.SceneApp.tryCookAtStation = window.StationActions.tryCookAtStation;

    window.SceneApp.tryPharmacyAtStation = window.StationActions.tryPharmacyAtStation;

    window.SceneApp.tryCompoundAtStation = window.StationActions.tryCompoundAtStation;

    window.SceneApp.openCookingStationPanel = CookingStationPanel.open;

    window.SceneApp.closeCookingStationPanel = CookingStationPanel.close;

    window.SceneApp.openPharmacyStationPanel = PharmacyStationPanel.open;

    window.SceneApp.closePharmacyStationPanel = PharmacyStationPanel.close;

    window.SceneApp.openCompostStationPanel = CompostPanel.open;

    window.SceneApp.closeCompostStationPanel = CompostPanel.close;

    window.SceneApp.trySleepAtBed = window.PlayerActions.trySleepAtBed;

    window.SceneApp.getFacilityLaborTickMs = window.PlayerActions.getIdleTickMs;

    window.SceneApp.canWorkFacilityLabor = window.SceneAccess.canWorkFacilityLabor;

    window.SceneApp.prepareFacilityLabor = window.PlayerActions.prepareFacilityLabor;

    window.SceneApp.prepareFacilityAction = window.PlayerActions.prepareFacilityAction;

    window.SceneApp.prepareDungeonAction = window.SceneApp.prepareFacilityAction;

    window.SceneApp.prepareDeath = window.PlayerActions.prepareDeath;

    window.SceneApp.openAgriculturePanel = window.AgricultureActions.openAgriculturePanel;

    window.SceneApp.syncOutdoorFacilityPanels = window.AgricultureActions.syncOutdoorFacilityPanels;

    window.SceneApp.canUseOutdoorFacility = window.AgricultureActions.canUseOutdoorFacility;

    window.SceneApp.closeAgriculturePanel = window.AgricultureActions.closeAgriculturePanel;

    window.SceneApp.openLivestockPanel = window.LivestockActions.openLivestockPanel;

    window.SceneApp.closeLivestockPanel = window.LivestockActions.closeLivestockPanel;

    window.SceneApp.updateLivestockPanel = window.LivestockActions.updateLivestockPanel;

    window.SceneApp.setLivestockAutoTickEnabled = window.LivestockActions.setLivestockAutoTickEnabled;

    window.SceneApp.isLivestockAutoTickEnabled = window.LivestockActions.isLivestockAutoTickEnabled;

    window.SceneApp.addLivestockProficiency = LivestockState.addLivestockProficiency;

    window.SceneApp.ensureLifeAnimalHusbandrySkillEntry = LivestockState.ensureLifeAnimalHusbandrySkillEntry;

    window.SceneApp.openHideoutWarehousePanel = window.WarehouseActions.openHideoutWarehousePanel;

    window.SceneApp.closeHideoutWarehousePanel = window.WarehouseActions.closeHideoutWarehousePanel;

    window.SceneApp.updateAgriculturePanel = window.AgricultureActions.updateAgriculturePanel;

    window.SceneApp.isAgricultureAutoTickEnabled = window.AgricultureActions.isAgricultureAutoTickEnabled;

    window.SceneApp.setAgricultureAutoTickEnabled = window.AgricultureActions.setAgricultureAutoTickEnabled;

    window.SceneApp.getWorldTotalTicks = window.WorldTick.getWorldTotalTicks;

    window.SceneApp.getAgricultureMapState = window.AgricultureActions.getAgricultureMapState;

    window.SceneApp.getAgricultureMapStateMutable = window.AgricultureActions.getAgricultureMapStateMutable;

    window.SceneApp.setAgricultureMapState = window.AgricultureActions.setAgricultureMapState;

    window.SceneApp.tryAgricultureAction = window.AgricultureActions.tryAgricultureAction;

    window.SceneApp.getAgriculturePlantOptions = window.AgricultureActions.getAgriculturePlantOptions;

    window.SceneApp.getAgricultureSoilAmendmentOptions = window.AgricultureActions.getAgricultureSoilAmendmentOptions;

    window.SceneApp.getAgricultureInjectables = window.AgricultureActions.getAgricultureInjectables;

    window.SceneApp.payBuildCost = window.AgricultureActions.payAgricultureBuildCost;

    window.SceneApp.isAgricultureUnlocked = window.AgricultureActions.isAgricultureUnlocked;

    window.SceneApp.unlockAgriculture = window.AgricultureActions.unlockAgriculture;

    window.SceneApp.isCookingStationPanelBlockedByRepair = StationContext.isCookingUiBlockedByRepair;

    window.SceneApp.isPharmacyStationPanelBlockedByRepair = StationContext.isPharmacyUiBlockedByRepair;

    window.SceneApp.resetCookingStateForNewCharacter = window.StationActions.resetCookingStateForNewCharacter;

    window.SceneApp.getKnownCookingRecipeIds = window.StationActions.getKnownCookingRecipeIds;

    window.SceneApp.getCookingStationAccessories = window.StationActions.getCookingStationAccessories;

    window.SceneApp.getKnownPharmacyRecipeIds = window.StationActions.getKnownPharmacyRecipeIds;

    window.SceneApp.setCookingStationAccessories = window.StationActions.setCookingStationAccessories;

    window.SceneApp.placeTempCookingStation = window.StationActions.placeTempCookingStation;

    window.SceneApp.removeTempCookingStation = window.StationActions.removeTempCookingStation;

    window.SceneApp.buildItemTooltipHtml = SceneUi.buildItemTooltipHtml;

    window.SceneApp.buildItemTooltipHtmlForTemplate = SceneUi.buildItemTooltipHtmlForTemplate;

    window.SceneApp.formatItemAttributes = SceneUi.formatItemAttributes;

    window.SceneApp.showItemTooltip = SceneUi.showItemTooltip;

    window.SceneApp.hideItemTooltip = SceneUi.hideItemTooltip;

    window.SceneApp.executeQuickBarPinnedSlot = window.PlayerActions.executeQuickBarPinnedSlot;

    window.SceneApp.getQuickBarPinLabel = window.PlayerActions.getQuickBarPinLabel;

    window.SceneApp.clearQuickBarPinSlot = window.PlayerActions.clearQuickBarPinSlot;

    // Standalone loadout commands also work without the other panel migrations.
    window.SceneApp.combatApi = window.CombatPanel.legacyCombatApi();

    // P3: commands keep the original game rules; Svelte owns all five panel subtrees.
    window.SceneApp.panelApi = window.SceneNavigation.legacyPanelApi();

    // ── 调试直达：URL ?panel=xxx（可加 &tab=）在游戏就绪后自动打开对应面板 ──
    // 供开发预览（better-sidebar 浏览器 / agent 验证）直接跳到指定 UI，无需手动导航。
    window.SceneApp.openBackpackPanel = window.InventoryPanel.openBackpackPanel;

    window.SceneApp.openEquipmentPanel = window.InventoryPanel.openEquipmentPanel;

    window.SceneApp.openGroundItems = window.InventoryPanel.openGroundItems;

    window.SceneApp.closeGroundBackpackView = window.InventoryPanel.closeGroundBackpackView;

    window.SceneApp.openBaseWarehousePanel = window.WarehouseActions.openBaseWarehousePanel;

    window.SceneApp.openSavePanel = window.SavePanel.openSavePanel;

    window.SceneApp.openCombatPanel = window.CombatPanel.openCombatPanel;

    window.SceneApp.openSurvivalPanel = window.SkillOverview.openSurvivalPanel;

    window.SceneApp.openUiWindowsMenu = window.SceneWindows.openUiWindowsMenu;

    window.SceneApp.debugPanelOpeners = window.SceneDebug.legacyDebugPanelOpeners();

    window.SceneApp.debugOpenPanel = window.SceneDebug.debugOpenPanel;
    }

    window.ScenePublicApi = {
        initialize: initialize,
        bind: bind
    };
})(window);
