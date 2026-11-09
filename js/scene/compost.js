/**
 * CompostBindings — 制肥面板的原生交互绑定.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var IE = window.InventoryEquipment;

    function initialize() {

    }

    function bind() {

    (function bindCompostStationPanel() {
        var tabA = document.getElementById('compost-tab-aerobic');
        var tabN = document.getElementById('compost-tab-anaerobic');
        if (tabA) tabA.addEventListener('click', function () { CompostPanel.uiState.mode = 'aerobic'; CompostPanel.render(); });
        if (tabN) tabN.addEventListener('click', function () { CompostPanel.uiState.mode = 'anaerobic'; CompostPanel.render(); });
        var closeBtn = document.getElementById('compost-station-close');
        if (closeBtn) closeBtn.addEventListener('click', CompostPanel.close);

        var startBtn = document.getElementById('compost-start-btn');
        if (startBtn) startBtn.addEventListener('click', function () {
            if (!CompostPanel.hasCompostInteractionContext() || !window.CompostSystem) return;
            var mode = CompostPanel.uiState.mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
            var startGuard = CompostPanel.getCompostStartGuardState(mode, null);
            if (!startGuard.canStart) {
                CompostPanel.showCompostStartBlockedHint(startGuard.reason);
                return;
            }
            var mats = {};
            for (var i = 0; i < CompostPanel.uiState.staged_inputs.length; i++) {
                var id = String(CompostPanel.uiState.staged_inputs[i] || '');
                if (!id) continue;
                mats[id] = (mats[id] || 0) + 1;
            }
            var list = [];
            var keys = Object.keys(mats);
            for (var k = 0; k < keys.length; k++) {
                var iid = keys[k];
                var cnt = mats[iid];
                list.push({ item_id: iid, count: cnt });
            }
            var totals = window.CompostSystem && typeof window.CompostSystem.computeCnTotalsFromInputItems === 'function'
                ? window.CompostSystem.computeCnTotalsFromInputItems(list, {
                    getTemplate: function (itemId) {
                        return IE && typeof IE.getItemTemplate === 'function' ? IE.getItemTemplate(itemId) : null;
                    }
                })
                : { c_total: 0, n_total: 0 };
            var payInputs = StationCraftCore.consumeInventoryItemsByList(list);
            if (!payInputs.ok) {
                CompostPanel.showCompostStartBlockedHint('insufficient_inputs');
                return;
            }
            var inoculantId = String(CompostPanel.uiState.staged_inoculant_item_id || '');
            var inocPay = null;
            if (inoculantId) {
                inocPay = StationCraftCore.consumeInventoryItemsByList([{ item_id: inoculantId, count: 1 }]);
                if (!inocPay.ok) {
                    var HWundo = window.HideoutWarehouse;
                    if (HWundo && typeof HWundo.refundConsumed === 'function' && payInputs.rawConsumed) {
                        HWundo.refundConsumed(payInputs.rawConsumed);
                    } else if (payInputs.consumed && payInputs.consumed.length) {
                        StationCraftCore.putItemsBack(payInputs.consumed);
                    }
                    CompostPanel.showCompostStartBlockedHint('inoculant_missing_inventory');
                    return;
                }
            }
            var ret = window.CompostSystem.startBatch(mode, {
                materials: list,
                c_total: totals.c_total,
                n_total: totals.n_total,
                inoculant_item_id: inoculantId || null
            });
            if (!ret || ret.ok !== true) {
                var HWref = window.HideoutWarehouse;
                if (HWref && typeof HWref.refundConsumed === 'function' && payInputs.rawConsumed) {
                    HWref.refundConsumed(payInputs.rawConsumed);
                } else if (payInputs.consumed && payInputs.consumed.length) {
                    StationCraftCore.putItemsBack(payInputs.consumed);
                }
                if (inocPay) {
                    if (HWref && typeof HWref.refundConsumed === 'function' && inocPay.rawConsumed) {
                        HWref.refundConsumed(inocPay.rawConsumed);
                    } else if (inocPay.consumed && inocPay.consumed.length) {
                        StationCraftCore.putItemsBack(inocPay.consumed);
                    }
                }
                CompostPanel.showCompostStartBlockedHint(ret && ret.reason ? ret.reason : 'slot_not_ready');
                return;
            }
            CompostPanel.uiState.staged_inputs = [];
            CompostPanel.uiState.staged_inoculant_item_id = '';
            CompostPanel.pushCompostLog(window.SceneFeedback.ui('compost.log.started', { mode: mode === 'anaerobic' ? window.SceneFeedback.ui('compost.tab.anaerobic') : window.SceneFeedback.ui('compost.tab.aerobic') }));
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('compost.start.ok'), 'success');
            CompostPanel.render();
            if (typeof window.InventoryPanel.updateBackpackPanel === 'function') window.InventoryPanel.updateBackpackPanel();
            if (window.SceneRenderer) window.SceneRenderer.render();
        });

        var stopBtn = document.getElementById('compost-stop-btn');
        if (stopBtn) stopBtn.addEventListener('click', function () {
            if (!CompostPanel.isOpen() || !window.CompostSystem || typeof window.CompostSystem.forceTerminate !== 'function') return;
            var mode = CompostPanel.uiState.mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
            var ret = window.CompostSystem.forceTerminate(mode, 'forced_by_player');
            if (ret && ret.ok) CompostPanel.pushCompostLog(window.SceneFeedback.ui('compost.log.stopped'));
            CompostPanel.render();
        });

        function interactWithWindow(slotKey) {
            if (!CompostPanel.hasCompostInteractionContext() || !window.CompostSystem || typeof window.CompostSystem.interact !== 'function') return;
            var mode = CompostPanel.uiState.mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
            var batch = window.CompostSystem.getBatch(mode);
            if (!batch || batch.status !== 'FERMENTING' || Number(batch.pending_window_index) < 0) return;
            var actionId = String(CompostPanel.windowActionSlots[slotKey] || '');
            if (!actionId) return;
            var ret = window.CompostSystem.interact(mode, actionId, { advance_world_tick: true });
            if (ret && ret.ok) {
                if (!ret.feedback_text) CompostPanel.pushCompostLog(window.SceneFeedback.ui(ret.success ? 'compost.log.interact_ok' : 'compost.log.interact_fail'));
                if (window.Survival && typeof window.Survival.addDirtyness === 'function') {
                    window.Survival.addDirtyness(10);
                }
            }
            CompostPanel.render();
        }

        var bestBtn = document.getElementById('compost-interact-best-btn');
        if (bestBtn) bestBtn.addEventListener('click', function () { interactWithWindow('best'); });
        var midBtn = document.getElementById('compost-interact-mid-btn');
        if (midBtn) midBtn.addEventListener('click', function () { interactWithWindow('mid'); });
        var altBtn = document.getElementById('compost-interact-alt-btn');
        if (altBtn) altBtn.addEventListener('click', function () { interactWithWindow('alt'); });

        var collectBtn = document.getElementById('compost-collect-btn');
        if (collectBtn) collectBtn.addEventListener('click', function () {
            if (!CompostPanel.hasCompostInteractionContext()) {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('compost.collect.require_station_context'), 'warn');
                return;
            }
            var mode = CompostPanel.uiState.mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
            var ret = CompostPanel.tryCollectCompostToInventory(mode);
            if (!ret || !ret.ok) {
                if (ret && ret.reason === 'inventory_full') {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('compost.collect.inventory_full'), 'warn');
                }
                return;
            }
            CompostPanel.pushCompostLog(window.SceneFeedback.ui('compost.log.collected', { item: StationCraftCore.getItemDisplayNameSafe(ret.item_id), count: ret.collected }));
            if (ret.partial) window.SceneFeedback.showMsg(window.SceneFeedback.ui('compost.collect.partial_left', { left: ret.remaining_in_batch }), 'info');
            CompostPanel.render();
            if (typeof window.InventoryPanel.updateBackpackPanel === 'function') window.InventoryPanel.updateBackpackPanel();
            if (window.SceneRenderer) window.SceneRenderer.render();
        });

        var discardBtn = document.getElementById('compost-discard-btn');
        if (discardBtn) discardBtn.addEventListener('click', function () {
            if (!CompostPanel.hasCompostInteractionContext() || !window.CompostSystem || typeof window.CompostSystem.discard !== 'function') {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('compost.collect.require_station_context'), 'warn');
                return;
            }
            var mode = CompostPanel.uiState.mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
            var ret = window.CompostSystem.discard(mode);
            if (ret && ret.ok) CompostPanel.pushCompostLog(window.SceneFeedback.ui('compost.log.discarded'));
            CompostPanel.render();
        });
    })();
    }

    window.CompostBindings = {
        initialize: initialize,
        bind: bind
    };
})(window);
