/**
 * SceneNavigation — 公共界面导航.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var E = window.GameEngine;

    function closePublicModal(id) {
        var close = { 'modal-muscles':window.MusclePanel.close, 'modal-backpack':window.InventoryPanel.closeBackpackPanel, 'modal-combat':window.CombatPanel.closeCombatPanel, 'modal-survival':window.SkillOverview.closeSurvivalPanel, 'modal-save':window.SavePanel.closeSavePanel,
            'modal-base-warehouse':window.WarehouseActions.closeBaseWarehousePanel, 'modal-hideout-warehouse':window.WarehouseActions.closeHideoutWarehousePanel, 'modal-agriculture':window.AgricultureActions.closeAgriculturePanel,
            'modal-livestock':window.LivestockActions.closeLivestockPanel, 'modal-cooking-station':CookingStationPanel.close, 'modal-pharmacy-station':PharmacyStationPanel.close, 'modal-compost-station':CompostPanel.close }[id];
        if (close) close();
    }

    function navigate(id, button) {
        if (id === 'muscles') { window.MusclePanel.toggle(); return; }
        if (id === 'backpack') { if (window.InventoryPanel.backpackPanelOpen && !window.BackpackPanel.isEquipment()) window.InventoryPanel.closeBackpackPanel(); else { window.BackpackPanel.equipped(); if(window.InventoryPanel.backpackPanelOpen)window.InventoryPanel.updateBackpackPanel();else window.InventoryPanel.openBackpackPanel(); } }
        else if (id === 'equipment') { if (window.InventoryPanel.backpackPanelOpen) window.InventoryPanel.closeBackpackPanel(); else window.InventoryPanel.openEquipmentPanel(); }
        else if (id === 'combat') { if (window.CombatPanel.combatPanelOpen) window.CombatPanel.closeCombatPanel(); else window.CombatPanel.openCombatPanel(); }
        else if (id === 'survival') { if (window.SkillOverview.survivalPanelOpen) window.SkillOverview.closeSurvivalPanel(); else window.SkillOverview.openSurvivalPanel(); }
        else if (id === 'save') { if (window.SavePanel.savePanelOpen) window.SavePanel.closeSavePanel(); else window.SavePanel.openSavePanel(); }
        else if (id === 'reset-demo-save') window.SavePanel.requestResetProgress(button);
    }

    function legacyPanelApi() { return {
        backpackState: window.InventoryPanel.backpackUIState, combatState: window.CombatPanel.combatUIState,
        equipGroups: window.InventoryPanel.EQUIP_SLOT_GROUPS, equipLabels: window.InventoryPanel.EQUIP_SLOT_LABELS,
        bodyParts: window.SceneStatusPanel.BODY_PART_IDS, bodyLabels: window.SceneStatusPanel.BODY_PART_LABELS, lifeSkills: window.SkillOverview.LIFE_SKILL_TABLE,
        getOpen: function (key) { return {backpack:window.InventoryPanel.backpackPanelOpen,combat:window.CombatPanel.combatPanelOpen,survival:window.SkillOverview.survivalPanelOpen,save:window.SavePanel.savePanelOpen,warehouse:window.WarehouseActions.baseWarehousePanelOpen}[key]; },
        getSkillTab: function () { return window.SkillOverview.currentSkillOverviewTab; },
        setSkillTab: function (tab) { if (['survival','life','special'].indexOf(tab)<0) return; window.SkillOverview.currentSkillOverviewTab=tab; window.SkillOverview.renderSurvivalModal(); },
        close: function (key) { ({backpack:window.InventoryPanel.closeBackpackPanel,combat:window.CombatPanel.closeCombatPanel,survival:window.SkillOverview.closeSurvivalPanel,save:window.SavePanel.closeSavePanel,warehouse:window.WarehouseActions.closeBaseWarehousePanel})[key](); },
        message: window.SceneFeedback.showMsg, position: function () { return E.getState(); },
        changed: function () { var pos=E.getState(); window.SceneMapView.markCellDirty(pos.mapId,pos.x,pos.y); window.InventoryPanel.updateBackpackPanel(); window.SceneMapView.render(); },
        use: window.ItemUseActions.tryUseItemFromContainer, takeWarehouse: window.WarehouseActions.takeFromBaseWarehouse,
        deploy: window.CombatPanel.handleDeployCombat, debugCombat: window.SceneDebug.debugCombatPlus50, setCombat: window.CombatPanel.safeSetCombatState,
        skillName: window.CombatSelection.getCombatSkillName, recipeReport: window.SceneDebug.getRecipeSchemaValidationReport,
        addSkill: window.SkillOverview.addSkillLevelGeneric,
        imported: function () { window.SceneCharacter.hideCreationOverlay(); window.SceneCharacter.updateRoleNameFromCharacter(); window.SavePanel.closeSavePanel(); window.SceneMapView.render(); }
    }; }

    function initialize() {

    }

    function bind() {

    }

    window.SceneNavigation = {
        initialize: initialize,
        bind: bind,
        closePublicModal: closePublicModal,
        legacyPanelApi: legacyPanelApi,
        navigate: navigate
    };
})(window);
