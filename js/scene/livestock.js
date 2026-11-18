/**
 * LivestockActions — 畜牧世界推进与面板会话.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var IE = window.InventoryEquipment;
    var livestockPanelOpen, livestockPanelInited, livestockAutoTickTimer;

    function isLivestockAutoTickEnabled() {
        return !!(window.SceneCtx && window.SceneCtx.livestock_auto_tick === true);
    }

    function setLivestockAutoTickEnabled(enabled) {
        if (window.SceneCtx) window.SceneCtx.livestock_auto_tick = !!enabled;
        if (window.LivestockPanel && typeof window.LivestockPanel.syncAutoTickToggle === 'function') {
            try { window.LivestockPanel.syncAutoTickToggle(!!enabled); } catch (eSync) { /* ignore */ }
        }
        if (enabled) startLivestockAutoTickIfNeeded();
        else stopLivestockAutoTick();
    }

    function stopLivestockAutoTick() {
        if (!livestockAutoTickTimer) return;
        try { clearInterval(livestockAutoTickTimer); } catch (eClr) { /* ignore */ }
        livestockAutoTickTimer = null;
    }

    function startLivestockAutoTickIfNeeded() {
        if (!isLivestockAutoTickEnabled() || !livestockPanelOpen) return;
        if (livestockAutoTickTimer) return;
        livestockAutoTickTimer = setInterval(onLivestockAutoTick, window.PlayerActions.getIdleTickMs());
    }

    function onLivestockAutoTick() {
        if (livestockPanelOpen && !window.AgricultureActions.canUseOutdoorFacility('livestock')) { closeLivestockPanel(); return; }
        if (!livestockPanelOpen || !isLivestockAutoTickEnabled()) {
            stopLivestockAutoTick();
            return;
        }
        var Surv = window.Survival;
        if (!Surv || typeof Surv.advanceTick !== 'function') return;
        try { Surv.advanceTick({source:'livestock_watch'}); } catch (eTick) { /* ignore */ }
    }

    function maintainZone(zoneId, kind) {
        var cleaning = kind === 'clean';
        var ticks = cleaning ? 5 : 10;
        var S = window.Survival, L = window.LivestockState;
        function canContinue() {
            return livestockPanelOpen && !S.isComa() && S.canPerformStaminaOrEnergyAction() &&
                window.AgricultureActions.canUseOutdoorFacility('livestock') && window.SceneApp.canWorkFacilityLabor();
        }
        if (!cleaning && kind !== 'till' || !canContinue()) return {ok:false, reason:'action_blocked'};
        var zone = L.getState().zones[zoneId];
        if (!zone || !(zone[cleaning ? 'pollution' : 'compaction'] > 0)) return {ok:false, reason:'nothing_to_do'};
        window.PlayerActions.prepareFacilityAction();
        var saved = window.SaveSystem.runAtomicFor('facility', function () {
            for (var i=0; i<ticks; i++) {
                if (!canContinue()) return {ok:false, reason:'interrupted'};
                var before = S.getState().tickCount;
                S.advanceTick({source:'livestock', intensity:cleaning ? 'medium' : 'high'});
                if (S.getState().tickCount !== before+1 || !canContinue()) return {ok:false, reason:'interrupted'};
            }
            return cleaning ? L.cleanZone(zoneId,10) : L.tillZone(zoneId,10);
        });
        return saved.saved ? saved.value : {ok:false, reason:'save_failed'};
    }

    function openLivestockPanel() {
        if (!window.AgricultureActions.canUseOutdoorFacility('livestock')) return;
        if (window.Hunting && window.Hunting.isActive()) return;
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return;
        }
        if (window.SceneAccess.guardPlayerComaBlocked()) return;
        if (livestockPanelOpen) return;
        if (window.FacilityLabor && !window.FacilityLabor.isUnlocked('livestock')) {
            if (window.SceneApp.prepareFacilityLabor()) window.FacilityLaborPanel.open('livestock');
            return;
        }
        LivestockState.ensureLifeAnimalHusbandrySkillEntry();
        livestockPanelOpen = true;
        var modal = document.getElementById('modal-livestock');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }
        if (window.LivestockState) window.LivestockState.ensureState();
        if (window.LivestockPanel) {
            if (!livestockPanelInited && typeof window.LivestockPanel.init === 'function') {
                try { window.LivestockPanel.init(); } catch (eInit) { /* ignore */ }
                livestockPanelInited = true;
            }
            if (typeof window.LivestockPanel.render === 'function') {
                try { window.LivestockPanel.render(); } catch (eRender) { /* ignore */ }
            }
            if (typeof window.LivestockPanel.syncAutoTickToggle === 'function') {
                try { window.LivestockPanel.syncAutoTickToggle(isLivestockAutoTickEnabled()); } catch (eSync) { /* ignore */ }
            }
        }
        startLivestockAutoTickIfNeeded();
        if (window.HuntingPanel) window.HuntingPanel.renderAdmission();
        window.SceneMapView.render();
    }

    function closeLivestockPanel() {
        if (!livestockPanelOpen) return;
        stopLivestockAutoTick();
        livestockPanelOpen = false;
        var modal = document.getElementById('modal-livestock');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        window.SceneMapView.render();
    }

    function updateLivestockPanel() {
        if (!livestockPanelOpen) return;
        if (window.LivestockPanel && typeof window.LivestockPanel.render === 'function') {
            try { window.LivestockPanel.render(); } catch (eUpLs) { /* ignore */ }
        }
        if (window.HuntingPanel) window.HuntingPanel.renderAdmission();
    }

    function tickLivestockAfterWorldTick() {
        if (window.FacilityLabor && !window.FacilityLabor.isUnlocked('livestock')) return;
        if (window.LivestockState && typeof window.LivestockState.advanceTick === 'function') {
            try { window.LivestockState.advanceTick(); } catch (eLsTick) { /* ignore */ }
        }
        // 手动采集臂自动产出 → 发背包（§11.4；自动采集/自动清尸不给经验）
        try {
            if (window.LivestockState && typeof window.LivestockState.drainAutoCollectItems === 'function') {
                var pending = window.LivestockState.drainAutoCollectItems();
                if (pending && pending.length) {
                    var placedItems = 0, droppedItems = 0;
                    pending.forEach(function (pit) {
                        if (!pit || !pit.item_id) return;
                        var inst = { item_id: pit.item_id, count: Math.max(1, Math.floor(pit.count) || 1) };
                        if (IE && typeof IE.putItemIntoDefaultContainer === 'function') {
                            var pr = IE.putItemIntoDefaultContainer(inst);
                            if (pr && pr.placed) {
                                placedItems++;
                            } else {
                                var E = window.GameEngine;
                                var gpos = E && typeof E.getState === 'function' ? E.getState() : null;
                                if (gpos && typeof IE.addItemToGround === 'function') {
                                    IE.addItemToGround(gpos.mapId, gpos.x, gpos.y, inst);
                                    droppedItems++;
                                }
                            }
                        }
                    });
                    if (placedItems > 0 || droppedItems > 0) {
                        var logTxt = window.SceneFeedback.ui('scene.gather_arm.auto_result', { n: placedItems, extra: droppedItems > 0 ? window.SceneFeedback.ui('scene.gather_arm.dropped', { n: droppedItems }) : '' });
                        if (window.GameLog && typeof window.GameLog.log === 'function') {
                            window.GameLog.log(logTxt, 'info');
                        }
                    }
                }
            }
        } catch (eAuto) { /* ignore */ }
        if (livestockPanelOpen) updateLivestockPanel();
    }

    function initialize() {
        livestockPanelOpen = false;
        livestockPanelInited = false;
        livestockAutoTickTimer = null;
    }

    function bind() {

    }

    window.LivestockActions = {
        maintainZone: maintainZone,
        initialize: initialize,
        bind: bind,
        closeLivestockPanel: closeLivestockPanel,
        isLivestockAutoTickEnabled: isLivestockAutoTickEnabled,
        get livestockPanelOpen() { return livestockPanelOpen; },
        openLivestockPanel: openLivestockPanel,
        setLivestockAutoTickEnabled: setLivestockAutoTickEnabled,
        stopLivestockAutoTick: stopLivestockAutoTick,
        tickLivestockAfterWorldTick: tickLivestockAfterWorldTick,
        updateLivestockPanel: updateLivestockPanel
    };
})(window);
